/*
 * farm.js: the plain between the meet and the old line. The farm road
 * north with its poles, the larch windbreaks that cut the plain into
 * fields the way Tokachi's shelterbelts do, the patchwork of stubble,
 * ploughed earth, beet and pasture, a dairy farm with a red gambrel barn,
 * two silos, a blue roofed farmhouse with its kerosene tank, vinyl houses
 * and Holsteins, a small shrine in a grove, a bus stop, an avenue of
 * birches, a potato store, a pond, a lone oak and lines of wrapped bales.
 *
 * THE LINES. The barn is open at both gable ends, so its 36 m ground floor
 * is a run; the two silos stand two metres apart; the vinyl houses are
 * open hoops 36 m long; the torii is the shrine's; every windbreak has a
 * tree missing somewhere, a gap of air in a wall of gold; and the road's
 * birch avenue is a corridor to cruise at speed toward the turbines.
 *
 * Every number is in the plan's frame (./frame.js).
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

import { rng, W } from './frame.js';
import { sincos } from '../../props/trig.js';

/* The farm road north, gravel, and the made road along the south. */
export const ROAD = { x0: 119.5, x1: 124.5, cx: 122, y0: 34, y1: 1546 };
export const SOUTH_ROAD = { y0: 24, y1: 34 };

/* The windbreaks: two staggered lines of larch 4 m apart, east and west
 * across the plain, broken for the road. `miss` is the tree left out of
 * the north line, the gap a pilot finds. */
export const BREAKS = [
  { py: 650, miss: 268 },
  { py: 1080, miss: 413 },
  { py: 1486, miss: 538 },
];
const BREAK_STEP = 5;

/* The barn: 14 m across, 36 m long, its gambrel roof from 5 m to 12 m. */
export const BARN = { x0: 223, x1: 237, y0: 760, y1: 796, wall: 5.0, knee: 9.0, ridge: 12.0, kneeIn: 2.4, door: 4.4 };
export const SILOS = { px: [244.5, 251.5], py: 772, r: 2.5, h: 18 };
export const VINYL = { px: [276, 284, 292], y0: 800, y1: 836, r: 3, wall: 1.0 };
export const TORII = { px: 60, py: 694, half: 1.85, h: 4.3 };
export const OAK = { px: 430, py: 1300 };

/* ---- the trees ---- */

/* A larch: a straight stem and a narrow spire of gold in two cones. Solid
 * as the town's pines are: a capsule up the middle of the crown and the
 * largest ball the skirt holds. */
function larch(T, px, py, k, deep) {
  const H = 13 + 5 * k;
  const base = 2.2 + k;
  const r = 1.9 + 0.5 * k;
  T.post('kzBark', px, py, 0, base + 1, 0.2, { name: 'larch stem', kind: 'tree' });
  const m = deep ? 'kzLarchDeep' : 'kzLarch';
  T.cone(m, px, py, base, r, (H - base) * 0.62, 8);
  T.cone(m, px, py, base + (H - base) * 0.42, r * 0.66, (H - base) * 0.58, 7);
  const ht = H - base;
  const sinA = r / Math.hypot(r, ht * 0.62);
  const rin = (ht * 0.62 * sinA) / (1 + sinA);
  T.cap(m, [px, py, base + rin], [px, py, base + rin], rin * 0.92, { draw: false, name: 'canopy', kind: 'canopy' });
  T.cap(m, [px, py, base + rin], [px, py, H - 3.2], 0.55, { draw: false, name: 'canopy', kind: 'canopy' });
}

/* A birch: a white stem with its dark marks, a lean, and a crown of lemon
 * leaves in clumps. Solid: the stem, and a ball in the crown. */
function birch(T, px, py, r) {
  const H = 9 + r.range(0, 4);
  const lean = r.range(-0.4, 0.4);
  const top = [px + lean, py + lean * 0.5, H * 0.7];
  T.cap('kzBirch', [px, py, 0], top, 0.14, { name: 'birch stem', kind: 'tree', rTop: 0.09 });
  T.dress(() => {
    for (let k = 0; k < 4; k += 1) {
      const f = 0.12 + k * 0.17;
      T.box('kzBirchMark', px + lean * f - 0.15, py + lean * f * 0.5 - 0.05, H * 0.7 * f, px + lean * f + 0.15, py + lean * f * 0.5 + 0.05, H * 0.7 * f + 0.07);
    }
  });
  const c = [top[0], top[1], H * 0.72];
  T.leaves.push({ m: 'kzBirchLeaf', c, r: 1.6, ry: 1.9, n: 4, seed: Math.round(px * 7 + py) });
  T.cap('kzBirchLeaf', c, c, 1.2, { draw: false, name: 'canopy', kind: 'canopy' });
}

/* A fir for the shrine's grove: three tiers, solid down its middle. */
function fir(T, px, py, k) {
  const H = 10 + 4 * k;
  T.post('kzBark', px, py, 0, 1.6, 0.22, { name: 'fir stem', kind: 'tree' });
  const tiers = [[1.4, 2.6, H * 0.45], [H * 0.3, 2.0, H * 0.42], [H * 0.58, 1.3, H * 0.42]];
  for (const [b, rr, ht] of tiers) {
    T.cone('kzFir', px, py, b, rr + k * 0.4, ht, 9);
  }
  T.cap('kzFir', [px, py, 2.6], [px, py, H - 2.4], 0.9, { draw: false, name: 'canopy', kind: 'canopy' });
}

/* ---- the land ---- */

/*
 * THE PATCHWORK. Each field is a rectangle of paint with rows drawn on it
 * along its length: furrows on ploughed earth, drills of beet, the combine's
 * swathes on stubble. Paint is drawn at every range on High and Medium,
 * because rows that appear as a quad closes on them are seen appearing,
 * and the fields themselves on every preset.
 */
const CROPS = {
  stubble: { m: 'kzStubble', row: 'kzHay', every: 4, w: 0.9 },
  plough: { m: 'kzSoil', row: 'kzSoilDark', every: 1.6, w: 0.5 },
  beet: { m: 'kzSoil', row: 'kzBeet', every: 0.9, w: 0.45 },
  pasture: { m: 'kzPasture', row: null },
  mown: { m: 'kzMown', row: 'kzPasture', every: 6, w: 2.4 },
};

function field(T, x0, y0, x1, y1, crop, alongX) {
  const C = CROPS[crop];
  T.paint(C.m, x0, y0, 0.004, x1, y1, 0.008);
  if (!C.row) {
    return;
  }
  T.dress(() => T.wide(() => {
    if (alongX) {
      for (let y = y0 + C.every / 2; y < y1 - C.w; y += C.every) {
        T.paint(C.row, x0 + 1, y, 0.008, x1 - 1, y + C.w, 0.011);
      }
    } else {
      for (let x = x0 + C.every / 2; x < x1 - C.w; x += C.every) {
        T.paint(C.row, x, y0 + 1, 0.008, x + C.w, y1 - 1, 0.011);
      }
    }
  }));
}

function fields(T) {
  /* Between the meet and the first windbreak, both sides. */
  field(T, 4, 540, 114, 640, 'stubble', true);
  field(T, 470, 440, 636, 640, 'plough', false);
  /* Between the first and second windbreaks. */
  field(T, 4, 660, 114, 1070, 'beet', false);
  field(T, 130, 960, 330, 1070, 'stubble', true);
  field(T, 340, 660, 636, 860, 'pasture', true);
  field(T, 340, 870, 636, 1070, 'plough', true);
  /* Between the second and the third. */
  field(T, 4, 1090, 108, 1476, 'stubble', false);
  field(T, 136, 1090, 330, 1300, 'plough', false);
  field(T, 136, 1310, 330, 1476, 'mown', true);
  field(T, 340, 1090, 636, 1476, 'stubble', true);
  /* North of the last windbreak, round the old line and the turbines. */
  field(T, 4, 1500, 636, 1756, 'pasture', true);
}

/* A field gate and a fence of posts and two wires along a pasture. */
function fence(T, x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / 4));
  T.dress(() => T.wide(() => {
    for (let i = 0; i <= n; i += 1) {
      const f = i / n;
      T.post('kzWoodDark', x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 0, 1.2, 0.06, { solid: false });
    }
  }));
  for (const h of [0.6, 1.05]) {
    T.wire('kzIron', [x0, y0, h], [x1, y1, h], 0.03, 0.012);
  }
}

/* ---- the windbreaks ---- */

function windbreaks(T) {
  const r = rng(6113);
  for (const b of BREAKS) {
    for (const [dy, off] of [[0, 0], [4, BREAK_STEP / 2]]) {
      for (let x = 8 + off; x < W - 6; x += BREAK_STEP) {
        if (x > ROAD.x0 - 9 && x < ROAD.x1 + 9) {
          continue;
        }
        if (dy === 0 && Math.abs(x - b.miss) < 1) {
          continue;
        }
        if (dy === 4 && Math.abs(x - b.miss) < 3) {
          continue;
        }
        const jx = x + r.range(-0.6, 0.6);
        larch(T, jx, b.py + dy + r.range(-0.5, 0.5), r.range(0, 1), r.chance(0.3));
      }
    }
    /* The fallen needles under the line, a band of gold on the grass. */
    T.paint('kzLarchDeep', 4, b.py - 3, 0.003, ROAD.x0 - 6, b.py + 7, 0.007);
    T.paint('kzLarchDeep', ROAD.x1 + 6, b.py - 3, 0.003, W - 4, b.py + 7, 0.007);
  }
}

/* ---- the farm ---- */

/*
 * THE BARN, a dairy barn of the kind Hokkaido's farms took from America a
 * century ago: red boards, white trim, a gambrel roof, a hayloft door in
 * each gable and ventilators on the ridge. Its ground floor is open from
 * end to end through doors 4.4 m square, with the cows' stalls down each
 * side; the loft over it is closed.
 */
function barn(T) {
  const B = BARN;
  const cx = (B.x0 + B.x1) / 2;
  const hd = B.door / 2;
  const t = 0.25;
  /* The side walls, east and west, with windows drawn on them. */
  T.box('kzBarn', B.x0, B.y0, 0, B.x0 + t, B.y1, B.wall, { name: 'barn wall' });
  T.box('kzBarn', B.x1 - t, B.y0, 0, B.x1, B.y1, B.wall, { name: 'barn wall' });
  /* The gable ends, each a wall with the big door in it, up to the loft
   * floor; above that the gable is filled to the roof. */
  for (const [y0, y1] of [[B.y0, B.y0 + t], [B.y1 - t, B.y1]]) {
    T.box('kzBarn', B.x0, y0, 0, cx - hd, y1, B.wall, { name: 'barn gable' });
    T.box('kzBarn', cx + hd, y0, 0, B.x1, y1, B.wall, { name: 'barn gable' });
    T.box('kzBarn', cx - hd, y0, B.door, cx + hd, y1, B.wall, { name: 'barn lintel' });
  }
  /* The loft floor, the ceiling of the run. */
  T.box('kzWoodDark', B.x0, B.y0, B.wall, B.x1, B.y1, B.wall + 0.3, { name: 'loft floor', draw: false });
  T.paint('kzWoodDark', B.x0 + t, B.y0 + t, B.wall - 0.02, B.x1 - t, B.y1 - t, B.wall);
  /* The gambrel: steep lower slopes to the knee, shallow upper ones to the
   * ridge, overhanging the walls a little; red gables under it. */
  const o = 0.4;
  const kx0 = B.x0 + B.kneeIn;
  const kx1 = B.x1 - B.kneeIn;
  const roof = [[B.x0 - o, B.wall - 0.25], [kx0, B.knee], [cx, B.ridge], [kx1, B.knee], [B.x1 + o, B.wall - 0.25],
    [B.x1 + o, B.wall - 0.5], [kx1, B.knee - 0.25], [cx, B.ridge - 0.25], [kx0, B.knee - 0.25], [B.x0 - o, B.wall - 0.5]];
  T.prism('kzBarnDark', 'y', roof, B.y0 - 0.5, B.y1 + 0.5);
  const gable = [[B.x0, B.wall], [kx0 + 0.1, B.knee - 0.2], [cx, B.ridge - 0.3], [kx1 - 0.1, B.knee - 0.2], [B.x1, B.wall]];
  T.prism('kzBarn', 'y', gable, B.y0, B.y1);
  /* Solid: the loft as steps inside the roof. */
  const steps = 7;
  for (let k = 0; k < steps; k += 1) {
    const h0 = B.wall + ((B.ridge - 0.3 - B.wall) * k) / steps;
    const h1 = B.wall + ((B.ridge - 0.3 - B.wall) * (k + 1)) / steps;
    const half = (h) => (h <= B.knee ? (B.x1 - B.x0) / 2 - (B.kneeIn * (h - B.wall)) / (B.knee - B.wall) : (cx - kx0) * (1 - (h - B.knee) / (B.ridge - B.knee)));
    const hw = Math.max(0.3, half(h1) - 0.05);
    T.hidden(cx - hw, B.y0, h0, cx + hw, B.y1, h1, 'wall', 'barn loft');
  }
  /* The white trim: corner boards, the door's frame and its cross brace,
   * the hayloft door in each gable and its hood. */
  T.dress(() => T.wide(() => {
    for (const [y, f] of [[B.y0 - 0.03, 's'], [B.y1 + 0.03, 'n']]) {
      const s = f === 's' ? -1 : 1;
      T.paint('kzTrim', cx - hd - 0.25, y, 0, cx - hd, y + s * 0.03, B.door + 0.25);
      T.paint('kzTrim', cx + hd, y, 0, cx + hd + 0.25, y + s * 0.03, B.door + 0.25);
      T.paint('kzTrim', cx - hd - 0.25, y, B.door, cx + hd + 0.25, y + s * 0.03, B.door + 0.25);
      T.paint('kzTrim', cx - 1.2, y, 6.6, cx + 1.2, y + s * 0.03, 6.8);
      T.paint('kzTrim', cx - 1.2, y, 8.8, cx + 1.2, y + s * 0.03, 9.0);
      T.paint('kzTrim', cx - 1.2, y, 6.6, cx - 1.0, y + s * 0.03, 9.0);
      T.paint('kzTrim', cx + 1.0, y, 6.6, cx + 1.2, y + s * 0.03, 9.0);
      T.paint('kzBarnDark', cx - 1.0, y, 6.8, cx + 1.0, y + s * 0.02, 8.8);
      /* The open doors, folded back against the gable. */
      T.paint('kzBarnDark', cx - hd - 2.3, y + s * 0.05, 0.1, cx - hd - 0.3, y + s * 0.12, B.door - 0.1);
      T.paint('kzBarnDark', cx + hd + 0.3, y + s * 0.05, 0.1, cx + hd + 2.3, y + s * 0.12, B.door - 0.1);
    }
    for (const x of [B.x0 - 0.03, B.x1 + 0.03]) {
      const s = x < cx ? -1 : 1;
      for (let y = B.y0 + 3; y < B.y1 - 2; y += 4) {
        T.paint('kzTrim', x, y, 2.2, x + s * 0.03, y + 1.4, 3.4);
        T.paint('kzGlassDark', x + s * 0.01, y + 0.15, 2.35, x + s * 0.04, y + 1.25, 3.25);
      }
    }
  }));
  T.hidden(cx - 1.25, B.y0 - 0.4, 9.05, cx + 1.25, B.y0, 9.4, 'wall', 'hood');
  T.deco('kzBarnDark', cx - 1.3, B.y0 - 0.45, 9.05, cx + 1.3, B.y0, 9.3);
  T.deco('kzBarnDark', cx - 1.3, B.y1, 9.05, cx + 1.3, B.y1 + 0.45, 9.3);
  T.hidden(cx - 1.25, B.y1, 9.05, cx + 1.25, B.y1 + 0.4, 9.4, 'wall', 'hood');
  /* Ventilators on the ridge. */
  for (const y of [B.y0 + 8, (B.y0 + B.y1) / 2, B.y1 - 8]) {
    T.box('kzTrim', cx - 0.8, y - 0.8, B.ridge - 0.4, cx + 0.8, y + 0.8, B.ridge + 1.0, { name: 'ventilator' });
    T.frustum('kzBarnDark', { x0: cx - 1.1, y0: y - 1.1, x1: cx + 1.1, y1: y + 1.1 }, B.ridge + 1.0, { x0: cx - 0.1, y0: y - 0.1, x1: cx + 0.1, y1: y + 0.1 }, B.ridge + 1.8);
    T.hidden(cx - 0.7, y - 0.7, B.ridge + 1.0, cx + 0.7, y + 0.7, B.ridge + 1.4, 'wall', 'ventilator');
  }
  /* Inside: the stalls down each side, a feed alley, bales at the ends. */
  T.dress(() => {
    for (const sx of [-1, 1]) {
      const rail = sx < 0 ? B.x0 + 3.2 : B.x1 - 3.2;
      T.cyl('kzSteel', [rail, B.y0 + 2, 1.1], [rail, B.y1 - 2, 1.1], 0.04, 5);
      for (let y = B.y0 + 2; y <= B.y1 - 2; y += 1.3) {
        T.post('kzSteel', rail, y, 0, 1.2, 0.03);
      }
      T.paint('kzHay', sx < 0 ? B.x0 + 0.3 : rail + 0.2, B.y0 + 2, 0.01, sx < 0 ? rail - 0.2 : B.x1 - 0.3, B.y1 - 2, 0.03);
    }
  });
  T.box('kzHay', B.x0 + 0.3, B.y1 - 2.2, 0, B.x0 + 2.6, B.y1 - 0.3, 1.8, { name: 'bales' });
  T.box('kzHay', B.x1 - 2.6, B.y0 + 0.3, 0, B.x1 - 0.3, B.y0 + 2.2, 2.4, { name: 'bales' });
  T.sign('barnName', cx, B.y0 - 0.06, 10.4, 3.2, 0.7, 's');
  T.take(cx, (B.y0 + B.y1) / 2, 0);
}

/* The two silos: concrete staves, steel hoops, a dome and a ladder cage. */
function silos(T) {
  const S = SILOS;
  for (const px of S.px) {
    T.post('kzSilo', px, S.py, 0, S.h, S.r, { name: 'silo', seg: 16, kind: 'wall' });
    T.disc('kzRoofGreen', px, S.py, S.r + 0.1, S.h - 0.1, S.h + 0.15, 16);
    T.ball('kzRoofGreen', px, S.py, S.h + 0.1, S.r * 0.98);
    T.dress(() => T.wide(() => {
      for (let h = 1.5; h < S.h; h += 1.5) {
        T.torus('kzSteel', px, S.py, h, S.r + 0.03, 0.035, 0, 0, 4, 20);
      }
    }));
    /* The ladder cage up the north side. */
    T.cyl('kzSteel', [px - 0.25, S.py + S.r + 0.25, 0.5], [px - 0.25, S.py + S.r + 0.25, S.h], 0.03, 4);
    T.cyl('kzSteel', [px + 0.25, S.py + S.r + 0.25, 0.5], [px + 0.25, S.py + S.r + 0.25, S.h], 0.03, 4);
  }
  /* The silos' solid tops are the dome's ball, inside the drawn dome. */
  for (const px of S.px) {
    T.cap('kzRoofGreen', [px, S.py, S.h], [px, S.py, S.h], S.r * 0.92, { draw: false, name: 'silo dome' });
  }
  /* The feed bins beside them: galvanised hoppers on legs. */
  for (const [bx, by] of [[258, 764], [258, 772]]) {
    T.post('kzTin', bx, by, 2.2, 6.5, 1.3, { name: 'feed bin', seg: 12 });
    T.cone('kzTin', bx, by, 6.5, 1.35, 1.3, 12);
    T.cone('kzTin', bx, by, 1.2, 1.3, 1.0, 12);
    for (const [lx, ly] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      T.post('kzSteel', bx + lx * 0.9, by + ly * 0.9, 0, 2.3, 0.06);
    }
  }
}

/* The farmhouse: two storeys of pale siding under a blue tin roof, the
 * glassed porch every house in Hokkaido has against the wind, a stove
 * pipe, and the kerosene tank on its stand. */
function farmhouse(T) {
  const x0 = 270;
  const x1 = 282;
  const y0 = 734;
  const y1 = 744;
  const eave = 6.0;
  const ridge = 8.6;
  T.box('kzSiding', x0, y0, 0, x1, y1, eave, { name: 'farmhouse' });
  const my = (y0 + y1) / 2;
  T.prism('kzRoofBlue', 'x', [[y0 - 0.6, eave - 0.1], [my, ridge], [y1 + 0.6, eave - 0.1], [y1 + 0.6, eave - 0.3], [my, ridge - 0.2], [y0 - 0.6, eave - 0.3]], x0 - 0.5, x1 + 0.5);
  T.prism('kzSiding', 'x', [[y0, eave], [my, ridge - 0.25], [y1, eave]], x0, x1);
  T.frustumSolid({ x0, y0, x1, y1 }, eave, { x0, y0: my - 0.3, x1, y1: my + 0.3 }, ridge - 0.3, 4, 'farmhouse roof');
  /* The porch: a glassed box at the front door, its own small roof. */
  T.box('kzSiding', 273, y0 - 2.2, 0, 277, y0, 2.6, { name: 'porch' });
  T.deco('kzGlass', 273.3, y0 - 2.23, 0.9, 276.7, y0 - 2.2, 2.3);
  T.deco('kzRoofBlue', 272.8, y0 - 2.5, 2.6, 277.2, y0, 2.8);
  /* Windows on both floors, front and side. */
  T.dress(() => T.wide(() => {
    for (const wxp of [271.2, 278, 280]) {
      for (const h of [1.0, 3.8]) {
        if (wxp < 272 && h < 2) {
          continue;
        }
        T.paint('kzTrim', wxp - 0.08, y0 - 0.03, h - 0.08, wxp + 1.28, y0, h + 1.38);
        T.paint('kzGlass', wxp, y0 - 0.05, h, wxp + 1.2, y0 - 0.02, h + 1.3);
      }
    }
    for (const wy of [736, 740]) {
      for (const h of [1.0, 3.8]) {
        T.paint('kzTrim', x1, wy - 0.08, h - 0.08, x1 + 0.03, wy + 1.28, h + 1.38);
        T.paint('kzGlass', x1 + 0.02, wy, h, x1 + 0.05, wy + 1.2, h + 1.3);
      }
    }
  }));
  /* The stove pipe up the east gable and over the eave. */
  T.cyl('kzSteel', [x1 + 0.3, 739, 1.0], [x1 + 0.3, 739, ridge + 0.8], 0.11, 8);
  T.cone('kzIron', x1 + 0.3, 739, ridge + 0.8, 0.24, 0.3, 8);
  /* The kerosene tank on its stand, red, by the back door. */
  T.box('kzSteel', 266.4, 739.2, 0, 268.0, 740.8, 0.9, { name: 'tank stand' });
  T.cap('kzRed', [266.6, 740, 1.4], [267.8, 740, 1.4], 0.45, { look: 'capsule', name: 'kerosene tank' });
  T.cyl('kzIron', [267.2, 740, 0.9], [270, 740, 0.9], 0.02, 4);
  /* A kei truck at the door. */
  T.asset({ type: 'car', style: 'kei', dims: { variant: 3 } }, 1, 286, 730, 0, Math.PI / 2);
  T.take(276, 739, 9);
}

/* The vinyl houses: hoops of steel and clear sheeting on a short wall,
 * open at both ends, a crop in rows inside. Each hoop is solid as boxes
 * stepped round its arch, their inner corners on the drawn arch, and the
 * short walls; the bore is clear. */
function vinyl(T) {
  const V = VINYL;
  const SC = { s: 0, c: 1 };
  const SD = { s: 0, c: 1 };
  for (const cx of V.px) {
    T.box('kzVinyl', cx - V.r - 0.05, V.y0, 0, cx - V.r, V.y1, V.wall, { name: 'vinyl wall' });
    T.box('kzVinyl', cx + V.r, V.y0, 0, cx + V.r + 0.05, V.y1, V.wall, { name: 'vinyl wall' });
    T.vaults.push({ cx, y0: V.y0, y1: V.y1, r: V.r, h: V.wall });
    const n = 10;
    for (let k = 0; k < n; k += 1) {
      sincos((k * Math.PI) / (2 * n), SC);
      sincos(((k + 1) * Math.PI) / (2 * n), SD);
      /* From angle a0 to a1 above the level, each side: the box's outer
       * edge 6 cm outside the sheet. */
      for (const s of [-1, 1]) {
        const xa = V.r * SC.c;
        const xb = V.r * SD.c;
        const lo = Math.min(xa, xb);
        const hi = Math.max(xa, xb) + 0.06;
        T.hidden(cx + s * lo, V.y0, V.wall + V.r * SC.s, cx + s * hi, V.y1, V.wall + V.r * SD.s + 0.06, 'wall', 'vinyl hoop');
      }
    }
    /* The rows inside: green drills on dark earth. */
    T.paint('kzSoilDark', cx - V.r + 0.2, V.y0 + 0.3, 0.004, cx + V.r - 0.2, V.y1 - 0.3, 0.008);
    T.dress(() => {
      for (const rx of [-1.6, 0, 1.6]) {
        for (let y = V.y0 + 1; y < V.y1 - 1; y += 1.2) {
          T.bead('kzBeet', cx + rx, y, 0.22, 0.3);
        }
      }
    });
  }
}

/* The Holsteins on the pasture, standing and lying, each solid as one
 * capsule along its body. */
function cows(T) {
  const r = rng(7331);
  for (let i = 0; i < 14; i += 1) {
    const px = 360 + r.range(0, 260);
    const py = 680 + r.range(0, 160);
    const SC = { s: 0, c: 1 };
    sincos(r.range(0, Math.PI * 2), SC);
    const tx = SC.c;
    const ty = SC.s;
    const lying = r.chance(0.3);
    const h = lying ? 0.55 : 1.15;
    const a = [px - tx * 0.75, py - ty * 0.75, h];
    const b = [px + tx * 0.75, py + ty * 0.75, h];
    T.cap('kzWhite', a, b, 0.45, { look: 'capsule', name: 'cow', kind: 'wall' });
    /* The patches, the head and the legs. */
    T.ball('kzIron', px - tx * 0.3 - ty * 0.25, py - ty * 0.3 + tx * 0.25, h + 0.18, 0.3);
    T.ball('kzIron', px + tx * 0.5 + ty * 0.2, py + ty * 0.5 - tx * 0.2, h + 0.05, 0.28);
    T.cap('kzIron', [px + tx * 1.2, py + ty * 1.2, h + 0.2], [px + tx * 1.55, py + ty * 1.55, h - 0.05], 0.2, { solid: false, look: 'capsule' });
    T.ball('kzPink', px + tx * 1.62, py + ty * 1.62, h - 0.12, 0.12);
    if (!lying) {
      for (const [f, s] of [[-0.6, -1], [-0.6, 1], [0.6, -1], [0.6, 1]]) {
        T.post('kzWhite', px + tx * f - ty * s * 0.22, py + ty * f + tx * s * 0.22, 0, 0.75, 0.08, { solid: false });
      }
    }
  }
  /* The pasture's fence along the road side and the south. */
  fence(T, 340, 662, 636, 662);
  fence(T, 340, 662, 340, 858);
  fence(T, 340, 858, 636, 858);
}

/* The machine shed: a tin roof on posts, open to the road, a tractor and
 * a plough inside. */
function shed(T) {
  const x0 = 150;
  const x1 = 164;
  const y0 = 880;
  const y1 = 904;
  T.box('kzTin', x1 - 0.15, y0, 0, x1, y1, 5.6, { name: 'shed back' });
  T.box('kzTin', x0, y0, 0, x1, y0 + 0.15, 5.2, { name: 'shed end' });
  T.box('kzTin', x0, y1 - 0.15, 0, x1, y1, 5.2, { name: 'shed end' });
  for (let y = y0; y <= y1 + 0.01; y += 6) {
    T.post('kzSteel', x0 + 0.1, Math.min(y1 - 0.1, Math.max(y0 + 0.1, y)), 0, 4.6, 0.1);
  }
  T.prism('kzRust', 'y', [[x0 - 0.6, 4.6], [x1 + 0.3, 5.7], [x1 + 0.3, 5.5], [x0 - 0.6, 4.4]], y0 - 0.3, y1 + 0.3);
  T.hidden(x0 - 0.5, y0 - 0.2, 4.6, x1 + 0.2, y1 + 0.2, 5.4, 'wall', 'shed roof');
  tractor(T, 157, 888, 'kzTractor');
  T.box('kzRust', 154, 896, 0, 160, 899, 0.9, { name: 'plough' });
}

/* A tractor facing west: big wheels behind, small ones in front, the
 * bonnet and the cab. */
function tractor(T, px, py, colour) {
  T.box(colour, px - 2.0, py - 0.55, 0.8, px - 0.2, py + 0.55, 1.75, { name: 'tractor' });
  T.box(colour, px - 0.2, py - 0.7, 0.9, px + 1.0, py + 0.7, 1.6, { name: 'tractor' });
  T.box('kzIron', px - 0.2, py - 0.7, 1.6, px + 1.1, py + 0.7, 1.7, { solid: false });
  for (const [x0, y0] of [[-0.15, -0.68], [0.95, -0.68], [-0.15, 0.6], [0.95, 0.6]]) {
    T.box('kzIron', px + x0, py + y0, 1.7, px + x0 + 0.08, py + y0 + 0.08, 2.9, { solid: false });
  }
  T.box(colour, px - 0.25, py - 0.75, 2.9, px + 1.15, py + 0.75, 3.0, { name: 'tractor cab' });
  /* The cab is glazed all round, so it is solid to its roof. */
  T.hidden(px - 0.2, py - 0.7, 1.6, px + 1.1, py + 0.7, 2.9, 'wall', 'tractor cab');
  T.deco('kzGlass', px - 0.18, py - 0.66, 1.75, px - 0.12, py + 0.66, 2.85);
  for (const s of [-1, 1]) {
    T.cyl('kzTyre', [px + 0.5, py + s * 0.75, 0.82], [px + 0.5, py + s * 1.25, 0.82], 0.82, 14);
    T.cyl('kzTyre', [px - 1.5, py + s * 0.55, 0.48], [px - 1.5, py + s * 0.85, 0.48], 0.48, 12);
    T.cyl('kzYellow', [px + 0.5, py + s * 1.26, 0.82], [px + 0.5, py + s * 1.27, 0.82], 0.45, 10);
  }
  T.post('kzIron', px - 1.0, py + 0.3, 1.75, 2.6, 0.05, { solid: false });
}

/* The shrine in its grove: a vermilion torii, a stone path, two lanterns
 * and a small hall on a stone base, the grove's firs round it. */
function shrine(T) {
  const { px, py, half, h } = TORII;
  for (const s of [-1, 1]) {
    T.post('kzVermilion', px + s * half, py, 0, h - 0.2, 0.17, { name: 'torii post' });
    T.post('kzIron', px + s * half, py, 0, 0.4, 0.22, { solid: false });
  }
  T.box('kzVermilion', px - half - 0.35, py - 0.12, h - 0.95, px + half + 0.35, py + 0.12, h - 0.7, { name: 'torii nuki' });
  T.box('kzIron', px - half - 0.9, py - 0.22, h - 0.12, px + half + 0.9, py + 0.22, h + 0.08, { name: 'torii kasagi' });
  T.box('kzVermilion', px - half - 0.7, py - 0.18, h - 0.4, px + half + 0.7, py + 0.18, h - 0.12, { name: 'torii shimaki' });
  T.box('kzVermilion', px - 0.15, py - 0.1, h - 0.7, px + 0.15, py + 0.1, h - 0.4, { name: 'torii gakuzuka' });
  T.sign('shrinePlaque', px, py - 0.13, h - 0.55, 0.36, 0.5, 's');
  /* The path of stones to the hall, and the lanterns. */
  T.dress(() => T.wide(() => {
    for (let y = py + 2; y < py + 15; y += 1.2) {
      T.paint('kzStone', px - 0.7, y, 0.008, px + 0.7, y + 0.9, 0.04);
    }
  }));
  for (const s of [-1, 1]) {
    const lx = px + s * 2.2;
    const ly = py + 8;
    T.box('kzStone', lx - 0.35, ly - 0.35, 0, lx + 0.35, ly + 0.35, 0.3, { name: 'lantern' });
    T.post('kzStone', lx, ly, 0.3, 1.2, 0.14, { name: 'lantern' });
    T.box('kzStone', lx - 0.3, ly - 0.3, 1.2, lx + 0.3, ly + 0.3, 1.65, { name: 'lantern' });
    T.frustum('kzStone', { x0: lx - 0.45, y0: ly - 0.45, x1: lx + 0.45, y1: ly + 0.45 }, 1.65, { x0: lx - 0.05, y0: ly - 0.05, x1: lx + 0.05, y1: ly + 0.05 }, 2.0);
  }
  /* The hall: on a stone base, a gabled roof of copper gone green. */
  const hy = py + 17;
  T.box('kzStone', px - 2.2, hy - 1.6, 0, px + 2.2, hy + 1.6, 0.8, { name: 'shrine base' });
  T.box('kzWoodDark', px - 1.6, hy - 1.1, 0.8, px + 1.6, hy + 1.1, 2.9, { name: 'shrine hall' });
  T.prism('kzRoofGreen', 'x', [[hy - 1.9, 2.75], [hy, 4.1], [hy + 1.9, 2.75], [hy + 1.9, 2.55], [hy, 3.9], [hy - 1.9, 2.55]], px - 2.2, px + 2.2);
  T.hidden(px - 2.0, hy - 1.2, 2.9, px + 2.0, hy + 1.2, 3.6, 'wall', 'shrine roof');
  T.deco('kzWood', px - 1.4, hy - 1.15, 1.0, px + 1.4, hy - 1.1, 2.6);
  T.cyl('kzHay', [px - 1.5, hy - 1.25, 2.55], [px + 1.5, hy - 1.25, 2.55], 0.07, 6);
  for (const s of [-1, 0, 1]) {
    T.box('kzWhite', px + s * 0.8 - 0.08, hy - 1.28, 2.15, px + s * 0.8 + 0.08, hy - 1.24, 2.5, { solid: false });
  }
  /* The grove round it, firs, behind and at the sides. */
  const r = rng(808);
  const spots = [[-8, 6], [-9, 13], [-7, 21], [-3, 26], [4, 27], [9, 22], [10, 14], [8, 6], [-12, 18], [13, 18], [0, 31], [-6, 31], [7, 32]];
  for (const [dx, dy] of spots) {
    fir(T, px + dx + r.range(-0.5, 0.5), py + dy + r.range(-0.5, 0.5), r.range(0, 1));
  }
  T.take(px, py, 3);
}

/* The bus stop: a small wooden hut with a bench, its round sign on a
 * pole, and a drinks machine beside it (the document's, ./yard.js). */
export const BUS = { px: 131, py: 1004 };
function busStop(T) {
  const { px, py } = BUS;
  T.box('kzWood', px + 2.4, py - 1.6, 0, px + 2.55, py + 1.6, 2.3, { name: 'hut back' });
  T.box('kzWood', px, py - 1.6, 0, px + 2.55, py - 1.45, 2.3, { name: 'hut side' });
  T.box('kzWood', px, py + 1.45, 0, px + 2.55, py + 1.6, 2.3, { name: 'hut side' });
  T.prism('kzRoofBlue', 'y', [[px - 0.4, 2.35], [px + 2.8, 2.7], [px + 2.8, 2.55], [px - 0.4, 2.2]], py - 1.8, py + 1.8);
  T.hidden(px - 0.3, py - 1.7, 2.3, px + 2.7, py + 1.7, 2.6, 'wall', 'hut roof');
  T.box('kzWoodDark', px + 1.8, py - 1.3, 0.42, px + 2.35, py + 1.3, 0.48, { name: 'bench' });
  T.post('kzSteel', px - 0.4, py + 2.4, 0, 2.4, 0.04, { name: 'bus sign' });
  T.sign('busStop', px - 0.4, py + 2.42, 2.25, 0.55, 0.55, 'w');
  T.take(px + 1.2, py, 2.5);
}

/* The potato store: a corrugated half round, closed, its door at the end. */
export const STORE = { x0: 168, x1: 182, y0: 1196, y1: 1226 };
function store(T) {
  const S = STORE;
  const cx = (S.x0 + S.x1) / 2;
  const r = (S.x1 - S.x0) / 2;
  T.vaults.push({ cx, y0: S.y0, y1: S.y1, r, h: 0, closed: true, m: 'kzTin' });
  /* Solid as six level slabs, each as wide as the vault is at its top,
   * so every one is inside the drawn half round. */
  const SC = { s: 0, c: 1 };
  let h0 = 0;
  for (let k = 0; k < 6; k += 1) {
    sincos(((k + 1) * Math.PI) / 12, SC);
    const h1 = r * SC.s;
    T.hidden(cx - r * SC.c, S.y0, h0, cx + r * SC.c, S.y1, h1, 'wall', 'store');
    h0 = h1;
  }
  if (h0 < r - 0.05) {
    T.hidden(cx - 0.5, S.y0, h0, cx + 0.5, S.y1, r - 0.05, 'wall', 'store');
  }
  T.deco('kzRust', cx - 2, S.y0 - 0.05, 0, cx + 2, S.y0, 3.6);
  T.take(cx, (S.y0 + S.y1) / 2, 0);
}

/* The lone oak in the stubble, the kind every postcard of the plain has. */
function oak(T) {
  const { px, py } = OAK;
  T.cap('kzBark', [px, py, 0], [px + 0.3, py, 5.5], 0.6, { name: 'oak trunk', kind: 'tree', rTop: 0.45 });
  const limbs = [[-3, 1, 8], [3.2, -0.6, 8.6], [0.6, 2.6, 9.2], [-0.8, -2.6, 8.8]];
  for (const [dx, dy, dh] of limbs) {
    T.cap('kzBark', [px + 0.3, py, 5.2], [px + dx, py + dy, dh], 0.24, { name: 'oak limb', kind: 'tree', rTop: 0.14 });
  }
  const blobs = [[0, 0, 11, 4.6], [-4, 1, 9.5, 3.4], [4.2, -0.8, 10, 3.6], [0.8, 3.6, 10.2, 3.2], [-1, -3.6, 10, 3.3], [1.5, 0.5, 13.4, 3.0]];
  for (const [dx, dy, dh, rr] of blobs) {
    T.leaves.push({ m: 'kzOak', c: [px + dx, py + dy, dh], r: rr, ry: rr * 0.8, n: 1, seed: Math.round(dx * 13 + dy * 7 + dh) });
    T.cap('kzOak', [px + dx, py + dy, dh], [px + dx, py + dy, dh], 0.78 * rr * 0.8, { draw: false, name: 'canopy', kind: 'canopy' });
  }
  T.take(px, py, 6);
}

/* The pond: water paint, a rim of reeds, and a jetty. */
function pond(T) {
  const cx = 500;
  const cy = 1180;
  const SC = { s: 0, c: 1 };
  T.wide(() => {
    T.disc('kzWater', cx, cy, 18, 0.004, 0.012, 32);
  });
  T.dress(() => {
    for (let k = 0; k < 40; k += 1) {
      sincos((k * Math.PI) / 20, SC);
      T.cone('kzReed', cx + 18.4 * SC.c, cy + 18.4 * SC.s, 0, 0.25, 1.2 + (k % 3) * 0.3, 4);
    }
  });
  T.box('kzWood', cx - 18.5, cy - 0.7, 0.3, cx - 12, cy + 0.7, 0.42, { name: 'jetty' });
  for (const x of [cx - 17, cx - 14.5, cx - 12.4]) {
    for (const s of [-1, 1]) {
      T.post('kzWoodDark', x, cy + s * 0.6, 0, 0.42, 0.06, { solid: false });
    }
  }
}

/* Wrapped bales, white, in lines across the stubble, solid as a ball
 * inside each: 1.5 m across and 1.2 m long. */
function bale(T, px, py, h, alongX, m = 'kzWrap') {
  const L = 0.6;
  const a = alongX ? [px - L, py, h + 0.75] : [px, py - L, h + 0.75];
  const b = alongX ? [px + L, py, h + 0.75] : [px, py + L, h + 0.75];
  T.cyl(m, a, b, 0.75, 12);
  T.cap(m, [px, py, h + 0.75], [px, py, h + 0.75], 0.6, { draw: false, name: 'bale' });
}

function bales(T) {
  const r = rng(9091);
  for (let line = 0; line < 6; line += 1) {
    const y = 1130 + line * 55;
    for (let i = 0; i < 11; i += 1) {
      const x = 370 + i * 22 + r.range(-3, 3);
      if (Math.hypot(x - OAK.px, y - OAK.py) < 12) {
        continue;
      }
      bale(T, x, y + r.range(-2, 2), 0, r.chance(0.5), r.chance(0.12) ? 'kzWrapDark' : 'kzWrap');
    }
  }
  /* A stack by the barn, three, two and one, and a line along its yard. */
  const sx = 205;
  const sy = 800;
  for (let i = 0; i < 3; i += 1) {
    bale(T, sx + i * 1.5, sy, 0, false, 'kzHay');
  }
  for (let i = 0; i < 2; i += 1) {
    bale(T, sx + 0.75 + i * 1.5, sy, 1.3, false, 'kzHay');
  }
  bale(T, sx + 1.5, sy, 2.6, false, 'kzHay');
  for (let i = 0; i < 8; i += 1) {
    bale(T, 202 + i * 2.1, 760, 0, true);
  }
}

/* The birch avenue along the road, both sides, to the old line. */
function avenue(T) {
  const r = rng(3301);
  for (let y = 1096; y < 1478; y += 9) {
    birch(T, ROAD.x0 - 4.5 + r.range(-0.4, 0.4), y + r.range(-1, 1), r);
    birch(T, ROAD.x1 + 4.5 + r.range(-0.4, 0.4), y + 4.5 + r.range(-1, 1), r);
  }
}

/* The roads: the made road along the south with its lines, and the farm
 * road's gravel north to the old line. */
function roads(T) {
  T.paint('kzAsphalt', 0, SOUTH_ROAD.y0, 0.006, W, SOUTH_ROAD.y1, 0.014);
  T.wide(() => {
    T.paint('kzLine', 0, SOUTH_ROAD.y0 + 0.4, 0.014, W, SOUTH_ROAD.y0 + 0.55, 0.018);
    T.paint('kzLine', 0, SOUTH_ROAD.y1 - 0.55, 0.014, W, SOUTH_ROAD.y1 - 0.4, 0.018);
    for (let x = 2; x < W; x += 8) {
      T.paint('kzLineYellow', x, (SOUTH_ROAD.y0 + SOUTH_ROAD.y1) / 2 - 0.07, 0.014, x + 4, (SOUTH_ROAD.y0 + SOUTH_ROAD.y1) / 2 + 0.07, 0.018);
    }
  });
  T.paint('kzGravel', ROAD.x0, ROAD.y0, 0.009, ROAD.x1, ROAD.y1, 0.015);
  /* The car park by the market's gate, and the track into the meet. */
  T.paint('kzGravel', 470, 40, 0.009, 626, 112, 0.015);
  T.paint('kzGravel', 124.5, 112, 0.009, 300, 118, 0.015);
  /* Snow poles along the farm road, red and white arrows over the verge
   * that show a plough where the road is under the snow. */
  T.dress(() => T.wide(() => {
    for (let y = 60; y < ROAD.y1; y += 50) {
      T.post('kzWhite', ROAD.x0 - 0.9, y, 0, 3.4, 0.04, { solid: false });
      T.deco('kzRed', ROAD.x0 - 1.0, y - 0.03, 3.4, ROAD.x0 - 0.3, y + 0.03, 3.6);
    }
  }));
}

export function farm(T) {
  roads(T);
  fields(T);
  windbreaks(T);
  barn(T);
  silos(T);
  farmhouse(T);
  vinyl(T);
  cows(T);
  shed(T);
  shrine(T);
  busStop(T);
  store(T);
  oak(T);
  pond(T);
  bales(T);
  avenue(T);
  tractor(T, 210, 830, 'kzTractorGreen');
}
