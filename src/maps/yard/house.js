/*
 * house.js: cream split-level, south porch, north deck, east carport.
 *
 * The house is a filled mass. Windows are paint. The porch, the deck
 * undercroft, the carport and the missing fence panel are the lines.
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

import { L, slab, decal, deck } from './kit.js';

export function buildHouse(root, colliders, platforms, M) {
  const h = L.house;
  slab(root, colliders, M.cream, h.x0, 0, h.z0, h.x1, h.h, h.z1);
  decal(root, colliders, M.creamSun, h.x0, 0, h.z0 - 0.04, h.x1, h.h, h.z0);
  decal(root, colliders, M.creamSun, h.x0 - 0.04, 0, h.z0, h.x0, h.h, h.z1);
  decal(root, colliders, M.creamShade, h.x0, 0, h.z1, h.x1, h.h, h.z1 + 0.04);

  /* Walk-out block, cooler than the vinyl so the split reads from the drive. */
  decal(root, colliders, M.asphalt, h.x0 - 0.04, 0, h.z0 - 0.04, h.x1 + 0.04, 1.36, h.z0);
  decal(root, colliders, M.asphalt, h.x0 - 0.04, 0, h.z1, h.x1 + 0.04, 1.36, h.z1 + 0.04);
  decal(root, colliders, M.asphalt, h.x0 - 0.04, 0, h.z0, h.x0, 1.36, h.z1);
  decal(root, colliders, M.asphalt, h.x1, 0, h.z0, h.x1 + 0.04, 1.36, h.z1);

  const over = 0.85;
  deck(root, colliders, platforms, M.roof, h.x0 - over, h.z0 - over, h.x1 + over, h.z1 + over, h.h + 0.38, 0.38);
  fascia(root, colliders, M, h.x0 - over, h.z0 - over, h.x1 + over, h.z1 + over, h.h);
  slab(root, colliders, M.roofSun, h.x0 + 0.6, h.h + 0.38, -0.55, h.x1 - 0.6, h.h + 0.82, 0.55, {
    solid: false,
  });
  slab(root, colliders, M.steelDark, 2.2, h.h + 0.38, 1.4, 3.0, h.h + 1.85, 2.2);

  decal(root, colliders, M.steel, h.x1, 0, h.z0, h.x1 + 0.05, h.h, h.z0 + 0.05);
  decal(root, colliders, M.steel, h.x0 - 0.05, 0, h.z0, h.x0, h.h, h.z0 + 0.05);

  eastCarport(root, colliders, platforms, M);
  southPorch(root, colliders, platforms, M);
  northDeck(root, colliders, platforms, M);
  panes(root, colliders, M);
  doors(root, colliders, M);
}

function fascia(root, colliders, M, x0, z0, x1, z1, y) {
  decal(root, colliders, M.woodDark, x0, y, z0, x1, y + 0.18, z0 + 0.12);
  decal(root, colliders, M.woodDark, x0, y, z1 - 0.12, x1, y + 0.18, z1);
  decal(root, colliders, M.woodDark, x0, y, z0, x0 + 0.12, y + 0.18, z1);
  decal(root, colliders, M.woodDark, x1 - 0.12, y, z0, x1, y + 0.18, z1);
}

function eastCarport(root, colliders, platforms, M) {
  const g = L.garage;
  slab(root, colliders, M.cream, g.x0, 0, g.z1 - 0.22, g.x1, g.h - 0.22, g.z1);
  deck(root, colliders, platforms, M.roof, g.x0, g.z0, g.x1, g.z1, g.h, 0.22);
  fascia(root, colliders, M, g.x0, g.z0, g.x1, g.z1, g.h - 0.22);
  slab(root, colliders, M.woodDark, g.x1 - 0.12, 0, g.z0, g.x1, 0.14, g.z1 - 0.22, {
    kind: 'obstacle',
  });
  slab(root, colliders, M.wood, g.x1 - 0.28, 0, g.z0 + 0.08, g.x1 - 0.12, g.h - 0.22, g.z0 + 0.24, {
    kind: 'pole',
  });
  slab(root, colliders, M.wood, g.x1 - 0.28, 0, g.z1 - 0.46, g.x1 - 0.12, g.h - 0.22, g.z1 - 0.22, {
    kind: 'pole',
  });
  slab(root, colliders, M.steelDark, g.x1 - 0.22, g.h - 0.28, g.z0 + 0.08, g.x1 - 0.12, g.h - 0.22, g.z1 - 0.22, {
    solid: false, cast: false,
  });
  lampBox(root, colliders, M, 9.2, g.h - 0.22, 1.2);
}

function southPorch(root, colliders, platforms, M) {
  const p = L.porch;
  slab(root, colliders, M.woodSun, p.x0, 0, p.z0, p.x1, p.y, p.z1, {
    solid: false, receive: true,
  });
  platforms.push({
    x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, top: p.y, thick: p.y,
  });
  deck(root, colliders, platforms, M.wood, p.x0 - 0.18, p.z0 - 0.18, p.x1 + 0.18, p.z1, p.roof, 0.16);

  const posts = [
    [p.x0 + 0.12, p.z0 + 0.12],
    [p.x1 - 0.12, p.z0 + 0.12],
    [-2.6, p.z0 + 0.12],
    [2.6, p.z0 + 0.12],
  ];
  for (const [x, z] of posts) {
    slab(root, colliders, M.wood, x - 0.08, 0, z - 0.08, x + 0.08, p.roof - 0.16, z + 0.08, {
      kind: 'pole',
    });
  }
  /* Outer bays only. The middle span is the swing, 1.4 m from these rails. */
  const z = p.z0 + 0.12;
  slab(root, colliders, M.wood, p.x0 + 0.22, 0.96, z - 0.06, -2.69, 1.08, z + 0.06, { kind: 'pole' });
  slab(root, colliders, M.wood, 2.69, 0.96, z - 0.06, p.x1 - 0.22, 1.08, z + 0.06, { kind: 'pole' });
  lampBox(root, colliders, M, 0, p.roof - 0.16, -7.0);
}

function northDeck(root, colliders, platforms, M) {
  const d = L.deck;
  deck(root, colliders, platforms, M.woodSun, d.x0, d.z0, d.x1, d.z1, d.y, d.thick);

  const xs = [d.x0 + 0.1, -2.0, 2.0, d.x1 - 0.1];
  const zs = [d.z0 + 0.22, (d.z0 + d.z1) * 0.5, d.z1 - 0.1];
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

  const ry0 = d.y + 0.8;
  const ry1 = d.y + 0.92;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const a = xs[i] + 0.09;
    const b = xs[i + 1] - 0.09;
    slab(root, colliders, M.wood, a, ry0, zs[2] - 0.06, b, ry1, zs[2] + 0.06, { kind: 'pole' });
    decal(root, colliders, M.wood, a, d.y + 0.38, zs[2] - 0.05, b, d.y + 0.48, zs[2] + 0.05);
    decal(root, colliders, M.woodDark, a, d.y, zs[2] - 0.05, b, d.y + 0.12, zs[2] + 0.05);
  }
  for (let i = 0; i < zs.length - 1; i += 1) {
    const a = zs[i] + 0.09;
    const b = zs[i + 1] - 0.09;
    slab(root, colliders, M.wood, xs[0] - 0.06, ry0, a, xs[0] + 0.06, ry1, b, { kind: 'pole' });
    slab(root, colliders, M.wood, xs[3] - 0.06, ry0, a, xs[3] + 0.06, ry1, b, { kind: 'pole' });
    decal(root, colliders, M.wood, xs[0] - 0.05, d.y + 0.38, a, xs[0] + 0.05, d.y + 0.48, b);
    decal(root, colliders, M.wood, xs[3] - 0.05, d.y + 0.38, a, xs[3] + 0.05, d.y + 0.48, b);
    decal(root, colliders, M.woodDark, xs[0] - 0.05, d.y, a, xs[0] + 0.05, d.y + 0.12, b);
    decal(root, colliders, M.woodDark, xs[3] - 0.05, d.y, a, xs[3] + 0.05, d.y + 0.12, b);
  }

  const rise = d.y / 6;
  const run = 0.34;
  for (let i = 0; i < 6; i += 1) {
    const y0 = i * rise;
    const y1 = (i + 1) * rise + 0.08;
    const z0 = d.z1 + i * run;
    const z1 = d.z1 + (i + 1) * run;
    deck(root, colliders, platforms, M.wood, d.x0, z0, d.x0 + 1.2, z1, y1, y1 - y0);
  }

  lampBox(root, colliders, M, 0, 2.48, L.house.z1);
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
  const h = L.house;
  const win = (x0, y0, z0, x1, y1, z1) => {
    decal(root, colliders, M.pane, x0, y0, z0, x1, y1, z1);
    decal(root, colliders, M.woodDark, x0 - 0.05, y0 - 0.06, z0, x1 + 0.05, y0, z1);
    decal(root, colliders, M.woodDark, x0 - 0.05, y1, z0, x1 + 0.05, y1 + 0.06, z1);
    decal(root, colliders, M.woodDark, x0 - 0.05, y0, z0, x0, y1, z1);
    decal(root, colliders, M.woodDark, x1, y0, z0, x1 + 0.05, y1, z1);
  };
  win(-5.4, 1.7, h.z0 - 0.04, -3.6, 3.15, h.z0);
  win(-2.0, 1.7, h.z0 - 0.04, -0.2, 3.15, h.z0);
  win(3.4, 1.7, h.z0 - 0.04, 5.4, 3.15, h.z0);
  win(-5.4, 4.05, h.z0 - 0.04, -3.6, 5.4, h.z0);
  win(3.4, 4.05, h.z0 - 0.04, 5.4, 5.4, h.z0);

  win(-5.6, 1.7, h.z1, -3.8, 3.15, h.z1 + 0.04);
  win(3.8, 1.7, h.z1, 5.6, 3.15, h.z1 + 0.04);
  win(-5.6, 4.05, h.z1, -3.8, 5.4, h.z1 + 0.04);
  win(3.8, 4.05, h.z1, 5.6, 5.4, h.z1 + 0.04);

  win(h.x0 - 0.04, 1.7, -3.6, h.x0, 3.15, -1.8);
  win(h.x0 - 0.04, 1.7, 1.8, h.x0, 3.15, 3.6);
  win(h.x0 - 0.04, 4.05, -1.2, h.x0, 5.4, 1.2);

  win(h.x1, 3.2, -4.6, h.x1 + 0.04, 4.6, -3.0);
  win(h.x1, 0.45, -4.8, h.x1 + 0.04, 1.15, -4.0);

  const shutter = (x0, y0, z0, x1, y1, z1) => {
    decal(root, colliders, M.barn, x0, y0, z0, x1, y1, z1);
  };
  shutter(-5.62, 1.7, h.z0 - 0.05, -5.42, 3.15, h.z0);
  shutter(-3.58, 1.7, h.z0 - 0.05, -3.38, 3.15, h.z0);
  shutter(-2.22, 1.7, h.z0 - 0.05, -2.02, 3.15, h.z0);
  shutter(-0.18, 1.7, h.z0 - 0.05, 0.02, 3.15, h.z0);
  shutter(3.18, 1.7, h.z0 - 0.05, 3.38, 3.15, h.z0);
  shutter(5.42, 1.7, h.z0 - 0.05, 5.62, 3.15, h.z0);
  shutter(-5.82, 1.7, h.z1, -5.62, 3.15, h.z1 + 0.05);
  shutter(-3.78, 1.7, h.z1, -3.58, 3.15, h.z1 + 0.05);
  shutter(3.58, 1.7, h.z1, 3.78, 3.15, h.z1 + 0.05);
  shutter(5.62, 1.7, h.z1, 5.82, 3.15, h.z1 + 0.05);
}

function doors(root, colliders, M) {
  const h = L.house;
  decal(root, colliders, M.woodDark, -0.7, 0.16, h.z0 - 0.05, 0.7, 2.35, h.z0);
  decal(root, colliders, M.pane, 0.22, 1.15, h.z0 - 0.06, 0.48, 1.95, h.z0 - 0.01);
  decal(root, colliders, M.wood, -1.05, L.deck.y, h.z1, 1.05, L.deck.y + 2.15, h.z1 + 0.06);
  decal(root, colliders, M.pane, -0.85, L.deck.y + 0.28, h.z1 + 0.01, 0.85, L.deck.y + 1.95, h.z1 + 0.07);
  decal(root, colliders, M.woodDark, h.x1, 0.02, -5.22, h.x1 + 0.06, 2.08, -4.22);
  decal(root, colliders, M.pane, h.x1 + 0.01, 0.95, -4.72, h.x1 + 0.07, 1.72, -4.42);
}
