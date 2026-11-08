/*
 * yard.js: Midori Gakuen's document, the few rows of the builder's model
 * the built map's pipeline wants beside the school's own parts
 * (./school.js): the field, the scene and one start pad. Nothing here is
 * scored: the school is the Infected mini game's and nothing else's, so it
 * has no named gaps, and the game seats every pilot itself on the pads
 * ./school.js lists (src/game/infected.js).
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

import { SCHOOL_DOC_ID } from '../registry.js';
import {
  S, FIELD_W, FIELD_D, FLOOR0, docAt, PADS,
} from './school.js';

export const SCHOOL_NAME = 'Midori Gakuen';

/* The school's document, ready for normalize(). The one start pad is the
 * first of the game's, in the ground floor hallway, so a pilot who arrives
 * before the round seats them arrives somewhere sensible. */
export function schoolDocument() {
  const pad = PADS.find((p) => p.f === 0);
  const at = docAt(pad.px, pad.py);
  return {
    schemaVersion: 3,
    id: SCHOOL_DOC_ID,
    name: SCHOOL_NAME,
    createdUtc: '2026-11-08T00:00:00Z',
    modifiedUtc: '2026-11-08T00:00:00Z',
    trackClass: 'full',
    mode: 'freestyle',
    field: { width: FIELD_W, depth: FIELD_D, gridSize: 1 },
    settings: { tangentScale: 1.1, minCurveRadius: 2.5, samplesPerSegment: 48 },
    scene: { time: 'golden', ground: 'grass' },
    branding: { logos: [] },
    credit: null,
    elements: [{
      id: 'el-1',
      type: 'startPads',
      name: '',
      position: { x: at.x, y: at.y, z: S * FLOOR0 },
      yaw: pad.yaw,
      pitch: 0,
      yawOverridden: true,
      dims: { pads: 1, spacing: 1.5, padSize: 0.9 },
    }],
    sequence: [],
  };
}
