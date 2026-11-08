// SurfHaven characters: a realistic skinned human rig (Mixamo "Vanguard" via the MIT Dive project, the
// same base Overcharge uses) dressed entirely in code:
//  - an outfit shader paints clothes per body region in rest-pose space (hoodie, blazer, tank top,
//    varsity jacket, hero suits, jeans, joggers, sneakers, boots, procedural tattoos, emblems, glow)
//  - the helmet is replaced by a sculpted code head with eyes, brows, ears, mouth and hair / hats
//  - accessories (caps, hoods, backpack, chain, capes, jetpack) ride on the bones
//  - jump / roll / jetpack / stumble poses are layered procedurally on top of the run animation
import * as THREE from './lib/three.module.min.js';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { RoundedBoxGeometry } from './lib/RoundedBoxGeometry.js';
import { clone as cloneSkinned } from './lib/SkeletonUtils.js';
import { buildFemaleGeometries } from './lib/femaleBody.js';

// style ids used by the outfit shader
const S = { HOODIE: 0, SCHOOL: 1, TANK: 2, VARSITY: 3, VOID: 4, BLAZE: 5, VOLT: 6 };

export const CHARACTERS = [
  { id: 'haven', name: 'Haven', style: S.HOODIE, skin: '#c68a5c', shirt: '#f4f4f4', shirt2: '#dcdcdc', pants: '#1f2c4d', pants2: '#3a5288', shoe: '#e0262f', sole: '#ffffff', accent: '#e0262f',
    hair: '#24160e', hairStyle: 'short', hat: 'capBack', hatColor: '#e0262f', hoodDown: true, eye: '#5a3418' },
  { id: 'school', name: 'School Boy', style: S.SCHOOL, skin: '#f2c8a2', shirt: '#1d2f63', shirt2: '#ffffff', pants: '#5b616c', pants2: '#6d737f', shoe: '#141414', sole: '#2a2a2a', accent: '#c62828',
    hair: '#6b3f1f', hairStyle: 'side', backpack: '#f4b400', eye: '#3a6ea5' },
  { id: 'tattoo', name: 'Tattoo Girl', style: S.TANK, female: true, skin: '#e8b08a', shirt: '#141414', shirt2: '#2a2a2a', pants: '#3d6fb5', pants2: '#86aee0', shoe: '#f5f5f5', sole: '#ffffff', accent: '#ff4fa3',
    hair: '#ff4fa3', hairTip: '#ffc1e0', hairStyle: 'ponytail', eye: '#2f8a5a', lips: '#b03a5b', sleeve: 0.0 },
  { id: 'blackboy', name: 'Black Boy', style: S.VARSITY, skin: '#4b2e1e', shirt: '#ff7a1a', shirt2: '#ffffff', pants: '#1c1c1c', pants2: '#ffffff', shoe: '#ffffff', sole: '#ffffff', accent: '#1c1c1c',
    hair: '#0f0f0f', hairStyle: 'hightop', chain: true, eye: '#2a1a10' },
  { id: 'void', name: 'Void', style: S.VOID, skin: '#160d22', shirt: '#0b0712', shirt2: '#191026', pants: '#0b0712', pants2: '#191026', shoe: '#0b0712', sole: '#2a1450', accent: '#b04dff',
    glove: '#0b0712', gloveStart: 0.6, hairStyle: 'none', hoodUp: '#0d0816', eyeGlow: '#d27bff', trail: '#b04dff' },
  { id: 'blaze', name: 'Blaze', style: S.BLAZE, skin: '#e0a77d', shirt: '#b30f22', shirt2: '#5c0710', pants: '#b30f22', pants2: '#5c0710', shoe: '#ffb300', sole: '#7a4a00', accent: '#ffb300',
    glove: '#ffb300', gloveStart: 0.57, bootTop: 0.36, cowl: '#b30f22', lens: '#ffd34d', crest: '#ff8a1a', cape: '#ff6a00', hairStyle: 'none', trail: '#ff8a1a' },
  { id: 'volt', name: 'Volt', style: S.VOLT, skin: '#c68a5c', shirt: '#1565ff', shirt2: '#0a1a40', pants: '#1565ff', pants2: '#0a1a40', shoe: '#ffe600', sole: '#806f00', accent: '#ffe600',
    glove: '#ffe600', gloveStart: 0.57, bootTop: 0.34, cowl: '#1565ff', lens: '#f4fbff', fins: '#ffe600', cape: '#0b2a7a', hairStyle: 'none', trail: '#5ce1ff' },
];

// ---------------------------------------------------------------- shared assets
const loader = new GLTFLoader();
let assetsP = null;
const shTime = { value: 0 };
export function tickCharacters(t) { shTime.value = t; }

function loadAssets() {
  if (assetsP) return assetsP;
  assetsP = Promise.all([loader.loadAsync('models/rig.glb'), loader.loadAsync('models/run.glb')]).then(([rig, run]) => {
    const clips = {};
    for (const c of rig.animations) clips[c.name.replace('soldier_', '')] = c;
    clips.run = run.animations.find(a => a.name === 'Run') || run.animations[0];
    // strip root motion from the loops (keep the vertical bob)
    for (const k of ['run', 'idle']) for (const t of clips[k].tracks) if (t.name.endsWith('Hips.position')) {
      const v = t.values, x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
    const template = rig.scene;
    template.updateMatrixWorld(true);
    let female = null;
    return { template, clips, female: () => (female = female || buildFemaleGeometries(template)) };
  });
  return assetsP;
}

// ---------------------------------------------------------------- outfit shader
const v3 = c => { const k = new THREE.Color(c); return new THREE.Vector3(k.r, k.g, k.b); };
function outfitMaterial(def, base, restMatrix) {
  const m = new THREE.MeshStandardMaterial({ map: base.map, normalMap: base.normalMap || null, roughness: 0.68, metalness: 0.0, envMapIntensity: 0.55 });
  if (m.normalMap) m.normalScale = new THREE.Vector2(0.55, 0.55);
  const U = {
    uTime: shTime, uRestM: { value: restMatrix },
    uSkin: { value: v3(def.skin) }, uShirt: { value: v3(def.shirt) }, uShirt2: { value: v3(def.shirt2) },
    uPants: { value: v3(def.pants) }, uPants2: { value: v3(def.pants2) }, uShoe: { value: v3(def.shoe) }, uSole: { value: v3(def.sole) },
    uAccent: { value: v3(def.accent) }, uGlove: { value: v3(def.glove || def.skin) }, uGloves: { value: def.glove ? 1 : 0 },
    uGloveStart: { value: def.gloveStart || 0.672 }, uBootTop: { value: def.bootTop || 0.15 },
    uSleeve: { value: def.sleeve !== undefined ? def.sleeve : 0.665 }, uStyle: { value: def.style },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform mat4 uRestM;\nvarying vec3 vRest;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = (uRestM * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = `uniform float uTime, uSleeve, uStyle, uGloves, uGloveStart, uBootTop;
uniform vec3 uSkin, uShirt, uShirt2, uPants, uPants2, uShoe, uSole, uAccent, uGlove;
varying vec3 vRest;
float shHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float shNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(shHash(i), shHash(i + vec2(1, 0)), f.x), mix(shHash(i + vec2(0, 1)), shHash(i + vec2(1, 1)), f.x), f.y); }
float shBand(float v, float a, float b, float w) { return smoothstep(a - w, a + w, v) * (1.0 - smoothstep(b - w, b + w, v)); }
float shSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
` + sh.fragmentShader
      .replace('void main() {', 'void main() {\n  vec3 shGlow = vec3(0.0);')
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec3 P = vRest; float ax = abs(P.x), y = P.y;
  if (y > 1.585 && ax < 0.2) discard;                      // the helmet: replaced by the code-built head
  float tex = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float W = 0.004;
  float front = smoothstep(-0.03, 0.02, P.z + 0.04);
  float arm = smoothstep(0.205 - W, 0.205 + W, ax) * step(1.26, y);
  float glove = arm * smoothstep(uGloveStart - W, uGloveStart + W, ax);
  float hand = arm * smoothstep(0.672 - W, 0.672 + W, ax);
  float slv = arm * (1.0 - glove) * (1.0 - hand) * (1.0 - smoothstep(uSleeve - W, uSleeve + W, ax));
  float armSkin = arm * (1.0 - slv) * (1.0 - max(glove * uGloves, hand));
  float shoe = (1.0 - arm) * (1.0 - smoothstep(uBootTop - W, uBootTop + W, y));
  float pantsM = (1.0 - arm) * (1.0 - shoe) * (1.0 - smoothstep(1.0 - W, 1.0 + W, y));
  float torso = (1.0 - arm) * (1.0 - shoe) * (1.0 - pantsM);
  float neck = torso * smoothstep(1.53, 1.545, y) * (1.0 - step(0.12, ax));
  vec3 shirtC = uShirt, sleeveC = uShirt, pantsC = uPants, shoeC = uShoe, skinC = uSkin;
  float extraSkin = 0.0;
  // denim / fabric variation
  float n1 = shNoise(P.xy * vec2(140.0, 60.0)), n2 = shNoise(P.xy * 18.0 + P.z * 7.0);
  int st = int(uStyle + 0.5);
  if (st == 0) {                                            // HAVEN: white hoodie, jeans, red sneakers
    float pocket = torso * front * shBand(y, 1.035, 1.17, W) * (1.0 - step(0.115, ax));
    shirtC = mix(shirtC, uShirt2, pocket * 0.55 + torso * shBand(y, 1.0, 1.04, W) * 0.6);
    shirtC = mix(shirtC, uAccent, torso * front * shBand(ax, 0.026, 0.036, 0.002) * shBand(y, 1.36, 1.5, W));
    sleeveC = mix(sleeveC, uShirt2, shBand(ax, 0.61, 0.665, W) * 0.7);
    pantsC = mix(uPants, uPants2, n1 * 0.35 + front * smoothstep(0.08, 0.0, abs(y - 0.6)) * 0.4);
    pantsC = mix(pantsC, vec3(0.85, 0.65, 0.3), front * shBand(abs(ax - 0.098), 0.06, 0.066, 0.002) * 0.6);
    shoeC = mix(shoeC, vec3(1.0), shBand(y, 0.05, 0.075, 0.003) + shBand(y, 0.12, 0.15, W) * 0.9);
  } else if (st == 1) {                                     // SCHOOL: blazer, white shirt + tie, trousers
    float vneck = torso * front * shBand(y, 1.19, 1.56, W) * (1.0 - smoothstep((y - 1.19) * 0.3 - 0.003, (y - 1.19) * 0.3 + 0.003, ax));
    float tie = vneck * (1.0 - smoothstep(0.016 + (1.5 - y) * 0.03, 0.02 + (1.5 - y) * 0.03, ax)) * step(y, 1.5);
    vec3 tieC = mix(uAccent, uAccent * 0.55, step(0.5, fract((y + P.x) * 45.0)));
    shirtC = mix(mix(shirtC, uShirt2, vneck), tieC, tie);
    shirtC = mix(shirtC, vec3(1.0, 0.8, 0.25), torso * front * (1.0 - smoothstep(0.018, 0.022, length(vec2(P.x - 0.085, y - 1.39)))));
    shirtC = mix(shirtC, vec3(0.05), torso * front * (1.0 - smoothstep(0.007, 0.01, min(length(vec2(P.x, y - 1.13)), length(vec2(P.x, y - 1.06))))));
    sleeveC = mix(sleeveC, uShirt2, shBand(ax, 0.645, 0.67, W));
    pantsC = mix(uPants, uPants2, front * (1.0 - smoothstep(0.002, 0.005, abs(ax - 0.098))));
    shoeC = mix(uShoe, vec3(0.25), smoothstep(0.6, 0.9, n2) * 0.3);
  } else if (st == 2) {                                     // TATTOO GIRL: tank top, sleeves of ink, ripped jeans
    float shoulder = torso * smoothstep(1.4, 1.42, y) * (1.0 - shBand(ax, 0.07, 0.105, 0.003));
    float scoop = torso * front * smoothstep(1.39, 1.4, y) * (1.0 - step(0.075, ax));
    extraSkin = max(shoulder, scoop);
    shirtC = mix(shirtC, uAccent, torso * shBand(y, 1.0, 1.02, 0.002));
    // tattoos on the bare arms (T-pose: arms run along x)
    float u = ax, ang = atan(P.z + 0.057, y - 1.479), side = sign(P.x);
    float tribal = shBand(u, 0.23, 0.42, W) * step(0.78, sin(u * 70.0 + 2.6 * sin(ang * 2.0 + side)));
    float vine = shBand(u, 0.45, 0.62, W) * (1.0 - smoothstep(0.08, 0.14, abs(sin(u * 38.0 + ang * 1.6 + side * 1.3))));
    float rose = 1.0 - smoothstep(0.016, 0.019, length(vec2(u - 0.535, (ang - 1.2 * side) * 0.045)));
    float wrist = shBand(u, 0.63, 0.642, 0.002);
    float ink = clamp(tribal + vine * 0.9 + wrist, 0.0, 1.0);
    skinC = mix(skinC, vec3(0.07, 0.06, 0.12), ink * armSkin);
    skinC = mix(skinC, vec3(0.75, 0.08, 0.2), rose * armSkin);
    // ripped knees
    float rip = pantsM * front * shBand(y, 0.53, 0.61, W) * step(0.45, shNoise(vec2(P.x * 90.0, y * 30.0)));
    pantsC = mix(uPants, uPants2, n1 * 0.4 + 0.15);
    pantsC = mix(pantsC, mix(uSkin, vec3(0.95), step(0.6, fract(y * 260.0))), rip);
    shoeC = mix(shoeC, uAccent, shBand(y, 0.045, 0.065, 0.003));
  } else if (st == 3) {                                     // VARSITY: orange jacket, white sleeves, joggers
    sleeveC = uShirt2;
    vec3 ribC = mix(uShirt, vec3(0.1), step(0.5, fract(y * 90.0)));
    shirtC = mix(shirtC, ribC, torso * shBand(y, 1.0, 1.045, W));
    sleeveC = mix(sleeveC, mix(uShirt, vec3(0.1), step(0.5, fract(ax * 90.0))), shBand(ax, 0.61, 0.665, W));
    float pch = torso * front * (1.0 - smoothstep(0.04, 0.043, length(vec2(P.x - 0.085, y - 1.35))));
    float pchIn = torso * front * (1.0 - smoothstep(0.028, 0.031, length(vec2(P.x - 0.085, y - 1.35))));
    shirtC = mix(shirtC, vec3(1.0), pch); shirtC = mix(shirtC, uShirt, pchIn * step(0.5, fract((P.x - y) * 40.0)));
    for (int i = 0; i < 6; i++) shirtC = mix(shirtC, vec3(1.0), torso * front * (1.0 - smoothstep(0.006, 0.009, length(vec2(P.x, y - 1.08 - float(i) * 0.075)))));
    pantsC = mix(uPants, uPants2, pantsM * shBand(ax, 0.162, 0.176, 0.002) + shBand(y, 0.15, 0.19, W) * 0.15);
    shoeC = mix(uShoe, vec3(0.1), shBand(y, 0.06, 0.08, 0.003));
  } else if (st == 4) {                                     // VOID: black suit, living purple veins
    float vein = 1.0 - smoothstep(0.0, 0.03, abs(shNoise(P.xy * 26.0 + P.z * 9.0) - 0.5));
    float seam = 1.0 - smoothstep(0.0, 0.004, abs(ax - 0.11));
    float pulse = 0.6 + 0.4 * sin(uTime * 3.0 + y * 14.0);
    shGlow += uAccent * (vein * 0.9 + seam * 0.6 * (1.0 - arm)) * pulse;
    shirtC = mix(uShirt, uShirt2, n2 * 0.6); pantsC = shirtC; sleeveC = shirtC;
  } else if (st == 5) {                                     // BLAZE: crimson suit, gold flame crest
    float sidePanel = smoothstep(0.1, 0.11, ax) * (1.0 - arm);
    shirtC = mix(uShirt, uShirt2, sidePanel); pantsC = mix(uPants, uPants2, smoothstep(0.15, 0.16, ax));
    shirtC = mix(shirtC, uAccent, torso * shBand(y, 0.985, 1.04, W));
    float flame = 0.0;
    for (int k = -1; k <= 1; k++) {
      float fk = float(k), h = k == 0 ? 0.2 : 0.13;
      float t = (y - 1.24) / h;
      float cx = fk * 0.037 + 0.012 * sin(t * 6.0 + uTime * 7.0 + fk * 2.0) * t;
      float w = 0.03 * sqrt(max(0.0, 1.0 - t)) * (0.55 + 0.9 * (1.0 - t)) * step(0.0, t);
      flame = max(flame, 1.0 - smoothstep(w - 0.002, w + 0.002, abs(P.x - cx)));
    }
    flame *= torso * front;
    shirtC = mix(shirtC, uAccent, flame);
    shGlow += vec3(1.0, 0.45, 0.05) * flame * (0.45 + 0.25 * sin(uTime * 9.0));
  } else if (st == 6) {                                     // VOLT: electric blue suit, lightning bolt
    float sidePanel = smoothstep(0.11, 0.12, ax) * (1.0 - arm);
    shirtC = mix(uShirt, uShirt2, sidePanel); pantsC = mix(uPants, uPants2, smoothstep(0.15, 0.16, ax));
    vec2 q = vec2(P.x, y);
    float d = min(min(shSeg(q, vec2(0.07, 1.5), vec2(-0.025, 1.35)), shSeg(q, vec2(-0.025, 1.35), vec2(0.035, 1.34))), shSeg(q, vec2(0.035, 1.34), vec2(-0.06, 1.16)));
    float bolt = (1.0 - smoothstep(0.014, 0.018, d)) * torso * front;
    shirtC = mix(shirtC, uAccent, bolt);
    float seam = (1.0 - smoothstep(0.0, 0.004, abs(ax - 0.115))) * (1.0 - arm);
    float zap = 0.55 + 0.45 * step(0.85, sin(uTime * 23.0 + y * 40.0));
    shGlow += vec3(0.35, 0.9, 1.0) * seam * 1.2 * zap + uAccent * bolt * 0.5;
  }
  vec3 handC = mix(skinC, uGlove, uGloves);
  float isSkin = armSkin + neck + extraSkin + hand * (1.0 - uGloves);
  vec3 col = shirtC * torso + sleeveC * slv + skinC * armSkin + handC * max(glove * uGloves, hand) + pantsC * pantsM + shoeC * shoe;
  col = mix(col, uSkin, clamp(neck + extraSkin, 0.0, 1.0));
  col = mix(col, uSole, shoe * (1.0 - smoothstep(0.03, 0.04, y)));
  col *= mix(mix(0.74, 1.12, smoothstep(0.08, 0.7, tex)), 0.97, clamp(isSkin, 0.0, 1.0));
  diffuseColor.rgb = col;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += shGlow;');
  };
  m.customProgramCacheKey = () => 'sh-outfit-' + def.style;
  return m;
}

// ---------------------------------------------------------------- code-built head
const RX = 0.088, RY = 0.118, RZ = 0.102;          // head radii (metres)
const HEAD_C = new THREE.Vector3(0, 1.70, -0.03);  // head centre in rest space (facing +Z)
function headShape(x, y, z) {
  // unit-sphere direction -> sculpted head (jaw taper, chin, brow, nose, cheekbones)
  if (y < 0) { const t = -y; x *= 1 - 0.3 * t * t; z *= 1 - 0.1 * t * t; }
  x *= 0.93;
  const fz = Math.max(0, z);
  z += 0.17 * Math.exp(-((x / 0.11) ** 2) - (((y + 0.14) / 0.17) ** 2)) * fz;      // nose
  z += 0.045 * Math.exp(-(((y - 0.2) / 0.07) ** 2)) * fz * Math.max(0, 1 - Math.abs(x) / 0.7); // brow
  z -= 0.03 * Math.exp(-(((Math.abs(x) - 0.38) / 0.14) ** 2) - (((y - 0.08) / 0.1) ** 2)) * fz;  // eye sockets
  x += Math.sign(x) * 0.03 * Math.exp(-(((y + 0.05) / 0.15) ** 2)) * fz;            // cheekbones
  z += 0.05 * Math.exp(-((x / 0.25) ** 2) - (((y + 0.8) / 0.12) ** 2)) * fz;        // chin
  return [x * RX, y * RY, z * RZ];
}
let headGeoCache = null;
function headGeometry() {
  if (headGeoCache) return headGeoCache;
  const g = new THREE.SphereGeometry(1, 48, 36);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const [x, y, z] = headShape(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, x, y, z); }
  g.computeVertexNormals();
  return (headGeoCache = g);
}
// a shell around the head keeping only the faces where keep(nx, ny, nz) is true (hair, hoods, cowl parts)
function shell(scale, keep, bump = 0, seg = 40) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  const p = g.attributes.position, n = p.count;
  const unit = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    unit.set([x, y, z], i * 3);
    let [hx, hy, hz] = headShape(x, y, z);
    const k = scale * (1 + bump * (Math.sin(x * 23 + y * 7) * Math.sin(z * 19 - y * 11) * 0.5 + 0.5));
    p.setXYZ(i, hx * k, hy * k, hz * k);
  }
  const idx = g.index.array, out = [];
  for (let i = 0; i < idx.length; i += 3) {
    let ok = true;
    for (let j = 0; j < 3; j++) { const v = idx[i + j] * 3; if (!keep(unit[v], unit[v + 1], unit[v + 2])) { ok = false; break; } }
    if (ok) out.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  g.setIndex(out);
  g.computeVertexNormals();
  return g;
}
const hairline = (nx, ny, nz) => ny > 0.06 + 0.4 * Math.max(nz, 0) - 0.52 * Math.max(-nz, 0);
const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra });

function buildHead(def) {
  const head = new THREE.Group();
  const skinM = std(def.skin, { roughness: 0.5 });
  const skull = new THREE.Mesh(headGeometry(), def.cowl ? std(def.cowl, { roughness: 0.35, metalness: 0.15 }) : skinM);
  head.add(skull);
  if (def.cowl) { // cowl leaves the mouth and chin bare
    head.add(new THREE.Mesh(shell(1.006, (x, y, z) => y < -0.18 && z > 0.05 && Math.abs(x) < 0.85), skinM));
  }
  // neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.055, 0.13, 18), def.hoodUp ? std(def.hoodUp) : (def.cowl ? std(def.cowl) : skinM));
  neck.position.set(0, -0.125, -0.012); head.add(neck);
  // ears
  if (!def.cowl && !def.hoodUp) for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), skinM);
    ear.scale.set(0.013, 0.03, 0.022); ear.position.set(s * 0.082, -0.005, -0.008); ear.rotation.y = s * 0.3; head.add(ear);
  }
  // eyes
  const eyeY = 0.012, eyeX = 0.034, eyeZ = 0.08;
  for (const s of [-1, 1]) {
    if (def.lens) {            // hero lenses
      const lens = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: def.lens, emissive: def.lens, emissiveIntensity: 0.9, roughness: 0.15 }));
      lens.scale.set(0.024, 0.011, 0.012); lens.position.set(s * eyeX, eyeY + 0.004, eyeZ + 0.012); lens.rotation.z = s * -0.28; head.add(lens);
      continue;
    }
    if (def.eyeGlow) {         // void: glowing slits
      const e = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: def.eyeGlow }));
      e.scale.set(0.017, 0.006, 0.006); e.position.set(s * eyeX, eyeY, eyeZ + 0.012); e.rotation.z = s * -0.2; head.add(e);
      continue;
    }
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.0155, 16, 12), std('#f8f6f2', { roughness: 0.3 }));
    sclera.scale.set(1, 0.78, 0.7); sclera.position.set(s * eyeX, eyeY, eyeZ); head.add(sclera);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0078, 18), std(def.eye || '#4a2c1a', { roughness: 0.3 }));
    iris.position.set(s * eyeX, eyeY, eyeZ + 0.0112); head.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0038, 14), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    pupil.position.set(s * eyeX, eyeY, eyeZ + 0.0114); head.add(pupil);
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(s * eyeX + 0.0025, eyeY + 0.0025, eyeZ + 0.0116); head.add(glint);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0165, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), skinM);
    lid.scale.set(1, 0.8, 0.75); lid.position.set(s * eyeX, eyeY + 0.001, eyeZ - 0.001); lid.rotation.x = 0.35; head.add(lid);
    const brow = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.0065, 0.01, 2, 0.003), std(def.hair || '#222', { roughness: 0.9 }));
    brow.position.set(s * (eyeX + 0.002), eyeY + 0.026, eyeZ + 0.012); brow.rotation.z = s * -0.12; head.add(brow);
    if (def.female) {
      const lash = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.003, 0.004), std('#111'));
      lash.position.set(s * (eyeX + 0.003), eyeY + 0.011, eyeZ + 0.011); lash.rotation.z = s * -0.18; head.add(lash);
    }
  }
  // mouth
  if (!def.hoodUp) {
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.016, def.lips ? 0.0042 : 0.0028, 6, 16, Math.PI * 0.62), std(def.lips || '#8a3d33', { roughness: 0.4 }));
    mouth.rotation.z = -Math.PI / 2 - Math.PI * 0.31; mouth.position.set(0, -0.05, 0.081); head.add(mouth);
  }

  // hair
  const hairM = std(def.hair || '#222', { roughness: 0.85 });
  if (def.hairStyle === 'short') head.add(new THREE.Mesh(shell(1.06, hairline, 0.03), hairM));
  if (def.hairStyle === 'side') {
    const g = shell(1.07, (x, y, z) => hairline(x, y, z) || (z > 0 && y > 0.32 && x < 0.55), 0.035);
    const p = g.attributes.position; // swoop volume on top, swept to one side
    for (let i = 0; i < p.count; i++) { const yy = p.getY(i) / RY; if (yy > 0.4) { p.setY(i, p.getY(i) * (1 + 0.14 * (yy - 0.4))); p.setX(i, p.getX(i) - 0.012 * (yy - 0.4)); } }
    g.computeVertexNormals(); head.add(new THREE.Mesh(g, hairM));
  }
  if (def.hairStyle === 'hightop') {
    head.add(new THREE.Mesh(shell(1.035, (x, y, z) => hairline(x, y, z) && y < 0.75), std(def.hair, { roughness: 1 })));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.079, 0.086, 0.07, 28, 2), hairM);
    top.position.set(0, 0.112, -0.008); head.add(top);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.074, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairM);
    cap.scale.set(1.07, 0.3, 1.07); cap.position.set(0, 0.146, -0.008); head.add(cap);
  }
  let tail = null;
  if (def.hairStyle === 'ponytail') {
    const g = shell(1.07, (x, y, z) => hairline(x, y, z) || (z > 0 && y > 0.25), 0.02);
    head.add(new THREE.Mesh(g, hairM));
    const fringe = new THREE.Mesh(shell(1.085, (x, y, z) => z > 0.35 && y > 0.18 && y < 0.62 && x > -0.2), hairM);
    fringe.rotation.z = 0.08; head.add(fringe);
    // ponytail: a swinging chain of tapered segments
    tail = new THREE.Group(); tail.position.set(0, 0.07, -0.095); head.add(tail);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.008, 6, 14), std(def.accent)); tie.rotation.x = 1.2; tail.add(tie);
    const cA = new THREE.Color(def.hair), cB = new THREE.Color(def.hairTip || def.hair);
    const segGeo = new THREE.CylinderGeometry(1, 0.82, 1, 10, 1, true), ball = new THREE.SphereGeometry(1, 12, 10);
    let parent = tail; const segs = [];
    for (let i = 0; i < 4; i++) {
      const k = i / 3, r = 0.034 * (1 - k * 0.55), len = 0.075;
      const joint = new THREE.Group(); joint.rotation.x = i === 0 ? -0.7 : 0.15; if (i > 0) joint.position.y = -len;
      parent.add(joint); segs.push(joint);
      const mat = std('#' + cA.clone().lerp(cB, Math.pow(k, 1.4)).getHexString(), { roughness: 0.8 });
      const m = new THREE.Mesh(segGeo, mat); m.scale.set(r, len, r); m.position.y = -len / 2; joint.add(m);
      const b = new THREE.Mesh(ball, mat); b.scale.setScalar(r); joint.add(b);
      parent = joint;
    }
    tail.userData.segs = segs;
  }
  if (def.hat === 'capBack') {
    const capM = std(def.hatColor, { roughness: 0.75 });
    const crown = new THREE.Mesh(shell(1.13, (x, y) => y > 0.18, 0, 36), capM);
    head.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.007, 24, 1, false, Math.PI / 2, Math.PI), capM);
    brim.scale.set(1, 1, 1.25); brim.position.set(0, 0.035, -0.09); brim.rotation.x = 0.12; head.add(brim);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), capM); btn.position.set(0, RY * 1.13 - 0.003, -0.005); head.add(btn);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0035, 6, 14, Math.PI), std('#ffffff'));
    strap.position.set(0, 0.04, 0.094); head.add(strap);
  }
  if (def.hoodUp) {
    const hoodM = std(def.hoodUp, { roughness: 0.9, side: THREE.DoubleSide });
    head.add(new THREE.Mesh(shell(1.3, (x, y, z) => !(z > 0.42 && Math.abs(y) < 0.78 && Math.abs(x) < 0.72) && y > -0.75), hoodM));
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.2, 0.2, 24, 1, true), hoodM);
    drape.position.set(0, -0.16, -0.025); head.add(drape);
    const shade = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x050208 }));
    shade.scale.set(RX * 0.98, RY * 0.98, RZ * 0.8); shade.position.z = -0.005; head.add(shade);
  }
  if (def.crest) { // flame crest on the cowl
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.018 - i * 0.003, 0.075 - i * 0.012, 10), std(i ? '#ffb300' : def.crest, { emissive: def.crest, emissiveIntensity: 0.25 }));
      c.position.set(0, RY * 0.93 - i * 0.012, 0.03 - i * 0.04); c.rotation.x = -0.7 - i * 0.25; head.add(c);
    }
  }
  if (def.fins) {
    const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(0.055, 0.03); fs.lineTo(0.02, -0.005); fs.lineTo(0.05, -0.03); fs.lineTo(0, -0.015);
    const fg = new THREE.ExtrudeGeometry(fs, { depth: 0.006, bevelEnabled: false });
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(fg, std(def.fins, { emissive: def.fins, emissiveIntensity: 0.3 }));
      f.position.set(s * RX * 0.93, 0.02, -0.02); f.rotation.set(0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0); f.scale.x = 1;
      head.add(f);
    }
  }
  head.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { head, tail };
}

// ---------------------------------------------------------------- the character
const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qi = new THREE.Quaternion();
function rotW(bone, axis, angle) {     // rotate a bone about a world-space axis (after the mixer)
  if (!bone || !angle) return;
  bone.parent.getWorldQuaternion(_qp);
  _q.setFromAxisAngle(axis, angle);
  _qi.copy(_qp).invert();
  bone.quaternion.premultiply(_qp).premultiply(_q).premultiply(_qi);
}
// swing a bone so the segment bone->child points along a direction given in model space (facing +Z)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _mq = new THREE.Quaternion(), _rq = new THREE.Quaternion();
function aimBone(model, bone, child, dirModel, w) {
  if (!bone || !child || w <= 0) return;
  bone.getWorldPosition(_a); child.getWorldPosition(_b);
  _b.sub(_a).normalize();
  model.getWorldQuaternion(_mq);
  _d.copy(dirModel).normalize().applyQuaternion(_mq);
  _rq.setFromUnitVectors(_b, _d);
  _q.identity().slerp(_rq, w);
  bone.parent.getWorldQuaternion(_qp); _qi.copy(_qp).invert();
  bone.quaternion.premultiply(_qp).premultiply(_q).premultiply(_qi);
  bone.updateMatrixWorld(true);
}
const ARM_L = new THREE.Vector3(0.2, -1, 0.04), FORE_L = new THREE.Vector3(0.1, -1, 0.22);
const ARM_R = new THREE.Vector3(-0.2, -1, 0.04), FORE_R = new THREE.Vector3(-0.1, -1, 0.22);
const findBone = (root, suffix) => { let f = null; root.traverse(o => { if (!f && o.isBone && o.name.endsWith(suffix)) f = o; }); return f; };
const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'LeftShoulder', 'RightShoulder'];
export const MODEL_SCALE = 1.05;

export async function buildCharacter(def, makeJetpack) {
  const A = await loadAssets();
  const model = cloneSkinned(A.template);
  model.updateMatrixWorld(true);
  const meshes = [];
  model.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  const femaleGeo = def.female ? A.female() : null;
  for (const m of meshes) {
    m.castShadow = true; m.frustumCulled = false;
    if (/visor/i.test(m.material.name)) { m.visible = false; continue; }
    if (femaleGeo && femaleGeo[m.name]) m.geometry = femaleGeo[m.name];
    m.material = outfitMaterial(def, m.material, m.matrixWorld.clone());
  }
  const bones = {};
  for (const n of BONES) bones[n] = findBone(model, n);

  // everything below is placed in rest space (metres, facing +Z) and then parented to a bone
  const attach = (boneName, obj, pos) => { obj.position.copy(pos); bones[boneName].attach(obj); obj.traverse(o => { if (o.isMesh) o.castShadow = true; }); return obj; };
  const { head, tail } = buildHead(def);
  attach('Head', head, HEAD_C);

  if (def.hoodDown) {
    const hood = new THREE.Group();
    const roll = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.034, 10, 20, Math.PI * 1.15), std(def.shirt2, { roughness: 0.9 }));
    roll.rotation.set(Math.PI / 2, 0, Math.PI * 0.92); roll.position.y = 0.0; hood.add(roll);
    const sack = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), std(def.shirt, { roughness: 0.9 }));
    sack.scale.set(0.11, 0.075, 0.06); sack.position.set(0, -0.05, -0.085); hood.add(sack);
    attach('Spine2', hood, new THREE.Vector3(0, 1.535, -0.06));
  }
  if (def.backpack) {
    const bp = new THREE.Group();
    bp.add(new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.38, 0.13, 3, 0.04), std(def.backpack, { roughness: 0.7 })));
    const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.14, 0.05, 2, 0.02), std('#d49a00')); pocket.position.set(0, -0.09, -0.08); bp.add(pocket);
    for (const s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.012), std('#2b2b2b')); strap.position.set(s * 0.085, 0.0, 0.33); bp.add(strap);
      const over = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 12, Math.PI * 0.75), std('#2b2b2b'));
      over.rotation.set(0, Math.PI / 2, Math.PI * 0.12); over.position.set(s * 0.085, 0.14, 0.17); bp.add(over);
    }
    attach('Spine2', bp, new THREE.Vector3(0, 1.3, -0.21));
  }
  if (def.chain) {
    const gold = std('#ffd23a', { metalness: 1, roughness: 0.22 });
    const ch = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.007, 6, 40), gold); ring.rotation.x = Math.PI / 2 - 0.62; ch.add(ring);
    const med = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.008, 18), gold); med.rotation.x = Math.PI / 2 - 0.25; med.position.set(0, -0.085, 0.1); ch.add(med);
    attach('Spine2', ch, new THREE.Vector3(0, 1.49, -0.02));
  }
  let cape = null;
  if (def.cape) {
    const geo = new THREE.PlaneGeometry(0.46, 0.98, 6, 10); geo.translate(0, -0.49, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), yy = p.getY(i); p.setX(i, x * (1 + (-yy) * 0.45)); p.setZ(i, -Math.pow(x / 0.23, 2) * 0.035); }
    geo.computeVertexNormals();
    const capeMesh = new THREE.Mesh(geo, std(def.cape, { side: THREE.DoubleSide, roughness: 0.55 }));
    const pivot = new THREE.Group(); pivot.add(capeMesh);
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.03), std(def.accent, { metalness: 0.6, roughness: 0.3 })); pivot.add(clasp);
    attach('Spine2', pivot, new THREE.Vector3(0, 1.5, -0.15));
    cape = { pivot, rest: pivot.quaternion.clone() };
  }
  const jet = makeJetpack(0.62);
  jet.visible = false;
  jet.rotation.y = Math.PI;
  attach('Spine2', jet, new THREE.Vector3(0, 1.28, -0.24));

  // animations
  const mixer = new THREE.AnimationMixer(model);
  const actions = {
    idle: mixer.clipAction(A.clips.idle), run: mixer.clipAction(A.clips.run), death: mixer.clipAction(A.clips.death1),
  };
  actions.death.setLoop(THREE.LoopOnce, 1); actions.death.clampWhenFinished = true;
  actions.idle.play();

  // rig: root -> tilt (lean / roll pivot) -> holder (faces -Z) -> model
  const root = new THREE.Group();
  const tilt = new THREE.Group(); tilt.position.y = 0.62; root.add(tilt);
  const holder = new THREE.Group(); holder.position.y = -0.62; holder.rotation.y = Math.PI; holder.scale.setScalar(MODEL_SCALE);
  tilt.add(holder); holder.add(model);
  const poseBones = Object.values(bones).filter(Boolean);
  return {
    def, root, tilt, holder, model, mixer, actions, cur: 'idle', bones, poseBones, poseBase: poseBones.map(b => b.quaternion.clone()),
    cape, jet, tail, k: { jump: 0, roll: 0, fly: 0, hit: 0 }, jumpSide: 1,
  };
}

export function playAction(h, name, fade = 0.15) {
  if (h.cur === name) return h.actions[name];
  const a = h.actions[name], prev = h.actions[h.cur];
  a.reset(); a.setEffectiveTimeScale(1); a.setEffectiveWeight(1); a.play();
  if (prev) { if (fade > 0) prev.crossFadeTo(a, fade, false); else prev.stop(); }
  h.cur = name;
  return a;
}

const AX_R = new THREE.Vector3(), AX_U = new THREE.Vector3(0, 1, 0), AX_F = new THREE.Vector3();
/**
 * Step the mixer and layer the procedural poses on top.
 * s = { jump, roll, rollT, fly, hit, speed01, menu, t }
 */
export function updateCharacter(h, dt, s) {
  // restore the animated pose so the procedural layer never accumulates
  for (let i = 0; i < h.poseBones.length; i++) h.poseBones[i].quaternion.copy(h.poseBase[i]);
  h.mixer.update(dt);
  for (let i = 0; i < h.poseBones.length; i++) h.poseBase[i].copy(h.poseBones[i].quaternion);

  const k = h.k, dmp = (a, b, r) => a + (b - a) * (1 - Math.exp(-r * dt));
  k.jump = dmp(k.jump, s.jump, 16); k.roll = dmp(k.roll, s.roll, 22); k.fly = dmp(k.fly, s.fly, 8); k.hit = dmp(k.hit, s.hit, 18);
  h.root.updateMatrixWorld(true);
  h.root.getWorldQuaternion(_q);
  AX_R.set(1, 0, 0).applyQuaternion(_q);      // character's right (it faces -Z at rest yaw)
  AX_F.set(0, 0, -1).applyQuaternion(_q);
  const B = h.bones, j = k.jump, r = k.roll, f = k.fly, side = h.jumpSide;

  if (j > 0.01) {      // airborne: lead knee up, trailing leg tucked, arms thrown up
    rotW(B.LeftUpLeg, AX_R, (side > 0 ? 1.25 : 0.35) * j); rotW(B.LeftLeg, AX_R, -(side > 0 ? 1.7 : 1.0) * j);
    rotW(B.RightUpLeg, AX_R, (side > 0 ? 0.35 : 1.25) * j); rotW(B.RightLeg, AX_R, -(side > 0 ? 1.0 : 1.7) * j);
    rotW(B.LeftArm, AX_R, 1.5 * j); rotW(B.RightArm, AX_R, 1.1 * j);
    rotW(B.LeftArm, AX_F, -0.35 * j); rotW(B.RightArm, AX_F, 0.35 * j);
    rotW(B.Spine1, AX_R, 0.12 * j);
  }
  if (r > 0.01) {      // roll: tuck into a ball
    rotW(B.LeftUpLeg, AX_R, 2.0 * r); rotW(B.RightUpLeg, AX_R, 2.0 * r);
    rotW(B.LeftLeg, AX_R, -2.4 * r); rotW(B.RightLeg, AX_R, -2.4 * r);
    for (const b of [B.Spine, B.Spine1, B.Spine2]) rotW(b, AX_R, -0.42 * r);
    rotW(B.Neck, AX_R, -0.5 * r);
    rotW(B.LeftArm, AX_R, 1.4 * r); rotW(B.RightArm, AX_R, 1.4 * r);
    rotW(B.LeftForeArm, AX_R, 1.2 * r); rotW(B.RightForeArm, AX_R, 1.2 * r);
  }
  if (f > 0.01) {      // jetpack: legs trail, arms out for balance
    rotW(B.LeftUpLeg, AX_R, -0.35 * f); rotW(B.RightUpLeg, AX_R, -0.15 * f);
    rotW(B.LeftLeg, AX_R, -0.7 * f); rotW(B.RightLeg, AX_R, -0.4 * f);
    rotW(B.LeftArm, AX_F, -0.9 * f); rotW(B.RightArm, AX_F, 0.9 * f);
    rotW(B.LeftArm, AX_R, 0.3 * f); rotW(B.RightArm, AX_R, 0.3 * f);
  }
  if (k.hit > 0.01) {  // stumble: twist and flinch
    rotW(B.Spine1, AX_U, Math.sin(s.t * 28) * 0.35 * k.hit);
    rotW(B.Spine2, AX_R, -0.25 * k.hit);
    rotW(B.Head, AX_R, 0.3 * k.hit);
  }
  if (s.menu) {        // relaxed arms for the idle stance (the source idle holds a rifle)
    h.model.updateMatrixWorld(true);
    const sw = Math.sin(s.t * 1.3) * 0.04;
    aimBone(h.model, B.LeftArm, B.LeftForeArm, _d.set(ARM_L.x, ARM_L.y, ARM_L.z + sw), 1);
    aimBone(h.model, B.LeftForeArm, B.LeftHand, FORE_L, 1);
    aimBone(h.model, B.RightArm, B.RightForeArm, _d.set(ARM_R.x, ARM_R.y, ARM_R.z - sw), 1);
    aimBone(h.model, B.RightForeArm, B.RightHand, FORE_R, 1);
  }
  // forward roll spin around the hips
  h.tilt.rotation.x = s.roll > 0 ? -Math.PI * 2 * s.rollT : (s.pitch || 0);
  h.tilt.position.y = 0.62 - 0.22 * r;
  // cape + ponytail secondary motion
  if (h.cape) {
    const ang = s.menu ? 0.12 + Math.sin(s.t * 2) * 0.04 : 0.55 + s.speed01 * 0.35 + Math.sin(s.t * 15) * 0.1 + f * 0.5 + j * 0.3;
    h.cape.pivot.quaternion.copy(h.cape.rest).multiply(_q.setFromAxisAngle(_xAxis, ang));
  }
  if (h.tail) {
    const segs = h.tail.userData.segs;
    for (let i = 0; i < segs.length; i++) segs[i].rotation.x = (i === 0 ? -0.7 : 0.15) - (s.menu ? 0 : 0.35 + j * 0.4) + Math.sin(s.t * 9 - i * 0.8) * 0.12 * (s.menu ? 0.3 : 1);
  }
}
const _xAxis = new THREE.Vector3(1, 0, 0);
