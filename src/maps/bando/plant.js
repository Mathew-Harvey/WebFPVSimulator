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
import { PAL } from './palette.js';
import { flat } from './cel/toon.js';

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
  const highSlots = [
    { y0: 16, y1: 18.4 },
    { y0: 32, y1: 34.4 },
    { y0: 48, y1: 50.4 },
  ];
  const southSlots = [{ y0: 0, y1: 3.4 }, ...highSlots];

  slottedFace(root, colliders, M.stack, cx - ho, 0, cz + hi, cx + ho, h, cz + ho, highSlots, 'x', cx - 0.9, cx + 0.9);
  slottedFace(root, colliders, M.stack, cx - ho, 0, cz - ho, cx + ho, h, cz - hi, southSlots, 'x', cx - 0.9, cx + 0.9);

  slab(root, colliders, M.stack, cx - ho, 0, cz - hi, cx - hi, h, cz + hi);
  slab(root, colliders, M.stack, cx + hi, 0, cz - hi, cx + ho, kilnY0, cz + hi);
  slab(root, colliders, M.stack, cx + hi, kilnY1, cz - hi, cx + ho, h, cz + hi);

  slab(root, colliders, M.stackSun, cx - hi, 0, cz - hi, cx + hi, 0.45, cz + hi);

  const plinth = 1.35;
  slab(root, colliders, M.bone, cx - ho - plinth, 0, cz + ho, cx + ho + plinth, 1.45, cz + ho + plinth);
  slab(root, colliders, M.bone, cx - ho - plinth, 0, cz - ho - plinth, cx - 0.95, 1.45, cz - ho);
  slab(root, colliders, M.bone, cx + 0.95, 0, cz - ho - plinth, cx + ho + plinth, 1.45, cz - ho);
  slab(root, colliders, M.bone, cx + ho, 0, cz - ho, cx + ho + plinth, 1.45, cz + ho);
  slab(root, colliders, M.bone, cx - ho - plinth, 0, cz - ho, cx - ho, 1.45, cz + ho);
  decal(root, colliders, M.rust, cx - ho - plinth, 1.3, cz + ho, cx + ho + plinth, 1.5, cz + ho + plinth);
  decal(root, colliders, M.inkFlat, cx - 1.1, 0.5, cz - ho - 0.08, cx + 1.1, 3.1, cz - ho);
  decal(root, colliders, M.safety, cx - 0.55, 2.1, cz + ho, cx + 0.55, 5.8, cz + ho + 0.08);

  const walks = [15.85, 31.85, 42, 47.85, 54];
  const deep = 1.6;
  const rail = 0.10;
  const rh = 0.85;
  for (const y of walks) {
    deck(root, colliders, platforms, M.steel, cx - 3.4, cz + ho, cx + 3.4, cz + ho + deep, y, 0.18);
    slab(root, colliders, M.steelDark, cx - 3.4, y, cz + ho + deep - rail, cx + 3.4, y + rh, cz + ho + deep);
    deck(root, colliders, platforms, M.steel, cx - 3.4, cz - ho - deep, cx + 3.4, cz - ho, y, 0.18);
    slab(root, colliders, M.steelDark, cx - 3.4, y, cz - ho - deep, cx + 3.4, y + rh, cz - ho - deep + rail);
    deck(root, colliders, platforms, M.steel, cx + ho, cz - ho, cx + ho + deep, cz + ho, y, 0.18);
    slab(root, colliders, M.steelDark, cx + ho + deep - rail, y, cz - ho, cx + ho + deep, y + rh, cz + ho);
    deck(root, colliders, platforms, M.steel, cx - ho - deep, cz - ho, cx - ho, cz + ho, y, 0.18);
    slab(root, colliders, M.steelDark, cx - ho - deep, y, cz - ho, cx - ho - deep + rail, y + rh, cz + ho);
  }

  pipe(root, colliders, M.steelDark, 'y', 0, 54.2, cx - 0.42, cz + ho + deep + 0.14, 0.07);
  pipe(root, colliders, M.steelDark, 'y', 0, 54.2, cx + 0.42, cz + ho + deep + 0.14, 0.07);

  for (const y of [16, 32, 48]) {
    deck(root, colliders, platforms, M.steelDark, cx - 1.0, cz + hi - 0.42, cx + 1.0, cz + hi, y, 0.12);
    deck(root, colliders, platforms, M.steelDark, cx - 1.0, cz - hi, cx + 1.0, cz - hi + 0.42, y, 0.12);
  }

  const bands = [
    { y0: 35.6, y1: 37.4, mat: M.bandWhite },
    { y0: 37.4, y1: 39.2, mat: M.bandRed },
    { y0: 39.2, y1: 41.0, mat: M.bandWhite },
  ];
  const lip = 0.06;
  for (const b of bands) {
    const o = ho + lip;
    slab(root, colliders, b.mat, cx - o, b.y0, cz + ho, cx + o, b.y1, cz + o, {
      solid: false, cast: false,
    });
    slab(root, colliders, b.mat, cx - o, b.y0, cz - o, cx + o, b.y1, cz - ho, {
      solid: false, cast: false,
    });
    slab(root, colliders, b.mat, cx + ho, b.y0, cz - ho, cx + o, b.y1, cz + ho, {
      solid: false, cast: false,
    });
    slab(root, colliders, b.mat, cx - o, b.y0, cz - ho, cx - ho, b.y1, cz + ho, {
      solid: false, cast: false,
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

  stackSmog(root, cx, cz, h);
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
  const ux = uniqueSorted(xs);
  const uy = uniqueSorted(ys);
  for (let i = 0; i < ux.length - 1; i += 1) {
    for (let j = 0; j < uy.length - 1; j += 1) {
      const xa = ux[i];
      const xb = ux[i + 1];
      const ya = uy[j];
      const yb = uy[j + 1];
      if (xb - xa < 0.04 || yb - ya < 0.04) {
        continue;
      }
      const mx = (xa + xb) * 0.5;
      const my = (ya + yb) * 0.5;
      if (mx < x0 || mx > x1 || my < y0 || my > y1) {
        continue;
      }
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
  const x0 = L.stack.cx + L.stack.inner * 0.5 + L.stack.wall;
  const x1 = L.kiln.x1;

  const lip = x1 + wall;
  slab(root, colliders, M.kiln, x0, y0 - wall, -ho, lip, y0, ho);
  slab(root, colliders, M.kiln, x0, y1, -ho, lip, y1 + wall, ho);
  platforms.push({ x0, z0: -ho, x1: lip, z1: ho, top: y0, thick: wall });

  const hatches = [
    { x0: -20.7, x1: -19.2, y0: 9.05, y1: 10.65 },
    { x0: 3.2, x1: 4.7, y0: 9.05, y1: 10.65 },
  ];
  wallWithHolesX(root, colliders, M.kiln, x0, x1, y0, y1, hi, ho, hatches);
  wallWithHolesX(root, colliders, M.kiln, x0, x1, y0, y1, -ho, -hi, [hatches[0]]);

  /* East mouth is the bore, not a framed window. A sill and a 2.2 m
   * choke were a crash you could not see from inside the tube. */
  slab(root, colliders, M.kiln, x1, y0, -ho, x1 + wall, y1, -hi);
  slab(root, colliders, M.kiln, x1, y0, hi, x1 + wall, y1, ho);

  for (let x = x0 + 5; x < x1 - 2; x += 8) {
    if (x > L.pack.x0 - 0.8 && x < L.pack.x1 + 0.8) {
      continue;
    }
    slab(root, colliders, M.bone, x - 0.55, 0, ho + 0.15, x + 0.55, y0 - wall, ho + 1.15);
    slab(root, colliders, M.bone, x - 0.55, 0, -ho - 1.15, x + 0.55, y0 - wall, -ho - 0.15);
    slab(root, colliders, M.rust, x - 0.7, y0 - wall, ho + 0.08, x + 0.7, 7.92, ho + 0.62);
    slab(root, colliders, M.rust, x - 0.7, y0 - wall, -ho - 0.62, x + 0.7, 7.92, -ho - 0.08);
  }

  slab(root, colliders, M.steel, -43.8, 1.45, -0.65, -28, 2.25, 0.65);
  for (const x of [-40, -34]) {
    slab(root, colliders, M.bone, x - 0.25, 0, -0.75, x + 0.25, 1.45, 0.75);
  }

  decal(root, colliders, M.rust, x0 + 0.4, y0, -0.45, x1 - 0.2, y0 + 0.08, 0.45);
  decal(root, colliders, M.safety, -20.75, 9.0, ho, -19.15, 9.12, ho + 0.06);
  decal(root, colliders, M.safety, 3.15, 9.0, ho, 4.75, 9.12, ho + 0.06);

  slab(root, colliders, M.steel, lip, y0 - 0.28, -ho, lip + 0.42, y1 + 0.28, -hi);
  slab(root, colliders, M.steel, lip, y0 - 0.28, hi, lip + 0.42, y1 + 0.28, ho);
  slab(root, colliders, M.steel, lip, y1, -hi, lip + 0.42, y1 + 0.28, hi);
  slab(root, colliders, M.steel, lip, y0 - 0.28, -hi, lip + 0.42, y0, hi);

  kilnStripe(root, colliders, M, x0 + 2, x0 + 2.7, y0, y1, ho);
  kilnStripe(root, colliders, M, x0 + 12, x0 + 12.5, y0, y1, ho);
  kilnStripe(root, colliders, M, x0 + 28, x0 + 28.5, y0, y1, ho);
  kilnStripe(root, colliders, M, x1 - 4.2, x1 - 3.4, y0, y1, ho);

  /* Inner collars. Camera for kiln-bore.png sits at x about -8 looking
   * east, so the first hoop in that look is well down the tube. bandRed
   * is unlit, so a ceiling band still reads rust instead of crushing to
   * mauve. Paint only. */
  for (const x of [-28.0, -16.0, -6.0, 4.0, 14.0]) {
    wrapKiln(root, colliders, M.bandRed, x, y0, y1, hi);
  }

  const gs = L.gantrySouth;
  deck(root, colliders, platforms, M.steel, 28, gs.z0, 31.5, gs.z1, 11.0, 0.22);
  deck(root, colliders, platforms, M.steel, 29.7, gs.z0, 33.2, gs.z1, 13.5, 0.22);
  slab(root, colliders, M.steelDark, 28, 0, gs.z0, 28.22, 10.78, gs.z0 + 0.2);
  slab(root, colliders, M.steelDark, 28, 0, gs.z1 - 0.2, 28.22, 10.78, gs.z1);

  slab(root, colliders, M.steelDark, 25.2, 0, -7.85, 28, 0.3, -7, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, 25.2, 0.3, -7.85, 25.5, 1.7, -7, { kind: 'obstacle' });
  slab(root, colliders, M.steelDark, 27.7, 0.3, -7.85, 28, 1.4, -7, { kind: 'obstacle' });
}

function buildPreheater(root, colliders, platforms, M) {
  const { x0, x1, z0, z1, h, rise } = L.pre;
  const t = 0.4;
  const floors = [];
  for (let y = rise; y < h; y += rise) {
    floors.push(y);
  }
  slab(root, colliders, M.boneViolet, x0, 0, z0 + t, x0 + t, h, z1 - t);
  const eastHatch = [
    { z0: -18.4, z1: -15.2, y0: 6.2, y1: 9.4 },
    { z0: -18.4, z1: -15.2, y0: 18.2, y1: 21.4 },
    { z0: -13.6, z1: -10.6, y0: 30.2, y1: 33.4 },
  ];
  hatchWall(root, colliders, M.boneViolet, x1 - t, 0, z0 + t, x1, h, z1 - t, eastHatch);
  const ductHalf = DUCT_IN * 0.5;
  wallWithHolesX(root, colliders, M.boneViolet, x0, x1, 0, h, z0, z0 + t, [
    { x0: CYC[1].cx - ductHalf, x1: CYC[1].cx + ductHalf, y0: DUCT_Y, y1: DUCT_Y + DUCT_IN },
  ]);

  let yCursor = 0;
  const southOpen = 3.4;
  const southLeft = x0 + (x1 - x0 - southOpen) * 0.5;
  const southRight = x1 - (x1 - x0 - southOpen) * 0.5;
  for (const y of [...floors, h]) {
    const bandTop = Math.min(y, h);
    if (bandTop > yCursor + 0.05) {
      slab(root, colliders, M.bone, x0, yCursor, z1 - t, southLeft, bandTop, z1);
      slab(root, colliders, M.bone, southRight, yCursor, z1 - t, x1, bandTop, z1);
    }
    yCursor = y;
  }

  let flip = 0;
  for (const y of floors) {
    const hole = 1.7;
    const hx0 = flip ? x0 + t + 0.3 : x1 - t - 0.3 - hole;
    const hz0 = flip ? z0 + t + 0.3 : z1 - t - 0.3 - hole;
    const hx1 = hx0 + hole;
    const hz1 = hz0 + hole;
    roofRect(root, colliders, platforms, M.boneSun, x0 + t, z0 + t, x1 - t, z1 - t, y, hx0, hz0, hx1, hz1);
    decal(root, colliders, M.well, hx0, y - 0.04, hz0, hx1, y + 0.02, hz1);
    decal(root, colliders, M.safety, hx0, y + 0.02, hz0, hx1, y + 0.06, hz0 + 0.12);
    const below = y - rise;
    if (below >= 0) {
      decal(root, colliders, M.boneSun, hx0 - 0.35, below + 0.03, hz0 - 0.35, hx1 + 0.35, below + 0.09, hz1 + 0.35);
    }
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
      solid: false, cast: false,
    });
    slab(root, colliders, b.mat, x0 - 0.06, b.y0, z1 - 0.08, x1 + 0.06, b.y1, z1 + 0.06, {
      solid: false, cast: false,
    });
  }

  riser(root, colliders, M, -9.72, -20.2, 3.2, 36.4);
  riser(root, colliders, M, -9.72, -14.4, 8.0, 28.6);
  slab(root, colliders, M.steelDark, -43.7, 27.85, -16.25, -22.05, 28.25, -15.95, { kind: 'pole' });

  const d = 0.08;
  const skin = { solid: false, cast: false, noShadow: true };
  slab(root, colliders, M.boneSun, x0 + t, 0.02, z0 + t, x0 + t + d, h - 0.2, z1 - t, skin);
  hatchWall(root, colliders, M.boneSun, x1 - t - d, 0.02, z0 + t, x1 - t, h - 0.2, z1 - t, eastHatch, skin);
  slab(root, colliders, M.boneSun, x0 + t, 0.02, z0 + t, x1 - t, h - 0.2, z0 + t + d, skin);
  slab(root, colliders, M.boneSun, x0 + t, 0.02, z1 - t - d, southLeft, h - 0.2, z1 - t, skin);
  slab(root, colliders, M.boneSun, southRight, 0.02, z1 - t - d, x1 - t, h - 0.2, z1 - t, skin);
  decal(root, colliders, M.well, southLeft, 0.03, z1 - t - 0.02, southRight, 0.09, z1 - 0.02);
  decal(root, colliders, M.rust, southLeft + 0.2, 0.04, z1 - t - 4.2, southRight - 0.2, 0.1, z1 - t - 0.2);
  decal(root, colliders, M.pool, southLeft + 0.4, 0.05, z1 - t - 7.6, southRight - 0.4, 0.11, z1 - t - 3.4);
  decal(root, colliders, M.safety, southLeft, 0.2, z1, southLeft + 0.12, h - 0.4, z1 + 0.08);
  decal(root, colliders, M.safety, southRight - 0.12, 0.2, z1, southRight, h - 0.4, z1 + 0.08);
  decal(root, colliders, M.bone, x0 + t, 0, z0 + t, x1 - t, 2.4, z0 + t + 0.06);
  decal(root, colliders, M.inkFlat, x0 + t + 0.10, 3.0, -20.4, x0 + t + 0.16, 13.8, -12.6);
  decal(root, colliders, M.inkFlat, x0 + t + 0.10, 0.9, -17.8, x0 + t + 0.16, 4.8, -11.2);
  /* Proud of the ink so a south-mouth floor look still sees a yellow
   * plate on the west face, not a card buried in the slab. */
  decal(root, colliders, M.safety, x0 + t + 0.18, 1.8, -16.8, x0 + t + 0.24, 4.4, -14.2);
  decal(root, colliders, M.rust, x0 + t + 0.10, 6.2, -18.8, x0 + t + 0.16, 12.4, -15.0);
  decal(root, colliders, M.rust, x1 - t - 0.16, 5.2, -15.4, x1 - t - 0.10, 6.2, -13.8);
  decal(root, colliders, M.rust, x1 - t - 0.16, 6.35, -12.85, x1 - t - 0.10, 10.1, -12.45);
  decal(root, colliders, M.rust, x1 - t - 0.16, 6.5, -12.25, x1 - t - 0.10, 8.6, -12.02);
  decal(root, colliders, M.inkFlat, x1 - t - 0.16, 7.2, -12.95, x1 - t - 0.10, 9.6, -12.72);
  decal(root, colliders, M.pool, x1 - t - 4.6, 6.04, -15.6, x1 - t - 0.28, 6.10, -11.4);
  decal(root, colliders, M.safety, x1 - t - 0.18, 6.2, -18.4, x1 - t - 0.10, 9.4, -18.28);
  decal(root, colliders, M.safety, x1 - t - 0.18, 6.2, -15.32, x1 - t - 0.10, 9.4, -15.2);
  decal(root, colliders, M.safety, x1 - t - 0.18, 6.2, -18.4, x1 - t - 0.10, 6.32, -15.2);
  decal(root, colliders, M.safety, x1 - t - 0.18, 9.28, -18.4, x1 - t - 0.10, 9.4, -15.2);
  decal(root, colliders, M.safety, x0 + t, 8.4, z1 - t - 0.08, x0 + t + 0.1, 14.6, z1 - t);
  decal(root, colliders, M.well, x0 + t + 1.4, 0.04, z0 + t + 1.2, x1 - t - 1.4, 0.1, z0 + t + 3.6);
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
  const hole = DUCT_IN * 0.5;

  for (let i = 0; i < CYC.length; i += 1) {
    const { cx, cz } = CYC[i];
    const east = { z0: cz - hole, z1: cz + hole, y0: ductZ0, y1: ductZ1 };
    const west = { z0: cz - hole, z1: cz + hole, y0: ductZ0, y1: ductZ1 };
    const south = i === 1
      ? { x0: cx - hole, x1: cx + hole, y0: ductZ0, y1: ductZ1 }
      : { x0: cx - 0.71, x1: cx + 0.71, y0: 3.05, y1: 4.65 };

    slab(root, colliders, M.boneViolet, cx - half, yBody0, cz - half, cx + half, yBody1, cz - half + t);
    wallWithHolesX(root, colliders, M.boneViolet, cx - half, cx + half, yBody0, yBody1, cz + half - t, cz + half, [
      { x0: south.x0, x1: south.x1, y0: south.y0, y1: south.y1 },
    ]);
    hatchWall(root, colliders, M.boneViolet, cx + half - t, yBody0, cz - half + t, cx + half, yBody1, cz + half - t, [
      { z0: east.z0, z1: east.z1, y0: east.y0, y1: east.y1 },
    ]);
    hatchWall(root, colliders, M.boneViolet, cx - half, yBody0, cz - half + t, cx - half + t, yBody1, cz + half - t, [
      { z0: west.z0, z1: west.z1, y0: west.y0, y1: west.y1 },
    ]);

    slab(root, colliders, M.rust, cx - 0.45, 0.2, cz - 0.45, cx + 0.45, 1.15, cz + 0.45);
    slab(root, colliders, M.rust, cx - 0.85, 1.15, cz - 0.85, cx + 0.85, 1.95, cz + 0.85);
    slab(root, colliders, M.rust, cx - 1.2, 1.95, cz - 1.2, cx + 1.2, yBody0, cz + 1.2);
    wrapSquare(root, colliders, M.bandRed, cx, cz, 7.2, CYC_R + 0.1, 0.42);
    binDigit(root, i + 1, cx, cz, CYC_R, 5.4);

    const d = 0.08;
    const skin = { solid: false, cast: false, noShadow: true };
    slab(root, colliders, M.boneSun, cx - half + t, yBody0, cz - half + t, cx - half + t + d, yBody1, cz + half - t, skin);
    slab(root, colliders, M.boneSun, cx + half - t - d, yBody0, cz - half + t, cx + half - t, yBody1, cz + half - t, skin);
    slab(root, colliders, M.boneSun, cx - half + t, yBody0, cz - half + t, cx + half - t, yBody1, cz - half + t + d, skin);
    slab(root, colliders, M.boneSun, cx - half + t, yBody0, cz + half - t - d, cx + half - t, yBody1, cz + half - t, skin);
    decal(root, colliders, M.well, cx - 0.55, yBody0 + 0.02, cz - 0.55, cx + 0.55, yBody0 + 0.08, cz + 0.55);
  }

  const r = CYC_R;
  ductX(root, colliders, platforms, M.steel, CYC[0].cx + r, CYC[1].cx - r, DUCT_Y, CYC[0].cz, DUCT_IN);
  ductX(root, colliders, platforms, M.steel, CYC[1].cx + r, CYC[2].cx - r, DUCT_Y, CYC[0].cz, DUCT_IN);
  ductZ(root, colliders, platforms, M.steel, CYC[1].cz + r, L.pre.z0, DUCT_Y, CYC[1].cx, DUCT_IN);
  ductDress(root, colliders, M, CYC[0].cx + r, CYC[2].cx - r, DUCT_Y, CYC[0].cz, DUCT_IN, 'x');
  ductDress(root, colliders, M, CYC[1].cz + r, L.pre.z0, DUCT_Y, CYC[1].cx, DUCT_IN, 'z');
}

function buildSkybridge(root, colliders, platforms, M) {
  const y = 42;
  const w = 1.22;
  const zA = -15.55;
  const zB = zA + w;
  const xE = -22.0;
  const xW = L.stack.cx + L.stack.inner * 0.5 + L.stack.wall + 1.6;
  deck(root, colliders, platforms, M.steel, xW, zA, xE, zB, y, 0.18);
  slab(root, colliders, M.steelDark, xW, y, zA, xE, y + 0.74, zA + 0.1);
  slab(root, colliders, M.steelDark, xW, y, zB - 0.1, xE, y + 0.74, zB);
  deck(root, colliders, platforms, M.steel, xW, zB, xW + w, 2.25, y, 0.18);
  slab(root, colliders, M.steelDark, xW, y, zB, xW + 0.1, y + 0.74, 2.25);
  slab(root, colliders, M.steelDark, xW + w - 0.1, y, zB, xW + w, y + 0.74, 2.25);
  const posts = [
    [xE - 0.45, -14.94],
    [-32.4, -14.94],
    [xW + 0.6, -14.94],
    [xW + 0.6, -6.2],
    [xW + 0.6, 0.4],
  ];
  for (const [px, pz] of posts) {
    pipe(root, colliders, M.steelDark, 'y', 16, 41.82, px, pz, 0.11);
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
    const groundDoor = { z0: cz - 0.75, z1: cz + 0.75, y0: 0.4, y1: 2.35 };
    const galleryDoor = h > 16.5
      ? { z0: cz - 0.71, z1: cz + 0.71, y0: 15.25, y1: 17.05 }
      : null;
    const eastHoles = [groundDoor];
    if (galleryDoor) {
      eastHoles.push(galleryDoor);
    }

    slab(root, colliders, M.silo, cx - R, 0.02, cz + R - t, cx + R, h, cz + R);
    slab(root, colliders, M.silo, cx - R, 0.02, cz - R, cx + R, h, cz - R + t);
    slab(root, colliders, M.silo, cx - R, 0.02, cz - R + t, cx - R + t, h, cz + R - t);
    hatchWall(root, colliders, M.silo, cx + R - t, 0.02, cz - R + t, cx + R, h, cz + R - t, eastHoles);

    slab(root, colliders, M.bone, cx - R + t + 0.05, 0, cz - R + t + 0.05, cx + R - t - 0.05, 0.38, cz + R - t - 0.05);
    pipe(root, colliders, M.steelDark, 'y', 0.38, h - 0.3, cx, cz, 0.22);

    const hh = hatch * 0.5;
    roofRect(
      root, colliders, platforms, M.boneSun,
      cx - R + t, cz - R + t, cx + R - t, cz + R - t, h,
      cx + 0.55, cz - hh, cx + 0.55 + hatch, cz + hh,
    );

    if (i !== 1) {
      wrapSquare(root, colliders, M.rust, cx, cz, h * 0.62, R + 0.08, 0.55);
    }
    if (h > 16.5) {
      pipe(root, colliders, M.steel, 'y', 16, h + 0.15, 43.38, cz, 0.16);
    }
    slab(root, colliders, M.ochre, cx + R, 0, cz - 1.1, cx + R + 0.55, 1.5, cz + 1.1, {
      kind: 'obstacle',
    });
    decal(root, colliders, M.rust, cx - R - 0.02, 14.4, cz - 1.7, cx - R, 17.8, cz + 1.7);
    decal(root, colliders, M.inkFlat, cx - R - 0.02, 8.2, cz - 1.1, cx - R, 12.4, cz + 0.4);
    binLadder(root, colliders, M, cx, cz, R, h);
    binDigit(root, i + 1, cx, cz, R, h * 0.55);
  }
  const splitZ0 = zs[1] + R;
  const splitZ1 = zs[2] - R;
  decal(root, colliders, M.rust, 32.0, 16.9, splitZ0 - 0.02, 32.55, 19.4, splitZ0 + 0.01);
  decal(root, colliders, M.rust, 35.2, 17.1, splitZ0 - 0.02, 35.55, 18.8, splitZ0 + 0.01);
  decal(root, colliders, M.inkFlat, 36.6, 16.8, splitZ0 - 0.02, 37.8, 19.2, splitZ0 + 0.01);
  decal(root, colliders, M.rust, 32.4, 16.9, splitZ1 - 0.01, 32.95, 19.6, splitZ1 + 0.02);
  decal(root, colliders, M.rust, 35.8, 17.0, splitZ1 - 0.01, 36.15, 18.6, splitZ1 + 0.02);
  decal(root, colliders, M.inkFlat, 37.2, 16.8, splitZ1 - 0.01, 38.4, 19.4, splitZ1 + 0.02);
}

function binLadder(root, colliders, M, cx, cz, R, h) {
  const x0 = cx - R - 0.32;
  const x1 = cx - R;
  slab(root, colliders, M.steelDark, x0, 0, cz - 0.22, x0 + 0.08, h - 0.4, cz + 0.22, { kind: 'pole' });
  slab(root, colliders, M.steelDark, x1 - 0.08, 0, cz - 0.22, x1, h - 0.4, cz + 0.22, { kind: 'pole' });
  for (let y = 0.4; y < h - 0.6; y += 0.5) {
    if (y > 15.65 && y < 16.25) {
      continue;
    }
    slab(root, colliders, M.steel, x0 + 0.08, y, cz - 0.2, x1 - 0.08, y + 0.07, cz + 0.2, { kind: 'pole' });
  }
}

function binDigit(root, n, cx, cz, R, y) {
  const rust = `#${PAL.rust.toString(16).padStart(6, '0')}`;
  const ink = `#${PAL.ink.toString(16).padStart(6, '0')}`;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 160;
  const c = cv.getContext('2d');
  c.fillStyle = ink;
  c.fillRect(8, 8, 112, 144);
  c.fillStyle = rust;
  if (n === 1) {
    c.fillRect(56, 24, 22, 112);
  } else if (n === 2) {
    c.fillRect(28, 24, 72, 22);
    c.fillRect(78, 46, 22, 40);
    c.fillRect(28, 78, 72, 22);
    c.fillRect(28, 100, 22, 36);
    c.fillRect(28, 114, 72, 22);
  } else {
    c.fillRect(28, 24, 72, 22);
    c.fillRect(78, 46, 22, 88);
    c.fillRect(28, 78, 56, 22);
    c.fillRect(28, 114, 72, 22);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const mat = flat({
    map: tex, transparent: true, alphaTest: 0.12, fog: true, cache: false, depthWrite: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.8), mat);
  mesh.position.set(cx, y, cz + R + 0.08);
  mesh.userData.noMerge = true;
  mesh.userData.noShadow = true;
  mesh.castShadow = false;
  root.add(mesh);
}

function buildGantry(root, colliders, platforms, M) {
  const rt = 0.10;
  const rh = 0.82;
  const gx0 = 41.6;
  const gx1 = 43.22;
  for (const g of [L.gantry, L.gantrySouth]) {
    deck(root, colliders, platforms, M.steel, g.x0, g.z0, g.x1, g.z1, g.y, 0.22);
    for (const x of [30.2, 34.4, 38.4]) {
      hoop(root, colliders, M.steelDark, x, g.y, g.z0, g.y + 2.2, g.z1);
    }
    slab(root, colliders, M.steelDark, g.x0, g.y, g.z0, g.x1, g.y + rh, g.z0 + rt);
    slab(root, colliders, M.steelDark, g.x0, g.y, g.z1 - rt, g.x1, g.y + rh, g.z1);
    decal(root, colliders, M.safety, g.x0 + 0.4, g.y + 0.01, g.z0 + 0.12, g.x1 - 0.4, g.y + 0.05, g.z0 + 0.28);
    decal(root, colliders, M.safety, g.x0 + 0.4, g.y + 0.01, g.z1 - 0.28, g.x1 - 0.4, g.y + 0.05, g.z1 - 0.12);
    deck(root, colliders, platforms, M.steel, g.x1, g.z0, gx0, g.z1, g.y, 0.22);
    slab(root, colliders, M.steelDark, g.x1, g.y, g.z0, gx0, g.y + rh, g.z0 + rt);
    slab(root, colliders, M.steelDark, g.x1, g.y, g.z1 - rt, gx0, g.y + rh, g.z1);
    hoop(root, colliders, M.steelDark, 42.19, g.y, g.z0, g.y + 2.2, g.z1);
  }

  const gy = L.gantry.y;
  deck(root, colliders, platforms, M.steel, gx0, -10.2, gx1, 10.2, gy, 0.22);
  const westGaps = [
    { z0: L.gantrySouth.z0, z1: L.gantrySouth.z1, y0: gy, y1: gy + rh },
    { z0: L.gantry.z0, z1: L.gantry.z1, y0: gy, y1: gy + rh },
  ];
  hatchWall(root, colliders, M.steelDark, gx0, gy, -10.2, gx0 + rt, gy + rh, 10.2, westGaps);
  slab(root, colliders, M.steelDark, gx1 - rt, gy, -10.2, gx1, gy + rh, 10.2);
  pipe(root, colliders, M.steelDark, 'y', 1.15, gy - 0.22, 43.72, 10.0, 0.12);
  pipe(root, colliders, M.steelDark, 'y', 1.15, gy - 0.22, 43.72, -10.0, 0.12);
  pipe(root, colliders, M.steelDark, 'y', 1.15, gy - 0.22, 43.72, 0.0, 0.12);
}

function hoop(root, colliders, mat, x, y0, z0, y1, z1) {
  const t = 0.16;
  const j = 0.08;
  const leg = y0 + 0.82;
  slab(root, colliders, mat, x, leg, z0, x + t, y1, z0 + j);
  slab(root, colliders, mat, x, leg, z1 - j, x + t, y1, z1);
  slab(root, colliders, mat, x, y1 - 0.16, z0 + j, x + t, y1, z1 - j);
}

function buildHopper(root, colliders, platforms, M) {
  const h = L.hopper;
  const t = 0.4;
  slab(root, colliders, M.boneViolet, h.x0, h.y0, h.z0, h.x1, h.y1, h.z0 + t);
  slab(root, colliders, M.boneViolet, h.x0, h.y0, h.z1 - t, h.x1, h.y1, h.z1);
  slab(root, colliders, M.boneViolet, h.x1 - t, h.y0, h.z0 + t, h.x1, h.y1, h.z1 - t);
  slab(root, colliders, M.boneViolet, h.x0, h.y0, h.z0 + t, h.x0 + t, h.y1, -1.2);
  slab(root, colliders, M.boneViolet, h.x0, h.y0, 1.2, h.x0 + t, h.y1, h.z1 - t);
  slab(root, colliders, M.litter, h.x0 + t, h.y0, h.z0 + t, h.x1 - t, h.y0 + 0.35, h.z1 - t);
  decal(root, colliders, M.rust, h.x0 + 0.5, h.y0 + 0.35, -0.35, h.x1 - 0.5, h.y0 + 0.42, 0.35);
  decal(root, colliders, M.pool, h.x0 + 0.45, h.y0 + 0.36, -1.05, h.x0 + 4.2, h.y0 + 0.44, 1.05);

  const d = 0.08;
  const skin = { solid: false, cast: false, noShadow: true };
  slab(root, colliders, M.boneSun, h.x0 + t, h.y0, h.z0 + t, h.x1 - t, h.y1 - 0.2, h.z0 + t + d, skin);
  slab(root, colliders, M.boneSun, h.x0 + t, h.y0, h.z1 - t - d, h.x1 - t, h.y1 - 0.2, h.z1 - t, skin);
  slab(root, colliders, M.boneSun, h.x1 - t - d, h.y0, h.z0 + t, h.x1 - t, h.y1 - 0.2, h.z1 - t, skin);
  slab(root, colliders, M.boneSun, h.x0 + t, h.y0, h.z0 + t, h.x0 + t + d, h.y1 - 0.2, -1.2, skin);
  slab(root, colliders, M.boneSun, h.x0 + t, h.y0, 1.2, h.x0 + t + d, h.y1 - 0.2, h.z1 - t, skin);
  decal(root, colliders, M.well, h.x0 + 0.02, h.y0 + 0.4, -1.05, h.x0 + 0.1, -0.2, 1.05);

  slab(root, colliders, M.steelDark, 32.4, -2.2, -11.6, 43.6, -1.88, -11.3);
  slab(root, colliders, M.steelDark, 32.4, -5.2, -11.6, 43.6, -4.88, -11.3);

  deck(root, colliders, platforms, M.steel, 32.5, -6.4, 35.4, -4.2, -2.0, 0.2);
  deck(root, colliders, platforms, M.steel, 33.6, -6.4, 36.6, -4.2, -4.0, 0.2);
  deck(root, colliders, platforms, M.steel, 34.8, -6.4, 37.8, -4.2, -6.0, 0.2);
  decal(root, colliders, M.safety, 32.5, -1.99, -6.4, 35.4, -1.93, -6.05);
  decal(root, colliders, M.safety, 33.6, -3.99, -6.4, 36.6, -3.93, -6.05);
  decal(root, colliders, M.safety, 34.8, -5.99, -6.4, 37.8, -5.93, -6.05);

  const lip = 1.15;
  slab(root, colliders, M.steelDark, h.x0, 0, h.z0 + t, h.x0 + 0.45, lip, -1.2);
  slab(root, colliders, M.steelDark, h.x0, 0, 1.2, h.x0 + 0.45, lip, 11.25);
  decal(root, colliders, M.safety, h.x0 + 0.02, 0.2, -1.2, h.x0 + 0.14, lip, 1.2);

  slab(root, colliders, M.rust, h.x0 - 1.6, 0.15, -1.2, h.x0 + 0.05, 1.35, -0.9);
  slab(root, colliders, M.rust, h.x0 - 1.6, 0.15, 0.9, h.x0 + 0.05, 1.35, 1.2);

  deck(root, colliders, platforms, M.steel, 32.45, 9.15, 34.4, 11.35, -3.15, 0.18);
  slab(root, colliders, M.steelDark, 32.45, -3.15, 11.25, 34.4, 1.15, 11.55);
  slab(root, colliders, M.steelDark, 32.45, -1.1, 10.55, 34.4, 0.05, 11.25);
  slab(root, colliders, M.steelDark, 32.45, 0.05, 9.85, 34.4, 0.55, 11.25);
}

function buildDock(root, colliders, platforms, M) {
  const d = L.dock;
  const thick = 0.3;
  deck(root, colliders, platforms, M.bone, d.x0, d.z0, d.x1, d.z1, d.h, thick);
  const skirt = d.h - thick;
  slab(root, colliders, M.bone, d.x0, 0, d.z0, d.x0 + 0.4, skirt, d.z1 - 0.4);
  slab(root, colliders, M.bone, d.x1 - 0.4, 0, d.z0, d.x1, skirt, d.z1 - 0.4);
  slab(root, colliders, M.bone, d.x0, 0, d.z1 - 0.4, d.x1, skirt, d.z1);
  slab(root, colliders, M.bone, d.x0 + 0.4, 0, d.z0, d.x0 + 1.6, 1.9, d.z0 + 1.4);
}

function buildWires(root, colliders, M) {
  const x = 50;
  const y = 8;
  const zs = [];
  for (let z = -24; z <= 24; z += 8) {
    zs.push(z);
    slab(root, colliders, M.steelDark, x - 0.12, 0, z - 0.12, x + 0.12, y + 0.3, z + 0.12, {
      kind: 'pole',
    });
  }
  for (const dx of [-0.35, 0, 0.35]) {
    for (let i = 1; i < zs.length; i += 1) {
      const a = zs[i - 1] + 0.14;
      const b = zs[i] - 0.14;
      slab(root, colliders, M.steel, x + dx - 0.04, y - 0.04, a, x + dx + 0.04, y + 0.04, b, {
        kind: 'pole',
      });
    }
  }
}

function wrapSquare(root, colliders, mat, cx, cz, y, R, h) {
  const y0 = y - h * 0.5;
  const y1 = y + h * 0.5;
  const o = 0.07;
  const opt = { solid: false, cast: false };
  slab(root, colliders, mat, cx - R, y0, cz + R, cx + R, y1, cz + R + o, opt);
  slab(root, colliders, mat, cx - R, y0, cz - R - o, cx + R, y1, cz - R, opt);
  slab(root, colliders, mat, cx + R, y0, cz - R, cx + R + o, y1, cz + R, opt);
  slab(root, colliders, mat, cx - R - o, y0, cz - R, cx - R, y1, cz + R, opt);
}

function ductDress(root, colliders, M, a0, a1, y0, mid, inner, axis) {
  const lo = Math.min(a0, a1);
  const hi = Math.max(a0, a1);
  const half = inner * 0.5;
  const y1 = y0 + inner;
  if (axis === 'x') {
    decal(root, colliders, M.rust, lo, y0, mid - 0.48, hi, y0 + 0.12, mid + 0.48);
    for (let x = lo + 1.4; x < hi - 0.3; x += 2.1) {
      wrapDuct(root, colliders, M.rust, x, x + 0.12, y0, y1, mid - half, mid + half);
    }
    return;
  }
  decal(root, colliders, M.rust, mid - 0.48, y0, lo, mid + 0.48, y0 + 0.12, hi);
  for (let z = lo + 1.4; z < hi - 0.3; z += 2.1) {
    wrapDuct(root, colliders, M.rust, mid - half, mid + half, y0, y1, z, z + 0.12);
  }
}

function wrapDuct(root, colliders, mat, x0, x1, y0, y1, z0, z1) {
  const opt = { solid: false, cast: false };
  const t = 0.05;
  slab(root, colliders, mat, x0, y0, z0, x1, y0 + t, z1, opt);
  slab(root, colliders, mat, x0, y1 - t, z0, x1, y1, z1, opt);
  slab(root, colliders, mat, x0, y0, z1 - t, x1, y1, z1, opt);
  slab(root, colliders, mat, x0, y0, z0, x1, y1, z0 + t, opt);
}

function hatchWall(root, colliders, mat, x0, y0, z0, x1, y1, z1, holes, opts) {
  const zs = [z0, z1];
  const ys = [y0, y1];
  for (const hole of holes) {
    zs.push(hole.z0, hole.z1);
    ys.push(hole.y0, hole.y1);
  }
  zs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const uz = uniqueSorted(zs);
  const uy = uniqueSorted(ys);
  for (let i = 0; i < uz.length - 1; i += 1) {
    for (let j = 0; j < uy.length - 1; j += 1) {
      const za = uz[i];
      const zb = uz[i + 1];
      const ya = uy[j];
      const yb = uy[j + 1];
      if (zb - za < 0.05 || yb - ya < 0.05) {
        continue;
      }
      const mz = (za + zb) * 0.5;
      const my = (ya + yb) * 0.5;
      if (mz < z0 || mz > z1 || my < y0 || my > y1) {
        continue;
      }
      if (holes.some((hole) => mz > hole.z0 && mz < hole.z1 && my > hole.y0 && my < hole.y1)) {
        continue;
      }
      slab(root, colliders, mat, x0, ya, za, x1, yb, zb, opts);
    }
  }
}

function uniqueSorted(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i += 1) {
    if (i === 0 || arr[i] - arr[i - 1] > 0.001) {
      out.push(arr[i]);
    }
  }
  return out;
}

function riser(root, colliders, M, x, z, y0, y1) {
  const r = 0.22;
  slab(root, colliders, M.steelDark, x - r, y0, z - r, x + r, y1, z + r, { kind: 'pole' });
}

function wrapKiln(root, colliders, mat, x, y0, y1, hi) {
  const opt = { solid: false, cast: false };
  const t = 0.16;
  const w = 0.32;
  slab(root, colliders, mat, x, y0, -hi, x + w, y1, -hi + t, opt);
  slab(root, colliders, mat, x, y0, hi - t, x + w, y1, hi, opt);
  slab(root, colliders, mat, x, y0, -hi, x + w, y0 + t, hi, opt);
  slab(root, colliders, mat, x, y1 - t, -hi, x + w, y1, hi, opt);
}

function kilnStripe(root, colliders, M, xa, xb, y0, y1, ho) {
  const o = ho + 0.09;
  const opt = { solid: false, cast: false };
  slab(root, colliders, M.bandWhite, xa, y0 - 0.1, ho, xb, y0 + 0.45, o, opt);
  slab(root, colliders, M.bandRed, xa, y0 + 0.45, ho, xb, y1 - 0.45, o, opt);
  slab(root, colliders, M.bandWhite, xa, y1 - 0.45, ho, xb, y1 + 0.1, o, opt);
  slab(root, colliders, M.bandWhite, xa, y0 - 0.1, -o, xb, y0 + 0.45, -ho, opt);
  slab(root, colliders, M.bandRed, xa, y0 + 0.45, -o, xb, y1 - 0.45, -ho, opt);
  slab(root, colliders, M.bandWhite, xa, y1 - 0.45, -o, xb, y1 + 0.1, -ho, opt);
}

function stackSmog(root, cx, cz, h) {
  const mat = flat({
    color: 0x8a7460,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    fog: true,
    cache: false,
    side: THREE.DoubleSide,
  });
  const cards = [
    [5, 7, 8, 24],
    [-7, 13, -5, 30],
    [3, 18, 12, 18],
  ];
  for (const [dx, dy, dz, w] of cards) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.42), mat);
    mesh.position.set(cx + dx, h + dy, cz + dz);
    mesh.lookAt(cx, h + 4, cz);
    mesh.userData.noMerge = true;
    mesh.userData.noShadow = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = -8;
    root.add(mesh);
  }
}
