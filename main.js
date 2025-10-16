// main.js
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fetch = require('node-fetch'); // v2 for CommonJS

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Simple IPC handler to proxy API requests from renderer to backend
ipcMain.handle('api-fetch', async (event, { path, opts }) => {
  try {
    const url = path.startsWith('http') ? path : `http://localhost:4000${path}`;
    // Ensure cookies stored by the main process/session are used by node-fetch
    const fetchOpts = {
      method: opts?.method || 'GET',
      headers: opts?.headers || {},
      body: opts?.body,
      // node-fetch won't automatically use Electron's cookies; if you need cookies from the server
      // you should manage token storage in main or attach Authorization header here.
      timeout: opts?.timeout || 15000,
    };
    const res = await fetch(url, fetchOpts);
    const text = await res.text();
    return { status: res.status, headers: Object.fromEntries(res.headers), body: text };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('print-bill', async (event, htmlContent) => {
  try {
    const printWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: true, 
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    await printWindow.webContents.executeJavaScript('document.readyState');

    return new Promise((resolve, reject) => {
      printWindow.webContents.print(
        {
          silent: false, 
          printBackground: true,
          deviceName: '', 
          margins: {
            marginType: 'none' 
          },
          pageSize: { width: 80000, height: 200000 } 
        },
        (success, errorType) => {
          setTimeout(() => {
            if (!printWindow.isDestroyed()) {
              printWindow.close();
            }
          }, 500);
          
          if (success) {
            resolve({ success: true });
          } else {
            reject(new Error(`Print failed: ${errorType}`));
          }
        }
      );
    });
  } catch (error) {
    console.error('Print error:', error);
    throw error;
  }
});