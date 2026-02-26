const { getUser, hasSubscriptionAccess, hasProAccess } = require('../db/firestore');

async function requireSubscription(req, res, next) {
  try {
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

async function requireProSubscription(req, res, next) {
  try {
    const user = await getUser(req.user.userId);

    if (!user) {
      return res.status(403).json({ error: 'User not found', code: 'SUBSCRIPTION_REQUIRED' });
    }

    if (hasProAccess(user)) {
      return next();
    }

    if (hasSubscriptionAccess(user)) {
      return res.status(403).json({
        error: 'Pro subscription required for Court Prep',
        code: 'PRO_REQUIRED'
      });
    }

    return res.status(403).json({
      error: 'Subscription required',
      code: 'SUBSCRIPTION_REQUIRED'
    });
  } catch (error) {
    console.error('Pro subscription check error:', error.message);
    return res.status(500).json({ error: 'Failed to verify subscription' });
  }
}

module.exports = { requireSubscription, requireProSubscription };
