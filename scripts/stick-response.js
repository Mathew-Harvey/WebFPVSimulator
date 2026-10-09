/*
 * stick-response.js: how fast the quad follows the stick, and how cleanly
 * it stops when the stick comes back, flown through the real module, for
 * the shipped tune beside Betaflight's factory tune, the radio link,
 * Betaflight's RC smoothing and the PIDs screen's own sliders.
 *
 * WHY THIS EXISTS. Plan item P3.3 (prompts/input-lag-review-2026-09-27.md)
 * put the shell's RC grid (RC_HZ, 250 Hz, in src/main.js) and Betaflight's
 * RC smoothing to the owner, and on 2026-09-28 the owner answered: whatever
 * will deliver a more locked in feeling; it feels a little mushy and could
 * do with a little more authority. Doubling the link rate sounds like that
 * answer, so this asks the module instead of the intuition, and the module
 * said otherwise: see PROGRESS.md, the entry for P3.3.
 *
 * Later that day the owner took the answer the module gave, feedforward, a
 * little, on the default tune, and asked for the bounce back after a stop to
 * be fixed. That moved configs/betaflight-default.diff off Betaflight's
 * factory values, so the factory tune is flown beside it here: a difference
 * measured on every run is one nobody has to remember. The stop table is the
 * bounce back. PROGRESS.md has the entry, under the same date.
 *
 * WHAT IT FLIES. The five inch as a pilot meets it: the shipped default
 * tune, the shipped default rates, the airframe's own weight (gravityBase
 * in configs/airframes.js, 1.62 g), a charged pack, at the hover stick
 * configs/rates.js quotes. The stick reaches the module the way the shell
 * sends it on the perfect link: each RC slot takes the newest pad sample at
 * or before it. The pad is the part a page does not choose. A browser
 * refreshes a radio's axes on its own clock, and the open feel reports on
 * the board on 2026-09-28 said 125 to 242 Hz for radios on Chrome and Edge
 * (stick.flight.padHzMax). So a pad here is a rate, off the RC grid by a
 * fixed phase, with a fixed pattern of jitter; 1 kHz is a source no browser
 * offers today, kept as the ideal.
 *
 * THE FACTORY ROW IS READ FROM THE MODULE, NOT TYPED HERE. A module given no
 * config at all holds Betaflight's own reset values, so every key the
 * shipped tune sets to something else is found by asking both, printed at
 * the top of the run, and put back for the factory row. motor_kv is one of
 * them and moves nothing, because the plant's motor is plant.c's.
 *
 * WHAT IT MEASURES.
 *   flick  the stick from centre to full in 40 ms, a fast thumb: the ms the
 *          roll rate takes to reach 10, 50 and 90 percent of where it
 *          settles, and its overshoot
 *   lag    a 2 Hz stick sine at 30 percent, held for eight seconds: how far
 *          the roll rate trails the stick, from the phase of the
 *          fundamental. A rate curve is odd and has no memory, so it shifts
 *          no phase: all of this is the link, the controller and the craft
 *   rough  the RMS of the rate's second difference over the sine, in deg/s
 *          per ms squared: what a staircase of pad samples does to the rate
 *   stop   the stick held at full, three quarters or half on one axis for
 *          one whole turn, then back to centre in 25 ms, the way a thumb
 *          lets go at the end of a flip. `back` is
 *          the degrees the craft turns back from the furthest it got, which
 *          is the bounce back, with the fastest it turns back in deg/s;
 *          `carry` is the degrees it runs on after the stick is centred;
 *          `settle` is the ms until the rate stays under 10 deg/s. Each is
 *          the mean of six releases a millisecond apart, because at a pad
 *          slower than the RC grid one release is one draw of where the
 *          last pad sample fell. Flown in both flight styles: Expert is the
 *          model pilots fly, and Arcade is the same controller with the
 *          plant's propwash turbulence off. A slow roll at hover throttle
 *          ends falling at 17 m/s through its own wash, and in Expert that
 *          turbulence, the same on every tune, reads as degrees coming back
 *          and a second of settling that no tune can remove; Arcade shows
 *          what the controller alone hands back.
 *
 * No clock and no random, so a run is the same every time. The stick is
 * computed here and not in the module, so the sine uses Math.sin: that is
 * the pilot, not the physics path CLAUDE.md's rule is about.
 *
 * Usage:
 *   npm run feel:response
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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { composeConfig, moduleGet } from '../src/fc/dump.js';
import { RATE_DEFAULTS, hoverStickPercent } from '../configs/rates.js';
import { pidsDiffFor } from '../configs/pids.js';
import { airframeById } from '../configs/airframes.js';
import { angleRateDeg } from '../src/fc/ratescurve.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = await readFile(join(root, 'dist/sim.wasm'));
const TUNE_ID = 'betaflight-default';
const tune = await readFile(join(root, 'configs', `${TUNE_ID}.diff`), 'utf8');

const CELL_V = 4.2;
const GRAVITY = airframeById('5inch').gravityBase;
const HOVER = hoverStickPercent(100, '5inch', 100, CELL_V) / 100;
/* The profile starts here, after a second of level hover. */
const T0 = 1000;
const DEG = 180 / Math.PI;
const AXES = ['roll', 'pitch', 'yaw'];

/* Every key the shipped tune sets away from Betaflight's own reset value,
 * asked of two modules: one given the tune, one given nothing. */
async function departures() {
  const shipped = await loadSim(wasm);
  const factory = await loadSim(wasm);
  if (shipped.init(tune) !== SIM_OK || factory.init('') !== SIM_OK) {
    throw new Error('sim_init refused the shipped tune or an empty config');
  }
  const out = [];
  for (const m of tune.matchAll(/^\s*set\s+(\S+)\s*=/gm)) {
    const ours = moduleGet(shipped, m[1]);
    const theirs = moduleGet(factory, m[1]);
    if (ours !== theirs) {
      out.push({ key: m[1], ours, theirs });
    }
  }
  return out;
}
const DEPARTURES = await departures();

/* The pads: an ideal source, and the rates the reports show, each off the
 * RC grid by its own phase so the grid and the pad beat as they do in a
 * browser. */
const PADS = [
  { name: '1 kHz, the ideal', hz: 1000, phase: 0, jitter: 0 },
  { name: '250 Hz', hz: 250, phase: 1.7, jitter: 0.3 },
  { name: '220 Hz', hz: 220, phase: 1.3, jitter: 0.4 },
  { name: '180 Hz', hz: 180, phase: 0.9, jitter: 0.5 },
];

/* What is compared: Betaflight's factory tune and the one that ships, the
 * plan's two link levers on the shipped tune, and the PIDs screen's sliders
 * a pilot would reach for next. */
const FACTORY = {
  name: 'Betaflight 4.5.1 factory tune',
  rcHz: 250,
  cli: DEPARTURES.map((d) => `set ${d.key} = ${d.theirs}`).join('\n'),
};
const SHIPPED = { name: 'shipped default tune', rcHz: 250 };
const ROWS = [
  FACTORY,
  SHIPPED,
  { name: 'shipped, 500 Hz grid', rcHz: 500 },
  { name: 'shipped, lighter smoothing, auto factor 15', rcHz: 250, cli: 'set rc_smoothing_auto_factor = 15' },
  { name: 'shipped, 500 Hz and lighter smoothing', rcHz: 500, cli: 'set rc_smoothing_auto_factor = 15' },
  { name: 'PIDs screen, Stick response FF 150', rcHz: 250, sliders: { ff: 150 } },
  { name: 'PIDs screen, Master multiplier 115', rcHz: 250, sliders: { master: 115 } },
  { name: 'PIDs screen, Master multiplier 130', rcHz: 250, sliders: { master: 130 } },
];
/* The stops, on the ideal pad and on two the reports show. 180 Hz is in
 * the list because it is where the shipped tune still gives something
 * back: see the tune's header. Three quarters is in the list because it is
 * about as far as the reports' pilots throw yaw (stick.flight.travel, 0.6
 * to 0.73), and it is where yaw's I term used to pin at its cap. */
const STOP_ROWS = [FACTORY, SHIPPED];
const STOP_PADS = [PADS[0], PADS[2], PADS[3]];
const STOP_AMPS = [1, 0.75, 0.5];
const RAMP_MS = 25;
const RELEASES = [0, 1, 2, 3, 4, 5];

/*
 * How long to hold the stick for the setpoint to ask for one whole turn,
 * ramps included, from the rates curve the controller flies. A stop that
 * ends a whole turn ends where a flip, a roll or a spin ends, upright. A
 * fixed hold does not: half a second at three quarters stick is 195
 * degrees of roll, and a craft left inverted and falling for the second
 * after it drifts by degrees that look like a bounce and are not one.
 */
function holdForTurn(axis, amp) {
  const rate = (s) => angleRateDeg(RATE_DEFAULTS.type, RATE_DEFAULTS[AXES[axis]], s);
  let ramp = 0;
  for (let t = 0; t < RAMP_MS; t += 1) {
    ramp += rate((amp * (t + 0.5)) / RAMP_MS) / 1000;
  }
  return Math.round(RAMP_MS + ((360 - 2 * ramp) * 1000) / rate(amp));
}

/* The pad's sample time at or before `t`: k whole periods past its phase,
 * moved by a fixed pattern of jitter. */
function padTime(t, pad) {
  const period = 1000 / pad.hz;
  const at = (k) => k * period + pad.phase + (pad.jitter ? pad.jitter * Math.sin(k * 12.9898) : 0);
  let k = Math.floor((t - pad.phase) / period);
  while (at(k) > t) {
    k -= 1;
  }
  return at(k);
}

/* The stick on one axis, the rest centred; p[i] is that axis's rate i ms
 * after the profile starts. `arcade` is the shell's Arcade flight style,
 * sim_set_flight_style(1): the same controller, with the plant's
 * imperfections, propwash turbulence among them, switched off. */
async function fly(row, pad, stick, ms, axis = 0, arcade = false) {
  const sim = await loadSim(wasm);
  const extra = row.cli ? `\n${row.cli}\n` : '';
  const pids = row.sliders ? pidsDiffFor({ [TUNE_ID]: { sliders: row.sliders } }, TUNE_ID) : '';
  const text = composeConfig(tune.replace(/\nbatch end/, `${extra}\nbatch end`), RATE_DEFAULTS, undefined, pids);
  const code = sim.init(text);
  if (code !== SIM_OK) {
    throw new Error(`${row.name}: sim_init refused the config, ${code}`);
  }
  sim.setCellVoltage(CELL_V);
  if (sim.e.sim_set_gravity(GRAVITY) !== SIM_OK) {
    throw new Error(`sim_set_gravity refused ${GRAVITY}`);
  }
  if (arcade && sim.e.sim_set_flight_style(1) !== SIM_OK) {
    throw new Error('sim_set_flight_style refused arcade');
  }
  const rcMs = 1000 / row.rcHz;
  let nextRc = 0;
  const p = [];
  for (let t = 0; t < T0 + ms; t += 1) {
    while (nextRc < t + 1) {
      const tp = padTime(nextRc, pad);
      const s = tp >= T0 ? stick(tp - T0) : 0;
      sim.input(nextRc / 1000, axis === 0 ? s : 0, axis === 1 ? s : 0, axis === 2 ? s : 0, HOVER);
      nextRc += rcMs;
    }
    sim.step(1);
    if (t + 1 >= T0) {
      p.push(sim.readState().state[11 + axis] * DEG);
    }
  }
  return p;
}

function flickStats(p) {
  let fin = 0;
  const tail = p.slice(1200);
  for (const v of tail) {
    fin += v;
  }
  fin /= tail.length;
  const at = (f) => p.findIndex((v) => v >= f * fin);
  const peak = Math.max(...p);
  return { t10: at(0.1), t50: at(0.5), t90: at(0.9), over: (peak / fin - 1) * 100 };
}

function sineStats(p, f, from) {
  const period = 1000 / f;
  const n = Math.floor((p.length - from) / period) * period;
  let sr = 0;
  let si = 0;
  let pr = 0;
  let pi = 0;
  let rough = 0;
  for (let i = 0; i < n; i += 1) {
    const w = (2 * Math.PI * f * (from + i)) / 1000;
    const s = Math.sin(w);
    const v = p[from + i];
    sr += s * Math.cos(w);
    si += s * Math.sin(w);
    pr += v * Math.cos(w);
    pi += v * Math.sin(w);
    if (i >= 2) {
      const d2 = v - 2 * p[from + i - 1] + p[from + i - 2];
      rough += d2 * d2;
    }
  }
  let d = Math.atan2(pi, pr) - Math.atan2(si, sr);
  while (d < 0) {
    d += 2 * Math.PI;
  }
  while (d >= 2 * Math.PI) {
    d -= 2 * Math.PI;
  }
  /* For a rate G sin(w (t - lag)) against a stick sin(w t), the rate's
   * fundamental sits w lag further round than the stick's, so d over a
   * whole turn is the lag over a whole period. */
  return { lag: (d / (2 * Math.PI)) * period, rough: Math.sqrt(rough / n) };
}

/* One release. `centred` is the index at which the stick reaches centre.
 * Angles are the rate integrated in the direction of the move, which on a
 * single axis stop is the attitude change to well under a degree. */
function stopStats(p, centred) {
  const sign = Math.sign(p[centred - 30]) || 1;
  const ang = [];
  let a = 0;
  for (const v of p) {
    a += (v * sign) / 1000;
    ang.push(a);
  }
  let peak = -Infinity;
  let backRate = 0;
  for (let i = centred; i < p.length; i += 1) {
    peak = Math.max(peak, ang[i]);
    backRate = Math.max(backRate, -p[i] * sign);
  }
  let settle = p.length - 1;
  while (settle > centred && Math.abs(p[settle]) < 10) {
    settle -= 1;
  }
  return {
    back: peak - ang[ang.length - 1], backRate, carry: peak - ang[centred], settle: settle - centred,
  };
}

async function stop(row, pad, axis, amp, arcade) {
  const mean = { back: 0, backRate: 0, carry: 0, settle: 0 };
  for (const r of RELEASES) {
    const hold = holdForTurn(axis, amp) + r;
    const stick = (t) => {
      if (t < RAMP_MS) {
        return (amp * t) / RAMP_MS;
      }
      if (t < hold) {
        return amp;
      }
      return t < hold + RAMP_MS ? amp * (1 - (t - hold) / RAMP_MS) : 0;
    };
    const s = stopStats(await fly(row, pad, stick, hold + RAMP_MS + 1500, axis, arcade), hold + RAMP_MS);
    for (const k of Object.keys(mean)) {
      mean[k] += s[k] / RELEASES.length;
    }
  }
  return mean;
}

const cell = (s, w) => String(s).padStart(w);
console.log(`stick-response: the five inch at ${GRAVITY} g, ${CELL_V} V a cell, hover stick ${(HOVER * 100).toFixed(1)} percent, `
  + 'the shipped default rates, the perfect link');
console.log('\nthe shipped tune against Betaflight 4.5.1, read from the module');
for (const d of DEPARTURES) {
  console.log(`  ${d.key.padEnd(30)} ${cell(d.ours, 5)}   factory ${d.theirs}`);
}
console.log('\nflick: centre to full stick in 40 ms, ms to 10, 50 and 90 percent of the settled rate; lag: behind a 2 Hz sine');
for (const pad of PADS) {
  console.log(`\npad ${pad.name}`);
  console.log(`  ${''.padEnd(42)} ${cell('t10', 4)} ${cell('t50', 4)} ${cell('t90', 4)} ${cell('over', 6)} ${cell('lag ms', 7)} ${cell('rough', 6)}`);
  for (const row of ROWS) {
    const flick = flickStats(await fly(row, pad, (t) => (t >= 40 ? 1 : t / 40), 1500));
    const sine = sineStats(await fly(row, pad, (t) => 0.3 * Math.sin((2 * Math.PI * 2 * t) / 1000), 9000), 2, 1000);
    console.log(`  ${row.name.padEnd(42)} ${cell(flick.t10, 4)} ${cell(flick.t50, 4)} ${cell(flick.t90, 4)} `
      + `${cell(`${flick.over.toFixed(1)}%`, 6)} ${cell(sine.lag.toFixed(1), 7)} ${cell(sine.rough.toFixed(3), 6)}`);
  }
}

console.log(`\nstop: the stick held for one whole turn, then centred in ${RAMP_MS} ms; back is the bounce back in degrees, with its fastest deg/s,`);
console.log('carry the degrees run on past the centred stick, settle the ms to stay under 10 deg/s; mean of six releases');
for (const [pad, arcade] of STOP_PADS.flatMap((p) => [[p, false], [p, true]])) {
  console.log(`\npad ${pad.name}, ${arcade ? 'Arcade: no propwash turbulence, so what comes back is the controller' : 'Expert, the model pilots fly'}`);
  console.log(`  ${''.padEnd(12)} ${STOP_ROWS.map((r) => r.name.padEnd(40)).join(' ')}`);
  for (let axis = 0; axis < AXES.length; axis += 1) {
    for (const amp of STOP_AMPS) {
      const cells = [];
      for (const row of STOP_ROWS) {
        const s = await stop(row, pad, axis, amp, arcade);
        cells.push(`back ${s.back.toFixed(2)} (${s.backRate.toFixed(0)}/s), carry ${s.carry.toFixed(1)}, ${s.settle.toFixed(0)} ms`.padEnd(40));
      }
      console.log(`  ${`${AXES[axis]}, ${amp * 100}%`.padEnd(12)} ${cells.join(' ')}`);
    }
  }
}
