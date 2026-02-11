// src/routes/auth.js
const express = require('express');
const admin = require('../services/firebase');
const db = require('../db/database');

const router = express.Router();

// Verify token and sync user to local database
// Called after Firebase client-side authentication
router.post('/verify', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Get or create user in local database
    let user = db.prepare('SELECT id, firebase_uid, email, name FROM users WHERE firebase_uid = ?').get(decodedToken.uid);

    if (!user) {
      // User doesn't exist locally, create them
      const result = db.prepare(
        'INSERT INTO users (firebase_uid, email, name) VALUES (?, ?, ?)'
      ).run(decodedToken.uid, decodedToken.email, decodedToken.name || decodedToken.email.split('@')[0]);

      // Create default style profiles for new user
      const reportTypes = ['incident', 'arrest', 'supplemental'];
      const insertProfile = db.prepare(
        'INSERT INTO style_profiles (user_id, report_type) VALUES (?, ?)'
      );
      for (const type of reportTypes) {
        insertProfile.run(result.lastInsertRowid, type);
      }

      user = {
        id: result.lastInsertRowid,
        firebase_uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email.split('@')[0]
      };
    }

    res.json({
      message: 'Authentication successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Token verification error:', error.code || error.message);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }

    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Update user profile (name)
router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or less' });
    }

    db.prepare('UPDATE users SET name = ? WHERE firebase_uid = ?').run(name, decodedToken.uid);

    res.json({ message: 'Profile updated', name });
  } catch (error) {
    console.error('Profile update error:', error.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
