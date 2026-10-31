/*
 * plan.js: Kumoi Towers whole. Builds the district from its parts
 * (./streets.js, ./towers.js, ./plaza.js, ./yokocho.js, ./site.js,
 * ./outskirts.js) into one
 * structure for the built map's pipeline, and says what a map document
 * says about it: where the pilot starts, the named gaps, the signs. Pure,
 * as ./frame.js is, so scripts/towers-check.js builds it in Node.
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
import { streets, BLVD_A, BLVD_B, AVE_S, AVE_N, ROAD_HALF, HALF, EXPRESS, RAIL, DECK, block } from './streets.js';
import { towers, HALL, SKY, SLOT, HOTEL } from './towers.js';
import { plaza, park, PADS, RING, TORII } from './plaza.js';
import { yokocho, LANES, LANE_W, BOUNDS as LANES_AT } from './yokocho.js';
import { site, FRAME, SITE } from './site.js';
import { outskirts } from './outskirts.js';
import { partsOf } from '../../props/catalog.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';

export { W, D, worldAt, chunkOf };

/* A scaled asset's solids in the world frame, never drawn (the kit draws
 * it), as ../sunny/plan.js does. */
const SCQ = { s: 0, c: 1 };
function scaledParts(a) {
  const k = a.k;
  const [x, y, z] = worldAt(a.px, a.py, a.h);
  const parts = partsOf(a.el);
  if (parts.some((p) => p.t === 'box')) {
    quarterSinCos(quarterTurns(a.yaw), SCQ);
  } else {
    sincos(a.yaw, SCQ);
  }
  const { s, c } = SCQ;
  const turn = (p) => [x + k * (p[0] * c + p[2] * s), y + k * p[1], z + k * (-p[0] * s + p[2] * c)];
  const out = [];
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
 * THE BILLBOARDS, one for each brand on the roster that shows here, where
 * the district would hang one: on the viaduct's parapet over the lanes, on
 * the expressway's sound wall, on the hoarding round the site, a screen on
 * the hall's podium over the plaza, and one on the hotel wing's roof. Each
 * is a board on legs or brackets; the pipeline paints the brand's sign on
 * its face (`markSpots` in ../built/index.js), found and stamped as on every
 * freestyle map, one draw a sign.
 */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'towers'));
const BOARD = { w: 6.4, h: 3.2, t: 0.3 };
const hallFront = HALL.podium.y0;
const BILLBOARDS = [
  { px: HALL.mid, py: hallFront - 0.2, base: 24, face: 's', w: 14, h: 7, wall: true },
  { px: 196, py: RAIL.y1 + 0.2, base: RAIL.deck + 1.6, face: 'n' },
  { px: 262, py: RAIL.y1 + 0.2, base: RAIL.deck + 1.6, face: 'n' },
  { px: 70, py: EXPRESS.y0 - 0.2, base: EXPRESS.top + 2.9, face: 's' },
  { px: 372, py: EXPRESS.y1 + 0.2, base: EXPRESS.top + 2.9, face: 'n' },
  { px: SITE.x0 + 70, py: SITE.y0 + 1.85, base: 0.3, face: 's', w: 6, h: 2.6, wall: true },
  { px: SITE.x0 + 4.0, py: SITE.y0 + 50, base: 0.3, face: 'w', w: 6, h: 2.6, wall: true },
  { px: HOTEL.wing.x1 - 14, py: HOTEL.wing.y0 + 4, base: HOTEL.wingH + 0.4, face: 's' },
];

function billboard(T, b) {
  const bw = b.w ?? BOARD.w;
  const bh = b.h ?? BOARD.h;
  const alongX = b.face === 's' || b.face === 'n';
  const out = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] }[b.face];
  const hw = bw / 2;
  const ht = BOARD.t / 2;
  /* The board sits with its back on its line, its face out. */
  const cx = b.px + out[0] * ht;
  const cy = b.py + out[1] * ht;
  const [x0, x1, y0, y1] = alongX ? [cx - hw, cx + hw, cy - ht, cy + ht] : [cx - ht, cx + ht, cy - hw, cy + hw];
  const top = b.base + bh;
  T.box('twParapet', x0, y0, b.base, x1, y1, top, { kind: 'wall', name: 'billboard' });
  T.deco('metalDark', x0 - 0.08, y0 - 0.08, top - 0.12, x1 + 0.08, y1 + 0.08, top + 0.05);
  T.deco('metalDark', x0 - 0.08, y0 - 0.08, b.base - 0.05, x1 + 0.08, y1 + 0.08, b.base + 0.1);
  if (!b.wall) {
    /* Legs down to what it stands on, and a lamp over each half. */
    for (const s of [-1, 1]) {
      const [px, py] = alongX ? [cx + s * (hw - 1.0), cy - out[1] * 0.5] : [cx - out[0] * 0.5, cy + s * (hw - 1.0)];
      T.post('billboardSteel', px, py, b.base - 1.6, b.base, 0.1, { kind: 'pole', name: 'billboard leg' });
      const [lx, ly] = alongX ? [cx + s * hw * 0.5, cy + out[1] * 0.9] : [cx + out[0] * 0.9, cy + s * hw * 0.5];
      T.cyl('metalDark', [alongX ? lx : cx, alongX ? cy : ly, top + 0.05], [lx, ly, top + 0.35], 0.03, 4, null, true);
      T.ball('lampGlow', lx, ly, top + 0.3, 0.12, true);
    }
  }
  return { cx, cy, w: bw, h: bh, out, base: b.base };
}

/*
 * The district: { parts, T }, the parts in the world frame and the
 * builder for everything ./index.js draws over them.
 */
let BOARDS = null;
export function towersLayout() {
  const T = new Town();
  streets(T);
  towers(T);
  plaza(T);
  park(T);
  yokocho(T);
  site(T);
  outskirts(T);
  BOARDS = BILLBOARDS.map((b) => billboard(T, b));
  const parts = [...T.P.list];
  T.scaled.forEach((a, i) => {
    a.el.id = `towers-${i + 1}`;
    parts.push(...scaledParts(a));
  });
  return { parts, T };
}

/* Each brand's sign on its board's face, as the pipeline's markSpots take
 * them: { slug, p, n, up, w, chunk } in the world, `p` on the face. */
export function towersMarkSpots() {
  if (!BOARDS) {
    towersLayout();
  }
  return BRANDS.slice(0, BOARDS.length).map((brand, i) => {
    const b = BOARDS[i];
    const px = b.cx + b.out[0] * (BOARD.t / 2);
    const py = b.cy + b.out[1] * (BOARD.t / 2);
    const [x, y, z] = worldAt(px, py, b.base + b.h / 2);
    const w = Math.min(b.w - 0.6, (b.h - 0.4) * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: [b.out[0], 0, -b.out[1]], up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  }).concat(hiddenMarkSpots());
}

/*
 * THE ONE HIDDEN KONEX DRONE SIGN (the owner's promise of a logo hidden in
 * every map), a second to its billboard's: inside the frame going up, on
 * the south face of the lift core on the twelfth floor, 1.8 m over the
 * deck. Seen only from inside that floor, which is open on every side
 * between the deck and the beams over it. It has its own key because the
 * billboard holds the brand's.
 */
export const HIDDEN_KONEX = (() => {
  const C = FRAME.core;
  const h = 12 * FRAME.storey + 0.25 + 1.8;
  return { px: (C.x0 + C.x1) / 2, py: C.y0 - 0.02, h, w: 1.2 };
})();
function hiddenMarkSpots() {
  const brand = BRANDS.find((b) => b.slug === 'konexdrone');
  if (!brand) {
    return [];
  }
  const { px, py, h, w } = HIDDEN_KONEX;
  const p = worldAt(px, py, h);
  return [{ slug: brand.slug, key: 'towers#konexdrone~hidden', p, n: [0, 0, 1], up: [0, 1, 0], w, chunk: chunkOf(p[0], p[2]) }];
}

/* Where the pilot starts: the plaza's south end, facing north at the hall. */
export const SPAWN = { px: PADS.px, py: PADS.py, h: 0.04, yaw: PADS.yaw };

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of its window's middle in the plan, the heading it is flown along in
 * whole degrees, its clear width and the bottom and top of its clear
 * height, already inside the opening by more than the craft's radius.
 */
export function towersGaps() {
  const M = 0.3;
  const skyGap = SKY.east.x0 - SKY.west.x1;
  const skyMid = (SKY.west.x1 + SKY.east.x0) / 2;
  const slotX = (SLOT.a.r.x1 + SLOT.b.r.x0) / 2;
  const slotW = SLOT.b.r.x0 - SLOT.a.r.x1;
  const slotY = (Math.max(SLOT.a.r.y0, SLOT.b.r.y0) + Math.min(SLOT.a.r.y1, SLOT.b.r.y1)) / 2;
  const linkY = Math.max(SLOT.a.r.y0, SLOT.b.r.y0) + 28.5;
  const ringIn = 2 * (RING.R - RING.t);
  const ringSide = ringIn / Math.SQRT2 - 2 * M;
  const shaftX = (FRAME.shaft.x0 + FRAME.shaft.x1) / 2;
  const f20 = 20 * FRAME.storey;
  const lane = LANES[1];
  return [
    { name: 'TWIN CROWNS', px: HALL.mid, py: (HALL.west.y0 + HALL.west.y1) / 2, deg: 90, w: HALL.east.x0 - HALL.west.x1 - 2 * M, h0: HALL.bodyH + 1.5 + M, h1: HALL.topH - M, points: 1000 },
    { name: 'SKY GARDEN', px: skyMid, py: SKY.hole.py, deg: 90, w: skyGap - 2 * M, h0: 116, h1: SKY.deck0 - M, points: 1000 },
    { name: 'UNDER THE SKY BRIDGE', px: skyMid, py: (SKY.bridge.y0 + SKY.bridge.y1) / 2, deg: 90, w: skyGap - 2 * M, h0: 50, h1: SKY.bridge.h0 - M, points: 500 },
    { name: 'THE SLOT', px: slotX, py: slotY, deg: 90, w: slotW - 2 * M, h0: M, h1: 140, points: 500 },
    { name: 'SLOT BRIDGE', px: slotX, py: linkY, deg: 90, w: slotW - 2 * M, h0: 141, h1: SLOT.link.h0 - M, points: 1000 },
    { name: 'RED RING', px: RING.px, py: RING.py, deg: 0, w: ringSide, h0: RING.h - ringSide / 2, h1: RING.h + ringSide / 2, points: 500 },
    { name: 'MEMORY LANE', px: LANES_AT.x0 + 0.6, py: lane, deg: 0, w: LANE_W - 0.4 - 2 * M, h0: M, h1: 3.3, points: 1000 },
    { name: 'STEEL FRAME', px: shaftX, py: FRAME.y0, deg: 90, w: FRAME.shaft.x1 - FRAME.shaft.x0 - 0.9 - 2 * M, h0: f20 + M, h1: f20 + FRAME.storey - 0.6 - M, points: 500 },
    { name: 'UNDER THE EXPRESSWAY', px: 216, py: AVE_S, deg: 90, w: EXPRESS.pier - 2.8 - 2 * M, h0: M, h1: EXPRESS.under - 1.4 - M, points: 250 },
    { name: 'GIRDER BRIDGE', px: BLVD_B, py: (RAIL.y0 + RAIL.y1) / 2, deg: 90, w: 2 * HALF - 2 * M, h0: M, h1: RAIL.deck - 1.6 - M, points: 250 },
    { name: 'UNDER THE DECK', px: (DECK.x0 + DECK.x1) / 2, py: AVE_N, deg: 0, w: 2 * ROAD_HALF - 2 * M, h0: M, h1: DECK.h - DECK.t - 0.5 - M, points: 100 },
    { name: 'THE TORII', px: TORII.px, py: TORII.py, deg: 90, w: TORII.w - 0.64 - 2 * M, h0: M, h1: TORII.h - 1.4 - M, points: 250 },
  ];
}

/*
 * THE TRAFFIC: one closed road round the plaza's superblock, two lanes,
 * which the built map drives on the left (../built/traffic.js), the way
 * Tokyo does. `nodes` are absolute plan points; ./yard.js makes them
 * relative to the first.
 */
export function trafficLoops() {
  return [{ name: 'Round the plaza', nodes: [[BLVD_A, AVE_S], [BLVD_B, AVE_S], [BLVD_B, AVE_N], [BLVD_A, AVE_N]], radius: 12 }];
}

/* The title camera's tour: round the towers at a height, looking in. */
export function tourPoints() {
  return [
    [PADS.px, PADS.py - 30, 40], [BLVD_B + 30, AVE_S, 90], [SLOT.b.r.x1 + 30, 200, 160], [HALL.east.x1 + 30, 330, 230],
    [HALL.mid, D - 10, 200], [SKY.west.x0 - 20, 300, 150], [60, AVE_S + 10, 120], [BLVD_A, 60, 30],
  ];
}

/* For the checks. */
export { SKY, SLOT, HALL, FRAME, SITE, LANES, block, wx, wz, AVE_N };
