// public/js/api.js
const API = {
  baseUrl: '/api',
  token: localStorage.getItem('token'),

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  },

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  },

  // Auth
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(data.token);
    return data;
  },

  async register(email, password, name) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });
    this.setToken(data.token);
    return data;
  },

  logout() {
    this.setToken(null);
  },

  // Reports
  async getReports(status) {
    const query = status ? `?status=${status}` : '';
    return this.request(`/reports${query}`);
  },

  async getReport(id) {
    return this.request(`/reports/${id}`);
  },

  async createReport(reportType, title) {
    return this.request('/reports', {
      method: 'POST',
      body: JSON.stringify({ report_type: reportType, title })
    });
  },

  async updateReport(id, data) {
    return this.request(`/reports/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteReport(id) {
    return this.request(`/reports/${id}`, {
      method: 'DELETE'
    });
  },

  // Generation
  async checkTranscript(reportType, transcript) {
    return this.request('/generate/check', {
      method: 'POST',
      body: JSON.stringify({ report_type: reportType, transcript })
    });
  },

  async generateReport(reportId, transcript) {
    return this.request('/generate/report', {
      method: 'POST',
      body: JSON.stringify({ report_id: reportId, transcript })
    });
  },

  async refineReport(reportId, refinement) {
    return this.request('/generate/refine', {
      method: 'POST',
      body: JSON.stringify({ report_id: reportId, refinement })
    });
  },

  // Legal
  async analyzeReport(reportId) {
    return this.request(`/legal/analyze/${reportId}`, {
      method: 'POST'
    });
  }
};
