/*
 * plan.js: Tsukimi Danchi whole. Builds the estate and its streets from
 * their parts (./danchi.js, ./annex.js, ./site.js, ./city.js, ./dress.js)
 * into one structure for the built map's pipeline, and says the things a
 * map document says about it: where the pilot starts, the named gaps, the
 * race's order and its plates, where the partners' signs hang. Pure, as
 * ./frame.js is, so scripts/haikyo-check.js can build it in Node.
 *
 * THE RACE. Twelve orange plates, numbered, beside twelve openings, in an
 * order that flies the whole estate once: in at the gate, under the swings,
 * between the tank's legs, in at a shop front and out of the annex's back
 * door, through Block 1's pilotis, down the bicycle shed, up the west stair
 * tower's outside and down its well, through the boiler house, up to the
 * roof and down the drop, through the concrete mountain and out of the gate
 * again. Every plate's opening is a named gap, so the counter pays it as it
 * is flown; the plates are what tell a pilot the order.
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
import { danchi, danchiGaps, STAIRS } from './danchi.js';
import { annex, annexGaps } from './annex.js';
import { site, siteGaps, SITE } from './site.js';
import { city, LEG_BOARDS, BOARD, VIADUCT, VIADUCT_ADS, HOARDING_ADS } from './city.js';
import { estateDressing } from './dress.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';

export { W, D, worldAt, wx, wz, chunkOf };

/* The race's plates, in order: the gap each marks, and where the plate is
 * fixed: on a face (px, py, h, face) or on a stake of its own. */
const PLATES = [
  { gap: 'THE GATE', px: 90.6, py: SITE.y0 - 0.06, h: 2.2, face: 's' },
  { gap: 'THE SWINGS', px: 78.4, py: 49.4, h: 1.6, face: 's', stake: true },
  { gap: 'THE TANK LEGS', px: 95.69, py: 74, h: 2.0, face: 'w' },
  { gap: 'THE SHOP FRONT', px: 119.74, py: 77, h: 1.6, face: 'w' },
  { gap: 'THE BACK DOOR', px: 130.9, py: 87.89, h: 1.6, face: 's' },
  { gap: 'THE PILOTIS', px: 90, py: 99.69, h: 1.5, face: 's' },
  { gap: 'THE BIKE SHED', px: 115.4, py: 112.2, h: 1.6, face: 'e', stake: true },
  { gap: 'THE STAIRWELL', px: STAIRS[0].x - 0.01, py: 113.9, h: 13.6, face: 'w' },
  { gap: 'THE BOILER HOUSE', px: 61.8, py: 70.14, h: 2.0, face: 'n' },
  { gap: 'THE DROP', px: 69, py: 107.2, h: 15.01, face: 'up' },
  { gap: 'THE MOUNTAIN', px: 75.6, py: 66.2, h: 1.4, face: 'n', stake: true },
  { gap: 'THE GATE', px: 101.2, py: SITE.y0 + 0.07, h: 2.2, face: 'n' },
];
export const RACE = PLATES.map((p) => p.gap);
const PLATE = 0.62;

function plates(T) {
  PLATES.forEach((p, i) => {
    if (p.stake) {
      T.post('metal', p.px, p.py, 0, p.h - PLATE / 2, 0.035, { name: 'plate stake' });
      const t = 0.04;
      const [x0, x1, y0, y1] = p.face === 'e' || p.face === 'w'
        ? [p.px - t, p.px + t, p.py - PLATE / 2, p.py + PLATE / 2]
        : [p.px - PLATE / 2, p.px + PLATE / 2, p.py - t, p.py + t];
      T.box('hkOrange', x0, y0, p.h - PLATE / 2, x1, y1, p.h + PLATE / 2, { name: 'race plate' });
      const off = { n: [0, t], s: [0, -t], e: [t, 0], w: [-t, 0] }[p.face];
      T.sign(`race${i + 1}`, p.px + off[0], p.py + off[1], p.h, PLATE, PLATE, p.face);
    } else {
      T.sign(`race${i + 1}`, p.px, p.py, p.h, PLATE, PLATE, p.face, 0.015);
    }
  });
}

/*
 * The estate: { parts, T }, the parts in the world frame and the builder
 * itself for everything ./index.js draws over them.
 */
export function haikyoLayout() {
  const T = new Town();
  city(T);
  site(T);
  danchi(T);
  annex(T);
  plates(T);
  estateDressing(T);
  return { parts: [...T.P.list], T };
}

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of its window's middle in the plan, the heading it is flown along in
 * whole degrees, its clear width and the bottom and top of its clear
 * height, already inside the opening by the craft's radius and more. The
 * race's eleven first, in its order, and then the rest.
 */
export function haikyoGaps() {
  const d = danchiGaps();
  const a = annexGaps();
  const s = siteGaps();
  return [
    s.gate, s.swings, a.tank, a.shop, a.back, d.pilotis, s.shed, d.stairwell, a.boiler, d.drop, s.mountain,
    d.corridor, a.strafe, a.link, a.under,
  ];
}

/* THE BRANDS that show here, each a sign: three boards on legs, three
 * panels on the viaduct's side, two on the hoarding; then the hidden one. */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'haikyo'));

function spots() {
  const out = [];
  for (const b of LEG_BOARDS) {
    const o = { s: [0, -1], n: [0, 1], e: [1, 0], w: [-1, 0] }[b.face];
    out.push({ px: b.px + o[0] * (BOARD.t / 2), py: b.py + o[1] * (BOARD.t / 2), h: BOARD.lift + BOARD.h / 2, o, wMax: BOARD.w - 0.6, hMax: 2.6 });
  }
  for (const y of VIADUCT_ADS) {
    out.push({ px: VIADUCT.x0 - 0.25, py: y, h: VIADUCT.deck + 0.9, o: [-1, 0], wMax: 6.2, hMax: 2.6 });
  }
  for (const x of HOARDING_ADS) {
    out.push({ px: x, py: SITE.y0 - 0.1, h: 1.5, o: [0, -1], wMax: 5.6, hMax: 2.2 });
  }
  return out;
}

/* Each brand's sign as the pipeline's markSpots take them: { slug, p, n,
 * up, w, chunk } in the world, `p` on the face. */
export function haikyoMarkSpots() {
  const S = spots();
  return BRANDS.slice(0, S.length).map((brand, i) => {
    const s = S[i];
    const [x, y, z] = worldAt(s.px, s.py, s.h);
    const w = Math.min(s.wMax, s.hMax * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: [s.o[0], 0, -s.o[1]], up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  }).concat(hiddenMarkSpots());
}

/*
 * THE HIDDEN KONEX DRONE SIGN (the owner's promise of a logo hidden in
 * every map): inside the drop, on the party wall of bay 3's second floor
 * flat, facing into the shaft. A pilot falling through the holes passes a
 * metre and a half from it and never sees it; one who stops in the shaft
 * on the second floor and turns west does. Its own key, because a board
 * already holds the brand's.
 */
const HIDDEN_KONEX = { px: 66.1, py: 106.6, h: 7.3, w: 1.0 };
function hiddenMarkSpots() {
  const brand = BRANDS.find((b) => b.slug === 'konexdrone');
  if (!brand) {
    return [];
  }
  const { px, py, h, w } = HIDDEN_KONEX;
  const [x, y, z] = worldAt(px, py, h);
  return [{ slug: brand.slug, key: 'haikyo#konexdrone~hidden', p: [x, y, z], n: [1, 0, 0], up: [0, 1, 0], w, chunk: chunkOf(x, z) }];
}
export { HIDDEN_KONEX };

/* Where the pilot starts: on the street outside the gate, on the zebra,
 * facing north through it. */
export const SPAWN = { px: 98, py: 23.6, h: 0.0, yaw: 90 };

/* The title camera's tour: round the estate at a height, looking in. */
export function tourPoints() {
  return [
    [98, 14, 14], [150, 40, 26], [160, 110, 30], [100, 140, 34], [40, 120, 28], [36, 50, 22],
  ];
}
