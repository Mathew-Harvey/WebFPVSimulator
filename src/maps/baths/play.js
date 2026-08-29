/*
 * play.js: the furniture a 5 inch actually flies.
 *
 * The empty basin was a photograph. This file is the line: start blocks,
 * a timing gantry, backstroke bars, a bulkhead slot, hanging hoops,
 * gallery bridges, a dive hoop, a sunken cage, lane poles, a lido with a
 * mushroom, a colonnade, and a drop tower. Leftover between solids is 0
 * or at least CLEAR. A gap you see is a gap you fly.
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

import { L, slab, deck, decal, pipe, hoopX, hoopZ, portalX } from './kit.js';

export function buildPlay(root, colliders, platforms, M) {
  startBlocks(root, colliders, M);
  mouthHoop(root, colliders, M);
  westGoal(root, colliders, M);
  timingGantry(root, colliders, M);
  island(root, colliders, platforms, M);
  flagBars(root, colliders, M);
  westHoop(root, colliders, M);
  bridges(root, colliders, platforms, M);
  underBridgeHoops(root, colliders, M);
  bulkhead(root, colliders, platforms, M);
  catchHoop(root, colliders, M);
  clock(root, colliders, M);
  eastHoop(root, colliders, M);
  loopMasses(root, colliders, M);
  lanePads(root, colliders, platforms, M);
  lanePoles(root, colliders, M);
  sunkenCage(root, colliders, M);
  diveHoop(root, colliders, M);
  chairs(root, colliders, platforms, M);
  mouthBar(root, colliders, M);
  wellBars(root, colliders, M);
  plantBar(root, colliders, M);
  teachBasin(root, colliders, platforms, M);
  mushroom(root, colliders, M);
  teachHoop(root, colliders, M);
  colonnade(root, colliders, M);
  dropTower(root, colliders, platforms, M);
  plazaToys(root, colliders, platforms, M);
}

function startBlocks(root, colliders, M) {
  const wall = L.pool.x0 - L.pool.wall;
  const zs = [-4.65, -1.55, 1.55, 4.65];
  for (const z of zs) {
    slab(root, colliders, M.white, wall - 0.8, 0, z - 0.36, wall, 0.72, z + 0.36, {
      kind: 'obstacle',
    });
    decal(root, colliders, M.lemon, wall - 0.08, 0.72, z - 0.36, wall, 0.80, z + 0.36);
  }
}

function westGoal(root, colliders, M) {
  portalX(root, colliders, M.chrome, -23.4, L.pool.shallowY, -2.15, 1.32, 2.15, 0.4);
  decal(root, colliders, M.coral, -23.02, L.pool.shallowY + 0.15, -2.15, -22.98, 1.32, -1.75);
  decal(root, colliders, M.coral, -23.02, L.pool.shallowY + 0.15, 1.75, -22.98, 1.32, 2.15);
}

function timingGantry(root, colliders, M) {
  const x = -20.6;
  const t = 0.4;
  const y1 = 3.55;
  portalX(root, colliders, M.chrome, x, L.pool.shallowY, L.pool.z0, y1, L.pool.z1, t);
  decal(root, colliders, M.lemon, x, y1, L.pool.z0 + t, x + t, y1 + 0.08, L.pool.z1 - t);
  decal(root, colliders, M.coral, x - 0.02, 2.9, L.pool.z0, x + t + 0.02, 3.15, L.pool.z0 + t);
  decal(root, colliders, M.coral, x - 0.02, 2.9, L.pool.z1 - t, x + t + 0.02, 3.15, L.pool.z1);
}

function island(root, colliders, platforms, M) {
  const x0 = -16.6;
  const x1 = -14.4;
  const z0 = -1.25;
  const z1 = 1.25;
  const top = -0.25;
  slab(root, colliders, M.tile, x0, L.pool.shallowY, z0, x1, top, z1, { kind: 'obstacle' });
  platforms.push({
    x0, z0, x1, z1, top, thick: top - L.pool.shallowY,
  });
  decal(root, colliders, M.lemon, x0, top, z0, x1, top + 0.05, z1);
}

function flagBars(root, colliders, M) {
  const r = 0.20;
  const z0 = L.pool.z0 + 0.2;
  const z1 = L.pool.z1 - 0.2;
  pipe(root, colliders, M.chrome, 'z', z0, z1, -14.6, 4.50, r);
  pipe(root, colliders, M.coral, 'z', z0, z1, 4.2, 4.50, r);
  pipe(root, colliders, M.lemon, 'z', z0, z1, 0.0, 9.40, r);
}

function mouthHoop(root, colliders, M) {
  const d = L.door.half;
  hoopZ(root, colliders, M.lemon, 12.35, -d, 0, d, L.door.h, 0.2);
  hoopZ(root, colliders, M.coral, 7.8, -1.6, 1.5, 1.6, 4.3, 0.2);
}

function catchHoop(root, colliders, M) {
  hoopX(root, colliders, M.lemon, 0.0, 5.70, -1.4, 7.72, 1.4, 0.2);
}

function underBridgeHoops(root, colliders, M) {
  hoopX(root, colliders, M.lemon, -7.4, 1.70, -1.4, 4.00, 1.4, 0.2);
}

function westHoop(root, colliders, M) {
  hoopX(root, colliders, M.coral, -11.2, 8.4, -1.4, 11.2, 1.4, 0.2);
}

function eastHoop(root, colliders, M) {
  hoopX(root, colliders, M.lemon, 12.6, 8.4, 2.4, 11.2, 5.2, 0.2);
}

function bridges(root, colliders, platforms, M) {
  const y = L.gallery.y;
  const z0 = L.hall.z0 + L.hall.t + L.gallery.w;
  const z1 = L.hall.z1 - L.hall.t - L.gallery.w;
  deck(root, colliders, platforms, M.creamSun, -8.2, z0, -6.6, z1, y, 0.28);
  deck(root, colliders, platforms, M.creamSun, 8.8, z0, 10.2, z1, y, 0.28);
  slab(root, colliders, M.cream, -8.2, y, z0, -6.6, y + 0.45, z0 + 0.16);
  slab(root, colliders, M.cream, -8.2, y, z1 - 0.16, -6.6, y + 0.45, z1);
  slab(root, colliders, M.cream, 8.8, y, z0, 10.2, y + 0.45, z0 + 0.16);
  slab(root, colliders, M.cream, 8.8, y, z1 - 0.16, 10.2, y + 0.45, z1);
  decal(root, colliders, M.coral, -8.2, y + 0.02, z0, -6.6, y + 0.08, z1);
  decal(root, colliders, M.lemon, 8.8, y + 0.02, z0, 10.2, y + 0.08, z1);
}

function bulkhead(root, colliders, platforms, M) {
  const x0 = -0.6;
  const x1 = 0.6;
  const y0 = L.pool.midY;
  const y1 = 2.6;
  const slot0 = -1.7;
  const slot1 = 1.7;
  const sill = -1.9;
  const lintel = 2.38;
  slab(root, colliders, M.cream, x0, y0, L.pool.z0, x1, y1, slot0);
  slab(root, colliders, M.cream, x0, y0, slot1, x1, y1, L.pool.z1);
  slab(root, colliders, M.cream, x0, y0, slot0, x1, sill, slot1);
  slab(root, colliders, M.cream, x0, lintel, slot0, x1, y1, slot1);
  platforms.push({
    x0, z0: L.pool.z0, x1, z1: L.pool.z1, top: y1, thick: y1 - lintel,
  });
  decal(root, colliders, M.coral, x0, y1, L.pool.z0, x1, y1 + 0.06, L.pool.z1);
  decal(root, colliders, M.lemon, x1 - 0.04, sill, slot0, x1 + 0.04, lintel, slot0 + 0.1);
  decal(root, colliders, M.lemon, x1 - 0.04, sill, slot1 - 0.1, x1 + 0.04, lintel, slot1);
  decal(root, colliders, M.creamFlat, x0 - 0.03, sill, slot0, x0, lintel, slot1);
  decal(root, colliders, M.creamFlat, x1, sill, slot0, x1 + 0.03, lintel, slot1);
}

function clock(root, colliders, M) {
  pipe(root, colliders, M.chrome, 'y', 13.55, 15.7, 0, 0, 0.1);
  slab(root, colliders, M.navy, -0.7, 12.35, -0.18, 0.7, 13.55, 0.18, { kind: 'obstacle' });
  decal(root, colliders, M.lemon, -0.55, 12.5, 0.18, 0.55, 13.4, 0.22);
}

function lanePads(root, colliders, platforms, M) {
  const y0 = L.pool.midY;
  const top = 0.90;
  for (const z of [-3.8, 3.8]) {
    slab(root, colliders, M.tileDeep, 5.4, y0, z - 0.6, 6.6, top, z + 0.6, { kind: 'obstacle' });
    platforms.push({
      x0: 5.4, z0: z - 0.6, x1: 6.6, z1: z + 0.6, top, thick: top - y0,
    });
    decal(root, colliders, M.white, 5.4, top, z - 0.6, 6.6, top + 0.05, z + 0.6);
    pipe(root, colliders, M.coral, 'y', top, 2.35, 6.0, z, 0.12);
  }
}

function loopMasses(root, colliders, M) {
  slab(root, colliders, M.chrome, -15.3, 1.50, -0.7, -13.9, 2.85, 0.7, { kind: 'obstacle' });
  slab(root, colliders, M.coral, 3.5, 1.50, -0.7, 4.9, 2.85, 0.7, { kind: 'obstacle' });
  slab(root, colliders, M.lemon, -0.6, 4.05, 3.0, 0.6, 5.40, 4.4, { kind: 'obstacle' });
  slab(root, colliders, M.navy, 15.1, -3.55, -0.75, 16.5, -2.2, 0.75, { kind: 'obstacle' });
  pipe(root, colliders, M.chrome, 'z', 3.0, 5.4, -5.0, 2.80, 0.20);
  portalX(root, colliders, M.lemon, L.hall.x0, 0, L.westDoor.z0, L.westDoor.y1, L.westDoor.z1, L.hall.t);
}

function lanePoles(root, colliders, M) {
  const x = 16.0;
  const r = 0.13;
  const y0 = L.pool.deepY;
  const y1 = 2.85;
  for (const z of [-4.1, 4.1]) {
    pipe(root, colliders, M.chrome, 'y', y0, y1, x, z, r);
    slab(root, colliders, M.coral, x - 0.18, y1, z - 0.18, x + 0.18, y1 + 0.16, z + 0.18, {
      kind: 'obstacle',
    });
  }
}

function sunkenCage(root, colliders, M) {
  const x0 = 18.0;
  const x1 = 20.6;
  const z0 = -2.15;
  const z1 = 2.15;
  const y0 = L.pool.deepY;
  const y1 = -2.2;
  const t = 0.22;
  slab(root, colliders, M.chrome, x0, y0, z0, x1, y1, z0 + t, { kind: 'obstacle' });
  slab(root, colliders, M.chrome, x0, y0, z1 - t, x1, y1, z1, { kind: 'obstacle' });
  slab(root, colliders, M.chrome, x1 - t, y0, z0 + t, x1, y1, z1 - t, { kind: 'obstacle' });
  decal(root, colliders, M.lemon, x0, y0 + 0.2, z0, x0 + 0.04, y1, z0 + t);
  decal(root, colliders, M.lemon, x0, y0 + 0.2, z1 - t, x0 + 0.04, y1, z1);
}

function diveHoop(root, colliders, M) {
  hoopX(root, colliders, M.coral, 21.2, 4.90, -1.39, 7.68, 1.39, 0.24);
}

function chairs(root, colliders, platforms, M) {
  const seats = [
    { x0: -14.8, x1: -13.2, z0: 8.55, z1: 9.65, back: 1 },
    { x0: -14.8, x1: -13.2, z0: -9.65, z1: -8.55, back: -1 },
    { x0: 2.2, x1: 3.8, z0: -9.65, z1: -8.55, back: -1 },
  ];
  for (const s of seats) {
    slab(root, colliders, M.navy, s.x0, 0, s.z0, s.x1, 1.88, s.z1, { kind: 'obstacle' });
    platforms.push({
      x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, top: 1.88, thick: 1.88,
    });
    const bz0 = s.back > 0 ? s.z1 - 0.2 : s.z0;
    const bz1 = s.back > 0 ? s.z1 : s.z0 + 0.2;
    slab(root, colliders, M.navy, s.x0, 1.88, bz0, s.x1, 3.12, bz1, { kind: 'obstacle' });
    decal(root, colliders, M.coral, s.x0, 3.12, bz0, s.x1, 3.2, bz1);
  }
}

function mouthBar(root, colliders, M) {
  const y = 6.08;
  const r = 0.14;
  const mouthZ = L.hall.z1 - L.hall.t - L.gallery.w * 0.5;
  const farZ = L.hall.z0 + L.hall.t + L.gallery.w * 0.5;
  pipe(root, colliders, M.chrome, 'x', -26.2, -18.22, y, mouthZ, r);
  pipe(root, colliders, M.chrome, 'x', -17.78, -10.22, y, mouthZ, r);
  pipe(root, colliders, M.chrome, 'x', -9.78, -2.22, y, mouthZ, r);
  pipe(root, colliders, M.chrome, 'x', -1.78, 5.78, y, mouthZ, r);
  pipe(root, colliders, M.chrome, 'x', 6.22, 13.78, y, mouthZ, r);
  pipe(root, colliders, M.chrome, 'x', 14.22, 26.2, y, mouthZ, r);
  pipe(root, colliders, M.chrome, 'x', -28.55, -10.22, y, farZ, r);
  pipe(root, colliders, M.chrome, 'x', -9.78, -2.22, y, farZ, r);
  pipe(root, colliders, M.chrome, 'x', -1.78, 5.78, y, farZ, r);
  pipe(root, colliders, M.chrome, 'x', 6.22, 13.78, y, farZ, r);
  pipe(root, colliders, M.chrome, 'x', 14.22, 30.55, y, farZ, r);
}

function wellBars(root, colliders, M) {
  pipe(root, colliders, M.chrome, 'z', -5.3, 5.3, -11.2, 13.5, 0.16);
  pipe(root, colliders, M.chrome, 'x', 6.2, 15.8, 13.5, 0, 0.16);
}

function plantBar(root, colliders, M) {
  pipe(root, colliders, M.steelDark, 'x', 25.8, 30.15, -1.2, -8.35, 0.14);
}

function teachBasin(root, colliders, platforms, M) {
  const tch = L.teach;
  const w = tch.wall;
  slab(root, colliders, M.tile, tch.x0 - w, tch.y, tch.z0 - w, tch.x1 + w, 0, tch.z0);
  slab(root, colliders, M.tile, tch.x0 - w, tch.y, tch.z1, tch.x1 + w, 0, tch.z1 + w);
  slab(root, colliders, M.tile, tch.x0 - w, tch.y, tch.z0, tch.x0, 0, tch.z1);
  slab(root, colliders, M.tile, tch.x1, tch.y, tch.z0, tch.x1 + w, 0, tch.z1);
  slab(root, colliders, M.tile, tch.x0, tch.y - 0.35, tch.z0, tch.x1, tch.y, tch.z1);
  for (const z of [-3.9, 3.9]) {
    slab(root, colliders, M.coral, -39.45, tch.y, z - 0.45, -38.55, 0.22, z + 0.45, {
      kind: 'obstacle',
    });
  }
  decal(root, colliders, M.white, tch.x0, -0.48, tch.z0, tch.x1, -0.08, tch.z0 + 0.1);
  decal(root, colliders, M.white, tch.x0, -0.48, tch.z1 - 0.1, tch.x1, -0.08, tch.z1);
  decal(root, colliders, M.white, tch.x0, -0.48, tch.z0, tch.x0 + 0.1, -0.08, tch.z1);
  decal(root, colliders, M.white, tch.x1 - 0.1, -0.48, tch.z0, tch.x1, -0.08, tch.z1);
  decal(root, colliders, M.white, tch.x0 - 0.4, 0.02, tch.z0 - 0.4, tch.x1 + 0.4, 0.06, tch.z0);
  decal(root, colliders, M.white, tch.x0 - 0.4, 0.02, tch.z1, tch.x1 + 0.4, 0.06, tch.z1 + 0.4);
  void platforms;
}

function mushroom(root, colliders, M) {
  const cx = -39;
  const cz = 0;
  const stem = 0.32;
  const cap = 1.4;
  const top = 2.52;
  slab(root, colliders, M.white, cx - stem, L.teach.y, cz - stem, cx + stem, top, cz + stem, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.tile, cx - cap, top, cz - cap, cx + cap, top + 0.32, cz + cap, {
    kind: 'obstacle',
  });
  decal(root, colliders, M.lemon, cx - cap, top + 0.32, cz - cap, cx + cap, top + 0.38, cz + cap);
}

function teachHoop(root, colliders, M) {
  hoopX(root, colliders, M.lemon, -36.0, 0.35, -1.4, 3.15, 1.4, 0.2);
}

function colonnade(root, colliders, M) {
  const x0 = -33.6;
  const x1 = -29.0;
  const px = -31.5;
  const y1 = 3.52;
  slab(root, colliders, M.creamSun, px - 0.22, 0, -8.22, px + 0.22, y1, -7.78);
  slab(root, colliders, M.creamSun, px - 0.22, 0, 3.78, px + 0.22, y1, 4.22);
  slab(root, colliders, M.cream, x0, y1, 3.78, x1, y1 + 0.32, 4.22);
  decal(root, colliders, M.coral, x0, y1 + 0.32, 3.78, x1, y1 + 0.38, 4.22);
}

function dropTower(root, colliders, platforms, M) {
  const x0 = -41.2;
  const x1 = -38.6;
  const z0 = -11.2;
  const z1 = -8.8;
  const t = 0.35;
  slab(root, colliders, M.creamShade, x0, 0, z0, x1, 5.05, z0 + t);
  slab(root, colliders, M.creamShade, x0, 0, z0 + t, x0 + t, 5.05, z1);
  slab(root, colliders, M.creamShade, x1 - t, 0, z0 + t, x1, 5.05, z1);
  for (const y of [1.65, 3.35, 5.15]) {
    deck(root, colliders, platforms, M.creamSun, x0 + t, z0 + t, x1 - t, z1, y, 0.22);
    decal(root, colliders, M.lemon, x0 + t, y, z0 + t, x1 - t, y + 0.05, z1);
  }
}

function plazaToys(root, colliders, platforms, M) {
  for (const x of [-22, 22]) {
    pipe(root, colliders, M.chrome, 'y', 0, 7.6, x, 17.6, 0.12);
    slab(root, colliders, M.coral, x - 0.55, 7.6, 17.6 - 0.12, x + 0.55, 7.82, 17.6 + 0.12, {
      kind: 'obstacle',
    });
    slab(root, colliders, M.lemon, x - 0.55, 7.82, 17.6 - 0.12, x + 0.55, 8.02, 17.6 + 0.12, {
      kind: 'obstacle',
    });
  }
  const cols = [
    { x: 12.2, z: 15.4 },
    { x: 17.8, z: 15.4 },
    { x: 12.2, z: 19.6 },
    { x: 17.8, z: 19.6 },
  ];
  for (const c of cols) {
    slab(root, colliders, M.creamSun, c.x - 0.2, 0, c.z - 0.2, c.x + 0.2, 3.15, c.z + 0.2);
  }
  slab(root, colliders, M.cream, 12.4, 3.15, 15.2, 17.6, 3.42, 15.6);
  slab(root, colliders, M.cream, 12.4, 3.15, 19.4, 17.6, 3.42, 19.8);
  slab(root, colliders, M.cream, 12.0, 3.15, 15.2, 12.4, 3.42, 19.8);
  slab(root, colliders, M.cream, 17.6, 3.15, 15.2, 18.0, 3.42, 19.8);
  slab(root, colliders, M.tile, 12.0, 3.42, 15.2, 18.0, 3.52, 19.8, { kind: 'obstacle' });
  platforms.push({
    x0: 12.0, z0: 15.2, x1: 18.0, z1: 19.8, top: 3.52, thick: 0.1,
  });

  slab(root, colliders, M.creamSun, -16.4, 0, 15.2, -13.4, 2.25, 17.5, { kind: 'obstacle' });
  slab(root, colliders, M.creamSun, 18.0, 0, 15.2, 21.0, 2.25, 17.5, { kind: 'obstacle' });
  decal(root, colliders, M.lemon, -16.4, 2.25, 15.2, -13.4, 2.38, 17.5);
  decal(root, colliders, M.coral, 18.0, 2.25, 15.2, 21.0, 2.38, 17.5);
  for (let z = 15.35; z < 17.3; z += 0.7) {
    decal(root, colliders, M.lemon, -13.4, 0.15, z, -13.32, 2.12, z + 0.55);
    decal(root, colliders, M.coral, 18.0, 0.15, z, 18.08, 2.12, z + 0.55);
  }

  const blocks = [-9.5, -7.0, 7.0, 9.5];
  for (const x of blocks) {
    slab(root, colliders, M.white, x - 0.36, 0, 18.15, x + 0.36, 0.95, 18.95, {
      kind: 'obstacle',
    });
    decal(root, colliders, M.lemon, x - 0.36, 0.95, 18.15, x + 0.36, 1.08, 18.95);
  }

  for (let x = -16; x <= 16; x += 4) {
    slab(root, colliders, M.creamSun, x - 0.12, 0, 23.88, x + 0.12, 1.35, 24.12);
    decal(root, colliders, M.lemon, x - 0.12, 1.35, 23.88, x + 0.12, 1.48, 24.12);
  }
  for (let x = -16; x < 16; x += 4) {
    pipe(root, colliders, M.chrome, 'x', x + 0.12, x + 4 - 0.12, 1.22, 24.0, 0.07);
  }
}
