/*
 * closecall.js: flying close to things. FREESTYLE-MAPS-PLAN.md section 7
 * item 3, Stage C. Pure given a colliders object with the collide.js API
 * (gapAt is the only query it asks): no Three.js, no DOM, no clock of its
 * own, no JS trigonometry, and nothing allocated on a feed except the event
 * a paying close call leaves. It runs in the town and on built maps, and in
 * Node against their real colliders (scripts/counter-check.js).
 *
 * FOUR THINGS SCORE, and every one of them is geometry, so none of them can
 * misname anything (section 7, "Reliability"):
 *
 *   SKIM      Along a wall, or over a roof, within SKIM_NEAR of it, above
 *             the speed floor. Held, like a skate game's manual: it builds
 *             points for every millisecond it is held, at a rate that grows
 *             with speed and with closeness, and a held skim keeps the
 *             counter's combo open (src/game/score.js hold). Called a Wall
 *             skim or a Roof skim by where most of its time was spent: a
 *             solid beside the path or a solid's top under it.
 *   THREAD    Solids within CC_THREAD_NEAR on both sides of the path at
 *             once (within THREAD_PAIR_MS of each other, so two posts a
 *             stride apart along the line still count): a slot, a pair of
 *             posts, a lane between two containers. A passage, priced once.
 *   UNDER     A solid over the craft within UNDER_NEAR while it moves: a
 *             bridge, a deck, a crane jib, a billboard, a container's roof.
 *             A passage, priced once.
 *   LOW PASS  The ground within LOW_NEAR, with no solid under the craft.
 *             Held like a skim and worth less, LOW_POINTS_PER_S against
 *             SKIM_POINTS_PER_S, because the ground is everywhere and a wall
 *             has to be found. It does not hold the combo open.
 *
 * HOW NEAR, FROM WHAT. Every distance is the craft's clearance: the distance
 * from its centre of gravity to the surface, less CRAFT_WORLD_R, the sphere a
 * tumbling five inch sweeps (src/game/collide.js), floored at zero. One
 * number for every direction, so a skim at 0.3 m means the same thing
 * beside a wall and over a roof.
 *
 * THE PROBES ARE THE EXISTING DISTANCE QUERY, POINTED. Colliders.gapAt
 * answers the distance to the nearest solid from a point, exactly, for boxes
 * and capsules alike. A direction is asked by walking that answer along a
 * ray (sphere tracing): from the centre, step by the distance to the nearest
 * solid, which by construction cannot step past one, until the distance is
 * under CC_RAY_R (the ray has hit something within a fist's width of its
 * line) or the ray's reach has run out. Four rays a feed: up (UNDER), down
 * (a roof), and level to either side of the path (a wall, a post). No new
 * geometry, and in open air a feed is ONE query: when nothing is within the
 * longest reach of the centre, no ray is walked at all.
 *
 * A ray as thick as a fist, CC_RAY_R, rather than a line, because a thin
 * thing crossed at speed is a thin target: a lamp post 0.2 m across passed at
 * 30 m/s is abreast of the craft for under one feed, and a ray with no width
 * would miss it on most passes. With the width it is abreast for 0.4 m of
 * travel, which a feed every 8 ms catches up to 50 m/s. The same width is
 * why a feed whose centre is itself within CC_RAY_R of a solid measures
 * nothing: that is the hull in contact, not a close call, and every ray
 * would start inside the thing it is touching.
 *
 * WHAT A FEED IS. The plan's: every 8 ms of simulation time (CC_EVERY), from
 * the craft's world position and velocity at that step, the ground height
 * under it (the map's own `height`, which the shell already asks), and two
 * flags since the last feed: `hard`, one physics step that changed the
 * craft's velocity by GRAZE_SPEED_MAX or more (the shell's STOP measure:
 * nothing but a contact does 4 m/s in a millisecond), and `crashed`, the
 * shell called a crash. Every duration is a difference of step counts.
 *
 * NEVER PAYS FOR A CRASH (section 14). A hard contact or a crash loses every
 * close call that is open, held or waiting out its grace, and every one
 * waiting to pay. A close call that ends clean waits CC_CONFIRM_MS more,
 * then chase.js's REPORT_LAG_MS for the shell's crash (decided at the end of
 * a frame, up to 100 steps late, and told through bail()), before it pays.
 * So a skim that ends in the wall, an under that ends in the pier and a
 * thread that clips a post all pay nothing, and every paying test in
 * scripts/score-selftest.js has a crash twin that must pay nothing. A
 * gentle touch (under GRAZE_SPEED_MAX) is a tap, which the trick recogniser
 * already pays for; here it is only a feed too close to count.
 *
 * THE SHELL'S SIDE:
 *
 *   cc.setColliders(colliders)          when a map is built; null for none
 *   cc.step(step, craft, groundY, hard, crashed)
 *                                       every CC_EVERY steps of the lap
 *                                       clock; craft is { x, y, z, vx, vy,
 *                                       vz }, world metres and m/s
 *   cc.tick(step)                       once a frame: pays what has waited
 *                                       while no feed came (the craft
 *                                       landed)
 *   cc.bail(step, why)                  a crash the shell decided late
 *   cc.cut()                            the craft was put somewhere
 *   cc.live                             the open skim, for the meter: one
 *                                       object, rewritten in place
 *   cc.events                           oldest first: { kind, name, value,
 *                                       holdMs, clearance, speed, step,
 *                                       paidStep }, kind 'skim', 'thread',
 *                                       'under' or 'lowpass', or 'lost' with
 *                                       `of` and `why`. The shell reads and
 *                                       empties it (events.length = 0)
 *   cc.reset()                          a new run
 *
 * THE PRICES are named below with their reasons, set against the rest of
 * the counter: a named gap is 100 to 2500, a Flip is 50 and a Master trick
 * 600 to 850, and a chase tail 50 a second (src/game/chase.js).
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

import { CRAFT_WORLD_R, GRAZE_SPEED_MAX } from './collide.js';
import { REPORT_LAG_MS } from './chase.js';

/* The physics runs at 1 kHz: a step is a millisecond. */
const STEP_MS = 1;

/* How often the shell feeds it, in steps of the lap clock: the plan's
 * close call period, 8 ms, the chase's CHASE_EVERY. */
export const CC_EVERY = 8;

/*
 * THE HARD CONTACT, as the shell measures it: a step that changed the
 * craft's velocity by this much, m/s. It is collide.js's GRAZE_SPEED_MAX,
 * the line the recogniser, the impact cue and the crash reset already draw
 * between a deliberate touch and a hit, so there is no third threshold.
 */
export const CC_HARD_DV = GRAZE_SPEED_MAX;

/*
 * THE SPEED FLOOR, m/s: 6 is about 22 km/h. Nothing is a close call below
 * it, so a craft taking off beside a wall, hovering under a deck or landing
 * on a roof earns nothing, and a pilot creeping along a facade at walking
 * pace is positioning, not skimming. Freestyle lines are flown at 10 to
 * 25 m/s, so every line a pilot would call a skim clears it.
 */
export const CC_SPEED_MIN = 6;

/*
 * THE SPEED REFERENCE, m/s, where the speed factor is 1, and the most it
 * can be. Points grow in proportion to speed: 0.6 at the floor, 1 at 10 m/s,
 * 2 at 20, and no more than CC_SPEED_CAP (30 m/s and over), so the fastest
 * dive in the game is worth three times a brisk line and not ten.
 */
export const CC_SPEED_REF = 10;
export const CC_SPEED_CAP = 3;

/*
 * HOW NEAR, in metres of clearance (see the header):
 *
 *   SKIM_NEAR       1.0   the plan's "within about a metre"
 *   CC_THREAD_NEAR  1.25  each side, so a slot up to about 2.85 m wide
 *                         between its faces is a thread: the town's gap rule
 *                         (GAP_MIN, 1.4 m in src/props/parts.js) is the
 *                         narrowest slot there is, a pair of posts two
 *                         metres apart is threading, not flying past, and a
 *                         forty foot container flown end to end, 2.35 m
 *                         inside, is a thread from anywhere in its middle
 *                         half metre (at 1.0 it was one only dead centre)
 *   UNDER_NEAR      3.0   the plan's "within a few metres": a footbridge
 *                         deck over a five inch at head height is about 2 m
 *   LOW_NEAR        1.0   a metre over the ground, the skim's own reach
 *
 * Closeness is priced by a factor from 1 at the reach to 2 with the hull
 * touching, straight in between, the shape chase.js gives its thread and
 * hurdle, so a skim at 0.2 m is worth 1.8 times one at a metre.
 */
export const SKIM_NEAR = 1.0;
export const CC_THREAD_NEAR = 1.25;
export const UNDER_NEAR = 3.0;
export const LOW_NEAR = 1.0;

/* How far apart in time the two sides of a thread may be seen and still be
 * "at once", in ms: two posts a craft passes at a slant are abreast of it
 * one after the other, a stride apart. 64 ms is 1.3 m of travel at 20 m/s,
 * which is a pair of posts, and not a slalom. */
export const THREAD_PAIR_MS = 64;

/* A flicker out of the band shorter than this is forgiven, in ms: an
 * alley between two facades at 20 m/s is 4 m, and the line along the street
 * is one skim. Longer, and the close call is over and pays. */
export const CC_GRACE_MS = 200;

/* The shortest skim or low pass that pays, in ms. Under half a second a
 * craft has passed a wall, not skimmed it: at 15 m/s it is 6 m of wall. An
 * under or a thread is a passage and pays from its first feed. */
export const SKIM_MIN_MS = 400;
export const LOW_MIN_MS = 400;

/* The most a held skim or low pass builds for, in ms. Past it the hold
 * still counts (and a skim still keeps the combo open) but it adds no more
 * points: the combo is where risk compounds, and one endless low pass round
 * the yard must not be worth more than the line it is part of. */
export const CC_HOLD_CAP_MS = 8000;

/*
 * THE PRICES.
 *
 *   SKIM_POINTS_PER_S   100   a second at 10 m/s at the reach, twice a
 *                             chase tail's 50 a second, because a wall has
 *                             to be found and held without a car to follow:
 *                             one second along a facade at 15 m/s and 0.4 m
 *                             is 100 x 1.5 x 1.6 = 240, a Powerloop's worth
 *   LOW_POINTS_PER_S     40   the ground, worth less (the plan's words):
 *                             two fifths of a skim at the same speed and
 *                             closeness
 *   UNDER_POINTS        150   a passage, times speed and closeness: 150 to
 *                             300 at 10 m/s, 90 at the floor and 900 at
 *                             most, a small named gap's worth at speed
 *   CC_THREAD_POINTS    250   a passage, times speed and closeness: 250 to
 *                             500 at 10 m/s, 150 at the floor and 1500 at
 *                             most, more than an under because both sides
 *                             are close, and a car thread's 300 to 600 at
 *                             ordinary speed
 */
export const SKIM_POINTS_PER_S = 100;
export const LOW_POINTS_PER_S = 40;
export const UNDER_POINTS = 150;
export const CC_THREAD_POINTS = 250;

/* The clean window after a close call ends, in ms, before the report lag:
 * a quarter of a second, the named gaps' own (src/game/gaps.js). A craft that
 * leaves a wall and hits the next thing inside it crashed on that line. */
export const CC_CONFIRM_MS = 250;

/*
 * THE RAYS. CC_RAY_R is how thick each probe is, metres (see the header),
 * and CC_RAY_STEPS the most distance queries one ray may walk. A ray along a
 * face steps by its distance from the face each time, so it is the grazing
 * ray that is long: one 0.3 m off a wall walks 3 m in eleven. A ray that
 * runs out of steps reports nothing, which is never paying for something.
 */
export const CC_RAY_R = 0.1;
export const CC_RAY_STEPS = 24;

/* A feed further than this after the last one is a gap, not a stride, in
 * ms: the lap clock ran on with the craft landed. Nothing is held across it. */
export const CC_GAP_MS = 250;

/* Level speed under this, m/s, has no side to it: the lateral rays are not
 * cast for a craft going straight up or down. */
const LATERAL_MIN = 3;

/* The kinds, in the order the state arrays hold them. */
const K_SKIM = 0;
const K_THREAD = 1;
const K_UNDER = 2;
const K_LOW = 3;
const KINDS = 4;
export const CC_KINDS = ['skim', 'thread', 'under', 'lowpass'];

/* At most this many close calls wait out their windows at once. */
const PEND_MAX = 16;

/* A clearance, floored at the hull touching. */
function clamp0(c) {
  return c > 0 ? c : 0;
}

/* Points grow with speed: see CC_SPEED_REF. */
export function speedFactor(v) {
  const f = v / CC_SPEED_REF;
  return f > CC_SPEED_CAP ? CC_SPEED_CAP : (f > 0 ? f : 0);
}

/* And with closeness: 1 at `near`, 2 touching. */
export function closeFactor(clear, near) {
  const c = clear < 0 ? 0 : (clear > near ? near : clear);
  return 2 - c / near;
}

export class CloseCalls {
  constructor(colliders) {
    this.col = null;
    this.on = new Uint8Array(KINDS);
    this.heldPrev = new Uint8Array(KINDS);
    this.start = new Float64Array(KINDS);
    this.lastHeld = new Float64Array(KINDS);
    this.holdMs = new Float64Array(KINDS);
    this.pts = new Float64Array(KINDS);
    this.minClear = new Float64Array(KINDS);
    this.vSum = new Float64Array(KINDS);
    this.vN = new Float64Array(KINDS);
    this.roofMs = new Float64Array(KINDS);
    this.pKind = new Int8Array(PEND_MAX);
    this.pName = new Array(PEND_MAX).fill('');
    this.pFrom = new Float64Array(PEND_MAX);
    this.pDue = new Float64Array(PEND_MAX);
    this.pValue = new Float64Array(PEND_MAX);
    this.pHold = new Float64Array(PEND_MAX);
    this.pClear = new Float64Array(PEND_MAX);
    this.pSpeed = new Float64Array(PEND_MAX);
    /* The open skim, for the counter's meter, rewritten in place; and what
     * the last feed measured, for the harness. */
    this.live = {
      skim: false, holdMs: 0, clearance: 0, name: '',
      thread: false, under: false, lowpass: false,
    };
    this.probe = {
      near: Infinity, up: Infinity, down: Infinity, left: Infinity, right: Infinity, ground: Infinity, speed: 0,
    };
    this.events = [];
    /* How many distance queries the feeds asked, for the cost measurement. */
    this.queries = 0;
    this.setColliders(colliders ?? null);
  }

  /* The map's solids. Starts the run over. */
  setColliders(colliders) {
    this.col = colliders && typeof colliders.gapAt === 'function' ? colliders : null;
    this.reset();
  }

  /* A new run: nothing open, nothing waiting, nothing queued. */
  reset() {
    this.restart();
    this.events.length = 0;
  }

  restart() {
    this.fed = false;
    this.lastStep = 0;
    this.nowStep = 0;
    this.on.fill(0);
    this.heldPrev.fill(0);
    this.pKind.fill(-1);
    this.leftAt = -1e15;
    this.rightAt = -1e15;
    this.leftClear = 0;
    this.rightClear = 0;
    this.writeLive();
  }

  /* The craft was put somewhere: nothing is held across the move. What is
   * open ends at its grace the usual way; nothing is lost for it. */
  cut() {
    this.heldPrev.fill(0);
  }

  /*
   * A ray from (px, py, pz) along the unit (dx, dy, dz), at most `reach`
   * long, starting `t0` along it (the centre's own distance to the nearest
   * solid, already asked, is always a safe first step). The distance along
   * it to something within CC_RAY_R of its line, or Infinity.
   */
  ray(px, py, pz, dx, dy, dz, reach, t0) {
    const col = this.col;
    let t = t0;
    for (let k = 0; k < CC_RAY_STEPS; k += 1) {
      if (!(t < reach)) {
        return Infinity;
      }
      this.queries += 1;
      const g = col.gapAt(px + dx * t, py + dy * t, pz + dz * t, reach - t);
      if (!(g < Infinity)) {
        return Infinity;
      }
      if (g <= CC_RAY_R) {
        return t + g;
      }
      t += g;
    }
    return Infinity;
  }

  /*
   * One feed. See the header for the arguments. Returns nothing: the counter
   * reads `live` and `events`.
   */
  step(step, craft, groundY, hard, crashed) {
    if (!(step >= 0 || step < 0)) {
      return;
    }
    if (this.fed && !(step > this.lastStep)) {
      if (step === this.lastStep) {
        return;
      }
      /* Backwards: a new run. */
      this.restart();
    }
    let dt = this.fed ? step - this.lastStep : 0;
    if (dt > CC_GAP_MS) {
      this.heldPrev.fill(0);
      dt = 0;
    }
    this.fed = true;
    this.lastStep = step;
    this.nowStep = step;

    if (hard || crashed) {
      this.bail(step, crashed ? 'crash' : 'contact');
      this.settle(step);
      this.writeLive();
      return;
    }

    const px = craft.x;
    const py = craft.y;
    const pz = craft.z;
    const vx = craft.vx;
    const vy = craft.vy;
    const vz = craft.vz;
    const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const vh = Math.sqrt(vx * vx + vz * vz);
    const R = CRAFT_WORLD_R;
    const pr = this.probe;
    pr.speed = v;
    pr.near = Infinity;
    pr.up = Infinity;
    pr.down = Infinity;
    pr.left = Infinity;
    pr.right = Infinity;
    pr.ground = Infinity;

    /* Too slow for anything, or a craft that has gone to NaN: every close
     * call is out at this feed. */
    const moving = v >= CC_SPEED_MIN;
    let touching = false;
    if (moving && this.col) {
      const reach = UNDER_NEAR + R;
      this.queries += 1;
      const g0 = this.col.gapAt(px, py, pz, reach);
      pr.near = g0;
      if (g0 <= CC_RAY_R) {
        touching = true;
      } else if (g0 < Infinity) {
        pr.up = this.ray(px, py, pz, 0, 1, 0, UNDER_NEAR + R, g0);
        pr.down = this.ray(px, py, pz, 0, -1, 0, SKIM_NEAR + R, g0);
        if (vh >= LATERAL_MIN) {
          const sx = -vz / vh;
          const sz = vx / vh;
          const side = (SKIM_NEAR > CC_THREAD_NEAR ? SKIM_NEAR : CC_THREAD_NEAR) + R;
          pr.left = this.ray(px, py, pz, sx, 0, sz, side, g0);
          pr.right = this.ray(px, py, pz, -sx, 0, -sz, side, g0);
        }
      }
    }
    if (moving && groundY < Infinity && groundY > -Infinity) {
      pr.ground = py - groundY;
    }

    /* Clearances, the hull's: distance less the craft's sweep, floored. */
    const cU = pr.up - R;
    const cD = pr.down - R;
    const cL = pr.left - R;
    const cR = pr.right - R;
    const cG = pr.ground - R;

    /* SKIM: the nearest of a wall beside and a roof under. */
    const side = cL < cR ? cL : cR;
    const skimC = side < cD ? side : cD;
    const skimOn = moving && !touching && skimC <= SKIM_NEAR;
    /* THREAD: each side close, remembered for THREAD_PAIR_MS. */
    if (moving && !touching && cL <= CC_THREAD_NEAR) {
      this.leftAt = step;
      this.leftClear = clamp0(cL);
    }
    if (moving && !touching && cR <= CC_THREAD_NEAR) {
      this.rightAt = step;
      this.rightClear = clamp0(cR);
    }
    const threadOn = moving && !touching
      && (this.leftAt === step || this.rightAt === step)
      && step - this.leftAt <= THREAD_PAIR_MS && step - this.rightAt <= THREAD_PAIR_MS;
    /* UNDER: a solid over the craft. */
    const underOn = moving && !touching && cU <= UNDER_NEAR;
    /* LOW PASS: the ground near, and no solid under the craft to be a roof. */
    const lowOn = moving && !touching && !(pr.down < Infinity) && cG <= LOW_NEAR;

    this.update(K_SKIM, skimOn, step, dt, clamp0(skimC), v, SKIM_POINTS_PER_S, SKIM_NEAR, cD < side);
    this.update(K_THREAD, threadOn, step, dt, 0.5 * (this.leftClear + this.rightClear), v, 0, CC_THREAD_NEAR, false);
    this.update(K_UNDER, underOn, step, dt, clamp0(cU), v, 0, UNDER_NEAR, false);
    this.update(K_LOW, lowOn, step, dt, clamp0(cG), v, LOW_POINTS_PER_S, LOW_NEAR, false);
    this.settle(step);
    this.writeLive();
  }

  /*
   * One kind's close call at this feed: open it, hold it, or, out of the
   * band for longer than the grace, end it. A held feed that follows a held
   * feed adds the time between them, and for a held kind (a rate above 0)
   * the points that time was worth at this feed's speed and clearance.
   */
  update(k, inBand, step, dt, clear, v, rate, near, roof) {
    if (inBand) {
      if (!this.on[k]) {
        this.on[k] = 1;
        this.start[k] = step;
        this.holdMs[k] = 0;
        this.pts[k] = 0;
        this.minClear[k] = clear;
        this.vSum[k] = v;
        this.vN[k] = 1;
        this.roofMs[k] = 0;
      } else {
        if (this.heldPrev[k] && dt > 0) {
          const before = this.holdMs[k];
          this.holdMs[k] = before + dt * STEP_MS;
          if (roof) {
            this.roofMs[k] += dt * STEP_MS;
          }
          if (rate > 0 && before < CC_HOLD_CAP_MS) {
            const room = CC_HOLD_CAP_MS - before;
            const ms = dt * STEP_MS < room ? dt * STEP_MS : room;
            this.pts[k] += (ms / 1000) * rate * speedFactor(v) * closeFactor(clear, near);
          }
        }
        if (clear < this.minClear[k]) {
          this.minClear[k] = clear;
        }
        this.vSum[k] += v;
        this.vN[k] += 1;
      }
      this.heldPrev[k] = 1;
      this.lastHeld[k] = step;
      return;
    }
    if (!this.on[k]) {
      return;
    }
    this.heldPrev[k] = 0;
    if ((step - this.lastHeld[k]) * STEP_MS > CC_GRACE_MS) {
      this.end(k);
    }
  }

  /* What an open close call is worth if it ended now, and what it is
   * called: 0 for one too short to pay. */
  valueOf(k) {
    if (k === K_SKIM) {
      return this.holdMs[k] >= SKIM_MIN_MS ? Math.round(this.pts[k]) : 0;
    }
    if (k === K_LOW) {
      return this.holdMs[k] >= LOW_MIN_MS ? Math.round(this.pts[k]) : 0;
    }
    const vMean = this.vN[k] > 0 ? this.vSum[k] / this.vN[k] : 0;
    if (k === K_UNDER) {
      return Math.round(UNDER_POINTS * speedFactor(vMean) * closeFactor(this.minClear[k], UNDER_NEAR));
    }
    return Math.round(CC_THREAD_POINTS * speedFactor(vMean) * closeFactor(this.minClear[k], CC_THREAD_NEAR));
  }

  nameOf(k) {
    if (k === K_SKIM) {
      return this.roofMs[k] * 2 > this.holdMs[k] ? 'Roof skim' : 'Wall skim';
    }
    if (k === K_THREAD) {
      return 'Thread';
    }
    if (k === K_UNDER) {
      return 'Under';
    }
    return 'Low pass';
  }

  /* The close call is over, clean: it waits out its window if it is worth
   * anything, and is forgotten if not. */
  end(k) {
    const value = this.valueOf(k);
    if (value > 0) {
      for (let i = 0; i < PEND_MAX; i += 1) {
        if (this.pKind[i] < 0) {
          this.pKind[i] = k;
          this.pName[i] = this.nameOf(k);
          this.pFrom[i] = this.start[k];
          this.pDue[i] = this.lastHeld[k] + CC_CONFIRM_MS / STEP_MS;
          this.pValue[i] = value;
          this.pHold[i] = this.holdMs[k];
          this.pClear[i] = this.minClear[k];
          this.pSpeed[i] = this.vN[k] > 0 ? this.vSum[k] / this.vN[k] : 0;
          break;
        }
      }
    }
    this.on[k] = 0;
    this.heldPrev[k] = 0;
  }

  /* Pay what has waited out its window and the report lag clean, oldest
   * first, so the queue reads in the order things happened. */
  settle(step) {
    for (;;) {
      let pick = -1;
      for (let i = 0; i < PEND_MAX; i += 1) {
        if (this.pKind[i] >= 0 && step >= this.pDue[i] + REPORT_LAG_MS / STEP_MS
          && (pick < 0 || this.pFrom[i] < this.pFrom[pick])) {
          pick = i;
        }
      }
      if (pick < 0) {
        return;
      }
      this.events.push({
        kind: CC_KINDS[this.pKind[pick]],
        name: this.pName[pick],
        value: this.pValue[pick],
        holdMs: this.pHold[pick],
        clearance: this.pClear[pick],
        speed: this.pSpeed[pick],
        step: this.pFrom[pick],
        paidStep: step,
      });
      this.pKind[pick] = -1;
    }
  }

  /*
   * Once a frame, with the lap clock: what has waited while no feed came
   * (the craft landed, a turtle wait) pays now. A flying craft is fed every
   * CC_EVERY steps and settles at its feeds, so while feeds are coming this
   * does nothing, and what pays when is decided by the step stream and not
   * by where a frame ended.
   */
  tick(step) {
    if (this.fed && step - this.lastStep < CC_EVERY) {
      return;
    }
    if (step >= this.nowStep) {
      this.nowStep = step;
      /* A close call left open when the feeds stopped ends at its grace,
       * as it would have at a feed. */
      for (let k = 0; k < KINDS; k += 1) {
        if (this.on[k] && (step - this.lastHeld[k]) * STEP_MS > CC_GRACE_MS) {
          this.end(k);
        }
      }
      this.settle(step);
      this.writeLive();
    }
  }

  /*
   * A hard contact or a crash at `atStep`, or up to REPORT_LAG_MS before it
   * for one the shell decided at the end of a frame. Every open close call
   * is lost, and every waiting one whose window reached that far back. A
   * `lost` event is queued for each that would have paid, value 0, for the
   * harness: the counter only takes events that pay.
   */
  bail(atStep, why) {
    const w = why || 'crash';
    for (let k = 0; k < KINDS; k += 1) {
      if (this.on[k]) {
        if (this.valueOf(k) > 0) {
          this.lost(CC_KINDS[k], this.nameOf(k), this.start[k], atStep, w, this.holdMs[k]);
        }
        this.on[k] = 0;
        this.heldPrev[k] = 0;
      }
    }
    const since = atStep - REPORT_LAG_MS / STEP_MS;
    for (let i = 0; i < PEND_MAX; i += 1) {
      if (this.pKind[i] >= 0 && this.pFrom[i] <= atStep && this.pDue[i] >= since) {
        this.lost(CC_KINDS[this.pKind[i]], this.pName[i], this.pFrom[i], atStep, w, this.pHold[i]);
        this.pKind[i] = -1;
      }
    }
    this.leftAt = -1e15;
    this.rightAt = -1e15;
    this.writeLive();
  }

  lost(of, name, from, atStep, why, holdMs) {
    this.events.push({
      kind: 'lost', of, name, why, value: 0, holdMs, clearance: 0, speed: 0, step: from, paidStep: atStep,
    });
  }

  /* The open close calls, into `live`. The skim is the counter's meter;
   * the rest are for the harness. */
  writeLive() {
    const L = this.live;
    L.skim = this.on[K_SKIM] === 1;
    L.holdMs = L.skim ? this.holdMs[K_SKIM] : 0;
    L.clearance = L.skim ? this.minClear[K_SKIM] : 0;
    L.name = L.skim ? this.nameOf(K_SKIM) : '';
    L.thread = this.on[K_THREAD] === 1;
    L.under = this.on[K_UNDER] === 1;
    L.lowpass = this.on[K_LOW] === 1;
  }

  /* Is a skim held at the last feed (not waiting out a flicker)? The
   * counter keeps its combo open on it. */
  skimHeld() {
    return this.on[K_SKIM] === 1 && this.heldPrev[K_SKIM] === 1;
  }

  /* How many close calls are waiting to pay, for the harness. */
  waiting() {
    let n = 0;
    for (let i = 0; i < PEND_MAX; i += 1) {
      n += this.pKind[i] >= 0 ? 1 : 0;
    }
    return n;
  }
}
