const admin = require('../services/firebase');
const { getUser, createUser } = require('../db/firestore');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
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

    req.user = {
      userId: decodedToken.uid,
      firebaseUid: decodedToken.uid,
      email: decodedToken.email,
      name: user.name,
      subscriptionStatus: user.subscription_status || null,
      trialEndsAt: user.trial_ends_at || null,
      stripeCustomerId: user.stripe_customer_id || null
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
