/*
 * terrain.js: the ground of Raicho Ridge, as one grid of heights.
 *
 * THE PLACE is a ridge of the Japanese Northern Alps of our own: a crest
 * running west to east across the north of the map with a col in it where
 * the hut stands, the summit east of the col, a cliff band under the crest
 * on the south face, a valley along the south of the ridge with a dammed
 * lake in its east half, and lower forested hills beyond the valley. The
 * scale is the real range's: the col 362 m over the valley station, the
 * summit 505 m, the south face about 45 degrees with a band of 60 to 70
 * degree rock under the crest, the kind of face a ropeway is hung over at
 * Shin-Hotaka and Tanigawadake. Nothing is traced from anything: it is
 * written below as arithmetic.
 *
 * THE GRID IS THE GROUND, BOTH WAYS. The heights are worked out once, on a
 * square lattice CELL metres apart, and both the drawn ground and the
 * ground the plant is given read the same numbers: `floorAt` interpolates
 * inside the same two triangles of each cell the mesh draws, so a craft
 * set down on the hillside sits on the hillside it is looking at, to the
 * bit. The plant takes it as a plane at the craft every step (the shell's
 * height and its slope, raiseGroundFromState and sampleGroundNormal in
 * src/main.js), which is how a hill has been ground since the hill in
 * Sunnyfield's gorge; nothing here changes the plant.
 *
 * ARITHMETIC ONLY. Every height reaches the physics, so the grid is made
 * with + - * / and Math.sqrt, Math.abs, Math.floor, Math.min, Math.max and
 * Math.imul, each of which JavaScript specifies to the bit, and no
 * Math.sin, Math.cos, Math.pow or Math.exp (CLAUDE.md, determinism). The
 * noise is a value lattice from an integer hash with a quintic fade, the
 * curves are Catmull-Rom through written knots, the peaks are cones with
 * a square root in their shoulder. The same build is the same bits in Node
 * and in every browser, and scripts/alps-check.js holds it to a hash.
 *
 * FLAT WHERE SOMETHING STANDS. The hut, the helipad, the two ropeway
 * stations, the summit shrine, the car park, the dam's ends and the road
 * are given ground that is exactly level (or, along the road, exactly a
 * plane), by setting the lattice points in their footprint, so a floor on
 * a pad is the pad and nothing sinks or floats. The lake is the lattice
 * held up to the water's level inside its basin: the water is ground, as
 * a hard landing on a lake is, and nothing is flown under it.
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

/* The lattice: HALF metres each way from the middle, CELL metres apart. The
 * flown map is the middle 1.6 km; the ring outside it is the bowl of
 * further ridges the fog closes on, so there is no edge to see. */
export const HALF = 1000;
export const CELL = 8;
export const N = (2 * HALF) / CELL;
const NV = N + 1;

/* The lake's surface, world metres. */
export const LAKE = 62;

/* Where things stand, world metres (x east, z south, y up). */
export const COL = { x: -160, z: -300 };
export const SUMMIT = { x: 120, z: -346 };
export const WEST_PEAK = { x: -620, z: -296 };
export const EAST_PEAK = { x: 560, z: -300 };

/* The dam: its wall runs north to south across the gorge at DAM_X, its
 * upstream face at DAM_X and its crest DAM_CREST high. The gorge's floor
 * steps down from the lake's bed to DOWN under it. */
export const DAM_X = 536;
export const DAM_CREST = 70;
const DOWN = 22;

/* The valley road, as straight runs in the plan with its height at each
 * knot: up the valley from the west, past the ropeway's valley station,
 * down to the lake and along its north shore to the dam. Every run is a
 * plane, so the lattice holds it exactly. */
export const ROAD = [
  { x: -620, z: 204, y: 90 },
  { x: -40, z: 204, y: 85 },
  { x: 100, z: 132, y: 70 },
  { x: 528, z: 132, y: 70 },
];
export const ROAD_HALF = 3.5;
/* How far each side of the road's middle the ground is the road's plane,
 * and over how much more it eases back into the hillside. */
const ROAD_FLAT = 13;
const ROAD_EASE = 22;

/*
 * THE PADS: rectangles of level ground, { x0, x1, z0, z1, y, ease }. `y`
 * null takes the height the hill has at the pad's middle. They are kept on
 * the lattice's lines, so a pad's own cells are wholly level.
 */
export const PADS = {
  hut: { x0: -264, x1: -216, z0: -328, z1: -288, y: null, ease: 24 },
  heli: { x0: -136, x1: -104, z0: -328, z1: -296, y: null, ease: 24 },
  top: { x0: -184, x1: -136, z0: -280, z1: -240, y: null, ease: 18 },
  valley: { x0: -232, x1: -88, z0: 152, z1: 192, y: 84.6, ease: 26 },
  shrine: { x0: 112, x1: 128, z0: -352, z1: -336, y: null, ease: 32 },
  overlook: { x0: 496, x1: 528, z0: 96, z1: 128, y: 70, ease: 18 },
  damSouth: { x0: 528, x1: 560, z0: 304, z1: 328, y: DAM_CREST, ease: 18 },
};

/* ---- the arithmetic ---- */

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function smooth(t) {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

/* A Catmull-Rom curve through knots [[x, v], ...] sorted by x, held at its
 * ends outside them. */
function curve(knots, x) {
  const n = knots.length;
  if (x <= knots[0][0]) {
    return knots[0][1];
  }
  if (x >= knots[n - 1][0]) {
    return knots[n - 1][1];
  }
  let i = 0;
  while (x > knots[i + 1][0]) {
    i += 1;
  }
  const x0 = knots[i][0];
  const x1 = knots[i + 1][0];
  const p0 = knots[i > 0 ? i - 1 : i][1];
  const p1 = knots[i][1];
  const p2 = knots[i + 1][1];
  const p3 = knots[i + 2 < n ? i + 2 : i + 1][1];
  const t = (x - x0) / (x1 - x0);
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/* Straight lines between knots, for the valley floor's steps. */
function linear(knots, x) {
  const n = knots.length;
  if (x <= knots[0][0]) {
    return knots[0][1];
  }
  if (x >= knots[n - 1][0]) {
    return knots[n - 1][1];
  }
  let i = 0;
  while (x > knots[i + 1][0]) {
    i += 1;
  }
  const t = (x - knots[i][0]) / (knots[i + 1][0] - knots[i][0]);
  return knots[i][1] + (knots[i + 1][1] - knots[i][1]) * t;
}

/* An integer hash of a lattice point to [0, 1). */
function hash(ix, iz, salt) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/* Value noise in [0, 1) on a unit lattice. */
export function noise(x, z, salt) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fz = fade(z - iz);
  const a = hash(ix, iz, salt);
  const b = hash(ix + 1, iz, salt);
  const c = hash(ix, iz + 1, salt);
  const d = hash(ix + 1, iz + 1, salt);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fz;
}

/* Ridged: 1 on the creases, 0 between, sharpened. */
function ridged(x, z, salt) {
  const r = 1 - Math.abs(2 * noise(x, z, salt) - 1);
  return r * r;
}

/* A peak's shoulder: 1 at the top, 0 at `rad`, steeper near the top. */
function cone(dx, dz, rad) {
  const q = Math.sqrt(dx * dx + dz * dz) / rad;
  if (q >= 1) {
    return 0;
  }
  const u = 1 - q;
  return u * Math.sqrt(u);
}

/* ---- the shape ---- */

/* The crest's line in the plan and its height along it. */
const CREST_Z = [[-1100, -340], [-600, -300], [-300, -312], [-160, -302], [0, -326], [120, -346], [400, -330], [650, -300], [1100, -330]];
const CREST_H = [[-1100, 330], [-620, 440], [-420, 386], [-250, 366], [-160, 360], [-60, 372], [0, 402], [120, 466], [300, 432], [560, 452], [800, 404], [1100, 360]];
/* How far south of the crest the face reaches the valley's side. */
const FOOT = [[-1100, 400], [-560, 450], [-160, 490], [300, 480], [540, 470], [1100, 430]];
/* The valley: its axis in the plan, and its bed along the axis, west to
 * east: down the valley, the lake's bed, the dam's step and the gorge. */
const VALE_Z = [[-1100, 270], [-560, 244], [-160, 232], [200, 262], [440, 250], [560, 246], [800, 260], [1100, 270]];
const BED = [[-1100, 122], [-560, 94], [-160, 82], [40, 70], [130, 42], [1100, 42]];
/* How far the gorge below the dam is cut under that, near the axis only,
 * so the drop is the gorge's and not a step across the whole map. */
const GORGE = [[DAM_X + 8, 0], [DAM_X + 40, 42 - DOWN], [760, 32], [1100, 40]];
/* How fast the valley's sides rise off its axis: metres up per metre out,
 * squared. */
const VALE_K = 0.0011;
/* The southern hills: their crest line, its height, and their reach. */
const HILL_Z = [[-1100, 640], [-400, 610], [100, 630], [440, 500], [560, 440], [700, 500], [1100, 640]];
const HILL_H = [[-1100, 340], [-400, 300], [100, 344], [440, 290], [560, 250], [720, 310], [1100, 340]];
const HILL_W = [[-1100, 300], [100, 300], [440, 270], [560, 240], [1100, 300]];

/* The face's fall, crest (t = 0) to foot (t = 1): steep at the top and
 * easing out into the floor, as a glaciated valley side does. */
function fall(t) {
  const u = 1 - clamp01(t);
  return u * u * (1 + 0.6 * clamp01(t));
}

/* The north side's fall, longer, to the next valley north. */
function fallNorth(t) {
  const u = 1 - clamp01(t);
  return u * u * (1 + 0.9 * clamp01(t));
}

/* The cliff band's strength along the ridge: under the col and the summit. */
function cliffAt(x) {
  return smooth((x + 380) / 80) * (1 - smooth((x - 300) / 90));
}

/* The valley's floor at (x, z): its bed on the axis, rising off it. */
export function valeAt(x, z) {
  const dz = z - curve(VALE_Z, x);
  /* Rising off the axis and levelling out 160 m up, so the far sides of
   * the hills are not valley. */
  const rise = VALE_K * dz * dz;
  const cut = x > DAM_X ? linear(GORGE, x) * (1 - smooth((Math.abs(dz) - 30) / 150)) : 0;
  return linear(BED, x) - cut + rise / (1 + rise / 160);
}

/* The bare hill at (x, z), before anything is levelled. */
export function hillAt(x, z) {
  const floor = valeAt(x, z);
  const zc = curve(CREST_Z, x);
  const hc = curve(CREST_H, x);
  const d = z - zc;
  /* A wander in the creases, so no couloir is ruled straight. */
  const wob = 1.6 * noise(x / 130, z / 130, 14);
  let ridge;
  let rock = 0;
  if (d >= 0) {
    const foot = curve(FOOT, x);
    let t = d / foot;
    /* The cliff band: the face is walked down faster for a short way, so
     * it drops a hundred metres in under forty. */
    const c = cliffAt(x);
    if (c > 0) {
      t += 0.12 * c * smooth((t - 0.07) / 0.07);
    }
    const base = floor < hc ? floor : hc;
    ridge = base + (hc - base) * fall(t);
    rock = 1 - clamp01(t / 0.9);
    /* Couloirs: creases down the fall line, deepest mid face. */
    const gully = ridged(x / 38 + wob, d / 170, 11);
    ridge -= 12 * gully * smooth(t / 0.12) * (1 - smooth((t - 0.5) / 0.35));
  } else {
    const t = -d / 540;
    const north = 214;
    ridge = north + (hc - north) * fallNorth(t);
    rock = 1 - clamp01(t / 0.7);
    ridge -= 9 * ridged(x / 44 + wob, d / 180, 12) * smooth(t / 0.1) * (1 - smooth((t - 0.6) / 0.3));
  }
  /* The peaks, pointed. */
  ridge += 66 * cone(x - SUMMIT.x, z - SUMMIT.z, 150);
  ridge += 46 * cone(x - WEST_PEAK.x, z - WEST_PEAK.z, 160);
  ridge += 40 * cone(x - EAST_PEAK.x, z - EAST_PEAK.z, 150);
  /* Crags along the crest. */
  ridge += 18 * rock * rock * (ridged(x / 52 + wob, z / 52, 13) - 0.3);
  /* The southern hills. */
  const hz = curve(HILL_Z, x);
  const hw = curve(HILL_W, x);
  const u = Math.abs(z - hz) / hw;
  let hill = floor;
  if (u < 1) {
    const s = 1 - u;
    const top = curve(HILL_H, x);
    hill = floor + (top > floor ? top - floor : 0) * s * s * (3 - 2 * s);
    hill += 16 * (noise(x / 70, z / 70, 21) - 0.5) * s;
  }
  let h = ridge > hill ? ridge : hill;
  if (h < floor) {
    h = floor;
  }
  /* A rumple everywhere, more of it off the floor. */
  const off = clamp01((h - floor) / 60);
  h += (noise(x / 23, z / 23, 31) - 0.5) * (1.2 + 6 * off) + (noise(x / 9, z / 9, 32) - 0.5) * (0.3 + 1.8 * off * off);
  /* The bowl of further ridges outside the flown map, on a rounded
   * square so its corners do not show as corners. */
  const x2 = x * x;
  const z2 = z * z;
  const r = Math.sqrt(Math.sqrt(x2 * x2 + z2 * z2));
  if (r > 840) {
    h += 320 * smooth((r - 840) / 200) * (0.7 + 0.6 * noise(x / 90, z / 90, 41));
  }
  return h;
}

/* Where on the road's runs (x, z) is nearest: the distance and the road's
 * height there. */
export function roadNear(x, z) {
  let best = Infinity;
  let y = 0;
  for (let i = 0; i + 1 < ROAD.length; i += 1) {
    const a = ROAD[i];
    const b = ROAD[i + 1];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const L2 = ex * ex + ez * ez;
    let t = ((x - a.x) * ex + (z - a.z) * ez) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + ex * t - x;
    const pz = a.z + ez * t - z;
    const d = Math.sqrt(px * px + pz * pz);
    if (d < best) {
      best = d;
      y = a.y + (b.y - a.y) * t;
    }
  }
  return { d: best, y };
}

/* How far (x, z) is outside a rectangle, 0 inside. */
function outside(p, x, z) {
  const dx = Math.max(p.x0 - x, 0, x - p.x1);
  const dz = Math.max(p.z0 - z, 0, z - p.z1);
  return Math.sqrt(dx * dx + dz * dz);
}

/* The lake's basin: west of the dam, in the valley's east half. */
function inBasin(x, z) {
  return x > 60 && x < DAM_X + 1 && z > 60 && z < 520;
}

/* ---- the grid ---- */

let GRID = null;

/* The heights at every lattice point, row by row in z: GRID[j * NV + i] is
 * the height at x = -HALF + i * CELL, z = -HALF + j * CELL. Built once. */
export function heights() {
  if (GRID) {
    return GRID;
  }
  const g = new Float64Array(NV * NV);
  for (let j = 0; j < NV; j += 1) {
    const z = -HALF + j * CELL;
    for (let i = 0; i < NV; i += 1) {
      g[j * NV + i] = hillAt(-HALF + i * CELL, z);
    }
  }
  /* Each pad's level: its own, or the hill's at its middle. */
  const pads = Object.values(PADS).map((p) => ({ ...p, y: p.y ?? hillAt((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2) }));
  for (const p of Object.values(PADS)) {
    if (p.y === null) {
      p.level = pads.find((q) => q.x0 === p.x0 && q.z0 === p.z0).y;
    } else {
      p.level = p.y;
    }
  }
  for (let j = 0; j < NV; j += 1) {
    const z = -HALF + j * CELL;
    for (let i = 0; i < NV; i += 1) {
      const x = -HALF + i * CELL;
      let h = g[j * NV + i];
      /* The road, a plane in each run, eased into the hill each side. */
      const rd = roadNear(x, z);
      if (rd.d < ROAD_FLAT + ROAD_EASE) {
        const k = rd.d <= ROAD_FLAT ? 1 : 1 - smooth((rd.d - ROAD_FLAT) / ROAD_EASE);
        h += (rd.y - h) * k;
      }
      for (const p of pads) {
        const o = outside(p, x, z);
        if (o < p.ease) {
          const k = o === 0 ? 1 : 1 - smooth(o / p.ease);
          h += (p.y - h) * k;
        }
      }
      /* A pad's own rectangle is its level exactly, whatever the eases of
       * the pads and the road round it did to it. */
      for (const p of pads) {
        if (outside(p, x, z) === 0) {
          h = p.y;
        }
      }
      /* The lake, held up to its level in its basin. */
      if (inBasin(x, z) && h < LAKE) {
        h = LAKE;
      }
      g[j * NV + i] = h;
    }
  }
  GRID = g;
  return g;
}

/* The height at lattice point (i, j), held at the edge outside it. */
export function at(i, j) {
  const g = heights();
  const ii = i < 0 ? 0 : i > N ? N : i;
  const jj = j < 0 ? 0 : j > N ? N : j;
  return g[jj * NV + ii];
}

/*
 * THE GROUND AT (x, z), world metres, inside the same triangle the mesh
 * draws there. Each cell is cut corner (i, j) to corner (i + 1, j + 1), so
 * the triangle is the one below that diagonal when the point's x share is
 * the larger. Arithmetic only: this is what the plant stands on.
 */
export function floorAt(x, z) {
  const g = heights();
  let u = (x + HALF) / CELL;
  let v = (z + HALF) / CELL;
  if (u < 0) {
    u = 0;
  } else if (u > N - 1e-9) {
    u = N - 1e-9;
  }
  if (v < 0) {
    v = 0;
  } else if (v > N - 1e-9) {
    v = N - 1e-9;
  }
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fx = u - i;
  const fz = v - j;
  const k = j * NV + i;
  const h00 = g[k];
  const h11 = g[k + NV + 1];
  if (fx >= fz) {
    const h10 = g[k + 1];
    return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
  }
  const h01 = g[k + NV];
  return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
}

/* The pad's level, once heights() has run. */
export function padLevel(name) {
  heights();
  return PADS[name].level;
}

/* A digest of the grid, for the check: the same build is the same bits. */
export function gridDigest() {
  const g = heights();
  const bytes = new Uint8Array(g.buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/* The face's rock share at (x, z), for the paint: 1 at the crest. Render
 * only. */
export function crestShare(x, z) {
  const d = z - curve(CREST_Z, x);
  return d >= 0 ? 1 - clamp01(d / (0.9 * curve(FOOT, x))) : 1 - clamp01(-d / 380);
}

export { smooth, clamp01, curve };
