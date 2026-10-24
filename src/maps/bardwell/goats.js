/*
 * goats.js: the goats of Joshua Bardwell's field. They graze, they run from
 * the craft when it comes close, and one that the craft catches makes
 * Nick Burns shout "Boom Shakala!" (the cue 'goat', src/render/clips.js).
 *
 * The owner, 2026-10-22: "in the bardwell map add roaming goats that run
 * from you so you can chase them, if you get them you get a boom shakla
 * sound".
 *
 * FOR THE LATENCY RULE. Render only: nothing here reaches the physics, the
 * plant or the colliders, and a goat is never solid (the craft flies through
 * one, which is how it catches it). Five goats are ONE InstancedMesh, one
 * draw call, about 170 triangles each, no shadow of their own, one material
 * that is the map's cel toon. Per frame: five small steps and five matrix
 * writes, no allocation, no raycast, nothing read back. Nothing is fetched
 * to build them; the one clip is fetched when a goat first runs from the
 * craft (about 10 kB), so a pilot who never goes to the field downloads
 * nothing.
 *
 * They are moved by the clock the map is handed (the sim's, as Nick is), not
 * by frame time, so a dropped frame changes nothing about where a goat is,
 * and a restart (the clock going back) puts them where they began.
 *
 * Plan metres on the page, the world's x and z in the code: the field's
 * pasture is a rectangle clear of the two cages in it.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { cel } from '../city/vendored/core/toon.js';
import { FRAME } from './bardwell.js';

/* The pasture, plan metres, inside the field's fences, and the cages in it
 * (a centre and a radius that clears the five metre cage). */
export const PASTURE = { x0: 52, x1: 86, y0: -46, y1: 34 };
const CAGE_CIRCLES = [
  { x: 77.3, y: 22.85, r: 5.2 },
  { x: 78.9, y: -28.0, r: 4.2 },
];

/* Where they begin, plan metres. */
const START = [[58, 4], [64, -6], [70, 10], [60, -14], [68, -2]];

/* The goat that wears the twelfth sticker (./stickers.js GOAT_STICKER). */
export const STICKER_GOAT = 2;

/* Their pelts: tints on a cream body (white, tan, brown, grey, pied). */
const PELTS = [0xfaf6ee, 0xd9b98a, 0x8a6a4a, 0xb4b4b0, 0xe8dcc8];

const ALARM = 24;
const CALM = 42;
const CATCH_R = 1.3;
const CATCH_H = 2.4;
const GRAZE_V = 0.8;
const RUN_V = 7.5;
const ACCEL = 14;
const TURN = 6;
const GONE_S = 4;
/* A goat runs this long, then stands blowing for this long wherever it is,
 * the craft close or not, so the sticker on one can be framed (the owner,
 * 2026-10-24: "the goat needs to stop running after you've chased it for a
 * bit otherwise i can't frame the sticker"). */
const TIRE_S = 6;
const TIRED_S = 14;

/* One goat, facing +x, standing on y 0: vertices with a colour each. */
function goatGeometry() {
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const FACES = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  ];
  const c = new THREE.Color();
  const box = (cx, cy, cz, sx, sy, sz, hex) => {
    c.set(hex);
    for (const [n, quad] of FACES) {
      const base = pos.length / 3;
      for (const [x, y, z] of quad) {
        pos.push(cx + x * sx / 2, cy + y * sy / 2, cz + z * sz / 2);
        nor.push(n[0], n[1], n[2]);
        col.push(c.r, c.g, c.b);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };
  const FUR = 0xffffff;
  const DARK = 0x4a3c34;
  const HORN = 0xd8cdb4;
  box(0, 0.58, 0, 0.92, 0.36, 0.3, FUR);
  box(0.5, 0.82, 0, 0.18, 0.42, 0.16, FUR);
  box(0.6, 1.04, 0, 0.3, 0.17, 0.15, FUR);
  box(0.74, 0.98, 0, 0.1, 0.1, 0.1, DARK);
  box(0.66, 0.88, 0, 0.05, 0.14, 0.05, FUR);
  box(0.54, 1.18, 0.05, 0.06, 0.2, 0.04, HORN);
  box(0.54, 1.18, -0.05, 0.06, 0.2, 0.04, HORN);
  box(0.52, 1.1, 0.1, 0.1, 0.05, 0.05, FUR);
  box(0.52, 1.1, -0.1, 0.1, 0.05, 0.05, FUR);
  box(-0.5, 0.74, 0, 0.1, 0.12, 0.05, FUR);
  for (const [lx, lz] of [[0.34, 0.1], [0.34, -0.1], [-0.34, 0.1], [-0.34, -0.1]]) {
    box(lx, 0.2, lz, 0.07, 0.4, 0.07, DARK);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* A seeded stream, so a goat's wandering is the same every run. */
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * The goats as a group to add to the map's scene, and an `update(step)` the
 * map calls on its clock. `craftAt()` is the craft's position in the world
 * or null, `cue(name)` the map's cue to the shell.
 */
export function makeGoats(craftAt = () => null, cue = () => {}) {
  const { OX, OZ } = FRAME;
  const toX = (px) => OX + px;
  const toZ = (py) => OZ - py;
  const box = {
    x0: toX(PASTURE.x0), x1: toX(PASTURE.x1), z0: toZ(PASTURE.y1), z1: toZ(PASTURE.y0),
  };
  const cages = CAGE_CIRCLES.map((k) => ({ x: toX(k.x), z: toZ(k.y), r: k.r }));
  const midX = (box.x0 + box.x1) / 2;
  const midZ = (box.z0 + box.z1) / 2;

  const material = cel({ color: 0xffffff, vertexColors: true, bands: 3, tint: 0x6c5f8c });
  const mesh = new THREE.InstancedMesh(goatGeometry(), material, START.length);
  mesh.name = 'bardwell goats';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  const tint = new THREE.Color();
  PELTS.forEach((hex, i) => mesh.setColorAt(i, tint.set(hex)));
  mesh.instanceColor.needsUpdate = true;

  const goats = START.map(([px, py], i) => ({
    i, x: toX(px), z: toZ(py), hd: 0, v: 0, mode: 'graze', t: 0, run: 0, tx: 0, tz: 0, jit: 0, jitT: 0,
    phase: i * 0.37, rnd: stream(0x9e3779b1 + i * 7919), home: [toX(px), toZ(py)],
  }));
  const dummy = new THREE.Object3D();
  let last = null;
  let caught = 0;
  let warmed = false;

  const reset = () => {
    for (const g of goats) {
      g.x = g.home[0];
      g.z = g.home[1];
      g.hd = g.rnd() * 6.2832;
      g.v = 0;
      g.mode = 'graze';
      g.t = 0;
      g.run = 0;
    }
  };
  reset();

  const inCage = (x, z, pad = 0) => cages.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + pad);

  /* Somewhere in the pasture, out of the cages and 25 m or more from the craft. */
  const farSpot = (g, q) => {
    let x = midX;
    let z = midZ;
    for (let k = 0; k < 12; k += 1) {
      x = box.x0 + g.rnd() * (box.x1 - box.x0);
      z = box.z0 + g.rnd() * (box.z1 - box.z0);
      if (!inCage(x, z, 1) && (!q || Math.hypot(x - q.x, z - q.z) > 25)) {
        break;
      }
    }
    return [x, z];
  };

  const turnTo = (g, want, dt) => {
    let d = want - g.hd;
    d -= Math.round(d / 6.2832) * 6.2832;
    const m = TURN * dt;
    g.hd += Math.abs(d) < m ? d : Math.sign(d) * m;
  };

  function step(g, dt, q) {
    const dx = q ? g.x - q.x : 0;
    const dz = q ? g.z - q.z : 0;
    const dist = q ? Math.hypot(dx, dz) : Infinity;
    if (g.mode === 'caught') {
      g.t -= dt;
      if (g.t <= 0) {
        [g.x, g.z] = farSpot(g, q);
        g.mode = 'graze';
        g.v = 0;
        g.t = 0;
        g.run = 0;
      }
      return;
    }
    if (q && dist < CATCH_R && q.y < CATCH_H) {
      g.mode = 'caught';
      g.t = GONE_S;
      caught += 1;
      cue('goat');
      return;
    }
    if (g.mode === 'graze' && dist < ALARM) {
      g.mode = 'flee';
      g.jitT = 0;
      if (!warmed) {
        warmed = true;
        cue('warm:goat');
      }
    } else if (g.mode === 'flee' && dist > CALM) {
      g.mode = 'graze';
      g.t = 0;
      g.run = 0;
    }
    if (g.mode === 'flee') {
      g.run += dt;
      if (g.run > TIRE_S) {
        g.mode = 'tired';
        g.t = TIRED_S;
      }
      g.jitT -= dt;
      if (g.jitT <= 0) {
        g.jit = (g.rnd() - 0.5) * 1.8;
        g.jitT = 0.5 + g.rnd() * 0.5;
      }
      /* Away from the craft, pushed in from the fence and round the cages. */
      let ax = dx / (dist || 1);
      let az = dz / (dist || 1);
      const edge = Math.min(g.x - box.x0, box.x1 - g.x, g.z - box.z0, box.z1 - g.z);
      if (edge < 8) {
        const w = (8 - edge) / 8 * 1.6;
        const mx = midX - g.x;
        const mz = midZ - g.z;
        const ml = Math.hypot(mx, mz) || 1;
        ax += mx / ml * w;
        az += mz / ml * w;
      }
      for (const k of cages) {
        const cx = g.x - k.x;
        const cz = g.z - k.z;
        const cd = Math.hypot(cx, cz);
        if (cd < k.r + 5) {
          const w = (k.r + 5 - cd) / 5;
          ax += cx / (cd || 1) * w;
          az += cz / (cd || 1) * w;
        }
      }
      turnTo(g, Math.atan2(-az, ax) + g.jit, dt);
      g.v = Math.min(RUN_V, g.v + ACCEL * dt);
    } else if (g.mode === 'tired') {
      /* Slows to a stop where it is, facing the way it ran. */
      g.t -= dt;
      g.v = Math.max(0, g.v - 10 * dt);
      if (g.t <= 0) {
        g.mode = 'graze';
        g.t = 0;
        g.run = 0;
      }
    } else {
      g.t -= dt;
      if (g.t <= 0) {
        g.t = 2 + g.rnd() * 5;
        if (g.rnd() < 0.45) {
          g.tx = g.x;
          g.tz = g.z;
        } else {
          g.tx = Math.min(box.x1 - 3, Math.max(box.x0 + 3, g.x + (g.rnd() - 0.5) * 16));
          g.tz = Math.min(box.z1 - 3, Math.max(box.z0 + 3, g.z + (g.rnd() - 0.5) * 16));
        }
      }
      const tdx = g.tx - g.x;
      const tdz = g.tz - g.z;
      if (Math.hypot(tdx, tdz) > 0.5 && !inCage(g.tx, g.tz, 0.5)) {
        turnTo(g, Math.atan2(-tdz, tdx), dt);
        g.v = Math.min(GRAZE_V, g.v + ACCEL * dt);
      } else {
        g.v = Math.max(0, g.v - ACCEL * dt);
      }
    }
    g.x += Math.cos(g.hd) * g.v * dt;
    g.z -= Math.sin(g.hd) * g.v * dt;
    g.x = Math.min(box.x1, Math.max(box.x0, g.x));
    g.z = Math.min(box.z1, Math.max(box.z0, g.z));
    g.phase += g.v * dt * 3.2;
  }

  function update(ms) {
    const q = craftAt();
    let dt = last === null ? 0 : (ms - last) / 1000;
    if (dt < 0) {
      reset();
      dt = 0;
    }
    last = ms;
    /* A long stall or a pause is one step of a tenth of a second at most. */
    dt = Math.min(dt, 0.1);
    for (const g of goats) {
      if (dt > 0) {
        step(g, dt, q);
      }
      let s = 1;
      let hop = 0;
      if (g.mode === 'caught') {
        const age = GONE_S - g.t;
        hop = age < 0.5 ? Math.sin(age / 0.5 * 3.1416) * 1.2 : 0;
        s = age < 0.5 ? 1 + age * 0.4 : 0.0001;
      } else if (g.v > 0.1) {
        /* A triangle wave bounce, quicker at a run. */
        const f = g.phase - Math.floor(g.phase);
        hop = (f < 0.5 ? f : 1 - f) * (g.mode === 'flee' ? 0.22 : 0.05);
      }
      dummy.position.set(g.x, hop, g.z);
      dummy.rotation.set(0, g.hd, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(g.i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /* Where goat i is, which way it faces, and whether it is on the field. */
  const pose = (i) => ({ x: goats[i].x, z: goats[i].z, hd: goats[i].hd, shown: goats[i].mode !== 'caught' });

  return { group: mesh, update, pose, stats: () => ({ goats: goats.length, caught }) };
}
