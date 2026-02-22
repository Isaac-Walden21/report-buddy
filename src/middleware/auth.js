// src/middleware/auth.js
const admin = require('../services/firebase');
const db = require('../db/database');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Verify Firebase ID token
  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (authError) {
    console.error('Token verification error:', authError.code || authError.message);
    if (authError.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (authError.code === 'auth/argument-error' || authError.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(403).json({ error: 'Authentication failed' });
  }

  try {
    // Get user by firebase_uid
    let user = db.prepare('SELECT id, firebase_uid, email, name FROM users WHERE firebase_uid = ?').get(decodedToken.uid);

    if (!user) {
      // Check if user exists by email (migrated from old auth system)
      const existingByEmail = db.prepare('SELECT id, firebase_uid, email, name FROM users WHERE email = ? AND firebase_uid IS NULL').get(decodedToken.email);

      if (existingByEmail) {
        // Link existing account to Firebase
        db.prepare('UPDATE users SET firebase_uid = ? WHERE id = ?').run(decodedToken.uid, existingByEmail.id);
        user = { ...existingByEmail, firebase_uid: decodedToken.uid };
      } else {
        try {
          // Create new user
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
        } catch (insertErr) {
          // Handle race condition: concurrent request may have created this user
          user = db.prepare('SELECT id, firebase_uid, email, name FROM users WHERE firebase_uid = ?').get(decodedToken.uid);
          if (!user) {
            throw insertErr;
          }
        }
      }
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
    console.error('User sync error:', error.message);
    return res.status(500).json({ error: 'Failed to sync user data' });
  }
}

module.exports = { authenticateToken };
