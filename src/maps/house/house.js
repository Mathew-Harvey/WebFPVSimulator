/*
 * house.js: Nick Burns' house, its yard and its end of the street, as the
 * parts a built map holds. Pure data and arithmetic, no Three.js, no JS
 * trigonometry, so the solids can be built and checked in plain Node.
 *
 * WHERE IT COMES FROM. Nick's own videos, about fifty stills of the house
 * from four years of them (listed with what each shows in
 * /mnt/project-files/nick-burns-house/refs/REFERENCES.md), and three
 * Uncrashed Workshop layouts of it for the plan's proportions. The stills
 * decide what the house looks like: a warm grey board and batten house with
 * white trim and dark sashes, a red brick block at the front west corner
 * with a tall window, a white porch on bracketed posts, a three car garage
 * under one long sweep of grey roof, a full height brick chimney on the west
 * gable. Behind it a timber pergola over a stamped patio, a white bay
 * window, a long pool parallel to the house, a fire pit at the chimney end
 * and a stone outdoor kitchen under a pavilion at the garage end. Inside, a
 * loop round a straight central stair: foyer, front room, family room,
 * breakfast room, kitchen, back hall, dining room and back to the foyer,
 * honey oak throughout, olive green in the back rooms, dark stained trim in
 * the front ones. Upstairs no still shows, so its rooms are a plausible
 * plan and nothing more. The basement is left out: the ground here is flat.
 *
 * THE SCALE IS THE POINT. Everything is three times life size, so a five
 * inch flies the house the way a 75 mm whoop flies a real one: 220 mm of
 * craft over 75 is 2.9, rounded to 3, the same derivation as MICRO_SCALE in
 * configs/airframes.js. A real door 0.9 m wide is 2.7 m here, a room 4.6 m
 * across is 13.8. The plan below is written in REAL metres, the way a
 * house is measured, and turned into the world's metres once, by S, in the
 * few helpers under it. Nothing else multiplies by three.
 *
 * THE PLAN'S FRAME. px runs east along the front of the house, py north
 * from the main front wall to the back, h up from the ground, all in real
 * metres, with the origin at the main block's front west corner on the
 * ground. The main block is 14 by 8.4, two storeys at the back; at the
 * front the roof sweeps down over the porch to one storey, with an attic
 * behind the porch and the brick block standing two storeys in front of it.
 * The garage is east of the main block and as far forward as the brick
 * block. The front faces south, toward the cul de sac; the pool is behind,
 * to the north.
 *
 * WHAT IS SOLID. Walls, floors, ceilings, the stairs, every piece of
 * furniture, posts, fences, trees and the neighbours' houses, each as a box
 * on the axes or a capsule, drawn and solid from the same numbers
 * (../../props/parts.js). The roofs are drawn as slopes and are solid as
 * level bands under them five centimetres apart, each as wide as the slope
 * at its top, so a craft that lands on a roof stands at most five real
 * centimetres (fifteen of the world's) into it. Paint is not solid: the
 * floors' finish, the rugs, the trims round a window, the colour on a wall,
 * the patio and the pool's water.
 *
 * WINDOWS ARE OPEN. Every window is a hole in its wall with a frame round
 * it and nothing in it, because a window is a line a whoop pilot flies in a
 * real house, and glass a craft passes through would be a lie about what is
 * solid. A window too small to fly is not a window here; it is painted.
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
import { sincos, quarterTurns, quarterSinCos } from '../../props/trig.js';

/* ------------------------------------------------------------------ */
/* The frame                                                           */
/* ------------------------------------------------------------------ */

/* World metres to a real metre. */
export const S = 3;

/* The plot, in the document's metres: x east, y north, from its south west
 * corner. 60 by 76 real metres, the house's lot, the cul de sac and the
 * three houses round it. */
export const FIELD_W = 180;
export const FIELD_D = 228;

/* Where the plan's origin is on the plot, in the document's metres: 14 real
 * metres of side yard to the west, 44 of front yard, cul de sac and
 * neighbours to the south. */
export const X0 = 42;
export const Y0 = 132;

/* The plot's edges in plan metres. */
export const PLOT = {
  x0: -X0 / S, x1: (FIELD_W - X0) / S, y0: -Y0 / S, y1: (FIELD_D - Y0) / S,
};

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

export const LEN = 14;
export const DEP = 8.4;
/* The ground floor stands a step over the lawn, on the slab. */
export const FLOOR0 = 0.15;
export const CEIL0 = 2.75;
export const FLOOR1 = 3.0;
export const CEIL1 = 5.45;
export const EAVE = 5.6;
const TX = 0.2;
const TI = 0.12;
const DOOR_H = 2.05;
const WIN_SILL = 0.8;
const WIN_TOP = 2.25;

/* The brick block: the front room and the bedroom over it, two storeys,
 * standing forward of the main front wall by the porch's depth. */
export const FRONT = -1.6;
const BRICK_X1 = 4.6;

/* The roofs: 7 in 12, a 0.35 overhang, a slab 0.21 thick measured plumb. */
const PITCH = 7 / 12;
const OVER = 0.35;
const ROOF_T = 0.21;
/* Height of one band of a roof's solid. */
const BAND = 0.05;

/*
 * THE MAIN ROOF'S TWO PLANES, as the height of the top surface at py. The
 * back is a plain eave over two storeys, the top at the wall's outer face
 * 5.654 like any 7 in 12 roof with this overhang; the front sweeps down over
 * the porch to a one storey eave, the top 3.15 at the porch's front. They
 * meet at the ridge, which is therefore behind the middle of the house.
 */
const FRONT_A = 3.15 - PITCH * FRONT;
const REAR_B = 5.654 + PITCH * DEP;
const frontTop = (py) => FRONT_A + PITCH * py;
const rearTop = (py) => REAR_B - PITCH * py;
const RIDGE_Y = (REAR_B - FRONT_A) / (2 * PITCH);
const RIDGE_H = frontTop(RIDGE_Y);
/* Behind the porch the upper floor starts at a knee wall, where the front
 * plane's underside has risen past the upstairs ceiling. In front of it is
 * attic, solid. */
const KNEE = 2.8;

/* The stairs: thirteen risers from the hall floor to the landing, twelve
 * treads running north up the east side of the foyer. */
const STAIR_X0 = 7.2;
const STAIR_X1 = 8.3;
const STAIR_Y0 = 1.1;
const STAIR_TREAD = 0.275;
const STAIR_RISERS = 13;
const STAIR_Y1 = STAIR_Y0 + (STAIR_RISERS - 1) * STAIR_TREAD;
const STAIR_RISE = (FLOOR1 - FLOOR0) / STAIR_RISERS;

/* The garage: three bays, flush with the brick block's front. */
const G_X0 = LEN;
const G_X1 = 23.5;
const G_Y0 = FRONT;
const G_Y1 = 5.4;
const G_TOP = 3.0;
const BAYS = [[14.45, 17.05], [17.45, 20.05], [20.45, 23.05]];
const BAY_H = 2.2;

/* The pool, its coping outside it, a few metres off the back wall. */
const POOL = { x0: 1.0, x1: 10.5, y0: 13.8, y1: 18.3 };

/* The bulb of the cul de sac, in plan metres: Nick's drive and two of the
 * neighbours' come off it, and the street runs east from it. */
export const BULB = { x: 19, y: -23, r: 12 };
const STREET = { y0: -27, y1: -19 };

/* Paint on the ground, each a little over the last, so no two tops share a
 * height: the street, its pavements and the patio, then the drives. */
const G_ASPHALT = 0.025;
const G_PAVE = 0.03;
const G_DRIVE = 0.034;

/* ------------------------------------------------------------------ */
/* The builder                                                         */
/* ------------------------------------------------------------------ */

/*
 * Everything is added in plan terms and lands in one Parts list in the
 * world frame, plus what the parts cannot say: roof slopes and gables
 * (prisms), round paving (discs), an umbrella (cones), and the town's own
 * trees and cars drawn larger (scaled). Those are the draw()'s, in
 * ./index.js.
 */
class House {
  constructor() {
    this.P = new Parts();
    this.prisms = [];
    this.discs = [];
    this.cones = [];
    this.scaled = [];
  }

  /* A box between two plan corners. */
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

  /* A capsule between two plan points [px, py, h], radius r, real metres. */
  cap(m, a, b, r, opts = {}) {
    return this.P.cap(m, worldAt(a[0], a[1], a[2]), worldAt(b[0], b[1], b[2]), S * r, opts);
  }

  /* A vertical post. */
  post(m, px, py, h0, h1, r, opts = {}) {
    return this.cap(m, [px, py, h0], [px, py, h1], r, opts);
  }

  /*
   * A DRUM: a short round thing with a free end, a lamp's shade, a stool's
   * seat, a light on the ceiling. A post's solid is a capsule, which is
   * right for a leg in the floor and wrong here, where its rounded end
   * would stand a radius past the drawn face and the craft would meet air.
   * So it is drawn round and solid as the square inside it, end to end, as
   * a round table's top is.
   */
  drum(m, px, py, h0, h1, r, opts = {}) {
    const c = r * 0.8;
    this.post(m, px, py, h0, h1, r, { ...opts, solid: false });
    return this.hidden(px - c, py - c, h0, px + c, py + c, h1, opts.kind ?? 'obstacle', opts.name ?? 'drum');
  }

  /*
   * A WALL, with its openings cut by Parts.wall. `dir` 'x' runs east along
   * py = at from px a0 to a1; 'y' runs north along px = at from py a0 to a1.
   * holes are [b0, b1, c0, c1]: along the wall from b0 to b1, up from c0 to
   * c1. Drawn in `core` and solid; the colours of its faces are painted on
   * by face() and roomFaces().
   */
  wall(dir, at, a0, a1, h0, h1, o = {}) {
    const t = o.t ?? TI;
    const spec = wallSpec(dir, at, t, a0, a1, h0, h1, o.holes ?? []);
    this.P.wall(o.core ?? 'homeWallIn', spec, { kind: 'wall', name: o.name ?? 'wall' });
  }

  /*
   * The frame round an opening, on one face of a wall: two jambs and a
   * head, and a sill under a window. `side` +1 is the north (or east) face.
   * `sash` lines the opening's four sides in the window's dark frame.
   */
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
      /* Inside the opening, a hand's width of dark frame on each side,
       * standing in the wall's thickness where a real sash would. */
      const s = 0.035;
      const p = at + side * (t / 2 - 0.08);
      const q = at + side * (t / 2);
      add(o.sash, b0, b0 + s, c0, c1, p, q);
      add(o.sash, b1 - s, b1, c0, c1, p, q);
      add(o.sash, b0, b1, c1 - s, c1, p, q);
      add(o.sash, b0, b1, c0, c0 + s, p, q);
    }
  }

  /*
   * A prism for the draw: `profile` in (across, up) real metres, extruded
   * along the other horizontal axis from e0 to e1. axis 'x' extrudes east
   * (across is py), axis 'y' extrudes north (across is px).
   */
  prism(m, axis, profile, e0, e1) {
    this.prisms.push({ m, axis, profile, e0, e1 });
  }

  /* A cone for the draw, its base centred on a plan point. */
  cone(m, px, py, h, r, height) {
    this.cones.push({ m, base: worldAt(px, py, h), r: S * r, h: S * height });
  }

  /* One of the town's assets, drawn k times its size. */
  asset(el, k, px, py, h, yaw, chunk = 'extra') {
    this.scaled.push({ el, k, px, py, h, yaw, chunk });
  }
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
/* Roofs                                                               */
/* ------------------------------------------------------------------ */

/*
 * A ROOF'S SOLID, as level bands from h0 up to h1, each one box whose
 * edges are where the roof's top surface is at the band's top: the bands'
 * outer corners lie on the surface, so a craft on the roof stands at most
 * one band into it. `span(h)` gives a band's [lo, hi] across the ridge at
 * height h, or null where there is none; the boxes run from E0 to E1 along
 * it.
 *
 * `walls` is the stretch along the ridge the walls stand under. Past it, a
 * gable's rake overhang is only the roof's slab with air under it, so there
 * each band is the two strips of the slab whose top is the band's: where
 * the surface is between the band's top and a slab's thickness over it. A
 * craft flying along a gable under its rake meets the slab and nothing
 * under it.
 */
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

/*
 * A GABLE ROOF over a rectangle, ridge along `axis` ('x' east to west, 'y'
 * north to south). `a0..a1` is the span across the ridge (walls' outer
 * faces), `e0..e1` its length, `eave` the height of the wall tops, `floor`
 * the height its solid starts from (the ceiling's top, so no band hangs
 * into a room). Drawn as two slabs and the gables `o.gables` names ('e0',
 * 'e1', 'both' by default, or 'none'); solid as bands(). `o.edge0` and
 * `o.edge1` cut a slope short of its overhang, where it runs into another
 * roof; `o.base` is where a gable's triangle starts, the wall top under it.
 */
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
  const edge0 = o.edge0 ?? a0 - over;
  const edge1 = o.edge1 ?? a1 + over;
  const E0 = o.E0 ?? e0 - over;
  const E1 = o.E1 ?? e1 + over;
  const roofM = o.roof ?? 'homeRoof';
  H.prism(roofM, axis, [
    [edge0, top0(edge0) - ROOF_T], [edge0, top0(edge0)], [mid, ridge], [mid, ridge - ROOF_T],
  ], E0, E1);
  H.prism(roofM, axis, [
    [edge1, top1(edge1) - ROOF_T], [mid, ridge - ROOF_T], [mid, ridge], [edge1, top1(edge1)],
  ], E0, E1);
  if (edge0 < a0) {
    fascia(H, axis, edge0, -1, top0(edge0), E0, E1);
  }
  if (edge1 > a1) {
    fascia(H, axis, edge1, 1, top1(edge1), E0, E1);
  }
  const gable = o.gable ?? 'homeSiding';
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
  /* The eaves' undersides, outside the walls, up to where the bands
   * start: banded as well, so over the overhang too the solid is under the
   * slope and never over it. */
  const run0 = (h) => Math.max(0, (h - yEdge) / pitch);
  if (edge0 < a0 && floor > yEdge - ROOF_T) {
    bands(H, axis, E0, E1, yEdge - ROOF_T, floor, (h) => [Math.max(edge0, a0 - over + run0(h)), a0]);
  }
  if (edge1 > a1 && floor > yEdge - ROOF_T) {
    bands(H, axis, E0, E1, yEdge - ROOF_T, floor, (h) => [a1, Math.min(edge1, a1 + over - run0(h))]);
  }
  return { ridge, mid };
}

/* The white board along an eave's edge. `side` -1 for the low edge of the
 * profile, +1 for the high. `top` is the roof's top there. */
function fascia(H, axis, at, side, top, E0, E1) {
  const a = side < 0 ? at - 0.03 : at - 0.02;
  const b = side < 0 ? at + 0.02 : at + 0.03;
  H.prism('homeTrim', axis, [
    [a, top - ROOF_T - 0.02], [a, top + 0.01], [b, top + 0.01], [b, top - ROOF_T - 0.02],
  ], E0, E1);
}

/*
 * THE MAIN ROOF: the front plane from the porch's eave to the ridge, the
 * back plane from the ridge to the back eave, east of the brick block from
 * end to end, and over the brick block only from behind it, where the brick
 * block's own roof runs back into it.
 */
function mainRoof(H) {
  const F = FRONT - OVER;
  const B = DEP + OVER;
  const yF = frontTop(F);
  const yB = rearTop(B);
  const W = 2.95;
  const slopes = (y0, h0, x0, x1) => {
    H.prism('homeRoof', 'x', [[y0, h0 - ROOF_T], [y0, h0], [RIDGE_Y, RIDGE_H], [RIDGE_Y, RIDGE_H - ROOF_T]], x0, x1);
    H.prism('homeRoof', 'x', [[B, yB - ROOF_T], [RIDGE_Y, RIDGE_H - ROOF_T], [RIDGE_Y, RIDGE_H], [B, yB]], x0, x1);
  };
  slopes(F, yF, BRICK_X1, LEN);
  slopes(W, frontTop(W), -OVER, BRICK_X1);
  fascia(H, 'x', F, -1, yF, BRICK_X1, LEN);
  fascia(H, 'x', B, 1, yB, -OVER, LEN);
  /* The gables: the west one over the two storeys behind the brick block;
   * the east one the same, and under it, over the garage roof, the attic
   * end behind the porch. */
  const under = (py) => Math.min(frontTop(py), rearTop(py)) - ROOF_T - 0.01;
  const yLo = (EAVE + ROOF_T + 0.01 - FRONT_A) / PITCH;
  const yHi = (REAR_B - EAVE - ROOF_T - 0.01) / PITCH;
  const tri = [[yLo, EAVE], [RIDGE_Y, under(RIDGE_Y)], [yHi, EAVE]];
  H.prism('homeSiding', 'x', tri, 0, TX);
  H.prism('homeSiding', 'x', tri, LEN - TX, LEN);
  H.prism('homeSiding', 'x', [[0, FLOOR1], [0, under(0)], [yLo, EAVE], [yLo, FLOOR1]], LEN - TX, LEN);
  /* Solid: east of the brick block from the porch's ceiling, over the attic
   * to the knee wall and, above the upstairs ceiling, to the back plane;
   * over the brick block, from the ceiling up, behind it. */
  const span = (front) => (h) => {
    const lo = Math.max(front, (h - FRONT_A) / PITCH, F);
    const hi = h <= EAVE + 1e-9 ? KNEE - TI / 2 : Math.min(B, (REAR_B - h) / PITCH);
    return lo < hi ? [lo, hi] : null;
  };
  bands(H, 'x', BRICK_X1, LEN, 2.9, EAVE, span(F));
  bands(H, 'x', BRICK_X1, LEN, EAVE, RIDGE_H, span(F));
  bands(H, 'x', -OVER, BRICK_X1, EAVE, RIDGE_H, span(W), [0, BRICK_X1]);
  /* The eaves' undersides, up to where the bands start: the front's under
   * the porch's, the back's banded under its slope. */
  H.hidden(BRICK_X1, F, yF - ROOF_T, LEN, FRONT, 2.9);
  bands(H, 'x', -OVER, LEN, yB - ROOF_T, EAVE, (h) => [DEP, Math.min(B, (REAR_B - h) / PITCH)]);
  /* The shed dormer on the front plane over the dining room: three windows
   * in a white trimmed face, painted, since behind it is attic. */
  const dx0 = 9.7;
  const dx1 = 13.3;
  const dy = 0.35;
  const dh0 = frontTop(dy) - 0.3;
  const dh1 = dh0 + 1.3;
  H.box('homeSiding', dx0, dy, dh0, dx1, KNEE, dh1, { name: 'dormer' });
  for (const c of [10.45, 11.5, 12.55]) {
    H.paint('homeTrim', c - 0.42, dy - 0.03, dh0 + 0.32, c + 0.42, dy, dh1 - 0.14);
    H.paint('homeWindow', c - 0.33, dy - 0.04, dh0 + 0.41, c + 0.33, dy - 0.01, dh1 - 0.23);
  }
  const rise = frontTop(KNEE) - (dh1 + 0.1) - 0.02;
  const lip = dy - 0.2;
  H.prism('homeRoof', 'x', [[lip, dh1 - 0.05], [lip, dh1 + 0.1], [KNEE, dh1 + 0.1 + rise], [KNEE, dh1 - 0.05 + rise]], dx0 - 0.15, dx1 + 0.15);
  fascia(H, 'x', lip, -1, dh1 + 0.1, dx0 - 0.15, dx1 + 0.15);
  /* Its shallow roof is banded like the others, the bands' south edges
   * on its slope. */
  const deep = (KNEE - lip) / rise;
  bands(H, 'x', dx0 - 0.15, dx1 + 0.15, dh1, dh1 + 0.1 + rise, (h) => [lip + Math.max(0, h - dh1 - 0.1) * deep, KNEE]);
}

/* ------------------------------------------------------------------ */
/* The shell                                                           */
/* ------------------------------------------------------------------ */

const win = (c, w = 0.9, sill = WIN_SILL, top = WIN_TOP) => (floor) => [c - w / 2, c + w / 2, floor + sill, floor + top];
const door = (a, b, top = DOOR_H) => (floor) => [a, b, floor, floor + top];

/* The tall window in the brick block's front: one opening a storey, one
 * frame round both, and the floor between painted as the window's dark
 * middle, so it reads as the single two storey window it is. */
const TALL = { x0: 1.55, x1: 3.05 };
const TALL0 = [TALL.x0, TALL.x1, FLOOR0 + 0.75, CEIL0 - 0.1];
const TALL1 = [TALL.x0, TALL.x1, FLOOR1 + 0.15, CEIL1 - 0.15];

/* The openings in the outside walls, kept where the rooms' paint can find
 * them too. */
const FRONT_DOOR = door(5.65, 6.55, 2.15)(FLOOR0);
const SLIDER = door(2.7, 4.3, 2.15)(FLOOR0);
const BAY_OPEN = [5.6, 8.8, FLOOR0, CEIL0 - 0.15];
const KITCHEN_WIN = win(12.1, 1.1, 1.05, 2.2)(FLOOR0);
const BAY_LIGHTS = [[5.75, 6.66], [6.74, 7.66], [7.74, 8.65]].map(([a, b]) => [a, b, FLOOR0 + 0.45, FLOOR0 + 2.25]);
const BAY_SIDE = [8.48, 9.0, FLOOR0 + 0.45, FLOOR0 + 2.25];
const KIDS_WIN = [4.0, 4.8, 4.2, 5.2];

function exterior(H) {
  /* The slabs: the ground floor on the ground, the upper floor with the
   * stairwell cut out of it, and the ceiling under the roof. */
  H.box('homeFoundation', 0, FRONT, 0, LEN, DEP, FLOOR0, { name: 'slab' });
  H.box('homeFoundation', 5.4, DEP, 0, 9.0, 9.2, FLOOR0, { name: 'bay slab' });
  const upper = [
    [0, FRONT, BRICK_X1, DEP], [BRICK_X1, 0, STAIR_X0, DEP], [STAIR_X1, 0, LEN, DEP],
    [STAIR_X0, 0, STAIR_X1, STAIR_Y0], [STAIR_X0, STAIR_Y1, STAIR_X1, DEP],
  ];
  for (const [a, b, c, d] of upper) {
    H.box('homeWallIn', a, b, CEIL0, c, d, FLOOR1, { name: 'upper floor' });
  }
  /* Over the stair's foot, where the attic is above, a ceiling of its own. */
  H.box('homeWallIn', STAIR_X0, STAIR_Y0, CEIL0, STAIR_X1, KNEE - TI / 2, 2.9, { name: 'stair ceiling' });
  H.box('homeWallIn', 0, FRONT, CEIL1, BRICK_X1, DEP, EAVE, { name: 'ceiling' });
  H.box('homeWallIn', BRICK_X1, KNEE - TI / 2, CEIL1, LEN, DEP, EAVE, { name: 'ceiling' });

  /* THE BRICK BLOCK: front, west and east faces in brick, the tall window
   * in front, one window on its west face a storey. */
  extWall(H, 'x', FRONT + TX / 2, 0, BRICK_X1, [TALL0, TALL1], -1, { skin: 'homeBrick' });
  H.paint('homeWindow', TALL.x0, FRONT - 0.005, CEIL0 - 0.1, TALL.x1, FRONT + TX, FLOOR1 + 0.15);
  H.paint('homeTrim', TALL.x0, FRONT - 0.03, CEIL0 + 0.05, TALL.x1, FRONT - 0.005, CEIL0 + 0.13);
  extWall(H, 'y', BRICK_X1 - TX / 2, FRONT + TX, 0, [], 1, { skin: 'homeBrick' });

  /* The west wall, brick along the brick block and sided behind it, with
   * the chimney's chase standing out of it. */
  const westHoles = [win(0.7)(FLOOR0), win(0.7)(FLOOR1), win(7.3)(FLOOR1)];
  extWall(H, 'y', TX / 2, FRONT + TX, DEP - TX, westHoles, -1, { brick: [FRONT, 3.0] });

  /* The front wall behind the porch: the front door and the dining room's
   * two windows, one storey, the attic over it. */
  const frontHoles = [FRONT_DOOR, win(9.35)(FLOOR0), win(12.2)(FLOOR0)];
  extWall(H, 'x', TX / 2, BRICK_X1, LEN, frontHoles, -1, { top: FLOOR1 });
  /* The front door, dark, swung open into the foyer. */
  H.box('homeShutter', 5.67, TX, FLOOR0 + 0.01, 5.71, 1.0, FLOOR0 + 2.12, { name: 'front door' });

  /* THE BACK: the family room's window and slider, the bay opened right
   * through, the kitchen's window over the sink; above, the master's two
   * windows, the bathroom's, and one each for the back bedrooms. */
  const northHoles = [
    win(1.2)(FLOOR0), SLIDER, BAY_OPEN, KITCHEN_WIN,
    win(1.5)(FLOOR1), win(3.4)(FLOOR1), win(5.9, 0.7, 1.1)(FLOOR1), win(8.8)(FLOOR1), win(12.2)(FLOOR1),
  ];
  extWall(H, 'x', DEP - TX / 2, 0, LEN, northHoles, 1);

  /* THE EAST WALL: one storey behind the porch, where it is the garage's
   * west wall, two from the knee wall back. The door from the back hall
   * into the garage; the kids' room's window over the garage roof, set high
   * to clear it; the back bedroom's. */
  extWall(H, 'y', LEN - TX / 2, 0, KNEE, [], 1, { top: FLOOR1, covered: [G_Y0, G_Y1] });
  const eastHoles = [door(3.85, 4.75)(FLOOR0), KIDS_WIN, win(7.2)(FLOOR1)];
  extWall(H, 'y', LEN - TX / 2, KNEE, DEP - TX, eastHoles, 1, { covered: [G_Y0, G_Y1] });

  /* The bay off the breakfast room: three white sides, the back one three
   * lights between two mullions, under a little roof of its own. */
  extWall(H, 'x', 9.2 - TX / 2, 5.4, 9.0, BAY_LIGHTS, 1, { top: 2.85, skin: 'homeTrim' });
  extWall(H, 'y', 5.4 + TX / 2, DEP, 9.2 - TX, [BAY_SIDE], -1, { top: 2.85, skin: 'homeTrim' });
  extWall(H, 'y', 9.0 - TX / 2, DEP, 9.2 - TX, [BAY_SIDE], 1, { top: 2.85, skin: 'homeTrim' });
  H.box('homeWallIn', 5.4, DEP, CEIL0 - 0.05, 9.0, 9.2, 2.85, { name: 'bay ceiling' });
  const bayTop = (py) => 3.4 - ((py - DEP + 0.05) * 0.42) / (9.5 - DEP + 0.05);
  H.prism('homeRoof', 'x', [[DEP - 0.05, bayTop(DEP - 0.05) - 0.2], [9.5, bayTop(9.5) - 0.2], [9.5, bayTop(9.5)], [DEP - 0.05, bayTop(DEP - 0.05)]], 5.25, 9.15);
  bands(H, 'x', 5.25, 9.15, 2.85, bayTop(DEP), (h) => [DEP, Math.min(9.5, DEP - 0.05 + ((3.4 - h) * (9.5 - DEP + 0.05)) / 0.42)]);

  mainRoof(H);
  /* The brick block's roof, a gable to the street, running back into the
   * main roof: with its overhang to the east over the porch, and without
   * it behind the front wall, where the east slope is inside the main roof
   * and an overhang would hang into the rooms upstairs. */
  gableRoof(H, 'y', 0, BRICK_X1, FRONT, 0, EAVE, EAVE, { gables: 'e0', gable: 'homeBrick', E1: 0 });
  gableRoof(H, 'y', 0, BRICK_X1, 0, 5.0, EAVE, EAVE, { gables: 'none', E0: 0, E1: 5.0, edge1: BRICK_X1 });

  /* The chimney, a brick chase on the west gable from the ground to past
   * the ridge, the flue's cap on it. */
  H.box('homeBrick', -0.75, 5.05, 0, 0, 6.35, RIDGE_H + 0.7, { name: 'chimney' });
  H.box('homeBrick', -0.85, 4.95, RIDGE_H + 0.7, 0.1, 6.45, RIDGE_H + 0.85, { name: 'chimney cap' });
  H.box('homeSteel', -0.6, 5.35, RIDGE_H + 0.85, -0.15, 6.05, RIDGE_H + 1.15, { name: 'flue cap', kind: 'obstacle' });

  porch(H);
}

/*
 * THE PORCH: across the front between the brick block and the garage,
 * under the front plane of the main roof. White square posts with braces
 * curving out under the beam, a white ceiling, a step up to it. The end
 * posts stand against the walls, so there is no slot beside them.
 */
function porch(H) {
  const y0 = FRONT;
  H.box('homeFoundation', BRICK_X1, y0, 0, LEN, 0, FLOOR0, { name: 'porch' });
  H.box('homeFoundation', 5.3, y0 - 0.35, 0, 6.9, y0, FLOOR0 * 0.5, { name: 'step' });
  H.box('homeTrim', BRICK_X1, y0, CEIL0, LEN, 0, 2.9, { name: 'porch ceiling' });
  H.box('homeTrim', BRICK_X1, y0, 2.55, LEN, y0 + 0.2, CEIL0, { name: 'porch beam' });
  const py = y0 + 0.1;
  for (const x of [BRICK_X1 + 0.08, 7.05, 9.4, 11.7, LEN - 0.08]) {
    H.box('homeTrim', x - 0.08, py - 0.08, FLOOR0, x + 0.08, py + 0.08, 2.55, { name: 'porch post', kind: 'pole' });
    for (const s of [-1, 1]) {
      if ((x < 5 && s < 0) || (x > 13.5 && s > 0)) {
        continue;
      }
      H.cap('homeTrim', [x + s * 0.06, py, 2.05], [x + s * 0.5, py, 2.55], 0.04, { seg: 6, solid: false });
    }
  }
}

/*
 * An EXTERIOR WALL: the core in the inside white, the outer face a skin of
 * siding (or `skin`), a frame round every opening outside. `out` is which
 * face is outside, +1 north or east. `covered` is the stretch of the wall
 * the garage stands against, which takes no skin below the garage's top.
 * `brick` is a stretch faced in brick instead of siding.
 */
function extWall(H, dir, at, a0, a1, holes, out, o = {}) {
  const top = o.top ?? EAVE;
  const skin = o.skin ?? 'homeSiding';
  H.wall(dir, at, a0, a1, 0, top, { t: TX, holes, name: 'outer wall' });
  const surface = at + out * (TX / 2 + 0.003);
  const lo = dir === 'y' ? a0 - TX : a0;
  const hi = dir === 'y' ? a1 + TX : a1;
  const pieces = [];
  if (o.covered) {
    const [c0, c1] = o.covered;
    if (c0 > lo) {
      pieces.push([lo, Math.min(hi, c0), 0]);
    }
    pieces.push([Math.max(lo, c0), Math.min(hi, c1), G_TOP]);
    if (c1 < hi) {
      pieces.push([Math.max(lo, c1), hi, 0]);
    }
  } else {
    pieces.push([lo, hi, 0]);
  }
  for (const [b0, b1, h0] of pieces) {
    if (!(b1 - b0 > 1e-6) || !(top - h0 > 1e-6)) {
      continue;
    }
    const hs = holes.filter(([x0, x1, y0, y1]) => x1 > b0 && x0 < b1 && y1 > h0 && y0 < top);
    if (o.brick) {
      const [k0, k1] = o.brick;
      face(H, 'homeBrick', dir, surface, Math.max(b0, k0), Math.min(b1, k1), h0, top, hs, out);
      face(H, skin, dir, surface, Math.max(b0, k1), b1, h0, top, hs, out);
    } else {
      face(H, skin, dir, surface, b0, b1, h0, top, hs, out);
    }
  }
  for (const h of holes) {
    const window = h[2] > 0.3;
    H.frame(dir, at, TX, out, h, 'homeTrim', { sill: window, sash: window && skin !== 'homeTrim' ? 'homeShutter' : null });
  }
  /* A water table round the foot of the sided walls, in trim. */
  if (skin === 'homeSiding' && !o.covered) {
    if (dir === 'x') {
      H.paint('homeTrim', lo - 0.02, at + out * (TX / 2), 0, hi + 0.02, at + out * (TX / 2 + 0.04), 0.22);
    } else {
      H.paint('homeTrim', at + out * (TX / 2), lo - 0.02, 0, at + out * (TX / 2 + 0.04), hi + 0.02, 0.22);
    }
  }
}

/*
 * PAINT ON A WALL FACE, with its openings left open. `at` is the face's
 * plane (px for a 'y' wall, py for an 'x' one), the paint a whisker proud
 * of it on the side `side` (+1 north or east).
 */
function face(H, m, dir, at, a0, a1, h0, h1, holes = [], side = 1, skin = 0.008) {
  if (!(a1 - a0 > 1e-6) || !(h1 - h0 > 1e-6)) {
    return;
  }
  const centre = at + side * (skin / 2 + 0.004);
  H.P.wall(m, wallSpec(dir, centre, skin, a0, a1, h0, h1, holes), { solid: false, cast: false, name: 'paint' });
}

/*
 * A ROOM'S FOUR FACES, painted from h0 to h1: `r` the room's inside
 * rectangle, `holes` the openings on each side ('s', 'n', 'w', 'e') in
 * the plan's terms. A side given as false is open and left bare; one given
 * as { a0, a1, holes } is painted over that stretch only.
 */
function roomFaces(H, m, r, h0, h1, holes = {}, proud = 0) {
  const sides = [
    ['s', 'x', r.y0, r.x0, r.x1, 1],
    ['n', 'x', r.y1, r.x0, r.x1, -1],
    ['w', 'y', r.x0, r.y0, r.y1, 1],
    ['e', 'y', r.x1, r.y0, r.y1, -1],
  ];
  for (const [k, dir, at, a0, a1, side] of sides) {
    const o = holes[k];
    if (o === false) {
      continue;
    }
    const span = o && !Array.isArray(o) ? o : {};
    const list = Array.isArray(o) ? o : (o && o.holes) || [];
    face(H, m, dir, at + side * proud, span.a0 ?? a0, span.a1 ?? a1, h0, h1, list, side, 0.008 + proud);
  }
}

/* A room's chair rail or wainscot cap: a band round it, proud of the
 * paint, at `h`. */
function chairRail(H, r, h, holes, m = 'homeWhite') {
  roomFaces(H, m, r, h - 0.07, h, holes, 0.014);
}

/* ------------------------------------------------------------------ */
/* Inside: doors, the stairs                                           */
/* ------------------------------------------------------------------ */

/* An interior doorway's casing on both faces, `casing` [the north or east
 * face's, the south or west face's], and its door swung open at right
 * angles to the wall on the side `leaf.side`, hinged at `leaf.at` (b0 or
 * b1). */
function doorway(H, dir, at, b0, b1, floor, o = {}) {
  const hole = [b0, b1, floor, floor + (o.h ?? DOOR_H)];
  const [cp, cn] = o.casing ?? ['homeWhite', 'homeWhite'];
  H.frame(dir, at, TI, 1, hole, cp, { w: 0.08, d: 0.02 });
  H.frame(dir, at, TI, -1, hole, cn, { w: 0.08, d: 0.02 });
  if (o.leaf) {
    const s = o.leaf.side;
    const hx = o.leaf.at === 'b0' ? b0 + 0.04 : b1 - 0.04;
    const w = b1 - b0 - 0.05;
    const f = at + s * (TI / 2);
    const m = o.leaf.m ?? 'homeWhite';
    if (dir === 'x') {
      H.box(m, hx - 0.02, f, floor + 0.01, hx + 0.02, f + s * w, floor + DOOR_H - 0.03, { name: 'door' });
    } else {
      H.box(m, f, hx - 0.02, floor + 0.01, f + s * w, hx + 0.02, floor + DOOR_H - 0.03, { name: 'door' });
    }
  }
  return hole;
}

/*
 * THE STAIRS: thirteen risers up the east side of the foyer, solid from
 * the floor to each tread so nothing under them is a slot; the open west
 * side white balusters under a dark stained rail, solid as a band the
 * height of the rail, so it is a wall to the physics the way it is a wall
 * to the eye. A runner up the treads.
 */
function stairs(H) {
  const x0 = STAIR_X0;
  const x1 = STAIR_X1;
  const rail = 0.9;
  const rx = x0 + 0.04;
  for (let i = 0; i < STAIR_RISERS - 1; i += 1) {
    const y0 = STAIR_Y0 + i * STAIR_TREAD;
    const hTop = FLOOR0 + (i + 1) * STAIR_RISE;
    H.box('homeWhite', x0, y0, FLOOR0, x1, y0 + STAIR_TREAD, hTop - 0.03, { name: 'stair' });
    H.box('homeFloor', x0 - 0.03, y0 - 0.02, hTop - 0.03, x1, y0 + STAIR_TREAD, hTop, { name: 'tread' });
    H.paint('homeWicker', x0 + 0.22, y0 - 0.025, hTop, x1 - 0.18, y0 + STAIR_TREAD, hTop + 0.006);
    for (const t of [0.25, 0.75]) {
      const y = y0 + t * STAIR_TREAD;
      const hr = FLOOR0 + STAIR_RISE + rail + ((y - STAIR_Y0 - 0.1) / (STAIR_Y1 - STAIR_Y0 - 0.1)) * (FLOOR1 - FLOOR0 - STAIR_RISE);
      H.post('homeWhite', rx, y, hTop, hr, 0.018, { seg: 5, solid: false });
    }
    H.hidden(rx - 0.03, y0, hTop, rx + 0.03, y0 + STAIR_TREAD, hTop + rail);
  }
  const foot = [rx, STAIR_Y0 + 0.1, FLOOR0 + STAIR_RISE + rail];
  const head = [rx, STAIR_Y1, FLOOR1 + rail];
  H.cap('homeShelf', foot, head, 0.035, { seg: 8, solid: false });
  H.box('homeShelf', rx - 0.07, STAIR_Y0 - 0.12, FLOOR0, rx + 0.07, STAIR_Y0 + 0.02, FLOOR0 + 1.15, { name: 'newel' });
}

/* The upstairs balustrade round the stairwell: a dark rail on a solid band,
 * white balusters painted. */
function balustrade(H, dir, at, a0, a1, f) {
  const rail = 0.9;
  if (dir === 'y') {
    H.box('homeShelf', at - 0.04, a0, f + rail - 0.06, at + 0.04, a1, f + rail, { name: 'rail' });
    H.hidden(at - 0.03, a0, f, at + 0.03, a1, f + rail - 0.06);
    for (let y = a0 + 0.06; y < a1 - 0.03; y += 0.14) {
      H.post('homeWhite', at, y, f, f + rail - 0.06, 0.018, { seg: 5, solid: false });
    }
  } else {
    H.box('homeShelf', a0, at - 0.04, f + rail - 0.06, a1, at + 0.04, f + rail, { name: 'rail' });
    H.hidden(a0, at - 0.03, f, a1, at + 0.03, f + rail - 0.06);
    for (let x = a0 + 0.06; x < a1 - 0.03; x += 0.14) {
      H.post('homeWhite', x, at, f, f + rail - 0.06, 0.018, { seg: 5, solid: false });
    }
  }
}

/* ------------------------------------------------------------------ */
/* The ground floor                                                    */
/* ------------------------------------------------------------------ */

/* The doors and openings between the ground floor's rooms. */
const D1 = [1.0, 1.85];
const D2 = [3.4, 4.25];
const WIDE = [5.3, 7.8, FLOOR0, FLOOR0 + 2.2];
const PASS = [TX, STAIR_Y0 - 0.05, FLOOR0, FLOOR0 + 2.25];
const DD = [8.5, 9.35];
const KIT = [11.4, 12.3, FLOOR0, FLOOR0 + 2.2];

function groundFloor(H) {
  const f = FLOOR0;
  const c = CEIL0;
  H.floor('homeFloor', TX, FRONT + TX, LEN - TX, DEP - TX, f);
  H.floor('homeFloor', 5.4 + TX, DEP, 9.0 - TX, 9.2 - TX, f);

  /*
   * THE WALLS, cores in the white, each room's colour painted on its faces
   * below. px 4.6: front room | foyer, family room | foyer, family room |
   * breakfast room, with the wide cased opening from the breakfast room
   * that every still of the family room is taken through.
   */
  H.wall('y', BRICK_X1, 0, DEP - TX, f, c, { holes: [[...D1, f, f + DOOR_H], [...D2, f, f + DOOR_H], WIDE] });
  const dark = ['homeShelf', 'homeShelf'];
  doorway(H, 'y', BRICK_X1, ...D1, f, { casing: dark, leaf: { side: -1, at: 'b0', m: 'homeShelf' } });
  doorway(H, 'y', BRICK_X1, ...D2, f, { casing: dark, leaf: { side: -1, at: 'b1', m: 'homeShelf' } });
  H.frame('y', BRICK_X1, TI, 1, WIDE, 'homeWhite', { w: 0.1, d: 0.02 });
  H.frame('y', BRICK_X1, TI, -1, WIDE, 'homeWhite', { w: 0.1, d: 0.02 });
  /* py 3.0: front room | family room. */
  H.wall('x', 3.0, TX, BRICK_X1 - TI / 2, f, c);
  /* px 8.36: the stair's east wall, the dining room behind it, and at the
   * stair's foot the cased way through from the foyer to the dining room. */
  H.wall('y', STAIR_X1 + TI / 2, TX, 5.0, f, c, { holes: [PASS] });
  H.frame('y', STAIR_X1 + TI / 2, TI, -1, PASS, 'homeShelf', { w: 0.08, d: 0.02 });
  H.frame('y', STAIR_X1 + TI / 2, TI, 1, PASS, 'homeShelf', { w: 0.08, d: 0.02 });
  /* py 3.6: dining room | back hall, its door dark on the dining side. */
  H.wall('x', 3.6, STAIR_X1 + TI, LEN - TX, f, c, { holes: [[...DD, f, f + DOOR_H]] });
  doorway(H, 'x', 3.6, ...DD, f, { casing: ['homeWhite', 'homeShelf'], leaf: { side: 1, at: 'b0' } });
  /* py 5.0, from the stair's west side to the east wall: the back hall's
   * north wall, the breakfast room's white bookshelves on its far face, and
   * the cased way from the back hall into the kitchen. The foyer is open to
   * the breakfast room west of it. */
  H.wall('x', 5.0, STAIR_X0, LEN - TX, f, c, { holes: [KIT] });
  H.frame('x', 5.0, TI, 1, KIT, 'homeWhite', { w: 0.08, d: 0.02 });
  H.frame('x', 5.0, TI, -1, KIT, 'homeWhite', { w: 0.08, d: 0.02 });
  shelves(H, 7.45, 5.0 + TI / 2, 10.2, f);

  /*
   * THE ROOMS' COLOURS. Pale cream in the front room and the foyer, the
   * family room white, pale blue grey over a dark stained wainscot in the
   * dining room, olive green with a white chair rail through the back hall,
   * the breakfast room and the kitchen.
   */
  const fw = (c0, w = 0.9) => [c0 - w / 2, c0 + w / 2, f + WIN_SILL, f + WIN_TOP];
  const fd = (a, b, top = DOOR_H) => [a, b, f, f + top];
  const front = { x0: TX, y0: FRONT + TX, x1: BRICK_X1 - TI / 2, y1: 3.0 - TI / 2 };
  roomFaces(H, 'homeWallCream', front, f, c, { s: [TALL0], w: [fw(0.7)], e: false });
  face(H, 'homeWallCream', 'y', BRICK_X1 - TX, FRONT + TX, 0, f, c, [], -1);
  face(H, 'homeWallCream', 'y', BRICK_X1 - TI / 2, 0, 3.0 - TI / 2, f, c, [fd(...D1)], -1);
  roomFaces(H, 'homeWallCream', { x0: BRICK_X1 + TI / 2, y0: TX, x1: STAIR_X1, y1: 5.0 }, f, c, {
    s: [FRONT_DOOR], w: [fd(...D1), fd(...D2)], e: false, n: false,
  });
  face(H, 'homeWallCream', 'y', STAIR_X1, STAIR_Y0, 5.0 - TI / 2, f, c, [], -1);
  const dining = { x0: STAIR_X1 + TI, y0: TX, x1: LEN - TX, y1: 3.6 - TI / 2 };
  const diningHoles = { s: [fw(9.35), fw(12.2)], n: [fd(...DD)], w: [PASS] };
  roomFaces(H, 'homeShelf', dining, f, f + 0.95, diningHoles);
  roomFaces(H, 'homeWallBlue', dining, f + 0.95, c, diningHoles);
  chairRail(H, dining, f + 0.98, diningHoles, 'homeShelf');
  const hall = { x0: STAIR_X1 + TI, y0: 3.6 + TI / 2, x1: LEN - TX, y1: 5.0 - TI / 2 };
  const hallHoles = { s: [fd(...DD)], n: [KIT], e: [fd(3.85, 4.75)] };
  roomFaces(H, 'homeWallGreen', hall, f, c, hallHoles);
  chairRail(H, hall, f + 0.92, hallHoles);
  const back = { x0: BRICK_X1 + TI / 2, y0: 5.0 + TI / 2, x1: LEN - TX, y1: DEP - TX };
  const backHoles = { w: [WIDE], s: { a0: STAIR_X0, holes: [KIT] }, n: [BAY_OPEN, KITCHEN_WIN] };
  roomFaces(H, 'homeWallGreen', back, f, c, backHoles);
  chairRail(H, { ...back, x1: 10.4 }, f + 0.92, { ...backHoles, e: false, n: [BAY_OPEN] });
  roomFaces(H, 'homeWallGreen', { x0: 5.4 + TX, y0: DEP, x1: 9.0 - TX, y1: 9.2 - TX }, f, CEIL0 - 0.05, {
    s: false, n: BAY_LIGHTS, w: [BAY_SIDE], e: [BAY_SIDE],
  });

  stairs(H);
  foyer(H);
  frontRoom(H);
  familyRoom(H);
  diningRoom(H);
  breakfast(H);
  kitchen(H);
  backHall(H);
}

/* A wall of built in shelves along an east west wall: one solid box from
 * the floor to the ceiling, so there is no slot over it, its boards' dark
 * backs and the books painted on its face. */
function shelves(H, a0, face0, a1, f) {
  const d = 0.38;
  const top = CEIL0;
  H.box('homeWhite', a0, face0, f, a1, face0 + d, top, { name: 'bookshelves' });
  const bays = Math.max(2, Math.round((a1 - a0) / 0.8));
  for (let i = 0; i < bays; i += 1) {
    const x0 = a0 + ((a1 - a0) * i) / bays + 0.04;
    const x1 = a0 + ((a1 - a0) * (i + 1)) / bays - 0.04;
    for (let k = 0; k < 4; k += 1) {
      const h0 = f + 0.95 + k * 0.32;
      H.paint('homeChair', x0, face0 + d, h0, x1, face0 + d + 0.005, h0 + 0.27);
      H.paint('homeBook', x0 + 0.05, face0 + d + 0.005, h0 + 0.02, x0 + (x1 - x0) * (0.45 + 0.1 * ((i + k) % 3)), face0 + d + 0.01, h0 + 0.23);
    }
    H.paint('homeChair', x0, face0 + d, f + 0.1, x1, face0 + d + 0.005, f + 0.8);
  }
}

/* A round table on a pedestal, drawn round and solid as the square inside
 * its top and the column under it, since a capsule as wide as a table top
 * is a ball as tall as one. */
function roundTable(H, m, x, y, r, h, foot = 'homeChair', h0 = FLOOR0) {
  const c = r * 0.8;
  H.cap(m, [x, y, h - 0.04], [x, y, h], r, { seg: 16, solid: false });
  H.hidden(x - c, y - c, h - 0.04, x + c, y + c, h, 'obstacle');
  H.post(foot, x, y, h0, h - 0.04, 0.06, { seg: 8, kind: 'pole' });
}

/* A chair: seat, four legs, a back on side `back` ('n', 's', 'e', 'w'). */
function chair(H, m, x, y, back, f = FLOOR0, o = {}) {
  const s = o.s ?? 0.22;
  const seat = f + (o.seat ?? 0.45);
  H.box(m, x - s, y - s, seat - 0.04, x + s, y + s, seat, { name: 'chair' });
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    H.post(m, x + dx * (s - 0.03), y + dy * (s - 0.03), f, seat - 0.04, 0.02, { seg: 5, kind: 'pole' });
  }
  const t = 0.04;
  const top = seat + (o.backH ?? 0.5);
  const [bx0, by0, bx1, by1] = back === 's' ? [x - s, y - s, x + s, y - s + t]
    : back === 'n' ? [x - s, y + s - t, x + s, y + s]
      : back === 'w' ? [x - s, y - s, x - s + t, y + s] : [x + s - t, y - s, x + s, y + s];
  H.box(m, bx0, by0, seat, bx1, by1, top, { name: 'chair back' });
}

/* THE FOYER: the front door, the stair, a dark chest by the wall, a
 * pendant. */
function foyer(H) {
  const f = FLOOR0;
  H.box('homeShelf', BRICK_X1 + TI / 2, 2.05, f, BRICK_X1 + TI / 2 + 0.45, 2.95, f + 0.5, { name: 'chest' });
  H.paint('homePlay', 5.0, 0.6, f + 0.004, 6.9, 3.6, f + 0.012);
  H.drum('homeLamp', 5.95, 2.4, CEIL0 - 0.1, CEIL0, 0.2, { seg: 10 });
}

/* THE FRONT ROOM, in the brick block: the tall window, a red cabinet with
 * the television on it, the dark upright piano, a white bench under the
 * window, a red rug, dark stained trim. */
function frontRoom(H) {
  const f = FLOOR0;
  const n = 3.0 - TI / 2;
  H.box('homePlay', TX, 1.35, f, TX + 0.48, n, f + 0.75, { name: 'tv cabinet' });
  H.box('homeScreen', TX, 1.65, f + 0.85, TX + 0.06, 2.65, f + 1.45, { name: 'television', kind: 'obstacle' });
  H.paint('homeChair', TX + 0.06, 2.05, f + 0.75, TX + 0.2, 2.25, f + 0.85);
  H.box('homeShelf', 1.2, n - 0.6, f, 2.7, n, f + 1.25, { name: 'piano' });
  H.box('homeShelf', 1.25, n - 0.8, f + 0.72, 2.65, n - 0.6, f + 0.8, { name: 'piano keys' });
  H.paint('homeWhite', 1.3, n - 0.79, f + 0.8, 2.6, n - 0.62, f + 0.81);
  H.box('homeWhite', 1.6, FRONT + TX, f, 3.0, FRONT + TX + 0.4, f + 0.45, { name: 'bench' });
  H.paint('homePlay', 0.8, -0.8, f + 0.004, 3.8, 2.0, f + 0.012);
  H.paint('homeBook', 1.0, -0.6, f + 0.012, 3.6, -0.45, f + 0.016);
  H.paint('homeBook', 1.0, 1.65, f + 0.012, 3.6, 1.8, f + 0.016);
  /* An armchair in the corner by the door, against the wall. */
  H.box('homeSofa', 3.64, n - 0.8, f, BRICK_X1 - TI / 2, n, f + 0.45, { name: 'armchair' });
  H.box('homeSofa', 3.64, n - 0.2, f + 0.45, BRICK_X1 - TI / 2, n, f + 0.9, { name: 'armchair back' });
  H.drum('homeLamp', 2.35, 0.75, CEIL0 - 0.1, CEIL0, 0.2, { seg: 10 });
}

/*
 * THE FAMILY ROOM: white walls, the dark cube shelving with its wicker
 * baskets either side of a stone fireplace on the chimney's wall and the
 * television over it, a beige sectional, a navy rug, the slider out to the
 * patio, a dome light.
 */
function familyRoom(H) {
  const f = FLOOR0;
  const w = TX;
  H.box('homeStone', w, 5.05, f, w + 0.45, 6.35, f + 1.3, { name: 'fireplace' });
  H.paint('homeChair', w + 0.45, 5.4, f + 0.12, w + 0.455, 6.0, f + 0.85);
  H.box('homeShelf', w, 4.95, f + 1.3, w + 0.55, 6.45, f + 1.38, { name: 'mantel' });
  H.box('homeStone', w, 5.05, f + 1.38, w + 0.2, 6.35, CEIL0, { name: 'chimney breast' });
  H.box('homeScreen', w + 0.2, 5.2, f + 1.6, w + 0.25, 6.2, f + 2.2, { name: 'television', kind: 'obstacle' });
  H.box('homeStone', w + 0.45, 4.95, f, w + 0.95, 6.45, f + 0.08, { name: 'hearth' });
  /* The cube shelving, floor to ceiling either side, baskets in the low
   * cubes. */
  for (const [a, b] of [[3.0 + TI / 2, 4.95], [6.45, DEP - TX]]) {
    H.box('homeShelf', w, a, f, w + 0.42, b, CEIL0, { name: 'built in' });
    const n = Math.max(2, Math.round((b - a) / 0.42));
    for (let j = 0; j < n; j += 1) {
      const y0 = a + ((b - a) * j) / n + 0.03;
      const y1 = a + ((b - a) * (j + 1)) / n - 0.03;
      for (let k = 0; k < 5; k += 1) {
        const h0 = f + 0.06 + k * 0.46;
        H.paint(k < 2 ? 'homeWicker' : 'homeChair', w + 0.42, y0, h0, w + 0.426, y1, h0 + 0.38);
        if (k >= 2 && (j + k) % 3 === 0) {
          H.paint('homeBook', w + 0.426, y0 + 0.04, h0 + 0.02, w + 0.43, y0 + (y1 - y0) * 0.6, h0 + 0.3);
        }
      }
    }
  }
  /* The sectional: its long run facing the fireplace, a return along the
   * north wall, and a console behind it with two lamps. */
  sofa(H, 2.3, 4.2, 3.2, 7.4, 'e');
  sofa(H, 1.3, 7.4, 2.3, 8.15, 'n');
  H.box('homeShelf', 3.2, 4.7, f, 3.57, 6.9, f + 0.78, { name: 'console' });
  for (const y of [5.0, 6.6]) {
    H.post('homeChair', 3.39, y, f + 0.78, f + 1.05, 0.07, { seg: 8, kind: 'obstacle' });
    H.drum('homeLamp', 3.39, y, f + 1.05, f + 1.32, 0.13, { seg: 10 });
  }
  H.paint('homeRug', 0.95, 3.85, f + 0.004, 3.95, 7.65, f + 0.012);
  for (let i = 0; i < 6; i += 1) {
    const y = 4.1 + i * 0.58;
    H.paint('homeWhite', 1.15 + (i % 2) * 0.4, y, f + 0.012, 1.55 + (i % 2) * 0.4, y + 0.22, f + 0.016);
    H.paint('homeWhite', 2.75 - (i % 2) * 0.3, y + 0.25, f + 0.012, 3.05 - (i % 2) * 0.3, y + 0.45, f + 0.016);
  }
  H.drum('homeLamp', 1.9, 5.7, CEIL0 - 0.1, CEIL0, 0.22, { seg: 10 });
}

/* A sofa section from (x0, y0) to (x1, y1), its back to side `back` ('e'
 * or 'n'). */
function sofa(H, x0, y0, x1, y1, back) {
  const f = FLOOR0;
  const seat = f + 0.45;
  const top = f + 0.85;
  const m = 'homeSofa';
  const bt = 0.22;
  H.box(m, x0, y0, f, x1, y1, seat, { name: 'sofa' });
  if (back === 'e') {
    H.box(m, x1 - bt, y0, seat, x1, y1, top, { name: 'sofa back' });
    const n = 3;
    for (let i = 0; i < n; i += 1) {
      const a = y0 + 0.2 + ((y1 - y0 - 0.4) * i) / n;
      const b = y0 + 0.2 + ((y1 - y0 - 0.4) * (i + 1)) / n - 0.04;
      H.paint('homeCushion', x0 + 0.05, a, seat, x1 - bt, b, seat + 0.012);
    }
    H.box(m, x0, y0, seat, x1, y0 + 0.18, f + 0.65, { name: 'sofa arm' });
  } else {
    H.box(m, x0, y1 - bt, seat, x1, y1, top, { name: 'sofa back' });
    H.paint('homeCushion', x0 + 0.2, y0 + 0.05, seat, x1 - 0.05, y1 - bt, seat + 0.012);
    H.box(m, x0, y0, seat, x0 + 0.18, y1, f + 0.65, { name: 'sofa arm' });
  }
}

/* THE DINING ROOM, front east: a wood topped table on white legs, white
 * ladder back chairs, a blue teal rug, the white glass fronted hutch at the
 * end, a red armchair in the corner by it. */
function diningRoom(H) {
  const f = FLOOR0;
  const top = f + 0.76;
  const t = { x0: 10.1, x1: 12.3, y0: 1.35, y1: 2.35 };
  H.box('homeWood', t.x0, t.y0, top - 0.05, t.x1, t.y1, top, { name: 'table' });
  for (const [x, y] of [[t.x0 + 0.08, t.y0 + 0.08], [t.x1 - 0.08, t.y0 + 0.08], [t.x0 + 0.08, t.y1 - 0.08], [t.x1 - 0.08, t.y1 - 0.08]]) {
    H.box('homeWhite', x - 0.04, y - 0.04, f, x + 0.04, y + 0.04, top - 0.05, { name: 'table leg' });
  }
  for (const x of [10.6, 11.8]) {
    chair(H, 'homeWhite', x, t.y0 - 0.3, 's', f, { backH: 0.55 });
    chair(H, 'homeWhite', x, t.y1 + 0.3, 'n', f, { backH: 0.55 });
  }
  chair(H, 'homeWhite', t.x0 - 0.35, 1.85, 'w', f, { backH: 0.55 });
  chair(H, 'homeWhite', t.x1 + 0.3, 1.85, 'e', f, { backH: 0.55 });
  H.paint('homeTeal', 9.5, 0.65, f + 0.004, 12.9, 3.05, f + 0.012);
  for (let i = 0; i < 5; i += 1) {
    H.paint('homeWhite', 9.7 + i * 0.66, 0.8, f + 0.012, 9.95 + i * 0.66, 2.9, f + 0.016);
  }
  /* The hutch. */
  const hx = LEN - TX;
  H.box('homeWhite', hx - 0.5, 0.75, f, hx, 2.75, f + 0.9, { name: 'hutch' });
  H.box('homeWhite', hx - 0.38, 0.8, f + 0.9, hx, 2.7, f + 2.1, { name: 'hutch top' });
  for (const [a, b] of [[0.9, 1.7], [1.8, 2.6]]) {
    H.paint('homeWindow', hx - 0.385, a, f + 1.0, hx - 0.38, b, f + 2.0);
  }
  const n = 3.6 - TI / 2;
  H.box('homePlay', 13.0, 2.75, f, hx, n, f + 0.45, { name: 'armchair' });
  H.box('homePlay', 13.0, n - 0.2, f + 0.45, hx, n, f + 0.92, { name: 'armchair back' });
  H.drum('homeLamp', 11.2, 1.85, f + 1.85, CEIL0, 0.18, { seg: 10 });
}

/*
 * THE BREAKFAST ROOM, the clearest of the stills: a round white pedestal
 * table in the bay with white chairs round it, a glass globe on its cord
 * over it, the white bookshelves on the south wall and a white ledge of
 * books all round the room at the height of the door heads, the books
 * nearly to the ceiling and the solid closed over them, so the ledge is
 * not a slot.
 */
function breakfast(H) {
  const f = FLOOR0;
  const cx = 7.2;
  const cy = 8.0;
  roundTable(H, 'homeWhite', cx, cy, 0.55, f + 0.76, 'homeWhite');
  chair(H, 'homeWhite', cx - 0.85, cy, 'w');
  chair(H, 'homeWhite', cx + 0.85, cy, 'e');
  chair(H, 'homeWhite', cx, cy - 0.85, 's');
  chair(H, 'homeWhite', cx, cy + 0.75, 'n');
  H.post('homeChair', cx, cy, f + 1.8, CEIL0, 0.01, { seg: 4, solid: false });
  H.cap('homeLamp', [cx, cy, f + 1.7], [cx, cy, f + 1.7], 0.15, { look: 'capsule', seg: 10, kind: 'obstacle' });
  /* The ledge: along the west wall over the wide opening, the north wall
   * either side of the bay. */
  const lh = f + 2.25;
  const ledge = (x0, y0, x1, y1) => {
    H.box('homeWhite', x0, y0, lh - 0.04, x1, y1, lh, { name: 'book ledge', kind: 'obstacle' });
    H.hidden(x0, y0, lh, x1, y1, CEIL0, 'obstacle', 'books');
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.max(1, Math.round(Math.max(dx, dy) / 0.5));
    for (let i = 0; i < n; i += 1) {
      const a = (i + 0.1) / n;
      const b = (i + 0.85) / n;
      if (dx > dy) {
        H.paint(i % 2 ? 'homeBook' : 'homePlayBlue', x0 + dx * a, y0 + 0.03, lh, x0 + dx * b, y1 - 0.03, lh + 0.31 - (i % 3) * 0.03);
      } else {
        H.paint(i % 2 ? 'homeBook' : 'homePlay', x0 + 0.03, y0 + dy * a, lh, x1 - 0.03, y0 + dy * b, lh + 0.31 - (i % 3) * 0.03);
      }
    }
  };
  const w = BRICK_X1 + TI / 2;
  ledge(w, 5.06, w + 0.24, DEP - TX);
  ledge(w + 0.24, DEP - TX - 0.24, 5.6, DEP - TX);
  ledge(8.8, DEP - TX - 0.24, 10.4, DEP - TX);
  H.paint('homeWicker', 5.0, 6.5, f + 0.004, 6.4, 7.6, f + 0.012);
}

/*
 * THE KITCHEN: cream shaker cabinets under a dark granite top along the
 * back wall with the sink under the window and the fridge in the corner,
 * a run on the east wall with the cooktop, the island with three tall white
 * stools on its breakfast room side, the pressed tin panel over it, and the
 * four pink neon sticks the Uncrashed indoor race put at its corners.
 */
function kitchen(H) {
  const f = FLOOR0;
  const n = DEP - TX;
  const e = LEN - TX;
  const base = f + 0.88;
  const top = base + 0.04;
  const d = 0.62;
  H.box('homeCabinet', 10.5, n - d, f, 12.95, n, base, { name: 'cabinets' });
  H.box('homeCounter', 10.5, n - d - 0.03, base, 12.95, n, top, { name: 'counter' });
  H.box('homeCabinet', 10.5, n - 0.34, f + 1.45, 11.4, n, CEIL0, { name: 'uppers' });
  H.paint('homeSteel', 11.75, n - d + 0.08, top, 12.45, n - 0.1, top + 0.005);
  H.box('homeSteel', 12.98, n - 0.75, f, e, n, f + 1.85, { name: 'fridge' });
  H.paint('homeChair', 13.38, n - 0.755, f + 0.95, 13.42, n - 0.75, f + 1.6);
  H.box('homeCabinet', e - d, 5.6, f, e, n - 0.8, base, { name: 'cabinets' });
  H.box('homeCounter', e - d - 0.03, 5.6, base, e, n - 0.8, top, { name: 'counter' });
  H.box('homeCabinet', e - 0.34, 5.6, f + 1.45, e, n - 0.8, CEIL0, { name: 'uppers' });
  H.paint('homeChair', e - d + 0.08, 6.1, top, e - 0.08, 6.8, top + 0.006);
  H.box('homeSteel', e - 0.55, 6.1, f + 1.6, e, 6.8, f + 1.75, { name: 'hood' });
  for (let x = 10.6; x < 12.8; x += 0.6) {
    H.paint('homeCounter', x + 0.27, n - d - 0.005, f + 0.1, x + 0.29, n - d, base - 0.05);
  }
  for (let y = 5.7; y < n - 0.9; y += 0.6) {
    H.paint('homeCounter', e - d - 0.005, y + 0.27, f + 0.1, e - d, y + 0.29, base - 0.05);
  }
  /* The island, its overhang to the west for the stools. */
  const it = { x0: 11.1, x1: 12.5, y0: 6.1, y1: 6.9 };
  H.box('homeCabinet', 11.4, 6.15, f, 12.45, 6.85, base, { name: 'island' });
  H.box('homeCounter', it.x0, it.y0, base, it.x1, it.y1, top, { name: 'island top' });
  for (const y of [6.15, 6.5, 6.85]) {
    H.post('homeWhite', 10.85, y, f, f + 0.62, 0.025, { seg: 6, kind: 'pole' });
    H.drum('homeWood', 10.85, y, f + 0.62, f + 0.67, 0.12, { seg: 10 });
  }
  for (const [x, y] of [[it.x0, it.y0], [it.x1, it.y0], [it.x1, it.y1], [it.x0, it.y1]]) {
    H.post('homeNeon', x, y, top, top + 1.0, 0.025, { seg: 6, kind: 'pole' });
  }
  H.paint('homeSteel', 11.2, 6.05, CEIL0 - 0.006, 12.4, 6.95, CEIL0 - 0.001);
  for (const x of [11.5, 12.1]) {
    H.post('homeChair', x, 6.5, f + 1.95, CEIL0, 0.01, { seg: 4, solid: false });
    H.drum('homeLamp', x, 6.5, f + 1.8, f + 1.97, 0.12, { seg: 10 });
  }
}

/* THE BACK HALL: green walls, the white locker and cubby bench along its
 * south side with coats on hooks, a black and white runner, the door into
 * the garage at its end. */
function backHall(H) {
  const f = FLOOR0;
  const s = 3.6 + TI / 2;
  H.box('homeWhite', 10.3, s, f, 13.3, s + 0.42, f + 0.45, { name: 'bench' });
  H.box('homeWhite', 10.3, s, f + 1.55, 13.3, s + 0.36, CEIL0, { name: 'cubbies' });
  for (let i = 0; i < 5; i += 1) {
    const x = 10.45 + i * 0.58;
    H.paint('homeCounter', x + 0.28, s + 0.36, f + 1.6, x + 0.3, s + 0.365, f + 2.2);
    H.paint(['homePlay', 'homePlayBlue', 'homeTeal', 'homeWood', 'homeChair'][i], x, s + 0.02, f + 0.8, x + 0.36, s + 0.2, f + 1.48);
  }
  H.paint('homeChair', 8.7, 4.15, f + 0.004, 13.5, 4.8, f + 0.012);
  for (let x = 8.85; x < 13.4; x += 0.5) {
    H.paint('homeWhite', x, 4.22, f + 0.012, x + 0.22, 4.73, f + 0.016);
  }
}

/* ------------------------------------------------------------------ */
/* Upstairs                                                            */
/* ------------------------------------------------------------------ */

/*
 * No still shows the upper floor, so this is a plausible plan and no more:
 * the bedroom over the front room in the brick block, the master behind
 * it, a landing round the stairwell, a bathroom, two back bedrooms and a
 * kids' room over the garage's end. White doors, carpet.
 */
function upperFloor(H) {
  const f = FLOOR1;
  const c = CEIL1;
  H.floor('homeCarpet', TX, FRONT + TX, BRICK_X1, DEP - TX, f);
  H.floor('homeFloor', BRICK_X1, KNEE, STAIR_X0, 5.4, f);
  H.floor('homeFloor', STAIR_X0, STAIR_Y1, 10.4, 5.9, f);
  H.floor('homeFloor', STAIR_X1, KNEE, 10.4, STAIR_Y1, f);
  H.floor('homeTile', BRICK_X1, 5.4, 7.2, DEP - TX, f);
  H.floor('homeCarpet', 7.2, 5.9, 10.4, DEP - TX, f);
  H.floor('homeCarpet', 10.4, KNEE, LEN - TX, DEP - TX, f);

  /* The knee wall, the upper floor's front behind the porch. */
  H.wall('x', KNEE, BRICK_X1 + TI / 2, LEN - TX, f, c);
  H.box('homeWallIn', STAIR_X0, KNEE - TI / 2, CEIL0, STAIR_X1, KNEE + TI / 2, f, { name: 'stairwell head' });
  /* px 4.6: bedroom 2 | landing, master | landing, master | bath. */
  const b2 = [2.9, 3.7];
  const md = [3.95, 4.8];
  H.wall('y', BRICK_X1, 0, DEP - TX, f, c, { holes: [[...b2, f, f + DOOR_H], [...md, f, f + DOOR_H]] });
  doorway(H, 'y', BRICK_X1, ...b2, f, { leaf: { side: -1, at: 'b1' } });
  doorway(H, 'y', BRICK_X1, ...md, f, { leaf: { side: -1, at: 'b0' } });
  /* py 3.8: bedroom 2 | master. */
  H.wall('x', 3.8, TX, BRICK_X1 - TI / 2, f, c);
  /* py 5.4: landing | bath; py 5.9: landing | bedroom 4; px 7.2 between. */
  const ba = [5.3, 6.1];
  H.wall('x', 5.4, BRICK_X1 + TI / 2, 7.2 + TI / 2, f, c, { holes: [[...ba, f, f + DOOR_H]] });
  doorway(H, 'x', 5.4, ...ba, f, { leaf: { side: 1, at: 'b1' } });
  const b4 = [9.45, 10.3];
  H.wall('x', 5.9, 7.2 + TI / 2, 10.4 - TI / 2, f, c, { holes: [[...b4, f, f + DOOR_H]] });
  doorway(H, 'x', 5.9, ...b4, f, { leaf: { side: 1, at: 'b1' } });
  H.wall('y', 7.2, 5.4 - TI / 2, DEP - TX, f, c);
  /* px 10.4: landing | kids' room, landing | bedroom 5, bedroom 4 |
   * bedroom 5; py 5.0: kids' room | bedroom 5. */
  const kd = [2.9, 3.75];
  const b5 = [5.1, 5.85];
  H.wall('y', 10.4, KNEE + TI / 2, DEP - TX, f, c, { holes: [[...kd, f, f + DOOR_H], [...b5, f, f + DOOR_H]] });
  doorway(H, 'y', 10.4, ...kd, f, { leaf: { side: 1, at: 'b0' } });
  doorway(H, 'y', 10.4, ...b5, f, { leaf: { side: 1, at: 'b1' } });
  H.wall('x', 5.0, 10.4 + TI / 2, LEN - TX, f, c);
  /* Round the stairwell. */
  balustrade(H, 'y', STAIR_X0 - 0.04, KNEE + TI / 2, STAIR_Y1, f);
  balustrade(H, 'y', STAIR_X1 + 0.04, KNEE + TI / 2, STAIR_Y1, f);
  /* The kids' room in teal, the master in blue grey, the landing in the
   * foyer's cream. */
  roomFaces(H, 'homeWallKids', { x0: 10.4 + TI / 2, y0: KNEE + TI / 2, x1: LEN - TX, y1: 5.0 - TI / 2 }, f, c, {
    w: [[...kd, f, f + DOOR_H]], e: [KIDS_WIN],
  });
  roomFaces(H, 'homeWallBlue', { x0: TX, y0: 3.8 + TI / 2, x1: BRICK_X1 - TI / 2, y1: DEP - TX }, f, c, {
    w: [win(7.3)(f)], n: [win(1.5)(f), win(3.4)(f)], e: [[...md, f, f + DOOR_H]],
  });
  roomFaces(H, 'homeWallCream', { x0: BRICK_X1 + TI / 2, y0: KNEE + TI / 2, x1: STAIR_X0, y1: 5.4 - TI / 2 }, f, c, {
    w: [[...b2, f, f + DOOR_H], [...md, f, f + DOOR_H]], n: [[...ba, f, f + DOOR_H]], e: false,
  });

  /* Bedroom 2, over the front room, the tall window's upper half. */
  bed(H, TX, 1.3, 1.6, 2.05, 'w', 'homeRug');
  H.box('homeWood', TX, 2.95, f, TX + 0.45, 3.8 - TI / 2, f + 0.6, { name: 'nightstand' });
  H.box('homeWood', 3.9, 0.4, f, BRICK_X1 - TI / 2, 1.9, f + 0.85, { name: 'dresser' });
  H.paint('homeWicker', 1.0, -0.9, f + 0.004, 3.6, 0.3, f + 0.012);
  /* The master. */
  const ms = 3.8 + TI / 2;
  bed(H, TX, ms + 0.5, 2.0, 2.1, 'w', 'homeWhite');
  for (const y of [ms, ms + 2.55]) {
    H.box('homeWood', TX, y, f, TX + 0.45, y + 0.45, f + 0.6, { name: 'nightstand' });
    H.drum('homeLamp', TX + 0.1, y + 0.1, f + 0.6, f + 0.9, 0.12, { seg: 10 });
  }
  H.paint('homeRug', 1.6, 4.4, f + 0.004, 3.9, 7.6, f + 0.012);
  /* The kids' room: a red bed, a teal toy chest, a beanbag. */
  bed(H, LEN - TX - 1.95, KNEE + TI / 2, 1.0, 1.95, 'e', 'homePlay');
  H.box('homeTeal', 10.4 + TI / 2, 4.4, f, 11.8, 5.0 - TI / 2, f + 0.55, { name: 'toy chest' });
  H.box('homePlayBlue', LEN - TX - 0.7, 5.0 - TI / 2 - 0.6, f, LEN - TX, 5.0 - TI / 2, f + 0.45, { name: 'beanbag' });
  /* Bedroom 4 and bedroom 5. */
  bed(H, 7.2 + TI / 2, DEP - TX - 1.4, 1.4, 2.0, 'w', 'homeWhite');
  bed(H, 11.5, 5.0 + TI / 2, 1.6, 2.0, 's', 'homeRug');
  H.box('homeWood', 12.85, DEP - TX - 0.5, f, LEN - TX, DEP - TX, f + 0.85, { name: 'dresser' });
  /* The bath: a tub under the window, a vanity, the toilet. */
  H.box('homeWhite', BRICK_X1 + TI / 2, DEP - TX - 0.8, f, 6.4, DEP - TX, f + 0.55, { name: 'tub' });
  H.paint('homeWater', 4.8, DEP - TX - 0.7, f + 0.55, 6.3, DEP - TX - 0.1, f + 0.556);
  const bs = 5.4 + TI / 2;
  H.box('homeCabinet', 7.2 - TI / 2 - 0.55, bs, f, 7.2 - TI / 2, bs + 1.2, f + 0.85, { name: 'vanity' });
  H.box('homeCounter', 7.2 - TI / 2 - 0.58, bs, f + 0.85, 7.2 - TI / 2, bs + 1.2, f + 0.89, { name: 'vanity top' });
  H.paint('homeSteel', 7.2 - TI / 2 - 0.02, bs + 0.15, f + 1.1, 7.2 - TI / 2 - 0.005, bs + 1.05, f + 1.9);
  H.box('homeWhite', BRICK_X1 + TI / 2, 5.95, f, 5.15, 6.4, f + 0.42, { name: 'toilet' });
  H.box('homeWhite', BRICK_X1 + TI / 2, 6.0, f + 0.42, 4.85, 6.35, f + 0.8, { name: 'cistern' });
}

/* A bed against a wall: (x, y) its plan corner, w its width along the head
 * wall, l its length out from it, `head` the wall its head is on. */
function bed(H, x, y, w, l, head, m) {
  const f = FLOOR1;
  const along = head === 'w' || head === 'e';
  const x0 = x;
  const y0 = y;
  const x1 = x + (along ? l : w);
  const y1 = y + (along ? w : l);
  H.box('homeWood', x0, y0, f, x1, y1, f + 0.3, { name: 'bed frame' });
  H.box(m, x0 + 0.03, y0 + 0.03, f + 0.3, x1 - 0.03, y1 - 0.03, f + 0.55, { name: 'mattress' });
  const hb = 0.08;
  const hh = f + 1.15;
  if (head === 'w') {
    H.box('homeWood', x0, y0, f, x0 + hb, y1, hh, { name: 'headboard' });
    H.paint('homeWhite', x0 + 0.1, y0 + 0.12, f + 0.55, x0 + 0.5, y1 - 0.12, f + 0.68);
  } else if (head === 'e') {
    H.box('homeWood', x1 - hb, y0, f, x1, y1, hh, { name: 'headboard' });
    H.paint('homeWhite', x1 - 0.5, y0 + 0.12, f + 0.55, x1 - 0.1, y1 - 0.12, f + 0.68);
  } else if (head === 'n') {
    H.box('homeWood', x0, y1 - hb, f, x1, y1, hh, { name: 'headboard' });
    H.paint('homeWhite', x0 + 0.12, y1 - 0.5, f + 0.55, x1 - 0.12, y1 - 0.1, f + 0.68);
  } else {
    H.box('homeWood', x0, y0, f, x1, y0 + hb, hh, { name: 'headboard' });
    H.paint('homeWhite', x0 + 0.12, y0 + 0.1, f + 0.55, x1 - 0.12, y0 + 0.5, f + 0.68);
  }
}

/* ------------------------------------------------------------------ */
/* The garage                                                          */
/* ------------------------------------------------------------------ */

/*
 * THREE BAYS under the front plane of the roof carried on east, three grey
 * raised panel doors, the middle one up so the garage is a hangar a whoop
 * flies straight into. A car in the east bay, shelving and a bench.
 */
function garage(H) {
  const t = TX;
  const open = BAYS[1];
  const gd = [open[0], open[1], 0, BAY_H];
  extWall(H, 'x', G_Y0 + t / 2, G_X0, G_X1, [gd], -1, { top: G_TOP });
  extWall(H, 'x', G_Y1 - t / 2, G_X0, G_X1, [door(21.0, 21.9)(0), win(16.5, 0.9, 1.0, 2.2)(0)], 1, { top: G_TOP });
  extWall(H, 'y', G_X1 - t / 2, G_Y0 + t, G_Y1 - t, [win(2.0, 0.9, 1.0, 2.2)(0)], 1, { top: G_TOP });
  /* Its west wall where the porch is, the house's east wall behind it. */
  extWall(H, 'y', G_X0 + t / 2, G_Y0 + t, 0, [], -1, { top: G_TOP });
  H.box('homeWallIn', G_X0, G_Y0, G_TOP - 0.15, G_X1, G_Y1, G_TOP, { name: 'garage ceiling' });
  H.floor('homeFoundation', G_X0, G_Y0 + t, G_X1 - t, G_Y1 - t, 0.001);
  /* The two shut doors, grey panels on the wall's face, and the open one's
   * panel up under the ceiling on its rails. */
  for (const [a, b] of [BAYS[0], BAYS[2]]) {
    const y = G_Y0 - 0.012;
    H.paint('homeCoping', a, y - 0.04, 0, b, y, BAY_H);
    for (let k = 1; k < 4; k += 1) {
      H.paint('homeFoundation', a + 0.05, y - 0.05, (BAY_H * k) / 4 - 0.02, b - 0.05, y - 0.04, (BAY_H * k) / 4 + 0.02);
    }
    H.frame('x', G_Y0 + t / 2, t, -1, [a, b, 0, BAY_H], 'homeTrim');
  }
  H.box('homeCoping', gd[0] + 0.05, G_Y0 + t, 2.3, gd[1] - 0.05, G_Y0 + t + 2.3, 2.36, { name: 'garage door' });
  for (const x of [gd[0] + 0.02, gd[1] - 0.02]) {
    H.paint('homeSteel', x - 0.03, G_Y0 + t, 2.2, x + 0.03, G_Y0 + t + 2.4, 2.3);
  }
  /* The garage's own roof: its front in the main roof's front plane, a
   * ridge over its middle, its east end a gable. */
  gableRoof(H, 'x', G_Y0, G_Y1, G_X0, G_X1, frontTop(FRONT - OVER) + 0.15, G_TOP, { gables: 'e1', E0: G_X0, base: G_TOP });
  /* A workbench and shelving along the back wall, two quads on it,
   * shelving on the west wall, cases on the shelves. */
  const n = G_Y1 - t;
  H.box('homeWood', 15.2, n - 0.7, 0.85, 18.2, n, 0.92, { name: 'workbench' });
  H.box('homeShelf', 15.2, n - 0.7, 0, 18.2, n - 0.6, 0.85, { name: 'bench front' });
  quad(H, 16.0, n - 0.35, 0.92);
  quad(H, 17.2, n - 0.4, 0.92);
  H.box('homeSteel', G_X0, 0.0, 0, G_X0 + 0.5, 3.4, 1.9, { name: 'shelving' });
  for (let k = 0; k < 4; k += 1) {
    H.paint(['homePlay', 'homeTeal', 'homeShutter', 'homePlayBlue'][k], G_X0 + 0.5, 0.2 + k * 0.8, 0.3 + (k % 2) * 0.5, G_X0 + 0.505, 0.7 + k * 0.8, 0.7 + (k % 2) * 0.5);
  }
}

/* A five inch on a bench, at the house's scale a toy, at life size what
 * Nick flies through it. */
function quad(H, x, y, h) {
  const a = 0.11;
  H.paint('homeChair', x - a, y - 0.025, h, x + a, y + 0.025, h + 0.02);
  H.paint('homeChair', x - 0.025, y - a, h, x + 0.025, y + a, h + 0.02);
  H.paint('homePlay', x - 0.04, y - 0.04, h + 0.02, x + 0.04, y + 0.04, h + 0.06);
  for (const [dx, dy] of [[-a, -a], [a, -a], [-a, a], [a, a]]) {
    H.paint('homeNeon', x + dx * 0.7 - 0.05, y + dy * 0.7 - 0.05, h + 0.03, x + dx * 0.7 + 0.05, y + dy * 0.7 + 0.05, h + 0.035);
  }
}

/* ------------------------------------------------------------------ */
/* The back yard                                                       */
/* ------------------------------------------------------------------ */

function backYard(H) {
  /* The stamped patio from the back wall to the pool, round the fire pit,
   * and the pool's light concrete deck all round it, out to the pavilion. */
  H.paint('homeCoping', -4.6, DEP, 0, 11.2, 13.2, G_PAVE);
  H.paint('homeDrive', -0.2, 13.2, 0, 11.7, 21.0, G_PAVE);
  H.paint('homeDrive', 11.7, 15.0, 0, 15.2, 16.4, G_PAVE);
  /* THE POOL: water a shade darker at the deep end, a coping that stands a
   * hand high and is solid. */
  const p = POOL;
  H.paint('homeWater', p.x0, p.y0, G_PAVE, p.x1, p.y1, 0.05);
  H.paint('homeWaterDeep', p.x0 + 0.6, p.y0 + 0.6, 0.05, p.x0 + 4.0, p.y1 - 0.6, 0.052);
  const cw = 0.4;
  const ch = 0.1;
  H.box('homeFoundation', p.x0 - cw, p.y0 - cw, 0, p.x1 + cw, p.y0, ch, { name: 'coping' });
  H.box('homeFoundation', p.x0 - cw, p.y1, 0, p.x1 + cw, p.y1 + cw, ch, { name: 'coping' });
  H.box('homeFoundation', p.x0 - cw, p.y0, 0, p.x0, p.y1, ch, { name: 'coping' });
  H.box('homeFoundation', p.x1, p.y0, 0, p.x1 + cw, p.y1, ch, { name: 'coping' });
  for (const x of [p.x1 - 1.3, p.x1 - 0.7]) {
    H.cap('homeSteel', [x, p.y0 - 0.25, 0.1], [x, p.y0 - 0.25, 0.9], 0.025, { kind: 'pole', seg: 6 });
    H.cap('homeSteel', [x, p.y0 - 0.25, 0.9], [x, p.y0 + 0.2, 0.9], 0.025, { kind: 'pole', seg: 6 });
  }
  for (const x of [1.4, 3.0, 4.6]) {
    H.box('homeChair', x, 19.2, G_PAVE, x + 0.7, 20.9, 0.38, { name: 'lounger' });
    H.box('homeChair', x, 20.5, 0.38, x + 0.7, 20.9, 0.8, { name: 'lounger back' });
  }

  /*
   * THE PERGOLA against the back wall, over the bay and the slider:
   * weathered timber, four heavy posts on the outer beam, a ledger on the
   * wall, rafters across both 0.6 apart with their tails out past the beam,
   * which a five inch at this scale threads. It stands just under the
   * upstairs windows, over the bay's own roof.
   */
  const g = { x0: 2.2, x1: 9.8, y1: 12.7, h: 3.45 };
  for (const x of [2.4, 4.85, 7.35, 9.6]) {
    H.box('homeWood', x - 0.11, g.y1 - 0.11, 0, x + 0.11, g.y1 + 0.11, g.h, { name: 'pergola post' });
  }
  H.box('homeWood', g.x0 - 0.3, g.y1 - 0.09, g.h, g.x1 + 0.3, g.y1 + 0.09, g.h + 0.24, { name: 'pergola beam' });
  H.box('homeWood', g.x0 - 0.3, DEP, g.h, g.x1 + 0.3, DEP + 0.12, g.h + 0.2, { name: 'pergola ledger' });
  for (let x = g.x0; x <= g.x1 + 0.01; x += 0.6) {
    H.box('homeWood', x - 0.035, DEP + 0.12, g.h + 0.2, x + 0.035, g.y1 + 0.5, g.h + 0.36, { name: 'rafter' });
  }
  /* The dining set under it: a black metal table, chairs, the red umbrella. */
  roundTable(H, 'homeChair', 7.2, 11.0, 0.6, 0.75, 'homeChair', G_PAVE);
  for (const [x, y, b] of [[6.3, 11.0, 'w'], [8.1, 11.0, 'e'], [7.2, 10.1, 's'], [7.2, 11.85, 'n']]) {
    chair(H, 'homeChair', x, y, b, G_PAVE, { s: 0.24, backH: 0.45 });
  }
  H.post('homeWhite', 7.2, 11.0, 0.75, 2.6, 0.025, { seg: 6, kind: 'pole' });
  H.cone('homePlay', 7.2, 11.0, 2.15, 1.25, 0.55);
  H.hidden(6.4, 10.2, 2.15, 8.0, 11.8, 2.45, 'obstacle');
  /* A dark wicker loveseat against the wall west of the slider. */
  H.box('homeChair', 0.5, DEP + 0.05, G_PAVE, 2.0, DEP + 0.8, 0.45, { name: 'loveseat' });
  H.box('homeChair', 0.5, DEP + 0.05, 0.45, 2.0, DEP + 0.25, 0.85, { name: 'loveseat back' });
  H.paint('homeWhite', 0.6, DEP + 0.25, 0.45, 1.9, DEP + 0.75, 0.47);

  /* THE FIRE PIT at the chimney end, round in tan stone, its metal chairs. */
  const fx = 0.2;
  const fy = 11.3;
  H.cap('homeCoping', [fx, fy, 0], [fx, fy, 0.45], 0.7, { seg: 14, solid: false });
  H.cap('homeChair', [fx, fy, 0.45], [fx, fy, 0.46], 0.5, { seg: 14, solid: false });
  H.hidden(fx - 0.6, fy - 0.6, 0, fx + 0.6, fy + 0.6, 0.45, 'obstacle');
  for (const [x, y, b] of [[fx - 1.35, fy, 'w'], [fx, fy + 1.35, 'n'], [fx, fy - 1.35, 's'], [fx - 1.0, fy + 1.0, 'w']]) {
    chair(H, 'homeChair', x, y, b, G_PAVE, { s: 0.26, backH: 0.5, seat: 0.4 });
  }

  /*
   * THE PAVILION at the garage end: an open gable on square columns with
   * ledgestone bases, a dark ceiling with a fan, an L shaped bar faced in
   * slate with a granite top, four black stools, the grill, the television
   * and a white door on its back wall.
   */
  const v = { x0: 15.0, x1: 21.0, y0: 10.0, y1: 15.0 };
  H.paint('homeDrive', v.x0 - 0.3, v.y0 - 0.3, 0.0, v.x1 + 0.3, v.y1 + 0.3, G_DRIVE);
  for (const [x, y] of [[v.x0, v.y0], [v.x1, v.y0], [v.x0, 12.5]]) {
    H.box('homeStone', x - 0.25, y - 0.25, 0, x + 0.25, y + 0.25, 0.9, { name: 'column base' });
    H.box('homeTrim', x - 0.14, y - 0.14, 0.9, x + 0.14, y + 0.14, 2.75, { name: 'column' });
  }
  H.box('homeSiding', v.x0 - 0.12, v.y1 - 0.2, 0, v.x1 + 0.12, v.y1, 2.75, { name: 'pavilion wall' });
  H.box('homeSiding', v.x1 - 0.2, 12.4, 0, v.x1 + 0.12, v.y1, 2.75, { name: 'pavilion wall' });
  H.paint('homeTrim', 15.6, v.y1 - 0.215, 0, 16.5, v.y1 - 0.2, 2.1);
  H.box('homeScreen', 18.4, v.y1 - 0.25, 1.4, 20.2, v.y1 - 0.2, 2.4, { name: 'pavilion screen', kind: 'obstacle' });
  const bw = v.x1 - 0.2;
  H.box('homeStone', 17.4, 13.2, 0, bw, 13.85, 1.05, { name: 'bar' });
  H.box('homeStone', bw - 0.65, 11.0, 0, bw, 13.2, 1.05, { name: 'bar' });
  H.box('homeCounter', 17.3, 13.1, 1.05, bw, 13.95, 1.1, { name: 'bar top' });
  H.box('homeCounter', bw - 0.75, 10.9, 1.05, bw, 13.1, 1.1, { name: 'bar top' });
  H.box('homeSteel', 18.0, 13.95, 0, 19.4, 14.75, 1.0, { name: 'grill' });
  for (let i = 0; i < 4; i += 1) {
    const x = 17.7 + i * 0.62;
    H.post('homeChair', x, 12.8, 0, 0.72, 0.03, { seg: 6, kind: 'pole' });
    H.drum('homeChair', x, 12.8, 0.72, 0.78, 0.18, { seg: 10 });
  }
  H.box('homeShelf', v.x0 - 0.12, v.y0 - 0.12, 2.75, v.x1 + 0.12, v.y1, 2.9, { name: 'pavilion ceiling' });
  H.post('homeChair', 17.5, 12.0, 2.45, 2.75, 0.03, { seg: 4, solid: false });
  H.paint('homeWood', 16.8, 11.93, 2.43, 18.2, 12.07, 2.46);
  H.paint('homeWood', 17.43, 11.3, 2.43, 17.57, 12.7, 2.46);
  gableRoof(H, 'y', v.x0 - 0.12, v.x1 + 0.12, v.y0 - 0.12, v.y1, 2.9, 2.9, { over: 0.3, base: 2.75 });

  /* A swing set out on the lawn: an A frame each end, the top bar, two
   * seats on their chains, and a slide off a little tower. */
  const sx0 = 26;
  const sx1 = 30.5;
  const sy = 19;
  const sh = 2.5;
  for (const x of [sx0, sx1]) {
    H.cap('homePlay', [x, sy - 0.9, 0], [x, sy, sh], 0.06, { kind: 'pole', seg: 6 });
    H.cap('homePlay', [x, sy + 0.9, 0], [x, sy, sh], 0.06, { kind: 'pole', seg: 6 });
  }
  H.cap('homePlay', [sx0, sy, sh], [sx1, sy, sh], 0.07, { kind: 'pole', seg: 6 });
  for (const x of [sx0 + 1.3, sx1 - 1.3]) {
    H.cap('homeSteel', [x - 0.25, sy, sh], [x - 0.25, sy, 0.6], 0.01, { solid: false, seg: 4 });
    H.cap('homeSteel', [x + 0.25, sy, sh], [x + 0.25, sy, 0.6], 0.01, { solid: false, seg: 4 });
    H.box('homeShutter', x - 0.3, sy - 0.12, 0.55, x + 0.3, sy + 0.12, 0.62, { name: 'swing' });
  }
  const tx0 = sx1 + 0.4;
  const tx1 = sx1 + 1.6;
  H.box('homePlayBlue', tx0, sy - 0.5, 0, tx1, sy + 0.5, 1.5, { name: 'slide tower' });
  const s0 = sy + 0.5;
  const s1 = sy + 2.6;
  H.prism('homePlay', 'x', [[s0 - 0.15, 1.45], [s0 - 0.15, 1.5], [s1, 0.1], [s1, 0.05]], tx0 + 0.3, tx1 - 0.3);
  for (let k = 0; k < 6; k += 1) {
    const a = s0 + ((s1 - s0) * k) / 6;
    const b = s0 + ((s1 - s0) * (k + 1)) / 6;
    H.hidden(tx0 + 0.3, a, 0, tx1 - 0.3, b, 1.5 - (1.4 * (k + 0.5)) / 6, 'obstacle');
  }

  /* A shed in the back west corner. */
  const sh0 = { x0: -12.5, x1: -8.5, y0: 26.5, y1: 30.0 };
  H.box('homeSiding', sh0.x0, sh0.y0, 0, sh0.x1, sh0.y1, 2.2, { name: 'shed' });
  H.paint('homeTrim', -11.1, sh0.y0 - 0.03, 0, -9.9, sh0.y0, 1.95);
  gableRoof(H, 'x', sh0.y0, sh0.y1, sh0.x0, sh0.x1, 2.2, 2.2, { over: 0.2 });
  /* Beds of hostas and shrubs along the back wall and behind the garage. */
  H.paint('homeMulch', 9.9, DEP, 0, LEN, 9.3, 0.035);
  H.paint('homeMulch', LEN, G_Y1, 0, G_X1, 6.3, 0.035);
  for (const [x, y] of [[10.5, 8.85], [11.6, 8.85], [13.4, 8.85], [16.0, 5.85], [19.5, 5.85], [22.5, 5.85]]) {
    H.cap('homeHedge', [x, y, 0.3], [x, y, 0.3], 0.38, { look: 'capsule', kind: 'tree', seg: 10 });
  }
}

/* ------------------------------------------------------------------ */
/* Fences                                                              */
/* ------------------------------------------------------------------ */

/* A run of fence along x or y, solid as one board the height of the fence
 * and drawn as its boards: close boarded for privacy, lower across the back
 * of the lawn. */
function fence(H, dir, at, a0, a1, h, m = 'homeFenceWood') {
  const t = 0.08;
  if (dir === 'x') {
    H.box(m, a0, at - t / 2, 0, a1, at + t / 2, h, { name: 'fence' });
  } else {
    H.box(m, at - t / 2, a0, 0, at + t / 2, a1, h, { name: 'fence' });
  }
  const len = a1 - a0;
  const n = Math.max(1, Math.round(len / 2.4));
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + (len * i) / n;
    if (dir === 'x') {
      H.paint(m, a - 0.06, at - 0.07, 0, a + 0.06, at + 0.07, h + 0.08);
    } else {
      H.paint(m, at - 0.07, a - 0.06, 0, at + 0.07, a + 0.06, h + 0.08);
    }
  }
  /* The boards' lines, both faces, every 0.6: the eye reads boards and the
   * draw does not pay for each one. */
  const step = 0.6;
  for (let a = a0 + step; a < a1 - 0.05; a += step) {
    for (const s of [-1, 1]) {
      const f = at + s * (t / 2 + 0.003);
      const g = f + s * 0.004;
      if (dir === 'x') {
        H.paint('homeStone', a - 0.012, Math.min(f, g), 0.02, a + 0.012, Math.max(f, g), h - 0.03);
      } else {
        H.paint('homeStone', Math.min(f, g), a - 0.012, 0.02, Math.max(f, g), a + 0.012, h - 0.03);
      }
    }
  }
}

function fences(H) {
  /* The weathered grey privacy fence down both sides of the back yard, the
   * newer cedar one and its gate on the pavilion's side, the lower fence
   * across the back of the lawn, and a gate each side of the house. */
  fence(H, 'x', 31.6, -13.6, 45.6, 1.2);
  fence(H, 'y', -13.6, 6.0, 31.6, 1.8);
  fence(H, 'y', 45.6, 5.3, 31.6, 1.8);
  fence(H, 'x', 6.0, -13.6, -4.2, 1.8);
  fence(H, 'x', 6.0, -2.4, -0.75, 1.8);
  fence(H, 'x', 5.3, G_X1, 26.0, 1.8, 'homeWicker');
  fence(H, 'x', 5.3, 27.8, 45.6, 1.8, 'homeWicker');
}

/* ------------------------------------------------------------------ */
/* The front, the cul de sac and the neighbours                        */
/* ------------------------------------------------------------------ */

function front(H) {
  /* The drive from the three garage doors, narrowing as it sweeps down to
   * the bulb, and the walk from the porch steps along the front to it. */
  H.paint('homeDrive', 14.2, -7.0, 0, 23.3, G_Y0, G_DRIVE);
  H.paint('homeDrive', 15.6, BULB.y + BULB.r - 1.5, 0, 21.8, -7.0, G_DRIVE);
  H.paint('homeDrive', 5.2, -3.3, 0, 14.2, -2.3, G_PAVE);
  H.paint('homeDrive', 5.6, -2.3, 0, 6.6, FRONT - 0.35, G_PAVE);
  /* Mulch beds along the brick and the porch, shrubs in them. */
  H.paint('homeMulch', -0.8, FRONT - 1.5, 0, BRICK_X1 + 0.6, FRONT, 0.025);
  H.paint('homeMulch', 7.0, FRONT - 0.85, 0, LEN, FRONT, 0.025);
  const shrubs = [[-0.2, -2.35, 0.55], [0.85, -2.3, 0.5], [1.95, -2.4, 0.6], [3.1, -2.3, 0.55], [4.15, -2.25, 0.5]];
  for (let x = 7.5; x < 13.8; x += 0.75) {
    shrubs.push([x, -1.98, 0.42]);
  }
  for (const [x, y, r] of shrubs) {
    H.cap('homeHedge', [x, y, r * 0.8], [x, y, r * 0.8], r, { look: 'capsule', kind: 'tree', seg: 10 });
  }
  /* The cul de sac's pavement and kerb, a planted island in it, the street
   * east, its kerbs and pavements. */
  H.discs.push({ m: 'homeAsphalt', px: BULB.x, py: BULB.y, r: BULB.r, h: G_ASPHALT });
  H.discs.push({ m: 'homeFoundation', px: BULB.x, py: BULB.y, r: BULB.r + 0.3, r0: BULB.r, h: 0.09 });
  H.discs.push({ m: 'homeHedge', px: BULB.x, py: BULB.y, r: 3.2, h: 0.04 });
  H.discs.push({ m: 'homeFoundation', px: BULB.x, py: BULB.y, r: 3.4, r0: 3.2, h: 0.12 });
  const sx = BULB.x + 11;
  const ex = PLOT.x1;
  H.paint('homeAsphalt', BULB.x, STREET.y0, 0, ex, STREET.y1, G_ASPHALT);
  H.paint('homeFoundation', sx, STREET.y1, 0, ex, STREET.y1 + 0.3, 0.09);
  H.paint('homeFoundation', sx, STREET.y0 - 0.3, 0, ex, STREET.y0, 0.09);
  H.paint('homeDrive', sx, STREET.y1 + 0.3, 0, ex, STREET.y1 + 1.8, G_PAVE);
  H.paint('homeDrive', sx, STREET.y0 - 1.8, 0, ex, STREET.y0 - 0.3, G_PAVE);
  /* A mailbox at the foot of the drive. */
  H.post('homeShutter', 13.6, -10.5, 0, 1.05, 0.05, { seg: 6, kind: 'pole' });
  H.box('homeShutter', 13.4, -10.75, 1.05, 13.8, -10.25, 1.3, { name: 'mailbox' });
  H.paint('homePlay', 13.78, -10.4, 1.15, 13.82, -10.3, 1.38);

  /* The neighbours round the bulb: two storey shells of the same era with
   * their windows painted and their doors shut, each with a drive. */
  neighbour(H, -6, -44, 13, 9, 'homeBrick', 'n', false);
  H.paint('homeDrive', 7.5, -35, 0, 11.0, -29.5, G_DRIVE);
  neighbour(H, 22, -44, 12, 9, 'homeNeighbourTan', 'n', false);
  H.paint('homeDrive', 24.0, -35, 0, 27.5, -31, G_DRIVE);
  neighbour(H, 31, -13, 11, 8, 'homeTrim', 's', true);
  H.paint('homeDrive', 32.5, STREET.y1, 0, 36.0, -13, G_DRIVE);
}

/* A neighbour's house: a two storey box under a gable roof, ridge east to
 * west, its front on side `face`. Solid as the box and the roof's bands.
 * The white one has black shutters, as the white houses round Nick's do. */
function neighbour(H, x0, y0, w, d, m, face, shutters) {
  const x1 = x0 + w;
  const y1 = y0 + d;
  const h = 5.4;
  H.box(m, x0, y0, 0, x1, y1, h, { name: 'neighbour' });
  gableRoof(H, 'x', y0, y1, x0, x1, h, h, { gable: m });
  const fy = face === 'n' ? y1 : y0;
  const by = face === 'n' ? y0 : y1;
  const s = face === 'n' ? 1 : -1;
  const n = Math.max(3, Math.round(w / 2.6));
  const frameM = m === 'homeTrim' ? 'homeWhite' : 'homeTrim';
  const out = (yy, ss, k) => [Math.min(yy, yy + ss * k), Math.max(yy, yy + ss * k)];
  for (let i = 0; i < n; i += 1) {
    const cx = x0 + ((i + 0.5) * w) / n;
    for (const [yy, ss] of [[fy, s], [by, -s]]) {
      for (const hh of [0.95, 3.75]) {
        if (yy === fy && hh < 2 && i === Math.floor(n / 2)) {
          continue;
        }
        const [a, b] = out(yy, ss, 0.03);
        H.paint(frameM, cx - 0.55, a, hh - 0.08, cx + 0.55, b, hh + 1.5);
        const [c, e] = out(yy, ss, 0.05);
        H.paint('homeWindow', cx - 0.45, c, hh, cx + 0.45, e, hh + 1.4);
        if (shutters && yy === fy) {
          for (const sx of [-1, 1]) {
            H.paint('homeShutter', cx + sx * 0.6 - 0.18, c, hh - 0.05, cx + sx * 0.6 + 0.18, e, hh + 1.45);
          }
        }
      }
    }
  }
  const dc = x0 + ((Math.floor(n / 2) + 0.5) * w) / n;
  const [a, b] = out(fy, s, 0.04);
  H.paint(frameM, dc - 0.6, a, 0, dc + 0.6, b, 2.4);
  const [c, e] = out(fy, s, 0.06);
  H.paint('homeShutter', dc - 0.45, c, 0, dc + 0.45, e, 2.2);
  const [g, k] = out(fy, s, 0.05);
  H.paint('homeCoping', x1 - 3.4, g, 0, x1 - 0.6, k, 2.2);
}

/* ------------------------------------------------------------------ */
/* Trees and cars: the town's own, at the house's scale                */
/* ------------------------------------------------------------------ */

/* Where the big trees stand, plan metres, and how big: k times the street
 * tree at its largest (size 3, 21 m of the world's, 7 m of a real tree
 * here), so k 2 is a 14 m tree. Tall and mature round the lot's edges and
 * the street, as in every still and aerial, the big one in the middle of
 * the back lawn, and none over the house, the pool or the drive. */
const TREES = [
  [-9.5, 21.0, 2.3], [-5.5, 28.0, 2.0], [3.5, 27.5, 2.4], [12.0, 28.5, 1.9], [21.0, 27.0, 2.2],
  [33.0, 28.0, 2.5], [41.0, 20.0, 2.1], [40.5, 11.5, 1.8], [35.0, 13.0, 1.6], [-10.5, 11.0, 1.8],
  [-9.0, -4.0, 2.2], [-11.0, -16.0, 2.0], [-3.0, -11.0, 1.7], [29.0, 1.5, 2.0], [42.0, 2.0, 1.9],
  [40.0, -40.0, 2.2], [9.0, -40.5, 1.8], [-12.0, -30.0, 1.9], [36.5, 4.5, 1.5], [44.0, -17.0, 1.4],
  [27.0, 23.5, 2.8],
];

/* The trees with a ring of mulch at their foot. */
const MULCHED = new Set([5, 7, 8, 20]);

function trees(H) {
  TREES.forEach(([px, py, k], i) => {
    const el = { id: `house-tree-${i + 1}`, type: 'tree', style: 'street', dims: { size: 3, variant: 11 + i } };
    H.asset(el, k, px, py, 0, 0, 'extra:trees');
    if (MULCHED.has(i)) {
      H.discs.push({ m: 'homeMulch', px, py, r: 1.6, h: 0.04 });
    }
  });
}

function cars(H) {
  /* A red car on the drive in front of the west bay, a silver wagon in the
   * east bay, the neighbours' on theirs. Cars are boxes, so they turn by
   * quarters. */
  const N = Math.PI / 2;
  const list = [
    ['r32', 15.75, -5.5, N, 4],
    ['wagon', 21.75, 1.9, N, 5],
    ['minivan', 9.25, -32.5, N, 2],
    ['hatch', 25.75, -32.45, N, 4],
    ['sedan', 34.25, -16.0, -N, 6],
  ];
  list.forEach(([style, px, py, yaw, variant], i) => {
    const el = { id: `house-car-${i + 1}`, type: 'car', style, dims: { variant } };
    H.asset(el, S, px, py, 0, yaw, 'extra:street');
  });
}

/* ------------------------------------------------------------------ */
/* The whole                                                           */
/* ------------------------------------------------------------------ */

/*
 * The scaled assets' parts in the world frame: each part of the asset's
 * own layout, k times larger, turned by its heading and moved to where it
 * stands, solid as the asset's are and never drawn, because the draw()
 * draws the asset itself through a scaled frame (./index.js). Boxes turn
 * by quarter turns only, exactly; capsules by any heading, with the
 * project's own sine.
 */
const SCQ = { s: 0, c: 1 };
function scaledParts(a) {
  const k = a.k;
  const [x, y, z] = worldAt(a.px, a.py, a.h);
  const parts = partsOf(a.el);
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
 * The house, its yard and its street: { parts, prisms, discs, cones,
 * scaled }, every part in the world frame. Built fresh every call, and the
 * same every call: nothing here is random but the trees' own seeded
 * layouts.
 */
export function houseLayout() {
  const H = new House();
  exterior(H);
  groundFloor(H);
  upperFloor(H);
  garage(H);
  backYard(H);
  fences(H);
  front(H);
  trees(H);
  cars(H);
  const parts = H.P.list.slice();
  for (const a of H.scaled) {
    parts.push(...scaledParts(a));
  }
  return { parts, prisms: H.prisms, discs: H.discs, cones: H.cones, scaled: H.scaled };
}

/* The plan's frame, and the openings ./yard.js names, so its gaps stand in
 * the holes and not beside them: each a span along a wall at `y` (an east
 * west wall) or `x` (a north south one) and its sill and head. */
export const FRAME = { OX, OZ, S };
export const OPENINGS = {
  frontDoor: { x0: FRONT_DOOR[0], x1: FRONT_DOOR[1], y: TX / 2, h0: FRONT_DOOR[2], h1: FRONT_DOOR[3] },
  slider: { x0: SLIDER[0], x1: SLIDER[1], y: DEP - TX / 2, h0: SLIDER[2], h1: SLIDER[3] },
  bay: { x0: BAY_LIGHTS[1][0], x1: BAY_LIGHTS[1][1], y: 9.2 - TX / 2, h0: BAY_LIGHTS[1][2], h1: BAY_LIGHTS[1][3] },
  kitchenWindow: { x0: KITCHEN_WIN[0], x1: KITCHEN_WIN[1], y: DEP - TX / 2, h0: KITCHEN_WIN[2], h1: KITCHEN_WIN[3] },
  kidsWindow: { y0: KIDS_WIN[0], y1: KIDS_WIN[1], x: LEN - TX / 2, h0: KIDS_WIN[2], h1: KIDS_WIN[3] },
  garage: { x0: BAYS[1][0], x1: BAYS[1][1], y: FRONT + TX / 2, h0: 0, h1: BAY_H },
  tallWindow: { x0: TALL.x0, x1: TALL.x1, y: FRONT + TX / 2, h0: TALL1[2], h1: TALL1[3] },
  /* Between the two swings' inner chains, over the seats and under the
   * top bar (backYard). */
  swings: { x0: 27.55, x1: 28.95, y: 19, h0: 0.7, h1: 2.4 },
};

/* Where the pilot starts: the breakfast room, between the bookshelves and
 * the kitchen, looking west through the wide opening into the family room. */
export const SPAWN = { px: 9.3, py: 6.4, h: FLOOR0 };
