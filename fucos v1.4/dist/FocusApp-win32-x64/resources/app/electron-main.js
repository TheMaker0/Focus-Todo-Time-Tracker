const path = require('path');
const http = require('http');
const { app, BrowserWindow, ipcMain } = require('electron');

const SERVER_URL = 'http://localhost:3000';
const SERVER_TIMEOUT = 20000;
let mainWindow;

function createSplashWindow() {
  const splash = new BrowserWindow({
    width: 520,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    show: false,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => splash.show());
  return splash;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0E0F13',
    autoHideMenuBar: true,
    show: false,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(SERVER_URL);
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function waitForServer(url, timeout = SERVER_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve();
      });

      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('Server did not start in time.'));
          return;
        }
        setTimeout(check, 150);
      });
    };

    check();
  });
}

async function runApp() {
  const splash = createSplashWindow();

  try {
    require('./server');
    await waitForServer(SERVER_URL);
    createMainWindow();
  } catch (err) {
    console.error('Failed to start the app:', err);
    app.quit();
  } finally {
    if (splash && !splash.isDestroyed()) {
      splash.close();
    }
  }
}

async function promptForPassword() {
  return new Promise((resolve) => {
    const authWin = new BrowserWindow({
      width: 420,
      height: 240,
      frame: false,
      resizable: false,
      modal: true,
      show: false,
      center: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload-auth.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    authWin.loadFile(path.join(__dirname, 'auth.html'));
    authWin.once('ready-to-show', () => authWin.show());

    ipcMain.once('auth-password', (event, pw) => {
      // allow a cancel code
      if (pw === '__CANCEL__') {
        resolve(false);
        if (!authWin.isDestroyed()) authWin.close();
        return;
      }
      const ok = String(pw || '') === '1610';
      // notify the window so it can show feedback briefly
      authWin.webContents.send('auth-result', ok);
      setTimeout(() => {
        resolve(ok);
        if (!authWin.isDestroyed()) authWin.close();
      }, 600);
    });
  });
}

app.whenReady().then(async () => {
  const ok = await promptForPassword();
  if (!ok) {
    app.quit();
    return;
  }
  runApp();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    runApp();
  }
});
