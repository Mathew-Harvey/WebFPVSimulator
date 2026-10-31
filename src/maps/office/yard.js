/*
 * yard.js: Hoshino Shoji's document, the start and the named gaps, for the
 * built map pipeline (src/maps/built/), as the warehouse's yard.js is.
 *
 * WHERE THE GAPS ARE. Each is a window across an opening a pilot flies
 * through, in the plan's real metres (./office.js), stood a little inside
 * its opening so a gap scored is a gap flown clean. The plan's openings
 * carry the spans; the planes here say which wall each is in and on which
 * floor, which the plan keeps in the code that cuts the walls.
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

import { OFFICE_DOC_ID } from '../registry.js';
import {
  S, FIELD_W, FIELD_D, docAt, OPENINGS, SPAWN, F1, F2, F3, ROOF,
} from './office.js';

const EAST = 0;
const NORTH = Math.PI / 2;
const WEST = Math.PI;

export const OFFICE_NAME = 'Hoshino Shoji';

/* How far inside its opening a gap's rectangle stands, real metres, each
 * side. */
const MARGIN = 0.15;

/* The plan's lines the openings are cut in, real metres: the outside
 * walls' middles, the north rooms' front, the stair's front, the shaft's
 * front, the front office's wall, the meeting room's glass, the
 * president's wall. */
const SOUTH = -0.125;
const EAST_WALL = 24.125;
const CORE_Y = 11.925;
const STAIR_FACE = 11.85;
const SHAFT_FRONT = 12.9;

/*
 * The named gaps: `along` is 'x' for an opening in an east west wall (the
 * window's normal is north) and 'y' for one in a north south wall (normal
 * east); `at` is that wall's line, [a0, a1] the span along it and [h0, h1]
 * the heights, real metres from the street.
 */
const o = OPENINGS;
export const GAPS = [
  /* The ground floor, from the street. */
  { name: 'OPEN SHUTTER', points: 100, along: 'x', at: SOUTH, a: [o.shutterUp.a0, o.shutterUp.a1], h: [F1, o.shutterUp.h1] },
  { name: 'UNDER THE SHUTTER', points: 500, along: 'x', at: SOUTH, a: [o.shutterHalf.a0, o.shutterHalf.a1], h: [F1, o.shutterHalf.stop] },
  { name: 'RACKING AISLE', points: 250, along: 'x', at: 1.0, a: [1.2, 3.9], h: [F1, 3.0] },
  { name: 'RECEPTION HATCH', points: 500, along: 'y', at: 19.5, a: [o.hatch.a0, o.hatch.a1], h: [F1 + o.hatch.h0 - 0.05, o.hatch.h1] },
  { name: 'LIFT SHAFT DROP', points: 1000, along: 'x', at: SHAFT_FRONT, a: [o.liftDoor.a0, o.liftDoor.a1], h: [F1, F1 + o.liftDoor.h1 - 0.06] },
  /* The sales floor. */
  { name: 'STAIR DOOR', points: 100, along: 'x', at: STAIR_FACE, a: [o.stairDoor.a0, o.stairDoor.a1], h: [F2, F2 + o.stairDoor.h1 - 0.06] },
  { name: 'FREE ADDRESS TABLE', points: 500, along: 'y', at: 10.0, a: [7.11, 8.09], h: [F2, F2 + 0.69] },
  { name: 'PARTITION HOP', points: 250, along: 'x', at: 4.6, a: [15.2, 17.4], h: [F2 + 1.55, F2 + 2.55] },
  { name: 'KITCHEN NOREN', points: 100, along: 'x', at: CORE_Y, a: [12.7, 13.7], h: [F2, F2 + 2.04] },
  { name: 'OPEN WINDOW', points: 1000, along: 'x', at: SOUTH, a: [o.openWindow.a0, o.openWindow.a1], h: [F2 + o.openWindow.h0, F2 + o.openWindow.h1] },
  /* The management floor. */
  { name: 'MEETING ROOM', points: 250, along: 'x', at: 5.5, a: [15.86, 16.97], h: [F3 + 0.05, F3 + 2.1] },
  { name: 'BOARDROOM TABLE', points: 500, along: 'y', at: 12.3, a: [2.23, 3.27], h: [F3, F3 + 0.69] },
  { name: "PRESIDENT'S DOOR", points: 250, along: 'x', at: 6.5, a: [18.0, 19.0], h: [F3, F3 + 2.04] },
  { name: 'BREAK ROOM', points: 100, along: 'x', at: CORE_Y, a: [13.0, 15.0], h: [F3, F3 + 2.04] },
  { name: 'FIRE ESCAPE', points: 250, along: 'y', at: EAST_WALL, a: [o.fireDoor.a0, o.fireDoor.a1], h: [F3, F3 + o.fireDoor.h1 - 0.06] },
  /* The roof and the street. */
  { name: 'ROOF DOOR', points: 250, along: 'x', at: STAIR_FACE, a: [o.stairDoor.a0, o.stairDoor.a1], h: [ROOF, ROOF + o.stairDoor.h1 - 0.06] },
  { name: 'UNDER THE TANK', points: 500, along: 'y', at: 15.6, a: [9.46, 11.94], h: [ROOF, ROOF + 1.42] },
  { name: 'UNDER THE SIGN', points: 500, along: 'x', at: 1.4, a: [3.1, 7.9], h: [ROOF + 0.1, ROOF + 1.75] },
  { name: 'BETWEEN BUILDINGS', points: 1000, along: 'x', at: 0.0, a: [-1.2, -0.25], h: [0.3, 9.0] },
];

/* A gap's rectangle as the document's element. */
function gapRow(g) {
  const ew = g.along === 'x';
  const mid = (g.a[0] + g.a[1]) / 2;
  const p = ew ? docAt(mid, g.at) : docAt(g.at, mid);
  return ['gap', p.x, p.y, ew ? NORTH : EAST, {
    width: S * (g.a[1] - g.a[0] - 2 * MARGIN),
    height: S * (g.h[1] - g.h[0] - 2 * MARGIN),
  }, { z: S * (g.h[0] + MARGIN), name: g.name, points: g.points }];
}

/* A gap's opening, shrunk by the margin, as a plan box, for the check
 * (scripts/office-check.js) that nothing solid stands in it. */
export function gapBox(g) {
  const m = MARGIN;
  const [a0, a1] = [g.a[0] + m, g.a[1] - m];
  const [h0, h1] = [g.h[0] + m, g.h[1] - m];
  return g.along === 'x'
    ? { x0: a0, x1: a1, y0: g.at - 0.01, y1: g.at + 0.01, h0, h1 }
    : { x0: g.at - 0.01, x1: g.at + 0.01, y0: a0, y1: a1, h0, h1 };
}

function rows() {
  const pad = docAt(SPAWN.px, SPAWN.py);
  return [
    /* The start: one mat on the sales floor's main aisle, facing west
     * down it between the desk islands. */
    ['startPads', pad.x, pad.y, WEST, { pads: 1, spacing: 1.5, padSize: 0.9 }, { z: S * SPAWN.h }],
    ...GAPS.map(gapRow),
  ];
}

/* The building's document, ready for normalize(). */
export function officeDocument() {
  const elements = rows().map(([type, x, y, yaw, dims, extra = {}], i) => {
    const el = {
      id: `el-${i + 1}`,
      type,
      name: extra.name ?? '',
      position: { x, y, z: extra.z ?? 0 },
      yaw,
      pitch: 0,
      yawOverridden: false,
      dims: { ...dims },
    };
    if (extra.points) {
      el.points = extra.points;
    }
    return el;
  });
  return {
    schemaVersion: 3,
    id: OFFICE_DOC_ID,
    name: OFFICE_NAME,
    createdUtc: '2026-10-31T00:00:00Z',
    modifiedUtc: '2026-10-31T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: FIELD_W, depth: FIELD_D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'golden', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
