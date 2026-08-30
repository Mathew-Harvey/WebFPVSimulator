/*
 * obstacles.js: the things in the world you can fly a trick AROUND.
 *
 * WHY THIS FILE HAS TO EXIST. src/game/trickdetect.js reads tricks out of
 * the craft's own rotation, and that is enough for the whole Open Air
 * category and nothing else. Every remaining trick in the catalogue is
 * defined against an OBJECT: a Powerloop is a flip around something, a
 * Matty is a flip over something, a Split-S goes over and comes back under,
 * an Orbit goes round and round. Without a list of objects and where their
 * axes are, none of them can be named, because the rotation of a Powerloop
 * and the rotation of a plain Flip are identical. The difference is
 * entirely in where the craft WENT.
 *
 * WHAT AN OBSTACLE IS, AND WHY IT IS AN AXIS. The one thing all of those
 * tricks have in common is that the craft WINDS AROUND A LINE:
 *
 *   a POLE is a vertical line. Orbits, pole dancing and trippy spins wind
 *   around it in the horizontal plane.
 *   a BAR is a horizontal line. Powerloops, mattys, split-S and immelmanns
 *   wind around it in the vertical plane: under, over, and under again.
 *
 * So an obstacle is not a shape, it is an AXIS with a reach. That reduces
 * every one of those tricks to one measurement, the winding number of the
 * craft's position about a line, which is the exact translational twin of
 * the rotation counting trickdetect.js already does. The two halves of the
 * recogniser end up the same shape, which is the point.
 *
 * WHERE THEY COME FROM. Measured, not assumed. The freestyle city registers
 * 17,643 colliders and every one of them is a BOX: 16,978 tagged 'wall' and
 * 665 tagged 'obstacle', with nothing tagged pole, tree, boom or gate. The
 * collider kinds are about how a hit FEELS, not about what the thing is, so
 * they say nothing useful here and the classification has to come from
 * geometry. Of those 17,643 boxes, 1,587 are pole shaped and 311 are bar
 * shaped by the rules below, which is a town's worth of lamp posts, sign
 * posts, railings and fence rails, and it is plenty.
 *
 * FRAME. This file works in THREE.JS WORLD SPACE, y up, metres. It has to:
 * the colliders it reads are the world's own geometry and they live in that
 * frame. It performs no conversion of its own, so CLAUDE.md's rule that the
 * frames meet exactly once in src/render/frame.js still holds. The rotation
 * half of the recogniser works in the plant's body frame and the two never
 * meet in a calculation: one counts turns of attitude, the other counts
 * turns of position, and neither is expressed in the other's axes.
 *
 * NO TRIGONOMETRY, same rule as trickdetect.js. Winding is accumulated as
 * cross over product of magnitudes, which is sin of the step angle, and at
 * 1 kHz the step angle is small enough that the difference does not reach
 * the fourth decimal place of a turn.
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

/* A vertical line: orbits, pole dancing, jump rope. */
export const OB_POLE = 0;
/* A horizontal line: powerloops, mattys, split-S, immelmanns. */
export const OB_BAR = 1;
export const OB_KIND_NAME = ['pole', 'bar'];

/*
 * WHAT COUNTS AS A POLE. Measured against the city: a lamp post is 0.16 m
 * square, a sign post 0.12, a young trunk about 0.4. At 0.9 m of footprint
 * the net catches those and stops well short of a chimney stack.
 *
 * The height floor is 2.5 m because an orbit needs something taller than the
 * pilot's eyeline to be worth flying around, and because at 2 m the net
 * fills with bollards and fence posts, of which the town has hundreds.
 */
const POLE_FOOT_MAX = 0.9;
const POLE_HEIGHT_MIN = 2.5;

/*
 * WHAT COUNTS AS A BAR. Long one way, thin the other two, and high enough
 * off the ground that a quad can pass UNDER it, which is the whole trick.
 *
 * BAR_CLEAR_MIN is 1.5 m. A five inch quad is 0.25 m across, so 1.5 m is six
 * airframes of daylight: tight enough to be a trick, wide enough to be
 * survivable. Below that the object is a kerb, not a powerloop.
 */
const BAR_LEN_MIN = 2.0;
const BAR_THICK_MAX = 0.8;
const BAR_CLEAR_MIN = 1.5;

/*
 * How far from the axis still counts as flying THIS obstacle.
 *
 * MEASURED, not guessed. A powerloop flown on the real aircraft at a
 * 12 m/s entry, which is a slow one, traces a loop about twelve metres
 * across, so the craft reaches seven or eight metres from the axis at the
 * far side. Flown faster it is bigger. Nine metres cut the loop in half and
 * the trick was never seen; fourteen holds it.
 *
 * Being generous costs nothing, because engagement decides only whether
 * winding is COUNTED and snapPathTurns then REJECTS any bar winding that
 * does not agree with which side of the rail the craft started and finished
 * on. A quad flying straight past a rail at five metres subtends half a
 * turn and is thrown away, because it came out on the side it went in.
 */
const REACH = [12, 14];
/* How far past the end of the axis still counts, so a loop around the end
 * of a rail is still that rail. */
const OVERHANG = [3, 2.5];

/*
 * Two axes are THE SAME LINE if they point the same way and lie on top of
 * each other. The town's railings are built out of collinear segments, an
 * 8.4 m piece then a 17.6 m piece then another 8.4 m piece, and a pilot
 * looping the join must not have their loop cut in half because engagement
 * stepped from one segment to the next. Comparing the LINE rather than the
 * collider is what makes a fence one obstacle.
 */
const SAME_DIR_DOT = 0.985;
const SAME_LINE_DIST = 0.75;

/* One obstacle: a line segment with a kind. Plain fields, built once. */
class Obstacle {
  constructor(kind, cx, cy, cz, dx, dy, dz, half, id) {
    this.kind = kind;
    /* Centre of the axis. */
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    /* Unit direction along the axis. */
    this.dx = dx;
    this.dy = dy;
    this.dz = dz;
    /* Half length along the axis. */
    this.half = half;
    this.id = id;
  }
}

/*
 * Every obstacle in a map, and the query the detector needs.
 *
 * The index is a flat grid on x and z at the same cell size the collider
 * broadphase uses, for the same reason: the query runs once a millisecond
 * and must not touch seventeen thousand things to do it.
 */
export class ObstacleField {
  constructor(cell = 16) {
    this.items = [];
    this.cell = cell;
    this.grid = null;
  }

  add(kind, cx, cy, cz, dx, dy, dz, half) {
    this.items.push(new Obstacle(kind, cx, cy, cz, dx, dy, dz, half, this.items.length));
    return this;
  }

  get count() {
    return this.items.length;
  }

  countOf(kind) {
    let n = 0;
    for (const o of this.items) {
      if (o.kind === kind) {
        n += 1;
      }
    }
    return n;
  }

  /* Bucket every obstacle into the cells its reach touches. */
  build() {
    this.grid = new Map();
    for (const o of this.items) {
      /* The footprint is the reach, widened along whichever way the axis
       * lies: a 17 m rail has to be findable from either end of itself. */
      const rx = REACH[o.kind] + Math.abs(o.dx) * o.half;
      const rz = REACH[o.kind] + Math.abs(o.dz) * o.half;
      const x0 = Math.floor((o.cx - rx) / this.cell);
      const x1 = Math.floor((o.cx + rx) / this.cell);
      const z0 = Math.floor((o.cz - rz) / this.cell);
      const z1 = Math.floor((o.cz + rz) / this.cell);
      for (let ix = x0; ix <= x1; ix += 1) {
        for (let iz = z0; iz <= z1; iz += 1) {
          const key = ix * 100003 + iz;
          let bucket = this.grid.get(key);
          if (!bucket) {
            bucket = [];
            this.grid.set(key, bucket);
          }
          bucket.push(o);
        }
      }
    }
    return this;
  }

  /*
   * The obstacle the craft is flying, or null.
   *
   * "Flying" means: inside the reach of its axis, and within its span plus
   * an overhang. When several qualify the nearest axis wins, because the
   * one you are looping is the one you are closest to.
   */
  near(x, y, z) {
    if (!this.grid) {
      return null;
    }
    const bucket = this.grid.get(
      Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell),
    );
    if (!bucket) {
      return null;
    }
    let best = null;
    let bestD2 = Infinity;
    for (const o of bucket) {
      const rx = x - o.cx;
      const ry = y - o.cy;
      const rz = z - o.cz;
      /* Distance along the axis, and the perpendicular leftover. */
      const along = rx * o.dx + ry * o.dy + rz * o.dz;
      if (along > o.half + OVERHANG[o.kind] || along < -o.half - OVERHANG[o.kind]) {
        continue;
      }
      const px = rx - o.dx * along;
      const py = ry - o.dy * along;
      const pz = rz - o.dz * along;
      const d2 = px * px + py * py + pz * pz;
      const reach = REACH[o.kind];
      if (d2 > reach * reach) {
        continue;
      }
      if (d2 < bestD2) {
        bestD2 = d2;
        best = o;
      }
    }
    return best;
  }
}

/* Do these two obstacles lie on the same line? See SAME_DIR_DOT. */
export function sameAxis(a, b) {
  if (!a || !b || a.kind !== b.kind) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const dot = a.dx * b.dx + a.dy * b.dy + a.dz * b.dz;
  if ((dot < 0 ? -dot : dot) < SAME_DIR_DOT) {
    return false;
  }
  /* Perpendicular distance between b's centre and a's line. */
  const rx = b.cx - a.cx;
  const ry = b.cy - a.cy;
  const rz = b.cz - a.cz;
  const along = rx * a.dx + ry * a.dy + rz * a.dz;
  const px = rx - a.dx * along;
  const py = ry - a.dy * along;
  const pz = rz - a.dz * along;
  return px * px + py * py + pz * pz <= SAME_LINE_DIST * SAME_LINE_DIST;
}

/*
 * Read a built Colliders and pick the obstacles out of it.
 *
 * `groundAt(x, z)` returns the world height under a point, which decides
 * whether a bar has daylight beneath it. Passing null skips that test,
 * which is what the self test does when it builds a field by hand.
 *
 * Boxes only, because that is what a map is made of; a capsule map would
 * want its own clause and nothing has one yet.
 */
export function deriveObstacles(colliders, groundAt) {
  const field = new ObstacleField();
  if (!colliders || !colliders.fbox) {
    return field.build();
  }
  const n = colliders.fbox.length;
  for (let i = 0; i < n; i += 1) {
    if (!colliders.fbox[i]) {
      continue;
    }
    const x0 = colliders.fax[i];
    const x1 = colliders.fbx[i];
    const z0 = colliders.faz[i];
    const z1 = colliders.fbz[i];
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;
    const w = x1 - x0;
    const d = z1 - z0;
    /*
     * Clamp the vertical extent to what is ABOVE THE GROUND. The town builds
     * some of its walls as boxes that reach sixty metres underground, and
     * an unclamped height test calls those poles.
     */
    const ground = groundAt ? groundAt(cx, cz) : 0;
    const y0 = Math.max(colliders.fay[i], ground);
    const y1 = colliders.fby[i];
    const h = y1 - y0;
    if (h <= 0) {
      continue;
    }

    const foot = w > d ? w : d;
    const thin = w > d ? d : w;

    /* A pole: thin footprint, tall, standing on the ground. */
    if (foot <= POLE_FOOT_MAX && h >= POLE_HEIGHT_MIN) {
      field.add(OB_POLE, cx, (y0 + y1) * 0.5, cz, 0, 1, 0, h * 0.5);
      continue;
    }

    /* A bar: long one way, thin the other two, with daylight underneath. */
    if (foot >= BAR_LEN_MIN && thin <= BAR_THICK_MAX && h <= BAR_THICK_MAX
      && y0 - ground >= BAR_CLEAR_MIN) {
      const alongX = w > d;
      field.add(
        OB_BAR, cx, (y0 + y1) * 0.5, cz,
        alongX ? 1 : 0, 0, alongX ? 0 : 1,
        foot * 0.5,
      );
    }
  }
  return field.build();
}
