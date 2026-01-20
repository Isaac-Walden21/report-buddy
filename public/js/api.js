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
  },

  async suggestCharges(reportId) {
    return this.request(`/reports/${reportId}/suggest-charges`, {
      method: 'POST'
    });
  },

  async checkElements(reportId, charges) {
    return this.request(`/reports/${reportId}/check-elements`, {
      method: 'POST',
      body: JSON.stringify({ charges })
    });
  },

  // Policies (department policies and case law)
  async uploadPolicy(filename, content) {
    return this.request('/legal/policy', {
      method: 'POST',
      body: JSON.stringify({ filename, content })
    });
  },

  async getPolicies() {
    return this.request('/legal/policies');
  },

  async deletePolicy(id) {
    return this.request(`/legal/policy/${id}`, {
      method: 'DELETE'
    });
  },

  // Profile and examples
  async getProfile() {
    return this.request('/profile');
  },

  async uploadExample(reportType, content) {
    return this.request('/profile/examples', {
      method: 'POST',
      body: JSON.stringify({ report_type: reportType, content })
    });
  },

  async getExamples(reportType) {
    const query = reportType ? `?report_type=${reportType}` : '';
    return this.request(`/profile/examples${query}`);
  },

  async deleteExample(id) {
    return this.request(`/profile/examples/${id}`, {
      method: 'DELETE'
    });
  }
};
