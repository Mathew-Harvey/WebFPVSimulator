/*
 * traffic.js: the bikes of Ridgeline MX, as the physics module takes them.
 * Pure: plan metres in, the traffic out, no Three.js, so the Node check
 * drives it (scripts/moto-check.js).
 *
 * THE PHYSICS DRIVES THEM, as it drives a built map's cars and Heads'
 * street's (../built/traffic.js, src/native/world.c section 5): a bike's
 * pose is a pure function of the lap clock worked out inside the module, so
 * the same flight meets the same bikes on every run, and a bike is solid to
 * a quad. What the module does not do is leave the ground, lean or slide
 * its tail: ./profile.js and ./bikes.js do those, render only, from the
 * distance the pose says the bike has driven. Nothing here is a new kind of
 * mover: the module is handed a box on a road, as for a car.
 *
 * THREE LINES, TEN BIKES. The course is driven in three parallel lines
 * (LANE_OFFSETS in ./circuit.js), so a pack runs side by side as riders do
 * and not in a single file, and every bike has the same top speed, so a
 * pack keeps together on the straights and strings out in the bends, the
 * inner line a little shorter than the outer. The module has no bike to
 * bike contact, which is why the lines are 2.4 m apart (a bike is 0.75 m
 * wide) and a bike never changes line.
 *
 * SPEEDS. A top speed of TOP m/s, 72 km/h, and a corner taken at up to
 * LATERAL m/s/s, 1.1 g: a 22 m bend is 15 m/s. The module pulls away at its
 * own fixed 2.5 m/s/s (VEHICLE_ACCEL in world.c), a family car's, which is
 * slow for a motorbike, so the course has no bend slower than 14 m/s and
 * the bikes are never far under their top speed. DRIFT is the module's slip
 * gain (world.c section 5): the bike's nose is turned into the bend by a
 * slip whose tangent of half is DRIFT times the lateral acceleration, about
 * 20 degrees in the tightest bend, which is a rear wheel stepping out
 * through a berm.
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

import { trafficOf, roadKeepOut } from '../built/traffic.js';
import { roadOf, nearestOn } from '../built/road.js';
import { courseElement, LANE_OFFSETS, FIELD_W, FIELD_D } from './circuit.js';

export const TOP = 20;
export const LATERAL = 11;
export const DRIFT = 0.016;

/* A bike's solid, metres: nose to tail, across, up. */
export const BIKE = { length: 1.9, width: 0.75, height: 1.5 };

/*
 * THE GROUPS: three packs spread round the lap, so there is always a pack
 * somewhere to chase. Each bike is { lane, at }: its line (an index into
 * LANE_OFFSETS) and how far round the lap it starts, metres. The first of
 * a pack is the one furthest along.
 */
export const GROUPS = [
  {
    name: 'Pack', bikes: [[1, 150], [0, 142], [2, 139], [1, 130]],
  },
  {
    name: 'Pack', bikes: [[2, 470], [0, 462], [1, 455]],
  },
  {
    name: 'Pack', bikes: [[0, 700], [2, 693], [1, 684]],
  },
];

/* Each bike's paint: [bike, rider's kit], keys of src/props/homes.js. */
export const LIVERIES = [
  ['mxOrange', 'white'], ['mxBlue', 'mxBlue'], ['mxGreen', 'white'], ['mxRed', 'white'], ['white', 'mxRed'],
  ['mxBlue', 'white'], ['mxOrange', 'mxRed'], ['mxGreen', 'mxGreen'], ['mxRed', 'mxBlue'], ['white', 'mxOrange'],
];

/*
 * The traffic, as ../built/traffic.js trafficOf makes it for a document of
 * this map's own that holds nothing but the three lines and their bikes,
 * then fitted to a bike. Returns { traffic, keepOut, lanes, bikes, groups }:
 * `lanes[i].toCentre(s)` takes a distance along lane i's line to the centre
 * line's, for ./profile.js, and `bikes[k]` is the k'th bike's slot, lane,
 * group and paint.
 */
export function motoTraffic() {
  const elements = [];
  GROUPS.forEach(() => {});
  LANE_OFFSETS.forEach((d, i) => {
    elements.push(courseElement(d, `mx-lane-${i}`));
  });
  const bikes = [];
  let n = 0;
  GROUPS.forEach((g, gi) => {
    g.bikes.forEach(([lane, at]) => {
      elements.push({
        id: `mx-bike-${n}`,
        type: 'vehicle',
        road: `mx-lane-${lane}`,
        style: 'kei',
        reverse: false,
        drift: true,
        dims: { offset: at, speed: TOP, variant: 1 + n },
      });
      bikes.push({
        element: `mx-bike-${n}`, lane, group: gi, number: n + 1, livery: LIVERIES[n % LIVERIES.length],
      });
      n += 1;
    });
  });
  const doc = { mode: 'freestyle', field: { width: FIELD_W, depth: FIELD_D }, elements };
  const traffic = trafficOf(doc);
  const byElement = new Map(bikes.map((b) => [b.element, b]));
  const placed = [];
  for (const v of traffic.vehicles) {
    const b = byElement.get(v.element);
    if (!b) {
      continue;
    }
    v.style = 'mx';
    v.length = BIKE.length;
    v.width = BIKE.width;
    v.height = BIKE.height;
    v.clearance = 0;
    v.topSpeed = TOP;
    v.lateral = LATERAL;
    v.drift = DRIFT;
    v.name = `Rider ${b.number}`;
    placed.push({ ...b, slot: v.slot });
  }
  /* Each lane's line against the centre's, point for point, so a distance
   * along a lane is the centre's arc length where the ground stands. */
  const centre = roadOf(courseElement(0, 'mx-centre')).centre;
  const lanes = LANE_OFFSETS.map((d, i) => {
    const road = traffic.roads.find((r) => r.element === `mx-lane-${i}`);
    const line = road ? road.line : roadOf(courseElement(d, `mx-lane-${i}`)).centre;
    const sL = [];
    const sC = [];
    let last = 0;
    for (let k = 0; k < line.points.length; k += 2) {
      const p = line.points[k];
      const near = nearestOn(centre, p.x, p.y);
      /* Never backwards: a lane that hugs the inside of a bend can be
       * nearest to the same centre point twice. */
      last = near.s >= last || last - near.s > centre.length / 2 ? near.s : last;
      sL.push(line.s[k]);
      sC.push(last);
    }
    return {
      offset: d,
      length: line.length,
      line,
      toCentre(s) {
        const L = line.length;
        const lap = Math.floor(s / L);
        const x = s - lap * L;
        let lo = 0;
        let hi = sL.length - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (sL[mid] <= x) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        const span = sL[hi] - sL[lo];
        const f = span > 0 ? (x - sL[lo]) / span : 0;
        let c = sC[lo];
        let e = sC[hi];
        if (e < c) {
          e += centre.length;
        }
        c += (e - c) * f;
        return c - Math.floor(c / centre.length) * centre.length;
      },
    };
  });
  return {
    traffic, keepOut: roadKeepOut(traffic), lanes, bikes: placed, groups: GROUPS, centre,
  };
}
