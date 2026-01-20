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

// Build system prompt based on user's style
function buildSystemPrompt(styleData, reportType) {
  const { profile, examples } = styleData;

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

  prompt += `
FORMATTING RULES:
- Write in clear, factual prose
- Use precise times, dates, and locations
- Include relevant details but avoid unnecessary information
- Organize chronologically unless another structure makes more sense
- Use professional law enforcement terminology appropriately

OUTPUT: Generate a complete, properly formatted ${reportType} report based on the officer's description.`;

  return prompt;
}

// Generate report from transcript
async function generateReport(userId, reportType, transcript) {
  const styleData = getStyleProfile(userId, reportType);
  const systemPrompt = buildSystemPrompt(styleData, reportType);

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
        content: `You are helping a police officer write a ${reportType} report. Review their description and identify any missing critical information.

For ${reportType} reports, essential elements typically include:
${reportType === 'arrest' ? '- Suspect identification (name, DOB, physical description)\n- Charges\n- Miranda warning given\n- Probable cause\n- Evidence collected\n- Booking information' : ''}
${reportType === 'incident' ? '- Date, time, location\n- Parties involved (victims, witnesses, subjects)\n- What happened (chronological)\n- Evidence or observations\n- Actions taken\n- Disposition' : ''}
${reportType === 'supplemental' ? '- Reference to original report/case number\n- New information or follow-up actions\n- Results of investigation\n- Updated status' : ''}

If the description is complete enough to write a report, respond with: {"ready": true}
If information is missing, respond with: {"ready": false, "questions": ["question1", "question2"]}

Keep questions concise and specific. Maximum 3 questions.`
      },
      { role: 'user', content: transcript }
    ],
    temperature: 0.2,
    max_tokens: 500,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(response.choices[0].message.content);
}

// Refine report based on user feedback
async function refineReport(currentReport, refinementRequest) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are editing a police report based on the officer\'s feedback. Make the requested changes while maintaining professional formatting and consistency. Return only the updated report.'
      },
      { role: 'user', content: `Current report:\n\n${currentReport}\n\nRequested changes: ${refinementRequest}` }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  return response.choices[0].message.content;
}

module.exports = {
  generateReport,
  generateFollowUpQuestions,
  refineReport
};
