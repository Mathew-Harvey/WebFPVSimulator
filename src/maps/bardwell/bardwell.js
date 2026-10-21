/*
 * bardwell.js: Joshua Bardwell's house and yard, the outside of it, as the
 * parts a built map holds. Pure data and arithmetic, no Three.js, no JS
 * trigonometry, so the solids can be built and checked in plain Node, the
 * way ../heads/heads.js is.
 *
 * WHERE IT COMES FROM. Fourteen stills the owner cut from Joshua's FPV
 * videos on 2026-10-21, and nothing else: no address, no map, no satellite
 * picture. What they show: a log house, dark stained logs with pale
 * chinking under a steep green shingle roof with dormers, a covered porch
 * across its front on log posts with a plank deck and a railing; behind it
 * a courtyard of brick pavers between the house and a long brick wall,
 * with a hardtop gazebo, grills under covers along the wall, a white glass
 * table, bins, a cabinet; a weathered board barn with a rusty red metal
 * roof and an open bay on posts, a small white camper beside it, a
 * firewood pile; a gravel drive up a long field behind a three board
 * fence to a loop round a big evergreen in front of the house; in the
 * field a long building with an orange metal roof and a deck down one
 * side, a small shed with a blue roof, a brush pile, a solar light by the
 * drive; small white sheds along a fence by the woods; tall pines
 * everywhere; a road at the bottom and hills all round.
 *
 * WHAT IS INFERRED. How those pieces sit against each other is read off
 * two overhead stills and the angles in the rest, so the plan is a
 * plausible arrangement and not a survey: the house at the top of the
 * field facing down it, the loop in front, the courtyard behind, the barn
 * to the east, the long building down the field by the drive. The ground
 * is level, where the stills have a slope: the built map's ground is a
 * plane, and a hillside would be a change to the plant, which is the
 * owner's to approve. People are left out, as on Heads' house.
 *
 * THE SCALE is life size (S = 1): a five inch map, flown outside only,
 * the owner's ask of 2026-10-21, "no need to blow it up to make it feel
 * like a whoop map". Every building is solid; windows and doors are paint.
 *
 * THE PLAN'S FRAME, as Heads' house's: px east, py north, h up, metres,
 * the origin at the house's south west corner on the ground. The house
 * faces south, down the field to the road.
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

/* The plot in plan metres: the yard, the field, the woods either side
 * and the road. */
const PX0 = -50;
const PX1 = 82;
const PY0 = -122;
const PY1 = 46;
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

/* ------------------------------------------------------------------ */
/* The numbers, metres                                                 */
/* ------------------------------------------------------------------ */

/* THE HOUSE: logs on a stone footing, the floor a porch step up, a steep
 * gable along its length, two dormers to the front and one to the back. */
export const HOUSE = { x0: 0, x1: 16, y0: 0, y1: 10 };
const FLOOR = 0.6;
const EAVE = 3.4;
const HOUSE_PITCH = 10 / 12;
const HOUSE_OVER = 0.45;
const ROOF_T = 0.2;
/* A roof's solid is stacked in bands this high under its drawn slopes. */
const BAND = 0.05;
const GABLE_T = 0.2;

/* The porch across the front: its deck, log posts on a log beam, a shed
 * roof under the main eave, a railing broken for the steps. */
const PORCH = { x0: 0, x1: 16, y0: -2.95, y1: 0 };
const PORCH_POSTS = [0.25, 3.3, 6.4, 9.6, 12.7, 15.75];
const POST_Y = -2.78;
const POST_R = 0.13;
const BEAM = { y0: -2.92, y1: -2.64, h0: 2.75, h1: 2.95 };
const STEPS = { x0: 7, x1: 9 };
const RAIL_H = 0.9;

/* THE COURTYARD behind the house, the brick wall along its far side. */
export const COURT = { x0: -3, x1: 17.3, y0: 10, y1: 19 };
const WALL = { y0: 19, y1: 19.35, h: 2.6 };

/* THE GAZEBO: a twelve foot hardtop on four posts, its roof in two tiers. */
export const GAZEBO = { x: 8, y: 14.5, half: 1.7, post: 0.07, eave: 2.48, beam: 2.3, over: 0.5 };
const TABLE_TOP = 0.8;

/* THE BARN east of the house, a gable along its length, and the open bay
 * along its west side under a shed roof on posts. */
export const BARN = { x0: 26, x1: 34, y0: 6, y1: 18 };
const BARN_EAVE = 4.0;
const BARN_PITCH = 6 / 12;
const LEAN = { x: 22.15, x0: 21.8, y0: 6, y1: 18, top0: 2.85, top1: 3.8, beam: 2.6 };
const LEAN_POSTS = [6.15, 10.0, 14.0, 17.85];
const LEAN_POST = 0.075;

/* THE CAMPER, a little white egg on two wheels, nose to the east. */
const CAMPER = { x0: 18.5, x1: 21.3, y: 21.6, h: 1.45, r: 0.97 };

/* THE LONG BUILDING down the field by the drive, and its deck. */
export const LONG = { x0: 6.5, x1: 11.5, y0: -70, y1: -54 };
const LONG_EAVE = 2.7;
const LONG_PITCH = 4 / 12;
const DECK = { x0: 11.5, x1: 14.5, y0: -68, y1: -56, h: 0.45 };

/* The blue shed in the field, the white coops by the east fence. */
const BLUE = { x0: 28.5, x1: 31.5, y0: -76, y1: -73 };
const COOPS = [1, 5, 9];

/* THE DRIVE up the field's west side to the loop round the evergreen. */
const LOOP = { x: 10, y: -17, r0: 6.4, r1: 10 };
const DRIVE = { x0: -0.6, x1: 3.0 };

/* THE FIELD and its fence: three boards on posts, a gate in its north
 * side. The property's east line runs north from the field by the woods. */
export const FIELD = { x0: 4.2, x1: 70, y0: -104, y1: -28 };
const GATE = { x0: 20.2, x1: 23.8 };
const FENCE_H = 1.4;
const EAST_LINE = 46.5;

/* THE ROAD along the bottom. */
const ROAD = { y0: -115, y1: -109 };

/* Paint on the ground, each a little over the last. */
const G_GRASS = 0.012;
const G_ASPHALT = 0.025;
const G_PAVE = 0.03;
const G_GRAVEL = 0.031;
const G_LOOP = 0.034;
const G_LINE = 0.038;

/* ------------------------------------------------------------------ */
/* The builder                                                         */
/* ------------------------------------------------------------------ */

/*
 * Everything is added in plan terms and lands in one Parts list in the
 * world frame, plus what the parts cannot say: roof slopes and gables
 * (prisms), the loop (rings), round tops (discs), drawn cylinders, the
 * gazebo's tiers (pyramids), and the town's own pines and cars (scaled).
 * Those are the draw()'s, in ./index.js.
 */
class Yard {
  constructor() {
    this.P = new Parts();
    this.prisms = [];
    this.rings = [];
    this.discs = [];
    this.cyls = [];
    this.pyramids = [];
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

  ring(m, px, py, r0, r1, h) {
    this.rings.push({ m, px, py, r0, r1, h });
  }

  /* A round top, drawn only, from h0 to h1. */
  disc(m, px, py, r, h0, h1) {
    this.discs.push({ m, px, py, r, h0, h1 });
  }

  cyl(m, a, b, r, seg = 8) {
    this.cyls.push({ m, a: worldAt(a[0], a[1], a[2]), b: worldAt(b[0], b[1], b[2]), r: S * r, seg });
  }

  /* A square pyramid on its base, sides along the axes. */
  pyramid(m, px, py, h, half, height) {
    this.pyramids.push({ m, base: worldAt(px, py, h), half: S * half, h: S * height });
  }

  asset(el, k, px, py, h, yaw, chunk = 'extra') {
    this.scaled.push({ el, k, px, py, h, yaw, chunk });
  }
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
  return { ridge, mid, top };
}

/*
 * A sloping slab, a shed roof: its top from (a0, t0) to (a1, t1) across,
 * along `axis` from e0 to e1, thickness ROOF_T, drawn as a prism and made
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

/* A window: dark glass in a white frame with a white bar down it. */
function windowOn(Y, r, f, a0, a1, h0, h1, frame = 'homeTrim') {
  const w = 0.08;
  onFace(Y, 'homeWindow', r, f, a0, a1, h0, h1, 0.008, 0.01);
  onFace(Y, frame, r, f, a0 - w, a0, h0 - w, h1 + w, 0.008, 0.03);
  onFace(Y, frame, r, f, a1, a1 + w, h0 - w, h1 + w, 0.008, 0.03);
  onFace(Y, frame, r, f, a0, a1, h1, h1 + w, 0.008, 0.03);
  onFace(Y, frame, r, f, a0 - w - 0.03, a1 + w + 0.03, h0 - w, h0, 0.008, 0.045);
  onFace(Y, frame, r, f, (a0 + a1) / 2 - 0.02, (a0 + a1) / 2 + 0.02, h0, h1, 0.008, 0.016);
}

/* A door: a panel in a frame. */
function doorOn(Y, r, f, a0, a1, h0, h1, panel, frame = 'homeTrim') {
  const w = 0.08;
  onFace(Y, panel, r, f, a0, a1, h0, h1, 0.008, 0.012);
  onFace(Y, frame, r, f, a0 - w, a0, h0, h1 + w, 0.008, 0.03);
  onFace(Y, frame, r, f, a1, a1 + w, h0, h1 + w, 0.008, 0.03);
  onFace(Y, frame, r, f, a0, a1, h1, h1 + w, 0.008, 0.03);
}

/* Lines along every face of a rectangle: the logs' chinking at the
 * heights `hs`, or the barn's boards every `step` up from h0 to h1. */
function chinking(Y, r, hs, m) {
  for (const h of hs) {
    onFace(Y, m, r, 's', r.x0, r.x1, h - 0.025, h + 0.025, 0.002, 0.004);
    onFace(Y, m, r, 'n', r.x0, r.x1, h - 0.025, h + 0.025, 0.002, 0.004);
    onFace(Y, m, r, 'w', r.y0, r.y1, h - 0.025, h + 0.025, 0.002, 0.004);
    onFace(Y, m, r, 'e', r.y0, r.y1, h - 0.025, h + 0.025, 0.002, 0.004);
  }
}

function boards(Y, r, h0, h1, step, m) {
  for (const f of ['s', 'n', 'w', 'e']) {
    const [a0, a1] = f === 's' || f === 'n' ? [r.x0, r.x1] : [r.y0, r.y1];
    for (let a = a0 + step; a < a1 - step / 2; a += step) {
      onFace(Y, m, r, f, a - 0.02, a + 0.02, h0, h1, 0.002, 0.004);
    }
  }
}

/* ------------------------------------------------------------------ */
/* The house                                                           */
/* ------------------------------------------------------------------ */

function dormer(Y, cx, side) {
  const half = 0.85;
  const front = side < 0 ? HOUSE.y0 + 1.3 : HOUSE.y1 - 1.3;
  const back = side < 0 ? HOUSE.y0 + 4.0 : HOUSE.y1 - 4.0;
  const r = { x0: cx - half, x1: cx + half, y0: Math.min(front, back), y1: Math.max(front, back) };
  const h0 = 4.4;
  const h1 = 5.75;
  Y.box('bardwellLog', r.x0, r.y0, h0, r.x1, r.y1, h1, { name: 'dormer' });
  windowOn(Y, r, side < 0 ? 's' : 'n', cx - 0.42, cx + 0.42, 4.85, 5.5);
  gableRoof(Y, 'y', r.x0, r.x1, side < 0 ? front : back, side < 0 ? back : front, h1, {
    pitch: HOUSE_PITCH, over: 0.2, roof: 'bardwellShingle', gable: 'bardwellLog', gables: side < 0 ? 'e0' : 'e1',
    E0: side < 0 ? front - 0.2 : back, E1: side < 0 ? back : front + 0.2,
  });
}

function house(Y) {
  const r = HOUSE;
  /* The footing, the logs to the eave, their chinking. */
  Y.box('homeStone', r.x0 - 0.04, r.y0 - 0.04, 0, r.x1 + 0.04, r.y1 + 0.04, FLOOR, { name: 'footing' });
  Y.box('bardwellLog', r.x0, r.y0, FLOOR, r.x1, r.y1, EAVE, { name: 'house' });
  const hs = [];
  for (let h = FLOOR + 0.33; h < EAVE - 0.1; h += 0.33) {
    hs.push(h);
  }
  chinking(Y, r, hs, 'bardwellChink');
  /* Corner log ends. */
  for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) {
    Y.paint('bardwellLog', x - 0.16, y - 0.16, FLOOR, x + 0.16, y + 0.16, EAVE - 0.05);
  }
  /* The front, under the porch: the door in the middle, two windows each
   * side. */
  doorOn(Y, r, 's', 7.45, 8.55, FLOOR, FLOOR + 2.1, 'homeShutter');
  for (const a of [2.0, 4.4, 10.2, 12.6]) {
    windowOn(Y, r, 's', a, a + 1.4, 1.35, 2.6);
  }
  /* The back, onto the courtyard: French doors and three windows. */
  doorOn(Y, r, 'n', 6.0, 7.9, FLOOR, FLOOR + 2.1, 'homeWindow');
  onFace(Y, 'homeTrim', r, 'n', 6.93, 6.97, FLOOR, FLOOR + 2.1, 0.008, 0.03);
  for (const a of [2.0, 11.0, 13.6]) {
    windowOn(Y, r, 'n', a, a + 1.4, 1.35, 2.6);
  }
  /* The ends: two windows below, one in the gable. */
  for (const f of ['w', 'e']) {
    windowOn(Y, r, f, 2.7, 3.9, 1.35, 2.6);
    windowOn(Y, r, f, 6.1, 7.3, 1.35, 2.6);
  }
  const roof = gableRoof(Y, 'x', r.y0, r.y1, r.x0, r.x1, EAVE, {
    pitch: HOUSE_PITCH, over: HOUSE_OVER, roof: 'bardwellShingle', gable: 'bardwellLog',
  });
  for (const f of ['w', 'e']) {
    windowOn(Y, r, f, 4.45, 5.55, 4.6, 5.6);
  }
  dormer(Y, 4.2, -1);
  dormer(Y, 11.8, -1);
  dormer(Y, 8.0, 1);
  return roof;
}

function porch(Y) {
  const p = PORCH;
  Y.box('bardwellPorch', p.x0 - 0.2, p.y0, 0, p.x1 + 0.2, p.y1, FLOOR, { name: 'porch deck' });
  /* The deck's boards, the steps down to the lawn at the door. */
  for (let x = p.x0; x < p.x1; x += 0.6) {
    Y.paint('bardwellChink', x + 0.28, p.y0, FLOOR, x + 0.3, p.y1, FLOOR + 0.004);
  }
  Y.box('bardwellPorch', STEPS.x0, p.y0 - 0.6, 0, STEPS.x1, p.y0 - 0.3, 0.2, { name: 'step' });
  Y.box('bardwellPorch', STEPS.x0, p.y0 - 0.3, 0, STEPS.x1, p.y0, 0.4, { name: 'step' });
  /* Log posts on the deck under a log beam. */
  for (const x of PORCH_POSTS) {
    Y.post('bardwellLog', x, POST_Y, FLOOR, BEAM.h0, POST_R, { seg: 8, name: 'porch post' });
  }
  Y.box('bardwellLog', p.x0 - 0.2, BEAM.y0, BEAM.h0, p.x1 + 0.2, BEAM.y1, BEAM.h1, { name: 'porch beam' });
  /* Rafters, paint, and the shed roof from under the main eave out over
   * the beam. */
  for (let x = 0.8; x < p.x1; x += 1.2) {
    Y.paint('bardwellLog', x - 0.06, BEAM.y0, BEAM.h1, x + 0.06, p.y1, BEAM.h1 + 0.12);
  }
  shedRoof(Y, 'bardwellShingle', 'x', p.y0 - 0.15, 3.0, p.y1 - 0.05, 3.28, p.x0 - 0.3, p.x1 + 0.3);
  /* The railing: a top rail, a bottom rail, square balusters; solid as one
   * slab, since a baluster's gap is not a craft's. */
  const rail = (x0, y0, x1, y1) => {
    Y.hidden(x0, y0, FLOOR, x1, y1, FLOOR + RAIL_H, 'wall', 'railing');
    Y.paint('bardwellPorch', x0, y0, FLOOR + RAIL_H - 0.06, x1, y1, FLOOR + RAIL_H);
    Y.paint('bardwellPorch', x0, y0, FLOOR + 0.08, x1, y1, FLOOR + 0.13);
    const along = x1 - x0 > y1 - y0;
    const len = along ? x1 - x0 : y1 - y0;
    for (let a = 0.15; a < len - 0.05; a += 0.2) {
      if (along) {
        Y.paint('bardwellPorch', x0 + a - 0.025, y0 + 0.01, FLOOR + 0.13, x0 + a + 0.025, y1 - 0.01, FLOOR + RAIL_H - 0.06);
      } else {
        Y.paint('bardwellPorch', x0 + 0.01, y0 + a - 0.025, FLOOR + 0.13, x1 - 0.01, y0 + a + 0.025, FLOOR + RAIL_H - 0.06);
      }
    }
  };
  rail(p.x0 - 0.15, POST_Y - 0.03, STEPS.x0, POST_Y + 0.03);
  rail(STEPS.x1, POST_Y - 0.03, p.x1 + 0.15, POST_Y + 0.03);
  rail(p.x0 - 0.15, POST_Y + 0.03, p.x0 - 0.09, p.y1);
  rail(p.x1 + 0.09, POST_Y + 0.03, p.x1 + 0.15, p.y1);
  /* The white planter on the rail, a boxwood row along the front. */
  Y.paint('homeTrim', 13.6, POST_Y - 0.12, FLOOR + RAIL_H, 14.4, POST_Y + 0.12, FLOOR + RAIL_H + 0.2);
  for (const [a, b] of [[0.4, 6.4], [9.6, 15.6]]) {
    for (let x = a; x <= b + 1e-6; x += 0.6) {
      Y.ball('homeHedge', x, p.y0 - 0.65, 0.42, 0.42);
    }
  }
}

/* ------------------------------------------------------------------ */
/* The courtyard and the gazebo                                        */
/* ------------------------------------------------------------------ */

function courtyard(Y) {
  const c = COURT;
  /* The pavers, laid in a grid of grey joints. */
  Y.paint('bardwellPaver', c.x0, c.y0 + 0.05, 0, c.x1, WALL.y0, G_PAVE);
  for (let x = c.x0 + 0.6; x < c.x1; x += 0.6) {
    Y.paint('homeCoping', x - 0.015, c.y0 + 0.05, G_PAVE, x + 0.015, WALL.y0, G_PAVE + 0.003);
  }
  for (let y = c.y0 + 0.65; y < WALL.y0; y += 0.6) {
    Y.paint('homeCoping', c.x0, y - 0.015, G_PAVE, c.x1, y + 0.015, G_PAVE + 0.003);
  }
  /* The brick wall, its coping, a pier at each end. */
  Y.box('homeBrick', c.x0, WALL.y0, 0, c.x1, WALL.y1, WALL.h, { name: 'brick wall' });
  Y.paint('homeCoping', c.x0 - 0.05, WALL.y0 - 0.04, WALL.h, c.x1 + 0.05, WALL.y1 + 0.04, WALL.h + 0.07);
  for (let h = 0.15; h < WALL.h - 0.05; h += 0.15) {
    Y.paint('homeCoping', c.x0, WALL.y0 - 0.004, h - 0.006, c.x1, WALL.y0, h + 0.006);
    Y.paint('homeCoping', c.x0, WALL.y1, h - 0.006, c.x1, WALL.y1 + 0.004, h + 0.006);
  }
  /* Along the wall: two grills under covers, their propane tanks. */
  for (const [x0, x1] of [[-1.5, -0.2], [-0.15, 1.15]]) {
    Y.box('homeChair', x0, 18.2, 0, x1, WALL.y0, 1.15, { name: 'grill', kind: 'obstacle' });
  }
  for (const x of [-2.25, 2.25]) {
    Y.post('homeTrim', x, 18.65, 0, 0.52, 0.16, { seg: 8, kind: 'obstacle', name: 'tank' });
  }
  /* The white glass table on the pavers. */
  Y.disc('homeTrim', 4.5, 16.9, 0.75, 0.72, 0.75);
  Y.hidden(3.9, 16.4, 0, 5.1, 17.4, 0.75, 'obstacle', 'glass table');
  for (const [dx, dy] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) {
    Y.paint('homeTrim', 4.5 + dx - 0.02, 16.9 + dy - 0.02, 0, 4.5 + dx + 0.02, 16.9 + dy + 0.02, 0.72);
  }
  /* Against the house: two blue bins, the grey cabinet. */
  for (const x of [12.4, 13.2]) {
    Y.box('homePlayBlue', x, c.y0 + 0.05, 0, x + 0.62, c.y0 + 0.75, 1.05, { name: 'bin', kind: 'obstacle' });
  }
  Y.box('homeSteel', 15.0, c.y0 + 0.05, 0, 15.9, c.y0 + 0.6, 1.8, { name: 'cabinet', kind: 'obstacle' });
  gazebo(Y);
}

function gazebo(Y) {
  const g = GAZEBO;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sy] of corners) {
    Y.post('bardwellPost', g.x + sx * g.half, g.y + sy * g.half, 0, g.beam + 0.18, g.post, { seg: 4, name: 'gazebo post' });
  }
  /* The beams round the top, solid; the roof's two tiers drawn as
   * pyramids, solid as stacked squares under them. */
  const a = g.half + 0.06;
  Y.box('bardwellPost', g.x - a, g.y - a, g.beam, g.x + a, g.y - a + 0.12, g.eave, { name: 'gazebo beam' });
  Y.box('bardwellPost', g.x - a, g.y + a - 0.12, g.beam, g.x + a, g.y + a, g.eave, { name: 'gazebo beam' });
  Y.box('bardwellPost', g.x - a, g.y - a, g.beam, g.x - a + 0.12, g.y + a, g.eave, { name: 'gazebo beam' });
  Y.box('bardwellPost', g.x + a - 0.12, g.y - a, g.beam, g.x + a, g.y + a, g.eave, { name: 'gazebo beam' });
  /* The lower tier a pyramid to a point under the upper one, a dark
   * riser between them, the upper tier over its top. */
  const half1 = g.half + g.over;
  const rise1 = 1.2;
  const vent = 3.2;
  const top2 = 3.45;
  const half2 = 0.95;
  const rise2 = 0.45;
  Y.pyramid('bardwellGazebo', g.x, g.y, g.eave, half1, rise1);
  Y.paint('homeShutter', g.x - 0.55, g.y - 0.55, vent, g.x + 0.55, g.y + 0.55, top2);
  Y.pyramid('bardwellGazebo', g.x, g.y, top2, half2, rise2);
  const sq = (h0, height, half) => {
    const n = Math.max(1, Math.ceil(height / BAND));
    for (let k = 1; k <= n; k += 1) {
      const lo = h0 + (height * (k - 1)) / n;
      const hi = h0 + (height * k) / n;
      const s = half * (1 - (hi - h0) / height);
      if (s > 0.02) {
        Y.hidden(g.x - s, g.y - s, lo, g.x + s, g.y + s, hi, 'wall', 'roof');
      }
    }
  };
  sq(g.eave, rise1, half1);
  sq(top2, rise2, half2);
  /* Under the upper tier, down to where the lower one is under its eave,
   * solid, so no pocket of air hides under its rim. */
  Y.hidden(g.x - half2, g.y - half2, vent, g.x + half2, g.y + half2, top2, 'wall', 'roof');
  /* String lights along the eaves. */
  for (const [sx, sy] of corners) {
    Y.paint('homeLamp', g.x + sx * a - 0.02, g.y + sy * a - 0.02, g.beam - 0.1, g.x + sx * a + 0.02, g.y + sy * a + 0.02, g.beam);
  }
  /* The table and the chairs round it, solid as one block. */
  Y.hidden(g.x - 1.1, g.y - 1.1, 0, g.x + 1.1, g.y + 1.1, TABLE_TOP, 'obstacle', 'gazebo table');
  Y.paint('homeShutter', g.x - 0.7, g.y - 0.5, 0.72, g.x + 0.7, g.y + 0.5, 0.76);
  for (const [dx, dy] of [[-0.95, 0], [0.95, 0], [0, -0.85], [0, 0.85]]) {
    const cx = g.x + dx;
    const cy = g.y + dy;
    Y.paint('homeChair', cx - 0.25, cy - 0.25, 0, cx + 0.25, cy + 0.25, 0.45);
    Y.paint('homeRug', cx - 0.23, cy - 0.23, 0.45, cx + 0.23, cy + 0.23, 0.5);
    const bx = dx ? Math.sign(dx) * 0.22 : 0;
    const by = dy ? Math.sign(dy) * 0.22 : 0;
    Y.paint('homeChair', cx + bx - (dx ? 0.03 : 0.25), cy + by - (dy ? 0.03 : 0.25), 0.45, cx + bx + (dx ? 0.03 : 0.25), cy + by + (dy ? 0.03 : 0.25), TABLE_TOP);
  }
}

/* ------------------------------------------------------------------ */
/* The barn, the camper, the firewood                                  */
/* ------------------------------------------------------------------ */

function barn(Y) {
  const b = BARN;
  Y.box('bardwellBarn', b.x0, b.y0, 0, b.x1, b.y1, BARN_EAVE, { name: 'barn' });
  boards(Y, b, 0, BARN_EAVE, 0.8, 'homeShutter');
  /* The big door in the south end, a door in the north end. */
  doorOn(Y, b, 's', 28.4, 31.6, 0, 3.0, 'homeShutter');
  doorOn(Y, b, 'n', 29.2, 30.8, 0, 2.2, 'homeShutter');
  windowOn(Y, b, 'e', 9.0, 10.0, 1.6, 2.4, 'homeShutter');
  gableRoof(Y, 'y', b.x0, b.x1, b.y0, b.y1, BARN_EAVE, {
    pitch: BARN_PITCH, over: 0.35, roof: 'bardwellRust', gable: 'bardwellBarn', fascia: 'bardwellRust',
  });
  /* The open bay: posts on the west line, a beam over them, its shed roof
   * from the barn's wall down over the beam. */
  for (const y of LEAN_POSTS) {
    Y.post('bardwellPost', LEAN.x, y, 0, LEAN.beam, LEAN_POST, { seg: 4, name: 'bay post' });
  }
  Y.box('bardwellPost', LEAN.x - 0.08, LEAN.y0, LEAN.beam, LEAN.x + 0.08, LEAN.y1, LEAN.top0 - 0.12, { name: 'bay beam' });
  shedRoof(Y, 'bardwellRust', 'y', LEAN.x0, LEAN.top0, b.x0, LEAN.top1, LEAN.y0 - 0.2, LEAN.y1 + 0.2, 0.12);
  /* In its north bay, lumber and a ladder against the wall, low. */
  Y.box('homeWood', 23.0, 14.3, 0, 25.9, 17.6, 1.1, { name: 'lumber', kind: 'obstacle' });
  Y.paint('homeTrim', 25.86, 12.0, 0, 25.94, 12.5, 2.6);
  Y.paint('homePlay', 23.4, 7.0, 0, 24.4, 7.6, 0.35);
}

function camper(Y) {
  const c = CAMPER;
  Y.cap('homeTrim', [c.x0, c.y, c.h], [c.x1, c.y, c.h], c.r, { look: 'capsule', seg: 14, kind: 'obstacle', name: 'camper' });
  /* Its dark chassis, and under that closed to the ground, so no slot
   * lies under it. */
  Y.box('homeShutter', c.x0 - 0.3, c.y - 0.8, 0.28, c.x1 + 0.3, c.y + 0.8, c.h - c.r + 0.15, { name: 'camper chassis', kind: 'obstacle' });
  Y.hidden(c.x0 - 0.3, c.y - 0.8, 0, c.x1 + 0.3, c.y + 0.8, 0.28, 'obstacle', 'camper base');
  for (const y of [c.y - c.r - 0.02, c.y + c.r - 0.2]) {
    Y.cyl('homeShutter', [19.9, y, 0.3], [19.9, y + 0.22, 0.3], 0.3, 12);
  }
  Y.paint('homeWindow', c.x0 - 0.2, c.y - 0.6, 1.7, c.x0 + 0.5, c.y + 0.6, 1.95);
  Y.box('homeShutter', c.x1 + c.r - 0.1, c.y - 0.08, 0.38, c.x1 + c.r + 1.0, c.y + 0.08, 0.48, { name: 'tongue', kind: 'obstacle' });
  Y.post('homeShutter', c.x1 + c.r + 0.8, c.y, 0, 0.42, 0.04, { seg: 5, kind: 'pole' });
}

function firewood(Y) {
  Y.box('homeWood', 22.0, 1.0, 0, 25.5, 2.4, 1.0, { name: 'firewood', kind: 'obstacle' });
  for (let i = 0; i < 9; i += 1) {
    const x = 22.2 + i * 0.37;
    Y.cyl('bardwellChink', [x, 0.96, 0.2 + (i % 3) * 0.3], [x, 1.0, 0.2 + (i % 3) * 0.3], 0.12, 6);
  }
}

/* ------------------------------------------------------------------ */
/* Down the field                                                      */
/* ------------------------------------------------------------------ */

function longBuilding(Y) {
  const l = LONG;
  Y.box('bardwellSiding', l.x0, l.y0, 0, l.x1, l.y1, LONG_EAVE, { name: 'long building' });
  for (const y of [-67.5, -62.5, -57.5]) {
    windowOn(Y, l, 'w', y, y + 1.1, 1.0, 1.9);
  }
  for (const y of [-66.5, -58.5]) {
    windowOn(Y, l, 'e', y, y + 1.1, 1.1, 1.9);
  }
  doorOn(Y, l, 'e', -63.0, -62.05, DECK.h, DECK.h + 2.05, 'homeTrim');
  windowOn(Y, l, 'n', 8.5, 9.5, 1.1, 1.9);
  gableRoof(Y, 'y', l.x0, l.x1, l.y0, l.y1, LONG_EAVE, {
    pitch: LONG_PITCH, over: 0.5, roof: 'bardwellOrange', gable: 'bardwellSiding', fascia: 'bardwellOrange',
  });
  /* The deck down its east side, grey, a few chairs and blue bits on it. */
  const d = DECK;
  Y.box('homeFoundation', d.x0, d.y0, 0, d.x1, d.y1, d.h, { name: 'deck' });
  for (let y = d.y0 + 0.14; y < d.y1; y += 0.14 * 2) {
    Y.paint('homeCoping', d.x0, y, d.h, d.x1, y + 0.02, d.h + 0.003);
  }
  for (const [x, y, m] of [[12.4, -66, 'homeChair'], [13.4, -64.5, 'homeChair'], [12.6, -59, 'homePlayBlue'], [13.6, -58, 'homeChair']]) {
    Y.paint(m, x - 0.3, y - 0.3, d.h, x + 0.3, y + 0.3, d.h + 0.8);
  }
}

function sheds(Y) {
  const b = BLUE;
  Y.box('bardwellBarn', b.x0, b.y0, 0, b.x1, b.y1, 2.2, { name: 'blue shed' });
  boards(Y, b, 0, 2.2, 0.5, 'homeShutter');
  doorOn(Y, b, 'w', -75.2, -73.8, 0, 1.95, 'homeShutter', 'homeShutter');
  shedRoof(Y, 'bardwellBlue', 'x', b.y0 - 0.25, 2.2, b.y1 + 0.25, 2.5, b.x0 - 0.25, b.x1 + 0.25, 0.1);
  /* The coops along the east line, white roofs. */
  for (const y of COOPS) {
    const r = { x0: 43.5, x1: 44.9, y0: y, y1: y + 1.2 };
    Y.box('bardwellBarn', r.x0, r.y0, 0, r.x1, r.y1, 1.0, { name: 'coop' });
    onFace(Y, 'homeShutter', r, 'w', y + 0.4, y + 0.8, 0.1, 0.6);
    shedRoof(Y, 'homeTrim', 'y', r.x0 - 0.15, 1.0, r.x1 + 0.15, 1.2, r.y0 - 0.12, r.y1 + 0.12, 0.06);
  }
}

/* A board fence along one side, a solid run with its posts and three
 * boards drawn on it, boards on the side `face` names (+1 the larger
 * coordinate). A banner board where `banners` says, along it. */
function fence(Y, dir, at, a0, a1, face = 1) {
  const t = 0.08;
  if (dir === 'x') {
    Y.hidden(a0, at - t, 0, a1, at + t, FENCE_H, 'wall', 'fence');
  } else {
    Y.hidden(at - t, a0, 0, at + t, a1, FENCE_H, 'wall', 'fence');
  }
  const len = a1 - a0;
  const n = Math.max(1, Math.round(len / 2.44));
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + (len * i) / n;
    if (dir === 'x') {
      Y.paint('homeFenceWood', a - 0.07, at - 0.07, 0, a + 0.07, at + 0.07, FENCE_H);
    } else {
      Y.paint('homeFenceWood', at - 0.07, a - 0.07, 0, at + 0.07, a + 0.07, FENCE_H);
    }
  }
  const f0 = at + face * 0.07;
  const f1 = f0 + face * 0.04;
  for (const h of [0.35, 0.75, 1.15]) {
    if (dir === 'x') {
      Y.paint('homeFenceWood', a0, Math.min(f0, f1), h - 0.08, a1, Math.max(f0, f1), h + 0.08);
    } else {
      Y.paint('homeFenceWood', Math.min(f0, f1), a0, h - 0.08, Math.max(f0, f1), a1, h + 0.08);
    }
  }
}

/* Where the fences carry a banner board, for the sponsors' banners
 * (./logos.js): a board 0.86 tall, `w` wide, on the face the fence's
 * boards are on or the other. Each { dir, at, along, side, w }. */
export const BANNERS = [
  /* The drive's side of the field fence, read driving up. */
  { dir: 'y', at: FIELD.x0, along: -90, side: -1, w: 2.6 },
  { dir: 'y', at: FIELD.x0, along: -84, side: -1, w: 2.6 },
  { dir: 'y', at: FIELD.x0, along: -46, side: -1, w: 2.6 },
  { dir: 'y', at: FIELD.x0, along: -38, side: -1, w: 2.6 },
  /* The field's north fence, read from the loop. */
  { dir: 'x', at: FIELD.y1, along: 9.5, side: 1, w: 2.6 },
  { dir: 'x', at: FIELD.y1, along: 15.5, side: 1, w: 2.6 },
  { dir: 'x', at: FIELD.y1, along: 40, side: 1, w: 2.6 },
  { dir: 'x', at: FIELD.y1, along: 52, side: 1, w: 2.6 },
  /* The field's south fence, read from the road. */
  { dir: 'x', at: FIELD.y0, along: 14, side: -1, w: 2.6 },
  { dir: 'x', at: FIELD.y0, along: 28, side: -1, w: 2.6 },
  { dir: 'x', at: FIELD.y0, along: 42, side: -1, w: 2.6 },
  { dir: 'x', at: FIELD.y0, along: 56, side: -1, w: 2.6 },
];
const BANNER = { h0: 0.32, h1: 1.18, d: 0.12, t: 0.02 };

function banners(Y) {
  for (const b of BANNERS) {
    const f0 = b.at + b.side * BANNER.d;
    const f1 = f0 + b.side * BANNER.t;
    const [p, q] = [Math.min(f0, f1), Math.max(f0, f1)];
    if (b.dir === 'x') {
      Y.paint('homeTrim', b.along - b.w / 2, p, BANNER.h0, b.along + b.w / 2, q, BANNER.h1);
    } else {
      Y.paint('homeTrim', p, b.along - b.w / 2, BANNER.h0, q, b.along + b.w / 2, BANNER.h1);
    }
  }
}

function field(Y) {
  const f = FIELD;
  /* Winter grass, the field's brown over the lawn's green. */
  Y.paint('bardwellDryGrass', f.x0 + 0.1, f.y0 + 0.1, 0, f.x1 - 0.1, f.y1 - 0.1, G_GRASS);
  fence(Y, 'y', f.x0, f.y0, f.y1, 1);
  fence(Y, 'x', f.y1, f.x0, GATE.x0, -1);
  fence(Y, 'x', f.y1, GATE.x1, f.x1, -1);
  fence(Y, 'y', f.x1, f.y0, f.y1, -1);
  fence(Y, 'x', f.y0, f.x0, f.x1, 1);
  fence(Y, 'y', EAST_LINE, f.y1, 30, -1);
  banners(Y);
  /* The gate: its posts, and the leaf swung back flat against the fence,
   * five galvanised bars. */
  for (const x of [GATE.x0, GATE.x1]) {
    Y.post('homeFenceWood', x, f.y1, 0, FENCE_H + 0.15, 0.1, { seg: 6, name: 'gate post' });
  }
  Y.hidden(GATE.x1 + 0.2, f.y1 + 0.08, 0, GATE.x1 + 3.8, f.y1 + 0.14, 1.25, 'wall', 'gate');
  for (let k = 0; k < 5; k += 1) {
    const h = 0.25 + k * 0.24;
    Y.paint('homeSteel', GATE.x1 + 0.2, f.y1 + 0.09, h - 0.025, GATE.x1 + 3.8, f.y1 + 0.13, h + 0.025);
  }
  /* The brush pile, the solar light by the drive at the field's corner. */
  Y.hidden(14.5, -41.5, 0, 17.5, -38.5, 1.1, 'obstacle', 'brush pile');
  for (let i = 0; i < 14; i += 1) {
    const a = (i * 37) % 13;
    const x0 = 14.6 + (a / 13) * 2.6;
    const y0 = -41.3 + (((i * 23) % 11) / 11) * 2.6;
    Y.cap('homeWood', [x0, y0, 0.15 + (i % 4) * 0.22], [x0 + 0.9 - (i % 3) * 0.6, y0 + 0.5 - (i % 5) * 0.25, 0.3 + (i % 3) * 0.25], 0.035, { solid: false, seg: 4 });
  }
  Y.post('homeSteel', f.x0, -97, 0, 6.2, 0.06, { seg: 6, kind: 'pole', name: 'solar light' });
  Y.box('homeWindow', f.x0 - 0.45, -97.35, 6.2, f.x0 + 0.45, -96.65, 6.3, { name: 'solar panel', kind: 'pole' });
  Y.paint('homeLamp', f.x0 - 0.25, -97.15, 5.95, f.x0 + 0.25, -96.85, 6.05);
}

function drive(Y) {
  /* Gravel up the field's west side to the loop, round the evergreen. */
  Y.paint('bardwellGravel', DRIVE.x0, ROAD.y1, 0, DRIVE.x1, LOOP.y - 3, G_GRAVEL);
  Y.ring('bardwellGravel', LOOP.x, LOOP.y, LOOP.r0, LOOP.r1, G_LOOP);
  /* Its two wheel tracks, a shade darker. */
  for (const x of [DRIVE.x0 + 0.8, DRIVE.x1 - 0.8]) {
    Y.paint('homeStone', x - 0.22, ROAD.y1, G_GRAVEL, x + 0.22, LOOP.y - 5, G_GRAVEL + 0.002);
  }
}

function road(Y) {
  Y.paint('homeAsphalt', PX0, ROAD.y0, 0, PX1, ROAD.y1, G_ASPHALT);
  for (const y of [-112.12, -111.88]) {
    Y.paint('homeBook', PX0, y - 0.06, G_ASPHALT, PX1, y + 0.06, G_LINE);
  }
  for (const y of [ROAD.y0 + 0.25, ROAD.y1 - 0.25]) {
    Y.paint('homeTrim', PX0, y - 0.06, G_ASPHALT, PX1, y + 0.06, G_LINE);
  }
  /* Wooden power poles along the north verge. */
  for (const x of [-42, -6, 30, 66]) {
    Y.post('bardwellPost', x, -106.5, 0, 9.5, 0.14, { seg: 7, kind: 'pole', name: 'power pole' });
    Y.box('bardwellPost', x - 1.2, -106.6, 8.9, x + 1.2, -106.4, 9.05, { name: 'crossarm', kind: 'pole' });
  }
  /* And up the drive to the house. */
  for (const y of [-70, -36]) {
    Y.post('bardwellPost', -4.5, y, 0, 9.0, 0.13, { seg: 7, kind: 'pole', name: 'power pole' });
    Y.box('bardwellPost', -4.6, y - 1.0, 8.4, -4.4, y + 1.0, 8.55, { name: 'crossarm', kind: 'pole' });
  }
}

/* ------------------------------------------------------------------ */
/* Trees and cars: the town's own, life size                           */
/* ------------------------------------------------------------------ */

/* [px, py, size, style]: the builder's pine at `size` is about 10.6 m a
 * size, so these are the stills' tall loblollies, 20 to 26 m; a few bare
 * broadleaves among them. The two in the field by the gate stand 4.6 m
 * apart for THE PINES. */
export const TREES = [
  [-7, 3, 2.2, 'loblolly'], [-8, 13, 2.0, 'loblolly'], [24, -5, 2.3, 'loblolly'], [2, 27, 2.0, 'loblolly'],
  [12, 30, 2.3, 'loblolly'], [24, 33, 2.0, 'loblolly'], [36, 27, 2.2, 'loblolly'], [40, 12, 1.5, 'loblolly'],
  [38, -6, 2.1, 'loblolly'], [LOOP.x, LOOP.y, 1.7, 'loblolly'],
  [-6, -32, 2.4, 'loblolly'], [-7, -47, 2.2, 'loblolly'], [-6, -62, 2.5, 'loblolly'], [-7, -80, 2.1, 'loblolly'], [-6, -95, 2.3, 'loblolly'],
  [31, -31.5, 2.2, 'loblolly'], [35.6, -31.5, 2.3, 'loblolly'],
  [-20, -10, 2.2, 'loblolly'], [-28, 6, 2.4, 'loblolly'], [-36, -22, 2.0, 'loblolly'], [-24, -48, 2.3, 'loblolly'],
  [-40, -60, 2.1, 'loblolly'], [-30, -84, 2.2, 'loblolly'], [-42, 24, 2.3, 'loblolly'], [-20, 34, 2.0, 'loblolly'],
  [-16, -70, 1.7, 'street'], [-34, -40, 1.8, 'street'], [-44, -8, 1.6, 'street'],
  [56, 8, 2.3, 'loblolly'], [64, 24, 2.1, 'loblolly'], [76, 4, 2.4, 'loblolly'], [78, -40, 2.0, 'street'],
  [78, -80, 2.2, 'loblolly'], [54, 40, 2.0, 'loblolly'], [60, -14, 1.8, 'street'],
  [-30, -118, 2.0, 'loblolly'], [20, -119, 2.2, 'loblolly'], [60, -118, 2.1, 'loblolly'],
  /* The tree line closing in, as the stills show the place wooded round and
   * behind: a belt along the north, the west and the east edges and the road. */
  [-14, -8, 2.0, 'loblolly'], [-14, 18, 2.1, 'loblolly'],
  [-44, 40, 2.2, 'loblolly'], [-30, 44, 2.0, 'loblolly'], [-12, 43, 2.3, 'loblolly'], [6, 45, 2.1, 'loblolly'],
  [22, 44, 2.2, 'loblolly'], [40, 42, 2.0, 'loblolly'], [56, 44, 2.3, 'loblolly'], [70, 40, 2.1, 'loblolly'],
  [-48, -20, 2.2, 'loblolly'], [-46, -44, 2.0, 'street'], [-48, -70, 2.3, 'loblolly'], [-44, -96, 2.1, 'loblolly'],
  [-38, 12, 2.2, 'loblolly'], [-46, 34, 2.0, 'loblolly'],
  [80, -20, 2.2, 'loblolly'], [80, -60, 2.0, 'loblolly'], [80, -100, 2.3, 'loblolly'], [74, 20, 2.1, 'loblolly'], [72, 36, 2.0, 'loblolly'],
  [-46, -112, 2.1, 'loblolly'], [-10, -115, 2.2, 'loblolly'], [40, -115, 2.0, 'loblolly'], [74, -121, 2.2, 'loblolly'],
];

function trees(Y) {
  TREES.forEach(([px, py, size, style], i) => {
    /* Past 60 m of the porch a loblolly is its three whorl outline. */
    const far = Math.hypot(px - 8, py + 5) > 60 ? 0 : 1;
    const el = { id: `bardwell-tree-${i + 1}`, type: 'tree', style, dims: { size, variant: 31 + i, detail: far } };
    Y.asset(el, 1, px, py, 0, 0, 'extra:trees');
  });
}

/* The white pickup by the house and the white truck by the barn: the
 * variants that come out white (carColourOf in src/props/street.js). */
function cars(Y) {
  const N = Math.PI / 2;
  const list = [
    ['bardwell-car-1', 'wagon', 19.5, -3.0, -N, 7],
    ['bardwell-car-2', 'van', 30.0, 1.0, -N, 9],
  ];
  for (const [id, style, px, py, yaw, variant] of list) {
    Y.asset({ id, type: 'car', style, dims: { variant } }, 1, px, py, 0, yaw, 'extra:cars');
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
  const parts = a.el.style === 'loblolly' ? loblollyLayout(a.el) : partsOf(a.el);
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
 * The house, the yard, the field and the road: { parts, prisms, rings,
 * discs, cyls, pyramids, scaled, roofs }, every part in the world frame.
 * The same every call.
 */
export function bardwellLayout() {
  const Y = new Yard();
  house(Y);
  porch(Y);
  courtyard(Y);
  barn(Y);
  camper(Y);
  firewood(Y);
  longBuilding(Y);
  sheds(Y);
  field(Y);
  drive(Y);
  road(Y);
  trees(Y);
  cars(Y);
  const parts = Y.P.list.slice();
  for (const a of Y.scaled) {
    parts.push(...scaledParts(a));
  }
  return {
    parts, prisms: Y.prisms, rings: Y.rings, discs: Y.discs, cyls: Y.cyls, pyramids: Y.pyramids, scaled: Y.scaled, roofs: Y.roofs,
  };
}

/*
 * The openings ./yard.js names as gaps: a span along a line at `y` (east
 * west) or `x` (north south), and its bottom and top.
 */
export const OPENINGS = {
  porch: { x0: STEPS.x0 + 0.1, x1: STEPS.x1 - 0.1, y: POST_Y, h0: FLOOR, h1: BEAM.h0 },
  gazebo: {
    y0: GAZEBO.y - GAZEBO.half + GAZEBO.post, y1: GAZEBO.y + GAZEBO.half - GAZEBO.post, x: GAZEBO.x - GAZEBO.half, h0: TABLE_TOP, h1: GAZEBO.beam,
  },
  barn: { y0: 10.0 + LEAN_POST, y1: 14.0 - LEAN_POST, x: LEAN.x, h0: 0, h1: LEAN.beam },
  pines: { x0: 31.6, x1: 35.0, y: -31.5, h0: 0, h1: 4.0 },
  gate: { x0: GATE.x0 + 0.1, x1: GATE.x1 - 0.1, y: FIELD.y1, h0: 0, h1: 2.2 },
  courtyard: { y0: COURT.y0 + 0.7, y1: WALL.y0, x: 16.6, h0: 0, h1: 2.6 },
};

/* Where the pilot starts: the lawn in front of the porch steps, facing
 * down the field. */
export const SPAWN = { px: 8, py: -5.2, h: 0 };
