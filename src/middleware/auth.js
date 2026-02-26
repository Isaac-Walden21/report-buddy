// src/middleware/auth.js
const admin = require('../services/firebase');
const { getOrCreateUser } = require('../services/users');

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
    const user = getOrCreateUser(decodedToken);

    if (!user) {
      return res.status(400).json({ error: 'Email is required for registration' });
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
