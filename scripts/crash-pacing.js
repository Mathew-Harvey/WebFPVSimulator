/*
 * crash-pacing.js: one input stream, several frame rates, one crash.
 *
 * CLAUDE.md: "A dropped frame must change nothing about the trajectory", and
 * a crash is a reset, so the crash is part of the trajectory. POLISH-PLAN.md
 * item 16 found it was not so. At the edge of the belly cone the wall verdict
 * read the attitude at the frame's end, and the ground judgement was gated on
 * the wall clock, so a pilot on a 60 Hz laptop and one on a 144 Hz monitor got
 * different crashes from the same tap (PROGRESS.md, 2026-09-25, "A belly first
 * wall tap is not a crash", found on the way, items 2 and 4). The owner
 * approved judging crashes per physics step on 2026-09-26 (POLISH-PLAN.md, the
 * owner's answers, 5), on the condition CLAUDE.md sets: the coverage first.
 * This is the coverage.
 *
 * HOW. Each scenario is flown once through dist/sim.wasm and Betaflight, one
 * step a frame, by a pilot on feedback, and what the pilot did is kept: the
 * sticks at every 4 ms RC slot and the step each angle mode switch came on.
 * That is the input stream. It is then flown again from the start at every
 * pacing below and every phase of it, the way src/main.js's frame loop flies
 * it: wall clock frames, dt capped at 100 ms, an accumulator, the frame's RC
 * samples handed to the module before its steps, and the steps one at a time
 * with the shell's crash judge (CrashJudge, src/game/collide.js) asked at the
 * points the frame loop asks it. What comes out is the verdict (a crash, and
 * which rule called it, or none) and the reset step: the sim clock of the last
 * step the frame flew, which is the state the shell sets the craft down from.
 *
 * WHAT IS ASSERTED.
 *
 *   GUARDS, which say the scenario is still the test it is named for:
 *     the flight is the same flight at every pacing, the state after every
 *     step bit identical to the one step a frame flight up to the verdict;
 *     the module's report summed in the shell (foldWorldReport) is the
 *     module's own once a frame report, to the bit; no frame ends in a perch
 *     before the verdict; and for the edge scenarios, the reading the shell
 *     used until 2026-09-26 (frameEndReading below) disagrees with itself
 *     across these pacings, so the flight still sits on the edge it was
 *     chosen for and a pass is not a flight that drifted off it.
 *   THE CHECK: the same verdict and the same reset step at every pacing and
 *     every phase, and the ground's judged hits on the same steps.
 *   ANCHORS: a steep nose first hit is a crash and a belly first tap is not,
 *     at every pacing, so agreeing is never bought by never resetting.
 *
 * Deterministic: Node only, no clock, no random, and no JS trigonometry on
 * anything that reaches the module (the pilots turn angles with
 * src/props/trig.js, as scripts/world-check.js's do).
 *
 * Usage: node scripts/crash-pacing.js [--only=name] [--verbose]
 * Exit code is the number of failed lines.
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
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import {
  CrashJudge, emptyWorldReport, foldWorldReport, stateUpZ, solidContactCrash, bodyUpDotWorld,
  canPerch, GROUND_MU, GROUND_E, GRAZE_SPEED_MAX, BOUNCE_COOLDOWN_MS, CRASH_BELLY_UP, contactMaterial,
} from '../src/game/collide.js';
import { sincos } from '../src/props/trig.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = await readFile(join(root, 'dist/sim.wasm'));
const CONFIG = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

/* The five inch at rest, and at hover, as scripts/world-check.js has them. */
const REST = 0.033;
const HOVER = 0.27;
const WALL = contactMaterial('wall');
/* The shell's RC grid (src/main.js RC_HZ) and its cap on a frame's dt. */
const RC_MS = 4;
const DT_CAP_MS = 100;
/* Where the wall clock stands at the first frame: far enough past zero that
 * a judge whose ground cooldown starts at zero has nothing pending. */
const WALL0 = 1000;

const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
function speedOf(st) {
  return Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);
}

/* ------------------------------------------------------------------ *
 * Pilots. Each returns [roll, pitch, yaw, throttle] from the state and
 * may set ctx.angle. Only the recording flight runs them.
 * ------------------------------------------------------------------ */

function heightHold(ctx, st, z) {
  const e = z - st[3];
  ctx.i = clamp(ctx.i + e * 0.004 * 0.4, -0.3, 0.3);
  const u = 1 - 2 * (st[8] * st[8] + st[9] * st[9]);
  return clamp((HOVER + 0.15 * e - 0.1 * st[6] + ctx.i) / (u > 0.5 ? u : 0.5), 0, 1);
}

/* Run in along +x in angle mode at vRun, height held at 4 m; with the face
 * dFlip ahead, acro and the stick on the error to a pitch of pitchDeg (nose
 * up positive) at throttle thr: scripts/world-check.js's flipPilot. */
export function flipPilot(vRun, dFlip, pitchDeg, thr) {
  const want = sincos((pitchDeg * Math.PI) / 180, { s: 0, c: 1 });
  return (ms, st, ctx) => {
    if (ctx.flip || -st[1] <= dFlip) {
      ctx.flip = true;
      ctx.angle = false;
      const w = st[7];
      const x = st[8];
      const y = st[9];
      const z = st[10];
      const nx = 1 - 2 * (y * y + z * z);
      const nz = 2 * (x * z - w * y);
      const err = want.s * nx - want.c * nz;
      return [0, clamp(1.6 * err + 0.03 * st[12], -1, 1), 0, thr];
    }
    ctx.cruise = ctx.cruise || st[4] >= vRun;
    const stick = ctx.cruise ? -clamp(0.3 + 0.2 * (vRun - st[4]), 0, 0.8) : -0.8;
    return [0, stick, 0, heightHold(ctx, st, 4)];
  };
}

/* Low over the grass at vRun, height held at h. From x = 0: the throttle cut
 * for dropMs with the stick forward at fwd, so it settles onto its belly and
 * skims; the height held again until rollAt; then a bank of rollDeg at
 * throttle thr, low, so it comes down on its side. */
export function skimPilot(vRun, h, dropMs, rollAt, rollDeg, thr, fwd) {
  return (ms, st, ctx) => {
    if (!ctx.go && st[1] >= 0) {
      ctx.go = true;
      ctx.t0 = ms;
    }
    if (!ctx.go) {
      ctx.cruise = ctx.cruise || st[4] >= vRun;
      const stick = ctx.cruise ? -clamp(0.3 + 0.2 * (vRun - st[4]), 0, 0.8) : -0.8;
      return [0, stick, 0, heightHold(ctx, st, h)];
    }
    const t = ms - ctx.t0;
    if (t < dropMs) {
      return [0, -fwd, 0, 0];
    }
    if (t < rollAt) {
      return [0, -fwd, 0, heightHold(ctx, st, h)];
    }
    return [clamp(rollDeg / 55, -1, 1), -fwd, 0, thr];
  };
}

/* Upside down from a hover, the throttle cut: it falls flat on its back. */
function flatBackPilot() {
  return (ms, st, ctx) => {
    ctx.angle = false;
    if (!ctx.over && 1 - 2 * (st[8] * st[8] + st[9] * st[9]) < -0.95) {
      ctx.over = true;
    }
    return ctx.over ? [0, 0, 0, 0] : [1, 0, 0, 0.3];
  };
}

/* ------------------------------------------------------------------ *
 * The scenarios, found by sweeping these pilots' numbers for flights the
 * frame end reading disagreed about. `edge` marks those, and the reading
 * must still disagree about them; `expect` pins an anchor's verdict. A
 * flight runs to `after` ms past its first contact, or to its verdict.
 * The wall is the face x = 0, looking down -x.
 *
 * RE-AIMED ON 2026-10-04, with the owner's word, when the five inch's drag
 * changed (src/native/plant.c, cda_front, cda_side and k_rotor_drag) and
 * every flight here arrived somewhere slightly different. Flown as they
 * were, four of the five edge scenarios came to a different verdict and
 * three were no longer on an edge, so each was swept again on its approach
 * speed, the one number changed, until it was the flight its name
 * describes, with the verdict it had before, and sat on an edge again. The
 * comments below give the new flights' numbers. The check itself, one
 * verdict at every pacing, passed throughout.
 *
 * RE-AIMED AGAIN ON 2026-10-09, with the owner's word, when the five inch's
 * belly came up from 45 mm to 33 (plant.c hull_hz_down). Two ground
 * scenarios had left their edge: the stutter one now perched a frame before
 * its verdict, and the side touches one was no crash at every pacing. Each
 * was swept on its approach speed only, 7.40 to 7.45 and 6.90 to 7.08, and
 * keeps the verdict it had: a bump at 2816 ms then a crash at 2998 for the
 * first, first contact at 6.87 m/s; bumps at 2825 and 3009 ms and no crash
 * for the second, first contact at 6.42 m/s (7.07 and 7.10 both crash). The
 * numbers in those two comments are from before this re-aim.
 * ------------------------------------------------------------------ */

const WALL_BOX = [0, -20, -1, 1, 20, 30];

export const SCENARIOS = [
  /* A tap 4.1 m/s closing with the belly about 50 degrees off the wall:
   * the step it touches is outside the cone, and the craft goes on turning
   * its belly onto the wall, so a frame that ends later reads it inside. */
  {
    name: 'belly cone edge: a tap the step it lands on calls a crash',
    edge: true,
    world: [WALL_BOX], pose: [-14, 0, 4], ms: 9000, after: 300,
    pilot: () => flipPilot(5.2, 1.3, 46, 0.05),
  },
  /* Shallower, the belly about 64 degrees off the wall: the props meet it
   * first, closing at 4.04 m/s, and the frame 3 ms later at 3.55. No one step
   * both closes at a smack's speed and touches with the frame, but a frame
   * whose report sums the two steps does. */
  {
    name: 'belly cone edge: a tap no one step calls a crash',
    edge: true,
    world: [WALL_BOX], pose: [-14, 0, 4], ms: 9000, after: 300,
    pilot: () => flipPilot(4.8, 1.0, 34, 0.05),
  },
  /* A belly skim at 6.6 m/s, then touches of the grass at 144, 172 and
   * 185 ms as it rolls onto its side, body up 0.75, 0.71 and 0.69: step by
   * step the one at 185 is the first past the cooldown, at 4.6 m/s, and a
   * crash. A frame that ends just past the cooldown judges the touch at 172
   * instead, on the belly by a hair, and the cooldown that starts hides the
   * rest. */
  {
    name: 'the ground: a side touch just past the cooldown after a skim',
    edge: true,
    world: [], pose: [-12, 0, 0.2], ms: 9000, after: 700,
    pilot: () => skimPilot(7.15, 0.2, 100, 170, 70, 0.15, 0.2),
  },
  /* A skim, a touch 117 ms later on the belly, one at 159 on the belly by a
   * hair, and touches on the side at 175 and 185 ms: step by step the one at
   * 185 is the first past the cooldown, and a crash. A stutter frame runs the
   * wall clock ahead of the sim clock, the cooldown ends early, a belly touch
   * (117 or 159 ms, or the skim's own tail) is judged, a bump, and the
   * cooldown it starts hides the side touches. */
  {
    name: 'the ground: a touch inside the cooldown, and a stutter',
    edge: true,
    world: [], pose: [-12, 0, 0.2], ms: 9000, after: 700,
    pilot: () => skimPilot(7.45, 0.2, 80, 220, 70, 0, 0.2),
  },
  /* A skim, then side touches through the end of the cooldown as the craft
   * slows through a smack's speed: the last one inside the cooldown, at
   * 178 ms, is at 4.02 m/s, and by the first step past it, at 182 ms, it is
   * down to 3.99, under a smack. A frame that straddles the end of the
   * cooldown judges the touch on its fastest step instead. Until 2026-10-04
   * the grass stopped it outright, 1.1 m/s by the end of the cooldown; the
   * drag change took that flight away and this is the nearest one left. */
  {
    name: 'the ground: side touches no one step calls a crash',
    edge: true,
    world: [], pose: [-12, 0, 0.2], ms: 9000, after: 700,
    pilot: () => skimPilot(7.08, 0.2, 80, 190, 70, 0.15, 0.2),
  },
  {
    name: 'anchor: a steep nose first hit is a crash',
    expect: 'solid',
    world: [WALL_BOX], pose: [-14, 0, 4], ms: 9000, after: 300,
    pilot: () => flipPilot(7, 1.6, -75, 0.35),
  },
  {
    name: 'anchor: a belly first tap is not',
    expect: '',
    world: [WALL_BOX], pose: [-14, 0, 4], ms: 9000, after: 300,
    pilot: () => flipPilot(7, 1.3, 90, 0.05),
  },
  {
    name: 'anchor: flat on its back onto the grass at 8 m/s is a crash',
    expect: 'ground',
    world: [], pose: [0, 0, 3], ms: 5000, after: 300,
    pilot: flatBackPilot,
  },
];

/* ------------------------------------------------------------------ *
 * The pacings: wall clock frame intervals, cycled. Every phase of each is
 * flown: the first frame lands `phase` ms after the clock starts.
 * ------------------------------------------------------------------ */

function everyMs(period) {
  const out = [];
  for (let p = 1; p <= Math.ceil(period); p += 1) {
    out.push({ phase: p, rotate: 0 });
  }
  return out;
}

/* A 60 Hz laptop that hitches: a 150 ms frame (the shell caps it at
 * 100 ms of steps, so the wall clock runs ahead of the sim clock), a short
 * one after it, a dropped one. Every rotation of the pattern, at three
 * phases. */
const STUTTER = [16.7, 16.7, 16.6, 150, 8.3, 33.3, 16.7, 50];

export const PACINGS = [
  { name: 'one step a frame', periods: [1], phases: [{ phase: 1, rotate: 0 }] },
  { name: '144 Hz', periods: [1000 / 144], phases: everyMs(1000 / 144) },
  { name: '60 Hz', periods: [1000 / 60], phases: everyMs(1000 / 60) },
  { name: '30 Hz', periods: [1000 / 30], phases: everyMs(1000 / 30) },
  {
    name: 'a stuttering 60 Hz',
    periods: STUTTER,
    phases: STUTTER.flatMap((_, r) => [1, 6, 11].map((p) => ({ phase: p, rotate: r }))),
  },
];

/* The frames of a pacing, as src/main.js's frameBody turns wall time into
 * steps: dt capped, an accumulator, whole steps. */
export function* frames(pacing, ph) {
  let prev = WALL0;
  let now = WALL0 + ph.phase;
  let acc = 0;
  for (let k = 0; ; k += 1) {
    const dt = Math.min(now - prev, DT_CAP_MS);
    prev = now;
    acc += dt;
    const steps = Math.floor(acc);
    acc -= steps;
    yield { wall: now, steps };
    now += pacing.periods[(k + ph.rotate) % pacing.periods.length];
  }
}

/* ------------------------------------------------------------------ *
 * The module.
 * ------------------------------------------------------------------ */

export async function newSim(sc) {
  const sim = await loadSim(wasm);
  sim.e.sim_set_airframe(0);
  if (sim.init(CONFIG) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  sim.e.sim_world_clear();
  sim.e.sim_world_frame(0, 0, 0, 0);
  for (const b of sc.world) {
    sim.e.sim_world_box(...b, WALL.e, WALL.mu);
  }
  sim.e.sim_world_build();
  sim.e.sim_set_pose(sc.pose[0], sc.pose[1], sc.pose[2], 1, 0, 0, 0);
  sim.e.sim_rest();
  sim.setAngleMode(true);
  const repPtr = sim.e.malloc(11 * 8);
  const readReport = () => {
    sim.e.sim_world_report(repPtr);
    return Float64Array.from(new Float64Array(sim.e.memory.buffer, repPtr, 11));
  };
  /* The shell raises the ground under the craft every step
   * (raiseGroundFromState); here it is level grass at the rest height. */
  const raiseGround = () => sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, -REST, GROUND_MU, GROUND_E);
  return { sim, readReport, raiseGround };
}

/* Fly the scenario's pilot one step a frame and keep what it did, and the
 * flight it flew: every step's state, ground contacts and report, judged by
 * nothing, to the end. */
export async function record(sc) {
  const { sim, readReport, raiseGround } = await newSim(sc);
  const pilot = sc.pilot();
  const ctx = { i: 0, angle: true };
  let angle = true;
  const input = [];
  const modes = [];
  const rows = [];
  let st = sim.readState().state;
  const st0 = st;
  let first = -1;
  for (let ms = 0; ms < sc.ms; ms += 1) {
    if (ms % RC_MS === 0) {
      const k = pilot(ms, st, ctx);
      if (ctx.angle !== angle) {
        angle = ctx.angle;
        modes.push({ step: ms, angle });
      }
      input.push([ms, k[0], k[1], k[2], k[3]]);
    }
    if (modes.length && modes[modes.length - 1].step === ms) {
      sim.setAngleMode(angle);
    }
    if (ms % RC_MS === 0) {
      const k = input[input.length - 1];
      sim.input(k[0] / 1000, k[1], k[2], k[3], k[4]);
    }
    raiseGround();
    sim.step(1);
    st = sim.readState().state;
    const rep = readReport();
    const g = sim.e.sim_ground_contacts();
    rows.push({ at: ms + 1, st, g, rep });
    if (first < 0 && (rep[0] > 0 || g > 0)) {
      first = ms + 1;
    }
    if (first >= 0 && ms + 1 >= first + sc.after) {
      break;
    }
  }
  return { input, modes, endMs: rows.length, first, rows, st0 };
}

/*
 * Fly a recorded stream at one pacing and phase, as the shell's frame loop
 * does, with the shell's judge asked where src/main.js asks it: every step,
 * with the step's own report, the loop ending on a crash step, and what the
 * steps found read after them. `report` is 'step' (read every step and
 * folded, as the shell reads it), and for the fold guard, which needs whole
 * frames to the end, 'fold' (read every step and folded) or 'frame' (read
 * once a frame, summed by the module), both judged by nothing. Returns the
 * verdict, the ground's judged hits, the rows (the state after every step,
 * its ground contacts and its own report) and the state the flight started
 * from.
 */
export async function replay(sc, stream, pacing, ph, report = 'step') {
  const { sim, readReport, raiseGround } = await newSim(sc);
  const judge = new CrashJudge();
  judge.seat(1, 0);
  const rows = [];
  const frameReps = [];
  const hits = [];
  let verdict = null;
  let perchedEarly = null;
  let nextInput = 0;
  let nextMode = 0;
  let stepIdx = 0;
  let st = sim.readState().state;
  const st0 = st;
  let g = 0;
  const acc = new Float64Array(11);
  for (const f of frames(pacing, ph)) {
    if (stepIdx >= stream.endMs || verdict) {
      break;
    }
    const steps = Math.min(f.steps, stream.endMs - stepIdx);
    /* The frame's RC samples, before its steps. */
    const blockEnd = stepIdx + steps;
    while (nextInput < stream.input.length && stream.input[nextInput][0] < blockEnd) {
      const k = stream.input[nextInput];
      sim.input(k[0] / 1000, k[1], k[2], k[3], k[4]);
      nextInput += 1;
    }
    emptyWorldReport(acc);
    judge.beginFrame();
    for (let i = 0; i < steps; i += 1) {
      while (nextMode < stream.modes.length && stream.modes[nextMode].step === stepIdx) {
        sim.setAngleMode(stream.modes[nextMode].angle);
        nextMode += 1;
      }
      const before = st;
      raiseGround();
      sim.step(1);
      st = sim.readState().state;
      stepIdx += 1;
      g = sim.e.sim_ground_contacts();
      const rep = report === 'frame' ? null : readReport();
      if (rep) {
        foldWorldReport(acc, rep);
      }
      rows.push({ at: stepIdx, st, g, rep });
      /* No scenario takes off or waits in turtle, so the perch may take a
       * craft at rest, as it may in the shell. */
      if (report === 'step' && judge.step(before, st, g, rep, stepIdx, true)) {
        break;
      }
    }
    const frameRep = report === 'frame' ? readReport() : acc;
    frameReps.push({ at: stepIdx, rep: Float64Array.from(frameRep) });
    if (report !== 'step') {
      continue;
    }
    /* The shell's perch, which it skips on a crash step and which would
     * freeze the craft: no scenario may reach it before its verdict. */
    const tiltDeg = (Math.acos(stateUpZ(st)) * 180) / Math.PI;
    const rate = Math.sqrt(st[11] * st[11] + st[12] * st[12] + st[13] * st[13]);
    const perched = !judge.crash && g > 0 && canPerch(tiltDeg, speedOf(st), rate);
    if (perched && perchedEarly == null) {
      perchedEarly = stepIdx;
    }
    if (judge.hit) {
      hits.push({ at: judge.hitAtMs, hard: judge.hitHard, crash: judge.hitCrash });
    }
    if (judge.crash) {
      verdict = { kind: judge.crash, at: stepIdx };
    }
  }
  return { verdict, hits, rows, frameReps, perchedEarly, st0 };
}

/*
 * THE READING THE SHELL USED UNTIL 2026-09-26, for the edge guard only: the
 * three rules once a frame, on the frame's peaks, its summed report and the
 * attitude at its end, the ground gated on the wall clock (the perch that
 * came before that judgement is left out). It is not the shell's any more
 * and nothing here asserts it is right; it is here so that a scenario named
 * for the edge can show it is still on the edge. Read over the recorded
 * flight's rows, which every pacing reproduces to the bit (the first
 * guard).
 */
export function frameEndReading(rows, st0, pacing, ph) {
  let groundAtWall = 0;
  let k = 0;
  let prevSt = st0;
  let last = null;
  for (const f of frames(pacing, ph)) {
    if (k >= rows.length) {
      return { kind: '', at: null };
    }
    let peakClosing = 0;
    let peakSpeed = 0;
    let peakUp = 1;
    let saw = false;
    let stopDv = 0;
    let stopUp = 1;
    const acc = emptyWorldReport(new Float64Array(11));
    for (let i = 0; i < f.steps && k < rows.length; i += 1, k += 1) {
      const r = rows[k];
      const before = prevSt;
      prevSt = r.st;
      const spd = speedOf(before);
      const dvx = r.st[4] - before[4];
      const dvy = r.st[5] - before[5];
      const dvz = r.st[6] - before[6];
      const dv2 = dvx * dvx + dvy * dvy + dvz * dvz;
      if (dv2 > stopDv * stopDv) {
        stopDv = Math.sqrt(dv2);
        stopUp = stateUpZ(r.st);
      }
      if (r.g > 0) {
        saw = true;
        if (-before[6] > peakClosing) {
          peakClosing = -before[6];
        }
        if (spd > peakSpeed) {
          peakSpeed = spd;
          peakUp = stateUpZ(r.st);
        }
      }
      foldWorldReport(acc, r.rep);
      last = r;
    }
    if (!last) {
      continue;
    }
    let kind = '';
    if ((last.g > 0 || saw) && f.wall - groundAtWall > BOUNCE_COOLDOWN_MS) {
      if ((peakClosing >= GRAZE_SPEED_MAX || peakSpeed >= GRAZE_SPEED_MAX) && peakUp < CRASH_BELLY_UP) {
        kind = 'ground';
      }
      groundAtWall = f.wall;
    }
    if (!kind && acc[0] > 0 && solidContactCrash(acc, last.st[7], last.st[8], last.st[9], last.st[10], 1, 0)) {
      kind = 'solid';
    }
    if (!kind && stopDv >= GRAZE_SPEED_MAX && stopUp < CRASH_BELLY_UP && !(acc[0] > 0)) {
      kind = 'stop';
    }
    if (kind) {
      return { kind, at: last.at };
    }
  }
  return { kind: '', at: null };
}

/* ------------------------------------------------------------------ */

function same(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const show = (v) => (v ? `${v.kind} at ${v.at} ms` : 'no crash');

async function runScenario(sc, check, verbose) {
  console.log(`  ${sc.name}`);
  const stream = await record(sc);
  if (stream.first < 0) {
    check('it reaches what it is named for', false, 'no contact at all');
    return;
  }
  /* The pilot's own flight, which every replay must be to the bit. */
  const ref = stream;
  const first = ref.rows.find((r) => r.at === stream.first);
  const pre = ref.rows.find((r) => r.at === stream.first - 1);
  const closing = Math.max(0, ...ref.rows.filter((r) => r.at >= stream.first && r.at < stream.first + 30)
    .map((r) => r.rep[1]));
  const belly = pre ? bodyUpDotWorld(pre.st[7], pre.st[8], pre.st[9], pre.st[10], -1, 0, 0, 1, 0) : 0;
  const groundFirst = first && first.g > 0;
  console.log(`     first contact at ${stream.first} ms, ${groundFirst ? 'the ground' : 'the wall'}`
    + `${groundFirst ? `, at ${r3(speedOf(pre.st))} m/s` : `, closing ${r3(closing)} m/s, belly on the wall ${r3(belly)}`}`);

  const tally = new Map();
  const hitTally = new Map();
  let traceSame = true;
  let traceNote = '';
  let perched = null;
  const readings = new Map();
  for (const pacing of PACINGS) {
    for (const ph of pacing.phases) {
      /* eslint-disable no-await-in-loop */
      const got = await replay(sc, stream, pacing, ph);
      const key = show(got.verdict);
      const slot = tally.get(key) || { n: 0, where: new Map() };
      slot.n += 1;
      slot.where.set(pacing.name, (slot.where.get(pacing.name) || 0) + 1);
      tally.set(key, slot);
      const hk = got.hits.map((h) => `${h.at}${h.crash ? ' crash' : (h.hard ? ' hard' : ' bump')}`).join(', ') || 'none';
      hitTally.set(hk, (hitTally.get(hk) || 0) + 1);
      if (got.perchedEarly != null && perched == null) {
        perched = `${pacing.name}, phase ${ph.phase}, at ${got.perchedEarly} ms`;
      }
      const n = Math.min(got.rows.length, ref.rows.length);
      for (let i = 0; i < n && traceSame; i += 1) {
        const a = got.rows[i];
        const b = ref.rows[i];
        if (a.at !== b.at || a.g !== b.g || !same(a.st, b.st) || !same(a.rep, b.rep)) {
          traceSame = false;
          traceNote = `${pacing.name}, phase ${ph.phase}: step ${got.rows[i].at} differs`;
        }
      }
      const rd = frameEndReading(ref.rows, ref.st0, pacing, ph);
      const rk = rd.kind || 'none';
      const rs = readings.get(pacing.name) || {};
      rs[rk] = (rs[rk] || 0) + 1;
      readings.set(pacing.name, rs);
    }
  }
  /* The fold guard: the same flight at 30 Hz to its end, the report read
   * once a frame by the module, against the per step reads folded in the
   * shell. */
  const p30 = PACINGS.find((p) => p.name === '30 Hz');
  const byStep = await replay(sc, stream, p30, p30.phases[0], 'fold');
  const byFrame = await replay(sc, stream, p30, p30.phases[0], 'frame');
  const nf = Math.min(byStep.frameReps.length, byFrame.frameReps.length);
  let foldSame = nf > 0;
  for (let i = 0; i < nf && foldSame; i += 1) {
    foldSame = byStep.frameReps[i].at === byFrame.frameReps[i].at
      && same(byStep.frameReps[i].rep, byFrame.frameReps[i].rep);
  }

  const verdicts = [...tally.entries()].map(([k, v]) => `${k}: ${v.n} (${[...v.where.entries()].map(([p, n]) => `${p} ${n}`).join(', ')})`);
  const readingText = [...readings.entries()].map(([p, r]) => `${p} ${Object.entries(r).map(([k, n]) => `${k} ${n}`).join('/')}`).join(' | ');
  const kindsRead = new Set();
  for (const r of readings.values()) {
    for (const k of Object.keys(r)) {
      kindsRead.add(k);
    }
  }
  if (verbose) {
    console.log(`     hits: ${[...hitTally.entries()].map(([k, n]) => `[${k}] ${n}`).join(' | ')}`);
  }

  check('the flight is the same at every pacing: every step\'s state, ground contacts and report to the bit, up to the verdict',
    traceSame, traceNote);
  check('the report folded per step is the module\'s own once a frame, to the bit', foldSame,
    `${nf} frames at 30 Hz`);
  check('no frame ends in a perch before the verdict', perched == null, perched || '');
  if (sc.edge) {
    check('it is on the edge: read at frame ends on the wall clock, as until 2026-09-26, the pacings disagree',
      kindsRead.size > 1, readingText);
  }
  check('the same crash verdict and reset step at every pacing and phase', tally.size === 1, verdicts.join(' | '));
  check('the ground\'s judged hits on the same steps at every pacing and phase', hitTally.size === 1,
    [...hitTally.entries()].map(([k, n]) => `[${k}] ${n}`).join(' | '));
  if (sc.expect != null) {
    const want = sc.expect ? `${sc.expect} at` : 'no crash';
    check(`and at every pacing and phase it is ${sc.expect ? `a crash, called by the ${sc.expect} rule` : 'no crash'}`,
      [...tally.keys()].every((k) => k.startsWith(want)), [...tally.keys()].join(' | '));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
  const verbose = args.includes('--verbose');
  let failures = 0;
  const check = (name, ok, detail) => {
    if (!ok) {
      failures += 1;
    }
    console.log(`     ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  };
  const n = PACINGS.reduce((s, p) => s + p.phases.length, 0);
  console.log(`crash-pacing: ${SCENARIOS.length} scenarios, each flown at ${n} pacings and phases`
    + ` (${PACINGS.map((p) => `${p.name} ${p.phases.length}`).join(', ')})\n`);
  for (const sc of SCENARIOS) {
    if (only && !sc.name.toLowerCase().includes(only.toLowerCase())) {
      continue;
    }
    try {
      await runScenario(sc, check, verbose);
    } catch (e) {
      check('the scenario ran', false, e.stack || String(e));
    }
  }
  console.log(`\ncrash-pacing: ${failures === 0 ? 'all passed' : `${failures} FAILED`}`);
  process.exit(failures);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(99);
  });
}
