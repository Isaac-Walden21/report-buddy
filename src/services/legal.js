// src/services/legal.js
const OpenAI = require('openai');
const db = require('../db/database');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Get user's uploaded policy documents
function getUserPolicies(userId) {
  return db.prepare(
    'SELECT filename, content FROM policy_documents WHERE user_id = ?'
  ).all(userId);
}

// Analyze report for legal validation
async function analyzeReport(userId, reportContent, reportType) {
  const policies = getUserPolicies(userId);

  const user = db.prepare('SELECT jurisdiction_state, jurisdiction_county FROM users WHERE id = ?').get(userId);
  const jurisdiction = user?.jurisdiction_state ? `${user.jurisdiction_state}${user.jurisdiction_county ? ', ' + user.jurisdiction_county : ''}` : 'general US';

  let policyContext = '';
  if (policies.length > 0) {
    policyContext = '\n\nDEPARTMENT POLICIES:\n' + policies.map(p => `--- ${p.filename} ---\n${p.content}`).join('\n\n');
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a legal assistant for law enforcement. Analyze police reports to:
1. Identify actions taken by the officer that are legally supported
2. Cite relevant case law (with accurate citations)
3. Reference department policy when applicable
4. Flag areas that may need clarification or additional documentation

Jurisdiction: ${jurisdiction}
${policyContext}

IMPORTANT: Only cite real, well-established case law. If unsure of exact citation, note that verification is recommended.

Respond in JSON format:
{
  "validations": [
    {
      "action": "description of officer action",
      "support": "legal basis",
      "case_law": "Case Name (Year) - brief relevance",
      "policy": "policy reference if applicable"
    }
  ],
  "clarifications": [
    {
      "issue": "what needs clarification",
      "reason": "why it matters legally",
      "suggestion": "how to address it"
    }
  ],
  "relevant_references": [
    {
      "title": "case or policy name",
      "citation": "full citation",
      "relevance": "why it applies"
    }
  ]
}`
      },
      { role: 'user', content: `Analyze this ${reportType} report:\n\n${reportContent}` }
    ],
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  });

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch (parseError) {
    console.error('Failed to parse AI response:', response.choices[0].message.content?.substring(0, 200));
    throw new Error('AI returned an invalid response. Please try again.');
  }
}

// Save legal references to database
function saveLegalReferences(reportId, analysis) {
  // Clear existing references
  db.prepare('DELETE FROM legal_references WHERE report_id = ?').run(reportId);

  const insert = db.prepare(
    'INSERT INTO legal_references (report_id, reference_type, title, citation, content, action_validated) VALUES (?, ?, ?, ?, ?, ?)'
  );

  // Save validations
  for (const v of analysis.validations || []) {
    insert.run(
      reportId,
      'validation',
      v.case_law || 'Policy Support',
      v.policy || '',
      v.support,
      v.action
    );
  }

  // Save clarifications
  for (const c of analysis.clarifications || []) {
    insert.run(
      reportId,
      'clarification',
      c.issue,
      '',
      JSON.stringify({ reason: c.reason, suggestion: c.suggestion }),
      ''
    );
  }

  // Save relevant references
  for (const r of analysis.relevant_references || []) {
    insert.run(
      reportId,
      'case_law',
      r.title,
      r.citation,
      r.relevance,
      ''
    );
  }
}

module.exports = {
  analyzeReport,
  saveLegalReferences
};
