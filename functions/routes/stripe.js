const express = require('express');
const stripe = require('../services/stripe');
const { authenticateToken } = require('../middleware/auth');
const { getUser, updateSubscription, getUserByStripeCustomerId } = require('../db/firestore');

const router = express.Router();

// All router routes require auth. The webhook is mounted separately in index.js
// to bypass auth and use raw body parsing for Stripe signature verification.
router.use(authenticateToken);

// Create Stripe Checkout Session
router.post('/create-checkout-session', async (req, res) => {
  try {
    const user = await getUser(req.user.userId);

    // Create or reuse Stripe Customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { firebase_uid: req.user.userId }
      });
      customerId = customer.id;
      await updateSubscription(req.user.userId, { stripe_customer_id: customerId });
    }

    // Guard against creating duplicate subscriptions
    if (user.subscription_status === 'active' && user.subscription_id) {
      return res.status(400).json({ error: 'You already have an active subscription' });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1
      }],
      success_url: 'https://report-buddy-55269.web.app/?subscription=success',
      cancel_url: 'https://report-buddy-55269.web.app/?subscription=canceled'
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Create checkout session error:', error.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Create Stripe Customer Portal Session
router.post('/create-portal-session', async (req, res) => {
  try {
    const user = await getUser(req.user.userId);

    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: 'https://report-buddy-55269.web.app/'
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Create portal session error:', error.message);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// --- Webhook Handler (separate, no auth — uses Stripe signature verification) ---

async function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    // Firebase Cloud Functions provides rawBody; express.raw() provides body as Buffer
    const payload = req.rawBody || req.body;
    event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        const user = await getUserByStripeCustomerId(customerId);
        if (user) {
          // Retrieve the subscription to get period end
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await updateSubscription(user.id, {
            subscription_status: 'active',
            subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const user = await getUserByStripeCustomerId(customerId);
        if (user) {
          await updateSubscription(user.id, {
            subscription_status: subscription.status,
            subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const user = await getUserByStripeCustomerId(customerId);
        if (user) {
          await updateSubscription(user.id, {
            subscription_status: 'canceled',
            subscription_id: null,
            subscription_current_period_end: null
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const user = await getUserByStripeCustomerId(customerId);
        if (user && user.subscription_status !== 'past_due') {
          await updateSubscription(user.id, {
            subscription_status: 'past_due'
          });
        }
        break;
      }

      default:
        // Unhandled event type
        break;
    }
  } catch (error) {
    console.error('Webhook processing error:', error.message);
    // Return 200 to prevent infinite Stripe retries for non-transient errors
    return res.status(200).json({ error: 'Webhook processing failed', received: true });
  }

  res.json({ received: true });
}

// Export router as default, attach webhook handler as property
router.handleWebhook = handleWebhook;
module.exports = router;
