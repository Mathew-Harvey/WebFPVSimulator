/*
 * flight-report.js: fly a set of standard manoeuvres headlessly and print
 * the numbers a pilot judges a simulator by. This is the evidence the
 * review loop in scripts/judge-loop.md hands to its reviewers, and it is
 * useful on its own after any tuning change.
 *
 * Usage: node scripts/flight-report.js [config.diff]
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
import { loadSim, SIM_OK } from '../tests/lib/simmod.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEG = 180 / Math.PI;
const RC_HZ = 250;

const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const cfgPath = process.argv[2] ?? join(root, 'configs/freestyle.diff');
const cfgText = await readFile(cfgPath, 'utf8');

async function fresh(cell = 4.2) {
  const sim = await loadSim(wasm);
  if (sim.init(cfgText) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(cell);
  return sim;
}

/*
 * Fly a stick program. segs is a list of { ms, roll, pitch, yaw, thr },
 * values held across the segment. Input is delivered on a 250 Hz RC grid
 * exactly as the shell does, so the controller sees realistic frames.
 */
function fly(sim, segs, onStep, startMs = 0) {
  /* startMs must be threaded through consecutive calls on the same sim:
   * sim_input rejects a timestamp older than the last one, so restarting
   * the clock here silently drops every sample and the craft keeps flying
   * the previous segment's sticks. */
  let t = startMs;
  let nextRc = startMs;
  for (const seg of segs) {
    const end = t + seg.ms;
    while (t < end) {
      while (nextRc <= t) {
        sim.input(nextRc / 1000, seg.roll ?? 0, seg.pitch ?? 0, seg.yaw ?? 0, seg.thr ?? 0);
        nextRc += 1000 / RC_HZ;
      }
      sim.step(1);
      t += 1;
      if (onStep) {
        onStep(t, sim.readState().state, seg);
      }
    }
  }
  return t;
}

function stats(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { mean, max: Math.max(...arr), min: Math.min(...arr) };
}

const out = [];
const say = (s) => out.push(s);

say(`FLIGHT REPORT  config=${cfgPath.split('/').pop()}`);
say('');

/* 1. Hover trim and hold. */
{
  const sim = await fresh(4.0);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i += 1) {
    const mid = (lo + hi) / 2;
    const s2 = await fresh(4.0);
    let vz = 0;
    fly(s2, [{ ms: 2000, thr: mid }], (t, st) => { vz = st[6]; });
    if (vz > 0) hi = mid; else lo = mid;
  }
  const trim = (lo + hi) / 2;
  let drift = 0;
  let rpm = 0;
  fly(sim, [{ ms: 4000, thr: trim }], (t, st) => {
    drift = Math.hypot(st[1], st[2]);
    rpm = st[14];
  });
  say(`hover: throttle ${(trim * 100).toFixed(1)}%  rpm ${rpm.toFixed(0)}  lateral drift over 4 s ${drift.toFixed(3)} m`);
}

/* 2. Roll rate step: crispness, overshoot, stick release behaviour. */
for (const axis of ['roll', 'pitch', 'yaw']) {
  const sim = await fresh();
  const trace = [];
  const idx = axis === 'roll' ? 11 : axis === 'pitch' ? 12 : 13;
  const stick = (v) => ({ [axis]: v, thr: 0.4, ms: 0 });
  /* 60 ms thumb ramp in, 900 ms hold, 60 ms ramp out, 400 ms watch */
  const segs = [];
  for (let i = 0; i <= 12; i += 1) segs.push({ ...stick(i / 12), ms: 5 });
  segs.push({ ...stick(1), ms: 900 });
  for (let i = 12; i >= 0; i -= 1) segs.push({ ...stick(i / 12), ms: 5 });
  segs.push({ ...stick(0), ms: 400 });
  const hold = [];
  const after = [];
  let tHold = 0;
  fly(sim, segs, (t, st, seg) => {
    /* Keep the sign: pitch and yaw run negative for a positive stick in
     * this frame, and an unsigned metric reports the normal return to
     * centre as a huge reversal. */
    const v = st[idx] * DEG;
    trace.push(Math.abs(v));
    if (seg.ms === 900) { hold.push(v); tHold = t; }
    if (tHold > 0 && t > tHold) after.push(v);
  });
  const steady = hold.slice(-200);
  const sMean = Math.abs(stats(steady).mean);
  const dir = Math.sign(stats(steady).mean) || 1;
  const peak = Math.max(...hold.map((v) => v * dir));
  const rel = after.slice(60);
  /* Reversal: how far past zero it swings the other way after release. */
  const reversal = rel.length ? Math.max(0, ...rel.map((v) => -v * dir)) : 0;
  say(
    `${axis} step: steady ${sMean.toFixed(0)} deg/s  overshoot ${(100 * (peak / sMean - 1)).toFixed(1)}%  ` +
    `rise90 ${trace.findIndex((v) => v >= 0.9 * sMean)} ms  reverse after release ${Math.max(0, reversal).toFixed(0)} deg/s`,
  );
}

/* 3. Punch out and top speed in forward flight. */
{
  const sim = await fresh();
  let z0 = 0;
  let peak = 0;
  const tp = fly(sim, [{ ms: 1500, thr: 0.26 }], (t, st) => { z0 = st[3]; });
  fly(sim, [{ ms: 3000, thr: 1 }], (t, st) => { peak = st[3]; }, tp);
  say(`punch: ${(peak - z0).toFixed(1)} m gained in 3 s from hover`);
}
{
  const sim = await fresh();
  let sp = 0;
  let pitchDeg = 0;
  fly(sim, [{ ms: 12000, thr: 0.75, pitch: -0.55 }], (t, st) => {
    sp = Math.hypot(st[4], st[5], st[6]);
    /* body x axis elevation, i.e. how nose down the craft is */
    const w = st[7], x = st[8], y = st[9], z = st[10];
    pitchDeg = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))) * DEG;
  });
  say(`forward flight: 55% pitch stick at 75% throttle for 12 s -> ${sp.toFixed(1)} m/s, attitude ${pitchDeg.toFixed(0)} deg`);
}

/* 4. Battery behaviour over a hard flight. */
{
  const sim = await fresh(4.2);
  let vmin = 99;
  let amax = 0;
  fly(sim, [{ ms: 1000, thr: 0.3 }, { ms: 1500, thr: 1 }, { ms: 800, thr: 0.2 }, { ms: 1500, thr: 1 }],
    (t, st) => { vmin = Math.min(vmin, st[18]); amax = Math.max(amax, st[19]); });
  say(`battery: min pack ${vmin.toFixed(1)} V, peak draw ${amax.toFixed(0)} A on repeated punches from 4.20 V/cell`);
}

/* 5. Propwash proxy: how much the craft is disturbed descending in a
 * hard vertical drop, and how long it takes to settle. */
{
  const sim = await fresh();
  let wobble = 0;
  fly(sim, [{ ms: 1200, thr: 0.28 }, { ms: 1500, thr: 0.05 }, { ms: 1200, thr: 0.55 }],
    (t, st) => { wobble = Math.max(wobble, Math.hypot(st[11], st[12]) * DEG); });
  say(`descent and catch: peak body rate disturbance ${wobble.toFixed(0)} deg/s`);
}

/* 6. Control authority headroom while loaded. */
{
  const sim = await fresh();
  let minRpm = 1e9;
  let maxRpm = 0;
  fly(sim, [{ ms: 800, thr: 0.55, roll: 1 }], (t, st) => {
    for (let m = 14; m <= 17; m += 1) {
      minRpm = Math.min(minRpm, st[m]);
      maxRpm = Math.max(maxRpm, st[m]);
    }
  });
  say(`authority: full roll at 55% throttle spreads motors ${minRpm.toFixed(0)} to ${maxRpm.toFixed(0)} rpm`);
}

console.log(out.join('\n'));
