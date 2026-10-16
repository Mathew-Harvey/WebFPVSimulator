/*
 * balloons.js: Balloon chase, a game on a freestyle map. A light plane flies
 * long clean legs across the map at speeds that change from leg to leg, and
 * streams balloons out of its tail as it goes. The pilot chases it and pops
 * them. A round is ROUND_MS of flying; a gold balloon is worth GOLD_VALUE.
 *
 * PURE, as src/game/chase.js is: no Three.js, no DOM, no JS trigonometry
 * and nothing allocated on a step. Its clock is its own, BALLOON_EVERY ms a
 * feed. In flight the shell feeds it every BALLOON_EVERY steps of the lap
 * clock, from the step loop, so a dropped frame changes nothing it does and
 * the same seed and the same craft path give the same pops; while the plant
 * is not stepping (landed, the title) the frame feeds it so the plane flies
 * on, and those feeds never pop. The plane turns by nudging its heading
 * along its own perpendicular and renormalising, which is a square root
 * (exact in IEEE) rather than a sine.
 *
 * NOTHING HERE IS SOLID. The plane and the balloons are drawn and never
 * uploaded to the plant: a balloon is popped by the craft's swept centre
 * passing within POP_REACH of it, and the plane is flown through, so the
 * physics model is exactly what it was with the game off.
 *
 * THE PLANE'S LINES. A leg is a waypoint at least LEG_MIN away, inside
 * `radius` of the map's centre, and a target speed drawn from SPEED_MIN to
 * SPEED_MAX. The turn rate eases toward what the heading error asks for
 * (TURN_TAU) and never exceeds what LAT_ACCEL allows at the speed flown, so
 * it rolls into a turn, holds a steady arc and rolls out, and a fast leg
 * turns wide. Speed eases at SPEED_ACCEL. A waypoint is only taken if the
 * straight line to it clears everything the shell's `ceilingAt` reports by
 * CLEAR_ABOVE, and the climb to it is one the plane can make.
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

/* Milliseconds of the game's clock a feed, and steps of the lap clock
 * between feeds in flight. */
export const BALLOON_EVERY = 4;
const DT = BALLOON_EVERY / 1000;

/* The round. */
export const ROUND_MS = 90000;
/* How long the result stands before the next round is armed. */
export const RESULT_MS = 6000;

/* The balloons. */
export const BALLOON_MAX = 48;
export const BALLOON_R = 0.45;
/* Craft centre to balloon centre at a pop: the balloon plus a five inch's
 * reach, a little generous because a near miss that pops feels right and a
 * pass through that does not feels broken. */
const POP_REACH = BALLOON_R + 0.3;
const RELEASE_MS = 350;
export const BALLOON_LIFE_MS = 15000;
const GOLD_EVERY = 9;
export const GOLD_VALUE = 3;
/* Helium: a slow rise, and the plane's wake slowed out of them quickly. */
const RISE = 0.45;
const WAKE_KEEP = 0.25;
const WAKE_TAU = 0.6;
/* A streak is pops no more than STREAK_MS apart. */
export const STREAK_MS = 2500;

/* The plane. */
const SPEED_MIN = 11;
const SPEED_MAX = 25;
const SPEED_ACCEL = 2.5;
const LAT_ACCEL = 11;
const TURN_TAU = 0.45;
const TURN_GAIN = 1.4;
const CLIMB_MAX = 4;
/* A climb over something ahead: steeper, as a pilot would pull. */
const CLIMB_HARD = 9;
const LOOK_EVERY = 8;
const LOOK_AHEAD = 70;
const LOOK_STEPS = 7;
const LOOK_SIDE = 8;
const LEG_MIN = 70;
const CLEAR_ABOVE = 7;
const ALT_MIN = 12;
const ALT_MAX = 42;
const G = 9.81;

/* mulberry32: integer arithmetic only, so the same seed gives the same
 * stream in every engine. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashKey(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export class BalloonChase {
  /*
   * world: { cx, cz, radius, ceilingAt(x, z) }, Three.js metres, Y up.
   * ceilingAt is the top of whatever stands at (x, z), the ground included.
   */
  constructor(world, seed) {
    this.world = world;
    this.seed = seed >>> 0;
    /* Plane, now and at the feed before, for the render's interpolation. */
    this.p = new Float64Array(3);
    this.pPrev = new Float64Array(3);
    this.hx = 1;
    this.hz = 0;
    this.hxPrev = 1;
    this.hzPrev = 0;
    this.v = 15;
    this.vy = 0;
    this.turn = 0;
    this.bankTan = 0;
    this.bankPrev = 0;
    this.wx = 0;
    this.wy = 20;
    this.wz = 0;
    this.vTarget = 15;
    /* Balloons, struct of arrays. born < 0 is a free slot. */
    this.bx = new Float64Array(BALLOON_MAX);
    this.by = new Float64Array(BALLOON_MAX);
    this.bz = new Float64Array(BALLOON_MAX);
    this.bxPrev = new Float64Array(BALLOON_MAX);
    this.byPrev = new Float64Array(BALLOON_MAX);
    this.bzPrev = new Float64Array(BALLOON_MAX);
    this.bvx = new Float64Array(BALLOON_MAX);
    this.bvy = new Float64Array(BALLOON_MAX);
    this.bvz = new Float64Array(BALLOON_MAX);
    this.born = new Float64Array(BALLOON_MAX);
    this.gold = new Uint8Array(BALLOON_MAX);
    this.hue = new Uint8Array(BALLOON_MAX);
    /* Pops since the shell last drained them: slot, x, y, z, gold. Fixed
     * size; the shell drains every frame and a frame pops a handful. */
    this.pops = [];
    for (let i = 0; i < 16; i += 1) {
      this.pops.push({ x: 0, y: 0, z: 0, gold: false, hue: 0 });
    }
    this.popCount = 0;
    this.reset(0);
  }

  /* A fresh round: the plane at a fresh start, no balloons, no score. */
  reset(round) {
    this.round = round;
    this.rand = rng(this.seed ^ Math.imul(round + 1, 0x9e3779b1));
    const w = this.world;
    /* A start on the map's edge, heading across it. A unit vector without a
     * sine: a point in the square, kept if it is in the disc, normalised. */
    let ux = 1;
    let uz = 0;
    for (let k = 0; k < 16; k += 1) {
      const a = this.rand() * 2 - 1;
      const b = this.rand() * 2 - 1;
      const m = a * a + b * b;
      if (m > 0.04 && m <= 1) {
        const r = Math.sqrt(m);
        ux = a / r;
        uz = b / r;
        break;
      }
    }
    this.p[0] = w.cx + ux * w.radius * 0.8;
    this.p[2] = w.cz + uz * w.radius * 0.8;
    this.p[1] = Math.max(ALT_MIN, w.ceilingAt(this.p[0], this.p[2]) + CLEAR_ABOVE + 6);
    if (this.p[1] > ALT_MAX) {
      this.p[1] = ALT_MAX;
    }
    this.hx = -ux;
    this.hz = -uz;
    this.v = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * 0.4;
    this.vy = 0;
    this.turn = 0;
    this.bankTan = 0;
    this.lookIn = 0;
    this.floorAhead = -Infinity;
    this.pickLeg();
    /* Start at the first leg's own height, which clears its line. */
    this.p[1] = this.wy;
    this.snapshot();
    this.born.fill(-1);
    this.released = 0;
    this.nextReleaseMs = 400;
    this.clockMs = 0;
    /* The round's own clock starts at the first feed with the craft flying. */
    this.startedMs = -1;
    this.score = 0;
    this.popped = 0;
    this.goldPopped = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.lastPopMs = -1e9;
    this.over = false;
    this.overAtMs = -1;
    this.popCount = 0;
  }

  snapshot() {
    this.pPrev[0] = this.p[0];
    this.pPrev[1] = this.p[1];
    this.pPrev[2] = this.p[2];
    this.hxPrev = this.hx;
    this.hzPrev = this.hz;
    this.bankPrev = this.bankTan;
  }

  /* Highest thing under the straight line from the plane to (x, z). */
  legFloor(x, z) {
    const w = this.world;
    const dx = x - this.p[0];
    const dz = z - this.p[2];
    const len = Math.sqrt(dx * dx + dz * dz);
    const n = Math.max(2, Math.ceil(len / 6));
    let top = -Infinity;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const h = w.ceilingAt(this.p[0] + dx * t, this.p[2] + dz * t);
      if (h > top) {
        top = h;
      }
    }
    return { top, len };
  }

  pickLeg() {
    const w = this.world;
    let best = null;
    for (let k = 0; k < 24; k += 1) {
      const a = this.rand() * 2 - 1;
      const b = this.rand() * 2 - 1;
      if (a * a + b * b > 1) {
        continue;
      }
      const x = w.cx + a * w.radius;
      const z = w.cz + b * w.radius;
      const { top, len } = this.legFloor(x, z);
      if (len < LEG_MIN) {
        continue;
      }
      let y = Math.max(ALT_MIN, top + CLEAR_ABOVE) + this.rand() * 8;
      if (y > ALT_MAX) {
        if (top + CLEAR_ABOVE > ALT_MAX) {
          continue;
        }
        y = ALT_MAX;
      }
      /* A climb the plane can make over the leg at its slowest. */
      if (y - this.p[1] > CLIMB_MAX * (len / SPEED_MAX) + 4) {
        continue;
      }
      /* Prefer a leg that is not straight back where it came from, so the
       * lines run across the map rather than up and down one street. */
      const dot = ((x - this.p[0]) * this.hx + (z - this.p[2]) * this.hz) / len;
      const s = dot + this.rand() * 0.8;
      if (!best || s > best.s) {
        best = { x, y, z, s, dot };
      }
    }
    if (!best) {
      /* Nowhere clean: back over the centre, high. */
      best = { x: w.cx, y: ALT_MAX, z: w.cz, dot: 0 };
    }
    this.wx = best.x;
    this.wy = best.y;
    this.wz = best.z;
    this.vTarget = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * this.rand();
    /* A hard turn ahead is flown slower, as a pilot would. */
    if (best.dot < 0.2 && this.vTarget > 17) {
      this.vTarget = 17;
    }
  }

  /*
   * One feed, BALLOON_EVERY ms of the game's own clock (clockMs), which is
   * what every time here is measured on. flying: the craft is in the air
   * and the run is live, so it may pop and the round may start. craft
   * { x, y, z } and its position at the last feed, prev, or null for no
   * sweep, Three.js metres. Pops go to this.pops[0 .. popCount).
   *
   * The shell feeds it from the step loop while the plant steps, and from
   * the frame while it does not (landed, the title), so the plane never
   * stops in the sky; only the flying feeds pop.
   */
  step(flying, craft, prev) {
    this.snapshot();
    for (let i = 0; i < BALLOON_MAX; i += 1) {
      this.bxPrev[i] = this.bx[i];
      this.byPrev[i] = this.by[i];
      this.bzPrev[i] = this.bz[i];
    }
    this.clockMs += BALLOON_EVERY;
    const clock = this.clockMs;
    this.flyPlane();
    this.release();
    this.driftBalloons();
    if (flying && this.startedMs < 0 && !this.over) {
      this.startedMs = clock;
    }
    if (this.startedMs >= 0 && !this.over && clock - this.startedMs >= ROUND_MS) {
      this.over = true;
      this.overAtMs = clock;
    }
    if (flying && this.startedMs >= 0 && !this.over && prev) {
      this.sweep(clock, prev, craft);
    }
    if (this.streak > 0 && clock - this.lastPopMs > STREAK_MS) {
      this.streak = 0;
    }
  }

  flyPlane() {
    const dx = this.wx - this.p[0];
    const dz = this.wz - this.p[2];
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < Math.max(22, this.v * 1.6)) {
      this.pickLeg();
    }
    const ex = (this.wx - this.p[0]) / Math.max(d, 1e-6);
    const ez = (this.wz - this.p[2]) / Math.max(d, 1e-6);
    /* Heading error: the cross product's sign is the side, its size the
     * sine of the error, and behind is a full turn either way. */
    const cross = this.hx * ez - this.hz * ex;
    const dot = this.hx * ex + this.hz * ez;
    const err = dot < 0 ? (cross < 0 ? -1 : 1) : cross;
    const turnMax = LAT_ACCEL / Math.max(this.v, 1);
    let want = err * TURN_GAIN;
    if (want > turnMax) {
      want = turnMax;
    } else if (want < -turnMax) {
      want = -turnMax;
    }
    this.turn += (want - this.turn) * (DT / TURN_TAU);
    /* Rotate the heading by turn * DT toward +perp (left of heading is
     * (hz, -hx) in a Y up frame seen from above: positive turn is toward
     * positive cross, which is toward (-hz, hx)). */
    const a = this.turn * DT;
    let hx = this.hx - this.hz * a;
    let hz = this.hz + this.hx * a;
    const m = Math.sqrt(hx * hx + hz * hz);
    hx /= m;
    hz /= m;
    this.hx = hx;
    this.hz = hz;
    /* Speed and height, eased. */
    const dv = this.vTarget - this.v;
    const sa = SPEED_ACCEL * DT;
    this.v += dv > sa ? sa : (dv < -sa ? -sa : dv);
    /* Never lower than what stands ahead, looked at along the heading
     * every LOOK_EVERY feeds: the turn onto a leg is an arc, and the
     * straight line the leg was checked along is not where the arc goes. */
    this.lookIn -= 1;
    if (this.lookIn <= 0) {
      this.lookIn = LOOK_EVERY;
      /* Two lines: straight down the heading, and down the arc the
       * present turn is flying, each with a wing's reach either side. */
      let top = -Infinity;
      for (let arc = 0; arc <= 1; arc += 1) {
        let x = this.p[0];
        let z = this.p[2];
        let ax = hx;
        let az = hz;
        const step = LOOK_AHEAD / LOOK_STEPS;
        const da = arc ? (this.turn * step) / Math.max(this.v, 1) : 0;
        for (let k = 0; k <= LOOK_STEPS; k += 1) {
          for (let side = -1; side <= 1; side += 1) {
            const h = this.world.ceilingAt(x - az * side * LOOK_SIDE, z + ax * side * LOOK_SIDE);
            if (h > top) {
              top = h;
            }
          }
          x += ax * step;
          z += az * step;
          const nx = ax - az * da;
          const nz = az + ax * da;
          const nm = Math.sqrt(nx * nx + nz * nz);
          ax = nx / nm;
          az = nz / nm;
        }
      }
      this.floorAhead = top + CLEAR_ABOVE;
    }
    const yWant = this.wy > this.floorAhead ? this.wy : this.floorAhead;
    const climb = this.floorAhead > this.p[1] - 3 ? CLIMB_HARD : CLIMB_MAX;
    let vyWant = (yWant - this.p[1]) * 0.6;
    if (vyWant > climb) {
      vyWant = climb;
    } else if (vyWant < -CLIMB_MAX) {
      vyWant = -CLIMB_MAX;
    }
    this.vy += (vyWant - this.vy) * (DT / 0.5);
    this.p[0] += hx * this.v * DT;
    this.p[1] += this.vy * DT;
    this.p[2] += hz * this.v * DT;
    this.bankTan = (this.v * this.turn) / G;
  }

  release() {
    if (this.clockMs < this.nextReleaseMs) {
      return;
    }
    this.nextReleaseMs = this.clockMs + RELEASE_MS;
    /* The oldest slot, or a free one. */
    let slot = -1;
    let oldest = Infinity;
    for (let i = 0; i < BALLOON_MAX; i += 1) {
      if (this.born[i] < 0) {
        slot = i;
        break;
      }
      if (this.born[i] < oldest) {
        oldest = this.born[i];
        slot = i;
      }
    }
    this.released += 1;
    this.bx[slot] = this.p[0] - this.hx * 3.2;
    this.by[slot] = this.p[1] - 0.5;
    this.bz[slot] = this.p[2] - this.hz * 3.2;
    this.bxPrev[slot] = this.bx[slot];
    this.byPrev[slot] = this.by[slot];
    this.bzPrev[slot] = this.bz[slot];
    this.bvx[slot] = this.hx * this.v * WAKE_KEEP + (this.rand() - 0.5) * 1.2;
    this.bvy[slot] = this.vy * WAKE_KEEP - 1.5;
    this.bvz[slot] = this.hz * this.v * WAKE_KEEP + (this.rand() - 0.5) * 1.2;
    this.born[slot] = this.clockMs;
    this.gold[slot] = this.released % GOLD_EVERY === 0 ? 1 : 0;
    this.hue[slot] = Math.floor(this.rand() * 6);
  }

  driftBalloons() {
    const k = DT / WAKE_TAU;
    for (let i = 0; i < BALLOON_MAX; i += 1) {
      if (this.born[i] < 0) {
        continue;
      }
      if (this.clockMs - this.born[i] > BALLOON_LIFE_MS) {
        this.born[i] = -1;
        continue;
      }
      this.bvx[i] -= this.bvx[i] * k;
      this.bvz[i] -= this.bvz[i] * k;
      this.bvy[i] += (RISE - this.bvy[i]) * k;
      this.bx[i] += this.bvx[i] * DT;
      this.by[i] += this.bvy[i] * DT;
      this.bz[i] += this.bvz[i] * DT;
    }
  }

  /* The craft's path since the last feed against every balloon. */
  sweep(clock, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dd = dx * dx + dy * dy + dz * dz;
    const reach2 = POP_REACH * POP_REACH;
    for (let i = 0; i < BALLOON_MAX; i += 1) {
      if (this.born[i] < 0) {
        continue;
      }
      const qx = this.bx[i] - a.x;
      const qy = this.by[i] - a.y;
      const qz = this.bz[i] - a.z;
      let t = dd > 1e-12 ? (qx * dx + qy * dy + qz * dz) / dd : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const ex = qx - dx * t;
      const ey = qy - dy * t;
      const ez = qz - dz * t;
      if (ex * ex + ey * ey + ez * ez > reach2) {
        continue;
      }
      const gold = this.gold[i] === 1;
      this.born[i] = -1;
      this.popped += 1;
      if (gold) {
        this.goldPopped += 1;
      }
      this.score += gold ? GOLD_VALUE : 1;
      this.streak = clock - this.lastPopMs <= STREAK_MS ? this.streak + 1 : 1;
      if (this.streak > this.bestStreak) {
        this.bestStreak = this.streak;
      }
      this.lastPopMs = clock;
      if (this.popCount < this.pops.length) {
        const p = this.pops[this.popCount];
        p.x = this.bx[i];
        p.y = this.by[i];
        p.z = this.bz[i];
        p.gold = gold;
        p.hue = this.hue[i];
        this.popCount += 1;
      }
    }
  }

  /* Milliseconds left in the round, or the whole round before it starts. */
  leftMs() {
    if (this.startedMs < 0) {
      return ROUND_MS;
    }
    if (this.over) {
      return 0;
    }
    return Math.max(0, ROUND_MS - (this.clockMs - this.startedMs));
  }

  /* Milliseconds the result has stood since the round ran out, or -1. */
  sinceOverMs() {
    return this.over ? this.clockMs - this.overAtMs : -1;
  }
}
