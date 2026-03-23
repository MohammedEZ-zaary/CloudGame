const { app, BrowserWindow, ipcMain } = require("electron");
const { webcrypto } = require('crypto');
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, './.env') });
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

let mainWindow;
let splashWindow; // 1. Add a variable for the splash screen

function createWindows() {
  // 2. Create the Main Window (but keep it hidden)
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1280,
    minHeight: 900,
    show: false, // DON'T SHOW IT YET!
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true 
    },
    frame: false,
    backgroundColor: "#0a0f1e",
    icon: path.join(__dirname, "assets/icon.png"),
  });

  // Load the login screen silently in the background
  mainWindow.loadFile("./src/view/login.html");

  // 3. Create the Splash Screen Window
  splashWindow = new BrowserWindow({
    width: 600,
    height: 400,
    transparent: true, // Allows the glowing effect
    frame: false,
    alwaysOnTop: true, // Keeps it above other apps while loading
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  // Load the new intro animation file
  splashWindow.loadFile("./src/view/intro.html");

  // --- IPC EVENT LISTENERS ---

  // 4. Listen for the splash screen to finish its animation
  ipcMain.on("intro-finished", () => {
    if (splashWindow) {
      splashWindow.close(); // Destroy the intro window
    }
    mainWindow.show(); // Reveal the main app!
  });

  // Window control handlers (Keep your existing logic)
  ipcMain.on("minimize", () => mainWindow.minimize());
  
  ipcMain.on("maximize", () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  
  ipcMain.on("close", () => {
    app.quit(); // Better to quit the whole app if they hit close on the main window
  });
  
  ipcMain.on("login-success", () => {
    mainWindow.loadFile("./src/view/gameDashboard.html");
  });

  mainWindow.on("closed", () => (mainWindow = null));
}
// Add this line to disable Chrome's autoplay block
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(createWindows);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindows();
});

// Expose userData path to renderer
ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});