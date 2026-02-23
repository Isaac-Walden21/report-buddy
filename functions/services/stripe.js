const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not set — Stripe features will fail');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_missing');

module.exports = stripe;
