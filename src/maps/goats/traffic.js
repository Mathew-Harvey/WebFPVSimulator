/*
 * traffic.js: the cars that drive Heads' neighbourhood. The owner's ask of
 * 28 October 2026, after "Do cars drive around ? If so what happens if a
 * car hits a goat ?": "Let's put moving cars as you suggest". Pure: plan
 * metres in, the traffic the physics module takes out, no Three.js, so the
 * Node check can drive it (scripts/goats-check.js).
 *
 * THE PHYSICS DRIVES THEM, as it drives a built map's (../built/traffic.js
 * and src/native/world.c section 5): a car's pose is a pure function of the
 * lap clock, worked out inside the module, so the same flight meets the
 * same cars in every engine, and a car is solid to the whoop. That is also
 * why a car does not brake for a goat: the goats are render only and run on
 * the frame's clock (./herd.js), and a car that waited for one would make
 * the craft's physics depend on them. So a goat gets out of a car's way
 * instead (thinkCars and leapFromCars in ./herd.js), and no car ever drives
 * through one.
 *
 * FOUR LOOPS, ONE ROUND EACH BLOCK, CLOCKWISE. The grid's three streets
 * each way make four blocks. A car going clockwise round a block keeps it
 * on its right, so it drives the lane next to the block on every side, on
 * the right as Heads' street does (his stop sign is for traffic coming west
 * on the north side of Street A), and it only ever turns right, round its
 * own block's corner. So between them the four loops drive both lanes of
 * Street A and the cross street and the inside lane of the four streets
 * round the edge, no lane is driven by two loops, no car goes straight
 * across a junction, and no two cars' paths ever cross: the module has no
 * car to car contact, and none is needed. Cars on one loop share its speed
 * table, so they keep the gap they start with.
 *
 * WHERE A LANE IS. Its middle LANE_KERB plan metres in from the kerb on its
 * side: clear of a parked car's side by a quarter of a metre (a car parks
 * with its middle 1.25 m from the kerb, ./hood.js), and clear of the middle
 * line by more than half a car. Every corner is the kerb's own corner moved
 * in by the same, so a car turns round it CORNER_R + LANE_KERB out from the
 * corner's middle, LANE_KERB from the kerb all the way round. A lane is a
 * one lane closed road (../built/road.js), its middle on the lane, so the
 * bends are eased exactly as a built map's are.
 *
 * AT THE MAP'S SCALE. The neighbourhood is drawn S times real size (Heads'
 * house's frame), and the cars are the town's cars at the same S, as the
 * parked ones are: so their length, width and height are scaled here before
 * the module is handed them. Their pace is a careful driver's in a street of
 * goats, SPEED world metres a second, about 10 km/h at the plan's scale,
 * and they take a bend at LATERAL, so they slow into each corner.
 *
 * FOR THE LATENCY RULE. Physics: CARS movers, each a box the module seats
 * itself every step, beside the 20,000 shapes of the street. Render and the
 * goats: ./cardraw.js and ./herd.js say theirs.
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
import { roadOf } from '../built/road.js';
import { S, worldAt, CORNER_R } from '../heads/heads.js';
import { EW, NS } from './hood.js';
import { GOATS_FIELD_W, GOATS_FIELD_D } from './yard.js';

/* A lane's middle from the kerb on its side, plan metres. */
export const LANE_KERB = 3.2;

/* Top speed, world metres a second, and how hard a bend is taken, world
 * metres a second a second: a bend of the corners' radius at about 8. */
const SPEED = 10;
const LATERAL = 2;

/* The cars on each loop, evenly spaced round it, and what they are: two
 * of the street's own parked kinds (./hood.js CAR_STYLES), one low and one
 * tall, which is as many as one draw call holds well (./cardraw.js). */
const PER_LOOP = 2;
const STYLES = ['sedan', 'minivan', 'minivan', 'sedan', 'sedan', 'minivan', 'minivan', 'sedan'];

/* A lane on street `st`, on its high side (s = 1) or its low side (-1). */
const lane = (st, s) => st.c + s * (st.h - LANE_KERB);

/*
 * The four loops, plan metres, each as its corners in the order it is
 * driven: clockwise round its block, so every turn is a right turn. `y` is
 * an east west street's lane, `x` a north south one's.
 */
function loops() {
  const [A, C, D] = EW;
  const [B, W, E] = NS;
  const corners = (x0, x1, y0, y1) => [[x0, y1], [x1, y1], [x1, y0], [x0, y0]];
  return [
    /* North west: C east, the cross street south, A west, W north. */
    { id: 'nw', corners: corners(lane(W, 1), lane(B, -1), lane(A, 1), lane(C, -1)) },
    /* North east, Heads' own block: C east, E south, A west past his
     * drive, the cross street north. */
    { id: 'ne', corners: corners(lane(B, 1), lane(E, -1), lane(A, 1), lane(C, -1)) },
    /* South east, round the park: A east, E south, D west, the cross
     * street north. */
    { id: 'se', corners: corners(lane(B, 1), lane(E, -1), lane(D, 1), lane(A, -1)) },
    /* South west: A east, the cross street south, D west, W north. */
    { id: 'sw', corners: corners(lane(W, 1), lane(B, -1), lane(D, 1), lane(A, -1)) },
  ];
}

/* A plan point in the document's plan (../built/place.js docToWorld takes
 * that to the world): metres from the field's south west corner. */
const W2 = GOATS_FIELD_W / 2;
const D2 = GOATS_FIELD_D / 2;
function toDoc(px, py) {
  const [x, , z] = worldAt(px, py, 0);
  return { x: x + W2, y: D2 - z };
}

/*
 * The traffic, as ../built/traffic.js trafficOf makes it for a map
 * document, from a document of this map's own that holds nothing but the
 * four loops and their cars, then taken to the map's scale. Returns
 * { traffic, keepOut, loops }: `traffic` for uploadTraffic and the drawing,
 * `keepOut` the roads a crash is not set down on (roadKeepOut), and `loops`
 * each loop's id, corners and line in the document's plan, for the check.
 */
export function goatTraffic() {
  const L = loops();
  const elements = [];
  let n = 0;
  for (const loop of L) {
    const road = {
      id: `goats-lane-${loop.id}`,
      type: 'road',
      position: { x: 0, y: 0, z: 0 },
      closed: true,
      nodes: loop.corners.map(([px, py]) => toDoc(px, py)),
      /* One lane, a car's width or so wide: the crash keep out is half of
       * it either side of the lane plus half a car. */
      dims: { width: S, lanes: 1, radius: S * (CORNER_R + LANE_KERB) },
    };
    elements.push(road);
    loop.line = roadOf(road).centre;
    for (let k = 0; k < PER_LOOP; k += 1) {
      elements.push({
        id: `goats-car-${loop.id}-${k + 1}`,
        type: 'vehicle',
        road: road.id,
        style: STYLES[n % STYLES.length],
        reverse: false,
        drift: false,
        dims: { offset: ((k + 0.3 * (n % 3)) / PER_LOOP) * loop.line.length, speed: SPEED, variant: 1 + n * 7 },
      });
      n += 1;
    }
  }
  const doc = { mode: 'freestyle', field: { width: GOATS_FIELD_W, depth: GOATS_FIELD_D }, elements };
  const traffic = trafficOf(doc);
  for (const v of traffic.vehicles) {
    v.length *= S;
    v.width *= S;
    v.height *= S;
    v.lateral = LATERAL;
  }
  return { traffic, keepOut: roadKeepOut(traffic), loops: L };
}
