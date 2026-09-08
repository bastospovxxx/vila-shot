import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getDatabase, ref, set, update, onValue, onDisconnect, push, query, orderByChild, limitToLast, serverTimestamp as rtdbTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA5zkT2WAtOrF9F6-IkT1OD309Dl8En3jo",
  authDomain: "vila-rp.firebaseapp.com",
  projectId: "vila-rp",
  storageBucket: "vila-rp.firebasestorage.app",
  messagingSenderId: "941354647201",
  appId: "1:941354647201:web:6bbdc5e4b043b6f38e3ae0",
  measurementId: "G-HRGW7H88HK"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

const normalize = s => s.trim().toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,20);
export function usernameEmail(username){ return `${normalize(username)}@login.vilarp.local`; }

export async function register(username,password){
  username=normalize(username);
  if(username.length<3) throw new Error("O username precisa ter pelo menos 3 caracteres.");
  const email=usernameEmail(username);
  const cred=await createUserWithEmailAndPassword(auth,email,password);
  try{
    await runTransaction(db, async tx=>{
      const uref=doc(db,"usernames",username);
      const existing=await tx.get(uref);
      if(existing.exists()) throw new Error("USERNAME_TAKEN");
      tx.set(uref,{uid:cred.user.uid,username,createdAt:serverTimestamp()});
    });
    await setDoc(doc(db,"users",cred.user.uid),{
      username,createdAt:serverTimestamp(),lastLogin:serverTimestamp(),version:1
    });
    return cred.user;
  }catch(e){
    try{ await deleteUser(cred.user); }catch{}
    if(e.message==="USERNAME_TAKEN") throw new Error("Esse username já está em uso.");
    throw e;
  }
}
export async function login(username,password){
  username=normalize(username);
  const snap=await getDoc(doc(db,"usernames",username));
  if(!snap.exists()) throw new Error("Username não encontrado.");
  return (await signInWithEmailAndPassword(auth,usernameEmail(username),password)).user;
}
export async function guest(){ return (await signInAnonymously(auth)).user; }

export function presence(user,username,onChange){
  const p=ref(rtdb,`players/${user.uid}`);
  const online=ref(rtdb,`online/${user.uid}`);
  const payload={username:username||"Visitante",x:0,y:0,direction:"right",animation:"idle",updatedAt:rtdbTimestamp()};
  set(p,payload);
  set(online,true);
  onDisconnect(p).remove();
  onDisconnect(online).remove();
  return {p,online};
}
export async function updatePresence(p,data){ await update(p,{...data,updatedAt:rtdbTimestamp()}); }
export function watchPlayers(cb){ return onValue(ref(rtdb,"players"),s=>cb(s.val()||{})); }
export async function sendChat(user,username,message){
  const m=message.trim().slice(0,200); if(!m) return;
  await set(push(ref(rtdb,"chat")),{uid:user.uid,username:username||"Visitante",message:m,timestamp:rtdbTimestamp()});
}
export function watchChat(cb){
  return onValue(query(ref(rtdb,"chat"),orderByChild("timestamp"),limitToLast(40)),s=>{
    const v=s.val()||{}; cb(Object.values(v).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0)));
  });
}
export async function loadChunk(id){
  const s=await getDoc(doc(db,"chunks",id)); return s.exists()?s.data():null;
}
export async function saveChunk(id,blocks){
  await setDoc(doc(db,"chunks",id),{blocks,updatedAt:serverTimestamp()},{merge:true});
}
