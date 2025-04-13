const {initializeStorage , checkAndUploadGamesToCloud , createStorageBase, syncGames , checkIfGameFileExisteInComputer} = require("../js/megaApi");
const  {ipcRenderer, app} = require("electron");
const  path =  require("path")
const {readJsonFile ,writeJsonFile } =  require("../js/jsonMethods");
const { existsSync, writeFileSync } = require("fs");



let storage;
let userDataPath
// Window controls
document
  .getElementById("minimize-btn")
  .addEventListener("click", () =>  ipcRenderer.send("minimize"));
document
  .getElementById("maximize-btn")
  .addEventListener("click", () =>  ipcRenderer.send("maximize"));
document
  .getElementById("close-btn")
  .addEventListener("click", () => ipcRenderer.send("close"));

// check if rememberMe True 
async function start(){
  // read login.json file
  userDataPath = await ipcRenderer.invoke('get-user-data-path');
  if(existsSync(`${userDataPath}/login.json`) == false){
    writeFileSync(`${userDataPath}/login.json`, JSON.stringify({
      "username": "",
      "email": "",
      "password": "",
      "rememberMe": false
    }))
  }

  const jsonData =  await readJsonFile(`${userDataPath}/login.json`);
  const rememberMeStatus =  await rememberMeState();
  if(rememberMeStatus ==  true){
      document.getElementById("form-section").innerHTML = `
      <div class="loading-box">
        <div class="spinner"></div>
        <div class="message" id="message">Please wait...</div>
    </div>   `;
    storage = await initializeStorage(jsonData.email , jsonData.password,(status) => {
      document.getElementById("message").textContent = status;
    })
    await syncGames(storage ,(status) =>  {
      document.getElementById("message").textContent = status;
    });
    await checkAndUploadGamesToCloud(storage, (status) => {
      document.getElementById("message").textContent = status;
    });
    await checkIfGameFileExisteInComputer(storage , (status) => {
      document.getElementById("message").textContent = status;
    } );


    document.getElementById("message").textContent = `✅ Finish Synchronization`;
    //console.log(`✅ Finish Synchronization`);
    await storage.close();

    ipcRenderer.send("login-success");

  }
}
start()
// Form handling


document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const remember = document.getElementById("remember").checked;

  // Production
  const loginJsonFile = `${userDataPath}/login.json`;
  // const loginJsonFile =  path.join(__dirname , userDataPath , "login.json")
  const jsonData =  await readJsonFile(loginJsonFile);
  if (!email || !password) {
    alert("Please enter both email and password");
    return;
  }
  
document.getElementById("form-section").innerHTML = `
      <div class="loading-box">
        <div class="spinner"></div>
        <div class="message" id="message">Please wait...</div>
      </div>   `;
  
  try {

    storage = await initializeStorage(email , password,(status) => {
      document.getElementById("message").textContent = status;
    })

    if(storage){

      jsonData.username = storage.name ;
      await writeJsonFile(loginJsonFile, jsonData)
      if(remember) {
        jsonData.email = email ;
        jsonData.password = password ;
        jsonData.username = storage.name ;
        jsonData.rememberMe = true ;
        await writeJsonFile(loginJsonFile, jsonData)
      } 
      
    await syncGames(storage ,(status) =>  {
      document.getElementById("message").textContent = status;
    });
    await checkAndUploadGamesToCloud(storage, (status) => {
      document.getElementById("message").textContent = status;
    });
    await checkIfGameFileExisteInComputer(storage , (status) => {
      document.getElementById("message").textContent = status;
    } );
    document.getElementById("message").textContent = `✅ Finish Synchronization`;
    //console.log(`✅ Finish Synchronization`);
    await storage.close();
    ipcRenderer.send("login-success");
  }
  } catch (error) {
    document.getElementById("message").textContent = "\u274C Check your email and password and try again";
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
                  </form>
           `;

    } , 3000)
    console.error("Error details:", error);
  }
});

// Video background handling
document.addEventListener("DOMContentLoaded", () => {
  const video = document.querySelector(".background-video");
  video.play().catch((e) => {
    video.muted = true;
    video.play();
  });
});

// In your index.html's script section
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const remember = document.getElementById("remember").checked;

  if (!email || !password) {
    alert("Please enter both email and password");
    return;
  }
});

async function rememberMeState () {
  const jsonData =  await readJsonFile(`${userDataPath}/login.json`);
  return jsonData.rememberMe
}