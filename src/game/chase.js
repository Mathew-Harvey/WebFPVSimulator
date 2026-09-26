/*
 * chase.js: chasing the cars. The Tail meter and the chase events of
 * FREESTYLE-MAPS-PLAN.md section 7 item 4, Stage E. Pure: no Three.js, no
 * DOM, no clock of its own and no JS trigonometry, and nothing allocated on
 * a step, so it runs in Node against scripted paths and against the real
 * module's cars (scripts/chase-check.js), and the same inputs give the same
 * answers to the bit.
 *
 * THREE THINGS SCORE, and every one of them is geometry, so none of them
 * can misname anything (section 7, "Reliability"):
 *
 *   TAIL     Holding a moving car's tail: behind it along the way it has
 *            just driven, inside TAIL_FAR of its rear, within TAIL_SIDE of
 *            its line, no higher than TAIL_ABOVE over its roof, going the way
 *            it went at the speed it went there. It builds a meter while it
 *            is held, forgives a flicker shorter than TAIL_GRACE_MS, and
 *            when it is lost for longer it banks as one event with how long
 *            it was held and which car it was. The drift car's tail is worth
 *            TAIL_DRIFT_WEIGHT times an ordinary car's.
 *   THREAD   Passing between two moving cars, both within THREAD_NEAR of the
 *            craft as it crosses the line between them, at their body
 *            height. Decided at the crossing, paid THREAD_CONFIRM_MS later.
 *   HURDLE   The plan's UNDER, replaced (see below): crossing a moving car's
 *            whole footprint, in one side and out of the opposite one, never
 *            more than HURDLE_HIGH over its roof and never under it. Side to
 *            side it is a Hurdle; end to end, over the roof from its tail to
 *            its nose or back, a Leapfrog. Decided on the way out, paid
 *            HURDLE_CONFIRM_MS later.
 *
 * NEVER PAYS FOR A CRASH (section 14). A contact with any car, or any crash
 * the shell calls, loses everything open: the tail being held, a tail
 * waiting out its grace, and every thread and hurdle waiting out its window.
 * Nothing pays until its window has passed clean, so a thread that ends in
 * a car, a hurdle that clips the roof and a tail that ends in the car's back
 * bumper all score nothing. Every scoring test in chase-check.js has a crash
 * twin that must score nothing.
 *
 * THE CORRECTION TO THE PLAN. Section 7 has "passing under a moving box
 * truck's clearance". world.c models a car as one box from its clearance up
 * (plantworld.js addVehicle), and an honest box truck's clearance is its
 * chassis over the road, a few tens of centimetres: a five inch cannot pass
 * under it and a whoop only just could. An event nobody can fly is not an
 * event, so the one over the car replaces it: low over the roof, across the
 * whole footprint. Recorded in PROGRESS.md, 2026-09-26, for the owner to
 * overturn.
 *
 * WHAT THE SHELL FEEDS IT, once every CHASE_EVERY steps of the lap clock
 * (the plan's close calls are judged every 8 ms of simulation time), or
 * every step; any steady stride up to CHASE_STRIDE_MAX works, because every
 * duration is a difference of step counts and the crossings are swept
 * between feeds:
 *
 *   chase.setCars(cars)     when a map's cars are placed: one object a car,
 *                           { slot, length, width, height, clearance,
 *                           drift, label }, Three.js metres, the same
 *                           numbers addVehicle was given; drift true for the
 *                           drift car. A slot with no body here is not
 *                           chased. setCars([]) for a map with none.
 *   chase.step(step, craft, poses, touched, crashed)
 *                           step: the lap clock in whole 1 ms steps, the
 *                             clock the poses are at (setVehicleClock's)
 *                           craft: { x, y, z, vx, vy, vz }, the craft's
 *                             centre and velocity, Three.js world metres and
 *                             m/s, at that step
 *                           poses: readVehicles' array, read at that step
 *                           touched: the craft touched any car since the
 *                             last call (sim_world_vehicle_contacts)
 *                           crashed: the shell called a crash since then
 *   chase.bail(step, why)   a crash the shell decided late, at the end of a
 *                           frame, for a step up to REPORT_LAG_MS before
 *                           `step`: what score.crash() is told, told here too
 *   chase.view()            once a frame: the meter, one object reused
 *   chase.drainEvents()     once a frame: what happened, or null
 *   chase.reset()           a new run, a restart, a new map
 *
 * A step that goes backwards is a new run, as a seek is: everything open is
 * dropped and nothing is paid. A step more than CHASE_GAP_MS after the last
 * (the lap clock ran on while the craft sat landed) keeps what was earned but
 * sweeps nothing across the gap.
 *
 * STAGE C'S HOOK. The events are the stream the counter will consume (section
 * 7: one combo fed by five kinds of thing). Every event with `value` above
 * zero is paying (pays(e)); the shell hands each one to a chaseBonus(e) in
 * main.js, the way it hands a found mark to eggBonus, and Stage C fills that
 * in to add e.value to the combo. A `lost` event is what the combo's bail
 * would hear. And view().holding says a tail is being held right now, for
 * the counter to keep its window open while it builds, the way the plan's
 * Skim keeps the combo alive like a skate game manual. Until Stage C nothing
 * here reaches the score: the numbers are shown, not banked.
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

/* src/game/plantworld.js MOVER_SLOTS, which is world.c's WORLD_MAX_MOVERS:
 * the slots readVehicles fills. Written out rather than imported so this
 * file stays free of the physics shell; chase-check.js holds them equal. */
export const CHASE_SLOTS = 64;

/* The physics runs at 1 kHz, so a step is a millisecond and a difference of
 * step counts is a duration in milliseconds. */
export const STEP_MS = 1;

/* How often the shell feeds it, in steps: the plan's close call period. */
export const CHASE_EVERY = 8;

/* The longest stride the swept tests are sized for, in steps. The shell
 * never runs more than 100 steps a frame (main.js caps dt at 100 ms), so
 * even a feed once a frame fits; NEAR_SLACK below is what this buys. */
export const CHASE_STRIDE_MAX = 100;

/* A feed further than this after the last one is a gap, not a stride: the
 * lap clock ran on with the craft landed or waiting to turtle. Nothing is
 * swept across it and no held time is counted over it. */
export const CHASE_GAP_MS = 250;

/*
 * HOW LATE THE SHELL MAY BE TOLD OF A CRASH, in ms. A car contact is known
 * the step it happens (sim_world_vehicle_contacts), but the shell decides a
 * crash once a frame, from the frame's contacts, and a frame is up to 100
 * steps. So nothing pays until REPORT_LAG_MS after its window closes, and a
 * crash told through bail() voids anything whose window reached within
 * REPORT_LAG_MS of it. Over 100 so the frame cap fits inside it with room:
 * the cost is a callout a tenth of a second later.
 */
export const REPORT_LAG_MS = 120;

/* ------------------------------------------------------------------
 * THE TAIL
 * ------------------------------------------------------------------ */

/*
 * How far behind the car's rear, in metres, along the way it drove. Ten
 * metres is half a second behind a car at 20 m/s. A pilot filming a car
 * sits three to eight metres off its bumper; ten gives room to breathe and
 * forty is not following anything.
 */
export const TAIL_FAR = 10;

/*
 * How far off the car's line, in metres, past its half width: the path its
 * centre drove, not the line its nose points down. 1.5 m keeps a craft in
 * the lane behind a 1.8 m car (2.4 m either side of the line) and puts one
 * in the next lane out.
 */
export const TAIL_SIDE = 1.5;

/* How high over its roof, in metres. A chase shot from three metres over the
 * roof is still behind the car; one from fifteen is an aerial. */
export const TAIL_ABOVE = 3;

/*
 * The slowest car worth chasing, m/s: 18 km/h. Below this a car is parked,
 * pulling away or at the end of its road, and a craft sitting behind it is
 * hovering, not chasing. The craft has its own floor, the same times
 * TAIL_RATIO_MIN, so a craft that is not moving never holds anything.
 */
export const TAIL_CAR_MIN = 5;

/*
 * KEEPING ITS SPEED. The craft's speed over the ground, over the car's speed
 * where the car was at the point the craft is over now, within these: a
 * follower on the car's line flies each point the way the car drove it,
 * braking into the bend a moment after it did. 0.8 to 1.25 is 16 to 25
 * m/s behind a car doing 20, the same factor either way, and the band
 * itself holds the average: 4 m/s off for two and a half seconds is out of
 * it. It stops a craft flying through the zone at twice the car's speed, or
 * hovering in it as the car pulls away, from counting.
 */
export const TAIL_RATIO_MIN = 0.8;
export const TAIL_RATIO_MAX = 1.25;

/*
 * And its direction: the craft's ground track within 30 degrees of the way
 * the car drove that point. The cosine, written out because this file takes
 * no angles: the square root of 3 over 2.
 */
export const TAIL_DIR_COS = 0.8660254037844386;

/* A flicker out of the band shorter than this is forgiven, in ms: the meter
 * stops and waits rather than banking. Longer, and the tail is lost and
 * banks. Over the frame cap, so a contact told at a frame's end still finds
 * the tail open. */
export const TAIL_GRACE_MS = 500;

/*
 * The shortest tail that banks anything, in ms. Under a second, a craft that
 * crossed behind a car has not held anything. Longer than TAIL_GRACE_MS on
 * purpose: a tail that is still waiting out its grace when another car's
 * tail is taken has paid (or been lost) before the new one can end, so one
 * waiting tail is ever enough.
 */
export const TAIL_MIN_MS = 1000;

/* The meter's fill is full at this, in ms. It keeps counting past it. */
export const TAIL_FULL_MS = 10000;

/*
 * WHAT A TAIL IS WORTH: points a second held, the price of a Flip in the
 * workbook (src/game/tricks.js), so ten seconds on a car's bumper is worth a
 * Master trick. The drift car's is doubled: it slides, it brakes hard into
 * every bend and its line is not the road's, which is what the owner asked
 * for it for (section 12, decision 8). Provisional, like every price here:
 * Stage C sets them against the rest of the counter.
 */
export const TAIL_POINTS_PER_S = 50;
export const TAIL_DRIFT_WEIGHT = 2;

/* ------------------------------------------------------------------
 * THE THREAD
 * ------------------------------------------------------------------ */

/*
 * How close each car has to be as the craft passes between them, in metres,
 * from the craft's centre to the side of the car's body in plan. Two cars in
 * lanes 3.5 m apart leave 1.7 m between them, 0.85 m either side of a craft
 * in the middle; two metres each is a gap of about four, which is threading
 * and not flying past.
 */
export const THREAD_NEAR = 2;

/* How far over the lower of the two roofs the craft's centre may be and still
 * be between them rather than over the gap, in metres: about a hull. */
export const THREAD_ABOVE = 0.3;

/* Both cars moving, m/s: two parked cars are two walls. */
export const THREAD_CAR_MIN = 3;

/* The clean window after the crossing, in ms. A thread that ends in a car
 * ends inside it. */
export const THREAD_CONFIRM_MS = 400;

/* The same two cars pay again only after this, in ms, so a craft pacing a
 * pair cannot farm their centre line by wobbling across it. */
export const THREAD_AGAIN_MS = 1500;

/* The price, times 1 with both cars THREAD_NEAR away up to 2 with both
 * touching: the price of a Power Split to a Master's. */
export const THREAD_POINTS = 300;

/* ------------------------------------------------------------------
 * THE HURDLE, the plan's UNDER turned over
 * ------------------------------------------------------------------ */

/* The most the craft's centre may be over the roof anywhere across the
 * footprint, in metres. */
export const HURDLE_HIGH = 1.5;

/* The car moving, m/s: hopping a parked car is hopping a box. */
export const HURDLE_CAR_MIN = 3;

/* The clean window after the craft leaves the footprint, in ms. */
export const HURDLE_CONFIRM_MS = 400;

/* The price, times 1 at HURDLE_HIGH up to 2 with the roof skimmed. */
export const HURDLE_POINTS = 250;

/* ------------------------------------------------------------------
 * The machinery
 * ------------------------------------------------------------------ */

/* The trail each car leaves: a point every TRAIL_STEP metres it drives,
 * TRAIL_N of them, 64 m, which covers TAIL_FAR behind the longest body the
 * module takes (50 m, rear 25 m back) with room. */
const TRAIL_STEP = 0.5;
const TRAIL_N = 128;

/* How far a car can drive in a step and still be the same drive, m: world.c
 * VEHICLE_SPEED_MAX, 100 m/s, a tenth of a metre a millisecond. A distance
 * that jumps further, or goes back, is a clock that was set, not a car. */
const DRIVE_PER_STEP = 0.1;

/* How much further than the thread and hurdle reach a car is looked at, m,
 * so the feed before a crossing has it too: a craft closing on a car at 40
 * m/s moves 4 m in the longest stride. */
const NEAR_SLACK = 4;

/* The four sides of a car's footprint, in its own frame: x along its nose,
 * y across it. Opposite sides differ in the lowest bit. */
const SIDE_REAR = 0;
const SIDE_FRONT = 1;
const SIDE_RIGHT = 2;
const SIDE_LEFT = 3;

/* What waits in the pending table. */
const K_NONE = 0;
const K_TAIL = 1;
const K_THREAD = 2;
const K_HURDLE = 3;
const KIND_NAMES = ['', 'tail', 'thread', 'hurdle'];

/* At most this many events wait out their windows at once. THREAD_AGAIN_MS
 * and the one car a hurdle is over keep it to a handful; a full table
 * refuses the newest, which is never paying for something, never the
 * reverse. */
const PEND_MAX = 16;

/*
 * Clip a segment to a car's footprint: Liang and Barsky's, in the car's own
 * frame, the box |x| <= hl, |y| <= hw. Writes the entry and exit parameters
 * (0 to 1 along the segment) and the sides they cross, -1 for an end that
 * is already inside, into the four module scratch values below. False when
 * the segment misses the box.
 */
let clipT0 = 0;
let clipT1 = 1;
let clipS0 = -1;
let clipS1 = -1;

function clipEdge(p, q, side) {
  if (p === 0) {
    return q >= 0;
  }
  const r = q / p;
  if (p < 0) {
    if (r > clipT1) {
      return false;
    }
    if (r > clipT0) {
      clipT0 = r;
      clipS0 = side;
    }
  } else {
    if (r < clipT0) {
      return false;
    }
    if (r < clipT1) {
      clipT1 = r;
      clipS1 = side;
    }
  }
  return true;
}

function clipFootprint(x0, y0, x1, y1, hl, hw) {
  clipT0 = 0;
  clipT1 = 1;
  clipS0 = -1;
  clipS1 = -1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  return clipEdge(-dx, x0 + hl, SIDE_REAR)
    && clipEdge(dx, hl - x0, SIDE_FRONT)
    && clipEdge(-dy, y0 + hw, SIDE_RIGHT)
    && clipEdge(dy, hw - y0, SIDE_LEFT);
}

function abs(x) {
  return x < 0 ? -x : x;
}

/* True for an event that scores: Stage C adds its value to the combo. */
export function pays(e) {
  return !!e && e.kind !== 'lost' && e.value > 0;
}

/* The points a tail held for `ms` is worth. */
export function tailValue(ms, drift) {
  return Math.round((ms * TAIL_POINTS_PER_S * (drift ? TAIL_DRIFT_WEIGHT : 1)) / 1000);
}

export class Chase {
  constructor() {
    const S = CHASE_SLOTS;
    /* The bodies, from setCars. */
    this.bodyOn = new Uint8Array(S);
    this.bodyL = new Float64Array(S);
    this.bodyW = new Float64Array(S);
    this.bodyH = new Float64Array(S);
    this.bodyC = new Float64Array(S);
    this.bodyDrift = new Uint8Array(S);
    this.labels = new Array(S).fill('');
    /* The trails: a ring of TRAIL_N points a car, newest at trHead. */
    const T = S * TRAIL_N;
    this.trX = new Float64Array(T);
    this.trY = new Float64Array(T);
    this.trZ = new Float64Array(T);
    this.trD = new Float64Array(T);
    this.trV = new Float64Array(T);
    this.trHead = new Int32Array(S);
    this.trCount = new Int32Array(S);
    this.trSeen = new Int32Array(S);
    /* Each near car at this feed and at the last one it was near: its road
     * point, the craft in its own frame (along, across), the craft over its
     * roof and over its road, and the craft's plan distance to its body. */
    this.curX = new Float64Array(S);
    this.curZ = new Float64Array(S);
    this.curLX = new Float64Array(S);
    this.curLY = new Float64Array(S);
    this.curRoof = new Float64Array(S);
    this.curUp = new Float64Array(S);
    this.curBox = new Float64Array(S);
    this.speedNow = new Float64Array(S);
    this.lastSeq = new Int32Array(S);
    this.lastX = new Float64Array(S);
    this.lastZ = new Float64Array(S);
    this.lastLX = new Float64Array(S);
    this.lastLY = new Float64Array(S);
    this.lastRoof = new Float64Array(S);
    this.lastUp = new Float64Array(S);
    this.lastBox = new Float64Array(S);
    this.near = new Int32Array(S);
    this.nearCount = 0;
    /* Pairs, slot i < j at i * S + j: the craft's side of the line between
     * them at the last feed, when that was, and when they last paid. */
    this.pairS = new Float64Array(S * S);
    this.pairSeq = new Int32Array(S * S);
    this.pairPaid = new Float64Array(S * S);
    /* A hurdle under way over each car: the side the craft came in by,
     * whether it has stayed low enough, and its lowest over the roof. */
    this.hurOn = new Uint8Array(S);
    this.hurSide = new Int8Array(S);
    this.hurOk = new Uint8Array(S);
    this.hurMin = new Float64Array(S);
    /* The pending table. */
    this.pKind = new Uint8Array(PEND_MAX);
    this.pA = new Int8Array(PEND_MAX);
    this.pB = new Int8Array(PEND_MAX);
    this.pName = new Array(PEND_MAX).fill('');
    this.pFrom = new Float64Array(PEND_MAX);
    this.pDue = new Float64Array(PEND_MAX);
    this.pMs = new Float64Array(PEND_MAX);
    this.pValue = new Float64Array(PEND_MAX);
    this.pClose = new Float64Array(PEND_MAX);
    /* The meter, reused: see view(). */
    this.meter = {
      on: false,
      holding: false,
      slot: -1,
      label: '',
      drift: false,
      heldMs: 0,
      fill: 0,
      grace: false,
      graceLeft: 0,
      back: 0,
      value: 0,
    };
    this.events = [];
    this.reset();
  }

  /*
   * The cars a map carries. Replaces whatever was there, and starts the run
   * over: a new set of cars is a new map. A car whose numbers are not a body
   * (a slot out of range, a size that is not a positive number) is left out
   * rather than guessed at.
   */
  setCars(cars) {
    this.bodyOn.fill(0);
    this.bodyDrift.fill(0);
    this.labels.fill('');
    for (const c of cars || []) {
      const m = c && c.slot;
      if (!(Number.isInteger(m) && m >= 0 && m < CHASE_SLOTS)) {
        continue;
      }
      const L = c.length;
      const W = c.width;
      const H = c.height;
      const C = c.clearance || 0;
      if (!(L > 0 && W > 0 && H > 0 && C >= 0 && L < Infinity && W < Infinity && H < Infinity && C < Infinity)) {
        continue;
      }
      this.bodyOn[m] = 1;
      this.bodyL[m] = L;
      this.bodyW[m] = W;
      this.bodyH[m] = H;
      this.bodyC[m] = C;
      this.bodyDrift[m] = c.drift ? 1 : 0;
      this.labels[m] = c.label || (c.drift ? 'Drift car' : 'Car');
    }
    this.reset();
  }

  /* How many cars it is chasing. */
  carCount() {
    let n = 0;
    for (let m = 0; m < CHASE_SLOTS; m += 1) {
      n += this.bodyOn[m];
    }
    return n;
  }

  /* A new run: everything open is dropped, nothing is paid, the trails and
   * the queue are emptied. The cars stay. */
  reset() {
    this.restart();
    this.events = [];
  }

  restart() {
    this.fed = false;
    this.lastStep = 0;
    /* Feed counter. Every "at the last feed" test is seq - 1, so a gap moves
     * it on by two and nothing from before it matches. */
    this.seq = 10;
    this.trCount.fill(0);
    this.trSeen.fill(0);
    this.lastSeq.fill(0);
    this.pairSeq.fill(0);
    this.pairPaid.fill(-1e15);
    this.hurOn.fill(0);
    this.pKind.fill(K_NONE);
    this.craftSeq = 0;
    this.lastCX = 0;
    this.lastCZ = 0;
    this.liveSlot = -1;
    this.liveHeldMs = 0;
    this.liveHeldPrev = false;
    this.liveStart = 0;
    this.liveLastHeld = 0;
    this.liveBack = 0;
    this.nowStep = 0;
  }

  /*
   * One feed. See the header for the arguments. Returns nothing: read view()
   * and drainEvents() once a frame.
   */
  step(step, craft, poses, touched, crashed) {
    /* A step that is not a number is not a time: nothing to do. */
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
    if (dt > CHASE_GAP_MS) {
      this.seq += 1;
      this.liveHeldPrev = false;
      dt = 0;
    }
    this.seq += 1;
    this.fed = true;
    this.lastStep = step;
    this.nowStep = step;
    const seq = this.seq;
    const S = CHASE_SLOTS;

    const cx = craft.x;
    const cy = craft.y;
    const cz = craft.z;
    const cvx = craft.vx;
    const cvz = craft.vz;
    const csp = Math.sqrt(cvx * cvx + cvz * cvz);
    const craftPrev = this.craftSeq === seq - 1;

    /* The best tail this feed, and whether the one being held still is. */
    let bestSlot = -1;
    let bestBack = 0;
    let liveOk = false;
    let liveBack = 0;
    this.nearCount = 0;

    for (let m = 0; m < S; m += 1) {
      if (!this.bodyOn[m]) {
        continue;
      }
      const p = poses[m];
      if (!p || !p.on) {
        this.hurOn[m] = 0;
        continue;
      }
      const L = this.bodyL[m];
      const W = this.bodyW[m];
      this.speedNow[m] = p.speed;
      this.trailUpdate(m, p, dt, seq);

      const dx = cx - p.x;
      const dz = cz - p.z;
      const d2 = dx * dx + dz * dz;

      /* THE TAIL. The rear's reach back along the travel, a drifting box's
       * corner included: half its length on the travel plus half its width
       * across it. Any point of the trail inside the band is within its arc
       * length of the car, so a craft further than this from the car's
       * centre is nowhere near the band. */
      const ht = p.hx * p.tx + p.hz * p.tz;
      const hn = p.hx * p.tz - p.hz * p.tx;
      const rear = 0.5 * L * abs(ht) + 0.5 * W * abs(hn);
      const side = 0.5 * W + TAIL_SIDE;
      const reach = rear + TAIL_FAR + side;
      if (d2 <= reach * reach) {
        const back = this.tailFit(m, p, rear, side, cx, cy, cz, cvx, cvz, csp);
        if (back >= 0) {
          if (m === this.liveSlot) {
            liveOk = true;
            liveBack = back;
          }
          if (bestSlot < 0 || back < bestBack) {
            bestSlot = m;
            bestBack = back;
          }
        }
      }

      /* THE THREAD AND THE HURDLE look at the cars near enough to matter. */
      const nr = 0.5 * L + 0.5 * W + THREAD_NEAR + NEAR_SLACK;
      if (!(d2 <= nr * nr)) {
        this.hurOn[m] = 0;
        continue;
      }
      const lx = dx * p.hx + dz * p.hz;
      const ly = dz * p.hx - dx * p.hz;
      const ex = abs(lx) - 0.5 * L;
      const ey = abs(ly) - 0.5 * W;
      const bx = ex > 0 ? ex : 0;
      const by = ey > 0 ? ey : 0;
      this.curX[m] = p.x;
      this.curZ[m] = p.z;
      this.curLX[m] = lx;
      this.curLY[m] = ly;
      this.curUp[m] = cy - p.y;
      this.curRoof[m] = cy - (p.y + this.bodyC[m] + this.bodyH[m]);
      this.curBox[m] = Math.sqrt(bx * bx + by * by);
      this.near[this.nearCount] = m;
      this.nearCount += 1;
      if (craftPrev && this.lastSeq[m] === seq - 1) {
        this.hurdleSweep(m, p, step);
      } else {
        this.hurOn[m] = 0;
      }
    }

    if (craftPrev) {
      this.threadSweep(cx, cz, step, seq);
    }

    /* The meter. The car being held keeps it while it qualifies, even when
     * another is nearer. */
    if (this.liveSlot >= 0 && liveOk) {
      if (this.liveHeldPrev) {
        this.liveHeldMs += dt * STEP_MS;
      }
      this.liveHeldPrev = true;
      this.liveLastHeld = step;
      this.liveBack = liveBack;
    } else if (bestSlot >= 0) {
      if (this.liveSlot >= 0) {
        this.endTail();
      }
      this.liveSlot = bestSlot;
      this.liveHeldMs = 0;
      this.liveHeldPrev = true;
      this.liveStart = step;
      this.liveLastHeld = step;
      this.liveBack = bestBack;
    } else if (this.liveSlot >= 0) {
      this.liveHeldPrev = false;
      if ((step - this.liveLastHeld) * STEP_MS > TAIL_GRACE_MS) {
        this.endTail();
      }
    }

    /* Keep this feed for the next one. */
    for (let i = 0; i < this.nearCount; i += 1) {
      const m = this.near[i];
      this.lastSeq[m] = seq;
      this.lastX[m] = this.curX[m];
      this.lastZ[m] = this.curZ[m];
      this.lastLX[m] = this.curLX[m];
      this.lastLY[m] = this.curLY[m];
      this.lastRoof[m] = this.curRoof[m];
      this.lastUp[m] = this.curUp[m];
      this.lastBox[m] = this.curBox[m];
    }
    this.craftSeq = seq;
    this.lastCX = cx;
    this.lastCZ = cz;

    /* A contact or a crash at this step loses everything open, what was
     * decided at this very feed included: which came first inside the stride
     * is not known, so the crash is given it. Then whatever has waited out
     * its window clean pays. */
    if (touched || crashed) {
      this.bail(step, crashed ? 'crash' : 'contact');
    }
    this.settle(step);
  }

  /*
   * A crash at `atStep`, or up to REPORT_LAG_MS before it: the shell's crash
   * is decided at the end of a frame. The tail being held is lost, and so is
   * everything waiting whose window reached that far back. A `lost` event is
   * queued for each thing lost that would have paid.
   */
  bail(atStep, why) {
    const w = why || 'crash';
    if (this.liveSlot >= 0) {
      if (this.liveHeldMs >= TAIL_MIN_MS) {
        const drift = this.bodyDrift[this.liveSlot] === 1;
        this.lostEvent(K_TAIL, this.liveSlot, -1, drift ? 'Drift Tail' : 'Tail', this.liveStart, atStep, w, this.liveHeldMs);
      }
      this.liveSlot = -1;
      this.liveHeldMs = 0;
      this.liveHeldPrev = false;
    }
    const since = atStep - REPORT_LAG_MS / STEP_MS;
    for (let i = 0; i < PEND_MAX; i += 1) {
      if (this.pKind[i] === K_NONE) {
        continue;
      }
      if (this.pFrom[i] <= atStep && this.pDue[i] >= since) {
        this.lostEvent(this.pKind[i], this.pA[i], this.pB[i], this.pName[i], this.pFrom[i], atStep, w, this.pMs[i]);
        this.pKind[i] = K_NONE;
      }
    }
    this.hurOn.fill(0);
  }

  /*
   * THE TAIL TEST for car m. Walks its trail from the car back, finds the
   * point of it nearest the craft in plan, and asks the five questions of
   * that point. Returns how far behind the rear it is, in metres, or -1.
   */
  tailFit(m, p, rear, side, cx, cy, cz, cvx, cvz, csp) {
    if (!(p.speed >= TAIL_CAR_MIN) || !(csp >= TAIL_CAR_MIN * TAIL_RATIO_MIN)) {
      return -1;
    }
    /* Down to one step past the band's far end, so a craft beyond it finds
     * the end of the walk and not a point inside the band. */
    const lo = p.distance - rear - TAIL_FAR - TRAIL_STEP;
    let best = Infinity;
    let bd = 0;
    let by = 0;
    let bv = 0;
    let btx = p.tx;
    let btz = p.tz;
    /* The segment from a (newer) to b (older); the first a is the car now. */
    let ax = p.x;
    let ay = p.y;
    let az = p.z;
    let ad = p.distance;
    let av = p.speed;
    const base = m * TRAIL_N;
    let k = this.trHead[m];
    const n = this.trCount[m];
    for (let i = 0; i < n; i += 1) {
      const j = base + k;
      const qx = this.trX[j];
      const qy = this.trY[j];
      const qz = this.trZ[j];
      const qd = this.trD[j];
      const qv = this.trV[j];
      const wx = ax - qx;
      const wz = az - qz;
      const w2 = wx * wx + wz * wz;
      let t = 0;
      if (w2 > 1e-12) {
        t = ((cx - qx) * wx + (cz - qz) * wz) / w2;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
      }
      const ox = cx - (qx + t * wx);
      const oz = cz - (qz + t * wz);
      const o2 = ox * ox + oz * oz;
      if (o2 < best) {
        best = o2;
        bd = qd + t * (ad - qd);
        by = qy + t * (ay - qy);
        bv = qv + t * (av - qv);
        if (w2 > 1e-12) {
          const wl = Math.sqrt(w2);
          btx = wx / wl;
          btz = wz / wl;
        } else {
          btx = p.tx;
          btz = p.tz;
        }
      }
      if (qd < lo) {
        break;
      }
      ax = qx;
      ay = qy;
      az = qz;
      ad = qd;
      av = qv;
      k = k === 0 ? TRAIL_N - 1 : k - 1;
    }
    /* 1. Behind the rear, along the way it drove, and not too far. */
    const back = (p.distance - rear) - bd;
    if (!(back >= 0 && back <= TAIL_FAR)) {
      return -1;
    }
    /* 2. On its line. */
    if (!(best <= side * side)) {
      return -1;
    }
    /* 3. Over the road and not far over the roof. */
    const up = cy - by;
    if (!(up > 0 && up <= this.bodyC[m] + this.bodyH[m] + TAIL_ABOVE)) {
      return -1;
    }
    /* 4. At its speed there. */
    if (!(csp >= TAIL_RATIO_MIN * bv && csp <= TAIL_RATIO_MAX * bv)) {
      return -1;
    }
    /* 5. Its way: along >= cos |v|, both sides positive. */
    const along = cvx * btx + cvz * btz;
    if (!(along >= TAIL_DIR_COS * csp)) {
      return -1;
    }
    return back;
  }

  /*
   * Car m's trail: a point every TRAIL_STEP of its driving. A car seen for
   * the first time, back after a feed it was not in, or whose distance went
   * back or jumped (a clock that was set) is given a straight trail back
   * along its travel, which is the road behind it on a straight and a
   * stand-in for the first few seconds anywhere else.
   */
  trailUpdate(m, p, dt, seq) {
    const base = m * TRAIL_N;
    const seen = this.trSeen[m] === seq - 1 && this.trCount[m] > 0;
    this.trSeen[m] = seq;
    if (seen) {
      const h = base + this.trHead[m];
      const dd = p.distance - this.trD[h];
      if (dd >= 0 && dd <= DRIVE_PER_STEP * dt + TRAIL_STEP) {
        if (dd >= TRAIL_STEP) {
          const k = this.trHead[m] === TRAIL_N - 1 ? 0 : this.trHead[m] + 1;
          const j = base + k;
          this.trX[j] = p.x;
          this.trY[j] = p.y;
          this.trZ[j] = p.z;
          this.trD[j] = p.distance;
          this.trV[j] = p.speed;
          this.trHead[m] = k;
          if (this.trCount[m] < TRAIL_N) {
            this.trCount[m] += 1;
          }
        }
        return;
      }
    }
    for (let i = 0; i < TRAIL_N; i += 1) {
      const j = base + TRAIL_N - 1 - i;
      const s = i * TRAIL_STEP;
      this.trX[j] = p.x - p.tx * s;
      this.trY[j] = p.y;
      this.trZ[j] = p.z - p.tz * s;
      this.trD[j] = p.distance - s;
      this.trV[j] = p.speed;
    }
    this.trHead[m] = TRAIL_N - 1;
    this.trCount[m] = TRAIL_N;
  }

  /*
   * THE HURDLE over car m: the craft's move since the last feed, in the car's
   * own frame (so the car's own motion and turn are in it), clipped to the
   * footprint. In by one side, out by the opposite one, over the roof and
   * under HURDLE_HIGH at the way in, at every feed across and at the way
   * out.
   */
  hurdleSweep(m, p, step) {
    const hl = 0.5 * this.bodyL[m];
    const hw = 0.5 * this.bodyW[m];
    if (!clipFootprint(this.lastLX[m], this.lastLY[m], this.curLX[m], this.curLY[m], hl, hw)) {
      this.hurOn[m] = 0;
      return;
    }
    const r0 = this.lastRoof[m];
    const r1 = this.curRoof[m];
    if (clipS0 >= 0) {
      const re = r0 + clipT0 * (r1 - r0);
      this.hurOn[m] = 1;
      this.hurSide[m] = clipS0;
      this.hurOk[m] = re > 0 && re <= HURDLE_HIGH ? 1 : 0;
      this.hurMin[m] = re;
    }
    if (!this.hurOn[m]) {
      return;
    }
    if (clipS1 < 0) {
      if (!(r1 > 0 && r1 <= HURDLE_HIGH)) {
        this.hurOk[m] = 0;
      }
      if (r1 < this.hurMin[m]) {
        this.hurMin[m] = r1;
      }
      return;
    }
    const rx = r0 + clipT1 * (r1 - r0);
    if (!(rx > 0 && rx <= HURDLE_HIGH)) {
      this.hurOk[m] = 0;
    }
    if (rx < this.hurMin[m]) {
      this.hurMin[m] = rx;
    }
    this.hurOn[m] = 0;
    if (!this.hurOk[m] || (this.hurSide[m] ^ 1) !== clipS1 || !(p.speed >= HURDLE_CAR_MIN)) {
      return;
    }
    const low = this.hurMin[m];
    const name = clipS1 === SIDE_FRONT || clipS1 === SIDE_REAR ? 'Leapfrog' : 'Hurdle';
    const value = Math.round(HURDLE_POINTS * (2 - low / HURDLE_HIGH));
    this.pend(K_HURDLE, m, -1, name, step, step + HURDLE_CONFIRM_MS / STEP_MS, 0, value, low);
  }

  /*
   * THE THREAD, over every pair of near cars both moving: the craft's side
   * of the line through their centres at this feed and the last. A change
   * of side is a crossing; where on the line it crossed, and how close each
   * body was, are taken at the crossing, a straight share of the way between
   * the two feeds.
   */
  threadSweep(cx, cz, step, seq) {
    const S = CHASE_SLOTS;
    const n = this.nearCount;
    for (let a = 0; a < n; a += 1) {
      const i = this.near[a];
      for (let b = a + 1; b < n; b += 1) {
        const j = this.near[b];
        const k = i * S + j;
        const ax = this.curX[i];
        const az = this.curZ[i];
        const s1 = (this.curX[j] - ax) * (cz - az) - (this.curZ[j] - az) * (cx - ax);
        const s0 = this.pairS[k];
        const was = this.pairSeq[k] === seq - 1;
        this.pairS[k] = s1;
        this.pairSeq[k] = seq;
        if (!was || !((s0 < 0 && s1 >= 0) || (s0 > 0 && s1 <= 0))) {
          continue;
        }
        if (this.lastSeq[i] !== seq - 1 || this.lastSeq[j] !== seq - 1) {
          continue;
        }
        if ((step - this.pairPaid[k]) * STEP_MS < THREAD_AGAIN_MS) {
          continue;
        }
        const f = s0 / (s0 - s1);
        const Ax = this.lastX[i] + f * (ax - this.lastX[i]);
        const Az = this.lastZ[i] + f * (az - this.lastZ[i]);
        const Bx = this.lastX[j] + f * (this.curX[j] - this.lastX[j]);
        const Bz = this.lastZ[j] + f * (this.curZ[j] - this.lastZ[j]);
        const Cx = this.lastCX + f * (cx - this.lastCX);
        const Cz = this.lastCZ + f * (cz - this.lastCZ);
        const abx = Bx - Ax;
        const abz = Bz - Az;
        const ab2 = abx * abx + abz * abz;
        if (!(ab2 > 0)) {
          continue;
        }
        const u = ((Cx - Ax) * abx + (Cz - Az) * abz) / ab2;
        if (!(u > 0 && u < 1)) {
          continue;
        }
        const dA = this.lastBox[i] + f * (this.curBox[i] - this.lastBox[i]);
        const dB = this.lastBox[j] + f * (this.curBox[j] - this.lastBox[j]);
        if (!(dA > 0 && dA <= THREAD_NEAR && dB > 0 && dB <= THREAD_NEAR)) {
          continue;
        }
        const upA = this.lastUp[i] + f * (this.curUp[i] - this.lastUp[i]);
        const upB = this.lastUp[j] + f * (this.curUp[j] - this.lastUp[j]);
        if (!(upA > 0 && upA <= this.bodyC[i] + this.bodyH[i] + THREAD_ABOVE
          && upB > 0 && upB <= this.bodyC[j] + this.bodyH[j] + THREAD_ABOVE)) {
          continue;
        }
        if (!this.movingBoth(i, j)) {
          continue;
        }
        this.pairPaid[k] = step;
        const value = Math.round(THREAD_POINTS * (2 - (dA + dB) / (2 * THREAD_NEAR)));
        this.pend(K_THREAD, i, j, 'Thread', step, step + THREAD_CONFIRM_MS / STEP_MS, 0, value, dA + dB);
      }
    }
  }

  /* Both cars of a pair moving, at this feed. */
  movingBoth(i, j) {
    return this.speedNow[i] >= THREAD_CAR_MIN && this.speedNow[j] >= THREAD_CAR_MIN;
  }

  /* The tail being held is over: waiting out its grace if it is long enough
   * to bank, forgotten if not. */
  endTail() {
    const m = this.liveSlot;
    if (m >= 0 && this.liveHeldMs >= TAIL_MIN_MS) {
      const drift = this.bodyDrift[m] === 1;
      this.pend(
        K_TAIL, m, -1, drift ? 'Drift Tail' : 'Tail', this.liveStart,
        this.liveLastHeld + TAIL_GRACE_MS / STEP_MS, this.liveHeldMs, tailValue(this.liveHeldMs, drift), this.liveBack,
      );
    }
    this.liveSlot = -1;
    this.liveHeldMs = 0;
    this.liveHeldPrev = false;
  }

  pend(kind, a, b, name, from, due, ms, value, close) {
    for (let i = 0; i < PEND_MAX; i += 1) {
      if (this.pKind[i] === K_NONE) {
        this.pKind[i] = kind;
        this.pA[i] = a;
        this.pB[i] = b;
        this.pName[i] = name;
        this.pFrom[i] = from;
        this.pDue[i] = due;
        this.pMs[i] = ms;
        this.pValue[i] = value;
        this.pClose[i] = close;
        return;
      }
    }
  }

  /* Pay what has waited out its window and the report lag clean, oldest
   * first so the queue reads in the order things happened. */
  settle(step) {
    for (;;) {
      let pick = -1;
      for (let i = 0; i < PEND_MAX; i += 1) {
        if (this.pKind[i] !== K_NONE && step >= this.pDue[i] + REPORT_LAG_MS / STEP_MS
          && (pick < 0 || this.pFrom[i] < this.pFrom[pick])) {
          pick = i;
        }
      }
      if (pick < 0) {
        return;
      }
      const a = this.pA[pick];
      const b = this.pB[pick];
      this.events.push({
        kind: KIND_NAMES[this.pKind[pick]],
        name: this.pName[pick],
        value: this.pValue[pick],
        ms: this.pMs[pick],
        cars: b >= 0 ? [a, b] : [a],
        labels: b >= 0 ? [this.labels[a], this.labels[b]] : [this.labels[a]],
        drift: this.bodyDrift[a] === 1 || (b >= 0 && this.bodyDrift[b] === 1),
        close: this.pClose[pick],
        step: this.pFrom[pick],
        paidStep: step,
      });
      this.pKind[pick] = K_NONE;
    }
  }

  lostEvent(kind, a, b, name, from, atStep, why, ms) {
    this.events.push({
      kind: 'lost',
      of: KIND_NAMES[kind],
      name,
      why,
      value: 0,
      ms,
      cars: b >= 0 ? [a, b] : [a],
      labels: b >= 0 ? [this.labels[a], this.labels[b]] : [this.labels[a]],
      drift: this.bodyDrift[a] === 1 || (b >= 0 && this.bodyDrift[b] === 1),
      step: from,
      paidStep: atStep,
    });
  }

  /*
   * THE METER, for the HUD once a frame. One object, rewritten in place:
   *   on         a tail is open, held or waiting out a flicker
   *   holding    held at the last feed: Stage C keeps the combo open on it
   *   slot       the car's mover slot, label its name, drift the drift car
   *   heldMs     how long it has been held, grace excluded
   *   fill       heldMs over TAIL_FULL_MS, 0 to 1
   *   grace      out of the band and waiting; graceLeft 1 to 0 as it runs
   *   back       metres behind the car's rear at the last feed it was held
   *   value      what it would bank now: 0 under TAIL_MIN_MS
   */
  view() {
    const v = this.meter;
    const m = this.liveSlot;
    v.on = m >= 0;
    if (!v.on) {
      v.holding = false;
      v.slot = -1;
      v.label = '';
      v.drift = false;
      v.heldMs = 0;
      v.fill = 0;
      v.grace = false;
      v.graceLeft = 0;
      v.back = 0;
      v.value = 0;
      return v;
    }
    v.holding = this.liveHeldPrev;
    v.slot = m;
    v.label = this.labels[m];
    v.drift = this.bodyDrift[m] === 1;
    v.heldMs = this.liveHeldMs;
    const f = this.liveHeldMs / TAIL_FULL_MS;
    v.fill = f > 1 ? 1 : f;
    v.grace = !this.liveHeldPrev;
    const left = 1 - ((this.nowStep - this.liveLastHeld) * STEP_MS) / TAIL_GRACE_MS;
    v.graceLeft = v.grace ? (left > 0 ? left : 0) : 1;
    v.back = this.liveBack;
    v.value = this.liveHeldMs >= TAIL_MIN_MS ? tailValue(this.liveHeldMs, v.drift) : 0;
    return v;
  }

  /* Take the events queued since the last call, oldest first, or null. The
   * HUD reads each once, and Stage C's counter will read the same list. */
  drainEvents() {
    if (this.events.length === 0) {
      return null;
    }
    const out = this.events;
    this.events = [];
    return out;
  }
}
