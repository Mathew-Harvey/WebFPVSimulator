/*
 * house.js: Nick Burns' house, its yard and its end of the street, as the
 * parts a built map holds. Pure data and arithmetic, no Three.js, no JS
 * trigonometry, so the solids can be built and checked in plain Node.
 *
 * WHERE IT COMES FROM. Nick's own videos, about fifty stills of the house
 * from four years of them (listed with what each shows in
 * /mnt/project-files/nick-burns-house/refs/REFERENCES.md), and three
 * community workshop layouts of it for the plan's proportions. The stills
 * decide what the house looks like: a warm grey board and batten house with
 * white trim and dark sashes, a red brick block at the front west corner
 * with a tall window, a white porch on bracketed posts, a three car garage
 * under one long sweep of grey roof, a full height brick chimney on the west
 * gable. Behind it a timber pergola over a stamped patio, a white bay
 * window, a long pool parallel to the house, a fire pit at the chimney end
 * and a stone outdoor kitchen under a pavilion at the garage end. Inside, a
 * loop round a straight stair on the hall's west side: hall, dining room,
 * family room, breakfast room and back down the hall, and a second one from
 * the breakfast room through the kitchen, the back hall and the front room
 * to the hall, honey oak throughout, olive green in the back rooms, dark stained trim in
 * the front ones. Upstairs no still shows, so its rooms are a plausible
 * plan and nothing more. Under the main block, the finished basement his
 * flying videos are mostly shot in: down a carpeted stair under the main
 * one into one long open room, a lounge round a wall TV, a round table
 * with an LED cube gate on it, a white fireplace, a treadmill and a
 * kitchenette, and off a short hall a guest room, a yellow playroom and
 * the blue workshop his drones live in (basement()).
 *
 * THE SCALE IS THE POINT. Everything is three and a half times life size,
 * so a five inch flies the house the way a 63 mm whoop flies a real one
 * (220 mm of craft over 3.5). It was three, a 75 mm whoop's 220 over 75
 * rounded, the derivation of MICRO_SCALE in configs/airframes.js, until
 * the owner flew it and asked on 2026-10-19 for more room: "The house its
 * self is a bit tight, i think we need to scale the entire house up a
 * little bit to make all the flight lines more spacious". A real door 0.9 m
 * wide is 3.15 m here, a room 4.6 m across is 16.1. The plan below is
 * written in REAL metres, the way a house is measured, and turned into the
 * world's metres once, by S, in the few helpers under it. S is the one
 * number to change: the plot, the trees, Nick and the check follow it, and
 * the check's slot rule says which furniture gap a new S opens.
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
import { yardTrackOn } from '../yardtrack/yardtrack.js';

/* ------------------------------------------------------------------ */
/* The frame                                                           */
/* ------------------------------------------------------------------ */

/* World metres to a real metre. */
export const S = 3.5;

/* The plot, in the document's metres: x east, y north, from its south west
 * corner. 60 by 76 real metres, the house's lot, the cul de sac and the
 * three houses round it. */
export const FIELD_W = 60 * S;
export const FIELD_D = 76 * S;

/* Where the plan's origin is on the plot, in the document's metres: 14 real
 * metres of side yard to the west, 44 of front yard, cul de sac and
 * neighbours to the south. */
export const X0 = 14 * S;
export const Y0 = 44 * S;

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

/* The brick block: the dining room and the bedroom over it, two storeys,
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
 * treads running north up the west side of the hall, against the wall the
 * hall shares with the dining room and the family room, the banister on
 * the hall's side (the owner's stills of 2026-10-18: from the front door,
 * the stair on the left against a wall, its rail on the right, the hall
 * going on past it to the kitchen). */
const STAIR_X0 = BRICK_X1 + TI / 2;
const STAIR_X1 = STAIR_X0 + 1.1;
/* The hall's east side, the front room behind it. */
const HALL_X1 = 8.3;
const STAIR_Y0 = 1.1;
const STAIR_TREAD = 0.275;
const STAIR_RISERS = 13;
const STAIR_Y1 = STAIR_Y0 + (STAIR_RISERS - 1) * STAIR_TREAD;
const STAIR_RISE = (FLOOR1 - FLOOR0) / STAIR_RISERS;

/*
 * THE BASEMENT: its finished floor 2.35 under the lawn, the ground floor's
 * slab for its ceiling, under the main block only (not the brick block,
 * the bay or the garage). Its stair is under the main one and runs the
 * other way, the way stacked stairs are built, so the head room over each
 * tread is the main stair's underside: thirteen risers down south from a
 * landing at the main stair's head, which a door off the breakfast room
 * opens onto, to the foot by the front wall. Seen in his stills: the straight grey
 * carpeted flight along a white wall, the white half wall and newel at its
 * foot with the lounge beside it, the hall to the workshop running on from
 * the foot (bsmt--M3qDT4i7xk-mr2 and the third view of
 * bsmt-K9uGMfYKJLg-mr2 from beside the foot, looking past the newel; its
 * second view from the foot, looking down the hall). Its door is in the
 * wall across the main stair's north end, off the breakfast room between
 * the hall and the family room's wide opening, facing the round table
 * (the owner's stills of 2026-10-18: from the table looking south, the
 * hall on the left, the white door in the green wall, the family room on
 * the right).
 */
export const BF = -2.35;
const B_SLAB = 0.3;
const SB = { x0: STAIR_X0, x1: STAIR_X1, top: 4.1, tread: 0.255 };
const SB_RISERS = 13;
const SB_RISE = (FLOOR0 - BF) / SB_RISERS;
const SB_FOOT = SB.top - (SB_RISERS - 1) * SB.tread;
/* The line through its nosings. */
const nosing = (py) => FLOOR0 + ((py - SB.top) * SB_RISE) / SB.tread;
/* The hole in the ground floor's slab where the stair down needs the head
 * room, from the main stair's second tread to the landing; east of it the
 * strip the wall under the main stair's open side stands on. */
const HOLE = { x0: STAIR_X0, x1: STAIR_X1 - TI, y0: STAIR_Y0 + STAIR_TREAD, y1: SB.top };
/* The main stair's underside over the hole, each tread's box this deep. */
const SOFFIT = 0.3;
/* The basement door, off the breakfast room onto the landing. */
const B_DOOR = [4.8, 5.6];

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
export const G_PAVE = 0.03;
const G_DRIVE = 0.034;

/* The red umbrella over the patio table: its pole, the canopy's rim height,
 * radius and rise. Nick's balloon goes over it for a camera above it
 * (./nickdraw.js). */
export const UMBRELLA = { x: 8.25, y: 11.0, h0: 2.15, r: 1.25, h: 0.55 };
/* The table under it, Nick's: its middle, its top's radius and height. A
 * craft that lands on it gets an answer (./nickdraw.js). */
export const PATIO_TABLE = { x: UMBRELLA.x, y: UMBRELLA.y, r: 0.6, h: 0.75 };
/* The pergola's outer posts' line, its west and east ends and the top of its
 * beam; the rafters lie 0.2 to 0.36 over that. Nick's balloon goes over it
 * too, for a camera over the rafters. */
export const PERGOLA = { x0: 2.2, x1: 10.8, y1: 12.7, h: 3.45 };

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
  /* The shed dormer on the front plane over the front room: three windows
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

/*
 * The openings in the outside walls, kept where the rooms' paint can find
 * them too. The back wall's ground floor, west to east, is the order every
 * still of it shows (rear-ILOGF1ENSXk-mr2, rear-6AUUo19ABg0-mr2): a small
 * window near the chimney, a long blank stretch with the wicker loveseat
 * against it, the white slider, the white bay right beside it, then the
 * small window over the kitchen sink. The slider opens into the breakfast
 * room, beside the bay, as the breakfast room's own stills show (its glass
 * door between the corner game shelf and the bay); the bay is about one
 * and two thirds the slider's width.
 */
const FRONT_DOOR = door(5.65, 6.55, 2.15)(FLOOR0);
const SLIDER = door(5.0, 6.6, 2.15)(FLOOR0);
const BAY = { x0: 6.75, x1: 9.75, y1: 9.2 };
const BAY_OPEN = [BAY.x0 + TX, BAY.x1 - TX, FLOOR0, CEIL0 - 0.15];
const KITCHEN_WIN = win(12.1, 1.1, 1.05, 2.2)(FLOOR0);
const BAY_LIGHTS = [0, 1, 2].map((i) => {
  const a = BAY.x0 + TX + 0.12;
  const w = (BAY.x1 - BAY.x0 - 2 * TX - 0.24 - 2 * 0.08) / 3;
  return [a + i * (w + 0.08), a + i * (w + 0.08) + w, FLOOR0 + 0.45, FLOOR0 + 2.25];
});
const BAY_SIDE = [8.48, 9.0, FLOOR0 + 0.45, FLOOR0 + 2.25];
const KIDS_WIN = [4.0, 4.8, 4.2, 5.2];

function exterior(H) {
  /* The slabs: the ground floor on the ground with the basement stair's
   * hole cut out of it, the upper floor with the stairwell cut out of it,
   * and the ceiling under the roof. */
  for (const [a, b, c, d] of around(HOLE, 0, FRONT, LEN, DEP)) {
    H.box('homeFoundation', a, b, 0, c, d, FLOOR0, { name: 'slab' });
  }
  H.box('homeFoundation', BAY.x0, DEP, 0, BAY.x1, BAY.y1, FLOOR0, { name: 'bay slab' });
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

  /* The front wall behind the porch: the front door and the front room's
   * two windows, one storey, the attic over it. */
  const frontHoles = [FRONT_DOOR, win(9.35)(FLOOR0), win(12.2)(FLOOR0)];
  extWall(H, 'x', TX / 2, BRICK_X1, LEN, frontHoles, -1, { top: FLOOR1 });
  /* The front door, dark, swung open into the hall on its east hinges, out
   * of the way of the stair's foot. */
  H.box('homeShutter', FRONT_DOOR[1] - 0.06, TX, FLOOR0 + 0.01, FRONT_DOOR[1] - 0.02, 1.0, FLOOR0 + 2.12, { name: 'front door' });

  /* THE BACK: the family room's window, the breakfast room's slider and
   * bay, the bay opened right through, the kitchen's window over the sink;
   * above, the master's two windows, the bathroom's, and one each for the
   * back bedrooms. */
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
  extWall(H, 'x', BAY.y1 - TX / 2, BAY.x0, BAY.x1, BAY_LIGHTS, 1, { top: 2.85, skin: 'homeTrim' });
  extWall(H, 'y', BAY.x0 + TX / 2, DEP, BAY.y1 - TX, [BAY_SIDE], -1, { top: 2.85, skin: 'homeTrim' });
  extWall(H, 'y', BAY.x1 - TX / 2, DEP, BAY.y1 - TX, [BAY_SIDE], 1, { top: 2.85, skin: 'homeTrim' });
  H.box('homeWallIn', BAY.x0, DEP, CEIL0 - 0.05, BAY.x1, BAY.y1, 2.85, { name: 'bay ceiling' });
  const bayTop = (py) => 3.4 - ((py - DEP + 0.05) * 0.42) / (9.5 - DEP + 0.05);
  H.prism('homeRoof', 'x', [[DEP - 0.05, bayTop(DEP - 0.05) - 0.2], [9.5, bayTop(9.5) - 0.2], [9.5, bayTop(9.5)], [DEP - 0.05, bayTop(DEP - 0.05)]], BAY.x0 - 0.15, BAY.x1 + 0.15);
  bands(H, 'x', BAY.x0 - 0.15, BAY.x1 + 0.15, 2.85, bayTop(DEP), (h) => [DEP, Math.min(9.5, DEP - 0.05 + ((3.4 - h) * (9.5 - DEP + 0.05)) / 0.42)]);

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
 * THE STAIRS: thirteen risers up the west side of the hall, solid from the
 * floor to each tread so nothing under them is a slot; the open east side
 * white balusters under a dark stained rail, solid as a band the height of
 * the rail, so it is a wall to the physics the way it is a wall to the
 * eye. A runner up the treads. Over the basement stair each tread's box is
 * its underside only, SOFFIT deep, the head room of the stair down, and a
 * wall under the east edge closes that space to the hall, so from the
 * hall the stair's side is white.
 */
function stairs(H) {
  const x0 = STAIR_X0;
  const x1 = STAIR_X1;
  const rail = 0.9;
  const rx = x1 - 0.04;
  for (let i = 0; i < STAIR_RISERS - 1; i += 1) {
    const y0 = STAIR_Y0 + i * STAIR_TREAD;
    const hTop = FLOOR0 + (i + 1) * STAIR_RISE;
    const over = y0 > HOLE.y0 - 1e-9;
    const under = over ? hTop - 0.03 - SOFFIT : FLOOR0;
    H.box('homeWhite', x0, y0, under, x1, y0 + STAIR_TREAD, hTop - 0.03, { name: 'stair' });
    if (over) {
      underStair(H, y0, y0 + STAIR_TREAD, under);
    }
    H.box('homeFloor', x0, y0 - 0.02, hTop - 0.03, x1 + 0.03, y0 + STAIR_TREAD, hTop, { name: 'tread' });
    H.paint('homeWicker', x0 + 0.18, y0 - 0.025, hTop, x1 - 0.22, y0 + STAIR_TREAD, hTop + 0.006);
    for (const t of [0.25, 0.75]) {
      const y = y0 + t * STAIR_TREAD;
      const hr = FLOOR0 + STAIR_RISE + rail + ((y - STAIR_Y0 - 0.1) / (STAIR_Y1 - STAIR_Y0 - 0.1)) * (FLOOR1 - FLOOR0 - STAIR_RISE);
      H.post('homeWhite', rx, y, hTop, hr, 0.018, { seg: 5, solid: false });
    }
    H.hidden(rx - 0.03, y0, hTop, rx + 0.03, y0 + STAIR_TREAD, hTop + rail);
  }
  /* The underside over the stair down, seen through the basement door and
   * from the flight below it: drawn as one smooth slope under the treads'
   * stepped boxes, touching each at its back edge, so it reads as the
   * plastered soffit it would be and not as a white stair going up. It is
   * drawn only; the boxes over it are the solid. */
  const soffit = (py) => FLOOR0 - 0.03 - SOFFIT + ((py - STAIR_Y0) * STAIR_RISE) / STAIR_TREAD;
  const d = STAIR_RISE + 0.005;
  const [s0, s1] = [HOLE.y0 - 0.005, STAIR_Y1 - 0.005];
  H.prism('homeWhite', 'x', [[s0, soffit(s0)], [s1, soffit(s1)], [s1, soffit(s1) + d], [s0, soffit(s0) + d]], x0 - 0.005, HOLE.x1 + 0.005);
  const foot = [rx, STAIR_Y0 + 0.1, FLOOR0 + STAIR_RISE + rail];
  const head = [rx, STAIR_Y1, FLOOR1 + rail];
  H.cap('homeShelf', foot, head, 0.035, { seg: 8, solid: false });
  H.box('homeShelf', rx - 0.07, STAIR_Y0 - 0.12, FLOOR0, rx + 0.07, STAIR_Y0 + 0.02, FLOOR0 + 1.15, { name: 'newel' });
  /* North of the main stair's head the wall goes on to the ceiling, the
   * landing's east side, and across the north end the wall with the
   * basement door in it, white, swung open onto the landing so the
   * breakfast room stays clear. */
  underStair(H, STAIR_Y1, 5.0 - TI / 2, CEIL0);
  H.wall('x', 5.0, STAIR_X0, STAIR_X1, FLOOR0, CEIL0, { holes: [door(...B_DOOR)(FLOOR0)] });
  doorway(H, 'x', 5.0, ...B_DOOR, FLOOR0, { leaf: { side: -1, at: 'b1' } });
}

/* The wall under the main stair's east edge, from the hall's floor to
 * `top`, py a to b. */
function underStair(H, a, b, top) {
  H.box('homeWhite', HOLE.x1, a, FLOOR0, STAIR_X1, b, top, { kind: 'wall', name: 'wall' });
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

/*
 * The doors and openings between the ground floor's rooms. The family
 * room's south wall is open to the dining room but for a short return each
 * end, cased in dark wood (OPEN), the dining room's double opening at the
 * foot of the stair out into the hall (D1: the owner, 2026-10-18, "open the
 * door up to be a removed wall on the left side of the front room after
 * flying from the lamp room, it's a double wide door"; no leaf, cased in
 * the same dark wood, wide enough that its north half looks over the
 * stair's first treads), the stair against the hall's west wall,
 * and the hall open at its north end into the breakfast room: the loop the
 * owner's stills of 2026-10-18 fly, from the breakfast room through the
 * family room past its lamps into the dining room, out at the stair's
 * foot, up the hall and back. On the breakfast room's west wall, south to
 * north, every still of it shows the wide cased opening, then a stretch of
 * wall about half the opening's width with two painted plates on it
 * (gf-gOVLqJl3GvA-mr2, GB2kc0xNhoE-mr2, Egrl50wX2z4-mr3, qRNWcAsUw7E-mr2);
 * the white six panel door those stills show south of the opening is the
 * basement door (B_DOOR), round the corner across the stair's north end.
 * PASS is the cased way from the hall into the front room, opposite the
 * stair's foot. The way from the breakfast room into the back hall is KIT,
 * right beside the green pier with the mirror on it (gf-W0j6BxL4qbw-mr1,
 * uZuJXjvH1A8-mr2), which is the doorway on the right just past the wall
 * ovens in the kitchen's own still (zX4qS_s0E1o-mr1).
 */
const D1 = [0.24, 1.56];
const D1_H = 2.2;
const OPEN = [0.75, 3.95, FLOOR0, FLOOR0 + 2.2];
const WIDE = [5.1, 7.1, FLOOR0, FLOOR0 + 2.2];
const PASS = [0.95, 1.95, FLOOR0, FLOOR0 + 2.25];
const DD = [8.48, 9.33];
const KIT = [9.5, 10.4, FLOOR0, FLOOR0 + 2.2];
/* The kitchen's wall ovens, at the breakfast room end of its north run,
 * and its island, long and parallel to that run (kitchen()). */
const OVENS = { x0: 9.8, x1: 10.56 };
const ISLAND = { x0: 10.75, x1: 12.45, y0: 5.75, y1: 6.65 };

function groundFloor(H) {
  const f = FLOOR0;
  const c = CEIL0;
  for (const [a, b, c2, d] of around(HOLE, TX, FRONT + TX, LEN - TX, DEP - TX)) {
    H.floor('homeFloor', a, b, c2, d, f);
  }
  H.floor('homeFloor', BAY.x0 + TX, DEP, BAY.x1 - TX, BAY.y1 - TX, f);

  /*
   * THE WALLS, cores in the white, each room's colour painted on its faces
   * below. px 4.6: dining room | hall, with the dining room's door at the
   * stair's foot; family room | stair; family room | breakfast room, with
   * the wide cased opening from the breakfast room that every still of the
   * family room is taken through.
   */
  H.wall('y', BRICK_X1, 0, DEP - TX, f, c, { holes: [[...D1, f, f + D1_H], WIDE] });
  H.frame('y', BRICK_X1, TI, -1, [...D1, f, f + D1_H], 'homeShelf', { w: 0.1, d: 0.02 });
  H.frame('y', BRICK_X1, TI, 1, [...D1, f, f + D1_H], 'homeShelf', { w: 0.1, d: 0.02 });
  H.frame('y', BRICK_X1, TI, 1, WIDE, 'homeWhite', { w: 0.1, d: 0.02 });
  H.frame('y', BRICK_X1, TI, -1, WIDE, 'homeWhite', { w: 0.1, d: 0.02 });
  /* py 3.0: dining room | family room, open between its returns. */
  H.wall('x', 3.0, TX, BRICK_X1 - TI / 2, f, c, { holes: [OPEN] });
  H.frame('x', 3.0, TI, 1, OPEN, 'homeShelf', { w: 0.1, d: 0.02 });
  H.frame('x', 3.0, TI, -1, OPEN, 'homeShelf', { w: 0.1, d: 0.02 });
  /* px 8.36: the hall's east wall, the front room behind it, the cased way
   * through opposite the stair's foot. */
  H.wall('y', HALL_X1 + TI / 2, TX, 5.0, f, c, { holes: [PASS] });
  H.frame('y', HALL_X1 + TI / 2, TI, -1, PASS, 'homeShelf', { w: 0.08, d: 0.02 });
  H.frame('y', HALL_X1 + TI / 2, TI, 1, PASS, 'homeShelf', { w: 0.08, d: 0.02 });
  /* py 3.6: front room | back hall, its door dark on the front room's side. */
  H.wall('x', 3.6, HALL_X1 + TI, LEN - TX, f, c, { holes: [[...DD, f, f + DOOR_H]] });
  doorway(H, 'x', 3.6, ...DD, f, { casing: ['homeWhite', 'homeShelf'], leaf: { side: 1, at: 'b0' } });
  /* py 5.0, from the hall's east wall to the east wall: the back hall's
   * north wall, the green pier with the mirror on it, and the cased way
   * from the kitchen's west end into the back hall. The hall is open to the
   * breakfast room west of it, as far as the wall across the stair's end
   * (stairs()). */
  H.wall('x', 5.0, HALL_X1, LEN - TX, f, c, { holes: [KIT] });
  H.frame('x', 5.0, TI, 1, KIT, 'homeWhite', { w: 0.08, d: 0.02 });
  H.frame('x', 5.0, TI, -1, KIT, 'homeWhite', { w: 0.08, d: 0.02 });

  /*
   * THE ROOMS' COLOURS. Pale blue grey in the family room, pale blue grey
   * over a dark stained wainscot in the dining room, both under a dark
   * crown, as the owner's stills show them through the open wall; the
   * front room pale blue; cream in the hall; olive green with a white chair
   * rail through the back hall, the breakfast room and the kitchen.
   */
  const fw = (c0, w = 0.9) => [c0 - w / 2, c0 + w / 2, f + WIN_SILL, f + WIN_TOP];
  const fd = (a, b, top = DOOR_H) => [a, b, f, f + top];
  const crown = (r, holes) => chairRail(H, r, c, holes, 'homeShelf');
  const dining = { x0: TX, y0: FRONT + TX, x1: BRICK_X1 - TI / 2, y1: 3.0 - TI / 2 };
  const diningHoles = { s: [TALL0], w: [fw(0.7)], n: [OPEN], e: false };
  /* Its east wall is the brick block's own in front of the main block, the
   * hall's west wall behind it. */
  const diningEast = [[BRICK_X1 - TX, FRONT + TX, 0, []], [BRICK_X1 - TI / 2, 0, 3.0 - TI / 2, [fd(...D1, D1_H)]]];
  const diningBand = (m, h0, h1, proud) => {
    roomFaces(H, m, dining, h0, h1, diningHoles, proud);
    for (const [at, a0, a1, holes] of diningEast) {
      face(H, m, 'y', at - proud, a0, a1, h0, h1, holes, -1, 0.008 + proud);
    }
  };
  diningBand('homeShelf', f, f + 0.95, 0);
  diningBand('homeWallBlue', f + 0.95, c, 0);
  diningBand('homeShelf', f + 0.91, f + 0.98, 0.014);
  diningBand('homeShelf', c - 0.07, c, 0.014);
  const family = { x0: TX, y0: 3.0 + TI / 2, x1: BRICK_X1 - TI / 2, y1: DEP - TX };
  const familyHoles = { s: [OPEN], e: [WIDE], n: [win(1.2)(f)] };
  roomFaces(H, 'homeWallBlue', family, f, c, familyHoles);
  crown(family, familyHoles);
  roomFaces(H, 'homeWallCream', { x0: STAIR_X0, y0: TX, x1: HALL_X1, y1: 5.0 }, f, c, {
    s: [FRONT_DOOR], w: [fd(...D1, D1_H)], e: [PASS], n: false,
  });
  const frontR = { x0: HALL_X1 + TI, y0: TX, x1: LEN - TX, y1: 3.6 - TI / 2 };
  roomFaces(H, 'homeWallBlue', frontR, f, c, { s: [fw(9.35), fw(12.2)], n: [fd(...DD)], w: [PASS] });
  const hallR = { x0: HALL_X1 + TI, y0: 3.6 + TI / 2, x1: LEN - TX, y1: 5.0 - TI / 2 };
  const hallHoles = { s: [fd(...DD)], n: [KIT], e: [fd(3.85, 4.75)] };
  roomFaces(H, 'homeWallGreen', hallR, f, c, hallHoles);
  chairRail(H, hallR, f + 0.92, hallHoles);
  /* The breakfast room and the kitchen: green, the south side the wall
   * across the stair's end round the basement door and the back hall's
   * north wall, with the hall's mouth between them. */
  const back = { x0: BRICK_X1 + TI / 2, y0: 5.0 + TI / 2, x1: LEN - TX, y1: DEP - TX };
  const backHoles = { w: [WIDE], s: false, n: [SLIDER, BAY_OPEN, KITCHEN_WIN] };
  const backSouth = [[STAIR_X0, STAIR_X1, [fd(...B_DOOR)]], [HALL_X1, LEN - TX, [KIT]]];
  roomFaces(H, 'homeWallGreen', back, f, c, backHoles);
  chairRail(H, back, f + 0.92, { ...backHoles, e: false, n: { a1: OVENS.x0, holes: [SLIDER, BAY_OPEN] } });
  for (const [a0, a1, holes] of backSouth) {
    face(H, 'homeWallGreen', 'x', back.y0, a0, a1, f, c, holes, 1);
    face(H, 'homeWhite', 'x', back.y0 + 0.014, a0, a1, f + 0.85, f + 0.92, holes, 1, 0.022);
  }
  roomFaces(H, 'homeWallGreen', { x0: BAY.x0 + TX, y0: DEP, x1: BAY.x1 - TX, y1: BAY.y1 - TX }, f, CEIL0 - 0.05, {
    s: false, n: BAY_LIGHTS, w: [BAY_SIDE], e: [BAY_SIDE],
  });

  stairs(H);
  hall(H);
  frontRoom(H);
  familyRoom(H);
  diningRoom(H);
  breakfast(H);
  kitchen(H);
  backHall(H);
}

/* The colours books are painted in. */
const SPINES = ['homeBook', 'homePlay', 'homePlayBlue', 'homeTeal'];

/* A round table on a pedestal, drawn round and solid as the square inside
 * its top and the column under it, since a capsule as wide as a table top
 * is a ball as tall as one. */
function roundTable(H, m, x, y, r, h, foot = 'homeChair', h0 = FLOOR0) {
  const c = r * 0.8;
  H.cap(m, [x, y, h - 0.04], [x, y, h], r, { seg: 16, solid: false });
  H.hidden(x - c, y - c, h - 0.04, x + c, y + c, h, 'obstacle');
  H.post(foot, x, y, h0, h - 0.04, 0.06, { seg: 8, kind: 'pole' });
}

/* A chair: seat, four legs, a back on side `back` ('n', 's', 'e', 'w'),
 * the seat in `o.seatM` when it differs from the frame. */
function chair(H, m, x, y, back, f = FLOOR0, o = {}) {
  const s = o.s ?? 0.22;
  const seat = f + (o.seat ?? 0.45);
  H.box(o.seatM ?? m, x - s, y - s, seat - 0.04, x + s, y + s, seat, { name: 'chair' });
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

/*
 * TUCKED IN. Every chair at a table is pushed in under it, the owner's ask
 * of 2026-10-19: "push the chairs in everywhere to clear the flight
 * lines". A chair of half width `s` whose back, `t` thick, is on side
 * `back` is put with the back's inner face at `face` (TUCK off a square
 * table's edge, or past a round top's rim), at `along` on that side, and
 * its centre is returned. A seat under a table top is a slot the gap rule
 * does not allow, about a quarter of a metre from the seat to the top and
 * one the craft would wedge in, so the space over the seat from its back
 * to its far edge and up to the top's underside `under` is solid to the
 * craft and drawn as nothing: a tucked in chair and its table are one
 * block. Its height is the chair's own seat `seat`.
 */
const TUCK = 0.01;
function tuck(H, back, face, along, s, t, seat, under) {
  const k = back === 'w' || back === 's' ? 1 : -1;
  const c = face + k * (s - t);
  const a = Math.min(face, c + k * s);
  const b = Math.max(face, c + k * s);
  if (back === 'w' || back === 'e') {
    H.hidden(a, along - s, seat, b, along + s, under, 'obstacle');
    return [c, along];
  }
  H.hidden(along - s, a, seat, along + s, b, under, 'obstacle');
  return [along, c];
}

/* The same at a round table of radius `r` at (x, y), the chair on the
 * side its back is on: its back past the rim, and far enough out that
 * four seats round it do not meet at their corners. */
function tuckRound(H, x, y, r, under, back, s, t, seat) {
  const d = Math.max(r + TUCK, 3 * s - t + 0.01);
  const face = back === 'w' ? x - d : back === 'e' ? x + d : back === 's' ? y - d : y + d;
  return tuck(H, back, face, back === 'w' || back === 'e' ? y : x, s, t, seat, under);
}

/* THE HALL: the front door, the stair up its west side, a dark wood
 * chest of drawers against its east wall north of the way into the front
 * room and the wall of black frames over it (gf-W0j6BxL4qbw-mr1,
 * Egrl50wX2z4-mr3, the owner's stills of 2026-10-18; frames only, nothing
 * in them), a runner, two lights. */
function hall(H) {
  const f = FLOOR0;
  const e = HALL_X1;
  H.box('homeShelf', e - 0.45, 2.45, f, e, 3.35, f + 0.95, { name: 'chest' });
  for (const h of [f + 0.3, f + 0.62]) {
    H.paint('homeWood', e - 0.455, 2.52, h, e - 0.45, 3.28, h + 0.24);
  }
  for (let i = 0; i < 6; i += 1) {
    const y = 2.55 + (i % 3) * 0.55;
    const h = f + 1.3 + Math.floor(i / 3) * 0.55 + (i % 2) * 0.06;
    H.paint('homeShutter', e - 0.018, y, h, e - 0.012, y + 0.4, h + 0.45);
    H.paint('homeWallIn', e - 0.022, y + 0.05, h + 0.05, e - 0.018, y + 0.35, h + 0.4);
  }
  H.paint('homePlay', 6.35, 0.5, f + 0.004, 7.75, 4.4, f + 0.012);
  for (const y of [1.6, 3.8]) {
    H.drum('homeLamp', 7.05, y, CEIL0 - 0.1, CEIL0, 0.2, { seg: 10 });
  }
}

/* THE FRONT ROOM, front east, pale blue (the owner's stills of
 * 2026-10-18: the light blue room through the doorway on the hall's
 * right): the red cabinet with the television on it on the east wall, a
 * white bench under a front window, a red rug, an armchair in the corner
 * by the back hall's door, a pendant. */
function frontRoom(H) {
  const f = FLOOR0;
  const e = LEN - TX;
  const n = 3.6 - TI / 2;
  H.box('homePlay', e - 0.48, 0.9, f, e, 2.25, f + 0.75, { name: 'tv cabinet' });
  H.box('homeScreen', e - 0.06, 1.08, f + 0.85, e, 2.08, f + 1.45, { name: 'television', kind: 'obstacle' });
  H.paint('homeChair', e - 0.2, 1.48, f + 0.75, e - 0.06, 1.68, f + 0.85);
  H.box('homeWhite', 11.5, TX, f, 12.9, TX + 0.4, f + 0.45, { name: 'bench' });
  H.paint('homePlay', 9.4, 0.8, f + 0.004, 12.6, 3.0, f + 0.012);
  H.paint('homeBook', 9.6, 0.95, f + 0.012, 12.4, 1.1, f + 0.016);
  H.paint('homeBook', 9.6, 2.7, f + 0.012, 12.4, 2.85, f + 0.016);
  H.box('homeSofa', 13.0, n - 0.8, f, e, n, f + 0.45, { name: 'armchair' });
  H.box('homeSofa', 13.0, n - 0.2, f + 0.45, e, n, f + 0.9, { name: 'armchair back' });
  H.drum('homeLamp', 11.1, 1.9, CEIL0 - 0.1, CEIL0, 0.2, { seg: 10 });
}

/*
 * THE FAMILY ROOM: pale blue grey walls, open to the south into the
 * dining room, a wall of dark built ins on the chimney's wall with the
 * television in a white surround in the middle of it, which is what every
 * still through the wide opening shows (GB2kc0xNhoE-mr2,
 * gf-gOVLqJl3GvA-mr2, Egrl50wX2z4-mr3); the stone fireplace under it is
 * not in any still and stays because the chimney is on that wall outside.
 * A sectional, the dark console behind it with six wicker baskets along
 * its face and a lamp each end, a navy rug, a dome light.
 */
function familyRoom(H) {
  const f = FLOOR0;
  const w = TX;
  H.box('homeStone', w, 5.03, f, w + 0.45, 6.37, f + 1.3, { name: 'fireplace' });
  H.paint('homeChair', w + 0.45, 5.4, f + 0.12, w + 0.455, 6.0, f + 0.85);
  H.box('homeShelf', w, 4.95, f + 1.3, w + 0.55, 6.45, f + 1.38, { name: 'mantel' });
  H.box('homeShelf', w, 5.03, f + 1.38, w + 0.2, 6.37, CEIL0, { name: 'chimney breast' });
  H.paint('homeWallIn', w + 0.2, 5.1, f + 1.5, w + 0.205, 6.3, f + 2.3);
  H.box('homeScreen', w + 0.2, 5.2, f + 1.6, w + 0.25, 6.2, f + 2.2, { name: 'television', kind: 'obstacle' });
  H.box('homeStone', w + 0.45, 4.95, f, w + 0.95, 6.45, f + 0.08, { name: 'hearth' });
  /* The cube shelving, floor to ceiling either side, baskets in the low
   * cubes. The frame stays dark, as it is in the house; the cubes' backs
   * are wood, since a dark colour on a wall facing away from the sun draws
   * in its shade tint and the slate backs of the first shots read as a
   * black grid across the room. */
  for (const [a, b] of [[3.0 + TI / 2, 4.95], [6.45, DEP - TX]]) {
    H.box('homeShelf', w, a, f, w + 0.42, b, CEIL0, { name: 'built in' });
    const n = Math.max(2, Math.round((b - a) / 0.42));
    for (let j = 0; j < n; j += 1) {
      const y0 = a + ((b - a) * j) / n + 0.03;
      const y1 = a + ((b - a) * (j + 1)) / n - 0.03;
      for (let k = 0; k < 5; k += 1) {
        const h0 = f + 0.06 + k * 0.46;
        H.paint(k < 2 ? 'homeWicker' : 'homeWood', w + 0.42, y0, h0, w + 0.426, y1, h0 + 0.38);
        if (k >= 2 && (j + k) % 3 === 0) {
          H.paint(SPINES[(j + k) % SPINES.length], w + 0.426, y0 + 0.04, h0 + 0.02, w + 0.43, y0 + (y1 - y0) * 0.6, h0 + 0.3);
        }
      }
    }
  }
  /* The sectional: its long run facing the fireplace, a return along the
   * north wall, and a console behind it with two lamps. */
  sofa(H, 2.3, 4.2, 3.2, 7.4, 'e');
  sofa(H, 1.3, 7.4, 2.3, 8.15, 'n');
  H.box('homeShelf', 3.2, 4.7, f, 3.57, 6.9, f + 0.78, { name: 'console' });
  for (let i = 0; i < 6; i += 1) {
    const y = 4.76 + i * 0.355;
    H.paint('homeWicker', 3.57, y, f + 0.06, 3.575, y + 0.3, f + 0.36);
    H.paint(i % 3 ? 'homeWood' : 'homeWallIn', 3.57, y, f + 0.44, 3.575, y + 0.3, f + 0.7);
  }
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

/*
 * THE DINING ROOM, front west in the brick block, pale blue over a dark
 * stained wainscot under a dark crown, open to the family room behind it
 * (the owner's stills of 2026-10-18, from the family room looking south
 * through the open wall; fl -RMs75rduDw-mr1, eoMp21npdD4-mr3,
 * KB2ei7G6m1w-mr1): a wood topped table on white turned legs, its length
 * toward the window, white Windsor chairs with wood seats, a navy
 * patterned rug, the tall white glass fronted hutch against the west wall
 * by the open wall, black and pink frames on that wall past the window, a
 * black cart under them, the dark upright piano on the east wall north of
 * the door to the hall under a wall of black frames, a low black shoe
 * cubby in the front corner under more. The tall window's wood blind is
 * left up, so the window stays a way out.
 */
function diningRoom(H) {
  const f = FLOOR0;
  const top = f + 0.76;
  const t = { x0: 1.85, x1: 2.85, y0: -0.33, y1: 1.87 };
  H.box('homeWood', t.x0, t.y0, top - 0.05, t.x1, t.y1, top, { name: 'table' });
  for (const [x, y] of [[t.x0 + 0.08, t.y0 + 0.08], [t.x1 - 0.08, t.y0 + 0.08], [t.x0 + 0.08, t.y1 - 0.08], [t.x1 - 0.08, t.y1 - 0.08]]) {
    H.box('homeWhite', x - 0.04, y - 0.04, f, x + 0.04, y + 0.04, top - 0.05, { name: 'table leg' });
  }
  H.paint('homeBook', 2.2, t.y0 + 0.1, top, 2.5, t.y1 - 0.1, top + 0.004);
  const windsor = { backH: 0.55, seatM: 'homeWood' };
  const cx = (t.x0 + t.x1) / 2;
  const cy = (t.y0 + t.y1) / 2;
  /* Tucked in, the side chairs far enough apart that the end chairs' seats
   * pass between them under the top. */
  const at = (back, face, along) => tuck(H, back, face, along, 0.22, 0.04, f + 0.45, top - 0.05);
  for (const y of [cy - 0.48, cy + 0.48]) {
    chair(H, 'homeWhite', ...at('w', t.x0 - TUCK, y), 'w', f, windsor);
    chair(H, 'homeWhite', ...at('e', t.x1 + TUCK, y), 'e', f, windsor);
  }
  chair(H, 'homeWhite', ...at('n', t.y1 + TUCK, cx), 'n', f, windsor);
  chair(H, 'homeWhite', ...at('s', t.y0 - TUCK, cx), 's', f, windsor);
  H.paint('homeRug', 1.05, -1.0, f + 0.004, 3.65, 2.55, f + 0.012);
  for (const [x0, y0, x1, y1] of [[1.2, -0.85, 3.5, -0.75], [1.2, 2.3, 3.5, 2.4], [1.2, -0.75, 1.3, 2.3], [3.4, -0.75, 3.5, 2.3]]) {
    H.paint('homeTeal', x0, y0, f + 0.012, x1, y1, f + 0.016);
  }
  /* The hutch, nearly to the ceiling, glass over panelled doors, a crown. */
  const w = TX;
  const n = 3.0 - TI / 2;
  H.box('homeWhite', w, 1.3, f, w + 0.5, n, f + 0.9, { name: 'hutch' });
  H.box('homeWhite', w, 1.35, f + 0.9, w + 0.4, n, f + 2.04, { name: 'hutch top' });
  H.box('homeWhite', w, 1.27, f + 2.04, w + 0.48, n, f + 2.12, { name: 'hutch crown' });
  for (const [a, b] of [[1.42, 2.1], [2.2, 2.86]]) {
    H.paint('homeWindow', w + 0.4, a, f + 1.0, w + 0.405, b, f + 1.95);
    H.paint('homeWallIn', w + 0.5, a, f + 0.15, w + 0.505, b, f + 0.75);
  }
  /* Past the window on the west wall, frames over a black cart. */
  H.box('homeShelf', w, FRONT + TX, f, w + 0.4, -0.85, f + 0.85, { name: 'cart' });
  H.paint('homeWood', w + 0.4, -1.32, f + 0.55, w + 0.405, -0.93, f + 0.8);
  picture(H, 'y', w, 1, -1.3, -0.9, f + 1.35, f + 1.85, 'homePlay', 0.012);
  picture(H, 'y', w, 1, -0.7, -0.3, f + 1.45, f + 1.9, 'homeWallIn', 0.012);
  picture(H, 'y', w, 1, -0.7, -0.4, f + 1.05, f + 1.35, 'homePlay', 0.012);
  /* The piano on the east wall, north of the double opening and right
   * beside it (the owner's still of 2026-10-18 from the piano room), its
   * keys to the room, a wall of black frames over it. */
  const pe = BRICK_X1 - TI / 2;
  H.box('homeShelf', pe - 0.55, 1.68, f, pe, 2.92, f + 1.25, { name: 'piano' });
  H.box('homeShelf', pe - 0.75, 1.72, f + 0.72, pe - 0.55, 2.88, f + 0.8, { name: 'piano keys' });
  H.paint('homeWhite', pe - 0.74, 1.76, f + 0.8, pe - 0.56, 2.84, f + 0.81);
  for (let i = 0; i < 6; i += 1) {
    const y = 1.74 + (i % 3) * 0.4;
    const h = f + 1.45 + Math.floor(i / 3) * 0.45;
    picture(H, 'y', pe, -1, y, y + 0.36, h, h + 0.38, i % 2 ? 'homeWallIn' : 'homeWood', 0.012);
  }
  /* The shoe cubby in the front corner, frames over it. */
  const s = FRONT + TX;
  const ce = BRICK_X1 - TX;
  H.box('homeShelf', ce - 0.85, s, f, ce, s + 0.35, f + 0.5, { name: 'cubby shelf' });
  for (let k = 0; k < 3; k += 1) {
    H.paint(SPINES[k], ce - 0.8 + k * 0.27, s + 0.35, f + 0.06, ce - 0.58 + k * 0.27, s + 0.355, f + 0.2);
  }
  for (let i = 0; i < 6; i += 1) {
    const x = ce - 0.95 + (i % 3) * 0.32;
    const h = f + 1.25 + Math.floor(i / 3) * 0.42;
    picture(H, 'x', s, 1, x, x + 0.26, h, h + 0.34, i % 2 ? 'homeWood' : 'homeWallIn', 0.012);
  }
  H.drum('homeLamp', cx, (t.y0 + t.y1) / 2, f + 1.85, CEIL0, 0.18, { seg: 10 });
}

/* A tub chair: a low upholstered seat in a wrap of back and arms, back to
 * side `back` ('n', 's', 'e' or 'w'), on four short wood legs. */
function tubChair(H, x, y, back) {
  const f = FLOOR0;
  const s = 0.26;
  const m = 'homeSofa';
  H.box(m, x - s, y - s, f + 0.18, x + s, y + s, f + 0.46, { name: 'chair' });
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    H.post('homeWood', x + dx * (s - 0.05), y + dy * (s - 0.05), f, f + 0.18, 0.02, { seg: 5, kind: 'pole' });
  }
  const t = 0.12;
  const ax = back === 'n' || back === 's';
  const b = back === 's' || back === 'w' ? -1 : 1;
  if (ax) {
    H.box(m, x - s, b < 0 ? y - s : y + s - t, f + 0.46, x + s, b < 0 ? y - s + t : y + s, f + 0.82, { name: 'chair back' });
    for (const side of [-1, 1]) {
      H.box(m, side < 0 ? x - s : x + s - 0.1, y - s, f + 0.46, side < 0 ? x - s + 0.1 : x + s, y + s, f + 0.645, { name: 'chair arm' });
    }
  } else {
    H.box(m, b < 0 ? x - s : x + s - t, y - s, f + 0.46, b < 0 ? x - s + t : x + s, y + s, f + 0.82, { name: 'chair back' });
    for (const side of [-1, 1]) {
      H.box(m, x - s, side < 0 ? y - s : y + s - 0.1, f + 0.46, x + s, side < 0 ? y - s + 0.1 : y + s, f + 0.645, { name: 'chair arm' });
    }
  }
}

/*
 * THE BREAKFAST ROOM, the clearest of the stills (gf-gOVLqJl3GvA-mr2,
 * GB2kc0xNhoE-mr2, uZuJXjvH1A8-mr2, Egrl50wX2z4-mr3, -M3qDT4i7xk-mr3): a
 * round wood topped table on a cream pedestal by the slider and the bay,
 * white slat backed chairs on two sides and cream upholstered tub chairs on
 * the other two, a glass globe on its cord over it, two painted plates on
 * the west wall north of the wide opening, a narrow shelf of board games in
 * the corner by the slider, and the white ledge of books along the west
 * wall at the height of the door heads, from the basement door's corner
 * over the opening, the books nearly to the ceiling and the solid closed
 * over them, so the ledge is not a slot. No ledge on the north wall: the
 * slider and the bay fill it.
 */
function breakfast(H) {
  const f = FLOOR0;
  const cx = 7.3;
  const cy = 7.05;
  roundTable(H, 'homeWood', cx, cy, 0.58, f + 0.76, 'homeCabinet');
  const at = (back, s, t, seat) => tuckRound(H, cx, cy, 0.58, f + 0.72, back, s, t, seat);
  chair(H, 'homeWhite', ...at('w', 0.22, 0.04, f + 0.45), 'w', f, { backH: 0.5 });
  chair(H, 'homeWhite', ...at('n', 0.22, 0.04, f + 0.45), 'n', f, { backH: 0.5 });
  tubChair(H, ...at('e', 0.26, 0.12, f + 0.46), 'e');
  tubChair(H, ...at('s', 0.26, 0.12, f + 0.46), 's');
  H.post('homeChair', cx, cy, f + 1.8, CEIL0, 0.01, { seg: 4, solid: false });
  H.cap('homeLamp', [cx, cy, f + 1.7], [cx, cy, f + 1.7], 0.15, { look: 'capsule', seg: 10, kind: 'obstacle' });
  const w = BRICK_X1 + TI / 2;
  /* The ledge, from the corner by the basement door to the north corner. */
  const lh = f + 2.25;
  const y0 = 5.0 + TI / 2 + 0.03;
  const y1 = DEP - TX;
  H.box('homeWhite', w, y0, lh - 0.04, w + 0.24, y1, lh, { name: 'book ledge', kind: 'obstacle' });
  H.hidden(w, y0, lh, w + 0.24, y1, CEIL0, 'obstacle', 'books');
  const nb = Math.round((y1 - y0) / 0.5);
  for (let i = 0; i < nb; i += 1) {
    const a = y0 + ((y1 - y0) * (i + 0.1)) / nb;
    const b = y0 + ((y1 - y0) * (i + 0.85)) / nb;
    H.paint(i % 2 ? 'homeBook' : 'homePlay', w + 0.03, a, lh, w + 0.21, b, lh + 0.31 - (i % 3) * 0.03);
  }
  /* The plates, one striped and one yellow. */
  H.paint('homeWhite', w + 0.012, 7.3, f + 1.45, w + 0.018, 7.62, f + 1.68);
  for (let k = 0; k < 3; k += 1) {
    H.paint(['homePlay', 'homeBook', 'homeTeal'][k], w + 0.018, 7.33, f + 1.5 + k * 0.05, w + 0.022, 7.59, f + 1.53 + k * 0.05);
  }
  H.paint('homeBook', w + 0.012, 7.72, f + 1.45, w + 0.018, 8.04, f + 1.68);
  /* The games, stacked on a narrow white shelf in the corner. */
  const gx = w + 0.32;
  H.box('homeWhite', w, DEP - TX - 0.36, f, gx, DEP - TX, f + 1.7, { name: 'games shelf' });
  for (let k = 0; k < 7; k += 1) {
    H.paint(SPINES[k % SPINES.length], gx, DEP - TX - 0.33, f + 0.1 + k * 0.22, gx + 0.005, DEP - TX - 0.03, f + 0.26 + k * 0.22);
  }
}

/*
 * THE KITCHEN, a galley along the back wall (zX4qS_s0E1o-mr1,
 * gf-W0j6BxL4qbw-mr2, gf-a0z7OLR4ztQ-mr2, uZuJXjvH1A8-mr2): cream shaker
 * cabinets under a brown granite top, the wall ovens and the microwave in
 * a tall cabinet at the breakfast room end, then drawers, the dishwasher,
 * the sink under the window and a cooktop, the run turning up the east
 * wall; the fridge at the far end of the aisle with a pantry beside it.
 * The island runs parallel to the back wall, drawers along its aisle side,
 * three tall stools, two natural and one white, crowded at its breakfast
 * room end, the pressed tin panel over it with a light in it, and the LED
 * cube gate on it. The house holds the galley about 0.4 m shallower than
 * the stills suggest, so the walk past the island's south side is narrow.
 */
function kitchen(H) {
  const f = FLOOR0;
  const n = DEP - TX;
  const e = LEN - TX;
  const base = f + 0.88;
  const top = base + 0.04;
  const d = 0.62;
  /* The oven tower, floor to ceiling, so there is no slot over it. */
  const o = OVENS;
  H.box('homeCabinet', o.x0, n - d - 0.02, f, o.x1, n, CEIL0, { name: 'ovens' });
  H.paint('homeShutter', o.x0 + 0.05, n - d - 0.025, f + 0.72, o.x1 - 0.05, n - d - 0.02, f + 1.42);
  H.paint('homeSteel', o.x0 + 0.1, n - d - 0.03, f + 1.32, o.x1 - 0.1, n - d - 0.025, f + 1.36);
  H.paint('homeSteel', o.x0 + 0.05, n - d - 0.025, f + 1.5, o.x1 - 0.05, n - d - 0.02, f + 1.88);
  H.paint('homeScreen', o.x0 + 0.1, n - d - 0.03, f + 1.56, o.x1 - 0.25, n - d - 0.025, f + 1.82);
  /* The run along the back wall and its short return up the east wall. */
  H.box('homeCabinet', o.x1, n - d, f, e, n, base, { name: 'cabinets' });
  H.box('homeCounter', o.x1, n - d - 0.03, base, e, n, top, { name: 'counter' });
  H.box('homeCabinet', e - d, 7.0, f, e, n - d, base, { name: 'cabinets' });
  H.box('homeCounter', e - d - 0.03, 7.0, base, e, n - d, top, { name: 'counter' });
  for (const [a, b] of [[o.x1, 11.45], [12.75, e]]) {
    H.box('homeCabinet', a, n - 0.34, f + 1.45, b, n, CEIL0, { name: 'uppers' });
  }
  H.box('homeCabinet', e - 0.34, 7.0, f + 1.45, e, n - 0.34, CEIL0, { name: 'uppers' });
  H.paint('homeSteel', 11.85, n - d + 0.08, top, 12.35, n - 0.1, top + 0.005);
  H.paint('homeSteel', 11.15, n - d - 0.005, f + 0.1, 11.75, n - d, base - 0.03);
  H.paint('homeChair', 12.85, n - d + 0.06, top, 13.45, n - 0.08, top + 0.006);
  for (let x = o.x1; x < e - 0.3; x += 0.6) {
    if (x > 11.0 && x < 11.8) {
      continue;
    }
    H.paint('homeCounter', x + 0.27, n - d - 0.005, f + 0.1, x + 0.29, n - d, base - 0.05);
  }
  /* The fridge at the aisle's end, a cupboard over it, and the pantry. */
  H.box('homeSteel', e - 0.75, 6.1, f, e, 6.95, f + 1.85, { name: 'fridge' });
  H.paint('homeChair', e - 0.755, 6.5, f + 0.95, e - 0.75, 6.54, f + 1.6);
  H.box('homeCabinet', e - d, 6.1, f + 1.85, e, 6.95, CEIL0, { name: 'uppers' });
  H.box('homeCabinet', e - d, 5.0 + TI / 2, f, e, 6.05, CEIL0, { name: 'pantry' });
  H.paint('homeCounter', e - d - 0.005, 5.55, f + 0.1, e - d, 5.57, CEIL0 - 0.1);
  /* The island, its top over the stools' end. */
  const it = ISLAND;
  H.box('homeCabinet', it.x0 + 0.25, it.y0 + 0.05, f, it.x1 - 0.05, it.y1 - 0.05, base, { name: 'island' });
  H.box('homeCounter', it.x0, it.y0, base, it.x1, it.y1, top, { name: 'island top' });
  for (let x = it.x0 + 0.3; x < it.x1 - 0.2; x += 0.5) {
    H.paint('homeCounter', x + 0.22, it.y1 - 0.055, f + 0.1, x + 0.24, it.y1 - 0.05, base - 0.05);
    H.paint('homeSteel', x + 0.08, it.y1 - 0.055, base - 0.14, x + 0.16, it.y1 - 0.05, base - 0.11);
  }
  /* The stools pushed in under the top's overhang, against the cabinet,
   * and the space over each up to the top solid to the craft, as a tucked
   * in chair's is (tuck()). */
  const sm = ['homeWood', 'homeWhite', 'homeWood'];
  for (let k = 0; k < 3; k += 1) {
    const y = it.y0 + 0.2 + k * 0.25;
    const x = it.x0 + 0.25 - 0.12 - TUCK;
    H.post(sm[k], x, y, f, f + 0.62, 0.025, { seg: 6, kind: 'pole' });
    H.drum('homeWood', x, y, f + 0.62, f + 0.67, 0.12, { seg: 10 });
    H.hidden(x - 0.096, y - 0.096, f + 0.67, it.x0 + 0.25, y + 0.096, base, 'obstacle');
  }
  /* An LED cube gate on the island, like the one on the basement table in
   * Nick's videos (basementMain()), a gate to thread over the counter. */
  ledCube(H, { x0: 11.1, x1: 12.1, y0: it.y0, y1: it.y1 }, top, 1.0);
  H.paint('homeSteel', 10.95, it.y0 + 0.08, CEIL0 - 0.006, 12.25, it.y1 - 0.08, CEIL0 - 0.001);
  H.drum('homeLamp', 11.6, (it.y0 + it.y1) / 2, CEIL0 - 0.08, CEIL0 - 0.006, 0.16, { seg: 10 });
}

/* THE BACK HALL: green walls, the white locker and cubby bench along its
 * south side, baskets in its cubbies and coats on hooks over it, a black
 * and white runner, the door into the garage at its end, and on the
 * breakfast room side of its north wall, between the hall and the
 * doorway, the green pier with the mirror on it. */
function backHall(H) {
  const f = FLOOR0;
  const s = 3.6 + TI / 2;
  H.box('homeWhite', 10.3, s, f, 13.3, s + 0.42, f + 0.45, { name: 'bench' });
  H.box('homeWhite', 10.3, s, f + 1.55, 13.3, s + 0.36, CEIL0, { name: 'cubbies' });
  for (let i = 0; i < 5; i += 1) {
    const x = 10.45 + i * 0.58;
    H.paint('homeCounter', x + 0.28, s + 0.36, f + 1.6, x + 0.3, s + 0.365, f + 2.2);
    H.paint(['homePlay', 'homePlayBlue', 'homeTeal', 'homeWood', 'homeChair'][i], x, s + 0.02, f + 0.8, x + 0.36, s + 0.2, f + 1.48);
    H.paint('homeWicker', x + 0.02, s + 0.42, f + 0.08, x + 0.42, s + 0.425, f + 0.36);
  }
  H.paint('homeChair', 8.7, 4.15, f + 0.004, 13.5, 4.8, f + 0.012);
  for (let x = 8.85; x < 13.4; x += 0.5) {
    H.paint('homeWhite', x, 4.22, f + 0.012, x + 0.22, 4.73, f + 0.016);
  }
  const m = 5.0 + TI / 2;
  H.paint('homeSteel', 8.6, m + 0.012, f + 1.3, 9.26, m + 0.018, f + 1.96);
  H.paint('homeWindow', 8.68, m + 0.018, f + 1.38, 9.18, m + 0.022, f + 1.88);
}

/* ------------------------------------------------------------------ */
/* Upstairs                                                            */
/* ------------------------------------------------------------------ */

/*
 * THE PICTURE IN THE UPSTAIRS HALL, the owner's ask of 2026-10-23: "put a
 * picture frame on this and hang it in the upstairs hall way". Hung on the
 * knee wall, the hall's long blank south wall, in the middle of the hall
 * east of the stairwell, so it is on the right flying east from the top of
 * the stair, on the left flying back, and straight ahead out of bedroom 4.
 * `at` is the wall's face, `x` the picture's middle along it, `h` its
 * middle's height, `w` its width and `ht` its height, the picture's own
 * 447 by 65 pixels, all real metres; `from` is where along the hall
 * ./stickers.js aims it from. A black frame round a white mount is drawn
 * here with the house; the picture itself is a quad on the mount in the
 * NB stickers' one mesh (placeHallPicture in ./stickers.js), off its own
 * piece of their sheet, so it is no draw call of its own.
 */
export const HALL_PICTURE = { at: KNEE + TI / 2, x: 8.8, h: FLOOR1 + 1.5, w: 1.9, ht: 1.9 * 65 / 447, from: 4.4 };
/* The mount's white margin round the picture, the frame's width, and how
 * far each stands off the wall, real metres: off the face as picture()
 * hangs one, the mount's back a whisker in front of the frame's so no two
 * faces share a plane, and the frame proud of the mount. */
const MOUNT = 0.06;
const FRAME_W = 0.045;
const FRAME_D = [0.012, 0.04];
const MOUNT_D = [0.014, 0.03];

/* The frame's four bars, black, and the white mount behind them, its edges
 * tucked a centimetre under the bars. Paint: drawn, not solid. */
function hallPicture(H) {
  const P = HALL_PICTURE;
  const a = P.at;
  const x0 = P.x - P.w / 2 - MOUNT;
  const x1 = P.x + P.w / 2 + MOUNT;
  const h0 = P.h - P.ht / 2 - MOUNT;
  const h1 = P.h + P.ht / 2 + MOUNT;
  const f = { solid: false, cast: false, name: 'hall picture frame' };
  H.box('homeShutter', x0 - FRAME_W, a + FRAME_D[0], h1, x1 + FRAME_W, a + FRAME_D[1], h1 + FRAME_W, f);
  H.box('homeShutter', x0 - FRAME_W, a + FRAME_D[0], h0 - FRAME_W, x1 + FRAME_W, a + FRAME_D[1], h0, f);
  H.box('homeShutter', x0 - FRAME_W, a + FRAME_D[0], h0, x0, a + FRAME_D[1], h1, f);
  H.box('homeShutter', x1, a + FRAME_D[0], h0, x1 + FRAME_W, a + FRAME_D[1], h1, f);
  H.box('homeWhite', x0 - 0.01, a + MOUNT_D[0], h0 - 0.01, x1 + 0.01, a + MOUNT_D[1], h1 + 0.01, {
    solid: false, cast: false, name: 'hall picture mount',
  });
}

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
  H.floor('homeFloor', BRICK_X1, STAIR_Y1, STAIR_X1, 5.4, f);
  H.floor('homeFloor', STAIR_X1, KNEE, 7.2, 5.4, f);
  H.floor('homeFloor', 7.2, KNEE, 10.4, 5.9, f);
  H.floor('homeTile', BRICK_X1, 5.4, 7.2, DEP - TX, f);
  H.floor('homeCarpet', 7.2, 5.9, 10.4, DEP - TX, f);
  H.floor('homeCarpet', 10.4, KNEE, LEN - TX, DEP - TX, f);

  /* The knee wall, the upper floor's front behind the porch. */
  H.wall('x', KNEE, BRICK_X1 + TI / 2, LEN - TX, f, c);
  H.box('homeWallIn', STAIR_X0, KNEE - TI / 2, CEIL0, STAIR_X1, KNEE + TI / 2, f, { name: 'stairwell head' });
  /* px 4.6: the stairwell's west side, master | landing past the stair's
   * head, master | bath. Bedroom 2 opens off the master, since the stair
   * comes up along the wall that would have held its door. */
  const md = [4.5, 5.3];
  H.wall('y', BRICK_X1, 0, DEP - TX, f, c, { holes: [[...md, f, f + DOOR_H]] });
  doorway(H, 'y', BRICK_X1, ...md, f, { leaf: { side: -1, at: 'b0' } });
  /* py 3.8: bedroom 2 | master. */
  const b2 = [3.3, 4.1];
  H.wall('x', 3.8, TX, BRICK_X1 - TI / 2, f, c, { holes: [[...b2, f, f + DOOR_H]] });
  doorway(H, 'x', 3.8, ...b2, f, { leaf: { side: -1, at: 'b0' } });
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
  /* Along the stairwell's open side. */
  balustrade(H, 'y', STAIR_X1 + 0.04, KNEE + TI / 2, STAIR_Y1, f);
  /* The kids' room in teal, the master in blue grey, the landing in the
   * hall's cream. */
  roomFaces(H, 'homeWallKids', { x0: 10.4 + TI / 2, y0: KNEE + TI / 2, x1: LEN - TX, y1: 5.0 - TI / 2 }, f, c, {
    w: [[...kd, f, f + DOOR_H]], e: [KIDS_WIN],
  });
  roomFaces(H, 'homeWallBlue', { x0: TX, y0: 3.8 + TI / 2, x1: BRICK_X1 - TI / 2, y1: DEP - TX }, f, c, {
    w: [win(7.3)(f)], n: [win(1.5)(f), win(3.4)(f)], e: [[...md, f, f + DOOR_H]], s: [[...b2, f, f + DOOR_H]],
  });
  roomFaces(H, 'homeWallCream', { x0: BRICK_X1 + TI / 2, y0: KNEE + TI / 2, x1: 7.2, y1: 5.4 - TI / 2 }, f, c, {
    w: [[...md, f, f + DOOR_H]], n: [[...ba, f, f + DOOR_H]], e: false,
  });

  /* Bedroom 2, over the dining room, the tall window's upper half. */
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
  hallPicture(H);
}

/* A bed against a wall: (x, y) its plan corner, w its width along the head
 * wall, l its length out from it, `head` the wall its head is on, on the
 * floor at f. */
function bed(H, x, y, w, l, head, m, f = FLOOR1) {
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
/* The basement                                                        */
/* ------------------------------------------------------------------ */

/*
 * WHERE ITS ROOMS ARE, real metres. The main room is the west part, one
 * open room from the front wall to the back under the dining room and the
 * family room, the stair down along its east side at the front with the
 * lounge beside it, and past the stair's head the room reaches on east
 * under the breakfast room to the kitchenette. From the stair's foot a
 * hall runs east along the front wall to the workshop across the east end
 * (bsmt-K9uGMfYKJLg-mr2's second view: the stair on its left, the
 * workshop's door open at its end). North of that hall, east of the stair,
 * the playroom; past the stair's head a short hall from the main room to
 * the workshop's other door, the guest room north of it against the back
 * wall, where its small high window can be (bsmt-Jdr06Vgp-NM-mr3). What
 * each room holds is the stills' (bsmt-hdRR_6chm2M-mr2,
 * bsmt-j6odZGcoq_0-mr2, bsmt--M3qDT4i7xk-mr2, bsmt-K9uGMfYKJLg-mr2,
 * bsmt-dv3zfxHDwjw-mr2, bsmt-Jdr06Vgp-NM-mr3, the rest in REFERENCES.md);
 * the playroom's and the guest room's places are inferred, since no still
 * shows either beside the stair.
 */
/* Where the halls start, east of the main room's back part. */
const B_EAST = 7.2;
const MAIN = { x0: TX, y0: TX, x1: B_EAST - TI, y1: DEP - TX };
const MAIN_E = B_EAST - TI / 2;
/* The lounge's east side, the stair's west wall. */
const LOUNGE_X1 = STAIR_X0 - TI;
/* Where the half wall along the stair's foot gives way to the full wall:
 * the opening over the half wall is still half a metre high there. */
const HALF_Y = 2.0;
const HALL = { x0: B_EAST, x1: 10.5, y0: 4.22, y1: 5.15 };
const HALL_DOOR = [4.26, 5.11];
/* The hall from the stair's foot, the landing in front of the foot its
 * west end, and its door into the workshop. */
const FOOT_HALL = { x0: LOUNGE_X1, x1: HALL.x1, y0: TX, y1: 1.4 };
const SHOP_DOOR = [0.45, 1.3];
const PLAY = { x0: STAIR_X1 + TI, y0: FOOT_HALL.y1 + TI, x1: HALL.x1, y1: HALL.y0 - TI };
const PLAY_DOOR = [8.6, 9.4];
const GUEST = { x0: B_EAST, y0: HALL.y1 + TI, x1: HALL.x1, y1: DEP - TX };
const GUEST_DOOR = [8.5, 9.3];
const SHOP = { x0: HALL.x1 + TI, y0: TX, x1: LEN - TX, y1: DEP - TX };
/* The soffit over the kitchenette, and the beam across the lounge from
 * the west wall to the stair's. */
const SOFF = { x0: 6.42, y0: HALL.y1 + TI, h: BF + 2.0 };
const BEAM = { y0: 3.85, y1: 4.15, h: BF + 2.05 };

function basement(H) {
  const f = BF;
  /* The slab, the foundation walls and the floor's pale grey planks. */
  H.box('homeFoundation', 0, 0, f - B_SLAB, LEN, DEP, f, { name: 'basement slab' });
  const walls = [[0, 0, LEN, TX], [0, DEP - TX, LEN, DEP], [0, TX, TX, DEP - TX], [LEN - TX, TX, LEN, DEP - TX]];
  for (const [a, b, c, d] of walls) {
    H.box('homeWallIn', a, b, f - B_SLAB, c, d, 0, { kind: 'wall', name: 'foundation' });
  }
  H.floor('homeSteel', TX, TX, LEN - TX, DEP - TX, f);
  /* The ceiling, a whisker under the slab: white, but for the workshop's
   * bare joists. */
  for (const [a, b, c, d] of around(HOLE, TX, TX, HALL.x1 + TI / 2, DEP - TX)) {
    H.paint('homeWallIn', a, b, -0.008, c, d, -0.002);
  }
  H.paint('homeShelf', HALL.x1 + TI / 2, TX, -0.008, LEN - TX, DEP - TX, -0.002);

  /* THE WALLS. The stair's west wall is the lounge's east one, a half
   * wall along its foot and then full height to the stair's head; past the
   * head the main room reaches east to its own east wall, with the cased
   * way into the hall in it. The stair's east wall stops at its foot,
   * where the hall along the front starts, and at its head turns east as
   * the playroom's north wall. */
  const door = (d) => [d[0], d[1], f, f + DOOR_H];
  H.wall('y', STAIR_X0 - TI / 2, HALF_Y, SB.top, f, 0);
  H.wall('y', MAIN_E, PLAY.y1, DEP - TX, f, 0, { holes: [door(HALL_DOOR)] });
  H.frame('y', MAIN_E, TI, -1, door(HALL_DOOR), 'homeWhite', { w: 0.08, d: 0.02 });
  H.frame('y', MAIN_E, TI, 1, door(HALL_DOOR), 'homeWhite', { w: 0.08, d: 0.02 });
  H.wall('y', STAIR_X1 + TI / 2, SB_FOOT, PLAY.y1, f, 0);
  H.wall('x', FOOT_HALL.y1 + TI / 2, STAIR_X1 + TI, HALL.x1, f, 0);
  H.wall('x', HALL.y0 - TI / 2, STAIR_X1, HALL.x1, f, 0, { holes: [door(PLAY_DOOR)] });
  H.wall('x', HALL.y1 + TI / 2, B_EAST, HALL.x1, f, 0, { holes: [door(GUEST_DOOR)] });
  H.wall('y', HALL.x1 + TI / 2, TX, DEP - TX, f, 0, { holes: [door(SHOP_DOOR), door(HALL_DOOR)] });
  doorway(H, 'x', HALL.y0 - TI / 2, ...PLAY_DOOR, f, { leaf: { side: -1, at: 'b1' } });
  doorway(H, 'x', HALL.y1 + TI / 2, ...GUEST_DOOR, f, { leaf: { side: 1, at: 'b0' } });
  doorway(H, 'y', HALL.x1 + TI / 2, ...HALL_DOOR, f, { leaf: { side: 1, at: 'b1' } });
  doorway(H, 'y', HALL.x1 + TI / 2, ...SHOP_DOOR, f, { leaf: { side: 1, at: 'b1' } });
  /* The rooms' colours: greige in the main room, the hall and the guest
   * room, so the white trim, the fireplace and the half wall stand out of
   * it as they do in the stills, yellow in the playroom, the workshop
   * blue; the stairwell and the hall from its foot the walls' own white,
   * as in the stills; white baseboards everywhere. The main room is an L,
   * so its faces are listed: the west wall, the front to the stair's foot,
   * the back, the stair's west wall, the playroom's north wall past the
   * stair's head, and the east wall with the way into the hall. */
  const mainFaces = (m, h1, proud, a0) => {
    const sides = [
      ['y', MAIN.x0, MAIN.y0, MAIN.y1, 1, []],
      ['x', MAIN.y0, MAIN.x0, LOUNGE_X1, 1, []],
      ['x', MAIN.y1, MAIN.x0, MAIN.x1, -1, []],
      ['y', LOUNGE_X1, a0, SB.top, -1, []],
      ['x', PLAY.y1 + TI, STAIR_X1, MAIN.x1, 1, []],
      ['y', MAIN.x1, PLAY.y1 + TI, MAIN.y1, -1, [door(HALL_DOOR)]],
    ];
    for (const [dir, at, b0, b1, side, holes] of sides) {
      face(H, m, dir, at + side * proud, b0, b1, f, h1, holes, side, 0.008 + proud);
    }
  };
  const hallHoles = { s: [door(PLAY_DOOR)], n: [door(GUEST_DOOR)], w: [door(HALL_DOOR)], e: [door(HALL_DOOR)] };
  const shopHoles = { w: [door(SHOP_DOOR), door(HALL_DOOR)] };
  mainFaces('homeWallCream', 0, 0, HALF_Y);
  roomFaces(H, 'homeWallCream', HALL, f, 0, hallHoles);
  roomFaces(H, 'homeWallCream', GUEST, f, 0, { s: [door(GUEST_DOOR)] });
  roomFaces(H, 'homeBook', PLAY, f, 0, { n: [door(PLAY_DOOR)] });
  roomFaces(H, 'homePlayBlue', SHOP, f, 0, shopHoles);
  const base = (r, holes) => roomFaces(H, 'homeWhite', r, f, f + 0.1, holes, 0.014);
  mainFaces('homeWhite', f + 0.1, 0.014, SB_FOOT);
  base(HALL, hallHoles);
  base(GUEST, { s: [door(GUEST_DOOR)] });
  base(PLAY, { n: [door(PLAY_DOOR)] });
  base(SHOP, shopHoles);
  base(FOOT_HALL, { w: false, n: { a0: STAIR_X1 + TI }, e: [door(SHOP_DOOR)] });
  base({ x0: STAIR_X1 + TI, y0: SB_FOOT, x1: HALL.x1, y1: FOOT_HALL.y1 }, { s: false, n: false, e: false });

  basementStair(H);
  basementMain(H);
  basementRooms(H);
}

/*
 * THE STAIR DOWN: grey carpet, solid to the floor under every tread, a
 * dark line at each nosing so the steps read in a flat light, a white rail
 * on the east wall, and on the west the white half wall with its rail and
 * newel along the foot, the opening over it into the main room. Where the
 * stair meets the ground floor, the slab's cut edges are painted, the top
 * riser carpet.
 */
function basementStair(H) {
  const f = BF;
  for (let k = 0; k < SB_RISERS - 1; k += 1) {
    const y1 = SB.top - k * SB.tread;
    const y0 = y1 - SB.tread;
    const top = FLOOR0 - (k + 1) * SB_RISE;
    H.box('homeStone', SB.x0, y0, f, SB.x1, y1, top, { name: 'basement stair' });
    H.paint('homeCounter', SB.x0, y0 - 0.006, top - 0.025, SB.x1, y0, top);
    /* The nosing's edge on the tread, so the flight reads as steps from
     * the top of it, where no riser shows. */
    H.paint('homeCounter', SB.x0, y0, top, SB.x1, y0 + 0.03, top + 0.004);
  }
  H.paint('homeStone', SB.x0, SB.top - 0.006, -0.05, SB.x1, SB.top, FLOOR0);
  /* Its head's end, seen from the main room past it, white. */
  H.paint('homeWhite', SB.x0, SB.top, f, SB.x1, SB.top + 0.006, FLOOR0 - SB_RISE);
  H.paint('homeWhite', HOLE.x1 - 0.008, HOLE.y0, -0.01, HOLE.x1, HOLE.y1, FLOOR0);
  H.paint('homeWhite', HOLE.x0, HOLE.y0, -0.01, HOLE.x0 + 0.008, HOLE.y1, FLOOR0);
  H.paint('homeWhite', HOLE.x0, HOLE.y0, -0.01, HOLE.x1, HOLE.y0 + 0.008, FLOOR0);
  const rail = (py) => nosing(py) + 0.9;
  H.cap('homeWhite', [SB.x1 - 0.07, SB_FOOT + 0.15, rail(SB_FOOT + 0.15)], [SB.x1 - 0.07, SB.top - 0.05, rail(SB.top - 0.05)], 0.025, { seg: 6, name: 'rail' });
  /* The half wall: drawn as its slope, solid as steps a tenth of a metre
   * long under it, the rail over the steps. */
  const x0 = LOUNGE_X1;
  const x1 = STAIR_X0;
  const a = SB_FOOT;
  const b = HALF_Y;
  H.prism('homeWhite', 'x', [[a, f], [b, f], [b, rail(b) - 0.03], [a, rail(a) - 0.03]], x0, x1);
  const n = Math.ceil((b - a) / 0.1);
  for (let i = 0; i < n; i += 1) {
    const p = a + ((b - a) * i) / n;
    const q = a + ((b - a) * (i + 1)) / n;
    H.hidden(x0, p, f, x1, q, rail(p) - 0.04, 'wall', 'half wall');
  }
  H.cap('homeWhite', [x1 - TI / 2, a + 0.08, rail(a + 0.08)], [x1 - TI / 2, b, rail(b)], 0.04, { seg: 8, name: 'rail' });
  H.box('homeWhite', x0 - 0.03, a - 0.08, f, x1 + 0.03, a + 0.08, rail(a) + 0.18, { name: 'newel' });
  H.box('homeWhite', x0 - 0.05, a - 0.1, rail(a) + 0.18, x1 + 0.05, a + 0.1, rail(a) + 0.24, { name: 'newel cap' });
}

/* A recessed light, flush under the ceiling's paint. */
function can(H, x, y) {
  H.post('homeLamp', x, y, -0.014, -0.008, 0.07, { seg: 10, solid: false });
}

/* A picture on a wall face: `dir` 'x' on an east west wall at py `at`, 'y'
 * on a north south one at px `at`, `side` the way the face looks (+1 north
 * or east), a frame and the picture in `m` inside it, `p` proud of the
 * face (0.012 over a painted wall, so it sits on the paint). */
function picture(H, dir, at, side, a0, a1, h0, h1, m, p = 0) {
  const add = (mm, b0, b1, c0, c1, q0, q1) => {
    const lo = at + side * (side > 0 ? q0 : q1);
    const hi = at + side * (side > 0 ? q1 : q0);
    if (dir === 'x') {
      H.paint(mm, b0, lo, c0, b1, hi, c1);
    } else {
      H.paint(mm, lo, b0, c0, hi, b1, c1);
    }
  };
  add('homeShutter', a0, a1, h0, h1, p, p + 0.006);
  add(m, a0 + 0.04, a1 - 0.04, h0 + 0.04, h1 - 0.04, p + 0.006, p + 0.01);
}

/*
 * THE MAIN ROOM. From the back: the mustard settee under three frames with
 * a dark side table, the cream glass fronted cabinet under a small high
 * window, the black fridge in the corner, the kitchenette along the east
 * wall under its soffit (dark wood under a black top, the sink, the coffee
 * maker, two pairs of black pipe bracket shelves with frames on them), the
 * dark round table on its pedestal with four spindle backed chairs and the
 * LED cube gate on it, the dark dresser and the white fireplace on its
 * raised hearth along the west wall under a small high window, the
 * treadmill facing the TV (bsmt-hdRR_6chm2M-mr2 is shot from its
 * console). At the front the lounge, between the west wall and the stair,
 * as the owner's six stills of one flight down the stair show it
 * (2026-10-18, look only): the TV on the front wall over a white console,
 * the white built in in the corner, a brown sofa facing the TV, a brown
 * loveseat against the west wall under a wide stadium print and three
 * small frames, a pine coffee table on a pale rug between them, and two
 * black leather chairs with their backs to the stair, so that coming down
 * it the room lies open past them; the white column under the beam at the
 * lounge's north east corner, and the wall bare between the TV and the
 * stair's foot (bsmt--M3qDT4i7xk-mr2, bsmt-K9uGMfYKJLg-mr2's third view).
 * The sofas have been green, brown, tan and dark over the years; these are
 * the brown ones of the owner's stills, and the fridge is their light one.
 */
function basementMain(H) {
  const f = BF;
  const m = MAIN;
  H.box('homeWhite', SOFF.x0, SOFF.y0, SOFF.h, m.x1, m.y1, 0, { name: 'soffit' });
  H.box('homeWhite', m.x0, BEAM.y0, BEAM.h, LOUNGE_X1, BEAM.y1, 0, { name: 'beam' });
  for (const x of [1.4, 3.3]) {
    for (const y of [1.5, 3.1]) {
      can(H, x, y);
    }
  }
  for (const x of [1.4, 3.6, 5.8]) {
    for (const y of [5.7, 7.2]) {
      can(H, x, y);
    }
  }
  can(H, 5.2, 0.7);

  /* The settee, its side table and the frames over them. */
  H.box('homeBook', 2.6, 7.5, f, 4.2, m.y1, f + 0.45, { name: 'settee' });
  H.box('homeBook', 2.6, 7.98, f + 0.45, 4.2, m.y1, f + 0.88, { name: 'settee back' });
  for (const x of [2.6, 4.05]) {
    H.box('homeBook', x, 7.5, f + 0.45, x + 0.15, 7.98, f + 0.62, { name: 'settee arm' });
  }
  for (const x of [2.95, 3.35]) {
    H.paint('homeCounter', x, 7.95, f + 0.47, x + 0.36, 7.98, f + 0.8);
  }
  H.box('homeShelf', 2.07, 7.75, f, 2.52, m.y1, f + 0.62, { name: 'side table' });
  picture(H, 'x', m.y1, -1, 2.75, 3.3, f + 1.25, f + 1.7, 'homeWood', 0.012);
  picture(H, 'x', m.y1, -1, 3.5, 4.05, f + 1.25, f + 1.7, 'homeWallIn', 0.012);
  picture(H, 'x', m.y1, -1, 2.1, 2.45, f + 0.95, f + 1.3, 'homeTeal', 0.012);
  /* The cream cabinet, glass doors over solid ones, the window over it. */
  H.box('homeCabinet', 4.7, 7.75, f, 5.6, m.y1, f + 1.75, { name: 'cabinet' });
  for (const [a, b] of [[4.76, 5.13], [5.17, 5.54]]) {
    H.paint('homeWindow', a, 7.744, f + 0.95, b, 7.75, f + 1.68);
    H.paint('homeShelf', a + 0.02, 7.744, f + 0.85, b - 0.02, 7.75, f + 0.86);
  }
  H.paint('homeWindow', 4.8, m.y1 - 0.018, f + 1.95, 5.5, m.y1 - 0.012, f + 2.2);
  H.frame('x', DEP - TX / 2, TX, -1, [4.8, 5.5, f + 1.95, f + 2.2], 'homeWhite', { w: 0.06, d: 0.02 });
  /* The fridge, a cupboard over it to the soffit. */
  H.box('homeSteel', SOFF.x0, 7.5, f, m.x1, m.y1, f + 1.8, { name: 'fridge' });
  H.paint('homeShutter', SOFF.x0 - 0.005, 7.62, f + 0.95, SOFF.x0, 7.66, f + 1.55);
  H.box('homeCounter', SOFF.x0, 7.5, f + 1.8, m.x1, m.y1, SOFF.h, { name: 'cupboard' });
  /* The kitchenette. */
  const k0 = 5.35;
  const k1 = 7.45;
  const kx = m.x1 - 0.62;
  H.box('homeCounter', kx, k0, f, m.x1, k1, f + 0.88, { name: 'cabinets' });
  H.box('homeShutter', kx - 0.03, k0, f + 0.88, m.x1, k1, f + 0.92, { name: 'counter' });
  H.paint('homeShelf', kx - 0.005, k0, f + 0.66, kx, k1, f + 0.68);
  for (let y = k0 + 0.52; y < k1 - 0.1; y += 0.52) {
    H.paint('homeShelf', kx - 0.005, y - 0.01, f + 0.08, kx, y + 0.01, f + 0.86);
  }
  for (let y = k0 + 0.2; y < k1; y += 0.52) {
    H.paint('homeSteel', kx - 0.008, y, f + 0.6, kx - 0.005, y + 0.12, f + 0.62);
  }
  H.paint('homeSteel', kx + 0.1, 6.1, f + 0.92, m.x1 - 0.08, 6.6, f + 0.925);
  H.post('homeSteel', m.x1 - 0.06, 6.35, f + 0.92, f + 1.2, 0.015, { seg: 5, solid: false });
  H.box('homeShutter', m.x1 - 0.32, 7.17, f + 0.92, m.x1 - 0.06, 7.42, f + 1.28, { name: 'coffee maker', kind: 'obstacle' });
  for (const [a, b] of [[5.55, 6.35], [6.55, 7.35]]) {
    for (const h of [f + 1.45, f + 1.9]) {
      H.box('homeShelf', m.x1 - 0.2, a, h, m.x1, b, h + 0.04, { name: 'shelf', kind: 'obstacle' });
      for (const y of [a + 0.08, b - 0.08]) {
        H.post('homeChair', m.x1 - 0.1, y, h - 0.12, h, 0.014, { seg: 5, solid: false });
        H.post('homeChair', m.x1 - 0.06, y, h - 0.12, h - 0.12, 0.014, { seg: 5, solid: false });
      }
      H.paint('homeShutter', m.x1 - 0.12, a + 0.15, h + 0.04, m.x1 - 0.1, a + 0.4, h + 0.28);
      H.paint('homeWallIn', m.x1 - 0.124, a + 0.18, h + 0.07, m.x1 - 0.12, a + 0.37, h + 0.25);
      H.paint('homeWood', m.x1 - 0.12, b - 0.3, h + 0.04, m.x1 - 0.1, b - 0.12, h + 0.2);
    }
  }

  /* The table, its chairs and the LED cube gate on it. */
  const tx = 3.6;
  const ty = 5.7;
  roundTable(H, 'homeShelf', tx, ty, 0.55, f + 0.76, 'homeShelf', f);
  const spindle = { backH: 0.55, seatM: 'homeCounter' };
  for (const b of ['w', 'e', 'n', 's']) {
    chair(H, 'homeShelf', ...tuckRound(H, tx, ty, 0.55, f + 0.72, b, 0.22, 0.04, f + 0.45), b, f, spindle);
  }
  ledCube(H, { x0: tx - 0.4, x1: tx + 0.4, y0: ty - 0.4, y1: ty + 0.4 }, f + 0.76, 0.8);

  /* The dresser and the fireplace on the west wall. */
  H.box('homeShelf', m.x0, 4.4, f, 0.7, 5.35, f + 1.05, { name: 'dresser' });
  for (let i = 0; i < 4; i += 1) {
    for (const [a, b] of [[4.45, 4.86], [4.89, 5.3]]) {
      const h = f + 0.08 + i * 0.24;
      H.paint('homeCounter', 0.7, a, h, 0.705, b, h + 0.2);
      H.paint('homeSteel', 0.705, (a + b) / 2 - 0.02, h + 0.09, 0.708, (a + b) / 2 + 0.02, h + 0.12);
    }
  }
  H.box('homeWhite', m.x0, 5.4, f, 0.75, 7.5, f + 0.4, { name: 'hearth' });
  H.box('homeWhite', m.x0, 5.85, f + 0.4, 0.45, 7.25, f + 1.3, { name: 'fireplace' });
  H.paint('homeShutter', 0.45, 6.05, f + 0.46, 0.454, 7.05, f + 1.2);
  H.paint('homeScreen', 0.454, 6.11, f + 0.52, 0.458, 6.99, f + 1.14);
  H.box('homeWhite', m.x0, 5.75, f + 1.3, 0.55, 7.35, f + 1.38, { name: 'mantel' });
  H.paint('homeWindow', m.x0 + 0.012, 4.5, f + 1.72, m.x0 + 0.018, 5.25, f + 1.98);
  H.frame('y', TX / 2, TX, 1, [4.5, 5.25, f + 1.72, f + 1.98], 'homeWhite', { w: 0.06, d: 0.02 });

  /* The treadmill, its console to the south, a gate between the uprights. */
  H.box('homeChair', 0.28, 2.18, f, 1.03, 3.98, f + 0.2, { name: 'treadmill' });
  H.paint('homeShutter', 0.4, 2.48, f + 0.2, 0.91, 3.93, f + 0.205);
  for (const x of [0.34, 0.97]) {
    H.post('homeChair', x, 2.31, f + 0.2, f + 1.25, 0.035, { seg: 6, kind: 'pole' });
    H.cap('homeChair', [x, 2.31, f + 1.0], [x, 2.83, f + 1.0], 0.02, { seg: 6, kind: 'pole' });
  }
  H.box('homeChair', 0.28, 2.18, f + 1.2, 1.03, 2.43, f + 1.42, { name: 'treadmill console' });
  H.paint('homeScreen', 0.43, 2.43, f + 1.25, 0.88, 2.435, f + 1.38);
  /* The stadium print, the stands a dark band over the field, and three
   * small frames under it over the loveseat. */
  picture(H, 'y', m.x0, 1, 0.65, 2.15, f + 1.4, f + 1.86, 'homeHedge', 0.012);
  for (const [h0, h1] of [[f + 1.44, f + 1.5], [f + 1.75, f + 1.82]]) {
    H.paint('homeShutter', m.x0 + 0.022, 0.69, h0, m.x0 + 0.026, 2.11, h1);
  }
  for (const y of [0.75, 1.21, 1.67]) {
    picture(H, 'y', m.x0, 1, y, y + 0.38, f + 1.0, f + 1.3, 'homeWallIn', 0.012);
  }

  /* The lounge, west of the stair. */
  H.box('homeScreen', 1.9, m.y0, f + 1.15, 3.1, m.y0 + 0.06, f + 1.85, { name: 'television', kind: 'obstacle' });
  H.box('homeWhite', 1.55, m.y0, f, 3.05, 0.62, f + 0.55, { name: 'console' });
  for (const x of [2.05, 2.55]) {
    H.paint('homeWallIn', x - 0.01, 0.62, f + 0.06, x + 0.01, 0.625, f + 0.5);
  }
  H.box('homeWhite', m.x0, m.y0, f, 1.5, 0.6, 0, { name: 'built in' });
  for (let k = 0; k < 4; k += 1) {
    for (const [a, b] of [[0.28, 0.82], [0.9, 1.44]]) {
      const h = f + 0.45 + k * 0.42;
      H.paint('homeWallIn', a, 0.6, h, b, 0.604, h + 0.36);
      H.paint(SPINES[(k + (a > 0.5 ? 1 : 0)) % SPINES.length], a + 0.05, 0.604, h + 0.02, a + 0.3, 0.608, h + 0.26);
    }
  }
  H.paint('homeWallCream', 1.3, 0.75, f + 0.004, 3.95, 2.24, f + 0.012);
  couch(H, 1.55, 2.28, 3.55, 3.18, 's', f, { n: 3 });
  couch(H, m.x0, 0.66, 1.05, 2.1, 'e', f, { n: 2 });
  for (const [y0, y1] of [[0.78, 1.46], [1.52, 2.2]]) {
    couch(H, 3.15, y0, 3.9, y1, 'w', f, { m: 'homeChair', cushion: 'homeShutter', n: 1, back: 0.82, arm: 0.6, a: 0.13 });
  }
  /* The pine coffee table, a heavy top over a base set in under it. */
  H.box('homeFloor', 1.61, 1.21, f, 2.59, 1.64, f + 0.38, { name: 'coffee table' });
  H.box('homeFloor', 1.55, 1.15, f + 0.38, 2.65, 1.7, f + 0.45, { name: 'coffee table' });
  /* The white column under the beam, past the sofa's east end. */
  H.box('homeWhite', 3.7, BEAM.y0, f, 3.95, BEAM.y1, BEAM.h, { name: 'column' });
}

/* A sofa or an armchair in the box x0 to x1, y0 to y1, facing `face`
 * ('n', 's', 'e', 'w'): the seat solid to the floor, the back along the
 * far side, an arm at each end, `o.n` seat cushions painted on it. */
function couch(H, x0, y0, x1, y1, face, f, o = {}) {
  const m = o.m ?? 'homeWood';
  const seat = f + 0.45;
  const top = f + (o.back ?? 0.88);
  const arm = f + (o.arm ?? 0.62);
  const b = 0.22;
  const a = o.a ?? 0.16;
  const n = o.n ?? 3;
  const cushion = o.cushion ?? 'homeCushion';
  H.box(m, x0, y0, f, x1, y1, seat, { name: 'sofa' });
  if (face === 'n' || face === 's') {
    const [c0, c1] = face === 's' ? [y0, y1 - b] : [y0 + b, y1];
    H.box(m, x0, face === 's' ? c1 : y0, seat, x1, face === 's' ? y1 : c0, top, { name: 'sofa back' });
    H.box(m, x0, c0, seat, x0 + a, c1, arm, { name: 'sofa arm' });
    H.box(m, x1 - a, c0, seat, x1, c1, arm, { name: 'sofa arm' });
    const w = (x1 - x0 - 2 * a) / n;
    for (let i = 0; i < n; i += 1) {
      H.paint(cushion, x0 + a + i * w + 0.03, c0 + 0.04, seat, x0 + a + (i + 1) * w - 0.03, c1 - 0.04, seat + 0.012);
    }
  } else {
    const [c0, c1] = face === 'w' ? [x0, x1 - b] : [x0 + b, x1];
    H.box(m, face === 'w' ? c1 : x0, y0, seat, face === 'w' ? x1 : c0, y1, top, { name: 'sofa back' });
    H.box(m, c0, y0, seat, c1, y0 + a, arm, { name: 'sofa arm' });
    H.box(m, c0, y1 - a, seat, c1, y1, arm, { name: 'sofa arm' });
    const w = (y1 - y0 - 2 * a) / n;
    for (let i = 0; i < n; i += 1) {
      H.paint(cushion, c0 + 0.04, y0 + a + i * w + 0.03, seat, c1 - 0.04, y0 + a + (i + 1) * w - 0.03, seat + 0.012);
    }
  }
}

/*
 * OFF THE HALLS. The guest room (bsmt-Jdr06Vgp-NM-mr3, the fourth view of
 * bsmt-K9uGMfYKJLg-mr2): a bed with red and white bedding, its head to the
 * back wall, a white upholstered bench at its foot, a wood dresser in the
 * far corner under the small high window, a white oil heater, a closet
 * door, a flush light.
 * The playroom, yellow (the room seen through a doorway in
 * bsmt-eITJB-rnSKc-mr1): a white cubby shelf of coloured bins, a little
 * table and two chairs, a red bean bag on a blue rug. Its contents are
 * inferred, the colour is not. The workshop across the east end, blue,
 * its joists bare, a door from each hall (the second view of
 * bsmt-K9uGMfYKJLg-mr2, bsmt-dv3zfxHDwjw-mr2): wire shelving the length of
 * the east wall full of quads, more on the west wall, the desk across the
 * north end with two monitors and a red chair, the workbench under a
 * pegboard at the south end with a quad on it, two shop lights.
 */
function basementRooms(H) {
  const f = BF;
  can(H, 7.9, (HALL.y0 + HALL.y1) / 2);
  can(H, 9.6, (HALL.y0 + HALL.y1) / 2);
  can(H, 9.3, (FOOT_HALL.y0 + FOOT_HALL.y1) / 2);

  const g = GUEST;
  bed(H, 9.1, 6.2, 1.4, 2.0, 'n', 'homeWhite', f);
  for (let i = 0; i < 3; i += 1) {
    H.paint('homeStone', 9.13, 6.45 + i * 0.36, f + 0.55, 10.47, 6.63 + i * 0.36, f + 0.562);
  }
  H.box('homeWhite', 9.5, 5.75, f, g.x1, 6.12, f + 0.45, { name: 'bench' });
  H.box('homeWood', g.x0, 7.65, f, 8.5, g.y1, f + 1.0, { name: 'dresser' });
  for (let i = 0; i < 3; i += 1) {
    H.paint('homeShelf', g.x0 + 0.05, 7.645, f + 0.31 + i * 0.3, 8.45, 7.65, f + 0.32 + i * 0.3);
  }
  H.box('homeWhite', g.x0, 6.4, f, 7.4, 7.1, f + 0.65, { name: 'heater' });
  H.paint('homeWindow', 7.45, g.y1 - 0.018, f + 1.8, 8.25, g.y1 - 0.012, f + 2.15);
  H.frame('x', DEP - TX / 2, TX, -1, [7.45, 8.25, f + 1.8, f + 2.15], 'homeWhite', { w: 0.06, d: 0.02 });
  H.frame('y', MAIN_E, TI, 1, [5.4, 6.15, f, f + DOOR_H], 'homeWhite', { w: 0.06, d: 0.02 });
  H.paint('homeWhite', g.x0 + 0.012, 5.4, f, g.x0 + 0.018, 6.15, f + DOOR_H);
  H.paint('homeSteel', g.x0 + 0.018, 6.03, f + 0.95, g.x0 + 0.022, 6.07, f + 1.0);
  H.drum('homeLamp', 8.85, 6.7, -0.09, -0.008, 0.18, { seg: 12 });

  const p = PLAY;
  const sx = 8.42;
  H.box('homeWhite', sx, p.y0, f, p.x1, p.y0 + 0.4, f + 0.9, { name: 'toy shelf' });
  const bins = ['homePlay', 'homePlayBlue', 'homeTeal', 'homeWicker'];
  for (let i = 0; i < 5; i += 1) {
    for (let k = 0; k < 2; k += 1) {
      const x = sx + 0.08 + i * 0.41;
      H.paint(bins[(i + k) % bins.length], x, p.y0 + 0.4, f + 0.06 + k * 0.42, x + 0.33, p.y0 + 0.406, f + 0.42 + k * 0.42);
    }
  }
  H.box('homeWhite', 9.8, 2.5, f, p.x1, 3.2, f + 0.47, { name: 'play table' });
  chair(H, 'homePlayBlue', 9.6, 2.85, 'w', f, { s: 0.16, seat: 0.3, backH: 0.3 });
  chair(H, 'homePlay', 10.3, 3.4, 'n', f, { s: 0.16, seat: 0.3, backH: 0.3 });
  H.cap('homePlay', [8.95, 2.6, f + 0.25], [8.95, 2.6, f + 0.25], 0.32, { look: 'capsule', seg: 10, name: 'bean bag' });
  H.paint('homeRug', 8.6, 2.1, f + 0.004, 10.3, 3.9, f + 0.012);
  can(H, 9.46, 2.8);
  can(H, 7.1, 2.8);

  const s = SHOP;
  H.box('homeSteel', 13.4, 1.0, f, s.x1, s.y1, f + 1.85, { name: 'shelving' });
  H.box('homeSteel', s.x0, 5.8, f, 11.0, 7.3, f + 1.85, { name: 'shelving' });
  const kit = ['homePlay', 'homePlayBlue', 'homeTeal', 'homeBook', 'homeShutter'];
  for (let k = 0; k < 5; k += 1) {
    const h = f + 0.05 + k * 0.37;
    H.paint('homeChair', 13.394, 1.0, h - 0.02, 13.4, s.y1, h);
    H.paint('homeChair', 11.0, 5.8, h - 0.02, 11.006, 7.3, h);
    for (let i = 0; i < 13; i += 1) {
      const y = 1.1 + i * 0.52;
      H.paint(kit[(i + 2 * k) % kit.length], 13.388, y, h + 0.02, 13.394, y + 0.34, h + 0.12 + ((i + k) % 3) * 0.06);
      H.paint('homeChair', 13.386, y + 0.02, h + 0.02, 13.388, y + 0.32, h + 0.05);
    }
    for (let i = 0; i < 3; i += 1) {
      const y = 5.9 + i * 0.48;
      H.paint(kit[(i + k) % kit.length], 11.006, y, h + 0.02, 11.012, y + 0.36, h + 0.2);
    }
  }
  H.box('homeChair', 10.9, 7.55, f + 0.71, 13.2, s.y1, f + 0.75, { name: 'desk' });
  for (const [x, y] of [[10.95, 7.6], [13.15, 7.6], [10.95, 8.15], [13.15, 8.15]]) {
    H.post('homeChair', x, y, f, f + 0.71, 0.02, { seg: 5, kind: 'pole' });
  }
  for (const [a, b] of [[11.3, 11.95], [12.1, 12.75]]) {
    H.box('homeScreen', a, 8.08, f + 0.88, b, 8.12, f + 1.26, { name: 'monitor', kind: 'obstacle' });
    H.post('homeChair', (a + b) / 2, 8.12, f + 0.75, f + 0.9, 0.015, { seg: 5, kind: 'pole' });
  }
  /* The desk chair tucked in, and the space over its seat solid on to the
   * wall behind the desk, since what is left between the seat and the wall
   * is a slot of its own. */
  const [dx, dy] = tuck(H, 's', 7.55 - TUCK, 11.9, 0.22, 0.04, f + 0.45, f + 0.71);
  chair(H, 'homeChair', dx, dy, 's', f, { seatM: 'homePlay', backH: 0.6 });
  H.hidden(dx - 0.22, dy + 0.22, f + 0.45, dx + 0.22, s.y1, f + 0.71, 'obstacle');
  H.box('homeWood', 11.5, s.y0, f, 13.2, 0.85, f + 0.9, { name: 'workbench' });
  H.paint('homeWicker', 11.6, s.y0 + 0.012, f + 1.1, 13.1, s.y0 + 0.018, f + 1.9);
  for (let i = 0; i < 9; i += 1) {
    const x = 11.7 + i * 0.16;
    H.paint('homeShutter', x, s.y0 + 0.018, f + 1.3 + (i % 3) * 0.12, x + 0.05, s.y0 + 0.022, f + 1.6 + (i % 2) * 0.1);
  }
  H.box('homeChair', 12.2, 0.35, f + 0.9, 12.45, 0.6, f + 0.96, { name: 'quad', kind: 'obstacle' });
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    H.paint('homePlay', 12.325 + dx * 0.16 - 0.06, 0.475 + dy * 0.16 - 0.06, f + 0.96, 12.325 + dx * 0.16 + 0.06, 0.475 + dy * 0.16 + 0.06, f + 0.965);
  }
  for (let y = s.y0 + 0.3; y < s.y1; y += 0.4) {
    H.paint('homeWood', s.x0, y, -0.014, s.x1, y + 0.06, -0.008);
  }
  for (const y of [2.5, 5.5]) {
    H.paint('homeLamp', 11.4, y, -0.022, 12.9, y + 0.12, -0.014);
  }
}

/* An LED cube gate: four posts and a top frame, h high, on a top at `top`
 * (the kitchen island's, the basement table's). */
function ledCube(H, c, top, h) {
  for (const [x, y] of [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]]) {
    H.post('homeNeon', x, y, top, top + h, 0.025, { seg: 6, kind: 'pole' });
  }
  for (const y of [c.y0, c.y1]) {
    H.box('homeNeon', c.x0, y - 0.025, top + h - 0.05, c.x1, y + 0.025, top + h, { name: 'led cube', kind: 'pole' });
  }
  for (const x of [c.x0, c.x1]) {
    H.box('homeNeon', x - 0.025, c.y0 + 0.025, top + h - 0.05, x + 0.025, c.y1 - 0.025, top + h, { name: 'led cube', kind: 'pole' });
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

/* The slide's solid: eight capsules of 3 cm down the chute's 0.6 m, which
 * leaves 17 mm between them, 6 cm of the world, under the craft's 7 cm
 * edge on; the chute is 4.2 cm thick across its slope, so they stand 9 mm
 * proud of it. */
const SLIDE_RUNS = 8;
const SLIDE_R = 0.03;

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
  const g = PERGOLA;
  for (const x of [2.4, 5.2, 8.0, 10.6]) {
    H.box('homeWood', x - 0.11, g.y1 - 0.11, 0, x + 0.11, g.y1 + 0.11, g.h, { name: 'pergola post' });
  }
  H.box('homeWood', g.x0 - 0.3, g.y1 - 0.09, g.h, g.x1 + 0.3, g.y1 + 0.09, g.h + 0.24, { name: 'pergola beam' });
  H.box('homeWood', g.x0 - 0.3, DEP, g.h, g.x1 + 0.3, DEP + 0.12, g.h + 0.2, { name: 'pergola ledger' });
  for (let x = g.x0; x <= g.x1 + 0.01; x += 0.6) {
    H.box('homeWood', x - 0.035, DEP + 0.12, g.h + 0.2, x + 0.035, g.y1 + 0.5, g.h + 0.36, { name: 'rafter' });
  }
  /* The dining set under it: a black metal table, chairs, the red umbrella. */
  const u = UMBRELLA;
  /* Three chairs tucked in, and the north one, Nick's (./nick.js PATIO),
   * left out where he sits in it. */
  roundTable(H, 'homeChair', PATIO_TABLE.x, PATIO_TABLE.y, PATIO_TABLE.r, PATIO_TABLE.h, 'homeChair', G_PAVE);
  const patio = { s: 0.24, backH: 0.45 };
  for (const b of ['w', 'e', 's']) {
    chair(H, 'homeChair', ...tuckRound(H, u.x, u.y, 0.6, 0.71, b, 0.24, 0.04, G_PAVE + 0.45), b, G_PAVE, patio);
  }
  chair(H, 'homeChair', u.x, u.y + 0.85, 'n', G_PAVE, patio);
  H.post('homeWhite', UMBRELLA.x, UMBRELLA.y, 0.75, 2.6, 0.025, { seg: 6, kind: 'pole' });
  H.cone('homePlay', UMBRELLA.x, UMBRELLA.y, UMBRELLA.h0, UMBRELLA.r, UMBRELLA.h);
  H.hidden(u.x - 0.8, u.y - 0.8, 2.15, u.x + 0.8, u.y + 0.8, 2.45, 'obstacle');
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
  /* Its chairs drawn in close, a hand from the stone, the one on the
   * diagonal no nearer than its seat's corner allows. */
  for (const [x, y, b] of [[fx - 1.06, fy, 'w'], [fx, fy + 1.06, 'n'], [fx, fy - 1.06, 's'], [fx - 0.88, fy + 0.88, 'w']]) {
    chair(H, 'homeChair', x, y, b, G_PAVE, { s: 0.26, backH: 0.5, seat: 0.4 });
  }

  /*
   * THE PAVILION at the garage end: an open gable on square columns with
   * ledgestone bases, a dark ceiling with a fan, an L shaped bar faced in
   * slate with a granite top, four black stools, the grill, the television
   * and a white door on its back wall. Its back wall is to the house and
   * its open side to the back fence: it stood the other way round until the
   * owner, who has stood in it, said on 2026-10-20 "I'm sure that pergola
   * bbq area is backwards. The open area faces the back fence." So the
   * wall is on its south side, the east wall's return runs north from it,
   * everything under it is turned with it (the grill against the wall
   * behind the bar, the stools in front of the bar, the fan), and the path
   * from the pool deck meets its open side.
   */
  const v = { x0: 15.0, x1: 21.0, y0: 10.0, y1: 15.0 };
  H.paint('homeDrive', v.x0 - 0.3, v.y0 - 0.3, 0.0, v.x1 + 0.3, v.y1 + 0.3, G_DRIVE);
  for (const [x, y] of [[v.x0, v.y1], [v.x1, v.y1], [v.x0, 12.5]]) {
    H.box('homeStone', x - 0.25, y - 0.25, 0, x + 0.25, y + 0.25, 0.9, { name: 'column base' });
    H.box('homeTrim', x - 0.14, y - 0.14, 0.9, x + 0.14, y + 0.14, 2.75, { name: 'column' });
  }
  H.box('homeSiding', v.x0 - 0.12, v.y0, 0, v.x1 + 0.12, v.y0 + 0.2, 2.75, { name: 'pavilion wall' });
  H.box('homeSiding', v.x1 - 0.2, v.y0, 0, v.x1 + 0.12, 12.6, 2.75, { name: 'pavilion wall' });
  H.paint('homeTrim', 15.6, v.y0 + 0.2, 0, 16.5, v.y0 + 0.215, 2.1);
  H.box('homeScreen', 18.4, v.y0 + 0.2, 1.4, 20.2, v.y0 + 0.25, 2.4, { name: 'pavilion screen', kind: 'obstacle' });
  const bw = v.x1 - 0.2;
  H.box('homeStone', 17.4, 11.15, 0, bw, 11.8, 1.05, { name: 'bar' });
  H.box('homeStone', bw - 0.65, 11.8, 0, bw, 14.0, 1.05, { name: 'bar' });
  H.box('homeCounter', 17.3, 11.05, 1.05, bw, 11.9, 1.1, { name: 'bar top' });
  H.box('homeCounter', bw - 0.75, 11.9, 1.05, bw, 14.1, 1.1, { name: 'bar top' });
  H.box('homeSteel', 18.0, 10.27, 0, 19.4, 11.07, 1.0, { name: 'grill' });
  for (let i = 0; i < 4; i += 1) {
    const x = 17.7 + i * 0.62;
    H.post('homeChair', x, 11.99, 0, 0.72, 0.03, { seg: 6, kind: 'pole' });
    H.drum('homeChair', x, 11.99, 0.72, 0.78, 0.18, { seg: 10 });
  }
  H.box('homeShelf', v.x0 - 0.12, v.y0, 2.75, v.x1 + 0.12, v.y1 + 0.12, 2.9, { name: 'pavilion ceiling' });
  H.post('homeChair', 17.5, 13.0, 2.45, 2.75, 0.03, { seg: 4, solid: false });
  H.paint('homeWood', 16.8, 12.93, 2.43, 18.2, 13.07, 2.46);
  H.paint('homeWood', 17.43, 12.3, 2.43, 17.57, 13.7, 2.46);
  gableRoof(H, 'y', v.x0 - 0.12, v.x1 + 0.12, v.y0, v.y1 + 0.12, 2.9, 2.9, { over: 0.3, base: 2.75 });

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
  /* The chute's solid is the chute, with the air under it open: a pilot
   * flies under a slide, and its solid once filled that wedge to the
   * ground (a player's report, 2026-10-23, "you can't fly through the
   * slide looking thingy next to the swing set"). SLIDE_RUNS capsules
   * down the slope side by side, each on the chute's middle line and a
   * little fatter than its 5 cm, so the solid stands within a centimetre
   * of the drawn faces and the slots between them are narrower than the
   * craft is thick even on its edge. */
  const cx0 = tx0 + 0.3 + SLIDE_R;
  const cx1 = tx1 - 0.3 - SLIDE_R;
  for (let k = 0; k < SLIDE_RUNS; k += 1) {
    const x = cx0 + ((cx1 - cx0) * k) / (SLIDE_RUNS - 1);
    H.cap('homePlay', [x, s0 - 0.15, 1.475], [x, s1, 0.075], SLIDE_R, { draw: false, kind: 'obstacle', name: 'slide' });
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

/* Where the big trees stand, plan metres, and how big: k times a 7 m real
 * tree, so k 2 is a 14 m tree. Each is the town's street tree at its
 * largest (size 3, STREET_TREE metres of the world's) scaled to that. Tall
 * and mature round the lot's edges and the street, as in every still and
 * aerial, the big one in the middle of the back lawn, and none over the
 * house, the pool or the drive. */
const STREET_TREE = 21;
const TREE_M = 7;
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
    H.asset(el, (S * TREE_M * k) / STREET_TREE, px, py, 0, 0, 'extra:trees');
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
/*
 * THE YARD TRACK on the back lawn (../yardtrack/), the owner's ask of
 * 2026-10-24: RaceGOW6 Track 3 past the pavilion's open side, between the
 * pool deck and the swing set, its start gate on the pavilion's side so a
 * run is flown out toward the back fence, at the house's own S. Clear of
 * the pavilion, the path, the swing set, the slide and the trees' crowns
 * over it (scripts/yardtrack-check.js). White pipe, the start gate red: two
 * colours the house already draws.
 */
export const YARD_AT = { px: 18.0, py: 20.0, q: 0 };
export function houseYardTrack() {
  return yardTrackOn(worldAt, YARD_AT, { id: 'house', scale: S, pipe: 'homeWhite', start: 'homePlay' });
}

export function houseLayout() {
  const H = new House();
  exterior(H);
  basement(H);
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
  parts.push(...houseYardTrack().parts);
  return { parts, prisms: H.prisms, discs: H.discs, cones: H.cones, scaled: H.scaled };
}

/* The plan's frame, and the openings ./yard.js names, so its gaps stand in
 * the holes and not beside them: each a span along a wall at `y` (an east
 * west wall) or `x` (a north south one) and its sill and head. */
export const FRAME = { OX, OZ, S };
export const OPENINGS = {
  frontDoor: { x0: FRONT_DOOR[0], x1: FRONT_DOOR[1], y: TX / 2, h0: FRONT_DOOR[2], h1: FRONT_DOOR[3] },
  slider: { x0: SLIDER[0], x1: SLIDER[1], y: DEP - TX / 2, h0: SLIDER[2], h1: SLIDER[3] },
  bay: { x0: BAY_LIGHTS[1][0], x1: BAY_LIGHTS[1][1], y: BAY.y1 - TX / 2, h0: BAY_LIGHTS[1][2], h1: BAY_LIGHTS[1][3] },
  kitchenWindow: { x0: KITCHEN_WIN[0], x1: KITCHEN_WIN[1], y: DEP - TX / 2, h0: KITCHEN_WIN[2], h1: KITCHEN_WIN[3] },
  kidsWindow: { y0: KIDS_WIN[0], y1: KIDS_WIN[1], x: LEN - TX / 2, h0: KIDS_WIN[2], h1: KIDS_WIN[3] },
  garage: { x0: BAYS[1][0], x1: BAYS[1][1], y: FRONT + TX / 2, h0: 0, h1: BAY_H },
  tallWindow: { x0: TALL.x0, x1: TALL.x1, y: FRONT + TX / 2, h0: TALL1[2], h1: TALL1[3] },
  /* Between the two swings' inner chains, over the seats and under the
   * top bar (backYard). */
  swings: { x0: 27.55, x1: 28.95, y: 19, h0: 0.7, h1: 2.4 },
  basementDoor: { x0: B_DOOR[0], x1: B_DOOR[1], y: 5.0, h0: FLOOR0, h1: FLOOR0 + DOOR_H },
};

/*
 * THE GROUND UNDER (x, z), world metres, where no top is: the basement's
 * floor inside its foundation walls, the lawn's 0 everywhere else. The
 * built map's `height` asks it (extra.floor in ../built/index.js), so the
 * plane the shell hands the plant every step is the basement's floor while
 * the craft is down there. Anywhere over the ground floor a top is always
 * in reach, the slab's or a tread's, so this is only ever the answer under
 * the slab.
 */
export function basementFloorAt(x, z) {
  const px = (x - OX) / S;
  const py = (OZ - z) / S;
  return px > 0 && px < LEN && py > 0 && py < DEP ? S * BF : 0;
}

/* The basement stair's hole through the slab as a world rectangle. The
 * field's plane lies at exactly zero over the whole field, so it would
 * roof the stair over from above; ./index.js cuts this out of it. */
export const STAIR_HOLE = { x0: OX + S * HOLE.x0, x1: OX + S * HOLE.x1, z0: OZ - S * HOLE.y1, z1: OZ - S * HOLE.y0 };

/* Where the pilot starts: the breakfast room, by the doorway to the back
 * hall, looking west past the table through the wide opening into the
 * family room. */
export const SPAWN = { px: 9.3, py: 5.7, h: FLOOR0 };
