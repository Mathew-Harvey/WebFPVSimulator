/*
 * dress.js: furniture, paint, logos. AAA from a title still.
 *
 * Hulls are boxes with 1.4 m leftover or none. Signs are canvases.
 * Hanging lights are air. Letter holes are not colliders.
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

import { L, slab, decal } from './kit.js';
import { makeSigns, sticker } from './signs.js';

export function buildDress(root, colliders, M) {
  const S = makeSigns();
  placeSigns(root, S);
  startBlocks(root, colliders, M, S);
  lockers(root, colliders, M);
  reception(root, colliders, M);
  galleryBenches(root, colliders, M);
  roofPlant(root, colliders, M);
  clutter(root, colliders, M);
  lights(root, colliders, M);
}

function placeSigns(root, S) {
  const h = L.hall;
  const t = h.t;
  const door = L.door.half;
  const p = L.pool;
  sticker(root, S.fascia, 0, 9.0, h.z1 + 0.08, 18.0, 4.2, 0);
  sticker(root, S.fascia, 0, 9.0, h.z1 - t - 0.08, 16.0, 3.6, Math.PI);
  sticker(root, S.crest, -door - 4.8, 3.8, h.z1 + 0.06, 2.8, 2.8, 0);
  sticker(root, S.closed, door + 5.2, 3.4, h.z1 + 0.06, 5.4, 1.6, 0);
  sticker(root, S.fpv, -door - 5.0, 3.6, h.z1 - t - 0.06, 4.4, 2.8, Math.PI);
  sticker(root, S.noDive, p.x0 + 0.08, 1.6, 0, 4.2, 2.0, Math.PI * 0.5);
  sticker(root, S.d14, p.x0 + 0.08, 0.7, -4.2, 1.6, 0.7, Math.PI * 0.5);
  sticker(root, S.d22, p.shallowX + 0.48, 0.7, p.z1 - 0.08, 1.6, 0.7, Math.PI);
  sticker(root, S.d50, p.x1 - 0.08, 0.7, 4.2, 1.6, 0.7, -Math.PI * 0.5);
  sticker(root, S.clock, 0, 12.4, h.z0 + t + 0.08, 2.2, 2.2, 0);
  sticker(root, S.board, 0, 11.2, h.z0 + t + 0.08, 6.4, 2.1, 0);
  sticker(root, S.gallery, -14, L.gallery.y + 1.7, h.z1 - t - L.gallery.w + 0.08, 3.6, 0.9, Math.PI);
  sticker(root, S.gallery, 14, L.gallery.y + 1.7, h.z1 - t - L.gallery.w + 0.08, 3.6, 0.9, Math.PI);
  sticker(root, S.changing, 28.0, 3.2, 4.0, 3.4, 0.85, Math.PI);
  sticker(root, S.plant, 28.0, 3.2, -4.0, 2.6, 0.85, Math.PI);
  sticker(root, S.roof, 0, h.h + 0.08, 0, 22, 5.5, 0, -Math.PI * 0.5);
  const lane = (p.z1 - p.z0) / 6;
  for (let i = 0; i < 6; i += 1) {
    const z = p.z0 + lane * (i + 0.5);
    sticker(root, S.lanes[i], p.x0 + 0.12, 0.45, z, 0.55, 0.55, Math.PI * 0.5);
  }
}

function startBlocks(root, colliders, M, S) {
  const p = L.pool;
  const lane = (p.z1 - p.z0) / 6;
  for (let i = 0; i < 6; i += 1) {
    const z = p.z0 + lane * (i + 0.5);
    slab(root, colliders, M.white, p.x0 - 1.15, 0, z - 0.32, p.x0 - 0.45, 0.72, z + 0.32, {
      kind: 'obstacle',
    });
    void S;
  }
}

function lockers(root, colliders, M) {
  const Lck = L.lockers;
  slab(root, colliders, M.navy, 30.05, 0, Lck.z0, 30.55, 1.85, Lck.z1, {
    kind: 'obstacle',
  });
  for (let z = Lck.z0 + 0.15; z < Lck.z1 - 0.2; z += 0.95) {
    decal(root, colliders, M.steelDark, 30.06, 0.12, z, 30.12, 1.72, z + 0.82);
  }
  slab(root, colliders, M.creamShade, Lck.x0 + 0.2, 0, Lck.z0 + 0.4, Lck.x0 + 0.7, 0.46, Lck.z1 - 0.4, {
    kind: 'obstacle',
  });
}

function reception(root, colliders, M) {
  slab(root, colliders, M.creamSun, -22.4, 0, -12.53, -18.2, 1.12, -11.2, { kind: 'obstacle' });
  slab(root, colliders, M.navy, -22.4, 1.12, -12.53, -18.2, 1.22, -11.2, { kind: 'obstacle' });
  slab(root, colliders, M.orange, -23.4, 0, 11.05, -21.8, 1.05, 12.53, { kind: 'obstacle' });
}

function galleryBenches(root, colliders, M) {
  const y = L.gallery.y;
  const zBack = L.hall.z1 - L.hall.t - 0.02;
  for (let x = -22; x <= 18; x += 8) {
    slab(root, colliders, M.creamShade, x, y, zBack - 0.5, x + 3.2, y + 0.48, zBack, {
      kind: 'obstacle',
    });
  }
}

function roofPlant(root, colliders, M) {
  const y = L.hall.h;
  slab(root, colliders, M.steel, -4.2, y, -12.5, -1.6, y + 2.6, -10.0, { kind: 'obstacle' });
  slab(root, colliders, M.steel, 1.6, y, -12.5, 4.2, y + 2.6, -10.0, { kind: 'obstacle' });
  const gap = 1.6 - -1.6;
  void gap;
}

function clutter(root, colliders, M) {
  slab(root, colliders, M.litter, 22.2, 0, 11.05, 24.0, 1.15, 12.53, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, -27.4, 0, 11.05, -25.8, 1.05, 12.53, { kind: 'obstacle' });
  slab(root, colliders, M.safety, -3.2, 0, 15.5, -2.4, 0.72, 16.3, { kind: 'obstacle' });
  slab(root, colliders, M.safety, 2.4, 0, 15.5, 3.2, 0.72, 16.3, { kind: 'obstacle' });
  slab(root, colliders, M.white, 12.4, 0, -12.53, 14.6, 0.85, -11.2, { kind: 'obstacle' });
}

function lights(root, colliders, M) {
  for (let x = -18; x <= 18; x += 12) {
    decal(root, colliders, M.white, x - 1.6, 15.35, -0.12, x + 1.6, 15.5, 0.12);
  }
}
