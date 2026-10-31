/*
 * castle.js: the castle ruin on the hill in the north west of Hotaru
 * Valley. What is left of a mountain castle of the sixteenth century, the
 * way most of them are left: the dry stone walls (ishigaki) of its
 * baileys, battered in the curve the masons called the fan slope, the
 * keep's stone base with its keep long gone and one corner of the base
 * fallen into a slope of rubble, a gate frame rebuilt at the top of the
 * steps, one corner turret rebuilt in white plaster and black board, a
 * broken run of tiled earth wall, and black pines grown up on the tops.
 *
 * Sizes are from the castles a visitor walks round: Takeda castle's ruin
 * at Asago for the plan of baileys stepping down a ridge, Marugame's and
 * Okayama's walls for the fan slope (the tallest dry stone in Japan is
 * about 30 m, at Iga Ueno and Osaka; a mountain castle's are 8 to 15), a
 * keep base of 18 m by 14 m standing 8 m over its bailey, the size of
 * Matsumoto's. A ruin's walls in the sizes the build asks for: 10 to 20 m
 * from the hill to the top.
 *
 * Every enclosure is a platform of stacked boxes, each tier stepped in
 * from the one under it, the drawn stone and the solid the same boxes, so
 * the wall a quad flies down is the wall it hits.
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

import { hash2, lotFrame } from './frame.js';
import { landAt } from './land.js';

/*
 * A FLIGHT OF STEPS climbing from h0 to h1 in n steps along a plan axis,
 * from a0 to a1, `w` wide about c, each step a box down to below h0 so it
 * is a solid flight and not a hanging stair. Returns each step's run and
 * top.
 */
function climb(T, axis, a0, a1, c, w, h0, h1, n, m) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const s0 = a0 + ((a1 - a0) * i) / n;
    const s1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const top = h0 + ((h1 - h0) * (i + 1)) / n;
    const lo = Math.min(s0, s1);
    const hi = Math.max(s0, s1);
    if (axis === 'x') {
      T.box(m, lo, c - w / 2, h0 - 1.5, hi, c + w / 2, top, { kind: 'wall', name: 'step' });
    } else {
      T.box(m, c - w / 2, lo, h0 - 1.5, c + w / 2, hi, top, { kind: 'wall', name: 'step' });
    }
    out.push({ a0: lo, a1: hi, top });
  }
  return out;
}

/* The main bailey, the second bailey below it to the south east, and the
 * keep's base on the main bailey's north west. Plan rectangles of the tops
 * and their heights over the datum. */
export const HONMARU = { x0: 52, y0: 278, x1: 98, y1: 316, top: 30 };
export const NINOMARU = { x0: 98, y0: 252, x1: 134, y1: 292, top: 18 };
export const TENSHUDAI = { x0: 58, y0: 297, x1: 76, y1: 312, top: 38 };
/* The cut through the keep's base, east to west, where its fallen corner
 * opened the old entrance passage (the breach a pilot flies). */
export const BREACH = { y0: 302.5, y1: 306.5 };
/* The steps up the second bailey's south face and the gate at their top. */
export const GATE = { x0: 112, x1: 116.6, y0: 234, y1: 252, w: 4.6, h: 4.8 };
/* The rebuilt corner turret, on the second bailey's south east corner. */
export const YAGURA = { x0: 124, y0: 253, x1: 133, y1: 261 };

/* The fan slope: tier k of n (0 the lowest) stands this far out from the
 * top's outline, as a share of the wall's batter. Steep at the top and
 * spreading at the foot. */
const N = 6;
const outset = (k, batter) => batter * ((N - k) / N) ** 1.7;

/*
 * A PLATFORM of dry stone: rectangle `r` is its top, standing on the land.
 * Each tier a box, from under the lowest ground round its foot to the top.
 * `skip(k, x0, y0, x1, y1)` true leaves a tier's box out and lets the
 * caller build that piece (the fallen corner). Returns the foot's height.
 */
function platform(T, r, opts = {}) {
  const { top } = r;
  let foot = Infinity;
  for (let x = r.x0 - 4; x <= r.x1 + 4; x += 2) {
    foot = Math.min(foot, landAt(x, r.y0 - 4), landAt(x, r.y1 + 4));
  }
  for (let y = r.y0 - 4; y <= r.y1 + 4; y += 2) {
    foot = Math.min(foot, landAt(r.x0 - 4, y), landAt(r.x1 + 4, y));
  }
  foot = Math.min(foot, opts.base ?? Infinity) - 1;
  const batter = opts.batter ?? Math.min(4, 0.24 * (top - foot));
  const dh = (top - foot) / N;
  const m = opts.m ?? 'hvStone';
  for (let k = 0; k < N; k += 1) {
    const o = outset(k, batter);
    const b = { x0: r.x0 - o, y0: r.y0 - o, x1: r.x1 + o, y1: r.y1 + o };
    const h0 = foot + k * dh;
    const h1 = foot + (k + 1) * dh;
    if (opts.pieces) {
      for (const p of opts.pieces(k, b)) {
        T.box(m, p.x0, p.y0, h0, p.x1, p.y1, h1, { kind: 'wall', name: opts.name ?? 'ishigaki' });
      }
    } else {
      T.box(m, b.x0, b.y0, h0, b.x1, b.y1, h1, { kind: 'wall', name: opts.name ?? 'ishigaki' });
    }
    /* The corner stones, long and short laid in turn (sangi-zumi): paler
     * blocks proud of the face at every corner, one course a tier. */
    if (opts.corners !== false) {
      T.dress(() => T.wide(() => {
        for (const [cx, cy, sx, sy] of [[b.x0, b.y0, 1, 1], [b.x1, b.y0, -1, 1], [b.x0, b.y1, 1, -1], [b.x1, b.y1, -1, -1]]) {
          if (opts.noCorner && opts.noCorner(cx, cy, k)) {
            continue;
          }
          const long = k % 2 === 0;
          const lx = long ? 2.2 : 1.1;
          const ly = long ? 1.1 : 2.2;
          const ch = Math.min(dh * 0.55, 1.4);
          T.deco('hvStoneWarm', Math.min(cx, cx + sx * lx) - 0.06 * sx, Math.min(cy, cy + sy * ly) - 0.06 * sy, h1 - ch,
            Math.max(cx, cx + sx * lx) - 0.06 * sx, Math.max(cy, cy + sy * ly) - 0.06 * sy, h1);
        }
      }));
    }
  }
  /* The turf on top, and moss along the top course where the rain runs
   * off it. */
  T.dress(() => T.wide(() => {
    T.paint('hvTurf', r.x0 + 0.5, r.y0 + 0.5, top, r.x1 - 0.5, r.y1 - 0.5, top + 0.06);
    const o = outset(N - 1, batter);
    T.paint('hvMoss', r.x0 - o - 0.04, r.y0 - o - 0.04, top - 0.45, r.x1 + o + 0.04, r.y1 + o + 0.04, top - 0.05);
  }));
  return foot;
}

/*
 * A TILED EARTH WALL (dobei) along a plan line on a bailey's edge: plaster
 * over a stone footing under a little roof of tiles, broken where it has
 * fallen. Along x when `alongX`, from a0 to a1 at c. `gaps` are [a0, a1]
 * runs that have fallen, left as a low ragged footing.
 */
function dobei(T, alongX, a0, a1, c, h, gaps = []) {
  const t = 0.55;
  const H = 2.1;
  const runs = [];
  let a = a0;
  for (const [g0, g1] of gaps) {
    runs.push([a, g0]);
    a = g1;
  }
  runs.push([a, a1]);
  const box = (m, u0, u1, h0, h1, w, opts) => (alongX
    ? T.box(m, u0, c - w / 2, h0, u1, c + w / 2, h1, opts)
    : T.box(m, c - w / 2, u0, h0, c + w / 2, u1, h1, opts));
  for (const [u0, u1] of runs) {
    if (u1 - u0 < 0.5) {
      continue;
    }
    box('hvPlaster', u0, u1, h, h + H, t, { kind: 'wall', name: 'dobei' });
    T.dress(() => T.wide(() => {
      box('hvStoneDark', u0, u1, h, h + 0.5, t + 0.08, { solid: false });
      box('hvTile', u0 - 0.1, u1 + 0.1, h + H, h + H + 0.16, t + 0.7, { solid: false });
      box('hvTileEdge', u0 - 0.1, u1 + 0.1, h + H + 0.16, h + H + 0.36, 0.3, { solid: false });
      /* The gun loops, triangles and squares by turns. */
      for (let u = u0 + 1.2; u < u1 - 0.6; u += 2.4) {
        box('hvBlack', u, u + 0.32, h + 1.05, h + 1.37, t + 0.04, { solid: false, cast: false });
      }
    }));
  }
  for (const [g0, g1] of gaps) {
    /* What is left where it fell: the footing and a heap of its plaster
     * and tiles. */
    box('hvStoneDark', g0, g1, h, h + 0.45, t, { kind: 'wall', name: 'dobei footing' });
    T.dress(() => {
      for (let u = g0 + 0.4; u < g1 - 0.3; u += 0.9) {
        const r = hash2(Math.floor(u * 10), Math.floor(c));
        box(r < 0.5 ? 'hvPlaster' : 'hvTile', u, u + 0.5, h + 0.45, h + 0.6 + r * 0.4, t + 0.5 * r, { solid: false });
      }
    });
  }
}

/* A rebuilt gate frame (koraimon): two great posts, a tie beam, a little
 * gabled roof over them and a smaller one over each back post. Spans along
 * x at py, standing on h. Its clear window is GATE.w by GATE.h. */
function koraimon(T, cx, py, h) {
  const hw = GATE.w / 2;
  const P = 0.32;
  for (const s of [-1, 1]) {
    const x = cx + s * (hw + P);
    T.box('hvWoodDark', x - P, py - P, h, x + P, py + P, h + GATE.h + 0.9, { kind: 'wall', name: 'gate post' });
    /* The back posts and their own roofs. */
    T.box('hvWoodDark', x - 0.18, py + 2.2, h, x + 0.18, py + 2.56, h + 3.2, { kind: 'wall', name: 'gate post' });
    T.dress(() => T.wide(() => {
      T.rod('hvWoodDark', [x, py, h + 2.9], [x, py + 2.38, h + 2.9], 0.2, 0.2);
      T.prism('hvTile', 'y', [[x - 0.8, h + 3.2], [x, h + 3.75], [x + 0.8, h + 3.2]], py + 1.4, py + 3.1);
      /* The iron straps on the great posts. */
      T.paint('hvBlack', x - P - 0.02, py - P - 0.02, h + 0.6, x + P + 0.02, py + P + 0.02, h + 0.85);
      T.paint('hvBlack', x - P - 0.02, py - P - 0.02, h + 2.6, x + P + 0.02, py + P + 0.02, h + 2.85);
    }));
  }
  /* The tie beam, the roof. */
  T.box('hvWoodDark', cx - hw - 1.1, py - 0.35, h + GATE.h, cx + hw + 1.1, py + 0.35, h + GATE.h + 0.55, { kind: 'wall', name: 'gate beam' });
  T.prism('hvTile', 'x', [[py - 1.5, h + GATE.h + 0.85], [py, h + GATE.h + 1.9], [py + 1.5, h + GATE.h + 0.85]], cx - hw - 1.6, cx + hw + 1.6);
  T.box('hvTile', cx - hw - 1.4, py - 1.0, h + GATE.h + 0.55, cx + hw + 1.4, py + 1.0, h + GATE.h + 1.3, { draw: false, kind: 'wall', name: 'gate roof' });
  T.dress(() => T.wide(() => {
    T.box('hvTileEdge', cx - hw - 1.7, py - 0.14, h + GATE.h + 1.85, cx + hw + 1.7, py + 0.14, h + GATE.h + 2.1, { solid: false });
    /* The doors, swung open against the wing walls. */
    for (const s of [-1, 1]) {
      const x = cx + s * (hw + 0.1);
      T.deco('hvWood', x - 0.08, py + 0.35, h + 0.1, x + 0.08, py + 0.35 + hw - 0.2, h + GATE.h - 0.2);
    }
  }));
}

/* The rebuilt corner turret: two storeys of white plaster over black
 * weatherboard, hipped tile roofs with their eaves turned up. */
function yagura(T, lot, base) {
  const L = lotFrame(T, { ...lot, face: 's', base });
  const w = L.width;
  const d = L.depth;
  L.box('hvPlaster', 0, 0, 0, w, d, 4.4, { kind: 'wall', name: 'turret' });
  roofSkirt(T, L, -1.1, 4.4, 1.0);
  L.box('hvPlaster', 1.3, 1.1, 5.2, w - 1.3, d - 1.1, 8.4, { kind: 'wall', name: 'turret' });
  L.box('hvPlaster', 1.3, 1.1, 4.4, w - 1.3, d - 1.1, 5.2, { draw: false, kind: 'wall', name: 'turret' });
  const o = { x0: lot.x0 + 0.3, y0: lot.y0 + 0.1, x1: lot.x1 - 0.3, y1: lot.y1 - 0.1 };
  const i = { x0: lot.x0 + w / 2 - 1.4, y0: lot.y0 + d / 2 - 0.4, x1: lot.x0 + w / 2 + 1.4, y1: lot.y0 + d / 2 + 0.4 };
  T.frustum('hvTile', o, base + 8.4, i, base + 10.8);
  T.frustumSolid(o, base + 8.4, i, base + 10.8, 3, 'turret roof');
  T.dress(() => T.wide(() => {
    T.box('hvTileEdge', i.x0 - 0.3, i.y0 + 0.2, base + 10.8, i.x1 + 0.3, i.y1 - 0.2, base + 11.15, { solid: false });
    /* Ornamental tiles at the ridge's ends. */
    for (const x of [i.x0 - 0.2, i.x1 + 0.2]) {
      T.deco('hvBlack', x - 0.15, (i.y0 + i.y1) / 2 - 0.12, base + 11.1, x + 0.15, (i.y0 + i.y1) / 2 + 0.12, base + 11.7);
    }
    /* Black weatherboard on the lower half of each storey, the windows
     * with their bars, the stone drop chutes on the corners. */
    for (const side of ['front', 'right', 'back', 'left']) {
      const len = side === 'front' || side === 'back' ? w : d;
      board(L, side, 0, len, 0, 2.2, w, d, 0);
      board(L, side, 1.3, len - 1.3, 5.2, 6.6, w, d, side === 'front' || side === 'back' ? 1.1 : 1.3);
      for (let a = 1.5; a < len - 1.5; a += 2.6) {
        board(L, side, a, a + 1.1, 2.9, 3.7, w, d, 0, 'hvBlack');
      }
    }
  }));
}

/* A band on one face of a lot frame building, standing proud by 6 cm. */
function board(L, side, a0, a1, h0, h1, w, d, inset, m = 'hvBlack') {
  const p = 0.06;
  if (side === 'front') {
    L.deco(m, a0, inset - p, h0, a1, inset, h1);
  } else if (side === 'back') {
    L.deco(m, a0, d - inset, h0, a1, d - inset + p, h1);
  } else if (side === 'left') {
    L.deco(m, inset - p, a0, h0, inset, a1, h1);
  } else {
    L.deco(m, w - inset, a0, h0, w - inset + p, a1, h1);
  }
}

/* A skirt of tiles round a storey, `o` out from its walls at height h. */
function roofSkirt(T, L, o, h, rise) {
  const w = L.width;
  const d = L.depth;
  L.box('hvTile', o, o, h, w - o, d - o, h + 0.25, { kind: 'wall', name: 'turret eave' });
  T.dress(() => T.wide(() => {
    L.deco('hvTile', o * 0.5, o * 0.5, h + 0.25, w - o * 0.5, d - o * 0.5, h + rise * 0.55);
    L.deco('hvTileEdge', o - 0.05, o - 0.05, h - 0.1, w - o + 0.05, d - o + 0.05, h + 0.02);
  }));
}

/*
 * THE CASTLE. Returns what the plan needs: the gate's window, the breach's,
 * the pines on its tops, and a keep out for the woods.
 */
export function castle(T) {
  const info = {};
  const H = HONMARU;
  const K = TENSHUDAI;
  const S = NINOMARU;
  /* The second bailey first: the main bailey's wall stands on it where
   * they meet. Its south face is cut where the steps come up. */
  platform(T, S, {
    pieces: (k, b) => [
      { x0: b.x0, y0: b.y0, x1: GATE.x0, y1: b.y1 },
      { x0: GATE.x1, y0: b.y0, x1: b.x1, y1: b.y1 },
      { x0: GATE.x0, y0: S.y0, x1: GATE.x1, y1: b.y1 },
    ],
  });
  platform(T, H);
  /* THE KEEP'S BASE. Its south east corner has fallen: the top three tiers
   * stop short of it, and the stone lies in a slope across the bailey. The
   * breach runs east to west through it from that corner. */
  const fall = { x: K.x1 - 6, y: K.y0 + 5 };
  platform(T, K, {
    base: H.top,
    batter: 2.2,
    pieces: (k, b) => {
      const out = [];
      const lo = k < 3;
      /* North of the breach, south of it. */
      out.push({ x0: b.x0, y0: BREACH.y1, x1: b.x1, y1: b.y1 });
      out.push({ x0: b.x0, y0: b.y0, x1: lo ? b.x1 : fall.x, y1: BREACH.y0 });
      return out;
    },
    noCorner: (cx, cy, k) => k >= 3 && cx > fall.x && cy < fall.y,
  });
  /* Under the breach the floor is the bailey's own top, which the main
   * bailey's tiers already are. The rubble, solid as a few low boxes and
   * drawn as many tumbled blocks, spills out of the corner. */
  T.box('hvStoneDark', fall.x, K.y0 - 3, H.top, K.x1 + 3.5, BREACH.y0, H.top + 1.4, { kind: 'rock', name: 'rubble' });
  T.box('hvStoneDark', fall.x + 1, K.y0 - 6, H.top, K.x1 + 6, K.y0 - 3, H.top + 0.7, { kind: 'rock', name: 'rubble' });
  T.dress(() => {
    for (let i = 0; i < 26; i += 1) {
      const x = fall.x - 1 + hash2(i, 201) * 13;
      const y = K.y0 - 7 + hash2(i, 203) * 11;
      if (y > BREACH.y0 - 0.6) {
        continue;
      }
      const s = 0.5 + hash2(i, 205) * 0.9;
      const lift = x < K.x1 + 2 && y > K.y0 - 3 ? 1.4 : y > K.y0 - 6 ? 0.7 : 0;
      T.rod(hash2(i, 207) < 0.5 ? 'hvStone' : 'hvStoneWarm', [x, y, H.top + lift + s * 0.3], [x + s * 1.6, y + s * (hash2(i, 209) - 0.5), H.top + lift + s * 0.5], s, s * 0.8);
    }
  });
  info.breach = { px: K.x1 - 0.5, py: (BREACH.y0 + BREACH.y1) / 2, w: BREACH.y1 - BREACH.y0, h0: H.top, h1: K.top };
  /* The broken earth wall along the main bailey's east and south edges,
   * and a stretch along the second bailey's east edge over the valley. */
  dobei(T, false, H.y0 + 2, H.y1 - 2, H.x1 - 1.2, H.top, [[288, 294.5], [304, 306]]);
  dobei(T, true, H.x0 + 2, NINOMARU.x0 - 2, H.y0 + 1.2, H.top, [[66, 72]]);
  dobei(T, false, S.y0 + 11, S.y1 - 4, S.x1 - 1.2, S.top, [[272, 277]]);
  /* The steps and the gate. */
  const g0 = Math.max(0, landAt((GATE.x0 + GATE.x1) / 2, GATE.y0));
  const tops = climb(T, 'y', GATE.y0, S.y0 + 0.01, (GATE.x0 + GATE.x1) / 2, GATE.x1 - GATE.x0, g0, S.top, 20, 'hvStoneWarm');
  const cx = (GATE.x0 + GATE.x1) / 2;
  /* Wing walls either side of the steps, the bailey's stone turned down
   * them. */
  for (const [x0, x1] of [[GATE.x0 - 1.2, GATE.x0], [GATE.x1, GATE.x1 + 1.2]]) {
    for (const t of tops) {
      T.box('hvStone', x0, t.a0, Math.max(g0, t.top - 1.2) - 1, x1, t.a1, Math.min(S.top, t.top + 1.4), { kind: 'wall', name: 'wing wall' });
    }
  }
  koraimon(T, cx, S.y0 + 1.6, S.top);
  info.gate = { px: cx, py: S.y0 + 1.6, w: GATE.w, h0: S.top, h1: S.top + GATE.h };
  /* The steps up from the second bailey to the main one, along its west
   * edge. */
  climb(T, 'x', H.x1 + 15, H.x1 - 1, 290, 3.2, S.top, H.top, 16, 'hvStoneWarm');
  /* The turret. */
  yagura(T, YAGURA, S.top);
  /* The castle's dressing: lanterns, a stone marker, a notice board. */
  T.dress(() => {
    T.deco('hvStoneWarm', 104, 262, S.top, 104.8, 262.8, S.top + 1.6);
    T.deco('hvWood', 108, 258, S.top + 0.8, 110.4, 258.12, S.top + 2.0);
    T.post('hvWood', 108.3, 258.06, S.top, S.top + 0.9, 0.05);
    T.post('hvWood', 110.1, 258.06, S.top, S.top + 0.9, 0.05);
  });
  /* THE PINES, on the tops and leaning out over the walls. */
  info.pines = [
    [56, 284, H.top], [84, 290, H.top], [92, 312, H.top], [70, 284, H.top],
    [104, 286, S.top], [128, 270, S.top], [102, 258, S.top], [120, 284, S.top],
  ].map(([px, py, h], i) => ({ kind: 'pine', px, py, h: h + 0.05, k: 1.15, seed: 8800 + i }));
  return info;
}

/* Whether a plan point is on or close under the castle, for the woods. */
export function inCastle(px, py, m = 0) {
  const pad = 5 + m;
  const inR = (r) => px > r.x0 - pad && px < r.x1 + pad && py > r.y0 - pad && py < r.y1 + pad;
  return inR(HONMARU) || inR(NINOMARU) || (px > GATE.x0 - 3 - m && px < GATE.x1 + 3 + m && py > GATE.y0 - 4 - m && py < NINOMARU.y0);
}
