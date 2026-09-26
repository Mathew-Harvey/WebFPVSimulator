/*
 * chase-check.js: the chase scoring (src/game/chase.js) proven in Node.
 *
 * Two halves. SYNTHETIC RUNS: cars and a craft on scripted paths, fed to the
 * scorer the way the shell feeds it, every CHASE_EVERY steps of a lap clock,
 * each run asserting exactly what scores and what does not. Every run that
 * pays has a crash twin that must pay nothing: FREESTYLE-MAPS-PLAN.md
 * section 14, "scoring close calls must never pay for crashing". THE REAL
 * MODULE: dist/sim.wasm loaded as the shell loads it, one closed eased road
 * uploaded and a drift car driven round it by the module's own clock, read
 * back with readVehicles, and a craft held 6 m behind it along its travel
 * the whole way: the tail must build for the whole run, through the bends
 * and the slide, and bank once when the craft breaks off.
 *
 * Usage: node scripts/chase-check.js [--verbose]   (npm run check:chase)
 * Exit code is the failure count, like the other selftests.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Chase, pays, tailValue, CHASE_SLOTS, CHASE_EVERY, CHASE_STRIDE_MAX, REPORT_LAG_MS,
  TAIL_FAR, TAIL_GRACE_MS, TAIL_MIN_MS, TAIL_DRIFT_WEIGHT, THREAD_CONFIRM_MS, THREAD_NEAR, THREAD_POINTS,
  HURDLE_CONFIRM_MS, HURDLE_HIGH, HURDLE_POINTS,
} from '../src/game/chase.js';
import { loadSim } from '../tests/lib/simmod.js';
import {
  uploadWorld, uploadRoad, roadInfo, addVehicle, setVehicleClock, readVehicles, makeVehiclePoses, MOVER_SLOTS,
} from '../src/game/plantworld.js';
import { roadToThree, CAR } from './lib/worldruns.js';
import { sincos } from '../src/props/trig.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WASM = join(HERE, '..', 'dist', 'sim.wasm');
const VERBOSE = process.argv.includes('--verbose');

let failures = 0;

function check(name, cond, detail) {
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
  }
  if (detail && (VERBOSE || !cond)) {
    console.log(`        ${detail}`);
  }
}

/* ------------------------------------------------------------------
 * Synthetic runs
 * ------------------------------------------------------------------ */

/* A family hatchback, the checks' car everywhere: 4.5 by 1.8 by 1.4 m, 15 cm
 * off the road, so its roof is 1.55 m up and its rear 2.25 m behind its
 * centre. */
const ROOF = CAR.clearance + CAR.height;
const REAR = CAR.length / 2;
const HALF_W = CAR.width / 2;

function body(slot, drift) {
  return { slot, ...CAR, drift: !!drift, label: drift ? 'Drift car' : 'Hatchback' };
}

/*
 * A car driving along +x in lane z at v m/s from x0, its nose turned `nose`
 * off its travel ({ c, s }, a unit vector: the drift's slide), as the pose
 * readVehicles gives: the road point under its centre, the heading, the
 * travel, the speed and the distance driven.
 */
function straightCar(slot, x0, z, v, drift, nose) {
  const hc = nose ? nose.c : 1;
  const hs = nose ? nose.s : 0;
  return {
    body: body(slot, drift),
    at(t, p) {
      p.on = true;
      p.x = x0 + v * t;
      p.y = 0;
      p.z = z;
      p.hx = hc;
      p.hz = hs;
      p.tx = 1;
      p.tz = 0;
      p.vx = v;
      p.vy = 0;
      p.vz = 0;
      p.speed = v < 0 ? -v : v;
      p.distance = p.speed * t;
      p.yawRate = 0;
      p.curvature = 0;
      p.slip = 0;
    },
  };
}

/*
 * One run: the cars on their paths, the craft on its path (a function of the
 * time and the poses, writing { x, y, z, vx, vy, vz }), fed every `every`
 * steps from 0 to `ms`. `touchAt` and `crashAt` are steps at which the craft
 * touches a car or crashes: the flag rides the first feed at or after it,
 * as the shell ORs what happened since the last call. `bails` are late
 * crash reports, [crashStep, reportStep], told through bail() after the
 * first feed at or past reportStep, as the shell's end of frame crash is.
 */
function run(spec) {
  const chase = new Chase();
  chase.setCars(spec.cars.map((c) => c.body));
  const poses = makeVehiclePoses();
  const craft = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const every = spec.every ?? CHASE_EVERY;
  const touches = (spec.touchAt ?? []).slice();
  const crashes = (spec.crashAt ?? []).slice();
  const bails = (spec.bails ?? []).slice();
  const events = [];
  let feeds = 0;
  let onFeeds = 0;
  let holdFeeds = 0;
  let maxHeld = 0;
  let lastHeld = 0;
  const trace = [];
  for (let step = 0; step <= spec.ms; step += every) {
    const t = step / 1000;
    for (const c of spec.cars) {
      c.at(t, poses[c.body.slot]);
    }
    spec.craft(t, craft, poses);
    let touched = false;
    while (touches.length && touches[0] <= step) {
      touches.shift();
      touched = true;
    }
    let crashed = false;
    while (crashes.length && crashes[0] <= step) {
      crashes.shift();
      crashed = true;
    }
    chase.step(step, craft, poses, touched, crashed);
    while (bails.length && bails[0][1] <= step) {
      chase.bail(step, 'crash');
      bails.shift();
    }
    const v = chase.view();
    feeds += 1;
    if (v.on) {
      onFeeds += 1;
    }
    if (v.holding) {
      holdFeeds += 1;
    }
    if (v.heldMs > maxHeld) {
      maxHeld = v.heldMs;
    }
    lastHeld = v.heldMs;
    if (spec.trace) {
      trace.push(`${step}:${v.on ? 1 : 0}${v.holding ? 1 : 0}:${v.heldMs}:${v.back}`);
    }
    const ev = chase.drainEvents();
    if (ev) {
      events.push(...ev);
    }
  }
  return {
    events,
    paying: events.filter(pays),
    lost: events.filter((e) => e.kind === 'lost'),
    feeds,
    onFeeds,
    holdFeeds,
    maxHeld,
    lastHeld,
    trace,
  };
}

function say(r) {
  const ev = r.events.map((e) => (e.kind === 'lost'
    ? `lost ${e.of} (${e.why}) ${e.ms} ms`
    : `${e.name} ${e.value}${e.ms ? ` ${e.ms} ms` : ''} at ${e.step} paid ${e.paidStep}`));
  return `${ev.length ? ev.join('; ') : 'no events'}; meter on ${r.onFeeds} of ${r.feeds} feeds, held ${r.maxHeld} ms at most`;
}

/* The craft's own paths. */
function behind(slot, back, up, opts = {}) {
  return (t, c, poses) => {
    const p = poses[slot];
    const v = opts.speed ?? p.speed;
    c.x = p.x - REAR - back;
    c.y = p.y + up;
    c.z = p.z + (opts.side ?? 0);
    c.vx = v;
    c.vy = 0;
    c.vz = 0;
  };
}

/* 20 m/s, a drift car and an ordinary one, each alone on its own lane. */
const V = 20;

console.log('the tail');

{
  /* HELD AT 5 M for six seconds, then the craft pulls up and away, clean. */
  const hold = (slot) => {
    const at5 = behind(slot, 5, 1.0);
    return (t, c, poses) => {
      at5(t, c, poses);
      if (t >= 6) {
        c.y = 20;
      }
    };
  };
  const a = run({ cars: [straightCar(0, 0, 0, V, false)], craft: hold(0), ms: 8000 });
  const ea = a.paying[0];
  check('held 5 m behind a car at 20 m/s for 6 s: one Tail, banked with its time', a.paying.length === 1
    && a.events.length === 1 && ea.kind === 'tail' && ea.name === 'Tail' && ea.ms >= 5900 && ea.ms <= 6000
    && ea.value === tailValue(ea.ms, false) && ea.cars[0] === 0 && ea.labels[0] === 'Hatchback' && !ea.drift, say(a));
  check('the tail banks when the grace and the report lag have run clean, not before', ea
    && ea.paidStep >= 5992 + TAIL_GRACE_MS + REPORT_LAG_MS && ea.paidStep < 5992 + TAIL_GRACE_MS + REPORT_LAG_MS + CHASE_EVERY,
  ea ? `last held 5992, paid ${ea.paidStep}` : 'nothing paid');
  const d = run({ cars: [straightCar(7, 0, 0, V, true)], craft: hold(7), ms: 8000 });
  const ed = d.paying[0];
  check(`the drift car's tail is a Drift Tail, worth ${TAIL_DRIFT_WEIGHT} times as much`, d.paying.length === 1
    && ed.name === 'Drift Tail' && ed.drift && ed.ms === ea?.ms && ed.value === tailValue(ed.ms, true)
    && ed.value > ea?.value, say(d));

  /* The meter reads while it builds. */
  check('the meter was up and holding for the whole hold', a.holdFeeds >= 749 && a.holdFeeds <= 751,
    `holding on ${a.holdFeeds} feeds of 6 s at ${CHASE_EVERY} ms`);

  /* The same stride, any stride: every duration is a difference of steps. */
  const s1 = run({ cars: [straightCar(0, 0, 0, V, false)], craft: hold(0), ms: 8000, every: 1 });
  const s16 = run({ cars: [straightCar(0, 0, 0, V, false)], craft: hold(0), ms: 8000, every: 16 });
  const m1 = s1.paying[0]?.ms;
  const m8 = ea?.ms;
  const m16 = s16.paying[0]?.ms;
  check('fed every step, every 8 or every 16, the same tail within one stride', s1.paying.length === 1
    && s16.paying.length === 1 && m1 >= m8 && m1 - m8 < 8 && m8 >= m16 && m8 - m16 <= 16,
  `${m1}, ${m8} and ${m16} ms`);
}

{
  const car = () => [straightCar(0, 0, 0, V, false)];
  const nothing = (name, spec) => {
    const r = run({ cars: car(), ms: 6000, ...spec });
    check(name, r.events.length === 0 && r.onFeeds === 0, say(r));
  };
  nothing('the same at 40 m behind: nothing', { craft: behind(0, 40, 1.0) });
  nothing(`the same just past the band, ${TAIL_FAR + 1} m: nothing`, { craft: behind(0, TAIL_FAR + 1, 1.0) });
  nothing('5 m ahead of its nose, at its speed: nothing', {
    craft: (t, c, p) => {
      behind(0, 0, 1.0)(t, c, p);
      c.x = p[0].x + REAR + 5;
    },
  });
  nothing('beside it, level with its centre, 3.5 m out: nothing', {
    craft: (t, c, p) => {
      behind(0, 0, 1.0)(t, c, p);
      c.x = p[0].x;
      c.z = 3.5;
    },
  });
  nothing('in the next lane, 5 m back and 3.5 m across: nothing', { craft: behind(0, 5, 1.0, { side: 3.5 }) });
  nothing('far above it, 5 m back and 15 m up: nothing', { craft: behind(0, 5, 15) });
  nothing('5 m behind at half its speed: nothing', { craft: behind(0, 5, 1.0, { speed: V / 2 }) });
  nothing('5 m behind at one and a half times its speed: nothing', { craft: behind(0, 5, 1.0, { speed: V * 1.5 }) });
  nothing('5 m behind going the other way: nothing', { craft: behind(0, 5, 1.0, { speed: -V }) });
  /* A real pass: from 12 m back to 12 m ahead, at 35 m/s, 1.5 m off its
   * line. It is inside the band for two thirds of a second. */
  nothing('overtaking through the band at 35 m/s: nothing', {
    craft: (t, c, p) => {
      c.x = p[0].x - REAR - 12 + 15 * t;
      c.y = 1.0;
      c.z = 1.5;
      c.vx = 35;
      c.vy = 0;
      c.vz = 0;
    },
  });
}

{
  /* A DRIFTING CAR: nose 30 degrees off its travel. Behind means behind the
   * way it is going, not behind its nose. */
  const slide = { c: 0.8660254037844386, s: 0.5 };
  const rear = REAR * slide.c + HALF_W * slide.s;
  const along = run({ cars: [straightCar(7, 0, 0, V, true, slide)], craft: behind(7, 5 + rear - REAR, 1.0), ms: 4000 });
  check('a sliding car: 5 m behind its travel holds the tail', along.holdFeeds > 400, say(along));
  const nose = run({
    cars: [straightCar(7, 0, 0, V, true, slide)],
    ms: 4000,
    craft: (t, c, p) => {
      behind(7, 0, 1.0)(t, c, p);
      c.x = p[7].x - slide.c * (rear + 5);
      c.z = p[7].z - slide.s * (rear + 5);
    },
  });
  check('a sliding car: 5 m behind its nose, off its line, does not', nose.onFeeds === 0, say(nose));
}

{
  /* THE GRACE. Held three seconds, out of the band, back, three more, gone. */
  const flick = (outFrom, outTo) => (t, c, poses) => {
    behind(0, 5, 1.0)(t, c, poses);
    if (t >= outFrom && t < outTo) {
      c.z = 6;
    }
    if (t >= 6) {
      c.y = 20;
    }
  };
  const f = run({ cars: [straightCar(0, 0, 0, V, false)], craft: flick(3, 3.3), ms: 8000 });
  const ef = f.paying[0];
  check(`a 300 ms flicker, inside the ${TAIL_GRACE_MS} ms grace, keeps it: one Tail, the flicker not counted`,
    f.paying.length === 1 && f.events.length === 1 && ef.ms >= 5600 && ef.ms <= 5700, say(f));
  const g = run({ cars: [straightCar(0, 0, 0, V, false)], craft: flick(3, 3.8), ms: 8000 });
  check('an 800 ms loss, past the grace, banks the first: two Tails of about 3 s and 2.2 s',
    g.paying.length === 2 && g.events.length === 2 && g.paying[0].ms >= 2900 && g.paying[0].ms <= 3000
    && g.paying[1].ms >= 2100 && g.paying[1].ms <= 2200 && g.paying[0].paidStep < 3800, say(g));
  const short = run({
    cars: [straightCar(0, 0, 0, V, false)],
    ms: 4000,
    craft: (t, c, p) => {
      behind(0, 5, 1.0)(t, c, p);
      if (t >= 0.8) {
        c.y = 20;
      }
    },
  });
  check(`held under ${TAIL_MIN_MS} ms: the meter showed it, nothing banks`, short.events.length === 0
    && short.onFeeds > 0, say(short));
}

{
  /* THE CRASH TWINS. */
  const into = run({
    cars: [straightCar(0, 0, 0, V, false)],
    ms: 7000,
    touchAt: [4200],
    craft: (t, c, p) => {
      behind(0, 5, 1.0)(t, c, p);
      if (t >= 4 && t < 4.2) {
        c.x = p[0].x - REAR - 5 + 25 * (t - 4);
      } else if (t >= 4.2) {
        c.x = p[0].x - REAR - 1 - 15 * (t - 4.2);
        c.y = 0.2;
        c.vx = 5;
      }
    },
  });
  check('held 4 s then flown into its back bumper: nothing pays, the tail is lost to the contact',
    into.paying.length === 0 && into.lost.length === 1 && into.lost[0].of === 'tail'
    && into.lost[0].why === 'contact' && into.lost[0].ms >= 3900, say(into));
  const ground = run({
    cars: [straightCar(0, 0, 0, V, false)],
    ms: 7000,
    crashAt: [4300],
    craft: (t, c, p) => {
      behind(0, 5, 1.0)(t, c, p);
      if (t >= 4) {
        c.y = 20;
      }
    },
  });
  check('held 4 s, broken off, crashed 300 ms later inside the grace: nothing pays',
    ground.paying.length === 0 && ground.lost.length === 1 && ground.lost[0].why === 'crash', say(ground));
  /* The shell's crash lands at the end of a frame. Held 3 s, broken off at
   * 3 s; the grace runs to 3.5 s and it would pay at 3.62. A crash at 3.48 s
   * is told at 3.56 s, the end of its frame: it must still void it. */
  const breakAt3 = (t, c, p) => {
    behind(0, 5, 1.0)(t, c, p);
    if (t >= 3) {
      c.y = 20;
    }
  };
  const late = run({ cars: [straightCar(0, 0, 0, V, false)], ms: 6000, craft: breakAt3, bails: [[3480, 3560]] });
  check('a crash inside the grace told 80 ms late, at the end of its frame: nothing pays',
    late.paying.length === 0 && late.lost.length === 1, say(late));
  const after = run({ cars: [straightCar(0, 0, 0, V, false)], ms: 6000, craft: breakAt3, bails: [[3700, 3760]] });
  check('a crash after the tail has paid does not take it back', after.paying.length === 1
    && after.lost.length === 0 && after.paying[0].paidStep < 3760, say(after));
}

console.log('\nthe thread');

{
  /* Two cars side by side in lanes 3.5 m apart, both at 20 m/s; the craft
   * flies the gap between them at 30 m/s, a metre up, from 15 m behind to
   * 15 m ahead. It crosses the line between their centres at 1.5 s. */
  const pair = (zB, vA, vB) => [straightCar(1, 0, 0, vA ?? V, false), straightCar(2, 0, zB, vB ?? V, false)];
  const gap = (z, v = 30) => (t, c) => {
    c.x = -15 + v * t;
    c.y = 1.0;
    c.z = z;
    c.vx = v;
    c.vy = 0;
    c.vz = 0;
  };
  const th = run({ cars: pair(3.5), craft: gap(1.75), ms: 3000 });
  const e = th.paying[0];
  const close = 2 * (1.75 - HALF_W);
  check('flown between two moving cars, 0.85 m from each: one Thread', th.paying.length === 1 && th.events.length === 1
    && e.kind === 'thread' && e.name === 'Thread' && e.cars.join() === '1,2' && Math.abs(e.close - close) < 0.02
    && e.value === Math.round(THREAD_POINTS * (2 - e.close / (2 * THREAD_NEAR))), say(th));
  check('decided at the crossing, paid after the window and the report lag', e
    && e.step >= 1496 && e.step <= 1504 && e.paidStep >= e.step + THREAD_CONFIRM_MS + REPORT_LAG_MS
    && e.paidStep < e.step + THREAD_CONFIRM_MS + REPORT_LAG_MS + CHASE_EVERY, e ? `at ${e.step}, paid ${e.paidStep}` : '');
  check('and it is no tail: at 1.5 times their speed', th.onFeeds === 0);
  const hit = run({ cars: pair(3.5), craft: gap(1.75), ms: 3000, touchAt: [1700] });
  check('the same thread with a car touched 200 ms after: nothing pays, the thread is lost', hit.paying.length === 0
    && hit.lost.length === 1 && hit.lost[0].of === 'thread' && hit.lost[0].why === 'contact', say(hit));
  const crash = run({ cars: pair(3.5), craft: gap(1.75), ms: 3000, crashAt: [1850] });
  check('the same thread with a crash 350 ms after: nothing pays', crash.paying.length === 0
    && crash.lost.length === 1, say(crash));
  const wide = run({ cars: pair(3.5), craft: gap(-2.5), ms: 3000 });
  check('past the outside of one car, not between them: nothing', wide.events.length === 0, say(wide));
  const apart = run({ cars: pair(8), craft: gap(4), ms: 3000 });
  check('between two cars 8 m apart, 3.1 m from each: nothing', apart.events.length === 0, say(apart));
  const high = run({
    cars: pair(3.5),
    ms: 3000,
    craft: (t, c) => {
      gap(1.75)(t, c);
      c.y = ROOF + 1.5;
    },
  });
  check('over the gap, 1.5 m above their roofs: nothing', high.events.length === 0, say(high));
  const parked = run({ cars: pair(3.5, 0, 0), craft: gap(1.75, 10), ms: 3000 });
  check('between two stopped cars: nothing', parked.events.length === 0, say(parked));
  /* A convoy: nose to tail in one lane, 3 m between them; the craft crosses
   * the lane through the gap. */
  const convoy = run({
    cars: [straightCar(1, 0, 0, V, false), straightCar(2, -(CAR.length + 3), 0, V, false)],
    ms: 2000,
    craft: (t, c, p) => {
      c.x = p[1].x - REAR - 1.5;
      c.y = 1.0;
      c.z = -6 + 8 * t;
      c.vx = V;
      c.vy = 0;
      c.vz = 8;
    },
  });
  check('across a lane through the 3 m gap in a convoy: one Thread', convoy.paying.length === 1
    && convoy.paying[0].name === 'Thread', say(convoy));
  const again = run({
    cars: pair(3.5),
    ms: 4000,
    craft: (t, c) => {
      gap(1.75)(t, c);
      c.x = 0.2 * (t < 1 ? 1 : (t < 2 ? -1 : 1)) + V * t;
      c.vx = V;
    },
  });
  check('wobbling across the same pair\'s line: once, not every wobble', again.paying.length === 1, say(again));
  const a = JSON.stringify(run({ cars: pair(3.5), craft: gap(1.75), ms: 3000 }).events);
  const b = JSON.stringify(run({ cars: pair(3.5), craft: gap(1.75), ms: 3000 }).events);
  check('the same inputs give the same events, to the character', a === b);
}

console.log('\nthe hurdle (the plan\'s UNDER, turned over)');

{
  /* A car at 15 m/s; the craft keeps pace along it and crosses its footprint
   * side to side at 10 m/s, a metre over its roof. */
  const car = () => [straightCar(3, 0, 0, 15, false)];
  const across = (over, opts = {}) => (t, c, p) => {
    c.x = p[3].x;
    c.y = ROOF + over;
    c.z = -5 + 10 * t;
    c.vx = 15;
    c.vy = 0;
    c.vz = 10;
    if (opts.back && t >= 0.5) {
      c.z = -5 + 10 * (1 - t);
      c.vz = -10;
    }
  };
  const h = run({ cars: car(), craft: across(1.0), ms: 2000 });
  const e = h.paying[0];
  check('across a moving car\'s roof, 1 m over it: one Hurdle', h.paying.length === 1 && h.events.length === 1
    && e.kind === 'hurdle' && e.name === 'Hurdle' && e.cars[0] === 3 && Math.abs(e.close - 1.0) < 1e-9
    && e.value === Math.round(HURDLE_POINTS * (2 - 1.0 / HURDLE_HIGH)), say(h));
  check('decided on the way out, paid after the window and the report lag', e && e.step >= 592 && e.step <= 600
    && e.paidStep >= e.step + HURDLE_CONFIRM_MS + REPORT_LAG_MS, e ? `at ${e.step}, paid ${e.paidStep}` : '');
  const clip = run({ cars: car(), craft: across(0.3), ms: 2000, touchAt: [500] });
  check('the same, clipping the roof on the way across: nothing, not even a loss to show', clip.events.length === 0,
    say(clip));
  const after = run({ cars: car(), craft: across(1.0), ms: 2000, crashAt: [800] });
  check('the same, crashed 200 ms after it cleared the car: nothing pays', after.paying.length === 0
    && after.lost.length === 1 && after.lost[0].of === 'hurdle', say(after));
  const tooHigh = run({ cars: car(), craft: across(HURDLE_HIGH + 0.5), ms: 2000 });
  check(`across it ${HURDLE_HIGH + 0.5} m over the roof: nothing`, tooHigh.events.length === 0, say(tooHigh));
  const dive = run({
    cars: car(),
    ms: 2000,
    craft: (t, c, p) => {
      across(0)(t, c, p);
      c.y = ROOF + 2.5 - 2 * ((t - 0.41) / 0.18);
      c.vy = -2 / 0.18;
    },
  });
  check('diving across it, 2.5 m over the roof on the way in and 0.5 m on the way out: nothing',
    dive.events.length === 0, say(dive));
  const through = run({ cars: car(), craft: across(-0.6), ms: 2000 });
  check('across it at body height, through it: nothing, whatever the contact report says',
    through.events.length === 0, say(through));
  const dip = run({ cars: car(), craft: across(0.8, { back: true }), ms: 2000 });
  check('in over one side and back out the same side: nothing', dip.events.length === 0, say(dip));
  const stopped = run({
    cars: [straightCar(3, 0, 0, 0, false)],
    ms: 2000,
    craft: (t, c) => {
      c.x = 0;
      c.y = ROOF + 1.0;
      c.z = -5 + 10 * t;
      c.vx = 0;
      c.vy = 0;
      c.vz = 10;
    },
  });
  check('across a stopped car: nothing', stopped.events.length === 0, say(stopped));
  /* End to end: overtaking over its roof at 25 m/s, 0.8 m over it. */
  const frog = run({
    cars: car(),
    ms: 3000,
    craft: (t, c, p) => {
      c.x = p[3].x - 10 + 10 * t;
      c.y = ROOF + 0.8;
      c.z = 0;
      c.vx = 25;
      c.vy = 0;
      c.vz = 0;
    },
  });
  const f = frog.paying[0];
  check('overtaking over its roof, tail to nose, 0.8 m over: one Leapfrog, and no tail on the way',
    frog.paying.length === 1 && frog.events.length === 1 && f.name === 'Leapfrog'
    && f.value === Math.round(HURDLE_POINTS * (2 - 0.8 / HURDLE_HIGH)) && frog.onFeeds === 0, say(frog));
}

console.log('\na stopped car');

{
  const parked = run({ cars: [straightCar(0, 0, 0, 0, false)], craft: behind(0, 5, 1.0), ms: 10000 });
  check('a craft parked 5 m behind a stopped car for 10 s: nothing, and no meter', parked.events.length === 0
    && parked.onFeeds === 0, say(parked));
  const creep = run({ cars: [straightCar(0, 0, 0, 3, false)], craft: behind(0, 5, 1.0), ms: 10000 });
  check('5 m behind a car creeping at 3 m/s: nothing', creep.events.length === 0 && creep.onFeeds === 0, say(creep));
}

console.log('\nthe housekeeping');

{
  check('the scorer has a slot for every mover slot', CHASE_SLOTS === MOVER_SLOTS, `${CHASE_SLOTS} and ${MOVER_SLOTS}`);
  check('the grace, the windows and the report lag all outlast a frame', TAIL_GRACE_MS > CHASE_STRIDE_MAX
    && THREAD_CONFIRM_MS > CHASE_STRIDE_MAX && HURDLE_CONFIRM_MS > CHASE_STRIDE_MAX && REPORT_LAG_MS > CHASE_STRIDE_MAX);
  check('the shortest tail that banks is longer than the grace (one waiting tail is ever enough)',
    TAIL_MIN_MS > TAIL_GRACE_MS);
  const none = new Chase();
  none.setCars([]);
  const poses = makeVehiclePoses();
  const craft = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0 };
  for (let s = 0; s < 2000; s += 8) {
    none.step(s, craft, poses, s === 800, s === 1600);
  }
  const v = none.view();
  check('no cars: nothing to show, nothing queued, no throw', !v.on && none.drainEvents() === null
    && none.carCount() === 0);
  /* A step that goes back is a new run: what was open is dropped unpaid. */
  const back = new Chase();
  const car = straightCar(0, 0, 0, V, false);
  back.setCars([car.body]);
  for (let s = 0; s <= 3000; s += 8) {
    car.at(s / 1000, poses[0]);
    behind(0, 5, 1.0)(s / 1000, craft, poses);
    back.step(s, craft, poses, false, false);
  }
  const held = back.view().heldMs;
  /* Back to step 100, the craft still behind the car: the new run takes a
   * new tail from nothing, and the old one never pays, however long the
   * craft then flies clean. */
  back.step(100, craft, poses, false, false);
  const fresh = back.view().heldMs;
  craft.y = 30;
  let queued = 0;
  for (let s = 108; s <= 3000; s += 8) {
    back.step(s, craft, poses, false, false);
    const ev = back.drainEvents();
    queued += ev ? ev.length : 0;
  }
  check('the clock going back is a new run: the open tail is dropped, nothing paid', held > 2900
    && fresh === 0 && queued === 0, `held ${held} ms before the jump, ${fresh} after, ${queued} events after`);
}

/* ------------------------------------------------------------------
 * The real module
 * ------------------------------------------------------------------ */

console.log('\nthe real module: a drift car on an eased road, and a craft on its tail');

/*
 * A closed road in the physics frame, a point every half metre: a straight
 * of `straight` metres along +x from the origin, then a half turn to the
 * left whose curvature ramps up over `ease` metres, holds at 1 / radius and
 * ramps down over `ease`, then the same again turned half round, which
 * closes it exactly: the second half is the first turned 180 degrees about
 * the midpoint of its two ends. Headings through trig.js, as a map's road
 * points will be, because they reach the module.
 */
function easedLoop(straight, radius, ease) {
  const ds = 0.5;
  const half = [];
  let x = 0;
  let y = 0;
  let th = 0;
  const sc = { s: 0, c: 0 };
  const ns = Math.round(straight / ds);
  for (let i = 0; i < ns; i += 1) {
    half.push([x, y, 0]);
    x += ds;
  }
  const nb = Math.round((Math.PI * radius + ease) / ds);
  const kap = [];
  let sum = 0;
  for (let i = 0; i < nb; i += 1) {
    const s = (i + 0.5) * ds;
    const up = s < ease ? s / ease : 1;
    const down = (nb * ds - s) < ease ? (nb * ds - s) / ease : 1;
    const k = (up < down ? up : down) / radius;
    kap.push(k);
    sum += k * ds;
  }
  for (let i = 0; i < nb; i += 1) {
    half.push([x, y, 0]);
    const dth = (kap[i] * ds * Math.PI) / sum;
    sincos(th + dth / 2, sc);
    x += ds * sc.c;
    y += ds * sc.s;
    th += dth;
  }
  const ex = x;
  const ey = y;
  const out = half.slice();
  for (const p of half) {
    out.push([ex - p[0], ey - p[1], 0]);
  }
  return out;
}

async function realRun(wasm) {
  const sim = await loadSim(wasm);
  uploadWorld(sim, null);
  const frame = sim.e.sim_world_frame(0, 0, 0, 0);
  if (frame !== 0) {
    throw new Error(`sim_world_frame: ${frame}`);
  }
  const pts = easedLoop(40, 20, 15);
  const road = uploadRoad(sim, roadToThree(pts), true);
  const info = roadInfo(sim, road);
  const SLOT = 5;
  const drift = { offset: 0, topSpeed: 22, lateral: 9, drift: 0.05, ...CAR };
  addVehicle(sim, SLOT, road, drift);
  const chase = new Chase();
  chase.setCars([{ slot: SLOT, ...CAR, drift: true, label: 'Drift car' }]);
  const poses = makeVehiclePoses();
  const craft = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const HOLD = 60000;
  const END = HOLD + 1500;
  const BACK = 6;
  let notHeld = 0;
  let firstMiss = -1;
  let minSpeed = Infinity;
  let maxSpeed = 0;
  let maxSlip = 0;
  let minBack = Infinity;
  let maxBack = 0;
  let heldAtEnd = 0;
  const events = [];
  const trace = [];
  for (let step = 0; step <= END; step += CHASE_EVERY) {
    setVehicleClock(sim, step);
    readVehicles(sim, poses);
    const p = poses[SLOT];
    /* 6 m behind the road point under its centre, along the way it is
     * going, a metre up, at its velocity. Pulled up and away at the end. */
    craft.x = p.x - BACK * p.tx;
    craft.z = p.z - BACK * p.tz;
    craft.y = p.y + (step <= HOLD ? 1.0 : 30);
    craft.vx = p.vx;
    craft.vy = p.vy;
    craft.vz = p.vz;
    chase.step(step, craft, poses, false, false);
    const v = chase.view();
    if (step <= HOLD) {
      if (!v.holding) {
        notHeld += 1;
        if (firstMiss < 0) {
          firstMiss = step;
        }
      } else {
        minBack = Math.min(minBack, v.back);
        maxBack = Math.max(maxBack, v.back);
      }
      minSpeed = Math.min(minSpeed, p.speed);
      maxSpeed = Math.max(maxSpeed, p.speed);
      maxSlip = Math.max(maxSlip, Math.abs(p.slip));
      heldAtEnd = v.heldMs;
    }
    trace.push(`${p.x},${p.z},${v.heldMs},${v.back}`);
    const ev = chase.drainEvents();
    if (ev) {
      events.push({ step, ev });
    }
  }
  const last = poses[SLOT];
  return {
    info, notHeld, firstMiss, minSpeed, maxSpeed, maxSlip, minBack, maxBack, heldAtEnd, events,
    laps: last.distance / info.length, trace: trace.join(';'), HOLD,
  };
}

{
  const wasm = await readFile(WASM);
  const a = await realRun(wasm);
  check('the module took the road and drove the drift car more than a lap, through bends and a slide',
    a.laps > 1 && a.minSpeed < 16 && a.maxSpeed > 19 && a.maxSlip > 0.2,
    `road ${a.info.points} points, ${a.info.length.toFixed(1)} m; ${a.laps.toFixed(2)} laps; speed `
    + `${a.minSpeed.toFixed(1)} to ${a.maxSpeed.toFixed(1)} m/s; slip up to tan(slip/2) ${a.maxSlip.toFixed(3)}`);
  check('6 m behind it along its travel, at its velocity: held at every feed of the minute',
    a.notHeld === 0, a.notHeld ? `${a.notHeld} feeds out, the first at ${a.firstMiss}`
      : `${a.HOLD / CHASE_EVERY + 1} feeds, ${a.minBack.toFixed(2)} to ${a.maxBack.toFixed(2)} m behind the rear`);
  check('the meter built the whole minute, grace never used', a.heldAtEnd === a.HOLD, `${a.heldAtEnd} ms held`);
  const paid = a.events.flatMap((x) => x.ev);
  const e = paid[0];
  check('nothing banked while it was held; broken off, one Drift Tail with the whole minute',
    a.events.length === 1 && a.events[0].step > a.HOLD && paid.length === 1 && e.name === 'Drift Tail'
    && e.ms === a.HOLD && e.value === tailValue(a.HOLD, true), paid.map((x) => `${x.name} ${x.ms} ms ${x.value}`).join('; '));
  const b = await realRun(wasm);
  check('flown again on a fresh module: the same meter at every feed, to the character', a.trace === b.trace
    && JSON.stringify(a.events) === JSON.stringify(b.events));
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures);
