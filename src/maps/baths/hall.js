/*
 * hall.js: cream hall, mouth at z1, galleries, clerestory, corner towers.
 *
 * One barn, not a second map. The mouth wall is missing a door; that is
 * the spawn opening. Long walls own the corners. End walls stop at
 * x0+t / x1-t so a shared volume cannot flip a contact normal. Missing
 * roof bays light the empty pool as graphic wells. Stairs in the towers
 * are sealed plugs that share faces with the hall, not volumes.
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

import { L, slab, deck, decal, fillAround, hit } from './kit.js';

export function buildHall(root, colliders, platforms, M) {
  const { x0, x1, z0, z1, h, t } = L.hall;
  const door = L.door.half;
  const doorH = L.door.h;

  slab(root, colliders, M.cream, x0, 0, z0, x0 + t, h, L.westDoor.z0);
  slab(root, colliders, M.cream, x0, 0, L.westDoor.z1, x0 + t, h, z1);
  slab(root, colliders, M.cream, x0, L.westDoor.y1, L.westDoor.z0, x0 + t, h, L.westDoor.z1);
  slab(root, colliders, M.cream, x1 - t, 0, z0, x1, h, z1);
  slab(root, colliders, M.cream, x0 + t, 0, z0, x1 - t, h, z0 + t);
  slab(root, colliders, M.cream, x0 + t, 0, z1 - t, -door, h, z1);
  slab(root, colliders, M.cream, door, 0, z1 - t, x1 - t, h, z1);
  slab(root, colliders, M.cream, -door, doorH, z1 - t, door, h, z1);

  slab(root, colliders, M.steelDark, -door, doorH, z1 - t - 0.1, door, doorH + 0.38, z1 + 0.12, {
    solid: false,
  });
  slab(root, colliders, M.steelDark, -door - 0.4, 0, z1 - t - 0.1, -door, doorH, z1 + 0.12, {
    solid: false,
  });
  slab(root, colliders, M.steelDark, door, 0, z1 - t - 0.1, door + 0.4, doorH, z1 + 0.12, {
    solid: false,
  });

  roofWithHoles(root, colliders, platforms, M, x0 + t, x1 - t, z0 + t, z1 - t, h, [
    ...L.wells,
    {
      x0: x0 + t,
      x1: L.sw.x1,
      z0: Math.max(L.sw.z0, z0 + t),
      z1: z1 - t,
    },
    {
      x0: L.ne.x0,
      x1: x1 - t,
      z0: Math.max(L.ne.z0, z0 + t),
      z1: z1 - t,
    },
  ]);

  lineHall(root, colliders, M, x0, x1, z0, z1, h, t, door, doorH);
  wainscot(root, colliders, M, x0, x1, z0, z1, t, door);
  windowBand(root, colliders, M, x0 + 2.2, z0 - 0.06, x1 - 2.2, 10.2, 13.4);
  windowBand(root, colliders, M, x0 + 2.2, z1 + 0.06, -door - 0.6, 10.2, 13.4);
  windowBand(root, colliders, M, door + 0.6, z1 + 0.06, x1 - 2.2, 10.2, 13.4);
  westWindows(root, colliders, M, x0, z0, z1);

  buildGalleries(root, colliders, platforms, M);
  buildCornerTowers(root, colliders, M);
  buildPosts(root, colliders, M);
  lightWells(root, colliders, M, L.wells, h);
  civicBand(root, colliders, M, x0, x1, z0, z1, t, door);
}

function roofWithHoles(root, colliders, platforms, M, x0, x1, z0, z1, top, holes) {
  fillAround(root, colliders, M.cream, x0, z0, x1, z1, top - 0.3, top, holes, {
    solid: false, receive: true,
  });
  const xs = [x0];
  const zs = [z0];
  for (const hole of holes) {
    xs.push(hole.x0, hole.x1);
    zs.push(hole.z0, hole.z1);
  }
  xs.push(x1);
  zs.push(z1);
  xs.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < zs.length - 1; j += 1) {
      const xa = xs[i];
      const xb = xs[i + 1];
      const za = zs[j];
      const zb = zs[j + 1];
      if (xb - xa < 0.05 || zb - za < 0.05) {
        continue;
      }
      const mx = (xa + xb) * 0.5;
      const mz = (za + zb) * 0.5;
      if (holes.some((hole) => mx > hole.x0 && mx < hole.x1 && mz > hole.z0 && mz < hole.z1)) {
        continue;
      }
      platforms.push({
        x0: xa, z0: za, x1: xb, z1: zb, top, thick: 0.3,
      });
      colliders.addBox('wall', xa, top - 0.3, za, xb, top - 0.02, zb);
    }
  }
  for (const hole of holes) {
    if (hole.x1 - hole.x0 > 8) {
      const lip = 0.5;
      decal(root, colliders, M.tile, hole.x0, top, hole.z0, hole.x1, top + lip, hole.z0 + 0.22);
      decal(root, colliders, M.tile, hole.x0, top, hole.z1 - 0.22, hole.x1, top + lip, hole.z1);
      decal(root, colliders, M.tile, hole.x0, top, hole.z0, hole.x0 + 0.22, top + lip, hole.z1);
      decal(root, colliders, M.tile, hole.x1 - 0.22, top, hole.z0, hole.x1, top + lip, hole.z1);
    }
  }
}

function lineHall(root, colliders, M, x0, x1, z0, z1, h, t, door, doorH) {
  const d = 0.12;
  const skin = { solid: false, cast: false, noShadow: true };
  const wd = L.westDoor;
  slab(root, colliders, M.creamSun, x0 + t, 0.02, z0 + t, x0 + t + d, h - 0.2, wd.z0, skin);
  slab(root, colliders, M.creamSun, x0 + t, 0.02, wd.z1, x0 + t + d, h - 0.2, z1 - t, skin);
  slab(root, colliders, M.creamSun, x0 + t, wd.y1, wd.z0, x0 + t + d, h - 0.2, wd.z1, skin);
  slab(root, colliders, M.creamSun, x1 - t - d, 0.02, z0 + t, x1 - t, h - 0.2, z1 - t, skin);
  decal(root, colliders, M.creamSun, x0 + t, 0.02, z0 + t, x1 - t, h - 0.2, z0 + t + d);
  decal(root, colliders, M.creamSun, x0 + t, 0.02, z1 - t - d, -door, doorH - 0.1, z1 - t);
  decal(root, colliders, M.creamSun, door, 0.02, z1 - t - d, x1 - t, doorH - 0.1, z1 - t);
  decal(root, colliders, M.cream, x0 - 0.08, 0, z1 - 0.02, -door, 2.6, z1 + 0.1);
  decal(root, colliders, M.cream, door, 0, z1 - 0.02, x1 + 0.08, 2.6, z1 + 0.1);
}

function windowBand(root, colliders, M, x0, z, x1, y0, y1) {
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  if (xb - xa < 1) {
    return;
  }
  const z0 = z < 0 ? z - 0.05 : z;
  const z1 = z < 0 ? z : z + 0.05;
  decal(root, colliders, M.pane, xa, y0, z0, xb, y1, z1);
  decal(root, colliders, M.steelDark, xa, y0 - 0.22, z0 - 0.06, xb, y0, z1 + 0.06);
  for (let x = xa + 4; x < xb - 0.5; x += 4) {
    decal(root, colliders, M.steelDark, x - 0.1, y0 - 0.08, z0 - 0.02, x + 0.1, y1 + 0.08, z1 + 0.02);
  }
}

function westWindows(root, colliders, M, x0, z0, z1) {
  const x = x0 - 0.06;
  const y0 = 10.2;
  const y1 = 13.4;
  const wd = L.westDoor;
  decal(root, colliders, M.pane, x - 0.05, y0, z0 + 1.6, x, y1, wd.z0 - 0.4);
  decal(root, colliders, M.pane, x - 0.05, y0, wd.z1 + 0.4, x, y1, z1 - 1.6);
  decal(root, colliders, M.steelDark, x - 0.08, y0 - 0.22, z0 + 1.6, x + 0.02, y0, wd.z0 - 0.4);
  decal(root, colliders, M.steelDark, x - 0.08, y0 - 0.22, wd.z1 + 0.4, x + 0.02, y0, z1 - 1.6);
}

function lightWells(root, colliders, M, holes, top) {
  const th = 0.22;
  for (const hole of holes) {
    slab(root, colliders, M.creamShade, hole.x0, 15.1, hole.z0, hole.x1, top, hole.z0 + th);
    slab(root, colliders, M.creamShade, hole.x0, 15.1, hole.z1 - th, hole.x1, top, hole.z1);
    slab(root, colliders, M.creamShade, hole.x0, 15.1, hole.z0 + th, hole.x0 + th, top, hole.z1 - th);
    slab(root, colliders, M.creamShade, hole.x1 - th, 15.1, hole.z0 + th, hole.x1, top, hole.z1 - th);
    decal(root, colliders, M.lemon, hole.x0, top, hole.z0, hole.x1, top + 0.85, hole.z0 + 0.4);
    decal(root, colliders, M.lemon, hole.x0, top, hole.z1 - 0.4, hole.x1, top + 0.85, hole.z1);
    decal(root, colliders, M.lemon, hole.x0, top, hole.z0, hole.x0 + 0.4, top + 0.85, hole.z1);
    decal(root, colliders, M.lemon, hole.x1 - 0.4, top, hole.z0, hole.x1, top + 0.85, hole.z1);
  }
}

function civicBand(root, colliders, M, x0, x1, z0, z1, t, door) {
  const y0 = 2.15;
  const y1 = 2.55;
  const o = 0.06;
  const wd = L.westDoor;
  decal(root, colliders, M.coral, x0 - o, y0, z0 - o, x0 + 0.08, y1, wd.z0);
  decal(root, colliders, M.coral, x0 - o, y0, wd.z1, x0 + 0.08, y1, z1 + o);
  decal(root, colliders, M.coral, x1 - 0.08, y0, z0 - o, x1 + o, y1, z1 + o);
  decal(root, colliders, M.coral, x0, y0, z0 - o, x1, y1, z0 + 0.08);
  decal(root, colliders, M.coral, x0, y0, z1 - 0.08, -door, y1, z1 + o);
  decal(root, colliders, M.coral, door, y0, z1 - 0.08, x1, y1, z1 + o);
  decal(root, colliders, M.lemon, x0 - o, y1, z0 - o, x0 + 0.08, y1 + 0.32, wd.z0);
  decal(root, colliders, M.lemon, x0 - o, y1, wd.z1, x0 + 0.08, y1 + 0.32, z1 + o);
  decal(root, colliders, M.lemon, x1 - 0.08, y1, z0 - o, x1 + o, y1 + 0.32, z1 + o);
  decal(root, colliders, M.lemon, x0, y1, z0 - o, x1, y1 + 0.32, z0 + 0.08);
  decal(root, colliders, M.lemon, x0, y1, z1 - 0.08, -door, y1 + 0.32, z1 + o);
  decal(root, colliders, M.lemon, door, y1, z1 - 0.08, x1, y1 + 0.32, z1 + o);
  void t;
}

function wainscot(root, colliders, M, x0, x1, z0, z1, t, door) {
  const y1 = 1.22;
  const cap = 1.52;
  const d = 0.10;
  const wd = L.westDoor;
  const dado = M.navy;
  const sill = M.lemon;
  decal(root, colliders, dado, x0 + t, 0.02, z0 + t, x0 + t + d, y1, wd.z0);
  decal(root, colliders, dado, x0 + t, 0.02, wd.z1, x0 + t + d, y1, z1 - t);
  decal(root, colliders, dado, x1 - t - d, 0.02, z0 + t, x1 - t, y1, z1 - t);
  decal(root, colliders, dado, x0 + t, 0.02, z0 + t, x1 - t, y1, z0 + t + d);
  decal(root, colliders, dado, x0 + t, 0.02, z1 - t - d, -door, y1, z1 - t);
  decal(root, colliders, dado, door, 0.02, z1 - t - d, x1 - t, y1, z1 - t);
  decal(root, colliders, sill, x0 + t, y1, z0 + t, x0 + t + d, cap, wd.z0);
  decal(root, colliders, sill, x0 + t, y1, wd.z1, x0 + t + d, cap, z1 - t);
  decal(root, colliders, sill, x1 - t - d, y1, z0 + t, x1 - t, cap, z1 - t);
  decal(root, colliders, sill, x0 + t, y1, z0 + t, x1 - t, cap, z0 + t + d);
  decal(root, colliders, sill, x0 + t, y1, z1 - t - d, -door, cap, z1 - t);
  decal(root, colliders, sill, door, y1, z1 - t - d, x1 - t, cap, z1 - t);
  decal(root, colliders, dado, x0 - 0.06, 0.02, z0 - 0.06, x0 + 0.02, y1, wd.z0);
  decal(root, colliders, dado, x0 - 0.06, 0.02, wd.z1, x0 + 0.02, y1, z1 + 0.06);
  decal(root, colliders, sill, x0 - 0.06, y1, z0 - 0.06, x0 + 0.02, cap, wd.z0);
  decal(root, colliders, sill, x0 - 0.06, y1, wd.z1, x0 + 0.02, cap, z1 + 0.06);
  const rail0 = 0.72;
  const rail1 = 0.92;
  decal(root, colliders, sill, x0 + t, rail0, z0 + t, x0 + t + d, rail1, wd.z0);
  decal(root, colliders, sill, x0 + t, rail0, wd.z1, x0 + t + d, rail1, z1 - t);
  decal(root, colliders, sill, x1 - t - d, rail0, z0 + t, x1 - t, rail1, z1 - t);
  decal(root, colliders, sill, x0 + t, rail0, z0 + t, x1 - t, rail1, z0 + t + d);
  decal(root, colliders, sill, x0 + t, rail0, z1 - t - d, -door, rail1, z1 - t);
  decal(root, colliders, sill, door, rail0, z1 - t - d, x1 - t, rail1, z1 - t);
  const noon = M.creamFlat;
  const n1 = 5.15;
  decal(root, colliders, noon, x0 + t, cap, z0 + t, x0 + t + d, n1, wd.z0);
  decal(root, colliders, noon, x0 + t, cap, wd.z1, x0 + t + d, n1, z1 - t);
  decal(root, colliders, noon, x1 - t - d, cap, z0 + t, x1 - t, n1, z1 - t);
  decal(root, colliders, noon, x0 + t, cap, z0 + t, x1 - t, n1, z0 + t + d);
  decal(root, colliders, noon, x0 + t, cap, z1 - t - d, -door, n1, z1 - t);
  decal(root, colliders, noon, door, cap, z1 - t - d, x1 - t, n1, z1 - t);
  decal(root, colliders, noon, x0 - 0.06, cap, z0 - 0.06, x0 + 0.02, n1, wd.z0);
  decal(root, colliders, noon, x0 - 0.06, cap, wd.z1, x0 + 0.02, n1, z1 + 0.06);
}

function buildGalleries(root, colliders, platforms, M) {
  const g = L.gallery;
  const h = L.hall;
  const t = h.t;
  const y = g.y;
  const mouthZ0 = h.z1 - t - g.w;
  const mouthZ1 = h.z1 - t;
  const west = L.sw.x1;
  const east = L.ne.x0;
  deck(root, colliders, platforms, M.creamSun, west, mouthZ0, east, mouthZ1, y, g.thick);
  parapet(root, colliders, M, west, mouthZ0, east, mouthZ0 + 0.18, y);

  const farZ0 = h.z0 + t;
  const farZ1 = h.z0 + t + g.w;
  deck(root, colliders, platforms, M.creamSun, h.x0 + t, farZ0, h.x1 - t, farZ1, y, g.thick);
  parapet(root, colliders, M, h.x0 + t, farZ1 - 0.18, h.x1 - t, farZ1, y);
}

function parapet(root, colliders, M, x0, z0, x1, z1, y) {
  const h = L.gallery.parapet;
  slab(root, colliders, M.cream, x0, y, z0, x1, y + h, z1);
  decal(root, colliders, M.coral, x0, y + h - 0.12, z0 - 0.02, x1, y + h + 0.04, z1 + 0.02);
}

function buildCornerTowers(root, colliders, M) {
  raiseTower(root, colliders, M, L.sw);
  raiseTower(root, colliders, M, L.ne);
}

function raiseTower(root, colliders, M, tw) {
  slab(root, colliders, M.cream, tw.x0, 0, tw.z0, tw.x1, tw.h, tw.z1, { solid: false });
  const bands = [
    { y0: 8.2, y1: 9.1, mat: M.lemon },
    { y0: 9.1, y1: 10.0, mat: M.white },
    { y0: 10.0, y1: 10.9, mat: M.coral },
  ];
  const o = 0.06;
  for (const b of bands) {
    slab(root, colliders, b.mat, tw.x0 - o, b.y0, tw.z0 - o, tw.x1 + o, b.y1, tw.z0 + 0.08, {
      solid: false, cast: false,
    });
    slab(root, colliders, b.mat, tw.x0 - o, b.y0, tw.z1 - 0.08, tw.x1 + o, b.y1, tw.z1 + o, {
      solid: false, cast: false,
    });
    slab(root, colliders, b.mat, tw.x0 - o, b.y0, tw.z0, tw.x0 + 0.08, b.y1, tw.z1, {
      solid: false, cast: false,
    });
    slab(root, colliders, b.mat, tw.x1 - 0.08, b.y0, tw.z0, tw.x1 + o, b.y1, tw.z1, {
      solid: false, cast: false,
    });
  }

  const hall = L.hall;
  const t = hall.t;
  const ix0 = Math.max(tw.x0, hall.x0 + t);
  const ix1 = Math.min(tw.x1, hall.x1 - t);
  const iz0 = Math.max(tw.z0, hall.z0 + t);
  const iz1 = Math.min(tw.z1, hall.z1 - t);
  if (ix1 > ix0 + 0.05 && iz1 > iz0 + 0.05) {
    hit(colliders, ix0, 0, iz0, ix1, tw.h, iz1);
  }
  if (tw.x0 < hall.x0) {
    hit(colliders, tw.x0, 0, tw.z0, hall.x0, tw.h, tw.z1);
  }
  if (tw.x1 > hall.x1) {
    hit(colliders, hall.x1, 0, tw.z0, tw.x1, tw.h, tw.z1);
  }
  if (tw.z0 < hall.z0) {
    hit(colliders, Math.max(tw.x0, hall.x0), 0, tw.z0, Math.min(tw.x1, hall.x1), tw.h, hall.z0);
  }
  if (tw.z1 > hall.z1) {
    hit(colliders, Math.max(tw.x0, hall.x0), 0, hall.z1, Math.min(tw.x1, hall.x1), tw.h, tw.z1);
  }
}

function buildPosts(root, colliders, M) {
  const mouthZ = L.hall.z1 - L.hall.t - L.gallery.w * 0.5;
  const farZ = L.hall.z0 + L.hall.t + L.gallery.w * 0.5;
  const y1 = L.gallery.y - L.gallery.thick;
  for (let x = -18; x <= 18; x += 8) {
    if (x > L.sw.x1 + 0.8 && x < L.ne.x0 - 0.8) {
      slab(root, colliders, M.creamShade, x - 0.22, 0, mouthZ - 0.22, x + 0.22, y1, mouthZ + 0.22);
    }
    if (x > -16) {
      slab(root, colliders, M.creamShade, x - 0.22, 0, farZ - 0.22, x + 0.22, y1, farZ + 0.22);
    }
  }
}
