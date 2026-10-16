/*
 * bounce-check.js: a crash is a dull bounce, and the same bounce at every
 * frame rate.
 *
 * The owner, 2026-10-16: "fix crashing to not be annoying no reset, just
 * dull bounce always". Until then a crash ended the step loop and the craft
 * was set down; scripts/crash-pacing.js holds the verdict and the step it
 * was reached on to one answer at every pacing, and stops there, because
 * nothing after a reset was the same flight. Now the flight goes on from
 * the crash step, with the shell's own bounce (putDullBounce in
 * src/game/collide.js) put on the module at that step, and every step after
 * it is trajectory. CLAUDE.md: "A dropped frame must change nothing about
 * the trajectory." This holds the flight after the bounce to that.
 *
 * HOW. crash-pacing's scenarios and pacings, its recorded input streams
 * (flown on to RUN_ON ms past the first contact rather than to the
 * verdict), flown again at every pacing and phase the way src/main.js's
 * step loop flies them now: the judge asked every step, and on a crash
 * step or a knock (solidContactKnock) the bounce put on the module there
 * and the loop carried on. A replay ends at the first frame the shell
 * would perch the craft, which is a frame end and so not the same step at
 * every pacing; up to there every step must be the same.
 *
 * WHAT IS ASSERTED.
 *   THE CHECK: every step's state, after the bounce, the same to the bit at
 *     every pacing and phase as at one step a frame, and the bounces on the
 *     same steps.
 *   ANCHORS: a steep nose first hit bounces on the step it is judged, comes
 *     out of it with no spin and no faster off the face than DULL_OUT_MAX,
 *     and keeps flying (never perched, never inverted) for the rest of the
 *     run; a belly first tap is no bounce at all; flat on its back onto the
 *     grass bounces off the ground with no spin.
 *
 * Deterministic: Node only, no clock, no random. Usage:
 *   node scripts/bounce-check.js [--only=name]
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

import {
  CrashJudge, putDullBounce, solidContactKnock, stateUpZ, canPerch, DULL_OUT_MAX,
} from '../src/game/collide.js';
import { SCENARIOS, PACINGS, frames, record, newSim } from './crash-pacing.js';

/* How far past the first contact each stream is flown. */
const RUN_ON = 1500;
/* How long a craft that bounced must go on flying, and the body rate that
 * would be a tumble: crash-check.js's target for a 20 m/s wall is 25. */
const KEEP_FLYING_MS = 500;
const TUMBLE_RATE = 10;

const speedOf = (st) => Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);
const rateOf = (st) => Math.sqrt(st[11] * st[11] + st[12] * st[12] + st[13] * st[13]);
const r3 = (v) => Math.round(v * 1000) / 1000;

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

/* The stream at one pacing and phase, as the shell's step loop flies it now. */
async function fly(sc, stream, pacing, ph) {
  const { sim, readReport, raiseGround } = await newSim(sc);
  const judge = new CrashJudge();
  judge.seat(1, 0);
  const out = new Float64Array(3);
  const rows = [];
  const bounces = [];
  let nextInput = 0;
  let nextMode = 0;
  let stepIdx = 0;
  let st = sim.readState().state;
  let perchAt = null;
  for (const f of frames(pacing, ph)) {
    if (stepIdx >= stream.endMs || perchAt != null) {
      break;
    }
    const steps = Math.min(f.steps, stream.endMs - stepIdx);
    const blockEnd = stepIdx + steps;
    while (nextInput < stream.input.length && stream.input[nextInput][0] < blockEnd) {
      const k = stream.input[nextInput];
      sim.input(k[0] / 1000, k[1], k[2], k[3], k[4]);
      nextInput += 1;
    }
    judge.beginFrame();
    let g = 0;
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
      const rep = readReport();
      const crashed = judge.step(before, st, g, rep, stepIdx, true);
      if (crashed || (rep[0] > 0 && solidContactKnock(rep, st[7], st[8], st[9], st[10], 1, 0))) {
        const kind = crashed ? judge.stepKind : 'solid';
        /* The ground plane newSim raises is level grass. */
        if (putDullBounce(sim, kind, before, st, rep, 0, 0, 1, 1, 0, out)) {
          st = sim.readState().state;
          bounces.push({ at: stepIdx, kind: crashed ? kind : 'knock' });
        }
      }
      rows.push({ at: stepIdx, st, g });
    }
    /* The shell's perch, at the frame's end, on its last step's state. */
    const tiltDeg = (Math.acos(stateUpZ(st)) * 180) / Math.PI;
    if (g > 0 && canPerch(tiltDeg, speedOf(st), rateOf(st))) {
      perchAt = stepIdx;
    }
  }
  return { rows, bounces, perchAt };
}

async function runScenario(sc, check) {
  console.log(`  ${sc.name}`);
  const stream = await record({ ...sc, after: RUN_ON });
  if (stream.first < 0) {
    check('it reaches what it is named for', false, 'no contact at all');
    return;
  }
  const ref = await fly(sc, stream, PACINGS[0], PACINGS[0].phases[0]);
  const showB = (b) => b.map((x) => `${x.kind} ${x.at}`).join(', ') || 'none';
  let traceSame = true;
  let traceNote = '';
  let bounceSame = true;
  let bounceNote = '';
  let flights = 0;
  for (const pacing of PACINGS) {
    for (const ph of pacing.phases) {
      /* eslint-disable no-await-in-loop */
      const got = await fly(sc, stream, pacing, ph);
      flights += 1;
      const n = Math.min(got.rows.length, ref.rows.length);
      for (let i = 0; i < n && traceSame; i += 1) {
        const a = got.rows[i];
        const b = ref.rows[i];
        if (a.at !== b.at || a.g !== b.g || !same(a.st, b.st)) {
          traceSame = false;
          traceNote = `${pacing.name}, phase ${ph.phase}: step ${a.at} differs`;
        }
      }
      const upTo = got.rows.length ? got.rows[n - 1].at : 0;
      const mine = got.bounces.filter((x) => x.at <= upTo);
      const theirs = ref.bounces.filter((x) => x.at <= upTo);
      if (bounceSame && showB(mine) !== showB(theirs)) {
        bounceSame = false;
        bounceNote = `${pacing.name}, phase ${ph.phase}: ${showB(mine)} against ${showB(theirs)}`;
      }
    }
  }
  check('the flight after the bounce is the same at every pacing: every step\'s state to the bit, to the perch or the end',
    traceSame, traceNote || `${flights} flights, ${ref.rows.length} steps at one step a frame`);
  check('the bounces on the same steps at every pacing and phase', bounceSame,
    bounceNote || showB(ref.bounces));

  const firstB = ref.bounces[0];
  const rowAt = (at) => ref.rows.find((r) => r.at === at);
  if (sc.expect === 'solid') {
    const b = firstB && rowAt(firstB.at);
    check('a steep nose first hit bounces off the wall on the step it is judged, with no spin, at a walking pace',
      Boolean(b) && firstB.kind === 'solid' && rateOf(b.st) === 0 && -b.st[4] > 0 && -b.st[4] <= DULL_OUT_MAX + 1e-9,
      b ? `${firstB.kind} at ${firstB.at} ms, ${r3(-b.st[4])} m/s off the face, ${rateOf(b.st)} rad/s` : 'no bounce');
    /* The stream is the pilot's, recorded open loop, so later on it comes
     * down onto the grass under the wall; the half second after the hit is
     * the bounce's. */
    const after = firstB ? ref.rows.filter((r) => r.at > firstB.at && r.at <= firstB.at + KEEP_FLYING_MS) : [];
    const minUp = Math.min(...after.map((r) => stateUpZ(r.st)));
    const peak = Math.max(...after.map((r) => rateOf(r.st)));
    check(`and it keeps flying for ${KEEP_FLYING_MS} ms after it: off the ground, never on its back, no tumble`,
      after.length === KEEP_FLYING_MS && after.every((r) => r.g === 0) && minUp > 0 && peak < TUMBLE_RATE,
      `lowest body up ${r3(minUp)}, peak ${r3(peak)} rad/s against a tumble's ${TUMBLE_RATE}`);
  } else if (sc.expect === '') {
    const wall = ref.bounces.filter((x) => x.kind !== 'ground');
    check('a belly first tap is no bounce off the wall at all', wall.length === 0, showB(ref.bounces));
  } else if (sc.expect === 'ground') {
    const b = firstB && rowAt(firstB.at);
    check('flat on its back onto the grass bounces off the ground, with no spin',
      Boolean(b) && firstB.kind === 'ground' && rateOf(b.st) === 0 && b.st[6] > 0 && b.st[6] <= DULL_OUT_MAX + 1e-9,
      b ? `${firstB.kind} at ${firstB.at} ms, ${r3(b.st[6])} m/s up, ${rateOf(b.st)} rad/s` : 'no bounce');
  }
}

async function main() {
  const only = (process.argv.slice(2).find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
  let failures = 0;
  const check = (name, ok, detail) => {
    if (!ok) {
      failures += 1;
    }
    console.log(`     ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  };
  const n = PACINGS.reduce((s, p) => s + p.phases.length, 0);
  console.log(`bounce-check: ${SCENARIOS.length} scenarios, each flown on ${RUN_ON} ms past its first contact at ${n} pacings and phases\n`);
  for (const sc of SCENARIOS) {
    if (only && !sc.name.toLowerCase().includes(only.toLowerCase())) {
      continue;
    }
    try {
      await runScenario(sc, check);
    } catch (e) {
      check('the scenario ran', false, e.stack || String(e));
    }
  }
  console.log(`\nbounce-check: ${failures === 0 ? 'all passed' : `${failures} FAILED`}`);
  process.exit(failures);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
