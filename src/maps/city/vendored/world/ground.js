import * as THREE from 'three';
import { PAL } from '../core/palette.js';
import { cel, flat } from '../core/toon.js';
import { chainLinkTex } from '../core/textures.js';
import { box, bake, trs } from '../core/util.js';
import { groundY, makeStrip } from './street.js';

/* ------------------------------------------------------------------ *
 * Ground works.
 *
 * The outlying districts all need the same civil engineering: paved pads,
 * narrow lanes, block boundary walls, mesh fencing, pipe railings and
 * flights of steps.  Doing them once here is what keeps the school, the
 * shrine, the shotengai and the canal reading as one town rather than four
 * separate models.
 *
 * Steps are the one interesting case.  They emit tread geometry *and* one
 * platform per tread, so `world.heightAt` walks the player up the flight.
 * A collider would be wrong: its top always sits above the player's feet,
 * so the flight would simply be a wall.
 *
 * Everything is authored on the flat XZ plane, like the rest of the world.
 * ------------------------------------------------------------------ */

const M = {};
export function groundMats() {
  if (M.concrete) return M;
  M.concrete = cel({ color: PAL.concrete, bands: 3, tint: 0x6f6790 });
  M.concreteMid = cel({ color: PAL.concreteMid, bands: 3, tint: 0x6a6288 });
  M.concreteDark = cel({ color: PAL.concreteDark, bands: 3, tint: 0x655d84 });
  M.asphalt = cel({ color: PAL.road, bands: 3, tint: 0x6a608f });
  M.asphaltWorn = cel({ color: PAL.roadWorn, bands: 3, tint: 0x6a608f });
  M.curb = cel({ color: PAL.curb, bands: 3, tint: 0x6f6790 });
  /* The street's own two footway tones.  Anything that has to *meet* the main
   * road -- a road head, a junction apron -- has to be paved out of the same
   * pair or the join reads as a patch, and `buildStreet` keeps its copies
   * private. */
  M.sidewalk = cel({ color: PAL.sidewalk, bands: 3, tint: 0x7d74a0 });
  M.sidewalkAlt = cel({ color: PAL.sidewalkAlt, bands: 3, tint: 0x7d74a0 });
  M.metal = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  M.metalDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  M.white = cel({ color: PAL.lineWhite, bands: 2, tint: 0x8e86ad });
  M.dirt = cel({ color: PAL.dirt, bands: 3, tint: 0x7a7396 });
  M.clay = cel({ color: PAL.clay, bands: 3, tint: 0x7d6f8f });
  M.stone = cel({ color: PAL.stone, bands: 3, tint: 0x655d80 });
  M.stoneDark = cel({ color: PAL.stoneDark, bands: 3, tint: 0x605878 });
  M.stoneWarm = cel({ color: PAL.stoneWarm, bands: 3, tint: 0x655d80 });
  M.grass = cel({ color: PAL.grass, bands: 3, tint: 0x5b6f8c });
  M.gravel = cel({ color: PAL.gravel, bands: 3, tint: 0x6a6288 });
  return M;
}

/* --------------------------------- pads --------------------------------- */

/**
 * A paved pad.  Built as a shallow slab rather than a plane so its edge
 * catches the ink pass -- that thin line round a forecourt is most of what
 * makes paving read as paving.
 */
export function pad(ctx, o) {
  const m = groundMats();
  const h = o.h ?? 0.07;
  const slab = box(o.w, h, o.d, o.mat ?? m.concrete, o.x, (o.y ?? 0) + h / 2, o.z);
  slab.receiveShadow = true;
  if (o.ry) slab.rotation.y = o.ry;
  slab.name = o.name ?? 'pad';
  ctx.add(slab);
  if (o.platform !== false) {
    ctx.platform({
      x0: o.x - o.w / 2, x1: o.x + o.w / 2,
      z0: o.z - o.d / 2, z1: o.z + o.d / 2,
      top: (o.y ?? 0) + h,
    });
  }
  return slab;
}

/**
 * A narrow lane.  `axis` 'x' runs along X at a fixed z (level ground, one
 * box); 'z' runs along Z and is swept with `makeStrip` so it follows the
 * street's slope.
 */
export function lane(ctx, o) {
  const m = groundMats();
  const mat = o.mat ?? m.asphalt;
  const w = o.w ?? 3.6;
  const rise = o.rise ?? 0.05;
  const g = new THREE.Group();

  if (o.axis === 'z') {
    // makeStrip's winding assumes ascending z; sweeping the other way puts the
    // front faces underground
    const z0 = Math.min(o.from, o.to);
    const z1 = Math.max(o.from, o.to);
    const a = (z) => ({ x: o.at - w / 2, y: groundY(z) + rise });
    const b = (z) => ({ x: o.at + w / 2, y: groundY(z) + rise });
    const mesh = new THREE.Mesh(makeStrip({ z0, z1, a, b, step: 1.4 }), mat);
    mesh.receiveShadow = true;
    g.add(mesh);
    if (o.kerb !== false) {
      for (const s of [-1, 1]) {
        const ka = (z) => ({ x: o.at + s * (w / 2), y: groundY(z) + rise });
        const kb = (z) => ({ x: o.at + s * (w / 2 + 0.26), y: groundY(z) + rise + 0.1 });
        const km = new THREE.Mesh(makeStrip({ z0, z1, a: ka, b: kb, step: 1.4, flip: s < 0 }), m.curb);
        km.receiveShadow = true;
        g.add(km);
      }
    }
  } else {
    const y = o.y ?? groundY(o.at);
    const len = Math.abs(o.to - o.from);
    const cx = (o.from + o.to) / 2;
    const mesh = box(len, 0.06, w, mat, cx, y + rise, o.at);
    mesh.receiveShadow = true;
    g.add(mesh);
    if (o.kerb !== false) {
      for (const s of [-1, 1]) {
        const km = box(len, 0.16, 0.26, m.curb, cx, y + rise + 0.02, o.at + s * (w / 2 + 0.13));
        km.receiveShadow = true;
        g.add(km);
      }
    }
  }
  g.name = o.name ?? 'lane';
  ctx.add(g);

  if (o.platform !== false && o.axis !== 'z') {
    const y = o.y ?? groundY(o.at);
    ctx.platform({
      x0: Math.min(o.from, o.to), x1: Math.max(o.from, o.to),
      z0: o.at - w / 2, z1: o.at + w / 2, top: y + rise + 0.06,
    });
  }
  return g;
}

/** A dashed or solid painted line on a lane. */
export function laneLine(ctx, o) {
  const m = groundMats();
  const parts = [];
  const len = Math.abs(o.to - o.from);
  const dash = o.dash ?? 0;
  if (dash) {
    const n = Math.max(1, Math.floor(len / (dash * 2)));
    for (let i = 0; i < n; i++) {
      const t = o.from + (o.to - o.from) * ((i + 0.25) / n);
      parts.push({
        geometry: new THREE.BoxGeometry(o.axis === 'x' ? dash : 0.1, 0.02, o.axis === 'x' ? 0.1 : dash),
        matrix: o.axis === 'x' ? trs(t, 0, o.at) : trs(o.at, 0, t),
      });
    }
  } else {
    parts.push({
      geometry: new THREE.BoxGeometry(o.axis === 'x' ? len : 0.1, 0.02, o.axis === 'x' ? 0.1 : len),
      matrix: o.axis === 'x' ? trs((o.from + o.to) / 2, 0, o.at) : trs(o.at, 0, (o.from + o.to) / 2),
    });
  }
  const mesh = new THREE.Mesh(bake(parts), o.mat ?? m.white);
  mesh.position.y = o.y ?? 0.09;
  mesh.userData.noOutline = true;
  ctx.add(mesh);
  return mesh;
}

/* -------------------------------- steps -------------------------------- */

/**
 * A flight of steps climbing along one axis.
 *
 * `dir` is the direction of travel up the flight (+1 or -1 along `axis`).
 * Each tread is a block rising from the base, so the flight reads as cut
 * stone rather than a floating staircase, and each one registers a platform
 * so the height query carries the player up.
 */
export function steps(ctx, o) {
  const m = groundMats();
  const n = o.n ?? 8;
  const rise = o.rise ?? 0.19;
  const run = o.run ?? 0.42;
  const w = o.w ?? 2.6;
  const y = o.y ?? 0;
  const dir = o.dir ?? -1;
  const axis = o.axis ?? 'z';
  const mat = o.mat ?? m.stone;
  const parts = [];
  const edge = [];

  for (let i = 0; i < n; i++) {
    const h = rise * (i + 1);
    const t = run * (i + 0.5) * dir;
    const along = axis === 'z' ? trs(o.x, h / 2, o.z + t) : trs(o.x + t, h / 2, o.z);
    parts.push({
      geometry: new THREE.BoxGeometry(axis === 'z' ? w : run, h, axis === 'z' ? run : w),
      matrix: along,
    });
    // nosing: a slightly lighter lip so each tread separates tonally
    const lipT = run * (i + 1) * dir - 0.03 * dir;
    edge.push({
      geometry: new THREE.BoxGeometry(axis === 'z' ? w + 0.04 : 0.06, 0.035, axis === 'z' ? 0.06 : w + 0.04),
      matrix: axis === 'z' ? trs(o.x, h - 0.015, o.z + lipT) : trs(o.x + lipT, h - 0.015, o.z),
    });

    /* **The treads overlap by 40 mm, they do not meet.**  `heightAt`'s platform
     * test is strictly exclusive on all four sides, so a query landing exactly on
     * the joint between two treads matches *neither* and falls through to the
     * natural grade -- on the shrine's back flight that is a 2.6 m drop.  A
     * player's z is a float and will practically never sit on a joint, which is
     * why this never showed in play; a flood fill on a 0.35 m grid lands on one
     * every time, so the tool that is supposed to find holes was manufacturing
     * one.  `PAD` also carries the top and bottom treads 20 mm into whatever the
     * flight lands on, which is the rule this file has always stated and this
     * function was the last place still breaking it. */
    const PAD = 0.02;
    const t0 = run * i * dir - PAD * dir;
    const t1 = run * (i + 1) * dir + PAD * dir;
    ctx.platform(axis === 'z'
      ? { x0: o.x - w / 2, x1: o.x + w / 2, z0: Math.min(o.z + t0, o.z + t1), z1: Math.max(o.z + t0, o.z + t1), top: y + h }
      : { x0: Math.min(o.x + t0, o.x + t1), x1: Math.max(o.x + t0, o.x + t1), z0: o.z - w / 2, z1: o.z + w / 2, top: y + h });
    /* Each tread is drawn as a solid from the flight's foot up to this
     * nosing. Collide that box, not one AABB for the whole flight: a
     * single box would fill the air above the lower treads. */
    if (o.collide !== false) {
      const lo = Math.min(o.z + t0, o.z + t1);
      const hi = Math.max(o.z + t0, o.z + t1);
      const xa = Math.min(o.x + t0, o.x + t1);
      const xb = Math.max(o.x + t0, o.x + t1);
      if (axis === 'z') ctx.collide(o.x - w / 2, lo, o.x + w / 2, hi, y + h, y);
      else ctx.collide(xa, o.z - w / 2, xb, o.z + w / 2, y + h, y);
    }
  }

  const g = new THREE.Group();
  const body = new THREE.Mesh(bake(parts), mat);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const lip = new THREE.Mesh(bake(edge), o.lipMat ?? m.stoneDark);
  lip.userData.noOutline = true;
  g.add(lip);
  g.position.y = y;
  ctx.add(g);

  const top = y + rise * n;
  const end = axis === 'z' ? o.z + run * n * dir : o.x + run * n * dir;
  return { group: g, top, end };
}

/* ---------------------------- walls and fences ---------------------------- */

/**
 * A concrete block boundary wall.  Built as a run of short panels, each
 * seated at its own local ground height: that is how a Japanese block wall
 * actually copes with a slope, and it saves sweeping the geometry.
 */
export function wallRun(ctx, o) {
  const m = groundMats();
  const h = o.h ?? 2.1;
  const t = o.t ?? 0.28;
  const axis = o.axis ?? 'x';
  const from = Math.min(o.from, o.to);
  const to = Math.max(o.from, o.to);
  const panel = o.panel ?? 4.0;
  const n = Math.max(1, Math.round((to - from) / panel));
  const step = (to - from) / n;
  const body = [];
  const caps = [];

  for (let i = 0; i < n; i++) {
    const c = from + step * (i + 0.5);
    const lz = axis === 'z' ? c : o.at;
    const dy = (o.y !== undefined ? o.y : groundY(lz)) - 0.05;
    const geo = new THREE.BoxGeometry(axis === 'z' ? t : step + 0.02, h, axis === 'z' ? step + 0.02 : t);
    body.push({ geometry: geo, matrix: axis === 'z' ? trs(o.at, dy + h / 2, c) : trs(c, dy + h / 2, o.at) });
    caps.push({
      geometry: new THREE.BoxGeometry(axis === 'z' ? t + 0.12 : step + 0.02, 0.1, axis === 'z' ? step + 0.02 : t + 0.12),
      matrix: axis === 'z' ? trs(o.at, dy + h + 0.05, c) : trs(c, dy + h + 0.05, o.at),
    });
  }

  const g = new THREE.Group();
  const bm = new THREE.Mesh(bake(body), o.mat ?? m.concreteMid);
  bm.castShadow = bm.receiveShadow = true;
  g.add(bm);
  /* The coping must not cast.  It overhangs the wall by 60 mm, which is about
   * two shadow-map texels at this cascade size, so its own shadow lands as a
   * row of sawtooth triangles along the top of the wall face rather than as a
   * line.  Losing a 60 mm shadow costs nothing; the acne is unmissable. */
  const cm = new THREE.Mesh(bake(caps), o.capMat ?? m.concrete);
  cm.castShadow = false;
  cm.receiveShadow = true;
  g.add(cm);
  g.name = o.name ?? 'wall';
  ctx.add(g);

  if (o.collide !== false) {
    const y = o.y !== undefined ? o.y : groundY(axis === 'z' ? (from + to) / 2 : o.at);
    if (axis === 'z') ctx.collide(o.at - t / 2 - 0.05, from, o.at + t / 2 + 0.05, to, y + h);
    else ctx.collide(from, o.at - t / 2 - 0.05, to, o.at + t / 2 + 0.05, y + h);
  }
  return g;
}

/**
 * Mesh (chain-link) fencing: posts, rails and a lattice panel.
 *
 * The panel is a real drawn lattice with transparent gaps, not a flat
 * translucent sheet -- a sheet reads as tinted glass, which is the one thing
 * a school fence must not look like.  `depthWrite` stays off: the ink pass
 * reads the depth buffer, and a see-through fence written into it turns into
 * a field of speckle.
 */
export function meshFence(ctx, o) {
  const m = groundMats();
  const h = o.h ?? 1.9;
  const axis = o.axis ?? 'x';
  const from = Math.min(o.from, o.to);
  const to = Math.max(o.from, o.to);
  const len = to - from;
  const y = o.y ?? 0;
  const parts = [];
  const spacing = o.spacing ?? 2.4;
  const n = Math.max(1, Math.round(len / spacing));

  for (let i = 0; i <= n; i++) {
    const c = from + (len / n) * i;
    parts.push({
      geometry: new THREE.CylinderGeometry(0.045, 0.045, h, 6),
      matrix: axis === 'z' ? trs(o.at, h / 2, c) : trs(c, h / 2, o.at),
    });
  }
  for (const ry of [h - 0.05, o.mid ? h * 0.5 : null, 0.12]) {
    if (ry === null) continue;
    parts.push({
      geometry: new THREE.BoxGeometry(axis === 'z' ? 0.05 : len, 0.05, axis === 'z' ? len : 0.05),
      matrix: axis === 'z' ? trs(o.at, ry, (from + to) / 2) : trs((from + to) / 2, ry, o.at),
    });
  }

  const g = new THREE.Group();
  g.name = 'chainLink';
  const frame = new THREE.Mesh(bake(parts), o.mat ?? m.metal);
  frame.name = 'chainLink';
  frame.castShadow = true;
  g.add(frame);

  const tex = chainLinkTex().clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(len / 0.42, (h - 0.2) / 0.42);
  tex.needsUpdate = true;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(len, h - 0.2),
    flat({
      color: o.meshColor ?? 0xc2c8d0, map: tex, transparent: true, opacity: 0.82,
      side: THREE.DoubleSide, depthWrite: false, cache: false,
    })
  );
  panel.position.set(axis === 'z' ? o.at : (from + to) / 2, (h - 0.2) / 2 + 0.1, axis === 'z' ? (from + to) / 2 : o.at);
  if (axis === 'z') panel.rotation.y = Math.PI / 2;
  panel.userData.noOutline = true;
  panel.userData.noShadow = true;
  g.add(panel);

  g.position.y = y;
  ctx.add(g);
  if (o.collide !== false) {
    /* Floor at y so a roof fence is a parapet, not a wall from the
     * street up through the building. */
    if (axis === 'z') ctx.collide(o.at - 0.1, from, o.at + 0.1, to, y + h, y);
    else ctx.collide(from, o.at - 0.1, to, o.at + 0.1, y + h, y);
  }
  return g;
}

/** Painted steel pipe railing -- canal banks, bridge parapets, roof edges. */
export function railing(ctx, o) {
  const m = groundMats();
  const h = o.h ?? 1.05;
  const axis = o.axis ?? 'x';
  const from = Math.min(o.from, o.to);
  const to = Math.max(o.from, o.to);
  const len = to - from;
  const y = o.y ?? 0;
  const parts = [];
  const n = Math.max(1, Math.round(len / (o.spacing ?? 1.9)));

  for (let i = 0; i <= n; i++) {
    const c = from + (len / n) * i;
    parts.push({
      geometry: new THREE.CylinderGeometry(0.038, 0.042, h, 7),
      matrix: axis === 'z' ? trs(o.at, h / 2, c) : trs(c, h / 2, o.at),
    });
  }
  for (const ry of [h - 0.02, h * 0.52]) {
    parts.push({
      geometry: new THREE.CylinderGeometry(0.042, 0.042, len, 7),
      matrix: axis === 'z'
        ? trs(o.at, ry, (from + to) / 2, Math.PI / 2, 0, 0)
        : trs((from + to) / 2, ry, o.at, 0, 0, Math.PI / 2),
    });
  }
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(bake(parts), o.mat ?? m.white);
  mesh.castShadow = true;
  mesh.name = 'openFrame';
  g.add(mesh);
  g.position.y = y;
  ctx.add(g);
  if (o.collide !== false) {
    /* Posts and the two pipes, not a slab. A slab fills the bays a
     * knife-edge line is aimed at. Floor at y so a deck rail does not
     * fill the undercroft. */
    for (let i = 0; i <= n; i++) {
      const c = from + (len / n) * i;
      if (axis === 'z') ctx.collide(o.at - 0.05, c - 0.05, o.at + 0.05, c + 0.05, y + h, y, true);
      else ctx.collide(c - 0.05, o.at - 0.05, c + 0.05, o.at + 0.05, y + h, y, true);
    }
    for (const ry of [h - 0.02, h * 0.52]) {
      if (axis === 'z') {
        ctx.collide(o.at - 0.05, from, o.at + 0.05, to, y + ry + 0.05, y + ry - 0.05, true);
      } else {
        ctx.collide(from, o.at - 0.05, to, o.at + 0.05, y + ry + 0.05, y + ry - 0.05, true);
      }
    }
  }
  return g;
}

/**
 * A soft patch of shade on the ground.
 *
 * Real cast shadows only come from geometry the sun can see; under a dense
 * canopy the ground still wants to break up into dappled light.  A few
 * low-opacity violet quads do that far more cheaply than more leaves, and
 * they stay out of the depth buffer so the ink pass ignores them.
 */
export function dapple(ctx, o) {
  const g = new THREE.Group();
  const rng = o.rng;
  const n = o.n ?? 7;
  const geo = new THREE.CircleGeometry(1, 10);
  geo.rotateX(-Math.PI / 2);
  const mat = flat({
    color: o.color ?? 0x8a7fae, transparent: true, opacity: o.opacity ?? 0.13,
    depthWrite: false, cache: false,
  });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const r = (o.r ?? 1.4) * rng.range(0.55, 1.35);
    d.position.set(o.x + rng.range(-o.spread, o.spread), (o.y ?? 0) + 0.03, o.z + rng.range(-o.spread, o.spread));
    d.rotation.set(0, rng.range(0, 3), 0);
    d.scale.set(r, 1, r * rng.range(0.7, 1.1));
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.userData.noOutline = true;
  inst.renderOrder = 1;
  g.add(inst);
  ctx.add(g);
  return g;
}
