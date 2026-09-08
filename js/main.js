import {
 auth,db,signInAnonymously,signInWithEmailAndPassword,createUserWithEmailAndPassword,onAuthStateChanged,
 ref,set,update,onValue,onDisconnect,push,serverTimestamp,remove
} from "./firebase.js";

const canvas=document.querySelector("#game"),ctx=canvas.getContext("2d");
let W,H,DPR=1;
function resize(){DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*DPR;canvas.height=H*DPR;canvas.style.width=W+"px";canvas.style.height=H+"px";ctx.setTransform(DPR,0,0,DPR,0,0)} addEventListener("resize",resize);resize();

const TILE=24, CHUNK=32, WORLD_H=180, SEA=58;
const BLOCKS={
 air:{solid:false,drop:null,color:"#000"}, grass:{solid:true,drop:"dirt",color:"#6fb84f"},dirt:{solid:true,drop:"dirt",color:"#81532f"},
 stone:{solid:true,drop:"stone",color:"#737d87"},deepslate:{solid:true,drop:"deepslate",color:"#46505a"},bedrock:{solid:true,drop:null,color:"#252c33"},
 sand:{solid:true,drop:"sand",color:"#d8c27a"},snow:{solid:true,drop:"snow",color:"#eaf6ff"},ice:{solid:true,drop:"ice",color:"#9ddcf0"},
 wood:{solid:true,drop:"wood",color:"#80502f"},leaf:{solid:true,drop:"leaf",color:"#3e8b48"},cactus:{solid:true,drop:"cactus",color:"#3b8c54"},
 clay:{solid:true,drop:"clay",color:"#a86f68"},brick:{solid:true,drop:"brick",color:"#a94f43"},glass:{solid:true,drop:"glass",color:"#b8e8f0"},
 coal:{solid:true,drop:"coal",color:"#25282b"},iron:{solid:true,drop:"iron",color:"#b1a79c"},gold:{solid:true,drop:"gold",color:"#f1c84b"},
diamond:{solid:true,drop:"diamond",color:"#4ce4e5"},emerald:{solid:true,drop:"emerald",color:"#4bdd83"},
water:{solid:false,liquid:true,drop:null,color:"#4399d8"},lava:{solid:false,liquid:true,drop:null,color:"#e85d2d"},
torch:{solid:false,drop:"torch",color:"#ffd45a"}
};
const ITEMS={dirt:"Terra",stone:"Pedra",deepslate:"Ardósia",sand:"Areia",snow:"Neve",ice:"Gelo",wood:"Madeira",leaf:"Folha",cactus:"Cacto",clay:"Argila",brick:"Tijolo",glass:"Vidro",coal:"Carvão",iron:"Ferro",gold:"Ouro",diamond:"Diamante",emerald:"Esmeralda",torch:"Tocha"};
const recipes=[
 {out:"wood",n:4,need:{leaf:2},label:"Tábuas improvisadas"},
 {out:"brick",n:4,need:{clay:2},label:"Tijolos"},
 {out:"glass",n:4,need:{sand:2},label:"Vidro"},
 {out:"torch",n:8,need:{coal:1,wood:1},label:"Tochas"}
];

let seed=78231, world=new Map(), generated=new Set(), cam={x:0,y:0},time=0;
let player={x:0,y:0,vx:0,vy:0,w:.72,h:1.7,hp:100,name:"Visitante",uid:null};
let keys={},selected=0,inventory=Array.from({length:32},()=>({id:null,n:0}));
let hot=["dirt","stone","wood","sand","torch","water","brick","glass"];
let otherPlayers=new Map(), presenceRef=null;

function hash(x,y=0){let n=Math.sin(x*127.1+y*311.7+seed)*43758.5453;return n-Math.floor(n)}
function noise(x){let i=Math.floor(x),f=x-i,a=hash(i),b=hash(i+1);f=f*f*(3-2*f);return a+(b-a)*f}
function biomeAt(x){let n=noise(x/90);if(n<.18)return"tundra";if(n<.36)return"desert";if(n<.53)return"forest";if(n<.72)return"plains";if(n<.88)return"swamp";return"mountain"}
function surfaceY(x){const b=biomeAt(x),base=42+Math.floor(noise(x/35)*9);let wave=Math.floor(Math.sin(x*.045)*4);if(b==="mountain")return 30+Math.floor(noise(x/16)*22);if(b==="swamp")return 52+Math.floor(noise(x/25)*4);return base+wave}
function key(x,y){return x+","+y}
function get(x,y){return world.get(key(x,y))||"air"}
function setBlock(x,y,id){world.set(key(x,y),id)}
function generateChunk(cx){
 if(generated.has(cx))return;generated.add(cx);
 for(let x=cx*CHUNK;x<(cx+1)*CHUNK;x++){
   const sy=surfaceY(x), b=biomeAt(x);
   for(let y=0;y<WORLD_H;y++){
     let id="air";
     if(y>=WORLD_H-1)id="bedrock";
     else if(y>sy+42)id="deepslate";
     else if(y>sy+4)id="stone";
     else if(y>sy)id=(b==="desert"?"sand":b==="tundra"?"snow":b==="swamp"?"clay":"dirt");
     else if(y===sy)id=(b==="desert"?"sand":b==="tundra"?"snow":b==="swamp"?"clay":"grass");
     if(y>SEA && y<=sy && b!=="desert")id="water";
     if(id==="stone"||id==="deepslate"){
       const r=hash(x,y);
       if(r<.018)id="diamond";else if(r<.045)id="gold";else if(r<.085)id="iron";else if(r<.13)id="coal";else if(r<.145)id="emerald";
     }
     setBlock(x,y,id);
   }
   if(b==="forest"&&hash(x,8)>.65){let h=4+Math.floor(hash(x,9)*4);for(let j=1;j<=h;j++)setBlock(x,sy-j,"wood");for(let dx=-2;dx<=2;dx++)for(let dy=1;dy<=3;dy++)if(Math.abs(dx)+dy<4)setBlock(x+dx,sy-h-dy+1,"leaf")}
   if(b==="desert"&&hash(x,11)>.82){for(let j=1;j<4;j++)setBlock(x,sy-j,"cactus")}
 }
}
function ensureAround(x){const cx=Math.floor(x/CHUNK);for(let c=cx-3;c<=cx+3;c++)generateChunk(c)}
function findSpawn(){ensureAround(0);for(let x=-20;x<20;x++){let y=surfaceY(x);if(get(x,y)==="grass"||get(x,y)==="sand"||get(x,y)==="snow"||get(x,y)==="clay"){player.x=x+.1;player.y=y-2;return}}}

function addItem(id,n=1){let s=inventory.find(a=>a.id===id&&a.n<99);if(!s)s=inventory.find(a=>!a.id);if(!s)return false;s.id=id;s.n=Math.min(99,s.n+n);return true}
function removeItem(id,n){let left=n;for(const s of inventory){if(s.id===id){const q=Math.min(s.n,left);s.n-=q;left-=q;if(!s.n)s.id=null;if(!left)break}}return left===0}
function countItem(id){return inventory.filter(s=>s.id===id).reduce((a,s)=>a+s.n,0)}

function blockAtScreen(sx,sy){return {x:Math.floor((sx-W/2+cam.x)/TILE),y:Math.floor((sy-H/2+cam.y)/TILE)}}
function canPlace(x,y){return get(x,y)==="air"||get(x,y)==="water"||get(x,y)==="lava"}
function mineAt(x,y){const id=get(x,y);if(id==="air"||id==="bedrock")return;setBlock(x,y,"air");if(BLOCKS[id].drop)addItem(BLOCKS[id].drop);renderInventory();toast("Quebrou: "+(ITEMS[id]||id))}
function placeAt(x,y,id){if(!canPlace(x,y)||!countItem(id))return;setBlock(x,y,id);removeItem(id,1);renderInventory()}
let mouse={x:0,y:0,down:false,button:0,last:0};
canvas.addEventListener("pointermove",e=>{mouse.x=e.clientX;mouse.y=e.clientY});
canvas.addEventListener("pointerdown",e=>{mouse.down=true;mouse.button=e.button;interact(e.button)});
addEventListener("pointerup",()=>mouse.down=false);
function interact(button){if(document.querySelector(".panel:not(.hidden)")||document.querySelector("#login").style.display!=="none")return;const p=blockAtScreen(mouse.x,mouse.y);const dx=p.x-Math.floor(player.x),dy=p.y-Math.floor(player.y);if(Math.abs(dx)>5||Math.abs(dy)>5)return;if(button===0)mineAt(p.x,p.y);if(button===2)placeAt(p.x,p.y,hot[selected]);}
canvas.addEventListener("contextmenu",e=>e.preventDefault());

function solidAt(x,y){return BLOCKS[get(Math.floor(x),Math.floor(y))]?.solid}
function collides(x,y){return solidAt(x+.12,y)||solidAt(x+.7,y)||solidAt(x+.12,y+1.65)||solidAt(x+.7,y+1.65)}
function physics(dt){
 let left=keys.ArrowLeft||keys.KeyA,right=keys.ArrowRight||keys.KeyD;
 player.vx+=(right-left)*0.035;player.vx*=.82;player.vx=Math.max(-.18,Math.min(.18,player.vx));
 if((keys.Space||keys.ArrowUp)&&!player.jumped){let below=collides(player.x,player.y+0.08);if(below)player.vy=-.34;player.jumped=true} if(!keys.Space&&!keys.ArrowUp)player.jumped=false;
 let liquid=["water","lava"].includes(get(Math.floor(player.x+.4),Math.floor(player.y+1)));
 player.vy+=liquid?.012:.017;player.vy=Math.min(player.vy,.45);
 let nx=player.x+player.vx;if(!collides(nx,player.y))player.x=nx;else player.vx=0;
 let ny=player.y+player.vy;if(!collides(player.x,ny))player.y=ny;else{if(player.vy>0)player.y=Math.floor(player.y+1)-1.7;player.vy=0}
 if(player.y>WORLD_H-4)findSpawn();
 ensureAround(player.x);
}
addEventListener("keydown",e=>{keys[e.code]=true;if(e.code==="KeyE")toggle("inventory");if(e.code.startsWith("Digit")){let n=+e.code.slice(5)-1;if(n>=0&&n<8)selected=n}if(e.code==="KeyF")interact(2)});
addEventListener("keyup",e=>keys[e.code]=false);

function skyColor(){let t=(time%24000)/24000;let sun=Math.max(0,Math.sin(t*Math.PI*2));return sun>.15?"#63a5dc":"#14243b"}
function draw(){
 ctx.fillStyle=skyColor();ctx.fillRect(0,0,W,H);
 const cx=Math.floor(cam.x/TILE),cy=Math.floor(cam.y/TILE),cols=Math.ceil(W/TILE)+2,rows=Math.ceil(H/TILE)+2;
 for(let x=cx-cols;x<cx+cols;x++)for(let y=cy-rows;y<cy+rows;y++){const id=get(x,y);if(id==="air")continue;const sx=x*TILE-cam.x+W/2,sy=y*TILE-cam.y+H/2;const b=BLOCKS[id];ctx.fillStyle=b.color;ctx.fillRect(sx,sy,TILE+1,TILE+1);if(id==="grass"){ctx.fillStyle="#8bd65f";ctx.fillRect(sx,sy,TILE,4)}if(id==="stone"||id==="deepslate"){let r=hash(x,y);ctx.fillStyle=r>.5?"#89939d":"#626c76";ctx.fillRect(sx+5,sy+6,4,4);ctx.fillRect(sx+15,sy+15,3,3)}if(id==="water"||id==="lava"){ctx.globalAlpha=.72;ctx.fillRect(sx,sy,TILE,TILE);ctx.globalAlpha=1}}
 drawMobs();drawPlayers();drawPlayer();
 cam.x+=(player.x*TILE-cam.x)*.12;cam.y+=(player.y*TILE-cam.y)*.12;
}
function drawPlayer(){const sx=player.x*TILE-cam.x+W/2,sy=player.y*TILE-cam.y+H/2;ctx.fillStyle="#e7bd75";ctx.fillRect(sx+4,sy,TILE-8,13);ctx.fillStyle="#3e74b8";ctx.fillRect(sx+3,sy+13,TILE-6,28);ctx.fillStyle="#202a3a";ctx.fillRect(sx+4,sy+41,TILE-9,7);ctx.fillStyle="#fff";ctx.font="10px system-ui";ctx.textAlign="center";ctx.fillText(player.name,sx+12,sy-5)}
let mobs=[];
function spawnMobs(){mobs=[];for(let i=0;i<12;i++){let x=Math.floor(player.x+(hash(i,99)-.5)*80);let y=surfaceY(x)-1;mobs.push({x,y,type:hash(i,3)>.5?"slime":"zombie",vx:0,vy:0})}}
function drawMobs(){const night=Math.sin((time%24000)/24000*Math.PI*2)<.1;if(night&&mobs.length<12)spawnMobs();if(!night)mobs=mobs.filter((_,i)=>i%3);for(const m of mobs){m.x+=(player.x>m.x?.006:-.006);const sx=m.x*TILE-cam.x+W/2,sy=m.y*TILE-cam.y+H/2;ctx.fillStyle=m.type==="slime"?"#62d56b":"#596273";ctx.fillRect(sx+2,sy+5,20,19);ctx.fillStyle="#fff";ctx.fillRect(sx+6,sy+10,3,3);ctx.fillRect(sx+15,sy+10,3,3)}}
function drawPlayers(){for(const p of otherPlayers.values()){const sx=p.x*TILE-cam.x+W/2,sy=p.y*TILE-cam.y+H/2;ctx.fillStyle="#e9c07a";ctx.fillRect(sx+4,sy,TILE-8,13);ctx.fillStyle=p.color||"#bd68db";ctx.fillRect(sx+3,sy+13,TILE-6,28);ctx.fillStyle="#fff";ctx.font="10px system-ui";ctx.textAlign="center";ctx.fillText(p.name,sx+12,sy-5)}}

function renderHotbar(){const el=document.querySelector("#hotbar");el.innerHTML=hot.map((id,i)=>`<div class="hotbar-slot ${i===selected?"sel":""}" data-i="${i}"><small>${i+1}</small><div style="width:25px;height:25px;background:${BLOCKS[id]?.color||"#777"};border-radius:3px"></div><span>${countItem(id)}</span></div>`).join("");el.querySelectorAll(".hotbar-slot").forEach(s=>s.onclick=()=>{selected=+s.dataset.i;renderHotbar()})}
function renderInventory(){const g=document.querySelector("#inventoryGrid");g.className="grid";g.innerHTML=inventory.map((s,i)=>`<div class="slot ${i===selected?"selected":""}" data-i="${i}">${s.id?`<div style="width:32px;height:32px;background:${BLOCKS[s.id]?.color||"#777"}"></div><span class="count">${s.n}</span>`:""}</div>`).join("");document.querySelector("#recipes").innerHTML=recipes.map((r,i)=>{const ok=Object.entries(r.need).every(([id,n])=>countItem(id)>=n);return `<div class="recipe"><span>${r.label} → <b>${r.n} ${ITEMS[r.out]}</b></span><button data-r="${i}" ${ok?"":"disabled"}>Criar</button></div>`}).join("");g.querySelectorAll(".slot").forEach(s=>s.onclick=()=>{let i=+s.dataset.i;if(inventory[i].id){let h=hot.indexOf(inventory[i].id);if(h>=0)selected=h;else{hot[selected]=inventory[i].id}renderHotbar();renderInventory()}});document.querySelectorAll(".recipe button").forEach(b=>b.onclick=()=>{let r=recipes[+b.dataset.r];if(Object.entries(r.need).every(([id,n])=>countItem(id)>=n)){for(const [id,n] of Object.entries(r.need))removeItem(id,n);addItem(r.out,r.n);renderInventory();renderHotbar();toast("Criado: "+ITEMS[r.out])}})}
function toggle(id){document.getElementById(id).classList.toggle("hidden")}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.parentElement.parentElement.classList.add("hidden"));
document.querySelector("#playersBtn").onclick=()=>toggle("playersPanel");document.querySelector("#chatBtn").onclick=()=>toggle("chatPanel");document.querySelector("#invBtn").onclick=()=>toggle("inventory");document.querySelector("#saveBtn").onclick=()=>saveWorld();
document.querySelector("#breakBtn").onclick=()=>{mouse.x=W/2-60;mouse.y=H/2;interact(0)};document.querySelector("#placeBtn").onclick=()=>{mouse.x=W/2+60;mouse.y=H/2;interact(2)};
function toast(s){const t=document.querySelector("#toast");t.textContent=s;t.style.opacity=1;clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.opacity=0,1400)}
function updateUI(){document.querySelector("#clock").textContent=String(Math.floor((time%24000)/1000/60)).padStart(2,"0")+":"+String(Math.floor((time%1000)/1000*60)).padStart(2,"0");document.querySelector("#biome").textContent=({tundra:"Tundra",desert:"Deserto",forest:"Floresta",plains:"Planície",swamp:"Pântano",mountain:"Montanhas"})[biomeAt(Math.floor(player.x))]}

async function saveWorld(){localStorage.setItem("vilaPlayer",JSON.stringify({x:player.x,y:player.y,inv:inventory,hot,seed}));if(player.uid&&!player.uid.startsWith("anon")){await set(ref(db,"players/"+player.uid),{name:player.name,x:player.x,y:player.y,online:true,color:"#74a8ff",updated:serverTimestamp()})}toast("Jogo salvo")}
async function connect(uid,name){player.uid=uid;player.name=name;presenceRef=ref(db,"players/"+uid);await onDisconnect(presenceRef).remove();await set(presenceRef,{name,x:player.x,y:player.y,online:true,color:"#74a8ff",updated:serverTimestamp()});onValue(ref(db,"players"),snap=>{otherPlayers.clear();const v=snap.val()||{};Object.entries(v).forEach(([id,p])=>{if(id!==uid&&p.online)otherPlayers.set(id,p)});document.querySelector("#online").textContent=otherPlayers.size+1;document.querySelector("#playersList").innerHTML=[{name:player.name,online:true},...Array.from(otherPlayers.values())].map(p=>`<div class="side-row"><span>🟢 ${p.name}</span><small>online</small></div>`).join("")});onValue(ref(db,"chat"),snap=>{const v=snap.val()||{};const arr=Object.values(v).sort((a,b)=>(a.t||0)-(b.t||0)).slice(-60);document.querySelector("#messages").innerHTML=arr.map(m=>`<div class="msg"><b>${escapeHtml(m.name)}</b>: ${escapeHtml(m.text)}</div>`).join("");const box=document.querySelector("#messages");box.scrollTop=box.scrollHeight})}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
document.querySelector("#chatForm").onsubmit=async e=>{e.preventDefault();const input=document.querySelector("#chatInput"),text=input.value.trim();if(!text||!auth.currentUser)return;await push(ref(db,"chat"),{name:player.name,text,t:Date.now()});input.value=""};

async function login(){
 const name=document.querySelector("#username").value.trim().replace(/[^a-zA-Z0-9_À-ÿ]/g,"").slice(0,16),pw=document.querySelector("#password").value;
 if(name.length<3){toast("Nome precisa ter 3+ caracteres");return}
 if(pw.length<6){toast("Senha precisa ter 6+ caracteres");return}
 const email=name.toLowerCase()+"@login.vilarp.local";
 try{let c;try{c=await signInWithEmailAndPassword(auth,email,pw)}catch(e){c=await createUserWithEmailAndPassword(auth,email,pw)}await connect(c.user.uid,name);document.querySelector("#login").style.display="none"}catch(e){toast("Firebase: "+(e.code||"erro"))}}
document.querySelector("#loginBtn").onclick=login;
document.querySelector("#guestBtn").onclick=async()=>{try{const c=await signInAnonymously(auth);const name="Visitante-"+Math.random().toString(36).slice(2,6).toUpperCase();await connect("anon-"+c.user.uid,name);document.querySelector("#login").style.display="none"}catch(e){toast("Ative o login anônimo no Firebase")}};
onAuthStateChanged(auth,u=>{});
const saved=JSON.parse(localStorage.getItem("vilaPlayer")||"null");if(saved){Object.assign(player,{x:saved.x||0,y:saved.y||0});inventory=saved.inv||inventory;hot=saved.hot||hot;seed=saved.seed||seed}else findSpawn();
renderHotbar();renderInventory();spawnMobs();

let last=performance.now();function loop(now){const dt=Math.min(32,now-last);last=now;time+=dt*.7;physics(dt);updateUI();draw();if(player.uid&&Math.random()<.03)set(ref(db,"players/"+player.uid),{name:player.name,x:player.x,y:player.y,online:true,color:"#74a8ff",updated:serverTimestamp()});requestAnimationFrame(loop)}requestAnimationFrame(loop);

document.querySelectorAll("[data-key]").forEach(b=>{const k=b.dataset.key;b.onpointerdown=e=>{e.preventDefault();keys[k]=true};b.onpointerup=b.onpointercancel=()=>keys[k]=false});
setInterval(saveWorld,30000);
