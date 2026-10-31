/*
 * plan.js: Hyoura Island put together. The land's cliff solids (./terrain.js),
 * the sea's ice and rock (./sea.js), the hamlet (./hamlet.js) and the land
 * above it (./cape.js) into one Isle, and from it the parts the built map
 * places, the named gaps, the boards the partners' signs hang on, the start
 * and the title camera's tour. Pure: Node builds it for the check.
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

import { Isle, chunkOf } from './frame.js';
import { rimSolids, groundAt, QUAY_TOP, HAMLET_H, GX0, GZ0, CELL, GROTTO, LIGHTHOUSE } from './terrain.js';
import { seaLayout, ARCH, TWINS, SEA_ARCH, NEEDLE, FALLS } from './sea.js';
import { hamletLayout, PIER, NET_SHED, LIGHTS } from './hamlet.js';
import { capeLayout, TORII, TOWER } from './cape.js';
import { partsOf } from '../../props/catalog.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { quarterTurns, quarterSinCos } from '../../props/trig.js';

/*
 * THE BOARDS the partners' signs hang on: harbour boards on the
 * breakwaters, facing into the harbour, on two legs a craft can fly
 * between. Each is { x, z, face } on the arm's top; `face` is the way its
 * sign looks.
 */
const BOARD = { w: 5.2, h: 2.6, t: 0.3, lift: 2.4, top: 4 };
const BOARDS = [
  { x: 129.2, z: 112, face: '-x' }, { x: 129.2, z: 128, face: '-x' }, { x: 129.2, z: 144, face: '-x' },
  { x: 26.8, z: 112, face: '+x' }, { x: 26.8, z: 128, face: '+x' }, { x: 26.8, z: 142, face: '+x' },
  { x: 40, z: 150.2, face: '-z' }, { x: 116, z: 166.2, face: '-z' },
];

function boards(I) {
  for (const b of BOARDS) {
    const alongZ = b.face === '-x' || b.face === '+x';
    const hw = BOARD.w / 2;
    const ht = BOARD.t / 2;
    const out = { '-x': [-1, 0], '+x': [1, 0], '-z': [0, -1], '+z': [0, 1] }[b.face];
    const cx = b.x + out[0] * ht * 3;
    const cz = b.z + out[1] * ht * 3;
    const [x0, x1, z0, z1] = alongZ ? [cx - ht, cx + ht, cz - hw, cz + hw] : [cx - hw, cx + hw, cz - ht, cz + ht];
    const y0 = BOARD.top + BOARD.lift;
    I.box('arWhite', x0, y0, z0, x1, y0 + BOARD.h, z1, { kind: 'wall', name: 'harbour board' });
    I.deco('arIron', x0 - 0.06, y0 + BOARD.h - 0.1, z0 - 0.06, x1 + 0.06, y0 + BOARD.h + 0.06, z1 + 0.06);
    I.paint('arSnow', x0 - 0.04, y0 + BOARD.h + 0.06, z0 - 0.04, x1 + 0.04, y0 + BOARD.h + 0.2, z1 + 0.04);
    for (const s of [-1, 1]) {
      const [px, pz] = alongZ ? [cx, cz + s * (hw - 0.6)] : [cx + s * (hw - 0.6), cz];
      I.post('arSteel', px, pz, BOARD.top, y0, 0.12, { kind: 'pole', name: 'board leg' });
    }
  }
}

/* The brands that show on this map, partners first, as the roster lists. */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'arctic'));

/* Each brand's sign on its board's face, as the pipeline's markSpots take
 * them, and the one hidden Konex Drone sign at the back of the grotto. */
export function arcticMarkSpots(allowed = () => true) {
  const spots = BRANDS.filter((b) => allowed(b.slug)).slice(0, BOARDS.length).map((brand, i) => {
    const b = BOARDS[i];
    const out = { '-x': [-1, 0, 0], '+x': [1, 0, 0], '-z': [0, 0, -1], '+z': [0, 0, 1] }[b.face];
    const ht = BOARD.t / 2;
    const x = b.x + out[0] * ht * 4;
    const z = b.z + out[2] * ht * 4;
    const y = BOARD.top + BOARD.lift + BOARD.h / 2;
    const w = Math.min(BOARD.w - 0.5, (BOARD.h - 0.3) * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: out, up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  });
  const konex = BRANDS.find((b) => b.slug === 'konexdrone');
  if (konex && allowed(konex.slug)) {
    const { p, n, w } = HIDDEN_KONEX;
    spots.push({ slug: konex.slug, key: 'arctic#konexdrone~hidden', p: [...p], n: [...n], up: [0, 1, 0], w, chunk: chunkOf(p[0], p[2]) });
  }
  return spots;
}

/* The grotto's back wall, the face of the land at its south end, looking
 * north at the falls; 4.6 m up, in the middle of the 6 m back wall. */
const GROTTO_BACK = GZ0 + (GROTTO.j1 + 1) * CELL;
export const HIDDEN_KONEX = {
  p: [GX0 + (GROTTO.i0 + 1) * CELL, 4.6, GROTTO_BACK],
  n: [0, 0, -1],
  w: 1.6,
};

/* An element of the builder's, drawn by the kit and solid by its own parts
 * turned and moved into the world: the vending machines. */
function assetParts(a) {
  const parts = partsOf(a.el);
  const q = { s: 0, c: 1 };
  quarterSinCos(quarterTurns(a.yaw), q);
  const { s, c } = q;
  const turn = (p) => [a.x + p[0] * c + p[2] * s, a.y + p[1], a.z - p[0] * s + p[2] * c];
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
        t: 'cap', m: p.m, a: turn(p.a), b: turn(p.b), r: p.r, solid: true, draw: false,
        kind: p.kind, look: p.look, seg: p.seg, rTop: null, name: p.name, cast: false,
      });
    }
  }
  return out;
}

/* The island: { parts, I, stats }. Cached, since the map and its check and
 * the gaps all ask for it. */
let LAYOUT = null;
export function arcticLayout() {
  if (LAYOUT) {
    return LAYOUT;
  }
  const I = new Isle();
  const rim = rimSolids(I.P);
  const sea = seaLayout(I);
  hamletLayout(I);
  boards(I);
  const cape = capeLayout(I);
  const parts = [...I.P.list];
  I.assets.forEach((a, i) => {
    a.el.id = `arctic-${i + 1}`;
    parts.push(...assetParts(a));
  });
  LAYOUT = { parts, I, stats: { rim, ...sea, ...cape } };
  return LAYOUT;
}

/* The ground the plant is given where no box top is under the craft. */
export function arcticFloor(x, z) {
  return groundAt(x, z);
}

/* Where the pilot starts: on the quay, by the pier, facing east along the
 * harbour to the cape and its lighthouse, the drift ice to the right. */
export const SPAWN = { x: 48, z: 93, y: QUAY_TOP, deg: 0 };

/*
 * THE NAMED GAPS, each { name, x, z, along, w, h0, h1, points }: the foot of
 * its window's middle in the world, the axis it is flown along ('x' or
 * 'z'), its clear width and the bottom and top of its clear height,
 * inside the opening by more than the craft's radius.
 */
export function arcticGaps() {
  const tg = groundAt(TORII.x, TORII.z);
  return [
    { name: 'ICEBERG ARCH', x: (ARCH.legA.x1 + ARCH.legB.x0) / 2, z: (ARCH.span.z0 + ARCH.span.z1) / 2, along: 'z', w: ARCH.legB.x0 - ARCH.legA.x1 - 3, h0: 1.5, h1: ARCH.span.y0 - 1, points: 1000 },
    { name: 'TWIN BERGS', x: (TWINS.a.x1 + TWINS.b.x0) / 2, z: 137, along: 'z', w: TWINS.b.x0 - TWINS.a.x1 - 1.6, h0: 1.5, h1: 18, points: 500 },
    { name: 'SEA ARCH', x: (SEA_ARCH.x0 + SEA_ARCH.x1) / 2, z: (SEA_ARCH.hole0 + SEA_ARCH.hole1) / 2, along: 'x', w: SEA_ARCH.hole1 - SEA_ARCH.hole0 - 3, h0: 1.5, h1: SEA_ARCH.holeH - 1.5, points: 1000 },
    { name: 'THE NEEDLE', x: (NEEDLE.x0 + NEEDLE.x1) / 2, z: (NEEDLE.z1 - 207) / 2, along: 'x', w: -207 - NEEDLE.z1 - 1.6, h0: 2, h1: 50, points: 500 },
    { name: 'BEHIND THE FALLS', x: (FALLS.x0 + FALLS.x1) / 2, z: FALLS.face - 2.6, along: 'x', w: 3.6, h0: 1.5, h1: 40, points: 1000 },
    { name: 'THE GROTTO', x: GX0 + (GROTTO.i0 + 1) * CELL, z: FALLS.face, along: 'z', w: 2 * CELL - 0.8, h0: 0.8, h1: 8.2, points: 500 },
    { name: 'UNDER THE PIER', x: (PIER.x0 + PIER.x1) / 2, z: PIER.z1 - 2, along: 'z', w: PIER.piles[1] - PIER.piles[0] - 0.8, h0: 0.5, h1: PIER.deck0 - 0.4, points: 500 },
    { name: 'NET SHED', x: (NET_SHED.x0 + NET_SHED.x1) / 2, z: (NET_SHED.z0 + NET_SHED.z1) / 2, along: 'z', w: NET_SHED.doorW - 0.6, h0: HAMLET_H + 0.3, h1: HAMLET_H + NET_SHED.doorH - 0.3, points: 250 },
    { name: 'TORII', x: TORII.x, z: TORII.z, along: 'z', w: TORII.span - 0.42 - 0.6, h0: tg + 0.4, h1: tg + TORII.nuki - 0.3, points: 250 },
    { name: 'HARBOUR MOUTH', x: (62 + LIGHTS[0].x) / 2 - 1, z: 161, along: 'z', w: 34, h0: 0.5, h1: 12, points: 100 },
  ];
}

/* The title camera's tour: round the island at a height, looking in. */
export function tourPoints() {
  const L = LIGHTHOUSE;
  return [
    [60, 140, 22], [200, 120, 34], [L.x + 40, L.z, 70 + TOWER.h], [300, -120, 90],
    [100, -260, 120], [-60, -250, 100], [-200, -260, 150], [-360, -60, 120], [-200, 170, 50],
  ];
}
