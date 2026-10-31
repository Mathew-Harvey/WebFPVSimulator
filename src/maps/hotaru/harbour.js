/*
 * harbour.js: the fishing hamlet on the bay of Hotaru Valley. A row of
 * boat houses along the quay with their boat bays open to the sea and
 * their living rooms over them, after the funaya of Ine on the Tango coast;
 * the fish market's open shed; a timber pier on piles high enough to fly
 * under; the squid boats moored either side of it with their strings of
 * lamps; a breakwater of concrete and tetrapods with its red light; the
 * shrine's great torii standing in the sea off the beach, after the one at
 * Itsukushima; and the road going into the headland by a tunnel.
 *
 * Sizes: a funaya is a two storey house about seven metres across on its
 * sea face, the bay under it three metres high; a small squid boat is
 * fifteen metres long and four wide, its lamps a row of bulbs on a wire
 * over the deck; a harbour tetrapod is two to three metres across.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { lotFrame, hash2 } from './frame.js';
import { QUAY, WATER, landAt } from './land.js';
import { gableRoof, torii } from './houses.js';

const Q = QUAY.h;

/* The boat houses: eight along the quay, the fourth open front and back
 * (the boat shed a pilot flies through), the fifth the one whose bay hides
 * the little sign. */
export const FUNAYA = { w: 7.2, d: 9.5, gap: 0.7, x0: 309, n: 8, open: 3, hide: 4, bay: 3.0, floor: 3.3, wall: 5.9 };
export const funayaLot = (i) => {
  const x0 = FUNAYA.x0 + i * (FUNAYA.w + FUNAYA.gap);
  return { x0, x1: x0 + FUNAYA.w, y0: QUAY.py + 0.6, y1: QUAY.py + 0.6 + FUNAYA.d, face: 's', base: Q };
};
export const MARKET = { x0: 376, x1: 396, y0: 49.5, y1: 58.5, h: 4.6 };
export const PIER = { x0: 404, x1: 408.4, y0: 6, y1: QUAY.py, bottom: 1.7, top: 2.0, piles: 4.2 };
export const BREAKWATER = { a: [452, -2], b: [378, -16], w: 4.2, top: 2.2 };
export const SEA_TORII = { px: 262, py: 20, span: 9.4, clear: 8.4 };
export const TUNNEL = { x: 434, py: 62, w: 5.6, h: 4.8 };

/* ------------------------------------------------------------------ */
/* The boat houses                                                     */
/* ------------------------------------------------------------------ */

function funaya(T, i) {
  const lot = funayaLot(i);
  const L = lotFrame(T, lot);
  const { w, d, bay, floor, wall } = FUNAYA;
  const open = i === FUNAYA.open;
  const wt = 0.25;
  const tone = i % 3 === 0 ? 'hvWoodDark' : i % 3 === 1 ? 'hvWood' : 'hvWoodWet';
  /* The bay's side walls and, unless it is the open one, its back wall. */
  L.box(tone, 0, 0, 0, wt, d, floor, { kind: 'wall', name: 'funaya wall' });
  L.box(tone, w - wt, 0, 0, w, d, floor, { kind: 'wall', name: 'funaya wall' });
  if (!open) {
    L.box(tone, wt, d - wt, 0, w - wt, d, floor, { kind: 'wall', name: 'funaya back' });
  }
  /* The lintel over the bay, the living floor. */
  L.box('hvWoodDark', 0, 0, bay, w, d, floor + 0.3, { kind: 'wall', name: 'funaya floor' });
  /* The living storey, set back from the sea face for its balcony. */
  L.box(tone, 0, 1.1, floor + 0.3, w, d, wall, { kind: 'wall', name: 'funaya' });
  L.box('hvWoodPale', 0, 0, floor + 0.3, w, 1.1, floor + 0.45, { kind: 'wall', name: 'balcony' });
  L.box('hvWoodPale', 0, 0, floor + 0.45, w, 0.12, floor + 1.25, { kind: 'wall', name: 'balcony rail' });
  gableRoof(L, {
    u0: 0, w, v0: -0.7, v1: d + 0.4, wall, pitch: 0.62, t: 0.22, oh: 0.55, m: 'hvTile', capM: 'hvTileEdge', gableM: tone, gables: [1.1, d - 0.2],
  });
  T.dress(() => T.wide(() => {
    /* The sea face upstairs: shoji, some lit, under the gable. */
    for (let u = 0.6; u < w - 0.6; u += 1.6) {
      L.paint(hash2(i, Math.floor(u * 10)) < 0.4 ? 'hvShojiLit' : 'hvShoji', u, 1.06, floor + 0.9, u + 1.2, 1.1, wall - 0.5);
    }
    /* The boards down the bay's walls, and a lamp over the bay. */
    for (let v = 0.5; v < d; v += 1.2) {
      L.paint('hvBlack', -0.03, v, 0.2, 0, v + 0.07, floor);
      L.paint('hvBlack', w, v, 0.2, w + 0.03, v + 0.07, floor);
    }
    L.paint('hvLamp', w / 2 - 0.2, -0.04, bay - 0.5, w / 2 + 0.2, 0, bay - 0.2);
  }));
  /* What is in the bay: a little boat on the slip, floats, nets on a
   * line. Clear of the middle in the open one. */
  T.dress(() => {
    if (!open) {
      boatHull(T, lot.x0 + 1.2, lot.x1 - 1.2, lot.y0 + 1.0, lot.y0 + 6.8, Q, Q + 0.75, i % 2 === 0 ? 'hvBoatBlue' : 'hvBoatTeal');
      for (let k = 0; k < 4; k += 1) {
        T.bead('hvFloat', lot.x0 + 0.6, lot.y0 + 7.2 + k * 0.45, Q + 0.3, 0.22);
      }
      L.deco('hvNet', 0.3, 7.5, 0.3, 1.2, d - 0.4, 1.6);
    } else {
      L.deco('hvNet', 0.3, 2, 0.6, 0.6, d - 1.5, 2.4);
      L.deco('hvNet', w - 0.6, 2, 0.6, w - 0.3, d - 1.5, 2.4);
    }
  });
  return { lot, open };
}

/* A small boat's hull, a plan polygon pointed at the north end, from the
 * keel to the gunwale. Drawn only. */
function boatHull(T, x0, x1, y0, y1, h0, h1, stripe) {
  const cx = (x0 + x1) / 2;
  const bow = y1 - (x1 - x0) * 0.9;
  T.slab('hvBoatWhite', [[x0 + 0.2, y0], [x1 - 0.2, y0], [x1, y0 + 0.6], [x1, bow], [cx, y1], [x0, bow], [x0, y0 + 0.6]], h0, h1);
  T.slab(stripe, [[x0 - 0.02, y0 + 0.6], [x1 + 0.02, y0 + 0.6], [x1 + 0.02, bow], [cx, y1 + 0.03], [x0 - 0.02, bow]], h1 - 0.18, h1 - 0.06);
}

/* ------------------------------------------------------------------ */
/* The boats                                                           */
/* ------------------------------------------------------------------ */

/*
 * A SQUID BOAT moored bow to the north: hull, wheelhouse, mast, and the
 * lamps hung down the middle on a wire from the mast to the bow and the
 * stern posts. Its solid is two boxes (the hull to its bow's start, and
 * the wheelhouse) and the mast as a pole.
 */
export const BOATS = [
  { px: 398.6, py: 34, len: 15, w: 4, stripe: 'hvBoatBlue' },
  { px: 393.6, py: 20, len: 13, w: 3.6, stripe: 'hvBoatRed' },
  { px: 413.6, py: 36, len: 15, w: 4, stripe: 'hvBoatTeal' },
  { px: 418.6, py: 22, len: 14, w: 3.8, stripe: 'hvBoatBlue' },
  { px: 344, py: 41, len: 12, w: 3.4, stripe: 'hvBoatRed', across: true },
];

function boat(T, b) {
  const deck = WATER + 1.0;
  const gun = WATER + 1.5;
  if (b.across) {
    /* Moored along the quay face, bow to the east: drawn as the others
     * turned, its solid one box. */
    const y0 = b.py - b.w / 2;
    const y1 = b.py + b.w / 2;
    const x0 = b.px - b.len / 2;
    const x1 = b.px + b.len / 2;
    const bow = x1 - b.w * 1.2;
    T.slab('hvBoatWhite', [[x0, y0 + 0.3], [x0 + 0.3, y0], [bow, y0], [x1, b.py], [bow, y1], [x0 + 0.3, y1], [x0, y1 - 0.3]], WATER - 0.4, gun);
    T.slab(b.stripe, [[x0 - 0.03, y0 + 0.3], [bow, y0 - 0.03], [x1 + 0.03, b.py], [bow, y1 + 0.03], [x0 - 0.03, y1 - 0.3]], gun - 0.3, gun - 0.12);
    T.box('hvDeck', x0 + 0.2, y0 + 0.2, WATER - 0.4, bow, y1 - 0.2, deck, { kind: 'wall', name: 'boat' });
    T.box('hvBoatWhite', x0 + 2, y0 + 0.6, deck, x0 + 4.4, y1 - 0.6, deck + 2.1, { kind: 'wall', name: 'wheelhouse' });
    T.dress(() => T.wide(() => {
      T.paint('hvBlack', x0 + 4.4, y0 + 0.9, deck + 1.2, x0 + 4.43, y1 - 0.9, deck + 1.8);
    }));
    return;
  }
  const x0 = b.px - b.w / 2;
  const x1 = b.px + b.w / 2;
  const y0 = b.py - b.len / 2;
  const y1 = b.py + b.len / 2;
  const bow = y1 - b.w * 1.2;
  T.slab('hvBoatWhite', [[x0 + 0.3, y0], [x1 - 0.3, y0], [x1, y0 + 0.3], [x1, bow], [b.px, y1], [x0, bow], [x0, y0 + 0.3]], WATER - 0.4, gun);
  T.slab(b.stripe, [[x0 - 0.03, y0 + 0.3], [x1 + 0.03, y0 + 0.3], [x1 + 0.03, bow], [b.px, y1 + 0.03], [x0 - 0.03, bow]], gun - 0.3, gun - 0.12);
  T.box('hvDeck', x0 + 0.2, y0 + 0.2, WATER - 0.4, x1 - 0.2, bow, deck, { kind: 'wall', name: 'boat' });
  T.hidden(x0 + 0.6, bow, WATER - 0.4, x1 - 0.6, y1 - 1.2, gun, 'wall', 'bow');
  /* The wheelhouse aft, with its windows. */
  const wy0 = y0 + 1.6;
  const wy1 = y0 + 4.2;
  T.box('hvBoatWhite', x0 + 0.5, wy0, deck, x1 - 0.5, wy1, deck + 2.2, { kind: 'wall', name: 'wheelhouse' });
  T.box(b.stripe, x0 + 0.35, wy0 - 0.15, deck + 2.2, x1 - 0.35, wy1 + 0.15, deck + 2.38, { kind: 'wall', name: 'wheelhouse roof' });
  T.dress(() => T.wide(() => {
    T.paint('hvBlack', x0 + 0.7, wy1, deck + 1.3, x1 - 0.7, wy1 + 0.03, deck + 1.9);
    /* The hull's name band and the waterline. */
    T.paint('hvBoatRed', x0 - 0.02, y0 + 0.4, WATER + 0.02, x1 + 0.02, bow, WATER + 0.12);
  }));
  /* The mast forward of the wheelhouse, and the lamp wires. */
  const mx = b.px;
  const my = wy1 + 1.2;
  const mt = deck + 6.2;
  T.post('hvBoatWhite', mx, my, deck, mt, 0.09, { kind: 'pole', name: 'mast' });
  T.post('hvBoatWhite', mx, y1 - 1.6, deck, deck + 2.6, 0.06, { kind: 'pole', name: 'bow post' });
  T.post('hvBoatWhite', mx, y0 + 0.5, deck, deck + 3.2, 0.06, { kind: 'pole', name: 'stern post' });
  T.wire('hvBlack', [mx, my, mt], [mx, y1 - 1.6, deck + 2.6], 0.25);
  T.wire('hvBlack', [mx, my, mt - 0.4], [mx, y0 + 0.5, deck + 3.2], 0.3);
  /* The lamps: big bulbs hanging from the wires, the boat's signature. */
  T.dress(() => T.wide(() => {
    const lamps = (a, b, n) => {
      for (let k = 1; k < n; k += 1) {
        const f = k / n;
        const y = a[1] + (b[1] - a[1]) * f;
        const h = a[2] + (b[2] - a[2]) * f - 4 * 0.27 * f * (1 - f) - 0.25;
        T.bead('hvLamp', mx, y, h, 0.16);
      }
    };
    lamps([mx, my, mt], [mx, y1 - 1.6, deck + 2.6], 7);
    lamps([mx, my, mt - 0.4], [mx, y0 + 0.5, deck + 3.2], 4);
    /* Floats and crates on the deck. */
    T.deco('hvBoatTeal', x0 + 0.5, bow - 2.2, deck, x0 + 1.4, bow - 1.2, deck + 0.6);
    T.bead('hvFloat', x1 - 0.7, bow - 1, deck + 0.3, 0.3);
  }));
}

/* ------------------------------------------------------------------ */
/* The hamlet                                                          */
/* ------------------------------------------------------------------ */

export function harbour(T) {
  const info = {};
  /* The quay's stone face, its kerb and its bollards. */
  T.box('hvStone', QUAY.x0, QUAY.py - 1.4, WATER - 3, QUAY.x1, QUAY.py + 0.4, Q, { kind: 'wall', name: 'quay' });
  T.dress(() => T.wide(() => {
    T.box('hvConcrete', QUAY.x0, QUAY.py - 1.45, Q, QUAY.x1, QUAY.py - 0.9, Q + 0.18, { solid: false });
    T.paint('hvStoneDark', QUAY.x0, QUAY.py - 1.43, WATER - 0.2, QUAY.x1, QUAY.py - 1.41, WATER + 0.4);
  }));
  T.dress(() => {
    for (let x = QUAY.x0 + 3; x < QUAY.x1 - 2; x += 9) {
      T.cyl('hvBlack', [x, QUAY.py - 1.1, Q], [x, QUAY.py - 1.1, Q + 0.5], 0.17, 8, 0.2);
    }
    /* The tyres hung on the face as fenders. */
    for (let x = QUAY.x0 + 7; x < QUAY.x1 - 2; x += 11) {
      T.disc('hvBlack', x, QUAY.py - 1.55, 0.4, WATER + 0.2, WATER + 0.45, 10);
    }
  });
  /* The beach's end of the quay: a ramp down for the boats. */
  T.box('hvConcrete', QUAY.x0 - 6, QUAY.py - 5, WATER - 1, QUAY.x0, QUAY.py - 1.4, WATER + 0.4, { kind: 'wall', name: 'slipway' });
  info.funaya = [];
  for (let i = 0; i < FUNAYA.n; i += 1) {
    info.funaya.push(funaya(T, i));
  }
  market(T);
  info.pier = pier(T);
  for (const b of BOATS) {
    boat(T, b);
  }
  info.breakwater = breakwater(T);
  info.seaTorii = torii(T, SEA_TORII.px, SEA_TORII.py, WATER - 0.2, SEA_TORII.span, SEA_TORII.clear, 'x', true);
  tunnel(T);
  quayside(T);
  return info;
}

/* The fish market: a long roof on steel posts, open on every side, the
 * auction floor under it wet concrete, crates stacked at the back. */
function market(T) {
  const { x0, x1, y0, y1, h } = MARKET;
  for (let x = x0; x <= x1 + 0.01; x += 5) {
    for (const y of [y0, y1]) {
      T.post('hvConcrete', x, y, Q, Q + h, 0.14, { kind: 'pole', name: 'market post' });
    }
  }
  T.box('hvRust', x0 - 1, y0 - 1.2, Q + h, x1 + 1, y1 + 1.2, Q + h + 0.25, { kind: 'wall', name: 'market roof' });
  T.dress(() => T.wide(() => {
    T.box('hvBoatBlue', x0 - 1.05, y0 - 1.25, Q + h - 0.35, x1 + 1.05, y0 - 1.15, Q + h + 0.25, { solid: false });
    T.paint('hvConcrete', x0, y0, Q + 0.01, x1, y1, Q + 0.04);
  }));
  /* Stacks of fish boxes, blue and white, at the back. */
  for (let x = x0 + 1; x < x1 - 2; x += 3.4) {
    const n = 2 + Math.floor(hash2(Math.floor(x), 77) * 3);
    T.box(hash2(Math.floor(x), 79) < 0.5 ? 'hvBoatBlue' : 'hvBoatWhite', x, y1 - 1.6, Q, x + 2.2, y1 - 0.4, Q + n * 0.4, { kind: 'wall', name: 'fish boxes' });
  }
}

/* The pier on its piles, a ramp up to it from the quay. */
function pier(T) {
  const { x0, x1, y0, y1, bottom, top, piles } = PIER;
  T.box('hvDeck', x0, y0, Q + bottom, x1, y1 - 3, Q + top, { kind: 'wall', name: 'pier' });
  /* The ramp from the quay: three steps, then the deck. */
  for (let k = 0; k < 3; k += 1) {
    T.box('hvDeck', x0, y1 - 3 + k, Q - 0.3, x1, y1 - 2 + k, Q + top - (k + 1) * (top / 4), { kind: 'wall', name: 'pier ramp' });
  }
  T.dress(() => T.wide(() => {
    for (let y = y0 + 0.3; y < y1 - 3; y += 0.5) {
      T.paint('hvWoodDark', x0, y, Q + top, x1, y + 0.04, Q + top + 0.01);
    }
  }));
  const rows = [x0 + 0.25, x1 - 0.25];
  for (let y = y0 + 0.4; y < y1 - 2.5; y += piles) {
    for (const x of rows) {
      T.post('hvWoodWet', x, y, WATER - 3, Q + bottom, 0.16, { kind: 'pole', name: 'pile' });
    }
    T.dress(() => {
      T.rod('hvWoodWet', [rows[0], y, WATER + 0.3], [rows[1], y, Q + bottom - 0.2], 0.1, 0.1);
    });
  }
  /* Bollards and a light at its end. */
  T.dress(() => {
    for (let y = y0 + 3; y < y1 - 4; y += 8) {
      T.cyl('hvBlack', [x0 + 0.3, y, Q + top], [x0 + 0.3, y, Q + top + 0.4], 0.14, 8);
      T.cyl('hvBlack', [x1 - 0.3, y, Q + top], [x1 - 0.3, y, Q + top + 0.4], 0.14, 8);
    }
  });
  T.post('hvBoatWhite', x0 + 0.4, y0 + 0.4, Q + top, Q + top + 3.2, 0.08, { kind: 'pole', name: 'pier light' });
  T.dress(() => T.wide(() => {
    T.bead('hvLamp', x0 + 0.4, y0 + 0.4, Q + top + 3.3, 0.22);
  }));
  /* Under it, a quad's clear window between the pile rows, under the
   * deck and over the water: the gap is flown north from the open sea. */
  return { px: (x0 + x1) / 2, py: y0 + 2.5, w: x1 - x0 - 0.5 - 2 * 0.16, h0: WATER + 0.3, h1: Q + bottom - 0.25 };
}

/* The breakwater, concrete on a mound of tetrapods, from the headland's
 * cliff out across the bay's mouth, with its red light on the end. */
function breakwater(T) {
  const { a, b, w, top } = BREAKWATER;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  const n = Math.ceil(len / 3);
  /* As a run of short boxes stepped along the line: the line is not on
   * an axis, and boxes are what the plant collides with. */
  for (let k = 0; k < n; k += 1) {
    const f0 = k / n;
    const f1 = (k + 1) / n;
    const px0 = a[0] + dx * f0;
    const px1 = a[0] + dx * f1;
    const py = a[1] + dy * ((f0 + f1) / 2);
    T.box('hvConcrete', Math.min(px0, px1) - 0.05, py - w / 2, WATER - 3.5, Math.max(px0, px1) + 0.05, py + w / 2, top, { kind: 'wall', name: 'breakwater' });
    /* The tetrapods on its sea side, a heap of four legged blocks. */
    T.dress(() => {
      for (let j = 0; j < 2; j += 1) {
        const tx = px0 + (px1 - px0) * (0.25 + 0.5 * j);
        const ty = py - w / 2 - 1.3 - hash2(k, j + 300) * 0.8;
        const th = WATER - 0.2 + hash2(k, j + 302) * 0.9;
        tetrapod(T, tx, ty, th, 1.1);
      }
    });
  }
  /* The light: a red tower on the west end. */
  const [lx, ly] = b;
  T.post('hvTorii', lx, ly, top, top + 7.5, 1.1, { kind: 'pole', name: 'light tower', seg: 12 });
  T.dress(() => T.wide(() => {
    T.disc('hvPlaster', lx, ly, 1.16, top + 5.2, top + 5.8, 14);
    T.disc('hvBlack', lx, ly, 1.5, top + 7.5, top + 7.7, 14);
    T.disc('hvLamp', lx, ly, 0.6, top + 7.7, top + 8.5, 10);
    T.cone('hvTorii', lx, ly, top + 8.5, 0.8, 0.7, 10);
  }));
  return { len };
}

function tetrapod(T, x, y, h, s) {
  T.cyl('hvConcrete', [x, y, h], [x, y, h + s], 0.32 * s, 6, 0.18 * s);
  T.cyl('hvConcrete', [x, y, h], [x + 0.9 * s, y + 0.35 * s, h - 0.35 * s], 0.32 * s, 6, 0.18 * s);
  T.cyl('hvConcrete', [x, y, h], [x - 0.6 * s, y + 0.7 * s, h - 0.35 * s], 0.32 * s, 6, 0.18 * s);
  T.cyl('hvConcrete', [x, y, h], [x - 0.3 * s, y - 0.85 * s, h - 0.35 * s], 0.32 * s, 6, 0.18 * s);
}

/* The road's tunnel into the headland: a concrete portal, its mouth dark. */
function tunnel(T) {
  const { x, py, w, h } = TUNNEL;
  const y0 = py - w / 2;
  const y1 = py + w / 2;
  T.box('hvConcrete', x, y0 - 3.5, Q - 0.5, x + 1.5, y0, Q + h + 2.4, { kind: 'wall', name: 'portal' });
  T.box('hvConcrete', x, y1, Q - 0.5, x + 1.5, y1 + 3.5, Q + h + 2.4, { kind: 'wall', name: 'portal' });
  T.box('hvConcrete', x, y0, Q + h, x + 1.5, y1, Q + h + 2.4, { kind: 'wall', name: 'portal' });
  T.box('hvBlack', x + 1.5, y0, Q - 0.5, x + 6, y1, Q + h, { kind: 'wall', name: 'tunnel' });
  T.dress(() => T.wide(() => {
    T.paint('hvConcrete', x - 0.2, y0 - 3.7, Q + h + 2.4, x + 1.7, y1 + 3.7, Q + h + 2.7);
    T.paint('hvLamp', x + 1.45, py - 0.4, Q + h - 0.4, x + 1.5, py + 0.4, Q + h - 0.2);
  }));
}

/* The quayside's clutter: nets on racks, floats, a fish drying rack, the
 * hoist, crates, a hose. */
function quayside(T) {
  T.dress(() => {
    /* Nets heaped on the quay, the green of trawl net and the orange of
     * floats, in front of the boat houses. */
    for (const x of [314, 330, 356, 370]) {
      T.deco('hvNet', x, QUAY.py - 0.6, Q, x + 2.6, QUAY.py + 0.4, Q + 0.55);
      T.bead('hvFloat', x + 0.4, QUAY.py - 0.2, Q + 0.6, 0.22);
      T.bead('hvFloat', x + 1.8, QUAY.py - 0.1, Q + 0.55, 0.22);
    }
    /* A rack of drying fish by the market. */
    for (const x of [398.5, 401.5]) {
      T.post('hvWood', x, 56, Q, Q + 1.9, 0.04);
    }
    T.rod('hvWood', [398.5, 56, Q + 1.85], [401.5, 56, Q + 1.85], 0.05, 0.05);
    for (let x = 398.8; x < 401.3; x += 0.35) {
      T.deco('hvStoneWarm', x, 55.97, Q + 1.1, x + 0.18, 56.03, Q + 1.8);
    }
  });
  /* The hoist on the quay east of the pier: a steel frame a quad can fly
   * through, and its hook. */
  const hx = 414;
  const hy = 52;
  for (const x of [hx, hx + 4]) {
    T.post('hvBoatTeal', x, hy, Q, Q + 5.5, 0.14, { kind: 'pole', name: 'hoist' });
  }
  T.box('hvBoatTeal', hx - 0.3, hy - 0.2, Q + 5.5, hx + 4.3, hy + 0.2, Q + 5.9, { kind: 'wall', name: 'hoist beam' });
  T.dress(() => {
    T.cyl('hvBlack', [hx + 2, hy, Q + 5.5], [hx + 2, hy, Q + 3.4], 0.02, 4);
    T.deco('hvRust', hx + 1.8, hy - 0.15, Q + 3.0, hx + 2.2, hy + 0.15, Q + 3.4);
    /* Crates and an ice box by the hoist. */
    T.deco('hvBoatBlue', 420, 51, Q, 422.4, 52.6, Q + 1.2);
    T.deco('hvPlaster', 423, 51, Q, 425.2, 53, Q + 1.6);
    T.deco('hvBoatTeal', 426, 51.4, Q, 427.4, 52.4, Q + 0.8);
  });
  /* The hamlet's houses behind the road, up the slope: plain plastered
   * houses with tiled roofs. */
  for (let i = 0; i < 6; i += 1) {
    const x0 = 314 + i * 13 + (i > 2 ? 8 : 0);
    const y0 = 69;
    const L = lotFrame(T, { x0, x1: x0 + 8.5, y0, y1: y0 + 7, face: 's', base: Math.max(Q, landAt(x0 + 4, y0 + 3.5)) });
    L.box('hvStone', -0.1, -0.1, -0.6, 8.6, 7.1, 0.3, { kind: 'wall', name: 'house base' });
    L.box(i % 2 ? 'hvPlasterWarm' : 'hvPlaster', 0, 0, 0.3, 8.5, 7, 5.2, { kind: 'wall', name: 'house' });
    gableRoof(L, {
      u0: 0, w: 8.5, v0: -0.6, v1: 7.6, wall: 5.2, pitch: 0.5, t: 0.22, oh: 0.6, m: i % 3 === 0 ? 'hvTileBlue' : 'hvTile', capM: 'hvTileEdge', gableM: i % 2 ? 'hvPlasterWarm' : 'hvPlaster', gables: [0, 6.8],
    });
    T.dress(() => T.wide(() => {
      L.paint('hvShoji', 1, -0.04, 1.0, 3.4, 0, 2.4);
      L.paint(i % 2 ? 'hvShojiLit' : 'hvShoji', 4.6, -0.04, 3.2, 7.4, 0, 4.4);
      L.paint('hvWoodDark', 5.0, -0.04, 0.3, 6.6, 0, 2.4);
    }));
  }
}
