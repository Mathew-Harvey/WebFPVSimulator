/*
 * plan.js: Kazahana Plain whole. Builds the plain from its parts (the meet,
 * ./festival.js; the market, ./market.js; the farms and windbreaks,
 * ./farm.js; the old line and the turbines, ./far.js) into one structure
 * for the built map's pipeline, and says the things a map document says
 * about it: where the pilot starts, the named gaps, where the brands hang.
 * Pure, as ./frame.js is, so scripts/kaza-check.js can build it in Node.
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

import { Town, worldAt, wx, wz, W, D, chunkOf } from './frame.js';
import { festival, PADS, BOARDS, BOARD, balloonGates, topBasket, YAGURA } from './festival.js';
import { market, TUNNEL, LANE, ROWS, STALL, groupY, STAGE, CAROUSEL, CASTLE } from './market.js';
import { farm, BARN, SILOS, VINYL, TORII, BREAKS, ROAD } from './farm.js';
import { far, VIADUCT, archX, archHalf, TURBINES, TURBINE_YAW } from './far.js';
import { partsOf } from '../../props/catalog.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';

export { W, D, worldAt, chunkOf, wx, wz };

/* The scaled assets' parts in the world frame, solid and never drawn, as
 * Sunnyfield's are (../sunny/plan.js scaledParts). */
const SCQ = { s: 0, c: 1 };
function scaledParts(a) {
  const k = a.k;
  const [x, y, z] = worldAt(a.px, a.py, a.h);
  const parts = partsOf(a.el);
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
 * The plain: { parts, T }, the parts in the world frame (the builder's own,
 * the scaled assets' solids and the turbines'), and the builder itself for
 * everything ./index.js draws over them.
 */
export function kazaLayout() {
  const T = new Town();
  farm(T);
  festival(T);
  market(T);
  far(T);
  const parts = [...T.P.list];
  T.scaled.forEach((a, i) => {
    a.el.id = `kaza-${i + 1}`;
    parts.push(...scaledParts(a));
  });
  for (const t of T.turbines) {
    parts.push(...scaledParts({ el: t.el, k: 1, px: t.px, py: t.py, h: 0, yaw: TURBINE_YAW }));
  }
  return { parts, T };
}

/*
 * THE BRANDS on the meet's boards, one each for the brands on the roster
 * that show here, painted by the pipeline (`markSpots` in ../built/index.js)
 * and found and stamped as on every freestyle map.
 */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'kaza'));

export function kazaMarkSpots() {
  return BRANDS.slice(0, BOARDS.length).map((brand, i) => {
    const b = BOARDS[i];
    const out = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] }[b.face];
    const px = b.px + out[0] * (BOARD.t / 2);
    const py = b.py + out[1] * (BOARD.t / 2);
    const [x, y, z] = worldAt(px, py, BOARD.lift + BOARD.h / 2);
    const w = Math.min(BOARD.w - 0.5, 2.0 * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: [out[0], 0, -out[1]], up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  }).concat(hiddenMarkSpots());
}

/*
 * The one hidden Konex Drone sign: on the north face of the top balloon's
 * basket, 58 m up over the field, the last and highest of the chase line.
 * A pilot finds it only by climbing the whole line and flying in close
 * under the highest envelope. It has its own key because a board may hold
 * the brand's.
 */
function hiddenMarkSpots() {
  const brand = BRANDS.find((b) => b.slug === 'konexdrone');
  if (!brand) {
    return [];
  }
  const t = topBasket();
  const [x, y, z] = worldAt(t.px, t.py + 0.02, t.h);
  return [{ slug: brand.slug, key: 'kaza#konexdrone~hidden', p: [x, y, z], n: [0, 0, -1], up: [0, 1, 0], w: 1.05, chunk: chunkOf(x, z) }];
}

/* Where the pilot starts: the matting south of the field, facing north. */
export const SPAWN = { px: PADS.px, py: PADS.py, h: 0.03, yaw: Math.PI / 2 };

/*
 * THE NAMED GAPS. Each a window in the plan: its sill's middle, the way
 * its face looks in whole degrees (0 faces east, 90 north), its width and
 * its sill and head. M is the margin kept off every solid, at least the
 * craft's radius.
 */
const M = 0.3;
export function kazaGaps() {
  const g = balloonGates();
  const T = TUNNEL;
  /* The stall gaps: the gap after the fourth group on the west row and
   * after the eighth on the east. */
  const stallGap = (gIdx, x) => ({ px: x, py: groupY(gIdx) + 3 * STALL.w + ROWS.gap / 2, deg: 0, w: ROWS.gap - 0.5, h0: 0.3, h1: STALL.eave - 0.4 });
  const arch = (i) => ({ px: archX(i), py: (VIADUCT.y0 + VIADUCT.y1) / 2, deg: 90 });
  const yh = YAGURA.half;
  return [
    { name: 'BALLOON GATE', px: g.gate.px, py: g.gate.py, deg: 90, w: g.gate.w - 2 * M, h0: g.gate.h0, h1: g.gate.h1, points: 250 },
    { name: 'LOW PAIR', px: g.low.px, py: g.low.py, deg: 90, w: g.low.w - 2 * M, h0: g.low.h0, h1: g.low.h1, points: 500 },
    { name: 'SKY GATE', px: g.sky.px, py: g.sky.py, deg: 90, w: g.sky.w - 2 * M, h0: g.sky.h0, h1: g.sky.h1, points: 500 },
    { name: 'BETWEEN THE BASKETS', px: g.stack.px, py: g.stack.py, deg: 90, w: g.stack.w, h0: g.stack.h0 + M, h1: g.stack.h1 - M, points: 1000 },
    { name: 'LIGHT TUNNEL', px: LANE.cx, py: (T.y0 + T.y1) / 2, deg: 90, w: 3.0, h0: 0.4, h1: 3.3, points: 250 },
    { ...stallGap(3, (LANE.x0 + LANE.x0 - STALL.d) / 2), name: 'STALL GAP', points: 500 },
    { ...stallGap(7, (LANE.x1 + LANE.x1 + STALL.d) / 2), name: 'BACK OF THE STALLS', points: 500 },
    { name: 'STAGE', px: (STAGE.x0 + STAGE.x1) / 2 + 0.5, py: STAGE.y0 + 0.4, deg: 90, w: STAGE.x1 - STAGE.x0 - 2.2, h0: STAGE.deck + M, h1: STAGE.roof - 1.2 - M, points: 250 },
    { name: 'CAROUSEL', px: CAROUSEL.px, py: CAROUSEL.py - 4.1, deg: 90, w: 2.0, h0: 0.45 + 1.0, h1: CAROUSEL.roof - M, points: 500 },
    { name: 'SNOW CASTLE', px: CASTLE.px, py: CASTLE.py - CASTLE.d, deg: 90, w: 2 * CASTLE.gate - 2 * M, h0: M, h1: CASTLE.gateH - M, points: 500 },
    { name: 'YAGURA', px: YAGURA.px, py: YAGURA.py, deg: 90, w: 2 * yh - 2 * M - 0.4, h0: 0.8, h1: YAGURA.deck - M, points: 250 },
    { name: 'BARN RUN', px: (BARN.x0 + BARN.x1) / 2, py: BARN.y0 + 0.4, deg: 90, w: BARN.door - 2 * M, h0: M, h1: BARN.door - M, points: 500 },
    { name: 'SILO SPLIT', px: (SILOS.px[0] + SILOS.px[1]) / 2, py: SILOS.py, deg: 90, w: SILOS.px[1] - SILOS.px[0] - 2 * SILOS.r - 2 * M, h0: M, h1: SILOS.h - M, points: 1000 },
    { name: 'VINYL HOUSE', px: VINYL.px[1], py: VINYL.y0 + 0.3, deg: 90, w: 3.4, h0: M, h1: VINYL.wall + VINYL.r - 1.6, points: 250 },
    { name: 'TORII', px: TORII.px, py: TORII.py, deg: 90, w: 2 * TORII.half - 0.34 - 2 * M, h0: M, h1: TORII.h - 0.95 - M, points: 250 },
    ...BREAKS.map((b, i) => ({ name: ['FIRST WINDBREAK', 'MIDDLE WINDBREAK', 'LAST WINDBREAK'][i], px: b.miss, py: b.py + 2, deg: 90, w: 2.4, h0: 1.5, h1: 9, points: 500 })),
    { name: 'OLD LINE', ...arch(VIADUCT.road), w: VIADUCT.span - 2 * M - 1.0, h0: M, h1: VIADUCT.spring + 1.5, points: 250 },
    { name: 'HIGH ARCH', ...arch(14), w: 4.0, h0: VIADUCT.spring + 0.5, h1: VIADUCT.spring + archHalf(VIADUCT.spring) * 0.6, points: 500 },
  ];
}

/* The title camera's tour: round the meet and out along the road. */
export function tourPoints() {
  return [
    [220, 150, 30], [320, 260, 42], [420, 360, 36], [545, 300, 22], [520, 470, 30],
    [300, 560, 48], [180, 450, 40], [ROAD.cx + 20, 300, 26],
  ];
}

export { TURBINES };
