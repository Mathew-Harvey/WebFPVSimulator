/*
 * bardwell.js: Joshua Bardwell's house and yard, the outside of it, as the
 * parts a built map holds. Pure data and arithmetic, no Three.js, no JS
 * trigonometry, so the solids can be built and checked in plain Node, the
 * way ../heads/heads.js is.
 *
 * WHERE IT COMES FROM. The first build (2026-10-21, from fourteen stills of
 * Joshua's videos) was wrong, and the owner said so the same day: "you
 * didn't get bardwells house correct at all sadly, review this and fix your
 * model completely then add more detail". With that came the layout of an
 * Uncrashed Workshop map of the place, "Joshua Bardwell House / Perfect
 * Beginner Map" (Workshop item 3637027069, by xWallow, a fan's recreation
 * from public video and, in its own words, not a one to one replica), and
 * a screenshot of it. This is that place. Every position here was read off
 * that layout's transforms, in metres, the way Nick Burns' house read its
 * three Workshop layouts: nothing of the map itself is in the repository,
 * no mesh, no texture, no file, only numbers measured from it.
 *
 * What it is: a cream brick house of a storey and a half under a steep
 * orange shingle gable, white trim, a white chimney up the west gable, a
 * deep porch across the south front on white columns over brick piers with
 * a white railing; a white car on a concrete pad by the chimney; a timber
 * woodshed behind the house with the firewood stacked in it; a split rail
 * pen on the lawn in front; a gravel drive past the yard down the hill to
 * the road, a white van and a white car on it; and to the east a big field
 * behind a split rail fence with a curving west side, with practice cages
 * and frames in it; tall pines and broadleaves everywhere. The map's race
 * runs through all of it, and its twenty two gates are drawn here where it
 * put them, each a named gap: through the start under an A frame of gates,
 * into and out of a cage, down the field through two frames, up through a
 * frame stacked on a frame, back through two hoops, across the top, round
 * the woods past four flags, back through three inflatables and over the
 * house's ridge.
 *
 * WHAT IS INFERRED. The layout gives where a thing is, how it is turned and
 * how much it is stretched, and not how big the thing it stretches is. So
 * the sizes are read from the screenshots against things of known size (a
 * car, a door, a five inch on the roof) where the numbers do not settle
 * them: the house's depth and its porch's, the drive's width, the gates'
 * openings, the woodshed's frame. The ground is level. A thing the layout
 * names that the screenshots never show is left out rather than guessed.
 *
 * THE SCALE is life size (S = 1): a five inch map, flown outside only, the
 * owner's ask of 2026-10-21. Every building is solid; windows and doors are
 * paint.
 *
 * THE PLAN'S FRAME, as Heads' house's: px east, py north, h up, metres. The
 * origin is the layout's own, so a number here is the layout's: px is its
 * X and py its Y turned over (Unreal's Y runs the other way), both divided
 * by a hundred.
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

import { Parts } from '../../props/parts.js';
import { partsOf } from '../../props/catalog.js';
import { loblollyLayout } from '../../props/street.js';
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';

/* ------------------------------------------------------------------ */
/* The frame                                                           */
/* ------------------------------------------------------------------ */

/* World metres to a real metre: life size. */
export const S = 1;

/* The plot in plan metres: the yard, the field, the woods round them and
 * the road at the bottom of the drive. */
const PX0 = -50;
const PX1 = 112;
const PY0 = -108;
const PY1 = 62;
export const PLOT = { x0: PX0, x1: PX1, y0: PY0, y1: PY1 };

export const FIELD_W = (PX1 - PX0) * S;
export const FIELD_D = (PY1 - PY0) * S;
export const X0 = -PX0 * S;
export const Y0 = -PY0 * S;

/* The plan's origin in the world (../built/place.js docToWorld). */
const OX = X0 - FIELD_W / 2;
const OZ = FIELD_D / 2 - Y0;

const wx = (px) => OX + S * px;
const wz = (py) => OZ - S * py;
const wy = (h) => S * h;

/* A plan point as the document's (x, y), for ./yard.js. */
export function docAt(px, py) {
  return { x: X0 + S * px, y: Y0 + S * py };
}

/* A plan point as the world's [x, y, z]. */
export function worldAt(px, py, h = 0) {
  return [wx(px), wy(h), wz(py)];
}

export const FRAME = { OX, OZ, S };

/* Degrees to radians, for the headings below: a product, so the same bits
 * everywhere. */
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* The numbers, metres                                                 */
/* ------------------------------------------------------------------ */

/* THE HOUSE: the layout puts its front step at (-0.8, 4.9), its porch
 * railing at py 8.4, its chimney's foot at (-8, 13.5), its back corner by
 * the short fence at py 19.5, a bush hard by its east wall at px 4.2 and
 * the gate on its roof at 9.8 m. A storey and a half: the upstairs floor
 * is 4.23 up and its windows are in the gables and under the roof. */
export const HOUSE = { x0: -7.5, x1: 3.5, y0: 11.4, y1: 19.2 };
const FLOOR = 0.83;
const EAVE = 5.6;
const HOUSE_PITCH = 1.02;
const HOUSE_OVER = 0.35;
const ROOF_T = 0.2;
/* A roof's solid is stacked in bands this high under its drawn slopes. */
const BAND = 0.05;
const GABLE_T = 0.2;

/* The porch across the south front: a brick base under a grey deck, square
 * white columns on brick piers, a white railing between them broken for
 * the steps, and its own shallow roof run down from under the main eave at
 * the pitch the layout's plants lie on, 23.8 degrees. */
const PORCH = { x0: -7.5, x1: 3.5, y0: 8.2, y1: 11.4, deck: 0.73 };
const COLS = [-7.28, -4.62, -1.98, 0.38, 3.28];
const COL_Y = 8.37;
const STEPS = { x0: -1.8, x1: 0.2 };
const RAIL_TOP = 1.45;
const BEAM = { h0: 3.7, h1: 3.92 };
const PORCH_ROOF = { a0: 7.9, t0: 3.86, a1: 11.4, t1: 5.4, t: 0.15 };

/* The chimney, white, up the west gable: a broad foot, a shoulder, the
 * stack past the eave. */
export const CHIMNEY = { x0: -8.3, x1: -7.5, y0: 12.5, y1: 14.5, top: 8.95 };

/* The car's pad by the chimney, and the woodshed behind the house, on its
 * slab, the firewood in its east bay. */
const PAD = { x0: -14.2, x1: -8.3, y0: 10, y1: 19.5 };
export const WOODSHED = { x0: -7.6, x1: -0.4, y0: 21.9, y1: 26.3, eave: 2.65 };
const SHED_POSTS_X = [-7.4, -4.0, -0.6];

/* The pen on the lawn in front, split rail like every fence here. */
const PEN = [[-5.5, -3], [12.5, -3], [12.5, 3], [-5.5, 3], [-5.5, -3]];
const RAILS = [0.35, 0.7, 1.05];
const FENCE_POST = 1.2;

/*
 * THE FIELD'S FENCES, the layout's own runs of rail chained end to end.
 * The north and east sides, the bottom and the west side's straight top;
 * the curve of the west side; and the short runs: one along the drive by
 * the van, one each side of the field's corner where the race starts, one
 * across the end of the car's pad. The openings between them are the
 * layout's: the start's, a walker's gap north of it, and the drive's at
 * the bottom of the field.
 */
const FENCES = [
  [[39.0, -63.5], [39.0, -65.7], [42.0, -83.5], [82.0, -83.5], [92.7, 38.1], [28.0, 43.7], [28.0, 36.0]],
  [[39.0, -59.5], [39.0, -57.5], [40.1, -49.8], [41.9, -42.9], [44.5, -35.6], [44.9, -33.9], [47.5, -24.8],
    [48.2, -19.4], [48.4, -9.8], [47.7, -4.3], [43.8, 6.6], [41.3, 12.1], [39.6, 15.5], [37.9, 19.0], [36.7, 20.6],
    [36.5, 22.5]],
  [[16.2, 12.5], [16.4, 14.4], [16.9, 16.3], [17.6, 18.2], [17.9, 20.1]],
  [[28.0, 32.5], [28.0, 28.5]],
  [[-10.0, 19.5], [-8.3, 19.5]],
];

/* THE DRIVE, gravel, down from the yard past the field to the road: the
 * layout's pieces of it joined at their middles, five and a half metres
 * wide, with the wide place by the van where the cars stand. */
const DRIVE = [
  [20.8, 27], [21.0, 12.6], [20.5, 2.6], [20.5, -7.4], [21.1, -17.2], [23.0, -27.8], [26.0, -37.5],
  [27.5, -44.5], [31.0, -52.0], [32.4, -59.3], [34.2, -63.6], [35.2, -69.6], [36.7, -74.6], [37.7, -79.1],
  [38.2, -84.1], [39.2, -88.1], [39.2, -93.1], [39.4, -100],
];
const DRIVE_W = 5.5;
const APRON = { x0: 17.6, x1: 27.6, y0: -6.5, y1: 17.5 };
/* The wet patches the layout lays on the drive. */
const PUDDLES = [[20.5, -5.5], [20.5, -11], [22.0, -20.5], [23.5, -30.5]];
/* The dirt path along the outside of the field's curving fence. */
const PATH = [
  [38.5, 14.5], [39.5, 9.5], [41.0, 8.0], [42.5, 4.5], [43.0, 1.5], [45.5, -3], [45.5, -7], [46.0, -10.5],
  [46.5, -15], [46.5, -19], [45.0, -21], [44.5, -24], [43.5, -28.5], [43.0, -32], [42.0, -35], [40.5, -38.5],
  [39.5, -41.5], [38.0, -44], [36.5, -47],
];
/* The road along the bottom. */
export const ROAD = { y: -102.5, w: 6 };

/* The cages and frames in the field, square to it (the layout turns them
 * five degrees, and they are drawn square). Each { x0, x1, y0, y1, levels }:
 * the cage is five metres every way and two high; a frame is five by five
 * and a metre deep; the frame at the bottom of the field is two high. */
const CAGES = [
  { x0: 74.8, x1: 79.8, y0: 20.35, y1: 25.35, levels: [0, 5, 10] },
  { x0: 76.4, x1: 81.4, y0: -28.5, y1: -27.5, levels: [0, 5] },
  { x0: 75.0, x1: 80.0, y0: -49.4, y1: -48.4, levels: [0, 5] },
  { x0: 59.8, x1: 64.8, y0: -69.0, y1: -68.0, levels: [0, 5, 10] },
];
const CAGE_BAR = 0.1;

/*
 * THE RACE'S GATES, in its order, where the layout put them: a kind, the
 * middle of the opening's foot in the plan, the height its frame stands
 * at, the heading it is flown along (degrees, east 0, north 90), and for a
 * frame its clear opening. Frames are the layout's square gates, a metre
 * eighty clear at its scale one; the stretched ones are stretched by its
 * numbers. A heading within six degrees of square is drawn square.
 */
const GATE_CLEAR = 1.8;
export const GATES = [
  { kind: 'frame', px: 28.0, py: 25.5, h: 1.0, deg: 0, name: 'THE START', points: 100 },
  { kind: 'frame', px: 39.5, py: 25.5, h: 1.0, deg: 0, name: 'UNDER THE A FRAME', points: 100 },
  { kind: 'frame', px: 75.0, py: 23.0, h: 1.87, deg: 0, w: 2.11 * GATE_CLEAR, hh: 1.55 * GATE_CLEAR, name: 'INTO THE CAGE', points: 250 },
  { kind: 'frame', px: 77.07, py: 20.36, h: 1.87, deg: -90, w: 2.08 * GATE_CLEAR, hh: 1.55 * GATE_CLEAR, name: 'OUT OF THE CAGE', points: 250 },
  { kind: 'frame', px: 78.91, py: -27.48, h: 1.37, deg: -90, name: 'THE FIRST FRAME', points: 100 },
  { kind: 'frame', px: 77.57, py: -48.45, h: 1.37, deg: -90, name: 'THE SECOND FRAME', points: 100 },
  { kind: 'frame', px: 62.3, py: -68.0, h: 6.37, deg: 90, base: 5 + CAGE_BAR, name: 'THE HIGH FRAME', points: 250 },
  { kind: 'hoop', px: 61.0, py: -24.5, deg: 90, name: 'THE FIRST HOOP', points: 100 },
  { kind: 'hoop', px: 61.0, py: 10.5, deg: 90, name: 'THE SECOND HOOP', points: 100 },
  { kind: 'frame', px: 63.6, py: 40.65, h: 1.96, deg: 90, name: 'THE NORTH CORNER', points: 100 },
  { kind: 'frame', px: 49.12, py: 51.91, h: 2.55, deg: 180, name: 'OVER THE FENCE', points: 100 },
  { kind: 'frame', px: 4.18, py: 54.05, h: 1.0, deg: 190, name: 'THE TOP OF THE WOODS', points: 100 },
  { kind: 'frame', px: -16.26, py: 50.91, h: 1.0, deg: 210, name: 'INTO THE TREES', points: 100 },
  { kind: 'module', px: -32.07, py: 36.15, h: 0.6, deg: 250, w: 2.4, hh: 1.8, name: 'THE WEST GATE', points: 100 },
  { kind: 'flag', px: -37.93, py: 6.89, deg: -90, name: 'THE FIRST FLAG', points: 100 },
  { kind: 'flag', px: -34.86, py: -8.06, deg: -86, name: 'THE SECOND FLAG', points: 100 },
  { kind: 'flag', px: -36.06, py: -28.91, deg: -83, name: 'THE THIRD FLAG', points: 100 },
  { kind: 'flag', px: -28.0, py: -55.12, deg: -45, name: 'THE LAST FLAG', points: 100 },
  { kind: 'raised', px: 2.2, py: -64.08, deg: 25, name: 'THE LOW ROAD', points: 100 },
  { kind: 'arch', px: 20.92, py: -39.74, deg: 80, name: 'THE ARCH', points: 100 },
  { kind: 'raised', px: 8.27, py: -8.28, deg: 115, name: 'BY THE PEN', points: 100 },
  { kind: 'frame', px: -4.1, py: 15.3, h: 9.8, deg: 90, w: 3.39 * GATE_CLEAR, hh: 2 * GATE_CLEAR, name: 'OVER THE RIDGE', points: 500 },
];

/* The A frame over the start: the layout's eight gates leant together in
 * pairs into a canopy along the start, its ridge 6.43 up. */
const AFRAME = { x0: 26, x1: 41, y: 25.5, ridge: 6.43, foot: 4.31, half: 2.12, bays: [26, 31, 36, 41] };

/* The timber stand by the field, the lean-to with the tin roof and the
 * doghouse beside it, all three where the layout has them. */
const STAND = { x0: 31.3, x1: 33.7, y0: -15.7, y1: -13.3, deck: 2.3, top: 4.6 };
const LEANTO = { x0: 28.1, x1: 30.9, y0: -23.1, y1: -18.5, low: 2.3, high: 2.65 };
const DOGHOUSE = { x0: 34.7, x1: 35.7, y0: -19.5, y1: -18.1, eave: 0.85 };

/* Paint on the ground, each a little over the last. */
const G_MULCH = 0.02;
const G_DIRT = 0.026;
const G_CONCRETE = 0.03;
const G_GRAVEL = 0.031;
const G_WET = 0.036;
const G_LINE = 0.04;

/* ------------------------------------------------------------------ */
/* The builder                                                         */
/* ------------------------------------------------------------------ */

/*
 * Everything is added in plan terms and lands in one Parts list in the
 * world frame, plus what the parts cannot say: roof slopes and gables
 * (prisms), round tops (discs), drawn cylinders, flat boxes turned to any
 * heading (oboxes: the drive, the road, the flags' cloth), the hoops
 * (tori), and the town's own trees and cars (scaled). Those are the
 * draw()'s, in ./index.js.
 */
class Yard {
  constructor() {
    this.P = new Parts();
    this.prisms = [];
    this.discs = [];
    this.cyls = [];
    this.oboxes = [];
    this.tori = [];
    this.scaled = [];
    this.roofs = [];
  }

  box(m, px0, py0, h0, px1, py1, h1, opts = {}) {
    return this.P.box(m, wx(px0), wy(h0), wz(py0), wx(px1), wy(h1), wz(py1), opts);
  }

  /* Paint: drawn, not solid. */
  paint(m, px0, py0, h0, px1, py1, h1) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, cast: false });
  }

  /* A solid that is not drawn. */
  hidden(px0, py0, h0, px1, py1, h1, kind = 'wall', name = 'hidden') {
    return this.box('homeWallIn', px0, py0, h0, px1, py1, h1, { draw: false, kind, name });
  }

  cap(m, a, b, r, opts = {}) {
    return this.P.cap(m, worldAt(a[0], a[1], a[2]), worldAt(b[0], b[1], b[2]), S * r, opts);
  }

  post(m, px, py, h0, h1, r, opts = {}) {
    return this.cap(m, [px, py, h0], [px, py, h1], r, opts);
  }

  ball(m, px, py, h, r, opts = {}) {
    return this.cap(m, [px, py, h], [px, py, h], r, { look: 'capsule', kind: 'tree', seg: 10, ...opts });
  }

  prism(m, axis, profile, e0, e1) {
    this.prisms.push({ m, axis, profile, e0, e1 });
  }

  /* A round top, drawn only, from h0 to h1. */
  disc(m, px, py, r, h0, h1) {
    this.discs.push({ m, px, py, r, h0, h1 });
  }

  cyl(m, a, b, r, seg = 8) {
    this.cyls.push({ m, a: worldAt(a[0], a[1], a[2]), b: worldAt(b[0], b[1], b[2]), r: S * r, seg });
  }

  /* A box drawn turned: a0 to a1 along the plan's unit (ux, uy) from
   * (px, py), b0 to b1 across it to its left, h0 to h1 up. Drawn only. */
  obox(m, px, py, ux, uy, a0, a1, b0, b1, h0, h1) {
    this.oboxes.push({ m, px, py, ux, uy, a0, a1, b0, b1, h0, h1 });
  }

  /* A ring standing on edge, its middle `h` up, flown along (nx, ny):
   * drawn only; its solid is the caps the caller adds. */
  torus(m, px, py, h, R, t, nx, ny) {
    this.tori.push({ m, px, py, h, R, t, nx, ny });
  }

  asset(el, k, px, py, h, yaw, chunk = 'extra') {
    this.scaled.push({ el, k, px, py, h, yaw, chunk });
  }
}

/* A heading's unit in the plan, from this module's own sine. */
const SC = { s: 0, c: 1 };
function unitOf(deg) {
  sincos(deg * DEG, SC);
  return [SC.c, SC.s];
}

/* A run's unit and length, with a square root, which is the same bits
 * everywhere. */
function along(p, q) {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  return { ux: dx / len, uy: dy / len, len };
}

/* ------------------------------------------------------------------ */
/* Roofs, as ../heads/heads.js builds them                             */
/* ------------------------------------------------------------------ */

/*
 * Solid bands stacked under a drawn roof, each spanning what the roof
 * covers at the band's top, so the solid is never over the drawn surface
 * and never more than a band under it.
 */
function bands(Y, axis, E0, E1, h0, h1, span) {
  const n = Math.max(1, Math.ceil((h1 - h0) / BAND - 1e-9));
  for (let k = 1; k <= n; k += 1) {
    const lo = h0 + ((h1 - h0) * (k - 1)) / n;
    const hi = h0 + ((h1 - h0) * k) / n;
    const s = span(hi);
    if (!s || !(s[1] - s[0] > 1e-6)) {
      continue;
    }
    if (axis === 'x') {
      Y.hidden(E0, s[0], lo, E1, s[1], hi, 'wall', 'roof');
    } else {
      Y.hidden(s[0], E0, lo, s[1], E1, hi, 'wall', 'roof');
    }
  }
}

/*
 * A gable roof over a rectangle whose walls stand to `eave`, ridge along
 * `axis`, slopes across a0..a1, from e0 to e1 along the ridge with the
 * overhang past both. The attic under it is solid, the overhang a slab.
 * `gables` names the ends that get a triangle of `gable`.
 */
function gableRoof(Y, axis, a0, a1, e0, e1, eave, o = {}) {
  const over = o.over ?? 0.35;
  const pitch = o.pitch;
  const half = (a1 - a0) / 2;
  const mid = a0 + half;
  const yEdge = eave - 0.15;
  const ridge = yEdge + pitch * (half + over);
  const edge0 = a0 - over;
  const edge1 = a1 + over;
  const E0 = o.E0 ?? e0 - over;
  const E1 = o.E1 ?? e1 + over;
  const top = (a) => yEdge + pitch * Math.min(a - edge0, edge1 - a);
  const roofM = o.roof;
  Y.prism(roofM, axis, [[edge0, yEdge - ROOF_T], [edge0, yEdge], [mid, ridge], [mid, ridge - ROOF_T]], E0, E1);
  Y.prism(roofM, axis, [[edge1, yEdge - ROOF_T], [mid, ridge - ROOF_T], [mid, ridge], [edge1, yEdge]], E0, E1);
  for (const [at, side] of [[edge0, -1], [edge1, 1]]) {
    const p = side < 0 ? at - 0.03 : at - 0.02;
    const q = side < 0 ? at + 0.02 : at + 0.03;
    Y.prism(o.fascia ?? 'homeTrim', axis, [[p, yEdge - ROOF_T - 0.02], [p, yEdge + 0.01], [q, yEdge + 0.01], [q, yEdge - ROOF_T - 0.02]], E0, E1);
  }
  const apex = ridge - ROOF_T - 0.01;
  const tri = [[a0, eave], [a1, eave], [mid, apex]];
  const which = o.gables ?? 'both';
  if (which === 'both' || which === 'e0') {
    Y.prism(o.gable, axis, tri, e0, e0 + GABLE_T);
  }
  if (which === 'both' || which === 'e1') {
    Y.prism(o.gable, axis, tri, e1 - GABLE_T, e1);
  }
  const run = (h) => Math.max(0, (h - yEdge) / pitch);
  bands(Y, axis, Math.max(E0, e0), Math.min(E1, e1), eave, ridge, (h) => [edge0 + run(h), edge1 - run(h)]);
  /* Under the eaves, the slab outside the walls; past the gables, the
   * slab alone, so under a gable's overhang is air, as it looks. */
  bands(Y, axis, E0, E1, yEdge - ROOF_T, eave, (h) => [edge0 + run(h), a0]);
  bands(Y, axis, E0, E1, yEdge - ROOF_T, eave, (h) => [a1, edge1 - run(h)]);
  const slab = (s0, s1) => {
    const n = Math.max(1, Math.ceil((ridge - (yEdge - ROOF_T)) / BAND - 1e-9));
    for (let k = 1; k <= n; k += 1) {
      const lo = yEdge - ROOF_T + ((ridge - yEdge + ROOF_T) * (k - 1)) / n;
      const hi = yEdge - ROOF_T + ((ridge - yEdge + ROOF_T) * k) / n;
      const out0 = edge0 + run(hi);
      const in0 = edge0 + run(lo + ROOF_T);
      const in1 = edge1 - run(lo + ROOF_T);
      const out1 = edge1 - run(hi);
      for (const [p, q] of in0 < in1 ? [[out0, in0], [in1, out1]] : [[out0, out1]]) {
        if (q - p > 1e-6) {
          if (axis === 'x') {
            Y.hidden(s0, p, lo, s1, q, hi, 'wall', 'roof');
          } else {
            Y.hidden(p, s0, lo, q, s1, hi, 'wall', 'roof');
          }
        }
      }
    }
  };
  if (E0 < e0) {
    slab(E0, e0);
  }
  if (E1 > e1) {
    slab(e1, E1);
  }
  Y.roofs.push({ axis, edge0, edge1, e0, e1, E0, E1, yEdge, pitch, top });
  return { ridge, mid, top, yEdge, edge0, edge1, E0, E1 };
}

/*
 * A sloping slab, a shed roof: its top from (a0, t0) to (a1, t1) across,
 * along `axis` from e0 to e1, thickness t, drawn as a prism and made
 * solid as a run of boxes each under its stretch of the slope.
 */
function shedRoof(Y, m, axis, a0, t0, a1, t1, e0, e1, t = 0.15) {
  Y.prism(m, axis, [[a0, t0 - t], [a0, t0], [a1, t1], [a1, t1 - t]], e0, e1);
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 0.25));
  const at = (u) => t0 + (t1 - t0) * u;
  for (let k = 0; k < n; k += 1) {
    const u0 = k / n;
    const u1 = (k + 1) / n;
    const lo = Math.max(at(u0), at(u1)) - t;
    const hi = Math.min(at(u0), at(u1));
    const b0 = a0 + (a1 - a0) * u0;
    const b1 = a0 + (a1 - a0) * u1;
    if (hi - lo < 0.02) {
      continue;
    }
    if (axis === 'x') {
      Y.hidden(e0, Math.min(b0, b1), lo, e1, Math.max(b0, b1), hi, 'wall', 'roof');
    } else {
      Y.hidden(Math.min(b0, b1), e0, lo, Math.max(b0, b1), e1, hi, 'wall', 'roof');
    }
  }
}

/* The courses of a shingle roof: thin dark strips lying along the slope's
 * surface parallel to the ridge, `step` apart from a0 toward a1, each a
 * prism along `axis` from e0 to e1, `top` the roof's height across. */
function courses(Y, m, axis, a0, a1, top, e0, e1, step = 0.33) {
  const dir = a1 > a0 ? 1 : -1;
  for (let a = a0 + dir * step; dir * (a1 - a) > 0.15; a += dir * step) {
    const b = a + dir * 0.045;
    Y.prism(m, axis, [[a, top(a) + 0.004], [b, top(b) + 0.004], [b, top(b) + 0.016], [a, top(a) + 0.016]], e0, e1);
  }
}

/* ------------------------------------------------------------------ */
/* Paint on faces                                                      */
/* ------------------------------------------------------------------ */

/* Paint on the outside of a rectangle's face 's', 'n', 'w' or 'e', from
 * a0 to a1 along it (px for 's' and 'n', py for 'w' and 'e'), h0 to h1,
 * standing d off the face and t deep. */
function onFace(Y, m, r, f, a0, a1, h0, h1, d = 0.006, t = 0.01) {
  if (f === 's') {
    Y.paint(m, a0, r.y0 - d - t, h0, a1, r.y0 - d, h1);
  } else if (f === 'n') {
    Y.paint(m, a0, r.y1 + d, h0, a1, r.y1 + d + t, h1);
  } else if (f === 'w') {
    Y.paint(m, r.x0 - d - t, a0, h0, r.x0 - d, a1, h1);
  } else {
    Y.paint(m, r.x1 + d, a0, h0, r.x1 + d + t, a1, h1);
  }
}

/* A window: dark glass in a white frame, `lights` panes across with a
 * white bar between each, and a sill under it. */
function windowOn(Y, r, f, a0, a1, h0, h1, lights = 2, frame = 'homeTrim') {
  const w = 0.09;
  onFace(Y, 'homeWindow', r, f, a0, a1, h0, h1, 0.008, 0.01);
  onFace(Y, frame, r, f, a0 - w, a0, h0 - w, h1 + w, 0.008, 0.035);
  onFace(Y, frame, r, f, a1, a1 + w, h0 - w, h1 + w, 0.008, 0.035);
  onFace(Y, frame, r, f, a0, a1, h1, h1 + w, 0.008, 0.035);
  onFace(Y, frame, r, f, a0 - w - 0.04, a1 + w + 0.04, h0 - w, h0, 0.008, 0.06);
  for (let k = 1; k < lights; k += 1) {
    const a = a0 + ((a1 - a0) * k) / lights;
    onFace(Y, frame, r, f, a - 0.025, a + 0.025, h0, h1, 0.008, 0.02);
  }
  /* The meeting rail across the middle, a sash window's. */
  const mh = (h0 + h1) / 2;
  onFace(Y, frame, r, f, a0, a1, mh - 0.025, mh + 0.025, 0.008, 0.02);
}

/* A door: a panel in a frame. */
function doorOn(Y, r, f, a0, a1, h0, h1, panel, frame = 'homeTrim') {
  const w = 0.09;
  onFace(Y, panel, r, f, a0, a1, h0, h1, 0.008, 0.012);
  onFace(Y, frame, r, f, a0 - w, a0, h0, h1 + w, 0.008, 0.035);
  onFace(Y, frame, r, f, a1, a1 + w, h0, h1 + w, 0.008, 0.035);
  onFace(Y, frame, r, f, a0, a1, h1, h1 + w, 0.008, 0.035);
}

/* ------------------------------------------------------------------ */
/* The house                                                           */
/* ------------------------------------------------------------------ */

function house(Y) {
  const r = HOUSE;
  Y.box('bardwellBrick', r.x0, r.y0, 0, r.x1, r.y1, EAVE, { name: 'house' });
  /* A grey foundation band, the brick's courses, white corner boards. */
  for (const f of ['s', 'n', 'w', 'e']) {
    const [a0, a1] = f === 's' || f === 'n' ? [r.x0, r.x1] : [r.y0, r.y1];
    onFace(Y, 'homeFoundation', r, f, a0, a1, 0, 0.5, 0.004, 0.012);
    for (let h = 0.8; h < EAVE - 0.1; h += 0.32) {
      onFace(Y, 'bardwellMortar', r, f, a0, a1, h - 0.012, h + 0.012, 0.002, 0.004);
    }
  }
  for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) {
    Y.paint('homeTrim', x - 0.07, y - 0.07, 0.5, x + 0.07, y + 0.07, EAVE - 0.05);
  }
  /* The front, under the porch: the door over the steps, three windows. */
  doorOn(Y, r, 's', -1.35, -0.25, FLOOR, FLOOR + 2.12, 'homeShutter');
  onFace(Y, 'homeLamp', r, 's', -1.75, -1.6, 2.35, 2.55, 0.02, 0.08);
  for (const a of [-6.5, -4.4, 1.0]) {
    windowOn(Y, r, 's', a, a + 1.2, 1.55, 2.85);
  }
  /* The back: three windows and the back door onto its stoop. */
  for (const a of [-6.4, -3.6, -0.4]) {
    windowOn(Y, r, 'n', a, a + 1.1, 1.55, 2.85);
  }
  doorOn(Y, r, 'n', 1.6, 2.5, FLOOR, FLOOR + 2.12, 'homeTrim', 'homeFoundation');
  Y.box('homeFoundation', 1.3, r.y1, 0, 2.8, r.y1 + 1.0, 0.62, { name: 'back stoop' });
  Y.box('homeFoundation', 1.3, r.y1 + 1.0, 0, 2.8, r.y1 + 1.3, 0.31, { name: 'back step' });
  /* The gables: two windows each downstairs (the west's beside the
   * chimney), a triple window upstairs, a vent under the ridge. */
  windowOn(Y, r, 'w', 15.4, 16.5, 1.55, 2.85);
  windowOn(Y, r, 'w', 17.5, 18.6, 1.55, 2.85);
  windowOn(Y, r, 'e', 12.3, 13.4, 1.55, 2.85);
  windowOn(Y, r, 'e', 14.7, 15.8, 1.55, 2.85);
  windowOn(Y, r, 'e', 17.5, 18.6, 1.55, 2.85);
  const roof = gableRoof(Y, 'x', r.y0, r.y1, r.x0, r.x1, EAVE, {
    pitch: HOUSE_PITCH, over: HOUSE_OVER, roof: 'bardwellShingle', gable: 'bardwellBrick',
  });
  windowOn(Y, r, 'w', 15.0, 17.3, 4.95, 6.05, 3);
  windowOn(Y, r, 'e', 14.2, 16.5, 4.95, 6.05, 3);
  for (const f of ['w', 'e']) {
    onFace(Y, 'homeTrim', r, f, roof.mid - 0.35, roof.mid + 0.35, 7.45, 7.95, 0.008, 0.04);
    for (let h = 7.53; h < 7.9; h += 0.09) {
      onFace(Y, 'homeShutter', r, f, roof.mid - 0.28, roof.mid + 0.28, h, h + 0.03, 0.05, 0.004);
    }
  }
  /* The shingles' courses down both slopes, and a cap along the ridge. */
  const { yEdge, edge0, edge1, mid, ridge, E0, E1 } = roof;
  courses(Y, 'bardwellCourse', 'x', edge0, mid, roof.top, E0, E1);
  courses(Y, 'bardwellCourse', 'x', edge1, mid, roof.top, E0, E1);
  Y.prism('bardwellCourse', 'x', [[mid - 0.16, roof.top(mid - 0.16) + 0.006], [mid, ridge + 0.035], [mid + 0.16, roof.top(mid + 0.16) + 0.006]], E0, E1);
  /* The white rake boards up both gables, deep, as the screenshot has
   * them, and the gutter and its downspouts along the back. */
  for (const [p, q] of [[E0 - 0.03, E0 + 0.04], [E1 - 0.04, E1 + 0.03]]) {
    Y.prism('homeTrim', 'x', [[edge0, yEdge - ROOF_T - 0.22], [edge0, yEdge + 0.01], [mid, ridge + 0.01], [mid, ridge - ROOF_T - 0.22]], p, q);
    Y.prism('homeTrim', 'x', [[edge1, yEdge - ROOF_T - 0.22], [mid, ridge - ROOF_T - 0.22], [mid, ridge + 0.01], [edge1, yEdge + 0.01]], p, q);
  }
  Y.paint('homeTrim', E0, edge1 - 0.02, yEdge - ROOF_T - 0.16, E1, edge1 + 0.12, yEdge - ROOF_T + 0.02);
  for (const x of [r.x0 + 0.2, r.x1 - 0.2]) {
    Y.paint('homeTrim', x - 0.05, r.y1 + 0.02, 0.1, x + 0.05, r.y1 + 0.12, yEdge - ROOF_T - 0.1);
  }
  /* The air conditioner by the east wall. */
  Y.box('homeCoping', 3.65, 17.6, 0, 4.45, 18.4, 0.8, { name: 'air conditioner', kind: 'obstacle' });
  Y.paint('homeShutter', 3.72, 17.67, 0.8, 4.38, 18.33, 0.82);
  return roof;
}

function chimney(Y) {
  const c = CHIMNEY;
  Y.box('homeTrim', c.x0, c.y0, 0, c.x1, c.y1, 3.0, { name: 'chimney' });
  Y.box('homeTrim', c.x0 + 0.05, c.y0 + 0.3, 3.0, c.x1, c.y1 - 0.3, 3.4, { name: 'chimney' });
  Y.box('homeTrim', c.x0 + 0.15, 13.05, 3.4, c.x1, 13.95, c.top, { name: 'chimney' });
  Y.box('homeTrim', c.x0 + 0.08, 12.98, c.top, c.x1 + 0.05, 14.02, c.top + 0.15, { name: 'chimney' });
  Y.paint('homeShutter', c.x0 + 0.3, 13.25, c.top + 0.15, c.x1 - 0.15, 13.75, c.top + 0.17);
  /* Its weathering: grey streaks down the west face. */
  for (const [y, h0, h1] of [[13.25, 6.2, 8.9], [13.6, 4.8, 8.6], [13.8, 7.1, 8.9]]) {
    Y.paint('homeCoping', c.x0 + 0.146, y - 0.02, h0, c.x0 + 0.15, y + 0.02, h1);
  }
}

function porch(Y) {
  const p = PORCH;
  /* The brick base and the grey deck on it, its boards running in. */
  Y.box('bardwellBrick', p.x0, p.y0, 0, p.x1, p.y1, 0.6, { name: 'porch base' });
  Y.box('homeFoundation', p.x0, p.y0 - 0.05, 0.6, p.x1, p.y1, p.deck, { name: 'porch deck' });
  for (let x = p.x0 + 0.25; x < p.x1; x += 0.25) {
    Y.paint('homeCoping', x - 0.008, p.y0 - 0.05, p.deck, x + 0.008, p.y1, p.deck + 0.003);
  }
  /* The steps down to the walk. */
  const s = STEPS;
  Y.box('homeFoundation', s.x0, 7.85, 0, s.x1, p.y0 - 0.05, 0.55, { name: 'step' });
  Y.box('homeFoundation', s.x0, 7.55, 0, s.x1, 7.85, 0.37, { name: 'step' });
  Y.box('homeFoundation', s.x0, 7.25, 0, s.x1, 7.55, 0.18, { name: 'step' });
  /* The columns: a brick pier, a white cap, a square white shaft. */
  for (const x of COLS) {
    Y.box('bardwellBrick', x - 0.22, COL_Y - 0.22, p.deck, x + 0.22, COL_Y + 0.22, RAIL_TOP - 0.05, { name: 'pier' });
    Y.box('homeTrim', x - 0.25, COL_Y - 0.25, RAIL_TOP - 0.05, x + 0.25, COL_Y + 0.25, RAIL_TOP + 0.03, { name: 'pier cap' });
    Y.box('homeTrim', x - 0.13, COL_Y - 0.13, RAIL_TOP + 0.03, x + 0.13, COL_Y + 0.13, BEAM.h0, { name: 'column' });
  }
  Y.box('homeTrim', p.x0, COL_Y - 0.2, BEAM.h0, p.x1, COL_Y + 0.2, BEAM.h1, { name: 'porch beam' });
  /* Its roof, run down from under the main eave over the beam, white
   * under, a white fascia along its edge. */
  const R = PORCH_ROOF;
  shedRoof(Y, 'bardwellShingle', 'x', R.a0, R.t0, R.a1, R.t1, p.x0 - 0.25, p.x1 + 0.25, R.t);
  courses(Y, 'bardwellCourse', 'x', R.a0, 11.05, (a) => R.t0 + ((R.t1 - R.t0) * (a - R.a0)) / (R.a1 - R.a0), p.x0 - 0.25, p.x1 + 0.25);
  Y.prism('homeTrim', 'x', [[R.a0, R.t0 - R.t - 0.03], [R.a0, R.t0 - R.t], [R.a1, R.t1 - R.t], [R.a1, R.t1 - R.t - 0.03]], p.x0 - 0.25, p.x1 + 0.25);
  Y.paint('homeTrim', p.x0 - 0.25, R.a0 - 0.05, R.t0 - 0.3, p.x1 + 0.25, R.a0, R.t0 + 0.01);
  /* The railing: a top rail, a bottom rail, square balusters; solid as one
   * slab, since a baluster's gap is not a craft's. */
  const rail = (x0, y0, x1, y1) => {
    Y.hidden(x0, y0, p.deck, x1, y1, RAIL_TOP, 'wall', 'railing');
    Y.paint('homeTrim', x0, y0 - 0.02, RAIL_TOP - 0.07, x1, y1 + 0.02, RAIL_TOP);
    Y.paint('homeTrim', x0, y0, p.deck + 0.06, x1, y1, p.deck + 0.12);
    const alongX = x1 - x0 > y1 - y0;
    const len = alongX ? x1 - x0 : y1 - y0;
    for (let a = 0.08; a < len - 0.03; a += 0.13) {
      if (alongX) {
        Y.paint('homeTrim', x0 + a - 0.022, y0 + 0.01, p.deck + 0.12, x0 + a + 0.022, y1 - 0.01, RAIL_TOP - 0.07);
      } else {
        Y.paint('homeTrim', x0 + 0.01, y0 + a - 0.022, p.deck + 0.12, x1 - 0.01, y0 + a + 0.022, RAIL_TOP - 0.07);
      }
    }
  };
  const ry0 = COL_Y - 0.04;
  const ry1 = COL_Y + 0.04;
  rail(COLS[0] + 0.22, ry0, COLS[1] - 0.22, ry1);
  rail(COLS[1] + 0.22, ry0, COLS[2] - 0.22, ry1);
  rail(COLS[3] + 0.22, ry0, COLS[4] - 0.22, ry1);
  rail(p.x0 + 0.06, COL_Y + 0.22, p.x0 + 0.14, p.y1);
  rail(p.x1 - 0.14, COL_Y + 0.22, p.x1 - 0.06, p.y1);
  /* On the rail by the east end, two pots of flowers, and two planters on
   * the deck by them, where the layout has its pots. */
  for (const x of [1.1, 1.8]) {
    Y.box('bardwellPot', x - 0.13, COL_Y - 0.13, RAIL_TOP, x + 0.13, COL_Y + 0.13, RAIL_TOP + 0.22, { name: 'pot', kind: 'obstacle' });
    Y.ball('bardwellBush', x, COL_Y, RAIL_TOP + 0.3, 0.17, { solid: false });
  }
  for (const [x, y] of [[1.3, 9.05], [2.5, 9.15]]) {
    Y.box('bardwellPot', x - 0.25, y - 0.25, p.deck, x + 0.25, y + 0.25, p.deck + 0.5, { name: 'planter', kind: 'obstacle' });
    Y.ball('bardwellBush', x, y, p.deck + 0.68, 0.32);
  }
  /* Two rocking chairs side by side with their backs to the wall and a
   * little table beside them, solid as one block against the wall, so
   * nothing between them and the wall or the railing is a slot. A mat at
   * the door, two ferns hanging from the beam. */
  Y.hidden(-3.5, 10.6, p.deck, -2.2, p.y1, p.deck + 1.1, 'obstacle', 'rocking chairs');
  for (const x of [-3.18, -2.52]) {
    Y.paint('homeTrim', x - 0.3, 10.62, p.deck + 0.42, x + 0.3, 11.2, p.deck + 0.47);
    Y.paint('homeTrim', x - 0.3, 11.2, p.deck + 0.42, x + 0.3, 11.27, p.deck + 1.08);
    for (const dx of [-0.28, 0.28]) {
      Y.paint('homeTrim', x + dx - 0.02, 10.62, p.deck + 0.02, x + dx + 0.02, 11.27, p.deck + 0.42);
      Y.paint('homeShutter', x + dx - 0.02, 10.6, p.deck, x + dx + 0.02, 11.35, p.deck + 0.04);
    }
  }
  Y.box('homeTrim', -3.92, 10.8, p.deck, -3.5, p.y1, p.deck + 0.55, { name: 'porch table', kind: 'obstacle' });
  Y.paint('homeShutter', -1.45, 10.6, p.deck, -0.15, 11.35, p.deck + 0.012);
  for (const x of [-5.95, -3.3]) {
    Y.paint('homeShutter', x - 0.01, COL_Y - 0.01, 3.3, x + 0.01, COL_Y + 0.01, BEAM.h0);
    Y.box('bardwellPot', x - 0.16, COL_Y - 0.16, 3.05, x + 0.16, COL_Y + 0.16, 3.3, { name: 'fern pot', kind: 'obstacle' });
    Y.ball('bardwellBush', x, COL_Y, 2.95, 0.3, { name: 'fern' });
  }
}

/* ------------------------------------------------------------------ */
/* The yard round the house                                            */
/* ------------------------------------------------------------------ */

function yardGround(Y) {
  /* The car's pad, concrete, its joints, a kerb at each end. */
  const d = PAD;
  Y.paint('homeDrive', d.x0, d.y0, 0, d.x1, d.y1, G_CONCRETE);
  for (let y = d.y0 + 2.375; y < d.y1 - 0.5; y += 2.375) {
    Y.paint('homeCoping', d.x0, y - 0.01, G_CONCRETE, d.x1, y + 0.01, G_LINE);
  }
  for (const y of [d.y0, d.y1]) {
    Y.box('homeCoping', d.x0, y - 0.12, 0, d.x1, y + 0.12, 0.12, { name: 'kerb' });
  }
  /* The walks: from the steps down to the landing and along the front of
   * the pen; from the back stoop to the drive. */
  Y.paint('homeDrive', -1.4, 4.25, 0, -0.2, 7.3, G_CONCRETE);
  Y.paint('homeDrive', -1.4, 3.9, 0, 8.7, 4.5, G_CONCRETE);
  Y.paint('homeDrive', 1.6, 20.3, 0, 17.6, 20.9, G_CONCRETE);
  /* Mulch along the front and down the east side, under the bushes. */
  Y.paint('homeMulch', -10.2, 4.9, 0, -2.0, 6.7, G_MULCH);
  Y.paint('homeMulch', 0.6, 4.9, 0, 6.6, 6.9, G_MULCH);
  Y.paint('homeMulch', 4.6, 6.9, 0, 6.6, 19.6, G_MULCH);
}

function woodshed(Y) {
  const w = WOODSHED;
  Y.box('homeDrive', w.x0, w.y0, 0, w.x1, w.y1, 0.1, { name: 'shed slab' });
  /* The frame: posts, the plates along the sides, ties across, knee
   * braces in the east bay from its posts to the plates. The west bay is
   * left open from post to plate: it is flown through. */
  for (const x of SHED_POSTS_X) {
    for (const y of [w.y0 + 0.2, w.y1 - 0.2]) {
      Y.box('bardwellTimber', x - 0.1, y - 0.1, 0.1, x + 0.1, y + 0.1, w.eave - 0.2, { name: 'shed post' });
    }
    Y.box('bardwellTimber', x - 0.1, w.y0 + 0.1, w.eave - 0.2, x + 0.1, w.y1 - 0.1, w.eave, { name: 'shed tie' });
  }
  for (const y of [w.y0 + 0.2, w.y1 - 0.2]) {
    Y.box('bardwellTimber', w.x0, y - 0.1, w.eave - 0.2, w.x1, y + 0.1, w.eave, { name: 'shed plate' });
    for (const [x, dir] of [[SHED_POSTS_X[1], 1], [SHED_POSTS_X[2], -1]]) {
      Y.cap('bardwellTimber', [x + dir * 0.1, y, 1.85], [x + dir * 0.8, y, w.eave - 0.2], 0.05, { name: 'brace', seg: 4 });
    }
  }
  /* Its roof of weathered planks, the gables closed with the same. */
  gableRoof(Y, 'x', w.y0, w.y1, w.x0, w.x1, w.eave, {
    pitch: 0.62, over: 0.4, roof: 'bardwellPlank', gable: 'bardwellPlank', fascia: 'bardwellTimber',
  });
  for (const f of ['w', 'e']) {
    for (let a = w.y0 + 0.3; a < w.y1 - 0.2; a += 0.3) {
      onFace(Y, 'bardwellTimber', w, f, a - 0.012, a + 0.012, w.eave, w.eave + 1.2, 0.205, 0.004);
    }
  }
  /* The firewood, stacked in the east bay to 1.2 m, its ends to the
   * south: low enough that the gap over it is not a slot. */
  const fw = { x0: -3.7, x1: -0.8, y0: 22.35, y1: 25.85 };
  Y.box('bardwellFirewood', fw.x0, fw.y0, 0.1, fw.x1, fw.y1, 1.2, { name: 'firewood', kind: 'obstacle' });
  for (let row = 0; row < 5; row += 1) {
    const h = 0.22 + row * 0.19;
    for (let x = fw.x0 + 0.12 + (row % 2) * 0.09; x < fw.x1 - 0.08; x += 0.19) {
      Y.cyl('bardwellLogEnd', [x, fw.y0 - 0.012, h], [x, fw.y0, h], 0.08, 6);
    }
  }
  /* The chopping block beside it, an axe in it. */
  Y.post('bardwellFirewood', 0.7, 24.6, 0, 0.5, 0.28, { name: 'chopping block', kind: 'obstacle', seg: 8 });
  Y.cap('bardwellTimber', [0.7, 24.6, 0.5], [0.95, 24.35, 1.1], 0.025, { solid: false, seg: 4 });
  Y.paint('homeCoping', 0.62, 24.55, 0.44, 0.8, 24.65, 0.56);
}

/* ------------------------------------------------------------------ */
/* Fences                                                              */
/* ------------------------------------------------------------------ */

/* A split rail fence along a run of points: a post at every point and
 * every 2.4 m between, three rails from post to post. All of it solid. */
function fenceRun(Y, pts) {
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[i + 1];
    const { len } = along(p, q);
    const n = Math.max(1, Math.ceil(len / 2.4 - 1e-9));
    for (let k = 0; k < n; k += 1) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const a = [p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0];
      const b = [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1];
      Y.post('bardwellFence', a[0], a[1], 0, FENCE_POST, 0.075, { seg: 6, name: 'fence post' });
      for (const h of RAILS) {
        Y.cap('bardwellFence', [a[0], a[1], h], [b[0], b[1], h], 0.045, { seg: 5, name: 'fence rail' });
      }
    }
  }
  const last = pts[pts.length - 1];
  Y.post('bardwellFence', last[0], last[1], 0, FENCE_POST, 0.075, { seg: 6, name: 'fence post' });
}

/* ------------------------------------------------------------------ */
/* The drive, the path, the road                                       */
/* ------------------------------------------------------------------ */

/* A band of paint along a run of points, `w` wide, a disc at each joint
 * so a bend has no notch. */
function band(Y, m, pts, w, h) {
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const p = pts[i];
    const { ux, uy, len } = along(p, pts[i + 1]);
    Y.obox(m, p[0], p[1], ux, uy, 0, len, -w / 2, w / 2, 0, h);
  }
  for (const p of pts) {
    Y.disc(m, p[0], p[1], w / 2, 0, h);
  }
}

function ground(Y) {
  band(Y, 'bardwellGravel', DRIVE, DRIVE_W, G_GRAVEL);
  const a = APRON;
  Y.paint('bardwellGravel', a.x0, a.y0, 0, a.x1, a.y1, G_GRAVEL);
  for (const [x, y] of PUDDLES) {
    Y.disc('bardwellDirt', x, y, 1.4, 0, G_WET);
  }
  band(Y, 'bardwellDirt', PATH, 1.4, G_DIRT);
  /* The road, gravel too, along the bottom, and the mailbox where the
   * drive comes out. */
  Y.paint('bardwellGravel', PX0, ROAD.y - ROAD.w / 2, 0, PX1, ROAD.y + ROAD.w / 2, G_GRAVEL);
  Y.post('homeShutter', 35.6, -98.4, 0, 1.05, 0.05, { seg: 6, kind: 'pole', name: 'mailbox post' });
  Y.box('homeShutter', 35.4, -98.7, 1.05, 35.8, -98.0, 1.3, { name: 'mailbox', kind: 'pole' });
}

/* ------------------------------------------------------------------ */
/* The field's cages and the race's gates                             */
/* ------------------------------------------------------------------ */

/* A cage of bars: posts at its corners from the first level to the last,
 * and a ring of bars round it at every level. */
function cage(Y, c) {
  const b = CAGE_BAR / 2;
  const lo = c.levels[0];
  const hi = c.levels[c.levels.length - 1];
  for (const x of [c.x0, c.x1]) {
    for (const y of [c.y0, c.y1]) {
      Y.box('bardwellCube', x - b, y - b, lo, x + b, y + b, hi, { name: 'cage post' });
    }
  }
  for (const h of c.levels) {
    const h0 = Math.max(lo, h - b);
    const h1 = Math.min(hi, h0 + CAGE_BAR);
    for (const y of [c.y0, c.y1]) {
      Y.box('bardwellCube', c.x0 + b, y - b, h0, c.x1 - b, y + b, h1, { name: 'cage bar' });
    }
    for (const x of [c.x0, c.x1]) {
      Y.box('bardwellCube', x - b, c.y0 + b, h0, x + b, c.y1 - b, h1, { name: 'cage bar' });
    }
  }
}

/*
 * The gates. Every one is caps, tubes at any heading, solid. Where each
 * one's clear opening is, { px, py, deg, w, h0, h1 }, is OPENINGS at the
 * end of this file, for ./yard.js to make a named gap of.
 */
const FRAME_R = 0.07;

/* A frame gate: four tubes round a clear opening `w` by `hh` whose foot
 * is 2r over `h`, and two thin legs down to `base` if it stands above it. */
function frameGate(Y, g, m = 'bardwellGate') {
  const r = FRAME_R;
  const w = g.w ?? GATE_CLEAR;
  const hh = g.hh ?? GATE_CLEAR;
  const [nx, ny] = unitOf(g.deg);
  const ux = -ny;
  const uy = nx;
  const hw = w / 2 + r;
  const A = [g.px - ux * hw, g.py - uy * hw];
  const B = [g.px + ux * hw, g.py + uy * hw];
  const zb = g.h + r;
  const zt = g.h + 3 * r + hh;
  const o = { look: 'capsule', seg: 8, name: 'gate', kind: 'pole' };
  Y.cap(m, [A[0], A[1], zb], [B[0], B[1], zb], r, o);
  Y.cap(m, [A[0], A[1], zt], [B[0], B[1], zt], r, o);
  Y.cap(m, [A[0], A[1], zb], [A[0], A[1], zt], r, o);
  Y.cap(m, [B[0], B[1], zb], [B[0], B[1], zt], r, o);
  const base = g.base ?? 0;
  if (g.h - base > 0.2) {
    for (const P of [A, B]) {
      Y.post('homeShutter', P[0], P[1], base, zb, 0.035, { seg: 6, name: 'gate leg' });
    }
    if (base === 0) {
      for (const P of [A, B]) {
        Y.paint('homeShutter', P[0] - 0.2, P[1] - 0.2, 0, P[0] + 0.2, P[1] + 0.2, 0.04);
      }
    }
  }
}

/* A hoop on a post: a ring of sixteen tubes round a 2.6 m opening whose
 * middle is 1.8 m up, flown along its heading. Its gap is the square in
 * the circle. */
const HOOP = { R: 1.3, t: 0.08, h: 1.8 };
function hoopGate(Y, g) {
  const [nx, ny] = unitOf(g.deg);
  const ux = -ny;
  const uy = nx;
  const Rc = HOOP.R + HOOP.t;
  Y.torus('bardwellGate', g.px, g.py, HOOP.h, Rc, HOOP.t, nx, ny);
  const pts = [];
  for (let k = 0; k < 16; k += 1) {
    sincos((k * 22.5) * DEG, SC);
    pts.push([g.px + ux * Rc * SC.c, g.py + uy * Rc * SC.c, HOOP.h + Rc * SC.s]);
  }
  for (let k = 0; k < 16; k += 1) {
    Y.cap('bardwellGate', pts[k], pts[(k + 1) % 16], HOOP.t, { draw: false, name: 'hoop', kind: 'pole' });
  }
  Y.post('homeShutter', g.px, g.py, 0, HOOP.h - Rc, 0.05, { seg: 6, name: 'hoop post' });
  Y.paint('homeShutter', g.px - 0.45, g.py - 0.45, 0, g.px + 0.45, g.py + 0.45, 0.05);
}

const RAISED = { w: 2.7, rp: 0.16, top: 2.95, rt: 0.22, sill: 0.85, rs: 0.14 };
const ARCH = { w: 3.2, rp: 0.3, top: 2.75, rt: 0.32 };
const FLAG = { off: 2.3, w: 2.6, top: 3.2 };

/* The raised gate, as the screenshot shows it by the pen: two black
 * posts, a yellow beam over them and a yellow sill across at the knee,
 * yellow bands on the posts. And the arch: fat yellow posts and a black
 * beam over them, from the ground. */
function raisedGate(Y, g) {
  const [nx, ny] = unitOf(g.deg);
  const ux = -ny;
  const uy = nx;
  const { rp, top, sill } = RAISED;
  const hw = RAISED.w / 2 + rp;
  const A = [g.px - ux * hw, g.py - uy * hw];
  const B = [g.px + ux * hw, g.py + uy * hw];
  for (const P of [A, B]) {
    Y.post('homeShutter', P[0], P[1], 0, top, rp, { seg: 8, name: 'gate post' });
    for (const h of [1.55, 2.15]) {
      Y.post('bardwellYellow', P[0], P[1], h, h + 0.14, rp + 0.015, { seg: 8, solid: false });
    }
  }
  Y.cap('bardwellYellow', [A[0], A[1], top], [B[0], B[1], top], RAISED.rt, { look: 'capsule', seg: 10, name: 'gate beam' });
  Y.cap('bardwellYellow', [A[0], A[1], sill], [B[0], B[1], sill], RAISED.rs, { look: 'capsule', seg: 8, name: 'gate sill' });
}

function archGate(Y, g) {
  const [nx, ny] = unitOf(g.deg);
  const ux = -ny;
  const uy = nx;
  const { rp, top, rt } = ARCH;
  const hw = ARCH.w / 2 + rp;
  const A = [g.px - ux * hw, g.py - uy * hw];
  const B = [g.px + ux * hw, g.py + uy * hw];
  for (const P of [A, B]) {
    Y.post('bardwellYellow', P[0], P[1], 0, top, rp, { look: 'capsule', seg: 10, name: 'arch' });
  }
  Y.cap('homeShutter', [A[0], A[1], top], [B[0], B[1], top], rt, { look: 'capsule', seg: 10, name: 'arch' });
}

/* A flag on the line: a pole and its tall pink cloth out to the outside
 * of the turn; the gap is the space beside it on the inside, 2.6 m wide,
 * from a metre off the pole. */
function flagGate(Y, g) {
  const [nx, ny] = unitOf(g.deg);
  const lx = -ny;
  const ly = nx;
  Y.post('homeShutter', g.px, g.py, 0, 3.7, 0.035, { seg: 6, name: 'flag pole' });
  Y.obox('bardwellGate', g.px, g.py, -lx, -ly, 0.05, 0.65, -0.012, 0.012, 1.0, 3.55);
  Y.obox('homeTrim', g.px, g.py, -lx, -ly, 0.6, 0.68, -0.014, 0.014, 1.0, 3.55);
  const c = [g.px - lx * 0.35, g.py - ly * 0.35];
  Y.cap('bardwellGate', [c[0], c[1], 1.3], [c[0], c[1], 3.25], 0.33, { draw: false, name: 'flag', kind: 'obstacle' });
}

function gates(Y) {
  for (const g of GATES) {
    if (g.kind === 'hoop') {
      hoopGate(Y, g);
    } else if (g.kind === 'raised') {
      raisedGate(Y, g);
    } else if (g.kind === 'arch') {
      archGate(Y, g);
    } else if (g.kind === 'flag') {
      flagGate(Y, g);
    } else {
      frameGate(Y, g);
    }
  }
  /* The A frame over the start: the ridge tube, a foot tube each side, a
   * rafter tube each side at every bay, on six black legs. */
  const f = AFRAME;
  const o = { look: 'capsule', seg: 8, name: 'a frame', kind: 'pole' };
  Y.cap('bardwellGate', [f.x0, f.y, f.ridge], [f.x1, f.y, f.ridge], 0.08, o);
  for (const side of [-1, 1]) {
    const y = f.y + side * f.half;
    Y.cap('bardwellGate', [f.x0, y, f.foot], [f.x1, y, f.foot], 0.08, o);
    for (const x of f.bays) {
      Y.cap('bardwellGate', [x, f.y, f.ridge], [x, y, f.foot], 0.08, o);
    }
    for (const x of [f.x0, (f.x0 + f.x1) / 2, f.x1]) {
      Y.post('homeShutter', x, y, 0, f.foot, 0.06, { seg: 6, name: 'a frame leg' });
    }
  }
  for (const c of CAGES) {
    cage(Y, c);
  }
}

/* ------------------------------------------------------------------ */
/* The stand, the lean-to, the doghouse                               */
/* ------------------------------------------------------------------ */

function stand(Y) {
  const s = STAND;
  for (const x of [s.x0, s.x1]) {
    for (const y of [s.y0, s.y1]) {
      Y.box('bardwellTimber', x - 0.08, y - 0.08, 0, x + 0.08, y + 0.08, s.top, { name: 'stand post' });
    }
  }
  /* Its deck of planks, and the rails round the top on three sides with a
   * board along the north. */
  Y.box('bardwellPlank', s.x0 - 0.08, s.y0 - 0.08, s.deck - 0.1, s.x1 + 0.08, s.y1 + 0.08, s.deck, { name: 'stand deck' });
  for (let x = s.x0 + 0.3; x < s.x1; x += 0.3) {
    Y.paint('bardwellTimber', x - 0.01, s.y0 - 0.08, s.deck, x + 0.01, s.y1 + 0.08, s.deck + 0.003);
  }
  for (const h of [3.4, s.top - 0.12]) {
    Y.box('bardwellTimber', s.x0 + 0.08, s.y0 - 0.05, h, s.x1 - 0.08, s.y0 + 0.05, h + 0.12, { name: 'stand rail' });
    Y.box('bardwellTimber', s.x0 - 0.05, s.y0 + 0.08, h, s.x0 + 0.05, s.y1 - 0.08, h + 0.12, { name: 'stand rail' });
    Y.box('bardwellTimber', s.x1 - 0.05, s.y0 + 0.08, h, s.x1 + 0.05, s.y1 - 0.08, h + 0.12, { name: 'stand rail' });
  }
  Y.box('bardwellPlank', s.x0 + 0.08, s.y1 - 0.04, 3.55, s.x1 - 0.08, s.y1 + 0.04, s.top, { name: 'stand board' });
  /* X braces down its east and west sides below the deck, so it is flown
   * through north and south. */
  for (const x of [s.x0, s.x1]) {
    Y.cap('bardwellTimber', [x, s.y0, 0.2], [x, s.y1, s.deck - 0.15], 0.05, { seg: 4, name: 'brace' });
    Y.cap('bardwellTimber', [x, s.y1, 0.2], [x, s.y0, s.deck - 0.15], 0.05, { seg: 4, name: 'brace' });
  }
}

function leanTo(Y) {
  const l = LEANTO;
  for (const x of [l.x0 + 0.1, l.x1 - 0.1]) {
    Y.box('bardwellTimber', x - 0.07, l.y0 + 0.03, 0, x + 0.07, l.y0 + 0.17, l.low - 0.04, { name: 'lean-to post' });
    Y.box('bardwellTimber', x - 0.07, l.y1 - 0.17, 0, x + 0.07, l.y1 - 0.03, l.high - 0.04, { name: 'lean-to post' });
  }
  /* A plank back on the north side, and its tin roof sloping south. */
  Y.box('bardwellPlank', l.x0 + 0.03, l.y1 - 0.1, 0, l.x1 - 0.03, l.y1 - 0.03, l.high - 0.1, { name: 'lean-to back' });
  shedRoof(Y, 'bardwellTin', 'y', l.y0 - 0.1, l.low + 0.06, l.y1 + 0.05, l.high + 0.06, l.x0 - 0.1, l.x1 + 0.1, 0.06);
  for (let x = l.x0; x <= l.x1 + 1e-6; x += 0.35) {
    Y.prism('homeCoping', 'y', [[x - 0.015, l.low + 0.06], [x - 0.015, l.low + 0.085], [x + 0.015, l.low + 0.085], [x + 0.015, l.low + 0.06]], l.y0 - 0.1, l.y0);
  }
  /* A barrow left beside it. */
  Y.box('bardwellYellow', 26.9, -21.6, 0.35, 27.6, -20.6, 0.7, { name: 'barrow', kind: 'obstacle' });
  Y.cap('homeShutter', [27.25, -21.8, 0.2], [27.25, -21.8, 0.2], 0.18, { look: 'capsule', name: 'barrow wheel', kind: 'obstacle' });
}

function doghouse(Y) {
  const d = DOGHOUSE;
  Y.box('bardwellFirewood', d.x0, d.y0, 0, d.x1, d.y1, d.eave, { name: 'doghouse', kind: 'obstacle' });
  onFace(Y, 'homeShutter', d, 'w', -19.0, -18.6, 0.05, 0.6);
  gableRoof(Y, 'y', d.x0, d.x1, d.y0, d.y1, d.eave, {
    pitch: 0.8, over: 0.2, roof: 'bardwellPlank', gable: 'bardwellFirewood', fascia: 'bardwellTimber',
  });
}

/*
 * Banner stands about the course, square to the plan: two black posts and
 * a white board between, a sponsor's banner on each face (./logos.js).
 * Each { px, py, dir, w }: the board's middle, the axis it runs along, how
 * wide.
 */
export const STANDS = [
  { px: 22.5, py: 31.5, dir: 'x', w: 3.0 },
  { px: 52.0, py: 30.5, dir: 'x', w: 3.0 },
  { px: 52.0, py: 19.0, dir: 'x', w: 3.0 },
  { px: 68.0, py: -10.0, dir: 'y', w: 3.0 },
  { px: 54.0, py: -38.0, dir: 'y', w: 3.0 },
  { px: 30.0, py: 47.5, dir: 'x', w: 3.0 },
  { px: -24.0, py: 18.0, dir: 'y', w: 3.0 },
  { px: -10.0, py: -68.0, dir: 'x', w: 3.0 },
  { px: 13.0, py: -26.0, dir: 'y', w: 3.0 },
  { px: 70.0, py: -60.0, dir: 'y', w: 3.0 },
];
export const STAND_BOARD = { h0: 0.55, h1: 1.75, t: 0.05 };

function stands(Y) {
  const b = STAND_BOARD;
  for (const s of STANDS) {
    const ends = s.dir === 'x' ? [[s.px - s.w / 2 - 0.05, s.py], [s.px + s.w / 2 + 0.05, s.py]]
      : [[s.px, s.py - s.w / 2 - 0.05], [s.px, s.py + s.w / 2 + 0.05]];
    for (const [x, y] of ends) {
      Y.post('homeShutter', x, y, 0, b.h1 + 0.1, 0.04, { seg: 6, name: 'stand post' });
    }
    if (s.dir === 'x') {
      Y.box('homeTrim', s.px - s.w / 2, s.py - b.t / 2, b.h0, s.px + s.w / 2, s.py + b.t / 2, b.h1, { name: 'banner' });
    } else {
      Y.box('homeTrim', s.px - b.t / 2, s.py - s.w / 2, b.h0, s.px + b.t / 2, s.py + s.w / 2, b.h1, { name: 'banner' });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Trees, bushes and cars                                             */
/* ------------------------------------------------------------------ */

/* [px, py, scale] each, every one the layout has in the plot: its tall
 * pines, the loblolly (src/props/street.js, a long bare stem under a crown
 * in its top two fifths, as the screenshots have them) at 2.15, about
 * twenty three metres, times the scale; its broadleaves, the loblolly's
 * broad build at 2.1, about sixteen; its bushes, a ball 0.7 m round times
 * the scale. */
export const PINES = [
  [-13.3, 61.2, 1], [47.7, 61.2, 1], [39.3, 59.3, 1], [-40.1, 59.2, 1], [20.9, 59.2, 1], [-47.4, 58.2, 1],
  [-30.0, 57.7, 1], [13.6, 57.2, 1], [91.2, 56.2, 1], [31.0, 55.7, 1], [-0.6, 55.3, 1], [57.6, 54.6, 1],
  [64.4, 54.2, 1], [-23.4, 53.3, 1], [49.4, 53.3, 1], [74.5, 52.7, 1], [109.0, 52.4, 1], [13.3, 51.4, 1],
  [97.7, 50.6, 1], [6.0, 50.3, 1], [36.0, 49.5, 1], [2.8, 49.0, 1], [16.1, 48.8, 1], [70.0, 48.1, 1],
  [-41.9, 47.4, 1], [90.1, 46.8, 1], [-11.8, 45.9, 1], [69.8, 45.6, 1], [64.8, 44.2, 1], [-2.5, 43.4, 1],
  [-6.7, 40.4, 1], [-0.1, 39.1, 1], [-40.0, 37.4, 1], [-3.2, 35.0, 1], [-1.1, 33.1, 1], [-21.4, 30.2, 1],
  [-43.6, 26.9, 1], [-1.6, 27.6, 1], [-43.0, 22.1, 1], [-43.8, 16.0, 1], [-39.6, 13.1, 1], [-49.0, 11.5, 1],
  [35.8, 13.9, 1], [38.6, 14.4, 1], [43.5, 31.3, 1], [-25.0, 36.6, 1], [15.3, 34.7, 1], [24.7, 30.9, 1],
  [93.7, 23.7, 1], [96.3, 17.5, 1], [-45.4, 4.8, 1], [32.1, 6.5, 1], [26.4, 3.3, 1], [-50.0, -4.9, 1],
  [31.9, -1.0, 1], [-7.8, -5.3, 1], [94.6, -2.3, 1], [-13.0, -10.6, 1], [96.6, -8.5, 1], [29.7, -12.0, 1],
  [-18.2, -17.4, 1], [99.2, -13.5, 1], [34.5, -16.6, 1], [38.5, -24.1, 1], [-14.8, -20.8, 1], [27.9, -24.4, 1],
  [93.6, -26.7, 1], [15.1, -28.4, 1], [-44.7, -30.6, 1], [92.4, -29.7, 1], [30.8, -30.0, 1], [35.0, -29.6, 1],
  [-19.6, -29.6, 1], [15.4, -28.3, 1], [-15.0, -33.1, 1], [-36.6, -36.6, 1], [92.0, -39.4, 1], [-15.3, -40.6, 1],
  [-11.1, -45.9, 1], [-35.0, -45.0, 1], [-9.5, -48.0, 1], [-47.3, -49.2, 1], [-32.6, -51.4, 1], [-44.8, -53.6, 1],
  [-36.1, -59.4, 1], [-28.7, -60.6, 1], [86.9, -61.1, 1], [-46.1, -68.4, 1], [-35.0, -68.5, 1], [-46.7, -72.7, 1],
  [-21.1, -74.7, 1], [-44.4, -75.6, 1], [-45.6, -80.0, 1], [-11.4, -77.9, 1], [-28.7, -85.6, 1], [5.6, -91.9, 1],
  [24.7, -91.3, 1], [-36.6, -86.7, 1], [86.5, -79.3, 1], [-44.6, -89.4, 1], [12.2, -92.3, 1], [43.2, -91.5, 1],
  [-41.0, -77.4, 1], [-15.2, -79.8, 1], [-38.8, -84.6, 1], [-24.3, -93.6, 1], [-34.2, -94.7, 1], [9.4, -97.5, 1],
  [2.6, -95.6, 1],
];
export const BROADLEAVES = [
  [2.3, 60.7, 1], [99.1, 60.2, 1], [-14.9, 59.7, 1], [46.1, 59.7, 1], [-23.8, 57.0, 1], [37.2, 57.0, 1],
  [45.8, 55.7, 1], [89.6, 54.7, 1], [80.7, 52.0, 1], [-31.2, 50.9, 1], [-40.4, 49.2, 1], [47.6, 47.6, 1],
  [85.1, 46.7, 1], [-36.1, 46.6, 1], [24.9, 46.6, 1], [44.0, 46.3, 1], [19.5, 45.5, 1], [-30.5, 45.0, 1],
  [82.2, 44.6, 1], [85.5, 43.4, 1], [10.2, 41.8, 1], [68.4, 41.6, 1], [-1.0, 40.7, 1], [95.1, 40.6, 1],
  [7.3, 37.5, 1], [17.8, 37.1, 1], [-14.4, 36.4, 1], [94.5, 36.0, 1], [-7.4, 35.8, 1], [99.4, 34.9, 1],
  [95.0, 32.5, 1], [-24.8, 31.4, 1], [-21.5, 31.0, 1], [43.0, 29.5, 1], [94.4, 28.5, 1], [-19.0, 28.0, 1],
  [24.5, 27.5, 0.75], [99.3, 26.0, 1], [93.4, 23.3, 1], [52.2, 17.8, 0.75], [54.5, 17.5, 1], [96.4, 17.4, 1],
  [94.1, 17.3, 1], [56.5, 17.0, 1], [99.4, 12.9, 1], [95.0, 10.5, 1], [34.4, 6.7, 1], [94.4, 6.5, 1],
  [-15.5, 6.0, 1], [-13.0, 6.0, 1], [96.3, 4.2, 1], [93.4, 1.3, 1], [30.9, 0.0, 1], [91.8, -3.1, 1],
  [2.2, -6.2, 0.82], [92.0, -10.9, 1], [94.9, -11.7, 1], [-22.5, -15.5, 1], [-21.5, -16.0, 1], [99.4, -16.1, 1],
  [91.5, -16.7, 1], [-21.0, -17.5, 1], [96.3, -17.8, 1], [95.0, -18.5, 1], [94.4, -22.5, 1], [-21.5, -23.0, 1],
  [39.0, -25.0, 1], [91.7, -25.7, 1], [93.4, -27.7, 1], [92.5, -29.9, 1], [38.3, -31.2, 1], [38.5, -32.2, 1],
  [93.0, -32.4, 1], [-15.5, -34.5, 1], [92.2, -35.3, 1], [-14.0, -36.0, 1], [33.9, -36.0, 1], [-12.0, -37.5, 1],
  [15.3, -37.6, 1], [99.4, -38.6, 1], [95.0, -41.0, 1], [-13.0, -42.0, 1], [100.5, -42.4, 1], [94.4, -45.0, 1],
  [89.8, -45.2, 1], [-6.5, -45.5, 1], [96.3, -46.8, 1], [93.4, -50.2, 1], [89.8, -53.5, 1], [90.8, -58.4, 1],
  [38.6, -59.4, 1.68], [39.0, -61.5, 1], [88.3, -62.7, 1], [39.0, -63.5, 1], [-37.5, -64.5, 1], [87.6, -69.0, 1],
  [96.3, -69.3, 1], [91.7, -73.1, 1], [-37.4, -77.0, 1], [-46.5, -78.2, 1], [-33.1, -78.4, 1], [-27.9, -78.4, 1],
  [-32.0, -78.5, 1], [-28.0, -78.9, 1], [-25.3, -79.0, 1], [-24.8, -83.2, 1], [-27.0, -84.5, 1], [-29.0, -84.8, 1],
  [-30.1, -86.2, 1], [-33.7, -86.9, 1], [-33.9, -89.4, 1], [15.1, -90.0, 1], [12.4, -90.4, 1], [10.0, -91.2, 1],
  [12.7, -94.3, 1],
];
export const BUSHES = [
  [-38.1, 58.0, 1], [-38.0, 47.5, 1], [9.8, 37.3, 1], [-20.8, 32.0, 1], [58.2, 29.6, 0.5], [101.5, 29.2, 1],
  [95.8, 23.0, 1], [40.0, 22.0, 1], [-13.5, 20.0, 1], [-12.5, 20.0, 1], [-11.5, 20.0, 1], [-14.5, 19.5, 1],
  [-15.5, 19.0, 1], [-16.5, 18.5, 1], [4.2, 18.2, 1], [4.2, 17.2, 1], [4.2, 16.2, 1], [6.0, 14.0, 1],
  [6.0, 13.0, 1], [5.9, 12.1, 1], [6.0, 11.0, 1], [5.8, 10.0, 1], [5.8, 8.8, 1], [5.6, 7.7, 1],
  [5.6, 6.5, 1], [-9.3, 5.9, 1], [-7.4, 5.9, 1], [-3.2, 5.9, 1], [5.5, 5.9, 1], [-4.0, 5.8, 1],
  [-5.6, 5.7, 1], [-5.0, 5.7, 1], [-8.6, 5.6, 1], [-7.3, 5.6, 1], [33.5, -3.0, 1], [-23.5, -14.5, 1],
  [41.0, -15.5, 1], [39.5, -16.5, 1], [40.5, -17.0, 1], [-19.5, -27.0, 1], [-19.5, -29.0, 1], [34.5, -32.5, 1],
  [-11.5, -41.5, 1], [-7.0, -49.0, 1], [-39.6, -73.8, 1], [-38.6, -73.9, 1], [-32.6, -74.4, 1], [-44.7, -75.4, 1],
  [-42.3, -76.6, 1], [-35.5, -78.2, 1], [-31.0, -78.8, 1], [-30.5, -79.1, 1], [-24.5, -79.2, 1], [-38.4, -79.3, 1],
  [-37.6, -80.0, 1], [-35.2, -81.2, 1], [-40.8, -82.5, 1], [-40.4, -82.8, 1], [-35.0, -84.8, 1], [-43.1, -85.6, 1],
  [-36.7, -86.6, 1], [-40.3, -87.3, 1], [-31.3, -88.1, 1], [-37.9, -89.0, 1], [8.5, -89.0, 1], [-38.9, -89.4, 1],
];

/*
 * Where no tree stands though the layout has one there: on the house, its
 * pad, porch, walks and woodshed, the drive, a gate's line or a stand,
 * because those are drawn a little bigger or a little elsewhere than the
 * layout's own and a trunk through a roof is wrong whoever is right. Each
 * a plan rectangle; and a tree is kept off the drive's middle by 3.5 m and
 * off a gate's opening by 4 m.
 */
const CLEAR = [
  [-15, 3, 7.5, 21], [-8.5, 20.5, 1.5, 27.5], [16, -8, 29, 18], [27, -24, 37, -12.5], [-6, -3.5, 13, 3.5],
  [73.5, 19, 81, 26.5], [75.5, -29.5, 82.5, -26.5], [74, -50.5, 81, -47.5], [58.5, -70, 66, -67],
  [25, 22, 42, 29],
];
function treeClear(px, py) {
  for (const [x0, y0, x1, y1] of CLEAR) {
    if (px > x0 && px < x1 && py > y0 && py < y1) {
      return false;
    }
  }
  for (let i = 0; i + 1 < DRIVE.length; i += 1) {
    if (segDist(px, py, DRIVE[i], DRIVE[i + 1]) < 3.5) {
      return false;
    }
  }
  for (const g of GATES) {
    const dx = px - g.px;
    const dy = py - g.py;
    if (dx * dx + dy * dy < 16) {
      return false;
    }
  }
  for (const s of STANDS) {
    const dx = px - s.px;
    const dy = py - s.py;
    if (dx * dx + dy * dy < 9) {
      return false;
    }
  }
  return true;
}

function segDist(px, py, p, q) {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const L = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - p[0]) * dx + (py - p[1]) * dy) / L));
  const ex = px - (p[0] + dx * t);
  const ey = py - (p[1] + dy * t);
  return Math.sqrt(ex * ex + ey * ey);
}

/*
 * The trees filed in a three by three grid of chunks over the plot rather
 * than one, so each is its own batch and three.js leaves out the ones a
 * view or the shadow's box does not reach. In one chunk every tree was
 * drawn from every view: two hundred trees are most of the map's
 * triangles, and the built map's own cull keeps the whole plot on.
 */
const treeChunk = (px, py) => {
  const i = Math.min(2, Math.floor((3 * (px - PX0)) / (PX1 - PX0)));
  const k = Math.min(2, Math.floor((3 * (py - PY0)) / (PY1 - PY0)));
  return `extra:trees:${i},${k}`;
};

/* How much of a tree is drawn (dims.detail, ../../props/street.js): every
 * whorl within 40 m of the house or the start, fewer past that, fewest
 * past 90 m. The outline is the same; the triangles are not. */
function detailAt(px, py) {
  const d2 = Math.min((px + 2) * (px + 2) + (py - 15) * (py - 15), (px - SPAWN.px) * (px - SPAWN.px) + (py - SPAWN.py) * (py - SPAWN.py));
  return d2 > 90 * 90 ? 0 : d2 > 40 * 40 ? 0.4 : 1;
}

function trees(Y) {
  let i = 0;
  for (const [px, py, k] of PINES) {
    i += 1;
    if (treeClear(px, py)) {
      const el = { id: `bardwell-pine-${i}`, type: 'tree', style: 'loblolly', dims: { size: 2.15 * k, variant: 11 + i, detail: detailAt(px, py) } };
      Y.asset(el, 1, px, py, 0, 0, treeChunk(px, py));
    }
  }
  i = 0;
  for (const [px, py, k] of BROADLEAVES) {
    i += 1;
    if (treeClear(px, py)) {
      const el = { id: `bardwell-oak-${i}`, type: 'tree', style: 'broad', dims: { size: Math.min(3, 2.1 * k), variant: 7 + i, detail: detailAt(px, py) } };
      Y.asset(el, 1, px, py, 0, 0, treeChunk(px, py));
    }
  }
  for (const [px, py, k] of BUSHES) {
    const r = 0.7 * k;
    Y.ball('bardwellBush', px, py, 0.85 * r, r, { name: 'bush' });
  }
}

/* The white car on its pad facing the house, the white van and the white
 * car on the drive: the variants that come out white (carColourOf in
 * src/props/street.js). */
function cars(Y) {
  const list = [
    ['bardwell-car-1', 'keivan', 22.3, 13.5, 0, 7],
    ['bardwell-car-2', 'hatch', 24.9, -2.8, 90, 9],
    ['bardwell-car-3', 'sedan', -11.6, 14.8, 0, 4],
  ];
  for (const [id, style, px, py, deg, variant] of list) {
    Y.asset({ id, type: 'car', style, dims: { variant } }, 1, px, py, 0, deg * DEG, 'extra:cars');
  }
}

/* ------------------------------------------------------------------ */
/* The whole                                                           */
/* ------------------------------------------------------------------ */

/* The scaled assets' parts in the world frame, solid and never drawn
 * (../heads/heads.js scaledParts). */
const SCQ = { s: 0, c: 1 };
function scaledParts(a) {
  const k = a.k;
  const [x, y, z] = worldAt(a.px, a.py, a.h);
  const parts = a.el.style === 'loblolly' || a.el.style === 'broad' ? loblollyLayout(a.el) : partsOf(a.el);
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
 * The house, the yard, the field and the road: { parts, prisms, discs,
 * cyls, oboxes, tori, scaled, roofs }, every part in the world frame. The
 * same every call.
 */
export function bardwellLayout() {
  const Y = new Yard();
  house(Y);
  chimney(Y);
  porch(Y);
  yardGround(Y);
  woodshed(Y);
  fenceRun(Y, PEN);
  for (const run of FENCES) {
    fenceRun(Y, run);
  }
  ground(Y);
  gates(Y);
  stand(Y);
  leanTo(Y);
  doghouse(Y);
  stands(Y);
  trees(Y);
  cars(Y);
  const parts = Y.P.list.slice();
  for (const a of Y.scaled) {
    parts.push(...scaledParts(a));
  }
  return {
    parts, prisms: Y.prisms, discs: Y.discs, cyls: Y.cyls, oboxes: Y.oboxes, tori: Y.tori, scaled: Y.scaled, roofs: Y.roofs,
  };
}

/* The structures' own gaps, which ./yard.js names beside the race's: in
 * at the porch's west end over its railing, through the woodshed's open
 * west bay, under the lean-to and under the stand's deck. */
export const PLACES = {
  porch: { px: PORCH.x0, py: (COL_Y + 0.25 + PORCH.y1) / 2, deg: 0, w: PORCH.y1 - COL_Y - 0.25, h0: RAIL_TOP, h1: 3.62, points: 250 },
  woodshed: {
    px: (SHED_POSTS_X[0] + SHED_POSTS_X[1]) / 2, py: WOODSHED.y0 + 0.2, deg: 90,
    w: SHED_POSTS_X[1] - SHED_POSTS_X[0] - 0.2, h0: 0.1, h1: WOODSHED.eave - 0.2, points: 250,
  },
  leanto: { px: (LEANTO.x0 + LEANTO.x1) / 2, py: LEANTO.y0 + 0.1, deg: 90, w: LEANTO.x1 - LEANTO.x0 - 0.34, h0: 0, h1: LEANTO.low - 0.12, points: 250 },
  stand: { px: (STAND.x0 + STAND.x1) / 2, py: STAND.y0, deg: 90, w: STAND.x1 - STAND.x0 - 0.16, h0: 0, h1: STAND.deck - 0.1, points: 250 },
};

/* Where the pilot starts: the layout's own start, on the lawn north of the
 * house, facing east down the line through the A frame. */
export const SPAWN = { px: 8.5, py: 25.5, h: 0 };

/* Each race gate's clear opening, { px, py, deg, w, h0, h1, points }: the
 * middle of its foot in the plan, the heading it is flown along, its clear
 * width and the bottom and top of its clear height, as the builders above
 * draw it. A hoop's is the square in its circle; a flag's is the space
 * beside it on the inside of the turn. */
function openingOf(g) {
  const at = { px: g.px, py: g.py, deg: g.deg, points: g.points };
  if (g.kind === 'hoop') {
    const half = HOOP.R * 0.7071;
    return { ...at, w: 2 * half, h0: HOOP.h - half, h1: HOOP.h + half };
  }
  if (g.kind === 'raised') {
    return { ...at, w: RAISED.w, h0: RAISED.sill + RAISED.rs, h1: RAISED.top - RAISED.rt };
  }
  if (g.kind === 'arch') {
    return { ...at, w: ARCH.w, h0: 0, h1: ARCH.top - ARCH.rt };
  }
  if (g.kind === 'flag') {
    const [nx, ny] = unitOf(g.deg);
    return { ...at, px: g.px - ny * FLAG.off, py: g.py + nx * FLAG.off, w: FLAG.w, h0: 0, h1: FLAG.top };
  }
  const hh = g.hh ?? GATE_CLEAR;
  return { ...at, w: g.w ?? GATE_CLEAR, h0: g.h + 2 * FRAME_R, h1: g.h + 2 * FRAME_R + hh };
}
export const OPENINGS = Object.fromEntries(GATES.map((g) => [g.name, openingOf(g)]));
