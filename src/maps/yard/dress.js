/*
 * dress.js: fence, gate, car, swing, tires, mailbox. AAA from a title still.
 *
 * Board fence, posts every 2.4 m, boards stop at post faces. The missing
 * panel is the line Joshua asked Liftoff to match. The iron gate stands
 * open so the drive is a gap, not a door.
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
import { flat } from './cel/toon.js';

const POST = 0.18;
const FENCE_H = 1.22;
const FILL_T = 0.04;
const BOARD_T = 0.14;

export function buildDress(root, colliders, M) {
  paddock(root, colliders, M);
  ironGate(root, colliders, M);
  car(root, colliders, M);
  swing(root, colliders, M);
  junk(root, colliders, M);
  mailbox(root, colliders, M);
  picnic(root, colliders, M);
  quilt(root);
  stallBoard(root);
}

function paddock(root, colliders, M) {
  const p = L.pad;
  const g = L.gap;
  const d = L.drive;
  runX(root, colliders, M, p.x0, d.x0, p.z0, [{ a0: g.x0, a1: g.x1 }]);
  runX(root, colliders, M, d.x1, p.x1, p.z0, []);
  runX(root, colliders, M, p.x0, p.x1, p.z1, []);
  runZ(root, colliders, M, p.z0, p.z1, p.x0, []);
  runZ(root, colliders, M, p.z0, p.z1, p.x1, []);
  stub(root, colliders, M, g.x0 + POST, g.x1 - POST, p.z0);
}

function runX(root, colliders, M, x0, x1, z, skips) {
  const posts = [];
  for (let x = x0; x <= x1 + 0.001; x += 2.4) {
    posts.push(Math.min(x, x1));
  }
  if (posts[posts.length - 1] < x1 - 0.05) {
    posts.push(x1);
  }
  for (const x of posts) {
    if (skips.some((s) => x > s.a0 + 0.05 && x < s.a1 - 0.05)) {
      continue;
    }
    postAt(root, colliders, M, x, z);
  }
  for (let i = 0; i < posts.length - 1; i += 1) {
    const a = posts[i] + POST * 0.5;
    const b = posts[i + 1] - POST * 0.5;
    if (b - a < 0.2) {
      continue;
    }
    const mid = (a + b) * 0.5;
    if (skips.some((s) => mid > s.a0 && mid < s.a1)) {
      continue;
    }
    slab(root, colliders, M.woodDark, a, 0.08, z - FILL_T * 0.5, b, FENCE_H - 0.04, z + FILL_T * 0.5, {
      kind: 'obstacle',
    });
    railsX(root, colliders, M, a, b, z);
  }
}

function runZ(root, colliders, M, z0, z1, x, skips) {
  const posts = [z0];
  for (let z = z0 + 2.4; z < z1 - 0.05; z += 2.4) {
    posts.push(z);
    postAt(root, colliders, M, x, z);
  }
  posts.push(z1);
  for (let i = 0; i < posts.length - 1; i += 1) {
    const a = posts[i] + POST * 0.5;
    const b = posts[i + 1] - POST * 0.5;
    if (b - a < 0.2) {
      continue;
    }
    const mid = (a + b) * 0.5;
    if (skips.some((s) => mid > s.a0 && mid < s.a1)) {
      continue;
    }
    slab(root, colliders, M.woodDark, x - FILL_T * 0.5, 0.08, a, x + FILL_T * 0.5, FENCE_H - 0.04, b, {
      kind: 'obstacle',
    });
    railsZ(root, colliders, M, a, b, x);
  }
}

function railsX(root, colliders, M, a, b, z) {
  const ys = [[0.14, 0.40], [0.52, 0.78], [0.90, 1.16]];
  for (const [y0, y1] of ys) {
    decal(root, colliders, M.woodSun, a, y0, z - BOARD_T * 0.5, b, y1, z + BOARD_T * 0.5);
  }
}

function railsZ(root, colliders, M, a, b, x) {
  const ys = [[0.14, 0.40], [0.52, 0.78], [0.90, 1.16]];
  for (const [y0, y1] of ys) {
    decal(root, colliders, M.woodSun, x - BOARD_T * 0.5, y0, a, x + BOARD_T * 0.5, y1, b);
  }
}

function postAt(root, colliders, M, x, z) {
  slab(root, colliders, M.woodDark, x - POST * 0.5, 0, z - POST * 0.5, x + POST * 0.5, FENCE_H, z + POST * 0.5, {
    kind: 'pole',
  });
}

function stub(root, colliders, M, x0, x1, z) {
  slab(root, colliders, M.woodDark, x0, 0, z - FILL_T * 0.5, x1, 0.12, z + FILL_T * 0.5, {
    kind: 'obstacle',
  });
}

function ironGate(root, colliders, M) {
  const g = L.gate;
  slab(root, colliders, M.steelDark, g.x0 - 0.08, 0, g.z - 0.08, g.x0 + 0.08, 1.45, g.z + 0.08, {
    kind: 'pole',
  });
  slab(root, colliders, M.steelDark, g.x1 - 0.08, 0, g.z - 0.08, g.x1 + 0.08, 1.45, g.z + 0.08, {
    kind: 'pole',
  });
  slab(root, colliders, M.steel, g.x0 - 0.05, 0.1, g.z + 0.12, g.x0 + 0.05, 1.28, g.z + 3.6, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.steel, g.x1 - 0.05, 0.1, g.z + 0.12, g.x1 + 0.05, 1.28, g.z + 3.6, {
    kind: 'obstacle',
  });
  const bars = [0.22, 0.58, 0.94];
  for (const y of bars) {
    decal(root, colliders, M.steelDark, g.x0 - 0.07, y, g.z + 0.12, g.x0 + 0.07, y + 0.08, g.z + 3.6);
    decal(root, colliders, M.steelDark, g.x1 - 0.07, y, g.z + 0.12, g.x1 + 0.07, y + 0.08, g.z + 3.6);
  }
}

function car(root, colliders, M) {
  const c = L.car;
  slab(root, colliders, M.creamSun, c.x0, 0.18, c.z0, c.x1, 0.92, c.z1, { kind: 'obstacle' });
  slab(root, colliders, M.creamShade, c.x0 + 0.08, 0.92, c.z0 + 0.85, c.x1 - 0.08, c.h, c.z1 - 0.7, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.steelDark, c.x0, 0.22, c.z0 - 0.12, c.x1, 0.38, c.z0, {
    kind: 'obstacle',
  });
  decal(root, colliders, M.pane, c.x0 - 0.02, 0.98, c.z0 + 1.0, c.x0, 1.38, c.z1 - 0.85);
  decal(root, colliders, M.pane, c.x1, 0.98, c.z0 + 1.0, c.x1 + 0.02, 1.38, c.z1 - 0.85);
  decal(root, colliders, M.pane, c.x0 + 0.15, 0.98, c.z0 - 0.02, c.x1 - 0.15, 1.38, c.z0);
  slab(root, colliders, M.tire, c.x0 - 0.12, 0, c.z0 + 0.22, c.x0, 0.42, c.z0 + 0.58, {
    solid: false, cast: false,
  });
  slab(root, colliders, M.tire, c.x1, 0, c.z0 + 0.22, c.x1 + 0.12, 0.42, c.z0 + 0.58, {
    solid: false, cast: false,
  });
  slab(root, colliders, M.tire, c.x0 - 0.12, 0, c.z1 - 0.58, c.x0, 0.42, c.z1 - 0.22, {
    solid: false, cast: false,
  });
  slab(root, colliders, M.tire, c.x1, 0, c.z1 - 0.58, c.x1 + 0.12, 0.42, c.z1 - 0.22, {
    solid: false, cast: false,
  });
}

function swing(root, colliders, M) {
  const p = L.porch;
  const z = -6.64;
  slab(root, colliders, M.creamSun, -2.45, 1.00, z - 0.32, -0.55, 1.12, z + 0.32, { kind: 'obstacle' });
  slab(root, colliders, M.creamSun, -2.45, 1.00, z - 0.42, -0.55, 1.12, z - 0.32, { kind: 'obstacle' });
  slab(root, colliders, M.creamSun, -2.45, 1.00, z + 0.32, -0.55, 1.12, z + 0.42, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, -2.38, 1.26, z - 0.40, -2.32, p.roof - 0.16, z - 0.34, {
    kind: 'pole',
  });
  slab(root, colliders, M.steelDark, -0.68, 1.26, z - 0.40, -0.62, p.roof - 0.16, z - 0.34, {
    kind: 'pole',
  });
}

function junk(root, colliders, M) {
  const x = L.pad.x1 + POST * 0.5;
  slab(root, colliders, M.tire, x, 0, -8.05, x + 0.72, 0.7, -7.33, { kind: 'obstacle' });
  slab(root, colliders, M.tire, x, 0, -7.33, x + 0.72, 0.7, -6.61, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, L.garage.x1, 0, 3.95, L.garage.x1 + 0.7, 1.05, 4.8, {
    kind: 'obstacle',
  });
  const hx = L.hay.x1;
  const hz = L.hay.z0;
  slab(root, colliders, M.woodDark, hx - 1.2, 0, hz + 0.35 - 0.85, hx, 0.42, hz + 0.35, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.wood, hx - 1.12, 0.42, hz + 0.35 - 0.78, hx - 0.08, 0.78, hz + 0.35, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.steelDark, L.stable.x1, 0, 20.0, L.stable.x1 + 1.35, 0.52, 21.5, {
    kind: 'obstacle',
  });

  slab(root, colliders, M.steelDark, L.garage.x1 + 0.7, 0, 3.95, L.garage.x1 + 1.2, 0.95, 4.45, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.steel, L.garage.x1 + 1.2, 0, 3.95, L.garage.x1 + 1.7, 0.95, 4.45, {
    kind: 'obstacle',
  });

  slab(root, colliders, M.steelDark, -5.40, L.deck.y, 7.23, -4.60, 2.02, 8.03, { kind: 'obstacle' });
  slab(root, colliders, M.tire, -5.32, 2.02, 7.33, -4.68, 2.14, 7.93, { kind: 'obstacle' });

  slab(root, colliders, M.wood, L.porch.x0, 0, L.porch.z0 - 0.38, L.porch.x0 + 0.76, 0.38, L.porch.z0 + 0.04, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.leaf, L.porch.x0 + 0.08, 0.38, L.porch.z0 - 0.30, L.porch.x0 + 0.68, 0.52, L.porch.z0 + 0.04, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.wood, L.porch.x1 - 0.76, 0, L.porch.z0 - 0.38, L.porch.x1, 0.38, L.porch.z0 + 0.04, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.leaf, L.porch.x1 - 0.68, 0.38, L.porch.z0 - 0.30, L.porch.x1 - 0.08, 0.52, L.porch.z0 + 0.04, {
    kind: 'obstacle',
  });

  slab(root, colliders, M.steel, L.hay.x0 - 1.1, 0.18, -21.4, L.hay.x0, 0.48, -20.3, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.woodDark, L.hay.x0 - 1.05, 0.32, -21.55, L.hay.x0 - 0.15, 0.42, -21.4, {
    kind: 'pole',
  });

  slab(root, colliders, M.steelDark, 9.7, 0, L.garage.z1, 10.55, 0.42, L.garage.z1 + 0.7, { kind: 'obstacle' });
  slab(root, colliders, M.tire, 9.75, 0, L.garage.z1 + 0.05, 10.15, 0.28, L.garage.z1 + 0.35, {
    solid: false, cast: false,
  });

  slab(root, colliders, M.woodDark, -2.32, 0, 4.8, -1.44, 0.35, 4.94, { kind: 'obstacle' });

  slab(root, colliders, M.steel, L.house.x0 - 0.72, 0, L.house.z0, L.house.x0, 0.95, L.house.z0 + 0.72, {
    kind: 'obstacle',
  });

  slab(root, colliders, M.litter, -28.2, 0, L.stable.z1, -26.6, 0.78, L.stable.z1 + 0.95, {
    kind: 'obstacle',
  });

  slab(root, colliders, M.woodDark, -4.55, 0, -38.12, -4.41, 1.05, -37.98, { kind: 'pole' });
  slab(root, colliders, M.woodDark, -3.25, 0, -38.12, -3.11, 1.05, -37.98, { kind: 'pole' });
  slab(root, colliders, M.wood, -4.41, 0.52, -38.08, -3.25, 0.66, -38.02, { kind: 'pole' });
}

function mailbox(root, colliders, M) {
  slab(root, colliders, M.steelDark, 8.7, 0, L.gate.z - 0.06, 8.82, 1.05, L.gate.z + 0.06, {
    kind: 'pole',
  });
  slab(root, colliders, M.steel, 8.55, 1.05, L.gate.z - 0.18, 8.98, 1.32, L.gate.z + 0.18, {
    kind: 'obstacle',
  });
  decal(root, colliders, M.barn, 8.96, 1.12, L.gate.z - 0.04, 9.0, 1.28, L.gate.z + 0.1);
}

function picnic(root, colliders, M) {
  const x0 = -12.4;
  const x1 = -10.6;
  const z0 = -1.2;
  const z1 = 1.4;
  slab(root, colliders, M.woodSun, x0, 0.72, z0, x1, 0.82, z1, { kind: 'obstacle' });
  slab(root, colliders, M.woodDark, x0 + 0.08, 0, z0 + 0.08, x0 + 0.2, 0.72, z0 + 0.2, {
    kind: 'pole',
  });
  slab(root, colliders, M.woodDark, x1 - 0.2, 0, z0 + 0.08, x1 - 0.08, 0.72, z0 + 0.2, {
    kind: 'pole',
  });
  slab(root, colliders, M.woodDark, x0 + 0.08, 0, z1 - 0.2, x0 + 0.2, 0.72, z1 - 0.08, {
    kind: 'pole',
  });
  slab(root, colliders, M.woodDark, x1 - 0.2, 0, z1 - 0.2, x1 - 0.08, 0.72, z1 - 0.08, {
    kind: 'pole',
  });
  slab(root, colliders, M.wood, x0 - 0.34, 0.44, z0, x0, 0.52, z1, { kind: 'obstacle' });
  slab(root, colliders, M.wood, x1, 0.44, z0, x1 + 0.34, 0.52, z1, { kind: 'obstacle' });
}

function quilt(root) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#f4eee4';
  c.fillRect(0, 0, 256, 256);
  c.fillStyle = '#b84432';
  c.fillRect(16, 16, 224, 224);
  c.fillStyle = '#f4eee4';
  c.beginPath();
  c.moveTo(128, 40);
  c.lineTo(216, 128);
  c.lineTo(128, 216);
  c.lineTo(40, 128);
  c.closePath();
  c.fill();
  c.fillStyle = '#4a8a42';
  c.fillRect(108, 108, 40, 40);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const mat = flat({
    map: tex, transparent: false, fog: true, cache: false, depthWrite: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), mat);
  mesh.position.set(L.stable.x1 + 0.04, 3.6, 20.4);
  mesh.rotation.y = Math.PI * 0.5;
  mesh.userData.noMerge = true;
  mesh.castShadow = false;
  root.add(mesh);
}

function stallBoard(root) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 96;
  const c = cv.getContext('2d');
  c.fillStyle = '#5a3e2c';
  c.fillRect(0, 0, 256, 96);
  c.fillStyle = '#dcccb4';
  c.fillRect(8, 8, 240, 80);
  c.fillStyle = '#5a3e2c';
  c.fillRect(20, 28, 48, 40);
  c.fillRect(104, 28, 48, 40);
  c.fillRect(188, 28, 48, 40);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const mat = flat({
    map: tex, transparent: false, fog: true, cache: false, depthWrite: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), mat);
  mesh.position.set(-26.5, 3.05, L.stable.z0 - 0.05);
  mesh.userData.noMerge = true;
  mesh.castShadow = false;
  root.add(mesh);
}
