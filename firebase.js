let auth = null, db = null;
let signInAnonymously = async()=>{throw new Error('Firebase indisponível')};
let signInWithEmailAndPassword = async()=>{throw new Error('Firebase indisponível')};
let createUserWithEmailAndPassword = async()=>{throw new Error('Firebase indisponível')};
let onAuthStateChanged = ()=>()=>{};
let ref=()=>null, set=async()=>{}, update=async()=>{}, onValue=()=>()=>{}, onDisconnect=()=>({remove:async()=>{}}), push=()=>null, serverTimestamp=()=>Date.now(), remove=async()=>{};

try {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
  const authMod = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
  const dbMod = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js');
  const firebaseConfig = {
    apiKey: 'AIzaSyA5zkT2WAtOrF9F6-IkT1OD309Dl8En3jo',
    authDomain: 'vila-rp.firebaseapp.com',
    projectId: 'vila-rp',
    storageBucket: 'vila-rp.firebasestorage.app',
    messagingSenderId: '941354647201',
    appId: '1:941354647201:web:6bbdc5e4b043b6f38e3ae0',
    measurementId: 'G-HRGW7H88HK',
    databaseURL: 'https://vila-rp-default-rtdb.firebaseio.com'
  };
  const app=initializeApp(firebaseConfig);
  auth=authMod.getAuth(app);
  db=dbMod.getDatabase(app);
  ({signInAnonymously,signInWithEmailAndPassword,createUserWithEmailAndPassword,onAuthStateChanged}=authMod);
  ({ref,set,update,onValue,onDisconnect,push,serverTimestamp,remove}=dbMod);
  window.VILA_FIREBASE_OK=true;
} catch (error) {
  console.warn('[Vila RP] Firebase não carregou; modo local ativado.', error);
  window.VILA_FIREBASE_OK=false;
}

export {auth,db,signInAnonymously,signInWithEmailAndPassword,createUserWithEmailAndPassword,onAuthStateChanged,ref,set,update,onValue,onDisconnect,push,serverTimestamp,remove};
