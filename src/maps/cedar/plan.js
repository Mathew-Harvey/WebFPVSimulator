/*
 * plan.js: Kodama Onsen whole. Builds the place from its parts (./ryokan.js,
 * ./shrine.js, ./forest.js) into one structure for the built map's
 * pipeline, and says the things a map document says about it: where the
 * pilot starts, the named gaps, the ground in the stream, where each
 * partner's sign hangs. Pure, as ./frame.js is, so scripts/cedar-check.js
 * can build it in Node.
 *
 * THE PLACE, south to north. The road comes up from the valley past a bus
 * shelter into the old car park. The inn stands across the car park's north
 * side with its storehouse to the west and the concrete annex somebody
 * added in the seventies to the east, gone to ruin first. Behind the inn,
 * the bathhouse, the walled outdoor bath and the boiler house's chimney.
 * West of the car park the shrine's approach runs north through the avenue
 * of giant cedars, under the torii and through the tunnel, over the stream
 * on the red bridge and up the steps to the shrine. The forestry road runs
 * east out of the car park and north across the stream on its concrete
 * bridge. Everything else is cedar.
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
import { plantForest } from './forest.js';
import {
  buildInn, MAIN, ENTRANCE, CORRIDOR, WATARI, BATH, KURA, BOILER, CHIMNEY, SHELTER,
} from './ryokan.js';
import {
  buildShrine, SANDO, GREAT, LINE, TUNNEL, STREAM, RED_BRIDGE, FOREST_BRIDGE, TERRACE, STEPS, HAIDEN, SHINBOKU,
} from './shrine.js';
import { hollowShape } from '../../props/industrial.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';

export { W, D, worldAt, chunkOf };

/* Where the pilot starts: the car park, facing north up the line of the
 * inn's open front doors. */
export const SPAWN = { px: 114, py: 56, h: 0.03, yaw: 90 };

/* The concrete annex, the town's own ruin (the builder's bando), and the
 * utility poles up the road: the document's (./yard.js). */
export const ANNEX = { px: 163, py: 97, width: 26, depth: 14, floors: 3, ruin: 0.62, variant: 3 };
export const POLES = [[92.8, 6], [92.8, 33], [121.6, 41], [121.6, 68], [137.5, 86.5]];
export const VENDING = { px: 124.2, py: 89.6 };
export const CARS = [
  { style: 'minibus', px: 64, py: 70, deg: 0, variant: 3 },
  { style: 'kei', px: 104, py: 79, deg: 90, variant: 5 },
  { style: 'keivan', px: 70.5, py: 79, deg: 90, variant: 2 },
  { style: 'wagon', px: 80.9, py: 79, deg: 90, variant: 4 },
  { style: 'sedan', px: 112, py: 72, deg: 180, variant: 1 },
];

/*
 * The place: { parts, T }. The parts are the place's own solids and drawn
 * boxes in the world frame; T is the builder, for everything ./index.js
 * draws over them, the trees included.
 */
/*
 * The utility poles up the road and along the car park: grey concrete,
 * a steel crossarm, three insulators, three lines sagging to the next,
 * and a transformer on the one by the inn. Drawn by the place in its own
 * colours rather than as the builder's pole, whose painted plates are a
 * draw call each: five poles were ten calls on Low.
 */
function poles(T) {
  const H = 10;
  const top = [];
  POLES.forEach(([px, py], i) => {
    T.clearing(px - 1, py - 1, px + 1, py + 1, 0.5);
    T.post('cdConcrete', px, py, 0, H, 0.15, { name: 'utility pole', kind: 'pole' });
    T.post('cdToriiBlack', px, py, 0, 1.8, 0.17, { name: 'pole guard', solid: false });
    /* The crossarm lies across the line: along x where the line runs
     * north, along y where it runs east. */
    const [qx, qy] = POLES[Math.min(i + 1, POLES.length - 1)];
    const [ox, oy] = POLES[Math.max(i - 1, 0)];
    const alongY = Math.abs(qy - oy) >= Math.abs(qx - ox);
    const arm = alongY ? [[px - 0.9, py - 0.06], [px + 0.9, py + 0.06]] : [[px - 0.06, py - 0.9], [px + 0.06, py + 0.9]];
    T.box('cdTin', arm[0][0], arm[0][1], H - 0.9, arm[1][0], arm[1][1], H - 0.8, { name: 'crossarm' });
    const ends = [-0.75, 0, 0.75].map((d) => (alongY ? [px + d, py, H - 0.62] : [px, py + d, H - 0.62]));
    for (const e of ends) {
      T.ball('cdPaving', e[0], e[1], e[2] - 0.1, 0.09, true);
    }
    top.push(ends);
    if (i === 3) {
      T.cyl('cdTin', [px + 0.42, py, 6.4], [px + 0.42, py, 7.6], 0.34, 10);
      T.box('cdTin', px, py - 0.08, 6.9, px + 0.2, py + 0.08, 7.1, { name: 'transformer bracket', solid: false });
    }
  });
  for (let i = 0; i + 1 < top.length; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      T.wire('cdToriiBlack', top[i][k], top[i + 1][k], 0.45, 0.02);
    }
  }
}

/*
 * The two drinks machines by the inn's door, facing the car park: a red
 * one and a white one, a lit window of cans, the buttons, the slot. Drawn
 * by the place for the poles' reason: the builder's machine was ten
 * draw calls on Low.
 */
function vending(T) {
  const { px, py } = VENDING;
  [['cdSignRed', -1.02], ['cdKuraWhite', 0.02]].forEach(([body, dx]) => {
    const x0 = px + dx;
    const x1 = x0 + 1.0;
    T.box(body, x0, py - 0.4, 0, x1, py + 0.4, 1.83, { name: 'vending machine' });
    T.box('cdToriiBlack', x0, py - 0.4, 1.83, x1, py + 0.4, 1.9, { name: 'vending top', solid: false });
    T.paint('cdShoji', x0 + 0.1, py - 0.43, 1.0, x1 - 0.1, py - 0.4, 1.7);
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 6; c += 1) {
        const m = ['cdNorenBlue', 'cdSignRed', 'cdBusStop', 'cdFern'][(r * 6 + c + (dx > 0 ? 2 : 0)) % 4];
        const cx = x0 + 0.17 + c * 0.133;
        const h = 1.08 + r * 0.21;
        T.paint(m, cx - 0.04, py - 0.45, h, cx + 0.04, py - 0.43, h + 0.14, true);
      }
    }
    T.paint('cdToriiBlack', x0 + 0.15, py - 0.44, 0.15, x1 - 0.15, py - 0.4, 0.4);
    T.paint('cdBrass', x1 - 0.3, py - 0.44, 0.85, x1 - 0.18, py - 0.4, 0.95, true);
  });
}

export function cedarLayout() {
  const T = new Town();
  buildInn(T);
  buildShrine(T);
  /* What the document stands on the plot, kept clear of trees as well. */
  T.clearing(ANNEX.px - ANNEX.width / 2, ANNEX.py - ANNEX.depth / 2, ANNEX.px + ANNEX.width / 2, ANNEX.py + ANNEX.depth / 2, 3);
  poles(T);
  vending(T);
  /* The sacred cedar, one tree by hand. */
  T.trees.push(giant(T));
  plantForest(T, () => false);
  return { parts: [...T.P.list], T };
}

/* The shrine's sacred cedar: the tallest and thickest tree on the map,
 * standing on the terrace with its rope round it. */
function giant(T) {
  const S = SHINBOKU;
  const cb = S.H * 0.42;
  const L = S.H - cb;
  const Rc = 0.12 * S.H;
  const tiers = [0, 1, 2].map((k) => ({
    y: cb + L * (k / 3) * 0.9, h: L * 0.44, r: Rc * (1 - 0.24 * k), ell: 1, spin: k * 1.7, tone: 2 - k,
  }));
  T.cap('stCedarWood', [S.px, S.py, 0], [S.px, S.py, cb + 0.5 * L], S.r, { draw: false, name: 'trunk', kind: 'tree' });
  for (const t of tiers) {
    const Rin = 0.8660254037844386 * t.r;
    const sinA = Rin / Math.sqrt(Rin * Rin + t.h * t.h);
    const rho = 0.7 * (t.h * sinA) / (1 + sinA);
    T.cap('stCedar1', [S.px, S.py, t.y + rho], [S.px, S.py, t.y + t.h - rho / sinA], rho, { draw: false, name: 'canopy', kind: 'canopy' });
  }
  return {
    px: S.px, py: S.py, H: S.H, r: S.r, cb, tiers, leader: { y: cb + L * 0.74, h: L * 0.3, r: Rc * 0.36, ell: 1, spin: 0.4, tone: 0 }, big: true,
  };
}

/* The chimney as the document places it, for its doorway's size. */
export const CHIMNEY_EL = { type: 'hollowChimney', dims: { height: CHIMNEY.height, radius: CHIMNEY.radius, door: CHIMNEY.door } };

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of its window's middle in the plan, the heading it is flown along in
 * whole degrees (90 is north), its clear width and the bottom and top of
 * its clear height, already inside the opening by more than the craft's
 * radius (M).
 */
export function cedarGaps() {
  const M = 0.3;
  const great = { r: Math.max(0.09, GREAT.H * 0.05) };
  const line = { r: Math.max(0.09, LINE.H * 0.05) };
  const tun = { r: Math.max(0.09, TUNNEL.H * 0.05) };
  const ni = { H: 4.6, span: 3.4, r: Math.max(0.09, 4.6 * 0.05) };
  const ch = hollowShape(CHIMNEY_EL);
  const L = BATH.lantern;
  return [
    { name: 'THE GREAT TORII', px: SANDO.px, py: GREAT.py, deg: 90, w: GREAT.span - 2 * great.r - 2 * M, h0: M, h1: GREAT.H * 0.64 - M, points: 100 },
    { name: 'TORII LINE', px: SANDO.px, py: LINE.y0 + (LINE.n - 1) * LINE.step, deg: 90, w: LINE.span - 2 * line.r - 2 * M, h0: M, h1: LINE.H * 0.64 - M, points: 250 },
    { name: 'TORII TUNNEL', px: SANDO.px, py: TUNNEL.y0 + (TUNNEL.n - 1) * TUNNEL.step + 0.4, deg: 90, w: TUNNEL.span - 2 * tun.r - 2 * M, h0: M, h1: TUNNEL.H * 0.64 - M, points: 1000 },
    { name: 'UNDER THE RED BRIDGE', px: SANDO.px, py: (STREAM.y0 + STREAM.y1) / 2, deg: 0, w: STREAM.y1 - STREAM.y0 - 2 * M, h0: STREAM.bed + M, h1: RED_BRIDGE.h0 - 0.35 - M, points: 1000 },
    { name: 'SHRINE STEPS', px: SANDO.px, py: STEPS.y1 + 1.2, deg: 90, w: ni.span - 2 * ni.r - 2 * M, h0: TERRACE.h + M, h1: TERRACE.h + ni.H * 0.64 - M, points: 100 },
    { name: 'THROUGH THE SHRINE', px: (HAIDEN.x0 + HAIDEN.x1) / 2, py: HAIDEN.y1 - 0.2, deg: 90, w: 2.2 - 2 * M, h0: HAIDEN.floor + M, h1: HAIDEN.eave - 0.4 - M, points: 500 },
    { name: 'THE FRONT DOORS', px: (ENTRANCE.x0 + ENTRANCE.x1) / 2, py: MAIN.y0, deg: 90, w: ENTRANCE.x1 - ENTRANCE.x0 - 2 * M, h0: MAIN.g + M, h1: ENTRANCE.h1 - M, points: 250 },
    { name: 'GUEST CORRIDOR', px: MAIN.x0, py: (CORRIDOR.w0 + CORRIDOR.w1) / 2, deg: 0, w: CORRIDOR.w1 - CORRIDOR.w0 - 2 * M, h0: CORRIDOR.h0 + M, h1: CORRIDOR.h1 - M, points: 1000 },
    { name: 'THE WATARI', px: (WATARI.x0 + WATARI.x1) / 2, py: WATARI.y0 + 2, deg: 90, w: WATARI.x1 - WATARI.x0 - 0.2 - 2 * M, h0: MAIN.f1t + M, h1: WATARI.eave - M, points: 500 },
    { name: 'UNDER THE WATARI', px: (WATARI.x0 + WATARI.x1) / 2, py: (WATARI.posts[0] + WATARI.posts[1]) / 2, deg: 0, w: WATARI.posts[1] - WATARI.posts[0] - 0.26 - 2 * M, h0: M, h1: MAIN.f1 - 0.35 - M, points: 250 },
    { name: 'STEAM VENT', px: BATH.x0 + 1.5, py: (L.y0 + L.y1) / 2, deg: 0, w: L.y1 - L.y0 - 0.18 - 2 * M, h0: L.h0 + 0.24 + M, h1: L.h1 - M, points: 1000 },
    { name: 'KURA WINDOWS', px: (KURA.win.x0 + KURA.win.x1) / 2, py: KURA.y0, deg: 90, w: KURA.win.x1 - KURA.win.x0 - 2 * M, h0: KURA.win.h0 + M, h1: KURA.win.h1 - M, points: 1000 },
    { name: 'CHIMNEY DOOR', px: CHIMNEY.px - ch.R(0) + 0.3, py: CHIMNEY.py, deg: 0, w: ch.clear - 2 * M, h0: M, h1: ch.dh - M, points: 500 },
    { name: 'UNDER THE FOREST BRIDGE', px: (FOREST_BRIDGE.x0 + FOREST_BRIDGE.x1) / 2, py: (STREAM.y0 + STREAM.y1) / 2, deg: 0, w: STREAM.y1 - STREAM.y0 - 2 * M, h0: STREAM.bed + M, h1: FOREST_BRIDGE.h0 - M, points: 500 },
  ];
}

/*
 * THE SIGNS. Every brand on the roster that shows here hangs as an old
 * enamel sign, the kind nailed to every storehouse and bus shelter in the
 * Japanese countryside, on a wall a pilot passes: two on the storehouse's
 * south face, one on its east, one in the bus shelter, two on the boiler
 * house, one on the spring's hut. Each { slug, p, n, up, w, chunk } in the
 * world for the pipeline's markSpots, `p` a few centimetres proud of the
 * wall so it lies over the frame and the stains.
 *
 * KONEX DRONE's is the one hidden sign (the owner's promise of a logo
 * hidden in every map): inside the bathhouse, low on its back wall between
 * the clerestory windows, facing the two doorways. A pilot has to duck
 * under a curtain into the bath to see it.
 */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, 'cedar'));
const SIGN_W = 1.0;
const SIGNS = [
  { px: 61.0, py: KURA.y0 - 0.2, h: 2.2, n: [0, -1] },
  { px: 65.0, py: KURA.y0 - 0.2, h: 2.2, n: [0, -1] },
  { px: SHELTER.x1 - 0.05, py: 19.75, h: 1.55, n: [-1, 0] },
  { px: 83.6, py: BOILER.y0 - 0.06, h: 1.9, n: [0, -1] },
  { px: BOILER.x0 - 0.06, py: 129.8, h: 1.75, n: [-1, 0] },
  { px: 154.1, py: 161.5, h: 1.5, n: [0, -1] },
  { px: KURA.x1 + 0.2, py: 101.8, h: 2.1, n: [1, 0] },
];
export const KONEX = { px: 98, py: BATH.y1 - 0.125, h: 2.0, n: [0, -1], w: 1.2 };

function spot(slug, s, w, key) {
  const lift = 0.07;
  const [x, y, z] = worldAt(s.px + s.n[0] * lift, s.py + s.n[1] * lift, s.h);
  const out = { slug, p: [x, y, z], n: [s.n[0], 0, -s.n[1]], up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  if (key) {
    out.key = key;
  }
  return out;
}

export function cedarMarkSpots() {
  const shown = BRANDS.filter((b) => b.slug !== 'konexdrone');
  const out = shown.slice(0, SIGNS.length).map((brand, i) => spot(brand.slug, SIGNS[i], SIGN_W));
  if (BRANDS.some((b) => b.slug === 'konexdrone')) {
    out.push(spot('konexdrone', KONEX, KONEX.w));
  }
  return out;
}

/* The ground the plant is given where no top is under the craft, world
 * metres: the stream's bed in the stream, level ground everywhere else. */
export function cedarFloor(x, z) {
  const px = x + W / 2;
  const py = D / 2 - z;
  return py > STREAM.y0 && py < STREAM.y1 && px > 0 && px < W ? STREAM.bed : 0;
}

/* The stream's channel, as the world rectangle the ground's planes lose. */
export const STREAM_HOLE = { x0: wx(0), x1: wx(W), z0: wz(STREAM.y1), z1: wz(STREAM.y0) };
