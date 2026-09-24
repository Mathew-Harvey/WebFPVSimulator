/*
 * plant-golden.js: the plant's current behaviour, pinned to the bit.
 *
 * WHY THIS EXISTS. The owner approved moving obstacle contact into the plant
 * on one condition: the tests that pin the core land first, so that a
 * regression arrives as a failing check and not as a pilot's report. Before
 * this file the core was pinned in two ways and neither is enough for that:
 *
 *   npm run verify     replays one recorded stick stream in FREE AIR. It
 *                      never raises a floor, never touches a wall, and never
 *                      flies the whoop.
 *   contact:selftest   drives the ground plane, but asserts ranges: "the
 *                      slide is short", "it settles". A solver rewrite can
 *                      move every number it measures and stay green.
 *
 * So this flies a set of scripted runs through dist/sim.wasm in Node and
 * hashes the full state block after every 1 ms step: free air in acro,
 * angle and arcade, the air and gravity knobs, a sagging pack, takeoff and
 * landing, a hard drop, a belly crash at speed, an inverted landing and a
 * turtle, a slope, the launch stand, a deck edge that lifts the plane under
 * a moving craft, a side arrival, and every contact entry point the shell
 * calls today, on both airframes. The hashes are compared with
 * tests/goldens/plant.json. Equal means the plant did exactly what it did
 * when the golden was written, to the last bit of every double, at every
 * millisecond.
 *
 * WHAT A FAILURE MEANS. Something changed what the plant does in a
 * situation the change may not have been about. The report names the first
 * 50 ms window that differs and the state fields that moved at the nearest
 * sample, so "the solver rewrite changed a landing on flat grass" is one
 * line to read. If the change was MEANT to reach that scenario, the owner
 * decides, the golden is rewritten with --write, and PROGRESS.md says which
 * scenarios moved and why. Rewriting it for any other reason is the same
 * cheat as widening a band in tests/thresholds.json.
 *
 * THE SCENARIOS ALSO HAVE TO STILL TEST SOMETHING. A pinned run that no
 * longer reaches the ground pins nothing. Each one carries an `exercises`
 * test on its own summary (it did hit at speed, it did end inverted, the
 * turtle did right it) that runs before the hash is compared, so a golden
 * cannot go quietly hollow.
 *
 * DETERMINISTIC by construction: no browser, no clock, no random, and the
 * stick streams are piecewise linear, so nothing transcendental is computed
 * on this side of the module either. Each scenario is also flown twice and
 * the two traces must agree before anything is compared.
 *
 * Usage:
 *   node scripts/plant-golden.js            compare with the golden
 *   node scripts/plant-golden.js --write    rewrite it (owner's call)
 *   node scripts/plant-golden.js --only=drop
 *   node scripts/plant-golden.js --selftest  prove it sees a small change
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
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const GOLDEN = join(root, 'tests/goldens/plant.json');

/* sim_abi.h's state block. */
const ST = {
  T: 0, X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6,
  QW: 7, QX: 8, QY: 9, QZ: 10, OX: 11, OY: 12, OZ: 13,
};
const FIELDS = [
  't', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'qw', 'qx', 'qy', 'qz', 'p', 'q', 'r',
  'rpm0', 'rpm1', 'rpm2', 'rpm3', 'volts', 'amps',
];

/* The shell's RC frame rate: sticks reach the module on a 4 ms grid. */
const RC_PERIOD_MS = 4;
/* One digest per this many steps, so a mismatch can be placed in time. */
const WINDOW_MS = 50;
/* And the full state this often, so it can be named field by field. */
const SAMPLE_MS = 250;

/* Where the plane sits under a level, parked craft: the plant's own
 * hull_hz_down (src/native/plant.c), the same number src/main.js seats
 * REST_HEIGHT from. */
const REST = { 0: 0.045, 1: 0.010 };
/* The shell's grass (src/game/collide.js GROUND_MU and GROUND_E). Written
 * out rather than imported, so that retuning the shell's grass shows up here
 * as a deliberate edit and not as a silent golden failure. */
const GRASS_MU = 1.40;
const GRASS_E = 0.0;
/* 20 degrees about x, rounded; the module normalises it. */
const SLOPE_N = [0, 0.34202, 0.93969];
/* The shell's 28 degree launch block: a pitch-only half-angle quaternion. */
const STAND_Q = [0.970296, 0, 0.241922, 0];

/*
 * Sticks as keyframes [ms, roll, pitch, yaw, throttle], linear between
 * them and held after the last. A step is two keyframes RC_PERIOD_MS apart.
 */
function stickAt(keys, ms) {
  if (ms <= keys[0][0]) {
    return keys[0];
  }
  for (let i = 1; i < keys.length; i += 1) {
    const b = keys[i];
    if (ms <= b[0]) {
      const a = keys[i - 1];
      const u = (ms - a[0]) / (b[0] - a[0]);
      return [
        ms,
        a[1] + (b[1] - a[1]) * u,
        a[2] + (b[2] - a[2]) * u,
        a[3] + (b[3] - a[3]) * u,
        a[4] + (b[4] - a[4]) * u,
      ];
    }
  }
  return keys[keys.length - 1];
}

/* A held stick from `ms` for `dur` ms, entered and left with a one frame
 * ramp, as keyframes. */
function hold(ms, dur, roll, pitch, yaw, thr) {
  return [
    [ms + RC_PERIOD_MS, roll, pitch, yaw, thr],
    [ms + dur, roll, pitch, yaw, thr],
  ];
}

function seq(...parts) {
  const out = [[0, 0, 0, 0, 0]];
  for (const p of parts) {
    out.push(...p);
  }
  return out;
}

/* A freestyle minute compressed into eight seconds of free air: a climb,
 * forward flight, a roll, a back flip, a yaw spin, a punch, a drop into
 * propwash and a coordinated turn. */
const FREESTYLE = seq(
  hold(0, 500, 0, 0, 0, 0.5),
  hold(500, 1000, 0, 0.3, 0, 0.35),
  hold(1500, 500, 1, 0, 0, 0.2),
  hold(2000, 400, 0, 0, 0, 0.42),
  hold(2400, 500, 0, -1, 0, 0.15),
  hold(2900, 600, 0, 0, 0, 0.6),
  hold(3500, 1000, 0, 0, 1, 0.35),
  hold(4500, 500, 0, 0, 0, 1),
  hold(5000, 1000, 0, 0, 0, 0),
  hold(6000, 1000, 0.5, 0.4, 0.2, 0.45),
  hold(7000, 1000, 0, 0, 0, 0.3),
);

/*
 * A HEIGHT HOLD, so a run reaches the situation it is named for.
 *
 * Open loop sticks were the first draft and nine of the twenty scenarios
 * came out hollow: an 8 to 1 quad on a guessed throttle climbs to forty
 * metres and never lands, so "takeoff and land" pinned a takeoff. This is a
 * proportional, derivative and integral loop on the throttle, divided by the
 * tilt so a banked craft still holds height. Only + - * / and a clamp, so
 * nothing on this side of the module is transcendental either. Run on the
 * RC grid, like a pilot's thumb.
 */
const HOVER = { 0: 0.27, 1: 0.335 };

function clamp(v, a, b) {
  return v < a ? a : (v > b ? b : v);
}

function heightHold(ctx, st, zTarget) {
  const e = zTarget - st[ST.Z];
  ctx.i = clamp(ctx.i + e * (RC_PERIOD_MS / 1000) * 0.4, -0.3, 0.3);
  const up = upZ(st);
  const thr = (HOVER[ctx.af] + 0.15 * e - 0.1 * st[ST.VZ] + ctx.i) / (up > 0.5 ? up : 0.5);
  return clamp(thr, 0, 1);
}

/* Up to 1.5 m, hold, then a slow descent through the plane, throttle cut on
 * touchdown the way a pilot drops the stick once the skids are down. */
function takeoffLand(ms, st, ctx) {
  if (ms < 300) {
    return [0, 0, 0, 0];
  }
  if (ctx.touched) {
    return [0, 0, 0, 0];
  }
  if (ms >= 3500 && ctx.contacts > 0) {
    ctx.touched = true;
    return [0, 0, 0, 0];
  }
  const z = ms < 3000 ? 1.5 : 1.5 - ((ms - 3000) / 2500) * 1.9;
  return [0, 0, 0, heightHold(ctx, st, z)];
}

/* Angle mode, full forward stick at a held height until `untilMs`, then
 * whatever `after` says. The craft leaves at 60 degrees and is past 10 m/s
 * a second later. */
function runIn(z, untilMs, after) {
  return (ms, st, ctx) => (ms < untilMs
    ? [0, 1, 0, heightHold(ctx, st, z)]
    : after(ms, st, ctx));
}

const LEVEL = [1, 0, 0, 0];
const INVERTED_Q = [0, 1, 0, 0];
/* 100 degrees of pitch, tail down and past vertical, and 80 of roll: the
 * attitudes the drop probe of 2026-09-24 left standing. Written out rather
 * than computed, so nothing transcendental runs on this side. */
const TAIL_FIRST_Q = [0.6427876096865394, 0, 0.766044443118978, 0];
const ON_SIDE_Q = [0.766044443118978, 0.6427876096865394, 0, 0];
/* 90 degrees about body x, rounded; the module normalises it. */
const KNIFE_Q = [0.707107, 0.707107, 0, 0];

/*
 * The scenarios. `ground` is the plane: absent for free air, 'grass' for the
 * level plane at the airframe's rest height, 'slope' for the 20 degree one,
 * or a function of ms returning [nx, ny, nz, pz] for a plane the shell moves
 * under the craft. `sticks` is keyframes or a function (ms, state, ctx).
 * `events` are entry point calls at a given ms; ms 0 runs before the first
 * step. `exercises` must hold on the run's summary, or the scenario has
 * stopped testing what its name says.
 */
const SCENARIOS = [
  {
    name: 'free air, acro freestyle', ms: 8000, sticks: FREESTYLE,
    exercises: (s) => s.maxRate > 8 && s.maxSpeed > 8 && s.minUpZ < -0.5,
  },
  {
    name: 'free air, angle mode', ms: 6000, angle: true,
    sticks: seq(hold(0, 600, 0, 0, 0, 0.5), hold(600, 2000, 0, 0.7, 0, 0.4),
      hold(2600, 1200, -0.6, 0, 0.3, 0.38), hold(3800, 2200, 0, 0, 0, 0.3)),
    exercises: (s) => s.maxSpeed > 5 && s.minUpZ > 0.3,
  },
  {
    name: 'free air, arcade style', ms: 5000, arcade: true, sticks: FREESTYLE,
    exercises: (s) => s.maxRate > 8 && s.minUpZ < -0.5,
  },
  {
    name: 'free air, floaty and sinky knobs', ms: 5000, air: 0.7, gravity: 1.3,
    sticks: FREESTYLE,
    exercises: (s) => s.maxRate > 8,
  },
  {
    name: 'free air, sagging pack', ms: 5000, cellV: 3.5, sticks: FREESTYLE,
    exercises: (s) => s.minVolts < 3.5 * 6,
  },
  {
    name: 'grass, takeoff hover and land', ms: 7000, ground: 'grass',
    sticks: takeoffLand,
    exercises: (s) => s.maxZ > 1.2 && s.lastContactMs > 4000 && s.endSpeed < 0.2 && s.endUpZ > 0.95,
  },
  {
    name: 'grass, hard drop from height', ms: 4000, ground: 'grass',
    events: [{ ms: 0, pose: { z: 6, q: LEVEL } }],
    sticks: seq(hold(0, 4000, 0, 0, 0, 0)),
    exercises: (s) => s.firstContactSpeed > 8 && s.endSpeed < 0.5,
  },
  {
    name: 'grass, belly crash at speed', ms: 5000, ground: 'grass', angle: true,
    events: [{ ms: 0, pose: { z: 2, q: LEVEL } }],
    sticks: runIn(2, 1500, () => [0, 1, 0, 0]),
    exercises: (s) => s.firstContactSpeed > 8 && s.contactSteps > 50,
  },
  {
    name: 'grass, inverted landing then turtle', ms: 5500, ground: 'grass',
    events: [
      { ms: 0, pose: { z: 1.5, q: INVERTED_Q } },
      { ms: 2500, crashflip: 1 },
      { ms: 3900, crashflip: 0 },
    ],
    sticks: seq(hold(0, 2500, 0, 0, 0, 0), hold(2500, 1400, 0, 1, 0, 0),
      hold(3900, 1600, 0, 0, 0, 0)),
    exercises: (s) => s.upZAt(2400) < -0.8 && s.peakUpZAfter(2500) > 0,
  },
  {
    name: 'grass, side arrival at speed', ms: 5000, ground: 'grass', angle: true,
    events: [{ ms: 0, pose: { z: 2, q: LEVEL } }, { ms: 1200, angle: false }],
    sticks: runIn(2, 1200, (ms) => (ms < 1330 ? [1, 0, 0, 0.05] : [0, 0, 0, 0.05])),
    /* Arrival by height, not by sim_ground_contacts: measured, a five inch
     * that lands on its side at speed is caught by the plant's projection
     * and settle and the contact counter reads zero throughout.
     *
     * It ends FLAT, since 2026-09-24. This used to require endUpZ < 0.5,
     * the craft left lying on its side, which was the plant's behaviour
     * when the golden was written. The owner then decided a crash tumbles
     * flat, always (TUMBLE FLAT, src/native/sim.c), and this run now ends
     * on its belly, which is the decision, not a hollow run. */
    exercises: (s) => s.arrivalSpeed > 4 && Math.abs(s.endUpZ) >= 0.96,
  },
  {
    name: 'slope, land and slide', ms: 4000, ground: 'slope',
    events: [{ ms: 0, pose: { z: 0.6, q: LEVEL } }],
    sticks: seq(hold(0, 4000, 0, 0, 0, 0)),
    exercises: (s) => s.contactSteps > 200 && s.minZ < -0.3,
  },
  {
    name: 'launch stand, punch off the rails', ms: 4000, stand: true,
    sticks: seq(hold(0, 400, 0, 0, 0, 0), hold(400, 1200, 0, 0, 0, 0.9),
      hold(1600, 2400, 0, 0, 0, 0.3)),
    events: [{ ms: 900, standOff: true, grassOn: true }],
    exercises: (s) => s.maxZ > 1 && s.minUpZAt400 < 0.95,
  },
  {
    name: 'deck edge lifts the plane under a moving craft', ms: 5000, angle: true,
    events: [{ ms: 0, pose: { z: 0.25, q: LEVEL } }],
    /* Low and slow over a level plane, which jumps 0.3 m for 1.2 s from
     * 2.5 s: the shell's height query doing what it does when the centre
     * crosses onto a platform. */
    sticks: (ms, st, ctx) => [0, 0.4, 0, heightHold(ctx, st, 0.25)],
    ground: (ms) => [0, 0, 1, (ms >= 2500 && ms < 3700 ? 0.3 : 0) - REST[0]],
    exercises: (s) => s.contactsBetween(2500, 3700) > 0 && s.contactsBetween(1500, 2500) === 0,
  },
  {
    name: 'wall contact through sim_contact_at', ms: 4000, angle: true,
    events: [
      { ms: 0, pose: { z: 3, q: LEVEL } },
      { ms: 2200, contactAt: { n: [1, 0, 0], e: 0.15, mu: 0.42, r: [-0.141, 0.02, 0] } },
      { ms: 2204, contactAt: { n: [1, 0, 0], e: 0.15, mu: 0.42, r: [-0.141, 0.02, 0] } },
      { ms: 2208, contactAt: { n: [1, 0, 0], e: 0.15, mu: 0.42, r: [-0.1, -0.1, 0.02] } },
      { ms: 2212, propStrike: 0.15 },
    ],
    sticks: runIn(3, 2200, (ms, st, ctx) => [0, 0, 0, heightHold(ctx, st, 3)]),
    exercises: (s) => s.speedDrop(2200) > 3,
  },
  {
    name: 'moving surface through sim_contact', ms: 3000, angle: true,
    events: [
      { ms: 0, pose: { z: 3, q: LEVEL } },
      { ms: 1500, contact: { n: [0, -1, 0], e: 0.06, mu: 0.4, vs: [20, 0, 0] } },
      { ms: 1504, contact: { n: [0, -1, 0], e: 0.06, mu: 0.4, vs: [20, 0, 0] } },
      { ms: 2200, deflect: { n: [0, 0, 1], e: 0.2 } },
    ],
    sticks: (ms, st, ctx) => [0, 0.5, 0, heightHold(ctx, st, 3)],
    exercises: (s) => s.maxRate > 1 && s.speedDrop(1500) !== 0,
  },
  {
    name: 'whoop, free air acro', ms: 6000, airframe: 1, sticks: FREESTYLE,
    exercises: (s) => s.maxRate > 8 && s.minUpZ < -0.5,
  },
  {
    name: 'whoop, takeoff hover and land', ms: 7000, airframe: 1, ground: 'grass',
    sticks: takeoffLand,
    exercises: (s) => s.maxZ > 1.2 && s.lastContactMs > 4000 && s.endSpeed < 0.2,
  },
  {
    name: 'whoop, hard drop', ms: 4000, airframe: 1, ground: 'grass',
    events: [{ ms: 0, pose: { z: 4, q: LEVEL } }],
    sticks: seq(hold(0, 4000, 0, 0, 0, 0)),
    exercises: (s) => s.firstContactSpeed > 4,
  },
  {
    name: 'whoop, inverted landing then turtle', ms: 5500, airframe: 1, ground: 'grass',
    events: [
      { ms: 0, pose: { z: 1, q: INVERTED_Q } },
      { ms: 2500, crashflip: 1 },
      { ms: 3900, crashflip: 0 },
    ],
    sticks: seq(hold(0, 2500, 0, 0, 0, 0), hold(2500, 1400, 0, 1, 0, 0),
      hold(3900, 1600, 0, 0, 0, 0)),
    exercises: (s) => s.upZAt(2400) < -0.8,
  },
  {
    name: 'whoop, side arrival at speed', ms: 5000, airframe: 1, ground: 'grass', angle: true,
    events: [{ ms: 0, pose: { z: 2, q: LEVEL } }, { ms: 1200, angle: false }],
    sticks: runIn(2, 1200, (ms) => (ms < 1330 ? [1, 0, 0, 0.05] : [0, 0, 0, 0.05])),
    exercises: (s) => s.firstContactSpeed > 3,
  },
  /*
   * TUMBLE FLAT, pinned, 2026-09-24. The owner's "yes make it tumble flat
   * always": dropped onto the grass at an attitude a crash leaves, the
   * craft ends lying flat on its belly or its back, still, whatever the
   * flight controller is doing. Before the change the five inch below came
   * to rest at exactly its drop attitude, tail down and pointing at the
   * sky, and the whoop balanced on a duct edge under airmode.
   */
  {
    name: 'grass, tail first drop tumbles flat', ms: 4000, ground: 'grass',
    events: [{ ms: 0, pose: { z: 1.2, q: TAIL_FIRST_Q } }],
    sticks: seq(hold(0, 4000, 0, 0, 0, 0)),
    exercises: (s) => Math.abs(s.endUpZ) >= 0.96 && s.endSpeed < 0.05,
  },
  {
    name: 'whoop, side drop tumbles flat', ms: 4000, airframe: 1, ground: 'grass',
    events: [{ ms: 0, pose: { z: 1.2, q: ON_SIDE_Q } }],
    sticks: seq(hold(0, 4000, 0, 0, 0, 0)),
    exercises: (s) => Math.abs(s.endUpZ) >= 0.96 && s.endSpeed < 0.05,
  },
  {
    name: 'whoop, wall contact through sim_contact_at', ms: 3500, airframe: 1, angle: true,
    events: [
      { ms: 0, pose: { z: 3, q: LEVEL } },
      { ms: 2000, contactAt: { n: [1, 0, 0], e: 0.15, mu: 0.42, r: [-0.05, 0.01, 0] } },
      { ms: 2004, contactAt: { n: [1, 0, 0], e: 0.15, mu: 0.42, r: [-0.05, 0.01, 0] } },
    ],
    sticks: runIn(3, 2000, (ms, st, ctx) => [0, 0, 0, heightHold(ctx, st, 3)]),
    exercises: (s) => s.speedDrop(2000) > 2,
  },
];

const CONFIG_FOR = {
  0: 'tests/fixtures/config-baseline.diff',
  1: 'configs/whoop-freestyle.diff',
};

function upZ(st) {
  const x = st[ST.QX];
  const y = st[ST.QY];
  return 1 - 2 * (x * x + y * y);
}

function speed(st) {
  return Math.sqrt(st[ST.VX] * st[ST.VX] + st[ST.VY] * st[ST.VY] + st[ST.VZ] * st[ST.VZ]);
}

function rate(st) {
  return Math.sqrt(st[ST.OX] * st[ST.OX] + st[ST.OY] * st[ST.OY] + st[ST.OZ] * st[ST.OZ]);
}

function call(sim, name, ...args) {
  if (typeof sim.e[name] !== 'function') {
    throw new Error(`sim.wasm does not export ${name}`);
  }
  const code = sim.e[name](...args);
  if (code !== SIM_OK) {
    throw new Error(`${name}: ${simErrorName(code)}`);
  }
}

function planeFor(sc, ms) {
  const af = sc.airframe || 0;
  if (sc.ground === 'grass') {
    return [0, 0, 1, -REST[af]];
  }
  if (sc.ground === 'slope') {
    /* Through the point under the parked craft, so it starts seated. */
    return [SLOPE_N[0], SLOPE_N[1], SLOPE_N[2], -REST[af]];
  }
  if (typeof sc.ground === 'function') {
    return sc.ground(ms);
  }
  return null;
}

/*
 * Mutation hooks for --selftest, zero in every real run. A golden that
 * cannot see a change is not a golden, so the self test nudges one input
 * and asserts that exactly the scenarios that input reaches go red, and that
 * nothing else does. Friction is nudged by a part in ten million. The
 * throttle is nudged by two RC counts, 0.002, because a stick reaches the
 * controller as a whole Betaflight RC value the way a radio's does: measured,
 * a 1e-9 nudge changed nothing in any of the 21 runs, and that is the
 * receiver being honest, not the golden being blind.
 */
const MUTATE = { groundMu: 0, throttle: 0 };

/* Low enough that the hull is at the grass whichever way up it is. */
const LOW = { 0: 0.12, 1: 0.05 };

/* The per 100 ms record the `exercises` tests read. */
const BIN_MS = 100;

function applyEvent(sim, ev, st, speedAt, ms, flags) {
  speedAt[ms] = speed(st);
  if (ev.pose) {
    const q = ev.pose.q;
    call(sim, 'sim_set_pose', 0, 0, ev.pose.z, q[0], q[1], q[2], q[3]);
    call(sim, 'sim_rest');
  }
  if (ev.angle != null) {
    sim.setAngleMode(ev.angle);
  }
  if (ev.crashflip != null) {
    call(sim, 'sim_set_crashflip', ev.crashflip);
  }
  if (ev.standOff) {
    call(sim, 'sim_set_launch_stand', 0, 0, 0, 0, 1, 0, 0, 0);
  }
  if (ev.grassOn) {
    flags.grassLate = true;
  }
  if (ev.contactAt) {
    const c = ev.contactAt;
    call(sim, 'sim_contact_at', c.n[0], c.n[1], c.n[2], c.e, c.mu,
      st[ST.X], st[ST.Y], st[ST.Z], 0, 0, 0, c.r[0], c.r[1], c.r[2]);
  }
  if (ev.contact) {
    const c = ev.contact;
    call(sim, 'sim_contact', c.n[0], c.n[1], c.n[2], c.e, c.mu,
      st[ST.X], st[ST.Y], st[ST.Z], c.vs[0], c.vs[1], c.vs[2]);
  }
  if (ev.deflect) {
    const c = ev.deflect;
    call(sim, 'sim_deflect', c.n[0], c.n[1], c.n[2], c.e, 1, 1, st[ST.X], st[ST.Y], st[ST.Z]);
  }
  if (ev.propStrike != null) {
    call(sim, 'sim_prop_strike', ev.propStrike);
  }
}

async function fly(wasm, configs, sc) {
  const sim = await loadSim(wasm);
  const af = sc.airframe || 0;
  call(sim, 'sim_set_airframe', af);
  if (sim.init(configs[af]) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(sc.cellV ?? 4.2);
  if (sc.angle) {
    sim.setAngleMode(true);
  }
  if (sc.arcade) {
    call(sim, 'sim_set_flight_style', 1);
  }
  if (sc.air != null) {
    call(sim, 'sim_set_air', sc.air);
  }
  if (sc.gravity != null) {
    call(sim, 'sim_set_gravity', sc.gravity);
  }
  if (sc.stand) {
    const s0 = sim.readState().state;
    call(sim, 'sim_set_launch_stand', 1, s0[ST.X], s0[ST.Y], s0[ST.Z], ...STAND_Q);
  }

  const hash = createHash('sha256');
  const windows = [];
  let win = createHash('sha256');
  const samples = [];
  const bins = Math.ceil(sc.ms / BIN_MS);
  const rec = {
    upZ: new Array(bins).fill(0),
    upZMax: new Array(bins).fill(-1),
    contacts: new Array(bins).fill(0),
  };
  const s = {
    maxRate: 0, maxSpeed: 0, maxZ: -Infinity, minZ: Infinity, minUpZ: 1,
    minVolts: Infinity, contactSteps: 0, lastContactMs: -1,
    firstContactSpeed: null, firstContactUpZ: null, endSpeed: 0, endUpZ: 1,
    minUpZAt400: 1, arrivalSpeed: null, maxThrottle: 0,
  };
  const speedAt = {};
  const speedAfter = {};
  const eventsAt = new Map();
  for (const ev of sc.events || []) {
    eventsAt.set(ev.ms, [...(eventsAt.get(ev.ms) || []), ev]);
  }
  const flags = { grassLate: false };
  const ctx = { af, i: 0, contacts: 0, touched: false };
  let st = sim.readState().state;
  let lastSpeed = 0;
  const cbuf = Buffer.alloc(4);

  for (let ms = 0; ms < sc.ms; ms += 1) {
    for (const ev of eventsAt.get(ms) || []) {
      applyEvent(sim, ev, st, speedAt, ms, flags);
      st = sim.readState().state;
    }
    if (ms % RC_PERIOD_MS === 0) {
      const k = typeof sc.sticks === 'function'
        ? sc.sticks(ms, st, ctx)
        : stickAt(sc.sticks, ms).slice(1);
      if (k[3] > s.maxThrottle) {
        s.maxThrottle = k[3];
      }
      if (sim.input(ms / 1000, k[0], k[1], k[2], k[3] + MUTATE.throttle) !== SIM_OK) {
        throw new Error(`sim_input refused at ${ms} ms`);
      }
    }
    /* The plane is re-seated before every step, as the shell does it. */
    const pl = flags.grassLate ? [0, 0, 1, -REST[af]] : planeFor(sc, ms);
    if (pl) {
      call(sim, 'sim_set_ground', 1, pl[0], pl[1], pl[2], 0, 0, pl[3],
        GRASS_MU + MUTATE.groundMu, GRASS_E);
    }
    sim.step(1);
    const { code, bytes } = sim.readStateBytes();
    if (code < 0 || !bytes) {
      throw new Error(`sim_state: ${simErrorName(code)}`);
    }
    const contacts = sim.e.sim_ground_contacts();
    cbuf.writeInt32LE(contacts);
    hash.update(bytes);
    hash.update(cbuf);
    win.update(bytes);
    win.update(cbuf);
    st = sim.readState().state;
    ctx.contacts = contacts;
    if ((ms + 1) % WINDOW_MS === 0) {
      windows.push(win.digest('hex').slice(0, 12));
      win = createHash('sha256');
    }
    if ((ms + 1) % SAMPLE_MS === 0) {
      samples.push(Array.from(st));
    }
    for (let i = 0; i < st.length; i += 1) {
      if (!Number.isFinite(st[i])) {
        throw new Error(`state went non-finite at ${ms} ms, field ${FIELDS[i]}`);
      }
    }

    const sp = speed(st);
    const u = upZ(st);
    const bin = Math.floor(ms / BIN_MS);
    rec.upZ[bin] = u;
    rec.upZMax[bin] = Math.max(rec.upZMax[bin], u);
    rec.contacts[bin] += contacts > 0 ? 1 : 0;
    s.maxRate = Math.max(s.maxRate, rate(st));
    s.maxSpeed = Math.max(s.maxSpeed, sp);
    s.maxZ = Math.max(s.maxZ, st[ST.Z]);
    s.minZ = Math.min(s.minZ, st[ST.Z]);
    s.minUpZ = Math.min(s.minUpZ, u);
    s.minVolts = Math.min(s.minVolts, st[18]);
    if (ms <= 400) {
      s.minUpZAt400 = Math.min(s.minUpZAt400, u);
    }
    if (contacts > 0) {
      /* The speed the craft ARRIVED with: the step before the first contact
       * after the first 50 ms, which is the start seat on the grass runs. */
      if (s.firstContactSpeed == null && ms > 50 && s.contactSteps === 0) {
        s.firstContactSpeed = lastSpeed;
        s.firstContactUpZ = u;
      }
      if (ms > 50) {
        s.contactSteps += 1;
        s.lastContactMs = ms;
      }
    }
    if (s.arrivalSpeed == null && ms > 50 && st[ST.Z] < LOW[af]) {
      s.arrivalSpeed = sp;
    }
    lastSpeed = sp;
    for (const at of Object.keys(speedAt)) {
      if (ms === Number(at) + 20) {
        speedAfter[at] = sp;
      }
    }
  }
  s.endSpeed = speed(st);
  s.endUpZ = upZ(st);
  const view = {
    ...s,
    upZAt: (ms) => rec.upZ[Math.floor(ms / BIN_MS)],
    peakUpZAfter: (ms) => Math.max(...rec.upZMax.slice(Math.floor(ms / BIN_MS))),
    contactsBetween: (a, b) => rec.contacts.slice(Math.floor(a / BIN_MS), Math.floor(b / BIN_MS))
      .reduce((x, y) => x + y, 0),
    speedDrop: (ms) => (speedAt[ms] != null && speedAfter[ms] != null ? speedAt[ms] - speedAfter[ms] : 0),
  };
  return {
    steps: sc.ms,
    hash: hash.digest('hex'),
    windows,
    samples,
    summary: s,
    view,
  };
}

function round(v, d = 4) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return v;
  }
  const k = 10 ** d;
  return Math.round(v * k) / k;
}

function readable(summary) {
  const out = {};
  for (const [k, v] of Object.entries(summary)) {
    if (v && typeof v === 'object') {
      const o = {};
      for (const [kk, vv] of Object.entries(v)) {
        o[kk] = round(vv);
      }
      out[k] = o;
    } else {
      out[k] = round(v);
    }
  }
  return out;
}

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function runAll({ write, only, quiet }) {
  const say = quiet ? () => {} : (line) => console.log(line);
  const wasm = await readFile(join(root, 'dist/sim.wasm'));
  const configs = {};
  const configHashes = {};
  for (const [af, rel] of Object.entries(CONFIG_FOR)) {
    configs[af] = await readFile(join(root, rel), 'utf8');
    configHashes[rel] = sha(configs[af]).slice(0, 16);
  }
  const golden = existsSync(GOLDEN) ? JSON.parse(await readFile(GOLDEN, 'utf8')) : null;
  if (!write && !golden) {
    say('plant-golden: no golden at tests/goldens/plant.json. Write one with --write.');
    return { failures: 1, failed: new Set() };
  }

  let failures = 0;
  const failed = new Set();
  const fail = (name, line) => {
    failures += 1;
    failed.add(name);
    say(line);
  };
  const out = {
    note: 'Written by scripts/plant-golden.js --write. Rewrite only with the owner\'s approval, and say in PROGRESS.md which scenarios moved and why.',
    wasmSha256: sha(wasm),
    configs: configHashes,
    windowMs: WINDOW_MS,
    sampleMs: SAMPLE_MS,
    scenarios: {},
  };
  say(`plant-golden: dist/sim.wasm ${out.wasmSha256.slice(0, 16)}, ${SCENARIOS.length} scenarios${write ? ', WRITING' : ''}\n`);
  if (golden && golden.wasmSha256 !== out.wasmSha256) {
    say(`  note  the module differs from the one the golden was written against (${golden.wasmSha256.slice(0, 16)}).`);
    say('        Equal traces from a different module is the claim under test.\n');
  }

  for (const sc of SCENARIOS) {
    if (only && !sc.name.toLowerCase().includes(only.toLowerCase())) {
      if (golden && golden.scenarios[sc.name]) {
        out.scenarios[sc.name] = golden.scenarios[sc.name];
      }
      continue;
    }
    let a;
    let b;
    try {
      a = await fly(wasm, configs, sc);
      b = await fly(wasm, configs, sc);
    } catch (e) {
      fail(sc.name, `  FAIL  ${sc.name}: ${e.message}`);
      continue;
    }
    if (a.hash !== b.hash) {
      fail(sc.name, `  FAIL  ${sc.name}: two identical runs disagree, so nothing about it can be pinned`);
      continue;
    }
    if (!sc.exercises(a.view)) {
      fail(sc.name, `  FAIL  ${sc.name}: no longer exercises what it is named for\n        ${JSON.stringify(readable(a.summary))}`);
      continue;
    }
    out.scenarios[sc.name] = {
      steps: a.steps, hash: a.hash, summary: readable(a.summary),
      windows: a.windows, samples: a.samples,
    };
    if (write) {
      say(`  wrote ${sc.name}  ${a.hash.slice(0, 16)}`);
      continue;
    }
    const g = golden.scenarios[sc.name];
    if (!g) {
      fail(sc.name, `  FAIL  ${sc.name}: not in the golden (new scenario? write it with the owner's approval)`);
      continue;
    }
    if (g.hash === a.hash) {
      say(`  pass  ${sc.name}  ${a.hash.slice(0, 16)}`);
      continue;
    }
    const w = a.windows.findIndex((h, i) => h !== g.windows[i]);
    const atMs = w < 0 ? a.steps : w * WINDOW_MS;
    let line = `  FAIL  ${sc.name}: differs from ${atMs} ms (the ${WINDOW_MS} ms window ending at ${atMs + WINDOW_MS} ms)`;
    const si = Math.floor((atMs + WINDOW_MS) / SAMPLE_MS);
    const k = Math.min(si, a.samples.length - 1, g.samples.length - 1);
    if (k >= 0) {
      const moved = [];
      for (let i = 0; i < FIELDS.length; i += 1) {
        if (a.samples[k][i] !== g.samples[k][i]) {
          moved.push(`${FIELDS[i]} ${g.samples[k][i].toPrecision(10)} -> ${a.samples[k][i].toPrecision(10)}`);
        }
      }
      line += `\n        at ${(k + 1) * SAMPLE_MS} ms: ${moved.length ? moved.slice(0, 8).join(', ') : 'no field moved at this sample'}`;
    }
    fail(sc.name, line);
  }

  if (write) {
    await mkdir(dirname(GOLDEN), { recursive: true });
    /* One line per window list and per sample, so a rewrite reads as a
     * diff of the scenarios that moved rather than of every number. */
    const text = JSON.stringify(out, null, 1)
      .replace(/\[\s*([-0-9.e+,\s"a-f]*?)\s*\]/g, (m, body) => `[${body.replace(/\s+/g, '')}]`);
    await writeFile(GOLDEN, `${text}\n`);
    say(`\nplant-golden: wrote ${GOLDEN.slice(root.length + 1)}`);
  }
  return { failures, failed };
}

/*
 * THE SELF TEST: does the golden see a change, and does it see only the
 * scenarios the change reaches? Two mutations, each a part in ten million.
 */
async function selftest() {
  let bad = 0;
  const golden = existsSync(GOLDEN) ? JSON.parse(await readFile(GOLDEN, 'utf8')) : null;
  const grounded = SCENARIOS.filter((sc) => sc.ground || sc.stand).map((sc) => sc.name);
  const clean = await runAll({ quiet: true });
  console.log(`  ${clean.failures === 0 ? 'pass' : 'FAIL'}  unmutated, every scenario matches the golden (${clean.failures} differ)`);
  bad += clean.failures === 0 ? 0 : 1;

  MUTATE.groundMu = 1.4e-7;
  const mu = await runAll({ quiet: true });
  MUTATE.groundMu = 0;
  const muMissed = grounded.filter((n) => !mu.failed.has(n));
  const muExtra = [...mu.failed].filter((n) => !grounded.includes(n));
  const muOk = muMissed.length === 0 && muExtra.length === 0;
  console.log(`  ${muOk ? 'pass' : 'FAIL'}  grass friction +1e-7 turns exactly the ${grounded.length} grounded scenarios red`
    + `${muMissed.length ? `; missed: ${muMissed.join(', ')}` : ''}${muExtra.length ? `; also: ${muExtra.join(', ')}` : ''}`);
  bad += muOk ? 0 : 1;

  /* Two counts on a stick held at zero stays under Betaflight's low
   * throttle band, so a run that never opens the throttle cannot see it and
   * must NOT go red either: that half of the test is what shows the golden
   * is not simply red on every change. */
  const opened = SCENARIOS.map((sc) => sc.name)
    .filter((n) => ((golden || {}).scenarios || {})[n]?.summary?.maxThrottle > 0.1);
  MUTATE.throttle = 0.002;
  const thr = await runAll({ quiet: true });
  MUTATE.throttle = 0;
  const thrMissed = opened.filter((n) => !thr.failed.has(n));
  const thrExtra = [...thr.failed].filter((n) => !opened.includes(n));
  const thrOk = thrMissed.length === 0 && thrExtra.length === 0;
  console.log(`  ${thrOk ? 'pass' : 'FAIL'}  throttle stick +2 RC counts turns exactly the ${opened.length} scenarios that open the throttle red`
    + `${thrMissed.length ? `; missed: ${thrMissed.join(', ')}` : ''}${thrExtra.length ? `; also: ${thrExtra.join(', ')}` : ''}`);
  bad += thrOk ? 0 : 1;
  console.log(`\nplant-golden selftest: ${bad === 0 ? 'all passed' : `${bad} FAILED`}`);
  return bad;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    process.exit(await selftest());
  }
  const write = args.includes('--write');
  const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
  const { failures } = await runAll({ write, only });
  console.log(`\nplant-golden: ${failures === 0 ? 'all passed' : `${failures} FAILED`}`);
  process.exit(failures);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
