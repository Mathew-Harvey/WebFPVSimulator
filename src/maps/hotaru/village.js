/*
 * village.js: the valley floor of Hotaru Valley. The farm village on the
 * west bank, its kura and its barn; the mill under the north hills; the
 * shrine on its knoll over the east bank; the paddies everywhere the land
 * is flat, some still standing gold, some cut and their rice hung to dry
 * on racks; the terraces up the east hillside; the road, its poles and
 * wires, its bridges, its bus stop and its vending machine; and the
 * billboards standing in the paddies the way they stand beside every
 * country road in Japan, which is where the partners' signs hang.
 *
 * Positions are the plan's (./frame.js), written by hand against the
 * land (./land.js): the river, the knoll and the terraces' footprint are
 * the land's, and nothing here is solid where the river runs.
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

import { hash2 } from './frame.js';
import {
  landAt, nearestOnLine, smooth, RIVER, RIVER_HALF, TERRACES, TERRACE_STEP, TERRACE_COUNT, KNOLL, WATER,
} from './land.js';
import { gassho, kura, barn, farmhouse, mill, torii, hall, lantern, jizo, GASSHO, KURA, BARN } from './houses.js';

/* ------------------------------------------------------------------ */
/* Where everything stands                                             */
/* ------------------------------------------------------------------ */

/* The road: from the harbour west over the river, north up the valley,
 * and west along the village street to the foot of the castle hill. */
export const ROAD = [
  [436, 62], [306, 62], [289, 63], [262, 66], [240, 70], [232, 78], [232, 196], [226, 204], [128, 204], [116, 206],
];
export const ROAD_W = 5;
/* The lane to the mill, and the road over the arch bridge to the terraces. */
export const MILL_LANE = [[214, 206.5], [214, 262]];
export const TERRACE_ROAD = [[234.5, 118], [254, 118], [282, 118], [318, 120]];

export const GASSHOS = [
  { x0: 140, y0: 214, face: 's' },
  { x0: 158, y0: 222, face: 's' },
  { x0: 176, y0: 214, face: 's', open: true },
  { x0: 190, y0: 226, face: 's' },
  { x0: 140, y0: 160, face: 's' },
];
export const KURAS = [
  { x0: 160, y0: 185, face: 's' },
  { x0: 160 + KURA.w + 3.0, y0: 185, face: 's' },
  { x0: 186, y0: 187, face: 's' },
];
export const BARN_LOT = { x0: 196, y0: 150, face: 's' };
export const FARMHOUSES = [
  { x0: 124, y0: 182, x1: 134, y1: 190, face: 'n', tone: 'hvPlasterWarm' },
  { x0: 212, y0: 178, x1: 222, y1: 186, face: 'n', tone: 'hvPlaster' },
  { x0: 160, y0: 144, x1: 169, y1: 152, face: 'e', tone: 'hvPlasterWarm' },
];
export const MILL_LOT = { x0: 205, y0: 265, x1: 213, y1: 273, face: 's' };
/* The shrine: the hall on the knoll's top looking west, the steps up to
 * it from the floor, a torii every two metres up them. */
export const SHRINE = { hall: { x0: 318, y0: 242.5, x1: 325, y1: 248.5, face: 'w' }, py: 245.5, x0: 296, x1: 316, toriiAt: [299, 301, 303, 305, 307, 309, 311, 313] };
export const ARCH = { x0: 254, x1: 282, py: 118, w: 4.2, r: 3.7, spring: -0.5, deck: 4.1 };
export const BUS_STOP = { px: 236.5, py: 90 };

/* Rectangles nothing else may stand in, for the paddies and the trees. */
export function villageKeepOut() {
  const out = [];
  const pad = (x0, y0, x1, y1, m) => out.push({ x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m });
  for (const g of GASSHOS) {
    pad(g.x0, g.y0, g.x0 + GASSHO.w, g.y0 + GASSHO.d, 4);
  }
  for (const k of KURAS) {
    pad(k.x0, k.y0, k.x0 + KURA.w, k.y0 + KURA.d, 3);
  }
  pad(BARN_LOT.x0, BARN_LOT.y0, BARN_LOT.x0 + BARN.w, BARN_LOT.y0 + BARN.d, 4);
  for (const f of FARMHOUSES) {
    pad(f.x0, f.y0, f.x1, f.y1, 4);
  }
  pad(MILL_LOT.x0, MILL_LOT.y0, MILL_LOT.x1 + 3, MILL_LOT.y1 + 12, 3);
  pad(SHRINE.x0 - 4, SHRINE.py - 5, SHRINE.hall.x1 + 6, SHRINE.py + 8, 2);
  pad(ARCH.x0, ARCH.py - 4, ARCH.x1, ARCH.py + 4, 2);
  pad(BUS_STOP.px - 2, BUS_STOP.py - 4, BUS_STOP.px + 4, BUS_STOP.py + 4, 1);
  return out;
}

/* Whether a plan point is on a road, within `m` of its edge. */
export function onRoad(px, py, m = 0) {
  return nearestOnLine(ROAD, px, py).d < ROAD_W / 2 + m
    || nearestOnLine(MILL_LANE, px, py).d < 1.75 + m
    || nearestOnLine(TERRACE_ROAD, px, py).d < 2 + m;
}

/* ------------------------------------------------------------------ */
/* The paddies                                                         */
/* ------------------------------------------------------------------ */

/*
 * THE PADDIES of the floor, each { x0, y0, x1, y1, h, kind }: tiled over
 * the flat land in plots of about twenty two by fifteen metres with a
 * bund round each, and a plot kept only where all of it is clear of the
 * roads, the river, the buildings and the hills. `kind` is 'ripe' (the
 * rice standing gold, chest high), 'cut' (stubble, the sheaves on racks),
 * 'green' (a late field) or 'flood' (water, the sky in it). Hand picked
 * plots are kept by the racks' gap and the scarecrows.
 */
const ZONES = [
  { x0: 124, y0: 74, x1: 228, y1: 142, w: 21, d: 14 },
  { x0: 268, y0: 72, x1: 316, y1: 112, w: 16, d: 13 },
  { x0: 262, y0: 124, x1: 316, y1: 236, w: 18, d: 14 },
  { x0: 240, y0: 256, x1: 316, y1: 302, w: 19, d: 15 },
  { x0: 236, y0: 82, x1: 250, y1: 194, w: 14, d: 16 },
  { x0: 124, y0: 250, x1: 202, y1: 300, w: 19, d: 12 },
];

export function paddies() {
  const keep = villageKeepOut();
  const out = [];
  let n = 0;
  for (const z of ZONES) {
    for (let y = z.y0; y + z.d <= z.y1 + 0.01; y += z.d) {
      for (let x = z.x0; x + z.w <= z.x1 + 0.01; x += z.w) {
        n += 1;
        const p = { x0: x + 0.4, y0: y + 0.4, x1: x + z.w - 0.4, y1: y + z.d - 0.4 };
        if (!plotClear(p, keep)) {
          continue;
        }
        const r = hash2(n, 41);
        const kind = r < 0.46 ? 'ripe' : r < 0.78 ? 'cut' : r < 0.9 ? 'green' : 'flood';
        out.push({ ...p, h: 0, kind, n });
      }
    }
  }
  return out;
}

function plotClear(p, keep) {
  for (const k of keep) {
    if (p.x1 > k.x0 && p.x0 < k.x1 && p.y1 > k.y0 && p.y0 < k.y1) {
      return false;
    }
  }
  const pts = [];
  for (let u = 0; u <= 4; u += 1) {
    for (let v = 0; v <= 4; v += 1) {
      pts.push([p.x0 + ((p.x1 - p.x0) * u) / 4, p.y0 + ((p.y1 - p.y0) * v) / 4]);
    }
  }
  for (const [x, y] of pts) {
    if (Math.abs(landAt(x, y)) > 0.02 || onRoad(x, y, 1.2) || nearestOnLine(RIVER, x, y).d < RIVER_HALF + 5) {
      return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* The terraces                                                        */
/* ------------------------------------------------------------------ */

/*
 * THE TERRACES' CONTOURS. Real tanada follow the hill's contour, so every
 * riser wanders the same way as the one under it. Here each terrace is a
 * run of bands six metres along py, and terrace k's front edge in band b
 * is the same wandering line for every k, pushed nine metres further up
 * the hill per step, plus a little of its own. Every band of every step is
 * one box: the riser is its west face and its top is the field.
 */
export const TERRACE_BAND = 6;
const TERRACE_RUN = 9;
function contour(py) {
  /* A smooth wander of about four metres, from two hashed sines' worth of
   * smoothstepped value noise along py. */
  const c = 38;
  const i = Math.floor(py / c);
  const f = smooth(py / c - i);
  const a = hash2(i, 61);
  const b = hash2(i + 1, 61);
  return 8 * (a + (b - a) * f) - 4;
}

export function terraceEdge(k, py) {
  const b = Math.floor((py - TERRACES.y0) / TERRACE_BAND);
  return TERRACES.x0 + 2 + k * TERRACE_RUN + contour(TERRACES.y0 + (b + 0.5) * TERRACE_BAND) + (hash2(b, k + 70) - 0.5) * 1.6;
}

export function terraceBands() {
  const out = [];
  const bands = Math.floor((TERRACES.y1 - TERRACES.y0) / TERRACE_BAND);
  for (let b = 0; b < bands; b += 1) {
    const y0 = TERRACES.y0 + b * TERRACE_BAND;
    const y1 = y0 + TERRACE_BAND;
    for (let k = 0; k < TERRACE_COUNT; k += 1) {
      const x0 = terraceEdge(k, (y0 + y1) / 2);
      const x1 = k + 1 < TERRACE_COUNT ? terraceEdge(k + 1, (y0 + y1) / 2) : TERRACES.x1;
      out.push({ k, b, x0, x1, y0, y1, h: (k + 1) * TERRACE_STEP, n: b * 31 + k });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Stairs that climb the land                                          */
/* ------------------------------------------------------------------ */

/*
 * A FLIGHT OF STEPS along a plan axis from (x0, y) to (x1, y) when `axis`
 * is 'x', `w` wide: each step a box from under the land to the land's
 * height at its middle, rounded up to a rise, and never lower than the
 * step before, so a flight up a knoll reads as steps and is ground to the
 * shell. Returns the steps' tops by their middles, for what stands on
 * them.
 */
export function stairs(T, axis, a0, a1, c, w, run = 1, m = 'hvStone') {
  const tops = [];
  let last = -Infinity;
  const dir = a1 > a0 ? 1 : -1;
  for (let a = a0; dir * (a1 - a) > 0.01; a += dir * run) {
    const mid = a + (dir * run) / 2;
    const ground = axis === 'x' ? landAt(mid, c) : landAt(c, mid);
    const top = Math.max(last, Math.ceil((Math.max(ground, 0) + 0.12) / 0.2) * 0.2);
    last = top;
    const s0 = Math.min(a, a + dir * run);
    const s1 = Math.max(a, a + dir * run);
    if (axis === 'x') {
      T.box(m, s0, c - w / 2, Math.min(ground, 0) - 0.6, s1, c + w / 2, top, { kind: 'wall', name: 'step' });
    } else {
      T.box(m, c - w / 2, s0, Math.min(ground, 0) - 0.6, c + w / 2, s1, top, { kind: 'wall', name: 'step' });
    }
    tops.push({ at: mid, top });
  }
  return tops;
}

/* ------------------------------------------------------------------ */
/* The racks, the scarecrows and the billboards                        */
/* ------------------------------------------------------------------ */

/*
 * A DRYING RACK (hazakake): poles every two and a half metres with a rail
 * along their tops, and the sheaves hung over the rail head down in a
 * curtain to a foot off the stubble. The curtain is solid, a wall of
 * rice; the poles are poles. Along x from x0 to x1 at py.
 */
export const RACK = { h0: 0.35, h1: 1.9, t: 0.5 };
export function rack(T, x0, x1, py) {
  for (let x = x0; x <= x1 + 0.01; x += 2.5) {
    T.post('hvWood', x, py, 0, RACK.h1 + 0.3, 0.06, { kind: 'pole', name: 'rack pole', seg: 5 });
  }
  T.box('hvStraw', x0, py - RACK.t / 2, RACK.h0, x1, py + RACK.t / 2, RACK.h1, { kind: 'wall', name: 'sheaves' });
  T.dress(() => T.wide(() => {
    T.rod('hvWood', [x0 - 0.3, py, RACK.h1 + 0.05], [x1 + 0.3, py, RACK.h1 + 0.05], 0.08, 0.08);
    /* The sheaves' heads, a ragged darker band at the bottom of the
     * curtain, and the tied necks along the top. */
    for (let x = x0 + 0.3; x < x1; x += 0.6) {
      T.deco('hvStrawDark', x, py - RACK.t / 2 - 0.06, RACK.h0, x + 0.42, py + RACK.t / 2 + 0.06, RACK.h0 + 0.35 + ((x * 13) % 1) * 0.2);
    }
    T.paint('hvStrawDark', x0, py - RACK.t / 2 - 0.02, RACK.h1 - 0.25, x1, py + RACK.t / 2 + 0.02, RACK.h1 - 0.15);
  }));
}

/* A scarecrow in a straw hat, its arms out on a cross piece. */
function scarecrow(T, px, py, r) {
  T.dress(() => {
    T.cyl('hvWood', [px, py, 0], [px, py, 1.9], 0.05, 4);
    T.rod('hvWood', [px - 0.75, py, 1.45], [px + 0.75, py, 1.45], 0.05, 0.05);
    T.deco(r < 0.5 ? 'hvBoatBlue' : 'hvBoatRed', px - 0.28, py - 0.14, 1.0, px + 0.28, py + 0.14, 1.55);
    T.bead('hvPlaster', px, py, 1.75, 0.17);
    T.cone('hvStraw', px, py, 1.82, 0.42, 0.22, 8);
  });
}

/*
 * A BILLBOARD standing in a paddy (nodate kanban), facing the road: a board
 * on two posts with a little roof over it, high enough that the rice and
 * the racks are under it and a pilot can fly beneath. The brand's sign is
 * painted on its face by the pipeline (`markSpots`).
 */
export const BOARD = { w: 6.4, h: 3.2, t: 0.3, lift: 3.6 };
export const BILLBOARDS = [
  { px: 244, py: 104, face: 'w' },
  { px: 220.5, py: 132, face: 'e' },
  { px: 244, py: 160, face: 'w' },
  { px: 330, py: 69, face: 's' },
  { px: 270, py: 74, face: 's' },
  { px: 160, py: 209, face: 's' },
  { px: 220.5, py: 96, face: 'e' },
  { px: 300, py: 132, face: 'w' },
];

export function billboard(T, b) {
  const alongX = b.face === 's' || b.face === 'n';
  const hw = BOARD.w / 2;
  const ht = BOARD.t / 2;
  const [x0, x1, y0, y1] = alongX ? [b.px - hw, b.px + hw, b.py - ht, b.py + ht] : [b.px - ht, b.px + ht, b.py - hw, b.py + hw];
  const top = BOARD.lift + BOARD.h;
  T.box('hvPlaster', x0, y0, BOARD.lift, x1, y1, top, { kind: 'wall', name: 'billboard' });
  T.deco('hvWoodDark', x0 - 0.1, y0 - 0.1, BOARD.lift - 0.12, x1 + 0.1, y1 + 0.1, BOARD.lift);
  for (const s of [-1, 1]) {
    const [px, py] = alongX ? [b.px + s * (hw - 1.1), b.py] : [b.px, b.py + s * (hw - 1.1)];
    T.post('hvWoodDark', px, py, 0, BOARD.lift, 0.13, { kind: 'pole', name: 'billboard post' });
  }
  /* The little roof of tin over it. */
  const ox = alongX ? 0.25 : 0.55;
  const oy = alongX ? 0.55 : 0.25;
  T.box('hvRust', x0 - ox, y0 - oy, top, x1 + ox, y1 + oy, top + 0.12, { kind: 'wall', name: 'billboard roof' });
}

/* ------------------------------------------------------------------ */
/* The village                                                         */
/* ------------------------------------------------------------------ */

export function village(T) {
  const info = {};
  /* The farmhouses of thatch. */
  info.gassho = GASSHOS.map((g) => gassho(T, { ...g, x1: g.x0 + GASSHO.w, y1: g.y0 + GASSHO.d }));
  info.loft = GASSHOS.findIndex((g) => g.open);
  /* The kura. */
  for (const k of KURAS) {
    kura(T, { ...k, x1: k.x0 + KURA.w, y1: k.y0 + KURA.d });
  }
  info.barn = barn(T, { ...BARN_LOT, x1: BARN_LOT.x0 + BARN.w, y1: BARN_LOT.y0 + BARN.d });
  for (const f of FARMHOUSES) {
    farmhouse(T, f, f.tone);
  }
  info.mill = mill(T, MILL_LOT);
  flume(T, info.mill);
  shrine(T, info);
  yards(T);
  roadside(T);
  return info;
}

/* The flume from the pond to the top of the wheel, on trestles. */
export const FLUME = { y0: 271, y1: 286, w: 0.9, bents: [275.5, 281.5, 285.5] };
function flume(T, m) {
  const x = m.hub[0];
  const h0 = m.hubH + 2.75;
  FLUME.x = x;
  FLUME.h0 = h0;
  T.box('hvWoodWet', x - FLUME.w / 2, FLUME.y0, h0, x + FLUME.w / 2, FLUME.y1, h0 + 0.5, { kind: 'wall', name: 'flume' });
  T.dress(() => T.wide(() => {
    T.paint('hvFoam', x - FLUME.w / 2 + 0.1, FLUME.y0, h0 + 0.42, x + FLUME.w / 2 - 0.1, FLUME.y1, h0 + 0.46);
  }));
  for (const y of FLUME.bents) {
    for (const s of [-1, 1]) {
      T.post('hvWoodWet', x + s * 0.6, y, WATER - 1, h0, 0.11, { kind: 'pole', name: 'trestle' });
    }
    T.box('hvWoodWet', x - 0.75, y - 0.1, h0 - 0.25, x + 0.75, y + 0.1, h0, { kind: 'wall', name: 'trestle head' });
    T.dress(() => {
      T.rod('hvWoodWet', [x - 0.6, y, WATER], [x + 0.6, y, h0 - 0.3], 0.08, 0.08);
    });
  }
  /* The tail race from under the wheel down to the river: white water. */
  T.dress(() => T.wide(() => {
    const [hx, hy] = m.hub;
    T.paint('hvFoam', hx - 0.5, hy - 0.4, 0.01, hx + 9, hy + 0.4, 0.04);
  }));
}

function shrine(T, info) {
  const S = SHRINE;
  /* The steps, and the torii up them. */
  const tops = stairs(T, 'x', S.x0, S.x1, S.py, 3.4, 1);
  info.torii = [];
  for (const x of S.toriiAt) {
    const st = tops.reduce((a, b) => (Math.abs(b.at - x) < Math.abs(a.at - x) ? b : a));
    info.torii.push({ px: x, ...torii(T, x, S.py, st.top, 3.3, 2.9, 'y') });
  }
  /* The big torii at the foot, on the floor. */
  info.footTorii = torii(T, S.x0 - 3, S.py, 0, 5.0, 4.4, 'y');
  /* The top: a gravel court, the hall, its lanterns and guardians, and the
   * sacred cedar roped with its shimenawa. */
  const top = Math.max(landAt(S.hall.x0, S.py), tops[tops.length - 1].top);
  T.box('hvGravel', S.x1, S.py - 6, top - 1.2, S.hall.x1 + 3, S.py + 7, top, { kind: 'wall', name: 'shrine court' });
  hall(T, { ...S.hall, base: top });
  for (const dy of [-2.6, 2.6]) {
    lantern(T, S.x1 + 1.2, S.py + dy, top, 0.9);
  }
  T.dress(() => {
    for (const dy of [-1.9, 1.9]) {
      T.deco('hvStone', S.x1 + 0.4, S.py + dy - 0.3, top, S.x1 + 1.0, S.py + dy + 0.3, top + 0.5);
      T.bead('hvStoneWarm', S.x1 + 0.7, S.py + dy, top + 0.75, 0.3);
    }
  });
  info.shrineTop = top;
}

/* The village's yards: wells, woodpiles, laundry, persimmons' places, a
 * jizo at the corner, bicycles, the clutter of farms. */
export const KAKI = [[152, 210], [171, 210.5], [137, 196], [186, 247], [205, 198], [154, 186], [214, 150]];
function yards(T) {
  /* The well by the second house. */
  T.box('hvStone', 152, 211.5, 0, 153.4, 212.9, 0.75, { kind: 'wall', name: 'well' });
  T.dress(() => {
    T.post('hvWood', 151.9, 212.2, 0.75, 2.1, 0.05);
    T.post('hvWood', 153.5, 212.2, 0.75, 2.1, 0.05);
    T.rod('hvWood', [151.8, 212.2, 2.1], [153.6, 212.2, 2.1], 0.08, 0.08);
    T.paint('hvTileEdge', 152.2, 211.7, 0.6, 153.2, 212.7, 0.7);
  });
  /* Woodpiles under the eaves, laundry poles, bicycles, tubs. */
  T.dress(() => {
    for (const [x, y] of [[138.6, 216], [156.6, 225], [174.6, 217], [188.6, 229], [138.6, 163]]) {
      T.deco('hvWoodPale', x - 0.4, y, 0, x + 0.4, y + 5, 1.4);
      T.paint('hvWoodDark', x - 0.42, y, 0.45, x + 0.42, y + 5, 0.5);
      T.paint('hvWoodDark', x - 0.42, y, 0.95, x + 0.42, y + 5, 1.0);
    }
    for (const [x, y] of [[147, 210.5], [166, 218.5], [131, 194]]) {
      T.post('hvWoodPale', x, y, 0, 1.9, 0.04);
      T.post('hvWoodPale', x + 3, y, 0, 1.9, 0.04);
      T.rod('hvBamboo', [x, y, 1.85], [x + 3, y, 1.85], 0.05, 0.05);
      for (let k = 0; k < 4; k += 1) {
        T.deco(['hvPlaster', 'hvBoatBlue', 'hvKaki', 'hvBoatTeal'][k], x + 0.3 + k * 0.65, y - 0.02, 1.15, x + 0.75 + k * 0.65, y + 0.02, 1.8);
      }
    }
    for (const [x, y] of [[157, 207.5], [158.2, 207.5], [208, 207.6]]) {
      T.cyl('hvBlack', [x - 0.55, y, 0.33], [x - 0.55, y + 0.05, 0.33], 0.33, 10);
      T.cyl('hvBlack', [x + 0.55, y, 0.33], [x + 0.55, y + 0.05, 0.33], 0.33, 10);
      T.rod('hvBoatRed', [x - 0.55, y, 0.4], [x + 0.55, y, 0.75], 0.05, 0.05);
    }
    for (const [x, y] of [[150, 183], [196, 175], [183, 210]]) {
      T.cyl('hvWood', [x, y, 0], [x, y, 0.55], 0.4, 10);
      T.cyl('hvTileEdge', [x + 1, y, 0], [x + 1, y, 0.45], 0.32, 10);
    }
    /* Bags of rice by the barn, a stack of crates. */
    for (let k = 0; k < 5; k += 1) {
      T.deco('hvPlaster', 208.2, 153 + k * 0.9, 0, 209, 153.8 + k * 0.9, 0.35 + (k % 2) * 0.3);
    }
  });
  jizo(T, 227.5, 208.5, 0);
  jizo(T, 228.3, 208.5, 0);
  T.dress(() => {
    T.deco('hvWoodDark', 226.9, 207.9, 0, 228.9, 209.1, 0.08);
    T.prism('hvTileBlue', 'x', [[207.7, 1.15], [208.5, 1.45], [209.3, 1.15]], 226.8, 229);
    T.post('hvWoodDark', 226.9, 208.5, 0, 1.2, 0.05);
    T.post('hvWoodDark', 228.9, 208.5, 0, 1.2, 0.05);
  });
  lantern(T, 225, 196, 0);
}

/* The road's furniture: the bus stop, the vending machine, the post box,
 * the stone markers. The poles are the plan's (scaled assets). */
function roadside(T) {
  const { px, py } = BUS_STOP;
  /* A little shelter of tin and timber, open to the road. */
  T.box('hvWood', px + 2.2, py - 2, 0, px + 2.4, py + 2, 2.3, { kind: 'wall', name: 'shelter back' });
  T.box('hvWood', px + 0.2, py - 2, 0, px + 2.4, py - 1.8, 2.3, { kind: 'wall', name: 'shelter side' });
  T.box('hvRust', px - 0.2, py - 2.3, 2.3, px + 2.7, py + 2.3, 2.45, { kind: 'wall', name: 'shelter roof' });
  T.dress(() => {
    T.deco('hvWoodPale', px + 1.4, py - 1.6, 0.42, px + 2.1, py + 1.4, 0.5);
    T.post('hvBlack', px - 0.5, py + 2.8, 0, 2.4, 0.04);
    T.disc('hvBoatRed', px - 0.5, py + 2.8, 0.32, 2.3, 2.34, 16);
    T.paint('hvPlaster', px + 2.15, py - 1.2, 1.1, px + 2.18, py + 0.2, 1.9);
    /* The post box, red, on its stand. */
    T.post('hvBlack', px - 0.4, py - 3.4, 0, 0.6, 0.05);
    T.deco('hvTorii', px - 0.65, py - 3.65, 0.6, px - 0.15, py - 3.15, 1.35);
  });
}

/* ------------------------------------------------------------------ */
/* The fields                                                          */
/* ------------------------------------------------------------------ */

/*
 * The paddies of the floor and the terraces: their bunds (drawn on every
 * preset, because a field's lines are what a pilot reads its scale by),
 * the racks in the cut ones, scarecrows in the standing ones. The fields'
 * surfaces themselves are pictures ./index.js lays from `fields`, which
 * this returns.
 */
export function fields(T) {
  const P = paddies();
  const racks = [];
  for (const p of P) {
    bund(T, p.x0, p.y0, p.x1, p.y1, p.h);
    paddySurface(T, p.kind, p.x0 + 0.35, p.y0 + 0.35, p.x1 - 0.35, p.y1 - 0.35, p.h, p.n);
    if (p.kind === 'cut') {
      const n = p.y1 - p.y0 > 12 ? 2 : 1;
      for (let k = 0; k < n; k += 1) {
        const y = n === 1 ? (p.y0 + p.y1) / 2 : p.y0 + (p.y1 - p.y0) * (0.36 + 0.32 * k);
        rack(T, p.x0 + 2, p.x1 - 2, y);
        racks.push({ x0: p.x0 + 2, x1: p.x1 - 2, py: y, n: p.n });
      }
    } else if (p.kind === 'ripe' && hash2(p.n, 43) < 0.35) {
      scarecrow(T, p.x0 + (p.x1 - p.x0) * hash2(p.n, 45), p.y0 + 3 + (p.y1 - p.y0 - 6) * hash2(p.n, 47), hash2(p.n, 49));
    }
  }
  /* The terraces: each band of each step a box, earth or dry stone. */
  const B = terraceBands();
  for (const t of B) {
    const stone = t.k > 5 || hash2(t.b, t.k + 90) < 0.25;
    T.box(stone ? 'hvStoneDark' : 'hvEarth', t.x0, t.y0, t.h - TERRACE_STEP - 0.6, TERRACE_COUNT === t.k + 1 ? t.x1 : t.x1 + 0.01, t.y1, t.h, { kind: 'wall', name: 'terrace' });
    T.dress(() => T.wide(() => {
      T.box('hvAze', t.x0, t.y0, t.h, t.x0 + 0.55, t.y1, t.h + 0.22, { solid: false, cast: false });
    }));
    const r = hash2(t.b, t.k + 120);
    paddySurface(T, r < 0.4 ? 'ripe' : r < 0.7 ? 'cut' : r < 0.85 ? 'green' : 'flood', t.x0 + 0.55, t.y0 + 0.05, t.x1, t.y1 - 0.05, t.h, t.n + 500);
  }
  /* A rack on a few of the terraces, and the stone stair up their middle. */
  for (const t of B) {
    if (t.k % 3 === 1 && t.b % 5 === 2) {
      T.dress(() => {
        for (let x = t.x0 + 2; x < t.x1 - 1.5; x += 2.5) {
          T.cyl('hvWood', [x, (t.y0 + t.y1) / 2, t.h], [x, (t.y0 + t.y1) / 2, t.h + 2.0], 0.05, 4);
        }
        T.deco('hvStraw', t.x0 + 2, (t.y0 + t.y1) / 2 - 0.22, t.h + 0.4, t.x1 - 1.5, (t.y0 + t.y1) / 2 + 0.22, t.h + 1.8);
      });
    }
  }
  return { paddies: P, terraces: B, racks };
}

/*
 * A PADDY'S SURFACE, drawn and never solid (rice is not a wall): ripe rice
 * a gold block eighty centimetres high with its rows in a darker gold, a
 * late field greener and lower, stubble a flat with its cut rows, a
 * flooded field a sheet of the sky. The rows are drawn on High and Medium.
 */
function paddySurface(T, kind, x0, y0, x1, y1, h, n) {
  const across = (y1 - y0) > (x1 - x0);
  const rows = (m, top, step, w) => T.dress(() => T.wide(() => {
    if (across) {
      for (let x = x0 + step / 2; x < x1 - 0.1; x += step) {
        T.paint(m, x, y0, top, x + w, y1, top + 0.03);
      }
    } else {
      for (let y = y0 + step / 2; y < y1 - 0.1; y += step) {
        T.paint(m, x0, y, top, x1, y + w, top + 0.03);
      }
    }
  }));
  if (kind === 'ripe') {
    const top = h + 0.75 + hash2(n, 51) * 0.15;
    T.box('hvRice', x0, y0, h, x1, y1, top, { solid: false, cast: false });
    rows('hvRiceDeep', top, 1.4, 0.35);
  } else if (kind === 'green') {
    const top = h + 0.45;
    T.box('hvRiceGreen', x0, y0, h, x1, y1, top, { solid: false, cast: false });
    rows('hvAze', top, 1.4, 0.3);
  } else if (kind === 'cut') {
    T.paint('hvStubble', x0, y0, h, x1, y1, h + 0.06);
    rows('hvStrawDark', h + 0.06, 0.9, 0.12);
  } else {
    T.paint('hvPaddyWater', x0, y0, h, x1, y1, h + 0.04);
  }
}

/* A bund round a paddy, a low grassed ridge with a path worn along it. */
function bund(T, x0, y0, x1, y1, h) {
  const a = 0.35;
  const top = h + 0.22;
  T.paint('hvAze', x0 - a, y0 - a, h, x1 + a, y0 + a, top);
  T.paint('hvAze', x0 - a, y1 - a, h, x1 + a, y1 + a, top);
  T.paint('hvAze', x0 - a, y0 + a, h, x0 + a, y1 - a, top);
  T.paint('hvAze', x1 - a, y0 + a, h, x1 + a, y1 - a, top);
}

/* ------------------------------------------------------------------ */
/* The bridges                                                         */
/* ------------------------------------------------------------------ */

/*
 * THE ARCH BRIDGE: one stone arch over the river, after the old stone arch
 * bridges of Kyushu, its deck humped over the crown. Its profile along x is
 * drawn as one prism; its solid is a slice every half metre, from the
 * arch's underside at the slice's springward edge (the highest point of
 * the soffit over the slice) up to the deck at its lower edge, so the
 * solid is inside the stone everywhere. Returns its clear window.
 */
export function archBridge(T) {
  const { x0, x1, py, w, r, spring, deck } = ARCH;
  const cx = (x0 + x1) / 2;
  const ramp = (x1 - x0) / 2 - r - 1.5;
  /* The deck's top along x: flat over the arch, ramps to the land. */
  const deckAt = (x) => {
    const d = Math.abs(x - cx);
    if (d <= r + 1.5) {
      return deck;
    }
    return deck * (1 - smooth((d - r - 1.5) / ramp)) + 0.02;
  };
  const soffit = (x) => {
    const d = Math.abs(x - cx);
    return d >= r ? null : spring + Math.sqrt(r * r - d * d);
  };
  const prof = [];
  const N = 40;
  for (let i = 0; i <= N; i += 1) {
    const x = x0 + ((x1 - x0) * i) / N;
    prof.push([x, deckAt(x)]);
  }
  prof.push([cx + r, WATER - 1.5]);
  for (let i = 0; i <= 16; i += 1) {
    const x = cx + r - (2 * r * i) / 16;
    const s = soffit(x);
    prof.push([x, s === null ? spring : s]);
  }
  prof.push([cx - r, WATER - 1.5]);
  T.prism('hvStone', 'y', prof, py - w / 2, py + w / 2);
  /* The solid, slice by slice. */
  for (let x = x0; x < x1 - 0.01; x += 0.5) {
    const xa = x;
    const xb = Math.min(x1, x + 0.5);
    const top = Math.min(deckAt(xa), deckAt(xb));
    const sa = soffit(xa);
    const sb = soffit(xb);
    let bottom;
    if (sa === null || sb === null) {
      bottom = WATER - 1.5;
      if ((sa === null) !== (sb === null)) {
        bottom = spring + 0.05 + (sa ?? sb);
      }
    } else {
      bottom = Math.max(sa, sb);
    }
    if (top - bottom > 0.05) {
      T.hidden(xa, py - w / 2, bottom, xb, py + w / 2, top, 'wall', 'arch');
    }
  }
  /* Its parapets, low stone kerbs a quad flies over. */
  for (const s of [-1, 1]) {
    for (let x = x0 + 1; x < x1 - 1; x += 1) {
      const h = Math.min(deckAt(x), deckAt(x + 1));
      T.box('hvStoneDark', x, py + s * (w / 2) - 0.2, h, x + 1, py + s * (w / 2) + 0.2, h + 0.45, { kind: 'wall', name: 'parapet' });
    }
  }
  /* The clear window under the arch, a craft's radius inside it. */
  const h1 = spring + Math.sqrt(r * r - 2.2 * 2.2) - 0.35;
  return { px: cx, py, half: 2.2, h0: WATER + 0.3, h1 };
}

/* The road bridge at the harbour and the plank bridge by the village. */
export function bridges(T) {
  /* The road bridge: a concrete slab with rails, flush with the road. */
  T.box('hvConcrete', 283, 59.5, -0.35, 299, 66.5, 0.05, { kind: 'wall', name: 'road bridge' });
  for (const y of [59.4, 66.6]) {
    T.box('hvConcrete', 283, y - 0.15, 0.05, 299, y + 0.15, 0.85, { kind: 'wall', name: 'bridge rail' });
  }
  /* The plank footbridge from the village to the shrine side. */
  const y = 228;
  const r = nearestOnLine(RIVER, 248, y);
  const x0 = r.x - 7;
  const x1 = r.x + 7;
  T.box('hvWoodPale', x0, y - 0.9, 0.55, x1, y + 0.9, 0.75, { kind: 'wall', name: 'footbridge' });
  for (let x = x0 + 1; x < x1; x += 3) {
    for (const s of [-1, 1]) {
      T.post('hvWood', x, y + s * 0.8, WATER - 1, 1.6, 0.07, { kind: 'pole', name: 'footbridge post' });
    }
  }
  T.dress(() => {
    for (const s of [-1, 1]) {
      T.rod('hvWood', [x0, y + s * 0.8, 1.55], [x1, y + s * 0.8, 1.55], 0.08, 0.08);
    }
  });
  return { foot: { x0, x1, py: y } };
}

/* The heights a road is drawn at, piece by piece, for ./index.js: every
 * piece of the road's polyline about four metres long, at the land. */
export function roadPieces() {
  const out = [];
  const lines = [[ROAD, ROAD_W, 'hvAsphalt'], [MILL_LANE, 3.5, 'hvGravel'], [TERRACE_ROAD, 4, 'hvAsphalt']];
  for (const [line, w, m] of lines) {
    for (let i = 0; i + 1 < line.length; i += 1) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      const len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
      const n = Math.max(1, Math.ceil(len / 4));
      for (let k = 0; k < n; k += 1) {
        const pa = [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n];
        const pb = [ax + ((bx - ax) * (k + 1)) / n, ay + ((by - ay) * (k + 1)) / n];
        const mx = (pa[0] + pb[0]) / 2;
        const my = (pa[1] + pb[1]) / 2;
        /* The arch carries its own deck. */
        if (my > ARCH.py - 3 && my < ARCH.py + 3 && mx > ARCH.x0 && mx < ARCH.x1) {
          continue;
        }
        const h = Math.max(0, landAt(mx, my), mx > 283 && mx < 299 && my < 70 ? 0.05 : 0);
        out.push({ a: [...pa, h + 0.035], b: [...pb, h + 0.035], w, m, line: line === ROAD });
      }
    }
  }
  return out;
}

/* Where the poles stand: along the road's west and south side every
 * thirty metres or so, skipping where a building or the river is. */
export function polePlaces() {
  const out = [];
  let run = 0;
  for (let i = 0; i + 1 < ROAD.length; i += 1) {
    const [ax, ay] = ROAD[i];
    const [bx, by] = ROAD[i + 1];
    const len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    for (let s = (30 - (run % 30)) % 30; s < len; s += 30) {
      const x = ax + ux * s - uy * 4.2;
      const y = ay + uy * s + ux * 4.2;
      if (x < 100 || x > 470 || nearestOnLine(RIVER, x, y).d < RIVER_HALF + 3 || landAt(x, y) < WATER + 0.5) {
        continue;
      }
      out.push([x, y]);
    }
    run += len;
  }
  return out;
}

export { KNOLL };
