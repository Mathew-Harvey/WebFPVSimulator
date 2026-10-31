/*
 * plan.js: Hotaru Valley whole. Builds the valley from its parts (./land.js,
 * ./village.js, ./castle.js, ./harbour.js, ./trees.js) into one structure
 * for the built map's pipeline, and says what a map document says about it:
 * where the pilot starts, the named gaps, the ground. Pure, as ./frame.js
 * is, so scripts/hotaru-check.js can build it in Node.
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

import { Vale, worldAt, W, D, chunkOf } from './frame.js';
import { landAt, worldFloor, shoreAt, nearestOnLine, RIVER, RIVER_HALF, TERRACES, WATER, BAMBOO, QUAY } from './land.js';
import {
  village, fields, archBridge, bridges, villageKeepOut, paddies, onRoad, polePlaces, ROAD, BILLBOARDS, BOARD, billboard,
  KURAS, BARN_LOT, GASSHOS, FLUME, KAKI, BUS_STOP, RACK, roadPieces, MILL_LANE, TERRACE_ROAD, ROAD_W,
} from './village.js';
import { castle, inCastle } from './castle.js';
import { harbour, FUNAYA, funayaLot, MARKET } from './harbour.js';
import { plantWoods, treeSolids, BAMBOO_LANE } from './trees.js';
import { KURA, BARN, GASSHO } from './houses.js';
import { partsOf } from '../../props/catalog.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { quarterTurns, quarterSinCos } from '../../props/trig.js';

export { W, D, worldAt, chunkOf };

/* The scaled assets' parts in the world frame, solid and never drawn, as
 * ../sunny/plan.js scaledParts, cut to the quarter turns the valley's
 * assets stand at. */
const SCQ = { s: 0, c: 1 };
function scaledParts(a) {
  const k = a.k;
  const [x, y, z] = worldAt(a.px, a.py, a.h);
  quarterSinCos(quarterTurns(a.yaw), SCQ);
  const { s, c } = SCQ;
  const turn = (p) => [x + k * (p[0] * c + p[2] * s), y + k * p[1], z + k * (-p[0] * s + p[2] * c)];
  const out = [];
  for (const p of partsOf(a.el)) {
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

/* Where the pilot starts: on the valley road south of the village, looking
 * north up it between the paddies, the village and the castle ahead. */
export const SPAWN = { px: 232, py: 82, h: 0.03, yaw: 90 };

/*
 * THE POWER LINE along the road: a pole every thirty metres on its south
 * and west side (the builder's own pole, lettered as Japan's are), five
 * wires from pole to pole, sagging. Its arm stands across the road.
 */
const POLE_H = 9;
const ARMS = [[-0.8, 8.675], [0, 8.675], [0.8, 8.675], [-0.6, 7.545], [0.6, 7.545]];
function powerLine(T, keep) {
  /* Along the quay the south side is the boat houses: the poles cross to
   * the north side there. */
  const places = polePlaces().map(([x, y]) => {
    if (y < QUAY.py + 14) {
      const r = nearestOnLine(ROAD, x, y);
      return [2 * r.x - x, 2 * r.y - y];
    }
    return [x, y];
  }).filter(([x, y]) => keep(x, y));
  const poles = places.map(([x, y], i) => {
    /* Across the road: the nearest leg of it runs along x or along y. */
    const r = nearestOnLine(ROAD, x, y);
    const along = places[i + 1] || places[i - 1];
    const dx = Math.abs(along[0] - x);
    const dy = Math.abs(along[1] - y);
    const q = dx >= dy ? 0 : 1;
    const h = Math.max(0, landAt(x, y));
    T.asset({ type: 'utilityPole', dims: { height: POLE_H } }, 1, x, y, h, (q * Math.PI) / 2);
    return { x, y, h, q, d: r.d };
  });
  for (let i = 0; i + 1 < poles.length; i += 1) {
    const a = poles[i];
    const b = poles[i + 1];
    const span = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    if (span > 45) {
      continue;
    }
    for (const [o, h] of ARMS) {
      /* The arm's local z is world z at no turn (plan -y) and world x at a
       * quarter turn (plan +x). */
      const pa = a.q ? [a.x + o, a.y] : [a.x, a.y - o];
      const pb = b.q ? [b.x + o, b.y] : [b.x, b.y - o];
      T.wire('hvBlack', [pa[0], pa[1], a.h + h], [pb[0], pb[1], b.h + h], 0.35 + span * 0.008, 0.025);
    }
  }
  return poles;
}

/*
 * THE ROADS, drawn: each piece of ./village.js roadPieces a flat box at the
 * land, a disc at every bend so the pieces meet, and a dashed white line
 * down the middle of the valley road. Paint: the land is the ground.
 */
function roads(T) {
  let k = 0;
  for (const p of roadPieces()) {
    T.rod(p.m, p.a, p.b, p.w, 0.07);
    if (p.line && (k += 1) % 2 === 0) {
      const f = 0.2;
      const a = [p.a[0] + (p.b[0] - p.a[0]) * f, p.a[1] + (p.b[1] - p.a[1]) * f, p.a[2] + 0.04];
      const b = [p.a[0] + (p.b[0] - p.a[0]) * (1 - f), p.a[1] + (p.b[1] - p.a[1]) * (1 - f), p.b[2] + 0.04];
      T.rod('hvLine', a, b, 0.14, 0.02);
    }
  }
  for (const [line, w, m] of [[ROAD, ROAD_W, 'hvAsphalt'], [MILL_LANE, 3.5, 'hvGravel'], [TERRACE_ROAD, 4, 'hvAsphalt']]) {
    for (let i = 1; i + 1 < line.length; i += 1) {
      const [px, py] = line[i];
      const h = Math.max(0, landAt(px, py));
      T.disc(m, px, py, w / 2, h, h + 0.07, 16);
    }
  }
}

/*
 * The valley: { parts, T, trees, info }, the parts in the world frame (the
 * builder's own and the scaled assets' solids), the builder for everything
 * ./index.js draws over them, the trees (drawn by ./trees.js, their solids
 * already in the parts) and what the gaps need to know.
 */
export function hotaruLayout() {
  const T = new Vale();
  const info = {};
  info.village = village(T);
  info.fields = fields(T);
  info.arch = archBridge(T);
  info.bridges = bridges(T);
  info.castle = castle(T);
  info.harbour = harbour(T);
  for (const b of BILLBOARDS) {
    billboard(T, b);
  }
  roads(T);
  const clear = keepClear();
  const houses = villageKeepOut();
  info.poles = powerLine(T, (x, y) => !houses.some((k) => x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1)
    && !BILLBOARDS.some((b) => Math.abs(b.px - x) < 4.5 && Math.abs(b.py - y) < 4.5));
  /* The vending machines: one at the bus stop, one on the quay. */
  T.asset({ type: 'vending', dims: { count: 2, variant: 1 } }, 1, BUS_STOP.px + 3.2, BUS_STOP.py + 3.2, 0, Math.PI);
  T.asset({ type: 'vending', dims: { count: 1, variant: 3 } }, 1, 431, 55, QUAY.h, Math.PI / 2);
  /* The woods, then the trees the plan places by hand. */
  const trees = plantWoods(clear);
  trees.push(...info.castle.pines);
  KAKI.forEach(([px, py], i) => trees.push({ kind: 'kaki', px, py, h: Math.max(0, landAt(px, py)), k: 1, seed: 7700 + i }));
  trees.push({ kind: 'cedar', px: 330, py: 252, h: landAt(330, 252), k: 1.55, seed: 7650 });
  /* The pine windbreak behind the beach. */
  for (let px = 150; px < 288; px += 5.5) {
    const py = shoreAt(px) + 8 + ((px * 7) % 3);
    if (onRoad(px, py, 2) || nearestOnLine(RIVER, px, py).d < RIVER_HALF + 5 || landAt(px, py) < WATER + 0.6) {
      continue;
    }
    trees.push({ kind: 'pine', px, py, h: landAt(px, py), k: 1.05, seed: 7800 + px });
  }
  for (const t of trees) {
    treeSolids(T, t);
  }
  const parts = [...T.P.list];
  T.scaled.forEach((a, i) => {
    a.el.id = `hotaru-${i + 1}`;
    parts.push(...scaledParts(a));
  });
  return { parts, T, trees, info };
}

/*
 * WHERE NOTHING GROWS: `clear(px, py, r)` true where a tree of crown radius
 * r may stand. Out of the buildings, the paddies, the terraces, the roads,
 * the castle, the hamlet, the spawn and the lines through the gaps.
 */
function keepClear() {
  const rects = villageKeepOut();
  for (const p of paddies()) {
    rects.push({ x0: p.x0 - 0.5, y0: p.y0 - 0.5, x1: p.x1 + 0.5, y1: p.y1 + 0.5 });
  }
  rects.push({ x0: TERRACES.x0 - 3, y0: TERRACES.y0 - 3, x1: TERRACES.x1 - 4, y1: TERRACES.y1 + 3 });
  rects.push({ x0: QUAY.x0 - 14, y0: -40, x1: QUAY.x1 + 2, y1: 84 });
  rects.push({ x0: SPAWN.px - 14, y0: SPAWN.py - 10, x1: SPAWN.px + 14, y1: SPAWN.py + 18 });
  for (const b of BILLBOARDS) {
    rects.push({ x0: b.px - 5, y0: b.py - 5, x1: b.px + 5, y1: b.py + 5 });
  }
  /* The run out of the barn's back door and the alley's ends. */
  rects.push({ x0: BARN_LOT.x0, y0: BARN_LOT.y0 - 12, x1: BARN_LOT.x0 + BARN.w, y1: BARN_LOT.y0 + BARN.d + 12 });
  rects.push({ x0: KURAS[0].x0, y0: KURAS[0].y0 - 10, x1: KURAS[1].x0 + KURA.w, y1: KURAS[0].y0 + KURA.d + 10 });
  /* The flume's pond side, the arch's river, the bamboo lane. */
  rects.push({ x0: FLUME.x - 10, y0: 262, x1: FLUME.x + 10, y1: 292 });
  rects.push({ x0: BAMBOO_LANE.px - 2.8, y0: BAMBOO.y0 - 8, x1: BAMBOO_LANE.px + 2.8, y1: BAMBOO.y1 + 8 });
  return (px, py, r) => {
    for (const k of rects) {
      if (px > k.x0 - r && px < k.x1 + r && py > k.y0 - r && py < k.y1 + r) {
        return false;
      }
    }
    if (inCastle(px, py, r) || onRoad(px, py, r + 0.5)) {
      return false;
    }
    return true;
  };
}

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of its window's middle in the plan, the heading it is flown along in
 * whole degrees (0 along x, 90 along y), its clear width and the bottom
 * and top of its clear height, already inside the opening by more than the
 * craft's radius.
 */
export function hotaruGaps(info) {
  const M = 0.3;
  const barnX = BARN_LOT.x0 + BARN.w / 2;
  const alleyX = KURAS[0].x0 + KURA.w + 1.5;
  const loft = GASSHOS[info.village.loft];
  const lg = info.village.gassho[info.village.loft].gap;
  const ga = info.castle.gate;
  const br = info.castle.breach;
  const tt = info.village.torii[info.village.torii.length - 1];
  const st = info.harbour.seaTorii;
  const shed = funayaLot(FUNAYA.open);
  const pier = info.harbour.pier;
  const arch = info.arch;
  /* The rice racks: the first cut paddy with two racks, nearest the spawn. */
  const racks = info.fields.racks;
  let pair = null;
  for (let i = 0; i + 1 < racks.length; i += 1) {
    if (racks[i].n === racks[i + 1].n) {
      const d = Math.abs(racks[i].x0 - SPAWN.px) + Math.abs(racks[i].py - SPAWN.py);
      if (!pair || d < pair.d) {
        pair = { a: racks[i], b: racks[i + 1], d };
      }
    }
  }
  const gaps = [
    { name: 'BARN RUN', px: barnX, py: BARN_LOT.y0, deg: 90, w: BARN.doorW - 2 * M, h0: M, h1: BARN.doorH - M, points: 500 },
    { name: 'KURA ALLEY', px: alleyX, py: KURAS[0].y0, deg: 90, w: 2.8 - 2 * M, h0: 0.4 + M, h1: KURA.wall - M, points: 500 },
    { name: 'THE LOFT', px: loft.x0 + GASSHO.w / 2, py: loft.y0, deg: 90, w: 2 * lg.half - 2 * M, h0: lg.h0, h1: lg.h1, points: 2500 },
    { name: 'UNDER THE FLUME', px: FLUME.x, py: (FLUME.bents[0] + FLUME.bents[1]) / 2, deg: 0, w: FLUME.bents[1] - FLUME.bents[0] - 0.3 - 2 * M, h0: Math.max(WATER, landAt(FLUME.x, 278)) + M, h1: FLUME.h0 - M, points: 250 },
    { name: 'CASTLE GATE', px: ga.px, py: ga.py, deg: 90, w: ga.w - 2 * M, h0: ga.h0 + M, h1: ga.h1 - M, points: 500 },
    { name: 'KEEP BREACH', px: br.px, py: br.py, deg: 0, w: br.w - 2 * M, h0: br.h0 + M, h1: br.h1 - 0.5, points: 1000 },
    { name: 'TORII TUNNEL', px: tt.px, py: 245.5, deg: 0, w: 2 * tt.half - 2 * M, h0: tt.h0 + M, h1: tt.h1 - M, points: 1000 },
    { name: 'SEA TORII', px: 262, py: 20, deg: 90, w: 2 * st.half - 2 * M, h0: st.h0 + 0.5, h1: st.h1 - M, points: 500 },
    { name: 'BOAT SHED', px: (shed.x0 + shed.x1) / 2, py: shed.y0, deg: 90, w: FUNAYA.w - 0.5 - 2 * M, h0: QUAY.h + M, h1: QUAY.h + FUNAYA.bay - M, points: 1000 },
    { name: 'UNDER THE PIER', px: pier.px, py: pier.py, deg: 90, w: pier.w - 2 * M, h0: pier.h0, h1: pier.h1, points: 1000 },
    { name: 'ARCH BRIDGE', px: arch.px, py: arch.py, deg: 90, w: 2 * arch.half - 2 * M, h0: arch.h0, h1: arch.h1, points: 500 },
    { name: 'FISH MARKET', px: MARKET.x0, py: 53.2, deg: 0, w: 6.4, h0: QUAY.h + M, h1: QUAY.h + MARKET.h - M, points: 100 },
    { name: 'BAMBOO LANE', px: BAMBOO_LANE.px, py: (BAMBOO.y0 + BAMBOO.y1) / 2, deg: 90, w: 2.6, h0: Math.max(0, landAt(BAMBOO_LANE.px, (BAMBOO.y0 + BAMBOO.y1) / 2)) + M, h1: Math.max(0, landAt(BAMBOO_LANE.px, (BAMBOO.y0 + BAMBOO.y1) / 2)) + 5, points: 250 },
  ];
  if (pair) {
    const y0 = Math.min(pair.a.py, pair.b.py) + RACK.t / 2;
    const y1 = Math.max(pair.a.py, pair.b.py) - RACK.t / 2;
    gaps.push({ name: 'RICE RACKS', px: pair.a.x0, py: (y0 + y1) / 2, deg: 0, w: y1 - y0 - 2 * M, h0: M, h1: RACK.h1 - 0.1, points: 250 });
  }
  return gaps;
}

/*
 * THE BILLBOARDS' SIGNS, one for each brand on the roster that shows here,
 * on the faces of the boards in the paddies (./village.js BILLBOARDS),
 * painted by the pipeline (`markSpots` in ../built/index.js) as on every
 * freestyle map.
 */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'hotaru'));
export function hotaruMarkSpots() {
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

/*
 * The one hidden Konex Drone sign (the owner's promise of a logo hidden in
 * every map), a second to its billboard's: on the back wall INSIDE the
 * boat bay of the fifth boat house from the west on the quay, the one
 * beside the open boat shed, 0.9 m over the bay's floor and facing out to
 * sea. Seen only by a pilot who flies into a dark bay under somebody's
 * house, over the little boat on its slip. It has its own key because the
 * billboard holds the brand's.
 */
function hiddenMarkSpots() {
  const brand = BRANDS.find((b) => b.slug === 'konexdrone');
  if (!brand) {
    return [];
  }
  const lot = funayaLot(FUNAYA.hide);
  const px = (lot.x0 + lot.x1) / 2;
  const py = lot.y1 - 0.25 - 0.02;
  const p = worldAt(px, py, QUAY.h + 0.9);
  return [{ slug: brand.slug, key: 'hotaru#konexdrone~hidden', p, n: [0, 0, 1], up: [0, 1, 0], w: 1.0, chunk: chunkOf(p[0], p[2]) }];
}
export const HIDDEN_KONEX_AT = () => funayaLot(FUNAYA.hide);

/* The ground the plant is given where no top is under the craft: the land,
 * or the water's surface over it. */
export const hotaruFloor = worldFloor;

/* The title camera's tour: round the valley at a height, looking in. */
export function tourPoints() {
  return [
    [232, 70, 26], [300, 40, 22], [400, 70, 30], [380, 180, 38], [330, 260, 32],
    [230, 300, 30], [110, 300, 44], [120, 200, 30],
  ];
}
