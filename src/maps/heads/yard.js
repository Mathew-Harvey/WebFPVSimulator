/*
 * yard.js: the document Heads' house flies in, as ../house/yard.js is
 * Nick Burns' house's. Everything the house is comes from ./heads.js as one
 * structure of its own; this is what the built map's document format
 * already says well: the plot, the time of day and the ground, where the
 * pilot starts, and the named gaps.
 *
 * Built fresh on every call and the same every call, with a fixed id, so
 * the map keys its marks and stamps as one place, and the id is the
 * registry's, where src/share/stamps.js can read it without loading the
 * house.
 *
 * A gap's position is the middle of its opening's SILL in the document's
 * metres, `z` the sill's height in the world's, and its yaw the opening's
 * normal. Each one stands inside its opening with a margin all round, so
 * the frame a pilot clips is not counted as a pass.
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

import { HEADS_DOC_ID } from '../registry.js';
import { S, FIELD_W, FIELD_D, docAt, OPENINGS, SPAWN } from './heads.js';

const EAST = 0;
const NORTH = Math.PI / 2;
const SOUTH = -Math.PI / 2;

export const HEADS_NAME = "Heads' house";

/* How far inside its opening a gap's rectangle stands, real metres, each
 * side and over the sill. */
const MARGIN = 0.1;

/* A gap across an east west wall's opening (normal north) or a north south
 * one's (normal east). */
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
    /* The start: one mat on the garage's checkerboard behind the drone
     * shelf, facing out of the open door to the street. */
    ['startPads', pad.x, pad.y, SOUTH, { pads: 1, spacing: 1.5, padSize: 0.9 }, { z: S * SPAWN.h }],
    across(OPENINGS.garage, 'GARAGE DOOR', 100),
    across(OPENINGS.frontDoor, 'FRONT DOOR', 100),
    across(OPENINGS.slider, 'SLIDER', 100),
    across(OPENINGS.shopDoor, 'DOWN TO THE BASEMENT', 250),
    across(OPENINGS.downStairs, 'DOWN THE STAIRS', 250),
    across(OPENINGS.sideGate, 'SIDE GATE', 250),
    across(OPENINGS.livingWindow, 'LIVING ROOM WINDOW', 250),
    across(OPENINGS.garageGate, 'THE GARAGE GATE', 500),
    across(OPENINGS.basementGate, 'THE BASEMENT GATE', 500),
    across(OPENINGS.basementWindow, 'BASEMENT WINDOW', 500),
    across(OPENINGS.kitchenWindow, 'KITCHEN WINDOW', 500),
    across(OPENINGS.bedroomWindow, 'BEDROOM WINDOW', 500),
    across(OPENINGS.sideWindow, 'SIDE WINDOW', 1000),
  ];
}

/* The house's document, ready for normalize(). */
export function headsDocument() {
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
    id: HEADS_DOC_ID,
    name: HEADS_NAME,
    createdUtc: '2026-10-20T00:00:00Z',
    modifiedUtc: '2026-10-20T00:00:00Z',
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
