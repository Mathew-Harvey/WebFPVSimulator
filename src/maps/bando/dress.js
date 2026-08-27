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
  slab(root, colliders, M.rust, -13.6, 0.7, 14.5, -8.2, 2.05, 16.9, { kind: 'obstacle' });
  slab(root, colliders, M.safety, -17.2, 1.15, 16.95, -14.0, 1.85, 17.12, { solid: false });
  slab(root, colliders, M.glassDark, -16.9, 1.35, 14.32, -14.2, 2.05, 14.42, { solid: false });
  for (const x of [-16.6, -14.4, -12.2, -9.4]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 8), M.steelDark);
    wheel.rotation.x = Math.PI * 0.5;
    wheel.position.set(x, 0.42, 14.55);
    wheel.castShadow = true;
    root.add(wheel);
    const wheelB = wheel.clone();
    wheelB.position.z = 16.85;
    root.add(wheelB);
    slab(root, colliders, M.steelDark, x - 0.42, 0, 14.35, x + 0.42, 0.84, 14.75, { kind: 'obstacle' });
    slab(root, colliders, M.steelDark, x - 0.42, 0, 16.65, x + 0.42, 0.84, 17.05, { kind: 'obstacle' });
  }
}

function crateGrid(root, colliders, M) {
  const d = L.dock;
  const origins = [
    [d.x0 + 1.2, d.z0 + 1.6],
    [d.x0 + 2.7, d.z0 + 1.6],
    [d.x0 + 4.2, d.z0 + 1.6],
    [d.x0 + 1.2, d.z0 + 3.1],
    [d.x0 + 2.7, d.z0 + 3.1],
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
  const spots = [
    [30.2, -11.2], [31.5, -11.2], [32.8, -11.4],
    [45.4, 10.2], [46.6, 10.4],
  ];
  for (const [x, z] of spots) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.95, 8), M.rust);
    drum.position.set(x, 0.48, z);
    drum.castShadow = true;
    root.add(drum);
    slab(root, colliders, M.rust, x - 0.4, 0, z - 0.4, x + 0.4, 0.95, z + 0.4, { kind: 'obstacle' });
  }
}

function junkPiles(root, colliders, M) {
  slab(root, colliders, M.litter, 8.2, 0, 8.4, 12.4, 0.85, 11.6, { kind: 'obstacle' });
  slab(root, colliders, M.rust, 8.6, 0.85, 8.8, 11.2, 1.55, 11.1, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, 9.4, 1.55, 9.2, 10.8, 2.15, 10.6, { kind: 'obstacle' });

  slab(root, colliders, M.litter, -58.2, 0, -6, -53.4, 1.2, -1.4, { kind: 'obstacle' });
  slab(root, colliders, M.bone, -57.4, 1.2, -5.2, -54.2, 2.4, -2.2, { kind: 'obstacle' });

  slab(root, colliders, M.litter, 41.2, 0, -18.4, 46.8, 0.7, -14.2, { kind: 'obstacle' });
  slab(root, colliders, M.ochre, 42.0, 0.7, -17.6, 45.4, 1.45, -15.0, { kind: 'obstacle' });

  slab(root, colliders, M.steel, 22.4, 0, -11.6, 25.6, 1.05, -9.2, { kind: 'obstacle' });
  slab(root, colliders, M.safety, 23.0, 1.05, -11.2, 24.8, 1.35, -9.6, { solid: false });

  for (let i = 0; i < 5; i += 1) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.22, 8), M.steelDark);
    tire.rotation.x = Math.PI * 0.5;
    tire.position.set(24.6, 0.22 + i * 0.24, 8.8);
    tire.castShadow = false;
    tire.userData.noMerge = true;
    root.add(tire);
  }
  slab(root, colliders, M.steelDark, 24.1, 0, 8.3, 25.1, 1.25, 9.3, { kind: 'obstacle' });
}

function hazardPoles(root, colliders, M) {
  const posts = [
    [32.2, -12.6], [43.8, -12.6], [43.8, 12.6], [32.2, 12.6],
    [-43.2, 4.4], [24.8, -3.4],
  ];
  for (const [x, z] of posts) {
    slab(root, colliders, M.steelDark, x - 0.08, 0, z - 0.08, x + 0.08, 2.4, z + 0.08, {
      kind: 'pole',
    });
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
