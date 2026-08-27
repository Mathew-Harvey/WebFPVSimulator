/*
 * barn.js: horse stable with loft stairs, and the open hay shed.
 *
 * Three stall mouths on the south, an east aisle, a loft you can land.
 * The hay shed is three walls and a roof. Bales leave a 1.6 m aisle.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { L, slab, decal, deck, punchedZ, punchedX, deckAround } from './kit.js';

export function buildBarn(root, colliders, platforms, M) {
  stable(root, colliders, platforms, M);
  hayShed(root, colliders, platforms, M);
}

function stable(root, colliders, platforms, M) {
  const s = L.stable;
  const t = s.t;
  const stallH = 2.52;
  const holes = L.stalls.map((st) => ({
    x0: st.x0, x1: st.x1, y0: 0, y1: stallH,
  }));
  punchedZ(root, colliders, M.barn, s.x0, 0, s.x1, s.h, s.z0, s.z0 + t, holes);
  punchedZ(root, colliders, M.barn, s.x0, 0, s.x1, s.h, s.z1 - t, s.z1, []);
  punchedX(root, colliders, M.barnShade, s.z0 + t, 0, s.z1 - t, s.h, s.x0, s.x0 + t, []);
  punchedX(root, colliders, M.barn, s.z0 + t, 0, s.z1 - t, s.h, s.x1 - t, s.x1, [
    { z0: L.aisle.z0, z1: L.aisle.z1, y0: 0, y1: stallH },
  ]);

  const well = {
    x0: s.x0 + t + 0.4,
    x1: s.x1 - t,
    z0: s.z0 + t + 0.15,
    z1: s.z0 + 4.6,
  };
  deckAround(
    root, colliders, platforms, M.wood,
    s.x0 + t, s.z0 + t, s.x1 - t, s.z1 - t,
    s.loft, 0.2, [well],
  );

  const n = 7;
  const rise = s.loft / n;
  const run = 0.32;
  const sx1 = s.x1 - t;
  const sx0 = sx1 - 1.2;
  const zEdge = well.z1;
  for (let i = 0; i < n; i += 1) {
    const y0 = i * rise;
    const y1 = (i + 1) * rise + 0.08;
    const z0 = zEdge - (n - i) * run;
    const z1 = zEdge - (n - 1 - i) * run;
    slab(root, colliders, M.woodDark, sx0, y0, z0, sx1, y1, z1, { kind: 'obstacle' });
  }

  deck(root, colliders, platforms, M.roof, s.x0 - 0.7, s.z0 - 0.7, s.x1 + 0.7, s.z1 + 0.7, s.h + 0.32, 0.32);
  slab(root, colliders, M.roofSun, s.x0 + 1.2, s.h + 0.32, s.z0 + 4, s.x1 - 1.2, s.h + 0.7, s.z1 - 4, {
    solid: false,
  });
  decal(root, colliders, M.woodDark, s.x0 - 0.7, s.h, s.z0 - 0.7, s.x1 + 0.7, s.h + 0.16, s.z0 - 0.58);
  decal(root, colliders, M.woodDark, s.x0 - 0.7, s.h, s.z1 + 0.58, s.x1 + 0.7, s.h + 0.16, s.z1 + 0.7);

  for (const st of L.stalls) {
    decal(root, colliders, M.woodDark, st.x0 - 0.08, 0, s.z0 - 0.04, st.x0, stallH, s.z0);
    decal(root, colliders, M.woodDark, st.x1, 0, s.z0 - 0.04, st.x1 + 0.08, stallH, s.z0);
    decal(root, colliders, M.woodDark, st.x0, stallH - 0.08, s.z0 - 0.04, st.x1, stallH, s.z0);
  }
  decal(root, colliders, M.pane, -31.2, 3.35, s.z0 - 0.04, -29.4, 4.55, s.z0);
  decal(root, colliders, M.pane, -23.6, 3.35, s.z0 - 0.04, -21.8, 4.55, s.z0);
  decal(root, colliders, M.woodDark, s.x0 - 0.04, 0, s.z0, s.x0, s.h, s.z0 + 0.12);
  decal(root, colliders, M.woodDark, s.x1, 0, s.z0, s.x1 + 0.04, s.h, s.z0 + 0.12);

  /* Feed bin, north-west corner, under the loft. Loft underside is 2.68,
   * bin stops at 1.12 so the leftover above is 1.56 m. */
  slab(root, colliders, M.woodDark, s.x0 + t, 0, s.z1 - t - 1.2, s.x0 + t + 1.2, 1.12, s.z1 - t, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.woodDark, -26.58, s.loft - 0.2, 17.22, -26.42, s.loft, 17.38, {
    solid: false, cast: false,
  });
}

function hayShed(root, colliders, platforms, M) {
  const h = L.hay;
  const t = h.t;
  slab(root, colliders, M.wood, h.x0, 0, h.z1 - t, h.x1, h.h - 0.18, h.z1);
  slab(root, colliders, M.woodDark, h.x0, 0, h.z0 + 0.35, h.x0 + t, h.h - 0.18, h.z1 - t);
  slab(root, colliders, M.woodDark, h.x1 - t, 0, h.z0 + 0.35, h.x1, h.h - 0.18, h.z1 - t);
  deck(root, colliders, platforms, M.woodSun, h.x0 - 0.55, h.z0 - 0.2, h.x1 + 0.55, h.z1 + 0.25, h.h, 0.18);
  slab(root, colliders, M.woodDark, h.x0 + t, h.h - 0.30, h.z0 + 0.4, h.x1 - t, h.h - 0.18, h.z1 - t, {
    kind: 'pole',
  });

  stack(root, colliders, M, h.x0 + t, h.z1 - t - 1.2);
  stack(root, colliders, M, h.x0 + t + 1.2 + 1.6, h.z1 - t - 1.2);
  stack(root, colliders, M, h.x0 - 1.2, h.z1 - t - 1.2);
  stack(root, colliders, M, h.x0 - 1.2, h.z0 + 0.35);
}

function stack(root, colliders, M, x, z) {
  slab(root, colliders, M.hay, x, 0, z, x + 1.2, 0.9, z + 1.2, { kind: 'obstacle' });
  slab(root, colliders, M.hayShade, x + 0.04, 0.9, z + 0.04, x + 1.16, 1.78, z + 1.16, {
    kind: 'obstacle',
  });
}
