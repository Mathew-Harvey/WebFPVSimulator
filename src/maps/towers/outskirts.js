/*
 * outskirts.js: the city past the plot's edge, so a pilot at 240 m looks
 * out over more city and not over an empty yard. Two rows of blocks round
 * all four sides, offices, flats and a few towers, skinned with the same
 * painted facades (./facade.js) and with plain roofs: a few hundred
 * triangles a building, every one solid so nothing seen is flown through.
 * The fog takes most of it, which is the point: a skyline, not a place.
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

import { W, D, rng } from './frame.js';

const STYLES = ['glass', 'dark', 'granite', 'grid', 'ribbon', 'flats', 'flats', 'grid'];

function building(T, x0, y0, x1, y1, h, style, seed) {
  const r = { x0, y0, x1, y1 };
  T.block(style, r, 0, h, seed, 'outskirt');
  T.box(seed % 3 ? 'twRoof' : 'twRoofDark', x0, y0, h, x1, y1, h + 0.5, { name: 'outskirt roof' });
  T.box('twParapet', x0, y0, h + 0.5, x1, y0 + 0.4, h + 1.4, { solid: false });
  T.box('twParapet', x0, y1 - 0.4, h + 0.5, x1, y1, h + 1.4, { solid: false });
}

/* A row of blocks along one side, between a and b along it, `o0` to `o1`
 * out from the plot. */
function row(T, side, o0, o1, seed) {
  const r = rng(seed);
  const len = side === 'n' || side === 's' ? W + 2 * o1 : D;
  let a = side === 'n' || side === 's' ? -o1 : 0;
  const end = a + len;
  while (a < end - 8) {
    const w = Math.min(end - a, r.range(18, 34));
    const tall = r.chance(0.18);
    const h = tall ? r.range(110, 190) : r.range(18, 70);
    const style = tall ? r.pick(['glass', 'dark', 'granite']) : r.pick(STYLES);
    const d = r.range(14, o1 - o0);
    const s = Math.round(r.range(0, 997));
    if (side === 's') {
      building(T, a + 2, -o0 - d, a + w - 2, -o0, h, style, s);
    } else if (side === 'n') {
      building(T, a + 2, D + o0, a + w - 2, D + o0 + d, h, style, s);
    } else if (side === 'w') {
      building(T, -o0 - d, a + 2, -o0, a + w - 2, h, style, s);
    } else {
      building(T, W + o0, a + 2, W + o0 + d, a + w - 2, h, style, s);
    }
    a += w;
  }
}

export function outskirts(T) {
  /* The ground out there: paving, and the streets between the rows. */
  T.paint('twWalk', -110, -110, 0, W + 110, 0, 0.02);
  T.paint('twWalk', -110, D, 0, W + 110, D + 110, 0.02);
  T.paint('twWalk', -110, 0, 0, 0, D, 0.02);
  T.paint('twWalk', W, 0, 0, W + 110, D, 0.02);
  for (const [side, seed] of [['s', 11], ['n', 23], ['w', 37], ['e', 41]]) {
    row(T, side, 12, 48, seed);
    row(T, side, 60, 100, seed + 100);
  }
}
