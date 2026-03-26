// ==========================================
// FIREBASE FIRESTORE SERVICE (Unblockable!)
// ==========================================
const { initializeApp } = require('firebase/app');
require('dotenv').config();
const { 
  getFirestore, collection, getDocs, addDoc, 
  deleteDoc, doc, updateDoc, arrayUnion, query, orderBy 
} = require('firebase/firestore');

// Your exact Firebase configuration
// Read from your .env file
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase and Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const issuesCollection = collection(db, "issues");

const CommunityService = {
  // Get all posts
  async getAllPosts() {
    try {
      // Fetch posts ordered by newest first
      const q = query(issuesCollection, orderBy("date", "desc"));
      const snapshot = await getDocs(q);
      
      const posts = [];
      snapshot.forEach(docSnap => {
        // We map Firestore's 'id' to '_id' so your UI code doesn't break!
        posts.push({ _id: docSnap.id, ...docSnap.data() });
      });
      return posts;
    } catch (err) {
      console.error("Firebase Fetch Error:", err);
      return [];
    }
  },

  // Create a new post
  async createPost(postData) {
    try {
      // Convert standard JS Date to an ISO string so Firebase handles it perfectly
      postData.date = new Date().toISOString(); 
      return await addDoc(issuesCollection, postData);
    } catch (err) {
      console.error("Firebase Create Error:", err);
      throw err;
    }
  },

  // Delete a post
  async deletePost(postId) {
    try {
      const docRef = doc(db, "issues", postId);
      return await deleteDoc(docRef);
    } catch (err) {
      console.error("Firebase Delete Error:", err);
      throw err;
    }
  },

  // Add a comment to a post
  async addComment(postId, commentData) {
    try {
      const docRef = doc(db, "issues", postId);
      commentData.date = new Date().toISOString();
      
      // arrayUnion magically pushes the new comment into the existing array
      return await updateDoc(docRef, {
        comments: arrayUnion(commentData)
      });
    } catch (err) {
      console.error("Firebase Comment Error:", err);
      throw err;
    }
  }
};

module.exports = CommunityService;