/*
 * plant.js: stack, kiln, preheater, cyclones, bins, gantry, hopper.
 *
 * One machine. The stack shaft opens east into the kiln at 8 m. Miss that
 * mouth and the shaft floor is the miss. Gantry portals are AABB holes
 * that match the mesh. Bins are hollow drums: the 1.4 m split is the gap
 * you see, the roof hatch is the drop. Cyclones sit on the preheater, not
 * as a second campus. Yard scatter stays out of this file on purpose.
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
import { L, slab, deck, decal, pipe, ductX, ductZ } from './kit.js';

const CYC = [
  { cx: -19.5, cz: -27.8 },
  { cx: -13.0, cz: -27.8 },
  { cx: -6.5, cz: -27.8 },
];
const CYC_R = 1.42;
const CYC_T = 0.30;
const DUCT_Y = 8.05;
const DUCT_IN = 1.55;

export function buildPlant(root, colliders, platforms, M) {
  buildStack(root, colliders, platforms, M);
  buildKiln(root, colliders, platforms, M);
  buildPreheater(root, colliders, platforms, M);
  buildCyclones(root, colliders, platforms, M);
  buildSkybridge(root, colliders, platforms, M);
  buildBins(root, colliders, platforms, M);
  buildGantry(root, colliders, platforms, M);
  buildHopper(root, colliders, platforms, M);
  buildDock(root, colliders, platforms, M);
  buildWires(root, colliders, M);
}

function buildStack(root, colliders, platforms, M) {
  const { cx, cz, inner, wall, h } = L.stack;
  const hi = inner * 0.5;
  const ho = hi + wall;
  const kilnY0 = L.kiln.y0;
  const kilnY1 = L.kiln.y0 + L.kiln.inner;
  const slots = [
    { y0: 16, y1: 18.4 },
    { y0: 32, y1: 34.4 },
    { y0: 48, y1: 50.4 },
  ];

  slottedFace(root, colliders, M.stack, cx - ho, 0, cz + hi, cx + ho, h, cz + ho, slots, 'x', cx - 0.9, cx + 0.9);
  slottedFace(root, colliders, M.stack, cx - ho, 0, cz - ho, cx + ho, h, cz - hi, slots, 'x', cx - 0.9, cx + 0.9);

  slab(root, colliders, M.stack, cx - ho, 0, cz - hi, cx - hi, h, cz + hi);
  slab(root, colliders, M.stack, cx + hi, 0, cz - hi, cx + ho, kilnY0, cz + hi);
  slab(root, colliders, M.stack, cx + hi, kilnY1, cz - hi, cx + ho, h, cz + hi);

  slab(root, colliders, M.stackSun, cx - hi, 0, cz - hi, cx + hi, 0.45, cz + hi);

  const walks = [14, 28, 42, 54];
  const deep = 1.15;
  const rail = 0.11;
  const rh = 0.78;
  for (const y of walks) {
    deck(root, colliders, platforms, M.steel, cx - 3.2, cz + ho, cx + 3.2, cz + ho + deep, y, 0.18);
    slab(root, colliders, M.steelDark, cx - 3.2, y, cz + ho + deep - rail, cx + 3.2, y + rh, cz + ho + deep);
    deck(root, colliders, platforms, M.steel, cx - 3.2, cz - ho - deep, cx + 3.2, cz - ho, y, 0.18);
    slab(root, colliders, M.steelDark, cx - 3.2, y, cz - ho - deep, cx + 3.2, y + rh, cz - ho - deep + rail);
    deck(root, colliders, platforms, M.steel, cx + ho, cz - 3.2, cx + ho + deep, cz + 3.2, y, 0.18);
    slab(root, colliders, M.steelDark, cx + ho + deep - rail, y, cz - 3.2, cx + ho + deep, y + rh, cz + 3.2);
    deck(root, colliders, platforms, M.steel, cx - ho - deep, cz - 3.2, cx - ho, cz + 3.2, y, 0.18);
    slab(root, colliders, M.steelDark, cx - ho - deep, y, cz - 3.2, cx - ho - deep + rail, y + rh, cz + 3.2);
  }

  pipe(root, colliders, M.steelDark, 'y', 0, 54.2, cx - 0.42, cz + ho + deep + 0.14, 0.07);
  pipe(root, colliders, M.steelDark, 'y', 0, 54.2, cx + 0.42, cz + ho + deep + 0.14, 0.07);

  for (const y of [16, 32, 48]) {
    deck(root, colliders, platforms, M.steelDark, cx - 1.0, cz + hi - 0.42, cx + 1.0, cz + hi, y, 0.12);
    deck(root, colliders, platforms, M.steelDark, cx - 1.0, cz - hi, cx + 1.0, cz - hi + 0.42, y, 0.12);
  }

  /* Between the 34 m slots and the 42 m catwalk, so neither is capped. */
  const bands = [
    { y0: 35.6, y1: 37.4, mat: M.bandWhite },
    { y0: 37.4, y1: 39.2, mat: M.bandRed },
    { y0: 39.2, y1: 41.0, mat: M.bandWhite },
  ];
  const lip = 0.06;
  for (const b of bands) {
    const o = ho + lip;
    slab(root, colliders, b.mat, cx - o, b.y0, cz + ho, cx + o, b.y1, cz + o, {
      solid: false, noMerge: true, cast: false,
    });
    slab(root, colliders, b.mat, cx - o, b.y0, cz - o, cx + o, b.y1, cz - ho, {
      solid: false, noMerge: true, cast: false,
    });
    slab(root, colliders, b.mat, cx + ho, b.y0, cz - ho, cx + o, b.y1, cz + ho, {
      solid: false, noMerge: true, cast: false,
    });
    slab(root, colliders, b.mat, cx - o, b.y0, cz - ho, cx - ho, b.y1, cz + ho, {
      solid: false, noMerge: true, cast: false,
    });
  }

  const cap = 0.75;
  const out = ho + 0.28;
  slab(root, colliders, M.stackSun, cx - out, h - 0.18, cz + ho, cx + out, h + cap, cz + out);
  slab(root, colliders, M.stackSun, cx - out, h - 0.18, cz - out, cx + out, h + cap, cz - ho);
  slab(root, colliders, M.stackSun, cx + ho, h - 0.18, cz - ho, cx + out, h + cap, cz + ho);
  slab(root, colliders, M.stackSun, cx - out, h - 0.18, cz - ho, cx - ho, h + cap, cz + ho);
  decal(root, colliders, M.rust, cx - out, h + cap - 0.1, cz + ho, cx + out, h + cap + 0.05, cz + out);
  decal(root, colliders, M.rust, cx - out, h + cap - 0.1, cz - out, cx + out, h + cap + 0.05, cz - ho);
  slab(root, colliders, M.steelDark, cx - 0.07, h + cap, cz + ho + 0.04, cx + 0.07, h + cap + 3.1, cz + ho + 0.18, {
    kind: 'pole',
  });
  decal(root, colliders, M.steelDark, cx - hi, h - 0.06, cz + hi, cx + hi, h + 0.26, cz + hi + 0.16);
  decal(root, colliders, M.steelDark, cx - hi, h - 0.06, cz - hi - 0.16, cx + hi, h + 0.26, cz - hi);
  decal(root, colliders, M.steelDark, cx + hi, h - 0.06, cz - hi, cx + hi + 0.16, h + 0.26, cz + hi);
  decal(root, colliders, M.steelDark, cx - hi - 0.16, h - 0.06, cz - hi, cx - hi, h + 0.26, cz + hi);
  decal(root, colliders, M.safety, cx - 0.55, 2.1, cz + ho, cx + 0.55, 5.8, cz + ho + 0.08);
}

function slottedFace(root, colliders, mat, x0, y0, z0, x1, y1, z1, slots, axis, a0, a1) {
  const ys = [y0];
  for (const s of slots) {
    ys.push(s.y0, s.y1);
  }
  ys.push(y1);
  for (let i = 0; i < ys.length - 1; i += 1) {
    const ya = ys[i];
    const yb = ys[i + 1];
    if (yb - ya < 0.05) {
      continue;
    }
    const slot = slots.find((s) => Math.abs(s.y0 - ya) < 1e-6 && Math.abs(s.y1 - yb) < 1e-6);
    if (!slot) {
      slab(root, colliders, mat, x0, ya, z0, x1, yb, z1);
      continue;
    }
    if (axis === 'x') {
      slab(root, colliders, mat, x0, ya, z0, a0, yb, z1);
      slab(root, colliders, mat, a1, ya, z0, x1, yb, z1);
    }
  }
}

function wallWithHolesX(root, colliders, mat, x0, x1, y0, y1, z0, z1, holes) {
  const xs = [x0, x1];
  const ys = [y0, y1];
  for (const hole of holes) {
    xs.push(hole.x0, hole.x1);
    ys.push(hole.y0, hole.y1);
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const xa = xs[i];
      const xb = xs[i + 1];
      const ya = ys[j];
      const yb = ys[j + 1];
      if (xb - xa < 0.04 || yb - ya < 0.04) {
        continue;
      }
      const mx = (xa + xb) * 0.5;
      const my = (ya + yb) * 0.5;
      if (holes.some((h) => mx > h.x0 && mx < h.x1 && my > h.y0 && my < h.y1)) {
        continue;
      }
      slab(root, colliders, mat, xa, ya, z0, xb, yb, z1);
    }
  }
}

function buildKiln(root, colliders, platforms, M) {
  const inner = L.kiln.inner;
  const wall = L.kiln.wall;
  const hi = inner * 0.5;
  const ho = hi + wall;
  const y0 = L.kiln.y0;
  const y1 = y0 + inner;
  const x0 = L.stack.cx + L.stack.inner * 0.5;
  const x1 = L.kiln.x1;

  slab(root, colliders, M.kiln, x0, y0 - wall, -hi, x1, y0, hi);
  slab(root, colliders, M.kiln, x0, y1, -hi, x1, y1 + wall, hi);
  platforms.push({ x0, z0: -hi, x1, z1: hi, top: y0 });

  const hatches = [
    { x0: -20.7, x1: -19.2, y0: 9.05, y1: 10.65 },
    { x0: 3.2, x1: 4.7, y0: 9.05, y1: 10.65 },
  ];
  wallWithHolesX(root, colliders, M.kiln, x0, x1, y0, y1, hi, ho, hatches);
  wallWithHolesX(root, colliders, M.kiln, x0, x1, y0, y1, -ho, -hi, [hatches[0]]);

  const mouth = 1.1;
  slab(root, colliders, M.kiln, x1, y0, -ho, x1 + wall, y1, -mouth);
  slab(root, colliders, M.kiln, x1, y0, mouth, x1 + wall, y1, ho);
  slab(root, colliders, M.kiln, x1, y0, -mouth, x1 + wall, y0 + 0.7, mouth);
  slab(root, colliders, M.kiln, x1, y1 - 0.7, -mouth, x1 + wall, y1, mouth);

  for (let x = x0 + 5; x < x1 - 2; x += 8) {
    slab(root, colliders, M.bone, x - 0.55, 0, ho + 0.15, x + 0.55, y0 - wall, ho + 1.15);
    slab(root, colliders, M.bone, x - 0.55, 0, -ho - 1.15, x + 0.55, y0 - wall, -ho - 0.15);
    slab(root, colliders, M.rust, x - 0.7, 7.32, ho + 0.08, x + 0.7, 7.92, ho + 0.62);
    slab(root, colliders, M.rust, x - 0.7, 7.32, -ho - 0.62, x + 0.7, 7.92, -ho - 0.08);
  }

  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(ho + 0.12, ho + 0.12, x1 - x0, 8, 1, true),
    M.kilnDrum,
  );
  drum.rotation.z = Math.PI * 0.5;
  drum.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, 0);
  drum.castShadow = true;
  drum.receiveShadow = true;
  root.add(drum);

  for (const x of [x0 + 12, x0 + 28, x0 + 44]) {
    if (x > x1 - 3) {
      continue;
    }
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(ho + 0.28, ho + 0.28, 0.5, 8, 1, true),
      M.rust,
    );
    ring.rotation.z = Math.PI * 0.5;
    ring.position.set(x, (y0 + y1) * 0.5, 0);
    ring.castShadow = false;
    ring.userData.noMerge = true;
    root.add(ring);
  }

  slab(root, colliders, M.steel, -42.2, 1.55, -0.65, -28.6, 2.35, 0.65);
  for (const x of [-40, -34]) {
    slab(root, colliders, M.bone, x - 0.25, 0, -0.75, x + 0.25, 1.55, 0.75);
  }
  decal(root, colliders, M.rust, x0 + 2, y0 + 0.02, -0.4, x0 + 8, y0 + 0.06, 0.4);
  decal(root, colliders, M.safety, -20.75, 9.0, ho, -19.15, 9.12, ho + 0.06);
  decal(root, colliders, M.safety, 3.15, 9.0, ho, 4.75, 9.12, ho + 0.06);
}

function buildPreheater(root, colliders, platforms, M) {
  const { x0, x1, z0, z1, h, rise } = L.pre;
  const t = 0.4;
  const floors = [];
  for (let y = rise; y < h; y += rise) {
    floors.push(y);
  }
  slab(root, colliders, M.boneViolet, x0, 0, z0, x0 + t, h, z1);
  slab(root, colliders, M.boneViolet, x1 - t, 0, z0, x1, h, z1);
  wallWithHolesX(root, colliders, M.boneViolet, x0, x1, 0, h, z0, z0 + t, [
    { x0: -16.8, x1: -15.2, y0: DUCT_Y, y1: DUCT_Y + DUCT_IN },
  ]);

  let yCursor = 0;
  const southOpen = 2.0;
  for (const y of [...floors, h]) {
    const bandTop = Math.min(y, h);
    if (bandTop > yCursor + 0.05) {
      slab(root, colliders, M.bone, x0, yCursor, z1 - t, x0 + (x1 - x0 - southOpen) * 0.5, bandTop, z1);
      slab(root, colliders, M.bone, x1 - (x1 - x0 - southOpen) * 0.5, yCursor, z1 - t, x1, bandTop, z1);
    }
    yCursor = y + 0.02;
  }

  let flip = 0;
  for (const y of floors) {
    const hole = 1.7;
    const hx0 = flip ? x0 + t + 0.3 : x1 - t - 0.3 - hole;
    const hz0 = flip ? z0 + t + 0.3 : z1 - t - 0.3 - hole;
    const hx1 = hx0 + hole;
    const hz1 = hz0 + hole;
    roofRect(root, colliders, platforms, M.boneSun, x0 + t, z0 + t, x1 - t, z1 - t, y, hx0, hz0, hx1, hz1);
    flip = 1 - flip;
  }
  deck(root, colliders, platforms, M.boneSun, x0 + t, z0 + t, x1 - t, z1 - t, h);
  const bands = [
    { y0: 18.2, y1: 19.6, mat: M.bandWhite },
    { y0: 19.6, y1: 21.0, mat: M.bandRed },
    { y0: 21.0, y1: 22.4, mat: M.bandWhite },
  ];
  for (const b of bands) {
    slab(root, colliders, b.mat, x0 - 0.06, b.y0, z0 - 0.06, x1 + 0.06, b.y1, z0 + 0.08, {
      solid: false, noMerge: true, cast: false,
    });
    slab(root, colliders, b.mat, x0 - 0.06, b.y0, z1 - 0.08, x1 + 0.06, b.y1, z1 + 0.06, {
      solid: false, noMerge: true, cast: false,
    });
  }
}

function roofRect(root, colliders, platforms, mat, x0, z0, x1, z1, top, hx0, hz0, hx1, hz1) {
  const xs = [x0, hx0, hx1, x1].sort((a, b) => a - b);
  const zs = [z0, hz0, hz1, z1].sort((a, b) => a - b);
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      const xa = xs[i];
      const xb = xs[i + 1];
      const za = zs[j];
      const zb = zs[j + 1];
      if (xb - xa < 0.04 || zb - za < 0.04) {
        continue;
      }
      const mx = (xa + xb) * 0.5;
      const mz = (za + zb) * 0.5;
      if (mx > hx0 && mx < hx1 && mz > hz0 && mz < hz1) {
        continue;
      }
      deck(root, colliders, platforms, mat, xa, za, xb, zb, top);
    }
  }
}

function buildCyclones(root, colliders, platforms, M) {
  const yBody0 = 2.7;
  const yBody1 = 9.9;
  const half = CYC_R;
  const t = CYC_T;
  const ductZ0 = DUCT_Y;
  const ductZ1 = DUCT_Y + DUCT_IN;
  const face = 0.78;

  for (let i = 0; i < CYC.length; i += 1) {
    const { cx, cz } = CYC[i];
    const east = { x0: cx + half - t, x1: cx + half, z0: cz - face, z1: cz + face, y0: ductZ0, y1: ductZ1 };
    const west = { x0: cx - half, x1: cx - half + t, z0: cz - face, z1: cz + face, y0: ductZ0, y1: ductZ1 };
    const south = i === 1
      ? { x0: cx - face, x1: cx + face, z0: cz + half - t, z1: cz + half, y0: ductZ0, y1: ductZ1 }
      : { x0: cx - 0.7, x1: cx + 0.7, z0: cz + half - t, z1: cz + half, y0: 3.05, y1: 4.65 };

    slab(root, colliders, M.boneViolet, cx - half, yBody0, cz - half, cx + half, yBody1, cz - half + t);
    wallWithHolesX(root, colliders, M.boneViolet, cx - half, cx + half, yBody0, yBody1, cz + half - t, cz + half, [
      { x0: south.x0, x1: south.x1, y0: south.y0, y1: south.y1 },
    ]);
    wallWithHolesZ(root, colliders, M.boneViolet, cz - half, cz + half, yBody0, yBody1, cx + half - t, cx + half, [
      { z0: east.z0, z1: east.z1, y0: east.y0, y1: east.y1 },
    ]);
    wallWithHolesZ(root, colliders, M.boneViolet, cz - half, cz + half, yBody0, yBody1, cx - half, cx - half + t, [
      { z0: west.z0, z1: west.z1, y0: west.y0, y1: west.y1 },
    ]);

    slab(root, colliders, M.rust, cx - 0.45, 0.2, cz - 0.45, cx + 0.45, 1.15, cz + 0.45);
    slab(root, colliders, M.rust, cx - 0.85, 1.15, cz - 0.85, cx + 0.85, 1.95, cz + 0.85);
    slab(root, colliders, M.rust, cx - 1.2, 1.95, cz - 1.2, cx + 1.2, yBody0, cz + 1.2);

    const h = yBody1 - yBody0;
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(CYC_R + 0.04, CYC_R * 0.98, h, 8, 1, true),
      M.cyclone,
    );
    shell.position.set(cx, yBody0 + h * 0.5, cz);
    shell.castShadow = true;
    shell.receiveShadow = true;
    shell.userData.noMerge = true;
    root.add(shell);
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 1.32, 2.4, 8),
      M.cyclone,
    );
    cone.position.set(cx, 1.5, cz);
    cone.castShadow = true;
    cone.userData.noMerge = true;
    root.add(cone);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(CYC_R + 0.1, CYC_R + 0.1, 0.42, 8, 1, true),
      M.bandRed,
    );
    band.position.set(cx, 7.2, cz);
    band.castShadow = false;
    band.userData.noMerge = true;
    root.add(band);
  }

  const r = CYC_R;
  ductX(root, colliders, platforms, M.steel, CYC[0].cx + r, CYC[1].cx - r, DUCT_Y, CYC[0].cz, DUCT_IN);
  ductX(root, colliders, platforms, M.steel, CYC[1].cx + r, CYC[2].cx - r, DUCT_Y, CYC[0].cz, DUCT_IN);
  ductZ(root, colliders, platforms, M.steel, CYC[1].cz + r, L.pre.z0 + 0.45, DUCT_Y, CYC[1].cx, DUCT_IN);
}

function wallWithHolesZ(root, colliders, mat, z0, z1, y0, y1, x0, x1, holes) {
  const zs = [z0, z1];
  const ys = [y0, y1];
  for (const hole of holes) {
    zs.push(hole.z0, hole.z1);
    ys.push(hole.y0, hole.y1);
  }
  zs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  for (let i = 0; i < zs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const za = zs[i];
      const zb = zs[i + 1];
      const ya = ys[j];
      const yb = ys[j + 1];
      if (zb - za < 0.04 || yb - ya < 0.04) {
        continue;
      }
      const mz = (za + zb) * 0.5;
      const my = (ya + yb) * 0.5;
      if (holes.some((h) => mz > h.z0 && mz < h.z1 && my > h.y0 && my < h.y1)) {
        continue;
      }
      slab(root, colliders, mat, x0, ya, za, x1, yb, zb);
    }
  }
}

function buildSkybridge(root, colliders, platforms, M) {
  const y = 42;
  const w = 1.22;
  const zA = -15.55;
  const zB = zA + w;
  const xE = -22.0;
  const xW = -43.15;
  deck(root, colliders, platforms, M.steel, xW, zA, xE, zB, y, 0.18);
  slab(root, colliders, M.steelDark, xW, y, zA, xE, y + 0.74, zA + 0.1);
  slab(root, colliders, M.steelDark, xW, y, zB - 0.1, xE, y + 0.74, zB);
  deck(root, colliders, platforms, M.steel, xW, zA, xW + w, 2.25, y, 0.18);
  slab(root, colliders, M.steelDark, xW, y, zA, xW + 0.1, y + 0.74, 2.25);
  slab(root, colliders, M.steelDark, xW + w - 0.1, y, zA, xW + w, y + 0.74, 2.25);
  const posts = [
    [xE - 0.45, -14.94],
    [-32.4, -14.94],
    [xW + 0.6, -14.94],
    [xW + 0.6, -6.2],
    [xW + 0.6, 0.4],
  ];
  for (const [px, pz] of posts) {
    pipe(root, colliders, M.steelDark, 'y', 16, y, px, pz, 0.11);
  }
}

function buildBins(root, colliders, platforms, M) {
  const { cx, zs, w, hs } = L.bins;
  const R = w * 0.5;
  const t = 0.36;
  const hatch = 1.8;
  for (let i = 0; i < zs.length; i += 1) {
    const cz = zs[i];
    const h = hs[i];
    const mat = i === 1 ? M.siloShellDark : M.siloShell;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.03, R * 0.97, h, 8, 1, true), mat);
    cyl.position.set(cx, h * 0.5, cz);
    cyl.castShadow = true;
    cyl.receiveShadow = true;
    cyl.userData.noMerge = true;
    root.add(cyl);

    const half = R;
    const face = 1.48 * R * 0.5;
    const groundDoor = { z0: cz - 0.75, z1: cz + 0.75, y0: 0.4, y1: 2.35 };
    const galleryDoor = h > 16.5
      ? { z0: cz - 0.7, z1: cz + 0.7, y0: 15.25, y1: 17.05 }
      : null;
    const eastHoles = [groundDoor];
    if (galleryDoor) {
      eastHoles.push(galleryDoor);
    }

    slab(root, colliders, M.silo, cx - face, 0.02, cz + half - t, cx + face, h, cz + half);
    slab(root, colliders, M.silo, cx - face, 0.02, cz - half, cx + face, h, cz - half + t);
    slab(root, colliders, M.silo, cx - half, 0.02, cz - face, cx - half + t, h, cz + face);
    wallWithHolesZ(root, colliders, M.silo, cz - face, cz + face, 0.02, h, cx + half - t, cx + half, eastHoles);

    const d = R * 0.64;
    const s = 0.42;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        slab(
          root, colliders, M.silo,
          cx + sx * d - s * 0.5, 0.02, cz + sz * d - s * 0.5,
          cx + sx * d + s * 0.5, h, cz + sz * d + s * 0.5,
        );
      }
    }

    slab(root, colliders, M.bone, cx - R + t + 0.05, 0, cz - R + t + 0.05, cx + R - t - 0.05, 0.38, cz + R - t - 0.05);
    pipe(root, colliders, M.steelDark, 'y', 0.38, h - 0.4, cx, cz, 0.22);

    const hh = hatch * 0.5;
    roofRect(
      root, colliders, platforms, M.boneSun,
      cx - 2.55, cz - 2.55, cx + 2.55, cz + 2.55, h,
      cx + 0.55, cz - hh, cx + 0.55 + hatch, cz + hh,
    );

    if (i !== 1) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(R + 0.08, R + 0.08, 0.55, 8, 1, true),
        M.rust,
      );
      band.position.set(cx, h * 0.62, cz);
      band.castShadow = false;
      band.userData.noMerge = true;
      root.add(band);
    }
    if (h > 16.5) {
      pipe(root, colliders, M.steel, 'y', 16, h + 0.15, 42.85, cz, 0.16);
    }
    slab(root, colliders, M.ochre, cx - 2.2, 0, cz + R - 0.2, cx + 0.4, 1.5, cz + R + 1.4, {
      kind: 'obstacle',
    });
  }
}

function buildGantry(root, colliders, platforms, M) {
  const g = L.gantry;
  deck(root, colliders, platforms, M.steel, g.x0, g.z0, g.x1, g.z1, g.y, 0.22);
  const xs = [30.2, 34.4, 38.4];
  for (const x of xs) {
    hoop(root, colliders, M.steelDark, x, g.y, g.z0, g.y + 2.2, g.z1);
  }
  const rt = 0.10;
  const rh = 0.82;
  slab(root, colliders, M.steelDark, g.x0, g.y, g.z0, 43.2, g.y + rh, g.z0 + rt);
  slab(root, colliders, M.steelDark, g.x0, g.y, g.z1 - rt, 43.2, g.y + rh, g.z1);
  decal(root, colliders, M.safety, g.x0 + 0.4, g.y + 0.01, g.z0 + 0.12, g.x1 - 0.4, g.y + 0.05, g.z0 + 0.28);
  decal(root, colliders, M.safety, g.x0 + 0.4, g.y + 0.01, g.z1 - 0.28, g.x1 - 0.4, g.y + 0.05, g.z1 - 0.12);

  deck(root, colliders, platforms, M.steel, g.x1, g.z0, 43.2, g.z1, g.y, 0.22);
  hoop(root, colliders, M.steelDark, 42.35, g.y, g.z0, g.y + 2.2, g.z1);

  const gx0 = 41.7;
  const gx1 = 43.05;
  deck(root, colliders, platforms, M.steel, gx0, -10.2, gx1, 10.2, g.y, 0.22);
  slab(root, colliders, M.steelDark, gx0, g.y, -10.2, gx0 + rt, g.y + rh, g.z0);
  slab(root, colliders, M.steelDark, gx0, g.y, g.z1, gx0 + rt, g.y + rh, 10.2);
  slab(root, colliders, M.steelDark, gx1 - rt, g.y, -10.2, gx1, g.y + rh, 10.2);
  pipe(root, colliders, M.steelDark, 'y', 1.15, g.y, 43.72, 10.0, 0.12);
  pipe(root, colliders, M.steelDark, 'y', 1.15, g.y, 43.72, -10.0, 0.12);
  pipe(root, colliders, M.steelDark, 'y', 1.15, g.y, 43.72, 0.0, 0.12);
}

function hoop(root, colliders, mat, x, y0, z0, y1, z1) {
  const t = 0.28;
  slab(root, colliders, mat, x, y0, z0, x + t, y1, z0 + 0.22);
  slab(root, colliders, mat, x, y0, z1 - 0.22, x + t, y1, z1);
  slab(root, colliders, mat, x, y1 - 0.22, z0, x + t, y1, z1);
}

function buildHopper(root, colliders, platforms, M) {
  const h = L.hopper;
  const t = 0.4;
  slab(root, colliders, M.boneViolet, h.x0, h.y0, h.z0, h.x1, h.y1, h.z0 + t);
  slab(root, colliders, M.boneViolet, h.x0, h.y0, h.z1 - t, h.x1, h.y1, h.z1);
  slab(root, colliders, M.boneViolet, h.x1 - t, h.y0, h.z0, h.x1, h.y1, h.z1);
  slab(root, colliders, M.boneViolet, h.x0, h.y0, h.z0, h.x0 + t, h.y1, -1.2);
  slab(root, colliders, M.boneViolet, h.x0, h.y0, 1.2, h.x0 + t, h.y1, h.z1);
  slab(root, colliders, M.litter, h.x0, h.y0, h.z0, h.x1, h.y0 + 0.35, h.z1);

  const lip = 1.15;
  slab(root, colliders, M.steelDark, h.x0, 0, h.z0, h.x1, lip, h.z0 + 0.45);
  slab(root, colliders, M.steelDark, h.x0, 0, h.z1 - 0.45, h.x1, lip, h.z1);
  slab(root, colliders, M.steelDark, h.x1 - 0.45, 0, h.z0, h.x1, lip, h.z1);
  slab(root, colliders, M.steelDark, h.x0, 0, h.z0, h.x0 + 0.45, lip, -1.2);
  slab(root, colliders, M.steelDark, h.x0, 0, 1.2, h.x0 + 0.45, lip, h.z1);
  decal(root, colliders, M.rust, h.x0, lip - 0.1, h.z0 - 0.05, h.x1, lip + 0.05, h.z0 + 0.5);
  decal(root, colliders, M.rust, h.x0, lip - 0.1, h.z1 - 0.5, h.x1, lip + 0.05, h.z1 + 0.05);
  decal(root, colliders, M.rust, h.x1 - 0.5, lip - 0.1, h.z0, h.x1 + 0.05, lip + 0.05, h.z1);
  decal(root, colliders, M.safety, h.x0 + 0.5, lip + 0.01, h.z1 - 0.42, h.x1 - 0.5, lip + 0.05, h.z1 - 0.08);

  slab(root, colliders, M.rust, h.x0 - 3.2, 0.15, -0.9, h.x0 + 0.05, 1.35, -0.55);
  slab(root, colliders, M.rust, h.x0 - 3.2, 0.15, 0.55, h.x0 + 0.05, 1.35, 0.9);
  slab(root, colliders, M.rust, h.x0 - 3.2, 0.15, -0.9, h.x0 - 2.85, 1.35, 0.9);

  deck(root, colliders, platforms, M.steel, h.x0 + 0.5, 9.15, h.x1 - 0.5, 11.35, -3.15, 0.18);
  slab(root, colliders, M.steelDark, h.x0 + 0.5, -3.15, 11.25, h.x0 + 2.1, 1.15, 11.55);
  slab(root, colliders, M.steelDark, h.x0 + 0.5, -1.1, 10.55, h.x0 + 2.1, -0.55, 11.25);
  slab(root, colliders, M.steelDark, h.x0 + 0.5, 0.05, 9.85, h.x0 + 2.1, 0.55, 10.55);
}

function buildDock(root, colliders, platforms, M) {
  const d = L.dock;
  deck(root, colliders, platforms, M.bone, d.x0, d.z0, d.x1, d.z1, d.h);
  slab(root, colliders, M.bone, d.x0, 0, d.z0, d.x0 + 0.4, d.h, d.z1);
  slab(root, colliders, M.bone, d.x1 - 0.4, 0, d.z0, d.x1, d.h, d.z1);
  slab(root, colliders, M.bone, d.x0, 0, d.z1 - 0.4, d.x1, d.h, d.z1);
  slab(root, colliders, M.bone, d.x0, 0, d.z0, d.x0 + 1.6, 0.9, d.z0 + 1.4);
  deck(root, colliders, platforms, M.bone, d.x0 + 0.2, d.z0, d.x1 - 0.2, d.z1 - 0.15, 5.35, 0.2);
  pipe(root, colliders, M.bone, 'y', d.h, 5.35, d.x0 + 0.55, d.z1 - 0.7, 0.12);
  pipe(root, colliders, M.bone, 'y', d.h, 5.35, d.x1 - 0.55, d.z1 - 0.7, 0.12);
  pipe(root, colliders, M.bone, 'y', d.h, 5.35, d.x0 + 0.55, d.z0 + 0.7, 0.12);
  pipe(root, colliders, M.bone, 'y', d.h, 5.35, d.x1 - 0.55, d.z0 + 0.7, 0.12);
}

function buildWires(root, colliders, M) {
  const x = 50;
  const y = 8;
  for (let z = -24; z <= 24; z += 8) {
    slab(root, colliders, M.steelDark, x - 0.12, 0, z - 0.12, x + 0.12, y + 0.3, z + 0.12, {
      kind: 'pole',
    });
  }
  for (const dx of [-0.35, 0, 0.35]) {
    slab(root, colliders, M.steel, x + dx - 0.04, y - 0.04, -24, x + dx + 0.04, y + 0.04, 24, {
      kind: 'pole',
    });
  }
}
