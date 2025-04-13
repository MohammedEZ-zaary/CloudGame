const { contextBridge, ipcRenderer } = require("electron");
// const megaApi = require("./js/megaApi");

window.app = "hello" 

contextBridge.exposeInMainWorld("electronAPI", {
  ipcRenderer : ipcRenderer,
  readJsonFile : async (path) =>  await ipcRenderer.invoke("read-json-file" , path),
  megaApiUsername : async () => await  ipcRenderer.invoke("mega-api-username"), 
  megaApiInit :  async (email , password) =>  await ipcRenderer.invoke("mega-api-init" , email , password), 
  megaApiSyncGames :  async (storage) =>  await ipcRenderer.invoke("mega-api-syncGames" ,storage), 
  megaApiCheckUploadToCloud :  async (storage) =>  await ipcRenderer.invoke("mega-api-checkUploadToCloud" , storage), 
  megaApiCheckIFGameFileExsiste :  async (storage) =>  await ipcRenderer.invoke("mega-api-checkUploadToCloud" , storage), 
});

//console.log("Preload script loaded successfully");
