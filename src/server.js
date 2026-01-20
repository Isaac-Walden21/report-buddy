// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

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

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/profile', profileRoutes);

// Serve index.html for SPA routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Report Buddy running on http://localhost:${PORT}`);
});

module.exports = app;
