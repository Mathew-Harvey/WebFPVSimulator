/*
 * ground.js: cream plaza, retaining cut, and the pool as a hole in the floor.
 *
 * Ground height is the plaza, then the stepped pool, the lido, then the plant pit.
 * Hills are painted flats.
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

import { L, slab, decal, fillAround } from './kit.js';
import { buildDistantHills } from './sky.js';

const CUT = 6;
const FLOOR_Y = 0;
const TREAD = 0.4;

export function poolFloor(x, z) {
  const p = L.pool;
  if (x <= p.x0 || x >= p.x1 || z <= p.z0 || z >= p.z1) {
    return null;
  }
  if (x < p.shallowX + TREAD) {
    return p.shallowY;
  }
  if (x < p.midX + TREAD) {
    return p.midY;
  }
  return p.deepY;
}

export function teachFloor(x, z) {
  const tch = L.teach;
  if (x <= tch.x0 || x >= tch.x1 || z <= tch.z0 || z >= tch.z1) {
    return null;
  }
  return tch.y;
}

export function groundHeight(x, z) {
  const pit = L.plant;
  const hop = L.hopper;
  const teach = teachFloor(x, z);
  if (teach !== null) {
    return teach;
  }
  if (x >= L.pool.x1 && x < pit.x0 && z > hop.z0 && z < hop.z1) {
    return pit.y0;
  }
  if (x >= pit.x0 && x <= pit.x0 + 0.4 && z > hop.z0 && z < hop.z1) {
    return pit.y0 + 0.35;
  }
  if (x > pit.x0 + 0.4 && x < pit.x1 - 0.4 && z > pit.z0 + 0.4 && z < pit.z1 - 0.4) {
    return pit.y0 + 0.35;
  }
  const floor = poolFloor(x, z);
  if (floor !== null) {
    return floor;
  }
  if (x > L.site.x0 && x < L.site.x1 && z > L.site.z0 && z < L.site.z1) {
    return FLOOR_Y;
  }
  return CUT;
}

export function buildGround(root, colliders, M) {
  const { x0, x1, z0, z1 } = L.site;
  const p = L.pool;
  const pit = {
    x0: L.plant.x0 + 0.4,
    x1: L.plant.x1 - 0.4,
    z0: L.plant.z0 + 0.4,
    z1: L.plant.z1 - 0.4,
  };
  const poolHole = { x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 };
  const hopperHole = {
    x0: p.x1,
    x1: pit.x0,
    z0: L.hopper.z0,
    z1: L.hopper.z1,
  };
  const teachHole = {
    x0: L.teach.x0,
    x1: L.teach.x1,
    z0: L.teach.z0,
    z1: L.teach.z1,
  };
  fillAround(root, colliders, M.plaza, x0, z0, x1, z1, -0.35, 0.02, [poolHole, pit, hopperHole, teachHole], {
    solid: false, cast: false, receive: true,
  });

  const t = 1.4;
  slab(root, colliders, M.cream, x0 - t, 0, z0 - t, x0, CUT, z1 + t);
  slab(root, colliders, M.cream, x1, 0, z0 - t, x1 + t, CUT, z1 + t);
  slab(root, colliders, M.cream, x0, 0, z0 - t, x1, CUT, z0);
  slab(root, colliders, M.hillShade, x0, 0, z1, x1, CUT, z1 + t);

  slab(root, colliders, M.dry, x0 - 16, CUT - 0.2, z0 - 14, x1 + 14, CUT + 0.05, z0 - t, {
    solid: false, cast: false, receive: true,
  });
  slab(root, colliders, M.dry, x0 - 16, CUT - 0.2, z1 + t, x1 + 14, CUT + 0.05, z1 + 16, {
    solid: false, cast: false, receive: true,
  });
  slab(root, colliders, M.dry, x0 - 16, CUT - 0.2, z0 - 14, x0 - t, CUT + 0.05, z1 + 16, {
    solid: false, cast: false, receive: true,
  });
  slab(root, colliders, M.dry, x1 + t, CUT - 0.2, z0 - 14, x1 + 14, CUT + 0.05, z1 + 16, {
    solid: false, cast: false, receive: true,
  });

  decal(root, colliders, M.white, -2.4, 0.03, 13.2, 2.4, 0.07, 21.6);
  decal(root, colliders, M.coral, -2.65, 0.04, 13.2, -2.35, 0.08, 21.6);
  decal(root, colliders, M.lemon, 2.35, 0.04, 13.2, 2.65, 0.08, 21.6);

  slab(root, colliders, M.cream, -10.4, 0, 20.6, -9.2, 1.05, 21.8, { kind: 'obstacle' });
  slab(root, colliders, M.cream, 9.2, 0, 20.6, 10.4, 1.05, 21.8, { kind: 'obstacle' });
  decal(root, colliders, M.dry, -10.4, 1.05, 20.6, -9.2, 1.12, 21.8);
  decal(root, colliders, M.dry, 9.2, 1.05, 20.6, 10.4, 1.12, 21.8);

  buildDistantHills(root, M);
}
