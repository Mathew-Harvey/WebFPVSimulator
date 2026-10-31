/*
 * annex.js: the estate's other buildings. The shopping annex down the east
 * side of the courtyard, the covered bridge from its first floor to Block
 * 1's, the boiler house and the elevated water tank in the courtyard. The
 * chimney is the builder's own (a document element, ./yard.js).
 *
 * THE ANNEX. Three storeys of the low commercial block a large estate was
 * given at its gate: shops on the ground floor behind roller shutters, a
 * clinic over them, offices at the top. Its west face looks over the
 * courtyard: the ground floor's shop fronts, 3.6 m wide, and two windows a
 * bay on the floors above, with a corridor 2.4 m wide behind them the
 * length of the building, which is the window strafe. Its north end opens
 * under the bridge, and the bridge's first floor door opens into the
 * corridor's end.
 *
 * THE WATER TANK. Before a block had pumps of its own an estate lifted its
 * water to one tank on a frame of four concrete legs, tall enough to feed
 * the top floors by gravity, and the frames outlived the tanks. Here the
 * legs stand 6 m apart with ring beams at a third and two thirds of the
 * way, so between the legs is a 5.4 m window three times over, and the
 * panel tank is still on its deck at 19 m.
 *
 * REAL SIZES (metres): the annex's floors 3.4 floor to floor, a shop's;
 * its bays 5.5 on a 6 m deep plan; the bridge 3.4 wide outside, 2.4 high
 * inside; the boiler house 14 square and 6.5 high; the tank's legs 0.6
 * square, its panels the 1 m modules a panel tank is built from.
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

import { rng } from './frame.js';
import { wall, slab, rebar } from './bits.js';
import { BLOCK } from './danchi.js';

export const ANNEX = {
  x0: 120, x1: 132, y0: 44, y1: 88, bay: 5.5, n: 8,
  fh: 3.4, floors: 3, roof: 10.2, slab: 0.25, beam: 0.5, col: 0.5,
  /* the corridor behind the west windows: its inner wall's line */
  corr: 122.7,
};

export const LINK = { x0: 122.6, x1: 126.0, y0: ANNEX.y1, y1: BLOCK.yB, floor: 3.2, roof: 5.6, t: 0.15 };
export const BOILER = { x0: 58, x1: 72, y0: 56, y1: 70, h: 6.5, door0: 63, door1: 67, doorH: 4.0 };
export const TANK = { x0: 96, x1: 102, y0: 74, y1: 80, leg: 0.6, rings: [6.5, 13.0], deck: 19.0, top: 23.0 };

const bayY = (j) => ANNEX.y0 + j * ANNEX.bay;

/* The bay of the shop front the race goes in by, and of the broken out
 * windows on the first floor. */
export const SHOP_BAY = 6;
export const STRAFE_BAY = 3;

export function annex(T) {
  const A = ANNEX;
  const r = rng(0xa22e70);
  const lvl = (k) => k * A.fh;
  const xs = [A.x0, (A.x0 + A.x1) / 2, A.x1];

  /* COLUMNS AND BEAMS. */
  for (let j = 0; j <= A.n; j += 1) {
    for (const x of xs) {
      T.box('hkFrame', x - A.col / 2, bayY(j) - A.col / 2, 0, x + A.col / 2, bayY(j) + A.col / 2, A.roof, { name: 'column' });
    }
  }
  /* The holes: the roof's skylight fallen in over bay 2, the second
   * floor's floor holed under it, and a hole by the stair at bay 7. */
  const holes = [
    { k: 3, x0: 126.5, x1: 130.5, y0: bayY(2) + 1, y1: bayY(2) + 4.5 },
    { k: 2, x0: 127, x1: 130.5, y0: bayY(2) + 1.2, y1: bayY(2) + 4.3 },
    { k: 1, x0: 127.5, x1: 131, y0: bayY(7) + 1, y1: bayY(7) + 4.5 },
  ];
  for (let k = 1; k <= A.floors; k += 1) {
    const h = lvl(k);
    const hs = holes.filter((q) => q.k === k);
    slab(T, k === A.floors ? 'hkFelt' : 'slab', A.x0 - 0.25, A.y0 - 0.25, A.x1 + 0.25, A.y1 + 0.25, h - A.slab, h, hs, { name: k === A.floors ? 'roof' : 'floor' });
    T.dress(() => {
      for (const q of hs) {
        rebar(T, q.x0, q.y0, q.x1, q.y0, h - 0.12, 0, 1, r);
        rebar(T, q.x0, q.y1, q.x1, q.y1, h - 0.12, 0, -1, r);
        rebar(T, q.x0, q.y0, q.x0, q.y1, h - 0.12, 1, 0, r);
      }
    });
    for (const x of xs) {
      T.box('hkFrame', x - 0.2, A.y0, h - A.slab - A.beam, x + 0.2, A.y1, h - A.slab, { name: 'beam' });
    }
    for (let j = 0; j <= A.n; j += 1) {
      T.box('hkFrame', A.x0, bayY(j) - 0.2, h - A.slab - A.beam, A.x1, bayY(j) + 0.2, h - A.slab, { name: 'beam' });
    }
    T.wide(() => T.dress(() => {
      T.paint('hkBand', A.x0 - 0.27, A.y0 - 0.25, h - A.slab, A.x0 - 0.25, A.y1 + 0.25, h);
      T.paint('hkBand', A.x1 + 0.25, A.y0 - 0.25, h - A.slab, A.x1 + 0.27, A.y1 + 0.25, h);
    }));
  }
  /* The roof's parapet, its rooftop sign frame over the courtyard and its
   * cooling tower's base. */
  for (const [x0, y0, x1, y1] of [[A.x0 - 0.25, A.y0 - 0.25, A.x1 + 0.25, A.y0 - 0.05], [A.x0 - 0.25, A.y1 + 0.05, A.x1 + 0.25, A.y1 + 0.25],
    [A.x0 - 0.25, A.y0 - 0.25, A.x0 - 0.05, A.y1 + 0.25], [A.x1 + 0.05, A.y0 - 0.25, A.x1 + 0.25, A.y1 + 0.25]]) {
    T.box('hkRender', x0, y0, A.roof, x1, y1, A.roof + 1.0, { name: 'roof parapet' });
  }
  /* The sign frame: two lattice legs and the board, the shopping centre's
   * name faded on it, facing the courtyard. Under it is a line. */
  const sy0 = bayY(4) - 4;
  const sy1 = bayY(4) + 4;
  for (const y of [sy0 + 0.5, sy1 - 0.5]) {
    T.post('metal', 123, y, A.roof, A.roof + 3.6, 0.09, { name: 'sign leg' });
    T.post('metal', 125, y, A.roof, A.roof + 3.6, 0.09, { name: 'sign leg' });
  }
  T.box('billboardSteel', 122.8, sy0, A.roof + 3.6, 123.0, sy1, A.roof + 6.0, { name: 'roof sign' });
  T.sign('annexSign', 122.78, (sy0 + sy1) / 2, A.roof + 4.8, 7.6, 2.2, 'w');
  T.dress(() => {
    for (const y of [sy0 + 0.5, sy1 - 0.5]) {
      for (let h = A.roof + 0.4; h < A.roof + 3.4; h += 0.8) {
        T.cyl('metal', [123, y, h], [125, y, h + 0.6], 0.02, 3);
      }
    }
  });
  T.box('concreteWorn', 127.5, bayY(6), A.roof, 130.5, bayY(6) + 3, A.roof + 0.6, { name: 'plinth' });
  T.cyl('sheetBlue', [129, bayY(6) + 1.5, A.roof + 0.6], [129, bayY(6) + 1.5, A.roof + 2.4], 1.3, 10, 1.0);
  T.box('sheetBlue', 128.1, bayY(6) + 0.6, A.roof + 0.6, 129.9, bayY(6) + 2.4, A.roof + 2.4, { draw: false, name: 'cooling tower' });

  /* THE WEST FACE, over the courtyard. */
  for (let j = 0; j < A.n; j += 1) {
    const ya = bayY(j) + A.col / 2;
    const yb = bayY(j + 1) - A.col / 2;
    const ym = (ya + yb) / 2;
    /* The ground floor: a shop front, shutter up and the glass gone, or
     * shutter down. */
    const open = j === SHOP_BAY || r.chance(0.55);
    const front = { from: ym - 1.8, to: ym + 1.8, h0: 0, h1: 2.6 };
    wall(T, 'hkRender', 'y', A.x0, 0.2, ya, yb, 0, A.fh - A.slab, open ? [front] : [], { name: 'shop front' });
    T.dress(() => T.wide(() => {
      /* The shutter's box over the front and its guides, and the shutter
       * itself where it is down. */
      T.deco('bldShutterBox', A.x0 - 0.45, front.from - 0.1, 2.6, A.x0 - 0.1, front.to + 0.1, 3.0);
      if (!open) {
        T.paint('shutter', A.x0 - 0.13, front.from, 0.02, A.x0 - 0.1, front.to, 2.6);
        for (let h = 0.3; h < 2.6; h += 0.3) {
          T.paint('shutterLight', A.x0 - 0.14, front.from, h, A.x0 - 0.13, front.to, h + 0.05);
        }
      }
      /* The awning's frame, its canvas rotted off. */
      T.cyl('hkRust', [A.x0 - 1.4, front.from, 3.1], [A.x0 - 1.4, front.to, 3.1], 0.025, 4);
      T.cyl('hkRust', [A.x0 - 0.1, front.from, 3.35], [A.x0 - 1.4, front.from, 3.1], 0.02, 3);
      T.cyl('hkRust', [A.x0 - 0.1, front.to, 3.35], [A.x0 - 1.4, front.to, 3.1], 0.02, 3);
    }));
    T.sign(`shop${j % 6}`, A.x0 - 0.47, ym, 2.8, 3.4, 0.38, 'w');
    /* The floors over it: two windows a bay, or the pair broken out to one
     * hole at the strafe bay. */
    for (let k = 1; k < A.floors; k += 1) {
      const h = lvl(k);
      const ws = j === STRAFE_BAY && k === 1
        ? [{ from: ym - 1.8, to: ym + 1.8, h0: h + 0.5, h1: h + 2.55 }]
        : [{ from: ym - 2.1, to: ym - 0.5, h0: h + 0.9, h1: h + 2.3 }, { from: ym + 0.5, to: ym + 2.1, h0: h + 0.9, h1: h + 2.3 }];
      wall(T, 'hkRender', 'y', A.x0, 0.2, ya, yb, h, h + A.fh - A.slab, ws, { name: 'wall' });
      T.dress(() => T.wide(() => {
        for (const w of ws) {
          T.paint('hkSash', A.x0 - 0.12, w.from - 0.05, w.h0 - 0.06, A.x0 - 0.1, w.to + 0.05, w.h0);
          T.paint('hkStreak', A.x0 - 0.115, w.from + 0.15, w.h0 - 1.1, A.x0 - 0.1, w.from + 0.26, w.h0 - 0.06);
        }
      }));
    }
    /* The east face, to the street: windows on the floors, most of them
     * still glazed and grimed, a few broken. */
    for (let k = 0; k < A.floors; k += 1) {
      const h = lvl(k);
      const broken = r.chance(0.3);
      const ws = broken ? [{ from: ym - 0.8, to: ym + 0.8, h0: h + 0.9, h1: h + 2.3 }] : [];
      wall(T, 'hkRender', 'y', A.x1, 0.2, ya, yb, h, h + A.fh - A.slab, ws, { name: 'wall' });
      T.dress(() => T.wide(() => {
        if (!broken) {
          T.paint('glassDark', A.x1 + 0.1, ym - 0.8, h + 0.9, A.x1 + 0.12, ym + 0.8, h + 2.3);
          T.paint('hkSash', A.x1 + 0.12, ym - 0.02, h + 0.9, A.x1 + 0.14, ym + 0.02, h + 2.3);
        }
        T.paint('hkSash', A.x1 + 0.1, ym - 0.85, h + 0.84, A.x1 + 0.14, ym + 0.85, h + 0.9);
      }));
    }
  }

  /* The corridor's inner wall on the floors above, a doorway into each
   * room; on the top floor half of it is gone. */
  for (let k = 1; k < A.floors; k += 1) {
    const h = lvl(k);
    for (let j = 0; j < A.n; j += 1) {
      const ya = bayY(j) + A.col / 2;
      const yb = bayY(j + 1) - A.col / 2;
      if (k === 2 && r.chance(0.5)) {
        continue;
      }
      wall(T, 'hkWallpaper', 'y', A.corr, 0.15, ya, yb, h, h + A.fh - A.slab, [{ from: ya + 1.2, to: ya + 2.9, h0: h, h1: h + 2.1 }], { name: 'corridor wall' });
    }
    /* Room walls across, every other bay. */
    for (let j = 2; j < A.n; j += 2) {
      wall(T, 'hkWallpaper', 'x', bayY(j), 0.15, A.corr, A.x1 - A.col / 2, h, h + A.fh - A.slab, [{ from: 126.5, to: 129, h0: h, h1: h + 2.1 }], { name: 'room wall' });
    }
  }

  /* THE ENDS. The south gable is closed but for a door; the north end
   * opens under the bridge on the ground floor and into the bridge on the
   * first. */
  wall(T, 'hkRender', 'x', A.y0, 0.2, A.x0, A.x1, 0, A.roof, [{ from: 126.5, to: 129.7, h0: 0, h1: 2.6 }], { name: 'gable' });
  wall(T, 'hkRender', 'x', A.y1, 0.2, A.x0, A.x1, 0, A.roof, [
    { from: 126.4, to: 130.0, h0: 0, h1: 2.6 },
    { from: LINK.x0 + LINK.t, to: LINK.x1 - LINK.t, h0: A.fh, h1: LINK.roof },
  ], { name: 'gable' });
  T.sign('annexNo', 131, A.y0 - 0.13, 7.4, 1.6, 1.6, 's');

  /* The ground floor's shop walls across, three of them, holed. */
  for (const j of [2, 4, 6]) {
    wall(T, 'hkWallpaper', 'x', bayY(j), 0.15, A.x0, A.x1, 0, A.fh - A.slab, [{ from: 121.5, to: 124.5, h0: 0, h1: 2.4 }, { from: 127.5, to: 130.5, h0: 0, h1: 2.4 }], { name: 'shop wall' });
  }

  link(T);
  boiler(T, r);
  tank(T, r);
}

/* THE BRIDGE: a covered walk from the annex's first floor to Block 1's
 * balcony at bay 11, walled to waist height and glazed above with the
 * glass long gone. Under it, three metres of air. */
function link(T) {
  const L = LINK;
  T.box('slab', L.x0, L.y0, L.floor - 0.25, L.x1, L.y1, L.floor, { name: 'bridge floor' });
  T.box('hkFrame', L.x0, L.y0, L.floor - 0.75, L.x0 + 0.3, L.y1, L.floor - 0.25, { name: 'bridge beam' });
  T.box('hkFrame', L.x1 - 0.3, L.y0, L.floor - 0.75, L.x1, L.y1, L.floor - 0.25, { name: 'bridge beam' });
  for (const x of [L.x0, L.x1 - L.t]) {
    T.box('hkRender', x, L.y0, L.floor, x + L.t, L.y1, L.floor + 1.0, { name: 'bridge wall' });
    /* Window posts every 2 m. */
    for (let y = L.y0 + 2; y < L.y1 - 1; y += 2.4) {
      T.box('hkSash', x, y - 0.06, L.floor + 1.0, x + L.t, y + 0.06, L.roof, { name: 'bridge post' });
    }
  }
  T.box('hkRender', L.x0 - 0.1, L.y0, L.roof, L.x1 + 0.1, L.y1, L.roof + 0.3, { name: 'bridge roof' });
  T.dress(() => T.wide(() => {
    T.paint('hkBand', L.x0 - 0.12, L.y0, L.roof, L.x0 - 0.1, L.y1, L.roof + 0.3);
    T.paint('hkBand', L.x1 + 0.1, L.y0, L.roof, L.x1 + 0.12, L.y1, L.roof + 0.3);
  }));
}

/* THE BOILER HOUSE: block walls, a big door each end on the race's line,
 * two boilers either side of it and their pipes over it. */
function boiler(T, r) {
  const B = BOILER;
  const doors = [{ from: B.door0, to: B.door1, h0: 0, h1: B.doorH }];
  wall(T, 'block', 'x', B.y0, 0.25, B.x0, B.x1, 0, B.h, doors, { name: 'boiler wall' });
  wall(T, 'block', 'x', B.y1, 0.25, B.x0, B.x1, 0, B.h, doors, { name: 'boiler wall' });
  wall(T, 'block', 'y', B.x0, 0.25, B.y0, B.y1, 0, B.h, [{ from: 61, to: 64, h0: 2.2, h1: 3.8 }], { name: 'boiler wall' });
  wall(T, 'block', 'y', B.x1, 0.25, B.y0, B.y1, 0, B.h, [{ from: 61, to: 63, h0: 2.2, h1: 3.8 }, { from: 65.5, to: 67.5, h0: 2.2, h1: 3.8 }], { name: 'boiler wall' });
  slab(T, 'hkFelt', B.x0 - 0.2, B.y0 - 0.2, B.x1 + 0.2, B.y1 + 0.2, B.h, B.h + 0.3, [{ x0: 59.5, x1: 62.5, y0: 64, y1: 67.5 }], { name: 'boiler roof' });
  /* The boilers, on their plinths either side of the middle. */
  for (const x of [60.2, 69.8]) {
    T.box('concreteWorn', x - 1.5, 58.5, 0, x + 1.5, 67.5, 0.5, { name: 'plinth' });
    T.cap('tankPaint', [x, 59.2, 1.9], [x, 66.8, 1.9], 1.3, { look: 'capsule', seg: 10, name: 'boiler' });
    T.post('metal', x, 63, 3.1, B.h, 0.3, { name: 'boiler flue' });
  }
  T.dress(() => {
    /* The pipes over the door line, and the gauges. */
    for (const h of [5.3, 5.8]) {
      T.cyl('hkRust', [B.x0 + 0.3, 62, h], [B.x1 - 0.3, 62, h], 0.09, 6);
      T.cyl('hkRust', [B.x0 + 0.3, 68.5, h], [B.x1 - 0.3, 68.5, h], 0.09, 6);
    }
    T.cyl('metalDark', [60.2, 58.5, 3.4], [60.2, 58.4, 3.4], 0.2, 8);
    T.cyl('metalDark', [69.8, 58.5, 3.4], [69.8, 58.4, 3.4], 0.2, 8);
    /* The fallen roof's pieces on the floor under the hole. */
    for (let n = 0; n < 5; n += 1) {
      const x = r.range(59.6, 62.4);
      const y = r.range(64, 67.5);
      T.deco('rubble', x - 0.5, y - 0.4, 0, x + 0.5, y + 0.4, r.range(0.15, 0.4));
    }
  });
  T.sign('boilerSign', 65, B.y1 + 0.14, B.doorH + 0.7, 2.6, 0.7, 'n');
  T.sign('danger', 62.2, B.y0 - 0.14, 2.0, 0.9, 1.1, 's');
}

/* THE ELEVATED TANK: four legs, ring beams at two heights, a deck and the
 * panel tank on it, a cage ladder up the north west leg. */
function tank(T, r) {
  const K = TANK;
  const legs = [[K.x0, K.y0], [K.x1, K.y0], [K.x0, K.y1], [K.x1, K.y1]];
  for (const [x, y] of legs) {
    T.box('hkFrame', x - K.leg / 2, y - K.leg / 2, 0, x + K.leg / 2, y + K.leg / 2, K.deck, { name: 'tank leg' });
  }
  for (const h of [...K.rings, K.deck]) {
    T.box('hkFrame', K.x0, K.y0 - 0.2, h - 0.5, K.x1, K.y0 + 0.2, h, { name: 'ring beam' });
    T.box('hkFrame', K.x0, K.y1 - 0.2, h - 0.5, K.x1, K.y1 + 0.2, h, { name: 'ring beam' });
    T.box('hkFrame', K.x0 - 0.2, K.y0, h - 0.5, K.x0 + 0.2, K.y1, h, { name: 'ring beam' });
    T.box('hkFrame', K.x1 - 0.2, K.y0, h - 0.5, K.x1 + 0.2, K.y1, h, { name: 'ring beam' });
  }
  T.box('slab', K.x0 - 1, K.y0 - 1, K.deck, K.x1 + 1, K.y1 + 1, K.deck + 0.35, { name: 'tank deck' });
  /* The tank: panels a metre square, ribbed. */
  const h0 = K.deck + 0.35;
  T.box('hkTankPanel', K.x0 + 0.5, K.y0 + 0.5, h0, K.x1 - 0.5, K.y1 - 0.5, K.top, { name: 'tank' });
  T.wide(() => T.dress(() => {
    for (let a = K.x0 + 1.5; a < K.x1 - 0.5; a += 1) {
      T.paint('hkTankRib', a - 0.04, K.y0 + 0.47, h0, a + 0.04, K.y0 + 0.5, K.top);
      T.paint('hkTankRib', a - 0.04, K.y1 - 0.5, h0, a + 0.04, K.y1 - 0.47, K.top);
    }
    for (let a = K.y0 + 1.5; a < K.y1 - 0.5; a += 1) {
      T.paint('hkTankRib', K.x0 + 0.47, a - 0.04, h0, K.x0 + 0.5, a + 0.04, K.top);
      T.paint('hkTankRib', K.x1 - 0.5, a - 0.04, h0, K.x1 - 0.47, a + 0.04, K.top);
    }
    for (let h = h0 + 1; h < K.top; h += 1) {
      T.paint('hkTankRib', K.x0 + 0.47, K.y0 + 0.47, h - 0.04, K.x1 - 0.47, K.y0 + 0.5, h + 0.04);
      T.paint('hkTankRib', K.x0 + 0.47, K.y1 - 0.5, h - 0.04, K.x1 - 0.47, K.y1 - 0.47, h + 0.04);
    }
  }));
  T.sign('tankNo', (K.x0 + K.x1) / 2, K.y0 + 0.46, K.top - 1.3, 3.0, 1.2, 's');
  /* The deck's railing, a ladder cage up the north west leg, the hatch. */
  T.dress(() => {
    const e = [K.x0 - 0.95, K.y0 - 0.95, K.x1 + 0.95, K.y1 + 0.95];
    const top = K.deck + 0.35 + 1.1;
    T.cyl('hkRust', [e[0], e[1], top], [e[2], e[1], top], 0.03, 4);
    T.cyl('hkRust', [e[2], e[1], top], [e[2], e[3], top], 0.03, 4);
    T.cyl('hkRust', [e[2], e[3], top], [e[0], e[3], top], 0.03, 4);
    T.cyl('hkRust', [e[0], e[3], top], [e[0], e[1], top], 0.03, 4);
    for (const [x, y] of [[e[0], e[1]], [e[2], e[1]], [e[0], e[3]], [e[2], e[3]]]) {
      T.cyl('hkRust', [x, y, K.deck + 0.35], [x, y, top], 0.03, 4);
    }
    const lx = K.x0 - 0.55;
    const ly = K.y1;
    T.cyl('hkRust', [lx, ly - 0.25, 2.2], [lx, ly - 0.25, K.deck + 0.35], 0.025, 3);
    T.cyl('hkRust', [lx, ly + 0.25, 2.2], [lx, ly + 0.25, K.deck + 0.35], 0.025, 3);
    for (let h = 2.4; h < K.deck; h += 0.3) {
      T.cyl('hkRust', [lx, ly - 0.25, h], [lx, ly + 0.25, h], 0.015, 3);
    }
    for (let h = 4.4; h < K.deck; h += 1.0) {
      T.torus('hkRust', lx - 0.35, ly, h, 0.42, 0.02, 0, 0, 3, 12);
    }
    T.box('metalDark', 98.5, 76.5, K.top, 99.5, 77.5, K.top + 0.12, { solid: false });
    /* Moss on the deck's edge and streaks down the legs. */
    for (const [x, y] of legs) {
      T.paint('hkStreak', x - 0.31, y - 0.15, 0.5, x - 0.3, y + 0.05, K.deck - 0.5);
    }
    T.paint('hkMossSlab', K.x0 - 1, K.y0 - 1, K.deck + 0.35, K.x0 + 1.5, K.y1 + 1, K.deck + 0.37);
  });
  void r;
}

/* The named gaps these give (./plan.js lists them all). */
export function annexGaps() {
  const M = 0.3;
  const A = ANNEX;
  const shop = bayY(SHOP_BAY) + A.bay / 2;
  const strafe = bayY(STRAFE_BAY) + A.bay / 2;
  return {
    shop: { name: 'THE SHOP FRONT', px: A.x0, py: shop, deg: 0, w: 3.6 - 2 * M, h0: M, h1: 2.6 - M, points: 250 },
    back: { name: 'THE BACK DOOR', px: 128.2, py: A.y1, deg: 90, w: 3.6 - 2 * M, h0: M, h1: 2.6 - M, points: 250 },
    strafe: { name: 'THE STRAFE', px: A.x0, py: strafe, deg: 0, w: 3.6 - 2 * M, h0: A.fh + 0.5 + M, h1: A.fh + 2.55 - M, points: 500 },
    link: { name: 'THE BRIDGE', px: (LINK.x0 + LINK.x1) / 2, py: (LINK.y0 + LINK.y1) / 2 + 1.2, deg: 90, w: LINK.x1 - LINK.x0 - 2 * LINK.t - 2 * M, h0: LINK.floor + M, h1: LINK.roof - M, points: 1000 },
    under: { name: 'UNDER THE BRIDGE', px: (LINK.x0 + LINK.x1) / 2, py: (LINK.y0 + LINK.y1) / 2, deg: 0, w: LINK.y1 - LINK.y0 - 0.4 - 2 * M, h0: M, h1: LINK.floor - 0.75 - M, points: 500 },
    boiler: { name: 'THE BOILER HOUSE', px: (BOILER.door0 + BOILER.door1) / 2, py: BOILER.y1, deg: 270, w: BOILER.door1 - BOILER.door0 - 2 * M, h0: M, h1: BOILER.doorH - M, points: 250 },
    tank: { name: 'THE TANK LEGS', px: (TANK.x0 + TANK.x1) / 2, py: (TANK.y0 + TANK.y1) / 2, deg: 0, w: TANK.y1 - TANK.y0 - TANK.leg - 2 * M, h0: M, h1: TANK.rings[0] - 0.5 - M, points: 250 },
  };
}
