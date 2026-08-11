/*
 * checks.js: the 13 Stage 1 verification checks from STAGE1.md, one entry
 * each. Every numeric band and method constant comes from
 * tests/thresholds.json; nothing numeric is hardcoded here. Node only.
 *
 * Each check returns { measured, pass, reason }. A SimError thrown while
 * driving the module is caught by the runner and reported as a FAIL with
 * the sim's error name, which is how the Loop A stub reports every check
 * as NOT_IMPLEMENTED without a single crash or skip.
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

import { SIM_OK, simErrorName } from './simmod.js';
import { SimError, must, replayTrace, runScript, ST } from './replay.js';

const DEG = 180 / Math.PI; // measurement display only, never in the physics path

function short(hash) {
  return hash ? hash.slice(0, 12) : 'none';
}

export function parseRollSrate(diffText) {
  const m = diffText.match(/^set roll_srate = (\d+)\s*$/m);
  if (!m) {
    throw new Error('fixture diff has no "set roll_srate" line');
  }
  return Number(m[1]);
}

/*
 * Bisect throttle to steady hover: judged by vertical velocity after
 * settle_s of constant throttle from rest. More throttle climbs, less
 * sinks, so vz is monotonic in throttle and bisection is sound.
 */
function trimHover(sim, cellVoltage, th5) {
  const settleMs = Math.round(th5.settle_s.value * 1000);
  const tol = th5.vz_tolerance_m_s.value;
  const evalVz = (throttle) => {
    must(sim.reset(), 'sim_reset');
    must(sim.setCellVoltage(cellVoltage), 'sim_set_cell_voltage');
    let vz = NaN;
    runScript(sim, [{ durMs: settleMs, throttle }], (tMs, state) => {
      vz = state[ST.VZ];
    });
    return vz;
  };
  if (evalVz(1) < 0 || evalVz(0) > 0) {
    return NaN;
  }
  let lo = 0;
  let hi = 1;
  let mid = 0.5;
  for (let i = 0; i < th5.max_bisection_steps.value; i += 1) {
    mid = (lo + hi) / 2;
    const vz = evalVz(mid);
    if (Math.abs(vz) <= tol) {
      return mid;
    }
    if (vz > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return mid;
}

/*
 * The check 6 punch-out procedure, shared with check 11: settle at hover
 * throttle, then full throttle. Returns altitude gained over the punch and
 * the peak motor RPM seen during it.
 */
function punchOut(sim, cellVoltage, hoverThrottle, settleS, punchS) {
  must(sim.reset(), 'sim_reset');
  must(sim.setCellVoltage(cellVoltage), 'sim_set_cell_voltage');
  const settleMs = Math.round(settleS * 1000);
  const punchMs = Math.round(punchS * 1000);
  let z0 = NaN;
  let z1 = NaN;
  let peakRpm = 0;
  const tSettled = runScript(
    sim,
    [{ durMs: settleMs, throttle: hoverThrottle }],
    (tMs, state) => {
      z0 = state[ST.PZ];
    },
  );
  runScript(
    sim,
    [{ durMs: punchMs, throttle: 1 }],
    (tMs, state) => {
      z1 = state[ST.PZ];
      for (const i of [ST.RPM0, ST.RPM1, ST.RPM2, ST.RPM3]) {
        if (state[i] > peakRpm) {
          peakRpm = state[i];
        }
      }
    },
    tSettled,
  );
  return { gain: z1 - z0, peakRpm };
}

/*
 * The check 9 procedure, shared with check 12: constant throttle, full
 * right roll, mean |p| over the final steady window, in deg/s.
 */
function steadyRollRate(sim, cellVoltage, throttle, holdS, windowS) {
  must(sim.reset(), 'sim_reset');
  must(sim.setCellVoltage(cellVoltage), 'sim_set_cell_voltage');
  const holdMs = Math.round(holdS * 1000);
  const windowMs = Math.round(windowS * 1000);
  let sum = 0;
  let n = 0;
  runScript(sim, [{ durMs: holdMs, throttle, roll: 1 }], (tMs, state) => {
    if (tMs > holdMs - windowMs) {
      sum += Math.abs(state[ST.P]);
      n += 1;
    }
  });
  return (sum / n) * DEG;
}

export function buildChecks() {
  return [
    {
      num: 1,
      id: 'build-clean',
      thresholdText: 'exit 0, vendor diff empty, init OK',
      async run(ctx) {
        const th = ctx.th.checks['build-clean'];
        const parts = [];
        let pass = true;
        let reason = '';
        parts.push(`build exit ${ctx.build.exitCode}`);
        if (ctx.build.exitCode !== th.build_exit_code.value) {
          pass = false;
          reason = `build:wasm exited ${ctx.build.exitCode}`;
        }
        const diffChars = ctx.build.vendorDiff.length;
        parts.push(diffChars === th.vendor_diff_chars.value ? 'vendor diff empty' : 'vendor diff DIRTY');
        if (pass && diffChars !== th.vendor_diff_chars.value) {
          pass = false;
          reason = 'vendor/betaflight modified in place';
        }
        if (pass) {
          const sim = await ctx.freshSim();
          const v = sim.abiVersion();
          parts.push(`abi ${v}`);
          if (v !== th.abi_version.value) {
            pass = false;
            reason = `abi version ${v}, expected ${th.abi_version.value}`;
          } else {
            const code = sim.init(ctx.configA);
            parts.push(`init ${simErrorName(code)}`);
            if (code !== SIM_OK) {
              pass = false;
              reason = simErrorName(code);
            }
          }
        }
        return { measured: parts.join(', '), pass, reason };
      },
    },
    {
      num: 2,
      id: 'determinism-repeat',
      thresholdText: 'two in-process replay hashes identical',
      async run(ctx) {
        const a = await replayTrace(await ctx.freshSim(), ctx.rec, ctx.canonicalOpts());
        const b = await replayTrace(await ctx.freshSim(), ctx.rec, ctx.canonicalOpts());
        return {
          measured: `a=${short(a)} b=${short(b)}`,
          pass: a === b,
          reason: a === b ? '' : 'hashes differ',
        };
      },
    },
    {
      num: 3,
      id: 'determinism-cross-host',
      thresholdText: 'Node and headless Chrome hashes identical',
      async run(ctx) {
        const node = await ctx.nodeCanonicalHash();
        const browser = await ctx.browserRun();
        if (!browser.result || !browser.result.ok) {
          const name = browser.result?.errorName ?? 'no result';
          return {
            measured: `node=${short(node)} chrome=${name}`,
            pass: false,
            reason: name,
          };
        }
        const same = node === browser.result.hash;
        return {
          measured: `node=${short(node)} chrome=${short(browser.result.hash)}`,
          pass: same,
          reason: same ? '' : 'hashes differ',
        };
      },
    },
    {
      num: 4,
      id: 'frame-independence',
      thresholdText: 'traces at 30, 60, 144, 240 Hz identical',
      async run(ctx) {
        const th = ctx.th.checks['frame-independence'];
        const hashes = [];
        for (const hz of th.render_rates_hz.value) {
          hashes.push(
            await replayTrace(await ctx.freshSim(), ctx.rec, {
              ...ctx.canonicalOpts(),
              renderHz: hz,
            }),
          );
        }
        const distinct = new Set(hashes).size;
        return {
          measured: `${distinct} distinct hash(es) across ${hashes.length} rates`,
          pass: distinct === th.distinct_hashes.value,
          reason: distinct === th.distinct_hashes.value ? '' : 'traces differ across render rates',
        };
      },
    },
    {
      num: 5,
      id: 'hover-throttle',
      thresholdText: '0.20 to 0.30',
      async run(ctx) {
        const th = ctx.th.checks['hover-throttle'];
        const sim = await ctx.freshSim();
        must(sim.init(ctx.configA), 'sim_init');
        const trim = trimHover(sim, th.cell_voltage.value, th);
        if (Number.isNaN(trim)) {
          return { measured: 'no trim found in 0..1', pass: false, reason: 'hover not reachable' };
        }
        const pass = trim >= th.band.min && trim <= th.band.max;
        return {
          measured: trim.toFixed(4),
          pass,
          reason: pass ? '' : 'outside band',
        };
      },
    },
    {
      num: 6,
      id: 'punch-out',
      thresholdText: '55 to 85 m',
      async run(ctx) {
        const th = ctx.th.checks['punch-out'];
        const th5 = ctx.th.checks['hover-throttle'];
        const sim = await ctx.freshSim();
        must(sim.init(ctx.configA), 'sim_init');
        const trim = trimHover(sim, th.cell_voltage.value, th5);
        if (Number.isNaN(trim)) {
          return { measured: 'no hover trim', pass: false, reason: 'hover not reachable' };
        }
        const { gain } = punchOut(
          sim,
          th.cell_voltage.value,
          trim,
          th.hover_settle_s.value,
          th.full_throttle_s.value,
        );
        const pass = gain >= th.band_m.min && gain <= th.band_m.max;
        return { measured: `${gain.toFixed(1)} m`, pass, reason: pass ? '' : 'outside band' };
      },
    },
    {
      num: 7,
      id: 'terminal-velocity',
      thresholdText: '30 to 40 m/s',
      async run(ctx) {
        const th = ctx.th.checks['terminal-velocity'];
        const sim = await ctx.freshSim();
        must(sim.init(ctx.configA), 'sim_init');
        must(sim.reset(), 'sim_reset');
        must(sim.setCellVoltage(th.cell_voltage.value), 'sim_set_cell_voltage');
        const durMs = Math.round(th.duration_s.value * 1000);
        const windowMs = Math.round(th.plateau_window_s.value * 1000);
        let sum = 0;
        let n = 0;
        runScript(sim, [{ durMs, throttle: 1 }], (tMs, state) => {
          if (tMs > durMs - windowMs) {
            const vx = state[ST.VX];
            const vy = state[ST.VY];
            const vz = state[ST.VZ];
            sum += Math.sqrt(vx * vx + vy * vy + vz * vz);
            n += 1;
          }
        });
        const speed = sum / n;
        const pass = speed >= th.band_m_s.min && speed <= th.band_m_s.max;
        return { measured: `${speed.toFixed(1)} m/s`, pass, reason: pass ? '' : 'outside band' };
      },
    },
    {
      num: 8,
      id: 'motor-step-response',
      thresholdText: '10 to 30 ms',
      async run(ctx) {
        const th = ctx.th.checks['motor-step-response'];
        const sim = await ctx.freshSim();
        must(sim.init(ctx.configA), 'sim_init');
        must(sim.reset(), 'sim_reset');
        must(sim.setCellVoltage(th.cell_voltage.value), 'sim_set_cell_voltage');
        must(sim.motorOverride(-1, 0), 'sim_motor_override');
        const preMs = Math.round(th.pre_hold_s.value * 1000);
        const settleMs = Math.round(th.settle_s.value * 1000);
        const tPre = runScript(sim, [{ durMs: preMs, throttle: 0 }], null);
        must(sim.motorOverride(0, 1), 'sim_motor_override');
        const rpmByMs = [];
        runScript(
          sim,
          [{ durMs: settleMs, throttle: 0 }],
          (tMs, state) => {
            rpmByMs.push(state[ST.RPM0]);
          },
          tPre,
        );
        const finalRpm = rpmByMs[rpmByMs.length - 1];
        if (!(finalRpm > 0)) {
          return { measured: 'no RPM response', pass: false, reason: 'motor never spun up' };
        }
        const target = th.target_fraction.value * finalRpm;
        let riseMs = -1;
        for (let i = 0; i < rpmByMs.length; i += 1) {
          if (rpmByMs[i] >= target) {
            riseMs = i + 1;
            break;
          }
        }
        const riseS = riseMs / 1000;
        const pass = riseMs > 0 && riseS >= th.band_s.min && riseS <= th.band_s.max;
        return { measured: `${riseMs} ms`, pass, reason: pass ? '' : 'outside band' };
      },
    },
    {
      num: 9,
      id: 'rate-tracking',
      thresholdText: 'within 3 percent of configured max rate',
      async run(ctx) {
        const th = ctx.th.checks['rate-tracking'];
        const configured =
          parseRollSrate(ctx.configA) * th.actual_srate_to_deg_s.value;
        const sim = await ctx.freshSim();
        must(sim.init(ctx.configA), 'sim_init');
        const rate = steadyRollRate(
          sim,
          th.cell_voltage.value,
          th.throttle.value,
          th.hold_s.value,
          th.steady_window_s.value,
        );
        const err = Math.abs(rate - configured) / configured;
        const pass = err <= th.tolerance_fraction.value;
        return {
          measured: `${rate.toFixed(1)} deg/s vs ${configured} configured (${(err * 100).toFixed(2)} percent off)`,
          pass,
          reason: pass ? '' : 'outside tolerance',
        };
      },
    },
    {
      num: 10,
      id: 'yaw-coupling',
      thresholdText: '|drift| >= 2 deg, sign negative',
      async run(ctx) {
        const th = ctx.th.checks['yaw-coupling'];
        const sim = await ctx.freshSim();
        must(sim.init(ctx.configA), 'sim_init');
        must(sim.reset(), 'sim_reset');
        must(sim.setCellVoltage(th.cell_voltage.value), 'sim_set_cell_voltage');
        const holdMs = Math.round(th.roll_hold_s.value * 1000);
        const dt = 1 / ctx.th.physics.step_hz.value;
        let yawRad = 0;
        runScript(
          sim,
          [{ durMs: holdMs, throttle: th.throttle.value, roll: 1 }],
          (tMs, state) => {
            yawRad += state[ST.R] * dt;
          },
        );
        const yawDeg = yawRad * DEG;
        const bigEnough = Math.abs(yawDeg) >= th.min_abs_body_yaw_deg.value;
        const signOk = Math.sign(yawDeg) === th.expected_sign.value;
        const pass = bigEnough && signOk;
        let reason = '';
        if (!bigEnough) {
          reason = 'drift below floor';
        } else if (!signOk) {
          reason = 'wrong sign';
        }
        return { measured: `${yawDeg.toFixed(2)} deg`, pass, reason };
      },
    },
    {
      num: 11,
      id: 'battery-sag',
      thresholdText: 'peak RPM 4 to 15 percent lower at 3.60 V',
      async run(ctx) {
        const th = ctx.th.checks['battery-sag'];
        const th5 = ctx.th.checks['hover-throttle'];
        const [vHigh, vLow] = th.cell_voltages.value;
        const sim = await ctx.freshSim();
        must(sim.init(ctx.configA), 'sim_init');
        const trim = trimHover(sim, vHigh, th5);
        if (Number.isNaN(trim)) {
          return { measured: 'no hover trim', pass: false, reason: 'hover not reachable' };
        }
        const high = punchOut(sim, vHigh, trim, th.hover_settle_s.value, th.full_throttle_s.value);
        const low = punchOut(sim, vLow, trim, th.hover_settle_s.value, th.full_throttle_s.value);
        if (!(high.peakRpm > 0)) {
          return { measured: 'no RPM at full charge', pass: false, reason: 'motors never spun' };
        }
        const dropPct = ((high.peakRpm - low.peakRpm) / high.peakRpm) * 100;
        const pass = dropPct >= th.band_percent.min && dropPct <= th.band_percent.max;
        return {
          measured: `${dropPct.toFixed(2)} percent lower (${Math.round(high.peakRpm)} vs ${Math.round(low.peakRpm)} RPM)`,
          pass,
          reason: pass ? '' : 'outside band',
        };
      },
    },
    {
      num: 12,
      id: 'diff-passthrough',
      thresholdText: 'rate ratio matches diff ratio within 2 percent',
      async run(ctx) {
        const th = ctx.th.checks['diff-passthrough'];
        const srateA = parseRollSrate(ctx.configA);
        const srateB = parseRollSrate(ctx.configB);
        if (srateA === srateB) {
          return { measured: 'fixture diffs identical', pass: false, reason: 'bad fixtures' };
        }
        const expected = srateB / srateA;
        const rates = [];
        for (const cfg of [ctx.configA, ctx.configB]) {
          const sim = await ctx.freshSim();
          must(sim.init(cfg), 'sim_init');
          rates.push(
            steadyRollRate(
              sim,
              th.cell_voltage.value,
              th.throttle.value,
              th.hold_s.value,
              th.steady_window_s.value,
            ),
          );
        }
        if (!(rates[0] > 0)) {
          return { measured: 'zero roll rate with config A', pass: false, reason: 'no rotation' };
        }
        const ratio = rates[1] / rates[0];
        const err = Math.abs(ratio / expected - 1);
        const pass = err <= th.tolerance_fraction.value;
        return {
          measured: `ratio ${ratio.toFixed(4)} vs ${expected.toFixed(4)} expected (${(err * 100).toFixed(2)} percent off)`,
          pass,
          reason: pass ? '' : 'outside tolerance',
        };
      },
    },
    {
      num: 13,
      id: 'console-clean',
      thresholdText: 'zero errors, zero warnings',
      async run(ctx) {
        const th = ctx.th.checks['console-clean'];
        const browser = await ctx.browserRun();
        const errs = browser.errors.length;
        const warns = browser.warnings.length;
        const runOk = Boolean(browser.result && browser.result.ok);
        const runText = runOk ? 'ok' : browser.result?.errorName ?? 'no result';
        const clean = errs <= th.max_errors.value && warns <= th.max_warnings.value;
        const pass = clean && runOk;
        let reason = '';
        if (!runOk) {
          reason = browser.result?.errorName ?? 'harness run failed';
        } else if (!clean) {
          reason = browser.errors[0] ?? browser.warnings[0];
        }
        return {
          measured: `errors=${errs} warnings=${warns} run=${runText}`,
          pass,
          reason,
        };
      },
    },
  ];
}

export { SimError };
