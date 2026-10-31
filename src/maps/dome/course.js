/*
 * course.js: the monster trucks of Bakuon Dome, driven and ridden. Pure: no
 * Three.js, no clock of its own and no JS trigonometry, so it loads in Node
 * (scripts/dome-check.js) and a truck's ride is a function of where the
 * plant has put it and nothing else.
 *
 * DRIVEN BY THE PHYSICS MODULE, as Ridgeline MX's bikes are
 * (../moto/traffic.js): four trucks on one lane round the floor's course
 * (./stadium.js courseElement), each the plant's mover, a box the size of
 * the truck that a quad crashes into. They take the place of the built
 * map's cars.
 *
 * RIDDEN BY THIS FILE. The plant drives a truck on the flat; what it does
 * over the ramps is drawn: the climb up the take off ramp, the flight over
 * the cars or the bus with the nose up or crossed up, the landing that
 * squats the suspension, and the roll a tall truck leans OUT of a bend
 * with. That is render only, from the distance the plant reports, so a
 * dropped frame changes nothing and a pause freezes it. The solid stays on
 * the floor under a truck in the air, as Ridgeline MX's bikes' do (a known
 * limit of the plant's movers, written in the PR).
 *
 * THE STYLES a truck flies a jump with, from a hash of its slot, its lap
 * and the jump, so the four do not fly alike and no truck flies the same
 * jump the same way twice running: a clean flight, a nose high one, a
 * cross up (the body turned across the flight and laid over), and now and
 * then a wheelie away from the landing.
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

import { trafficOf, roadKeepOut } from '../built/traffic.js';
import { roadOf, nearestOn } from '../built/road.js';
import {
  courseElement, toPlan, JUMPS, rampsOf, FIELD_W, FIELD_D, TRUCK_BOX, FLOOR,
} from './stadium.js';

/* How fast a truck goes, m/s: about 58 km/h down a straight, and the
 * cornering it holds (the plant slows it to this in a bend). */
export const TOP = 16;
export const LATERAL = 7.5;
export const DRIFT = 0.02;

/* The four trucks, each a yokai of its own painted on (./trucks.js): where
 * each starts round the lap, as a share of it. */
export const TRUCKS = Object.freeze([
  Object.freeze({ name: 'Oni', livery: 0, at: 0.05 }),
  Object.freeze({ name: 'Tora', livery: 1, at: 0.3 }),
  Object.freeze({ name: 'Kappa', livery: 2, at: 0.55 }),
  Object.freeze({ name: 'Ryu', livery: 3, at: 0.8 }),
]);

/* The course's centre line, in the plan. */
let LINE = null;
export function courseLine() {
  if (!LINE) {
    LINE = roadOf(courseElement()).centre;
  }
  return LINE;
}

/* The distance round the course at world (x, z). */
function sAt(x, z) {
  const [px, py] = toPlan(x, z);
  return nearestOn(courseLine(), px, py).s;
}

/*
 * THE FEATURES in arc length: { s0, s1, pts [[s, h]], air: { a, b, apex },
 * jump } for each jump. The ground over the take off ramp and the landing
 * ramp is the drawn ramp's (./stadium.js rampsOf); between them the truck
 * is in the air the whole way.
 */
let FEATURES = null;
export function features() {
  if (FEATURES) {
    return FEATURES;
  }
  FEATURES = JUMPS.map((j, i) => {
    const r = rampsOf(j);
    const sTake = sAt(r.take.x0, j.z);
    const sLand = sAt(r.land.x0, j.z);
    const pts = [
      ...r.take.pts.map(([a, h]) => [sTake + a, h + FLOOR.dirt]),
      ...r.land.pts.map(([a, h]) => [sLand + a, h + FLOOR.dirt]),
    ];
    const lip = sTake + j.up + j.lip;
    const touch = sLand + j.land * 0.32;
    return {
      jump: i,
      name: j.name,
      s0: sTake,
      s1: sLand + j.land,
      pts,
      air: { a: lip - 0.4, b: touch, apex: 3.4 },
    };
  });
  return FEATURES;
}

/* The height of a polyline [[s, h]] at s, 0 off its ends. */
function polyAt(pts, s) {
  if (s <= pts[0][0] || s >= pts[pts.length - 1][0]) {
    return FLOOR.dirt;
  }
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i][0] >= s) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = b[0] > a[0] ? (s - a[0]) / (b[0] - a[0]) : 0;
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return FLOOR.dirt;
}

/* The floor's height under a truck at s, ramps and all. */
export function groundAt(s) {
  const F = features();
  for (let i = 0; i < F.length; i += 1) {
    if (s > F[i].s0 && s < F[i].s1) {
      return polyAt(F[i].pts, s);
    }
  }
  return FLOOR.dirt;
}

/* A small integer hash to [0, 1). */
export function hash01(a, b, c) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const STYLE_CLEAN = 0;
export const STYLE_NOSE = 1;
export const STYLE_CROSS = 2;

const bell = (u) => 4 * u * (1 - u);
const ease = (u) => {
  const b = bell(u);
  return b * b * (3 - 2 * b);
};

/* How far after a landing the suspension is still working, metres. */
const SQUAT = 5;
/* How far a wheelie away from a landing is held, metres. */
const WHEELIE = 14;
/* The most a truck rolls out of a bend, rad: about seven degrees. */
const ROLL_MAX = 0.12;
const G = 9.81;

/*
 * How the truck in `slot` rides at arc length s on lap `lap`, going `speed`
 * round a bend of `curvature` (1/m, left positive), into
 * `out` = { dy, pitch, yaw, roll, air }: dy the height of its wheels'
 * contact over the floor's zero, air 0 on the ground and the share of the
 * flight flown in the air.
 */
export function rideAt(slot, lap, s, speed, curvature, out) {
  const F = features();
  let dy = groundAt(s);
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  let air = 0;
  /* Rolled out of the bend, as a tall truck on soft springs is: against
   * the turn, a share of what the bend asks of it. */
  const x = (speed * speed * curvature) / G;
  roll = -x * 0.09;
  roll = roll > ROLL_MAX ? ROLL_MAX : (roll < -ROLL_MAX ? -ROLL_MAX : roll);
  let fl = null;
  for (let i = 0; i < F.length; i += 1) {
    if (s >= F[i].air.a && s < F[i].air.b) {
      fl = F[i];
      break;
    }
  }
  if (fl) {
    const f = fl.air;
    const u = (s - f.a) / (f.b - f.a);
    const ga = polyAt(fl.pts, f.a);
    const gb = polyAt(fl.pts, f.b);
    const h = hash01(slot * 131 + 7, lap, fl.jump);
    const style = h < 0.45 ? STYLE_CLEAN : (h < 0.75 ? STYLE_NOSE : STYLE_CROSS);
    const side = hash01(slot * 17 + 3, lap + 11, fl.jump) < 0.5 ? -1 : 1;
    const apex = f.apex * (0.85 + 0.3 * hash01(slot + 29, lap * 3 + 1, fl.jump + 5));
    dy = ga + (gb - ga) * u + apex * bell(u);
    const span = f.b - f.a;
    const slope = ((gb - ga) + apex * 4 * (1 - 2 * u)) / span;
    pitch = slope / (1 + 0.28 * slope * slope);
    if (style === STYLE_NOSE) {
      pitch += 0.22 * ease(u);
    } else if (style === STYLE_CROSS) {
      yaw = side * 0.42 * ease(u);
      roll += side * 0.32 * ease(u);
    }
    air = u > 0 ? u : 0.001;
  } else {
    const g1 = groundAt(s + 1.0);
    const g2 = groundAt(s - 1.0);
    const slope = (g1 - g2) / 2;
    pitch = slope / (1 + 0.28 * slope * slope);
    /* The squat after a landing, and now and then a wheelie away. */
    for (let i = 0; i < F.length; i += 1) {
      const b = F[i].air.b;
      if (s >= b && s < b + SQUAT) {
        const u = (s - b) / SQUAT;
        dy -= 0.42 * bell(u < 0.5 ? u * 2 : 1 - (u - 0.5)) * (1 - u);
        pitch -= 0.08 * bell(u);
      }
      if (s >= b + 2 && s < b + 2 + WHEELIE && hash01(slot * 7 + 1, lap + 5, i + 9) < 0.35) {
        const u = (s - b - 2) / WHEELIE;
        pitch += 0.38 * ease(u);
      }
    }
  }
  out.dy = dy;
  out.pitch = pitch;
  out.yaw = yaw;
  out.roll = roll;
  out.air = air;
  return out;
}

/*
 * The traffic, as ../built/traffic.js trafficOf makes it for a document of
 * this map's own that holds nothing but the course and its trucks, then
 * fitted to a monster truck. Returns { traffic, keepOut, trucks, line }:
 * `trucks[k]` is the k'th truck's slot, name and livery.
 */
export function domeTraffic() {
  const course = courseElement('dm-course');
  const L = courseLine().length;
  const elements = [course];
  TRUCKS.forEach((t, i) => {
    elements.push({
      id: `dm-truck-${i}`,
      type: 'vehicle',
      road: 'dm-course',
      style: 'kei',
      reverse: false,
      drift: true,
      dims: { offset: Math.round(t.at * L * 10) / 10, speed: TOP, variant: 1 + i },
    });
  });
  const doc = { mode: 'freestyle', field: { width: FIELD_W, depth: FIELD_D }, elements };
  const traffic = trafficOf(doc);
  const trucks = [];
  for (const v of traffic.vehicles) {
    const i = Number(String(v.element).slice('dm-truck-'.length));
    const t = TRUCKS[i];
    if (!t) {
      continue;
    }
    v.style = 'monster';
    v.length = TRUCK_BOX.length;
    v.width = TRUCK_BOX.width;
    v.height = TRUCK_BOX.height;
    v.clearance = 0;
    v.topSpeed = TOP;
    v.lateral = LATERAL;
    v.drift = DRIFT;
    v.name = t.name;
    trucks.push({ ...t, slot: v.slot, element: v.element });
  }
  return {
    traffic, keepOut: roadKeepOut(traffic), trucks, line: courseLine(),
  };
}

/*
 * The poses as the trucks are drawn: each one's height lifted by its ride,
 * and its heading turned by a cross up. For anything that wants to know
 * where a truck is drawn rather than where its solid is. Allocates its
 * scratch once.
 */
export function makeRider(dome) {
  const slots = new Set(dome.trucks.map((t) => t.slot));
  const ride = {
    dy: 0, pitch: 0, yaw: 0, roll: 0, air: 0,
  };
  const L = dome.line.length;
  function rideOf(slot, pose, out) {
    if (!slots.has(slot) || !pose || !pose.on) {
      out.dy = 0;
      out.pitch = 0;
      out.yaw = 0;
      out.roll = 0;
      out.air = 0;
      return out;
    }
    const lap = Math.floor(pose.distance / L);
    const s = pose.distance - lap * L;
    return rideAt(slot, lap, s, pose.speed, pose.curvature || 0, out);
  }
  return { rideOf, ride };
}
