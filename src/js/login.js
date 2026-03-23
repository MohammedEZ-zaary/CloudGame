// ADDED USERNAME to the import so we can find the local database!
const { USERNAME, initializeStorage, checkAndUploadGamesToCloud, createStorageBase, syncGames, checkIfGameFileExisteInComputer } = require("../js/megaApi");
const { ipcRenderer, app } = require("electron");
const path = require("path");
const { readJsonFile, writeJsonFile } = require("../js/jsonMethods");
const { existsSync, writeFileSync } = require("fs");

let storage;
let userDataPath;
let userGames = []; // Will hold our library data for the images

// Window controls
document.getElementById("minimize-btn").addEventListener("click", () => ipcRenderer.send("minimize"));
document.getElementById("maximize-btn").addEventListener("click", () => ipcRenderer.send("maximize"));
document.getElementById("close-btn").addEventListener("click", () => ipcRenderer.send("close"));

// --- THE SMART UI INTERCEPTOR ---
// This function reads the text from MEGA and changes the image
function handleStatusUpdate(statusText) {
  const msgEl = document.getElementById("message");
  if (msgEl) msgEl.textContent = statusText;

  const artContainer = document.getElementById("sync-art-container");
  const artImg = document.getElementById("sync-art");

  if (artContainer && artImg) {
    // Check if the status text contains any of the games in our library
    const activeGame = userGames.find(g => statusText.includes(g.gameName));

    if (activeGame && activeGame.background_image) {
      // Game match found! Show the glowing poster
      artImg.src = activeGame.background_image;
      artContainer.style.display = "block";
    } else if (
      statusText.includes("Scanning") || 
      statusText.includes("Complete") || 
      statusText.includes("Authenticating") || 
      statusText.includes("Master List")
    ) {
      // Hide the image when doing generic system tasks
      artContainer.style.display = "none";
    }
  }
}

// Check if rememberMe True 
async function start() {
  userDataPath = await ipcRenderer.invoke('get-user-data-path');
  
  if (existsSync(`${userDataPath}/login.json`) == false) {
    writeFileSync(`${userDataPath}/login.json`, JSON.stringify({
      "username": "", "email": "", "password": "", "rememberMe": false
    }));
  }

  // Pre-load the user's game library so we have the image URLs ready
  try {
    const repoData = await readJsonFile(`C:/Users/${USERNAME}/localgameRepo.json`);
    if (repoData && repoData.gamesCloud) userGames = repoData.gamesCloud;
  } catch (e) { /* Ignore if first time login */ }

  const jsonData = await readJsonFile(`${userDataPath}/login.json`);
  const rememberMeStatus = await rememberMeState();
  
  if (rememberMeStatus == true) {
      // Inject the new UI layout with the hidden image container
      document.getElementById("form-section").innerHTML = `
      <div class="loading-box" style="display: flex; flex-direction: column; align-items: center;">
        <div id="sync-art-container">
           <img id="sync-art" src="" class="sync-thumbnail">
        </div>
        <div class="spinner"></div>
        <div class="message" id="message">Authenticating...</div>
      </div>`;
    
    storage = await initializeStorage(jsonData.email, jsonData.password, handleStatusUpdate);
    await syncGames(storage, handleStatusUpdate);
    await checkAndUploadGamesToCloud(storage, handleStatusUpdate);
    await checkIfGameFileExisteInComputer(storage, handleStatusUpdate);

    handleStatusUpdate("Synchronization Complete.");
    await storage.close();

    ipcRenderer.send("login-success");
  }
}

start();

// Form handling
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const remember = document.getElementById("remember").checked;

  const loginJsonFile = `${userDataPath}/login.json`;
  const jsonData = await readJsonFile(loginJsonFile);
  
  if (!email || !password) {
    alert("Please enter both email and password");
    return;
  }
  
  // Pre-load the user's game library for the images
  try {
    const repoData = await readJsonFile(`C:/Users/${USERNAME}/localgameRepo.json`);
    if (repoData && repoData.gamesCloud) userGames = repoData.gamesCloud;
  } catch (e) { }

  // Inject the new UI layout with the hidden image container
  document.getElementById("form-section").innerHTML = `
      <div class="loading-box" style="display: flex; flex-direction: column; align-items: center;">
        <div id="sync-art-container">
           <img id="sync-art" src="" class="sync-thumbnail">
        </div>
        <div class="spinner"></div>
        <div class="message" id="message">Connecting to MEGA...</div>
      </div>`;
  
  try {
    storage = await initializeStorage(email, password, handleStatusUpdate);

    if (storage) {
      jsonData.username = storage.name;
      await writeJsonFile(loginJsonFile, jsonData);
      
      if (remember) {
        jsonData.email = email;
        jsonData.password = password;
        jsonData.username = storage.name;
        jsonData.rememberMe = true;
        await writeJsonFile(loginJsonFile, jsonData);
      } 
      
      await syncGames(storage, handleStatusUpdate);
      await checkAndUploadGamesToCloud(storage, handleStatusUpdate);
      await checkIfGameFileExisteInComputer(storage, handleStatusUpdate);
      
      handleStatusUpdate("Synchronization Complete.");
      await storage.close();
      ipcRenderer.send("login-success");
    }
  } catch (error) {
    document.getElementById("message").textContent = "Authentication failed. Please check your credentials.";
    
    setTimeout(() => {
      document.getElementById("form-section").innerHTML = `
          <form id="loginForm">
              <div class="input-group">
                  <label for="email">MEGA EMAIL</label>
                  <input type="email" id="email" placeholder="Enter your MEGA email" required>
              </div>
              <div class="input-group">
                  <label for="password">MEGA PASSWORD</label>
                  <input type="password" id="password" placeholder="Enter your MEGA password" required>
              </div>
              <div class="remember-me">
                  <input type="checkbox" id="remember">
                  <label for="remember">Remember me</label>
              </div>
              <button type="submit" class="login-btn">LOGIN WITH MEGA</button>
              <div class="signup-link">
                  Don't have a MEGA account? <a href="https://mega.nz/register" target="_blank">Create one</a>
              </div>
          </form>`;
    }, 3000);
  }
});

// Video background handling
document.addEventListener("DOMContentLoaded", () => {
  const video = document.querySelector(".background-video");
  if (video) {
    video.play().catch((e) => {
      video.muted = true;
      video.play();
    });
  }
});

async function rememberMeState () {
  const jsonData = await readJsonFile(`${userDataPath}/login.json`);
  return jsonData.rememberMe;
}

// Intro Animation Sequence
document.addEventListener("DOMContentLoaded", () => {
  const introOverlay = document.getElementById("intro-overlay");
  const loginContainer = document.querySelector(".login-container");

  if (introOverlay && loginContainer) {
    setTimeout(() => {
      introOverlay.style.opacity = "0";
      setTimeout(() => {
        introOverlay.style.visibility = "hidden";
        loginContainer.classList.add("show-login");
      }, 800); 
    }, 2700); 
  }
});