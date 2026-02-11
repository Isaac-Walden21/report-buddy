// src/routes/legal.js
const express = require('express');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { analyzeReport, saveLegalReferences } = require('../services/legal');

const router = express.Router();
router.use(authenticateToken);

// Analyze report for legal references
router.post('/analyze/:reportId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.reportId;

    const report = db.prepare(
      'SELECT * FROM reports WHERE id = ? AND user_id = ?'
    ).get(reportId, userId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const content = report.final_content || report.generated_content;
    if (!content) {
      return res.status(400).json({ error: 'No report content to analyze' });
    }

    const analysis = await analyzeReport(userId, content, report.report_type);
    saveLegalReferences(reportId, analysis);

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

    if (filename.length > 200) {
      return res.status(400).json({ error: 'Filename must be 200 characters or less' });
    }
    if (content.length > 100000) {
      return res.status(400).json({ error: 'Policy content must be 100,000 characters or less' });
    }

    const result = db.prepare(
      'INSERT INTO policy_documents (user_id, filename, content) VALUES (?, ?, ?)'
    ).run(userId, filename, content);

    res.status(201).json({
      id: result.lastInsertRowid,
      filename,
      message: 'Policy document uploaded'
    });
  } catch (error) {
    console.error('Policy upload error:', error.message);
    res.status(500).json({ error: 'Failed to upload policy' });
  }
});

// Get user's policy documents
router.get('/policies', (req, res) => {
  try {
    const userId = req.user.userId;
    const policies = db.prepare(
      'SELECT id, filename, created_at FROM policy_documents WHERE user_id = ?'
    ).all(userId);

    res.json(policies);
  } catch (error) {
    console.error('Get policies error:', error.message);
    res.status(500).json({ error: 'Failed to get policies' });
  }
});

// Delete policy document
router.delete('/policy/:id', (req, res) => {
  try {
    const userId = req.user.userId;
    const policyId = req.params.id;

    const result = db.prepare(
      'DELETE FROM policy_documents WHERE id = ? AND user_id = ?'
    ).run(policyId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    res.json({ message: 'Policy deleted' });
  } catch (error) {
    console.error('Delete policy error:', error.message);
    res.status(500).json({ error: 'Failed to delete policy' });
  }
});

module.exports = router;
