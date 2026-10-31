/*
 * land.js: the ground of Hotaru Valley, its hills, its river and its bay,
 * as ONE grid of heights that the drawing and the physics both read.
 *
 * WHY A GRID AND NOT A FORMULA. The shape is written as a formula (`shape`
 * below: ridges, bumps, a river cut, a shore), but nothing reads the
 * formula except the grid. The grid is sampled from it once, and then the
 * hills ./index.js draws are that grid's triangles, and the ground the
 * shell hands the plant (`floorAt`) is the same triangles, read by the
 * same split of every cell. So the drawn hillside and the hillside a
 * craft lands on are one surface to the last bit a float can hold, where a
 * formula drawn at five metres and flown exactly would put a craft half a
 * metre into a drawn bank on every ridge.
 *
 * THE SHELL ALREADY FLIES HILLS. The plant is handed a plane every step,
 * at the height this answers and tilted by its slope, which the shell
 * measures from five taps of the same height (sampleGroundNormal in
 * src/main.js); the town's hills have flown that way since Stage 1. So a
 * valley with hills is a map's ground and nothing else: no change to the
 * plant, the module or what it is handed.
 *
 * THE WATER is one level, WATER, everywhere: the bay, the river and the
 * mill pond. The floor is the grid or the water, whichever is higher, so a
 * craft that comes down on the river comes down on its surface, as it does
 * on the town's canal, and the grid under it is the bed a pilot sees
 * through the shallows' colour.
 *
 * Pure: plain arithmetic, Math.sqrt (which IEEE 754 rounds exactly) and no
 * JS trigonometry, so Node and every browser sample the same grid.
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

import { W, D, hash2 } from './frame.js';

/* The one water level, metres. */
export const WATER = -0.7;

/* ------------------------------------------------------------------ */
/* The pieces of the shape                                             */
/* ------------------------------------------------------------------ */

const clamp01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
/* Hermite smoothstep on [0, 1], exactly 0 and 1 at the ends. */
export const smooth = (t) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
/* A round bump, (1 - d^2/r^2)^2 inside r and exactly 0 outside. */
function bump(px, py, cx, cy, r) {
  const dx = px - cx;
  const dy = py - cy;
  const q = (dx * dx + dy * dy) / (r * r);
  return q >= 1 ? 0 : (1 - q) * (1 - q);
}

/* Value noise on a lattice of `cell` metres, smoothstepped between the
 * hashed corners, in [-1, 1]. */
function noise(px, py, cell, salt) {
  const fx = px / cell;
  const fy = py / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const u = smooth(fx - ix);
  const v = smooth(fy - iy);
  const a = hash2(ix * 7 + salt, iy * 13 - salt);
  const b = hash2((ix + 1) * 7 + salt, iy * 13 - salt);
  const c = hash2(ix * 7 + salt, (iy + 1) * 13 - salt);
  const d = hash2((ix + 1) * 7 + salt, (iy + 1) * 13 - salt);
  return 2 * (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) - 1;
}

/* Distance from a point to a polyline, and how far along it the nearest
 * point is. */
export function nearestOnLine(line, px, py) {
  let best = Infinity;
  let at = 0;
  let run = 0;
  let bx = line[0][0];
  let by = line[0][1];
  for (let i = 0; i + 1 < line.length; i += 1) {
    const [ax, ay] = line[i];
    const [cx, cy] = line[i + 1];
    const ex = cx - ax;
    const ey = cy - ay;
    const len2 = ex * ex + ey * ey;
    const len = Math.sqrt(len2);
    let t = ((px - ax) * ex + (py - ay) * ey) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t;
    const qy = ay + ey * t;
    const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d2 < best) {
      best = d2;
      at = run + t * len;
      bx = qx;
      by = qy;
    }
    run += len;
  }
  return { d: Math.sqrt(best), s: at, x: bx, y: by };
}

/* ------------------------------------------------------------------ */
/* The valley                                                          */
/* ------------------------------------------------------------------ */

/*
 * THE RIVER, from the gorge in the north mountains down the valley to the
 * bay: a lowland river of the kind that runs between paddies, nine metres
 * of water between banks, with the mill pond on it under the north hills.
 * Plan points; past both ends of the plot so the cut runs off the map.
 */
export const RIVER = [
  [236, 470], [234, 380], [228, 330], [214, 300], [216, 278], [236, 250], [256, 212],
  [252, 168], [262, 128], [282, 92], [292, 60], [296, 20], [300, -40],
];
export const RIVER_HALF = 4.5;
export const MILL_POND = { px: 207, py: 290, r: 13 };

/*
 * THE SHORE. South of it is the bay. Along the fishing hamlet it is the
 * quay's straight stone face (QUAY), a metre over the water; west of the
 * hamlet it is a beach that curls round under the headland.
 */
export const QUAY = { x0: 288, x1: 446, py: 48, h: 1.0 };
export function shoreAt(px) {
  if (px >= QUAY.x0 - 4 && px <= QUAY.x1 + 4) {
    return QUAY.py;
  }
  if (px > QUAY.x1) {
    return QUAY.py + (px - QUAY.x1) * 0.35;
  }
  /* The beach, west of the hamlet, curling south round the headland,
   * which runs off the plot's south west corner. */
  if (px >= 236) {
    return QUAY.py - 3 + 1.5 * noise(px, 0, 23, 5);
  }
  const t = (236 - px) / 92;
  return QUAY.py - 3 - 82 * smooth(t) + 2 * noise(px, 0, 23, 5);
}

/*
 * THE RICE TERRACES climb the east hillside, facing west into the low
 * sun. Their footprint is held at the valley floor in the grid and the
 * terraces themselves are boxes (./fields.js), each a step of TERRACE_STEP
 * over the one below; behind the top one the hill begins at its height.
 */
export const TERRACES = { x0: 318, x1: 414, y0: 112, y1: 300 };
export const TERRACE_STEP = 1.3;
export const TERRACE_COUNT = 10;
export const TERRACE_TOP = TERRACE_STEP * TERRACE_COUNT;

/*
 * THE CASTLE HILL, in the north west: the bump the ruin stands on. The ruin's
 * own enclosures are boxes (./castle.js) on top of it.
 */
export const CASTLE_HILL = { px: 78, py: 296, r: 82, h: 20 };
/* The shrine's knoll, east of the river. */
export const KNOLL = { px: 322, py: 246, r: 30, h: 8 };

/* Where the cedar stands are, as plan tests: the ground there is needle
 * litter and the planting is in rows (./trees.js). */
export function inCedarStand(px, py) {
  /* The west range, below the castle. */
  if (px < 112 && py > 112 && py < 236) {
    return true;
  }
  /* The north range either side of the gorge. */
  if (py > 322 && (px < 205 || px > 262) && px > 120 && px < 420) {
    return true;
  }
  return false;
}

/* The bamboo grove, at the foot of the north range west of the mill. */
export const BAMBOO = { x0: 150, x1: 196, y0: 300, y1: 336 };

/* How far the valley floor is from the hills, 0 on the floor and rising
 * to 1 on the slopes: the noise only stirs where this is not 0. */
function hillness(px, py) {
  const west = smooth((122 - px) / 60);
  const north = smooth((py - 306) / 40);
  const east = smooth((px - 404) / 40);
  const south = px < 150 && py < 120 ? smooth((150 - px) / 50) * smooth((120 - py) / 40) : 0;
  return Math.max(west, north, east, south);
}

/* The hills, before the water is cut into them. */
function hills(px, py) {
  /* West range, climbing all the way out of the plot. */
  let h = smooth((122 - px) / 115) * 30 + (px < 10 ? (10 - px) * 0.18 : 0);
  /* North range, with the gorge the river comes out of. */
  const gorge = 1 - 0.82 * smooth(1 - Math.abs(px - 233) / 34);
  h = Math.max(h, smooth((py - 304) / 95) * 46 * gorge + (py > 400 ? (py - 400) * 0.12 * gorge : 0));
  /* East range. Over the terraces it starts at the top terrace's height
   * behind them, and is held at the floor in front of that (the terraces
   * are boxes there); either side of them it is a plain slope. */
  const inTerrace = smooth((py - (TERRACES.y0 - 2)) / 4) * smooth(((TERRACES.y1 + 2) - py) / 4);
  const plain = smooth((px - 372) / 150) * 50;
  const behind = px < TERRACES.x1 - 6 ? 0 : TERRACE_TOP - 0.4 + smooth((px - (TERRACES.x1 - 6)) / 110) * 36;
  h = Math.max(h, inTerrace * behind + (1 - inTerrace) * plain);
  /* The castle hill and the shrine's knoll. */
  h = Math.max(h, CASTLE_HILL.h * bump(px, py, CASTLE_HILL.px, CASTLE_HILL.py, CASTLE_HILL.r));
  h = Math.max(h, KNOLL.h * bump(px, py, KNOLL.px, KNOLL.py, KNOLL.r));
  /* The headland in the south west, with the lighthouse's point. */
  h = Math.max(h, 19 * bump(px, py, 60, 40, 110), 10 * bump(px, py, 136, -6, 40));
  /* The far mountains, out past the plot, falling away again at the grid's
   * edge so it meets the fog rather than a cliff. */
  const ox = px < 0 ? -px : px > W ? px - W : 0;
  const oy = py > D ? py - D : 0;
  const out = Math.sqrt(ox * ox + oy * oy);
  if (out > 0 && py > -20) {
    const far = smooth(out / 150) * (1 - 0.7 * smooth((out - 250) / 110));
    h = Math.max(h, far * (78 + 30 * noise(px, py, 97, 3)));
  }
  /* The slopes' own undulation, none of it on the floor. */
  const k = hillness(px, py);
  if (k > 0) {
    h += k * (3.2 * noise(px, py, 29, 11) + 1.4 * noise(px, py, 11, 17));
    if (h < 0) {
      h = 0;
    }
  }
  return h;
}

/* The full shape, metres up at a plan point. */
export function shape(px, py) {
  let h = hills(px, py);
  /* Over the terraces' footprint the floor is the valley's: they are boxes. */
  if (px > TERRACES.x0 - 1 && px < TERRACES.x1 - 6 && py > TERRACES.y0 - 1 && py < TERRACES.y1 + 1) {
    h = 0;
  }
  /* The river: a bed two metres down with banks three metres wide. */
  const r = nearestOnLine(RIVER, px, py);
  if (r.d < RIVER_HALF + 3.5) {
    const t = (r.d - (RIVER_HALF - 1.5)) / 5;
    const cut = -2.3 + 2.3 * smooth(t);
    h = Math.min(h, cut);
  }
  /* The mill pond. */
  const dp = Math.sqrt((px - MILL_POND.px) * (px - MILL_POND.px) + (py - MILL_POND.py) * (py - MILL_POND.py));
  if (dp < MILL_POND.r + 4) {
    h = Math.min(h, -2.1 + 2.1 * smooth((dp - MILL_POND.r + 1.5) / 5));
  }
  /* The bay: the sea bed shelving down from the shore. */
  const sy = shoreAt(px);
  if (py < sy + 10) {
    const along = py - sy;
    const sea = along >= 10 ? Infinity : along >= 0 ? -0.9 + 1.1 * smooth(along / 10) : -0.9 + along * 0.18;
    h = Math.min(h, Math.max(-6.5, sea));
  }
  return h;
}

/* ------------------------------------------------------------------ */
/* The grid                                                            */
/* ------------------------------------------------------------------ */

/*
 * THE AXES: five metres over the plot and a margin round it, then cells
 * that grow by a seventh each step out to the fog, so the hills a pilot
 * flies over are fine and the mountains on the horizon are a few big
 * facets, which is all a hill at three hundred metres is through the haze.
 */
const FINE = 5;
function axis(lo, hi, reachLo, reachHi) {
  const out = [];
  for (let v = lo; v <= hi + 1e-9; v += FINE) {
    out.push(v);
  }
  const down = [];
  let step = FINE;
  let v = lo;
  while (v > reachLo) {
    step = Math.min(40, step * 1.15);
    v -= step;
    down.push(Math.round(v * 100) / 100);
  }
  let up = [];
  step = FINE;
  v = out[out.length - 1];
  while (v < reachHi) {
    step = Math.min(40, step * 1.15);
    v += step;
    up.push(Math.round(v * 100) / 100);
  }
  return [...down.reverse(), ...out, ...up];
}

export const GX = axis(-30, 490, -370, 830);
export const GY = axis(-30, 390, -340, 700);

let grid = null;
/* The heights at the grid's corners, sampled once: Float64Array, GX
 * across and GY up, index i * GY.length + j. */
export function heights() {
  if (!grid) {
    const nx = GX.length;
    const ny = GY.length;
    grid = new Float64Array(nx * ny);
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < ny; j += 1) {
        grid[i * ny + j] = shape(GX[i], GY[j]);
      }
    }
  }
  return grid;
}

/* The cell an axis value falls in, by halving: the last index whose value
 * is at or under v, held inside the axis. */
function cellIndex(axisArr, v) {
  let lo = 0;
  let hi = axisArr.length - 2;
  if (v <= axisArr[0]) {
    return 0;
  }
  if (v >= axisArr[hi + 1]) {
    return hi;
  }
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (axisArr[mid] <= v) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/*
 * THE GROUND at a plan point: the grid's triangle there, split corner (i, j)
 * to corner (i + 1, j + 1), which is how ./index.js splits every cell it
 * draws. Not the water: see floorAt.
 */
export function landAt(px, py) {
  const H = heights();
  const ny = GY.length;
  const i = cellIndex(GX, px);
  const j = cellIndex(GY, py);
  const x0 = GX[i];
  const y0 = GY[j];
  const u = clamp01((px - x0) / (GX[i + 1] - x0));
  const v = clamp01((py - y0) / (GY[j + 1] - y0));
  const h00 = H[i * ny + j];
  const h10 = H[(i + 1) * ny + j];
  const h01 = H[i * ny + j + 1];
  const h11 = H[(i + 1) * ny + j + 1];
  if (u >= v) {
    return h00 + u * (h10 - h00) + v * (h11 - h10);
  }
  return h00 + v * (h01 - h00) + u * (h11 - h01);
}

/* What a craft stands on where no solid is under it: the land, or the
 * water over it. */
export function floorAt(px, py) {
  const h = landAt(px, py);
  return h > WATER ? h : WATER;
}

/* The same in the world frame, for the built map's `floor`. */
export function worldFloor(x, z) {
  return floorAt(x + W / 2, D / 2 - z);
}
