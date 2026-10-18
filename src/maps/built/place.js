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
import { SEAT_SLACK, hasRaised, seatFloating } from '../../trackbuilder/seat.js';
import { assetOf, placedPartsOf } from '../../props/catalog.js';
import { placeSolids, placedYaw } from '../../props/solids.js';
import { sincos, turnY } from '../../props/trig.js';
import { CAR_KINDS } from '../../props/street.js';
import { startBlockLaneOffset } from '../../art/startblock.js';
import { roadOf } from './road.js';

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
 * scripts/props-check.js fails, and it is not filed. A box whose top is at
 * or under the paving is filed: it is never topUnder's answer unless the
 * caller asks below the paving (`none`), and a basement's floor and
 * furniture are only ever under it.
 */
export function indexTops(solids) {
  const boxes = [];
  for (const s of solids) {
    const b = s.box;
    if (b && Number.isFinite(b[4]) && Number.isFinite(b[0]) && Number.isFinite(b[2])
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
 * the walk goes on to the next top down. `none` is the answer when no top
 * is found, and the list's walk takes no top at or under it: 0 by default,
 * the paving, so a top below the paving is no top; -Infinity from
 * groundUnder, which decides about those itself.
 */
export function topUnder(src, x, z, fromY, cgY, none = 0) {
  const reach = fromY === undefined ? Infinity : fromY + PLATFORM_REACH;
  const cg = cgY === undefined ? Infinity : cgY;
  if (Array.isArray(src)) {
    let best = none;
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
    return none;
  }
  const cx = Math.floor((x - ix.ox) / TOP_CELL);
  const cz = Math.floor((z - ix.oz) / TOP_CELL);
  if (!(cx >= 0 && cx < ix.nx && cz >= 0 && cz < ix.nz)) {
    return none;
  }
  const c = cx * ix.nz + cz;
  for (let k = ix.start[c]; k < ix.start[c + 1]; k += 1) {
    const i = ix.items[k];
    const top = ix.top[i];
    if (top <= reach && !(ix.bottom[i] > cg)
      && x > ix.x0[i] && x < ix.x1[i] && z > ix.z0[i] && z < ix.z1[i]) {
      /* Highest first, so every top after this one is lower still. */
      return top > none ? top : none;
    }
  }
  return none;
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

/*
 * `floor` is the ground where no top is found, the paving's 0 unless the
 * map digs below it. Nick Burns' house has a basement (extra.floor in
 * ./index.js): inside its foundation walls the ground a craft stands on is
 * the basement's floor, 7 m under the lawn, and every top down there is
 * under 0. A top at or under the floor is the floor, so with the paving's
 * 0 this answers exactly what it answered before there was a floor to ask
 * about: a top under the paving was never ground.
 */
export function groundUnder(src, x, z, fromY, cgY, floor = 0) {
  const top = topUnder(src, x, z, fromY, cgY, -Infinity);
  return top > floor ? top - SUPPORT_TIE : floor;
}

/*
 * WHERE A PILOT WITH NO START PADS STARTS: in the open, as near as the map
 * allows to the point eight metres in from the plot's west edge on its
 * middle line, facing across the plot.
 *
 * That point used to be the start whatever stood on it. A pilot, on 28
 * September 2026: "it spawns me inside a pylon i can't get out". A pylon
 * over the point is the case nothing caught, because the builder's metre
 * of air (fs-spawn in src/trackbuilder/warnings.js) is measured from the
 * craft to its nearest solid, and a pylon's legs and braces are all further
 * off than that: the craft sat in the middle of the lattice, 3.26 m from
 * its nearest member, with the peak over it, and the builder said nothing.
 * A building or a stack of containers over the point started the craft
 * inside the solid, which the builder did warn about, and the simulator
 * started it there anyway. The owner, the same day: "no matter the map
 * someone builds, the quad has to spawn in open space, unless they build
 * launch pads then from the launch pads". So the point is only where the
 * search starts, and pads are spawnFrom's, below, wherever they stand.
 *
 * OPEN is three things, all measured in plan:
 *
 *   nothing solid within OPEN_CLEAR of the craft's centre across the
 *     ground, at ANY height over the paving. That is a metre of air round
 *     the craft and open sky over it, so a craft that climbs straight up
 *     meets nothing: under a pylon's peak, a crane's jib, a tree's canopy
 *     or a footbridge's deck is not open, however much air there is at the
 *     craft's own height. It also puts the craft on the paving, since a
 *     spot a metre clear of every box has no box under it;
 *   no road within a car's reach of it and OPEN_CLEAR more, because a car
 *     would drive through a craft waiting there, which is the owner's rule
 *     for where a crash is set down (findRestSpot in src/game/collide.js,
 *     2026-09-26) and rd-start's in the builder;
 *   on the plot, OPEN_CLEAR in from its edge.
 *
 * THE SEARCH walks a lattice OPEN_STEP apart round the point, nearest
 * first, and the first open spot is the start. Nearest is counted in whole
 * lattice steps squared, which are integers and so exact, and a tie goes
 * east, the way the craft faces, then north. The point itself is asked
 * first, against every solid in turn, because most maps leave it open and
 * those pay for one walk of the list and nothing else: the start is then
 * the one this function always gave, to the bit. When the plot has no open
 * ground at all (a small plot with a big thing on it), the start is the
 * nearest open ground off its edge, up to OPEN_OFF out, facing into it.
 * When there is none there either, it is the point, on whatever is laid
 * there, as it always was, and fs-spawn says what that is inside.
 *
 * ARITHMETIC ONLY, like the rest of this file: every distance is compared
 * squared, the roads are ./road.js's lines, which keep the same rule, and
 * the heading is a quarter turn written as the constant. So the start the
 * plant's frame is seated at is the same bits in every engine.
 *
 * `from` on the spawn says which start it is, for the builder's note
 * (fs-no-start): 'pads' (spawnFrom), 'point', 'open', 'off' or 'blocked'.
 */

/* The air round the start and the sky over it: the builder's SPAWN_CLEAR,
 * which is this, "the air the craft needs round the start to take off". */
export const OPEN_CLEAR = 1.0;
/* Where the search starts, in from the plot's west edge, m. */
export const OPEN_POINT_IN = 8;
/* The lattice, m: fine enough to find a spot between two things a couple
 * of metres apart, coarse enough that a whole plot is a few hundred
 * thousand spots at worst. */
const OPEN_STEP = 0.5;
/* How far past the plot's edge the search looks when the plot has none, m. */
const OPEN_OFF = 32;
/* The plan cell the blockers are filed in once the point is not open, m. */
const OPEN_CELL = 4;
/* A cell's key is its column times this plus its row: one key per cell for
 * any row within 2^25 cells of the origin. Past that, on a plot no builder
 * makes, two cells may share a list, which costs a spot a few more tests
 * and never changes its answer: every blocker in a list is measured. */
const OPEN_KEY = 67108864;

/*
 * The furthest any car reaches from the line it drives: half the diagonal
 * of the biggest of the town's cars, which a drift car's corners sweep as
 * it slides. roadReach in src/trackbuilder/roadtool.js measures a road by
 * the cars actually on it and never finds more than this, so a start held
 * this far off every lane is one rd-start never warns about. Taken once,
 * when the module loads, with a square root, which IEEE 754 rounds the same
 * in every engine.
 */
const CAR_REACH = Object.values(CAR_KINDS).reduce(
  (m, k) => Math.max(m, Math.sqrt(k.L * k.L + k.W * k.W) / 2), 0);

/*
 * Everything that keeps the start away, flat, six numbers each: a kind (0,
 * a box's plan rectangle x0, z0, x1, z1; 1, a segment's two ends), the four
 * plan numbers and how near the craft's centre may not come. A box or a
 * capsule counts when any of it is over the paving, a road when it has a
 * line to drive; one whose numbers are not finite is a layout bug that
 * scripts/props-check.js fails, and is left out rather than filed.
 */
const ROAD_AT = { x: 0, y: 0, z: 0 };

function openBlockers(solids, roads, W, D) {
  const out = [];
  const add = (kind, x0, z0, x1, z1, keep) => {
    if (Number.isFinite(x0) && Number.isFinite(z0) && Number.isFinite(x1) && Number.isFinite(z1)
      && Number.isFinite(keep)) {
      out.push(kind, x0, z0, x1, z1, keep);
    }
  };
  for (const s of solids) {
    if (s.box) {
      const b = s.box;
      if (b[4] > 0) {
        add(0, b[0], b[2], b[3], b[5], OPEN_CLEAR);
      }
    } else if (s.cap) {
      const c = s.cap;
      if ((c[1] > c[4] ? c[1] : c[4]) + c[6] > 0) {
        add(1, c[0], c[2], c[3], c[5], c[6] + OPEN_CLEAR);
      }
    }
  }
  for (const el of roads) {
    const r = roadOf(el);
    const pts = r.centre.points;
    const n = pts.length;
    if (n < 2) {
      continue;
    }
    const keep = r.laneOffset + CAR_REACH + OPEN_CLEAR;
    const segs = r.centre.closed ? n : n - 1;
    for (let i = 0; i < segs; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      docToWorld(W, D, a.x, a.y, 0, ROAD_AT);
      const ax = ROAD_AT.x;
      const az = ROAD_AT.z;
      docToWorld(W, D, b.x, b.y, 0, ROAD_AT);
      add(1, ax, az, ROAD_AT.x, ROAD_AT.z, keep);
    }
  }
  return out;
}

/* Whether the blocker at offset i keeps the craft's centre off (x, z): its
 * plan distance, squared, under its keep squared. On the keep is open. */
function blocks(B, i, x, z) {
  const x0 = B[i + 1];
  const z0 = B[i + 2];
  const x1 = B[i + 3];
  const z1 = B[i + 4];
  let dx;
  let dz;
  if (B[i] === 0) {
    dx = x < x0 ? x0 - x : (x > x1 ? x - x1 : 0);
    dz = z < z0 ? z0 - z : (z > z1 ? z - z1 : 0);
  } else {
    const ux = x1 - x0;
    const uz = z1 - z0;
    const ll = ux * ux + uz * uz;
    let t = ll > 0 ? ((x - x0) * ux + (z - z0) * uz) / ll : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    dx = x0 + ux * t - x;
    dz = z0 + uz * t - z;
  }
  const keep = B[i + 5];
  return dx * dx + dz * dz < keep * keep;
}

/*
 * The blockers filed by plan cell, each in every OPEN_CELL square its
 * footprint grown by its keep reaches, so a spot reads only its own cell.
 * Only cells within the search's reach are filed: a road can run a hundred
 * kilometres off the plot, and the search never looks there.
 */
function indexBlockers(B, W, D) {
  const cells = new Map();
  const lx = Math.floor((-W / 2 - OPEN_OFF) / OPEN_CELL);
  const hx = Math.floor((W / 2 + OPEN_OFF) / OPEN_CELL);
  const lz = Math.floor((-D / 2 - OPEN_OFF) / OPEN_CELL);
  const hz = Math.floor((D / 2 + OPEN_OFF) / OPEN_CELL);
  for (let i = 0; i < B.length; i += 6) {
    const keep = B[i + 5];
    const cx0 = Math.max(lx, Math.floor(((B[i + 1] < B[i + 3] ? B[i + 1] : B[i + 3]) - keep) / OPEN_CELL));
    const cx1 = Math.min(hx, Math.floor(((B[i + 1] > B[i + 3] ? B[i + 1] : B[i + 3]) + keep) / OPEN_CELL));
    const cz0 = Math.max(lz, Math.floor(((B[i + 2] < B[i + 4] ? B[i + 2] : B[i + 4]) - keep) / OPEN_CELL));
    const cz1 = Math.min(hz, Math.floor(((B[i + 2] > B[i + 4] ? B[i + 2] : B[i + 4]) + keep) / OPEN_CELL));
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cz = cz0; cz <= cz1; cz += 1) {
        const key = cx * OPEN_KEY + cz;
        const list = cells.get(key);
        if (list) {
          list.push(i);
        } else {
          cells.set(key, [i]);
        }
      }
    }
  }
  return cells;
}

/* Whether (x, z) is open of every blocker: all of them walked when there
 * is no index, the ones filed in its cell when there is. The same answer
 * either way, for any spot the search asks about. */
function openAt(B, cells, x, z) {
  if (!cells) {
    for (let i = 0; i < B.length; i += 6) {
      if (blocks(B, i, x, z)) {
        return false;
      }
    }
    return true;
  }
  const list = cells.get(Math.floor(x / OPEN_CELL) * OPEN_KEY + Math.floor(z / OPEN_CELL));
  if (list) {
    for (const i of list) {
      if (blocks(B, i, x, z)) {
        return false;
      }
    }
  }
  return true;
}

/*
 * The lattice spot nearest the point that `take(i, k)` accepts, i whole
 * steps east and k south, looking no more than `rings` steps out along
 * either axis: { i, k }, or null. Ring r is every spot whose larger step
 * is r, and every spot in it is at least r steps off, so once a spot d
 * steps squared off is taken no ring past the root of d can hold a nearer
 * one and the walk stops. A spot that could not win is never asked about.
 */
function nearestTaken(rings, take) {
  let bi = 0;
  let bk = 0;
  let bd = -1;
  for (let r = 0; r <= rings; r += 1) {
    if (bd >= 0 && r * r > bd) {
      break;
    }
    for (let i = -r; i <= r; i += 1) {
      const edge = i === -r || i === r;
      for (let k = -r; k <= r; k += edge ? 1 : 2 * r) {
        const d = i * i + k * k;
        if (bd >= 0 && (d > bd || (d === bd && !(i > bi || (i === bi && k < bk))))) {
          continue;
        }
        if (take(i, k)) {
          bi = i;
          bk = k;
          bd = d;
        }
      }
    }
  }
  return bd < 0 ? null : { i: bi, k: bk };
}

/*
 * Off the plot, facing into it: away from whichever edge the spot is
 * furthest past. The plan's north is the world's -z. Quarter turns in the
 * shell's convention, a pads yaw less a quarter (spawnFrom), wrapped.
 */
function facingIn(W, D, x, z) {
  const west = -W / 2 + OPEN_CLEAR - x;
  const east = x - (W / 2 - OPEN_CLEAR);
  const north = -D / 2 + OPEN_CLEAR - z;
  const south = z - (D / 2 - OPEN_CLEAR);
  const most = Math.max(west, east, north, south);
  if (most === west) {
    return -HALF_PI;
  }
  if (most === east) {
    return HALF_PI;
  }
  return most === north ? Math.PI : 0;
}

function openSpawn(W, D, solids, roads, tops) {
  const x0 = -W / 2 + OPEN_POINT_IN;
  const B = openBlockers(solids, roads, W, D);
  const onPlot = (x, z) => x >= -W / 2 + OPEN_CLEAR && x <= W / 2 - OPEN_CLEAR
    && z >= -D / 2 + OPEN_CLEAR && z <= D / 2 - OPEN_CLEAR;
  if (onPlot(x0, 0) && openAt(B, null, x0, 0)) {
    return { x: x0, y: 0, z: 0, yaw: -HALF_PI, base: 0, from: 'point' };
  }
  const cells = indexBlockers(B, W, D);
  const spotX = (i) => x0 + i * OPEN_STEP;
  const spotZ = (k) => k * OPEN_STEP;
  /* Far enough along either axis to reach the plot's furthest edge. */
  const across = Math.max(OPEN_POINT_IN, W - OPEN_POINT_IN, D / 2);
  const on = nearestTaken(Math.ceil(across / OPEN_STEP), (i, k) => {
    const x = spotX(i);
    const z = spotZ(k);
    return onPlot(x, z) && openAt(B, cells, x, z);
  });
  if (on) {
    return { x: spotX(on.i), y: 0, z: spotZ(on.k), yaw: -HALF_PI, base: 0, from: 'open' };
  }
  const off = nearestTaken(Math.ceil((across + OPEN_OFF) / OPEN_STEP), (i, k) => {
    const x = spotX(i);
    const z = spotZ(k);
    return !onPlot(x, z) && x >= -W / 2 - OPEN_OFF && x <= W / 2 + OPEN_OFF
      && z >= -D / 2 - OPEN_OFF && z <= D / 2 + OPEN_OFF && openAt(B, cells, x, z);
  });
  if (off) {
    const x = spotX(off.i);
    const z = spotZ(off.k);
    return { x, y: 0, z, yaw: facingIn(W, D, x, z), base: 0, from: 'off' };
  }
  return { x: x0, y: topUnder(tops, x0, 0, 0), z: 0, yaw: -HALF_PI, base: 0, from: 'blocked' };
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
    from: 'pads',
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
 *   spawn   { x, y, z, yaw, base, from } in the shell's convention: y is
 *           the seat, base the Base the author gave the pads (0 with
 *           none), and from which start it is: the pads, or with none the
 *           open ground openSpawn found
 */
export function placeDocument(doc) {
  const W = doc.field.width;
  const D = doc.field.depth;
  const items = [];
  const solids = [];
  const zones = [];
  const roads = [];
  const stats = { inflated: 0 };
  let start = null;
  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    if (!def) {
      continue;
    }
    /* Paint and nothing solid, but a start is kept off it: see openSpawn. */
    if (def.kind === KIND.ROAD) {
      roads.push(el);
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
    /* As it stands: stood on end if it is (placedPartsOf). */
    const parts = placedPartsOf(el);
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
    spawn = openSpawn(W, D, solids, roads, tops);
  }
  return { W, D, items, solids, tops, zones, spawn, stats };
}

/*
 * PLACE A DOCUMENT AND SET DOWN WHAT FLOATS IN IT. src/trackbuilder/seat.js
 * says what floats and why; this is the half that needs the solids, which
 * that file cannot import without dragging the props into the race field.
 *
 * A raised element stands on the highest box top under its origin that is no
 * more than SEAT_SLACK over its base, taken from every OTHER element's solids
 * (an element does not hold itself up), or on the paving. `doc` is changed in
 * place, so it must be a normalized copy the caller owns: the builder's own,
 * or what normalize() just returned. The returned `placed` is the placement of
 * the document as it now is, so a map with nothing floating pays for exactly
 * the one placement it always did.
 *
 * ROUNDS. A stack settles a storey a round: the container on top of two is
 * not floating until the one under it has fallen, so the pass runs again
 * until nothing moves. Each round moves at least one element down and an
 * element only ever moves down, and a stack is never more storeys than the
 * document has elements, so that many rounds is a bound and not a guess.
 *
 * ARITHMETIC ONLY, like the rest of this file: comparisons against box
 * edges, and the document's own numbers written back.
 */
const SEAT_AT = { x: 0, y: 0, z: 0 };

function supportsOf(doc, placed) {
  const boxes = [];
  for (const it of placed.items) {
    for (const s of placeSolids(it.parts, it.x, it.y, it.z, it.yaw, it.turns, [])) {
      if (s.box && s.box[4] > 0) {
        boxes.push({ owner: it.el, box: s.box });
      }
    }
  }
  const W = doc.field.width;
  const D = doc.field.depth;
  /*
   * The highest box top over the plan point (x, y), in the document's frame, that is no more than SEAT_SLACK over
   * `z`, as { top, on } with `on` the id of the element it belongs to, or null for the paving. `ignore` is one
   * element's id or a set of them, whose boxes do not count: an element does not hold itself up, and a thing being
   * carried does not hold up what it is carried over. The same comparisons the seat has always made, asked for a
   * point as well as for an element, so the track builder's 3D canvas can show where a piece would stand before
   * it is put down (src/trackbuilder/view3d.js, surfaceAt) and the two cannot disagree.
   */
  function under(x, y, z, ignore = null) {
    docToWorld(W, D, x, y, 0, SEAT_AT);
    const reach = z + SEAT_SLACK;
    let best = null;
    for (const { owner, box: b } of boxes) {
      if (b[4] <= reach && (!best || b[4] > best.top)
        && SEAT_AT.x > b[0] && SEAT_AT.x < b[3] && SEAT_AT.z > b[2] && SEAT_AT.z < b[5]
        && !(typeof ignore === 'string' ? owner.id === ignore : ignore && ignore.has(owner.id))) {
        best = { top: b[4], on: owner.id };
      }
    }
    return best;
  }
  return {
    under,
    seatFor(el, z) {
      return under(el.position.x, el.position.y, z, el.id);
    },
  };
}

/*
 * The first Balloon chase piece on a placed map, as the shell's game takes it
 * (src/main.js balloonWorld), or null. World metres, y up: the plane flies
 * round (x, z). A second piece is not flown, and the builder says so
 * (fs-balloons in src/trackbuilder/warnings.js).
 */
export function balloonChaseOf(placed) {
  const it = placed.items.find((t) => t.el.type === 'balloonChase');
  if (!it) {
    return null;
  }
  const d = it.el.dims || {};
  return {
    x: it.x,
    z: it.z,
    radius: Number.isFinite(d.radius) ? d.radius : 80,
    height: Number.isFinite(d.height) ? d.height : 14,
    speed: Number.isFinite(d.speed) ? d.speed : 1,
  };
}

/*
 * WHAT A RAISED THING CAN STAND ON, for a document, as { under(x, y, z, ignore), seatFor(el, z) }: the question
 * seatDocument asks of every element, kept for a caller that has to ask it again and again about points (a
 * pointer moving over the plot) without placing the map each time. Placing is the cost, so the answer is only as
 * current as the document it was made from.
 */
export function supportsFor(doc, placed = placeDocument(doc)) {
  return supportsOf(doc, placed);
}

export function seatDocument(doc) {
  let placed = placeDocument(doc);
  const moved = [];
  for (let round = 0; round <= doc.elements.length; round += 1) {
    if (!hasRaised(doc)) {
      break;
    }
    const fell = seatFloating(doc, supportsOf(doc, placed));
    if (!fell.length) {
      break;
    }
    moved.push(...fell);
    placed = placeDocument(doc);
  }
  return { placed, moved };
}
