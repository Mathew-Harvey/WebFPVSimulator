/*
 * pool.js: empty 50 m basin, depth steps, diving tower.
 *
 * The pool is the kiln tube of this map: a flyable well you can see from
 * the south mouth. Depth is three slabs, the hopper grammar. The tower
 * is landable decks, not a ramp. Cantilever boards open on the dive face.
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

import { L, slab, deck, decal } from './kit.js';

export function buildPool(root, colliders, platforms, M) {
  buildBasin(root, colliders, M);
  buildSteps(root, colliders, M);
  buildCoping(root, colliders, M);
  buildTower(root, colliders, platforms, M);
  buildPlantPit(root, colliders, M);
}

function buildBasin(root, colliders, M) {
  const p = L.pool;
  const w = p.wall;
  slab(root, colliders, M.tile, p.x0 - w, p.deepY, p.z0 - w, p.x1 + w, 0, p.z0);
  slab(root, colliders, M.tile, p.x0 - w, p.deepY, p.z1, p.x1 + w, 0, p.z1 + w);
  slab(root, colliders, M.tile, p.x0 - w, p.deepY, p.z0, p.x0, 0, p.z1);
  slab(root, colliders, M.tile, p.x1, p.deepY, p.z0, p.x1 + w, 0, p.z1);

  slab(root, colliders, M.tile, p.x0, p.shallowY - 0.4, p.z0, p.shallowX, p.shallowY, p.z1);
  slab(root, colliders, M.tile, p.shallowX, p.midY - 0.4, p.z0, p.midX, p.midY, p.z1);
  slab(root, colliders, M.tileDeep, p.midX, p.deepY - 0.4, p.z0, p.x1, p.deepY, p.z1);

  const lane = (p.z1 - p.z0) / 6;
  for (let i = 1; i < 6; i += 1) {
    const z = p.z0 + lane * i;
    decal(root, colliders, M.tileLine, p.x0 + 0.3, p.shallowY + 0.02, z - 0.06, p.shallowX - 0.05, p.shallowY + 0.05, z + 0.06);
    decal(root, colliders, M.tileLine, p.shallowX + 0.05, p.midY + 0.02, z - 0.06, p.midX - 0.05, p.midY + 0.05, z + 0.06);
    decal(root, colliders, M.tileLine, p.midX + 0.05, p.deepY + 0.02, z - 0.06, p.x1 - 0.3, p.deepY + 0.05, z + 0.06);
  }
  decal(root, colliders, M.tileLine, p.x0 + 0.25, p.shallowY + 0.02, p.z0 + 0.25, p.x0 + 0.45, p.shallowY + 0.05, p.z1 - 0.25);
  decal(root, colliders, M.tileLine, p.x1 - 0.45, p.deepY + 0.02, p.z0 + 0.25, p.x1 - 0.25, p.deepY + 0.05, p.z1 - 0.25);
}

function buildSteps(root, colliders, M) {
  const p = L.pool;
  const t = 0.4;
  slab(root, colliders, M.tile, p.shallowX, p.midY, p.z0, p.shallowX + t, p.shallowY, p.z1);
  slab(root, colliders, M.tileDeep, p.midX, p.deepY, p.z0, p.midX + t, p.midY, p.z1);
  decal(root, colliders, M.safety, p.shallowX, p.shallowY - 0.02, p.z0, p.shallowX + t, p.shallowY + 0.04, p.z1);
  decal(root, colliders, M.safety, p.midX, p.midY - 0.02, p.z0, p.midX + t, p.midY + 0.04, p.z1);
}

function buildCoping(root, colliders, M) {
  const p = L.pool;
  const c = 0.42;
  decal(root, colliders, M.white, p.x0 - c, 0.02, p.z0 - c, p.x1 + c, 0.06, p.z0);
  decal(root, colliders, M.white, p.x0 - c, 0.02, p.z1, p.x1 + c, 0.06, p.z1 + c);
  decal(root, colliders, M.white, p.x0 - c, 0.02, p.z0, p.x0, 0.06, p.z1);
  decal(root, colliders, M.white, p.x1, 0.02, p.z0, p.x1 + c, 0.06, p.z1);
}

function buildTower(root, colliders, platforms, M) {
  const tw = L.tower;
  const cols = [
    [tw.x0 + 0.28, tw.z0 + 0.28],
    [tw.x1 - 0.28, tw.z0 + 0.28],
    [tw.x0 + 0.28, tw.z1 - 0.28],
    [tw.x1 - 0.28, tw.z1 - 0.28],
  ];
  for (const [cx, cz] of cols) {
    slab(root, colliders, M.steelDark, cx - 0.28, 0, cz - 0.28, cx + 0.28, 10.2, cz + 0.28);
  }
  slab(root, colliders, M.steel, tw.x1 - 0.22, 0, -0.22, tw.x1 + 0.22, 10.15, 0.22);

  for (const y of tw.ys) {
    deck(root, colliders, platforms, M.steel, tw.boardX, tw.z0, tw.x1, tw.z1, y, tw.thick);
    slab(root, colliders, M.steelDark, tw.boardX, y, tw.z0, tw.x1, y + 0.9, tw.z0 + 0.14, { solid: false, noMerge: true });
    slab(root, colliders, M.steelDark, tw.boardX, y, tw.z1 - 0.14, tw.x1, y + 0.9, tw.z1, { solid: false, noMerge: true });
    slab(root, colliders, M.steelDark, tw.x1 - 0.14, y, tw.z0, tw.x1, y + 0.9, tw.z1, { solid: false, noMerge: true });
    decal(root, colliders, M.safety, tw.boardX, y + 1.12, tw.z0 - 0.02, tw.x1, y + 1.18, tw.z0 + 0.16);
    decal(root, colliders, M.orange, tw.boardX - 0.04, y + 0.02, tw.z0 + 0.16, tw.boardX + 0.08, y + 0.08, tw.z1 - 0.16);
  }
}

function buildPlantPit(root, colliders, M) {
  const h = L.plant;
  const t = 0.4;
  slab(root, colliders, M.creamShade, h.x0, h.y0, h.z0, h.x1, 0, h.z0 + t);
  slab(root, colliders, M.creamShade, h.x0, h.y0, h.z1 - t, h.x1, 0, h.z1);
  slab(root, colliders, M.creamShade, h.x1 - t, h.y0, h.z0, h.x1, 0, h.z1);
  slab(root, colliders, M.creamShade, h.x0, h.y0, h.z0, h.x0 + t, 0, -11.0);
  slab(root, colliders, M.creamShade, h.x0, h.y0, -5.6, h.x0 + t, 0, h.z1);
  slab(root, colliders, M.litter, h.x0, h.y0, h.z0, h.x1, h.y0 + 0.35, h.z1);
  const lip = h.lip;
  slab(root, colliders, M.steelDark, h.x0, 0, h.z0, h.x1, lip, h.z0 + 0.45);
  slab(root, colliders, M.steelDark, h.x0, 0, h.z1 - 0.45, h.x1, lip, h.z1);
  slab(root, colliders, M.steelDark, h.x1 - 0.45, 0, h.z0, h.x1, lip, h.z1);
  slab(root, colliders, M.steelDark, h.x0, 0, h.z0, h.x0 + 0.45, lip, -11.0);
  slab(root, colliders, M.steelDark, h.x0, 0, -5.6, h.x0 + 0.45, lip, h.z1);
  slab(root, colliders, M.steel, h.x0 + 0.45, h.y0 + 0.35, h.z0 + 0.45, h.x0 + 2.25, 1.5, h.z0 + 2.25, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.steelDark, h.x1 - 2.25, h.y0 + 0.35, h.z1 - 2.25, h.x1 - 0.45, 1.7, h.z1 - 0.45, {
    kind: 'obstacle',
  });
}