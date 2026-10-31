/*
 * plan.js: Hinode Park whole. Builds the park from its parts (./grounds.js,
 * ./ballfield.js, ./pond.js, ./play.js) into one structure for the built
 * map's pipeline, and says what a map document says about it: where the
 * pilot starts, the named gaps, the partners' banners, the hidden sign,
 * the lane the cars drive. Pure, as ./frame.js is, so scripts/park-check.js
 * can build it in Node.
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

import { Park, faceFrame, worldAt, wx, wz, W, D, chunkOf } from './frame.js';
import { grounds, LANE, CROSS, PARK, TORII } from './grounds.js';
import { ballfield, FENCE, GATE_1B, GATE_3B, DUGOUT_1B, DUGOUT_3B, SCOREBOARD } from './ballfield.js';
import { pond, BRIDGE, soffitAt } from './pond.js';
import { playground, OCTOPUS, SWINGS, HIDDEN_SIGN } from './play.js';
import { partsOf } from '../../props/catalog.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';

export { W, D, worldAt, chunkOf };

/* The scaled assets' parts in the world frame, solid and never drawn, as
 * Sunnyfield's scaledParts (../sunny/plan.js). */
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
 * THE BANNERS on the outfield fence, one for each brand on the roster
 * that shows here, as a ward ground's fence carries the local sponsors'
 * boards: a panel on the fence's inside face, solid as the fence is,
 * the brand painted on it by the pipeline (`markSpots`, ../built/index.js).
 */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'park'));
const BANNER = { w: 4.6, h: 1.5, lift: 0.5 };
const BANNERS = [
  { px: FENCE.x1, py: 108, face: 'w' },
  { px: 196, py: FENCE.y1, face: 's' },
  { px: FENCE.x1, py: 124, face: 'w' },
  { px: 180, py: FENCE.y1, face: 's' },
  { px: FENCE.x1, py: 140, face: 'w' },
  { px: 164, py: FENCE.y1, face: 's' },
  { px: FENCE.x1, py: 156, face: 'w' },
  { px: 206, py: FENCE.y1, face: 's' },
  { px: FENCE.x1, py: 98, face: 'w' },
  { px: 172, py: FENCE.y1, face: 's' },
];

function banner(T, b) {
  const hw = BANNER.w / 2;
  const t = 0.08;
  const top = BANNER.lift + BANNER.h;
  if (b.face === 'w') {
    T.box('pkSwan', b.px - 0.04 - t, b.py - hw, BANNER.lift, b.px - 0.04, b.py + hw, top, { kind: 'wall', name: 'banner' });
  } else {
    T.box('pkSwan', b.px - hw, b.py - 0.04 - t, BANNER.lift, b.px + hw, b.py - 0.04, top, { kind: 'wall', name: 'banner' });
  }
}

/* Each brand's sign on its banner's face, as the pipeline's markSpots
 * take them: { slug, p, n, up, w, chunk } in the world. */
export function parkMarkSpots() {
  return BRANDS.slice(0, BANNERS.length).map((brand, i) => {
    const b = BANNERS[i];
    const out = b.face === 'w' ? [-1, 0] : [0, -1];
    const px = b.px + out[0] * (0.12 + 0.005);
    const py = b.py + out[1] * (0.12 + 0.005);
    const [x, y, z] = worldAt(px, py, BANNER.lift + BANNER.h / 2);
    const w = Math.min(BANNER.w - 0.3, (BANNER.h - 0.2) * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: [out[0], 0, -out[1]], up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  }).concat(hiddenMarkSpots());
}

/* The one hidden Konex Drone sign, inside the octopus (./play.js
 * HIDDEN_SIGN): on the through tunnel's north wall, facing south down the
 * stub from the octopus's south face, a centimetre and a half off the
 * wall. Its own key, since the banner holds the brand's. */
function hiddenMarkSpots() {
  const brand = BRANDS.find((b) => b.slug === 'konexdrone');
  if (!brand) {
    return [];
  }
  const { px, py, h, w } = HIDDEN_SIGN;
  const [x, y, z] = worldAt(px, py - 0.015, h);
  return [{ slug: brand.slug, key: 'park#konexdrone~hidden', p: [x, y, z], n: [0, 0, 1], up: [0, 1, 0], w, chunk: chunkOf(x, z) }];
}

/* The park: { parts, T }. */
export function parkLayout() {
  const T = new Park();
  grounds(T);
  ballfield(T, faceFrame);
  pond(T);
  playground(T);
  for (const b of BANNERS.slice(0, Math.max(BRANDS.length, 0))) {
    banner(T, b);
  }
  const parts = [...T.P.list];
  T.scaled.forEach((a, i) => {
    a.el.id = `park-${i + 1}`;
    parts.push(...scaledParts(a));
  });
  return { parts, T };
}

/* Where the pilot starts: on the cross path inside the south gate, facing
 * north up it to the plaza's clock, the pond's bridge off to the left and
 * the ball ground's backstop to the right. */
export const SPAWN = { px: (CROSS.x0 + CROSS.x1) / 2, py: PARK.y0 + 10, h: 0.03, yaw: Math.PI / 2 };

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of its window's middle in the plan, the heading flown in whole degrees,
 * its clear width and the bottom and top of its clear height, inside the
 * opening by M.
 */
export function parkGaps() {
  const M = 0.3;
  const poleR = 0.16;
  const gateW = GATE_1B.x1 - GATE_1B.x0 - 2 * poleR - 2 * M;
  const d1 = DUGOUT_1B;
  const d3 = DUGOUT_3B;
  const benchFront1 = d1.y0 + 0.42;
  const front1 = d1.y1 - 0.0;
  const benchFront3 = d3.x0 + 0.42;
  const front3 = d3.x1;
  const O = OCTOPUS;
  const S = SWINGS;
  const sb = SCOREBOARD;
  const torii = TORII[1];
  const under = soffitAt(2.5);
  return [
    { name: 'BACKSTOP GAP', px: (GATE_1B.x0 + GATE_1B.x1) / 2, py: GATE_1B.py, deg: 90, w: gateW, h0: M, h1: GATE_1B.h - M, points: 500 },
    { name: 'THIRD BASE GATE', px: GATE_3B.px, py: (GATE_3B.y0 + GATE_3B.y1) / 2, deg: 0, w: gateW, h0: M, h1: GATE_3B.h - M, points: 500 },
    { name: 'DUGOUT STRAFE', px: d1.x0, py: (benchFront1 + front1) / 2, deg: 0, w: front1 - benchFront1 - 2 * M, h0: M, h1: d1.roof - M, points: 1000 },
    { name: 'THIRD BASE DUGOUT', px: (benchFront3 + front3) / 2, py: d3.y0, deg: 90, w: front3 - benchFront3 - 2 * M, h0: M, h1: d3.roof - M, points: 1000 },
    { name: 'UNDER THE SCOREBOARD', px: (sb.x0 + sb.x1) / 2, py: sb.py, deg: 90, w: sb.x1 - sb.x0 - 2.4 - 2 * 0.18 - 2 * M, h0: M, h1: sb.lift - 0.12 - M, points: 250 },
    { name: 'DRUM BRIDGE', px: BRIDGE.px, py: BRIDGE.py, deg: 90, w: 5, h0: 0.35, h1: under - M, points: 1000 },
    { name: 'OCTOPUS TUNNEL', px: O.px - O.half, py: O.py, deg: 0, w: 2 * O.tunnel - 2 * M, h0: M, h1: O.tunnelH - M, points: 1000 },
    { name: 'SWING SET', px: S.x0 + S.bay / 2, py: S.py, deg: 90, w: S.bay - 2 * 0.07 - 2 * M, h0: 0.6, h1: S.h - 0.08 - M, points: 500 },
    { name: 'TORII', px: torii.px, py: torii.py, deg: 0, w: torii.w - 2 * 0.16 - 2 * M, h0: M, h1: torii.h - 0.95 - M, points: 250 },
  ];
}

/* The lane's loop for the cars, anticlockwise, two lanes kept left. */
export function trafficLoops() {
  return [{
    name: 'The lane round the park',
    nodes: [[LANE.x0, LANE.y0], [LANE.x1, LANE.y0], [LANE.x1, LANE.y1], [LANE.x0, LANE.y1]],
    radius: 6,
  }];
}

/* The poles along the lane's outer verge, every 28 m or so: the
 * document's utility poles, so the built map strings the wires. */
export function polePoints() {
  const h = LANE.w / 2 + 0.45;
  const out = [];
  const run = (a, b, fixed, alongX) => {
    const n = Math.round((b - a) / 28);
    for (let i = 0; i <= n; i += 1) {
      const s = a + ((b - a) * i) / n;
      out.push(alongX ? [s, fixed] : [fixed, s]);
    }
  };
  run(LANE.x0 - h, LANE.x1 + h, LANE.y0 - h, true);
  run(LANE.x0 - h, LANE.x1 + h, LANE.y1 + h, true);
  run(LANE.y0 - h + 28, LANE.y1 + h - 28, LANE.x0 - h, false);
  run(LANE.y0 - h + 28, LANE.y1 + h - 28, LANE.x1 + h, false);
  return out;
}

/* The title camera's tour: round the park at a height, looking in. */
export function tourPoints() {
  return [
    [SPAWN.px, 40, 18], [150, 60, 26], [200, 120, 34], [180, 160, 30], [120, 150, 28], [70, 120, 24],
    [50, 70, 22], [90, 40, 20],
  ];
}

export { wx, wz };
