/*
 * park.js: Hayate Circuit's infield and its edges, the part of a Japanese
 * circuit that is a day out as much as a race: the Ferris wheel by the
 * back straight, the food stalls round its foot, a pond with a red arched
 * bridge, a small shrine in the cedars inside the esses where the teams
 * pray for a safe race, the car park, the medical centre and its helipad,
 * the service roads round the outside with the town's poles and wires
 * along them, and the gate at the main entrance.
 *
 * THE FERRIS WHEEL stands 50 m high, as an amusement park wheel at a
 * circuit does, its disc square to the main straight so the stands see it
 * whole. It does not turn: a wheel that turned would have to be solid
 * where it is drawn on every physics step, and its spokes and cars are
 * what a pilot threads. Its rims, spokes, legs and hub are solid, its
 * cabins are solid boxes, and between two spokes there is room to fly
 * through the disc.
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
import { W } from './frame.js';

export const WHEEL = {
  x: 300, y: 304, hub: 27, R: 23, half: 1.3, spokes: 16, cabins: 16, legX: 11, legY: 4.2,
};
const CABIN = ['mxRed', 'craneYellow', 'mxBlue', 'mxGreen', 'white', 'mxOrange', 'hyPink', 'containerTeal'];

/* A point on the wheel's disc, at radius r and angle a (radians, from the
 * hub's east, up toward the sky), on the side plane at y + dy. */
function onWheel(r, a, dy) {
  const sc = sincos(a, { s: 0, c: 0 });
  return [WHEEL.x + sc.c * r, WHEEL.y + dy, WHEEL.hub + sc.s * r];
}

/* The spokes stand at these angles, so the disc's two horizontal radii are
 * the middles of two sectors, which is where the line through it is. */
function spokeAngle(i) {
  return ((i + 0.5) / WHEEL.spokes) * 2 * Math.PI;
}

function ferrisWheel(T) {
  const { x, y, hub, R, half, legX, legY } = WHEEL;
  const N = 32;
  /* The rims, one each side: a ring of capsules. */
  for (const dy of [-half, half]) {
    for (let i = 0; i < N; i += 1) {
      const a = onWheel(R, (i / N) * 2 * Math.PI, dy);
      const b = onWheel(R, ((i + 1) / N) * 2 * Math.PI, dy);
      T.cap('hyWheel', a, b, 0.22, { kind: 'pole', name: 'wheel rim', draw: false });
    }
    /* The inner ring, a third of the way out, that stiffens the spokes. */
    for (let i = 0; i < N; i += 1) {
      const a = onWheel(R * 0.36, (i / N) * 2 * Math.PI, dy);
      const b = onWheel(R * 0.36, ((i + 1) / N) * 2 * Math.PI, dy);
      T.cap('hyWheel', a, b, 0.12, { kind: 'pole', name: 'wheel ring', draw: false });
    }
    for (let i = 0; i < WHEEL.spokes; i += 1) {
      const ang = spokeAngle(i);
      T.cap('hyWheel', onWheel(1.4, ang, dy), onWheel(R, ang, dy), 0.1, { kind: 'pole', name: 'wheel spoke', draw: false });
    }
  }
  T.op({ t: 'wheel', ...WHEEL });
  /* The hub, its axle through both sides, and the A frame legs. */
  T.cap('metalDark', [x, y - legY - 0.4, hub], [x, y + legY + 0.4, hub], 1.2, { kind: 'wall', name: 'wheel hub', seg: 12 });
  for (const s of [-1, 1]) {
    for (const lx of [-legX, legX]) {
      T.cap('hyWheelLeg', [x + lx, y + s * (legY + 1.6), 0], [x, y + s * legY, hub], 0.55, { kind: 'wall', name: 'wheel leg', seg: 8 });
    }
    T.cap('hyWheelLeg', [x - legX * 0.5, y + s * (legY + 0.8), hub * 0.5], [x + legX * 0.5, y + s * (legY + 0.8), hub * 0.5], 0.3, { kind: 'pole', name: 'wheel leg tie' });
  }
  /* The cabins, hung under the rim between the two sides. */
  for (let i = 0; i < WHEEL.cabins; i += 1) {
    const a = (i / WHEEL.cabins) * 2 * Math.PI;
    const p = onWheel(R, a, 0);
    const cx = p[0];
    const cz = p[2] - 1.9;
    T.box(CABIN[i % CABIN.length], cx - 1.1, y - 0.95, cz - 1.2, cx + 1.1, y + 0.95, cz + 1.0, { name: 'wheel cabin' });
    T.op({ t: 'cabin', x: cx, y, h: cz, k: i });
    T.cyl('metal', [cx, y, cz + 1.0], [cx, y, p[2]], 0.06, 4, true);
  }
  /* The boarding deck under the lowest cabin, and its booth. */
  T.box('hyDeck', x - 7, y - 6, 0, x + 7, y + 6, 0.9, { name: 'wheel deck' });
  T.box('white', x + 7.5, y - 2, 0, x + 10.5, y + 2, 2.6, { name: 'wheel booth' });
  T.deco('hyPink', x + 7.4, y - 2.1, 2.6, x + 10.6, y + 2.1, 2.9);
  T.sign('skyWheel', x + 9, y - 2.02, 2.0, 0, -1, 2.8, 0.7);
  T.sign('skyWheelBig', x, y - 6.02, 0.45, 0, -1, 9, 0.8);
}

/* The window through the disc: between the two spokes either side of the
 * hub's east radius, from inside the inner ring to inside the rim. For
 * the counter (./index.js) and the checks. */
export function wheelWindow() {
  const r0 = WHEEL.R * 0.36 + 1.6;
  const r1 = WHEEL.R - 3.6;
  /* Half the sector's height at r0, short of the spoke by its radius. */
  const sc = sincos(Math.PI / WHEEL.spokes, { s: 0, c: 0 });
  const tan = sc.s / sc.c;
  const half = r0 * tan - 0.1 - 0.35;
  return {
    px: WHEEL.x + (r0 + r1) / 2, py: WHEEL.y, w: r1 - r0, h0: WHEEL.hub - half, h1: WHEEL.hub + half,
  };
}

/* The food stalls round the wheel's foot: yatai under striped awnings. */
function stalls(T) {
  let k = 0;
  for (let x = 262; x <= 338; x += 12.5) {
    if (Math.abs(x - WHEEL.x) < 12) {
      continue;
    }
    T.op({ t: 'stall', x, y: WHEEL.y - 16, k: k + 3 });
    T.solid(x - 2, WHEEL.y - 18, 0, x + 2, WHEEL.y - 15, 2.6, 'stall');
    k += 1;
  }
  for (let x = 266; x <= 334; x += 17) {
    T.op({ t: 'bench', x, y: WHEEL.y - 22 });
  }
}

/*
 * THE POND and its arched bridge: water a few centimetres over the grass,
 * a stone edge, a red taikobashi across its waist high enough to fly
 * under, carp, and a stone lantern at each end.
 */
export const POND = { x: 424, y: 250, rx: 30, ry: 17 };
export const TAIKO = { x: 424, y0: 238, y1: 262, w: 2.8, rise: 3.0 };
function pond(T) {
  T.op({ t: 'pond', ...POND });
  const B = TAIKO;
  const n = 12;
  const L = B.y1 - B.y0;
  const hOf = (t) => 0.6 + B.rise * (1 - (2 * t - 1) * (2 * t - 1));
  for (let i = 0; i < n; i += 1) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const ha = hOf(t0);
    const hb = hOf(t1);
    const ya = B.y0 + L * t0;
    const yb = B.y0 + L * t1;
    const h = Math.max(ha, hb);
    T.box('hyBridgeRed', B.x - B.w / 2, ya, Math.min(ha, hb) - 0.3, B.x + B.w / 2, yb, h, { name: 'taikobashi deck' });
    for (const s of [-1, 1]) {
      T.cyl('hyBridgeRed', [B.x + s * (B.w / 2 - 0.08), ya, ha + 0.9], [B.x + s * (B.w / 2 - 0.08), yb, hb + 0.9], 0.06, 5, true);
      T.cyl('hyBridgeRed', [B.x + s * (B.w / 2 - 0.08), ya, ha], [B.x + s * (B.w / 2 - 0.08), ya, ha + 0.95], 0.07, 5, true);
    }
  }
  /* The piers at its feet, on the banks. */
  T.box('hyStone', B.x - B.w / 2 - 0.3, B.y0 - 1.2, 0, B.x + B.w / 2 + 0.3, B.y0 + 0.4, 0.9, { name: 'bridge foot' });
  T.box('hyStone', B.x - B.w / 2 - 0.3, B.y1 - 0.4, 0, B.x + B.w / 2 + 0.3, B.y1 + 1.2, 0.9, { name: 'bridge foot' });
  for (const [x, y] of [[B.x - 3, B.y0 - 3], [B.x + 3, B.y1 + 3], [POND.x - POND.rx - 3, POND.y + 4], [POND.x + POND.rx + 2, POND.y - 6]]) {
    stoneLantern(T, x, y);
  }
  /* Rocks round the edge. */
  for (let i = 0; i < 14; i += 1) {
    const sc = sincos((i / 14) * 2 * Math.PI + 0.2, { s: 0, c: 0 });
    const x = POND.x + sc.c * (POND.rx + 0.6);
    const y = POND.y + sc.s * (POND.ry + 0.6);
    if (Math.abs(x - B.x) < 3) {
      continue;
    }
    T.blob('hyStone', [x, y, 0.15], 0.7 + (i % 3) * 0.2, 0.45, i, true);
  }
  T.op({ t: 'carp', x: POND.x - 10, y: POND.y + 4 });
  T.op({ t: 'carp', x: POND.x + 12, y: POND.y - 5 });
}

function stoneLantern(T, x, y) {
  T.post('hyStone', x, y, 0, 1.9, 0.22, { kind: 'pole', name: 'stone lantern' });
  T.deco('hyStone', x - 0.45, y - 0.45, 0, x + 0.45, y + 0.45, 0.25);
  T.deco('hyStone', x - 0.4, y - 0.4, 1.0, x + 0.4, y + 0.4, 1.15);
  T.deco('hyStone', x - 0.3, y - 0.3, 1.15, x + 0.3, y + 0.3, 1.6);
  T.deco('glassLit', x - 0.18, y - 0.31, 1.25, x + 0.18, y + 0.31, 1.5, true);
  T.cone('hyStone', [x, y, 1.6], 0.6, 0.45, 6);
  T.blob('hyStone', [x, y, 2.1], 0.14, 0.16, 0, true);
}

/*
 * THE SHRINE in the cedars inside the esses: a small hokora on a stone
 * plinth under a gabled copper roof, a red torii on the path to it, stone
 * lanterns, a rope with paper streamers round the sacred tree, and the
 * prayer boards on their rack. The teams come here before the race.
 */
export const SHRINE = { x: 150, y: 252 };
function shrine(T) {
  const { x, y } = SHRINE;
  /* The plinth and the hokora on it. */
  T.box('hyStone', x - 3, y - 3, 0, x + 3, y + 3, 0.8, { name: 'shrine plinth' });
  T.box('hyTimber', x - 1.4, y - 1.2, 0.8, x + 1.4, y + 1.2, 2.9, { name: 'hokora' });
  T.deco('hyShrineWhite', x - 1.0, y - 1.22, 1.0, x + 1.0, y - 1.2, 2.6);
  T.deco('craneYellow', x - 0.3, y - 1.24, 2.0, x + 0.3, y - 1.22, 2.5);
  T.prism('hyCopper', [[x - 2.1, 2.9], [x + 2.1, 2.9], [x, 4.2]], 'y', y - 2.0, y + 2.0);
  T.solid(x - 2.0, y - 2.0, 2.9, x + 2.0, y + 2.0, 3.6, 'hokora roof');
  T.deco('hyInk', x - 0.15, y - 2.1, 4.05, x + 0.15, y + 2.1, 4.3);
  /* The crossed rafters at the gable ends. */
  for (const yy of [y - 2.05, y + 2.05]) {
    T.cyl('hyCopper', [x - 0.6, yy, 3.8], [x + 0.3, yy, 4.8], 0.07, 4, true);
    T.cyl('hyCopper', [x + 0.6, yy, 3.8], [x - 0.3, yy, 4.8], 0.07, 4, true);
  }
  /* The steps, the path and the torii on it, south of the plinth. */
  T.deco('hyStone', x - 1, y - 4.2, 0, x + 1, y - 3, 0.4);
  T.deco('hyGravel', x - 1.2, y - 22, 0, x + 1.2, y - 4.2, 0.03);
  const ty = y - 13;
  for (const s of [-1, 1]) {
    T.post('hyToriiRed', x + s * 1.6, ty, 0, 3.9, 0.16, { kind: 'pole', name: 'shrine torii' });
  }
  T.box('hyToriiRed', x - 2.3, ty - 0.2, 3.5, x + 2.3, ty + 0.2, 3.75, { name: 'shrine torii' });
  T.box('hyInk', x - 2.6, ty - 0.25, 3.9, x + 2.6, ty + 0.25, 4.2, { name: 'shrine torii' });
  T.deco('hyInk', x - 2.7, ty - 0.27, 4.15, x - 2.3, ty + 0.27, 4.35);
  T.deco('hyInk', x + 2.3, ty - 0.27, 4.15, x + 2.7, ty + 0.27, 4.35);
  for (const s of [-1, 1]) {
    stoneLantern(T, x + s * 2.6, y - 6);
  }
  /* The prayer boards on their rack, beside the path. */
  T.box('hyTimber', x + 3.2, y - 9, 0, x + 3.4, y - 6, 1.6, { name: 'ema rack' });
  for (let i = 0; i < 8; i += 1) {
    const yy = y - 8.8 + i * 0.36;
    T.deco('plywood', x + 3.0, yy, 1.1 + (i % 2) * 0.25, x + 3.2, yy + 0.3, 1.3 + (i % 2) * 0.25, true);
  }
  /* The sacred cedar's rope and streamers (the tree is the document's). */
  T.op({ t: 'shimenawa', x: x - 6, y: y + 2, r: 1.0, h: 2.2 });
}
/* The sacred cedar beside the shrine, for ./yard.js. */
export const SACRED_TREE = { x: SHRINE.x - 6, y: SHRINE.y + 2 };

/* The car park, the medical centre and its helipad. */
export const CARPARK = { x0: 160, x1: 236, y0: 176, y1: 232 };
function services(T) {
  const C = CARPARK;
  T.deco('hyPitLane', C.x0, C.y0, 0, C.x1, C.y1, 0.02);
  for (let x = C.x0 + 2; x <= C.x1 - 2; x += 2.6) {
    for (const [y0, y1] of [[C.y0 + 1, C.y0 + 6], [C.y0 + 18, C.y0 + 23], [C.y0 + 24, C.y0 + 29], [C.y1 - 6, C.y1 - 1]]) {
      T.deco('white', x - 0.06, y0, 0.02, x + 0.06, y1, 0.03, true);
    }
  }
  /* The medical centre. */
  T.box('white', 462, 168, 0, 518, 190, 5.2, { name: 'medical centre' });
  T.deco('hyKerbRed', 461.98, 167.98, 3.6, 518.02, 190.02, 4.1);
  T.deco('glassBlue', 466, 167.96, 1.0, 514, 167.98, 3.0);
  for (let x = 466; x <= 514; x += 4) {
    T.deco('white', x - 0.1, 167.94, 1.0, x + 0.1, 167.97, 3.0, true);
  }
  T.box('white', 482, 164, 2.8, 498, 168, 3.1, { name: 'medical canopy' });
  for (const x of [483, 497]) {
    T.post('metal', x, 164.4, 0, 2.8, 0.08, { kind: 'pole', name: 'canopy post' });
  }
  T.sign('medical', 490, 167.94, 4.6, 0, -1, 9, 0.9);
  T.box('acUnit', 470, 178, 5.2, 474, 182, 6.4, { name: 'roof plant' });
  /* The helipad by it: a ring and a letter painted on a concrete pad. */
  T.deco('concrete', 480, 132, 0, 510, 160, 0.03);
  T.op({ t: 'disc', x: 495, y: 146, r: 10, h: 0.035, m: 'hyGarageFloor' });
  T.sign('heliH', 495, 146, 0.045, 0, 0, 7, 7);
  T.op({ t: 'windsock', x: 512, y: 158 });
  T.post('metal', 512, 158, 0, 5, 0.06, { kind: 'pole', name: 'windsock' });
}

/*
 * THE SERVICE ROADS round the outside, behind the stands and the forest:
 * a lane of tarmac each, the town's concrete poles every 30 m carrying
 * their wires, and the main gate over the south road at the entrance.
 */
export const GATE = { x: 560, y: 9, w: 9, h: 6.4 };
function roads(T) {
  T.deco('hyPitLane', 0, 5, 0, W, 13, 0.02);
  T.deco('white', 0, 8.95, 0.02, W, 9.05, 0.03);
  T.deco('hyPitLane', 120, 424, 0, 580, 432, 0.02);
  for (const [y, x0, x1] of [[15.5, 30, 600], [434, 130, 570]]) {
    let prev = null;
    for (let x = x0; x <= x1; x += 30) {
      T.post('concrete', x, y, 0, 10, 0.16, { kind: 'pole', name: 'utility pole' });
      T.op({ t: 'pole', x, y, h: 10, k: x });
      if (prev !== null) {
        T.op({ t: 'wires', a: [prev, y, 9.4], b: [x, y, 9.4], sag: 0.7 });
      }
      prev = x;
    }
  }
  /* The gate: two pillars and a beam, the circuit's name on both faces. */
  const G = GATE;
  for (const [y0, y1] of [[G.y - G.w / 2 - 2.0, G.y - G.w / 2], [G.y + G.w / 2, G.y + G.w / 2 + 2.0]]) {
    T.box('hyGantry', G.x - 1.2, y0, 0, G.x + 1.2, y1, G.h + 2.4, { name: 'gate pillar' });
    T.deco('hyKerbRed', G.x - 1.22, y0 - 0.02, G.h + 2.0, G.x + 1.22, y1 + 0.02, G.h + 2.2);
  }
  T.box('hyGantry', G.x - 1.0, G.y - G.w / 2, G.h, G.x + 1.0, G.y + G.w / 2, G.h + 2.0, { name: 'gate beam' });
  T.sign('hayateGate', G.x - 1.02, G.y, G.h + 1.0, -1, 0, 8.6, 1.6);
  T.sign('hayateGate', G.x + 1.02, G.y, G.h + 1.0, 1, 0, 8.6, 1.6);
}

export function parkAndEdges(T) {
  ferrisWheel(T);
  stalls(T);
  pond(T);
  shrine(T);
  services(T);
  roads(T);
}
