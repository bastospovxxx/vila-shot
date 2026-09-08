import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getDatabase, ref, set, update, onValue, onDisconnect, push, serverTimestamp, remove } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA5zkT2WAtOrF9F6-IkT1OD309Dl8En3jo",
  authDomain: "vila-rp.firebaseapp.com",
  projectId: "vila-rp",
  storageBucket: "vila-rp.firebasestorage.app",
  messagingSenderId: "941354647201",
  appId: "1:941354647201:web:6bbdc5e4b043b6f38e3ae0",
  measurementId: "G-HRGW7H88HK",
  databaseURL: "https://vila-rp-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export {auth,db,signInAnonymously,signInWithEmailAndPassword,createUserWithEmailAndPassword,onAuthStateChanged,ref,set,update,onValue,onDisconnect,push,serverTimestamp,remove};