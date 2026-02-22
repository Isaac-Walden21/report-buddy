// tests/reports.test.js
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

// Mock AI service to avoid OpenAI API key requirement
jest.mock('../src/services/ai', () => ({
  suggestCharges: jest.fn(),
  checkElements: jest.fn(),
  getUserPoliciesAndCaseLaw: jest.fn().mockReturnValue({ policies: [], caseLaw: [] })
}));

const admin = require('../src/services/firebase');
const authRoutes = require('../src/routes/auth');
const reportRoutes = require('../src/routes/reports');

// Setup test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);

describe('Reports API', () => {
  let reportId;
  const testUid = `test-uid-${Date.now()}`;
  const testEmail = `reports-test-${Date.now()}@example.com`;

  beforeAll(async () => {
    // Mock Firebase to return a valid decoded token
    admin._mockVerifyIdToken.mockResolvedValue({
      uid: testUid,
      email: testEmail,
      name: 'Reports Test'
    });

    // Create user via verify endpoint
    await request(app)
      .post('/api/auth/verify')
      .set('Authorization', 'Bearer mock-token');
  });

  beforeEach(() => {
    // Reset and re-apply the mock for each test
    admin._mockVerifyIdToken.mockResolvedValue({
      uid: testUid,
      email: testEmail,
      name: 'Reports Test'
    });
  });

  test('POST /api/reports - creates new report', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', 'Bearer mock-token')
      .send({ report_type: 'incident', title: 'Test Incident' });

    expect(res.status).toBe(201);
    expect(res.body.report_type).toBe('incident');
    reportId = res.body.id;
  });

  test('GET /api/reports - returns user reports', async () => {
    const res = await request(app)
      .get('/api/reports')
      .set('Authorization', 'Bearer mock-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/reports/:id - returns single report', async () => {
    const res = await request(app)
      .get(`/api/reports/${reportId}`)
      .set('Authorization', 'Bearer mock-token');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reportId);
  });

  test('PUT /api/reports/:id - updates report', async () => {
    const res = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', 'Bearer mock-token')
      .send({ title: 'Updated Title', status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.status).toBe('completed');
  });

  test('DELETE /api/reports/:id - deletes report', async () => {
    const res = await request(app)
      .delete(`/api/reports/${reportId}`)
      .set('Authorization', 'Bearer mock-token');

    expect(res.status).toBe(200);
  });

  test('GET /api/reports - requires authentication', async () => {
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(401);
  });
});
