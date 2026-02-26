// src/routes/auth.js
const express = require('express');
const admin = require('../services/firebase');
const db = require('../db/database');
const { getOrCreateUser } = require('../services/users');

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
    const user = getOrCreateUser(decodedToken);

    if (!user) {
      return res.status(400).json({ error: 'Email is required for registration' });
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
