// src/routes/reports.js
const express = require('express');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { suggestCharges, checkElements, getUserPoliciesAndCaseLaw } = require('../services/ai');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Create new report
router.post('/', (req, res) => {
  try {
    const { report_type, title } = req.body;
    const userId = req.user.userId;

    if (!report_type || !['incident', 'arrest', 'supplemental'].includes(report_type)) {
      return res.status(400).json({ error: 'Valid report_type required (incident, arrest, supplemental)' });
    }

    const result = db.prepare(
      'INSERT INTO reports (user_id, report_type, title) VALUES (?, ?, ?)'
    ).run(userId, report_type, title || `New ${report_type} report`);

    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json(report);
  } catch (error) {
    console.error('Create report error:', error.message);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

// Get all reports for user
router.get('/', (req, res) => {
  try {
    const userId = req.user.userId;
    const { status } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);

    if (page < 1 || limit < 1) {
      return res.status(400).json({ error: 'page and limit must be positive integers' });
    }

    const offset = (page - 1) * limit;

    let countQuery = 'SELECT COUNT(*) as total FROM reports WHERE user_id = ?';
    let query = 'SELECT * FROM reports WHERE user_id = ?';
    const params = [userId];

    if (status) {
      countQuery += ' AND status = ?';
      query += ' AND status = ?';
      params.push(status);
    }

    const { total } = db.prepare(countQuery).get(...params);

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    const reports = db.prepare(query).all(...params, limit, offset);

    res.json({ reports, total, page, limit });
  } catch (error) {
    console.error('Get reports error:', error.message);
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

// Get single report
router.get('/:id', (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;

    const report = db.prepare(
      'SELECT * FROM reports WHERE id = ? AND user_id = ?'
    ).get(reportId, userId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Get legal references
    const references = db.prepare(
      'SELECT * FROM legal_references WHERE report_id = ?'
    ).all(reportId);

    res.json({ ...report, legal_references: references });
  } catch (error) {
    console.error('Get report error:', error.message);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// Update report
router.put('/:id', (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;
    const { transcript, generated_content, final_content, status, title, case_number } = req.body;

    // Verify ownership
    const existing = db.prepare(
      'SELECT id FROM reports WHERE id = ? AND user_id = ?'
    ).get(reportId, userId);

    if (!existing) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const updates = [];
    const params = [];

    // Validate status if provided
    if (status !== undefined && !['draft', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be draft or completed' });
    }

    // Validate input lengths
    if (title !== undefined && title.length > 200) {
      return res.status(400).json({ error: 'Title must be 200 characters or less' });
    }
    if (transcript !== undefined && transcript.length > 50000) {
      return res.status(400).json({ error: 'Transcript must be 50,000 characters or less' });
    }
    if (case_number !== undefined && case_number.length > 50) {
      return res.status(400).json({ error: 'Case number must be 50 characters or less' });
    }
    if (generated_content !== undefined && generated_content.length > 100000) {
      return res.status(400).json({ error: 'Generated content must be 100,000 characters or less' });
    }
    if (final_content !== undefined && final_content.length > 100000) {
      return res.status(400).json({ error: 'Final content must be 100,000 characters or less' });
    }

    if (transcript !== undefined) { updates.push('transcript = ?'); params.push(transcript); }
    if (generated_content !== undefined) { updates.push('generated_content = ?'); params.push(generated_content); }
    if (final_content !== undefined) { updates.push('final_content = ?'); params.push(final_content); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (case_number !== undefined) { updates.push('case_number = ?'); params.push(case_number); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(reportId);

    db.prepare(`UPDATE reports SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
    res.json(report);
  } catch (error) {
    console.error('Update report error:', error.message);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// Delete report
router.delete('/:id', (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;

    const result = db.prepare(
      'DELETE FROM reports WHERE id = ? AND user_id = ?'
    ).run(reportId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ message: 'Report deleted' });
  } catch (error) {
    console.error('Delete report error:', error.message);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Suggest charges based on report content
router.post('/:id/suggest-charges', async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;

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

    const result = await suggestCharges(content);
    res.json(result);
  } catch (error) {
    console.error('Suggest charges error:', error.message);
    res.status(500).json({ error: 'Failed to suggest charges' });
  }
});

// Check if report meets elements of specified charges
router.post('/:id/check-elements', async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;
    const { charges } = req.body;

    if (!charges || !Array.isArray(charges) || charges.length === 0) {
      return res.status(400).json({ error: 'charges array required' });
    }

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

    // Get user's policies and case law for context
    const legalData = getUserPoliciesAndCaseLaw(userId);

    const result = await checkElements(content, charges, legalData);
    res.json(result);
  } catch (error) {
    console.error('Check elements error:', error.message);
    res.status(500).json({ error: 'Failed to check elements' });
  }
});

module.exports = router;
