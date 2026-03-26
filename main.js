const { app, BrowserWindow, ipcMain, Tray, Menu, screen } = require("electron");
const { webcrypto } = require('crypto');
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, './.env') });

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

let mainWindow;
let splashWindow; 
let tray = null;
let notificationWindow = null;
let isQuitting = false;

// --- NEW: Detect if Windows launched the app in the background ---
const isHiddenBoot = process.argv.includes('--hidden');

function createWindows() {
  // 1. Create the Main Window (Always hidden initially)
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1280,
    minHeight: 900,
    show: false, 
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true 
    },
    frame: false,
    backgroundColor: "#0a0f1e",
    icon: path.join(__dirname, "src","assets", "cloud-game.ico"),
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault(); 
      mainWindow.hide();      
    }
  });

  mainWindow.loadFile("./src/view/login.html");

  // 2. Only show the Splash Screen if the user manually opened the app!
  if (!isHiddenBoot) {
    splashWindow = new BrowserWindow({
      width: 600,
      height: 400,
      transparent: true, 
      frame: false,
      alwaysOnTop: true, 
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    splashWindow.loadFile("./src/view/intro.html");
  }

  // --- IPC EVENT LISTENERS ---

  ipcMain.on("intro-finished", () => {
    if (splashWindow) {
      splashWindow.close(); 
    }
    mainWindow.show(); 
  });

  ipcMain.on("minimize", () => mainWindow.minimize());
  
  ipcMain.on("maximize", () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  
  ipcMain.on("close", () => {
    if (!isQuitting) {
      mainWindow.hide();
    } else {
      app.quit();
    }
  });
  
  ipcMain.on("login-success", () => {
    mainWindow.loadFile("./src/view/gameDashboard.html");
  });

  mainWindow.on("closed", () => (mainWindow = null));
}

// --- SYSTEM TRAY LOGIC ---
function createTray() {
  tray = new Tray(path.join(__dirname, 'src', 'assets', 'cloud-game.ico')); 
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open CloudGame', click: () => mainWindow.show() },
    { type: 'separator' },
    { 
      label: 'Quit CloudGame', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);

  tray.setToolTip('CloudGame Auto-Sync');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow.show());
}

// --- NEW: STARTUP SETTINGS LISTENER ---
ipcMain.on('toggle-startup', (event, runOnStartup) => {
  app.setLoginItemSettings({
    openAtLogin: runOnStartup,
    // This argument tells Electron to launch in "hidden" mode
    args: ['--hidden']
  });
});

// --- STEAM-STYLE NOTIFICATION LOGIC ---
ipcMain.on('show-custom-notification', (event, data) => {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.close(); 
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;
  const notifWidth = 340;
  const notifHeight = 100;

  notificationWindow = new BrowserWindow({
    width: notifWidth,
    height: notifHeight,
    x: width - notifWidth - 20, 
    y: 20,                      
    frame: false,               
    transparent: true,          
    alwaysOnTop: true,          
    skipTaskbar: true,          
    resizable: false,
    focusable: false,           
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  notificationWindow.on('closed', () => {
    notificationWindow = null;
  });

  notificationWindow.loadFile('./src/view/notification.html');

  notificationWindow.webContents.on('did-finish-load', () => {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.webContents.send('update-notification', data);
    }
  });

  if (data.isDone) {
    setTimeout(() => {
      if (notificationWindow && !notificationWindow.isDestroyed()) {
        notificationWindow.close();
      }
    }, 5000);
  }
});

ipcMain.on('update-custom-notification', (event, data) => {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.webContents.send('update-notification', data);
    
    if (data.isDone) {
      setTimeout(() => {
        if (notificationWindow && !notificationWindow.isDestroyed()) {
          notificationWindow.close();
        }
      }, 5000); 
    }
  }
});

// App Initialization
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(() => {
  createWindows();
  createTray();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindows();
});

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});