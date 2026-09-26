/*
 * place.js: a freestyle map document, placed in the world. Pure: no
 * Three.js, no DOM, no JS trigonometry.
 *
 * Everything a built map needs to know about where things are comes out of
 * here: each element's world position and heading, the solids the physics
 * will hold, the named gaps, and where the pilot starts. The map
 * (./index.js) draws what this places; the track builder's warnings and
 * scripts/props-check.js read the same answer in Node. One function, so the
 * three cannot disagree about where a building is.
 *
 * THE FRAMES. The document is right handed, Z up, origin at the plot's near
 * left corner (src/trackbuilder/schema.md). The world is Three.js metres, Y
 * up, origin at the plot's middle. The conversion is the one
 * src/game/trackdoc.js makes for race tracks, applied here once, in
 * docToWorld:
 *
 *   worldX =  docX - width / 2
 *   worldZ = -(docY - depth / 2)
 *   worldY =  docZ                  the ground is flat, at 0
 *
 * A document yaw is a heading about up, counter clockwise from +x seen from
 * above, and that is exactly Object3D.rotation.y in the world, because the
 * document's +y is the world's -z. An aperture's yaw is its plane normal,
 * and src/props/course.js builds gates with their normal on local +x, so it
 * takes the same number. A heading an asset cannot hold (a building at 40
 * degrees) is snapped by src/props/solids.js placedYaw, for the solids AND
 * the drawing.
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

import { ELEMENTS, KIND } from '../../trackbuilder/elements.js';
import { assetOf, partsOf } from '../../props/catalog.js';
import { placeSolids, placedYaw } from '../../props/solids.js';
import { sincos, turnY } from '../../props/trig.js';
import { startBlockLaneOffset } from '../../art/startblock.js';

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

/*
 * THE CONVERSION ITSELF, for one point: the document's plan (x, y) and a
 * height z, as a world point into `out`. Every element's place goes through
 * here (placeDocument, spawnFrom), and so does every road point
 * (./traffic.js), so a road cannot be laid in a different frame from the
 * buildings beside it. Subtractions and a negation: exact where the inputs
 * are, and the same bits in every engine.
 */
export function docToWorld(W, D, x, y, z, out = { x: 0, y: 0, z: 0 }) {
  out.x = x - W / 2;
  out.y = z;
  out.z = -(y - D / 2);
  return out;
}
const AT = { x: 0, y: 0, z: 0 };

/* Wrap to (-pi, pi] by adding or subtracting whole turns: arithmetic only. */
function wrap(a) {
  let x = a;
  while (x <= -Math.PI) {
    x += TAU;
  }
  while (x > Math.PI) {
    x -= TAU;
  }
  return x;
}

/*
 * THE GROUND UNDER A POINT: the highest solid box top whose plan footprint
 * holds (x, z) and whose top is no more than PLATFORM_REACH over fromY, or
 * the paving at 0 when there is none. The built map's `height` is this, a
 * millimetre under a top (groundUnder, below), so it is on the physics
 * path: the shell asks it for the plane it hands the plant on every 1 ms
 * step, five more times every eight steps for the slope, and for the spawn
 * seat. Plain comparisons only.
 *
 * The reach is the town's, 0.55 m (heightAt in
 * src/maps/city/vendored/world/index.js, restated in
 * src/maps/city/cavity.js), restated here because importing either would
 * drag the town into the builder. It is what lets a craft fly UNDER a deck
 * and land ON it: the shell asks from 0.40 m under the CG (SURFACE_BIAS in
 * src/main.js), so a top is in reach up to 0.15 m OVER the CG. The town's
 * decks are thick, and their underside stops a craft long before that. A
 * built map's are not: a scaffold board is 5 cm, an open container's roof
 * 10 cm, and a craft climbing under one had its top handed to it as the
 * ground and was lifted up through it in one step, with no contact. So the
 * shell also passes the CG, cgY, and a box whose bottom is over the CG is
 * over the craft and is never its ground, however thin. Omit cgY and no
 * box is left out for that (the spawn seat, the obstacles, the intro
 * camera ask with a fromY that is not a craft's). Omit fromY as well and
 * every top counts, as in the town.
 *
 * The footprint test is strict, the way the plant's own support test is
 * (world_select_support in src/native/world.c): a point on a box's edge is
 * not over it. Only boxes: a capsule is a pole, a bar or a lattice member,
 * and nothing a craft stands on.
 */
export const PLATFORM_REACH = 0.55;

/*
 * Filed on a grid, because the shell calls the query thousands of times a
 * second and a map may hold twenty thousand solids. Each box is filed in
 * every TOP_CELL square its footprint reaches, not by its centre, so a
 * query reads the one cell its point is in and never a neighbour's. Each
 * cell's boxes are sorted highest top first, so the first one that holds
 * the point within reach, and is not over the CG, is the answer and the
 * walk stops there.
 */
const TOP_CELL = 4;

/*
 * Build the index once per placement. Returns an object topUnder reads.
 * A box whose plan edges are not finite is a layout bug, which
 * scripts/props-check.js fails, and it is not filed; neither is one whose
 * top is at or under the paving, which can never be the answer.
 */
export function indexTops(solids) {
  const boxes = [];
  for (const s of solids) {
    const b = s.box;
    if (b && b[4] > 0 && Number.isFinite(b[0]) && Number.isFinite(b[2])
      && Number.isFinite(b[3]) && Number.isFinite(b[5]) && b[0] < b[3] && b[2] < b[5]) {
      boxes.push(b);
    }
  }
  const n = boxes.length;
  const ix = {
    n, ox: 0, oz: 0, nx: 0, nz: 0,
    start: new Int32Array(1), items: new Int32Array(0),
    x0: new Float64Array(n), z0: new Float64Array(n),
    x1: new Float64Array(n), z1: new Float64Array(n),
    top: new Float64Array(n), bottom: new Float64Array(n),
  };
  if (!n) {
    return ix;
  }
  let ox = Infinity;
  let oz = Infinity;
  let ex = -Infinity;
  let ez = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const b = boxes[i];
    ix.x0[i] = b[0];
    ix.z0[i] = b[2];
    ix.x1[i] = b[3];
    ix.z1[i] = b[5];
    ix.top[i] = b[4];
    ix.bottom[i] = b[1];
    ox = b[0] < ox ? b[0] : ox;
    oz = b[2] < oz ? b[2] : oz;
    ex = b[3] > ex ? b[3] : ex;
    ez = b[5] > ez ? b[5] : ez;
  }
  ix.ox = ox;
  ix.oz = oz;
  ix.nx = Math.floor((ex - ox) / TOP_CELL) + 1;
  ix.nz = Math.floor((ez - oz) / TOP_CELL) + 1;
  const cells = [];
  for (let c = 0; c < ix.nx * ix.nz; c += 1) {
    cells.push([]);
  }
  for (let i = 0; i < n; i += 1) {
    const cx0 = Math.floor((ix.x0[i] - ox) / TOP_CELL);
    const cx1 = Math.floor((ix.x1[i] - ox) / TOP_CELL);
    const cz0 = Math.floor((ix.z0[i] - oz) / TOP_CELL);
    const cz1 = Math.floor((ix.z1[i] - oz) / TOP_CELL);
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cz = cz0; cz <= cz1; cz += 1) {
        cells[cx * ix.nz + cz].push(i);
      }
    }
  }
  let total = 0;
  for (const list of cells) {
    total += list.length;
  }
  ix.start = new Int32Array(cells.length + 1);
  ix.items = new Int32Array(total);
  let k = 0;
  for (let c = 0; c < cells.length; c += 1) {
    /* Highest first; equal tops in solid order, so the list is the same
     * on every engine whatever its sort does with ties. */
    const list = cells[c].sort((a, b) => ix.top[b] - ix.top[a] || a - b);
    ix.start[c] = k;
    for (const i of list) {
      ix.items[k] = i;
      k += 1;
    }
  }
  ix.start[cells.length] = k;
  return ix;
}

/*
 * The query. `src` is an index from indexTops, or a plain list of solids,
 * which is walked whole: the same answer, slowly, and the definition the
 * index is checked against. A box with its bottom over cgY is skipped and
 * the walk goes on to the next top down.
 */
export function topUnder(src, x, z, fromY, cgY) {
  const reach = fromY === undefined ? Infinity : fromY + PLATFORM_REACH;
  const cg = cgY === undefined ? Infinity : cgY;
  if (Array.isArray(src)) {
    let best = 0;
    for (const s of src) {
      const b = s.box;
      if (b && b[4] > best && b[4] <= reach && !(b[1] > cg)
        && x > b[0] && x < b[3] && z > b[2] && z < b[5]) {
        best = b[4];
      }
    }
    return best;
  }
  const ix = src;
  if (!ix || !ix.n) {
    return 0;
  }
  const cx = Math.floor((x - ix.ox) / TOP_CELL);
  const cz = Math.floor((z - ix.oz) / TOP_CELL);
  if (!(cx >= 0 && cx < ix.nx && cz >= 0 && cz < ix.nz)) {
    return 0;
  }
  const c = cx * ix.nz + cz;
  for (let k = ix.start[c]; k < ix.start[c + 1]; k += 1) {
    const i = ix.items[k];
    const top = ix.top[i];
    if (top <= reach && !(ix.bottom[i] > cg)
      && x > ix.x0[i] && x < ix.x1[i] && z > ix.z0[i] && z < ix.z1[i]) {
      return top;
    }
  }
  return 0;
}

/*
 * THE BUILT MAP'S `height`: topUnder, a millimetre under any box top.
 *
 * The plant stands a craft on a box top itself when the top is strictly
 * above the plane the shell raised (world_select_support in
 * src/native/world.c), and the box it holds is the float32 of the top. A
 * plane AT the top ties with it, and the tie goes whichever way float32
 * rounded that top. Measured on the starter's stairs with the shell's own
 * ground handling: the treads at 0.51 and 1.02 m round down, so the plant
 * took the shell's limited plane there, a 26 degree slope across the
 * risers, and a craft set down on either slid 0.19 m and leaned on the next
 * riser (1512 steps of world contact in 2.5 s), where every tread that
 * rounds up held it flat. A millimetre under the top, the box always wins,
 * so a craft over a box stands on exactly the box it stood on while the
 * height was 0 everywhere, and what the shell learns (the spawn seat, the
 * altitude, the obstacles, the set down) is a roof and not the paving. A
 * millimetre is more than float32's rounding of any top under a kilometre
 * and less than anything a pilot or the plant can tell apart: a craft
 * seated a millimetre low settles to the same rest height, with no speed.
 */
export const SUPPORT_TIE = 0.001;

export function groundUnder(src, x, z, fromY, cgY) {
  const top = topUnder(src, x, z, fromY, cgY);
  return top > 0 ? top - SUPPORT_TIE : 0;
}

/*
 * Where a pilot with no start pads starts: eight metres in from the plot's
 * west edge, on its middle line, facing across it, on whatever is laid
 * there.
 */
function defaultSpawn(W, tops) {
  const x = -W / 2 + 8;
  return { x, y: topUnder(tops, x, 0, 0), z: 0, yaw: -HALF_PI, base: 0 };
}

/*
 * THE SPAWN, from the start pads, in the shell's convention.
 *
 * A pads element's yaw is the way the craft faces, and src/game/trackdoc.js
 * turns it into the shell's spawn heading with
 * headingForTravel(cos yaw, -sin yaw) = atan2(-cos yaw, sin yaw), which is
 * yaw - pi/2 for every yaw. Written as the subtraction, so the heading the
 * physics frame is seated at never passes through JS trigonometry.
 *
 * ON A MAT, not between two. The element's middle is bare paving whenever
 * it has an even number of pads, so the craft goes where the race path puts
 * it, startBlockLaneOffset along the row, which is the pads' local z (see
 * padsLayout in src/props/course.js). The row is turned by the pads' placed
 * heading with ./trig.js, because this point is where the plant's frame is
 * seated.
 *
 * AT ITS SEAT, not at 0. `base` is the Base the author gave the pads, and
 * the seat is what the craft actually stands on there: a roof the pads
 * were raised onto, or the paving when they were raised over nothing. The
 * builder warns when the two differ (fs-pads-seat in
 * src/trackbuilder/warnings.js). The shell asks `height` from spawn.y
 * (adoptSpawn in src/main.js), which finds this same top and answers a
 * millimetre under it, so the craft is put on the seat.
 */
const SC = { s: 0, c: 1 };
const LANE = { x: 0, z: 0 };

/* The row as padsLayout draws it, which clamps what startBlockLaneOffset
 * does not: 1 to 12 pads, at least 0.3 m apart. The same numbers for any
 * row the builder makes, and a mat under the craft for a hand edited one
 * too, where 20 pads or a spacing of 0 put it off the end of the row. */
function laneOffset(dims) {
  const n = Math.round(dims.pads ?? 1);
  return startBlockLaneOffset({
    pads: n < 1 ? 1 : n > 12 ? 12 : n,
    spacing: Math.max(0.3, dims.spacing ?? 1.5),
  });
}

function spawnFrom(el, yaw, W, D, tops) {
  const base = el.position.z || 0;
  sincos(yaw, SC);
  turnY(0, laneOffset(el.dims), SC.s, SC.c, LANE);
  docToWorld(W, D, el.position.x, el.position.y, base, AT);
  const x = AT.x + LANE.x;
  const z = AT.z + LANE.z;
  return {
    x,
    y: topUnder(tops, x, z, base),
    z,
    yaw: wrap(el.yaw - HALF_PI),
    base,
  };
}

/*
 * Place a normalized document. Returns
 *
 *   { W, D, items, solids, tops, zones, spawn, stats }
 *
 *   items   [{ el, kind, x, y, z, yaw, turns, parts }]  every drawable
 *           element: yaw is the placed (possibly snapped) world heading;
 *           the start pads' y is the spawn's seat, on the mat the craft
 *           starts on and not under the row's middle, so the craft's own
 *           mat is drawn under it. A row laid across two heights has its
 *           other mats floating or buried, and fs-pads-seat in
 *           src/trackbuilder/warnings.js says so
 *   solids  what src/props/solids.js placeSolids makes of every item
 *   tops    the box tops, indexed for topUnder
 *   zones   [{ el, x, y, z, yaw, w, h, name, points }] the named gaps
 *   spawn   { x, y, z, yaw, base } in the shell's convention: y is the
 *           seat and base the Base the author gave the pads (0 with none)
 */
export function placeDocument(doc) {
  const W = doc.field.width;
  const D = doc.field.depth;
  const items = [];
  const solids = [];
  const zones = [];
  const stats = { inflated: 0 };
  let start = null;
  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    if (!def) {
      continue;
    }
    docToWorld(W, D, el.position.x, el.position.y, el.position.z || 0, AT);
    const { x, y, z } = AT;
    if (def.kind === KIND.START && !start) {
      start = el;
    }
    if (def.kind === KIND.ZONE) {
      zones.push({
        el,
        x,
        y,
        z,
        yaw: el.yaw || 0,
        w: el.dims.width,
        h: el.dims.height,
        name: el.name || 'GAP',
        points: el.points,
      });
      continue;
    }
    const asset = assetOf(el);
    if (!asset) {
      continue;
    }
    const turns = asset.turns ?? 'any';
    const yaw = placedYaw(turns, el.yaw || 0);
    const parts = partsOf(el);
    placeSolids(parts, x, y, z, yaw, turns, solids, stats);
    items.push({ el, kind: def.kind, x, y, z, yaw, turns, parts });
  }
  /* The spawn is seated after everything is placed, because the roof the
   * pads stand on may come later in the document than the pads. */
  const tops = indexTops(solids);
  let spawn;
  if (start) {
    const pads = items.find((it) => it.el === start);
    spawn = spawnFrom(start, pads ? pads.yaw : placedYaw('any', start.yaw), W, D, tops);
    if (pads) {
      pads.y = spawn.y;
    }
  } else {
    spawn = defaultSpawn(W, tops);
  }
  return { W, D, items, solids, tops, zones, spawn, stats };
}
