/*
 * step-time.js: what one physics step costs the CPU, in Node, as a ratio.
 *
 * WHY THIS EXISTS. The project's first rule is latency: stick to screen
 * delay, and the physics step is on that path sixteen or so times a frame.
 * A change to the plant has to say what it did to that cost, and "about
 * zero" is not a measurement. This flies the same scripted eight seconds
 * the plant golden flies, at the weight and Air grip the shell ships,
 * through whichever module it is pointed at, and times sim_step.
 *
 * WHAT THE NUMBER IS AND IS NOT. It is CPU time per 1 ms step inside V8 on
 * whatever machine ran it, so two runs on one machine compare and a run
 * here does not compare with a pilot's laptop. Read it as a ratio between
 * two modules or two settings, measured back to back. The sticks and the
 * state reads are outside the timed region; only sim_step is inside it.
 * The shell's own Input to screen reading on a real machine is the final
 * check and this does not replace it.
 *
 * Usage:
 *   node scripts/step-time.js                     dist/sim.wasm, switch off
 *   node scripts/step-time.js --real=127          with the Realistic mask
 *   node scripts/step-time.js --wasm=/tmp/a.wasm  another module
 *   node scripts/step-time.js --compare=/tmp/base.wasm
 *       both modules, interleaved rep by rep, and the ratio
 *   node scripts/step-time.js --ground            with a grass plane raised
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

const RC_PERIOD_MS = 4;
const RUN_MS = 8000;
const REPS = 15;

/* The plant golden's freestyle: [from ms, roll, pitch, yaw, throttle]. */
const FREESTYLE = [
  [0, 0, 0, 0, 0.5], [500, 0, 0.3, 0, 0.35], [1500, 1, 0, 0, 0.2],
  [2000, 0, 0, 0, 0.42], [2400, 0, -1, 0, 0.15], [2900, 0, 0, 0, 0.6],
  [3500, 0, 0, 1, 0.35], [4500, 0, 0, 0, 1], [5000, 0, 0, 0, 0],
  [6000, 0.5, 0.4, 0.2, 0.45], [7000, 0, 0, 0, 0.3],
];

function stickAt(ms) {
  let k = FREESTYLE[0];
  for (const f of FREESTYLE) {
    if (ms >= f[0]) {
      k = f;
    }
  }
  return k;
}

function arg(name) {
  const a = process.argv.slice(2).find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) {
    return null;
  }
  return a.includes('=') ? a.split('=').slice(1).join('=') : true;
}

async function open(path, real, ground) {
  const sim = await loadSim(await readFile(path));
  const config = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  if (sim.init(config) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  if (real) {
    if (typeof sim.e.sim_set_realism !== 'function') {
      throw new Error(`${path} has no sim_set_realism`);
    }
    sim.e.sim_set_realism(real);
  }
  sim.e.sim_set_gravity(real ? 1.0 : 1.62);
  sim.e.sim_set_air(1.1);
  return { sim, ground };
}

/* One eight second flight; returns nanoseconds spent inside sim_step. */
function flight({ sim, ground }) {
  sim.reset();
  sim.setCellVoltage(4.2);
  if (ground) {
    sim.e.sim_set_pose(0, 0, 0.5, 1, 0, 0, 0);
  }
  let ns = 0n;
  for (let ms = 0; ms < RUN_MS; ms += RC_PERIOD_MS) {
    const k = stickAt(ms);
    sim.input(ms / 1000, k[1], k[2], k[3], k[4]);
    if (ground) {
      sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, -0.033, 0.6, 0);
    }
    const t0 = process.hrtime.bigint();
    sim.step(RC_PERIOD_MS);
    ns += process.hrtime.bigint() - t0;
  }
  return Number(ns) / RUN_MS;
}

function median(v) {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function report(label, v) {
  const med = median(v);
  const min = Math.min(...v);
  console.log(`  ${label.padEnd(34)} median ${med.toFixed(0).padStart(6)} ns a step, best ${min.toFixed(0).padStart(6)},`
    + ` ${(med * 16.667 / 1000).toFixed(1).padStart(5)} us a 60 Hz frame`);
  return med;
}

async function main() {
  const wasm = arg('wasm') || join(root, 'dist/sim.wasm');
  const real = Number(arg('real') || 0);
  const ground = Boolean(arg('ground'));
  const compare = arg('compare');
  const a = await open(wasm, real, ground);
  const b = compare ? await open(compare, 0, ground) : null;
  /* Warm both before anything is timed, so the tiers have settled. */
  for (let i = 0; i < 4; i += 1) {
    flight(a);
    if (b) {
      flight(b);
    }
  }
  const ta = [];
  const tb = [];
  for (let i = 0; i < REPS; i += 1) {
    ta.push(flight(a));
    if (b) {
      tb.push(flight(b));
    }
  }
  console.log(`step-time: ${RUN_MS / 1000} s of scripted freestyle, ${REPS} reps${ground ? ', grass plane raised' : ''}`);
  const ma = report(`${wasm.replace(`${root}/`, '')}${real ? ` real=${real}` : ''}`, ta);
  if (b) {
    const mb = report(compare.replace(`${root}/`, ''), tb);
    console.log(`  ratio ${(ma / mb).toFixed(3)} (first over second)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
