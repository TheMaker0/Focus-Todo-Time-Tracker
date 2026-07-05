/* Claude Time Entry Manager - Fresh implementation */
(function(){
  const STORAGE_KEY = 'claude_time_entries';
  let formIsAM = true;  // Time picker AM/PM state
  
  const DOM = {
    get: id => document.getElementById(id),
    getAll: selector => document.querySelectorAll(selector)
  };

  // Storage
  function loadEntries(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch(e) { return []; }
  }

  function saveEntries(entries){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries || []));
    updateStats();
  }

  // Time utilities
  function parseTime(value){
    if(!value) return null;
    if(typeof value === 'number') return value;
    // Handle HH:MM time format
    if(typeof value === 'string' && value.includes(':')){
      const [hours, minutes] = value.split(':');
      const now = new Date();
      now.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      return now.getTime();
    }
    const ts = Date.parse(value);
    return isNaN(ts) ? null : ts;
  }

  function formatTime(timestamp){
    if(!timestamp) return 'No time set';
    const date = new Date(timestamp);
    return date.toLocaleString('en-PH', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  }

  function formatForInput(timestamp){
    if(!timestamp) return '';
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function getStatus(entry){
    const ts = parseTime(entry.time);
    if(!ts) return 'not ready';
    return Date.now() >= ts ? 'ready' : 'not ready';
  }

  function getRemainingMs(entry){
    const ts = parseTime(entry.time);
    if(!ts) return null;
    return ts - Date.now();
  }

  function formatCountdown(ms){
    if(ms === null) return '—';
    if(ms <= 0) return '✓ Ready';
    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts = [];
    if(d) parts.push(`${d}d`);
    if(h) parts.push(`${h}h`);
    if(m) parts.push(`${m}m`);
    if(!d && !h) parts.push(`${s}s`);
    return parts.join(' ') + ' left';
  }

  // Stats
  function updateStats(){
    const entries = loadEntries();
    const total = entries.length;
    const ready = entries.filter(e => getStatus(e) === 'ready').length;
    const notReady = total - ready;
    
    const countEl = DOM.get('websitesCount'); if(countEl) countEl.textContent = total || '';
    const totalEl = DOM.get('wsTotal'); if(totalEl) totalEl.textContent = `${total} Entries`;
    const notReadyEl = DOM.get('wsManual'); if(notReadyEl) notReadyEl.textContent = notReady;
    const readyEl = DOM.get('wsAuto'); if(readyEl) readyEl.textContent = ready;
  }

  // Modal
  function openModal(){
    const modal = document.querySelector('.websites-modal');
    if(modal) {
      renderList();
      modal.style.display = 'flex';
    }
  }

  function closeModal(){
    const modal = document.querySelector('.websites-modal');
    if(modal) {
      modal.style.display = 'none';
      resetForm();
    }
  }

  function openDrawer(idx){
    const drawer = DOM.get('siteDrawer');
    if(!drawer) return;
    const entries = loadEntries();
    const entry = entries[idx];
    if(!entry) return;

    const status = getStatus(entry);
    const remaining = getRemainingMs(entry);

    DOM.get('drawerTitle').textContent = entry.name || 'Unnamed';
    DOM.get('drawerEmail').textContent = entry.email || 'No email';
    DOM.get('drawerPassword').textContent = entry.password || '—';
    DOM.get('drawerStatusValue').textContent = status.toUpperCase();
    DOM.get('drawerStatusValue').style.color = status === 'ready' ? 'var(--todo)' : 'var(--pending)';
    DOM.get('drawerCountdown').textContent = formatCountdown(remaining);
    DOM.get('drawerCountdown').style.color = status === 'ready' ? 'var(--todo)' : 'var(--muted2)';
    DOM.get('drawerTimeInput').value = formatForInput(entry.time);
    DOM.get('drawerTime').textContent = formatTime(entry.time);
    
    drawer.dataset.idx = String(idx);
    drawer.style.display = 'flex';
  }

  function closeDrawer(){
    const drawer = DOM.get('siteDrawer');
    if(drawer) drawer.style.display = 'none';
  }

  function copyPassword(){
    const drawer = DOM.get('siteDrawer');
    if(!drawer || !drawer.dataset.idx) return;
    
    const idx = Number(drawer.dataset.idx);
    const entries = loadEntries();
    const entry = entries[idx];
    if(!entry || !entry.password) return;
    
    navigator.clipboard.writeText(entry.password).then(() => {
      const btn = DOM.get('copyPasswordBtn');
      const original = btn.textContent;
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = original; }, 2000);
    });
  }

  // Rendering
  function renderList(){
    const list = DOM.get('sitesGroup');
    if(!list) return;
    list.innerHTML = '';
    
    const entries = loadEntries();
    if(entries.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">No entries yet</div>';
      return;
    }

    entries.forEach((entry, idx) => {
      const status = getStatus(entry);
      const remaining = getRemainingMs(entry);
      const statusColor = status === 'ready' ? 'var(--todo)' : 'var(--pending)';
      const statusDot = status === 'ready' ? '🟢' : '🔴';
      const initials = (entry.name || 'U').substring(0, 2).toUpperCase();
      
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:14px;padding:14px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);';
      
      // Avatar
      const avatar = document.createElement('div');
      avatar.style.cssText = 'width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#5D6CFF,#7b8cff);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:14px;flex-shrink:0;';
      avatar.textContent = initials;
      
      // Content
      const content = document.createElement('div');
      content.style.cssText = 'flex:1;min-width:0;';
      content.innerHTML = `
        <div style="font-weight:900;color:#fff;font-size:15px;margin-bottom:4px;">${entry.name || 'Unnamed'}</div>
        <div style="font-size:12px;color:var(--muted2);margin-bottom:6px;">${entry.email || 'No email'}</div>
        <div style="font-size:12px;color:${statusColor};font-weight:700;">${statusDot} ${status === 'ready' ? 'Ready' : 'Not ready'}</div>
      `;
      
      // Actions
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;flex-shrink:0;';
      
      const btnStyle = 'background:transparent;border:1px solid rgba(255,255,255,0.1);color:var(--muted);width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;';
      
      const clockBtn = document.createElement('button');
      clockBtn.style.cssText = btnStyle;
      clockBtn.innerHTML = '⏱';
      clockBtn.onclick = (e) => { e.stopPropagation(); openDrawer(idx); };
      
      const detailsBtn = document.createElement('button');
      detailsBtn.style.cssText = btnStyle;
      detailsBtn.innerHTML = '◉';
      detailsBtn.onclick = (e) => { e.stopPropagation(); openDrawer(idx); };
      
      const editBtn = document.createElement('button');
      editBtn.style.cssText = btnStyle;
      editBtn.innerHTML = '✎';
      editBtn.onclick = (e) => { e.stopPropagation(); populateForm(entry, idx); showForm(); };
      
      const delBtn = document.createElement('button');
      delBtn.style.cssText = btnStyle;
      delBtn.innerHTML = '🗑';
      delBtn.onclick = (e) => { e.stopPropagation(); deleteEntry(idx); };
      
      actions.appendChild(clockBtn);
      actions.appendChild(detailsBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      
      row.appendChild(avatar);
      row.appendChild(content);
      row.appendChild(actions);
      list.appendChild(row);
    });
    
    updateStats();
  }

  // Form
  function showForm(){
    const form = DOM.get('createFormArea');
    if(form) form.style.display = 'block';
    DOM.get('siteTitle')?.focus();
  }

  function hideForm(){
    const form = DOM.get('createFormArea');
    if(form) form.style.display = 'none';
    resetForm();
  }

  function resetForm(){
    DOM.get('siteTitle').value = '';
    DOM.get('siteTime').value = '';
    DOM.get('siteEmail').value = '';
    DOM.get('sitePassword').value = '';
    DOM.get('siteIndex').value = '';
    
    // Reset time picker to defaults
    const hourSlider = DOM.get('formHourSlider');
    const minSlider = DOM.get('formMinSlider');
    const amBtn = DOM.get('formAMBtn');
    const pmBtn = DOM.get('formPMBtn');
    
    hourSlider.value = 12;
    minSlider.value = 0;
    formIsAM = true;
    
    DOM.get('formHourDisplay').textContent = '12';
    DOM.get('formMinDisplay').textContent = '00';
    DOM.get('formHourValue').textContent = '12';
    DOM.get('formMinValue').textContent = '00';
    
    amBtn.style.background = 'rgba(78,204,163,0.2)';
    amBtn.style.borderColor = 'rgba(78,204,163,0.4)';
    amBtn.style.color = 'var(--todo)';
    pmBtn.style.background = 'transparent';
    pmBtn.style.borderColor = 'rgba(255,255,255,0.1)';
    pmBtn.style.color = 'var(--muted)';
  }

  function populateForm(entry, idx){
    DOM.get('siteTitle').value = entry.name || '';
    DOM.get('siteEmail').value = entry.email || '';
    DOM.get('sitePassword').value = entry.password || '';
    DOM.get('siteIndex').value = String(idx);
    
    // Set time picker from entry timestamp
    if(entry.time){
      const date = new Date(entry.time);
      let h = date.getHours();
      let m = date.getMinutes();
      
      const isAM = h < 12;
      if(h === 0) h = 12;
      else if(h > 12) h -= 12;
      
      // Update form state
      formIsAM = isAM;
      const amBtn = DOM.get('formAMBtn');
      const pmBtn = DOM.get('formPMBtn');
      
      if(isAM){
        amBtn.style.background = 'rgba(78,204,163,0.2)';
        amBtn.style.borderColor = 'rgba(78,204,163,0.4)';
        amBtn.style.color = 'var(--todo)';
        pmBtn.style.background = 'transparent';
        pmBtn.style.borderColor = 'rgba(255,255,255,0.1)';
        pmBtn.style.color = 'var(--muted)';
      } else {
        pmBtn.style.background = 'rgba(78,204,163,0.2)';
        pmBtn.style.borderColor = 'rgba(78,204,163,0.4)';
        pmBtn.style.color = 'var(--todo)';
        amBtn.style.background = 'transparent';
        amBtn.style.borderColor = 'rgba(255,255,255,0.1)';
        amBtn.style.color = 'var(--muted)';
      }
      
      const hourSlider = DOM.get('formHourSlider');
      const minSlider = DOM.get('formMinSlider');
      hourSlider.value = h;
      minSlider.value = m;
      
      // Update display
      DOM.get('formHourDisplay').textContent = String(h).padStart(2, '0');
      DOM.get('formMinDisplay').textContent = String(m).padStart(2, '0');
      DOM.get('formHourValue').textContent = String(h).padStart(2, '0');
      DOM.get('formMinValue').textContent = String(m).padStart(2, '0');
      DOM.get('siteTime').value = String(entry.time);
    }
  }

  function submitForm(e){
    e?.preventDefault?.();
    
    const name = (DOM.get('siteTitle').value || '').trim();
    const timeValue = DOM.get('siteTime').value;
    const email = (DOM.get('siteEmail').value || '').trim();
    const password = (DOM.get('sitePassword').value || '').trim();
    
    if(!name || !timeValue) {
      alert('Please fill in name and time.');
      return;
    }
    
    // Time is stored as a timestamp string (milliseconds)
    const time = parseInt(timeValue);
    if(isNaN(time) || time <= 0) {
      alert('Invalid time.');
      return;
    }
    
    const entries = loadEntries();
    const idx = DOM.get('siteIndex').value;
    
    const entry = { name, time, email, password, updated: Date.now() };
    
    if(idx !== ''){
      const n = Number(idx);
      if(n >= 0 && n < entries.length){
        entry.created = entries[n].created || Date.now();
        entries[n] = entry;
      }
    } else {
      entry.created = Date.now();
      entries.push(entry);
    }
    
    saveEntries(entries);
    renderList();
    hideForm();
  }

  function deleteEntry(idx){
    if(!confirm('Delete this entry?')) return;
    const entries = loadEntries();
    entries.splice(idx, 1);
    saveEntries(entries);
    renderList();
    closeDrawer();
  }

  function setLimit(){
    const drawer = DOM.get('siteDrawer');
    if(!drawer) return;
    
    const idx = Number(drawer.dataset.idx);
    const entries = loadEntries();
    const entry = entries[idx];
    
    if(!entry) return;
    
    const timeStr = (DOM.get('drawerTimeInput').value || '').trim();
    const time = parseTime(timeStr);
    
    if(!time) {
      alert('Invalid time format.');
      return;
    }
    
    entry.time = time;
    entry.updated = Date.now();
    saveEntries(entries);
    renderList();
    openDrawer(idx);
  }

  function eraseAll(){
    if(!confirm('Delete ALL entries? Cannot undo.')) return;
    localStorage.removeItem(STORAGE_KEY);
    renderList();
    hideForm();
  }

  // Countdown ticker
  function startTicker(){
    setInterval(() => {
      renderList();
      
      // Update drawer if open
      const drawer = DOM.get('siteDrawer');
      if(drawer && drawer.style.display === 'flex'){
        const idx = Number(drawer.dataset.idx);
        if(!isNaN(idx)) openDrawer(idx);
      }
    }, 1000);
  }

  // Init
  function init(){
    updateStats();
    renderList();
    
    // Modal
    const navWebsites = DOM.get('navWebsites');
    if(navWebsites) navWebsites.addEventListener('click', openModal);
    
    const closeModals = DOM.getAll('.websites-close');
    closeModals.forEach(btn => btn.addEventListener('click', closeModal));
    
    // Drawer
    const drawerClose = DOM.get('drawerClose');
    if(drawerClose) drawerClose.addEventListener('click', closeDrawer);
    
    const drawerCloseBtn = DOM.get('drawerCloseBtn');
    if(drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
    
    const setLimitBtn = DOM.get('setLimitBtn');
    if(setLimitBtn) setLimitBtn.addEventListener('click', setLimit);
    
    const copyPasswordBtn = DOM.get('copyPasswordBtn');
    if(copyPasswordBtn) copyPasswordBtn.addEventListener('click', copyPassword);
    
    // Form
    const addNewBtn = DOM.get('addNewSiteBtn');
    if(addNewBtn) addNewBtn.addEventListener('click', showForm);
    
    const addSiteBtn = DOM.get('addSiteBtn');
    if(addSiteBtn) addSiteBtn.addEventListener('click', submitForm);
    
    const eraseAllBtn = DOM.get('eraseAllBtn');
    if(eraseAllBtn) eraseAllBtn.addEventListener('click', eraseAll);

    // Time picker sliders and AM/PM
    const hourSlider = DOM.get('formHourSlider');
    const minSlider = DOM.get('formMinSlider');
    const amBtn = DOM.get('formAMBtn');
    const pmBtn = DOM.get('formPMBtn');

    function setAmPm(value){
      if(value === 'AM'){
        formIsAM = true;
        if(amBtn){
          amBtn.style.background = 'rgba(78,204,163,0.2)';
          amBtn.style.borderColor = 'rgba(78,204,163,0.4)';
          amBtn.style.color = 'var(--todo)';
        }
        if(pmBtn){
          pmBtn.style.background = 'transparent';
          pmBtn.style.borderColor = 'rgba(255,255,255,0.1)';
          pmBtn.style.color = 'var(--muted)';
        }
      } else {
        formIsAM = false;
        if(pmBtn){
          pmBtn.style.background = 'rgba(78,204,163,0.2)';
          pmBtn.style.borderColor = 'rgba(78,204,163,0.4)';
          pmBtn.style.color = 'var(--todo)';
        }
        if(amBtn){
          amBtn.style.background = 'transparent';
          amBtn.style.borderColor = 'rgba(255,255,255,0.1)';
          amBtn.style.color = 'var(--muted)';
        }
      }
      updateFormTimeInput();
    }

    window.setAmPm = setAmPm;

    function updateFormTimeDisplay(){
      let h = parseInt(hourSlider.value);
      const m = parseInt(minSlider.value);
      DOM.get('formHourDisplay').textContent = String(h).padStart(2, '0');
      DOM.get('formMinDisplay').textContent = String(m).padStart(2, '0');
      DOM.get('formHourValue').textContent = String(h).padStart(2, '0');
      DOM.get('formMinValue').textContent = String(m).padStart(2, '0');
      updateFormTimeInput();
    }

    function updateFormTimeInput(){
      let h = parseInt(hourSlider.value);
      const m = parseInt(minSlider.value);
      if(!formIsAM && h !== 12) h += 12;
      if(formIsAM && h === 12) h = 0;
      const now = new Date();
      now.setHours(h, m, 0, 0);
      DOM.get('siteTime').value = now.getTime();
    }

    if(hourSlider) hourSlider.addEventListener('input', updateFormTimeDisplay);
    if(minSlider) minSlider.addEventListener('input', updateFormTimeDisplay);

    if(amBtn) amBtn.addEventListener('click', () => setAmPm('AM'));
    if(pmBtn) pmBtn.addEventListener('click', () => setAmPm('PM'));
    
    // Countdown ticker
    startTicker();
  }

  // Expose for debugging
  window.claudeTime = { openModal, closeModal, loadEntries, saveEntries };
  
  document.addEventListener('DOMContentLoaded', init);
})();
