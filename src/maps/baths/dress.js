/*
 * dress.js: furniture, paint, logos. AAA from a title still.
 *
 * Hulls are boxes with 1.4 m leftover or none. Signs are canvases.
 * Hanging lights and banners are air. Letter holes are not colliders.
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
  lockers(root, colliders, M);
  reception(root, colliders, M);
  galleryBenches(root, colliders, M);
  roofPlant(root, colliders, M);
  lights(root, colliders, M);
}

function placeSigns(root, S) {
  const h = L.hall;
  const p = L.pool;
  sticker(root, S.fascia, 0, 8.0, h.z1 + 0.08, 14.0, 3.0, 0);
  sticker(root, S.crest, -9.4, 3.6, h.z1 + 0.06, 2.2, 2.2, 0);
  sticker(root, S.closed, 8.6, 3.15, h.z1 + 0.06, 3.6, 1.1, 0);
  sticker(root, S.noDive, p.x0 + 0.08, 1.55, 0, 3.6, 1.6, Math.PI * 0.5);
  sticker(root, S.d14, p.x0 + 0.08, 0.65, -4.2, 1.4, 0.6, Math.PI * 0.5);
  sticker(root, S.d22, p.shallowX + 0.48, 0.65, p.z1 - 0.08, 1.4, 0.6, Math.PI);
  sticker(root, S.d50, p.x1 - 0.08, 0.65, 4.2, 1.4, 0.6, -Math.PI * 0.5);
  sticker(root, S.mural, 0, 9.4, h.z0 + L.hall.t + 0.08, 12.0, 3.8, 0);
  sticker(root, S.ring, -16, 1.15, p.z1 - 0.08, 0.75, 0.75, Math.PI);
  sticker(root, S.ring, 16, 1.15, p.z1 - 0.08, 0.75, 0.75, Math.PI);
  sticker(root, S.ring, -16, 1.15, p.z0 + 0.08, 0.75, 0.75, 0);
  sticker(root, S.ring, 16, 1.15, p.z0 + 0.08, 0.75, 0.75, 0);
  sticker(root, S.n3, 23.48, 3.9, 0, 1.4, 1.6, -Math.PI * 0.5);
  sticker(root, S.n5, 23.48, 6.1, 0, 1.4, 1.6, -Math.PI * 0.5);
  sticker(root, S.n75, 23.48, 8.5, 0, 1.4, 1.6, -Math.PI * 0.5);
  sticker(root, S.n10, 23.48, 10.9, 0, 1.6, 1.8, -Math.PI * 0.5);
  sticker(root, S.n10, 18, 8.9, h.z0 + L.hall.t + 0.08, 2.2, 2.5, 0);
  sticker(root, S.banner, -12, 12.2, 0, 1.0, 6.5, 0);
  sticker(root, S.banner, 12, 12.2, 0, 1.0, 6.5, 0);
  sticker(root, S.banner, -4, 12.2, -8.2, 0.8, 5.2, 0);
  sticker(root, S.banner, 4, 12.2, 8.2, 0.8, 5.2, Math.PI);
  sticker(root, S.ring, -8.3, 2.8, h.z1 + 0.07, 1.1, 1.1, 0);
  sticker(root, S.ring, 8.3, 2.8, h.z1 + 0.07, 1.1, 1.1, 0);
  sticker(root, S.fascia, 0, 7.12, L.hall.z1 - L.hall.t - L.gallery.w, 12.0, 1.15, 0);
  sticker(root, S.plaza, 0, 0.06, 17.4, 8.0, 2.4, 0, -Math.PI * 0.5);
  const lane = (p.z1 - p.z0) / 6;
  for (let i = 0; i < 6; i += 1) {
    const z = p.z0 + lane * (i + 0.5);
    sticker(root, S.lanes[i], p.x0 - p.wall + 0.04, 0.36, z, 0.5, 0.5, Math.PI * 0.5);
  }
}

function lockers(root, colliders, M) {
  const Lck = L.lockers;
  slab(root, colliders, M.creamShade, Lck.x0, 0, Lck.z0, Lck.x1, 1.85, Lck.z1, {
    kind: 'obstacle',
  });
  for (let z = Lck.z0 + 0.12; z < Lck.z1 - 0.2; z += 0.85) {
    decal(root, colliders, M.steelDark, Lck.x0, 0.12, z, Lck.x0 + 0.06, 1.72, z + 0.72);
  }
  narthexLockers(root, colliders, M);
}

function narthexLockers(root, colliders, M) {
  const z0 = 12.10;
  const z1 = L.hall.z1 - L.hall.t;
  const y1 = 1.85;
  slab(root, colliders, M.navy, -11.5, 0, z0, -7.65, y1, z1, { kind: 'obstacle' });
  slab(root, colliders, M.navy, 7.65, 0, z0, 11.5, y1, z1, { kind: 'obstacle' });
  decal(root, colliders, M.lemon, -11.5, y1, z0, -7.65, y1 + 0.06, z1);
  decal(root, colliders, M.coral, 7.65, y1, z0, 11.5, y1 + 0.06, z1);
}

function reception(root, colliders, M) {
  const zBack = L.hall.z0 + L.hall.t;
  slab(root, colliders, M.creamSun, -22.4, 0, zBack, -18.2, 1.12, -11.2, { kind: 'obstacle' });
  decal(root, colliders, M.coral, -22.4, 1.12, zBack, -18.2, 1.20, -11.2);
}

function galleryBenches(root, colliders, M) {
  const y = L.gallery.y;
  const zBack = L.hall.z1 - L.hall.t;
  for (let x = -18; x <= 14; x += 8) {
    if (x < L.sw.x1 + 0.4 || x + 3.2 > L.ne.x0 - 0.4) {
      continue;
    }
    if (x < L.door.half && x + 3.2 > -L.door.half) {
      continue;
    }
    slab(root, colliders, M.creamShade, x, y, zBack - 0.5, x + 3.2, y + 0.48, zBack, {
      kind: 'obstacle',
    });
  }
}

function roofPlant(root, colliders, M) {
  const y = L.hall.h;
  slab(root, colliders, M.steelDark, -4.2, y, -12.5, -1.6, y + 2.6, -10.0, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, 1.6, y, -12.5, 4.2, y + 2.6, -10.0, { kind: 'obstacle' });
}

function lights(root, colliders, M) {
  for (let x = -18; x <= 18; x += 12) {
    decal(root, colliders, M.white, x - 1.6, 15.35, -0.12, x + 1.6, 15.5, 0.12);
  }
}
