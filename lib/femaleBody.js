// Female body variant of the soldier mesh: the same skeleton, skin weights and UVs (so every animation,
// attachment and skin shader still works) with a reshaped bind pose: a slim, athletic hourglass frame.
// The ribcage, back, arms, legs, neck and helmet are slimmed down and the waist pulled in hard, while the
// bust, hips and glutes keep their fullness. Shoulder pads are smaller and the shoulders narrower.
// All shaping is done in rest-pose world space (metres, character facing +Z, T-pose) and mapped back.
import * as THREE from './three.module.min.js';

const gauss = (u, s) => Math.exp(-(u * u) / (2 * s * s));
const smooth01 = (t) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };

/** Displacement (metres) for a rest-pose point. */
export function femaleOffset(x, y, z, out) {
  out.set(0, 0, 0);
  const ax = Math.abs(x), sx = Math.sign(x) || 1;
  const zc = -0.04;                               // torso centre line (front/back)
  const torso = smooth01((0.28 - ax) / 0.08);     // 1 on the body, fading out along the arms
  // slimmer ribcage, chest and back (everything above the hips)
  const upper = smooth01((y - 0.98) / 0.1) * smooth01((1.68 - y) / 0.06);
  out.x -= x * 0.24 * upper * torso;
  out.z -= (z - zc) * 0.18 * upper * torso;
  // waist: pulled in hard between the ribs and the hips
  const waist = gauss(y - 1.165, 0.06) * torso;
  out.x -= x * 0.3 * waist;
  out.z -= (z - zc) * 0.18 * waist;
  // flatter upper back (the armour is bulky behind the shoulder blades)
  if (z < zc - 0.05) out.z += 0.05 * gauss(y - 1.36, 0.11) * torso * smooth01((zc - 0.05 - z) / 0.06);
  // bust: two rounded shapes on the chest plate
  if (z > zc && torso > 0) {
    const front = smooth01((z - zc - 0.02) / 0.1);
    for (const s of [-1, 1]) {
      const w = gauss(x - s * 0.08, 0.058) * gauss(y - 1.335, 0.058);
      out.z += 0.1 * w * front * torso;
      out.y -= 0.014 * w * front * torso;
      out.x += s * 0.008 * w * front * torso;
    }
  }
  // hips: flare out just below the waist
  const hip = gauss(y - 0.97, 0.08) * smooth01((0.32 - ax) / 0.08);
  out.x += sx * Math.min(ax, 0.2) * 0.15 * hip;   // capped so the belt flaps don't fan out
  // the armour flaps that hang off the belt: tucked in towards the hips
  if (ax > 0.17) out.x -= sx * (ax - 0.17) * 0.4 * smooth01((y - 0.84) / 0.06) * smooth01((1.08 - y) / 0.05);
  // glutes: two rounded shapes on the back
  if (z < zc) {
    const back = smooth01((zc - z - 0.01) / 0.09);
    for (const s of [-1, 1]) {
      const w = gauss(x - s * 0.08, 0.07) * gauss(y - 0.935, 0.075);
      out.z -= 0.09 * w * back;
      out.y -= 0.01 * w * back;
    }
  }
  // legs: slimmer round each leg's own axis (thigh gap), a soft curve kept on the outer thigh
  if (y < 0.95 && ax < 0.3) {
    const k = 0.3 * smooth01((0.93 - y) / 0.1) * smooth01((y - 0.5) / 0.1) + 0.36 * gauss(y - 0.4, 0.12);
    out.x += (sx * 0.105 - x) * k; out.z += (0.0 - z) * k;
    out.x += sx * 0.014 * gauss(y - 0.82, 0.09) * smooth01((ax - 0.05) / 0.05);
  }
  // shoulder pads: shrink towards the shoulder joint and bring the shoulders in
  if (y > 1.36 && y < 1.68 && ax > 0.1 && ax < 0.36) {
    const k = smooth01((ax - 0.1) / 0.06) * smooth01((0.36 - ax) / 0.06) * gauss(y - 1.5, 0.075);
    out.x += (sx * 0.19 - x) * 0.55 * k - sx * 0.055 * k;
    out.y += (1.48 - y) * 0.55 * k;
    out.z += (-0.05 - z) * 0.55 * k;
  }
  // arms (T-pose, along X): slimmer round the arm axis, hands a little less
  if (ax > 0.25 && y > 1.33 && y < 1.66) {
    const k = 0.46 * smooth01((ax - 0.25) / 0.08) * (1 - 0.6 * smooth01((ax - 0.7) / 0.08));
    out.y += (1.48 - y) * k; out.z += (-0.065 - z) * k;
  }
  // slimmer neck
  if (y > 1.58 && y < 1.76 && ax < 0.12) {
    const k = 0.18 * gauss(y - 1.67, 0.035);
    out.x -= x * k; out.z += (-0.03 - z) * k;
  }
  // helmet a little smaller
  if (y > 1.55 && ax < 0.17) {
    const k = 0.14 * smooth01((y - 1.55) / 0.05);
    out.x += (0 - x) * k; out.y += (1.68 - y) * k; out.z += (-0.04 - z) * k;
  }
  return out;
}

/**
 * Build the female geometries for every skinned mesh of the (unposed) template.
 * Returns { [meshName]: BufferGeometry }.
 */
export function buildFemaleGeometries(template) {
  template.updateMatrixWorld(true);
  const out = {}, posCache = new Map();
  const v = new THREE.Vector3(), d = new THREE.Vector3();
  template.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry, P = g.attributes.position;
    let pos = posCache.get(P);
    if (!pos) {
      const M = o.matrixWorld, inv = M.clone().invert();
      const arr = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(M);
        femaleOffset(v.x, v.y, v.z, d);
        v.add(d).applyMatrix4(inv);
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
      }
      pos = new THREE.BufferAttribute(arr, 3);
      posCache.set(P, pos);
    }
    // normals: keep the original smoothing, add the change the reshape introduces
    const before = new THREE.BufferGeometry(); before.setAttribute('position', P); before.setIndex(g.index); before.computeVertexNormals();
    const after = new THREE.BufferGeometry(); after.setAttribute('position', pos); after.setIndex(g.index); after.computeVertexNormals();
    const N = g.attributes.normal, nb = before.attributes.normal, na = after.attributes.normal;
    const narr = new Float32Array(N.count * 3), n = new THREE.Vector3();
    for (let i = 0; i < N.count; i++) {
      n.set(N.getX(i) + na.getX(i) - nb.getX(i), N.getY(i) + na.getY(i) - nb.getY(i), N.getZ(i) + na.getZ(i) - nb.getZ(i));
      if (n.lengthSq() < 1e-8) n.set(N.getX(i), N.getY(i), N.getZ(i));
      n.normalize();
      narr[i * 3] = n.x; narr[i * 3 + 1] = n.y; narr[i * 3 + 2] = n.z;
    }
    const ng = g.clone();
    ng.setAttribute('position', pos);
    ng.setAttribute('normal', new THREE.BufferAttribute(narr, 3));
    ng.computeBoundingBox(); ng.computeBoundingSphere();
    out[o.name] = ng;
  });
  return out;
}
