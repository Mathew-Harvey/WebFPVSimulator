/*
 * traffic.js: the rallycross cars of Tanada RX, as the physics module
 * takes them. Pure: plan metres in, the traffic out, no Three.js, so the
 * Node check drives it (scripts/rally-check.js).
 *
 * THE PHYSICS DRIVES THEM, as it drives every built map's cars
 * (../built/traffic.js, src/native/world.c section 5): a car's pose is a
 * pure function of the lap clock worked out inside the module, so the same
 * flight meets the same cars on every run, and a car is solid to a quad.
 * What the module does not do is leave the ground: ./ride.js lifts a car
 * over the jump, render only, from the pose. Nothing here is a new kind of
 * mover: the module is handed a box on a road, as for any car.
 *
 * THREE LINES, TWO PACKS. The course is driven on two lines three metres
 * either side of the centre, and on the centre line by the car taking its
 * joker (./circuit.js JOKER_NODES), so a heat runs side by side and the
 * pack is not a single file. The module has no car to car contact, which
 * is why the lines are a car's width and more apart and a car never
 * changes line. A real heat is three to five cars; the first pack is four,
 * the second a pair, a lap's half apart, so there is always a pack to find.
 *
 * SPEEDS. A top speed of TOP m/s, 86 km/h, which a Supercar passes in two
 * seconds but the module's own pull away of 2.5 m/s/s (world.c) reaches in
 * a long straight's length, so the course has no bend under about 14 m/s;
 * LATERAL is 1.4 g, a car on slicks or a gravel tyre leaning on its
 * bodywork. DRIFT is the module's slip gain: about 25 degrees of opposite
 * lock in the hairpins, which is a rallycross car on gravel.
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
import { courseElement, LANE_OFFSETS } from './circuit.js';
import { W, D } from './frame.js';

export const TOP = 24;
export const LATERAL = 14;
export const DRIFT = 0.016;

/*
 * THE CARS: [lane, metres round the lap at the start, livery]. Lane 1 is
 * the joker's line. The liveries are ./index.js's: a body colour and the
 * stripe and number panels laid over it.
 */
export const CARS = [
  [2, 120, 0], [0, 112, 1], [1, 104, 2], [2, 96, 3],
  [0, 760, 4], [2, 752, 5],
];

export function rallyTraffic() {
  const elements = [];
  LANE_OFFSETS.forEach((d, i) => {
    elements.push(courseElement(d, `rx-lane-${i}`, i === 1));
  });
  const cars = [];
  CARS.forEach(([lane, at, livery], n) => {
    elements.push({
      id: `rx-car-${n}`,
      type: 'vehicle',
      road: `rx-lane-${lane}`,
      style: 'hatch',
      reverse: false,
      drift: true,
      dims: { offset: at, speed: TOP, variant: 1 + n },
    });
    cars.push({ element: `rx-car-${n}`, lane, number: [7, 21, 33, 4, 11, 68][n], livery });
  });
  const doc = { mode: 'freestyle', field: { width: W, depth: D }, elements };
  const traffic = trafficOf(doc);
  const byElement = new Map(cars.map((c) => [c.element, c]));
  const placed = [];
  for (const v of traffic.vehicles) {
    const c = byElement.get(v.element);
    if (!c) {
      continue;
    }
    v.topSpeed = TOP;
    v.lateral = LATERAL;
    v.drift = DRIFT;
    v.name = `Car ${c.number}`;
    placed.push({ ...c, slot: v.slot });
  }
  return { traffic, keepOut: roadKeepOut(traffic), cars: placed };
}
