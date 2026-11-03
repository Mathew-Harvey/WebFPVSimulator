/*
 * plan.js: Yumeboshi Land whole. Builds the park from its parts
 * (./grounds.js, ./fair.js, ./coaster.js) into one structure for the
 * built map's pipeline, and says what a map document says about it: where
 * the pilot starts, the named gaps, the partners' banners and the hidden
 * sign. Pure, as ./frame.js is, so scripts/yume-check.js can build it in
 * Node.
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

import {
  Land, worldAt, wx, wz, W, D, chunkOf,
} from './frame.js';
import {
  grounds, GATE, CASTLE, STATION, MOUNTAIN, HAUNT, BANNERS, BANNER, HIDDEN_SIGN, PLAZA,
} from './grounds.js';
import { fair } from './fair.js';
import {
  coasterParts, coasterLine, supports, pieceIndex, pieceSpan, RAIL_R, SPINE_DOWN, SPINE_R,
} from './coaster.js';
import { TEACUPS, SHIP } from './rides.js';
import { partsOf } from '../../props/catalog.js';
import {
  PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn,
} from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';

export {
  W, D, worldAt, chunkOf, wx, wz,
};

/* The scaled assets' parts in the world frame, solid and never drawn, as
 * Hinode Park's scaledParts (../park/plan.js). */
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

/* The brands on the roster that show here, one to a banner. */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'yume'));

function banner(T, b) {
  const hw = BANNER.w / 2;
  const t = 0.1;
  const top = BANNER.lift + BANNER.h;
  const o = { kind: 'wall', name: 'banner' };
  if (b.face === 's') {
    T.box('ymWhite', b.px - hw, b.py - t, BANNER.lift, b.px + hw, b.py, top, o);
  } else {
    T.box('ymWhite', b.px - hw, b.py, BANNER.lift, b.px + hw, b.py + t, top, o);
  }
}

/* Each brand's sign on its banner's face, as the pipeline's markSpots
 * take them, and the hidden one. */
export function yumeMarkSpots() {
  const spots = BRANDS.slice(0, BANNERS.length).map((brand, i) => {
    const b = BANNERS[i];
    const out = b.face === 's' ? -1 : 1;
    const py = b.py + out * (0.1 + 0.005);
    const [x, y, z] = worldAt(b.px, py, BANNER.lift + BANNER.h / 2);
    const w = Math.min(BANNER.w - 0.3, (BANNER.h - 0.2) * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: [0, 0, -out], up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  });
  const konex = BRANDS.find((b) => b.slug === 'konexdrone');
  if (konex) {
    const { px, py, h, w } = HIDDEN_SIGN;
    const [x, y, z] = worldAt(px - 0.015, py, h);
    spots.push({ slug: konex.slug, key: 'yume#konexdrone~hidden', p: [x, y, z], n: [-1, 0, 0], up: [0, 1, 0], w, chunk: chunkOf(x, z) });
  }
  return spots;
}

/* The land: { parts, T }. */
let LAYOUT = null;
export function yumeLayout() {
  if (LAYOUT) {
    return LAYOUT;
  }
  const T = new Land();
  grounds(T);
  fair(T);
  coasterParts(T);
  for (const b of BANNERS.slice(0, BRANDS.length)) {
    banner(T, b);
  }
  const parts = [...T.P.list];
  T.scaled.forEach((a, i) => {
    a.el.id = `yume-${i + 1}`;
    parts.push(...scaledParts(a));
  });
  LAYOUT = { parts, T };
  return LAYOUT;
}

/* Where the pilot starts: in the entrance plaza, facing north through the
 * gate, up the main street to the carousel and the castle beyond. */
export const SPAWN = { px: GATE.px, py: PLAZA.y0 + 7, h: 0.03, yaw: Math.PI / 2 };

/* The loop's middle: the mean of its samples, which go round it evenly. */
export function loopCentre() {
  const L = coasterLine();
  const k = pieceIndex('loop');
  let n = 0;
  const c = [0, 0, 0];
  for (let i = 0; i < L.n; i += 1) {
    if (L.piece[i] === k) {
      c[0] += L.p[3 * i];
      c[1] += L.p[3 * i + 1];
      c[2] += L.p[3 * i + 2];
      n += 1;
    }
  }
  return c.map((v) => v / n);
}

/* Two supports of the lift a bay apart, for the gap under it. */
function liftBay() {
  const [a, b] = pieceSpan('lift');
  const cols = supports().filter((c) => c.s > a + 10 && c.s < b - 10 && !c.arm);
  const k = Math.floor(cols.length / 2) - 1;
  return [cols[k], cols[k + 1]];
}

/* The line's lowest point between two plan y's on the lift, its underside
 * there. */
function liftUnderside(y0, y1) {
  const L = coasterLine();
  let lo = Infinity;
  for (let i = 0; i < L.n; i += 1) {
    const py = L.p[3 * i + 1];
    const px = L.p[3 * i];
    if (py >= y0 && py <= y1 && Math.abs(px - STATION.track) < 2) {
      lo = Math.min(lo, L.p[3 * i + 2] - SPINE_DOWN - SPINE_R);
    }
  }
  return lo;
}

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of its window's middle in the plan, the heading flown in whole degrees,
 * its clear width and the bottom and top of its clear height, inside the
 * opening by M.
 */
export function yumeGaps() {
  const M = 0.3;
  const loop = loopCentre();
  const [c0, c1] = liftBay();
  const liftLo = liftUnderside(c0.py, c1.py);
  /* The teacups' pavilion: the two posts either side of due south. */
  const postSC = sincos((2 * Math.PI * 3.5) / TEACUPS.posts + Math.PI / 2, { s: 0, c: 1 });
  const teaY = TEACUPS.py + TEACUPS.postR * postSC.s;
  const teaHalf = Math.abs(TEACUPS.postR * postSC.c);
  const shipHull = SHIP.axle - SHIP.arm + SHIP.hullUp - SHIP.hullHalf;
  return [
    {
      name: 'FRONT GATE', px: GATE.px, py: (GATE.y0 + GATE.y1) / 2, deg: 90, w: GATE.open - 2 * M, h0: M, h1: GATE.h - M, points: 250,
    },
    {
      name: 'CASTLE GATE', px: (CASTLE.x0 + CASTLE.x1) / 2, py: (CASTLE.y0 + CASTLE.y1) / 2, deg: 90, w: CASTLE.archW - 2 * M, h0: M, h1: CASTLE.spring - M, points: 500,
    },
    {
      name: 'THROUGH THE STATION', px: STATION.track, py: (STATION.y0 + STATION.y1) / 2, deg: 90, w: STATION.x1 - STATION.x0 - 0.6 - 0.44 - 2 * M, h0: STATION.platform + M, h1: STATION.roof - M, points: 500,
    },
    {
      name: "DRAGON'S MOUTH", px: (MOUNTAIN.bore0 + MOUNTAIN.bore1) / 2, py: MOUNTAIN.y1 + 1.5, deg: 270, w: MOUNTAIN.bore1 - MOUNTAIN.bore0 - 2 * M, h0: 2.7 + RAIL_R + 0.1 + M, h1: MOUNTAIN.boreH - 0.5 - M, points: 1000,
    },
    {
      name: 'THE LOOP', px: loop[0], py: loop[1], deg: 90, w: 14, h0: loop[2] - 7, h1: loop[2] + 7, points: 1000,
    },
    {
      name: 'UNDER THE LIFT', px: STATION.track, py: (c0.py + c1.py) / 2, deg: 0, w: Math.abs(c1.py - c0.py) - c0.r - c1.r - 2 * M, h0: M, h1: liftLo - M, points: 500,
    },
    {
      name: 'TEACUP ROOF', px: TEACUPS.px, py: teaY, deg: 90, w: 2 * teaHalf - 2 * 0.26 - 2 * M, h0: M, h1: TEACUPS.roof - 0.28 - M, points: 250,
    },
    {
      name: 'HAUNTED HOUSE', px: HAUNT.x1, py: (HAUNT.door[0] + HAUNT.door[1]) / 2, deg: 180, w: HAUNT.door[1] - HAUNT.door[0] - 2 * M, h0: M, h1: HAUNT.doorH - M, points: 1000,
    },
    {
      name: 'HAUNTED HOUSE EXIT', px: (HAUNT.turnX[0] + HAUNT.turnX[1]) / 2, py: HAUNT.y1, deg: 90, w: HAUNT.turnX[1] - HAUNT.turnX[0] - 2 * M, h0: M, h1: HAUNT.doorH - M, points: 500,
    },
    {
      name: 'UNDER THE SHIP', px: SHIP.px, py: SHIP.py, deg: 90, w: 7.2, h0: 0.9 + M, h1: shipHull - M, points: 500,
    },
  ];
}

/* The title camera's tour: round the park at a height, looking in. */
export function tourPoints() {
  return [
    [SPAWN.px, 40, 20], [240, 90, 34], [300, 160, 40], [240, 240, 36], [150, 250, 30], [70, 220, 34], [40, 120, 28], [110, 40, 26],
  ];
}
