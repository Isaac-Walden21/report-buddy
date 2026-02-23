const express = require('express');
const router = express.Router();
const {
  getReport,
  createCourtPrepSession,
  getCourtPrepSession,
  updateCourtPrepSession,
  addCourtPrepMessage,
  getCourtPrepMessages,
  getPoliciesAndCaseLaw
} = require('../db/firestore');
const {
  analyzeVulnerabilities,
  generateCrossExamResponse,
  generateDebrief,
  summarizeEarlyMessages
} = require('../services/court-prep');

// POST /court-prep/start — Start a new court prep session
router.post('/start', async (req, res) => {
  try {
    const { report_id } = req.body;
    if (!report_id) {
      return res.status(400).json({ error: 'report_id is required' });
    }

    const report = await getReport(req.user.userId, report_id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const reportContent = report.final_content || report.generated_content;
    if (!reportContent) {
      return res.status(400).json({ error: 'Report has no content to analyze' });
    }

    // Create session
    const session = await createCourtPrepSession(req.user.userId, report_id);

    // Load legal context
    const legalData = await getPoliciesAndCaseLaw(req.user.userId);

    // Analyze vulnerabilities
    const vulnerabilityAssessment = await analyzeVulnerabilities(
      reportContent,
      report.report_type,
      legalData
    );

    // Update session with vulnerability assessment and set to active
    await updateCourtPrepSession(req.user.userId, report_id, session.id, {
      status: 'active',
      vulnerability_assessment: vulnerabilityAssessment
    });

    // Generate first cross-exam question
    const firstQuestion = await generateCrossExamResponse(
      reportContent,
      vulnerabilityAssessment,
      []
    );

    // Store the first assistant message
    await addCourtPrepMessage(req.user.userId, report_id, session.id, 'assistant', firstQuestion);
    await updateCourtPrepSession(req.user.userId, report_id, session.id, {
      message_count: 1
    });

    res.json({
      session_id: session.id,
      vulnerability_assessment: vulnerabilityAssessment,
      first_question: firstQuestion
    });
  } catch (error) {
    console.error('Court prep start error:', error.message);
    res.status(500).json({ error: 'Failed to start court prep session' });
  }
});

// POST /court-prep/message — Send a response during cross-examination
router.post('/message', async (req, res) => {
  try {
    const { report_id, session_id, message } = req.body;
    if (!report_id || !session_id || !message) {
      return res.status(400).json({ error: 'report_id, session_id, and message are required' });
    }

    // Validate message length
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
    }

    const session = await getCourtPrepSession(req.user.userId, report_id, session_id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.status !== 'active') {
      return res.status(400).json({ error: 'Session is not active' });
    }

    const report = await getReport(req.user.userId, report_id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const reportContent = report.final_content || report.generated_content;

    // Load conversation history
    const messages = await getCourtPrepMessages(req.user.userId, report_id, session_id);

    // Build conversation for API
    let conversationHistory = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Add the new user message
    conversationHistory.push({ role: 'user', content: message });

    // Context window management: summarize if over 30 messages
    if (conversationHistory.length > 30) {
      conversationHistory = summarizeEarlyMessages(conversationHistory);
    }

    // Store user message before AI call
    await addCourtPrepMessage(req.user.userId, report_id, session_id, 'user', message);

    // Generate response
    const response = await generateCrossExamResponse(
      reportContent,
      session.vulnerability_assessment,
      conversationHistory
    );

    // Store assistant response
    await addCourtPrepMessage(req.user.userId, report_id, session_id, 'assistant', response);

    // Increment message count
    await updateCourtPrepSession(req.user.userId, report_id, session_id, {
      message_count: (session.message_count || 0) + 2
    });

    res.json({ response });
  } catch (error) {
    console.error('Court prep message error:', error.message);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// POST /court-prep/debrief — Generate performance summary
router.post('/debrief', async (req, res) => {
  try {
    const { report_id, session_id } = req.body;
    if (!report_id || !session_id) {
      return res.status(400).json({ error: 'report_id and session_id are required' });
    }

    const session = await getCourtPrepSession(req.user.userId, report_id, session_id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Session already completed' });
    }

    const report = await getReport(req.user.userId, report_id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const reportContent = report.final_content || report.generated_content;

    // Load conversation history
    const messages = await getCourtPrepMessages(req.user.userId, report_id, session_id);
    const conversationHistory = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Generate debrief
    const debrief = await generateDebrief(
      reportContent,
      session.vulnerability_assessment,
      conversationHistory
    );

    // Update session
    await updateCourtPrepSession(req.user.userId, report_id, session_id, {
      status: 'completed',
      debrief
    });

    res.json({ debrief });
  } catch (error) {
    console.error('Court prep debrief error:', error.message);
    res.status(500).json({ error: 'Failed to generate debrief' });
  }
});

// POST /court-prep/end — End session without debrief
router.post('/end', async (req, res) => {
  try {
    const { report_id, session_id } = req.body;
    if (!report_id || !session_id) {
      return res.status(400).json({ error: 'report_id and session_id are required' });
    }

    const session = await getCourtPrepSession(req.user.userId, report_id, session_id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await updateCourtPrepSession(req.user.userId, report_id, session_id, {
      status: 'completed'
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Court prep end error:', error.message);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

module.exports = router;
