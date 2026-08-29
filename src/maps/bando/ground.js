/*
 * ground.js: ochre apron, retaining cut, and the two dry clumps.
 *
 * The yard is a bowl. Without the 7 m cut the plant sits on a table; with
 * it the stack's shadow has a wall to climb. Ground height is the apron,
 * then the hopper pit, then the rim. Hills are painted flats.
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
import { buildDistantHills } from './sky.js';

const CUT = 7;
const FLOOR_Y = 0;
const SITE = { x0: -62, x1: 54, z0: -36, z1: 28 };

export function groundHeight(x, z) {
  const pit = L.hopper;
  if (x > pit.x0 + 0.45 && x < pit.x1 - 0.45 && z > pit.z0 + 0.45 && z < pit.z1 - 0.45) {
    return pit.y0 + 0.35;
  }
  if (x > SITE.x0 && x < SITE.x1 && z > SITE.z0 && z < SITE.z1) {
    return FLOOR_Y;
  }
  return CUT;
}

export function buildGround(root, colliders, M) {
  const { x0, x1, z0, z1 } = SITE;
  const pit = {
    x0: L.hopper.x0 + 0.45,
    x1: L.hopper.x1 - 0.45,
    z0: L.hopper.z0 + 0.45,
    z1: L.hopper.z1 - 0.45,
  };
  fillAround(root, colliders, M.ochre, x0, z0, x1, z1, -0.35, 0.02, [pit], {
    solid: false, cast: false, receive: true,
  });

  const wallH = CUT;
  const t = 1.4;
  slab(root, colliders, M.bone, x0 - t, 0, z0 - t, x0, wallH, z1 + t);
  slab(root, colliders, M.bone, x1, 0, z0 - t, x1 + t, wallH, z1 + t);
  slab(root, colliders, M.bone, x0, 0, z0 - t, x1, wallH, z0);
  slab(root, colliders, M.hillShade, x0, 0, z1, x1, wallH, z1 + t);

  slab(root, colliders, M.dry, x0 - 18, wallH - 0.2, z0 - 16, x1 + 16, wallH + 0.05, z0 - t, {
    solid: false, cast: false, receive: true,
  });
  slab(root, colliders, M.dry, x0 - 18, wallH - 0.2, z1 + t, x1 + 16, wallH + 0.05, z1 + 18, {
    solid: false, cast: false, receive: true,
  });
  slab(root, colliders, M.dry, x0 - 18, wallH - 0.2, z0 - 16, x0 - t, wallH + 0.05, z1 + 18, {
    solid: false, cast: false, receive: true,
  });
  slab(root, colliders, M.dry, x1 + t, wallH - 0.2, z0 - 16, x1 + 16, wallH + 0.05, z1 + 18, {
    solid: false, cast: false, receive: true,
  });

  slab(root, colliders, M.litter, -58, 0, 8, -52, 1.1, 14, { kind: 'obstacle' });
  slab(root, colliders, M.dry, -58, 1.1, 8, -52, 1.8, 14, { solid: false, cast: false });
  slab(root, colliders, M.litter, 40, 0, -34, 45, 0.9, -28, { kind: 'obstacle' });
  slab(root, colliders, M.dry, 40, 0.9, -34, 45, 1.6, -28, { solid: false, cast: false });

  const mouth = L.pack.door;
  decal(root, colliders, M.bandWhite, -mouth + 0.3, 0.03, 7.2, mouth - 0.3, 0.07, 17.4);
  decal(root, colliders, M.safety, -mouth - 0.05, 0.04, 7.2, -mouth + 0.25, 0.08, 17.4);
  decal(root, colliders, M.safety, mouth - 0.25, 0.04, 7.2, mouth + 0.05, 0.08, 17.4);
  decal(root, colliders, M.litter, -22, 0.03, 8, -14, 0.06, 13);
  decal(root, colliders, M.boneViolet, 18, 0.03, -18, 26, 0.06, -12);

  slab(root, colliders, M.safety, -11, 0, 20.4, -7.4, 1.15, 21.3, { kind: 'obstacle' });
  slab(root, colliders, M.safety, 7.4, 0, 20.4, 11, 1.15, 21.3, { kind: 'obstacle' });

  buildDistantHills(root, M);
}

function fillAround(root, colliders, mat, x0, z0, x1, z1, y0, y1, holes, opts) {
  const xs = [x0];
  const zs = [z0];
  for (const h of holes) {
    xs.push(h.x0, h.x1);
    zs.push(h.z0, h.z1);
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
      slab(root, colliders, mat, xa, y0, za, xb, y1, zb, opts);
    }
  }
}
