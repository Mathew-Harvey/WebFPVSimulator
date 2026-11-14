/*
 * realism-check.js: the Realistic physics switch, held to what it says.
 *
 * WHY THIS EXISTS. The owner asked for seven corrections to the plant
 * behind one switch that is off until a pilot turns it on (2026-11-14,
 * PROGRESS.md). The plant golden proves the half of that which matters
 * most, that with the switch off nothing moved. This proves the other
 * half: that each bit of sim_set_realism does the one thing sim_internal.h
 * says it does, in the direction and at roughly the size the derivation
 * in plant.c gives, and nothing when its bit is clear. It flies
 * dist/sim.wasm in Node, on the shipped Betaflight tune, at one g.
 *
 * WHAT IT CANNOT SEE. Whether any of it feels like a real quad. That is a
 * pilot's call and, after that, a blackbox log's (scripts/blackbox-fit.js).
 * Every band below is a statement about the model's own arithmetic.
 *
 * Usage:
 *   node scripts/realism-check.js           run the checks
 *   node scripts/realism-check.js --write   rewrite tests/goldens/realism.json
 *       (the owner's call, when a realism constant is retuned on a flight
 *       or a fit; say which in PROGRESS.md)
 *   node scripts/realism-check.js --verbose print every measured number
 * Exit code is the failure count.
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
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK, SIM_ERR_BAD_ARG } from '../tests/lib/simmod.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const GOLDEN = join(root, 'tests/goldens/realism.json');
const VERBOSE = process.argv.includes('--verbose');
const WRITE = process.argv.includes('--write');

/* sim_internal.h's bits. */
const INFLOW = 1;
const INERTIA = 2;
const GROUND = 4;
const WAKE = 8;
const PACK = 16;
const TANDEM = 32;
const DYN = 64;
const ALL = 127;

/* sim_abi.h's state block. */
const Z = 3;
const VX = 4;
const VY = 5;
const VZ = 6;
const QX = 8;
const QY = 9;
const P = 11;
const VOLTS = 18;
const AMPS = 19;
/* sim_bf_debug taps. */
const TAP_OLD_WASH = 46;
const TAP_IXX = 55;
const TAP_WAKE = 71;
const TAP_TANDEM = 73;
const TAP_USED = 74;
const TAP_SLOW = 75;
const TAP_APPLIED = 77;

const RC_MS = 4;

let failures = 0;
function check(ok, what, detail = '') {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
}
function note(line) {
  if (VERBOSE) {
    console.log(`        ${line}`);
  }
}

let wasm;
let config;

/* A fresh module at one g on the shipped tune, with a mask. */
async function open(mask, { gravity = 1.0, angle = false } = {}) {
  const sim = await loadSim(wasm);
  if (sim.init(config) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  if (sim.e.sim_set_realism(mask) !== SIM_OK) {
    throw new Error(`sim_set_realism(${mask}) refused`);
  }
  sim.e.sim_set_gravity(gravity);
  sim.reset();
  sim.setCellVoltage(4.2);
  sim.setAngleMode(angle);
  sim.clockMs = 0;
  return sim;
}

const state = (sim) => sim.readState().state;
const upZ = (st) => 1 - 2 * (st[QX] * st[QX] + st[QY] * st[QY]);
const tap = (sim, n) => sim.e.sim_bf_debug(n);

/*
 * Fly `ms` more milliseconds. `sticks(ms, state)` returns [roll, pitch,
 * yaw, throttle] and is asked on the RC grid; `each(ms, state)` sees every
 * step. Times are from the start of this call.
 */
function fly(sim, ms, sticks, each) {
  for (let t = 0; t < ms; t += 1) {
    if (sim.clockMs % RC_MS === 0) {
      const k = sticks(t, state(sim));
      if (sim.input(sim.clockMs / 1000, k[0], k[1], k[2], k[3]) !== SIM_OK) {
        throw new Error('sim_input refused');
      }
    }
    sim.step(1);
    sim.clockMs += 1;
    if (each) {
      each(t, state(sim));
    }
  }
}

/* A throttle that holds a height, as the plant golden's does. */
function holder(z, hover) {
  let i = 0;
  return (st) => {
    const e = z - st[Z];
    i = Math.max(-0.3, Math.min(0.3, i + e * (RC_MS / 1000) * 0.4));
    const up = upZ(st);
    return Math.max(0, Math.min(1, (hover + 0.15 * e - 0.1 * st[VZ] + i) / (up > 0.5 ? up : 0.5)));
  };
}

/* The throttle that neither climbs nor sinks, by bisection, in free air. */
async function hoverThrottle(mask) {
  let lo = 0.05;
  let hi = 0.7;
  for (let i = 0; i < 16; i += 1) {
    const mid = (lo + hi) / 2;
    const sim = await open(mask);
    sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0);
    fly(sim, 1500, () => [0, 0, 0, mid]);
    if (state(sim)[VZ] > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return (lo + hi) / 2;
}

function hashOf(sim, ms, sticks) {
  const h = createHash('sha256');
  fly(sim, ms, sticks, () => {
    h.update(sim.readStateBytes().bytes);
  });
  return h.digest('hex');
}

/* The plant golden's freestyle, as a step function of time. */
const FREESTYLE = [
  [0, 0, 0, 0, 0.5], [500, 0, 0.3, 0, 0.35], [1500, 1, 0, 0, 0.2],
  [2000, 0, 0, 0, 0.42], [2400, 0, -1, 0, 0.15], [2900, 0, 0, 0, 0.6],
  [3500, 0, 0, 1, 0.35], [4500, 0, 0, 0, 1], [5000, 0, 0, 0, 0],
  [6000, 0.5, 0.4, 0.2, 0.45], [7000, 0, 0, 0, 0.3],
];
function freestyle(ms) {
  let k = FREESTYLE[0];
  for (const f of FREESTYLE) {
    if (ms >= f[0]) {
      k = f;
    }
  }
  return k.slice(1);
}

/* ------------------------------------------------------------------ */

async function theSwitchItself() {
  console.log('\nthe switch');
  const sim = await loadSim(wasm);
  sim.init(config);
  check(sim.e.sim_realism() === 0, 'a module nobody has asked is at 0');
  check(sim.e.sim_set_realism(128) === SIM_ERR_BAD_ARG && sim.e.sim_set_realism(-1) === SIM_ERR_BAD_ARG
    && sim.e.sim_realism() === 0, 'a bit this build does not have is refused and changes nothing');
  sim.e.sim_set_realism(TANDEM | DYN);
  check(sim.e.sim_realism() === 0, 'the two bits that act through the inflow solve are nothing without it');
  sim.e.sim_set_realism(ALL);
  sim.reset();
  check(sim.e.sim_realism() === ALL, 'it survives a reset, like the flight style');
  sim.init(config);
  check(sim.e.sim_realism() === ALL, 'and an init');

  /* Off after on is the machine that was never on: the same flight from a
   * module that flew realistic first and from one that never did. */
  const never = await open(0, { gravity: 1.62 });
  fly(never, 2000, freestyle);
  never.reset();
  never.clockMs = 0;
  const hNever = hashOf(never, 6000, freestyle);
  const was = await open(ALL, { gravity: 1.62 });
  fly(was, 2000, freestyle);
  was.e.sim_set_realism(0);
  was.reset();
  was.clockMs = 0;
  const hWas = hashOf(was, 6000, freestyle);
  check(hNever === hWas, 'switched off again, the flight is bit for bit the one a module that never had it on flies');

  /* Turned on and off in the air, nothing goes non finite. */
  const mid = await open(0);
  sim.e.sim_set_pose(0, 0, 30, 1, 0, 0, 0);
  let finite = true;
  const watch = (t, st) => {
    for (const v of st) {
      finite = finite && Number.isFinite(v);
    }
  };
  fly(mid, 1500, freestyle, watch);
  mid.e.sim_set_realism(ALL);
  fly(mid, 2500, (t) => freestyle(t + 1500), watch);
  mid.e.sim_set_realism(0);
  fly(mid, 2000, (t) => freestyle(t + 4000), watch);
  check(finite, 'switched on and off in the air, every number stays finite');
}

async function inflow() {
  console.log('\ninflow: the thrust curve');
  const sim = await open(INFLOW);
  const c = (what, x, xp) => sim.e.sim_real_curve(what, x, xp);
  const k = c(2, 0, 0);
  const edge = c(3, 0, 0);
  check(Math.abs(c(0, 0, 0) - 1) < 1e-12, 'at rest it is kt w squared, exactly', `factor ${c(0, 0, 0)}`);
  check(c(0, 1 + k, 0) === 0 && c(0, 1 + k - 1e-3, 0) > 0, 'and thrust still reaches zero at the pitch speed',
    `1 + k = ${(1 + k).toFixed(4)} induced velocities`);
  const slope = (c(0, 0.01, 0) - c(0, -0.01, 0)) / 0.02;
  const line = -1 / (1 + k);
  check(slope / line > 0.6 && slope / line < 0.7, 'at the hover it is about two thirds as sensitive to a climb as the straight line',
    `${(slope / line).toFixed(3)} of the line`);
  const fast = (c(0, 0.01, 3) - c(0, -0.01, 3)) / 0.02;
  check(fast / line > 1.1, 'and more sensitive than the line in fast edgewise flight', `${(fast / line).toFixed(3)} at three induced velocities`);
  check(c(0, 0, 1) > 1.05 && c(0, 0, 1) < 1.15 && c(0, 0, 2) > 1.18 && c(0, 0, 2) < 1.32,
    'translational lift is inside the solve: a tenth more thrust at one induced velocity edgewise, a quarter at two',
    `${c(0, 0, 1).toFixed(3)}, ${c(0, 0, 2).toFixed(3)}`);
  /* The solver against a bisection of the same pair, over the envelope. */
  let worst = 0;
  for (let x = -0.65; x <= 2.4; x += 0.05) {
    for (let xp = 0; xp <= 40; xp += xp < 3 ? 0.1 : 1) {
      const xe = edge * xp;
      const f = (y) => y * Math.sqrt(xe * xe + (x + y) * (x + y)) - 1 + (x + y - 1) / k;
      let lo = 0;
      let hi = 5;
      if (f(0) >= 0) {
        hi = 0;
      }
      for (let i = 0; i < 70 && hi > 0; i += 1) {
        const m = (lo + hi) / 2;
        if (f(m) > 0) {
          hi = m;
        } else {
          lo = m;
        }
      }
      worst = Math.max(worst, Math.abs(c(1, x, xp) - (hi > 0 ? (lo + hi) / 2 : 0)));
    }
  }
  check(worst < 1e-4, 'three Newton steps land on a bisection of the same two equations', `worst error ${worst.toExponential(2)} of an induced velocity`);
  check(Math.abs(c(0, -3 * (1 + k), 0) - 0.75) < 1e-9, 'deep in the ring state thrust is at the same floor as before', `${c(0, -3 * (1 + k), 0)}`);
  let smooth = true;
  for (let x = -3; x < 2.3; x += 0.001) {
    smooth = smooth && Math.abs(c(0, x + 0.001, 0.4) - c(0, x, 0.4)) < 0.002;
  }
  check(smooth, 'and the curve has no step in it from a deep descent to the pitch speed');

  /* Same hover: the correction must not move where hover sits. */
  const h0 = await hoverThrottle(0);
  const h1 = await hoverThrottle(INFLOW);
  check(Math.abs(h0 - h1) < 0.003, 'hover sits at the same place on the stick', `${h0.toFixed(4)} off, ${h1.toFixed(4)} on`);
  return h1;
}

async function inertia(hover) {
  console.log('\ninertia');
  const off = await open(0);
  const on = await open(INERTIA);
  check(tap(off, TAP_IXX) === 0.0035 && tap(on, TAP_IXX) === 0.00145, 'the plant is on the built up figure with the bit set and the table\'s without',
    `Ixx ${tap(off, TAP_IXX)} off, ${tap(on, TAP_IXX)} on`);
  /* The same two motors opened by hand on both: the roll it starts is the
   * inertia and nothing else. */
  const rate = (sim) => {
    sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0);
    fly(sim, 600, () => [0, 0, 0, hover]);
    sim.motorOverride(2, 0.6);
    sim.motorOverride(3, 0.6);
    sim.motorOverride(0, 0.1);
    sim.motorOverride(1, 0.1);
    fly(sim, 25, () => [0, 0, 0, hover]);
    return state(sim)[P];
  };
  const r0 = rate(off);
  const r1 = rate(on);
  check(Math.abs(r1 / r0 - 0.0035 / 0.00145) < 0.12, 'the same push on two motors rolls it faster by the ratio of the two inertias',
    `${(r1 / r0).toFixed(3)} against ${(0.0035 / 0.00145).toFixed(3)}`);

  /* And the shipped tune still holds it: a half stick roll, then centred. */
  const step = async (mask) => {
    const sim = await open(mask);
    sim.e.sim_set_pose(0, 0, 50, 1, 0, 0, 0);
    fly(sim, 800, () => [0, 0, 0, hover]);
    const p = [];
    fly(sim, 700, (t) => [t < 250 ? 0.5 : 0, 0, 0, hover], (t, st) => p.push(st[P]));
    const target = p.slice(180, 250).reduce((a, b) => a + b, 0) / 70;
    const peak = Math.max(...p.slice(0, 250));
    const tail = p.slice(500);
    const ripple = Math.sqrt(tail.reduce((a, b) => a + b * b, 0) / tail.length) * 57.2958;
    return { target: target * 57.2958, over: (peak / target - 1) * 100, ripple };
  };
  const a = await step(0);
  const b = await step(ALL);
  note(`roll step off: ${a.target.toFixed(0)} deg/s, overshoot ${a.over.toFixed(1)} percent, ripple ${a.ripple.toFixed(2)} deg/s`);
  note(`roll step all on: ${b.target.toFixed(0)} deg/s, overshoot ${b.over.toFixed(1)} percent, ripple ${b.ripple.toFixed(2)} deg/s`);
  check(b.over < a.over + 6 && b.ripple < 2.0, 'on the shipped tune a roll step with everything on overshoots no more than a little and rings out',
    `overshoot ${a.over.toFixed(1)} to ${b.over.toFixed(1)} percent, ripple after ${b.ripple.toFixed(2)} deg/s`);
}

async function ground(hover) {
  console.log('\nground effect');
  /* Hover high over a raised plane, be set down low, and read the lift. */
  const lift = async (mask, z) => {
    const sim = await open(mask);
    const plane = () => sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, 0.6, 0);
    sim.e.sim_set_pose(0, 0, 20, 1, 0, 0, 0);
    for (let i = 0; i < 700; i += 1) {
      plane();
      fly(sim, 1, () => [0, 0, 0, hover]);
    }
    sim.e.sim_set_pose(0, 0, z, 1, 0, 0, 0);
    const v0 = state(sim)[VZ];
    for (let i = 0; i < 30; i += 1) {
      plane();
      fly(sim, 1, () => [0, 0, 0, hover]);
    }
    return (state(sim)[VZ] - v0) / 0.03 / 9.80665;
  };
  const offLow = await lift(0, 0.10);
  const offHigh = await lift(0, 1.0);
  const onLow = await lift(GROUND, 0.10);
  const onMid = await lift(GROUND, 0.25);
  const onHigh = await lift(GROUND, 1.0);
  note(`extra lift in g: off 10 cm ${offLow.toFixed(4)}, off 1 m ${offHigh.toFixed(4)}, on 10 cm ${onLow.toFixed(4)}, on 25 cm ${onMid.toFixed(4)}, on 1 m ${onHigh.toFixed(4)}`);
  check(Math.abs(offLow - offHigh) < 0.004, 'without the bit the five inch has no cushion', `${(offLow - offHigh).toFixed(4)} g between 10 cm and 1 m`);
  check(onLow - onHigh > 0.05 && onLow - onHigh < 0.35, 'with it, hover throttle lifts the craft off a floor 10 cm under it',
    `${(onLow - onHigh).toFixed(3)} g more than at 1 m`);
  check(onMid - onHigh < 0.5 * (onLow - onHigh) && Math.abs(onHigh - offHigh) < 0.004, 'and the cushion is mostly gone by 25 cm and all gone by a metre',
    `${(onMid - onHigh).toFixed(3)} g at 25 cm`);
}

async function wake(hover) {
  console.log('\nwake: prop wash where the wake actually is');
  /* What each run saw, after `from` ms: the deepest the craft was in its
   * remembered trail, the deepest the plant's old gate read, the deepest
   * wash a rotor was actually shaken at, and the milliseconds the trail
   * fired while the old gate said nothing. */
  const watch = async (mask, from, body, angle = true) => {
    const sim = await open(mask, { angle });
    sim.e.sim_set_pose(0, 0, 60, 1, 0, 0, 0);
    const out = { trail: 0, gate: 0, applied: 0, trailOnly: 0, gyro: 0 };
    let sum = 0;
    let n = 0;
    let ms = 0;
    const each = (t, st) => {
      ms += 1;
      if (ms <= from) {
        return;
      }
      const w = tap(sim, TAP_WAKE);
      const o = tap(sim, TAP_OLD_WASH);
      out.trail = Math.max(out.trail, w);
      out.gate = Math.max(out.gate, o);
      out.applied = Math.max(out.applied, tap(sim, TAP_APPLIED));
      if (w > 0.1 && o === 0) {
        out.trailOnly += 1;
      }
      sum += st[P] * st[P] + st[P + 1] * st[P + 1];
      n += 1;
    };
    await body(sim, each);
    out.gyro = Math.sqrt(sum / n) * 57.2958;
    return out;
  };
  const hov = await watch(WAKE, 0, (sim, each) => {
    const h = holder(60, hover);
    fly(sim, 3000, (t, st) => [0, 0, 0, h(st)], each);
  });
  check(hov.trail === 0 && hov.applied === 0, 'a hover never meets its own column', `depth ${hov.trail}`);
  const fwd = await watch(WAKE, 0, (sim, each) => {
    const h = holder(60, hover);
    fly(sim, 3000, (t, st) => [0, -0.8, 0, h(st)], each);
  });
  check(fwd.trail === 0 && fwd.applied === 0, 'nor does flying away from it', `depth ${fwd.trail}`);
  const climb = await watch(WAKE, 0, (sim, each) => fly(sim, 2000, (t) => [0, 0, 0, t < 300 ? hover : 0.8], each));
  check(climb.trail === 0 && climb.applied === 0, 'nor a punch', `depth ${climb.trail}`);

  const drop = (sim, each) => {
    fly(sim, 1200, () => [0, 0, 0, hover], each);
    fly(sim, 2300, () => [0, 0, 0, hover * 0.55], each);
  };
  const sink = await watch(WAKE, 1200, drop);
  check(sink.trail > 0.2 && sink.applied > 0.9, 'sinking straight down into the column under a hover shakes as hard as it ever did',
    `in the trail to ${sink.trail.toFixed(2)}, shaken at ${sink.applied.toFixed(2)}`);

  /* The pilot's rule: come down moving forward and it does not wobble. */
  const glide = (sim, each) => fly(sim, 4000, () => [0, -0.5, 0, hover * 0.6], each);
  const gOn = await watch(WAKE, 1500, glide);
  const gOff = await watch(0, 1500, glide);
  note(`descending forward: old gate ${gOn.gate.toFixed(2)}, shaken at ${gOn.applied.toFixed(2)}, gyro ${gOn.gyro.toFixed(2)} deg/s against ${gOff.gyro.toFixed(2)} without the bit`);
  check(gOn.gate > 0.7 && gOn.applied < 0.6 * gOn.gate && gOn.gyro < 0.7 * gOff.gyro,
    'coming down while moving forward shakes much less, because the air across the discs carries the wake off',
    `the old gate reads ${gOn.gate.toFixed(2)}, the rotors are shaken at ${gOn.applied.toFixed(2)}; gyro ${gOff.gyro.toFixed(2)} to ${gOn.gyro.toFixed(2)} deg/s`);

  /* Hover, cut the throttle, fall into the column and catch it: while it
   * falls on idle rotors the old gate has nothing to measure against, and
   * the trail is what says the air is dirty. */
  const chop = (sim, each) => fly(sim, 3200, (t) => [0, 0, 0, t < 1500 ? hover : (t < 2300 ? 0 : hover * 1.6)], each);
  const cOn = await watch(WAKE, 1500, chop);
  note(`hover, chop, catch: in the trail to ${cOn.trail.toFixed(2)}, ${cOn.trailOnly} ms where only the trail fired`);
  check(cOn.trail > 0.3 && cOn.trailOnly > 80, 'falling back through the column under a hover, the remembered wake fires where the old gate alone says nothing',
    `${cOn.trailOnly} ms`);
  const cOff = await watch(ALL & ~WAKE, 1500, chop);
  check(cOff.trail === 0, 'and with the bit clear nothing is remembered', `depth ${cOff.trail}`);

  /* The Wobbles in propwash row still owns the shake. */
  const shake = async (wash) => {
    const sim = await open(WAKE);
    sim.e.sim_set_propwash(wash);
    sim.e.sim_set_pose(0, 0, 60, 1, 0, 0, 0);
    let sum = 0;
    let n = 0;
    fly(sim, 1200, () => [0, 0, 0, hover]);
    fly(sim, 2300, () => [0, 0, 0, hover * 0.55], (t, st) => {
      if (t > 600) {
        sum += st[P] * st[P] + st[P + 1] * st[P + 1];
        n += 1;
      }
    });
    return Math.sqrt(sum / n) * 57.2958;
  };
  const quiet = await shake(0);
  const loud = await shake(1);
  check(quiet < 0.5 * loud, 'the Wobbles in propwash row still turns the shake off', `${loud.toFixed(2)} deg/s with, ${quiet.toFixed(2)} without`);
}

async function pack(hover) {
  console.log('\npack');
  const run = async (mask) => {
    const sim = await open(mask);
    sim.e.sim_set_pose(0, 0, 200, 1, 0, 0, 0);
    let ah = 0;
    const each = (t, st) => {
      ah += st[AMPS] / 3600 / 1000;
    };
    fly(sim, 500, () => [0, 0, 0, hover], each);
    const vStart = state(sim)[VOLTS];
    fly(sim, 2000, () => [0, 0, 0, 1], each);
    const vPunch = state(sim)[VOLTS];
    fly(sim, 30, () => [0, 0, 0, 0], each);
    const vJustAfter = state(sim)[VOLTS];
    const slowAfter = tap(sim, TAP_SLOW);
    fly(sim, 3000, () => [0, 0, 0, 0], each);
    const vRested = state(sim)[VOLTS];
    return { sim, ah, vStart, vPunch, vJustAfter, vRested, slowAfter, used: tap(sim, TAP_USED) };
  };
  const on = await run(PACK);
  const off = await run(0);
  note(`on: start ${on.vStart.toFixed(2)} V, end of punch ${on.vPunch.toFixed(2)}, 30 ms after ${on.vJustAfter.toFixed(2)}, rested ${on.vRested.toFixed(2)}, used ${(on.used * 1000).toFixed(1)} mAh`);
  note(`off: start ${off.vStart.toFixed(2)} V, end of punch ${off.vPunch.toFixed(2)}, 30 ms after ${off.vJustAfter.toFixed(2)}, rested ${off.vRested.toFixed(2)}`);
  check(Math.abs(on.used - on.ah) < 0.02 * on.ah && on.used > 0.02, 'the charge used is the current drawn, added up',
    `${(on.used * 1000).toFixed(1)} mAh against ${(on.ah * 1000).toFixed(1)}`);
  check(on.vRested - on.vJustAfter > 0.3 && on.slowAfter > 0.3, 'after a two second punch the pack is still down, and comes back over the next seconds',
    `${(on.vRested - on.vJustAfter).toFixed(2)} V recovered`);
  check(off.vRested - off.vJustAfter < 0.05, 'without the bit it is back at once, as it always was', `${(off.vRested - off.vJustAfter).toFixed(3)} V`);
  check(on.vRested < off.vRested - 0.05, 'and it rests lower than it started, by what was taken out', `${(off.vRested - on.vRested).toFixed(3)} V under a pack that does not drain`);
  check(on.vPunch < off.vPunch - 0.4, 'a long punch sags further than the first instant of it', `${on.vPunch.toFixed(2)} V against ${off.vPunch.toFixed(2)}`);
  on.sim.reset();
  on.sim.clockMs = 0;
  fly(on.sim, 5, () => [0, 0, 0, 0]);
  check(tap(on.sim, TAP_USED) < 1e-5 && tap(on.sim, TAP_SLOW) < 1e-2, 'a reset is a fresh pack',
    `${tap(on.sim, TAP_USED).toExponential(1)} Ah used, ${tap(on.sim, TAP_SLOW).toExponential(1)} V of slow sag, 5 ms in`);

  /* The mask the shell flies a race on: everything but the pack. */
  const race = await run(ALL & ~PACK);
  check(race.used === 0 && race.slowAfter === 0, 'on the race mask, everything but the pack, nothing is drawn down');

  /* And it does run out. Held flat out from full, which is the shortest a
   * pack can last, and hovered from a quarter full. */
  const flat = await open(PACK);
  flat.e.sim_set_pose(0, 0, 100, 1, 0, 0, 0);
  let flatS = 0;
  let thrustStart = 0;
  let thrustEnd = 0;
  for (let sec = 0; sec < 120 && flatS === 0; sec += 1) {
    const v0 = state(flat)[VZ];
    /* Straight up for a second, then set back down so it never runs out
     * of sky or of numbers; the pack does not know it moved. */
    fly(flat, 1000, () => [0, 0, 0, 1]);
    if (sec === 1) {
      thrustStart = state(flat)[14];
    }
    thrustEnd = state(flat)[14];
    if (state(flat)[VOLTS] / 6 < 3.0) {
      flatS = sec + 1;
    }
    flat.e.sim_set_pose(0, 0, 100, 1, 0, 0, 0);
    void v0;
  }
  note(`flat out from full: under 3.0 V a cell after ${flatS} s; rotor speed ${thrustStart.toFixed(0)} rpm early, ${thrustEnd.toFixed(0)} at the end`);
  check(flatS > 25 && flatS < 60 && thrustEnd < 0.85 * thrustStart, 'held flat out, a full pack is done in well under a minute and the motors go with it',
    `${flatS} s, rotor speed down to ${(thrustEnd / thrustStart * 100).toFixed(0)} percent`);
  const low = await open(PACK);
  low.setCellVoltage(3.75);
  low.e.sim_set_pose(0, 0, 3000, 1, 0, 0, 0);
  const h = holder(3000, hover * 1.15);
  let lowMin = 0;
  for (let sec = 0; sec < 600 && lowMin === 0; sec += 1) {
    fly(low, 1000, (t, st) => [0, 0, 0, h(st)]);
    if (state(low)[VOLTS] / 6 < 3.3) {
      lowMin = (sec + 1) / 60;
    }
  }
  note(`hover from 3.75 V a cell: under 3.3 after ${lowMin.toFixed(1)} min`);
  check(lowMin > 1 && lowMin < 8, 'a quarter full pack hovers for a few minutes more and then it is done', `${lowMin.toFixed(1)} min to 3.3 V a cell`);
}

async function tandem(hover) {
  console.log('\ntandem: downstream rotors in the upstream wake');
  /* Up to speed in angle mode, then the stick centred: it levels and
   * coasts with the discs edgewise, which is where this lives. */
  const coast = async (mask) => {
    const sim = await open(mask, { angle: true });
    sim.e.sim_set_pose(0, 0, 60, 1, 0, 0, 0);
    const h = holder(60, hover);
    fly(sim, 2500, (t, st) => [0, -1, 0, h(st)]);
    let rear = 0;
    let front = 0;
    let tapMax = 0;
    let n = 0;
    let speed = 0;
    fly(sim, 900, (t, st) => [0, 0, 0, h(st)], (t, st) => {
      if (t >= 400) {
        rear += st[14] + st[16];
        front += st[15] + st[17];
        n += 1;
        tapMax = Math.max(tapMax, tap(sim, TAP_TANDEM));
        speed = Math.hypot(st[VX], st[VY]);
      }
    });
    return { ratio: rear / front, tapMax, speed };
  };
  const off = await coast(INFLOW);
  const on = await coast(INFLOW | TANDEM);
  note(`level coast at ${on.speed.toFixed(1)} m/s: rear over front rpm ${off.ratio.toFixed(4)} without, ${on.ratio.toFixed(4)} with, interference ${on.tapMax.toFixed(2)} m/s`);
  check(on.tapMax > 0.5 && off.tapMax === 0, 'coasting level at speed, a rear rotor is handed descending air by the one ahead of it',
    `${on.tapMax.toFixed(2)} m/s`);
  check(on.ratio > off.ratio + 0.03 && on.ratio < off.ratio + 0.15, 'and the controller holds the nose with more rear motor, as a real log shows',
    `rear over front rpm ${off.ratio.toFixed(4)} to ${on.ratio.toFixed(4)}`);
  const sim = await open(INFLOW | TANDEM);
  sim.e.sim_set_pose(0, 0, 60, 1, 0, 0, 0);
  let hovTap = 0;
  fly(sim, 1500, (t, st) => [0, 0, 0, holder(60, hover)(st)], () => {
    hovTap = Math.max(hovTap, tap(sim, TAP_TANDEM));
  });
  check(hovTap < 0.02, 'in a hover the wakes go straight down and nobody is in anybody\'s', `${hovTap.toFixed(4)} m/s`);
  /* Steep and fast, the wake has sunk well under the rear discs. */
  const sim2 = await open(INFLOW | TANDEM, { angle: true });
  sim2.e.sim_set_pose(0, 0, 60, 1, 0, 0, 0);
  let raceTap = 0;
  fly(sim2, 4000, () => [0, -1, 0, 0.8], (t) => {
    if (t > 3000) {
      raceTap = Math.max(raceTap, tap(sim2, TAP_TANDEM));
    }
  });
  check(raceTap < 0.35 * on.tapMax, 'and pitched hard over at racing speed it has sunk past the rear discs before it reaches them',
    `${raceTap.toFixed(2)} m/s`);
}

async function dynamicInflow(hover) {
  console.log('\ndynamic inflow: the air\'s own lag');
  const punch = async (mask) => {
    const sim = await open(mask);
    sim.e.sim_set_pose(0, 0, 60, 1, 0, 0, 0);
    fly(sim, 1000, () => [0, 0, 0, hover]);
    const v = [];
    fly(sim, 400, () => [0, 0, 0, 1], (t, st) => v.push(st[VZ]));
    return v;
  };
  const a = await punch(INFLOW);
  const b = await punch(INFLOW | DYN);
  let lead = 0;
  for (let t = 0; t < 120; t += 1) {
    lead = Math.max(lead, b[t] - a[t]);
  }
  const rel = lead / a[119];
  note(`punch: speed lead peaks at ${lead.toFixed(4)} m/s in the first 120 ms, ${(rel * 100).toFixed(2)} percent of the speed by then; at 400 ms ${a[399].toFixed(3)} against ${b[399].toFixed(3)}`);
  check(lead > 0, 'on a punch the thrust leads the steady answer', `${lead.toFixed(4)} m/s ahead inside 120 ms`);
  check(rel < 0.05 && Math.abs(b[399] - a[399]) / a[399] < 0.02, 'by a few percent for a few milliseconds, which is its derived size and no more',
    `${(rel * 100).toFixed(2)} percent, ${(Math.abs(b[399] - a[399]) / a[399] * 100).toFixed(2)} percent at 400 ms`);
  const h0 = await hoverThrottle(INFLOW);
  const h1 = await hoverThrottle(INFLOW | DYN);
  check(Math.abs(h0 - h1) < 1e-3, 'and nothing steady moves: hover is where it was', `${h0.toFixed(4)}, ${h1.toFixed(4)}`);
}

async function pinned() {
  console.log('\ndeterminism, and the realistic flight pinned');
  const scen = {
    'all on, acro freestyle at one g': async () => {
      const sim = await open(ALL);
      return hashOf(sim, 8000, freestyle);
    },
    'race mask, acro freestyle at one g': async () => {
      const sim = await open(ALL & ~PACK);
      return hashOf(sim, 8000, freestyle);
    },
    'all on, grass, hover low and fly off': async () => {
      const sim = await open(ALL, { angle: true });
      const h = createHash('sha256');
      const hold = holder(0.15, 0.27);
      for (let t = 0; t < 6000; t += 1) {
        sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, -0.033, 0.6, 0);
        fly(sim, 1, (ms, st) => [0, t > 3000 ? -0.5 : 0, 0, t < 300 ? 0 : hold(st)]);
        h.update(sim.readStateBytes().bytes);
      }
      return h.digest('hex');
    },
  };
  const golden = existsSync(GOLDEN) ? JSON.parse(await readFile(GOLDEN, 'utf8')) : { scenarios: {} };
  const out = {
    note: 'Written by scripts/realism-check.js --write. The Realistic physics switch\'s own traces. Rewrite when a realism constant is retuned on the owner\'s word, and say which in PROGRESS.md.',
    scenarios: {},
  };
  for (const [name, run] of Object.entries(scen)) {
    const a = await run();
    const b = await run();
    out.scenarios[name] = a;
    check(a === b, `${name}: two runs agree to the bit`);
    if (!WRITE) {
      check(golden.scenarios[name] === a, `${name}: and match the pinned trace`, a.slice(0, 16));
    }
  }
  if (WRITE) {
    await writeFile(GOLDEN, `${JSON.stringify(out, null, 1)}\n`);
    console.log(`  wrote ${GOLDEN.slice(root.length + 1)}`);
  }
}

async function main() {
  wasm = await readFile(join(root, 'dist/sim.wasm'));
  config = await readFile(join(root, 'configs/betaflight-default.diff'), 'utf8');
  console.log('realism-check: the Realistic physics switch, dist/sim.wasm on the shipped tune at one g');
  await theSwitchItself();
  const hover = await inflow();
  await inertia(hover);
  await ground(hover);
  await wake(hover);
  await pack(hover);
  await tandem(hover);
  await dynamicInflow(hover);
  await pinned();
  console.log(`\nrealism-check: ${failures === 0 ? 'all passed' : `${failures} FAILED`}`);
  process.exit(failures);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
