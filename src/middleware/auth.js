// src/middleware/auth.js
const admin = require('../services/firebase');
const db = require('../db/database');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
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

    // Attach user info to request
    req.user = {
      userId: user.id,
      firebaseUid: decodedToken.uid,
      email: decodedToken.email,
      name: user.name
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error.code || error.message);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    return res.status(403).json({ error: 'Authentication failed' });
  }
}

module.exports = { authenticateToken };
