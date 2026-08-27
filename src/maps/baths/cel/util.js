import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** Hermite smoothstep that tolerates a > b (descending ranges). */
export function sstep(a, b, v) {
  const t = clamp((v - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic PRNG so the street looks identical on every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small helper bundle around a seeded PRNG. */
export function rngKit(seed) {
  const r = mulberry32(seed);
  return {
    next: r,
    range: (a, b) => a + (b - a) * r(),
    int: (a, b) => Math.floor(a + (b - a + 1) * r()),
    pick: (arr) => arr[Math.floor(r() * arr.length) % arr.length],
    chance: (p) => r() < p,
    sign: () => (r() < 0.5 ? -1 : 1),
  };
}

/**
 * Merge a list of {geometry, matrix} into one buffer geometry (single draw
 * call).  ExtrudeGeometry is non-indexed while the primitives are indexed, so
 * a mixed batch gets flattened to non-indexed before merging.
 */
export function bake(parts) {
  let geos = parts.map(({ geometry, matrix }) => {
    const g = geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    return g;
  });
  const indexed = geos.filter((g) => g.index).length;
  if (indexed > 0 && indexed < geos.length) {
    geos = geos.map((g) => {
      if (!g.index) return g;
      const flat = g.toNonIndexed();
      g.dispose();
      return flat;
    });
  }
  // keep only the attributes every geometry shares, or the merge rejects them
  const common = geos.reduce(
    (acc, g) => acc.filter((name) => g.attributes[name] !== undefined),
    Object.keys(geos[0].attributes)
  );
  for (const g of geos) {
    for (const name of Object.keys(g.attributes)) {
      if (!common.includes(name)) g.deleteAttribute(name);
    }
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Compose a matrix from loose position/euler/scale args. */
export function trs(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _v.set(px, py, pz);
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _s.set(sx, sy, sz);
  return _m.clone().compose(_v, _q, _s);
}

/** A box mesh whose local origin sits at the centre of its base. */
export function boxOnGround(w, h, d, mat) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, mat);
}

export function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function cyl(rt, rb, h, seg, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

export function plane(w, h, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  return m;
}

/**
 * Recursively enable shadow casting/receiving on a subtree.
 *
 * Transparent meshes are skipped: glass, highlight quads and netting are there
 * to be seen through, and letting them cast would drop a hard shadow over
 * whatever they are covering (a glazed vending machine display goes muddy).
 */
export function shadowify(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const seeThrough = o.userData.noShadow ||
      (o.material && !Array.isArray(o.material) && o.material.transparent);
    o.castShadow = cast && !seeThrough;
    o.receiveShadow = receive;
  });
  return obj;
}

/** A catenary-ish sagging curve between two points. */
export function sagCurve(a, b, sag, segments = 14) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}
