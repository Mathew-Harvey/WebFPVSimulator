/*
 * pond.js: Hinode Park's pond, its drum bridge and what stands round it,
 * after the ponds of Tokyo's old parks: Inokashira's boats and its
 * wisteria, the vermilion 太鼓橋 of Kameido Tenjin, the eight plank bridge
 * over an iris bed that a hundred gardens copy from the Ise tale, a 東屋 on
 * the shore and a 雪見灯籠 on the island.
 *
 * THE POND is two lobes joined by a channel, drawn as overlapping discs of
 * water, each over a slightly wider disc of stone so the shore reads on
 * Low too, with rocks round whatever edge no other disc covers. It is paint
 * on the lawn and not a hole in it: nothing here digs, so the ground is the
 * plant's flat zero everywhere and a quad that ditches in the pond lands
 * on it.
 *
 * THE DRUM BRIDGE crosses the channel west to east, a lacquered arch nine
 * metres across, its soffit 2.75 m over the water at the crown: the pond
 * bridge gap is flown under it, up the channel. Its solid is the arch in
 * slices, each inside the drawn shape between the soffit and the deck.
 *
 * Every solid here uses no trigonometry; the curves are square roots and
 * powers of plain numbers, so they are the same bits everywhere.
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

import { rng } from './frame.js';

/* The pond's discs, plan metres: three for the north lobe, two south. */
export const LOBES = [
  { px: 50, py: 150, r: 15 },
  { px: 70, py: 146, r: 17 },
  { px: 92, py: 138, r: 13 },
  { px: 92, py: 100, r: 12 },
  { px: 71, py: 96, r: 10 },
];
/* The channel between them, walled in stone. */
export const CHANNEL = { x0: 87, x1: 97, y0: 106, y1: 130 };

/* The drum bridge: its middle, the clear span, the soffit's crown, the
 * deck's crown, how far its ramps reach, and its width. */
export const BRIDGE = { px: 92, py: 118, span: 9, soffit: 2.75, crown: 3.15, reach: 7.6, width: 2.4 };

/* The island in the north lobe, the pavilion, the trellis, the boat pier
 * and the plank bridge over the iris bed. */
export const ISLAND = { px: 64, py: 152, r: 4.5 };
export const PAVILION = { px: 104, py: 158, half: 2.2, eave: 2.6 };
export const TRELLIS = { x0: 34, x1: 58, y0: 99, y1: 106, h: 2.6 };
export const PIER = { x0: 34, x1: 40, y0: 138, y1: 141 };

/* The soffit and the deck over the bridge, by plan offset from its
 * middle along x. */
export function soffitAt(dx) {
  const a = BRIDGE.span / 2;
  const t = dx / a;
  return t * t >= 1 ? 0 : BRIDGE.soffit * Math.sqrt(1 - t * t);
}
export function deckAt(dx) {
  const t = Math.abs(dx) / BRIDGE.reach;
  if (t >= 1) {
    return 0.15;
  }
  /* A smooth hump: one minus t squared, to the power one and a half. */
  const u = 1 - t * t;
  return 0.15 + (BRIDGE.crown - 0.15) * u * Math.sqrt(u);
}

/* Whether a plan point is on the water. */
export function inPond(px, py) {
  if (px >= CHANNEL.x0 && px <= CHANNEL.x1 && py >= CHANNEL.y0 && py <= CHANNEL.y1) {
    return true;
  }
  return LOBES.some((l) => (px - l.px) ** 2 + (py - l.py) ** 2 <= l.r * l.r);
}

/* Points round a circle without trigonometry: the unit circle by a fixed
 * table of 48 directions, each a rational point on it. */
const RING = (() => {
  const out = [];
  for (let i = 0; i < 48; i += 1) {
    /* t = tan of a quarter of the angle, in even steps of the quarter
     * circle, and the rational parameterisation of the circle. */
    const q = Math.floor(i / 12);
    const t = (i % 12) / 12;
    const c = (1 - t * t) / (1 + t * t);
    const s = (2 * t) / (1 + t * t);
    const [x, y] = [[c, s], [-s, c], [-c, -s], [s, -c]][q];
    out.push([x, y]);
  }
  return out;
})();

function water(T) {
  for (const l of LOBES) {
    T.disc('pkStoneDark', l.px, l.py, l.r + 0.7, 0.008, 0.02, 40);
  }
  T.paint('pkStoneDark', CHANNEL.x0 - 0.7, CHANNEL.y0, 0.008, CHANNEL.x1 + 0.7, CHANNEL.y1, 0.02);
  for (const l of LOBES) {
    T.disc('pkWater', l.px, l.py, l.r, 0.02, 0.032, 40);
  }
  T.paint('pkWater', CHANNEL.x0, CHANNEL.y0 - 2, 0.02, CHANNEL.x1, CHANNEL.y1 + 2, 0.032);
  /* The sky in it: pale streaks across the water, and the deep middle. */
  T.wide(() => {
    T.dress(() => {
      for (const l of LOBES) {
        T.disc('pkWaterDeep', l.px, l.py, l.r * 0.55, 0.032, 0.036, 32);
        for (let k = -1; k <= 1; k += 1) {
          const y = l.py + k * l.r * 0.35;
          const half = l.r * 0.6 * (1 - Math.abs(k) * 0.3);
          T.paint('pkWaterSky', l.px - half, y - 0.12, 0.036, l.px + half, y + 0.12, 0.04);
        }
      }
    });
  });
  /* The channel's stone walls, low enough to step a quad over. */
  T.box('pkStone', CHANNEL.x0 - 0.5, CHANNEL.y0, 0, CHANNEL.x0, CHANNEL.y1, 0.4, { kind: 'wall', name: 'channel wall' });
  T.box('pkStone', CHANNEL.x1, CHANNEL.y0, 0, CHANNEL.x1 + 0.5, CHANNEL.y1, 0.4, { kind: 'wall', name: 'channel wall' });
  /* Rocks round the shore: every point of every lobe's rim that no other
   * lobe, nor the channel, covers. Paint over the stone disc on Low, rocks
   * at every range on Medium and High. */
  const r = rng(7101);
  T.wide(() => {
    T.dress(() => {
      for (const l of LOBES) {
        for (let i = 0; i < 48; i += 1) {
          const [c, s] = RING[i];
          const px = l.px + c * (l.r + 0.25);
          const py = l.py + s * (l.r + 0.25);
          const inside = LOBES.some((o) => o !== l && (px - o.px) ** 2 + (py - o.py) ** 2 < o.r * o.r)
            || (px > CHANNEL.x0 - 0.6 && px < CHANNEL.x1 + 0.6 && py > CHANNEL.y0 - 1 && py < CHANNEL.y1 + 1);
          if (inside) {
            continue;
          }
          const big = r.range(0.35, 0.7);
          T.bead(r.chance(0.3) ? 'pkStoneDark' : 'pkStone', px, py, big * 0.3, big);
          if (r.chance(0.35)) {
            T.bead('pkMoss', px + r.range(-0.4, 0.4), py + r.range(-0.4, 0.4), 0.1, r.range(0.25, 0.4));
          }
        }
      }
    });
  });
  /* Lily pads and koi near the edges, the first wide, the koi near. */
  T.dress(() => {
    const lily = rng(7102);
    for (const l of LOBES) {
      for (let k = 0; k < 7; k += 1) {
        const [c, s] = RING[lily.int(0, 47)];
        const d = l.r * lily.range(0.6, 0.88);
        T.disc('pkLily', l.px + c * d, l.py + s * d, lily.range(0.35, 0.6), 0.034, 0.045, 10);
      }
      for (let k = 0; k < 4; k += 1) {
        const [c, s] = RING[lily.int(0, 47)];
        const d = l.r * lily.range(0.2, 0.7);
        T.bead('pkKoi', l.px + c * d, l.py + s * d, 0.0, 0.16);
        T.bead('pkKoi', l.px + c * d + 0.18, l.py + s * d + 0.06, 0.0, 0.11);
      }
    }
  });
}

/* The drum bridge, its abutments, its rails and its brass caps. */
function drumBridge(T) {
  const B = BRIDGE;
  const half = B.width / 2;
  const y0 = B.py - half;
  const y1 = B.py + half;
  const N = 24;
  /* The side elevation, a closed outline: the deck's curve west to east,
   * down to the water at the east abutment, the soffit back west. */
  const top = [];
  for (let i = 0; i <= N; i += 1) {
    const dx = -B.reach + (2 * B.reach * i) / N;
    top.push([B.px + dx, deckAt(dx)]);
  }
  const soffit = [];
  for (let i = N; i >= 0; i -= 1) {
    const dx = -B.span / 2 + (B.span * i) / N;
    soffit.push([B.px + dx, soffitAt(dx)]);
  }
  const outline = [...top, [B.px + B.reach, 0], ...soffit, [B.px - B.reach, 0]];
  T.prism('pkLacquer', 'y', outline, y0 + 0.12, y1 - 0.12);
  /* The deck boards, a skin over the top in timber, a hand's width proud
   * of the lacquered sides. */
  const deck = [...top, ...top.slice().reverse().map(([x, h]) => [x, h - 0.12])];
  T.prism('pkWood', 'y', deck, y0, y1);
  /* The solid: the arch in slices, each between the soffit and the deck
   * at whichever end of the slice is the tighter. */
  const S = 30;
  for (let k = 0; k < S; k += 1) {
    const a = -B.reach + (2 * B.reach * k) / S;
    const b = -B.reach + (2 * B.reach * (k + 1)) / S;
    const lo = Math.max(soffitAt(a), soffitAt(b), 0);
    const hi = Math.min(deckAt(a), deckAt(b));
    if (hi - lo > 0.05) {
      T.hidden(B.px + a, y0, lo, B.px + b, y1, hi, 'wall', 'drum bridge');
    }
  }
  /* The abutments: stone blocks the arch springs from. */
  for (const sx of [-1, 1]) {
    const x0 = B.px + sx * (B.span / 2);
    const x1 = B.px + sx * (B.span / 2 + 2.6);
    T.box('pkStone', Math.min(x0, x1), y0 - 0.6, 0, Math.max(x0, x1), y1 + 0.6, 0.55, { kind: 'wall', name: 'bridge abutment' });
  }
  /* The rails, on posts topped with brass 擬宝珠: the posts are solid
   * poles, the rails drawn along the curve. */
  const P = 9;
  for (const y of [y0 + 0.08, y1 - 0.08]) {
    let prev = null;
    for (let i = 0; i <= P; i += 1) {
      const dx = -B.reach * 0.92 + (2 * B.reach * 0.92 * i) / P;
      const h = deckAt(dx);
      T.post('pkLacquer', B.px + dx, y, h, h + 0.95, 0.07, { kind: 'pole', name: 'bridge rail post' });
      T.ball('pkBrass', B.px + dx, y, h + 1.02, 0.1, true);
      if (prev) {
        T.cyl('pkLacquer', [prev[0], y, prev[1] + 0.88], [B.px + dx, y, h + 0.88], 0.05, 6);
        T.cyl('pkLacquerDeep', [prev[0], y, prev[1] + 0.42], [B.px + dx, y, h + 0.42], 0.035, 5, null, true);
      }
      prev = [B.px + dx, h];
    }
  }
}

/* A stone lantern, 雪見灯籠: three legs, a fire box, a wide hat, a jewel. */
function lantern(T, px, py, h0 = 0, k = 1) {
  for (const [dx, dy] of [[0.35, 0], [-0.18, 0.3], [-0.18, -0.3]]) {
    T.cyl('pkStone', [px + dx * k, py + dy * k, h0], [px + dx * 0.6 * k, py + dy * 0.6 * k, h0 + 0.55 * k], 0.07 * k, 5);
  }
  T.box('pkStone', px - 0.24 * k, py - 0.24 * k, h0 + 0.55 * k, px + 0.24 * k, py + 0.24 * k, h0 + 0.85 * k, { kind: 'wall', name: 'lantern' });
  T.box('pkLamp', px - 0.12 * k, py - 0.245 * k, h0 + 0.6 * k, px + 0.12 * k, py + 0.245 * k, h0 + 0.78 * k, { solid: false, cast: false });
  T.cone('pkStoneDark', px, py, h0 + 0.85 * k, 0.75 * k, 0.32 * k, 8);
  T.bead('pkStone', px, py, h0 + 1.22 * k, 0.12 * k);
}

/* The island: a mound of moss, a pine on it, a lantern by the water. */
function island(T) {
  const I = ISLAND;
  T.disc('pkStoneDark', I.px, I.py, I.r + 0.4, 0.03, 0.2, 24);
  T.disc('pkMoss', I.px, I.py, I.r, 0.2, 0.45, 24);
  T.box('pkMoss', I.px - I.r * 0.6, I.py - I.r * 0.6, 0, I.px + I.r * 0.6, I.py + I.r * 0.6, 0.45, { draw: false, kind: 'rock', name: 'island' });
  T.asset({ type: 'tree', style: 'pine', dims: { size: 0.9, variant: 3 } }, 1, I.px + 0.8, I.py + 0.6, 0.45, 0);
  lantern(T, I.px - 2.4, I.py - 1.6, 0.45);
}

/* The 東屋: four posts, a hipped roof of tiles, benches round inside. */
function pavilion(T) {
  const P = PAVILION;
  const h = P.half;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    T.post('pkWoodDark', P.px + sx * h, P.py + sy * h, 0, P.eave, 0.13, { kind: 'pole', name: 'pavilion post' });
  }
  const o = { x0: P.px - h - 0.9, y0: P.py - h - 0.9, x1: P.px + h + 0.9, y1: P.py + h + 0.9 };
  const i = { x0: P.px - 0.25, y0: P.py - 0.25, x1: P.px + 0.25, y1: P.py + 0.25 };
  T.frustum('pkRoofSlate', o, P.eave, i, P.eave + 2.0);
  T.frustumSolid(o, P.eave, i, P.eave + 2.0, 4, 'pavilion roof');
  T.box('pkWoodDark', o.x0 + 0.2, o.y0 + 0.2, P.eave - 0.2, o.x1 - 0.2, o.y1 - 0.2, P.eave, { solid: false });
  T.ball('pkRoofSlate', P.px, P.py, P.eave + 2.05, 0.22);
  T.disc('pkPave', P.px, P.py, h + 1.2, 0, 0.12, 24);
  /* Benches on three sides, a table in the middle: solid but low. */
  T.box('pkWood', P.px - h + 0.15, P.py + h - 0.55, 0, P.px + h - 0.15, P.py + h - 0.15, 0.45, { kind: 'wall', name: 'pavilion bench' });
  T.box('pkWood', P.px - h + 0.15, P.py - h + 0.15, 0, P.px - h + 0.55, P.py + h - 0.55, 0.45, { kind: 'wall', name: 'pavilion bench' });
  T.box('pkWood', P.px + h - 0.55, P.py - h + 0.15, 0, P.px + h - 0.15, P.py + h - 0.55, 0.45, { kind: 'wall', name: 'pavilion bench' });
  T.box('pkWood', P.px - 0.5, P.py - 0.5, 0.65, P.px + 0.5, P.py + 0.5, 0.72, { solid: false });
  T.post('pkWoodDark', P.px, P.py, 0, 0.66, 0.08, { solid: false });
}

/* The wisteria trellis: posts, a lattice of beams, a canopy of leaf and
 * the flowers hanging under it, and benches in its shade. */
function trellis(T) {
  const R = TRELLIS;
  for (let x = R.x0; x <= R.x1 + 0.01; x += 4) {
    for (const y of [R.y0, R.y1]) {
      T.post('pkWoodDark', x, y, 0, R.h, 0.11, { kind: 'pole', name: 'trellis post' });
    }
  }
  for (const y of [R.y0, R.y1]) {
    T.box('pkWoodDark', R.x0 - 0.4, y - 0.1, R.h, R.x1 + 0.4, y + 0.1, R.h + 0.22, { kind: 'wall', name: 'trellis beam' });
  }
  for (let x = R.x0 - 0.2; x <= R.x1 + 0.2; x += 1) {
    T.deco('pkWood', x - 0.05, R.y0 - 0.5, R.h + 0.22, x + 0.05, R.y1 + 0.5, R.h + 0.32);
  }
  /* The canopy: a mat of leaf over the lattice, solid as a thin roof. */
  T.box('pkShrub', R.x0 - 0.6, R.y0 - 0.7, R.h + 0.32, R.x1 + 0.6, R.y1 + 0.7, R.h + 0.62, { kind: 'canopy', name: 'wisteria' });
  const r = rng(7103);
  T.dress(() => {
    for (let x = R.x0 + 0.5; x < R.x1; x += 0.9) {
      for (let y = R.y0 + 0.4; y < R.y1; y += 0.9) {
        if (!r.chance(0.7)) {
          continue;
        }
        const m = r.chance(0.5) ? 'pkWisteria' : 'pkWisteriaDeep';
        const jx = x + r.range(-0.25, 0.25);
        const jy = y + r.range(-0.25, 0.25);
        const len = r.range(0.5, 0.9);
        T.cyl(m, [jx, jy, R.h + 0.32 - len], [jx, jy, R.h + 0.32], 0.03, 6, 0.17);
      }
    }
  });
  T.wide(() => {
    T.dress(() => {
      for (let x = R.x0 + 0.3; x < R.x1; x += 1.6) {
        T.bead('pkWisteria', x, R.y0 - 0.55, R.h + 0.1, 0.32);
        T.bead('pkWisteriaDeep', x + 0.8, R.y1 + 0.55, R.h + 0.1, 0.32);
      }
    });
  });
  /* Benches in its shade, solid and low. */
  for (let x = R.x0 + 2; x < R.x1 - 2; x += 8) {
    T.box('pkWood', x, R.y0 + 2.6, 0, x + 2.0, R.y0 + 3.0, 0.42, { kind: 'wall', name: 'bench' });
    T.deco('pkWood', x, R.y0 + 2.95, 0.42, x + 2.0, R.y0 + 3.05, 0.85);
  }
  T.paint('pkPath', R.x0 - 1, R.y0 - 1, 0.004, R.x1 + 1, R.y1 + 1, 0.014);
}

/* The boat pier, and the swan boats tied to it. */
function pier(T) {
  const P = PIER;
  T.box('pkWood', P.x0, P.y0, 0.2, P.x1, P.y1, 0.4, { kind: 'wall', name: 'pier' });
  for (let x = P.x0 + 0.4; x < P.x1; x += 1.4) {
    for (const y of [P.y0 + 0.2, P.y1 - 0.2]) {
      T.post('pkWoodDark', x, y, 0, 0.75, 0.08, { solid: false });
    }
  }
  T.dress(() => {
    for (let k = 0; k < 4; k += 1) {
      const x = P.x0 + 0.9 + k * 1.5;
      const y = P.y1 + 1.4;
      T.box('pkSwan', x - 0.6, y - 0.9, 0.0, x + 0.6, y + 0.9, 0.5);
      T.ball('pkSwan', x, y + 0.3, 0.55, 0.55);
      T.cyl('pkSwan', [x, y + 0.75, 0.6], [x, y + 1.0, 1.35], 0.11, 6);
      T.bead('pkSwan', x, y + 1.05, 1.42, 0.18);
      T.cone('pkBeak', x, y + 1.2, 1.38, 0.06, 0.08, 5);
      T.box('pkPlayBlue', x - 0.5, y - 0.6, 0.5, x + 0.5, y - 0.1, 0.62);
    }
  });
  T.sign('pkBoats', (P.x0 + P.x1) / 2, P.y0 - 0.06, 1.3, 2.0, 0.7, 's');
  T.post('pkWoodDark', P.x0 + 1, P.y0 - 0.1, 0, 1.7, 0.05, { solid: false });
  T.post('pkWoodDark', P.x1 - 1, P.y0 - 0.1, 0, 1.7, 0.05, { solid: false });
}

/* The eight plank bridge over the iris bed at the south lobe's west end:
 * low planks zigzagging over the water, the irises beside them. */
function planks(T) {
  const runs = [[60, 92, 64, 93.2], [63.2, 93.2, 64.4, 97], [63.6, 97, 67.6, 98.2], [66.8, 98.2, 68, 102]];
  for (const [x0, y0, x1, y1] of runs) {
    T.box('pkWood', x0, y0, 0.18, x1, y1, 0.32, { kind: 'wall', name: 'plank bridge' });
    T.deco('pkWoodDark', x0, y0, 0, x1, y1, 0.18);
  }
  const r = rng(7104);
  T.dress(() => {
    for (let k = 0; k < 40; k += 1) {
      const px = r.range(61, 70);
      const py = r.range(90, 103);
      if (!r.chance(0.8)) {
        continue;
      }
      T.cyl('pkShrub', [px, py, 0], [px + 0.05, py, 0.7], 0.03, 3);
      T.bead(r.chance(0.7) ? 'pkIris' : 'pkLime', px, py, 0.72, 0.09);
    }
  });
}

export function pond(T) {
  water(T);
  drumBridge(T);
  island(T);
  pavilion(T);
  trellis(T);
  pier(T);
  planks(T);
  /* Lanterns at the bridge's four corners, and one by the pavilion. */
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      lantern(T, BRIDGE.px + sx * (BRIDGE.reach + 1.4), BRIDGE.py + sy * 2.2, 0, 0.9);
    }
  }
  lantern(T, PAVILION.px - 4.5, PAVILION.py - 3.5);
  /* The bridge's name on a post at its west foot. */
  T.post('pkWoodDark', BRIDGE.px - BRIDGE.reach - 1, BRIDGE.py - 1.6, 0, 1.6, 0.08, { kind: 'pole', name: 'name post' });
  T.sign('pkBridgeName', BRIDGE.px - BRIDGE.reach - 1, BRIDGE.py - 1.69, 1.15, 0.22, 0.9, 's');
}
