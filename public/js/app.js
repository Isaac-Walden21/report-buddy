// public/js/app.js
const App = {
  currentReport: null,
  currentView: 'auth',

  init() {
    this.bindEvents();
    this.checkAuth();

    // Initialize voice
    Voice.onResult = (final, interim) => {
      const textarea = document.getElementById('transcript-input');
      textarea.value = final + interim;
    };

    Voice.onStateChange = (isRecording) => {
      const btn = document.getElementById('voice-btn');
      const status = document.getElementById('voice-status');
      if (isRecording) {
        btn.classList.add('recording');
        btn.textContent = '⏹';
        status.textContent = 'Recording... tap to stop';
      } else {
        btn.classList.remove('recording');
        btn.textContent = '🎤';
        status.textContent = 'Tap to start speaking';
      }
    };

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  },

  bindEvents() {
    // Auth events
    document.getElementById('login-btn').onclick = () => this.login();
    document.getElementById('register-btn').onclick = () => this.register();
    document.getElementById('show-register').onclick = (e) => {
      e.preventDefault();
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('register-form').classList.remove('hidden');
    };
    document.getElementById('show-login').onclick = (e) => {
      e.preventDefault();
      document.getElementById('register-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
    };
    document.getElementById('logout-btn').onclick = () => this.logout();

    // Report type selection
    document.querySelectorAll('.report-type-btn').forEach(btn => {
      btn.onclick = () => this.startNewReport(btn.dataset.type);
    });

    // Input view events
    document.getElementById('voice-btn').onclick = () => Voice.toggle();
    document.getElementById('back-btn').onclick = () => this.showView('dashboard');
    document.getElementById('generate-btn').onclick = () => this.generateReport();

    // Editor view events
    document.getElementById('editor-back-btn').onclick = () => {
      this.showView('dashboard');
      this.loadReports();
    };
    document.getElementById('copy-btn').onclick = () => this.copyReport();
    document.getElementById('refine-btn').onclick = () => this.refineReport();
    document.getElementById('analyze-btn').onclick = () => this.analyzeReport();
    document.getElementById('save-draft-btn').onclick = () => this.saveReport('draft');
    document.getElementById('mark-complete-btn').onclick = () => this.saveReport('completed');
  },

  checkAuth() {
    if (API.token) {
      this.showApp();
    } else {
      this.showAuth();
    }
  },

  showAuth() {
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('app-view').classList.add('hidden');
  },

  showApp() {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('app-view').classList.remove('hidden');
    this.loadReports();
  },

  async login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const data = await API.login(email, password);
      document.getElementById('user-name').textContent = data.user.name;
      this.showApp();
    } catch (error) {
      alert(error.message);
    }
  },

  async register() {
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    try {
      const data = await API.register(email, password, name);
      document.getElementById('user-name').textContent = data.user.name;
      this.showApp();
    } catch (error) {
      alert(error.message);
    }
  },

  logout() {
    API.logout();
    this.showAuth();
  },

  showView(view) {
    document.getElementById('dashboard-view').classList.toggle('hidden', view !== 'dashboard');
    document.getElementById('input-view').classList.toggle('hidden', view !== 'input');
    document.getElementById('editor-view').classList.toggle('hidden', view !== 'editor');
    this.currentView = view;
  },

  async loadReports() {
    try {
      const reports = await API.getReports();
      const list = document.getElementById('reports-list');

      if (reports.length === 0) {
        list.innerHTML = '<p class="text-muted">No reports yet. Start a new one above.</p>';
        return;
      }

      list.innerHTML = reports.map(r => `
        <div class="report-item" data-id="${r.id}">
          <div class="report-item-info">
            <h4>${r.title || 'Untitled'}</h4>
            <p>${r.report_type} • ${new Date(r.updated_at).toLocaleDateString()}</p>
          </div>
          <span class="status-badge ${r.status}">${r.status}</span>
        </div>
      `).join('');

      list.querySelectorAll('.report-item').forEach(item => {
        item.onclick = () => this.openReport(item.dataset.id);
      });
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  },

  async startNewReport(type) {
    try {
      const report = await API.createReport(type);
      this.currentReport = report;
      document.getElementById('input-report-type').textContent = `New ${type.charAt(0).toUpperCase() + type.slice(1)} Report`;
      document.getElementById('transcript-input').value = '';
      document.getElementById('followup-questions').classList.add('hidden');
      this.showView('input');
    } catch (error) {
      alert('Failed to create report: ' + error.message);
    }
  },

  async openReport(id) {
    try {
      const report = await API.getReport(id);
      this.currentReport = report;
      this.showEditor(report);
    } catch (error) {
      alert('Failed to open report: ' + error.message);
    }
  },

  async generateReport() {
    const transcript = document.getElementById('transcript-input').value.trim();
    if (!transcript) {
      alert('Please describe what happened first.');
      return;
    }

    const btn = document.getElementById('generate-btn');
    btn.disabled = true;
    btn.textContent = 'Checking...';

    try {
      // First check if we need follow-up questions
      const check = await API.checkTranscript(this.currentReport.report_type, transcript);

      if (!check.ready && check.questions?.length > 0) {
        this.showFollowUpQuestions(check.questions);
        btn.disabled = false;
        btn.textContent = 'Generate Report';
        return;
      }

      // Generate the report
      btn.textContent = 'Generating...';
      const result = await API.generateReport(this.currentReport.id, transcript);
      this.currentReport.transcript = transcript;
      this.currentReport.generated_content = result.generated_content;
      this.showEditor(this.currentReport);
    } catch (error) {
      alert('Failed to generate report: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate Report';
    }
  },

  showFollowUpQuestions(questions) {
    const container = document.getElementById('followup-questions');
    container.innerHTML = `
      <div class="card" style="background:var(--bg-input)">
        <h4 style="margin-bottom:0.5rem">A few quick questions:</h4>
        <ul style="margin-left:1.25rem;color:var(--text-muted)">
          ${questions.map(q => `<li>${q}</li>`).join('')}
        </ul>
        <p class="mt-1" style="font-size:0.9rem">Add these details above, then click Generate Report again.</p>
      </div>
    `;
    container.classList.remove('hidden');
  },

  showEditor(report) {
    document.getElementById('editor-transcript').textContent = report.transcript || 'No transcript';
    document.getElementById('editor-content').value = report.final_content || report.generated_content || '';
    document.getElementById('legal-content').innerHTML = '<p class="text-muted">Click Analyze to review your report.</p>';
    this.showView('editor');
  },

  copyReport() {
    const content = document.getElementById('editor-content').value;
    navigator.clipboard.writeText(content).then(() => {
      const btn = document.getElementById('copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 2000);
    });
  },

  async refineReport() {
    const refinement = document.getElementById('refine-input').value.trim();
    if (!refinement) return;

    const btn = document.getElementById('refine-btn');
    btn.disabled = true;
    btn.textContent = 'Refining...';

    try {
      const result = await API.refineReport(this.currentReport.id, refinement);
      document.getElementById('editor-content').value = result.generated_content;
      document.getElementById('refine-input').value = '';
    } catch (error) {
      alert('Failed to refine report: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Refine';
    }
  },

  async analyzeReport() {
    const btn = document.getElementById('analyze-btn');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';

    try {
      // First save current content
      const content = document.getElementById('editor-content').value;
      await API.updateReport(this.currentReport.id, { generated_content: content });

      // Then analyze
      const analysis = await API.analyzeReport(this.currentReport.id);
      this.showLegalAnalysis(analysis);
    } catch (error) {
      alert('Failed to analyze report: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Analyze';
    }
  },

  showLegalAnalysis(analysis) {
    const container = document.getElementById('legal-content');
    let html = '';

    if (analysis.validations?.length > 0) {
      html += '<h4 style="margin-bottom:0.5rem">✓ Actions Validated</h4>';
      analysis.validations.forEach(v => {
        html += `
          <div class="legal-item">
            <div class="legal-item-title">${v.action}</div>
            <div class="legal-item-content">${v.case_law || ''} ${v.policy ? '• ' + v.policy : ''}</div>
          </div>
        `;
      });
    }

    if (analysis.clarifications?.length > 0) {
      html += '<h4 style="margin:1rem 0 0.5rem">⚠ Clarification Recommended</h4>';
      analysis.clarifications.forEach(c => {
        html += `
          <div class="legal-item clarification">
            <div class="legal-item-title">${c.issue}</div>
            <div class="legal-item-content">${c.suggestion}</div>
          </div>
        `;
      });
    }

    if (analysis.relevant_references?.length > 0) {
      html += '<h4 style="margin:1rem 0 0.5rem">📚 Relevant References</h4>';
      analysis.relevant_references.forEach(r => {
        html += `
          <div class="legal-item reference">
            <div class="legal-item-title">${r.title}</div>
            <div class="legal-item-content">${r.citation}<br>${r.relevance}</div>
          </div>
        `;
      });
    }

    if (!html) {
      html = '<p class="text-muted">No specific legal references identified.</p>';
    }

    container.innerHTML = html;
  },

  async saveReport(status) {
    try {
      const content = document.getElementById('editor-content').value;
      await API.updateReport(this.currentReport.id, {
        final_content: content,
        status
      });

      const btn = status === 'completed' ? document.getElementById('mark-complete-btn') : document.getElementById('save-draft-btn');
      const originalText = btn.textContent;
      btn.textContent = 'Saved!';
      setTimeout(() => btn.textContent = originalText, 2000);
    } catch (error) {
      alert('Failed to save report: ' + error.message);
    }
  }
};

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => App.init());
