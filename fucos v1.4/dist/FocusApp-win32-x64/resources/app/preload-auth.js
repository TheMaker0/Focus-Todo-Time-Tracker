const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendPassword: (pw) => ipcRenderer.send('auth-password', pw),
  onAuthResult: (cb) => ipcRenderer.on('auth-result', (e, ok) => cb(ok))
});
