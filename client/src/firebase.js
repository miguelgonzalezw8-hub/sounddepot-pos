// client/src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getStorage } from "firebase/storage";

// 🔥 Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBpffbHcYcc4xQlooLCjvyW5h34c-x2y4g",
  authDomain: "sounddepot-pos.firebaseapp.com",
  projectId: "sounddepot-pos",
  storageBucket: "sounddepot-pos.firebasestorage.app",
  messagingSenderId: "869259922188",
  appId: "1:869259922188:web:967c7922f752f318fc9729",
  measurementId: "G-KQPBHN16HZ",
};

// Init app
const app = initializeApp(firebaseConfig);

// ✅ Single instances
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Auth helpers
export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
};







