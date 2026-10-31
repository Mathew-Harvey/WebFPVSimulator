/*
 * plan.js: Shiokaze Point whole. Builds the island from its parts
 * (./terrain.js, ./hotels.js, ./street.js, ./shore.js, ./park.js) into one
 * structure for the built map's pipeline, and says what a map document
 * says about it: where the pilot starts, the named gaps, the partners'
 * boards. Pure, as ./frame.js is, so scripts/shiokaze-check.js can build it
 * in Node.
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

import { Town, worldAt, W, D, chunkOf } from './frame.js';
import { island, foam, TOP, SHELF, TUNNEL, ARCH, WEDDED, STACKS } from './terrain.js';
import { hotels, BLOCKS, HOTEL, level, ROOF, towerOf, wellOf, DOOR, SIGN, PORCH, C_BLOCK, KONEX_STUB } from './hotels.js';
import { street, STEPS, TORII, WORKSHOP } from './street.js';
import { shore, PAVILION, MARKET, ROPE } from './shore.js';
import { park, GATES, ARCH_W, ARCH_H, PERGOLA, WHEEL } from './park.js';
import { partsOf } from '../../props/catalog.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { loblollyLayout } from '../../props/street.js';
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';

export { W, D, worldAt, chunkOf };

/* The scaled assets' parts in the world frame, solid and never drawn, as
 * ../sunny/plan.js's scaledParts. */
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

/* The island: { parts, T }, as ../sunny/plan.js's sunnyLayout. */
export function shiokazeLayout() {
  const T = new Town();
  island(T);
  hotels(T);
  street(T);
  shore(T);
  park(T);
  foam(T);
  for (const b of BILLBOARDS) {
    billboard(T, b);
  }
  const parts = [...T.P.list];
  T.scaled.forEach((a, i) => {
    a.el.id = `shiokaze-${i + 1}`;
    parts.push(...scaledParts(a));
  });
  return { parts, T };
}

/*
 * THE PARTNERS' BOARDS, one for each brand on the roster that shows here:
 * the hoardings a resort put on its roofs and by its roads, on legs, high
 * enough to fly under. The pipeline paints the brand's sign on the face
 * (`markSpots` in ../built/index.js).
 */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'shiokaze'));
const BOARD = { w: 6.4, h: 3.2, t: 0.3, lift: 3.0 };
const BILLBOARDS = [
  /* the roofs of the second, fourth and fifth blocks, two to the
   * forecourt and one to the sea */
  { px: BLOCKS[1].x0 + 8, py: HOTEL.yN - 1.2, base: ROOF, face: 'n' },
  { px: BLOCKS[3].x0 + 26, py: HOTEL.yS + 1.2, base: ROOF, face: 's' },
  { px: BLOCKS[4].x0 + 26, py: HOTEL.yN - 1.2, base: ROOF, face: 'n' },
  /* the dormitory's roof, to the lane */
  { px: 302, py: 213.5, base: TOP + 9.8, face: 's' },
  /* the quay, to the harbour and the hotels */
  { px: 397, py: 140, base: SHELF, face: 'w' },
  /* the retaining wall's foot, on the promenade, to the sea */
  { px: 176, py: 149.6, base: SHELF, face: 's' },
  /* the forecourt's west end, to the park */
  { px: 114, py: 196, base: TOP, face: 'w' },
  /* the road's end by the bus stop, to the road */
  { px: 404, py: 254, base: SHELF, face: 'w' },
];

function billboard(T, b) {
  const alongX = b.face === 's' || b.face === 'n';
  const hw = BOARD.w / 2;
  const ht = BOARD.t / 2;
  const [x0, x1, y0, y1] = alongX ? [b.px - hw, b.px + hw, b.py - ht, b.py + ht] : [b.px - ht, b.px + ht, b.py - hw, b.py + hw];
  const lift = b.base + BOARD.lift;
  const top = lift + BOARD.h;
  T.box('skCream', x0, y0, lift, x1, y1, top, { kind: 'wall', name: 'billboard' });
  T.deco('skRust', x0 - 0.08, y0 - 0.08, top - 0.12, x1 + 0.08, y1 + 0.08, top + 0.05);
  T.deco('skRust', x0 - 0.08, y0 - 0.08, lift - 0.05, x1 + 0.08, y1 + 0.08, lift + 0.1);
  for (const s of [-1, 1]) {
    const [px, py] = alongX ? [b.px + s * (hw - 1.2), b.py] : [b.px, b.py + s * (hw - 1.2)];
    T.post('skRust', px, py, b.base, lift, 0.12, { kind: 'pole', name: 'billboard leg' });
  }
  T.dress(() => {
    /* The rust down its face from the top rail. */
    const out = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] }[b.face];
    for (let k = 0; k < 5; k += 1) {
      const u = -hw + 0.6 + k * 1.3;
      const [px, py] = alongX ? [b.px + u, b.py + out[1] * (ht + 0.01)] : [b.px + out[0] * (ht + 0.01), b.py + u];
      T.paint('skRust', px - 0.05, py - 0.05, top - 0.9 - k * 0.1, px + 0.05, py + 0.05, top - 0.12);
    }
  });
}

/* Each brand's sign on its board's face, as ../sunny/plan.js's. */
export function shiokazeMarkSpots() {
  return BRANDS.slice(0, BILLBOARDS.length).map((brand, i) => {
    const b = BILLBOARDS[i];
    const out = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] }[b.face];
    const px = b.px + out[0] * (BOARD.t / 2);
    const py = b.py + out[1] * (BOARD.t / 2);
    const [x, y, z] = worldAt(px, py, b.base + BOARD.lift + BOARD.h / 2);
    const w = Math.min(BOARD.w - 0.6, 2.8 * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: [out[0], 0, -out[1]], up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  }).concat(hiddenMarkSpots());
}

/* THE HIDDEN KONEX DRONE SIGN, the owner's promise of a logo hidden in
 * every map: on the south face of the spine wall's stub in the middle of
 * the third block's burnt out sixth floor, 1.4 m over the slab, so it is
 * seen only by a pilot who flies in off the sea between the columns. */
export const HIDDEN_KONEX = (() => {
  const b = BLOCKS[C_BLOCK];
  const mid = (HOTEL.yS + HOTEL.yN) / 2;
  const px = b.x0 + KONEX_STUB.u;
  const py = mid - KONEX_STUB.d / 2;
  return { px, py, h: level(5) + 1.4, w: 1.2 };
})();
function hiddenMarkSpots() {
  const brand = BRANDS.find((b) => b.slug === 'konexdrone');
  if (!brand) {
    return [];
  }
  const K = HIDDEN_KONEX;
  const [x, y, z] = worldAt(K.px, K.py, K.h);
  return [{ slug: brand.slug, key: 'shiokaze#konexdrone~hidden', p: [x, y, z], n: [0, 0, 1], up: [0, 1, 0], w: K.w, chunk: chunkOf(x, z) }];
}

/* Where the pilot starts: the forecourt, facing south down the porch and
 * through the lobby of the third block to the sea. */
export const SPAWN = { px: BLOCKS[C_BLOCK].x0 + 18, py: 188, h: TOP, yaw: -Math.PI / 2, deg: -90 };

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of its window's middle in the plan, the heading it is flown along in
 * whole degrees, its clear width and the bottom and top of its clear
 * height, already inside the opening by more than the craft's radius.
 */
export function shiokazeGaps() {
  const M = 0.3;
  const H = HOTEL;
  const out = [];
  /* The park race, in its order. */
  GATES.forEach((g, i) => {
    const name = `PARK GATE ${i + 1}`;
    if (g.pergola) {
      out.push({ name, px: g.px, py: g.py, deg: g.deg, w: PERGOLA.x1 - PERGOLA.x0 - 0.24 - 2 * M, h0: TOP + M, h1: TOP + PERGOLA.h - M, points: 100 });
    } else if (g.wheel) {
      out.push({ name, px: g.px, py: g.py, deg: g.deg, w: 3.0, h0: TOP + M, h1: WHEEL.h - WHEEL.R + 0.6 - M, points: 250 });
    } else {
      out.push({ name, px: g.px, py: g.py, deg: g.deg, w: ARCH_W - 2 * M, h0: TOP + M, h1: TOP + ARCH_H - M, points: 100 });
    }
  });
  /* The stair cores' doors, every block's. */
  for (const b of BLOCKS) {
    const w = wellOf(b);
    out.push({ name: `STAIR CORE ${b.id}`, px: (w.x0 + w.x1) / 2, py: towerOf(b).y1, deg: 90, w: w.x1 - w.x0 - 2 * M, h0: H.base + M, h1: H.base + DOOR.h - M, points: 500 });
  }
  const A = BLOCKS[0];
  const C = BLOCKS[C_BLOCK];
  const E = BLOCKS[4];
  const balY = (H.yB + 0.15 + H.yS) / 2;
  const balW = H.yS - H.yB - 0.15 - 2 * M;
  out.push({ name: 'BALCONY RUN', px: A.x0 + 15, py: balY, deg: 0, w: balW, h0: level(4) + M, h1: level(5) - H.slab - M, points: 1000 });
  out.push({ name: 'EAST BALCONY', px: E.x0 + 21, py: balY, deg: 180, w: balW, h0: level(4) + M, h1: level(5) - H.slab - M, points: 1000 });
  out.push({ name: 'THE CORRIDOR', px: BLOCKS[1].x0 + 15, py: (H.yN + H.yC - 0.15) / 2, deg: 180, w: H.yC - 0.15 - H.yN - 2 * M, h0: level(3) + M, h1: level(4) - H.slab - M, points: 1000 });
  out.push({ name: 'THE SIXTH FLOOR', px: C.x0 + 15, py: H.yS, deg: 90, w: 5.5 - 2 * M, h0: level(5) + M, h1: level(6) - H.slab - M, points: 1000 });
  out.push({ name: 'THE LOBBY', px: C.x0 + 15, py: H.yN, deg: -90, w: 5.5 - 2 * M, h0: TOP + M, h1: level(1) - H.slab - M, points: 500 });
  out.push({ name: 'HOTEL ENTRANCE', px: C.x0 + (PORCH.u0 + PORCH.u1) / 2, py: PORCH.y1, deg: -90, w: PORCH.u1 - PORCH.u0 - 1.0 - 0.5 - 2 * M, h0: TOP + M, h1: PORCH.h - M, points: 100 });
  out.push({ name: 'UNDER THE SIGN', px: A.x0 + (SIGN.legs[2] + SIGN.legs[3]) / 2, py: SIGN.y, deg: 90, w: SIGN.legs[3] - SIGN.legs[2] - 0.24 - 2 * M, h0: ROOF + M, h1: SIGN.h0 - M, points: 500 });
  /* The coast. */
  out.push({ name: 'THE TUNNEL', px: (TUNNEL.x0 + TUNNEL.x1) / 2, py: TUNNEL.y0, deg: 90, w: TUNNEL.x1 - TUNNEL.x0 - 2 * M, h0: SHELF + M, h1: TUNNEL.h1 - 0.17 - M, points: 250 });
  out.push({ name: 'SEA ARCH', px: (ARCH.x0 + ARCH.x1) / 2, py: (ARCH.gy0 + ARCH.gy1) / 2, deg: 0, w: ARCH.gy1 - ARCH.gy0 - 1.4 - 2 * M, h0: 0.5, h1: ARCH.h0 - 0.4 - M, points: 1000 });
  out.push(weddedGap(M));
  out.push(stacksGap(M));
  out.push({ name: 'THE PAVILION', px: PAVILION.x0, py: (PAVILION.y0 + PAVILION.y1) / 2, deg: 0, w: PAVILION.y1 - PAVILION.y0 - 0.28 - 2 * M, h0: SHELF + M, h1: PAVILION.h - M, points: 250 });
  out.push({ name: 'FISH MARKET', px: MARKET.x0, py: (MARKET.y0 + MARKET.y1) / 2, deg: 0, w: 9.6 - 2 * M, h0: SHELF + M, h1: MARKET.h - M, points: 250 });
  /* The back street and the hill. */
  out.push({ name: 'THE WORKSHOP', px: WORKSHOP.x0, py: (WORKSHOP.y0 + WORKSHOP.y1) / 2, deg: 0, w: WORKSHOP.door - 2 * M, h0: TOP + M, h1: TOP + WORKSHOP.door - M, points: 500 });
  const t = TORII[2];
  const run = (STEPS.y1 - STEPS.y0) / STEPS.n;
  const rise = 12 / STEPS.n;
  const under = TOP + rise * (Math.floor((t.py - STEPS.y0) / run) + 1);
  const base = TOP + rise * Math.ceil((t.py - STEPS.y0) / run);
  out.push({ name: 'TORII STEPS', px: (STEPS.x0 + STEPS.x1) / 2, py: t.py, deg: 90, w: t.w - 0.4 - 2 * M, h0: under + M, h1: base + t.h - 0.9 - M, points: 250 });
  return out;
}

/* Under the rope between the wedded rocks: flown across the line between
 * their middles, at the middle of the water between them. */
function weddedGap(M) {
  const [a, b] = WEDDED;
  const dx = b.px - a.px;
  const dy = b.py - a.py;
  const L = Math.sqrt(dx * dx + dy * dy);
  const ra = a.r * 1.12 + 0.6;
  const rb = b.r * 1.12 + 0.6;
  const clear = L - ra - rb;
  const t = (ra + clear / 2) / L;
  const px = a.px + dx * t;
  const py = a.py + dy * t;
  /* The rope's lowest point over the window: the sag's parabola at the
   * window's share of the rope's length. */
  const u = (px - ROPE.a[0]) / (ROPE.b[0] - ROPE.a[0]);
  const z = ROPE.a[2] + (ROPE.b[2] - ROPE.a[2]) * u - 4 * ROPE.sag * u * (1 - u);
  return { name: 'WEDDED ROCKS', px, py, deg: 101, w: clear - 2 * M, h0: 0.6, h1: z - ROPE.r - M, points: 1000 };
}

/* Between the two tall stacks, flown in toward the island. */
function stacksGap(M) {
  const [a, b] = STACKS;
  const dx = b.px - a.px;
  const dy = b.py - a.py;
  const L = Math.sqrt(dx * dx + dy * dy);
  const ra = a.r * 1.12 + 0.6;
  const rb = b.r * 1.12 + 0.6;
  const clear = L - ra - rb;
  const t = (ra + clear / 2) / L;
  return { name: 'THE STACKS', px: a.px + dx * t, py: a.py + dy * t, deg: 65, w: clear - 2 * M, h0: 0.6, h1: 9.0, points: 1000 };
}

/* The title camera's tour: round the island at a height, looking in. */
export function tourPoints() {
  return [
    [236, 60, 40], [330, 40, 30], [420, 150, 36], [380, 300, 44], [250, 340, 50],
    [100, 330, 40], [-10, 220, 34], [40, 90, 30], [150, 80, 26],
  ];
}
