/*
 * dress.js: the yard as a set, not an empty apron.
 *
 * Junk, a dead truck, crates, barrels, posters and ground chevrons.
 * Every pile is a few boxes with their colliders, so a gap you see is
 * a gap you fly. Canvas stays in this file. Nothing from the city.
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

import * as THREE from 'three';
import { L, slab, decal } from './kit.js';
import { PAL } from './palette.js';
import { flat } from './cel/toon.js';

export function buildDress(root, colliders, M) {
  deadTruck(root, colliders, M);
  crateGrid(root, colliders, M);
  barrels(root, colliders, M);
  junkPiles(root, colliders, M);
  hazardPoles(root, colliders, M);
  yardFence(root, colliders, M);
  apronJunk(root, colliders, M);
  posters(root);
  chevrons(root, colliders, M);
}

function hex(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function paint(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function card(root, tex, x, y, z, w, h, yaw) {
  const mat = flat({
    map: tex,
    transparent: true,
    alphaTest: 0.12,
    side: THREE.FrontSide,
    fog: true,
    cache: false,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noMerge = true;
  mesh.userData.noShadow = true;
  root.add(mesh);
}

function deadTruck(root, colliders, M) {
  /* West of the south mouth, foreground for the spawn look. */
  slab(root, colliders, M.steelDark, -17.4, 0, 14.4, -13.6, 2.15, 17.0, { kind: 'obstacle' });
  slab(root, colliders, M.rust, -13.6, 0, 14.4, -8.2, 2.05, 17.0, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, -17.2, 1.15, 16.95, -14.0, 1.85, 17.12, { solid: false });
  slab(root, colliders, M.glassDark, -16.9, 1.35, 14.32, -14.2, 2.05, 14.42, { solid: false });
  for (const x of [-16.6, -14.4, -12.2, -9.4]) {
    slab(root, colliders, M.steelDark, x - 0.22, 0, 14.4, x + 0.22, 0.84, 14.62, { solid: false, cast: true });
    slab(root, colliders, M.steelDark, x - 0.22, 0, 16.78, x + 0.22, 0.84, 17.0, { solid: false, cast: true });
  }
}

function crateGrid(root, colliders, M) {
  const d = L.dock;
  const origins = [
    [d.x0 + 1.2, d.z0 + 1.6],
    [d.x0 + 2.35, d.z0 + 1.6],
    [d.x0 + 3.5, d.z0 + 1.6],
    [d.x0 + 1.2, d.z0 + 2.75],
    [d.x0 + 2.35, d.z0 + 2.75],
  ];
  const hs = [1.1, 1.55, 0.85, 1.3, 1.9];
  for (let i = 0; i < origins.length; i += 1) {
    const [x, z] = origins[i];
    const h = hs[i];
    slab(root, colliders, i % 2 ? M.bone : M.boneSun, x, d.h, z, x + 1.15, d.h + h, z + 1.15, {
      kind: 'obstacle',
    });
    if (i === 2 || i === 4) {
      decal(root, colliders, M.rust, x - 0.02, d.h + h - 0.12, z, x + 1.17, d.h + h, z + 1.15);
    }
  }
}

function barrels(root, colliders, M) {
  slab(root, colliders, M.rust, 30.2, 0, -13.95, 32.32, 0.95, -13.39, { kind: 'obstacle' });
  slab(root, colliders, M.rust, 30.2, 0.95, -13.81, 31.4, 1.45, -13.53, { kind: 'obstacle' });
  slab(root, colliders, M.rust, 45.4, 0, 10.2, 46.96, 0.95, 10.76, { kind: 'obstacle' });
}

function junkPiles(root, colliders, M) {
  slab(root, colliders, M.litter, 8.2, 0, 8.45, 10.0, 0.85, 11.6, { kind: 'obstacle' });
  slab(root, colliders, M.rust, 8.6, 0.85, 8.8, 10.0, 1.55, 11.1, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, 9.4, 1.55, 9.2, 10.0, 2.15, 10.6, { kind: 'obstacle' });

  slab(root, colliders, M.litter, -58.2, 0, -6, -53.4, 1.2, -1.4, { kind: 'obstacle' });
  slab(root, colliders, M.bone, -57.4, 1.2, -5.2, -54.2, 2.4, -2.2, { kind: 'obstacle' });

  /* Stood off 0.8 m further south than it was, because the bins moved out
   * 0.6 m and this pile ended up 1.4 m from bin 1's south wall, which is
   * the floor rather than a gap. */
  slab(root, colliders, M.litter, 41.2, 0, -19.2, 46.8, 0.7, -15.0, { kind: 'obstacle' });
  slab(root, colliders, M.ochre, 42.0, 0.7, -18.4, 45.4, 1.45, -15.8, { kind: 'obstacle' });

  slab(root, colliders, M.litter, 22.4, 0, -14.2, 25.6, 1.05, -11.8, { kind: 'obstacle' });
  slab(root, colliders, M.safety, 23.0, 1.05, -13.8, 24.8, 1.35, -12.2, { solid: false });

  slab(root, colliders, M.litter, -50.6, 0, 3.55, -46.56, 1.15, 6.4, { kind: 'obstacle' });
  slab(root, colliders, M.rust, -49.8, 1.15, 3.55, -47.0, 2.05, 5.9, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, -49.0, 2.05, 3.9, -47.6, 2.7, 5.5, { kind: 'obstacle' });
  slab(root, colliders, M.litter, -46.56, 0, 3.55, -45.51, 1.2, 3.87, { kind: 'obstacle' });
  slab(root, colliders, M.litter, -46.56, 0, 4.01, -45.51, 1.2, 6.4, { kind: 'obstacle' });
  slab(root, colliders, M.litter, -45.51, 0, 3.55, -43.28, 1.25, 6.4, { kind: 'obstacle' });
  slab(root, colliders, M.bone, -45.2, 1.25, 3.8, -43.6, 2.2, 6.4, { kind: 'obstacle' });
  slab(root, colliders, M.rust, -44.7, 2.2, 4.15, -43.9, 2.95, 5.55, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, -45.05, 0, 6.4, -43.9, 1.55, 7.55, { kind: 'obstacle' });

  slab(root, colliders, M.steelDark, 24.1, 0, 15.0, 25.1, 1.25, 16.0, { kind: 'obstacle' });
  for (let i = 0; i < 5; i += 1) {
    const y = i * 0.24;
    slab(root, colliders, M.steelDark, 24.12, y, 15.02, 25.08, y + 0.22, 15.98, { solid: false, cast: false });
  }
}

function hazardPoles(root, colliders, M) {
  const posts = [
    [31.92, -12.08], [44.08, -12.08], [44.08, 12.08], [31.92, 12.08],
    [-43.2, 5.2], [29.2, -8.55],
  ];
  for (const [x, z] of posts) {
    slab(root, colliders, M.steelDark, x - 0.08, 0, z - 0.08, x + 0.08, 2.4, z + 0.08, {
      kind: 'pole',
    });
  }
}

function yardFence(root, colliders, M) {
  const h = 2.15;
  const r = 0.09;
  const southZ = 27.91;
  const eastX = 53.91;
  const xs = [];
  for (let x = -58; x <= 48; x += 6) {
    xs.push(x);
  }
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i];
    slab(root, colliders, M.steelDark, x - r, 0, southZ - r, x + r, h, southZ + r, {
      kind: 'pole',
    });
    if (i > 0) {
      const a = xs[i - 1] + r + 0.02;
      const b = x - r - 0.02;
      slab(root, colliders, M.steel, a, 0.7, southZ - 0.04, b, 0.86, southZ + 0.04, {
        kind: 'pole',
      });
      slab(root, colliders, M.steel, a, 1.55, southZ - 0.04, b, 1.71, southZ + 0.04, {
        kind: 'pole',
      });
    }
  }
  const zs = [];
  for (let z = -32; z <= 24; z += 6) {
    zs.push(z);
  }
  for (let i = 0; i < zs.length; i += 1) {
    const z = zs[i];
    slab(root, colliders, M.steelDark, eastX - r, 0, z - r, eastX + r, h, z + r, {
      kind: 'pole',
    });
    if (i > 0) {
      const a = zs[i - 1] + r + 0.02;
      const b = z - r - 0.02;
      slab(root, colliders, M.steel, eastX - 0.04, 0.7, a, eastX + 0.04, 0.86, b, {
        kind: 'pole',
      });
      slab(root, colliders, M.steel, eastX - 0.04, 1.55, a, eastX + 0.04, 1.71, b, {
        kind: 'pole',
      });
    }
  }
}

function apronJunk(root, colliders, M) {
  const piles = [
    [20.4, 20.8, 3.2, 2.4, 1.05],
    [28.6, 22.4, 2.8, 2.2, 0.85],
    [36.2, 19.6, 3.4, 2.6, 1.35],
    [44.8, 22.0, 2.6, 2.0, 0.95],
    [18.2, 22.8, 2.2, 1.8, 0.7],
    [-48.8, 11.2, 3.0, 2.2, 1.15],
    [-50.8, 18.6, 2.6, 2.0, 0.8],
    [-56.2, -14.2, 2.8, 2.4, 1.0],
  ];
  for (let i = 0; i < piles.length; i += 1) {
    const [x, z, w, d, h] = piles[i];
    slab(root, colliders, i % 2 ? M.litter : M.rust, x, 0, z, x + w, h, z + d, {
      kind: 'obstacle',
    });
    if (i % 3 === 0) {
      slab(root, colliders, M.steelDark, x + 0.3, h, z + 0.3, x + w - 0.3, h + 0.55, z + d - 0.3, {
        kind: 'obstacle',
      });
    }
  }
}

function posters(root) {
  const rust = hex(PAL.rust);
  const ink = hex(PAL.ink);
  const safety = hex(PAL.safety);
  const bone = hex(PAL.boneSun);
  const red = hex(PAL.bandRed);

  const condemned = paint(384, 160, (c) => {
    c.fillStyle = safety;
    c.fillRect(8, 8, 368, 144);
    c.fillStyle = ink;
    c.fillRect(20, 22, 344, 116);
    c.fillStyle = safety;
    bar(c, 40, 48, 22, 70);
    bar(c, 40, 48, 54, 18);
    bar(c, 72, 66, 18, 52);
    bar(c, 104, 48, 22, 70);
    bar(c, 104, 48, 50, 18);
    bar(c, 104, 100, 50, 18);
    bar(c, 168, 48, 22, 70);
    bar(c, 190, 48, 18, 28);
    bar(c, 208, 48, 22, 70);
    bar(c, 244, 48, 22, 70);
    bar(c, 244, 48, 48, 18);
    bar(c, 244, 78, 40, 16);
    bar(c, 244, 100, 48, 18);
    bar(c, 308, 48, 22, 70);
    bar(c, 308, 100, 52, 18);
  });

  const skull = paint(256, 256, (c) => {
    c.fillStyle = bone;
    c.beginPath();
    c.ellipse(128, 108, 78, 70, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = ink;
    c.beginPath();
    c.ellipse(96, 100, 18, 24, 0, 0, Math.PI * 2);
    c.ellipse(160, 100, 18, 24, 0, 0, Math.PI * 2);
    c.fill();
    c.fillRect(118, 128, 20, 28);
    c.fillStyle = safety;
    c.fillRect(70, 28, 116, 22);
    c.fillStyle = rust;
    c.fillRect(86, 176, 84, 18);
  });

  const hot = paint(256, 192, (c) => {
    c.fillStyle = red;
    c.fillRect(12, 12, 232, 168);
    c.fillStyle = ink;
    bar(c, 40, 48, 28, 96);
    bar(c, 40, 48, 70, 24);
    bar(c, 82, 72, 28, 72);
    bar(c, 128, 48, 28, 96);
    bar(c, 128, 48, 70, 24);
    bar(c, 170, 72, 28, 40);
    bar(c, 128, 112, 70, 32);
  });

  const drone = paint(320, 128, (c) => {
    c.fillStyle = ink;
    c.fillRect(0, 0, 320, 128);
    c.fillStyle = safety;
    bar(c, 24, 28, 18, 72);
    bar(c, 24, 28, 44, 16);
    bar(c, 24, 84, 44, 16);
    bar(c, 80, 28, 18, 72);
    bar(c, 98, 28, 16, 28);
    bar(c, 114, 28, 18, 72);
    bar(c, 148, 28, 18, 72);
    bar(c, 148, 84, 48, 16);
    bar(c, 208, 28, 18, 72);
    bar(c, 226, 28, 16, 72);
    bar(c, 256, 28, 18, 72);
    bar(c, 256, 28, 40, 16);
    bar(c, 256, 84, 40, 16);
  });

  card(root, condemned, -6.4, 3.6, 7.08, 4.6, 1.9, 0);
  card(root, skull, 22.2, 4.8, 7.08, 2.8, 2.8, 0);
  card(root, hot, 24.55, 10.2, 0, 2.4, 1.8, -Math.PI * 0.5);
  card(root, drone, 18.2, 3.4, 15.12, 3.6, 1.4, 0);
  card(root, skull, -21.6, 8.4, -7.08, 2.4, 2.4, Math.PI);
  card(root, condemned, -16.0, 14.2, -21.96, 5.0, 2.0, Math.PI);
  card(root, skull, -10.54, 8.3, -13.6, 2.8, 2.8, -Math.PI * 0.5);
  card(root, condemned, -10.54, 6.4, -13.6, 1.8, 0.7, -Math.PI * 0.5);
  card(root, hot, -21.40, 3.4, -16.0, 3.0, 2.2, Math.PI * 0.5);
  card(root, drone, -21.40, 3.2, -13.4, 3.4, 1.5, Math.PI * 0.5);
}

function bar(ctx, x, y, w, h) {
  ctx.fillRect(x, y, w, h);
}

function chevrons(root, colliders, M) {
  for (let z = 8.2; z < 17.2; z += 1.8) {
    decal(root, colliders, M.safety, -0.85, 0.04, z, 0.85, 0.09, z + 0.55);
    decal(root, colliders, M.inkFlat, -0.25, 0.05, z + 0.12, 0.25, 0.1, z + 0.42);
  }
  for (let x = 25.2; x < 31.6; x += 1.6) {
    decal(root, colliders, M.safety, x, 0.04, -0.7, x + 0.7, 0.09, 0.7);
  }
}
