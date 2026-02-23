if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const functions = require('firebase-functions');
const express = require('express');
// Firestore API enabled 2026-02-22
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

// Cloud Functions runs behind Google's load balancer — trust only first proxy hop
app.set('trust proxy', 1);

// Allowed origins for CORS
const allowedOrigins = [
  'https://report-buddy-55269.web.app',
  'https://report-buddy-55269.firebaseapp.com'
];

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://www.gstatic.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseapp.com"],
      imgSrc: ["'self'", "data:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", "https://checkout.stripe.com"]
    }
  }
}));
app.use(cors({
  origin: function(origin, callback) {
    // Allow same-origin requests (no Origin header) and allowlisted cross-origin requests
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Stripe webhook needs raw body for signature verification — mount BEFORE express.json()
const stripeRouter = require('./routes/stripe');
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeRouter.handleWebhook);

app.use(express.json({ limit: '2mb' }));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' }
});

app.use('/api/', generalLimiter);

// Seed global case law on startup
const { populateGlobalCaseLaw } = require('./db/firestore');
populateGlobalCaseLaw().catch(err => console.error('Failed to seed global case law:', err.message));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const generateRoutes = require('./routes/generate');
const legalRoutes = require('./routes/legal');
const profileRoutes = require('./routes/profile');
const courtPrepRoutes = require('./routes/court-prep');
const { requireSubscription } = require('./middleware/subscription');
const { authenticateToken } = require('./middleware/auth');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/reports', aiLimiter, reportRoutes);
app.use('/api/generate', aiLimiter, authenticateToken, requireSubscription, generateRoutes);
app.use('/api/legal', aiLimiter, authenticateToken, requireSubscription, legalRoutes);
app.use('/api/court-prep', aiLimiter, authenticateToken, requireSubscription, courtPrepRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/stripe', stripeRouter);

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Export the Express app as a Cloud Function
exports.api = functions.https.onRequest(app);
