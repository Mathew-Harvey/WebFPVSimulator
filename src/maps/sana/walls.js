/*
 * walls.js: the few shapes every building at Kirigaoka Sanatorium is made
 * of, written once. A wall with its openings punched through it, a window's
 * frame, a pitched roof and the solid under it, a flight of steps. Pure
 * arithmetic on the plan, in Sunnyfield's plan frame and with its builder
 * (../sunny/frame.js Town), so scripts/sana-check.js builds it in Node.
 *
 * THE GAP RULE, which works.js in the town wrote down for every bando since:
 * a space between two solids is closed, or at least 1.4 m. Every opening
 * this file punches is a span of the wall left out from the floor's top or
 * a sill to a head, so what is left round it is a pier, a sill wall or a
 * lintel, each its own box, and a window is a hole a quad can see straight
 * through or a pane that is drawn and solid, never a slot.
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

/*
 * A wall along an axis with openings: `axis` 'x' runs from a0 to a1 in px
 * at py b0 to b1; 'y' runs in py at px b0 to b1. h0 and h1 its foot and
 * top. Each opening is { a0, a1, s, e }: along the wall from a0 to a1, its
 * sill at s and its head at e, absolute heights; s at h0 is a door. The
 * openings are taken in order along the wall and must not overlap.
 */
export function wall(T, m, axis, a0, a1, b0, b1, h0, h1, holes = [], opts = {}) {
  const put = (u0, u1, z0, z1) => {
    if (u1 - u0 < 0.01 || z1 - z0 < 0.01) {
      return;
    }
    if (axis === 'x') {
      T.box(m, u0, b0, z0, u1, b1, z1, opts);
    } else {
      T.box(m, b0, u0, z0, b1, u1, z1, opts);
    }
  };
  const list = [...holes].sort((p, q) => p.a0 - q.a0);
  let at = a0;
  for (const o of list) {
    put(at, o.a0, h0, h1);
    put(o.a0, o.a1, h0, o.s);
    put(o.a0, o.a1, o.e, h1);
    at = o.a1;
  }
  put(at, a1, h0, h1);
}

/*
 * A window's frame on one face of a wall: four bars round the opening,
 * standing `out` proud of the face at `b`, and a mullion and transom if
 * `cross`. Fine and never solid: the opening is what the pilot reads, and
 * the frame sits inside its edge by no more than its own width.
 */
export function frame(T, m, axis, o, b, out, cross = true) {
  const w = 0.09;
  const t0 = Math.min(b, b + out);
  const t1 = Math.max(b, b + out);
  const bar = (u0, u1, z0, z1) => {
    if (axis === 'x') {
      T.deco(m, u0, t0, z0, u1, t1, z1, true);
    } else {
      T.deco(m, t0, u0, z0, t1, u1, z1, true);
    }
  };
  bar(o.a0, o.a1, o.e - w, o.e);
  bar(o.a0, o.a0 + w, o.s, o.e);
  bar(o.a1 - w, o.a1, o.s, o.e);
  if (o.s > 0.05) {
    bar(o.a0 - 0.08, o.a1 + 0.08, o.s - 0.06, o.s + 0.03);
  }
  if (cross) {
    const mid = (o.a0 + o.a1) / 2;
    const tr = o.e - (o.e - o.s) * 0.3;
    bar(mid - w / 2, mid + w / 2, o.s, o.e);
    bar(o.a0, o.a1, tr - w / 2, tr + w / 2);
  }
}

/* A pane of glass left in an opening: drawn and solid, so the window is
 * shut, set in the middle of the wall's thickness. */
export function pane(T, axis, o, b0, b1) {
  const mid = (b0 + b1) / 2;
  if (axis === 'x') {
    T.box('glassDark', o.a0, mid - 0.03, o.s, o.a1, mid + 0.03, o.e, { kind: 'wall', name: 'pane', cast: false });
  } else {
    T.box('glassDark', mid - 0.03, o.a0, o.s, mid + 0.03, o.a1, o.e, { kind: 'wall', name: 'pane', cast: false });
  }
}

/*
 * A pitched roof drawn as a slab bent over its ridge: the chevron profile
 * across the span (c0 to c1, eave to ridge), extruded along the ridge from
 * e0 to e1. `half` draws only the low side ('lo') or the high side ('hi')
 * of the ridge, for a roof that has fallen in on one side.
 */
export function roofDrawn(T, m, axis, c0, c1, eave, ridge, e0, e1, over = 0.45, t = 0.3, half = null) {
  const mid = (c0 + c1) / 2;
  const run = (c1 - c0) / 2;
  const drop = ((ridge - eave) * over) / run;
  const lo = [[c0 - over, eave - drop], [mid, ridge], [mid, ridge - t], [c0 - over, eave - drop - t]];
  const hi = [[mid, ridge], [c1 + over, eave - drop], [c1 + over, eave - drop - t], [mid, ridge - t]];
  const both = [[c0 - over, eave - drop], [mid, ridge], [c1 + over, eave - drop], [c1 + over, eave - drop - t], [mid, ridge - t], [c0 - over, eave - drop - t]];
  const profile = half === 'lo' ? lo : half === 'hi' ? hi : both;
  T.prism(m, axis, profile, e0, e1);
}

/* The gable's triangle under a pitched roof, a wall `t` thick at e. */
export function gable(T, m, axis, c0, c1, eave, ridge, e, t) {
  const mid = (c0 + c1) / 2;
  T.prism(m, axis, [[c0, eave], [mid, ridge], [c1, eave]], e, e + t);
}

/*
 * The solid under a pitched roof, as n boxes a side stacked under each
 * slope, every one inside it, so nothing is solid where nothing is drawn.
 * `half` keeps one side only, as roofDrawn.
 */
export function roofSolid(T, axis, c0, c1, eave, ridge, e0, e1, n = 4, half = null, name = 'roof') {
  const mid = (c0 + c1) / 2;
  const run = (c1 - c0) / 2;
  for (let k = 0; k < n; k += 1) {
    const z0 = eave + ((ridge - eave) * k) / n;
    const z1 = eave + ((ridge - eave) * (k + 1)) / n;
    const inset = (run * (k + 1)) / n;
    const lo = half === 'hi' ? mid : c0 + inset;
    const hi = half === 'lo' ? mid : c1 - inset;
    if (hi - lo < 0.05) {
      continue;
    }
    if (axis === 'x') {
      T.hidden(e0, lo, z0, e1, hi, z1, 'wall', name);
    } else {
      T.hidden(lo, e0, z0, hi, e1, z1, 'wall', name);
    }
  }
}

/*
 * A flight of steps climbing along +py (dir 1) or -py (dir -1) from py y0,
 * each `run` deep and `rise` high, n of them, px x0 to x1, from h0. Every
 * step is a box from h0 to its tread, reaching on to the top of the
 * flight, so the flight is solid all the way down and its treads are the
 * ground a quad lands on.
 */
export function steps(T, m, x0, x1, y0, dir, run, rise, n, h0, name = 'steps') {
  for (let k = 0; k < n; k += 1) {
    const a = y0 + dir * run * k;
    const b = y0 + dir * run * n;
    T.box(m, x0, Math.min(a, b), h0, x1, Math.max(a, b), h0 + rise * (k + 1), { kind: 'wall', name });
  }
}
