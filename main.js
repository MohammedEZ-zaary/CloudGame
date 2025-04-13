const { app, BrowserWindow, ipcMain } = require("electron");
const { webcrypto } = require('crypto');

const path = require("path");
// const fs = require("fs").promises;


if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1280,
    minHeight: 900,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true 
    },
    frame: false,
    backgroundColor: "#0a0f1e",
    icon: path.join(__dirname, "assets/icon.png"),
  });
  // mainWindow.webContents.openDevTools(); // Opens DevTools automatically

  mainWindow.loadFile("./src/view/login.html");

  // Window control handlers
  ipcMain.on("minimize", () => mainWindow.minimize());
  ipcMain.on("maximize", () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on("close", () => mainWindow.close());
  ipcMain.on("login-success", () => {
    mainWindow.loadFile("./src/view/gameDashboard.html");
  });
  mainWindow.on("closed", () => (mainWindow = null));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

// Expose userData path to renderer
ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});