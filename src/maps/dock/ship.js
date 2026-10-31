/*
 * ship.js: the harbour side of Kamome Wharf. The container ship alongside,
 * her boxes on deck, her house and funnel at the stern; the tug at the west
 * end; the breakwater with its tetrapods and its red light.
 *
 * THE SHIP is a feeder of about two hundred and fifty metres, which is what
 * a berth like this one works: 32 m in the beam, ten metres of freeboard,
 * twelve rows of 40 ft boxes across her hatch lids, the house aft. She lies
 * seven metres off the fenders, and that channel between her black side and
 * the quay's wall, open to the sky and floored with the harbour, is the
 * strafe line. Her hull is one box and her bow a polygon stood up (../frame.js
 * slab), solid as boxes stepped inside it.
 *
 * Her name, TSUBAME MARU, and her line's mark on the funnel are our own.
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

import { rng, WATER_H, QUAY_Y } from './frame.js';
import { SHIP, BOX, TUG, BREAKWATER } from './site.js';
import { stackField, BOX_COLOURS } from './yard.js';

const BOOT = -1.0;

/* Whether a window is lit, from where it is: a fixed hash. */
function lit(a, b) {
  let h = Math.imul(Math.round(a * 8) + 7, 0x9e3779b1) ^ Math.imul(Math.round(b * 8) + 3, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) / 4294967296) < 0.55;
}

function hull(T) {
  const S = SHIP;
  /* Red under the boot line, the hull's navy over it. */
  T.box('dkHullRed', S.x0, S.y0, S.keel, S.x1, S.y1, BOOT, { solid: false, cast: false });
  T.box('dkHull', S.x0, S.y0, BOOT, S.x1, S.y1, S.deck, { solid: false });
  T.hidden(S.x0, S.y0, S.keel, S.x1, S.y1, S.deck, 'wall', 'hull');
  /* The bow, the forecastle raised over it. */
  const m = (S.y0 + S.y1) / 2;
  const bow = [[S.x1, S.y0], [S.x1 + 9, S.y0 + 3.5], [S.bow, m], [S.x1 + 9, S.y1 - 3.5], [S.x1, S.y1]];
  T.slab('dkHullRed', bow, S.keel, BOOT);
  T.slab('dkHull', bow, BOOT, S.fo.h);
  T.box('dkHull', S.fo.x0, S.y0, S.deck, S.x1, S.y1, S.fo.h, { solid: false });
  T.hidden(S.fo.x0, S.y0, S.deck, S.x1, S.y1, S.fo.h, 'wall', 'forecastle');
  for (const [x0, x1, y0, y1] of [[300, 302, 256.8, 287.2], [302, 305, 258.0, 286.0], [305, 308, 259.2, 284.8], [308, 311, 263.7, 280.3], [311, 314, 270.0, 274.0]]) {
    T.hidden(x0, y0, S.keel, x1, y1, S.fo.h, 'wall', 'bow');
  }
  /* The sheer line, the deck's paint, the name at the bow and the stern,
   * the draught marks, the hawse pipes. */
  T.wide(() => T.dress(() => {
    for (const [y, o] of [[S.y0, -0.03], [S.y1, 0.03]]) {
      T.paint('dkHouse', S.x0, Math.min(y, y + o), S.deck - 0.75, S.x1, Math.max(y, y + o), S.deck - 0.45);
      for (const x of [S.x0 + 3, S.x1 - 4]) {
        for (let h = -1.8; h < S.deck - 2; h += 1.0) {
          T.paint('dkHouse', x, Math.min(y, y + o * 1.3), h, x + 0.5, Math.max(y, y + o * 1.3), h + 0.12);
        }
      }
    }
    T.paint('dkDeck', S.x0 + 0.3, S.y0 + 0.3, S.deck, S.fo.x0, S.y1 - 0.3, S.deck + 0.02);
  }));
  T.sign('shipName', S.x1 - 10, S.y0, S.fo.h - 2.4, 14, 2.6, 's', 0.04);
  T.sign('shipName', S.x1 - 10, S.y1, S.fo.h - 2.4, 14, 2.6, 'n', 0.04);
  T.sign('shipStern', S.x0, m, S.deck - 2.6, 12, 3.2, 'w', 0.04);
  T.dress(() => {
    for (const y of [S.y0 + 0.9, S.y1 - 0.9]) {
      T.cyl('dkIron', [S.x1 + 4, y < m ? y - 1.2 : y + 1.2, S.fo.h - 1.6], [S.x1 + 4, y, S.fo.h - 1.6], 0.55, 10);
    }
  });
}

function deck(T) {
  const S = SHIP;
  const R = rng(4242);
  /* The bays, aft to fore, and their hatch lids. */
  const slots = [];
  for (let b = 0; b < S.bays; b += 1) {
    const x0 = S.bayX0 + b * S.bayPitch + 0.4;
    slots.push({ x0, x1: x0 + BOX.l40 });
  }
  const rowW = BOX.w + 0.03;
  const across = S.rows * rowW - 0.03;
  const ry0 = (S.y0 + S.y1) / 2 - across / 2;
  const rows = [];
  for (let r = 0; r < S.rows; r += 1) {
    rows.push({ y0: ry0 + r * rowW, y1: ry0 + r * rowW + BOX.w });
  }
  const lid = 0.8;
  T.hidden(slots[0].x0 - 0.2, ry0 - 0.6, S.deck, slots[slots.length - 1].x1 + 0.2, ry0 + across + 0.6, S.deck + lid, 'wall', 'hatch lids');
  for (const sl of slots) {
    T.box('dkHatch', sl.x0 - 0.2, ry0 - 0.6, S.deck, sl.x1 + 0.2, ry0 + across + 0.6, S.deck + lid, { solid: false });
    T.dress(() => T.wide(() => {
      for (const k of [0.33, 0.66]) {
        const y = ry0 - 0.6 + (across + 1.2) * k;
        T.paint('dkIron', sl.x0 - 0.21, y - 0.05, S.deck + lid - 0.01, sl.x1 + 0.21, y + 0.05, S.deck + lid + 0.012);
      }
    }));
  }
  /* The stacks: tall amidships, stepping down to the bow and toward the
   * house so the bridge sees over them, a box lower on the outboard rows. */
  const tiers = [3, 4, 5, 5, 4, 5, 5, 4, 5, 5, 4, 4, 3, 3, 2];
  const h = rows.map((_, r) => slots.map((_, b) => {
    let v = tiers[b];
    if (r === 0 || r === S.rows - 1) {
      v -= 1;
    }
    if (R.chance(0.18)) {
      v -= 1;
    }
    return Math.max(0, v);
  }));
  stackField(T, { slots, rows, h, base: S.deck + lid, seed: 777, colours: BOX_COLOURS, logos: 0.35, doors: 'w' });
  /* The lashing bridges between the bays, two tiers high, walkways and
   * rails; drawn only, in the 0.8 m a quad never fits. */
  T.dress(() => {
    for (let b = 1; b < S.bays; b += 1) {
      const x = S.bayX0 + b * S.bayPitch;
      for (const hh of [S.deck + lid + BOX.h, S.deck + lid + 2 * BOX.h]) {
        T.deco('grating', x - 0.35, ry0, hh - 0.08, x + 0.35, ry0 + across, hh);
        T.cyl('mastWhite', [x, ry0, hh + 1.0], [x, ry0 + across, hh + 1.0], 0.025, 3);
      }
      for (let y = ry0; y <= ry0 + across + 0.01; y += across / 4) {
        T.cyl('metalDark', [x, y, S.deck + lid], [x, y, S.deck + lid + 2 * BOX.h + 1.0], 0.05, 4);
      }
    }
  });
}

function house(T) {
  const S = SHIP;
  const Hs = S.house;
  /* The decks of the house, each a little narrower than the one under it,
   * a band of windows round each. */
  const levels = 6;
  const step = (Hs.top - 4 - S.deck) / (levels - 1);
  for (let k = 0; k < levels - 1; k += 1) {
    const h0 = S.deck + k * step;
    const h1 = h0 + step;
    const inset = k * 0.15;
    T.box('dkHouse', Hs.x0 + inset, Hs.y0 + inset, h0, Hs.x1 - inset, Hs.y1 - inset, h1, { name: 'house' });
    T.wide(() => T.dress(() => {
      for (let y = Hs.y0 + 1.5; y < Hs.y1 - 1.5; y += 2.4) {
        T.paint(lit(y, h0) ? 'glassLit' : 'glassDark', Hs.x1 - inset - 0.01, y, h0 + 1.2, Hs.x1 - inset + 0.03, y + 1.4, h0 + 2.4);
        T.paint(lit(y + 1, h0) ? 'glassLit' : 'glassDark', Hs.x0 + inset - 0.03, y, h0 + 1.2, Hs.x0 + inset + 0.01, y + 1.4, h0 + 2.4);
      }
      for (let x = Hs.x0 + 1.5; x < Hs.x1 - 1.5; x += 2.4) {
        T.paint(lit(x, h0 + 1) ? 'glassLit' : 'glassDark', x, Hs.y0 + inset - 0.03, h0 + 1.2, x + 1.4, Hs.y0 + inset + 0.01, h0 + 2.4);
        T.paint(lit(x + 1, h0 + 2) ? 'glassLit' : 'glassDark', x, Hs.y1 - inset - 0.01, h0 + 1.2, x + 1.4, Hs.y1 - inset + 0.03, h0 + 2.4);
      }
      T.cyl('mastWhite', [Hs.x0 + inset, Hs.y0 + inset - 0.3, h1 + 1.0], [Hs.x1 - inset, Hs.y0 + inset - 0.3, h1 + 1.0], 0.025, 3);
      T.cyl('mastWhite', [Hs.x0 + inset, Hs.y1 - inset + 0.3, h1 + 1.0], [Hs.x1 - inset, Hs.y1 - inset + 0.3, h1 + 1.0], 0.025, 3);
    }));
  }
  /* The bridge, full width and out over both sides on its wings. */
  T.box('dkHouse', Hs.x0 + 0.8, S.y0 - 2.5, Hs.wing, Hs.x1 - 0.8, S.y1 + 2.5, Hs.top, { name: 'bridge' });
  T.box('dkHull', Hs.x0 + 0.6, S.y0 - 2.7, Hs.top, Hs.x1 - 0.6, S.y1 + 2.7, Hs.top + 0.4, { name: 'bridge roof' });
  T.wide(() => T.dress(() => {
    for (let y = S.y0 - 2.2; y < S.y1 + 2.2; y += 1.6) {
      T.paint(lit(y, 3) ? 'glassLit' : 'glassDark', Hs.x1 - 0.81, y, Hs.wing + 1.2, Hs.x1 - 0.77, y + 1.3, Hs.top - 0.8);
    }
  }));
  T.ball('lampRed', Hs.x1 - 1.4, S.y1 + 2.6, Hs.wing + 2.5, 0.2);
  T.ball('glassLit', Hs.x1 - 1.4, S.y0 - 2.6, Hs.wing + 2.5, 0.2);
  /* The mast on the bridge roof, its radar and its yard. */
  T.post('metal', (Hs.x0 + Hs.x1) / 2, (S.y0 + S.y1) / 2, Hs.top + 0.4, Hs.top + 9, 0.22, { name: 'ship mast' });
  T.box('dkHull', (Hs.x0 + Hs.x1) / 2 - 0.3, (S.y0 + S.y1) / 2 - 3.2, Hs.top + 5.6, (Hs.x0 + Hs.x1) / 2 + 0.3, (S.y0 + S.y1) / 2 + 3.2, Hs.top + 5.9, { name: 'radar' });
  T.ball('lampGlow', (Hs.x0 + Hs.x1) / 2, (S.y0 + S.y1) / 2, Hs.top + 9.3, 0.18);
  /* The lifeboat, orange, on her ramp off the house's south side. */
  T.box('containerOrange', Hs.x0 + 2, Hs.y0 - 2.6, S.deck + 6.5, Hs.x0 + 10, Hs.y0, S.deck + 9.0, { name: 'lifeboat' });
  T.paint('glassDark', Hs.x0 + 3, Hs.y0 - 2.62, S.deck + 8.0, Hs.x0 + 6, Hs.y0 - 2.58, S.deck + 8.6);
  /* The funnel, its band and the line's mark, its black top. */
  const F = S.funnel;
  T.box('dkFunnel', F.x0, F.y0, S.deck, F.x1, F.y1, F.top - 1.5, { name: 'funnel' });
  T.box('dkIron', F.x0 - 0.1, F.y0 - 0.1, F.top - 1.5, F.x1 + 0.1, F.y1 + 0.1, F.top, { name: 'funnel top' });
  T.wide(() => T.dress(() => {
    T.paint('dkHouse', F.x0 - 0.03, F.y0 - 0.03, F.top - 7.5, F.x1 + 0.03, F.y1 + 0.03, F.top - 4.5);
  }));
  T.sign('funnel', (F.x0 + F.x1) / 2, F.y0, F.top - 6.0, 4.2, 2.6, 's', 0.05);
  T.sign('funnel', (F.x0 + F.x1) / 2, F.y1, F.top - 6.0, 4.2, 2.6, 'n', 0.05);
}

function forecastle(T) {
  const S = SHIP;
  const m = (S.y0 + S.y1) / 2;
  T.post('metal', S.x1 + 4, m, S.fo.h, S.fo.h + 13, 0.3, { name: 'foremast' });
  T.cap('metal', [S.x1 + 4, m - 3, S.fo.h + 10], [S.x1 + 4, m + 3, S.fo.h + 10], 0.14, { name: 'foremast yard' });
  T.ball('lampGlow', S.x1 + 4, m, S.fo.h + 13.4, 0.2);
  for (const y of [S.y0 + 5, S.y1 - 5]) {
    T.cyl('dkHatch', [S.x1 - 1, y - 1.2, S.fo.h + 0.9], [S.x1 - 1, y + 1.2, S.fo.h + 0.9], 0.9, 10);
    T.hidden(S.x1 - 1.6, y - 1.2, S.fo.h, S.x1 - 0.4, y + 1.2, S.fo.h + 1.6, 'wall', 'winch');
  }
  T.dress(() => {
    for (const y of [S.y0 + 0.4, S.y1 - 0.4]) {
      T.cyl('mastWhite', [S.fo.x0, y, S.fo.h + 1.0], [S.x1 + 9, y < m ? S.y0 + 3.9 : S.y1 - 3.9, S.fo.h + 1.0], 0.03, 3);
    }
  });
}

/* The lines from her bow and stern to the quay's bollards; cables, drawn
 * and never solid, as every map's are. */
function lines(T) {
  const S = SHIP;
  const Q = QUAY_Y - 1.4;
  for (const [x, bx] of [[S.x1 - 4, 312], [S.x1 - 8, 272], [S.x0 + 6, 52], [S.x0 + 10, 92]]) {
    T.wire('rope', [x, S.y0 + 0.2, S.deck + 0.6], [bx, Q, 0.75], 1.6, 0.05);
  }
}

function tug(T) {
  const G = TUG;
  const y0 = G.y - G.beam / 2;
  const y1 = G.y + G.beam / 2;
  const top = WATER_H + 3.4;
  T.box('dkHullRed', G.x0, y0, WATER_H - 2.5, G.x1 - 4, y1, top, { solid: false });
  T.slab('dkHullRed', [[G.x1 - 4, y0], [G.x1, G.y - 1.5], [G.x1, G.y + 1.5], [G.x1 - 4, y1]], WATER_H - 2.5, top + 0.6);
  T.hidden(G.x0, y0, WATER_H - 2.5, G.x1 - 4, y1, top, 'wall', 'tug');
  T.box('dkHouse', G.x0 + 8, y0 + 1.6, top, G.x0 + 17, y1 - 1.6, top + 3.2, { name: 'tug house' });
  T.box('dkHouse', G.x0 + 10, y0 + 2.0, top + 3.2, G.x0 + 16, y1 - 2.0, top + 5.4, { name: 'tug wheelhouse' });
  T.box('dkHull', G.x0 + 9.8, y0 + 1.8, top + 5.4, G.x0 + 16.2, y1 - 1.8, top + 5.7, { name: 'tug roof' });
  T.wide(() => T.dress(() => {
    T.paint('glassLit', G.x0 + 16.01, y0 + 2.4, top + 3.7, G.x0 + 16.05, y1 - 2.4, top + 4.9);
    for (const [y, o] of [[y0 + 2.0, -1], [y1 - 2.0, 1]]) {
      T.paint('glassDark', G.x0 + 10.6, Math.min(y, y + o * 0.04), top + 3.7, G.x0 + 15.4, Math.max(y, y + o * 0.04), top + 4.9);
    }
    T.paint('dkHouse', G.x0, y0 - 0.02, top - 0.5, G.x1 - 4, y1 + 0.02, top - 0.2);
  }));
  T.post('metal', G.x0 + 13, G.y, top + 5.7, top + 10, 0.12, { name: 'tug mast' });
  T.ball('lampGlow', G.x0 + 13, G.y, top + 10.2, 0.15);
  T.dress(() => {
    for (let x = G.x0 + 1; x < G.x1 - 5; x += 2.2) {
      T.cyl('dkTyre', [x, y0 - 0.35, top - 1.0], [x, y0 - 0.35, top - 0.2], 0.45, 8);
      T.cyl('dkTyre', [x, y1 + 0.35, top - 1.0], [x, y1 + 0.35, top - 0.2], 0.45, 8);
    }
    T.cyl('dkBollard', [G.x0 + 3, G.y, top], [G.x0 + 3, G.y, top + 0.9], 0.3, 8);
  });
  T.sign('tug', G.x0 + 21, y0, top - 1.6, 4.4, 1.0, 's', 0.03);
}

function breakwater(T) {
  const B = BREAKWATER;
  T.box('concreteMid', B.x0, B.y0, WATER_H - 3, B.x1, B.y1, 2.0, { name: 'breakwater' });
  T.wide(() => T.dress(() => {
    T.paint('concreteDark', B.x0, B.y0 - 0.02, WATER_H - 0.3, B.x1, B.y1 + 0.02, WATER_H + 0.5);
  }));
  /* The tetrapods piled against its harbour face. */
  const R = rng(51);
  T.dress(() => {
    for (let x = B.x0 + 14; x < B.x1; x += 2.6) {
      for (let k = 0; k < 2; k += 1) {
        const cx = x + R.range(-0.6, 0.6);
        const cy = B.y0 - 1.4 - k * 1.8;
        const ch = WATER_H + 0.4 + (1 - k) * 1.0;
        const a = R.range(0.6, 1.0);
        T.cyl('dkPod', [cx, cy, ch], [cx, cy, ch + 1.3], 0.38, 6, 0.2);
        T.cyl('dkPod', [cx, cy, ch], [cx + 1.1 * a, cy - 0.4, ch - 0.5], 0.38, 6, 0.2);
        T.cyl('dkPod', [cx, cy, ch], [cx - 0.6, cy + 0.9 * a, ch - 0.5], 0.38, 6, 0.2);
        T.cyl('dkPod', [cx, cy, ch], [cx - 0.5, cy - 0.9, ch - 0.5], 0.38, 6, 0.2);
      }
    }
  });
  /* The red light at its end. */
  const [lx, ly] = B.light;
  T.post('dkLight', lx, ly, 2.0, 13.6, 1.5, { name: 'lighthouse', seg: 14 });
  T.disc('dkHouse', lx, ly, 2.2, 13.6, 13.9, 14);
  T.hidden(lx - 1.5, ly - 1.5, 13.6, lx + 1.5, ly + 1.5, 13.9, 'wall', 'lighthouse gallery');
  T.cyl('lampRed', [lx, ly, 13.9], [lx, ly, 15.4], 0.9, 10);
  T.cone('dkLight', lx, ly, 15.4, 1.2, 1.4, 10);
  T.hidden(lx - 0.8, ly - 0.8, 13.9, lx + 0.8, ly + 0.8, 16.0, 'wall', 'lantern');
  T.wide(() => T.dress(() => {
    T.disc('dkHouse', lx, ly, 1.53, 7.2, 8.0, 14);
  }));
  T.dress(() => {
    T.cyl('dkHouse', [lx - 2.2, ly, 14.9], [lx + 2.2, ly, 14.9], 0.03, 3);
    T.cyl('dkHouse', [lx, ly - 2.2, 14.9], [lx, ly + 2.2, 14.9], 0.03, 3);
  });
}

/* The water's sparkle: short pale strokes on the harbour round the ship,
 * the channel and the tug, paint on the water. */
function waves(T) {
  const R = rng(99);
  T.wide(() => T.dress(() => {
    for (let i = 0; i < 160; i += 1) {
      const x = R.range(-20, 460);
      const y = R.range(QUAY_Y + 1.5, 340);
      if (x > SHIP.x0 - 1 && x < SHIP.bow + 1 && y > SHIP.y0 - 1 && y < SHIP.y1 + 1) {
        continue;
      }
      const l = R.range(1.2, 3.4);
      T.paint('dkWave', x, y, WATER_H + 0.01, x + l, y + 0.14, WATER_H + 0.03);
    }
  }));
}

export function harbour(T) {
  hull(T);
  deck(T);
  house(T);
  forecastle(T);
  lines(T);
  tug(T);
  breakwater(T);
  waves(T);
}

/* The channel between the quay's fenders and the ship's side. */
export const CHANNEL = { y0: QUAY_Y + 0.9, y1: SHIP.y0 };
