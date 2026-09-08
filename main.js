import {
  auth, db,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  ref, set, update, onValue, onDisconnect, push, serverTimestamp
} from './firebase.js';

/* =========================================================
   VILA RP v0.3 — WORLD / GAMEPLAY CORE
   Offline-first: the world opens even if Firebase is slow.
   Firebase is used for accounts, presence, chat and edits.
   ========================================================= */

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

let W = innerWidth;
let H = innerHeight;
let DPR = 1;
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
addEventListener('resize', resize);
resize();

const TILE = 24;
const CHUNK = 32;
const WORLD_H = 180;
const SEA_LEVEL = 58;
const REACH = 6;
const GRAVITY = 0.018;
const DAY_LENGTH = 24000;

const BLOCKS = {
  air:       { solid:false, transparent:true, color:'#000', drop:null },
  grass:     { solid:true,  color:'#4f9f4a', top:'#8bd25c', drop:'dirt' },
  dirt:      { solid:true,  color:'#7a4d2c', drop:'dirt' },
  stone:     { solid:true,  color:'#727b84', drop:'stone' },
  deepslate: { solid:true,  color:'#424a53', drop:'deepslate' },
  bedrock:   { solid:true,  color:'#242a31', drop:null, unbreakable:true },
  sand:      { solid:true,  color:'#d8c17b', drop:'sand' },
  snow:      { solid:true,  color:'#eaf5fb', top:'#ffffff', drop:'snow' },
  ice:       { solid:true,  transparent:true, color:'#8bd1e8', drop:'ice' },
  wood:      { solid:true,  color:'#80502f', drop:'wood' },
  leaf:      { solid:true,  transparent:true, color:'#3b8b4d', drop:'leaf' },
  cactus:    { solid:true,  color:'#32834c', drop:'cactus' },
  clay:      { solid:true,  color:'#a56e68', drop:'clay' },
  brick:     { solid:true,  color:'#a94e43', drop:'brick' },
  glass:     { solid:true,  transparent:true, color:'#9bdbe9', drop:'glass' },
  coal:      { solid:true,  color:'#292d31', drop:'coal' },
  iron:      { solid:true,  color:'#b5aaa0', drop:'iron' },
  gold:      { solid:true,  color:'#e9bd36', drop:'gold' },
  diamond:   { solid:true,  color:'#37d8dd', drop:'diamond' },
  emerald:   { solid:true,  color:'#35c879', drop:'emerald' },
  water:     { solid:false, liquid:true, transparent:true, color:'#3c8fd1', drop:null },
  lava:      { solid:false, liquid:true, transparent:true, color:'#e65b27', drop:null },
  torch:     { solid:false, transparent:true, color:'#ffd34d', drop:'torch' },
  glowstone: { solid:true,  color:'#e9ca68', drop:'glowstone' },
  obsidian:  { solid:true,  color:'#302844', drop:'obsidian' }
};

const ITEMS = {
  dirt:'Terra', stone:'Pedra', deepslate:'Ardósia', sand:'Areia', snow:'Neve', ice:'Gelo',
  wood:'Madeira', leaf:'Folha', cactus:'Cacto', clay:'Argila', brick:'Tijolo', glass:'Vidro',
  coal:'Carvão', iron:'Ferro', gold:'Ouro', diamond:'Diamante', emerald:'Esmeralda', torch:'Tocha',
  glowstone:'Pedra luminosa', obsidian:'Obsidiana'
};

const RECIPES = [
  { out:'wood', n:4, need:{leaf:2}, label:'Tábuas improvisadas' },
  { out:'brick', n:4, need:{clay:2}, label:'Tijolos' },
  { out:'glass', n:4, need:{sand:2}, label:'Vidro' },
  { out:'torch', n:8, need:{coal:1, wood:1}, label:'Tochas' },
  { out:'glowstone', n:2, need:{gold:2, torch:1}, label:'Luz mágica' },
  { out:'obsidian', n:1, need:{lava:4, stone:4}, label:'Obsidiana' }
];

const BIOME_INFO = {
  plains:    { name:'Planície', sky:'#5da5dc', grass:'#4f9f4a' },
  forest:    { name:'Floresta', sky:'#5598ca', grass:'#3f8e45' },
  desert:    { name:'Deserto', sky:'#d2a86d', grass:'#c9a65b' },
  tundra:    { name:'Tundra', sky:'#8db6cf', grass:'#eaf5fb' },
  swamp:     { name:'Pântano', sky:'#4d806e', grass:'#5d8350' },
  mountain:  { name:'Montanhas', sky:'#7098b5', grass:'#6f8f62' },
  mushroom:  { name:'Bosque estranho', sky:'#8c76a7', grass:'#70517d' },
  volcanic:  { name:'Vulcânico', sky:'#765858', grass:'#5a3e38' }
};

let seed = 78231;
let world = new Map();
let generated = new Set();
let edits = new Map();
let liquidQueue = [];
let mobs = [];
let particles = [];
let otherPlayers = new Map();
let presenceRef = null;
let firebaseReady = false;
let chatListenerStarted = false;
let lastRemoteEditAt = 0;

const player = {
  x:0, y:0, vx:0, vy:0,
  w:.72, h:1.72,
  hp:100, maxHp:100,
  name:'Visitante', uid:null,
  color:'#74a8ff',
  onGround:false,
  invuln:0,
  facing:1,
  attackCooldown:0,
  spawnX:0, spawnY:0
};

const camera = { x:0, y:0, shake:0 };
const keys = Object.create(null);
const touchKeys = Object.create(null);
let selected = 0;
let inventory = Array.from({length:32}, () => ({id:null,n:0}));
let hotbar = ['dirt','stone','wood','sand','torch','water','brick','glass'];
let gameTime = 9000;
let last = performance.now();
let saveTimer = 0;
let networkTimer = 0;
let mobTimer = 0;
let liquidTimer = 0;
let worldReady = false;

function hash(x, y=0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 0.731) * 43758.5453;
  return n - Math.floor(n);
}
function lerp(a,b,t){return a+(b-a)*t}
function smooth(t){return t*t*(3-2*t)}
function noise(x) {
  const i = Math.floor(x);
  const f = smooth(x-i);
  return lerp(hash(i), hash(i+1), f);
}
function noise2(x,y) {
  const ix=Math.floor(x), iy=Math.floor(y), fx=smooth(x-ix), fy=smooth(y-iy);
  const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);
  return lerp(lerp(a,b,fx),lerp(c,d,fx),fy);
}
function blockKey(x,y){return x+','+y}
function getBlock(x,y){return world.get(blockKey(x,y)) || 'air'}
function setBlock(x,y,id){world.set(blockKey(x,y),id)}
function biomeAt(x) {
  const n=noise(x/110);
  const rare=noise(x/370);
  if(rare>.91 && n>.65)return 'volcanic';
  if(rare<.08 && n<.45)return 'mushroom';
  if(n<.13)return 'tundra';
  if(n<.28)return 'desert';
  if(n<.49)return 'forest';
  if(n<.68)return 'plains';
  if(n<.84)return 'swamp';
  return 'mountain';
}
function surfaceY(x) {
  const b=biomeAt(x);
  let base=44+Math.floor(noise(x/31)*8)+Math.floor(Math.sin(x*.043)*4);
  if(b==='mountain')base=28+Math.floor(noise(x/15)*25);
  if(b==='swamp')base=51+Math.floor(noise(x/22)*4);
  if(b==='desert')base=46+Math.floor(noise(x/24)*6);
  if(b==='tundra')base=43+Math.floor(noise(x/27)*7);
  if(b==='volcanic')base=39+Math.floor(noise(x/17)*15);
  return Math.max(15,Math.min(90,base));
}

function terrainBlock(x,y,sy,b) {
  if(y>=WORLD_H-1)return 'bedrock';
  if(y>sy+48)return 'deepslate';
  if(y>sy+4)return 'stone';
  if(y>sy) {
    if(b==='desert')return 'sand';
    if(b==='tundra')return 'snow';
    if(b==='swamp'||b==='mushroom')return 'clay';
    if(b==='volcanic')return 'stone';
    return 'dirt';
  }
  if(y===sy) {
    if(b==='desert')return 'sand';
    if(b==='tundra')return 'snow';
    if(b==='swamp')return 'clay';
    if(b==='mushroom')return 'grass';
    if(b==='volcanic')return 'obsidian';
    return 'grass';
  }
  return 'air';
}

function generateChunk(cx) {
  if(generated.has(cx))return;
  generated.add(cx);
  const start=cx*CHUNK;
  const end=start+CHUNK;
  for(let x=start;x<end;x++) {
    const sy=surfaceY(x);
    const b=biomeAt(x);
    for(let y=0;y<WORLD_H;y++) {
      let id=terrainBlock(x,y,sy,b);
      if(y>SEA_LEVEL && y<sy && b!=='desert' && b!=='volcanic')id='water';
      if((id==='stone'||id==='deepslate') && y>sy+6) {
        const r=hash(x,y);
        const depth=(y-sy)/80;
        if(r<0.004+depth*.004)id='diamond';
        else if(r<0.015+depth*.008)id='gold';
        else if(r<0.042)id='iron';
        else if(r<0.092)id='coal';
        else if(r<0.108)id='emerald';
      }
      if(b==='volcanic' && y>sy+2 && hash(x,y+.7)<.025)id='lava';
      if(b==='volcanic' && y>sy+2 && hash(x,y+1.4)<.012)id='obsidian';
      if(hash(x,y+9)>.997 && y>sy+7)id='glowstone';
      setBlock(x,y,id);
    }
    // Trees.
    if(b==='forest' && hash(x,8)>.61 && getBlock(x,sy)==='grass') {
      const h=4+Math.floor(hash(x,9)*4);
      for(let j=1;j<=h;j++)setBlock(x,sy-j,'wood');
      for(let dx=-2;dx<=2;dx++)for(let dy=0;dy<=3;dy++){
        if(Math.abs(dx)+dy<4 && getBlock(x+dx,sy-h-dy)==='air')setBlock(x+dx,sy-h-dy,'leaf');
      }
    }
    // Mushroom trees.
    if(b==='mushroom' && hash(x,18)>.79 && getBlock(x,sy)==='grass'){
      const h=3+Math.floor(hash(x,19)*3);
      for(let j=1;j<=h;j++)setBlock(x,sy-j,'wood');
      for(let dx=-2;dx<=2;dx++)for(let dy=0;dy<2;dy++)setBlock(x+dx,sy-h-dy,'leaf');
    }
    // Cactus.
    if(b==='desert' && hash(x,11)>.82)for(let j=1;j<4;j++)setBlock(x,sy-j,'cactus');
    // Small surface lava pools.
    if(b==='volcanic' && hash(x,27)>.84)for(let dx=-2;dx<=2;dx++)if(getBlock(x+dx,sy)==='obsidian')setBlock(x+dx,sy-1,'lava');
  }
  // Apply persistent remote edits after generation.
  for(const [k,id] of edits) {
    const [x,y]=k.split(',').map(Number);
    if(x>=start && x<end)setBlock(x,y,id);
  }
}
function ensureAround(x) {
  const cx=Math.floor(x/CHUNK);
  for(let c=cx-4;c<=cx+4;c++)generateChunk(c);
}
function findSpawn() {
  ensureAround(0);
  for(let x=-30;x<=30;x++) {
    const y=surfaceY(x);
    const top=getBlock(x,y);
    const above=getBlock(x,y-1);
    const above2=getBlock(x,y-2);
    if(['grass','sand','snow','clay','obsidian'].includes(top) && above==='air' && above2==='air') {
      player.x=x+.12;
      player.y=y-2;
      player.spawnX=player.x;
      player.spawnY=player.y;
      camera.x=player.x*TILE;
      camera.y=player.y*TILE;
      return;
    }
  }
}

function countItem(id){return inventory.reduce((n,s)=>n+(s.id===id?s.n:0),0)}
function addItem(id,n=1) {
  let remaining=n;
  for(const s of inventory) {
    if(s.id===id && s.n<99) {
      const q=Math.min(99-s.n,remaining);s.n+=q;remaining-=q;
      if(!remaining)return true;
    }
  }
  for(const s of inventory) {
    if(!s.id) {
      s.id=id;s.n=Math.min(99,remaining);remaining-=s.n;
      if(!remaining)return true;
    }
  }
  toast('Inventário cheio');
  return false;
}
function removeItem(id,n) {
  let left=n;
  for(const s of inventory)if(s.id===id){const q=Math.min(s.n,left);s.n-=q;left-=q;if(!s.n)s.id=null;if(!left)return true}
  return false;
}
function giveStarter() {
  if(localStorage.getItem('vilaStarterGiven'))return;
  addItem('dirt',32);addItem('stone',24);addItem('wood',12);addItem('sand',12);addItem('torch',12);
  localStorage.setItem('vilaStarterGiven','1');
}

function inReach(x,y){
  const dx=x-(player.x+.36),dy=y-(player.y+.7);
  return Math.hypot(dx,dy)<=REACH;
}
function isReplaceable(id){return id==='air'||id==='water'||id==='lava'||id==='leaf'}
function isSolidAt(x,y){return !!BLOCKS[getBlock(Math.floor(x),Math.floor(y))]?.solid}
function collides(px,py){
  const eps=.12;
  return isSolidAt(px+eps,py+eps)||isSolidAt(px+.72-eps,py+eps)||
         isSolidAt(px+eps,py+1.69-eps)||isSolidAt(px+.72-eps,py+1.69-eps);
}
function damage(amount,reason='') {
  if(player.invuln>0)return;
  player.hp=Math.max(0,player.hp-amount);
  player.invuln=70;
  camera.shake=8;
  toast(reason?`-${amount} HP • ${reason}`:`-${amount} HP`);
  burst(player.x+.36,player.y+.8,'#ff5c5c',7);
  if(player.hp<=0)respawn();
}
function respawn(){
  player.hp=player.maxHp;player.x=player.spawnX;player.y=player.spawnY;player.vx=0;player.vy=0;
  toast('Você voltou para o spawn');
}

function mineAt(x,y) {
  if(!inReach(x,y))return toast('Muito longe');
  const id=getBlock(x,y);
  if(id==='air')return;
  if(id==='bedrock')return toast('Bedrock é indestrutível');
  const b=BLOCKS[id];
  setBlock(x,y,'air');
  if(b?.drop)addItem(b.drop,1);
  burst(x+.5,y+.5,b?.color||'#aaa',5);
  emitEdit(x,y,'air');
  renderInventory();
  toast(`Quebrou ${ITEMS[id]||id}`);
}
function placeAt(x,y,id) {
  if(!inReach(x,y))return toast('Muito longe');
  if(!isReplaceable(getBlock(x,y)))return;
  if(!countItem(id))return toast('Você não tem esse bloco');
  // Prevent placing inside player.
  if(x+1>player.x && x<player.x+.72 && y+1>player.y && y<player.y+1.72)return toast('Espaço ocupado');
  setBlock(x,y,id);
  removeItem(id,1);
  emitEdit(x,y,id);
  renderInventory();
}

let pointer={x:0,y:0,button:0,lastAction:0};
function screenBlock(sx,sy){
  return {x:Math.floor((sx-W/2+camera.x)/TILE),y:Math.floor((sy-H/2+camera.y)/TILE)};
}
function interact(button,sx=pointer.x,sy=pointer.y) {
  if(Date.now()-pointer.lastAction<90)return;
  pointer.lastAction=Date.now();
  const p=screenBlock(sx,sy);
  if(button===0)mineAt(p.x,p.y);
  else if(button===2)placeAt(p.x,p.y,hotbar[selected]);
}
canvas.addEventListener('pointermove',e=>{pointer.x=e.clientX;pointer.y=e.clientY});
canvas.addEventListener('pointerdown',e=>{
  pointer.x=e.clientX;pointer.y=e.clientY;pointer.button=e.button;
  if(e.button===0||e.button===2)interact(e.button);
});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

function movePhysics(dt) {
  const left=keys.ArrowLeft||keys.KeyA||touchKeys.ArrowLeft;
  const right=keys.ArrowRight||keys.KeyD||touchKeys.ArrowRight;
  const jump=keys.Space||keys.ArrowUp||touchKeys.Space;
  if(left){player.vx-=.018;player.facing=-1}
  if(right){player.vx+=.018;player.facing=1}
  player.vx*=player.onGround?.76:.91;
  player.vx=Math.max(-.22,Math.min(.22,player.vx));
  if(jump && player.onGround && !player.jumpLock){player.vy=-.37;player.onGround=false;player.jumpLock=true}
  if(!jump)player.jumpLock=false;
  const feet=getBlock(Math.floor(player.x+.36),Math.floor(player.y+1.8));
  const body=getBlock(Math.floor(player.x+.36),Math.floor(player.y+1));
  const liquid=feet==='water'||body==='water';
  const lava=feet==='lava'||body==='lava';
  player.vy+=liquid?.007:GRAVITY;
  if(liquid&&jump)player.vy-=.018;
  player.vy=Math.min(player.vy,liquid?.18:.46);
  let nx=player.x+player.vx;
  if(!collides(nx,player.y))player.x=nx;else player.vx=0;
  let ny=player.y+player.vy;
  if(!collides(player.x,ny)) {player.y=ny;player.onGround=false}
  else {
    if(player.vy>0){player.y=Math.floor(player.y+1)-1.72;player.onGround=true}
    player.vy=0;
  }
  if(lava)damage(1,'lava');
  if(player.invuln>0)player.invuln--;
  player.attackCooldown=Math.max(0,player.attackCooldown-dt);
  ensureAround(player.x);
  if(player.y>WORLD_H-5)respawn();
}

function simulateLiquids() {
  // Lightweight cellular liquid simulation: enough to feel alive without melting mobile FPS.
  if(liquidQueue.length>2600)liquidQueue.length=2600;
  const batch=Math.min(100,liquidQueue.length);
  for(let i=0;i<batch;i++){
    const p=liquidQueue.shift();
    const id=getBlock(p.x,p.y);
    if(id!=='water'&&id!=='lava')continue;
    if(getBlock(p.x,p.y+1)==='air'){
      setBlock(p.x,p.y+1,id);liquidQueue.push({x:p.x,y:p.y+1});
    } else {
      for(const dx of [-1,1])if(getBlock(p.x+dx,p.y)==='air'){
        setBlock(p.x+dx,p.y,id);liquidQueue.push({x:p.x+dx,y:p.y});
      }
    }
  }
}
function seedLiquid(x,y){liquidQueue.push({x,y})}

function spawnMob() {
  if(mobs.length>=18)return;
  const x=Math.floor(player.x)+(Math.random()>.5?1:-1)*(18+Math.floor(Math.random()*35));
  const y=surfaceY(x)-1;
  const night=isNight();
  if(!night)return;
  const type=Math.random()>.55?'slime':Math.random()>.5?'zombie':'bat';
  mobs.push({id:Math.random().toString(36).slice(2),x,y,vx:0,vy:0,type,hp:type==='zombie'?35:20,onGround:false});
}
function isNight(){
  const t=(gameTime%DAY_LENGTH)/DAY_LENGTH;
  return t>.72||t<.23;
}
function updateMobs() {
  if(isNight() && mobTimer<=0){spawnMob();mobTimer=70+Math.random()*90}
  mobTimer--;
  for(const m of mobs){
    const dx=player.x-m.x;
    if(m.type==='bat'){
      m.x+=(dx>0?.035:-.035);
      m.y+=(player.y-m.y)*.015+Math.sin(performance.now()/250+m.x)*.006;
    } else {
      m.vx+=(dx>0?.005:-.005);m.vx*=.9;m.vx=Math.max(-.07,Math.min(.07,m.vx));
      m.vy+=GRAVITY;
      const nx=m.x+m.vx;
      if(!collides(nx,m.y))m.x=nx;else m.vx*=-.4;
      const ny=m.y+m.vy;
      if(!collides(m.x,ny)){m.y=ny;m.onGround=false}else{m.y=Math.floor(m.y+1)-1.05;m.vy=0;m.onGround=true}
      if(m.onGround && Math.abs(dx)<7 && Math.random()<.02)m.vy=-.22;
    }
    if(Math.abs(m.x-player.x)<.75 && Math.abs(m.y-player.y)<1.5)damage(m.type==='zombie'?8:4,m.type==='zombie'?'zumbi':'criatura');
  }
  mobs=mobs.filter(m=>Math.abs(m.x-player.x)<90 && m.hp>0 && !(!isNight()&&m.y>surfaceY(m.x)+5));
}
function attackMob() {
  if(player.attackCooldown>0)return;
  player.attackCooldown=260;
  const px=player.x+player.facing*.8;
  let hit=false;
  for(const m of mobs){
    if(Math.abs(m.x-px)<1.3 && Math.abs(m.y-player.y)<1.7){m.hp-=15;m.vx+=player.facing*.2;m.vy=-.12;hit=true;burst(m.x+.4,m.y+.6,'#ffffff',5);if(m.hp<=0){addItem(Math.random()>.7?'coal':'dirt',1);toast('Criatura derrotada')}}
  }
  if(hit){camera.shake=3;renderInventory()}
}

function burst(x,y,color,n){for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*.12,vy:(Math.random()-.5)*.12,life:20+Math.random()*25,color})}
function updateParticles(){for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vy+=.002;p.life--}particles=particles.filter(p=>p.life>0)}

function timeOfDay() {
  const t=(gameTime%DAY_LENGTH)/DAY_LENGTH;
  return (t*24+6)%24;
}
function clockText(){const h=Math.floor(timeOfDay());const m=Math.floor((timeOfDay()-h)*60);return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}
function dayLight(){
  const h=timeOfDay();
  if(h>=7&&h<18)return 1;
  if(h>=5&&h<7)return .35+(h-5)*.325;
  if(h>=18&&h<20)return 1-(h-18)*.325;
  return .30;
}
function skyColor() {
  const b=BIOME_INFO[biomeAt(Math.floor(player.x))]||BIOME_INFO.plains;
  if(isNight())return '#101b2c';
  return b.sky;
}

function drawBackground(){
  ctx.fillStyle=skyColor();ctx.fillRect(0,0,W,H);
  const light=dayLight();
  // Pixel clouds.
  if(light>.5){
    ctx.fillStyle='rgba(255,255,255,.14)';
    for(let i=-2;i<7;i++){
      const x=((i*220-player.x*4)%((W+300))) - 150;
      const y=75+(i%3)*50;
      ctx.fillRect(x,y,90,12);ctx.fillRect(x+20,y-8,42,20);
    }
  }
  // Moon / sun.
  const h=timeOfDay();
  const isDay=h>=6&&h<19;
  const angle=((h-6)/13)*Math.PI;
  const sx=W*.5+Math.cos(angle)*W*.38;
  const sy=110-Math.sin(angle)*75;
  ctx.fillStyle=isDay?'#fff2a1':'#d8e8ff';ctx.fillRect(sx-10,sy-10,20,20);
  if(isNight()){
    ctx.fillStyle='rgba(255,255,255,.65)';
    for(let i=0;i<55;i++){const x=(hash(i,90)*W)|0,y=(hash(i,91)*H*.6)|0;ctx.fillRect(x,y,1+(i%2),1+(i%2))}
  }
}
function drawBlock(x,y,id){
  const sx=x*TILE-camera.x+W/2;
  const sy=y*TILE-camera.y+H/2;
  const b=BLOCKS[id];
  if(!b||id==='air')return;
  ctx.fillStyle=b.color;
  if(id==='water'||id==='lava'){
    ctx.globalAlpha=.68;
    ctx.fillRect(sx,sy,TILE+1,TILE+1);
    ctx.globalAlpha=1;
    ctx.fillStyle=id==='water'?'#79c7f2':'#ffad38';
    ctx.fillRect(sx,sy,TILE,3);
  } else {
    ctx.fillRect(sx,sy,TILE+1,TILE+1);
  }
  // Pixel textures.
  const r=hash(x,y);
  if(id==='dirt'||id==='grass'||id==='clay'||id==='sand'||id==='snow'){
    ctx.fillStyle='rgba(0,0,0,.10)';
    ctx.fillRect(sx+4+(r*7)|0,sy+8,3,3);
    ctx.fillRect(sx+15,sy+15,2,2);
  }
  if(id==='stone'||id==='deepslate'){
    ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(sx+4,sy+5,3,3);ctx.fillRect(sx+15,sy+14,4,3);
  }
  if(['coal','iron','gold','diamond','emerald'].includes(id)){
    ctx.fillStyle=b.color;ctx.fillRect(sx+5,sy+5,5,5);ctx.fillRect(sx+14,sy+13,4,4);
  }
  if(id==='wood'){ctx.fillStyle='#b27645';ctx.fillRect(sx+9,sy,5,TILE)}
  if(id==='leaf'){ctx.fillStyle='#58b85f';ctx.fillRect(sx+5,sy+5,5,5);ctx.fillRect(sx+14,sy+11,4,4)}
  if(id==='glass'){ctx.strokeStyle='rgba(255,255,255,.55)';ctx.strokeRect(sx+2,sy+2,TILE-4,TILE-4)}
  if(id==='torch'){
    ctx.fillStyle='#6f442a';ctx.fillRect(sx+11,sy+8,3,13);
    ctx.fillStyle='#fff0a0';ctx.fillRect(sx+8,sy+4,9,8);ctx.fillStyle='#ff8a32';ctx.fillRect(sx+10,sy+2,5,8);
  }
}
function drawWorld(){
  const minX=Math.floor((camera.x-W/2)/TILE)-2;
  const maxX=Math.ceil((camera.x+W/2)/TILE)+2;
  const minY=Math.floor((camera.y-H/2)/TILE)-2;
  const maxY=Math.ceil((camera.y+H/2)/TILE)+2;
  for(let x=minX;x<=maxX;x++)for(let y=Math.max(0,minY);y<=Math.min(WORLD_H-1,maxY);y++)drawBlock(x,y,getBlock(x,y));
}
function drawMobs(){
  for(const m of mobs){
    const sx=m.x*TILE-camera.x+W/2;
    const sy=m.y*TILE-camera.y+H/2;
    ctx.save();
    ctx.translate(sx,sy);
    if(m.type==='slime'){
      ctx.fillStyle='#5bd06d';ctx.fillRect(2,6,20,17);ctx.fillStyle='#dfffe2';ctx.fillRect(6,10,3,3);ctx.fillRect(15,10,3,3);
    } else if(m.type==='zombie'){
      ctx.fillStyle='#5b6c75';ctx.fillRect(4,3,16,14);ctx.fillStyle='#78985f';ctx.fillRect(3,17,18,23);ctx.fillStyle='#fff';ctx.fillRect(7,8,3,3);ctx.fillRect(15,8,3,3);
    } else {
      ctx.fillStyle='#34384c';ctx.fillRect(2,7,20,11);ctx.fillRect(7,2,10,21);ctx.fillStyle='#e8e0ff';ctx.fillRect(8,10,3,3);ctx.fillRect(15,10,3,3);
    }
    ctx.restore();
  }
}
function drawPlayerLike(p,isMe=false){
  const sx=p.x*TILE-camera.x+W/2;
  const sy=p.y*TILE-camera.y+H/2;
  ctx.save();
  ctx.globalAlpha=isMe && player.invuln>0 && Math.floor(player.invuln/5)%2===0?.45:1;
  ctx.fillStyle='#e7bd75';ctx.fillRect(sx+4,sy,TILE-8,13);
  ctx.fillStyle=p.color||'#74a8ff';ctx.fillRect(sx+3,sy+13,TILE-6,28);
  ctx.fillStyle='#202a3a';ctx.fillRect(sx+4,sy+41,TILE-9,7);
  ctx.fillStyle='#fff';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText(p.name||'Jogador',sx+12,sy-6);
  ctx.restore();
}
function drawParticles(){for(const p of particles){const sx=p.x*TILE-camera.x+W/2,sy=p.y*TILE-camera.y+H/2;ctx.globalAlpha=Math.max(0,p.life/35);ctx.fillStyle=p.color;ctx.fillRect(sx,sy,3,3)}ctx.globalAlpha=1}
function drawTarget(){
  const p=screenBlock(pointer.x||W/2,pointer.y||H/2);
  if(inReach(p.x,p.y)){
    const sx=p.x*TILE-camera.x+W/2,sy=p.y*TILE-camera.y+H/2;
    ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=2;ctx.strokeRect(sx+1,sy+1,TILE-2,TILE-2);ctx.lineWidth=1;
  }
}
function render(){
  const shake=camera.shake;
  camera.shake*=.84;
  const ox=(Math.random()-.5)*shake,oy=(Math.random()-.5)*shake;
  ctx.save();ctx.translate(ox,oy);
  drawBackground();drawWorld();drawMobs();
  for(const p of otherPlayers.values())drawPlayerLike(p);
  drawPlayerLike(player,true);drawParticles();drawTarget();
  ctx.restore();
}

function updateCamera(){
  const targetX=player.x*TILE;
  const targetY=(player.y+.65)*TILE;
  camera.x+=(targetX-camera.x)*.10;
  camera.y+=(targetY-camera.y)*.10;
  const maxY=WORLD_H*TILE-H/2;
  camera.y=Math.max(H/2-40,Math.min(maxY,camera.y));
}

function renderHotbar(){
  const el=document.querySelector('#hotbar');
  el.innerHTML=hotbar.map((id,i)=>`<button class="hotbar-slot ${i===selected?'sel':''}" data-i="${i}" title="${ITEMS[id]||id}"><small>${i+1}</small><span class="pixel-icon" style="--c:${BLOCKS[id]?.color||'#777'}"></span><b>${countItem(id)}</b></button>`).join('');
  el.querySelectorAll('.hotbar-slot').forEach(s=>s.onclick=()=>{selected=Number(s.dataset.i);renderHotbar()});
}
function renderInventory(){
  const grid=document.querySelector('#inventoryGrid');
  grid.innerHTML=inventory.map((s,i)=>`<button class="slot ${i===selected?'selected':''}" data-i="${i}">${s.id?`<span class="pixel-icon big" style="--c:${BLOCKS[s.id]?.color||'#777'}"></span><span class="count">${s.n}</span>`:''}</button>`).join('');
  grid.querySelectorAll('.slot').forEach(s=>s.onclick=()=>{
    const i=Number(s.dataset.i);if(!inventory[i].id)return;
    const id=inventory[i].id;const hot=hotbar.indexOf(id);
    if(hot>=0)selected=hot;else hotbar[selected]=id;
    renderHotbar();renderInventory();
  });
  const recipes=document.querySelector('#recipes');
  recipes.innerHTML=RECIPES.map((r,i)=>{
    const ok=Object.entries(r.need).every(([id,n])=>countItem(id)>=n);
    const need=Object.entries(r.need).map(([id,n])=>`${n} ${ITEMS[id]}`).join(' + ');
    return `<div class="recipe"><div><b>${r.label}</b><small>${need}</small></div><button data-r="${i}" ${ok?'':'disabled'}>Criar ${r.n}×</button></div>`;
  }).join('');
  recipes.querySelectorAll('button').forEach(b=>b.onclick=()=>craft(Number(b.dataset.r)));
}
function craft(i){
  const r=RECIPES[i];
  if(!Object.entries(r.need).every(([id,n])=>countItem(id)>=n))return;
  for(const [id,n] of Object.entries(r.need))removeItem(id,n);
  addItem(r.out,r.n);renderInventory();renderHotbar();toast(`Criado: ${ITEMS[r.out]}`);
}
function togglePanel(id){document.getElementById(id)?.classList.toggle('hidden')}
function closePanels(){document.querySelectorAll('.panel').forEach(p=>p.classList.add('hidden'))}
function toast(text){
  const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.remove('show'),1700);
}
function updateHUD(){
  document.querySelector('#hp').textContent=Math.ceil(player.hp);
  document.querySelector('#clock').textContent=clockText();
  const b=BIOME_INFO[biomeAt(Math.floor(player.x))]||BIOME_INFO.plains;
  document.querySelector('#biome').textContent=b.name;
  document.querySelector('#online').textContent=otherPlayers.size+1;
  document.querySelector('#night').textContent=isNight()?'NOITE':'DIA';
  document.querySelector('#coords').textContent=`X ${Math.floor(player.x)} • Y ${Math.floor(player.y)}`;
}

function saveLocal(){
  localStorage.setItem('vilaPlayerV3',JSON.stringify({x:player.x,y:player.y,hp:player.hp,inventory,hotbar,seed,gameTime}));
}
function loadLocal(){
  try{
    const saved=JSON.parse(localStorage.getItem('vilaPlayerV3')||'null');
    if(saved){
      player.x=Number.isFinite(saved.x)?saved.x:player.x;
      player.y=Number.isFinite(saved.y)?saved.y:player.y;
      player.hp=Number.isFinite(saved.hp)?saved.hp:100;
      inventory=Array.isArray(saved.inventory)&&saved.inventory.length===32?saved.inventory:inventory;
      hotbar=Array.isArray(saved.hotbar)&&saved.hotbar.length===8?saved.hotbar:hotbar;
      seed=Number.isFinite(saved.seed)?saved.seed:seed;
      gameTime=Number.isFinite(saved.gameTime)?saved.gameTime:gameTime;
      return true;
    }
  }catch(e){console.warn('save inválido',e)}
  return false;
}

function emitEdit(x,y,id){
  edits.set(blockKey(x,y),id);
  // Queue only after Firebase auth is available. Never block gameplay.
  if(firebaseReady && auth.currentUser){
    set(ref(db,`worldEdits/${x}_${y}`),{x,y,id,t:serverTimestamp(),uid:auth.currentUser.uid}).catch(()=>{});
  }
}
function subscribeWorldEdits(){
  if(!firebaseReady)return;
  onValue(ref(db,'worldEdits'),snap=>{
    const data=snap.val()||{};
    for(const value of Object.values(data)){
      if(!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y)))continue;
      const x=Number(value.x),y=Number(value.y),id=value.id;
      if(!BLOCKS[id])continue;
      edits.set(blockKey(x,y),id);
      if(Math.abs(x-player.x)<150)setBlock(x,y,id);
    }
  },()=>{});
}

async function connectPresence(uid,name){
  if(!auth || !db) throw new Error('Firebase indisponível');
  firebaseReady=true;
  player.uid=uid;player.name=name;
  presenceRef=ref(db,`players/${uid}`);
  try{
    await onDisconnect(presenceRef).remove();
    await set(presenceRef,{name,x:player.x,y:player.y,online:true,color:player.color,updated:serverTimestamp()});
  }catch(e){console.warn('presence offline',e)}
  onValue(ref(db,'players'),snap=>{
    const data=snap.val()||{};otherPlayers.clear();
    for(const [id,p] of Object.entries(data))if(id!==uid&&p&&p.online)otherPlayers.set(id,p);
    renderPlayersList();
  },()=>{});
  subscribeWorldEdits();
  startChatListener();
}
function renderPlayersList(){
  const list=document.querySelector('#playersList');
  list.innerHTML=`<div class="side-row"><span>🟢 ${escapeHtml(player.name)}</span><small>você</small></div>`+
    Array.from(otherPlayers.values()).map(p=>`<div class="side-row"><span>🟢 ${escapeHtml(p.name||'Jogador')}</span><small>online</small></div>`).join('');
}
function startChatListener(){
  if(chatListenerStarted)return;chatListenerStarted=true;
  onValue(ref(db,'chat'),snap=>{
    const data=snap.val()||{};
    const arr=Object.values(data).sort((a,b)=>(a.t||0)-(b.t||0)).slice(-80);
    const box=document.querySelector('#messages');
    box.innerHTML=arr.map(m=>`<div class="msg"><b>${escapeHtml(m.name||'Jogador')}</b><span>${escapeHtml(m.text||'')}</span></div>`).join('');
    box.scrollTop=box.scrollHeight;
  },()=>{});
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

async function sendChat(text){
  if(!text)return;
  if(!firebaseReady||!auth.currentUser){toast('Chat indisponível sem conexão');return}
  await push(ref(db,'chat'),{name:player.name,text:tidyChat(text),t:Date.now(),uid:auth.currentUser.uid}).catch(()=>toast('Não foi possível enviar'));
}
function tidyChat(s){return s.replace(/\s+/g,' ').slice(0,160)}

async function loginAccount(){
  const name=document.querySelector('#username').value.trim().replace(/[^a-zA-Z0-9_À-ÿ]/g,'').slice(0,16);
  const pw=document.querySelector('#password').value;
  if(name.length<3)return toast('Nome precisa ter 3+ caracteres');
  if(pw.length<6)return toast('Senha precisa ter 6+ caracteres');
  const email=name.toLowerCase()+'@login.vilarp.local';
  const btn=document.querySelector('#loginBtn');btn.disabled=true;btn.textContent='Entrando...';
  try{
    let credential;
    try{credential=await signInWithEmailAndPassword(auth,email,pw)}
    catch(first){credential=await createUserWithEmailAndPassword(auth,email,pw)}
    await connectPresence(credential.user.uid,name);
    closePanels();
    document.querySelector('#accountName').textContent=name;
    toast('Conta conectada');
  }catch(e){
    console.error(e);
    const code=e?.code||'';
    if(code.includes('operation-not-allowed'))toast('Ative E-mail/senha no Firebase');
    else toast('Login falhou: '+code.replace('auth/',''));
  }finally{btn.disabled=false;btn.textContent='Entrar / criar conta'}
}
async function enterGuest(){
  // IMPORTANT: entering the world does not depend on Firebase.
  const name='Visitante-'+Math.random().toString(36).slice(2,6).toUpperCase();
  player.name=name;
  document.querySelector('#accountName').textContent=name;
  closePanels();
  toast('Mundo carregado • visitante');
  try{
    const credential=await signInAnonymously(auth);
    await connectPresence(credential.user.uid,name);
  }catch(e){console.warn('Firebase visitante indisponível',e);toast('Você está jogando offline — Firebase não conectou')}
}

async function backgroundAuth(){
  if(!auth || !db){
    document.querySelector('#connection').textContent='LOCAL';
    document.querySelector('#connection').className='offline';
    return;
  }
  try{
    const credential=await signInAnonymously(auth);
    await connectPresence(credential.user.uid,player.name);
    document.querySelector('#connection').textContent='ONLINE';
    document.querySelector('#connection').className='online';
  }catch(e){
    document.querySelector('#connection').textContent='OFFLINE';
    document.querySelector('#connection').className='offline';
  }
}

if (auth) { onAuthStateChanged(auth,user=>{if(user)firebaseReady=true}); }

// UI events.
document.querySelector('#playersBtn').onclick=()=>togglePanel('playersPanel');
document.querySelector('#chatBtn').onclick=()=>togglePanel('chatPanel');
document.querySelector('#invBtn').onclick=()=>togglePanel('inventory');
document.querySelector('#accountBtn').onclick=()=>togglePanel('accountPanel');
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('.panel').classList.add('hidden'));
document.querySelector('#loginBtn').onclick=loginAccount;
document.querySelector('#guestBtn').onclick=enterGuest;
document.querySelector('#saveBtn').onclick=()=>{saveLocal();toast('Jogo salvo neste dispositivo')};
document.querySelector('#chatForm').onsubmit=e=>{e.preventDefault();const input=document.querySelector('#chatInput');const t=input.value.trim();input.value='';sendChat(t)};
document.querySelector('#breakBtn').onclick=()=>interact(0,W/2-65,H/2);
document.querySelector('#placeBtn').onclick=()=>interact(2,W/2+65,H/2);
document.querySelector('#attackBtn').onclick=attackMob;
document.querySelector('#invBtn2').onclick=()=>togglePanel('inventory');

addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.code.startsWith('Digit')){const n=Number(e.code.slice(5))-1;if(n>=0&&n<8){selected=n;renderHotbar()}}
  if(e.code==='KeyE')togglePanel('inventory');
  if(e.code==='KeyQ')attackMob();
  if(e.code==='Escape')closePanels();
});
addEventListener('keyup',e=>keys[e.code]=false);

document.querySelectorAll('[data-key]').forEach(btn=>{
  const k=btn.dataset.key;
  const down=e=>{e.preventDefault();touchKeys[k]=true};
  const up=e=>{e.preventDefault();touchKeys[k]=false};
  btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('pointerleave',up);
});

// Initial world MUST be ready before any network work.
const hadSave=loadLocal();
ensureAround(0);
if(!hadSave)findSpawn();
ensureAround(player.x);
giveStarter();
worldReady=true;
renderHotbar();renderInventory();renderPlayersList();
window.VILA_GAME_READY=true;
backgroundAuth();

function gameLoop(now){
  const dt=Math.min(32,now-last);last=now;
  gameTime+=dt*.75;
  saveTimer+=dt;networkTimer+=dt;liquidTimer+=dt;
  movePhysics(dt);
  updateMobs();
  updateParticles();
  updateCamera();
  if(liquidTimer>80){liquidTimer=0;simulateLiquids()}
  if(saveTimer>15000){saveTimer=0;saveLocal()}
  if(networkTimer>3500){
    networkTimer=0;
    if(firebaseReady&&auth.currentUser){
      update(ref(db,`players/${auth.currentUser.uid}`),{name:player.name,x:player.x,y:player.y,online:true,updated:serverTimestamp()}).catch(()=>{});
    }
  }
  updateHUD();render();
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
