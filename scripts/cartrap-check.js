/*
 * cartrap-check.js: a car that hits the craft knocks it off, once, and does
 * not carry it down the road. bug-3e12c7a9.
 *
 * THE REPORT. Hibari Yard, a five inch on a radio: "Was trying to do a matty
 * flip, got hit by cars, and dragged along the road with no escape", and the
 * pilot expected "Reset, or bounce off".
 *
 * WHY IT HAPPENED. A crash has been a dull bounce since the owner's word of
 * 2026-10-16 (src/game/collide.js, A CRASH IS A DULL BOUNCE): on the step the
 * shell's judge calls a crash or a knock, the craft's spin is taken off and it
 * is sent off the face at a walking pace, DULL_OUT_MIN to DULL_OUT_MAX, 0.3 to
 * 1.2 m/s. dullBounce meets a face that moves at the face's own speed when it
 * is handed one (`surf`), and the shell handed one for a windmill's sail and
 * for nothing else (src/main.js sailVelocity, now moverSurface). So a car at 10 to 20 m/s was a
 * still wall: the craft left its bonnet at a walking pace, the car drove into
 * it again on the next step, and the next, and every one of those steps was a
 * crash that took the spin off. The craft rode the car's front at the car's
 * speed with its attitude held where the first hit left it, which is exactly
 * "dragged along the road with no escape". windmill-check.js found the same
 * fault on a sail first ("96 bounces in 100 ms").
 *
 * THE FIX. A car's face is met at the car's own surface velocity where the
 * craft touched it, which the module already reports for every contact on a
 * road car (sim_world_vehicle_contacts, its [8..10]): vehicleSurfaceInPlant in
 * src/game/plantworld.js, called by src/main.js for a contact on a car, the
 * way a sail's is. Read only: nothing new reaches the physics but the bounce
 * the shell already puts on it.
 *
 * WHAT IS FLOWN. Hibari Yard's own document, solids and traffic, uploaded the
 * way the shell uploads them (uploadWorld, setWorldFrame, uploadTraffic), the
 * cars on the lap clock from step 0, and a five inch hovering a metre up in a
 * car's lane on the hold world-check.js flies. Every step, the shell's step
 * loop restated: CrashJudge on a 16 step frame, and on a crash or a knock
 * putDullBounce with the face's velocity as the shell finds it. Four hits:
 * the drift car down the lane at 20 m/s (worldruns.js yardHitRun's spot), the
 * same at a low hover, half a metre up, and the kei van and the box truck
 * coming up the other lane at 9 and 10 m/s, each from a lap clock that has
 * it there two seconds in. For each:
 *
 *   the car hits it                     a contact on that car's slot
 *   once, not dragged                   no more than two bounces in the
 *                                       100 ms from the first contact
 *   and never pinned to it afterwards   no more than two bounces in any
 *                                       100 ms of the flight, hands off
 *   off at the car's speed, a thud more the step after the first bounce, the
 *                                       craft's speed along the car's travel
 *                                       is the car's, and no more than
 *                                       DULL_OUT_MAX over it
 *   the same to the bit twice           a hash of every state and report
 *   a pilot who climbs is off it        holding 3.5 m higher a quarter of a
 *                                       second after the hit, no contact
 *                                       with any car a second after the
 *                                       first, and half a metre over the
 *                                       car's roof at the end
 *
 * Hands off, a craft the car has knocked ahead of it slows in the air while
 * the car does not, and the car catches it again: that is a car driving into
 * a thing in its lane, met as a push and not a pin, and the pilot has the
 * sticks back throughout. The way out of a lane is up, so that is what the
 * escape check flies.
 *
 * And the fault held in place: the same flights with the car met as a still
 * face, which is what the shell did before, must still be dragged, and the
 * climbing pilot still on the car a second later, so the check can see what
 * it is checking for.
 *
 * SEEN, NOT FIXED, and printed as a note rather than judged. Climbing from
 * the half metre hover, the drift car catches the craft again 289 ms after
 * the first hit, before it has climbed clear, on its front props alone at
 * about 1 m/s. That is no knock (a prop alone under GRAZE_SPEED_MAX is the
 * plant's soft props, by design), and the push on the front discs winds the
 * craft back to upZ 0.1 in 230 ms; its own thrust then holds it against the
 * car's front for about 2.2 s, with a knock every few steps, until it rights
 * itself. A craft held like that against a wall is set down by stuckTick in
 * src/main.js after 1.5 s, but stuckTick reads the craft's speed against the
 * ground, and against a car's front it is the car's, 19.7 m/s, so it never
 * reads still. Measuring it against the car instead is a change to the
 * recovery rule, left for the owner.
 *
 * Deterministic: the real plant (dist/sim.wasm), no browser, no wall clock.
 * Usage: node scripts/cartrap-check.js. Exit code is the number of failures.
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
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';
import { threePosToSim, simPosToThree } from '../src/render/frame.js';
import { sincos } from '../src/props/trig.js';
import { addSolids } from '../src/props/solids.js';
import { Colliders, GROUND_MU, GROUND_E, CrashJudge, putDullBounce, DULL_OUT_MAX } from '../src/game/collide.js';
import * as plantworld from '../src/game/plantworld.js';
import { normalize } from '../src/trackbuilder/model.js';
import { placeDocument, groundUnder, docToWorld } from '../src/maps/built/place.js';
import { starterMap } from '../src/maps/built/starter.js';
import { trafficOf, uploadTraffic } from '../src/maps/built/traffic.js';

const { uploadWorld, setWorldFrame, setVehicleClock, readVehicles, makeVehiclePoses } = plantworld;
/* The fix, or null on a tree that does not have it: then every car is met
 * as a still face, which is what the shell did, and the checks below fail. */
const vehicleSurfaceInPlant = typeof plantworld.vehicleSurfaceInPlant === 'function'
  ? plantworld.vehicleSurfaceInPlant
  : null;

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failures += 1;
  }
  return ok;
}
const r3 = (v) => Math.round(v * 1000) / 1000;

/* scripts/lib/worldruns.js's numbers: the shell's spawn height for the five
 * inch, its hover throttle, and world-check.js's height hold. */
const REST = 0.045;
const HOVER = 0.27;
const ST = { X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6, QX: 8, QY: 9 };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function upZ(st) {
  return 1 - 2 * (st[ST.QX] * st[ST.QX] + st[ST.QY] * st[ST.QY]);
}
function heightHold(ctx, st, z) {
  const e = z - st[ST.Z];
  ctx.i = clamp(ctx.i + e * 0.004 * 0.4, -0.3, 0.3);
  const u = upZ(st);
  return clamp((HOVER + 0.15 * e - 0.1 * st[ST.VZ] + ctx.i) / (u > 0.5 ? u : 0.5), 0, 1);
}
function call(sim, name, ...a) {
  if (typeof sim.e[name] !== 'function') {
    throw new Error(`sim.wasm does not export ${name}`);
  }
  const code = sim.e[name](...a);
  if (code < 0) {
    throw new Error(`${name}: ${simErrorName(code)}`);
  }
  return code;
}

/* The shell's plant frame at the map's spawn (src/main.js seatWorldFrame),
 * with the yaw's sine and cosine from src/props/trig.js, as frameTurn. */
function frameOf(sx, sy, sz, yaw) {
  const o = threePosToSim(sx, sy, sz, { x: 0, y: 0, z: 0 });
  return { sx, sy, sz, yaw, turn: sincos(yaw, { s: 0, c: 1 }), o: [o.x, o.y, o.z + REST] };
}
function toPlant(f, X, Y, Z) {
  const w = threePosToSim(X, Y, Z, { x: 0, y: 0, z: 0 });
  const dx = w.x - f.o[0];
  const dy = w.y - f.o[1];
  return [f.turn.c * dx + f.turn.s * dy, -f.turn.s * dx + f.turn.c * dy, w.z - f.o[2]];
}
const T3 = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
/* A plant frame velocity in the Three.js world, for judging only. */
function velToThree(f, st) {
  const c = f.turn.c;
  const s = f.turn.s;
  const v = simPosToThree(c * st[ST.VX] - s * st[ST.VY], s * st[ST.VX] + c * st[ST.VY], st[ST.VZ], T3);
  return [v.x, v.y, v.z];
}

/* Hibari Yard as the shell holds it: the placed document, its colliders,
 * its traffic and the frame at its spawn. */
function yard() {
  const doc = normalize(starterMap()).doc;
  const placed = placeDocument(doc);
  const colliders = new Colliders();
  addSolids(colliders, placed.solids);
  colliders.build();
  const sp = placed.spawn;
  const y = groundUnder(placed.tops, sp.x, sp.z, sp.y);
  return { doc, placed, colliders, traffic: trafficOf(doc), f: frameOf(sp.x, y, sp.z, sp.yaw) };
}

/*
 * src/main.js's step loop for one hover: the cars on the lap clock from
 * `clock0`, the ground plane at the paving (Hibari Yard's road is laid on it
 * at y 0, traffic.js THE FRAME), the judge on a 16 step frame, and on a crash
 * or a knock the dull bounce, with the face's velocity found the way the
 * shell finds it for a car. `still` meets every car as a still face, which is
 * what the shell did before the fix. `climb` is a pilot who, CLIMB_AFTER_MS
 * after the first contact, holds a height CLIMB_M higher instead: flying up
 * off the car, the one way out of a lane a car is driving down. Returns the
 * first contact on a car, which slot, every bounce, every step touching any
 * car, the craft and the car the step after the first bounce, the craft's
 * height over the road at the end, and a hash of every state and report.
 */
async function hover(Y, at, clock0, ms, { still = false, climb = false } = {}) {
  const sim = await loadSim(WASM);
  call(sim, 'sim_set_airframe', 0);
  if (sim.init(CONFIG) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  const n = uploadWorld(sim, Y.colliders);
  if (n !== Y.placed.solids.length) {
    throw new Error(`uploadWorld: ${n} for ${Y.placed.solids.length} solids`);
  }
  const { f } = Y;
  setWorldFrame(sim, f.sx, f.sy, f.sz, f.yaw, REST);
  const up = uploadTraffic(sim, Y.traffic);
  if (Y.traffic.problems.length || up.problems.length || up.vehicles !== Y.traffic.vehicles.length) {
    throw new Error('Hibari Yard\'s traffic was not taken');
  }
  setVehicleClock(sim, clock0);
  const p3 = docToWorld(Y.doc.field.width, Y.doc.field.depth, at[0], at[1], at[2]);
  const p = toPlant(f, p3.x, p3.y, p3.z);
  const ground = toPlant(f, p3.x, 0, p3.z)[2];
  call(sim, 'sim_set_pose', p[0], p[1], p[2], 1, 0, 0, 0);
  call(sim, 'sim_rest');
  sim.setAngleMode(true);
  const poses = makeVehiclePoses();
  const rep = new Float64Array(11);
  const repPtr = sim.e.malloc(11 * 8);
  const judge = new CrashJudge();
  judge.seat(f.turn.c, f.turn.s);
  const out = new Float64Array(3);
  const surf = new Float64Array(3);
  const hash = createHash('sha256');
  const ctx = { i: 0 };
  const res = { t0: -1, slot: -1, bounces: [], touching: [], craft: null, car: null, bounceStep: -1, height: 0 };
  let st = sim.readState().state;
  for (let step = 0; step < ms; step += 1) {
    if (step % 16 === 0) {
      judge.beginFrame();
    }
    if (step % 4 === 0) {
      const lifting = climb && res.t0 >= 0 && step >= res.t0 + CLIMB_AFTER_MS;
      sim.input(step / 1000, 0, 0, 0, heightHold(ctx, st, lifting ? p[2] + CLIMB_M : p[2]));
    }
    call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, ground, GROUND_MU, GROUND_E);
    const before = st;
    sim.step(1);
    st = sim.readState().state;
    call(sim, 'sim_world_report', repPtr);
    rep.set(new Float64Array(sim.e.memory.buffer, repPtr, 11));
    const car = rep[0] > 0 && rep[3] <= -2 ? -2 - rep[3] : -1;
    if (car >= 0 && res.t0 < 0) {
      res.t0 = step;
      res.slot = car;
    }
    if (res.t0 >= 0 && sim.e.sim_world_vehicle_contacts(0, 0) > 0) {
      res.touching.push(step);
    }
    const crashed = judge.step(before, st, sim.e.sim_ground_contacts(), rep, step + 1, true);
    if (crashed || judge.knock(rep, st)) {
      const kind = crashed ? judge.stepKind : 'solid';
      /* src/main.js moverSurface, for a car: the module's own surface
       * velocity where the craft touched it, in the plant frame. */
      const face = !still && car >= 0 && vehicleSurfaceInPlant
        ? vehicleSurfaceInPlant(sim, car, f.turn.c, f.turn.s, surf)
        : null;
      if (putDullBounce(sim, kind, before, st, rep, 0, 0, 1, f.turn.c, f.turn.s, out, !crashed, face)) {
        st = sim.readState().state;
        res.bounces.push(step);
        if (res.bounceStep < 0 && car >= 0) {
          res.bounceStep = step;
        }
      }
    }
    if (res.bounceStep >= 0 && step === res.bounceStep + 1) {
      readVehicles(sim, poses);
      const c = poses[res.slot];
      res.craft = velToThree(f, st);
      res.car = { vx: c.vx, vz: c.vz, speed: Math.hypot(c.vx, c.vz) };
    }
    hash.update(sim.readStateBytes().bytes);
    hash.update(Buffer.from(rep.buffer));
    if (!Number.isFinite(st[ST.X])) {
      throw new Error(`non-finite state at ${step} ms`);
    }
  }
  sim.e.free(repPtr);
  res.height = st[ST.Z] - ground;
  res.hash = hash.digest('hex');
  return res;
}

/* The most bounces in any 100 ms of a flight: a craft dragged on a face is
 * bounced every step it is held there. */
function mostIn100(bounces) {
  let most = 0;
  let lo = 0;
  for (let hi = 0; hi < bounces.length; hi += 1) {
    while (bounces[hi] - bounces[lo] >= 100) {
      lo += 1;
    }
    most = Math.max(most, hi - lo + 1);
  }
  return most;
}

let WASM = null;
let CONFIG = null;

/* Where each hit is flown, in the document's plan: [x, y, height]. */
const HITS = [
  /* worldruns.js yardHitRun: the drift car comes down the lane at 20 m/s
   * into a craft a metre up in its lane, south of the footbridge. */
  { name: 'the drift car down the lane', at: [141.5, 70, 1.0], clock: 0, style: 'r32' },
  /* The drift car again, the craft half a metre off the road. */
  { name: 'the drift car, half a metre up', at: [141.5, 70, 0.5], clock: 0, style: 'r32', climbNoted: true },
  /* The kei van coming up the other lane at 8.9 m/s, which reaches the
   * same spot about 19 s into the lap clock. */
  { name: 'the kei van up the lane', at: [138.2, 70, 1.0], clock: 17000, style: 'keivan' },
  /* And the box truck at 10 m/s, 2.46 m tall, about 37 s in. */
  { name: 'the box truck up the lane', at: [138.2, 70, 1.0], clock: 35000, style: 'boxtruck' },
];
/* How long each hover is flown, from its clock: long enough for the car to
 * reach the craft, and three seconds and more past that. */
const MS = 6000;
/* The climbing pilot: a quarter of a second to react, then a hold 3.5 m
 * higher, which clears the box truck's 2.46 m roof by two metres from a
 * one metre hover. */
const CLIMB_AFTER_MS = 250;
const CLIMB_M = 3.5;
/* The climb has this long from the first contact to be off the car for good. */
const CLEAR_MS = 1000;

async function main() {
  const wasmPath = join(root, 'dist', 'sim.wasm');
  if (!existsSync(wasmPath)) {
    check('dist/sim.wasm is built', false, 'no module to fly');
    process.exit(1);
  }
  WASM = await readFile(wasmPath);
  CONFIG = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  const Y = yard();
  console.log(`cartrap-check: Hibari Yard's cars meet a hovering craft (bug-3e12c7a9)${vehicleSurfaceInPlant ? '' : '; plantworld.js has no vehicleSurfaceInPlant, so every car is a still face'}`);
  for (const h of HITS) {
    console.log(`\n${h.name}`);
    const r = await hover(Y, h.at, h.clock, MS);
    const slotOf = Y.traffic.vehicles.find((v) => v.slot === r.slot);
    if (!check('the car hits it', r.t0 >= 0 && slotOf && slotOf.style === h.style,
      r.t0 >= 0 ? `at ${r.t0} ms, slot ${r.slot} (${slotOf ? slotOf.style : '?'})` : 'never touched')) {
      continue;
    }
    const early = r.bounces.filter((b) => b >= r.t0 && b < r.t0 + 100);
    check('once, not dragged along by it', early.length >= 1 && early.length <= 2,
      `${early.length} bounce${early.length === 1 ? '' : 's'} in the 100 ms from the first contact`);
    const most = mostIn100(r.bounces);
    check('and never pinned to it afterwards', most <= 2,
      `${most} bounces at the most in any 100 ms of the ${MS} ms, hands off the sticks`);
    if (r.craft && r.car) {
      const tx = r.car.vx / (r.car.speed || 1);
      const tz = r.car.vz / (r.car.speed || 1);
      const along = r.craft[0] * tx + r.craft[2] * tz;
      check('off at the car\'s speed, a thud more at the most',
        along >= r.car.speed - 0.05 && along <= r.car.speed + DULL_OUT_MAX + 0.05,
        `${r3(along)} m/s along the car's travel the step after, the car ${r3(r.car.speed)} m/s`);
    } else {
      check('off at the car\'s speed, a thud more at the most', false, 'the car never bounced it');
    }
    const twice = await hover(Y, h.at, h.clock, MS);
    check('the same flight twice is the same to the bit', twice.hash === r.hash, r.hash.slice(0, 16));
    /* The way out: a pilot who climbs is off the car for good. */
    const roof = slotOf.clearance + slotOf.height;
    const up = await hover(Y, h.at, h.clock, MS, { climb: true });
    const upLast = up.touching.length ? up.touching[up.touching.length - 1] : -1;
    const upNote = `the last touch ${upLast - up.t0} ms after the first, ${r3(up.height)} m over the road at the end, the roof at ${r3(roof)}`;
    if (h.climbNoted) {
      /* Not judged: see SEEN, NOT FIXED in the header. */
      console.log(`  note  climbing from half a metre, the car catches it again first: ${upNote}`);
    } else {
      check('a pilot who climbs is off it within a second, and clear of it',
        up.t0 >= 0 && upLast < up.t0 + CLEAR_MS && up.height > roof + 0.5, upNote);
    }
    /* The fault, held in place: met as a still face, the craft rides the
     * car, and climbing does not get it off. */
    const still = await hover(Y, h.at, h.clock, MS, { still: true });
    const stillEarly = still.bounces.filter((b) => b >= still.t0 && b < still.t0 + 100);
    const stillUp = await hover(Y, h.at, h.clock, MS, { still: true, climb: true });
    const stillUpLast = stillUp.touching.length ? stillUp.touching[stillUp.touching.length - 1] : -1;
    check('met as a still face it is dragged, so this check can see the fault',
      still.t0 >= 0 && stillEarly.length > 10 && stillUpLast >= stillUp.t0 + CLEAR_MS,
      `${stillEarly.length} bounces in the 100 ms from the first contact; climbing, still touching it ${stillUpLast - stillUp.t0} ms after the first`);
  }
  /* The shell's own wiring, read off src/main.js: main.js runs in a browser
   * and cannot be imported, so the call is held to its text. */
  const mainSrc = readFileSync(join(root, 'src', 'main.js'), 'utf8');
  check('src/main.js hands the dull bounce a car\'s surface velocity',
    /vehicleSurfaceInPlant\(sim,/.test(mainSrc) && /putDullBounce\([^)]*moverSurface\(rep\[3\]\)\)/.test(mainSrc),
    'vehicleSurfaceInPlant called, and applyDullBounce passing moverSurface(rep[3])');
  console.log(`\ncartrap-check: ${failures ? `${failures} failed` : 'all passed'}`);
  process.exit(failures);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
