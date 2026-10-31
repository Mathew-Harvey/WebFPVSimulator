/*
 * plan.js: Hamakaze Works whole. Builds the works from its parts
 * (./works.js, ./plant.js, ./site.js) into one structure for the built
 * map's pipeline, and says the things a map document says about it: where
 * the pilot starts, the named gaps, the ground in the basin, where the
 * brands' signs hang. Pure, as ./frame.js is, so scripts/factory-check.js
 * can build it in Node.
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

import { Town, worldAt, wx, wz, W, D, chunkOf } from './frame.js';
import { works, CANAL, GANTRY, HALL, CRANE, FLUE, TOWER, GALLERY, STACK } from './works.js';
import { plant, RACK, BRIDGE, SPHERES, SPHERE_C, SPHERE_R, TANKS, TANK, BUND, HOUSE, COOLER } from './plant.js';
import { site, ROADS, WORKSHOP } from './site.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';

export { W, D, worldAt, chunkOf };

/* The works: { parts, T }, the parts in the world frame and the builder
 * itself for everything ./index.js draws over them. */
export function factoryLayout() {
  const T = new Town();
  works(T);
  plant(T);
  site(T);
  return { parts: [...T.P.list], T };
}

/*
 * THE BRANDS' SIGNS, one for each brand on the roster that shows here,
 * each painted on a big plain face a pilot flies past: the steel shop's
 * cladding, both sides, the cooling tower's end, the control house's west
 * end over the switch room door, the transfer tower's head house, the
 * unloader's machinery house. { px, py, h, face, maxW, maxH }, `px, py`
 * on the face.
 */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'factory'));
/* The middle of the unloader's machinery house, along the girder. */
const QUAY_HOUSE_Y = 41.4;
const SPOTS = [
  { px: 40, py: HALL.y0 - HALL.wall, h: 8, face: 's', maxW: 12, maxH: 3.2 },
  { px: 106, py: HALL.y0 - HALL.wall, h: 8, face: 's', maxW: 12, maxH: 3.2 },
  { px: 40, py: HALL.y1 + HALL.wall, h: 8, face: 'n', maxW: 12, maxH: 3.2 },
  { px: 98, py: HALL.y1 + HALL.wall, h: 8, face: 'n', maxW: 12, maxH: 3.2 },
  { px: COOLER.x1, py: (COOLER.y0 + COOLER.y1) / 2, h: 4.8, face: 'e', maxW: 11, maxH: 3.0 },
  { px: HOUSE.x0, py: (HOUSE.y0 + HOUSE.y1) / 2, h: 6.4, face: 'w', maxW: 9, maxH: 2.4 },
  { px: (TOWER.x0 + TOWER.x1) / 2, py: TOWER.y1, h: 25.5, face: 'n', maxW: 6.4, maxH: 2.2 },
  { px: GANTRY.x1 - 1.0, py: QUAY_HOUSE_Y, h: 26.1, face: 'e', maxW: 6.0, maxH: 2.4 },
];

const OUT = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] };

export function factoryMarkSpots() {
  return BRANDS.slice(0, SPOTS.length).map((brand, i) => {
    const s = SPOTS[i];
    const o = OUT[s.face];
    const [x, y, z] = worldAt(s.px, s.py, s.h);
    const w = Math.min(s.maxW, s.maxH * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: [o[0], 0, -o[1]], up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  }).concat(hiddenMarkSpots());
}

/*
 * THE HIDDEN KONEX DRONE SIGN, the owner's promise of one small logo
 * hidden in every map: inside the conveyor gallery, on its south wall, over
 * the plant road, eighteen metres up. Only a pilot who threads the gallery
 * sees it, and from the gallery's middle it is a metre and a half off the
 * line and a few metres ahead, inside the finder's range and well off its
 * plane.
 */
export const HIDDEN_KONEX = { px: 145, py: GALLERY.y0 + 0.2, h: 18.0, w: 1.1 };
function hiddenMarkSpots() {
  const brand = BRANDS.find((b) => b.slug === 'konexdrone');
  if (!brand) {
    return [];
  }
  const K = HIDDEN_KONEX;
  const p = worldAt(K.px, K.py, K.h);
  return [{ slug: brand.slug, key: 'factory#konexdrone~hidden', p, n: [0, 0, -1], up: [0, 1, 0], w: K.w, chunk: chunkOf(p[0], p[2]) }];
}

/* The ground the plant is given where no top is under the craft, world
 * metres: the basin's water in the basin, the yard everywhere else. */
export function factoryFloor(x, z) {
  const py = D / 2 - z;
  const px = x + W / 2;
  return py > CANAL.y0 && py < CANAL.y1 && px > 0 && px < W ? CANAL.water : 0;
}

/* The basin's cut, as the world rectangle the ground's planes lose. */
export const BASIN_HOLE = { x0: wx(0), x1: wx(W), z0: wz(CANAL.y1), z1: wz(CANAL.y0) };

/* Where the pilot starts: on the plant road inside the gate, facing south
 * down it to the pipe bridge, the stack and the quay. */
export const SPAWN = { px: (ROADS.plant.x0 + ROADS.plant.x1) / 2, py: 222, h: 0.03, deg: -90 };

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of its window's middle in the plan, the heading it is flown along in
 * whole degrees (0 east, 90 north), its clear width and the bottom and top
 * of its clear height, already inside the opening by more than the craft's
 * radius.
 */
export function factoryGaps() {
  const M = 0.3;
  const R = RACK;
  const S3 = SPHERES[2];
  const H = HOUSE;
  const doorMid = (H.doorY0 + H.doorY1) / 2;
  return [
    { name: 'PIPE BRIDGE', px: (ROADS.plant.x0 + ROADS.plant.x1) / 2, py: (R.y0 + R.y1) / 2, deg: 90, w: BRIDGE.x1 - BRIDGE.x0 - R.col - 2 * M, h0: M, h1: R.tier1 - R.beam - M, points: 250 },
    { name: 'BETWEEN THE TIERS', px: 64, py: (R.y0 + R.y1) / 2, deg: 0, w: R.y1 - R.y0 - 2 * R.col - 2 * M - 0.4, h0: 7.2, h1: R.tier2 - R.beam - M, points: 1000 },
    { name: 'THROUGH THE MELT SHOP', px: HALL.x0, py: (HALL.doorY0 + HALL.doorY1) / 2, deg: 0, w: HALL.doorY1 - HALL.doorY0 - 2 * M, h0: 4.2, h1: HALL.doorH - M, points: 250 },
    { name: 'OVER THE CRANE', px: CRANE.x, py: 80, deg: 0, w: 12, h0: HALL.craneTop + M, h1: HALL.chord - M, points: 1000 },
    { name: 'THE GALLERY', px: 160, py: (GALLERY.y0 + GALLERY.y1) / 2, deg: 0, w: GALLERY.y1 - GALLERY.y0 - 0.4 - 2 * M, h0: GALLERY.belt + M, h1: GALLERY.roof - M, points: 1000 },
    { name: 'GANTRY DUCK', px: GANTRY.x0, py: (GANTRY.yA + GANTRY.yB) / 2, deg: 0, w: GANTRY.yB - GANTRY.yA - 1 - 2 * M, h0: GANTRY.tie1 + M, h1: GANTRY.tie2 - M, points: 500 },
    { name: 'UNDER THE SPHERE', px: S3.px, py: S3.py, deg: 90, w: 4, h0: M, h1: SPHERE_C - SPHERE_R - M, points: 1000 },
    { name: 'UNDER THE FLUE', px: (FLUE.x0 + FLUE.x1) / 2, py: 98, deg: 0, w: 3.0, h0: M, h1: FLUE.h0 - M, points: 250 },
    { name: 'SWITCH ROOM', px: H.x0, py: doorMid, deg: 0, w: H.doorY1 - H.doorY0 - 2 * M, h0: M, h1: H.doorH - M, points: 500 },
    { name: 'CONTROL ROOM', px: H.x1, py: (H.win.y0 + H.win.y1) / 2, deg: 0, w: H.win.y1 - H.win.y0 - 2 * M, h0: H.win.h0 + M, h1: H.win.h1 - M, points: 1000 },
    { name: 'THE TOWER', px: (TOWER.x0 + TOWER.x1) / 2, py: (TOWER.y0 + TOWER.y1) / 2, deg: 90, w: TOWER.x1 - TOWER.x0 - 1.2 - 2 * M, h0: TOWER.floors[0] + M, h1: TOWER.floors[1] - 0.3 - M, points: 250 },
    { name: 'TANK ALLEY', px: (TANKS[0].px + TANKS[1].px) / 2, py: TANKS[0].py, deg: 90, w: TANKS[1].px - TANKS[0].px - 2 * TANK.r - 2 * M, h0: BUND.h + M, h1: TANK.h - M, points: 500 },
    { name: 'SAWTOOTH SHED', px: WORKSHOP.x0, py: (WORKSHOP.y0 + WORKSHOP.y1) / 2, deg: 0, w: WORKSHOP.y1 - WORKSHOP.y0 - 5 - 2 * M, h0: M + 1.0, h1: 4.4 - M, points: 250 },
  ];
}

/* The title camera's tour: round the works at a height, looking in. */
export function tourPoints() {
  return [
    [145, 200, 26], [60, 150, 34], [20, 60, 30], [90, 10, 28], [200, 30, 34],
    [300, 80, 40], [300, 150, 46], [230, 200, 36], [STACK.px + 30, STACK.py + 20, 44],
  ];
}
