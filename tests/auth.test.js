// tests/auth.test.js
require('dotenv').config();
const request = require('supertest');
const express = require('express');

// Mock Firebase Admin SDK before importing routes
jest.mock('../src/services/firebase', () => {
  const mockVerifyIdToken = jest.fn();
  return {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken
    }),
    _mockVerifyIdToken: mockVerifyIdToken
  };
});

const admin = require('../src/services/firebase');
const authRoutes = require('../src/routes/auth');

// Setup test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth API', () => {
  beforeEach(() => {
    admin._mockVerifyIdToken.mockReset();
  });

  test('POST /api/auth/verify - returns 401 when no token provided', async () => {
    const res = await request(app)
      .post('/api/auth/verify');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token required');
  });

  test('POST /api/auth/verify - returns 401 for invalid token', async () => {
    admin._mockVerifyIdToken.mockRejectedValue(
      Object.assign(new Error('Invalid token'), { code: 'auth/invalid-id-token' })
    );

    const res = await request(app)
      .post('/api/auth/verify')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  test('POST /api/auth/verify - returns 401 for expired token', async () => {
    admin._mockVerifyIdToken.mockRejectedValue(
      Object.assign(new Error('Token expired'), { code: 'auth/id-token-expired' })
    );

    const res = await request(app)
      .post('/api/auth/verify')
      .set('Authorization', 'Bearer expired-token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token expired');
  });

  test('POST /api/auth/verify - creates user and returns data for valid token', async () => {
    admin._mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-123',
      email: `test-${Date.now()}@example.com`,
      name: 'Test User'
    });

    const res = await request(app)
      .post('/api/auth/verify')
      .set('Authorization', 'Bearer valid-firebase-token');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Authentication successful');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('email');
    expect(res.body.user).toHaveProperty('name');
  });

  test('POST /api/auth/verify - returns same user on subsequent calls', async () => {
    const email = `repeat-${Date.now()}@example.com`;
    admin._mockVerifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-repeat',
      email,
      name: 'Repeat User'
    });

    const res1 = await request(app)
      .post('/api/auth/verify')
      .set('Authorization', 'Bearer valid-token');

    const res2 = await request(app)
      .post('/api/auth/verify')
      .set('Authorization', 'Bearer valid-token');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.user.id).toBe(res2.body.user.id);
  });
});
