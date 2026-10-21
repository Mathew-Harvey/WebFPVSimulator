/*
 * threed-check.js: 3D mode flies both ways, and normal mode never notices it.
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

/*
 * WHY THIS EXISTS.
 *
 * The owner, 2026-10-21: "we need 3d mode built ... that should not impact
 * normal mode". sim_set_3d switches on Betaflight's FEATURE_3D, the DShot 3D
 * endpoints and a plant whose rotors can spin backwards. Two kinds of thing
 * have to hold and nothing else looks at either:
 *
 *   NORMAL MODE IS UNTOUCHED. Never calling it, calling it with 0, and
 *   flying a 3D run first and then switching it off and resetting, all fly
 *   the same trace bit for bit. The last one is the leak test: the mixer's
 *   3D statics and the latched feature mask must not survive into a normal
 *   run (patches/0003, bf_runtime_init).
 *
 *   3D MODE DOES WHAT A 3D QUAD DOES. Mid stick is no thrust, the bottom of
 *   the stick pushes the other way with the rotors turning backwards, a quad
 *   on its back can hold itself up on reverse thrust, a quad on its back on
 *   the grass can take off on it, the deadband keeps the direction it was
 *   entered from, and the whole thing is deterministic across a reset.
 *
 * Plant checks only, no browser. Five inch and whoop both, at the weight the
 * shell flies (its gravity base, configs/airframes.js).
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim } from '../tests/lib/simmod.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const AIRFRAMES = [
  { id: 0, name: 'five inch', gravity: 1.62 },
  { id: 1, name: 'whoop', gravity: 2.025 },
];
/* Rolled 180 degrees about body x: props down, camera upside down. */
const INVERTED = [0, 1, 0, 0];

async function fresh(bytes, diff, af, mode3d) {
  const sim = await loadSim(bytes);
  sim.init(diff);
  if (af.id !== 0) {
    sim.e.sim_set_airframe(af.id);
  }
  sim.e.sim_set_gravity(af.gravity);
  if (mode3d !== undefined) {
    sim.e.sim_set_3d(mode3d);
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  return sim;
}

/* Fly legs of fixed sticks from t, RC frames at 1 ms, return the states and
 * the time at the end. Each leg is { ms, thr, roll?, pitch? }. */
function fly(sim, legs, t0 = 0, every = 50) {
  let t = t0;
  const out = [];
  for (const leg of legs) {
    for (let i = 0; i < leg.ms; i += 1) {
      sim.input(t, leg.roll || 0, leg.pitch || 0, 0, leg.thr);
      sim.step(1);
      t += 0.001;
      if (i % every === every - 1) {
        out.push(sim.readState().state);
      }
    }
  }
  return { out, t };
}

function maxPosGap(a, b) {
  let gap = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.hypot(a[i][1] - b[i][1], a[i][2] - b[i][2], a[i][3] - b[i][3]);
    gap = Math.max(gap, Number.isFinite(d) ? d : Infinity);
  }
  return gap;
}

function traceOf(states) {
  return JSON.stringify(states.map((s) => Array.from(s)));
}

/* Normal flying on the stick, the flight every board time is: punch, chop,
 * a roll and a hover. */
const NORMAL = [
  { ms: 600, thr: 0.8 },
  { ms: 400, thr: 0.05 },
  { ms: 300, thr: 0.5, roll: 0.7 },
  { ms: 900, thr: 0.45 },
];

async function main() {
  const bytes = await readFile(join(root, 'dist', 'sim.wasm'));
  const diff = await readFile(join(root, 'configs', 'betaflight-default.diff'), 'utf8');
  const failures = [];
  const ok = (cond, what) => {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${what}`);
    if (!cond) {
      failures.push(what);
    }
  };

  console.log('3D check: normal mode untouched, and 3D mode flies both ways');
  {
    const probe = await loadSim(bytes);
    if (typeof probe.e.sim_set_3d !== 'function') {
      console.log('  dist/sim.wasm does not export sim_set_3d');
      console.log('\nFAIL, the switch cannot be set at all');
      return 1;
    }
  }

  for (const af of AIRFRAMES) {
    console.log(`\n${af.name}`);

    /* NORMAL MODE UNTOUCHED. */
    const never = traceOf(fly(await fresh(bytes, diff, af, undefined), NORMAL).out);
    const zero = traceOf(fly(await fresh(bytes, diff, af, 0), NORMAL).out);
    ok(never === zero, 'switching 3D off is the same flight as never touching it');
    {
      /* The init side of it, bit for bit: 3D latched at a reset and then
       * switched off again must leave no feature bit, endpoint or mixer
       * branch behind. */
      const sim = await fresh(bytes, diff, af, 1);
      sim.e.sim_set_3d(0);
      sim.reset();
      sim.setCellVoltage(4.2);
      ok(traceOf(fly(sim, NORMAL).out) === never, '3D on at a reset, then off at the next, is bit identical to never');
    }
    {
      /* And the flight side. A 3D run followed by a normal one is held to
       * a normal run followed by a normal one, bit for bit. A mixer left in
       * its 3D branch reads this flight's 5 percent chop as full reverse and
       * would be metres out. This was within 10 cm until patches/0004 made a
       * reset history clean (scripts/reset-check.js, PROGRESS.md 2026-10-21):
       * before it a run, a reset and this flight landed about 10 mm from a
       * fresh module's on the five inch and 43 mm on the whoop. */
      const legs = [{ ms: 400, thr: 0.9 }, { ms: 600, thr: 0.1 }, { ms: 300, thr: 0.5 }];
      const a = await fresh(bytes, diff, af, 1);
      fly(a, legs);
      a.e.sim_set_3d(0);
      a.reset();
      a.setCellVoltage(4.2);
      const after3d = fly(a, NORMAL).out;
      const b = await fresh(bytes, diff, af, 0);
      fly(b, legs);
      b.reset();
      b.setCellVoltage(4.2);
      const afterNormal = fly(b, NORMAL).out;
      const gap = maxPosGap(after3d, afterNormal);
      ok(traceOf(after3d) === traceOf(afterNormal), `a 3D run then a normal one flies the normal one bit for bit as a normal run then a normal one${gap > 0 ? `; ${(gap * 1000).toFixed(1)} mm out` : ''}`);
    }
    {
      const sim = await fresh(bytes, diff, af, 1);
      const on = traceOf(fly(sim, NORMAL).out);
      ok(on !== never, '3D on flies a different trace from normal on the same sticks');
    }

    /* MID STICK IS NO THRUST: the craft falls as a normal quad does with
     * its throttle at the bottom, motors at idle. Measured against that
     * rather than against g, because the whoop's speeds are in scene metres
     * (its len_scale) and its fall in them is not 9.8 m/s^2. */
    {
      const sim = await fresh(bytes, diff, af, 1);
      const mid = fly(sim, [{ ms: 500, thr: 0.5 }]).out;
      const idle = fly(await fresh(bytes, diff, af, 0), [{ ms: 500, thr: 0.0 }]).out;
      const ratio = mid[mid.length - 1][6] / idle[idle.length - 1][6];
      ok(ratio > 0.95 && ratio < 1.05, `mid stick falls ${ratio.toFixed(3)} as fast as a normal quad at idle: no thrust either way`);
    }

    /* TOP OF THE STICK IS FORWARD, as a normal quad climbs. */
    let fwdUp = 0;
    {
      const sim = await fresh(bytes, diff, af, 1);
      const { out } = fly(sim, [{ ms: 600, thr: 1.0 }]);
      const st = out[out.length - 1];
      fwdUp = st[6];
      const rpm = Math.min(st[14], st[15], st[16], st[17]);
      ok(st[6] > 2 && rpm > 0, `full forward climbs at ${st[6].toFixed(2)} m/s, rotors forward (min ${rpm.toFixed(0)} rpm)`);
    }

    /* BOTTOM OF THE STICK IS REVERSE: upright, it drives the craft down
     * harder than gravity, with every rotor turning backwards. */
    {
      const sim = await fresh(bytes, diff, af, 1);
      const { out } = fly(sim, [{ ms: 600, thr: 0.0 }]);
      const st = out[out.length - 1];
      const rpm = Math.max(st[14], st[15], st[16], st[17]);
      const idle = fly(await fresh(bytes, diff, af, 0), [{ ms: 600, thr: 0.0 }]).out;
      const fall = st[6] / idle[idle.length - 1][6];
      ok(rpm < 0 && fall > 1.5, `full reverse upright: rotors backwards (max ${rpm.toFixed(0)} rpm), falls ${fall.toFixed(2)} times as fast as idle`);
    }

    /* INVERTED, REVERSE THRUST HOLDS IT UP. Same stick travel each way and a
     * symmetric prop, so full reverse on its back climbs like full forward
     * on its belly, near enough. */
    {
      const sim = await fresh(bytes, diff, af, 1);
      sim.e.sim_set_pose(0, 0, 10, INVERTED[0], INVERTED[1], INVERTED[2], INVERTED[3]);
      const { out } = fly(sim, [{ ms: 600, thr: 0.0 }]);
      const st = out[out.length - 1];
      const up = 1 - 2 * (st[8] * st[8] + st[9] * st[9]);
      const ratio = st[6] / fwdUp;
      ok(st[6] > 2 && up < -0.9, `full reverse inverted climbs at ${st[6].toFixed(2)} m/s and stays on its back (up ${up.toFixed(2)})`);
      ok(ratio > 0.8 && ratio < 1.2, `inverted climb is ${ratio.toFixed(2)} of the upright one: the prop pushes the same either way`);
    }

    /* AN INVERTED HOVER, found by bisection on the bottom half of the stick:
     * something between centre and the bottom holds height on its back. */
    {
      let lo = 0.0;
      let hi = 0.5;
      let vzEnd = 0;
      let rates = 0;
      for (let k = 0; k < 14; k += 1) {
        const mid = (lo + hi) / 2;
        const sim = await fresh(bytes, diff, af, 1);
        sim.e.sim_set_pose(0, 0, 20, INVERTED[0], INVERTED[1], INVERTED[2], INVERTED[3]);
        const { out } = fly(sim, [{ ms: 1500, thr: mid }]);
        const st = out[out.length - 1];
        vzEnd = st[6];
        rates = Math.hypot(st[11], st[12], st[13]);
        if (vzEnd > 0) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const hover = (lo + hi) / 2;
      ok(hover > 0.05 && hover < 0.45 && rates < 0.5,
        `hovers on its back at ${(hover * 100).toFixed(1)} percent stick, body rates ${rates.toFixed(3)} rad/s`);
    }

    /* THE DEADBAND KEEPS ITS DIRECTION. Into mid stick from below, the rotors
     * stay reversed at idle; from above, they stay forward. Betaflight's
     * rcThrottlePrevious. */
    {
      const sim = await fresh(bytes, diff, af, 1);
      const a = fly(sim, [{ ms: 300, thr: 0.2 }, { ms: 300, thr: 0.5 }]).out;
      const fromBelow = a[a.length - 1];
      const sim2 = await fresh(bytes, diff, af, 1);
      const b = fly(sim2, [{ ms: 300, thr: 0.8 }, { ms: 300, thr: 0.5 }]).out;
      const fromAbove = b[b.length - 1];
      const below = Math.max(fromBelow[14], fromBelow[15], fromBelow[16], fromBelow[17]);
      const above = Math.min(fromAbove[14], fromAbove[15], fromAbove[16], fromAbove[17]);
      ok(below < 0 && above > 0, `mid stick idles the way it came in: from below ${below.toFixed(0)} rpm, from above ${above.toFixed(0)} rpm`);
    }

    /* A FLIP THROUGH THE REVERSAL: hover upright, roll over, catch it on
     * reverse. Nothing runs away and nothing goes non finite. */
    {
      const sim = await fresh(bytes, diff, af, 1);
      const { out } = fly(sim, [
        { ms: 800, thr: 0.8 },
        { ms: 250, thr: 0.5, roll: 1.0 },
        { ms: 600, thr: 0.25 },
        { ms: 250, thr: 0.5, roll: -1.0 },
        { ms: 600, thr: 0.75 },
      ]);
      const finite = out.every((s) => s.every((v) => Number.isFinite(v)));
      const peak = Math.max(...out.map((s) => Math.hypot(s[11], s[12], s[13])));
      ok(finite && peak < 40, `rolled over and back through two reversals, peak rate ${peak.toFixed(1)} rad/s`);
    }

    /* DETERMINISTIC: the same sticks in two fresh modules are bit
     * identical, and so is the same flight again after a reset in the same
     * module (see the leak test above). */
    {
      const legs = [{ ms: 500, thr: 0.9 }, { ms: 500, thr: 0.15, pitch: 0.4 }, { ms: 500, thr: 0.5 }];
      const s1 = await fresh(bytes, diff, af, 1);
      const first = fly(s1, legs).out;
      s1.reset();
      s1.setCellVoltage(4.2);
      const again = fly(s1, legs).out;
      const other = fly(await fresh(bytes, diff, af, 1), legs).out;
      const gap = maxPosGap(first, again);
      ok(traceOf(first) === traceOf(other), 'a 3D flight is bit identical in a fresh module');
      ok(traceOf(first) === traceOf(again), `and bit identical to itself after a reset${gap > 0 ? `; ${(gap * 1000).toFixed(1)} mm out` : ''}`);
    }

    /* ON ITS BACK ON THE GRASS, REVERSE TAKES IT OFF. The plane at the
     * plant's own rest height, the craft seated inverted. */
    {
      const sim = await fresh(bytes, diff, af, 1);
      sim.e.sim_set_pose(0, 0, 0.03, INVERTED[0], INVERTED[1], INVERTED[2], INVERTED[3]);
      let t = 0;
      let z0 = null;
      let st = null;
      for (let i = 0; i < 1500; i += 1) {
        const thr = i < 500 ? 0.5 : 0.0;
        sim.input(t, 0, 0, 0, thr);
        sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, 1.4, 0);
        sim.step(1);
        t += 0.001;
        st = sim.readState().state;
        if (i === 499) {
          z0 = st[3];
        }
      }
      ok(st[3] - z0 > 0.5, `seated on its back, reverse lifts it ${(st[3] - z0).toFixed(2)} m off the grass in a second`);
    }
  }

  if (failures.length) {
    console.log(`\nFAIL, ${failures.length} problem(s)`);
    return 1;
  }
  console.log('\nPASS, normal mode is the flight it always was and 3D flies both ways');
  return 0;
}

process.exit(await main());
