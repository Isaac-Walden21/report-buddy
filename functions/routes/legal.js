const express = require('express');
const { getReport, getPolicyDocuments, addPolicyDocument, deletePolicyDocument } = require('../db/firestore');
const { analyzeReport, saveLegalReferences } = require('../services/legal');

const router = express.Router();
// authenticateToken + requireSubscription applied at app level in index.js

// Analyze report for legal references
router.post('/analyze/:reportId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.reportId;

    const report = await getReport(userId, reportId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const content = report.final_content || report.generated_content;
    if (!content) {
      return res.status(400).json({ error: 'No report content to analyze' });
    }

    const analysis = await analyzeReport(userId, content, report.report_type);
    await saveLegalReferences(userId, reportId, analysis);

    res.json(analysis);
  } catch (error) {
    console.error('Legal analysis error:', error.message);
    res.status(500).json({ error: 'Failed to analyze report' });
  }
});

// Upload policy document
router.post('/policy', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { filename, content } = req.body;

    if (!filename || !content) {
      return res.status(400).json({ error: 'filename and content required' });
    }

    if (typeof filename !== 'string') {
      return res.status(400).json({ error: 'Filename must be a string' });
    }
    if (filename.length > 200) {
      return res.status(400).json({ error: 'Filename must be 200 characters or less' });
    }
    const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;
    if (UNSAFE_FILENAME_CHARS.test(filename)) {
      return res.status(400).json({ error: 'Filename contains invalid characters' });
    }
    if (content.length > 100000) {
      return res.status(400).json({ error: 'Policy content must be 100,000 characters or less' });
    }

    const doc = await addPolicyDocument(userId, filename, content, false);

    res.status(201).json({
      id: doc.id,
      filename,
      message: 'Policy document uploaded'
    });
  } catch (error) {
    console.error('Policy upload error:', error.message);
    res.status(500).json({ error: 'Failed to upload policy' });
  }
});

// Get user's policy documents
router.get('/policies', async (req, res) => {
  try {
    const userId = req.user.userId;
    const policies = await getPolicyDocuments(userId);

    res.json(policies);
  } catch (error) {
    console.error('Get policies error:', error.message);
    res.status(500).json({ error: 'Failed to get policies' });
  }
});

// Delete policy document
router.delete('/policy/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const policyId = req.params.id;

    const deleted = await deletePolicyDocument(userId, policyId);

    if (!deleted) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    res.json({ message: 'Policy deleted' });
  } catch (error) {
    console.error('Delete policy error:', error.message);
    res.status(500).json({ error: 'Failed to delete policy' });
  }
});

module.exports = router;
