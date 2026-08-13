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
    {
      num: 14,
      id: 'audio-bed',
      thresholdText: 'context running, bed audible, scheduler advancing',
      async run(ctx) {
        const th = ctx.th.checks['audio-bed'];
        const a = await ctx.audioBedRun();
        const gainOk = a.musicGain >= th.min_music_gain.value;
        const stepsOk = a.steps >= th.min_music_steps.value;
        const nodesOk = a.nodes > 0 && a.nodes <= th.max_nodes.value;
        const liveOk = a.state === 'running' && a.motorsAttached && a.musicAttached;
        const pass = gainOk && stepsOk && nodesOk && liveOk;
        const reasons = [];
        if (a.state !== 'running') {
          reasons.push(`context ${a.state}`);
        }
        if (!a.motorsAttached) {
          reasons.push('motor graph not attached');
        }
        if (!a.musicAttached) {
          reasons.push('music graph not attached');
        }
        if (!gainOk) {
          reasons.push(`music gain ${a.musicGain.toFixed(4)}`);
        }
        if (!stepsOk) {
          reasons.push(`scheduler advanced ${a.steps} steps`);
        }
        if (!nodesOk) {
          reasons.push(`${a.nodes} nodes`);
        }
        /*
         * A rate, not a tempo. The count alone cannot tell a stalled
         * scheduler from a half rate one, so the per second figure earns its
         * place, but it is NOT published as BPM: the scheduler advances in
         * lookahead chunks and consecutive 4 s windows measured 46 and 49
         * steps, which would read as 172 and 183 BPM on a 174 BPM bed. The
         * tempo is measured properly off the rendered audio by
         * scripts/audio-probe.js, against a shuffled null hypothesis.
         */
        const rate = a.elapsed > 0 ? a.steps / a.elapsed : 0;
        return {
          measured:
            `ctx ${a.state}, music gain ${a.musicGain.toFixed(3)}, ` +
            `${a.steps} steps in ${a.elapsed.toFixed(2)} s (${rate.toFixed(2)}/s), ` +
            `${a.nodes} nodes`,
          pass,
          reason: reasons.join('; '),
        };
      },
    },
    {
      num: 15,
      id: 'world-scale',
      thresholdText: 'reference objects inside their real world bands',
      /*
       * THE CHECK THAT WOULD HAVE CAUGHT THE GRASS.
       *
       * Every budget in this project stayed correct while grass blades were
       * 0.26 to 0.68 m and a 1.524 m regulation gate vanished from frame. A
       * draw call count cannot see a scale error; only an object whose real
       * size is known can. So this asserts that things whose size a tape
       * measure would settle measure what they claim, in BOTH maps, and it
       * prints every number it measured so a reviewer reads the value rather
       * than the verdict.
       *
       * The trap it is written around: the city is authored for a walker with
       * a 1.7 m eye, so a doorway is correctly four times the craft's width
       * and that is right. Every band below is a real world size, not a
       * comparison against the quad.
       */
      async run(ctx) {
        const r = await ctx.scaleRun();
        const rows = [];
        const fails = [];
        const band = (label, value, min, max, unit) => {
          const ok = typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
          rows.push(`${label} ${typeof value === 'number' ? value.toFixed(4) : String(value)}${unit}`);
          if (!ok) {
            fails.push(`${label} ${typeof value === 'number' ? value.toFixed(4) : String(value)}${unit} outside ${min} to ${max}`);
          }
        };
        const th = ctx.th.checks['world-scale'];

        /*
         * The craft, measured off the drawn geometry rather than off the
         * constants that drew it, and then divided back through the DECLARED
         * world scale.
         *
         * The world is built at WORLD_SCALE times the aircraft's own scale
         * (src/render/frame.js), so the drawn craft's world bounding box is
         * deliberately 1/WORLD_SCALE of a real 5 inch machine and banding it
         * raw would fail on a change that is working as intended. Dividing it
         * out keeps the band asserting exactly what it always asserted, that
         * the airframe IS a real 5 inch machine, and the assertion below that
         * the scale is actually applied is what stops this becoming a licence
         * to draw any size at all: an undeclared group scale still fails the
         * band, and a declared scale that never reached the model fails the
         * ratio.
         */
        const scale = r.craft.worldScale;
        if (!(typeof scale === 'number' && scale > 0)) {
          fails.push('the page did not publish a world scale');
        }
        const s = typeof scale === 'number' && scale > 0 ? scale : 1;
        rows.push(`world scale ${s.toFixed(4)}`);
        if (Math.abs(s - th.world_scale.value) > 1e-9) {
          fails.push(`the page declares a world scale of ${s}, the threshold file ${th.world_scale.value}`);
        }
        band('craft body', r.craft.bodyLength * s, th.craft_body_m.min, th.craft_body_m.max, ' m');
        band('craft sweep radius', r.craft.sweepMeasured * s, th.craft_sweep_m.min, th.craft_sweep_m.max, ' m');
        /* The declared scale against the one the renderer actually applied.
         * Measured over the airframe's true sweep radius, which collide.js
         * owns and publishes beside the scaled one. */
        const scaleErr = Math.abs(r.craft.sweepMeasured * s - r.craft.craftRTrue);
        rows.push(`declared scale applied to ${(r.craft.sweepMeasured * s).toFixed(4)} m against a true ${r.craft.craftRTrue.toFixed(4)} m`);
        if (scaleErr > th.craft_radius_tolerance_m.value) {
          fails.push(
            `the drawn craft is ${(r.craft.sweepMeasured).toFixed(4)} m, which is not the true `
            + `${r.craft.craftRTrue.toFixed(4)} m at the declared scale ${s.toFixed(4)}`,
          );
        }
        /* And the collision sphere against that same geometry. A gate scored
         * against a quad bigger than the one on screen is a scale error the
         * player feels and no budget can see. Both sides are world metres, so
         * this comparison is the same one it has always been. */
        const sweepErr = Math.abs(r.craft.craftR - r.craft.sweepMeasured);
        rows.push(`collision radius ${r.craft.craftR.toFixed(4)} m vs swept ${r.craft.sweepMeasured.toFixed(4)} m`);
        if (sweepErr > th.craft_radius_tolerance_m.value) {
          fails.push(`collision radius is ${(sweepErr * 1000).toFixed(1)} mm from the swept disc`);
        }

        /*
         * The race field. The gate band is MultiGP's published 1.524 m square
         * times the DECLARED gate scale, not the published figure: the course
         * is deliberately built 15 percent over the rulebook and track.js
         * says so in one named constant. Banding the published number would
         * fail a change that is working as intended, and banding nothing
         * would let the opening drift to any size at all, so the check reads
         * the page's own declared scale and asserts the threshold file agrees
         * with it first.
         */
        if (typeof r.field.gateScale !== 'number') {
          fails.push('the page did not publish a gate scale');
        } else if (Math.abs(r.field.gateScale - th.gate_scale.value) > 1e-9) {
          fails.push(`the page declares a gate scale of ${r.field.gateScale}, the threshold file ${th.gate_scale.value}`);
        }
        rows.push(`gate scale ${(r.field.gateScale ?? 0).toFixed(4)}`);
        band('gate opening W', r.field.gateOpeningW, th.gate_opening_m.min, th.gate_opening_m.max, ' m');
        band('gate opening H', r.field.gateOpeningH, th.gate_opening_m.min, th.gate_opening_m.max, ' m');
        band('grass blade min', r.field.grassMin, th.grass_blade_m.min, th.grass_blade_m.max, ' m');
        band('grass blade max', r.field.grassMax, th.grass_blade_m.min, th.grass_blade_m.max, ' m');

        /* The city, all three measured off the built world by three different
         * routes: the height query, the geometry and the collider list. */
        band('city kerb', r.city.kerb, th.kerb_m.min, th.kerb_m.max, ' m');
        band('city doorway', r.city.doorway, th.doorway_m.min, th.doorway_m.max, ' m');
        band('city handrail', r.city.handrail, th.handrail_m.min, th.handrail_m.max, ' m');
        band('city crossing boom', r.city.boom, th.boom_m.min, th.boom_m.max, ' m');
        /* And the SOLID barrier against the DRAWN arm. Measuring only the
         * hinge would let the collider be moved to 3 m without the check
         * noticing, which is the difference between a reference object and a
         * cross check. */
        /*
         * The city's collider fit, asserted rather than described.
         *
         * src/maps/city/index.js trims the town's walker keep-out rectangles
         * onto the geometry they stand for, and the failure mode is not
         * subtle: an earlier version without a coverage rule chopped a 78.9 m
         * lineside railing down to a single 0.18 m post, which is a hole a
         * quad flies through the scenery. So the caps are checked here, where
         * a regression that starts chopping shows up as a number instead of
         * as a report from the pilot. The fit only ever shrinks, so a trim
         * cannot be negative either.
         */
        const cf = r.city.colliderFit;
        if (!cf) {
          fails.push('the city published no collider fit');
        } else {
          const cap = th.collider_fit_max_trim_m.value;
          rows.push(
            `collider fit ${cf.fitted} fitted of ${cf.fitted + cf.unmatched}, `
            + `${cf.sideTrims} side trims to ${cf.maxSideTrim.toFixed(2)} m, `
            + `${cf.topTrims} top trims to ${cf.maxTopTrim.toFixed(2)} m`,
          );
          if (!(cf.maxSideTrim >= 0 && cf.maxSideTrim <= cap)) {
            fails.push(`the collider fit moved a face ${cf.maxSideTrim.toFixed(2)} m, past the ${cap} m cap`);
          }
          if (!(cf.maxTopTrim >= 0 && cf.maxTopTrim <= cap)) {
            fails.push(`the collider fit dropped a top ${cf.maxTopTrim.toFixed(2)} m, past the ${cap} m cap`);
          }
          if (!(cf.fitted > 0)) {
            fails.push('the collider fit trimmed nothing at all, so it is not running');
          }
        }

        const bc = r.city.boomCollider;
        rows.push(`crossing boom collider ${bc && bc.y0 != null ? `${bc.y0.toFixed(3)} to ${bc.y1.toFixed(3)}` : 'none'} m`);
        if (!bc || bc.y0 == null || !(bc.y0 < r.city.boom && bc.y1 > r.city.boom)) {
          fails.push('the boom collider does not bracket the drawn arm hinge');
        }

        return {
          measured: rows.join(', '),
          pass: fails.length === 0,
          reason: fails.join('; '),
        };
      },
    },
    {
      num: 16,
      id: 'map-isolation',
      thresholdText: 'no city module requested with the field selected, field cost unchanged',
      /*
       * THE LAZY LOAD, MEASURED RATHER THAN ASSERTED.
       *
       * "The city loads only when chosen" is exactly the kind of claim that
       * stays true right up until somebody adds a convenience import at the
       * top of a shared file and the whole 59 file graph comes back at boot
       * with nothing to show for it. So this reads the browser's own resource
       * timing: every URL the page requested while the race field was
       * selected, and every URL after the city was chosen. Zero city modules
       * in the first list is the isolation; a full graph in the second is the
       * proof that the first list is not empty because the loader is broken.
       *
       * The second half is the cost. The field's frame must be untouched by
       * the city existing at all, so its draw calls, triangles, render target
       * bytes and attribute bytes are asserted against the values measured at
       * c3c6e44, the commit before this work started. They are not "close to"
       * those values: they are identical, and the bands below are tight
       * enough to say so.
       */
      async run(ctx) {
        const r = await ctx.scaleRun();
        const th = ctx.th.checks['map-isolation'];
        const fails = [];
        const before = r.cityUrlsWhileFieldSelected.length;
        const after = r.cityUrlsAfterChoosingCity.length;
        if (before !== 0) {
          fails.push(`${before} city module(s) fetched with the field selected, first ${r.cityUrlsWhileFieldSelected[0]}`);
        }
        if (after < th.city_modules_min.value) {
          fails.push(`only ${after} city modules fetched after choosing the city`);
        }
        /* The loading bar's typed module weight against what the browser
         * actually fetched on this cold load. 61 sat in main.js for a round
         * while the real count was 63, and nothing could notice: a bar
         * weight cannot break a load, which is exactly why it needs a
         * check rather than a comment. */
        if (r.cityExpectedModules != null && after !== r.cityExpectedModules) {
          fails.push(`MAP_MODULE_COUNT says ${r.cityExpectedModules} city modules, the browser fetched ${after}`);
        }
        const b = r.fieldBudget;
        const base = th.field_budget_at_c3c6e44;
        const same = (label, got, want, tol) => {
          if (!(Math.abs(got - want) <= tol)) {
            fails.push(`${label} ${got} against ${want} at c3c6e44`);
          }
        };
        const b2 = r.fieldBudgetAfterRoundTrip;
        if (!b) {
          fails.push('the field budget was not measured');
        } else {
          same('P1 draw calls', b.p1, base.p1.value, 0);
          same('P2 triangles', b.p2, base.p2.value, 0);
          same('P5 target MB', b.p5, base.p5_MB.value, 0.05);
          same('P10 attribute MB', b.p10, base.p10_MB.value, 0.05);
          same('meshes', b.meshes, base.meshes.value, 0);
        }
        /* And again after field to city to field. This is the measurement that
         * can see a leak: anything the city fails to free is invisible until
         * the field is measured on the far side of a round trip. */
        if (!b2) {
          fails.push('the field budget after a round trip was not measured');
        } else {
          same('P1 after round trip', b2.p1, base.p1.value, 0);
          same('P2 after round trip', b2.p2, base.p2.value, 0);
          same('P5 after round trip', b2.p5, base.p5_MB.value, 0.05);
          same('P10 after round trip', b2.p10, base.p10_MB.value, 0.05);
          same('meshes after round trip', b2.meshes, base.meshes.value, 0);
          /* The per frame cel clock walk must not GROW across a round trip.
           * This is the measurement that catches a disposed material's
           * uniform kept alive forever: every budget above counts targets
           * and triangles, and a dead uniform object costs neither. Not an
           * equality: a material only registers when it first compiles, so
           * the rebuilt field legitimately reports fewer until every view
           * has rendered once. With the old push-only array this read boot
           * plus rebuild, 93 against 54. */
          if (b && b2.cel > b.cel) {
            fails.push(`cel material clock walk grew ${b.cel} to ${b2.cel} across a round trip`);
          }
        }
        return {
          measured:
            `city modules: ${before} with the field selected, ${after} after choosing it; ` +
            (b ? `field P1 ${b.p1}, P2 ${b.p2}, P5 ${b.p5} MB, P10 ${b.p10} MB, ${b.meshes} meshes` : 'no budget') +
            (b2 ? `; after a city round trip P1 ${b2.p1}, P2 ${b2.p2}, P5 ${b2.p5} MB, P10 ${b2.p10} MB` : ''),
          pass: fails.length === 0,
          reason: fails.join('; '),
        };
      },
    },
  ];
}

export { SimError };
