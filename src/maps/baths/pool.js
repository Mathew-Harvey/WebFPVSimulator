/*
 * pool.js: 50 m basin, depth steps, diving tower, plant hopper.
 *
 * The pool is the kiln tube of this map: a flyable well you can see from
 * the mouth. Depth is three slabs. The tower is a three-sided shaft with
 * landable boards, not a ramp. The plant pit opens into the deep end on
 * a punched shared face, hopper grammar, leftover 0.
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
  buildWaterline(root, colliders, M);
  buildTower(root, colliders, platforms, M);
  buildPlantPit(root, colliders, M);
}

function buildBasin(root, colliders, M) {
  const p = L.pool;
  const w = p.wall;
  const hop = L.hopper;
  slab(root, colliders, M.tile, p.x0 - w, p.deepY, p.z0 - w, p.x1 + w, 0, p.z0);
  slab(root, colliders, M.tile, p.x0 - w, p.deepY, p.z1, p.x1 + w, 0, p.z1 + w);
  slab(root, colliders, M.tile, p.x0 - w, p.deepY, p.z0, p.x0, 0, p.z1);
  slab(root, colliders, M.tile, p.x1, p.deepY, hop.z1, p.x1 + w, 0, p.z1);
  slab(root, colliders, M.tile, p.x1, p.deepY, hop.z0, p.x1 + w, L.plant.y0, hop.z1);

  slab(root, colliders, M.tile, p.x0, p.shallowY - 0.4, p.z0, p.shallowX, p.shallowY, p.z1);
  slab(root, colliders, M.tile, p.shallowX, p.midY - 0.4, p.z0, p.midX, p.midY, p.z1);
  slab(root, colliders, M.tileDeep, p.midX, p.deepY - 0.4, p.z0, p.x1, p.deepY, p.z1);
  basinLining(root, colliders, M, p);

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

function basinLining(root, colliders, M, p) {
  const d = 0.04;
  const hop = L.hopper;
  decal(root, colliders, M.tileFlat, p.x0, p.deepY + 0.05, p.z0, p.x0 + d, -0.08, p.z1);
  decal(root, colliders, M.tileFlat, p.x1 - d, p.deepY + 0.05, p.z0, p.x1, -0.08, hop.z0);
  decal(root, colliders, M.tileFlat, p.x1 - d, p.deepY + 0.05, hop.z1, p.x1, -0.08, p.z1);
  decal(root, colliders, M.tileFlat, p.x0, p.deepY + 0.05, p.z0, p.x1, -0.08, p.z0 + d);
  decal(root, colliders, M.tileFlat, p.x0, p.deepY + 0.05, p.z1 - d, p.x1, -0.08, p.z1);
}

function buildSteps(root, colliders, M) {
  const p = L.pool;
  const t = 0.4;
  slab(root, colliders, M.tile, p.shallowX, p.midY, p.z0, p.shallowX + t, p.shallowY, p.z1);
  slab(root, colliders, M.tileDeep, p.midX, p.deepY, p.z0, p.midX + t, p.midY, p.z1);
  decal(root, colliders, M.lemon, p.shallowX, p.shallowY - 0.02, p.z0, p.shallowX + t, p.shallowY + 0.04, p.z1);
  decal(root, colliders, M.coral, p.midX, p.midY - 0.02, p.z0, p.midX + t, p.midY + 0.04, p.z1);
}

function buildCoping(root, colliders, M) {
  const p = L.pool;
  const c = 0.42;
  decal(root, colliders, M.white, p.x0 - c, 0.02, p.z0 - c, p.x1 + c, 0.06, p.z0);
  decal(root, colliders, M.white, p.x0 - c, 0.02, p.z1, p.x1 + c, 0.06, p.z1 + c);
  decal(root, colliders, M.white, p.x0 - c, 0.02, p.z0, p.x0, 0.06, p.z1);
  decal(root, colliders, M.white, p.x1, 0.02, p.z0, p.x1 + c, 0.06, p.z1);
}

function buildWaterline(root, colliders, M) {
  const p = L.pool;
  const y0 = -0.48;
  const y1 = -0.08;
  const d = 0.10;
  decal(root, colliders, M.white, p.x0, y0, p.z0, p.x0 + d, y1, p.z1);
  decal(root, colliders, M.white, p.x1 - d, y0, p.z0, p.x1, y1, p.z1);
  decal(root, colliders, M.white, p.x0, y0, p.z0, p.x1, y1, p.z0 + d);
  decal(root, colliders, M.white, p.x0, y0, p.z1 - d, p.x1, y1, p.z1);
}

function buildTower(root, colliders, platforms, M) {
  const tw = L.tower;
  const wall = 0.4;
  slab(root, colliders, M.steelDark, tw.x1 - wall, 0, tw.z0, tw.x1, 10.2, tw.z1);
  slab(root, colliders, M.steelDark, tw.x0, 0, tw.z0, tw.x1 - wall, 10.2, tw.z0 + wall);
  slab(root, colliders, M.steelDark, tw.x0, 0, tw.z1 - wall, tw.x1 - wall, 10.2, tw.z1);
  decal(root, colliders, M.creamFlat, tw.x1 - wall, 0.05, tw.z0 + wall + 0.04, tw.x1 - wall + 0.05, 10.1, tw.z1 - wall - 0.04);
  decal(root, colliders, M.creamFlat, tw.x0 + 0.04, 0.05, tw.z0 + wall, tw.x1 - wall - 0.04, 10.1, tw.z0 + wall + 0.05);
  decal(root, colliders, M.creamFlat, tw.x0 + 0.04, 0.05, tw.z1 - wall - 0.05, tw.x1 - wall - 0.04, 10.1, tw.z1 - wall);

  for (const y of tw.ys) {
    deck(root, colliders, platforms, M.steelDark, tw.boardX, tw.z0 + wall, tw.x1 - wall, tw.z1 - wall, y, tw.thick);
    decal(root, colliders, M.lemon, tw.boardX - 0.04, y + 0.02, tw.z0 + wall + 0.08, tw.boardX + 0.08, y + 0.08, tw.z1 - wall - 0.08);
  }
}

function buildPlantPit(root, colliders, M) {
  const h = L.plant;
  const t = 0.4;
  const hop = L.hopper;
  slab(root, colliders, M.creamShade, h.x0, h.y0, h.z0, h.x0 + t, 0, hop.z0);
  slab(root, colliders, M.creamShade, h.x1 - t, h.y0, h.z0, h.x1, 0, h.z1);
  slab(root, colliders, M.creamShade, h.x0 + t, h.y0, h.z0, h.x1 - t, 0, h.z0 + t);
  slab(root, colliders, M.creamShade, h.x0 + t, h.y0, h.z1 - t, h.x1 - t, 0, h.z1);
  slab(root, colliders, M.litter, h.x0 + t, h.y0, h.z0 + t, h.x1 - t, h.y0 + 0.35, h.z1 - t);
  slab(root, colliders, M.litter, h.x0, h.y0, hop.z0, h.x0 + t, h.y0 + 0.35, hop.z1);
  const lip = h.lip;
  slab(root, colliders, M.steelDark, h.x0, 0, h.z0, h.x0 + t, lip, hop.z0);
  slab(root, colliders, M.steelDark, h.x1 - t, 0, h.z0, h.x1, lip, h.z1);
  slab(root, colliders, M.steelDark, h.x0 + t, 0, h.z0, h.x1 - t, lip, h.z0 + t);
  slab(root, colliders, M.steelDark, h.x0 + t, 0, h.z1 - t, h.x1 - t, lip, h.z1);
  slab(root, colliders, M.steelDark, h.x0 + t, h.y0 + 0.35, h.z0 + t, h.x0 + 2.2, lip, h.z0 + 2.2, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.steelDark, h.x1 - 1.15, h.y0 + 0.35, h.z0 + t, h.x1 - t, lip, h.z0 + 2.2, {
    kind: 'obstacle',
  });
  hopperMouth(root, colliders, M, h, hop);
}

function hopperMouth(root, colliders, M, h, hop) {
  const p = L.pool;
  const t = 0.4;
  const lip = h.lip;
  const y0 = h.y0;
  const y1 = 0;
  const jamb = 0.22;
  decal(root, colliders, M.lemon, p.x1 - 0.05, y0, hop.z0, p.x1 + 0.02, y1, hop.z0 + jamb);
  decal(root, colliders, M.lemon, p.x1 - 0.05, y0, hop.z1 - jamb, p.x1 + 0.02, y1, hop.z1);
  decal(root, colliders, M.lemon, p.x1 - 0.05, y1 - jamb, hop.z0, p.x1 + 0.02, y1, hop.z1);
  decal(root, colliders, M.lemon, p.x1 - 0.05, y0, hop.z0, p.x1 + 0.02, y0 + jamb, hop.z1);
  decal(root, colliders, M.navy, h.x1 - t - 0.05, h.y0 + 0.38, h.z0 + t, h.x1 - t, -0.42, h.z1 - t);
  decal(root, colliders, M.lemon, h.x1 - t - 0.06, -0.42, h.z0 + t, h.x1 - t, -0.18, h.z1 - t);
  decal(root, colliders, M.creamFlat, h.x1 - t - 0.05, -0.18, h.z0 + t, h.x1 - t, -0.04, h.z1 - t);
  decal(root, colliders, M.navy, h.x0 + t, h.y0 + 0.38, h.z1 - t - 0.05, h.x1 - t, -0.42, h.z1 - t);
  decal(root, colliders, M.lemon, h.x0 + t, -0.42, h.z1 - t - 0.06, h.x1 - t, -0.18, h.z1 - t);
  decal(root, colliders, M.creamFlat, h.x0 + t, -0.18, h.z1 - t - 0.05, h.x1 - t, -0.04, h.z1 - t);
  decal(root, colliders, M.navy, h.x0 + t, h.y0 + 0.38, h.z0 + t, h.x1 - t, -0.42, h.z0 + t + 0.05);
  decal(root, colliders, M.lemon, h.x0 + t, h.y0 + 0.35, hop.z0, h.x0 + t + 0.06, lip, hop.z0 + 0.08);
  decal(root, colliders, M.lemon, h.x0 + t, h.y0 + 0.35, hop.z1 - 0.08, h.x0 + t + 0.06, lip, hop.z1);
  decal(root, colliders, M.lemon, h.x0 + t, 0, hop.z0, h.x0 + t + 0.06, lip, hop.z0 + 0.08);
  decal(root, colliders, M.lemon, h.x0 + t, 0, hop.z1 - 0.08, h.x0 + t + 0.06, lip, hop.z1);
  decal(root, colliders, M.lemon, h.x0 + t, h.y0 + 0.35, h.z0 + t, h.x1 - t, h.y0 + 0.40, h.z1 - t);
  decal(root, colliders, M.navy, h.x0 + t + 1.6, h.y0 + 0.40, hop.z0 + 0.15, h.x1 - t - 1.6, h.y0 + 0.46, hop.z1 - 0.15);
}
