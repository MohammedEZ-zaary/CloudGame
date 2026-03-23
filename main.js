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

function createWindows() {
  // 1. Create the Main Window (Hidden initially)
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

  // Keep the app running in the background when X is clicked
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault(); 
      mainWindow.hide();      
    }
  });

  mainWindow.loadFile("./src/view/login.html");

  // 2. Create the Splash Screen Window
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
  
  // FIX: This now hides the app to the tray instead of killing it!
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
  // Replace with the exact path to your app's icon
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

// --- STEAM-STYLE NOTIFICATION LOGIC ---
ipcMain.on('show-custom-notification', (event, data) => {
  // 1. THE FIX: Safely check if an old window exists before trying to close it
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

  // 2. THE FIX: Clear the ghost from memory when it closes
  notificationWindow.on('closed', () => {
    notificationWindow = null;
  });

  notificationWindow.loadFile('./src/view/notification.html');

  // 3. THE FIX: Make sure the window is still alive before sending text to it
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
  // 4. THE FIX: Same safety check here
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
  createTray(); // Initialize the background engine!
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