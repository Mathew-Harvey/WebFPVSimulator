/*
 * houses.js: Sunnyfield's houses, forty five of them on seven rows of lots,
 * each rolled from its own seed so no two are the same and every one is
 * the same on every load. Pure, as ./frame.js is.
 *
 * A HOUSE, in its lot's frame (./frame.js lotFrame: u along the frontage, v
 * back from the street):
 *
 *   the body     one or two storeys of siding on a plinth, solid as one
 *                box; windows, doors, shutters, sills and trim are paint
 *                proud of it, so a quad meets the wall it sees.
 *   the roof     a gable, its ridge along the street or facing it, in one
 *                of four colours. The slopes and the gable ends are drawn
 *                prisms; the solid is a stack of boxes inside them, each as
 *                wide as the roof is at the band's top, so nothing solid
 *                stands outside the drawing.
 *   the garage   on one side, one car or two, under its own low gable, a
 *                panelled door and a basketball hoop over some of them.
 *   the front    a porch on posts, or a stoop under a little canopy; a path
 *                to the pavement, a driveway, a letterbox on a post, flower
 *                beds, and a hedge, a picket fence or open lawn.
 *   the back     a board fence round the yard and one or two of: a round
 *                pool, a swing set, a trampoline, a shed, a doghouse, a
 *                barbecue, a table under an umbrella.
 *   the trees    a street tree out front on most, a tree out back on some.
 *   the car      on some driveways, one of the town's own cars.
 *
 * Every gap between two houses is a side yard of three metres or more, and
 * every gap a fence leaves is either closed or wider than the gap rule
 * (src/props/parts.js GAP_MIN).
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

import { lotFrame, rng, FACE_YAW } from './frame.js';
import { HALF, WALK, MAPLE_Y, BIRCH_Y, MAIN_Y, OAK_X, PINE_X, BULB, BIRCH_END } from './streets.js';

const SIDINGS = ['sfPeach', 'sfMint', 'sfButter', 'sfSky', 'sfLilac', 'sfSalmon'];
const ROOFS = ['sfRoofRed', 'sfRoofSlate', 'sfRoofBrown', 'sfRoofTeal'];
const DOORS = ['sfDoorRed', 'sfDoorNavy', 'sfDoorGreen'];
const FLOWERS = ['sfPink', 'sfRed', 'sfYellow', 'sfPurple', 'sfTrim'];
const CARS = ['sedan', 'wagon', 'minivan', 'hatch', 'van'];

const PLINTH = 0.45;
const STOREY = 2.8;
/* The roof's rise per metre run. */
const PITCH = 0.55;
const OVER = 0.45;
const GABLE_OVER = 0.3;
const SLAB = 0.2;
const BAND = 0.3;
const FENCE_H = 1.8;
const FENCE_T = 0.08;

/*
 * THE LOTS, plan metres: { x0, x1, y0, y1, face }, front on the street the
 * face looks at. Rows are cut into equal lots.
 */
function row(x0, x1, y0, y1, face, n, alongX = true) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    if (alongX) {
      const a = x0 + ((x1 - x0) * i) / n;
      const b = x0 + ((x1 - x0) * (i + 1)) / n;
      out.push({ x0: a, x1: b, y0, y1, face });
    } else {
      const a = y0 + ((y1 - y0) * i) / n;
      const b = y0 + ((y1 - y0) * (i + 1)) / n;
      out.push({ x0, x1, y0: a, y1: b, face });
    }
  }
  return out;
}

const E = OAK_X + HALF + WALK;
const MS = MAIN_Y - HALF - WALK;

export const LOTS = [
  /* Maple Avenue's south side, looking north. */
  ...row(E, PINE_X - HALF - WALK, 0, MAPLE_Y - HALF - WALK, 'n', 12),
  /* Maple Avenue's north side, looking south, back to back with Birch. */
  ...row(E, 262, MAPLE_Y + HALF + WALK, 55, 's', 11),
  /* Birch Lane's south side, looking north, to the turning circle. */
  ...row(E, BULB.px - BULB.r - WALK - 1.5, 55, BIRCH_Y - HALF - WALK, 'n', 8),
  /* Birch Lane's north side, east of the shops, looking south. */
  ...row(150, BIRCH_END - 4, BIRCH_Y + HALF + WALK, MS, 's', 4),
  /* The two at the turning circle's head, north and south of it. */
  { x0: BIRCH_END - 2, x1: 258, y0: BULB.py + BULB.r + WALK, y1: MS, face: 's' },
  { x0: BULB.px - BULB.r - WALK, x1: 262, y0: 55, y1: BULB.py - BULB.r - WALK, face: 'n' },
  /* Pine Street's west side, looking east. */
  ...row(262, PINE_X - HALF - WALK, 58, MS, 'e', 3, false),
  /* Oak Street's west side, looking east. */
  ...row(0, OAK_X - HALF - WALK, 0, MS, 'e', 5, false),
];

/* The lot whose side carries the tall hedge you fly through: the third of
 * Birch Lane's south side, its left boundary. */
export const HEDGE_LOT = 25;

/* A window on a local face, its middle at (a, h) along the face: glass, a
 * sill, a frame and, if asked, shutters. `side` is the face, `at` is the
 * face's own v (front and back) or u (left and right). */
function windowOn(L, side, a, at, h, w, ht, shutter, fine) {
  const out = side === 'front' || side === 'left' ? -1 : 1;
  const p0 = at;
  const p1 = at + out * 0.04;
  const q0 = at;
  const q1 = at + out * 0.08;
  const put = (m, a0, a1, h0, h1, d0, d1, f) => {
    if (side === 'front' || side === 'back') {
      L.paint(m, a0, d0, h0, a1, d1, h1, f);
    } else {
      L.paint(m, d0, a0, h0, d1, a1, h1, f);
    }
  };
  put('sfGlassDark', a - w / 2, a + w / 2, h - ht / 2, h + ht / 2, p0, p1, false);
  /* The sash bar, the frame and the sill. */
  put('sfTrim', a - 0.04, a + 0.04, h - ht / 2, h + ht / 2, q0, q1 - out * 0.02, fine);
  put('sfTrim', a - w / 2 - 0.08, a + w / 2 + 0.08, h + ht / 2, h + ht / 2 + 0.1, q0, q1, fine);
  put('sfTrim', a - w / 2 - 0.12, a + w / 2 + 0.12, h - ht / 2 - 0.1, h - ht / 2, q0, at + out * 0.14, fine);
  put('sfTrim', a - w / 2 - 0.08, a - w / 2, h - ht / 2, h + ht / 2, q0, q1, fine);
  put('sfTrim', a + w / 2, a + w / 2 + 0.08, h - ht / 2, h + ht / 2, q0, q1, fine);
  if (shutter) {
    put(shutter, a - w / 2 - 0.55, a - w / 2 - 0.1, h - ht / 2, h + ht / 2, q0, q1, true);
    put(shutter, a + w / 2 + 0.1, a + w / 2 + 0.55, h - ht / 2, h + ht / 2, q0, q1, true);
  }
}

/* A gable roof over [u0, u1] by [v0, v1] from `eave`: ridge along u
 * (`along`) or along v. Draws the slopes and the gable ends, and stacks the
 * solid inside them. Returns the ridge's height. */
function gableRoof(L, wall, roof, u0, u1, v0, v1, eave, along, fine = false, solid = true) {
  const span = along ? v1 - v0 : u1 - u0;
  const rise = (PITCH * span) / 2;
  const ridge = eave + rise;
  const m = along ? (v0 + v1) / 2 : (u0 + u1) / 2;
  const a0 = along ? v0 : u0;
  const a1 = along ? v1 : u1;
  const lowO = eave - OVER * PITCH;
  const gable = [[a0, eave], [m, ridge], [a1, eave]];
  const slopeL = [[a0 - OVER, lowO], [m, ridge], [m, ridge + SLAB], [a0 - OVER, lowO + SLAB]];
  const slopeR = [[m, ridge], [a1 + OVER, lowO], [a1 + OVER, lowO + SLAB], [m, ridge + SLAB]];
  if (along) {
    L.prismAlong(wall, gable, u0, u1);
    L.prismAlong(roof, slopeL, u0 - GABLE_OVER, u1 + GABLE_OVER);
    L.prismAlong(roof, slopeR, u0 - GABLE_OVER, u1 + GABLE_OVER);
    /* The fascia boards under the eaves, and the ridge cap. */
    L.deco('sfTrim', u0 - GABLE_OVER, a0 - OVER, lowO - 0.18, u1 + GABLE_OVER, a0 - OVER + 0.05, lowO + 0.02, fine);
    L.deco('sfTrim', u0 - GABLE_OVER, a1 + OVER - 0.05, lowO - 0.18, u1 + GABLE_OVER, a1 + OVER, lowO + 0.02, fine);
  } else {
    L.prismAcross(wall, gable, v0, v1);
    L.prismAcross(roof, slopeL, v0 - GABLE_OVER, v1 + GABLE_OVER);
    L.prismAcross(roof, slopeR, v0 - GABLE_OVER, v1 + GABLE_OVER);
    L.deco('sfTrim', a0 - OVER, v0 - GABLE_OVER, lowO - 0.18, a0 - OVER + 0.05, v1 + GABLE_OVER, lowO + 0.02, fine);
    L.deco('sfTrim', a1 + OVER - 0.05, v0 - GABLE_OVER, lowO - 0.18, a1 + OVER, v1 + GABLE_OVER, lowO + 0.02, fine);
  }
  if (solid) {
    for (let h = eave; h < ridge - 0.05; h += BAND) {
      const top = Math.min(ridge, h + BAND);
      const half = ((ridge - top) / rise) * (span / 2);
      if (half < 0.15) {
        break;
      }
      if (along) {
        L.hidden(u0, m - half, h, u1, m + half, top, 'wall', 'roof');
      } else {
        L.hidden(m - half, v0, h, m + half, v1, top, 'wall', 'roof');
      }
    }
  }
  return ridge;
}

/* A board fence along a local line, solid as one slab, drawn as boards
 * between posts. */
function fence(L, u0, v0, u1, v1, fine) {
  const alongU = Math.abs(u1 - u0) > Math.abs(v1 - v0);
  if (alongU) {
    const a = Math.min(u0, u1);
    const b = Math.max(u0, u1);
    L.box('sfWood', a, v0 - FENCE_T / 2, 0, b, v0 + FENCE_T / 2, FENCE_H, { kind: 'wall', name: 'fence' });
    for (let x = a; x <= b + 1e-6; x += 2.4) {
      L.deco('sfRoofBrown', x - 0.06, v0 - 0.08, 0, x + 0.06, v0 + 0.08, FENCE_H + 0.08, fine);
    }
  } else {
    const a = Math.min(v0, v1);
    const b = Math.max(v0, v1);
    L.box('sfWood', u0 - FENCE_T / 2, a, 0, u0 + FENCE_T / 2, b, FENCE_H, { kind: 'wall', name: 'fence' });
    for (let y = a; y <= b + 1e-6; y += 2.4) {
      L.deco('sfRoofBrown', u0 - 0.08, y - 0.06, 0, u0 + 0.08, y + 0.06, FENCE_H + 0.08, fine);
    }
  }
}

/* A white picket fence along the front, from u0 to u1 at v: one hidden
 * slab for the solid, rails and pickets drawn. */
function picket(L, u0, u1, v) {
  L.hidden(u0, v - 0.05, 0, u1, v + 0.05, 0.95, 'wall', 'picket');
  L.deco('sfTrim', u0, v - 0.03, 0.3, u1, v + 0.03, 0.38);
  L.deco('sfTrim', u0, v - 0.03, 0.68, u1, v + 0.03, 0.76);
  for (let x = u0 + 0.06; x < u1 - 0.05; x += 0.16) {
    L.deco('sfTrim', x - 0.04, v - 0.02, 0, x + 0.04, v + 0.02, 0.9, true);
  }
  for (const x of [u0, u1]) {
    L.deco('sfTrim', x - 0.06, v - 0.06, 0, x + 0.06, v + 0.06, 1.0);
  }
}

function backyardThings(L, r, x0, x1, v0, v1, extras) {
  /* What fits: a strip of yard [x0, x1] by [v0, v1]. Up to two things,
   * each in its own half. */
  const things = ['pool', 'swing', 'tramp', 'shed', 'dog', 'bbq', 'table'];
  const halves = [[x0, (x0 + x1) / 2], [(x0 + x1) / 2, x1]];
  const deep = v1 - v0;
  for (const [a, b] of halves) {
    if (!r.chance(0.7) || b - a < 4 || deep < 3.6) {
      continue;
    }
    const kind = r.pick(things);
    const cu = (a + b) / 2;
    const cv = (v0 + v1) / 2;
    if (kind === 'pool' && b - a >= 5.5 && deep >= 5.5) {
      const R = 2.2;
      L.disc('sfSky', cu, cv, R, 0, 1.15, 24);
      L.disc('sfWater', cu, cv, R - 0.12, 0, 1.18, 24);
      L.hidden(cu - 1.5, cv - 1.5, 0, cu + 1.5, cv + 1.5, 1.15, 'wall', 'pool');
      L.cyl('sfTrim', [cu, cv, 1.15], [cu, cv, 1.22], R + 0.05, 24, null, true);
      L.box('sfTrim', cu + R, cv - 0.3, 0, cu + R + 0.6, cv + 0.3, 1.2, { kind: 'wall', name: 'pool ladder' });
    } else if (kind === 'swing' && b - a >= 4.6) {
      const h = 2.3;
      for (const s of [-1, 1]) {
        const u = cu + s * 1.7;
        L.cap('sfRed', [u, cv - 0.9, 0], [u, cv, h], 0.05, { kind: 'pole', name: 'swing leg' });
        L.cap('sfRed', [u, cv + 0.9, 0], [u, cv, h], 0.05, { kind: 'pole', name: 'swing leg' });
      }
      L.cap('sfYellow', [cu - 1.8, cv, h], [cu + 1.8, cv, h], 0.06, { kind: 'pole', name: 'swing bar' });
      for (const s of [-0.7, 0.7]) {
        L.cyl('sfIron', [cu + s - 0.2, cv, h], [cu + s - 0.2, cv, 0.5], 0.012, 4, null, true);
        L.cyl('sfIron', [cu + s + 0.2, cv, h], [cu + s + 0.2, cv, 0.5], 0.012, 4, null, true);
        L.deco('sfYellow', cu + s - 0.25, cv - 0.12, 0.46, cu + s + 0.25, cv + 0.12, 0.52, true);
      }
    } else if (kind === 'tramp') {
      L.disc('sfDoorNavy', cu, cv, 1.8, 0.75, 0.82, 24);
      L.disc('sfIron', cu, cv, 1.55, 0.76, 0.84, 24);
      L.hidden(cu - 1.2, cv - 1.2, 0.6, cu + 1.2, cv + 1.2, 0.84, 'wall', 'trampoline');
      for (const [du, dv] of [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]]) {
        L.cyl('sfSteel', [cu + du, cv + dv, 0], [cu + du, cv + dv, 0.78], 0.04, 5, null, true);
      }
    } else if (kind === 'shed' && b - a >= 4.4) {
      const w = 2.6;
      const d = 2.2;
      const wall = r.pick(['sfMint', 'sfButter', 'sfWood']);
      L.box(wall, cu - w / 2, cv - d / 2, 0, cu + w / 2, cv + d / 2, 2.1, { kind: 'wall', name: 'shed' });
      gableRoof(L, wall, 'sfRoofSlate', cu - w / 2, cu + w / 2, cv - d / 2, cv + d / 2, 2.1, true, true);
      L.paint('sfWood', cu - 0.45, cv - d / 2 - 0.04, 0, cu + 0.45, cv - d / 2, 1.8);
    } else if (kind === 'dog') {
      L.box('sfRed', cu - 0.6, cv - 0.5, 0, cu + 0.6, cv + 0.5, 0.8, { kind: 'wall', name: 'doghouse' });
      gableRoof(L, 'sfRed', 'sfRoofSlate', cu - 0.6, cu + 0.6, cv - 0.5, cv + 0.5, 0.8, false, true);
      L.paint('sfIron', cu - 0.22, cv - 0.54, 0, cu + 0.22, cv - 0.5, 0.55);
    } else if (kind === 'bbq') {
      L.box('sfIron', cu - 0.45, cv - 0.3, 0.6, cu + 0.45, cv + 0.3, 1.0, { kind: 'wall', name: 'barbecue' });
      L.hidden(cu - 0.45, cv - 0.3, 0, cu + 0.45, cv + 0.3, 0.6, 'wall', 'barbecue');
      L.cyl('sfIron', [cu - 0.45, cv, 1.0], [cu + 0.45, cv, 1.0], 0.3, 10, null, true);
      L.deco('sfConcrete', cu - 1.4, cv - 1.4, 0, cu + 1.4, cv + 1.4, 0.04);
    } else if (kind === 'table') {
      L.disc('sfTrim', cu, cv, 0.65, 0.72, 0.76, 16);
      L.hidden(cu - 0.45, cv - 0.45, 0, cu + 0.45, cv + 0.45, 0.76, 'wall', 'table');
      L.cyl('sfSteel', [cu, cv, 0], [cu, cv, 2.3], 0.025, 5, null, true);
      L.cone(r.pick(['sfRed', 'sfTeal', 'sfYellow']), cu, cv, 1.95, 1.3, 0.45, 10, false);
      for (const [du, dv] of [[0.9, 0], [-0.9, 0], [0, 0.9]]) {
        L.deco('sfTrim', cu + du - 0.22, cv + dv - 0.22, 0.42, cu + du + 0.22, cv + dv + 0.22, 0.46, true);
      }
    }
  }
  if (extras && r.chance(0.5) && deep >= 6) {
    /* A tree in the back corner. */
    const u = r.chance(0.5) ? x0 + 2.2 : x1 - 2.2;
    const style = r.pick(['street', 'street', 'pine']);
    L.asset({ type: 'tree', style, dims: { size: style === 'pine' ? 0.75 : 0.7, variant: r.int(1, 99) } }, 1, u, v1 - 2.2, 0, 0);
  }
}

export function house(T, lot, seed, clear = false) {
  const L = lotFrame(T, lot);
  const r = rng(seed);
  const Wl = L.width;
  const Dl = L.depth;
  const wall = r.pick(SIDINGS);
  const roof = r.pick(ROOFS);
  const door = r.pick(DOORS);
  const shutter = r.chance(0.65) ? r.pick([...DOORS, 'sfIron']) : null;
  const storeys = r.chance(0.3) ? 1 : 2;
  const eave = PLINTH + storeys * STOREY;
  /* The plan: setback, depth, the body's width and the garage's. */
  const sb = Dl < 20 ? 3.6 : r.range(4.6, 6.2);
  const hd = Dl < 20 ? 8.0 : r.range(8.4, 9.6);
  const garageW = Wl >= 18 && r.chance(0.75) ? (Wl >= 20 && r.chance(0.4) ? 6.4 : 4.4) : 0;
  const yards = 3.4;
  const hw = Math.min(r.range(9.2, 11), Wl - garageW - yards);
  const left = r.chance(0.5);
  const gutter = (Wl - hw - garageW) / 2;
  const hu0 = left ? gutter + garageW : gutter;
  const hu1 = hu0 + hw;
  const gu0 = left ? gutter : hu1;
  const gu1 = gu0 + garageW;
  const v0 = sb;
  const v1 = sb + hd;

  /* The plinth, a shade darker, and the body. */
  L.box(wall, hu0, v0, 0, hu1, v1, eave, { kind: 'wall', name: 'house' });
  L.deco('sfConcrete', hu0 - 0.05, v0 - 0.05, 0, hu1 + 0.05, v1 + 0.05, PLINTH);
  /* A trim band between the storeys, and the corner boards. */
  if (storeys === 2) {
    L.deco('sfTrim', hu0 - 0.04, v0 - 0.04, PLINTH + STOREY - 0.08, hu1 + 0.04, v1 + 0.04, PLINTH + STOREY + 0.06, true);
  }
  for (const [u, v] of [[hu0, v0], [hu1, v0], [hu0, v1], [hu1, v1]]) {
    L.deco('sfTrim', u - 0.07, v - 0.07, PLINTH, u + 0.07, v + 0.07, eave, true);
  }

  /* The roof: ridge along the street, or the gable facing it. */
  const along = r.chance(0.6);
  const ridge = gableRoof(L, wall, roof, hu0, hu1, v0, v1, eave, along);

  /* A brick chimney up one end. */
  if (r.chance(0.5)) {
    if (along) {
      const cu = r.chance(0.5) ? hu0 - 0.75 : hu1 + 0.05;
      const cv = (v0 + v1) / 2 - 0.6;
      L.box('sfBrick', cu, cv, 0, cu + 0.7, cv + 1.2, ridge + 0.9, { kind: 'wall', name: 'chimney' });
      L.deco('sfIron', cu + 0.1, cv + 0.15, ridge + 0.9, cu + 0.6, cv + 1.05, ridge + 1.05, true);
    } else {
      const cv = v1 + 0.05;
      const cu = (hu0 + hu1) / 2 + r.range(-2, 2);
      L.box('sfBrick', cu - 0.6, cv, 0, cu + 0.6, cv + 0.7, ridge + 0.9, { kind: 'wall', name: 'chimney' });
      L.deco('sfIron', cu - 0.45, cv + 0.1, ridge + 0.9, cu + 0.45, cv + 0.6, ridge + 1.05, true);
    }
  }

  /* The garage, its door, its roof, and maybe a hoop. */
  if (garageW > 0) {
    const gh = PLINTH + 2.7;
    const gv0 = v0 + 0.6;
    const gv1 = Math.min(v1, gv0 + 6.4);
    L.box(wall, gu0, gv0, 0, gu1, gv1, gh, { kind: 'wall', name: 'garage' });
    gableRoof(L, wall, roof, gu0, gu1, gv0, gv1, gh, true);
    const n = garageW > 5 ? 2 : 1;
    const dw = (garageW - 0.6 * (n + 1)) / n;
    for (let k = 0; k < n; k += 1) {
      const a = gu0 + 0.6 + k * (dw + 0.6);
      L.paint('sfTrim', a, gv0 - 0.05, 0, a + dw, gv0, 2.25);
      for (let h = 0.55; h < 2.2; h += 0.55) {
        L.paint('sfConcrete', a, gv0 - 0.07, h - 0.03, a + dw, gv0 - 0.05, h + 0.03, true);
      }
    }
    /* The driveway to the pavement. */
    L.paint('sfConcrete', gu0 + 0.2, 0, 0, gu1 - 0.2, gv0, 0.03);
    if (r.chance(0.35)) {
      const hu = (gu0 + gu1) / 2;
      L.box('sfTrim', hu - 0.6, gv0 - 0.12, gh - 0.4, hu + 0.6, gv0 - 0.05, gh + 0.4, { solid: false });
      L.paint('sfRed', hu - 0.2, gv0 - 0.13, gh - 0.25, hu + 0.2, gv0 - 0.12, gh + 0.05, true);
      L.cyl('sfOrange', [hu - 0.23, gv0 - 0.4, gh - 0.42], [hu + 0.23, gv0 - 0.4, gh - 0.42], 0.23, 12, null, true);
    }
    /* A car in the driveway. */
    if (r.chance(0.45) && sb >= 4.6 && !clear) {
      const style = r.pick(CARS);
      L.asset({ type: 'car', style, dims: { variant: r.int(1, 12) } }, 1, (gu0 + gu1) / 2 - (n === 2 ? dw / 2 + 0.3 : 0), gv0 - 2.6, 0, FACE_YAW[lot.face] + Math.PI);
    }
  } else {
    /* No garage: a carport pad beside the house. */
    const pu0 = left ? Math.max(0.6, hu0 - 3.2) : hu1 + 0.3;
    L.paint('sfConcrete', pu0, 0, 0, pu0 + 2.9, v0 + 3, 0.03);
  }

  /* The front: a door in the middle third, a porch or a stoop. */
  const du = hu0 + hw * r.range(0.32, 0.68);
  const porch = r.chance(0.55) && sb >= 4.2;
  if (porch) {
    const pd = 2.1;
    const pu0 = hu0 + 0.4;
    const pu1 = hu1 - 0.4;
    L.box('sfWood', pu0, v0 - pd, 0, pu1, v0, PLINTH, { kind: 'wall', name: 'porch deck' });
    L.box('sfTrim', pu0 - 0.1, v0 - pd - 0.1, PLINTH + 2.55, pu1 + 0.1, v0, PLINTH + 2.75, { kind: 'wall', name: 'porch roof' });
    L.deco(roof, pu0 - 0.15, v0 - pd - 0.15, PLINTH + 2.75, pu1 + 0.15, v0, PLINTH + 2.85);
    const posts = Math.max(2, Math.round((pu1 - pu0) / 3) + 1);
    for (let k = 0; k < posts; k += 1) {
      const u = pu0 + 0.12 + ((pu1 - pu0 - 0.24) * k) / (posts - 1);
      L.post('sfTrim', u, v0 - pd + 0.12, PLINTH, PLINTH + 2.55, 0.09, { kind: 'pole', name: 'porch post' });
    }
    /* A rail along the front, broken for the steps. */
    L.deco('sfTrim', pu0, v0 - pd + 0.08, PLINTH + 0.85, du - 0.8, v0 - pd + 0.16, PLINTH + 0.92, true);
    L.deco('sfTrim', du + 0.8, v0 - pd + 0.08, PLINTH + 0.85, pu1, v0 - pd + 0.16, PLINTH + 0.92, true);
    L.box('sfConcrete', du - 0.7, v0 - pd - 0.9, 0, du + 0.7, v0 - pd, 0.25, { kind: 'wall', name: 'step' });
    /* A porch swing or two chairs. */
    if (r.chance(0.5)) {
      L.deco('sfWood', pu0 + 0.4, v0 - 0.9, PLINTH + 0.45, pu0 + 1.6, v0 - 0.4, PLINTH + 0.52, true);
      L.deco('sfWood', pu0 + 0.4, v0 - 0.45, PLINTH + 0.52, pu0 + 1.6, v0 - 0.4, PLINTH + 1.0, true);
    }
  } else {
    L.box('sfConcrete', du - 0.8, v0 - 1.2, 0, du + 0.8, v0, PLINTH - 0.05, { kind: 'wall', name: 'stoop' });
    L.deco('sfTrim', du - 0.9, v0 - 0.9, PLINTH + 2.35, du + 0.9, v0, PLINTH + 2.5);
    L.deco(roof, du - 1.0, v0 - 1.0, PLINTH + 2.5, du + 1.0, v0, PLINTH + 2.62);
  }
  L.paint(door, du - 0.5, v0 - 0.05, PLINTH, du + 0.5, v0, PLINTH + 2.1);
  L.paint('sfTrim', du - 0.62, v0 - 0.04, PLINTH, du + 0.62, v0, PLINTH + 2.22, true);
  L.ball('sfYellow', du + 0.33, v0 - 0.09, PLINTH + 1.0, 0.04, true);
  /* The lamp by the door. */
  L.deco('sfLamp', du + 0.75, v0 - 0.14, PLINTH + 1.75, du + 0.9, v0, PLINTH + 2.0, true);
  /* The path to the pavement. */
  L.paint('sfWalk', du - 0.6, 0, 0, du + 0.6, v0 - (porch ? 3.0 : 1.2), 0.035);

  /* Windows: the front's either side of the door, the upstairs evenly. */
  const wsill = PLINTH + 0.95;
  const wh = 1.35;
  const frontWins = [];
  for (const u of [hu0 + 1.5, hu1 - 1.5]) {
    if (Math.abs(u - du) > 1.6) {
      frontWins.push(u);
    }
  }
  if (hw > 10.2 && Math.abs((hu0 + hu1) / 2 - du) > 1.6) {
    frontWins.push((hu0 + hu1) / 2);
  }
  for (const u of frontWins) {
    windowOn(L, 'front', u, v0, wsill + wh / 2, 1.2, wh, shutter, true);
  }
  for (const u of [hu0 + 1.6, hu1 - 1.6, (hu0 + hu1) / 2]) {
    if (storeys === 2) {
      windowOn(L, 'front', u, v0, wsill + STOREY + wh / 2, 1.1, wh - 0.1, shutter, true);
    }
    windowOn(L, 'back', u, v1, wsill + wh / 2, 1.1, wh, null, true);
    if (storeys === 2 && u !== (hu0 + hu1) / 2) {
      windowOn(L, 'back', u, v1, wsill + STOREY + wh / 2, 1.0, wh - 0.1, null, true);
    }
  }
  /* The sides: the end without the garage gets two a floor. */
  const sides = garageW > 0 ? [left ? 'right' : 'left'] : ['left', 'right'];
  for (const s of sides) {
    const at = s === 'left' ? hu0 : hu1;
    for (const v of [v0 + 2.2, v1 - 2.2]) {
      windowOn(L, s, v, at, wsill + wh / 2, 1.0, wh, null, true);
      if (storeys === 2) {
        windowOn(L, s, v, at, wsill + STOREY + wh / 2, 0.9, wh - 0.1, null, true);
      }
    }
  }
  /* A round window in a front gable. */
  if (!along && storeys === 2) {
    L.cyl('sfTrim', [(hu0 + hu1) / 2, v0 + 0.02, eave + 1.0], [(hu0 + hu1) / 2, v0 - 0.08, eave + 1.0], 0.45, 14, null, true);
    L.cyl('sfGlassDark', [(hu0 + hu1) / 2, v0, eave + 1.0], [(hu0 + hu1) / 2, v0 - 0.1, eave + 1.0], 0.33, 14, null, true);
  }
  /* The back door, an air conditioner and the downpipes. */
  L.paint('sfTrim', du - 0.45, v1, PLINTH, du + 0.45, v1 + 0.05, PLINTH + 2.05, true);
  L.box('sfSteel', hu1 - 1.6, v1 + 0.1, 0, hu1 - 0.6, v1 + 0.9, 0.85, { kind: 'wall', name: 'air conditioner' });
  for (const [u, v] of [[hu0 + 0.15, v0 - 0.12], [hu1 - 0.15, v0 - 0.12], [hu0 + 0.15, v1 + 0.12], [hu1 - 0.15, v1 + 0.12]]) {
    L.cyl('sfTrim', [u, v, 0.1], [u, v, eave], 0.045, 5, null, true);
  }
  /* A dish on the roof. */
  if (r.chance(0.3)) {
    const u = along ? hu0 + 1.4 : (hu0 + hu1) / 2 + 1.6;
    const v = along ? v0 + 1.4 : v1 - 1.6;
    L.cyl('sfSteel', [u, v, ridge - 1.4], [u, v, ridge - 0.7], 0.03, 4, null, true);
    L.ball('sfTrim', u, v - 0.12, ridge - 0.55, 0.28, true);
  }

  /* The front yard: the letterbox, the beds, and a hedge or a fence. */
  const mu = garageW > 0 ? (left ? gu0 - 0.6 : gu1 + 0.6) : du + 1.6;
  L.post('sfWood', mu, 0.45, 0, 1.05, 0.05, { kind: 'pole', name: 'letterbox post' });
  L.box(r.pick(['sfIron', 'sfTrim', 'sfDoorRed']), mu - 0.14, 0.2, 1.0, mu + 0.14, 0.7, 1.25, { solid: false });
  L.deco('sfRed', mu + 0.14, 0.55, 1.15, mu + 0.17, 0.62, 1.45, true);
  for (const u of frontWins) {
    L.paint('sfDirt', u - 1.0, v0 - 1.0, 0, u + 1.0, v0 - 0.1, 0.12, true);
    for (let k = 0; k < 4; k += 1) {
      L.ball(r.pick(FLOWERS), u - 0.75 + k * 0.5, v0 - 0.55, 0.28, 0.2, true);
    }
  }
  const frontKind = r.next();
  if (clear) {
    /* Open lawn. */
  } else if (frontKind < 0.3) {
    /* A hedge along the front, broken for the path and the drive. */
    const runs = [[0.3, du - 0.9]];
    const drive0 = garageW > 0 ? gu0 + 0.1 : null;
    if (drive0 !== null && left) {
      runs[0] = [gu1 + 0.1, du - 0.9];
    }
    runs.push([du + 0.9, garageW > 0 && !left ? gu0 - 0.1 : Wl - 0.3]);
    for (const [a, b] of runs) {
      if (b - a > 1.2) {
        L.box('sfHedge', a, 1.2, 0, b, 2.0, 1.0, { kind: 'canopy', name: 'hedge' });
      }
    }
  } else if (frontKind < 0.55) {
    const runs = [[0.2, du - 0.8]];
    if (garageW > 0 && left) {
      runs[0] = [gu1 + 0.1, du - 0.8];
    }
    runs.push([du + 0.8, garageW > 0 && !left ? gu0 - 0.1 : Wl - 0.2]);
    for (const [a, b] of runs) {
      if (b - a > 1.2) {
        picket(L, a, b, 1.0);
      }
    }
  }
  /* A street tree out front, on the side away from the drive. */
  if (r.chance(0.7) && sb >= 4.2 && !clear) {
    const u = garageW > 0 ? (left ? Wl - 2.6 : 2.6) : (du < Wl / 2 ? Wl - 2.6 : 2.6);
    const style = r.chance(0.8) ? 'street' : 'pine';
    L.asset({ type: 'tree', style, dims: { size: style === 'pine' ? 0.7 : 0.75, variant: r.int(1, 99) } }, 1, u, 2.0, 0, 0);
  }

  /* The back yard: the fence, then what is in it. */
  const backStart = v1 - 1.0;
  if (Dl - backStart > 2.5) {
    fence(L, 0.1, Dl - 0.16, Wl - 0.1, Dl - 0.16, true);
    /* Both sides: a neighbour's fence stands 0.3 m off, which is closed. */
    fence(L, 0.15, backStart, 0.15, Dl - 0.16, true);
    fence(L, Wl - 0.15, backStart, Wl - 0.15, Dl - 0.16, true);
    backyardThings(L, r, 0.8, Wl - 0.8, v1 + 1.2, Dl - 0.8, true);
  }
}

/* Every house, and the hedge. */
export function houses(T) {
  LOTS.forEach((lot, i) => {
    /* The two lots either side of the hedge keep their front yards clear
     * along the tunnel's line: no tree, no hedge, no fence, no car. */
    const clear = i === HEDGE_LOT || i === HEDGE_LOT + 1;
    house(T, lot, 1103 + i * 7919, clear);
  });
  hedgeTunnel(T, LOTS[HEDGE_LOT]);
}

/*
 * THE HEDGE YOU FLY THROUGH: a clipped privet four metres high and twelve
 * long down a lot's side from the pavement, with a tunnel through it on the
 * line along the front yards. Solid either side of the tunnel and over it,
 * as the boxes it is drawn as. The opening it leaves is hedgeGap().
 */
export const HEDGE = { h: 4.0, tw: 2.6, th: 2.6, v0: 0.4, v1: 12.4, tv: 2.6 };

/* The tunnel's opening in the plan: its middle, the way it is flown along
 * (the lot's u axis) and its clear size, for ./yard.js. */
export function hedgeGap() {
  const lot = LOTS[HEDGE_LOT];
  const L = lotFrame(null, lot);
  const [px, py] = L.at(0, HEDGE.tv);
  return { px, py, alongX: L.uAlongX, w: HEDGE.tw - 0.3, h: HEDGE.th - 0.3 };
}

function hedgeTunnel(T, lot) {
  const L = lotFrame(T, lot);
  const u0 = -0.6;
  const u1 = 0.6;
  const { v0, v1, tv } = HEDGE;
  /* Either side of the tunnel and over it. */
  L.box('sfHedge', u0, v0, 0, u1, tv - HEDGE.tw / 2, HEDGE.h, { kind: 'canopy', name: 'hedge tunnel' });
  L.box('sfHedge', u0, tv + HEDGE.tw / 2, 0, u1, v1, HEDGE.h, { kind: 'canopy', name: 'hedge tunnel' });
  L.box('sfHedge', u0, tv - HEDGE.tw / 2, HEDGE.th, u1, tv + HEDGE.tw / 2, HEDGE.h, { kind: 'canopy', name: 'hedge tunnel' });
  /* The tunnel's floor, trodden bare. */
  L.paint('sfDirt', u0 + 0.05, tv - HEDGE.tw / 2, 0.01, u1 - 0.05, tv + HEDGE.tw / 2, 0.02);
}
