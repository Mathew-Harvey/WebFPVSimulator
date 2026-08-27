/*
 * hall.js: cream hall, south mouth, galleries, clerestory, corner towers.
 *
 * One barn, not a second map. Missing south wall is the spawn mouth.
 * Missing roof bays light the empty pool as graphic wells. Stairs in the
 * towers are sealed: a 5 inch flies the volume, it does not thread treads.
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

import { L, slab, deck, decal, fillAround } from './kit.js';

export function buildHall(root, colliders, platforms, M) {
  const { x0, x1, z0, z1, h, t } = L.hall;
  const door = L.door.half;
  const doorH = L.door.h;

  slab(root, colliders, M.cream, x0, 0, z0, x0 + t, h, z1);
  slab(root, colliders, M.cream, x1 - t, 0, z0, x1, h, z1);
  slab(root, colliders, M.cream, x0, 0, z0, x1, h, z0 + t);
  slab(root, colliders, M.cream, x0, 0, z1 - t, -door, h, z1);
  slab(root, colliders, M.cream, door, 0, z1 - t, x1, h, z1);
  slab(root, colliders, M.cream, -door, doorH, z1 - t, door, h, z1);

  slab(root, colliders, M.steelDark, -door, doorH - 0.28, z1 - t - 0.1, door, doorH + 0.38, z1 + 0.12);
  slab(root, colliders, M.steelDark, -door - 0.4, 0, z1 - t - 0.1, -door, doorH, z1 + 0.12);
  slab(root, colliders, M.steelDark, door, 0, z1 - t - 0.1, door + 0.4, doorH, z1 + 0.12);

  const holes = [
    { x0: -16, x1: -6, z0: -5.5, z1: 5.5 },
    { x0: 6, x1: 16, z0: -5.5, z1: 5.5 },
  ];
  roofWithHoles(root, colliders, platforms, M, x0 + t, x1 - t, z0 + t, z1 - t, h, holes);

  lineHall(root, colliders, M, x0, x1, z0, z1, h, t, door, doorH);
  windowBand(root, colliders, M, x0 + 2.2, z0 - 0.06, x1 - 2.2, 10.2, 13.4);
  windowBand(root, colliders, M, x0 + 2.2, z1 + 0.06, -door - 0.6, 10.2, 13.4);
  windowBand(root, colliders, M, door + 0.6, z1 + 0.06, x1 - 2.2, 10.2, 13.4);

  buildGalleries(root, colliders, platforms, M);
  buildCornerTowers(root, colliders, M);
  buildPosts(root, colliders, M);
  lightWells(root, colliders, M, holes, h);
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
      if (holes.some((h) => mx > h.x0 && mx < h.x1 && mz > h.z0 && mz < h.z1)) {
        continue;
      }
      platforms.push({
        x0: xa, z0: za, x1: xb, z1: zb, top, thick: 0.3,
      });
      colliders.addBox('wall', xa, top - 0.3, za, xb, top - 0.02, zb);
    }
  }
  for (const hole of holes) {
    const lip = 0.5;
    decal(root, colliders, M.tile, hole.x0, top, hole.z0, hole.x1, top + lip, hole.z0 + 0.22);
    decal(root, colliders, M.tile, hole.x0, top, hole.z1 - 0.22, hole.x1, top + lip, hole.z1);
    decal(root, colliders, M.tile, hole.x0, top, hole.z0, hole.x0 + 0.22, top + lip, hole.z1);
    decal(root, colliders, M.tile, hole.x1 - 0.22, top, hole.z0, hole.x1, top + lip, hole.z1);
  }
}

function lineHall(root, colliders, M, x0, x1, z0, z1, h, t, door, doorH) {
  const d = 0.12;
  const skin = { solid: false, cast: false, noShadow: true };
  slab(root, colliders, M.creamSun, x0 + t, 0.02, z0 + t, x0 + t + d, h - 0.2, z1 - t, skin);
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

function lightWells(root, colliders, M, holes, top) {
  const drop = 1.8;
  const th = 0.1;
  for (const hole of holes) {
    decal(root, colliders, M.tile, hole.x0, top - drop, hole.z0, hole.x1, top, hole.z0 + th);
    decal(root, colliders, M.tile, hole.x0, top - drop, hole.z1 - th, hole.x1, top, hole.z1);
    decal(root, colliders, M.tile, hole.x0, top - drop, hole.z0, hole.x0 + th, top, hole.z1);
    decal(root, colliders, M.tile, hole.x1 - th, top - drop, hole.z0, hole.x1, top, hole.z1);
  }
}

function buildGalleries(root, colliders, platforms, M) {
  const g = L.gallery;
  const h = L.hall;
  const t = h.t;
  const door = L.door.half;
  const y = g.y;
  const northZ0 = h.z1 - t - g.w;
  const northZ1 = h.z1 - t;
  deck(root, colliders, platforms, M.creamSun, h.x0 + t, northZ0, h.x1 - t, northZ1, y, g.thick);
  parapet(root, colliders, M, h.x0 + t, northZ0, h.x1 - t, northZ0 + 0.18, y);

  const southZ0 = h.z0 + t;
  const southZ1 = h.z0 + t + g.w;
  const gap = door + 0.8;
  deck(root, colliders, platforms, M.creamSun, h.x0 + t, southZ0, -gap, southZ1, y, g.thick);
  deck(root, colliders, platforms, M.creamSun, gap, southZ0, h.x1 - t, southZ1, y, g.thick);
  parapet(root, colliders, M, h.x0 + t, southZ1 - 0.18, -gap, southZ1, y);
  parapet(root, colliders, M, gap, southZ1 - 0.18, h.x1 - t, southZ1, y);
  slab(root, colliders, M.steelDark, -gap, y, southZ0, -gap + 0.28, y + 1.05, southZ1);
  slab(root, colliders, M.steelDark, gap - 0.28, y, southZ0, gap, y + 1.05, southZ1);
}

function parapet(root, colliders, M, x0, z0, x1, z1, y) {
  const h = L.gallery.parapet;
  slab(root, colliders, M.cream, x0, y, z0, x1, y + h, z1);
  decal(root, colliders, M.orange, x0, y + h - 0.12, z0 - 0.02, x1, y + h + 0.04, z1 + 0.02);
}

function buildCornerTowers(root, colliders, M) {
  raiseTower(root, colliders, M, L.sw);
  raiseTower(root, colliders, M, L.ne);
}

function raiseTower(root, colliders, M, tw) {
  slab(root, colliders, M.cream, tw.x0, 0, tw.z0, tw.x1, tw.h, tw.z1);
  const bands = [
    { y0: 8.2, y1: 9.1, mat: M.white },
    { y0: 9.1, y1: 10.0, mat: M.orange },
    { y0: 10.0, y1: 10.9, mat: M.white },
  ];
  const o = 0.06;
  for (const b of bands) {
    slab(root, colliders, b.mat, tw.x0 - o, b.y0, tw.z0 - o, tw.x1 + o, b.y1, tw.z0 + 0.08, {
      solid: false, noMerge: true, cast: false,
    });
    slab(root, colliders, b.mat, tw.x0 - o, b.y0, tw.z1 - 0.08, tw.x1 + o, b.y1, tw.z1 + o, {
      solid: false, noMerge: true, cast: false,
    });
    slab(root, colliders, b.mat, tw.x0 - o, b.y0, tw.z0, tw.x0 + 0.08, b.y1, tw.z1, {
      solid: false, noMerge: true, cast: false,
    });
    slab(root, colliders, b.mat, tw.x1 - 0.08, b.y0, tw.z0, tw.x1 + o, b.y1, tw.z1, {
      solid: false, noMerge: true, cast: false,
    });
  }
}

function buildPosts(root, colliders, M) {
  const innerN = L.hall.z1 - L.hall.t - L.gallery.w;
  const innerS = L.hall.z0 + L.hall.t + L.gallery.w;
  for (let x = -20; x <= 16; x += 8) {
    slab(root, colliders, M.creamShade, x - 0.22, 0, innerN - 0.22, x + 0.22, L.gallery.y - 0.02, innerN + 0.22);
    if (x < -L.door.half - 2 || x > L.door.half + 2) {
      slab(root, colliders, M.creamShade, x - 0.22, 0, innerS - 0.22, x + 0.22, L.gallery.y - 0.02, innerS + 0.22);
    }
  }
}