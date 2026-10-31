/*
 * houses.js: the valley's buildings, each written once in its own frame
 * (./frame.js lotFrame) and stood wherever ./village.js puts it.
 *
 *   gassho     the thatched farmhouse of the snow country, after the
 *              houses of Shirakawa-go and Gokayama: a low timber ground
 *              floor under a roof of thatch pitched like praying hands,
 *              eleven to twelve metres to the ridge, its gables to the
 *              valley's length. One of them has its gables open, an attic
 *              to fly through end to end under the thatch.
 *   kura       the white storehouse: plaster walls on a base of black tile
 *              set in white diamonds (namako kabe), a heavy tiled roof, a
 *              thick door. Two stand a lane apart.
 *   barn       the work barn, a tin roof gone to rust over timber walls,
 *              its big doors open at both ends.
 *   farmhouse  a later house of the village, two storeys of timber and
 *              plaster under a tiled hipped roof, a veranda on the yard.
 *   mill       the mill house on the race, its overshot wheel and the
 *              flume on trestles that feeds it.
 *   shrine     the little hall on the knoll, and the tunnel of torii up
 *              the steps to it.
 *
 * Every solid is written beside what draws it and from the same numbers,
 * and a roof's solid is a stair of boxes inside its slopes, so nothing is
 * solid where nothing is drawn (../sunny/frame.js frustumSolid, the same
 * idea). Pure, no Three.js and no JS trigonometry.
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

import { lotFrame } from './frame.js';

/*
 * A GABLED ROOF whose ridge runs back from the front (along v), so its
 * gables face front and back. Across u it spans the walls from u0 to
 * u0 + w and overhangs each side by `oh`; along v it runs from v0 to v1,
 * past the gable walls by the gable's own overhang. `wall` is the wall
 * top, where the slab's underside meets the wall's face; `pitch` the rise
 * over the run; `t` the slab's thickness square to its slope.
 *
 *   slabs     two parallelogram prisms, so the gable shows the thatch's
 *             or the tile's thickness as an inverted V, and the gable wall
 *             is a triangle set back under it
 *   gable     the triangles of wall under the slabs at v = g0 and g1, in
 *             `gableM`, unless `open`, when the attic is open both ends
 *   solid     the walls are the caller's. Closed, the attic and the slabs
 *             are a stair of boxes inside the roof's outline; open, each
 *             slab is its own stair inside its thickness, and the attic
 *             floor at the wall top is a slab of its own, so the attic is
 *             a room a craft flies through
 *
 * Returns the heights it worked out: { e, R, s, dv, uc }.
 */
export function gableRoof(L, o) {
  const { u0, w, v0, v1, wall, pitch: s, t, oh, m } = o;
  const uc = u0 + w / 2;
  /* The slab's depth measured straight down. */
  const dv = t * Math.sqrt(1 + s * s);
  /* The eave's top, at the overhang's edge, so the underside meets the
   * wall top exactly at the wall. */
  const e = wall + dv - s * oh;
  const R = wall + dv + s * (w / 2);
  const left = [[u0 - oh, e - dv], [u0 - oh, e], [uc, R], [uc, R - dv]];
  const right = [[u0 + w + oh, e - dv], [u0 + w + oh, e], [uc, R], [uc, R - dv]];
  L.prismAcross(m, left, v0, v1);
  L.prismAcross(m, right, v0, v1);
  /* The ridge's cap and the eaves' cut edge. */
  if (o.capM) {
    L.box(o.capM, uc - 0.45, v0 - 0.05, R - 0.35, uc + 0.45, v1 + 0.05, R + 0.25, { solid: false });
  }
  if (o.cutM) {
    for (const [a, b] of [[u0 - oh - 0.02, u0 - oh + 0.12], [u0 + w + oh - 0.12, u0 + w + oh + 0.02]]) {
      L.box(o.cutM, a, v0, e - dv - 0.02, b, v1, e + 0.02, { solid: false, cast: false });
    }
  }
  /* The gable walls, unless the attic is open. */
  if (!o.open && o.gableM) {
    const tri = [[u0, wall], [u0 + w, wall], [uc, wall + s * (w / 2) - 0.02]];
    for (const g of o.gables || []) {
      L.prismAcross(o.gableM, tri, g, g + 0.2);
    }
  }
  const step = Math.min(0.9, dv * 0.8);
  if (!o.open) {
    /* Closed: the attic over the walls, then a stair up the outline. */
    if (e > wall) {
      L.hidden(u0, v0, wall, u0 + w, v1, e, 'wall', 'roof');
    }
    for (let h = e; h < R - 0.05; h += step) {
      const top = Math.min(R, h + step);
      const hw = (w / 2 + oh) * ((R - top) / (R - e));
      if (hw > 0.06) {
        L.hidden(uc - hw, v0, h, uc + hw, v1, top, 'wall', 'roof');
      }
    }
  } else {
    /* Open: the attic floor, and each slab a stair inside its thickness. */
    L.box(o.floorM || m, u0, v0, wall - 0.25, u0 + w, v1, wall, { kind: 'wall', name: 'attic floor' });
    for (let h = e - dv; h < R - dv - 0.05; h += step) {
      const top = Math.min(R - 0.02, h + step);
      /* Inside the left slab at every height from h to top: from where
       * its upper face is at `top` to where its lower face is at `h`. */
      const out = u0 - oh + (top - e) / s;
      const inn = u0 - oh + (h - (e - dv)) / s;
      if (inn - out > 0.08) {
        const a = Math.max(u0 - oh, out);
        const b = Math.min(uc, inn);
        if (b - a > 0.08) {
          L.hidden(a, v0, h, b, v1, top, 'wall', 'roof');
          L.hidden(u0 + w - (b - u0), v0, h, u0 + w - (a - u0), v1, top, 'wall', 'roof');
        }
      }
    }
  }
  return { e, R, s, dv, uc };
}

/* A run of shoji or a window band on a wall face, as paint: `side` the
 * local face, along it from a to b at heights h0 to h1. */
function windowBand(L, side, a, b, h0, h1, m, depth) {
  const d = 0.04;
  if (side === 'front') {
    L.paint(m, a, -d, h0, b, 0.01, h1);
  } else if (side === 'back') {
    L.paint(m, a, depth - 0.01, h0, b, depth + d, h1);
  } else if (side === 'left') {
    L.paint(m, -d, a, h0, 0.01, b, h1);
  } else {
    L.paint(m, L.width - 0.01, a, h0, L.width + d, b, h1);
  }
}

/* Posts and a rail in dark timber over a plaster wall, the frame every
 * old house wears on its face. */
function timberFace(L, side, len, h, depth) {
  const n = Math.max(2, Math.round(len / 1.8));
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * len;
    windowBand(L, side, a - 0.09, a + 0.09, 0, h, 'hvWoodDark', depth);
  }
  windowBand(L, side, 0, len, h * 0.48, h * 0.48 + 0.16, 'hvWoodDark', depth);
  windowBand(L, side, 0, len, h - 0.2, h, 'hvWoodDark', depth);
}

/* ------------------------------------------------------------------ */
/* The gassho farmhouse                                                */
/* ------------------------------------------------------------------ */

export const GASSHO = { w: 9.6, d: 19, wall: 3.1, pitch: 1.42, t: 0.85, oh: 1.25, gableOh: 1.1 };

/*
 * `lot` is { x0, y0, x1, y1, face, base, open }: the lot is the house's
 * walls (GASSHO.w across the front, GASSHO.d deep); the roof overhangs it.
 * Returns the roof's heights, and for an open house the attic's clear
 * window at the front gable, for the named gap.
 */
export function gassho(T, lot) {
  const L = lotFrame(T, lot);
  const { w, d, wall, pitch, t, oh, gableOh } = GASSHO;
  /* The stone plinth, the walls, the frame on them. */
  L.box('hvStoneWarm', -0.15, -0.15, 0, w + 0.15, d + 0.15, 0.35, { kind: 'wall', name: 'plinth' });
  L.box('hvPlasterWarm', 0, 0, 0.35, w, d, wall, { kind: 'wall', name: 'gassho wall' });
  T.dress(() => T.wide(() => {
    timberFace(L, 'left', d, wall, d);
    timberFace(L, 'right', d, wall, d);
    timberFace(L, 'front', w, wall, d);
    timberFace(L, 'back', w, wall, d);
    /* Shoji down the long sides, the sliding doors at the front. */
    for (const side of ['left', 'right']) {
      for (let a = 1.2; a < d - 1.5; a += 3.6) {
        windowBand(L, side, a, a + 2.4, 1.1, 2.4, 'hvShoji', d);
      }
    }
    windowBand(L, 'front', w / 2 - 1.6, w / 2 + 1.6, 0.35, 2.5, 'hvWoodPale', d);
    windowBand(L, 'front', w / 2 - 0.05, w / 2 + 0.05, 0.35, 2.5, 'hvWoodDark', d);
  }));
  const roof = gableRoof(L, {
    u0: 0, w, v0: -gableOh, v1: d + gableOh, wall, pitch, t, oh, m: 'hvThatch', capM: 'hvThatchCap', cutM: 'hvThatchCut',
    gableM: 'hvWoodDark', gables: [0, d - 0.2], open: lot.open, floorM: 'hvWoodDark',
  });
  /* The gable faces: three rows of small windows climbing the triangle,
   * the attic floors where the silkworms were kept. */
  if (!lot.open) {
    T.dress(() => T.wide(() => {
      for (const [v, dv] of [[-0.05, 0], [d + 0.05, 1]]) {
        for (let row = 0; row < 3; row += 1) {
          const h0 = wall + 0.8 + row * 2.0;
          const half = (w / 2) - (h0 + 1.0 - wall) / pitch - 0.5;
          if (half < 0.5) {
            continue;
          }
          const n = Math.max(1, Math.floor((half * 2) / 1.6));
          for (let k = 0; k < n; k += 1) {
            const a = w / 2 - half + (k + 0.2) * ((half * 2) / n);
            const b = a + ((half * 2) / n) * 0.6;
            L.paint('hvShoji', a, dv ? v : v - 0.02, h0, b, dv ? v + 0.02 : v, h0 + 0.9);
          }
        }
      }
    }));
  } else {
    /* An open attic: the drying poles across it, high, and bundles of
     * straw on the floor at the sides, clear of the middle. */
    T.dress(() => {
      for (let v = 2; v < d - 1; v += 4) {
        L.rod('hvWood', [w / 2 - 2.6, v, roof.R - 1.6], [w / 2 + 2.6, v, roof.R - 1.6], 0.1, 0.1);
      }
      for (let v = 1.5; v < d - 1; v += 2.5) {
        L.deco('hvStraw', 0.6, v, wall, 1.4, v + 1.2, wall + 0.7);
        L.deco('hvStraw', w - 1.4, v + 1, wall, w - 0.6, v + 2.2, wall + 0.7);
      }
    });
  }
  /* The ridge's crossed timbers, which hold the thatch's cap down. */
  T.dress(() => T.wide(() => {
    for (let v = -gableOh + 0.6; v < d + gableOh - 0.4; v += 1.5) {
      L.rod('hvWoodDark', [w / 2 - 0.55, v, roof.R - 0.1], [w / 2 + 0.55, v + 0.5, roof.R + 0.55], 0.09, 0.09);
    }
  }));
  if (lot.open) {
    /* The attic's clear window at the front gable: up from the floor to
     * where the two slabs' lower faces are 3.8 m apart, across between
     * them at that height. */
    const h0 = wall + 0.4;
    const h1 = Math.min(roof.R - roof.dv - 1.2, roof.e - roof.dv + (w / 2 + oh - 1.9) * pitch);
    const halfAt = (h) => w / 2 + oh - (h - (roof.e - roof.dv)) / pitch;
    return { ...roof, gap: { h0, h1, half: halfAt(h1), L } };
  }
  return roof;
}

/* ------------------------------------------------------------------ */
/* The kura                                                            */
/* ------------------------------------------------------------------ */

export const KURA = { w: 5.2, d: 7.4, wall: 5.6, pitch: 0.55, t: 0.35, oh: 0.6, gableOh: 0.6 };

export function kura(T, lot) {
  const L = lotFrame(T, lot);
  const { w, d, wall, pitch, t, oh, gableOh } = KURA;
  L.box('hvStone', -0.1, -0.1, 0, w + 0.1, d + 0.1, 0.4, { kind: 'wall', name: 'kura plinth' });
  /* The namako base, black tile to 1.4 m, and white plaster above it. */
  L.box('hvTile', 0, 0, 0.4, w, d, 1.5, { kind: 'wall', name: 'kura base' });
  L.box('hvPlaster', 0, 0, 1.5, w, d, wall, { kind: 'wall', name: 'kura wall' });
  T.dress(() => T.wide(() => {
    /* The diamonds of the base's joints, white on black, as a lattice of
     * bars laid on the faces at a quarter turn. */
    for (const side of ['front', 'back', 'left', 'right']) {
      const len = side === 'front' || side === 'back' ? w : d;
      for (let a = 0.3; a < len - 0.1; a += 0.55) {
        windowBand(L, side, a - 0.03, a + 0.03, 0.4, 1.5, 'hvPlaster', d);
      }
      for (let h = 0.65; h < 1.45; h += 0.28) {
        windowBand(L, side, 0, len, h - 0.03, h + 0.03, 'hvPlaster', d);
      }
      /* The black band under the eaves. */
      windowBand(L, side, 0, len, wall - 0.5, wall, 'hvBlack', d);
    }
    /* The door: its thick leaves standing open against the wall, the
     * inner door shut, and the little window high on the gable with its
     * shutters. */
    L.box('hvPlaster', w / 2 - 1.5, -0.35, 0.4, w / 2 - 0.85, 0, 2.9, { solid: false });
    L.box('hvPlaster', w / 2 + 0.85, -0.35, 0.4, w / 2 + 1.5, 0, 2.9, { solid: false });
    windowBand(L, 'front', w / 2 - 0.85, w / 2 + 0.85, 0.4, 2.8, 'hvWoodDark', d);
    windowBand(L, 'front', w / 2 - 0.6, w / 2 + 0.6, wall + 0.25, wall + 1.0, 'hvBlack', d);
  }));
  gableRoof(L, {
    u0: 0, w, v0: -gableOh, v1: d + gableOh, wall, pitch, t, oh, m: 'hvTile', capM: 'hvTileEdge', gableM: 'hvPlaster', gables: [0, d - 0.2],
  });
  /* The ridge's end tiles, the onigawara, a block at each gable. */
  const R = wall + t * Math.sqrt(1 + pitch * pitch) + pitch * (w / 2);
  T.dress(() => T.wide(() => {
    L.deco('hvTileEdge', w / 2 - 0.35, -gableOh - 0.1, R - 0.1, w / 2 + 0.35, -gableOh + 0.3, R + 0.7);
    L.deco('hvTileEdge', w / 2 - 0.35, d + gableOh - 0.3, R - 0.1, w / 2 + 0.35, d + gableOh + 0.1, R + 0.7);
  }));
  return { R };
}

/* ------------------------------------------------------------------ */
/* The barn                                                            */
/* ------------------------------------------------------------------ */

export const BARN = { w: 11, d: 22, wall: 5.4, pitch: 0.5, t: 0.25, oh: 0.8, gableOh: 0.6, doorW: 5.2, doorH: 4.6 };

/* Returns the barn's door, in plan, for the named gap. */
export function barn(T, lot) {
  const L = lotFrame(T, lot);
  const { w, d, wall, pitch, t, oh, gableOh, doorW, doorH } = BARN;
  const a = (w - doorW) / 2;
  const b = a + doorW;
  const wt = 0.3;
  /* The long walls, whole. */
  L.box('hvWood', 0, 0, 0, wt, d, wall, { kind: 'wall', name: 'barn wall' });
  L.box('hvWood', w - wt, 0, 0, w, d, wall, { kind: 'wall', name: 'barn wall' });
  /* The gable walls, each with its door's opening, and the lintel over it. */
  for (const [v0, v1] of [[0, wt], [d - wt, d]]) {
    L.box('hvWood', wt, v0, 0, a, v1, wall, { kind: 'wall', name: 'barn end' });
    L.box('hvWood', b, v0, 0, w - wt, v1, wall, { kind: 'wall', name: 'barn end' });
    L.box('hvWoodDark', a, v0, doorH, b, v1, wall, { kind: 'wall', name: 'barn lintel' });
  }
  /* The tie beams, over the door's height. */
  for (let v = 4; v < d - 2; v += 6) {
    L.box('hvWoodDark', wt, v, wall - 0.35, w - wt, v + 0.3, wall, { kind: 'wall', name: 'tie beam' });
  }
  /* The hay, stacked down the left side, and a kei truck's worth of
   * clutter on the right, all clear of the run down the middle. */
  for (let v = 1.5; v < d - 3; v += 2.6) {
    L.box('hvStraw', wt + 0.2, v, 0, a - 0.5, v + 2.2, 2.6 + ((v * 7) % 3) * 0.4, { kind: 'wall', name: 'hay' });
  }
  L.box('hvWoodPale', b + 0.6, 3, 0, w - wt - 0.3, 6.5, 1.1, { kind: 'wall', name: 'crates' });
  L.box('hvRust', b + 0.8, 9, 0, w - wt - 0.4, 13, 1.6, { kind: 'wall', name: 'tiller' });
  T.dress(() => {
    /* The doors' leaves, slid open along the gable walls outside. */
    for (const v of [-0.12, d + 0.02]) {
      L.deco('hvWoodPale', a - doorW / 2 - 0.1, v, 0.05, a - 0.1, v + 0.1, doorH - 0.1);
      L.deco('hvWoodPale', b + 0.1, v, 0.05, b + doorW / 2 + 0.1, v + 0.1, doorH - 0.1);
    }
    /* Boards on the walls. */
    for (const side of ['left', 'right']) {
      for (let v = 0.6; v < d; v += 0.9) {
        windowBand(L, side, v, v + 0.06, 0, wall, 'hvWoodDark', d);
      }
    }
    /* Tools on the right wall, a ladder against the hay. */
    for (let v = 15; v < 20; v += 0.7) {
      L.rod('hvWoodPale', [w - wt - 0.1, v, 0.2], [w - wt - 0.1, v + 0.1, 1.9], 0.05, 0.05);
    }
  });
  gableRoof(L, {
    u0: 0, w, v0: -gableOh, v1: d + gableOh, wall, pitch, t, oh, m: 'hvRust', capM: 'hvWoodDark', gableM: 'hvWood', gables: [0, d - 0.2],
  });
  return { a, b, doorH, L };
}

/* ------------------------------------------------------------------ */
/* A later farmhouse                                                   */
/* ------------------------------------------------------------------ */

export function farmhouse(T, lot, tone = 'hvPlasterWarm') {
  const L = lotFrame(T, lot);
  const w = L.width;
  const d = L.depth;
  const wall = 5.8;
  L.box('hvStone', -0.1, -0.1, 0, w + 0.1, d + 0.1, 0.45, { kind: 'wall', name: 'house plinth' });
  L.box(tone, 0, 0, 0.45, w, d, wall, { kind: 'wall', name: 'house' });
  /* The skirt roof between the floors, all round, which every country
   * house of the last century has. */
  L.box('hvTileBlue', -0.7, -0.7, 2.9, w + 0.7, d + 0.7, 3.15, { kind: 'wall', name: 'skirt roof' });
  /* The hipped roof. */
  const o = { x0: -0.8, y0: -0.8, x1: w + 0.8, y1: d + 0.8 };
  const i = { x0: w * 0.3, y0: d * 0.45, x1: w * 0.7, y1: d * 0.55 };
  const [ax, ay] = L.at(o.x0, o.y0);
  const [bx, by] = L.at(o.x1, o.y1);
  const [cx, cy] = L.at(i.x0, i.y0);
  const [dx, dy] = L.at(i.x1, i.y1);
  const O = { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
  const I = { x0: Math.min(cx, dx), y0: Math.min(cy, dy), x1: Math.max(cx, dx), y1: Math.max(cy, dy) };
  T.frustum('hvTileBlue', O, L.base + wall, I, L.base + wall + 2.6);
  T.frustumSolid(O, L.base + wall, I, L.base + wall + 2.6, 3, 'hipped roof');
  T.dress(() => T.wide(() => {
    for (const side of ['front', 'back']) {
      for (let a = 0.8; a < w - 1; a += 2.4) {
        windowBand(L, side, a, a + 1.5, 1.0, 2.3, 'hvShoji', d);
        windowBand(L, side, a, a + 1.5, 3.8, 5.0, 'hvShoji', d);
      }
    }
    for (const side of ['left', 'right']) {
      windowBand(L, side, d / 2 - 0.8, d / 2 + 0.8, 3.8, 5.0, 'hvShoji', d);
    }
  }));
  /* The veranda along the front, and its step stone. */
  L.box('hvWoodPale', 0, -1.1, 0.4, w, 0, 0.55, { kind: 'wall', name: 'engawa' });
  T.dress(() => {
    L.deco('hvStone', w / 2 - 0.5, -1.7, 0, w / 2 + 0.5, -1.1, 0.25);
  });
}

/* ------------------------------------------------------------------ */
/* The mill                                                            */
/* ------------------------------------------------------------------ */

export const WHEEL = { r: 2.6, t: 1.1, paddles: 16 };

/*
 * The mill house, with its wheel against the side wall that faces the
 * race. Returns the wheel's hub, axis and size in plan, for ./index.js to
 * turn and for the plan's flume and gap. The wheel's solid is a stack of
 * boxes inside its rim's circle, which a wheel turning on its axle fills
 * the same at every angle, so the solid never needs to turn.
 */
export function mill(T, lot) {
  const L = lotFrame(T, lot);
  const w = L.width;
  const d = L.depth;
  const wall = 4.2;
  L.box('hvStoneWarm', -0.2, -0.2, 0, w + 0.2, d + 0.2, 0.6, { kind: 'wall', name: 'mill plinth' });
  L.box('hvWood', 0, 0, 0.6, w, d, wall, { kind: 'wall', name: 'mill' });
  T.dress(() => T.wide(() => {
    timberFace(L, 'front', w, wall, d);
    timberFace(L, 'back', w, wall, d);
    windowBand(L, 'front', 1, 3, 0.6, 2.6, 'hvWoodPale', d);
    windowBand(L, 'left', 2, 3.5, 2.2, 3.2, 'hvShoji', d);
  }));
  gableRoof(L, {
    u0: 0, w, v0: -0.8, v1: d + 0.8, wall, pitch: 1.2, t: 0.7, oh: 0.9, m: 'hvThatch', capM: 'hvThatchCap', cutM: 'hvThatchCut', gableM: 'hvWoodDark', gables: [0, d - 0.2],
  });
  /* The wheel, outside the right wall, its axle through it. */
  const hubV = d / 2;
  const hubH = WHEEL.r + 0.1;
  const u0 = w + 0.3;
  const u1 = u0 + WHEEL.t;
  /* The axle's bearing block on the wall. */
  L.box('hvWoodDark', w, hubV - 0.4, hubH - 0.4, u0, hubV + 0.4, hubH + 0.4, { kind: 'wall', name: 'bearing' });
  const n = 6;
  for (let k = 0; k < n; k += 1) {
    const z0 = -WHEEL.r + (2 * WHEEL.r * k) / n;
    const z1 = z0 + (2 * WHEEL.r) / n;
    /* The chord at the band's edge nearest the rim, so the box stays inside
     * the circle. */
    const zz = Math.max(Math.abs(z0), Math.abs(z1));
    const half = Math.sqrt(Math.max(0, WHEEL.r * WHEEL.r - zz * zz));
    if (half > 0.2) {
      L.hidden(u0, hubV - half, hubH + z0, u1, hubV + half, hubH + z1, 'wall', 'wheel');
    }
  }
  const [hx, hy] = L.at(u0 + WHEEL.t / 2, hubV);
  const [ax, ay] = L.at(u0 + 1, hubV);
  return { hub: [hx, hy, L.base + hubH], axis: [ax - hx, ay - hy], wheelU: u0, hubV, hubH, L, wall };
}

/* ------------------------------------------------------------------ */
/* Torii and the shrine                                                */
/* ------------------------------------------------------------------ */

/*
 * A TORII across the plan line at (px, py), its posts `span` apart on the
 * axis `along` ('x': the posts stand east and west of the point, so it is
 * flown north and south through; 'y' the other way), its lower beam (nuki)
 * at `clear` over its base h. Solid: the posts as poles, the two beams as
 * boxes. Returns the clear window: { half, h0, h1 }.
 */
export function torii(T, px, py, h, span, clear, along, big = false) {
  const r = big ? 0.45 : 0.17;
  const nuki = big ? 0.55 : 0.2;
  const kasagi = big ? 0.9 : 0.34;
  const over = big ? 2.2 : 0.75;
  const gap = big ? 1.2 : 0.42;
  const halfSpan = span / 2;
  const top = clear + nuki + gap + kasagi;
  const P = (s) => (along === 'x' ? [px + s, py] : [px, py + s]);
  for (const s of [-halfSpan, halfSpan]) {
    const [x, y] = P(s);
    T.post('hvTorii', x, y, h, h + clear + nuki + gap, r, { kind: 'pole', name: 'torii post', seg: 10 });
    /* The black foot. */
    T.cyl('hvBlack', [x, y, h], [x, y, h + (big ? 1.6 : 0.5)], r * 1.12, 10, null, false);
  }
  const box = (m, s0, s1, h0, h1, thick, name) => {
    const [x0, y0] = P(s0);
    const [x1, y1] = P(s1);
    if (along === 'x') {
      T.box(m, x0, y0 - thick, h0, x1, y1 + thick, h1, { kind: 'wall', name });
    } else {
      T.box(m, x0 - thick, y0, h0, x1 + thick, y1, h1, { kind: 'wall', name });
    }
  };
  box('hvTorii', -halfSpan - over * 0.55, halfSpan + over * 0.55, h + clear, h + clear + nuki, r * 0.7, 'nuki');
  box('hvTorii', -halfSpan - over, halfSpan + over, h + clear + nuki + gap, h + top - kasagi * 0.35, r * 1.05, 'kasagi');
  box('hvBlack', -halfSpan - over * 1.05, halfSpan + over * 1.05, h + top - kasagi * 0.35, h + top, r * 1.15, 'kasagi top');
  /* The tablet between the beams. */
  T.dress(() => T.wide(() => {
    const [x, y] = P(0);
    const t = big ? 0.5 : 0.18;
    T.deco('hvBlack', x - t, y - t, h + clear + nuki, x + t, y + t, h + clear + nuki + gap);
  }));
  return { half: halfSpan - r, h0: h, h1: h + clear };
}

/* The little hall at the top of the steps, facing west down them: a
 * raised floor on posts, plank walls, a copper roof gone green, crossed
 * finials on its ridge. */
export function hall(T, lot) {
  const L = lotFrame(T, lot);
  const w = L.width;
  const d = L.depth;
  L.box('hvStone', -0.6, -0.6, 0, w + 0.6, d + 0.6, 0.5, { kind: 'wall', name: 'hall base' });
  L.box('hvWood', 0.2, 0.2, 0.5, w - 0.2, d - 0.2, 3.4, { kind: 'wall', name: 'hall' });
  L.box('hvWoodPale', -0.3, -0.9, 1.0, w + 0.3, d + 0.3, 1.15, { kind: 'wall', name: 'hall floor' });
  T.dress(() => T.wide(() => {
    for (const u of [0.1, w / 2, w - 0.1]) {
      L.deco('hvTorii', u - 0.12, -0.75, 1.15, u + 0.12, -0.55, 3.4);
    }
    windowBand(L, 'front', 0.8, w - 0.8, 1.6, 3.0, 'hvWoodDark', d);
    L.deco('hvRope', 0.3, -0.85, 3.0, w - 0.3, -0.7, 3.2);
    for (let u = 0.8; u < w - 0.6; u += 0.9) {
      L.paint('hvPaper', u, -0.86, 2.55, u + 0.12, -0.84, 3.0);
    }
  }));
  const r = gableRoof(L, {
    u0: 0, w, v0: -1.4, v1: d + 0.6, wall: 3.4, pitch: 0.75, t: 0.3, oh: 0.8, m: 'hvCopper', capM: 'hvCopper', gableM: 'hvWood', gables: [0.2, d - 0.4],
  });
  T.dress(() => T.wide(() => {
    for (const v of [-1.3, d + 0.5]) {
      L.rod('hvCopper', [w / 2 - 0.4, v, r.R - 0.1], [w / 2 + 0.6, v, r.R + 1.0], 0.1, 0.08);
      L.rod('hvCopper', [w / 2 + 0.4, v, r.R - 0.1], [w / 2 - 0.6, v, r.R + 1.0], 0.1, 0.08);
    }
  }));
}

/* A stone lantern (tōrō): base, shaft, firebox, a cap and its knob. */
export function lantern(T, px, py, h, k = 1) {
  T.box('hvStone', px - 0.35 * k, py - 0.35 * k, h, px + 0.35 * k, py + 0.35 * k, h + 0.3 * k, { kind: 'wall', name: 'lantern' });
  T.post('hvStone', px, py, h + 0.3 * k, h + 1.1 * k, 0.14 * k, { kind: 'pole', name: 'lantern', seg: 6 });
  T.box('hvStone', px - 0.3 * k, py - 0.3 * k, h + 1.1 * k, px + 0.3 * k, py + 0.3 * k, h + 1.6 * k, { kind: 'wall', name: 'lantern' });
  T.dress(() => T.wide(() => {
    T.paint('hvLamp', px - 0.16 * k, py - 0.31 * k, h + 1.2 * k, px + 0.16 * k, py + 0.31 * k, h + 1.45 * k);
  }));
  T.frustum('hvStoneDark', { x0: px - 0.55 * k, y0: py - 0.55 * k, x1: px + 0.55 * k, y1: py + 0.55 * k }, h + 1.6 * k, { x0: px - 0.08 * k, y0: py - 0.08 * k, x1: px + 0.08 * k, y1: py + 0.08 * k }, h + 1.95 * k);
  T.ball('hvStoneDark', px, py, h + 2.0 * k, 0.1 * k);
}

/* A jizo by the road: a little stone figure in a red bib and cap. */
export function jizo(T, px, py, h) {
  T.dress(() => {
    T.deco('hvStone', px - 0.22, py - 0.22, h, px + 0.22, py + 0.22, h + 0.2);
    T.cyl('hvStoneWarm', [px, py, h + 0.2], [px, py, h + 0.62], 0.17, 6, 0.14);
    T.bead('hvStoneWarm', px, py, h + 0.72, 0.13);
    T.cone('hvBib', px, py, h + 0.4, 0.2, 0.22, 6);
    T.cyl('hvBib', [px, py, h + 0.8], [px, py, h + 0.86], 0.12, 6);
  });
}
