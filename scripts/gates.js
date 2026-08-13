/*
 * gates.js: the npm run gates suite for the unattended perfection loop.
 * One command, exits non-zero if any gate fails. Verifies the hash of
 * gates.config.json against .loop/gates.sha256 before anything else and
 * halts on mismatch, per the Prime Directive.
 *
 * Every gate reports pass or fail with a reason. A gate whose subject is
 * not built yet fails with "not built"; a gate the container cannot
 * measure (the named target GPU) fails with an environment reason. There
 * is no skip state, because a skip is how a failure hides.
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

import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { replayTrace } from '../tests/lib/replay.js';
import { decodeRec } from '../tests/lib/recfile.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEG = 180 / Math.PI;
const results = [];
const G = 9.80665;
const MASS = 0.65;

function report(id, pass, measured, reason = '') {
  results.push({ id, pass, measured, reason });
}

/* ---- Prime Directive hash check ---- */
async function checkHash() {
  const cfg = await readFile(join(root, 'gates.config.json'));
  const hash = createHash('sha256').update(cfg).digest('hex');
  const shaPath = join(root, '.loop/gates.sha256');
  if (!existsSync(shaPath)) {
    await writeFile(shaPath, hash + '\n');
    return JSON.parse(cfg.toString());
  }
  const stored = (await readFile(shaPath, 'utf8')).trim();
  if (stored !== hash) {
    await writeFile(join(root, '.loop/HALT'),
      `gates.config.json hash mismatch.\nstored ${stored}\nactual ${hash}\nThe thresholds file changed. Prime Directive violation. Halting.\n`);
    console.error('HALT: gates.config.json hash mismatch');
    process.exit(3);
  }
  return JSON.parse(cfg.toString());
}

async function fresh(cfgText, wasm, cellV = 4.2) {
  const sim = await loadSim(wasm);
  if (sim.init(cfgText) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(cellV);
  return sim;
}

/* Scripted flight helper on a 250 Hz RC grid, clock threaded. */
function fly(sim, segs, onStep, startMs = 0) {
  let t = startMs;
  let nextRc = startMs;
  for (const seg of segs) {
    const end = t + seg.ms;
    while (t < end) {
      while (nextRc <= t) {
        sim.input(nextRc / 1000, seg.roll ?? 0, seg.pitch ?? 0, seg.yaw ?? 0, seg.thr ?? 0);
        nextRc += 4;
      }
      sim.step(1);
      t += 1;
      if (onStep) {
        onStep(t, sim.readState().state);
      }
    }
  }
  return t;
}

/* ---- P2 reference rate curves, straight from vendor rc.c, f32 ---- */
const fr = Math.fround;
function refRates(type, x, cfg) {
  const abs = Math.abs(x);
  const p3 = (v) => fr(v * v * v);
  const p5 = (v) => fr(v * v * v * v * v);
  const constrain = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const { rcRate, srate, expo } = cfg;
  if (type === 'BETAFLIGHT') {
    let c = x;
    if (expo) {
      const e = fr(expo / 100);
      c = fr(fr(c * p3(abs) * e) + fr(c * (1 - e)));
    }
    let rr = fr(rcRate / 100);
    if (rr > 2) {
      rr = fr(rr + fr(14.54 * fr(rr - 2)));
    }
    let rate = fr(200 * rr * c);
    if (srate) {
      rate = fr(rate * fr(1 / constrain(fr(1 - fr(abs * fr(srate / 100))), 0.01, 1)));
    }
    return rate;
  }
  if (type === 'RACEFLIGHT') {
    const c = fr(fr(1 + fr(0.01 * expo * fr(x * x - 1))) * x);
    let rate = fr(10 * rcRate * c);
    rate = fr(rate * fr(1 + fr(abs * srate * 0.01)));
    return rate;
  }
  if (type === 'KISS') {
    const curve = fr(expo / 100);
    const use = fr(1 / constrain(fr(1 - fr(abs * fr(srate / 100))), 0.01, 1));
    const cmd = fr(fr(fr(p3(x) * curve) + fr(x * (1 - curve))) * fr(rcRate / 1000));
    return constrain(fr(fr(2000 * use) * cmd), -1998, 1998);
  }
  if (type === 'ACTUAL') {
    let e = fr(expo / 100);
    e = fr(abs * fr(fr(p5(x) * e) + fr(x * (1 - e))));
    const center = fr(rcRate * 10);
    const stick = Math.max(0, fr(srate * 10 - center));
    return fr(fr(x * center) + fr(stick * e));
  }
  throw new Error('unknown type');
}

async function main() {
  const cfg = await checkHash();
  const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
  const flightCfg = await readFile(join(root, 'configs/betaflight-default.diff'), 'utf8');
  const harnessCfg = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  const rec = decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs/baseline.rec'))));

  /* ---------- P1 determinism ---------- */
  {
    const opts = { configText: harnessCfg, renderHz: 60, traceStrideMs: 10 };
    const hashes = new Set();
    for (let i = 0; i < cfg.P1.determinism_runs; i += 1) {
      hashes.add(await replayTrace(await loadSim(wasm), rec, opts));
    }
    for (const hz of cfg.P1.render_rates_hz) {
      hashes.add(await replayTrace(await loadSim(wasm), rec, { ...opts, renderHz: hz }));
    }
    report('P1', hashes.size === 1,
      `${cfg.P1.determinism_runs} runs plus ${cfg.P1.render_rates_hz.length} rates, ${hashes.size} distinct hash(es)`,
      hashes.size === 1 ? '' : 'traces diverge');
  }

  /* ---------- P2 rate type parity ---------- */
  {
    const rcRate = 18;
    const srate = 67;
    const expo = 54;
    let worst = 0;
    let worstAt = '';
    let ok = true;
    for (const type of cfg.P2.rate_types) {
      const diff = harnessCfg
        .replace('set rates_type = ACTUAL', `set rates_type = ${type}`)
        .replace(/set (roll|pitch|yaw)_rc_rate = \d+/g, `set $1_rc_rate = ${rcRate}`)
        .replace(/set (roll|pitch|yaw)_srate = \d+/g, `set $1_srate = ${srate}`)
        .replace(/set (roll|pitch|yaw)_expo = \d+/g, `set $1_expo = ${expo}`)
        + '\nset rc_smoothing_mode = 0\n';
      const sim = await fresh(diff, wasm);
      const dbg = sim.e.sim_bf_debug;
      let t = 0;
      for (let k = -100; k <= 100; k += 1) {
        const x = k / 100;
        sim.input(t / 1000, x, 0, 0, 0.3);
        sim.step(2);
        t += 2;
        const got = dbg(5);
        const want = refRates(type, fr(x), { rcRate, srate, expo });
        const err = Math.abs(got - want);
        if (err > worst) {
          worst = err;
          worstAt = `${type} x=${x.toFixed(2)}`;
        }
        if (err > cfg.P2.max_abs_error_deg_s) {
          ok = false;
        }
      }
    }
    report('P2', ok, `worst |err| ${worst.toFixed(4)} deg/s at ${worstAt}`,
      ok ? '' : `exceeds ${cfg.P2.max_abs_error_deg_s}`);
  }

  /* ---------- P3 blackbox correlation ---------- */
  {
    let logs = [];
    try {
      logs = (await readdir(join(root, 'physics/reference-logs'))).filter((f) => !f.startsWith('.'));
    } catch { /* dir missing counts as empty */ }
    report('P3', false,
      `${logs.length} reference log(s) present`,
      logs.length === 0
        ? 'BLOCKER: no real blackbox logs. Required coverage: ' + cfg.P3.required_coverage.join(', ') + '. Cannot be fabricated.'
        : 'correlation harness not built');
  }

  /* ---------- P4 propulsion ---------- */
  {
    const sub = [];
    /* motor time constant, one motor, override step */
    {
      const sim = await fresh(flightCfg, wasm);
      sim.motorOverride(-1, 0);
      fly(sim, [{ ms: 300, thr: 0 }]);
      sim.motorOverride(0, 1);
      const rpm = [];
      fly(sim, [{ ms: 1500, thr: 0 }], (t, st) => rpm.push(st[14]), 300);
      const final = rpm[rpm.length - 1];
      const t63 = rpm.findIndex((v) => v >= 0.63 * final) + 1;
      const ok = t63 >= cfg.P4.motor_tau_ms[0] && t63 <= cfg.P4.motor_tau_ms[1];
      sub.push({ ok, text: `tau ${t63} ms (band ${cfg.P4.motor_tau_ms})` });
    }
    /* hover throttle */
    let trim = NaN;
    {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 20; i += 1) {
        const mid = (lo + hi) / 2;
        const sim = await fresh(flightCfg, wasm, 4.0);
        let vz = 0;
        fly(sim, [{ ms: 2000, thr: mid }], (t, st) => { vz = st[6]; });
        if (vz > 0) hi = mid; else lo = mid;
      }
      trim = (lo + hi) / 2;
      const ok = trim >= cfg.P4.hover_throttle[0] && trim <= cfg.P4.hover_throttle[1];
      sub.push({ ok, text: `hover ${(trim * 100).toFixed(1)}% (band ${cfg.P4.hover_throttle})` });
    }
    /* Static thrust to weight, bench definition: thrust at zero airspeed
     * with the pack under load. Shaft torque carries no advance ratio
     * term in this plant, so steady RPM depends only on pack voltage and
     * kt w^2 IS the bench thrust; motors driven directly through the
     * override so the controller is out of the loop, exactly like a
     * thrust stand. Two earlier methods were rejected and are recorded in
     * tried_and_rejected: RPM thrust sampled while climbing under-reads
     * through the advance factor, and peak punch acceleration measures
     * effective punch TWR net of sag and advance loss, a different
     * quantity from the one this gate names. */
    {
      const sim = await fresh(flightCfg, wasm);
      const kt = sim.e.sim_bf_debug(10);
      sim.motorOverride(-1, 1);
      let st = null;
      fly(sim, [{ ms: 400, thr: 0 }], (t, s2) => { st = s2; });
      let thrust = 0;
      for (let m = 14; m <= 17; m += 1) {
        const w = (st[m] / 60) * 2 * Math.PI;
        thrust += kt * w * w;
      }
      const twr = thrust / (MASS * G);
      const ok = twr >= cfg.P4.static_twr[0] && twr <= cfg.P4.static_twr[1];
      sub.push({ ok, text: `TWR ${twr.toFixed(1)} bench (band ${cfg.P4.static_twr})` });
    }
    /* punch: time from hover to 80 percent of peak climb rate */
    {
      const sim = await fresh(flightCfg, wasm);
      const t0 = fly(sim, [{ ms: 2000, thr: Number.isFinite(trim) ? trim : 0.2 }]);
      const vz = [];
      fly(sim, [{ ms: 5000, thr: 1 }], (t, st) => vz.push(st[6]), t0);
      const peak = Math.max(...vz);
      const t80 = vz.findIndex((v) => v >= 0.8 * peak) + 1;
      const ok = t80 >= cfg.P4.punch_to_80pct_climb_ms[0] && t80 <= cfg.P4.punch_to_80pct_climb_ms[1];
      sub.push({ ok, text: `80% climb in ${t80} ms (band ${cfg.P4.punch_to_80pct_climb_ms})` });
    }
    const pass = sub.every((s) => s.ok);
    report('P4', pass, sub.map((s) => s.text).join('; '),
      pass ? '' : sub.filter((s) => !s.ok).map((s) => s.text).join('; '));
  }

  /* ---------- P5 aerodynamics ---------- */
  {
    const sub = [];
    const simFM = await fresh(flightCfg, wasm);
    const dbg = simFM.e.sim_bf_debug;
    const fm = dbg(12);
    {
      const ok = fm >= cfg.P5.prop_figure_of_merit[0] && fm <= cfg.P5.prop_figure_of_merit[1];
      sub.push({ ok, text: `prop FM ${fm.toFixed(2)} (band ${cfg.P5.prop_figure_of_merit})` });
    }
    /* max level speed: sweep pitch stick holds, track max horizontal speed
     * among runs that do not lose net altitude */
    {
      let best = 0;
      for (const stick of [0.25, 0.35, 0.45, 0.55]) {
        const sim = await fresh(flightCfg, wasm);
        let maxH = 0;
        let z = 0;
        fly(sim, [
          { ms: 500, thr: 0.35 },
          { ms: 400, thr: 0.9, pitch: -stick },
          { ms: 9000, thr: 1, pitch: -stick * 0.4 },
        ], (t, st) => {
          const h = Math.hypot(st[4], st[5]);
          z = st[3];
          if (z > -20 && h > maxH) {
            maxH = h;
          }
        });
        if (maxH > best) {
          best = maxH;
        }
      }
      const kmh = best * 3.6;
      const ok = kmh >= cfg.P5.max_level_speed_kmh[0] && kmh <= cfg.P5.max_level_speed_kmh[1];
      sub.push({ ok, text: `max level ${kmh.toFixed(0)} km/h (band ${cfg.P5.max_level_speed_kmh})` });
    }
    /* zero to 100 km/h */
    {
      const sim = await fresh(flightCfg, wasm);
      const t0 = fly(sim, [{ ms: 1500, thr: 0.2 }]);
      let tHit = -1;
      fly(sim, [
        { ms: 350, thr: 1, pitch: -0.6 },
        { ms: 3000, thr: 1, pitch: -0.15 },
      ], (t, st) => {
        if (tHit < 0 && Math.hypot(st[4], st[5]) >= 27.78) {
          tHit = t - t0;
        }
      }, t0);
      const s = tHit / 1000;
      const ok = tHit > 0 && s >= cfg.P5.zero_to_100_kmh_s[0] && s <= cfg.P5.zero_to_100_kmh_s[1];
      sub.push({ ok, text: `0 to 100 in ${tHit > 0 ? s.toFixed(2) : 'never'} s (band ${cfg.P5.zero_to_100_kmh_s})` });
    }
    /* props level descent terminal */
    {
      const sim = await fresh(flightCfg, wasm);
      let vz = 0;
      fly(sim, [{ ms: 8000, thr: 0 }], (t, st) => { vz = st[6]; });
      const term = Math.abs(vz);
      const ok = term >= cfg.P5.descent_terminal_m_s[0] && term <= cfg.P5.descent_terminal_m_s[1];
      sub.push({ ok, text: `descent terminal ${term.toFixed(1)} m/s (band ${cfg.P5.descent_terminal_m_s})` });
    }
    const pass = sub.every((s) => s.ok);
    report('P5', pass, sub.map((s) => s.text).join('; '),
      pass ? '' : sub.filter((s) => !s.ok).map((s) => s.text).join('; '));
  }

  /* ---------- gates whose subject is not built or not measurable ---------- */
  report('P6', false, 'no collision system exists', 'not built: swept volume collision, prop strike, mesh versus pole');
  report('P7', false, 'input path polls at requestAnimationFrame rate', 'fails by design today: gamepad sampled per frame in src/main.js, not on an independent 250 Hz path; photon latency unmeasurable headless');
  report('F1', false, 'no ghost pilot exists', 'not built: scripted frozen controller and reference track');
  report('F2', false, 'no manoeuvre clip capture exists', 'not built: 144 fps clip capture and fresh instance grading');
  report('F3', false, 'partial: motor lag and rates covered by P2/P4', 'not built: propwash, sag on lap 4, AoA drag delta, gyro coupling sign, link latency, wind asserts');
  report('T1', false, 'no MultiGP obstacle library', 'not built');
  report('T2', false, 'no reference tracks', 'not built: UTT-5, UTT-3, UTT-6 from official PDFs');
  report('T3', false, 'no track spec assert', 'not built');
  report('T4', false, 'no track JSON schema', 'not built');
  report('T5', false, 'no race logic', 'not built: lap timing, gate pass by swept volume');
  report('G1', false, 'ramp and outline exist; no render spec doc, no palette check', 'not built: docs/render-spec.md and enforcement tests');
  report('G2', false, 'container runs SwiftShader software GL', `environment: cannot measure ${cfg.target_gpu}; needs a human run of the benchmark`);
  report('G3', false, 'uptilt and bloom exist', 'not built: barrel distortion, jello, exposure adaptation, motion blur, CA, feed degradation');
  report('G4', false, 'grass, clouds, treeline exist; no shared wind field with physics', 'partial: physics has no wind, so the field cannot be shared');
  report('G5', false, 'no frame capture pipeline in artifacts/frames', 'not built');

  /* ---------- output ---------- */
  const wide = Math.max(...results.map((r) => r.measured.length));
  console.log('GATE  RESULT  MEASURED' + ' '.repeat(Math.max(1, wide - 8)) + '  REASON');
  for (const r of results) {
    console.log(
      `${r.id.padEnd(5)} ${r.pass ? 'pass' : 'FAIL'}    ${r.measured.padEnd(wide)}  ${r.reason}`,
    );
  }
  const failing = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failing.length} of ${results.length} gates passing`);

  /* update state */
  const statePath = join(root, '.loop/state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.gates = Object.fromEntries(results.map((r) => [r.id, r.pass ? 'pass' : 'fail']));
  state.last_run = { failing: failing.map((r) => ({ id: r.id, reason: r.reason || r.measured })) };
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n');
  process.exit(failing.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error('gates: fatal:', e.stack ?? e);
  process.exit(2);
});
