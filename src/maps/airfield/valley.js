/*
 * valley.js: the ground Kazami Airfield stands in. The flat valley floor
 * the strip is mown into, the terraced paddies stepping up either side of
 * it, the cedar benches above them, the concrete irrigation channel along
 * the south side, and the mountains round it all. Pure, as ./frame.js is:
 * no Three.js, and no JS sine or cosine where a solid comes out (the waves
 * are src/props/trig.js's), so the solids are the same bits in every engine.
 *
 * THE SHAPE, from real places. A valley airfield in Japanese hill country
 * is a strip on the only flat ground there is, and the flat ground ends
 * where the tanada begin: rice terraces stepped up the slope behind
 * dry stone walls (ishigaki) of a metre or two, flooded in spring so each
 * bench is a mirror, and above them the old terraces gone over to planted
 * cedar (sugi), the benches still there under the trunks. That is what
 * this file builds, from the floor out.
 *
 * WHAT IS SOLID IS WHAT IS DRAWN. Every terrace is a flat bench and a wall,
 * and the solid under it is boxes, one a terrace a few metres along the
 * valley, each standing to the bench's height and reaching only to the
 * wall's foot nearest the slope over its length, so nothing is solid
 * where nothing is drawn. A bench is level, so a quad set down on one sits
 * on a flat top as it does on any roof: no slope reaches the plant.
 *
 * THE MOUNTAINS beyond the plot are one drawn mesh (./index.js) of the
 * same profile carried on smoothly and lifted into ridges, and solid as
 * boxes under that surface, a box a cell standing to the lowest point of
 * the surface over it: so a quad flown into a far slope stops at it or a
 * little inside it, never in front of it. Near the plot the cells are
 * small, so the difference is small where a pilot is; out where the peaks
 * are it is bigger, and that is said in PROGRESS.md.
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

import { sincos } from '../../props/trig.js';
import { W, D, wx, wz, rng } from './frame.js';

const SC = { s: 0, c: 0 };
const wave = (x, f, p) => sincos(x * f + p, SC).s;

/* ---------------------------------------------------------------- *
 * The floor and the profile up each side.
 * ---------------------------------------------------------------- */

/* Past the plot's east and west ends the valley closes: both edges of the
 * floor come in, faster the further out, so the strip's ends look up a
 * narrowing valley into the mountains. */
function squeeze(px) {
  const o = Math.abs(px - W / 2) - (W / 2 + 20);
  return o > 0 ? 0.0016 * o * o : 0;
}

/* Where the flat floor ends, south and north, as a plan py for a px. */
export function southEdge(px) {
  return 94 + 3.5 * wave(px, 0.031, 0.4) + 2 * wave(px, 0.071, 2.1) + squeeze(px);
}
export function northEdge(px) {
  return 272 + 3.5 * wave(px, 0.027, 1.3) + 1.8 * wave(px, 0.083, 0.2) - squeeze(px);
}

/*
 * THE TERRACES of each side, from the floor out: `d` is how far the wall's
 * foot stands outward from the floor's edge, `h` the bench's height. Six
 * paddies with walls of 1.4 m, seven metres deep, which is a tanada's
 * usual measure on a slope this gentle; then the cedar benches, steeper
 * and deeper walled, to the plot's edge. North rises higher than south,
 * because the hangar backs onto it.
 */
const PADDIES = 6;
function profile(side) {
  const out = [];
  for (let k = 0; k < PADDIES; k += 1) {
    out.push({ d: 7 * k, h: 1.4 * (k + 1), paddy: true });
  }
  const benches = side === 0 ? 10 : 9;
  const rise = side === 0 ? 3.2 : 3.8;
  const deep = side === 0 ? 5 : 5.5;
  for (let k = 0; k < benches; k += 1) {
    out.push({ d: 42 + deep * k, h: 1.4 * PADDIES + rise * (k + 1), paddy: false });
  }
  return out;
}
export const PROFILE = [profile(0), profile(1)];

/* A terrace wall's foot wanders along the valley as a contour does, each
 * wall on its own slow wave, about a metre either way. */
function wallD(side, k, px) {
  const t = PROFILE[side][k];
  return t.d + 1.1 * wave(px, 0.045 + 0.006 * k, 1.7 * k + 0.9 * side);
}

/* How far outward of the floor (px, py) is on a side: negative on the
 * floor. */
function outward(side, px, py) {
  return side === 0 ? southEdge(px) - py : py - northEdge(px);
}

/* The plan py of a wall's foot. */
export function wallPy(side, k, px) {
  return side === 0 ? southEdge(px) - wallD(side, k, px) : northEdge(px) + wallD(side, k, px);
}

/* The ground's height at (px, py) inside the plot: the bench of the
 * highest wall behind it, or the floor. Stepped, as it is built. */
export function stepTop(px, py) {
  const side = py < D / 2 ? 0 : 1;
  const d = outward(side, px, py);
  if (d < 0) {
    return 0;
  }
  let h = 0;
  const P = PROFILE[side];
  for (let k = 0; k < P.length; k += 1) {
    if (wallD(side, k, px) <= d) {
      h = P[k].h;
    }
  }
  return h;
}

/* The ridge the mountains rise to above the last bench, metres, a wave of
 * three lengths so the crest has peaks and saddles. Never below 8 m. */
function ridge(side, px) {
  const r = 46 + 34 * wave(px, 0.0105, 0.6 + 2 * side) + 22 * wave(px, 0.027, 1.1 + side) + 9 * wave(px, 0.071, 2.6 + side);
  return r > 8 ? r : 8;
}

/*
 * The mountains' surface, everywhere outside the floor: through the top of
 * each terrace wall, so it is never below the stepped ground where the two
 * meet at the plot's edge, and on past the last bench up into the ridge.
 */
export function smoothTop(px, py) {
  let best = 0;
  for (let side = 0; side < 2; side += 1) {
    const d = outward(side, px, py);
    if (d < 0) {
      continue;
    }
    const P = PROFILE[side];
    let h = 0;
    let k = 0;
    while (k < P.length && wallD(side, k, px) <= d) {
      k += 1;
    }
    if (k === 0) {
      h = 0;
    } else if (k < P.length) {
      const d0 = wallD(side, k - 1, px);
      const d1 = wallD(side, k, px);
      h = P[k - 1].h + ((P[k].h - P[k - 1].h) * (d - d0)) / (d1 - d0);
    } else {
      const last = P[P.length - 1];
      const dl = wallD(side, P.length - 1, px);
      const e = d - dl;
      const ramp = e < 12 ? 0 : e > 140 ? 1 : (e - 12) / 128;
      h = last.h + e * 0.92 + ridge(side, px) * ramp * ramp * (3 - 2 * ramp);
    }
    if (h > best) {
      best = h;
    }
  }
  return best;
}

/* The outer mesh's reach past the plot, metres, each way. */
export const OUTER = { x0: -300, x1: W + 300, y0: -260, y1: D + 260, step: 10 };

/* ---------------------------------------------------------------- *
 * The irrigation channel.
 * ---------------------------------------------------------------- */

/*
 * A straight concrete channel (yousuiro) along the south of the floor, the
 * way the valleys' paddies are fed: 4.4 m between its walls, its bed 1.9 m
 * down, its water 0.5 m deep. The ground's planes are cut out over it
 * (./index.js) and its bed is the floor the plant is given there
 * (./plan.js), as Sunnyfield's gorge is.
 */
export const CHANNEL = { y0: 103.2, y1: 107.6, x0: 6, x1: W - 6, bed: -1.9, water: -1.4, wall: 0.3 };

/* ---------------------------------------------------------------- *
 * Building it.
 * ---------------------------------------------------------------- */

const quad = (out, a, b, c, d) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
const world = (px, py, h) => [wx(px), h, wz(py)];

/*
 * What a paddy is planted with, for a bench's stretch along the valley:
 * spring, so most stand flooded with the sky in them, some planted in pale
 * green rows, one in a while left to grass.
 */
const CROPS = ['afPaddyWater', 'afPaddyWater', 'afPaddyWater', 'afPaddyGreen', 'afPaddyWater', 'afBenchDry'];

/* The terraces: walls, benches and paddies, and their solids. */
function terraces(T) {
  const r = rng(0x7a77ace5);
  const STEP = 4;
  const STEP_FOREST = 8;
  const BATTER = 0.25;
  for (let side = 0; side < 2; side += 1) {
    const P = PROFILE[side];
    const edgePy = side === 0 ? 0 : D;
    for (let k = 0; k < P.length; k += 1) {
      const t = P[k];
      const below = k === 0 ? 0 : P[k - 1].h;
      const step = t.paddy ? STEP : STEP_FOREST;
      /* Where the bench ends behind: the next wall's foot, or the plot. */
      const backPy = (px) => (k + 1 < P.length ? wallPy(side, k + 1, px) : edgePy);
      const wallMat = t.paddy ? 'afStone' : (k % 3 === 2 ? 'afRock' : 'afStoneDark');
      /* The paddies' plots along this bench, each its own crop. */
      let cut = 0;
      let crop = t.paddy ? r.pick(CROPS) : 'afBench';
      for (let px = 0; px < W - 1e-6; px += step) {
        const pa = px;
        const pb = Math.min(W, px + step);
        if (t.paddy && pa >= cut) {
          cut = pa + 12 + 4 * Math.floor(r.next() * 5);
          crop = r.pick(CROPS);
          /* The bund (aze) between this paddy and the last, a low earth
           * ridge across the bench. */
          if (pa > 0) {
            const fa = wallPy(side, k, pa);
            const ba = backPy(pa);
            T.dress(() => T.wide(() => T.deco('afBenchDry', pa - 0.2, Math.min(fa, ba), t.h, pa + 0.2, Math.max(fa, ba), t.h + 0.22)));
          }
        }
        const fa = wallPy(side, k, pa);
        const fb = wallPy(side, k, pb);
        const ba = backPy(pa);
        const bb = backPy(pb);
        /* A wall past the plot's edge is not this plot's. */
        if ((side === 0 && Math.max(fa, fb) <= 0.5) || (side === 1 && Math.min(fa, fb) >= D - 0.5)) {
          continue;
        }
        const sgn = side === 0 ? 1 : -1;
        const fa2 = side === 0 ? Math.max(0, fa) : Math.min(D, fa);
        const fb2 = side === 0 ? Math.max(0, fb) : Math.min(D, fb);
        const ba2 = side === 0 ? Math.max(0, ba) : Math.min(D, ba);
        const bb2 = side === 0 ? Math.max(0, bb) : Math.min(D, bb);
        /* The wall: from the bench below to this one, leaning back by the
         * batter as a dry stone wall does, facing the valley. */
        const wall = [];
        const lo = [world(pa, fa2, below), world(pb, fb2, below)];
        const hi = [world(pa, fa2 - sgn * BATTER, t.h), world(pb, fb2 - sgn * BATTER, t.h)];
        if (side === 0) {
          quad(wall, lo[0], lo[1], hi[1], hi[0]);
        } else {
          quad(wall, lo[1], lo[0], hi[0], hi[1]);
        }
        const mx = (pa + pb) / 2;
        T.surface(wallMat, wall, wx(mx), wz((fa2 + fb2) / 2));
        /* The bench, or the paddy on it. Water stands a hand below the
         * wall's cap, so the cap reads as the paddy's rim. */
        const top = [];
        const wet = crop === 'afPaddyWater';
        const y = wet ? t.h - 0.06 : t.h;
        const fA = fa2 - sgn * BATTER;
        const fB = fb2 - sgn * BATTER;
        if (side === 0) {
          quad(top, world(pa, ba2, y), world(pb, bb2, y), world(pb, fB, y), world(pa, fA, y));
        } else {
          quad(top, world(pa, fA, y), world(pb, fB, y), world(pb, bb2, y), world(pa, ba2, y));
        }
        T.surface(crop, top, wx(mx), wz((fa2 + ba2) / 2));
        if (wet) {
          /* The rim: the wall's cap, a strip of earth along the front. */
          const rim = [];
          const ia = fA - sgn * 0.45;
          const ib = fB - sgn * 0.45;
          if (side === 0) {
            quad(rim, world(pa, ia, t.h), world(pb, ib, t.h), world(pb, fB, t.h), world(pa, fA, t.h));
          } else {
            quad(rim, world(pa, fA, t.h), world(pb, fB, t.h), world(pb, ib, t.h), world(pa, ia, t.h));
          }
          T.surface('afBenchDry', rim, wx(mx), wz((fa2 + fb2) / 2));
        } else if (crop === 'afPaddyGreen') {
          /* Rows of young rice: dark green lines along the bench. */
          T.dress(() => T.wide(() => {
            for (let j = 1; j < 4; j += 1) {
              const qa = fA - sgn * j * ((Math.abs(ba2 - fA)) / 4);
              const qb = fB - sgn * j * ((Math.abs(bb2 - fB)) / 4);
              const row = [];
              if (side === 0) {
                quad(row, world(pa, qa + 0.12, t.h + 0.03), world(pb, qb + 0.12, t.h + 0.03), world(pb, qb - 0.12, t.h + 0.03), world(pa, qa - 0.12, t.h + 0.03));
              } else {
                quad(row, world(pa, qa - 0.12, t.h + 0.03), world(pb, qb - 0.12, t.h + 0.03), world(pb, qb + 0.12, t.h + 0.03), world(pa, qa + 0.12, t.h + 0.03));
              }
              T.surface('afMownDark', row, wx(mx), wz((qa + qb) / 2));
            }
          }));
        }
        /* The solid: the bench's whole depth back to the plot's edge, to
         * the bench's height, its front at the wall's foot nearest the
         * slope over this stretch, less the batter. */
        const front = side === 0 ? Math.min(fa2, fb2) - BATTER : Math.max(fa2, fb2) + BATTER;
        if (side === 0) {
          if (front > 0.2) {
            T.hidden(pa, 0, below, pb, front, t.h, 'wall', 'terrace');
          }
        } else if (front < D - 0.2) {
          T.hidden(pa, front, below, pb, D, t.h, 'wall', 'terrace');
        }
      }
    }
  }
}

/*
 * THE SKIRTS: where the mountains' surface meets the plot's edge it stands
 * at or above the stepped benches (smoothTop is never below stepTop), and
 * the step between them is a cut bank of rock, drawn here along all four
 * edges so there is no gap to see daylight through. `top` is the outer
 * mesh's own edge, interpolated between its nodes, so the two meet.
 */
function skirts(T) {
  const S = OUTER.step;
  const meshAt = (px, py, alongX) => {
    const a = alongX ? Math.floor(px / S) * S : Math.floor(py / S) * S;
    const f = alongX ? (px - a) / S : (py - a) / S;
    const h0 = alongX ? smoothTop(a, py) : smoothTop(px, a);
    const h1 = alongX ? smoothTop(a + S, py) : smoothTop(px, a + S);
    return h0 + (h1 - h0) * f;
  };
  const edges = [
    { alongX: true, at: 0, inside: 0.05, face: 1 },
    { alongX: true, at: D, inside: D - 0.05, face: -1 },
    { alongX: false, at: 0, inside: 0.05, face: 1 },
    { alongX: false, at: W, inside: W - 0.05, face: -1 },
  ];
  for (const e of edges) {
    const len = e.alongX ? W : D;
    for (let s = 0; s < len; s += 2) {
      const s1 = Math.min(len, s + 2);
      const pts = [s, s1].map((u) => {
        const px = e.alongX ? u : e.at;
        const py = e.alongX ? e.at : u;
        const lo = e.alongX ? stepTop(px, e.inside) : stepTop(e.inside, py);
        const hi = meshAt(px, py, e.alongX);
        return { px, py, lo, hi: hi > lo ? hi : lo };
      });
      if (pts[0].hi - pts[0].lo < 0.02 && pts[1].hi - pts[1].lo < 0.02) {
        continue;
      }
      const out = [];
      const a = world(pts[0].px, pts[0].py, pts[0].lo);
      const b = world(pts[1].px, pts[1].py, pts[1].lo);
      const c = world(pts[1].px, pts[1].py, pts[1].hi);
      const d = world(pts[0].px, pts[0].py, pts[0].hi);
      /* Facing into the plot: the winding whose normal points in. */
      const ix = e.alongX ? 0 : e.face;
      const iz = e.alongX ? -e.face : 0;
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ad = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const nx = ab[1] * ad[2] - ab[2] * ad[1];
      const nz = ab[0] * ad[1] - ab[1] * ad[0];
      if (nx * ix + nz * iz > 0) {
        quad(out, a, b, c, d);
      } else {
        quad(out, b, a, d, c);
      }
      T.surface('afRock', out, a[0], a[2]);
    }
  }
}

/* The channel: its two walls, its bed, its water, a weir, a culvert at
 * each end, and its solids, so a quad flown down it meets the walls. */
function channel(T) {
  const C = CHANNEL;
  const t = C.wall;
  for (const [y0, y1] of [[C.y0 - t, C.y0], [C.y1, C.y1 + t]]) {
    T.box('afBank', C.x0, y0, C.bed, C.x1, y1, 0.12, { kind: 'wall', name: 'channel wall' });
  }
  /* The bed and the water: paint, the bed's solid is the floor the plant
   * is given in the channel (./plan.js). */
  T.paint('afBank', C.x0, C.y0, C.bed - 0.05, C.x1, C.y1, C.bed);
  T.paint('afWater', C.x0, C.y0, C.water - 0.02, C.x1, C.y1, C.water);
  /* The headwalls at the ends, a culvert's dark mouth in each. */
  for (const x of [C.x0, C.x1]) {
    const out = x === C.x0 ? -1 : 1;
    T.box('afBank', x + (out < 0 ? -0.5 : 0), C.y0 - t - 0.6, C.bed, x + (out < 0 ? 0 : 0.5), C.y1 + t + 0.6, 0.4, { kind: 'wall', name: 'headwall' });
    T.disc('afShrineDark', x + out * -0.02, (C.y0 + C.y1) / 2, 0.7, -1.4, -1.38, 16);
  }
  /* Two weirs: a step of foam where the water drops a hand. Low enough to
   * fly over, solid as their crest. */
  for (const x of [118, 302]) {
    T.box('afBank', x - 0.4, C.y0, C.bed, x + 0.4, C.y1, C.water + 0.12, { kind: 'wall', name: 'weir' });
    T.paint('afFoam', x + 0.4, C.y0, C.water + 0.005, x + 1.6, C.y1, C.water + 0.02, true);
  }
  /* The rails along the channel's lip, a farm road's light guard. */
  T.dress(() => {
    for (let x = C.x0 + 4; x < C.x1 - 4; x += 3) {
      for (const y of [C.y0 - t - 0.15, C.y1 + t + 0.15]) {
        T.post('afBank', x, y, 0.1, 0.75, 0.05, { solid: false });
      }
    }
    for (const y of [C.y0 - t - 0.15, C.y1 + t + 0.15]) {
      T.cyl('afFrame', [C.x0 + 4, y, 0.7], [C.x1 - 4, y, 0.7], 0.035, 5);
    }
  });
}

/* ---------------------------------------------------------------- *
 * The woods.
 * ---------------------------------------------------------------- */

/*
 * THE CEDARS, one row on each forest bench and a ragged second row where
 * the bench is deep, every one a trunk and three stacked cones, the way a
 * manga background draws sugi: tall, dark and pointed. Solid as a capsule
 * up the trunk and a capsule up the crown, inside the cones. `clear` is the
 * plan rectangles kept open for the lines through the woods: the shrine's
 * stair, the hangar's back, the mast's cut.
 */
export function cedar(T, px, py, h, s, deep) {
  const m = deep ? 'afCedarDeep' : 'afCedar';
  T.post('afCedarTrunk', px, py, h - 0.4, h + 3.6 * s, 0.22 * s, { kind: 'tree', name: 'cedar' });
  T.cap(m, [px, py, h + 4.2 * s], [px, py, h + 10.6 * s], 1.0 * s, { draw: false, kind: 'canopy', name: 'cedar crown' });
  T.cone(m, px, py, h + 3.2 * s, 2.0 * s, 5.6 * s, 7);
  T.cone(m, px, py, h + 6.0 * s, 1.55 * s, 4.6 * s, 7);
  T.cone(m, px, py, h + 8.7 * s, 1.05 * s, 3.9 * s, 7);
}

function woods(T, clear) {
  const r = rng(0x5e9a11);
  const kept = (px, py) => !clear.some((c) => px > c.x0 && px < c.x1 && py > c.y0 && py < c.y1);
  let count = 0;
  for (let side = 0; side < 2; side += 1) {
    const P = PROFILE[side];
    for (let k = PADDIES; k < P.length; k += 1) {
      const t = P[k];
      for (let px = 3 + r.next() * 4; px < W - 2; px += 6.2 + r.next() * 3.4) {
        if (r.chance(0.12)) {
          continue;
        }
        const f = wallPy(side, k, px);
        const b = k + 1 < P.length ? wallPy(side, k + 1, px) : (side === 0 ? 0 : D);
        const depth = Math.abs(b - f);
        const rows = depth > 7.5 && r.chance(0.6) ? 2 : 1;
        for (let j = 0; j < rows; j += 1) {
          const u = rows === 1 ? 0.5 + (r.next() - 0.5) * 0.3 : (j === 0 ? 0.3 : 0.75);
          const py = f + (b - f) * u;
          const x = px + (j ? 2.6 : 0);
          if (py < 1.5 || py > D - 1.5 || Math.abs(py - f) < 1.6 || !kept(x, py)) {
            continue;
          }
          cedar(T, x, py, t.h, 0.85 + r.next() * 0.45, r.chance(0.45));
          count += 1;
        }
      }
    }
  }
  return count;
}

/* ---------------------------------------------------------------- *
 * The mountains' solids.
 * ---------------------------------------------------------------- */

/*
 * A box a cell under the mountains' surface outside the plot: eight metres
 * a side within ninety metres of the plot's edge, where a pilot who leaves
 * the valley is, and twenty beyond. Each stands to the lowest of the
 * surface's heights over its corners and its middle, so it is under the
 * surface everywhere; a cell on the open floor past the ends (no height to
 * speak of) has none, and the ground is there.
 */
function mountainSolids(T) {
  let n = 0;
  const cell = (x0, y0, s) => {
    const xs = [x0, x0 + s / 2, x0 + s];
    const ys = [y0, y0 + s / 2, y0 + s];
    let lo = Infinity;
    for (const x of xs) {
      for (const y of ys) {
        const h = smoothTop(x, y);
        if (h < lo) {
          lo = h;
        }
      }
    }
    if (lo > 0.6) {
      T.hidden(x0, y0, -1, x0 + s, y0 + s, lo, 'cliff', 'mountain');
      n += 1;
    }
  };
  const inPlot = (x0, y0, s) => x0 + s > 0 && x0 < W && y0 + s > 0 && y0 < D;
  const NEAR = 88;
  for (let y = -NEAR; y < D + NEAR; y += 8) {
    for (let x = -NEAR; x < W + NEAR; x += 8) {
      if (!inPlot(x, y, 8)) {
        cell(x, y, 8);
      }
    }
  }
  for (let y = OUTER.y0; y < OUTER.y1; y += 20) {
    for (let x = OUTER.x0; x < OUTER.x1; x += 20) {
      if (x + 20 > -NEAR && x < W + NEAR && y + 20 > -NEAR && y < D + NEAR) {
        continue;
      }
      cell(x, y, 20);
    }
  }
  return n;
}

/* The whole valley: the ground's parts, the woods and the mountains'
 * solids. `clear` as for the woods. */
export function valley(T, clear) {
  terraces(T);
  skirts(T);
  channel(T);
  const trees = woods(T, clear);
  const peaks = mountainSolids(T);
  return { trees, peaks };
}
