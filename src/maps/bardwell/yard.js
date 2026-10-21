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
 * Overcast, as every still is: a grey winter day in the hills.
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
import { S, FIELD_W, FIELD_D, docAt, OPENINGS, SPAWN } from './bardwell.js';

const EAST = 0;
const NORTH = Math.PI / 2;
const SOUTH = -Math.PI / 2;

export const BARDWELL_NAME = "Joshua Bardwell's house";

/* How far inside its opening a gap's rectangle stands, each side and over
 * the sill, metres: more than the craft's radius (CRAFT_WORLD_R in
 * src/game/collide.js, 0.17 m), so a pass the counter scores is one the
 * craft fits. Heads' house's 0.1 is 0.35 at its scale. */
const MARGIN = 0.25;

/* A gap across an east west line's opening (normal north) or a north
 * south one's (normal east). */
function across(o, name, points) {
  const ew = o.y !== undefined;
  const p = ew ? docAt((o.x0 + o.x1) / 2, o.y) : docAt(o.x, (o.y0 + o.y1) / 2);
  const span = ew ? o.x1 - o.x0 : o.y1 - o.y0;
  return ['gap', p.x, p.y, ew ? NORTH : EAST, {
    width: S * (span - 2 * MARGIN),
    height: S * (o.h1 - o.h0 - 2 * MARGIN),
  }, { z: S * (o.h0 + MARGIN), name, points }];
}

function rows() {
  const pad = docAt(SPAWN.px, SPAWN.py);
  return [
    /* The start: one mat on the lawn at the porch steps, facing down the
     * field. */
    ['startPads', pad.x, pad.y, SOUTH, { pads: 1, spacing: 1.5, padSize: 0.9 }, { z: S * SPAWN.h }],
    across(OPENINGS.gate, 'THE GATE', 100),
    across(OPENINGS.courtyard, 'THE COURTYARD', 100),
    across(OPENINGS.porch, 'THE PORCH', 250),
    across(OPENINGS.barn, 'THE BARN', 250),
    across(OPENINGS.gazebo, 'THE GAZEBO', 500),
    across(OPENINGS.pines, 'THE PINES', 500),
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
    scene: { time: 'overcast', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements,
    sequence: [],
  };
}
