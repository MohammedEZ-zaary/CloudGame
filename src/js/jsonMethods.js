const fs = require("fs").promises;

async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    throw error; // Important for error propagation
  }
}
async function writeJsonFile(filePath, data) {
  try {
    const jsonString = JSON.stringify(data, null, 2); // pretty print with 2-space indentation
    await fs.writeFile(filePath, jsonString, "utf-8");
  } catch (error) {
    console.error(`Error writing JSON to ${filePath}:`, error);
    throw error;
  }
}

module.exports = {
  readJsonFile,
  writeJsonFile,
};
