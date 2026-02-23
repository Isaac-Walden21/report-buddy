const express = require('express');
const admin = require('../services/firebase');
const { getUser, createUser, updateUser, updateSubscription, hasSubscriptionAccess } = require('../db/firestore');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Verify token and sync user to Firestore
router.post('/verify', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);

    let user = await getUser(decodedToken.uid);

    if (!user) {
      if (!decodedToken.email) {
        return res.status(400).json({ error: 'Email is required for registration' });
      }
      user = await createUser(
        decodedToken.uid,
        decodedToken.email,
        decodedToken.name || decodedToken.email.split('@')[0]
      );
    }

    // Backfill subscription fields for existing users missing them
    if (!user.subscription_status) {
      const trialEnd = new Date(new Date(user.created_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await updateSubscription(user.id, {
        subscription_status: 'trialing',
        trial_ends_at: trialEnd
      });
      user.subscription_status = 'trialing';
      user.trial_ends_at = trialEnd;
    }

    res.json({
      message: 'Authentication successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_status: user.subscription_status,
        trial_ends_at: user.trial_ends_at,
        has_subscription: hasSubscriptionAccess(user)
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

// Update user profile (name) — uses shared authenticateToken middleware
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required and must be a string' });
    }
    if (name.length < 1 || name.length > 100) {
      return res.status(400).json({ error: 'Name must be between 1 and 100 characters' });
    }

    await updateUser(req.user.userId, { name });

    res.json({ message: 'Profile updated', name });
  } catch (error) {
    console.error('Profile update error:', error.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
