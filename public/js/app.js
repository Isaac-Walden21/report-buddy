// public/js/app.js

// HTML escape utility to prevent XSS
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const App = {
  currentReport: null,
  currentView: 'auth',
  suggestedCharges: [],

  init() {
    // Initialize Firebase Auth
    API.init();

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
        btn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>`;
        status.textContent = 'Recording... tap to stop';
      } else {
        btn.classList.remove('recording');
        btn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>`;
        status.textContent = 'Tap to start speaking';
      }
    };

    Voice.onClear = () => {
      document.getElementById('transcript-input').value = '';
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

    // Settings events
    document.getElementById('settings-btn').onclick = () => {
      this.showView('settings');
      this.loadSettings();
    };
    document.getElementById('settings-back-btn').onclick = () => {
      this.showView('dashboard');
      this.loadReports();
    };
    document.getElementById('upload-policy-btn').onclick = () => this.uploadPolicy();
    document.getElementById('upload-caselaw-btn').onclick = () => this.uploadCaselaw();
    document.getElementById('upload-example-btn').onclick = () => this.uploadExample();

    // Report type selection
    document.querySelectorAll('.report-type-btn').forEach(btn => {
      btn.onclick = () => this.startNewReport(btn.dataset.type);
    });

    // Input view events
    document.getElementById('voice-btn').onclick = () => {
      const existingText = document.getElementById('transcript-input').value.trim();
      Voice.toggle(existingText);
    };
    document.getElementById('clear-transcript-btn').onclick = () => {
      Voice.clear();
      document.getElementById('transcript-input').value = '';
    };
    document.getElementById('back-btn').onclick = () => this.showView('dashboard');
    document.getElementById('generate-btn').onclick = () => this.generateReport();

    // Editor view events
    document.getElementById('editor-back-btn').onclick = () => {
      this.showView('dashboard');
      this.loadReports();
    };
    document.getElementById('copy-btn').onclick = () => this.copyReport();
    document.getElementById('refine-btn').onclick = () => this.refineReport();
    document.getElementById('caselaw-btn').onclick = () => this.analyzeCaseLaw();
    document.getElementById('analyze-btn').onclick = () => this.suggestChargesForReport();
    document.getElementById('check-elements-btn').onclick = () => this.checkElementsForReport();
    document.getElementById('save-draft-btn').onclick = () => this.saveReport('draft');
    document.getElementById('mark-complete-btn').onclick = () => this.saveReport('completed');
    document.getElementById('report-title').onblur = () => this.saveTitle();

    // Format toolbar buttons (whitelist allowed commands)
    const allowedCommands = ['bold', 'italic', 'underline'];
    document.querySelectorAll('.format-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const command = btn.dataset.command;
        if (command === 'highlight') {
          this.toggleHighlight();
        } else if (allowedCommands.includes(command)) {
          document.execCommand(command, false, null);
        }
        document.getElementById('editor-content').focus();
      };
    });

    // Sanitize pasted content in contenteditable editor
    document.getElementById('editor-content').addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  },

  checkAuth() {
    // Use Firebase auth state listener
    API.onAuthStateChanged((user) => {
      if (user) {
        document.getElementById('user-name').textContent = user.name || user.email;
        this.showApp();
      } else {
        this.showAuth();
      }
    });
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
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      alert('Please enter email and password');
      return;
    }

    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    try {
      const data = await API.login(email, password);
      document.getElementById('user-name').textContent = data.user.name;
      this.showApp();
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed. Please check your email and password.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Log In';
    }
  },

  async register() {
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    if (!name || !email || !password) {
      alert('Please fill in all fields');
      return;
    }

    if (password.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }

    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const data = await API.register(email, password, name);
      document.getElementById('user-name').textContent = data.user.name;
      this.showApp();
    } catch (error) {
      console.error('Register error:', error);
      alert('Registration failed. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  },

  async logout() {
    await API.logout();
    // Clear service worker caches on logout
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    this.showAuth();
  },

  showView(view) {
    document.getElementById('dashboard-view').classList.toggle('hidden', view !== 'dashboard');
    document.getElementById('input-view').classList.toggle('hidden', view !== 'input');
    document.getElementById('editor-view').classList.toggle('hidden', view !== 'editor');
    document.getElementById('settings-view').classList.toggle('hidden', view !== 'settings');
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
        <div class="report-item" data-id="${escapeHtml(r.id)}">
          <div class="report-item-info">
            <h4>${escapeHtml(r.title || 'Untitled')}</h4>
            <p>${escapeHtml(r.report_type)} • ${escapeHtml(new Date(r.updated_at).toLocaleDateString())}</p>
          </div>
          <span class="status-badge ${escapeHtml(r.status)}">${escapeHtml(r.status)}</span>
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
      this.currentReport.title = result.suggested_title;
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
          ${questions.map(q => `<li>${escapeHtml(q)}</li>`).join('')}
        </ul>
        <p class="mt-1" style="font-size:0.9rem">Add these details above, then click Generate Report again.</p>
        <button id="generate-anyway-btn" class="btn btn-secondary mt-2" style="width:100%">Generate Anyway</button>
      </div>
    `;
    container.classList.remove('hidden');
    document.getElementById('generate-anyway-btn').onclick = () => this.generateReportDirect();
  },

  async generateReportDirect() {
    const transcript = document.getElementById('transcript-input').value.trim();
    const btn = document.getElementById('generate-anyway-btn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      const result = await API.generateReport(this.currentReport.id, transcript);
      this.currentReport.transcript = transcript;
      this.currentReport.generated_content = result.generated_content;
      this.showEditor(this.currentReport);
    } catch (error) {
      alert('Failed to generate report: ' + error.message);
      btn.disabled = false;
      btn.textContent = 'Generate Anyway';
    }
  },

  showEditor(report) {
    document.getElementById('editor-transcript').textContent = report.transcript || 'No transcript';
    const content = report.final_content || report.generated_content || '';
    // Set as plain text, preserving line breaks
    document.getElementById('editor-content').innerText = content;
    // Set title
    document.getElementById('report-title').value = report.title || '';
    // Reset legal panel
    document.getElementById('legal-content').innerHTML = '<p class="text-muted"><strong>Case Law</strong> - Get case citations and policy recommendations<br><strong>Elements</strong> - Verify your report meets statutory elements</p>';
    document.getElementById('charges-section').classList.add('hidden');
    this.suggestedCharges = [];
    this.showView('editor');
  },

  getEditorContent() {
    const editor = document.getElementById('editor-content');
    return editor.innerText;
  },

  toggleHighlight() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    if (!selectedText) return;

    // Check if already highlighted
    const parent = range.commonAncestorContainer.parentElement;
    if (parent.tagName === 'MARK') {
      // Remove highlight
      const text = document.createTextNode(parent.textContent);
      parent.parentNode.replaceChild(text, parent);
    } else {
      // Add highlight
      const mark = document.createElement('mark');
      range.surroundContents(mark);
    }
  },

  copyReport() {
    const content = this.getEditorContent();
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
      document.getElementById('editor-content').innerText = result.generated_content;
      document.getElementById('refine-input').value = '';
    } catch (error) {
      alert('Failed to refine report: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Refine';
    }
  },

  async saveTitle() {
    const title = document.getElementById('report-title').value.trim();
    if (title && this.currentReport) {
      try {
        await API.updateReport(this.currentReport.id, { title });
        this.currentReport.title = title;
      } catch (error) {
        console.error('Failed to save title:', error);
      }
    }
  },

  async suggestChargesForReport() {
    const btn = document.getElementById('analyze-btn');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';

    try {
      // First save current content
      const content = this.getEditorContent();
      await API.updateReport(this.currentReport.id, { generated_content: content });

      // Get suggested charges
      const result = await API.suggestCharges(this.currentReport.id);
      this.suggestedCharges = result.charges || [];
      this.showSuggestedCharges(this.suggestedCharges);
    } catch (error) {
      alert('Failed to analyze report: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Analyze';
    }
  },

  showSuggestedCharges(charges) {
    const chargesSection = document.getElementById('charges-section');
    const chargesList = document.getElementById('charges-list');
    const legalContent = document.getElementById('legal-content');

    if (charges.length === 0) {
      legalContent.innerHTML = '<p class="text-muted">No criminal charges identified. This appears to be a non-criminal incident report.</p>';
      chargesSection.classList.add('hidden');
      return;
    }

    legalContent.innerHTML = '<p class="text-muted">Select charges below, then click "Check Elements" to verify your report meets all statutory requirements.</p>';

    chargesList.innerHTML = charges.map((c, i) => `
      <label class="charge-item">
        <input type="checkbox" value="${i}" checked>
        <div class="charge-item-info">
          <div class="charge-item-name">${escapeHtml(c.charge)}</div>
          <div class="charge-item-statute">${escapeHtml(c.statute)}</div>
          <div class="charge-item-level">${escapeHtml(c.level)}</div>
        </div>
      </label>
    `).join('');

    chargesSection.classList.remove('hidden');
  },

  async checkElementsForReport() {
    const btn = document.getElementById('check-elements-btn');
    btn.disabled = true;
    btn.textContent = 'Checking...';

    try {
      // Get selected charges
      const checkboxes = document.querySelectorAll('#charges-list input[type="checkbox"]:checked');
      const selectedCharges = Array.from(checkboxes).map(cb => {
        const charge = this.suggestedCharges[parseInt(cb.value)];
        return `${charge.charge} - ${charge.statute}`;
      });

      if (selectedCharges.length === 0) {
        alert('Please select at least one charge to check.');
        return;
      }

      // Check elements
      const result = await API.checkElements(this.currentReport.id, selectedCharges);
      this.showElementAnalysis(result.analysis);
    } catch (error) {
      alert('Failed to check elements: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Check Elements';
    }
  },

  showElementAnalysis(analysis) {
    const container = document.getElementById('legal-content');
    let html = '';

    analysis.forEach(chargeAnalysis => {
      html += `<div class="element-analysis">`;
      html += `<div class="element-charge-header">${escapeHtml(chargeAnalysis.charge)}</div>`;

      chargeAnalysis.elements.forEach(el => {
        const statusIcon = el.status === 'met' ? '✓' : el.status === 'weak' ? '⚠' : '✗';
        const statusLabel = el.status === 'met' ? 'Established' : el.status === 'weak' ? 'Needs Strengthening' : 'Missing';

        html += `
          <div class="element-item ${escapeHtml(el.status)}">
            <div class="element-status ${escapeHtml(el.status)}">${statusIcon} ${escapeHtml(el.element)} - ${statusLabel}</div>
            ${el.evidence ? `<div class="element-evidence">"${escapeHtml(el.evidence)}"</div>` : ''}
            ${el.suggestion ? `<div class="element-suggestion">${escapeHtml(el.suggestion)}</div>` : ''}
          </div>
        `;
      });

      html += `<div class="analysis-summary ${escapeHtml(chargeAnalysis.overall)}">${escapeHtml(chargeAnalysis.summary)}</div>`;
      html += `</div>`;
    });

    container.innerHTML = html;
  },

  async analyzeCaseLaw() {
    const btn = document.getElementById('caselaw-btn');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';

    try {
      // First save current content
      const content = this.getEditorContent();
      await API.updateReport(this.currentReport.id, { generated_content: content });

      // Hide charges section for this view
      document.getElementById('charges-section').classList.add('hidden');

      // Then analyze for case law
      const analysis = await API.analyzeReport(this.currentReport.id);
      this.showLegalAnalysis(analysis);
    } catch (error) {
      alert('Failed to analyze report: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Case Law';
    }
  },

  showLegalAnalysis(analysis) {
    const container = document.getElementById('legal-content');
    let html = '';

    if (analysis.validations?.length > 0) {
      html += '<h4>Actions Validated</h4>';
      analysis.validations.forEach(v => {
        html += `
          <div class="legal-item">
            <div class="legal-item-title">${escapeHtml(v.action)}</div>
            <div class="legal-item-content">${escapeHtml(v.case_law || '')} ${v.policy ? '• ' + escapeHtml(v.policy) : ''}</div>
          </div>
        `;
      });
    }

    if (analysis.clarifications?.length > 0) {
      html += '<h4 style="margin-top:1rem">Clarification Recommended</h4>';
      analysis.clarifications.forEach(c => {
        html += `
          <div class="legal-item clarification">
            <div class="legal-item-title">${escapeHtml(c.issue)}</div>
            <div class="legal-item-content">${escapeHtml(c.suggestion)}</div>
          </div>
        `;
      });
    }

    if (analysis.relevant_references?.length > 0) {
      html += '<h4 style="margin-top:1rem">Relevant Case Law</h4>';
      analysis.relevant_references.forEach(r => {
        html += `
          <div class="legal-item reference">
            <div class="legal-item-title">${escapeHtml(r.title)}</div>
            <div class="legal-item-content">${escapeHtml(r.citation)}<br>${escapeHtml(r.relevance)}</div>
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
      const content = this.getEditorContent();
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
  },

  // Settings functions
  async loadSettings() {
    await Promise.all([
      this.loadPolicies(),
      this.loadExamples()
    ]);
  },

  async loadPolicies() {
    try {
      const policies = await API.getPolicies();
      const policiesList = document.getElementById('policies-list');
      const caselawList = document.getElementById('caselaw-list');

      // Split into policies and case law based on filename prefix
      const deptPolicies = policies.filter(p => !p.filename.startsWith('[CASELAW]'));
      const caseLaw = policies.filter(p => p.filename.startsWith('[CASELAW]'));

      if (deptPolicies.length === 0) {
        policiesList.innerHTML = '<p class="text-muted">No policies uploaded yet.</p>';
      } else {
        policiesList.innerHTML = deptPolicies.map(p => `
          <div class="settings-item">
            <div class="settings-item-info">
              <h5>${escapeHtml(p.filename)}</h5>
              <p>Added ${escapeHtml(new Date(p.created_at).toLocaleDateString())}</p>
            </div>
            <button class="btn btn-delete" onclick="App.deletePolicy(${parseInt(p.id)})">Delete</button>
          </div>
        `).join('');
      }

      if (caseLaw.length === 0) {
        caselawList.innerHTML = '<p class="text-muted">No case law added yet.</p>';
      } else {
        caselawList.innerHTML = caseLaw.map(p => `
          <div class="settings-item">
            <div class="settings-item-info">
              <h5>${escapeHtml(p.filename.replace('[CASELAW] ', ''))}</h5>
              <p>Added ${escapeHtml(new Date(p.created_at).toLocaleDateString())}</p>
            </div>
            <button class="btn btn-delete" onclick="App.deletePolicy(${parseInt(p.id)})">Delete</button>
          </div>
        `).join('');
      }
    } catch (error) {
      console.error('Failed to load policies:', error);
    }
  },

  async loadExamples() {
    try {
      const examples = await API.getExamples();
      const list = document.getElementById('examples-list');

      if (examples.length === 0) {
        list.innerHTML = '<p class="text-muted">No examples uploaded yet.</p>';
      } else {
        list.innerHTML = examples.map(e => `
          <div class="settings-item">
            <div class="settings-item-info">
              <h5>${escapeHtml(e.report_type.charAt(0).toUpperCase() + e.report_type.slice(1))} Report</h5>
              <p>${escapeHtml(e.preview.substring(0, 50))}...</p>
            </div>
            <button class="btn btn-delete" onclick="App.deleteExample(${parseInt(e.id)})">Delete</button>
          </div>
        `).join('');
      }
    } catch (error) {
      console.error('Failed to load examples:', error);
    }
  },

  async uploadPolicy() {
    const name = document.getElementById('policy-name').value.trim();
    const content = document.getElementById('policy-content').value.trim();

    if (!name || !content) {
      alert('Please enter both a name and content for the policy.');
      return;
    }

    try {
      await API.uploadPolicy(name, content);
      document.getElementById('policy-name').value = '';
      document.getElementById('policy-content').value = '';
      await this.loadPolicies();
    } catch (error) {
      alert('Failed to upload policy: ' + error.message);
    }
  },

  async uploadCaselaw() {
    const name = document.getElementById('caselaw-name').value.trim();
    const content = document.getElementById('caselaw-content').value.trim();

    if (!name || !content) {
      alert('Please enter both a case name and summary.');
      return;
    }

    try {
      // Prefix with [CASELAW] to distinguish from policies
      await API.uploadPolicy('[CASELAW] ' + name, content);
      document.getElementById('caselaw-name').value = '';
      document.getElementById('caselaw-content').value = '';
      await this.loadPolicies();
    } catch (error) {
      alert('Failed to add case law: ' + error.message);
    }
  },

  async deletePolicy(id) {
    if (!confirm('Delete this document?')) return;

    try {
      await API.deletePolicy(id);
      await this.loadPolicies();
    } catch (error) {
      alert('Failed to delete: ' + error.message);
    }
  },

  async uploadExample() {
    const type = document.getElementById('example-type').value;
    const content = document.getElementById('example-content').value.trim();

    if (!content) {
      alert('Please paste a report example.');
      return;
    }

    try {
      await API.uploadExample(type, content);
      document.getElementById('example-content').value = '';
      await this.loadExamples();
    } catch (error) {
      alert('Failed to upload example: ' + error.message);
    }
  },

  async deleteExample(id) {
    if (!confirm('Delete this example?')) return;

    try {
      await API.deleteExample(id);
      await this.loadExamples();
    } catch (error) {
      alert('Failed to delete: ' + error.message);
    }
  }
};

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => App.init());
