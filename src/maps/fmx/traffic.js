/*
 * traffic.js: the riders of Shiroyama FMX, as the physics module takes
 * them. Pure: plan metres in, the traffic out, no Three.js, so the Node
 * check drives it (scripts/fmx-check.js).
 *
 * THE PHYSICS DRIVES THEM, as it drives Ridgeline MX's bikes and a built
 * map's cars (../built/traffic.js, src/native/world.c section 5): a bike's
 * pose is a pure function of the lap clock, so the same flight meets the
 * same riders on every run, and a bike is solid to a quad. Nothing here is
 * a new kind of mover: the module is handed a box on a road, as for a car.
 * Leaving the ground is ./profile.js's, render only.
 *
 * ONE LOOP, FOUR RIDERS, a jam session's order: they run the loop a quarter
 * of a lap apart, so somebody is in the air every five seconds or so,
 * east off one kicker and then west off the other. Every one is held to
 * TOP round the whole loop: the half circles at the ends are 12 m across,
 * which at TOP is LATERAL, 1.4 g on a flat floor, the most a rider leant
 * over on the dirt turns at.
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
import { loopElement, FIELD_W, FIELD_D } from './arena.js';
import { TOP, LAP } from './profile.js';

export { TOP };
export const LATERAL = 14.5;
export const DRIFT = 0.012;

/* A bike's solid, metres: nose to tail, across, up. */
export const BIKE = { length: 1.9, width: 0.75, height: 1.5 };

/* Each rider's paint, [bike, kit], keys of src/props/homes.js. */
export const LIVERIES = [
  ['mxOrange', 'drIndigo'], ['white', 'drNoboriRed'], ['qbMint', 'mxBlue'], ['drToriiBlack', 'qbSakura'],
];

/* Where each rider starts, metres round the lap, a quarter apart. */
export const RIDERS = LIVERIES.map((_, i) => ({ at: (i * LAP) / LIVERIES.length + 5, number: [7, 21, 88, 111][i] }));

/*
 * The traffic, as ../built/traffic.js makes it for a document of this
 * map's own holding the loop and its riders, fitted to a bike. Returns
 * { traffic, keepOut, lanes, bikes, groups }, in the shape
 * src/maps/moto/bikes.js reads: one lane, the loop itself.
 */
export function fmxTraffic() {
  const elements = [loopElement('fx-loop')];
  const bikes = [];
  RIDERS.forEach((r, n) => {
    elements.push({
      id: `fx-rider-${n}`,
      type: 'vehicle',
      road: 'fx-loop',
      style: 'kei',
      reverse: false,
      drift: true,
      dims: { offset: r.at, speed: TOP, variant: 1 + n },
    });
    bikes.push({
      element: `fx-rider-${n}`, lane: 0, group: 0, number: r.number, livery: LIVERIES[n],
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
  const road = traffic.roads.find((r) => r.element === 'fx-loop');
  const length = road ? road.line.length : LAP;
  const lanes = [{
    offset: 0,
    length,
    /* The module drives the loop's own centre line, so a distance along it
     * is the profile's arc length, a lap folded. */
    toCentre(s) {
      return s - length * Math.floor(s / length);
    },
  }];
  return {
    traffic, keepOut: roadKeepOut(traffic), lanes, bikes: placed, groups: [{ name: 'Riders', bikes: placed }],
  };
}
