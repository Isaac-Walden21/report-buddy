const express = require('express');
const { getReport, updateReport } = require('../db/firestore');
const { generateReport, generateFollowUpQuestions, refineReport, generateTitle } = require('../services/ai');

const router = express.Router();
// authenticateToken + requireSubscription applied at app level in index.js

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
    const { report_id, transcript, incomplete } = req.body;

    if (!report_id || !transcript) {
      return res.status(400).json({ error: 'report_id and transcript required' });
    }
    if (transcript.length > 50000) {
      return res.status(400).json({ error: 'Transcript must be 50,000 characters or less' });
    }

    const report = await getReport(userId, report_id);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Generate report and title in parallel
    const [generatedContent, suggestedTitle] = await Promise.all([
      generateReport(userId, report.report_type, transcript, { incomplete: !!incomplete }),
      generateTitle(report.report_type, transcript)
    ]);

    // Update report with content and title
    await updateReport(userId, report_id, {
      transcript,
      generated_content: generatedContent,
      title: suggestedTitle
    });

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

    const report = await getReport(userId, report_id);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const currentContent = report.final_content || report.generated_content;
    if (!currentContent) {
      return res.status(400).json({ error: 'No report content to refine' });
    }

    const refinedContent = await refineReport(currentContent, refinement);

    // Update report — clear final_content so stale edits don't persist
    await updateReport(userId, report_id, {
      generated_content: refinedContent,
      final_content: null
    });

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
