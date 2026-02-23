const express = require('express');
const { getUser, updateUser, getAllStyleProfiles, updateStyleProfile, getExampleReports, countExampleReports, addExampleReport, deleteExampleReport, getExampleCounts } = require('../db/firestore');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Get user profile and style settings
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;

    const [user, styleProfiles, exampleCounts] = await Promise.all([
      getUser(userId),
      getAllStyleProfiles(userId),
      getExampleCounts(userId)
    ]);

    res.json({
      user,
      styleProfiles,
      exampleCounts
    });
  } catch (error) {
    console.error('Get profile error:', error.message);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile
router.put('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, jurisdiction_state, jurisdiction_county } = req.body;

    const updates = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.length < 1 || name.length > 100) {
        return res.status(400).json({ error: 'Name must be a string between 1 and 100 characters' });
      }
      updates.name = name;
    }
    if (jurisdiction_state !== undefined) {
      if (jurisdiction_state !== null && (typeof jurisdiction_state !== 'string' || jurisdiction_state.length > 50)) {
        return res.status(400).json({ error: 'Jurisdiction state must be a string of 50 characters or less' });
      }
      updates.jurisdiction_state = jurisdiction_state;
    }
    if (jurisdiction_county !== undefined) {
      if (jurisdiction_county !== null && (typeof jurisdiction_county !== 'string' || jurisdiction_county.length > 100)) {
        return res.status(400).json({ error: 'Jurisdiction county must be a string of 100 characters or less' });
      }
      updates.jurisdiction_county = jurisdiction_county;
    }

    if (Object.keys(updates).length > 0) {
      await updateUser(userId, updates);
    }

    const user = await getUser(userId);
    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Update style profile for a report type
router.put('/style/:reportType', async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportType = req.params.reportType;

    const validTypes = ['incident', 'arrest', 'supplemental'];
    if (!validTypes.includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type. Must be incident, arrest, or supplemental' });
    }

    const { voice, detail_level, common_phrases, vocabulary_preferences } = req.body;

    const updates = {};
    if (voice) updates.voice = voice;
    if (detail_level) updates.detail_level = detail_level;
    if (common_phrases) updates.common_phrases = common_phrases;
    if (vocabulary_preferences) updates.vocabulary_preferences = vocabulary_preferences;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update. Valid fields: voice, detail_level, common_phrases, vocabulary_preferences' });
    }

    const profile = await updateStyleProfile(userId, reportType, updates);
    res.json(profile);
  } catch (error) {
    console.error('Update style error:', error.message);
    res.status(500).json({ error: 'Failed to update style profile' });
  }
});

// Upload example report
router.post('/examples', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { report_type, content } = req.body;

    if (!report_type || !content) {
      return res.status(400).json({ error: 'report_type and content required' });
    }
    if (content.length > 50000) {
      return res.status(400).json({ error: 'Content must be 50,000 characters or less' });
    }

    const validTypes = ['incident', 'arrest', 'supplemental'];
    if (!validTypes.includes(report_type)) {
      return res.status(400).json({ error: 'Invalid report_type. Must be incident, arrest, or supplemental' });
    }

    const count = await countExampleReports(userId, report_type);
    if (count >= 5) {
      return res.status(400).json({ error: 'Maximum 5 examples per report type. Delete one first.' });
    }

    const example = await addExampleReport(userId, report_type, content);

    res.status(201).json({
      id: example.id,
      report_type,
      message: 'Example uploaded'
    });
  } catch (error) {
    console.error('Upload example error:', error.message);
    res.status(500).json({ error: 'Failed to upload example' });
  }
});

// Get example reports
router.get('/examples', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { report_type } = req.query;

    if (report_type && !['incident', 'arrest', 'supplemental'].includes(report_type)) {
      return res.status(400).json({ error: 'Invalid report_type. Must be incident, arrest, or supplemental' });
    }
    const examples = await getExampleReports(userId, report_type || null);
    // Return without full content, just previews
    const result = examples.map(({ content, ...rest }) => rest);
    res.json(result);
  } catch (error) {
    console.error('Get examples error:', error.message);
    res.status(500).json({ error: 'Failed to get examples' });
  }
});

// Delete example report
router.delete('/examples/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const exampleId = req.params.id;

    const deleted = await deleteExampleReport(userId, exampleId);

    if (!deleted) {
      return res.status(404).json({ error: 'Example not found' });
    }

    res.json({ message: 'Example deleted' });
  } catch (error) {
    console.error('Delete example error:', error.message);
    res.status(500).json({ error: 'Failed to delete example' });
  }
});

module.exports = router;
