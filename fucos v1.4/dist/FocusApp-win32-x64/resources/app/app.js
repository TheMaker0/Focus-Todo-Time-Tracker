  // ──────────── STATE ────────────
  let items   = JSON.parse(localStorage.getItem('focus_items_v2')   || '[]');
  let history = JSON.parse(localStorage.getItem('focus_history_v2') || '[]');

  // dayLogs: array of days, each day = { id, label, date, entries: [{itemId, title, account, timeIn, timeOut, duration}] }
  let dayLogs = JSON.parse(localStorage.getItem('focus_daylogs_v1') || '[]');
  let sheetBooks = JSON.parse(localStorage.getItem('focus_sheet_v1') || '[]');
  let currentSheetIndex = 0;

  let currentTab  = 'all';
  let currentType = 'todo';
  let editId      = null;
  let editingLogEntry = null;
  let mobFabOpen  = false;
  let timerInterval = null;
  let currentDayIndex = 0; // which day is selected in the Day Log view
  let dayLogSelectedEntries = new Set();
  const ROOT_DB_KEY = 'focusDB_v1';
  const USERS_KEY = 'focus_users_v1';
  const CURRENT_USER_KEY = 'focus_current_user_v1';
  const CURRENT_USER_DISPLAY_KEY = 'focus_current_user_display_v1';
  const CURRENT_USER_ROLE_KEY = 'focus_current_user_role_v1';
  const LOGIN_PAGE_PATH = 'login.html';
  let currentUser = localStorage.getItem(CURRENT_USER_KEY) || localStorage.getItem('focus_current_user') || '';
  let currentUserDisplay = localStorage.getItem(CURRENT_USER_DISPLAY_KEY) || '';
  let currentUserRole = localStorage.getItem(CURRENT_USER_ROLE_KEY) || 'user';
  let authMode = 'login'; // 'login' or 'register'
  const databaseJsonUrl = 'database.json';
  const serverSaveUrl = '/api/db.php';
  const userApiUrl = '/api/users.php';

  // Slack integration settings
  const SLACK_WEBHOOK_STORAGE_KEY = 'focus_slack_webhook';
  const SLACK_BOT_TOKEN_KEY = 'focus_slack_bot_token';
  const SLACK_TARGET_STORAGE_KEY = 'focus_slack_target';
  let slackWebhookUrl = localStorage.getItem(SLACK_WEBHOOK_STORAGE_KEY) || '';
  let slackBotToken = localStorage.getItem(SLACK_BOT_TOKEN_KEY) || '';
  let slackTarget = localStorage.getItem(SLACK_TARGET_STORAGE_KEY) || '';

  // Slack send history stored locally to allow edits/resends when possible
  const SLACK_HISTORY_KEY = 'focus_slack_history_v1';

  function getSlackHistory() {
    try { return JSON.parse(localStorage.getItem(SLACK_HISTORY_KEY) || '[]'); } catch (e) { return []; }
  }

  function saveSlackHistory(hist) {
    localStorage.setItem(SLACK_HISTORY_KEY, JSON.stringify(hist || []));
    // update tab count
    const el = document.getElementById('tcSlackM'); if (el) el.textContent = (hist || []).length;
  }

  function addSlackHistoryEntry(entry) {
    const hist = getSlackHistory();
    // normalize entry with fields
    const normalized = Object.assign({ id: Date.now(), itemId: entry.itemId || null, text: entry.text || '', target: entry.target || '', sentAt: entry.sentAt || Date.now(), editable: !!entry.editable, meta: entry.meta || null, status: entry.status || 'sent', previousText: null }, entry);
    hist.push(normalized);
    saveSlackHistory(hist);
  }

  function setSlackWebhook(url) {
    slackWebhookUrl = url || '';
    if (slackWebhookUrl) localStorage.setItem(SLACK_WEBHOOK_STORAGE_KEY, slackWebhookUrl);
    else localStorage.removeItem(SLACK_WEBHOOK_STORAGE_KEY);
  }

  function setSlackBotToken(token) {
    slackBotToken = token || '';
    if (slackBotToken) localStorage.setItem(SLACK_BOT_TOKEN_KEY, slackBotToken);
    else localStorage.removeItem(SLACK_BOT_TOKEN_KEY);
  }

  function setSlackTarget(target) {
    slackTarget = target || '';
    if (slackTarget) localStorage.setItem(SLACK_TARGET_STORAGE_KEY, slackTarget);
    else localStorage.removeItem(SLACK_TARGET_STORAGE_KEY);
  }

  function buildSlackMessageText(item) {
    const typeLine = item.type ? item.type.toUpperCase() : 'TASK';
    const codeTitle = [item.code || '', item.title || ''].filter(Boolean).join('\t');
    const accountLine = item.account || '';
    const rawDesc = item.desc || '';
    const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    // split desc into lines, trim and remove ETC lines
    let descLines = rawDesc.split(/\r?\n/).map(l => l.trim()).filter(Boolean).filter(l => !/^ETC:/i.test(l));
    // if the first line of desc duplicates the type line, remove it
    if (descLines.length > 0 && norm(descLines[0]) === norm(typeLine)) descLines.shift();
    // remove consecutive duplicate lines within desc
    for (let i = 1; i < descLines.length; i++) {
      if (norm(descLines[i]) === norm(descLines[i - 1])) { descLines.splice(i, 1); i--; }
    }

    // assemble parts and collapse consecutive duplicates across parts
    const parts = [typeLine];
    if (codeTitle) parts.push(codeTitle);
    if (accountLine) parts.push(accountLine);
    parts.push(...descLines);
    const final = [];
    parts.forEach(p => {
      if (!p) return;
      if (final.length > 0 && norm(final[final.length - 1]) === norm(p)) return;
      final.push(p);
    });
    if (item.etc) final.push(`ETC: ${item.etc}`);
    return final.join('\n');
  }

  async function broadcastToIncomingWebhook(item) {
    const webhookUrl = localStorage.getItem(SLACK_WEBHOOK_STORAGE_KEY)
      || slackWebhookUrl
      || localStorage.getItem('slack_webhook')
      || '';

    if (!webhookUrl) {
      console.log('No webhook stored. Skipping slack transmission.');
      return false;
    }

    const messageText = buildSlackMessageText(item);
    const payload = { text: messageText };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify(payload)
      });

      console.log('Status relayed safely over Webhook connection!');
      return true;
    } catch (e) {
      console.error('Webhook endpoint failure:', e);
      return false;
    }
  }

  async function sendSlackNotification(item) {
    try {
      const webhookUrl = (localStorage.getItem(SLACK_WEBHOOK_STORAGE_KEY) || slackWebhookUrl || localStorage.getItem('slack_webhook') || '').trim();
      const botToken = (localStorage.getItem(SLACK_BOT_TOKEN_KEY) || slackBotToken || localStorage.getItem('slack_bot_token') || '').trim();
      const configValue = botToken || webhookUrl;
      if (!configValue) { console.warn('Slack webhook/token not configured'); showToast('⚠️ Slack webhook or bot token not set'); return; }
      const text = buildSlackMessageText(item);
      const target = (localStorage.getItem(SLACK_TARGET_STORAGE_KEY) || slackTarget || '').trim();

      if (!botToken && webhookUrl && webhookUrl.startsWith('https://hooks.slack.com/services/')) {
        const sent = await broadcastToIncomingWebhook(item);
        if (!sent) {
          showToast('⚠️ Slack webhook send may have failed');
          return;
        }
        // Record history — incoming webhooks can't be edited via Slack API
        addSlackHistoryEntry({
          id: Date.now(),
          itemId: item.id,
          text,
          target: configValue,
          sentAt: Date.now(),
          editable: false,
          meta: null
        });
      } else if (botToken && (botToken.startsWith('xoxb-') || botToken.startsWith('xoxp-'))) {
        if (!target) { showToast('⚠️ Slack target required for bot token'); return; }
        const payload = { channel: target, text };
        const res = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${botToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const body = await res.json();
        if (!body.ok) {
          console.warn('Slack API error', body);
          showToast(`⚠️ Slack API failed${body.error ? `: ${body.error}` : ''}`);
          return;
        }
        // Save message metadata so we can update the message later via chat.update
        addSlackHistoryEntry({
          id: Date.now(),
          itemId: item.id,
          text,
          target, // channel
          sentAt: Date.now(),
          editable: true,
          meta: { channel: body.channel || target, ts: body.ts }
        });
      } else {
        console.warn('Unsupported Slack config value', configValue);
        showToast('⚠️ Invalid Slack webhook/token');
        return;
      }
      showToast('✅ Slack message sent');
    } catch (err) {
      console.warn('Failed to send Slack notification', err);
      showToast(`⚠️ Slack send error${err?.message ? `: ${err.message}` : ''}`);
    }
  }

  // UI helpers for Slack settings modal
  function openSlackSettings() {
    const bg = document.getElementById('slackSettingsBg');
    if (!bg) return;
    const web = document.getElementById('slackWebhookInput');
    const bot = document.getElementById('slackBotInput');
    const tgt = document.getElementById('slackTargetInput');
    if (web) web.value = localStorage.getItem(SLACK_WEBHOOK_STORAGE_KEY) || slackWebhookUrl || '';
    if (bot) bot.value = localStorage.getItem(SLACK_BOT_TOKEN_KEY) || slackBotToken || '';
    if (tgt) tgt.value = localStorage.getItem(SLACK_TARGET_STORAGE_KEY) || slackTarget || '';
    bg.style.display = 'flex';
  }

  function closeSlackSettings() { const bg = document.getElementById('slackSettingsBg'); if (bg) bg.style.display = 'none'; }

  function saveSlackSettings() {
    const web = document.getElementById('slackWebhookInput');
    const bot = document.getElementById('slackBotInput');
    const tgt = document.getElementById('slackTargetInput');
    const wv = web ? web.value.trim() : '';
    const bv = bot ? bot.value.trim() : '';
    const tv = tgt ? tgt.value.trim() : '';
    // basic validation for bot token
    if (bv && !(bv.startsWith('xoxb-') || bv.startsWith('xoxp-'))) {
      if (!confirm('The bot token does not look like a standard Bot token (xoxb-...). Save anyway?')) {
        return;
      }
    }
    setSlackWebhook(wv);
    setSlackBotToken(bv);
    setSlackTarget(tv);
    showToast('✅ Slack settings saved');
    closeSlackSettings();
  }

  // Support modal handlers (Buy Me a Coffee)
  function openSupportModal() {
    const bg = document.getElementById('supportModalBg');
    if (bg) bg.style.display = 'flex';
  }
  function closeSupportModal() {
    const bg = document.getElementById('supportModalBg');
    if (bg) bg.style.display = 'none';
  }
  // attach listeners once DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('supportBtn');
    if (btn) btn.addEventListener('click', openSupportModal);
    const bg = document.getElementById('supportModalBg');
    if (bg) bg.addEventListener('click', (e) => { if (e.target === bg) closeSupportModal(); });
  });

  // add Slack tab to tabs bar dynamically
  document.addEventListener('DOMContentLoaded', () => {
    const tabsBar = document.querySelector('.tabs-bar');
    if (tabsBar && !document.querySelector('.tab[data-tab="slack"]')) {
      const tab = document.createElement('div');
      tab.className = 'tab'; tab.dataset.tab = 'slack';
      tab.innerHTML = 'Slack <span class="tab-count" id="tcSlackM">0</span>';
      tab.onclick = () => switchTab('slack');
      tabsBar.appendChild(tab);
    }
  });

  // Global Escape handler to close overlays/modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ['sheetBg','slackSettingsBg','slackEditBg','supportModalBg','importPadBg','templateModalBg','etcModalBg','printLogArea'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
      });
      const stray = document.getElementById('slackEditBg'); if (stray && stray.parentNode) stray.parentNode.removeChild(stray);
    }
  });

  // Import Pad helpers
  function openImportPad() { const bg = document.getElementById('importPadBg'); if (bg) bg.style.display = 'flex'; const ta = document.getElementById('importPadTextarea'); if (ta) ta.value = ''; }
  function closeImportPad() { const bg = document.getElementById('importPadBg'); if (bg) bg.style.display = 'none'; }
  function parseImportText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 3) return null;
    const type = (lines[0] || 'ongoing').toLowerCase();
    // Line 2: code[TAB]title
    let code = '', title = '';
    const line2 = lines[1] || '';
    if (line2.indexOf('\t') !== -1) {
      const parts = line2.split('\t');
      code = parts[0].trim();
      title = parts.slice(1).join('\t').trim();
    } else if (line2.match(/^([\w\-0-9]+)\s+/)) {
      const m = line2.match(/^([\w\-0-9]+)\s+(.*)$/);
      code = m[1];
      title = m[2];
    } else {
      title = line2;
    }
    const account = (lines[2] || '').trim();
    const desc = title;
    return { type, code, title, account, desc };
  }
  function importPadSubmit() {
    const ta = document.getElementById('importPadTextarea'); if (!ta) return; 
    const parsed = parseImportText(ta.value || '');
    if (!parsed) { showToast('⚠️ Import failed — invalid format'); return; }
    const now = Date.now();
    const newItem = { 
      id: now + Math.random(), 
      type: parsed.type || 'ongoing', 
      title: parsed.title || '', 
      desc: parsed.desc || '', 
      code: parsed.code || '',
      account: parsed.account || '', 
      done: false, 
      created: now, 
      timeIn: null, 
      timeOut: null 
    };
    items.push(newItem); 
    saveAll(); 
    render(); 
    closeImportPad(); 
    showToast('✅ Imported task');
  }

  // ETC modal helpers
  let _etcEditingId = null;
  function openEtcModal(id) { _etcEditingId = id; const bg = document.getElementById('etcModalBg'); const inp = document.getElementById('etcInput'); if (bg) bg.style.display = 'flex'; const item = items.find(i => i.id === id); if (inp) inp.value = item ? (item.etc || '') : ''; }
  function closeEtcModal() { _etcEditingId = null; const bg = document.getElementById('etcModalBg'); if (bg) bg.style.display = 'none'; }
  function saveEtc() { if (!_etcEditingId) return; const inp = document.getElementById('etcInput'); const val = inp ? inp.value.trim() : ''; const item = items.find(i => i.id === _etcEditingId); if (!item) { showToast('⚠️ Item not found'); closeEtcModal(); return; } item.etc = val; saveAll(); render(); closeEtcModal(); showToast('✅ ETC saved'); }

  function clearSlackSettings() {
    setSlackWebhook(''); setSlackBotToken(''); setSlackTarget('');
    const web = document.getElementById('slackWebhookInput');
    const bot = document.getElementById('slackBotInput');
    const tgt = document.getElementById('slackTargetInput');
    if (web) web.value = '';
    if (bot) bot.value = '';
    if (tgt) tgt.value = '';
    showToast('✅ Slack settings cleared');
  }

  function getStoredUsers() {
    try { return JSON.parse(localStorage.getItem (USERS_KEY) || '{}'); } catch (e) { return {}; }
  }

  // Send a single item to Slack via configured webhook
  async function sendSlackForItem(id) {
    const item = items.find(i => i.id === id);
    if (!item) { showToast('⚠️ Item not found'); return; }
    if (!item.type || item.type !== 'ongoing') {
      // allow sending other types too but warn
      if (!confirm('This item is not an ongoing task. Send anyway?')) return;
    }
    await sendSlackNotification(item);
  }

  function saveStoredUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function saveCurrentUser(user) {
    currentUser = user;
    localStorage.setItem(CURRENT_USER_KEY, user);
    localStorage.removeItem('focus_current_user');
    updateUserDisplay();
  }

  function saveCurrentUserDisplay(name) {
    currentUserDisplay = name || '';
    localStorage.setItem(CURRENT_USER_DISPLAY_KEY, currentUserDisplay);
  }

  function saveCurrentUserRole(role) {
    currentUserRole = role || 'user';
    localStorage.setItem(CURRENT_USER_ROLE_KEY, currentUserRole);
  }

  function loadCurrentUser() {
    currentUser = localStorage.getItem(CURRENT_USER_KEY) || localStorage.getItem('focus_current_user') || '';
    currentUserDisplay = localStorage.getItem(CURRENT_USER_DISPLAY_KEY) || '';
    currentUserRole = localStorage.getItem(CURRENT_USER_ROLE_KEY) || 'user';
    updateUserDisplay();
  }

  function getStorageKey(key) {
    return currentUser ? `focus_${key}_${currentUser}` : `focus_${key}_v2`;
  }

  function getStoredTemplates() {
    try { return JSON.parse(localStorage.getItem(getStorageKey('templates')) || '[]'); } catch (e) { return []; }
  }

  function saveStoredTemplates(templates) {
    localStorage.setItem(getStorageKey('templates'), JSON.stringify(templates));
  }

  function getSelectedTemplateId() {
    return localStorage.getItem(getStorageKey('selected_template')) || '';
  }

  function setSelectedTemplateId(templateId) {
    if (templateId) {
      localStorage.setItem(getStorageKey('selected_template'), templateId);
    } else {
      localStorage.removeItem(getStorageKey('selected_template'));
    }
    render();
  }

  function getSelectedTemplateSpec() {
    const templates = getStoredTemplates();
    if (templates.length === 0) {
      const defaultTemplate = {
        id: 'tpl_default',
        name: 'Standard Log',
        content: '<h1>{{TITLE}}</h1><p>{{SUBTITLE}}</p>{{TABLE}}'
      };
      saveStoredTemplates([defaultTemplate]);
      localStorage.setItem(getStorageKey('selected_template'), defaultTemplate.id);
      return defaultTemplate;
    }

    const selectedId = getSelectedTemplateId();
    const template = templates.find(t => t.id === selectedId) || templates[0];
    if (!selectedId && template) {
      localStorage.setItem(getStorageKey('selected_template'), template.id);
    }
    return template;
  }

  function mergeTemplateHtml(templateContent, tableHtml) {
    if (!templateContent || !tableHtml) return tableHtml;
    if (templateContent.includes('{{TABLE}}')) {
      return templateContent.replace(/{{TABLE}}/g, tableHtml);
    }
    return `${templateContent}\n${tableHtml}`;
  }

  function renderTemplateButtons() {
    const wrapper = document.createElement('div');
    wrapper.className = 'template-button-panel';
    wrapper.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; align-items:center;';

    getSelectedTemplateSpec();
    const templates = getStoredTemplates();
    const selectedId = getSelectedTemplateId();
    templates.forEach(template => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'template-btn' + (template.id === selectedId ? ' selected' : '');
      btn.textContent = template.name;
      btn.onclick = () => setSelectedTemplateId(template.id);
      wrapper.appendChild(btn);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'template-add-btn';
    addBtn.textContent = '📄 Add Template';
    addBtn.onclick = () => openTemplateModal();
    wrapper.appendChild(addBtn);

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'template-view-btn';
    viewBtn.textContent = '👁️ View';
    viewBtn.disabled = templates.length === 0;
    viewBtn.onclick = previewSelectedTemplate;
    wrapper.appendChild(viewBtn);

    return wrapper;
  }

  function openTemplateModal(templateId = '') {
    const bg = document.getElementById('templateModalBg');
    const nameInput = document.getElementById('templateNameInput');
    const htmlInput = document.getElementById('templateHtmlInput');
    const previewArea = document.getElementById('templatePreviewArea');
    const modalTitle = document.getElementById('templateModalTitle');

    if (!bg || !nameInput || !htmlInput || !previewArea || !modalTitle) return;

    bg.dataset.editId = templateId || '';
    if (templateId) {
      const template = getStoredTemplates().find(t => t.id === templateId);
      if (template) {
        nameInput.value = template.name;
        htmlInput.value = template.content;
        modalTitle.textContent = 'Edit Template';
      }
    } else {
      nameInput.value = '';
      htmlInput.value = '<h1>{{TITLE}}</h1>\n<p>{{SUBTITLE}}</p>\n{{TABLE}}';
      modalTitle.textContent = 'Add Template';
    }
    previewArea.innerHTML = '';
    bg.classList.add('open');
  }

  function closeTemplateModal() {
    const bg = document.getElementById('templateModalBg');
    if (!bg) return;
    bg.classList.remove('open');
  }

  function saveTemplateFromModal() {
    const bg = document.getElementById('templateModalBg');
    const nameInput = document.getElementById('templateNameInput');
    const htmlInput = document.getElementById('templateHtmlInput');
    if (!bg || !nameInput || !htmlInput) return;

    const name = nameInput.value.trim() || 'Untitled Template';
    const content = htmlInput.value.trim();
    if (!content) {
      alert('Template HTML cannot be empty.');
      return;
    }

    const templates = getStoredTemplates();
    const editId = bg.dataset.editId;

    if (editId) {
      const template = templates.find(t => t.id === editId);
      if (template) {
        template.name = name;
        template.content = content;
      }
    } else {
      templates.push({ id: `tpl_${Date.now()}`, name, content });
    }

    saveStoredTemplates(templates);
    if (!getSelectedTemplateId()) {
      localStorage.setItem(getStorageKey('selected_template'), templates[templates.length - 1].id);
    }
    closeTemplateModal();
    render();
  }

  function previewSelectedTemplate() {
    const selectedId = getSelectedTemplateId();
    if (!selectedId) return;
    openTemplateModal(selectedId);
    const previewArea = document.getElementById('templatePreviewArea');
    if (!previewArea) return;
    const template = getStoredTemplates().find(t => t.id === selectedId);
    if (!template) return;
    const tableHtml = '<div style="border:1px solid #ccc;padding:12px;margin-top:12px;">Template preview will replace {{TABLE}} with a table when exporting.</div>';
    previewArea.innerHTML = mergeTemplateHtml(template.content, tableHtml);
  }

  function previewTemplateContent() {
    previewSelectedTemplate();
  }

  function importTemplateFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const htmlInput = document.getElementById('templateHtmlInput');
      if (htmlInput) htmlInput.value = reader.result;
    };
    reader.readAsText(file);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getAccountKey(user) {
    return `focus_account_${user}`;
  }

  async function hashPassword(password) {
    if (!password) return '';
    const data = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function ensureUserStorageKeys(userName) {
    if (!userName) return;
    if (!localStorage.getItem(`focus_items_${userName}`)) localStorage.setItem(`focus_items_${userName}`, '[]');
    if (!localStorage.getItem(`focus_history_${userName}`)) localStorage.setItem(`focus_history_${userName}`, '[]');
    if (!localStorage.getItem(`focus_daylogs_${userName}`)) localStorage.setItem(`focus_daylogs_${userName}`, '[]');
  }

  function ensureAllUserStorageKeys(users) {
    const knownUsers = new Set(Object.keys(users || {}));
    ['gen', 'mark', 'it'].forEach(u => knownUsers.add(u));
    knownUsers.forEach(ensureUserStorageKeys);
  }

  // Ensure there's always at least one day
  function ensureDay() {
    if (dayLogs.length === 0) {
      dayLogs.push({ id: Date.now(), label: 'Day 1', date: new Date().toLocaleDateString('en-PH', {month:'short', day:'numeric', year:'numeric'}), entries: [] });
      saveAll();
    }
    if (currentDayIndex >= dayLogs.length) currentDayIndex = dayLogs.length - 1;
  }

  function seedDemoData() {
    const now = Date.now();
    items = [
      { id:now-5000, type:'todo',    title:'Set up project structure',     desc:'Create folders and initial config files.', account:'', done:false, created:now-5000, timeIn:now-5000, timeOut:null },
      { id:now-4000, type:'ongoing', title:'Design the new dashboard UI',  desc:'Working on wireframes and component layout.', account:'alangalang', done:false, created:now-4000, timeIn:now-4000, timeOut:null },
      { id:now-3000, type:'pending', title:'Review pull request #42',      desc:'Waiting for feedback from the team.', account:'', done:false, created:now-3000, timeIn:now-3000, timeOut:null },
      { id:now-2000, type:'note',    title:'Meeting notes — May 20',       desc:'Discussed roadmap priorities. Next sprint: Records module + Auth overhaul.', account:'', done:false, created:now-2000, timeIn:null, timeOut:null },
      { id:now-1000, type:'todo',    title:'Write unit tests for login',   desc:'', account:'', done:false, created:now-1000, timeIn:now-1000, timeOut:null },
    ];
  }

  async function seedDemoUsers() {
    const users = getStoredUsers();
    const hash = await hashPassword('123');
    const adminHash = await hashPassword('admin123');
    let changed = false;

    if (!users.gen) {
      users.gen = { pwd: hash, display: 'Gen', createdAt: Date.now() };
      changed = true;
    }
    if (!users.mark) {
      users.mark = { pwd: hash, display: 'Mark', createdAt: Date.now() };
      changed = true;
    }
    if (!users.it) {
      users.it = { pwd: adminHash, display: 'Admin', createdAt: Date.now(), role: 'admin' };
      changed = true;
    }

    if (changed) {
      saveStoredUsers(users);
    }
    ensureAllUserStorageKeys(users);
  }

  async function loadDatabaseJson() {
    if (!currentUser && (items.length || history.length || dayLogs.length)) return false;
    const loadLocal = () => {
      const storedItems = localStorage.getItem(getStorageKey('items')) || '[]';
      const storedHistory = localStorage.getItem(getStorageKey('history')) || '[]';
      const storedDayLogs = localStorage.getItem(getStorageKey('daylogs')) || '[]';
      try {
        items = JSON.parse(storedItems);
        history = JSON.parse(storedHistory);
        dayLogs = JSON.parse(storedDayLogs);
        return true;
      } catch (err) {
        return false;
      }
    };

    if (currentUser && window.location.protocol === 'file:') {
      return loadLocal();
    }

    try {
      const url = currentUser ? `${userApiUrl}?action=load&user=${encodeURIComponent(currentUser)}` : databaseJsonUrl;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        return currentUser ? loadLocal() : false;
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.items) || !Array.isArray(data.history) || !Array.isArray(data.dayLogs)) return currentUser ? loadLocal() : false;
      items = data.items;
      history = data.history;
      dayLogs = data.dayLogs;
      return true;
    } catch (err) {
      return currentUser ? loadLocal() : false;
    }
  }

  function ensureSheetBooks() {
    if (sheetBooks.length > 0 && !Array.isArray(sheetBooks[0].rows)) {
      sheetBooks = [{
        id: Date.now(),
        name: 'Sheet 1',
        rows: sheetBooks.map(row => ({
          id: row.id || Date.now() + Math.random(),
          code: row.code || '',
          department: row.department || '',
          note: row.note || '',
          status: row.status || ''
        }))
      }];
    }

    if (sheetBooks.length === 0) {
      sheetBooks.push({
        id: Date.now(),
        name: 'Sheet 1',
        rows: [{
          id: Date.now() + 1,
          code: '00-01-007',
          department: 'HUMAN RESOURCE',
          note: 'PRINT ERROR',
          status: ''
        }]
      });
      saveSheetData();
    }
    if (currentSheetIndex >= sheetBooks.length) currentSheetIndex = sheetBooks.length - 1;
  }

  async function initData() {
    await seedDemoUsers();

    if (!currentUser && !window.location.pathname.endsWith(LOGIN_PAGE_PATH)) {
      window.location.href = LOGIN_PAGE_PATH;
      return;
    }

    if (currentUserRole === 'admin' && !window.location.pathname.endsWith('admin.html')) {
      window.location.href = 'admin.html';
      return;
    }

    await ensureUser();
    const loaded = await loadDatabaseJson();
    if (!loaded && items.length === 0) seedDemoData();
    ensureDay();
    ensureSheetBooks();
    saveAll();
    updateDate();
    render();
    scheduleReminders();
  }

  let reminderTimer = null;
  let lastReminderCheck = Date.now();
  const reminderNotified = new Set();

  function saveSheetData() {
    localStorage.setItem('focus_sheet_v1', JSON.stringify(sheetBooks));
  }

  function saveAll() {
    localStorage.setItem(getStorageKey('items'),   JSON.stringify(items));
    localStorage.setItem(getStorageKey('history'), JSON.stringify(history));
    localStorage.setItem(getStorageKey('daylogs'), JSON.stringify(dayLogs));
    saveSheetData();
    saveToServer();
    scheduleReminders();
  }

  async function saveToServer() {
    if (window.location.protocol === 'file:') return;
    try {
      const payload = { items, history, dayLogs };
      const url = currentUser ? `${serverSaveUrl}?user=${encodeURIComponent(currentUser)}` : serverSaveUrl;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('Could not sync data to server:', err);
    }
  }

  function shouldNotifyTimepoint(item, timeKey) {
    if (!item || !item[timeKey]) return false;
    const timeValue = item[timeKey];
    const now = Date.now();
    return timeValue <= now && timeValue > lastReminderCheck;
  }

  function checkDueReminders() {
    const now = Date.now();
    items.forEach(item => {
      if (item.done) return;
      ['timeIn', 'timeOut'].forEach(key => {
        const timestamp = item[key];
        if (!timestamp) return;
        if (timestamp <= now && timestamp > lastReminderCheck) {
          const reminderKey = `${item.id}-${key}-${timestamp}`;
          if (!reminderNotified.has(reminderKey)) {
            reminderNotified.add(reminderKey);
            const label = key === 'timeIn' ? 'Start' : 'End';
            showNotification(`${label} reminder: ${item.title} at ${fmtTime(timestamp)}`, 'success');
          }
        }
      });
    });
    lastReminderCheck = now;
  }

  function scheduleReminders() {
    if (reminderTimer) clearInterval(reminderTimer);
    checkDueReminders();
    reminderTimer = setInterval(checkDueReminders, 30000);
  }

  // ──────────── TIME UTILS ────────────
  function fmtTime(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', hour12:true });
  }
  function calcDuration(a, b) {
    if (!a || !b) return null;
    const s = Math.floor((b - a) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h)  return h + 'hr ' + m + 'mins';
    return m + 'mins';
  }
  function calcDurationMs(a, b) {
    if (!a || !b) return 0;
    return b - a;
  }
  function calcLive(a) {
    const s = Math.floor((Date.now() - a) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h)  return h+'h '+m+'m '+sec+'s';
    if (m)  return m+'m '+sec+'s';
    return sec+'s';
  }
  function formatAge(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 60)    return 'Just now';
    if (d < 3600)  return Math.floor(d/60)+'m ago';
    if (d < 86400) return Math.floor(d/3600)+'h ago';
    return new Date(ts).toLocaleDateString('en-PH', {month:'short', day:'numeric'});
  }
  function totalMs(entries) {
    return entries.reduce((sum, e) => {
      if (e.timeIn && e.timeOut) return sum + (e.timeOut - e.timeIn);
      return sum;
    }, 0);
  }
  function fmtTotalMs(ms) {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    if (h) return h + ' hour' + (h!==1?'s':'') + ' ' + m + ' minute' + (m!==1?'s':'');
    return m + ' minute' + (m!==1?'s':'');
  }

  // ──────────── DAILY LOG FUNCTIONS ────────────
  function addToDayLog(item) {
    ensureDay();
    const day = dayLogs[currentDayIndex];
    if (day.entries.find(e => e.itemId === item.id)) return;
    day.entries.push({
      itemId:   item.id,
      title:    item.title,
      account:  item.account || '',
      timeIn:   item.timeIn,
      timeOut:  item.timeOut || Date.now(),
      addedAt:  Date.now()
    });
    saveAll();
  }

  function newDay() {
    const n = dayLogs.length + 1;
    dayLogs.push({
      id: Date.now(),
      label: 'Day ' + n,
      date: new Date().toLocaleDateString('en-PH', {month:'short', day:'numeric', year:'numeric'}),
      entries: []
    });
    currentDayIndex = dayLogs.length - 1;
    saveAll();
    render();
  }

  function removeLogEntry(dayIdx, entryIdx) {
    dayLogs[dayIdx].entries.splice(entryIdx, 1);
    saveAll();
    render();
  }

  function removeDay(dayIdx) {
    if (dayLogs.length <= 1) {
      showNotification('You must keep at least one day.', 'error');
      return;
    }
    if (!confirm(`Remove ${dayLogs[dayIdx].label}? This cannot be undone.`)) return;
    dayLogs.splice(dayIdx, 1);
    if (currentDayIndex >= dayLogs.length) currentDayIndex = dayLogs.length - 1;
    saveAll();
    render();
  }

  function addDayLogEntry() {
    const day = dayLogs[currentDayIndex];
    day.entries.push({
      itemId: Date.now(),
      title: 'New task',
      account: '',
      timeIn: null,
      timeOut: null,
      addedAt: Date.now()
    });
    saveAll();
    render();
  }

  function toggleSelectAllDayLog(checked) {
    dayLogSelectedEntries.clear();
    dayLogs[currentDayIndex].entries.forEach((_, idx) => {
      const checkbox = document.querySelector(`.daylog-row-checkbox[data-entry-idx="${idx}"]`);
      if (checkbox) checkbox.checked = checked;
      if (checked) dayLogSelectedEntries.add(idx);
    });
    document.querySelectorAll('.daylog-table tbody tr').forEach(tr => tr.classList.toggle('selected', checked));
  }

  function toggleDayLogSelection(dayIdx, entryIdx, checked) {
    if (checked) dayLogSelectedEntries.add(entryIdx);
    else dayLogSelectedEntries.delete(entryIdx);
    const tr = document.querySelector(`tr[data-entry-idx="${entryIdx}"]`);
    if (tr) tr.classList.toggle('selected', checked);
  }

  function updateDayLogEntry(dayIdx, entryIdx, field, value) {
    const entry = dayLogs?.[dayIdx]?.entries?.[entryIdx];
    if (!entry) return;
    if (field === 'timeIn' || field === 'timeOut') {
      // When user types a time without AM/PM, prefer keeping the existing meridiem
      // by passing the previous timestamp as a reference to parseTimeInput.
      const ref = (field === 'timeIn') ? entry.timeIn : (entry.timeOut || entry.timeIn);
      const parsed = parseTimeInput(value, ref);
      if (parsed === null && value.trim() !== '') return;
      entry[field] = parsed;
    } else {
      entry[field] = value.trim();
    }
    saveAll();
    // re-render to immediately update computed duration and totals
    render();
  }

  let draggedRowIndex = null;

  function handleDragStart(e) {
    draggedRowIndex = parseInt(e.target.closest('tr').getAttribute('data-entry-idx'));
    e.target.closest('tr').classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const tr = e.target.closest('tr');
    if (tr && tr.classList.contains('draggable-row')) {
      tr.classList.add('drag-over');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    const dropTarget = e.target.closest('tr');
    if (!dropTarget || !dropTarget.classList.contains('draggable-row')) return;
    
    const targetIdx = parseInt(dropTarget.getAttribute('data-entry-idx'));
    
    if (draggedRowIndex === null || draggedRowIndex === targetIdx) return;
    
    // Reorder entries in the current day
    const entry = dayLogs[currentDayIndex].entries.splice(draggedRowIndex, 1)[0];
    dayLogs[currentDayIndex].entries.splice(targetIdx, 0, entry);
    
    saveAll();
    render();
  }

  function handleDragEnd(e) {
    document.querySelectorAll('tr.dragging, tr.drag-over').forEach(tr => {
      tr.classList.remove('dragging', 'drag-over');
    });
    draggedRowIndex = null;
  }

  function render() {
    updateStats();
    updateCounts();
    clearInterval(timerInterval);

    const container = document.getElementById('listContainer');
    container.innerHTML = '';

    if (currentTab === 'history') { renderHistory(container); return; }
    if (currentTab === 'daylog')  { renderDayLog(container);  return; }
    if (currentTab === 'slack')   { renderSlackHistory(container); return; }
    if (currentTab === 'sheet')   { renderSpreadsheet(container); return; }
    if (currentTab === 'timezone') { renderTimezone(container); return; }
    if (currentTab === 'admin')   { renderAdmin(container); return; }

    let filtered;
    if      (currentTab === 'all')  filtered = items.filter(i => !i.done);
    else if (currentTab === 'done') filtered = items.filter(i => i.done);
    else                            filtered = items.filter(i => i.type === currentTab && !i.done);

    const icons = {all:'🗂️',todo:'✅',ongoing:'🔄',pending:'⏳',note:'📝',done:'✔️'};
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">${icons[currentTab]||'🎯'}</div>
          <div class="empty-title">Nothing here yet</div>
          <div class="empty-sub">Add something to get started</div>
        </div>`;
      return;
    }

    if (currentTab === 'todo' || currentTab === 'all') {
      const todos = items.filter(i => i.type === 'todo');
      const tdone = todos.filter(i => i.done).length;
      const pct   = todos.length ? Math.round((tdone/todos.length)*100) : 0;
      if (todos.length > 0) {
        const pw = document.createElement('div');
        pw.className = 'progress-wrap'; pw.style.gridColumn = '1 / -1';
        pw.innerHTML = `
          <div class="progress-label"><span>Todo Progress</span><span>${tdone}/${todos.length} done</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>`;
        container.appendChild(pw);
      }
    }

    filtered.forEach((item, i) => container.appendChild(buildCard(item, i * 25)));

    timerInterval = setInterval(() => {
      items.filter(i => !i.done && i.timeIn && !i.timeOut).forEach(item => {
        const el = document.getElementById('live-' + item.id);
        if (el) el.textContent = calcLive(item.timeIn);
      });
    }, 1000);
  }

  function renderDayLog(container) {
    ensureDay();

    const header = document.createElement('div');
    header.className = 'daylog-header';

    const selector = document.createElement('div');
    selector.className = 'daylog-selector';
    dayLogs.forEach((day, idx) => {
      const pill = document.createElement('div');
      pill.className = 'day-pill' + (idx === currentDayIndex ? ' active' : '');
      pill.innerHTML = `<span>${day.label} · ${day.date}</span>${dayLogs.length > 1 ? '<button class="day-pill-close" title="Remove day">×</button>' : ''}`;
      pill.onclick = (event) => {
        if (event.target.closest('.day-pill-close')) {
          removeDay(idx);
          return;
        }
        currentDayIndex = idx;
        render();
      };
      selector.appendChild(pill);
    });

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex; gap:8px; align-items:center;';

    const templatePanel = renderTemplateButtons();

    const newDayBtn = document.createElement('button');
    newDayBtn.className = 'new-day-btn';
    newDayBtn.textContent = '+ New Day';
    newDayBtn.onclick = newDay;
    btns.appendChild(newDayBtn);

    const addRowBtn = document.createElement('button');
    addRowBtn.className = 'new-day-btn';
    addRowBtn.textContent = '+ Add Task';
    addRowBtn.onclick = addDayLogEntry;
    btns.appendChild(addRowBtn);

    if (dayLogs.length > 1) {
      const deleteDayBtn = document.createElement('button');
      deleteDayBtn.className = 'print-day-btn';
      deleteDayBtn.textContent = '🗑️ Delete Day';
      deleteDayBtn.onclick = () => removeDay(currentDayIndex);
      btns.appendChild(deleteDayBtn);
    }

    const printBtn = document.createElement('button');
    printBtn.className = 'print-day-btn';
    printBtn.innerHTML = '🖨️ Print ' + dayLogs[currentDayIndex].label;
    printBtn.onclick = () => printDayLog(currentDayIndex);
    btns.appendChild(printBtn);

    const pdfBtn = document.createElement('button');
    pdfBtn.className = 'print-day-btn';
    pdfBtn.innerHTML = '📄 PDF';
    pdfBtn.onclick = () => downloadDayLogPdf(currentDayIndex);
    btns.appendChild(pdfBtn);

    const wordBtn = document.createElement('button');
    wordBtn.className = 'print-day-btn';
    wordBtn.innerHTML = '📝 Word';
    wordBtn.onclick = () => downloadDayLogWord(currentDayIndex);
    btns.appendChild(wordBtn);

    const headerRight = document.createElement('div');
    headerRight.style.cssText = 'display:flex; gap:16px; align-items:center; flex-wrap:wrap;';
    headerRight.appendChild(templatePanel);
    headerRight.appendChild(btns);

    header.appendChild(selector);
    header.appendChild(headerRight);
    container.appendChild(header);

    const dateLbl = document.createElement('div');
    dateLbl.className = 'daylog-date-label';
    dateLbl.textContent = dayLogs[currentDayIndex].label + '  ·  ' + dayLogs[currentDayIndex].date;
    container.appendChild(dateLbl);

    const day = dayLogs[currentDayIndex];
    const wrap = document.createElement('div');
    wrap.className = 'daylog-table-wrap';

    if (day.entries.length === 0) {
      wrap.innerHTML = `<div class="daylog-empty">No completed ongoing tasks recorded yet.<br><small style="color:var(--muted)">When you check ✓ an <b style="color:var(--ongoing)">Ongoing</b> task as done, it will appear here automatically.</small></div>`;
      container.appendChild(wrap);
      return;
    }

    const table = document.createElement('table');
    table.className = 'daylog-table';
    table.innerHTML = `<thead><tr>
      <th class="select-cell"><input type="checkbox" id="daylogSelectAll" onchange="toggleSelectAllDayLog(this.checked)"></th>
      <th>No.</th>
      <th>Account</th>
      <th>Task</th>
      <th>Time Start</th>
      <th>Time End</th>
      <th>Time Consumed</th>
      <th class="actions-cell"></th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');
    day.entries.forEach((entry, idx) => {
      const dur = entry.timeIn && entry.timeOut ? calcDuration(entry.timeIn, entry.timeOut) : '—';
      const tr = document.createElement('tr');
      tr.draggable = true;
      tr.setAttribute('data-entry-idx', idx);
      tr.className = 'draggable-row';
      tr.innerHTML = `
        <td class="select-cell"><input type="checkbox" class="daylog-row-checkbox" data-entry-idx="${idx}" onchange="toggleDayLogSelection(${currentDayIndex},${idx}, this.checked)"></td>
        <td class="num">${idx + 1}</td>
        <td class="acct" contenteditable="true" onblur="updateDayLogEntry(${currentDayIndex},${idx}, 'account', this.textContent)">${escHtml(entry.account || '')}</td>
        <td class="task-cell" contenteditable="true" onblur="updateDayLogEntry(${currentDayIndex},${idx}, 'title', this.textContent)">${escHtml(entry.title || '')}</td>
        <td class="time-cell"><input type="time" class="daylog-time-input" value="${formatTimeForInput(entry.timeIn)}" onchange="updateDayLogEntry(${currentDayIndex},${idx}, 'timeIn', this.value)"></td>
        <td class="time-cell"><input type="time" class="daylog-time-input" value="${formatTimeForInput(entry.timeOut)}" onchange="updateDayLogEntry(${currentDayIndex},${idx}, 'timeOut', this.value)"></td>
        <td class="dur-cell">${dur}</td>
        <td class="actions-cell">
          <button class="log-del-btn" style="margin-right:6px;" onclick="editLogEntry(${currentDayIndex},${idx})" title="Edit">✎</button>
          <button class="log-del-btn" onclick="removeLogEntry(${currentDayIndex},${idx})" title="Remove">✕</button>
        </td>`;
      tr.addEventListener('dragstart', handleDragStart);
      tr.addEventListener('dragover', handleDragOver);
      tr.addEventListener('drop', handleDrop);
      tr.addEventListener('dragend', handleDragEnd);
      tbody.appendChild(tr);
    });

    const totalTime = totalMs(day.entries);
    const totalTr = document.createElement('tr');
    totalTr.className = 'daylog-total-row';
    totalTr.innerHTML = `<td colspan="7">Total: ${fmtTotalMs(totalTime)}</td>`;
    tbody.appendChild(totalTr);

    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  function renderTimezone(container) {
    const activeTask = items.find(i => i.type === 'ongoing' && !i.done && i.timeIn && !i.timeOut) || items.find(i => i.type === 'ongoing' && !i.done) || null;
    const taskTitle = activeTask ? activeTask.title : 'No active task';
    const taskNote = activeTask ? 'Currently working on this task.' : 'Start an ongoing task to show the active task here.';

    const panel = document.createElement('div');
    panel.className = 'timezone-panel';

    const zoneName = document.createElement('div');
    zoneName.className = 'timezone-zone';
    zoneName.textContent = ''; 

    const clock = document.createElement('div');
    clock.id = 'timezoneClock';
    clock.className = 'timezone-clock';

    const titleEl = document.createElement('div');
    titleEl.className = 'timezone-task';
    titleEl.textContent = taskTitle;

    const noteEl = document.createElement('div');
    noteEl.className = 'timezone-note';
    noteEl.textContent = taskNote;

    panel.appendChild(zoneName);
    panel.appendChild(clock);
    panel.appendChild(titleEl);
    panel.appendChild(noteEl);
    container.appendChild(panel);

    function updateTimezoneClock() {
      const now = new Date();
      clock.textContent = now.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
      const parts = new Intl.DateTimeFormat('en-US', { timeZoneName:'short' }).formatToParts(now);
      const tz = parts.find(p => p.type === 'timeZoneName');
      zoneName.textContent = tz ? tz.value : 'Local Time';
    }

    updateTimezoneClock();
    timerInterval = setInterval(updateTimezoneClock, 1000);
  }

  function renderHistory(container) {
    if (history.length === 0) {
      container.innerHTML = `<div class="empty"><div class="empty-icon">🕰️</div><div class="empty-title">No history yet</div><div class="empty-sub">Deleted items appear here</div></div>`;
      return;
    }
    const lbl = document.createElement('div');
    lbl.className = 'section-label';
    lbl.textContent = `${history.length} deleted item${history.length!==1?'s':''}`;
    container.appendChild(lbl);

    [...history].reverse().forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'hist-card'; el.style.animationDelay = (i*20)+'ms';
      const icon = {todo:'✅',ongoing:'🔄',pending:'⏳',note:'📝'}[item.type]||'📋';
      const bg   = {todo:'var(--todo-bg)',ongoing:'var(--ongoing-bg)',pending:'var(--pending-bg)',note:'var(--note-bg)'}[item.type];
      const dur  = calcDuration(item.timeIn, item.timeOut);
      el.innerHTML = `
        <div class="hist-icon" style="background:${bg}">${icon}</div>
        <div class="hist-text">
          <div class="hist-title">${escHtml(item.title)}</div>
          <div class="hist-meta">Deleted ${formatAge(item.deletedAt||item.created)}${dur ? ' · ⏱ '+dur : ''}</div>
        </div>
        <div class="hist-restore" onclick="restoreItem(${item.id})">Restore</div>`;
      container.appendChild(el);
    });
    const c = document.createElement('div');
    c.style.cssText='text-align:center;margin-top:12px;grid-column:1/-1';
    c.innerHTML=`<span onclick="clearHistory()" style="font-size:12px;color:var(--muted);cursor:pointer;text-decoration:underline">Clear all history</span>`;
    container.appendChild(c);
  }

  // ──────────── SLACK HISTORY / CHAT UI ────────────
  function renderSlackHistory(container) {
    const hist = getSlackHistory().slice().reverse();
    const header = document.createElement('div');
    header.className = 'daylog-header';
    const left = document.createElement('div');
    left.innerHTML = `<div style="font-size:18px;font-weight:800">Slack History</div><div style="font-size:12px;color:var(--muted)">Messages sent via configured Slack integration</div>`;
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;gap:8px;align-items:center';
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'print-day-btn';
    settingsBtn.textContent = 'Slack Settings';
    settingsBtn.onclick = openSlackSettings;
    right.appendChild(settingsBtn);
    // add search box for Slack history
    const searchEl = document.createElement('input');
    searchEl.id = 'slackSearchInput';
    searchEl.placeholder = 'Search Slack history';
    searchEl.style.cssText = 'padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);width:200px;';
    searchEl.addEventListener('input', () => { render(); });
    right.appendChild(searchEl);
    header.appendChild(left);
    header.appendChild(right);
    container.appendChild(header);

    const wrap = document.createElement('div');
    wrap.className = 'daylog-table-wrap';
    // ensure the Slack table is above overlays
    wrap.style.position = 'relative';
    wrap.style.zIndex = '1400';
    // apply search filter if present
    try {
      const q = (document.getElementById('slackSearchInput') || { value: '' }).value.trim().toLowerCase();
      if (q) {
        hist = hist.filter(h => ((h.text||'') + ' ' + (h.target||'')).toLowerCase().includes(q));
      }
    } catch (e) { /* ignore */ }
    if (hist.length === 0) {
      wrap.innerHTML = `<div class="daylog-empty">No Slack messages recorded yet.</div>`;
      container.appendChild(wrap);
      return;
    }

    const table = document.createElement('table');
    table.className = 'daylog-table';
    table.innerHTML = `<thead><tr><th>No.</th><th>Message</th><th>Channel/Target</th><th>Sent</th><th>Edit</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    hist.forEach((e, idx) => {
      const tr = document.createElement('tr');
      const sent = e.sentAt ? new Date(e.sentAt).toLocaleString() : '—';
      tr.innerHTML = `
        <td class="num">${idx+1}</td>
        <td style="max-width:520px;padding-right:10px;">${escHtml(e.text)}</td>
        <td class="acct">${escHtml(String(e.target||'—'))}</td>
        <td class="num">${escHtml(sent)}</td>
        <td class="etc-cell"></td>`;
      const editTd = tr.querySelector('.etc-cell');
      // Edit button only when Slack returned message meta (bot token sends)
      if (e.editable && e.meta && e.meta.ts) {
        const btn = document.createElement('button');
        btn.className = 'log-del-btn';
        btn.textContent = 'Edit';
        btn.onclick = () => openSlackInlineEditor(e.id, tr);
        editTd.appendChild(btn);
      } else {
        const span = document.createElement('span'); span.style.color = 'var(--muted)'; span.textContent = e.editable ? 'Pending' : 'Webhook (no edit)'; editTd.appendChild(span);
      }
      // Resend available for all entries
      const resendBtn = document.createElement('button'); resendBtn.className = 'log-del-btn'; resendBtn.style.marginLeft = '6px'; resendBtn.textContent = 'Resend';
      resendBtn.onclick = () => { resendSlackEntry(e.id); };
      editTd.appendChild(resendBtn);
      // Delete available for all entries (✕)
      const delBtn = document.createElement('button'); delBtn.className = 'log-del-btn'; delBtn.style.marginLeft = '6px'; delBtn.textContent = '✕'; delBtn.title = 'Delete from Slack and history';
      delBtn.onclick = async () => { await deleteSlackEntry(e.id); render(); };
      editTd.appendChild(delBtn);
      // make message cell clickable to open editor/modal
      const msgCellClickable = tr.querySelector('td:nth-child(2)');
      if (msgCellClickable) {
        msgCellClickable.style.cursor = 'pointer';
        msgCellClickable.title = (e.editable && e.meta && e.meta.ts) ? 'Click to edit this Slack message' : 'Click to edit message (local)';
        msgCellClickable.addEventListener('click', () => {
          if (e.editable && e.meta && e.meta.ts) openSlackInlineEditor(e.id, tr);
          else openSlackEditModal(e.id);
        });
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  async function deleteSlackEntry(entryId) {
    const hist = getSlackHistory(); const idx = hist.findIndex(h=>h.id===entryId); if (idx===-1) return;
    const entry = hist[idx];
    if (!confirm('Delete this Slack history entry? This will attempt to delete the message from Slack.')) return;

    // If message has Slack meta and a bot token is available, attempt to delete on Slack first
    const botToken = (localStorage.getItem(SLACK_BOT_TOKEN_KEY) || slackBotToken || localStorage.getItem('slack_bot_token') || '').trim();
    if (entry && entry.meta && entry.meta.channel && entry.meta.ts && botToken && (botToken.startsWith('xoxb-') || botToken.startsWith('xoxp-'))) {
      try {
        // mark deleting status locally
        hist[idx].deleteStatus = 'deleting'; saveSlackHistory(hist);
        const payload = { channel: entry.meta.channel, ts: entry.meta.ts };
        const res = await fetch('https://slack.com/api/chat.delete', {
          method: 'POST', headers: { 'Authorization': `Bearer ${botToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const body = await res.json();
        if (!body.ok) {
          console.warn('Slack delete error', body);
          hist[idx].deleteStatus = 'failed'; saveSlackHistory(hist);
          showToast(`⚠️ Slack delete failed: ${body.error || 'unknown'}`);
          return;
        }
        // deleted on Slack — remove from local history
        const deleted = hist.splice(idx,1);
        saveSlackHistory(hist);
        window._lastDeletedSlackEntries = deleted;
        showUndoNotification('Slack entry deleted', () => { const h = getSlackHistory(); h.push(...window._lastDeletedSlackEntries); saveSlackHistory(h); window._lastDeletedSlackEntries = null; render(); });
        showToast('✅ Slack message deleted');
        return;
      } catch (err) {
        console.warn('Slack delete exception', err);
        hist[idx].deleteStatus = 'failed'; saveSlackHistory(hist);
        showToast('⚠️ Slack delete failed');
        return;
      }
    }

    // No Slack meta or bot token — just remove locally
    const deleted = hist.splice(idx,1);
    saveSlackHistory(hist);
    window._lastDeletedSlackEntries = deleted;
    showUndoNotification('Slack entry deleted (local only)', () => { const h = getSlackHistory(); h.push(...window._lastDeletedSlackEntries); saveSlackHistory(h); window._lastDeletedSlackEntries = null; render(); });
  }

  // Inline editor for a table row: replace message cell with editor
  function openSlackInlineEditor(entryId, tr) {
    if (!tr) return;
    // prevent duplicate editors
    if (tr.querySelector('.slack-inline-editor')) return;
    const hist = getSlackHistory();
    const idx = hist.findIndex(h => h.id === entryId);
    if (idx === -1) return;
    const entry = hist[idx];
    const msgCell = tr.querySelector('td:nth-child(2)');
    const editCell = tr.querySelector('.etc-cell');
    if (!msgCell || !editCell) return;

    // Save original content to restore on cancel
    const origMsg = entry.text || '';
    const origEditHtml = editCell.innerHTML;

    // build editor
    const editorWrap = document.createElement('div'); editorWrap.className = 'slack-inline-editor';
    editorWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    const ta = document.createElement('textarea'); ta.style.cssText = 'width:100%;min-height:64px;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);'; ta.value = origMsg;
    editorWrap.appendChild(ta);

    // if linked to an item allow editing title/account
    let titleInp, accInp;
    if (entry.itemId) {
      const it = items.find(i => i.id === entry.itemId) || {};
      titleInp = document.createElement('input'); titleInp.type='text'; titleInp.placeholder='Title'; titleInp.style.cssText='padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);'; titleInp.value = it.title || '';
      accInp = document.createElement('input'); accInp.type='text'; accInp.placeholder='Account'; accInp.style.cssText='padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);'; accInp.value = it.account || '';
      editorWrap.appendChild(titleInp); editorWrap.appendChild(accInp);
    }

    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    const cancel = document.createElement('button'); cancel.className='template-cancel-btn'; cancel.textContent='Cancel';
    cancel.onclick = () => {
      // restore
      msgCell.textContent = origMsg;
      editCell.innerHTML = origEditHtml;
    };
    const save = document.createElement('button'); save.className='template-save-btn'; save.textContent='Save';
    save.onclick = async () => {
        const newText = ta.value.trim();
        // disable buttons and show saving state
        save.disabled = true; cancel.disabled = true;
        editCell.innerHTML = '<span style="color:var(--muted)">Saving…</span>';
        const res = await updateSlackMessage(entryId, newText);
        if (res && res.ok) {
          // update local linked item if inputs present
          if (entry.itemId && (titleInp || accInp)) {
            const it = items.find(i => i.id === entry.itemId);
            if (it) {
              if (titleInp) it.title = titleInp.value.trim() || it.title;
              if (accInp) it.account = accInp.value.trim() || it.account;
              saveAll();
            }
          }
          // refresh row display
          const updated = getSlackHistory().find(h => h.id === entryId) || entry;
          msgCell.textContent = updated.text || '';
          editCell.innerHTML = origEditHtml;
          render();
        } else {
          // show inline error
          const errMsg = (res && res.error) ? res.error : 'Slack update failed';
          editCell.innerHTML = `<span style="color:var(--pending)">Error: ${escHtml(errMsg)}</span>`;
          save.disabled = false; cancel.disabled = false;
        }
    };
    row.appendChild(cancel); row.appendChild(save);
    editorWrap.appendChild(row);

    // replace cell content with editor
    msgCell.innerHTML = ''; msgCell.appendChild(editorWrap);
    // replace edit cell actions with a small note
    editCell.innerHTML = '<span style="color:var(--muted)">Editing…</span>';
    setTimeout(()=>ta.focus(), 50);
    // keyboard shortcuts: Ctrl/Cmd+Enter = save, Esc = cancel
    ta.addEventListener('keydown', async (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') { ev.preventDefault(); save.click(); }
      if (ev.key === 'Escape') { ev.preventDefault(); cancel.click(); }
    });
    if (titleInp) titleInp.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cancel.click(); if ((ev.ctrlKey||ev.metaKey) && ev.key === 'Enter') save.click(); });
    if (accInp) accInp.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cancel.click(); if ((ev.ctrlKey||ev.metaKey) && ev.key === 'Enter') save.click(); });
  }

  function bulkResendSelected() {
    const ids = Array.from(document.querySelectorAll('.slack-hist-checkbox:checked')).map(cb=>Number(cb.dataset.id));
    if (ids.length===0) { showToast('⚠️ No items selected'); return; }
    if (!confirm(`Resend ${ids.length} message(s)?`)) return;
    ids.forEach(id=>resendSlackEntry(id));
    showToast('✅ Resend initiated');
    render();
  }

  function bulkDeleteSelected() {
    const ids = Array.from(document.querySelectorAll('.slack-hist-checkbox:checked')).map(cb=>Number(cb.dataset.id));
    if (ids.length===0) { showToast('⚠️ No items selected'); return; }
    if (!confirm(`Delete ${ids.length} history item(s)?`)) return;
    const hist = getSlackHistory(); const deleted=[];
    ids.forEach(id=>{
      const i = hist.findIndex(h=>h.id===id); if (i!==-1) deleted.push(hist.splice(i,1)[0]);
    });
    saveSlackHistory(hist);
    window._lastDeletedSlackEntries = deleted;
    showUndoNotification(`${deleted.length} Slack entries deleted`, ()=>{ const h=getSlackHistory(); h.push(...window._lastDeletedSlackEntries); saveSlackHistory(h); window._lastDeletedSlackEntries=null; render(); });
    render();
  }

  async function undoSlackUpdate(entryId) {
    const hist = getSlackHistory(); const idx = hist.findIndex(h=>h.id===entryId); if (idx===-1) return; const entry = hist[idx];
    if (!entry.previousText) { showToast('⚠️ Nothing to undo'); return; }
    const token = (localStorage.getItem(SLACK_BOT_TOKEN_KEY) || slackBotToken || localStorage.getItem('slack_bot_token') || '').trim();
    if (!token || !(token.startsWith('xoxb-')||token.startsWith('xoxp-'))) { showToast('⚠️ Bot token required to undo'); return; }
    try {
      const payload = { channel: entry.meta.channel, ts: entry.meta.ts, text: entry.previousText };
      const res = await fetch('https://slack.com/api/chat.update', { method:'POST', headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const body = await res.json(); if (!body.ok) { showToast('⚠️ Undo failed'); return; }
      hist[idx].text = entry.previousText; hist[idx].previousText = null; hist[idx].editedAt = Date.now(); saveSlackHistory(hist);
      // update linked item if any
      if (entry.itemId) { const it = items.find(i=>i.id===entry.itemId); if (it) { it.desc = hist[idx].text; saveAll(); } }
      showToast('✅ Undo applied'); render();
    } catch (err) { console.warn(err); showToast('⚠️ Undo failed'); }
  }

  function showUndoNotification(message, undoCallback) {
    const n = document.createElement('div'); n.style.cssText='position:fixed;bottom:24px;left:24px;z-index:25000;padding:12px 16px;border-radius:8px;background:var(--surface);border:1px solid var(--border);color:var(--text);display:flex;gap:8px;align-items:center;';
    const txt = document.createElement('div'); txt.textContent = message; n.appendChild(txt);
    const undoBtn = document.createElement('button'); undoBtn.className='template-cancel-btn'; undoBtn.textContent='Undo'; undoBtn.onclick = ()=>{ undoCallback(); document.body.removeChild(n); };
    const closeBtn = document.createElement('button'); closeBtn.className='template-cancel-btn'; closeBtn.textContent='Close'; closeBtn.onclick = ()=>{ if(document.body.contains(n)) document.body.removeChild(n); };
    n.appendChild(undoBtn); n.appendChild(closeBtn); document.body.appendChild(n);
    setTimeout(()=>{ if(document.body.contains(n)) document.body.removeChild(n); }, 20000);
  }

  function openSlackEditModal(entryId) {
    const hist = getSlackHistory();
    const entry = hist.find(h => h.id === entryId);
    if (!entry) { showToast('⚠️ Entry not found'); return; }
    // create modal
    let bg = document.getElementById('slackEditBg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'slackEditBg'; bg.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);z-index:20000;';
      const box = document.createElement('div'); box.style.cssText = 'width:min(720px,92%);background:var(--surface);padding:18px;border-radius:12px;border:1px solid var(--border);';
      // Title input
      const titleLabel = document.createElement('div'); titleLabel.style.cssText='font-size:12px;color:var(--muted);margin-bottom:6px;'; titleLabel.textContent='Title';
      const titleInp = document.createElement('input'); titleInp.id='slackEditTitle'; titleInp.type='text'; titleInp.style.cssText='width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);margin-bottom:10px;';
      box.appendChild(titleLabel); box.appendChild(titleInp);
      // Account input
      const accLabel = document.createElement('div'); accLabel.style.cssText='font-size:12px;color:var(--muted);margin-bottom:6px;'; accLabel.textContent='Account';
      const accInp = document.createElement('input'); accInp.id='slackEditAccount'; accInp.type='text'; accInp.style.cssText='width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);margin-bottom:10px;';
      box.appendChild(accLabel); box.appendChild(accInp);
      const ta = document.createElement('textarea'); ta.id = 'slackEditTextarea'; ta.style.cssText = 'width:100%;height:140px;padding:12px;border-radius:8px;background:var(--surface2);color:var(--text);border:1px solid var(--border);font-family:DM Mono, monospace;margin-bottom:10px;';
      box.appendChild(ta);
      const btnRow = document.createElement('div'); btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:6px;';
      const cancel = document.createElement('button'); cancel.className='template-cancel-btn'; cancel.textContent='Cancel'; cancel.onclick = () => { document.body.removeChild(bg); };
      const save = document.createElement('button'); save.className='template-save-btn'; save.textContent='Save & Update'; save.onclick = async () => {
        const newText = document.getElementById('slackEditTextarea').value.trim();
        const newTitle = document.getElementById('slackEditTitle').value.trim();
        const newAccount = document.getElementById('slackEditAccount').value.trim();
        await updateSlackMessage(entryId, newText);
        // update linked item fields if present
        const h = getSlackHistory(); const ent = h.find(x=>x.id===entryId);
        if (ent && ent.itemId) {
          const it = items.find(i=>i.id===ent.itemId);
          if (it) {
            if (newTitle) it.title = newTitle;
            if (newAccount) it.account = newAccount;
            saveAll();
          }
        }
        if (document.body.contains(bg)) document.body.removeChild(bg);
        render();
      };
      btnRow.appendChild(cancel); btnRow.appendChild(save); box.appendChild(btnRow); bg.appendChild(box); document.body.appendChild(bg);
    }
    document.getElementById('slackEditTextarea').value = entry.text || '';
    const tEl = document.getElementById('slackEditTitle'); if (tEl) tEl.value = (entry.linkedTitle || '') || (entry.itemId ? (items.find(i=>i.id===entry.itemId)||{}).title || '' : '');
    const aEl = document.getElementById('slackEditAccount'); if (aEl) aEl.value = (entry.linkedAccount || '') || (entry.itemId ? (items.find(i=>i.id===entry.itemId)||{}).account || '' : '');
  }

  async function updateSlackMessage(entryId, newText) {
    const hist = getSlackHistory();
    const idx = hist.findIndex(h => h.id === entryId);
    if (idx === -1) { showToast('⚠️ Entry not found'); return; }
    const entry = hist[idx];
    if (!entry.editable || !entry.meta) { showToast('⚠️ This message cannot be edited'); return; }
    const token = (localStorage.getItem(SLACK_BOT_TOKEN_KEY) || slackBotToken || localStorage.getItem('slack_bot_token') || '').trim();
    if (!token || !(token.startsWith('xoxb-') || token.startsWith('xoxp-'))) { showToast('⚠️ Bot token required to edit messages'); return; }
    try {
      const payload = { channel: entry.meta.channel, ts: entry.meta.ts, text: newText };
      const res = await fetch('https://slack.com/api/chat.update', { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!body.ok) { console.warn('Slack update error', body); return { ok: false, error: body.error || 'update_failed' }; }
      // update local history (keep previous text for undo)
      hist[idx].previousText = hist[idx].text;
      hist[idx].text = newText;
      hist[idx].editedAt = Date.now();
      hist[idx].status = 'updated';
      saveSlackHistory(hist);
      // also update corresponding local item (if present) so the app reflects the edited message
      if (entry.itemId) {
        const it = items.find(i => i.id === entry.itemId);
        if (it) { it.desc = newText; saveAll(); }
      }
      showToast('✅ Slack message updated');
      return { ok: true };
    } catch (err) {
      console.warn(err); return { ok: false, error: err?.message || 'exception' };
    }
  }

  async function resendSlackEntry(entryId) {
    const hist = getSlackHistory();
    const entry = hist.find(h => h.id === entryId);
    if (!entry) { showToast('⚠️ Entry not found'); return; }
    // Resend using current config; reuse sendSlackNotification by building a temp item
    const temp = { id: Date.now(), title: entry.text, desc: '', account: '', type: 'ongoing' };
    // try sending via configured method
    await sendSlackNotification(temp);
    showToast('✅ Resend attempted');
  }

  function buildCard(item, delay) {
    const el = document.createElement('div');
    el.className = 'card' + (item.type === 'note' ? ' note-card' : '');
    el.style.animationDelay = delay + 'ms';

    const accent = {todo:'var(--todo)',ongoing:'var(--ongoing)',pending:'var(--pending)',note:'var(--note)'}[item.type];
    const pill   = {todo:'pill-todo',ongoing:'pill-ongoing',pending:'pill-pending',note:'pill-note'}[item.type];
    const label  = {todo:'✅ Todo',ongoing:'🔄 Ongoing',pending:'⏳ Pending',note:'📝 Note'}[item.type];
    const dur    = calcDuration(item.timeIn, item.timeOut);

    let timeHTML = '';
    if (item.type !== 'note') {
      timeHTML = '<div class="time-track">';
      if (item.timeIn)  timeHTML += `<span class="time-chip tc-in">▶ IN: ${fmtTime(item.timeIn)}</span>`;
      if (item.timeOut) timeHTML += `<span class="time-chip tc-out">■ OUT: ${fmtTime(item.timeOut)}</span>`;
      if (dur)          timeHTML += `<span class="time-chip tc-dur">⏱ ${dur}</span>`;
      if (item.etc)      timeHTML += `<span class="time-chip tc-dur">ETC: ${escHtml(item.etc)}</span>`;
      if (!item.done && item.timeIn && !item.timeOut)
        timeHTML += `<span class="live-timer"><span class="live-dot"></span><span id="live-${item.id}">${calcLive(item.timeIn)}</span></span>`;
      timeHTML += '</div>';
    }

    const accountTag = (item.type === 'ongoing' && item.account) ? `<span class="account-tag">@${escHtml(item.account)}</span>` : '';
    let actionButtons = '';
    if (item.type !== 'note' && !item.done) {
      if (!item.timeIn) actionButtons += `<div class="act-btn" onclick="startTask(${item.id})" title="Start">▶</div>`;
      else if (item.timeIn && !item.timeOut) actionButtons += `<div class="act-btn" onclick="stopTask(${item.id})" title="Stop">■</div>`;
      if (item.type === 'ongoing') {
        actionButtons += `<div class="act-btn" onclick="sendSlackForItem(${item.id})" title="Send to Slack">📤</div>`;
        actionButtons += `<div class="act-btn" onclick="openEtcModal(${item.id})" title="ETC">ETC</div>`;
      }
    }

    el.innerHTML = `
      <div class="card-accent" style="background:${accent}"></div>
      <div class="card-head">
        ${item.type !== 'note'
          ? `<div class="card-check ${item.done?'checked':''}" onclick="toggleDone(${item.id})"></div>`
          : `<span style="font-size:16px;flex-shrink:0;margin-top:2px">📝</span>`}
        <div class="card-title ${item.done?'done-text':''}">${escHtml(item.title)}${accountTag}</div>
      </div>
      ${timeHTML}
      <div class="card-foot">
        <span class="status-pill ${item.done ? 'pill-done' : pill}">${item.done ? '✔️ Done' : label}</span>
        <div class="card-actions">
          ${actionButtons}
          <div class="act-btn" onclick="openEdit(${item.id})">✏️</div>
          <div class="act-btn del" onclick="deleteItem(${item.id})">🗑️</div>
        </div>
        <span class="card-meta">${formatAge(item.created)}</span>
      </div>`;
    return el;
  }

  // ──────────── STATS ────────────
  function updateStats() {
    const todo = items.filter(i=>i.type==='todo'&&!i.done).length;
    const act  = items.filter(i=>i.type==='ongoing'&&!i.done).length;
    const done = items.filter(i=>i.done).length;
    const note = items.filter(i=>i.type==='note').length;
    document.getElementById('dsTodo').textContent    = todo;
    document.getElementById('dsOngoing').textContent = act;
    document.getElementById('dsDone').textContent    = done;
    document.getElementById('dsNotes').textContent   = note;
    ['msTodo','msOngoing','msDone','msNotes'].forEach((id,i) => {
      const el = document.getElementById(id);
      if (el) el.textContent = [todo,act,done,note][i];
    });
  }
  function updateCounts() {
    const all  = items.filter(i=>!i.done).length;
    const todo = items.filter(i=>i.type==='todo'&&!i.done).length;
    const act  = items.filter(i=>i.type==='ongoing'&&!i.done).length;
    const pend = items.filter(i=>i.type==='pending'&&!i.done).length;
    const note = items.filter(i=>i.type==='note').length;
    const done = items.filter(i=>i.done).length;
    const hist = history.length;
    const logs = dayLogs.reduce((s,d)=>s+d.entries.length, 0);
    const sheet = sheetBooks.reduce((sum, book) => sum + ((book.rows && book.rows.length) || 0), 0);

    const vals = {all,todo,ongoing:act,pending:pend,note,done,daylog:logs,history:hist,sheet};
    const keys = ['all','todo','ongoing','pending','note','done','daylog','sheet','history'];

    ['tcAllD','tcTodoD','tcOngoingD','tcPendingD','tcNoteD','tcDoneD','tcDayLogD','tcSheetD','tcHistoryD'].forEach((id,i)=>{ const e=document.getElementById(id); if(e) e.textContent=vals[keys[i]]; });
    ['tcAllM','tcTodoM','tcOngoingM','tcPendingM','tcNoteM','tcDoneM','tcDayLogM','tcSheetM','tcHistoryM'].forEach((id,i)=>{ const e=document.getElementById(id); if(e) e.textContent=vals[keys[i]]; });
    ['ncAll','ncTodo','ncOngoing','ncPending','ncNote','ncDone','ncDayLog','ncSheet','ncHistory'].forEach((id,i)=>{ const e=document.getElementById(id); if(e) e.textContent=vals[keys[i]]; });
  }

  function openAdminPanel() {
    switchTab('admin');
  }

  function maskPasswordHash(hash) {
    if (!hash) return 'None';
    return '••••••••';
  }

  async function fetchUserSummaries() {
    const isFileMode = window.location.protocol === 'file:';
    if (isFileMode) {
      const accounts = getStoredUsers();
      return Object.entries(accounts).map(([user, account]) => {
        const items = JSON.parse(localStorage.getItem(`focus_items_${user}`) || '[]');
        const history = JSON.parse(localStorage.getItem(`focus_history_${user}`) || '[]');
        const dayLogs = JSON.parse(localStorage.getItem(`focus_daylogs_${user}`) || '[]');
        const entries = Array.isArray(dayLogs) ? dayLogs.reduce((sum, day) => sum + ((day.entries && day.entries.length) || 0), 0) : 0;
        const total = Array.isArray(items) ? items.length : 0;
        const done = Array.isArray(items) ? items.filter(i => i.done).length : 0;
        const outstanding = total - done;
        return {
          user,
          display: account.display || user,
          role: user === 'it' ? 'Admin' : 'User',
          createdAt: account.createdAt || null,
          totalItems: total,
          doneCount: done,
          outstandingCount: outstanding,
          historyCount: Array.isArray(history) ? history.length : 0,
          dayLogCount: entries,
          passwordHash: account.pwd || ''
        };
      });
    }

    try {
      const response = await fetch(`${userApiUrl}?action=list&user=${encodeURIComponent(currentUser)}`);
      if (!response.ok) throw new Error('Could not load users');
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('Failed to load admin user list:', err);
      return [];
    }
  }

  async function createAdminUser() {
    const username = prompt('Enter new username:');
    if (!username) return;
    const password = prompt('Enter password for ' + username + ':');
    if (!password) return;
    const display = prompt('Enter display name (optional):', username) || username;
    const userName = slugifyUserName(username);
    if (!userName) {
      showNotification('Invalid username', 'error');
      return;
    }
    const isFileMode = window.location.protocol === 'file:';
    if (isFileMode) {
      const users = getStoredUsers();
      if (users[userName]) {
        showNotification('User already exists', 'error');
        return;
      }
      const hash = await hashPassword(password);
      users[userName] = { pwd: hash, display, createdAt: Date.now() };
      saveStoredUsers(users);
      ensureUserStorageKeys(userName);
      showNotification('User created locally', 'success');
      render();
      return;
    }

    try {
      const response = await fetch(`${userApiUrl}?action=register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userName, password, display, admin: currentUserRole === 'admin' })
      });
      if (response.ok) {
        showNotification('User created on server', 'success');
        render();
        return;
      }
      const error = await response.json().catch(() => null);
      showNotification(error?.error || 'Failed to create user', 'error');
    } catch (err) {
      console.warn(err);
      showNotification('Could not create user', 'error');
    }
  }

  async function resetUserPassword(userName) {
    if (!userName) return;
    const newPassword = prompt(`Enter a new password for ${userName}:`);
    if (!newPassword) return;

    const isFileMode = window.location.protocol === 'file:';
    if (isFileMode) {
      const users = getStoredUsers();
      if (!users[userName]) {
        showNotification('User not found', 'error');
        return;
      }
      users[userName].pwd = await hashPassword(newPassword);
      saveStoredUsers(users);
      showNotification('Password updated locally', 'success');
      render();
      return;
    }

    try {
      const response = await fetch(`${userApiUrl}?action=reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userName, password: newPassword, admin: currentUser === 'it' })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        showNotification(error?.error || 'Failed to reset password', 'error');
        return;
      }
      showNotification('Password reset successfully', 'success');
      render();
    } catch (err) {
      console.warn(err);
      showNotification('Could not reset password', 'error');
    }
  }

  async function deleteAdminUser(userName) {
    if (!userName || userName === 'it') {
      showNotification('Cannot remove the admin user', 'error');
      return;
    }
    if (!confirm(`Delete user ${userName} and all their data?`)) return;

    const isFileMode = window.location.protocol === 'file:';
    if (isFileMode) {
      const users = getStoredUsers();
      delete users[userName];
      saveStoredUsers(users);
      localStorage.removeItem(`focus_items_${userName}`);
      localStorage.removeItem(`focus_history_${userName}`);
      localStorage.removeItem(`focus_daylogs_${userName}`);
      showNotification('User deleted locally', 'success');
      render();
      return;
    }

    try {
      const response = await fetch(`${userApiUrl}?action=delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userName, admin: currentUser === 'it' })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        showNotification(error?.error || 'Failed to delete user', 'error');
        return;
      }
      showNotification('User deleted successfully', 'success');
      render();
    } catch (err) {
      console.warn(err);
      showNotification('Could not delete user', 'error');
    }
  }

  async function renderAdmin(container) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">🔐</div><div class="empty-title">Loading admin panel</div></div>';
    const users = await fetchUserSummaries();
    if (currentTab !== 'admin') return;

    const totalUsers = users.length;
    const totalTasks = users.reduce((sum, user) => sum + (user.totalItems || 0), 0);
    const totalDone = users.reduce((sum, user) => sum + (user.doneCount || 0), 0);
    const totalLogs = users.reduce((sum, user) => sum + (user.dayLogCount || 0), 0);

    const rows = users.map(user => `
      <tr>
        <td>${escHtml(user.user)}</td>
        <td>${escHtml(user.display)}</td>
        <td>${escHtml(user.role || (user.user === 'it' ? 'Admin' : 'User'))}</td>
        <td>${user.totalItems || 0}</td>
        <td>${user.doneCount || 0}</td>
        <td>${user.outstandingCount || 0}</td>
        <td>${user.dayLogCount || 0}</td>
        <td>${user.historyCount || 0}</td>
        <td>${maskPasswordHash(user.passwordHash)}</td>
        <td style="min-width:170px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
          <button class="act-btn" onclick="resetUserPassword('${user.user}')">🔒 Reset</button>
          <button class="act-btn del" onclick="deleteAdminUser('${user.user}')">🗑️ Delete</button>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="stats-row" style="grid-template-columns: repeat(4, minmax(140px, 1fr));">
        <div class="dstat"><div class="dstat-icon">👥</div><div><div class="dstat-val">${totalUsers}</div><div class="dstat-lbl">Users</div></div></div>
        <div class="dstat"><div class="dstat-icon">🗂️</div><div><div class="dstat-val">${totalTasks}</div><div class="dstat-lbl">Total Tasks</div></div></div>
        <div class="dstat"><div class="dstat-icon">✔️</div><div><div class="dstat-val">${totalDone}</div><div class="dstat-lbl">Completed</div></div></div>
        <div class="dstat"><div class="dstat-icon">📋</div><div><div class="dstat-val">${totalLogs}</div><div class="dstat-lbl">Day Log Entries</div></div></div>
      </div>
      <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div style="font-size:14px; color:var(--muted);">Administrator user management panel. Passwords are kept private and only reset options are available.</div>
        <button class="topbar-add-btn import-main-btn" onclick="createAdminUser()">+ Create User</button>
      </div>
      <div class="daylog-table-wrap">
        <table class="excel-table" style="width:100%;">
          <thead>
            <tr>
              <th>Username</th>
              <th>Display</th>
              <th>Role</th>
              <th>Tasks</th>
              <th>Done</th>
              <th>Outstanding</th>
              <th>Day Log</th>
              <th>History</th>
              <th>Password</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="10" style="text-align:center; padding:18px 0; color:var(--muted);">No users found</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  // ──────────── TAB SWITCHING ────────────
  const pageTitles = {all:'All Tasks',todo:'Todo',ongoing:'Ongoing',pending:'Pending',note:'Notes',done:'Completed',daylog:'📋 Daily Log',sheet:'TabShet',timezone:'Timezone',history:'History',slack:'Slack',admin:'Admin'};
  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
    const pt = document.getElementById('pageTitle');
    if (pt) pt.textContent = pageTitles[tab] || tab;
    render();
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && window.innerWidth < 1200) sidebar.style.display = 'none';
  }

  document.querySelectorAll('.tab, .nav-item').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });

  // ──────────── ACTIONS ────────────
  function toggleDone(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    item.done = !item.done;
    item.timeOut = item.done ? Date.now() : null;

    if (item.done && item.type === 'ongoing') {
      addToDayLog(item);
      showToast('✅ Logged to ' + dayLogs[currentDayIndex].label);
    }

    saveAll(); render();
  }

  function showToast(msg) {
    let t = document.getElementById('toastEl');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toastEl';
      t.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%) translateY(10px);
        background:#4ECCA3;color:#0E0F13;padding:10px 20px;border-radius:20px;font-family:'Syne',sans-serif;
        font-size:13px;font-weight:700;z-index:9999;opacity:0;transition:all 0.3s;white-space:nowrap;
        box-shadow:0 8px 24px rgba(78,204,163,0.4);pointer-events:none;`;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(10px)';
    }, 2500);
  }

  function deleteItem(id) {
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    const [r] = items.splice(idx, 1);
    r.deletedAt = Date.now();
    history.push(r);
    saveAll(); render();
  }

  function activeSheet() {
    return sheetBooks[currentSheetIndex] || sheetBooks[0] || { id: Date.now(), name:'Sheet 1', rows: [] };
  }

  function updateSheetCell(rowId, field, value) {
    const sheet = activeSheet();
    const row = (sheet.rows || []).find(r => r.id === rowId);
    if (!row) return;
    row[field] = value;
    saveSheetData();
    updateCounts();
  }

  function addSheetRow() {
    const sheet = activeSheet();
    sheet.rows = sheet.rows || [];
    sheet.rows.push({ id: Date.now(), code:'', department:'', note:'', status:'' });
    saveSheetData();
    render();
  }

  function deleteSheetRow(rowId) {
    const sheet = activeSheet();
    sheet.rows = (sheet.rows || []).filter(r => r.id !== rowId);
    saveSheetData();
    updateCounts();
    render();
  }

  function renameSheetName(value) {
    const sheet = activeSheet();
    if (!sheet) return;
    sheet.name = value.trim() || sheet.name;
    saveSheetData();
    render();
  }

  function addSheetTab() {
    sheetBooks.push({ id: Date.now(), name: `Sheet ${sheetBooks.length + 1}`, rows: [] });
    currentSheetIndex = sheetBooks.length - 1;
    saveSheetData();
    render();
  }

  function selectSheetTab(index) {
    if (index < 0 || index >= sheetBooks.length) return;
    currentSheetIndex = index;
    render();
  }

  function renameSheetTab(index) {
    const sheet = sheetBooks[index];
    if (!sheet) return;
    const newName = prompt('Rename sheet', sheet.name);
    if (!newName) return;
    sheet.name = newName.trim() || sheet.name;
    saveSheetData();
    render();
  }

  function deleteSheetTab(index) {
    if (sheetBooks.length <= 1) {
      showNotification('You need at least one sheet', 'error');
      return;
    }
    if (!confirm(`Delete sheet "${sheetBooks[index].name}"?`)) return;
    sheetBooks.splice(index, 1);
    if (currentSheetIndex >= sheetBooks.length) currentSheetIndex = sheetBooks.length - 1;
    saveSheetData();
    render();
  }

  function renderSpreadsheet(container) {
    ensureSheetBooks();
    const sheet = activeSheet();
    const wrapper = document.createElement('div');
    wrapper.className = 'sheet-view';

    const tabBar = document.createElement('div');
    tabBar.className = 'sheet-tabs';
    sheetBooks.forEach((book, idx) => {
      const tab = document.createElement('button');
      tab.className = 'sheet-tab' + (idx === currentSheetIndex ? ' active' : '');
      tab.textContent = book.name;
      tab.onclick = () => selectSheetTab(idx);
      tab.ondblclick = () => renameSheetTab(idx);

      const deleteBtn = document.createElement('span');
      deleteBtn.className = 'sheet-tab-close';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete sheet';
      deleteBtn.onclick = e => { e.stopPropagation(); deleteSheetTab(idx); };
      tab.appendChild(deleteBtn);
      tabBar.appendChild(tab);
    });
    const addTab = document.createElement('button');
    addTab.className = 'sheet-tab-add';
    addTab.textContent = '+ New Sheet';
    addTab.onclick = addSheetTab;
    tabBar.appendChild(addTab);
    wrapper.appendChild(tabBar);

    const header = document.createElement('div');
    header.className = 'sheet-header';
    header.innerHTML = `<div class="sheet-title-row"><label>Sheet Name</label><input class="sheet-name-input" value="${escHtml(sheet.name)}" onchange="renameSheetName(this.value)"></div><div class="sheet-title-note">Edit the sheet title and tab name.</div>`;

    const actions = document.createElement('div');
    actions.className = 'sheet-actions';
    actions.innerHTML = `<button class="add-type-btn todo-btn" type="button" onclick="addSheetRow()">+ Add Row</button>`;
    header.appendChild(actions);
    wrapper.appendChild(header);

    const table = document.createElement('table');
    table.className = 'excel-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Code</th>
          <th>Department</th>
          <th>Note</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>${(sheet.rows && sheet.rows.length) ? sheet.rows.map(row => `
        <tr>
          <td><input class="excel-input" value="${escHtml(row.code)}" oninput="updateSheetCell(${row.id}, 'code', this.value)"></td>
          <td><input class="excel-input" value="${escHtml(row.department)}" oninput="updateSheetCell(${row.id}, 'department', this.value)"></td>
          <td><input class="excel-input" value="${escHtml(row.note)}" oninput="updateSheetCell(${row.id}, 'note', this.value)"></td>
          <td><input class="excel-input" value="${escHtml(row.status)}" oninput="updateSheetCell(${row.id}, 'status', this.value)"></td>
          <td><button class="act-btn del" type="button" onclick="deleteSheetRow(${row.id})">Delete</button></td>
        </tr>
      `).join('') : '<tr><td colspan="5" class="daylog-empty">No rows yet in this sheet. Add one to start.</td></tr>'}
      </tbody>
    `;
    wrapper.appendChild(table);
    container.appendChild(wrapper);
    updateCounts();
  }
  function restoreItem(id) {
    const idx = history.findIndex(i => i.id === id);
    if (idx === -1) return;
    const [item] = history.splice(idx, 1);
    delete item.deletedAt; item.done = false; item.timeOut = null;
    items.push(item);
    saveAll(); render();
  }
  function clearHistory() { history = []; saveAll(); render(); }

  function openEdit(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    editingLogEntry = null;
    editId = id;
    document.getElementById('inpTitle').value = item.title;
    document.getElementById('inpDesc').value  = item.desc || '';
    document.getElementById('inpAccount').value = item.account || '';
    document.getElementById('inpStartTime').value = formatTimeForInput(item.timeIn);
    document.getElementById('inpEndTime').value = formatTimeForInput(item.timeOut);
    document.getElementById('inpPad').value = '';
    const pg = document.getElementById('padGroup');
    if (pg) pg.style.display = 'none';
    selectType(item.type);
    document.getElementById('sheetTitle').textContent = 'Edit Item';
    document.getElementById('sheetBg').classList.add('open');
  }

  function editLogEntry(dayIdx, entryIdx) {
    const entry = dayLogs?.[dayIdx]?.entries?.[entryIdx];
    if (!entry) return;
    editingLogEntry = { dayIdx, entryIdx };
    editId = entry.itemId || null;
    document.getElementById('inpTitle').value = entry.title || '';
    document.getElementById('inpDesc').value  = entry.desc || '';
    document.getElementById('inpAccount').value = entry.account || '';
    document.getElementById('inpStartTime').value = formatTimeForInput(entry.timeIn);
    document.getElementById('inpEndTime').value = formatTimeForInput(entry.timeOut);
    document.getElementById('inpPad').value = '';
    const pg = document.getElementById('padGroup');
    if (pg) pg.style.display = 'none';
    selectType('ongoing');
    document.getElementById('sheetTitle').textContent = 'Edit Log Entry';
    document.getElementById('sheetBg').classList.add('open');
  }

  function startTask(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    item.timeIn = Date.now();
    item.timeOut = null;
    saveAll(); render();
  }

  function stopTask(id) {
    const item = items.find(i => i.id === id);
    if (!item || !item.timeIn) return;
    item.timeOut = Date.now();
    // If this was an ongoing task, automatically add it to the Day Log
    if (item.type === 'ongoing') {
      addToDayLog(item);
      showToast('✅ Logged to ' + dayLogs[currentDayIndex].label);
    }
    saveAll(); render();
  }

  // ──────────── MOBILE FAB ────────────
  function toggleMobFab() {
    mobFabOpen = !mobFabOpen;
    document.getElementById('mobFabExtra').classList.toggle('open', mobFabOpen);
    document.getElementById('mobFab').classList.toggle('open', mobFabOpen);
  }

  // ──────────── SHEET ────────────
  function openSheet(type) {
    editId = null;
    editingLogEntry = null;
    document.getElementById('inpTitle').value = '';
    document.getElementById('inpDesc').value  = '';
    document.getElementById('inpAccount').value = '';
    document.getElementById('inpStartTime').value = '';
    document.getElementById('inpEndTime').value = '';
    document.getElementById('inpPad').value = '';
    const titleGroup = document.getElementById('titleGroup');
    const descGroup = document.getElementById('descGroup');
    const typeGroup = document.getElementById('typeGroup');
    const pg = document.getElementById('padGroup');
    if (titleGroup) titleGroup.style.display = 'block';
    if (descGroup) descGroup.style.display = 'block';
    if (typeGroup) typeGroup.style.display = 'block';
    if (pg) pg.style.display = 'none';
    selectType(type || 'todo');
    document.getElementById('sheetTitle').textContent = 'New Item';
    document.getElementById('sheetBg').classList.add('open');
    if (mobFabOpen) toggleMobFab();
    setTimeout(() => document.getElementById('inpTitle').focus(), 350);
  }
  function closeSheet() { document.getElementById('sheetBg').classList.remove('open'); editId = null; editingLogEntry = null; }
  function closeSheetBg(e) { if (e.target === document.getElementById('sheetBg')) closeSheet(); }
  function selectType(type) {
    currentType = type;
    document.querySelectorAll('.type-btn').forEach(b => {
      b.className = 'type-btn';
      if (b.dataset.type === type) b.classList.add('sel-' + type);
    });
    const ag = document.getElementById('accountGroup');
    if (ag) ag.style.display = (type === 'ongoing') ? 'flex' : 'none';
    const tg = document.getElementById('timeGroup');
    if (tg) tg.style.display = (type === 'note') ? 'none' : 'block';
  }
  function togglePad() {
    const pg = document.getElementById('padGroup');
    if (!pg) return;
    const open = pg.style.display === 'block';
    if (!open) {
      selectType('ongoing');
      pg.style.display = 'block';
      document.getElementById('inpPad').focus();
    } else {
      pg.style.display = 'none';
    }
  }
  function openPad() {
    openSheet('ongoing');
    const titleGroup = document.getElementById('titleGroup');
    const descGroup = document.getElementById('descGroup');
    const typeGroup = document.getElementById('typeGroup');
    const accountGroup = document.getElementById('accountGroup');
    const timeGroup = document.getElementById('timeGroup');
    const pg = document.getElementById('padGroup');
    if (titleGroup) titleGroup.style.display = 'none';
    if (descGroup) descGroup.style.display = 'none';
    if (typeGroup) typeGroup.style.display = 'none';
    if (accountGroup) accountGroup.style.display = 'none';
    if (timeGroup) timeGroup.style.display = 'none';
    if (pg) pg.style.display = 'block';
    document.getElementById('sheetTitle').textContent = 'Import Pad';
    setTimeout(() => {
      const pad = document.getElementById('inpPad');
      if (pad) pad.focus();
    }, 350);
  }
  function formatTimeInput(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  function formatTimeForInput(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // Clock picker state
  let clockPickerTarget = null;
  let pickerHourVal = 7;
  let pickerMinuteVal = 0;
  let pickerAmPm = 'AM';

  function openClockPicker(inputId) {
    const bg = document.getElementById('clockPickerBg');
    if (!bg) return;
    clockPickerTarget = inputId;
    const input = document.getElementById(inputId);
    let val = input && input.value ? input.value : '';
    // parse HH:MM (24h)
    let hh = 7, mm = 0, am = 'AM';
    const m = val.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      let hnum = Number(m[1]);
      mm = Number(m[2]);
      if (hnum === 0) { hh = 12; am = 'AM'; }
      else if (hnum === 12) { hh = 12; am = 'PM'; }
      else if (hnum > 12) { hh = hnum - 12; am = 'PM'; }
      else { hh = hnum; am = 'AM'; }
    }
    pickerHourVal = hh;
    pickerMinuteVal = mm;
    pickerAmPm = am;
    // update UI
    const ph = document.getElementById('pickerHour');
    const pm = document.getElementById('pickerMinute');
    const phInput = document.getElementById('pickerHourInput');
    const pmInput = document.getElementById('pickerMinuteInput');
    const amBtn = document.getElementById('ampmBtn');
    if (ph) ph.textContent = String(pickerHourVal);
    if (pm) pm.textContent = String(pickerMinuteVal).padStart(2,'0');
    if (phInput) phInput.value = String(pickerHourVal);
    if (pmInput) pmInput.value = String(pickerMinuteVal);
    if (amBtn) amBtn.textContent = pickerAmPm;
    bg.style.display = 'flex';
  }

  function closeClockPicker() {
    const bg = document.getElementById('clockPickerBg');
    if (!bg) return;
    bg.style.display = 'none';
    clockPickerTarget = null;
  }

  function updatePickerHour(v) {
    pickerHourVal = Number(v) || 1;
    const ph = document.getElementById('pickerHour');
    if (ph) ph.textContent = String(pickerHourVal);
    const phInput = document.getElementById('pickerHourInput');
    if (phInput) phInput.value = String(pickerHourVal);
  }

  function updatePickerMinute(v) {
    pickerMinuteVal = Number(v) || 0;
    const pm = document.getElementById('pickerMinute');
    if (pm) pm.textContent = String(pickerMinuteVal).padStart(2,'0');
    const pmInput = document.getElementById('pickerMinuteInput');
    if (pmInput) pmInput.value = String(pickerMinuteVal);
  }

  function toggleAmPm() {
    pickerAmPm = pickerAmPm === 'AM' ? 'PM' : 'AM';
    const amBtn = document.getElementById('ampmBtn');
    if (amBtn) amBtn.textContent = pickerAmPm;
  }

  function applyPickerTime() {
    if (!clockPickerTarget) { closeClockPicker(); return; }
    let hh = Number(pickerHourVal) || 0;
    const mm = Number(pickerMinuteVal) || 0;
    if (pickerAmPm === 'AM') {
      if (hh === 12) hh = 0;
    } else {
      if (hh !== 12) hh = hh + 12;
    }
    const hhStr = String(hh).padStart(2,'0');
    const mmStr = String(mm).padStart(2,'0');
    const val = `${hhStr}:${mmStr}`;
    const input = document.getElementById(clockPickerTarget);
    if (input) {
      input.value = val;
      // trigger input change handlers if any
      const evt = new Event('change', { bubbles: true });
      input.dispatchEvent(evt);
    }
    closeClockPicker();
  }
  function parseTimeInput(value, referenceTs) {
    if (!value) return null;
    const trimmed = value.trim().toLowerCase();
    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
    if (!match) return null;
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const meridiem = match[3] ? match[3].toLowerCase() : null;
    if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) return null;
    if (meridiem) {
      if (hours === 12) hours = 0;
      if (meridiem === 'pm') hours += 12;
    } else if (referenceTs) {
      // If caller provided a reference timestamp, infer AM/PM from it when
      // the user omitted an explicit meridiem. This makes typing "03:00"
      // keep the previous AM/PM state (e.g. remain PM) instead of defaulting
      // to AM.
      if (hours >= 1 && hours <= 12) {
        const refH = new Date(referenceTs).getHours();
        const refIsPM = refH >= 12;
        if (refIsPM) {
          if (hours !== 12) hours += 12;
        } else {
          if (hours === 12) hours = 0;
        }
      }
    }
    const d = referenceTs ? new Date(referenceTs) : new Date();
    d.setHours(hours, minutes, 0, 0);
    return d.getTime();
  }
  function saveItem() {
    const title = document.getElementById('inpTitle').value.trim();
    const desc      = document.getElementById('inpDesc').value.trim();
    const account   = document.getElementById('inpAccount').value.trim();
    const startTime = document.getElementById('inpStartTime').value.trim();
    const endTime   = document.getElementById('inpEndTime').value.trim();
    const padText   = document.getElementById('inpPad').value.trim();
    const now       = Date.now();

    let finalTitle = title;
    let finalDesc = desc;
    let finalAccount = account;
    let finalType = currentType;
    if (padText) {
      const lines = padText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) finalTitle = lines[0];
      if (lines.length > 1) finalAccount = lines[1];
      if (lines.length > 2) finalDesc = lines.slice(2).join('\n');
      finalType = 'ongoing';
    }

    if (!finalTitle) { document.getElementById('inpTitle').focus(); return; }

    if (editingLogEntry) {
      const entry = dayLogs?.[editingLogEntry.dayIdx]?.entries?.[editingLogEntry.entryIdx];
      if (entry) {
        entry.title = finalTitle;
        entry.desc = finalDesc;
        entry.account = finalAccount;
        entry.timeIn = finalType !== 'note' && startTime ? parseTimeInput(startTime, entry.timeIn || now) : null;
        entry.timeOut = finalType !== 'note' && entry.timeIn && endTime ? parseTimeInput(endTime, entry.timeIn || entry.timeOut || now) : null;
        if (!startTime && finalType !== 'note' && entry.timeIn == null) entry.timeIn = entry.timeIn || null;
        if (!endTime) entry.timeOut = entry.timeOut || null;
      }
      if (editId) {
        const item = items.find(i => i.id === editId);
        if (item) {
          item.title = finalTitle;
          item.desc = finalDesc;
          item.type = finalType;
          item.account = finalAccount;
          if (item.type === 'note') {
            item.timeIn = null;
            item.timeOut = null;
          } else {
            if (startTime) {
              item.timeIn = parseTimeInput(startTime, item.timeIn || now);
            }
            if (endTime) {
              item.timeOut = parseTimeInput(endTime, item.timeIn || item.timeOut || now);
            }
          }
        }
      }
    } else if (editId) {
      const item = items.find(i => i.id === editId);
      if (item) {
        item.title = finalTitle;
        item.desc = finalDesc;
        item.type = finalType;
        item.account = finalAccount;
        if (item.type === 'note') {
          item.timeIn = null;
          item.timeOut = null;
        } else {
          if (startTime) {
            item.timeIn = parseTimeInput(startTime, item.timeIn || now);
          }
          if (endTime) {
            item.timeOut = parseTimeInput(endTime, item.timeIn || item.timeOut || now);
          }
        }
      }
    } else {
      const timeIn = finalType !== 'note' && startTime ? parseTimeInput(startTime) : null;
      const timeOut = finalType !== 'note' && timeIn && endTime ? parseTimeInput(endTime, timeIn) : null;
      const item = { id:now, type:finalType, title:finalTitle, desc:finalDesc, account:finalAccount, done:false, created:now, timeIn, timeOut };
      items.push(item);
      if (finalType === 'ongoing' && timeIn && timeOut) {
        addToDayLog(item);
        showToast('✅ Logged to ' + dayLogs[currentDayIndex].label);
      }
    }
    saveAll(); closeSheet(); render();
  }

  function exportDb() {
    const payload = { items, history, dayLogs };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'focus-db.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast('✅ JSON database exported');
  }

  function triggerImport() {
    document.getElementById('dbFileInput').click();
  }

  function handleDbFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.items) || !Array.isArray(data.history) || !Array.isArray(data.dayLogs)) {
          throw new Error('Invalid JSON database format');
        }
        items = data.items;
        history = data.history;
        dayLogs = data.dayLogs;
        ensureDay();
        saveAll();
        render();
        showToast('✅ JSON database imported');
      } catch (err) {
        console.error(err);
        showToast('⚠️ Failed to import JSON');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function doPrint() {
    if (currentTab === 'daylog') { printDayLog(currentDayIndex); return; }
    const container = document.getElementById('listContainer');
    const savedTab = currentTab;
    clearInterval(timerInterval);
    container.innerHTML = '';
    const active = items.filter(i => !i.done);
    if (active.length) {
      const l = document.createElement('div'); l.className='section-label'; l.textContent=`Active Tasks (${active.length})`;
      container.appendChild(l);
      active.forEach(item => container.appendChild(buildCard(item,0)));
    }
    window.print();
    currentTab = savedTab;
    document.querySelectorAll('.tab,.nav-item').forEach(t => t.classList.toggle('active', t.dataset.tab === currentTab));
    render();
  }

  function downloadDayLogWord(index) {
    const day = dayLogs[index] || dayLogs[0];
    if (!day) return;

    const rows = day.entries.map((entry, idx) => {
      const duration = entry.timeIn && entry.timeOut ? calcDuration(entry.timeIn, entry.timeOut) : '—';
      return `<tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td style="text-align:center;font-weight:700;color:#1f7a56;">${escHtml(entry.account || '')}</td>
        <td style="padding-left:10px;">${escHtml(entry.title)}</td>
        <td style="text-align:center;font-family:monospace;">${fmtTime(entry.timeIn)}</td>
        <td style="text-align:center;font-family:monospace;">${fmtTime(entry.timeOut)}</td>
        <td style="text-align:center;font-family:monospace;">${duration}</td>
      </tr>`;
    }).join('');

    const title = `${escHtml(day.label)} ${escHtml(day.date)}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
      body { font-family: Arial, Helvetica, sans-serif; color: #0E0F13; margin: 24px; }
      h1 { font-size: 18px; margin-bottom: 6px; }
      p { margin: 0; color: #47535e; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 18px; }
      th, td { border: 1px solid #c8d6ce; padding: 10px 12px; }
      th { background: #e8f6e9; color: #2b5b3b; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.6px; }
      td { font-size: 12px; vertical-align: middle; }
      td:first-child, th:first-child { text-align: center; width: 42px; }
      td:nth-child(2), th:nth-child(2) { text-align: center; width: 110px; }
      td:nth-child(4), td:nth-child(5), td:nth-child(6), th:nth-child(4), th:nth-child(5), th:nth-child(6) { text-align: center; }
      .summary { margin-top: 14px; font-size: 12px; font-weight: 700; color: #1f7a56; text-align: right; }
    </style></head><body>
      <h1>${escHtml(day.label)}</h1>
      <p>${escHtml(day.date)}</p>
      <table>
        <thead><tr>
          <th>No.</th>
          <th>Account</th>
          <th>Task</th>
          <th>Time Start</th>
          <th>Time End</th>
          <th>Time Consumed</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="summary">Total: ${day.entries.length} row${day.entries.length !== 1 ? 's' : ''}</div>
    </body></html>`;

    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${day.label.replace(/\s+/g, '_')}_${day.date.replace(/[^0-9a-zA-Z]+/g, '_')}.doc`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast('✅ Word export ready');
  }

  // ──────────── UTILS ────────────
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function updateDate() {
    const str = new Date().toLocaleDateString('en-PH', {weekday:'short',month:'short',day:'numeric'}).toUpperCase();
    ['dateLblSide','dateLblMob'].forEach(id => { const e=document.getElementById(id); if(e) e.textContent=str; });
  }

  function slugifyUserName(name) {
    return name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function updateUserDisplay() {
    const badge = document.getElementById('userBadge');
    const displayName = currentUserDisplay || currentUser;
    if (badge) badge.textContent = currentUser ? `User: ${displayName}` : 'Guest';
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.style.display = currentUser ? 'flex' : 'none';
    updateAdminButton();
  }

  function updateAdminButton() {
    const adminBtn = document.getElementById('adminPanelBtn');
    if (!adminBtn) return;
    adminBtn.style.display = currentUser === 'it' ? 'flex' : 'none';
  }

  function openUserModal() {
    const bg = document.getElementById('authBg');
    if (!bg) return;
    bg.classList.add('open');
    
    // Reset auth mode to login
    authMode = 'login';
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach((tab, i) => {
      if (i === 0) tab.classList.add('active');
      else tab.classList.remove('active');
    });
    const loginSub = document.getElementById('authSubLogin');
    const registerSub = document.getElementById('authSubRegister');
    const confirmInput = document.getElementById('authUserPasswordConfirm');
    const displayInput = document.getElementById('authUserDisplay');
    const submitBtn = document.getElementById('authSubmitBtn');
    loginSub.classList.add('visible');
    registerSub.classList.remove('visible');
    confirmInput.style.display = 'none';
    if (displayInput) displayInput.style.display = 'none';
    submitBtn.textContent = 'Login';
    
    const input = document.getElementById('authUserName');
    const pwdInput = document.getElementById('authUserPassword');
    const confirmPwdInput = document.getElementById('authUserPasswordConfirm');
    
    if (input) {
      input.value = '';
      input.focus();
      input.onkeydown = e => { if (e.key === 'Enter') submitAuth(); };
    }
    if (pwdInput) {
      pwdInput.value = '';
      pwdInput.onkeydown = e => { if (e.key === 'Enter') submitAuth(); };
    }
    if (confirmPwdInput) {
      confirmPwdInput.value = '';
      confirmPwdInput.onkeydown = e => { if (e.key === 'Enter') submitAuth(); };
    }
    if (displayInput) {
      displayInput.value = '';
      displayInput.onkeydown = e => { if (e.key === 'Enter') submitAuth(); };
    }
  }

  function closeUserModal() {
    const bg = document.getElementById('authBg');
    if (!bg) return;
    bg.classList.remove('open');
  }

  function closeAuthBg(e) {
    if (e.target === document.getElementById('authBg') && currentUser) closeUserModal();
  }

  async function ensureUser() {
    updateUserDisplay();
    if (currentUser) return;
    openUserModal();
    return new Promise(resolve => {
      window._resolveUserAuth = resolve;
    });
  }

  function setCurrentUser(userName, displayName) {
    currentUser = userName;
    localStorage.setItem(CURRENT_USER_KEY, currentUser);
    localStorage.removeItem('focus_current_user');
    if (displayName) saveCurrentUserDisplay(displayName);
    updateUserDisplay();
    closeUserModal();
    if (window._resolveUserAuth) {
      window._resolveUserAuth();
      window._resolveUserAuth = null;
    }
  }

  async function loginUserLocal(userName, rawPassword) {
    const users = getStoredUsers();
    const account = users[userName];
    if (!account) {
      showNotification('Invalid username or password', 'error');
      return false;
    }
    const hash = await hashPassword(rawPassword);
    if (account.pwd !== hash) {
      showNotification('Invalid username or password', 'error');
      return false;
    }
    setCurrentUser(userName, account.display || userName);
    return true;
  }

  async function registerUserLocal(userName, rawPassword, displayName) {
    const users = getStoredUsers();
    if (users[userName]) {
      showNotification('Username already exists', 'error');
      return false;
    }
    const hash = await hashPassword(rawPassword);
    users[userName] = { pwd: hash, display: displayName || userName, createdAt: Date.now() };
    saveStoredUsers(users);
    ensureUserStorageKeys(userName);
    setCurrentUser(userName, displayName || userName);
    return true;
  }

  function logoutUser() {
    currentUser = '';
    currentUserDisplay = '';
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(CURRENT_USER_DISPLAY_KEY);
    localStorage.removeItem('focus_current_user');
    items = [];
    history = [];
    dayLogs = [];
    updateUserDisplay();
    showNotification('Logged out successfully', 'success');
    window.location.href = LOGIN_PAGE_PATH;
  }

  function switchAuthMode(mode, btn) {
    authMode = mode;
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
    if (btn && btn.classList) btn.classList.add('active');
    
    const loginSub = document.getElementById('authSubLogin');
    const registerSub = document.getElementById('authSubRegister');
    const confirmInput = document.getElementById('authUserPasswordConfirm');
    const submitBtn = document.getElementById('authSubmitBtn');
    
    const displayInput = document.getElementById('authUserDisplay');
    if (mode === 'login') {
      loginSub.classList.add('visible');
      registerSub.classList.remove('visible');
      confirmInput.style.display = 'none';
      if (displayInput) displayInput.style.display = 'none';
      submitBtn.textContent = 'Login';
    } else {
      loginSub.classList.remove('visible');
      registerSub.classList.add('visible');
      confirmInput.style.display = 'block';
      if (displayInput) displayInput.style.display = 'block';
      submitBtn.textContent = 'Register';
    }
  }

  function showNotification(message, type = 'success') {
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    document.body.appendChild(notif);
    
    setTimeout(() => {
      notif.remove();
    }, 3500);
  }

  function setAuthNote(message, type = 'error') {
    const note = document.getElementById('authNote');
    if (!note) return;
    note.textContent = message;
    note.style.color = type === 'error' ? 'var(--pending)' : 'var(--todo)';
  }

  async function submitAuth() {
    const input = document.getElementById('authUserName');
    const pwdInput = document.getElementById('authUserPassword');
    const confirmInput = document.getElementById('authUserPasswordConfirm');
    const displayInput = document.getElementById('authUserDisplay');
    
    const rawName = input ? input.value.trim() : '';
    const rawPassword = pwdInput ? pwdInput.value : '';
    const rawDisplay = displayInput ? displayInput.value.trim() : '';
    const confirmPassword = confirmInput ? confirmInput.value : '';
    setAuthNote('');
    
    if (!rawName) {
      setAuthNote('Please enter a username');
      showNotification('Please enter a username', 'error');
      return;
    }
    if (!rawPassword) {
      setAuthNote('Please enter a password');
      showNotification('Please enter a password', 'error');
      return;
    }
    
    if (authMode === 'register' && rawPassword !== confirmPassword) {
      setAuthNote('Passwords do not match');
      showNotification('Passwords do not match', 'error');
      return;
    }
    
    const userName = slugifyUserName(rawName);
    if (!userName) {
      setAuthNote('Username must include letters or numbers');
      showNotification('Username must include letters or numbers', 'error');
      return;
    }

    const localUsers = getStoredUsers();
    const displayName = rawDisplay || rawName;
    const isFileMode = window.location.protocol === 'file:';

    if (authMode === 'login') {
      if (await loginUserLocal(userName, rawPassword)) {
        await loadDatabaseJson();
        render();
        showNotification('Logged in successfully', 'success');
        setAuthNote('');
        return;
      }

      if (isFileMode) {
        setAuthNote('Invalid username or password');
        return;
      }

      try {
        const response = await fetch(`${userApiUrl}?action=login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: userName, password: rawPassword, display: displayName }),
        });

        if (response.ok) {
          const result = await response.json().catch(() => null);
          setCurrentUser(userName, result?.display || displayName);
          await loadDatabaseJson();
          render();
          setAuthNote('');
          showNotification('Logged in successfully', 'success');
          return;
        }

        const error = await response.json().catch(() => null);
        const message = error?.error || 'Authentication failed';
        setAuthNote(message);
        showNotification(message, 'error');

        if (await loginUserLocal(userName, rawPassword)) {
          await loadDatabaseJson();
          render();
          setAuthNote('Logged in locally');
          showNotification('Logged in locally', 'success');
          return;
        }
      } catch (err) {
        console.warn(err);
        if (await loginUserLocal(userName, rawPassword)) {
          await loadDatabaseJson();
          render();
          setAuthNote('Logged in locally');
          showNotification('Logged in locally', 'success');
          return;
        }
        const message = err.message || 'Could not authenticate. Please try again';
        setAuthNote(message);
        showNotification(message, 'error');
      }
      return;
    }

    if (authMode === 'register') {
      if (localUsers[userName]) {
        setAuthNote('Username already exists');
        showNotification('Username already exists', 'error');
        return;
      }

      if (isFileMode) {
        if (await registerUserLocal(userName, rawPassword, displayName)) {
          await loadDatabaseJson();
          render();
          setAuthNote('');
          showNotification('Account created successfully', 'success');
        }
        return;
      }

      try {
        const response = await fetch(`${userApiUrl}?action=register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: userName, password: rawPassword, display: displayName }),
        });

        if (response.ok) {
          const result = await response.json().catch(() => null);
          setCurrentUser(userName, result?.display || displayName);
          await loadDatabaseJson();
          render();
          setAuthNote('');
          if (result && result.emailSent) showNotification('Account created — registration email sent', 'success');
          else showNotification('Account created — registration logged (email not sent)', 'success');
          return;
        }

        const error = await response.json().catch(() => null);
        const message = error?.error || 'Registration failed';
        setAuthNote(message);
        showNotification(message, 'error');

        if (await registerUserLocal(userName, rawPassword, displayName)) {
          await loadDatabaseJson();
          render();
          setAuthNote('');
          showNotification('Account created locally', 'success');
        }
      } catch (err) {
        console.warn(err);
        if (await registerUserLocal(userName, rawPassword, displayName)) {
          await loadDatabaseJson();
          render();
          setAuthNote('');
          showNotification('Account created locally', 'success');
          return;
        }
        const message = err.message || 'Could not register. Please try again';
        setAuthNote(message);
        showNotification(message, 'error');
      }
      return;
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSheet();
    if ((e.ctrlKey||e.metaKey) && e.key === 'Enter') saveItem();
  });

  initData();
