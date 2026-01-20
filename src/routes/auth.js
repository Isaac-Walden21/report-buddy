// src/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/database');

const router = express.Router();
const SALT_ROUNDS = 10;

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = db.prepare(
      'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)'
    ).run(email, passwordHash, name);

    // Create default style profiles
    const reportTypes = ['incident', 'arrest', 'supplemental'];
    const insertProfile = db.prepare(
      'INSERT INTO style_profiles (user_id, report_type) VALUES (?, ?)'
    );
    for (const type of reportTypes) {
      insertProfile.run(result.lastInsertRowid, type);
    }

    // Generate token
    const token = jwt.sign(
      { userId: result.lastInsertRowid, email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: result.lastInsertRowid, email, name }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
