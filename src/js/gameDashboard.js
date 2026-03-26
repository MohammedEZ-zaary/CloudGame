const {USERNAME} = require("../js/megaApi");
const CommunityService = require('../js/communityService');
const {readJsonFile, writeJsonFile} = require("../js/jsonMethods")
const {ipcRenderer} = require("electron");
const {existsSync} = require("node:original-fs");
const {initializeStorage, checkIfGameFileExisteInComputer, checkAndUploadGamesToCloud,getShareLink} = require("../js/megaApi");
const path = require("path");
const { shell } = require('electron');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Now replace your hardcoded strings with these variables:
const OPENAI_API_KEY2 = process.env.OPENAI_API_KEY2;

const SGDB_API_KEY = process.env.SGDB_API_KEY;

// DOM Elements
const gameLibrary = document.getElementById("gameLibrary");
const addGameModal = document.getElementById("addGameModal");
const lastSyncDiv = document.getElementById("last-sync");

// State
let gamesData = [];
let gamesFileJson;
let userDataPath;
let userInfo;
let activeWatchers = {}; 
let syncTimeouts = {}; 

// --- 1. INITIALIZATION & DATA LOADING ---
async function loadLocalGames() {
  try {
    userDataPath = await ipcRenderer.invoke('get-user-data-path');
    userInfo = await readJsonFile(`${userDataPath}/login.json`);

    document.getElementById("username").textContent = userInfo.username;

    const jsonData = await readJsonFile(`C:/Users/${USERNAME}/localgameRepo.json`);
    gamesFileJson = jsonData;
    gamesData = jsonData.gamesCloud;
    displayGames(gamesData);
    
    // ADD THIS LINE RIGHT HERE:
    applySavedSettings();
    if (jsonData.lastTimeSync) {
      lastSyncDiv.textContent = `Last synced: ${jsonData.lastTimeSync}`;
    }
    // ADD THIS LINE HERE:
    startBackgroundWatcher();
  } catch (error) {
    console.error("Failed to load local games:", error);
    showNotification("Error loading local repository", false);
  }
}

loadLocalGames();



// --- 2. API (Upgraded with SteamGridDB) ---
async function fetchGameInfo(gameName) {

  try {
    // 1. Search for the game to get its exact ID
    const searchRes = await fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(gameName)}`, {
      headers: { 'Authorization': `Bearer ${SGDB_API_KEY}` }
    });
    const searchData = await searchRes.json();

    if (!searchData.success || searchData.data.length === 0) {
      return null; // Game not found
    }

    const gameId = searchData.data[0].id; // Grabs the most accurate match

    // 2. Fetch the best "Grid" (poster) for that specific Game ID
    // We request 600x900 dimension posters, which are standard Steam library sizes
    const gridRes = await fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900&limit=1`, {
      headers: { 'Authorization': `Bearer ${SGDB_API_KEY}` }
    });
    const gridData = await gridRes.json();

    if (gridData.success && gridData.data.length > 0) {
      return { 
        background_image: gridData.data[0].url,
        // Note: SteamGridDB is only for art. If you still want genres/ratings, 
        // you would keep your RAWG fetch here just for the text data!
        genres: [], 
        rating: 0 
      };
    }
    
    return null;
  } catch (error) { 
    console.error("Art Fetch Error:", error);
    return null; 
  }
}

// --- 3. UI RENDERING ---
function displayGames(games) {
  gameLibrary.innerHTML = "";
  
  // Update header count
  document.getElementById("game-count").textContent = `${games.length} GAMES`;

  if (!games || games.length === 0) {
    gameLibrary.innerHTML = `<div style="color: var(--steam-text-muted); width: 100%; grid-column: 1 / -1; text-align: center; margin-top: 50px;">Your library is empty. Add a game to begin syncing.</div>`;
    return;
  }

  games.forEach((game) => {
    const gameItem = document.createElement("div");
    gameItem.classList.add("game-item");
    if (!game.shouldSync) gameItem.classList.add("not-syncing");

    // ADD THIS: Make the whole card clickable
    // gameItem.onclick = (e) => {
    //   // Don't open details if they clicked the options button (⋮) or dropdown!
    //   if (e.target.closest('.options-wrapper')) return; 
      
    //   showGameDetails(game.gameName);
    // };

    const defaultImg = "https://images.unsplash.com/photo-1550745165-9bc0b252726f?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80";
    const imgSrc = game.background_image || defaultImg;
    
    // Status text
    const statusText = game.shouldSync ? (game.isFileUploaded ? "Up to date" : "Pending Sync") : "Sync Disabled";

    // Escape name for IDs
    const safeId = game.gameName.replace(/[^a-zA-Z0-9]/g, '-');

    // NEW: Safely escape any single quotes (apostrophes) so they don't break the HTML!
    const escapedName = game.gameName.replace(/'/g, "\\'");

   // --- Define the SVG Icons ---
    const syncIcon = game.shouldSync 
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; margin-right: 8px;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; margin-right: 8px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    const shareIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; margin-right: 8px;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
    const deleteIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; margin-right: 8px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    gameItem.innerHTML = `
      <img src="${imgSrc}" alt="${game.gameName}">
      <div class="options-wrapper">
        <button class="options-btn" onclick="toggleDropdown(event, '${safeId}')">⋮</button>
        <div class="dropdown-menu" id="dropdown-${safeId}">
          <button style="display: flex; align-items: center;" onclick="toggleSyncStatus('${escapedName}')">${syncIcon} ${game.shouldSync ? 'Stop Syncing' : 'Resume Syncing'}</button>
          <button style="display: flex; align-items: center;" onclick="shareGame('${escapedName}')">${shareIcon} Share Save Data</button>
          <button class="danger" style="display: flex; align-items: center;" onclick="removeGame('${escapedName}')">${deleteIcon} Remove from Library</button>
        </div>
      </div>
      <div class="game-info">
        <div class="game-title" title="${game.gameName}">${game.gameName}</div>
        <div class="game-status" style="color: ${game.shouldSync ? 'var(--steam-blue)' : 'var(--steam-text-muted)'}">${statusText}</div>
      </div>
    `;
    gameLibrary.appendChild(gameItem);
  });
}

// --- 4. NEW ACTIONS (Sync Toggle, Remove, Share) ---
async function toggleSyncStatus(gameName) {
  const game = gamesFileJson.gamesCloud.find(g => g.gameName === gameName);
  
  if (game) {
    // This flips it: If it's true, it becomes false. If it's false, it becomes true.
    game.shouldSync = !game.shouldSync;
    
    // Save the changes and update the screen
    await writeJsonFile(`C:/Users/${USERNAME}/localgameRepo.json`, gamesFileJson);
    gamesData = gamesFileJson.gamesCloud;
    displayGames(gamesData);
    
    showNotification(`${gameName} sync ${game.shouldSync ? 'enabled' : 'disabled'}.`, true);
  }
}

async function removeGame(gameName) {
  // Simple confirmation before deleting
  if (confirm(`Are you sure you want to remove ${gameName} from your CloudGame library? Local save files will NOT be deleted.`)) {
    gamesFileJson.gamesCloud = gamesFileJson.gamesCloud.filter(g => g.gameName !== gameName);
    gamesData = gamesFileJson.gamesCloud;
    await writeJsonFile(`C:/Users/${USERNAME}/localgameRepo.json`, gamesFileJson);
    displayGames(gamesData);
    showNotification(`${gameName} removed from library.`, true);
  }
}

async function shareGame(gameName) {
  const game = gamesFileJson.gamesCloud.find(g => g.gameName === gameName);
  
  if (!game) return;

  // Make sure the game is actually uploaded before trying to share it!
  if (game.isFileUploaded === false) {
    showNotification("Please sync this game first before sharing!", false);
    return;
  }

  // Open modal and show a loading state
  document.getElementById('shareModal').classList.add('active');
  const input = document.getElementById('shareLinkInput');
  const copyBtn = document.querySelector('.share-input-group button');

  input.value = "Generating secure MEGA link... Please wait.";
  copyBtn.disabled = true;

  try {
    // 1. We need to wake up the storage connection briefly to ask for the link
    const storage = await initializeStorage(userInfo.email, userInfo.password, () => {});
    
    // 2. Ask MEGA for the specific file link
    const zipName = game.gameCloudName + ".zip";
    const link = await getShareLink(storage, zipName);

    // 3. Display the real link and re-enable the copy button
    input.value = link;
    copyBtn.disabled = false;
    
  } catch (error) {
    input.value = "Error: Could not generate link.";
    showNotification("Failed to generate link. Make sure the file exists on MEGA.", false);
    copyBtn.disabled = false;
  }
}

function copyShareLink() {
  const input = document.getElementById('shareLinkInput');
  input.select();
  document.execCommand("copy"); // Fallback standard copy
  showNotification("Link copied to clipboard!", true);
  document.getElementById('shareModal').classList.remove('active');
}

// Dropdown click handler
function toggleDropdown(event, safeId) {
  event.stopPropagation(); // Stop click from bubbling
  
  // Close any open dropdowns first
  document.querySelectorAll('.dropdown-menu').forEach(menu => {
    if (menu.id !== `dropdown-${safeId}`) menu.classList.remove('show');
  });

  const dropdown = document.getElementById(`dropdown-${safeId}`);
  dropdown.classList.toggle('show');
}

// Close dropdowns when clicking anywhere else on the screen
document.addEventListener("click", () => {
  document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('show'));
});


// --- 5. EXISTING ACTIONS (Sync & Add) ---
async function syncGames() {
  const button = document.querySelector(".action-btn.primary");
  const statusContainer = document.querySelector(".sync-status-container");
  const statusText = document.getElementById("last-sync");
  const originalText = button.innerHTML;
  
  // Custom SVG Icons for button states
  const spinnerSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; margin-right: 8px; animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`;
  const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; margin-right: 8px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const errorSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; margin-right: 8px;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;

  try {
    // 1. Activate UI Loading State
    button.innerHTML = `${spinnerSvg} Syncing...`;
    button.disabled = true;
    
    // Add class to trigger the spinning icon and glow in the sidebar widget
    if (statusContainer) statusContainer.classList.add("syncing-active");
    
    // 2. Run MEGA Logic
    // We pass the status update to the sidebar text instead of a global variable
    let storage = await initializeStorage(userInfo.email, userInfo.password, (status) => { 
      statusText.textContent = status; 
    });
    
    await checkAndUploadGamesToCloud(storage, (status) => { 
      statusText.textContent = status; 
    });
    
    await checkIfGameFileExisteInComputer(storage, (status) => { 
      statusText.textContent = status; 
    });

    // 3. Update Library View
    displayGames(gamesData);
    
    // 4. Success State
    button.innerHTML = `${checkSvg} Complete`;
    statusText.textContent = "All games synchronized.";

    setTimeout(() => {
      button.innerHTML = originalText;
      button.disabled = false;
      if (statusContainer) statusContainer.classList.remove("syncing-active");
      statusText.textContent = `Last synced: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }, 3000);

  } catch (error) {
    // 5. Error State
    console.error("Sync Error:", error);
    button.innerHTML = `${errorSvg} Failed`;
    statusText.textContent = "Sync interrupted.";
    
    setTimeout(() => { 
      button.innerHTML = originalText; 
      button.disabled = false; 
      if (statusContainer) statusContainer.classList.remove("syncing-active");
    }, 3000);
    
    showNotification("Sync process encountered an error.", false);
  }
}

async function addGame() {
  const nameInput = document.getElementById("gameName");
  const pathInput = document.getElementById("gamePath");
  const name = nameInput.value.trim();
  const gamePath = pathInput.value.trim();

  if (!name || !gamePath) return showNotification("Please fill in all required fields", false);
  if (!existsSync(gamePath)) return showNotification(`Path not found: ${gamePath}`, false);

  if (gamesFileJson.gamesCloud.some(item => item.gameName.toLowerCase() === name.toLowerCase())) {
    return showNotification(`Game "${name}" already exists`, false);
  }

  const submitBtn = document.querySelector(".btn-submit");
  submitBtn.innerHTML = "ADDING..."; submitBtn.disabled = true;

  try {
    const gameInfo = await fetchGameInfo(name) || {};
    const newGame = {
      gameName: name, gameCloudName: name,
      background_image: gameInfo.background_image || null,
      genres: gameInfo.genres || [], rating: gameInfo.rating || 0,
      distLocal: getPathAfterUsername(gamePath, USERNAME),
      isFileUploaded: false, shouldSync: true,
      lastTimeEdit: new Date().toISOString()
    };

    gamesFileJson.gamesCloud.push(newGame);
    gamesData = gamesFileJson.gamesCloud;
    await writeJsonFile(`C:/Users/${USERNAME}/localgameRepo.json`, gamesFileJson);
    
    displayGames(gamesData);
    showNotification("Game added successfully!", true);
    nameInput.value = ""; pathInput.value = "";
    hideAddGameModal();
  } catch (error) {
    showNotification("Failed to add game.", false);
  } finally {
    submitBtn.innerHTML = "ADD SELECTED PROGRAM"; submitBtn.disabled = false;
  }
}

// --- 6. MODALS & WINDOWS ---
function showAddGameModal() { addGameModal.classList.add("active"); }
function hideAddGameModal() { addGameModal.classList.remove("active"); }

if (!document.getElementById("notification")) {
  document.body.insertAdjacentHTML('beforeend', `<div class="notification" id="notification"><span class="notification-message"></span></div>`);
}

function showNotification(message, isSuccess) {
  const notification = document.getElementById("notification");
  notification.querySelector(".notification-message").textContent = message;
  notification.className = `notification show ${isSuccess ? '' : 'error'}`;
  setTimeout(() => notification.classList.remove("show"), 3000);
}

document.getElementById("minimize-btn").addEventListener("click", () => ipcRenderer.send("minimize"));
document.getElementById("maximize-btn").addEventListener("click", () => ipcRenderer.send("maximize"));
document.getElementById("close-btn").addEventListener("click", () => ipcRenderer.send("close"));

function getPathAfterUsername(fullPath, username) {
  const parts = fullPath.split(username);
  return parts.length > 1 ? parts[1] : '';
}

const os = require('os');
const fs = require('fs');

// --- AUTO-SCANNER ENGINE ---

// Blacklist to ignore common system/app folders that aren't games
const IGNORE_FOLDERS = [
  'microsoft', 'google', 'adobe', 'intel', 'nvidia', 'discord', 'spotify', 
  'obs-studio', 'slack', 'vlc', 'temp', 'cache', 'logs', 'packages', 'roaming'
];

async function openScanner() {
  const scanModal = document.getElementById('scanModal');
  const resultsContainer = document.getElementById('scanResults');
  const loader = document.getElementById('scanLoader');
  
  scanModal.classList.add('active');
  resultsContainer.innerHTML = '';
  loader.style.display = 'block';

  // Common locations for PC game saves
  const homedir = os.homedir();
  const searchPaths = [
    path.join(homedir, 'Documents'),
    path.join(homedir, 'Documents', 'My Games'),
    path.join(homedir, 'Saved Games'),
    path.join(homedir, 'AppData', 'Local'),
    path.join(homedir, 'AppData', 'Roaming'),
    path.join(homedir, 'AppData', 'LocalLow')
  ];

  let foundFolders = [];

  // Run the scan asynchronously so it doesn't freeze the UI
  setTimeout(async () => {
    searchPaths.forEach(dirPath => {
      try {
        if (fs.existsSync(dirPath)) {
          const items = fs.readdirSync(dirPath, { withFileTypes: true });
          
          items.forEach(item => {
            if (item.isDirectory()) {
              const folderName = item.name;
              const folderNameLower = folderName.toLowerCase();
              
              // Apply basic static filters first to save AI tokens
              if (!folderName.startsWith('.') && 
                  !IGNORE_FOLDERS.some(ignore => folderNameLower.includes(ignore))) {
                
                foundFolders.push({
                  name: folderName,
                  fullPath: path.join(dirPath, folderName)
                });
              }
            }
          });
        }
      } catch (err) {
        console.warn(`Could not scan directory: ${dirPath}`, err);
      }
    });

    // Remove exact duplicates
    foundFolders = foundFolders.filter((v, i, a) => a.findIndex(t => (t.name === v.name)) === i);

    // --- AI FILTERING STEP ---
    // 1. Update UI so the user knows the AI is thinking
    loader.innerHTML = `
      <div class="spinner" style="width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #66c0f4; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      <p style="margin-top: 10px; color: #66c0f4;">AI is filtering ${foundFolders.length} folders...</p>
    `;

    // 2. Extract just the names to send to the AI
    const rawFolderNames = foundFolders.map(f => f.name);

    // 3. Ask OpenAI to filter the list
    const verifiedGameNames = await filterGameFoldersWithAI(rawFolderNames);

    // 4. Match the AI's approved names back to our original folder objects
    // We use lowercase comparison just in case the AI changed the capitalization
    const verifiedNamesLower = verifiedGameNames.map(n => n.toLowerCase());
    const finalCleanFolders = foundFolders.filter(f => verifiedNamesLower.includes(f.name.toLowerCase()));

// 1. NEW: Update UI to show we are downloading images
    loader.innerHTML = `
      <div class="spinner" style="width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #66c0f4; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      <p style="margin-top: 10px; color: #66c0f4;">Downloading cover art...</p>
    `;

    // 2. NEW: Fetch images for all the verified folders
    const foldersWithImages = await Promise.all(finalCleanFolders.map(async (folder) => {
      // Use your existing fetch API function!
      const gameInfo = await fetchGameInfo(folder.name);
      
      return {
        ...folder,
        // If API finds an image, use it. Otherwise, use a sleek dark fallback image.
        image: gameInfo && gameInfo.background_image 
               ? gameInfo.background_image 
               : "https://images.unsplash.com/photo-1550745165-9bc0b252726f?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80"
      };
    }));

    // 3. Render the beautiful, image-rich results!
    loader.style.display = 'none';
    renderScanResults(foldersWithImages); // Pass the new array with images
    
  }, 500);
}

function renderScanResults(folders) {
  const container = document.getElementById('scanResults');
  container.innerHTML = '';

  if (folders.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--steam-text-muted);">No potential game folders found.</div>';
    return;
  }

  folders.forEach(folder => {
    // Check if game is already in library to prevent duplicates in the scanner
    const isAlreadyAdded = gamesFileJson.gamesCloud.some(g => g.gameCloudName.toLowerCase() === folder.name.toLowerCase());
    
    if (!isAlreadyAdded) {
      const item = document.createElement('div');
      item.className = 'scan-item';
      item.onclick = () => selectScannedGame(folder.name, folder.fullPath);
      
     item.innerHTML = `
        <div class="scan-item-content">
          <img src="${folder.image}" alt="${folder.name}" class="scan-thumbnail">
          <div class="scan-text">
            <div class="scan-folder-name">${folder.name}</div>
            <div class="scan-folder-path">${folder.fullPath}</div>
          </div>
        </div>
        <button class="scan-add-btn">Select</button>
      `;
      container.appendChild(item);
    }
  });
}

// When the user clicks a scanned folder, push it to the Add Game Modal
function selectScannedGame(folderName, fullPath) {
  // Close Scanner Modal
  document.getElementById('scanModal').classList.remove('active');
  
  // Open Add Game Modal
  showAddGameModal();
  
  // Auto-fill the inputs
  document.getElementById('gameName').value = folderName;
  document.getElementById('gamePath').value = fullPath;
}

// --- 7. GAME DETAILS POP-UP ---
function showGameDetails(gameName) {
  // Find the game data
  const game = gamesFileJson.gamesCloud.find(g => g.gameName === gameName);
  if (!game) return;

  // 1. Set Image
  const defaultImg = "https://images.unsplash.com/photo-1550745165-9bc0b252726f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80";
  document.getElementById("detailsHero").style.backgroundImage = `url('${game.background_image || defaultImg}')`;

  // 2. Set Text Info
  document.getElementById("detailsTitle").textContent = game.gameName;
  document.getElementById("detailsPath").textContent = game.distLocal;
  

  const starIcon = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width: 14px; height: 14px; color: #f1c40f;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
  
  // Use innerHTML instead of textContent so the SVG renders properly
  const ratingEl = document.getElementById("detailsRating");
  if (game.rating) {
    ratingEl.innerHTML = `${starIcon} ${game.rating}`;
  } else {
    ratingEl.innerHTML = `${starIcon} Unrated`;
  }
  // 4. Set Sync Status
  const statusEl = document.getElementById("detailsStatus");
  if (!game.shouldSync) {
    statusEl.textContent = "Sync Disabled";
    statusEl.style.color = "var(--steam-text-muted)";
    statusEl.style.borderColor = "var(--steam-text-muted)";
  } else if (game.isFileUploaded) {
    statusEl.textContent = "Cloud Synced";
    statusEl.style.color = "var(--steam-success)"; /* Green */
    statusEl.style.borderColor = "var(--steam-success)";
  } else {
    statusEl.textContent = "Pending Upload";
    statusEl.style.color = "var(--steam-blue)";
    statusEl.style.borderColor = "var(--steam-blue)";
  }

  // 5. Render Genres (If RAWG API found them)
  const genresContainer = document.getElementById("detailsGenres");
  genresContainer.innerHTML = ""; // Clear old ones
  if (game.genres && game.genres.length > 0) {
    game.genres.forEach(genre => {
      // If genre is an object from API, use genre.name. Otherwise use the string.
      const genreName = typeof genre === 'object' ? genre.name : genre;
      genresContainer.innerHTML += `<span class="genre-badge">${genreName}</span>`;
    });
  } else {
    genresContainer.innerHTML = `<span class="genre-badge">CUSTOM GAME</span>`;
  }

  // 6. Show the Modal
  document.getElementById("gameDetailsModal").classList.add("active");
}

function hideGameDetails() {
  document.getElementById("gameDetailsModal").classList.remove("active");
}
// --- SMART AUTO-FILL ENGINE ---

function resolveWindowsPath(templatePath) {
  const home = os.homedir(); 
  
  // Replace the environment variables first (using 'ig' makes it case-insensitive just in case)
  let resolvedPath = templatePath
    .replace(/%APPDATA%/ig, path.join(home, 'AppData', 'Roaming'))
    .replace(/%LOCALAPPDATA%/ig, path.join(home, 'AppData', 'Local'))
    .replace(/%USERPROFILE%/ig, home);

  // path.normalize automatically cleans up any weird or double slashes 
  // so things like "%USERPROFILE%\Saved Games" perfectly resolve to "C:\Users\Name\Saved Games"
  return path.normalize(resolvedPath);
}

async function getSmartGameData(typedName) {
  
const prompt = `
    The user typed the game name "${typedName}". 
    Return a JSON object with two properties:
    1. "correctedName": The official, properly capitalized name of the PC game.
    2. "paths": An array of the 6 most common default Windows save file folder paths for this game. 
    
    CRITICAL INSTRUCTIONS FOR PATHS: 
    - Include variations both WITH and WITHOUT spaces (e.g., "The Last of Us Part II" and "TheLastOfUsPartII").
    - Explicitly include paths directly inside "%USERPROFILE%\\Documents" and "%USERPROFILE%\\Saved Games" (Do NOT just assume it is inside a "My Games" subfolder).
    - Use standard Windows environment variables like %APPDATA%, %LOCALAPPDATA%, %USERPROFILE%\\Documents, and %USERPROFILE%\\Saved Games.
    
    Output ONLY valid JSON. No markdown formatting, no explanation.
  `;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY2}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      })
    });

    const data = await response.json();
    // 1. Check if OpenAI returned an API/Billing error
    if (data.error) {
      console.error("OpenAI Error:", data.error.message);
      return null;
    }
    let aiResponse = data.choices[0].message.content.trim();
    
    // 2. FIX: Strip out markdown backticks if the AI disobeys instructions
    if (aiResponse.startsWith("```")) {
      aiResponse = aiResponse.replace(/^```json\n/, "").replace(/^```\n/, "").replace(/\n```$/, "");
    }

    return JSON.parse(aiResponse);
  } catch (error) {
    console.error("Failed to parse OpenAI response:", error);
    return null;
  }
}

// Listen to the Game Name input field
const gameNameInput = document.getElementById('gameName');

if (gameNameInput) {
  gameNameInput.addEventListener('blur', async (e) => {
    const typedName = e.target.value.trim();
    const pathInput = document.getElementById('gamePath');
    
    if (!typedName || pathInput.value !== "") return;

    const originalVal = e.target.value;
    e.target.value = "Auto-detecting...";

    try {
      const aiData = await getSmartGameData(typedName);

      if (aiData) {
        e.target.value = aiData.correctedName;
        let foundPath = false;
        
        for (let templatePath of aiData.paths) {
          const cleanTemplate = templatePath.replace(/\\\\/g, '\\'); 
          const actualLocalPath = resolveWindowsPath(cleanTemplate);
          
          if (fs.existsSync(actualLocalPath)) {
            pathInput.value = actualLocalPath; 
            foundPath = true;
            showNotification(`Found save data for ${aiData.correctedName}!`, true);
            break; 
          }
        }

        if (!foundPath) {
          showNotification("Could not find default save path. Please enter manually.", false);
        }
      } else {
        // If AI returns null (error), safely revert the text
        e.target.value = originalVal;
      }
    } catch (err) {
      // If a massive crash happens, safely revert the text
      console.error("Fatal error in AI auto-fill:", err);
      e.target.value = originalVal;
    }
  });
}
// --- AI SCANNER FILTER ---
async function filterGameFoldersWithAI(folderNamesList) {
  // If no folders were found, just return empty
  if (!folderNamesList || folderNamesList.length === 0) return [];

  const prompt = `
    I am scanning a Windows PC for game save files. I found the following folder names:
    ${JSON.stringify(folderNamesList)}

    Your job is to act as a filter. Identify ONLY the folders that are named after recognized PC video games.
    CRITICAL INSTRUCTIONS:
    - Ignore generic software (Adobe, Microsoft, Google, etc.).
    - Ignore hardware drivers (Intel, Nvidia, AMD).
    - Ignore generic system folders (CrashDumps, Profiles, Saves, Temp).
    
    Return a strict JSON array of strings containing ONLY the verified game names from the list. 
    Output ONLY valid JSON. No markdown formatting, no explanation.
  `;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY2}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1 // Low temperature so it doesn't get creative
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error("AI Filter Error:", data.error.message);
      return folderNamesList; // FAILSAFE: If AI breaks, return all folders so the app still works
    }

    let aiResponse = data.choices[0].message.content.trim();
    if (aiResponse.startsWith("```")) {
      aiResponse = aiResponse.replace(/^```json\n/, "").replace(/^```\n/, "").replace(/\n```$/, "");
    }

    return JSON.parse(aiResponse);
  } catch (error) {
    console.error("Failed to parse AI Filter response:", error);
    return folderNamesList; // FAILSAFE: Return all folders if it crashes
  }
}

// Add this listener to handle the social clicks
document.addEventListener('click', (event) => {
  // Find if the click was on an <a> tag or an icon inside an <a> tag
  const link = event.target.closest('a');
  
  if (link && link.href.startsWith('http')) {
    event.preventDefault(); // STOP the app from trying to load the URL
    
    try {
      shell.openExternal(link.href); // Open in the real browser
    } catch (error) {
      console.error("External link failed to open:", error);
    }
  }
});
// watch and save auto
let isSyncRunning = false;   // NEW: Prevents MEGA API from overlapping
let syncQueue = [];          // NEW: Lines up games to sync one by one

function startBackgroundWatcher() {
  if (!gamesData) return;

  gamesData.forEach(game => {
    if (game.shouldSync === false) return; 

    const fullPath = path.join(os.homedir(), game.distLocal);
    
    if (fs.existsSync(fullPath)) {
      if (activeWatchers[game.gameName]) return; 

      try {
        const watcher = fs.watch(fullPath, { recursive: true }, (eventType, filename) => {
          // --- NEW MASTER SWITCH CHECK ---
          // If the user turned off notifications/sync in settings, EXIT immediately.
          const isSyncEnabled = !gamesFileJson.settings || gamesFileJson.settings.autoNotifications !== false;
          
          if (!isSyncEnabled) {
            // The app is watching, but we do nothing. No timer, no upload.
            return; 
          }

          if (filename && (filename.endsWith('.tmp') || filename.includes('cache'))) return;

          // console.log(`[Auto-Sync] ${game.gameName} changed. Sync is ENABLED.`);

          if (syncTimeouts[game.gameName]) {
            clearTimeout(syncTimeouts[game.gameName]);
          }

          syncTimeouts[game.gameName] = setTimeout(() => {
            queueSilentSync(game);
          }, 120000); 
        });

        activeWatchers[game.gameName] = watcher;
        // console.log(`👀 Now watching: ${game.gameName}`);
        
      } catch (error) {
        console.error(`Failed to watch ${game.gameName}:`, error);
      }
    }
  });
}

// --- NEW: THE QUEUE MANAGER ---
function queueSilentSync(game) {
  // Don't add to queue if it is already waiting in line
  if (!syncQueue.some(g => g.gameName === game.gameName)) {
    syncQueue.push(game);
  }
  processSyncQueue();
}

async function processSyncQueue() {
  // If a sync is already happening, or the queue is empty, do nothing and wait.
  if (isSyncRunning || syncQueue.length === 0) return;

  // Lock the API!
  isSyncRunning = true;
  const gameToSync = syncQueue.shift(); // Get the first game in line

  try {
    await triggerSilentSync(gameToSync);
  } catch (error) {
    console.error("Queue processing error:", error);
  } finally {
    // Unlock the API and check if another game is waiting in line
    isSyncRunning = false;
    processSyncQueue(); 
  }
}

// --- THE UPLOADER (Called by the Queue) ---
async function triggerSilentSync(game) {
  // console.log(`🚀 Starting background sync for ${game.gameName}`);
  
  const wantsNotifications = !gamesFileJson.settings || gamesFileJson.settings.autoNotifications !== false;
  
  if (wantsNotifications) {
    ipcRenderer.send('show-custom-notification', {
      title: game.gameName,
      image: game.background_image || "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=100",
      status: "Auto-syncing save data...",
      isDone: false
    });
  }

  try {
    let storage = await initializeStorage(userInfo.email, userInfo.password, () => {});
    await checkAndUploadGamesToCloud(storage, () => {});
    
    const localRepoPath = path.join(os.homedir(), "localgameRepo.json");
    gamesFileJson = await readJsonFile(localRepoPath);
    gamesData = gamesFileJson.gamesCloud;
    displayGames(gamesData);
    
    if (wantsNotifications) {
      ipcRenderer.send('update-custom-notification', {
        title: game.gameName,
        status: "Save data secured in cloud.",
        isDone: true
      });
    }
    
    await storage.close();
  } catch (err) {
    console.error(`Background sync failed for ${game.gameName}`, err);
    
    if (wantsNotifications) {
      ipcRenderer.send('update-custom-notification', {
        title: game.gameName,
        status: "Auto-sync failed. Retrying later.",
        isDone: true
      });
    }
  }
}



// THE UI TOGGLE BUTTON
async function toggleSyncStatus(gameName) {
  const game = gamesFileJson.gamesCloud.find(g => g.gameName === gameName);
  
  if (game) {
    if (game.shouldSync === undefined) game.shouldSync = true;
    game.shouldSync = !game.shouldSync;
    
    await writeJsonFile(`C:/Users/${USERNAME}/localgameRepo.json`, gamesFileJson);
    gamesData = gamesFileJson.gamesCloud;
    displayGames(gamesData);
    
    const statusText = game.shouldSync ? "enabled" : "disabled";
    showNotification(`${gameName} sync ${statusText}. Restart app to apply.`, true);
  }
}

// --- SETTINGS LOGIC ---

// --- NAVIGATION LOGIC ---

function showLibraryPage() {
  // 1. Turn OFF the other pages
  document.getElementById('community-view').style.display = 'none';
  document.getElementById('settings-view').style.display = 'none';
  
  // 2. Turn ON the Library page
  document.getElementById('library-view').style.display = 'flex'; 

  // 3. Update the menu button highlight
  document.querySelectorAll('.menu-items').forEach(el => el.classList.remove('active'));
  const navBtn = document.getElementById('nav-library'); // Make sure this matches your HTML ID
  if (navBtn) navBtn.classList.add('active');
}
function showSettingsPage() {
  // 1. Turn OFF the other pages
  document.getElementById('library-view').style.display = 'none';
  document.getElementById('community-view').style.display = 'none';
  
  // 2. Turn ON the Settings page
  document.getElementById('settings-view').style.display = 'flex';

  // 3. Update the menu button highlight
  document.querySelectorAll('.menu-items').forEach(el => el.classList.remove('active'));
  const navBtn = document.getElementById('nav-settings-top'); // We used this ID earlier
  if (navBtn) navBtn.classList.add('active');
}

// Ensure the update function still looks like this:
async function updateSettings() {
  const notifToggle = document.getElementById("toggle-notifications").checked;
  const startupToggle = document.getElementById("toggle-startup").checked;

  if (!gamesFileJson.settings) {
    gamesFileJson.settings = { autoNotifications: true, runOnStartup: false };
  }

  gamesFileJson.settings.autoNotifications = notifToggle;
  gamesFileJson.settings.runOnStartup = startupToggle;

  const localRepoPath = path.join(os.homedir(), 'localgameRepo.json');
  await writeJsonFile(localRepoPath, gamesFileJson);

  ipcRenderer.send('toggle-startup', startupToggle);

  showNotification("Settings saved successfully.", true);
}

// Ensure the modal closes if you click outside of it
document.addEventListener("click", (e) => {
  if (e.target.id === "settingsModal") hideSettingsModal();
});

// Assuming 'gamesFileJson' is where you store local data, let's add a settings object to it
async function updateSettings() {
  const notifToggle = document.getElementById("toggle-notifications").checked;
  const startupToggle = document.getElementById("toggle-startup").checked;

  // Initialize settings object if it doesn't exist in your JSON yet
  if (!gamesFileJson.settings) {
    gamesFileJson.settings = { autoNotifications: true, runOnStartup: false };
  }

  // Update the values
  gamesFileJson.settings.autoNotifications = notifToggle;
  gamesFileJson.settings.runOnStartup = startupToggle;

  // 1. Save to your local JSON
  const localRepoPath = path.join(os.homedir(), 'localgameRepo.json');
  await writeJsonFile(localRepoPath, gamesFileJson);

  // 2. Tell Electron main.js to update the OS Startup Registry!
  ipcRenderer.send('toggle-startup', startupToggle);

  showNotification("Settings saved successfully.", true);
}

// This function reads the JSON and updates the visual UI toggles
function applySavedSettings() {
  // 1. Make sure we actually have settings in our JSON file
  if (gamesFileJson && gamesFileJson.settings) {
    
    // 2. Find the HTML toggle switches
    const notifToggle = document.getElementById("toggle-notifications");
    const startupToggle = document.getElementById("toggle-startup");

    // 3. Flip the switches to match the saved data!
    if (notifToggle) {
      notifToggle.checked = gamesFileJson.settings.autoNotifications;
    }
    
    if (startupToggle) {
      startupToggle.checked = gamesFileJson.settings.runOnStartup;
    }
    
  } else {
    // Fallback if settings don't exist yet
    document.getElementById("toggle-notifications").checked = true;
    document.getElementById("toggle-startup").checked = false;
  }
}

function showCommunityPage() {
  // 1. Turn OFF the other pages
  document.getElementById('library-view').style.display = 'none';
  document.getElementById('settings-view').style.display = 'none';
  
  // 2. Turn ON the Community page
  document.getElementById('community-view').style.display = 'flex';

  // 3. Update the menu button highlight
  document.querySelectorAll('.menu-items').forEach(el => el.classList.remove('active'));
  const navBtn = document.getElementById('nav-community'); // Make sure this matches your HTML ID
  if (navBtn) navBtn.classList.add('active');

  // Refresh the posts every time the user opens the community tab!
  if (typeof fetchCommunityPosts === "function") {
    fetchCommunityPosts();
  }
}

function renderComment(comment, currentUser) {
  // Logic: Is the current user the author? OR Is the current user an admin?
  const canDelete = (currentUser.username === comment.author) || (currentUser.role === 'admin');

  return `
    <div class="comment">
      <div class="comment-header">
        <strong>${comment.author}</strong> 
        ${comment.role === 'admin' ? '<span class="admin-badge">ADMIN</span>' : ''}
      </div>
      <p>${comment.text}</p>
      ${canDelete ? `<button class="delete-btn" onclick="deleteComment('${comment._id}')">Delete</button>` : ''}
    </div>
  `;
}

// --- COMMUNITY LOGIC ---

function showPostModal() { document.getElementById('postModal').classList.add('active'); }
function closePostModal() { document.getElementById('postModal').classList.remove('active'); }

async function fetchCommunityPosts() {
  const feed = document.getElementById('communityFeed');
  feed.innerHTML = '<div class="loader">Fetching discussions...</div>';

  try {
    const posts = await CommunityService.getAllPosts();
    feed.innerHTML = '';

    posts.forEach(post => {
      // Permission Logic
      const canDelete = (userInfo.username === post.author) || (userInfo.role === 'admin');

      const postHtml = `
        <div class="post-card">
          <div class="post-header">
            <span class="post-user">${post.author}</span>
            <span class="post-date">${new Date(post.date).toLocaleDateString()}</span>
          </div>
          <div class="post-title">${post.title}</div>
          <div class="post-body">${post.content}</div>
          <div class="post-footer">
            <button class="action-btn" onclick="openComments('${post._id}')">Comments (${post.comments ? post.comments.length : 0})</button>
            ${canDelete ? `<button class="delete-btn" onclick="handleDeletePost('${post._id}')">Delete</button>` : ''}
          </div>
        </div>
      `;
      feed.innerHTML += postHtml;
    });
  } catch (err) {
    feed.innerHTML = '<div class="error">Community is currently unreachable.</div>';
  }
}

// Helper for the delete button
async function handleDeletePost(postId) {
    if(confirm("Delete this thread?")) {
        await CommunityService.deletePost(postId);
        showNotification("Thread removed.", true);
        fetchCommunityPosts(); // Refresh
    }
}
// --- COMMUNITY UI ACTIONS ---

async function submitPost() {
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();

  if (!title || !content) {
    // Assuming you have your showNotification function available
    showNotification("Please enter a title and description", false);
    return;
  }

  const newPost = {
    author: userInfo.username,
    role: userInfo.role || "user",
    title: title,
    content: content,
    date: new Date(),
    comments: []
  };

  try {
    const submitBtn = document.querySelector("#postModal .btn-submit");
    if (submitBtn) {
      submitBtn.innerText = "PUBLISHING...";
      submitBtn.disabled = true;
    }

    // Call the Service file to save to MongoDB
    await CommunityService.createPost(newPost);
    
    showNotification("Post shared with the community!", true);
    closePostModal();
    
    // Check if fetchCommunityPosts exists before calling it
    if (typeof fetchCommunityPosts === "function") {
      fetchCommunityPosts(); 
    }
  } catch (err) {
    console.error("Submission Error:", err);
    showNotification("Database Error. Check console.", false);
  } finally {
    const submitBtn = document.querySelector("#postModal .btn-submit");
    if (submitBtn) {
      submitBtn.innerText = "PUBLISH POST";
      submitBtn.disabled = false;
    }
  }
}

// --- COMMENTS ENGINE ---
let activePostIdForComments = null;

async function openComments(postId) {
  activePostIdForComments = postId;
  const modal = document.getElementById('commentsModal');
  if (modal) modal.classList.add('active');
  
  await refreshCommentsDisplay();
}

function closeCommentsModal() {
  activePostIdForComments = null;
  const modal = document.getElementById('commentsModal');
  if (modal) modal.classList.remove('active');
  document.getElementById('newCommentText').value = '';
}

async function refreshCommentsDisplay() {
  const list = document.getElementById('commentsList');
  list.innerHTML = '<div class="loader">Loading replies...</div>';
  
  try {
    // Fetch all posts to grab the freshest comments for this specific post
    const posts = await CommunityService.getAllPosts();
    const currentPost = posts.find(p => p._id.toString() === activePostIdForComments);

    if (!currentPost) {
      list.innerHTML = '<div style="color: #ff4747;">Thread not found.</div>';
      return;
    }

    document.getElementById('commentThreadTitle').innerText = `Replies to: ${currentPost.author}`;

    if (!currentPost.comments || currentPost.comments.length === 0) {
      list.innerHTML = '<div style="color: var(--steam-text-muted); text-align: center; padding: 20px;">No comments yet. Be the first to reply!</div>';
      return;
    }

    // Build the HTML for each comment
    list.innerHTML = '';
    currentPost.comments.forEach(c => {
      list.innerHTML += `
        <div style="background: rgba(0,0,0,0.25); padding: 12px; border-radius: 6px; border-left: 3px solid #3d4450;">
          <div style="font-size: 0.75rem; color: var(--steam-text-muted); margin-bottom: 6px;">
            <strong style="color: #fff;">${c.author}</strong>
            ${c.role === 'admin' ? '<span class="admin-tag">DEVELOPER</span>' : ''}
            <span style="margin-left: 8px;">${new Date(c.date).toLocaleString()}</span>
          </div>
          <div style="color: var(--steam-text); font-size: 0.9rem;">${c.text}</div>
        </div>
      `;
    });
  } catch (err) {
    console.error(err);
    list.innerHTML = '<div style="color: #ff4747;">Error loading replies.</div>';
  }
}

async function submitComment() {
  if (!activePostIdForComments) return;
  
  const input = document.getElementById('newCommentText');
  const text = input.value.trim();

  if (!text) return; // Don't post empty comments

  const newComment = {
    author: userInfo.username,
    role: userInfo.role || 'user',
    text: text,
    date: new Date()
  };

  try {
    // Save to MongoDB
    await CommunityService.addComment(activePostIdForComments, newComment);
    
    input.value = ''; // Clear the input box
    await refreshCommentsDisplay(); // Update the modal with the new comment
    fetchCommunityPosts(); // Update the main feed so the (1) counter goes up!
    
  } catch (err) {
    console.error(err);
    showNotification("Failed to post reply", false);
  }
}

// ==========================================
// LANGUAGE TRANSLATION ENGINE
// ==========================================

let currentLanguage = localStorage.getItem('cloudGame_lang') || 'en';
// The Dictionary (Notice the two new settings words added!)
// The Full Dictionary for English and Arabic
const translations = {
  en: {
    library: "LIBRARY",
    settings: "SETTINGS",
    community: "COMMUNITY",
    syncLibrary: "Sync Library",
    addGame: "Add a Game",
    autoScan: "Auto-Scan PC",
    systemStatus: "SYSTEM STATUS",
    developer: "DEVELOPER",
    allGames: "ALL GAMES",
    appSettings: "APPLICATION SETTINGS",
    system: "System",
    runOnStartup: "Run on System Startup",
    runOnStartupDesc: "Launch CloudGame silently in the background when you turn on your PC.",
    notifications: "Notifications",
    autoSyncNotif: "Auto-Sync Notifications",
    autoSyncNotifDesc: "Show a popup in the corner of your screen when a game save is uploaded.",
    languageSettings: "Language Settings",
    selectLanguage: "Select Language:",
    addNonStoreGame: "Add a Non-Store Game",
    gameDesignation: "Game Designation",
    gameNamePlaceholder: "e.g. Elden Ring",
    targetPath: "Target Path",
    cancel: "CANCEL",
    addSelectedProgram: "ADD SELECTED PROGRAM",
    shareGameSave: "Share Game Save",
    shareDesc: "Copy this link to share your cloud save with a friend.",
    copy: "Copy",
    close: "CLOSE",
    scanSaves: "Scan for Game Saves",
    scanningDesc: "Scanning common save locations (Documents, AppData, Saved Games)...",
    scanningDrives: "Scanning drives...",
    online: "● ONLINE",
    newPost: "NEW POST",
    loadingCommunity: "Loading community discussions...",
    reportBug: "Report a Bug / Suggestion",
    title: "Title",
    titlePlaceholder: "e.g. Sync error on God of War",
    description: "Description",
    publish: "PUBLISH POST",
    threadReplies: "Thread Replies",
    writeReply: "Write a reply...",
    postReply: "Post Reply"
  },
  ar: {
    library: "المكتبة",
    settings: "الإعدادات",
    community: "المجتمع",
    syncLibrary: "مزامنة المكتبة",
    addGame: "إضافة لعبة",
    autoScan: "فحص تلقائي",
    systemStatus: "حالة النظام",
    developer: "المطور",
    allGames: "جميع الألعاب",
    appSettings: "إعدادات التطبيق",
    system: "النظام",
    runOnStartup: "التشغيل عند بدء النظام",
    runOnStartupDesc: "قم بتشغيل التطبيق في الخلفية عند تشغيل الكمبيوتر.",
    notifications: "الإشعارات",
    autoSyncNotif: "إشعارات المزامنة",
    autoSyncNotifDesc: "إظهار إشعار عند رفع ملف حفظ اللعبة.",
    languageSettings: "إعدادات اللغة",
    selectLanguage: "اختر اللغة:",
    addNonStoreGame: "إضافة لعبة خارجية",
    gameDesignation: "اسم اللعبة",
    gameNamePlaceholder: "مثال: Elden Ring",
    targetPath: "مسار اللعبة",
    cancel: "إلغاء",
    addSelectedProgram: "إضافة البرنامج المحدد",
    shareGameSave: "مشاركة ملف الحفظ",
    shareDesc: "انسخ هذا الرابط لمشاركة ملف الحفظ مع صديق.",
    copy: "نسخ",
    close: "إغلاق",
    scanSaves: "البحث عن ملفات الحفظ",
    scanningDesc: "جاري فحص المسارات المشتركة...",
    scanningDrives: "جاري فحص الأقراص...",
    online: "● متصل",
    newPost: "منشور جديد",
    loadingCommunity: "جاري تحميل المناقشات...",
    reportBug: "الإبلاغ عن خطأ / اقتراح",
    title: "العنوان",
    titlePlaceholder: "مثال: خطأ في مزامنة اللعبة",
    description: "الوصف",
    publish: "نشر المنشور",
    threadReplies: "الردود",
    writeReply: "اكتب رداً...",
    postReply: "إرسال الرد"
  }
};

function changeLanguage(targetLang) {
  currentLanguage = targetLang;

  // 2. Save the user's choice permanently to their computer!
  localStorage.setItem('cloudGame_lang', currentLanguage);

  // Update Sidebar text
  const langText = document.getElementById('current-lang-text');
  if (langText) langText.innerText = currentLanguage === 'en' ? 'عربي' : 'English';

  // Update Settings Dropdown
  const langSelect = document.getElementById('languageSelect');
  if (langSelect) langSelect.value = currentLanguage;

  // Flip Layout
  document.body.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';

  // Translate Text
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const translationKey = element.getAttribute('data-i18n');
    if (translations[currentLanguage] && translations[currentLanguage][translationKey]) {
      const newText = translations[currentLanguage][translationKey];
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.placeholder = newText;
      } else {
        element.innerText = newText;
      }
    }
  });
}

function toggleLanguage() {
  const nextLang = currentLanguage === 'en' ? 'ar' : 'en';
  changeLanguage(nextLang);
}

// 3. Add this at the bottom! It forces the app to apply the saved language the second it opens.
document.addEventListener('DOMContentLoaded', () => {
  changeLanguage(currentLanguage);
});