/*
 * house.js: cream split-level, south porch, north deck, east garage.
 *
 * Two masses sharing a face at the split: main living west, walk-out
 * basement east. Windows are paint. The porch, deck undercroft, garage
 * mouth and the missing fence panel are the lines.
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

import { L, slab, decal, deck, gableX, punchedX } from './kit.js';

export function buildHouse(root, colliders, platforms, M) {
  const m = L.main;
  const b = L.base;
  slab(root, colliders, M.cream, m.x0, m.y0, m.z0, m.x1, m.y1, m.z1);
  slab(root, colliders, M.cream, m.x0, 0, m.z0, m.x1, m.y0, m.z1);
  slab(root, colliders, M.creamShade, b.x0, 0, b.z0, b.x1, b.h, b.z1);

  decal(root, colliders, M.creamSun, m.x0, m.y0, m.z0 - 0.04, m.x1, m.y1, m.z0);
  decal(root, colliders, M.creamSun, m.x0 - 0.04, m.y0, m.z0, m.x0, m.y1, m.z1);
  decal(root, colliders, M.asphalt, b.x0, 0, b.z0 - 0.04, b.x1, b.h, b.z0);
  /* Walk-out east is cream. Asphalt is only the garage's back wall. */
  decal(root, colliders, M.creamSun, b.x1, 0, b.z0, b.x1 + 0.04, b.h, L.garage.z0);
  decal(root, colliders, M.asphalt, b.x1, 0, L.garage.z0, b.x1 + 0.04, b.h, L.garage.z1);
  decal(root, colliders, M.asphalt, b.x1, 0, b.z0, b.x1 + 0.04, 0.36, L.garage.z0);
  decal(root, colliders, M.creamShade, m.x0, m.y0, m.z1, m.x1, m.y1, m.z1 + 0.04);

  gableX(root, colliders, platforms, M.roof, m.x0 - 0.55, m.z0 - 0.55, m.x1, m.z1 + 0.55, m.y1, m.y1 + 1.55, 3);
  gableX(root, colliders, platforms, M.roof, b.x0, b.z0 - 0.4, b.x1, b.z1 + 0.4, b.h, b.h + 0.95, 3);
  slab(root, colliders, M.steelDark, -1.1, m.y1 + 1.55, 0.4, -0.3, m.y1 + 2.85, 1.2);
  decal(root, colliders, M.woodDark, m.x0, m.y1 - 0.12, m.z0 - 0.06, m.x1, m.y1, m.z0);

  eastGarage(root, colliders, platforms, M);
  southPorch(root, colliders, platforms, M);
  northDeck(root, colliders, platforms, M);
  panes(root, colliders, M);
  doors(root, colliders, M);
}

function eastGarage(root, colliders, platforms, M) {
  const g = L.garage;
  const mouth = { z0: 0.15, z1: 3.35, y0: 0, y1: 2.28 };
  slab(root, colliders, M.cream, g.x0, 0, g.z1 - 0.22, g.x1, g.h - 0.22, g.z1);
  slab(root, colliders, M.creamShade, g.x0, 0, g.z0, g.x1, g.h - 0.22, g.z0 + 0.22);
  punchedX(
    root, colliders, M.cream, g.z0 + 0.22, 0, g.z1 - 0.22, g.h - 0.22,
    g.x1 - 0.22, g.x1,
    [mouth],
  );
  gableX(root, colliders, platforms, M.roof, g.x0, g.z0 - 0.15, g.x1 + 0.2, g.z1 + 0.2, g.h, g.h + 0.82, 3);
  decal(root, colliders, M.asphalt, g.x0 + 0.04, 0.02, g.z0 + 0.24, g.x1 - 0.24, 0.06, g.z1 - 0.24);
  decal(root, colliders, M.asphalt, g.x0 + 0.04, 0.06, g.z0 + 0.22, g.x1 - 0.24, g.h - 0.28, g.z0 + 0.28);
  decal(root, colliders, M.asphalt, g.x0 + 0.04, 0.06, g.z1 - 0.28, g.x1 - 0.24, g.h - 0.28, g.z1 - 0.22);
  decal(root, colliders, M.asphalt, g.x0 + 0.04, g.h - 0.30, g.z0 + 0.24, g.x1 - 0.22, g.h - 0.22, g.z1 - 0.24);
  decal(root, colliders, M.steelDark, g.x1, 0, mouth.z0 - 0.14, g.x1 + 0.08, mouth.y1 + 0.08, mouth.z0 + 0.08);
  decal(root, colliders, M.steelDark, g.x1, 0, mouth.z1 - 0.08, g.x1 + 0.08, mouth.y1 + 0.08, mouth.z1 + 0.14);
  decal(root, colliders, M.steelDark, g.x1, mouth.y1, mouth.z0, g.x1 + 0.08, g.h - 0.22, mouth.z1);
  decal(root, colliders, M.steel, g.x1 - 0.06, mouth.y1 - 0.38, mouth.z0 + 0.04, g.x1 + 0.04, mouth.y1, mouth.z1 - 0.04);
  decal(root, colliders, M.steelDark, g.x1 - 0.06, 0.08, mouth.z0 + 0.06, g.x1 - 0.02, mouth.y1 - 0.04, mouth.z0 + 0.12);
  decal(root, colliders, M.steelDark, g.x1 - 0.06, 0.08, mouth.z1 - 0.12, g.x1 - 0.02, mouth.y1 - 0.04, mouth.z1 - 0.06);
  lampBox(root, colliders, M, 8.7, g.h - 0.18, 1.4);
}

function southPorch(root, colliders, platforms, M) {
  const p = L.porch;
  slab(root, colliders, M.woodSun, p.x0, p.y - 0.16, p.z0, p.x1, p.y, p.z1, {
    solid: false, receive: true,
  });
  platforms.push({
    x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, top: p.y, thick: 0.16,
  });
  colliders.addBox('wall', p.x0, p.y - 0.16, p.z0, p.x1, p.y - 0.02, p.z1);
  deck(root, colliders, platforms, M.wood, p.x0 - 0.2, p.z0 - 0.22, p.x1, p.z1, p.roof, 0.16);

  const posts = [p.x0 + 0.12, -3.93, 0.95, p.x1 - 0.12];
  const zPost = p.z0 + 0.12;
  for (const x of posts) {
    slab(root, colliders, M.wood, x - 0.08, 0, zPost - 0.08, x + 0.08, p.y - 0.16, zPost + 0.08, {
      kind: 'pole',
    });
    slab(root, colliders, M.wood, x - 0.08, p.y, zPost - 0.08, x + 0.08, p.roof - 0.16, zPost + 0.08, {
      kind: 'pole',
    });
  }
  const zRail = zPost;
  slab(root, colliders, M.wood, posts[0] + 0.09, 0.96, zRail - 0.06, posts[1] - 0.09, 1.08, zRail + 0.06, {
    kind: 'pole',
  });
  slab(root, colliders, M.wood, posts[2] + 0.09, 0.96, zRail - 0.06, posts[3] - 0.09, 1.08, zRail + 0.06, {
    kind: 'pole',
  });

  const rise = p.y / 5;
  const run = 0.32;
  for (let i = 0; i < 5; i += 1) {
    const y1 = (i + 1) * rise + 0.08;
    const z0 = p.z0 - (i + 1) * run;
    const z1 = p.z0 - i * run;
    deck(root, colliders, platforms, M.wood, 0.64, z0, 1.44, z1, y1, y1 - i * rise);
  }
  lampBox(root, colliders, M, -1.5, p.roof - 0.16, (p.z0 + p.z1) * 0.5);
}

function northDeck(root, colliders, platforms, M) {
  const d = L.deck;
  deck(root, colliders, platforms, M.woodSun, d.x0, d.z0, d.x1, d.z1, d.y, d.thick);

  const xs = [d.x0 + 0.12, -2.4, -0.2, d.x1 - 0.12];
  const zs = [d.z0 + 0.08, (d.z0 + d.z1) * 0.5, d.z1 - 0.08];
  for (const x of xs) {
    for (const z of zs) {
      slab(root, colliders, M.woodDark, x - 0.08, 0, z - 0.08, x + 0.08, d.y - d.thick, z + 0.08, {
        kind: 'pole',
      });
      slab(root, colliders, M.woodDark, x - 0.08, d.y, z - 0.08, x + 0.08, d.y + 0.92, z + 0.08, {
        kind: 'pole',
      });
    }
  }

  for (let i = 0; i < xs.length - 1; i += 1) {
    const a = xs[i] + 0.09;
    const b = xs[i + 1] - 0.09;
    slab(root, colliders, M.woodDark, a, d.y, d.z1 - 0.10, b, d.y + 0.92, d.z1, {
      kind: 'pole',
    });
    decal(root, colliders, M.wood, a, d.y + 0.38, d.z1 - 0.12, b, d.y + 0.48, d.z1 + 0.02);
    decal(root, colliders, M.woodSun, a, d.y + 0.80, d.z1 - 0.12, b, d.y + 0.90, d.z1 + 0.02);
  }
  for (let i = 0; i < zs.length - 1; i += 1) {
    const a = zs[i] + 0.09;
    const b = zs[i + 1] - 0.09;
    slab(root, colliders, M.woodDark, xs[0] - 0.05, d.y, a, xs[0] + 0.05, d.y + 0.92, b, {
      kind: 'pole',
    });
    slab(root, colliders, M.woodDark, xs[3] - 0.05, d.y, a, xs[3] + 0.05, d.y + 0.92, b, {
      kind: 'pole',
    });
    decal(root, colliders, M.wood, xs[0] - 0.07, d.y + 0.38, a, xs[0] + 0.07, d.y + 0.48, b);
    decal(root, colliders, M.woodSun, xs[0] - 0.07, d.y + 0.80, a, xs[0] + 0.07, d.y + 0.90, b);
    decal(root, colliders, M.wood, xs[3] - 0.07, d.y + 0.38, a, xs[3] + 0.07, d.y + 0.48, b);
    decal(root, colliders, M.woodSun, xs[3] - 0.07, d.y + 0.80, a, xs[3] + 0.07, d.y + 0.90, b);
  }

  const rise = d.y / 6;
  const run = 0.34;
  const n = 6;
  for (let i = 0; i < n; i += 1) {
    const y0 = i === n - 1 ? d.y : i * rise;
    const y1 = (i + 1) * rise + 0.08;
    const z0 = d.z1 + (n - 1 - i) * run;
    const z1 = d.z1 + (n - i) * run;
    deck(root, colliders, platforms, M.wood, xs[0] + 0.08, z0, d.x0 + 1.15, z1, y1, y1 - y0);
  }
  lampBox(root, colliders, M, -1.6, 2.42, L.main.z1);
}

function lampBox(root, colliders, M, x, y, z) {
  slab(root, colliders, M.woodDark, x - 0.08, y - 0.16, z - 0.08, x + 0.08, y, z + 0.08, {
    solid: false, cast: false,
  });
  slab(root, colliders, M.lamp, x - 0.05, y - 0.20, z - 0.05, x + 0.05, y - 0.16, z + 0.05, {
    solid: false, cast: false,
  });
}

function panes(root, colliders, M) {
  const m = L.main;
  const b = L.base;
  const win = (x0, y0, z0, x1, y1, z1) => {
    decal(root, colliders, M.pane, x0, y0, z0, x1, y1, z1);
    decal(root, colliders, M.woodDark, x0 - 0.05, y0 - 0.06, z0, x1 + 0.05, y0, z1);
    decal(root, colliders, M.woodDark, x0 - 0.05, y1, z0, x1 + 0.05, y1 + 0.06, z1);
    decal(root, colliders, M.woodDark, x0 - 0.05, y0, z0, x0, y1, z1);
    decal(root, colliders, M.woodDark, x1, y0, z0, x1 + 0.05, y1, z1);
  };
  const shutter = (x0, y0, z0, x1, y1, z1) => {
    decal(root, colliders, M.barn, x0, y0, z0, x1, y1, z1);
  };

  win(-5.4, 1.7, m.z0 - 0.04, -3.8, 3.05, m.z0);
  win(-2.4, 1.7, m.z0 - 0.04, -0.6, 3.05, m.z0);
  win(-5.4, 3.35, m.z0 - 0.04, -3.8, 4.55, m.z0);
  win(-2.4, 3.35, m.z0 - 0.04, -0.6, 4.55, m.z0);
  shutter(-5.62, 1.7, m.z0 - 0.05, -5.42, 3.05, m.z0);
  shutter(-3.78, 1.7, m.z0 - 0.05, -3.58, 3.05, m.z0);
  shutter(-2.62, 1.7, m.z0 - 0.05, -2.42, 3.05, m.z0);
  shutter(-0.58, 1.7, m.z0 - 0.05, -0.38, 3.05, m.z0);

  win(-5.5, 1.7, m.z1, -3.7, 3.05, m.z1 + 0.04);
  win(0.2, 1.7, m.z1, 1.8, 3.05, m.z1 + 0.04);
  win(-5.5, 3.35, m.z1, -3.7, 4.55, m.z1 + 0.04);
  shutter(-5.7, 1.7, m.z1, -5.5, 3.05, m.z1 + 0.05);
  shutter(-3.68, 1.7, m.z1, -3.48, 3.05, m.z1 + 0.05);

  win(m.x0 - 0.04, 1.7, -3.2, m.x0, 3.05, -1.4);
  win(m.x0 - 0.04, 1.7, 1.4, m.x0, 3.05, 3.2);
  win(m.x0 - 0.04, 3.35, -0.8, m.x0, 4.55, 1.0);

  win(b.x1, 0.42, -4.2, b.x1 + 0.04, 1.15, -3.3);
  win(b.x1, 1.55, -0.4, b.x1 + 0.04, 2.35, 1.2);
  win(3.0, 0.42, b.z0 - 0.04, 4.4, 1.35, b.z0);
  win(5.1, 0.42, b.z0 - 0.04, 6.4, 1.35, b.z0);
  win(3.0, 1.55, b.z0 - 0.04, 4.4, 2.45, b.z0);
}

function doors(root, colliders, M) {
  const m = L.main;
  const b = L.base;
  decal(root, colliders, M.woodDark, -1.35, m.y0, m.z0 - 0.05, -0.15, m.y0 + 2.15, m.z0);
  decal(root, colliders, M.pane, -0.45, m.y0 + 0.9, m.z0 - 0.06, -0.22, m.y0 + 1.7, m.z0 - 0.01);
  decal(root, colliders, M.wood, -2.5, m.y0, m.z1, -0.5, m.y0 + 2.15, m.z1 + 0.06);
  decal(root, colliders, M.pane, -2.3, m.y0 + 0.3, m.z1 + 0.01, -0.7, m.y0 + 1.9, m.z1 + 0.07);

  /* Stoop and pent share the garage's south face and the walk-out east. */
  slab(root, colliders, M.asphalt, b.x1, 0, -2.58, b.x1 + 0.85, 0.12, L.garage.z0, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.woodDark, b.x1, 2.22, -2.58, b.x1 + 0.85, 2.34, L.garage.z0, {
    kind: 'obstacle',
  });
  decal(root, colliders, M.creamSun, b.x1, 0.12, -2.58, b.x1 + 0.05, 2.22, -1.22);
  decal(root, colliders, M.woodDark, b.x1, 0.14, -2.48, b.x1 + 0.08, 2.12, -1.32);
  decal(root, colliders, M.pane, b.x1 + 0.02, 0.95, -2.08, b.x1 + 0.09, 1.72, -1.72);
  lampBox(root, colliders, M, b.x1 + 0.42, 2.22, -1.9);
}
