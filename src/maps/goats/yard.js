/*
 * yard.js: the document the 90%er goat herding map flies in, as
 * ../heads/yard.js is Heads' house's. Heads' house's own document, its
 * start in the garage and its named gaps, moved onto a field big enough
 * for the whole neighbourhood (./hood.js), centred where the house's world
 * frame puts it so every part of the house lands where it does on Heads'
 * house.
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

import { GOATS_DOC_ID } from '../registry.js';
import { headsDocument } from '../heads/yard.js';
import { FIELD_W, FIELD_D, worldAt } from '../heads/heads.js';
import { BOUNDS } from './hood.js';

export const GOATS_NAME = "90%er goat herding";

/* The field: the world's origin is its middle (../built/place.js
 * docToWorld), so it is as wide as twice the neighbourhood's furthest
 * reach from the origin each way. */
const [ax, , az] = worldAt(BOUNDS.x0, BOUNDS.y0, 0);
const [bx, , bz] = worldAt(BOUNDS.x1, BOUNDS.y1, 0);
export const GOATS_FIELD_W = 2 * Math.ceil(Math.max(Math.abs(ax), Math.abs(bx)));
export const GOATS_FIELD_D = 2 * Math.ceil(Math.max(Math.abs(az), Math.abs(bz)));

/* The map's document, ready for normalize(): Heads' house's elements, each
 * moved by the difference of the two fields' halves, which keeps it where
 * it is in the world. */
export function goatsDocument() {
  const heads = headsDocument();
  const dx = (GOATS_FIELD_W - FIELD_W) / 2;
  const dy = (GOATS_FIELD_D - FIELD_D) / 2;
  const elements = heads.elements.map((el) => ({
    ...el,
    position: { ...el.position, x: el.position.x + dx, y: el.position.y + dy },
  }));
  return {
    ...heads,
    id: GOATS_DOC_ID,
    name: GOATS_NAME,
    createdUtc: '2026-10-28T00:00:00Z',
    modifiedUtc: '2026-10-28T00:00:00Z',
    field: { width: GOATS_FIELD_W, depth: GOATS_FIELD_D, gridSize: 1 },
    elements,
  };
}
