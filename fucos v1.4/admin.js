const CURRENT_USER_KEY = 'focus_current_user_v1';
const CURRENT_USER_ROLE_KEY = 'focus_current_user_role_v1';
const LOGIN_PAGE_PATH = 'login.html';
const USER_LIST_API = '/api/users.php?action=list';

function formatDate(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp * 1000).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(CURRENT_USER_ROLE_KEY);
  window.location.href = LOGIN_PAGE_PATH;
}

async function loadUsers() {
  const body = document.getElementById('userTableBody');
  const metrics = document.getElementById('userMetrics');
  body.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#8D96A5;">Loading users...</td></tr>';
  metrics.innerHTML = '';

  try {
    const response = await fetch(USER_LIST_API, { cache: 'no-store' });
    if (!response.ok) {
      body.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#E05C97;">Unable to load user list.</td></tr>';
      return;
    }

    const users = await response.json();
    if (!Array.isArray(users)) {
      body.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#E05C97;">Invalid response from server.</td></tr>';
      return;
    }

    const totalUsers = users.length;
    const adminCount = users.filter(u => u.role === 'admin').length;
    const activeCount = users.filter(u => u.totalItems > 0).length;

    metrics.innerHTML = `
      <div class="metric">
        <div class="metric-title">Total users</div>
        <div class="metric-value">${formatNumber(totalUsers)}</div>
      </div>
      <div class="metric">
        <div class="metric-title">Admins</div>
        <div class="metric-value">${formatNumber(adminCount)}</div>
      </div>
      <div class="metric">
        <div class="metric-title">Active users</div>
        <div class="metric-value">${formatNumber(activeCount)}</div>
      </div>
    `;

    if (users.length === 0) {
      body.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#8D96A5;">No users found.</td></tr>';
      return;
    }

    body.innerHTML = users.map(user => {
      const roleClass = user.role === 'admin' ? 'admin' : '';
      return `
        <tr>
          <td>${user.user}</td>
          <td>${user.display || user.user}</td>
          <td><span class="status-pill ${roleClass}">${user.role || 'user'}</span></td>
          <td>${formatNumber(user.totalItems)}</td>
          <td>${formatNumber(user.doneCount)}</td>
          <td>${formatNumber(user.outstandingCount)}</td>
          <td>${formatNumber(user.dayLogCount)}</td>
          <td>${formatDate(user.createdAt)}</td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    body.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#E05C97;">Error loading users.</td></tr>';
    console.error('Admin loadUsers error:', error);
  }
}

function initAdminPage() {
  const currentUser = localStorage.getItem(CURRENT_USER_KEY);
  const currentRole = localStorage.getItem(CURRENT_USER_ROLE_KEY) || 'user';
  if (!currentUser || currentRole !== 'admin') {
    window.location.href = LOGIN_PAGE_PATH;
    return;
  }

  document.getElementById('logoutButton').addEventListener('click', logout);
  document.getElementById('refreshButton').addEventListener('click', loadUsers);
  document.getElementById('createUserButton').addEventListener('click', createUser);
  document.getElementById('openAppButton').addEventListener('click', () => window.location.href = 'index.html');

  loadUsers();
}

async function createUser() {
  const username = prompt('Enter a new username:');
  if (!username) return;
  const password = prompt('Enter password for ' + username + ':');
  if (!password) return;
  const display = prompt('Enter display name (optional):', username) || username;
  const makeAdmin = confirm('Make this account an admin? Click OK for Admin, Cancel for User.');

  try {
    const response = await fetch('/api/users.php?action=register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: username.trim(), password, display, admin: makeAdmin })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      alert(error?.error || 'Could not create user');
      return;
    }
    alert('User created successfully.');
    loadUsers();
  } catch (err) {
    console.error('Create user failed:', err);
    alert('Could not create user.');
  }
}

document.addEventListener('DOMContentLoaded', initAdminPage);
