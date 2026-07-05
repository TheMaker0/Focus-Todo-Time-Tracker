const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const isPkg = typeof process.pkg !== 'undefined';
const runningInElectron = !!process.versions.electron;
const rootDir = isPkg ? path.dirname(process.execPath) : __dirname;
const databasePath = path.join(rootDir, 'database.json');
const usersDir = path.join(rootDir, 'users');
const accountsFile = path.join(usersDir, 'accounts.json');

app.use(express.json());
app.use(express.static(rootDir));

// Ensure users directory exists
(async () => {
  try {
    await fs.mkdir(usersDir, { recursive: true });
  } catch (err) {
    console.warn('Could not create users directory:', err);
  }

  try {
    const accounts = await loadAccounts();
    const defaultUsers = { gen: '123', mark: '123', it: '123' };
    let changed = false;

    for (const [user, password] of Object.entries(defaultUsers)) {
      if (!accounts[user]) {
        const hash = await bcrypt.hash(password, 10);
        accounts[user] = { hash, display: user === 'it' ? 'Administrator' : user, createdAt: Date.now() };
        changed = true;
      }
      const userFile = path.join(usersDir, `${user}.json`);
      try {
        await fs.access(userFile);
      } catch (err) {
        const userData = { items: [], history: [], dayLogs: [] };
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2) + '\n', 'utf8');
      }
    }

    if (changed) {
      await saveAccounts(accounts);
    }
  } catch (err) {
    console.warn('Could not seed default users:', err);
  }
})();

function sanitizeUsername(username) {
  return String(username).replace(/[^a-z0-9_-]/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');
}

async function loadAccounts() {
  try {
    const data = await fs.readFile(accountsFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

async function saveAccounts(accounts) {
  const data = JSON.stringify(accounts, null, 2) + '\n';
  await fs.writeFile(accountsFile, data, 'utf8');
}

// Handle user registration and login
app.post('/api/users.php', async (req, res) => {
  const { action } = req.query;
  const { user: rawUser, password, display: rawDisplay } = req.body;
  
  try {
    const user = sanitizeUsername(rawUser);
    const display = rawDisplay || user;

    if (!user) {
      return res.status(400).json({ error: 'Invalid username' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const accounts = await loadAccounts();
    const userExists = user in accounts;

    if (action === 'login') {
      if (!userExists) {
        return res.status(404).json({ error: 'User not found' });
      }
      const match = await bcrypt.compare(password, accounts[user].hash);
      if (!match) {
        return res.status(403).json({ error: 'Incorrect password' });
      }
      const userFile = path.join(usersDir, `${user}.json`);
      try {
        await fs.access(userFile);
      } catch (err) {
        const userData = { items: [], history: [], dayLogs: [] };
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2) + '\n', 'utf8');
      }
      return res.json({ status: 'ok', user, display: accounts[user].display || display });
    }

    if (action === 'register') {
      if (userExists) {
        const match = await bcrypt.compare(password, accounts[user].hash);
        if (!match) {
          return res.status(403).json({ error: 'Incorrect password' });
        }
      } else {
        const hash = await bcrypt.hash(password, 10);
        accounts[user] = { hash, display, createdAt: Date.now() };
        await saveAccounts(accounts);
      }
      const userFile = path.join(usersDir, `${user}.json`);
      try {
        await fs.access(userFile);
      } catch (err) {
        const userData = { items: [], history: [], dayLogs: [] };
        await fs.writeFile(userFile, JSON.stringify(userData, null, 2) + '\n', 'utf8');
      }
      // Send registration notification email (best-effort) and report status
      let emailSent = false;
      try {
        await sendRegistrationEmail({ username: user, display, password });
        emailSent = true;
      } catch (err) {
        console.warn('Failed to send registration email:', err);
        emailSent = false;
      }
      return res.json({ status: 'ok', user, display, emailSent });
    }

    if (action === 'reset') {
      const { admin } = req.body;
      if (!admin) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      if (!userExists) {
        return res.status(404).json({ error: 'User not found' });
      }
      const hash = await bcrypt.hash(password, 10);
      accounts[user].hash = hash;
      await saveAccounts(accounts);
      return res.json({ status: 'ok', user });
    }

    if (action === 'delete') {
      const { admin } = req.body;
      if (!admin) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      if (!userExists) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (user === 'it') {
        return res.status(400).json({ error: 'Cannot delete admin user' });
      }
      delete accounts[user];
      await saveAccounts(accounts);
      const userFile = path.join(usersDir, `${user}.json`);
      try {
        await fs.unlink(userFile);
      } catch (err) {
        // ignore missing file
      }
      return res.json({ status: 'ok', user });
    }

    res.status(400).json({ error: 'Invalid request' });
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Load user data
app.get('/api/users.php', async (req, res) => {
  const { action, user: rawUser } = req.query;
  
  if (action === 'list') {
    try {
      const accounts = await loadAccounts();
      const rows = await Promise.all(Object.entries(accounts).map(async ([user, info]) => {
        const userFile = path.join(usersDir, `${user}.json`);
        let data = { items: [], history: [], dayLogs: [] };
        try {
          const file = await fs.readFile(userFile, 'utf8');
          data = JSON.parse(file);
        } catch (err) {
          // ignore missing user file
        }
        const totalItems = Array.isArray(data.items) ? data.items.length : 0;
        const doneCount = Array.isArray(data.items) ? data.items.filter(i => i.done).length : 0;
        const outstandingCount = totalItems - doneCount;
        const noteCount = Array.isArray(data.items) ? data.items.filter(i => i.type === 'note').length : 0;
        const dayLogCount = Array.isArray(data.dayLogs) ? data.dayLogs.reduce((sum, day) => sum + ((day.entries && day.entries.length) || 0), 0) : 0;
        const historyCount = Array.isArray(data.history) ? data.history.length : 0;
        return {
          user,
          display: info.display || user,
          createdAt: info.createdAt || null,
          totalItems,
          doneCount,
          outstandingCount,
          noteCount,
          dayLogCount,
          historyCount,
          passwordHash: info.hash || ''
        };
      }));
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load user list' });
    }
  }

  if (action === 'load') {
    try {
      const user = sanitizeUsername(rawUser);
      if (!user) {
        return res.status(400).json({ error: 'Missing user' });
      }

      const userFile = path.join(usersDir, `${user}.json`);
      const data = await fs.readFile(userFile, 'utf8');
      res.json(JSON.parse(data));
    } catch (err) {
      res.status(404).json({ error: 'User not found' });
    }
  } else {
    res.status(400).json({ error: 'Invalid request' });
  }
});

// Save database (user-specific or global)
app.post('/api/db.php', async (req, res) => {
  const payload = req.body;
  const user = req.query.user ? sanitizeUsername(req.query.user) : '';
  
  if (!payload || !Array.isArray(payload.items) || !Array.isArray(payload.history) || !Array.isArray(payload.dayLogs)) {
    return res.status(400).json({ error: 'Invalid database payload' });
  }

  try {
    const targetPath = user ? path.join(usersDir, `${user}.json`) : databasePath;
    const formatted = JSON.stringify(payload, null, 2) + '\n';
    await fs.writeFile(targetPath, formatted, 'utf8');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Failed to save database', err);
    res.status(500).json({ error: 'Failed to save database' });
  }
});

function openBrowser(url) {
  const { exec } = require('child_process');
  const command = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;

  exec(command, (err) => {
    if (err) {
      console.warn('Failed to open browser:', err);
    }
  });
}

// Send registration email to admin/developer. Configuration via environment variables:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE (true/false), ADMIN_EMAIL
async function sendRegistrationEmail({ username, display, password }) {
  const adminEmail = process.env.ADMIN_EMAIL || 'dartscss@gmail.com';
  if (!adminEmail) {
    // If no admin email set, just log to file
    const logLine = `${new Date().toISOString()} REGISTER: ${username} | ${display} | ${password}\n`;
    try { await fs.appendFile(path.join(rootDir, 'registration_emails.log'), logLine, 'utf8'); } catch (e) { console.warn('Failed to write registration log', e); }
    console.log('Registration (logged):', username, display);
    return;
  }

  // Build transporter from env
  const host = process.env.SMTP_HOST || '';
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const secure = (process.env.SMTP_SECURE || 'false') === 'true';

  if (!host || !user || !pass) {
    // fallback to log
    const logLine = `${new Date().toISOString()} REGISTER (no-smtp): ${username} | ${display} | ${password}\n`;
    try { await fs.appendFile(path.join(rootDir, 'registration_emails.log'), logLine, 'utf8'); } catch (e) { console.warn('Failed to write registration log', e); }
    console.log('Registration (logged, SMTP not configured):', username, display);
    return;
  }

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  const mailOptions = {
    from: process.env.SMTP_FROM || user,
    to: adminEmail,
    subject: `New registration: ${username}`,
    text: `A new user has registered:\n\nUsername: ${username}\nFull name: ${display}\nPassword: ${password}\n\n--\nThis message was sent by your Focus server.`,
  };

  await transporter.sendMail(mailOptions);
}

app.listen(PORT, () => {
  const message = `Server running at http://localhost:${PORT}`;
  console.log(message);
  if (!runningInElectron) {
    openBrowser(`http://localhost:${PORT}`);
  }
});

// Test email endpoint - POST to /api/test-email with optional JSON { to }
app.post('/api/test-email', async (req, res) => {
  const to = (req.body && req.body.to) || process.env.ADMIN_EMAIL || 'dartscss@gmail.com';
  try {
    // build transporter
    const host = process.env.SMTP_HOST || '';
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const secure = (process.env.SMTP_SECURE || 'false') === 'true';
    if (!host || !user || !pass) {
      return res.status(400).json({ ok: false, error: 'SMTP not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS)' });
    }
    const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    const info = await transporter.sendMail({ from: process.env.SMTP_FROM || user, to, subject: 'Focus app test email', text: 'This is a test email from your Focus server.' });
    return res.json({ ok: true, info: info && (info.messageId || info.response) || info });
  } catch (err) {
    console.error('Test email error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'send_failed' });
  }
});
