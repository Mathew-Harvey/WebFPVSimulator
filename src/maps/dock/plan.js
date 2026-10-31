/*
 * plan.js: Kamome Wharf, put together. The parts in the world frame and the
 * builder that holds what ./index.js draws over them; the ground the plant
 * is given where the harbour is; the named gaps; the partners' signs and
 * the hidden one; the start.
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

import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { Port, W, D, QUAY_Y, WATER_H, worldAt, wz, chunkOf } from './frame.js';
import {
  CRANES, CR, RAIL_L, RAIL_W, SHIP, WAREHOUSE, GATE, OFFICE, SPAWN, GANTRIES, BOX, EMPTIES, QUAY_Y as Q,
} from './site.js';
import { yard, canyonWindow, gantryWindow, rackWindow, emptyWalls } from './yard.js';
import { quay } from './quay.js';
import { harbour, CHANNEL } from './ship.js';
import { landside, gateLanes } from './land.js';

export { W, D, worldAt, chunkOf };

/* The port: { parts, T }. */
export function dockLayout() {
  const T = new Port();
  yard(T);
  quay(T);
  harbour(T);
  landside(T);
  return { parts: [...T.P.list], T };
}

/* The ground where no top is under the craft, world metres: the harbour's
 * surface north of the quay's edge, the paving's zero everywhere else. */
export function dockFloor(x, z) {
  return D / 2 - z > Q ? WATER_H : 0;
}

/* The harbour's cut out of the ground's planes: from the quay's edge north
 * to past the fog, the whole width and more. */
export const WATER_HOLE = { x0: -1200, x1: 1200, z0: -1200, z1: wz(QUAY_Y) };

/* Where the pilot starts, in the plan. */
export { SPAWN };

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of its window's middle in the plan, the heading it is flown along in
 * whole degrees, its clear width and the bottom and top of its clear
 * height, already inside the opening by the craft's radius and more.
 */
export function dockGaps() {
  const M = 0.3;
  const out = [];
  const midY = (RAIL_L + RAIL_W) / 2;
  const sideW = RAIL_W - RAIL_L - CR.legD - 2 * M;
  for (const c of CRANES) {
    out.push({ name: `UNDER CRANE ${c.n}`, px: c.cx - CR.legX, py: midY, deg: 0, w: sideW, h0: M, h1: CR.portal - M, points: 250 });
    out.push({ name: `PORTAL ${c.n}`, px: c.cx, py: RAIL_L, deg: 90, w: 2 * (CR.legX - CR.bogie) - 2 * M, h0: M, h1: CR.portal - M, points: 100 });
  }
  out.push({ name: 'SKY WINDOW', px: CRANES[1].cx - CR.legX, py: midY, deg: 0, w: sideW, h0: CR.mid + CR.midT + M, h1: CR.girder - 2 - M, points: 500 });
  const ch = (CHANNEL.y0 + CHANNEL.y1) / 2;
  const cw = CHANNEL.y1 - CHANNEL.y0 - 2 * M;
  out.push({ name: 'BOOM DIVE', px: CRANES[1].cx, py: ch, deg: 0, w: cw, h0: WATER_H + 0.6, h1: SHIP.deck - 0.5, points: 1000 });
  out.push({ name: 'HULL STRAFE', px: 250, py: ch, deg: 0, w: cw, h0: WATER_H + 0.6, h1: SHIP.deck - 0.5, points: 500 });
  const F = SHIP.funnel;
  out.push({ name: 'FUNNEL GAP', px: (F.x1 + SHIP.house.x0) / 2, py: (F.y0 + F.y1) / 2, deg: 90, w: SHIP.house.x0 - F.x1 - 2 * M, h0: SHIP.deck + M, h1: SHIP.house.wing - M, points: 1000 });
  const cy = canyonWindow();
  out.push({ name: 'CONTAINER CANYON', px: cy.x, py: cy.y, deg: 0, w: cy.w - 2 * M, h0: M, h1: cy.h1 - M, points: 500 });
  const walls = emptyWalls();
  out.push({ name: 'EMPTY CANYON', px: EMPTIES.x0 + 36, py: (walls[0].y1 + walls[1].y0) / 2, deg: 0, w: walls[1].y0 - walls[0].y1 - 2 * M, h0: M, h1: 5 * BOX.h - M, points: 500 });
  const r = rackWindow();
  out.push({ name: 'REEFER RACK', px: r.x + 4, py: r.y, deg: 0, w: r.w - 2 * M, h0: r.h0 + M, h1: r.h1 - M, points: 1000 });
  for (const k of [0, 2]) {
    const g = gantryWindow(k);
    out.push({ name: `GANTRY TC-0${k + 1}`, px: g.x, py: g.y, deg: 90, w: g.w - 2 * M, h0: g.h0 + M, h1: g.h1 - M, points: 250 });
  }
  const [p0, p1] = WAREHOUSE.pass;
  out.push({ name: 'BRICK ARCADE', px: (p0 + p1) / 2, py: (WAREHOUSE.y0 + WAREHOUSE.y1) / 2, deg: 90, w: p1 - p0 - 2 * M, h0: M, h1: WAREHOUSE.passH - M, points: 500 });
  const lane = gateLanes().lanes[2];
  out.push({ name: 'GATE LANE', px: (lane.x0 + lane.x1) / 2, py: (GATE.y0 + GATE.y1) / 2 + 2, deg: 90, w: GATE.lane - 2 * M, h0: M, h1: GATE.h - M, points: 100 });
  return out;
}

/* ---- the partners' signs ---- */

export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'dock'));

/* The faces the signs are painted on, each { px, py, h, face, maxW, maxH }
 * on a solid face with nothing in front of it: the three cranes' landside
 * portal ties, two machinery houses' yard faces, the office's and the
 * warehouse's gable walls. */
const FACES = [
  { px: CRANES[0].cx, py: RAIL_L - 1.0, h: CR.portal + CR.tie / 2, face: 's', maxW: 13, maxH: 1.9 },
  { px: CRANES[1].cx, py: RAIL_L - 1.0, h: CR.portal + CR.tie / 2, face: 's', maxW: 13, maxH: 1.9 },
  { px: CRANES[2].cx, py: RAIL_L - 1.0, h: CR.portal + CR.tie / 2, face: 's', maxW: 13, maxH: 1.9 },
  { px: OFFICE.x1, py: (OFFICE.y0 + OFFICE.y1) / 2, h: 6.2, face: 'e', maxW: 14, maxH: 5 },
  { px: WAREHOUSE.x0, py: (WAREHOUSE.y0 + WAREHOUSE.y1) / 2, h: 6.0, face: 'w', maxW: 14, maxH: 5 },
  { px: CRANES[0].cx, py: CR.house[1], h: CR.girder + CR.girderD + 3, face: 'n', maxW: 11, maxH: 4 },
  { px: CRANES[2].cx, py: CR.house[1], h: CR.girder + CR.girderD + 3, face: 'n', maxW: 11, maxH: 4 },
  { px: WAREHOUSE.x1, py: (WAREHOUSE.y0 + WAREHOUSE.y1) / 2, h: 6.0, face: 'e', maxW: 14, maxH: 5 },
];
const OUT = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] };

export function dockMarkSpots() {
  return BRANDS.slice(0, FACES.length).map((brand, i) => {
    const f = FACES[i];
    const o = OUT[f.face];
    const [x, y, z] = worldAt(f.px + o[0] * 0.01, f.py + o[1] * 0.01, f.h);
    const w = Math.min(f.maxW, f.maxH * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: [o[0], 0, -o[1]], up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  }).concat(hiddenMarkSpots());
}

/*
 * THE HIDDEN KONEX DRONE SIGN, the owner's promise of a logo hidden on every
 * map: on the ship's funnel, on its face toward the house, 22 m up inside
 * the three metre slot between the two. It is seen only from inside the
 * FUNNEL GAP, by a pilot who stops in the slot and turns to it.
 */
const HIDDEN_KONEX = { px: SHIP.funnel.x1, py: (SHIP.funnel.y0 + SHIP.funnel.y1) / 2, h: 22, w: 1.2 };
function hiddenMarkSpots() {
  const brand = BRANDS.find((b) => b.slug === 'konexdrone');
  if (!brand) {
    return [];
  }
  const [x, y, z] = worldAt(HIDDEN_KONEX.px + 0.01, HIDDEN_KONEX.py, HIDDEN_KONEX.h);
  return [{ slug: brand.slug, key: 'dock#konexdrone~hidden', p: [x, y, z], n: [1, 0, 0], up: [0, 1, 0], w: HIDDEN_KONEX.w, chunk: chunkOf(x, z) }];
}

export const GANTRY_COUNT = GANTRIES.length;
