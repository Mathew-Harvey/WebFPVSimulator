/*
 * aperture.js: what an opening is when it is not a rectangle. Pure arithmetic,
 * no Three.js.
 *
 * A gate's hole is a rectangle, and everything that has ever been said about a
 * pass says so: the swept box in src/game/race.js clips a segment against a
 * half width and a half height. A hoop is round and a hex gate is six sided,
 * and the corner of the square that holds a hoop is not in the hoop: a line
 * through it goes past the ring, not through it, and must not score.
 *
 * SO A SHAPE IS INSCRIBED IN THE RECTANGLE. clearW and clearH stay what they
 * always were for every piece, the size of the box the opening fits in, so the
 * envelope, the rules, the build sheet and the cards all read a hoop the way
 * they read a gate. The shape is what is left of the box:
 *
 *   square   all of it
 *   circle   the ellipse that touches all four sides (a circle where the two
 *            sizes are equal, which is what a hoop is)
 *   hex      the hexagon with a point at each end of the width and a flat at
 *            the top and the bottom: vertices at (+-w/2, 0) and (+-w/4, +-h/2).
 *            It is regular when h is the width times the square root of three
 *            over two, which is what a hex gate is.
 *
 * ONE DEFINITION, THREE READERS. The pass test clips a segment against it, the
 * scene builds the frame's capsules on its outline, and the builder draws the
 * ring on the same points, so a hoop is drawn where it scores and is solid where
 * it is drawn. Every point on a circle is taken with ./trig.js, which is the
 * same bits in every engine, because the capsules made from it reach the
 * physics.
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

import { sincos } from './trig.js';

export const APERTURE_SHAPES = ['square', 'circle', 'hex', 'letter'];

/* How many straight pieces a round frame is made of. A hoop in a room is 2.4 m across as built
 * and the pilot flies close to it, so sixteen straight tubes read as a polygon and twenty four
 * (a corner every fifteen degrees) read as a ring, and a capsule for each is cheap. A multiple
 * of four, so the ring has a corner at the top, the bottom and both ends of its width. */
export const CIRCLE_SEGMENTS = 24;

/* The height of a regular hexagon over its width: a point at each end of the width and a flat at the
 * top and bottom, so the width is twice a side and the height is a side times the square root of
 * three. Square root is correctly rounded everywhere, which is why it can be written here. */
export const HEX_HEIGHT_RATIO = Math.sqrt(3) / 2;

/* Any word that is not a shape this knows is a square, which is what every opening was. A letter is not
 * inscribed in a box at all: its holes are polygons of their own (src/props/letters.js), so the word says
 * only that this is one, and what is in it is for the letter to say. */
export function shapeOf(word) {
  return word === 'circle' || word === 'hex' || word === 'letter' ? word : 'square';
}

const TAU = 2 * Math.PI;
const SC = { s: 0, c: 1 };

/*
 * The corners of the opening's outline, in its own frame (x across, y up from
 * its centre), going round once and not repeating the first. A circle is `n`
 * points, the first at the right hand end of the width.
 */
export function outlineOf(shape, halfW, halfH, n = CIRCLE_SEGMENTS) {
  if (shape === 'circle') {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      sincos((TAU * i) / n, SC);
      out.push([halfW * SC.c, halfH * SC.s]);
    }
    return out;
  }
  if (shape === 'hex') {
    return [
      [halfW, 0], [halfW / 2, halfH], [-halfW / 2, halfH], [-halfW, 0], [-halfW / 2, -halfH], [halfW / 2, -halfH],
    ];
  }
  return [[halfW, halfH], [-halfW, halfH], [-halfW, -halfH], [halfW, -halfH]];
}

/* The shape's own test, in coordinates where the rectangle is the unit square: u is x over
 * the half width and v is y over the half height. */
function insideUnit(shape, u, v) {
  if (shape === 'circle') {
    return u * u + v * v <= 1;
  }
  if (shape === 'hex') {
    return Math.abs(v) <= 1 && 2 * Math.abs(u) + Math.abs(v) <= 2;
  }
  return Math.abs(u) <= 1 && Math.abs(v) <= 1;
}

/* Whether a point of the opening's plane is in the opening. The edge is in. */
export function insideShape(shape, halfW, halfH, x, y) {
  if (!(halfW > 0) || !(halfH > 0)) {
    return false;
  }
  return insideUnit(shape, x / halfW, y / halfH);
}

/*
 * WHERE A STRAIGHT TRAVEL IS INSIDE THE SHAPE. The travel starts at (ax, ay) and moves
 * (dx, dy) as t goes from 0 to 1 (its third dimension is the caller's business), and only
 * t between t0 and t1 is asked about. Returns the part of that range spent inside, as
 * [from, to], or null if none of it is. Exact, not sampled: a circle is a quadratic and a
 * hexagon is four half planes, so a segment shorter than a step cannot slip through.
 *
 * A square is returned as it came, because the caller has already clipped it against the
 * rectangle, which is the same thing.
 */
export function clipToShape(shape, halfW, halfH, ax, ay, dx, dy, t0, t1) {
  if (!(halfW > 0) || !(halfH > 0) || t0 > t1) {
    return null;
  }
  if (shape !== 'circle' && shape !== 'hex') {
    return [t0, t1];
  }
  /* Into the unit square's coordinates, where both shapes are simple. */
  const au = ax / halfW;
  const av = ay / halfH;
  const du = dx / halfW;
  const dv = dy / halfH;
  let lo = t0;
  let hi = t1;
  /* a t + b <= 0 keeps the part of the range on the inside of one boundary. */
  const keep = (a, b) => {
    if (Math.abs(a) < 1e-12) {
      return b <= 0;
    }
    const at = -b / a;
    if (a > 0) {
      if (at < hi) {
        hi = at;
      }
    } else if (at > lo) {
      lo = at;
    }
    return lo <= hi;
  };
  if (shape === 'circle') {
    const A = du * du + dv * dv;
    const B = 2 * (au * du + av * dv);
    const C = au * au + av * av - 1;
    if (A < 1e-24) {
      return C <= 0 ? [lo, hi] : null;
    }
    const D = B * B - 4 * A * C;
    if (D < 0) {
      return null;
    }
    const root = Math.sqrt(D);
    const r0 = (-B - root) / (2 * A);
    const r1 = (-B + root) / (2 * A);
    lo = Math.max(lo, r0);
    hi = Math.min(hi, r1);
    return lo <= hi ? [lo, hi] : null;
  }
  /* The hexagon: |v| <= 1, and |2u| + |v| <= 2 is four half planes, one for each slanted edge. */
  if (!keep(dv, av - 1) || !keep(-dv, -av - 1)) {
    return null;
  }
  for (const su of [-1, 1]) {
    for (const sv of [-1, 1]) {
      if (!keep(2 * su * du + sv * dv, 2 * su * au + sv * av - 2)) {
        return null;
      }
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/*
 * The point where two lines meet, each given as a unit normal n and the distance c of the line
 * from the origin along it (n . x = c). Parallel lines have no such point: the caller keeps
 * away from them, and this hands back the first line's own foot so nothing is ever NaN.
 */
function meet(n1x, n1y, c1, n2x, n2y, c2) {
  const det = n1x * n2y - n1y * n2x;
  if (Math.abs(det) < 1e-12) {
    return [n1x * c1, n1y * c1];
  }
  return [(c1 * n2y - c2 * n1y) / det, (n1x * c2 - n2x * c1) / det];
}

/*
 * A convex polygon (counter clockwise) with every edge pushed `d` further out along its own
 * normal: the corners of the run of tubes that stands round it. Two adjacent offset edges meet
 * where the corner of the offset polygon is, which is further than `d` from the old corner.
 */
function offsetPolygon(poly, d) {
  const n = poly.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p = poly[(i + n - 1) % n];
    const q = poly[i];
    const r = poly[(i + 1) % n];
    /* The outward normals of the two edges that meet at q, for a counter clockwise run. */
    const l1 = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const n1x = (q[1] - p[1]) / l1;
    const n1y = -(q[0] - p[0]) / l1;
    const l2 = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1;
    const n2x = (r[1] - q[1]) / l2;
    const n2y = -(r[0] - q[0]) / l2;
    out.push(meet(n1x, n1y, n1x * q[0] + n1y * q[1] + d, n2x, n2y, n2x * q[0] + n2y * q[1] + d));
  }
  return out;
}

/*
 * THE FRAME OF AN OPENING: the corners of the closed run of straight tubes whose axes stand
 * `tube` (the tube's radius) outside the opening, so the tubes' inner surfaces are the hole
 * and nothing more. The tubes are the edges between one corner and the next, the last back to
 * the first.
 *
 * A square gives the four corners a gate's frame has always had, at half a width plus a tube
 * on each side. A hex is its outline pushed out by the tube.
 *
 * A round frame is CIRCUMSCRIBED: each of its CIRCLE_SEGMENTS straight tubes lies along the
 * tangent of the ellipse at the middle of its step, pushed out by the tube, and a corner is
 * where two neighbours meet. Every tube is therefore at least a tube's radius from the hole,
 * whatever the two sizes are, and no chord of a polygon cuts into the hole the pass scores. A
 * circle's corners are one over the cosine of half a step further out than the ring (0.9
 * percent at twenty four), which is the price of straight tubes and is all on the outside.
 */
export function frameOutline(shape, halfW, halfH, tube, n = CIRCLE_SEGMENTS) {
  if (shape !== 'circle') {
    return offsetPolygon(outlineOf(shape === 'hex' ? 'hex' : 'square', halfW, halfH), tube);
  }
  /* The unit normal and the offset of the tangent line, for the tangent at each half step. */
  const lines = [];
  for (let i = 0; i < n; i += 1) {
    sincos((TAU * (i + 0.5)) / n, SC);
    const nx = SC.c / halfW;
    const ny = SC.s / halfH;
    const len = Math.hypot(nx, ny);
    lines.push([nx / len, ny / len, 1 / len + tube]);
  }
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = lines[(i + n - 1) % n];
    const b = lines[i];
    out.push(meet(a[0], a[1], a[2], b[0], b[1], b[2]));
  }
  return out;
}

/*
 * THE FRAME AS PARTS, in the obstacle's own frame (x across the opening, y up from the base, z
 * through it), which is what the game draws, what it makes solid and what a flight check flies
 * against, so the three cannot disagree. Nothing here knows about Three.js.
 *
 *   ring    the corners of the run of tubes, in the plane of the opening
 *   tubes   the ones that are built, each a pair of corners
 *   joints  the corners a joint is put on
 *   posts   what stands a frame that hangs in the air on the floor, one under each lowest corner
 *   caps    the solids: a capsule for every tube and post, and the stub each post stands on
 *   foot    the size of that stub, the one every micro gate stands on
 *   top     the highest thing, a tube above the highest corner
 *
 * THE FLOOR IS THE SILL. A tube wholly below the floor is not built, as an upright gate builds no
 * bottom member at a sill of zero, so a hoop on the floor is a ring set into it and a hex gate is
 * an open bottomed frame. A frame whose lowest tube is more than two centimetres above the floor
 * hangs in the air and is stood on a post under each of its lowest corners. The opening is tilted
 * about its own middle by `pitch`, which is how a dive gate leans, so the hole stays where the
 * document put it and the corners move.
 *
 * A FLOATING frame (isFloating in src/trackbuilder/elements.js) is the same frame with no post and no
 * stub under it: it hangs where the document put it, and a pilot can fly under it.
 *
 * An unbuilt opening has no frame at all, and still says where its corners would be, because it
 * still scores and still lights.
 */
export function frameParts(shape, halfW, halfH, tubeR, sillH, pitch = 0, unbuilt = false, floating = false) {
  const centreY = sillH + halfH;
  sincos(pitch, SC);
  const cp = SC.c;
  const sp = SC.s;
  const ring = frameOutline(shape, halfW, halfH, tubeR).map(([x, y]) => ({ x, y: centreY + y * cp, z: y * sp }));
  const out = {
    centreY,
    ring,
    tubes: [],
    joints: [],
    posts: [],
    caps: [],
    foot: { w: tubeR * 2, h: tubeR * 1.6, d: tubeR * 4 },
    top: Math.max(...ring.map((p) => p.y)) + tubeR,
  };
  if (unbuilt) {
    return out;
  }
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (Math.max(a.y, b.y) <= 1e-6) {
      continue;
    }
    out.tubes.push([a, b]);
    out.caps.push({ kind: 'gate', ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r: tubeR });
  }
  for (const p of ring) {
    if (!(p.y < -tubeR)) {
      out.joints.push(p);
    }
  }
  const lowest = Math.min(...ring.map((p) => p.y));
  if (!floating && lowest - tubeR > 0.02) {
    for (const p of ring) {
      if (Math.abs(p.y - lowest) > 1e-6) {
        continue;
      }
      out.posts.push({ x: p.x, y: p.y, z: p.z });
      out.caps.push({ kind: 'gate', ax: p.x, ay: 0, az: p.z, bx: p.x, by: p.y, bz: p.z, r: tubeR });
      out.caps.push({
        kind: 'obstacle',
        ax: p.x, ay: out.foot.h * 0.5, az: p.z - out.foot.d * 0.5,
        bx: p.x, by: out.foot.h * 0.5, bz: p.z + out.foot.d * 0.5,
        r: out.foot.w * 0.5,
      });
    }
  }
  return out;
}

/*
 * BARS ALONG A CLOSED RUN OF POINTS, for a renderer that draws a straight length as a box: one for
 * each side, `thickness` across, each lengthened at both ends by half a thickness times the tangent
 * of half the turn there, so a corner is filled to its point and not left as a notch. The run goes
 * counter clockwise. Returns the middle of each bar, its length and its angle about the plane's
 * normal (a bar built along x is turned by it).
 */
export function barsAlong(poly, thickness) {
  const n = poly.length;
  if (n < 3) {
    return [];
  }
  const turn = (i) => {
    const p = poly[(i + n - 1) % n];
    const q = poly[i];
    const r = poly[(i + 1) % n];
    const cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    const dot = (q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1]);
    return Math.atan2(cross, dot);
  };
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    const len = Math.hypot(bx - ax, by - ay);
    if (!(len > 0)) {
      continue;
    }
    const dx = (bx - ax) / len;
    const dy = (by - ay) / len;
    const e0 = thickness * 0.5 * Math.tan(turn(i) * 0.5);
    const e1 = thickness * 0.5 * Math.tan(turn((i + 1) % n) * 0.5);
    /* From e0 before the start to e1 past the end: the middle is half way between. */
    const along = (len + e1 - e0) * 0.5;
    out.push({ x: ax + dx * along, y: ay + dy * along, len: len + e0 + e1, angle: Math.atan2(dy, dx) });
  }
  return out;
}

/*
 * A PANE ACROSS AN OPENING, as data: a fan of triangles from the middle to each corner of the
 * outline of a shape in a box `w` by `h`, with the uv a rectangle's pane has (the box is 0 to 1),
 * so a shader written for the rectangle reads the same on it. Both renderers wrap it in their own
 * geometry.
 */
export function paneFan(shape, w, h) {
  const pts = outlineOf(shape, w * 0.5, h * 0.5);
  const position = [0, 0, 0];
  const uv = [0.5, 0.5];
  for (const [x, y] of pts) {
    position.push(x, y, 0);
    uv.push(x / w + 0.5, y / h + 0.5);
  }
  const index = [];
  for (let i = 0; i < pts.length; i += 1) {
    index.push(0, 1 + i, 1 + ((i + 1) % pts.length));
  }
  return { position, uv, index };
}

/*
 * ------------------------------------------------------------------------------------------
 * A POLYGON OPENING: the hole in a letter.
 *
 * A hoop and a hex gate are a shape inscribed in a box, and the box is the whole of what a
 * reader has to know. A letter's hole is not: the gap between the two Vs of a W is a triangle
 * standing on the ground, the hole of an M is a rectangle with a notch bitten out of its top,
 * and a B has two of them. So an opening can also be a plain list of corners, counter
 * clockwise, in the opening's own frame (x across, y up). It need not be convex. Nothing here
 * assumes it is, because a pass has to be scored against the hole the pilot can see.
 *
 * The same four readers as the shapes above, and the same rule: ONE DEFINITION. The pass test
 * clips a segment against it (clipToPolygon), the scene builds the lit outline on it
 * (barsAlong over insetPolygon) and its pane from it (paneOfPolygon), and the builder draws
 * the same points. All of it is arithmetic and square roots, which are correctly rounded
 * everywhere, so it is the same bits in every engine.
 * ------------------------------------------------------------------------------------------
 */

/* Signed area: positive for a counter clockwise run, which is the way every polygon here goes. */
export function polygonArea(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    sum += ax * by - bx * ay;
  }
  return sum / 2;
}

/* The box a polygon lies in, as { x0, x1, y0, y1 }. Null for no corners at all. */
export function polygonBounds(poly) {
  if (!poly.length) {
    return null;
  }
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
  return { x0, x1, y0, y1 };
}

/* Whether a point is in the polygon, by the even odd rule. The edge is in, as it is for every
 * other shape: a pass that touches the outline of the hole is a pass. */
export function insidePolygon(poly, x, y) {
  const n = poly.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const along = (x - xj) * (yi - yj) - (y - yj) * (xi - xj);
    if (Math.abs(along) < 1e-12
      && x >= Math.min(xi, xj) - 1e-12 && x <= Math.max(xi, xj) + 1e-12
      && y >= Math.min(yi, yj) - 1e-12 && y <= Math.max(yi, yj) + 1e-12) {
      return true;
    }
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/*
 * WHERE A STRAIGHT TRAVEL IS INSIDE A POLYGON, as clipToShape says it for the shapes: the travel
 * starts at (ax, ay) and moves (dx, dy) as t goes from 0 to 1, only t between t0 and t1 is asked
 * about, and the answer is the FIRST stretch of that range spent inside, as [from, to], or null.
 *
 * Exact, not sampled. The travel's line is cut at every edge it crosses, and each piece between two
 * cuts is wholly inside or wholly outside, so one point of it decides. A convex shape has one stretch
 * and a notched one can have two (a line through the shoulder of an M goes in, out over the notch
 * and in again); the first is what a pass is credited at, and the pieces that touch are joined.
 */
export function clipToPolygon(poly, ax, ay, dx, dy, t0, t1) {
  const n = poly.length;
  if (n < 3 || t0 > t1) {
    return null;
  }
  if (dx * dx + dy * dy < 1e-24) {
    return insidePolygon(poly, ax, ay) ? [t0, t1] : null;
  }
  const cuts = [t0, t1];
  for (let i = 0; i < n; i += 1) {
    const [px, py] = poly[i];
    const [qx, qy] = poly[(i + 1) % n];
    const ex = qx - px;
    const ey = qy - py;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-18) {
      /* Parallel to this edge: it cuts the line nowhere, and a line along an edge is decided by
       * the points between its other cuts, which the midpoints below test. */
      continue;
    }
    const t = ((px - ax) * ey - (py - ay) * ex) / den;
    const s = ((px - ax) * dy - (py - ay) * dx) / den;
    if (s >= -1e-12 && s <= 1 + 1e-12 && t > t0 && t < t1) {
      cuts.push(t);
    }
  }
  cuts.sort((u, v) => u - v);
  let from = null;
  let to = null;
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const mid = (cuts[i] + cuts[i + 1]) / 2;
    if (insidePolygon(poly, ax + dx * mid, ay + dy * mid)) {
      if (from === null) {
        from = cuts[i];
      }
      to = cuts[i + 1];
    } else if (from !== null) {
      break;
    }
  }
  return from === null ? null : [from, to];
}

/*
 * A POLYGON PUSHED IN: every edge moved `dist` towards the inside along its own normal, and each
 * corner put where its two neighbours' new lines meet. `dist` is one number, or one for each edge
 * (edge i runs from corner i to corner i + 1), which is what a letter's hole needs: the side that is
 * a pipe is held off by the pipe's radius and the side that is the ground, or is not there at all,
 * is not held off at all.
 *
 * Two collinear edges that are pushed by different amounts leave a step, so the corner between them
 * becomes two. A hole that is too small for the push comes out turned inside out, and the sign of its area
 * does not say so when it has an even number of sides (a square pushed past its middle is a smaller square
 * the wrong way up, and the same way round), so the caller asks whether each corner is still the push from
 * the sides it was pushed off: layoutLetter in src/props/letters.js does.
 */
export function insetPolygon(poly, dist) {
  const n = poly.length;
  if (n < 3) {
    return [];
  }
  const push = (i) => (Array.isArray(dist) ? dist[i] : dist);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p = poly[(i + n - 1) % n];
    const q = poly[i];
    const r = poly[(i + 1) % n];
    const la = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const lb = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1;
    /* The normals point into a counter clockwise polygon: left of the way the edge runs. */
    const nax = -(q[1] - p[1]) / la;
    const nay = (q[0] - p[0]) / la;
    const nbx = -(r[1] - q[1]) / lb;
    const nby = (r[0] - q[0]) / lb;
    const da = push((i + n - 1) % n);
    const db = push(i);
    const det = nax * nby - nay * nbx;
    if (Math.abs(det) < 1e-9) {
      if (Math.abs(da - db) < 1e-12) {
        out.push([q[0] + nax * da, q[1] + nay * da]);
      } else {
        out.push([q[0] + nax * da, q[1] + nay * da], [q[0] + nbx * db, q[1] + nby * db]);
      }
      continue;
    }
    const ca = nax * q[0] + nay * q[1] + da;
    const cb = nbx * q[0] + nby * q[1] + db;
    out.push([(ca * nby - cb * nay) / det, (nax * cb - nbx * ca) / det]);
  }
  return out;
}

/* The mirror image across the vertical axis, still counter clockwise: the corners are turned
 * about and not just negated, because a mirror reverses the way round a polygon goes. */
export function mirrorPolygon(poly) {
  const out = [];
  for (let i = poly.length - 1; i >= 0; i -= 1) {
    out.push([-poly[i][0], poly[i][1]]);
  }
  return out;
}

/*
 * A POLYGON AS TRIANGLES, by cutting off ears: indices into `poly`, three to a triangle. For the
 * pane across a hole that is not convex, where a fan from the middle would cover the notch.
 * Collinear corners (the step a letter's hole has where a pipe stops and the open side starts) are
 * dropped as they are met. A polygon that cannot be cut, which a simple one never is, is fanned.
 */
export function triangulate(poly) {
  const n = poly.length;
  if (n < 3) {
    return [];
  }
  const idx = poly.map((_, i) => i);
  if (polygonArea(poly) < 0) {
    idx.reverse();
  }
  const out = [];
  const crossOf = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let guard = n * n + 8;
  while (idx.length > 3 && guard > 0) {
    guard -= 1;
    let cut = false;
    for (let k = 0; k < idx.length && !cut; k += 1) {
      const i0 = idx[(k + idx.length - 1) % idx.length];
      const i1 = idx[k];
      const i2 = idx[(k + 1) % idx.length];
      const a = poly[i0];
      const b = poly[i1];
      const c = poly[i2];
      if (crossOf(a, b, c) <= 1e-12) {
        continue;
      }
      let ear = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) {
          continue;
        }
        const p = poly[j];
        if (crossOf(a, b, p) >= -1e-12 && crossOf(b, c, p) >= -1e-12 && crossOf(c, a, p) >= -1e-12) {
          ear = false;
          break;
        }
      }
      if (ear) {
        out.push(i0, i1, i2);
        idx.splice(k, 1);
        cut = true;
      }
    }
    if (!cut) {
      /* No ear: a flat corner is in the way. Take the first one out, and fan what is left if there is none. */
      const flat = idx.findIndex((_, k) => Math.abs(crossOf(
        poly[idx[(k + idx.length - 1) % idx.length]], poly[idx[k]], poly[idx[(k + 1) % idx.length]],
      )) <= 1e-12);
      if (flat < 0) {
        break;
      }
      idx.splice(flat, 1);
    }
  }
  if (idx.length >= 3) {
    for (let k = 1; k + 1 < idx.length; k += 1) {
      out.push(idx[0], idx[k], idx[k + 1]);
    }
  }
  return out;
}

/*
 * A PANE ACROSS A POLYGON HOLE, as data, the way paneFan gives one for a shape: positions in the
 * opening's own frame, and the uv a rectangle's pane has, so a shader written for the rectangle reads
 * the same on it. The uv box is `w` by `h` centred on (cx, cy), which is the box the target's wrong
 * way bar is drawn across, and every corner of the hole is inside it.
 */
export function paneOfPolygon(poly, w, h, cx = 0, cy = 0) {
  const position = [];
  const uv = [];
  for (const [x, y] of poly) {
    position.push(x, y, 0);
    uv.push((x - cx) / w + 0.5, (y - cy) / h + 0.5);
  }
  return { position, uv, index: triangulate(poly) };
}
