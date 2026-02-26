// tests/reports.test.js

// Mock firebase-admin BEFORE requiring any app modules
jest.mock('../src/services/firebase', () => {
  const mockVerifyIdToken = jest.fn();
  return {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    apps: [{}],
    __mockVerifyIdToken: mockVerifyIdToken
  };
});

// Mock ai service to avoid OpenAI API key requirement at import time
jest.mock('../src/services/ai', () => ({
  suggestCharges: jest.fn(),
  checkElements: jest.fn(),
  getUserPoliciesAndCaseLaw: jest.fn(() => ({ policies: [], caseLaw: [] }))
}));

const request = require('supertest');
const express = require('express');
const admin = require('../src/services/firebase');
const db = require('../src/db/database');
const reportRoutes = require('../src/routes/reports');

// Setup test app
const app = express();
app.use(express.json());
app.use('/api/reports', reportRoutes);

const TEST_TOKEN = 'fake-firebase-id-token';
const TEST_UID = 'reports-test-firebase-uid';
const TEST_EMAIL = 'reports-test@example.com';
const TEST_NAME = 'Reports Test User';

describe('Reports API', () => {
  let reportId;

  beforeAll(() => {
    // Clean up any stale test users from previous runs
    db.prepare('DELETE FROM users WHERE firebase_uid = ? OR email = ?').run(TEST_UID, TEST_EMAIL);

    // Configure mock to resolve with a valid decoded token for all requests
    admin.__mockVerifyIdToken.mockResolvedValue({
      uid: TEST_UID,
      email: TEST_EMAIL,
      name: TEST_NAME
    });
  });

  afterEach(() => {
    // Re-apply the default mock in case a test overrode it
    admin.__mockVerifyIdToken.mockResolvedValue({
      uid: TEST_UID,
      email: TEST_EMAIL,
      name: TEST_NAME
    });
  });

  test('POST /api/reports - creates new report', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ report_type: 'incident', title: 'Test Incident' });

    expect(res.status).toBe(201);
    expect(res.body.report_type).toBe('incident');
    expect(res.body.title).toBe('Test Incident');
    expect(res.body).toHaveProperty('id');
    reportId = res.body.id;
  });

  test('GET /api/reports - returns paginated reports', async () => {
    const res = await request(app)
      .get('/api/reports')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reports');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
    expect(Array.isArray(res.body.reports)).toBe(true);
    expect(res.body.reports.length).toBeGreaterThan(0);
  });

  test('GET /api/reports/:id - returns single report', async () => {
    const res = await request(app)
      .get(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reportId);
    expect(res.body).toHaveProperty('legal_references');
  });

  test('PUT /api/reports/:id - updates report', async () => {
    const res = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ title: 'Updated Title', status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.status).toBe('completed');
  });

  test('DELETE /api/reports/:id - deletes report', async () => {
    const res = await request(app)
      .delete(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Report deleted');
  });

  test('GET /api/reports - requires authentication (401 without token)', async () => {
    const res = await request(app)
      .get('/api/reports');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Access token required');
  });

  test('POST /api/reports - rejects invalid report_type', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ report_type: 'invalid_type', title: 'Bad Type' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Valid report_type required/);
  });

  test('GET /api/reports/:id - returns 404 for nonexistent report', async () => {
    const res = await request(app)
      .get('/api/reports/999999')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Report not found');
  });

  test('POST /api/reports - rejects expired token with 401', async () => {
    admin.__mockVerifyIdToken.mockRejectedValueOnce({
      code: 'auth/id-token-expired',
      message: 'Token expired'
    });

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer expired-token`)
      .send({ report_type: 'incident', title: 'Should Fail' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token expired');
  });
});
