/*
 * terrain.js: the land of Hyoura Island, as one grid of 3 m cells. Pure
 * arithmetic, no Three.js and no JS trigonometry, because the same numbers
 * are the ground the plant is given (height below, through ./index.js and
 * the shell's sim_set_ground) and must be the same bits on every engine.
 *
 * THE SHAPE. A volcanic island of the Shiretoko kind, about 630 m east to
 * west and 330 m north to south: a long plateau that is high in the north,
 * 150 m and more, where it ends in sheer basalt sea cliffs, and that runs
 * down to the south coast and a fishing harbour at 2.4 m. A summit stands
 * in the west at about 220 m, a valley runs from under it down to the
 * harbour, and a cape in the east at about 60 m carries the lighthouse. The
 * coastline is a hand drawn polygon, roughened by a seeded noise except
 * where a line is flown along it (the falls, the Needle, the quay), where it
 * is straight on purpose.
 *
 * HOW IT IS SOLID. The plant is given the ground under the craft every
 * step, and on land that is the surface drawn (height below): each cell is
 * two triangles over its four corner heights, split on the same diagonal
 * the mesh is, so a quad sits on the snow it sees. The sea cliffs are
 * different: a cliff 150 m high cannot be a slope in a height field,
 * because a craft flying into it would be handed a floor 150 m over its
 * head. So the land is a set of whole cells, and the cliff is the edge of
 * the set, drawn as vertical walls of basalt along the cell edges; every
 * land cell on that edge, and its neighbour inward, is also a solid box
 * column from under the sea to a few centimetres under its lowest corner
 * (rimSolids). A craft meets the cliff as a wall and the plateau as ground,
 * and nothing solid stands where nothing is drawn: the walls are drawn on
 * the cell edges, which are the boxes' faces.
 *
 * THE GROTTO behind the falls is two by two cells that are drawn as land on
 * top and are sea underneath: the plant's ground there is the water, and a
 * roof box from GROTTO_ROOF up to the clifftop carries the snow over it.
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

/* The grid: 3 m cells, its corner at (GX0, GZ0), NX by NZ cells. */
export const CELL = 3;
export const GX0 = -360;
export const GZ0 = -222;
export const NX = 220;
export const NZ = 140;

/* The harbour's level, and the quay's top over it. */
export const HAMLET_H = 2.4;
export const QUAY_TOP = 2.5;
/* The cliff walls go down this far, under the water. */
export const WALL_FOOT = -3;

/*
 * THE COAST, world [x, z], clockwise seen from above with north up the
 * page. The runs marked straight are flown along: the cliff behind the
 * Needle, the cliff at the falls and the grotto, and the quay.
 */
const COAST = [
  [-345, -20], [-330, -80], [-300, -130], [-262, -170], [-215, -196],
  [-180, -206], [-120, -206], [-104, -205], [-96, -205], [-70, -204], [-6, -204],
  [30, -198], [80, -182], [125, -160], [160, -135], [188, -104], [206, -80],
  [236, -66], [262, -50], [282, -26], [286, 2], [272, 24], [244, 36], [214, 44],
  [184, 58], [158, 76], [138, 92], [129, 100], [27, 100],
  [10, 108], [-30, 118], [-80, 126], [-140, 122], [-200, 108], [-255, 86], [-300, 55], [-332, 18],
];
/* Where the coast is left straight: [x0, z0, x1, z1] boxes in the world. */
const STRAIGHT = [
  [-190, -230, -110, -196],
  [-80, -230, 0, -196],
  [20, 88, 140, 112],
];

/* THE FLATS: the hamlet's apron, the lighthouse's pad, the lookout over the
 * falls. */
export const HAMLET = { x0: 22, x1: 134, z0: 50, z1: 100 };
export const LIGHTHOUSE = { x: 246, z: -12 };
export const LOOKOUT = { x: -44, z: -193 };

/* The grotto behind the falls: cells [i0, i1] by [j0, j1], and its roof. */
export const GROTTO = { i0: 106, i1: 107, j0: 6, j1: 7 };
export const GROTTO_ROOF = 9;

/* ---- the arithmetic ---- */

function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
function sm(t) {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}
/* A round hill's share at squared distance d2, radius r: 1 at the middle,
 * 0 at r, smooth both ends. */
function bump(d2, r) {
  const u = d2 / (r * r);
  if (u >= 1) {
    return 0;
  }
  const v = 1 - u;
  return v * v;
}

/* A lattice hash in [0, 1), integer arithmetic only. */
function hash2(i, j, seed) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/* Value noise in [0, 1) at (x, z) on a lattice `s` metres apart. */
export function noise(x, z, s, seed) {
  const fx = x / s;
  const fz = z / s;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const u = tx * tx * (3 - 2 * tx);
  const v = tz * tz * (3 - 2 * tz);
  const a = hash2(i, j, seed);
  const b = hash2(i + 1, j, seed);
  const c = hash2(i, j + 1, seed);
  const d = hash2(i + 1, j + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/* Squared distance from (x, z) to the segment a b. */
function segD2(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t - x;
  const pz = az + dz * t - z;
  return { d2: px * px + pz * pz, t };
}

/* How far inside the coast (x, z) is, metres, negative at sea. */
function coastDistance(x, z) {
  let inside = false;
  let best = Infinity;
  for (let k = 0, n = COAST.length; k < n; k += 1) {
    const [ax, az] = COAST[k];
    const [bx, bz] = COAST[(k + 1) % n];
    if ((az > z) !== (bz > z) && x < ax + ((z - az) * (bx - ax)) / (bz - az)) {
      inside = !inside;
    }
    const { d2 } = segD2(x, z, ax, az, bx, bz);
    if (d2 < best) {
      best = d2;
    }
  }
  const d = Math.sqrt(best);
  return inside ? d : -d;
}

function straightAt(x, z, pad) {
  for (const [x0, z0, x1, z1] of STRAIGHT) {
    if (x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad) {
      return true;
    }
  }
  return false;
}

/* Whether the cell centred at (x, z) is land. */
function isLand(x, z) {
  let d = coastDistance(x, z);
  if (!straightAt(x, z, 0)) {
    d += (noise(x, z, 22, 7) - 0.5) * 14 + (noise(x, z, 7, 8) - 0.5) * 4;
  }
  return d > 0;
}

/* A flat's share at (x, z): 1 inside the rectangle, 0 `f` metres out. */
function rectShare(x, z, r, f) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return 1 - sm(Math.sqrt(dx * dx + dz * dz) / f);
}

/* The valley from under the summit down to the back of the hamlet. */
const VALLEY = [[-95, -70], [-40, -10], [20, 30], [70, 52]];

/*
 * THE LAND'S HEIGHT at (x, z), metres, before it is laid on the grid. Only
 * ever read at the grid's corners.
 */
export function landHeight(x, z) {
  /* High in the north, low in the south. */
  const t = (z + 200) / 300;
  let h = 8 + 146 * (1 - sm(t));
  /* The far west falls away to a lower headland. */
  h -= 46 * sm((-x - 250) / 100);
  /* The summit, and a shoulder east of it. */
  h += 72 * bump((x + 165) * (x + 165) + (z + 70) * (z + 70), 135);
  h += 26 * bump((x + 20) * (x + 20) + (z + 125) * (z + 125), 80);
  /* The cape: a lower table in the east with a crown at the lighthouse. */
  const wc = sm((x - 140) / 70);
  const cape = 50 + 9 * bump((x - 240) * (x - 240) + (z + 10) * (z + 10), 70);
  h += (cape - h) * wc;
  /* Ground roughness, less of it where the land is low. */
  const k = sm((h - 4) / 30);
  h += ((noise(x, z, 64, 1) - 0.5) * 16 + (noise(x, z, 19, 2) - 0.5) * 4) * k;
  /* The valley: its floor falls from 90 m under the summit to the hamlet. */
  let vBest = Infinity;
  let vAt = 0;
  for (let s = 0; s + 1 < VALLEY.length; s += 1) {
    const [ax, az] = VALLEY[s];
    const [bx, bz] = VALLEY[s + 1];
    const { d2, t: u } = segD2(x, z, ax, az, bx, bz);
    if (d2 < vBest) {
      vBest = d2;
      vAt = (s + u) / (VALLEY.length - 1);
    }
  }
  const floor = 90 + (HAMLET_H + 1 - 90) * vAt;
  const v = bump(vBest, 34);
  if (h > floor) {
    h += (floor - h) * v;
  }
  /* The flats. */
  const fh = rectShare(x, z, HAMLET, 24);
  h += (HAMLET_H - h) * fh;
  const lx = x - LIGHTHOUSE.x;
  const lz = z - LIGHTHOUSE.z;
  h += (57 - h) * (1 - sm((Math.sqrt(lx * lx + lz * lz) - 16) / 14));
  const ox = x - LOOKOUT.x;
  const oz = z - LOOKOUT.z;
  h += (151 - h) * (1 - sm((Math.sqrt(ox * ox + oz * oz) - 16) / 16));
  return h < 1.2 ? 1.2 : h;
}

/*
 * THE GRID, built once: which cells are land (the plant's ground is the
 * surface), which are drawn as land (the grotto's too), and the height at
 * every corner. Cached: the map and the check both ask.
 */
let GRID = null;
export function grid() {
  if (GRID) {
    return GRID;
  }
  const land = new Uint8Array(NX * NZ);
  const top = new Uint8Array(NX * NZ);
  for (let j = 0; j < NZ; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      const x = GX0 + (i + 0.5) * CELL;
      const z = GZ0 + (j + 0.5) * CELL;
      if (isLand(x, z)) {
        land[j * NX + i] = 1;
        top[j * NX + i] = 1;
      }
    }
  }
  for (let j = GROTTO.j0; j <= GROTTO.j1; j += 1) {
    for (let i = GROTTO.i0; i <= GROTTO.i1; i += 1) {
      land[j * NX + i] = 0;
      top[j * NX + i] = 1;
    }
  }
  const h = new Float64Array((NX + 1) * (NZ + 1));
  for (let j = 0; j <= NZ; j += 1) {
    for (let i = 0; i <= NX; i += 1) {
      h[j * (NX + 1) + i] = landHeight(GX0 + i * CELL, GZ0 + j * CELL);
    }
  }
  /* The quay's apron and the hamlet are dead level, so the start pads and
   * the sheds stand on the paving they are drawn on. */
  for (let j = 0; j <= NZ; j += 1) {
    for (let i = 0; i <= NX; i += 1) {
      const x = GX0 + i * CELL;
      const z = GZ0 + j * CELL;
      if (x >= HAMLET.x0 && x <= HAMLET.x1 && z >= HAMLET.z0 && z <= HAMLET.z1 + 3) {
        h[j * (NX + 1) + i] = HAMLET_H;
      }
    }
  }
  GRID = { land, top, h };
  return GRID;
}

export function cornerH(i, j) {
  return grid().h[j * (NX + 1) + i];
}
export function isLandCell(i, j) {
  return i >= 0 && j >= 0 && i < NX && j < NZ && grid().land[j * NX + i] === 1;
}
export function isTopCell(i, j) {
  return i >= 0 && j >= 0 && i < NX && j < NZ && grid().top[j * NX + i] === 1;
}

/*
 * THE GROUND AT (x, z) for the plant: the drawn surface on land, the sea
 * everywhere else. The cell's two triangles are split from its north west
 * corner to its south east one, as the mesh's are (./index.js drawLand).
 */
export function groundAt(x, z) {
  const fx = (x - GX0) / CELL;
  const fz = (z - GZ0) / CELL;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  if (!isLandCell(i, j)) {
    return 0;
  }
  const u = fx - i;
  const v = fz - j;
  const H = grid().h;
  const r = NX + 1;
  const a = H[j * r + i];
  const b = H[j * r + i + 1];
  const c = H[(j + 1) * r + i];
  const d = H[(j + 1) * r + i + 1];
  /* a b over c d; the diagonal a to d. */
  if (u >= v) {
    return a + (b - a) * u + (d - b) * v;
  }
  return a + (d - c) * u + (c - a) * v;
}

/* The lowest corner of a cell. */
function cellMin(i, j) {
  return Math.min(cornerH(i, j), cornerH(i + 1, j), cornerH(i, j + 1), cornerH(i + 1, j + 1));
}

/*
 * THE CLIFF'S SOLIDS: a box column under every land cell that is within two
 * cells of the sea, from the wall's foot to 5 cm under the cell's lowest
 * corner, so it is everywhere inside the land drawn over it. Runs of
 * neighbours along a row whose tops are within 10 cm are one box, which
 * keeps the count to a few hundred. And the grotto's roof.
 */
export function rimSolids(P) {
  const near = (i, j) => {
    for (let dj = -2; dj <= 2; dj += 1) {
      for (let di = -2; di <= 2; di += 1) {
        if (!isLandCell(i + di, j + dj)) {
          return true;
        }
      }
    }
    return false;
  };
  let count = 0;
  for (let j = 0; j < NZ; j += 1) {
    let run = null;
    const flush = () => {
      if (run) {
        P.box('arBasalt', GX0 + run.i0 * CELL, WALL_FOOT, GZ0 + j * CELL, GX0 + (run.i1 + 1) * CELL, run.top, GZ0 + (j + 1) * CELL,
          { draw: false, kind: 'cliff', name: 'cliff' });
        count += 1;
        run = null;
      }
    };
    for (let i = 0; i < NX; i += 1) {
      if (!isLandCell(i, j) || !near(i, j)) {
        flush();
        continue;
      }
      const t = cellMin(i, j) - 0.05;
      if (run && Math.abs(run.top - t) < 0.1) {
        run.i1 = i;
        run.top = Math.min(run.top, t);
        continue;
      }
      flush();
      run = { i0: i, i1: i, top: t };
    }
    flush();
  }
  /* The grotto's roof: its underside at GROTTO_ROOF, its top under the
   * lowest corner of the four cells. */
  let roofTop = Infinity;
  for (let j = GROTTO.j0; j <= GROTTO.j1; j += 1) {
    for (let i = GROTTO.i0; i <= GROTTO.i1; i += 1) {
      roofTop = Math.min(roofTop, cellMin(i, j) - 0.05);
    }
  }
  P.box('arBasalt', GX0 + GROTTO.i0 * CELL, GROTTO_ROOF, GZ0 + GROTTO.j0 * CELL,
    GX0 + (GROTTO.i1 + 1) * CELL, roofTop, GZ0 + (GROTTO.j1 + 1) * CELL, { draw: false, kind: 'cliff', name: 'grotto roof' });
  return count + 1;
}
