/*
 * egg.js: where the STF mark is painted on a built freestyle map. Pure: no
 * Three.js, no DOM, no clock, no random stream but the map's own, and no JS
 * trigonometry.
 *
 * WHAT IT IS FOR. Every freestyle map carries the STF mark, the town and
 * every map somebody built (FREESTYLE-MAPS-PLAN.md section 9). On a built
 * map the SIM chooses the spot, not the author, and the builder never shows
 * it (the owner's decision 3, section 12), so the person who built a map has
 * to find it too. This file is that choice. It reads the map exactly as
 * ./place.js placed it, the solids the physics holds and the parts the kit
 * draws, and answers with one face and where on it the mark goes. It draws
 * nothing and makes nothing solid: the mark is paint, and no solid, no
 * placement and no physics number is changed by it.
 *
 * THE RULES, in the order they are applied. The egg block of
 * scripts/props-check.js asserts each one, on the starter, on one of
 * everything, on fifty random maps and on maps built to reach each fallback.
 *
 *   1. PAINT GOES ON A FLAT FACE: a face of a solid box the kit draws as that
 *      box. A capsule is round, and a box the kit does not draw (a car's body,
 *      a rubble pile's envelope, a scaffold's net) is not where paint would be
 *      seen. The mark is 1.8 by 0.9 m, the logo's two to one, shrunk on a
 *      smaller face to no less than half that, and it lies inside its face,
 *      EDGE_INSET in from every edge, so it never overhangs one.
 *   2. OPEN AIR IN FRONT: the mark's rectangle pushed out along the face's
 *      normal is clear of every solid, is GROUND_CLEAR over the paving and is
 *      inside the plot. AIR out from a wall or a roof, room to be seen from;
 *      AIR_UNDER down from a ceiling, which is the room to fly under it that
 *      rule 5 asks of an underside. A bando storey has 3.1 m under its slab,
 *      so a ceiling asking for the wall's 3 m would lose the ground floor.
 *   3. NEVER IN A SOLID: the point LINE_OFF in front of the mark's middle is
 *      in no solid. Rule 2 already means it. It is asked on its own because a
 *      mark inside a wall is the one failure a pilot could never explain.
 *   4. NOT SEEN FROM THE PADS: every line from an eye over the spawn
 *      (EYE_HEIGHTS over the seat) to the mark passes through a solid that
 *      hides what is behind it. The lines go to the mark's middle, its four
 *      corners and the middles of its four edges, SAMPLE_INSET in, and end
 *      LINE_OFF in front of the face, so the face's own box is only in the
 *      way when it really is between the eye and the paint. What hides is
 *      opaque: a box, but not glass, a net, a railing, a balustrade of bars,
 *      a skylight or foliage, and a capsule only when it is OPAQUE_R thick
 *      (a tank, a stack, a cab). A pole or a lattice member stops a line
 *      and hides nothing, and a mark seen between the bars of a pylon is seen.
 *   5. PREFERENCE, the table SCORE: an underside over a back over a plain
 *      side, and a face deep inside its own asset over one on its outside.
 *   6. THE PICK: the faces in order of score, ties broken by the element's
 *      place in the document and then the face's own index, which is a total
 *      order, so every engine's sort gives the same list. Each face is tried
 *      at up to 49 places, middle first, and the first place that keeps rules
 *      2 to 4 is the face's. The first FINALISTS faces that have one are the
 *      finalists, and the map's own seed picks one: the same spot every time
 *      a map is flown, and a different one on the next map.
 *   7. ALWAYS A SPOT, in named steps (STEP). 'hidden' is rules 1 to 6.
 *      'away', when nothing is hidden: rules 1 to 3 on a face turned away
 *      from the pads, the farthest from them the plot allows. 'ground', when
 *      no box face will take the mark at all (an empty plot, a map of
 *      trees): flat on the paving, in the plot's corner farthest from the
 *      pads whose air is clear, or the farthest corner if none is.
 *
 * THE FRAME is the placed world's: Three.js metres, y up, origin at the
 * plot's middle (./place.js). Every face here is axis aligned, because a box
 * is only ever turned by a quarter (src/props/solids.js), so the mark's
 * normal, up and right are unit axis vectors and every test below is exact
 * box arithmetic: comparisons, + - * / and the square root, which JavaScript
 * specifies to the bit. The same map gives the same spot in Node and in
 * every browser.
 *
 * WHERE IT RUNS. Once, when a built map is built. It reads the whole map, so
 * it is fast rather than clever: the solids are filed on a grid of the plot,
 * a sight line walks only the cells it crosses, and the walk over the faces
 * stops at the eighth finalist. scripts/props-check.js times it.
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

import { hashString, seededRandom } from '../../props/parts.js';

/* ------------------------------------------------------------------ */
/* The numbers                                                         */
/* ------------------------------------------------------------------ */

/* The mark, in metres: the logo is two to one. A face too small for the
 * whole of it takes it smaller, down to MARK_MIN_SCALE of it and no less,
 * because a stencil smaller than a pizza box is not a thing anybody finds. */
export const MARK_W = 1.8;
export const MARK_H = 0.9;
export const MARK_MIN_SCALE = 0.5;
/* How far the mark stays in from every edge of its face. */
export const EDGE_INSET = 0.1;

/* Rule 2's open air, out from a wall or a roof and down from a ceiling, and
 * how far over the paving the whole of it has to be. */
export const AIR = 3;
export const AIR_UNDER = 2.2;
export const GROUND_CLEAR = 0.3;

/* Rule 4: the eyes over the seat, from a craft on its pads to one climbing
 * out, where each line ends off the face, and how far in from the mark's
 * edge its corners and edges are looked at. */
export const EYE_HEIGHTS = Object.freeze([0.3, 2, 5]);
export const LINE_OFF = 0.02;
export const SAMPLE_INSET = 0.05;

/* What hides a mark. A box, unless it is one of these, which a pilot sees
 * through: car glass, the scaffold's net, the road bridge's railing and the
 * footbridge's balustrade of close bars (both solid screens as thick as
 * their posts, src/props/street.js), and a warehouse skylight. A solid of
 * the kind 'canopy' is foliage or netting, whatever its shape. A capsule
 * hides what is behind it only when it is this thick. */
export const OPAQUE_R = 0.3;
const SEE_THROUGH = new Set(['glass', 'net', 'railing', 'balustrade', 'skylight']);
const SEE_THROUGH_KIND = 'canopy';

/*
 * Rule 5, the preference, as named weights. A face's score is the weight of
 * what it is, plus `inside` when it is deep inside its own asset and under
 * its own roof or deck, plus `full` when the whole mark fits on it.
 *
 *   underside  a ceiling or a deck's underside, found by flying under it
 *   back       a wall turned away from the pads, within 60 degrees of
 *              straight away (BACK_COS)
 *   side       any other wall
 *   top        a roof or a floor, the easiest to find from the air
 *   inside     the face's middle at least INSIDE_DEPTH inside the plan of
 *              its own element's solids, with a box of that element over
 *              the air in front of it: inside the bando, under a bridge
 *              deck, in an open container. An underside is its own cover.
 *   full       room for the whole 1.8 by 0.9 m mark
 *
 * So an inside ceiling (7) beats an inside back wall (5), which ties an
 * inside side wall with a plain underside (4), and every one of those beats
 * a plain back (2), a side (1) and a roof (0). The halves are exact in
 * binary, so a score is the same number on every engine.
 */
export const SCORE = Object.freeze({ underside: 4, back: 2, side: 1, top: 0, inside: 3, full: 0.5 });
export const BACK_COS = 0.5;
export const INSIDE_DEPTH = 1;
/* How far in front of a wall the cover over it is looked for. */
const COVER_PROBE = 0.5;

/* Rule 6: how many finalists the seed picks from. */
export const FINALISTS = 8;

/* Rule 7's steps, by name. */
export const STEP = Object.freeze({ HIDDEN: 'hidden', AWAY: 'away', GROUND: 'ground' });

/* Where on a face the mark is tried: a grid of up to 7 by 7 places, about
 * POS_STEP apart, spread to the face's edges, middle first. A big wall or
 * ceiling has a column or a beam in front of some of it and clear air in
 * front of the rest, and the middle alone would lose the face. */
const POS_STEP = 1.5;
const POS_HALF = 3;

/* The ground fallback's mark, this far in from both edges of its corner. */
const GROUND_INSET = 3;

/* Arithmetic slack: a solid that meets the prism in a plane is touching it,
 * not in it. A millimetre off every face of a blocker, so a sight line that
 * grazes a face or runs along it is not hidden by it. */
const EPS = 1e-9;
const SHRINK = 0.001;

/* The grid the solids are filed on: cells of CELL_MIN metres, or bigger on
 * a plot too big for CELLS_MAX of them a side, so the grid is never more
 * than 256 by 256 whatever a hand edited document says the plot is. */
const CELL_MIN = 4;
const CELLS_MAX = 256;

/* ------------------------------------------------------------------ */
/* The key                                                             */
/* ------------------------------------------------------------------ */

/*
 * THE KEY: which stamp a found mark earns, the one its map's card shows.
 * 'built:' and the document's id, except for the starter, Hibari Yard,
 * which is 'built:starter' whatever its id is.
 *
 * Which map is the starter is chooseDocument's rule in ./index.js: the
 * starter is what flies when no document was injected and the freestyle
 * seat holds no freestyle map with something on it, and chooseDocument
 * reports it as source 'starter'. So the caller passes that source, and a
 * card on the menu, which cannot import this lazily loaded file or the
 * starter at boot, keys the same way from the seat alone, as clipKeyForMap
 * in src/share/orbitcache.js already does for the orbit clip. A pilot who
 * opens the starter in the builder and flies it from the seat is flying a
 * map of their own, source 'canvas', and it keys by its id like any other.
 */
export function stfKey(doc, source) {
  if (source === 'starter') {
    return 'built:starter';
  }
  return `built:${doc && doc.id ? doc.id : ''}`;
}

/* ------------------------------------------------------------------ */
/* The solids                                                          */
/* ------------------------------------------------------------------ */

/*
 * The placed solids as flat arrays, with what each one is: a box or a
 * capsule, whether it hides what is behind it, whether its faces take paint,
 * and which element it belongs to.
 *
 * WHICH SOLID IS WHICH PART. ./place.js appends each element's solids in the
 * order of its parts, one per solid part (placeSolids in
 * src/props/solids.js), so walking the items' parts in order pairs every
 * solid with the part it came from, and the part says whether the kit draws
 * it. Each pairing is checked by shape and name. A placement this file does
 * not understand is painted nowhere, and the ground fallback still answers.
 */
function readSolids(placed) {
  const list = placed.solids;
  const n = list.length;
  const S = {
    n,
    box: new Uint8Array(n),
    ok: new Uint8Array(n),
    opaque: new Uint8Array(n),
    paint: new Uint8Array(n),
    item: new Int32Array(n).fill(-1),
    local: new Int32Array(n),
    /* A box's [x0, y0, z0, x1, y1, z1], a capsule's [ax, ay, az, bx, by, bz, r]. */
    g: new Float64Array(n * 7),
    /* The bounds, a capsule's padded by its radius. */
    x0: new Float64Array(n),
    y0: new Float64Array(n),
    z0: new Float64Array(n),
    x1: new Float64Array(n),
    y1: new Float64Array(n),
    z1: new Float64Array(n),
  };
  for (let i = 0; i < n; i += 1) {
    const s = list[i];
    const o = i * 7;
    if (s.box) {
      const b = s.box;
      let finite = true;
      for (let k = 0; k < 6; k += 1) {
        S.g[o + k] = b[k];
        finite = finite && Number.isFinite(b[k]);
      }
      S.box[i] = 1;
      S.ok[i] = finite && b[0] < b[3] && b[1] < b[4] && b[2] < b[5] ? 1 : 0;
      S.opaque[i] = s.kind !== SEE_THROUGH_KIND && !SEE_THROUGH.has(s.name) ? 1 : 0;
      S.x0[i] = b[0];
      S.y0[i] = b[1];
      S.z0[i] = b[2];
      S.x1[i] = b[3];
      S.y1[i] = b[4];
      S.z1[i] = b[5];
    } else if (s.cap) {
      const c = s.cap;
      let finite = true;
      for (let k = 0; k < 7; k += 1) {
        S.g[o + k] = c[k];
        finite = finite && Number.isFinite(c[k]);
      }
      const r = c[6];
      S.ok[i] = finite && r > 0 ? 1 : 0;
      S.opaque[i] = s.kind !== SEE_THROUGH_KIND && r >= OPAQUE_R ? 1 : 0;
      S.x0[i] = (c[0] < c[3] ? c[0] : c[3]) - r;
      S.y0[i] = (c[1] < c[4] ? c[1] : c[4]) - r;
      S.z0[i] = (c[2] < c[5] ? c[2] : c[5]) - r;
      S.x1[i] = (c[0] > c[3] ? c[0] : c[3]) + r;
      S.y1[i] = (c[1] > c[4] ? c[1] : c[4]) + r;
      S.z1[i] = (c[2] > c[5] ? c[2] : c[5]) + r;
    }
  }
  /* Pair the solids with their parts. */
  let k = 0;
  let paired = true;
  const items = placed.items || [];
  for (let ii = 0; ii < items.length && paired; ii += 1) {
    const parts = items[ii].parts || [];
    let local = 0;
    for (const p of parts) {
      if (!p || !p.solid) {
        continue;
      }
      const s = list[k];
      if (!s || (p.t === 'box') !== Boolean(s.box) || s.name !== p.name) {
        paired = false;
        break;
      }
      S.item[k] = ii;
      S.local[k] = local;
      if (p.t === 'box' && p.draw && S.ok[k]) {
        S.paint[k] = 1;
      }
      k += 1;
      local += 1;
    }
  }
  if (!paired || k !== n) {
    S.paint.fill(0);
    S.item.fill(-1);
  }
  return S;
}

/*
 * THE GRID: the plot in square cells, each listing every solid whose padded
 * plan bounds reach it, as two flat arrays the way ./place.js files its
 * tops. A solid past the plot's edge is filed in the edge cells, so nothing
 * is lost and the grid stays the plot's size. `stamp` marks a solid already
 * asked about in one query, so a solid filed in many cells is asked once.
 */
function buildGrid(S, W, D) {
  const cell = Math.max(CELL_MIN, (W > D ? W : D) / CELLS_MAX);
  const ox = -W / 2;
  const oz = -D / 2;
  const nx = Math.floor(W / cell) + 1;
  const nz = Math.floor(D / cell) + 1;
  const G = {
    cell, ox, oz, nx, nz,
    start: new Int32Array(nx * nz + 1),
    items: null,
    stamp: new Uint32Array(S.n),
    query: 0,
  };
  const count = new Int32Array(nx * nz);
  const span = (i, out) => {
    out[0] = cellOf(G.ox, cell, nx, S.x0[i]);
    out[1] = cellOf(G.ox, cell, nx, S.x1[i]);
    out[2] = cellOf(G.oz, cell, nz, S.z0[i]);
    out[3] = cellOf(G.oz, cell, nz, S.z1[i]);
  };
  const r = [0, 0, 0, 0];
  for (let i = 0; i < S.n; i += 1) {
    if (!S.ok[i]) {
      continue;
    }
    span(i, r);
    for (let cx = r[0]; cx <= r[1]; cx += 1) {
      for (let cz = r[2]; cz <= r[3]; cz += 1) {
        count[cx * nz + cz] += 1;
      }
    }
  }
  let total = 0;
  for (let c = 0; c < nx * nz; c += 1) {
    G.start[c] = total;
    total += count[c];
  }
  G.start[nx * nz] = total;
  G.items = new Int32Array(total);
  const fill = new Int32Array(nx * nz);
  for (let i = 0; i < S.n; i += 1) {
    if (!S.ok[i]) {
      continue;
    }
    span(i, r);
    for (let cx = r[0]; cx <= r[1]; cx += 1) {
      for (let cz = r[2]; cz <= r[3]; cz += 1) {
        const c = cx * nz + cz;
        G.items[G.start[c] + fill[c]] = i;
        fill[c] += 1;
      }
    }
  }
  return G;
}

/* The cell a coordinate is in, clamped to the grid. */
function cellOf(o, cell, n, v) {
  const c = Math.floor((v - o) / cell);
  if (!(c >= 0)) {
    return 0;
  }
  return c > n - 1 ? n - 1 : c;
}

function nextQuery(G) {
  G.query = (G.query + 1) >>> 0;
  if (G.query === 0) {
    G.stamp.fill(0);
    G.query = 1;
  }
  return G.query;
}

/* ------------------------------------------------------------------ */
/* Exact tests                                                         */
/* ------------------------------------------------------------------ */

/* Does the segment from a to b meet the box lo..hi, shrunk by `shrink` on
 * every side, over a stretch of the segment longer than none? The slab
 * method: the parameter interval inside each pair of planes, intersected. */
function segHitsBox(ax, ay, az, bx, by, bz, x0, y0, z0, x1, y1, z1, shrink) {
  let t0 = 0;
  let t1 = 1;
  const A = [ax, ay, az];
  const Dd = [bx - ax, by - ay, bz - az];
  const LO = [x0 + shrink, y0 + shrink, z0 + shrink];
  const HI = [x1 - shrink, y1 - shrink, z1 - shrink];
  for (let k = 0; k < 3; k += 1) {
    if (!(LO[k] < HI[k])) {
      return false;
    }
    const d = Dd[k];
    if (d === 0) {
      if (A[k] <= LO[k] || A[k] >= HI[k]) {
        return false;
      }
      continue;
    }
    let u0 = (LO[k] - A[k]) / d;
    let u1 = (HI[k] - A[k]) / d;
    if (u0 > u1) {
      const t = u0;
      u0 = u1;
      u1 = t;
    }
    if (u0 > t0) {
      t0 = u0;
    }
    if (u1 < t1) {
      t1 = u1;
    }
    if (!(t0 < t1)) {
      return false;
    }
  }
  return true;
}

/* The same, closed and grown by `grow`: does the segment come within the
 * box grown by `grow` on every side? A capsule of radius r whose axis meets
 * the prism grown by r may touch the prism, and one that does not cannot,
 * so rule 2 asks this of a capsule: never too lenient, at worst a corner's
 * width too strict. */
function segNearBox(ax, ay, az, bx, by, bz, lo, hi, grow) {
  let t0 = 0;
  let t1 = 1;
  const A = [ax, ay, az];
  const Dd = [bx - ax, by - ay, bz - az];
  for (let k = 0; k < 3; k += 1) {
    const l = lo[k] - grow;
    const h = hi[k] + grow;
    const d = Dd[k];
    if (d === 0) {
      if (A[k] < l || A[k] > h) {
        return false;
      }
      continue;
    }
    let u0 = (l - A[k]) / d;
    let u1 = (h - A[k]) / d;
    if (u0 > u1) {
      const t = u0;
      u0 = u1;
      u1 = t;
    }
    if (u0 > t0) {
      t0 = u0;
    }
    if (u1 < t1) {
      t1 = u1;
    }
    if (t0 > t1) {
      return false;
    }
  }
  return true;
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

/* Squared distance between two segments, p1 to q1 and p2 to q2 (Ericson,
 * Real-Time Collision Detection, 5.1.9, the routine scripts/props-check.js
 * uses for its own clearances). */
function segSegDist2(p1, q1, p2, q2) {
  const d1x = q1[0] - p1[0];
  const d1y = q1[1] - p1[1];
  const d1z = q1[2] - p1[2];
  const d2x = q2[0] - p2[0];
  const d2y = q2[1] - p2[1];
  const d2z = q2[2] - p2[2];
  const rx = p1[0] - p2[0];
  const ry = p1[1] - p2[1];
  const rz = p1[2] - p2[2];
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  const TINY = 1e-12;
  let s = 0;
  let t = 0;
  if (a <= TINY && e <= TINY) {
    return rx * rx + ry * ry + rz * rz;
  }
  if (a <= TINY) {
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= TINY) {
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const den = a * e - b * b;
      s = den !== 0 ? clamp01((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const cx = rx + d1x * s - d2x * t;
  const cy = ry + d1y * s - d2y * t;
  const cz = rz + d1z * s - d2z * t;
  return cx * cx + cy * cy + cz * cz;
}

/* Squared distance from a point to a segment. */
function pointSegDist2(px, py, pz, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const L = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (L > 0) {
    t = clamp01(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L);
  }
  const ex = ax + dx * t - px;
  const ey = ay + dy * t - py;
  const ez = az + dz * t - pz;
  return ex * ex + ey * ey + ez * ez;
}

/* ------------------------------------------------------------------ */
/* Rules 2, 3 and 4                                                    */
/* ------------------------------------------------------------------ */

/* Rule 2: is the box lo..hi clear of every solid? A box that meets it in a
 * plane, the face the mark is painted on among them, touches it and is not
 * in it. */
function prismClear(S, G, lo, hi) {
  const q = nextQuery(G);
  const cx0 = cellOf(G.ox, G.cell, G.nx, lo[0]);
  const cx1 = cellOf(G.ox, G.cell, G.nx, hi[0]);
  const cz0 = cellOf(G.oz, G.cell, G.nz, lo[2]);
  const cz1 = cellOf(G.oz, G.cell, G.nz, hi[2]);
  for (let cx = cx0; cx <= cx1; cx += 1) {
    for (let cz = cz0; cz <= cz1; cz += 1) {
      const c = cx * G.nz + cz;
      for (let k = G.start[c]; k < G.start[c + 1]; k += 1) {
        const i = G.items[k];
        if (G.stamp[i] === q) {
          continue;
        }
        G.stamp[i] = q;
        if (S.x0[i] >= hi[0] - EPS || S.x1[i] <= lo[0] + EPS
          || S.y0[i] >= hi[1] - EPS || S.y1[i] <= lo[1] + EPS
          || S.z0[i] >= hi[2] - EPS || S.z1[i] <= lo[2] + EPS) {
          continue;
        }
        if (S.box[i]) {
          /* The bounds are the box: overlapping bounds are an overlap. */
          return false;
        }
        const o = i * 7;
        const g = S.g;
        if (segNearBox(g[o], g[o + 1], g[o + 2], g[o + 3], g[o + 4], g[o + 5], lo, hi, g[o + 6])) {
          return false;
        }
      }
    }
  }
  return true;
}

/* Rule 3: is the point in no solid? */
function pointFree(S, G, x, y, z) {
  const c = cellOf(G.ox, G.cell, G.nx, x) * G.nz + cellOf(G.oz, G.cell, G.nz, z);
  const g = S.g;
  for (let k = G.start[c]; k < G.start[c + 1]; k += 1) {
    const i = G.items[k];
    const o = i * 7;
    if (S.box[i]) {
      if (x > g[o] + EPS && x < g[o + 3] - EPS && y > g[o + 1] + EPS && y < g[o + 4] - EPS
        && z > g[o + 2] + EPS && z < g[o + 5] - EPS) {
        return false;
      }
    } else if (pointSegDist2(x, y, z, g[o], g[o + 1], g[o + 2], g[o + 3], g[o + 4], g[o + 5]) < g[o + 6] * g[o + 6]) {
      return false;
    }
  }
  return true;
}

/* Does solid i hide the line a to b: is it opaque, and does the line pass
 * through it a millimetre in from its faces? */
function hides(S, i, a, b) {
  if (!S.opaque[i]) {
    return false;
  }
  const g = S.g;
  const o = i * 7;
  if (S.box[i]) {
    return segHitsBox(a[0], a[1], a[2], b[0], b[1], b[2],
      g[o], g[o + 1], g[o + 2], g[o + 3], g[o + 4], g[o + 5], SHRINK);
  }
  const r = g[o + 6] - SHRINK;
  return segSegDist2(a, b, [g[o], g[o + 1], g[o + 2]], [g[o + 3], g[o + 4], g[o + 5]]) < r * r;
}

/*
 * Rule 4 for one line: is the straight line from a (at the mark) to b (an
 * eye) hidden by a solid? It walks the grid cells the line's plan crosses,
 * from the mark outwards, because what hides a mark is usually right beside
 * it, and stops at the first solid that hides the line. A cell the walk
 * could skip at a corner only ever loses a blocker, which makes a mark
 * count as seen and never as hidden.
 */
function lineHidden(S, G, a, b) {
  const q = nextQuery(G);
  const ylo = a[1] < b[1] ? a[1] : b[1];
  const yhi = a[1] > b[1] ? a[1] : b[1];
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const gx0 = G.ox;
  const gx1 = G.ox + G.nx * G.cell;
  const gz0 = G.oz;
  const gz1 = G.oz + G.nz * G.cell;
  let t0 = 0;
  let t1 = 1;
  if (dx === 0) {
    if (a[0] < gx0 || a[0] > gx1) {
      return false;
    }
  } else {
    let u0 = (gx0 - a[0]) / dx;
    let u1 = (gx1 - a[0]) / dx;
    if (u0 > u1) {
      const t = u0;
      u0 = u1;
      u1 = t;
    }
    t0 = u0 > t0 ? u0 : t0;
    t1 = u1 < t1 ? u1 : t1;
  }
  if (dz === 0) {
    if (a[2] < gz0 || a[2] > gz1) {
      return false;
    }
  } else {
    let u0 = (gz0 - a[2]) / dz;
    let u1 = (gz1 - a[2]) / dz;
    if (u0 > u1) {
      const t = u0;
      u0 = u1;
      u1 = t;
    }
    t0 = u0 > t0 ? u0 : t0;
    t1 = u1 < t1 ? u1 : t1;
  }
  if (t0 > t1) {
    return false;
  }
  const cellHides = (cx, cz) => {
    const c = cx * G.nz + cz;
    for (let k = G.start[c]; k < G.start[c + 1]; k += 1) {
      const i = G.items[k];
      if (G.stamp[i] === q) {
        continue;
      }
      G.stamp[i] = q;
      if (S.y1[i] < ylo || S.y0[i] > yhi) {
        continue;
      }
      if (hides(S, i, a, b)) {
        return true;
      }
    }
    return false;
  };
  let cx = cellOf(G.ox, G.cell, G.nx, a[0] + dx * t0);
  let cz = cellOf(G.oz, G.cell, G.nz, a[2] + dz * t0);
  const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
  const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
  let tMaxX = Infinity;
  let tMaxZ = Infinity;
  if (stepX > 0) {
    tMaxX = (G.ox + (cx + 1) * G.cell - a[0]) / dx;
  } else if (stepX < 0) {
    tMaxX = (G.ox + cx * G.cell - a[0]) / dx;
  }
  if (stepZ > 0) {
    tMaxZ = (G.oz + (cz + 1) * G.cell - a[2]) / dz;
  } else if (stepZ < 0) {
    tMaxZ = (G.oz + cz * G.cell - a[2]) / dz;
  }
  const tDX = stepX ? G.cell / (dx < 0 ? -dx : dx) : Infinity;
  const tDZ = stepZ ? G.cell / (dz < 0 ? -dz : dz) : Infinity;
  const inGrid = (x, z) => x >= 0 && x < G.nx && z >= 0 && z < G.nz;
  for (;;) {
    if (cellHides(cx, cz)) {
      return true;
    }
    const tNext = tMaxX < tMaxZ ? tMaxX : tMaxZ;
    if (!(tNext <= t1)) {
      return false;
    }
    if (tMaxX < tMaxZ) {
      cx += stepX;
      tMaxX += tDX;
    } else if (tMaxZ < tMaxX) {
      cz += stepZ;
      tMaxZ += tDZ;
    } else {
      /* Through a corner: the two cells either side of it, then on. */
      if (inGrid(cx + stepX, cz) && cellHides(cx + stepX, cz)) {
        return true;
      }
      if (inGrid(cx, cz + stepZ) && cellHides(cx, cz + stepZ)) {
        return true;
      }
      cx += stepX;
      cz += stepZ;
      tMaxX += tDX;
      tMaxZ += tDZ;
    }
    if (!inGrid(cx, cz)) {
      return false;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Faces                                                               */
/* ------------------------------------------------------------------ */

/* Face f of a box: its axis a (0 x, 1 y, 2 z) is f >> 1 and its outward
 * normal points to the minus side for an even f and the plus side for an
 * odd one. So 0 and 1 face -x and +x, 2 is the underside, 3 the top, and 4
 * and 5 face -z and +z. */

/* The sign of e_i x e_j along the third axis, for i and j different. */
function crossSign(i, j) {
  return (j - i + 3) % 3 === 1 ? 1 : -1;
}

function axisVec(a, s) {
  return [a === 0 ? s : 0, a === 1 ? s : 0, a === 2 ? s : 0];
}

/* How big a mark fits on a face `across` wide and `tall` high, as a share
 * of the full mark, or 0 when not even the smallest does. */
function fitScale(across, tall) {
  let s = (across - 2 * EDGE_INSET) / MARK_W;
  const v = (tall - 2 * EDGE_INSET) / MARK_H;
  if (v < s) {
    s = v;
  }
  if (s > 1) {
    s = 1;
  }
  return s >= MARK_MIN_SCALE ? s : 0;
}

/* The places a mark is tried on a face, as whole steps from its middle:
 * nearest the middle first, then lower before higher, then left to right. */
const ORDER = [];
for (let kv = -POS_HALF; kv <= POS_HALF; kv += 1) {
  for (let ku = -POS_HALF; ku <= POS_HALF; ku += 1) {
    ORDER.push([ku, kv]);
  }
}
ORDER.sort((p, q) => (p[0] * p[0] + p[1] * p[1]) - (q[0] * q[0] + q[1] * q[1]) || p[1] - q[1] || p[0] - q[0]);

/* Each element's plan, from its own solids: [x0, z0, x1, z1]. */
function footprints(S, count) {
  const F = new Float64Array(count * 4);
  for (let ii = 0; ii < count; ii += 1) {
    F[ii * 4] = Infinity;
    F[ii * 4 + 1] = Infinity;
    F[ii * 4 + 2] = -Infinity;
    F[ii * 4 + 3] = -Infinity;
  }
  for (let i = 0; i < S.n; i += 1) {
    const ii = S.item[i];
    if (ii < 0 || !S.ok[i]) {
      continue;
    }
    const o = ii * 4;
    F[o] = S.x0[i] < F[o] ? S.x0[i] : F[o];
    F[o + 1] = S.z0[i] < F[o + 1] ? S.z0[i] : F[o + 1];
    F[o + 2] = S.x1[i] > F[o + 2] ? S.x1[i] : F[o + 2];
    F[o + 3] = S.z1[i] > F[o + 3] ? S.z1[i] : F[o + 3];
  }
  return F;
}

/* Is there a box of element ii, other than `host`, whose plan holds (x, z)
 * and whose underside is at or over y: a roof or a deck over that air? */
function coveredBy(S, G, ii, host, x, z, y) {
  const c = cellOf(G.ox, G.cell, G.nx, x) * G.nz + cellOf(G.oz, G.cell, G.nz, z);
  for (let k = G.start[c]; k < G.start[c + 1]; k += 1) {
    const i = G.items[k];
    if (i === host || !S.box[i] || S.item[i] !== ii) {
      continue;
    }
    if (S.y0[i] >= y - EPS && x > S.x0[i] && x < S.x1[i] && z > S.z0[i] && z < S.z1[i]) {
      return true;
    }
  }
  return false;
}

/*
 * One face of box i as a candidate, or null when no mark can go on it. Its
 * score is taken at its middle, so it does not depend on where on the face
 * the mark ends up. The mark's up is world up on a wall. On a ceiling it is
 * the plan axis pointing back toward the pads: a craft flying in under a
 * deck with its camera tilted up sees the near part of the ceiling at the
 * top of its picture. On a roof it points away from the pads, as a craft
 * flying over sees the far part at the top. Of a ceiling's or a roof's two
 * plan axes, the one that takes the bigger mark, and on a tie the one more
 * in line with the pads.
 */
function makeFace(S, G, i, f, spawn, F) {
  const a = f >> 1;
  const sg = f & 1 ? 1 : -1;
  const o = i * 7;
  const lo = [S.g[o], S.g[o + 1], S.g[o + 2]];
  const hi = [S.g[o + 3], S.g[o + 4], S.g[o + 5]];
  const plane = sg > 0 ? hi[a] : lo[a];
  const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  c[a] = plane;
  const dx = c[0] - spawn.x;
  const dz = c[2] - spawn.z;
  let cls;
  let ua;
  let us;
  let s;
  if (a === 1) {
    cls = sg < 0 ? 'underside' : 'top';
    /* A ceiling's mark reads toward the pads, a roof's away from them. */
    const tx = sg < 0 ? -dx : dx;
    const tz = sg < 0 ? -dz : dz;
    const sx = fitScale(hi[2] - lo[2], hi[0] - lo[0]);
    const sz = fitScale(hi[0] - lo[0], hi[2] - lo[2]);
    const ax = tx < 0 ? -tx : tx;
    const az = tz < 0 ? -tz : tz;
    if (sx > sz || (sx === sz && ax >= az)) {
      ua = 0;
      us = tx < 0 ? -1 : 1;
      s = sx;
    } else {
      ua = 2;
      us = tz < 0 ? -1 : 1;
      s = sz;
    }
  } else {
    const along = a === 0 ? sg * dx : sg * dz;
    const len = Math.sqrt(dx * dx + dz * dz);
    cls = len > 0 && along > BACK_COS * len ? 'back' : 'side';
    ua = 1;
    us = 1;
    s = fitScale(hi[2 - a] - lo[2 - a], hi[1] - lo[1]);
  }
  if (!s) {
    return null;
  }
  const w = MARK_W * s;
  const h = MARK_H * s;
  /* Rule 2 cannot hold anywhere on this face: a ceiling too low to fly
   * under, a roof at the paving, a wall too short to keep a mark off it. */
  if ((cls === 'underside' && plane - AIR_UNDER <= GROUND_CLEAR)
    || (cls === 'top' && plane <= GROUND_CLEAR)
    || (a !== 1 && hi[1] - EDGE_INSET - h <= GROUND_CLEAR)) {
    return null;
  }
  const ra = 3 - ua - a;
  const rs = us * sg * crossSign(ua, a);
  const ii = S.item[i];
  /* Rule 5's `inside`: deep in its own element's plan, and under its own
   * roof or deck. */
  const fo = ii * 4;
  const depthX = c[0] - F[fo] < F[fo + 2] - c[0] ? c[0] - F[fo] : F[fo + 2] - c[0];
  const depthZ = c[2] - F[fo + 1] < F[fo + 3] - c[2] ? c[2] - F[fo + 1] : F[fo + 3] - c[2];
  const depth = depthX < depthZ ? depthX : depthZ;
  let inside = false;
  if (depth >= INSIDE_DEPTH) {
    if (cls === 'underside') {
      inside = true;
    } else {
      const px = c[0] + (a === 0 ? sg * COVER_PROBE : 0);
      const pz = c[2] + (a === 2 ? sg * COVER_PROBE : 0);
      inside = coveredBy(S, G, ii, i, px, pz, hi[1]);
    }
  }
  const score = SCORE[cls] + (inside ? SCORE.inside : 0) + (s === 1 ? SCORE.full : 0);
  const Ru = (hi[ra] - lo[ra]) / 2 - EDGE_INSET - w / 2;
  const Rv = (hi[ua] - lo[ua]) / 2 - EDGE_INSET - h / 2;
  return {
    i, f, a, sg, plane, ua, us, ra, rs, s, w, h, cls, inside, score,
    item: ii,
    order: S.local[i] * 6 + f,
    cr: (lo[ra] + hi[ra]) / 2,
    cu: (lo[ua] + hi[ua]) / 2,
    Ru: Ru > 0 ? Ru : 0,
    Rv: Rv > 0 ? Rv : 0,
    first: null,
  };
}

/* Highest score first, then the element's place in the document, then the
 * face's own index in its element: a total order, so the sort is the same
 * on every engine. */
function byScore(p, q) {
  return q.score - p.score || p.item - q.item || p.order - q.order;
}

/* The steps across a face's reach, POS_STEP apart at most, and never more
 * than POS_HALF either side of the middle. */
function stepsFor(R) {
  if (!(R > EPS)) {
    return 0;
  }
  const k = Math.ceil(R / POS_STEP);
  return k < POS_HALF ? k : POS_HALF;
}

/* The mark's middle at place (ku, kv) on the face. */
function placeAt(face, ku, kv, Ku, Kv) {
  const p = [0, 0, 0];
  p[face.a] = face.plane;
  p[face.ra] = face.cr + (Ku ? (face.Ru * ku) / Ku : 0);
  p[face.ua] = face.cu + (Kv ? (face.Rv * kv) / Kv : 0);
  return p;
}

/* Rules 2 and 3 for a mark with its middle at p. */
function airClear(S, G, face, p, W, D) {
  const lo = [0, 0, 0];
  const hi = [0, 0, 0];
  const depth = face.cls === 'underside' ? AIR_UNDER : AIR;
  lo[face.a] = face.sg > 0 ? face.plane : face.plane - depth;
  hi[face.a] = face.sg > 0 ? face.plane + depth : face.plane;
  lo[face.ra] = p[face.ra] - face.w / 2;
  hi[face.ra] = p[face.ra] + face.w / 2;
  lo[face.ua] = p[face.ua] - face.h / 2;
  hi[face.ua] = p[face.ua] + face.h / 2;
  if (lo[0] < -W / 2 - EPS || hi[0] > W / 2 + EPS || lo[2] < -D / 2 - EPS || hi[2] > D / 2 + EPS) {
    return false;
  }
  if (!(lo[1] > GROUND_CLEAR)) {
    return false;
  }
  if (!prismClear(S, G, lo, hi)) {
    return false;
  }
  const q = [p[0], p[1], p[2]];
  q[face.a] += face.sg * LINE_OFF;
  return pointFree(S, G, q[0], q[1], q[2]);
}

/* Rule 4 for a mark with its middle at p: every line from every eye. The
 * middle first, from the highest eye, because a mark that is seen at all is
 * most often seen there, and a line that is seen ends the question. */
const SAMPLES = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]];
function hiddenFrom(S, G, face, p, eyes, stats) {
  const hu = face.w / 2 - SAMPLE_INSET;
  const hv = face.h / 2 - SAMPLE_INSET;
  const t = [0, 0, 0];
  for (const [su, sv] of SAMPLES) {
    t[face.a] = face.plane + face.sg * LINE_OFF;
    t[face.ra] = p[face.ra] + su * hu;
    t[face.ua] = p[face.ua] + sv * hv;
    for (let e = eyes.length - 1; e >= 0; e -= 1) {
      stats.lines += 1;
      if (!lineHidden(S, G, t, eyes[e])) {
        return false;
      }
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* The choice                                                          */
/* ------------------------------------------------------------------ */

function faceSpot(key, step, face, p, placed) {
  const it = placed.items[face.item];
  return {
    key,
    step,
    kind: face.cls,
    inside: face.inside,
    p: [p[0], p[1], p[2]],
    n: axisVec(face.a, face.sg),
    up: axisVec(face.ua, face.us),
    right: axisVec(face.ra, face.rs),
    w: face.w,
    h: face.h,
    elementId: it && it.el ? it.el.id : null,
    type: it && it.el ? it.el.type : null,
    part: placed.solids[face.i].name,
    score: face.score,
  };
}

/*
 * The last step: flat on the paving, in a corner of the plot, GROUND_INSET
 * in from both edges, the corner farthest from the pads first, and the
 * first corner with AIR clear over the mark. With none clear, the farthest
 * anyway, because every map carries the mark.
 */
function groundSpot(key, S, G, placed) {
  const W = placed.W;
  const D = placed.D;
  const spawn = placed.spawn;
  const ex = W / 2 - (GROUND_INSET < W / 2 ? GROUND_INSET : W / 2);
  const ez = D / 2 - (GROUND_INSET < D / 2 ? GROUND_INSET : D / 2);
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], k) => {
    const x = sx * ex;
    const z = sz * ez;
    const dx = x - spawn.x;
    const dz = z - spawn.z;
    return { k, x, z, dx, dz, d2: dx * dx + dz * dz };
  });
  corners.sort((p, q) => q.d2 - p.d2 || p.k - q.k);
  let pick = null;
  for (const c of corners) {
    /* Up along the plan axis most in line with the way from the pads, and
     * away from them, so a craft flying over from the pads reads it. */
    const alongX = (c.dx < 0 ? -c.dx : c.dx) >= (c.dz < 0 ? -c.dz : c.dz);
    const up = alongX ? [c.dx < 0 ? -1 : 1, 0, 0] : [0, 0, c.dz < 0 ? -1 : 1];
    const hw = (alongX ? MARK_H : MARK_W) / 2;
    const hd = (alongX ? MARK_W : MARK_H) / 2;
    const clear = prismClear(S, G, [c.x - hw, 0, c.z - hd], [c.x + hw, AIR, c.z + hd]);
    if (clear || !pick) {
      pick = { c, up, clear };
    }
    if (clear) {
      break;
    }
  }
  const { c, up, clear } = pick;
  return {
    key,
    step: STEP.GROUND,
    kind: 'ground',
    inside: false,
    p: [c.x, 0, c.z],
    n: [0, 1, 0],
    up,
    /* up x n with n straight up is (-up.z, 0, up.x); 0 - 0 is +0, so no
     * component comes out as a negative zero. */
    right: [0 - up[2], 0, up[0] + 0],
    w: MARK_W,
    h: MARK_H,
    elementId: null,
    type: null,
    part: null,
    score: null,
    clear,
  };
}

/*
 * The whole search, with what it found on the way, for scripts/props-check.js.
 * `source` is chooseDocument's ('injected', 'canvas' or 'starter'); it
 * changes the key and nothing else.
 *
 * Returns { spot, finalists, stats }: finalists are the spots the seed
 * picked from, best first, and stats counts the faces, the places tried and
 * the sight lines walked.
 */
export function stfSearch(placed, doc, source) {
  const key = stfKey(doc, source);
  const W = placed.W;
  const D = placed.D;
  const spawn = placed.spawn;
  const S = readSolids(placed);
  const G = buildGrid(S, W, D);
  const items = placed.items || [];
  const F = footprints(S, items.length);
  const eyes = EYE_HEIGHTS.map((h) => [spawn.x, spawn.y + h, spawn.z]);
  const stats = { faces: 0, tried: 0, lines: 0 };

  const faces = [];
  for (let i = 0; i < S.n; i += 1) {
    if (!S.paint[i]) {
      continue;
    }
    for (let f = 0; f < 6; f += 1) {
      const face = makeFace(S, G, i, f, spawn, F);
      if (face) {
        faces.push(face);
      }
    }
  }
  faces.sort(byScore);
  stats.faces = faces.length;

  /* Rules 1 to 6: the finalists, and on the way each face's first place
   * that keeps rules 2 and 3, which the 'away' step reads if nothing is
   * hidden (and then the walk has been over every face).
   *
   * ONE FINALIST PER ELEMENT. A bando has dozens of ceiling panels that
   * score the same, and without this the eight finalists on any map with
   * one in it were eight panels of one ceiling: the seed chose between
   * neighbours, and every map hid the mark in its first bando. One each,
   * and the eight are eight places on the map. */
  const finalists = [];
  const taken = new Uint8Array(items.length);
  for (const face of faces) {
    if (taken[face.item]) {
      continue;
    }
    const Ku = stepsFor(face.Ru);
    const Kv = stepsFor(face.Rv);
    for (const [ku, kv] of ORDER) {
      if (ku < -Ku || ku > Ku || kv < -Kv || kv > Kv) {
        continue;
      }
      stats.tried += 1;
      const p = placeAt(face, ku, kv, Ku, Kv);
      if (!airClear(S, G, face, p, W, D)) {
        continue;
      }
      if (!face.first) {
        face.first = p;
      }
      if (hiddenFrom(S, G, face, p, eyes, stats)) {
        finalists.push(faceSpot(key, STEP.HIDDEN, face, p, placed));
        taken[face.item] = 1;
        break;
      }
    }
    if (finalists.length >= FINALISTS) {
      break;
    }
  }

  let spot;
  if (finalists.length) {
    const rnd = seededRandom(hashString(`stf:${doc && doc.id ? doc.id : ''}`));
    spot = finalists[Math.floor(rnd.next() * finalists.length)];
  } else {
    /* 'away': the farthest face turned away from the pads' lowest eye,
     * with rules 1 to 3. The faces are in score order, so of two as far,
     * the better scored. */
    const e = eyes[0];
    let best = null;
    for (const face of faces) {
      const p = face.first;
      if (!p || face.sg * (p[face.a] - e[face.a]) <= 0) {
        continue;
      }
      const dx = p[0] - spawn.x;
      const dy = p[1] - spawn.y;
      const dz = p[2] - spawn.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (!best || d2 > best.d2) {
        best = { face, p, d2 };
      }
    }
    spot = best ? faceSpot(key, STEP.AWAY, best.face, best.p, placed) : groundSpot(key, S, G, placed);
  }
  return { spot, finalists, stats };
}

/*
 * Where the STF mark goes on a placed built map.
 *
 *   placed  placeDocument(doc) from ./place.js
 *   doc     the normalized document it was placed from; its id seeds the pick
 *   source  chooseDocument's source in ./index.js; 'starter' keys the stamp
 *           'built:starter', anything else 'built:' + doc.id
 *
 * Returns, in the placed world's frame (Three.js metres, y up):
 *
 *   { key, step, kind, inside, p, n, up, right, w, h, elementId, type,
 *     part, score }
 *
 *   key        the stamp's key, see stfKey
 *   step       which step of rule 7 found it: 'hidden', 'away' or 'ground'
 *   kind       'underside', 'back', 'side', 'top', or 'ground'
 *   inside     deep inside its own asset and under its own roof or deck
 *   p          [x, y, z], the middle of the painted face: on the face, so
 *              whatever draws it lifts it off by its own offset
 *   n          [nx, ny, nz], the face's outward unit normal
 *   up         [ux, uy, uz], the mark's up, a unit vector in the face
 *   right      up x n, the way the lettering reads, seen from the front
 *   w, h       the mark's size in metres, along right and along up
 *   elementId  the element it is painted on, and its type and the solid
 *   type, part   part's name; null on the ground
 *   score      its rule 5 score; null on the ground
 *
 * Nothing it returns is meant for a player to read: the kind, the element
 * and the part are for the checks.
 */
export function chooseStfSpot(placed, doc, source) {
  return stfSearch(placed, doc, source).spot;
}
