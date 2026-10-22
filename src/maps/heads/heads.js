/*
 * heads.js: Heads' house (Infinity Loops), its yard, its corner and the two
 * streets round it, as the parts a built map holds. Pure data and
 * arithmetic, no Three.js, no JS trigonometry, so the solids can be built
 * and checked in plain Node, the way ../house/house.js is.
 *
 * WHERE IT COMES FROM. Twelve stills the owner cut from Heads' FPV videos
 * on 2026-10-20 and the public stills of three of them (BvXv_x23Da8,
 * UvvTN3lLreI, 8G5ooyFyxs8), laid out first as the standalone drawing
 * heads-house/index.html, whose records are in .loop/heads-house/ (the
 * spatial facts keep what a still shows apart from what is inferred). This
 * file is that drawing's plan, in the house map's terms. The stills decide
 * the outside: a side split on a corner lot, sage siding and white trim, a
 * one storey wing with the front door, a stoop and a double window, a two
 * storey part with the garage under the upstairs, which overhangs the front
 * a hand's width; the back wall of the wing cream, a slider two steps over a
 * curved brick red patio, a covered grill and the AC unit; a white vinyl
 * privacy fence; the drive east of the house, a red Japanese maple at its
 * street end, a big tree in the lawn toward the corner, a stop sign. Inside
 * they show the garage (a black and white checkerboard floor, pegboard and
 * bins down the east wall, the Infinity Loops banner and the totes on the
 * west, a shelf of quads across the ceiling, a round gate, an inflatable
 * Santa, the workbench and the sticker wall) and the basement family room
 * (the stair up with closet doors on its left, slim white posts under a
 * beam, a TV on a white stand right of the stair, an olive couch, a
 * punching bag, a black cabinet, a counter with presents). The main floor
 * and the upstairs no still shows: the owner's words, "you can infer the
 * upstairs", so their rooms are a side split's usual plan and nothing more.
 * People are left out, and the street sign carries no name.
 *
 * THE SCALE is Nick Burns' house's, S times life size (../house/house.js
 * says why), so a five inch flies this house the way a whoop flies a real
 * one. The plan below is in REAL metres and turned into the world's once,
 * by S, in the helpers under it.
 *
 * THE PLAN'S FRAME. px runs east along the front of the house, py north
 * from the wing's front wall to the back, h up from the lawn, all in real
 * metres, with the origin at the wing's front west corner on the ground.
 * The front faces south onto Street A; the cross street is to the west,
 * and the corner is south west of the house.
 *
 * THE LEVELS, a side split's: the main floor 0.9 over the lawn, the
 * upstairs half a flight above it over the garage and the basement, the
 * basement half a flight below it and partly under the lawn, the garage
 * on the lawn's level between them, three steps over the basement. Both
 * flights leave the foyer through the wall the wing shares with the two
 * storey part, side by side, the upper one against the front wall.
 *
 * WHAT IS SOLID AND WHAT IS PAINT, and why every window is a hole with a
 * frame and nothing in it: as ../house/house.js says. The helpers that cut
 * walls, roof roofs and band their solids are that file's, written again
 * here so neither map's file reaches into the other.
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
import { carOpenLayout } from '../../props/street.js';
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';

/* ------------------------------------------------------------------ */
/* The frame                                                           */
/* ------------------------------------------------------------------ */

/* World metres to a real metre: Nick Burns' house's. */
export const S = 3.5;

/* The plot in plan metres: the lot, the corner, both streets and the
 * houses across them. */
const PX0 = -42;
const PX1 = 46;
const PY0 = -46;
const PY1 = 34;
export const PLOT = { x0: PX0, x1: PX1, y0: PY0, y1: PY1 };

/* The plot in the document's metres, and where the plan's origin is on it. */
export const FIELD_W = (PX1 - PX0) * S;
export const FIELD_D = (PY1 - PY0) * S;
export const X0 = -PX0 * S;
export const Y0 = -PY0 * S;

/* The plan's origin in the world (../built/place.js docToWorld: x = docX -
 * W / 2, z = D / 2 - docY). */
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

/* ------------------------------------------------------------------ */
/* The house's numbers, real metres                                    */
/* ------------------------------------------------------------------ */

const TX = 0.2;
const TI = 0.12;
const DOOR_H = 2.05;

/* The one storey wing, west, and the two storey part, east. */
export const MW = { x0: 0, x1: 8.5, y0: 0, y1: 8.5 };
export const TS = { x0: 8.5, x1: 18.0, y0: 0, y1: 8.5, up: -0.25 };

/* The levels. */
export const FL = -0.55;
export const FG = 0;
export const FM = 0.9;
export const FU = 2.35;
const CEIL_LOW = 2.1;
const CEIL_MAIN = 3.35;
const EAVE_MAIN = 3.5;
const CEIL_UP = 4.75;
const EAVE_UP = 4.9;
/* How far the walls go into the ground under the basement's slab. */
const FOOT = FL - 0.3;

/* The rooms, inside faces. */
const MAIN = { x0: TX, x1: MW.x1, y0: TX, y1: MW.y1 - TX };
const FAMILY = { x0: TS.x0 + TX, x1: 13.75, y0: TX, y1: TS.y1 - TX };
const PART_G = 13.85;
const GARAGE = { x0: 13.95, x1: TS.x1 - TX, y0: TX, y1: TS.y1 - TX };
const UPPER = { x0: TS.x0 + TX, x1: TS.x1 - TX, y0: TS.up + TX, y1: TS.y1 - TX };

/* Roofs: 5 in 12 from the stills, a 0.35 overhang, a slab 0.21 thick. */
const PITCH = 5 / 12;
const OVER = 0.35;
const ROOF_T = 0.21;
const BAND = 0.05;

/* THE STAIRS: eight risers each way from the foyer, seven treads, side by
 * side through the shared wall, the upper flight against the front wall
 * and the lower one north of it, a wall between them. */
const RISE = (FM - FL) / 8;
const RUN = 1.95 / 7;
const STAIR_X1 = TS.x0 + 7 * RUN;
const UP_FLIGHT = { y0: TX, y1: 1.15 };
const DOWN_FLIGHT = { y0: 1.25, y1: 2.25 };
/* The stairwell's hole in the upstairs floor, and the closet under the
 * upper flight, whose bifold doors face the basement. */
const WELL = { x0: UPPER.x0, x1: STAIR_X1, y0: UPPER.y0, y1: 2.3 };
const CLOSET_X0 = 9.85;

/* The openings in the outside walls, [along0, along1, h0, h1]. */
const FRONT_DOOR = [6.9, 7.85, FM, FM + DOOR_H];
const DOUBLE_WIN = [1.5, 4.35, FM + 0.85, FM + 2.05];
const WEST_WINS = [[1.4, 2.8, FM + 0.85, FM + 2.05], [5.8, 7.2, FM + 0.85, FM + 2.05]];
const SLIDER = [1.2, 3.0, FM, FM + DOOR_H];
const KITCHEN_WIN = [5.6, 6.8, FM + 1.05, FM + 2.05];
const GARAGE_DOOR = [14.4, 17.4, FG, FG + 1.95];
const BASEMENT_WIN = [10.8, 12.8, 0.25, 1.35];
const BASEMENT_BACK = [[9.6, 10.8, 0.25, 0.85], [11.6, 12.8, 0.25, 0.85]];
const UP_FRONT = [[9.1, 10.1, FU + 0.9, FU + 1.95], [12.5, 13.7, FU + 0.85, FU + 2.05], [15.7, 16.9, FU + 0.85, FU + 2.05]];
const UP_BACK = [[9.6, 10.4, FU + 1.25, FU + 2.05], [12.3, 13.5, FU + 0.85, FU + 2.05], [15.6, 16.8, FU + 0.85, FU + 2.05]];
const UP_EAST = [[1.4, 2.6, FU + 0.85, FU + 2.05], [6.2, 7.4, FU + 0.85, FU + 2.05]];
/* The door from the garage down into the basement. */
const SHOP_DOOR = [4.2, 5.1];

/* The race gates, on the garage floor and in the basement: cubes, where
 * the stills show round hoops (the owner, 2026-10-21, "hoops need to be
 * cube gates"). Their side and their tubes, real metres. */
const CUBE = 1.3;
const CUBE_TUBE = 0.045;
const GARAGE_GATE = { x: 15.875, y: 6.4, h: FG };
const FAMILY_GATE = { x: 11.0, y: 3.6, h: FL };

/* The streets: Street A in front, its middle line at STREET_A, ten metres
 * between the kerbs; the cross street west of the house. Then, outward
 * from each kerb, a verge and a walk. The kerb returns round each corner
 * at CORNER_R about a centre a radius in from both kerbs. */
const STREET_A = -16.8;
const STREET_B = -15.0;
const HALF_A = 5.0;
const HALF_B = 4.5;
const KERB_W = 0.15;
const KERB_H = 0.15;
const VERGE = 1.35;
const WALK = 1.3;
const CORNER_R = 6.0;
const KA = STREET_A + HALF_A;
const KB = STREET_B + HALF_B;
/* The property line along each street on our side. */
const LINE_A = KA + KERB_W + VERGE + WALK;
const LINE_B = KB + KERB_W + VERGE + WALK;

/* Paint on the ground, each a little over the last, as Nick's are. */
const G_ASPHALT = 0.025;
const G_PAVE = 0.03;
const G_DRIVE = 0.034;
const G_LINE = 0.038;

/* The drive, east of the house, and its apron across the verge. */
const DRIVE = { x0: 13.2, x1: 19.0 };

/* ------------------------------------------------------------------ */
/* The builder                                                         */
/* ------------------------------------------------------------------ */

/*
 * Everything is added in plan terms and lands in one Parts list in the
 * world frame, plus what the parts cannot say: roof slopes and gables
 * (prisms), flat round or curved paving (flats), round things (discs,
 * cyls), cones, and the town's own trees and cars drawn larger (scaled).
 * Those are the draw()'s, in ./index.js.
 */
class House {
  constructor() {
    this.P = new Parts();
    this.prisms = [];
    this.flats = [];
    this.discs = [];
    this.cyls = [];
    this.cones = [];
    this.scaled = [];
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

  /* A floor's finish: paint a whisker over the solid top at h. */
  floor(m, px0, py0, px1, py1, h) {
    return this.paint(m, px0, py0, h, px1, py1, h + 0.004);
  }

  cap(m, a, b, r, opts = {}) {
    return this.P.cap(m, worldAt(a[0], a[1], a[2]), worldAt(b[0], b[1], b[2]), S * r, opts);
  }

  post(m, px, py, h0, h1, r, opts = {}) {
    return this.cap(m, [px, py, h0], [px, py, h1], r, opts);
  }

  /* A ball: a shrub, a crown's blob, drawn round and solid as a sphere. */
  ball(m, px, py, h, r, opts = {}) {
    return this.cap(m, [px, py, h], [px, py, h], r, { look: 'capsule', kind: 'tree', seg: 10, ...opts });
  }

  wall(dir, at, a0, a1, h0, h1, o = {}) {
    const spec = wallSpec(dir, at, o.t ?? TI, a0, a1, h0, h1, o.holes ?? []);
    this.P.wall(o.core ?? 'homeWallIn', spec, { kind: 'wall', name: o.name ?? 'wall' });
  }

  /* The frame round an opening on one face of a wall, as ../house/house.js. */
  frame(dir, at, t, side, hole, m = 'homeTrim', o = {}) {
    const [b0, b1, c0, c1] = hole;
    const w = o.w ?? 0.09;
    const d = o.d ?? 0.05;
    const f = at + side * (t / 2 + 0.012);
    const g = f + side * d;
    const add = (mm, a0, a1, h0, h1, p, q) => {
      if (dir === 'x') {
        this.paint(mm, a0, p, h0, a1, q, h1);
      } else {
        this.paint(mm, p, a0, h0, q, a1, h1);
      }
    };
    add(m, b0 - w, b0, c0, c1 + w, f, g);
    add(m, b1, b1 + w, c0, c1 + w, f, g);
    add(m, b0, b1, c1, c1 + w, f, g);
    if (o.sill) {
      add(m, b0 - w - 0.04, b1 + w + 0.04, c0 - 0.06, c0, f, g + side * 0.04);
    }
    if (o.sash) {
      const s = 0.035;
      const p = at + side * (t / 2 - 0.08);
      const q = at + side * (t / 2);
      add(o.sash, b0, b0 + s, c0, c1, p, q);
      add(o.sash, b1 - s, b1, c0, c1, p, q);
      add(o.sash, b0, b1, c1 - s, c1, p, q);
      add(o.sash, b0, b1, c0, c0 + s, p, q);
    }
  }

  prism(m, axis, profile, e0, e1) {
    this.prisms.push({ m, axis, profile, e0, e1 });
  }

  /* A flat shape on the ground, plan points, drawn from h0 to h1. */
  flat(m, pts, h0, h1) {
    this.flats.push({ m, pts, h0, h1 });
  }

  /* A cylinder between two plan points, drawn only. */
  cyl(m, a, b, r, seg = 8) {
    this.cyls.push({ m, a: worldAt(a[0], a[1], a[2]), b: worldAt(b[0], b[1], b[2]), r: S * r, seg });
  }

  cone(m, px, py, h, r, height) {
    this.cones.push({ m, base: worldAt(px, py, h), r: S * r, h: S * height });
  }

  asset(el, k, px, py, h, yaw, chunk = 'extra') {
    this.scaled.push({ el, k, px, py, h, yaw, chunk });
  }
}

/* A rectangle with a hole in it, as the four rectangles round the hole. */
function around(h, x0, y0, x1, y1) {
  return [[x0, y0, x1, h.y0], [x0, h.y1, x1, y1], [x0, h.y0, h.x0, h.y1], [h.x1, h.y0, x1, h.y1]];
}

/* A Parts.wall spec in the world frame for a wall written in plan terms. */
function wallSpec(dir, at, t, a0, a1, h0, h1, holes) {
  return dir === 'x'
    ? {
      axis: 'x', at: wz(at), t: S * t, from: wx(a0), to: wx(a1), y0: wy(h0), y1: wy(h1),
      holes: holes.map(([b0, b1, c0, c1]) => ({ from: wx(b0), to: wx(b1), y0: wy(c0), y1: wy(c1) })),
    }
    : {
      axis: 'z', at: wx(at), t: S * t, from: wz(a1), to: wz(a0), y0: wy(h0), y1: wy(h1),
      holes: holes.map(([b0, b1, c0, c1]) => ({ from: wz(b1), to: wz(b0), y0: wy(c0), y1: wy(c1) })),
    };
}

/* ------------------------------------------------------------------ */
/* Roofs, as ../house/house.js builds them                             */
/* ------------------------------------------------------------------ */

/* A roof's solid as level bands under its top surface (../house/house.js
 * bands() says why). */
function bands(H, axis, E0, E1, h0, h1, span, walls = [E0, E1]) {
  const n = Math.max(1, Math.ceil((h1 - h0) / BAND - 1e-9));
  const box = (a, b, s, lo, hi) => (axis === 'x'
    ? H.hidden(a, s[0], lo, b, s[1], hi, 'wall', 'roof')
    : H.hidden(s[0], a, lo, s[1], b, hi, 'wall', 'roof'));
  const [w0, w1] = walls;
  for (let k = 1; k <= n; k += 1) {
    const lo = h0 + ((h1 - h0) * (k - 1)) / n;
    const hi = h0 + ((h1 - h0) * k) / n;
    const s = span(hi);
    if (!s || !(s[1] - s[0] > 1e-6)) {
      continue;
    }
    box(w0, w1, s, lo, hi);
    if (E0 < w0 || E1 > w1) {
      const t = span(hi + ROOF_T);
      const strips = t && t[1] - t[0] > 1e-6 ? [[s[0], t[0]], [t[1], s[1]]] : [s];
      for (const st of strips) {
        if (!(st[1] - st[0] > 1e-6)) {
          continue;
        }
        if (E0 < w0) {
          box(E0, w0, st, lo, hi);
        }
        if (E1 > w1) {
          box(w1, E1, st, lo, hi);
        }
      }
    }
  }
}

/* A gable roof over a rectangle, ridge along `axis` (../house/house.js). */
function gableRoof(H, axis, a0, a1, e0, e1, eave, floor, o = {}) {
  const over = o.over ?? OVER;
  const pitch = o.pitch ?? PITCH;
  const half = (a1 - a0) / 2;
  const mid = a0 + half;
  const run = half + over;
  const yEdge = eave - 0.15;
  const ridge = yEdge + pitch * run;
  const top0 = (x) => yEdge + pitch * (x - (a0 - over));
  const top1 = (x) => yEdge + pitch * (a1 + over - x);
  const edge0 = a0 - over;
  const edge1 = a1 + over;
  const E0 = o.E0 ?? e0 - over;
  const E1 = o.E1 ?? e1 + over;
  const roofM = o.roof ?? 'homeRoof';
  H.prism(roofM, axis, [
    [edge0, top0(edge0) - ROOF_T], [edge0, top0(edge0)], [mid, ridge], [mid, ridge - ROOF_T],
  ], E0, E1);
  H.prism(roofM, axis, [
    [edge1, top1(edge1) - ROOF_T], [mid, ridge - ROOF_T], [mid, ridge], [edge1, top1(edge1)],
  ], E0, E1);
  fascia(H, axis, edge0, -1, top0(edge0), E0, E1);
  fascia(H, axis, edge1, 1, top1(edge1), E0, E1);
  const gable = o.gable ?? 'headsSiding';
  const base = o.base ?? eave;
  const apex = ridge - ROOF_T - 0.01;
  const tri = [[a0, base], [a1, base], [mid, apex]];
  const which = o.gables ?? 'both';
  if (which === 'both' || which === 'e0') {
    H.prism(gable, axis, tri, e0, e0 + TX);
  }
  if (which === 'both' || which === 'e1') {
    H.prism(gable, axis, tri, e1 - TX, e1);
  }
  bands(H, axis, E0, E1, floor, ridge, (h) => {
    const d = Math.max(0, (h - yEdge) / pitch);
    return [Math.max(edge0, a0 - over + d), Math.min(edge1, a1 + over - d)];
  }, [Math.max(E0, e0), Math.min(E1, e1)]);
  const run0 = (h) => Math.max(0, (h - yEdge) / pitch);
  if (floor > yEdge - ROOF_T) {
    bands(H, axis, E0, E1, yEdge - ROOF_T, floor, (h) => [Math.max(edge0, a0 - over + run0(h)), a0]);
    bands(H, axis, E0, E1, yEdge - ROOF_T, floor, (h) => [a1, Math.min(edge1, a1 + over - run0(h))]);
  }
  return { ridge, mid };
}

/* The white board along an eave's edge. */
function fascia(H, axis, at, side, top, E0, E1) {
  const a = side < 0 ? at - 0.03 : at - 0.02;
  const b = side < 0 ? at + 0.02 : at + 0.03;
  H.prism('homeTrim', axis, [
    [a, top - ROOF_T - 0.02], [a, top + 0.01], [b, top + 0.01], [b, top - ROOF_T - 0.02],
  ], E0, E1);
}

/* ------------------------------------------------------------------ */
/* Walls and paint on them                                             */
/* ------------------------------------------------------------------ */

/*
 * An OUTSIDE WALL: the core in the inside white, from h0 to top, the outer
 * face a skin of `skin` from `from` up, a frame round every opening
 * outside, dark sashes in the windows, shutters beside the ones `shutters`
 * names. `out` is which face is outside, +1 north or east.
 */
function extWall(H, dir, at, a0, a1, holes, out, o = {}) {
  const h0 = o.h0 ?? 0;
  const top = o.top ?? EAVE_MAIN;
  const skin = o.skin ?? 'headsSiding';
  H.wall(dir, at, a0, a1, h0, top, { t: TX, holes, name: 'outer wall' });
  const surface = at + out * (TX / 2 + 0.003);
  const lo = dir === 'y' ? a0 - TX : a0;
  const hi = dir === 'y' ? a1 + TX : a1;
  const from = Math.max(h0, o.from ?? 0);
  face(H, skin, dir, surface, lo, hi, from, top, holes, out);
  for (const h of holes) {
    /* A door is a full height opening; anything shorter is a window, with
     * a sill and a dark sash. */
    const window = h[3] - h[2] < 1.8;
    H.frame(dir, at, TX, out, h, 'homeTrim', { sill: window, sash: window ? 'homeShutter' : null });
  }
  for (const h of o.shutters ?? []) {
    const f = at + out * (TX / 2 + 0.012);
    const g = f + out * 0.035;
    for (const [s0, s1] of [[h[0] - 0.55, h[0] - 0.13], [h[1] + 0.13, h[1] + 0.55]]) {
      if (dir === 'x') {
        H.paint('headsShutter', s0, Math.min(f, g), h[2], s1, Math.max(f, g), h[3]);
      } else {
        H.paint('headsShutter', Math.min(f, g), s0, h[2], Math.max(f, g), s1, h[3]);
      }
    }
  }
  if (o.water !== false) {
    if (dir === 'x') {
      H.paint('homeTrim', lo - 0.02, Math.min(at + out * (TX / 2), at + out * (TX / 2 + 0.04)), from, hi + 0.02, Math.max(at + out * (TX / 2), at + out * (TX / 2 + 0.04)), from + 0.2);
    } else {
      H.paint('homeTrim', Math.min(at + out * (TX / 2), at + out * (TX / 2 + 0.04)), lo - 0.02, from, Math.max(at + out * (TX / 2), at + out * (TX / 2 + 0.04)), hi + 0.02, from + 0.2);
    }
  }
}

/* Paint on a wall face with its openings left open (../house/house.js). */
function face(H, m, dir, at, a0, a1, h0, h1, holes = [], side = 1, skin = 0.008) {
  if (!(a1 - a0 > 1e-6) || !(h1 - h0 > 1e-6)) {
    return;
  }
  const centre = at + side * (skin / 2 + 0.004);
  H.P.wall(m, wallSpec(dir, centre, skin, a0, a1, h0, h1, holes), { solid: false, cast: false, name: 'paint' });
}

/* A room's four faces painted from h0 to h1, holes per side ('s', 'n',
 * 'w', 'e'), false for a side left bare. */
function roomFaces(H, m, r, h0, h1, holes = {}) {
  const sides = [
    ['s', 'x', r.y0, r.x0, r.x1, 1],
    ['n', 'x', r.y1, r.x0, r.x1, -1],
    ['w', 'y', r.x0, r.y0, r.y1, 1],
    ['e', 'y', r.x1, r.y0, r.y1, -1],
  ];
  for (const [k, dir, at, a0, a1, side] of sides) {
    if (holes[k] === false) {
      continue;
    }
    face(H, m, dir, at, a0, a1, h0, h1, holes[k] ?? [], side);
  }
}

/* An inside doorway's casing, both faces. */
function casing(H, dir, at, b0, b1, floor, h = DOOR_H, t = TI) {
  const hole = [b0, b1, floor, floor + h];
  H.frame(dir, at, t, 1, hole, 'homeWhite', { w: 0.08, d: 0.02 });
  H.frame(dir, at, t, -1, hole, 'homeWhite', { w: 0.08, d: 0.02 });
  return hole;
}

/* ------------------------------------------------------------------ */
/* The shell                                                           */
/* ------------------------------------------------------------------ */

function shell(H) {
  /* The wing: its slab the main floor, solid to the ground, the crawl
   * space with it; its ceiling under the roof. */
  H.box('homeFoundation', MW.x0, MW.y0, 0, MW.x1, MW.y1, FM, { name: 'wing slab' });
  H.box('homeWallIn', MW.x0, MW.y0, CEIL_MAIN, MW.x1, MW.y1, EAVE_MAIN, { name: 'wing ceiling' });

  /* The wing's front: the double window with its shutters, the front
   * door. West: two windows with shutters. Back, cream: the slider and the
   * kitchen window. */
  extWall(H, 'x', TX / 2, MW.x0, MW.x1, [DOUBLE_WIN, FRONT_DOOR], -1, { shutters: [DOUBLE_WIN] });
  extWall(H, 'y', TX / 2, MW.y0 + TX, MW.y1 - TX, WEST_WINS, -1, { shutters: WEST_WINS });
  extWall(H, 'x', MW.y1 - TX / 2, MW.x0, MW.x1, [SLIDER, KITCHEN_WIN], 1, { skin: 'headsCream' });
  /* The front door swung open into the foyer on its west hinges, back
   * against the living room's wall and clear of both flights, and the
   * light beside it. */
  H.box('homeWhite', FRONT_DOOR[0] + 0.02, TX, FM + 0.01, FRONT_DOOR[0] + 0.06, 1.0, FM + 2.02, { name: 'front door' });
  H.paint('homeShutter', 6.62, -0.04, FM + 1.35, 6.78, 0, FM + 1.6);

  /* THE TWO STOREY PART. Its slabs: the basement's under the lawn, the
   * garage's on it, the upstairs floor with the stairwell cut out of it,
   * the ceiling under its roof. */
  H.box('homeFoundation', FAMILY.x0, FAMILY.y0, FOOT, FAMILY.x1, FAMILY.y1, FL, { name: 'basement slab' });
  H.box('homeFoundation', FAMILY.x1, GARAGE.y0, FG - 0.3, GARAGE.x1, GARAGE.y1, FG, { name: 'garage slab' });
  for (const [a, b, c, d] of around(WELL, UPPER.x0, UPPER.y0, UPPER.x1, UPPER.y1)) {
    H.box('homeWallIn', a, b, CEIL_LOW, c, d, FU, { name: 'upstairs floor' });
  }
  H.box('homeWallIn', TS.x0, TS.up, CEIL_UP, TS.x1, TS.y1, EAVE_UP, { name: 'upstairs ceiling' });
  /* The overhang's underside, white, over the front of the lower walls. */
  H.box('homeTrim', TS.x0, TS.up, CEIL_LOW - 0.1, TS.x1, TS.y0, CEIL_LOW, { name: 'soffit' });

  /* Front, lower: the basement's window and the garage door. Back: the
   * basement's two small windows low, the upstairs' three. East: the
   * upstairs' two. Upstairs front, over the overhang: three. */
  extWall(H, 'x', TX / 2, TS.x0, TS.x1, [BASEMENT_WIN, GARAGE_DOOR], -1, { h0: FOOT, top: CEIL_LOW });
  extWall(H, 'x', TS.y1 - TX / 2, TS.x0, TS.x1, [...BASEMENT_BACK, ...UP_BACK], 1, { h0: FOOT, top: EAVE_UP });
  extWall(H, 'y', TS.x1 - TX / 2, TS.y0 + TX, TS.y1 - TX, [], 1, { h0: FOOT, top: CEIL_LOW });
  extWall(H, 'y', TS.x1 - TX / 2, TS.up + TX, TS.y1 - TX, UP_EAST, 1, { h0: CEIL_LOW, top: EAVE_UP, water: false });
  extWall(H, 'x', TS.up + TX / 2, TS.x0, TS.x1, UP_FRONT, -1, { h0: CEIL_LOW, top: EAVE_UP, water: false });
  /* The wall the two parts share, open where the two flights go through
   * it, sided where it stands over the wing's roof. */
  const flights = [[UP_FLIGHT.y0, UP_FLIGHT.y1, FM, CEIL_MAIN], [DOWN_FLIGHT.y0, DOWN_FLIGHT.y1, FL, CEIL_MAIN]];
  H.wall('y', TS.x0 + TX / 2, TS.y0, TS.y1, FOOT, CEIL_LOW, { t: TX, holes: flights, name: 'shared wall' });
  H.wall('y', TS.x0 + TX / 2, TS.up + TX, TS.y1, CEIL_LOW, EAVE_UP, { t: TX, holes: flights, name: 'shared wall' });
  face(H, 'headsSiding', 'y', TS.x0 - 0.003, TS.up, TS.y1, EAVE_MAIN, EAVE_UP, [], -1);

  /* The roofs: the wing's runs into the two storey part's west wall, the
   * two storey part's has both gables. */
  gableRoof(H, 'x', MW.y0, MW.y1, MW.x0, MW.x1, EAVE_MAIN, EAVE_MAIN, { gables: 'e0', E1: MW.x1 });
  gableRoof(H, 'x', TS.up, TS.y1, TS.x0, TS.x1, EAVE_UP, EAVE_UP);

  /* Corner boards and downspouts. */
  const board = (x, y, h0, h1) => H.paint('homeTrim', x - 0.07, y - 0.07, h0, x + 0.07, y + 0.07, h1);
  board(MW.x0, MW.y0, 0, EAVE_MAIN);
  board(MW.x0, MW.y1, 0, EAVE_MAIN);
  board(TS.x1, TS.y0, 0, CEIL_LOW);
  board(TS.x1, TS.y1, 0, EAVE_UP);
  board(TS.x1, TS.up, CEIL_LOW, EAVE_UP);
  board(TS.x0, TS.up, CEIL_LOW, EAVE_UP);
  for (const [x, y, h1] of [[MW.x0 + 0.12, MW.y0 - 0.12, EAVE_MAIN - 0.1], [TS.x1 - 0.12, TS.up - 0.12, EAVE_UP - 0.1], [TS.x1 - 0.12, TS.y1 + 0.12, EAVE_UP - 0.1]]) {
    H.paint('homeTrim', x - 0.045, y - 0.045, 0, x + 0.045, y + 0.045, h1);
  }

  /* The flag on its bracket at the front corner where the parts meet,
   * hanging off a pole out over the stoop: stripes and its blue field. */
  H.cap('homeSteel', [8.62, -0.27, 2.75], [8.35, -1.5, 3.3], 0.02, { solid: false, seg: 5 });
  for (let k = 0; k < 7; k += 1) {
    const h1 = 3.25 - k * 0.09;
    H.paint(k % 2 ? 'homeWhite' : 'homePlay', 8.37, -1.45, h1 - 0.09, 8.39, -0.35, h1);
  }
  H.paint('homeRug', 8.365, -1.45, 2.97, 8.395, -0.95, 3.25);
}

/* ------------------------------------------------------------------ */
/* The stairs                                                          */
/* ------------------------------------------------------------------ */

function stairs(H) {
  /* The lower flight, down east from the foyer to the basement, solid to
   * the basement's floor under each tread. */
  for (let i = 0; i < 7; i += 1) {
    const x0 = TS.x0 + i * RUN;
    const top = FM - (i + 1) * RISE;
    H.box('homeWallIn', x0, DOWN_FLIGHT.y0, FL, x0 + RUN, DOWN_FLIGHT.y1, top - 0.03, { name: 'stair' });
    H.box('homeFloor', x0 - 0.02, DOWN_FLIGHT.y0, top - 0.03, x0 + RUN, DOWN_FLIGHT.y1, top, { name: 'tread' });
  }
  /* Its rail along the open north side, painted, posts at the foot. */
  H.cap('homeShelf', [STAIR_X1, DOWN_FLIGHT.y1 + 0.04, FL + 0.95], [TS.x0 + 0.2, DOWN_FLIGHT.y1 + 0.04, FM + 0.9], 0.03, { solid: false, seg: 6 });
  H.post('homeWhite', STAIR_X1 - 0.05, DOWN_FLIGHT.y1 + 0.04, FL, FL + 0.95, 0.03, { solid: false, seg: 6 });

  /* The upper flight, up east from the foyer to the upstairs; under its
   * first treads a solid fill to the foyer's level, under its top three
   * the basement's closet. */
  for (let i = 0; i < 7; i += 1) {
    const x0 = TS.x0 + i * RUN;
    const top = FM + (i + 1) * RISE;
    const under = x0 + RUN <= CLOSET_X0 + 0.05 ? FM : top - 0.42;
    H.box('homeWallIn', x0, UP_FLIGHT.y0, under, x0 + RUN, UP_FLIGHT.y1, top - 0.03, { name: 'stair' });
    H.box('homeCarpet', x0 - 0.02, UP_FLIGHT.y0, top - 0.03, x0 + RUN, UP_FLIGHT.y1, top, { name: 'tread' });
    if (x0 + RUN > CLOSET_X0 + 0.05) {
      H.box('homeWallIn', x0, UP_FLIGHT.y0, FL, x0 + RUN, UP_FLIGHT.y1, under, { name: 'closet' });
    }
  }
  H.box('homeWallIn', FAMILY.x0, UP_FLIGHT.y0, FL, TS.x0 + 5 * RUN, UP_FLIGHT.y1, FM, { name: 'under stair' });
  /* The closet's white bifold doors, facing the basement. */
  H.paint('homeWhite', STAIR_X1, UP_FLIGHT.y0 + 0.08, FL, STAIR_X1 + 0.01, UP_FLIGHT.y1 - 0.08, FL + 1.85);
  for (let k = 1; k < 4; k += 1) {
    const y = UP_FLIGHT.y0 + 0.08 + (k * (UP_FLIGHT.y1 - UP_FLIGHT.y0 - 0.16)) / 4;
    H.paint('homeWallIn', STAIR_X1 + 0.01, y - 0.006, FL + 0.05, STAIR_X1 + 0.014, y + 0.006, FL + 1.8);
  }
  /* The wall between the flights, from the basement's floor to a guard's
   * height over the upstairs floor, and the guard along the stairwell's
   * east edge over the lower flight. */
  H.box('homeWallIn', FAMILY.x0, UP_FLIGHT.y1, FL, STAIR_X1, DOWN_FLIGHT.y0, FU + 0.9, { name: 'stair wall' });
  H.box('homeWallIn', STAIR_X1 - 0.05, DOWN_FLIGHT.y0, FU, STAIR_X1 + 0.05, WELL.y1, FU + 0.9, { name: 'guard' });
  H.box('homeShelf', STAIR_X1 - 0.06, DOWN_FLIGHT.y0, FU + 0.86, STAIR_X1 + 0.06, WELL.y1, FU + 0.92, { name: 'rail', solid: false });
}

/* ------------------------------------------------------------------ */
/* The garage                                                          */
/* ------------------------------------------------------------------ */

/* A quad, small and flat on a shelf, painted: a plus of arms, a body. */
function quadOn(H, x, y, h, m) {
  H.paint('homeShelf', x - 0.13, y - 0.02, h, x + 0.13, y + 0.02, h + 0.015);
  H.paint('homeShelf', x - 0.02, y - 0.13, h, x + 0.02, y + 0.13, h + 0.015);
  H.paint(m, x - 0.045, y - 0.05, h + 0.015, x + 0.045, y + 0.05, h + 0.06);
  for (const [dx, dy] of [[-0.11, 0], [0.11, 0], [0, -0.11], [0, 0.11]]) {
    H.paint('homeSteel', x + dx - 0.05, y + dy - 0.05, h + 0.02, x + dx + 0.05, y + dy + 0.05, h + 0.024);
  }
}

/* A cube to fly through: twelve tubes on the floor round a cube CUBE on a
 * side, centred on g, black uprights and white rails. Every face is open,
 * so it is flown through from any side; the named gap is one pair of faces
 * (OPENINGS.garageGate north and south, OPENINGS.basementGate east and
 * west). */
function cube(H, g) {
  const a = CUBE / 2;
  const r = CUBE_TUBE;
  const xs = [g.x - a + r, g.x + a - r];
  const ys = [g.y - a + r, g.y + a - r];
  const hs = [g.h + r, g.h + CUBE - r];
  for (const x of xs) {
    for (const y of ys) {
      H.cap('homeShelf', [x, y, hs[0]], [x, y, hs[1]], r, { kind: 'gate', seg: 6, name: 'cube' });
    }
  }
  for (const h of hs) {
    for (const y of ys) {
      H.cap('homeWhite', [xs[0], y, h], [xs[1], y, h], r, { kind: 'gate', seg: 6, name: 'cube' });
    }
    for (const x of xs) {
      H.cap('homeWhite', [x, ys[0], h], [x, ys[1], h], r, { kind: 'gate', seg: 6, name: 'cube' });
    }
  }
}

function garage(H) {
  const g = GARAGE;
  /* The wall down into the basement, its door near the middle, steps down
   * on the basement's side. */
  const door = [SHOP_DOOR[0], SHOP_DOOR[1], FG, FG + 2.0];
  H.wall('y', PART_G, g.y0, g.y1, FL, CEIL_LOW, { t: 0.2, holes: [door], name: 'garage wall' });
  casing(H, 'y', PART_G, SHOP_DOOR[0], SHOP_DOOR[1], FG, 2.0, 0.2);
  const step = (FG - FL) / 3;
  H.box('homeFloor', FAMILY.x1 - 0.56, SHOP_DOOR[0], FL, FAMILY.x1, SHOP_DOOR[1], FL + step, { name: 'step' });
  H.box('homeFloor', FAMILY.x1 - 0.28, SHOP_DOOR[0], FL + step, FAMILY.x1, SHOP_DOOR[1], FL + 2 * step, { name: 'step' });

  /* Pale blue grey walls, the checkerboard floor. */
  roomFaces(H, 'homeWallBlue', g, FG, CEIL_LOW, { s: [GARAGE_DOOR], w: [door] });
  H.floor('homeWhite', g.x0, g.y0, g.x1, g.y1, FG);
  const cols = 9;
  const rows = 19;
  const tw = (g.x1 - g.x0) / cols;
  const th = (g.y1 - g.y0) / rows;
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      if ((i + j) % 2) {
        H.floor('homeShutter', g.x0 + i * tw, g.y0 + j * th, g.x0 + (i + 1) * tw, g.y0 + (j + 1) * th, FG + 0.002);
      }
    }
  }

  /* The door, open, its panel up under the ceiling on its rails. */
  H.box('homeTrim', GARAGE_DOOR[0] + 0.05, g.y0 + 0.05, 1.98, GARAGE_DOOR[1] - 0.05, g.y0 + 2.05, 2.04, { name: 'garage door' });
  for (const x of [GARAGE_DOOR[0] + 0.02, GARAGE_DOOR[1] - 0.02]) {
    H.paint('homeSteel', x - 0.03, g.y0, 1.95, x + 0.03, g.y0 + 2.2, 1.98);
  }

  /* EAST WALL: pegboard over three shelves of bins, the whole run solid as
   * one block, which is what a wall of shelving is to a craft. */
  const sx0 = g.x1 - 0.38;
  H.hidden(sx0, 0.7, FG, g.x1, 7.6, CEIL_LOW, 'obstacle', 'shelving');
  H.paint('homeWicker', g.x1 - 0.012, 0.7, 0.9, g.x1, 7.6, 2.05);
  for (const h of [0.85, 1.45, 2.0]) {
    H.paint('homeWood', sx0, 0.7, h - 0.04, g.x1, 7.6, h);
  }
  const bins = ['homePlay', 'homePlayBlue', 'homeBook', 'homeTeal', 'homeWhite', 'homeShelf', 'homeSteel'];
  let k = 0;
  for (const h of [0, 0.85, 1.45]) {
    for (let y = 0.8; y < 7.4; k += 1) {
      const w = 0.3 + ((k * 37) % 23) / 100;
      const t = h === 0 ? 0.55 + ((k * 13) % 20) / 100 : 0.2 + ((k * 17) % 30) / 100;
      H.paint(bins[k % bins.length], sx0 + 0.03, y, h, g.x1 - 0.04, Math.min(y + w, 7.5), h + t);
      y += w + 0.06;
    }
  }

  /* WEST WALL: the Infinity Loops banner near the door, the totes under it,
   * a flag by the door down to the basement (./index.js prints the banner;
   * this is its board). */
  H.paint('homeShelf', g.x0, 1.3, 1.0, g.x0 + 0.01, 3.8, 1.88);
  H.box('homeSteel', g.x0, g.y0, FG, g.x0 + 0.5, 1.65, 0.72, { name: 'totes', kind: 'obstacle' });
  for (const h of [0.24, 0.48]) {
    H.paint('homeShelf', g.x0 + 0.5, g.y0, h - 0.02, g.x0 + 0.505, 1.65, h);
  }
  H.box('homeWood', g.x0, g.y0, 0.72, g.x0 + 0.46, 0.7, 0.98, { name: 'box', kind: 'obstacle' });

  /* BACK WALL: the bench on two white bases, the sticker wall over it, the
   * TV, the yellow sign (./index.js prints all three). */
  H.box('homeWood', g.x0, 7.65, 0.88, 17.4, g.y1, 0.93, { name: 'bench', kind: 'obstacle' });
  H.box('homeWhite', g.x0, 7.7, FG, 15.05, g.y1, 0.88, { name: 'bench base', kind: 'obstacle' });
  H.box('homeWhite', 16.55, 7.7, FG, 17.35, g.y1, 0.88, { name: 'bench base', kind: 'obstacle' });
  H.paint('homeShelf', 14.25, g.y1 - 0.01, 0.98, 16.55, g.y1, 1.98);
  H.paint('homeShelf', 16.65, g.y1 - 0.05, 1.3, 17.55, g.y1, 1.85);
  H.paint('homeScreen', 16.7, g.y1 - 0.055, 1.34, 17.5, g.y1 - 0.05, 1.81);
  for (const [x, m] of [[14.6, 'homePlay'], [15.2, 'homePlayBlue'], [15.8, 'homeBook'], [16.3, 'homeTeal']]) {
    H.paint(m, x - 0.12, 7.75, 0.93, x + 0.12, 7.95, 1.05 + (x % 0.3));
  }

  /* The quads on their shelf across the ceiling, the shelf hung on rods. */
  H.box('homeWhite', g.x0, 3.6, 1.6, g.x1, 4.1, 1.68, { name: 'drone shelf' });
  H.paint('homeWhite', g.x0, 3.57, 1.52, g.x1, 3.6, 1.68);
  for (const x of [g.x0 + 0.3, g.x1 - 0.3]) {
    H.post('homeSteel', x, 3.85, 1.68, CEIL_LOW, 0.012, { solid: false, seg: 4 });
  }
  const qm = ['homeShelf', 'homeHedge', 'homePlay', 'homeShelf', 'homePlayBlue', 'homeShelf', 'homeHedge'];
  for (let i = 0; i < 7; i += 1) {
    quadOn(H, g.x0 + 0.4 + i * 0.5, 3.85, 1.68, qm[i]);
  }

  /* The floor's things: the cube to fly through, the trampoline on its
   * side, the red ride on, the orange light and the shop lights. The cube
   * stands where the hoop stood and Santa is gone (the owner, 2026-10-21,
   * "replace the hoop in the garage with the cube to fly", "remove the
   * santa"). */
  cube(H, GARAGE_GATE);
  H.cyl('homeTeal', [g.x1 - 0.32, 1.2, 0.62], [g.x1 - 0.22, 1.2, 0.62], 0.55, 16);
  H.hidden(g.x1 - 0.34, 0.65, FG, g.x1, 1.75, 1.18, 'obstacle', 'trampoline');
  H.box('homePlay', 16.72, 2.15, FG, sx0, 2.8, 0.62, { name: 'ride on', kind: 'obstacle' });
  for (const x of [16.77, 17.37]) {
    H.cap('homeShelf', [x, 2.2, 0.6], [x, 1.95, 1.0], 0.015, { solid: false, seg: 4 });
  }
  H.paint('homePlay', 15.3, 2.4, CEIL_LOW - 0.02, 16.4, 3.0, CEIL_LOW);
  for (const y of [5.0, 7.0]) {
    H.paint('homeLamp', 15.2, y - 0.08, CEIL_LOW - 0.03, 16.6, y + 0.08, CEIL_LOW);
  }
}

/* ------------------------------------------------------------------ */
/* The basement                                                        */
/* ------------------------------------------------------------------ */

function basement(H) {
  const f = FAMILY;
  H.floor('homeFloor', f.x0, f.y0, f.x1 - 0.1, f.y1, FL);
  /* Two slim white posts under a beam that runs front to back. */
  for (const y of [2.0, 5.6]) {
    H.post('homeWhite', 11.4, y, FL, 1.85, 0.055, { seg: 10 });
  }
  H.box('homeWallIn', 11.3, f.y0, 1.85, 11.5, f.y1, CEIL_LOW, { name: 'beam' });
  for (const [x, y] of [[9.9, 3.2], [9.9, 6.5], [12.6, 2.2], [12.6, 5.7]]) {
    H.paint('homeLamp', x - 0.09, y - 0.09, CEIL_LOW - 0.012, x + 0.09, y + 0.09, CEIL_LOW);
  }
  /* West wall, south to north: the TV on its white stand right of the
   * stair, a dark dresser, the olive couch to the north wall. */
  H.box('homeWhite', f.x0, 2.7, FL, 9.2, 4.3, FL + 0.5, { name: 'tv stand', kind: 'obstacle' });
  H.box('homeShelf', f.x0, 2.95, FL + 0.5, f.x0 + 0.16, 4.05, FL + 1.22, { name: 'tv', kind: 'obstacle' });
  H.paint('homeScreen', f.x0 + 0.16, 3.0, FL + 0.55, f.x0 + 0.165, 4.0, FL + 1.17);
  H.box('homeShelf', f.x0, 4.3, FL, 9.3, 5.4, FL + 0.82, { name: 'dresser', kind: 'obstacle' });
  H.paint('homeWhite', f.x0 + 0.1, 4.5, FL + 0.82, f.x0 + 0.45, 4.85, FL + 1.1);
  H.box('homeWallGreen', f.x0, 5.4, FL, 9.75, f.y1, FL + 0.45, { name: 'couch', kind: 'obstacle' });
  H.box('homeWallGreen', f.x0, 5.4, FL + 0.45, f.x0 + 0.25, f.y1, FL + 0.95, { name: 'couch back', kind: 'obstacle' });
  H.box('homeWallGreen', 9.75, 7.2, FL, 10.35, f.y1, FL + 0.45, { name: 'chaise', kind: 'obstacle' });
  H.paint('homePlay', 9.0, 6.3, FL + 0.45, 9.5, 6.75, FL + 0.62);
  /* North wall: the black cabinet, the computer desk under its hutch, a
   * present either side of the desk's chair. */
  H.box('homeShutter', 10.35, 7.65, FL, 11.25, f.y1, FL + 1.85, { name: 'cabinet', kind: 'obstacle' });
  desk(H, 11.25, 7.65, f.x1, f.y1);
  for (const [x0, x1] of [[11.3, 11.7], [13.25, 13.7]]) {
    H.box('homePlay', x0, 7.15, FL, x1, 7.65, FL + 0.5, { name: 'present', kind: 'obstacle' });
    H.paint('homeWhite', x0 - 0.01, 7.38, FL, x1 + 0.01, 7.42, FL + 0.51);
    H.paint('homeWhite', (x0 + x1) / 2 - 0.02, 7.14, FL, (x0 + x1) / 2 + 0.02, 7.66, FL + 0.51);
  }
  /* The punching bag hung from the ceiling, the cube, the red Christmas
   * tree by the closet doors and its presents. */
  H.post('homeShutter', 10.7, 6.2, FL + 0.55, FL + 1.6, 0.18, { kind: 'obstacle', seg: 10 });
  H.post('homeSteel', 10.7, 6.2, FL + 1.6, CEIL_LOW, 0.01, { solid: false, seg: 4 });
  cube(H, FAMILY_GATE);
  H.cone('homePlay', 11.0, 0.75, FL + 0.1, 0.42, 1.55);
  H.post('homePlay', 11.0, 0.75, FL, FL + 1.1, 0.24, { kind: 'tree', solid: true, draw: false });
  H.paint('homePlay', 10.55, 1.0, FL, 10.95, 1.35, FL + 0.32);
}

/*
 * The computer desk on the basement's north wall, x0..x1 along it and y0
 * out from the wall to y1 on it: a desk with a hutch in the stills, the
 * owner's "the computer desk in the basement needs some detail" of
 * 2026-10-21. Two pedestals of drawers, the top, the tower in the knee
 * hole and the black chair tucked in on its star base; on the top a wide
 * monitor, the keyboard and mouse, a radio and goggles, a mug and the
 * lamp; the hutch's shelves over it with what was on them and books.
 *
 * THE WINDOW behind it (BASEMENT_BACK's second) is a way in, so nothing
 * stands in it: the monitor, the lamp and the chair are either side, only
 * the radio, the goggles and the mug sit low in front of it, and the
 * hutch has no back and its lower shelf is over the window's head.
 *
 * SOLID it is one block to the top with the chair's back on its front,
 * because a tucked in chair and its desk are one block (../house/house.js
 * says why), and a knee hole left open round a chair is a slot the slot
 * rule refuses. Everything else is paint, in colours the house already
 * draws, so it is drawn in batches the house already has: no draw call.
 */
function desk(H, x0, y0, x1, y1) {
  const win = BASEMENT_BACK[1];
  const top = FL + 0.76;
  const under = top - 0.04;
  const knee = [11.85, 13.3];
  const cx = 12.95;
  H.hidden(x0, y0, FL, x1, y1, top, 'obstacle', 'desk');
  H.hidden(cx - 0.23, 7.45, FL, cx + 0.23, y0, FL + 1.06, 'obstacle', 'desk chair');

  /* The pedestals, their drawers' seams and pulls, the knee hole's back. */
  for (const [a, b] of [[x0, knee[0]], [knee[1], x1]]) {
    H.paint('homeShelf', a, y0, FL, b, y1, under);
    H.paint('homeShutter', a, y0 - 0.006, FL, b, y0, FL + 0.05);
    for (const h of [0.26, 0.48]) {
      H.paint('homeShutter', a + 0.02, y0 - 0.006, FL + h, b - 0.02, y0, FL + h + 0.012);
    }
    for (const h of [0.17, 0.39, 0.61]) {
      H.paint('homeSteel', (a + b) / 2 - 0.07, y0 - 0.02, FL + h, (a + b) / 2 + 0.07, y0, FL + h + 0.02);
    }
  }
  H.paint('homeShelf', knee[0], y1 - 0.03, FL + 0.3, knee[1], y1, under);
  H.paint('homeWood', x0, y0 - 0.02, under, x1, y1, top);

  /* The tower against the left pedestal, its fans' glow and its button. */
  const tw = knee[0] + 0.03;
  H.paint('homeShutter', tw, y0 + 0.05, FL, tw + 0.2, y1 - 0.05, FL + 0.46);
  H.paint('homeTeal', tw + 0.05, y0 + 0.045, FL + 0.1, tw + 0.15, y0 + 0.05, FL + 0.38);
  H.paint('homeLamp', tw + 0.09, y0 + 0.045, FL + 0.41, tw + 0.11, y0 + 0.05, FL + 0.43);

  /* The chair, facing the desk: seat, back and arms, its column and the
   * five legs of its base. */
  const cy = 7.75;
  H.paint('homeShutter', cx - 0.23, 7.52, FL + 0.44, cx + 0.23, 7.98, FL + 0.51);
  H.paint('homeShutter', cx - 0.22, 7.46, FL + 0.56, cx + 0.22, 7.52, FL + 1.06);
  H.paint('homeSteel', cx - 0.03, 7.47, FL + 0.48, cx + 0.03, 7.51, FL + 0.56);
  for (const s of [-1, 1]) {
    H.paint('homeShutter', cx + s * 0.25 - 0.02, 7.55, FL + 0.66, cx + s * 0.25 + 0.02, 7.85, FL + 0.69);
    H.paint('homeSteel', cx + s * 0.25 - 0.012, 7.68, FL + 0.51, cx + s * 0.25 + 0.012, 7.71, FL + 0.66);
  }
  H.post('homeSteel', cx, cy, FL + 0.07, FL + 0.44, 0.025, { seg: 6, solid: false });
  const SC = { s: 0, c: 1 };
  for (let k = 0; k < 5; k += 1) {
    sincos((2 * Math.PI * k) / 5 + Math.PI / 2, SC);
    const ex = cx + 0.28 * SC.c;
    const ey = cy + 0.28 * SC.s;
    H.cap('homeShutter', [cx, cy, FL + 0.07], [ex, ey, FL + 0.05], 0.018, { seg: 4, solid: false, name: 'chair base' });
    H.paint('homeShutter', ex - 0.025, ey - 0.025, FL, ex + 0.025, ey + 0.025, FL + 0.04);
  }

  /* On the top, east of the window: the monitor on its stand, the
   * keyboard and its keys, the mouse on its mat. */
  const ma = win[1] + 0.08;
  const mb = x1 - 0.15;
  const mid = (ma + mb) / 2;
  H.paint('homeShutter', mid - 0.12, 8.05, top, mid + 0.12, 8.25, top + 0.012);
  H.paint('homeShutter', mid - 0.025, 8.17, top, mid + 0.025, 8.2, top + 0.12);
  H.paint('homeShutter', ma, 8.12, top + 0.1, mb, 8.17, top + 0.48);
  H.paint('homeScreen', ma + 0.015, 8.114, top + 0.115, mb - 0.015, 8.12, top + 0.465);
  H.paint('homeShutter', mid - 0.27, 7.76, top, mid + 0.23, 7.92, top + 0.018);
  H.paint('homeSteel', mid - 0.25, 7.775, top + 0.018, mid + 0.09, 7.905, top + 0.024);
  H.paint('homeSteel', mid + 0.11, 7.775, top + 0.018, mid + 0.21, 7.905, top + 0.024);
  H.paint('homeRug', x1 - 0.24, 7.75, top, x1 - 0.04, 7.98, top + 0.004);
  H.paint('homeWhite', x1 - 0.165, 7.82, top + 0.004, x1 - 0.115, 7.9, top + 0.03);
  /* Low in front of the window: the radio, its two sticks and its aerial,
   * the goggles beside it, the mug. */
  const r = win[0] + 0.1;
  H.paint('homeShutter', r, 7.74, top, r + 0.24, 7.92, top + 0.06);
  for (const x of [r + 0.06, r + 0.18]) {
    H.post('homeSteel', x, 7.83, top + 0.06, top + 0.11, 0.006, { seg: 4, solid: false });
  }
  H.post('homeShutter', r + 0.12, 7.9, top + 0.06, top + 0.14, 0.008, { seg: 4, solid: false });
  H.paint('homeShutter', r + 0.3, 7.98, top, r + 0.56, 8.1, top + 0.08);
  H.paint('homeSteel', r + 0.3, 8.1, top + 0.02, r + 0.56, 8.18, top + 0.035);
  H.post('homeWhite', win[1] - 0.18, 7.84, top, top + 0.1, 0.04, { seg: 8, solid: false });
  /* The lamp on its arm at the west end, west of the window. */
  const lx = x0 + 0.12;
  H.paint('homeShutter', lx - 0.07, 8.08, top, lx + 0.07, 8.22, top + 0.02);
  H.post('homeSteel', lx, 8.15, top + 0.02, top + 0.42, 0.01, { seg: 4, solid: false });
  H.cap('homeShutter', [lx, 8.15, top + 0.42], [lx, 7.97, top + 0.36], 0.035, { seg: 6, solid: false, name: 'lamp' });
  H.paint('homeLamp', lx - 0.03, 7.95, top + 0.32, lx + 0.03, 8.0, top + 0.325);

  /* The hutch: its two sides, two shelves over the window's head and a
   * cap; on the shelves what was there before, and a row of books. */
  const hutch = FL + 1.85;
  for (const [a, b] of [[x0, x0 + 0.04], [x1 - 0.04, x1]]) {
    H.paint('homeShelf', a, 7.98, top, b, y1, hutch);
  }
  for (const h of [1.48, 1.7]) {
    H.paint('homeWood', x0 + 0.04, 7.98, FL + h, x1 - 0.04, y1, FL + h + 0.03);
  }
  H.paint('homeWood', x0, 7.96, hutch, x1, y1, hutch + 0.03);
  for (const [x, m] of [[11.9, 'homePlayBlue'], [12.4, 'homeBook'], [12.9, 'homeTeal'], [13.3, 'homePlay']]) {
    H.paint(m, x - 0.15, 8.05, FL + 1.51, x + 0.15, y1, FL + 1.66);
  }
  const books = ['homeBook', 'homePlayBlue', 'homePlay', 'homeTeal', 'homeWhite', 'homeBook', 'homePlay'];
  for (let i = 0; i < books.length; i += 1) {
    const x = 11.45 + i * 0.07;
    H.paint(books[i], x, 8.04, FL + 1.73, x + 0.055, y1, FL + 1.8 + (i % 3) * 0.015);
  }
}

/* ------------------------------------------------------------------ */
/* The main floor                                                      */
/* ------------------------------------------------------------------ */

/* Four legs under a top that covers x0..x1, y0..y1, from h0 up to h1:
 * square, `t` thick, `inset` in from its edges. Drawn only; whatever they
 * hold up is solid on its own. */
function legs(H, m, x0, y0, x1, y1, h0, h1, t, inset) {
  for (const x of [x0 + inset, x1 - inset - t]) {
    for (const y of [y0 + inset, y1 - inset - t]) {
      H.paint(m, x, y, h0, x + t, y + t, h1);
    }
  }
}

function mainFloor(H) {
  const m = MAIN;
  /* Living room and dining room in oak, the foyer and kitchen tiled. */
  H.floor('homeFloor', m.x0, m.y0, 6.4, 4.25, FM);
  H.floor('homeFloor', m.x0, 4.25, 4.55, m.y1, FM);
  H.floor('homeTile', 6.4, m.y0, m.x1, 4.25, FM);
  H.floor('homeTile', 4.55, 4.25, m.x1, m.y1, FM);
  /* The wall across the middle, open to the dining room and the kitchen.
   * The living room is open to the foyer: there is no wall between them
   * (the owner, 2026-10-21, "this wall in heads house doesn't exist"). */
  const wide = [1.2, 3.6, FM, FM + 2.2];
  const kit = [6.6, 8.3, FM, FM + 2.2];
  H.wall('x', 4.25, m.x0, m.x1, FM, CEIL_MAIN, { holes: [wide, kit] });
  casing(H, 'x', 4.25, wide[0], wide[1], FM, 2.2);
  casing(H, 'x', 4.25, kit[0], kit[1], FM, 2.2);
  roomFaces(H, 'homeWallCream', { x0: m.x0, x1: m.x1 - 0.06, y0: m.y0, y1: 4.19 }, FM, CEIL_MAIN, { s: [DOUBLE_WIN, FRONT_DOOR], w: WEST_WINS.filter((w) => w[1] < 4.2), n: [wide, kit], e: false });
  /* Living: the sofa on the west wall, a low table, the TV on the wall
   * across the middle between its two openings, an armchair under the
   * window. */
  H.box('homeSofa', m.x0, 1.1, FM, 1.1, 3.4, FM + 0.45, { name: 'sofa', kind: 'obstacle' });
  H.box('homeSofa', m.x0, 1.1, FM + 0.45, m.x0 + 0.25, 3.4, FM + 0.9, { name: 'sofa back', kind: 'obstacle' });
  H.paint('homeRug', 1.5, 1.4, FM, 3.6, 3.2, FM + 0.008);
  H.box('homeShelf', 1.9, 1.75, FM, 2.9, 2.85, FM + 0.42, { name: 'table', kind: 'obstacle' });
  H.box('homeShelf', 4.0, 3.85, FM, 5.9, 4.19, FM + 0.55, { name: 'tv unit', kind: 'obstacle' });
  H.box('homeShelf', 4.2, 4.09, FM + 0.55, 5.7, 4.19, FM + 1.3, { name: 'tv', kind: 'obstacle' });
  H.paint('homeScreen', 4.25, 4.08, FM + 0.6, 5.65, 4.09, FM + 1.25);
  /* The armchair: one solid as it was, drawn as a seat, a back to the
   * window, two arms and four short legs. */
  H.hidden(3.6, m.y0, FM, 4.4, 0.95, FM + 0.8, 'obstacle', 'armchair');
  H.paint('homeCushion', 3.6, m.y0, FM + 0.1, 4.4, 0.95, FM + 0.45);
  H.paint('homeCushion', 3.6, m.y0, FM + 0.45, 4.4, m.y0 + 0.2, FM + 0.8);
  for (const [a, b] of [[3.6, 3.74], [4.26, 4.4]]) {
    H.paint('homeCushion', a, m.y0 + 0.2, FM + 0.45, b, 0.95, FM + 0.64);
  }
  legs(H, 'homeWood', 3.6, m.y0, 4.4, 0.95, FM, FM + 0.1, 0.05, 0.03);
  /* Dining: the table and its chairs as one block. */
  H.box('homeWood', 1.6, 5.6, FM + 0.7, 3.2, 6.6, FM + 0.75, { name: 'table' });
  H.hidden(1.2, 5.2, FM, 3.6, 7.0, FM + 0.75, 'obstacle', 'table and chairs');
  /* Legs under the table and every chair, drawn: the block above is what
   * a craft meets (the owner, 2026-10-21, "the chairs in the house need
   * legs"). */
  legs(H, 'homeWood', 1.6, 5.6, 3.2, 6.6, FM, FM + 0.7, 0.06, 0.05);
  for (const [x, y] of [[1.9, 5.35], [2.9, 5.35], [1.9, 6.85], [2.9, 6.85]]) {
    H.paint('homeWood', x - 0.2, y - 0.15, FM + 0.44, x + 0.2, y + 0.15, FM + 0.48);
    H.paint('homeWood', x - 0.2, y < 6 ? y - 0.15 : y + 0.11, FM + 0.48, x + 0.2, y < 6 ? y - 0.11 : y + 0.15, FM + 0.95);
    legs(H, 'homeWood', x - 0.2, y - 0.15, x + 0.2, y + 0.15, FM, FM + 0.44, 0.035, 0.015);
  }
  /* Kitchen: counters on the shared wall and the back wall, the fridge,
   * the cabinets over them, the sink under the window. */
  H.box('homeCabinet', 7.9, 4.95, FM, m.x1, 7.7, FM + 0.88, { name: 'counter', kind: 'obstacle' });
  H.box('homeCabinet', 4.75, 7.7, FM, m.x1, m.y1, FM + 0.88, { name: 'counter', kind: 'obstacle' });
  H.paint('homeCounter', 7.88, 4.95, FM + 0.88, m.x1, 7.7, FM + 0.92);
  H.paint('homeCounter', 4.73, 7.68, FM + 0.88, m.x1, m.y1, FM + 0.92);
  H.box('homeSteel', 7.85, 4.31, FM, m.x1, 4.95, FM + 1.8, { name: 'fridge', kind: 'obstacle' });
  H.box('homeCabinet', 8.15, 5.0, FM + 1.45, m.x1, 7.7, CEIL_MAIN, { name: 'cabinets', kind: 'obstacle' });
  H.paint('homeSteel', 5.85, 7.9, FM + 0.92, 6.55, 8.2, FM + 0.93);
  roomFaces(H, 'homeWallCream', { x0: 4.55, x1: m.x1, y0: 4.31, y1: m.y1 }, FM, CEIL_MAIN, { s: [kit], n: [KITCHEN_WIN], w: false, e: false });
  for (const [x, y] of [[3.3, 2.2], [3.3, 6.2], [7.0, 6.2]]) {
    H.paint('homeLamp', x - 0.15, y - 0.15, CEIL_MAIN - 0.02, x + 0.15, y + 0.15, CEIL_MAIN);
  }
}

/* ------------------------------------------------------------------ */
/* Upstairs                                                            */
/* ------------------------------------------------------------------ */

function upstairs(H) {
  const u = UPPER;
  H.floor('homeCarpet', STAIR_X1, u.y0, u.x1, u.y1, FU);
  H.floor('homeCarpet', u.x0, WELL.y1, STAIR_X1, u.y1, FU);
  /* The main bedroom across the front over the garage, its door off the
   * landing; the hall behind it; the bath and two bedrooms at the back. */
  const bedDoor = [2.9, 3.75, FU, FU + DOOR_H];
  H.wall('y', 11.85, u.y0, 4.0, FU, CEIL_UP, { holes: [bedDoor] });
  casing(H, 'y', 11.85, bedDoor[0], bedDoor[1], FU);
  H.wall('x', 4.0, 11.85, u.x1, FU, CEIL_UP);
  const backDoors = [[9.5, 10.3], [12.4, 13.2], [15.6, 16.4]].map(([a, b]) => [a, b, FU, FU + DOOR_H]);
  H.wall('x', 5.15, u.x0, u.x1, FU, CEIL_UP, { holes: backDoors });
  for (const d of backDoors) {
    casing(H, 'x', 5.15, d[0], d[1], FU);
  }
  H.wall('y', 11.25, 5.15, u.y1, FU, CEIL_UP);
  H.wall('y', 14.55, 5.15, u.y1, FU, CEIL_UP);
  /* The linen closet north of the stairwell. */
  H.box('homeWallIn', u.x0, WELL.y1, FU, STAIR_X1, 3.9, CEIL_UP, { name: 'linen closet' });
  roomFaces(H, 'homeWallKids', { x0: 14.61, x1: u.x1, y0: 5.21, y1: u.y1 }, FU, CEIL_UP, { s: [backDoors[2]], n: [UP_BACK[2]], e: [UP_EAST[1]] });
  roomFaces(H, 'homeWallBlue', { x0: 11.91, x1: u.x1, y0: u.y0, y1: 3.94 }, FU, CEIL_UP, { s: [UP_FRONT[1], UP_FRONT[2]], w: [bedDoor], e: [UP_EAST[0]] });
  /* The main bedroom: the bed's head on the hall wall, nightstands, a
   * dresser on the east wall. */
  H.box('homeShelf', 14.15, 3.85, FU, 15.85, 3.94, FU + 1.05, { name: 'headboard', kind: 'obstacle' });
  H.box('homeWhite', 14.2, 1.8, FU, 15.8, 3.85, FU + 0.55, { name: 'bed', kind: 'obstacle' });
  H.paint('homeRug', 14.19, 1.79, FU + 0.4, 15.81, 3.0, FU + 0.58);
  for (const x of [13.75, 16.25]) {
    H.box('homeShelf', x - 0.4, 3.45, FU, x + 0.4, 3.94, FU + 0.55, { name: 'nightstand', kind: 'obstacle' });
  }
  H.box('homeShelf', 17.3, 0.5, FU, u.x1, 1.6, FU + 0.85, { name: 'dresser', kind: 'obstacle' });
  /* Two small bedrooms: a bed each on the back wall, a toy chest. */
  for (const [x, m] of [[12.6, 'homeWhite'], [16.1, 'homeBook']]) {
    H.box(m, x - 0.5, 6.3, FU, x + 0.5, u.y1, FU + 0.5, { name: 'bed', kind: 'obstacle' });
    H.box('homeShelf', x - 0.5, u.y1 - 0.06, FU, x + 0.5, u.y1, FU + 0.95, { name: 'headboard', kind: 'obstacle' });
  }
  H.box('homePlay', 13.6, 7.6, FU, 14.49, u.y1, FU + 0.45, { name: 'toy chest', kind: 'obstacle' });
  /* The bath: a tub on the back wall, the toilet, the vanity. */
  H.box('homeWhite', u.x0, 7.55, FU, 10.3, u.y1, FU + 0.55, { name: 'tub', kind: 'obstacle' });
  H.box('homeWhite', 10.75, 7.75, FU, 11.19, u.y1, FU + 0.42, { name: 'toilet', kind: 'obstacle' });
  H.box('homeCabinet', u.x0, 5.21, FU, 9.4, 6.2, FU + 0.85, { name: 'vanity', kind: 'obstacle' });
  for (const [x, y] of [[15.0, 2.0], [12.9, 6.7], [16.2, 6.7], [11.0, 4.6]]) {
    H.paint('homeLamp', x - 0.15, y - 0.15, CEIL_UP - 0.02, x + 0.15, y + 0.15, CEIL_UP);
  }
}

/* ------------------------------------------------------------------ */
/* The yard                                                            */
/* ------------------------------------------------------------------ */

/* A fence along a line, posts and rails: ../house/house.js's, white. */
function fence(H, dir, at, a0, a1, h, m = 'homeTrim') {
  const t = 0.06;
  if (dir === 'x') {
    H.box(m, a0, at - t / 2, 0, a1, at + t / 2, h, { name: 'fence' });
  } else {
    H.box(m, at - t / 2, a0, 0, at + t / 2, a1, h, { name: 'fence' });
  }
  const len = a1 - a0;
  const n = Math.max(1, Math.round(len / 2.44));
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + (len * i) / n;
    if (dir === 'x') {
      H.paint(m, a - 0.065, at - 0.065, 0, a + 0.065, at + 0.065, h + 0.1);
    } else {
      H.paint(m, at - 0.065, a - 0.065, 0, at + 0.065, a + 0.065, h + 0.1);
    }
  }
  for (const s of [-1, 1]) {
    const f = at + s * (t / 2 + 0.003);
    const g = f + s * 0.004;
    if (dir === 'x') {
      H.paint('homeCoping', a0, Math.min(f, g), h - 0.12, a1, Math.max(f, g), h - 0.1);
    } else {
      H.paint('homeCoping', Math.min(f, g), a0, h - 0.12, Math.max(f, g), a1, h - 0.1);
    }
  }
}

/* The stamped patio's outline: square along the back wall, a long curve
 * out to the lawn and round to the west. */
function patioOutline() {
  const pts = [[0.4, MW.y1], [7.9, MW.y1]];
  const SC = { s: 0, c: 1 };
  for (let i = 0; i <= 10; i += 1) {
    sincos((i / 10) * (Math.PI / 2), SC);
    pts.push([4.4 + 3.5 * SC.c, 10.2 + 3.5 * SC.s]);
  }
  for (let i = 0; i <= 8; i += 1) {
    sincos(Math.PI / 2 + (i / 8) * (Math.PI / 2), SC);
    pts.push([2.0 + 2.2 * SC.c, 11.5 + 2.2 * SC.s]);
  }
  return pts;
}

function backYard(H) {
  H.flat('headsPatio', patioOutline(), 0, G_PAVE);
  /* The landing and three steps down from the slider. */
  const steps = [[MW.y1, 9.4, FM - 0.18], [9.4, 9.75, FM - 0.36], [9.75, 10.1, FM - 0.54], [10.1, 10.45, FM - 0.72]];
  for (const [y0, y1, h] of steps) {
    H.box('headsPatio', 1.0, y0, 0, 3.2, y1, h, { name: 'step' });
  }
  /* The covered grill, the AC unit by the corner, the deck box on the
   * lawn. */
  H.box('homeShelf', 3.65, MW.y1, 0, 4.95, 9.3, 1.0, { name: 'grill', kind: 'obstacle' });
  H.box('homeSteel', 7.2, MW.y1, 0, 8.05, 9.35, 0.76, { name: 'ac unit', kind: 'obstacle' });
  H.paint('homeShelf', 7.35, 8.65, 0.76, 7.9, 9.2, 0.77);
  H.box('homeSteel', 7.4, 14.3, 0, 8.8, 15.0, 0.62, { name: 'deck box', kind: 'obstacle' });
  /* The fence round the back yard, white vinyl, a gate west of the house. */
  const FH = 1.83;
  fence(H, 'x', 5.2, -6.4, -3.6, FH);
  fence(H, 'x', 5.2, -2.4, MW.x0, FH);
  fence(H, 'y', -6.4, 5.2, 24.0, FH);
  fence(H, 'x', 24.0, -6.4, 21.3, FH);
  fence(H, 'y', 21.3, 5.2, 24.0, FH);
  fence(H, 'x', 5.2, TS.x1, 21.3, FH);
}

function frontYard(H) {
  /* The stoop: a landing at the door, three steps to the lawn, a black
   * railing down its west side. */
  const stoop = [[-1.2, 0, FM - 0.18], [-1.55, -1.2, FM - 0.36], [-1.9, -1.55, FM - 0.54], [-2.25, -1.9, FM - 0.72]];
  for (const [y0, y1, h] of stoop) {
    H.box('homeFoundation', 6.55, y0, 0, 8.25, y1, h, { name: 'stoop' });
  }
  for (const y of [-2.15, -0.1]) {
    H.post('homeShutter', 6.6, y, y < -1 ? FM - 0.72 : FM - 0.18, FM + 0.75, 0.02, { seg: 5, kind: 'pole' });
  }
  H.cap('homeShutter', [6.6, -2.15, FM + 0.2], [6.6, -0.1, FM + 0.75], 0.022, { seg: 5, kind: 'pole' });
  /* The beds: a boxwood hedge along the wing, grasses and flowers by the
   * stoop; the dark purple shrubs before the two storey part. */
  H.paint('homeMulch', MW.x0, -1.2, 0, 6.55, 0, 0.025);
  for (let x = 0.4; x < 6.1; x += 0.55) {
    H.ball('homeHedge', x, -0.45, 0.42, 0.42);
  }
  for (let i = 0; i < 9; i += 1) {
    const x = 4.4 + i * 0.25;
    for (let k = 0; k < 6; k += 1) {
      H.cap('homeWicker', [x, -0.95, 0], [x + (k - 2.5) * 0.08, -1.05 + (k % 3) * 0.05, 0.55 + (k % 2) * 0.1], 0.012, { solid: false, seg: 3 });
    }
  }
  for (let i = 0; i < 24; i += 1) {
    const x = 0.6 + ((i * 37) % 53) / 10;
    H.paint(i % 3 ? 'homePlayBlue' : 'homeWhite', x - 0.05, -1.1 + (i % 4) * 0.06, 0.03, x + 0.05, -1.0 + (i % 4) * 0.06, 0.11);
  }
  H.paint('homeMulch', TS.x0, -1.0, 0, DRIVE.x0, 0, 0.025);
  H.ball('headsPurple', 9.3, -0.6, 0.6, 0.6);
  H.ball('headsPurple', 12.95, -0.66, 0.42, 0.42);
  /* Stepping stones from the stoop's foot along the front to the drive. */
  for (const x of [9.0, 10.1, 11.2, 12.3]) {
    H.paint('homeDrive', x - 0.32, -1.75, 0, x + 0.32, -1.15, G_PAVE);
  }
  /* The drive, its apron, the low lip where the kerb is cut for it. */
  H.paint('homeAsphalt', DRIVE.x0, LINE_A, 0, DRIVE.x1, TS.y0, G_DRIVE);
  H.paint('homeDrive', DRIVE.x0, KA + KERB_W, 0, DRIVE.x1, LINE_A - WALK, G_PAVE);
  /* The mailbox at the drive's east edge by the walk. */
  H.post('homeShutter', 19.45, -8.6, 0, 1.05, 0.05, { seg: 6, kind: 'pole' });
  H.box('homeShutter', 19.25, -8.85, 1.05, 19.65, -8.35, 1.3, { name: 'mailbox' });
  /* The red Japanese maple past the drive, a boxwood at its foot. */
  H.post('homeWood', 20.2, -5.4, 0, 1.7, 0.12, { seg: 7 });
  for (const [dx, dy, h, r] of [[0, 0, 2.7, 1.2], [0.9, 0.4, 2.4, 0.9], [-0.9, -0.3, 2.5, 0.95], [0.3, -0.9, 2.3, 0.85], [-0.2, 0.9, 2.6, 0.9], [0.1, 0.1, 3.4, 0.8]]) {
    H.ball('headsMaple', 20.2 + dx, -5.4 + dy, h, r);
  }
  /* Its crown reaches out over the walk, as the stills show it (the
   * owner, 2026-10-21, "the red leaf tree should extend its foliage over
   * the footpath"): a limb out from the trunk and four more blobs, high
   * enough that the walk under it is still flown at a metre. */
  H.cap('homeWood', [20.2, -5.6, 1.6], [20.0, -8.0, 2.45], 0.08, { seg: 6 });
  for (const [x, y, h, r] of [
    [20.5, -6.4, 2.8, 1.0], [19.7, -6.9, 2.65, 0.9], [20.3, -7.5, 3.05, 0.95], [19.6, -8.1, 2.8, 0.85],
    [20.5, -8.4, 2.75, 0.85], [20.0, -9.0, 3.1, 0.8], [19.5, -9.6, 2.85, 0.75], [20.4, -9.7, 2.9, 0.7],
  ]) {
    H.ball('headsMaple', x, y, h, r);
  }
  H.ball('homeHedge', 19.4, -6.3, 0.55, 0.55);
}

/* ------------------------------------------------------------------ */
/* The yard's ornaments and the house dressed                          */
/* ------------------------------------------------------------------ */

/*
 * THE YARD LIVED IN, on the owner's ask of 21 October 2026: "lets update
 * heads house, we need yard ornaments and dress the house some what". A
 * family's yard: the kids' trampoline, swing set, soccer goal and wagon, a
 * fire pit and its chairs on the patio under string lights, gnomes and a
 * bird bath, solar lights along the walk, and out front a hoop on the
 * drive, a window box, planters and a mat at the door and the lights by
 * the doors lit.
 *
 * Every colour is one the house already draws, so all of it bakes into the
 * batches the house already has: no draw call is added for any of it (the
 * house's chunk is one batch a colour, ../built/index.js). What a quad can
 * hit is the big, plain things (the trampoline's bed, the swing set's frame,
 * the fire pit and its chairs, the bird bath's column, the hoop's pole and
 * board); the small things are drawn only, so they cannot make a gap the
 * slot rule forbids against a wall a few centimetres away. All of it stays
 * off the lines scripts/heads-check.js flies.
 */
function ornaments(H) {
  /* The trampoline at the back of the lawn: a black bed on a blue pad, six
   * legs. Its bed is solid, a square inside the circle, so a quad lands on
   * it; the round is drawn. */
  const TR = { x: 12.0, y: 20.0, h: 0.85, r: 1.6 };
  H.cyl('homeShutter', [TR.x, TR.y, TR.h - 0.02], [TR.x, TR.y, TR.h], TR.r - 0.2, 16);
  H.cyl('homePlayBlue', [TR.x, TR.y, TR.h - 0.06], [TR.x, TR.y, TR.h - 0.015], TR.r, 16);
  const tr = (TR.r - 0.25) / Math.SQRT2;
  H.box('homeShutter', TR.x - tr, TR.y - tr, TR.h - 0.08, TR.x + tr, TR.y + tr, TR.h - 0.02, { name: 'trampoline', kind: 'obstacle', draw: false });
  for (let i = 0; i < 6; i += 1) {
    const SC = { s: 0, c: 1 };
    sincos((i * Math.PI) / 3, SC);
    const lx = TR.x + (TR.r - 0.1) * SC.c;
    const ly = TR.y + (TR.r - 0.1) * SC.s;
    H.cap('homeSteel', [lx, ly, 0], [lx, ly, TR.h - 0.06], 0.03, { solid: false, seg: 5 });
  }

  /* The swing set past it: an A frame each end, the beam, two swings and
   * a slide. The frame is solid, the swings and their chains drawn. */
  const SW = { x0: 1.5, x1: 4.7, y: 19.6, h: 2.3, splay: 0.9 };
  for (const x of [SW.x0, SW.x1]) {
    for (const s of [-1, 1]) {
      H.cap('homeWood', [x, SW.y + s * SW.splay, 0], [x, SW.y, SW.h], 0.06, { seg: 6, name: 'swing set' });
    }
  }
  H.cap('homeWood', [SW.x0, SW.y, SW.h], [SW.x1, SW.y, SW.h], 0.07, { seg: 6, name: 'swing set' });
  for (const [x, m] of [[2.4, 'homePlay'], [3.7, 'homePlayBlue']]) {
    for (const dx of [-0.22, 0.22]) {
      H.cap('homeSteel', [x + dx, SW.y, SW.h - 0.05], [x + dx, SW.y, 0.5], 0.008, { solid: false, seg: 3 });
    }
    H.paint(m, x - 0.26, SW.y - 0.11, 0.46, x + 0.26, SW.y + 0.11, 0.5);
  }
  /* The slide, green, down from a deck at the east end. */
  H.paint('homeHedge', SW.x1 + 0.05, SW.y - 0.3, 1.2, SW.x1 + 0.65, SW.y + 0.3, 1.26);
  H.prism('homeHedge', 'y', [[SW.x1 + 0.6, 1.26], [SW.x1 + 2.3, 0.08], [SW.x1 + 2.3, 0.02], [SW.x1 + 0.6, 1.2]], SW.y - 0.25, SW.y + 0.25);

  /* The soccer goal on the east lawn, white, and the ball. Drawn only. */
  const GL = { x: 19.8, y0: 13.6, y1: 15.4, h: 1.2, d: 0.8 };
  for (const y of [GL.y0, GL.y1]) {
    H.cap('homeWhite', [GL.x, y, 0], [GL.x, y, GL.h], 0.03, { solid: false, seg: 5 });
    H.cap('homeWhite', [GL.x, y, GL.h], [GL.x + GL.d, y, 0.02], 0.02, { solid: false, seg: 4 });
  }
  H.cap('homeWhite', [GL.x, GL.y0, GL.h], [GL.x, GL.y1, GL.h], 0.03, { solid: false, seg: 5 });
  H.cap('homeWhite', [GL.x + GL.d, GL.y0, 0.02], [GL.x + GL.d, GL.y1, 0.02], 0.02, { solid: false, seg: 4 });
  H.ball('homeWhite', 17.6, 14.9, 0.11, 0.11, { solid: false, seg: 8 });

  /* The kids' red wagon by the swings. Drawn only. */
  H.paint('homePlay', 6.4, 20.9, 0.18, 7.3, 21.4, 0.4);
  for (const [x, y] of [[6.55, 20.85], [7.15, 20.85], [6.55, 21.45], [7.15, 21.45]]) {
    H.cap('homeShutter', [x, y - 0.03, 0.09], [x, y + 0.03, 0.09], 0.09, { solid: false, seg: 6 });
  }
  H.cap('homeShutter', [6.4, 21.15, 0.3], [5.85, 21.15, 0.55], 0.012, { solid: false, seg: 3 });

  /* The fire pit on the patio's round end, a dark ring with its embers
   * lit, three chairs round it. Solid: a block for the pit, one for each
   * chair, far enough apart for the slot rule. */
  const FP = { x: 5.2, y: 12.1 };
  H.cyl('homeShelf', [FP.x, FP.y, 0], [FP.x, FP.y, 0.32], 0.42, 10);
  H.cyl('homePlay', [FP.x, FP.y, 0.3], [FP.x, FP.y, 0.31], 0.32, 10);
  for (const [dx, dy, h] of [[-0.08, 0.02, 0.5], [0.09, -0.05, 0.44], [0.0, 0.1, 0.4]]) {
    H.cone('homeBook', FP.x + dx, FP.y + dy, 0.3, 0.07, h - 0.3);
  }
  H.box('homeShelf', FP.x - 0.3, FP.y - 0.3, 0, FP.x + 0.3, FP.y + 0.3, 0.32, { name: 'fire pit', kind: 'obstacle', draw: false });
  for (const [cx, cy, face] of [[FP.x - 1.25, FP.y, 'e'], [FP.x + 1.25, FP.y, 'w'], [FP.x, FP.y + 1.25, 's']]) {
    adirondack(H, cx, cy, face);
  }

  /* String lights over the patio, from the back wall to two poles at its
   * edge, sagging, a bulb every half metre. Drawn only; the poles are
   * solid. */
  const poles = [[0.0, 10.6], [7.6, 13.4]];
  for (const [x, y] of poles) {
    H.post('homeShutter', x, y, 0, 2.7, 0.04, { seg: 5, kind: 'pole', name: 'light pole' });
  }
  const strands = [
    [[1.2, MW.y1 + 0.05, 2.75], [0.0, 10.6, 2.65]],
    [[4.2, MW.y1 + 0.05, 2.75], [7.6, 13.4, 2.65]],
    [[0.0, 10.6, 2.65], [7.6, 13.4, 2.65]],
  ];
  for (const [a, b] of strands) {
    stringLight(H, a, b, 0.35);
  }

  /* The gnomes: red hats, blue coats, white beards, round the patio and
   * by the deck box. Drawn only. */
  for (const [x, y] of [[8.3, 13.7], [0.2, 13.9], [9.1, 15.1]]) {
    gnome(H, x, y);
  }

  /* The bird bath by the back fence, its bowl full. The column is solid. */
  const BB = { x: -2.2, y: 19.0 };
  H.post('homeFoundation', BB.x, BB.y, 0, 0.7, 0.08, { seg: 6, kind: 'pole', name: 'bird bath' });
  H.cyl('homeFoundation', [BB.x, BB.y, 0.66], [BB.x, BB.y, 0.78], 0.32, 10);
  H.cyl('homeTeal', [BB.x, BB.y, 0.78], [BB.x, BB.y, 0.785], 0.26, 10);
  H.cyl('homeFoundation', [BB.x, BB.y, 0], [BB.x, BB.y, 0.08], 0.2, 8);

  /* Solar lights along the stepping stones and the patio's edge. */
  for (const [x, y] of [[8.6, -2.05], [9.7, -2.05], [10.8, -2.05], [11.9, -2.05], [0.2, 9.6], [0.2, 11.4], [8.2, 9.6], [8.2, 11.4]]) {
    H.post('homeShutter', x, y, 0, 0.32, 0.015, { solid: false, seg: 4 });
    H.paint('homeLamp', x - 0.04, y - 0.04, 0.32, x + 0.04, y + 0.04, 0.38);
    H.paint('homeShutter', x - 0.05, y - 0.05, 0.38, x + 0.05, y + 0.05, 0.4);
  }
}

/* An Adirondack chair at (x, y) facing `face`, white: a solid block where
 * it stands, drawn as a seat on four legs, the back and the wide arms. */
function adirondack(H, x, y, face) {
  const W = 0.36;
  const D = 0.38;
  /* Plan offsets along the chair's own front (f) and side (s). */
  const at = (f, s) => {
    if (face === 'e') return [x + f, y + s];
    if (face === 'w') return [x - f, y - s];
    return [x + s, y - f];
  };
  const rect = (f0, s0, f1, s1) => {
    const [ax, ay] = at(f0, s0);
    const [bx, by] = at(f1, s1);
    return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
  };
  const [sx0, sy0, sx1, sy1] = rect(-D, -W, D, W);
  H.hidden(sx0, sy0, 0, sx1, sy1, 0.38, 'obstacle', 'chair');
  H.paint('homeWhite', sx0, sy0, 0.34, sx1, sy1, 0.38);
  legs(H, 'homeWhite', sx0, sy0, sx1, sy1, 0, 0.34, 0.05, 0.02);
  const [bx0, by0, bx1, by1] = rect(-D - 0.12, -W, -D, W);
  H.paint('homeWhite', bx0, by0, 0.38, bx1, by1, 0.95);
  for (const s of [-1, 1]) {
    const [ax0, ay0, ax1, ay1] = rect(-D, s > 0 ? W : -W - 0.1, D + 0.06, s > 0 ? W + 0.1 : -W);
    H.paint('homeWhite', ax0, ay0, 0.58, ax1, ay1, 0.62);
    const [px0, py0, px1, py1] = rect(D - 0.04, s > 0 ? W + 0.02 : -W - 0.06, D, s > 0 ? W + 0.06 : -W - 0.02);
    H.paint('homeWhite', px0, py0, 0, px1, py1, 0.58);
  }
}

/* A strand of lights from a to b, plan points, sagging `sag` in the
 * middle: six straight runs and a lit bulb every half metre. */
function stringLight(H, a, b, sag) {
  const pt = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 4 * sag * t * (1 - t)];
  const RUNS = 6;
  for (let i = 0; i < RUNS; i += 1) {
    H.cap('homeShutter', pt(i / RUNS), pt((i + 1) / RUNS), 0.006, { solid: false, seg: 3 });
  }
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(len / 0.5));
  for (let i = 1; i < n; i += 1) {
    const [x, y, h] = pt(i / n);
    H.paint('homeLamp', x - 0.03, y - 0.03, h - 0.09, x + 0.03, y + 0.03, h - 0.02);
  }
}

/* A garden gnome at (x, y): boots, a blue coat, a white beard, a pink face
 * and a tall red hat. Drawn only. */
function gnome(H, x, y) {
  H.paint('homeShutter', x - 0.07, y - 0.05, 0, x + 0.07, y + 0.05, 0.04);
  H.ball('homePlayBlue', x, y, 0.14, 0.1, { solid: false, seg: 6 });
  H.ball('homeWhite', x, y - 0.03, 0.24, 0.07, { solid: false, seg: 6 });
  H.ball('homeCushion', x, y, 0.3, 0.06, { solid: false, seg: 6 });
  H.cone('homePlay', x, y, 0.33, 0.075, 0.2);
}

/*
 * THE HOUSE DRESSED, out front: a window box of flowers under the living
 * room's window, two planters and a mat at the front door, the porch light
 * and the garage's two lanterns lit, downspouts at the corners, and a
 * basketball hoop at the head of the drive (its pole and board solid, the
 * rim and net drawn, so a quad can drop through the hoop).
 */
function dressing(H) {
  /* The window box, on brackets, a row of flowers in it. */
  const [w0, w1, wSill] = [DOUBLE_WIN[0], DOUBLE_WIN[1], DOUBLE_WIN[2]];
  H.paint('homeWood', w0 - 0.05, -0.3, wSill - 0.3, w1 + 0.05, -0.04, wSill - 0.1);
  H.paint('homeMulch', w0, -0.27, wSill - 0.1, w1, -0.07, wSill - 0.09);
  for (let i = 0; i < 14; i += 1) {
    const x = w0 + 0.12 + i * ((w1 - w0 - 0.24) / 13);
    const m = ['homePlay', 'homeWhite', 'homePlayBlue', 'homeBook'][i % 4];
    H.ball('homeHedge', x, -0.17, wSill - 0.02, 0.07, { solid: false, seg: 5 });
    H.ball(m, x + 0.03, -0.2, wSill + 0.07 + (i % 3) * 0.03, 0.045, { solid: false, seg: 5 });
  }
  /* The planters either side of the door on the landing, and the mat. */
  const LAND = FM - 0.18;
  for (const x of [6.62, 7.98]) {
    H.paint('homeShelf', x, -0.42, LAND, x + 0.24, -0.18, LAND + 0.32);
    H.ball('homeHedge', x + 0.12, -0.3, LAND + 0.48, 0.18, { solid: false, seg: 6 });
  }
  H.paint('homeShelf', FRONT_DOOR[0] + 0.05, -0.62, LAND, FRONT_DOOR[1] - 0.05, -0.08, LAND + 0.008);
  /* The porch light beside the door, lit. */
  H.paint('homeLamp', 6.645, -0.1, FM + 1.38, 6.755, -0.04, FM + 1.57);
  /* The garage's lanterns either side of its door, lit. */
  for (const x of [GARAGE_DOOR[0] - 0.3, GARAGE_DOOR[1] + 0.3]) {
    H.paint('homeShutter', x - 0.08, -0.06, 1.55, x + 0.08, 0, 1.9);
    H.paint('homeLamp', x - 0.06, -0.12, 1.6, x + 0.06, -0.06, 1.85);
  }
  /* Downspouts at the front corners, white. */
  for (const x of [MW.x0 + 0.1, TS.x1 - 0.1]) {
    const top = x < TS.x0 ? EAVE_MAIN : CEIL_LOW;
    H.cap('homeTrim', [x, -0.07, 0.05], [x, -0.07, top], 0.035, { solid: false, seg: 5 });
  }

  /* The hoop at the head of the drive, on the drive's east edge, facing
   * across it: pole, arm and board solid, the rim and its net drawn. */
  const HP = { x: 19.45, y: -1.2 };
  const BOARD = { x0: 18.9, x1: 18.95, y0: HP.y - 0.9, y1: HP.y + 0.9, h0: 2.9, h1: 3.95 };
  H.post('homeShutter', HP.x, HP.y, 0, 3.45, 0.06, { seg: 6, kind: 'pole', name: 'hoop pole' });
  H.cap('homeShutter', [HP.x, HP.y, 3.35], [BOARD.x1, HP.y, 3.35], 0.04, { seg: 5, kind: 'pole', name: 'hoop arm' });
  H.box('homeWhite', BOARD.x0, BOARD.y0, BOARD.h0, BOARD.x1, BOARD.y1, BOARD.h1, { name: 'backboard', kind: 'obstacle' });
  /* The square over the rim, painted on the board's face. */
  const f0 = BOARD.x0 - 0.004;
  for (const [y0, y1, h0, h1] of [[-0.3, 0.3, 3.05, 3.09], [-0.3, 0.3, 3.46, 3.5], [-0.3, -0.26, 3.05, 3.5], [0.26, 0.3, 3.05, 3.5]]) {
    H.paint('homePlay', f0, HP.y + y0, h0, BOARD.x0, HP.y + y1, h1);
  }
  const RIM = { x: BOARD.x0 - 0.15 - 0.23, y: HP.y, h: 3.05, r: 0.23 };
  const N = 12;
  const rim = (k, r = RIM.r, dh = 0) => {
    const SC = { s: 0, c: 1 };
    sincos((k * 2 * Math.PI) / N, SC);
    return [RIM.x + r * SC.c, RIM.y + r * SC.s, RIM.h + dh];
  };
  for (let k = 0; k < N; k += 1) {
    H.cap('homePlay', rim(k), rim(k + 1), 0.012, { solid: false, seg: 3 });
    H.cap('homeWhite', rim(k), rim(k, RIM.r * 0.6, -0.4), 0.005, { solid: false, seg: 3 });
  }
  H.cap('homePlay', [BOARD.x0, RIM.y, RIM.h], rim(0), 0.015, { solid: false, seg: 3 });
}

/* ------------------------------------------------------------------ */
/* The streets and the corner                                          */
/* ------------------------------------------------------------------ */

/* A point on one corner's kerb return, phi in degrees from the Street A
 * kerb (0) round to the cross street's (90). */
function cornerPoint(c, r, phi) {
  const SC = { s: 0, c: 1 };
  sincos((phi * Math.PI) / 180, SC);
  return [c.x + c.sx * r * SC.s, c.y + c.sy * r * SC.c];
}

const CORNERS = [
  { x: KB + CORNER_R, y: KA + CORNER_R, sx: -1, sy: -1, ours: true },
  { x: STREET_B - HALF_B - CORNER_R, y: KA + CORNER_R, sx: 1, sy: -1 },
  { x: KB + CORNER_R, y: STREET_A - HALF_A - CORNER_R, sx: -1, sy: 1 },
  { x: STREET_B - HALF_B - CORNER_R, y: STREET_A - HALF_A - CORNER_R, sx: 1, sy: 1 },
];
export const OUR_CORNER = CORNERS[0];

function streets(H) {
  const sA0 = STREET_A - HALF_A;
  const sB0 = STREET_B - HALF_B;
  /* The asphalt: Street A end to end, the cross street north and south of
   * it, and each corner's fillet outside its kerb return. */
  H.paint('homeAsphalt', PX0, sA0, 0, PX1, KA, G_ASPHALT);
  H.paint('homeAsphalt', sB0, PY0, 0, KB, sA0, G_ASPHALT);
  H.paint('homeAsphalt', sB0, KA, 0, KB, PY1, G_ASPHALT);
  for (const c of CORNERS) {
    const pts = [[c.x + c.sx * CORNER_R, c.y + c.sy * CORNER_R]];
    for (let i = 0; i <= 18; i += 1) {
      pts.push(cornerPoint(c, CORNER_R, (i * 90) / 18));
    }
    H.flat('homeAsphalt', pts, 0, G_ASPHALT);
    /* The walk round the corner, and the kerb as a chain of low round
     * kerbstones, broken at the ramp. */
    const walk = [];
    for (let i = 0; i <= 18; i += 1) {
      walk.push(cornerPoint(c, CORNER_R - KERB_W - VERGE, (i * 90) / 18));
    }
    for (let i = 18; i >= 0; i -= 1) {
      walk.push(cornerPoint(c, CORNER_R - KERB_W - VERGE - WALK, (i * 90) / 18));
    }
    H.flat('homeDrive', walk, 0, G_PAVE);
    const kr = CORNER_R - KERB_W / 2;
    for (let i = 0; i < 18; i += 1) {
      const a = (i * 90) / 18;
      const b = ((i + 1) * 90) / 18;
      if (b > 37.5 && a < 52.5) {
        continue;
      }
      const p = cornerPoint(c, kr, a);
      const q = cornerPoint(c, kr, b);
      H.cap('homeFoundation', [p[0], p[1], KERB_H / 2], [q[0], q[1], KERB_H / 2], KERB_H / 2, { kind: 'obstacle', seg: 6, name: 'kerb' });
    }
    /* The ramp's tactile pad. */
    const t = cornerPoint(c, CORNER_R - 0.4, 45);
    H.paint('homeBook', t[0] - 0.35, t[1] - 0.35, 0, t[0] + 0.35, t[1] + 0.35, G_PAVE + 0.004);
  }
  /* The straight kerbs, verges and walks on all eight sides of the two
   * streets, cut for our drive. */
  const runsA = [[PX0, CORNERS[1].x], [CORNERS[0].x, PX1]];
  for (const [a0, a1] of runsA) {
    for (const s of [1, -1]) {
      const k = s > 0 ? KA : sA0;
      const kerbs = s > 0 && a0 < DRIVE.x0 && a1 > DRIVE.x1 ? [[a0, DRIVE.x0], [DRIVE.x1, a1]] : [[a0, a1]];
      for (const [b0, b1] of kerbs) {
        H.box('homeFoundation', b0, Math.min(k, k + s * KERB_W), 0, b1, Math.max(k, k + s * KERB_W), KERB_H, { name: 'kerb', kind: 'obstacle' });
      }
      const w0 = k + s * (KERB_W + VERGE);
      H.paint('homeDrive', a0, Math.min(w0, w0 + s * WALK), 0, a1, Math.max(w0, w0 + s * WALK), G_PAVE);
      for (let x = a0 + 1.5; x < a1 - 0.2; x += 1.5) {
        H.paint('homeCoping', x - 0.015, Math.min(w0, w0 + s * WALK), 0, x + 0.015, Math.max(w0, w0 + s * WALK), G_PAVE + 0.003);
      }
    }
  }
  H.paint('homeFoundation', DRIVE.x0, KA, 0, DRIVE.x1, KA + KERB_W, 0.04);
  const runsB = [[PY0, CORNERS[2].y], [CORNERS[0].y, PY1]];
  for (const [a0, a1] of runsB) {
    for (const s of [1, -1]) {
      const k = s > 0 ? KB : sB0;
      H.box('homeFoundation', Math.min(k, k + s * KERB_W), a0, 0, Math.max(k, k + s * KERB_W), a1, KERB_H, { name: 'kerb', kind: 'obstacle' });
      const w0 = k + s * (KERB_W + VERGE);
      H.paint('homeDrive', Math.min(w0, w0 + s * WALK), a0, 0, Math.max(w0, w0 + s * WALK), a1, G_PAVE);
      for (let y = a0 + 1.5; y < a1 - 0.2; y += 1.5) {
        H.paint('homeCoping', Math.min(w0, w0 + s * WALK), y - 0.015, 0, Math.max(w0, w0 + s * WALK), y + 0.015, G_PAVE + 0.003);
      }
    }
  }
  /* The double yellow line on Street A, none on the cross street; the
   * crosswalk bars on our corner's two sides and the stop bar. */
  for (const [a0, a1] of runsA) {
    H.paint('homeBook', a0, STREET_A - 0.18, 0, a1, STREET_A - 0.08, G_LINE);
    H.paint('homeBook', a0, STREET_A + 0.08, 0, a1, STREET_A + 0.18, G_LINE);
  }
  for (const x of [-9.35, -7.35]) {
    H.paint('homeTrim', x, -23.0, 0, x + 0.3, -10.6, G_LINE);
  }
  for (const y of [-9.35, -7.35]) {
    H.paint('homeTrim', -19.9, y, 0, -10.1, y + 0.3, G_LINE);
  }
  H.paint('homeTrim', -5.7, STREET_A + 0.1, 0, -5.3, KA - 0.1, G_LINE);
  /* The curb inlet in the gutter east of the corner, its pad and lid on
   * the verge. */
  H.paint('homeShelf', -2.8, KA - 0.56, 0, -1.8, KA, G_LINE);
  H.paint('homeCoping', -3.2, KA + KERB_W + 0.05, 0, -1.4, KA + KERB_W + VERGE - 0.05, 0.04);
  H.discs.push({ m: 'homeShelf', px: -2.3, py: KA + KERB_W + VERGE / 2, r: 0.32, h: 0.05 });
  /* The stop sign for traffic coming west on Street A, and the street
   * name sign on its own post, its blades blank. */
  H.post('homeSteel', -4.1, KA + 0.75, 0, 2.45, 0.035, { seg: 5, kind: 'pole' });
  H.cyl('homePlay', [-4.08, KA + 0.75, 2.25], [-4.05, KA + 0.75, 2.25], 0.38, 8);
  H.post('homeSteel', -9.0, -7.2, 0, 3.0, 0.035, { seg: 5, kind: 'pole' });
  H.paint('homeHedge', -9.6, -7.215, 2.7, -8.4, -7.185, 2.88);
  H.paint('homeHedge', -9.015, -7.8, 2.92, -8.985, -6.6, 3.1);
}

/* ------------------------------------------------------------------ */
/* The neighbours                                                      */
/* ------------------------------------------------------------------ */

/* A box proud of one face: 'n' or 's' faces of an east west wall at py
 * `at`, 'e' or 'w' faces of a north south one at px `at`. */
function onFace(H, m, side, at, a0, a1, h0, h1, k) {
  const s = side === 'n' || side === 'e' ? 1 : -1;
  const p = Math.min(at, at + s * k);
  const q = Math.max(at, at + s * k);
  if (side === 'n' || side === 's') {
    H.paint(m, a0, p, h0, a1, q, h1);
  } else {
    H.paint(m, p, a0, h0, q, a1, h1);
  }
}

/*
 * A NEIGHBOUR: a two storey box under a gable roof whose ridge runs along
 * its front, the front on side `face`; windows, a door, shutters painted
 * on, a chimney, a brick lower front or a garage door if asked. Solid as
 * the box and the roof's bands.
 */
function neighbour(H, x0, y0, w, d, m, face, o = {}) {
  const x1 = x0 + w;
  const y1 = y0 + d;
  const h = o.h ?? 5.4;
  H.box(m, x0, y0, 0, x1, y1, h, { name: 'neighbour' });
  const ew = face === 'n' || face === 's';
  if (ew) {
    gableRoof(H, 'x', y0, y1, x0, x1, h, h, { gable: m, pitch: 8 / 12 });
  } else {
    gableRoof(H, 'y', x0, x1, y0, y1, h, h, { gable: m, pitch: 8 / 12 });
  }
  const fa = { n: y1, s: y0, e: x1, w: x0 }[face];
  const back = { n: 's', s: 'n', e: 'w', w: 'e' }[face];
  const ba = { n: y0, s: y1, e: x0, w: x1 }[face];
  const [l0, l1] = ew ? [x0, x1] : [y0, y1];
  const n = Math.max(3, Math.round((l1 - l0) / 2.6));
  const frameM = m === 'homeTrim' ? 'homeWhite' : 'homeTrim';
  if (o.brick) {
    onFace(H, 'homeBrick', face, fa, l0, l1, 0, 2.7, 0.02);
  }
  for (let i = 0; i < n; i += 1) {
    const c = l0 + ((i + 0.5) * (l1 - l0)) / n;
    for (const [side, at] of [[face, fa], [back, ba]]) {
      for (const hh of [0.95, 3.75]) {
        if (side === face && hh < 2 && i === Math.floor(n / 2)) {
          continue;
        }
        onFace(H, frameM, side, at, c - 0.55, c + 0.55, hh - 0.08, hh + 1.5, 0.03);
        onFace(H, 'homeWindow', side, at, c - 0.45, c + 0.45, hh, hh + 1.4, 0.05);
        if (o.shutters && side === face) {
          for (const sx of [-1, 1]) {
            onFace(H, 'homeShutter', side, at, c + sx * 0.6 - 0.18, c + sx * 0.6 + 0.18, hh - 0.05, hh + 1.45, 0.05);
          }
        }
      }
    }
  }
  const dc = l0 + ((Math.floor(n / 2) + 0.5) * (l1 - l0)) / n;
  onFace(H, frameM, face, fa, dc - 0.6, dc + 0.6, 0, 2.4, 0.04);
  onFace(H, o.door ?? 'homeShutter', face, fa, dc - 0.45, dc + 0.45, 0, 2.2, 0.06);
  if (o.chimney) {
    const cx = o.chimney > 0 ? x1 : x0 - 0.8;
    const cy = (y0 + y1) / 2;
    const mx = (x0 + x1) / 2;
    if (ew) {
      H.box('homeBrick', cx, cy - 0.55, 0, cx + 0.8, cy + 0.55, h + 3.3, { name: 'chimney' });
    } else {
      H.box('homeBrick', mx - 0.55, o.chimney > 0 ? y1 : y0 - 0.8, 0, mx + 0.55, o.chimney > 0 ? y1 + 0.8 : y0, h + 3.3, { name: 'chimney' });
    }
  }
}

/* A neighbour's drive from its front to the walk, and its apron. */
function drive(H, x0, y0, x1, y1) {
  H.paint('homeAsphalt', x0, y0, 0, x1, y1, G_DRIVE);
}

function neighbours(H) {
  /* East, past the drive: the white two storey house of img-01, its
   * garage on the far side, its door open and dark. */
  neighbour(H, 28.25, 1.5, 10.5, 8.5, 'homeTrim', 's', { shutters: true });
  H.box('homeTrim', 38.75, 1.0, 0, 45.35, 8.0, 3.0, { name: 'garage' });
  gableRoof(H, 'x', 1.0, 8.0, 38.75, 45.35, 3.0, 3.0, { gables: 'e1', E0: 38.75, gable: 'homeTrim' });
  onFace(H, 'homeShelf', 's', 1.0, 39.6, 44.5, 0, 2.2, 0.04);
  drive(H, 39.4, LINE_A, 44.7, 1.0);
  /* Across Street A, from the corner: the brick and white house, the white
   * colonial with its chimney, a tan one (8G5 hq2, img-04). */
  neighbour(H, -0.95, -43.6, 10.5, 8.5, 'homeTrim', 'n', { brick: true, door: 'homePlay' });
  drive(H, 10.0, -35.1, 13.2, -24.6);
  neighbour(H, 23.05, -43.6, 10.5, 8.5, 'homeTrim', 'n', { shutters: true, chimney: 1 });
  drive(H, 34.6, -35.1, 37.8, -24.6);
  neighbour(H, 38.5, -43.0, 7.5, 8.0, 'homeNeighbourTan', 'n');
  /* Across the cross street: the white colonial on the corner (img-02),
   * a tan house north of it, a tan one with a brick front south of
   * Street A. */
  neighbour(H, -40.8, -2.65, 8.5, 10.5, 'homeTrim', 'e', { shutters: true, chimney: -1 });
  drive(H, -32.3, 8.2, -22.3, 11.4);
  neighbour(H, -40.8, 21.35, 8.5, 10.5, 'homeNeighbourTan', 'e');
  neighbour(H, -40.8, -41.45, 8.5, 10.5, 'homeNeighbourTan', 'e', { brick: true });
  drive(H, -32.3, -30.6, -22.3, -27.8);
}

/* ------------------------------------------------------------------ */
/* Trees and cars: the town's own, at the house's scale                */
/* ------------------------------------------------------------------ */

/* The town's street tree at its largest is STREET_TREE world metres;
 * each here is k times a TREE_M metre real tree. The big one in the front
 * lawn toward the corner is the one in img-01, img-02 and img-03. */
const STREET_TREE = 21;
const TREE_M = 7;
const TREES = [
  [-2.7, -3.9, 1.9], [16.0, 20.7, 1.3], [-1.0, 21.7, 1.1], [27.0, 18.0, 1.6], [40.0, 22.0, 1.5],
  [-30.0, 14.0, 1.7], [-36.0, -26.0, 1.5], [14.0, -44.5, 1.4], [36.0, -44.5, 1.6], [-6.0, 30.0, 1.8],
  [44.0, -6.0, 1.4], [-28.0, 30.0, 1.5], [6.0, 30.0, 1.6], [30.0, 31.0, 1.7], [-4.0, 14.2, 1.3],
  [-27.0, -36.0, 1.4], [20.0, -40.0, 1.3],
];

function trees(H) {
  TREES.forEach(([px, py, k], i) => {
    const el = { id: `heads-tree-${i + 1}`, type: 'tree', style: 'street', dims: { size: 3, variant: 21 + i } };
    H.asset(el, (S * TREE_M * k) / STREET_TREE, px, py, 0, 0, 'extra:trees');
  });
}

/* Cars, by quarter turns: our pickup's stand in nose out and the black
 * sedan nose in on the drive (img-02, img-05), the red one parked across
 * the street (img-04), the neighbours'. The variant picks the colour. Each
 * stands on the paint it is parked on, a drive's or the street's, so its
 * tyres are on the asphalt rather than in it and the air under its floor
 * is the whole 0.13 m, which scaledParts leaves open to fly through. */
function cars(H) {
  const N = Math.PI / 2;
  const list = [
    ['wagon', 17.4, -3.1, -N, 5, G_DRIVE],
    ['sedan', 14.8, -5.7, N, 26, G_DRIVE],
    ['minivan', 15.5, -20.6, 0, 20, G_ASPHALT],
    ['hatch', 42.0, -4.0, N, 3, G_DRIVE],
    ['sedan', -26.0, -12.8, Math.PI, 20, G_ASPHALT],
    ['wagon', 11.6, -30.0, -N, 5, G_DRIVE],
    ['sedan', -27.3, 9.8, 0, 1, G_DRIVE],
  ];
  list.forEach(([style, px, py, yaw, variant, h], i) => {
    const el = { id: `heads-car-${i + 1}`, type: 'car', style, dims: { variant } };
    H.asset(el, S, px, py, h, yaw, 'extra:street');
  });
}

/* ------------------------------------------------------------------ */
/* The whole                                                           */
/* ------------------------------------------------------------------ */

/* The scaled assets' parts in the world frame, solid and never drawn
 * (../house/house.js scaledParts). A car's are open underneath
 * (carOpenLayout in src/props/street.js): at this scale the gap under its
 * floor is a line. */
const SCQ = { s: 0, c: 1 };
function scaledParts(a) {
  const k = a.k;
  const [x, y, z] = worldAt(a.px, a.py, a.h);
  const parts = a.el.type === 'car' ? carOpenLayout(a.el) : partsOf(a.el);
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
 * The house, its yard and its streets: { parts, prisms, flats, discs,
 * cyls, cones, scaled }, every part in the world frame. The same every
 * call.
 */
export function headsLayout() {
  const H = new House();
  shell(H);
  stairs(H);
  garage(H);
  basement(H);
  mainFloor(H);
  upstairs(H);
  backYard(H);
  frontYard(H);
  ornaments(H);
  dressing(H);
  streets(H);
  neighbours(H);
  trees(H);
  cars(H);
  const parts = H.P.list.slice();
  for (const a of H.scaled) {
    parts.push(...scaledParts(a));
  }
  return { parts, prisms: H.prisms, flats: H.flats, discs: H.discs, cyls: H.cyls, cones: H.cones, scaled: H.scaled };
}

/* The plan's frame, and the openings ./yard.js names, as
 * ../house/house.js's: a span along a wall at `y` (an east west wall) or
 * `x` (a north south one) and its sill and head. */
export const FRAME = { OX, OZ, S };
export const OPENINGS = {
  frontDoor: { x0: FRONT_DOOR[0], x1: FRONT_DOOR[1], y: TX / 2, h0: FRONT_DOOR[2], h1: FRONT_DOOR[3] },
  garage: { x0: GARAGE_DOOR[0], x1: GARAGE_DOOR[1], y: TX / 2, h0: GARAGE_DOOR[2], h1: GARAGE_DOOR[3] },
  slider: { x0: SLIDER[0], x1: SLIDER[1], y: MW.y1 - TX / 2, h0: SLIDER[2], h1: SLIDER[3] },
  livingWindow: { x0: DOUBLE_WIN[0], x1: DOUBLE_WIN[1], y: TX / 2, h0: DOUBLE_WIN[2], h1: DOUBLE_WIN[3] },
  kitchenWindow: { x0: KITCHEN_WIN[0], x1: KITCHEN_WIN[1], y: MW.y1 - TX / 2, h0: KITCHEN_WIN[2], h1: KITCHEN_WIN[3] },
  basementWindow: { x0: BASEMENT_WIN[0], x1: BASEMENT_WIN[1], y: TX / 2, h0: BASEMENT_WIN[2], h1: BASEMENT_WIN[3] },
  bedroomWindow: { x0: UP_FRONT[1][0], x1: UP_FRONT[1][1], y: TS.up + TX / 2, h0: UP_FRONT[1][2], h1: UP_FRONT[1][3] },
  sideWindow: { y0: UP_EAST[0][0], y1: UP_EAST[0][1], x: TS.x1 - TX / 2, h0: UP_EAST[0][2], h1: UP_EAST[0][3] },
  downStairs: { y0: DOWN_FLIGHT.y0, y1: DOWN_FLIGHT.y1, x: TS.x0 + TX / 2, h0: FM, h1: CEIL_MAIN },
  shopDoor: { y0: SHOP_DOOR[0], y1: SHOP_DOOR[1], x: PART_G, h0: FG, h1: FG + 2.0 },
  garageGate: {
    x0: GARAGE_GATE.x - CUBE / 2 + 2 * CUBE_TUBE, x1: GARAGE_GATE.x + CUBE / 2 - 2 * CUBE_TUBE, y: GARAGE_GATE.y,
    h0: GARAGE_GATE.h + 2 * CUBE_TUBE, h1: GARAGE_GATE.h + CUBE - 2 * CUBE_TUBE,
  },
  basementGate: {
    y0: FAMILY_GATE.y - CUBE / 2 + 2 * CUBE_TUBE, y1: FAMILY_GATE.y + CUBE / 2 - 2 * CUBE_TUBE, x: FAMILY_GATE.x,
    h0: FAMILY_GATE.h + 2 * CUBE_TUBE, h1: FAMILY_GATE.h + CUBE - 2 * CUBE_TUBE,
  },
  sideGate: { x0: -3.6, x1: -2.4, y: 5.2, h0: 0, h1: 1.83 },
};

/*
 * THE GROUND UNDER (x, z), world metres, where no top is: the basement's
 * floor inside its walls, the lawn's 0 everywhere else. The built map's
 * `height` asks it (extra.floor in ../built/index.js), as the house's
 * basementFloorAt does.
 */
export function basementFloorAt(x, z) {
  const px = (x - OX) / S;
  const py = (OZ - z) / S;
  return px > TS.x0 && px < PART_G && py > TS.y0 && py < TS.y1 ? S * FL : 0;
}

/* The basement's footprint as a world rectangle: the field's plane lies
 * at exactly zero over the whole field and would cross the room at the
 * lawn's height, so ./index.js cuts this out of it. */
export const BASEMENT_HOLE = { x0: OX + S * TS.x0, x1: OX + S * PART_G, z0: OZ - S * TS.y1, z1: OZ - S * TS.y0 };

/* Where the pilot starts: the garage, on the checkerboard behind the drone
 * shelf, facing out of the open door to the street. */
export const SPAWN = { px: 15.9, py: 5.2, h: FG };

/* Where ./index.js prints the banner, the sticker wall, the sign and the
 * flag in the garage: each a rectangle on a wall face, world metres. */
export const PRINTS = {
  banner: { face: 'x+', at: wx(GARAGE.x0 + 0.012), a0: wz(3.75), a1: wz(1.35), h0: wy(1.05), h1: wy(1.83) },
  stickers: { face: 'z+', at: wz(GARAGE.y1 - 0.012), a0: wx(14.3), a1: wx(16.5), h0: wy(1.02), h1: wy(1.94) },
  sign: { face: 'z+', at: wz(GARAGE.y1 - 0.06), a0: wx(14.35), a1: wx(15.25), h0: wy(1.95), h1: wy(2.07) },
  flag: { face: 'x+', at: wx(GARAGE.x0 + 0.012), a0: wz(6.4), a1: wz(5.5), h0: wy(1.1), h1: wy(1.6) },
};
