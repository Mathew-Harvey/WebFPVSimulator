/*
 * layout.js: Hayate Circuit, the whole place, as the built map's pipeline
 * takes it: the parts (solid and drawn from the same numbers), the draw
 * ops and the signs ./index.js paints over them, the named gaps, where the
 * pilot starts, and where the partners' marks are hung. Pure, and the same
 * every call to the bit: scripts/hayate-check.js builds it twice and
 * compares.
 *
 * WHAT IT IS, and where it came from. An international road circuit in
 * the Japanese hills in autumn, our own, built from how the real ones are
 * laid out (Suzuka, Fuji, Motegi, Okayama, Sugo, Tsukuba, read off their
 * aerial photographs and the FIA's circuit guidance) and not from any
 * game's: a pit building with garages you can fly through and a control
 * tower at its end, a covered main stand opposite, a footbridge and a
 * tyre bridge over the track, a Ferris wheel in the infield, a shrine in
 * the cedars, red maples everywhere, and a snow capped volcano on the
 * horizon. GT cars lap it all day (./traffic.js), and they are the cars a
 * pilot chases.
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

import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import {
  w, px, py, cellAt, chunkOf,
} from './frame.js';
import { makePlan } from './plan.js';
import { trackFurniture, SOUTH_WALL, PIT_WALL } from './track.js';
import {
  pitComplex, PIT, PAD, TOWER, STANDS,
} from './pits.js';
import {
  standsAndBridges, MAIN, BRIDGE, TYRE, TYRE_HOLE, GANTRY, CHICANE,
} from './stands.js';
import {
  parkAndEdges, wheelWindow, TAIKO, GATE,
} from './park.js';

export const HAYATE_NAME = 'Hayate Circuit';

/*
 * THE BILLBOARDS, one for each brand on the roster that shows here, each
 * a board on two legs high enough to fly under, facing a stretch of track
 * a pilot flies. The pipeline paints the brand's sign on its face
 * (`markSpots` in ../built/index.js), found and stamped as on every
 * freestyle map, one draw call a sign.
 */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'hayate'));
const BOARD = { w: 6.4, h: 3.2, t: 0.3, lift: 3.8 };
const BILLBOARDS = [
  { px: 150, py: 150, face: 'w' },
  { px: 250, py: 352, face: 'n' },
  { px: 386, py: 352, face: 'n' },
  { px: 530, py: 300, face: 'e' },
  { px: 527, py: 236, face: 'e' },
  { px: 122, py: 330, face: 'w' },
  { px: 604, py: 40, face: 'w' },
  { px: 440, py: 402, face: 's' },
];
const OUT = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] };

function billboard(T, b) {
  const alongX = b.face === 's' || b.face === 'n';
  const hw = BOARD.w / 2;
  const ht = BOARD.t / 2;
  const [x0, x1, y0, y1] = alongX ? [b.px - hw, b.px + hw, b.py - ht, b.py + ht] : [b.px - ht, b.px + ht, b.py - hw, b.py + hw];
  const top = BOARD.lift + BOARD.h;
  T.box('white', x0, y0, BOARD.lift, x1, y1, top, { kind: 'wall', name: 'billboard' });
  T.deco('hyInk', x0 - 0.08, y0 - 0.08, top - 0.12, x1 + 0.08, y1 + 0.08, top + 0.05);
  T.deco('hyInk', x0 - 0.08, y0 - 0.08, BOARD.lift - 0.05, x1 + 0.08, y1 + 0.08, BOARD.lift + 0.1);
  for (const s of [-1, 1]) {
    const [lx, ly] = alongX ? [b.px + s * (hw - 1.2), b.py] : [b.px, b.py + s * (hw - 1.2)];
    T.post('metal', lx, ly, 0, BOARD.lift, 0.16, { kind: 'pole', name: 'billboard leg' });
  }
}

function markSpots() {
  return BRANDS.slice(0, BILLBOARDS.length).map((brand, i) => {
    const b = BILLBOARDS[i];
    const out = OUT[b.face];
    const px = b.px + out[0] * (BOARD.t / 2);
    const py = b.py + out[1] * (BOARD.t / 2);
    const [x, y, z] = w(px, py, BOARD.lift + BOARD.h / 2);
    const wd = Math.min(BOARD.w - 0.6, 2.8 * signAspect(brand));
    return {
      slug: brand.slug, p: [x, y, z], n: [out[0], 0, -out[1]], up: [0, 1, 0], w: wd, chunk: chunkOf(x, z),
    };
  }).concat(hiddenMarkSpots());
}

/*
 * THE ONE HIDDEN KONEX DRONE SIGN (the owner's promise of a logo hidden in
 * every map): on the wall of the tunnel through the west main stand's
 * base, 1.8 m up, half way along the tunnel, where only a pilot who flies
 * the tunnel sees it. Its own key, because a billboard holds the brand's.
 */
export const HIDDEN_KONEX = { x: MAIN.tunnels[0] - MAIN.tunnelW / 2 + 0.02, y: 41, h: 1.7 };
function hiddenMarkSpots() {
  const brand = BRANDS.find((b) => b.slug === 'konexdrone');
  if (!brand) {
    return [];
  }
  const [x, y, z] = w(HIDDEN_KONEX.x, HIDDEN_KONEX.y, HIDDEN_KONEX.h);
  return [{
    slug: brand.slug, key: 'hayate#konexdrone~hidden', p: [x, y, z], n: [1, 0, 0], up: [0, 1, 0], w: 1.2, chunk: chunkOf(x, z),
  }];
}

/*
 * THE NAMED GAPS. Each is the window's sill middle in the plan, `deg` the
 * way its normal points (0 east, 90 north), its width across that normal
 * and its sill and head heights, every one clear of every solid by the
 * craft's radius (scripts/hayate-check.js proves it).
 */
export function hayateGaps() {
  const M = MAIN;
  const backRow = M.front - M.rows * M.depth;
  const wheel = wheelWindow();
  const tyreSide = (TYRE_HOLE.r - 0.25) * 1.2;
  return [
    {
      name: 'UNDER THE BRIDGE', px: BRIDGE.x, py: 68.5, deg: 0, w: 19.4, h0: 0.3, h1: BRIDGE.h - 0.3, points: 250,
    },
    {
      name: 'START GANTRY', px: GANTRY.x, py: (GANTRY.y0 + GANTRY.y1) / 2, deg: 0, w: GANTRY.y1 - GANTRY.y0 - 1.3, h0: 0.3, h1: GANTRY.h0 - 1.9, points: 250,
    },
    {
      name: 'GARAGE RUN', px: PIT.x0 + PIT.bay + 5, py: PIT.y1 - 0.2, deg: 90, w: 4.4, h0: 0.3, h1: 3.9, points: 500,
    },
    {
      name: 'TOWER ALLEY', px: (TOWER.x1 + PIT.x0 - 0.6) / 2, py: 102, deg: 90, w: PIT.x0 - 0.6 - TOWER.x1 - 0.8, h0: 0.3, h1: PIT.roof - 0.4, points: 250,
    },
    {
      name: 'ROOF GAP', px: 306, py: M.back + 2, deg: 90, w: 14, h0: M.wall + 0.3, h1: M.roof0 - 0.3, points: 1000,
    },
    {
      name: 'STAND CANYON', px: (M.gap0 + M.gap1) / 2, py: 50, deg: 90, w: M.gap1 - M.gap0 - 1.4, h0: 0.3, h1: M.roof0 - 0.6, points: 250,
    },
    {
      name: 'TUNNEL A', px: M.tunnels[0], py: (M.back + backRow - 0.4) / 2, deg: 90, w: M.tunnelW - 0.6, h0: 0.3, h1: M.tunnelH - 0.3, points: 1000,
    },
    {
      name: 'TUNNEL B', px: M.tunnels[1], py: (M.back + backRow - 0.4) / 2, deg: 90, w: M.tunnelW - 0.6, h0: 0.3, h1: M.tunnelH - 0.3, points: 1000,
    },
    {
      name: 'TYRE BRIDGE', px: TYRE.x, py: (TYRE.y0 + TYRE.y1) / 2, deg: 0, w: TYRE.y1 - TYRE.y0 - 5.0, h0: 1.4, h1: TYRE.h - 0.3, points: 250,
    },
    {
      name: 'THROUGH THE TYRE', px: TYRE.x, py: TYRE_HOLE.y, deg: 0, w: tyreSide, h0: TYRE_HOLE.h - tyreSide / 2, h1: TYRE_HOLE.h + tyreSide / 2, points: 1000,
    },
    {
      name: 'SKY WHEEL', px: wheel.px, py: wheel.py, deg: 90, w: wheel.w, h0: wheel.h0, h1: wheel.h1, points: 1000,
    },
    {
      name: 'SCAFFOLD', px: 608.6, py: (CHICANE.y0 + CHICANE.y1) / 2, deg: 90, w: 2.3, h0: 0.3, h1: 3.35, points: 500,
    },
    {
      name: 'TAIKOBASHI', px: TAIKO.x, py: (TAIKO.y0 + TAIKO.y1) / 2, deg: 0, w: 4, h0: 0.3, h1: 2.6, points: 250,
    },
    {
      name: 'THE GATE', px: GATE.x, py: GATE.y, deg: 0, w: GATE.w - 0.6, h0: 0.3, h1: GATE.h - 0.3, points: 100,
    },
    {
      name: 'PIT WALL', px: STANDS[6] ? STANDS[6].x : 334, py: 81.25, deg: 0, w: 3.0, h0: 0.3, h1: 2.65, points: 250,
    },
  ];
}

/* Where the pilot starts: the pit roof over the line, facing the stand. */
export const SPAWN = { px: PAD.x, py: PAD.y, h: PAD.h, yaw: -Math.PI / 2 };

let CACHE = null;

/* The place, built once a page and shared: { parts, ops, signs, gaps,
 * markSpots, keep }. `keep` is every solid's plan rectangle, for the
 * trees (./yard.js). */
export function hayateLayout() {
  if (CACHE) {
    return CACHE;
  }
  const T = makePlan();
  trackFurniture(T);
  pitComplex(T);
  standsAndBridges(T);
  parkAndEdges(T);
  for (const b of BILLBOARDS) {
    billboard(T, b);
  }
  const keep = [];
  for (const p of T.P.list) {
    if (!p.solid) {
      continue;
    }
    const lo = p.t === 'box' ? p.lo : [Math.min(p.a[0], p.b[0]) - p.r, 0, Math.min(p.a[2], p.b[2]) - p.r];
    const hi = p.t === 'box' ? p.hi : [Math.max(p.a[0], p.b[0]) + p.r, 0, Math.max(p.a[2], p.b[2]) + p.r];
    keep.push({
      x0: px(lo[0]), x1: px(hi[0]), y0: py(hi[2]), y1: py(lo[2]),
    });
  }
  CACHE = {
    parts: T.P.list, ops: T.ops, signs: T.signs, gaps: hayateGaps(), markSpots: markSpots(), keep,
  };
  return CACHE;
}

export {
  SOUTH_WALL, PIT_WALL, cellAt,
};
