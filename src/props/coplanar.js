/*
 * coplanar.js: two faces in one plane, and which of them is drawn in front.
 *
 * WHY THIS EXISTS. The house maps (src/maps/house/, src/maps/heads/) are
 * thousands of boxes on the axes, written as a plan, and a plan says "this
 * trim is on that siding" by giving the two boxes a face in the same place.
 * The depth buffer cannot tell two faces in one plane apart, so the GPU picks
 * whichever it happens to finish first, pixel by pixel and frame by frame,
 * and the wall shimmers between two colours as the camera moves. The owner,
 * 2026-10-21: "occasionally we get tareing and flashing in the house maps".
 * Counted on the plans that day: 245 such pairs of different colours in Nick
 * Burns' house (a slab top and a wall top, windows on coping, trim on the
 * siding) and 492 in Heads' house, one of them a 97 square metre painted wall
 * flush with a wicker one.
 *
 * THE RULE. Where two boxes of different materials share a face, the same
 * way round and overlapping, the thinner box along that axis is the thing
 * laid on the other (trim, paint, a window, a shutter, a slab under a wall),
 * so its face is drawn LIFT metres further out and wins every pixel. Equal
 * thickness falls to the material's name, so the answer never depends on
 * the order of the plan. Repeated, because a face moved out can land on
 * another (paint on trim on siding is three deep); both houses settle in
 * under eight passes, a tenth of a second at load and nothing in flight.
 *
 * DRAWN ONLY. This returns copies of the parts with their drawn bounds moved
 * and is called where the kit draws them (src/maps/built/index.js). The
 * solids are placed from the plan's own parts before this runs, so nothing
 * the physics reads moves, and the colliders, the landing tops and the
 * world goldens are what they were. LIFT is 3 mm of the world, under a
 * millimetre of the real house at S 3.5, far below a pixel at any range the
 * map is flown from and enough for 24 bit depth at the camera's open near
 * plane (CAMERA_NEAR_OPEN in src/main.js) out past a hundred metres.
 *
 * Render only, so Math is free here (see ./trig.js for the rule).
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

export const LIFT = 0.003;

/* Closer than this is the same plane to the depth buffer at the ranges a
 * house is flown at: the same as LIFT less a hair, so a face this module
 * has moved is never found again. */
const SAME = 0.0025;

/* Overlap smaller than this either way is two faces meeting at an edge. */
const EDGE = 1e-4;

function drawnBox(p) {
  return p.t === 'box' && p.draw && p.lo && p.hi;
}

/*
 * Every pair of drawn boxes of different materials with a face in one plane,
 * facing the same way and overlapping. `parts` is a plan's part list; the
 * answer is [{ i, j, axis, dir, area }] with i and j indices into it.
 */
export function coplanarPairs(parts) {
  const faces = [];
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    if (!drawnBox(p)) {
      continue;
    }
    for (let a = 0; a < 3; a += 1) {
      const u = (a + 1) % 3;
      const v = (a + 2) % 3;
      if (p.hi[u] - p.lo[u] < EDGE || p.hi[v] - p.lo[v] < EDGE) {
        continue;
      }
      faces.push({ i, a, s: 1, c: p.hi[a] });
      faces.push({ i, a, s: -1, c: p.lo[a] });
    }
  }
  /* By axis, then way round, then where: a pair can only be neighbours. */
  faces.sort((f, g) => (f.a - g.a) || (f.s - g.s) || (f.c - g.c));
  const out = [];
  for (let x = 0; x < faces.length; x += 1) {
    const F = faces[x];
    const P = parts[F.i];
    const u = (F.a + 1) % 3;
    const v = (F.a + 2) % 3;
    for (let y = x + 1; y < faces.length; y += 1) {
      const G = faces[y];
      if (G.a !== F.a || G.s !== F.s || G.c - F.c > SAME) {
        break;
      }
      const Q = parts[G.i];
      if (G.i === F.i || P.m === Q.m) {
        continue;
      }
      const du = Math.min(P.hi[u], Q.hi[u]) - Math.max(P.lo[u], Q.lo[u]);
      const dv = Math.min(P.hi[v], Q.hi[v]) - Math.max(P.lo[v], Q.lo[v]);
      if (du > EDGE && dv > EDGE) {
        out.push({ i: F.i, j: G.i, axis: F.a, dir: F.s, area: du * dv });
      }
    }
  }
  return out;
}

/* Which of two parts is laid on the other along axis a: the thinner one,
 * then the earlier material name, then the earlier part. */
function onTop(parts, i, j, a) {
  const ti = parts[i].hi[a] - parts[i].lo[a];
  const tj = parts[j].hi[a] - parts[j].lo[a];
  if (Math.abs(ti - tj) > 1e-6) {
    return ti < tj ? i : j;
  }
  const mi = String(parts[i].m);
  const mj = String(parts[j].m);
  if (mi !== mj) {
    return mi < mj ? i : j;
  }
  return Math.min(i, j);
}

/*
 * The parts as they should be DRAWN: copies, where a face shared with
 * another colour is moved LIFT out on the box that is laid on top. Parts
 * that need nothing come back as themselves. Never hand the result to the
 * solids.
 */
export function separateCoplanar(parts) {
  const out = parts.slice();
  let moved = 0;
  for (let pass = 0; pass < 8; pass += 1) {
    const pairs = coplanarPairs(out);
    if (!pairs.length) {
      break;
    }
    const lift = new Map();
    for (const q of pairs) {
      const k = onTop(out, q.i, q.j, q.axis);
      const key = `${k}|${q.axis}|${q.dir}`;
      lift.set(key, { k, a: q.axis, s: q.dir });
    }
    for (const { k, a, s } of lift.values()) {
      const p = out[k] === parts[k] ? { ...parts[k], lo: parts[k].lo.slice(), hi: parts[k].hi.slice() } : out[k];
      if (s > 0) {
        p.hi[a] += LIFT;
      } else {
        p.lo[a] -= LIFT;
      }
      out[k] = p;
      moved += 1;
    }
  }
  return { parts: out, moved };
}
