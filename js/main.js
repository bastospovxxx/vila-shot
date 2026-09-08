import { auth, register, login, guest, presence, updatePresence, watchPlayers, sendChat, watchChat, loadChunk, saveChunk } from "./firebase.js";

const $=s=>document.querySelector(s);
const canvas=$("#game-canvas"), ctx=canvas.getContext("2d");
ctx.imageSmoothingEnabled=false;
const TILE=24, CHUNK=32, WORLD_H=180;
const blocks={
  air:{solid:false,color:"transparent",emoji:""},
  grass:{solid:true,color:"#5c9e48",emoji:"🌿",drop:"dirt"},
  dirt:{solid:true,color:"#8b5a35",emoji:"🟫"},
  stone:{solid:true,color:"#737b84",emoji:"⬜"},
  sand:{solid:true,color:"#d6bd73",emoji:"🟨"},
  snow:{solid:true,color:"#e8f3f7",emoji:"⬜"},
  wood:{solid:true,color:"#79502f",emoji:"🪵"},
  leaves:{solid:true,color:"#3e7c42",emoji:"🍃"},
  coal:{solid:true,color:"#33383d",emoji:"⚫"},
  iron:{solid:true,color:"#b07e63",emoji:"🟤"},
  gold:{solid:true,color:"#e0bd36",emoji:"🟡"},
  crystal:{solid:true,color:"#8b65d9",emoji:"💎"},
  obsidian:{solid:true,color:"#241b35",emoji:"⬛"},
  bedrock:{solid:true,color:"#22252a",emoji:"◼️",unbreakable:true},
  glass:{solid:true,color:"#a7d9df99",emoji:"🔹"}
};
const itemKeys=["dirt","stone","wood","leaves","sand","coal","iron","gold"];
let inventory=Array(32).fill(null).map(()=>({item:null,qty:0}));
let selected=0;
const hotbarItems=["dirt","stone","wood","leaves","sand","coal","iron","gold"];
hotbarItems.forEach((it,i)=>inventory[i]={item:it,qty:it==="dirt"?30:it==="stone"?20:it==="wood"?15:0});
const world=new Map(), modified=new Set(), loadedChunks=new Set();
const key=(x,y)=>`${x},${y}`;
const chunkId=(cx,cy)=>`${cx}_${cy}`;
function hash(x,y){let n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)}
function surface(x){
  const n=Math.sin(x*.018)*3+Math.sin(x*.043)*2+Math.sin(x*.09)*1.2;
  return Math.floor(55+n);
}
function biomeAt(x){
  const b=Math.floor((Math.sin(x*.0017)*.5+.5)*7);
  return ["forest","plains","desert","snow","forest","jungle","mountain"][b];
}
function generateTile(x,y){
  const s=surface(x), biome=biomeAt(x);
  if(y>=WORLD_H-1)return "bedrock";
  if(y<s)return "air";
  if(y===s){
    if(biome==="desert")return "sand";
    if(biome==="snow")return "snow";
    return "grass";
  }
  if(y<s+5)return biome==="desert"?"sand":"dirt";
  const r=hash(x,y);
  if(y>WORLD_H-8)return r<.12?"obsidian":"stone";
  if(r<.025)return "gold";
  if(r<.06)return "iron";
  if(r<.11)return "coal";
  if(r<.125)return "crystal";
  return "stone";
}
async function ensureChunk(cx,cy){
  const id=chunkId(cx,cy); if(loadedChunks.has(id))return;
  loadedChunks.add(id);
  try{
    const saved=await loadChunk(id);
    if(saved?.blocks){ for(const [k,v] of Object.entries(saved.blocks))world.set(k,v); }
    else{
      const obj={};
      const x0=cx*CHUNK,y0=cy*CHUNK;
      for(let x=0;x<CHUNK;x++)for(let y=0;y<CHUNK;y++){const wx=x0+x,wy=y0+y; const b=generateTile(wx,wy); if(b!=="air")obj[key(wx,wy)]=b;}
      for(const [k,v] of Object.entries(obj))world.set(k,v);
    }
  }catch(e){ console.warn("chunk",id,e); }
}
function getBlock(x,y){return world.get(key(x,y))||generateTile(x,y)}
function setBlock(x,y,b){ if(y<0||y>=WORLD_H)return; if(b==="air")world.delete(key(x,y));else world.set(key(x,y),b);modified.add(Math.floor(x/CHUNK)+"_"+Math.floor(y/CHUNK)); }
let saveTimer;
function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(flushSaves,1500)}
async function flushSaves(){
  const ids=[...modified]; modified.clear();
  for(const id of ids){
    const [cx,cy]=id.split("_").map(Number), obj={};
    for(let x=cx*CHUNK;x<cx*CHUNK+CHUNK;x++)for(let y=cy*CHUNK;y<cy*CHUNK+CHUNK;y++){const b=world.get(key(x,y));if(b)obj[key(x,y)]=b;}
    try{await saveChunk(id,obj)}catch(e){console.warn("save",e);showToast("Falha ao salvar chunk");}
  }
  if(ids.length)showToast("Mundo salvo");
}
let player={x:10,y:40,vx:0,vy:0,w:.72,h:1.7,onGround:false,hp:100};
let cam={x:0,y:0};
let username="Visitante", user=null, presenceRef=null;
let remotePlayers={};
const keys=new Set();
const mobs=[];
let gameStarted=false;
function spawnMobs(){
  for(let i=0;i<12;i++){const x=Math.floor((hash(i,9)*120)-60);mobs.push({x,y:surface(x)-1,hp:20,phase:hash(i,4)*6});}
}
function resize(){canvas.width=innerWidth;canvas.height=innerHeight}
addEventListener("resize",resize);resize();
function solidAt(x,y){return blocks[getBlock(Math.floor(x),Math.floor(y))]?.solid}
function collide(x,y,w,h){
  const pts=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]];
  return pts.some(([px,py])=>solidAt(px,py));
}
function move(dt){
  const speed=5.2; player.vx=0;
  if(keys.has("a")||keys.has("arrowleft"))player.vx=-speed;
  if(keys.has("d")||keys.has("arrowright"))player.vx=speed;
  if((keys.has("w")||keys.has(" ")||keys.has("arrowup"))&&player.onGround){player.vy=-9.5;player.onGround=false}
  player.vy=Math.min(18,player.vy+24*dt);
  let nx=player.x+player.vx*dt;
  if(!collide(nx,player.y,player.w,player.h))player.x=nx;
  let ny=player.y+player.vy*dt;
  if(!collide(player.x,ny,player.w,player.h)){player.y=ny;player.onGround=false}
  else{if(player.vy>0)player.onGround=true;player.vy=0}
}
function drawBlock(b,sx,sy){
  const d=blocks[b];if(!d||b==="air")return;
  ctx.fillStyle=d.color;ctx.fillRect(sx,sy,TILE,TILE);
  ctx.strokeStyle="#0002";ctx.strokeRect(sx,sy,TILE,TILE);
  if(b==="grass"){ctx.fillStyle="#78bb58";ctx.fillRect(sx,sy,TILE,4)}
  if(["coal","iron","gold","crystal"].includes(b)){ctx.fillStyle=d.color;for(let i=0;i<4;i++){const px=sx+4+((i*7)%15),py=sy+5+((i*11)%13);ctx.fillRect(px,py,3,3)}}
}
function skyColor(t){
  const a=(Math.sin(t*Math.PI*2-Math.PI/2)+1)/2;
  const night=Math.max(0,1-a*1.2);
  return `rgb(${Math.round(70-35*night)},${Math.round(150-90*night)},${Math.round(220-90*night)})`;
}
let time=0;
function render(){
  time=(time+1/60/180)%1;
  ctx.fillStyle=skyColor(time);ctx.fillRect(0,0,canvas.width,canvas.height);
  const targetX=player.x*TILE-canvas.width/2,targetY=player.y*TILE-canvas.height/2;
  cam.x+=(targetX-cam.x)*.12;cam.y+=(targetY-cam.y)*.12;
  const sx=Math.floor(cam.x/TILE)-2, ex=Math.ceil((cam.x+canvas.width)/TILE)+2;
  const sy=Math.max(0,Math.floor(cam.y/TILE)-2), ey=Math.min(WORLD_H,Math.ceil((cam.y+canvas.height)/TILE)+2);
  for(let x=sx;x<ex;x++)for(let y=sy;y<ey;y++)drawBlock(getBlock(x,y),x*TILE-cam.x,y*TILE-cam.y);
  for(const m of mobs){
    if(Math.abs(m.x-player.x)>50)continue;
    const mx=m.x*TILE-cam.x,my=(m.y-1)*TILE-cam.y;
    ctx.fillStyle="#9d4b54";ctx.fillRect(mx+3,my+5,18,18);ctx.fillStyle="#fff";ctx.fillRect(mx+6,my+10,4,4);ctx.fillRect(mx+15,my+10,4,4);
  }
  for(const [uid,p] of Object.entries(remotePlayers)){
    if(uid===user?.uid||p?.x==null)continue;
    const px=p.x*TILE-cam.x,py=(p.y-1.7)*TILE-cam.y;
    ctx.fillStyle="#e7c36b";ctx.fillRect(px+4,py,15,10);ctx.fillStyle="#4d7dc1";ctx.fillRect(px+3,py+10,18,26);
    ctx.fillStyle="#fff";ctx.font="10px system-ui";ctx.textAlign="center";ctx.fillText(p.username||"Jogador",px+12,py-4);
  }
  const px=player.x*TILE-cam.x,py=(player.y-player.h)*TILE-cam.y;
  ctx.fillStyle="#f0c38b";ctx.fillRect(px+4,py,15,10);ctx.fillStyle="#4d7dc1";ctx.fillRect(px+3,py+10,18,26);ctx.fillStyle="#4b2d20";ctx.fillRect(px+3,py,18,4);
  // simple night overlay
  const daylight=(Math.sin(time*Math.PI*2-Math.PI/2)+1)/2;
  if(daylight<.45){ctx.fillStyle=`rgba(15,25,55,${(.45-daylight)*.75})`;ctx.fillRect(0,0,canvas.width,canvas.height)}
}
function loop(){move(1/60);render();requestAnimationFrame(loop)}
function worldPoint(e){const r=canvas.getBoundingClientRect();return {x:Math.floor((e.clientX-r.left+cam.x)/TILE),y:Math.floor((e.clientY-r.top+cam.y)/TILE)}}
canvas.addEventListener("pointerdown",e=>{
  if(!gameStarted)return;
  const p=worldPoint(e), b=getBlock(p.x,p.y);
  if(e.button===2){const item=inventory[selected];if(item?.item&&item.qty>0&&!solidAt(p.x,p.y)&&Math.abs(p.x-player.x)<5&&Math.abs(p.y-player.y)<5){setBlock(p.x,p.y,item.item);item.qty--;queueSave();renderInventory();}}
  else if(e.button===0&&b!=="air"&&b!=="bedrock"&&Math.abs(p.x-player.x)<6&&Math.abs(p.y-player.y)<5){
    const drop=blocks[b].drop||b; const slot=inventory.find(s=>s.item===drop)||inventory.find(s=>!s.item); if(slot){slot.item=drop;slot.qty++;setBlock(p.x,p.y,"air");queueSave();renderInventory();}
  }
});
canvas.addEventListener("contextmenu",e=>e.preventDefault());
addEventListener("keydown",e=>{if([" ","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(/^\\d$/.test(e.key)){const n=+e.key-1;if(n>=0&&n<8){selected=n;renderHotbar()}}if(e.key.toLowerCase()==="e")togglePanel("#inventory-panel")});
addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
function renderHotbar(){const h=$("#hotbar");h.innerHTML="";for(let i=0;i<8;i++){const s=inventory[i];const d=blocks[s.item||"air"];const el=document.createElement("div");el.className="slot"+(i===selected?" selected":"");el.innerHTML=`<span class="num">${i+1}</span>${d?.emoji||""}<span class="qty">${s.qty||""}</span>`;el.onclick=()=>{selected=i;renderHotbar()};h.appendChild(el)}}
function renderInventory(){const g=$("#inventory-grid");g.innerHTML="";inventory.forEach((s,i)=>{const d=blocks[s.item||"air"];const el=document.createElement("div");el.className="inv-slot";el.innerHTML=`${d?.emoji||""}<span class="qty">${s.qty||""}</span>`;el.title=s.item||"vazio";g.appendChild(el)})}
function togglePanel(sel){$(sel).classList.toggle("hidden")}
function showToast(t){const e=$("#toast");e.textContent=t;e.classList.add("toast-show");setTimeout(()=>e.classList.remove("toast-show"),1800)}
function setupUI(){
  $("#players-btn").onclick=()=>togglePanel("#players-panel");
  $("#chat-btn").onclick=()=>togglePanel("#chat-panel");
  $("#save-btn").onclick=flushSaves;
  document.querySelectorAll(".close").forEach(b=>b.onclick=()=>b.closest(".panel").classList.add("hidden"));
  $("#chat-form").onsubmit=async e=>{e.preventDefault();const input=$("#chat-input");try{await sendChat(user,username,input.value);input.value=""}catch(err){showToast("Não foi possível enviar")}};
  watchPlayers(v=>{remotePlayers=v;$("#online-count").textContent=Object.keys(v).length;const list=$("#players-list");list.innerHTML=Object.values(v).map(p=>`<div class="player-row"><span><i class="dot"></i>${escapeHtml(p.username||"Visitante")}</span><small>online</small></div>`).join("")});
  watchChat(msgs=>{$("#chat-log").innerHTML=msgs.map(m=>`<div class="chat-row"><b>${escapeHtml(m.username||"")}</b><small>${escapeHtml(m.message||"")}</small></div>`).join("");const l=$("#chat-log");l.scrollTop=l.scrollHeight});
  document.querySelectorAll("[data-key]").forEach(b=>{const k=b.dataset.key;const map={left:"a",right:"d",jump:"w"};const down=e=>{e.preventDefault();if(k==="mine"){showToast("Use toque no bloco para minerar");return}if(k==="place"){showToast("Selecione um bloco e toque no local vazio");return}if(k==="inventory"){togglePanel("#inventory-panel");return}keys.add(map[k]||k)};const up=e=>{e.preventDefault();keys.delete(map[k]||k)};b.addEventListener("pointerdown",down);b.addEventListener("pointerup",up);b.addEventListener("pointercancel",up)});
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function start(u,name){
  user=u;username=name||"Visitante";$("#login-screen").classList.add("hidden");$("#game").classList.remove("hidden");gameStarted=true;
  presenceRef=presence(user,username,()=>{});
  setInterval(()=>{if(presenceRef)updatePresence(presenceRef.p,{x:+player.x.toFixed(2),y:+player.y.toFixed(2),direction:player.vx<0?"left":"right",animation:player.onGround?"walk":"jump"}).catch(()=>{})},500);
  await ensureChunk(0,1);await ensureChunk(0,0);await ensureChunk(-1,1);await ensureChunk(1,1);spawnMobs();renderHotbar();renderInventory();setupUI();showToast(`Bem-vindo, ${username}!`);loop();
}
let mode="login";
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{mode=t.dataset.tab;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===t));$("#auth-form").classList.toggle("hidden",mode==="guest");$("#guest-btn").classList.toggle("hidden",mode!=="guest");$("#auth-submit").textContent=mode==="register"?"Criar conta":"Entrar no mundo";$("#auth-msg").textContent=""});
$("#auth-form").onsubmit=async e=>{e.preventDefault();const name=$("#username").value,password=$("#password").value;$("#auth-msg").textContent="Conectando...";try{const u=mode==="register"?await register(name,password):await login(name,password);await start(u,name.trim().toLowerCase())}catch(err){console.error(err);$("#auth-msg").textContent=err.message||"Erro ao entrar."}};
$("#guest-btn").onclick=async()=>{try{const u=await guest();await start(u,"Visitante-"+u.uid.slice(0,5))}catch(e){$("#auth-msg").textContent=e.message}};
