/*
 * land.js: the landside of Kamome Wharf and its plaza. The old brick
 * warehouse with its arcade through the middle, the drivers' rest stop, the
 * gate with its booths under the canopy, the office and its control cab, the
 * fence, and on the plaza at the quay's west end the red port tower.
 *
 * THE PORT TOWER is a lattice of straight red tubes between two rings,
 * each tube turned a third of the way round from its foot to its head, so
 * the tubes together draw the waisted drum a hyperboloid is: the shape a
 * Japanese harbour has stood a tower in since the sixties, and none of them
 * in particular. Every tube is a capsule, drawn and solid from the same
 * two points; the points come from ../../props/trig.js, never from JS
 * trigonometry, because the solids reach the physics.
 *
 * The vending machines, the poles and their wires, the lamps, the parked
 * cars and the trees are the town's own assets, in the document
 * (./doc.js), so they are drawn and lit at dusk the way the town's are.
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

import { sincos } from '../../props/trig.js';
import { W, QUAY_Y } from './frame.js';
import { WAREHOUSE, REST, GATE, OFFICE, FENCE_Y, TOWER } from './site.js';

/* Whether a window is lit, from where it is. */
function lit(a, b, share = 0.5) {
  let h = Math.imul(Math.round(a * 8) + 11, 0x9e3779b1) ^ Math.imul(Math.round(b * 8) + 5, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) / 4294967296) < share;
}

/* ---- the brick warehouse ---- */

function warehouse(T) {
  const B = WAREHOUSE;
  const [p0, p1] = B.pass;
  /* The walls, solid either side of the arcade and over it. */
  T.box('dkBrick', B.x0, B.y0, 0, p0, B.y1, B.wall, { name: 'warehouse' });
  T.box('dkBrick', p1, B.y0, 0, B.x1, B.y1, B.wall, { name: 'warehouse' });
  T.box('dkBrick', p0, B.y0, B.passH, p1, B.y1, B.wall, { name: 'warehouse arch' });
  /* The arcade's floor, its lamps, its walls inside. */
  T.paint('dkStone', p0, B.y0, 0, p1, B.y1, 0.03);
  for (const y of [B.y0 + 5, (B.y0 + B.y1) / 2, B.y1 - 5]) {
    T.box('lampGlow', (p0 + p1) / 2 - 0.25, y - 0.25, B.passH - 0.35, (p0 + p1) / 2 + 0.25, y + 0.25, B.passH, { solid: false, cast: false });
  }
  /* The roof, gabled along the length, slate over a stone cornice, and
   * its solid stepped inside the slope. */
  const ym = (B.y0 + B.y1) / 2;
  T.box('dkStone', B.x0 - 0.3, B.y0 - 0.3, B.wall - 0.5, B.x1 + 0.3, B.y1 + 0.3, B.wall, { solid: false });
  T.prism('dkSlate', 'x', [[B.y0 - 0.6, B.wall - 0.1], [ym, B.ridge], [B.y1 + 0.6, B.wall - 0.1]], B.x0 - 0.6, B.x1 + 0.6);
  T.stepped({ x0: B.x0, x1: B.x1, y0: B.y0, y1: B.y1 }, B.wall, { x0: B.x0, x1: B.x1, y0: ym - 0.6, y1: ym + 0.6 }, B.ridge - 0.3, 5, 'warehouse roof');
  /* The gables: the brick under the slate, which shows at each end. */
  T.prism('dkBrick', 'x', [[B.y0, B.wall], [ym, B.ridge - 0.25], [B.y1, B.wall]], B.x0, B.x1);
  /* The facades: stone bands, the windows of both floors with their stone
   * heads, the iron doors, the balconies; along both long sides. */
  T.wide(() => T.dress(() => {
    for (const [y, o, face] of [[B.y0, -1, 's'], [B.y1, 1, 'n']]) {
      const a = (d) => (o < 0 ? y - d : y);
      const b = (d) => (o < 0 ? y : y + d);
      for (const h of [0.6, 5.4]) {
        T.paint('dkStone', B.x0, a(0.06), h, B.x1, b(0.06), h + 0.35);
      }
      /* A plinth of the darker, harder fired brick, and the same brick up
       * each corner, as the old Meiji warehouses have; the arcade's mouth
       * left open. */
      for (const [x0, x1] of [[B.x0, p0 - 0.4], [p1 + 0.4, B.x1]]) {
        T.paint('dkBrickDark', x0, a(0.05), 0, x1, b(0.05), 0.6);
      }
      for (const x of [B.x0, B.x1 - 0.9]) {
        T.paint('dkBrickDark', x, a(0.05), 0.6, x + 0.9, b(0.05), B.wall - 0.5);
      }
      for (let x = B.x0 + 2.5; x < B.x1 - 2; x += 4.4) {
        if (x > p0 - 2.5 && x < p1 + 1) {
          continue;
        }
        for (const [h0, h1] of [[1.4, 4.4], [6.4, 9.4]]) {
          T.paint(lit(x, h0 + (o > 0 ? 3 : 0), 0.35) ? 'glassLit' : 'glassDark', x, a(0.04), h0, x + 1.5, b(0.04), h1);
          T.paint('dkStone', x - 0.15, a(0.08), h1, x + 1.65, b(0.08), h1 + 0.4);
          T.paint('dkIron', x + 0.72, a(0.05), h0, x + 0.78, b(0.05), h1);
        }
        if (Math.round((x - B.x0) / 4.4) % 5 === 2) {
          /* A loading door on the ground floor and a balcony over it. */
          T.paint('dkIron', x - 0.3, a(0.06), 0, x + 1.8, b(0.06), 4.6);
          T.deco('dkIron', x - 0.6, a(1.2), 5.4, x + 2.1, b(1.2), 5.55);
          T.cyl('dkIron', [x - 0.6, o < 0 ? y - 1.2 : y + 1.2, 6.5], [x + 2.1, o < 0 ? y - 1.2 : y + 1.2, 6.5], 0.03, 3);
        }
      }
      T.sign('brick', B.x0 + 14, y, 10.0, 8, 1.2, face, 0.08);
    }
    /* The arcade's mouth, a stone arch head both ends. */
    for (const y of [B.y0, B.y1]) {
      const o = y === B.y0 ? -0.08 : 0.08;
      T.paint('dkStone', p0 - 0.4, Math.min(y, y + o), B.passH, p1 + 0.4, Math.max(y, y + o), B.passH + 0.6);
      T.paint('dkStone', p0 - 0.4, Math.min(y, y + o), 0, p0, Math.max(y, y + o), B.passH);
      T.paint('dkStone', p1, Math.min(y, y + o), 0, p1 + 0.4, Math.max(y, y + o), B.passH);
    }
  }));
}

/* ---- the drivers' rest stop ---- */

function rest(T) {
  const R = REST;
  T.box('wallCream', R.x0, R.y0, 0, R.x1, R.y1, R.h, { name: 'rest hut' });
  T.box('dkSlate', R.x0 - 0.6, R.y0 - 2.5, R.h, R.x1 + 0.6, R.y1 + 0.6, R.h + 0.25, { name: 'rest canopy' });
  for (const x of [R.x0 - 0.3, R.x1 + 0.3]) {
    T.post('metal', x, R.y0 - 2.2, 0, R.h, 0.08, { name: 'canopy post' });
  }
  T.wide(() => T.dress(() => {
    T.paint('glassLit', R.x0 + 1, R.y0 - 0.03, 1.0, R.x0 + 5, R.y0 + 0.01, 2.3);
    T.paint('dkIron', R.x0 + 6, R.y0 - 0.03, 0, R.x0 + 7.2, R.y0 + 0.01, 2.2);
  }));
  T.sign('rest', (R.x0 + R.x1) / 2, R.y0 - 2.52, R.h + 0.12, 6, 0.6, 's', 0.02);
  T.box('lampGlow', (R.x0 + R.x1) / 2 - 1, R.y0 - 1.5, R.h - 0.1, (R.x0 + R.x1) / 2 + 1, R.y0 - 1.2, R.h, { solid: false, cast: false });
  T.dress(() => {
    /* Two benches, an ashtray stand, a row of bicycles. */
    for (const x of [R.x0 + 2, R.x1 - 3]) {
      T.deco('dkSlate', x - 0.9, R.y0 - 1.8, 0.42, x + 0.9, R.y0 - 1.4, 0.48);
      T.deco('metal', x - 0.8, R.y0 - 1.75, 0, x - 0.7, R.y0 - 1.45, 0.42);
      T.deco('metal', x + 0.7, R.y0 - 1.75, 0, x + 0.8, R.y0 - 1.45, 0.42);
    }
    T.cyl('metal', [R.x1 + 1.5, R.y0 - 1.0, 0], [R.x1 + 1.5, R.y0 - 1.0, 0.9], 0.16, 8);
    for (let i = 0; i < 4; i += 1) {
      const x = R.x1 + 3 + i * 0.7;
      T.cyl('dkTyre', [x, R.y0 + 1.0, 0.33], [x, R.y0 + 1.06, 0.33], 0.33, 10);
      T.cyl('dkTyre', [x, R.y0 + 2.1, 0.33], [x, R.y0 + 2.16, 0.33], 0.33, 10);
      T.cyl(i % 2 ? 'mastRed' : 'dkFunnel', [x, R.y0 + 1.03, 0.45], [x, R.y0 + 2.13, 0.75], 0.03, 3);
    }
  });
}

/* ---- the gate ---- */

export function gateLanes() {
  const G = GATE;
  const width = (G.lanes + 1) * G.island + G.lanes * G.lane;
  const x0 = (G.x0 + G.x1) / 2 - width / 2;
  const lanes = [];
  for (let i = 0; i < G.lanes; i += 1) {
    const a = x0 + (i + 1) * G.island + i * G.lane;
    lanes.push({ x0: a, x1: a + G.lane });
  }
  return { x0, lanes };
}

function gate(T) {
  const G = GATE;
  const { x0, lanes } = gateLanes();
  /* The canopy, its fascia and its lamps. */
  T.box('dkHouse', G.x0, G.y0, G.h, G.x1, G.y1, G.h + 0.9, { name: 'gate canopy' });
  T.box('dkFunnel', G.x0 - 0.1, G.y0 - 0.1, G.h + 0.2, G.x1 + 0.1, G.y1 + 0.1, G.h + 0.7, { solid: false });
  T.sign('gate', (G.x0 + G.x1) / 2, G.y0 - 0.1, G.h + 0.45, 18, 0.5, 's', 0.02);
  T.sign('gate', (G.x0 + G.x1) / 2, G.y1 + 0.1, G.h + 0.45, 18, 0.5, 'n', 0.02);
  /* The islands, each with a booth and the canopy's columns. */
  for (let i = 0; i <= G.lanes; i += 1) {
    const a = x0 + i * (G.island + G.lane);
    const b = a + G.island;
    const m = (a + b) / 2;
    T.box('concreteMid', a, G.y0 + 0.5, 0, b, G.y1 - 0.5, 0.2, { name: 'gate island', cast: false });
    T.wide(() => T.dress(() => {
      for (let y = G.y0 + 0.5; y < G.y1 - 0.6; y += 1.2) {
        T.paint(Math.round((y - G.y0) / 1.2) % 2 ? 'dkLineYellow' : 'dkIron', a - 0.01, y, 0.0, b + 0.01, y + 0.6, 0.21);
      }
    }));
    for (const y of [G.y0 + 0.9, G.y1 - 0.9]) {
      T.post('metal', m, y, 0.2, G.h, 0.22, { name: 'canopy column' });
    }
    if (i < G.lanes) {
      T.box('dkHouse', m - 0.75, G.y0 + 4.5, 0.2, m + 0.75, G.y0 + 8.5, 2.7, { name: 'gate booth' });
      T.box('dkSlate', m - 0.9, G.y0 + 4.3, 2.7, m + 0.9, G.y0 + 8.7, 2.9, { name: 'booth roof' });
      T.wide(() => T.dress(() => {
        T.paint('glassLit', m + 0.75, G.y0 + 5.0, 1.2, m + 0.79, G.y0 + 8.0, 2.3);
        T.paint('glassDark', m - 0.79, G.y0 + 5.0, 1.2, m - 0.75, G.y0 + 8.0, 2.3);
      }));
    }
  }
  /* Over each lane its signal and its number; across the north end, a
   * barrier arm, raised in the middle three. */
  lanes.forEach((l, i) => {
    const m = (l.x0 + l.x1) / 2;
    T.box('dkIron', m - 0.6, G.y0 + 0.2, G.h - 0.9, m + 0.6, G.y0 + 0.4, G.h, { name: 'lane signal' });
    T.ball(i === 2 || i === 4 ? 'lampRed' : 'glassLit', m, G.y0 + 0.15, G.h - 0.45, 0.22);
    T.sign(`lane${i + 1}`, m, G.y0 - 0.1, G.h - 1.5, 1.4, 1.0, 's', 0.02);
    T.dress(() => {
      const y = G.y1 - 1.6;
      if (i === 0 || i === G.lanes - 1) {
        for (let k = 0; k < 6; k += 1) {
          T.deco(k % 2 ? 'mastRed' : 'mastWhite', l.x0 + k * (G.lane / 6), y - 0.05, 1.0, l.x0 + (k + 1) * (G.lane / 6), y + 0.05, 1.1);
        }
      } else {
        T.cyl('mastRed', [l.x0 + 0.1, y, 1.0], [l.x0 + 0.6, y, 4.2], 0.05, 4);
      }
    });
  });
}

/* ---- the office and the control cab ---- */

function office(T) {
  const O = OFFICE;
  T.box('wallBlue', O.x0, O.y0, 0, O.x1, O.y1, O.h, { name: 'office' });
  T.box('concreteMid', O.x0 - 0.2, O.y0 - 0.2, O.h, O.x1 + 0.2, O.y1 + 0.2, O.h + 1.0, { solid: false });
  T.hidden(O.x0 - 0.2, O.y0 - 0.2, O.h, O.x1 + 0.2, O.y1 + 0.2, O.h + 0.25, 'wall', 'office roof');
  /* The parapet round the roof, solid, a third of a metre thick. */
  for (const [x0, y0, x1, y1] of [[O.x0 - 0.2, O.y0 - 0.2, O.x1 + 0.2, O.y0 + 0.15], [O.x0 - 0.2, O.y1 - 0.15, O.x1 + 0.2, O.y1 + 0.2], [O.x0 - 0.2, O.y0 - 0.2, O.x0 + 0.15, O.y1 + 0.2], [O.x1 - 0.15, O.y0 - 0.2, O.x1 + 0.2, O.y1 + 0.2]]) {
    T.hidden(x0, y0, O.h + 0.25, x1, y1, O.h + 1.0, 'wall', 'parapet');
  }
  T.wide(() => T.dress(() => {
    for (let f = 0; f < 3; f += 1) {
      const h0 = 0.9 + f * 4.0;
      for (let x = O.x0 + 1; x < O.x1 - 1.4; x += 2.2) {
        for (const [y, o] of [[O.y0, -1], [O.y1, 1]]) {
          T.paint(lit(x, h0 + o, 0.6) ? 'glassLit' : 'glassDark', x, Math.min(y, y + o * 0.04), h0, x + 1.6, Math.max(y, y + o * 0.04), h0 + 2.0);
        }
      }
      T.paint('wallWhite', O.x0 - 0.04, O.y0 - 0.04, h0 + 2.5, O.x1 + 0.04, O.y1 + 0.04, h0 + 2.8);
    }
  }));
  /* The name on a frame on the roof, to the yard. */
  T.box('metalDark', O.x0 + 4, O.y1 - 1.5, O.h + 1.0, O.x0 + 22, O.y1 - 1.3, O.h + 4.2, { name: 'roof sign' });
  T.sign('wharf', O.x0 + 13, O.y1 - 1.3, O.h + 2.6, 17.6, 3.0, 'n', 0.02);
  T.sign('wharf', O.x0 + 13, O.y1 - 1.5, O.h + 2.6, 17.6, 3.0, 's', 0.02);
  /* The roof's plant: the air conditioners and a water tank. */
  T.dress(() => {
    for (let x = O.x0 + 25; x < O.x0 + 29; x += 1.6) {
      T.deco('acUnit', x, O.y0 + 2, O.h + 1.0, x + 1.2, O.y0 + 2.8, O.h + 1.9);
    }
  });
  /* On a plinth, so nothing is left under it to try. */
  T.box('concreteMid', O.x0 + 23.2, O.y1 - 5.8, O.h, O.x0 + 25.8, O.y1 - 3.2, O.h + 1.0, { name: 'tank plinth' });
  T.box('tankPaint', O.x0 + 23, O.y1 - 6, O.h + 1.0, O.x0 + 26, O.y1 - 3, O.h + 3.4, { name: 'water tank' });
  /* The control cab on its core: the core, the cab with glass all round
   * leaning out, its roof and its antenna. */
  const [c0, c1, d0, d1] = O.core;
  const [k0, k1, e0, e1] = O.cab;
  T.box('wallWhite', c0, d0, O.h, c1, d1, O.cab0, { name: 'tower core' });
  T.box('wallBlue', k0, e0, O.cab0, k1, e1, O.cab0 + 0.9, { name: 'cab floor' });
  T.box('glassDark', k0 + 0.3, e0 + 0.3, O.cab0 + 0.9, k1 - 0.3, e1 - 0.3, O.cab1 - 0.4, { name: 'cab', solid: true });
  T.wide(() => T.dress(() => {
    for (const [x, o] of [[k0 + 0.3, -1], [k1 - 0.3, 1]]) {
      for (let y = e0 + 1; y < e1 - 1; y += 3) {
        T.paint('glassLit', Math.min(x, x + o * 0.03), y, O.cab0 + 1.3, Math.max(x, x + o * 0.03), y + 1.6, O.cab1 - 1.0);
      }
    }
  }));
  T.box('wallBlue', k0 - 0.4, e0 - 0.4, O.cab1 - 0.4, k1 + 0.4, e1 + 0.4, O.cab1 + 0.3, { name: 'cab roof' });
  T.post('metal', (k0 + k1) / 2, (e0 + e1) / 2, O.cab1 + 0.3, O.cab1 + 6, 0.1, { name: 'antenna' });
  T.ball('lampRed', (k0 + k1) / 2, (e0 + e1) / 2, O.cab1 + 6.2, 0.18);
  T.box('dkHull', (k0 + k1) / 2 - 2, (e0 + e1) / 2 - 0.2, O.cab1 + 2.4, (k0 + k1) / 2 + 2, (e0 + e1) / 2 + 0.2, O.cab1 + 2.7, { name: 'radar' });
}

/* ---- the fence ---- */

function fence(T) {
  const runs = [[0, GATE.x0 - 2], [GATE.x1 + 2, W]];
  for (const [a, b] of runs) {
    T.box('metal', a, FENCE_Y - 0.03, 0, b, FENCE_Y + 0.03, 1.9, { solid: true, draw: false, name: 'fence' });
    T.wide(() => {
      T.paint('metal', a, FENCE_Y - 0.02, 0.1, b, FENCE_Y + 0.02, 0.16);
      T.paint('metal', a, FENCE_Y - 0.03, 1.8, b, FENCE_Y + 0.03, 1.9);
      T.dress(() => {
        T.paint('grating', a, FENCE_Y - 0.01, 0.16, b, FENCE_Y + 0.01, 1.8);
      });
    });
    for (let x = a; x <= b; x += 3) {
      T.post('metal', x, FENCE_Y, 0, 2.1, 0.04, { solid: false });
    }
  }
}

/* ---- the plaza and the port tower ---- */

const SC = { s: 0, c: 0 };
const DEG = Math.PI / 180;

/* The tower's tubes: { a, b } plan points with heights, both senses of
 * twist, so the lattice crosses itself into diamonds. */
export function towerMembers() {
  const P = TOWER;
  const out = [];
  for (const sense of [1, -1]) {
    for (let i = 0; i < P.members; i += 1) {
      const a0 = (i * 360) / P.members;
      sincos(a0 * DEG, SC);
      const A = [P.px + P.r0 * SC.c, P.py + P.r0 * SC.s, 0.6];
      sincos((a0 + sense * P.twist) * DEG, SC);
      const B = [P.px + P.r1 * SC.c, P.py + P.r1 * SC.s, P.h1];
      out.push({ a: A, b: B });
    }
  }
  return out;
}

function tower(T) {
  const P = TOWER;
  /* The foot: a plinth ring and its lit base. */
  T.disc('concreteMid', P.px, P.py, P.r0 + 1.2, 0, 0.6, 32);
  T.hidden(P.px - P.r0 * 0.7, P.py - P.r0 * 0.7, 0, P.px + P.r0 * 0.7, P.py + P.r0 * 0.7, 0.6, 'wall', 'tower plinth');
  for (const m of towerMembers()) {
    T.cap('dkTowerRed', m.a, m.b, 0.32, { name: 'tower tube', seg: 6 });
  }
  /* The core, a white shaft up the middle, and the rings that tie the
   * tubes at three heights. */
  T.post('dkTowerDeck', P.px, P.py, 0.6, P.deck0, 1.5, { name: 'tower core', seg: 12 });
  for (const [h, r] of [[18, 5.3], [36, 3.85]]) {
    T.cyl('dkTowerRed', [P.px - r, P.py, h], [P.px + r, P.py, h], 0.12, 4, null, true);
    T.cyl('dkTowerRed', [P.px, P.py - r, h], [P.px, P.py + r, h], 0.12, 4, null, true);
  }
  /* The deck: a drum of glass under a white rim, the roof deck over it
   * with its rail, and the beacon mast. */
  T.disc('dkTowerDeck', P.px, P.py, P.r1 + 1.2, P.deck0 - 0.4, P.deck0 + 0.6, 24);
  T.disc('glassDark', P.px, P.py, P.r1 + 0.6, P.deck0 + 0.6, P.deck1 - 0.6, 24);
  T.disc('dkTowerRed', P.px, P.py, P.r1 + 1.4, P.deck1 - 0.6, P.deck1, 24);
  T.disc('dkTowerDeck', P.px, P.py, P.r1 - 0.5, P.deck1, P.roof, 20);
  T.cone('dkTowerRed', P.px, P.py, P.roof, P.r1 - 0.8, 2.0, 16);
  const q = (P.r1 + 0.6) * 0.7;
  T.hidden(P.px - q, P.py - q, P.deck0 - 0.4, P.px + q, P.py + q, P.deck1, 'wall', 'tower deck');
  const q2 = (P.r1 - 0.5) * 0.7;
  T.hidden(P.px - q2, P.py - q2, P.deck1, P.px + q2, P.py + q2, P.roof + 0.8, 'wall', 'tower roof');
  T.post('metal', P.px, P.py, P.roof + 1.5, P.top, 0.18, { name: 'tower mast' });
  T.ball('lampRed', P.px, P.py, P.top + 0.3, 0.3);
  T.wide(() => T.dress(() => {
    for (let k = 0; k < 24; k += 1) {
      sincos((k * 15 + 7) * DEG, SC);
      if (lit(k, 3, 0.6)) {
        const r = P.r1 + 0.62;
        T.paint('glassLit', P.px + r * SC.c - 0.4, P.py + r * SC.s - 0.4, P.deck0 + 1.2, P.px + r * SC.c + 0.4, P.py + r * SC.s + 0.4, P.deck1 - 1.2);
      }
    }
  }));
  /* The plaza: paving, a rail along the quay's edge, benches, the tower's
   * name on its plinth. */
  T.wide(() => T.dress(() => {
    T.paint('dkPatch', 0, 182, 0, 52, QUAY_Y - 1, 0.015);
    for (let x = 0; x < 52; x += 4) {
      for (let y = 182; y < QUAY_Y - 1; y += 4) {
        T.paint('dkStone', x, y, 0.015, x + 0.1, y + 4, 0.02);
      }
    }
  }));
  T.dress(() => {
    for (let x = 1; x < 50; x += 2.5) {
      T.cyl('dkIron', [x, QUAY_Y - 1.0, 0.22], [x, QUAY_Y - 1.0, 1.1], 0.05, 4);
    }
    T.cyl('dkIron', [1, QUAY_Y - 1.0, 1.05], [50, QUAY_Y - 1.0, 1.05], 0.04, 4);
    for (const x of [8, 36]) {
      T.deco('dkSlate', x - 1, 232, 0.42, x + 1, 232.5, 0.5);
      T.deco('metal', x - 0.9, 232.05, 0, x - 0.8, 232.45, 0.42);
      T.deco('metal', x + 0.8, 232.05, 0, x + 0.9, 232.45, 0.42);
    }
  });
  T.sign('tower', P.px, P.py - P.r0 - 1.2, 0.3, 4.4, 0.55, 's', 0.02);
}

export function landside(T) {
  warehouse(T);
  rest(T);
  gate(T);
  office(T);
  fence(T);
  tower(T);
}
