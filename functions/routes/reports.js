const express = require('express');
const { createReport, getReport, getReports, updateReport, deleteReport, getLegalReferences } = require('../db/firestore');
const { authenticateToken } = require('../middleware/auth');
const { requireSubscription } = require('../middleware/subscription');
const { suggestCharges, checkElements, getUserPoliciesAndCaseLaw } = require('../services/ai');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Create new report
router.post('/', async (req, res) => {
  try {
    const { report_type, title } = req.body;
    const userId = req.user.userId;

    if (!report_type || !['incident', 'arrest', 'supplemental'].includes(report_type)) {
      return res.status(400).json({ error: 'Valid report_type required (incident, arrest, supplemental)' });
    }

    if (title !== undefined) {
      if (typeof title !== 'string') {
        return res.status(400).json({ error: 'Title must be a string' });
      }
      if (title.length > 200) {
        return res.status(400).json({ error: 'Title must be 200 characters or less' });
      }
    }

    const report = await createReport(userId, report_type, title);
    res.status(201).json(report);
  } catch (error) {
    console.error('Create report error:', error.message);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

// Get all reports for user (paginated)
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);

    if (page < 1 || limit < 1) {
      return res.status(400).json({ error: 'page and limit must be positive integers' });
    }

    if (status && !['draft', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be draft or completed' });
    }
    const allReports = await getReports(userId, status || null);
    const total = allReports.length;
    const offset = (page - 1) * limit;
    const reports = allReports.slice(offset, offset + limit);

    res.json({ reports, total, page, limit });
  } catch (error) {
    console.error('Get reports error:', error.message);
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

// Get single report
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;

    const report = await getReport(userId, reportId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const references = await getLegalReferences(userId, reportId);
    res.json({ ...report, legal_references: references });
  } catch (error) {
    console.error('Get report error:', error.message);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// Update report
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;
    const { transcript, generated_content, final_content, status, title, case_number } = req.body;

    // Verify ownership
    const existing = await getReport(userId, reportId);

    if (!existing) {
      return res.status(404).json({ error: 'Report not found' });
    }

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

    const updates = {};
    if (transcript !== undefined) updates.transcript = transcript;
    if (generated_content !== undefined) updates.generated_content = generated_content;
    if (final_content !== undefined) updates.final_content = final_content;
    if (status !== undefined) updates.status = status;
    if (title !== undefined) updates.title = title;
    if (case_number !== undefined) updates.case_number = case_number;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const report = await updateReport(userId, reportId, updates);
    res.json(report);
  } catch (error) {
    console.error('Update report error:', error.message);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// Delete report
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;

    const deleted = await deleteReport(userId, reportId);

    if (!deleted) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ message: 'Report deleted' });
  } catch (error) {
    console.error('Delete report error:', error.message);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Suggest charges based on report content (AI — requires subscription)
router.post('/:id/suggest-charges', requireSubscription, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;

    const report = await getReport(userId, reportId);

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

// Check if report meets elements of specified charges (AI — requires subscription)
router.post('/:id/check-elements', requireSubscription, async (req, res) => {
  try {
    const userId = req.user.userId;
    const reportId = req.params.id;
    const { charges } = req.body;

    if (!charges || !Array.isArray(charges) || charges.length === 0) {
      return res.status(400).json({ error: 'charges array required' });
    }
    if (charges.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 charges allowed' });
    }
    for (const charge of charges) {
      if (typeof charge !== 'string' || charge.length > 200) {
        return res.status(400).json({ error: 'Each charge must be a string of 200 characters or less' });
      }
    }

    const report = await getReport(userId, reportId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const content = report.final_content || report.generated_content;
    if (!content) {
      return res.status(400).json({ error: 'No report content to analyze' });
    }

    const legalData = await getUserPoliciesAndCaseLaw(userId);
    const result = await checkElements(content, charges, legalData);
    res.json(result);
  } catch (error) {
    console.error('Check elements error:', error.message);
    res.status(500).json({ error: 'Failed to check elements' });
  }
});

module.exports = router;
