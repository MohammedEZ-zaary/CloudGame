const { Storage , File : MEGAFile } = require("megajs");
const fs = require("fs");
const fsP = require("fs").promises;
const archiver = require('archiver');
const PATH = require("path")
const os = require("os")  
const AdmZip =  require("adm-zip");

// Global Varibles 

const USERNAME = os.userInfo().username ;
const localUserProfileName = PATH.join("C:" , "Users" , USERNAME );
// Node doesn't support top-level await when using CJS
// const email =  process.env.EMAIL;
// const password =  process.env.PASSWORD;

async function initializeStorage(email, password,  status) {
    const storage = new Storage({ 
      email: email, 
      password : password, 
      userAgent: "cloudGame/1.0" 
    });

    await storage.ready; // Wait for storage to be ready
    status("Authentication successful: " + storage.name);
    await createStorageBase(storage , status)
    return storage;
}

function getFileSize(path) {
  return fs.statSync(path).size; // Directly return size
}

// NEW: Gets the true last modified time of a game folder
function getLatestModifiedTime(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  
  let latestTime = fs.statSync(dirPath).mtimeMs;
  
  // Do a quick shallow scan of the files inside to find the newest save
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = PATH.join(dirPath, file);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && stat.mtimeMs > latestTime) {
        latestTime = stat.mtimeMs;
      }
    } catch (e) { /* Ignore locked files */ }
  }
  return latestTime;
}

async function createStorageBase(storage , status){
    const cloudGameFolder = await storage.root.find("CloudGameSaver");
    if(cloudGameFolder != null){
      return
    }

    if(cloudGameFolder == null){
      status("Initializing remote storage directory...");
      await storage.root.mkdir("CloudGameSaver")
    }

    const cloudRepo = await  storage.root.find("CloudGameSaver")
    const cloudRepoData = await cloudRepo.find("localgameRepo.json")
    if(fs.existsSync(`${localUserProfileName}/localgameRepo.json`) == false && cloudRepoData == null){
      fs.writeFileSync(`${localUserProfileName}/localgameRepo.json` , JSON.stringify({
         "gamesCloud": [],
        "lastTimeSync": "",
        "time": ""
      }))

      status("Creating local database configuration...");
    }
}

async function uploadFile(storage, filePath, fileName , message = "") {
  try {
    const file = await storage.root.find("CloudGameSaver").upload(
      {
        name: fileName,
        size: getFileSize(filePath),
      },
      fs.createReadStream(filePath)
    ).complete;
    if (message){
    }else{
    }
    return file;
  } catch (error) {
    console.error("Upload failed:", error);
    throw error; // Re-throw to handle in caller
  }
}

// async function zipFolder(sourceFolder, outputPath) { ... }
async function zipFolder(sourceFolder, outputPath) {
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => resolve(outputPath));
    archive.on('error', (err) => reject(err));
    
    archive.pipe(output);
    
    // THE BOTTLENECK FIX: Ignores common heavy/useless folders
    archive.glob('**/*', {
      cwd: sourceFolder,
      ignore: ['**/Screenshots/**', '**/logs/**', '**/cache/**', '**/CrashReports/**'] 
    });
    
    archive.finalize();
  });
}

async function unzipFolder(zipPath, outputFolder) {
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(outputFolder, true); // Second param: overwrite existing files
    return outputFolder;
  } catch (err) {
    console.error('Error while unzipping:', err);
    throw err;
  }
}

function date(){
  const date = new Date();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
};

async function downloadCloudGameSaver(storage, fileName, disPath, downloadedFileName = "") {
  return new Promise(async (resolve, reject) => {
    try {
      const cloudGameFolder = storage.root.find("CloudGameSaver");
      const targetNode = await cloudGameFolder.children.filter((item) => item.name === fileName);

      const fileUrl = await targetNode[0].link();
      const fileFromUrl = MEGAFile.fromURL(fileUrl);

      const downloadId = fileFromUrl.downloadId;
      const key = fileFromUrl.key;
      const fileFromObject = new MEGAFile({ downloadId, key });

      const outputPath = downloadedFileName
        ? PATH.join(disPath, downloadedFileName)
        : PATH.join(disPath, targetNode[0].name);

      const writeStream = fs.createWriteStream(outputPath);

      // Handle stream events to know when download is done
      fileFromObject.download()
        .pipe(writeStream)
        .on("finish", () => {
          resolve(true);
        })
        .on("error", (err) => {
          console.error(`Sync failed: ${err}`);
          reject(err);
        });
    } catch (err) {
      console.error(`Error in downloadCloudGameSaver: ${err}`);
      reject(err);
    }
  });
}

async function syncGames(storage ,  status){
  // check if localgameRepo.json exsite
  if (fs.existsSync(PATH.join("C:" , "Users"  , USERNAME , "localgameRepo.json")) != true){
     status("Local database missing. Fetching from cloud...")
    if(await downloadCloudGameSaver(storage , "cloudgameRepo.json" , PATH.join("C:" , "Users" , USERNAME) , "localgameRepo.json")){
     status("Local database synchronized.")
    }else {
       status("Error: Failed to fetch remote database.")
    }
  }
};

async function  readJsonFile(path) {
  const jsonFile =  await fsP.readFile(path, "utf-8"); 
  const jsonData =  JSON.parse(jsonFile);
  return jsonData; 
}

function deleteFile(storage, fileName) {
  return new Promise(async (resolve, reject) => {
    try {
      const cloudGameFolder = storage.root.find("CloudGameSaver");
      const targetNode = await cloudGameFolder.children.filter((item) => item.name === fileName);
      const res = await targetNode;
      res.forEach((f) => f.delete(true));
      resolve(true);
    } catch (error) {
      reject(false);
    }
  });
}

// async function checkAndUploadGamesToCloud(storage ,  status) { ... }
async function checkAndUploadGamesToCloud(storage, status) {
  status("Scanning local saves and verifying Cloud data...");
  const localRepoPath = PATH.join(localUserProfileName, "localgameRepo.json");
  const jsonData = await readJsonFile(localRepoPath);
  
  // NEW: Get a list of files actually sitting on Mega right now
  const cloudGameFolder = await storage.root.find("CloudGameSaver");
  const cloudFiles = cloudGameFolder.children ? cloudGameFolder.children.map(f => f.name) : [];
  
  const results = await Promise.all(
    jsonData.gamesCloud.map(async (game) => {
      if (game.shouldSync == false) return game;

      const fullLocalPath = PATH.join(localUserProfileName, game.distLocal);
      
      if (fs.existsSync(fullLocalPath)) {
        const localMTime = getLatestModifiedTime(fullLocalPath);
        const zipName = game.gameCloudName + ".zip";
        
        // NEW: Does this file ACTUALLY exist on Mega right now?
        const isMissingOnCloud = !cloudFiles.includes(zipName);
        
        // NEW: Fixes the bug if your old JSON still uses the string "22-3-2026"
        const isOldDateFormat = typeof game.lastTimeEdit === 'string';
        
        // Force an upload IF: 
        if (game.isFileUploaded == false || isMissingOnCloud || isOldDateFormat || localMTime > (game.lastTimeEdit || 0)) {
          try {
            status(`Compressing and uploading: ${game.gameName}...`);
            const zipPath = "./" + zipName;
            
            await zipFolder(fullLocalPath, zipPath);
            await deleteFile(storage, zipName); // Fails safely if it doesn't exist
            await uploadFile(storage, zipPath, zipName);
            
            // Set to exact millisecond
            game.isFileUploaded = true;
            game.lastTimeEdit = localMTime; 
            
            fs.promises.rm(zipPath).catch(() => {}); // Cleanup
            status(`${game.gameName} backed up successfully.`);
          } catch (error) {
            console.error(`Failed to upload ${game.gameName}`, error);
            game.isFileUploaded = false;
          }
        }
      } else {
        status(`Skipped ${game.gameName}: Local path unavailable.`);
      }
      return game;
    })
  );

  jsonData.gamesCloud = results;
  jsonData.lastTimeSync = Date.now(); 
  fs.writeFileSync(localRepoPath, JSON.stringify(jsonData, null, 2));

  // Update Master List
  status("Updating Cloud Master List...");
  const tempName = "cloudgameRepo_temp.json";
  
  try {
    await uploadFile(storage, localRepoPath, tempName);
    await deleteFile(storage, "cloudgameRepo.json"); 
    
    // Rename temp to master
    const updatedCloudFolder = await storage.root.find("CloudGameSaver");
    const tempNode = updatedCloudFolder.children.find(item => item.name === tempName);
    if (tempNode) await tempNode.rename("cloudgameRepo.json");
    
    status("Synchronization Complete.");
  } catch (error) {
    status("Sync finished with warnings: Master list update failed.");
  }
}

// async function checkIfGameFileExisteInComputer(storage , status){ ... }
async function checkIfGameFileExisteInComputer(storage, status) {
  const localRepoPath = PATH.join(localUserProfileName, "localgameRepo.json");
  const jsonData = await readJsonFile(localRepoPath);
  let jsonNeedsUpdate = false;

  // NEW: Check MEGA directly to see what files ACTUALLY exist right now
  const cloudGameFolder = await storage.root.find("CloudGameSaver");
  const cloudFiles = cloudGameFolder && cloudGameFolder.children ? cloudGameFolder.children.map(f => f.name) : [];

  await Promise.all(
    jsonData.gamesCloud.map(async (game) => {
      // Skip if the user turned off sync for this game
      if (game.shouldSync == false) return; 

      const fullLocalPath = PATH.join(localUserProfileName, game.distLocal);
      const zipName = game.gameCloudName + ".zip";
      
      // NEW: Does this game's zip file exist on MEGA right now?
      const existsOnCloud = cloudFiles.includes(zipName);
      let needsDownload = false;

      // SCENARIO A: Folder is missing locally, but safe on MEGA -> DOWNLOAD IT
      if (!fs.existsSync(fullLocalPath) && existsOnCloud) {
        needsDownload = true;
      } 
      // SCENARIO B: Folder exists locally, but MEGA has a newer version -> DOWNLOAD IT
      else if (fs.existsSync(fullLocalPath) && existsOnCloud) {
        const localMTime = getLatestModifiedTime(fullLocalPath);
        if ((game.lastTimeEdit || 0) > localMTime) {
          needsDownload = true; 
        }
      }

      if (needsDownload) {
        status(`Restoring save data for: ${game.gameName}...`);
        try {
          await downloadCloudGameSaver(storage, zipName, "./");
          status(`Extracting archive: ${game.gameName}...`);
          
          await unzipFolder("./" + zipName, fullLocalPath);
          fs.promises.rm("./" + zipName).catch(() => {});
          
          // FIX THE LIMBO: Force the JSON to remember it is safely uploaded
          game.isFileUploaded = true;
          jsonNeedsUpdate = true;
          
          status(`${game.gameName} restored to local machine.`);
        } catch (error) {
          console.error(`Failed to restore ${game.gameName}`, error);
          status(`Error: Failed to download ${game.gameName}.`);
        }
      }
    })
  );

  // If we fixed any limbo states, save the JSON so the UI updates!
  if (jsonNeedsUpdate) {
    fs.writeFileSync(localRepoPath, JSON.stringify(jsonData, null, 2));
  }
}

// NEW: Generates a shareable download link for a specific file
async function getShareLink(storage, fileName) {
  return new Promise(async (resolve, reject) => {
    try {
      const cloudGameFolder = await storage.root.find("CloudGameSaver");
      
      if (!cloudGameFolder) {
        return reject("CloudGameSaver folder not found.");
      }

      const targetNode = cloudGameFolder.children.find((item) => item.name === fileName);

      if (!targetNode) {
        return reject("File not found on cloud.");
      }

      // Ask MEGA to generate the URL
      const link = await targetNode.link();
      resolve(link);
      
    } catch (error) {
      console.error(`Error generating link: ${error}`);
      reject(error);
    }
  });
}

module.exports = {
  USERNAME: USERNAME,
  syncGames : syncGames,
  initializeStorage : initializeStorage ,
  checkAndUploadGamesToCloud : checkAndUploadGamesToCloud,
  checkIfGameFileExisteInComputer : checkIfGameFileExisteInComputer,
  createStorageBase : createStorageBase,
  getShareLink: getShareLink // <-- ADD THIS LINE
};