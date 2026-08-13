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
 * THE TEST IS EXACT, NOT SAMPLED. A sphere of radius CRAFT_R swept along
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
 * physics. Nothing in this file feeds back into the simulation.
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

/*
 * The craft's size, in metres, and the ONE place any of it is written down.
 *
 * A quad is named for its motor to motor diagonal, so a motor sits half of
 * that from the centre, and a 5 inch prop adds half of five inches of blade
 * beyond it. The disc a tumbling quad sweeps is the sum, and it is a sphere
 * because a quad arrives at a tree in whatever attitude it likes.
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

/*
 * The craft's vertical semi-extent in level flight, about its own origin.
 *
 * A quad is a DISC, not a ball: 0.347 m across the props and about 0.07 m
 * through the body. The drawn stack in src/render/craft.js runs from the
 * body's underside at -0.017 to the prop discs at +0.034, so 0.040 covers
 * the whole airframe with half a centimetre over the prop plane. Sweeping
 * the full 0.1735 m sphere instead stole 26.7 cm of every vertical window:
 * a 1.524 m gate offered 1.177 m, a low pass met the ground 13 cm before
 * the airframe did, and the pilot read all of it as "the drone is huge".
 * The ellipsoid the queries sweep is (CRAFT_R, vHalf, CRAFT_R), where
 * vHalf grows from this floor to CRAFT_R as the craft tilts, because a
 * banked disc presents its diameter to the vertical.
 */
export const CRAFT_V_HALF = 0.040;

/* The vertical semi-axis at a given tilt of the prop plane from level.
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
  return CRAFT_V_HALF + (CRAFT_R - CRAFT_V_HALF) * s;
}

/*
 * Names, in the order kind indices are assigned. Reported by counts().
 *
 * `wall` and `boom` are the city's, and they are boxes rather than capsules.
 * A city is authored as axis aligned rectangles because a walker only ever
 * meets their sides, and turning 2731 of them into capsules would either
 * inscribe them, letting a quad through the corners of every building, or
 * circumscribe them, putting an invisible cylinder around every wall. So the
 * box is a second primitive, and it earns its place: see addBox.
 */
const KINDS = ['gate', 'obstacle', 'tree', 'canopy', 'rock', 'cliff', 'pole', 'wall', 'boom'];

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
    /* Scratch for axisToPoint, written per call, never allocated. */
    this.nx = 0;
    this.ny = 0;
    this.nz = 0;
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
   * incidental. hit() pads every broadphase query by CRAFT_R + maxR so that a
   * fat capsule whose centre is outside the scanned cells is still found. A
   * box is registered in the grid over its OWN footprint, every cell of it,
   * so a query padded by CRAFT_R alone already finds any box within reach.
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
   * reach by up to (sqrt(3) - 1) * CRAFT_R, which is 0.127 m on a 0.1735 m
   * craft. That is a crash reported for a corner the pilot can see they
   * missed. It is used here only as a rejection test, where overstating is
   * safe.
   */
  boxEarliestT(i, px, py, pz, dx, dy, dz, rx, ry) {
    const t = this.tBreaks;
    let n = 0;
    t[n] = 0; n += 1;
    t[n] = 1; n += 1;
    const lo0 = this.fax[i];
    const lo1 = this.fay[i];
    const lo2 = this.faz[i];
    const hi0 = this.fbx[i];
    const hi1 = this.fby[i];
    const hi2 = this.fbz[i];
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
        const r = axis === 1 ? ry : rx;
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
        /* Linear decreasing piece: one crossing. */
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
   * Did the craft, travelling from p to q, touch anything? The craft is an
   * ELLIPSOID: CRAFT_R across the props, vh through the body, because a
   * quad is a disc and sweeping a 0.1735 m ball stole 26.7 cm of every
   * vertical window. Callers that think in spheres omit vh and get the old
   * sphere exactly. Returns the kind index of the FIRST CONTACT ALONG THE
   * TRAVEL, or -1. Also writes hitIndex, hitKind, hitT and hitNormalDot.
   *
   * Exact for boxes (the slab walk is weighted per axis). For capsules the
   * first pass sweeps the conservative CRAFT_R sphere, then the reach is
   * re-solved once with the craft's support radius along the contact
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
  hit(px, py, pz, qx, qy, qz, vh = CRAFT_R) {
    this.hitIndex = -1;
    this.hitKind = -1;
    this.hitNormalDot = 0;
    this.hitT = -1;
    if (!this.built) {
      return -1;
    }
    this.queryId += 1;
    const id = this.queryId;
    const pad = CRAFT_R + this.maxR;
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
             * CRAFT_R. The grown box contains the true Minkowski sum of the
             * box and the ellipsoid (vh <= CRAFT_R), so a miss here is a
             * real miss and the exact test never runs for the thousands of
             * walls a city query sweeps past. */
            const gx0 = this.fax[i] - CRAFT_R;
            const gy0 = this.fay[i] - CRAFT_R;
            const gz0 = this.faz[i] - CRAFT_R;
            const gx1 = this.fbx[i] + CRAFT_R;
            const gy1 = this.fby[i] + CRAFT_R;
            const gz1 = this.fbz[i] + CRAFT_R;
            if (
              (px < gx0 && qx < gx0) || (px > gx1 && qx > gx1) ||
              (py < gy0 && qy < gy0) || (py > gy1 && qy > gy1) ||
              (pz < gz0 && qz < gz0) || (pz > gz1 && qz > gz1)
            ) {
              continue;
            }
            const t = this.boxEarliestT(i, px, py, pz, d1x, d1y, d1z, CRAFT_R, vh);
            if (t >= 0 && t < bestT) {
              bestT = t;
              bestI = i;
            }
          } else {
            const reach = this.fr[i] + CRAFT_R;
            let t = this.capsuleEarliestT(i, px, py, pz, d1x, d1y, d1z, a, reach * reach);
            if (t >= 0 && vh < CRAFT_R - 1e-9) {
              /*
               * Support refinement: the conservative sphere touched; ask
               * whether the thinner craft does. The direction that predicts
               * the true contact is the one at the CLOSEST APPROACH between
               * the travel and the capsule's axis, not at the sphere's
               * first contact: passing level under a tube, the sphere first
               * touches while the approach is still mostly horizontal, and
               * a support radius taken there reads CRAFT_R and never
               * shrinks. At the closest pair the direction is vertical for
               * exactly the passes this refinement exists for. The support
               * radius of the ellipsoid along that direction replaces
               * CRAFT_R and the earliest contact is re-solved once.
               */
              const sCA = this.closestApproachS(i, px, py, pz, d1x, d1y, d1z, a);
              this.axisToPoint(i, px + d1x * sCA, py + d1y * sCA, pz + d1z * sCA);
              const nx = this.nx;
              const ny = this.ny;
              const nz = this.nz;
              const nl2 = nx * nx + ny * ny + nz * nz;
              if (nl2 > 1e-18) {
                const cr = Math.sqrt(
                  (CRAFT_R * CRAFT_R * (nx * nx + nz * nz) + vh * vh * ny * ny) / nl2,
                );
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

    this.lastCandidates = candidates;
    this.queries += 1;
    this.candidateTotal += candidates;
    if (bestI < 0) {
      return -1;
    }

    this.hitIndex = bestI;
    this.hitKind = this.fkind[bestI];
    this.hitT = bestT;
    /* Contact normal at the earliest contact point. For a box it is the per
     * axis overhang; for a capsule it is the vector from the axis's closest
     * point to the contact point. A degenerate zero length contact counts as
     * head on, so it can never soften a real crash. */
    const cxp = px + d1x * bestT;
    const cyp = py + d1y * bestT;
    const czp = pz + d1z * bestT;
    let nx;
    let ny;
    let nz;
    if (this.fbox[bestI]) {
      nx = cxp < this.fax[bestI] ? cxp - this.fax[bestI] : cxp > this.fbx[bestI] ? cxp - this.fbx[bestI] : 0;
      ny = cyp < this.fay[bestI] ? cyp - this.fay[bestI] : cyp > this.fby[bestI] ? cyp - this.fby[bestI] : 0;
      nz = czp < this.faz[bestI] ? czp - this.faz[bestI] : czp > this.fbz[bestI] ? czp - this.fbz[bestI] : 0;
    } else {
      this.axisToPoint(bestI, cxp, cyp, czp);
      nx = this.nx;
      ny = this.ny;
      nz = this.nz;
    }
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const tl = Math.sqrt(a);
    if (nl > 1e-9 && tl > 1e-9) {
      const dot = (d1x * nx + d1y * ny + d1z * nz) / (nl * tl);
      this.hitNormalDot = dot < 0 ? -dot : dot;
    } else {
      this.hitNormalDot = 1;
    }
    return this.hitKind;
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
      craftRadius: CRAFT_R,
      queries: this.queries,
      meanCandidatesPerQuery: this.queries ? this.candidateTotal / this.queries : 0,
      lastCandidates: this.lastCandidates,
    };
  }
}

/*
 * Ground contact, and whether it is a landing or a crash.
 *
 * The simulator has no ground plane, on purpose: the verification harness
 * measures free air behaviour, so a plant with a floor in it could not be
 * checked against terminal velocity or a step response. That decision means
 * the ground lives here, in the shell, and it also means the shell cannot
 * push back: there is no ABI call that writes a position or a velocity into
 * the physics, so a craft resting on the ground can only be held by not
 * stepping the physics at all.
 *
 * The three thresholds. A real 5 inch quad on grass takes about 2 m/s of
 * vertical arrival without damage, which is a drop from roughly 0.2 m. Much
 * past 25 degrees of tilt a prop reaches the ground before the arms do, and
 * a prop strike at any descent rate is a crash. And arriving sideways at
 * more than about walking pace tips a quad onto its side, so the horizontal
 * gate is 3 m/s.
 */
export const LAND_DESCENT_MAX = 2.0;   /* m/s downward */
export const LAND_HORIZONTAL_MAX = 3.0; /* m/s */
export const LAND_TILT_MAX_DEG = 25;

/*
 * Classify a ground arrival. Pure function, no allocation, so the frame
 * loop can call it every frame.
 *
 *   descentRate  positive downward, m/s
 *   horizontal   horizontal speed, m/s
 *   tiltDeg      angle between the craft's own up axis and world up
 *
 * Returns 1 for a landing and 0 for a crash. An integer rather than a
 * string because this is on the per frame path and a string comparison
 * chain is not free.
 */
/*
 * Closing speed, in metres per second, above which touching an obstacle is a
 * crash rather than a graze.
 *
 * A MultiGP gate is 1.315 inch PVC with vinyl mesh panels. Brushing an upright
 * bounces you and you carry on; arriving at it at race speed does not. Until
 * this existed every contact at any speed was a full crash with a 1.4 s
 * lockout and a void lap, which is harsher than the physics AND harsher than
 * the MultiGP rulebook, which does not invalidate a lap for obstacle contact.
 * Applies to gate frames, obstacle furniture and flag poles. A tree, a rock or
 * a cliff is a crash at any speed.
 */
export const GRAZE_SPEED_MAX = 4.0;

export function isLanding(descentRate, horizontal, tiltDeg) {
  if (descentRate > LAND_DESCENT_MAX) {
    return 0;
  }
  if (horizontal > LAND_HORIZONTAL_MAX) {
    return 0;
  }
  if (tiltDeg > LAND_TILT_MAX_DEG) {
    return 0;
  }
  return 1;
}
