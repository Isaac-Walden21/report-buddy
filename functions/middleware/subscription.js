const { getUser, hasSubscriptionAccess } = require('../db/firestore');

async function requireSubscription(req, res, next) {
  try {
    // req.user is populated by authenticateToken middleware
    const user = await getUser(req.user.userId);

    if (!user) {
      return res.status(403).json({ error: 'User not found', code: 'SUBSCRIPTION_REQUIRED' });
    }

    if (hasSubscriptionAccess(user)) {
      return next();
    }

    return res.status(403).json({
      error: 'Subscription required',
      code: 'SUBSCRIPTION_REQUIRED'
    });
  } catch (error) {
    console.error('Subscription check error:', error.message);
    return res.status(500).json({ error: 'Failed to verify subscription' });
  }
}

module.exports = { requireSubscription };
