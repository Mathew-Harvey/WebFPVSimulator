/*
 * plan.js: Kazami Airfield whole. Builds the place from its parts (the
 * valley, ./valley.js; the hangar, ./hangar.js; the field, ./field.js) into
 * one structure for the built map's pipeline, and says the things a map
 * document says about it: where the pilot starts, the named gaps, the
 * ground in the channel, where the hidden sign is. Pure, as ./frame.js is,
 * so scripts/airfield-check.js can build it in Node.
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

import { Town, worldAt, wx, wz, W, D, chunkOf } from './frame.js';
import { valley, CHANNEL, wallPy, PROFILE } from './valley.js';
import { hangar, HANGAR, RAFTERS } from './hangar.js';
import { field, raceGates, SHRINE, SHEDS, FARM_BRIDGE, MAST, TORII_OUT } from './field.js';
import { farm, VINYL, OPEN } from './farm.js';

export { W, D, worldAt, chunkOf };

/* The woods are kept open here: round the radio mast, and the clearing
 * the race's cedar gate stands in. */
const CLEAR = [
  { x0: MAST.px - 7, x1: MAST.px + 7, y0: MAST.py - 7, y1: MAST.py + 7 },
  { x0: 108, x1: 128, y0: 300, y1: 340 },
];

/* The bench the shrine stands on, and the stair's line up to it, are
 * kept to grass rather than flooded. */
const DRY = [0, 1, 2, 3].map((k) => ({ side: 0, k, x0: SHRINE.px - 9, x1: SHRINE.px + 9 }));

/*
 * The place: { parts, T }, the parts in the world frame, and the builder
 * itself for everything ./index.js draws over them.
 */
export function airfieldLayout() {
  const T = new Town();
  const counts = valley(T, CLEAR, DRY);
  hangar(T);
  field(T);
  farm(T);
  return { parts: [...T.P.list], T, counts };
}

/* The ground the plant is given where no top is under the craft, world
 * metres: the channel's bed in the channel, the floor everywhere else. */
export function airfieldFloor(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  const C = CHANNEL;
  return px > C.x0 && px < C.x1 && py > C.y0 && py < C.y1 ? C.bed : 0;
}

/* The channel's cut, as the world rectangle the ground's planes lose. */
export const CHANNEL_HOLE = { x0: wx(CHANNEL.x0), x1: wx(CHANNEL.x1), z0: wz(CHANNEL.y1), z1: wz(CHANNEL.y0) };

/* Where the pilot starts: four mats on the apron west of the hangar,
 * facing east down the apron to the first gate. */
export const SPAWN = { px: 178, py: 213, h: 0.03, deg: 0 };

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of its window's middle in the plan, the heading it is flown along in
 * whole degrees, its clear width and the bottom and top of its clear
 * height, inside the opening by more than the craft's radius. The race's
 * fourteen first, in its order, then the places'.
 */
export function airfieldGaps() {
  const M = 0.3;
  const race = raceGates().map((g) => ({
    name: g.name, px: g.px, py: g.py, deg: g.deg, w: g.kind === 'open' ? g.w : g.w - 2 * M,
    h0: g.base + M, h1: g.base + g.hh - M, points: g.points,
  }));
  const S = SHRINE;
  const toriiY = wallPy(0, 0, S.px) + TORII_OUT;
  const C = CHANNEL;
  return [
    ...race,
    { name: 'THE RAFTERS', px: RAFTERS.px, py: RAFTERS.py, deg: 90, w: RAFTERS.w - 2 * M - 0.2, h0: RAFTERS.h0 + M, h1: RAFTERS.h1 - M - 0.1, points: 1000 },
    { name: 'THE TORII', px: S.px, py: toriiY, deg: 270, w: 3.6 - 0.34 - 2 * M, h0: M, h1: 4.2 - 0.95 - M, points: 500 },
    { name: 'UNDER THE FARM BRIDGE', px: FARM_BRIDGE.px, py: (C.y0 + C.y1) / 2, deg: 0, w: C.y1 - C.y0 - 2 * M, h0: C.water + 0.1, h1: FARM_BRIDGE.deck - FARM_BRIDGE.thick - M, points: 1000 },
    { name: 'THE GREENHOUSE', px: (OPEN.x0 + OPEN.x1) / 2, py: OPEN.y, deg: 0, w: VINYL.w - 2.4, h0: M, h1: VINYL.wall + 0.7, points: 250 },
    { name: 'THE SHED', px: (SHEDS.door.x0 + SHEDS.door.x1) / 2, py: SHEDS.y1, deg: 90, w: SHEDS.door.x1 - SHEDS.door.x0 - 2 * M, h0: M, h1: SHEDS.door.h - 0.5 - M, points: 250 },
    /* The dive line: off the hangar's crown, down its front and along the
     * taxiway to the strip, low through this window at the taxiway's end. */
    { name: 'THE DIVE LINE', px: (HANGAR.x0 + HANGAR.x1) / 2, py: 196, deg: 270, w: 10, h0: 0.4, h1: 4.5, points: 500 },
  ];
}

/*
 * THE HIDDEN SIGN: one small Konex Drone mark (the owner's promise of a
 * logo hidden in every map), on the inside of the hangar's back gable,
 * high over the back door, behind the last truss. It is only seen from
 * the rafters: fly THE RAFTERS the length of the hangar and it is in front
 * of the lens at the end, within the four metres the found stamp asks.
 */
const HIDDEN_KONEX = { p: worldAt((HANGAR.x0 + HANGAR.x1) / 2, HANGAR.y1 - 0.14, 8.7), n: [0, 0, 1], w: 1.2 };
export function airfieldMarkSpots() {
  const { p, n, w } = HIDDEN_KONEX;
  return [{ slug: 'konexdrone', key: 'airfield#konexdrone~hidden', p: [...p], n: [...n], up: [0, 1, 0], w, chunk: chunkOf(p[0], p[2]) }];
}

/* The title camera's tour: round the valley at a height, looking in. */
export function tourPoints() {
  return [
    [60, 140, 28], [160, 120, 18], [250, 150, 24], [360, 130, 30], [440, 190, 34],
    [380, 250, 26], [262, 214, 16], [180, 200, 14], [100, 240, 30],
  ];
}

/* For the check: the floor's benches, so a test can stand on one. */
export { PROFILE };
