/*
 * plan.js: Kirigaoka Sanatorium whole. The site: the terrace the
 * sanatorium stands on (./wards.js), the hill it is cut into, the grounds
 * below it down to the gate, and the woods either side. And what a map
 * document says about it: where the pilot starts, the named gaps, the park
 * race, the signs the partners hang. Pure, as ./wards.js is, so
 * scripts/sana-check.js can build it in Node.
 *
 * IT IS BUILT IN SUNNYFIELD'S PLAN FRAME, with Sunnyfield's builder
 * (../sunny/frame.js): a plot 400 m by 280 m, px east, py north, its six
 * cull chunks and its forty eight near cells, and the palette merge that
 * folds a chunk's colours into one batch (../sunny/palette.js). Those two
 * files are pure and small, and a second copy of them would be the same
 * arithmetic twice; nothing else of Sunnyfield is loaded.
 *
 * THE SITE, south to north. The road comes up from the south edge to the
 * gate in the grounds' block wall at py 30, where the pilot starts. Inside
 * the wall are the grounds: lawns gone to meadow, the pond and its
 * footbridge, the greenhouse, the sun pavilion where patients lay out in
 * the air, the wisteria walk, the dry fountain on the turning circle. A
 * stone stair climbs the terrace wall, five metres of dressed stone, to
 * the sanatorium. Behind it the hill rises under cedar, and woods close
 * the grounds in on both sides.
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

import { Town, worldAt, W, D, chunkOf, rng } from '../sunny/frame.js';
import { partsOf } from '../../props/catalog.js';
import { PARTNERS, MAP_ONLY_PARTNERS, PATRON_MAP_BRANDS, shownOn } from '../../partners/roster.js';
import { signAspect } from '../../art/partnermark.js';
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';
import { steps, roofDrawn, roofSolid } from './walls.js';
import {
  sanatorium, TERRACE, TH, FL, SEC, WINGS, bayOf, holeOf, ADMIN, TOWER, PORCH, CHAPEL, BELFRY, WALK, BOILER, WATER,
} from './wards.js';

export { W, D, worldAt, chunkOf };

/* The map's own id, as the registry names it. */
export const SANA_ID = 'sana';

/* The scaled assets' parts in the world frame, solid and never drawn:
 * ../sunny/plan.js's scaledParts, for the trees. */
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
 * THE HILL behind the terrace: a bank rising from the terrace's back to a
 * ridge, drawn as one frustum and solid as stacked boxes inside its slope
 * (Town.frustumSolid). Its foot on the south is under the terrace, so the
 * slope comes out of the terrace's top at the terrace's height.
 */
const HILL = { o: { x0: 10, y0: 205, x1: 390, y1: 300 }, i: { x0: 70, y0: 240, x1: 330, y1: 272 }, h: 18 };
export function hillAt(px, py) {
  const { o, i, h } = HILL;
  const f = Math.min(
    (py - o.y0) / (i.y0 - o.y0),
    (px - o.x0) / (i.x0 - o.x0),
    (o.x1 - px) / (o.x1 - i.x1),
    (o.y1 - py) / (o.y1 - i.y1),
  );
  return h * Math.max(0, Math.min(1, f));
}

/* The grounds' features, plan metres. */
export const GATE = { px: 200, py: 30, w: 9, posts: 2.6 };
export const ROAD = { x0: 194, x1: 206 };
export const STAIR = { x0: 192, x1: 208, y0: 104, n: 10, run: 1.6 };
export const FOUNTAIN = { px: 200, py: 95 };
export const POND = { px: 135, py: 62, r: 12 };
export const BRIDGE = { x0: 121, x1: 149, py: 62, deck: 2.6, piers: [131, 139] };
export const GREEN = { x0: 92, x1: 114, y0: 79, y1: 91, eave: 2.8, ridge: 4.4 };
export const PAVILION = { x0: 232, x1: 276, y0: 64, y1: 72, h: 3.2 };
export const PERGOLA = { x0: 300, x1: 310, y0: 38, y1: 60, h: 2.9 };
export const SHELTER = { x0: 210, x1: 214.5, y0: 13, y1: 15.5 };

/* The terrace: one box of dressed stone, its top turfed, with the stair
 * up its middle; the grounds' wall and gate; the road. */
function site(T, r) {
  const X = TERRACE;
  T.box('kiStone', X.x0, X.y0, 0, X.x1, X.y1, X.h, { kind: 'wall', name: 'terrace' });
  T.paint('kiTurf', X.x0, X.y0 + 0.6, X.h, X.x1, X.y1, X.h + 0.012);
  /* The coping along its edge. */
  T.box('kiStoneDark', X.x0 - 0.2, X.y0 - 0.25, X.h - 0.3, X.x1 + 0.2, X.y0 + 0.6, X.h + 0.25, { kind: 'wall', name: 'coping' });
  for (const x of [X.x0 - 0.2, X.x1 - 0.4]) {
    T.box('kiStoneDark', x, X.y0, X.h - 0.3, x + 0.6, X.y1, X.h + 0.25, { kind: 'wall', name: 'coping' });
  }
  /* The hill. */
  T.frustum('kiTurf', HILL.o, 0, HILL.i, HILL.h);
  T.frustumSolid(HILL.o, 0, HILL.i, HILL.h, 12, 'hill', 'rock');
  /* The stair up the terrace wall, and its cheeks. */
  const S = STAIR;
  steps(T, 'kiStone', S.x0, S.x1, S.y0, 1, S.run, X.h / S.n, S.n, 0, 'terrace stair');
  for (const [x0, x1] of [[S.x0 - 1.0, S.x0], [S.x1, S.x1 + 1.0]]) {
    steps(T, 'kiStoneDark', x0, x1, S.y0, 1, S.run, X.h / S.n, S.n, 0.9, 'stair cheek');
    T.box('kiStoneDark', x0, S.y0, 0, x1, X.y0, 0.9, { kind: 'wall', name: 'stair cheek' });
  }
  /* The path on the terrace, from the stair's head to the porch. */
  T.paint('concreteWorn', 194, X.y0 + 0.6, X.h + 0.012, 206, PORCH.y0, X.h + 0.03);
  /* A path along the front of the wings. */
  T.paint('concreteWorn', WINGS[0].x0 - 22, SEC.col0 - 4.5, X.h + 0.012, WINGS[1].x1, SEC.col0 - 0.9, X.h + 0.03);
  /* The grounds' wall, block on a stone foot, the gate in it. */
  const G = GATE;
  for (const [x0, x1] of [[20, G.px - G.w / 2 - 2.5], [G.px + G.w / 2 + 2.5, 380]]) {
    T.box('block', x0, G.py - 0.3, 0, x1, G.py + 0.3, 1.8, { kind: 'wall', name: 'grounds wall' });
    T.box('kiStoneDark', x0, G.py - 0.4, 1.8, x1, G.py + 0.4, 1.95, { kind: 'wall', name: 'wall coping' });
  }
  for (const s of [-1, 1]) {
    const cx = G.px + s * (G.w / 2 + 1.25);
    T.box('kiStone', cx - 1.25, G.py - 0.8, 0, cx + 1.25, G.py + 0.8, G.posts, { kind: 'wall', name: 'gatepost' });
    T.box('kiStoneDark', cx - 1.4, G.py - 0.95, G.posts, cx + 1.4, G.py + 0.95, G.posts + 0.25, { kind: 'wall', name: 'gatepost cap' });
    T.post('metalDark', cx, G.py, G.posts + 0.25, G.posts + 0.75, 0.05, { kind: 'pole', name: 'gate lamp', seg: 4 });
    T.ball('glassDark', cx, G.py, G.posts + 0.95, 0.24);
  }
  /* The gate's leaf, slid back behind the east wall and rusted there. */
  T.box('rustDeep', G.px + G.w / 2 + 2.5, G.py + 0.35, 0.08, G.px + G.w / 2 + 10.5, G.py + 0.5, 1.7, { kind: 'wall', name: 'gate leaf' });
  /* The road, asphalt to the turning circle. */
  T.paint('asphalt', ROAD.x0, 0, 0.01, ROAD.x1, FOUNTAIN.py - 6, 0.03);
  T.disc('asphalt', FOUNTAIN.px, FOUNTAIN.py, 11, 0.01, 0.03, 28);
  T.paint('concreteWorn', S.x0 - 1, FOUNTAIN.py + 9, 0.02, S.x1 + 1, S.y0, 0.04);
  /* The fountain, dry: a basin, a column, a bowl. */
  const F = FOUNTAIN;
  T.disc('concreteWorn', F.px, F.py, 3.4, 0, 0.7, 20);
  T.disc('kiDamp', F.px, F.py, 3.0, 0.7, 0.72, 20);
  T.hidden(F.px - 2.3, F.py - 2.3, 0, F.px + 2.3, F.py + 2.3, 0.7, 'wall', 'basin');
  T.post('concreteWorn', F.px, F.py, 0.7, 2.0, 0.35, { kind: 'wall', name: 'fountain', seg: 8 });
  T.disc('concreteWorn', F.px, F.py, 1.2, 1.7, 2.0, 16);
  T.hidden(F.px - 0.8, F.py - 0.8, 1.7, F.px + 0.8, F.py + 0.8, 2.0, 'wall', 'bowl');
  void r;
}

/* THE POND and its footbridge, a timber deck on two piers with steps up
 * each end, high enough to fly under. */
function pond(T) {
  const P = POND;
  T.disc('kiStoneDark', P.px, P.py, P.r + 0.7, 0, 0.12, 32);
  T.disc('kiPond', P.px, P.py, P.r, 0.12, 0.14, 32);
  const B = BRIDGE;
  const y0 = B.py - 1.1;
  const y1 = B.py + 1.1;
  T.box('kiTimber', B.x0 + 4, y0, B.deck - 0.25, B.x1 - 4, y1, B.deck, { kind: 'wall', name: 'bridge deck' });
  for (let k = 0; k < 4; k += 1) {
    const h = ((k + 1) * B.deck) / 4;
    T.box('kiTimber', B.x0 + k, y0, h - 0.2, B.x0 + 4, y1, h, { kind: 'wall', name: 'bridge step' });
    T.box('kiTimber', B.x1 - 4, y0, h - 0.2, B.x1 - k, y1, h, { kind: 'wall', name: 'bridge step' });
  }
  for (const x of B.piers) {
    T.box('kiStoneDark', x - 0.4, y0 + 0.1, 0, x + 0.4, y1 - 0.1, B.deck - 0.25, { kind: 'wall', name: 'bridge pier' });
  }
  T.dress(() => {
    T.wide(() => {
      for (const y of [y0 + 0.05, y1 - 0.05]) {
        for (let x = B.x0 + 4; x <= B.x1 - 4; x += 2.5) {
          T.cyl('kiTimber', [x, y, B.deck], [x, y, B.deck + 0.9], 0.05, 4);
        }
        T.cyl('kiTimber', [B.x0 + 4, y, B.deck + 0.9], [B.x1 - 4, y, B.deck + 0.9], 0.05, 4);
      }
    });
    /* Reeds and lily pads. */
    const r = rng(62);
    for (let i = 0; i < 26; i += 1) {
      const a = r.range(0, 6.28);
      const d = r.range(P.r - 2.5, P.r - 0.3);
      const x = P.px + d * cos(a);
      const y = P.py + d * sin(a);
      T.cone('kiMoss', x, y, 0.1, 0.25, r.range(0.8, 1.4), 4);
    }
    for (let i = 0; i < 14; i += 1) {
      const x = P.px + r.range(-8, 8);
      const y = P.py + r.range(-8, 8);
      T.disc('leaf1', x, y, r.range(0.3, 0.6), 0.14, 0.16, 7);
    }
  });
}

/* A sine and cosine for the dressing only, by Taylor series: no JS
 * trigonometry in a file the physics' world comes from, and nothing here
 * that is solid reads them. */
function cos(a) {
  const x = ((a + Math.PI) % (2 * Math.PI)) - Math.PI;
  const x2 = x * x;
  return 1 - x2 / 2 + (x2 * x2) / 24 - (x2 * x2 * x2) / 720 + (x2 * x2 * x2 * x2) / 40320;
}
function sin(a) {
  return cos(a - Math.PI / 2);
}

/* THE GREENHOUSE: a steel frame, its glass gone but for a few side panes,
 * the benches down its sides. Open at both ends, so it is a line. */
function greenhouse(T) {
  const G = GREEN;
  const mid = (G.y0 + G.y1) / 2;
  const n = 8;
  for (let k = 0; k <= n; k += 1) {
    const x = G.x0 + ((G.x1 - G.x0) * k) / n;
    T.post('metal', x, G.y0 + 0.1, 0, G.eave, 0.07, { kind: 'pole', name: 'greenhouse post', seg: 5 });
    T.post('metal', x, G.y1 - 0.1, 0, G.eave, 0.07, { kind: 'pole', name: 'greenhouse post', seg: 5 });
    T.cap('metal', [x, G.y0 + 0.1, G.eave], [x, mid, G.ridge], 0.06, { kind: 'pole', name: 'rafter', seg: 4 });
    T.cap('metal', [x, G.y1 - 0.1, G.eave], [x, mid, G.ridge], 0.06, { kind: 'pole', name: 'rafter', seg: 4 });
  }
  for (const [y, z] of [[G.y0 + 0.1, G.eave], [G.y1 - 0.1, G.eave], [mid, G.ridge]]) {
    T.cap('metal', [G.x0, y, z], [G.x1, y, z], 0.07, { kind: 'pole', name: 'greenhouse bar', seg: 4 });
  }
  /* Benches down both sides. */
  for (const [y0, y1] of [[G.y0 + 0.2, G.y0 + 1.2], [G.y1 - 1.2, G.y1 - 0.2]]) {
    T.box('kiTimber', G.x0 + 0.5, y0, 0.75, G.x1 - 0.5, y1, 0.9, { kind: 'wall', name: 'bench' });
    T.hidden(G.x0 + 0.5, y0, 0, G.x1 - 0.5, y1, 0.75, 'wall', 'bench');
  }
  /* The panes still in: low on the sides, under the benches' line. */
  for (let k = 0; k < n; k += 1) {
    if (k % 3 === 1) {
      continue;
    }
    const x0 = G.x0 + ((G.x1 - G.x0) * k) / n + 0.08;
    const x1 = G.x0 + ((G.x1 - G.x0) * (k + 1)) / n - 0.08;
    T.box('glassBlue', x0, G.y0 + 0.07, 0.9, x1, G.y0 + 0.13, 2.7, { kind: 'wall', name: 'pane', cast: false });
    if (k % 2 === 0) {
      T.box('glassBlue', x0, G.y1 - 0.13, 0.9, x1, G.y1 - 0.07, 2.7, { kind: 'wall', name: 'pane', cast: false });
    }
  }
  T.paint('rubble', G.x0, G.y0, 0.01, G.x1, G.y1, 0.03);
  T.dress(() => {
    const r = rng(91);
    /* Pots, and what grew out of them. */
    for (let i = 0; i < 18; i += 1) {
      const x = r.range(G.x0 + 0.8, G.x1 - 0.8);
      const y = r.chance(0.5) ? G.y0 + 0.7 : G.y1 - 0.7;
      T.cyl('brick', [x, y, 0.9], [x, y, 1.15], 0.14, 6, 0.18);
      if (r.chance(0.6)) {
        T.ball('leaf0', x, y, 1.35, r.range(0.25, 0.5));
      }
    }
    /* A broken pane on the floor or two. */
    T.paint('glassBlue', 100, 84.5, 0.03, 101.4, 85.4, 0.05);
  });
}

/* THE SUN PAVILION (日光浴場): a long timber deck under a roof on posts,
 * open on every side, where the beds were lined up in the sun. */
function pavilion(T) {
  const P = PAVILION;
  for (let x = P.x0; x <= P.x1 + 0.01; x += 4) {
    for (const y of [P.y0 + 0.15, P.y1 - 0.15]) {
      T.post('kiTimber', x, y, 0, P.h, 0.15, { kind: 'pole', name: 'pavilion post', seg: 6 });
    }
  }
  T.box('kiTimber', P.x0, P.y0, 0, P.x1, P.y1, 0.3, { kind: 'wall', name: 'pavilion deck' });
  T.box('kiTimber', P.x0 - 0.5, P.y0 - 0.5, P.h, P.x1 + 0.5, P.y1 + 0.5, P.h + 0.2, { kind: 'wall', name: 'pavilion roof' });
  roofDrawn(T, 'rustDeep', 'x', P.y0 - 0.5, P.y1 + 0.5, P.h + 0.2, P.h + 1.6, P.x0 - 0.5, P.x1 + 0.5, 0.3, 0.15);
  roofSolid(T, 'x', P.y0 - 0.5, P.y1 + 0.5, P.h + 0.2, P.h + 1.5, P.x0 - 0.5, P.x1 + 0.5, 3, null, 'pavilion roof');
  T.dress(() => {
    const r = rng(68);
    /* The loungers, still in their row, a few tipped over. */
    for (let x = P.x0 + 2; x < P.x1 - 1; x += 3.6) {
      if (r.chance(0.75)) {
        T.deco('kiTimberPale', x - 0.35, P.y0 + 1.2, 0.6, x + 0.35, P.y0 + 3.0, 0.66);
        T.prism('kiTimberPale', 'y', [[x - 0.35, 0.66], [x + 0.35, 0.66], [x + 0.35, 1.2], [x - 0.35, 1.2]], P.y0 + 3.0, P.y0 + 3.06);
      }
    }
    for (let i = 0; i < 6; i += 1) {
      const x = r.range(P.x0 + 2, P.x1 - 2);
      T.paint('kiStain', x - 1.2, P.y0 + 0.3, 0.31, x + 1.2, P.y1 - 0.3, 0.33);
    }
    T.wide(() => {
      T.prism('rustDeep', 'x', [[P.y1 + 0.4, P.h + 0.3], [P.y1 + 1.6, P.h - 1.4], [P.y1 + 1.66, P.h - 1.36], [P.y1 + 0.46, P.h + 0.34]], 259, 261.5);
    });
  });
}

/* THE WISTERIA WALK (藤棚): posts and beams, the trellis over them, the
 * flowers hanging through it. */
function pergola(T) {
  const P = PERGOLA;
  for (let y = P.y0; y <= P.y1 + 0.01; y += 5.5) {
    for (const x of [P.x0 + 0.15, P.x1 - 0.15]) {
      T.post('kiTimber', x, y, 0, P.h, 0.13, { kind: 'pole', name: 'pergola post', seg: 6 });
    }
  }
  for (const x of [P.x0 + 0.15, P.x1 - 0.15]) {
    T.box('kiTimber', x - 0.12, P.y0 - 0.6, P.h, x + 0.12, P.y1 + 0.6, P.h + 0.25, { kind: 'wall', name: 'pergola beam' });
  }
  T.dress(() => {
    T.wide(() => {
      for (let y = P.y0 - 0.4; y <= P.y1 + 0.4; y += 0.9) {
        T.deco('kiTimber', P.x0 - 0.5, y, P.h + 0.25, P.x1 + 0.5, y + 0.1, P.h + 0.35);
      }
      const r = rng(304);
      for (let i = 0; i < 70; i += 1) {
        const x = r.range(P.x0 + 0.4, P.x1 - 0.4);
        const y = r.range(P.y0, P.y1);
        T.cone('kiWisteria', x, y, P.h + 0.25 - r.range(0.6, 0.9), r.range(0.15, 0.25), -r.range(0.5, 0.85), 5);
      }
      for (let i = 0; i < 24; i += 1) {
        const x = r.chance(0.5) ? P.x0 + r.range(0, 1.2) : P.x1 - r.range(0, 1.2);
        T.ball('kiIvy', x, r.range(P.y0, P.y1), P.h + 0.3, r.range(0.5, 0.9));
      }
    });
  });
}

/* THE BUS STOP outside the gate: a shelter and its bench, the stop's
 * round sign on its pole. */
function busStop(T) {
  const S = SHELTER;
  T.box('sheetBlue', S.x0, S.y1 - 0.1, 0, S.x1, S.y1, 2.3, { kind: 'wall', name: 'shelter back' });
  for (const x of [S.x0 + 0.1, S.x1 - 0.1]) {
    T.post('metalDark', x, S.y0 + 0.1, 0, 2.4, 0.05, { kind: 'pole', name: 'shelter post', seg: 4 });
  }
  T.box('sheetBlueRib', S.x0 - 0.2, S.y0 - 0.2, 2.4, S.x1 + 0.2, S.y1 + 0.1, 2.55, { kind: 'wall', name: 'shelter roof' });
  T.box('kiTimber', S.x0 + 0.3, S.y1 - 0.55, 0.42, S.x1 - 0.3, S.y1 - 0.15, 0.48, { kind: 'wall', name: 'bench' });
  T.post('metal', 208.4, 17, 0, 2.6, 0.04, { kind: 'pole', name: 'stop pole', seg: 4 });
  T.disc('concreteWorn', 208.4, 17, 0.3, 0, 0.15, 8);
  T.dress(() => {
    T.wide(() => {
      T.sign('busstop', 208.4, 16.95, 2.3, 0.62, 0.62, 's', 0.02);
      T.sign('busstop', 208.4, 17.05, 2.3, 0.62, 0.62, 'n', 0.02);
      T.sign('timetable', 208.4, 16.95, 1.45, 0.4, 0.55, 's', 0.03);
      T.paint('kiStain', S.x0, S.y1 - 0.13, 0.1, S.x1, S.y1 - 0.11, 1.0);
    });
  });
}

/* Signs on the gate, the fence and the terrace: keep out, danger. */
function notices(T) {
  T.sign('plaque', GATE.px - GATE.w / 2 - 1.25, GATE.py - 0.82, 1.5, 0.5, 1.6, 's');
  T.sign('keepout', GATE.px + GATE.w / 2 + 6.5, GATE.py + 0.32, 1.0, 1.4, 0.8, 's', 0.04);
  T.sign('keepout', 150, GATE.py - 0.32, 1.1, 1.2, 0.7, 's');
  T.sign('keepout', 262, GATE.py - 0.32, 1.1, 1.2, 0.7, 's');
  T.sign('danger', 200, TERRACE.y0 - 0.03, 3.6, 1.6, 0.9, 's');
  T.sign('danger', WINGS[1].x1 + 0.03, 157, TH + 1.8, 1.2, 0.7, 'e');
  T.sign('notice', 186.6, 23, 1.3, 1.0, 0.8, 'e');
}

/* The partners' signs: old hoardings on legs along the grounds' wall and
 * on the terrace wall, all facing south over the grounds. */
export const BRANDS = [...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].filter((p) => shownOn(p, SANA_ID));
const BOARD = { w: 4.6, h: 2.6, t: 0.25 };
const HOARDINGS = [
  { px: 168, py: 31.2, lift: 2.2 },
  { px: 232, py: 31.2, lift: 2.2 },
  { px: 120, py: 31.2, lift: 2.2 },
  { px: 280, py: 31.2, lift: 2.2 },
  { px: 92, py: TERRACE.y0 - 0.15, lift: 1.4, wall: true },
  { px: 300, py: TERRACE.y0 - 0.15, lift: 1.4, wall: true },
  { px: 150, py: TERRACE.y0 - 0.15, lift: 1.4, wall: true },
  { px: 250, py: TERRACE.y0 - 0.15, lift: 1.4, wall: true },
  { px: 70, py: 31.2, lift: 2.2 },
  { px: 330, py: 31.2, lift: 2.2 },
];
function hoarding(T, b) {
  const hw = BOARD.w / 2;
  const y0 = b.py - BOARD.t;
  const top = b.lift + BOARD.h;
  T.box('kiTimberPale', b.px - hw, y0, b.lift, b.px + hw, b.py, top, { kind: 'wall', name: 'hoarding' });
  T.deco('rustDeep', b.px - hw - 0.08, y0 - 0.04, top - 0.12, b.px + hw + 0.08, b.py + 0.04, top + 0.05);
  if (!b.wall) {
    for (const s of [-1, 1]) {
      T.post('kiTimber', b.px + s * (hw - 0.5), b.py + 0.1, 0, b.lift, 0.1, { kind: 'pole', name: 'hoarding leg', seg: 5 });
    }
  }
}

/* Each brand's sign on its hoarding's face, as the pipeline's markSpots
 * take them: { slug, p, n, up, w, chunk } in the world. */
export function sanaMarkSpots() {
  return BRANDS.slice(0, HOARDINGS.length).map((brand, i) => {
    const b = HOARDINGS[i];
    const [x, y, z] = worldAt(b.px, b.py - BOARD.t - 0.01, b.lift + BOARD.h / 2);
    const w = Math.min(BOARD.w - 0.4, 2.2 * signAspect(brand));
    return { slug: brand.slug, p: [x, y, z], n: [0, 0, 1], up: [0, 1, 0], w, chunk: chunkOf(x, z) };
  }).concat(hiddenMarkSpots());
}

/*
 * THE HIDDEN KONEX DRONE SIGN, the owner's promise of a logo hidden in
 * every map: at the bottom of the shaft under the east wing's fallen roof,
 * on the corridor wall of the ground floor ward it ends in, facing south,
 * 1.6 m up. Seen by diving the roof hole, or by flying in at that ward's
 * south window and looking back; from the terrace it is behind a wall. A
 * second sign of the brand, so its own key.
 */
export const KONEX_SPOT = (() => {
  const east = WINGS[1];
  const b = bayOf(east, 3);
  return { px: b.mid + 1.7, py: SEC.c0 - 0.02, h: TH + 1.6 };
})();
function hiddenMarkSpots() {
  const brand = BRANDS.find((b) => b.slug === 'konexdrone');
  if (!brand) {
    return [];
  }
  const [x, y, z] = worldAt(KONEX_SPOT.px, KONEX_SPOT.py, KONEX_SPOT.h);
  return [{ slug: brand.slug, key: `${SANA_ID}#konexdrone~hidden`, p: [x, y, z], n: [0, 0, 1], up: [0, 1, 0], w: 1.1, chunk: chunkOf(x, z) }];
}

/*
 * A CEDAR (杉), the tree of every Japanese hillside: a straight trunk and
 * its crown in three tiers of cone, dark and narrow. Drawn by this map
 * rather than the kit, because the town's pine is a few thousand triangles
 * with its leaf clumps and a hillside of them was most of a million; a
 * cedar here is about sixty, in the comic layer's foliage, so a forest of
 * them costs less than a dozen of the town's. Solid as the town's trees
 * are: the trunk a pole, the crown a canopy capsule inside its cones.
 */
function cedar(T, px, py, h, k, r) {
  const trunk = 9.5 * k;
  T.post('trunk', px, py, h, h + trunk * 0.45, 0.22 * k, { kind: 'tree', name: 'cedar trunk', seg: 5 });
  T.cap('kiCedar', [px, py, h + trunk * 0.42], [px, py, h + trunk * 0.92], 1.05 * k, { draw: false, kind: 'canopy', name: 'cedar' });
  const tone = r.chance(0.5) ? 'kiCedar' : 'kiCedarDeep';
  T.cone(tone, px, py, h + trunk * 0.3, 1.9 * k, trunk * 0.42, 7);
  T.cone(tone, px, py, h + trunk * 0.52, 1.5 * k, trunk * 0.36, 7);
  T.cone(tone, px, py, h + trunk * 0.72, 1.05 * k, trunk * 0.32, 6);
}

/*
 * THE TREES. Cedar on the hill and in the woods either side, thick enough
 * that the gaps between them are lines, a few of the town's street trees
 * among them, the town's cherries in the grounds, and saplings where
 * nothing should grow: on the sun deck and the hall's roof.
 */
function trees(T) {
  const r = rng(4417);
  const tree = (style, k, px, py, h) => T.asset({ type: 'tree', style, dims: { size: k, variant: r.int(1, 99) } }, 1, px, py, h, 0);
  /* The hill, in staggered rows across its slope. */
  let row = 0;
  for (let py = 219; py < 282; py += 7, row += 1) {
    for (let px = 4 + (row % 2) * 3.5; px < 398; px += r.range(6.5, 8.5)) {
      const x = px + r.range(-1.5, 1.5);
      const y = py + r.range(-2, 2);
      if (y < TERRACE.y1 + 3 && x > TERRACE.x0 - 2 && x < TERRACE.x1 + 2) {
        continue;
      }
      cedar(T, x, y, Math.max(0, hillAt(x, y) - 0.3), r.range(0.85, 1.25), r);
    }
  }
  /* The woods either side of the grounds, inside the wall and out. */
  for (const [x0, x1] of [[3, 62], [338, 397]]) {
    row = 0;
    for (let py = 4; py < 219; py += 7.5, row += 1) {
      for (let px = x0 + (row % 2) * 3.5; px < x1; px += r.range(7, 9.5)) {
        const x = px + r.range(-1.5, 1.5);
        const y = py + r.range(-1.5, 1.5);
        if (Math.abs(y - GATE.py) < 2.5) {
          continue;
        }
        if (r.chance(0.08)) {
          tree('street', r.range(0.85, 1.1), x, y, Math.max(0, hillAt(x, y) - 0.4));
        } else {
          cedar(T, x, y, Math.max(0, hillAt(x, y) - 0.3), r.range(0.8, 1.2), r);
        }
      }
    }
  }
  /* Along the road outside, a few. */
  for (const [x, y] of [[180, 8], [222, 22], [160, 18], [250, 12], [140, 10]]) {
    tree('street', r.range(0.8, 1.0), x, y, 0);
  }
  /* The cherries in the grounds. */
  for (const [x, y] of [[74, 52], [86, 102], [160, 44], [168, 92], [228, 44], [246, 96], [326, 74], [330, 104], [112, 112], [288, 110], [150, 110]]) {
    tree('sakura', r.range(0.9, 1.15), x, y, 0);
  }
  /* Cedars in the grounds, in clumps, and on the terrace behind and
   * between the buildings. */
  for (const [x, y] of [[66, 40], [70, 46], [64, 64], [334, 44], [336, 52], [272, 100], [278, 104], [126, 98], [178, 60], [222, 76], [100, 42], [110, 50]]) {
    cedar(T, x, y, 0, r.range(0.85, 1.15), r);
  }
  for (const [x, y] of [[100, 200], [140, 196], [176, 205], [226, 205], [290, 205], [76, 128], [324, 130], [104, 132], [296, 128], [244, 180], [150, 178], [120, 205], [160, 208], [210, 198], [280, 186], [326, 160], [74, 196]]) {
    cedar(T, x, y, TH, r.range(0.8, 1.05), r);
  }
  /* Saplings on the roofs. */
  const deck = TH + 3 * FL;
  cedar(T, 130, SEC.n0 - 1.2, deck, 0.3, r);
  cedar(T, 268, SEC.s0 + 1.0, deck, 0.26, r);
  cedar(T, 203.2, 166.5, TH + 4 * FL, 0.24, r);
}

/* The overgrowth: bushes along the terrace's foot and the buildings', the
 * meadow's tufts, moss and ivy down the terrace wall, drawn only. */
function overgrowth(T) {
  const r = rng(77);
  T.dress(() => {
    T.wide(() => {
      /* The terrace wall's courses and joints, its moss, its ivy. */
      const X = TERRACE;
      for (let z = 0.8; z < X.h - 0.4; z += 0.9) {
        T.paint('kiStoneDark', X.x0, X.y0 - 0.03, z, X.x1, X.y0 - 0.01, z + 0.05);
      }
      for (let i = 0; i < 260; i += 1) {
        const x = r.range(X.x0 + 0.5, X.x1 - 0.5);
        if (x > STAIR.x0 - 1.2 && x < STAIR.x1 + 1.2) {
          continue;
        }
        const row = r.int(0, 4);
        T.paint('kiStoneDark', x, X.y0 - 0.03, 0.8 + row * 0.9 + 0.05, x + 0.05, X.y0 - 0.01, 0.8 + (row + 1) * 0.9);
      }
      for (let i = 0; i < 40; i += 1) {
        const x = r.range(X.x0, X.x1 - 3);
        if (x > STAIR.x0 - 4 && x < STAIR.x1 + 1) {
          continue;
        }
        const len = r.range(1.2, 4.2);
        T.paint(r.chance(0.6) ? 'kiIvy' : 'kiMoss', x, X.y0 - 0.06, X.h - len, x + r.range(0.8, 2.6), X.y0 - 0.02, X.h - 0.2);
      }
      for (let i = 0; i < 30; i += 1) {
        const x = r.range(X.x0, X.x1);
        if (x > STAIR.x0 - 2 && x < STAIR.x1 + 2) {
          continue;
        }
        T.paint('kiDamp', x, X.y0 - 0.03, 0, x + r.range(0.6, 1.6), X.y0 - 0.015, r.range(1.0, 2.6));
      }
    });
    /* Bushes at the terrace's foot and along the grounds' wall. */
    for (let x = TERRACE.x0 - 2; x < TERRACE.x1 + 2; x += r.range(2.5, 5)) {
      if (x > STAIR.x0 - 2.5 && x < STAIR.x1 + 2.5) {
        continue;
      }
      T.ball(r.chance(0.5) ? 'leaf0' : 'leaf1', x, TERRACE.y0 - 1.2, 0.5, r.range(0.9, 1.6));
    }
    for (let x = 22; x < 378; x += r.range(3, 7)) {
      if (Math.abs(x - GATE.px) < 9) {
        continue;
      }
      T.ball(r.chance(0.5) ? 'leaf0' : 'leaf1', x, GATE.py + 1.4, 0.4, r.range(0.7, 1.3));
    }
    /* Along the front of the wings, the bushes have the plinth. */
    for (const wing of WINGS) {
      for (let x = wing.x0 + 1; x < wing.x1; x += r.range(3, 6)) {
        T.ball(r.chance(0.6) ? 'leaf1' : 'leaf0', x, SEC.col0 - 2.0, TH + 0.4, r.range(0.7, 1.2));
      }
    }
    /* The meadow's tufts, the grounds and the terrace. */
    for (let i = 0; i < 420; i += 1) {
      const x = r.range(62, 338);
      const y = r.range(34, 118);
      if (x > ROAD.x0 - 2 && x < ROAD.x1 + 2) {
        continue;
      }
      T.cone(r.chance(0.7) ? 'kiMoss' : 'leaf1', x, y, 0, r.range(0.2, 0.45), r.range(0.4, 1.0), 4);
    }
    for (let i = 0; i < 160; i += 1) {
      const x = r.range(TERRACE.x0 + 1, TERRACE.x1 - 1);
      const y = r.range(TERRACE.y0 + 1, 147);
      T.cone(r.chance(0.7) ? 'kiMoss' : 'leaf1', x, y, TH, r.range(0.2, 0.45), r.range(0.4, 0.9), 4);
    }
    /* The road's cracks and the weeds through them. */
    for (let y = 2; y < FOUNTAIN.py - 8; y += r.range(3, 7)) {
      const x = r.range(ROAD.x0 + 1, ROAD.x1 - 2);
      T.paint('kiDamp', x, y, 0.03, x + r.range(0.8, 2.4), y + 0.08, 0.05);
      T.cone('kiMoss', x + 0.5, y, 0.03, 0.14, 0.22, 4);
    }
  });
}

/* The abandoned cars, the town's own: a kei van by the turning circle and
 * a sedan at the gate, both drawn by the kit. */
function cars(T) {
  T.asset({ type: 'car', style: 'keivan', dims: { variant: 4 } }, 1, 214, 92, 0, 0.6);
  T.asset({ type: 'car', style: 'sedan', dims: { variant: 9 } }, 1, 186, 40, 0, 1.75);
}


/*
 * THE POLES ON THE TERRACE, the town's concrete pole (../../props/street.js)
 * in two lines, along the front path and behind the wings to the boiler
 * house, and their wires: three a span, hung from the crossarm, drawn as
 * lines by ./index.js and never solid, as the town's are. The road's own
 * poles are the document's (./yard.js), which the pipeline wires itself.
 */
const POLE_H = 9;
const TERRACE_POLES = [
  [[84, 141], [124, 141], [164, 141], [236, 141], [276, 141], [316, 141]],
  [[100, 168], [140, 168], [180, 172], [220, 172], [260, 168], [300, 170]],
];
function poles(T) {
  for (const line of TERRACE_POLES) {
    for (const [px, py] of line) {
      T.asset({ type: 'utilityPole', dims: { height: POLE_H } }, 1, px, py, TH, 0);
    }
    for (let i = 0; i + 1 < line.length; i += 1) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      for (const o of [-0.62, 0, 0.62]) {
        T.wire('rope', [ax, ay + o, TH + POLE_H - 0.25], [bx, by + o, TH + POLE_H - 0.25], 0.55 + Math.abs(o) * 0.2);
      }
      T.wire('rope', [ax, ay, TH + POLE_H - 1.55], [bx, by, TH + POLE_H - 1.55], 0.8);
    }
  }
}

/* An iron railing along the terrace's edge, its posts and two rails,
 * rusted and bent in places; drawn only. */
function railing(T, r) {
  T.dress(() => {
    T.wide(() => {
      const y = TERRACE.y0 + 0.3;
      for (const [x0, x1] of [[TERRACE.x0 + 0.5, STAIR.x0 - 1.2], [STAIR.x1 + 1.2, TERRACE.x1 - 0.5]]) {
        for (let x = x0; x <= x1; x += 2.4) {
          if (r.chance(0.06)) {
            continue;
          }
          T.cyl('rustDeep', [x, y, TH + 0.25], [x, y, TH + 1.25], 0.03, 4);
        }
        T.cyl('rustDeep', [x0, y, TH + 1.2], [x1, y, TH + 1.2], 0.03, 4);
        T.cyl('rustDeep', [x0, y, TH + 0.7], [x1, y, TH + 0.7], 0.025, 4);
      }
    });
  });
}

/*
 * The site: { parts, T }, as ../sunny/plan.js returns Sunnyfield's: the
 * parts in the world frame, and the builder for everything ./index.js
 * draws over them.
 */
export function sanaLayout() {
  const T = new Town();
  const r = rng(30);
  site(T, r);
  sanatorium(T);
  pond(T);
  greenhouse(T);
  pavilion(T);
  pergola(T);
  busStop(T);
  notices(T);
  for (const b of HOARDINGS) {
    hoarding(T, b);
  }
  poles(T);
  railing(T, r);
  trees(T);
  cars(T);
  overgrowth(T);
  const parts = [...T.P.list];
  T.scaled.forEach((a, i) => {
    a.el.id = `sana-${i + 1}`;
    parts.push(...scaledParts(a));
  });
  return { parts, T };
}

/* Where the pilot starts: on the road outside the gate, facing north up
 * the grounds to the sanatorium on its terrace. */
export const SPAWN = { px: 200, py: 13, h: 0.03, deg: 90 };

/*
 * THE NAMED GAPS, each { name, px, py, deg, w, h0, h1, points }: the foot
 * of the window's middle in the plan, the heading it is flown along in
 * whole degrees, its clear width and the bottom and top of its clear
 * height, inside the opening by more than the craft's radius (M).
 *
 * The park race comes first, in its order, numbered: the gate, the
 * wisteria, the sun pavilion, under the bridge, the greenhouse, under the
 * walkway, the water tower, the boiler house, the porch and the hall. Then
 * the sanatorium's own lines.
 */
const M = 0.3;
export function sanaGaps() {
  const [west, east] = WINGS;
  const wardAt = (wing, k) => bayOf(wing, k).mid;
  const corridorH = (st) => [TH + FL * st + M, TH + FL * st + 3.0 - M];
  const C = CHAPEL;
  const chapelMid = (C.x0 + C.x1) / 2;
  const race = [
    { name: '1 THE GATE', px: GATE.px, py: GATE.py, deg: 90, w: GATE.w - 0.3 - 2 * M, h0: M, h1: 4.0, points: 100 },
    { name: '2 WISTERIA WALK', px: (PERGOLA.x0 + PERGOLA.x1) / 2, py: (PERGOLA.y0 + PERGOLA.y1) / 2, deg: 90, w: PERGOLA.x1 - PERGOLA.x0 - 0.6 - 2 * M, h0: M, h1: PERGOLA.h - 0.3, points: 250 },
    { name: '3 SUN PAVILION', px: 254, py: (PAVILION.y0 + PAVILION.y1) / 2, deg: 180, w: PAVILION.y1 - PAVILION.y0 - 0.6 - 2 * M, h0: 0.3 + M, h1: PAVILION.h - M, points: 250 },
    { name: '4 UNDER THE BRIDGE', px: (BRIDGE.piers[0] + BRIDGE.piers[1]) / 2, py: BRIDGE.py, deg: 90, w: BRIDGE.piers[1] - BRIDGE.piers[0] - 0.8 - 2 * M, h0: 0.2 + M, h1: BRIDGE.deck - 0.25 - M, points: 500 },
    { name: '5 THE GREENHOUSE', px: (GREEN.x0 + GREEN.x1) / 2, py: (GREEN.y0 + GREEN.y1) / 2, deg: 180, w: GREEN.y1 - GREEN.y0 - 2.4 - 2 * M, h0: M, h1: GREEN.eave - M, points: 250 },
    { name: '6 UNDER THE WALKWAY', px: 98, py: (WALK.y0 + WALK.y1) / 2, deg: 90, w: 4 - 0.24 - 2 * M, h0: TH + M, h1: WALK.h - M, points: 500 },
    { name: '7 THE WATER TOWER', px: WATER.px, py: WATER.py, deg: 0, w: 2 * WATER.half - 2 * WATER.legR - 2 * M, h0: TH + M, h1: WATER.brace - M, points: 250 },
    { name: '8 THE BOILER HOUSE', px: (BOILER.x0 + BOILER.x1) / 2, py: (BOILER.door0 + BOILER.door1) / 2, deg: 0, w: BOILER.door1 - BOILER.door0 - 2 * M, h0: TH + M, h1: BOILER.doorH - M, points: 500 },
    { name: '9 THE PORCH', px: (PORCH.x0 + PORCH.x1) / 2, py: (PORCH.y0 + PORCH.y1) / 2, deg: 90, w: PORCH.x1 - PORCH.x0 - 1.3 - 2 * M, h0: TH + 0.15 + M, h1: PORCH.h - M, points: 250 },
    { name: '10 THROUGH THE HALL', px: (ADMIN.x0 + ADMIN.x1) / 2, py: ADMIN.y1, deg: 90, w: 4 - 2 * M, h0: TH + M, h1: TH + 3.2 - M, points: 500 },
  ];
  const lines = [
    { name: 'THE LONG CORRIDOR', px: wardAt(west, 6), py: (SEC.c1 + SEC.n0) / 2, deg: 0, w: SEC.n0 - SEC.c1 - 2 * M, h0: corridorH(0)[0], h1: TH + FL - 0.3 - M, points: 1000 },
    { name: 'EAST CORRIDOR', px: wardAt(east, 6), py: (SEC.c1 + SEC.n0) / 2, deg: 0, w: SEC.n0 - SEC.c1 - 2 * M, h0: corridorH(0)[0], h1: TH + FL - 0.3 - M, points: 500 },
    { name: 'THE VERANDA', px: wardAt(west, 3), py: (SEC.col1 + SEC.s0) / 2, deg: 0, w: SEC.s0 - SEC.col1 - 2 * M, h0: TH + M, h1: TH + FL - 0.3 - M, points: 500 },
    { name: 'WARD SEVEN', px: wardAt(west, 6), py: SEC.s0, deg: 90, w: 2.2 - 2 * M, h0: TH + 0.8 + M, h1: TH + 3.0 - M, points: 500 },
    { name: 'WARD EIGHT', px: wardAt(east, 7), py: SEC.s0, deg: 90, w: 2.2 - 2 * M, h0: TH + 0.8 + M, h1: TH + 3.0 - M, points: 500 },
    { name: 'FIRST FLOOR CROSSING', px: wardAt(west, 3), py: SEC.n0, deg: 90, w: 2.0 - 2 * M, h0: TH + FL + 0.9 + M, h1: TH + FL + 2.9 - M, points: 1000 },
    { name: 'FIRST FLOOR WARD', px: wardAt(east, 5), py: SEC.s0, deg: 90, w: 2.2 - 2 * M, h0: TH + FL + 0.8 + M, h1: TH + FL + 3.0 - M, points: 1000 },
    { name: 'OUT OF THE DROP', px: wardAt(east, 3), py: SEC.s0, deg: 90, w: 2.2 - 2 * M, h0: TH + 0.8 + M, h1: TH + 3.0 - M, points: 1000 },
    { name: 'THE BELVEDERE', px: (TOWER.x0 + TOWER.x1) / 2, py: (TOWER.y0 + TOWER.y1) / 2, deg: 0, w: TOWER.y1 - TOWER.y0 - 2 * TOWER.pier - 2 * M, h0: TOWER.bel0 + M, h1: TOWER.bel1 - M, points: 1000 },
    { name: 'THE BELL GABLE', px: chapelMid, py: (BELFRY.y0 + BELFRY.y1) / 2, deg: 90, w: BELFRY.w - 2 * M, h0: BELFRY.s + M, h1: BELFRY.e - M, points: 1000 },
    { name: 'CHAPEL DOOR', px: chapelMid, py: C.y0, deg: 90, w: C.doorW - 2 * M, h0: TH + 0.2 + M, h1: TH + C.doorH - M, points: 250 },
    { name: 'THROUGH THE CHAPEL', px: chapelMid, py: (SEC.c1 + SEC.n0) / 2, deg: 0, w: SEC.n0 - SEC.c1 - 2 * M, h0: TH + M, h1: TH + 3.0 - M, points: 500 },
    { name: 'TANK LEGS', px: WATER.px, py: WATER.py, deg: 90, w: 2 * WATER.half - 2 * WATER.legR - 2 * M, h0: WATER.brace + 0.4 + M, h1: WATER.tank0 - 0.5 - M, points: 500 },
  ];
  return [...race, ...lines];
}

/* The title camera's tour: round the grounds, up over the terrace, past
 * the tower and down the wings. */
export function tourPoints() {
  return [
    [200, 4, 6], [260, 60, 14], [320, 120, 22], [300, 190, 30], [200, 210, 40], [100, 190, 30], [70, 120, 20], [140, 60, 14],
  ];
}

/* Kept for the check: the hole a drop dives into. */
export const DROP = holeOf(WINGS[1], 3);
