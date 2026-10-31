/*
 * farm.js: the farm belt between the channel and the strip, so the
 * valley floor south of the runway is somebody's land and not a lawn. A
 * lane along the channel's north bank; at the west end a block of vinyl
 * houses (the plastic tunnel greenhouses every Japanese valley is lined
 * with), one of them open at both ends to fly through; in the middle the
 * vegetable beds with their scarecrow and tool hut; at the east end a
 * mown hay field of wrapped round bales and an old farmhouse with its
 * white storehouse. Kept off the race's lines: the farm bridge's lane, the
 * high gate's scaffold, and the drop into the channel at its gate.
 *
 * Everything here is drawn in the batches the rest of the place is, and
 * the small things (the cabbages, the bed ridges, the ribs) are set
 * dressing, so on Low they are not drawn and on High they are drawn near.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { sincos } from '../../props/trig.js';
import { rng } from './frame.js';

const SC = { s: 0, c: 0 };

/*
 * THE VINYL HOUSES: tunnels along x, each `w` wide and `h` high, its
 * sides upright to `wall` and an arc over. Two columns of four. The one
 * named OPEN has both ends rolled up, and THE GREENHOUSE gap runs it.
 */
export const VINYL = { x: [[26, 56], [62, 92]], y: [119, 126.5, 134, 141.5], w: 5.4, wall: 1.4, h: 3.0 };
export const OPEN = { x0: 62, x1: 92, y: 134 };

/* The arc of a tunnel's cross section, from the south foot over to the
 * north, as [py, h] pairs, `inset` in from the film. */
function tunnelArc(yc, inset) {
  const V = VINYL;
  const half = V.w / 2 - inset;
  const rise = V.h - V.wall - inset;
  const out = [[yc - half, 0]];
  const n = 12;
  for (let i = 0; i <= n; i += 1) {
    sincos(Math.PI - (Math.PI * i) / n, SC);
    out.push([yc + half * SC.c, V.wall + rise * SC.s]);
  }
  out.push([yc + half, 0]);
  return out;
}

function tunnel(T, x0, x1, yc, open) {
  const V = VINYL;
  const outer = tunnelArc(yc, 0);
  if (!open) {
    /* Closed: the film is one solid tunnel, ends and all. */
    T.prism('afVinyl', 'x', outer, x0, x1);
    T.hidden(x0, yc - V.w / 2, 0, x1, yc + V.w / 2, V.wall, 'wall', 'vinyl house');
    /* Over the walls, stepped boxes inside the arc. */
    for (const [f, top] of [[0.85, 2.0], [0.62, 2.55], [0.32, 2.9]]) {
      T.hidden(x0, yc - (V.w / 2) * f, V.wall, x1, yc + (V.w / 2) * f, top, 'wall', 'vinyl house');
    }
  } else {
    /* Open: the film a skin, rolled up at both ends to the first hoop. */
    const inner = tunnelArc(yc, 0.05).reverse();
    T.prism('afVinyl', 'x', [...outer, ...inner], x0 + 0.6, x1 - 0.6);
    /* Its solid: the two side walls, thin, and the crown as slabs above
     * the arc's inside, each between the film and the slab under it. */
    for (const s of [-1, 1]) {
      T.hidden(x0, yc + s * (V.w / 2) - 0.06, 0, x1, yc + s * (V.w / 2) + 0.06, V.wall, 'wall', 'vinyl house');
    }
    const arc = tunnelArc(yc, 0);
    for (let i = 1; i < arc.length - 2; i += 1) {
      const [ya, ha] = arc[i];
      const [yb, hb] = arc[i + 1];
      const lo = Math.min(ha, hb);
      T.hidden(x0 + 0.6, Math.min(ya, yb), lo - 0.05, x1 - 0.6, Math.max(ya, yb), lo, 'wall', 'vinyl house');
    }
    /* The rolled film at each end, a fat white tube along the arc's top. */
    for (const x of [x0 + 0.6, x1 - 0.6]) {
      T.cyl('afBaleWrap', [x, yc - 1.6, V.h - 0.25], [x, yc + 1.6, V.h - 0.25], 0.12, 6);
    }
    /* Inside, the beds and the seedlings in them. */
    T.dress(() => {
      for (const s of [-1, 1]) {
        T.paint('afSoil', x0 + 1, yc + s * 1.25 - 0.45, 0, x1 - 1, yc + s * 1.25 + 0.45, 0.18);
        for (let x = x0 + 1.6; x < x1 - 1.2; x += 0.9) {
          T.ball('afCabbage', x, yc + s * 1.25, 0.3, 0.2);
        }
      }
    });
  }
  /* The hoops, a dark rib every 1.8 m over the film, and the door ends'
   * frames on the closed ones. */
  T.dress(() => {
    T.wide(() => {
      const ribs = tunnelArc(yc, -0.03);
      for (let x = x0 + 0.6; x <= x1 - 0.5; x += 1.8) {
        for (let i = 1; i < ribs.length - 2; i += 1) {
          const [ya, ha] = ribs[i];
          const [yb, hb] = ribs[i + 1];
          T.cyl('afVinylRib', [x, ya, ha], [x, yb, hb], 0.035, 4);
        }
        for (const s of [-1, 1]) {
          T.cyl('afVinylRib', [x, yc + s * (V.w / 2 + 0.03), 0], [x, yc + s * (V.w / 2 + 0.03), V.wall], 0.035, 4);
        }
      }
      if (!open) {
        for (const x of [x0 - 0.02, x1 + 0.02]) {
          T.paint('afVinylRib', x - 0.03, yc - 0.6, 0, x + 0.03, yc - 0.55, 1.9);
          T.paint('afVinylRib', x - 0.03, yc + 0.55, 0, x + 0.03, yc + 0.6, 1.9);
          T.paint('afVinylRib', x - 0.03, yc - 0.6, 1.85, x + 0.03, yc + 0.6, 1.9);
        }
      }
    });
  });
}

function vinylHouses(T) {
  for (const [x0, x1] of VINYL.x) {
    for (const yc of VINYL.y) {
      tunnel(T, x0, x1, yc, x0 === OPEN.x0 && yc === OPEN.y);
    }
  }
  /* Between the houses, the cinder paths, and a water tank on a stand. */
  T.paint('afEarth', 24, 114.6, 0, 94, 116.2, 0.02);
  T.paint('afEarth', 57.4, 115, 0, 60.6, 146, 0.02);
  T.disc('afDrum', 59, 149.5, 1.0, 1.6, 3.2, 14);
  for (const [x, y] of [[58.3, 148.8], [59.7, 148.8], [58.3, 150.2], [59.7, 150.2]]) {
    T.post('metalDark', x, y, 0, 1.6, 0.05, { kind: 'pole', name: 'tank stand' });
  }
  T.hidden(58.1, 148.6, 1.6, 59.9, 150.4, 3.2, 'obstacle', 'tank');
}

/* ---- the vegetable beds, their scarecrow and the tool hut. */
const BEDS = { x0: 162, x1: 232, y0: 120, y1: 150 };

function beds(T) {
  const B = BEDS;
  T.paint('afSoilDark', B.x0, B.y0, 0, B.x1, B.y1, 0.03);
  const r = rng(0xbed5).next;
  /* The beds run north and south, a metre and a quarter apart: alternate
   * ones cabbage, leek, and bare tilled soil. */
  let k = 0;
  for (let x = B.x0 + 1; x < B.x1 - 0.6; x += 1.25, k += 1) {
    const crop = k % 9 < 3 ? 'cabbage' : k % 9 < 6 ? 'negi' : 'bare';
    T.dress(() => {
      T.wide(() => {
        T.paint('afSoil', x - 0.4, B.y0 + 0.8, 0, x + 0.4, B.y1 - 0.8, 0.2);
      });
      if (crop === 'cabbage') {
        for (let y = B.y0 + 1.3; y < B.y1 - 1; y += 0.85) {
          T.ball('afCabbage', x, y, 0.3, 0.24 + r() * 0.06);
        }
      } else if (crop === 'negi') {
        T.paint('afNegi', x - 0.14, B.y0 + 1, 0.2, x + 0.14, B.y1 - 1, 0.55);
      }
    });
  }
  /* The scarecrow: a cross of poles, a shirt, a straw hat. */
  const sx = 198;
  const sy = 136;
  T.post('afHasaPole', sx, sy, 0, 2.2, 0.05, { kind: 'pole', name: 'scarecrow' });
  T.cap('afHasaPole', [sx - 0.8, sy, 1.6], [sx + 0.8, sy, 1.6], 0.04, { kind: 'pole', name: 'scarecrow' });
  T.box('afBanner', sx - 0.32, sy - 0.12, 1.05, sx + 0.32, sy + 0.12, 1.75, { solid: false });
  T.ball('afPaper', sx, sy, 1.98, 0.2);
  T.cone('afStraw', sx, sy, 2.08, 0.42, 0.24, 10);
  /* The hut: board walls, a lean to roof of corrugated sheet, a door. */
  const hx = 236;
  const hy = 122;
  T.box('afShrineWood', hx, hy, 0, hx + 4, hy + 3, 2.2, { kind: 'wall', name: 'hut' });
  T.paint('afShrineDark', hx + 1.4, hy - 0.02, 0, hx + 2.5, hy, 1.9);
  T.prism('sheetBlue', 'x', [[hy - 0.4, 2.7], [hy + 3.4, 2.2], [hy + 3.4, 2.1], [hy - 0.4, 2.6]], hx - 0.3, hx + 4.3);
  T.hidden(hx - 0.3, hy - 0.4, 2.1, hx + 4.3, hy + 3.4, 2.2, 'wall', 'hut roof');
  /* Crates of the morning's cut, and the hose reel. */
  T.dress(() => {
    for (let i = 0; i < 4; i += 1) {
      T.box('containerOrange', hx + 4.4, hy + 0.3 + i * 0.62, 0, hx + 4.95, hy + 0.85 + i * 0.62, 0.32, { solid: false });
    }
    T.cyl('afDrumRed', [hx - 0.6, hy + 1.2, 0.35], [hx - 0.6, hy + 1.6, 0.35], 0.35, 10);
  });
}

/* ---- the hay field: wrapped round bales lying where the baler left them,
 * and a stack of them at the far end. */
function hay(T) {
  const r = rng(0x4a7).next;
  const bales = [];
  for (let i = 0; i < 18; i += 1) {
    const x = 352 + r() * 96;
    const y = 122 + r() * 30;
    if (bales.some(([bx, by]) => Math.abs(bx - x) < 4 && Math.abs(by - y) < 4)) {
      continue;
    }
    bales.push([x, y]);
  }
  bales.forEach(([x, y], i) => {
    bale(T, x, y, 0.75, i % 5 === 3 ? 'afBalePink' : 'afBaleWrap', i % 2 === 0);
  });
  /* The stack: four on the ground, three on them, two on top. */
  const sx = 420;
  const sy = 154;
  [[4, 0], [3, 1], [2, 2]].forEach(([n, k]) => {
    for (let i = 0; i < n; i += 1) {
      const x = sx + (i - (n - 1) / 2) * 1.26;
      bale(T, x, sy, 0.75 + k * 1.25, 'afBaleWrap', true);
    }
  });
  /* The mown swaths the bales came off, rows of drying grass, broken
   * where the baler picked them up. */
  const sw = rng(0x5a7).next;
  T.dress(() => {
    T.wide(() => {
      for (let y = 120.5; y < 156; y += 4.5) {
        for (let x = 346; x < 456;) {
          const len = 6 + sw() * 14;
          T.paint('afSwath', x, y, 0, Math.min(456, x + len), y + 0.7, 0.03);
          x += len + 2 + sw() * 8;
        }
      }
    });
  });
}

/* A round bale 1.5 m across and 1.2 m long lying on its side, along y if
 * `alongY`, else along x, its middle `h` up, with its solid. */
function bale(T, x, y, h, m, alongY) {
  const R = 0.75;
  const L = 0.6;
  if (alongY) {
    T.cyl(m, [x, y - L, h], [x, y + L, h], R, 12);
    T.hidden(x - R * 0.85, y - L, h - R, x + R * 0.85, y + L, h + R * 0.85, 'obstacle', 'bale');
  } else {
    T.cyl(m, [x - L, y, h], [x + L, y, h], R, 12);
    T.hidden(x - L, y - R * 0.85, h - R, x + L, y + R * 0.85, h + R * 0.85, 'obstacle', 'bale');
  }
}

/* ---- the farmhouse and its storehouse (kura), at the east end. */
const HOUSE = { x0: 438, x1: 452, y0: 120, y1: 130 };
const KURA = { x0: 456, x1: 462, y0: 122, y1: 128 };

function farmhouse(T) {
  const H = HOUSE;
  /* The house: a dark timber base, cream plaster over, a big hipped roof
   * of grey tile with deep eaves. */
  T.box('afShrineDark', H.x0, H.y0, 0, H.x1, H.y1, 0.6, { kind: 'wall', name: 'farmhouse' });
  T.box('wallCream', H.x0 + 0.1, H.y0 + 0.1, 0.6, H.x1 - 0.1, H.y1 - 0.1, 3.2, { kind: 'wall', name: 'farmhouse' });
  /* Its sliding doors and windows, front (south) and back. */
  for (let x = H.x0 + 1.2; x < H.x1 - 1.5; x += 2.6) {
    T.paint('afShrineWood', x, H.y0 + 0.06, 0.7, x + 1.8, H.y0 + 0.1, 2.5);
    T.paint('afPaper', x + 0.12, H.y0 + 0.04, 0.85, x + 1.68, H.y0 + 0.06, 2.35);
  }
  const eave = { x0: H.x0 - 1.1, y0: H.y0 - 1.1, x1: H.x1 + 1.1, y1: H.y1 + 1.1 };
  const ridge = { x0: H.x0 + 4, y0: (H.y0 + H.y1) / 2 - 0.2, x1: H.x1 - 4, y1: (H.y0 + H.y1) / 2 + 0.2 };
  T.box('afRoof', eave.x0, eave.y0, 3.2, eave.x1, eave.y1, 3.4, { kind: 'wall', name: 'farmhouse roof' });
  T.frustum('afRoof', eave, 3.4, ridge, 6.4);
  T.frustumSolid(eave, 3.4, ridge, 6.4, 6, 'farmhouse roof');
  T.box('afShrineDark', ridge.x0 - 0.3, ridge.y0 - 0.1, 6.35, ridge.x1 + 0.3, ridge.y1 + 0.1, 6.7, { kind: 'wall', name: 'ridge' });
  /* The kura: thick white walls on a stone footing, a black band, a small
   * barred window, a tiled gable roof. */
  const K = KURA;
  T.box('afStone', K.x0 - 0.2, K.y0 - 0.2, 0, K.x1 + 0.2, K.y1 + 0.2, 0.6, { kind: 'wall', name: 'kura' });
  T.box('afKura', K.x0, K.y0, 0.6, K.x1, K.y1, 5.0, { kind: 'wall', name: 'kura' });
  T.paint('afShrineDark', K.x0 - 0.02, K.y0 - 0.02, 0.6, K.x1 + 0.02, K.y1 + 0.02, 1.6);
  T.paint('afShrineDark', (K.x0 + K.x1) / 2 - 0.5, K.y0 - 0.04, 3.4, (K.x0 + K.x1) / 2 + 0.5, K.y0, 4.2);
  const ky = (K.y0 + K.y1) / 2;
  /* Filled, gables and all; its solid stacked boxes inside the slope. */
  const half = K.y1 + 0.7 - ky;
  T.prism('afRoof', 'x', [[K.y0 - 0.7, 4.7], [K.y0 - 0.7, 4.9], [ky, 6.8], [K.y1 + 0.7, 4.9], [K.y1 + 0.7, 4.7]], K.x0 - 0.6, K.x1 + 0.6);
  T.hidden(K.x0 - 0.6, K.y0 - 0.7, 4.7, K.x1 + 0.6, K.y1 + 0.7, 4.9, 'wall', 'kura roof');
  for (let i = 0; i < 4; i += 1) {
    const h0 = 4.9 + (1.9 * i) / 4;
    const h1 = 4.9 + (1.9 * (i + 1)) / 4;
    const w = half * (1 - (i + 1) / 4);
    if (w > 0.05) {
      T.hidden(K.x0 - 0.6, ky - w, h0, K.x1 + 0.6, ky + w, h1, 'wall', 'kura roof');
    }
  }
  /* The yard: gravel, a well with its pulley frame, a woodpile, potted
   * plants by the door, a persimmon tree in new leaf. */
  T.paint('afStone', H.x0 - 3, H.y0 - 7, 0, K.x1 + 2, H.y0 - 0.2, 0.02);
  T.disc('afStone', 446, 114.5, 0.7, 0, 0.8, 14);
  T.post('afShrineWood', 445.4, 114.5, 0.8, 2.2, 0.05, { kind: 'pole', name: 'well' });
  T.post('afShrineWood', 446.6, 114.5, 0.8, 2.2, 0.05, { kind: 'pole', name: 'well' });
  T.cap('afShrineWood', [445.4, 114.5, 2.2], [446.6, 114.5, 2.2], 0.05, { kind: 'pole', name: 'well' });
  T.hidden(445.4, 113.9, 0, 446.6, 115.1, 0.8, 'obstacle', 'well');
  T.dress(() => {
    for (let i = 0; i < 5; i += 1) {
      T.box('afBench2', H.x1 + 0.3, H.y0 + 1 + i * 0.4, 0, H.x1 + 1.0, H.y0 + 1.3 + i * 0.4, 1.4, { solid: false });
    }
    for (const x of [H.x0 + 0.6, H.x0 + 1.3, H.x1 - 1.3]) {
      T.disc('afEarth', x, H.y0 - 0.5, 0.25, 0, 0.4, 8);
      T.ball('afCabbage', x, H.y0 - 0.5, 0.55, 0.28);
    }
  });
  T.post('afCedarTrunk', 434, 116, 0, 3.0, 0.18, { kind: 'pole', name: 'persimmon' });
  T.ball('afLeaf', 434, 116, 3.8, 1.9);
  T.ball('afLeaf', 433, 116.6, 3.1, 1.3);
  T.cap('afLeaf', [434, 116, 3.0], [434, 116, 4.4], 1.6, { draw: false, kind: 'tree', name: 'persimmon' });
}

/* ---- the lane along the channel's north bank, and its stone markers. */
function lane(T) {
  /* Two wheel ruts with grass between, as a farm lane is worn. */
  T.paint('afEarth', 8, 112.8, 0, 472, 113.9, 0.02);
  T.paint('afEarth', 8, 114.9, 0, 472, 116, 0.02);
  /* Jizo by the farm bridge: a little stone figure under a tin roof, with
   * a red bib. */
  const jx = 157;
  const jy = 117.5;
  T.box('afStone', jx - 0.4, jy - 0.4, 0, jx + 0.4, jy + 0.4, 0.3, { kind: 'obstacle', name: 'jizo' });
  T.cyl('afStone', [jx, jy, 0.3], [jx, jy, 0.9], 0.2, 8);
  T.ball('afStone', jx, jy, 1.02, 0.17);
  T.cone('afBannerRed', jx, jy, 0.62, 0.24, 0.24, 8);
  for (const [x, y] of [[jx - 0.55, jy - 0.5], [jx + 0.55, jy - 0.5], [jx - 0.55, jy + 0.5], [jx + 0.55, jy + 0.5]]) {
    T.post('afShrineWood', x, y, 0, 1.5, 0.04, { kind: 'pole', name: 'jizo roof' });
  }
  T.prism('sheetBlue', 'x', [[jy - 0.8, 1.5], [jy, 1.75], [jy + 0.8, 1.5], [jy + 0.8, 1.44], [jy, 1.69], [jy - 0.8, 1.44]], jx - 0.75, jx + 0.75);
}

export function farm(T) {
  lane(T);
  vinylHouses(T);
  beds(T);
  hay(T);
  farmhouse(T);
}
