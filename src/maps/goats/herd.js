/*
 * herd.js: the goats of Heads' neighbourhood, and the game they are. Pure:
 * plan metres in, plan metres out, no Three.js, so a Node check can herd
 * them (scripts/goats-check.js).
 *
 * The owner's ask of 28 October 2026: "Each persons logo should go on the
 * side of a goat, that is roaming around the neighbourhood. the map is a
 * mini game, your goal is to herd your goat into heads' garage, which is
 * open, once the goat has run in the garage it stays there until the map
 * is reset", and "ensure each goat ... responds like in the bardwell map to
 * the quad so that its fun to herd them".
 *
 * HOW A GOAT IS HERDED. Joshua Bardwell's goats (../bardwell/goats.js) run
 * from the craft when it comes close. These do the same, and what makes
 * that herding rather than chasing is how they run:
 *
 *   - Straight away from the craft, so where you put the craft is where
 *     the goat goes: get on the far side of it from the garage and push.
 *   - As fast as you press them: a craft at the edge of their alarm walks
 *     them, one right on them sends them bolting. A gentle push steers, a
 *     dive scatters.
 *   - Only when the craft is low. A craft over the roofs is a bird; under
 *     SPOOK_H it is a dog. So the herding is flown at a goat's height,
 *     between the cars and the fences, which is the flying this map is for.
 *   - They follow each other. A goat that sees a goat near it bolting goes
 *     with it, so a small herd can be driven as one.
 *   - They go round what is solid: houses, fences, cars, trees, the pond.
 *     A goat pushed into a wall slides along it the way you push it.
 *
 * A goat whose middle is inside Heads' garage (GARAGE_IN) is home: it stops
 * running, wanders the garage floor (GARAGE_PEN), and stays until the map
 * is built again. Not a crash or a reset: a crash with the whoop is the
 * most common thing on this map, and the owner's game is that a goat in
 * the garage stays. So the herd keeps its own clock, which only goes
 * forward.
 *
 * FOR THE LATENCY RULE. Render only: nothing here reaches the physics, the
 * plant or the colliders, and a goat is never solid. Per frame: one bucket
 * pass over the goats for their neighbours, and for each goat a handful of
 * reads of a byte grid, and for a goat in reach of one of the eight cars
 * (marked from the buckets round each car) a test against each, no
 * allocation. The grid (the solids at a goat's height, a cell every CELL
 * metres) is made once when the map is built.
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

/* ------------------------------------------------------------------ */
/* The numbers, real metres and seconds                                */
/* ------------------------------------------------------------------ */

/* The grid's cell. */
export const CELL = 0.5;

/* What a goat bumps into: anything solid between these heights. A kerb is
 * hopped; a car's body, a fence, a step and a wall are not. */
const BUMP_LO = 0.2;
const BUMP_HI = 0.85;

/* The craft spooks a goat inside ALARM metres and below SPOOK_H; past CALM
 * it settles. */
export const ALARM = 6;
const CALM = 9;
export const SPOOK_H = 3.2;

/* Paces: grazing, a trot at the edge of the alarm, a bolt with the craft
 * on top of it. */
const GRAZE_V = 0.35;
const TROT_V = 1.1;
const BOLT_V = 4.6;
const HOME_V = 0.3;

/* How quickly a goat changes its pace and way, per second. */
const ACCEL = 5;
const TURN = 7;

/* A goat sees a bolting goat inside FOLLOW and goes with it at FOLLOW_K of
 * its pace; it keeps SPACE from any other. */
const FOLLOW = 3.6;
const FOLLOW_K = 0.75;
const SPACE = 0.85;

/* How far ahead a goat looks for something in its way. */
const LOOK = [0.55, 1.1];

/* Heads' garage, plan metres (../heads/heads.js GARAGE): a goat whose
 * middle is in GARAGE_IN is home, and a goat at home wanders GARAGE_PEN. */
export const GARAGE_IN = { x0: 14.0, x1: 17.75, y0: 0.9, y1: 7.5 };
const GARAGE_PEN = { x0: 14.5, x1: 17.25, y0: 1.2, y1: 7.2 };

/* No goat starts nearer the garage than this. */
const START_FAR = 28;

/*
 * THE CARS (./traffic.js), which do not stop: the physics drives them on
 * the lap clock and a goat is not in the physics. So a goat gets out of
 * their way. One in a car's lane ahead of it, inside CAR_AHEAD seconds of
 * its driving and CAR_SIDE of its side, steps off the lane to the side it
 * is on (the other when that is shut), quicker the nearer the car. One a
 * car is about to touch anyway, inside CAR_LEAP seconds of its bumper or
 * beside it, leaps clear: LEAP_T seconds through the air, LEAP_H high, to
 * LEAP_CLEAR past the car's side, which is what goats do. Each car comes
 * as CAR_STRIDE numbers (./cardraw.js): plan x, y, heading x, y, speed,
 * half length, half width, and 1 if it is on the street.
 */
const CAR_STRIDE = 8;
const CAR_AHEAD = 1.8;
const CAR_SIDE = 0.9;
const CAR_LEAP = 0.4;
const LEAP_T = 0.3;
const LEAP_H = 0.55;
const LEAP_CLEAR = 0.5;
/* A goat's half length, for its nose and tail against a bumper. */
const GOAT_HALF = 0.5;

/* Math.hypot is a varargs call and costs ten times this in V8. */
const len = (x, y) => Math.sqrt(x * x + y * y);

/* ------------------------------------------------------------------ */
/* A seeded stream                                                     */
/* ------------------------------------------------------------------ */

function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* The grid                                                            */
/* ------------------------------------------------------------------ */

/*
 * Where a goat may stand, as a byte a cell: 1 is in the way. `parts` are
 * world frame parts (src/props/parts.js), `toPlan(x, z)` takes a world
 * point to plan [x, y], `S` is world metres to the plan's; `blocks` are
 * plan rectangles in the way besides (water, rooms). The edge of `bounds`
 * is in the way, and everything is grown by one cell so a goat's middle
 * keeps clear of what it would bump.
 */
export function makeGrid(parts, toPlan, S, bounds, blocks = []) {
  const W = Math.ceil((bounds.x1 - bounds.x0) / CELL);
  const H = Math.ceil((bounds.y1 - bounds.y0) / CELL);
  const raw = new Uint8Array(W * H);
  const fill = (x0, y0, x1, y1) => {
    const i0 = Math.max(0, Math.floor((x0 - bounds.x0) / CELL));
    const i1 = Math.min(W - 1, Math.floor((x1 - bounds.x0) / CELL));
    const j0 = Math.max(0, Math.floor((y0 - bounds.y0) / CELL));
    const j1 = Math.min(H - 1, Math.floor((y1 - bounds.y0) / CELL));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        raw[j * W + i] = 1;
      }
    }
  };
  for (const p of parts) {
    if (!p.solid) {
      continue;
    }
    let lo;
    let hi;
    let a;
    let b;
    if (p.t === 'box') {
      lo = p.lo[1] / S;
      hi = p.hi[1] / S;
      a = toPlan(p.lo[0], p.lo[2]);
      b = toPlan(p.hi[0], p.hi[2]);
    } else {
      const r = p.r;
      lo = (Math.min(p.a[1], p.b[1]) - r) / S;
      hi = (Math.max(p.a[1], p.b[1]) + r) / S;
      a = toPlan(Math.min(p.a[0], p.b[0]) - r, Math.min(p.a[2], p.b[2]) - r);
      b = toPlan(Math.max(p.a[0], p.b[0]) + r, Math.max(p.a[2], p.b[2]) + r);
    }
    if (hi <= BUMP_LO || lo >= BUMP_HI) {
      continue;
    }
    fill(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]));
  }
  for (const r of blocks) {
    fill(r.x0, r.y0, r.x1, r.y1);
  }
  /* Grown by one cell, four ways, and the edge in the way. */
  const cells = new Uint8Array(W * H);
  for (let j = 0; j < H; j += 1) {
    for (let i = 0; i < W; i += 1) {
      const k = j * W + i;
      cells[k] = (i === 0 || j === 0 || i === W - 1 || j === H - 1 || raw[k]
        || raw[k - 1] || raw[k + 1] || raw[k - W] || raw[k + W]) ? 1 : 0;
    }
  }
  return {
    W, H, cells, bounds,
    blocked(x, y) {
      const i = Math.floor((x - bounds.x0) / CELL);
      const j = Math.floor((y - bounds.y0) / CELL);
      if (i < 0 || j < 0 || i >= W || j >= H) {
        return true;
      }
      return cells[j * W + i] === 1;
    },
  };
}

/* ------------------------------------------------------------------ */
/* The herd                                                            */
/* ------------------------------------------------------------------ */

/* The ways a goat tries when the way it wants is blocked, as turns from
 * it, cosine then sine, nearest first, each side. */
const TRY_DEG = [25, -25, 50, -50, 75, -75, 100, -100, 135, -135, 180];
const TRY_C = new Float64Array(TRY_DEG.map((d) => Math.cos((d * Math.PI) / 180)));
const TRY_S = new Float64Array(TRY_DEG.map((d) => Math.sin((d * Math.PI) / 180)));

/* A goat's state, by what it is doing. */
export const GRAZE = 0;
export const FLEE = 1;
export const HOME = 2;

/*
 * The herd: `names` one per goat, `grid` from makeGrid, `seed` for where
 * they start and how they wander, `parks` plan rectangles a third of the
 * groups start in. `craft` to step() is { x, y, h } in plan metres or
 * null, and `cars` the first `nCars` cars' numbers (THE CARS, above) or
 * null.
 *
 * THE STATE IS FLAT ARRAYS, one number of every goat in each, and not an
 * object a goat. An object's numbers change from whole to fractional as it
 * runs, every such change is a new shape to V8, and the step was thrown out
 * of the optimiser for it: 17 microseconds a step became 300. Arrays of
 * doubles have one shape for good. The render reads them as they are.
 */
export function makeHerd(names, grid, { seed = 0x60a7, parks = [] } = {}) {
  const r = stream(seed);
  const B = grid.bounds;
  const N = names.length;
  const free = (x, y) => !grid.blocked(x, y);
  const gx = (GARAGE_IN.x0 + GARAGE_IN.x1) / 2;
  const gy = (GARAGE_IN.y0 + GARAGE_IN.y1) / 2;
  /* A free spot with room round it, START_FAR from the garage. */
  const spot = (near) => {
    for (let k = 0; k < 400; k += 1) {
      let x;
      let y;
      if (near) {
        x = near[0] + (r() - 0.5) * 7;
        y = near[1] + (r() - 0.5) * 7;
      } else {
        const p = parks.length && r() < 0.3 ? parks[Math.floor(r() * parks.length)] : B;
        x = p.x0 + 2 + r() * (p.x1 - p.x0 - 4);
        y = p.y0 + 2 + r() * (p.y1 - p.y0 - 4);
      }
      if (len(x - gx, y - gy) < START_FAR) {
        continue;
      }
      if (free(x, y) && free(x + 0.6, y) && free(x - 0.6, y) && free(x, y + 0.6) && free(x, y - 0.6)) {
        return [x, y];
      }
    }
    return null;
  };
  const X = new Float64Array(N);
  const Y = new Float64Array(N);
  const VX = new Float64Array(N);
  const VY = new Float64Array(N);
  const FX = new Float64Array(N);
  const FY = new Float64Array(N);
  const SPEED = new Float64Array(N);
  const FEAR = new Float64Array(N);
  const T = new Float64Array(N);
  const TX = new Float64Array(N);
  const TY = new Float64Array(N);
  const PHASE = new Float64Array(N);
  const HOP = new Float64Array(N);
  /* A leap from a car: the time left in it and its way, plan metres a
   * second. */
  const LEAP = new Float64Array(N);
  const LVX = new Float64Array(N);
  const LVY = new Float64Array(N);
  const HOME_AT = new Float64Array(N).fill(-1);
  const MODE = new Uint8Array(N);
  /* Each goat's own stream, its state kept here. */
  const RND = new Uint32Array(N);
  const rnd = (i) => {
    let a = (RND[i] + 0x6d2b79f5) >>> 0;
    RND[i] = a;
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
  let at = null;
  let left = 0;
  for (let i = 0; i < N; i += 1) {
    /* In little groups of one to four, as goats are found. */
    if (left <= 0 || !at) {
      at = spot(null);
      left = 1 + Math.floor(r() * 4);
    }
    const p = (at && spot(at)) || spot(null) || [B.x0 + 4, B.y0 + 4];
    left -= 1;
    const a = r() * Math.PI * 2;
    X[i] = p[0];
    Y[i] = p[1];
    TX[i] = p[0];
    TY[i] = p[1];
    FX[i] = Math.cos(a);
    FY[i] = Math.sin(a);
    T[i] = r() * 3;
    PHASE[i] = r();
    RND[i] = (seed + 7919 * (i + 1)) >>> 0;
  }

  /* Buckets for who is near whom, FOLLOW across. */
  const BW = Math.ceil((B.x1 - B.x0) / FOLLOW) + 1;
  const BH = Math.ceil((B.y1 - B.y0) / FOLLOW) + 1;
  const head = new Int32Array(BW * BH);
  const next = new Int32Array(N);
  const bi = (x) => Math.min(BW - 1, Math.max(0, Math.floor((x - B.x0) / FOLLOW)));
  const bj = (y) => Math.min(BH - 1, Math.max(0, Math.floor((y - B.y0) / FOLLOW)));

  let clock = 0;
  let firstRun = -1;
  let homeCount = 0;
  const events = [];

  /* Turn a goat's facing toward (dx, dy), unit, at TURN a second. */
  function face(i, dx, dy, dt) {
    const k = Math.min(1, TURN * dt);
    let fx = FX[i] + (dx - FX[i]) * k;
    let fy = FY[i] + (dy - FY[i]) * k;
    const l = len(fx, fy);
    if (l < 1e-6) {
      fx = dx;
      fy = dy;
    } else {
      fx /= l;
      fy /= l;
    }
    FX[i] = fx;
    FY[i] = fy;
  }

  /* The way it wants, (wx, wy) unit, or the nearest free one, into
   * WAY; zero when every way is shut. */
  const WAY = new Float64Array(2);
  function steer(i, wx, wy, reach) {
    const x = X[i];
    const y = Y[i];
    for (let l = 0; l < LOOK.length; l += 1) {
      const d = LOOK[l] * reach;
      if (!free(x + wx * d, y + wy * d)) {
        for (let k = 0; k < TRY_C.length; k += 1) {
          const tx = wx * TRY_C[k] - wy * TRY_S[k];
          const ty = wx * TRY_S[k] + wy * TRY_C[k];
          if (free(x + tx * d, y + ty * d) && free(x + tx * d * 0.5, y + ty * d * 0.5)) {
            WAY[0] = tx;
            WAY[1] = ty;
            return;
          }
        }
        WAY[0] = 0;
        WAY[1] = 0;
        return;
      }
    }
    WAY[0] = wx;
    WAY[1] = wy;
  }

  /* Move by (dx, dy) as far as is free, sliding along what is not. */
  function move(i, dx, dy) {
    const n = Math.max(1, Math.ceil(len(dx, dy) / (CELL * 0.5)));
    const sx = dx / n;
    const sy = dy / n;
    for (let k = 0; k < n; k += 1) {
      const x = X[i];
      const y = Y[i];
      if (free(x + sx, y + sy)) {
        X[i] = x + sx;
        Y[i] = y + sy;
      } else if (free(x + sx, y)) {
        X[i] = x + sx;
        VY[i] *= 0.5;
      } else if (free(x, y + sy)) {
        Y[i] = y + sy;
        VX[i] *= 0.5;
      } else {
        VX[i] *= 0.3;
        VY[i] *= 0.3;
        break;
      }
    }
  }

  /* The scratch a goat's think writes: the way it wants and how fast. */
  const WANT = new Float64Array(3);

  /* A goat at home: it wanders the garage floor. */
  function thinkHome(i, dt) {
    T[i] -= dt;
    if (T[i] <= 0) {
      T[i] = 2 + rnd(i) * 5;
      TX[i] = GARAGE_PEN.x0 + rnd(i) * (GARAGE_PEN.x1 - GARAGE_PEN.x0);
      TY[i] = GARAGE_PEN.y0 + rnd(i) * (GARAGE_PEN.y1 - GARAGE_PEN.y0);
    }
    const dx = TX[i] - X[i];
    const dy = TY[i] - Y[i];
    const d = len(dx, dy);
    if (d > 0.3) {
      WANT[0] = dx / d;
      WANT[1] = dy / d;
      WANT[2] = HOME_V;
    }
  }

  /* The craft, if it is low and near enough to matter: the threat, 0 to
   * 1, and the way away from it. */
  function thinkCraft(i, cx, cy, ch) {
    if (!(ch < SPOOK_H)) {
      return 0;
    }
    const dx = X[i] - cx;
    const dy = Y[i] - cy;
    const d = len(dx, dy);
    const lift = Math.max(0, ch - 0.6) * 0.6;
    const dd = len(d, lift);
    if (!(dd < ALARM || (MODE[i] === FLEE && dd < CALM))) {
      return 0;
    }
    const threat = Math.max(0, Math.min(1, (ALARM - dd) / (ALARM - 0.7)));
    if (d > 1e-3) {
      WANT[0] = dx / d;
      WANT[1] = dy / d;
    } else {
      WANT[0] = FX[i];
      WANT[1] = FY[i];
    }
    WANT[2] = dd >= ALARM ? TROT_V * 0.8 : TROT_V + (BOLT_V - TROT_V) * threat * threat * (3 - 2 * threat);
    if (MODE[i] !== FLEE) {
      MODE[i] = FLEE;
      if (firstRun < 0) {
        firstRun = clock;
        events.push({ kind: 'firstRun', goat: i });
      }
    }
    FEAR[i] = Math.max(FEAR[i], threat);
    T[i] = 1.2;
    return Math.max(threat, 1e-3);
  }

  /* Which side of a car's lane goat i goes to, s = 1 its left: the side it
   * is on, unless there is no room there at `along` and there is on the
   * other. b is the car's first number in `cars`. */
  function sideOf(i, cars, b, along, across, clear) {
    const hx = cars[b + 2];
    const hy = cars[b + 3];
    const ox = cars[b] + hx * along;
    const oy = cars[b + 1] + hy * along;
    const s = across >= 0 ? 1 : -1;
    const room = (k) => free(ox - hy * k * clear, oy + hx * k * clear);
    return !room(s) && room(-s) ? -s : s;
  }

  /* A car coming down the goat's lane: the threat, 0 to 1, and the way off
   * the lane into WANT. No fear, so no goat follows it and the box at the
   * side does not name it: a car scattering goats is not your herding. */
  function thinkCars(i, cars, n) {
    let best = 0;
    for (let c = 0; c < n; c += 1) {
      const b = c * CAR_STRIDE;
      if (cars[b + 7] === 0) {
        continue;
      }
      const hx = cars[b + 2];
      const hy = cars[b + 3];
      const dx = X[i] - cars[b];
      const dy = Y[i] - cars[b + 1];
      const along = dx * hx + dy * hy;
      const across = dy * hx - dx * hy;
      const halfL = cars[b + 5];
      const halfW = cars[b + 6];
      const front = halfL + GOAT_HALF;
      const reach = front + cars[b + 4] * CAR_AHEAD;
      if (along < -halfL || along > reach || across > halfW + CAR_SIDE || across < -halfW - CAR_SIDE) {
        continue;
      }
      const threat = along <= front ? 1 : 1 - (along - front) / (reach - front);
      if (threat <= best) {
        continue;
      }
      best = threat;
      const s = sideOf(i, cars, b, along, across, halfW + LEAP_CLEAR);
      WANT[0] = -hy * s;
      WANT[1] = hx * s;
      WANT[2] = TROT_V + (BOLT_V - TROT_V) * threat;
    }
    if (best > 0) {
      MODE[i] = FLEE;
      T[i] = Math.max(T[i], 0.6);
    }
    return best;
  }

  /* The goats near enough a car to look at it, marked from the buckets
   * round each car, so a goat far from every car pays nothing for them:
   * inside a car's reach ahead and its side, or its back bumper, at most r
   * from its middle. */
  const NEAR = new Uint8Array(N);
  function markNear(cars, n) {
    NEAR.fill(0);
    for (let c = 0; c < n; c += 1) {
      const b = c * CAR_STRIDE;
      if (cars[b + 7] === 0) {
        continue;
      }
      const r = cars[b + 5] + GOAT_HALF + cars[b + 4] * CAR_AHEAD + cars[b + 6] + CAR_SIDE;
      for (let j = bj(cars[b + 1] - r); j <= bj(cars[b + 1] + r); j += 1) {
        for (let k = bi(cars[b] - r); k <= bi(cars[b] + r); k += 1) {
          for (let i = head[j * BW + k]; i >= 0; i = next[i]) {
            NEAR[i] = 1;
          }
        }
      }
    }
  }

  /* A goat a car is about to touch leaps clear of it, and one that is
   * leaping goes on through the air until it lands. */
  function leapFromCars(i, cars, n) {
    for (let c = 0; c < n; c += 1) {
      const b = c * CAR_STRIDE;
      if (cars[b + 7] === 0) {
        continue;
      }
      const hx = cars[b + 2];
      const hy = cars[b + 3];
      const dx = X[i] - cars[b];
      const dy = Y[i] - cars[b + 1];
      const along = dx * hx + dy * hy;
      const across = dy * hx - dx * hy;
      const halfL = cars[b + 5];
      const halfW = cars[b + 6];
      const side = halfW + 0.3;
      if (along < -halfL - GOAT_HALF || along > halfL + GOAT_HALF + cars[b + 4] * CAR_LEAP || across > side || across < -side) {
        continue;
      }
      const clear = halfW + LEAP_CLEAR;
      const s = sideOf(i, cars, b, along, across, clear);
      const go = (clear - across * s) / LEAP_T;
      LEAP[i] = LEAP_T;
      LVX[i] = -hy * s * go;
      LVY[i] = hx * s * go;
      MODE[i] = FLEE;
      T[i] = 0.8;
      return true;
    }
    return false;
  }

  function stepLeap(i, dt) {
    const t = Math.min(dt, LEAP[i]);
    X[i] += LVX[i] * t;
    Y[i] += LVY[i] * t;
    VX[i] = LVX[i] * 0.3;
    VY[i] = LVY[i] * 0.3;
    const sp = len(LVX[i], LVY[i]);
    if (sp > 1e-3) {
      face(i, LVX[i] / sp, LVY[i] / sp, dt);
    }
    LEAP[i] -= dt;
    const u = Math.max(0, Math.min(1, 1 - LEAP[i] / LEAP_T));
    HOP[i] = LEAP_H * 4 * u * (1 - u);
    if (LEAP[i] <= 0) {
      LEAP[i] = 0;
      HOP[i] = 0;
    }
  }

  /* Goats near a bolting goat go with it. */
  function thinkFollow(i) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    let pace = 0;
    const x = X[i];
    const y = Y[i];
    const ci = bi(x);
    const cj = bj(y);
    for (let j = Math.max(0, cj - 1); j <= Math.min(BH - 1, cj + 1); j += 1) {
      for (let c = Math.max(0, ci - 1); c <= Math.min(BW - 1, ci + 1); c += 1) {
        for (let k = head[j * BW + c]; k >= 0; k = next[k]) {
          if (k === i || MODE[k] !== FLEE || FEAR[k] < 0.15 || SPEED[k] < TROT_V * 0.8) {
            continue;
          }
          if (len(X[k] - x, Y[k] - y) < FOLLOW) {
            sx += VX[k];
            sy += VY[k];
            pace += SPEED[k];
            n += 1;
          }
        }
      }
    }
    if (!n) {
      return;
    }
    const l = len(sx, sy);
    if (l > 1e-3) {
      WANT[0] = sx / l;
      WANT[1] = sy / l;
      WANT[2] = Math.max(WANT[2], (pace / n) * FOLLOW_K);
      /* A follower's fear stays under what makes a goat worth following,
       * so a herd goes with the goats you push and the whole neighbourhood
       * does not go with the herd. */
      MODE[i] = FLEE;
      FEAR[i] = Math.max(FEAR[i], 0.1);
      T[i] = 0.8;
    }
  }

  /* Still running from a craft that has gone: on the way it was going,
   * slowing, until it settles. */
  function thinkCalm(i, dt) {
    T[i] -= dt;
    if (T[i] <= 0) {
      MODE[i] = GRAZE;
      T[i] = 1 + rnd(i) * 3;
      return;
    }
    const l = len(VX[i], VY[i]);
    if (l > 1e-3) {
      WANT[0] = VX[i] / l;
      WANT[1] = VY[i] / l;
      WANT[2] = Math.max(TROT_V * 0.6, l * 0.9);
    }
  }

  /* Grazing: a stand, or a stroll to somewhere near. */
  function thinkGraze(i, dt) {
    T[i] -= dt;
    if (T[i] <= 0) {
      T[i] = 2 + rnd(i) * 6;
      if (rnd(i) < 0.5) {
        TX[i] = X[i];
        TY[i] = Y[i];
      } else {
        TX[i] = X[i] + (rnd(i) - 0.5) * 12;
        TY[i] = Y[i] + (rnd(i) - 0.5) * 12;
      }
    }
    const dx = TX[i] - X[i];
    const dy = TY[i] - Y[i];
    const d = len(dx, dy);
    if (d > 0.4) {
      WANT[0] = dx / d;
      WANT[1] = dy / d;
      WANT[2] = GRAZE_V;
    }
  }

  /* Room from the others, into PUSH. */
  const PUSH = new Float64Array(2);
  function room(i) {
    let px = 0;
    let py = 0;
    const x = X[i];
    const y = Y[i];
    const ci = bi(x);
    const cj = bj(y);
    for (let j = Math.max(0, cj - 1); j <= Math.min(BH - 1, cj + 1); j += 1) {
      for (let c = Math.max(0, ci - 1); c <= Math.min(BW - 1, ci + 1); c += 1) {
        for (let k = head[j * BW + c]; k >= 0; k = next[k]) {
          if (k === i) {
            continue;
          }
          const dx = x - X[k];
          const dy = y - Y[k];
          const d = len(dx, dy);
          if (d < SPACE && d > 1e-4) {
            px += (dx / d) * (SPACE - d);
            py += (dy / d) * (SPACE - d);
          } else if (d <= 1e-4) {
            px += (i - k) * 0.01;
          }
        }
      }
    }
    PUSH[0] = px;
    PUSH[1] = py;
  }

  function stepGoat(i, dt, hasCraft, cx, cy, ch, cars, nCars) {
    if (LEAP[i] > 0) {
      stepLeap(i, dt);
      return;
    }
    if (nCars && MODE[i] !== HOME && leapFromCars(i, cars, nCars)) {
      stepLeap(i, dt);
      return;
    }
    WANT[0] = 0;
    WANT[1] = 0;
    WANT[2] = 0;
    if (MODE[i] === HOME) {
      thinkHome(i, dt);
    } else {
      const fromCar = nCars ? thinkCars(i, cars, nCars) : 0;
      const threat = !fromCar && hasCraft ? thinkCraft(i, cx, cy, ch) : 0;
      if (!threat && !fromCar) {
        if (MODE[i] === FLEE) {
          thinkCalm(i, dt);
        }
        thinkFollow(i);
        if (MODE[i] === GRAZE && WANT[2] === 0) {
          thinkGraze(i, dt);
        }
      }
    }
    FEAR[i] = Math.max(0, FEAR[i] - dt * 0.6);
    room(i);
    let wx = WANT[0];
    let wy = WANT[1];
    let want = WANT[2];
    if (want > 0) {
      steer(i, wx, wy, 0.6 + want * 0.3);
      wx = WAY[0];
      wy = WAY[1];
      if (wx === 0 && wy === 0) {
        want *= 0.2;
      }
    }
    const tvx = wx * want + PUSH[0] * 2.5;
    const tvy = wy * want + PUSH[1] * 2.5;
    const k = Math.min(1, ACCEL * dt);
    VX[i] += (tvx - VX[i]) * k;
    VY[i] += (tvy - VY[i]) * k;
    const sp = len(VX[i], VY[i]);
    SPEED[i] = sp;
    if (sp > 0.05) {
      face(i, VX[i] / sp, VY[i] / sp, dt);
    }
    move(i, VX[i] * dt, VY[i] * dt);
    if (MODE[i] === HOME) {
      X[i] = Math.min(GARAGE_PEN.x1, Math.max(GARAGE_PEN.x0, X[i]));
      Y[i] = Math.min(GARAGE_PEN.y1, Math.max(GARAGE_PEN.y0, Y[i]));
    } else if (X[i] > GARAGE_IN.x0 && X[i] < GARAGE_IN.x1 && Y[i] > GARAGE_IN.y0 && Y[i] < GARAGE_IN.y1) {
      MODE[i] = HOME;
      HOME_AT[i] = clock;
      FEAR[i] = 0;
      T[i] = 0;
      homeCount += 1;
      events.push({ kind: 'home', goat: i, count: homeCount, at: clock - Math.max(0, firstRun) });
    }
    /* A bounce in the step, quicker and higher at a run. */
    let ph = PHASE[i] + sp * dt * 1.6;
    ph -= Math.floor(ph);
    PHASE[i] = ph;
    const f = ph < 0.5 ? ph : 1 - ph;
    HOP[i] = sp > 0.15 ? f * Math.min(0.22, 0.03 + sp * 0.04) : 0;
  }

  function step(dt, craft, cars = null, nCars = 0) {
    if (!(dt > 0)) {
      return;
    }
    clock += dt;
    head.fill(-1);
    for (let i = 0; i < N; i += 1) {
      const b = bj(Y[i]) * BW + bi(X[i]);
      next[i] = head[b];
      head[b] = i;
    }
    const has = Boolean(craft);
    const cx = has ? craft.x : 0;
    const cy = has ? craft.y : 0;
    const ch = has ? craft.h : 0;
    const nc = cars ? nCars : 0;
    if (nc) {
      markNear(cars, nc);
    }
    for (let i = 0; i < N; i += 1) {
      stepGoat(i, dt, has, cx, cy, ch, cars, nc && NEAR[i] ? nc : 0);
    }
  }

  return {
    names,
    count: N,
    X, Y, FX, FY, HOP, PHASE, SPEED, MODE, FEAR, HOME_AT,
    step,
    events,
    /* How many are home, and how long since the first ran, seconds. */
    homeCount: () => homeCount,
    clock: () => clock,
    sinceFirst: () => (firstRun < 0 ? 0 : clock - firstRun),
    started: () => firstRun >= 0,
    /* For a check: put goat i at (x, y), standing. */
    place(i, x, y) {
      X[i] = x;
      Y[i] = y;
      VX[i] = 0;
      VY[i] = 0;
    },
  };
}
