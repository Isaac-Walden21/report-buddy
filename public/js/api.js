// public/js/api.js

// Firebase will be loaded via script tags in HTML
// This file initializes after Firebase is ready

const API = {
  baseUrl: '/api',
  currentUser: null,
  auth: null,

  // Initialize Firebase Auth
  init() {
    const firebaseConfig = {
      apiKey: "AIzaSyC5FNtv2z8ErLJ1vqdGkN4q6iWj0-8k_ks",
      authDomain: "report-buddy-55269.firebaseapp.com",
      projectId: "report-buddy-55269",
      storageBucket: "report-buddy-55269.firebasestorage.app",
      messagingSenderId: "1046218133908",
      appId: "1:1046218133908:web:2888f44db4aba4cff7ff81"
    };

    // Initialize Firebase
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    this.auth = firebase.auth();
  },

  // Get current Firebase ID token
  async getToken() {
    const user = this.auth?.currentUser;
    if (user) {
      return await user.getIdToken();
    }
    return null;
  },

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = await this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      // Intercept subscription-required errors to trigger paywall
      if (response.status === 403 && data.code === 'SUBSCRIPTION_REQUIRED') {
        if (typeof App !== 'undefined' && App.showPaywallModal) {
          App.showPaywallModal();
        }
        throw new Error('Subscription required to use AI features');
      }
      throw new Error(data.error || 'Request failed');
    }

    return data;
  },

  // Auth - using Firebase
  async login(email, password) {
    try {
      const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
      // Sync user to backend
      const data = await this.request('/auth/verify', { method: 'POST' });
      this.currentUser = data.user;
      return data;
    } catch (error) {
      console.error('Firebase login error:', error.code, error.message);
      throw new Error(error.message || 'Login failed');
    }
  },

  async register(email, password, name) {
    try {
      const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
      // Update display name in Firebase
      if (name && userCredential.user) {
        await userCredential.user.updateProfile({ displayName: name });
      }
      // Sync user to backend
      const data = await this.request('/auth/verify', { method: 'POST' });
      this.currentUser = data.user;
      return data;
    } catch (error) {
      console.error('Firebase register error:', error.code, error.message);
      throw new Error(error.message || 'Registration failed');
    }
  },

  async logout() {
    await this.auth.signOut();
    this.currentUser = null;
  },

  // Check if user is logged in
  onAuthStateChanged(callback) {
    return this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const data = await this.request('/auth/verify', { method: 'POST' });
          this.currentUser = data.user;
          callback(data.user);
        } catch (err) {
          console.error('Auth verify error:', err);
          callback(null);
        }
      } else {
        this.currentUser = null;
        callback(null);
      }
    });
  },

  // Reports
  async getReports(status, page = 1, limit = 25) {
    let query = `?page=${page}&limit=${limit}`;
    if (status) query += `&status=${status}`;
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

  async generateReport(reportId, transcript, { incomplete = false } = {}) {
    const payload = { report_id: reportId, transcript };
    if (incomplete) payload.incomplete = true;
    return this.request('/generate/report', {
      method: 'POST',
      body: JSON.stringify(payload)
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

  // Policies
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
  },

  // Court Prep
  async courtPrepStart(reportId) {
    return this.request('/court-prep/start', {
      method: 'POST',
      body: JSON.stringify({ report_id: reportId })
    });
  },

  async courtPrepMessage(reportId, sessionId, message) {
    return this.request('/court-prep/message', {
      method: 'POST',
      body: JSON.stringify({ report_id: reportId, session_id: sessionId, message })
    });
  },

  async courtPrepDebrief(reportId, sessionId) {
    return this.request('/court-prep/debrief', {
      method: 'POST',
      body: JSON.stringify({ report_id: reportId, session_id: sessionId })
    });
  },

  async courtPrepEnd(reportId, sessionId) {
    return this.request('/court-prep/end', {
      method: 'POST',
      body: JSON.stringify({ report_id: reportId, session_id: sessionId })
    });
  },

  // Stripe / Subscription
  async createCheckoutSession() {
    return this.request('/stripe/create-checkout-session', { method: 'POST' });
  },

  async openCustomerPortal() {
    const data = await this.request('/stripe/create-portal-session', { method: 'POST' });
    window.location.href = data.url;
  }
};
