/*
 * grounds.js: everything of Hinode Park that is not the ball ground, the
 * pond or the playground: the paths and the cherry avenue, the plaza and
 * its clock, the toilets and their vending machines, the Inari shrine in
 * the corner, the hedges and the gates, and outside them the lane round
 * the park and the neighbourhood across it.
 *
 * THE NEIGHBOURHOOD is the town's: two storey houses in its cream, pale
 * blue and tea walls with slate roofs, block walls along the lane and an
 * air conditioner on every back, a row of flats along the north and a
 * parade of shops on the east. The lane is the town's too: grey asphalt
 * with a white edge line and no kerb, a green band for the school route,
 * 止まれ painted at every gate, curve mirrors on the corners and the
 * town's concrete poles strung with wires all the way round (those are
 * the document's, ./yard.js, so the built map wires them).
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

import { W, D, rng, faceFrame } from './frame.js';
import { inPond, LOBES, CHANNEL, BRIDGE, TRELLIS, PAVILION } from './pond.js';
import { PLAYGROUND } from './play.js';
import { FENCE, MASTS } from './ballfield.js';

/* The park inside its hedge, and the lane round it (its middle line). */
export const PARK = { x0: 24, x1: W - 24, y0: 24, y1: D - 24 };
export const LANE = { w: 7, x0: 19.5, x1: W - 19.5, y0: 19.5, y1: D - 19.5 };

/* The paths: the cherry avenue west to east, the cross path south to
 * north, and the plaza where they meet. */
export const AVENUE = { y0: 62, y1: 68 };
export const CROSS = { x0: 118, x1: 124 };
export const PLAZA = { px: 121, py: 65, r: 10 };

/* The gates in the hedge, each [px, py, side]. */
export const GATES = [
  [PARK.x0, (AVENUE.y0 + AVENUE.y1) / 2, 'w'],
  [PARK.x1, (AVENUE.y0 + AVENUE.y1) / 2, 'e'],
  [(CROSS.x0 + CROSS.x1) / 2, PARK.y0, 's'],
  [(CROSS.x0 + CROSS.x1) / 2, PARK.y1, 'n'],
];
const GATE_W = 7;

/* The toilets, the shrine, the clock. */
export const TOILETS = { x0: 98, x1: 106, y0: 44, y1: 50, h: 3.0 };
export const SHRINE = { px: 33, py: 38 };
export const TORII = [42, 48, 54].map((px) => ({ px, py: 38, w: 3.2, h: 3.6 }));
export const CLOCK = { px: PLAZA.px, py: PLAZA.py, h: 6.5 };

/* The town's wall colours, for the houses. */
const WALLS = ['wallCream', 'wallBlue', 'wallTea', 'pkWallBeige', 'wallSage', 'wallWhite', 'wallPink', 'wallGray'];
const ROOFS = ['pkRoofSlate', 'pkRoofBrown', 'pkRoofBlue', 'pkRoofTeal'];

/* ---- the lane ---- */

function lane(T) {
  const { w, x0, x1, y0, y1 } = LANE;
  const h = w / 2;
  /* Asphalt round the ring, then the edge lines, then the green band on
   * the park side. */
  T.paint('pkRoad', x0 - h, y0 - h, 0.004, x1 + h, y0 + h, 0.014);
  T.paint('pkRoad', x0 - h, y1 - h, 0.004, x1 + h, y1 + h, 0.014);
  T.paint('pkRoad', x0 - h, y0 + h, 0.0045, x0 + h, y1 - h, 0.0145);
  T.paint('pkRoad', x1 - h, y0 + h, 0.0045, x1 + h, y1 - h, 0.0145);
  const L = 0.07;
  const e = h - 0.35;
  T.wide(() => {
    T.dress(() => {
      /* Edge lines, both sides of every run. */
      for (const s of [-1, 1]) {
        T.paint('pkRoadLine', x0 - e, y0 + s * e - L, 0.0145, x1 + e, y0 + s * e + L, 0.019);
        T.paint('pkRoadLine', x0 - e, y1 + s * e - L, 0.0145, x1 + e, y1 + s * e + L, 0.019);
        T.paint('pkRoadLine', x0 + s * e - L, y0 + e, 0.0145, x0 + s * e + L, y1 - e, 0.019);
        T.paint('pkRoadLine', x1 + s * e - L, y0 + e, 0.0145, x1 + s * e + L, y1 - e, 0.019);
      }
      /* The school route's green band on the park side of the south and
       * west runs. */
      T.paint('pkRoadGreen', x0 + h - 1.4, y0 + h - 0.3, 0.015, x1 - h + 1.4, y0 + h - 0.02, 0.019);
      T.paint('pkRoadGreen', x0 + h - 0.3, y0 + h, 0.015, x0 + h - 0.02, y1 - h, 0.019);
      /* The gates' crossings: zebra bars across the lane. */
      for (const [gx, gy, side] of GATES) {
        const alongX = side === 's' || side === 'n';
        const cy = side === 's' ? y0 : side === 'n' ? y1 : gy;
        const cx = side === 'w' ? x0 : side === 'e' ? x1 : gx;
        for (let k = -3; k <= 3; k += 1) {
          if (alongX) {
            T.paint('pkRoadLine', cx + k * 0.9 - 0.25, cy - e + 0.4, 0.015, cx + k * 0.9 + 0.25, cy + e - 0.4, 0.019);
          } else {
            T.paint('pkRoadLine', cx - e + 0.4, cy + k * 0.9 - 0.25, 0.015, cx + e - 0.4, cy + k * 0.9 + 0.25, 0.019);
          }
        }
      }
    });
  });
  /* 止まれ before each corner, lying on the lane. */
  T.sign('pkStopPaint', x0, y0 + 8, 0.02, 2.6, 1.3, 'up');
  T.sign('pkStopPaint', x1, y1 - 8, 0.02, 2.6, 1.3, 'up');
  T.sign('pkStopPaint', x0 + 10, y1, 0.02, 2.6, 1.3, 'up');
  T.sign('pkStopPaint', x1 - 10, y0, 0.02, 2.6, 1.3, 'up');
  /* The verges: paving between the lane and the houses. */
  T.paint('pkPave', 0, 0, 0.003, W, y0 - h, 0.01);
  T.paint('pkPave', 0, y1 + h, 0.003, W, D, 0.01);
  T.paint('pkPave', 0, y0 - h, 0.0032, x0 - h, y1 + h, 0.0102);
  T.paint('pkPave', x1 + h, y0 - h, 0.0032, W, y1 + h, 0.0102);
  /* The kerb between the lane and the pavement, a hand high. */
  T.deco('pkKerb', x0 - h - 0.2, y0 - h - 0.2, 0, x1 + h + 0.2, y0 - h, 0.12);
  T.deco('pkKerb', x0 - h - 0.2, y1 + h, 0, x1 + h + 0.2, y1 + h + 0.2, 0.12);
  T.deco('pkKerb', x0 - h - 0.2, y0 - h, 0, x0 - h, y1 + h, 0.12);
  T.deco('pkKerb', x1 + h, y0 - h, 0, x1 + h + 0.2, y1 + h, 0.12);
  /* A curve mirror on each corner, orange on its pole: the pole solid. */
  for (const [cx, cy, dx, dy] of [[x0 - h - 0.6, y0 - h - 0.6, 1, 1], [x1 + h + 0.6, y0 - h - 0.6, -1, 1], [x0 - h - 0.6, y1 + h + 0.6, 1, -1], [x1 + h + 0.6, y1 + h + 0.6, -1, -1]]) {
    T.post('pkBeak', cx, cy, 0, 3.0, 0.045, { kind: 'pole', name: 'curve mirror' });
    T.torus('pkBeak', cx + dx * 0.2, cy + dy * 0.2, 3.1, 0.38, 0.05, dx, dy, 6, 16);
    T.cyl('pkWaterSky', [cx + dx * 0.19, cy + dy * 0.19, 3.1], [cx + dx * 0.23, cy + dy * 0.23, 3.1], 0.36, 16, null, true);
    T.sign('pkMirrorTag', cx, cy - dy * 0.06, 2.3, 0.18, 0.5, dy > 0 ? 's' : 'n');
  }
}

/* ---- the houses ---- */

/*
 * A two storey house in a lot frame: `F` faces the lane, u along the
 * front, v back from the lot's front edge. The lot is `w` across and `d`
 * deep; the house stands back behind a block wall with its gate.
 */
function house(T, F, w, d, r) {
  const wall = r.pick(WALLS);
  const roof = r.pick(ROOFS);
  const hw = Math.min(w - 2.2, r.range(7.2, 8.6));
  const u0 = (w - hw) / 2 + r.range(-0.6, 0.6);
  const v0 = r.range(2.6, 3.4);
  const v1 = Math.min(d - 1, v0 + r.range(6.5, 8));
  const eave = 5.7;
  /* The body, one box, solid. */
  F.box(wall, u0, v0, 0, u0 + hw, v1, eave, { kind: 'wall', name: 'house' });
  /* A floor band between the storeys and a plinth. */
  F.deco('pkConcreteMid', u0 - 0.03, v0 - 0.03, 0, u0 + hw + 0.03, v0 + 0.15, 0.35);
  F.deco('trim', u0 - 0.06, v0 - 0.06, 2.85, u0 + hw + 0.06, v0, 3.0);
  /* The roof: a gable along the front or across it, overhanging. */
  const ridge = eave + r.range(1.6, 2.2);
  const o = 0.55;
  if (r.chance(0.6)) {
    F.prismAlong(roof, [[v0 - o, eave - 0.25], [(v0 + v1) / 2, ridge], [v1 + o, eave - 0.25], [v1 + o, eave - 0.05], [(v0 + v1) / 2, ridge + 0.2], [v0 - o, eave - 0.05]], u0 - o, u0 + hw + o);
    F.prismAlong(wall, [[v0, eave], [(v0 + v1) / 2, ridge - 0.1], [v1, eave]], u0 + 0.01, u0 + hw - 0.01);
  } else {
    F.prismAcross(roof, [[u0 - o, eave - 0.25], [u0 + hw / 2, ridge], [u0 + hw + o, eave - 0.25], [u0 + hw + o, eave - 0.05], [u0 + hw / 2, ridge + 0.2], [u0 - o, eave - 0.05]], v0 - o, v1 + o);
    F.prismAcross(wall, [[u0, eave], [u0 + hw / 2, ridge - 0.1], [u0 + hw, eave]], v0 + 0.01, v1 - 0.01);
  }
  /* Its solid under the roof, two steps. */
  F.hidden(u0, v0, eave, u0 + hw, v1, eave + (ridge - eave) * 0.5, 'wall', 'house roof');
  /* Windows: the ground floor's door and window, the first floor's two
   * windows, each glass in a frame, and the shutter box over one. */
  const glass = r.chance(0.5) ? 'glassDark' : 'glassBlue';
  const door = u0 + r.range(0.8, hw - 2.0);
  F.deco('pkWoodDark', door, v0 - 0.06, 0.2, door + 1.0, v0, 2.2);
  F.deco('pkBrass', door + 0.8, v0 - 0.09, 1.05, door + 0.88, v0 - 0.05, 1.12, true);
  const win = door > u0 + hw / 2 ? u0 + 0.9 : u0 + hw - 2.6;
  F.deco(glass, win, v0 - 0.04, 0.9, win + 1.7, v0, 2.1);
  F.deco('trim', win - 0.06, v0 - 0.07, 0.84, win + 1.76, v0 - 0.03, 0.9, true);
  for (const a of [u0 + 0.8, u0 + hw - 2.4]) {
    F.deco(glass, a, v0 - 0.04, 3.6, a + 1.6, v0, 4.9);
    F.deco('shutter', a - 0.05, v0 - 0.18, 4.9, a + 1.65, v0, 5.15, true);
  }
  /* The balcony on the first floor, its rail, its washing pole. */
  if (r.chance(0.65)) {
    const b0 = u0 + hw * 0.18;
    const b1 = u0 + hw * 0.82;
    F.box('pkConcreteMid', b0, v0 - 1.0, 3.0, b1, v0, 3.18, { kind: 'wall', name: 'balcony' });
    F.deco('pkSteel', b0, v0 - 1.0, 3.18, b1, v0 - 0.94, 4.1);
    F.cyl('pkSteelDark', [b0 + 0.2, v0 - 0.5, 4.6], [b1 - 0.2, v0 - 0.5, 4.6], 0.025, 4, null, true);
    T.dress(() => {
      const n = r.int(2, 5);
      for (let k = 0; k < n; k += 1) {
        const a = b0 + 0.5 + k * ((b1 - b0 - 1) / n);
        F.deco(r.pick(['pkSwan', 'pkBlue', 'pkAzalea', 'pkPlayYellow']), a, v0 - 0.52, 3.9, a + 0.5, v0 - 0.48, 4.55);
      }
    });
  }
  /* An air conditioner on the side, a meter, a gutter downpipe. */
  T.dress(() => {
    F.deco('acUnit', u0 + hw + 0.05, v0 + 1.5, 0.1, u0 + hw + 0.4, v0 + 2.3, 0.7);
    F.deco('acUnit', u0 + 0.6, v1, 3.3, u0 + 1.4, v1 + 0.35, 3.9);
    F.cyl('pkSteelDark', [u0 + hw - 0.1, v0 - 0.1, 0], [u0 + hw - 0.1, v0 - 0.1, eave], 0.04, 5);
  });
  /* The block wall along the front, with the gate gap at the door, its
   * posts, the post box and the name plate. */
  const g0 = door - 0.4;
  const g1 = door + 1.6;
  const bh = 1.3;
  F.box('pkBlock', 0.1, 0.1, 0, g0, 0.3, bh, { kind: 'wall', name: 'block wall' });
  F.box('pkBlock', g1, 0.1, 0, w - 0.1, 0.3, bh, { kind: 'wall', name: 'block wall' });
  F.box('pkBlock', 0.1, 0.3, 0, 0.3, v0 - 0.4, bh, { kind: 'wall', name: 'block wall' });
  F.deco('pkConcreteMid', 0.05, 0.05, bh, g0, 0.35, bh + 0.08);
  F.deco('pkConcreteMid', g1, 0.05, bh, w - 0.05, 0.35, bh + 0.08);
  T.dress(() => {
    F.deco('pkSwan', g0 - 0.6, 0.0, 1.0, g0 - 0.1, 0.1, 1.2);
    F.deco('pkPlayRed', g0 - 0.55, -0.02, 0.6, g0 - 0.15, 0.1, 0.9);
    /* A pot or two by the gate, a bike in the drive, and a garden. */
    F.cyl('pkClayWorn', [g1 + 0.3, 0.6, 0], [g1 + 0.3, 0.6, 0.35], 0.18, 8, 0.24);
    F.ball('pkShrub', g1 + 0.3, 0.6, 0.5, 0.25);
    if (r.chance(0.5)) {
      const a = g1 + 1.2;
      F.ring('pkWoodDark', a, 1.0, 0.33, 0.3, 0.03, 0, 1, 4, 12);
      F.ring('pkWoodDark', a + 1.05, 1.0, 0.33, 0.3, 0.03, 0, 1, 4, 12);
      F.cyl(r.pick(['pkPlayRed', 'pkPlayBlue', 'pkSwan']), [a, 1.0, 0.35], [a + 1.05, 1.0, 0.55], 0.03, 4);
    }
  });
  /* A tree in the yard, sometimes. */
  if (r.chance(0.45) && v1 + 3 < d) {
    F.asset({ type: 'tree', style: r.chance(0.6) ? 'street' : 'pine', dims: { size: 0.6, variant: r.int(1, 99) } }, 1, u0 + hw / 2, v1 + 1.8, 0, 0);
  }
  /* The front garden paved, the rest gravel. */
  F.paint('pkConcreteMid', g0, 0.3, 0.012, g1, v0, 0.02);
}

/* A row of lots along one edge of the plot. */
function houseRow(T, from, to, depth, face, seed, place) {
  const r = rng(seed);
  let a = from;
  while (a < to - 8) {
    const w = Math.min(to - a, r.range(10, 13));
    if (w < 8.5) {
      break;
    }
    const [ox, oy] = place(a, w);
    house(T, faceFrame(T, ox, oy, face), w, depth, r);
    a += w;
  }
}

function neighbourhood(T) {
  const h = LANE.w / 2;
  /* South: houses facing north onto the lane, their lots from the lane's
   * verge back to the plot's edge. */
  const southFront = LANE.y0 - h - 0.6;
  houseRow(T, 2, W - 30, southFront, 'n', 8101, (a, w) => [a + w, southFront]);
  /* West: houses facing east. */
  const westFront = LANE.x0 - h - 0.6;
  houseRow(T, 30, D - 32, westFront, 'e', 8102, (a, w) => [westFront, a]);
  /* North: flats across the lane, the town's own block, three of them. */
  for (const [x, wd] of [[48, 40], [104, 36], [160, 40]]) {
    T.asset({ type: 'building', style: 'flats', dims: { width: wd, depth: 9, floors: 4, passage: 0, variant: Math.round(x / 7) } }, 1, x, D - 6.5, 0, 0);
  }
  /* East: a parade of shops with flats over them, facing the park. */
  for (let k = 0; k < 6; k += 1) {
    const y = 40 + k * 22;
    T.asset({ type: 'building', style: 'shop', dims: { width: 14, depth: 9, floors: 2 + (k % 2), passage: 0, variant: 3 + k } }, 1, W - 6.5, y, 0, Math.PI / 2);
  }
  /* The corners: a car park, a coin laundry's vending row. */
  for (const [x, y] of [[W - 12, 12], [W - 12, D - 12], [12, D - 12]]) {
    T.asset({ type: 'vending', dims: { count: 3, variant: Math.round(x + y) } }, 1, x, y, 0, x > W / 2 ? Math.PI : 0);
  }
  for (let k = 0; k < 3; k += 1) {
    T.asset({ type: 'car', style: ['kei', 'keivan', 'hatch'][k], dims: { variant: 2 + k * 3 } }, 1, W - 30 + k * 3.2, 8, 0, Math.PI / 2);
  }
}

/* ---- the park's edge ---- */

/* The hedge round the park: clipped azaleas a metre high, solid, with
 * a pipe rail in front, broken at each gate. */
function hedges(T) {
  const P = PARK;
  const runs = [];
  const gateAt = (side) => GATES.filter((g) => g[2] === side).map((g) => (side === 's' || side === 'n' ? g[0] : g[1]));
  const split = (a, b, gates) => {
    const out = [];
    let s = a;
    for (const g of gates.sort((p, q) => p - q)) {
      out.push([s, g - GATE_W / 2]);
      s = g + GATE_W / 2;
    }
    out.push([s, b]);
    return out;
  };
  for (const [a, b] of split(P.x0, P.x1, gateAt('s'))) {
    runs.push(['x', P.y0, a, b]);
  }
  for (const [a, b] of split(P.x0, P.x1, gateAt('n'))) {
    runs.push(['x', P.y1, a, b]);
  }
  for (const [a, b] of split(P.y0, P.y1, gateAt('w'))) {
    runs.push(['y', P.x0, a, b]);
  }
  for (const [a, b] of split(P.y0, P.y1, gateAt('e'))) {
    runs.push(['y', P.x1, a, b]);
  }
  const r = rng(8201);
  for (const [along, at, a, b] of runs) {
    if (along === 'x') {
      T.box('pkShrub', a, at - 0.6, 0, b, at + 0.6, 0.95, { kind: 'canopy', name: 'hedge' });
    } else {
      T.box('pkShrub', at - 0.6, a, 0, at + 0.6, b, 0.95, { kind: 'canopy', name: 'hedge' });
    }
    T.wide(() => {
      T.dress(() => {
        for (let s = a + 0.6; s < b - 0.4; s += 1.1) {
          const [px, py] = along === 'x' ? [s, at] : [at, s];
          T.bead(r.chance(0.55) ? 'pkAzalea' : 'pkShrub', px + r.range(-0.3, 0.3), py + r.range(-0.3, 0.3), 0.92, r.range(0.32, 0.48));
        }
      });
    });
  }
  /* The gates: a bollard pair, the name on a stone, a lamp. */
  for (const [gx, gy, side] of GATES) {
    const alongX = side === 's' || side === 'n';
    for (const k of [-1.6, 0, 1.6]) {
      const [px, py] = alongX ? [gx + k, gy] : [gx, gy + k];
      T.post('pkSteel', px, py, 0, 0.85, 0.06, { kind: 'pole', name: 'bollard' });
      T.ball('pkPlayYellow', px, py, 0.82, 0.07, true);
    }
    const out = { s: [0, -1], n: [0, 1], w: [-1, 0], e: [1, 0] }[side];
    const [sx, sy] = alongX ? [gx - GATE_W / 2 - 1.2, gy - out[1] * 1.6] : [gx - out[0] * 1.6, gy - GATE_W / 2 - 1.2];
    T.box('pkStone', sx - 0.7, sy - 0.35, 0, sx + 0.7, sy + 0.35, 1.1, { kind: 'rock', name: 'name stone' });
    const face = side;
    const [fx, fy] = [sx + out[0] * 0.36, sy + out[1] * 0.36];
    if (alongX) {
      T.sign('pkParkName', fx, fy, 0.62, 1.2, 0.8, face);
    } else {
      T.sign('pkParkName', fx, fy, 0.62, 1.2, 0.8, face);
    }
  }
}

/* ---- the paths, the plaza, the cherry avenue ---- */

function paths(T) {
  const P = PARK;
  T.paint('pkPath', P.x0, AVENUE.y0, 0.005, P.x1, AVENUE.y1, 0.015);
  T.paint('pkPath', CROSS.x0, P.y0, 0.0052, CROSS.x1, P.y1, 0.0152);
  T.disc('pkPave', PLAZA.px, PLAZA.py, PLAZA.r, 0.015, 0.025, 48);
  T.disc('pkPaveAlt', PLAZA.px, PLAZA.py, PLAZA.r - 2.5, 0.025, 0.03, 40);
  /* The paths to the pond's shore and to the toilets and the shrine. */
  T.paint('pkPath', 60, AVENUE.y1, 0.0054, 64, 86, 0.0154);
  T.paint('pkPath', CHANNEL.x0 - 12, BRIDGE.py - 1.5, 0.0056, CHANNEL.x0 - 2, BRIDGE.py + 1.5, 0.0156);
  T.paint('pkPath', CHANNEL.x1 + 2, BRIDGE.py - 1.5, 0.0056, CROSS.x0, BRIDGE.py + 1.5, 0.0156);
  T.paint('pkPath', CROSS.x1, 92, 0.0057, 136, 96, 0.0157);
  T.paint('pkPath', PAVILION.px - 2, PAVILION.py - 6, 0.0057, CROSS.x0, PAVILION.py - 3, 0.0157);
  T.paint('pkPath', 34, 36, 0.0058, 98, 40, 0.0158);
  T.paint('pkPath', TOILETS.x0 - 1, TOILETS.y1, 0.0059, TOILETS.x1 + 1, AVENUE.y0, 0.0159);
  T.paint('pkPath', TRELLIS.x0, TRELLIS.y1 + 1, 0.006, TRELLIS.x1, TRELLIS.y1 + 3, 0.016);
  /* Kerbs of granite setts along the avenue's two sides, wide. */
  T.wide(() => {
    T.dress(() => {
      T.paint('pkStone', P.x0, AVENUE.y0 - 0.25, 0.005, P.x1, AVENUE.y0, 0.04);
      T.paint('pkStone', P.x0, AVENUE.y1, 0.005, P.x1, AVENUE.y1 + 0.25, 0.04);
    });
  });
  /* The cherry avenue: a sakura every eight metres both sides, where the
   * ground leaves room, the town's own tree. */
  const r = rng(8301);
  for (let x = P.x0 + 6; x < P.x1 - 4; x += 8) {
    for (const y of [AVENUE.y0 - 2.6, AVENUE.y1 + 2.6]) {
      if (Math.abs(x - PLAZA.px) < PLAZA.r + 3) {
        continue;
      }
      if (MASTS.some((m) => (m.px - x) ** 2 + (m.py - y) ** 2 < 25)) {
        continue;
      }
      if (y > AVENUE.y1 && x > FENCE.x0 - 6 && x < 200 && y + 3 > 72) {
        /* in front of the stands: keep the parents' view */
      }
      if (inPond(x, y)) {
        continue;
      }
      T.asset({ type: 'tree', style: 'sakura', dims: { size: r.range(0.85, 1.1), variant: r.int(1, 99) } }, 1, x + r.range(-0.6, 0.6), y, 0, r.range(0, 6.28));
    }
  }
  /* Zelkova along the cross path, the town's street tree. */
  for (let y = P.y0 + 8; y < P.y1 - 4; y += 12) {
    if (Math.abs(y - PLAZA.py) < PLAZA.r + 4) {
      continue;
    }
    for (const x of [CROSS.x0 - 2.4, CROSS.x1 + 2.4]) {
      if (inPond(x, y) || (x > CROSS.x1 && y > 70 && y < 100)) {
        continue;
      }
      T.asset({ type: 'tree', style: 'street', dims: { size: r.range(0.9, 1.15), variant: r.int(1, 99) } }, 1, x, y, 0, 0);
    }
  }
  /* Groves: cherries round the pond, pines and street trees by the
   * shrine and the hedge corners. */
  const grove = [
    [40, 125, 'sakura'], [56, 128, 'sakura'], [80, 124, 'sakura'], [108, 122, 'sakura'], [108, 146, 'sakura'],
    [84, 165, 'sakura'], [40, 168, 'pine'], [60, 170, 'street'], [112, 104, 'sakura'], [100, 86, 'street'],
    [48, 88, 'sakura'], [32, 112, 'pine'], [30, 140, 'pine'], [30, 26 + 30, 'street'], [28, 50, 'pine'],
    [44, 28, 'pine'], [52, 30, 'pine'], [70, 30, 'street'], [86, 32, 'sakura'], [110, 30, 'street'],
    [130, 50, 'sakura'], [132, 30, 'street'], [228, 31, 'street'], [196, 30, 'sakura'], [128, 110, 'street'],
    [128, 140, 'street'], [128, 166, 'pine'],
  ];
  for (const [x, y, style] of grove) {
    T.asset({ type: 'tree', style, dims: { size: r.range(0.9, 1.2), variant: r.int(1, 99) } }, 1, x, y, 0, r.range(0, 6.28));
  }
}

/* The clock on the plaza, a fountain round its foot, benches round both. */
function plaza(T) {
  const C = CLOCK;
  T.disc('pkStone', C.px, C.py, 3.2, 0.03, 0.55, 32);
  T.disc('pkWater', C.px, C.py, 2.8, 0.55, 0.6, 32);
  T.box('pkStone', C.px - 2.9, C.py - 2.9, 0, C.px + 2.9, C.py + 2.9, 0.55, { draw: false, kind: 'wall', name: 'fountain' });
  T.cap('pkSteel', [C.px, C.py, 0.55], [C.px, C.py, C.h], 0.16, { kind: 'pole', name: 'clock pole', seg: 10 });
  T.box('pkSwan', C.px - 0.55, C.py - 0.55, C.h, C.px + 0.55, C.py + 0.55, C.h + 1.1, { kind: 'wall', name: 'clock' });
  T.cone('pkRoofTeal', C.px, C.py, C.h + 1.1, 0.85, 0.6, 4);
  T.bead('pkBrass', C.px, C.py, C.h + 1.75, 0.1);
  for (const f of ['n', 's', 'e', 'w']) {
    const d = { n: [0, 0.56], s: [0, -0.56], e: [0.56, 0], w: [-0.56, 0] }[f];
    T.sign('pkClock', C.px + d[0], C.py + d[1], C.h + 0.55, 0.9, 0.9, f);
  }
  /* Jets. */
  T.dress(() => {
    for (const [dx, dy] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) {
      T.cyl('pkWaterSky', [C.px + dx, C.py + dy, 0.6], [C.px + dx * 0.6, C.py + dy * 0.6, 1.5], 0.05, 5, 0.02);
    }
  });
  /* Benches round the plaza's edge, at the quarter points between paths. */
  for (const [dx, dy, along] of [[6, 6, 'x'], [-6, 6, 'x'], [6, -6, 'x'], [-6, -6, 'x']]) {
    bench(T, C.px + dx, C.py + dy, along, dy > 0 ? 's' : 'n');
  }
}

/* A park bench: concrete legs, timber slats, solid as a low box. */
function bench(T, px, py, along, faces) {
  const L = 1.0;
  if (along === 'x') {
    T.box('pkWood', px - L, py - 0.22, 0.38, px + L, py + 0.22, 0.45, { kind: 'wall', name: 'bench' });
    const back = faces === 's' ? py + 0.22 : py - 0.28;
    T.deco('pkWood', px - L, back, 0.5, px + L, back + 0.06, 0.85);
    for (const s of [-0.8, 0.8]) {
      T.box('pkConcreteMid', px + s - 0.06, py - 0.25, 0, px + s + 0.06, py + 0.25, 0.38, { kind: 'wall', name: 'bench' });
    }
  } else {
    T.box('pkWood', px - 0.22, py - L, 0.38, px + 0.22, py + L, 0.45, { kind: 'wall', name: 'bench' });
    const back = faces === 'w' ? px + 0.22 : px - 0.28;
    T.deco('pkWood', back, py - L, 0.5, back + 0.06, py + L, 0.85);
    for (const s of [-0.8, 0.8]) {
      T.box('pkConcreteMid', px - 0.25, py + s - 0.06, 0, px + 0.25, py + s + 0.06, 0.38, { kind: 'wall', name: 'bench' });
    }
  }
}

/* Benches, bins, drinking fountains and the park's lamps along the paths. */
function furniture(T) {
  const P = PARK;
  for (let x = P.x0 + 14; x < P.x1 - 8; x += 24) {
    if (Math.abs(x - PLAZA.px) < PLAZA.r + 2) {
      continue;
    }
    bench(T, x, AVENUE.y0 - 1.0, 'x', 'n');
    bench(T, x + 12, AVENUE.y1 + 1.0, 'x', 's');
  }
  /* Lamps: the park's, a post with a lantern head, solid as a pole. */
  const lamp = (px, py) => {
    T.post('pkSteelDark', px, py, 0, 4.2, 0.07, { kind: 'pole', name: 'park lamp' });
    T.box('pkSteelDark', px - 0.22, py - 0.22, 4.2, px + 0.22, py + 0.22, 4.28, { solid: false });
    T.box('pkLamp', px - 0.18, py - 0.18, 4.28, px + 0.18, py + 0.18, 4.7, { solid: false, cast: false });
    T.cone('pkSteelDark', px, py, 4.7, 0.3, 0.22, 4);
  };
  for (let x = P.x0 + 10; x < P.x1 - 4; x += 20) {
    lamp(x, AVENUE.y0 - 0.6);
  }
  for (let y = P.y0 + 6; y < P.y1 - 4; y += 20) {
    if (Math.abs(y - PLAZA.py) < PLAZA.r + 1) {
      continue;
    }
    lamp(CROSS.x1 + 0.6, y);
  }
  /* Drinking fountains: a post with a bowl. */
  for (const [px, py] of [[PLAZA.px + 8, PLAZA.py - 4.5], [PLAYGROUND.x0 + 6, PLAYGROUND.y1 - 3], [TOILETS.x1 + 1.5, TOILETS.y0 + 1]]) {
    T.post('pkStone', px, py, 0, 0.8, 0.14, { kind: 'pole', name: 'drinking fountain' });
    T.disc('pkSteel', px, py, 0.28, 0.8, 0.9, 12);
  }
  /* Bins in pairs, burnable and not, the town's blue and red. */
  T.dress(() => {
    for (let x = P.x0 + 20; x < P.x1 - 8; x += 48) {
      T.cyl('pkBlue', [x, AVENUE.y0 - 1.3, 0], [x, AVENUE.y0 - 1.3, 0.8], 0.25, 8);
      T.cyl('pkRed', [x + 0.6, AVENUE.y0 - 1.3, 0], [x + 0.6, AVENUE.y0 - 1.3, 0.8], 0.25, 8);
    }
  });
  /* The park's rules board by the south gate, the bicycles at the west. */
  T.post('pkSteelDark', CROSS.x0 - 3.2, P.y0 + 2.5, 0, 1.9, 0.05, { kind: 'pole', name: 'sign post' });
  T.post('pkSteelDark', CROSS.x0 - 1.2, P.y0 + 2.5, 0, 1.9, 0.05, { kind: 'pole', name: 'sign post' });
  T.box('pkSwan', CROSS.x0 - 3.3, P.y0 + 2.45, 0.8, CROSS.x0 - 1.1, P.y0 + 2.55, 1.95, { kind: 'wall', name: 'rules board' });
  T.sign('pkRules', CROSS.x0 - 2.2, P.y0 + 2.44, 1.37, 2.1, 1.1, 's');
  T.sign('pkRules', CROSS.x0 - 2.2, P.y0 + 2.56, 1.37, 2.1, 1.1, 'n');
  T.dress(() => {
    for (let k = 0; k < 7; k += 1) {
      const y = AVENUE.y1 + 4 + k * 0.7;
      const x = P.x0 + 3;
      T.torus('pkWoodDark', x, y, 0.33, 0.3, 0.03, 0, 1, 4, 12);
      T.torus('pkWoodDark', x + 1.05, y, 0.33, 0.3, 0.03, 0, 1, 4, 12);
      T.cyl(['pkPlayRed', 'pkPlayBlue', 'pkSwan', 'pkPlayYellow', 'pkSteel'][k % 5], [x, y, 0.35], [x + 1.05, y, 0.55], 0.03, 4);
      T.cyl('pkSteelDark', [x + 0.9, y, 0.55], [x + 0.95, y, 0.9], 0.02, 3);
    }
  });
}

/* The public toilets: a concrete block, a hipped roof, the pictograms,
 * and the vending machines beside it. */
function toilets(T) {
  const B = TOILETS;
  T.box('pkConcrete', B.x0, B.y0, 0, B.x1, B.y1, B.h, { kind: 'wall', name: 'toilets' });
  const o = { x0: B.x0 - 0.7, y0: B.y0 - 0.7, x1: B.x1 + 0.7, y1: B.y1 + 0.7 };
  const i = { x0: B.x0 + 2.5, y0: (B.y0 + B.y1) / 2 - 0.2, x1: B.x1 - 2.5, y1: (B.y0 + B.y1) / 2 + 0.2 };
  T.frustum('pkRoofSlate', o, B.h, i, B.h + 1.6);
  T.frustumSolid(o, B.h, i, B.h + 1.6, 3, 'toilets roof');
  T.deco('pkConcreteMid', B.x0 - 0.05, B.y1, 0, B.x1 + 0.05, B.y1 + 0.06, 0.4);
  /* The two doorways in the north wall, screened by a wall in front. */
  for (const x of [B.x0 + 1.2, B.x1 - 2.4]) {
    T.deco('glassDark', x, B.y1, 0.05, x + 1.2, B.y1 + 0.03, 2.2);
  }
  T.box('pkTactile', B.x0 + 1, B.y1 + 0.3, 0.0, B.x1 - 1, B.y1 + 1.6, 0.015, { solid: false, cast: false });
  T.sign('pkToilet', (B.x0 + B.x1) / 2, B.y1 + 0.04, 2.55, 2.4, 0.6, 'n');
  T.dress(() => {
    T.deco('acUnit', B.x0 - 0.4, B.y0 + 1, 0.2, B.x0, B.y0 + 1.9, 0.8);
  });
  /* The vending machines against its east wall, facing east. */
  T.asset({ type: 'vending', dims: { count: 3, variant: 4 } }, 1, B.x1 + 0.6, (B.y0 + B.y1) / 2, 0, 0);
}

/* The shrine: three torii in a row, the little 祠 behind them, its fox
 * guardians, a stone basin and the rope. */
function shrine(T) {
  for (const t of TORII) {
    const hw = t.w / 2;
    for (const s of [-1, 1]) {
      T.post('pkLacquer', t.px, t.py + s * hw, 0, t.h, 0.16, { kind: 'pole', name: 'torii pillar' });
      T.disc('pkWoodDark', t.px, t.py + s * hw, 0.22, 0, 0.3, 10);
    }
    /* The upper lintel, its ends swept, and the tie beam under it. */
    T.box('pkWoodDark', t.px - 0.2, t.py - hw - 0.8, t.h, t.px + 0.2, t.py + hw + 0.8, t.h + 0.22, { kind: 'wall', name: 'torii lintel' });
    T.box('pkLacquer', t.px - 0.16, t.py - hw - 0.6, t.h - 0.2, t.px + 0.16, t.py + hw + 0.6, t.h, { kind: 'wall', name: 'torii lintel' });
    T.box('pkLacquer', t.px - 0.11, t.py - hw - 0.25, t.h - 0.95, t.px + 0.11, t.py + hw + 0.25, t.h - 0.75, { kind: 'wall', name: 'torii beam' });
    T.deco('pkLacquer', t.px - 0.06, t.py - 0.12, t.h - 0.75, t.px + 0.06, t.py + 0.12, t.h - 0.2);
  }
  /* The 祠: a small hall on a stone base, its roof, its rope and paper. */
  const S = SHRINE;
  T.box('pkStone', S.px - 2, S.py - 2, 0, S.px + 2, S.py + 2, 0.6, { kind: 'wall', name: 'shrine base' });
  T.box('pkWood', S.px - 1.2, S.py - 1.2, 0.6, S.px + 1.2, S.py + 1.2, 2.2, { kind: 'wall', name: 'shrine' });
  T.prism('pkRoofSlate', 'y', [[S.px - 1.9, 2.0], [S.px, 3.2], [S.px + 1.9, 2.0], [S.px + 1.9, 2.15], [S.px, 3.38], [S.px - 1.9, 2.15]], S.py - 1.7, S.py + 1.7);
  T.hidden(S.px - 1.2, S.py - 1.2, 2.2, S.px + 1.2, S.py + 1.2, 2.7, 'wall', 'shrine roof');
  T.cyl('pkWood', [S.px + 1.25, S.py - 1.0, 1.95], [S.px + 1.25, S.py + 1.0, 1.95], 0.07, 6);
  T.dress(() => {
    for (const dy of [-0.6, 0, 0.6]) {
      T.deco('pkSwan', S.px + 1.27, S.py + dy - 0.05, 1.5, S.px + 1.3, S.py + dy + 0.05, 1.9);
    }
    /* Two foxes on plinths, with their red bibs. */
    for (const s of [-1, 1]) {
      const fy = S.py + s * 2.4;
      T.box('pkStone', S.px + 2.6, fy - 0.3, 0, S.px + 3.2, fy + 0.3, 0.7);
      T.ball('pkStone', S.px + 2.9, fy, 0.95, 0.26);
      T.bead('pkStone', S.px + 2.95, fy, 1.3, 0.16);
      T.cone('pkStone', S.px + 2.95, fy + 0.07, 1.4, 0.05, 0.14, 4);
      T.cone('pkStone', S.px + 2.95, fy - 0.07, 1.4, 0.05, 0.14, 4);
      T.deco('pkRed', S.px + 2.75, fy - 0.2, 0.95, S.px + 3.18, fy + 0.2, 1.1);
    }
    /* The basin. */
    T.box('pkStone', S.px + 4, S.py + 3, 0, S.px + 5.2, S.py + 3.8, 0.7);
    T.box('pkWater', S.px + 4.1, S.py + 3.1, 0.7, S.px + 5.1, S.py + 3.7, 0.72);
  });
  T.paint('pkPath', S.px - 2.5, S.py - 2.5, 0.006, TORII[2].px + 3, S.py + 2.5, 0.016);
  T.sign('pkShrine', TORII[2].px + 0.21, TORII[2].py, TORII[2].h - 0.48, 0.4, 0.62, 'e');
}

export function grounds(T) {
  lane(T);
  neighbourhood(T);
  hedges(T);
  paths(T);
  plaza(T);
  furniture(T);
  toilets(T);
  shrine(T);
}
