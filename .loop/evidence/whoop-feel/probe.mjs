/*
 * probe.mjs: how far the shipped whoop is from a real one, measured in the
 * units the pilot sees.
 *
 * The shell's whoop flies the five inch's plant in a room built MICRO_SCALE
 * times life size. The honest 65 mm plant, SIM_AIRFRAME_WHOOP65, is still
 * compiled and nothing selects it. This flies both through the same
 * manoeuvres and divides every length by the room's factor, so a number here
 * is what the picture does. Time is never scaled.
 *
 *   W  the honest whoop plant on its own stock tune, gravity 1.0, in a
 *      life size room. The reference: the plant the literature derived.
 *   F  the whoop as shipped: plant 0, betaflight-default, gravity 1.62, in
 *      the MICRO_SCALE room. Runtime knob variants of it are labelled F too.
 *   S  plant 0 with a whoop's pace: mass times k, the row's own gravity
 *      divided by k, optionally inertia, ground effect and duct lip. These
 *      need a module built with scratch-variant.patch applied, which adds an
 *      exported `scratch_variant` and airframe id 2. Not for shipping: it is
 *      the measuring rig for WHOOP-FEEL-PLAN.md.
 *
 * Run from the repository root:
 *
 *   node .loop/evidence/whoop-feel/probe.mjs
 *   node .loop/evidence/whoop-feel/probe.mjs --scratch=path/to/scratch/sim.wasm
 *
 * THE STICK GRID IS ONE GRID. The first version of this probe restarted the
 * 250 Hz input grid at every change of manoeuvre, so the sample that changed
 * the stick landed 1 ms after the one before it instead of 4. Betaflight's
 * feedforward reads that as a stick moving four times faster than it did,
 * and a levelling craft pitched 10 degrees PAST level and braked on it. The
 * carry figures came out non monotonic in k, which is how it was caught. The
 * shell keeps one continuous grid, and so does this now: `sim._rc` carries it
 * across every call. scripts/whoop-gates.js restarts its grid at `startMs` on
 * the same pattern; its manoeuvre joins are throttle only, which feedforward
 * does not read, but anti gravity and throttle boost do.
 *
 * What it found, on 2026-09-23, is written up in WHOOP-FEEL-PLAN.md and the
 * raw rows are results-2026-09-23.jsonl beside this file.
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
import { loadSim, SIM_OK } from '../../../tests/lib/simmod.js';
import { ST } from '../../../tests/lib/replay.js';
import { MICRO_SCALE } from '../../../configs/airframes.js';

const G0 = 9.80665;
const RAD = Math.PI / 180;
const RPM = 60 / (2 * Math.PI);

const scratchArg = process.argv.find((a) => a.startsWith('--scratch='));
const WASM = {
  shipped: new Uint8Array(await readFile('dist/sim.wasm')),
  scratch: scratchArg ? new Uint8Array(await readFile(scratchArg.slice(10))) : null,
};
const DIFF = {
  five: await readFile('configs/betaflight-default.diff', 'utf8'),
  whoop: await readFile('configs/whoop-champion.diff', 'utf8'),
};

async function make(c) {
  const sim = await loadSim(WASM[c.wasm ?? 'shipped']);
  if (c.variant) {
    sim.e.scratch_variant(...c.variant);
  }
  if (c.af !== 0 && sim.e.sim_set_airframe(c.af) !== SIM_OK) {
    throw new Error(`sim_set_airframe(${c.af})`);
  }
  if (sim.e.sim_set_gravity(c.g) !== SIM_OK || sim.e.sim_set_air(c.air ?? 1) !== SIM_OK) {
    throw new Error('gravity or air out of band');
  }
  if (sim.init(DIFF[c.diff]) !== SIM_OK) {
    throw new Error('sim_init');
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  return sim;
}

/* One continuous 250 Hz grid per sim, whatever the caller does. */
function flyCtl(sim, ms, ctl, onStep, t0 = 0) {
  let t = t0;
  let rc = sim._rc ?? t0;
  let s = sim.readState().state;
  const end = t + ms;
  while (t < end) {
    while (rc <= t) {
      const st = ctl(t, s);
      sim.input(rc / 1000, st.roll ?? 0, st.pitch ?? 0, st.yaw ?? 0, st.thr ?? 0);
      rc += 4;
    }
    sim.step(1);
    t += 1;
    sim._rc = rc;
    s = sim.readState().state;
    if (onStep && onStep(t, s) === false) {
      return t;
    }
  }
  return t;
}
const fly = (sim, ms, st, onStep, t0) => flyCtl(sim, ms, () => st, onStep, t0);
const hspeed = (s) => Math.hypot(s[ST.VX], s[ST.VY]);

async function hoverOf(c) {
  let lo = 0;
  let hi = 1;
  let best = 0.5;
  for (let i = 0; i < 26; i += 1) {
    const mid = 0.5 * (lo + hi);
    const sim = await make(c);
    let vz = 0;
    fly(sim, 2000, { thr: mid }, (t, s) => { vz = s[ST.VZ]; });
    best = mid;
    if (vz > 0) hi = mid; else lo = mid;
    if (Math.abs(vz) < 0.005) break;
  }
  return best;
}

/* Accelerate forward in angle mode, holding height, to 4 m/s of picture. */
function runUp(sim, c, hov, t) {
  const zRef = sim.readState().state[ST.PZ];
  return flyCtl(sim, 8000, (tt, s) => ({
    pitch: -0.55,
    thr: Math.min(1, Math.max(0, hov * 1.25 + 0.08 * (zRef - s[ST.PZ]) - 0.05 * s[ST.VZ])),
  }), (tt, s) => (hspeed(s) >= 4.0 * c.lambda ? false : undefined), t);
}

async function pace(c) {
  const L = c.lambda;
  const k = c.variant ? c.variant[0] : 1;
  const out = { name: c.name };
  const hov = await hoverOf(c);
  out.hover = hov;
  /* The row's own gravity is G0 / k, so the picture's g is g / (k L). */
  out.gApp = c.g / (k * L);

  {
    const sim = await make(c);
    const t = fly(sim, 2000, { thr: hov });
    let wMax = 0;
    let vSum = 0;
    let n = 0;
    fly(sim, 2000, { thr: 1 }, (tt, s) => {
      const w = 0.25 * (s[ST.RPM0] + s[ST.RPM1] + s[ST.RPM2] + s[ST.RPM3]) / RPM;
      if (w > wMax) wMax = w;
      if (tt - t > 1500) { vSum += s[ST.VBAT]; n += 1; }
    }, t);
    const kt = sim.e.sim_bf_debug(10);
    const m = sim.e.sim_bf_debug(51);
    const duct = sim.e.sim_bf_debug(58) || 1;
    const cells = sim.e.sim_bf_debug(54);
    out.tw = (4 * kt * wMax * wMax * duct) / (m * (G0 / k) * c.g);
    out.sag = 1 - (vSum / n) / (4.2 * cells);
  }

  /* Chop from a hover: time to fall 2 m and 4 m of picture, and terminal. */
  {
    const sim = await make(c);
    const t = fly(sim, 2000, { thr: hov });
    const z0 = sim.readState().state[ST.PZ];
    let vz = 0;
    fly(sim, 15000, { thr: 0 }, (tt, s) => {
      const dz = (z0 - s[ST.PZ]) / L;
      if (out.fall2 == null && dz >= 2) out.fall2 = (tt - t) / 1000;
      if (out.fall4 == null && dz >= 4) out.fall4 = (tt - t) / 1000;
      vz = s[ST.VZ];
    }, t);
    out.terminal = Math.abs(vz) / L;
  }

  /* Half a second of full throttle from a hover, then idle: height, balloon. */
  {
    const sim = await make(c);
    let t = fly(sim, 2000, { thr: hov });
    const z0 = sim.readState().state[ST.PZ];
    let z = z0;
    t = fly(sim, 500, { thr: 1 }, (tt, s) => { z = s[ST.PZ]; }, t);
    out.punchH = (z - z0) / L;
    let zMax = z;
    fly(sim, 3000, { thr: 0 }, (tt, s) => { if (s[ST.PZ] > zMax) zMax = s[ST.PZ]; }, t);
    out.balloon = (zMax - z) / L;
  }

  /* Five percent of stick over the hover: climb speed after a second. */
  {
    const sim = await make(c);
    const t = fly(sim, 2000, { thr: hov });
    let vz = 0;
    fly(sim, 1000, { thr: hov + 0.05 }, (tt, s) => { vz = s[ST.VZ]; }, t);
    out.plus5 = vz / L;
  }

  /*
   * Carry: level the sticks at the hover throttle from 4 m/s of picture and
   * time the horizontal speed from its peak to half and to a quarter. Angle
   * mode, so levelling is the controller's job and the same on every row.
   */
  {
    const sim = await make(c);
    sim.setAngleMode(1);
    let t = fly(sim, 1500, { thr: hov });
    t = runUp(sim, c, hov, t);
    let vPeak = 0;
    let tPeak = t;
    let xP = 0;
    let yP = 0;
    let falling = false;
    fly(sim, 9000, { thr: hov, pitch: 0 }, (tt, s) => {
      const v = hspeed(s);
      if (!falling) {
        if (v >= vPeak) { vPeak = v; tPeak = tt; xP = s[ST.PX]; yP = s[ST.PY]; return undefined; }
        if (v < 0.97 * vPeak) falling = true; else return undefined;
      }
      const d = Math.hypot(s[ST.PX] - xP, s[ST.PY] - yP) / L;
      if (out.halfT == null && v <= 0.5 * vPeak) { out.halfT = (tt - tPeak) / 1000; out.halfD = d; }
      if (v <= 0.25 * vPeak) { out.quarterT = (tt - tPeak) / 1000; out.quarterD = d; return false; }
      return undefined;
    }, t);
  }

  /* Brake: full pitch back from 4 m/s of picture, holding height. */
  {
    const sim = await make(c);
    sim.setAngleMode(1);
    let t = fly(sim, 1500, { thr: hov });
    t = runUp(sim, c, hov, t);
    const s0 = sim.readState().state;
    flyCtl(sim, 6000, (tt, s) => ({
      pitch: 1.0,
      thr: Math.min(1, Math.max(0, hov + 0.08 * (s0[ST.PZ] - s[ST.PZ]) - 0.05 * s[ST.VZ])),
    }), (tt, s) => {
      if (hspeed(s) <= 0.4 * L) {
        out.brakeT = (tt - t) / 1000;
        out.brakeD = Math.hypot(s[ST.PX] - s0[ST.PX], s[ST.PY] - s0[ST.PY]) / L;
        return false;
      }
      return undefined;
    }, t);
  }

  /* Flat out: angle mode, full forward, full throttle. */
  {
    const sim = await make(c);
    sim.setAngleMode(1);
    let v = 0;
    fly(sim, 12000, { pitch: -1, thr: 1 }, (t, s) => { v = Math.hypot(s[ST.VX], s[ST.VY], s[ST.VZ]); });
    out.top = v / L;
  }

  /* Full stick roll and yaw steps from a hover: rise to 90 percent. */
  for (const [axis, idx, tap] of [['roll', ST.P, 5], ['yaw', ST.R, 0]]) {
    const sim = await make(c);
    const t = fly(sim, 1500, { thr: hov });
    fly(sim, 600, { [axis]: 1, thr: hov }, (tt, s) => {
      const sp = Math.abs(sim.e.sim_bf_debug(tap));
      if (out[`${axis}Rise`] == null && sp > 1 && Math.abs(s[idx]) / RAD >= 0.9 * sp) {
        out[`${axis}Rise`] = tt - t;
      }
    }, t);
  }
  return out;
}

async function handling(c) {
  const L = c.lambda;
  const out = { name: c.name };
  const hov = await hoverOf(c);
  /* Quarter and full stick steps, 400 ms, then centre: setpoint, peak,
   * overshoot, and the reversal after centring. */
  for (const [axis, idx, tap] of [['roll', ST.P, 5], ['yaw', ST.R, 0]]) {
    for (const mag of [0.25, 1.0]) {
      const sim = await make(c);
      let t = fly(sim, 1500, { thr: hov });
      let peak = 0;
      let sp = 0;
      let rev = 0;
      t = fly(sim, 400, { [axis]: mag, thr: hov }, (tt, s) => {
        sp = Math.abs(sim.e.sim_bf_debug(tap));
        peak = Math.max(peak, Math.abs(s[idx]) / RAD);
      }, t);
      const sign = Math.sign(sim.readState().state[idx]);
      fly(sim, 400, { thr: hov }, (tt, s) => { rev = Math.max(rev, -sign * s[idx] / RAD); }, t);
      out[`${axis}${mag}`] = `${sp.toFixed(0)}/${peak.toFixed(0)} ${(100 * (peak / sp - 1)).toFixed(0)}% rev ${rev.toFixed(0)}`;
    }
  }
  {
    const sim = await make(c);
    const t = fly(sim, 2000, { thr: hov });
    let ss = 0;
    let n = 0;
    fly(sim, 2000, { thr: hov }, (tt, s) => { const p = s[ST.P] / RAD; ss += p * p; n += 1; }, t);
    out.hoverRollRms = Math.sqrt(ss / n);
  }
  /* Ground effect: hold the CG 2, 4 and 8 cm of picture over a floor with a
   * height loop on the throttle; the mean stick over its last 0.8 s, as a
   * fraction of the free air hover. The loop leaves about half a percent of
   * offset, so compare rows, not absolutes. */
  for (const hApp of [0.02, 0.04, 0.08]) {
    const sim = await make(c);
    sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, -(hApp * L), 1.4, 0.0);
    let integ = 0;
    let sum = 0;
    let n = 0;
    flyCtl(sim, 3000, (tt, s) => {
      const err = 0 - s[ST.PZ];
      integ += err * 0.004;
      const thr = Math.min(1, Math.max(0, hov + 2.0 * err / L - 0.3 * s[ST.VZ] / L + 2.0 * integ / L));
      if (tt > 2200) { sum += thr; n += 1; }
      return { thr };
    });
    out[`ige${Math.round(hApp * 100)}cm`] = sum / n / hov;
  }
  /* Nose up at pace: a level pass near 4 m/s of picture, the plant's own
   * nose up couple tap over full pitch authority. The speed loop is slow and
   * the passes land between 3 and 4.3 m/s, so this is a rough comparison. */
  {
    const sim = await make(c);
    sim.setAngleMode(1);
    const t = fly(sim, 1500, { thr: hov });
    const z0 = sim.readState().state[ST.PZ];
    let pitchCmd = -0.3;
    flyCtl(sim, 10000, (tt, s) => {
      pitchCmd = Math.max(-1, Math.min(0, pitchCmd + 0.00008 * (hspeed(s) - 4.0 * L)));
      return { pitch: pitchCmd, thr: Math.min(1, Math.max(0, hov * 1.2 + 0.2 * (z0 - s[ST.PZ]) / L - 0.1 * s[ST.VZ] / L)) };
    }, null, t);
    const s = sim.readState().state;
    const kt = sim.e.sim_bf_debug(10);
    const arm = sim.e.sim_bf_debug(53);
    const duct = sim.e.sim_bf_debug(58) || 1;
    out.passSpeed = hspeed(s) / L;
    out.noseUpPct = 100 * sim.e.sim_bf_debug(70) / (4 * kt * c.wmax * c.wmax * duct * arm);
  }
  return out;
}

const L5 = MICRO_SCALE;
/* scratch_variant argument order, and the identity row. */
const KEYS = { m: 0, i: 1, ground: 2, rcell: 3, lip: 4, fade: 5, duct: 6, rdrag: 7, wash: 8 };
const V = (o) => {
  const v = [1, 1, 0, 1, 0, 0, 1, 1, -1];
  for (const [key, x] of Object.entries(o)) v[KEYS[key]] = x;
  return v;
};
const W = { name: 'W  honest whoop, 1x room', af: 1, diff: 'whoop', g: 1.0, lambda: 1, wmax: 8179 };
const F = (name, g, air) => ({ name, af: 0, diff: 'five', g, air, lambda: L5, wmax: 2723 });
const S = (name, o, air = 1) => ({
  name, af: 2, wasm: 'scratch', variant: V(o), diff: 'five', g: 1.62, air, lambda: L5, wmax: 2723,
});

const PACE = [
  W,
  F('F  shipped whoop', 1.62, 1.0),
  F('F  air 1.5', 1.62, 1.5),
  F('F  g 1.785', 1.785, 1.0),
  S('S  k 0.85', { m: 0.85 }),
  S('S  k 0.70', { m: 0.70 }),
  S('S  k 0.62', { m: 0.62 }),
  S('S  k 0.55', { m: 0.55 }),
  S('S  k 0.47 (froude g)', { m: 0.4723 }),
  S('S  k 0.47 air 0.75', { m: 0.4723 }, 0.75),
  S('S  k 0.70 inertia 0.70', { m: 0.70, i: 0.70 }),
  S('S  k 0.62 inertia 0.60', { m: 0.62, i: 0.60 }),
  S('S  k 0.70 inertia 0.50', { m: 0.70, i: 0.50 }),
  S('S  k 0.70 r_cell x4', { m: 0.70, rcell: 4 }),
];
const HANDLING = [
  W,
  F('F  shipped whoop', 1.62, 1.0),
  S('S  k 0.70 inertia 0.85', { m: 0.70, i: 0.85 }),
  S('S  k 0.70 inertia 0.70', { m: 0.70, i: 0.70 }),
  S('S  k 0.70 inertia 0.50', { m: 0.70, i: 0.50 }),
  S('S  k 0.62 inertia 0.60', { m: 0.62, i: 0.60 }),
  S('S  k 0.70 ground 1', { m: 0.70, ground: 1.0 }),
  S('S  k 0.70 ground 0.7', { m: 0.70, ground: 0.7 }),
  S('S  k 0.70 lip 0.05', { m: 0.70, lip: 0.05 }),
];

for (const c of PACE) {
  if (c.wasm === 'scratch' && !WASM.scratch) continue;
  console.log(JSON.stringify({ table: 'pace', ...(await pace(c)) }));
}
for (const c of HANDLING) {
  if (c.wasm === 'scratch' && !WASM.scratch) continue;
  console.log(JSON.stringify({ table: 'handling', ...(await handling(c)) }));
}
