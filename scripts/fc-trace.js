/*
 * fc-trace.js: prove LIVE / INERT / GATED against the compiled module.
 *
 * Round-trip, one-key diffs, dyn notch at 1 kHz, and the rates policy
 * (keep-mine must not let a dump steal roll_srate). Hashes are SHA-256
 * of raw state blocks, same as the harness, over a short stick program.
 *
 * Each hash loads a fresh module. Check 2 does the same: two in-process
 * hashes are two instantiations, not two sim_init calls on one instance.
 * A second sim_init on the same WASM is not a power-on. The dump
 * round-trip is "same text, same cold trajectory".
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RATE_DEFAULTS, RATE_TYPES, normaliseRates, ratesDiff, ratesSummary } from '../configs/rates.js';
import { composeConfig, dumpCarriesRates, expandRpmWeights, exportCli, featureEnabled, moduleDump, moduleGet, RATES_DUMP, RATES_KEEP, ratesFromDump, setCliValue, setFeatureLine } from '../src/fc/dump.js';
import { angleRateDeg } from '../src/fc/ratescurve.js';
import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';
import { must, sha256Hex } from '../tests/lib/replay.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function withLine(text, line) {
  const t = text.endsWith('\n') ? text : `${text}\n`;
  return `${t}${line}\n`;
}

const wasm = await readFile(join(root, 'dist/sim.wasm'));
const defaultDiff = await readFile(join(root, 'configs/betaflight-default.diff'), 'utf8');
const karateDiff = await readFile(join(root, 'configs/karate-race.diff'), 'utf8');
const base = composeConfig(defaultDiff, RATE_DEFAULTS, RATES_KEEP);

async function newSim() {
  const sim = await loadSim(wasm);
  if (typeof sim.e.sim_bf_dump !== 'function') {
    throw new Error('sim.wasm does not export sim_bf_dump; rebuild with npm run build:wasm');
  }
  return sim;
}

/*
 * Short flight used for every hash. 200 ms hover, 300 ms roll stick, 200 ms
 * centre. Hover alone cannot move roll_srate. The pulse is what makes LIVE
 * keys that only affect stick authority visible.
 */
async function shortTrace(configText) {
  const sim = await newSim();
  const code = sim.init(configText);
  if (code !== SIM_OK) {
    throw new Error(`sim_init returned ${simErrorName(code)}`);
  }
  /* sim_init plants vbat from 4.2 V on a fresh load. setCellVoltage only
   * writes the OC field. Reset so every trace starts on the same 4.0 V pack. */
  must(sim.setCellVoltage(4.0), 'sim_set_cell_voltage');
  must(sim.reset(), 'sim_reset');
  const chunks = [];
  const capture = () => {
    const { code: sc, bytes } = sim.readStateBytes();
    must(sc, 'sim_state');
    chunks.push(bytes);
  };
  capture();
  let tMs = 0;
  const endMs = 700;
  while (tMs < endMs) {
    let roll = 0;
    if (tMs >= 200 && tMs < 500) {
      roll = 0.35;
    }
    must(sim.input(tMs / 1000, roll, 0, 0, 0.26), 'sim_input');
    must(sim.step(1), 'sim_step');
    tMs += 1;
    if (tMs % 10 === 0) {
      capture();
    }
  }
  return sha256Hex(chunks);
}

let failed = 0;
const rows = [];

function record(name, ok, detail) {
  rows.push([ok ? 'ok' : 'FAIL', name, detail]);
  if (!ok) {
    failed += 1;
  }
}

const hashBase = await shortTrace(base);
const hashBase2 = await shortTrace(base);
record(
  'F3 base repeat',
  hashBase === hashBase2,
  `${hashBase}  vs  ${hashBase2}`,
);

{
  const sim = await newSim();
  must(sim.init(base), 'sim_init dump');
  const dumped = moduleDump(sim);
  const setLines = dumped.split('\n').filter((l) => l.startsWith('set ')).length;
  if (!dumped.includes('set p_roll =')) {
    record('F3 dump shape', false, 'WASM dump has no set p_roll line');
  } else {
    record('F3 dump shape', true, `${setLines} set lines`);
  }
  const hashRound = await shortTrace(dumped);
  record(
    'F3 round-trip',
    hashBase === hashRound,
    `base ${hashBase}  dump ${hashRound}`,
  );
}

async function livePair(name, a, b) {
  const ha = await shortTrace(a);
  const hb = await shortTrace(b);
  record(name, ha !== hb, `${ha}  vs  ${hb}`);
  return { ha, hb };
}

await livePair('F4 LIVE p_roll', base, withLine(base, 'set p_roll = 80'));
/* Dyn LPF is on in the default tune (gyro_lpf1_dyn_min_hz 250), so the
 * static cutoff is not the filter that runs. Turn dyn off in both so the
 * one-key diff is gyro_lpf1_static_hz. */
{
  const lpfOff = withLine(base, 'set gyro_lpf1_dyn_min_hz = 0');
  await livePair(
    'F4 LIVE gyro_lpf1_static_hz',
    withLine(lpfOff, 'set gyro_lpf1_static_hz = 250'),
    withLine(lpfOff, 'set gyro_lpf1_static_hz = 100'),
  );
}
await livePair('F4 LIVE roll_srate', base, withLine(base, 'set roll_srate = 42'));
await livePair('F4 LIVE rpm_filter_harmonics', base, withLine(base, 'set rpm_filter_harmonics = 0'));
await livePair('F4 LIVE feature -AIRMODE', base, withLine(base, 'feature -AIRMODE'));

const hashInert = await shortTrace(withLine(base, 'set osd_rssi_pos = 123'));
record(
  'F5 INERT osd_rssi_pos',
  hashInert === hashBase,
  `base ${hashBase}  inert ${hashInert}`,
);

/*
 * GATED dyn notch. Betaflight's dyn_notch_filter.c refuses to arm below
 * DYN_NOTCH_UPDATE_MIN_HZ (2 kHz) because the SDFT cannot resolve anything
 * useful at less. This build is 1 kHz, so dyn_notch_count 0 vs 3 must hash
 * equal. Do not "fix" this by stubbing a notch in JavaScript.
 */
const hashNotch0 = await shortTrace(withLine(base, 'set dyn_notch_count = 0'));
const hashNotch3 = await shortTrace(withLine(base, 'set dyn_notch_count = 3'));
record(
  'F6 GATED dyn_notch_count 0 vs 3 at 1 kHz',
  hashNotch0 === hashNotch3,
  `0 ${hashNotch0}  3 ${hashNotch3}`,
);

{
  const dirty = withLine(defaultDiff, 'set roll_srate = 42');
  const keep = composeConfig(dirty, RATE_DEFAULTS, RATES_KEEP);
  const simKeep = await newSim();
  must(simKeep.init(keep), 'sim_init keep-mine');
  const keepSrate = moduleGet(simKeep, 'roll_srate');
  record(
    'F7 keep-mine roll_srate',
    keepSrate === '67',
    `module roll_srate=${keepSrate} (want 67 from menu, not 42 from dump)`,
  );

  const use = composeConfig(dirty, RATE_DEFAULTS, RATES_DUMP);
  const simUse = await newSim();
  must(simUse.init(use), 'sim_init use-dump');
  const useSrate = moduleGet(simUse, 'roll_srate');
  record(
    'F7 use-dump roll_srate',
    useSrate === '42',
    `module roll_srate=${useSrate} (want 42 from dump)`,
  );

  const karateKeep = composeConfig(karateDiff, RATE_DEFAULTS, RATES_KEEP);
  const simKarate = await newSim();
  must(simKarate.init(karateKeep), 'sim_init karate keep-mine');
  const karateSrate = moduleGet(simKarate, 'roll_srate');
  record(
    'F7 karate keep-mine roll_srate',
    karateSrate === '67',
    `module roll_srate=${karateSrate} (want 67; Karate must not steal stick authority)`,
  );

  const splitDump = [
    'set p_roll = 45',
    'set rates_type = BETAFLIGHT',
    'set roll_rc_rate = 100',
    'set roll_srate = 67',
    'set pitch_srate = 42',
    'set yaw_srate = 55',
    '',
  ].join('\n');
  const mine = ratesFromDump(splitDump);
  const nextTune = composeConfig('set p_roll = 80\n', mine, RATES_KEEP);
  const simSplit = await newSim();
  must(simSplit.init(nextTune), 'sim_init keep-mine split rates');
  const keepPitch = moduleGet(simSplit, 'pitch_srate');
  const keepType = moduleGet(simSplit, 'rates_type');
  const keepRoll = moduleGet(simSplit, 'roll_srate');
  record(
    'F7 keep-mine holds pitch_srate and rates_type',
    keepPitch === '42' && keepType === 'BETAFLIGHT' && keepRoll === '67',
    `pitch_srate=${keepPitch} rates_type=${keepType} roll_srate=${keepRoll}`,
  );
  /* The whole point of the profile model: a BETAFLIGHT dump reads across as
   * BETAFLIGHT and is written back as BETAFLIGHT. The five knob model this
   * replaced could only hold ACTUAL, so the same dump came back flattened
   * and the module flew a different curve from the one that was dropped. */
  const cliMine = ratesDiff(mine);
  record(
    'F7 the profile round trips its own type',
    /set rates_type = BETAFLIGHT/.test(cliMine)
      && /set pitch_srate = 42/.test(cliMine)
      && /set roll_rc_rate = 100/.test(cliMine),
    `type ${/rates_type = (\w+)/.exec(cliMine)?.[1]} pitch ${/pitch_srate = (\d+)/.exec(cliMine)?.[1]}`,
  );
  const summary = ratesSummary(mine);
  record(
    'F13 summary reads the profile in deg/s',
    summary === 'Betaflight, 606 roll, 345 pitch, 444 yaw deg/s',
    summary,
  );
  /* A BETAFLIGHT roll_rc_rate of 100 is RC Rate 1.00, and it stays the
   * uint8 100 rather than being read as 1000 deg/s of centre sensitivity,
   * which is what reinterpreting it under the wrong type would do. */
  const bfRc = ratesFromDump([
    'set rates_type = BETAFLIGHT',
    'set roll_rc_rate = 100',
    'set roll_srate = 70',
    '',
  ].join('\n'));
  record(
    'F7 BETAFLIGHT rc_rate stays the firmware uint8',
    bfRc.type === 'BETAFLIGHT' && bfRc.roll.rcRate === 100 && bfRc.roll.srate === 70,
    `type=${bfRc.type} rc=${bfRc.roll.rcRate} srate=${bfRc.roll.srate}`,
  );
  /* An unknown type cannot be clamped onto, because the three numbers under
   * it mean nothing: the whole profile goes back to the default rather than
   * a Betaflight super rate of 250 being flown as an Actual one. */
  const junk = normaliseRates({ type: 'NONSENSE', roll: { rcRate: 250, srate: 250, expo: 250 } });
  record(
    'F7 an unknown rates type falls back whole',
    junk.type === RATE_DEFAULTS.type && junk.roll.srate === RATE_DEFAULTS.roll.srate,
    `type=${junk.type} srate=${junk.roll.srate}`,
  );
}

/*
 * F15: the picture against the firmware, for all five rate systems.
 *
 * WHY THIS EXISTS. The Rates screen lets a pilot choose a rates type and
 * type their own numbers, and it draws the curve those numbers produce from
 * src/fc/ratescurve.js, which is a JavaScript transcription of fc/rc.c. A
 * transcription is a claim, and this is the check that makes it one worth
 * believing: the same profile goes into the compiled module through the CLI
 * the menu writes, the sticks are swept from stop to stop, and every point
 * of the drawing is compared with the setpoint Betaflight actually produced.
 *
 * All three axes, because the menu now writes three, and with a different
 * profile on each so that a check could not pass by reading the wrong one.
 *
 * THE TWO SIGN FLIPS ARE THE POINT OF READING PITCH AND YAW HERE.
 * src/native/bf/bf_glue.c inverts pitch on its way into rcData, and rc.c
 * inverts yaw through GET_DIRECTION(yaw_control_reversed), so the curve a
 * given stick rides on those axes is the mirror of the roll one. Both are
 * written down here rather than assumed.
 */
{
  const PROFILES = {
    BETAFLIGHT: {
      roll: { rcRate: 118, srate: 73, expo: 15 },
      pitch: { rcRate: 90, srate: 55, expo: 30 },
      yaw: { rcRate: 130, srate: 40, expo: 0 },
    },
    RACEFLIGHT: {
      roll: { rcRate: 37, srate: 80, expo: 50 },
      pitch: { rcRate: 45, srate: 60, expo: 25 },
      yaw: { rcRate: 30, srate: 90, expo: 10 },
    },
    KISS: {
      roll: { rcRate: 110, srate: 70, expo: 20 },
      pitch: { rcRate: 95, srate: 50, expo: 40 },
      yaw: { rcRate: 120, srate: 30, expo: 0 },
    },
    ACTUAL: {
      roll: { rcRate: 7, srate: 67, expo: 0 },
      pitch: { rcRate: 12, srate: 90, expo: 35 },
      yaw: { rcRate: 5, srate: 45, expo: 20 },
    },
    QUICK: {
      roll: { rcRate: 100, srate: 67, expo: 10 },
      pitch: { rcRate: 80, srate: 120, expo: 40 },
      yaw: { rcRate: 60, srate: 50, expo: 0 },
    },
  };
  /* Tenths of a deg/s, the same bar gates.config.json P2 holds the four
   * types it covers to. The drawing is f64 and the firmware f32, so the
   * error is arithmetic and not a difference in the curve. */
  const TOL = 0.1;
  let worst = 0;
  let worstAt = '';
  let ok = true;
  for (const type of RATE_TYPES) {
    const profile = normaliseRates({ ...PROFILES[type], type });
    /* Through the same composeConfig the shell inits from, so this proves
     * the CLI the menu writes as well as the curve it draws. Smoothing off,
     * because getSetpointRate is the smoothed setpoint and the drawing is
     * of the raw one. */
    const text = withLine(composeConfig(defaultDiff, profile, RATES_KEEP), 'set rc_smoothing = OFF');
    const sim = await newSim();
    must(sim.init(text), `sim_init ${type}`);
    const dbg = sim.e.sim_bf_debug;
    const gotType = moduleGet(sim, 'rates_type');
    if (gotType !== type) {
      ok = false;
      worstAt = `${type} did not reach the module (${gotType})`;
      continue;
    }
    let tMs = 0;
    for (let k = -20; k <= 20; k += 1) {
      const x = k / 20;
      const rollStick = x;
      const pitchStick = 0.7 * x;
      const yawStick = -0.4 * x;
      /* Held for a few milliseconds rather than stepped straight past. The
       * setpoint the module reports is read after the RC frame carrying
       * this stick position has been consumed, and the sweep is not a ramp:
       * the first sample alone is a jump from centre to the stop. */
      must(sim.input(tMs / 1000, rollStick, pitchStick, yawStick, 0.3), 'sim_input');
      must(sim.step(8), 'sim_step');
      tMs += 8;
      const axes = [
        ['roll', 5, rollStick],
        /* bf_glue.c: rcData[PITCH] = 1500 - 500 * pitch. */
        ['pitch', 8, -pitchStick],
        /* rc.c updateRcCommands: rcCommand[YAW] carries -GET_DIRECTION. */
        ['yaw', 0, -yawStick],
      ];
      for (const [axis, slot, stick] of axes) {
        const want = angleRateDeg(type, { ...profile[axis], limit: 1998 }, stick);
        const err = Math.abs(dbg(slot) - want);
        if (err > worst) {
          worst = err;
          worstAt = `${type} ${axis} stick ${stick.toFixed(2)} module ${dbg(slot).toFixed(3)} preview ${want.toFixed(3)}`;
        }
        if (err > TOL) {
          ok = false;
        }
      }
    }
  }
  record(
    'F15 preview matches the module on all five rate types',
    ok,
    `worst |err| ${worst.toFixed(4)} deg/s at ${worstAt}`,
  );
}

/*
 * F16: every line the menu writes is a line Betaflight recognises.
 *
 * sim_bf_debug(15) counts keys the module could not place. A rate profile
 * that spells one of its keys the way the STRUCT spells it rather than the
 * way the CLI does would land here as an unknown and change nothing, and
 * nothing else in this file would notice: the curve checks above would still
 * pass, because they would be comparing two profiles that both quietly
 * missed the same field. That is not hypothetical. scripts/gates.js has been
 * writing `set rc_smoothing_mode = 0` for exactly that reason, and P2 was red
 * because of it.
 *
 * The throttle cap is set to something other than off so that both of its
 * lines have to land, and every type is checked because ratesDiff writes the
 * same key list for all five.
 */
{
  let ok = true;
  const detail = [];
  for (const type of RATE_TYPES) {
    const profile = normaliseRates({ type, throttleCap: 60 });
    const sim = await newSim();
    must(sim.init(composeConfig(defaultDiff, profile, RATES_KEEP)), `sim_init ${type}`);
    const unknown = sim.e.sim_bf_debug(15);
    const quick = moduleGet(sim, 'quickrates_rc_expo');
    const limit = `${moduleGet(sim, 'throttle_limit_type')} ${moduleGet(sim, 'throttle_limit_percent')}`;
    if (unknown !== 0 || quick !== 'OFF' || limit !== 'SCALE 60') {
      ok = false;
      detail.push(`${type} unknown=${unknown} quickrates=${quick} limit=${limit}`);
    }
  }
  record(
    'F16 every key the rates menu writes is recognised',
    ok,
    ok ? 'unknown 0, quickrates_rc_expo OFF, throttle limit SCALE 60, on all five types' : detail.join('; '),
  );
}

{
  const actualMax = angleRateDeg('ACTUAL', { rcRate: 10, srate: 50, expo: 0, limit: 1998 }, 1);
  record(
    'F14 Actual preview max vel is srate times 10',
    Math.round(actualMax) === 500,
    `max vel ${actualMax}`,
  );
  const origin = angleRateDeg('ACTUAL', { rcRate: 10, srate: 50, expo: 0, limit: 1998 }, 0);
  record(
    'F14 Actual preview is zero at centre stick',
    origin === 0,
    `centre stick ${origin}`,
  );
}

{
  const src = [
    'set p_roll = 45',
    'set simplified_d_gain = 70',
    '',
  ].join('\n');
  const slid = setCliValue(src, 'simplified_d_gain', '90');
  const applyLast = slid.trim().endsWith('simplified_tuning apply');
  const applyCount = (slid.match(/simplified_tuning apply/g) || []).length;
  record(
    'F10 setCliValue slider inserts apply last',
    applyLast && applyCount === 1 && /set simplified_d_gain = 90/.test(slid),
    applyLast ? 'apply is last line' : slid,
  );
  const expert = setCliValue(slid, 'p_roll', '80');
  const lines = expert.trim().split('\n');
  const applyAt = lines.indexOf('simplified_tuning apply');
  const pAt = lines.findIndex((l) => l.startsWith('set p_roll ='));
  record(
    'F10 setCliValue expert sits below apply',
    applyAt >= 0 && pAt > applyAt && lines[pAt] === 'set p_roll = 80',
    `apply@${applyAt} p_roll@${pAt}`,
  );
}

{
  const src = [
    'set rpm_filter_weights_1 = 100',
    'set rpm_filter_weights_2 = 50',
    'set rpm_filter_weights_3 = 0',
    'set p_roll = 45',
    '',
  ].join('\n');
  const out = exportCli(src);
  record(
    'F12 exportCli rewrites rpm_filter_weights',
    /set rpm_filter_weights = 100,50,0/.test(out)
      && !/rpm_filter_weights_1/.test(out)
      && !/rpm_filter_weights_2/.test(out)
      && !/rpm_filter_weights_3/.test(out),
    out.trim().split('\n').join(' | '),
  );
  const expanded = expandRpmWeights(out);
  record(
    'F12 expandRpmWeights restores _1 _2 _3',
    /set rpm_filter_weights_1 = 100/.test(expanded)
      && /set rpm_filter_weights_2 = 50/.test(expanded)
      && /set rpm_filter_weights_3 = 0/.test(expanded)
      && !/set rpm_filter_weights =/.test(expanded),
    expanded.trim().split('\n').join(' | '),
  );
}

{
  const karateKeep = composeConfig(karateDiff, RATE_DEFAULTS, RATES_KEEP);
  const simKarate = await newSim();
  must(simKarate.init(karateKeep), 'sim_init karate sliders');
  const p0 = moduleGet(simKarate, 'p_roll');
  const dumped = moduleDump(simKarate);
  const edited = setCliValue(dumped, 'simplified_pi_gain', '120');
  const use = composeConfig(edited, RATE_DEFAULTS, RATES_DUMP);
  const simSlid = await newSim();
  must(simSlid.init(use), 'sim_init slider apply');
  const p1 = moduleGet(simSlid, 'p_roll');
  record(
    'F10 Karate slider apply moves p_roll',
    p0 != null && p1 != null && p0 !== p1 && /simplified_tuning apply/.test(edited),
    `p_roll ${p0} -> ${p1} after simplified_pi_gain 120`,
  );
}

{
  record(
    'F8 dumpCarriesRates is false on Karate (no rateprofile)',
    dumpCarriesRates(karateDiff) === false,
    dumpCarriesRates(karateDiff) ? 'carries rates' : 'no rate keys',
  );
  const withRates = withLine(karateDiff, 'set roll_srate = 42');
  record(
    'F8 dumpCarriesRates is true when a dump has roll_srate',
    dumpCarriesRates(withRates) === true,
    'roll_srate present',
  );
}

{
  const off = setFeatureLine(base, 'AIRMODE', false);
  record(
    'F4 feature line writes feature -AIRMODE',
    featureEnabled(off, 'AIRMODE') === false && /feature -AIRMODE/.test(off),
    featureEnabled(off, 'AIRMODE') == null ? 'unset' : 'off',
  );
}

console.log('fc-trace: LIVE / INERT / GATED / rates against compiled Betaflight\n');
const w = Math.max(...rows.map((r) => r[1].length));
for (const [st, name, detail] of rows) {
  console.log(`${st === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} traces clean`);
process.exit(failed === 0 ? 0 : 1);
