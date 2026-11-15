/*
 * hoverline-check.js: the bug report's throttle line says where the craft
 * the pilot is flying actually hovers, and says 3D mode when it is on.
 *
 * Three tickets of 2026-11-03 to 11-04 describe 3D mode word for word and
 * carried a line that said the opposite:
 *
 *   bug-6f04ebea  "the hoverpoint is ~ at 70% throttle. changes in the
 *                 settings makes no difference", line "hover near 21.7"
 *   bug-e4571129  "the throttle half way and the quad not taking off ... if
 *                 i drop the throttle to zero the drone motors spins and
 *                 drags the drone downward", line "hover near 35.0"
 *   bug-9c9d953e  "if im upside down i will fall to the sky", line "hover
 *                 near 21.7", snapshot inverted at 29.4 m/s, 143 m up
 *
 * In 3D mode the middle of the stick is no thrust and the bottom is full
 * reverse, so hover is above the middle and an inverted craft at the bottom
 * of the stick is driven at the sky. The report's throttle line quoted the
 * normal mode table whatever the mode, and nothing else in the report named
 * 3D, so a reader could not tell. The same line also quoted the straight
 * curve's hover beside a thr_expo that moves it.
 *
 * What is checked, flown through dist/sim.wasm on the shell's own config
 * (configs/betaflight-default.diff composed with the menu's rates by
 * composeConfig, the airframe's plant, the Weight's gravity, the stock Air
 * grip and Motor power, a 4.2 V cell):
 *
 *   - normal mode: the measured hover stick agrees with hoverStickPercent to
 *     within a point, at Weight 60 and 100 and at Motor power 120 (the
 *     tickets' own 21.7), so the number the line quotes is the one flown;
 *   - 3D mode: the same craft hovers above 60 percent of stick, so a normal
 *     mode figure on a 3D report is out by thirty points or more;
 *   - inverted at the bottom of the stick, normal mode only ever falls, and
 *     3D mode climbs at over 20 m/s: "fall to the sky" is 3D, and normal
 *     mode never moves an inverted craft upward;
 *   - mid 50, expo 40, cap 80 (bug-97aa6ae3's own curve) hovers more than
 *     three points from the straight curve's figure;
 *   - the line: on with 3D it says so and quotes no hover number; with expo
 *     it names the straight curve; stock it is unchanged, character for
 *     character, so every older report still reads the same;
 *   - the bug held in place: the line as it was written, restated here,
 *     quotes "hover near 35.0" on a 3D report, so the line checks can fail;
 *   - src/ui/ui.js hands the report's line the pilot's 3D setting.
 *
 * Node only, no browser, a few seconds.
 *
 * Usage:
 *   npm run check:hoverline
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

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { composeConfig, RATES_KEEP } from '../src/fc/dump.js';
import {
  RATE_DEFAULTS, hoverStickPercent, normaliseRates, throttleSummary,
} from '../configs/rates.js';
/* A namespace beside it, so a tree without packRestVolts fails the lines
 * that need it and not the whole run. */
import * as ratesAll from '../configs/rates.js';
import { airframeById, simIdFor } from '../configs/airframes.js';
import { airScaleFor, kvScaleFor, tuneDefaultsFor } from '../src/share/tune.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasm = await readFile(join(root, 'dist/sim.wasm'));
const tuneText = await readFile(join(root, 'configs/betaflight-default.diff'), 'utf8');

/* State indices, src/native/sim_abi.h. */
const ST = { T: 0, Z: 3, VZ: 6 };

const rows = [];
let failed = 0;
function check(name, ok, detail = '') {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

/* gravityScaleFor in src/ui/ui.js, restated so this check does not import
 * the whole shell: the airframe's base times the slider, to three places. */
function gravityScale(weight, af) {
  return Math.round(airframeById(af).gravityBase * (weight / 100) * 1000) / 1000;
}

/* A module as the shell seats it: the plant, the composed config, then the
 * Weight, Air grip and Motor power the run pushes, and a fresh 4.2 V cell. */
/* sim_internal.h: the mask the shell flies where the pack does not run
 * down, and the one it flies in solo freestyle, where it does. */
const REAL = 239;
const REAL_DRAINS = 255;

async function seat({ af = '5inch', weight = 100, rates = RATE_DEFAULTS, kv, d3 = false, real = 0, cell = 4.2 }) {
  const sim = await loadSim(wasm);
  if (sim.e.sim_set_airframe(simIdFor(af)) !== SIM_OK) {
    throw new Error('sim_set_airframe');
  }
  if (d3 && sim.e.sim_set_3d(1) !== SIM_OK) {
    throw new Error('sim_set_3d');
  }
  if (sim.init(composeConfig(tuneText, rates, RATES_KEEP, '')) !== SIM_OK) {
    throw new Error('sim_init');
  }
  /* Realistic physics as the shell flies it: the module's mask, and one
   * real g times the slider in place of the airframe's heavier world
   * (gravityScaleFor in src/ui/ui.js). */
  if (real && sim.e.sim_set_realism(real) !== SIM_OK) {
    throw new Error('sim_set_realism');
  }
  if (sim.e.sim_set_gravity(real ? weight / 100 : gravityScale(weight, af)) !== SIM_OK) {
    throw new Error('sim_set_gravity');
  }
  const stock = tuneDefaultsFor(af);
  sim.e.sim_set_air(airScaleFor(stock.airGrip));
  sim.e.sim_set_motor_kv(kvScaleFor(kv ?? stock.motorKv));
  sim.reset();
  sim.setCellVoltage(cell);
  return sim;
}

function hold(sim, ms, throttle, onStep) {
  let t = sim.readState().state[ST.T];
  for (let i = 0; i < ms; i += 1) {
    t += 0.001;
    sim.input(t, 0, 0, 0, throttle);
    sim.step(1);
    if (onStep) {
      onStep(sim.readState().state);
    }
  }
  return sim.readState().state;
}

/* Whether this stick climbs: high in clear air (the module's ground is off
 * until a host raises it), held long enough for the motors and the pack to
 * settle, then stopped dead and watched. Starting from rest is what makes
 * the sign honest: a craft still coasting from a spin up or a climb would
 * read as above hover when it is not. */
async function climbs(o, stick) {
  const sim = await seat(o);
  sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0);
  hold(sim, 1500, stick);
  sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0);
  sim.rest();
  const a = hold(sim, 10, stick)[ST.Z];
  const b = hold(sim, 1500, stick)[ST.Z];
  return b > a;
}

async function hoverStick(o, lo = 0, hi = 1) {
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    if (await climbs(o, mid)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return ((lo + hi) / 2) * 100;
}

/* Inverted, from rest, high up, the stick held: the fastest climb and the
 * fastest fall over 8 s, world z up. */
async function inverted(o, stick) {
  const sim = await seat(o);
  sim.e.sim_set_pose(0, 0, 500, 0, 1, 0, 0);
  sim.rest();
  let up = -Infinity;
  let down = Infinity;
  hold(sim, 8000, stick, (s) => {
    up = Math.max(up, s[ST.VZ]);
    down = Math.min(down, s[ST.VZ]);
  });
  return { up, down };
}

/* Normal mode: the line's number is the hover flown. */
const NORMAL = [
  { name: 'five inch, Weight 100', af: '5inch', weight: 100 },
  { name: 'five inch, Weight 60', af: '5inch', weight: 60 },
  { name: 'five inch, Weight 60, Motor power 120 (the tickets\' 21.7)', af: '5inch', weight: 60, kv: 120 },
  { name: 'whoop, Weight 100 (bug-e4571129)', af: 'whoop65', weight: 100 },
];
const measured = {};
for (const c of NORMAL) {
  const got = await hoverStick(c);
  const table = hoverStickPercent(100, c.af, c.weight, 4.2, c.kv ?? 100);
  measured[c.name] = got;
  check(`normal mode, ${c.name}: hover flown within a point of the line's figure`,
    Math.abs(got - table) <= 1, `flown ${got.toFixed(1)}, line ${table.toFixed(1)}`);
}

/* 3D mode: hover is above the middle, far from any normal mode figure. */
/*
 * REALISTIC PHYSICS, the five inch's default since 2026-11-14, and the
 * keyboard flies on this number: its throttle springs to it (syncKeyHover in
 * src/main.js). The first cut read the classic table at the slider over the
 * airframe's base, and that table's light end is 0.972 g, so every
 * realistic weight under 97 read one figure and a light quad climbed at the
 * keys' rest: 3.4 m/s after three seconds at Weight 75. Held here to the
 * module at both ends of the slider and between its columns, on a tired
 * pack, at both Motor power stops, and under a cap.
 */
const REALISTIC = [
  { name: 'Weight 100', weight: 100 },
  { name: 'Weight 60', weight: 60 },
  { name: 'Weight 75', weight: 75 },
  { name: 'Weight 85', weight: 85 },
  { name: 'Weight 125', weight: 125 },
  { name: 'Weight 140', weight: 140 },
  { name: 'Weight 100 from 3.8 V a cell', weight: 100, cell: 3.8 },
  { name: 'Weight 75 from 3.5 V a cell', weight: 75, cell: 3.5 },
  { name: 'Weight 85, Motor power 120', weight: 85, kv: 120 },
  { name: 'Weight 115, Motor power 80', weight: 115, kv: 80 },
  { name: 'Weight 90, Motor power 110', weight: 90, kv: 110 },
  { name: 'Weight 100 under a cap of 75', weight: 100, cap: 75 },
  { name: 'the whoop with the switch on, Weight 100', af: 'whoop65', weight: 100 },
];
for (const c of REALISTIC) {
  const af = c.af ?? '5inch';
  const cap = c.cap ?? 100;
  const rates = cap === 100 ? RATE_DEFAULTS : { ...RATE_DEFAULTS, throttleCap: cap };
  const kv = c.kv ?? tuneDefaultsFor(af).motorKv;
  const got = await hoverStick({ af, weight: c.weight, kv, cell: c.cell ?? 4.2, rates, real: REAL });
  const table = hoverStickPercent(cap, af, c.weight, c.cell ?? 4.2, kv, true);
  check(`Realistic physics, ${c.name}: hover flown within a point of the figure the keys rest at`,
    Math.abs(got - table) <= 1, `flown ${got.toFixed(1)}, keys ${table.toFixed(1)}`);
  if (c.weight === 75 && !c.cell) {
    /* The bug held in place: the first cut's reading, restated. */
    const was = hoverStickPercent(cap, af, c.weight / airframeById(af).gravityBase, 4.2, kv);
    check('the first cut\'s figure at Weight 75, the classic table at the slider over the base, is over three points high (the bug held)',
      was - got > 3, `flown ${got.toFixed(1)}, first cut ${was.toFixed(1)}`);
  }
}
check('Realistic physics off is every figure as it was: the stock line and the table\'s own 35.0',
  hoverStickPercent(100, '5inch', 100, 4.2, 100, false) === 35 && hoverStickPercent(100, '5inch', 100, 4.2, 100) === 35
    && hoverStickPercent(100, '5inch', 60, 4.2, 120, false) === hoverStickPercent(100, '5inch', 60, 4.2, 120),
  String(hoverStickPercent(100, '5inch', 100, 4.2, 100, false)));

/*
 * AND AS THE PACK RUNS DOWN, which it does in solo freestyle with the switch
 * on. Hover climbs the stick with it, so the shell follows the charge used
 * (packRestVolts, and packUsedAh in src/main.js). One pack flown from full
 * in Angle mode on a height hold, and where the hold's throttle settles is
 * hover: held against the figure the keys would be given at that charge.
 */
{
  const sim = await seat({ af: '5inch', weight: 100, real: REAL_DRAINS });
  sim.setAngleMode(true);
  sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0);
  sim.rest();
  const marks = [0.3, 0.6, 0.9, 1.15];
  let t = 0;
  let integ = 0;
  let thr = 0.27;
  let sum = 0;
  let n = 0;
  let st = sim.readState().state;
  const rest = typeof ratesAll.packRestVolts === 'function' ? ratesAll.packRestVolts : null;
  for (let step = 0; marks.length > 0 && step < 1500000; step += 1) {
    if (step % 4 === 0) {
      st = sim.readState().state;
      const e = 50 - st[ST.Z];
      integ = Math.max(-0.5, Math.min(0.5, integ + e * 0.004 * 0.4));
      thr = Math.max(0, Math.min(1, 0.27 + 0.15 * e - 0.1 * st[ST.VZ] + integ));
      t += 0.004;
      sim.input(t, 0, 0, 0, thr);
    }
    sim.step(1);
    const used = sim.e.sim_bf_debug(74);
    /* The last two hundredths of an amp hour before each mark, averaged. */
    if (used >= marks[0] - 0.02) {
      sum += thr;
      n += 1;
    }
    if (used >= marks[0]) {
      const flown = (sum / n) * 100;
      const at = marks.shift();
      const keys = rest ? hoverStickPercent(100, '5inch', 100, rest(4.2, at - 0.01), 100, true) : NaN;
      const fresh = hoverStickPercent(100, '5inch', 100, 4.2, 100, true);
      check(`Realistic physics, the pack ${at.toFixed(2)} Ah down: hover flown within a point of the figure the keys are moved to`,
        Math.abs(flown - keys) <= 1, `flown ${flown.toFixed(1)}, keys ${Number.isFinite(keys) ? keys.toFixed(1) : 'no packRestVolts'}, a fresh pack's ${fresh.toFixed(1)}`);
      sum = 0;
      n = 0;
    }
  }
  check('the pack ran down as far as the last mark', marks.length === 0, `${marks.length} marks not reached`);
  check('a pack with nothing used rests at the charge it started on, to the bit',
    rest !== null && rest(4.2, 0) === 4.2 && rest(3.8, 0) === 3.8 && rest(3.5, 0) === 3.5, rest ? String(rest(3.8, 0)) : 'no packRestVolts');
}

/* The shell flies the keys on the model and the pack the run has. */
{
  const main = readFileSync(join(root, 'src/main.js'), 'utf8');
  const at = main.indexOf('input.setKeyHover(hoverStickPercent(');
  const call = at < 0 ? '' : main.slice(at, main.indexOf(';', at) + 1).replace(/\s+/g, ' ');
  check('src/main.js reads the keys\' hover at the run\'s weight, on the model flown and the pack as it stands',
    /runAirframe, runWeight, hoverVolts\(\), runMotorKv, runReal !== 0/.test(call), call.slice(0, 170));
  const uiSrc = readFileSync(join(root, 'src/ui/ui.js'), 'utf8');
  const rep = uiSrc.indexOf('throttle: throttleSummary(');
  const repCall = rep < 0 ? '' : uiSrc.slice(rep, uiSrc.indexOf('),', uiSrc.indexOf('MOTOR_KV_STOCK', rep)) + 1).replace(/\s+/g, ' ');
  check('src/ui/ui.js hands the report\'s throttle line the model flown',
    /s\.mode3d === true, real, \)/.test(repCall), repCall.slice(-60));
}

const D3 = [
  { name: 'five inch, Weight 100', af: '5inch', weight: 100 },
  { name: 'five inch, Weight 60, Motor power 120', af: '5inch', weight: 60, kv: 120 },
];
for (const c of D3) {
  const got = await hoverStick({ ...c, d3: true }, 0.5, 1);
  const table = hoverStickPercent(100, c.af, c.weight, 4.2, c.kv ?? 100);
  check(`3D mode, ${c.name}: hovers above 60 percent of stick, 30 points or more over the normal figure`,
    got > 60 && got - table >= 30, `flown ${got.toFixed(1)}, normal ${table.toFixed(1)}`);
}

/* Inverted at the bottom of the stick. */
for (const c of [
  { name: 'five inch, Weight 60, Motor power 120 (bug-6f04ebea)', af: '5inch', weight: 60, kv: 120 },
  { name: 'whoop, Weight 60', af: 'whoop65', weight: 60 },
]) {
  const normal = await inverted(c, 0);
  check(`normal mode, ${c.name}, inverted at the bottom of the stick: only ever falls`,
    normal.up <= 0.05 && normal.down < -15, `fastest up ${normal.up.toFixed(2)}, fastest down ${normal.down.toFixed(1)} m/s`);
  const three = await inverted({ ...c, d3: true }, 0);
  check(`3D mode, ${c.name}, inverted at the bottom of the stick: climbs at the sky`,
    three.up > 20, `fastest up ${three.up.toFixed(1)} m/s`);
}

/* The expo moves hover off the straight curve's figure. */
const EXPO = { ...RATE_DEFAULTS, type: 'BETAFLIGHT', throttleCap: 80, thrMid: 50, thrExpo: 40 };
{
  const got = await hoverStick({ af: '5inch', weight: 100, rates: EXPO });
  const table = hoverStickPercent(80, '5inch', 100, 4.2, 100);
  check('cap 80, mid 50, expo 40 (bug-97aa6ae3): hover flown more than three points off the straight figure',
    Math.abs(got - table) > 3, `flown ${got.toFixed(1)}, straight ${table.toFixed(1)}`);
}

/* The line. */
{
  const on = throttleSummary(RATE_DEFAULTS, 'whoop65', 100, 4.2, 100, true);
  check('3D on: the line says 3D mode', /3D mode on/.test(on), on);
  check('3D on: the line quotes no normal mode hover', !/hover near/.test(on), on);
  const stock = throttleSummary(RATE_DEFAULTS, 'whoop65', 100, 4.2, 100);
  check('3D off, stock: the line is unchanged, character for character',
    stock === 'cap 100, no expo, hover near 35.0 percent of stick', stock);
  const off = throttleSummary(RATE_DEFAULTS, 'whoop65', 100, 4.2, 100, false);
  check('3D off said outright is the same line', off === stock, off);
  const expo = throttleSummary(EXPO, '5inch', 100, 4.2, 100);
  check('expo: the line names the straight curve its figure is for',
    /mid 50 expo 40/.test(expo) && /on a straight curve, before the expo/.test(expo), expo);
  const p = normaliseRates({ ...RATE_DEFAULTS, thrMid: 30 });
  const mid = throttleSummary(p, '5inch', 100, 4.2, 100);
  check('a mid with no expo is a straight line and reads as one', mid === stock, mid);
}

/* The bug held in place: the line as it was before this check, restated. */
function oldLine(r, airframe, weight, cellV, motorKv) {
  const p = normaliseRates(r);
  const hover = hoverStickPercent(p.throttleCap, airframe, weight, cellV, motorKv);
  const curve = p.thrExpo > 0 ? `, mid ${p.thrMid} expo ${p.thrExpo}` : ', no expo';
  return `cap ${p.throttleCap}${curve}, hover near ${hover.toFixed(1)} percent of stick`;
}
{
  const was = oldLine(RATE_DEFAULTS, 'whoop65', 100, 4.2, 100);
  check('the old line on bug-e4571129\'s settings quotes a hover 3D mode does not fly (the bug held)',
    /hover near 35\.0/.test(was) && !/3D/.test(was), was);
}

/* The report hands the line the pilot's 3D setting. */
{
  const ui = readFileSync(join(root, 'src/ui/ui.js'), 'utf8');
  const at = ui.indexOf('throttle: throttleSummary(');
  const call = at < 0 ? '' : ui.slice(at, ui.indexOf(')', ui.indexOf('MOTOR_KV_STOCK', at)) + 1);
  check('src/ui/ui.js passes s.mode3d to the report\'s throttle line',
    /s\.mode3d === true/.test(call), call.replace(/\s+/g, ' ').slice(0, 160));
}

const w = Math.max(...rows.map((r) => r[0].length));
console.log('hoverline-check: the report\'s throttle line says the hover the craft flies\n');
for (const [name, status, detail] of rows) {
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} checks clean`);
process.exit(failed === 0 ? 0 : 1);
