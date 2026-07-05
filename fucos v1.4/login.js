const USERS_KEY = 'focus_users_v1';
const CURRENT_USER_KEY = 'focus_current_user_v1';
const CURRENT_USER_DISPLAY_KEY = 'focus_current_user_display_v1';
const CURRENT_USER_ROLE_KEY = 'focus_current_user_role_v1';
const userApiUrl = '/api/users.php';
let authMode = 'login';
let currentUserRole = localStorage.getItem(CURRENT_USER_ROLE_KEY) || 'user';

function getStoredUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); } catch (e) { return {}; }
}

function saveStoredUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function slugifyUserName(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function hashPassword(password) {
  if (!password) return '';
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function setAuthNote(message, type = 'error') {
  const note = document.getElementById('authNote');
  if (!note) return;
  note.textContent = message;
  note.style.color = type === 'success' ? '#4ECCA3' : '#E05C97';
}

function showNotification(message, type = 'success') {
  const notif = document.createElement('div');
  notif.textContent = message;
  notif.style.position = 'fixed';
  notif.style.bottom = '24px';
  notif.style.right = '24px';
  notif.style.padding = '14px 18px';
  notif.style.borderRadius = '14px';
  notif.style.background = type === 'success' ? 'rgba(78,204,163,0.14)' : 'rgba(224,92,151,0.14)';
  notif.style.color = type === 'success' ? '#4ECCA3' : '#E05C97';
  notif.style.border = type === 'success' ? '1px solid rgba(78,204,163,0.25)' : '1px solid rgba(224,92,151,0.25)';
  notif.style.zIndex = '1000';
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3200);
}

function switchAuthMode(mode) {
  authMode = mode;
  const tabs = document.querySelectorAll('.auth-tab');
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
  const loginSub = document.getElementById('authSubLogin');
  const registerSub = document.getElementById('authSubRegister');
  const displayInput = document.getElementById('authUserDisplay');
  const confirmInput = document.getElementById('authUserPasswordConfirm');
  const submitBtn = document.getElementById('authSubmitBtn');

  if (mode === 'login') {
    loginSub.style.display = 'block';
    registerSub.style.display = 'none';
    displayInput.style.display = 'none';
    confirmInput.style.display = 'none';
    submitBtn.textContent = 'Login';
  } else {
    loginSub.style.display = 'none';
    registerSub.style.display = 'block';
    displayInput.style.display = 'block';
    confirmInput.style.display = 'block';
    submitBtn.textContent = 'Register';
  }
  setAuthNote('');
}

async function loginUserLocal(userName, rawPassword) {
  const users = getStoredUsers();
  const account = users[userName];
  if (!account) return false;
  const hash = await hashPassword(rawPassword);
  if (account.pwd !== hash) return false;
  const role = account.role || (userName === 'it' ? 'admin' : 'user');
  setCurrentUser(userName, account.display || userName, role);
  return true;
}

async function registerUserLocal(userName, rawPassword, displayName) {
  const users = getStoredUsers();
  if (users[userName]) return false;
  const hash = await hashPassword(rawPassword);
  users[userName] = { pwd: hash, display: displayName || userName, role: 'user', createdAt: Date.now() };
  saveStoredUsers(users);
  setCurrentUser(userName, displayName || userName, 'user');
  return true;
}

function setCurrentUser(userName, displayName, role = 'user') {
  localStorage.setItem(CURRENT_USER_KEY, userName);
  localStorage.setItem(CURRENT_USER_DISPLAY_KEY, displayName || userName);
  localStorage.setItem(CURRENT_USER_ROLE_KEY, role);
  currentUserRole = role;
}

async function submitAuth() {
  const input = document.getElementById('authUserName');
  const pwdInput = document.getElementById('authUserPassword');
  const confirmInput = document.getElementById('authUserPasswordConfirm');
  const displayInput = document.getElementById('authUserDisplay');

  const rawName = input.value.trim();
  const rawPassword = pwdInput.value;
  const displayName = displayInput.value.trim();
  const confirmPassword = confirmInput.value;

  setAuthNote('');

  if (!rawName) { setAuthNote('Enter a username'); showNotification('Enter a username', 'error'); return; }
  if (!rawPassword) { setAuthNote('Enter a password'); showNotification('Enter a password', 'error'); return; }

  const userName = slugifyUserName(rawName);
  if (!userName) { setAuthNote('Invalid username'); showNotification('Invalid username', 'error'); return; }

  if (authMode === 'register' && rawPassword !== confirmPassword) {
    setAuthNote('Passwords do not match');
    showNotification('Passwords do not match', 'error');
    return;
  }

  const isFileMode = window.location.protocol === 'file:';

  if (authMode === 'login') {
    if (await loginUserLocal(userName, rawPassword)) {
      window.location.href = 'index.html';
      return;
    }

    if (isFileMode) {
      setAuthNote('Invalid username or password');
      showNotification('Invalid username or password', 'error');
      return;
    }

    try {
      const response = await fetch(`${userApiUrl}?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userName, password: rawPassword, display: displayName }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => null) || {};
        const role = data.role || 'user';
        const display = data.display || displayName || rawName;
        setCurrentUser(userName, display, role);
        window.location.href = role === 'admin' ? 'admin.html' : 'index.html';
        return;
      }

      const error = await response.json().catch(() => null);
      const message = error?.error || 'Login failed';
      setAuthNote(message);
      showNotification(message, 'error');
    } catch (err) {
      setAuthNote('Unable to contact server');
      showNotification('Unable to contact server', 'error');
    }
    return;
  }

  if (authMode === 'register') {
    const users = getStoredUsers();
    if (users[userName]) {
      setAuthNote('Username already exists');
      showNotification('Username already exists', 'error');
      return;
    }

    if (isFileMode) {
      if (await registerUserLocal(userName, rawPassword, displayName || rawName)) {
        window.location.href = 'index.html';
      }
      return;
    }

    try {
      const response = await fetch(`${userApiUrl}?action=register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userName, password: rawPassword, display: displayName || rawName }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => null) || {};
        const role = data.role || 'user';
        const display = data.display || displayName || rawName;
        setCurrentUser(userName, display, role);
        window.location.href = role === 'admin' ? 'admin.html' : 'index.html';
        return;
      }

      const error = await response.json().catch(() => null);
      const message = error?.error || 'Registration failed';
      setAuthNote(message);
      showNotification(message, 'error');
    } catch (err) {
      setAuthNote('Unable to contact server');
      showNotification('Unable to contact server', 'error');
    }
  }
}

function initLoginPage() {
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  const userRole = localStorage.getItem(CURRENT_USER_ROLE_KEY) || 'user';
  if (currentUser) {
    window.location.href = userRole === 'admin' ? 'admin.html' : 'index.html';
    return;
  }

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAuthMode(tab.dataset.mode));
  });

  const submitBtn = document.getElementById('authSubmitBtn');
  submitBtn.addEventListener('click', submitAuth);

  ['authUserName', 'authUserPassword', 'authUserPasswordConfirm', 'authUserDisplay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
    }
  });
}

document.addEventListener('DOMContentLoaded', initLoginPage);
