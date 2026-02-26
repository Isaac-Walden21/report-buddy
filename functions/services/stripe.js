const Stripe = require('stripe');

const REQUIRED_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_ID',
  'STRIPE_PRO_PRICE_ID'
];

const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`Missing required Stripe env vars: ${missing.join(', ')}`);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_missing');

module.exports = stripe;
