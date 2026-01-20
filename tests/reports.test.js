// tests/reports.test.js
require('dotenv').config();
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const authRoutes = require('../src/routes/auth');
const reportRoutes = require('../src/routes/reports');

// Setup test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);

describe('Reports API', () => {
  let authToken;
  let reportId;

  beforeAll(async () => {
    // Create test user and get token
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `reports-test${Date.now()}@example.com`,
        password: 'testpass123',
        name: 'Reports Test'
      });
    authToken = res.body.token;
  });

  test('POST /api/reports - creates new report', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ report_type: 'incident', title: 'Test Incident' });

    expect(res.status).toBe(201);
    expect(res.body.report_type).toBe('incident');
    reportId = res.body.id;
  });

  test('GET /api/reports - returns user reports', async () => {
    const res = await request(app)
      .get('/api/reports')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/reports/:id - returns single report', async () => {
    const res = await request(app)
      .get(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reportId);
  });

  test('PUT /api/reports/:id - updates report', async () => {
    const res = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Updated Title', status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.status).toBe('completed');
  });

  test('DELETE /api/reports/:id - deletes report', async () => {
    const res = await request(app)
      .delete(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });

  test('GET /api/reports - requires authentication', async () => {
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(401);
  });
});
