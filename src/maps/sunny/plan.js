/*
 * plan.js: Sunnyfield whole. Builds the town from its parts (./streets.js,
 * ./houses.js, ./downtown.js, ./landmarks.js) into one structure for the
 * built map's pipeline, and says the things a map document says about it:
 * where the pilot starts, the named gaps, the ground in the gorge. Pure, as
 * ./frame.js is, so scripts/sunny-check.js can build it in Node.
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

import { Town, worldAt, wx, wz, W, D, chunkOf } from './frame.js';
import { streets, MAIN_Y, OAK_X, PINE_X, MAPLE_Y, HALF, MILL_X, MILL_END } from './streets.js';
import { houses, hedgeGap } from './houses.js';
import { downtown, DONUT, HALL as CIVIC, CHURCH, GAS, PADS } from './downtown.js';
import { landmarks, GORGE, gorgeFloorAt, GORGE_BRIDGE, HALL as TURBINES, MANSION_GATE, BANDSTAND, PLANT, CONTAINER } from './landmarks.js';
import { townDressing } from './dress.js';
import { partsOf } from '../../props/catalog.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { loblollyLayout } from '../../props/street.js';
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';

export { W, D, worldAt, chunkOf };

/* The scaled assets' parts in the world frame, solid and never drawn, as
 * ../bardwell/bardwell.js's scaledParts. */
const SCQ = { s: 0, c: 1 };
function scaledParts(a) {
  const k = a.k;
  const [x, y, z] = worldAt(a.px, a.py, a.h);
  const parts = a.el.style === 'loblolly' || a.el.style === 'broad' ? loblollyLayout(a.el) : partsOf(a.el);
  const out = [];
  if (parts.some((p) => p.t === 'box')) {
    quarterSinCos(quarterTurns(a.yaw), SCQ);
  } else {
    sincos(a.yaw, SCQ);
  }
  const { s, c } = SCQ;
  const turn = (p) => [x + k * (p[0] * c + p[2] * s), y + k * p[1], z + k * (-p[0] * s + p[2] * c)];
  for (const p of parts) {
    if (!p.solid) {
      continue;
    }
    if (p.t === 'box') {
      const A = turn(p.lo);
      const B = turn(p.hi);
      out.push({
        t: 'box', m: p.m, lo: [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.min(A[2], B[2])],
        hi: [Math.max(A[0], B[0]), Math.max(A[1], B[1]), Math.max(A[2], B[2])],
        solid: true, draw: false, kind: p.kind, name: p.name, cast: false,
      });
    } else {
      out.push({
        t: 'cap', m: p.m, a: turn(p.a), b: turn(p.b), r: k * p.r, solid: true, draw: false,
        kind: p.kind, look: p.look, seg: p.seg, rTop: null, name: p.name, cast: false,
      });
    }
  }
  return out;
}

/*
 * The town: { parts, T }, the parts in the world frame (the builder's own
 * and the scaled assets' solids), and the builder itself for everything
 * ./index.js draws over them. Every scaled asset is given an id, as an
 * element must have.
 */
export function sunnyLayout() {
  const T = new Town();
  streets(T);
  houses(T);
  downtown(T);
  landmarks(T);
  townDressing(T);
  for (const b of BILLBOARDS) {
    billboard(T, b);
  }
  const parts = [...T.P.list];
  T.scaled.forEach((a, i) => {
    a.el.id = `sunny-${i + 1}`;
    parts.push(...scaledParts(a));
  });
  return { parts, T };
}

/*
 * THE BILLBOARDS, one for each brand on the roster that shows here, each
 * a board on two legs high enough to fly under, facing a street or a line
 * a pilot flies. The pipeline paints the brand's sign on its face
 * (`markSpots` in ../built/index.js), found and stamped as on every
 * freestyle map, one draw call a sign.
 */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'sunny'));
const BOARD = { w: 6.4, h: 3.2, t: 0.3, lift: 4.2 };
const BILLBOARDS = [
  { px: 375, py: 140, face: 's' },
  { px: 88, py: 208.5, face: 's' },
  { px: 360, py: 111, face: 'n' },
  { px: 212, py: 177.5, face: 's' },
  { px: 186, py: 205, face: 'w' },
  { px: 322, py: 159, face: 's' },
  { px: 41, py: 189, face: 'e' },
  { px: 186.2, py: 160, face: 'w' },
];

function billboard(T, b) {
  const alongX = b.face === 's' || b.face === 'n';
  const hw = BOARD.w / 2;
  const ht = BOARD.t / 2;
  const [x0, x1, y0, y1] = alongX ? [b.px - hw, b.px + hw, b.py - ht, b.py + ht] : [b.px - ht, b.px + ht, b.py - hw, b.py + hw];
  const top = BOARD.lift + BOARD.h;
  T.box('sfTrim', x0, y0, BOARD.lift, x1, y1, top, { kind: 'wall', name: 'billboard' });
  T.deco('sfIron', x0 - 0.08, y0 - 0.08, top - 0.12, x1 + 0.08, y1 + 0.08, top + 0.05);
  T.deco('sfIron', x0 - 0.08, y0 - 0.08, BOARD.lift - 0.05, x1 + 0.08, y1 + 0.08, BOARD.lift + 0.1);
  for (const s of [-1, 1]) {
    const [px, py] = alongX ? [b.px + s * (hw - 1.2), b.py] : [b.px, b.py + s * (hw - 1.2)];
    T.post('sfSteel', px, py, 0, BOARD.lift, 0.16, { kind: 'pole', name: 'billboard leg' });
  }
  /* The catwalk along its front and its lamps over it. */
  const out = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] }[b.face];
  const cx0 = alongX ? x0 : (out[0] < 0 ? x0 - 0.7 : x1);
  const cx1 = alongX ? x1 : (out[0] < 0 ? x0 : x1 + 0.7);
  const cy0 = alongX ? (out[1] < 0 ? y0 - 0.7 : y1) : y0;
  const cy1 = alongX ? (out[1] < 0 ? y0 : y1 + 0.7) : y1;
  T.deco('sfIron', cx0, cy0, BOARD.lift - 0.08, cx1, cy1, BOARD.lift, true);
  for (const s of [-1, 1]) {
    const [px, py] = alongX ? [b.px + s * hw * 0.5, b.py + out[1] * 0.9] : [b.px + out[0] * 0.9, b.py + s * hw * 0.5];
    T.cyl('sfIron', [alongX ? px : b.px, alongX ? b.py : py, top + 0.05], [px, py, top + 0.35], 0.03, 4, null, true);
    T.ball('sfLamp', px, py, top + 0.3, 0.12, true);
  }
}

/* Each brand's sign on its board's face, as the pipeline's markSpots take
 * them: { slug, p, n, up, w, chunk } in the world, `p` on the face. As wide
 * as the board allows and its artwork's shape lets it be on 2.8 m of
 * height. */
export function sunnyMarkSpots() {
  return BRANDS.slice(0, BILLBOARDS.length).map((brand, i) => {
    const b = BILLBOARDS[i];
    const out = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] }[b.face];
    const px = b.px + out[0] * (BOARD.t / 2);
    const py = b.py + out[1] * (BOARD.t / 2);
    const [x, y, z] = worldAt(px, py, BOARD.lift + BOARD.h / 2);
    const w = Math.min(BOARD.w - 0.6, 2.8 * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: [out[0], 0, -out[1]], up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  }).concat(hiddenMarkSpots());
}

/* The one hidden Konex Drone sign (the owner's promise of a logo hidden in
 * every map), a second to its billboard's: the north flank of the last
 * garage on the far west lots, in the world, 1.6 m up, on a bare wall with
 * nothing within 2.5 m of it (measured against every part of the town,
 * 2026-10-29). It has its own key because the billboard holds the brand's. */
const HIDDEN_KONEX = { p: [-166.7, 1.6, 120.7], n: [0, 0, -1], w: 1.2 };
function hiddenMarkSpots() {
  const brand = BRANDS.find((b) => b.slug === 'konexdrone');
  if (!brand) {
    return [];
  }
  const { p, n, w } = HIDDEN_KONEX;
  return [{ slug: brand.slug, key: 'sunny#konexdrone~hidden', p: [...p], n: [...n], up: [0, 1, 0], w, chunk: chunkOf(p[0], p[2]) }];
}

/* The ground the plant is given where no top is under the craft, world
 * metres: the gorge's floor in the gorge, the grass everywhere else. */
export function sunnyFloor(x, z) {
  return gorgeFloorAt(x + W / 2, D / 2 - z);
}

/* The gorge's cut, as the world rectangle the ground's planes lose. */
export const GORGE_HOLE = { x0: wx(GORGE.x0), x1: wx(GORGE.x1), z0: wz(GORGE.y1), z1: wz(GORGE.y0) };

/* Where the pilot starts: the town square, facing north up the line of the
 * gorge. */
export const SPAWN = { px: PADS.px, py: PADS.py, h: 0.03, yaw: PADS.yaw };

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of its window's middle in the plan, the heading it is flown along in
 * whole degrees, its clear width and the bottom and top of its clear
 * height, already inside the opening by more than the craft's radius.
 */
export function sunnyGaps() {
  const M = 0.3;
  const hole = 2 * (DONUT.R - DONUT.t);
  const side = hole / Math.SQRT2 - 2 * M;
  const civic = (CIVIC.x0 + CIVIC.x1) / 2;
  const civicY = (CIVIC.y0 + CIVIC.y1) / 2;
  const hedge = hedgeGap();
  const pumps = (GAS.cy0 + GAS.cy1) / 2;
  return [
    { name: 'THE DONUT', px: DONUT.px, py: DONUT.py, deg: 90, w: side, h0: DONUT.h - side / 2, h1: DONUT.h + side / 2, points: 1000 },
    { name: 'CLOCK TOWER', px: civic, py: civicY, deg: 0, w: CIVIC.archW - 2 * M, h0: CIVIC.arch0 + M, h1: CIVIC.arch1 - 1.0 - M, points: 1000 },
    { name: 'THE BELFRY', px: CHURCH.tx, py: CHURCH.y0 + CHURCH.tw / 2, deg: 90, w: CHURCH.tw - 1.6 - 2 * M, h0: CHURCH.belfry0 + M, h1: CHURCH.belfry1 - 1.0 - M, points: 1000 },
    { name: 'TURBINE HALL', px: TURBINES.x0, py: TURBINES.doorY, deg: 0, w: TURBINES.doorW - 2 * M, h0: M, h1: TURBINES.doorH - M, points: 500 },
    { name: 'THE GORGE', px: (GORGE.x0 + GORGE.x1) / 2, py: GORGE.y0 + 12, deg: 90, w: GORGE.x1 - GORGE.x0 - 2 * M - 7, h0: -GORGE.depth + 1.5, h1: -1.0, points: 500 },
    { name: 'UNDER THE BRIDGE', px: (GORGE.x0 + GORGE.x1) / 2, py: GORGE_BRIDGE.py, deg: 90, w: GORGE.x1 - GORGE.x0 - 2 * M - 7, h0: -GORGE.depth + 1.5, h1: GORGE_BRIDGE.h - 0.2 - M - 0.5, points: 1000 },
    { name: 'HEDGE TUNNEL', px: hedge.px, py: hedge.py, deg: hedge.alongX ? 0 : 90, w: hedge.w - 2 * M + 0.3, h0: M, h1: hedge.h + 0.3 - M, points: 1000 },
    { name: 'PUMP LANE', px: GAS.cx0 + 2, py: pumps, deg: 0, w: 3.2, h0: 0.4, h1: GAS.canopyH - M, points: 250 },
    { name: 'THE BIG GATE', px: MANSION_GATE.px, py: MANSION_GATE.py, deg: 90, w: MANSION_GATE.w - 2 * M, h0: M, h1: MANSION_GATE.h - 0.25 - M, points: 250 },
    { name: 'BANDSTAND', px: BANDSTAND.px, py: BANDSTAND.py, deg: 90, w: 2.4, h0: 1.1, h1: BANDSTAND.h + 0.8 - M, points: 250 },
    { name: 'CONTAINER ARCH', px: (CONTAINER.x0 + CONTAINER.x1) / 2, py: (CONTAINER.yA + CONTAINER.d + CONTAINER.yB) / 2, deg: 0, w: CONTAINER.yB - CONTAINER.yA - CONTAINER.d - 2 * M, h0: M, h1: 2 * CONTAINER.hc - M, points: 500 },
    { name: 'PLANT GATE', px: (PLANT.x0 + PLANT.x1) / 2 + 2, py: PLANT.y0, deg: 90, w: 9 - 2 * M, h0: M, h1: 6.5 - M, points: 100 },
  ];
}

/*
 * THE TRAFFIC, on the right. A built map's closed road of two lanes keeps
 * its cars to the left (../built/traffic.js, the town is Japanese), and on a
 * road of one lane a car drives the middle. So Sunnyfield's loop of Oak
 * Street, Main Street, Pine Street and Maple Avenue is two roads of one
 * lane each, a lane's width apart: the outer one driven anticlockwise and
 * the inner one clockwise, which is each lane's right. Corners are the
 * crossroads'. `nodes` are absolute plan points; ./yard.js makes them
 * relative to the first.
 */
const LANE = HALF / 2;
export function trafficLoops() {
  const loop = (o) => [[OAK_X + o, MAPLE_Y + o], [PINE_X - o, MAPLE_Y + o], [PINE_X - o, MAIN_Y - o], [OAK_X + o, MAIN_Y - o]];
  const outer = loop(-LANE);
  const inner = loop(LANE).reverse();
  return [
    { name: 'Loop, anticlockwise', nodes: outer, radius: 9 },
    { name: 'Loop, clockwise', nodes: inner, radius: 6 },
  ];
}

/* The streets the cars keep to, for ./index.js: nothing of the town is on
 * them but paint. */
export const STREET_BOUNDS = { x0: OAK_X - HALF, x1: PINE_X + HALF, y0: MAPLE_Y - HALF, y1: MAIN_Y + HALF };

/* The title camera's tour: round the town at a height, looking in. */
export function tourPoints() {
  return [
    [OAK_X + 10, 60, 30], [180, 20, 34], [PINE_X + 20, 70, 30], [360, 150, 45], [MILL_X, MILL_END + 40, 40],
    [GORGE.x0 + 8, GORGE.y0 + 20, 22], [70, 190, 34], [OAK_X - 20, MAIN_Y, 24],
  ];
}
