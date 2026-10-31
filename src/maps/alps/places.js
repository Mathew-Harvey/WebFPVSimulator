/*
 * places.js: what stands on Raicho Ridge, every structure in the world
 * frame (x east, z south, y up), drawn and solid from the same numbers by
 * ./build.js's Plan.
 *
 * THE COL: the mountain hut (yamagoya), two storeys of timber and plaster
 * under a steep red tin roof, the kind supplied by helicopter all summer,
 * with its helipad on the col beside it (the pilot's start), its porch,
 * picnic tables, solar panels, water tanks, gas bottles and futons airing
 * over the rail. Its doors are 0.9 by 1.9 m at both ends on one line and
 * its hall windows 1.2 m on both long walls on one line, so the hut is
 * flown through two ways.
 *
 * THE ROPEWAY: a monocable gondola straight down the south face from the
 * top station on the cliff's lip to the valley station by the road, on
 * four lattice towers 32 to 40 m tall, two red cabins out on the rope and
 * one docked. Both stations are flown through, under the bullwheel.
 *
 * THE DAM: a concrete gravity dam across the gorge at the foot of the
 * lake, 48 m from the gorge to its crest, with three spillway bays under
 * the crest road and the water down the chute between training walls.
 *
 * THE ROAD: up the valley past the valley station and along the lake's
 * north shore to the dam, through a snow shed (an avalanche gallery,
 * open on the lake side between its columns), with guard rails and poles.
 *
 * THE SUMMIT: a stone shrine, a little red torii, the summit post and a
 * cairn, and the trail along the crest from the hut with its waymarks.
 *
 * SIZES, from the real things (written in the PR): a mountain hut door
 * 0.9 by 1.9 m (the brief's), a hall window 1.2 m; a gondola tower 20 to
 * 40 m and a span of 80 to 120 m; a gondola cabin about 2.4 by 4.6 m in
 * plan and 2.6 m high (eight to ten seat cabins); a gravity dam's
 * downstream face about 0.6 to 0.8 run to 1 rise; a spillway bay 6 m.
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

import { Plan } from './build.js';
import { sincos } from '../../props/trig.js';
import {
  padLevel, floorAt, LAKE, DAM_X, DAM_CREST, ROAD, ROAD_HALF, curve, noise,
} from './terrain.js';

/* ---- the col ---- */

export const HELI = { x: -120, z: -312, half: 12 };

function helipad(B) {
  const y = padLevel('heli');
  const { x, z, half } = HELI;
  const top = y + 0.25;
  B.box('alConcrete', x - half, y - 2.5, z - half, x + half, top, z + half, { name: 'helipad' });
  /* The kerb round it. */
  for (const s of [-1, 1]) {
    B.box('alConcreteMid', x - half, top, z + s * (half - 0.25) - 0.25, x + half, top + 0.2, z + s * (half - 0.25) + 0.25, { name: 'kerb' });
    B.box('alConcreteMid', x + s * (half - 0.25) - 0.25, top, z - half + 0.5, x + s * (half - 0.25) + 0.25, top + 0.2, z + half - 0.5, { name: 'kerb' });
  }
  B.draw(x, z, (K) => {
    /* The circle and the H, in the helipad's yellow and white paint. */
    K.ring('alLineYellow', [x, top + 0.012, z], 7.4, 8.0, 0.01);
    K.box('alLine', x - 3.2, top, z - 2.4, x - 2.2, top + 0.02, z + 2.4);
    K.box('alLine', x + 2.2, top, z - 2.4, x + 3.2, top + 0.02, z + 2.4);
    K.box('alLine', x - 2.2, top, z - 0.45, x + 2.2, top + 0.02, z + 0.45);
    /* Edge lights, little green cans. */
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * 10.8;
      const pz = z + Math.sin(a) * 10.8;
      K.cyl('alSteelDark', [px, top, pz], [px, top + 0.25, pz], 0.1, 6);
      K.cyl('alPine0', [px, top + 0.25, pz], [px, top + 0.33, pz], 0.1, 6);
    }
  });
  /* The windsock, at the pad's north west corner. */
  const wx = x - half - 2;
  const wz = z - half + 1;
  const wy = floorAt(wx, wz);
  B.post('alSteel', wx, wz, wy - 0.5, wy + 6.5, 0.06, { name: 'windsock' });
  B.draw(wx, wz, (K) => {
    for (let i = 0; i < 4; i += 1) {
      const a = [wx + 0.15 + i * 0.6, wy + 6.2 - i * 0.18, wz + i * 0.35];
      const b = [wx + 0.15 + (i + 1) * 0.6, wy + 6.2 - (i + 1) * 0.18, wz + (i + 1) * 0.35];
      K.cyl(i % 2 ? 'alWhite' : 'alRed', a, b, 0.32 - i * 0.05, 8, 0.32 - (i + 1) * 0.05);
    }
  });
  return { top };
}

/* A lean-to roof along x, high at x0 (yHigh), low at x1 (yLow): drawn as
 * a slab and solid as bands. */
function leanTo(B, m, x0, x1, z0, z1, yHigh, yLow) {
  B.draw((x0 + x1) / 2, (z0 + z1) / 2, (K) => {
    K.begin(0, 0, 0, 0, K.chunk);
    K.extrude(m, [[x0, yHigh], [x1 + 0.5, yLow - 0.08], [x1 + 0.5, yLow - 0.26], [x0, yHigh - 0.18]], z0 - 0.4, z1 + 0.4);
  });
  const run = x1 - x0;
  for (let y = yLow - 0.2; y < yHigh - 0.2; y += 0.3) {
    const reach = x0 + run * (1 - (y + 0.3 - (yLow - 0.2)) / (yHigh - yLow));
    if (reach - x0 > 0.15) {
      B.box(m, x0, y, z0, reach, y + 0.3, z1, { draw: false, name: 'roof' });
    }
  }
}

/* A picnic table and its two benches, along x. */
function picnic(B, x, z, y) {
  B.box('alTimberPale', x - 0.9, y + 0.68, z - 0.4, x + 0.9, y + 0.76, z + 0.4, { name: 'table' });
  B.box('alTimberDark', x - 0.1, y, z - 0.1, x + 0.1, y + 0.68, z + 0.1, { name: 'table' });
  for (const s of [-1, 1]) {
    B.box('alTimberPale', x - 0.9, y + 0.4, z + s * 0.75 - 0.14, x + 0.9, y + 0.46, z + s * 0.75 + 0.14, { name: 'bench' });
    B.box('alTimberDark', x - 0.06, y, z + s * 0.75 - 0.06, x + 0.06, y + 0.4, z + s * 0.75 + 0.06, { name: 'bench' });
  }
}

export const HUT = { x0: -254, x1: -228, z0: -313, z1: -303 };
const HUT_DOOR_Z = -308;
const HUT_WIN_X = -239;

function hut(B) {
  const y = padLevel('hut');
  const { x0, x1, z0, z1 } = HUT;
  const T = 0.24;
  const g = y + 0.3;
  const f1 = g + 2.8;
  const f2 = f1 + 2.6;
  /* The stone plinth. */
  B.box('alStone', x0 - 0.35, y - 1.8, z0 - 0.35, x1 + 0.35, g, z1 + 0.35, { name: 'plinth' });
  const door = { from: HUT_DOOR_Z - 0.45, to: HUT_DOOR_Z + 0.45, y0: g, y1: g + 1.9 };
  /* The ends: a door in each, on one line through the hall, and a window
   * either side of it. */
  for (const xe of [x0 + T / 2, x1 - T / 2]) {
    B.wall('alTimber', {
      axis: 'z', at: xe, t: T, from: z0, to: z1, y0: g, y1: f1,
      holes: [door, { from: z0 + 1.2, to: z0 + 2.2, y0: g + 1.0, y1: g + 2.0 }, { from: z1 - 2.2, to: z1 - 1.2, y0: g + 1.0, y1: g + 2.0 }],
    }, { name: 'hut wall' });
  }
  /* The long walls: the hall's windows, the middle pair on one line. */
  const wins = [
    { from: HUT_WIN_X - 0.6, to: HUT_WIN_X + 0.6, y0: g + 0.9, y1: g + 2.1 },
    { from: x0 + 2.0, to: x0 + 3.2, y0: g + 0.9, y1: g + 2.1 },
    { from: x0 + 7.0, to: x0 + 8.2, y0: g + 0.9, y1: g + 2.1 },
    { from: x1 - 3.2, to: x1 - 2.0, y0: g + 0.9, y1: g + 2.1 },
    { from: x1 - 8.2, to: x1 - 7.0, y0: g + 0.9, y1: g + 2.1 },
  ];
  for (const ze of [z0 + T / 2, z1 - T / 2]) {
    B.wall('alTimber', { axis: 'x', at: ze, t: T, from: x0, to: x1, y0: g, y1: f1, holes: wins }, { name: 'hut wall' });
  }
  /* The upper floor, its plastered walls closed, the rooms behind them. */
  B.box('alTimberDark', x0, f1, z0, x1, f1 + 0.22, z1, { name: 'hut floor' });
  B.box('alPlaster', x0, f1 + 0.22, z0, x1, f2, z0 + T, { name: 'hut wall' });
  B.box('alPlaster', x0, f1 + 0.22, z1 - T, x1, f2, z1, { name: 'hut wall' });
  B.box('alPlaster', x0, f1 + 0.22, z0 + T, x0 + T, f2, z1 - T, { name: 'hut wall' });
  B.box('alPlaster', x1 - T, f1 + 0.22, z0 + T, x1, f2, z1 - T, { name: 'hut wall' });
  B.box('alTimberDark', x0, f2 - 0.2, z0, x1, f2, z1, { name: 'hut ceiling' });
  B.gableX('alRoofRed', x0, x1, (z0 + z1) / 2, (z1 - z0) / 2, f2, 5.6, 1.1, 0.22, 'alPlaster');
  /* The hall: tables along the north wall either side of the window line,
   * benches, the stove, two posts. */
  for (const [a, b] of [[x0 + 1.2, HUT_WIN_X - 1.6], [HUT_WIN_X + 1.6, x1 - 1.4]]) {
    B.box('alTimberPale', a, g + 0.68, z0 + 0.5, b, g + 0.76, z0 + 1.5, { name: 'table' });
    B.box('alTimberDark', a + 0.2, g, z0 + 0.9, b - 0.2, g + 0.68, z0 + 1.1, { name: 'table' });
    B.box('alTimberPale', a, g + 0.4, z0 + 1.8, b, g + 0.46, z0 + 2.15, { name: 'bench' });
  }
  B.box('alSteelDark', x0 + 4, g, z1 - 1.4, x0 + 4.9, g + 0.8, z1 - 0.5, { name: 'stove' });
  B.post('alSteelDark', x0 + 4.45, z1 - 0.95, g + 0.8, f1, 0.08, { name: 'flue' });
  for (const px of [x0 + 9.5, x1 - 6.5]) {
    B.box('alTimberDark', px - 0.12, g, z0 + 2.4, px + 0.12, f1, z0 + 2.64, { name: 'post' });
  }
  /* The porch at the east door, its deck flush with the floor. */
  B.box('alTimber', x1, y - 0.6, z0, x1 + 6.6, g, z1, { name: 'porch' });
  for (const pz of [z0 + 0.3, z1 - 0.3]) {
    B.post('alTimberDark', x1 + 6.2, pz, g, g + 2.4, 0.1, { name: 'porch post' });
  }
  leanTo(B, 'alRoofRed', x1, x1 + 6.4, z0 - 0.3, z1 + 0.3, f1 - 0.1, g + 2.4);
  B.box('alTimberPale', x1 + 1.0, g + 0.4, z1 - 0.8, x1 + 5.4, g + 0.46, z1 - 0.4, { name: 'bench' });
  /* The paint: posts and beams on the plaster, windows upstairs, the
   * futons over the rail, a noren at the door. */
  B.draw((x0 + x1) / 2, (z0 + z1) / 2, (K) => {
    for (let px = x0; px <= x1 + 0.01; px += 3.25) {
      for (const [zz, dz] of [[z0, -0.06], [z1, 0.06]]) {
        K.box('alTimberDark', px - 0.1, f1, zz + dz - 0.05, px + 0.1, f2, zz + dz + 0.05);
      }
    }
    for (const [zz, dz] of [[z0, -0.06], [z1, 0.06]]) {
      K.box('alTimberDark', x0, f1 + 0.1, zz + dz - 0.05, x1, f1 + 0.3, zz + dz + 0.05);
      for (let px = x0 + 1.6; px < x1 - 1; px += 3.25) {
        K.box('alGlassDark', px, f1 + 0.9, zz + dz * 1.4 - 0.02, px + 1.5, f1 + 2.0, zz + dz * 1.4 + 0.02);
        K.box('alTimberPale', px - 0.06, f1 + 0.84, zz + dz * 1.6 - 0.03, px + 1.56, f1 + 0.9, zz + dz * 1.6 + 0.03);
      }
    }
    /* The futons, over the south rail. */
    const fut = ['alFutonPink', 'alFutonBlue', 'alFutonCream', 'alFutonBlue', 'alFutonPink', 'alFutonCream'];
    K.cyl('alSteel', [x0 + 0.5, f1 + 0.85, z1 + 0.45], [x1 - 0.5, f1 + 0.85, z1 + 0.45], 0.03, 4);
    for (let i = 0; i < fut.length; i += 1) {
      const px = x0 + 1.4 + i * 3.9;
      K.box(fut[i], px, f1 - 0.1, z1 + 0.38, px + 1.9, f1 + 0.9, z1 + 0.52);
    }
    /* The noren, two panels of indigo over the east door. */
    K.box('alRoofBlue', x1 + 0.03, g + 1.55, HUT_DOOR_Z - 0.62, x1 + 0.07, g + 2.2, HUT_DOOR_Z - 0.03);
    K.box('alRoofBlue', x1 + 0.03, g + 1.55, HUT_DOOR_Z + 0.03, x1 + 0.07, g + 2.2, HUT_DOOR_Z + 0.62);
    /* The hut's board over the porch, a plank with brush strokes. */
    K.box('alTimberPale', x1 + 0.1, f1 + 0.5, HUT_DOOR_Z - 1.8, x1 + 0.22, f1 + 1.3, HUT_DOOR_Z + 1.8);
    for (let i = 0; i < 4; i += 1) {
      const zz = HUT_DOOR_Z - 1.3 + i * 0.85;
      K.box('alTimberDark', x1 + 0.22, f1 + 0.62, zz - 0.07, x1 + 0.25, f1 + 1.18, zz + 0.07);
      K.box('alTimberDark', x1 + 0.22, f1 + 0.86, zz - 0.25, x1 + 0.25, f1 + 0.94, zz + 0.25);
    }
  });
  /* Outside: tables on the pad, the solar rack, the tanks, the bottles,
   * the flag, the signboard and the stone wall on the pad's south edge. */
  for (const px of [-250, -242, -234]) {
    picnic(B, px, -296, y);
  }
  B.box('alSteelDark', -262.5, y, -301, -256.5, y + 0.9, -299, { name: 'solar rack' });
  B.draw(-259.5, -298, (K) => {
    for (let i = 0; i < 3; i += 1) {
      const zz = -300.6 + i * 1.6;
      K.begin(0, 0, 0, 0, K.chunk);
      K.extrude('alSolar', [[-262.5, y + 0.9], [-256.5, y + 0.9], [-256.5, y + 1.0], [-262.5, y + 1.0]], zz, zz + 1.4);
    }
  });
  for (const [px, pz] of [[-258.2, -310.5], [-258.2, -306.8]]) {
    B.cap('alWhite', [px, g, pz], [px, g + 2.1, pz], 0.8, { look: 'cyl', seg: 10, name: 'tank' });
  }
  for (let i = 0; i < 5; i += 1) {
    B.post('alRoofBlue', -256, -304.6 + i * 0.5, g, g + 1.2, 0.18, { seg: 8, name: 'gas bottle' });
  }
  B.post('alSteel', -216, -292, y, y + 8, 0.05, { name: 'flagpole' });
  B.draw(-216, -292, (K) => {
    K.box('alWhite', -216 + 0.05, y + 6.6, -292 - 0.02, -216 + 1.9, y + 7.8, -292 + 0.02);
    K.cyl('alRed', [-216 + 0.97, y + 7.2, -292 - 0.03], [-216 + 0.97, y + 7.2, -292 + 0.03], 0.32, 12);
  });
  for (const px of [-224.5, -222.5]) {
    B.post('alTimberDark', px, -290.4, y, y + 1.9, 0.07, { name: 'signboard' });
  }
  B.box('alTimberPale', -225, y + 1.2, -290.5, -222, y + 1.9, -290.3, { name: 'signboard' });
  for (const [a, b] of [[-263, -248], [-245, -226], [-223, -210]]) {
    B.box('alStone', a, y - 1.6, -289, b, y + 0.6, -288, { name: 'stone wall' });
  }
  return { y, g };
}

/* ---- the ropeway ---- */

export const ROPE = {
  up: -164.5,
  down: -155.5,
  zTop: -252,
  zBot: 164,
  rope: 7,
  pylons: [{ z: -170, h: 40 }, { z: -80, h: 40 }, { z: 10, h: 40 }, { z: 95, h: 32 }],
};

/*
 * A station: a concrete hall over the rope's end, open at both ends round
 * the bay the cabins come in through, the bullwheel hung from the roof
 * over the bay, platforms each side, glass along the sides and a deck on
 * the roof. `face` is the end the rope arrives at, -1 north or +1 south.
 */
function station(B, cz, face, y, name) {
  const x0 = -176;
  const x1 = -144;
  const z0 = cz - 12;
  const z1 = cz + 12;
  const top = y + 11;
  const g = y + 0.3;
  B.box('alConcreteMid', x0 - 0.4, y - 2.5, z0 - 0.4, x1 + 0.4, g, z1 + 0.4, { name: 'station plinth' });
  const bay = { from: -171, to: -149, y0: g + 1.2, y1: g + 8.6 };
  for (const ze of [z0 + 0.2, z1 - 0.2]) {
    B.wall('alConcrete', { axis: 'x', at: ze, t: 0.4, from: x0, to: x1, y0: g, y1: top, holes: [bay] }, { name: 'station wall' });
  }
  for (const xe of [x0 + 0.2, x1 - 0.2]) {
    B.box('alConcrete', xe - 0.2, g, z0 + 0.4, xe + 0.2, top, z1 - 0.4, { name: 'station wall' });
  }
  /* The platforms, waist high beside the bay. */
  B.box('alConcreteDark', x0 + 0.4, g, z0 + 0.4, -171, g + 1.2, z1 - 0.4, { name: 'platform' });
  B.box('alConcreteDark', -149, g, z0 + 0.4, x1 - 0.4, g + 1.2, z1 - 0.4, { name: 'platform' });
  B.box('alConcrete', x0, top, z0, x1, top + 0.5, z1, { name: 'station roof' });
  B.railing('alSteel', 'x', z0 + 0.4, x0 + 0.4, x1 - 0.4, top + 0.5);
  B.railing('alSteel', 'x', z1 - 0.4, x0 + 0.4, x1 - 0.4, top + 0.5);
  B.railing('alSteel', 'z', x0 + 0.4, z0 + 0.4, z1 - 0.4, top + 0.5);
  B.railing('alSteel', 'z', x1 - 0.4, z0 + 0.4, z1 - 0.4, top + 0.5);
  /* The bullwheel, at the far end from the rope, hung from the roof. */
  const wz = cz - face * 7;
  const wy = g + ROPE.rope;
  const R = (ROPE.down - ROPE.up) / 2;
  const n = 14;
  for (let i = 0; i < n; i += 1) {
    const s0 = sincos((i / n) * Math.PI * 2);
    const s1 = sincos(((i + 1) / n) * Math.PI * 2);
    B.cap('alSteelDark', [-160 + s0.c * R, wy, wz + s0.s * R], [-160 + s1.c * R, wy, wz + s1.s * R], 0.22, { seg: 6, name: 'bullwheel' });
  }
  B.post('alSteelDark', -160, wz, wy, top, 0.45, { name: 'bullwheel axle' });
  B.box('alSteelDark', -161.2, top - 1.6, wz - 1.2, -158.8, top, wz + 1.2, { name: 'drive' });
  /* The rope inside, from the bay's mouth round to the wheel. */
  const mouth = face < 0 ? z0 : z1;
  for (const x of [ROPE.up, ROPE.down]) {
    B.cap('alCable', [x, wy, mouth], [x, wy, wz], 0.05, { seg: 4, name: 'cable', cast: false });
  }
  /* A cabin docked on the down line at the platform. */
  cabin(B, ROPE.down, wy, cz + face * 2, 'alCabinRed');
  /* The paint: a glass band each side, the red name board over the bay,
   * and the roof's edge in a darker band. */
  B.draw(-160, cz, (K) => {
    for (const xe of [x0 - 0.03, x1 + 0.03]) {
      K.box('alGlass', xe - 0.02, g + 3.4, z0 + 1.5, xe + 0.02, g + 6.4, z1 - 1.5);
      for (let zz = z0 + 1.5; zz <= z1 - 1.4; zz += 3) {
        K.box('alConcreteDark', xe - 0.05, g + 3.3, zz - 0.12, xe + 0.05, g + 6.5, zz + 0.12);
      }
    }
    for (const ze of [z0 - 0.03, z1 + 0.03]) {
      K.box('alRed', -168, g + 8.9, ze - 0.04, -152, g + 10.4, ze + 0.04);
      K.box('alWhite', -167.4, g + 9.35, ze - 0.06, -152.6, g + 9.95, ze + 0.06);
      K.box('alConcreteDark', x0, top - 0.3, ze - 0.05, x1, top, ze + 0.05);
    }
  });
  B.gap(name, -160.6, g + 1.45, face < 0 ? z0 + 0.2 : z1 - 0.2, 5.6, 4.7, 'z', 1);
  return { top, wy };
}

/*
 * A gondola cabin hung from the rope at (x, ropeY, z): the grip, the
 * hanger arm, and the cabin, red below and cream above with its window
 * band. One solid box for the body, the hanger a capsule.
 */
function cabin(B, x, ropeY, z, m) {
  const yb = ropeY - 5.2;
  B.box(m, x - 1.2, yb, z - 2.3, x + 1.2, yb + 2.6, z + 2.3, { draw: false, name: 'cabin' });
  B.cap('alSteelDark', [x, ropeY - 0.15, z], [x, yb + 2.6, z], 0.08, { seg: 6, name: 'hanger' });
  B.draw(x, z, (K) => {
    K.box(m, x - 1.2, yb, z - 2.3, x + 1.2, yb + 1.15, z + 2.3);
    K.box('alCabinCream', x - 1.2, yb + 1.15, z - 2.3, x + 1.2, yb + 2.45, z + 2.3);
    K.box('alGlassDark', x - 1.23, yb + 1.3, z - 2.05, x + 1.23, yb + 2.2, z + 2.05);
    K.box('alGlassDark', x - 1.0, yb + 1.3, z - 2.33, x + 1.0, yb + 2.2, z + 2.33);
    K.box('alCabinCream', x - 1.1, yb + 2.45, z - 2.2, x + 1.1, yb + 2.65, z + 2.2);
    K.box('alSteelDark', x - 0.3, yb + 2.65, z - 0.6, x + 0.3, yb + 2.85, z + 0.6);
    K.box('alSteelDark', x - 0.25, ropeY - 0.3, z - 0.7, x + 0.25, ropeY + 0.12, z + 0.7);
    K.box(m, x - 1.21, yb - 0.08, z - 2.1, x + 1.21, yb, z + 2.1);
  });
}

/*
 * A lattice tower: four legs leaning in from a 3.4 m base to a 1.6 m top,
 * crossed both ways on every face, a crossarm with a sheave train at each
 * end, red at the top, a ladder up the south face. Its base on the ground
 * at the lowest of its four feet; its rope h over that.
 */
function pylon(B, z, h) {
  const x = -160;
  let g = Infinity;
  for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) {
    g = Math.min(g, floorAt(x + dx, z + dz));
  }
  const top = g + h - 1.4;
  const b0 = 1.7;
  const b1 = 0.8;
  const legAt = (sx, sz, t) => {
    const b = b0 + (b1 - b0) * t;
    return [x + sx * b, g - 0.6 + (top + 0.6 - g) * t, z + sz * b];
  };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const red = (h - 6) / h;
  for (const [sx, sz] of corners) {
    B.cap('alSteel', legAt(sx, sz, 0), legAt(sx, sz, red), 0.13, { seg: 6, name: 'tower leg' });
    B.cap('alRed', legAt(sx, sz, red), legAt(sx, sz, 1), 0.13, { seg: 6, name: 'tower leg' });
  }
  const tiers = Math.max(3, Math.round(h / 6));
  for (let k = 0; k < tiers; k += 1) {
    const t0 = k / tiers;
    const t1 = (k + 1) / tiers;
    for (let c = 0; c < 4; c += 1) {
      const [ax, az] = corners[c];
      const [bx, bz] = corners[(c + 1) % 4];
      const m = t1 > red ? 'alRed' : 'alSteel';
      B.cap(m, legAt(ax, az, t0), legAt(bx, bz, t1), 0.05, { seg: 4, name: 'brace' });
      B.cap(m, legAt(bx, bz, t0), legAt(ax, az, t1), 0.05, { seg: 4, name: 'brace' });
      B.cap(m, legAt(ax, az, t1), legAt(bx, bz, t1), 0.05, { seg: 4, name: 'brace' });
    }
  }
  /* The crossarm and its sheaves. */
  B.box('alSteelDark', ROPE.up - 1.6, top, z - 0.45, ROPE.down + 1.6, top + 0.7, z + 0.45, { name: 'crossarm' });
  const ropeY = top + 1.4;
  for (const rx of [ROPE.up, ROPE.down]) {
    B.box('alSteelDark', rx - 0.25, top + 0.7, z - 2.4, rx + 0.25, ropeY - 0.1, z + 2.4, { name: 'sheave train' });
  }
  /* A platform round the top with its rail, and a ladder up the south. */
  B.box('alSteelDark', x - 1.4, top - 1.6, z - 1.4, x + 1.4, top - 1.45, z + 1.4, { name: 'tower deck' });
  B.draw(x, z, (K) => {
    K.ladder('alSteelDark', legAt(1, 1, 0.02), legAt(1, 1, 0.96), 0.45);
    for (const rx of [ROPE.up, ROPE.down]) {
      for (const sz of [-1.8, -0.6, 0.6, 1.8]) {
        K.cyl('alCable', [rx - 0.28, ropeY - 0.32, z + sz], [rx + 0.28, ropeY - 0.32, z + sz], 0.2, 10);
      }
    }
    /* The tower's number board, white on the red. */
    K.box('alWhite', x - 0.5, top - 3.4, z + b1 + 0.18, x + 0.5, top - 2.6, z + b1 + 0.22);
  });
  return { ropeY, g };
}

function ropeway(B) {
  const topY = padLevel('top');
  const valY = padLevel('valley');
  const t = station(B, -264, 1, topY, 'TOP STATION');
  const v = station(B, 176, -1, valY, 'VALLEY STATION');
  const stops = [{ z: ROPE.zTop, y: t.wy }];
  for (const p of ROPE.pylons) {
    const r = pylon(B, p.z, p.h);
    stops.push({ z: p.z, y: r.ropeY });
  }
  stops.push({ z: ROPE.zBot, y: v.wy });
  const lines = { up: [], down: [] };
  for (const [key, x] of [['up', ROPE.up], ['down', ROPE.down]]) {
    for (let i = 0; i + 1 < stops.length; i += 1) {
      const a = stops[i];
      const b = stops[i + 1];
      const sag = Math.abs(b.z - a.z) * 0.012;
      lines[key].push({ a: [x, a.y, a.z], b: [x, b.y, b.z], sag });
      B.cable([x, a.y, a.z], [x, b.y, b.z], sag, 0.05, 10);
    }
  }
  /* Two cabins out on the rope: one coming down the second span, one going
   * up the fourth. */
  const on = (span, s) => {
    const { a, b, sag } = span;
    return [a[0], a[1] + (b[1] - a[1]) * s - 4 * sag * s * (1 - s), a[2] + (b[2] - a[2]) * s];
  };
  const c1 = on(lines.down[1], 0.42);
  cabin(B, c1[0], c1[1], c1[2], 'alCabinRed');
  const c2 = on(lines.up[3], 0.55);
  cabin(B, c2[0], c2[1], c2[2], 'alCabinRed');
  return { stops };
}

/* ---- the valley station's square ---- */

function valleySquare(B) {
  const y = padLevel('valley');
  const g = y + 0.3;
  /* The ticket hall beside the station, plaster under a teal roof. */
  const ax0 = -196;
  const ax1 = -177;
  const az0 = 166;
  const az1 = 186;
  B.box('alConcreteMid', ax0 - 0.3, y - 2, az0 - 0.3, ax1 + 0.3, g, az1 + 0.3, { name: 'hall plinth' });
  const hole = { from: -188.2, to: -185.8, y0: g, y1: g + 2.4 };
  B.wall('alPlaster', { axis: 'x', at: az1 - 0.12, t: 0.24, from: ax0, to: ax1, y0: g, y1: g + 4.2, holes: [hole] }, { name: 'hall wall' });
  B.box('alPlaster', ax0, g, az0, ax1, g + 4.2, az0 + 0.24, { name: 'hall wall' });
  B.box('alPlaster', ax0, g, az0 + 0.24, ax0 + 0.24, g + 4.2, az1 - 0.24, { name: 'hall wall' });
  B.box('alPlaster', ax1 - 0.24, g, az0 + 0.24, ax1, g + 4.2, az1 - 0.24, { name: 'hall wall' });
  B.box('alTimberDark', ax0, g + 4.0, az0, ax1, g + 4.2, az1, { name: 'hall ceiling' });
  B.gableZ('alRoofTeal', az0, az1, (ax0 + ax1) / 2, (ax1 - ax0) / 2, g + 4.2, 3.4, 0.9, 0.2, 'alPlaster');
  B.draw((ax0 + ax1) / 2, az1, (K) => {
    for (const [a, b] of [[ax0 + 1.0, -189.4], [-184.6, ax1 - 1.0]]) {
      K.box('alGlass', a, g + 0.9, az1 + 0.02, b, g + 2.6, az1 + 0.06);
      K.box('alTimberDark', a - 0.08, g + 2.6, az1 + 0.02, b + 0.08, g + 2.72, az1 + 0.08);
    }
    /* A red noren over the door. */
    for (let i = 0; i < 3; i += 1) {
      K.box('alBib', -188.2 + i * 0.82, g + 1.8, az1 + 0.08, -187.5 + i * 0.82, g + 2.5, az1 + 0.11);
    }
  });
  /* The vending machines along the hall's south wall, facing the square. */
  for (let i = 0; i < 4; i += 1) {
    const vx = ax0 + 1.4 + i * 1.15;
    B.box('alWhite', vx - 0.5, g, az1 + 0.1, vx + 0.5, g + 1.85, az1 + 0.95, { draw: false, name: 'vending' });
    B.draw(vx, az1, (K) => {
      K.town('vending', { variant: i % 3, seed: 7 + i }, [vx, g, az1 + 0.1], 0);
    });
  }
  /* The car park east of the station: bays painted, cars parked nose in. */
  const px0 = -138;
  const px1 = -94;
  B.draw((px0 + px1) / 2, 176, (K) => {
    K.box('alAsphalt', px0, y + 0.02, 156, px1, y + 0.06, 190);
    for (let bx = px0 + 2; bx <= px1 - 2; bx += 2.6) {
      K.box('alLine', bx - 0.06, y + 0.06, 157, bx + 0.06, y + 0.075, 162);
      K.box('alLine', bx - 0.06, y + 0.06, 184, bx + 0.06, y + 0.075, 189);
    }
  });
  const CARS = ['kei', 'kei', 'van', 'kei', 'van', 'kei', 'kei', 'van'];
  const COLS = ['white', 'red', 'blue', 'white', 'yellow', 'white', 'green', 'white'];
  let k = 0;
  for (const [row, ry] of [[159.5, Math.PI / 2], [186.5, -Math.PI / 2]]) {
    for (let i = 0; i < 4; i += 1) {
      const cx = px0 + 3.3 + (i * 3 + (row > 170 ? 1 : 0)) * 2.6;
      const kind = CARS[k % CARS.length];
      const colour = COLS[k % COLS.length];
      k += 1;
      B.box('alWhite', cx - 0.85, y, row - 2.0, cx + 0.85, y + 1.6, row + 2.0, { draw: false, name: 'car' });
      B.draw(cx, row, (K) => {
        K.town('car', { kind, colour }, [cx, y, row], ry);
      });
    }
  }
  /* The bus stop by the road and its bench. */
  B.post('alSteel', -120, 197.6, 85, 87.6, 0.04, { name: 'bus stop' });
  B.draw(-120, 197.6, (K) => {
    K.cyl('alRoofBlue', [-120, 87.6, 197.55], [-120, 87.6, 197.65], 0.35, 14);
    K.cyl('alWhite', [-120, 87.6, 197.5], [-120, 87.6, 197.7], 0.27, 14);
  });
  return { y };
}

/* ---- the dam ---- */

const DAM = { x0: DAM_X, x1: DAM_X + 10, z0: 128, z1: 268, toe: 22 };
/* The spillway: three bays between four piers, under the crest road. */
const PIERS = [[196, 198], [204, 206], [212, 214], [220, 222]];
const WEIR = LAKE;
const DECK = DAM_CREST - 1.2;

/* The downstream face: x at height y. */
function faceX(y) {
  return DAM.x1 + (DAM_CREST - y) * 0.625;
}

function dam(B) {
  const { x0, x1, z0, z1, toe } = DAM;
  const spill0 = PIERS[0][0];
  const spill1 = PIERS[PIERS.length - 1][1];
  /* The body, in two metre bands, each as far out as the face is at its
   * top; under the bays only to the weir. */
  for (let y = toe; y < DAM_CREST - 1e-9; y += 2) {
    const yt = y + 2;
    const xr = faceX(yt);
    if (yt <= WEIR) {
      B.box('alDam', x0, y, z0, Math.max(x1, xr), yt, z1, { draw: false, name: 'dam' });
    } else {
      B.box('alDam', x0, y, z0, Math.max(x1, xr), yt, spill0, { draw: false, name: 'dam' });
      B.box('alDam', x0, y, spill1, Math.max(x1, xr), yt, z1, { draw: false, name: 'dam' });
    }
  }
  /* The piers, and the crest road's deck over the bays. */
  for (const [a, b] of PIERS) {
    B.box('alDam', x0 - 1.5, WEIR, a, x1 + 1.5, DECK, b, { name: 'pier' });
  }
  B.box('alDam', x0, DECK, spill0, x1, DAM_CREST, spill1, { draw: false, name: 'deck' });
  /* The training walls down the chute, two metres over the face. */
  for (let y = toe; y < WEIR - 1e-9; y += 2) {
    const xr = faceX(y + 2);
    for (const [a, b] of [[spill0 - 1.2, spill0], [spill1, spill1 + 1.2]]) {
      B.box('alDam', x1, y, a, xr, Math.min(WEIR + 1.5, y + 4), b, { draw: false, name: 'training wall' });
    }
  }
  /* Railings and lamps along the crest, and the gatehouse at the north. */
  B.railing('alSteel', 'z', x0 + 0.3, z0 + 10, z1 - 4, DAM_CREST, 1.1, 2.5);
  B.railing('alSteel', 'z', x1 - 0.3, z0 + 10, z1 - 4, DAM_CREST, 1.1, 2.5);
  for (let z = z0 + 16; z < z1 - 6; z += 14) {
    for (const lx of [x0 + 0.5, x1 - 0.5]) {
      B.post('alSteelDark', lx, z, DAM_CREST, DAM_CREST + 4.2, 0.07, { name: 'lamp' });
    }
  }
  B.box('alConcrete', x0 + 1.5, DAM_CREST, z0 + 2, x1 - 1.5, DAM_CREST + 3.4, z0 + 8, { name: 'gatehouse' });
  B.gableZ('alRoofBlue', z0 + 2, z0 + 8, (x0 + x1) / 2, (x1 - x0) / 2 - 1.5, DAM_CREST + 3.4, 1.8, 0.5, 0.18, 'alConcrete');
  /* The paint: the drawn body (the face as one slope), the crest road,
   * the water over the weir and down the chute, the plunge pool's foam,
   * and the lamps' heads. */
  B.draw((x0 + x1) / 2, (z0 + z1) / 2, (K) => {
    K.begin(0, 0, 0, 0, K.chunk);
    const xt = faceX(toe);
    K.extrude('alDam', [[x0, toe], [x0, DAM_CREST], [x1, DAM_CREST], [xt, toe]], z0, spill0 - 1.2);
    K.extrude('alDam', [[x0, toe], [x0, DAM_CREST], [x1, DAM_CREST], [xt, toe]], spill1 + 1.2, z1);
    K.extrude('alConcreteMid', [[x0, toe], [x0, WEIR], [faceX(WEIR), WEIR], [xt, toe]], spill0, spill1);
    for (const [a, b] of [[spill0 - 1.2, spill0], [spill1, spill1 + 1.2]]) {
      K.extrude('alDam', [[x1, WEIR + 1.5], [faceX(WEIR) + 0.9, WEIR + 1.5], [xt + 2.4, toe + 2], [xt, toe], [x1, toe]], a, b);
    }
    K.box('alDam', x0, DECK, spill0, x1, DAM_CREST, spill1);
    K.box('alAsphalt', x0 + 1.2, DAM_CREST, z0, x1 - 1.2, DAM_CREST + 0.04, z1);
    K.box('alLineYellow', (x0 + x1) / 2 - 0.08, DAM_CREST + 0.04, z0, (x0 + x1) / 2 + 0.08, DAM_CREST + 0.05, z1);
    /* Horizontal lift lines on the face, as the forms leave them. */
    for (let y = toe + 3; y < DAM_CREST; y += 3) {
      const xa = faceX(y);
      for (const [a, b] of [[z0, spill0 - 1.2], [spill1 + 1.2, z1]]) {
        K.box('alConcreteDark', xa - 0.05, y - 0.06, a, xa + 0.06, y + 0.06, b);
      }
    }
    /* The water: a sheet over the weir and down the chute, streaked. */
    for (let i = 0; i < 3; i += 1) {
      const a = PIERS[i][1];
      const b = PIERS[i + 1][0];
      K.box('alWater', x0 - 1.4, WEIR, a, x1, WEIR + 0.12, b);
    }
    K.extrude('alWater', [[x1, WEIR + 0.12], [faceX(WEIR), WEIR + 0.12], [xt + 0.2, toe + 0.15], [xt - 0.4, toe + 0.15]], spill0 + 0.05, spill1 - 0.05);
    for (let i = 0; i < 9; i += 1) {
      const zz = spill0 + 1.4 + i * ((spill1 - spill0 - 2.8) / 8);
      K.extrude('alFoam', [[x1 + 0.3, WEIR + 0.14], [faceX(WEIR) + 0.4, WEIR + 0.14], [xt + 0.1, toe + 0.2], [xt - 0.3, toe + 0.2]], zz - 0.25, zz + 0.25);
    }
    for (let i = 0; i < 14; i += 1) {
      const zz = spill0 + (i * 37) % (spill1 - spill0);
      const xx = xt + 2 + ((i * 53) % 18);
      K.blob('alFoam', [xx, toe + 0.3, zz], 1.4 + (i % 3) * 0.5, 0.45, [i, 0, i * 2]);
    }
    for (let z = z0 + 16; z < z1 - 6; z += 14) {
      for (const [lx, d] of [[x0 + 0.5, 0.6], [x1 - 0.5, -0.6]]) {
        K.cyl('alSteelDark', [lx, DAM_CREST + 4.2, z], [lx + d, DAM_CREST + 4.2, z], 0.05, 4);
        K.box('alWhite', lx + d - 0.2, DAM_CREST + 3.95, z - 0.15, lx + d + 0.2, DAM_CREST + 4.15, z + 0.15);
      }
    }
  });
  B.gap('SPILLWAY', (x0 + x1) / 2, WEIR + 0.3, (PIERS[1][1] + PIERS[2][0]) / 2, 5.5, DECK - WEIR - 0.6, 'x', 2);
}

/* Where the hidden Konex Drone sign goes: inside the middle spillway bay,
 * on its north pier's face, so it is read flying through the bay. */
export const KONEX_SPOT = {
  p: [DAM_X + 5, WEIR + 3.6, PIERS[1][1] + 0.02],
  n: [0, 0, 1],
  up: [0, 1, 0],
  w: 1.2,
};

/* ---- the road ---- */

export const SHED = { x0: 260, x1: 344, z: 132 };

function snowShed(B) {
  const { x0, x1, z } = SHED;
  const y = 70;
  const zb = z - 7.8;
  const zf = z + 6.6;
  const top = y + 7;
  B.box('alConcrete', x0, y - 1, zb - 0.8, x1, top, zb, { name: 'shed wall' });
  B.box('alConcrete', x0, top - 0.8, zb - 0.8, x1, top, zf + 0.8, { name: 'shed roof' });
  for (let cx = x0; cx <= x1 + 0.01; cx += 7) {
    const a = Math.min(Math.max(cx - 0.4, x0), x1 - 0.8);
    B.box('alConcreteMid', a, y, zf, a + 0.8, top - 0.8, zf + 0.8, { name: 'shed column' });
  }
  /* The hill's fill over the roof and behind the wall, drawn: turf on the
   * roof, and the slope's earth banked against the back. */
  B.draw((x0 + x1) / 2, z, (K) => {
    K.box('alPine0', x0 + 0.5, top, zb - 0.8, x1 - 0.5, top + 0.35, zf + 0.2);
    K.begin(0, 0, 0, 0, K.chunk);
    K.extrude('alConcreteDark', [[zb - 0.8, top], [zb - 0.8, top + 0.15], [zf + 0.8, top + 0.15], [zf + 0.8, top]].map(([a, b]) => [a, b]), x0, x0 + 0.01);
    for (let cx = x0; cx <= x1 + 0.01; cx += 7) {
      K.box('alConcreteDark', cx - 0.5, top - 1.4, zf - 0.02, cx + 0.5, top - 0.8, zf + 0.82);
    }
    /* A yellow and black band on each portal. */
    for (const px of [x0 - 0.02, x1 + 0.02]) {
      for (let i = 0; i < 8; i += 1) {
        const za = zb + i * ((zf - zb) / 8);
        K.box(i % 2 ? 'alCable' : 'alYellow', px - 0.02, top - 1.6, za, px + 0.02, top - 1.0, za + (zf - zb) / 8);
      }
    }
  });
  B.gap('SNOW SHED', x0 + 1.5, y + 0.3, (zb + zf) / 2, zf - zb - 0.8, top - 0.8 - y - 0.6, 'x', 1);
}

/* The road's paint along its runs, its guard rail on the downhill side,
 * and its poles. */
function road(B) {
  const seg = [];
  for (let i = 0; i + 1 < ROAD.length; i += 1) {
    seg.push([ROAD[i], ROAD[i + 1]]);
  }
  for (const [a, b] of seg) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.sqrt(dx * dx + dz * dz);
    const tx = dx / L;
    const tz = dz / L;
    const nx = -tz;
    const nz = tx;
    const steps = Math.ceil(L / 8);
    B.draw((a.x + b.x) / 2, (a.z + b.z) / 2, (K) => {
      const THREE = K.THREE;
      const strip = (off0, off1, lift, m, dash = 0) => {
        const pos = [];
        const idx = [];
        for (let s = 0; s <= steps; s += 1) {
          const t = s / steps;
          const cx = a.x + dx * t;
          const cz = a.z + dz * t;
          const cy = a.y + (b.y - a.y) * t + lift;
          for (const o of [off0, off1]) {
            pos.push(cx + nx * o, cy, cz + nz * o);
          }
          if (s < steps && (!dash || s % 2 === 0)) {
            const v = s * 2;
            idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        if (g.attributes.normal.getY(0) < 0) {
          for (let i = 0; i < idx.length; i += 3) {
            const t2 = idx[i + 1];
            idx[i + 1] = idx[i + 2];
            idx[i + 2] = t2;
          }
          g.setIndex(idx);
          g.computeVertexNormals();
        }
        K.begin(0, 0, 0, 0, K.chunk);
        K.add(m, g);
      };
      strip(-ROAD_HALF - 0.6, ROAD_HALF + 0.6, 0.04, 'alConcreteMid');
      strip(-ROAD_HALF, ROAD_HALF, 0.07, 'alAsphalt');
      strip(-ROAD_HALF + 0.15, -ROAD_HALF + 0.3, 0.09, 'alLine');
      strip(ROAD_HALF - 0.3, ROAD_HALF - 0.15, 0.09, 'alLine');
      strip(-0.08, 0.08, 0.09, 'alLineYellow', 1);
    });
    /* The guard rail, on the downhill (south) side, white posts and a rail;
     * the poles on the uphill side, wired. */
    const side = nz > 0 ? 1 : -1;
    const off = side * (ROAD_HALF + 1.0);
    let prev = null;
    for (let s = 0; s <= L; s += 4) {
      const t = s / L;
      const px = a.x + dx * t + nx * off;
      const pz = a.z + dz * t + nz * off;
      const py = a.y + (b.y - a.y) * t;
      if (px > SHED.x0 - 2 && px < SHED.x1 + 2 && Math.abs(pz - SHED.z) < 10) {
        prev = null;
        continue;
      }
      B.post('alWhite', px, pz, py - 0.3, py + 0.8, 0.07, { seg: 5, name: 'guard post' });
      if (prev) {
        B.cap('alWhite', [prev[0], prev[1] + 0.65, prev[2]], [px, py + 0.65, pz], 0.12, { seg: 6, name: 'guard rail' });
      }
      prev = [px, py, pz];
    }
  }
}

/* The utility poles along the road's uphill side, and their wires. */
function poles(B) {
  const pts = [];
  for (let i = 0; i + 1 < ROAD.length; i += 1) {
    const a = ROAD[i];
    const b = ROAD[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.sqrt(dx * dx + dz * dz);
    const nx = -dz / L;
    const nz = dx / L;
    const side = nz > 0 ? -1 : 1;
    for (let s = 20; s < L - 10; s += 38) {
      const t = s / L;
      const px = a.x + dx * t + nx * side * (ROAD_HALF + 2.2);
      const pz = a.z + dz * t + nz * side * (ROAD_HALF + 2.2);
      if (px > SHED.x0 - 6 && px < SHED.x1 + 6) {
        continue;
      }
      const py = floorAt(px, pz);
      B.post('alConcreteMid', px, pz, py - 0.5, py + 10, 0.16, { seg: 6, name: 'pole' });
      B.cap('alSteelDark', [px - nx * 1.1, py + 9.4, pz - nz * 1.1], [px + nx * 1.1, py + 9.4, pz + nz * 1.1], 0.06, { seg: 4, name: 'crossarm' });
      pts.push([px, py + 9.4, pz, nx, nz]);
    }
  }
  B.draw(pts[0][0], pts[0][2], (K) => {
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const p = pts[i];
      const q = pts[i + 1];
      for (const o of [-0.9, 0, 0.9]) {
        const a = [p[0] + p[3] * o, p[1] + 0.12, p[2] + p[4] * o];
        const b = [q[0] + q[3] * o, q[1] + 0.12, q[2] + q[4] * o];
        let last = a;
        for (let s = 1; s <= 6; s += 1) {
          const t = s / 6;
          const c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 2.4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
          K.cyl('alCable', last, c, 0.018, 3);
          last = c;
        }
      }
    }
  });
}

/* ---- the summit ---- */

function summit(B) {
  const s = padLevel('shrine');
  const cx = 120;
  const cz = -344;
  /* The torii on the pad's south edge, facing the hut. */
  const tz = -337.4;
  for (const px of [cx - 1.25, cx + 1.25]) {
    B.post('alRed', px, tz, s - 0.4, s + 2.55, 0.13, { seg: 8, name: 'torii' });
  }
  B.box('alRed', cx - 1.75, s + 2.42, tz - 0.17, cx + 1.75, s + 2.66, tz + 0.17, { name: 'torii' });
  B.box('alRed', cx - 1.45, s + 1.92, tz - 0.09, cx + 1.45, s + 2.08, tz + 0.09, { name: 'torii' });
  B.draw(cx, tz, (K) => {
    K.box('alCable', cx - 1.85, s + 2.66, tz - 0.2, cx + 1.85, s + 2.78, tz + 0.2);
    K.box('alCable', cx - 0.16, s + 2.08, tz - 0.1, cx + 0.16, s + 2.42, tz + 0.1);
  });
  B.gap('SUMMIT TORII', cx, s + 0.25, tz, 2.5 - 0.26 - 0.5, 1.92 - 0.25 - 0.25, 'z', 2);
  /* The stone shrine, and a jizo in a red bib beside it. */
  B.box('alShrineStone', cx - 0.9, s, -349.2, cx + 0.9, s + 0.8, -347.6, { name: 'shrine base' });
  B.box('alShrineStone', cx - 0.6, s + 0.8, -349, cx + 0.6, s + 1.65, -347.8, { name: 'shrine' });
  B.gableX('alStoneDark', cx - 0.7, cx + 0.7, -348.4, 0.75, s + 1.65, 0.45, 0.2, 0.12);
  B.cap('alShrineStone', [cx + 1.8, s, -348.4], [cx + 1.8, s + 0.7, -348.4], 0.28, { look: 'capsule', name: 'jizo' });
  B.draw(cx, -348, (K) => {
    K.box('alCable', cx - 0.25, s + 0.95, -347.78, cx + 0.25, s + 1.45, -347.74);
    K.cyl('alBib', [cx + 1.8, s + 0.62, -348.4], [cx + 1.8, s + 0.32, -348.4], 0.2, 8, 0.34);
    /* A cup of water and a coin or two on the base. */
    K.cyl('alWhite', [cx + 0.4, s + 0.8, -347.7], [cx + 0.4, s + 0.9, -347.7], 0.05, 6);
  });
  /* The summit post, and a cairn. */
  B.box('alTimberPale', cx + 3.6, s, -342.2, cx + 3.85, s + 2.4, -341.95, { name: 'summit post' });
  B.draw(cx + 3.7, -342, (K) => {
    for (let i = 0; i < 5; i += 1) {
      K.box('alCable', cx + 3.68, s + 0.6 + i * 0.32, -341.94, cx + 3.78, s + 0.82 + i * 0.32, -341.92);
    }
    for (let i = 0; i < 6; i += 1) {
      const r = 0.55 - i * 0.07;
      K.blob('alRock', [cx - 3.6, s + 0.25 + i * 0.32, -346 + (i % 2) * 0.05], r, r * 0.6, [i, i * 2, 0]);
    }
  });
  B.cap('alRock', [cx - 3.6, s, -346], [cx - 3.6, s + 1.4, -346], 0.4, { draw: false, name: 'cairn' });
  return { s };
}

/* The trail along the crest from the hut to the summit, as points on the
 * ground a little south of the crest line, every four metres. */
export function trailPoints() {
  const out = [];
  const crestZ = [[-1100, -340], [-600, -300], [-300, -312], [-160, -302], [0, -326], [120, -346], [400, -330]];
  for (let x = -214; x <= 112; x += 4) {
    const z = curve(crestZ, x) + 6 + 6 * (noise(x / 23, 0.5, 51) - 0.5);
    out.push([x, floorAt(x, z), z]);
  }
  return out;
}

function trail(B) {
  const pts = trailPoints();
  B.draw(pts[0][0], pts[0][2], (K) => {
    const THREE = K.THREE;
    const pos = [];
    const idx = [];
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const q = pts[Math.min(i + 1, pts.length - 1)];
      const r = pts[Math.max(i - 1, 0)];
      let tx = q[0] - r[0];
      let tz = q[2] - r[2];
      const L = Math.hypot(tx, tz) || 1;
      tx /= L;
      tz /= L;
      for (const o of [-0.7, 0.7]) {
        const x = p[0] - tz * o;
        const z = p[2] + tx * o;
        pos.push(x, floorAt(x, z) + 0.06, z);
      }
      if (i + 1 < pts.length) {
        const v = i * 2;
        idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) {
      for (let i = 0; i < idx.length; i += 3) {
        const t = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = t;
      }
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    K.begin(0, 0, 0, 0, K.chunk);
    K.add('alPath', g);
  });
  /* Waymarks: a post every forty metres or so, yellow at the top. */
  for (let i = 4; i < pts.length; i += 10) {
    const [x, y, z] = pts[i];
    const px = x + 1.3;
    const py = floorAt(px, z);
    B.post('alTimberPale', px, z, py - 0.3, py + 1.3, 0.05, { seg: 5, name: 'waymark' });
    B.draw(px, z, (K) => {
      K.cyl('alYellow', [px, py + 1.1, z], [px, py + 1.32, z], 0.055, 5);
    });
    void y;
  }
}

/*
 * The avalanche fences: rows of steel snow fence on the north slope under
 * the summit, posts every three metres and four bars, each bay stepped to
 * the ground under it.
 */
function fences(B) {
  const rows = [
    { z: -410, x0: 52, x1: 196 },
    { z: -432, x0: 64, x1: 184 },
    { z: -454, x0: 44, x1: 200 },
  ];
  for (const r of rows) {
    for (let seg = r.x0; seg < r.x1; seg += 42) {
      const end = Math.min(seg + 30, r.x1);
      let prev = null;
      for (let x = seg; x <= end + 0.01; x += 3) {
        const g = floorAt(x, r.z);
        B.cap('alSteel', [x, g - 0.4, r.z], [x, g + 3.4, r.z + 0.5], 0.07, { seg: 5, name: 'snow fence' });
        if (prev) {
          for (const hy of [0.9, 1.7, 2.5, 3.2]) {
            const lean = (hy / 3.8) * 0.5;
            B.cap('alSteelDark', [prev[0], prev[1] + hy, r.z + lean], [x, g + hy, r.z + lean], 0.05, { seg: 4, name: 'snow fence' });
          }
        }
        prev = [x, g];
      }
    }
  }
}

/* The whole of it, laid out once. */
export function layout() {
  const B = new Plan();
  const heli = helipad(B);
  hut(B);
  ropeway(B);
  valleySquare(B);
  dam(B);
  snowShed(B);
  road(B);
  poles(B);
  const top = summit(B);
  trail(B);
  fences(B);
  return { plan: B, heliTop: heli.top, summitY: top.s };
}
