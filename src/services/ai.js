// src/services/ai.js
const OpenAI = require('openai');
const db = require('../db/database');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Get user's style profile for report type
function getStyleProfile(userId, reportType) {
  const profile = db.prepare(
    'SELECT * FROM style_profiles WHERE user_id = ? AND report_type = ?'
  ).get(userId, reportType);

  const examples = db.prepare(
    'SELECT content FROM example_reports WHERE user_id = ? AND report_type = ? LIMIT 3'
  ).all(userId, reportType);

  return { profile, examples };
}

// Get user's policies and case law
function getUserPoliciesAndCaseLaw(userId) {
  const docs = db.prepare(
    'SELECT filename, content FROM policy_documents WHERE user_id = ?'
  ).all(userId);

  const policies = docs.filter(d => !d.filename.startsWith('[CASELAW]'));
  const caseLaw = docs.filter(d => d.filename.startsWith('[CASELAW]'));

  return { policies, caseLaw };
}

// Build system prompt based on user's style
function buildSystemPrompt(styleData, reportType, legalData) {
  const { profile, examples } = styleData;
  const { policies, caseLaw } = legalData || { policies: [], caseLaw: [] };

  let prompt = `You are an expert police report writing assistant. You help officers write clear, professional ${reportType} reports.

REPORT STYLE GUIDELINES:
- Voice: ${profile?.voice === 'third_person' ? 'Third person (Officer Smith observed...)' : 'First person (I observed...)'}
- Detail level: ${profile?.detail_level || 'medium'}
`;

  if (profile?.common_phrases) {
    try {
      const phrases = JSON.parse(profile.common_phrases);
      if (phrases.length > 0) {
        prompt += `- Preferred phrases: ${phrases.join(', ')}\n`;
      }
    } catch (e) {}
  }

  if (examples.length > 0) {
    prompt += `\nEXAMPLE REPORTS FOR STYLE REFERENCE:\n`;
    examples.forEach((ex, i) => {
      prompt += `\n--- Example ${i + 1} ---\n${ex.content}\n`;
    });
  }

  if (policies.length > 0) {
    prompt += `\nDEPARTMENT POLICIES TO REFERENCE:\n`;
    policies.forEach(p => {
      prompt += `\n--- ${p.filename} ---\n${p.content}\n`;
    });
    prompt += `\nWhen writing the report, ensure actions align with these policies. You may briefly note policy compliance where relevant.\n`;
  }

  if (caseLaw.length > 0) {
    prompt += `\nRELEVANT CASE LAW:\n`;
    caseLaw.forEach(c => {
      prompt += `\n--- ${c.filename.replace('[CASELAW] ', '')} ---\n${c.content}\n`;
    });
    prompt += `\nWhen actions involve legal justifications (searches, stops, use of force), you may reference applicable case law.\n`;
  }

  prompt += `
YOUR ROLE: You are a senior, well-versed Indiana police officer with extensive knowledge of:
- Indiana Code (IC) statutes and charges
- Indiana case law and legal precedents
- Department policies and procedures
- Proper report writing for court admissibility

FORMATTING RULES:
- Write in clear, factual prose - NO markdown, NO asterisks, NO special formatting
- Use precise times, dates, and locations
- Include relevant details but avoid unnecessary information
- Organize chronologically unless another structure makes more sense
- Use professional law enforcement terminology appropriately
- Plain text only - this will be copied into an RMS system

LEGAL CITATIONS:
- When describing criminal activity, cite the applicable Indiana Code (e.g., "IC 35-42-2-1 Battery")
- Include the offense level when known (e.g., "Level 6 Felony", "Class A Misdemeanor")
- Reference relevant case law when actions require legal justification (stops, searches, use of force)
- Ensure probable cause is clearly articulated with supporting IC references

OUTPUT: Generate a complete, professionally formatted ${reportType} report. Write in plain text suitable for direct copy into a police RMS. Cite applicable Indiana Code sections for all charges and criminal conduct described.`;

  return prompt;
}

// Generate report from transcript
async function generateReport(userId, reportType, transcript) {
  const styleData = getStyleProfile(userId, reportType);
  const legalData = getUserPoliciesAndCaseLaw(userId);
  const systemPrompt = buildSystemPrompt(styleData, reportType, legalData);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Here is my description of the incident. Please write a formal ${reportType} report:\n\n${transcript}` }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  return response.choices[0].message.content;
}

// Generate follow-up questions if transcript seems incomplete
async function generateFollowUpQuestions(reportType, transcript) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an experienced police sergeant reviewing an officer's verbal description before they write a ${reportType} report.

BE LENIENT. Officers know their job. Only ask about CRITICAL missing information that would make the report incomplete or embarrassing to submit.

DO NOT ask about:
- Minor details the officer can fill in (exact times, badge numbers, etc.)
- Standard procedures they obviously followed
- Things that can be inferred from context
- Formatting or structure concerns

ONLY ask if something major is genuinely unclear or missing, like:
${reportType === 'arrest' ? '- Who was arrested (if not mentioned at all)\n- What they were arrested for (if no charges mentioned)\n- Basic probable cause (if completely absent)' : ''}
${reportType === 'incident' ? '- What actually happened (if the narrative is too vague to understand)\n- General location (if completely missing)\n- How it was resolved (if unclear)' : ''}
${reportType === 'supplemental' ? '- What case this relates to (if unclear)\n- What new information is being added (if missing)' : ''}

Respond in JSON format.
If you can write a reasonable report from this description, respond: {"ready": true}
Only if something CRITICAL is missing, respond: {"ready": false, "questions": ["specific question"]}

Err on the side of "ready": true. Maximum 2 questions, only if truly necessary.`
      },
      { role: 'user', content: transcript }
    ],
    temperature: 0.2,
    max_tokens: 500,
    response_format: { type: 'json_object' }
  });

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch (parseError) {
    console.error('Failed to parse AI response:', response.choices[0].message.content?.substring(0, 200));
    throw new Error('AI returned an invalid response. Please try again.');
  }
}

// Refine report based on user feedback
async function refineReport(currentReport, refinementRequest) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a senior Indiana police officer editing a report based on feedback.

Make the requested changes while:
- Maintaining professional formatting and consistency
- Using plain text only (NO asterisks, NO markdown, NO special formatting)
- Citing applicable Indiana Code (IC) sections for any charges
- Ensuring legal justifications are properly documented

Return only the updated report in plain text.`
      },
      { role: 'user', content: `Current report:\n\n${currentReport}\n\nRequested changes: ${refinementRequest}` }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  return response.choices[0].message.content;
}

// Generate a concise title for the report
async function generateTitle(reportType, transcript) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You generate concise titles for police reports.

FORMAT: [Incident Type] - [Key Detail] - [Date if mentioned]

RULES:
- Maximum 50 characters
- Include location OR primary party name (whichever is more identifying)
- Use standard abbreviations: DV (domestic violence), TC (traffic collision), etc.
- No special characters or formatting
- If no date mentioned, omit that part

EXAMPLES:
- "DV Assault - 123 Oak St"
- "Traffic Stop / DUI - Smith, John"
- "Burglary Report - First National Bank"
- "Theft - Walmart #4521 - 01/20/26"

Respond with ONLY the title, nothing else.`
      },
      { role: 'user', content: `Report type: ${reportType}\n\nTranscript:\n${transcript}` }
    ],
    temperature: 0.2,
    max_tokens: 60
  });

  return response.choices[0].message.content.trim();
}

// Suggest likely charges based on the report narrative
async function suggestCharges(reportContent) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an experienced Indiana police officer. Based on the report narrative, suggest the most likely criminal charges.

Return JSON with this format:
{
  "charges": [
    {
      "charge": "Domestic Battery",
      "statute": "IC 35-42-2-1.3",
      "level": "Class A Misdemeanor",
      "confidence": "high"
    }
  ]
}

RULES:
- Only suggest charges clearly supported by the narrative
- Maximum 3 charges
- Include Indiana Code citation
- Confidence: "high" (elements clearly present), "medium" (likely but needs verification)
- If this appears to be a non-criminal incident report, return {"charges": []}

Focus on the primary charges, not lesser includeds.`
      },
      { role: 'user', content: reportContent }
    ],
    temperature: 0.2,
    max_tokens: 500,
    response_format: { type: 'json_object' }
  });

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch (parseError) {
    console.error('Failed to parse AI response:', response.choices[0].message.content?.substring(0, 200));
    throw new Error('AI returned an invalid response. Please try again.');
  }
}

// Check if report meets the elements of specified charges
async function checkElements(reportContent, charges, legalData) {
  const { policies, caseLaw } = legalData || { policies: [], caseLaw: [] };

  let contextPrompt = '';
  if (policies.length > 0) {
    contextPrompt += '\nDEPARTMENT POLICIES:\n';
    policies.forEach(p => {
      contextPrompt += `--- ${p.filename} ---\n${p.content}\n\n`;
    });
  }
  if (caseLaw.length > 0) {
    contextPrompt += '\nCASE LAW REFERENCES:\n';
    caseLaw.forEach(c => {
      contextPrompt += `--- ${c.filename.replace('[CASELAW] ', '')} ---\n${c.content}\n\n`;
    });
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an experienced Indiana police sergeant and legal advisor reviewing a report for court readiness.

For each charge provided, analyze whether the report narrative establishes the required statutory elements.
${contextPrompt}
Return JSON with this format:
{
  "analysis": [
    {
      "charge": "Domestic Battery - IC 35-42-2-1.3",
      "elements": [
        {
          "element": "Domestic or family relationship",
          "status": "met",
          "evidence": "Quote or paraphrase from report proving this element",
          "suggestion": null
        },
        {
          "element": "Knowing or intentional touching",
          "status": "weak",
          "evidence": "Partial evidence found",
          "suggestion": "Consider adding: witness statement about seeing the strike, or suspect admission"
        },
        {
          "element": "Rude, insolent, or angry manner",
          "status": "missing",
          "evidence": null,
          "suggestion": "Document victim's description of how the contact occurred, any statements from suspect showing intent"
        }
      ],
      "overall": "needs_work",
      "summary": "2 of 3 elements established. Add documentation of the manner of touching."
    }
  ]
}

STATUS VALUES:
- "met": Element clearly established with specific evidence
- "weak": Some evidence but could be challenged, needs strengthening
- "missing": Not documented in the report

OVERALL VALUES:
- "ready": All elements met
- "needs_work": Some elements weak or missing
- "insufficient": Major elements missing

Be specific about what evidence supports each element and what could strengthen weak areas.`
      },
      { role: 'user', content: `CHARGES TO VERIFY:\n${charges.join('\n')}\n\nREPORT CONTENT:\n${reportContent}` }
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

module.exports = {
  generateReport,
  generateFollowUpQuestions,
  refineReport,
  generateTitle,
  suggestCharges,
  checkElements,
  getUserPoliciesAndCaseLaw
};
