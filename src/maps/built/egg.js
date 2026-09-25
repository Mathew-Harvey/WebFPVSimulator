/*
 * egg.js: where the STF mark is painted on a built freestyle map. Pure: no
 * Three.js, no DOM, no clock, no random stream, and no JS trigonometry.
 *
 * WHAT IT IS FOR. Every freestyle map carries the STF mark, the town and
 * every map somebody built (FREESTYLE-MAPS-PLAN.md section 9). It used to be
 * hidden from the pads, and the owner could not find it: "the logo of
 * SubTwoFIfty is too hard to find, make it easy to see on any map"
 * (2026-09-25, section 12, decision 10). So it is painted where the pilot
 * sees it from the pads: big, on a wall turned to them, in the first frame
 * when the map has such a wall. The SIM still chooses the spot, not the
 * author, and the builder still never shows it (decision 3's second half).
 * This file is that choice. It reads the map exactly as ./place.js placed
 * it, the solids the physics holds and the parts the kit draws, and answers
 * with one face and where on it the mark goes. It draws nothing and makes
 * nothing solid: the mark is paint, and no solid, no placement and no
 * physics number is changed by it.
 *
 * THE RULES, in the order they are applied. The egg block of
 * scripts/props-check.js asserts each one, on the starter, on one of
 * everything, on fifty random maps and on maps built to reach the fallback.
 *
 *   1. PAINT GOES ON A WALL: an upright face of a solid box the kit draws as
 *      that box, and not glass. A capsule is round, a roof is seen from the
 *      pads at a slant too flat to read, and a box the kit does not draw (a
 *      car's body, a rubble pile's envelope, a scaffold's net) is not where
 *      paint would be seen. The mark is up to MARK_W by MARK_H, the logo's
 *      two to one, shrunk on a smaller face to no less than MARK_MIN_SCALE
 *      of that, and it lies inside its face, EDGE_INSET in from every edge,
 *      so it never overhangs one, and EDGE_INSET over GROUND_CLEAR at the
 *      lowest, so a wall standing on the paving takes the biggest mark that
 *      keeps rule 2.
 *   2. OPEN AIR IN FRONT: the mark's rectangle pushed AIR out along the
 *      face's normal is clear of every solid, is GROUND_CLEAR over the
 *      paving and is inside the plot. Room to be seen from, and to fly up
 *      to it.
 *   3. NEVER IN A SOLID: the point LINE_OFF in front of the mark's middle is
 *      in no solid. Rule 2 already means it. It is asked on its own because a
 *      mark inside a wall is the one failure a pilot could never explain.
 *   4. SEEN FROM THE PADS: no line from an eye over the spawn (EYE_HEIGHTS
 *      over the seat, a craft on its pads to one climbing out) to the mark
 *      passes through a solid that hides what is behind it. The lines go to
 *      the mark's middle, its four corners and the middles of its four
 *      edges, SAMPLE_INSET in, and end LINE_OFF in front of the face. What
 *      hides is opaque: a box, but not glass, a net, a railing, a
 *      balustrade of bars, a skylight or foliage, and a capsule only when it
 *      is OPAQUE_R thick (a tank, a stack, a cab). A pole or a lattice
 *      member in front of a mark crosses it and hides nothing.
 *   5. TURNED TO THE PADS AND IN REACH: the wall's outward normal, at the
 *      middle of the band its mark can take, within 60 degrees of pointing
 *      at the eye 2 m over the pads (FACE_COS), so the lettering is read
 *      and not foreshortened to a stripe, and the mark's middle between
 *      NEAR_MIN and NEAR_MAX from the spawn across the ground: far enough
 *      that finding it is a flight and never happens on the pads, near
 *      enough to read and inside every tier's fog.
 *   6. THE PICK: the walls in the order of how easily the pilot sees them
 *      from the pads, which is how big the mark looks from there (its width,
 *      times how square the wall stands to them, over its distance: near
 *      enough the angle it spans) times how little the pilot has to turn to
 *      see it (2 plus the cosine across the ground between the pads' heading
 *      and the way to the mark: 3 straight ahead, 2 abeam, 1 behind), both
 *      taken at that same middle of the band. So a wall in the first frame
 *      wins unless one to the side looks half as big again, and one behind
 *      the pads is still a mural a pilot sees with one turn. Ties go to the
 *      element's place in the document and then the face's own index, which
 *      is a total order, so every engine's sort gives the same list. Each
 *      wall is tried at up to 49 places, middle first and then higher
 *      before lower, and the first wall with a place that keeps rules 2 to
 *      5 is the spot. The same map gives the same spot every time it is
 *      flown, whatever its id: the spot is a property of the layout.
 *   7. ALWAYS A SPOT, in named steps (STEP). 'seen' is rules 1 to 6.
 *      'ground', when no wall keeps them (an empty plot, a map of trees,
 *      every wall turned away or out of reach): flat on the paving ahead of
 *      the pads and GROUND_SCALE the size of a wall's, square to the plot and
 *      reading away from them, at the first of GROUND_AHEAD whose air is
 *      clear, or the first anyway, because every map carries the mark. A
 *      craft on its pads cannot see paint on the paving, so this is the one
 *      step that is seen once the pilot is in the air, and it is there only
 *      for a map that has no wall to put the mark on.
 *
 * THE FRAME is the placed world's: Three.js metres, y up, origin at the
 * plot's middle (./place.js). A box is only ever turned by a quarter
 * (src/props/solids.js), so every wall is axis aligned and a wall mark's
 * normal, up and right are unit axis vectors, and every test below is exact
 * box arithmetic: comparisons, + - * / and the square root, which JavaScript
 * specifies to the bit. The pads' heading is the one angle, and it is turned
 * into a direction by src/props/trig.js, the project's own sine, which gives
 * the same bits in every engine. The same map gives the same spot in Node
 * and in every browser.
 *
 * WHERE IT RUNS. Once, when a built map is built. It reads the whole map, so
 * it is fast rather than clever: the solids are filed on a grid of the plot,
 * a sight line walks only the cells it crosses, a wall out of reach or
 * turned away is dropped before any line is walked, and the walk over the
 * walls stops at the first that keeps the rules. scripts/props-check.js
 * times it.
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

import { sincos } from '../../props/trig.js';

/* ------------------------------------------------------------------ */
/* The numbers                                                         */
/* ------------------------------------------------------------------ */

/* The mark, in metres: the logo is two to one. Six metres is a mural, 11
 * degrees across from 30 m, which is three letters a pilot reads in the
 * first frame. A wall too small for the whole of it takes it smaller, down
 * to MARK_MIN_SCALE of it and no less: 1.8 m, the size the hidden mark was,
 * which is still three letters from 15 m. */
export const MARK_W = 6;
export const MARK_H = 3;
export const MARK_MIN_SCALE = 0.3;
/* How far the mark stays in from every edge of its face. */
export const EDGE_INSET = 0.1;

/* Rule 2's open air, out from the wall, and how far over the paving the
 * whole of it has to be. */
export const AIR = 3;
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
 * Rule 5. FACE_COS: the least share of the distance from the pads' middle
 * eye to the wall's middle that the eye stands out in front of the wall,
 * the cosine of 60 degrees, so the lettering is never foreshortened to less
 * than half its width. NEAR_MIN and NEAR_MAX, across the ground from the
 * spawn: NEAR_MIN is past the find range of the biggest mark (13.3 m for a
 * 6 m mark, findRange in src/game/egg.js) with room to spare, so the mark
 * is found by flying to it and never on the pads; NEAR_MAX is short of
 * where the built map's fog begins to take anything (40 m on Low, a
 * smoothstep that has taken almost nothing at 60), and a 6 m mark there is
 * still 5.7 degrees across.
 */
export const FACE_COS = 0.5;
export const NEAR_MIN = 15;
export const NEAR_MAX = 60;

/*
 * Rule 6 reports, and the checks read, whether a wall mark is in the first
 * frame: within 35 degrees of the pads' heading across the ground, the
 * cosine written out because a cosine is all the test needs and the file
 * takes no angles. The narrowest field of view Settings offers is 75
 * degrees top to bottom (src/render/lens.js), which is wider than 75 across
 * on any screen wider than it is tall, so a mark within 35 degrees of the
 * nose is in the picture on the pads at every setting. It orders nothing:
 * the pick weighs the turn continuously (TURN).
 */
export const FRAME_COS = 0.8191520442889918;
/* Rule 6's weight for the turn: TURN plus the cosine, 3 straight ahead of
 * the pads, 2 abeam, 1 straight behind. */
export const TURN = 2;

/* Rule 7's steps, by name. */
export const STEP = Object.freeze({ SEEN: 'seen', GROUND: 'ground' });

/* The ground fallback: how much bigger than a wall's full mark it is, 12 by
 * 6 m, because paint on the paving is only ever seen from above at a slant,
 * a floor graphic is read from the air the way a helipad's letter is, and
 * there is nothing on a plot with no walls for it to crowd; the places
 * ahead of the pads its middle is tried at, in metres across the ground, in
 * order, then the plot's middle; and how far it stays in from the plot's
 * edge. 12 m first: a craft that has climbed to 5 m sees it from 18 to 29
 * degrees below the horizon and 53 degrees across, and a craft on its pads,
 * a few centimetres over the paving, does not find it (FIND_FRONT in
 * src/game/egg.js). */
export const GROUND_SCALE = 2;
export const GROUND_AHEAD = Object.freeze([12, 8, 18]);
const GROUND_INSET = 1;

/* Where on a face the mark is tried: a grid of up to 7 by 7 places, about
 * POS_STEP apart, spread to the face's edges, middle first. A big wall has
 * a column, a tank or a parked car in front of some of it and clear air in
 * front of the rest, and the middle alone would lose the wall. */
const POS_STEP = 1.5;
const POS_HALF = 3;

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
 * starter at boot, keys the same way from the seat alone (stampKeyForMap in
 * src/share/stamps.js), as clipKeyForMap in src/share/orbitcache.js already
 * does for the orbit clip. A pilot who
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
      /* Drawn, and not glass: paint on a skylight would float on the sky. */
      if (p.t === 'box' && p.draw && S.ok[k] && S.opaque[k]) {
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

/*
 * THE SLAB METHOD, a segment against a box: the stretch of the segment's
 * parameter, 0 at its start and 1 at its end, between each pair of the
 * box's planes, intersected. The stretch lives in SPAN while one test runs,
 * so a test allocates nothing, and a sight line is tested against every
 * solid in every cell it crosses.
 */
const SPAN = { t0: 0, t1: 1 };

/* Narrow SPAN to where a + d t is strictly between lo and hi. False when
 * nothing is left. */
function slabOpen(a, d, lo, hi) {
  if (!(lo < hi)) {
    return false;
  }
  if (d === 0) {
    return a > lo && a < hi;
  }
  let u0 = (lo - a) / d;
  let u1 = (hi - a) / d;
  if (u0 > u1) {
    const t = u0;
    u0 = u1;
    u1 = t;
  }
  if (u0 > SPAN.t0) {
    SPAN.t0 = u0;
  }
  if (u1 < SPAN.t1) {
    SPAN.t1 = u1;
  }
  return SPAN.t0 < SPAN.t1;
}

/* The same with the planes included: a touch counts. */
function slabClosed(a, d, lo, hi) {
  if (d === 0) {
    return a >= lo && a <= hi;
  }
  let u0 = (lo - a) / d;
  let u1 = (hi - a) / d;
  if (u0 > u1) {
    const t = u0;
    u0 = u1;
    u1 = t;
  }
  if (u0 > SPAN.t0) {
    SPAN.t0 = u0;
  }
  if (u1 < SPAN.t1) {
    SPAN.t1 = u1;
  }
  return SPAN.t0 <= SPAN.t1;
}

/* Does the segment a to b pass through the box shrunk by `shrink` on every
 * side, over a stretch longer than none? */
function segHitsBox(ax, ay, az, bx, by, bz, x0, y0, z0, x1, y1, z1, shrink) {
  SPAN.t0 = 0;
  SPAN.t1 = 1;
  return slabOpen(ax, bx - ax, x0 + shrink, x1 - shrink)
    && slabOpen(ay, by - ay, y0 + shrink, y1 - shrink)
    && slabOpen(az, bz - az, z0 + shrink, z1 - shrink);
}

/* How far a coordinate is outside lo..hi, 0 inside. */
function outside(v, lo, hi) {
  return v < lo ? lo - v : (v > hi ? v - hi : 0);
}

/*
 * The squared distance from the segment a + t (b - a), t from 0 to 1, to
 * the box lo..hi, exactly. Along each axis the distance outside the box is
 * linear in t between the places the segment crosses the box's two planes,
 * so between consecutive crossings the squared distance is one quadratic,
 * and its least value on each piece is at the quadratic's vertex or at an
 * end of the piece. Rule 2 asks it of a capsule's axis, so a capsule that
 * does not touch the air in front of a mark is never counted as in it.
 */
const KINKS = new Float64Array(8);
const SEG_A = new Float64Array(3);
const SEG_D = new Float64Array(3);

/* Add the place where a + d t crosses `plane` to KINKS, when it is inside
 * the segment. Returns the new count. */
function addKink(n, a, d, plane) {
  const t = (plane - a) / d;
  if (t > 0 && t < 1) {
    KINKS[n] = t;
    return n + 1;
  }
  return n;
}

function segBoxDist2(ax, ay, az, bx, by, bz, lo, hi) {
  const A = SEG_A;
  const Dd = SEG_D;
  A[0] = ax;
  A[1] = ay;
  A[2] = az;
  Dd[0] = bx - ax;
  Dd[1] = by - ay;
  Dd[2] = bz - az;
  let n = 0;
  KINKS[n] = 0;
  n += 1;
  KINKS[n] = 1;
  n += 1;
  for (let k = 0; k < 3; k += 1) {
    if (Dd[k] !== 0) {
      n = addKink(n, A[k], Dd[k], lo[k]);
      n = addKink(n, A[k], Dd[k], hi[k]);
    }
  }
  /* At most eight, so an insertion sort. */
  for (let i = 1; i < n; i += 1) {
    const v = KINKS[i];
    let j = i - 1;
    while (j >= 0 && KINKS[j] > v) {
      KINKS[j + 1] = KINKS[j];
      j -= 1;
    }
    KINKS[j + 1] = v;
  }
  let best = Infinity;
  for (let s = 0; s + 1 < n; s += 1) {
    const t0 = KINKS[s];
    const t1 = KINKS[s + 1];
    const tm = (t0 + t1) / 2;
    /* Which planes the segment is outside on this piece, and the vertex. */
    let num = 0;
    let den = 0;
    for (let k = 0; k < 3; k += 1) {
      const v = A[k] + Dd[k] * tm;
      if (v < lo[k]) {
        num += Dd[k] * (lo[k] - A[k]);
        den += Dd[k] * Dd[k];
      } else if (v > hi[k]) {
        num += Dd[k] * (hi[k] - A[k]);
        den += Dd[k] * Dd[k];
      }
    }
    let t = den > 0 ? num / den : t0;
    t = t < t0 ? t0 : (t > t1 ? t1 : t);
    const ex = outside(A[0] + Dd[0] * t, lo[0], hi[0]);
    const ey = outside(A[1] + Dd[1] * t, lo[1], hi[1]);
    const ez = outside(A[2] + Dd[2] * t, lo[2], hi[2]);
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 < best) {
      best = d2;
    }
  }
  return best;
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

/* Squared distance between two segments, the sight line p to q and the
 * capsule axis at g[o] to g[o + 5] (Ericson, Real-Time Collision
 * Detection, 5.1.9, the routine scripts/props-check.js uses for its own
 * clearances). */
function segSegDist2(p, q, g, o) {
  const d1x = q[0] - p[0];
  const d1y = q[1] - p[1];
  const d1z = q[2] - p[2];
  const d2x = g[o + 3] - g[o];
  const d2y = g[o + 4] - g[o + 1];
  const d2z = g[o + 5] - g[o + 2];
  const rx = p[0] - g[o];
  const ry = p[1] - g[o + 1];
  const rz = p[2] - g[o + 2];
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
        const r = g[o + 6] - EPS;
        if (segBoxDist2(g[o], g[o + 1], g[o + 2], g[o + 3], g[o + 4], g[o + 5], lo, hi) < r * r) {
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
  return segSegDist2(a, b, g, o) < r * r;
}

/* Does anything filed in cell c hide the line a to b? Each solid is asked
 * once per line (query q), and only when the line's height reaches it. */
function cellHides(S, G, c, q, a, b, ylo, yhi) {
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
}

function inGrid(G, cx, cz) {
  return cx >= 0 && cx < G.nx && cz >= 0 && cz < G.nz;
}

/*
 * Rule 4 for one line: is the straight line from a (at the mark) to b (an
 * eye) hidden by a solid? It walks the grid cells the line's plan crosses
 * (Amanatides and Woo), from the mark outwards, and stops at the first
 * solid that hides the line. Through a corner it asks the two cells either
 * side as well, so a blocker filed only there is not skipped, which would
 * call a hidden mark seen.
 */
function lineHidden(S, G, a, b) {
  const q = nextQuery(G);
  const ylo = a[1] < b[1] ? a[1] : b[1];
  const yhi = a[1] > b[1] ? a[1] : b[1];
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  /* Only the stretch of the line over the grid: the plot. */
  SPAN.t0 = 0;
  SPAN.t1 = 1;
  if (!slabClosed(a[0], dx, G.ox, G.ox + G.nx * G.cell) || !slabClosed(a[2], dz, G.oz, G.oz + G.nz * G.cell)) {
    return false;
  }
  const t1 = SPAN.t1;
  let cx = cellOf(G.ox, G.cell, G.nx, a[0] + dx * SPAN.t0);
  let cz = cellOf(G.oz, G.cell, G.nz, a[2] + dz * SPAN.t0);
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
  for (;;) {
    if (cellHides(S, G, cx * G.nz + cz, q, a, b, ylo, yhi)) {
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
      if (inGrid(G, cx + stepX, cz) && cellHides(S, G, (cx + stepX) * G.nz + cz, q, a, b, ylo, yhi)) {
        return true;
      }
      if (inGrid(G, cx, cz + stepZ) && cellHides(S, G, cx * G.nz + cz + stepZ, q, a, b, ylo, yhi)) {
        return true;
      }
      cx += stepX;
      cz += stepZ;
      tMaxX += tDX;
      tMaxZ += tDZ;
    }
    if (!inGrid(G, cx, cz)) {
      return false;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Walls                                                               */
/* ------------------------------------------------------------------ */

/* Face f of a box: its axis a (0 x, 1 y, 2 z) is f >> 1 and its outward
 * normal points to the minus side for an even f and the plus side for an
 * odd one. So 0 and 1 face -x and +x, 2 is the underside, 3 the top, and 4
 * and 5 face -z and +z. The walls are 0, 1, 4 and 5. */
const WALLS = [0, 1, 4, 5];

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
 * nearest the middle first, then the higher along the mark's up (clear of
 * whatever stands at the foot of a wall) and then the lower along its
 * width, so the order is total and the same on every engine. */
const ORDER = [];
for (let kv = -POS_HALF; kv <= POS_HALF; kv += 1) {
  for (let ku = -POS_HALF; ku <= POS_HALF; ku += 1) {
    ORDER.push([ku, kv]);
  }
}
ORDER.sort((p, q) => (p[0] * p[0] + p[1] * p[1]) - (q[0] * q[0] + q[1] * q[1]) || q[1] - p[1] || p[0] - q[0]);

/* The pads: the spawn's seat, the eyes over it, and its heading as a unit
 * direction across the ground. The shell faces a craft at `yaw` by turning
 * its forward, -z, about +y, which is (-sin yaw, 0, -cos yaw); 0 - v, so a
 * zero comes out as +0 and never -0. */
function padsOf(placed) {
  const spawn = placed.spawn;
  const sc = sincos(spawn.yaw);
  return {
    x: spawn.x,
    z: spawn.z,
    eyes: EYE_HEIGHTS.map((h) => [spawn.x, spawn.y + h, spawn.z]),
    /* The middle eye, which rule 5 measures the wall's turn from. */
    eye: [spawn.x, spawn.y + EYE_HEIGHTS[1], spawn.z],
    fx: 0 - sc.s,
    fz: 0 - sc.c,
  };
}

/* How far a point is from the pads across the ground, and the cosine of the
 * angle between the pads' heading and the way to it; -1 at the pads. */
function reach(pads, x, z) {
  const gx = x - pads.x;
  const gz = z - pads.z;
  const ground = Math.sqrt(gx * gx + gz * gz);
  return { ground, cos: ground > 0 ? (pads.fx * gx + pads.fz * gz) / ground : -1 };
}

/*
 * One wall of box i as a candidate, or null when no mark can go on it or it
 * cannot be seen as the rules ask: turned away from the pads, or out of
 * reach wherever the mark goes on it. Its score is taken at its middle
 * place, so it does not depend on where on the wall the mark ends up.
 *
 * THE BAND a mark can take on it: EDGE_INSET in from every edge, and never
 * lower than EDGE_INSET over GROUND_CLEAR, so a wall that stands on the
 * paving takes the biggest mark that clears rule 2 rather than the biggest
 * that fits its face and then none at all. A single container's side, 2.59
 * m from the paving, takes a 4.2 m mark.
 */
function makeFace(S, i, f, pads) {
  const a = f >> 1;
  const sg = f & 1 ? 1 : -1;
  const o = i * 7;
  const lo = [S.g[o], S.g[o + 1], S.g[o + 2]];
  const hi = [S.g[o + 3], S.g[o + 4], S.g[o + 5]];
  const plane = sg > 0 ? hi[a] : lo[a];
  const ra = 2 - a;
  const floor = lo[1] + EDGE_INSET > GROUND_CLEAR + EDGE_INSET ? lo[1] + EDGE_INSET : GROUND_CLEAR + EDGE_INSET;
  const band = hi[1] - EDGE_INSET - floor;
  const s = fitScale(hi[ra] - lo[ra], band + 2 * EDGE_INSET);
  if (!s) {
    return null;
  }
  const w = MARK_W * s;
  const h = MARK_H * s;
  const c = [0, 0, 0];
  c[a] = plane;
  c[ra] = (lo[ra] + hi[ra]) / 2;
  c[1] = floor + band / 2;
  /* Rule 5's turn: n . (eye - c) >= FACE_COS |eye - c|, n being sg e_a. */
  const ex = pads.eye[0] - c[0];
  const ey = pads.eye[1] - c[1];
  const ez = pads.eye[2] - c[2];
  const dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
  const toward = sg * (a === 0 ? ex : ez);
  if (!(dist > 0) || !(toward >= FACE_COS * dist)) {
    return null;
  }
  const at = reach(pads, c[0], c[2]);
  const Ru = (hi[ra] - lo[ra]) / 2 - EDGE_INSET - w / 2;
  const Rv = band / 2 - h / 2;
  const R = Ru > 0 ? Ru : 0;
  /* Rule 5's reach cannot hold anywhere on a wall whose nearest and
   * farthest places are both out of it. */
  if (at.ground + R < NEAR_MIN || at.ground - R > NEAR_MAX) {
    return null;
  }
  return {
    i, f, a, sg, plane, ra, s, w, h,
    rs: sg * crossSign(1, a),
    item: S.item[i],
    order: S.local[i] * 6 + f,
    frame: at.cos >= FRAME_COS,
    /* How big it looks from the pads: its width, times how square it
     * stands to them, over its distance. Near enough an angle, in radians. */
    looks: (w * toward) / (dist * dist),
    /* And how easily it is seen: that, weighed by the turn (rule 6). */
    score: ((w * toward) / (dist * dist)) * (TURN + at.cos),
    cr: c[ra],
    cu: c[1],
    Ru: R,
    Rv: Rv > 0 ? Rv : 0,
  };
}

/* Highest score first, then the element's place in the document, then the
 * face's own index in its element: a total order, so the sort is the same
 * on every engine. */
function byView(p, q) {
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
  p[1] = face.cu + (Kv ? (face.Rv * kv) / Kv : 0);
  return p;
}

/* Rules 2 and 3 for a mark with its middle at p. */
function airClear(S, G, face, p, W, D) {
  const lo = [0, 0, 0];
  const hi = [0, 0, 0];
  lo[face.a] = face.sg > 0 ? face.plane : face.plane - AIR;
  hi[face.a] = face.sg > 0 ? face.plane + AIR : face.plane;
  lo[face.ra] = p[face.ra] - face.w / 2;
  hi[face.ra] = p[face.ra] + face.w / 2;
  lo[1] = p[1] - face.h / 2;
  hi[1] = p[1] + face.h / 2;
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
 * middle first, from the lowest eye, because a mark that is hidden at all
 * is most often hidden low, by whatever stands between it and the pads, and
 * a line that is hidden ends the question. */
const SAMPLES = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]];
function seenFrom(S, G, face, p, eyes, stats) {
  const hu = face.w / 2 - SAMPLE_INSET;
  const hv = face.h / 2 - SAMPLE_INSET;
  const t = [0, 0, 0];
  for (const [su, sv] of SAMPLES) {
    t[face.a] = face.plane + face.sg * LINE_OFF;
    t[face.ra] = p[face.ra] + su * hu;
    t[1] = p[1] + sv * hv;
    for (let e = 0; e < eyes.length; e += 1) {
      stats.lines += 1;
      if (lineHidden(S, G, t, eyes[e])) {
        return false;
      }
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* The choice                                                          */
/* ------------------------------------------------------------------ */

function faceSpot(key, face, p, placed) {
  const it = placed.items[face.item];
  return {
    key,
    step: STEP.SEEN,
    kind: 'wall',
    frame: face.frame,
    p: [p[0], p[1], p[2]],
    n: axisVec(face.a, face.sg),
    up: [0, 1, 0],
    right: axisVec(face.ra, face.rs),
    w: face.w,
    h: face.h,
    elementId: it && it.el ? it.el.id : null,
    type: it && it.el ? it.el.type : null,
    part: placed.solids[face.i].name,
    looks: face.looks,
    score: face.score,
  };
}

/*
 * The last step: flat on the paving ahead of the pads, reading away from
 * them, so a craft that lifts off and pitches forward reads it the right way
 * up. Its up is the plan axis most in line with the pads' heading, away
 * from them, so it reads within 45 degrees of straight and lies square to
 * the plot, which is what lets its air be tested exactly. Its middle is
 * tried GROUND_AHEAD ahead of the pads along their heading and then at the
 * plot's middle, each moved in far enough to lie inside the plot
 * GROUND_INSET from its edge, and the first with AIR clear over the whole
 * mark is the spot. With none clear, the first anyway, because every map
 * carries the mark. A plot too small for the whole mark takes it smaller,
 * down to the smallest wall mark.
 */
function groundSpot(key, S, G, placed, pads) {
  const W = placed.W;
  const D = placed.D;
  const alongX = (pads.fx < 0 ? -pads.fx : pads.fx) >= (pads.fz < 0 ? -pads.fz : pads.fz);
  const up = alongX ? [pads.fx < 0 ? -1 : 1, 0, 0] : [0, 0, pads.fz < 0 ? -1 : 1];
  /* up x n with n straight up is (-up.z, 0, up.x); 0 - 0 is +0, so no
   * component comes out as a negative zero. */
  const right = [0 - up[2], 0, up[0] + 0];
  /* The scale the plot has room for: the mark's width lies across the
   * heading's axis and its height along it. */
  const full = GROUND_SCALE;
  const spanX = (alongX ? MARK_H : MARK_W) * full;
  const spanZ = (alongX ? MARK_W : MARK_H) * full;
  let s = 1;
  const roomX = (W - 2 * GROUND_INSET) / spanX;
  const roomZ = (D - 2 * GROUND_INSET) / spanZ;
  if (roomX < s) {
    s = roomX;
  }
  if (roomZ < s) {
    s = roomZ;
  }
  if (!(s >= MARK_MIN_SCALE / full)) {
    s = MARK_MIN_SCALE / full;
  }
  const w = MARK_W * full * s;
  const h = MARK_H * full * s;
  const hx = (alongX ? h : w) / 2;
  const hz = (alongX ? w : h) / 2;
  const inside = (v, half, size) => {
    const lim = size / 2 - GROUND_INSET - half;
    if (!(lim > 0)) {
      return 0;
    }
    return v < -lim ? -lim : (v > lim ? lim : v);
  };
  const tries = GROUND_AHEAD.map((d) => [pads.x + pads.fx * d, pads.z + pads.fz * d]);
  tries.push([0, 0]);
  let pick = null;
  for (const [tx, tz] of tries) {
    const x = inside(tx, hx, W);
    const z = inside(tz, hz, D);
    const clear = prismClear(S, G, [x - hx, 0, z - hz], [x + hx, AIR, z + hz]);
    if (clear || !pick) {
      pick = { x, z, clear };
    }
    if (clear) {
      break;
    }
  }
  return {
    key,
    step: STEP.GROUND,
    kind: 'ground',
    frame: false,
    p: [pick.x, 0, pick.z],
    n: [0, 1, 0],
    up,
    right,
    w,
    h,
    elementId: null,
    type: null,
    part: null,
    looks: null,
    score: null,
    clear: pick.clear,
  };
}

/*
 * The whole search, with what it found on the way, for scripts/props-check.js.
 * `source` is chooseDocument's ('injected', 'canvas' or 'starter'); it
 * changes the key and nothing else.
 *
 * Returns { spot, faces, stats }: faces are the walls rule 1 and rule 5's
 * turn and reach let through, in the order they were tried in, as
 * { elementId, part, f, frame, looks, score }, and stats counts the walls,
 * the places tried and the sight lines walked.
 */
export function stfSearch(placed, doc, source) {
  const key = stfKey(doc, source);
  const W = placed.W;
  const D = placed.D;
  const S = readSolids(placed);
  const G = buildGrid(S, W, D);
  const pads = padsOf(placed);
  const stats = { faces: 0, tried: 0, lines: 0 };

  const faces = [];
  for (let i = 0; i < S.n; i += 1) {
    if (!S.paint[i]) {
      continue;
    }
    for (const f of WALLS) {
      const face = makeFace(S, i, f, pads);
      if (face) {
        faces.push(face);
      }
    }
  }
  faces.sort(byView);
  stats.faces = faces.length;

  let spot = null;
  for (const face of faces) {
    const Ku = stepsFor(face.Ru);
    const Kv = stepsFor(face.Rv);
    for (const [ku, kv] of ORDER) {
      if (ku < -Ku || ku > Ku || kv < -Kv || kv > Kv) {
        continue;
      }
      stats.tried += 1;
      const p = placeAt(face, ku, kv, Ku, Kv);
      const at = reach(pads, p[0], p[2]);
      if (!(at.ground >= NEAR_MIN && at.ground <= NEAR_MAX)) {
        continue;
      }
      if (!airClear(S, G, face, p, W, D)) {
        continue;
      }
      if (seenFrom(S, G, face, p, pads.eyes, stats)) {
        spot = faceSpot(key, face, p, placed);
        break;
      }
    }
    if (spot) {
      break;
    }
  }
  if (!spot) {
    spot = groundSpot(key, S, G, placed, pads);
  }
  const it = placed.items;
  return {
    spot,
    faces: faces.map((face) => ({
      elementId: it[face.item] && it[face.item].el ? it[face.item].el.id : null,
      part: placed.solids[face.i].name,
      f: face.f,
      frame: face.frame,
      looks: face.looks,
      score: face.score,
    })),
    stats,
  };
}

/*
 * Where the STF mark goes on a placed built map.
 *
 *   placed  placeDocument(doc) from ./place.js
 *   doc     the normalized document it was placed from
 *   source  chooseDocument's source in ./index.js; 'starter' keys the stamp
 *           'built:starter', anything else 'built:' + doc.id
 *
 * Returns, in the placed world's frame (Three.js metres, y up):
 *
 *   { key, step, kind, frame, p, n, up, right, w, h, elementId, type,
 *     part, looks, score }
 *
 *   key        the stamp's key, see stfKey
 *   step       which step of rule 7 found it: 'seen' or 'ground'
 *   kind       'wall' or 'ground'
 *   frame      on a wall in the pads' first frame (FRAME_COS); false
 *              otherwise
 *   p          [x, y, z], the middle of the painted face: on the face, so
 *              whatever draws it lifts it off by its own offset
 *   n          [nx, ny, nz], the face's outward unit normal
 *   up         [ux, uy, uz], the mark's up, a unit vector in the face:
 *              world up on a wall, the pads' heading on the ground
 *   right      up x n, the way the lettering reads, seen from the front
 *   w, h       the mark's size in metres, along right and along up
 *   elementId  the id of the element it is painted on; null on the ground
 *   type       that element's type; null on the ground
 *   part       the name of the solid it is painted on; null on the ground
 *   looks      how big it looks from the pads (rule 6); null on the ground
 *   score      rule 6's score, looks weighed by the turn; null on the ground
 *   clear      on the ground only: whether the air over it was clear
 *
 * Nothing it returns is meant for a player to read: the kind, the element
 * and the part are for the checks.
 */
export function chooseStfSpot(placed, doc, source) {
  return stfSearch(placed, doc, source).spot;
}
