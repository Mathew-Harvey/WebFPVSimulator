/*
 * collide.js: what the craft can hit, and whether it just hit it.
 *
 * Until this file existed the only solid thing in the world was the ground,
 * and it was solid in the crudest way: one point test against the terrain
 * height, no craft radius, no sweep. A gate was a scoring plane you could
 * fly straight through the middle of the frame, a tree was a picture, and a
 * cliff was scenery. The owner's words were "the gates need to be solid".
 *
 * ONE PRIMITIVE. Every solid thing in this world is a capsule: a segment
 * from a to b, plus a radius. A tree trunk is a vertical capsule, a gate
 * cross member is a horizontal one, a canopy blob is a capsule whose
 * segment has zero length, which is a sphere. Choosing one primitive means
 * one test, and one test that is correct is worth more than four that are
 * nearly correct.
 *
 * THE TEST IS EXACT, NOT SAMPLED. A sphere of radius CRAFT_WORLD_R swept along
 * the segment the craft travelled this frame intersects a capsule exactly
 * when the distance between the two segments is at most the sum of the two
 * radii. So the query is a segment to segment closest distance, which is
 * closed form. The first design for this sampled the travel at 0.1 m steps,
 * which needed a cap on the sample count, and the cap would have been a
 * tunnelling bug on any machine slower than the cap assumed. This container
 * renders at about two frames a second, so the craft can move fifteen
 * metres between frames, and a sampled sweep would have been wrong here
 * before it was ever wrong on real hardware.
 *
 * THE QUERY ALLOCATES NOTHING. Budget P8 says zero new objects in the
 * render loop and it is already failing; this is called every frame and
 * must not make it worse. Colliders live in flat Float32Arrays, the
 * broadphase grid holds Int32Arrays, and the duplicate rejection is a stamp
 * array rather than a Set. There is no array literal, no object literal and
 * no closure anywhere in hit().
 *
 * Everything here is in Three.js world space, y up, downstream of the
 * physics. The query itself does not write the plant. It reports a unit
 * outward normal and a closing parameter; the shell may call sim_contact
 * with those so a clip bounces, slides or rolls instead of tunnelling.
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

/* The only import, and it is a number rather than a renderer: the world is
 * built at WORLD_SCALE times the aircraft's own scale, and every query below
 * is against the world, so the craft has to be converted into the world's
 * metres exactly once. frame.js owns that conversion and has no dependencies
 * of its own. */
import { simLenToWorld } from '../render/frame.js';

/*
 * The craft's size, in metres, and the ONE place any of it is written down.
 *
 * A quad is named for its motor to motor diagonal, so a motor sits half of
 * that from the centre, and a 5 inch prop adds half of five inches of blade
 * beyond it. The disc a tumbling quad sweeps is the sum. Check 15
 * publishes that radius. The query itself is the four prop discs, not a
 * sphere, because a wall the craft meets square-on sees 0.141 m, not
 * 0.1735 m.
 *
 * THE OLD NUMBER WAS WRONG BY 8.6 PERCENT AND A SCALE CHECK IS WHAT CAUGHT IT.
 * CRAFT_R was typed as 0.1885, derived in its own comment from a 250 mm class
 * quad with a motor 0.125 m out. This airframe is not 250 mm: plant.c puts
 * the motors at arm_x = arm_y = 0.110 / sqrt(2), which is 0.110 m from the
 * centre and a 220 mm machine, and src/render/craft.js draws them there. So
 * the collision sphere was 0.1885 m around a craft that sweeps 0.1735 m, and
 * every gate in the course was scored against a quad 8.6 percent bigger than
 * the one on screen. It is derived here now, from the same two numbers the
 * model and the renderer use, so the three cannot disagree again.
 * tests/lib/checks.js check 15 asserts it against the drawn geometry.
 */
export const CRAFT_ARM = 0.110;      /* motor centre to airframe centre */
export const CRAFT_PROP_R = 0.0635;  /* half of five inches */
export const CRAFT_R = CRAFT_ARM + CRAFT_PROP_R;
/* Per-axis motor offset: the X sits on the diagonals, so a motor is
 * CRAFT_ARM / sqrt(2) along body x and along body z. The axis-aligned
 * half-width of one prop disc is this plus CRAFT_PROP_R, 0.1413 m, which
 * is what a wall actually meets when the quad is square to it. */

/*
 * The same airframe, in the world's metres rather than its own.
 *
 * Everything in this file is a query against the world: a collider box came
 * from a town whose doorways are 2 m, a gate capsule came from a 1.524 m
 * MultiGP opening, and the travel segment is a world space segment. So the
 * craft that sweeps through them has to be measured in the same metres, and
 * the world is WORLD_SCALE times the aircraft's own scale
 * (src/render/frame.js). Getting this wrong in either direction is the exact
 * class of bug the 0.1885 comment above records: a gate scored against a quad
 * that is not the one on screen.
 *
 * CRAFT_R and CRAFT_V_HALF above stay the airframe's TRUE dimensions, because
 * src/render/craft.js draws a real 5 inch machine from them and plant.c flies
 * one. Only the query is scaled.
 */
export const CRAFT_WORLD_R = simLenToWorld(CRAFT_R);
export const CRAFT_WORLD_ARM_AXIS = simLenToWorld(CRAFT_ARM * Math.SQRT1_2);
export const CRAFT_WORLD_PROP = simLenToWorld(CRAFT_PROP_R);

/*
 * The craft's vertical semi-extent in level flight, about its own origin.
 *
 * A quad is an X, not a ball and not a filled disc. 0.347 m is the
 * diagonal from centre to a spinning blade tip; a wall the craft meets
 * square-on sees 0.141 m, the motor's axis offset plus the blade. Sweeping
 * CRAFT_R in every horizontal direction treated the empty air between the
 * arms as carbon, so a doorway and a shopfront both felt 3 cm fatter than
 * the airframe on screen, and the whole machine read as a ball.
 * Vertically the drawn stack runs from the body's underside at -0.017 to
 * the prop discs at +0.034, so 0.040 covers it with half a centimetre over
 * the prop plane. vHalf still grows from that floor toward CRAFT_R as the
 * craft banks, because a banked X does present a blade tip to the ground.
 */
export const CRAFT_V_HALF = 0.040;
export const CRAFT_WORLD_V_HALF = simLenToWorld(CRAFT_V_HALF);

/* The vertical semi-axis at a given tilt of the prop plane from level, in
 * WORLD metres, because that is the space every caller sweeps it through.
 * sinTilt is sqrt(1 - upY^2), symmetric in upY so an inverted craft is as
 * thin as an upright one. */
export function craftVerticalHalf(sinTilt) {
  let s = sinTilt;
  if (s < 0) {
    s = 0;
  }
  if (s > 1) {
    s = 1;
  }
  return CRAFT_WORLD_V_HALF + (CRAFT_WORLD_R - CRAFT_WORLD_V_HALF) * s;
}

/*
 * Names, in the order kind indices are assigned. Reported by stats().
 *
 * `wall` and `boom` are the city's, and they are boxes rather than capsules.
 * A city is authored as axis aligned rectangles because a walker only ever
 * meets their sides, and turning 2731 of them into capsules would either
 * inscribe them, letting a quad through the corners of every building, or
 * circumscribe them, putting an invisible cylinder around every wall. So the
 * box is a second primitive, and it earns its place: see addBox.
 */
/* `train` is the only MOVING solid in either world and it is a hard kind on
 * purpose: the city's three car set crosses the town at 23.5 m/s, and there
 * is no speed at which meeting it is a graze. */
const KINDS = ['gate', 'obstacle', 'tree', 'canopy', 'rock', 'cliff', 'pole', 'wall', 'boom', 'train'];

/*
 * The broadphase cell, in metres. The world is about 1700 m across and the
 * biggest collider is a cliff tier at 16 m of radius, so a cell much smaller
 * than that buys nothing: a fat collider lands in many cells either way. At
 * 8 m a query along a fast frame's travel touches a handful of cells, and
 * the whole grid for a few thousand colliders stays inside a megabyte.
 */
const CELL = 8;
/* Grid keys are packed integers rather than strings, because a string key is
 * an allocation per cell per frame. The world half extent in cells has to
 * fit in the packing, and 1024 cells at 8 m is 8192 m each way. */
const GRID_HALF = 512;
const GRID_SPAN = GRID_HALF * 2;

function clamp01(v) {
  if (v < 0) {
    return 0;
  }
  if (v > 1) {
    return 1;
  }
  return v;
}

/*
 * Signed depth of a point against an AABB. Positive is the distance to
 * the nearest face while the point is inside; zero is on a face; negative
 * is the Euclidean distance to the box while outside. No allocation.
 */
function boxPointInterior(x0, y0, z0, x1, y1, z1, x, y, z) {
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
  const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
  if (dx === 0 && dy === 0 && dz === 0) {
    const ix = x - x0 < x1 - x ? x - x0 : x1 - x;
    const iy = y - y0 < y1 - y ? y - y0 : y1 - y;
    const iz = z - z0 < z1 - z ? z - z0 : z1 - z;
    let m = ix < iy ? ix : iy;
    if (iz < m) {
      m = iz;
    }
    return m;
  }
  return -Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function boxOppositeSides(x0, y0, z0, x1, y1, z1, ax, ay, az, bx, by, bz) {
  return (ax < x0 && bx > x1) || (ax > x1 && bx < x0)
    || (ay < y0 && by > y1) || (ay > y1 && by < y0)
    || (az < z0 && bz > z1) || (az > z1 && bz < z0);
}

/*
 * Closed segment vs AABB, slab method. Opposite-face ends of a long
 * drop through a 14 cm deck have their midpoint above the slab, so a
 * midpoint-inside test misses the punch the bounce then ejects the
 * wrong way on. This is the actual intersection.
 */
function segmentHitsAabb(x0, y0, z0, x1, y1, z1, ax, ay, az, bx, by, bz) {
  let tmin = 0;
  let tmax = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  if (dx > -1e-18 && dx < 1e-18) {
    if (ax < x0 || ax > x1) {
      return false;
    }
  } else {
    let u0 = (x0 - ax) / dx;
    let u1 = (x1 - ax) / dx;
    if (u0 > u1) {
      const tmp = u0;
      u0 = u1;
      u1 = tmp;
    }
    if (u0 > tmin) {
      tmin = u0;
    }
    if (u1 < tmax) {
      tmax = u1;
    }
    if (tmin > tmax) {
      return false;
    }
  }
  if (dy > -1e-18 && dy < 1e-18) {
    if (ay < y0 || ay > y1) {
      return false;
    }
  } else {
    let u0 = (y0 - ay) / dy;
    let u1 = (y1 - ay) / dy;
    if (u0 > u1) {
      const tmp = u0;
      u0 = u1;
      u1 = tmp;
    }
    if (u0 > tmin) {
      tmin = u0;
    }
    if (u1 < tmax) {
      tmax = u1;
    }
    if (tmin > tmax) {
      return false;
    }
  }
  if (dz > -1e-18 && dz < 1e-18) {
    if (az < z0 || az > z1) {
      return false;
    }
  } else {
    let u0 = (z0 - az) / dz;
    let u1 = (z1 - az) / dz;
    if (u0 > u1) {
      const tmp = u0;
      u0 = u1;
      u1 = tmp;
    }
    if (u0 > tmin) {
      tmin = u0;
    }
    if (u1 < tmax) {
      tmax = u1;
    }
    if (tmin > tmax) {
      return false;
    }
  }
  return true;
}

function clampRadius(v) {
  if (v < CRAFT_WORLD_PROP) {
    return CRAFT_WORLD_PROP;
  }
  if (v > CRAFT_WORLD_R) {
    return CRAFT_WORLD_R;
  }
  return v;
}

/*
 * Support of the four prop discs along a world direction n. Motors sit at
 * (±ARM, 0, ±ARM) in the body XZ plane. A thin disc of radius PROP in that
 * plane supports PROP * |n × up| along n. Check 15 still publishes
 * CRAFT_WORLD_R (the swept diagonal); this is only the query shape.
 */
function discSupport(nx, ny, nz, exx, exy, exz, ezx, ezy, ezz, ux, uy, uz) {
  const nl2 = nx * nx + ny * ny + nz * nz;
  if (nl2 < 1e-18) {
    return CRAFT_WORLD_R;
  }
  const inv = 1 / Math.sqrt(nl2);
  const x = nx * inv;
  const y = ny * inv;
  const z = nz * inv;
  const motor = CRAFT_WORLD_ARM_AXIS * (
    Math.abs(x * exx + y * exy + z * exz) + Math.abs(x * ezx + y * ezy + z * ezz)
  );
  const ndu = x * ux + y * uy + z * uz;
  let s2 = 1 - ndu * ndu;
  if (s2 < 0) {
    s2 = 0;
  }
  return motor + CRAFT_WORLD_PROP * Math.sqrt(s2);
}

/*
 * THE CONTACT PATCH, and why a wall tap used to spin the quad up.
 *
 * The plant resolves an obstacle contact with one impulse at one point.
 * Which point decides how much of that impulse becomes rotation: the
 * angular term is about two thirds of the effective mass at a full arm,
 * so the arm is not a detail, it is most of the answer. sim_contact
 * picked the hull OBB's support in the -n direction, and that support is
 * always an extreme corner, every half extent at once. A belly slapped
 * flat on a wall therefore solved as a corner strike, came out still
 * moving into the face, and picked up tens of radians a second of spin
 * out of a contact that should have produced none. Measured before this
 * existed: a 6 m/s flat arrival left at -4.4 m/s, still inbound, with
 * 41 rad/s of spin it did not arrive with.
 *
 * A real airframe meets a flat face on a patch, not a point. The shape
 * this file sweeps is already the four prop discs, so the patch is the
 * discs that are actually against the surface, and its centroid is the
 * honest place to put the impulse:
 *
 *   belly flat on a wall   four discs tied      centroid under the CG,
 *                                               no moment, it pushes off
 *   square into a wall     two discs tied       centroid on the centreline,
 *                                               no moment, it stops square
 *   one arm catches        one disc deepest     full moment, it spins
 *
 * which is what those three contacts do in the world.
 *
 * This is a patch CENTROID, not a support function, and the two differ on
 * purpose. Along the body axis the term is scaled by d . u rather than
 * its sign, so a craft that meets a wall edge on (d perpendicular to u)
 * contributes nothing there instead of half the body depth: taking the
 * sign would put the impulse a body half-height off the centreline and
 * invent exactly the moment this function exists to remove.
 *
 * Returns the offset from the craft centre to that centroid, in world
 * metres, written into out. Allocation free: called from the contact
 * pass, which runs on the sim clock.
 */
/* How close to the deepest disc another disc must be to count as sharing
 * the patch. A 220 mm airframe on a flat face ties all four inside a few
 * millimetres; a bank of more than about six degrees breaks the tie and
 * the contact becomes the offset hit it really is. */
export const CONTACT_PATCH_BAND = 0.015;

export function contactPatch(nx, ny, nz, qx, qy, qz, qw, out) {
  const r = out || { x: 0, y: 0, z: 0 };
  /* Into the solid. The patch is on the side of the hull facing that. */
  const dx = -nx;
  const dy = -ny;
  const dz = -nz;

  /* Body axes in world, from the attitude quaternion. Written out rather
   * than routed through Three.js because this file has no renderer in it
   * and must not grow one. */
  const xx = qx * qx;
  const yy = qy * qy;
  const zz = qz * qz;
  const xy = qx * qy;
  const xz = qx * qz;
  const yz = qy * qz;
  const wx = qw * qx;
  const wy = qw * qy;
  const wz = qw * qz;
  const exx = 1 - 2 * (yy + zz);
  const exy = 2 * (xy + wz);
  const exz = 2 * (xz - wy);
  const ux = 2 * (xy - wz);
  const uy = 1 - 2 * (xx + zz);
  const uz = 2 * (yz + wx);
  const ezx = 2 * (xz + wy);
  const ezy = 2 * (yz - wx);
  const ezz = 1 - 2 * (xx + yy);

  /* The four motors, on the diagonals of the body xz plane. */
  const A = CRAFT_WORLD_ARM_AXIS;
  let bestDepth = -Infinity;
  for (let i = 0; i < 4; i += 1) {
    const sx = (i & 1) ? A : -A;
    const sz = (i & 2) ? A : -A;
    const mx = exx * sx + ezx * sz;
    const my = exy * sx + ezy * sz;
    const mz = exz * sx + ezz * sz;
    const depth = mx * dx + my * dy + mz * dz;
    if (depth > bestDepth) {
      bestDepth = depth;
    }
  }
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let n = 0;
  for (let i = 0; i < 4; i += 1) {
    const sx = (i & 1) ? A : -A;
    const sz = (i & 2) ? A : -A;
    const mx = exx * sx + ezx * sz;
    const my = exy * sx + ezy * sz;
    const mz = exz * sx + ezz * sz;
    const depth = mx * dx + my * dy + mz * dz;
    if (depth >= bestDepth - CONTACT_PATCH_BAND) {
      sumX += mx;
      sumY += my;
      sumZ += mz;
      n += 1;
    }
  }
  if (n > 0) {
    sumX /= n;
    sumY /= n;
    sumZ /= n;
  }

  /* Out to the blade, in the plane of the discs. A disc meeting the face
   * edge on reaches a full prop radius; one lying flat against it reaches
   * nothing, because the contact is already the disc itself. */
  const du = dx * ux + dy * uy + dz * uz;
  const px = dx - du * ux;
  const py = dy - du * uy;
  const pz = dz - du * uz;
  const p2 = px * px + py * py + pz * pz;
  if (p2 > 1e-12) {
    const inv = CRAFT_WORLD_PROP / Math.sqrt(p2);
    sumX += px * inv;
    sumY += py * inv;
    sumZ += pz * inv;
  }

  /* And along the body axis, toward whichever face is against the wall. */
  sumX += CRAFT_WORLD_V_HALF * du * ux;
  sumY += CRAFT_WORLD_V_HALF * du * uy;
  sumZ += CRAFT_WORLD_V_HALF * du * uz;

  r.x = sumX;
  r.y = sumY;
  r.z = sumZ;
  return r;
}

export class Colliders {
  constructor() {
    /* Construction time storage. Plain arrays here on purpose: this runs
     * once while the scene is built, never per frame. */
    this.ax = [];
    this.ay = [];
    this.az = [];
    this.bx = [];
    this.by = [];
    this.bz = [];
    this.r = [];
    this.kind = [];
    /* 0 for a capsule, 1 for a box. A box stores its minimum corner in a and
     * its maximum corner in b, with r = 0. */
    this.box = [];
    this.built = false;
    this.grid = null;
    this.stamp = null;
    this.queryId = 0;
    this.maxR = 0;
    /* Query statistics, so a claim about the broadphase can be measured
     * rather than asserted. Written per query, never allocated. */
    this.lastCandidates = 0;
    this.queries = 0;
    this.candidateTotal = 0;
    /* The last hit, so the caller can say what it hit without a return
     * object. hit() returns a kind index or -1 and writes these. hitT is
     * the contact parameter along the travel, 0 at p and 1 at q. */
    this.hitIndex = -1;
    this.hitKind = -1;
    this.hitT = -1;
    /*
     * How square the contact was: the absolute cosine between the direction of
     * travel and the contact normal, 0 for a pure graze along a surface and 1
     * for a head on hit. The shell multiplies it by the craft's speed to get a
     * closing speed, because brushing a PVC upright at 3 m/s is not the same
     * event as arriving at it at 30, and until now they were.
     */
    this.hitNormalDot = 0;
    /* Unit outward normal at the contact, Three.js world space, pointing
     * from the solid toward the craft (against inbound travel). Zero when
     * the last query missed. The shell converts this once, in frame.js. */
    this.hitNx = 0;
    this.hitNy = 0;
    this.hitNz = 0;
    this.hitMoving = -1;
    /* Scratch for axisToPoint, written per call, never allocated. */
    this.nx = 0;
    this.ny = 0;
    this.nz = 0;
    /*
     * MOVING boxes, outside the broadphase entirely.
     *
     * The grid is indexed on x and z, which is exactly why setBoxExtentY can
     * raise a level crossing boom and nothing can slide a box sideways: a
     * footprint that moves invalidates the grid. The city's train moves 59 m
     * of solid at 23.5 m/s and had no collision at all, so it needs a path
     * that never touches the grid. There are three of them, one per car, and
     * a handful of extra box tests per query costs less than one bucket of a
     * cell, so they are simply tested after the scan and folded into the same
     * earliest contact comparison. Same primitive, same solver, same answer.
     */
    this.movingHx = [];
    this.movingHy = [];
    this.movingHz = [];
    this.movingKind = [];
    this.movingCx = [];
    this.movingCy = [];
    this.movingCz = [];
    this.movingPx = [];
    this.movingPy = [];
    this.movingPz = [];
    this.movingCount = 0;
  }

  /*
   * Add a moving box by its half extents. Returns its index, for
   * setMovingCentre. Unlike a static box this may be added after build(),
   * because it is not in the grid and nothing about it is frozen.
   */
  addMoving(kindName, hx, hy, hz) {
    const k = KINDS.indexOf(kindName);
    if (k < 0) {
      throw new Error(`collide: unknown kind ${kindName}`);
    }
    const i = this.movingCount;
    this.movingHx.push(hx);
    this.movingHy.push(hy);
    this.movingHz.push(hz);
    this.movingKind.push(k);
    this.movingCx.push(0);
    this.movingCy.push(0);
    this.movingCz.push(0);
    this.movingPx.push(0);
    this.movingPy.push(0);
    this.movingPz.push(0);
    this.movingCount = i + 1;
    return i;
  }

  /*
   * Where a moving box is NOW. The previous centre is kept because the query
   * is solved in the box's own frame: a train crossing the town at 23.5 m/s
   * covers 0.39 m per frame at 60 Hz and twelve metres per frame on this
   * container, so a test against the box at rest would let the train pass
   * clean through a hovering quad between two frames. Differencing the two
   * centres against the two ends of the craft's travel makes the sweep exact
   * for the relative motion, which is the only motion that can touch.
   */
  setMovingCentre(i, x, y, z) {
    this.movingPx[i] = this.movingCx[i];
    this.movingPy[i] = this.movingCy[i];
    this.movingPz[i] = this.movingCz[i];
    this.movingCx[i] = x;
    this.movingCy[i] = y;
    this.movingCz[i] = z;
    return this;
  }

  /* Seat a moving box with no motion, so its first query cannot see a jump
   * from the origin as a frame of travel. */
  seatMoving(i, x, y, z) {
    this.movingCx[i] = x;
    this.movingCy[i] = y;
    this.movingCz[i] = z;
    this.movingPx[i] = x;
    this.movingPy[i] = y;
    this.movingPz[i] = z;
    return this;
  }

  /*
   * Add one capsule. kindName must be one of KINDS. A sphere is the same
   * call with a === b.
   */
  add(kindName, ax, ay, az, bx, by, bz, r) {
    const k = KINDS.indexOf(kindName);
    if (k < 0) {
      throw new Error(`collide: unknown kind ${kindName}`);
    }
    this.ax.push(ax);
    this.ay.push(ay);
    this.az.push(az);
    this.bx.push(bx);
    this.by.push(by);
    this.bz.push(bz);
    this.r.push(r);
    this.kind.push(k);
    this.box.push(0);
    if (r > this.maxR) {
      this.maxR = r;
    }
    return this;
  }

  /* A vertical capsule from y0 to y1 at (x, z): a trunk, a post, a leg. */
  addPost(kindName, x, z, y0, y1, r) {
    return this.add(kindName, x, y0, z, x, y1, z, r);
  }

  /* A sphere: a canopy blob, a rock. */
  addSphere(kindName, x, y, z, r) {
    return this.add(kindName, x, y, z, x, y, z, r);
  }

  /*
   * One axis aligned box, given as two opposite corners. Returns its index,
   * because the level crossing needs to raise and lower two of them.
   *
   * A BOX CONTRIBUTES NOTHING TO maxR, and that is load bearing rather than
   * incidental. hit() pads every broadphase query by CRAFT_WORLD_R + maxR so that a
   * fat capsule whose centre is outside the scanned cells is still found. A
   * box is registered in the grid over its OWN footprint, every cell of it,
   * so a query padded by CRAFT_WORLD_R alone already finds any box within reach.
   * Giving a box a radius equal to its half diagonal would be the natural
   * looking thing to do and would push maxR from the race field's 16 m cliff
   * tier to whatever the city's longest wall is, which would make every
   * frame's query scan a neighbourhood tens of metres across for nothing. So
   * a box carries r = 0 and the padding stays honest.
   */
  addBox(kindName, x0, y0, z0, x1, y1, z1) {
    const k = KINDS.indexOf(kindName);
    if (k < 0) {
      throw new Error(`collide: unknown kind ${kindName}`);
    }
    const i = this.ax.length;
    this.ax.push(Math.min(x0, x1));
    this.ay.push(Math.min(y0, y1));
    this.az.push(Math.min(z0, z1));
    this.bx.push(Math.max(x0, x1));
    this.by.push(Math.max(y0, y1));
    this.bz.push(Math.max(z0, z1));
    this.r.push(0);
    this.kind.push(k);
    this.box.push(1);
    return i;
  }

  /*
   * Move one box's vertical extent after build(). The broadphase grid is
   * indexed on x and z only, so changing a y extent cannot invalidate it,
   * which is exactly why the level crossing's booms can be a static collider
   * that raises and lowers rather than a second dynamic collision path.
   * Anything that changed a footprint would have to rebuild, and nothing
   * does.
   *
   * Both ends move through this one method BECAUSE the box distance solver
   * assumes lo <= hi on every axis and an inverted box is a silent wrong
   * answer: every query against it just misses, which for a crossing boom
   * means a barrier a quad flies through. The invariant used to be
   * maintained by convention across two files, with animation.js writing
   * fay directly; now the only path is guarded and a violation throws.
   */
  setBoxExtentY(index, y0, y1) {
    if (!this.built) {
      throw new Error('collide: setBoxExtentY before build');
    }
    if (!this.fbox[index]) {
      throw new Error(`collide: collider ${index} is not a box`);
    }
    if (!(y0 <= y1)) {
      throw new Error(`collide: inverted box extent ${y0} > ${y1} on collider ${index}`);
    }
    this.fay[index] = y0;
    this.fby[index] = y1;
    return this;
  }

  /* Move only the top. Guarded by the same invariant. */
  setBoxTop(index, top) {
    if (!this.built) {
      throw new Error('collide: setBoxTop before build');
    }
    if (!this.fbox[index]) {
      throw new Error(`collide: collider ${index} is not a box`);
    }
    if (!(this.fay[index] <= top)) {
      throw new Error(`collide: setBoxTop ${top} below bottom ${this.fay[index]} on collider ${index}`);
    }
    this.fby[index] = top;
    return this;
  }

  /*
   * Freeze into flat arrays and build the grid. Called once, after every
   * add. Everything the per frame path touches is allocated here.
   */
  build() {
    const n = this.ax.length;
    const f = (arr) => {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i += 1) {
        out[i] = arr[i];
      }
      return out;
    };
    this.fax = f(this.ax);
    this.fay = f(this.ay);
    this.faz = f(this.az);
    this.fbx = f(this.bx);
    this.fby = f(this.by);
    this.fbz = f(this.bz);
    this.fr = f(this.r);
    this.fkind = new Int32Array(n);
    this.fbox = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      this.fkind[i] = this.kind[i];
      this.fbox[i] = this.box[i];
    }
    /* Breakpoint scratch for the exact segment to box distance. Six axis
     * crossings plus the two segment ends, allocated once because hit() runs
     * every frame and P8 forbids an allocation there. */
    this.tBreaks = new Float64Array(8);

    /* Two passes so each cell's Int32Array is exactly the right length: a
     * per cell push array would be thousands of small allocations and would
     * leave the grid full of holes. */
    const counts = new Map();
    const cellOf = (v) => Math.floor(v / CELL);
    const key = (cx, cz) => (cx + GRID_HALF) * GRID_SPAN + (cz + GRID_HALF);
    for (let i = 0; i < n; i += 1) {
      const rr = this.fr[i];
      const x0 = cellOf(Math.min(this.fax[i], this.fbx[i]) - rr);
      const x1 = cellOf(Math.max(this.fax[i], this.fbx[i]) + rr);
      const z0 = cellOf(Math.min(this.faz[i], this.fbz[i]) - rr);
      const z1 = cellOf(Math.max(this.faz[i], this.fbz[i]) + rr);
      for (let cx = x0; cx <= x1; cx += 1) {
        for (let cz = z0; cz <= z1; cz += 1) {
          const k = key(cx, cz);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
    }
    const grid = new Map();
    for (const [k, c] of counts) {
      grid.set(k, new Int32Array(c));
    }
    const fill = new Map();
    for (let i = 0; i < n; i += 1) {
      const rr = this.fr[i];
      const x0 = cellOf(Math.min(this.fax[i], this.fbx[i]) - rr);
      const x1 = cellOf(Math.max(this.fax[i], this.fbx[i]) + rr);
      const z0 = cellOf(Math.min(this.faz[i], this.fbz[i]) - rr);
      const z1 = cellOf(Math.max(this.faz[i], this.fbz[i]) + rr);
      for (let cx = x0; cx <= x1; cx += 1) {
        for (let cz = z0; cz <= z1; cz += 1) {
          const k = key(cx, cz);
          const at = fill.get(k) ?? 0;
          grid.get(k)[at] = i;
          fill.set(k, at + 1);
        }
      }
    }
    this.grid = grid;
    this.stamp = new Int32Array(n);
    this.count = n;
    this.built = true;
    /* The construction arrays are dead now and they are the larger copy. */
    this.ax = null;
    this.ay = null;
    this.az = null;
    this.bx = null;
    this.by = null;
    this.bz = null;
    this.r = null;
    this.box = null;
    return this;
  }

  /*
   * Earliest parameter t in [0, 1] at which the ELLIPSOID with horizontal
   * semi-axis rx and vertical semi-axis ry, centred on the travel segment
   * p + t*d, touches box i, or -1 if it never does. rx = ry is the swept
   * sphere as a special case.
   *
   * NOT SAMPLED, for the same reason the capsule test is not, and EXACT for
   * the ellipsoid: per axis the distance outside the slab is
   *
   *     g(t) = max( lo - p(t), 0, p(t) - hi )
   *
   * piecewise linear with at most two breakpoints, and the ellipsoid touches
   * the box exactly when sum over axes of (g_axis / r_axis)^2 <= 1, which is
   * the same piecewise quadratic walk with each axis's contribution divided
   * by its semi-axis. Collect the breakpoints, sort them, and walk the
   * pieces IN ASCENDING t: the first piece whose start is already inside
   * gives its start, and the first piece whose quadratic dips inside gives
   * the earlier of its two roots. Seven pieces at the very worst, closed
   * form on each, and because the walk is in travel order the answer is the
   * first contact along the travel, not the closest approach.
   *
   * The alternative that suggests itself, testing the segment against the box
   * grown by the craft radius, is WRONG at a corner: the Minkowski sum of a
   * box and a sphere has rounded edges, so the grown box overstates the
   * reach by up to (sqrt(3) - 1) * CRAFT_WORLD_R, which is 0.102 m on a 0.1388 m
   * craft. That is a crash reported for a corner the pilot can see they
   * missed. It is used here only as a rejection test, where overstating is
   * safe.
   */
  boxEarliestT(i, px, py, pz, dx, dy, dz, rx, ry, rz) {
    return this.boxSlabWalk(
      this.fax[i], this.fay[i], this.faz[i],
      this.fbx[i], this.fby[i], this.fbz[i],
      px, py, pz, dx, dy, dz, rx, ry, rz,
    );
  }

  /* The same walk against extents passed in, so a MOVING box can use it
   * without living in the static arrays the broadphase grid indexes. */
  boxSlabWalk(lo0, lo1, lo2, hi0, hi1, hi2, px, py, pz, dx, dy, dz, rx, ry, rz) {
    const t = this.tBreaks;
    let n = 0;
    t[n] = 0; n += 1;
    t[n] = 1; n += 1;
    for (let axis = 0; axis < 3; axis += 1) {
      const d = axis === 0 ? dx : axis === 1 ? dy : dz;
      if (d === 0) {
        continue;
      }
      const p = axis === 0 ? px : axis === 1 ? py : pz;
      const lo = axis === 0 ? lo0 : axis === 1 ? lo1 : lo2;
      const hi = axis === 0 ? hi0 : axis === 1 ? hi1 : hi2;
      const ta = (lo - p) / d;
      if (ta > 0 && ta < 1) {
        t[n] = ta; n += 1;
      }
      const tb = (hi - p) / d;
      if (tb > 0 && tb < 1) {
        t[n] = tb; n += 1;
      }
    }
    /* Insertion sort over at most eight values, in place, no allocation. */
    for (let a = 1; a < n; a += 1) {
      const v = t[a];
      let b = a - 1;
      while (b >= 0 && t[b] > v) {
        t[b + 1] = t[b];
        b -= 1;
      }
      t[b + 1] = v;
    }

    for (let piece = 0; piece + 1 < n; piece += 1) {
      const t0 = t[piece];
      const t1 = t[piece + 1];
      if (t1 <= t0) {
        continue;
      }
      /* Which side of each slab this piece is on is constant across it, so
       * one probe at the midpoint settles all three branches. */
      const tm = (t0 + t1) * 0.5;
      let qa = 0;
      let qb = 0;
      let qc = 0;
      for (let axis = 0; axis < 3; axis += 1) {
        const p = axis === 0 ? px : axis === 1 ? py : pz;
        const d = axis === 0 ? dx : axis === 1 ? dy : dz;
        const lo = axis === 0 ? lo0 : axis === 1 ? lo1 : lo2;
        const hi = axis === 0 ? hi0 : axis === 1 ? hi1 : hi2;
        const r = axis === 0 ? rx : axis === 1 ? ry : rz;
        const m = p + d * tm;
        let A = 0;
        let B = 0;
        if (m < lo) {
          A = (lo - p) / r;
          B = -d / r;
        } else if (m > hi) {
          A = (p - hi) / r;
          B = d / r;
        } else {
          continue;
        }
        qa += B * B;
        qb += 2 * A * B;
        qc += A * A;
      }
      /* f(t) = qa*t^2 + qb*t + qc on [t0, t1], contact at f <= 1. Already
       * inside at the piece start means contact at or before t0; the walk is
       * ascending, so t0 is the earliest this query can resolve and it is
       * exact at t0 = 0, the start-inside case. */
      const f0 = qa * t0 * t0 + qb * t0 + qc;
      if (f0 <= 1) {
        return t0;
      }
      if (qa > 0) {
        const disc = qb * qb - 4 * qa * (qc - 1);
        if (disc >= 0) {
          const root = (-qb - Math.sqrt(disc)) / (2 * qa);
          if (root >= t0 && root <= t1) {
            return root;
          }
        }
      } else if (qb < 0) {
        /* Defensive, and the algebra says it cannot be reached: getting here
       * needs qa === 0 with qb < 0, and qa is a sum of squares that is zero
       * only for a zero length segment, which the caller has already dealt
       * with. Kept rather than deleted so a future change to the quadratic
       * above does not silently lose the linear case, but do not go hunting
       * for the input that runs it. */
        const root = (1 - qc) / qb;
        if (root >= t0 && root <= t1) {
          return root;
        }
      }
    }
    return -1;
  }

  /*
   * Earliest parameter t in [0, 1] at which the travel segment p + t*d comes
   * within reach of capsule i, or -1. Closed form: a capsule is exactly the
   * union of two full cap spheres and a finite cylinder, and the first
   * contact with a union is the earliest of the first contacts with its
   * parts. Each part is a quadratic in t; the finite cylinder additionally
   * intersects its radial-contact interval with the interval where the
   * contact point's axial projection lies on the segment, both closed form.
   * A contact that is already true at t = 0 returns 0.
   */
  capsuleEarliestT(i, px, py, pz, dx, dy, dz, a, reachSq) {
    const ex = this.fbx[i] - this.fax[i];
    const ey = this.fby[i] - this.fay[i];
    const ez = this.fbz[i] - this.faz[i];
    const mx = px - this.fax[i];
    const my = py - this.fay[i];
    const mz = pz - this.faz[i];
    const ee = ex * ex + ey * ey + ez * ez;

    /* Start-inside: distance from p to the axis segment at t = 0. */
    {
      let u = 0;
      if (ee > 1e-12) {
        u = (ex * mx + ey * my + ez * mz) / ee;
        u = clamp01(u);
      }
      const gx = mx - ex * u;
      const gy = my - ey * u;
      const gz = mz - ez * u;
      if (gx * gx + gy * gy + gz * gz <= reachSq) {
        return 0;
      }
    }
    if (a <= 1e-12) {
      return -1;
    }

    let best = -1;

    /* Cap spheres at both ends: |m' + t d|^2 = reachSq, m' measured from the
     * cap centre. end 0 is fa, end 1 is fb. */
    for (let end = 0; end < 2; end += 1) {
      const cx = end === 0 ? mx : px - this.fbx[i];
      const cy = end === 0 ? my : py - this.fby[i];
      const cz = end === 0 ? mz : pz - this.fbz[i];
      const qb = 2 * (dx * cx + dy * cy + dz * cz);
      const qc = cx * cx + cy * cy + cz * cz - reachSq;
      const disc = qb * qb - 4 * a * qc;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        let tEnter = (-qb - sq) / (2 * a);
        const tExit = (-qb + sq) / (2 * a);
        if (tEnter < 0) {
          tEnter = 0;
        }
        if (tEnter <= 1 && tEnter <= tExit && (best < 0 || tEnter < best)) {
          best = tEnter;
        }
      }
    }

    /* Finite cylinder, only for a real segment. Radial contact:
     * |(m + t d) x e|^2 = reachSq * ee, quadratic in t. Axial validity:
     * u(t) = e . (m + t d) in [0, ee], linear in t. */
    if (ee > 1e-12) {
      const c0x = my * ez - mz * ey;
      const c0y = mz * ex - mx * ez;
      const c0z = mx * ey - my * ex;
      const c1x = dy * ez - dz * ey;
      const c1y = dz * ex - dx * ez;
      const c1z = dx * ey - dy * ex;
      const qa = c1x * c1x + c1y * c1y + c1z * c1z;
      const qb = 2 * (c0x * c1x + c0y * c1y + c0z * c1z);
      const qc = c0x * c0x + c0y * c0y + c0z * c0z - reachSq * ee;
      const em = ex * mx + ey * my + ez * mz;
      const ed = ex * dx + ey * dy + ez * dz;
      let r0 = -Infinity;
      let r1 = Infinity;
      let radialOk = true;
      if (qa > 1e-12) {
        const disc = qb * qb - 4 * qa * qc;
        if (disc < 0) {
          radialOk = false;
        } else {
          const sq = Math.sqrt(disc);
          r0 = (-qb - sq) / (2 * qa);
          r1 = (-qb + sq) / (2 * qa);
        }
      } else if (qc > 0) {
        /* Travel parallel to the axis and outside the radius: the side of
         * the cylinder is never touched, only the caps can be. */
        radialOk = false;
      }
      if (radialOk) {
        let u0 = -Infinity;
        let u1 = Infinity;
        let axialOk = true;
        if (ed > 1e-12 || ed < -1e-12) {
          const ta = (0 - em) / ed;
          const tb = (ee - em) / ed;
          u0 = ta < tb ? ta : tb;
          u1 = ta < tb ? tb : ta;
        } else if (em < 0 || em > ee) {
          axialOk = false;
        }
        if (axialOk) {
          let tEnter = r0 > u0 ? r0 : u0;
          const tExit = (r1 < u1 ? r1 : u1) < 1 ? (r1 < u1 ? r1 : u1) : 1;
          if (tEnter < 0) {
            tEnter = 0;
          }
          if (tEnter <= tExit && tEnter <= 1 && (best < 0 || tEnter < best)) {
            best = tEnter;
          }
        }
      }
    }
    return best;
  }

  /*
   * The travel parameter s in [0, 1] at which the segment p + s*d comes
   * closest to capsule i's axis segment. The classical closest pair of two
   * segments, closed form. Used to pick the direction for the ellipsoid
   * support refinement.
   */
  closestApproachS(i, px, py, pz, d1x, d1y, d1z, a) {
    const d2x = this.fbx[i] - this.fax[i];
    const d2y = this.fby[i] - this.fay[i];
    const d2z = this.fbz[i] - this.faz[i];
    const rx = px - this.fax[i];
    const ry = py - this.fay[i];
    const rz = pz - this.faz[i];
    const e = d2x * d2x + d2y * d2y + d2z * d2z;
    const fdot = d2x * rx + d2y * ry + d2z * rz;
    const c = d1x * rx + d1y * ry + d1z * rz;
    let s = 0;
    if (a <= 1e-12) {
      return 0;
    }
    if (e <= 1e-12) {
      return clamp01(-c / a);
    }
    const b = d1x * d2x + d1y * d2y + d1z * d2z;
    const denom = a * e - b * b;
    s = denom !== 0 ? clamp01((b * fdot - c * e) / denom) : 0;
    let t = (b * s + fdot) / e;
    if (t < 0) {
      s = clamp01(-c / a);
    } else if (t > 1) {
      s = clamp01((b - c) / a);
    }
    return s;
  }

  /*
   * Compute the vector from capsule i's axis to the point (cx, cy, cz),
   * into this.nx/ny/nz. This is the contact normal direction when the point
   * is a contact. Allocation free; scalar fields, not an object.
   */
  axisToPoint(i, cx, cy, cz) {
    const ex = this.fbx[i] - this.fax[i];
    const ey = this.fby[i] - this.fay[i];
    const ez = this.fbz[i] - this.faz[i];
    const ee = ex * ex + ey * ey + ez * ez;
    const mx = cx - this.fax[i];
    const my = cy - this.fay[i];
    const mz = cz - this.faz[i];
    let u = 0;
    if (ee > 1e-12) {
      u = clamp01((ex * mx + ey * my + ez * mz) / ee);
    }
    this.nx = mx - ex * u;
    this.ny = my - ey * u;
    this.nz = mz - ez * u;
  }

  /*
   * Write hitNx/hitNy/hitNz as a unit vector pointing out of the obstacle,
   * and hitNormalDot as the absolute cosine against travel (d1x,d1y,d1z).
   * A degenerate normal falls back to -travel so a bounce still has a
   * direction. Allocation free.
   */
  finishHitNormal(nx, ny, nz, d1x, d1y, d1z) {
    let nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const tl = Math.sqrt(d1x * d1x + d1y * d1y + d1z * d1z);
    if (nl <= 1e-9) {
      if (tl <= 1e-9) {
        this.hitNx = 0;
        this.hitNy = 1;
        this.hitNz = 0;
        this.hitNormalDot = 1;
        return;
      }
      nx = -d1x;
      ny = -d1y;
      nz = -d1z;
      nl = tl;
    }
    const inv = 1 / nl;
    nx *= inv;
    ny *= inv;
    nz *= inv;
    if (tl > 1e-9) {
      const along = d1x * nx + d1y * ny + d1z * nz;
      this.hitNormalDot = along < 0 ? -along / tl : along / tl;
      /* A buried centre already has an outward nearest-face. Flipping that
       * to oppose travel pushes the hull deeper and is the pose glitch. */
      if (along > 0 && this.hitPen <= 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
    } else {
      this.hitNormalDot = 1;
    }
    this.hitNx = nx;
    this.hitNy = ny;
    this.hitNz = nz;
  }

  /*
   * Did the craft, travelling from p to q, touch anything? The craft is the
   * four prop discs at the motors: horizontally an X that yaws with the
   * airframe, vertically vh through the body. aqX..aqW is that attitude in
   * world space (Three.js Y-up). Omit it and the query is an identity-yaw
   * pancake, 0.141 m to a wall the quad meets square-on. CRAFT_WORLD_R stays
   * the published swept diagonal; check 15 reads that, not this shape.
   *
   * Exact for boxes (the slab walk is weighted per axis). For capsules the
   * first pass sweeps the conservative CRAFT_WORLD_R sphere, then the reach is
   * re-solved once with the four-disc support along the contact
   * direction, which is exact when the contact direction at the refined
   * parameter matches the first pass and a few millimetres conservative
   * when it rotates between the two, measured in the fuzz harness.
   *
   * Every candidate in the padded cell range is tested and the one with the
   * smallest contact parameter wins. It used to return the first collider
   * found in GRID SCAN ORDER, which meant that when two solid things sat in
   * one frame's travel, the reported one was whichever cell the broadphase
   * happened to reach first: a gate upright clipped at t = 0.85 could
   * swallow a tree hit at t = 0.15, and since graze against crash is
   * decided from the reported collider's kind and normal, the craft flew on
   * through the tree.
   */
  hit(px, py, pz, qx, qy, qz, vh = CRAFT_WORLD_R, aqX = 0, aqY = 0, aqZ = 0, aqW = 1) {
    this.hitIndex = -1;
    this.hitKind = -1;
    this.hitNormalDot = 0;
    this.hitT = -1;
    this.hitNx = 0;
    this.hitNy = 0;
    this.hitNz = 0;
    this.hitPen = 0;
    this.hitMoving = -1;
    if (!this.built) {
      return -1;
    }
    this.queryId += 1;
    const id = this.queryId;
    const pad = CRAFT_WORLD_R + this.maxR;
    const cx0 = Math.floor((Math.min(px, qx) - pad) / CELL);
    const cx1 = Math.floor((Math.max(px, qx) + pad) / CELL);
    const cz0 = Math.floor((Math.min(pz, qz) - pad) / CELL);
    const cz1 = Math.floor((Math.max(pz, qz) + pad) / CELL);
    let candidates = 0;

    /* The travel segment, as d1 = q - p. */
    const d1x = qx - px;
    const d1y = qy - py;
    const d1z = qz - pz;
    const a = d1x * d1x + d1y * d1y + d1z * d1z;

    /* Body axes from the world quaternion. Identity is a level quad
     * pointing world -Z, motors on the diagonals of XZ. */
    const qxx = aqX * aqX;
    const qyy = aqY * aqY;
    const qzz = aqZ * aqZ;
    const qxy = aqX * aqY;
    const qxz = aqX * aqZ;
    const qyz = aqY * aqZ;
    const qwx = aqW * aqX;
    const qwy = aqW * aqY;
    const qwz = aqW * aqZ;
    const exx = 1 - 2 * (qyy + qzz);
    const exy = 2 * (qxy + qwz);
    const exz = 2 * (qxz - qwy);
    const ux = 2 * (qxy - qwz);
    const uy = 1 - 2 * (qxx + qzz);
    const uz = 2 * (qyz + qwx);
    const ezx = 2 * (qxz + qwy);
    const ezy = 2 * (qyz - qwx);
    const ezz = 1 - 2 * (qxx + qyy);
    const crx = clampRadius(discSupport(1, 0, 0, exx, exy, exz, ezx, ezy, ezz, ux, uy, uz));
    const crz = clampRadius(discSupport(0, 0, 1, exx, exy, exz, ezx, ezy, ezz, ux, uy, uz));

    let bestT = Infinity;
    let bestI = -1;

    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cz = cz0; cz <= cz1; cz += 1) {
        const bucket = this.grid.get((cx + GRID_HALF) * GRID_SPAN + (cz + GRID_HALF));
        if (bucket === undefined) {
          continue;
        }
        for (let bi = 0; bi < bucket.length; bi += 1) {
          const i = bucket[bi];
          if (this.stamp[i] === id) {
            continue;
          }
          this.stamp[i] = id;
          candidates += 1;

          if (this.fbox[i]) {
            /* Cheap rejection first: the segment against the box grown by
             * CRAFT_WORLD_R. The grown box contains the true Minkowski sum of
             * the box and the ellipsoid (vh <= CRAFT_WORLD_R), so a miss here is a
             * real miss and the exact test never runs for the thousands of
             * walls a city query sweeps past. */
            const gx0 = this.fax[i] - CRAFT_WORLD_R;
            const gy0 = this.fay[i] - CRAFT_WORLD_R;
            const gz0 = this.faz[i] - CRAFT_WORLD_R;
            const gx1 = this.fbx[i] + CRAFT_WORLD_R;
            const gy1 = this.fby[i] + CRAFT_WORLD_R;
            const gz1 = this.fbz[i] + CRAFT_WORLD_R;
            if (
              (px < gx0 && qx < gx0) || (px > gx1 && qx > gx1) ||
              (py < gy0 && qy < gy0) || (py > gy1 && qy > gy1) ||
              (pz < gz0 && qz < gz0) || (pz > gz1 && qz > gz1)
            ) {
              continue;
            }
            const t = this.boxEarliestT(i, px, py, pz, d1x, d1y, d1z, crx, vh, crz);
            if (t >= 0 && t < bestT) {
              bestT = t;
              bestI = i;
            }
          } else {
            const reach = this.fr[i] + CRAFT_WORLD_R;
            let t = this.capsuleEarliestT(i, px, py, pz, d1x, d1y, d1z, a, reach * reach);
            if (t >= 0) {
              /*
               * Support refinement: the conservative sphere touched; ask
               * whether the X does. Closest approach, not first sphere
               * contact: passing level under a tube, the sphere first
               * touches while the approach is still mostly horizontal.
               * Four-disc support along that direction, and vh when the
               * contact is more vertical than the X is thick.
               */
              const sCA = this.closestApproachS(i, px, py, pz, d1x, d1y, d1z, a);
              this.axisToPoint(i, px + d1x * sCA, py + d1y * sCA, pz + d1z * sCA);
              const nx = this.nx;
              const ny = this.ny;
              const nz = this.nz;
              const nl2 = nx * nx + ny * ny + nz * nz;
              if (nl2 > 1e-18) {
                let cr = discSupport(nx, ny, nz, exx, exy, exz, ezx, ezy, ezz, ux, uy, uz);
                const nyAbs = Math.abs(ny) / Math.sqrt(nl2);
                if (vh * nyAbs > cr) {
                  cr = vh * nyAbs;
                }
                if (cr > CRAFT_WORLD_R) {
                  cr = CRAFT_WORLD_R;
                }
                const reach2 = this.fr[i] + cr;
                if (reach2 < reach - 1e-9) {
                  t = this.capsuleEarliestT(i, px, py, pz, d1x, d1y, d1z, a, reach2 * reach2);
                }
              }
            }
            if (t >= 0 && t < bestT) {
              bestT = t;
              bestI = i;
            }
          }
        }
      }
    }

    /*
     * The moving boxes, in each one's OWN frame. Subtracting the box's
     * previous centre from the start of the travel and its current centre
     * from the end turns "a box moving past a moving craft" into "a static
     * box at the origin and a craft travelling the relative path", which the
     * same slab walk answers exactly. bestMoving is kept separate from bestI
     * so the static branch below can stay exactly as it was.
     */
    let bestMoving = -1;
    for (let i = 0; i < this.movingCount; i += 1) {
      const hx = this.movingHx[i];
      const hy = this.movingHy[i];
      const hz = this.movingHz[i];
      const rpx = px - this.movingPx[i];
      const rpy = py - this.movingPy[i];
      const rpz = pz - this.movingPz[i];
      const rqx = qx - this.movingCx[i];
      const rqy = qy - this.movingCy[i];
      const rqz = qz - this.movingCz[i];
      const t = this.boxSlabWalk(
        -hx, -hy, -hz, hx, hy, hz,
        rpx, rpy, rpz,
        rqx - rpx, rqy - rpy, rqz - rpz,
        crx, vh, crz,
      );
      if (t >= 0 && t < bestT) {
        bestT = t;
        bestMoving = i;
        bestI = -1;
      }
    }

    this.lastCandidates = candidates;
    this.queries += 1;
    this.candidateTotal += candidates;
    if (bestMoving >= 0) {
      /* Contact normal in the box's frame, which is the same direction in
       * world space because a moving box is axis aligned and never rotates. */
      const hx = this.movingHx[bestMoving];
      const hy = this.movingHy[bestMoving];
      const hz = this.movingHz[bestMoving];
      const rpx = px - this.movingPx[bestMoving];
      const rpy = py - this.movingPy[bestMoving];
      const rpz = pz - this.movingPz[bestMoving];
      const rdx = (qx - this.movingCx[bestMoving]) - rpx;
      const rdy = (qy - this.movingCy[bestMoving]) - rpy;
      const rdz = (qz - this.movingCz[bestMoving]) - rpz;
      const cxp = rpx + rdx * bestT;
      const cyp = rpy + rdy * bestT;
      const czp = rpz + rdz * bestT;
      const nx = cxp < -hx ? cxp + hx : cxp > hx ? cxp - hx : 0;
      const ny = cyp < -hy ? cyp + hy : cyp > hy ? cyp - hy : 0;
      const nz = czp < -hz ? czp + hz : czp > hz ? czp - hz : 0;
      this.hitIndex = -1;
      this.hitKind = this.movingKind[bestMoving];
      this.hitT = bestT;
      this.hitMoving = bestMoving;
      this.finishHitNormal(nx, ny, nz, rdx, rdy, rdz);
      return this.hitKind;
    }
    if (bestI < 0) {
      return -1;
    }

    this.hitIndex = bestI;
    this.hitKind = this.fkind[bestI];
    this.hitT = bestT;
    this.hitMoving = -1;
    /* Contact normal at the earliest contact point. For a box it is the per
     * axis overhang; for a capsule it is the vector from the axis's closest
     * point to the contact point. A degenerate zero length contact counts as
     * head on, so it can never soften a real crash.
     *
     * INSIDE A BOX the overhang is zero on every axis, and the old path
     * fell back to -travel plus 8 mm of gap. That does not exit a tree
     * hull the craft has already tunneled into, so the next frame is
     * still inside, the fallback normal flips, and the pose glitches.
     * Nearest-face plus the ellipsoid semi-axis is the actual way out,
     * reported as hitPen so the host can depenetrate in one step. */
    const cxp = px + d1x * bestT;
    const cyp = py + d1y * bestT;
    const czp = pz + d1z * bestT;
    let nx;
    let ny;
    let nz;
    this.hitPen = 0;
    if (this.fbox[bestI]) {
      nx = cxp < this.fax[bestI] ? cxp - this.fax[bestI] : cxp > this.fbx[bestI] ? cxp - this.fbx[bestI] : 0;
      ny = cyp < this.fay[bestI] ? cyp - this.fay[bestI] : cyp > this.fby[bestI] ? cyp - this.fby[bestI] : 0;
      nz = czp < this.faz[bestI] ? czp - this.faz[bestI] : czp > this.fbz[bestI] ? czp - this.fbz[bestI] : 0;
      if (nx === 0 && ny === 0 && nz === 0) {
        const dx0 = cxp - this.fax[bestI];
        const dx1 = this.fbx[bestI] - cxp;
        const dy0 = cyp - this.fay[bestI];
        const dy1 = this.fby[bestI] - cyp;
        const dz0 = czp - this.faz[bestI];
        const dz1 = this.fbz[bestI] - czp;
        let best = dx0;
        nx = -1;
        ny = 0;
        nz = 0;
        let rAxis = crx;
        if (dx1 < best) {
          best = dx1;
          nx = 1;
          ny = 0;
          nz = 0;
          rAxis = crx;
        }
        if (dy0 < best) {
          best = dy0;
          nx = 0;
          ny = -1;
          nz = 0;
          rAxis = vh;
        }
        if (dy1 < best) {
          best = dy1;
          nx = 0;
          ny = 1;
          nz = 0;
          rAxis = vh;
        }
        if (dz0 < best) {
          best = dz0;
          nx = 0;
          ny = 0;
          nz = -1;
          rAxis = crz;
        }
        if (dz1 < best) {
          best = dz1;
          nx = 0;
          ny = 0;
          nz = 1;
          rAxis = crz;
        }
        this.hitPen = best + rAxis;
        if (this.hitPen > 8) {
          this.hitPen = 8;
        }
      }
    } else {
      this.axisToPoint(bestI, cxp, cyp, czp);
      nx = this.nx;
      ny = this.ny;
      nz = this.nz;
      const dist = Math.sqrt(nx * nx + ny * ny + nz * nz);
      let cr = discSupport(nx, ny, nz, exx, exy, exz, ezx, ezy, ezz, ux, uy, uz);
      const nyAbs = dist > 1e-18 ? Math.abs(ny) / dist : 1;
      if (vh * nyAbs > cr) {
        cr = vh * nyAbs;
      }
      if (cr > CRAFT_WORLD_R) {
        cr = CRAFT_WORLD_R;
      }
      const reach = this.fr[bestI] + cr;
      if (dist < reach) {
        this.hitPen = reach - dist;
        if (this.hitPen > 8) {
          this.hitPen = 8;
        }
      }
    }
    this.finishHitNormal(nx, ny, nz, d1x, d1y, d1z);
    return this.hitKind;
  }

  /*
   * Signed depth of (x, y, z) into collider i. Positive means the POINT,
   * not the hull, is inside the solid. A surface bounce has the craft
   * centre outside (negative or zero) even while the props overlap.
   */
  interiorAt(i, x, y, z) {
    if (!this.built || i < 0 || i >= this.count) {
      return 0;
    }
    if (this.fbox[i]) {
      return boxPointInterior(
        this.fax[i], this.fay[i], this.faz[i],
        this.fbx[i], this.fby[i], this.fbz[i],
        x, y, z,
      );
    }
    this.axisToPoint(i, x, y, z);
    const d = Math.sqrt(this.nx * this.nx + this.ny * this.ny + this.nz * this.nz);
    return this.fr[i] - d;
  }

  /* Same number for whatever hit() last reported, static or moving. */
  interiorOfHit(x, y, z) {
    if (this.hitMoving >= 0) {
      const i = this.hitMoving;
      return boxPointInterior(
        this.movingCx[i] - this.movingHx[i],
        this.movingCy[i] - this.movingHy[i],
        this.movingCz[i] - this.movingHz[i],
        this.movingCx[i] + this.movingHx[i],
        this.movingCy[i] + this.movingHy[i],
        this.movingCz[i] + this.movingHz[i],
        x, y, z,
      );
    }
    if (this.hitIndex < 0) {
      return 0;
    }
    return this.interiorAt(this.hitIndex, x, y, z);
  }

  /*
   * Did the segment from a to b go in one face and out the opposite?
   * A bounce from outside has both ends on the SAME side. Flying over
   * a wall, along it, or past a pole does not count: opposite-face
   * ends still have to actually hit the solid, because a long chord's
   * midpoint often misses a thin slab. Used after bounce: if the craft
   * is still on the far side, the eject went the wrong way.
   */
  crossedStatic(i, ax, ay, az, bx, by, bz) {
    if (!this.built || i < 0 || i >= this.count) {
      return false;
    }
    if (this.fbox[i]) {
      if (!boxOppositeSides(
        this.fax[i], this.fay[i], this.faz[i],
        this.fbx[i], this.fby[i], this.fbz[i],
        ax, ay, az, bx, by, bz,
      )) {
        return false;
      }
      return segmentHitsAabb(
        this.fax[i], this.fay[i], this.faz[i],
        this.fbx[i], this.fby[i], this.fbz[i],
        ax, ay, az, bx, by, bz,
      );
    }
    if (this.interiorAt(i, ax, ay, az) >= 0 || this.interiorAt(i, bx, by, bz) >= 0) {
      return false;
    }
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const a = dx * dx + dy * dy + dz * dz;
    if (a <= 1e-18) {
      return false;
    }
    const s = this.closestApproachS(i, ax, ay, az, dx, dy, dz, a);
    this.axisToPoint(i, ax + dx * s, ay + dy * s, az + dz * s);
    const d = Math.sqrt(this.nx * this.nx + this.ny * this.ny + this.nz * this.nz);
    return this.fr[i] - d > CLIP_CENTER_EPS;
  }

  crossedMoving(i, ax, ay, az, bx, by, bz) {
    if (i < 0 || i >= this.movingCount) {
      return false;
    }
    const x0 = this.movingCx[i] - this.movingHx[i];
    const y0 = this.movingCy[i] - this.movingHy[i];
    const z0 = this.movingCz[i] - this.movingHz[i];
    const x1 = this.movingCx[i] + this.movingHx[i];
    const y1 = this.movingCy[i] + this.movingHy[i];
    const z1 = this.movingCz[i] + this.movingHz[i];
    if (!boxOppositeSides(x0, y0, z0, x1, y1, z1, ax, ay, az, bx, by, bz)) {
      return false;
    }
    return segmentHitsAabb(x0, y0, z0, x1, y1, z1, ax, ay, az, bx, by, bz);
  }

  crossedHit(ax, ay, az, bx, by, bz) {
    if (this.hitMoving >= 0) {
      return this.crossedMoving(this.hitMoving, ax, ay, az, bx, by, bz);
    }
    return this.crossedStatic(this.hitIndex, ax, ay, az, bx, by, bz);
  }

  kindName(k) {
    return KINDS[k] ?? 'none';
  }

  /* Harness reporting. Not called per frame, so an object here is fine. */
  stats() {
    const byKind = {};
    for (const name of KINDS) {
      byKind[name] = 0;
    }
    if (this.fkind) {
      for (let i = 0; i < this.fkind.length; i += 1) {
        byKind[KINDS[this.fkind[i]]] += 1;
      }
    }
    let boxes = 0;
    if (this.fbox) {
      for (let i = 0; i < this.fbox.length; i += 1) {
        boxes += this.fbox[i];
      }
    }
    return {
      count: this.count ?? 0,
      byKind,
      boxes,
      capsules: (this.count ?? 0) - boxes,
      cellSize: CELL,
      cells: this.grid ? this.grid.size : 0,
      maxRadius: this.maxR,
      craftRadius: CRAFT_WORLD_R,
      moving: this.movingCount,
      queries: this.queries,
      meanCandidatesPerQuery: this.queries ? this.candidateTotal / this.queries : 0,
      lastCandidates: this.lastCandidates,
    };
  }
}

/*
 * Ground contact, and whether the craft can perch.
 *
 * The simulator has no ground plane of its own: the verification harness
 * measures free air behaviour, so a plant with a floor in it could not be
 * checked against terminal velocity or a step response. The ground lives
 * in the shell, which raises sim_set_ground; the plant then applies a
 * rigid-body contact against the airframe hull every 1 ms step.
 *
 * There is no crash lockout. A blade into the grass, a side arrival, a
 * wall tap: all of them bounce, slide or roll, and the pilot flies out.
 * The only special case is a PERCH: upright, slow, on the ground, which
 * is when the shell freezes the integrator so a takeoff starts from rest
 * rather than from leftover bounce. Everything else stays in the 1 kHz
 * loop, which is what lets a tumble become a turtle: inverted, seated
 * and still, the shell waits for a pitch or roll poke, then plays a
 * guaranteed flip back to upright.
 */
export const LAND_DESCENT_MAX = 4.0;    /* m/s downward, props up, perch envelope */
export const LAND_HORIZONTAL_MAX = 10.0; /* m/s, props up, historical skip gate */
export const LAND_TILT_MAX_DEG = 25;     /* where a blade first touches */
export const LAND_TILT_HARD_DEG = 50;    /* on its side, a roll not a perch */
export const LAND_TIP_SPEED_MAX = 3.0;

export const GROUND_TUMBLE = 0;
export const GROUND_LAND = 1;
export const GROUND_SLIDE = 2;
/* Aliases so a caller that still says CRASH or BOUNCE reads the new
 * meanings: a "crash" is a tumble you fly out of, a "bounce" is a slide. */
export const GROUND_CRASH = GROUND_TUMBLE;
export const GROUND_BOUNCE = GROUND_SLIDE;

/* Closing speed below which a touch is not announced on the OSD. */
export const GRAZE_SPEED_MAX = 4.0;
export const PROP_PLANE_MAX_UP_DOT = 0.5;
/* Historical strike speed. Hits above this used to wreck the craft; they
 * now tumble, and the number is only an OSD / audio threshold. */
export const BOUNCE_SPEED_MAX = 18.0;
export const BOUNCE_COOLDOWN_MS = 180;
export const BOUNCE_SEPARATION = 0.008;

/* Perch: freeze only when the hull is settled enough that a takeoff from
 * leftover bounce would be a lie. */
export const PERCH_SPEED = 2.0;   /* m/s, linear */
export const PERCH_RATE = 2.5;    /* rad/s */

/* Grass / dirt. Restitution is zero: a real 5 inch on turf is a dead
 * thump, not a bounce. Mu is high enough that a belly landing dumps
 * the slide in a few tens of centimetres; the plant also damps leftover
 * tangent speed once the hull is seated. A props-down arrival is a
 * full stop, not a slide. */
export const GROUND_MU = 1.40;
export const GROUND_E = 0.0;

/*
 * Obstacle materials. PVC, carbon, masonry, bark: enough difference that
 * a gate tap and a tree are not the same event, not a damage model.
 */
/*
 * These fell when the contact patch landed. They were set while every hit
 * solved as a corner strike, which threw most of the impulse into spin, so
 * the numbers had been walked up to get any push-off at all and were well
 * past what the materials do: carbon and nylon on masonry is nearer 0.15
 * than 0.32. Now that a flat contact spends its impulse on separation the
 * old values read as a trampoline. The ORDER is unchanged and is what the
 * self-test pins: PVC bounces more and grips less than bark, and a train
 * is the deadest thing in either world.
 */
export function contactMaterial(kindName) {
  if (kindName === 'train') {
    return { e: 0.06, mu: 0.40 };
  }
  if (kindName === 'gate' || kindName === 'pole') {
    return { e: 0.22, mu: 0.30 };
  }
  if (kindName === 'tree' || kindName === 'canopy') {
    return { e: 0.12, mu: 0.50 };
  }
  if (kindName === 'wall' || kindName === 'boom' || kindName === 'cliff' || kindName === 'rock') {
    return { e: 0.15, mu: 0.42 };
  }
  return { e: 0.15, mu: 0.40 };
}

/*
 * Classify an obstacle contact. Every hit is a bounce: there is no wreck.
 * 'hard' is an OSD / audio distinction, not a lockout.
 */
export function hitOutcome(kindName, closing, _upDot = 0) {
  if (kindName === 'train' || !(closing < BOUNCE_SPEED_MAX)) {
    return 'hard';
  }
  return 'bounce';
}

/*
 * A pass through a gate is a flown opening, not a tumble on the dirt
 * and not a clip through the terrain. Inverted in the air still scores
 * (people punch gates inverted). Inverted, a few centimetres off the
 * grass, or a belly slide through the hole, does not: that is the
 * crash that used to walk through the timing gate and throw the
 * results screen. A bounce can drop the plant hit flag for a frame,
 * so dirt is judged by clearance, not by hits or attitude.
 *
 * heightAt(x, z, y) is the surface under that sample, same contract as
 * view.height. margin is how far below that surface counts as buried.
 */
export const DIRT_UPZ = 0.50;
export const DIRT_CLEARANCE = 0.22;
export const BURIED_MARGIN = 0.10;

export function upsetOnDirt(upz, clearance, inContact) {
  /* A path this close to the dirt is a crash, not a flown opening.
   * Attitude and the plant hit flag are not required: a bounce can
   * drop hits for a frame, and an upright slide is the same class of
   * accident as an inverted one. upz is kept so callers and tests can
   * still name a tumble; the clearance band is the decision. */
  void upz;
  void inContact;
  return clearance < DIRT_CLEARANCE;
}

export function shouldScorePass(prev, curr, opts) {
  const heightAt = opts.heightAt;
  let minClear = opts.clearance;
  if (typeof heightAt === 'function') {
    const n = 5;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const x = prev.x + (curr.x - prev.x) * t;
      const y = prev.y + (curr.y - prev.y) * t;
      const z = prev.z + (curr.z - prev.z) * t;
      const hy = heightAt(x, z, y);
      const c = y - hy;
      if (c < minClear) {
        minClear = c;
      }
      if (y < hy - BURIED_MARGIN) {
        return false;
      }
    }
  }
  if (upsetOnDirt(opts.upz, minClear, opts.hits > 0)) {
    return false;
  }
  return true;
}

export function canPerch(tiltDeg, speed, rateMag) {
  if (tiltDeg > LAND_TILT_MAX_DEG) {
    return false;
  }
  if (speed > PERCH_SPEED) {
    return false;
  }
  if (rateMag > PERCH_RATE) {
    return false;
  }
  return true;
}

/*
 * Turtle is a shell recovery, not Betaflight crashflip. The mixer couple
 * fought the inverted bump and flickered. Any pitch or roll poke now
 * plays a fixed flip to heading-preserving upright. The plant does not
 * step during the wait or the flip.
 *
 * Enter only when truly inverted (body +z pointing down past about
 * 110 deg), seated on grass or a roof, and still. On-side is a tumble
 * you fly out of. An invert in the air is still flight. TURTLE_STICK_MIN
 * is a poke gate, not the mixer deadband: any throw past it starts the
 * flip, and the flip always finishes. TURTLE_LIFT is the extra centre
 * height at mid-flip so the arms and the lens stay above the surface.
 */
export const TURTLE_SPEED = 1.0;
export const TURTLE_RATE = 8.0;
export const TURTLE_CLEARANCE = 0.15;
export const TURTLE_EXIT_UPZ = 0.5;
export const TURTLE_INVERT_UPZ = -0.35;
export const TURTLE_STICK_MIN = 0.08;
export const TURTLE_WAIT_RATE = 1.0;
export const TURTLE_FLIP_MS = 380;
export const TURTLE_LIFT = 0.18;
export const SNAP_SPEED = TURTLE_SPEED;
export const SNAP_RATE = TURTLE_RATE;
export const SNAP_CLEARANCE = TURTLE_CLEARANCE;

export function shouldEnterTurtle(upz, speed, rateMag, inContact, clearance, skip) {
  if (skip) {
    return false;
  }
  /* Upside down, not on its side. A 60 deg bank is still flight. */
  if (!(upz < TURTLE_INVERT_UPZ)) {
    return false;
  }
  if (speed >= TURTLE_SPEED || rateMag >= TURTLE_RATE) {
    return false;
  }
  /* Contact, or seated within the clearance halo. Contact alone cannot
   * latch a settled turtle: the plant's inverted rest sits on the
   * contact slop with no impulse (ground_settle's seated_halo zeroes
   * velocity without a hit), so sim_ground_contacts() reads 0 for the
   * whole rest and a real crash never prompted. An invert in the air is
   * still flight: the speed gate has already refused anything that has
   * fallen more than a few centimetres, and TURTLE_CLEARANCE is
   * centimetres, not metres. */
  return inContact || clearance < TURTLE_CLEARANCE;
}

export function shouldSnapUpright(upz, speed, rateMag, inContact, clearance, skip) {
  return shouldEnterTurtle(upz, speed, rateMag, inContact, clearance, skip);
}

export function shouldExitTurtle(upz) {
  return upz > TURTLE_EXIT_UPZ;
}

export function shouldParkTurtle(waiting, stickMag, rateMag, inContact) {
  if (!waiting) {
    return false;
  }
  if (!inContact) {
    return false;
  }
  if (stickMag >= TURTLE_STICK_MIN) {
    return false;
  }
  if (rateMag >= TURTLE_WAIT_RATE) {
    return false;
  }
  return true;
}

export function turtleFlipEase(u) {
  if (u <= 0) {
    return 0;
  }
  if (u >= 1) {
    return 1;
  }
  return u * u * (3 - 2 * u);
}

export function turtleFlipLift(u) {
  if (u <= 0 || u >= 1) {
    return 0;
  }
  return 4 * u * (1 - u) * TURTLE_LIFT;
}

/*
 * Spherical interpolation without a single transcendental.
 *
 * This writes a plant pose through sim_set_pose, so it is in the physics
 * path, and CLAUDE.md is explicit that JS Math.sin, Math.cos and friends
 * may not be: they are not specified to bit precision and V8 and
 * SpiderMonkey disagree in the last places. The old body used Math.acos
 * and Math.sin, which is a determinism hole PROGRESS.md has carried as
 * known since the flip was written: a replay that spanned a turtle was
 * engine dependent. There is no sin or cos in the compiled libm to route
 * it through either, because the plant does not own one: sim_sqrt is the
 * whole of it.
 *
 * So do it with square roots. The square root of a unit quaternion is the
 * half rotation, and it is sqrt-only:
 *
 *   sqrt(q) = normalise(q.w + 1, q.x, q.y, q.z)
 *
 * Halve the relative rotation N times to get d^(1/2^N), and any dyadic
 * power d^(k/2^N) is the product of the halvings named by the set bits of
 * k. Quantising t onto that grid costs 1/1024 of the flip, which is a
 * third of a millisecond of a 380 ms animation, and buys an interpolation
 * that is bit-identical on every engine.
 *
 * It is a real slerp, not an nlerp standing in for one: constant angular
 * velocity, so the flip does not rush its own middle.
 */
const SLERP_BITS = 10;

export function turtleSlerpQuat(aw, ax, ay, az, bw, bx, by, bz, t, out) {
  const q = out || [0, 0, 0, 0];
  let dot = aw * bw + ax * bx + ay * by + az * bz;
  if (dot < 0) {
    bw = -bw;
    bx = -bx;
    by = -by;
    bz = -bz;
    dot = -dot;
  }
  if (!(t > 0)) {
    q[0] = aw;
    q[1] = ax;
    q[2] = ay;
    q[3] = az;
    return q;
  }
  if (t >= 1) {
    q[0] = bw;
    q[1] = bx;
    q[2] = by;
    q[3] = bz;
    return q;
  }
  const steps = 1 << SLERP_BITS;
  const k = Math.round(t * steps);
  if (k <= 0) {
    q[0] = aw;
    q[1] = ax;
    q[2] = ay;
    q[3] = az;
    return q;
  }
  if (k >= steps) {
    q[0] = bw;
    q[1] = bx;
    q[2] = by;
    q[3] = bz;
    return q;
  }

  /* d = a^-1 * b, the rotation the flip has to travel. dot >= 0 above, so
   * d.w >= 0 and this is the short way round. */
  let dw = aw * bw + ax * bx + ay * by + az * bz;
  let dx = aw * bx - ax * bw - ay * bz + az * by;
  let dy = aw * by - ay * bw - az * bx + ax * bz;
  let dz = aw * bz - az * bw - ax * by + ay * bx;

  /* Accumulate d^(k/2^N) from the set bits of k, halving as we go. Bit i
   * of k is worth d^(1/2^(N-i)), so walk the bits from the top down and
   * halve once per step. */
  let rw = 1;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  for (let bit = SLERP_BITS - 1; bit >= 0; bit -= 1) {
    /* Halve FIRST. Bit i is worth d^(2^i / 2^N), which is d^(1/2^(N-i)),
     * so the top bit wants one halving and the bottom bit wants N. Doing
     * the multiply before the halving is off by exactly one and lands the
     * midpoint of a flip on its endpoint. */
    const hw = dw + 1;
    const h2 = hw * hw + dx * dx + dy * dy + dz * dz;
    if (h2 > 1e-18) {
      const inv = 1 / Math.sqrt(h2);
      dw = hw * inv;
      dx *= inv;
      dy *= inv;
      dz *= inv;
    } else {
      /* d.w = -1: a full turn, which has no unique half. Unreachable from
       * a real attitude, and the identity is the honest answer. */
      dw = 1;
      dx = 0;
      dy = 0;
      dz = 0;
    }
    if ((k >> bit) & 1) {
      const nw = rw * dw - rx * dx - ry * dy - rz * dz;
      const nx = rw * dx + rx * dw + ry * dz - rz * dy;
      const ny = rw * dy + ry * dw + rz * dx - rx * dz;
      const nz = rw * dz + rz * dw + rx * dy - ry * dx;
      rw = nw;
      rx = nx;
      ry = ny;
      rz = nz;
    }
  }

  /* out = a * d^t. */
  const ow = aw * rw - ax * rx - ay * ry - az * rz;
  const ox = aw * rx + ax * rw + ay * rz - az * ry;
  const oy = aw * ry + ay * rw + az * rx - ax * rz;
  const oz = aw * rz + az * rw + ax * ry - ay * rx;
  const n2 = ow * ow + ox * ox + oy * oy + oz * oz;
  const inv = n2 > 0 ? 1 / Math.sqrt(n2) : 1;
  q[0] = ow * inv;
  q[1] = ox * inv;
  q[2] = oy * inv;
  q[3] = oz * inv;
  return q;
}

/*
 * Flatten roll and pitch. Keep the body-x projection on the plant
 * xy plane as heading. 180 about x leaves +x alone, so (0,1,0,0)
 * becomes identity rather than a degenerate w/z flatten.
 *
 * Sqrt only, for the reason turtleSlerpQuat is: this lands in the plant.
 * The old body went through Math.atan2 to get the heading and Math.cos
 * and Math.sin to halve it, three transcendentals to produce a
 * quaternion that the half-angle identities give exactly. cos h and
 * sin h are the normalised forward vector already, and
 *
 *   cos(h/2) = sqrt((1 + cos h) / 2),  sin(h/2) = sin h / (2 cos(h/2))
 *
 * closes it. cos(h/2) is zero only at h = 180 degrees, where the
 * quaternion is a half turn about z and is written down directly.
 */
export function uprightPlantQuat(qw, qx, qy, qz) {
  const fx = 1 - 2 * (qy * qy + qz * qz);
  const fy = 2 * (qx * qy + qw * qz);
  const m2 = fx * fx + fy * fy;
  if (!(m2 > 1e-12)) {
    return [1, 0, 0, 0];
  }
  const inv = 1 / Math.sqrt(m2);
  const c = fx * inv;
  const sn = fy * inv;
  let half = 0.5 * (1 + c);
  if (half < 0) {
    half = 0;
  }
  const ch = Math.sqrt(half);
  if (ch < 1e-9) {
    /* Pointing at exactly minus x: a half turn about z. */
    return [0, 0, 0, 1];
  }
  return [ch, 0, 0, sn / (2 * ch)];
}

/*
 * Classify a ground arrival. Pure function, no allocation.
 *
 *   land    perch envelope: upright, slow. The shell may freeze.
 *   slide   props up, moving. Friction on the hull, no freeze.
 *   tumble  on its side or a blade down with speed. Roll it out.
 */
export function groundOutcome(descentRate, horizontal, tiltDeg) {
  if (tiltDeg > LAND_TILT_HARD_DEG) {
    return GROUND_TUMBLE;
  }
  const up = descentRate > 0 ? descentRate : 0;
  const speed = Math.sqrt(up * up + horizontal * horizontal);
  if (tiltDeg > LAND_TILT_MAX_DEG) {
    /* Blade down. Speed behind it is a tumble you fly out of. Crawling
     * is still a perch classification: the shell will not freeze
     * (canPerch refuses extra tilt) so the integrator keeps running
     * and a turtle or a power-out can happen. */
    if (speed > LAND_TIP_SPEED_MAX) {
      return GROUND_TUMBLE;
    }
    return GROUND_LAND;
  }
  if (descentRate > LAND_DESCENT_MAX || horizontal > LAND_HORIZONTAL_MAX
      || speed > PERCH_SPEED) {
    return GROUND_SLIDE;
  }
  return GROUND_LAND;
}

/*
 * Clip-through / stuck catch.
 *
 * Bounce is still the rule. This is the exception for the one state
 * bounce cannot leave: the hull's CENTRE is inside a solid, the bounce
 * loop failed to eject and the craft is jittering in place, or the
 * craft has fallen through the terrain. The shell freezes, says
 * Crashed, and puts the quad back on the line.
 *
 * It must not fire on a bounce that clears, a perch, a turtle, a slide
 * along a wall, a roof sit, a graze, leftover hull overlap with the
 * centre still outside, or a single tunneled frame that the next bounce
 * rewinds. Deep centre-inside (CLIP_DEEP) fires on the first frame:
 * that is already through a face, not slop. The tests in suiteClipCatch
 * are the contract.
 *
 * CLIP_CENTER_EPS is a hair over BOUNCE_SEPARATION: start-inside only
 * nudges that far, so a centre more than that inside is not leftover
 * slop, it is through the face.
 */
export const CLIP_CENTER_EPS = 0.010;
export const CLIP_DEEP = 0.08;
export const CLIP_CONFIRM_MS = 180;
export const STUCK_UNRESOLVED_MS = 350;
export const STUCK_TRAVEL_MAX = 0.40;
export const BURIED_DEPTH = 0.22;
export const BURIED_CONFIRM_MS = 180;
export const CLIP_CRASH_HOLD_MS = 800;
export const CLIP_SPAWN_GRACE_MS = 500;

/*
 * THE THRASH CATCH: the state none of the three above can see.
 *
 * The owner's report was "when i start glitching and flipping around when
 * stuck on an obstacle or mesh and i can't turtle out nor can i right it".
 * Walk the three detectors against that and every one of them declines:
 *
 *   inside   the centre is not in a solid, it is wedged against one
 *   stuck    needs `unresolved`, and the bounce loop IS resolving, once
 *            per contact, over and over
 *   buried   the terrain is not above it
 *
 * and turtle declines too, because shouldEnterTurtle wants the craft
 * still (under TURTLE_RATE) and genuinely inverted, and a quad winding
 * itself up against a wall is neither. So the pilot has no way out. That
 * is the hole.
 *
 * What the state actually looks like from here is simple: the craft is in
 * contact, it is either spinning hard or the pilot is holding real
 * throttle, and it has gone nowhere for most of a second. Any one of
 * those alone is ordinary flying. Together they are not: a quad that has
 * been touching something and burning throttle for 700 ms without
 * covering 60 cm is not flying, whatever the attitude says.
 *
 * The travel gate is what keeps honest flying out of it. Sixty centimetres
 * is under two frames of a slow crawl and far under any scrape, so a wall
 * ride, a bounce that clears, a gate rub and a hard flip all leave.
 */
export const THRASH_RATE = 12.0;      /* rad/s, about 690 deg/s */
/*
 * Hover measures 0.28 on this plant (verify check 5). At 0.55 the rotors
 * are asking for close to four times hover thrust, so a craft that has not
 * covered 60 cm in 700 ms of that is being held, not underpowered. The
 * first draft used 0.35, which is barely above hover and fires on a pilot
 * sitting on a roof deciding what to do next.
 */
export const THRASH_THROTTLE = 0.55;
export const THRASH_MS = 700;
export const THRASH_TRAVEL = 0.60;

export function makeClipWatch() {
  return {
    insideMs: 0,
    stuckMs: 0,
    buriedMs: 0,
    ax: 0,
    ay: 0,
    az: 0,
    haveAnchor: false,
    thrashMs: 0,
    tx: 0,
    ty: 0,
    tz: 0,
    haveThrash: false,
  };
}

export function resetClipWatch(watch) {
  watch.insideMs = 0;
  watch.stuckMs = 0;
  watch.buriedMs = 0;
  watch.ax = 0;
  watch.ay = 0;
  watch.az = 0;
  watch.haveAnchor = false;
  watch.thrashMs = 0;
  watch.tx = 0;
  watch.ty = 0;
  watch.tz = 0;
  watch.haveThrash = false;
  return watch;
}

function clipWatchExempt(sample) {
  return Boolean(
    sample.launchStaging
    || sample.hold
    || sample.poseLock
    || sample.spawnGrace,
  );
}

function clipWatchSoft(sample) {
  return Boolean(sample.landed || sample.turtle);
}

/*
 * Advance the watch by one frame. sample:
 *   skip fields via clipWatchExempt (launch, hold, harness lock)
 *   landed / turtle still allow an INSIDE crash: a perch frozen
 *   inside a wall is the glitch, not a landing
 *   spawnGrace     just respawned; ignore leftover pad overlap
 *   interiorDepth  centre vs the last leftover solid, metres, signed
 *   unresolved     bounce loop ended still overlapping
 *   roofContact    leftover overlap, outward normal mostly up, centre
 *                  not inside. A deck sit, not a clip.
 *   buriedDepth    metres below height(), 0 if above
 *   x, y, z        world position, for the stuck travel gate
 *   contact        a solid contact was resolved this tick
 *   rateMag        body rate magnitude, rad/s
 *   throttle       throttle channel, 0 to 1
 * Returns 'inside' | 'stuck' | 'buried' | 'thrash' | null.
 */
export function clipWatchTick(watch, sample, dtMs) {
  if (clipWatchExempt(sample)) {
    resetClipWatch(watch);
    return null;
  }
  const dt = dtMs > 0 ? dtMs : 0;

  /* Through a face, not 8 mm of bounce slop. One frame is enough. */
  if (sample.interiorDepth >= CLIP_DEEP) {
    return 'inside';
  }

  if (sample.interiorDepth > CLIP_CENTER_EPS) {
    watch.insideMs += dt;
  } else {
    watch.insideMs = 0;
  }

  const soft = clipWatchSoft(sample);
  /* Centre on or inside the face. Hull overlap with the centre still
   * outside is a bounce leftover, not a stuck crash. */
  const stuckCandidate = !soft
    && sample.unresolved
    && !sample.roofContact
    && sample.interiorDepth >= 0;
  if (stuckCandidate) {
    if (!watch.haveAnchor) {
      watch.ax = sample.x;
      watch.ay = sample.y;
      watch.az = sample.z;
      watch.haveAnchor = true;
      watch.stuckMs = 0;
    }
    watch.stuckMs += dt;
  } else {
    watch.haveAnchor = false;
    watch.stuckMs = 0;
  }

  if (!soft && sample.buriedDepth >= BURIED_DEPTH) {
    watch.buriedMs += dt;
  } else {
    watch.buriedMs = 0;
  }

  if (watch.insideMs >= CLIP_CONFIRM_MS) {
    return 'inside';
  }

  if (watch.haveAnchor && watch.stuckMs >= STUCK_UNRESOLVED_MS) {
    const dx = sample.x - watch.ax;
    const dy = sample.y - watch.ay;
    const dz = sample.z - watch.az;
    const travel = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (travel < STUCK_TRAVEL_MAX) {
      return 'stuck';
    }
    watch.ax = sample.x;
    watch.ay = sample.y;
    watch.az = sample.z;
    watch.stuckMs = 0;
  }

  if (watch.buriedMs >= BURIED_CONFIRM_MS) {
    return 'buried';
  }

  /* Thrash: in contact, spinning hard or under real throttle, and going
   * nowhere. Ordered last because it is the slowest to confirm and the
   * three above name the cause more precisely when they apply. */
  /* `contact` is an OBSTACLE contact, never a ground one. A quad on the
   * grass has its own ways out (fly off it, turtle, or the ground model's
   * own settle), and counting the ground here fired on two ordinary
   * states: a slow takeoff, which touches the plane at full throttle by
   * definition, and a hover low enough to brush it. takingOff is refused
   * outright for the same reason. */
  const thrashCandidate = !soft
    && !sample.takingOff
    && Boolean(sample.contact)
    && (sample.rateMag >= THRASH_RATE || sample.throttle >= THRASH_THROTTLE);
  if (thrashCandidate) {
    if (!watch.haveThrash) {
      watch.tx = sample.x;
      watch.ty = sample.y;
      watch.tz = sample.z;
      watch.haveThrash = true;
      watch.thrashMs = 0;
    }
    watch.thrashMs += dt;
    if (watch.thrashMs >= THRASH_MS) {
      const dx = sample.x - watch.tx;
      const dy = sample.y - watch.ty;
      const dz = sample.z - watch.tz;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < THRASH_TRAVEL) {
        return 'thrash';
      }
      /* It IS covering ground. Re-anchor and keep watching rather than
       * latching, the same way the stuck gate does. */
      watch.tx = sample.x;
      watch.ty = sample.y;
      watch.tz = sample.z;
      watch.thrashMs = 0;
    }
  } else {
    watch.haveThrash = false;
    watch.thrashMs = 0;
  }

  return null;
}

