// src/routes/profile.js
const express = require('express');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Get user profile and style settings
router.get('/', (req, res) => {
  try {
    const userId = req.user.userId;

    const user = db.prepare(
      'SELECT id, email, name, jurisdiction_state, jurisdiction_county, created_at FROM users WHERE id = ?'
    ).get(userId);

    const styleProfiles = db.prepare(
      'SELECT * FROM style_profiles WHERE user_id = ?'
    ).all(userId);

    const exampleCounts = db.prepare(
      'SELECT report_type, COUNT(*) as count FROM example_reports WHERE user_id = ? GROUP BY report_type'
    ).all(userId);

    res.json({
      user,
      styleProfiles,
      exampleCounts
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile
router.put('/', (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, jurisdiction_state, jurisdiction_county } = req.body;

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (jurisdiction_state !== undefined) { updates.push('jurisdiction_state = ?'); params.push(jurisdiction_state); }
    if (jurisdiction_county !== undefined) { updates.push('jurisdiction_county = ?'); params.push(jurisdiction_county); }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(userId);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const user = db.prepare(
      'SELECT id, email, name, jurisdiction_state, jurisdiction_county FROM users WHERE id = ?'
    ).get(userId);

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Update style profile for a report type
router.put('/style/:reportType', (req, res) => {
  try {
    const userId = req.user.userId;
    const reportType = req.params.reportType;

    const validTypes = ['incident', 'arrest', 'supplemental'];
    if (!validTypes.includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type. Must be incident, arrest, or supplemental' });
    }

    const { voice, detail_level, common_phrases, vocabulary_preferences } = req.body;

    const updates = [];
    const params = [];

    if (voice) { updates.push('voice = ?'); params.push(voice); }
    if (detail_level) { updates.push('detail_level = ?'); params.push(detail_level); }
    if (common_phrases) { updates.push('common_phrases = ?'); params.push(JSON.stringify(common_phrases)); }
    if (vocabulary_preferences) { updates.push('vocabulary_preferences = ?'); params.push(JSON.stringify(vocabulary_preferences)); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update. Valid fields: voice, detail_level, common_phrases, vocabulary_preferences' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(userId, reportType);
    db.prepare(
      `UPDATE style_profiles SET ${updates.join(', ')} WHERE user_id = ? AND report_type = ?`
    ).run(...params);

    const profile = db.prepare(
      'SELECT * FROM style_profiles WHERE user_id = ? AND report_type = ?'
    ).get(userId, reportType);

    res.json(profile);
  } catch (error) {
    console.error('Update style error:', error);
    res.status(500).json({ error: 'Failed to update style profile' });
  }
});

// Upload example report
router.post('/examples', (req, res) => {
  try {
    const userId = req.user.userId;
    const { report_type, content } = req.body;

    if (!report_type || !content) {
      return res.status(400).json({ error: 'report_type and content required' });
    }

    const validTypes = ['incident', 'arrest', 'supplemental'];
    if (!validTypes.includes(report_type)) {
      return res.status(400).json({ error: 'Invalid report_type. Must be incident, arrest, or supplemental' });
    }

    // Limit to 5 examples per type
    const count = db.prepare(
      'SELECT COUNT(*) as count FROM example_reports WHERE user_id = ? AND report_type = ?'
    ).get(userId, report_type);

    if (count.count >= 5) {
      return res.status(400).json({ error: 'Maximum 5 examples per report type. Delete one first.' });
    }

    const result = db.prepare(
      'INSERT INTO example_reports (user_id, report_type, content) VALUES (?, ?, ?)'
    ).run(userId, report_type, content);

    res.status(201).json({
      id: result.lastInsertRowid,
      report_type,
      message: 'Example uploaded'
    });
  } catch (error) {
    console.error('Upload example error:', error);
    res.status(500).json({ error: 'Failed to upload example' });
  }
});

// Get example reports
router.get('/examples', (req, res) => {
  try {
    const userId = req.user.userId;
    const { report_type } = req.query;

    let query = 'SELECT id, report_type, created_at, SUBSTR(content, 1, 200) as preview FROM example_reports WHERE user_id = ?';
    const params = [userId];

    if (report_type) {
      query += ' AND report_type = ?';
      params.push(report_type);
    }

    const examples = db.prepare(query).all(...params);
    res.json(examples);
  } catch (error) {
    console.error('Get examples error:', error);
    res.status(500).json({ error: 'Failed to get examples' });
  }
});

// Delete example report
router.delete('/examples/:id', (req, res) => {
  try {
    const userId = req.user.userId;
    const exampleId = req.params.id;

    const result = db.prepare(
      'DELETE FROM example_reports WHERE id = ? AND user_id = ?'
    ).run(exampleId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Example not found' });
    }

    res.json({ message: 'Example deleted' });
  } catch (error) {
    console.error('Delete example error:', error);
    res.status(500).json({ error: 'Failed to delete example' });
  }
});

module.exports = router;
