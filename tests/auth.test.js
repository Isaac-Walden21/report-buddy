// tests/auth.test.js

// Mock firebase-admin BEFORE requiring any app modules
jest.mock('../src/services/firebase', () => {
  const mockVerifyIdToken = jest.fn();
  return {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    apps: [{}],
    __mockVerifyIdToken: mockVerifyIdToken
  };
});

const request = require('supertest');
const express = require('express');
const admin = require('../src/services/firebase');
const authRoutes = require('../src/routes/auth');

// Setup test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const db = require('../src/db/database');

const TEST_TOKEN = 'fake-firebase-id-token';
const TEST_UID = 'auth-test-firebase-uid';
const TEST_EMAIL = 'auth-test@example.com';
const TEST_NAME = 'Auth Test User';

describe('Auth API', () => {
  beforeAll(() => {
    // Clean up any stale test users from previous runs
    db.prepare('DELETE FROM users WHERE firebase_uid = ? OR email = ?').run(TEST_UID, TEST_EMAIL);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/verify', () => {
    test('returns 200 and user object with valid token', async () => {
      admin.__mockVerifyIdToken.mockResolvedValue({
        uid: TEST_UID,
        email: TEST_EMAIL,
        name: TEST_NAME
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Authentication successful');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe(TEST_EMAIL);
      expect(res.body.user.name).toBe(TEST_NAME);
      expect(admin.__mockVerifyIdToken).toHaveBeenCalledWith(TEST_TOKEN);
    });

    test('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .post('/api/auth/verify');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Token required');
      expect(admin.__mockVerifyIdToken).not.toHaveBeenCalled();
    });

    test('returns 401 when token is expired', async () => {
      admin.__mockVerifyIdToken.mockRejectedValue({
        code: 'auth/id-token-expired',
        message: 'Token expired'
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', `Bearer expired-token`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Token expired');
    });

    test('returns 401 when token is invalid', async () => {
      admin.__mockVerifyIdToken.mockRejectedValue({
        code: 'auth/invalid-id-token',
        message: 'Invalid token'
      });

      const res = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', `Bearer garbage-token`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    test('returns existing user on subsequent calls with same uid', async () => {
      admin.__mockVerifyIdToken.mockResolvedValue({
        uid: TEST_UID,
        email: TEST_EMAIL,
        name: TEST_NAME
      });

      const res1 = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      const res2 = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      expect(res2.status).toBe(200);
      expect(res2.body.user.id).toBe(res1.body.user.id);
    });
  });

  describe('PUT /api/auth/profile', () => {
    test('updates user name with valid token and returns 200', async () => {
      admin.__mockVerifyIdToken.mockResolvedValue({
        uid: TEST_UID,
        email: TEST_EMAIL,
        name: TEST_NAME
      });

      // Ensure user exists first
      await request(app)
        .post('/api/auth/verify')
        .set('Authorization', `Bearer ${TEST_TOKEN}`);

      const res = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Profile updated');
      expect(res.body.name).toBe('Updated Name');
    });

    test('returns 400 when name is missing', async () => {
      admin.__mockVerifyIdToken.mockResolvedValue({
        uid: TEST_UID,
        email: TEST_EMAIL,
        name: TEST_NAME
      });

      const res = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Name is required');
    });

    test('returns 400 when name exceeds 100 characters', async () => {
      admin.__mockVerifyIdToken.mockResolvedValue({
        uid: TEST_UID,
        email: TEST_EMAIL,
        name: TEST_NAME
      });

      const res = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .send({ name: 'A'.repeat(101) });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Name must be 100 characters or less');
    });

    test('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .put('/api/auth/profile')
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Token required');
    });
  });
});
