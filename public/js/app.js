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
  subscriptionStatus: null,
  trialEndsAt: null,
  hasSubscription: false,

  // Court Prep state
  courtPrepSessionId: null,
  courtPrepReportId: null,
  courtPrepVoiceActive: false,

  _idleTimer: null,
  _idleWarningTimer: null,
  _lastActivity: Date.now(),

  init() {
    // Initialize Firebase Auth
    API.init();

    this.bindEvents();
    this.checkAuth();
    this._startIdleTracking();

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
    document.getElementById('manage-plan-btn').onclick = () => API.openCustomerPortal();
    document.getElementById('paywall-close-btn').onclick = () => this.hidePaywallModal();
    document.getElementById('paywall-subscribe-btn').onclick = () => this.startCheckout();
    document.getElementById('banner-subscribe-btn').onclick = () => this.startCheckout();

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
    document.getElementById('editor-court-prep-btn').onclick = () => this.startCourtPrep(this.currentReport.id);
    document.getElementById('save-draft-btn').onclick = () => this.saveReport('draft');
    document.getElementById('mark-complete-btn').onclick = () => this.saveReport('completed');
    document.getElementById('report-title').onblur = () => this.saveTitle();

    // Format toolbar buttons
    const commandToTag = { bold: 'strong', italic: 'em', underline: 'u' };
    document.querySelectorAll('.format-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const command = btn.dataset.command;
        if (command === 'highlight') {
          this.toggleHighlight();
        } else if (commandToTag[command]) {
          this.applyInlineFormat(commandToTag[command]);
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

    // Sanitize drag-and-drop content in contenteditable editor
    document.getElementById('editor-content').addEventListener('drop', (e) => {
      e.preventDefault();
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        document.execCommand('insertText', false, text);
      }
    });

    // Court Prep events
    document.getElementById('court-prep-back-btn').onclick = () => {
      this.courtPrepCleanup();
      this.showView('dashboard');
      this.loadReports();
    };
    document.getElementById('court-prep-send-btn').onclick = () => this.courtPrepSendMessage();
    document.getElementById('court-prep-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.courtPrepSendMessage();
      }
    });
    document.getElementById('court-prep-end-btn').onclick = () => this.courtPrepEndSession();
    document.getElementById('court-prep-debrief-btn').onclick = () => this.courtPrepGetDebrief();
    document.getElementById('court-prep-voice-btn').onclick = () => this.courtPrepToggleVoice();
    document.getElementById('court-prep-vuln-toggle').onclick = () => this.courtPrepToggleVuln();
  },

  checkAuth() {
    // Use Firebase auth state listener
    API.onAuthStateChanged((user) => {
      if (user) {
        document.getElementById('user-name').textContent = user.name || user.email;
        this.subscriptionStatus = user.subscription_status || 'trialing';
        this.trialEndsAt = user.trial_ends_at || null;
        this.hasSubscription = user.has_subscription || false;
        this.showApp();
        this.updateSubscriptionUI();

        // Handle return from Stripe Checkout
        const params = new URLSearchParams(window.location.search);
        if (params.get('subscription') === 'success') {
          window.history.replaceState({}, '', '/');
          // Refresh subscription state after a brief delay for webhook processing
          setTimeout(async () => {
            try {
              const data = await API.request('/auth/verify', { method: 'POST' });
              this.subscriptionStatus = data.user.subscription_status;
              this.trialEndsAt = data.user.trial_ends_at;
              this.hasSubscription = data.user.has_subscription;
              this.updateSubscriptionUI();
            } catch (e) {
              console.error('Failed to refresh subscription:', e);
            }
          }, 2000);
        }
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
    this._stopIdleTracking();
    this.currentReport = null;
    this.suggestedCharges = [];
    this.subscriptionStatus = null;
    this.trialEndsAt = null;
    this.hasSubscription = false;
    await API.logout();
    // Clear service worker caches on logout
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    this.showAuth();
  },

  updateSubscriptionUI() {
    const banner = document.getElementById('subscription-banner');
    const bannerText = document.getElementById('subscription-banner-text');
    const bannerBtn = document.getElementById('banner-subscribe-btn');
    const managePlanBtn = document.getElementById('manage-plan-btn');

    // Reset classes
    banner.classList.remove('warning', 'error');
    bannerBtn.classList.add('hidden');

    if (this.subscriptionStatus === 'active') {
      // Active subscriber — hide banner, show manage button
      banner.classList.add('hidden');
      managePlanBtn.classList.remove('hidden');
      return;
    }

    if (this.subscriptionStatus === 'trialing' && this.trialEndsAt) {
      const daysLeft = Math.max(0, Math.ceil((new Date(this.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)));
      if (daysLeft > 0) {
        banner.classList.remove('hidden');
        bannerText.textContent = `Free trial: ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`;
        bannerBtn.classList.remove('hidden');
        if (daysLeft <= 2) {
          banner.classList.add('warning');
        }
        managePlanBtn.classList.add('hidden');
        return;
      }
    }

    if (this.subscriptionStatus === 'past_due') {
      banner.classList.remove('hidden');
      banner.classList.add('warning');
      bannerText.textContent = 'Payment failed — please update your payment method';
      bannerBtn.classList.add('hidden');
      managePlanBtn.classList.remove('hidden');
      return;
    }

    // Trial expired or canceled
    if (!this.hasSubscription) {
      banner.classList.remove('hidden');
      banner.classList.add('error');
      bannerText.textContent = 'Trial ended — subscribe to use AI features';
      bannerBtn.classList.remove('hidden');
      managePlanBtn.classList.add('hidden');
      return;
    }

    // Default: hide
    banner.classList.add('hidden');
    managePlanBtn.classList.add('hidden');
  },

  showPaywallModal() {
    document.getElementById('paywall-overlay').classList.remove('hidden');
  },

  hidePaywallModal() {
    document.getElementById('paywall-overlay').classList.add('hidden');
  },

  async startCheckout() {
    try {
      const data = await API.createCheckoutSession();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      alert('Failed to start checkout: ' + error.message);
    }
  },

  _startIdleTracking() {
    const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    const WARNING_TIME = 25 * 60 * 1000; // 25 minutes

    const resetIdle = () => {
      this._lastActivity = Date.now();
      clearTimeout(this._idleWarningTimer);
      clearTimeout(this._idleTimer);

      this._idleWarningTimer = setTimeout(() => {
        if (!confirm('You have been idle for 25 minutes. Click OK to stay logged in, or Cancel to log out.')) {
          this.logout();
        } else {
          resetIdle();
        }
      }, WARNING_TIME);

      this._idleTimer = setTimeout(() => {
        this.logout();
      }, IDLE_TIMEOUT);
    };

    ['click', 'keydown', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, resetIdle, { passive: true });
    });

    resetIdle();
  },

  _stopIdleTracking() {
    clearTimeout(this._idleWarningTimer);
    clearTimeout(this._idleTimer);
  },

  showView(view) {
    document.getElementById('dashboard-view').classList.toggle('hidden', view !== 'dashboard');
    document.getElementById('input-view').classList.toggle('hidden', view !== 'input');
    document.getElementById('editor-view').classList.toggle('hidden', view !== 'editor');
    document.getElementById('court-prep-view').classList.toggle('hidden', view !== 'court-prep');
    document.getElementById('settings-view').classList.toggle('hidden', view !== 'settings');
    this.currentView = view;
  },

  async loadReports() {
    try {
      const data = await API.getReports();
      const list = document.getElementById('reports-list');

      if (data.reports.length === 0) {
        list.innerHTML = '<p class="text-muted">No reports yet. Start a new one above.</p>';
        return;
      }

      list.innerHTML = data.reports.map(r => {
        const hasContent = r.generated_content || r.final_content;
        return `
        <div class="report-item" data-id="${escapeHtml(r.id)}">
          <div class="report-item-info">
            <h4>${escapeHtml(r.title || 'Untitled')}</h4>
            <p>${escapeHtml(r.report_type)} • ${escapeHtml(new Date(r.updated_at).toLocaleDateString())}</p>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem">
            ${hasContent ? `<button class="court-prep-icon-btn" data-report-id="${escapeHtml(r.id)}" title="Court Prep">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </button>` : ''}
            <span class="status-badge ${escapeHtml(r.status)}">${escapeHtml(r.status)}</span>
          </div>
        </div>
      `}).join('');

      if (data.total > data.page * data.limit) {
        list.innerHTML += `<button id="load-more-btn" class="btn btn-secondary" style="width:100%;margin-top:1rem">Load More</button>`;
        document.getElementById('load-more-btn').onclick = () => this.loadMoreReports(data.page + 1);
      }

      list.querySelectorAll('.report-item').forEach(item => {
        item.onclick = (e) => {
          // Don't open report if clicking the court prep button
          if (e.target.closest('.court-prep-icon-btn')) return;
          this.openReport(item.dataset.id);
        };
      });

      // Bind court prep icon buttons
      list.querySelectorAll('.court-prep-icon-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          this.startCourtPrep(btn.dataset.reportId);
        };
      });
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  },

  async loadMoreReports(page) {
    try {
      const btn = document.getElementById('load-more-btn');
      btn.disabled = true;
      btn.textContent = 'Loading...';

      const data = await API.getReports(null, page);
      const list = document.getElementById('reports-list');

      // Remove the existing Load More button
      btn.remove();

      // Append new report items
      const newItems = data.reports.map(r => {
        const hasContent = r.generated_content || r.final_content;
        return `
        <div class="report-item" data-id="${escapeHtml(r.id)}">
          <div class="report-item-info">
            <h4>${escapeHtml(r.title || 'Untitled')}</h4>
            <p>${escapeHtml(r.report_type)} • ${escapeHtml(new Date(r.updated_at).toLocaleDateString())}</p>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem">
            ${hasContent ? `<button class="court-prep-icon-btn" data-report-id="${escapeHtml(r.id)}" title="Court Prep">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </button>` : ''}
            <span class="status-badge ${escapeHtml(r.status)}">${escapeHtml(r.status)}</span>
          </div>
        </div>
      `}).join('');
      list.innerHTML += newItems;

      // Add Load More button if there are still more pages
      if (data.total > data.page * data.limit) {
        list.innerHTML += `<button id="load-more-btn" class="btn btn-secondary" style="width:100%;margin-top:1rem">Load More</button>`;
        document.getElementById('load-more-btn').onclick = () => this.loadMoreReports(data.page + 1);
      }

      // Bind click handlers for all items
      list.querySelectorAll('.report-item').forEach(item => {
        item.onclick = (e) => {
          if (e.target.closest('.court-prep-icon-btn')) return;
          this.openReport(item.dataset.id);
        };
      });

      list.querySelectorAll('.court-prep-icon-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          this.startCourtPrep(btn.dataset.reportId);
        };
      });
    } catch (error) {
      console.error('Failed to load more reports:', error);
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
      const result = await API.generateReport(this.currentReport.id, transcript, { incomplete: true });
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

  applyInlineFormat(tagName) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    if (!selectedText) return;

    const parent = range.commonAncestorContainer.parentElement;
    if (parent.tagName === tagName.toUpperCase()) {
      // Remove formatting - unwrap
      const text = document.createTextNode(parent.textContent);
      parent.parentNode.replaceChild(text, parent);
    } else {
      // Apply formatting - wrap
      const el = document.createElement(tagName);
      range.surroundContents(el);
    }
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
  },

  // --- Court Prep Methods ---

  async startCourtPrep(reportId) {
    // Prevent double-click
    if (this._courtPrepStarting) return;
    this._courtPrepStarting = true;

    try {
      // Load report if not already loaded
      const report = this.currentReport && this.currentReport.id === reportId
        ? this.currentReport
        : await API.getReport(reportId);

      const reportContent = report.final_content || report.generated_content;
      if (!reportContent) {
        alert('This report has no content to analyze. Generate or write content first.');
        return;
      }

      this.courtPrepReportId = reportId;

      // Set up the view
      document.getElementById('court-prep-report-title').textContent = report.title || 'Untitled Report';
      document.getElementById('court-prep-report-content').textContent = reportContent;
      document.getElementById('court-prep-messages').innerHTML = `
        <div id="court-prep-loading" class="court-prep-loading">
          <div class="court-prep-spinner"></div>
          <p>Analyzing report for vulnerabilities...</p>
        </div>
      `;
      document.getElementById('court-prep-vuln-section').classList.add('hidden');
      document.getElementById('court-prep-input-area').classList.add('hidden');
      this.courtPrepUpdateStatus('analyzing');
      this.showView('court-prep');

      // Start the session
      const result = await API.courtPrepStart(reportId);
      this.courtPrepSessionId = result.session_id;

      // Show vulnerability assessment
      document.getElementById('court-prep-vuln-content').textContent = result.vulnerability_assessment;
      document.getElementById('court-prep-vuln-section').classList.remove('hidden');

      // Show first question
      document.getElementById('court-prep-messages').innerHTML = '';
      this.courtPrepAddMessage('assistant', result.first_question);

      // Enable input
      document.getElementById('court-prep-input-area').classList.remove('hidden');
      this.courtPrepUpdateStatus('active');
      document.getElementById('court-prep-input').focus();
    } catch (error) {
      alert('Failed to start court prep: ' + error.message);
      this.showView('dashboard');
    } finally {
      this._courtPrepStarting = false;
    }
  },

  async courtPrepSendMessage() {
    const input = document.getElementById('court-prep-input');
    const message = input.value.trim();
    if (!message) return;

    // Stop voice if recording
    if (this.courtPrepVoiceActive) {
      this.courtPrepStopVoice();
    }

    const sendBtn = document.getElementById('court-prep-send-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    input.disabled = true;

    // Show user message immediately
    this.courtPrepAddMessage('user', message);
    input.value = '';

    try {
      const result = await API.courtPrepMessage(
        this.courtPrepReportId,
        this.courtPrepSessionId,
        message
      );
      this.courtPrepAddMessage('assistant', result.response);
    } catch (error) {
      this.courtPrepAddMessage('assistant', 'Error: ' + error.message);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      input.disabled = false;
      input.focus();
    }
  },

  courtPrepAddMessage(role, content) {
    const container = document.getElementById('court-prep-messages');
    const isAttorney = role === 'assistant';
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const msgDiv = document.createElement('div');
    msgDiv.className = `court-prep-msg ${isAttorney ? 'court-prep-msg-attorney' : 'court-prep-msg-officer'}`;
    msgDiv.innerHTML = `
      <div class="court-prep-msg-label">${isAttorney ? 'Defense Attorney' : 'You (Officer)'}</div>
      <div>${escapeHtml(content)}</div>
      <div class="court-prep-msg-time">${escapeHtml(timeStr)}</div>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  },

  async courtPrepEndSession() {
    if (!confirm('End this cross-examination session?')) return;

    try {
      await API.courtPrepEnd(this.courtPrepReportId, this.courtPrepSessionId);
      this.courtPrepUpdateStatus('completed');
      document.getElementById('court-prep-input-area').classList.add('hidden');
      this.courtPrepAddMessage('assistant', 'Cross-examination session ended.');
    } catch (error) {
      alert('Failed to end session: ' + error.message);
    }
  },

  async courtPrepGetDebrief() {
    const btn = document.getElementById('court-prep-debrief-btn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      const result = await API.courtPrepDebrief(this.courtPrepReportId, this.courtPrepSessionId);

      this.courtPrepUpdateStatus('completed');
      document.getElementById('court-prep-input-area').classList.add('hidden');

      // Show debrief in chat area
      const container = document.getElementById('court-prep-messages');
      const debriefDiv = document.createElement('div');
      debriefDiv.className = 'court-prep-debrief';
      debriefDiv.innerHTML = `
        <div class="court-prep-debrief-header">Performance Debrief</div>
        <div class="court-prep-debrief-content">${escapeHtml(result.debrief)}</div>
      `;
      container.appendChild(debriefDiv);
      container.scrollTop = container.scrollHeight;
    } catch (error) {
      alert('Failed to generate debrief: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Get Debrief';
    }
  },

  courtPrepToggleVoice() {
    if (this.courtPrepVoiceActive) {
      this.courtPrepStopVoice();
    } else {
      this.courtPrepStartVoice();
    }
  },

  courtPrepStartVoice() {
    const input = document.getElementById('court-prep-input');
    const btn = document.getElementById('court-prep-voice-btn');

    // Save existing voice callbacks
    this._savedVoiceOnResult = Voice.onResult;
    this._savedVoiceOnStateChange = Voice.onStateChange;

    Voice.onResult = (final, interim) => {
      input.value = final + interim;
    };

    Voice.onStateChange = (isRecording) => {
      if (isRecording) {
        btn.classList.add('recording');
        this.courtPrepVoiceActive = true;
      } else {
        btn.classList.remove('recording');
        this.courtPrepVoiceActive = false;
      }
    };

    const existingText = input.value.trim();
    Voice.start(existingText);
  },

  courtPrepStopVoice() {
    Voice.stop();
    const btn = document.getElementById('court-prep-voice-btn');
    btn.classList.remove('recording');
    this.courtPrepVoiceActive = false;

    // Restore original voice callbacks
    if (this._savedVoiceOnResult) {
      Voice.onResult = this._savedVoiceOnResult;
      Voice.onStateChange = this._savedVoiceOnStateChange;
      this._savedVoiceOnResult = null;
      this._savedVoiceOnStateChange = null;
    }
  },

  courtPrepToggleVuln() {
    const toggle = document.getElementById('court-prep-vuln-toggle');
    const content = document.getElementById('court-prep-vuln-content');
    toggle.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
  },

  courtPrepUpdateStatus(status) {
    const badge = document.getElementById('court-prep-status');
    badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    badge.className = 'court-prep-status-badge ' + status;
  },

  courtPrepCleanup() {
    // Stop voice if active
    if (this.courtPrepVoiceActive) {
      this.courtPrepStopVoice();
    }
    this.courtPrepSessionId = null;
    this.courtPrepReportId = null;
  }
};

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => App.init());
