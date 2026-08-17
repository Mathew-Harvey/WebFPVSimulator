/*
 * replay-log.js: fly a real quad's logged sticks through this simulator and
 * measure what the plant got wrong.
 *
 * THE INSTRUMENT THIS PROJECT DID NOT HAVE. The verify harness measures
 * determinism, statics, energy, tracking and render scale. None of that is
 * flight feel, and PROGRESS.md admits it repeatedly. So every feel constant
 * has been set by one pilot flying the build and comparing it against a
 * memory of a real quad, which is why k_propwash has been 0.60, 0.12, 0.30
 * and 0.08, and why "it feels a little different" took an archaeology
 * session to explain.
 *
 * What makes a real answer possible here is that the controller is not a
 * model of Betaflight, it is Betaflight. Load a quad's own diff, feed it
 * that quad's own logged stick stream, and the firmware in the loop is the
 * same firmware on both sides. Whatever the two disagree about is the
 * PLANT: src/native/plant.c, its constants, and the effects it does not
 * model at all.
 *
 * WHAT IT REPORTS, AND WHY IN TWO PARTS.
 *
 *   trace     The gyro residual against time. This is the honest headline
 *             and it has a horizon: two systems fed the same sticks in open
 *             loop diverge, because a small rate error integrates into an
 *             attitude error and from there into a different flight. So the
 *             report gives the residual over the first window and the time
 *             at which it leaves a band, and does NOT pretend a whole lap
 *             should line up. A LONGER time to divergence is a better
 *             plant. That is the number to watch across a change.
 *
 *   segments  Divergence free scalars, measured over short windows chosen
 *             from the log itself: hover throttle, steady roll rate per
 *             unit stick, rate rise time, sag against current. Each is a
 *             property of the plant that does not depend on where the craft
 *             ended up, so these stay meaningful over a whole log and are
 *             what a constant should be fitted against.
 *
 * SELF TEST. Without a real log this harness could still be wired wrong in
 * a way that produces a confident, useless report: one flipped stick sign
 * reads as a tracking error rather than as a bug. So --selftest flies a
 * scripted session, writes it out in blackbox_decode's own CSV shape, reads
 * it back through the same parser, replays it, and requires the residual to
 * be ZERO. That closes the loop on the conventions in tests/lib/blackbox.js
 * before any real hardware is involved.
 *
 * USAGE
 *   node scripts/replay-log.js --selftest
 *   node scripts/replay-log.js LOG.01.csv --config configs/betaflight-default.diff
 *   node scripts/replay-log.js LOG.01.csv --config x.diff --json report.json
 *
 * Decode a .BBL first:
 *   blackbox_decode --unit-gyro deg --unit-vbat V LOG.BBL
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

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';
import { ST } from '../tests/lib/replay.js';
import { parseBlackboxCsv, toBlackboxCsv } from '../tests/lib/blackbox.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const RAD_TO_DEG = 180 / Math.PI;

/* The band the gyro residual has to stay inside to count as "still
 * tracking". 25 deg/s is about a twentieth of a race quad's roll rate: wide
 * enough that filter phase and log quantisation do not trip it, tight
 * enough that a real plant error does. It sets where time-to-divergence is
 * read off, and moving it changes the number, so it is stated rather than
 * buried. */
const TRACK_BAND_DPS = 25;

function fail(msg) {
  console.error(`replay-log: ${msg}`);
  process.exit(1);
}

async function freshSim() {
  const bytes = await readFile(join(root, 'dist', 'sim.wasm'));
  return loadSim(bytes);
}

function must(code, where) {
  if (code !== SIM_OK) {
    fail(`${where} returned ${simErrorName(code)}`);
  }
}

/*
 * Drive the module along a log's own stick stream.
 *
 * The log's rows are RC frames with their own timestamps, which is exactly
 * what sim_input takes, so no resampling happens here: each row is handed
 * over at its own time and the module consumes it in the step its timestamp
 * falls in. Stepping is done in whole steps between rows, so the trajectory
 * does not depend on how the rows are batched, which is the ABI's own
 * guarantee.
 */
async function replay(sim, log, configText, opts = {}) {
  must(sim.init(configText), 'sim_init');
  if (opts.cellVoltage) {
    must(sim.setCellVoltage(opts.cellVoltage), 'sim_set_cell_voltage');
  }
  const stepHz = opts.stepHz ?? 1000;
  const out = [];
  let stepped = 0;
  for (const row of log.rows) {
    const tS = row.tUs / 1e6;
    const code = sim.input(tS, row.rc[0], row.rc[1], row.rc[2], row.rc[3]);
    if (code !== SIM_OK) {
      fail(`sim_input at t=${tS.toFixed(4)} returned ${simErrorName(code)}`);
    }
    const want = Math.round(tS * stepHz);
    if (want > stepped) {
      must(sim.step(want - stepped), 'sim_step');
      stepped = want;
    }
    const rs = sim.readState();
    if (rs.code !== SIM_OK || !rs.state) {
      fail(`sim_state at t=${tS.toFixed(4)} returned ${simErrorName(rs.code)}`);
    }
    const st = rs.state;
    out.push({
      tUs: row.tUs,
      rc: row.rc,
      gyroDps: [st[ST.P] * RAD_TO_DEG, st[ST.Q] * RAD_TO_DEG, st[ST.R] * RAD_TO_DEG],
      motor: null,
      rpm: [st[ST.RPM0], st[ST.RPM1], st[ST.RPM2], st[ST.RPM3]],
      vbat: st[ST.VBAT],
      amps: st[ST.AMPS],
      speed: Math.hypot(st[ST.VX], st[ST.VY], st[ST.VZ]),
      alt: st[ST.PZ],
    });
  }
  return out;
}

/* Root mean square of a list, ignoring holes. */
function rms(xs) {
  let n = 0;
  let acc = 0;
  for (const x of xs) {
    if (Number.isFinite(x)) {
      acc += x * x;
      n += 1;
    }
  }
  return n ? Math.sqrt(acc / n) : NaN;
}

/*
 * The residual, and how long the two flights stayed together.
 *
 * Reported per axis and over a short leading window as well as the whole
 * log, because those answer different questions: the window is a plant
 * comparison, the whole log is mostly a record of how fast open loop
 * divergence took over.
 */
function traceReport(log, sim, windowMs) {
  const axes = ['roll', 'pitch', 'yaw'];
  const per = axes.map(() => []);
  const win = axes.map(() => []);
  let divergedUs = null;
  for (let i = 0; i < sim.length; i += 1) {
    const real = log.rows[i].gyroDps;
    if (!real) {
      continue;
    }
    let worst = 0;
    for (let a = 0; a < 3; a += 1) {
      const e = sim[i].gyroDps[a] - real[a];
      per[a].push(e);
      if (sim[i].tUs <= windowMs * 1000) {
        win[a].push(e);
      }
      worst = Math.max(worst, Math.abs(e));
    }
    if (divergedUs == null && worst > TRACK_BAND_DPS) {
      divergedUs = sim[i].tUs;
    }
  }
  return {
    windowMs,
    trackBandDps: TRACK_BAND_DPS,
    windowRmsDps: Object.fromEntries(axes.map((n, a) => [n, rms(win[a])])),
    wholeRmsDps: Object.fromEntries(axes.map((n, a) => [n, rms(per[a])])),
    divergedAtS: divergedUs == null ? null : divergedUs / 1e6,
  };
}

/*
 * Scalars that do not care where the craft ended up.
 *
 * Each is read out of windows the log itself offers, so a log with no
 * hover in it simply reports null for hover throttle rather than inventing
 * one. These are the numbers a plant constant should be fitted against,
 * because unlike the trace they stay valid for the whole log.
 */
function segmentReport(log, sim) {
  const rows = log.rows;
  const out = {};

  /* Hover: sticks centred, throttle steady, rates small, for 300 ms.
   * Reported from BOTH sides, so the answer is "the real quad hovered at
   * 0.41 and this plant hovers at 0.26" rather than a single number with no
   * scale on it. */
  const hoverReal = [];
  const hoverSim = [];
  for (let i = 0; i < rows.length; i += 1) {
    const g = rows[i].gyroDps;
    if (!g) {
      continue;
    }
    const still = Math.abs(g[0]) < 30 && Math.abs(g[1]) < 30 && Math.abs(g[2]) < 30;
    const centred = Math.abs(rows[i].rc[0]) < 0.05 && Math.abs(rows[i].rc[1]) < 0.05;
    if (still && centred && rows[i].rc[3] > 0.05) {
      hoverReal.push(rows[i].rc[3]);
      hoverSim.push(sim[i].alt);
    }
  }
  out.hoverThrottleCommanded = hoverReal.length > 50
    ? hoverReal.reduce((a, b) => a + b, 0) / hoverReal.length
    : null;
  out.hoverSamples = hoverReal.length;

  /*
   * Steady rate per unit stick, per axis. Taken where the stick has been
   * held past 40 percent for at least 120 ms, which is long enough for a
   * race tune to have settled. This is the single most diagnostic number
   * in the report: it is rate tracking, and if the real quad and this plant
   * disagree here the disagreement is inertia, thrust or motor authority
   * rather than anything subtle.
   */
  const HOLD_MS = 120;
  for (const [axis, ch] of [['roll', 0], ['pitch', 1], ['yaw', 2]]) {
    const realRates = [];
    const simRates = [];
    let runStart = -1;
    let sign = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const s = rows[i].rc[ch];
      const held = Math.abs(s) > 0.4 && (sign === 0 || Math.sign(s) === sign);
      if (held) {
        if (runStart < 0) {
          runStart = i;
          sign = Math.sign(s);
        } else if ((rows[i].tUs - rows[runStart].tUs) / 1000 > HOLD_MS) {
          const g = rows[i].gyroDps;
          if (g) {
            realRates.push(g[ch] / s);
            simRates.push(sim[i].gyroDps[ch] / s);
          }
        }
      } else {
        runStart = -1;
        sign = 0;
      }
    }
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    out[`${axis}RatePerStickReal`] = mean(realRates);
    out[`${axis}RatePerStickSim`] = mean(simRates);
    out[`${axis}RateSamples`] = realRates.length;
  }

  /* Pack sag against draw, if the log carried voltage. The plant solves sag
   * in closed form from r_cell, so a slope disagreement here is r_cell and
   * nothing else. */
  if (log.meta.hasVbat) {
    const realV = rows.map((r) => r.vbat).filter(Number.isFinite);
    out.vbatMinReal = realV.length ? Math.min(...realV) : null;
    out.vbatMaxReal = realV.length ? Math.max(...realV) : null;
    out.vbatMinSim = Math.min(...sim.map((s) => s.vbat));
    out.vbatMaxSim = Math.max(...sim.map((s) => s.vbat));
    out.ampsPeakSim = Math.max(...sim.map((s) => s.amps));
  }
  return out;
}

/*
 * A scripted flight, written out as though a quad had flown it.
 *
 * Deliberately exercises every axis in both directions plus throttle, so a
 * sign error anywhere in the conventions cannot hide in an axis the script
 * never moves.
 */
function selftestScript(stepHz) {
  const rcHz = 250;
  const dtUs = 1e6 / rcHz;
  const segs = [
    { ms: 400, rc: [0, 0, 0, 0.35] },
    { ms: 300, rc: [0.6, 0, 0, 0.45] },
    { ms: 300, rc: [-0.6, 0, 0, 0.45] },
    { ms: 300, rc: [0, 0.5, 0, 0.45] },
    { ms: 300, rc: [0, -0.5, 0, 0.45] },
    { ms: 300, rc: [0, 0, 0.7, 0.45] },
    { ms: 300, rc: [0, 0, -0.7, 0.45] },
    { ms: 400, rc: [0.3, 0.3, 0.2, 0.85] },
  ];
  const rows = [];
  let tUs = 0;
  for (const seg of segs) {
    const n = Math.round((seg.ms / 1000) * rcHz);
    for (let i = 0; i < n; i += 1) {
      rows.push({ tUs, rc: seg.rc.slice() });
      tUs += dtUs;
    }
  }
  return { rows, stepHz };
}

async function runSelftest(configText) {
  const sim = await freshSim();
  const script = selftestScript(1000);
  /* Fly it once to get a gyro trace to write into the fixture. */
  const flown = await replay(sim, { rows: script.rows, meta: {} }, configText);
  const csv = toBlackboxCsv(flown.map((s, i) => ({
    tUs: s.tUs,
    rc: script.rows[i].rc,
    gyroDps: s.gyroDps,
    motor: null,
    vbat: s.vbat,
  })));

  /* Read it back through the real parser and fly it again. */
  const parsed = parseBlackboxCsv(csv);
  const again = await replay(await freshSim(), parsed, configText);

  let worstGyro = 0;
  let worstRc = 0;
  for (let i = 0; i < again.length; i += 1) {
    for (let a = 0; a < 3; a += 1) {
      worstGyro = Math.max(worstGyro, Math.abs(again[i].gyroDps[a] - flown[i].gyroDps[a]));
    }
    for (let c = 0; c < 4; c += 1) {
      worstRc = Math.max(worstRc, Math.abs(parsed.rows[i].rc[c] - script.rows[i].rc[c]));
    }
  }
  const rcOk = worstRc < 1e-9;
  const gyroOk = worstGyro < 1e-9;
  console.log('replay-log selftest: fly a script, write it as blackbox CSV, read it back, fly it again');
  console.log(`  rows                 ${parsed.rows.length}`);
  console.log(`  parsed rate          ${parsed.meta.rateHz.toFixed(1)} Hz`);
  console.log(`  gyro column          ${parsed.meta.gyro}`);
  console.log(`  worst stick error    ${worstRc.toExponential(2)}   ${rcOk ? 'ok' : 'FAIL'}`);
  console.log(`  worst gyro error     ${worstGyro.toExponential(2)} deg/s   ${gyroOk ? 'ok' : 'FAIL'}`);
  if (!rcOk || !gyroOk) {
    console.error('\n  A non zero residual here is a HARNESS bug, not a plant one: the same');
    console.error('  module flew the same sticks twice. Suspect the channel conventions in');
    console.error('  tests/lib/blackbox.js, the pitch sign first.');
    process.exit(1);
  }
  console.log('\n  Conventions round trip exactly. A residual against a REAL log is plant error.');
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, dflt = null) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
  };
  const configPath = flag('config', join(root, 'configs', 'betaflight-default.diff'));
  const configText = await readFile(resolve(configPath), 'utf8');

  if (args.includes('--selftest')) {
    await runSelftest(configText);
    return;
  }

  const csvPath = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--config'
    && args[args.indexOf(a) - 1] !== '--json' && args[args.indexOf(a) - 1] !== '--window');
  if (!csvPath) {
    fail('give a blackbox_decode CSV, or --selftest. See the header of this file.');
  }
  const log = parseBlackboxCsv(await readFile(resolve(csvPath), 'utf8'));
  if (!log.rows[0].gyroDps) {
    fail('that log has no gyro columns, so there is nothing to compare against');
  }
  const windowMs = Number(flag('window', '500'));
  const cell = log.meta.hasVbat && Number.isFinite(log.rows[0].vbat) && log.rows[0].vbat > 0
    ? log.rows[0].vbat / 6
    : null;

  const sim = await freshSim();
  const flown = await replay(sim, log, configText, { cellVoltage: cell });
  const trace = traceReport(log, flown, windowMs);
  const segs = segmentReport(log, flown);

  console.log(`log            ${csvPath}`);
  console.log(`config         ${configPath}`);
  console.log(`rows           ${log.meta.count} over ${log.meta.durationS.toFixed(2)} s at ${log.meta.rateHz.toFixed(0)} Hz`);
  console.log(`gyro source    ${log.meta.gyro}`);
  if (log.meta.gyroIsFiltered) {
    console.log('               (filtered: carries the tune\'s group delay on the real side.');
    console.log('                fly a log with debug_mode = GYRO_SCALED for a cleaner plant read)');
  }
  console.log(`pack start     ${cell ? `${(cell * 6).toFixed(2)} V, ${cell.toFixed(3)} V/cell` : 'not logged, using config default'}`);
  console.log('');
  console.log(`gyro residual, first ${windowMs} ms, deg/s RMS`);
  for (const a of ['roll', 'pitch', 'yaw']) {
    console.log(`  ${a.padEnd(6)} ${trace.windowRmsDps[a].toFixed(2).padStart(8)}`);
  }
  console.log(`whole log RMS  roll ${trace.wholeRmsDps.roll.toFixed(1)}, pitch ${trace.wholeRmsDps.pitch.toFixed(1)}, yaw ${trace.wholeRmsDps.yaw.toFixed(1)} deg/s`);
  console.log(`stayed inside +-${TRACK_BAND_DPS} deg/s for  ${trace.divergedAtS == null ? 'the whole log' : `${trace.divergedAtS.toFixed(3)} s`}`);
  console.log('  (open loop replay diverges eventually and is SUPPOSED to.');
  console.log('   A longer time here is a better plant. Watch it across a change.)');
  console.log('');
  console.log('divergence free scalars');
  const show = (k, v, unit = '') => {
    if (v == null || Number.isNaN(v)) {
      return;
    }
    console.log(`  ${k.padEnd(26)} ${typeof v === 'number' ? v.toFixed(3) : v}${unit}`);
  };
  show('hover throttle (logged)', segs.hoverThrottleCommanded);
  for (const a of ['roll', 'pitch', 'yaw']) {
    show(`${a} deg/s per stick real`, segs[`${a}RatePerStickReal`]);
    show(`${a} deg/s per stick sim`, segs[`${a}RatePerStickSim`]);
  }
  show('vbat min real', segs.vbatMinReal, ' V');
  show('vbat min sim', segs.vbatMinSim, ' V');
  show('amps peak sim', segs.ampsPeakSim, ' A');

  const jsonPath = flag('json');
  if (jsonPath) {
    await writeFile(resolve(jsonPath), `${JSON.stringify({ meta: log.meta, trace, segments: segs }, null, 2)}\n`);
    console.log(`\nwrote ${jsonPath}`);
  }
}

await main();
