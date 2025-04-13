const {USERNAME} = require("../js/megaApi");
const {readJsonFile , writeJsonFile} = require("../js/jsonMethods")
const {ipcRenderer} = require("electron");
const { existsSync } = require("node:original-fs");
const {initializeStorage , checkIfGameFileExisteInComputer , checkAndUploadGamesToCloud} = require("../js/megaApi");
const path =  require("path")
// get-values from DOM
const gameLibrary = document.getElementById("gameLibrary");
const addGameModal = document.getElementById("addGameModal");
const notification = document.getElementById("notification");
const lastSyncDiv = document.getElementById("last-sync");

// Mock data for demonstration
let gamesData = [];
let gamesFileJson ;
let userDataPath 
let userInfo;
// Start loading games
async function loadLocalGames() {

  userDataPath = await ipcRenderer.invoke('get-user-data-path');
  userInfo =  await readJsonFile(`${userDataPath}/login.json`);

  document.getElementById("username").textContent = userInfo.username;

  jsonData = await  readJsonFile(`C:/Users/${USERNAME}/localgameRepo.json`);
  //console.log(jsonData);
  gamesFileJson = jsonData;
  gamesData = jsonData.gamesCloud;
  displayGames(gamesData);
  lastSyncDiv.textContent = `last Time Sync: ${jsonData.lastTimeSync}`;
}

loadLocalGames();

// Generate a placeholder image URL based on game name
async function fetchGameInfo(gameName) {
  const data = await fetch(
    `https://api.rawg.io/api/games?key=dc22cd44369a416ea5289c81d83cea73&page_size=2&search=${gameName}&platform=PC&search_exact=true`,
  );
  const d = await data.json();
  return {
    background_image : d.results[0].background_image,
    rating: d.results[0].rating,
    genres: d.results[0].genres,
  };
}

// Display games in the library
function displayGames(games) {
  gameLibrary.innerHTML = "";
  games.forEach((game) => {
    const gameItem = document.createElement("div");
    gameItem.classList.add("game-item");

    const genres = game.genres
      ? game.genres.map((g) => g.name)
      : ["Action", "Adventure"];

    gameItem.innerHTML = `
      <img src="${game.background_image}" alt="${game.gameName}">
      <div class="game-info">
        <div class="game-title">${game.gameName}</div>
        <div class="game-genres">
          ${genres.map((genre) => `<span class="game-genre">${genre}</span>`).join("")}
        </div>
        <div class="game-rating">
          ⭐ ${game.rating ? game.rating.toFixed(1) : "4.0"} / 5
        </div>
      </div>
    `;
    gameLibrary.appendChild(gameItem);
  });
}

// Sync games function
async function syncGames() {
  const button = document.querySelector(".sync-section button");
  button.innerHTML = '<span class="sync-icon">⏳</span> SYNCING...';
  
  storage = await initializeStorage(userInfo.email , userInfo.password, (status) => {
    button.innerHTML = `Start Sync`;
  })
  await checkAndUploadGamesToCloud(storage , (status) => {
    button.innerHTML = `<span class="sync-icon"></span> ${status}`;
  })
  await checkIfGameFileExisteInComputer(storage , (status) => {
    button.innerHTML = `<span class="sync-icon"></span> ${status}`;
  })

  displayGames(gamesData);

  button.innerHTML = '<span class="sync-icon">✅</span> Sync successfuliy';
  // await storage.close()
  button.innerHTML = '<span class="sync-icon">🔄</span> SYNC LIBRARY';
}

// Show add game modal
async function showAddGameModal(gameName) {
  //console.log(gameName);
  addGameModal.classList.add("active");

  const imgUrl = await fetchGameInfo(gameName);
  const preview = document.querySelector(".game-preview");
  preview.innerHTML = `<div class="default-image"><img src=${imgUrl.background_image} alt=h /></div>`;

  //   preview.innerHTML = `<div class="default-image">Game Image Preview</div>`;
}

// Hide add game modal
function hideAddGameModal() {
  addGameModal.classList.remove("active");
}

// Show notification
function showNotification(message, isSuccess) {
  const notification = document.getElementById("notification");
  const icon = notification.querySelector(".notification-icon");
  const messageEl = notification.querySelector(".notification-message");

  messageEl.textContent = message;
  notification.className = "notification";

  if (isSuccess) {
    notification.classList.add("success");
    icon.textContent = "✅";
  } else {
    notification.classList.add("error");
    icon.textContent = "❌";
  }

  notification.classList.add("show");

  setTimeout(() => {
    notification.classList.remove("show");
  }, 3000);
}

// Add new game
async function addGame() {
  const name = document.getElementById("gameName").value.trim();
  const path = document.getElementById("gamePath").value.trim();
  var gameInfo ; 

  if (!name || !path) {
    showNotification("Please fill in all required fields", false);
    return;
  }
  gameInfo =  await fetchGameInfo(name)
if (existsSync(path) == false) {
    showNotification(`the path ${path} not found , Please check the path`, false);
    return;
  }
  const newGame = {
    gameName: name,
    gameCloudName:name ,
    background_image: gameInfo.background_image,
    genres: gameInfo.genres,
    rating: gameInfo.rating,
    distLocal : getPathAfterUsername(path , USERNAME),
    isFileUploaded:false,
    shouldSync : true,
    lastTimeEdit:""
  };
  // check if game already exists
  const exists = gamesFileJson.gamesCloud.some(item => item.gameName === newGame.gameName);

  //console.log(gamesFileJson)
  if(exists){
    showNotification(`This game ${newGame.gameName} already exists`)
    return
  }
  gamesFileJson.gamesCloud = [...gamesFileJson.gamesCloud , newGame ];
  gamesData= [...gamesFileJson.gamesCloud , newGame ];
  writeJsonFile(`C:/Users/${USERNAME}/localgameRepo.json` , gamesFileJson );
  //console.log("this is newgame  ", newGame);
  loadLocalGames()
  // displayGames(gamesData);
  showNotification("Game added successfully!", true);
  setTimeout(hideAddGameModal, 1500);
}

// Update image preview when name changes
document.getElementById("gameName").addEventListener("input", function () {
  const name = this.value.trim();
  const preview = document.querySelector(".game-preview");

  if (name) {
    preview.innerHTML = `<img src="${gameInfo.background_image}" alt="Game Preview">`;
  } else {
    preview.innerHTML = '<div class="default-image">Game Image Preview</div>';
  }
});

// Close modal when clicking outside
document.addEventListener("click", (e) => {
  if (e.target === addGameModal) {
    hideAddGameModal();
  }
});

// Load games on page load
document.addEventListener("DOMContentLoaded", () => {
  displayGames(gamesData);
});

// Window controls
document
  .getElementById("minimize-btn")
  .addEventListener("click", () =>
     ipcRenderer.send("minimize"),
  );
document
  .getElementById("maximize-btn")
  .addEventListener("click", () =>
     ipcRenderer.send("maximize"),
  );
document
  .getElementById("close-btn")
  .addEventListener("click", () =>
     ipcRenderer.send("close"),
  );

function getPathAfterUsername(fullPath, username) {
    return fullPath.split(username)[1] || '';
}