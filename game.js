import * as THREE from './lib/three.module.min.js';

/* =====================================================================
   SurfHaven - endless rail runner
   ===================================================================== */

// ---------------------------------------------------------------- save
const SAVE_KEY = 'surfhaven_v1';
const DEFAULT_SAVE = { coins: 0, keys: 3, best: 0, char: 'haven', lv: { jet: 0, boots: 0, magnet: 0, mult: 0 }, sound: true, invincible: false };
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) return { ...DEFAULT_SAVE, ...s, lv: { ...DEFAULT_SAVE.lv, ...(s.lv || {}) } };
  } catch (e) { /* storage blocked */ }
  return JSON.parse(JSON.stringify(DEFAULT_SAVE));
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------- constants
const LANE_W = 2.6;
const LANES = [-LANE_W, 0, LANE_W];
const GRAV = 32;
const JUMP_V = 10.6;
const BOOT_V = 16.5;
const ROLL_T = 0.62;
const TRAIN_TOP = 3.2;
const CAR_LEN = 10;
const CAR_GAP = 0.45;
const RAMP_LEN = 6.5;
const SPAWN_AHEAD = 165;
const START_SPEED = 17;
const MAX_SPEED = 33;
const JET_Y = 7.2;
const MAX_LEVEL = 5;
const POWER_INFO = {
  jet:    { name: 'Jetpack',       icon: '🚀', desc: 'Fly over everything and grab sky coins' },
  boots:  { name: 'Jumping Boots', icon: '👟', desc: 'Super high jumps - reach the train roofs' },
  magnet: { name: 'Coin Magnet',   icon: '🧲', desc: 'Pulls in every coin around you' },
  mult:   { name: '2x Score',      icon: '✖️', desc: 'Doubles the score you earn' },
};
const powerDuration = k => 10 + save.lv[k] * 2.5;

// ---------------------------------------------------------------- characters
// Original cast. Each is built from simple blocks at runtime.
const CHARACTERS = [
  { id: 'haven',    name: 'Haven',       skin: '#c68a5c', top: '#f1f1f1', pants: '#1d2a4a', shoes: '#d62828', hair: '#2b1b12', extras: ['capBack', 'hoodDown'], cap: '#d62828' },
  { id: 'school',   name: 'School Boy',  skin: '#f3c9a3', top: '#1f3a7a', pants: '#5d6470', shoes: '#1c1c1c', hair: '#6b3f1f', extras: ['backpack', 'tie', 'collar'], pack: '#f4b400' },
  { id: 'tattoo',   name: 'Tattoo Girl', skin: '#e3a77d', top: '#161616', pants: '#3b6fb6', shoes: '#f5f5f5', hair: '#ff4fa3', extras: ['ponytail', 'tattoos', 'bareArms'] },
  { id: 'blackboy', name: 'Black Boy',   skin: '#4a2e1f', top: '#ff7a1a', pants: '#262626', shoes: '#ffffff', hair: '#111111', extras: ['hightop', 'chain', 'hoodDown'] },
  { id: 'void',     name: 'Void',        skin: '#0d0716', top: '#140a26', pants: '#0d0716', shoes: '#1a0f2e', hair: '#0d0716', extras: ['hoodUp', 'voidGlow'], trail: '#b04dff' },
  { id: 'blaze',    name: 'Blaze',       skin: '#b3121f', top: '#b3121f', pants: '#8f0e19', shoes: '#ffb300', hair: '#ffb300', extras: ['helmet', 'cape', 'flame', 'gloves'], cape: '#ff6a00', glove: '#ffb300', trail: '#ff8a1a' },
  { id: 'volt',     name: 'Volt',        skin: '#1565ff', top: '#1565ff', pants: '#0d3fae', shoes: '#ffe600', hair: '#0d3fae', extras: ['mask', 'cape', 'bolt', 'gloves', 'fins'], cape: '#0b2a7a', glove: '#ffe600', trail: '#5ce1ff' },
];
const charById = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];

// ---------------------------------------------------------------- renderer / scene
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const FOG_COLOR = 0xc4e4ff;
scene.fog = new THREE.Fog(FOG_COLOR, 75, 185);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 420);
camera.position.set(0, 2.2, 4.8);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 0.7 ? 74 : camera.aspect < 1.2 ? 64 : 54;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- helpers
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function weighted(list) { // [[item, weight], ...]
  let t = 0; for (const [, w] of list) t += w;
  let r = Math.random() * t;
  for (const [it, w] of list) { if ((r -= w) <= 0) return it; }
  return list[list.length - 1][0];
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
const matCache = new Map();
function lam(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...extra }));
  return matCache.get(key);
}
const geoCache = new Map();
function boxGeo(w, h, d) {
  const key = w + '|' + h + '|' + d;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

// ---------------------------------------------------------------- sky + lights
scene.background = canvasTex(4, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#1f63ff'); gr.addColorStop(0.45, '#58a8ff'); gr.addColorStop(0.7, '#a9d6ff'); gr.addColorStop(1, '#c4e4ff');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
scene.add(new THREE.HemisphereLight(0xd8ecff, 0x7a6450, 1.5));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
sun.position.set(6, 12, 5);
scene.add(sun);

// ---------------------------------------------------------------- static track
const GROUND_LEN = 420;
const TIE_LEN = 4;
const groundTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#8c7b69'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { // gravel speckles
    const s = rand(1, 3.2);
    g.fillStyle = pick(['#7a6a59', '#9c8b78', '#6d5e4f', '#a99886', '#80705f']);
    g.fillRect(rand(w), rand(h), s, s);
  }
  const ppu = w / 11; // pixels per world unit across
  for (const lx of LANES) {
    const cx = (lx + 5.5) * ppu;
    g.fillStyle = 'rgba(60,45,35,.35)';
    g.fillRect(cx - 1.25 * ppu, 0, 2.5 * ppu, h);
    for (let i = 0; i < 4; i++) {
      const y = (i + 0.5) * (h / 4);
      g.fillStyle = '#5b3a24'; g.fillRect(cx - 1.08 * ppu, y - 11, 2.16 * ppu, 22);
      g.fillStyle = '#7a4f31'; g.fillRect(cx - 1.08 * ppu, y - 11, 2.16 * ppu, 7);
      g.fillStyle = '#3c2616'; g.fillRect(cx - 1.08 * ppu, y + 8, 2.16 * ppu, 3);
    }
  }
}, true);
groundTex.repeat.set(1, GROUND_LEN / TIE_LEN);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(11, GROUND_LEN), new THREE.MeshLambertMaterial({ map: groundTex }));
ground.rotation.x = -Math.PI / 2;
ground.position.z = -GROUND_LEN / 2 + 30;
scene.add(ground);

const railMat = lam('#d7dde6', { emissive: '#2a2f38' });
const railGeo = new THREE.BoxGeometry(0.13, 0.2, GROUND_LEN);
for (const lx of LANES) for (const s of [-0.72, 0.72]) {
  const r = new THREE.Mesh(railGeo, railMat); r.position.set(lx + s, 0.1, ground.position.z); scene.add(r);
}

const WALL_LEN = 8;
const wallTex = canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#b9ada0'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(i * 128, 0, 4, h); }
  g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, h - 12, w, 12);
  g.fillStyle = '#d8cfc4'; g.fillRect(0, 0, w, 8);
  const tags = ['#ff4fa3', '#2f7bff', '#ffc21a', '#2fbf4a', '#8a2be2', '#ff6a00'];
  for (let i = 0; i < 3; i++) { // graffiti blobs
    g.save(); g.translate(rand(40, w - 40), rand(40, h - 30)); g.rotate(rand(-0.3, 0.3));
    g.fillStyle = pick(tags); g.strokeStyle = '#111'; g.lineWidth = 4;
    g.font = 'bold 44px Arial Black, Arial'; const word = pick(['SURF', 'HAVEN', 'RUN!', 'WOW', 'GO', 'ZAP']);
    g.strokeText(word, -50, 14); g.fillText(word, -50, 14); g.restore();
  }
}, true);
const wallMatL = new THREE.MeshLambertMaterial({ map: wallTex });
const wallTexR = wallTex.clone(); wallTexR.needsUpdate = true;
const wallMatR = new THREE.MeshLambertMaterial({ map: wallTexR });
wallTex.repeat.set(GROUND_LEN / WALL_LEN, 1); wallTexR.repeat.set(GROUND_LEN / WALL_LEN, 1);
const wallGeo = new THREE.PlaneGeometry(GROUND_LEN, 1.7);
const wallL = new THREE.Mesh(wallGeo, wallMatL); wallL.rotation.y = Math.PI / 2; wallL.position.set(-5.5, 0.85, ground.position.z); scene.add(wallL);
const wallR = new THREE.Mesh(wallGeo, wallMatR); wallR.rotation.y = -Math.PI / 2; wallR.position.set(5.5, 0.85, ground.position.z); scene.add(wallR);
for (const s of [-1, 1]) {
  const cap = box(0.5, 0.25, GROUND_LEN, lam('#d8cfc4'), s * 5.75, 1.75, ground.position.z); scene.add(cap);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, GROUND_LEN), lam('#5aa547'));
  grass.rotation.x = -Math.PI / 2; grass.position.set(s * 45.5, 0.01, ground.position.z); scene.add(grass);
}

// distant skyline (static backdrop)
{
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x7e9fe6, fog: false });
  const skyMat2 = new THREE.MeshBasicMaterial({ color: 0x95b4f0, fog: false });
  const g = new THREE.Group();
  for (let i = 0; i < 34; i++) {
    const w = rand(10, 22), h = rand(18, 75);
    const m = box(w, h, 8, i % 2 ? skyMat : skyMat2, rand(-170, 170), h / 2 - 2, -rand(300, 330));
    g.add(m);
  }
  scene.add(g);
}

// ---------------------------------------------------------------- pools
const pools = new Map();
function poolGet(key, factory) {
  let p = pools.get(key); if (!p) { p = []; pools.set(key, p); }
  const obj = p.pop() || factory();
  obj.visible = true;
  if (!obj.parent) scene.add(obj);
  return obj;
}
function poolPut(key, obj) { obj.visible = false; pools.get(key).push(obj); }

// ---------------------------------------------------------------- textures for props
const stripeTex = canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8323c';
  for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 24 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  g.strokeStyle = '#7a0f15'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
});
const TRAIN_COLORS = [
  { body: '#2f5bd3', stripe: '#ffc21a' },
  { body: '#e0313c', stripe: '#ffffff' },
  { body: '#2aa84a', stripe: '#ffe14d' },
  { body: '#7a3cc8', stripe: '#5ce1ff' },
  { body: '#ff8a1a', stripe: '#1d2a4a' },
];
function trainMaterials(c) {
  const side = canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = c.body; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, w, 20);
    g.fillStyle = c.stripe; g.fillRect(0, 112, w, 14);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 16, w, 16);
    for (let i = 0; i < 5; i++) { // windows
      const x = 22 + i * 98;
      g.fillStyle = '#1b1f3a'; g.fillRect(x - 3, 30, 72, 66);
      const gr = g.createLinearGradient(0, 33, 0, 93); gr.addColorStop(0, '#fff6c2'); gr.addColorStop(1, '#ffc93a');
      g.fillStyle = gr; g.fillRect(x, 33, 66, 60);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x + 6, 37, 12, 50);
    }
  });
  const front = canvasTex(128, 160, (g, w, h) => {
    g.fillStyle = c.body; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1f3a'; g.fillRect(12, 18, 104, 62);
    const gr = g.createLinearGradient(0, 20, 0, 78); gr.addColorStop(0, '#bfe6ff'); gr.addColorStop(1, '#6aa8e8');
    g.fillStyle = gr; g.fillRect(16, 22, 96, 54);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(22, 26, 18, 46);
    g.fillStyle = c.stripe; g.fillRect(0, 112, w, 14);
    g.fillStyle = '#fff8c4'; g.beginPath(); g.arc(28, 98, 10, 0, 7); g.arc(100, 98, 10, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, h - 16, w, 16);
  });
  const roof = lam('#9aa3b0');
  const s = new THREE.MeshLambertMaterial({ map: side });
  const f = new THREE.MeshLambertMaterial({ map: front });
  const fLit = new THREE.MeshLambertMaterial({ map: front, emissive: 0xfff2b0, emissiveIntensity: 0.25, emissiveMap: front });
  return { mats: [s, s, roof, lam('#222'), f, f], matsLit: [s, s, roof, lam('#222'), fLit, f] };
}
const trainMatSets = TRAIN_COLORS.map(trainMaterials);

// ---------------------------------------------------------------- prop factories
function makeCar(ci, lit) {
  const g = new THREE.Group();
  const set = trainMatSets[ci];
  const body = new THREE.Mesh(boxGeo(2.3, 2.85, CAR_LEN), lit ? set.matsLit : set.mats);
  body.position.y = 0.35 + 2.85 / 2; g.add(body);
  box(1.9, 0.35, CAR_LEN - 1.2, lam('#2a2a2e'), 0, 0.2, 0, g);
  box(2.0, 0.12, CAR_LEN - 0.4, lam('#c3c9d3'), 0, 3.26, 0, g);
  for (const wz of [-CAR_LEN / 2 + 1.4, CAR_LEN / 2 - 1.4]) for (const wx of [-0.9, 0.9]) box(0.2, 0.42, 0.7, lam('#111'), wx, 0.22, wz, g);
  if (lit) {
    const hl = new THREE.MeshBasicMaterial({ color: 0xfff6b0 });
    for (const hx of [-0.62, 0.62]) box(0.32, 0.22, 0.05, hl, hx, 1.12, CAR_LEN / 2 + 0.03, g);
  }
  return g;
}
function makeLow() {
  const g = new THREE.Group();
  const board = new THREE.Mesh(boxGeo(2.3, 0.5, 0.18), [lam('#ddd'), lam('#ddd'), lam('#ddd'), lam('#ddd'), new THREE.MeshLambertMaterial({ map: stripeTex }), new THREE.MeshLambertMaterial({ map: stripeTex })]);
  board.position.y = 0.78; g.add(board);
  for (const x of [-0.95, 0.95]) { box(0.14, 0.95, 0.14, lam('#e9e9e9'), x, 0.47, 0, g); box(0.45, 0.08, 0.6, lam('#666'), x, 0.04, 0, g); }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  box(0.16, 0.16, 0.16, lampMat, -0.95, 1.08, 0, g); box(0.16, 0.16, 0.16, lampMat, 0.95, 1.08, 0, g);
  return g;
}
function makeHigh() {
  const g = new THREE.Group();
  const sm = new THREE.MeshLambertMaterial({ map: stripeTex });
  const board = new THREE.Mesh(boxGeo(2.4, 0.75, 0.2), [lam('#ddd'), lam('#ddd'), lam('#ddd'), lam('#ddd'), sm, sm]);
  board.position.y = 1.95; g.add(board);
  for (const x of [-1.15, 1.15]) box(0.16, 2.5, 0.16, lam('#454b57'), x, 1.25, 0, g);
  const sign = canvasTex(128, 64, (c, w, h) => {
    c.fillStyle = '#ffc21a'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'bold 40px Arial Black, Arial';
    c.textAlign = 'center'; c.fillText('DUCK', w / 2, 48);
  });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshLambertMaterial({ map: sign }));
  s.position.set(0, 2.62, 0.11); g.add(s);
  return g;
}
function makeRamp() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(RAMP_LEN, 0); shape.lineTo(RAMP_LEN, TRAIN_TOP); shape.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false });
  geo.rotateY(Math.PI / 2);
  geo.translate(-1.1, 0, 0);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, lam('#8a95a5')));
  // grip strips on the slope
  const ang = Math.atan2(TRAIN_TOP, RAMP_LEN);
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const s = box(2.2, 0.05, 0.16, lam('#ffc21a'), 0, t * TRAIN_TOP + 0.03, -t * RAMP_LEN, g);
    s.rotation.x = ang;
  }
  return g;
}
function makePalm() {
  const g = new THREE.Group();
  const trunkMat = lam('#8b5a2b');
  let y = 0, x = 0; const lean = rand(-0.12, 0.12);
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22 - i * 0.015, 0.26 - i * 0.015, 1.25, 7), i % 2 ? trunkMat : lam('#9c6a38'));
    seg.position.set(x, y + 0.62, 0); seg.rotation.z = -lean * i * 0.6; g.add(seg);
    y += 1.2; x += lean * i * 0.7;
  }
  const leafMat = lam('#2fae3a'), leafMat2 = lam('#249a31');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.Mesh(boxGeo(0.55, 0.08, 2.6), i % 2 ? leafMat : leafMat2);
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); pivot.rotation.y = a;
    leaf.position.set(0, -0.35, 1.2); leaf.rotation.x = 0.45; pivot.add(leaf); g.add(pivot);
  }
  box(0.5, 0.5, 0.5, lam('#6b4a2a'), x, y - 0.1, 0, g);
  return g;
}
const BUILDING_COLORS = ['#6a4cc4', '#3b62d6', '#e07a3a', '#d14b6f', '#3aa39a', '#f0b429'];
const buildingMats = BUILDING_COLORS.map(col => {
  const t = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, 0, w, 10);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
      g.fillStyle = Math.random() < 0.45 ? '#ffe7a0' : 'rgba(20,24,60,.55)';
      g.fillRect(12 + c * 29, 18 + r * 29, 18, 18);
    }
  });
  const m = new THREE.MeshLambertMaterial({ map: t });
  return [m, m, lam('#55506a'), m, m, m];
});
function makeBuilding() {
  const m = new THREE.Mesh(boxGeo(1, 1, 1), pick(buildingMats));
  const g = new THREE.Group(); g.add(m); g.userData.m = m; return g;
}
function makeBridge() {
  const g = new THREE.Group();
  box(46, 1.3, 4.2, lam('#4b5bd6'), 0, 9.2, 0, g);
  box(46, 0.9, 0.3, lam('#3c48b8'), 0, 10.3, -1.95, g);
  box(46, 0.9, 0.3, lam('#3c48b8'), 0, 10.3, 1.95, g);
  for (const x of [-7.2, 7.2]) box(1.4, 8.6, 2.2, lam('#3c48b8'), x, 4.3, 0, g);
  const lightM = new THREE.MeshBasicMaterial({ color: 0xffe7a0 });
  for (let i = -3; i <= 3; i++) box(0.8, 0.3, 0.1, lightM, i * 2.4, 8.7, 2.11, g);
  return g;
}

// coin (instanced)
const coinFace = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(48, 44, 6, 64, 64, 64);
  gr.addColorStop(0, '#fff7b0'); gr.addColorStop(0.5, '#ffc21a'); gr.addColorStop(1, '#e08a00');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#b86d00'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.stroke();
  g.fillStyle = '#d98200'; // crown
  g.beginPath(); g.moveTo(34, 84); g.lineTo(30, 46); g.lineTo(48, 62); g.lineTo(64, 38); g.lineTo(80, 62); g.lineTo(98, 46); g.lineTo(94, 84); g.closePath(); g.fill();
  g.fillStyle = '#fff1a0'; g.fillRect(36, 74, 56, 6);
});
const COIN_CAP = 700;
const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.11, 22);
coinGeo.rotateX(Math.PI / 2);
const coinSideMat = new THREE.MeshLambertMaterial({ color: 0xe9a300, emissive: 0x5a3a00 });
const coinFaceMat = new THREE.MeshLambertMaterial({ map: coinFace, emissive: 0x6a4800, emissiveIntensity: 0.6 });
const coinMesh = new THREE.InstancedMesh(coinGeo, [coinSideMat, coinFaceMat, coinFaceMat], COIN_CAP);
coinMesh.frustumCulled = false;
coinMesh.count = 0;
scene.add(coinMesh);
const dummy = new THREE.Object3D();

// glow sprite
const glowTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.4, 'rgba(255,240,150,.5)'); gr.addColorStop(1, 'rgba(255,220,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1); return s;
}

// power-up models
function makeJetpackModel(scale = 1) {
  const g = new THREE.Group();
  const red = lam('#d32f2f'), silver = lam('#cfd6df', { emissive: '#222' });
  for (const x of [-0.15, 0.15]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.62, 10), red); t.position.set(x, 0, 0); g.add(t);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), silver); cap.position.set(x, 0.31, 0); g.add(cap);
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.14, 10), silver); noz.position.set(x, -0.37, 0); g.add(noz);
  }
  box(0.44, 0.4, 0.08, lam('#444'), 0, 0, -0.12, g);
  const flames = [];
  const fm = new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9 });
  for (const x of [-0.15, 0.15]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8), fm); f.rotation.x = Math.PI; f.position.set(x, -0.66, 0); g.add(f); flames.push(f);
  }
  g.userData.flames = flames;
  g.scale.setScalar(scale);
  return g;
}
function makeBootsModel() {
  const g = new THREE.Group();
  const green = lam('#39e26a', { emissive: '#0d5a22' });
  for (const x of [-0.22, 0.22]) {
    box(0.28, 0.4, 0.3, green, x, 0.1, 0, g);
    box(0.3, 0.18, 0.55, green, x, -0.12, -0.12, g);
    box(0.32, 0.06, 0.58, lam('#ffffff'), x, -0.23, -0.12, g);
    const wing = box(0.04, 0.22, 0.32, lam('#ffffff', { emissive: '#666' }), x + (x > 0 ? 0.18 : -0.18), 0.18, 0.08, g);
    wing.rotation.x = -0.5;
  }
  return g;
}
function makeMagnetModel() {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 18, Math.PI), lam('#e8323c', { emissive: '#4a0000' }));
  g.add(t);
  for (const x of [-0.32, 0.32]) {
    box(0.24, 0.22, 0.24, lam('#e8323c', { emissive: '#4a0000' }), x, -0.1, 0, g);
    box(0.25, 0.16, 0.25, lam('#e6ebf2', { emissive: '#333' }), x, -0.28, 0, g);
  }
  return g;
}
function makeMultModel() {
  const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ff8a00'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
    g.lineWidth = 8; g.strokeStyle = '#0d1330'; g.stroke();
    g.font = 'bold 60px Arial Black, Arial'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = '#0d1330'; g.lineWidth = 6;
    g.strokeText('2X', 64, 86); g.fillText('2X', 64, 86);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t }));
  s.scale.set(1.1, 1.1, 1);
  const g = new THREE.Group(); g.add(s); g.userData.noSpin = true; return g;
}
function makeKeyModel() {
  const g = new THREE.Group();
  const gold = lam('#ffd23a', { emissive: '#6a4a00' }), purple = lam('#8a2be2', { emissive: '#2a0050' });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 18), purple); ring.position.y = 0.32; g.add(ring);
  box(0.09, 0.62, 0.09, gold, 0, -0.08, 0, g);
  box(0.2, 0.08, 0.09, gold, 0.1, -0.3, 0, g);
  box(0.15, 0.08, 0.09, gold, 0.08, -0.16, 0, g);
  return g;
}
const PICKUP_FACTORY = { jet: () => makeJetpackModel(1.15), boots: makeBootsModel, magnet: makeMagnetModel, mult: makeMultModel, key: makeKeyModel };
const PICKUP_GLOW = { jet: 0xff9a40, boots: 0x6aff8a, magnet: 0xff6060, mult: 0xffc040, key: 0xc080ff };

// ---------------------------------------------------------------- character builder
const tattooTexCache = {};
function tattooMat(skin) {
  if (!tattooTexCache[skin]) {
    const t = canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = skin; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#1a1a2e'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(8, 10); g.bezierCurveTo(50, 20, 10, 40, 52, 52); g.stroke();
      g.beginPath(); g.arc(30, 76, 12, 0, 7); g.stroke();
      g.fillStyle = '#e8323c'; g.beginPath(); g.arc(30, 76, 6, 0, 7); g.fill();
      g.beginPath(); g.moveTo(10, 100); g.lineTo(54, 96); g.moveTo(14, 112); g.lineTo(50, 110); g.stroke();
      g.fillStyle = '#2f7bff'; g.fillRect(40, 28, 10, 10);
    });
    tattooTexCache[skin] = new THREE.MeshLambertMaterial({ map: t });
  }
  return tattooTexCache[skin];
}
function emblemMat(kind) {
  const t = canvasTex(64, 64, (g) => {
    if (kind === 'flame') {
      g.fillStyle = '#ffb300'; g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(56, 26, 52, 52, 32, 60); g.bezierCurveTo(12, 52, 8, 30, 24, 18);
      g.bezierCurveTo(24, 30, 30, 34, 32, 4); g.fill();
      g.fillStyle = '#fff3b0'; g.beginPath(); g.moveTo(32, 26); g.bezierCurveTo(44, 40, 40, 54, 32, 56); g.bezierCurveTo(24, 54, 22, 42, 32, 26); g.fill();
    } else {
      g.fillStyle = '#0d1330'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
      g.fillStyle = '#ffe600'; g.beginPath(); g.moveTo(38, 4); g.lineTo(16, 36); g.lineTo(30, 36); g.lineTo(24, 60); g.lineTo(48, 26); g.lineTo(34, 26); g.closePath(); g.fill();
    }
  });
  return new THREE.MeshBasicMaterial({ map: t, transparent: true });
}

function buildCharacter(def) {
  const root = new THREE.Group();
  const pivot = new THREE.Group(); pivot.position.y = 0.95; root.add(pivot);
  const model = new THREE.Group(); model.position.y = -0.95; pivot.add(model);
  const has = k => def.extras.includes(k);
  const skin = lam(def.skin), top = lam(def.top), pants = lam(def.pants), shoes = lam(def.shoes), hair = lam(def.hair);
  const glow = has('voidGlow');
  const accent = glow ? lam('#b04dff', { emissive: '#8a2be2', emissiveIntensity: 1.2 }) : null;
  const shoeMeshes = [];

  const mkLeg = x => {
    const p = new THREE.Group(); p.position.set(x, 0.8, 0); model.add(p);
    box(0.27, 0.64, 0.29, pants, 0, -0.32, 0, p);
    shoeMeshes.push(box(0.3, 0.18, 0.44, shoes, 0, -0.71, -0.06, p));
    box(0.31, 0.05, 0.46, lam(glow ? '#3a1a66' : '#f4f4f4'), 0, -0.79, -0.06, p);
    if (glow) box(0.05, 0.5, 0.3, accent, x > 0 ? 0.14 : -0.14, -0.35, 0, p);
    return p;
  };
  const legL = mkLeg(-0.155), legR = mkLeg(0.155);
  const torso = box(0.66, 0.74, 0.37, top, 0, 1.17, 0, model);
  const armMat = has('bareArms') ? (has('tattoos') ? tattooMat(def.skin) : skin) : top;
  const handMat = has('gloves') ? lam(def.glove) : skin;
  const mkArm = x => {
    const p = new THREE.Group(); p.position.set(x, 1.47, 0); model.add(p);
    box(0.21, 0.58, 0.23, armMat, 0, -0.27, 0, p);
    box(0.19, 0.17, 0.21, handMat, 0, -0.63, 0, p);
    if (glow) box(0.22, 0.05, 0.24, accent, 0, -0.5, 0, p);
    return p;
  };
  const armL = mkArm(-0.44), armR = mkArm(0.44);
  const head = new THREE.Group(); head.position.set(0, 1.54, 0); model.add(head);
  box(0.2, 0.08, 0.2, skin, 0, 0.02, 0, head);
  box(0.52, 0.5, 0.48, skin, 0, 0.3, 0, head);
  const eyeMat = glow ? new THREE.MeshBasicMaterial({ color: 0xd68aff }) : lam('#151515');
  const eyeW = glow ? 0.12 : 0.075;
  box(eyeW, glow ? 0.06 : 0.1, 0.02, eyeMat, -0.12, 0.33, -0.245, head);
  box(eyeW, glow ? 0.06 : 0.1, 0.02, eyeMat, 0.12, 0.33, -0.245, head);
  if (!glow && !has('helmet')) box(0.16, 0.035, 0.02, lam('#6b2a20'), 0, 0.17, -0.245, head);

  // hair (default short)
  if (!has('hoodUp') && !has('helmet') && !has('hightop')) {
    box(0.54, 0.14, 0.5, hair, 0, 0.58, 0.01, head);
    box(0.54, 0.34, 0.08, hair, 0, 0.4, 0.22, head);
    box(0.06, 0.2, 0.42, hair, -0.27, 0.45, 0.03, head); box(0.06, 0.2, 0.42, hair, 0.27, 0.45, 0.03, head);
  }
  if (has('capBack')) {
    box(0.56, 0.17, 0.52, lam(def.cap), 0, 0.62, 0.01, head);
    box(0.42, 0.05, 0.26, lam(def.cap), 0, 0.56, 0.36, head);
    box(0.1, 0.06, 0.1, lam('#fff'), 0, 0.72, 0.01, head);
  }
  if (has('hoodDown')) box(0.6, 0.2, 0.22, lam(def.top === '#f1f1f1' ? '#dcdcdc' : '#e0661a'), 0, 1.5, 0.2, model);
  if (has('backpack')) {
    box(0.52, 0.58, 0.24, lam(def.pack), 0, 1.15, 0.3, model);
    box(0.4, 0.22, 0.06, lam('#d49a00'), 0, 1.0, 0.44, model);
  }
  if (has('tie')) box(0.1, 0.42, 0.02, lam('#c62828'), 0, 1.25, -0.195, model);
  if (has('collar')) { box(0.34, 0.1, 0.02, lam('#ffffff'), 0, 1.49, -0.19, model); }
  if (has('ponytail')) {
    box(0.54, 0.14, 0.5, hair, 0, 0.58, 0.01, head);
    const pt = box(0.18, 0.5, 0.18, hair, 0, 0.3, 0.36, head); pt.rotation.x = 0.35;
    box(0.2, 0.08, 0.2, lam('#ffffff'), 0, 0.52, 0.3, head);
  }
  if (has('hightop')) {
    box(0.48, 0.34, 0.46, hair, 0, 0.7, 0.01, head);
    box(0.54, 0.1, 0.5, hair, 0, 0.5, 0.01, head);
  }
  if (has('chain')) {
    const gold = lam('#ffd23a', { emissive: '#5a4000' });
    box(0.36, 0.045, 0.02, gold, 0, 1.4, -0.192, model); box(0.04, 0.16, 0.02, gold, -0.16, 1.34, -0.192, model); box(0.04, 0.16, 0.02, gold, 0.16, 1.34, -0.192, model);
    box(0.36, 0.045, 0.02, gold, 0, 1.27, -0.192, model); box(0.1, 0.12, 0.025, gold, 0, 1.2, -0.195, model);
  }
  if (has('hoodUp')) {
    box(0.62, 0.62, 0.5, top, 0, 0.33, 0.06, head);
    box(0.62, 0.12, 0.08, top, 0, 0.6, -0.2, head);
  }
  if (glow) {
    box(0.06, 0.6, 0.02, accent, 0, 1.18, -0.192, model);
    box(0.5, 0.05, 0.02, accent, 0, 1.4, -0.192, model);
    box(0.5, 0.05, 0.02, accent, 0, 1.4, 0.192, model);
  }
  if (has('helmet')) {
    box(0.56, 0.32, 0.52, lam(def.hair), 0, 0.48, 0.01, head);
    box(0.44, 0.13, 0.03, new THREE.MeshBasicMaterial({ color: 0x1a1a2e }), 0, 0.33, -0.25, head);
    box(0.4, 0.04, 0.035, new THREE.MeshBasicMaterial({ color: 0xff8a1a }), 0, 0.33, -0.255, head);
    box(0.08, 0.2, 0.3, lam(def.hair), 0, 0.68, 0.0, head);
  }
  if (has('mask')) {
    box(0.54, 0.16, 0.03, lam('#ffe600'), 0, 0.34, -0.245, head);
    box(0.09, 0.06, 0.02, new THREE.MeshBasicMaterial({ color: 0xffffff }), -0.12, 0.34, -0.262, head);
    box(0.09, 0.06, 0.02, new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.12, 0.34, -0.262, head);
  }
  if (has('fins')) {
    for (const x of [-0.29, 0.29]) { const f = box(0.04, 0.26, 0.18, lam('#ffe600'), x, 0.5, 0.05, head); f.rotation.x = -0.4; }
  }
  if (has('flame') || has('bolt')) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), emblemMat(has('flame') ? 'flame' : 'bolt'));
    e.rotation.y = Math.PI; e.position.set(0, 1.22, -0.188); model.add(e);
  }
  if (has('gloves')) { /* gloves via handMat */ }
  let cape = null;
  if (has('cape')) {
    cape = new THREE.Group(); cape.position.set(0, 1.5, 0.2); model.add(cape);
    box(0.66, 1.15, 0.04, lam(def.cape), 0, -0.56, 0, cape);
    box(0.7, 0.08, 0.06, lam(def.cape), 0, 0, 0, cape);
  }

  const jet = makeJetpackModel(0.9);
  jet.position.set(0, 1.16, 0.32); jet.visible = false; model.add(jet);

  // blob shadow
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;

  root.scale.setScalar(0.9);
  return { root, pivot, model, legL, legR, armL, armR, head, torso, cape, jet, shoeMeshes, shoeMat: shoes, shadow, def };
}

// ---------------------------------------------------------------- drone chaser
function makeDrone() {
  const g = new THREE.Group();
  box(0.9, 0.35, 0.9, lam('#2c3240'), 0, 0, 0, g);
  box(0.5, 0.2, 0.5, lam('#4a5366'), 0, 0.25, 0, g);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  eye.position.set(0, -0.05, -0.46); g.add(eye);
  const rotors = [];
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    const arm = box(0.12, 0.08, 1.0, lam('#2c3240'), x / 2, 0.05, z / 2, g); arm.rotation.y = Math.atan2(x, z);
    const r = box(0.9, 0.03, 0.1, lam('#aab3c5'), x, 0.2, z, g); rotors.push(r);
  }
  const siren = glowSprite(0xff3030, 1.6); siren.position.set(0, 0.5, 0); g.add(siren);
  g.userData = { rotors, siren };
  return g;
}
const drone = makeDrone();
drone.visible = false;
scene.add(drone);

// ---------------------------------------------------------------- particles
const PART_GEO = new THREE.BoxGeometry(0.14, 0.14, 0.14);
const partMats = {};
const partMat = c => partMats[c] || (partMats[c] = new THREE.MeshBasicMaterial({ color: c, transparent: true }));
const particles = [];
function emit(x, y, z, color, vx = 0, vy = 0, vz = 0, life = 0.6, size = 1) {
  let p = particles.find(q => !q.alive);
  if (!p) {
    if (particles.length > 120) return;
    p = { mesh: new THREE.Mesh(PART_GEO, partMat(color)) }; scene.add(p.mesh); particles.push(p);
  }
  p.mesh.material = partMat(color);
  Object.assign(p, { alive: true, x, y, z, vx, vy, vz, life, max: life, size });
  p.mesh.visible = true;
}
function updateParticles(dt, dist) {
  for (const p of particles) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; p.mesh.visible = false; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const k = p.life / p.max;
    p.mesh.position.set(p.x, p.y, -(p.z - dist));
    p.mesh.scale.setScalar(p.size * (0.3 + 0.7 * k));
    p.mesh.material.opacity = k;
  }
}

// ---------------------------------------------------------------- audio
const Sound = {
  ctx: null, master: null, musicGain: null, nextNote: 0, step: 0, playing: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = save.sound ? 0.6 : 0; this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.35; this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate * 0.3; const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    setInterval(() => this.schedule(), 30);
  },
  setOn(on) { if (this.master) this.master.gain.value = on ? 0.6 : 0; },
  tone(freq, dur, type = 'square', vol = 0.15, slide, when = 0, dest) {
    if (!this.ctx || !save.sound) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  noiseHit(dur, vol, when = 0, hp = 4000, dest) {
    if (!this.ctx || !save.sound) return;
    const t = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t); s.stop(t + dur);
  },
  coin() { this.tone(1318, 0.07, 'square', 0.05); this.tone(1976, 0.12, 'square', 0.05, null, 0.05); },
  jump() { this.tone(320, 0.18, 'square', 0.08, 760); },
  roll() { this.noiseHit(0.22, 0.12, 0, 800); this.tone(300, 0.18, 'triangle', 0.1, 110); },
  swipe() { this.noiseHit(0.08, 0.05, 0, 3000); },
  power() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'square', 0.07, null, i * 0.07)); },
  key() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.12, null, i * 0.06)); },
  crash() { this.noiseHit(0.5, 0.35, 0, 200); this.tone(160, 0.5, 'sawtooth', 0.15, 40); },
  stumble() { this.noiseHit(0.2, 0.2, 0, 600); this.tone(220, 0.2, 'square', 0.08, 120); },
  // tiny looping beat
  BASS: [45, 0, 45, 0, 48, 0, 45, 0, 43, 0, 43, 0, 40, 0, 43, 0],
  schedule() {
    if (!this.ctx || !this.playing || !save.sound) return;
    const spb = 60 / 128 / 4;
    while (this.nextNote < this.ctx.currentTime + 0.12) {
      const when = this.nextNote - this.ctx.currentTime;
      const s = this.step % 16;
      if (s % 4 === 0) this.tone(150, 0.16, 'sine', 0.5, 45, when, this.musicGain);
      if (s % 4 === 2) this.noiseHit(0.05, 0.12, when, 7000, this.musicGain);
      if (s === 4 || s === 12) this.noiseHit(0.12, 0.18, when, 1800, this.musicGain);
      const n = this.BASS[s]; if (n) this.tone(440 * Math.pow(2, (n - 57) / 12), 0.2, 'square', 0.07, null, when, this.musicGain);
      if (this.step % 32 === 0) [69, 72, 76].forEach((m, i) => this.tone(440 * Math.pow(2, (m - 57) / 12), 0.12, 'triangle', 0.05, null, when + i * spb * 2, this.musicGain));
      this.nextNote += spb; this.step++;
    }
  },
  startMusic() { if (!this.ctx) return; this.playing = true; this.nextNote = this.ctx.currentTime + 0.05; },
  stopMusic() { this.playing = false; },
};

// ---------------------------------------------------------------- world state
const world = {
  dist: 0, speed: START_SPEED, spawnZ: 60, laneFree: [0, 0, 0], hardUntil: [0, 0, 0],
  nextPower: 160, score: 0, coins: 0, time: 0, saves: 0,
  palmZ: [0, 0], buildZ: [0, 0], bridgeZ: 120,
};
const obstacles = [];
const coins = [];
const pickups = [];
const sceneryItems = [];

const player = {
  lane: 1, prevLane: 1, x: 0, y: 0, vy: 0, grounded: true, rolling: 0, jumpHeld: false,
  jet: 0, jetMax: 1, boots: 0, bootsMax: 1, magnet: 0, magnetMax: 1, mult: 0, multMax: 1,
  invuln: 0, stumble: 0, anim: 0, dead: false, deathT: 0, caught: false,
};
let hero = null;

function setHero(id) {
  if (hero) { scene.remove(hero.root); scene.remove(hero.shadow); }
  hero = buildCharacter(charById(id));
  scene.add(hero.root); scene.add(hero.shadow);
}
setHero(save.char);

// ---------------------------------------------------------------- spawning
function addObstacle(o) { obstacles.push(o); return o; }
function addCoin(x, y, z) {
  if (coins.length >= COIN_CAP) return;
  coins.push({ x, y, z, att: false, spin: rand(6.28) });
}
function coinLine(L, z0, n, y = 0.95, step = 2.3) { for (let i = 0; i < n; i++) addCoin(LANES[L], y, z0 + i * step); }
function coinArc(L, zc, base = 0.95) {
  for (let i = 0; i < 7; i++) { const t = i / 6; addCoin(LANES[L], base + 1.55 * (1 - Math.pow(t * 2 - 1, 2)), zc - 6 + t * 12); }
}

function releaseObstacle(o) { for (const [k, m] of o.parts) poolPut(k, m); }

function placeTrain(L, z, cars, opts = {}) {
  const ci = randi(0, TRAIN_COLORS.length - 1);
  const lit = !!opts.moving;
  const key = 'car' + ci + (lit ? 'L' : '');
  const parts = [];
  const len = cars * (CAR_LEN + CAR_GAP) - CAR_GAP;
  for (let i = 0; i < cars; i++) {
    const m = poolGet(key, () => makeCar(ci, lit));
    parts.push([key, m]);
    m.userData.off = i * (CAR_LEN + CAR_GAP) + CAR_LEN / 2;
  }
  return addObstacle({ type: 'train', L, x: LANES[L], z0: z, z1: z + len, top: TRAIN_TOP, halfW: 1.15, parts, vz: opts.moving ? opts.vz : 0 });
}

function laneClearAhead(L) {
  for (const o of obstacles) if (o.L === L && o.z1 > world.dist - 2) return false;
  return true;
}
function movingActive() { return obstacles.some(o => o.vz > 0 && o.z1 > world.dist - 5); }

function canHard(L, z) {
  if (L === 1) return world.hardUntil[0] <= z && world.hardUntil[2] <= z;
  return world.hardUntil[1] <= z;
}

function spawnRow(z) {
  const d = clamp(world.dist / 4500, 0, 1);
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  const r = Math.random();
  const nObs = r < 0.22 ? 1 : r < 0.75 ? 2 : 3;
  let used = 0;
  const empty = [];
  for (const L of lanes) {
    if (world.laneFree[L] > z) continue;
    if (used >= nObs) { empty.push(L); continue; }
    const opts = [['low', 3], ['high', 2.2], ['ramp', 1.6 + d]];
    if (canHard(L, z)) opts.push(['train', 3.2 + d * 2]);
    if (L !== 1 && world.dist > 250 && world.hardUntil[1] <= world.dist && !movingActive() && laneClearAhead(L)) opts.push(['moving', 1.2 + d * 2.5]);
    const type = weighted(opts);
    used++;
    if (type === 'low') {
      const m = poolGet('low', makeLow);
      addObstacle({ type: 'low', L, x: LANES[L], z0: z - 0.2, z1: z + 0.2, top: 1.05, bottom: 0, halfW: 1.15, parts: [['low', m]] });
      if (Math.random() < 0.6) coinArc(L, z);
      world.laneFree[L] = z + 9;
    } else if (type === 'high') {
      const m = poolGet('high', makeHigh);
      addObstacle({ type: 'high', L, x: LANES[L], z0: z - 0.2, z1: z + 0.2, top: 2.6, bottom: 1.45, halfW: 1.2, parts: [['high', m]] });
      if (Math.random() < 0.5) coinLine(L, z - 4.6, 5, 0.55);
      world.laneFree[L] = z + 9;
    } else if (type === 'train') {
      const cars = randi(1, d > 0.4 ? 3 : 2);
      const o = placeTrain(L, z, cars);
      world.hardUntil[L] = o.z1;
      world.laneFree[L] = o.z1 + rand(5, 10);
      if (Math.random() < 0.35) coinLine(L, z + 2, Math.floor((o.z1 - z - 2) / 2.3), TRAIN_TOP + 0.95);
    } else if (type === 'ramp') {
      const rm = poolGet('ramp', makeRamp);
      addObstacle({ type: 'ramp', L, x: LANES[L], z0: z, z1: z + RAMP_LEN, top: TRAIN_TOP, halfW: 1.1, parts: [['ramp', rm]] });
      const o = placeTrain(L, z + RAMP_LEN, randi(2, 3));
      world.hardUntil[L] = o.z1;
      world.laneFree[L] = o.z1 + rand(5, 10);
      for (let i = 0; i < 3; i++) { const t = (i + 0.5) / 3; addCoin(LANES[L], t * TRAIN_TOP + 0.95, z + t * RAMP_LEN); }
      coinLine(L, z + RAMP_LEN + 1.5, Math.floor((o.z1 - z - RAMP_LEN - 2) / 2.3), TRAIN_TOP + 0.95);
    } else if (type === 'moving') {
      const o = placeTrain(L, z + 30, randi(1, 2), { moving: true, vz: 8 + d * 6 });
      world.hardUntil[L] = o.z1;
      world.laneFree[L] = o.z1 + 12;
    }
  }
  for (const L of empty) if (Math.random() < 0.5) coinLine(L, z - 3, randi(5, 8));

  if (z >= world.nextPower && empty.length) {
    const L = empty[0];
    const kind = weighted([['magnet', 30], ['jet', 18], ['boots', 22], ['mult', 20], ['key', 10]]);
    const m = poolGet('pu-' + kind, () => {
      const g = new THREE.Group(); const inner = PICKUP_FACTORY[kind](); g.add(inner);
      g.add(glowSprite(PICKUP_GLOW[kind], 2.2)); g.userData.inner = inner; return g;
    });
    pickups.push({ kind, x: LANES[L], y: 1.1, z: z + 6, mesh: m });
    world.nextPower = z + rand(260, 420);
  }
}

function spawnScenery(upTo) {
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1;
    while (world.palmZ[s] < upTo) {
      const m = poolGet('palm', makePalm);
      sceneryItems.push({ key: 'palm', mesh: m, x: side * rand(6.6, 7.6), z: world.palmZ[s], ry: rand(6.28) });
      world.palmZ[s] += rand(9, 18);
    }
    while (world.buildZ[s] < upTo) {
      const m = poolGet('bld', makeBuilding);
      const w = rand(7, 11), h = rand(9, 26), dpt = rand(8, 13);
      m.userData.m.scale.set(w, h, dpt); m.userData.m.position.y = h / 2;
      m.userData.m.material = pick(buildingMats);
      sceneryItems.push({ key: 'bld', mesh: m, x: side * (10.5 + w / 2 + rand(0, 3)), z: world.buildZ[s] + dpt / 2, ry: 0, len: dpt });
      world.buildZ[s] += dpt + rand(1, 5);
    }
  }
  while (world.bridgeZ < upTo) {
    const m = poolGet('bridge', makeBridge);
    sceneryItems.push({ key: 'bridge', mesh: m, x: 0, z: world.bridgeZ, ry: 0 });
    world.bridgeZ += rand(220, 380);
  }
}

function clearWorld() {
  for (const o of obstacles) releaseObstacle(o);
  obstacles.length = 0;
  coins.length = 0;
  for (const p of pickups) poolPut('pu-' + p.kind, p.mesh);
  pickups.length = 0;
  for (const s of sceneryItems) poolPut(s.key, s.mesh);
  sceneryItems.length = 0;
  for (const p of particles) { p.alive = false; p.mesh.visible = false; }
}

function resetRun() {
  clearWorld();
  Object.assign(world, {
    dist: 0, speed: START_SPEED, spawnZ: 55, laneFree: [0, 0, 0], hardUntil: [0, 0, 0],
    nextPower: 140, score: 0, coins: 0, time: 0, saves: 0, palmZ: [-20, -16], buildZ: [-30, -26], bridgeZ: 140,
  });
  Object.assign(player, {
    lane: 1, prevLane: 1, x: 0, y: 0, vy: 0, grounded: true, rolling: 0, jet: 0, boots: 0, magnet: 0, mult: 0,
    invuln: 0, stumble: 0, anim: 0, dead: false, deathT: 0, caught: false,
  });
  hero.jet.visible = false;
  drone.visible = false;
  spawnScenery(SPAWN_AHEAD + 40);
  // opening coins
  coinLine(1, 14, 10);
}

// ---------------------------------------------------------------- input
const input = { queue: [] };
function act(a) { if (state === 'play') input.queue.push(a); }
window.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') act('left');
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') act('right');
  else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') act('up');
  else if (k === 'ArrowDown' || k === 's' || k === 'S') act('down');
  else if (k === 'Escape' || k === 'p' || k === 'P') { if (state === 'play') pauseGame(); else if (state === 'paused') resumeGame(); }
  else return;
  e.preventDefault();
});
let touch = null;
window.addEventListener('touchstart', e => {
  const t = e.changedTouches[0];
  touch = { x: t.clientX, y: t.clientY, done: false };
}, { passive: true });
window.addEventListener('touchmove', e => {
  if (state === 'play' || state === 'paused') e.preventDefault();
  if (!touch || touch.done) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
  touch.done = true;
  if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'right' : 'left'); else act(dy > 0 ? 'down' : 'up');
}, { passive: false });
window.addEventListener('touchend', () => { touch = null; }, { passive: true });
// mouse drag (desktop testing)
let mouse = null;
canvas.addEventListener('mousedown', e => { mouse = { x: e.clientX, y: e.clientY, done: false }; });
window.addEventListener('mousemove', e => {
  if (!mouse || mouse.done) return;
  const dx = e.clientX - mouse.x, dy = e.clientY - mouse.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
  mouse.done = true;
  if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'right' : 'left'); else act(dy > 0 ? 'down' : 'up');
});
window.addEventListener('mouseup', () => { mouse = null; });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());

function handleInput() {
  while (input.queue.length) {
    const a = input.queue.shift();
    if (a === 'left' && player.lane > 0) { player.prevLane = player.lane; player.lane--; Sound.swipe(); }
    else if (a === 'right' && player.lane < 2) { player.prevLane = player.lane; player.lane++; Sound.swipe(); }
    else if (a === 'up') {
      if (player.jet > 0) continue;
      if (player.grounded) {
        player.vy = player.boots > 0 ? BOOT_V : JUMP_V; player.grounded = false; player.rolling = 0; Sound.jump();
      }
    } else if (a === 'down') {
      if (player.jet > 0) continue;
      if (!player.grounded) player.vy = -24;
      player.rolling = ROLL_T; Sound.roll();
    }
  }
}

// ---------------------------------------------------------------- game logic
let shake = 0;
function floorAt() {
  let f = 0;
  const px = player.x, d = world.dist;
  for (const o of obstacles) {
    if (o.type !== 'train' && o.type !== 'ramp') continue;
    if (Math.abs(o.x - px) > o.halfW + 0.15) continue;
    if (d < o.z0 - 0.3 || d > o.z1 + 0.3) continue;
    if (o.type === 'ramp') {
      const h = clamp((d - o.z0) / (o.z1 - o.z0), 0, 1) * o.top;
      if (player.y >= h - 1.3) f = Math.max(f, h);
    } else if (player.y >= o.top - 0.7) f = Math.max(f, o.top);
  }
  return f;
}

function hitObstacle(o, frontal) {
  if (save.invincible || player.invuln > 0 || player.jet > 0) return;
  if (frontal) { die(false); return; }
  // side scrape: bounce back + chaser
  player.lane = player.prevLane;
  shake = 0.35;
  if (player.stumble > 0) { die(true); return; }
  player.stumble = 6.5; player.invuln = 0.5;
  Sound.stumble();
  drone.visible = true; drone.position.set(player.x, 4, 9);
}

function checkCollisions(dt) {
  if (save.invincible || player.invuln > 0 || player.jet > 0) return;
  const d = world.dist, h = player.rolling > 0 ? 0.85 : 1.75;
  for (const o of obstacles) {
    if (o.type === 'ramp') continue;
    if (Math.abs(o.x - player.x) > o.halfW + 0.32) continue;
    if (d + 0.35 < o.z0 || d - 0.35 > o.z1) continue;
    let hit = false;
    if (o.type === 'train') hit = player.y < o.top - 0.7;
    else if (o.type === 'low') hit = player.y < o.top - 0.12;
    else if (o.type === 'high') hit = player.y + h > o.bottom && player.y < o.top;
    if (!hit) continue;
    const closing = world.speed + (o.vz || 0);
    const frontal = (d + 0.35 - o.z0) < closing * dt + 0.45 && Math.abs(o.x - player.x) < 0.9;
    hitObstacle(o, frontal);
    return;
  }
}

function die(caught) {
  if (player.dead) return;
  player.dead = true; player.caught = caught; player.deathT = 0;
  shake = 0.5;
  Sound.crash(); Sound.stopMusic();
  state = 'dying';
  if (caught) drone.visible = true;
}

function startJet() {
  const dur = powerDuration('jet');
  player.jet = dur; player.jetMax = dur;
  player.rolling = 0;
  const end = world.dist + dur * world.speed * 1.04;
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (o.z1 > end - 35 || (o.vz > 0)) { releaseObstacle(o); obstacles.splice(i, 1); }
  }
  for (let i = coins.length - 1; i >= 0; i--) if (coins[i].z > end - 35) coins.splice(i, 1);
  for (let i = pickups.length - 1; i >= 0; i--) if (pickups[i].z > world.dist + 5) { poolPut('pu-' + pickups[i].kind, pickups[i].mesh); pickups.splice(i, 1); }
  world.laneFree = [end + 15, end + 15, end + 15];
  world.hardUntil = [0, 0, 0];
  world.spawnZ = end + 25;
  world.nextPower = Math.max(world.nextPower, end + 120);
  let lane = player.lane;
  for (let z = world.dist + 18; z < end - 8; z += 2.3) {
    if (Math.random() < 0.07) lane = clamp(lane + (Math.random() < 0.5 ? -1 : 1), 0, 2);
    addCoin(LANES[lane], JET_Y + 0.95, z);
  }
}

function collectPickup(p) {
  Sound.power();
  const k = p.kind;
  if (k === 'key') { save.keys++; persist(); Sound.key(); toast('+1 🔑'); return; }
  if (k === 'jet') { startJet(); toast('JETPACK!'); }
  if (k === 'boots') { const d = powerDuration('boots'); player.boots = d; player.bootsMax = d; toast('JUMP BOOTS!'); }
  if (k === 'magnet') { const d = powerDuration('magnet'); player.magnet = d; player.magnetMax = d; toast('MAGNET!'); }
  if (k === 'mult') { const d = powerDuration('mult'); player.mult = d; player.multMax = d; toast('2X SCORE!'); }
}

function gameUpdate(dt) {
  world.time += dt;
  world.speed = Math.min(MAX_SPEED, START_SPEED + world.dist * 0.0028);
  const prevDist = world.dist;
  world.dist += world.speed * dt;
  const d = world.dist;

  handleInput();

  // timers
  const prevJet = player.jet;
  player.jet = Math.max(0, player.jet - dt);
  if (prevJet > 0 && player.jet === 0) { player.invuln = 1.6; player.vy = 0; player.grounded = false; }
  player.boots = Math.max(0, player.boots - dt);
  player.magnet = Math.max(0, player.magnet - dt);
  player.mult = Math.max(0, player.mult - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  if (player.stumble > 0) { player.stumble = Math.max(0, player.stumble - dt); }
  if (player.rolling > 0) player.rolling = Math.max(0, player.rolling - dt);

  // moving trains
  for (const o of obstacles) if (o.vz) { o.z0 -= o.vz * dt; o.z1 -= o.vz * dt; }

  // horizontal
  player.x = damp(player.x, LANES[player.lane], 16, dt);

  // vertical
  if (player.jet > 0) {
    player.y = damp(player.y, JET_Y, 3, dt); player.vy = 0; player.grounded = false;
  } else {
    const f = floorAt();
    player.vy -= GRAV * dt;
    player.y += player.vy * dt;
    if (player.y <= f) {
      if (!player.grounded && player.vy < -2) { /* landed */ }
      player.y = f; player.vy = 0; player.grounded = true;
    } else if (player.y > f + 0.05) player.grounded = false;
  }

  checkCollisions(dt);
  if (player.dead) return;

  // coins
  const cy = player.y + 0.9;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    if (c.z < d - 6) { coins.splice(i, 1); continue; }
    if (player.magnet > 0 && !c.att && c.z - d < 26 && c.z > d - 1) c.att = true;
    if (c.att) {
      const k = 1 - Math.exp(-14 * dt);
      c.x = lerp(c.x, player.x, k); c.y = lerp(c.y, cy, k); c.z = lerp(c.z, d, k);
    }
    if (Math.abs(c.z - d) < 1.0 && Math.abs(c.x - player.x) < 1.0 && Math.abs(c.y - cy) < 1.35) {
      coins.splice(i, 1);
      world.coins++;
      world.score += 10 * (player.mult > 0 ? 2 : 1);
      Sound.coin();
      emit(c.x, c.y, c.z, 0xffd23a, rand(-2, 2), rand(1, 3), 0, 0.35, 0.8);
    }
  }
  // moving trains swallow coins in their path
  for (const o of obstacles) if (o.vz) {
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (Math.abs(c.x - o.x) < 1 && c.z > o.z0 - 0.5 && c.z < o.z1 && c.y < TRAIN_TOP) coins.splice(i, 1);
    }
  }
  // pickups
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (p.z < d - 6) { poolPut('pu-' + p.kind, p.mesh); pickups.splice(i, 1); continue; }
    if (Math.abs(p.z - d) < 1.2 && Math.abs(p.x - player.x) < 1.1 && Math.abs(p.y - cy) < 1.6) {
      poolPut('pu-' + p.kind, p.mesh); pickups.splice(i, 1);
      collectPickup(p);
    }
  }

  // score
  world.score += (d - prevDist) * (player.mult > 0 ? 2 : 1) * 0.6;

  // spawn ahead
  while (world.spawnZ < d + SPAWN_AHEAD) {
    spawnRow(world.spawnZ);
    const df = clamp(world.dist / 4500, 0, 1);
    world.spawnZ += lerp(30, 19, df) + rand(0, 8);
  }
  spawnScenery(d + SPAWN_AHEAD + 40);

  // cleanup
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (o.z1 < d - 14) { releaseObstacle(o); obstacles.splice(i, 1); }
  }
  for (let i = sceneryItems.length - 1; i >= 0; i--) {
    const s = sceneryItems[i];
    if (s.z + (s.len || 0) < d - 25) { poolPut(s.key, s.mesh); sceneryItems.splice(i, 1); }
  }

  // trails
  if (player.jet > 0 && Math.random() < 0.9) {
    emit(player.x + rand(-0.15, 0.15), player.y + 0.5, d + 0.3, Math.random() < 0.5 ? 0xffa020 : 0xdddddd, rand(-0.5, 0.5), -4, 0, 0.5, 1.4);
  }
  if (hero.def.trail && Math.random() < 0.5 && player.jet <= 0) {
    emit(player.x + rand(-0.3, 0.3), player.y + rand(0.3, 1.5), d + 0.2, new THREE.Color(hero.def.trail).getHex(), 0, rand(0.3, 1), 0, 0.5, 0.9);
  }
}

// ---------------------------------------------------------------- render sync
function syncWorld(dt) {
  const d = world.dist;
  groundTex.offset.y = d / TIE_LEN;
  wallTex.offset.x = d / WALL_LEN;
  wallTexR.offset.x = -d / WALL_LEN;
  for (const o of obstacles) {
    for (const [, m] of o.parts) {
      const off = m.userData.off || 0;
      const zz = o.type === 'ramp' ? o.z0 : o.type === 'train' ? o.z0 + off : (o.z0 + o.z1) / 2;
      m.position.set(o.x, 0, -(zz - d));
    }
  }
  let n = 0;
  const t = world.time;
  for (const c of coins) {
    if (c.z - d > SPAWN_AHEAD + 20) continue;
    dummy.position.set(c.x, c.y, -(c.z - d));
    dummy.rotation.set(0, t * 3 + c.spin, 0);
    dummy.updateMatrix();
    coinMesh.setMatrixAt(n++, dummy.matrix);
  }
  coinMesh.count = n;
  coinMesh.instanceMatrix.needsUpdate = true;
  for (const p of pickups) {
    p.mesh.position.set(p.x, p.y + Math.sin(t * 3 + p.z) * 0.15, -(p.z - d));
    if (!p.mesh.userData.inner.userData.noSpin) p.mesh.userData.inner.rotation.y = t * 2.5;
  }
  for (const s of sceneryItems) { s.mesh.position.set(s.x, 0, -(s.z - d)); s.mesh.rotation.y = s.ry; }
}

function animateHero(dt, mode) {
  const h = hero;
  const p = player;
  h.root.position.set(p.x, p.y, 0);
  const sp = mode === 'menu' ? 0 : world.speed;
  p.anim += dt * (mode === 'menu' ? 2 : sp * 0.62);
  const s = Math.sin(p.anim);
  // reset
  h.pivot.rotation.set(0, 0, 0);
  h.pivot.position.y = 0.95;
  h.model.position.y = -0.95;
  h.head.rotation.set(0, 0, 0);
  h.jet.visible = p.jet > 0 && mode !== 'menu';
  for (const f of h.jet.userData.flames) f.scale.set(1, 0.7 + Math.random() * 0.6, 1);
  const bootsOn = p.boots > 0 && mode !== 'menu';
  for (const sm of h.shoeMeshes) sm.material = bootsOn ? lam('#39e26a', { emissive: '#127a32' }) : h.shoeMat;

  if (mode === 'menu') {
    const b = Math.sin(p.anim * 1.2);
    h.legL.rotation.x = 0; h.legR.rotation.x = 0;
    h.armL.rotation.set(0, 0, -0.15 - b * 0.05); h.armR.rotation.set(0, 0, 0.15 + b * 0.05);
    h.armR.rotation.x = Math.sin(p.anim * 2.4) * 0.25 - 0.1;
    h.model.position.y = -0.95 + Math.abs(b) * 0.03;
    h.head.rotation.y = Math.sin(p.anim * 0.7) * 0.25;
    if (h.cape) h.cape.rotation.x = -0.08 - b * 0.04;
  } else if (p.dead) {
    const k = clamp(p.deathT / 0.35, 0, 1);
    h.pivot.rotation.x = p.caught ? -0.3 * k : 1.35 * k;
    h.pivot.position.y = 0.95 - 0.7 * k;
    h.armL.rotation.set(-2.6 * k, 0, -0.3); h.armR.rotation.set(-2.6 * k, 0, 0.3);
    h.legL.rotation.x = 0.4 * k; h.legR.rotation.x = -0.2 * k;
  } else if (p.jet > 0) {
    h.legL.rotation.x = -0.35 + s * 0.08; h.legR.rotation.x = -0.25 - s * 0.08;
    h.armL.rotation.set(-0.5, 0, -0.5); h.armR.rotation.set(-0.5, 0, 0.5);
    h.pivot.rotation.x = -0.25;
    if (h.cape) h.cape.rotation.x = -1.1 + s * 0.08;
  } else if (p.rolling > 0) {
    const k = 1 - p.rolling / ROLL_T;
    h.pivot.position.y = 0.5;
    h.pivot.rotation.x = -k * Math.PI * 2;
    h.legL.rotation.x = -1.6; h.legR.rotation.x = -1.6;
    h.armL.rotation.set(-1.2, 0, 0); h.armR.rotation.set(-1.2, 0, 0);
    h.pivot.scale.setScalar(0.85);
    if (h.cape) h.cape.rotation.x = -0.6;
  } else if (!p.grounded) {
    const up = p.vy > 0;
    h.legL.rotation.x = up ? -1.1 : -0.4; h.legR.rotation.x = up ? 0.5 : 0.2;
    h.armL.rotation.set(up ? -2.6 : -2.0, 0, -0.3); h.armR.rotation.set(up ? 0.6 : -0.6, 0, 0.3);
    if (h.cape) h.cape.rotation.x = up ? -0.3 : -1.0;
  } else {
    h.legL.rotation.x = s * 0.95; h.legR.rotation.x = -s * 0.95;
    h.armL.rotation.set(-s * 0.85, 0, -0.08); h.armR.rotation.set(s * 0.85, 0, 0.08);
    h.model.position.y = -0.95 + Math.abs(Math.cos(p.anim)) * 0.09;
    h.pivot.rotation.x = -0.12;
    if (h.cape) h.cape.rotation.x = -0.75 + Math.sin(p.anim * 2) * 0.12;
  }
  if (p.rolling <= 0 || mode === 'menu') h.pivot.scale.setScalar(1);
  // lean into lane changes
  if (mode !== 'menu' && !p.dead) h.pivot.rotation.z = clamp((LANES[p.lane] - p.x) * -0.12, -0.3, 0.3);
  // flicker when invulnerable
  h.root.visible = !(player.invuln > 0 && !save.invincible && Math.floor(world.time * 14) % 2 === 0 && state === 'play');
  // shadow
  const fl = mode === 'menu' ? 0 : floorAt();
  h.shadow.position.set(p.x, fl + 0.02, 0);
  const sc = clamp(1 - (p.y - fl) * 0.12, 0.35, 1);
  h.shadow.scale.setScalar(sc);
  h.shadow.material.opacity = 0.3 * sc;
}

function updateDrone(dt) {
  if (!drone.visible) return;
  const t = world.time;
  for (const r of drone.userData.rotors) r.rotation.y += dt * 40;
  drone.userData.siren.material.opacity = 0.5 + 0.5 * Math.sin(t * 18);
  let tx = player.x * 0.9, ty = player.y + 2.6 + Math.sin(t * 4) * 0.15, tz = 3.0;
  if (player.dead && player.caught) { ty = player.y + 2.0; tz = 0.9; }
  else if (player.stumble <= 0) { tz = 16; ty = 6; }
  drone.position.x = damp(drone.position.x, tx, 5, dt);
  drone.position.y = damp(drone.position.y, ty, 5, dt);
  drone.position.z = damp(drone.position.z, tz, 3.5, dt);
  drone.rotation.z = (tx - drone.position.x) * -0.2;
  if (player.stumble <= 0 && !player.dead && drone.position.z > 14) drone.visible = false;
}

const camLook = new THREE.Vector3(0, 1.2, 0);
function updateCamera(dt, mode) {
  let px, py, pz, lx, ly, lz;
  if (mode === 'menu' || mode === 'shop') {
    const t = performance.now() / 1000;
    if (mode === 'shop') { px = 0; py = 1.4; pz = 7.0; lx = 0; ly = -2.0; lz = 0; }
    else { px = Math.sin(t * 0.3) * 0.6; py = 2.2; pz = 5.6; lx = 0; ly = 1.85; lz = 0; }
  } else {
    const p = player;
    const jetLift = p.jet > 0 ? 1.5 : 0;
    px = p.x * 0.6; py = 4.0 + p.y * 0.72 + jetLift; pz = 7.0;
    lx = p.x * 0.45; ly = 1.0 + p.y * 0.75; lz = -8;
  }
  const k = mode === 'play' || mode === 'dying' ? 7 : 3.2;
  camera.position.x = damp(camera.position.x, px, k, dt);
  camera.position.y = damp(camera.position.y, py, mode === 'play' ? 4 : k, dt);
  camera.position.z = damp(camera.position.z, pz, k, dt);
  camLook.x = damp(camLook.x, lx, k, dt); camLook.y = damp(camLook.y, ly, k, dt); camLook.z = damp(camLook.z, lz, k, dt);
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    camera.position.x += rand(-1, 1) * shake * 0.5; camera.position.y += rand(-1, 1) * shake * 0.5;
  }
  camera.lookAt(camLook);
}

// ---------------------------------------------------------------- UI
const $ = id => document.getElementById(id);
const ui = {
  hud: $('hud'), score: $('score'), coins: $('coins'), mult: $('multBadge'), powerups: $('powerups'), inv: $('invBadge'), toast: $('toast'),
  menu: $('menu'), shop: $('shop'), pause: $('pause'), saveme: $('saveme'), over: $('over'), countdown: $('countdown'),
};
const puEls = {};
for (const k of ['jet', 'boots', 'magnet', 'mult']) {
  const el = document.createElement('div'); el.className = 'pu';
  el.innerHTML = `<span class="ic">${POWER_INFO[k].icon}</span><div class="bar"><b></b></div>`;
  ui.powerups.appendChild(el); puEls[k] = { el, bar: el.querySelector('b') };
}
let toastTimer = 0;
function toast(msg) { ui.toast.textContent = msg; ui.toast.classList.add('show'); toastTimer = 1.1; }

function showScreen(name) {
  for (const s of ['menu', 'shop', 'pause', 'saveme', 'over']) ui[s].classList.toggle('show', s === name);
  ui.hud.classList.toggle('show', ['play', 'paused', 'saveme', 'dying'].includes(name));
}
function refreshMenu() {
  $('bestTxt').textContent = save.best.toLocaleString();
  $('bankTxt').textContent = save.coins.toLocaleString();
  $('keysTxt').textContent = save.keys;
  $('charLabel').textContent = charById(save.char).name.toUpperCase();
}
let lastHud = '';
function updateHud() {
  const sc = Math.floor(world.score);
  const m = player.mult > 0 ? 2 : 1;
  const key = sc + '|' + world.coins + '|' + m;
  if (key !== lastHud) {
    lastHud = key;
    ui.score.textContent = sc.toLocaleString();
    ui.coins.textContent = world.coins.toLocaleString();
    ui.mult.textContent = 'x' + m;
    ui.mult.classList.toggle('hot', m > 1);
  }
  const map = { jet: [player.jet, player.jetMax], boots: [player.boots, player.bootsMax], magnet: [player.magnet, player.magnetMax], mult: [player.mult, player.multMax] };
  for (const k in map) {
    const [v, mx] = map[k];
    puEls[k].el.classList.toggle('show', v > 0);
    if (v > 0) puEls[k].bar.style.width = (100 * v / mx).toFixed(1) + '%';
  }
  ui.inv.style.display = save.invincible ? 'block' : 'none';
}

// ---- shop
let shopTab = 'chars';
function avatarCss(c) {
  return `background:linear-gradient(${c.hair} 0 22%, ${c.skin} 22% 52%, ${c.top} 52% 100%)`;
}
function renderShop() {
  const body = $('shopBody');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === shopTab));
  if (shopTab === 'chars') {
    body.innerHTML = '<div class="grid">' + CHARACTERS.map(c => `
      <div class="card ${save.char === c.id ? 'sel' : ''}">
        <span class="ribbon">FREE</span>
        <div class="av" style="${avatarCss(c)}"></div>
        <div class="nm stroke">${c.name}</div>
        <button class="btn small ${save.char === c.id ? 'yellow' : ''}" data-char="${c.id}" style="${save.char === c.id ? 'box-shadow:0 4px 0 #c48a00' : ''}">${save.char === c.id ? 'SELECTED' : 'SELECT'}</button>
      </div>`).join('') + '</div>';
  } else if (shopTab === 'power') {
    body.innerHTML = '<div class="list">' + Object.entries(POWER_INFO).map(([k, info]) => {
      const lv = save.lv[k];
      return `<div class="item"><div class="ic">${info.icon}</div><div class="tx"><b class="stroke">${info.name}</b>
        <small>${info.desc} · lasts ${powerDuration(k)}s</small>
        <div class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
        <button class="btn small" data-up="${k}" ${lv >= MAX_LEVEL ? 'disabled' : ''}>${lv >= MAX_LEVEL ? 'MAX' : 'UPGRADE<br>FREE'}</button></div>`;
    }).join('') + '</div>';
  } else {
    body.innerHTML = `<div class="list">
      <div class="item"><div class="ic">🔑</div><div class="tx"><b class="stroke">5 Keys</b><small>Keys save you after a crash. You have ${save.keys}.</small></div><button class="btn small" data-item="keys">GET<br>FREE</button></div>
      <div class="item"><div class="ic">🪙</div><div class="tx"><b class="stroke">1,000 Coins</b><small>Bank: ${save.coins.toLocaleString()}</small></div><button class="btn small" data-item="coins">GET<br>FREE</button></div>
      <div class="item"><div class="ic">⭐</div><div class="tx"><b class="stroke">Max Everything</b><small>All power-ups to max level</small></div><button class="btn small" data-item="max">GET<br>FREE</button></div>
    </div>`;
  }
}
$('shopBody').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  Sound.init();
  if (b.dataset.char) { save.char = b.dataset.char; setHero(save.char); Sound.coin(); }
  if (b.dataset.up) { save.lv[b.dataset.up] = Math.min(MAX_LEVEL, save.lv[b.dataset.up] + 1); Sound.power(); }
  if (b.dataset.item === 'keys') { save.keys += 5; Sound.key(); }
  if (b.dataset.item === 'coins') { save.coins += 1000; Sound.coin(); }
  if (b.dataset.item === 'max') { for (const k in save.lv) save.lv[k] = MAX_LEVEL; Sound.power(); }
  persist(); renderShop(); refreshMenu();
});
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { shopTab = t.dataset.tab; renderShop(); }));

// ---------------------------------------------------------------- state machine
let state = 'menu';
let saveTimer = 0;
const SAVE_TIME = 4;

function goMenu() {
  state = 'menu';
  clearWorld();
  world.dist = 0; world.time = 0;
  Object.assign(player, { lane: 1, x: 0, y: 0, vy: 0, dead: false, rolling: 0, jet: 0, boots: 0, magnet: 0, mult: 0, stumble: 0, invuln: 0 });
  drone.visible = false;
  spawnScenery(120);
  refreshMenu();
  showScreen('menu');
  Sound.stopMusic();
}
function startGame() {
  Sound.init();
  resetRun();
  state = 'play';
  showScreen('play');
  Sound.startMusic();
  lastHud = '';
}
function pauseGame() {
  if (state !== 'play') return;
  state = 'paused';
  $('invSw').classList.toggle('on', save.invincible);
  $('sndSw').classList.toggle('on', save.sound);
  showScreen('pause');
  Sound.stopMusic();
}
function resumeGame() {
  if (state !== 'paused') return;
  showScreen('play');
  let n = 3;
  state = 'countdown';
  ui.countdown.textContent = n; ui.countdown.classList.add('show');
  const iv = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(iv); ui.countdown.classList.remove('show'); state = 'play'; Sound.startMusic(); input.queue.length = 0; }
    else ui.countdown.textContent = n;
  }, 450);
}
function finishRun() {
  state = 'over';
  const sc = Math.floor(world.score);
  const isBest = sc > save.best;
  save.best = Math.max(save.best, sc);
  save.coins += world.coins;
  persist();
  $('finalScore').textContent = sc.toLocaleString();
  $('finalCoins').textContent = '+' + world.coins.toLocaleString();
  $('finalBest').textContent = save.best.toLocaleString();
  $('newBest').style.display = isBest && sc > 0 ? 'block' : 'none';
  showScreen('over');
}
function offerSave() {
  const cost = 1 << world.saves;
  if (save.keys < cost) { finishRun(); return; }
  state = 'saveme';
  saveTimer = SAVE_TIME;
  $('saveCost').textContent = cost;
  $('saveKeys').textContent = save.keys;
  showScreen('saveme');
}
function revive() {
  const cost = 1 << world.saves;
  if (save.keys < cost) return;
  save.keys -= cost; world.saves++; persist();
  Sound.key();
  // clear the area in front of the player
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (o.z0 < world.dist + 45 && o.z1 > world.dist - 3) { releaseObstacle(o); obstacles.splice(i, 1); }
  }
  for (let i = 0; i < 3; i++) { world.laneFree[i] = Math.max(world.laneFree[i], world.dist + 45); world.hardUntil[i] = Math.min(world.hardUntil[i], world.dist); }
  Object.assign(player, { dead: false, caught: false, invuln: 2.5, stumble: 0, y: floorAt(), vy: 0, rolling: 0 });
  drone.visible = false;
  state = 'play';
  showScreen('play');
  Sound.startMusic();
  input.queue.length = 0;
}

$('playBtn').addEventListener('click', startGame);
$('shopBtn').addEventListener('click', () => { Sound.init(); state = 'shop'; renderShop(); showScreen('shop'); });
$('shopClose').addEventListener('click', () => { state = 'menu'; refreshMenu(); showScreen('menu'); });
$('pauseBtn').addEventListener('click', pauseGame);
$('resumeBtn').addEventListener('click', resumeGame);
$('quitBtn').addEventListener('click', finishRun);
$('invSw').addEventListener('click', () => { save.invincible = !save.invincible; persist(); $('invSw').classList.toggle('on', save.invincible); });
$('sndSw').addEventListener('click', () => { save.sound = !save.sound; persist(); Sound.init(); Sound.setOn(save.sound); $('sndSw').classList.toggle('on', save.sound); });
$('saveBtn').addEventListener('click', revive);
$('skipBtn').addEventListener('click', finishRun);
$('againBtn').addEventListener('click', startGame);
$('menuBtn').addEventListener('click', goMenu);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state === 'play') {
    gameUpdate(dt);
    updateHud();
  } else if (state === 'dying') {
    player.deathT += dt;
    world.time += dt;
    if (player.deathT > 1.0) offerSave();
  } else if (state === 'saveme') {
    saveTimer -= dt;
    $('ringArc').setAttribute('stroke-dashoffset', (289 * (1 - Math.max(0, saveTimer) / SAVE_TIME)).toFixed(1));
    if (saveTimer <= 0) finishRun();
  } else if (state === 'menu' || state === 'shop') {
    world.time += dt;
  }

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove('show'); }

  const mode = state === 'menu' || state === 'shop' ? state : (state === 'dying' ? 'dying' : 'play');
  const heroMode = mode === 'menu' || mode === 'shop' ? 'menu' : 'play';
  // face the camera on menu, face forward in game
  const targetRot = heroMode === 'menu' ? Math.PI + 0.35 : 0;
  hero.root.rotation.y = damp(hero.root.rotation.y, targetRot, 6, dt);
  if (state !== 'paused' && state !== 'countdown' && state !== 'saveme' && state !== 'over') animateHero(dt, heroMode);
  syncWorld(dt);
  if (state !== 'paused' && state !== 'countdown') { updateParticles(dt, world.dist); updateDrone(dt); }
  updateCamera(dt, mode);
  renderer.render(scene, camera);
}

// expose small debug hook for automated testing
window.__surf = { world, player, save, get state() { return state; }, act, startGame, give: k => collectPickup({ kind: k }) };

goMenu();
camera.position.set(0, 2.2, 5.6); camLook.set(0, 1.85, 0);
requestAnimationFrame(frame);
