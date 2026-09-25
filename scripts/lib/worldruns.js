/*
 * worldruns.js: the world golden's own flights, and the loop that flies
 * them.
 *
 * scripts/world-golden.js pins four sets of flights through dist/sim.wasm.
 * The first is scripts/world-check.js's scenarios, flown by world-check's own
 * code. The other three are here, because they need the same code in Node
 * and in a browser tab (scripts/world-engines.js flies them in both), and a
 * browser cannot import world-check:
 *
 *   town    each of scripts/crash-check.js's paths at its shopfront, in the
 *           town's own solids as the shell handed them to the module
 *           (tests/fixtures/town-crash.json), flown by a stick script on the
 *           4 ms RC grid instead of the in-page pilot, which runs on the
 *           frame clock and is not deterministic.
 *   built   the starter and a map of one of everything, placed by
 *           src/maps/built/place.js and uploaded by the shell's own
 *           src/game/plantworld.js, with the ground raised under the craft
 *           every step as the shell raises it.
 *   movers  a heading zero box moving along one axis, meeting a hovering
 *           craft and carrying one along its side, seated every step by the
 *           shell's own setMover from a closed form of the step count.
 *
 * And one set that is NOT the golden's, vehicleRuns() at the end: cars that
 * follow a road inside the module (Stage D part 2). goldenRuns() does not
 * return them, so tests/goldens/world.json neither holds nor misses them;
 * scripts/world-engines.js flies them in both engines, and
 * scripts/world-check.js holds them to their guards.
 *
 * NOTHING HERE REACHES THE PHYSICS THROUGH JS TRIGONOMETRY. The sticks are
 * + - * / and square roots, which IEEE 754 fixes to the bit; a frame's yaw
 * goes to the module as a number and is turned there by its own libm; where
 * this side needs the same frame's sine and cosine it takes them from
 * src/props/trig.js, which is arithmetic too. A craft is turned to a heading
 * by the half angle identities, square roots again.
 *
 * Environment neutral: no Node import. The host hands in the module's bytes,
 * the two configs, and the town fixture, parsed.
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

import { loadSim, SIM_OK, simErrorName } from '../../tests/lib/simmod.js';
import { threePosToSim, threeDirToSim, simPosToThree } from '../../src/render/frame.js';
import { Colliders, GROUND_MU, GROUND_E } from '../../src/game/collide.js';
import {
  uploadWorld, setWorldFrame, setMover, uploadRoad, addVehicle, setVehicleClock, readVehicles, makeVehiclePoses,
} from '../../src/game/plantworld.js';
import { addSolids, placeSolids } from '../../src/props/solids.js';
import { sincos } from '../../src/props/trig.js';
import { PROPS, FURNITURE } from '../../src/props/catalog.js';
import { styleDims } from '../../src/props/types.js';
import { createTrack, createElement, normalize } from '../../src/trackbuilder/model.js';
import { placeDocument, groundUnder } from '../../src/maps/built/place.js';
import { starterMap } from '../../src/maps/built/starter.js';

/* sim_abi.h's state block. */
const ST = { X: 1, Y: 2, Z: 3, VX: 4, VY: 5, VZ: 6, QW: 7, QX: 8, QY: 9, QZ: 10 };
/* src/native/plant.c hull_hz_down, the height a parked craft's CG sits over
 * the plane, and the shell's SPAWN_ALT. */
const REST = { 0: 0.045, 1: 0.010 };
/* scripts/world-check.js's hover throttles. */
const HOVER = { 0: 0.27, 1: 0.335 };
/* The RC frame: sticks reach the module every 4 ms, as the shell sends them. */
const RC_MS = 4;
/* src/main.js SURFACE_BIAS: the ground is asked for from this far under the CG. */
const SURFACE_BIAS = 0.40;
const G = 9.81;

function clamp(v, a, b) {
  return v < a ? a : (v > b ? b : v);
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

function upZ(st) {
  return 1 - 2 * (st[ST.QX] * st[ST.QX] + st[ST.QY] * st[ST.QY]);
}

function speedOf(st) {
  return Math.sqrt(st[ST.VX] * st[ST.VX] + st[ST.VY] * st[ST.VY] + st[ST.VZ] * st[ST.VZ]);
}

/* ------------------------------------------------------------------ *
 * Frames. W = Rz(yaw) p + O in the physics frame, as world.c holds it. The
 * module turns `yaw` with its own libm; this side takes the same yaw's sine
 * and cosine from trig.js, for placing a start and reading a position back.
 * Every basis change goes through src/render/frame.js.
 * ------------------------------------------------------------------ */
const V3 = () => ({
  x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
});

function frameAt(o, yaw) {
  const sc = sincos(yaw, { s: 0, c: 0 });
  return { o, yaw, c: sc.c, s: sc.s };
}

export function toPlant(f, X, Y, Z) {
  const w = threePosToSim(X, Y, Z, V3());
  const dx = w.x - f.o[0];
  const dy = w.y - f.o[1];
  return [f.c * dx + f.s * dy, -f.s * dx + f.c * dy, w.z - f.o[2]];
}

export function toThree(f, p) {
  const x = f.c * p[0] - f.s * p[1] + f.o[0];
  const y = f.s * p[0] + f.c * p[1] + f.o[1];
  const out = simPosToThree(x, y, p[2] + f.o[2], V3());
  return [out.x, out.y, out.z];
}

function dirToPlant(f, X, Y, Z) {
  const w = threeDirToSim(X, Y, Z, V3());
  return [f.c * w.x + f.s * w.y, -f.s * w.x + f.c * w.y, w.z];
}

/* A heading about up as a quaternion, from the heading's cosine and sine,
 * by the half angle identities (scripts/props-check.js yawQuat). */
function yawQuat(c, s) {
  const w = Math.sqrt(Math.max(0, (1 + c) / 2));
  let z = Math.sqrt(Math.max(0, (1 - c) / 2));
  if (s < 0) {
    z = -z;
  }
  return [w, 0, 0, z];
}

function unit2(x, y) {
  const l = Math.sqrt(x * x + y * y) || 1;
  return [x / l, y / l];
}

/* ------------------------------------------------------------------ *
 * The sticks.
 * ------------------------------------------------------------------ */

/* scripts/world-check.js's height hold, unchanged. */
function heightHold(ctx, st, z) {
  const e = z - st[ST.Z];
  ctx.i = clamp(ctx.i + e * 0.004 * 0.4, -0.3, 0.3);
  const u = upZ(st);
  return clamp((HOVER[ctx.af] + 0.15 * e - 0.1 * st[ST.VZ] + ctx.i) / (u > 0.5 ? u : 0.5), 0, 1);
}

/*
 * A TRACKER, in angle mode. `target(ms)` gives where the craft should be,
 * how fast, and how it is accelerating, in the plant frame; the tracker asks
 * for that acceleration plus a spring and a damper on the error, projects the
 * horizontal part onto the craft's own nose and left, and turns it into roll
 * and pitch stick by what full stick buys in angle mode. The vertical part
 * is thrust, through the square law, over the tilt. The nose is held on
 * `heading`, a unit vector in the plant's plane.
 *
 * It is scripts/lib/pilot.js's guidance law, the one crash-check flies,
 * rewritten for a fixed RC grid: that one reads the frame clock and takes
 * asin and atan2, and this one reads the step count and takes neither.
 * Signs measured, not assumed: pitch stick negative flies the nose forward,
 * roll stick positive flies right, yaw stick positive turns the nose right.
 */
const KP = 2.5;
const KD = 3.2;
const KZP = 1.6;
const KZD = 2.0;
/* Horizontal acceleration asked for at full stick: angle mode's limit is
 * about fifty degrees. */
const A_FULL = 12;
const KYAW = 1.0;

function tracker(target, heading, { hold = false } = {}) {
  return (ms, st, ctx) => {
    const t = target(ms);
    const ax = t.a[0] + KP * (t.p[0] - st[ST.X]) + KD * (t.v[0] - st[ST.VX]);
    const ay = t.a[1] + KP * (t.p[1] - st[ST.Y]) + KD * (t.v[1] - st[ST.VY]);
    const az = t.a[2] + KZP * (t.p[2] - st[ST.Z]) + KZD * (t.v[2] - st[ST.VZ]);
    const w = st[ST.QW];
    const x = st[ST.QX];
    const y = st[ST.QY];
    const z = st[ST.QZ];
    const [fx, fy] = unit2(1 - 2 * (y * y + z * z), 2 * (x * y + w * z));
    const along = ax * fx + ay * fy;
    const left = -ax * fy + ay * fx;
    const pitch = clamp(-along / A_FULL, -1, 1);
    const roll = clamp(-left / A_FULL, -1, 1);
    const err = fx * heading[1] - fy * heading[0];
    const yaw = clamp(-KYAW * err, -0.3, 0.3);
    if (hold) {
      /* A level target: world-check's height hold, tuned on both airframes. */
      return [roll, pitch, yaw, heightHold(ctx, st, t.p[2])];
    }
    ctx.i = clamp(ctx.i + (t.p[2] - st[ST.Z]) * 0.004 * 0.4, -0.3, 0.3);
    const lift = 1 + az / G;
    const u = upZ(st);
    const thr = clamp((HOVER[ctx.af] * Math.sqrt(lift > 0.02 ? lift : 0.02) + ctx.i) / (u > 0.5 ? u : 0.5), 0, 1);
    return [roll, pitch, yaw, thr];
  };
}

/*
 * A PATH, the way scripts/lib/pilot.js __ramp builds one: from rest at p0 to
 * p0 + d in `secs`, arriving at vEnd, s(u) = c2 u^2 + c3 u^3. Held at p0 for
 * settleMs first, and asked for the end, still at speed, for pushMs after,
 * as crash-check's pilot keeps asking for a point past the wall. Then the
 * pilot lets go: acro, sticks centred, `after` on the throttle.
 */
function pathSticks(P, heading) {
  const D = Math.sqrt(P.d[0] * P.d[0] + P.d[1] * P.d[1] + P.d[2] * P.d[2]) || 1;
  const G1 = clamp((P.vEnd * P.secs) / D, 0.2, 2.6);
  const c2 = 3 - G1;
  const c3 = G1 - 2;
  const endMs = P.settleMs + P.secs * 1000 + P.pushMs;
  const target = (ms) => {
    if (ms < P.settleMs) {
      return { p: P.p0, v: [0, 0, 0], a: [0, 0, 0] };
    }
    const u = clamp((ms - P.settleMs) / 1000 / P.secs, 0, 1);
    const sv = c2 * u * u + c3 * u * u * u;
    const dv = (2 * c2 * u + 3 * c3 * u * u) / P.secs;
    const av = (2 * c2 + 6 * c3 * u) / (P.secs * P.secs);
    return {
      p: [P.p0[0] + P.d[0] * sv, P.p0[1] + P.d[1] * sv, P.p0[2] + P.d[2] * sv],
      v: [P.d[0] * dv, P.d[1] * dv, P.d[2] * dv],
      a: [P.d[0] * av, P.d[1] * av, P.d[2] * av],
    };
  };
  const fly = tracker(target, heading);
  return (ms, st, ctx) => {
    if (ms >= endMs) {
      ctx.angle = false;
      return [0, 0, 0, P.after];
    }
    return fly(ms, st, ctx);
  };
}

/* ------------------------------------------------------------------ *
 * What a run measured, for its `exercises` test: a pinned run that no
 * longer reaches what it is named for pins nothing.
 * ------------------------------------------------------------------ */
function newMetrics() {
  return {
    firstTouchMs: -1, arrival: 0, firstAt: null, firstShape: -1,
    contactSteps: 0, moverSteps: 0, maxClosing: 0, supportsTouched: new Set(),
    shapesHit: new Set(), maxZ: -Infinity, maxPlan: 0, endSpeed: 0, endAt: null,
  };
}

/* ------------------------------------------------------------------ *
 * The host loop, which is scripts/world-check.js's fly() with two hooks: a
 * run's `before` seats the ground and the movers ahead of every step, as the
 * shell does, and its metrics are kept as it goes.
 * ------------------------------------------------------------------ */
export async function flyRun(run, env) {
  const af = run.airframe || 0;
  const sim = await loadSim(env.wasm);
  call(sim, 'sim_set_airframe', af);
  if (sim.init(env.configs[af]) !== SIM_OK) {
    throw new Error('sim_init failed');
  }
  sim.reset();
  sim.setCellVoltage(4.2);
  const ctx = { af, i: 0, angle: true, touched: false, t0: -1 };
  run.setup(sim, ctx);
  sim.setAngleMode(ctx.angle);
  let angleNow = ctx.angle;
  const rep = new Float64Array(11);
  const repPtr = sim.e.malloc(11 * 8);
  const m = newMetrics();
  let st = sim.readState().state;
  let prevSpeed = speedOf(st);
  for (let ms = 0; ms < run.ms; ms += 1) {
    if (ms % RC_MS === 0) {
      const k = run.sticks(ms, st, ctx);
      if (ctx.angle !== angleNow) {
        sim.setAngleMode(ctx.angle);
        angleNow = ctx.angle;
      }
      sim.input(ms / 1000, k[0], k[1], k[2], k[3]);
    }
    if (run.before) {
      run.before(sim, ms, st, ctx);
    }
    sim.step(1);
    st = sim.readState().state;
    call(sim, 'sim_world_report', repPtr);
    rep.set(new Float64Array(sim.e.memory.buffer, repPtr, 11));
    for (let i = 0; i < 14; i += 1) {
      if (!Number.isFinite(st[i])) {
        throw new Error(`non-finite state at ${ms} ms`);
      }
    }
    const sp = speedOf(st);
    /*
     * The first touch of anything in the world: an obstacle contact, or a
     * box top taken as the ground with the hull on it. A box whose top is
     * under the CG is the ground for that step (world.c, SUPPORT) and is
     * never reported as an obstacle, so a craft that skims a ledge at speed
     * touches the town without a single obstacle contact.
     */
    const onSupport = rep[10] >= 0 && sim.e.sim_ground_contacts() > 0;
    if (rep[0] > 0) {
      m.contactSteps += 1;
      if (!ctx.touched) {
        ctx.touched = true;
        ctx.t0 = ms;
      }
    }
    if ((rep[0] > 0 || onSupport) && m.firstTouchMs < 0) {
      m.firstTouchMs = ms;
      m.arrival = prevSpeed;
      m.firstAt = run.where ? run.where(st) : null;
    }
    if (m.firstShape === -1 && (onSupport || (rep[2] > 0 && rep[3] !== -1))) {
      m.firstShape = onSupport && !(rep[2] > 0 && rep[3] !== -1) ? rep[10] : rep[3];
    }
    if (rep[2] > 0 && rep[3] >= 0) {
      m.shapesHit.add(rep[3]);
    }
    if (rep[2] > 0 && rep[3] <= -2) {
      m.moverSteps += 1;
    }
    if (rep[1] > m.maxClosing) {
      m.maxClosing = rep[1];
    }
    if (onSupport) {
      m.supportsTouched.add(rep[10]);
    }
    if (st[ST.Z] > m.maxZ) {
      m.maxZ = st[ST.Z];
    }
    if (run.plan) {
      const d = run.plan(st);
      if (d > m.maxPlan) {
        m.maxPlan = d;
      }
    }
    prevSpeed = sp;
  }
  sim.e.free(repPtr);
  m.endSpeed = speedOf(st);
  m.endAt = run.where ? run.where(st) : null;
  return m;
}

/* ------------------------------------------------------------------ *
 * THE TOWN.
 * ------------------------------------------------------------------ */

/*
 * The fixture's shapes as the module takes them. Coordinates were float32
 * in the shell's collider set and are written as the shortest decimal that
 * comes back to the same float32, so Math.fround restores the exact double
 * the shell handed sim_world_box. JSON has no negative zero, and the basis
 * change makes some, so one is written as the string "-0".
 */
export function townShapes(fixture) {
  const out = [];
  for (const row of fixture.shapes) {
    const [index, type, mat, ...coords] = row;
    const [e, mu] = fixture.materials[mat];
    out.push({ index, type, args: [...coords.map((v) => (v === '-0' ? -0 : Math.fround(v))), e, mu] });
  }
  return out;
}

/* Distance in plan from (x, y) to the segment from the origin to (dx, dy). */
function planToSegment(x, y, dx, dy) {
  const L = dx * dx + dy * dy;
  const u = L > 0 ? clamp((x * dx + y * dy) / L, 0, 1) : 0;
  const ex = x - dx * u;
  const ey = y - dy * u;
  return Math.sqrt(ex * ex + ey * ey);
}

/* How long the craft hovers at the start before the path begins. */
const SETTLE_MS = 500;

function townRun(S, town) {
  /* The frame at the path's start, facing the pilot's heading. pilot.js
   * measures a heading as atan2 of the nose's Three.js x and z, so a heading
   * h looks down (sin h, cos h), and in the physics frame that is a yaw of
   * h plus a half turn. The nose then lies along the plant's +x. */
  const o3 = threePosToSim(S.from[0], S.from[1], S.from[2], V3());
  const f = frameAt([o3.x, o3.y, o3.z], S.heading + Math.PI);
  const d = toPlant(f, S.to[0], S.to[1], S.to[2]);
  const groundZ = town.ground.y - S.from[1];
  const P = {
    p0: [0, 0, 0], d, secs: S.secs, vEnd: S.vEnd, pushMs: S.pushMs, settleMs: SETTLE_MS, after: S.after ?? 0.34,
  };
  const W = town.wall;
  /* A fixture shape's bounds in Three.js metres, from the physics frame
   * box the module holds (src/render/frame.js: x is -y, z is -x). */
  const bounds3 = (i) => {
    const a = town.shapes[i] ? town.shapes[i].args : null;
    return a ? { x0: -a[4], x1: -a[1], y0: a[2], y1: a[5], z0: -a[3], z1: -a[0] } : null;
  };
  /* On the shopfront: a box whose face is on the face's plane or stands
   * up to 0.6 m proud of it (the ledge along its foot), over the stretch
   * crash-check's atTarget calls the face. */
  const onShopfront = (i) => {
    const b = i >= 0 ? bounds3(i) : null;
    return b !== null && b.x1 >= W.face - 0.6 && b.x0 <= W.face + 0.05 && b.z1 >= 27.2 && b.z0 <= 34.0 && b.y0 < W.roof;
  };
  const onRoofLine = (i) => {
    const b = bounds3(i);
    return b !== null && Math.abs(b.y1 - W.roof) < 0.05;
  };
  return {
    name: `town: ${S.name}`,
    group: 'town',
    ms: SETTLE_MS + S.secs * 1000 + S.pushMs + S.afterMs,
    setup(sim) {
      call(sim, 'sim_world_clear');
      call(sim, 'sim_world_frame', f.o[0], f.o[1], f.o[2], f.yaw);
      town.shapes.forEach((sh, i) => {
        const got = sh.type === 1 ? sim.e.sim_world_box(...sh.args) : sim.e.sim_world_capsule(...sh.args);
        if (got !== i) {
          throw new Error(`town shape ${sh.index} refused: ${got}`);
        }
      });
      const built = sim.e.sim_world_build();
      if (built !== town.shapes.length) {
        throw new Error(`sim_world_build: ${built} for ${town.shapes.length} shapes`);
      }
      call(sim, 'sim_set_pose', 0, 0, 0, 1, 0, 0, 0);
      call(sim, 'sim_rest');
    },
    sticks: pathSticks(P, [1, 0]),
    before(sim) {
      call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, groundZ, GROUND_MU, GROUND_E);
    },
    where: (st) => toThree(f, [st[ST.X], st[ST.Y], st[ST.Z]]),
    plan: (st) => planToSegment(st[ST.X], st[ST.Y], d[0], d[1]),
    /*
     * It reached the thing it is named for. A wall run's first touch is the
     * shopfront, at half the speed asked for or more. A roof run has a box
     * on the shopfront's roof line under it as the ground with the hull on
     * it. And no run ever went further from its own path than the
     * fixture's radius less a metre, so everything it could have touched is
     * in the fixture.
     */
    exercises(m) {
      const inside = m.maxPlan <= town.radius - 1;
      if (S.kind === 'roof') {
        return inside && [...m.supportsTouched].some(onRoofLine);
      }
      return inside && onShopfront(m.firstShape) && m.arrival >= 0.5 * S.vEnd;
    },
    describe: (m) => {
      const b = m.firstShape >= 0 ? bounds3(m.firstShape) : null;
      const box = b ? ` (town collider ${town.shapes[m.firstShape].index}, x ${b.x0.toFixed(2)} to ${b.x1.toFixed(2)}, top ${b.y1.toFixed(2)})` : '';
      const sup = [...m.supportsTouched].map((i) => `${town.shapes[i].index} top ${bounds3(i).y1.toFixed(2)}`).join(', ');
      return `first touch at ${m.arrival.toFixed(3)} m/s${box}, ${m.contactSteps} contact steps, standing on ${sup || 'no box'}, furthest ${m.maxPlan.toFixed(2)} m off its path (radius ${town.radius} m)`;
    },
  };
}

export function townRuns(fixture) {
  const town = {
    shapes: townShapes(fixture),
    ground: fixture.ground,
    radius: fixture.radius,
    wall: fixture.wall,
    shopfront: fixture.shopfront,
  };
  return fixture.scenarios.map((S) => townRun(S, town));
}

/* ------------------------------------------------------------------ *
 * BUILT MAPS.
 * ------------------------------------------------------------------ */

/*
 * One of everything, restated from scripts/props-check.js everythingDoc,
 * which is inside a script that runs when it is imported: every prop in
 * every style, every piece of furniture, the pads and a named gap, on a
 * 60 m grid so nothing reaches its neighbour.
 */
const CELL = 60;
const COLS = 8;
const PADS_YAW = 0.7;
const HEADINGS = [0, 0.4, Math.PI / 2, 1.570796, 2.2, -Math.PI];

export function everythingDoc() {
  const doc = createTrack('Everything', 'full', 'freestyle');
  doc.field.width = CELL * COLS;
  doc.field.depth = CELL * COLS;
  const entries = [{ type: 'startPads', yaw: PADS_YAW }];
  for (const [type, def] of Object.entries(PROPS)) {
    if (def.zone) {
      continue;
    }
    for (const style of def.styles ?? [null]) {
      entries.push({ type, style });
    }
  }
  for (const type of Object.keys(FURNITURE)) {
    if (type !== 'startPads') {
      entries.push({ type });
    }
  }
  entries.push({ type: 'gap', z: 1.2, name: 'CHECK GAP', points: 500 });
  entries.forEach((e, i) => {
    const x = CELL / 2 + (i % COLS) * CELL;
    const y = CELL / 2 + Math.floor(i / COLS) * CELL;
    const el = createElement(doc, e.type, { x, y, z: e.z ?? 0 }, e.yaw ?? HEADINGS[i % HEADINGS.length]);
    if (e.style) {
      el.style = e.style;
      Object.assign(el.dims, styleDims(e.type, e.style) ?? {});
    }
    if (e.name) {
      el.name = e.name;
    }
    if (e.points) {
      el.points = e.points;
    }
    doc.elements.push(el);
  });
  return normalize(doc).doc;
}

/* A placed map as the shell holds it: the collider set, the frame at the
 * spawn (src/main.js adoptSpawn and seatWorldFrame), and the height. */
function builtWorld(doc) {
  const placed = placeDocument(doc);
  const colliders = new Colliders();
  addSolids(colliders, placed.solids);
  colliders.build();
  const sp = placed.spawn;
  const y = groundUnder(placed.tops, sp.x, sp.z, sp.y);
  const o3 = threePosToSim(sp.x, y, sp.z, V3());
  const f = frameAt([o3.x, o3.y, o3.z + REST[0]], sp.yaw);
  const ranges = [];
  let at = 0;
  for (const it of placed.items) {
    const n = placeSolids(it.parts, it.x, it.y, it.z, it.yaw, it.turns, []).length;
    ranges.push({ item: it, from: at, to: at + n });
    at += n;
  }
  return {
    placed, colliders, f, y, ranges,
    height: (X, Z, fromY, cgY) => groundUnder(placed.tops, X, Z, fromY, cgY),
  };
}

/* The shell's one sided slope limiter (src/main.js limitSlope). */
function limitSlope(a, b) {
  if (a * b <= 0) {
    return 0;
  }
  return (a < 0 ? -a : a) < (b < 0 ? -b : b) ? a : b;
}

/*
 * The ground under the craft, raised before every step as src/main.js
 * raiseGroundFromState does it: the map's height under the CG, asked from
 * SURFACE_BIAS below it with the CG as cgY, and the five tap slope every
 * eight steps and every step past 60 degrees. scripts/props-check.js fly().
 */
function builtGround(w) {
  const n = [0, 0, 1];
  return (sim, ms, st) => {
    const p3 = toThree(w.f, [st[ST.X], st[ST.Y], st[ST.Z]]);
    const from = p3[1] - SURFACE_BIAS;
    if ((ms & 7) === 0 || upZ(st) < 0.5) {
      const e = 0.35;
      const h0 = w.height(p3[0], p3[2], from, p3[1]);
      const nx = limitSlope(h0 - w.height(p3[0] + e, p3[2], from, p3[1]), w.height(p3[0] - e, p3[2], from, p3[1]) - h0);
      const nz = limitSlope(h0 - w.height(p3[0], p3[2] + e, from, p3[1]), w.height(p3[0], p3[2] - e, from, p3[1]) - h0);
      const inv = 1 / Math.sqrt(nx * nx + e * e + nz * nz);
      const d = dirToPlant(w.f, nx * inv, e * inv, nz * inv);
      n[0] = d[0];
      n[1] = d[1];
      n[2] = d[2];
    }
    const gp = toPlant(w.f, p3[0], w.height(p3[0], p3[2], from, p3[1]), p3[2]);
    call(sim, 'sim_set_ground', 1, n[0], n[1], n[2], gp[0], gp[1], gp[2], GROUND_MU, GROUND_E);
  };
}

/* The map uploaded and its frame set as the shell does both (src/main.js
 * uploadPlantWorld and seatWorldFrame), then the craft posed. */
function builtSetupAt(w, p, q) {
  return (sim) => {
    const n = uploadWorld(sim, w.colliders);
    if (n !== w.placed.solids.length) {
      throw new Error(`uploadWorld: ${n} for ${w.placed.solids.length} solids`);
    }
    const sp = w.placed.spawn;
    setWorldFrame(sim, sp.x, w.y, sp.z, sp.yaw, REST[0]);
    call(sim, 'sim_set_pose', p[0], p[1], p[2], q[0], q[1], q[2], q[3]);
    call(sim, 'sim_rest');
  };
}

function rangeOf(w, type, style) {
  const r = w.ranges.find((x) => x.item.el.type === type && (style == null || x.item.el.style === style));
  if (!r) {
    throw new Error(`the map has no ${type}${style ? ` ${style}` : ''}`);
  }
  return r;
}

function inRange(r, i) {
  return i >= r.from && i < r.to;
}

/* A solid's bounds, Three.js metres: a capsule by its segment and radius. */
function boundsOf(s) {
  if (s.box) {
    return s.box;
  }
  const c = s.cap;
  return [
    Math.min(c[0], c[3]) - c[6], Math.min(c[1], c[4]) - c[6], Math.min(c[2], c[5]) - c[6],
    Math.max(c[0], c[3]) + c[6], Math.max(c[1], c[4]) + c[6], Math.max(c[2], c[5]) + c[6],
  ];
}

/* The highest top of item r's boxes that holds (x, z) with 0.3 m to spare,
 * read from the collider set because that float32 is what the module has;
 * -Infinity when none does. */
function roofTopAt(w, r, x, z) {
  let top = -Infinity;
  for (let i = r.from; i < r.to; i += 1) {
    const s = w.placed.solids[i].box;
    if (s && x - 0.3 >= s[0] && x + 0.3 <= s[3] && z - 0.3 >= s[2] && z + 0.3 <= s[5] && w.colliders.fby[i] > top) {
      top = w.colliders.fby[i];
    }
  }
  return top;
}

/* Nothing solid within `pad` of the box from (x0, y0, z0) to (x1, y1, z1),
 * except what lies wholly under y0: the roof itself. */
function clearAbove(w, x0, z0, x1, z1, y0, y1, pad) {
  const lo = [Math.min(x0, x1) - pad, Math.min(z0, z1) - pad];
  const hi = [Math.max(x0, x1) + pad, Math.max(z0, z1) + pad];
  for (const s of w.placed.solids) {
    const a = boundsOf(s);
    if (a[4] > y0 && a[1] < y1 && a[0] < hi[0] && a[3] > lo[0] && a[2] < hi[1] && a[5] > lo[1]) {
      return false;
    }
  }
  return true;
}

/*
 * Where on item r's roof a run of `back` metres along Three.js z, starting
 * `up` over the roof, fits: both ends over the same roof top, the whole
 * corridor clear by half a metre. Nearest the middle first, then toward
 * whichever end leaves room. `back` 0 is a column.
 */
function roofRun(w, r, up, back) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = r.from; i < r.to; i += 1) {
    const a = boundsOf(w.placed.solids[i]);
    b = [Math.min(b[0], a[0]), Math.min(b[1], a[2]), Math.max(b[2], a[3]), Math.max(b[3], a[5])];
  }
  const cx = (b[0] + b[2]) / 2;
  const cz = (b[1] + b[3]) / 2;
  const cands = [];
  for (let u = -6; u <= 6; u += 1) {
    for (let v = -6; v <= 6; v += 1) {
      cands.push([cx + u * 1.0, cz + v * 1.0, u * u + v * v]);
    }
  }
  cands.sort((p, q) => p[2] - q[2]);
  for (const [x, z] of cands) {
    for (const dz of [1, -1]) {
      const zs = z - dz * back;
      const top = roofTopAt(w, r, x, z);
      if (top < 3 || roofTopAt(w, r, x, zs) !== top) {
        continue;
      }
      if (clearAbove(w, x, zs, x, z, top + 0.01, top + up + 1.0, 0.5)) {
        return { x, z, zs, dz, top };
      }
    }
  }
  throw new Error(`no clear run of ${back} m on the roof`);
}

function builtRuns() {
  const out = [];
  const E = builtWorld(everythingDoc());
  const S = builtWorld(normalize(starterMap()).doc);
  const level = [1, 0, 0, 0];

  /* Hover at the spawn: from rest where the shell seats the craft, up to
   * 1.5 m over a second, held for two more (scripts/props-check.js
   * spawnScenario's lift off). Both maps spawn on the paving: the start pads
   * are drawn, not solid, so this pins that the spawn touches nothing. */
  for (const [label, w] of [['the starter', S], ['one of everything', E]]) {
    out.push({
      name: `built: ${label}, lift off and hover at the spawn`,
      group: 'built',
      ms: 3000,
      setup: builtSetupAt(w, [0, 0, 0], level),
      sticks: (ms, st, ctx) => [0, 0, 0, heightHold(ctx, st, Math.min(1.5, 1.5 * (ms / 1000)))],
      before: builtGround(w),
      where: (st) => toThree(w.f, [st[ST.X], st[ST.Y], st[ST.Z]]),
      /* It left the ground and touched nothing solid on the way. */
      exercises: (m) => m.contactSteps === 0 && m.supportsTouched.size === 0 && m.maxZ > 1.2,
      describe: (m) => `${m.contactSteps} steps against a solid, ${m.supportsTouched.size} boxes stood on, up to ${m.maxZ.toFixed(3)} m`,
    });
  }

  const flats = rangeOf(E, 'building', 'flats');
  const body = E.placed.solids[flats.from].box;

  /* A wall at 5 m/s: the flats' +z end, a clean face below the first
   * corridor parapet, square on at 2 m, from 8 m out. */
  {
    const w = E;
    const zFace = body[5];
    const x = (body[0] + body[3]) / 2;
    const from = toPlant(w.f, x, 2, zFace + 8);
    const to = toPlant(w.f, x, 2, zFace - 0.5);
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const h = unit2(d[0], d[1]);
    out.push({
      name: 'built: one of everything, the flats\' end wall at 5 m/s',
      group: 'built',
      ms: SETTLE_MS + 2200 + 100 + 1500,
      setup: builtSetupAt(w, from, yawQuat(h[0], h[1])),
      sticks: pathSticks({ p0: from, d, secs: 2.2, vEnd: 5, pushMs: 100, settleMs: SETTLE_MS, after: 0.34 }, h),
      before: builtGround(w),
      where: (st) => toThree(w.f, [st[ST.X], st[ST.Y], st[ST.Z]]),
      exercises: (m) => m.firstShape >= 0 && inRange(flats, m.firstShape) && m.arrival >= 2.5,
      describe: (m) => `first touched shape ${m.firstShape} (the flats are ${flats.from} to ${flats.to - 1}) at ${m.arrival.toFixed(3)} m/s`,
    });
  }

  /* crash-check's roof runs, laid on the flats' roof: the settle comes down
   * 2.24 m from over a spot to 0.36 m into the roof at 2 m/s; the dive
   * comes 4.24 m down and 9.6 m along at 8 m/s, along the roof's long axis
   * with the whole of it over the roof. */
  for (const R of [
    { label: 'settle onto the flats\' roof, 2 m/s', up: 2.24, back: 0, down: 0.36, secs: 2.4, vEnd: 2, pushMs: 200, afterMs: 2000 },
    { label: 'dive onto the flats\' roof, 8 m/s', up: 4.24, back: 9.6, down: 0.56, secs: 1.6, vEnd: 8, pushMs: 100, afterMs: 2500 },
  ]) {
    const w = E;
    const spot = roofRun(w, flats, R.up, R.back);
    const from = toPlant(w.f, spot.x, spot.top + R.up, spot.zs);
    const to = toPlant(w.f, spot.x, spot.top - R.down, spot.z);
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const hd = dirToPlant(w.f, 0, 0, spot.dz);
    const h = unit2(hd[0], hd[1]);
    out.push({
      name: `built: one of everything, ${R.label}`,
      group: 'built',
      ms: SETTLE_MS + R.secs * 1000 + R.pushMs + R.afterMs,
      setup: builtSetupAt(w, from, yawQuat(h[0], h[1])),
      sticks: pathSticks({ p0: from, d, secs: R.secs, vEnd: R.vEnd, pushMs: R.pushMs, settleMs: SETTLE_MS, after: 0 }, h),
      before: builtGround(w),
      where: (st) => toThree(w.f, [st[ST.X], st[ST.Y], st[ST.Z]]),
      exercises: (m) => [...m.supportsTouched].some((i) => inRange(flats, i)),
      describe: (m) => `supports touched ${[...m.supportsTouched].join(', ') || 'none'} (the flats are ${flats.from} to ${flats.to - 1}), ending ${m.endSpeed.toFixed(3)} m/s at ${m.endAt.map((v) => v.toFixed(2)).join(', ')}`,
    });
  }

  /* Under a scaffold board: the open scaffold's first lift, in the bay
   * between two transoms, the hull's top 2 cm under the board and asked to
   * be 5 mm into it, sliding the length of the bay at 2.5 m/s and on under
   * the next transom, a 30 mm tube, with about 4 cm to spare. Measured at
   * 2 cm into the board and 1.5 m/s, the board's grip held it to a stick
   * and slip crawl. */
  {
    const w = E;
    const sc = rangeOf(E, 'scaffold', 'open');
    let board = -1;
    for (let i = sc.from; i < sc.to; i += 1) {
      const s = w.placed.solids[i];
      if (s.box && s.name === 'board' && (board < 0 || s.box[1] < w.placed.solids[board].box[1])) {
        board = i;
      }
    }
    const bb = w.placed.solids[board].box;
    const under = w.colliders.fay[board];
    /* The board's long axis in plan is the longer of its two sides. */
    const alongZ = bb[5] - bb[2] > bb[3] - bb[0];
    const mid = alongZ ? (bb[0] + bb[3]) / 2 : (bb[2] + bb[5]) / 2;
    const lo = alongZ ? bb[2] : bb[0];
    /* Transoms every bay; start 0.35 m past the second one. */
    const bay = (alongZ ? bb[5] - bb[2] : bb[3] - bb[0]) / Math.round((alongZ ? bb[5] - bb[2] : bb[3] - bb[0]) / 2.5);
    const a0 = lo + bay + 0.35;
    const a1 = lo + 2 * bay + 0.3;
    const cg0 = under - 0.038 - 0.02;
    const cg1 = under - 0.038 + 0.005;
    const P3 = (a, y) => (alongZ ? [mid, y, a] : [a, y, mid]);
    const from = toPlant(w.f, ...P3(a0, cg0));
    const to = toPlant(w.f, ...P3(a1, cg1));
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const h = unit2(d[0], d[1]);
    out.push({
      name: 'built: one of everything, along a scaffold board\'s underside',
      group: 'built',
      ms: SETTLE_MS + 1200 + 300 + 500,
      setup: builtSetupAt(w, from, yawQuat(h[0], h[1])),
      sticks: pathSticks({ p0: from, d, secs: 1.2, vEnd: 2.5, pushMs: 300, settleMs: SETTLE_MS, after: 0.34 }, h),
      before: builtGround(w),
      where: (st) => toThree(w.f, [st[ST.X], st[ST.Y], st[ST.Z]]),
      exercises: (m) => m.shapesHit.has(board) && m.contactSteps >= 200,
      describe: (m) => `shapes hit ${[...m.shapesHit].map((i) => `${i} ${w.placed.solids[i].name}`).join(', ') || 'none'} (the board is ${board}), ${m.contactSteps} contact steps`,
    });
  }

  /* A capsule: one of the crane mast's four corner chords, flown at from
   * outside along the mast's diagonal at 5 m/s, 2 m up, so the chord is the
   * first thing in the way whichever way the braces zigzag
   * (scripts/props-check.js mastScenario). The crane has a 60 m cell to
   * itself. */
  {
    const w = E;
    const cr = rangeOf(E, 'crane');
    const chord = (() => {
      for (let i = cr.from; i < cr.to; i += 1) {
        const c = w.placed.solids[i].cap;
        if (c && w.placed.solids[i].name === 'chord' && c[0] === c[3] && c[2] === c[5]) {
          return i;
        }
      }
      throw new Error('the crane has no vertical corner chord');
    })();
    const c = w.placed.solids[chord].cap;
    const it = cr.item;
    const [ox, oz] = unit2(c[0] - it.x, c[2] - it.z);
    const H = 2;
    const from = toPlant(w.f, c[0] + ox * (c[6] + 6), H, c[2] + oz * (c[6] + 6));
    const to = toPlant(w.f, c[0] - ox * 0.3, H, c[2] - oz * 0.3);
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const h = unit2(d[0], d[1]);
    out.push({
      name: 'built: one of everything, a crane mast chord at 5 m/s',
      group: 'built',
      ms: SETTLE_MS + 2000 + 100 + 1500,
      setup: builtSetupAt(w, from, yawQuat(h[0], h[1])),
      sticks: pathSticks({ p0: from, d, secs: 2.0, vEnd: 5, pushMs: 100, settleMs: SETTLE_MS, after: 0.34 }, h),
      before: builtGround(w),
      where: (st) => toThree(w.f, [st[ST.X], st[ST.Y], st[ST.Z]]),
      exercises: (m) => m.firstShape >= 0 && inRange(cr, m.firstShape) && Boolean(w.placed.solids[m.firstShape].cap)
        && m.arrival >= 2.5,
      describe: (m) => `first touched shape ${m.firstShape}${m.firstShape >= 0 ? ` ${w.placed.solids[m.firstShape].name}` : ''} (the crane is ${cr.from} to ${cr.to - 1}, the chord ${chord}) at ${m.arrival.toFixed(3)} m/s`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * MOVERS: a box at heading zero, moving along one axis, seated every step
 * by the shell's setMover from a closed form of the step count.
 * ------------------------------------------------------------------ */
function moverRuns() {
  const out = [];
  /* A 20 m car at the town's train speed, along Three.js +x (the town's
   * train runs along x), across a craft hovering 2 m up, in a frame turned a
   * half turn as the town's spawn is. */
  {
    const f = frameAt([0, 0, REST[0]], Math.PI);
    const car = { hx: 10, hy: 2, hz: 1.5, v: 23.5 };
    out.push({
      name: 'movers: a 20 m car at 23.5 m/s meets a hovering craft',
      group: 'movers',
      ms: 3000,
      setup(sim) {
        call(sim, 'sim_world_clear');
        setWorldFrame(sim, 0, 0, 0, Math.PI, REST[0]);
        call(sim, 'sim_world_build');
        call(sim, 'sim_set_pose', 0, 0, 2, 1, 0, 0, 0);
        call(sim, 'sim_rest');
      },
      sticks: (ms, st, ctx) => [0, 0, 0, heightHold(ctx, st, 2)],
      before(sim, ms) {
        const x = -30 + car.v * ms * 0.001;
        setMover(sim, 0, x, car.hy, 0, car.hx, car.hy, car.hz, car.v, 0, 0, 'train', true);
        call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, -REST[0], GROUND_MU, GROUND_E);
      },
      where: (st) => toThree(f, [st[ST.X], st[ST.Y], st[ST.Z]]),
      exercises: (m) => m.moverSteps > 0 && m.maxClosing >= 10,
      describe: (m) => `${m.moverSteps} steps where the car was the hardest contact, closing up to ${m.maxClosing.toFixed(3)} m/s`,
    });
  }
  /*
   * A 10 m van pulling away along Three.js +z, 3 m/s/s up to 6 m/s after
   * standing for half a second, and a whoop riding beside it, asked to be
   * 10 cm into its side so it leans on it: a contact with a surface moving
   * with the craft, where the surface velocity the module is handed is the
   * whole of the friction.
   * The whoop because its ducts are its hull. A five inch's props stand
   * outside its hull, so they are what touches, and a disc held on a face
   * bleeds its rotor (world.c, soft props): measured, it fell out of the
   * ride in half a second and ended upside down on the road.
   */
  {
    const af = 1;
    const f = frameAt([0, 0, REST[af]], 0);
    const van = { hx: 0.9, hy: 0.9, hz: 5, A: 3, V: 6, T0: 0.5 };
    const T = van.V / van.A;
    const at = (ms) => {
      const t = ms * 0.001 - van.T0;
      if (t <= 0) {
        return { z: 0, v: 0, a: 0 };
      }
      if (t <= T) {
        return { z: 0.5 * van.A * t * t, v: van.A * t, a: van.A };
      }
      return { z: 0.5 * van.A * T * T + van.V * (t - T), v: van.V, a: 0 };
    };
    /* src/native/plant.c hull_hx for the whoop, 41 mm. */
    const side = van.hx + 0.041 - 0.10;
    const ahead = 2.0;
    const y = 1.0;
    const nose = dirToPlant(f, 0, 0, 1);
    const target = (ms) => {
      const k = at(ms);
      return {
        p: toPlant(f, side, y, k.z + ahead),
        v: dirToPlant(f, 0, 0, k.v),
        a: dirToPlant(f, 0, 0, k.a),
      };
    };
    const start = toPlant(f, van.hx + 0.041 + 0.02, y, ahead);
    out.push({
      name: 'movers: a whoop rides beside a van as it pulls away',
      group: 'movers',
      airframe: af,
      ms: 5000,
      setup(sim) {
        call(sim, 'sim_world_clear');
        setWorldFrame(sim, 0, 0, 0, 0, REST[af]);
        call(sim, 'sim_world_build');
        const q = yawQuat(nose[0], nose[1]);
        call(sim, 'sim_set_pose', start[0], start[1], start[2], q[0], q[1], q[2], q[3]);
        call(sim, 'sim_rest');
      },
      sticks: tracker(target, unit2(nose[0], nose[1]), { hold: true }),
      before(sim, ms) {
        const k = at(ms);
        setMover(sim, 0, 0, van.hy, k.z, van.hx, van.hy, van.hz, 0, 0, k.v, 'train', true);
        call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, -REST[af], GROUND_MU, GROUND_E);
      },
      where: (st) => toThree(f, [st[ST.X], st[ST.Y], st[ST.Z]]),
      /* Two seconds and more against the van, still moving with it at the end. */
      exercises: (m) => m.moverSteps >= 2000 && m.endSpeed > 4,
      describe: (m) => `${m.moverSteps} steps where the van was the hardest contact, ${m.contactSteps} in contact, ending ${m.endSpeed.toFixed(3)} m/s at ${m.endAt.map((v) => v.toFixed(2)).join(', ')}`,
    });
  }
  return out;
}

/* Every run of the golden's own, town first. `fixture` is the parsed town
 * fixture. */
export function goldenRuns(fixture) {
  return [...townRuns(fixture), ...builtRuns(), ...moverRuns()];
}

/* ------------------------------------------------------------------ *
 * VEHICLES: cars that follow a road inside the module (Stage D part 2,
 * src/native/world.c section 5), handed over and read back through the
 * shell's own src/game/plantworld.js.
 *
 * NOT GOLDEN RUNS. goldenRuns() above does not return these, so
 * tests/goldens/world.json neither holds them nor misses them: pinning them
 * there is a reviewed act for the owner. scripts/world-engines.js flies
 * vehicleRuns() in Node and in Chromium and compares every step and every
 * car's pose to the bit; scripts/world-check.js flies the same runs with its
 * own loop and holds them to their guards.
 *
 * Roads are laid in the physics frame, where their geometry is plain, and
 * handed over in Three.js metres through frame.js, as a map's will be. A
 * road's points reach the module, so a bend is placed with trig.js, which is
 * arithmetic and the same in every engine, and a square is a product, never
 * the ** operator, which is as loosely specified as Math.pow.
 * ------------------------------------------------------------------ */

/* A family hatchback: 4.5 m by 1.8 m by 1.4 m, 15 cm off the road. */
export const CAR = { length: 4.5, width: 1.8, height: 1.4, clearance: 0.15 };
/* src/native/plant.c hull_hx, the five inch's and the whoop's. */
export const HULL = { 0: 0.094, 1: 0.041 };
/* The craft a car meets hovers a metre over the road, halfway up its side. */
const OVER = 1.0;

/* Physics frame points [x, y, z] as the Three.js points uploadRoad takes.
 * `nudge` moves every one by that much along x, y and z: the engines
 * check's self test plants it in one engine only. */
export function roadToThree(pts, nudge = 0) {
  return pts.map((p) => {
    const v = nudge ? simPosToThree(p[0] + nudge, p[1] + nudge, p[2] + nudge, V3())
      : simPosToThree(p[0], p[1], p[2], V3());
    return { x: v.x, y: v.y, z: v.z };
  });
}

/* A straight in plan from a to b, a point every `step` m or closer, b left
 * off for whatever follows it. */
function lineTo(out, a, b, step) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / step));
  for (let i = 0; i < n; i += 1) {
    out.push([a[0] + dx * (i / n), a[1] + dy * (i / n), 0]);
  }
}

/* An arc about (cx, cy) of radius r from angle a0 through `sweep` radians,
 * positive anticlockwise, a point every half metre of arc or closer, the
 * end left off. */
function arcTo(out, cx, cy, r, a0, sweep) {
  const n = Math.max(1, Math.ceil(((sweep < 0 ? -sweep : sweep) * r) / 0.5));
  const sc = { s: 0, c: 0 };
  for (let i = 0; i < n; i += 1) {
    sincos(a0 + sweep * (i / n), sc);
    out.push([cx + r * sc.c, cy + r * sc.s, 0]);
  }
}

/* A closed stadium, driven anticlockwise so every bend is a left: straights
 * of `len` m along x at y = 0 and y = 2 r, joined by half circles of radius
 * r. It starts at the origin heading +x, so its first bend's apex is at
 * (len + r, r). */
export function stadiumRoad(len, r) {
  const pts = [];
  lineTo(pts, [0, 0], [len, 0], 1);
  arcTo(pts, len, r, r, -Math.PI / 2, Math.PI);
  lineTo(pts, [len, 2 * r], [0, 2 * r], 1);
  arcTo(pts, 0, r, r, Math.PI / 2, Math.PI);
  return pts;
}

/* An open road: `lead` m straight along +x ending at the origin, then a bend
 * of radius r through `deg` degrees to the left (side 1) or the right (side
 * -1), then `tail` m straight on. Side 0 is straight on throughout. */
export function turnRoad(side, r, lead, deg, tail) {
  const pts = [];
  lineTo(pts, [-lead, 0], [0, 0], 1);
  let end = [0, 0];
  let dir = [1, 0];
  if (side !== 0) {
    const a0 = (-side * Math.PI) / 2;
    const sweep = (side * deg * Math.PI) / 180;
    arcTo(pts, 0, side * r, r, a0, sweep);
    const sc = sincos(a0 + sweep, { s: 0, c: 0 });
    end = [r * sc.c, side * r + r * sc.s];
    dir = [-side * sc.s, side * sc.c];
  }
  const to = [end[0] + dir[0] * tail, end[1] + dir[1] * tail];
  lineTo(pts, end, to, 1);
  pts.push([to[0], to[1], 0]);
  return pts;
}

/* An open road from the origin heading +x, piece by piece: { line: m }
 * straight on, or { bend: [side, r, deg] } a bend of radius r through deg
 * degrees, left for side 1 and right for -1. A bend turns the offset from
 * its centre by trig.js's sine and cosine, so no angle is ever read back. */
export function pieceRoad(pieces) {
  const pts = [];
  let at = [0, 0];
  let dir = [1, 0];
  const sc = { s: 0, c: 0 };
  for (const pc of pieces) {
    if (pc.line) {
      const to = [at[0] + dir[0] * pc.line, at[1] + dir[1] * pc.line];
      lineTo(pts, at, to, 1);
      at = to;
      continue;
    }
    const [side, r, deg] = pc.bend;
    const cx = at[0] - side * dir[1] * r;
    const cy = at[1] + side * dir[0] * r;
    const ox = at[0] - cx;
    const oy = at[1] - cy;
    const sweep = (side * deg * Math.PI) / 180;
    const n = Math.max(1, Math.ceil(((sweep < 0 ? -sweep : sweep) * r) / 0.5));
    for (let i = 0; i < n; i += 1) {
      sincos(sweep * (i / n), sc);
      pts.push([cx + sc.c * ox - sc.s * oy, cy + sc.s * ox + sc.c * oy, 0]);
    }
    sincos(sweep, sc);
    at = [cx + sc.c * ox - sc.s * oy, cy + sc.s * ox + sc.c * oy];
    dir = [sc.c * dir[0] - sc.s * dir[1], sc.s * dir[0] + sc.c * dir[1]];
  }
  pts.push([at[0], at[1], 0]);
  return pts;
}

/* A road's points turned about the origin by `deg` degrees, by the test and
 * not the module: a quarter turn exactly, (x, y) to (-y, x); any other
 * angle through trig.js. */
export function turnPoints(pts, deg) {
  if (deg === 0) {
    return pts;
  }
  if (deg === 90) {
    return pts.map((p) => [-p[1], p[0], p[2]]);
  }
  const sc = sincos((deg * Math.PI) / 180, { s: 0, c: 0 });
  return pts.map((p) => [sc.c * p[0] - sc.s * p[1], sc.s * p[0] + sc.c * p[1], p[2]]);
}

/*
 * A 32 bit digest of every car's pose as the shell reads it: the twenty
 * numbers readVehicles gives each car in use, through MurmurHash3's x86_32
 * body and finaliser (scripts/lib/worldrec.js digestRecord's), integer
 * arithmetic only, so the same bits in every engine.
 */
const PD = new Float64Array(20);
const PDV = new DataView(PD.buffer);
export function digestPoses(poses) {
  let h = 0x9747b28c;
  for (let m = 0; m < poses.length; m += 1) {
    const o = poses[m];
    if (!o.on) {
      continue;
    }
    PD[0] = m;
    PD[1] = o.x;
    PD[2] = o.y;
    PD[3] = o.z;
    PD[4] = o.hx;
    PD[5] = o.hz;
    PD[6] = o.qx;
    PD[7] = o.qy;
    PD[8] = o.qz;
    PD[9] = o.qw;
    PD[10] = o.tx;
    PD[11] = o.tz;
    PD[12] = o.vx;
    PD[13] = o.vy;
    PD[14] = o.vz;
    PD[15] = o.speed;
    PD[16] = o.distance;
    PD[17] = o.yawRate;
    PD[18] = o.curvature;
    PD[19] = o.slip;
    for (let i = 0; i < 160; i += 4) {
      let k = PDV.getUint32(i, true);
      k = Math.imul(k, 0xcc9e2d51);
      k = (k << 15) | (k >>> 17);
      k = Math.imul(k, 0x1b873593);
      h ^= k;
      h = (h << 13) | (h >>> 19);
      h = (Math.imul(h, 5) + 0xe6546b64) | 0;
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/* Hover where it was set, height held: the craft a car comes to. */
function hoverAt(z) {
  return (ms, st, ctx) => [0, 0, 0, heightHold(ctx, st, z)];
}

/*
 * One vehicle run, in the golden runs' shape so flyRun flies it: the world
 * cleared and built with nothing static in it, the frame at the origin
 * turned `yaw`, the roads and the cars handed over through plantworld.js as
 * the shell will hand them, the clock set, the craft posed. The cars are
 * read as the shell reads them once at setup and then before every step, so
 * run.rec.digests[ms] is the digest of the pose step `ms` uses, and
 * ctx.poses is the car a stick script can see.
 */
function vehicleRun(o) {
  const af = o.airframe || 0;
  const rec = { poses: makeVehiclePoses(), digests: new Uint32Array(0) };
  const f = frameAt([0, 0, REST[af]], o.yaw || 0);
  return {
    name: `vehicles: ${o.name}`,
    group: 'vehicles',
    airframe: af,
    ms: o.ms,
    rec,
    spec: o,
    frame: f,
    setup(sim, ctx) {
      call(sim, 'sim_world_clear');
      setWorldFrame(sim, 0, 0, 0, o.yaw || 0, REST[af]);
      call(sim, 'sim_world_build');
      o.roads.forEach((r, i) => {
        const k = uploadRoad(sim, r.points, r.closed);
        if (k !== i) {
          throw new Error(`road ${i} came back as ${k}`);
        }
      });
      for (const c of o.cars) {
        addVehicle(sim, c.slot, c.road, c);
      }
      setVehicleClock(sim, o.clock0 || 0);
      /* A run that has to meet a car at an exact step places the craft from
       * the module's own poses, read here with the clock set ahead and put
       * back, which moves no car (sim_world_clock). */
      const pose = o.place ? o.place(sim, f) : o.pose;
      const p = pose.p;
      const q = pose.q;
      call(sim, 'sim_set_pose', p[0], p[1], p[2], q[0], q[1], q[2], q[3]);
      call(sim, 'sim_rest');
      readVehicles(sim, rec.poses);
      ctx.poses = rec.poses;
      rec.digests = new Uint32Array(o.ms);
    },
    sticks: o.sticks,
    before(sim, ms) {
      readVehicles(sim, rec.poses);
      rec.digests[ms] = digestPoses(rec.poses);
      call(sim, 'sim_set_ground', 1, 0, 0, 1, 0, 0, -REST[af], GROUND_MU, GROUND_E);
    },
    where: (st) => toThree(f, [st[ST.X], st[ST.Y], st[ST.Z]]),
    exercises: (m) => m.contactSteps >= 0,
    describe: (m) => `${m.contactSteps} steps in contact, ${m.moverSteps} where a car was the hardest contact, ending ${m.endSpeed.toFixed(3)} m/s`,
  };
}

/* A car coming round a bend of 20 m radius at up to 12 m/s, and a craft
 * hovering on the bend 25 degrees round, in its path. side 1 bends left, -1
 * right, and 0 is the road straight on, the craft as far along it. */
export function sweepRun(side, nudge = 0) {
  const R = 20;
  const phi = (25 * Math.PI) / 180;
  const sc = sincos(phi, { s: 0, c: 0 });
  const at = side === 0 ? [R * phi, 0] : [R * sc.s, side * (R - R * sc.c)];
  const z = OVER - REST[0];
  const label = side === 0 ? 'straight on' : (side > 0 ? 'a left bend' : 'a right bend');
  return vehicleRun({
    name: `a car on ${label} meets a hovering craft`,
    ms: 5500,
    roads: [{ points: roadToThree(turnRoad(side, R, 60, 90, 40), nudge), closed: false }],
    cars: [{ slot: 0, road: 0, offset: 25, topSpeed: 12, lateral: 6, ...CAR }],
    pose: { p: [at[0], at[1], z], q: [1, 0, 0, 0] },
    sticks: hoverAt(z),
    side,
    at,
    watch: 0,
  });
}

/* A car at 20 m/s down a straight, and a craft hovering with its hull 5 cm
 * into the car's path: the car's front corner clips it. */
export function clipRun(nudge = 0) {
  const y = CAR.width / 2 + HULL[0] - 0.05;
  const z = OVER - REST[0];
  return vehicleRun({
    name: 'a car\'s front corner clips a hovering craft at 20 m/s',
    ms: 4000,
    roads: [{ points: roadToThree(turnRoad(0, 0, 100, 0, 200), nudge), closed: false }],
    cars: [{ slot: 0, road: 0, offset: 60, topSpeed: 20, lateral: 6, ...CAR }],
    pose: { p: [0, y, z], q: [1, 0, 0, 0] },
    sticks: hoverAt(z),
    at: [0, y],
    watch: 0,
  });
}

/*
 * A whoop riding beside a car as it pulls away and turns. The car stands at
 * the start of an open road, pulls away to 6 m/s along a 10 m straight and
 * takes a bend of 30 m radius left through 150 degrees; the whoop keeps to
 * its right, on the outside of the bend, a metre ahead of its middle and
 * asked to be 10 cm into its side so it leans on it, as the van run's whoop
 * does (moverRuns). The whoop because its ducts are its hull. The target is
 * the car's own pose as the shell reads it, turned into the plant's frame:
 * that point of the car, its velocity (the car's own and its turn across the
 * lever arm), and its acceleration, the turn's centripetal part and the
 * car's pulling away, which is the change in its speed since the last RC
 * frame. The tracker is a spring and a damper with no integral, and a
 * whoop's drag at 6 m/s wants a steady forward push, so it settles about
 * 2.7 m behind where it is asked, the same whether it leans on the car or
 * rides 2 cm clear of it (measured; an integral on the error pushed it out
 * off the side in the bend instead). So it is asked to be RIDE_AHEAD in front
 * of the car's middle, and rides beside the middle.
 */
const RIDE_AHEAD = 2.5;
export function rideRun(nudge = 0) {
  const af = 1;
  const f = frameAt([0, 0, REST[af]], 0);
  const z = OVER - REST[af];
  const off = CAR.width / 2 + HULL[af];
  const target = (ctx, acc) => {
    const c = ctx.poses[0];
    const p = toPlant(f, c.x, c.y, c.z);
    const h = dirToPlant(f, c.hx, 0, c.hz);
    const v = dirToPlant(f, c.vx, c.vy, c.vz);
    const w = c.yawRate;
    const along = RIDE_AHEAD;
    const out = off - 0.10;
    const r = [h[0] * along + h[1] * out, h[1] * along - h[0] * out];
    const tv = [v[0] - w * r[1], v[1] + w * r[0]];
    return {
      p: [p[0] + r[0], p[1] + r[1], z],
      v: [tv[0], tv[1], 0],
      a: [-w * tv[1] + acc * h[0], w * tv[0] + acc * h[1], 0],
      h: [h[0], h[1]],
    };
  };
  return vehicleRun({
    name: 'a whoop rides beside a car as it pulls away and turns',
    airframe: af,
    ms: 8000,
    roads: [{ points: roadToThree(turnRoad(1, 30, 10, 150, 20), nudge), closed: false }],
    cars: [{ slot: 0, road: 0, offset: 0, topSpeed: 6, lateral: 3, ...CAR }],
    pose: { p: [-10 + 1.0, -(off + 0.02), z], q: [1, 0, 0, 0] },
    sticks: (ms, st, ctx) => {
      const speed = ctx.poses[0].speed;
      const acc = ctx.rideSpeed === undefined ? 0 : (speed - ctx.rideSpeed) / (RC_MS * 0.001);
      ctx.rideSpeed = speed;
      const t = target(ctx, acc);
      return tracker(() => t, t.h, { hold: true })(ms, st, ctx);
    },
    watch: 0,
    off,
  });
}

/*
 * A car round a stadium's first bend (15 m radius) at its corner speed, and
 * a craft hovering 1.7 m outside the path at the bend's apex. An ordinary car
 * (gain 0) passes with its side 0.8 m clear of it. A drift car's nose goes
 * into the bend and its tail swings out past 2 m, into the craft.
 */
export function driftRun(gain, nudge = 0) {
  const len = 60;
  const R = 15;
  const probe = [len + R + 1.7, R];
  const z = OVER - REST[0];
  return vehicleRun({
    name: gain > 0 ? 'a drift car\'s tail swings into a craft outside its bend'
      : 'an ordinary car passes a craft outside its bend',
    ms: 4500,
    roads: [{ points: roadToThree(stadiumRoad(len, R), nudge), closed: true }],
    cars: [{ slot: 0, road: 0, offset: 55, topSpeed: 14, lateral: 7, drift: gain, ...CAR }],
    pose: { p: [probe[0], probe[1], z], q: [1, 0, 0, 0] },
    sticks: hoverAt(z),
    at: probe,
    watch: 0,
    gain,
  });
}

/*
 * A drift car ENTERING the stadium's first bend, and a craft hovering just
 * outside the entry. Coming off the straight at 14 m/s and braking for the
 * bend, the car's slide grows from nothing to about 45 degrees in the 3 m
 * the bend is measured across, so its heading turns at up to about 5 rad/s
 * while its path turns at under 0.7, and its tail swings out through the
 * craft at several metres a second. That is where the rate a contact reads
 * matters most: the drift's rate is most of it, and speed times the path's
 * curvature is a small part. An ordinary car's rear corner passes this spot
 * about 0.5 m inside it (measured on the pose, 2026-09-25).
 */
export function driftEntryRun(nudge = 0) {
  const probe = [58.3, -1.6];
  const z = OVER - REST[0];
  return vehicleRun({
    name: 'a drift car\'s tail swings out through a craft as it enters a bend',
    ms: 3000,
    roads: [{ points: roadToThree(stadiumRoad(60, 15), nudge), closed: true }],
    cars: [{ slot: 0, road: 0, offset: 40, topSpeed: 14, lateral: 7, drift: 0.06, ...CAR }],
    pose: { p: [probe[0], probe[1], z], q: [1, 0, 0, 0] },
    sticks: hoverAt(z),
    at: probe,
    watch: 0,
  });
}

/* src/native/plant.c: the five inch's rear motors stand 0.0778 m behind its
 * CG (pos_x) with props of 0.0635 m radius (prop_r) at 0.020 m over it
 * (pos_z), so a level craft's prop discs reach 0.1413 m behind its CG. */
const PROP_BACK = 0.0777817459305202 + 0.0635;
const PROP_UP = 0.020;

/*
 * A car's front meeting a craft's prop discs 1 cm under its roof line: the
 * case where the face a point comes in through is not the face nearest it.
 * A car at 25 m/s on a straight comes up behind a craft hovering level, its
 * prop discs 1 cm below the roof and its hull's top 8 mm above it. The craft
 * is placed from the module's own poses so that its rearmost prop tip is
 * 5 mm clear of the car's front at clock 2 and 20 mm inside it at clock 3:
 * on step 4 the tips are 20 mm through the front face and 10 mm under the
 * roof. The face they came in through is the front, which only the car's
 * pose a step ago can say (world.c point_in_box with the previous point, in
 * the car's frame as it was then); the face nearest them is the roof. A prop
 * the car's front pushes up rather than forward is that pose gone wrong.
 */
export function propEdgeRun(nudge = 0) {
  const top = CAR.clearance + CAR.height;
  const z = top - 0.010 - PROP_UP - REST[0];
  const probe = [0, 0];
  return vehicleRun({
    name: 'a car\'s front meets a craft\'s props a centimetre under its roof line',
    ms: 400,
    roads: [{ points: roadToThree(turnRoad(0, 0, 400, 0, 200), nudge), closed: false }],
    cars: [{ slot: 0, road: 0, offset: 380, topSpeed: 25, lateral: 6, ...CAR }],
    place(sim, f) {
      const cars = makeVehiclePoses();
      setVehicleClock(sim, 2);
      readVehicles(sim, cars);
      const front = toPlant(f, cars[0].x, cars[0].y, cars[0].z)[0] + CAR.length / 2;
      setVehicleClock(sim, 0);
      probe[0] = front + 0.005 + PROP_BACK;
      return { p: [probe[0], 0, z], q: [1, 0, 0, 0] };
    },
    sticks: hoverAt(z),
    at: probe,
    watch: 0,
    gap: 0.010,
  });
}

/* A craft set down, motors idle, on the roof of a car doing 8 m/s down a
 * straight. A car is never ground (world.c section 5), so nothing holds the
 * craft there but friction. Its hull's floor is 3 mm over the roof:
 * plant.c's hull_hz_down is the rest height, so the plant's z is the roof's
 * height plus the gap. */
export function roofRideRun(nudge = 0) {
  const top = CAR.clearance + CAR.height;
  return vehicleRun({
    name: 'a craft set on a moving car\'s roof',
    ms: 3000,
    roads: [{ points: roadToThree(turnRoad(0, 0, 100, 0, 300), nudge), closed: false }],
    cars: [{ slot: 0, road: 0, offset: 60, topSpeed: 8, lateral: 6, ...CAR }],
    pose: { p: [-40, 0, top + 0.003], q: [1, 0, 0, 0] },
    sticks: () => [0, 0, 0, 0],
    watch: 0,
    top,
  });
}

/*
 * The same hit with the road laid at `deg` degrees: a straight through the
 * origin, a car at 10 m/s coming up behind a hovering craft. The test turns
 * the road's points AND the craft (its place and its attitude, through
 * trig.js), and not the module; the plant's frame stays at yaw 0 in every
 * run. So the heading reaches the solve only through the car: its tangent,
 * its frame, the turn into it and back.
 *
 * Why not turn the plant's frame instead: sim_world_frame turns a yaw into a
 * rotation with the libm's small angle series, which stops at x^6 for the
 * cosine, so at 37 degrees that rotation is itself off by about 2e-9 rad and
 * 5e-9 in scale (measured 2026-09-25), and a heading test through it tests
 * that series, not the cars.
 *
 * Why the craft is 0.37 m right of the road's centre line and turned 20
 * degrees left of it: the box test the car is met with (obb_vs_box,
 * unchanged) makes discrete choices, a face normal's sign from which side of
 * a centre the craft is on, a clipped corner kept or dropped at a plane. A
 * craft exactly square to the car, or exactly on its centre line, puts those
 * on exact ties at 0 and 90 degrees, which any other heading's rounding
 * settles the other way: measured, square to the car the same hit moved 6e-3
 * m/s at 90 degrees and over 1 m/s at 37. That is the box test at a tie,
 * whatever the heading, so this hit keeps clear of every tie.
 */
const INV_AT = [0, -0.37];
const INV_REL = 20;
export function invarianceRun(deg, nudge = 0) {
  const z = OVER - REST[0];
  const at = turnPoints([[INV_AT[0], INV_AT[1], 0]], deg)[0];
  const h = sincos(((deg + INV_REL) * Math.PI) / 360, { s: 0, c: 0 });
  return vehicleRun({
    name: `the same hit on a straight road laid at ${deg} degrees`,
    ms: 5000,
    roads: [{ points: roadToThree(turnPoints(turnRoad(0, 0, 60, 0, 60), deg), nudge), closed: false }],
    cars: [{ slot: 0, road: 0, offset: 30, topSpeed: 10, lateral: 6, ...CAR }],
    pose: { p: [at[0], at[1], z], q: [h.c, 0, 0, h.s] },
    sticks: hoverAt(z),
    watch: 0,
    deg,
  });
}

/*
 * n cars on one road, a stadium of 150 m straights and 30 m bends, spaced
 * evenly along it, and a craft hovering 2.5 m out from the near straight's
 * centre line: every car that passes comes inside its bounding test and is
 * tested box against hull, and none touches it.
 */
export function crowdRun(n = 64, ms = 3000, nudge = 0) {
  const pts = stadiumRoad(150, 30);
  let L = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    L += Math.sqrt(dx * dx + dy * dy);
  }
  const cars = [];
  for (let k = 0; k < n; k += 1) {
    cars.push({ slot: k, road: 0, offset: (k * L) / n, topSpeed: 14, lateral: 6, ...CAR });
  }
  const z = OVER - REST[0];
  return vehicleRun({
    name: `${n} cars on one road pass a hovering craft`,
    ms,
    roads: [{ points: roadToThree(pts, nudge), closed: true }],
    cars,
    pose: { p: [75, -2.5, z], q: [1, 0, 0, 0] },
    sticks: hoverAt(z),
    watch: 0,
    n,
  });
}

/* The vehicle runs the engines check flies. `nudge` moves every road point,
 * for its self test. */
export function vehicleRuns({ nudge = 0 } = {}) {
  return [
    sweepRun(1, nudge),
    sweepRun(-1, nudge),
    clipRun(nudge),
    rideRun(nudge),
    driftRun(0.06, nudge),
    driftEntryRun(nudge),
    propEdgeRun(nudge),
    roofRideRun(nudge),
    invarianceRun(37, nudge),
    crowdRun(64, 2000, nudge),
  ];
}
