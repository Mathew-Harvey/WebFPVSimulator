/*
 * terrain.js: Kazesuna Dunes' ground, the one surface the plant flies over
 * and the one the renderer draws, from the same numbers.
 *
 * WHAT IT IS. A slice of a coastal dune field on the Sea of Japan, laid
 * out the way Tottori's is (the owner's ask of 31 October 2026, from the
 * reference list's Desert entry): the sea to the north, a beach, a long
 * windward slope up to one big ridge (the "horse's back" kind, about 47 m
 * at its highest, the figure the Tottori guides give for Uma-no-Senaka),
 * its slip face falling steep to the south into a hollow with a seasonal
 * pond, a field of smaller crescent dunes, and a pine covered bluff up to
 * the terrace the visitors arrive on. The sand runs on past both ends of
 * the plot, as a coast does.
 *
 * ONE GRID, TWO USES. The heights are worked out once, on a 4 m grid over
 * the plot and a 16 m grid round it, and both the mesh and floor() read
 * that grid: the mesh draws each cell as two triangles split along the
 * same diagonal floor() interpolates across, so the sand drawn is the sand
 * hit, to the bit. The plant is handed the plane under the craft every step
 * and its slope from five taps of floor() (sampleGroundNormal in
 * src/main.js), which is how the race field's hills have always reached it,
 * so a dune is ground and not a stack of solids, and nothing about the
 * physics changes.
 *
 * DETERMINISM. floor() is on the physics path, so nothing here calls JS
 * trigonometry, Math.pow or Math.exp (CLAUDE.md). The noise is an integer
 * hash through Math.imul and a cubic smoothstep, and every shape is a
 * polynomial: plus, minus, times, divide and Math.floor, which are the same
 * bits in every engine.
 *
 * THE FRAME is the built map's (src/maps/built/place.js): the plan in
 * metres from the plot's south west corner, x east and y north, and the
 * world's Three.js metres from the plot's middle, Y up, z south. Pure: no
 * Three.js, so scripts/dunes-check.js reads it in Node.
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

/* The plot, metres: a kilometre's slice of coast is 896 by 640 of it, both
 * whole numbers of the coarse grid so its lines meet the plot's edges. */
export const W = 896;
export const D = 640;
export const CELL = 4;
export const COARSE = 16;
/* How far the coarse ring reaches past the plot: east and west, south, and
 * north (all sea by then). */
const EXT_X = 320;
const EXT_S = 240;
const EXT_N = 160;

/* The terrace the visitors arrive on, the pond's water and the sea's. */
export const TERRACE = 32;
export const SEA = 0;
export const POND = { cx: 404, cy: 284, rx: 66, ry: 21, level: 3.3, dip: 2.4 };

/* A plan point as the world's [x, y, z]. */
export function w(x, y, h = 0) {
  return [x - W / 2, h, D / 2 - y];
}
/* And back: a world x, z as plan x, y. */
export const planX = (wx) => wx + W / 2;
export const planY = (wz) => D / 2 - wz;

/* ---- noise, integers and polynomials only ---- */

function hash1(i, s) {
  let h = Math.imul(i | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function hash2(i, j, s) {
  return hash1(Math.imul(i | 0, 0x27d4eb2d) ^ (j | 0), s);
}

const smooth = (t) => t * t * (3 - 2 * t);

/* Value noise along a line, in [-1, 1]. */
export function n1(t, s = 0) {
  const i = Math.floor(t);
  const u = smooth(t - i);
  const a = hash1(i, s);
  const b = hash1(i + 1, s);
  return (a + (b - a) * u) * 2 - 1;
}

/* Value noise over the plan, in [-1, 1]. */
export function n2(x, y, s = 0) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = smooth(x - i);
  const v = smooth(y - j);
  const a = hash2(i, j, s);
  const b = hash2(i + 1, j, s);
  const c = hash2(i, j + 1, s);
  const d = hash2(i + 1, j + 1, s);
  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return (ab + (cd - ab) * v) * 2 - 1;
}

/* A round hump of radius r: 1 at its middle, 0 at r and beyond, smooth. */
function hump(d2, r) {
  const q = d2 / (r * r);
  if (q >= 1) {
    return 0;
  }
  return (1 - q) * (1 - q);
}

const clamp01 = (t) => (t < 0 ? 0 : (t > 1 ? 1 : t));

/* ---- the shape of the coast ---- */

/* Where the big ridge's crest runs, plan y, and how high it is. */
export function crestY(x) {
  return 394 + 15 * n1(x / 140 + 3.1, 11) + 5 * n1(x / 53 + 7, 12);
}
export function crestH(x) {
  const dx = x - 372;
  const dz = x - 708;
  return 42 + 3.5 * n1(x / 110 + 1.7, 13) + 5.5 * hump(dx * dx, 150) - 15 * hump(dz * dz, 78);
}
/* Where the sea meets the sand, plan y. */
export function shoreY(x) {
  return 552 + 7 * n1(x / 90 + 5, 14) + 3 * n1(x / 31, 15);
}

/* The slip face's run from the brink to its toe, and the hollow's floor. */
const SLIP = 72;
const HOLLOW = 4.4;
/* The bluff up to the terrace: its foot and its brink, plan y. */
const BLUFF_FOOT = 168;
const BLUFF_TOP = 106;

/*
 * THE CRESCENT DUNES in the hollow, each a barchan: a hump with its slip
 * face to the south (the wind is off the sea), steeper and shorter in the
 * lee, with its horns trailing downwind round the bite the lee scoops out.
 *   cx, cy  the crest, plan
 *   h       its height over the hollow
 *   aw, al  the windward and the lee run
 *   wd      its half width
 */
export const BARCHANS = [
  { cx: 690, cy: 236, h: 11, aw: 58, al: 30, wd: 40 },
  { cx: 812, cy: 222, h: 8, aw: 46, al: 24, wd: 32 },
  { cx: 236, cy: 226, h: 9, aw: 50, al: 26, wd: 36 },
  { cx: 120, cy: 262, h: 6.5, aw: 40, al: 16, wd: 28 },
  { cx: 540, cy: 248, h: 5, aw: 36, al: 14, wd: 26 },
];

function barchans(x, y) {
  let h = 0;
  for (const b of BARCHANS) {
    const v = x - b.cx;
    const u = b.cy - y;
    if (u > b.al || u < -b.aw || v > b.wd || v < -b.wd) {
      continue;
    }
    const a = u > 0 ? b.al : b.aw;
    const q = (u / a) * (u / a) + (v / b.wd) * (v / b.wd);
    if (q >= 1) {
      continue;
    }
    /* Windward a soft dome; in the lee a straighter fall, so the slip face
     * reads as a face. */
    let body = u > 0 ? (1 - q) * (1.25 - 0.25 * q) * 0.8 : (1 - q) * (1 - q);
    /* The bite out of the lee, which leaves the horns. */
    const bu = u - b.al * 0.95;
    const bq = (bu / (b.al * 0.95)) * (bu / (b.al * 0.95)) + (v / (b.wd * 0.55)) * (v / (b.wd * 0.55));
    if (bq < 1) {
      body -= 0.75 * (1 - bq) * (1 - bq);
    }
    if (body > 0) {
      h += b.h * body;
    }
  }
  return h;
}

/* The hollow and the dune field, over HOLLOW. */
function inland(x, y) {
  let h = 0.7 * n2(x / 38, y / 38, 21) + 1.6 * n2(x / 110, y / 90, 22) + 1.2;
  h += barchans(x, y);
  const px = (x - POND.cx) / POND.rx;
  const py = (y - POND.cy) / POND.ry;
  const q = px * px + py * py;
  if (q < 1.8) {
    /* The pond's floor and the flat round it, where the groundwater
     * comes up: the noise is pressed out so the shore is one level. */
    const f = q < 1 ? 1 : (1.8 - q) / 0.8;
    h = h * (1 - f) + (-POND.dip * (q < 1 ? 1 - q : 0)) * 1;
  }
  return h;
}

/*
 * THE HEIGHT at a plan point, worked out from the shapes. Called for the
 * grid's nodes once at load and never on a step: floor() reads the grid.
 */
export function shapeAt(x, y) {
  const yS = shoreY(x);
  const yc = crestY(x);
  const hc = crestH(x);
  const beachTop = yS - 34;
  if (y >= yS) {
    const d = y - yS;
    return d > 60 ? -5 : -d / 12;
  }
  if (y >= beachTop) {
    const t = (yS - y) / 34;
    return 3.0 * t * (1.5 - 0.5 * t);
  }
  if (y >= yc) {
    /* The windward slope: 3 m at the beach's back, rounding over into the
     * crest, with a long low swell running across it. */
    const t = clamp01((y - yc) / (beachTop - yc));
    const q = t * (1.4 - 0.4 * t);
    const swell = 2.4 * n2(x / 70, y / 40, 31) * t * (1 - t) * 4;
    return 3.0 + (hc - 3.0) * (1 - q) + swell;
  }
  const low = HOLLOW + inland(x, y);
  if (y >= yc - SLIP) {
    /* The slip face: steepest a quarter of the way down, near the angle
     * sand stands at, easing out into the hollow. */
    const t = (yc - y) / SLIP;
    const r = 1.15 * t + 0.7 * t * t - 0.85 * t * t * t;
    const hollowAtToe = HOLLOW + inland(x, yc - SLIP);
    const toe = hollowAtToe + (low - hollowAtToe) * t;
    return hc - (hc - toe) * r;
  }
  if (y >= BLUFF_FOOT) {
    return low;
  }
  const foot = HOLLOW + inland(x, BLUFF_FOOT);
  if (y > BLUFF_TOP) {
    const s = smooth((BLUFF_FOOT - y) / (BLUFF_FOOT - BLUFF_TOP));
    const lip = 0.8 * n2(x / 30, y / 20, 41) * s * (1 - s) * 4;
    return foot + (TERRACE - foot) * s + lip;
  }
  /* The terrace: level where anything stands on it, a little rolling in
   * the pines past the plot. */
  if (y < -20) {
    return TERRACE + 3 * n2(x / 90, y / 90, 51) * clamp01((-20 - y) / 60);
  }
  return TERRACE;
}

/* ---- the grid ---- */

const FX = W / CELL;
const FY = D / CELL;
const CX0 = -EXT_X;
const CY0 = -EXT_S;
const CNX = (W + 2 * EXT_X) / COARSE;
const CNY = (D + EXT_S + EXT_N) / COARSE;

let GRID = null;

/* The grids, worked out on first use: { fine, coarse }, each a
 * Float64Array of heights at its nodes, row by row from the south. */
export function grid() {
  if (GRID) {
    return GRID;
  }
  const coarse = new Float64Array((CNX + 1) * (CNY + 1));
  for (let j = 0; j <= CNY; j += 1) {
    for (let i = 0; i <= CNX; i += 1) {
      coarse[j * (CNX + 1) + i] = shapeAt(CX0 + i * COARSE, CY0 + j * COARSE);
    }
  }
  const fine = new Float64Array((FX + 1) * (FY + 1));
  const ratio = COARSE / CELL;
  for (let j = 0; j <= FY; j += 1) {
    for (let i = 0; i <= FX; i += 1) {
      const x = i * CELL;
      const y = j * CELL;
      let h = shapeAt(x, y);
      /* On the plot's edge, the coarse grid's own line between its nodes,
       * so the two meshes meet with no crack where they join. */
      const edgeX = i === 0 || i === FX;
      const edgeY = j === 0 || j === FY;
      if (edgeX && j % ratio !== 0) {
        const ci = (x - CX0) / COARSE;
        const cj0 = Math.floor((y - CY0) / COARSE);
        const t = (y - (CY0 + cj0 * COARSE)) / COARSE;
        const a = coarse[cj0 * (CNX + 1) + ci];
        const b = coarse[(cj0 + 1) * (CNX + 1) + ci];
        h = a + (b - a) * t;
      } else if (edgeY && i % ratio !== 0) {
        const cj = (y - CY0) / COARSE;
        const ci0 = Math.floor((x - CX0) / COARSE);
        const t = (x - (CX0 + ci0 * COARSE)) / COARSE;
        const a = coarse[cj * (CNX + 1) + ci0];
        const b = coarse[cj * (CNX + 1) + ci0 + 1];
        h = a + (b - a) * t;
      } else if ((edgeX || edgeY) && i % ratio === 0 && j % ratio === 0) {
        h = coarse[((y - CY0) / COARSE) * (CNX + 1) + (x - CX0) / COARSE];
      }
      fine[j * (FX + 1) + i] = h;
    }
  }
  GRID = {
    fine, coarse, FX, FY, CNX, CNY, CX0, CY0,
  };
  return GRID;
}

/* A cell's height at (fx, fy) inside it, 0..1 each, split along the
 * diagonal from its south west corner to its north east one, the way the
 * mesh splits it. */
function inCell(a, b, c, d, fx, fy) {
  if (fx >= fy) {
    return a + (b - a) * fx + (d - b) * fy;
  }
  return a + (c - a) * fy + (d - c) * fx;
}

/* The sand at a plan point, from the grid. */
export function sandAt(x, y) {
  const G = grid();
  if (x >= 0 && x <= W && y >= 0 && y <= D) {
    let i = Math.floor(x / CELL);
    let j = Math.floor(y / CELL);
    if (i >= FX) {
      i = FX - 1;
    }
    if (j >= FY) {
      j = FY - 1;
    }
    const r = FX + 1;
    const k = j * r + i;
    return inCell(G.fine[k], G.fine[k + 1], G.fine[k + r], G.fine[k + r + 1], x / CELL - i, y / CELL - j);
  }
  const gx = (x - CX0) / COARSE;
  const gy = (y - CY0) / COARSE;
  if (gx >= 0 && gx < CNX && gy >= 0 && gy < CNY) {
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const r = CNX + 1;
    const k = j * r + i;
    return inCell(G.coarse[k], G.coarse[k + 1], G.coarse[k + r], G.coarse[k + r + 1], gx - i, gy - j);
  }
  return shapeAt(x, y);
}

/* Whether a plan point is under the pond's water. */
export function inPond(x, y) {
  const px = (x - POND.cx) / POND.rx;
  const py = (y - POND.cy) / POND.ry;
  return px * px + py * py < 1;
}

/* The ground the plant is given at a plan point: the sand, or the water
 * where the sand is under the sea or the pond. Water is a hard floor, as
 * it is on every map that has some. */
export function groundAt(x, y) {
  const s = sandAt(x, y);
  if (s < SEA) {
    return SEA;
  }
  if (s < POND.level && inPond(x, y)) {
    return POND.level;
  }
  return s;
}

/* The same, in the world's x and z, which is what the pipeline asks. */
export function floor(wx, wz) {
  return groundAt(wx + W / 2, D / 2 - wz);
}
