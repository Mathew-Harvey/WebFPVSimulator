/*
 * cavity.js: air the town DRAWS and the town does not let you fly through.
 *
 * WHY A THIRD SCAN. ./scan.js measures solid volume ABOVE the drawn roof, and
 * scripts/gap-scan.js probes the inside of a compact collider. Between them
 * they find a bus shelter walled across its mouth and a barrier standing off
 * its wall. Neither can see the failure the owner reported on 2026-09-17,
 * which is the one a pilot meets most often: "the bridges over the canal seem
 * like you can fly under them but you can't". The undercroft of a bridge is
 * below the drawn deck, not above it, so the phantom scan calls the deck
 * honest; and the thing filling it was not a collider at all, so the gap scan
 * could not see it either. It was the CONTACT SURFACE. src/main.js asks
 * `view.height(x, z, y - SURFACE_BIAS)` every step and treats a craft below
 * the answer as buried, and the canal's `ctx.cut` set that surface to the bank
 * level right across a channel drawn 1.75 m deep. There was no box in the
 * water. There was a floor over it.
 *
 * SO THIS ONE ASKS THE PILOT'S QUESTION DIRECTLY. Voxelise the town. For each
 * cell ask two things that have nothing to do with each other:
 *
 *   DRAWN   is there anything drawn within TOL of this cell. The terrain
 *           answers for itself, from its own triangles, because a hillside's
 *           bounding box says nothing about one point on it.
 *   SOLID   would the craft be stopped here. That is the union of every
 *           collider box AND the contact floor, evaluated the way the frame
 *           loop evaluates it, `fromY` and all.
 *
 * A cell that is DRAWN-open and SOLID is a wall a pilot cannot see. Flood fill
 * the free air from the sky, then flood the blocked cells that TOUCH that air.
 * What comes out is one finding per opening, with its own box and its own
 * volume, and the reason it is solid: a collider index, or the floor.
 *
 * THE FLOOD IS THE WHOLE POINT, AND IT IS WHAT KEEPS A HOUSE OUT OF THE LIST.
 * The inside of a building is also DRAWN-open and SOLID: the walls are drawn,
 * the room between them is not, and the collider fills it. That is correct and
 * must not be reported. It is not reported because the room does not touch
 * free air: every path out of it crosses a drawn wall. An undercroft does
 * touch free air, at both ends, which is exactly why a pilot aims at it.
 *
 * IT IS OFF UNLESS ASKED FOR, like ./scan.js, and for the same reason: it
 * rasterises tens of millions of cells and no player's load should pay for a
 * diagnostic. globalThis.__CITY_CAVITY gates it and scripts/cavity-scan.js
 * sets the flag.
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
import { drawnBoxes } from './drawn.js';

/* Scratch for the instanced pass, module level so the traversal allocates
 * nothing per instance. */
const tmpInst = new THREE.Matrix4();
const tmpWorld = new THREE.Matrix4();
const tmpBox = new THREE.Box3();

/*
 * The cell, in metres. The craft is 0.347 m across its props, so an opening
 * under about 0.7 m is not a line anybody flies and a half metre cell is fine
 * to miss it. Finer than this and the grid stops fitting in a browser: the
 * town's colliders span 458 by 376 m.
 */
const CELL = 0.5;
/*
 * How far a cell has to stand off everything drawn before its being solid is
 * a complaint rather than modelling slack.
 *
 * A collider is a HULL over the drawing by construction, so it always stands
 * a little proud of it, and reporting that would drown the list. Two tenths
 * of a metre is under the craft's own radius, so a cell this scan calls open
 * is air a pilot can see between two drawn things.
 */
const TOL = 0.2;
/*
 * The mesh footprint above which a mesh may be terrain rather than a thing.
 *
 * The fit's own number is 1400 m2 and this started there, which put the
 * district's `road` mesh (1499 m2 of carriageway) on the terrain side. That
 * matters in exactly one place and it is the place this scan was written for:
 * the road is the only surface drawn over the canal at こばと橋, the terrain
 * grid having a hole there, so treating it as ground put the drawn ground at
 * the deck and hid the undercroft under it. Three thousand keeps the railway
 * ballast, the lake bed and the hills on the terrain side and puts every
 * paved surface on the other, where a plane raster describes it as the slab
 * it is.
 */
const TERRAIN_FOOTPRINT = 3000;
/* And the plan area one of its triangles has to cover before it is ground
 * rather than a leaf, a wire or a trunk. The terrain grid is 2 m, so its
 * triangles are 2 m2. */
const TERRAIN_TRI_AREA = 0.5;
/*
 * AND ONE MESH THAT IS GROUND WITHOUT BEING BIG ENOUGH TO LOOK LIKE IT.
 *
 * `tunnelCap` is the hillside put back over a bore: the terrain grid has a
 * hole cut in it for the notch and the cap is what fills the hole, drawn at
 * the same field the hills are. It is 1404 m2, under the footprint test,
 * which is arithmetic rather than meaning. Read as a thing instead of as
 * ground it is a 17 m tall surface with nothing under it, so the solid rock
 * of the mountain reads as 380 m3 of invisible wall and the one collider in
 * the town that stops a craft flying INTO a mountain looks like the worst
 * finding on the map.
 *
 * A name rather than a shape, because the shape is honestly ambiguous: the
 * district's `road` mesh is 1499 m2 of thin surface and must NOT be ground,
 * since it is the only thing drawn over the canal at こばと橋 and treating it
 * as ground is what hid that undercroft on the first run of this scan.
 */
const GROUND_NAME = /^tunnelCap/;
/*
 * How far the contact floor may stand over the drawn ground and still be
 * counted as the ground, WHERE THE GROUND IS DRAWN AT ALL.
 *
 * The answer is any distance, and that is a decision rather than laziness.
 * `heightAt` is not the terrain mesh: it is street height plus relief plus
 * hill, with cuts on top, and the mesh is a grid sampled from the same
 * functions, so the two disagree by centimetres over the town and by more on
 * a slope. Worse, several of the lake's meshes are big flat reflection art
 * drawn UNDER the water, and they are indistinguishable from terrain by size
 * and attitude, so they pulled the drawn surface a metre down over the whole
 * district and the scan reported the water as an invisible wall. A cut can
 * only ever LOWER the floor, and a platform is measured separately below, so
 * a floor standing over drawn ground is a sampling difference and not a
 * finding. The excavations, where a lifted floor really is the failure, draw
 * no terrain at all and are handled by the other branch. `maxLift` is
 * reported so a later round can see how much this hides.
 */
/* How far the contact query is made from, and how far a platform reaches for
 * a query. Both are src/main.js's, copied rather than imported because this
 * module must not drag the shell into a map. SURFACE_BIAS is 0.40 there and
 * the platform reach is 0.55 in world/index.js, so a deck is a floor from
 * 0.15 m under its own top. */
const SURFACE_BIAS = 0.40;
const PLATFORM_REACH = 0.55;
/* A finding smaller than this is modelling noise, not an opening. Eight cells
 * at half a metre is a cubic metre of solid air. */
const MIN_CELLS = 8;
/* And the ceiling on how many are reported, worst first. */
const KEEP = 220;

/* Bit index helpers. y is packed along the machine word, so setting a
 * vertical run is a handful of writes rather than one per cell. */
function wordsFor(ny) {
  return (ny + 31) >> 5;
}

/*
 * Set bits [a, b) of one column's bit run. Both are already clamped.
 */
function setRun(bits, base, a, b) {
  if (b <= a) {
    return;
  }
  let w0 = base + (a >> 5);
  const w1 = base + ((b - 1) >> 5);
  if (w0 === w1) {
    const mask = (0xffffffff >>> (31 - ((b - 1) & 31))) & (0xffffffff << (a & 31));
    bits[w0] |= mask;
    return;
  }
  bits[w0] |= (0xffffffff << (a & 31));
  for (w0 += 1; w0 < w1; w0 += 1) {
    bits[w0] = 0xffffffff;
  }
  bits[w1] |= (0xffffffff >>> (31 - ((b - 1) & 31)));
}

function getBit(bits, base, iy) {
  return (bits[base + (iy >> 5)] >>> (iy & 31)) & 1;
}

function setBit(bits, base, iy) {
  bits[base + (iy >> 5)] |= (1 << (iy & 31));
}

/*
 * EVERYTHING THE TOWN DRAWS, IN ONE TRAVERSAL, AND IN THREE WAYS.
 *
 * WHY NOT ./drawn.js, WHICH ALREADY DOES THIS. Because its subdivision is
 * capped, on purpose, and the cap is fatal here. It refuses to cut a mesh
 * into cells bigger than 2.5 m, so the canal's `canalChannel` -- two
 * revetment walls and a bed baked into one 207 m mesh -- keeps its bounding
 * box, and that box is the CHANNEL: 207 by 1.75 by 5 m of "drawn" over water
 * a quad flies along. Reading it, the scan called the whole reach solid on
 * purpose and found nothing. The fit can live with that because it only ever
 * grows a rectangle it was already given; a scan that asks "is anything drawn
 * here" cannot.
 *
 * So each mesh takes one of three routes.
 *
 *   TERRAIN, which is any triangle over TERRAIN_TRI_AREA in plan inside a
 *   mesh over TERRAIN_FOOTPRINT. It goes into a height field, because a
 *   hillside's box says nothing about one point on it, and everything under
 *   that height is ground. The cell centre has to be inside the triangle, not
 *   just inside its box: landform.js drops every triangle with a corner in
 *   the canal's excavation, so the ground genuinely stops at the channel, and
 *   a box test would bleed the bank's last triangle two metres out over the
 *   water and hide the very thing this scan is for.
 *
 *   INSTANCED, which is a prop, by one box per instance. Rasterising a
 *   grove's triangles per instance is three hundred thousand copies of a
 *   trunk and it answers nothing a box does not.
 *
 *   EVERYTHING ELSE, triangle by triangle, evaluating the triangle's own
 *   PLANE over each cell it covers. A triangle is planar by definition, so
 *   this is exact for a wall, a slab, a roof slope and a bridge soffit alike,
 *   and it is what makes a baked 207 m mesh describe its own two walls
 *   instead of the space between them.
 */
function rasterDrawn(root, g, mark, field, log) {
  let tris = 0;
  let inst = 0;
  const ax = [0, 0, 0];
  const bx = [0, 0, 0];
  const cx = [0, 0, 0];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.visible === false) {
      return;
    }
    const geo = o.geometry;
    if (!geo.boundingBox) {
      geo.computeBoundingBox();
    }
    const bb = geo.boundingBox;
    if (!bb) {
      return;
    }
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i += 1) {
        o.getMatrixAt(i, tmpInst);
        tmpWorld.multiplyMatrices(o.matrixWorld, tmpInst);
        tmpBox.copy(bb).applyMatrix4(tmpWorld);
        mark(tmpBox.min.x, tmpBox.min.y, tmpBox.min.z, tmpBox.max.x, tmpBox.max.y, tmpBox.max.z);
        inst += 1;
      }
      return;
    }
    const m = o.matrixWorld;
    const e = m.elements;
    const scale = Math.max(
      Math.hypot(e[0], e[1], e[2]),
      Math.hypot(e[8], e[9], e[10]),
    );
    const foot = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z) * scale * scale;
    let mname = o.name || '';
    for (let q = o.parent; q && !mname; q = q.parent) {
      mname = q.name || '';
    }
    const wide = foot > TERRAIN_FOOTPRINT || GROUND_NAME.test(mname);
    const attr = geo.attributes.position;
    if (!attr) {
      return;
    }
    const index = geo.index;
    const triCount = Math.floor((index ? index.count : attr.count) / 3);
    const at = (i, out) => {
      const x = attr.getX(i);
      const y = attr.getY(i);
      const z = attr.getZ(i);
      out[0] = e[0] * x + e[4] * y + e[8] * z + e[12];
      out[1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      out[2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    };
    let ground = 0;
    for (let t = 0; t < triCount; t += 1) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      at(i0, ax);
      at(i1, bx);
      at(i2, cx);
      const x0 = Math.min(ax[0], bx[0], cx[0]);
      const x1 = Math.max(ax[0], bx[0], cx[0]);
      const z0 = Math.min(ax[2], bx[2], cx[2]);
      const z1 = Math.max(ax[2], bx[2], cx[2]);
      if (x1 < g.x0 || x0 > g.x1 || z1 < g.z0 || z0 > g.z1) {
        continue;
      }
      const y0 = Math.min(ax[1], bx[1], cx[1]);
      const y1 = Math.max(ax[1], bx[1], cx[1]);
      /* Twice the signed area of the xz projection: a vertical face gives
       * zero, a terrain quad's half gives about four. */
      const d = (bx[0] - ax[0]) * (cx[2] - ax[2]) - (cx[0] - ax[0]) * (bx[2] - ax[2]);
      const flat = Math.abs(d) >= TERRAIN_TRI_AREA * 2;
      let ix0 = Math.floor((x0 - g.x0) / CELL);
      let ix1 = Math.floor((x1 - g.x0) / CELL);
      let iz0 = Math.floor((z0 - g.z0) / CELL);
      let iz1 = Math.floor((z1 - g.z0) / CELL);
      if (ix0 < 0) { ix0 = 0; }
      if (iz0 < 0) { iz0 = 0; }
      if (ix1 > g.nx - 1) { ix1 = g.nx - 1; }
      if (iz1 > g.nz - 1) { iz1 = g.nz - 1; }
      /* One triangle covering a quarter of the grid is a sphere's pole cap.
       * It answers nothing and costs everything. */
      if ((ix1 - ix0 + 1) * (iz1 - iz0 + 1) > 40000) {
        continue;
      }
      tris += 1;
      if (wide && flat) {
        /* Ground. Cell centre inside the triangle, plane's own height. */
        ground += 1;
        const inv = 1 / d;
        for (let ix = ix0; ix <= ix1; ix += 1) {
          const px = g.x0 + (ix + 0.5) * CELL;
          const row = ix * g.nz;
          for (let iz = iz0; iz <= iz1; iz += 1) {
            const pz = g.z0 + (iz + 0.5) * CELL;
            const w1 = ((px - ax[0]) * (cx[2] - ax[2]) - (cx[0] - ax[0]) * (pz - ax[2])) * inv;
            if (w1 < -1e-6 || w1 > 1 + 1e-6) {
              continue;
            }
            const w2 = ((bx[0] - ax[0]) * (pz - ax[2]) - (px - ax[0]) * (bx[2] - ax[2])) * inv;
            if (w2 < -1e-6 || w1 + w2 > 1 + 1e-6) {
              continue;
            }
            const y = ax[1] + w1 * (bx[1] - ax[1]) + w2 * (cx[1] - ax[1]);
            if (field[row + iz] < y) {
              field[row + iz] = y;
            }
          }
        }
        continue;
      }
      /* A thing. The triangle's plane over each cell it covers, clamped to
       * the triangle's own height, so a wall is its own thickness and a roof
       * slope is a staircase rather than the block under it. */
      if (Math.abs(d) < 1e-9) {
        for (let ix = ix0; ix <= ix1; ix += 1) {
          for (let iz = iz0; iz <= iz1; iz += 1) {
            mark(
              g.x0 + ix * CELL, y0, g.z0 + iz * CELL,
              g.x0 + (ix + 1) * CELL, y1, g.z0 + (iz + 1) * CELL,
            );
          }
        }
        continue;
      }
      const inv = 1 / d;
      for (let ix = ix0; ix <= ix1; ix += 1) {
        const qx0 = g.x0 + ix * CELL;
        for (let iz = iz0; iz <= iz1; iz += 1) {
          const qz0 = g.z0 + iz * CELL;
          let lo = Infinity;
          let hi = -Infinity;
          for (let k = 0; k < 4; k += 1) {
            const px = qx0 + (k & 1 ? CELL : 0);
            const pz = qz0 + (k & 2 ? CELL : 0);
            const w1 = ((px - ax[0]) * (cx[2] - ax[2]) - (cx[0] - ax[0]) * (pz - ax[2])) * inv;
            const w2 = ((bx[0] - ax[0]) * (pz - ax[2]) - (px - ax[0]) * (bx[2] - ax[2])) * inv;
            const y = ax[1] + w1 * (bx[1] - ax[1]) + w2 * (cx[1] - ax[1]);
            if (y < lo) { lo = y; }
            if (y > hi) { hi = y; }
          }
          if (lo < y0) { lo = y0; }
          if (hi > y1) { hi = y1; }
          if (hi < lo) {
            continue;
          }
          mark(qx0, lo, qz0, qx0 + CELL, hi, qz0 + CELL);
        }
      }
    }
    if (log) {
      log.push({ name: mname || '(unnamed)', foot: Math.round(foot), tris: triCount, ground });
    }
  });
  if (log) {
    log.tris = tris;
    log.inst = inst;
  }
  return field;
}

/*
 * A growable queue of packed cell indices. A flood over sixty million cells
 * has a frontier in the millions, so this is a typed array that doubles
 * rather than a JS array that reallocates on every push.
 */
function makeQueue() {
  let buf = new Int32Array(1 << 16);
  let head = 0;
  let tail = 0;
  return {
    push(v) {
      if (tail === buf.length) {
        if (head > buf.length >> 1) {
          buf.copyWithin(0, head, tail);
          tail -= head;
          head = 0;
        } else {
          const next = new Int32Array(buf.length * 2);
          next.set(buf.subarray(head, tail));
          tail -= head;
          head = 0;
          buf = next;
        }
      }
      buf[tail] = v;
      tail += 1;
    },
    pop() {
      const v = buf[head];
      head += 1;
      return v;
    },
    get size() {
      return tail - head;
    },
  };
}

/*
 * The scan.
 *
 * `world` is the town before bakeCity merges its meshes away, `colliders` the
 * built collider set. Both have to be the live ones, which is why this runs
 * from the one window in buildMap where they exist together.
 */
export function scanCavities(world, colliders, opts = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
  /* Bounds: everything solid, plus a metre of margin, and a ceiling because
   * nothing a pilot meets is above the tallest collider. */
  let x0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let z1 = -Infinity;
  let yTop = -Infinity;
  const n = colliders.fbox ? colliders.fbox.length : 0;
  for (let i = 0; i < n; i += 1) {
    if (!colliders.fbox[i]) {
      continue;
    }
    if (colliders.fax[i] < x0) { x0 = colliders.fax[i]; }
    if (colliders.faz[i] < z0) { z0 = colliders.faz[i]; }
    if (colliders.fbx[i] > x1) { x1 = colliders.fbx[i]; }
    if (colliders.fbz[i] > z1) { z1 = colliders.fbz[i]; }
    if (colliders.fby[i] > yTop) { yTop = colliders.fby[i]; }
  }
  if (!(x1 > x0)) {
    return { skipped: 'no colliders' };
  }
  const bx0 = opts.x0 ?? (Math.floor(x0) - 1);
  const bx1 = opts.x1 ?? (Math.ceil(x1) + 1);
  const bz0 = opts.z0 ?? (Math.floor(z0) - 1);
  const bz1 = opts.z1 ?? (Math.ceil(z1) + 1);
  /* Down to eight metres under the lowest ground a pilot can reach, which is
   * the canal bed and the lake, and up to a metre over the tallest collider.
   * A collider with no authored bottom starts sixty metres down and solid
   * rock is not something anyone flies into. */
  const by0 = opts.y0 ?? -4;
  const by1 = opts.y1 ?? (Math.ceil(yTop) + 1);
  const g = {
    x0: bx0,
    z0: bz0,
    y0: by0,
    x1: bx1,
    z1: bz1,
    y1: by1,
    nx: Math.ceil((bx1 - bx0) / CELL),
    nz: Math.ceil((bz1 - bz0) / CELL),
    ny: Math.ceil((by1 - by0) / CELL),
  };
  const wy = wordsFor(g.ny);
  const cells = g.nx * g.nz * g.ny;
  const drawn = new Uint32Array(g.nx * g.nz * wy);
  const solid = new Uint32Array(g.nx * g.nz * wy);
  const air = new Uint32Array(g.nx * g.nz * wy);
  const seen = new Uint32Array(g.nx * g.nz * wy);

  const colBase = (ix, iz) => (ix * g.nz + iz) * wy;
  const iyOf = (y) => Math.floor((y - g.y0) / CELL);
  const clampIy = (v) => (v < 0 ? 0 : (v > g.ny ? g.ny : v));

  /* ---------------------------------------------------------------- *
   * DRAWN, and the ground under it.
   * ---------------------------------------------------------------- */
  const markDrawn = (mx0, my0, mz0, mx1, my1, mz1) => {
    let ix0 = Math.floor((mx0 - TOL - g.x0) / CELL + 0.5);
    let ix1 = Math.floor((mx1 + TOL - g.x0) / CELL - 0.5);
    let iz0 = Math.floor((mz0 - TOL - g.z0) / CELL + 0.5);
    let iz1 = Math.floor((mz1 + TOL - g.z0) / CELL - 0.5);
    if (ix0 < 0) { ix0 = 0; }
    if (iz0 < 0) { iz0 = 0; }
    if (ix1 > g.nx - 1) { ix1 = g.nx - 1; }
    if (iz1 > g.nz - 1) { iz1 = g.nz - 1; }
    if (ix1 < ix0 || iz1 < iz0) {
      return;
    }
    const a0 = clampIy(Math.floor((my0 - TOL - g.y0) / CELL + 0.5));
    const a1 = clampIy(Math.floor((my1 + TOL - g.y0) / CELL - 0.5) + 1);
    if (a1 <= a0) {
      return;
    }
    for (let ix = ix0; ix <= ix1; ix += 1) {
      for (let iz = iz0; iz <= iz1; iz += 1) {
        setRun(drawn, colBase(ix, iz), a0, a1);
      }
    }
  };
  const terrainLog = [];
  const ground = rasterDrawn(
    world.root,
    g,
    markDrawn,
    new Float32Array(g.nx * g.nz).fill(-Infinity),
    terrainLog,
  );

  /* ---------------------------------------------------------------- *
   * THE CONTACT FLOOR, once, because both halves need it.
   *
   * `heightAt(x, z, -1000)` is the bare ground: fromY that far below puts
   * every platform out of reach, so what comes back is the graded surface
   * with the cuts applied and nothing else. That is the number the canal's
   * `ctx.cut` writes, and the number a craft under the road bridge is
   * measured against.
   * ---------------------------------------------------------------- */
  const bareField = new Float32Array(g.nx * g.nz);
  for (let ix = 0; ix < g.nx; ix += 1) {
    const x = g.x0 + (ix + 0.5) * CELL;
    for (let iz = 0; iz < g.nz; iz += 1) {
      const z = g.z0 + (iz + 0.5) * CELL;
      const v = world.heightAt(x, z, -1000);
      bareField[ix * g.nz + iz] = Number.isFinite(v) ? v : -Infinity;
    }
  }

  /* ---------------------------------------------------------------- *
   * WHICH BLANK COLUMNS ARE THE WORLD'S EDGE AND WHICH ARE AN EXCAVATION.
   *
   * Both draw no ground, and they want opposite answers. Out past the last
   * terrain tile the floor is the ground and the rock under it is nobody's
   * complaint; inside the canal the floor is a metre over the drawn bed and
   * that is the complaint. A column of blank ground reachable from the edge
   * of the scan without crossing drawn ground is the world's edge. A blank
   * region ringed by ground is a hole somebody cut, and it is exactly where
   * a pilot looks for a line.
   * ---------------------------------------------------------------- */
  const outside = new Uint8Array(g.nx * g.nz);
  {
    const stack = [];
    const seed = (ix, iz) => {
      const k = ix * g.nz + iz;
      if (outside[k] || Number.isFinite(ground[k])) {
        return;
      }
      outside[k] = 1;
      stack.push(k);
    };
    for (let ix = 0; ix < g.nx; ix += 1) {
      seed(ix, 0);
      seed(ix, g.nz - 1);
    }
    for (let iz = 0; iz < g.nz; iz += 1) {
      seed(0, iz);
      seed(g.nx - 1, iz);
    }
    while (stack.length > 0) {
      const k = stack.pop();
      const iz = k % g.nz;
      const ix = (k - iz) / g.nz;
      if (ix > 0) { seed(ix - 1, iz); }
      if (ix < g.nx - 1) { seed(ix + 1, iz); }
      if (iz > 0) { seed(ix, iz - 1); }
      if (iz < g.nz - 1) { seed(ix, iz + 1); }
    }
  }

  /* ---------------------------------------------------------------- *
   * The ground, and everything under it.
   *
   * Where the terrain draws a surface, that surface is the answer, lifted to
   * the contact floor wherever the floor is higher. See FLOOR_SLACK above
   * for why that lift is unconditional.
   *
   * Where the terrain draws nothing the answer depends on which kind of
   * blank it is. At the world's edge the floor answers and the rock under it
   * is not reported. Inside an excavation the answer is the underside of the
   * lowest thing that IS drawn in the column: in the channel that is the
   * bed, half a metre under the water, so the metre and a half of air over
   * it stays a question this scan is allowed to ask.
   * ---------------------------------------------------------------- */
  let groundCols = 0;
  let noTerrainCols = 0;
  let liftedCols = 0;
  let maxLift = 0;
  for (let ix = 0; ix < g.nx; ix += 1) {
    for (let iz = 0; iz < g.nz; iz += 1) {
      const base = colBase(ix, iz);
      const h = ground[ix * g.nz + iz];
      const bare = bareField[ix * g.nz + iz];
      if (Number.isFinite(h)) {
        groundCols += 1;
        let top = h;
        if (Number.isFinite(bare) && bare > h) {
          top = bare;
          if (bare - h > maxLift) {
            maxLift = bare - h;
          }
          liftedCols += 1;
        }
        setRun(drawn, base, 0, clampIy(iyOf(top + TOL) + 1));
        continue;
      }
      noTerrainCols += 1;
      let top = Number.isFinite(bare) ? clampIy(iyOf(bare) + 1) : 0;
      if (!outside[ix * g.nz + iz]) {
        for (let iy = 0; iy < top; iy += 1) {
          if (getBit(drawn, base, iy)) {
            top = iy;
            break;
          }
        }
      }
      setRun(drawn, base, 0, top);
    }
  }

  /* ---------------------------------------------------------------- *
   * SOLID, part one: every collider box.
   * ---------------------------------------------------------------- */
  for (let i = 0; i < n; i += 1) {
    if (!colliders.fbox[i]) {
      continue;
    }
    let ix0 = Math.floor((colliders.fax[i] - g.x0) / CELL + 0.5);
    let ix1 = Math.floor((colliders.fbx[i] - g.x0) / CELL - 0.5);
    let iz0 = Math.floor((colliders.faz[i] - g.z0) / CELL + 0.5);
    let iz1 = Math.floor((colliders.fbz[i] - g.z0) / CELL - 0.5);
    if (ix0 < 0) { ix0 = 0; }
    if (iz0 < 0) { iz0 = 0; }
    if (ix1 > g.nx - 1) { ix1 = g.nx - 1; }
    if (iz1 > g.nz - 1) { iz1 = g.nz - 1; }
    if (ix1 < ix0 || iz1 < iz0) {
      continue;
    }
    const a0 = clampIy(Math.floor((colliders.fay[i] - g.y0) / CELL + 0.5));
    const a1 = clampIy(Math.floor((colliders.fby[i] - g.y0) / CELL - 0.5) + 1);
    if (a1 <= a0) {
      continue;
    }
    for (let ix = ix0; ix <= ix1; ix += 1) {
      for (let iz = iz0; iz <= iz1; iz += 1) {
        setRun(solid, colBase(ix, iz), a0, a1);
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * SOLID, part two: the contact floor, which is the one this scan
   * exists for.
   *
   * src/main.js reads `view.height(x, z, y - SURFACE_BIAS)` and calls the
   * craft buried when the answer is over it. So a cell is solid when its own
   * centre is under the floor seen from it. A platform adds a band under its
   * own top, because `heightAt` only offers a platform within PLATFORM_REACH
   * of the query height, and that band is 0.15 m rather than 0.55.
   * ---------------------------------------------------------------- */
  const platGrid = new Map();
  const plats = world.platforms || [];
  for (let i = 0; i < plats.length; i += 1) {
    const p = plats[i];
    const a0 = Math.floor(p.x0 / 8);
    const a1 = Math.floor(p.x1 / 8);
    const b0 = Math.floor(p.z0 / 8);
    const b1 = Math.floor(p.z1 / 8);
    for (let a = a0; a <= a1; a += 1) {
      for (let b = b0; b <= b1; b += 1) {
        const k = `${a},${b}`;
        const bucket = platGrid.get(k);
        if (bucket === undefined) {
          platGrid.set(k, [i]);
        } else {
          bucket.push(i);
        }
      }
    }
  }
  let floorCells = 0;
  for (let ix = 0; ix < g.nx; ix += 1) {
    const x = g.x0 + (ix + 0.5) * CELL;
    for (let iz = 0; iz < g.nz; iz += 1) {
      const z = g.z0 + (iz + 0.5) * CELL;
      const base = colBase(ix, iz);
      const bare = bareField[ix * g.nz + iz];
      if (Number.isFinite(bare)) {
        const top = clampIy(Math.floor((bare - g.y0) / CELL - 0.5) + 1);
        setRun(solid, base, 0, top);
        floorCells += top;
      }
      const bucket = platGrid.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`);
      if (bucket === undefined) {
        continue;
      }
      for (let k = 0; k < bucket.length; k += 1) {
        const p = plats[bucket[k]];
        if (x <= p.x0 || x >= p.x1 || z <= p.z0 || z >= p.z1) {
          continue;
        }
        /* A platform may name a surface rather than a height. See
         * world/index.js heightAt. */
        const ptop = p.at === undefined ? p.top : p.at(x, z);
        if (!(ptop > bare)) {
          continue;
        }
        const a0 = clampIy(Math.floor((ptop - (PLATFORM_REACH - SURFACE_BIAS) - g.y0) / CELL + 0.5));
        const a1 = clampIy(Math.floor((ptop - g.y0) / CELL - 0.5) + 1);
        setRun(solid, base, a0, a1);
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * The free air, flooded from the sky and from the edges of the grid.
   * ---------------------------------------------------------------- */
  const pack = (ix, iy, iz) => (ix * g.nz + iz) * g.ny + iy;
  const q = makeQueue();
  const free = (ix, iy, iz) => {
    const base = colBase(ix, iz);
    return getBit(drawn, base, iy) === 0 && getBit(solid, base, iy) === 0;
  };
  const pushAir = (ix, iy, iz) => {
    const base = colBase(ix, iz);
    if (getBit(air, base, iy)) {
      return;
    }
    if (getBit(drawn, base, iy) || getBit(solid, base, iy)) {
      return;
    }
    setBit(air, base, iy);
    q.push(pack(ix, iy, iz));
  };
  for (let ix = 0; ix < g.nx; ix += 1) {
    for (let iz = 0; iz < g.nz; iz += 1) {
      pushAir(ix, g.ny - 1, iz);
    }
  }
  for (let iy = 0; iy < g.ny; iy += 1) {
    for (let ix = 0; ix < g.nx; ix += 1) {
      pushAir(ix, iy, 0);
      pushAir(ix, iy, g.nz - 1);
    }
    for (let iz = 0; iz < g.nz; iz += 1) {
      pushAir(0, iy, iz);
      pushAir(g.nx - 1, iy, iz);
    }
  }
  let airCells = 0;
  while (q.size > 0) {
    const v = q.pop();
    airCells += 1;
    const iy = v % g.ny;
    const rest = (v - iy) / g.ny;
    const iz = rest % g.nz;
    const ix = (rest - iz) / g.nz;
    if (ix > 0) { pushAir(ix - 1, iy, iz); }
    if (ix < g.nx - 1) { pushAir(ix + 1, iy, iz); }
    if (iz > 0) { pushAir(ix, iy, iz - 1); }
    if (iz < g.nz - 1) { pushAir(ix, iy, iz + 1); }
    if (iy > 0) { pushAir(ix, iy - 1, iz); }
    if (iy < g.ny - 1) { pushAir(ix, iy + 1, iz); }
  }

  /* ---------------------------------------------------------------- *
   * The findings: blocked cells that touch that air, grouped.
   * ---------------------------------------------------------------- */
  const blocked = (ix, iy, iz) => {
    const base = colBase(ix, iz);
    return getBit(drawn, base, iy) === 0 && getBit(solid, base, iy) === 1;
  };
  const touchesAir = (ix, iy, iz) => {
    if (ix > 0 && getBit(air, colBase(ix - 1, iz), iy)) { return true; }
    if (ix < g.nx - 1 && getBit(air, colBase(ix + 1, iz), iy)) { return true; }
    if (iz > 0 && getBit(air, colBase(ix, iz - 1), iy)) { return true; }
    if (iz < g.nz - 1 && getBit(air, colBase(ix, iz + 1), iy)) { return true; }
    if (iy > 0 && getBit(air, colBase(ix, iz), iy - 1)) { return true; }
    if (iy < g.ny - 1 && getBit(air, colBase(ix, iz), iy + 1)) { return true; }
    return false;
  };
  const findings = [];
  let blockedCells = 0;
  for (let ix = 0; ix < g.nx; ix += 1) {
    for (let iz = 0; iz < g.nz; iz += 1) {
      const base = colBase(ix, iz);
      for (let iy = 0; iy < g.ny; iy += 1) {
        if (getBit(seen, base, iy)) {
          continue;
        }
        if (!blocked(ix, iy, iz) || !touchesAir(ix, iy, iz)) {
          continue;
        }
        /* One component. */
        let cx0 = ix; let cx1 = ix; let cy0 = iy; let cy1 = iy; let cz0 = iz; let cz1 = iz;
        let count = 0;
        setBit(seen, base, iy);
        q.push(pack(ix, iy, iz));
        while (q.size > 0) {
          const v = q.pop();
          const jy = v % g.ny;
          const rest = (v - jy) / g.ny;
          const jz = rest % g.nz;
          const jx = (rest - jz) / g.nz;
          count += 1;
          if (jx < cx0) { cx0 = jx; } if (jx > cx1) { cx1 = jx; }
          if (jy < cy0) { cy0 = jy; } if (jy > cy1) { cy1 = jy; }
          if (jz < cz0) { cz0 = jz; } if (jz > cz1) { cz1 = jz; }
          const step = (kx, ky, kz) => {
            if (kx < 0 || ky < 0 || kz < 0 || kx >= g.nx || ky >= g.ny || kz >= g.nz) {
              return;
            }
            const b2 = colBase(kx, kz);
            if (getBit(seen, b2, ky)) {
              return;
            }
            if (!blocked(kx, ky, kz)) {
              return;
            }
            setBit(seen, b2, ky);
            q.push(pack(kx, ky, kz));
          };
          step(jx - 1, jy, jz); step(jx + 1, jy, jz);
          step(jx, jy, jz - 1); step(jx, jy, jz + 1);
          step(jx, jy - 1, jz); step(jx, jy + 1, jz);
        }
        blockedCells += count;
        if (count < MIN_CELLS) {
          continue;
        }
        findings.push({
          cells: count,
          vol: +(count * CELL * CELL * CELL).toFixed(1),
          box: [
            +(g.x0 + cx0 * CELL).toFixed(1), +(g.y0 + cy0 * CELL).toFixed(1), +(g.z0 + cz0 * CELL).toFixed(1),
            +(g.x0 + (cx1 + 1) * CELL).toFixed(1), +(g.y0 + (cy1 + 1) * CELL).toFixed(1), +(g.z0 + (cz1 + 1) * CELL).toFixed(1),
          ],
          at: [
            +(g.x0 + (cx0 + cx1 + 1) * 0.5 * CELL).toFixed(1),
            +(g.y0 + (cy0 + cy1 + 1) * 0.5 * CELL).toFixed(1),
            +(g.z0 + (cz0 + cz1 + 1) * 0.5 * CELL).toFixed(1),
          ],
          seed: [
            +(g.x0 + (ix + 0.5) * CELL).toFixed(2),
            +(g.y0 + (iy + 0.5) * CELL).toFixed(2),
            +(g.z0 + (iz + 0.5) * CELL).toFixed(2),
          ],
        });
      }
    }
  }
  findings.sort((a, b) => b.cells - a.cells);
  const kept = findings.slice(0, KEEP);

  /*
   * Why each finding is solid, which is the difference between a box to trim
   * and a floor to cut. Asked at the finding's own seed cell, against the same
   * two sources the raster used.
   */
  for (const f of kept) {
    const [sx, sy, sz] = f.seed;
    const bare = world.heightAt(sx, sz, -1000);
    f.floor = sy < bare ? +bare.toFixed(2) : null;
    f.terrain = null;
    {
      const ix = Math.floor((sx - g.x0) / CELL);
      const iz = Math.floor((sz - g.z0) / CELL);
      const h = ground[ix * g.nz + iz];
      f.terrain = Number.isFinite(h) ? +h.toFixed(2) : null;
    }
    f.plat = null;
    for (let k = 0; k < plats.length; k += 1) {
      const p = plats[k];
      if (sx <= p.x0 || sx >= p.x1 || sz <= p.z0 || sz >= p.z1) {
        continue;
      }
      if (!(p.top > bare)) {
        continue;
      }
      const ptop = p.at === undefined ? p.top : p.at(sx, sz);
      if (sy >= ptop - (PLATFORM_REACH - SURFACE_BIAS) && sy < ptop) {
        f.plat = +ptop.toFixed(2);
        break;
      }
    }
    f.hits = [];
    for (let i = 0; i < n && f.hits.length < 4; i += 1) {
      if (!colliders.fbox[i]) {
        continue;
      }
      if (sx < colliders.fax[i] || sx > colliders.fbx[i]) { continue; }
      if (sy < colliders.fay[i] || sy > colliders.fby[i]) { continue; }
      if (sz < colliders.faz[i] || sz > colliders.fbz[i]) { continue; }
      f.hits.push({
        i,
        kind: colliders.kindName(colliders.fkind[i]),
        box: [
          +colliders.fax[i].toFixed(2), +colliders.fay[i].toFixed(2), +colliders.faz[i].toFixed(2),
          +colliders.fbx[i].toFixed(2), +colliders.fby[i].toFixed(2), +colliders.fbz[i].toFixed(2),
        ],
      });
    }
  }

  /*
   * WHAT IS STANDING THERE, BY NAME.
   *
   * A finding is a box and a collider index, and neither says which of the
   * town's seventy builders to open. The drawn meshes do: the town names its
   * groups after what they are, so the nearest few names around a finding
   * read as `roadBridge`, `schoolLink`, `shotengaiArcade`. Measured off the
   * scene graph rather than off the collider, because the collider is what is
   * wrong and the drawing is what it was supposed to hug.
   */
  {
    const named = [];
    const nb = new THREE.Box3();
    world.root.traverse((o) => {
      if (!o.isMesh || !o.geometry || o.visible === false) {
        return;
      }
      if (!o.geometry.boundingBox) {
        o.geometry.computeBoundingBox();
      }
      if (!o.geometry.boundingBox) {
        return;
      }
      let name = o.name || '';
      for (let q = o.parent; q && !name; q = q.parent) {
        name = q.name || '';
      }
      if (!name) {
        return;
      }
      nb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      /* A mesh the size of a district names nothing: its box is within zero
       * metres of everything, so the hills and the root group would be the
       * answer to every finding in the town. */
      if ((nb.max.x - nb.min.x) * (nb.max.z - nb.min.z) > TERRAIN_FOOTPRINT
        || name === 'world') {
        return;
      }
      named.push([
        nb.min.x, nb.min.y, nb.min.z, nb.max.x, nb.max.y, nb.max.z, name,
      ]);
    });
    for (const f of kept) {
      const b = f.box;
      const hitNames = new Map();
      for (let i = 0; i < named.length; i += 1) {
        const q = named[i];
        const dx = Math.max(q[0] - b[3], b[0] - q[3], 0);
        const dy = Math.max(q[1] - b[4], b[1] - q[4], 0);
        const dz = Math.max(q[2] - b[5], b[2] - q[5], 0);
        const d = Math.hypot(dx, dy, dz);
        if (d > 2.5) {
          continue;
        }
        const prev = hitNames.get(q[6]);
        if (prev === undefined || d < prev) {
          hitNames.set(q[6], d);
        }
      }
      f.near = [...hitNames.entries()]
        .sort((p, r) => p[1] - r[1])
        .slice(0, 5)
        .map(([name, d]) => `${name}@${d.toFixed(1)}`);
    }
  }

  /*
   * WHAT THE FIT IS SHOWN AT ONE POINT.
   *
   * The fit can only ever be as tight as its picture of the drawing, and that
   * picture is ./drawn.js's boxes, which exist for a hundred milliseconds
   * inside buildMap and are then merged away. When a collider tops out well
   * over the roof under it, the question is always the same: which drawn box
   * is holding it up. This answers it. scripts/cavity-scan.js passes --fit=x,z.
   */
  const fitSeen = [];
  for (const pt of (opts.fit || [])) {
    const list = drawnBoxes(world.root, { maxFootprint: 1400, skip: opts.fitSkip || null });
    const rows = [];
    for (const b of list) {
      const r = pt[2] ?? 0;
      if (pt[0] < b.x0 - r || pt[0] > b.x1 + r || pt[1] < b.z0 - r || pt[1] > b.z1 + r) {
        continue;
      }
      rows.push({
        name: b.name,
        y: [+b.y0.toFixed(2), +b.y1.toFixed(2)],
        foot: [+(b.x1 - b.x0).toFixed(2), +(b.z1 - b.z0).toFixed(2)],
      });
    }
    rows.sort((a, b) => b.y[1] - a.y[1]);
    fitSeen.push({ at: pt, n: rows.length, rows: rows.slice(0, 18) });
  }

  /*
   * A named column, dumped cell by cell. Not part of the measurement: it is
   * how a round argues about one place without reading a million numbers.
   * scripts/cavity-scan.js passes --probe=x,z.
   */
  const probes = [];
  for (const pt of (opts.probe || [])) {
    const ix = Math.floor((pt[0] - g.x0) / CELL);
    const iz = Math.floor((pt[1] - g.z0) / CELL);
    if (ix < 0 || iz < 0 || ix >= g.nx || iz >= g.nz) {
      continue;
    }
    const base = colBase(ix, iz);
    const rows = [];
    for (let iy = 0; iy < g.ny; iy += 1) {
      const y = g.y0 + (iy + 0.5) * CELL;
      if (y < (pt[2] ?? -4) || y > (pt[3] ?? 6)) {
        continue;
      }
      rows.push(`${y.toFixed(2)} ${getBit(drawn, base, iy) ? 'D' : '.'}${getBit(solid, base, iy) ? 'S' : '.'}${getBit(air, base, iy) ? 'A' : '.'}`);
    }
    probes.push({
      at: [pt[0], pt[1]],
      terrain: Number.isFinite(ground[ix * g.nz + iz]) ? +ground[ix * g.nz + iz].toFixed(2) : null,
      bare: +bareField[ix * g.nz + iz].toFixed(2),
      outside: !!outside[ix * g.nz + iz],
      rows,
    });
  }

  return {
    fitSeen,
    probes,
    cell: CELL,
    tol: TOL,
    grid: [g.nx, g.ny, g.nz],
    cells,
    bounds: [g.x0, g.y0, g.z0, g.x1, g.y1, g.z1],
    drawnMeshes: terrainLog.length,
    drawnTris: terrainLog.tris,
    drawnInstances: terrainLog.inst,
    groundMeshes: terrainLog.filter((r) => r.ground > 0)
      .sort((p, r) => r.ground - p.ground).slice(0, 12),
    noTerrainCols,
    groundCols,
    liftedCols,
    maxLift: +maxLift.toFixed(2),
    outsideCols: outside.reduce((t, v) => t + v, 0),
    gridCols: g.nx * g.nz,
    colliders: n,
    airCells,
    blockedCells,
    floorCells,
    found: findings.length,
    blockedVolume: +(blockedCells * CELL * CELL * CELL).toFixed(1),
    list: kept,
    ms: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0),
  };
}
