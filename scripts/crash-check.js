/*
 * crash-check.js: fly the real shell into the real town and measure the
 * crash, before the contact solver moves and after it.
 *
 * WHY THIS EXISTS. The owner's report was that crashing in the freestyle city
 * bounces you around, clips you through buildings and sometimes makes you
 * vanish. The review that followed (PROGRESS.md, 2026-09-24) measured it
 * with a scratch probe, and the owner approved moving obstacle contact into
 * the plant on condition that coverage lands first. scripts/plant-golden.js
 * pins the plant. This pins the thing a pilot flies: the shell, Betaflight,
 * the plant and the town's colliders together, through the same guidance law
 * scripts/park-fly.js flies the training park with (scripts/lib/pilot.js).
 *
 * Every scenario is flown at one shopfront beside the spawn street, a face at
 * x = 5.6 whose box runs z 28.17 to 31.03 and up to a roof at 6.76, because
 * it is the densest thing near the spawn and it was measured first. Its
 * numbers are read off window.__colliderBoxes and are checked on every run:
 * if the town moves that wall, the check says so rather than flying at air.
 *
 * TWO KINDS OF ASSERTION, and the difference is the point.
 *
 *   GUARDS hold today and must hold after the rewrite. The craft's state
 *   stays finite, its centre never goes inside a solid, it never moves
 *   further in a frame than its own speed allows (a teleport), and every
 *   scenario actually reaches the wall it is named for. A red guard is a
 *   regression, full stop. Since the owner's first flight of the new solver
 *   there is one more: a craft is never left stuck, still and not upright,
 *   for longer than stuckTick allows before it is set down. That set down
 *   is the one sanctioned jump, and it is counted rather than read as a
 *   teleport, because it restarts the sim clock.
 *
 *   TARGETS are the crash the owner asked for, in numbers: a gentle tap
 *   leaves the wall, a fast hit tumbles rather than pinballs, a roof is
 *   ground, full throttle gets you off a wall, and a crash never teleports
 *   the craft. Most of them are red today, which is the review's finding
 *   written as a test. They are always measured and printed; `--targets`
 *   makes them count toward the exit code, which is how the check is run
 *   once the new solver is in. The numbers are the owner's to tune.
 *
 * Not deterministic to the bit, because the pilot runs on the frame clock
 * of a headless browser, so nothing here is compared for equality. Every
 * assertion is an inequality with room for a frame of jitter.
 *
 * Usage:
 *   node scripts/crash-check.js [--targets] [--only=name] [--json=PATH]
 * Exit code is the number of failed guards, plus failed targets with
 * --targets.
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

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { PILOT } from './lib/pilot.js';
import { heldStill, CRAFT_WORLD_R } from '../src/game/collide.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* The shopfront. Face at x = 5.6 looking down -x, roof at 6.76. */
const WALL = { face: 5.6, z0: 28.17, z1: 31.03, roof: 6.76, zMid: 29.6 };
/* Heading that points the nose at the wall, +x: atan2(1, 0). */
const EAST = 1.5708;

/*
 * The scenarios. `from` and `to` are world metres; `to` is past the wall on
 * purpose, so the pilot is still asking for the wall when it arrives, and
 * `pushMs` is how long it keeps asking after the path ends. `after` is the
 * throttle held with the sticks centred for `afterMs` once the pilot lets
 * go. `kind` picks the measurement.
 */
const SCENARIOS = [
  {
    name: 'wall tap, 3 m/s', kind: 'wall', from: [2.2, 2.5, 29.3], to: [6.0, 2.5, 29.3],
    secs: 2.2, vEnd: 3, heading: EAST, pushMs: 100, afterMs: 1500,
  },
  {
    name: 'wall head-on, 5 m/s', kind: 'wall', from: [0.5, 2.5, 29.3], to: [6.2, 2.5, 29.3],
    secs: 2.0, vEnd: 5, heading: EAST, pushMs: 100, afterMs: 1500,
  },
  {
    name: 'wall head-on, 10 m/s', kind: 'wall', from: [-2, 2.5, 29.3], to: [7.5, 2.5, 29.3],
    secs: 1.8, vEnd: 10, heading: EAST, pushMs: 100, afterMs: 1500,
  },
  {
    name: 'wall head-on, 20 m/s', kind: 'wall', from: [-14, 2.5, 29.3], to: [7.5, 2.5, 29.3],
    secs: 1.9, vEnd: 20, heading: EAST, pushMs: 100, afterMs: 1500,
  },
  {
    name: 'wall glancing 35 deg, 12 m/s', kind: 'glance', from: [-3, 2.5, 21.5], to: [7, 2.5, 34.5],
    secs: 1.9, vEnd: 12, heading: 0.64, pushMs: 100, afterMs: 1500,
  },
  {
    name: 'upper wall under the roof, 10 m/s', kind: 'wall', from: [-2, 6.5, 29.6], to: [7.5, 6.5, 29.6],
    secs: 1.8, vEnd: 10, heading: EAST, pushMs: 100, afterMs: 1500,
  },
  {
    name: 'dive onto a roof, 8 m/s', kind: 'roof', from: [9, 11, 20], to: [9, 6.2, 29.6],
    secs: 1.6, vEnd: 8, heading: 0, pushMs: 100, after: 0, afterMs: 2500,
  },
  {
    name: 'settle onto a roof, 2 m/s', kind: 'roof', from: [9, 9, 29.6], to: [9, 6.4, 29.6],
    secs: 2.4, vEnd: 2, heading: 0, pushMs: 200, after: 0, afterMs: 2000,
  },
  {
    name: 'wall hit, then full throttle', kind: 'punch', from: [-2, 2.5, 29.3], to: [7.5, 2.5, 29.3],
    secs: 1.8, vEnd: 10, heading: EAST, pushMs: 300, after: 1, afterMs: 2000,
  },
  /* A CRASH IS A DULL BOUNCE (the owner, 2026-10-16: "no reset, just dull bounce always"). Until then a crash set the
   * craft down, and this scenario held it parked while the hand was still on the sticks (bug-d7247563, "crashed
   * inside and cannot fly out": five relaunches into the wall in 1.8 s). Now nothing is set down, so the same hand
   * keeps flying it: `held` is the sticks kept for `heldMs` after the pilot's path ends, then the sticks are centred
   * with the throttle still up (`after`). */
  {
    name: 'head-on 10 m/s, hand still on the sticks', kind: 'held', from: [-2, 2.5, 29.3], to: [7.5, 2.5, 29.3],
    secs: 1.8, vEnd: 10, heading: EAST, pushMs: 100, held: [0.5, -0.5, 0.3, 0.7], heldMs: 2200, after: 0.7, afterMs: 2500,
  },
  /* The owner's report from the first flight of the solid world: head
   * first into a building and stuck on the wall. Left alone long enough for
   * stuckTick to act, once with the throttle cut and once at hover. */
  {
    name: 'head-on 10 m/s, throttle cut, left alone', kind: 'stuck', from: [-2, 2.5, 29.3], to: [7.5, 2.5, 29.3],
    secs: 1.8, vEnd: 10, heading: EAST, pushMs: 100, after: 0, afterMs: 4500,
  },
  {
    name: 'head-on 15 m/s, hover throttle, left alone', kind: 'stuck', from: [-8, 2.5, 29.3], to: [7.5, 2.5, 29.3],
    secs: 1.9, vEnd: 15, heading: EAST, pushMs: 100, after: 0.3, afterMs: 4500,
  },
];

/* The owner's crash, as numbers. Proposed in the review; the owner tunes
 * them. Each returns [ok, measured] from a scenario's metrics. */
const TARGETS = {
  'wall tap, 3 m/s': [
    ['leaves the wall rather than sticking', (m) => [m.leftWall, `gap after 1 s ${m.gapAfter1s} m`]],
    ['barely spins, under 5 rad/s', (m) => [m.peakRate < 5, `${m.peakRate} rad/s`]],
  ],
  'wall head-on, 5 m/s': [
    ['rebounds at 0.3 m/s or less', (m) => [m.rebound <= 0.3, `${m.rebound} m/s`]],
    ['spins under 5 rad/s', (m) => [m.peakRate < 5, `${m.peakRate} rad/s`]],
  ],
  'wall head-on, 20 m/s': [
    ['tumbles at 25 rad/s or less', (m) => [m.peakRate <= 25, `${m.peakRate} rad/s`]],
    ['a vertical wall adds no more than 0.5 m/s upward', (m) => [m.upKick <= 0.5, `${m.upKick} m/s`]],
  ],
  'wall glancing 35 deg, 12 m/s': [
    ['keeps 60 to 80 percent of its speed', (m) => [m.keep >= 0.6 && m.keep <= 0.8, `${Math.round(m.keep * 100)} percent`]],
    ['stays the right way up', (m) => [m.minUpYAfter > 0.3, `up.y ${m.minUpYAfter}`]],
  ],
  'dive onto a roof, 8 m/s': [
    ['stops on the roof, as it would on the street', (m) => [m.endY > WALL.roof && m.endSpeed < 0.3, `ends at y ${m.endY}, ${m.endSpeed} m/s`]],
    ['slides no more than 3 m', (m) => [m.slide <= 3, `${m.slide} m`]],
  ],
  'settle onto a roof, 2 m/s': [
    ['comes to rest on the roof', (m) => [m.endY > WALL.roof && m.endSpeed < 0.2, `ends at y ${m.endY}, ${m.endSpeed} m/s`]],
  ],
  'wall hit, then full throttle': [
    ['full throttle frees it from the wall within 0.5 s', (m) => [m.escapeMs != null && m.escapeMs <= 500, m.escapeMs == null ? 'never left' : `${m.escapeMs} ms`]],
  ],
  '*': [
    ['a crash never teleports the craft (no Crashed catch)', (m) => [m.crashes === 0, `${m.crashes} catches${m.crashKinds.length ? ` (${m.crashKinds.join(', ')})` : ''}`]],
  ],
};

/* In the page: fly one scenario and record every frame. */
function flyScenario(S) {
  return `
    const { V } = window.__vm;
    const S = ${JSON.stringify(S)};
    const boxes = window.__colliderBoxes(S.to[0], S.to[2], 30);
    const inside = (x, y, z) => { let d = 0; for (const b of boxes) {
      if (x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]) {
        const m = Math.min(x - b[0], b[3] - x, y - b[1], b[4] - y, z - b[2], b[5] - z);
        if (m > d) { d = m; } } } return d; };
    const wallBox = boxes.find((b) => Math.abs(b[0] - ${WALL.face}) < 0.02
      && b[2] <= ${WALL.zMid} && b[5] >= ${WALL.zMid} && Math.abs(b[4] - ${WALL.roof}) < 0.02);
    await window.__settle(V(...S.from), S.heading, 1.4);
    const rows = [];
    const snap = (phase) => {
      const c = window.__craftState();
      const p = [c.worldX, c.worldY, c.worldZ];
      rows.push({
        phase,
        ms: window.__stickPath().moduleMs,
        /* Which shell frame this read saw: the pilot's reads are not the
         * shell's frames. See FRAMES, NOT READS in measure(). */
        fr: window.__boot().frames,
        p, v: c.vel ? [c.vel.x, c.vel.y, c.vel.z] : [0, 0, 0],
        spd: c.speed,
        upY: c.up ? c.up.y : 1,
        rate: c.rates ? Math.hypot(c.rates.p, c.rates.q, c.rates.r) : 0,
        /* What stuckTick's test reads (stillMeter in src/main.js). Infinity
         * until a window has passed, which does not survive JSON, and null
         * would read as 0. */
        held: [c.held.speed, c.held.rate].map((v) => (Number.isFinite(v) ? v : 1e9)),
        crashed: c.crashed, kind: c.clipCrashKind, landed: c.landed,
        turtle: Boolean(c.turtleWait || c.turtleParked || c.turtleFlip),
        inside: inside(...p),
        gap: window.__nearSolid(...p, 2) ?? 9,
        fault: Boolean(window.__frameFault),
      });
    };
    const path = window.__ramp(V(...S.from), V(...S.to), S.secs, S.vEnd);
    await window.__fly(path, { heading: S.heading, extraMs: S.pushMs, watch: () => snap('fly') });
    if (S.held) {
      await new Promise((res) => {
        const t0 = performance.now();
        const tick = () => {
          snap('held');
          window.__stick(...S.held);
          if (performance.now() - t0 >= S.heldMs) { res(); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }
    await new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        snap('after');
        window.__stick(0, 0, 0, S.after ?? 0.34);
        if (performance.now() - t0 >= S.afterMs) { res(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { rows, wallBox: wallBox || null };`;
}

function r3(v) {
  return v == null ? v : Math.round(v * 1000) / 1000;
}

/* Where the craft is on the thing a scenario is named for: the shopfront's
 * face, which runs on past this box's ends at x = 5.6 for about a metre
 * either way, or its roof. Geometry rather than "near any solid", because a
 * run that starts beside another building is near a solid from its first
 * frame. */
function atTarget(S, r) {
  const [x, y, z] = r.p;
  if (S.kind === 'roof') {
    return y <= WALL.roof + 0.25 && x >= WALL.face && x <= 12.2 && z >= WALL.z0 && z <= WALL.z1;
  }
  return x >= WALL.face - 0.25 && z >= 27.2 && z <= 34.0 && y < WALL.roof + 0.1;
}

/* The numbers every assertion reads, from the first frame on target. */
function measure(S, rows) {
  const m = {
    frames: rows.length, crashes: 0, crashKinds: [], maxInside: 0,
    worstJump: 0, finite: true, fault: false, setDowns: 0, setDownAt: [], unframed: 0,
  };
  let wasCrashed = false;
  /* The shell frame of the last set down's restart; see FRAMES, NOT READS. */
  let setDownFr = -Infinity;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    for (const v of [...r.p, ...r.v, r.rate]) {
      if (!Number.isFinite(v)) {
        m.finite = false;
      }
    }
    if (!Number.isFinite(r.fr)) {
      m.unframed += 1;
    }
    m.fault = m.fault || r.fault;
    m.maxInside = Math.max(m.maxInside, r.inside);
    if (r.crashed && !wasCrashed) {
      m.crashes += 1;
      m.crashKinds.push(r.kind);
    }
    wasCrashed = r.crashed;
    /*
     * A step backwards in the sim clock is a set down, which restarts it:
     * announced, and bounded by the stuck guard, so it is counted rather
     * than read as a teleport. See stuckTick in main.js. The picture moves
     * on the frame AFTER the clock does, so that frame is skipped too:
     * crashResetTick and stuckTick set the craft down after the frame's
     * render, so the frame that restarts the clock still draws the craft
     * where it stopped, and the next one draws it where it was put.
     *
     * FRAMES, NOT READS, made exact on 2026-10-04 with the owner's word
     * ("fix the tests"). The skip was the restart's row and the row after
     * it, which is the same thing only while every row is a new frame, and
     * it is not: the pilot reads the craft on its own requestAnimationFrame
     * and on Low, which this check flies, the shell paces itself on a timer,
     * so the two drift past each other. Counted over two full runs that
     * day with the shell's own frame count: up to three frames read twice in
     * a scenario, and up to twelve reads more than a frame apart. When the
     * frame read twice was the restart's, the re-read spent the skip and the
     * set down itself, 0.78 to 0.85 m at 0 m/s, was scored as a jump: "wall
     * head-on, 10 m/s" failed this guard that way on main's module and on the
     * grip change's alike, in four full runs of six, and passed with --only.
     * Caught in the act with frame counts: frame 1198 read twice, then frame
     * 1199 drawn where the craft was put, 0.845 m away. So each row carries
     * the frame it saw, a re-read is not scored (the frame it saw has not
     * moved), and nothing is scored against the restart's own frame, which
     * is the one frame drawn where the craft was before it was put down.
     * jumpControls() holds the guard to catching a jump one frame after
     * that, and to the re-read that used to fail it.
     */
    const restart = (j) => j > 0 && rows[j].ms < rows[j - 1].ms;
    if (restart(i)) {
      m.setDowns += 1;
      m.setDownAt.push(i);
      setDownFr = r.fr;
    } else if (i > 0 && r.fr > rows[i - 1].fr && rows[i - 1].fr > setDownFr) {
      const q = rows[i - 1];
      const dt = Math.max(0, r.ms - q.ms) / 1000;
      const d = Math.hypot(r.p[0] - q.p[0], r.p[1] - q.p[1], r.p[2] - q.p[2]);
      /* How far the frame moved past what its own speed allows: the
       * render interpolates between physics states, so the allowance is
       * the faster of the two ends plus a frame's slack. */
      const excess = d - Math.max(r.spd, q.spd) * dt - 0.05;
      m.worstJump = Math.max(m.worstJump, excess);
    }
  }
  /*
   * HOW LONG THE CRAFT WAS LEFT STUCK: the longest stretch stuckTick's own
   * test, heldStill, held while the craft was not landed, outside turtle,
   * and separately the longest turtle wait. That is still (under 0.3 m/s and
   * 1.5 rad/s) and not upright (up.y under 0.5), or still, beside a solid
   * and past the perch tilt (bug-6c405527). Beside is the shell's own reach,
   * a solid within the craft's swept radius. The sim clock restarts at a
   * set down, so a step backwards in `ms` ends a stretch. Still is the
   * shell's stillMeter, the speed and the rate stuckTick reads, since
   * bug-243d42f7: the plant's own speed of a craft the knock rattles
   * between two faces is 0.3 m/s a frame in every few, so a guard reading
   * it saw no stuck craft where the page left one for good.
   */
  m.stuckMs = 0;
  m.turtleMs = 0;
  let runStuck = 0;
  let runTurtle = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const d = r.ms - rows[i - 1].ms;
    const still = !r.landed && heldStill(r.upY, r.held[0], r.held[1], r.gap < CRAFT_WORLD_R, false);
    runStuck = still && !r.turtle && d >= 0 ? runStuck + d : 0;
    runTurtle = still && r.turtle && d >= 0 ? runTurtle + d : 0;
    m.stuckMs = Math.max(m.stuckMs, runStuck);
    m.turtleMs = Math.max(m.turtleMs, runTurtle);
  }
  m.endUpY = r3(rows.length ? rows[rows.length - 1].upY : 1);
  if (S.kind === 'held') {
    const held = rows.filter((r) => r.phase === 'held');
    const free = rows.filter((r) => r.phase === 'after');
    m.heldFrames = held.length;
    m.heldAirborne = held.filter((r) => !r.landed).length;
    const lift = free.findIndex((r) => !r.landed);
    m.freeLiftMs = lift >= 0 ? free[lift].ms - free[0].ms : null;
  }
  const touch = rows.findIndex((r) => atTarget(S, r));
  m.touched = touch >= 0;
  if (!m.touched) {
    return m;
  }
  const t0 = rows[touch].ms;
  /* How soon after the touch the first set down came, on the sim clock it
   * ran on: a crash used to set the craft down on the step it hit. */
  const firstSet = m.setDownAt.find((j) => j > touch);
  m.firstSetDownMs = firstSet == null ? null : rows[firstSet - 1].ms - t0;
  const before = rows.slice(0, touch).filter((r) => r.ms >= t0 - 120);
  const win = (a, b) => rows.filter((r) => r.ms >= t0 + a && r.ms <= t0 + b);
  const pre = before.length ? before[0] : rows[touch];
  m.touchMs = t0;
  m.approach = r3(pre.spd);
  const early = win(0, 300);
  m.peakRate = r3(Math.max(...early.map((r) => r.rate)));
  /* The face looks down -x, so leaving it is velocity toward -x. */
  m.rebound = r3(Math.max(0, ...early.map((r) => -r.v[0])));
  m.upKick = r3(Math.max(0, ...early.map((r) => r.v[1] - pre.v[1])));
  m.minUpYAfter = r3(Math.min(...early.map((r) => r.upY)));
  const at150 = win(130, 170)[0] || early[early.length - 1];
  m.keep = r3(at150.spd / (pre.spd || 1));
  const at1s = win(950, 1100)[0];
  m.gapAfter1s = at1s ? r3(at1s.gap) : null;
  m.leftWall = Boolean(at1s && at1s.gap > 0.3);
  const end = rows[rows.length - 1];
  m.endY = r3(end.p[1]);
  m.endSpeed = r3(end.spd);
  const stop = rows.findIndex((r, i) => i > touch && r.spd < 0.3);
  const sp = stop >= 0 ? rows[stop] : end;
  m.slide = r3(Math.hypot(sp.p[0] - rows[touch].p[0], sp.p[2] - rows[touch].p[2]));
  if (S.kind === 'punch') {
    const go = rows.findIndex((r) => r.phase === 'after');
    const out = rows.findIndex((r, i) => i >= go && r.gap > 0.5);
    m.escapeMs = go >= 0 && out >= 0 ? rows[out].ms - rows[go].ms : null;
  }
  return m;
}

/*
 * THE JUMP GUARD'S OWN CONTROLS, run before the browser opens, so a change to
 * measure() that stops it seeing a teleport fails here instead of passing
 * quietly in a flight that happened not to have one. Rows in the shape
 * flyScenario records, a frame each 16 ms, around the set down measured on
 * 2026-10-04 in "wall head-on, 10 m/s": the restart's frame drew the craft at
 * the face, and the next frame drew it 0.78 m away, where it was put, at
 * 0 m/s. Each control is [what, rows, whether the guard must pass].
 */
function jumpControls() {
  const row = (fr, ms, p, spd) => ({
    phase: 'fly', fr, ms, p, v: [spd, 0, 0], spd, upY: 1, rate: 0, held: [spd, 0], crashed: false, kind: '',
    landed: spd === 0, turtle: false, inside: 0, gap: 9, fault: false,
  });
  const AT = [5.479, 2.273, 29.312];
  const PUT = [5.304, 1.564, 29.487];
  const away = (p, d) => [p[0] - d, p[1], p[2]];
  /* Five frames of the run in at 9.1 m/s, ending a frame short of the face. */
  const runIn = [0, 1, 2, 3, 4].map((k) => row(100 + k, 5000 + 16 * k, away(AT, 0.146 * (5 - k)), 9.1));
  const restart = row(105, 0, AT, 0);
  const put = (fr, ms, p = PUT) => row(fr, ms, p, 0);
  const controls = [
    ['a set down read once a frame is not a jump',
      [...runIn, restart, put(106, 16), put(107, 32), put(108, 48)], true],
    ['a set down whose restart frame is read twice is not a jump (the failure of 2026-10-04)',
      [...runIn, restart, { ...restart }, put(106, 16), put(107, 32)], true],
    ['a set down whose restart frame is never read is not a jump',
      [...runIn, put(106, 16), put(107, 32), put(108, 48)], true],
    ['a set down whose next frame is never read is not a jump',
      [...runIn, restart, put(107, 32), put(108, 48)], true],
    ['a frame that moves 0.9 m at 9.1 m/s is a jump',
      [...runIn.slice(0, 3), row(103, 5048, away(AT, 0.146 * 3 - 0.9), 9.1)], false],
    ['a frame read twice and then moved 0.78 m is a jump',
      [...runIn, { ...runIn[4] }, row(105, 5080, away(AT, 0.146 - 0.78), 9.1)], false],
    ['a move of 0.78 m two frames after a set down is a jump',
      [...runIn, restart, put(106, 16), put(107, 32, away(PUT, 0.78)), put(108, 48, away(PUT, 0.78))], false],
  ];
  return controls.map(([what, rows, shouldPass]) => {
    const m = measure({ name: 'control', kind: 'wall' }, rows);
    const passes = m.unframed === 0 && m.worstJump <= 0.10;
    return [what, passes === shouldPass, `worst excess ${r3(m.worstJump)} m, guard ${passes ? 'passes' : 'fails'}`];
  });
}

async function main() {
  const args = process.argv.slice(2);
  const enforceTargets = args.includes('--targets');
  const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
  const jsonOut = (args.find((a) => a.startsWith('--json=')) || '').split('=')[1] || '';

  console.log("crash-check: the jump guard's own controls, flown on no browser\n");
  let controlFails = 0;
  for (const [what, ok, got] of jumpControls()) {
    controlFails += ok ? 0 : 1;
    console.log(`     ${ok ? 'pass' : 'FAIL'}  control ${what}: ${got}`);
  }
  console.log('');

  const page = await openPage({ root: ROOT, width: 400, height: 260, url: '/index.html' });
  const { cdp, sessionId } = page;
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };

  let guardFails = controlFails;
  let targetFails = 0;
  const report = { at: new Date().toISOString(), scenarios: {} };
  try {
    for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady')); i += 1) {
      await sleep(500);
    }
    await ev("const ui = window.__ui; ui.settings.map = 'city'; ui.settings.graphics = 'low'; ui.onAction('fly', ui.settings); return 1;");
    let ready = false;
    for (let i = 0; i < 260; i += 1) {
      const m = await ev('return window.__map ? window.__map() : null');
      if (m && m.ready) {
        ready = true;
        break;
      }
      await sleep(500);
    }
    if (!ready) {
      throw new Error('the city never became ready');
    }
    /* The town keeps baking after it says it is ready; see park-fly.js. */
    await sleep(6000);
    await ev(`${PILOT}\nreturn 1;`);
    await ev('window.__drawOff(true); return 1;');
    console.log(`crash-check: city loaded, ${enforceTargets ? 'guards and targets enforced' : 'guards enforced, targets measured'}\n`);
    /* THE FIRST FLIGHT AFTER BOOT IS A COLD ONE and is thrown away: the first scenario of every run, whichever it was,
     * never came within 0.25 m of its wall, and one run alone with `--only` failed the same way. A flight the same as
     * the second scenario is flown and not measured, so what is measured is flown on a plant that has been stepped. */
    await ev(flyScenario(SCENARIOS[1]));

    for (const S of SCENARIOS) {
      if (only && !S.name.toLowerCase().includes(only.toLowerCase())) {
        continue;
      }
      /* eslint-disable no-await-in-loop */
      const { rows, wallBox } = await ev(flyScenario(S));
      const m = measure(S, rows);
      report.scenarios[S.name] = m;
      console.log(`  ${S.name}`);
      const guard = (ok, what, got) => {
        if (!ok) {
          guardFails += 1;
        }
        console.log(`     ${ok ? 'pass' : 'FAIL'}  guard   ${what}${got ? `: ${got}` : ''}`);
      };
      guard(Boolean(wallBox), 'the shopfront is where this check expects it');
      guard(m.touched, 'the craft reached what it is named for',
        m.touched ? `at ${m.approach} m/s` : 'it never came within 0.25 m of a solid');
      guard(m.finite && !m.fault, 'state stays finite and the frame loop never faults');
      guard(m.maxInside <= 0.01, 'the centre never goes inside a solid', `deepest ${r3(m.maxInside)} m`);
      guard(m.unframed === 0 && m.worstJump <= 0.10, 'no frame moves further than its speed allows',
        `worst excess ${r3(m.worstJump)} m${m.unframed ? `, but ${m.unframed} rows carry no frame count and were not scored` : ''}`);
      /* stuckTick sets a craft down after 1.5 s still and not upright or
       * leaning on a solid, 5 s in turtle; half a second on each is frame
       * granularity. */
      guard(m.stuckMs <= 2000 && m.turtleMs <= 5500, 'never left stuck: set down after 1.5 s still and not upright',
        `longest ${m.stuckMs} ms stuck, ${m.turtleMs} ms in turtle, ${m.setDowns} set down${m.setDowns === 1 ? '' : 's'}`);
      /* A crash is a dull bounce: the only set down left is stuckTick's,
       * which waits 1.5 s of stillness, so none comes inside a second of
       * the touch. */
      guard(m.firstSetDownMs == null || m.firstSetDownMs >= 1000, 'a crash sets nothing down, it bounces',
        m.firstSetDownMs == null ? 'no set down' : `first set down ${m.firstSetDownMs} ms after the touch`);
      if (S.kind === 'held') {
        guard(m.heldFrames > 20 && m.heldAirborne === m.heldFrames,
          'a crash is a bounce: with the hand still on the sticks it stays in the air',
          `${m.heldAirborne} of ${m.heldFrames} frames in the air`);
        guard(m.freeLiftMs != null && m.freeLiftMs <= 1200,
          'and with the sticks centred and the throttle still up it takes off',
          m.freeLiftMs == null ? 'never left the ground' : `${m.freeLiftMs} ms`);
      }
      const list = [...(TARGETS[S.name] || []), ...TARGETS['*']];
      if (m.touched) {
        for (const [what, fn] of list) {
          const [ok, got] = fn(m);
          if (!ok && enforceTargets) {
            targetFails += 1;
          }
          console.log(`     ${ok ? 'met ' : (enforceTargets ? 'FAIL' : 'not ')}  target  ${what}: ${got}`);
        }
      }
    }
  } catch (e) {
    guardFails += 1;
    console.log(`  FAIL  the run did not complete: ${e.message}`);
  } finally {
    await page.close?.();
  }
  if (jsonOut) {
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 1)}\n`);
    console.log(`\ncrash-check: wrote ${jsonOut}`);
  }
  const total = guardFails + (enforceTargets ? targetFails : 0);
  console.log(`\ncrash-check: ${guardFails} guard${guardFails === 1 ? '' : 's'} failed`
    + `${enforceTargets ? `, ${targetFails} target${targetFails === 1 ? '' : 's'} failed` : ''}`);
  process.exit(total);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
