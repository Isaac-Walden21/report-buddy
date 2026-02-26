// src/routes/generate.js
const express = require('express');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { generateReport, generateFollowUpQuestions, refineReport, generateTitle } = require('../services/ai');

const router = express.Router();
router.use(authenticateToken);

// Check transcript and get follow-up questions or confirm ready
router.post('/check', async (req, res) => {
  try {
    const { report_type, transcript } = req.body;

    if (!transcript || !report_type) {
      return res.status(400).json({ error: 'transcript and report_type required' });
    }
    if (transcript.length > 50000) {
      return res.status(400).json({ error: 'Transcript must be 50,000 characters or less' });
    }

    const result = await generateFollowUpQuestions(report_type, transcript);
    res.json(result);
  } catch (error) {
    console.error('Check transcript error:', error.message);
    res.status(500).json({ error: 'Failed to check transcript' });
  }
});

// Generate report from transcript
router.post('/report', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { report_id, transcript } = req.body;

    if (!report_id || !transcript) {
      return res.status(400).json({ error: 'report_id and transcript required' });
    }
    if (transcript.length > 50000) {
      return res.status(400).json({ error: 'Transcript must be 50,000 characters or less' });
    }

    // Get report
    const report = db.prepare(
      'SELECT * FROM reports WHERE id = ? AND user_id = ?'
    ).get(report_id, userId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Generate report and title in parallel
    const [generatedContent, suggestedTitle] = await Promise.all([
      generateReport(userId, report.report_type, transcript),
      generateTitle(report.report_type, transcript)
    ]);

    // Update report with content and title
    db.prepare(
      'UPDATE reports SET transcript = ?, generated_content = ?, title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(transcript, generatedContent, suggestedTitle, report_id);

    res.json({
      report_id,
      generated_content: generatedContent,
      suggested_title: suggestedTitle
    });
  } catch (error) {
    console.error('Generate report error:', error.message);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Refine existing report
router.post('/refine', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { report_id, refinement } = req.body;

    if (!report_id || !refinement) {
      return res.status(400).json({ error: 'report_id and refinement required' });
    }
    if (refinement.length > 10000) {
      return res.status(400).json({ error: 'Refinement must be 10,000 characters or less' });
    }

    const report = db.prepare(
      'SELECT * FROM reports WHERE id = ? AND user_id = ?'
    ).get(report_id, userId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const currentContent = report.final_content || report.generated_content;
    if (!currentContent) {
      return res.status(400).json({ error: 'No report content to refine' });
    }

    const refinedContent = await refineReport(currentContent, refinement);

    // Update report
    db.prepare(
      'UPDATE reports SET generated_content = ?, final_content = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(refinedContent, report_id);

    res.json({
      report_id,
      generated_content: refinedContent
    });
  } catch (error) {
    console.error('Refine report error:', error.message);
    res.status(500).json({ error: 'Failed to refine report' });
  }
});

module.exports = router;
