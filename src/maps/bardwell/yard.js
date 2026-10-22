/*
 * yard.js: the document Joshua Bardwell's house flies in, as ../heads/yard.js
 * is Heads' house's. Everything the place is comes from ./bardwell.js as
 * one structure of its own; this is what the built map's document format
 * already says well: the plot, the time of day and the ground, where the
 * pilot starts, and the named gaps.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place, and the id is the
 * registry's, where src/share/stamps.js can read it without loading the
 * house.
 *
 * Clear afternoon light, as the Workshop map has it (its own weather is
 * four in the afternoon with a little cloud). Beyond the woods, the
 * skyline its screenshots show: a tower crane to the north east and power
 * pylons down the east side, from the builder's own assets, so they are
 * solid as every crane and pylon is.
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

import { BARDWELL_DOC_ID } from '../registry.js';
import {
  S, FIELD_W, FIELD_D, docAt, OPENINGS, PLACES, GATES, SPAWN,
} from './bardwell.js';

const EAST = 0;
const DEG = Math.PI / 180;

export const BARDWELL_NAME = "Joshua Bardwell's house";

/* How far inside its opening a gap's rectangle stands, each side and over
 * the sill, metres: more than the craft's radius (CRAFT_WORLD_R in
 * src/game/collide.js, 0.17 m), so a pass the counter scores is one the
 * craft fits. Heads' house's 0.1 is 0.35 at its scale. */
const MARGIN = 0.25;

/* A gap through an opening ./bardwell.js describes: its foot's middle in
 * the plan, the heading it is flown along in whole degrees (so the yaw is
 * a product, the same bits everywhere), its clear width and the bottom and
 * top of its clear height. */
function through(o, name, points) {
  const p = docAt(o.px, o.py);
  return ['gap', p.x, p.y, o.deg * DEG, {
    width: S * (o.w - 2 * MARGIN),
    height: S * (o.h1 - o.h0 - 2 * MARGIN),
  }, { z: S * (o.h0 + MARGIN), name, points }];
}

function rows() {
  const pad = docAt(SPAWN.px, SPAWN.py);
  const at = (px, py) => docAt(px, py);
  const crane = at(106, 30);
  const pylons = [at(108, -20), at(108, -78)];
  return [
    /* The start: one mat on the lawn where the race starts, facing east
     * down the line through the A frame. */
    ['startPads', pad.x, pad.y, EAST, { pads: 1, spacing: 1.5, padSize: 0.9 }, { z: S * SPAWN.h }],
    /* The race's gates, in its order. */
    ...GATES.map((g) => through(OPENINGS[g.name], g.name, g.points)),
    /* And the places' own. */
    through(PLACES.porch, 'THE PORCH', PLACES.porch.points),
    through(PLACES.woodshed, 'THE WOODSHED', PLACES.woodshed.points),
    through(PLACES.leanto, 'THE LEAN-TO', PLACES.leanto.points),
    through(PLACES.stand, 'UNDER THE STAND', PLACES.stand.points),
    /* The skyline: the crane's jib out over the woods to the west, two
     * pylons down the east side. */
    ['crane', crane.x, crane.y, 180 * DEG, { height: 34, jib: 30, counterJib: 10, hook: 10, trolley: 0.5 }],
    ...pylons.map((q) => ['pylon', q.x, q.y, 90 * DEG, { height: 30 }]),
  ];
}

/* The place's document, ready for normalize(). */
export function bardwellDocument() {
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
    id: BARDWELL_DOC_ID,
    name: BARDWELL_NAME,
    createdUtc: '2026-10-21T00:00:00Z',
    modifiedUtc: '2026-10-21T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: FIELD_W, depth: FIELD_D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'noon', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
