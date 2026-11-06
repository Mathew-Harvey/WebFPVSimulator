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
async function seat({ af = '5inch', weight = 100, rates = RATE_DEFAULTS, kv, d3 = false }) {
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
  if (sim.e.sim_set_gravity(gravityScale(weight, af)) !== SIM_OK) {
    throw new Error('sim_set_gravity');
  }
  const stock = tuneDefaultsFor(af);
  sim.e.sim_set_air(airScaleFor(stock.airGrip));
  sim.e.sim_set_motor_kv(kvScaleFor(kv ?? stock.motorKv));
  sim.reset();
  sim.setCellVoltage(4.2);
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
