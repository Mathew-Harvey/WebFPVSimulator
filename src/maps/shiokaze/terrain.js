/*
 * terrain.js: the island itself. The sea is the plot's floor at h = 0 and
 * everything a pilot lands on above it is a terrace: a plan polygon with a
 * flat top, its cliffs drawn down to whatever is below, and its solid a
 * stack of boxes rastered inside it. The rocks out in the sea are the same
 * thing made small and tapered: the stacks, the wedded rocks and the arch.
 *
 * SOLID INSIDE DRAWN, always. A cliff's face is drawn from the polygon's
 * edge OUTWARD (each strata row pushed out by up to `jag`, never in), and
 * its solid is the cells of RASTER metres whose four corners are all inside
 * the polygon, so the rock a pilot sees is never further in than the rock
 * that stops them, and stops them within RASTER * 1.42 + jag of the paint.
 * A tapered rock is rastered row by row at each row's own, smaller, top.
 *
 * THE FACES ARE STRATA. Each cliff is cut in rows about three metres high,
 * pushed out by a little more or less than the row above, two greys of
 * rock in turn and the wet band at the sea: a volcanic coast drawn in
 * ledges, which is how a comic draws one, and every ledge is an ink line
 * for free (the ink pass inks a crease).
 *
 * Pure: plan arithmetic and the seeded rng, no Three.js, no JS
 * trigonometry. The real places: Atami's and Izu's cliff coast (lava
 * ledges, a sea wall under hotel blocks, tetrapods), Futami's wedded rocks
 * at Ise (two rocks tied with a straw rope, a small torii on the bigger),
 * and the arches and stacks of the Izu peninsula's west coast.
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

import { rng } from './frame.js';

/* The raster the solids are cut on, metres. */
export const RASTER = 0.5;

/* The heights, metres above the sea. */
export const TOP = 14;
export const SHELF = 2.2;
export const HILL_TOP = 26;

/* The grounds' colours: the town's grass, its paving and its gravel. */
export const GRASS = 0x86ab84;
export const DRY = 0x9fae84;
export const QUAY = 0xd2ced6;
export const ROCKTOP = 0x9a9296;

/*
 * THE TERRACES, CCW in plan. A point's third number, when it is 0, says
 * the edge FROM it has no cliff drawn, because something higher stands
 * against it (the shelf's edge under the plateau).
 */

/* The plateau: the hotel row along its straight south edge, the park and
 * the lighthouse to the west, the back street and the hill to the north,
 * the quays under its east side. */
export const PLATEAU = [
  [34, 150], [52, 143], [72, 140], [92, 141], [106, 146], [112, 151],
  [372, 151], [372, 178], [372, 198], [372, 262],
  [368, 276], [356, 292], [334, 302], [318, 304], [300, 300], [236, 300],
  [214, 296], [190, 300], [164, 297], [138, 302], [112, 299], [88, 300],
  [64, 294], [46, 282], [34, 266], [29, 248], [22, 234], [21, 222],
  [27, 208], [26, 190], [30, 170],
];

/* Which plateau edges are the hotels' retaining wall: concrete, not rock,
 * from the point at index 5 (112, 151) to index 6 (372, 151). */
const WALL_EDGES = new Set([5]);

/* The shelf: the promenade under the hotels and the quays down the east
 * side, one level, the sea wall's height. */
export const SHELF_POLY = [
  [106, 135], [372, 135], [372, 58], [412, 58], [412, 262], [372, 262, 0],
  [372, 151, 0], [112, 151, 0], [106, 146],
];

/* The shrine's hill, behind the back street; its north face is the sea
 * cliff, twenty six metres sheer. */
export const HILL = [
  [240, 268], [262, 262], [292, 262], [314, 268], [320, 284], [316, 300],
  [300, 309], [262, 311], [238, 304], [232, 288],
];

/* The spur the coast road tunnels through: rock east and west of the
 * road, and the roof over it. */
export const TUNNEL = { x0: 384, x1: 392, y0: 178, y1: 198, h0: SHELF, h1: 8.0 };
const SPUR_W = [[372, 178], [384, 178], [384, 198], [372, 198]];
const SPUR_E = [[392, 178], [404, 176], [413, 182], [414, 194], [404, 200], [392, 198]];

/* The lighthouse's knob at the west tip. */
export const KNOB = [[24, 218], [34, 212], [44, 216], [46, 228], [38, 236], [26, 234]];
export const KNOB_TOP = 17;

/*
 * THE ROCKS IN THE SEA, each { px, py, r, h, taper, seed, n }: a jittered
 * polygon of n points r round, rising h and narrowing by `taper` of itself
 * at the top.
 */
export const WEDDED = [
  { px: 150, py: 106, r: 7.5, h: 13, taper: 0.35, seed: 31, n: 10 },
  { px: 166.5, py: 109, r: 4.2, h: 7.5, taper: 0.3, seed: 37, n: 9 },
];
export const STACKS = [
  { px: 222, py: 98, r: 5.2, h: 22, taper: 0.4, seed: 41, n: 9 },
  { px: 235, py: 92, r: 4.0, h: 15, taper: 0.35, seed: 43, n: 8 },
  { px: 270, py: 114, r: 6.5, h: 10, taper: 0.3, seed: 47, n: 10 },
  { px: 92, py: 116, r: 3.4, h: 6, taper: 0.3, seed: 53, n: 8 },
  { px: 312, py: 122, r: 3.0, h: 4.5, taper: 0.25, seed: 59, n: 7 },
];

/* The arch: two legs and the bridge of rock over the gap between them,
 * which runs east and west, clear from the sea to ARCH.h0. */
export const ARCH = { x0: 48, x1: 78, y0: 110, y1: 134, gy0: 118, gy1: 126.5, h0: 8.5, h1: 17 };

/* ------------------------------------------------------------------ */
/* plan geometry                                                       */
/* ------------------------------------------------------------------ */

export function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/* Twice the signed area: positive when CCW. */
function area2(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return a;
}

/* Ear clipping, for a simple CCW polygon: index triples. */
function earClip(poly) {
  const idx = poly.map((_, i) => i);
  const out = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard < 10000) {
    guard += 1;
    let cut = false;
    for (let k = 0; k < idx.length; k += 1) {
      const ia = idx[(k + idx.length - 1) % idx.length];
      const ib = idx[k];
      const ic = idx[(k + 1) % idx.length];
      const a = poly[ia];
      const b = poly[ib];
      const c = poly[ic];
      if (cross(a, b, c) <= 1e-9) {
        continue;
      }
      let clear = true;
      for (const j of idx) {
        if (j !== ia && j !== ib && j !== ic && inside(poly[j], a, b, c)) {
          clear = false;
          break;
        }
      }
      if (clear) {
        out.push([ia, ib, ic]);
        idx.splice(k, 1);
        cut = true;
        break;
      }
    }
    if (!cut) {
      break;
    }
  }
  if (idx.length === 3) {
    out.push([idx[0], idx[1], idx[2]]);
  }
  return out;
}

/* A polygon's triangles at height h, facing up. */
export function topTris(poly, h) {
  const tris = [];
  for (const [a, b, c] of earClip(poly)) {
    tris.push([poly[a][0], poly[a][1], h], [poly[b][0], poly[b][1], h], [poly[c][0], poly[c][1], h]);
  }
  return tris;
}

/*
 * The cells of RASTER inside a polygon as boxes from h0 to h1, each row's
 * runs merged with the rows above while they keep the same run, so a
 * straight edge is one box and a ragged one a box a row.
 */
export function rasterBoxes(poly, h0, h1, emit, cell = RASTER) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const gx0 = Math.floor(x0 / cell) * cell;
  const gy0 = Math.floor(y0 / cell) * cell;
  const nx = Math.ceil((x1 - gx0) / cell);
  const ny = Math.ceil((y1 - gy0) / cell);
  /* A corner's insideness once, shared by the four cells round it. */
  const corner = new Uint8Array((nx + 1) * (ny + 1));
  for (let i = 0; i <= nx; i += 1) {
    for (let j = 0; j <= ny; j += 1) {
      corner[i * (ny + 1) + j] = inPoly(poly, gx0 + i * cell, gy0 + j * cell) ? 1 : 0;
    }
  }
  const at = (i, j) => corner[i * (ny + 1) + j];
  let open = new Map();
  const flush = (key, run, jEnd) => {
    emit(gx0 + run.i0 * cell, gy0 + run.j0 * cell, gx0 + (run.i1 + 1) * cell, gy0 + jEnd * cell, h0, h1);
  };
  for (let j = 0; j < ny; j += 1) {
    const next = new Map();
    let i = 0;
    while (i < nx) {
      if (!(at(i, j) && at(i + 1, j) && at(i, j + 1) && at(i + 1, j + 1))) {
        i += 1;
        continue;
      }
      let k = i;
      while (k + 1 < nx && at(k + 2, j) && at(k + 2, j + 1)) {
        k += 1;
      }
      const key = `${i},${k}`;
      const was = open.get(key);
      next.set(key, was ? was : { i0: i, i1: k, j0: j });
      if (was) {
        open.delete(key);
      }
      i = k + 1;
    }
    for (const [key, run] of open) {
      flush(key, run, j);
    }
    open = next;
  }
  for (const [key, run] of open) {
    flush(key, run, ny);
  }
}

/* ------------------------------------------------------------------ */
/* a terrace, drawn and made solid                                     */
/* ------------------------------------------------------------------ */

/* The outward unit normal of a CCW edge from a to b, in plan. */
function outward(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  return [dy / l, -dx / l];
}

/*
 * A cliff: every edge of `poly` (but those its points mark 0) from h1 down
 * to h0, in rows of about ROW metres, each row's points pushed out by its
 * own share of `jag`, the top row not at all so the face meets the top.
 * Materials by row: `rows(k, n)` names row k of n from the top.
 */
const ROW = 3.0;
const STEP = 2.6;
function cliff(T, poly, h0, h1, opts) {
  const r = rng(opts.seed);
  const n = Math.max(1, Math.round((h1 - h0) / ROW));
  const jag = opts.jag ?? 1.1;
  const scale = opts.scale ?? (() => 1);
  const c = centroid(poly);
  /* The points along the outline, each edge cut in STEP lengths, with the
   * vertex normal averaged at the corners. */
  const ring = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const skip = a[2] === 0;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    const m = Math.max(1, Math.round(len / STEP));
    const nrm = outward(a, b);
    for (let k = 0; k < m; k += 1) {
      ring.push({ x: a[0] + (dx * k) / m, y: a[1] + (dy * k) / m, n: nrm, skip, edge: i, corner: k === 0 });
    }
  }
  /* At a corner, the two edges' normals averaged. */
  for (let i = 0; i < ring.length; i += 1) {
    if (ring[i].corner) {
      const prev = ring[(i + ring.length - 1) % ring.length].n;
      const nx = prev[0] + ring[i].n[0];
      const ny = prev[1] + ring[i].n[1];
      const l = Math.sqrt(nx * nx + ny * ny) || 1;
      ring[i] = { ...ring[i], n: [nx / l, ny / l] };
    }
  }
  /* Each point's push at each row: a walk, so the ledges run on. */
  const push = ring.map(() => []);
  for (let k = 0; k <= n; k += 1) {
    for (let i = 0; i < ring.length; i += 1) {
      if (k === 0) {
        push[i][k] = 0;
      } else {
        const base = (jag * k) / n;
        push[i][k] = Math.max(0, base * 0.55 + r.range(0, jag * 0.6));
      }
    }
  }
  const at = (i, k) => {
    const p = ring[i % ring.length];
    const h = h1 - ((h1 - h0) * k) / n;
    const s = scale(h);
    const bx = c[0] + (p.x - c[0]) * s;
    const by = c[1] + (p.y - c[1]) * s;
    const d = push[i % ring.length][k];
    return [bx + p.n[0] * d, by + p.n[1] * d, k === n ? h0 - 0.4 : h];
  };
  const tris = new Map();
  const put = (m, t) => {
    if (!tris.has(m)) {
      tris.set(m, []);
    }
    tris.get(m).push(...t);
  };
  for (let i = 0; i < ring.length; i += 1) {
    if (ring[i].skip) {
      continue;
    }
    const wall = opts.wall && opts.wall(ring[i].edge);
    for (let k = 0; k < n; k += 1) {
      const m = wall || opts.rows(k, n, h1 - ((h1 - h0) * (k + 1)) / n);
      const a = at(i, k);
      const b = at(i + 1, k);
      const cc = at(i + 1, k + 1);
      const d = at(i, k + 1);
      /* Seen from outside: the top edge runs a to b along the CCW outline,
       * so a, d, c and a, c, b face out. */
      put(m, [a, d, cc]);
      put(m, [a, cc, b]);
    }
  }
  for (const [m, t] of tris) {
    T.mesh(m, t);
  }
}

function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

/* The rock's rows: two greys in turn, the wet band in the last metre and
 * a half over the sea. */
const rockRows = (wetTo) => (k, n, hBottom) => (hBottom < wetTo ? 'skWet' : k % 2 === 0 ? 'skRock' : 'skRockDark');

/*
 * A TERRACE: its top, its cliff and its solid. `top` is a ground colour,
 * or a material name for a top drawn as rock. Each edge's cliff goes down
 * to whatever is under the ground just outside it (the highest other
 * terrace there, or the sea), and an edge with something as high or
 * higher outside it draws none: the shelf under the plateau, the plateau
 * under the hill. `wall(edge)` names a material for an edge of its own;
 * `base(px, py)`, if given, says what is under instead.
 */
function terrace(T, poly, h1, opts) {
  if (area2(poly) <= 0) {
    throw new Error(`terrain: ${opts.name} is not counter clockwise`);
  }
  if (typeof opts.top === 'number') {
    T.ground(opts.top, topTris(poly, h1));
  } else if (opts.top) {
    T.mesh(opts.top, topTris(poly, h1));
  }
  const bases = poly.map((a, i) => edgeBase(poly, i, opts.base));
  const levels = [...new Set(bases)].filter((b) => b < h1 - 0.05).sort((a, b) => a - b);
  levels.forEach((b, k) => {
    const flagged = poly.map((p, i) => [p[0], p[1], bases[i] === b ? 1 : 0]);
    cliff(T, flagged, b, h1, {
      seed: opts.seed + 101 * k, jag: b === 0 ? (opts.seaJag ?? opts.jag) : opts.jag,
      rows: opts.rows || rockRows(b + 1.4), wall: opts.wall,
    });
  });
  rasterBoxes(poly, opts.floor ?? -1, h1, (x0, y0, x1, y1, a, b) => T.hidden(x0, y0, a, x1, y1, b, 'wall', opts.name));
  return bases;
}

/* What is under the ground a metre outside edge i of poly. */
function edgeBase(poly, i, base) {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const [nx, ny] = outward(a, b);
  const mx = (a[0] + b[0]) / 2 + nx * 1.0;
  const my = (a[1] + b[1]) / 2 + ny * 1.0;
  return base ? base(mx, my) : groundOf(mx, my, poly);
}

/* A rock in the sea: a jittered polygon, tapered. */
function seaRock(T, s, name) {
  const r = rng(s.seed);
  const poly = [];
  for (let i = 0; i < s.n; i += 1) {
    /* Round by a table of the n points of a circle, from the seeded rng's
     * wobble on a regular polygon made with integer steps: no trigonometry
     * in a solid. */
    const [ux, uy] = UNIT[s.n][i];
    const k = s.r * r.range(0.78, 1.12);
    poly.push([s.px + ux * k, s.py + uy * k]);
  }
  const scale = (h) => 1 - s.taper * (h / s.h);
  T.mesh('skRockWarm', topTris(poly.map(([x, y]) => [s.px + (x - s.px) * (1 - s.taper), s.py + (y - s.py) * (1 - s.taper)]), s.h));
  cliff(T, poly, 0, s.h, { seed: s.seed + 1, jag: 0.6, rows: rockRows(1.5), scale });
  /* The solid row by row, each at the row's own top. */
  const rows = Math.max(1, Math.round(s.h / ROW));
  for (let k = 0; k < rows; k += 1) {
    const ha = (s.h * k) / rows;
    const hb = (s.h * (k + 1)) / rows;
    const sc = scale(hb);
    const p = poly.map(([x, y]) => [s.px + (x - s.px) * sc, s.py + (y - s.py) * sc]);
    rasterBoxes(p, k === 0 ? -1 : ha, hb, (x0, y0, x1, y1, a, b) => T.hidden(x0, y0, a, x1, y1, b, 'wall', name));
  }
  return poly;
}

/* The unit circle's points for the n a rock may have, by the half angle
 * formulas from a square: exact enough for a drawing, and the same bits
 * on every engine because only + - * / and sqrt make them. */
const UNIT = (() => {
  const out = {};
  const rot = (cs, sn, k) => {
    let c = 1;
    let s = 0;
    for (let i = 0; i < k; i += 1) {
      const nc = c * cs - s * sn;
      s = c * sn + s * cs;
      c = nc;
    }
    return [c, s];
  };
  /* cos and sin of 2pi / n for the n used, from known closed forms. */
  const R = {
    7: [0.6234898018587336, 0.7818314824680298],
    8: [Math.SQRT1_2, Math.SQRT1_2],
    9: [0.766044443118978, 0.6427876096865393],
    10: [0.8090169943749475, 0.5877852522924731],
    12: [0.8660254037844387, 0.5],
  };
  for (const n of Object.keys(R)) {
    const [cs, sn] = R[n];
    out[n] = [];
    for (let i = 0; i < Number(n); i += 1) {
      out[n].push(rot(cs, sn, i));
    }
  }
  return out;
})();
export { UNIT };

/* ------------------------------------------------------------------ */
/* the island                                                          */
/* ------------------------------------------------------------------ */

/* Every terrace and its top, for groundOf. */
const TERRACES = [
  { poly: HILL, h: HILL_TOP },
  { poly: KNOB, h: KNOB_TOP },
  { poly: SPUR_W, h: TOP },
  { poly: SPUR_E, h: TOP - 1 },
  { poly: PLATEAU, h: TOP },
  { poly: SHELF_POLY, h: SHELF },
];

/* The top of the highest terrace over a plan point but `not`, or the
 * sea's 0. */
function groundOf(px, py, not = null) {
  let best = 0;
  for (const t of TERRACES) {
    if (t.poly !== not && t.h > best && inPoly(t.poly, px, py)) {
      best = t.h;
    }
  }
  return best;
}

/* Where the island's ground is, for what stands on it. */
export function groundAt(px, py) {
  return groundOf(px, py);
}

export function island(T) {
  /* The plateau: rock, but the hotels' retaining wall is concrete. */
  terrace(T, PLATEAU, TOP, {
    name: 'cliff', top: GRASS, seed: 11, jag: 1.3, seaJag: 1.6,
    wall: (edge) => (WALL_EDGES.has(edge) ? 'skGrey' : null),
  });
  /* The shelf: concrete quays and the sea wall, and the wet band along
   * the sea wall, paint a hand's breadth proud of it. */
  const shelf = terrace(T, SHELF_POLY, SHELF, { name: 'sea wall', top: QUAY, seed: 13, jag: 0.02, rows: () => 'skGrey' });
  for (let i = 0; i < SHELF_POLY.length; i += 1) {
    if (shelf[i] !== 0) {
      continue;
    }
    const a = SHELF_POLY[i];
    const b = SHELF_POLY[(i + 1) % SHELF_POLY.length];
    const [nx, ny] = outward(a, b);
    T.mesh('skWet', quadStrip(a, b, nx * 0.12, ny * 0.12, 0, 0.9));
  }
  terrace(T, HILL, HILL_TOP, { name: 'hill', top: DRY, seed: 17, jag: 1.4, seaJag: 1.8 });
  terrace(T, KNOB, KNOB_TOP, { name: 'knob', top: 'skRockWarm', seed: 19, jag: 0.8 });
  /* The spur, either side of the tunnel, and its roof. */
  terrace(T, SPUR_W, TOP, { name: 'spur', top: GRASS, seed: 23, jag: 0.9 });
  terrace(T, SPUR_E, TOP - 1, { name: 'spur', top: GRASS, seed: 29, jag: 1.2 });
  const roof = [[TUNNEL.x0, TUNNEL.y0], [TUNNEL.x1, TUNNEL.y0], [TUNNEL.x1, TUNNEL.y1], [TUNNEL.x0, TUNNEL.y1]];
  T.ground(GRASS, topTris(roof, TOP));
  T.box('skRock', TUNNEL.x0, TUNNEL.y0, TUNNEL.h1, TUNNEL.x1, TUNNEL.y1, TOP - 0.02, { kind: 'wall', name: 'tunnel roof' });
  /* The rocks out in the sea. */
  WEDDED.forEach((s) => seaRock(T, s, 'wedded rock'));
  STACKS.forEach((s) => seaRock(T, s, 'sea stack'));
  arch(T);
  boulders(T);
}

/* A vertical strip of paint along a to b, pushed (ox, oy), from h0 to h1. */
function quadStrip(a, b, ox, oy, h0, h1) {
  const A = [a[0] + ox, a[1] + oy];
  const B = [b[0] + ox, b[1] + oy];
  return [[A[0], A[1], h1], [A[0], A[1], h0], [B[0], B[1], h0], [A[0], A[1], h1], [B[0], B[1], h0], [B[0], B[1], h1]];
}

/* THE ARCH: two legs of rock and the bridge between them. */
function arch(T) {
  const A = ARCH;
  const south = [[A.x0, A.y0 + 2], [A.x0 + 8, A.y0], [A.x1 - 6, A.y0 + 1], [A.x1, A.y0 + 4], [A.x1 - 1, A.gy0], [A.x0 + 1, A.gy0]];
  const north = [[A.x0 + 1, A.gy1], [A.x1 - 2, A.gy1], [A.x1 - 1, A.y1 - 3], [A.x1 - 8, A.y1], [A.x0 + 6, A.y1 - 1], [A.x0, A.y1 - 4]];
  const span = [[A.x0 + 2, A.gy0], [A.x1 - 2, A.gy0], [A.x1 - 3, A.gy1], [A.x0 + 3, A.gy1]];
  terrace(T, south, A.h1 - 1, { name: 'sea arch', top: 'skRockWarm', seed: 61, jag: 0.7, base: () => 0 });
  terrace(T, north, A.h1, { name: 'sea arch', top: 'skRockWarm', seed: 67, jag: 0.7, base: () => 0 });
  /* The bridge: drawn as a terrace from its underside up, and its
   * underside drawn facing down. */
  terrace(T, span, A.h1 - 0.5, { name: 'sea arch', top: 'skRockWarm', seed: 71, jag: 0.5, base: () => A.h0, floor: A.h0 });
  const under = topTris([...span].reverse(), A.h0);
  T.mesh('skRockDark', under);
}

/* Boulders at the cliffs' feet, where the sea meets the rock: drawn only,
 * a few metres out, too low to fly under and never in a line. */
export const BOULDERS = [];
function boulders(T) {
  const r = rng(97);
  for (const poly of [PLATEAU, HILL, SPUR_E]) {
    for (let i = 0; i < poly.length; i += 1) {
      if (edgeBase(poly, i) !== 0) {
        continue;
      }
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const [nx, ny] = outward(a, b);
      const len = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
      const m = Math.floor(len / 6);
      for (let k = 0; k < m; k += 1) {
        const t = (k + r.range(0.1, 0.9)) / Math.max(1, m);
        const off = r.range(2.6, 7.5);
        boulder(T, a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off, r.range(0.7, 2.0), r);
      }
    }
  }
}

/* A boulder: a squat jittered octagon, its top drawn, and its solid a box
 * inside it. */
export function boulder(T, px, py, rad, r) {
  const n = 8;
  const poly = [];
  for (let i = 0; i < n; i += 1) {
    const [ux, uy] = UNIT[8][i];
    const k = rad * r.range(0.75, 1.1);
    poly.push([px + ux * k, py + uy * k]);
  }
  const h = rad * r.range(0.7, 1.1);
  const top = poly.map(([x, y]) => [px + (x - px) * 0.55, py + (y - py) * 0.55]);
  T.mesh('skRockDark', topTris(top, h));
  const tris = [];
  for (let i = 0; i < n; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const c = top[(i + 1) % n];
    const d = top[i];
    tris.push([a[0], a[1], -0.3], [b[0], b[1], -0.3], [c[0], c[1], h], [a[0], a[1], -0.3], [c[0], c[1], h], [d[0], d[1], h]);
  }
  T.mesh(r.chance(0.5) ? 'skRock' : 'skRockDark', tris);
  const s = rad * 0.45;
  T.hidden(px - s, py - s, -0.5, px + s, py + s, h * 0.8, 'wall', 'boulder');
  BOULDERS.push({ px, py, rad, h });
}

/* The foam: a jagged white band on the sea along every foot of rock and
 * wall that stands in it, a metre or two out. Paint, flat on the water. */
export function foam(T) {
  const r = rng(131);
  const band = (poly, ok, scale = 1) => {
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a[2] === 0 || !ok(a, b)) {
        continue;
      }
      const [nx, ny] = outward(a, b);
      const len = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
      const m = Math.max(1, Math.round(len / 3));
      const tris = [];
      for (let k = 0; k < m; k += 1) {
        const t0 = k / m;
        const t1 = (k + 1) / m;
        const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
        const p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        const i0 = scale * r.range(0.6, 1.4);
        const o0 = scale * r.range(1.6, 3.4);
        const o1 = scale * r.range(1.6, 3.4);
        const y = 0.03;
        const q0 = [p0[0] + nx * i0, p0[1] + ny * i0, y];
        const q1 = [p1[0] + nx * i0, p1[1] + ny * i0, y];
        const q2 = [p1[0] + nx * o1, p1[1] + ny * o1, y];
        const q3 = [p0[0] + nx * o0, p0[1] + ny * o0, y];
        tris.push(q0, q1, q2, q0, q2, q3);
      }
      T.mesh('skFoam', tris);
    }
  };
  for (const [poly, scale] of [[PLATEAU, 1], [SHELF_POLY, 0.7], [HILL, 1], [SPUR_E, 1], [KNOB, 1]]) {
    band(poly, (q) => edgeBase(poly, poly.indexOf(q)) === 0, scale);
  }
  for (const s of [...WEDDED, ...STACKS]) {
    const ring = UNIT[s.n].map(([ux, uy]) => [s.px + ux * s.r * 1.05, s.py + uy * s.r * 1.05]);
    band(ring, () => true, 0.6);
  }
}
