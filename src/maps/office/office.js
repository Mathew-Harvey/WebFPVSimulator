/*
 * office.js: Hoshino Shoji, a small Japanese trading company's own
 * building, as the parts a built map holds. Pure data and arithmetic, no
 * Three.js and no JS trigonometry, so the solids can be built and checked in
 * plain Node (scripts/office-check.js).
 *
 * WHAT IT IS. The kind of building a pilot who has walked a Japanese side
 * street knows: three storeys and a flat roof on a six metre street, beige
 * tile, aluminium sashes, a roller shutter garage on the ground floor and a
 * steel fire escape bolted on the side, wedged a metre from its neighbours.
 * The ground floor is the company's goods-in: pallet racking in aisles a
 * forklift's width apart, roll cages, a conveyor and a packing bench, two
 * shutters to the street (one up, one stopped a metre off the floor) and a
 * small front office with a reception hatch. The first floor is the sales
 * floor: grey steel desks pushed together in islands with each section
 * chief's desk across the end of his, a free address table, a partitioned
 * meeting booth, the department head's desk under the kamidana, the
 * schedule board, the sales chart, the tea kitchen behind its noren. The
 * second floor is management: cubicles behind partitions, a glass walled
 * meeting room with a long table, the president's room with its sofas and
 * its daruma, a lounge and a break room with a vending machine. On the roof
 * a water tank on legs, the air conditioners' outdoor units and the company
 * name on a steel frame over the street.
 *
 * WHERE IT COMES FROM. Nothing that exists: a building of our own, laid out
 * from the way such buildings are made and furnished, at the sizes in the
 * table under SIZES below. The owner's brief named the Uncrashed Office map
 * only as the kind of place; no layout, gate or prop of it is used here.
 *
 * THE LIFT IS BEING RENEWED. Its car has been taken out, so the doors
 * stand open on every floor behind the works' barriers and the shaft is
 * an empty drop from the second floor to the pit: the line the brief asks
 * for, and a thing that happens to every lift in Japan every twenty five
 * years or so.
 *
 * THE SCALE IS THE HOUSES'. Everything is three and a half times life size
 * (S, as in ../house/house.js), so a whoop flies it the way a whoop flies the
 * real building. The plan is in REAL metres and turned into the world's by
 * S once, in the helpers under it.
 *
 * THE PLAN'S FRAME. px runs east, py north, h up from the street, real
 * metres, the origin the building's south west corner inside. The building
 * is 24 by 15 inside. The street is south, the fire escape and its alley
 * east, the neighbours west, north and across the street.
 *
 * WHAT IS SOLID. Walls, slabs, glass, desks, chairs, shelving, boxes, poles:
 * everything a craft can hit, each drawn and solid from the same numbers
 * (../../props/parts.js). Paint is not solid: carpet, the sun on the floor,
 * posters, the lines on a road. Glass is solid and not drawn, with the
 * streaks a comic draws on glass painted on it (./signs.js), so a pilot can
 * see that it is there. Where a thing is a lattice too fine to fly (the
 * racking's load, a roll cage's mesh, a blind's slats) the fine part is drawn
 * and not solid and one box round it is the solid, because a slot a craft
 * cannot fit is a slot the gap rule forbids.
 *
 * FINE. A drawn part that is not solid and that a pilot would not miss on
 * Low (a keyboard, a blind's slats, a binder's spine) is marked `fine`, and
 * Low does not draw it (./index.js). Nothing fine is solid, so the flight is
 * the same on every preset.
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

import { Parts, seededRandom } from '../../props/parts.js';
import { sincos } from '../../props/trig.js';

/* ------------------------------------------------------------------ */
/* The frame                                                           */
/* ------------------------------------------------------------------ */

/* World metres to a real metre, the houses'. */
export const S = 3.5;

/* The building inside, real metres. */
export const LEN = 24;
export const DEP = 15;
/* The outside walls' thickness, outside the plan. */
const TW = 0.25;

/* The field, real metres in the plan's frame: the street and the block
 * across it to the south, the neighbours west and north, the alley and its
 * neighbour east. */
const PX0 = -7;
const PX1 = 37;
const PY0 = -15;
const PY1 = 21;
export const FIELD_W = (PX1 - PX0) * S;
export const FIELD_D = (PY1 - PY0) * S;
export const X0 = -PX0 * S;
export const Y0 = -PY0 * S;

/*
 * THE STOREYS, real metres from the street. The ground slab stands a step
 * over it. A floor's ceiling is the underside of the slab over it, or of the
 * suspended ceiling, which is drawn as part of the slab: the void above it
 * is not a place. Ceilings are the sizes the brief gives an office (2.7 m)
 * and a goods-in floor a forklift can work under (4.15 m).
 */
export const F1 = 0.05;
const B2 = 4.2;
export const F2 = 4.5;
const C2 = 7.2;
export const F3 = 8.1;
const C3 = 10.8;
export const ROOF = 11.7;
const PARA = 12.8;
const PH = 14.3;
const PHT = 14.5;
export const FLOORS = [
  { n: 1, f: F1, c: B2, chunk: 'of1' },
  { n: 2, f: F2, c: C2, chunk: 'of2' },
  { n: 3, f: F3, c: C3, chunk: 'of3' },
];

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

/*
 * THE TOWN'S SUN, as the plan sees it. Golden hour's sun stands at
 * (-52, 62, 56) in the world (src/maps/built/looks.js, TIMES.golden): west,
 * south and up. Its light falls the other way, so for every metre it drops it
 * travels 52/62 east and 56/62 north. That is where a window's light lands on
 * the floor, which is how the sun patches are laid (sunPatch).
 */
const SUN_E = 52 / 62;
const SUN_N = 56 / 62;

/* Where the pilot starts: the sales floor's main aisle, facing west down
 * it between the desk islands. */
export const SPAWN = { px: 14.6, py: 5.35, h: F2 };

/*
 * SIZES. The three reference objects the brief asks the report to measure,
 * and where each figure comes from. The plan uses them as written.
 *
 *   desk     1.2 by 0.7 m, 0.72 high: JIS S 1031's office desk (the brief's
 *            0.72), the grey steel desk of a Japanese office island
 *   racking  bays 2.7 m wide on 2.7 m aisles: the brief's figures for
 *            pallet racking, a counterbalance forklift's turning aisle
 *   ceiling  2.7 m in the offices: the brief's 2.6 to 2.8, the common
 *            system ceiling height of a Japanese office floor
 */
export const SIZES = {
  desk: { w: 1.2, d: 0.7, h: 0.72 },
  bay: 2.7,
  aisle: 2.7,
  ceiling: C2 - F2,
};

/* ------------------------------------------------------------------ */
/* The core: the stair, the lift and the rooms along the north wall    */
/* ------------------------------------------------------------------ */

/*
 * The stair is a switchback in a walled core in the north west corner: the
 * floor's landing at the east end, a half landing at the west end, the
 * flight up from the floor along the south half and the flight on up along
 * the north half, and a well between the two flights 0.6 m wide from the
 * ground to the roof. The lift shaft is east of it, its doors facing south
 * into a niche off the floor.
 */
const ST = { x0: 0, x1: 6.0, y0: 12.0, y1: 15.0, land: 4.8, mid: 1.2, wy0: 13.2, wy1: 13.8 };
const SHAFT = { x0: 6.2, x1: 8.2, y0: 13.0, y1: 15.0 };
/* The wall along the north rooms' fronts, and the stair core's front. */
const CORE_Y = 11.925;
const CORE_T = 0.15;
const CORE_FACE = CORE_Y - CORE_T / 2;

/* Each opening in a wall, real metres: a span along the wall at `y` (an east
 * west wall) or `x` (a north south one), its sill `h0` and head `h1` above
 * the floor it is on. */
const door = (a0, a1, h1 = 2.1) => ({ a0, a1, h0: 0, h1 });
export const OPENINGS = {
  stairDoor: door(4.95, 5.85),
  liftDoor: door(6.75, 7.65),
  /* The ground floor's street front. */
  shutterUp: { a0: 11.0, a1: 14.0, h0: 0, h1: 3.4 },
  shutterHalf: { a0: 15.0, a1: 18.0, h0: 0, h1: 3.4, stop: 0.9 },
  entrance: { a0: 20.4, a1: 22.0, h0: 0, h1: 2.3 },
  /* The front office's reception hatch, in its west wall. */
  hatch: { a0: 1.6, a1: 2.8, h0: 0.95, h1: 1.95 },
  /* The fire doors to the fire escape, in the east wall. */
  fireDoor: door(10.3, 11.2),
  /* The sales floor's south window that stands open, the east half of
   * its bay. */
  openWindow: { a0: 13.15, a1: 14.1, h0: 0.8, h1: 2.4 },
};

/* The south windows of the two office floors: ten bays of two panes. */
const BAYS = Array.from({ length: 10 }, (_, k) => [0.6 + 2.3 * k, 2.6 + 2.3 * k]);

/* ------------------------------------------------------------------ */
/* The builder                                                         */
/* ------------------------------------------------------------------ */

/* The parts of a rectangle [a0, a1] x [c0, c1] that no hole covers, each
 * hole taken with a margin `m` round it. */
function clip(rect, holes, m = 0) {
  let out = [rect];
  for (const [b0, b1, c0, c1] of holes) {
    const h = [b0 - m, b1 + m, c0 - m, c1 + m];
    const next = [];
    for (const r of out) {
      if (r[1] <= h[0] || r[0] >= h[1] || r[3] <= h[2] || r[2] >= h[3]) {
        next.push(r);
        continue;
      }
      if (r[2] < h[2]) {
        next.push([r[0], r[1], r[2], h[2]]);
      }
      if (r[3] > h[3]) {
        next.push([r[0], r[1], h[3], r[3]]);
      }
      const c0 = Math.max(r[2], h[2]);
      const c1 = Math.min(r[3], h[3]);
      if (r[0] < h[0]) {
        next.push([r[0], h[0], c0, c1]);
      }
      if (r[1] > h[1]) {
        next.push([h[1], r[1], c0, c1]);
      }
    }
    out = next;
  }
  return out.filter((r) => r[1] - r[0] > 0.02 && r[3] - r[2] > 0.02);
}

class Office {
  constructor() {
    this.P = new Parts();
    /* The cull chunk every part made from here is filed under. */
    this.chunk = 'ofOut';
    /* The painted signs, posters and glass, for ./signs.js. */
    this.signs = [];
  }

  tag(part, extra) {
    if (part) {
      part.chunk = this.chunk;
      if (extra) {
        Object.assign(part, extra);
      }
    }
    return part;
  }

  /* A box between two plan corners, solid and drawn. */
  box(m, px0, py0, h0, px1, py1, h1, opts = {}) {
    return this.tag(this.P.box(m, wx(px0), wy(h0), wz(py0), wx(px1), wy(h1), wz(py1), opts));
  }

  /* Paint: drawn, not solid, casting nothing. */
  paint(m, px0, py0, h0, px1, py1, h1, name = 'paint') {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, cast: false, name });
  }

  /* Drawn and not solid, and not drawn on Low. */
  fine(m, px0, py0, h0, px1, py1, h1, name = 'fine') {
    const p = this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, cast: false, name });
    if (p) {
      p.fine = true;
    }
    return p;
  }

  /* A solid that is not drawn. */
  hidden(px0, py0, h0, px1, py1, h1, name = 'hidden', kind = 'wall') {
    return this.box('ofWallIn', px0, py0, h0, px1, py1, h1, { draw: false, name, kind });
  }

  /* A round thing between two plan points, radius in real metres. */
  cap(m, a, b, r, opts = {}) {
    const p = this.tag(this.P.cap(m, worldAt(a[0], a[1], a[2]), worldAt(b[0], b[1], b[2]), S * r, opts));
    if (p && opts.fine) {
      p.fine = true;
      p.solid = false;
    }
    return p;
  }

  /* A wall with its openings, written in plan terms. `dir` 'x' runs east
   * along py = at from a0 to a1; 'y' runs north along px = at. holes are
   * [b0, b1, c0, c1]: along, then up. */
  wall(m, dir, at, a0, a1, h0, h1, t, holes = [], name = 'wall') {
    const spec = dir === 'x'
      ? {
        axis: 'x', at: wz(at), t: S * t, from: wx(a0), to: wx(a1), y0: wy(h0), y1: wy(h1),
        holes: holes.map(([b0, b1, c0, c1]) => ({ from: wx(b0), to: wx(b1), y0: wy(c0), y1: wy(c1) })),
      }
      : {
        axis: 'z', at: wx(at), t: S * t, from: wz(a1), to: wz(a0), y0: wy(h0), y1: wy(h1),
        holes: holes.map(([b0, b1, c0, c1]) => ({ from: wz(b1), to: wz(b0), y0: wy(c0), y1: wy(c1) })),
      };
    for (const p of this.P.wall(m, spec, { kind: 'wall', name })) {
      this.tag(p);
    }
  }

  /* Paint a rectangle on a wall's face, a whisker proud of it. `dir` 'x'
   * is a face along py = at, 'y' one along px = at; `side` the way it looks
   * (+1 north or east, -1 south or west). [a0, a1] along, [c0, c1] up. */
  face(m, dir, at, side, a0, a1, c0, c1, fine = false, lift = 0) {
    const d0 = side > 0 ? at + lift : at - 0.012 - lift;
    const d1 = d0 + 0.012;
    const f = fine ? this.fine.bind(this) : this.paint.bind(this);
    return dir === 'x' ? f(m, a0, d0, c0, a1, d1, c1) : f(m, d0, a0, c0, d1, a1, c1);
  }

  /* A face painted all over but its holes. */
  faceBut(m, dir, at, side, a0, a1, c0, c1, holes = [], fine = false) {
    for (const r of clip([a0, a1, c0, c1], holes)) {
      this.face(m, dir, at, side, ...r, fine);
    }
  }

  /* A box standing proud of a wall's face: `dir` and `side` as face(),
   * `d` how far it stands out. */
  onWall(m, dir, at, side, a0, a1, c0, c1, d, opts = {}) {
    const p0 = at;
    const p1 = at + side * d;
    return dir === 'x'
      ? this.box(m, a0, Math.min(p0, p1), c0, a1, Math.max(p0, p1), c1, opts)
      : this.box(m, Math.min(p0, p1), a0, c0, Math.max(p0, p1), a1, c1, opts);
  }

  /*
   * A sign, poster or pane of glass, painted on one picture (./signs.js):
   * `key` names the picture, (px, py, h) its centre, `w` by `ht` its size in
   * real metres, `face` the way it looks: 'n', 's', 'e', 'w' or 'up'.
   * `glow` draws it unlit, a screen or a lit sign.
   */
  sign(key, px, py, h, w, ht, face, o = {}) {
    this.signs.push({
      key, px, py, h, w, ht, face, lift: o.lift ?? 0.02, glow: Boolean(o.glow), chunk: this.chunk,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Furniture                                                           */
/* ------------------------------------------------------------------ */

/* Along and across a row, as a plan box: a row along px ('x') or py ('y'). */
function rowBox(axis, a0, a1, d0, d1) {
  return axis === 'x' ? [a0, d0, a1, d1] : [d0, a0, d1, a1];
}

/*
 * A Japanese steel desk, 1.2 by 0.7 by 0.72: the pale top, a drawer
 * pedestal at one end, a modesty panel down the back and a leg panel at the
 * other end, the knee space open on the sitter's side. `open` is the side
 * the sitter sits ('n', 's', 'e', 'w'). Everything to the floor, so no slot
 * opens under a panel. On the top, what a desk has on it.
 */
function desk(O, x0, y0, x1, y1, open, r, o = {}) {
  const f = o.f;
  const H = 0.72;
  const ns = open === 'n' || open === 's';
  O.box(o.top ?? 'ofDeskTop', x0, y0, f + H - 0.03, x1, y1, f + H, { name: 'desk' });
  const t = 0.03;
  const ped = 0.42;
  if (ns) {
    const back = open === 's' ? [y1 - t, y1] : [y0, y0 + t];
    O.box('ofDesk', x0, back[0], f, x1, back[1], f + H - 0.03, { name: 'desk' });
    const pr = o.mirror ? [x0, x0 + ped] : [x1 - ped, x1];
    const lg = o.mirror ? [x1 - t, x1] : [x0, x0 + t];
    O.box('ofDesk', pr[0], y0, f, pr[1], y1, f + H - 0.03, { name: 'desk' });
    O.box('ofDesk', lg[0], y0, f, lg[1], y1, f + H - 0.03, { name: 'desk' });
    const fy = open === 's' ? y0 - 0.008 : y1;
    for (const [c0, c1] of [[0.48, 0.66], [0.28, 0.45], [0.06, 0.25]]) {
      O.fine('ofDeskPanel', pr[0] + 0.03, fy, f + c0, pr[1] - 0.03, fy + 0.008, f + c1, 'drawer');
      O.fine('ofSteel', (pr[0] + pr[1]) / 2 - 0.06, fy - 0.004, f + c1 - 0.05, (pr[0] + pr[1]) / 2 + 0.06, fy + 0.012, f + c1 - 0.03, 'handle');
    }
  } else {
    const back = open === 'w' ? [x1 - t, x1] : [x0, x0 + t];
    O.box('ofDesk', back[0], y0, f, back[1], y1, f + H - 0.03, { name: 'desk' });
    const pr = o.mirror ? [y1 - ped, y1] : [y0, y0 + ped];
    const lg = o.mirror ? [y0, y0 + t] : [y1 - t, y1];
    O.box('ofDesk', x0, pr[0], f, x1, pr[1], f + H - 0.03, { name: 'desk' });
    O.box('ofDesk', x0, lg[0], f, x1, lg[1], f + H - 0.03, { name: 'desk' });
    const fx = open === 'w' ? x0 - 0.008 : x1;
    for (const [c0, c1] of [[0.48, 0.66], [0.28, 0.45], [0.06, 0.25]]) {
      O.fine('ofDeskPanel', fx, pr[0] + 0.03, f + c0, fx + 0.008, pr[1] - 0.03, f + c1, 'drawer');
    }
  }
  if (o.bare) {
    return;
  }
  deskTop(O, x0, y0, x1, y1, open, r, f + H);
}

/* What is on a desk: a monitor at the back, its screen lit, a keyboard, a
 * phone, a tray of papers, files, a mug. The monitor is solid; the rest is
 * paint, too small to hit and too fine for Low. */
function deskTop(O, x0, y0, x1, y1, open, r, top) {
  const ns = open === 'n' || open === 's';
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  /* Along the desk, across it toward the back, as plan points. */
  const at = (u, v) => (ns ? [cx + u, open === 's' ? cy + v : cy - v] : [open === 'w' ? cx + v : cx - v, cy + u]);
  const box = (m, u0, u1, v0, v1, h0, h1, solid = false, name = 'desk thing') => {
    const [ax, ay] = at(u0, v0);
    const [bx, by] = at(u1, v1);
    const fn = solid ? (mm, ...a) => O.box(mm, ...a, { name }) : (mm, ...a) => O.fine(mm, ...a, name);
    return fn(m, Math.min(ax, bx), Math.min(ay, by), h0, Math.max(ax, bx), Math.max(ay, by), h1);
  };
  const shift = r.range(-0.12, 0.12);
  /* The monitor on its foot, its screen facing the sitter. */
  box('ofMonitor', shift - 0.26, shift + 0.26, 0.3, 0.33, top + 0.1, top + 0.42, true, 'monitor');
  box('ofMonitor', shift - 0.03, shift + 0.03, 0.31, 0.35, top, top + 0.12);
  box('ofMonitor', shift - 0.1, shift + 0.1, 0.25, 0.35, top, top + 0.015);
  box(r.chance(0.8) ? 'ofScreen' : 'ofScreenWarm', shift - 0.235, shift + 0.235, 0.295, 0.3, top + 0.125, top + 0.395);
  box(r.chance(0.5) ? 'ofWhite' : 'ofBlack', shift - 0.2, shift + 0.2, -0.12, 0.02, top, top + 0.02);
  box('ofBlack', shift + 0.27, shift + 0.33, -0.08, -0.0, top, top + 0.015);
  /* The phone, the tray of papers and the files, either side. */
  const side = r.chance(0.5) ? 1 : -1;
  box('ofWhite', side * 0.42, side * 0.56, 0.1, 0.26, top, top + 0.07);
  box('ofBlack', -side * 0.56, -side * 0.34, 0.0, 0.28, top, top + 0.02);
  box('ofPaper', -side * 0.55, -side * 0.35, 0.02, 0.26, top + 0.02, top + 0.02 + r.range(0.02, 0.08));
  if (r.chance(0.6)) {
    const n = r.int(2, 5);
    for (let i = 0; i < n; i += 1) {
      const u = -side * (0.5 - i * 0.055);
      box(r.pick(['ofBinderBlue', 'ofBinderRed', 'ofBinderYellow', 'ofBinderGreen', 'ofPaper']), u - 0.025, u + 0.025, 0.08, 0.3, top, top + 0.3);
    }
  }
  if (r.chance(0.5)) {
    const [mx, my] = at(side * r.range(0.3, 0.45), -0.15);
    O.cap(r.pick(['ofWhite', 'ofRed', 'ofTeal']), [mx, my, top], [mx, my, top + 0.09], 0.04, { fine: true, seg: 6, name: 'mug' });
  }
  if (r.chance(0.3)) {
    box('ofPaper', -0.3, 0.1, -0.3, -0.1, top, top + 0.006);
  }
}

/*
 * An office chair: a star base and its column, the seat, the back, the
 * arms. `dir` is the way the sitter faces. The seat is 0.42 up, which keeps
 * the space under it on the right side of the gap rule; the base is paint.
 */
function chair(O, px, py, dir, o = {}) {
  const f = o.f;
  const seatM = o.seat ?? 'ofChairSeat';
  const s = 0.24;
  O.fine('ofChair', px - 0.3, py - 0.03, f + 0.03, px + 0.3, py + 0.03, f + 0.08, 'chair base');
  O.fine('ofChair', px - 0.03, py - 0.3, f + 0.03, px + 0.03, py + 0.3, f + 0.08, 'chair base');
  O.cap('ofChrome', [px, py, f + 0.08], [px, py, f + 0.42], 0.03, { name: 'chair', seg: 6 });
  O.box(seatM, px - s, py - s, f + 0.42, px + s, py + s, f + 0.5, { name: 'chair' });
  const back = { n: [0, -1], s: [0, 1], e: [-1, 0], w: [1, 0] }[dir];
  const bx = px + back[0] * (s - 0.03);
  const by = py + back[1] * (s - 0.03);
  const hi = f + (o.tall ? 1.25 : 1.0);
  if (back[0] === 0) {
    O.box(seatM, px - 0.23, by - 0.03, f + 0.56, px + 0.23, by + 0.03, hi, { name: 'chair' });
    O.fine('ofChair', px - 0.04, Math.min(by, py), f + 0.5, px + 0.04, Math.max(by, py) + 0.02, f + 0.58, 'chair spine');
    for (const sx of [-1, 1]) {
      O.fine('ofChair', px + sx * 0.25, py - 0.18, f + 0.64, px + sx * 0.25 + sx * 0.04, py + 0.18, f + 0.68, 'chair arm');
    }
  } else {
    O.box(seatM, bx - 0.03, py - 0.23, f + 0.56, bx + 0.03, py + 0.23, hi, { name: 'chair' });
    O.fine('ofChair', Math.min(bx, px), py - 0.04, f + 0.5, Math.max(bx, px) + 0.02, py + 0.04, f + 0.58, 'chair spine');
    for (const sy of [-1, 1]) {
      O.fine('ofChair', px - 0.18, py + sy * 0.25, f + 0.64, px + 0.18, py + sy * 0.25 + sy * 0.04, f + 0.68, 'chair arm');
    }
  }
}

/*
 * A desk island: n desks a side along px from x0, backs together on the
 * line py = yc with the desktop screen along it, and the section chief's
 * desk across the east end, facing west down the island. A chair at most
 * desks, pushed back, turned, or gone.
 */
function island(O, x0, yc, n, f, r, o = {}) {
  const W = 1.2;
  const D = 0.7;
  const x1 = x0 + n * W;
  for (let i = 0; i < n; i += 1) {
    const a = x0 + i * W;
    desk(O, a, yc - D, a + W, yc, 's', r, { f, mirror: i % 2 === 1 });
    desk(O, a, yc, a + W, yc + D, 'n', r, { f, mirror: i % 2 === 0 });
    for (const [side, dir] of [[-1, 'n'], [1, 's']]) {
      if (r.chance(0.12)) {
        continue;
      }
      const pull = r.range(0.32, 0.6);
      const cy = yc + side * (D + pull);
      const cx = a + W / 2 + r.range(-0.2, 0.2);
      chair(O, cx, cy, dir, { f });
    }
  }
  /* The desktop screen down the middle. */
  O.box('ofDeskPanel', x0, yc - 0.015, f + 0.72, x1, yc + 0.015, f + 1.12, { name: 'desk screen' });
  O.fine('ofPartitionFrame', x0, yc - 0.02, f + 1.1, x1, yc + 0.02, f + 1.13, 'screen rail');
  if (o.head === false) {
    return x1;
  }
  /* The chief's desk, touching the island's end. */
  desk(O, x1, yc - 0.7, x1 + 0.75, yc + 0.7, 'e', r, { f });
  chair(O, x1 + 1.15, yc + r.range(-0.15, 0.15), 'w', { f, tall: true });
  return x1 + 0.75;
}

/*
 * A row of steel cabinets against a wall: the lower doors and the glass
 * upper doors with the binders behind them, `axis` 'x' along px or 'y'
 * along py, `d0` to `d1` across. One solid for the row.
 */
function cabinets(O, axis, a0, a1, d0, d1, h, f, r, face) {
  const [bx0, by0, bx1, by1] = rowBox(axis, a0, a1, d0, d1);
  O.box('ofCabinet', bx0, by0, f, bx1, by1, f + h, { name: 'cabinet' });
  const unit = 0.88;
  const n = Math.max(1, Math.round((a1 - a0) / unit));
  const u = (a1 - a0) / n;
  const out = face > 0 ? Math.max(d0, d1) : Math.min(d0, d1);
  const fp = (m, b0, b1, c0, c1, fine = false) => (axis === 'x'
    ? O.face(m, 'x', out, face, b0, b1, c0, c1, fine)
    : O.face(m, 'y', out, face, b0, b1, c0, c1, fine));
  for (let i = 0; i < n; i += 1) {
    const b0 = a0 + i * u;
    const b1 = b0 + u;
    fp('ofCabinetDark', b1 - 0.012, b1 + 0.012, f, f + h);
    if (h > 1.2) {
      /* The glass doors' frame, and through it the binders, two shelves. */
      fp('ofFrame', b0 + 0.04, b1 - 0.04, f + 1.0, f + h - 0.05);
      for (const [c0, c1] of [[1.08, 1.42], [1.5, h - 0.12]]) {
        let b = b0 + 0.08;
        while (b < b1 - 0.12) {
          const w = r.range(0.05, 0.08);
          fp(r.pick(['ofBinderBlue', 'ofBinderBlue', 'ofBinderRed', 'ofBinderYellow', 'ofBinderGreen', 'ofPaper', 'ofBlack']), b, b + w, f + c0, f + c1 - r.range(0, 0.06), true);
          b += w + 0.008;
        }
      }
    }
    /* The lower doors' handles and the seam between them. */
    fp('ofCabinetDark', (b0 + b1) / 2 - 0.006, (b0 + b1) / 2 + 0.006, f + 0.05, f + Math.min(0.95, h - 0.05), true);
    fp('ofSteel', (b0 + b1) / 2 - 0.06, (b0 + b1) / 2 - 0.03, f + 0.5, f + 0.62, true);
    fp('ofSteel', (b0 + b1) / 2 + 0.03, (b0 + b1) / 2 + 0.06, f + 0.5, f + 0.62, true);
  }
}

/* A potted plant: the pot, its stem and the leaves in clumps, one capsule
 * round the leaves the solid. `big` a pachira's height, else a desk fern. */
function plant(O, px, py, f, r, big = true) {
  const pr = big ? 0.2 : 0.11;
  const ph = big ? 0.38 : 0.2;
  O.cap('ofPot', [px, py, f], [px, py, f + ph], pr, { name: 'pot', seg: 8, kind: 'wall' });
  const top = f + (big ? r.range(1.3, 1.7) : 0.5);
  O.cap('ofWoodDark', [px, py, f + ph], [px, py, top - 0.2], big ? 0.025 : 0.012, { fine: true, seg: 5, name: 'stem' });
  const blobs = big ? 7 : 3;
  for (let i = 0; i < blobs; i += 1) {
    const sc = sincos((i / blobs) * Math.PI * 2 + r.range(0, 0.6), { s: 0, c: 0 });
    const rr = big ? r.range(0.12, 0.26) : 0.08;
    const h = top - r.range(0, big ? 0.55 : 0.15);
    const p = [px + sc.c * rr, py + sc.s * rr, h];
    O.cap(i % 3 === 0 ? 'ofLeafDark' : 'ofLeaf', [p[0] - 0.04, p[1], p[2]], [p[0] + 0.04, p[1], p[2] + 0.02], big ? 0.17 : 0.09,
      { solid: false, look: 'capsule', seg: 7, name: 'leaves' });
  }
  if (big) {
    O.cap('ofLeaf', [px, py, f + ph], [px, py, top], 0.3, { draw: false, name: 'plant', kind: 'pole' });
  }
}

/* A cardboard box with its tape across the top and down two faces, and
 * sometimes a label. */
function carton(O, x0, y0, h0, x1, y1, h1, r, o = {}) {
  O.box(o.m ?? (r.chance(0.7) ? 'ofCard' : 'ofCardDark'), x0, y0, h0, x1, y1, h1, { name: o.name ?? 'carton', solid: o.solid !== false, cast: o.solid !== false });
  const along = x1 - x0 > y1 - y0;
  const t = 0.03;
  if (along) {
    const c = (y0 + y1) / 2;
    O.fine('ofTape', x0 - 0.004, c - t, h1, x1 + 0.004, c + t, h1 + 0.004, 'tape');
    O.fine('ofTape', x0 - 0.008, c - t, h1 - 0.1, x0, c + t, h1, 'tape');
    O.fine('ofTape', x1, c - t, h1 - 0.1, x1 + 0.008, c + t, h1, 'tape');
  } else {
    const c = (x0 + x1) / 2;
    O.fine('ofTape', c - t, y0 - 0.004, h1, c + t, y1 + 0.004, h1 + 0.004, 'tape');
    O.fine('ofTape', c - t, y0 - 0.008, h1 - 0.1, c + t, y0, h1, 'tape');
    O.fine('ofTape', c - t, y1, h1 - 0.1, c + t, y1 + 0.008, h1, 'tape');
  }
  if (o.label) {
    const [face, key] = o.label;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const h = h0 + (h1 - h0) * 0.55;
    const w = Math.min(0.32, (face === 's' || face === 'n' ? x1 - x0 : y1 - y0) * 0.6);
    const at = { s: [cx, y0], n: [cx, y1], e: [x1, cy], w: [x0, cy] }[face];
    O.sign(key, at[0], at[1], h, w, w * 0.62, face, { lift: 0.006 });
  }
}

/* A pallet: deck boards on three runners, the gaps painted, and its solid
 * one box so no slot opens under the deck. */
function pallet(O, x0, y0, x1, y1, f) {
  O.box('ofPallet', x0, y0, f, x1, y1, f + 0.14, { name: 'pallet' });
  const along = x1 - x0 > y1 - y0;
  for (let k = 0.25; k < 1; k += 0.25) {
    if (along) {
      const x = x0 + (x1 - x0) * k;
      O.fine('ofCardDark', x - 0.04, y0 - 0.008, f + 0.02, x + 0.04, y0, f + 0.11, 'pallet gap');
      O.fine('ofCardDark', x - 0.04, y1, f + 0.02, x + 0.04, y1 + 0.008, f + 0.11, 'pallet gap');
    } else {
      const y = y0 + (y1 - y0) * k;
      O.fine('ofCardDark', x0 - 0.008, y - 0.04, f + 0.02, x0, y + 0.04, f + 0.11, 'pallet gap');
      O.fine('ofCardDark', x1, y - 0.04, f + 0.02, x1 + 0.008, y + 0.04, f + 0.11, 'pallet gap');
    }
  }
}

/* A load of cartons on a pallet, stacked to about `h`, in rows. */
function load(O, x0, y0, x1, y1, h0, h, r, o = {}) {
  const nx = Math.max(1, Math.round((x1 - x0) / r.range(0.4, 0.6)));
  const ny = Math.max(1, Math.round((y1 - y0) / r.range(0.4, 0.6)));
  const tiers = Math.max(1, Math.round(h / r.range(0.3, 0.42)));
  const th = h / tiers;
  for (let k = 0; k < tiers; k += 1) {
    const last = k === tiers - 1;
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < ny; j += 1) {
        if (last && r.chance(0.25)) {
          continue;
        }
        const a = x0 + (x1 - x0) * (i / nx);
        const b = y0 + (y1 - y0) * (j / ny);
        const edge = j === 0 ? 's' : (j === ny - 1 ? 'n' : null);
        carton(O, a + 0.01, b + 0.01, h0 + k * th, a + (x1 - x0) / nx - 0.01, b + (y1 - y0) / ny - 0.01, h0 + (k + 1) * th - 0.01, r, {
          solid: o.solid,
          label: edge && r.chance(o.labels ?? 0.3) ? [edge, r.pick(['fragile', 'thisway', 'boxLabel', 'boxLabel'])] : null,
        });
      }
    }
  }
}

/*
 * A switchback flight between two levels, in the plan, as steps a craft
 * meets as a staircase: each tread a box from its nosing down to the
 * underside, so the flight is closed under and no slot opens under it.
 * `along` +1 or -1 is the way the flight climbs along px (axis 'x') or py
 * (axis 'y'); [d0, d1] its width across.
 */
function flight(O, axis, a0, along, d0, d1, h0, rise, run, o = {}) {
  const n = Math.max(2, Math.round(rise / 0.18));
  const r = rise / n;
  const g = run / n;
  const m = o.m ?? 'ofStair';
  for (let i = 0; i < n; i += 1) {
    const top = h0 + (i + 1) * r;
    const u0 = a0 + along * i * g;
    const u1 = a0 + along * (i + 1) * g;
    /* The flight's underside, a slab's thickness under its nosings, run
     * down to the floor where it would be a slot over it (GAP_MIN in
     * src/props/parts.js), and meeting the slab it climbs to. */
    const under = top - 0.9;
    const lo = under - h0 < 0.45 ? h0 - 0.05 : under;
    const [x0, y0, x1, y1] = rowBox(axis, Math.min(u0, u1), Math.max(u0, u1), d0, d1);
    O.box(m, x0, y0, lo, x1, y1, top, { name: 'stair' });
    /* The nosing strip. */
    const nu = along > 0 ? [u0, u0 + 0.04] : [u0 - 0.04, u0];
    const [nx0, ny0, nx1, ny1] = rowBox(axis, Math.min(...nu), Math.max(...nu), d0, d1);
    O.fine(o.nose ?? 'ofStairNose', nx0, ny0, top, nx1, ny1, top + 0.006, 'nosing');
  }
}

/* A handrail on posts along a climbing flight: a rail from (a0, h0) to
 * (a0 + along * run, h0 + rise) at 0.9 over the nosings, on the line d. */
function handrail(O, axis, a0, along, d, h0, rise, run, m = 'ofRail', post = 'ofSteel') {
  const at = (u, h) => (axis === 'x' ? [u, d, h] : [d, u, h]);
  O.cap(m, at(a0, h0 + 0.9), at(a0 + along * run, h0 + rise + 0.9), 0.025, { name: 'handrail', seg: 6 });
  const n = Math.max(1, Math.round(run / 1.1));
  for (let i = 0; i <= n; i += 1) {
    const u = a0 + along * run * (i / n);
    const h = h0 + rise * (i / n);
    O.cap(post, at(u, h), at(u, h + 0.9), 0.016, { name: 'baluster', seg: 5 });
  }
}

/* ------------------------------------------------------------------ */
/* The shell: walls, windows, slabs                                    */
/* ------------------------------------------------------------------ */

/*
 * A window in a wall's hole: the sash's frame and the mullion between its
 * two panes, solid; the glass, solid and not drawn, with a comic's streaks
 * painted on it each side; and inside, the blind, let down to `blind` over
 * the sill, its slats drawn and not solid. `open` is the part of the hole
 * with no glass in it, a pane slid behind its neighbour. `dir` and `at` the
 * wall's, `inside` which way the room is (+1 north or east).
 */
function windowIn(O, dir, at, inside, a0, a1, c0, c1, o = {}) {
  const t = 0.05;
  const fr = (m, b0, b1, d0, d1, e0, e1, opts) => (dir === 'x'
    ? O.box(m, b0, d0, e0, b1, d1, e1, opts)
    : O.box(m, d0, b0, e0, d1, b1, e1, opts));
  const d0 = at - 0.06;
  const d1 = at + 0.06;
  fr('ofSash', a0, a1, d0, d1, c0, c0 + t, { name: 'sash' });
  fr('ofSash', a0, a1, d0, d1, c1 - t, c1, { name: 'sash' });
  fr('ofSash', a0, a0 + t, d0, d1, c0, c1, { name: 'sash' });
  fr('ofSash', a1 - t, a1, d0, d1, c0, c1, { name: 'sash' });
  const mid = (a0 + a1) / 2;
  fr('ofSash', mid - 0.025, mid + 0.025, d0, d1, c0, c1, { name: 'sash' });
  const panes = [[a0 + t, mid - 0.025], [mid + 0.025, a1 - t]];
  for (const [b0, b1] of panes) {
    const open = o.open && b0 >= o.open[0] - 0.05 && b1 <= o.open[1] + 0.05;
    if (open) {
      continue;
    }
    if (o.frost) {
      O.face('ofFrost', dir, at + 0.03, 1, b0, b1, c0 + t, c1 - t);
      O.face('ofFrost', dir, at - 0.03, -1, b0, b1, c0 + t, c1 - t);
      fr('ofFrost', b0, b1, at - 0.12, at + 0.12, c0 + t, c1 - t, { draw: false, name: 'glass' });
      continue;
    }
    fr('ofWallIn', b0, b1, at - 0.12, at + 0.12, c0 + t, c1 - t, { draw: false, name: 'glass' });
    const w = b1 - b0;
    const h = c1 - c0 - 2 * t;
    const c = (b0 + b1) / 2;
    const v = (c0 + c1) / 2;
    const faces = dir === 'x' ? ['n', 's'] : ['e', 'w'];
    for (const [k, side] of [[0, 1], [1, -1]]) {
      const p = at + side * 0.03;
      if (dir === 'x') {
        O.sign(o.glass ?? 'glass', c, p, v, w, h, faces[k], { lift: 0.004 });
      } else {
        O.sign(o.glass ?? 'glass', p, c, v, w, h, faces[k], { lift: 0.004 });
      }
    }
  }
  /* The blind, inside: its head box and the slats down to `blind`. */
  if (o.blind !== undefined && !o.frost) {
    const p0 = at + inside * 0.12;
    const p1 = at + inside * 0.16;
    const lo = Math.min(p0, p1);
    const hi = Math.max(p0, p1);
    const e0 = Math.max(c0, o.blind);
    fr('ofBlind', a0, a1, lo - 0.02, hi + 0.02, c1 - 0.08, c1 + 0.02, { name: 'blind head', solid: false, cast: false });
    for (let h = c1 - 0.1; h > e0; h -= 0.06) {
      const p = fr('ofBlind', a0 + 0.02, a1 - 0.02, lo, hi, h - 0.035, h, { solid: false, cast: false, name: 'slat' });
      if (p) {
        p.fine = true;
      }
    }
    fr('ofBlind', a0 + 0.02, a1 - 0.02, lo - 0.01, hi + 0.01, e0 - 0.03, e0, { solid: false, cast: false, name: 'blind rail' });
  }
}

/*
 * The sun through a south window, laid on the floor `f` as the town's sun
 * would lay it: the clear part under the blind as one patch in slices, the
 * part behind the blind as the stripes its slats let through. The window is
 * [a0, a1] along the south wall's inside face (py 0), its clear glass from
 * c0 to the blind's foot b, the blind to c1, all over the floor. Each slice
 * is a rectangle, so the patch leans east as it goes north in steps, the way
 * a comic shades it.
 */
function sunPatch(O, a0, a1, c0, b, c1, f, room, open = false) {
  const py0 = 0.02;
  const lay = (h0, h1) => {
    const hm = (h0 + h1) / 2;
    const y0 = py0 + SUN_N * h0;
    const y1 = py0 + SUN_N * h1;
    if (y0 >= room) {
      return;
    }
    O.paint('ofSun', a0 + SUN_E * hm, y0, f, a1 + SUN_E * hm, Math.min(y1, room), f + 0.012, 'sun');
  };
  for (let h = c0; h < b - 0.01; h += 0.18) {
    lay(h, Math.min(b, h + 0.18));
  }
  if (open) {
    return;
  }
  for (let h = b + 0.04; h < c1 - 0.06; h += 0.16) {
    lay(h, h + 0.07);
  }
}

/* The street front, the side walls and the back, ground to parapet, with
 * every storey's openings cut, and each storey's inside faces painted. */
function shell(O) {
  const o = OPENINGS;
  /* The walls: tile outside, each storey's paint inside. South first. */
  O.chunk = 'ofOut';
  const southHoles = [
    [o.shutterUp.a0, o.shutterUp.a1, F1 - 0.05, o.shutterUp.h1],
    [o.shutterHalf.a0, o.shutterHalf.a1, F1 - 0.05, o.shutterHalf.h1],
    [o.entrance.a0, o.entrance.a1, F1 - 0.05, o.entrance.h1],
    [19.6, 20.3, 0.3, 2.3], [22.1, 23.9, 0.3, 2.3],
  ];
  for (const fl of [F2, F3]) {
    for (const [a0, a1] of BAYS) {
      southHoles.push([a0, a1, fl + 0.8, fl + 2.4]);
    }
  }
  O.wall('ofTile', 'x', -TW / 2, -TW, LEN + TW, 0, PARA, TW, southHoles, 'south wall');
  const westHoles = [];
  O.wall('ofTile', 'y', -TW / 2, -TW, DEP + TW, 0, PARA, TW, westHoles, 'west wall');
  O.wall('ofTile', 'x', DEP + TW / 2, -TW, LEN + TW, 0, PARA, TW, [], 'north wall');
  const eastHoles = [];
  for (const fl of FLOORS) {
    eastHoles.push([o.fireDoor.a0, o.fireDoor.a1, fl.f - 0.05, fl.f + o.fireDoor.h1]);
    if (fl.n > 1) {
      for (const [a0, a1] of [[1.0, 3.0], [4.0, 6.0], [7.0, 9.0]]) {
        eastHoles.push([a0, a1, fl.f + 0.8, fl.f + 2.4]);
      }
    } else {
      eastHoles.push([2.5, 4.5, 1.0, 2.2]);
    }
  }
  O.wall('ofTile', 'y', LEN + TW / 2, -TW, DEP + TW, 0, PARA, TW, eastHoles, 'east wall');
  /* The tile's bands at each floor, the plinth, the parapet's coping. */
  for (const [h0, h1, m] of [[0, 0.5, 'ofTileDark'], [B2 - 0.05, F2 + 0.15, 'ofTileDark'], [C2 + 0.2, F3 + 0.15, 'ofTileDark']]) {
    O.faceBut(m, 'x', -TW, -1, -TW, LEN + TW, h0, h1, southHoles.map(([a, b, c, d]) => [a - 0.1, b + 0.1, c, d]));
    O.faceBut(m, 'y', LEN + TW, 1, -TW, DEP + TW, h0, h1, eastHoles.map(([a, b, c, d]) => [a - 0.1, b + 0.1, c, d]));
    O.face(m, 'y', -TW, -1, -TW, DEP + TW, h0, h1);
  }
  O.box('ofRoofEdge', -TW - 0.03, -TW - 0.03, PARA, LEN + TW + 0.03, 0.1, PARA + 0.08, { name: 'coping' });
  O.box('ofRoofEdge', -TW - 0.03, DEP - 0.1, PARA, LEN + TW + 0.03, DEP + TW + 0.03, PARA + 0.08, { name: 'coping' });
  O.box('ofRoofEdge', -TW - 0.03, 0.1, PARA, 0.1, DEP - 0.1, PARA + 0.08, { name: 'coping' });
  O.box('ofRoofEdge', LEN - 0.1, 0.1, PARA, LEN + TW + 0.03, DEP - 0.1, PARA + 0.08, { name: 'coping' });

  /* Each storey's inside: its floor, its ceiling, its walls' inside faces. */
  const coreHoles = [[ST.x0, ST.land, ST.y0, ST.y1], [SHAFT.x0, SHAFT.x1, SHAFT.y0, SHAFT.y1]];
  const slab = (m, h0, h1, holes, name) => {
    for (const [a0, a1, b0, b1] of clip([0, LEN, 0, DEP], holes)) {
      O.box(m, a0, b0, h0, a1, b1, h1, { name, cast: name !== 'floor' });
    }
  };
  O.chunk = 'of1';
  O.box('ofSlab', -TW, -TW, 0, LEN + TW, DEP + TW, F1, { name: 'floor', cast: false });
  for (const fl of FLOORS) {
    O.chunk = fl.chunk;
    const top = fl.n === 3 ? ROOF : (fl.n === 1 ? F2 : F3);
    /* The roof slab is the roof's: it is the one that shades the street,
     * and the roof's chunk is drawn from every floor (./index.js). */
    O.chunk = fl.n === 3 ? 'ofRoof' : fl.chunk;
    slab(fl.n === 1 ? 'ofBeam' : 'ofCeiling', fl.c, top, coreHoles, 'slab');
    O.chunk = fl.chunk;
    const f = fl.f;
    const sh = fl.n === 1 ? southHoles.filter((h) => h[3] < B2) : southHoles.filter((h) => h[2] >= f && h[3] <= fl.c);
    const eh = eastHoles.filter((h) => h[2] >= f - 0.06 && h[3] <= fl.c);
    const inM = fl.n === 1 ? 'ofWallInB' : 'ofWallIn';
    O.faceBut(inM, 'x', 0, 1, 0, LEN, f, fl.c, sh.map(([a, b, , d]) => [a, b, f - 0.1, d]));
    O.faceBut(inM, 'y', LEN, -1, 0, DEP, f, fl.c, eh.map(([a, b, , d]) => [a, b, f - 0.1, d]));
    O.face(inM, 'y', 0, 1, 0, DEP, f, fl.c);
    O.face(inM, 'x', DEP, -1, 0, LEN, f, fl.c);
    /* The skirting. */
    O.faceBut('ofSkirting', 'x', 0.012, 1, 0, LEN, f, f + 0.08, sh.map(([a, b]) => [a, b, f - 0.1, f + 1]));
    O.face('ofSkirting', 'y', 0.012, 1, 0, DEP, f, f + 0.08);
    O.faceBut('ofSkirting', 'y', LEN - 0.012, -1, 0, DEP, f, f + 0.08, eh.map(([a, b]) => [a, b, f - 0.1, f + 1]));
  }
  /* The windows of the office floors, south: blinds down to different
   * heights, the sun on the floor under them, one pane slid open. */
  const r = seededRandom(8101);
  for (const fl of [FLOORS[1], FLOORS[2]]) {
    O.chunk = fl.chunk;
    BAYS.forEach(([a0, a1], k) => {
      const f = fl.f;
      const open = fl.n === 2 && a0 < o.openWindow.a0 && a1 >= o.openWindow.a1 - 0.01 ? [o.openWindow.a0, o.openWindow.a1] : null;
      const blind = f + r.pick([1.25, 1.4, 1.55, 1.7, 2.0]);
      windowIn(O, 'x', -TW / 2, 1, a0, a1, f + 0.8, f + 2.4, { blind, open });
      sunPatch(O, a0 + 0.05, a1 - 0.05, 0.85, blind - f, 2.35, f, 12, false);
      /* The sill board inside. */
      O.box('ofWhite', a0 - 0.05, 0, f + 0.76, a1 + 0.05, 0.12, f + 0.8, { name: 'sill' });
      if (k === 0) {
        return;
      }
    });
  }
  /* East windows on the office floors, and the frosted windows west. */
  for (const fl of [FLOORS[1], FLOORS[2]]) {
    O.chunk = fl.chunk;
    for (const [a0, a1] of [[1.0, 3.0], [4.0, 6.0], [7.0, 9.0]]) {
      windowIn(O, 'y', LEN + TW / 2, -1, a0, a1, fl.f + 0.8, fl.f + 2.4, { blind: fl.f + 1.6 });
    }
    for (const [a0, a1] of [[2.0, 3.6], [6.0, 7.6], [10.0, 11.2]]) {
      O.face('ofFrost', 'y', 0.012, 1, a0, a1, fl.f + 0.9, fl.f + 2.3);
      O.face('ofSash', 'y', 0.024, 1, a0 - 0.05, a1 + 0.05, fl.f + 0.85, fl.f + 0.9);
      O.face('ofSash', 'y', 0.024, 1, a0 - 0.05, a1 + 0.05, fl.f + 2.3, fl.f + 2.35);
      O.face('ofSash', 'y', 0.024, 1, (a0 + a1) / 2 - 0.02, (a0 + a1) / 2 + 0.02, fl.f + 0.9, fl.f + 2.3);
      O.face('ofFrost', 'y', -TW - 0.012, -1, a0, a1, fl.f + 0.9, fl.f + 2.3);
    }
  }
  /* The ground floor's east window, onto the alley. */
  O.chunk = 'of1';
  windowIn(O, 'y', LEN + TW / 2, -1, 2.5, 4.5, 1.0, 2.2, {});
  /* Fire doors: the steel leaf stood open out onto the fire escape's
   * landing against the wall, its frame, the exit sign over it inside. */
  for (const fl of FLOORS) {
    O.chunk = fl.chunk;
    const f = fl.f;
    O.box('ofSteelOut', LEN + TW, o.fireDoor.a1, f + 0.02, LEN + TW + 0.9, o.fireDoor.a1 + 0.05, f + 2.05, { name: 'fire door' });
    O.face('ofSteelOutDark', 'y', LEN - 0.012, -1, o.fireDoor.a0 - 0.08, o.fireDoor.a1 + 0.08, f + 2.1, f + 2.18);
    O.sign('exit', LEN - 0.03, (o.fireDoor.a0 + o.fireDoor.a1) / 2, f + 2.35, 0.42, 0.16, 'w', { glow: true });
  }
}

/* ------------------------------------------------------------------ */
/* The core                                                            */
/* ------------------------------------------------------------------ */

function core(O) {
  const o = OPENINGS;
  const levels = [F1, F2, F3, ROOF];
  const holesAt = (op) => levels.map((f) => [op.a0, op.a1, f - 0.06, f + op.h1]);
  /* The stair's front, the stair and shaft's shared wall, the shaft's
   * front with its doors, the wall along the north rooms' fronts. Inside
   * paint below the roof; tile on the penthouse above it. */
  O.chunk = 'of1';
  O.wall('ofWallIn', 'x', CORE_Y, -TW, SHAFT.x0, 0, PH, CORE_T, holesAt(o.stairDoor), 'stair wall');
  O.wall('ofWallIn', 'y', 6.1, ST.y0 - CORE_T, ST.y1, 0, PH, 0.2, [], 'core wall');
  O.wall('ofShaft', 'x', SHAFT.y0 - 0.1, SHAFT.x0, SHAFT.x1 + 0.2, 0, PH, 0.2, holesAt(o.liftDoor).slice(0, 3), 'shaft wall');
  O.wall('ofShaft', 'y', SHAFT.x1 + 0.1, CORE_FACE, ST.y1, 0, PH, 0.2, [], 'shaft wall');
  /* The niche in front of the lift is closed on the roof. */
  O.wall('ofTile', 'x', CORE_Y, SHAFT.x0, SHAFT.x1 + 0.2, ROOF, PH, CORE_T, [], 'penthouse wall');
  /* The penthouse's other walls are the building's, run up, and its roof. */
  O.chunk = 'ofRoof';
  O.box('ofTile', -TW, CORE_FACE, PARA, 0, DEP + TW, PH, { name: 'penthouse wall' });
  O.box('ofTile', -TW, DEP, PARA, SHAFT.x1 + 0.2, DEP + TW, PH, { name: 'penthouse wall' });
  O.box('ofRoofEdge', -TW - 0.05, CORE_FACE - 0.05, PH, SHAFT.x1 + 0.25, DEP + TW + 0.05, PHT, { name: 'penthouse roof' });
  O.face('ofTile', 'x', CORE_FACE, -1, -TW, SHAFT.x1 + 0.2, ROOF, PH);
  O.face('ofTileDark', 'x', CORE_FACE - 0.012, -1, -TW, SHAFT.x1 + 0.2, ROOF, ROOF + 0.4);
  O.face('ofTile', 'y', SHAFT.x1 + 0.2, 1, CORE_FACE, DEP, ROOF, PH);

  /* The flights, floor by floor: up from the floor's landing west along
   * the south half to the half landing, and on up east along the north
   * half to the next floor's landing. */
  for (let k = 0; k < 3; k += 1) {
    O.chunk = FLOORS[k].chunk;
    const f = levels[k];
    const R = levels[k + 1] - f;
    const run = ST.land - ST.mid;
    flight(O, 'x', ST.land, -1, ST.y0, ST.wy0, f, R / 2, run);
    O.box('ofStair', ST.x0, ST.y0, f + R / 2 - 0.2, ST.mid, ST.y1, f + R / 2, { name: 'landing' });
    flight(O, 'x', ST.mid, 1, ST.wy1, ST.y1, f + R / 2, R / 2, run);
    handrail(O, 'x', ST.land, -1, ST.wy0 - 0.03, f, R / 2, run);
    handrail(O, 'x', ST.mid, 1, ST.wy1 + 0.03, f + R / 2, R / 2, run);
    /* The rail round the half landing's edge over the well. */
    O.cap('ofRail', [ST.mid + 0.03, ST.wy0, f + R / 2 + 0.9], [ST.mid + 0.03, ST.wy1, f + R / 2 + 0.9], 0.025, { name: 'handrail', seg: 6 });
    /* Floor numbers on the half landing's wall and at the floor's door. */
    O.sign(`floor${Math.min(k + 2, 4)}`, ST.x0 + 0.02, (ST.y0 + ST.y1) / 2, f + R / 2 + 1.5, 0.5, 0.5, 'e');
  }
  /* The rail across the well's east end at every landing. */
  for (const f of [F2, F3, ROOF]) {
    O.chunk = f === ROOF ? 'ofRoof' : FLOORS[f === F2 ? 1 : 2].chunk;
    O.cap('ofRail', [ST.land - 0.03, ST.wy0, f + 0.9], [ST.land - 0.03, ST.wy1, f + 0.9], 0.025, { name: 'handrail', seg: 6 });
    O.cap('ofSteel', [ST.land - 0.03, (ST.wy0 + ST.wy1) / 2, f], [ST.land - 0.03, (ST.wy0 + ST.wy1) / 2, f + 0.9], 0.016, { name: 'baluster', seg: 5 });
  }
  /* The stair's own light on each half landing, and the doors' frames,
   * the leaf propped open against the wall, the exit sign over each. */
  for (let k = 0; k < 4; k += 1) {
    const f = levels[k];
    O.chunk = k === 3 ? 'ofRoof' : FLOORS[k].chunk;
    const side = -1;
    O.face('ofSteelOutDark', 'x', CORE_FACE, side, o.stairDoor.a0 - 0.08, o.stairDoor.a1 + 0.08, f + 2.1, f + 2.18);
    O.face('ofSteelOutDark', 'x', CORE_FACE, side, o.stairDoor.a0 - 0.08, o.stairDoor.a0, f, f + 2.1);
    O.face('ofSteelOutDark', 'x', CORE_FACE, side, o.stairDoor.a1, o.stairDoor.a1 + 0.08, f, f + 2.1);
    O.box('ofSteelOut', o.stairDoor.a1 + 0.08, CORE_FACE - 0.85, f + 0.02, o.stairDoor.a1 + 0.13, CORE_FACE, f + 2.05, { name: 'stair door' });
    O.sign('exit', (o.stairDoor.a0 + o.stairDoor.a1) / 2, CORE_FACE - 0.03, f + 2.35, 0.42, 0.16, 's', { glow: true });
    if (k < 3) {
      O.sign(`floor${k + 1}`, ST.x1 - 0.02, (ST.y0 + ST.y1) / 2, f + 1.5, 0.45, 0.45, 'w');
      O.box('ofLamp', ST.x0 + 0.3, ST.y0 + 1.2, levels[k] + (levels[k + 1] - levels[k]) / 2 + 2.3, ST.x0 + 0.9, ST.y0 + 1.8, levels[k] + (levels[k + 1] - levels[k]) / 2 + 2.36, { name: 'stair lamp' });
    }
  }

  /*
   * THE LIFT, with its car taken out for its renewal: the shaft from the
   * ground floor to the penthouse's roof, its doors open on every floor
   * behind the works' yellow and black bar, the guide rails up its sides,
   * the buffers in the pit, the notice on every door.
   */
  for (let k = 0; k < 3; k += 1) {
    const fl = FLOORS[k];
    O.chunk = fl.chunk;
    const f = fl.f;
    const y = SHAFT.y0 - 0.2;
    O.face('ofStainless', 'x', y, -1, o.liftDoor.a0 - 0.12, o.liftDoor.a1 + 0.12, f + 2.1, f + 2.3);
    O.face('ofStainless', 'x', y, -1, o.liftDoor.a0 - 0.12, o.liftDoor.a0, f, f + 2.1);
    O.face('ofStainless', 'x', y, -1, o.liftDoor.a1, o.liftDoor.a1 + 0.12, f, f + 2.1);
    O.face('ofStainless', 'x', y - 0.012, -1, o.liftDoor.a0 - 0.12, o.liftDoor.a1 + 0.12, f, f + 0.02);
    O.sign('liftPanel', o.liftDoor.a1 + 0.35, y - 0.012, f + 1.1, 0.12, 0.3, 's', { glow: true });
    O.sign('liftWorks', o.liftDoor.a0 - 0.55, y - 0.012, f + 1.45, 0.62, 0.86, 's');
    O.sign(`liftFloor${fl.n}`, (o.liftDoor.a0 + o.liftDoor.a1) / 2, y - 0.012, f + 2.42, 0.5, 0.14, 's', { glow: true });
    /* The works' barrier: two stands and the bar between them. */
    const by = SHAFT.y0 - 0.55;
    for (const x of [o.liftDoor.a0 - 0.1, o.liftDoor.a1 + 0.1]) {
      O.box('ofBlack', x - 0.15, by - 0.15, f, x + 0.15, by + 0.15, f + 0.06, { name: 'barrier stand' });
      O.cap('ofYellow', [x, by, f + 0.06], [x, by, f + 1.0], 0.025, { name: 'barrier', seg: 6 });
    }
    O.box('ofYellow', o.liftDoor.a0 - 0.1, by - 0.03, f + 0.92, o.liftDoor.a1 + 0.1, by + 0.03, f + 1.0, { name: 'barrier bar' });
    for (let x = o.liftDoor.a0; x < o.liftDoor.a1; x += 0.24) {
      O.fine('ofBlack', x, by - 0.034, f + 0.92, x + 0.12, by + 0.034, f + 1.0, 'barrier stripe');
    }
    /* A traffic cone each side. */
    for (const x of [o.liftDoor.a0 - 0.45, o.liftDoor.a1 + 0.45]) {
      O.box('ofOrange', x - 0.17, by - 0.17, f, x + 0.17, by + 0.17, f + 0.04, { name: 'cone' });
      O.cap('ofOrange', [x, by, f + 0.04], [x, by, f + 0.68], 0.07, { name: 'cone', seg: 6, rTop: S * 0.02 });
      O.cap('ofWhite', [x, by, f + 0.35], [x, by, f + 0.48], 0.075, { fine: true, seg: 6, name: 'cone band' });
    }
  }
  O.chunk = 'of1';
  for (const x of [SHAFT.x0 + 0.06, SHAFT.x1 - 0.06]) {
    O.cap('ofSteel', [x, 14.0, F1], [x, 14.0, PH - 0.3], 0.04, { name: 'guide rail', seg: 5 });
  }
  O.cap('ofBlack', [SHAFT.x1 - 0.2, SHAFT.y1 - 0.15, F1], [SHAFT.x1 - 0.2, SHAFT.y1 - 0.15, PH - 0.3], 0.012, { fine: true, seg: 4, name: 'cable' });
  O.cap('ofBlack', [SHAFT.x1 - 0.3, SHAFT.y1 - 0.15, F1], [SHAFT.x1 - 0.3, SHAFT.y1 - 0.15, PH - 0.3], 0.012, { fine: true, seg: 4, name: 'cable' });
  for (const x of [6.75, 7.65]) {
    O.box('ofYellow', x - 0.12, 13.9, F1, x + 0.12, 14.14, F1 + 0.5, { name: 'buffer' });
  }
  O.paint('ofBlack', SHAFT.x0, SHAFT.y0, F1, SHAFT.x1, SHAFT.y1, F1 + 0.008, 'pit');
  /* The bracket lines up the shaft's back wall at every floor. */
  for (const f of [F2 - 0.3, F3 - 0.3, ROOF - 0.3]) {
    O.face('ofSteel', 'x', SHAFT.y1, -1, SHAFT.x0, SHAFT.x1, f, f + 0.12);
  }
  O.box('ofLamp', 7.0, 14.6, PH - 0.1, 7.4, 14.9, PH, { name: 'shaft lamp' });
}

/* ------------------------------------------------------------------ */
/* The ground floor: goods in                                          */
/* ------------------------------------------------------------------ */

/* A row of pallet racking along py: blue uprights at every bay, orange
 * beams at each level, a pallet of cartons on most, one solid round the
 * whole row and its load. */
function racking(O, x0, x1, y0, y1, f, r, face) {
  const H = 3.3;
  const levels = [1.15, 2.3];
  O.hidden(x0, y0, f, x1, y1, f + H, 'racking');
  const bays = Math.max(1, Math.round((y1 - y0) / 2.7));
  const bay = (y1 - y0) / bays;
  const u = 0.08;
  for (let i = 0; i <= bays; i += 1) {
    const y = Math.min(y0 + i * bay, y1 - u);
    for (const x of [x0, x1 - u]) {
      O.box('ofRack', x, y, f, x + u, y + u, f + H, { name: 'upright', solid: false });
    }
    O.fine('ofRack', x0 + u, y + 0.02, f + 0.3, x1 - u, y + 0.05, f + 0.34, 'brace');
    O.fine('ofRack', x0 + u, y + 0.02, f + 1.8, x1 - u, y + 0.05, f + 1.84, 'brace');
  }
  for (const h of levels) {
    for (const x of [x0, x1 - u]) {
      O.box('ofRackBeam', x, y0, f + h - 0.1, x + u, y1, f + h, { name: 'beam', solid: false });
    }
  }
  for (let i = 0; i < bays; i += 1) {
    const b0 = y0 + i * bay + u;
    const b1 = y0 + (i + 1) * bay;
    [0, ...levels].forEach((h, k) => {
      if (r.chance(k === 0 ? 0.1 : 0.2)) {
        return;
      }
      for (const [c0, c1] of [[b0 + 0.08, (b0 + b1) / 2 - 0.04], [(b0 + b1) / 2 + 0.04, b1 - 0.08]]) {
        if (r.chance(0.15)) {
          continue;
        }
        const top = f + h + (k === 0 ? 0 : 0.0);
        const px0 = x0 + 0.05;
        const px1 = x1 - 0.05;
        const p0 = O.box('ofPallet', px0, c0, top, px1, c1, top + 0.14, { name: 'pallet', solid: false });
        if (p0) {
          p0.fine = false;
        }
        const ht = r.range(0.45, k === 2 ? 0.9 : 0.85);
        if (r.chance(0.25)) {
          O.box('ofWrap', px0 + 0.03, c0 + 0.03, top + 0.14, px1 - 0.03, c1 - 0.03, top + 0.14 + ht, { name: 'wrapped', solid: false });
          O.fine('ofCard', px0 + 0.02, c0 + 0.05, top + 0.2, px1 - 0.02, c1 - 0.05, top + 0.1 + ht, 'wrapped');
        } else {
          load(O, px0 + 0.02, c0 + 0.02, px1 - 0.02, c1 - 0.02, top + 0.14, ht, r, { solid: false, labels: 0 });
          const lx = face > 0 ? px1 - 0.02 : px0 + 0.02;
          if (r.chance(0.6)) {
            O.sign(r.pick(['fragile', 'thisway', 'boxLabel']), lx, (c0 + c1) / 2, top + 0.14 + ht * 0.5, 0.26, 0.16, face > 0 ? 'e' : 'w', { lift: 0.004 });
          }
        }
      }
    });
  }
  /* The bay's number on the beam's end. */
  O.sign(`rack${r.int(1, 9)}`, (x0 + x1) / 2, y0 - 0.01, f + 3.1, 0.4, 0.4, 's');
}

/* A roll cage: four posts, the mesh drawn, the load in it, one solid
 * round it to the floor. */
function rollCage(O, x0, y0, x1, y1, f, r) {
  const H = 1.7;
  O.hidden(x0, y0, f, x1, y1, f + H, 'roll cage');
  for (const [x, y] of [[x0, y0], [x1 - 0.04, y0], [x0, y1 - 0.04], [x1 - 0.04, y1 - 0.04]]) {
    O.box('ofCage', x, y, f + 0.12, x + 0.04, y + 0.04, f + H, { name: 'cage post', solid: false });
  }
  O.box('ofCage', x0, y0, f + 0.12, x1, y1, f + 0.17, { name: 'cage deck', solid: false });
  for (let h = 0.35; h < H; h += 0.22) {
    O.fine('ofCage', x0, y0, f + h, x1, y0 + 0.015, f + h + 0.015, 'mesh');
    O.fine('ofCage', x0, y1 - 0.015, f + h, x1, y1, f + h + 0.015, 'mesh');
    O.fine('ofCage', x0, y0, f + h, x0 + 0.015, y1, f + h + 0.015, 'mesh');
  }
  for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.15) {
    O.fine('ofCage', x, y0, f + 0.17, x + 0.015, y0 + 0.015, f + H, 'mesh');
    O.fine('ofCage', x, y1 - 0.015, f + 0.17, x + 0.015, y1, f + H, 'mesh');
  }
  for (const [x, y] of [[x0 + 0.05, y0 + 0.05], [x1 - 0.13, y0 + 0.05], [x0 + 0.05, y1 - 0.13], [x1 - 0.13, y1 - 0.13]]) {
    O.box('ofBlack', x, y, f, x + 0.08, y + 0.08, f + 0.12, { name: 'caster', solid: false });
  }
  if (r.chance(0.8)) {
    load(O, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, f + 0.17, r.range(0.5, 1.4), r, { solid: false, labels: 0.4 });
  }
}

function groundFloor(O) {
  const f = F1;
  const r = seededRandom(8102);
  const o = OPENINGS;
  O.chunk = 'of1';
  /* The walkway lines painted on the floor, and the green safe walkway
   * from the entrance to the stair. */
  for (const [x0, y0, x1, y1] of [[1.25, 0.6, 1.33, 11.4], [3.82, 0.6, 3.9, 9.6], [6.12, 0.6, 6.2, 9.6], [8.72, 0.6, 8.8, 9.6],
    [9.95, 0.6, 10.03, 11.4], [10.0, 11.32, 19.4, 11.4]]) {
    O.paint('ofSlabLine', x0, y0, f, x1, y1, f + 0.006, 'line');
  }
  O.paint('ofSlabGreen', 10.4, 9.9, f, 19.3, 10.9, f + 0.006, 'walkway');
  O.paint('ofSlabGreen', 18.3, 5.7, f, 19.3, 9.9, f + 0.006, 'walkway');
  for (let x = 10.8; x < 19; x += 1.2) {
    O.paint('ofWhite', x, 10.0, f + 0.006, x + 0.5, 10.8, f + 0.01, 'walkway mark');
  }
  /* The racking: along the west wall, a double row, and a single row,
   * each 2.7 m aisle open at both ends. */
  racking(O, 0.0, 1.2, 0.6, 11.2, f, r, 1);
  racking(O, 3.9, 6.1, 0.6, 9.6, f, r, -1);
  racking(O, 8.8, 9.9, 0.6, 9.6, f, r, -1);
  O.paint('ofSlabLine', 3.9, 0.5, f, 6.1, 0.6, f + 0.006, 'line');
  /* The H steel beams across the ceiling and the strip lights hung on
   * their chains between them. */
  for (const x of [6.0, 12.0, 18.0]) {
    O.box('ofBeam', x - 0.1, 0, B2 - 0.4, x + 0.1, DEP, B2, { name: 'beam' });
    O.box('ofBeam', x - 0.15, 0, B2 - 0.4, x + 0.15, DEP, B2 - 0.37, { name: 'beam' });
  }
  for (const x of [2.6, 7.5, 11.2, 15.0, 21.0]) {
    for (const y of [2.0, 5.0, 8.0, 11.0]) {
      if (x > 19 && y < 6) {
        continue;
      }
      O.box('ofLamp', x - 0.6, y - 0.07, 3.5, x + 0.6, y + 0.07, 3.56, { name: 'light' });
      O.box('ofSteel', x - 0.62, y - 0.09, 3.56, x + 0.62, y + 0.09, 3.62, { name: 'light' });
      O.cap('ofSteel', [x - 0.5, y, 3.62], [x - 0.5, y, B2], 0.008, { fine: true, seg: 4, name: 'chain' });
      O.cap('ofSteel', [x + 0.5, y, 3.62], [x + 0.5, y, B2], 0.008, { fine: true, seg: 4, name: 'chain' });
    }
  }
  /* The sprinkler main, red, along the ceiling. */
  O.cap('ofRed', [0.5, 6.4, 3.95], [23.5, 6.4, 3.95], 0.05, { name: 'sprinkler main', seg: 6 });
  /* The shutters: the open one's drum and guides, the stopped one's slats
   * coming down to 0.9 m over the floor. */
  for (const s of [o.shutterUp, o.shutterHalf]) {
    O.box('ofSteel', s.a0 - 0.15, 0, s.h1, s.a1 + 0.15, 0.5, B2, { name: 'shutter box' });
    O.box('ofSteel', s.a0 - 0.1, 0, f, s.a0, 0.12, s.h1, { name: 'shutter guide' });
    O.box('ofSteel', s.a1, 0, f, s.a1 + 0.1, 0.12, s.h1, { name: 'shutter guide' });
    O.box('ofTile', s.a0 - 0.15, -TW, s.h1, s.a1 + 0.15, 0, B2, { name: 'shutter box' });
  }
  const sh = o.shutterHalf;
  O.box('ofSteel', sh.a0, 0.02, sh.stop, sh.a1, 0.1, sh.h1, { name: 'shutter' });
  for (let h = sh.stop + 0.1; h < sh.h1; h += 0.1) {
    O.paint('ofCabinetDark', sh.a0, 0.1, h, sh.a1, 0.112, h + 0.012, 'shutter slat');
    O.paint('ofCabinetDark', sh.a0, 0.008, h, sh.a1, 0.02, h + 0.012, 'shutter slat');
  }
  O.box('ofBlack', sh.a0, 0.0, sh.stop, sh.a1, 0.12, sh.stop + 0.06, { name: 'shutter foot' });
  /* The sun in through the open shutter and under the stopped one. */
  sunPatch(O, o.shutterUp.a0, o.shutterUp.a1, 0.05, 3.4, 3.4, f, 9.5, true);
  sunPatch(O, sh.a0, sh.a1, 0.05, sh.stop, sh.stop, f, 9.5, true);

  /* The sorting floor between the racking and the front office. */
  /* The conveyor: its frame on legs, the rollers drawn. */
  const cv = { x0: 12.6, x1: 13.3, y0: 4.6, y1: 9.2, h: 0.75 };
  O.box('ofSteel', cv.x0, cv.y0, f + cv.h - 0.12, cv.x0 + 0.06, cv.y1, f + cv.h, { name: 'conveyor' });
  O.box('ofSteel', cv.x1 - 0.06, cv.y0, f + cv.h - 0.12, cv.x1, cv.y1, f + cv.h, { name: 'conveyor' });
  for (let y = cv.y0 + 0.05; y < cv.y1; y += 0.11) {
    O.cap('ofChrome', [cv.x0 + 0.06, y, f + cv.h - 0.04], [cv.x1 - 0.06, y, f + cv.h - 0.04], 0.03, { fine: true, seg: 5, name: 'roller' });
  }
  O.hidden(cv.x0 + 0.06, cv.y0, f + cv.h - 0.07, cv.x1 - 0.06, cv.y1, f + cv.h - 0.01, 'rollers');
  for (const y of [cv.y0 + 0.2, (cv.y0 + cv.y1) / 2, cv.y1 - 0.25]) {
    for (const x of [cv.x0, cv.x1 - 0.05]) {
      O.box('ofSteel', x, y, f, x + 0.05, y + 0.05, f + cv.h - 0.12, { name: 'conveyor leg' });
    }
  }
  for (const y of [5.2, 6.4, 8.1]) {
    carton(O, 12.72, y, f + cv.h, 13.18, y + r.range(0.35, 0.55), f + cv.h + r.range(0.22, 0.4), r, { label: ['e', 'boxLabel'] });
  }
  /* The packing bench: a top on legs, tape guns, a roll of bubble wrap, a
   * scale, flat cartons under it. */
  O.box('ofWood', 15.2, 7.4, f + 0.82, 17.8, 8.2, f + 0.86, { name: 'bench' });
  for (const [x, y] of [[15.25, 7.45], [17.7, 7.45], [15.25, 8.1], [17.7, 8.1]]) {
    O.box('ofSteel', x, y, f, x + 0.05, y + 0.05, f + 0.82, { name: 'bench leg' });
  }
  O.box('ofSteel', 15.25, 7.45, f, 17.75, 8.15, f + 0.03, { name: 'bench shelf' });
  for (let k = 0; k < 6; k += 1) {
    O.fine('ofCard', 15.35, 7.55, f + 0.18 + k * 0.025, 16.9, 8.05, f + 0.2 + k * 0.025, 'flat cartons');
  }
  O.cap('ofWrap', [15.4, 8.0, f + 0.98], [16.4, 8.0, f + 0.98], 0.12, { name: 'bubble wrap', seg: 8 });
  O.box('ofBlack', 16.7, 7.55, f + 0.86, 17.1, 7.9, f + 0.92, { name: 'scale' });
  O.fine('ofScreen', 16.75, 7.54, f + 0.87, 16.9, 7.55, f + 0.91, 'scale screen');
  O.fine('ofRed', 17.3, 7.6, f + 0.86, 17.42, 7.85, f + 0.98, 'tape gun');
  carton(O, 15.6, 7.5, f + 0.86, 16.3, 7.9, f + 1.18, r, { label: ['s', 'fragile'] });
  /* Roll cages lined up to go out, and pallets of incoming stock. */
  for (let i = 0; i < 5; i += 1) {
    rollCage(O, 18.6, 3.0 + i * 0.65, 19.38, 3.6 + i * 0.65, f, r);
  }
  for (const [x0, y0, h] of [[10.6, 7.0, 1.2], [10.6, 3.3, 0.9], [15.0, 4.4, 1.5], [16.6, 4.4, 0.8]]) {
    pallet(O, x0, y0, x0 + 1.1, y0 + 1.1, f);
    if (h > 1.3) {
      O.box('ofWrap', x0 + 0.04, y0 + 0.04, f + 0.14, x0 + 1.06, y0 + 1.06, f + 0.14 + h, { name: 'wrapped' });
      O.fine('ofCard', x0 + 0.03, y0 + 0.08, f + 0.2, x0 + 1.07, y0 + 1.02, f + h, 'wrapped');
    } else {
      load(O, x0 + 0.02, y0 + 0.02, x0 + 1.08, y0 + 1.08, f + 0.14, h, r, { labels: 0.5 });
    }
  }
  /* The hand pallet truck by them, the forklift parked by the racking. */
  O.box('ofRed', 14.0, 3.2, f, 14.55, 4.4, f + 0.09, { name: 'pallet truck' });
  O.box('ofRed', 14.2, 4.4, f, 14.35, 4.55, f + 0.4, { name: 'pallet truck' });
  O.cap('ofBlack', [14.27, 4.5, f + 0.4], [14.27, 4.9, f + 1.2], 0.025, { name: 'pallet truck handle', seg: 5 });
  forklift(O, 10.45, 0.9, f);
  /* The time recorder and the card rack by the stair door, the safety
   * banner and the delivery board on the north wall, extinguishers. */
  O.onWall('ofWhite', 'x', CORE_FACE, -1, 2.3, 2.75, f + 1.15, f + 1.5, 0.22, { name: 'time recorder' });
  O.sign('timeCards', 3.4, CORE_FACE - 0.02, f + 1.35, 0.7, 0.9, 's');
  O.sign('safety', 14.0, CORE_FACE - 0.02, f + 2.4, 2.4, 0.6, 's');
  O.onWall('ofFrame', 'x', CORE_FACE, -1, 10.4, 12.8, f + 0.95, f + 2.05, 0.03, { name: 'board' });
  O.sign('delivery', 11.6, CORE_FACE - 0.04, f + 1.5, 2.3, 1.0, 's');
  O.sign('noSmoking', 17.0, CORE_FACE - 0.02, f + 2.1, 0.4, 0.4, 's');
  extinguisher(O, 4.4, CORE_FACE - 0.2, f, 's');
  extinguisher(O, 19.0, 0.3, f, 'n');
  O.sign('ganbaro', 21.6, DEP - 0.02 - 3.05, f + 2.5, 1.6, 0.8, 's');
  /* The 5S poster on the east wall. */
  O.sign('fiveS', LEN - 0.02, 7.6, f + 1.8, 0.8, 1.1, 'w');

  /* The north rooms: the toilets and the store, shut, their doors and
   * signs painted. The lobby's doors open off the floor. */
  O.wall('ofWallIn', 'x', CORE_Y, SHAFT.x1 + 0.2, LEN, 0, B2, CORE_T, [], 'north rooms');
  northDoors(O, f, ['wcM', 'wcW', 'store', 'store']);
  /* The front office: its walls, the reception hatch, its door, a low
   * ceiling, the counter, two desks. */
  frontOffice(O, f, r);
}

/* A counterbalance forklift, parked, forks down, nose north. */
function forklift(O, x, y, f) {
  O.box('ofForklift', x, y, f + 0.12, x + 1.1, y + 2.0, f + 0.75, { name: 'forklift' });
  O.box('ofBlack', x + 0.05, y + 0.0, f + 0.75, x + 1.05, y + 0.45, f + 1.1, { name: 'forklift' });
  O.box('ofForklift', x + 0.1, y + 0.5, f + 0.75, x + 1.0, y + 1.3, f + 0.95, { name: 'forklift' });
  O.box('ofBlack', x + 0.3, y + 0.7, f + 0.95, x + 0.8, y + 1.15, f + 1.35, { name: 'forklift seat' });
  for (const [dx, dy] of [[0.05, 0.4], [0.98, 0.4], [0.05, 1.75], [0.98, 1.75]]) {
    O.cap('ofBlack', [x + dx + 0.035, y + dy, f + 0.75], [x + dx + 0.035, y + dy, f + 2.1], 0.035, { name: 'forklift guard', seg: 5 });
  }
  O.box('ofBlack', x + 0.05, y + 0.38, f + 2.08, x + 1.05, y + 1.82, f + 2.14, { name: 'forklift guard' });
  for (const dx of [-0.02, 1.0]) {
    O.box('ofBlack', x + dx, y + 0.15, f, x + dx + 0.12, y + 0.6, f + 0.45, { name: 'wheel' });
    O.box('ofBlack', x + dx, y + 1.45, f, x + dx + 0.12, y + 1.9, f + 0.45, { name: 'wheel' });
  }
  O.hidden(x + 0.12, y + 0.15, f, x + 0.98, y + 1.9, f + 0.12, 'forklift');
  O.box('ofBlack', x + 0.15, y + 2.0, f, x + 0.27, y + 2.12, f + 2.3, { name: 'mast' });
  O.box('ofBlack', x + 0.83, y + 2.0, f, x + 0.95, y + 2.12, f + 2.3, { name: 'mast' });
  O.box('ofBlack', x + 0.15, y + 2.0, f + 2.18, x + 0.95, y + 2.12, f + 2.3, { name: 'mast' });
  O.box('ofSteel', x + 0.22, y + 2.12, f, x + 0.32, y + 3.1, f + 0.05, { name: 'fork' });
  O.box('ofSteel', x + 0.78, y + 2.12, f, x + 0.88, y + 3.1, f + 0.05, { name: 'fork' });
  O.box('ofOrange', x + 0.45, y + 1.2, f + 2.14, x + 0.65, y + 1.4, f + 2.24, { name: 'beacon' });
}

/* An extinguisher on the floor in its red stand, the sign over it. */
function extinguisher(O, px, py, f, face) {
  O.box('ofRed', px - 0.13, py - 0.13, f, px + 0.13, py + 0.13, f + 0.08, { name: 'extinguisher stand' });
  O.cap('ofRed', [px, py, f + 0.08], [px, py, f + 0.55], 0.075, { name: 'extinguisher', seg: 7 });
  O.cap('ofBlack', [px, py, f + 0.55], [px, py, f + 0.62], 0.03, { fine: true, seg: 5, name: 'extinguisher head' });
  const n = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[face];
  O.sign('extinguisher', px - n[0] * 0.25, py - n[1] * 0.25, f + 1.2, 0.3, 0.22, face);
}

/* The north rooms' doors along the core's front, east of the shaft:
 * four doors a floor, each a sign of what is behind it. */
function northDoors(O, f, kinds) {
  const at = [9.3, 11.0, 16.5, 20.5];
  kinds.forEach((k, i) => {
    if (!k) {
      return;
    }
    const a = at[i];
    O.face('ofCabinetDark', 'x', CORE_FACE, -1, a - 0.45, a + 0.45, f, f + 2.05);
    O.face(k === 'store' ? 'ofSteel' : 'ofWallInB', 'x', CORE_FACE - 0.012, -1, a - 0.4, a + 0.4, f, f + 2.0);
    O.face('ofSteel', 'x', CORE_FACE - 0.024, -1, a + 0.25, a + 0.33, f + 0.95, f + 1.05);
    O.sign(k, a, CORE_FACE - 0.03, f + 1.55, 0.3, 0.3, 's');
  });
}

function frontOffice(O, f, r) {
  const o = OPENINGS;
  const X = 19.5;
  const Y = 5.5;
  const CEIL = 2.6;
  O.wall('ofWallIn', 'y', X, 0, Y, 0, B2, 0.12, [[o.hatch.a0, o.hatch.a1, o.hatch.h0, o.hatch.h1]], 'office wall');
  O.wall('ofWallIn', 'x', Y, X - 0.06, LEN, 0, B2, 0.12, [[20.2, 21.1, 0, 2.1]], 'office wall');
  O.box('ofCeiling', X + 0.06, 0, CEIL, LEN, Y - 0.06, B2 - 0.4, { name: 'office ceiling' });
  O.box('ofWhite', X - 0.1, o.hatch.a0 - 0.05, o.hatch.h0 - 0.05, X + 0.1, o.hatch.a1 + 0.05, o.hatch.h0, { name: 'hatch sill' });
  O.sign('uketsuke', X - 0.08, (o.hatch.a0 + o.hatch.a1) / 2, o.hatch.h1 + 0.2, 0.6, 0.18, 'w');
  O.box('ofWhite', X + 0.06, 1.3, f, X + 0.7, 3.1, f + o.hatch.h0, { name: 'counter' });
  O.fine('ofBlack', X - 0.05, 2.5, o.hatch.h0, X + 0.05, 2.7, o.hatch.h0 + 0.12, 'bell');
  /* Two desks back to back and a cabinet, the window's glass and door. */
  desk(O, 21.0, 2.2, 22.2, 2.9, 's', r, { f });
  desk(O, 21.0, 2.9, 22.2, 3.6, 'n', r, { f });
  chair(O, 21.6, 1.55, 'n', { f });
  chair(O, 21.4, 4.2, 's', { f });
  cabinets(O, 'y', 0.0, 2.0, LEN - 0.45, LEN, 1.8, f, r, -1);
  plant(O, 23.5, 4.8, f, r);
  O.sign('calendar', LEN - 0.02, 3.4, f + 1.6, 0.45, 0.6, 'w');
  O.sign('clock', X + 0.08, 4.2, f + 2.2, 0.32, 0.32, 'e');
  for (const [a0, a1] of [[19.6, 20.3], [22.1, 23.9]]) {
    O.box('ofSash', a0, -0.2, 0.3, a1, 0.0, 0.35, { name: 'sash' });
    O.box('ofSash', a0, -0.2, 2.25, a1, 0.0, 2.3, { name: 'sash' });
    O.hidden(a0, -0.25, 0.35, a1, 0.0, 2.25, 'glass');
    O.sign('glass', (a0 + a1) / 2, -0.04, 1.3, a1 - a0, 1.9, 'n', { lift: 0.004 });
    O.sign('glass', (a0 + a1) / 2, -0.16, 1.3, a1 - a0, 1.9, 's', { lift: 0.004 });
  }
  /* The automatic door's leaves, slid open into the glass either side. */
  O.box('ofSash', o.entrance.a0 - 0.6, -0.3, f, o.entrance.a0, -0.26, 2.3, { name: 'door leaf' });
  O.box('ofSash', o.entrance.a1, -0.3, f, o.entrance.a1 + 0.6, -0.26, 2.3, { name: 'door leaf' });
  O.box('ofSteel', o.entrance.a0 - 0.6, -0.4, 2.3, o.entrance.a1 + 0.6, -0.15, 2.5, { name: 'door head' });
  O.paint('ofCarpetB', o.entrance.a0, 0.1, f, o.entrance.a1, 1.0, f + 0.01, 'mat');
  /* An umbrella stand by the door. */
  O.box('ofSteel', 22.3, 0.0, f, 22.6, 0.3, f + 0.5, { name: 'umbrella stand' });
  for (const [dx, m] of [[0.06, 'ofNoren'], [0.18, 'ofRed'], [0.12, 'ofBlack']]) {
    O.cap(m, [22.3 + dx, 0.3, f + 0.2], [22.3 + dx + 0.02, 0.36, f + 0.92], 0.02, { fine: true, seg: 5, name: 'umbrella' });
  }
}

/* ------------------------------------------------------------------ */
/* The sales floor                                                     */
/* ------------------------------------------------------------------ */

/* The carpet's check, one tile in two of the darker grey, and a plain
 * band along the windows. Paint, and fine past the first band. */
function carpet(O, f, x0, y0, x1, y1, m) {
  for (let x = x0; x < x1 - 0.01; x += 1.0) {
    for (let y = y0; y < y1 - 0.01; y += 1.0) {
      if ((Math.round(x - x0) + Math.round(y - y0)) % 2 === 0) {
        O.fine(m, x, y, f, Math.min(x + 1.0, x1), Math.min(y + 1.0, y1), f + 0.005, 'carpet');
      }
    }
  }
}

/* The ceiling of an office floor: the light troffers in a grid, the air
 * conditioners' cassettes, the smoke heads. */
function ceiling(O, f, c, cells) {
  for (const [x0, x1, y0, y1] of cells) {
    for (let x = x0; x < x1 - 0.5; x += 2.4) {
      for (let y = y0; y < y1 - 0.5; y += 2.4) {
        O.box('ofLamp', x + 0.6, y + 0.9, c - 0.03, x + 1.8, y + 1.2, c, { name: 'troffer' });
        O.fine('ofFrame', x + 0.58, y + 0.88, c - 0.02, x + 1.82, y + 1.22, c - 0.005, 'troffer frame');
      }
    }
    for (let x = x0 + 2.4; x < x1 - 1; x += 7.2) {
      for (let y = y0 + 2.2; y < y1 - 1; y += 4.8) {
        O.box('ofWhite', x - 0.42, y - 0.42, c - 0.04, x + 0.42, y + 0.42, c, { name: 'aircon' });
        O.fine('ofCabinetDark', x - 0.3, y - 0.3, c - 0.05, x + 0.3, y + 0.3, c - 0.04, 'aircon grille');
        O.fine('ofWhite', x - 0.24, y - 0.24, c - 0.055, x + 0.24, y + 0.24, c - 0.05, 'aircon panel');
      }
    }
  }
}

function salesFloor(O) {
  const fl = FLOORS[1];
  const f = fl.f;
  const r = seededRandom(8103);
  O.chunk = fl.chunk;
  O.box('ofCarpet', 0, 0, F2 - 0.01, LEN, CORE_FACE, F2, { name: 'carpet', cast: false, solid: false });
  carpet(O, f, 0.0, 1.5, LEN, 11.5, 'ofCarpetB');
  ceiling(O, f, fl.c, [[0, 15, 0, 11.8], [15, 24, 0, 11.8]]);
  /* The islands, the free address table, the department head. */
  island(O, 1.4, 3.4, 3, f, r);
  island(O, 1.4, 7.6, 3, f, r);
  island(O, 8.6, 3.4, 3, f, r);
  /* The free address table: one long top on post legs, open end to end
   * underneath, stools down its sides, laptops on it. */
  const T = { x0: 8.6, x1: 13.4, y0: 7.0, y1: 8.2 };
  O.box('ofWood', T.x0, T.y0, f + 0.69, T.x1, T.y1, f + 0.72, { name: 'table' });
  for (const x of [T.x0 + 0.08, (T.x0 + T.x1) / 2, T.x1 - 0.08]) {
    for (const y of [T.y0 + 0.08, T.y1 - 0.08]) {
      O.cap('ofSteel', [x, y, f], [x, y, f + 0.69], 0.03, { name: 'table leg', seg: 6 });
    }
  }
  for (let x = T.x0 + 0.5; x < T.x1 - 0.3; x += 1.0) {
    for (const [y, open] of [[T.y0 + 0.3, 's'], [T.y1 - 0.3, 'n']]) {
      if (r.chance(0.35)) {
        continue;
      }
      const dy = open === 's' ? -1 : 1;
      O.fine('ofBlack', x - 0.17, y - 0.12, f + 0.72, x + 0.17, y + 0.12, f + 0.74, 'laptop');
      O.fine('ofMonitor', x - 0.17, y + dy * 0.12 - 0.01, f + 0.74, x + 0.17, y + dy * 0.12 + 0.01, f + 0.96, 'laptop lid');
      O.fine('ofScreen', x - 0.15, y + dy * 0.12 - dy * 0.014, f + 0.76, x + 0.15, y + dy * 0.12 - dy * 0.012 + 0.002, f + 0.94, 'laptop screen');
    }
  }
  for (let x = T.x0 + 0.5; x < T.x1 - 0.3; x += 1.0) {
    for (const y of [T.y0 - 0.45, T.y1 + 0.45]) {
      if (r.chance(0.3)) {
        continue;
      }
      O.cap('ofSteel', [x, y, f], [x, y, f + 0.42], 0.025, { name: 'stool', seg: 6 });
      O.cap('ofTeal', [x, y, f + 0.42], [x, y, f + 0.47], 0.18, { name: 'stool', seg: 10 });
    }
  }
  /* The department head's desk under the kamidana, facing the room, and
   * the visitor's chair. */
  desk(O, 1.6, 10.2, 3.2, 10.9, 'n', r, { f, top: 'ofWood' });
  chair(O, 2.4, 11.1, 's', { f, tall: true, seat: 'ofChairBoss' });
  O.sign('nameplate', 2.4, 10.15, f + 0.8, 0.3, 0.07, 's', { lift: 0.0 });
  kamidana(O, 2.4, CORE_FACE, f + 1.8);
  /* The low cabinets under the west windows, files and a printer on top. */
  cabinets(O, 'y', 1.0, 9.6, 0.0, 0.45, 0.75, f, r, 1);
  O.box('ofWhite', 0.02, 4.2, f + 0.75, 0.43, 4.7, f + 1.0, { name: 'printer' });
  O.fine('ofCabinetDark', 0.43, 4.25, f + 0.85, 0.44, 4.65, f + 0.95, 'printer slot');
  for (const y of [1.3, 2.0, 6.4, 8.1]) {
    for (let k = 0; k < 6; k += 1) {
      O.fine(r.pick(['ofBinderBlue', 'ofBinderRed', 'ofBinderYellow', 'ofPaper']), 0.08, y + k * 0.065, f + 0.75, 0.38, y + k * 0.065 + 0.055, f + 1.05, 'binder');
    }
  }
  plant(O, 0.35, 9.1, f + 0.75, r, false);
  plant(O, 0.35, 5.6, f + 0.75, r, false);
  /* The east zone: the partitioned meeting booth by the windows, the
   * copier and the water server, lockers, a standing whiteboard. */
  booth(O, f, r);
  O.box('ofWhite', 21.6, 10.7, f, 22.7, 11.4, f + 0.95, { name: 'copier' });
  O.box('ofCabinetDark', 21.6, 10.7, f + 0.95, 22.7, 11.4, f + 1.15, { name: 'copier' });
  O.fine('ofScreen', 21.7, 10.69, f + 1.0, 22.0, 10.7, f + 1.1, 'copier panel');
  for (const h of [0.2, 0.45, 0.7]) {
    O.fine('ofCabinetDark', 21.7, 10.69, f + h, 22.6, 10.7, f + h + 0.02, 'copier tray');
  }
  for (let k = 0; k < 3; k += 1) {
    O.box('ofPaper', 22.7, 10.9, f + k * 0.28, 23.3, 11.35, f + (k + 1) * 0.28 - 0.01, { name: 'paper box' });
  }
  O.box('ofWhite', 20.55, 11.4, f, 20.95, CORE_FACE, f + 1.05, { name: 'water server' });
  O.cap('ofTankBlue', [20.75, 11.62, f + 1.05], [20.75, 11.62, f + 1.4], 0.13, { name: 'water bottle', seg: 8 });
  cabinets(O, 'y', 5.5, 9.7, LEN - 0.5, LEN, 1.8, f, r, -1);
  O.box('ofWhite', 20.4, 6.2, f + 0.9, 22.4, 6.26, f + 2.0, { name: 'whiteboard' });
  O.box('ofFrame', 20.4, 6.18, f + 0.88, 22.4, 6.28, f + 0.9, { name: 'whiteboard' });
  for (const x of [20.5, 22.3]) {
    O.cap('ofSteel', [x, 6.23, f + 0.08], [x, 6.23, f + 2.0], 0.02, { name: 'whiteboard leg', seg: 5 });
    O.box('ofSteel', x - 0.03, 5.9, f, x + 0.03, 6.55, f + 0.08, { name: 'whiteboard foot' });
  }
  O.sign('scribbles', 21.4, 6.18, f + 1.45, 1.9, 1.0, 's', { lift: 0.002 });
  O.sign('scribbles2', 21.4, 6.28, f + 1.45, 1.9, 1.0, 'n', { lift: 0.002 });
  plant(O, 23.4, 10.9, f, r);
  plant(O, 6.0, 11.3, f, r);
  plant(O, 14.6, 0.5, f, r);
  /* On the walls: the schedule board, the sales chart and the month's
   * target, the clock, the calendar, the hydrant, the partners' signs are
   * hung by ./index.js. */
  O.onWall('ofFrame', 'x', CORE_FACE, -1, 8.9, 11.7, f + 0.9, f + 2.1, 0.04, { name: 'schedule board' });
  O.sign('schedule', 10.3, CORE_FACE - 0.045, f + 1.5, 2.7, 1.1, 's');
  O.sign('target', 10.3, CORE_FACE - 0.02, f + 2.42, 2.8, 0.42, 's');
  O.sign('salesChart', 13.6, CORE_FACE - 0.02, f + 1.6, 1.2, 1.4, 's');
  O.sign('clock', 3.9, CORE_FACE - 0.02, f + 2.3, 0.34, 0.34, 's');
  O.sign('calendar', 0.02, 8.7, f + 1.65, 0.5, 0.65, 'e');
  O.onWall('ofRed', 'x', CORE_FACE, -1, 19.0, 19.75, f + 0.3, f + 1.2, 0.15, { name: 'hydrant' });
  O.sign('hydrant', 19.375, CORE_FACE - 0.16, f + 0.75, 0.66, 0.8, 's');
  O.sign('goal', 17.5, CORE_FACE - 0.02, f + 1.6, 0.9, 1.2, 's');
  O.sign('poster', LEN - 0.02, 10.2, f + 1.5, 0.5, 0.7, 'w');
  extinguisher(O, 4.4, CORE_FACE - 0.2, f, 's');
  /* The north rooms: the toilets, the tea kitchen through its noren, the
   * archive. */
  O.wall('ofWallIn', 'x', CORE_Y, SHAFT.x1 + 0.2, LEN, F2, C2, CORE_T, [[12.7, 13.7, F2 - 0.05, F2 + 2.1]], 'north rooms');
  O.wall('ofWallIn', 'y', 12.0, CORE_Y, DEP, F2, C2, 0.12, [], 'kitchen wall');
  O.wall('ofWallIn', 'y', 15.0, CORE_Y, DEP, F2, C2, 0.12, [], 'kitchen wall');
  northDoors(O, f, ['wcM', 'wcW', null, 'archive']);
  kitchen(O, f, r);
}

/* The kamidana: a shelf high on the wall, the little shrine on it with
 * its roof, the sakaki in their vases, the rope and its paper. */
function kamidana(O, px, py, h) {
  O.box('ofWood', px - 0.5, py - 0.32, h, px + 0.5, py, h + 0.04, { name: 'kamidana' });
  for (const x of [px - 0.42, px + 0.38]) {
    O.box('ofWood', x, py - 0.06, h - 0.25, x + 0.04, py, h, { name: 'kamidana bracket' });
  }
  O.box('ofWood', px - 0.18, py - 0.24, h + 0.04, px + 0.18, py - 0.04, h + 0.34, { name: 'shrine' });
  O.box('ofWoodDark', px - 0.24, py - 0.3, h + 0.34, px + 0.24, py - 0.02, h + 0.4, { name: 'shrine roof' });
  O.box('ofWoodDark', px - 0.2, py - 0.26, h + 0.4, px + 0.2, py - 0.06, h + 0.45, { name: 'shrine roof' });
  O.fine('ofWoodDark', px - 0.08, py - 0.245, h + 0.08, px + 0.08, py - 0.24, h + 0.28, 'shrine door');
  for (const x of [px - 0.36, px + 0.32]) {
    O.cap('ofWhite', [x + 0.02, py - 0.16, h + 0.04], [x + 0.02, py - 0.16, h + 0.14], 0.03, { fine: true, seg: 6, name: 'vase' });
    O.cap('ofLeafDark', [x + 0.02, py - 0.16, h + 0.2], [x + 0.02, py - 0.16, h + 0.3], 0.07, { solid: false, look: 'capsule', seg: 6, name: 'sakaki' });
  }
  O.cap('ofTape', [px - 0.5, py - 0.34, h + 0.02], [px + 0.5, py - 0.34, h + 0.02], 0.025, { fine: true, seg: 5, name: 'shimenawa' });
  O.sign('shide', px, py - 0.36, h - 0.06, 0.7, 0.14, 's', { lift: 0.0 });
}

/* The meeting booth: partition panels 1.5 m tall on three sides, open to
 * the windows, a round table and four chairs. */
function booth(O, f, r) {
  const H = 1.5;
  const panel = (dir, at, a0, a1) => {
    if (dir === 'x') {
      O.box('ofPartition', a0, at - 0.03, f, a1, at + 0.03, f + H, { name: 'partition' });
      O.box('ofPartitionFrame', a0, at - 0.035, f + H - 0.04, a1, at + 0.035, f + H, { name: 'partition' });
    } else {
      O.box('ofPartition', at - 0.03, a0, f, at + 0.03, a1, f + H, { name: 'partition' });
      O.box('ofPartitionFrame', at - 0.035, a0, f + H - 0.04, at + 0.035, a1, f + H, { name: 'partition' });
    }
    const n = Math.round((a1 - a0) / 0.9);
    for (let i = 1; i < n; i += 1) {
      const a = a0 + ((a1 - a0) * i) / n;
      if (dir === 'x') {
        O.fine('ofPartitionFrame', a - 0.012, at - 0.036, f, a + 0.012, at + 0.036, f + H, 'partition joint');
      } else {
        O.fine('ofPartitionFrame', at - 0.036, a - 0.012, f, at + 0.036, a + 0.012, f + H, 'partition joint');
      }
    }
  };
  panel('y', 15.0, 1.3, 4.6);
  panel('x', 4.6, 15.0, 17.6);
  panel('x', 4.6, 18.6, 19.0);
  panel('y', 19.0, 1.3, 4.6);
  O.cap('ofWhite', [17.0, 2.9, f + 0.69], [17.0, 2.9, f + 0.72], 0.5, { name: 'round table', seg: 14 });
  O.cap('ofSteel', [17.0, 2.9, f], [17.0, 2.9, f + 0.69], 0.04, { name: 'round table', seg: 6 });
  O.cap('ofSteel', [17.0, 2.9, f], [17.0, 2.9, f + 0.03], 0.25, { name: 'round table foot', seg: 10 });
  chair(O, 17.0, 2.0, 'n', { f });
  chair(O, 17.0, 3.8, 's', { f });
  chair(O, 16.1, 2.9, 'e', { f });
  chair(O, 17.9, 2.9, 'w', { f });
  O.fine('ofPaper', 16.8, 2.7, f + 0.72, 17.1, 2.95, f + 0.73, 'papers');
  O.cap('ofWhite', [17.25, 3.1, f + 0.72], [17.25, 3.1, f + 0.8], 0.04, { fine: true, seg: 6, name: 'cup' });
  O.sign('meetingBooth', 18.1, 4.64, f + 1.25, 0.6, 0.2, 'n');
  O.sign('posterTeam', 15.04, 3.0, f + 1.05, 0.5, 0.6, 'e', { lift: 0.002 });
}

/* The tea kitchen: the counter, its sink, the kettle, the microwave, the
 * fridge, the cups on a shelf, and the noren over its door. */
function kitchen(O, f, r) {
  const x0 = 12.06;
  const x1 = 14.94;
  O.box('ofWhite', x0, 14.4, f, x1, DEP, f + 0.85, { name: 'counter' });
  O.box('ofChrome', x0, 14.4, f + 0.85, x1, DEP, f + 0.88, { name: 'counter' });
  O.paint('ofSteel', 12.4, 14.5, f + 0.88, 13.1, 14.9, f + 0.885, 'sink');
  O.cap('ofChrome', [12.75, 14.95, f + 0.88], [12.75, 14.8, f + 1.15], 0.015, { fine: true, seg: 5, name: 'tap' });
  O.box('ofWhite', 13.4, 14.55, f + 0.88, 13.9, 14.95, f + 1.18, { name: 'microwave' });
  O.fine('ofBlack', 13.45, 14.54, f + 0.93, 13.75, 14.55, f + 1.13, 'microwave door');
  O.cap('ofRed', [14.3, 14.7, f + 0.88], [14.3, 14.7, f + 1.08], 0.08, { name: 'kettle', seg: 8 });
  O.box('ofWhite', 14.25, 12.0, f, 14.94, 12.7, f + 1.5, { name: 'fridge' });
  O.fine('ofSteel', 14.24, 12.1, f + 0.9, 14.25, 12.6, f + 0.92, 'fridge seam');
  O.box('ofWood', x0, 14.75, f + 1.6, x1, DEP, f + 1.63, { name: 'shelf' });
  for (let x = 12.2; x < 14.8; x += 0.16) {
    O.cap(r.pick(['ofWhite', 'ofRed', 'ofTeal', 'ofYellow', 'ofNoren']), [x, 14.88, f + 1.63], [x, 14.88, f + 1.72], 0.04, { fine: true, seg: 6, name: 'cup' });
  }
  O.box('ofWhite', 12.1, 14.85, f + 1.7, 12.6, DEP, f + 2.05, { name: 'water heater' });
  O.box('ofLamp', 12.9, 13.2, C2 - 0.03, 14.1, 13.5, C2, { name: 'light' });
  O.sign('kyutoshitsu', 13.2, CORE_FACE - 0.02, f + 2.3, 0.6, 0.16, 's');
  O.sign('noren', 13.2, CORE_FACE - 0.05, f + 1.8, 1.0, 0.62, 's', { lift: 0.0 });
  O.paint('ofCarpetB', 12.1, 12.0, f, 14.9, 14.4, f + 0.008, 'kitchen floor');
}

/* ------------------------------------------------------------------ */
/* The management floor                                                */
/* ------------------------------------------------------------------ */

/* A block of cubicles: rows of `n` along px from x0, each 1.8 square, the
 * first row open south and the second open north, back to back on yc, the
 * partitions 1.5 m tall, an L of desk in each. */
function cubicles(O, x0, yc, n, f, r) {
  const W = 1.8;
  const H = 1.5;
  const x1 = x0 + n * W;
  O.box('ofPartition', x0, yc - 0.025, f, x1, yc + 0.025, f + H, { name: 'partition' });
  O.box('ofPartitionFrame', x0, yc - 0.03, f + H - 0.04, x1, yc + 0.03, f + H, { name: 'partition' });
  for (let i = 0; i <= n; i += 1) {
    const x = x0 + i * W;
    const a = i === n ? x - 0.05 : (i === 0 ? x : x - 0.025);
    O.box('ofPartition', a, yc - W, f, a + 0.05, yc + W, f + H, { name: 'partition' });
    O.box('ofPartitionFrame', a - 0.005, yc - W, f + H - 0.04, a + 0.055, yc + W, f + H, { name: 'partition' });
  }
  for (let i = 0; i < n; i += 1) {
    const a = x0 + i * W + 0.025;
    const b = a + W - 0.05;
    desk(O, a, yc - 0.65, b, yc - 0.025, 's', r, { f, mirror: i % 2 === 0 });
    desk(O, a, yc + 0.025, b, yc + 0.65, 'n', r, { f, mirror: i % 2 === 1 });
    if (r.chance(0.85)) {
      chair(O, (a + b) / 2 + r.range(-0.3, 0.3), yc - 1.15, 'n', { f });
    }
    if (r.chance(0.85)) {
      chair(O, (a + b) / 2 + r.range(-0.3, 0.3), yc + 1.15, 's', { f });
    }
    /* A pinned sheet or two on the partition over each desk. */
    O.sign(r.pick(['memo', 'memo2', 'calendar']), a + 0.5, yc - 0.03, f + 1.15, 0.3, 0.38, 's', { lift: 0.002 });
    O.sign(r.pick(['memo', 'memo2', 'posterTeam']), b - 0.5, yc + 0.03, f + 1.15, 0.3, 0.38, 'n', { lift: 0.002 });
  }
  return x1;
}

function managementFloor(O) {
  const fl = FLOORS[2];
  const f = fl.f;
  const r = seededRandom(8104);
  O.chunk = fl.chunk;
  O.box('ofCarpetWarm', 0, 0, F3 - 0.01, LEN, CORE_FACE, F3, { name: 'carpet', cast: false, solid: false });
  ceiling(O, f, fl.c, [[0, 10, 0, 11.8], [10, 17, 5.5, 11.8], [17, 24, 6.5, 11.8]]);
  /* The cubicles, two blocks of four. */
  cubicles(O, 1.0, 3.2, 4, f, r);
  cubicles(O, 1.0, 8.4, 4, f, r);
  cabinets(O, 'y', 1.0, 10.6, 0.0, 0.45, 0.75, f, r, 1);
  plant(O, 9.3, 0.6, f, r);
  plant(O, 9.3, 11.2, f, r);
  /* The meeting room's glass walls, the long table, the screen. */
  meetingRoom(O, f, r);
  /* The president's room. */
  presidentsRoom(O, f, r);
  /* General affairs: an island, the shredder, the reception counter by
   * the lift. */
  island(O, 10.6, 9.0, 3, f, r);
  O.box('ofWood', 6.4, 10.55, f, 8.4, 11.05, f + 1.0, { name: 'reception counter' });
  O.box('ofWoodDark', 6.35, 10.5, f + 1.0, 8.45, 11.1, f + 1.04, { name: 'reception counter' });
  O.sign('uketsuke', 7.4, 10.48, f + 0.65, 0.7, 0.2, 's');
  O.fine('ofChrome', 7.9, 10.7, f + 1.04, 8.05, 10.85, f + 1.1, 'bell');
  O.box('ofWhite', 15.2, 11.25, f, 15.75, CORE_FACE, f + 0.75, { name: 'shredder' });
  /* The lounge corner: a sofa, a low table, magazines, a big plant, a
   * coat stand. */
  sofa(O, 18.0, 10.4, 21.0, 11.2, f, 's', 'ofSofa');
  O.box('ofWood', 18.6, 8.8, f, 20.4, 9.6, f + 0.45, { name: 'low table' });
  O.fine('ofBinderRed', 18.8, 9.0, f + 0.45, 19.2, 9.3, f + 0.47, 'magazine');
  O.fine('ofPaper', 19.3, 9.1, f + 0.45, 19.7, 9.45, f + 0.465, 'magazine');
  plant(O, 23.4, 11.2, f, r);
  plant(O, 17.4, 11.3, f, r);
  O.cap('ofWoodDark', [22.6, 8.0, f], [22.6, 8.0, f + 1.75], 0.03, { name: 'coat stand', seg: 6 });
  O.cap('ofWoodDark', [22.6, 8.0, f], [22.6, 8.0, f + 0.04], 0.22, { name: 'coat stand', seg: 8 });
  O.cap('ofSofa', [22.5, 8.0, f + 1.0], [22.5, 8.0, f + 1.65], 0.12, { fine: true, seg: 6, name: 'coat' });
  cabinets(O, 'y', 7.0, 9.8, LEN - 0.45, LEN, 1.8, f, r, -1);
  O.sign('clock', 4.0, CORE_FACE - 0.02, f + 2.3, 0.34, 0.34, 's');
  O.sign('posterSafety', 11.0, CORE_FACE - 0.02, f + 1.6, 0.6, 0.85, 's');
  O.sign('poster', 9.98, 8.0, f + 1.6, 0.5, 0.7, 'w');
  extinguisher(O, 4.4, CORE_FACE - 0.2, f, 's');
  /* The north rooms: the toilets, and the break room through its wide
   * door: two vending machines, a table and stools, a bench, a TV. */
  O.wall('ofWallIn', 'x', CORE_Y, SHAFT.x1 + 0.2, LEN, F3, C3, CORE_T, [[13.0, 15.0, F3 - 0.05, F3 + 2.1]], 'north rooms');
  O.wall('ofWallIn', 'y', 12.0, CORE_Y, DEP, F3, C3, 0.12, [], 'break room wall');
  northDoors(O, f, ['wcM', 'wcW', null, null]);
  breakRoom(O, f, r);
}

/* A sofa: the seat box, the back along the side away from `face`, the arms. */
function sofa(O, x0, y0, x1, y1, f, face, m) {
  O.box(m, x0, y0, f, x1, y1, f + 0.42, { name: 'sofa' });
  const back = {
    s: [x0, y1 - 0.2, x1, y1], n: [x0, y0, x1, y0 + 0.2], e: [x0, y0, x0 + 0.2, y1], w: [x1 - 0.2, y0, x1, y1],
  }[face];
  O.box(m, back[0], back[1], f + 0.42, back[2], back[3], f + 0.85, { name: 'sofa back' });
  if (face === 's' || face === 'n') {
    O.box(m, x0, y0, f + 0.42, x0 + 0.15, y1, f + 0.62, { name: 'sofa arm' });
    O.box(m, x1 - 0.15, y0, f + 0.42, x1, y1, f + 0.62, { name: 'sofa arm' });
    for (let x = x0 + 0.15 + (x1 - x0 - 0.3) / 3; x < x1 - 0.2; x += (x1 - x0 - 0.3) / 3) {
      O.fine('ofBlack', x - 0.006, y0 - 0.004, f + 0.25, x + 0.006, y1, f + 0.426, 'cushion seam');
    }
  } else {
    O.box(m, x0, y0, f + 0.42, x1, y0 + 0.15, f + 0.62, { name: 'sofa arm' });
    O.box(m, x0, y1 - 0.15, f + 0.42, x1, y1, f + 0.62, { name: 'sofa arm' });
  }
}

function meetingRoom(O, f, r) {
  const X = 10.0;
  const Y = 5.5;
  const X1 = 17.0;
  const H = C3 - F3;
  /* Glass on two sides, framed every 1.2 m, a frosted band at eye
   * height, and the door. */
  const glassWall = (dir, at, a0, a1, door0) => {
    const n = Math.round((a1 - a0) / 1.2);
    const u = (a1 - a0) / n;
    for (let i = 0; i <= n; i += 1) {
      const a = a0 + i * u;
      if (dir === 'x') {
        O.box('ofFrame', a - 0.03, at - 0.04, f, a + 0.03, at + 0.04, f + H, { name: 'glass frame' });
      } else {
        O.box('ofFrame', at - 0.04, a - 0.03, f, at + 0.04, a + 0.03, f + H, { name: 'glass frame' });
      }
    }
    for (let i = 0; i < n; i += 1) {
      const b0 = a0 + i * u + 0.03;
      const b1 = a0 + (i + 1) * u - 0.03;
      const isDoor = door0 !== null && b0 < door0 + 0.5 && b1 > door0;
      const lo = isDoor ? 2.1 : 0;
      if (dir === 'x') {
        O.box('ofFrame', b0, at - 0.04, f + lo, b1, at + 0.04, f + lo + 0.05, { name: 'glass frame' });
        O.hidden(b0, at - 0.01, f + lo + 0.05, b1, at + 0.01, f + H, 'glass');
      } else {
        O.box('ofFrame', at - 0.04, b0, f + lo, at + 0.04, b1, f + lo + 0.05, { name: 'glass frame' });
        O.hidden(at - 0.01, b0, f + lo + 0.05, at + 0.01, b1, f + H, 'glass');
      }
      if (isDoor) {
        continue;
      }
      const c = (b0 + b1) / 2;
      const faces = dir === 'x' ? ['n', 's'] : ['e', 'w'];
      for (const [k, side] of [[0, 1], [1, -1]]) {
        const p = at + side * 0.015;
        const sx = dir === 'x' ? c : p;
        const sy = dir === 'x' ? p : c;
        O.sign('glass', sx, sy, f + 1.4, b1 - b0, H - 0.1, faces[k], { lift: 0.002 });
        O.sign('frost', sx, sy, f + 1.2, b1 - b0, 0.3, faces[k], { lift: 0.004 });
      }
    }
  };
  glassWall('x', Y, X, X1, 15.6);
  glassWall('y', X, 0.0, Y, null);
  /* The wall to the president's room, solid, with the screen on it. */
  O.wall('ofWallInB', 'y', X1, 0, 6.5, F3, C3, 0.12, [], 'meeting wall');
  O.box('ofMonitor', X1 - 0.12, 1.9, f + 1.0, X1 - 0.06, 3.6, f + 1.95, { name: 'screen' });
  O.sign('presentation', X1 - 0.125, 2.75, f + 1.475, 1.6, 0.85, 'w', { glow: true, lift: 0.002 });
  /* The long table on post legs, open end to end, and its chairs. */
  const T = { x0: 11.0, x1: 16.0, y0: 2.1, y1: 3.4 };
  O.box('ofWoodDark', T.x0, T.y0, f + 0.69, T.x1, T.y1, f + 0.72, { name: 'table' });
  for (const x of [T.x0 + 0.1, (T.x0 + T.x1) / 2, T.x1 - 0.1]) {
    for (const y of [T.y0 + 0.1, T.y1 - 0.1]) {
      O.cap('ofSteel', [x, y, f], [x, y, f + 0.69], 0.03, { name: 'table leg', seg: 6 });
    }
  }
  for (let x = T.x0 + 0.55; x < T.x1 - 0.3; x += 1.0) {
    chair(O, x + r.range(-0.1, 0.1), T.y0 - 0.5, 'n', { f, seat: 'ofChair' });
    chair(O, x + r.range(-0.1, 0.1), T.y1 + 0.5, 's', { f, seat: 'ofChair' });
    O.fine('ofPaper', x - 0.1, T.y0 + 0.15, f + 0.72, x + 0.12, T.y0 + 0.45, f + 0.725, 'papers');
    O.cap('ofWhite', [x + 0.2, T.y1 - 0.25, f + 0.72], [x + 0.2, T.y1 - 0.25, f + 0.8], 0.035, { fine: true, seg: 6, name: 'cup' });
  }
  chair(O, T.x0 - 0.3, (T.y0 + T.y1) / 2, 'e', { f, seat: 'ofChairBoss', tall: true });
  O.box('ofWhite', X + 0.4, 4.7, f + 0.9, X + 2.2, 4.76, f + 1.9, { name: 'whiteboard' });
  O.box('ofSteel', X + 0.4, 4.76, f + 0.88, X + 2.2, 4.8, f + 0.9, { name: 'whiteboard tray' });
  for (const x of [X + 0.5, X + 2.1]) {
    O.cap('ofSteel', [x, 4.78, f], [x, 4.78, f + 1.9], 0.02, { name: 'whiteboard leg', seg: 5 });
  }
  O.sign('scribbles', X + 1.3, 4.69, f + 1.4, 1.75, 0.95, 's', { lift: 0.002 });
  plant(O, X + 0.4, 0.6, f, r);
  O.sign('kaigishitsu', 16.1, Y + 0.05, f + 2.3, 0.6, 0.16, 'n');
}

function presidentsRoom(O, f, r) {
  const X = 17.0;
  const Y = 6.5;
  O.wall('ofWallInB', 'x', Y, X - 0.06, LEN, F3, C3, 0.12, [[18.0, 19.0, F3 - 0.05, F3 + 2.1]], 'president wall');
  O.box('ofCarpetRed', X + 0.06, 0, F3, LEN, Y - 0.06, F3 + 0.008, { name: 'rug', solid: false, cast: false });
  /* The door, stood open into the room. */
  O.box('ofWoodDark', 18.95, Y - 0.06 - 0.9, f + 0.02, 19.0, Y - 0.06, f + 2.05, { name: 'door' });
  O.fine('ofChrome', 18.9, Y - 0.86, f + 1.0, 18.95, Y - 0.8, f + 1.05, 'door handle');
  O.sign('shachoshitsu', 18.5, Y + 0.07, f + 2.3, 0.6, 0.16, 'n');
  /* The desk, closed to the floor at the front, the big chair behind it
   * with its back to the windows. */
  O.box('ofWoodDark', 19.2, 1.7, f + 0.71, 21.4, 2.6, f + 0.75, { name: 'desk' });
  O.box('ofWoodDark', 19.25, 2.5, f, 21.35, 2.6, f + 0.71, { name: 'desk' });
  O.box('ofWoodDark', 19.25, 1.75, f, 19.7, 2.55, f + 0.71, { name: 'desk' });
  O.box('ofWoodDark', 20.9, 1.75, f, 21.35, 2.55, f + 0.71, { name: 'desk' });
  O.fine('ofLeather', 19.8, 1.9, f + 0.75, 20.8, 2.4, f + 0.755, 'blotter');
  O.fine('ofChrome', 21.0, 2.3, f + 0.75, 21.2, 2.5, f + 0.95, 'desk lamp');
  O.sign('nameplateBoss', 20.3, 2.62, f + 0.82, 0.36, 0.08, 'n', { lift: 0.0 });
  chair(O, 20.3, 1.15, 'n', { f, tall: true, seat: 'ofLeather' });
  /* The sofas facing each other over the low table: the place a visitor
   * is received. */
  sofa(O, 17.6, 3.5, 18.4, 5.6, f, 'e', 'ofLeather');
  sofa(O, 21.8, 3.5, 22.6, 5.6, f, 'w', 'ofLeather');
  O.box('ofWoodDark', 19.1, 4.0, f, 21.1, 5.1, f + 0.42, { name: 'low table' });
  O.box('ofWood', 19.05, 3.95, f + 0.42, 21.15, 5.15, f + 0.45, { name: 'low table' });
  O.cap('ofWhite', [19.6, 4.5, f + 0.45], [19.6, 4.5, f + 0.5], 0.045, { fine: true, seg: 6, name: 'teacup' });
  O.cap('ofWhite', [20.6, 4.6, f + 0.45], [20.6, 4.6, f + 0.5], 0.045, { fine: true, seg: 6, name: 'teacup' });
  /* The bookcase, the trophies and the big daruma, the scroll, the golf
   * bag in the corner. */
  O.box('ofWoodDark', LEN - 0.4, 0.6, f, LEN, 3.2, f + 1.9, { name: 'bookcase' });
  for (const h of [0.35, 0.8, 1.25, 1.7]) {
    let y = 0.7;
    while (y < 3.05) {
      const w = r.range(0.04, 0.09);
      O.fine(r.pick(['ofBinderBlue', 'ofBinderRed', 'ofWood', 'ofPaper', 'ofBinderGreen', 'ofBlack']), LEN - 0.412, y, f + h - 0.3, LEN - 0.4, y + w, f + h - r.range(0.02, 0.1), 'book');
      y += w + 0.01;
    }
  }
  O.cap('ofYellow', [LEN - 0.2, 1.0, f + 1.9], [LEN - 0.2, 1.0, f + 2.15], 0.05, { name: 'trophy', seg: 6 });
  O.cap('ofYellow', [LEN - 0.2, 1.4, f + 1.9], [LEN - 0.2, 1.4, f + 2.05], 0.04, { name: 'trophy', seg: 6 });
  O.cap('ofRed', [LEN - 0.2, 2.5, f + 2.05], [LEN - 0.2, 2.5, f + 2.15], 0.15, { name: 'daruma', look: 'capsule', seg: 10 });
  O.sign('daruma', LEN - 0.36, 2.5, f + 2.12, 0.24, 0.24, 'w', { lift: 0.0 });
  O.sign('scroll', 20.6, Y - 0.07, f + 1.5, 0.55, 1.4, 's');
  O.cap('ofBlack', [23.6, 5.9, f], [23.65, 5.85, f + 1.0], 0.12, { name: 'golf bag', seg: 8 });
  for (const dy of [-0.04, 0.0, 0.04]) {
    O.cap('ofChrome', [23.65, 5.85 + dy, f + 1.0], [23.68, 5.85 + dy, f + 1.2], 0.015, { fine: true, seg: 4, name: 'club' });
  }
  plant(O, 17.5, 0.6, f, r);
  O.sign('calligraphy', X + 0.08, 2.0, f + 1.6, 0.9, 0.5, 'e');
}

function breakRoom(O, f, r) {
  O.paint('ofCarpetB', 12.1, 12.0, f, LEN, DEP, f + 0.008, 'break room floor');
  for (const [x0, key] of [[16.0, 'vendDrinks'], [17.0, 'vendCoffee']]) {
    O.box('ofVend', x0, 14.2, f, x0 + 0.95, DEP, f + 1.83, { name: 'vending machine' });
    O.sign(key, x0 + 0.475, 14.19, f + 1.15, 0.8, 1.2, 's', { glow: true, lift: 0.004 });
    O.fine('ofBlack', x0 + 0.2, 14.18, f + 0.2, x0 + 0.75, 14.2, f + 0.4, 'vending slot');
  }
  O.box('ofWhite', 17.95, 14.25, f, 18.5, 14.95, f + 0.85, { name: 'bin' });
  O.fine('ofBinderBlue', 18.0, 14.24, f + 0.6, 18.45, 14.25, f + 0.8, 'bin lid');
  /* A table, its stools, a bench along the east wall, a TV. */
  O.box('ofWhite', 19.6, 12.8, f + 0.7, 21.2, 13.7, f + 0.73, { name: 'table' });
  O.cap('ofSteel', [20.4, 13.25, f], [20.4, 13.25, f + 0.7], 0.04, { name: 'table', seg: 6 });
  O.box('ofSteel', 20.1, 13.0, f, 20.7, 13.5, f + 0.03, { name: 'table foot' });
  for (const [x, y] of [[19.3, 13.25], [21.5, 13.25], [20.0, 12.4], [20.8, 14.1]]) {
    O.cap('ofSteel', [x, y, f], [x, y, f + 0.42], 0.025, { name: 'stool', seg: 6 });
    O.cap('ofOrange', [x, y, f + 0.42], [x, y, f + 0.47], 0.17, { name: 'stool', seg: 10 });
  }
  O.box('ofWood', LEN - 0.45, CORE_Y + CORE_T / 2, f, LEN, DEP, f + 0.42, { name: 'bench' });
  O.box('ofMonitor', 22.0, DEP - 0.08, f + 1.4, 23.4, DEP, f + 2.2, { name: 'tv' });
  O.sign('tvShow', 22.7, DEP - 0.085, f + 1.8, 1.3, 0.72, 's', { glow: true, lift: 0.002 });
  O.box('ofLamp', 15.5, 13.2, C3 - 0.03, 16.7, 13.5, C3, { name: 'light' });
  O.box('ofLamp', 20.0, 13.2, C3 - 0.03, 21.2, 13.5, C3, { name: 'light' });
  O.sign('kyukeishitsu', 14.0, CORE_FACE - 0.02, f + 2.3, 0.6, 0.16, 's');
  O.sign('posterTrip', 13.2, DEP - 0.02, f + 1.5, 0.6, 0.85, 's');
  plant(O, 12.5, 14.6, f, r);
}

/* ------------------------------------------------------------------ */
/* The roof                                                            */
/* ------------------------------------------------------------------ */

function roof(O) {
  O.chunk = 'ofRoof';
  const r = seededRandom(8105);
  const f = ROOF;
  /* The green waterproofing, a walkway of pavers, the drains. */
  O.paint('ofRoof', 0, 0, f, LEN, CORE_FACE, f + 0.01, 'roof');
  O.paint('ofRoof', SHAFT.x1 + 0.2, CORE_FACE, f, LEN, DEP, f + 0.01, 'roof');
  for (let x = 9.0; x < 22; x += 0.65) {
    O.paint('ofRoofEdge', x, 6.0, f + 0.01, x + 0.6, 6.6, f + 0.05, 'paver');
  }
  for (const [x, y] of [[0.4, 0.4], [23.6, 0.4], [23.6, 14.6]]) {
    O.paint('ofBlack', x - 0.12, y - 0.12, f + 0.01, x + 0.12, y + 0.12, f + 0.02, 'drain');
  }
  /* The parapet's inside face. */
  O.face('ofRoofEdge', 'x', 0, 1, 0, LEN, f, PARA);
  O.face('ofRoofEdge', 'x', DEP, -1, SHAFT.x1 + 0.2, LEN, f, PARA);
  O.face('ofRoofEdge', 'y', LEN, -1, 0, DEP, f, PARA);
  O.face('ofRoofEdge', 'y', 0, 1, 0, CORE_FACE, f, PARA);
  /* The water tank on its stand: four legs and a frame, the panel tank
   * over them, its ladder. */
  const W = { x0: 14.0, x1: 16.6, y0: 9.4, y1: 12.0 };
  for (const [x, y] of [[W.x0, W.y0], [W.x1, W.y0], [W.x0, W.y1], [W.x1, W.y1]]) {
    O.cap('ofSteelOut', [x, y, f], [x, y, f + 1.5], 0.06, { name: 'tank leg', seg: 6 });
  }
  O.box('ofSteelOut', W.x0 - 0.06, W.y0 - 0.06, f + 1.42, W.x1 + 0.06, W.y1 + 0.06, f + 1.5, { name: 'tank frame' });
  O.box('ofTank', W.x0 + 0.05, W.y0 + 0.05, f + 1.5, W.x1 - 0.05, W.y1 - 0.05, f + 3.3, { name: 'water tank' });
  for (let x = W.x0 + 0.05 + 0.5; x < W.x1 - 0.1; x += 0.5) {
    O.paint('ofTankBlue', x - 0.01, W.y0 + 0.04, f + 1.5, x + 0.01, W.y0 + 0.05, f + 3.3, 'tank seam');
    O.paint('ofTankBlue', x - 0.01, W.y1 - 0.05, f + 1.5, x + 0.01, W.y1 - 0.04, f + 3.3, 'tank seam');
  }
  for (const h of [2.0, 2.5, 3.0]) {
    O.face('ofTankBlue', 'x', W.y0 + 0.05, -1, W.x0 + 0.05, W.x1 - 0.05, f + h - 0.01, f + h + 0.01);
  }
  O.sign('tank', (W.x0 + W.x1) / 2, W.y0 + 0.04, f + 2.75, 1.2, 0.36, 's');
  O.box('ofSteelOut', W.x1 + 0.06, W.y0 + 0.5, f, W.x1 + 0.1, W.y0 + 0.54, f + 3.4, { name: 'ladder' });
  O.box('ofSteelOut', W.x1 + 0.06, W.y0 + 0.9, f, W.x1 + 0.1, W.y0 + 0.94, f + 3.4, { name: 'ladder' });
  for (let h = 0.3; h < 3.3; h += 0.3) {
    O.fine('ofSteelOut', W.x1 + 0.07, W.y0 + 0.54, f + h, W.x1 + 0.09, W.y0 + 0.9, f + h + 0.03, 'rung');
  }
  /* The pipes from the tank down to the roof and across to the core. */
  O.cap('ofTankBlue', [14.3, W.y0 + 0.3, f + 1.5], [14.3, W.y0 + 0.3, f + 0.2], 0.05, { name: 'pipe', seg: 6 });
  O.cap('ofTankBlue', [14.3, W.y0 + 0.3, f + 0.2], [SHAFT.x1 + 0.4, W.y0 + 0.3, f + 0.2], 0.05, { name: 'pipe', seg: 6 });
  /* The air conditioners' outdoor units along the east parapet, on their
   * steel bases, each with its fan's grille, and their pipes. */
  for (let y = 1.0; y < 13.5; y += 1.45) {
    O.box('ofSteelOut', 22.7, y, f, 23.6, y + 1.0, f + 0.15, { name: 'ac base' });
    O.box('ofAc', 22.8, y + 0.05, f + 0.15, 23.5, y + 0.95, f + 0.8, { name: 'ac unit' });
    O.sign('fan', 22.79, y + 0.4, f + 0.48, 0.5, 0.5, 'w', { lift: 0.0 });
    O.fine('ofSteelOutDark', 22.79, y + 0.75, f + 0.2, 22.8, y + 0.9, f + 0.75, 'ac grille');
  }
  O.cap('ofSteel', [22.4, 1.2, f + 0.08], [22.4, 13.8, f + 0.08], 0.06, { name: 'ac pipes', seg: 6 });
  /* The company's name over the street on its steel frame: the panel
   * on posts, braced behind, a clear metre and three quarters under it. */
  const B = { x0: 2.0, x1: 14.0, y: 1.0, h0: f + 1.8, h1: f + 4.6 };
  O.box('ofBillboard', B.x0, B.y, B.h0, B.x1, B.y + 0.25, B.h1, { name: 'sign panel' });
  O.box('ofSteelOutDark', B.x0 - 0.05, B.y - 0.02, B.h0 - 0.05, B.x1 + 0.05, B.y + 0.27, B.h0, { name: 'sign frame' });
  O.box('ofSteelOutDark', B.x0 - 0.05, B.y - 0.02, B.h1, B.x1 + 0.05, B.y + 0.27, B.h1 + 0.05, { name: 'sign frame' });
  O.sign('roofSign', (B.x0 + B.x1) / 2, B.y - 0.01, (B.h0 + B.h1) / 2, B.x1 - B.x0 - 0.2, B.h1 - B.h0 - 0.2, 's', { lift: 0.0 });
  for (const x of [3.0, 8.0, 13.0]) {
    O.cap('ofSteelOutDark', [x, B.y + 0.4, f], [x, B.y + 0.4, B.h1], 0.07, { name: 'sign post', seg: 6 });
    O.cap('ofSteelOutDark', [x, B.y + 1.6, f], [x, B.y + 0.45, B.h1 - 0.2], 0.05, { name: 'sign brace', seg: 6 });
    O.box('ofSteelOutDark', x - 0.2, B.y + 0.2, f, x + 0.2, B.y + 1.8, f + 0.08, { name: 'sign foot' });
  }
  for (const h of [B.h0 + 0.7, B.h0 + 1.6, B.h0 + 2.5]) {
    O.cap('ofSteelOutDark', [B.x0 + 0.5, B.y + 0.4, h], [B.x1 - 0.5, B.y + 0.4, h], 0.035, { name: 'sign rail', seg: 5 });
  }
  /* Its lamps on arms, lighting it from below. */
  for (const x of [4.5, 8.0, 11.5]) {
    O.cap('ofSteelOutDark', [x, B.y + 0.1, B.h0 - 0.05], [x, B.y - 0.6, B.h0 - 0.25], 0.02, { fine: true, seg: 4, name: 'lamp arm' });
    O.box('ofSteelOutDark', x - 0.12, B.y - 0.7, B.h0 - 0.35, x + 0.12, B.y - 0.5, B.h0 - 0.2, { name: 'sign lamp' });
  }
  /* On the penthouse: the lightning rod, the aerial, the cat ladder. */
  O.cap('ofSteel', [1.0, 13.5, PHT], [1.0, 13.5, PHT + 2.2], 0.025, { name: 'lightning rod', seg: 5 });
  O.cap('ofSteel', [5.0, 14.0, PHT], [5.0, 14.0, PHT + 1.6], 0.025, { name: 'aerial', seg: 5 });
  for (const h of [1.1, 1.4]) {
    O.cap('ofSteel', [4.3, 14.0, PHT + h], [5.7, 14.0, PHT + h], 0.012, { fine: true, seg: 4, name: 'aerial' });
  }
  O.box('ofSteel', SHAFT.x1 + 0.2, 13.0, f, SHAFT.x1 + 0.25, 13.05, PHT + 0.9, { name: 'cat ladder' });
  O.box('ofSteel', SHAFT.x1 + 0.2, 13.45, f, SHAFT.x1 + 0.25, 13.5, PHT + 0.9, { name: 'cat ladder' });
  for (let h = f + 0.3; h < PHT + 0.8; h += 0.3) {
    O.fine('ofSteel', SHAFT.x1 + 0.2, 13.05, h, SHAFT.x1 + 0.24, 13.45, h + 0.025, 'rung');
  }
  O.sign('penthouseNo', 3.0, CORE_FACE - 0.02, ROOF + 2.4, 0.6, 0.3, 's');
  O.box('ofLamp', 5.2, CORE_FACE - 0.25, ROOF + 2.35, 5.6, CORE_FACE, ROOF + 2.45, { name: 'door lamp' });
  /* A few things left up here: a deck chair and its ashtray can, plants
   * in a styrofoam box. */
  O.box('ofTeal', 18.0, 3.0, f, 18.6, 4.5, f + 0.35, { name: 'deck chair' });
  O.box('ofTeal', 18.0, 4.3, f + 0.35, 18.6, 4.5, f + 0.9, { name: 'deck chair' });
  O.cap('ofRed', [19.0, 4.2, f], [19.0, 4.2, f + 0.45], 0.1, { name: 'can', seg: 8 });
  O.box('ofWhite', 9.5, 13.6, f, 11.0, 14.2, f + 0.3, { name: 'planter' });
  for (let x = 9.7; x < 10.9; x += 0.3) {
    O.cap(r.chance(0.5) ? 'ofLeaf' : 'ofLeafDark', [x, 13.9, f + 0.35], [x, 13.9, f + 0.45], 0.12, { solid: false, look: 'capsule', seg: 6, name: 'herbs' });
  }
}

/* ------------------------------------------------------------------ */
/* The fire escape                                                     */
/* ------------------------------------------------------------------ */

/*
 * The steel stair bolted to the east wall: a landing at every floor's fire
 * door, the flight up from it north along the outer lane to a half landing,
 * and the flight on up south along the inner lane against the wall. Guard
 * panels on the outside, corner posts to the ground, all the dark green
 * steel such stairs are painted.
 */
const FE = { x0: LEN + TW, xm: 25.4, x1: 26.55, y0: 9.9, y1: 11.7, m0: 14.0, m1: 15.2 };

function fireEscape(O) {
  O.chunk = 'ofOut';
  const m = 'ofSteelOut';
  const levels = [F1, F2, F3];
  for (let k = 0; k < 3; k += 1) {
    const f = levels[k];
    if (k > 0) {
      O.box(m, FE.x0, FE.y0, f - 0.12, FE.x1, FE.y1, f, { name: 'fire escape landing' });
    }
    if (k === 2) {
      /* The top landing's guard all round. */
      O.box(m, FE.x1 - 0.04, FE.y0, f, FE.x1, FE.y1, f + 1.1, { name: 'fire escape guard' });
      O.box(m, FE.x0, FE.y0 - 0.04, f, FE.x1, FE.y0, f + 1.1, { name: 'fire escape guard' });
      O.box(m, FE.x0, FE.y1, f, FE.x1, FE.y1 + 0.04, f + 1.1, { name: 'fire escape guard' });
      continue;
    }
    const R = levels[k + 1] - f;
    const run = FE.m0 - FE.y1;
    flight(O, 'y', FE.y1, 1, FE.xm, FE.x1, f, R / 2, run, { m, nose: 'ofSteelOutDark' });
    O.box(m, FE.x0, FE.m0, f + R / 2 - 0.12, FE.x1, FE.m1, f + R / 2, { name: 'fire escape landing' });
    flight(O, 'y', FE.m0, -1, FE.x0, FE.xm, f + R / 2, R / 2, run, { m, nose: 'ofSteelOutDark' });
    /* The outer guard: panels along the outer flight and round the half
     * landing, the handrail along the inner flight against the wall. */
    const n = 6;
    for (let i = 0; i < n; i += 1) {
      const y = FE.y1 + (run * i) / n;
      const h = f + (R / 2) * ((i + 1) / n);
      O.box(m, FE.x1 - 0.04, y, h - 0.1, FE.x1, y + run / n, h + 1.0, { name: 'fire escape guard' });
    }
    O.box(m, FE.x1 - 0.04, FE.m0, f + R / 2, FE.x1, FE.m1, f + R / 2 + 1.1, { name: 'fire escape guard' });
    O.box(m, FE.x0, FE.m1 - 0.04, f + R / 2, FE.x1, FE.m1, f + R / 2 + 1.1, { name: 'fire escape guard' });
    handrail(O, 'y', FE.m0, -1, FE.x0 + 0.06, f + R / 2, R / 2, run, 'ofSteelOutDark', 'ofSteelOutDark');
    O.box(m, FE.x1 - 0.04, FE.y0, f, FE.x1, FE.y1, f + 1.1, { name: 'fire escape guard' });
    O.box(m, FE.x0 + 1.0, FE.y0 - 0.04, f, FE.x1, FE.y0, f + 1.1, { name: 'fire escape guard' });
  }
  for (const [x, y] of [[FE.x1 - 0.06, FE.y0], [FE.x1 - 0.06, FE.m1 - 0.06]]) {
    O.box('ofSteelOutDark', x, y, 0, x + 0.08, y + 0.08, F3 + 1.1, { name: 'fire escape post' });
  }
  O.sign('fireEscape', FE.x1 + 0.005, FE.y0 + 0.9, F2 + 0.55, 0.9, 0.3, 'e', { lift: 0.0 });
}

/* ------------------------------------------------------------------ */
/* The street and the neighbours                                       */
/* ------------------------------------------------------------------ */

/* A utility pole: the concrete pole, its crossarms, the transformer, the
 * guard sleeve at its foot, its number plate. Returns the wire points. */
function pole(O, px, py, r, trans = false) {
  const H = 11.0;
  O.cap('ofPole', [px, py, 0], [px, py, H], 0.17, { name: 'utility pole', seg: 8, rTop: S * 0.12 });
  O.cap('ofYellow', [px, py, 0.3], [px, py, 2.1], 0.18, { fine: true, seg: 8, name: 'pole sleeve' });
  for (let h = 0.6; h < 2.0; h += 0.4) {
    O.cap('ofBlack', [px, py, h], [px, py, h + 0.18], 0.182, { fine: true, seg: 8, name: 'pole sleeve stripe' });
  }
  for (const h of [9.6, 10.4]) {
    O.box('ofSteelOutDark', px - 0.9, py - 0.05, h - 0.08, px + 0.9, py + 0.05, h, { name: 'crossarm' });
    for (const dx of [-0.75, 0, 0.75]) {
      O.cap('ofWhite', [px + dx, py, h], [px + dx, py, h + 0.14], 0.035, { fine: true, seg: 5, name: 'insulator' });
    }
  }
  if (trans) {
    O.cap('ofPole', [px, py - 0.4, 7.6], [px, py - 0.4, 8.7], 0.28, { name: 'transformer', seg: 10 });
    O.box('ofSteelOutDark', px - 0.06, py - 0.15, 7.9, px + 0.06, py, 8.4, { name: 'transformer bracket' });
  }
  for (let h = 2.6; h < 9; h += 0.45) {
    O.cap('ofSteelOutDark', [px - 0.25, py, h], [px + 0.25, py, h], 0.012, { fine: true, seg: 4, name: 'step bolt' });
  }
  O.sign('poleTag', px, py - 0.2, 3.2, 0.16, 0.38, 's', { lift: 0.0 });
  return [-0.75, 0, 0.75].flatMap((dx) => [[px + dx, py, 9.65], [px + dx, py, 10.45]]);
}

/* A wire hung between two points, sagging: segments of a parabola, drawn
 * only, a pilot's to dodge by eye. Nothing on the street is a hidden
 * trap. */
function wire(O, a, b, sag) {
  const n = 8;
  let prev = a;
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 4 * sag * t * (1 - t)];
    O.cap('ofWire', prev, p, 0.012, { solid: false, cast: false, seg: 4, name: 'wire' });
    prev = p;
  }
}

/* A neighbour: a block of `m` with windows painted on the faces a pilot
 * sees, air conditioners on brackets, drain pipes, a flat roof. */
function neighbour(O, x0, y0, x1, y1, h, m, faces, r, o = {}) {
  O.box(m, x0, y0, 0, x1, y1, h, { name: 'neighbour' });
  O.box('ofNbRoof', x0 - 0.05, y0 - 0.05, h, x1 + 0.05, y1 + 0.05, h + 0.25, { name: 'neighbour parapet' });
  const fh = o.fh ?? 3.0;
  for (const face of faces) {
    const along = face === 's' || face === 'n';
    const a0 = along ? x0 : y0;
    const a1 = along ? x1 : y1;
    const at = { s: y0, n: y1, w: x0, e: x1 }[face];
    const side = face === 'n' || face === 'e' ? 1 : -1;
    const dir = along ? 'x' : 'y';
    for (let fl = (o.shop ? 1 : 0); fl * fh + 1.0 < h - 0.8; fl += 1) {
      const c0 = fl * fh + (fl === 0 ? 0.9 : 0.9);
      const c1 = c0 + 1.3;
      for (let a = a0 + 0.8; a < a1 - 1.6; a += o.pitch ?? 2.6) {
        if (r.chance(o.blank ?? 0.12)) {
          continue;
        }
        const w = o.win ?? 1.4;
        O.face('ofSash', dir, at, side, a - 0.05, a + w + 0.05, c0 - 0.05, c1 + 0.05);
        O.face(r.chance(0.15) ? 'ofScreenWarm' : 'ofNbWindow', dir, at + side * 0.012, side, a, a + w, c0, c1);
        if (r.chance(0.3)) {
          O.face('ofBlind', dir, at + side * 0.024, side, a, a + w, c1 - r.range(0.3, 0.9), c1, true);
        }
        if (r.chance(o.ac ?? 0.2)) {
          const ax = a + w + 0.15;
          O.onWall('ofAc', dir, at, side, ax, ax + 0.75, c0 - 0.2, c0 + 0.4, 0.3, { name: 'ac unit' });
        }
      }
      O.face('ofNbRoof', dir, at, side, a0, a1, (fl + 1) * fh - 0.15, (fl + 1) * fh);
    }
    if (o.pipes) {
      O.onWall('ofPole', dir, at, side, a1 - 0.6, a1 - 0.48, 0, h, 0.12, { name: 'drain pipe' });
    }
  }
}

function street(O) {
  O.chunk = 'ofOut';
  const r = seededRandom(8106);
  /* The street: asphalt, the gutters with their grates, the white edge
   * lines, the stop line and its word at the west end. */
  O.paint('ofAsphalt', PX0, -7.0, 0, PX1, -0.6, 0.02, 'road');
  O.paint('ofGutter', PX0, -0.6, 0, PX1, -0.25, 0.04, 'gutter');
  O.paint('ofGutter', PX0, -7.4, 0, PX1, -7.0, 0.04, 'gutter');
  for (let x = PX0 + 0.5; x < PX1; x += 1.6) {
    O.fine('ofSteel', x, -0.55, 0.04, x + 0.6, -0.3, 0.045, 'grate');
    O.fine('ofSteel', x + 0.3, -7.35, 0.04, x + 0.9, -7.05, 0.045, 'grate');
  }
  O.paint('ofRoadLine', PX0, -1.0, 0.02, PX1, -0.88, 0.025, 'edge line');
  O.paint('ofRoadLine', PX0, -6.72, 0.02, PX1, -6.6, 0.025, 'edge line');
  O.paint('ofRoadLine', -3.2, -6.6, 0.02, -2.9, -1.0, 0.025, 'stop line');
  O.sign('tomare', -4.4, -3.8, 0.026, 2.0, 3.6, 'up', { lift: 0.0 });
  O.sign('manhole', 6.0, -3.6, 0.025, 0.7, 0.7, 'up', { lift: 0.0 });
  O.sign('manhole', 28.0, -4.2, 0.025, 0.7, 0.7, 'up', { lift: 0.0 });
  /* The alley's concrete, its channel, the strip between the building and
   * the west neighbour, the strip behind. */
  O.paint('ofGutter', LEN + TW, -0.25, 0, 30.0, 16.2, 0.03, 'alley');
  O.paint('ofSteel', 29.4, -0.25, 0.03, 29.7, 16.2, 0.035, 'channel');
  O.paint('ofGutter', -1.2, -0.25, 0, -TW, DEP + TW, 0.03, 'gap');
  O.paint('ofGutter', -1.2, DEP + TW, 0, LEN + TW, 16.2, 0.03, 'gap');
  /* The poles and the wires along the street, and the service drop to
   * the building. */
  const a = pole(O, -3.0, -0.75, r, false);
  const b = pole(O, 15.0, -0.75, r, true);
  const c = pole(O, 33.0, -0.75, r, false);
  for (let i = 0; i < a.length; i += 1) {
    wire(O, [PX0, a[i][1], a[i][2] - 0.3], a[i], 0.25);
    wire(O, a[i], b[i], 0.45);
    wire(O, b[i], c[i], 0.45);
    wire(O, c[i], [PX1, c[i][1], c[i][2] - 0.3], 0.25);
  }
  wire(O, [15.0, -0.75, 8.6], [19.0, -0.25, 9.6], 0.2);
  wire(O, [15.0, -0.75, 8.4], [19.4, -0.25, 9.4], 0.2);
  O.box('ofSteel', 18.8, -0.4, 9.2, 19.6, -0.25, 9.8, { name: 'service box' });
  /* The curve mirror at the alley's mouth. */
  O.cap('ofMirror', [27.6, -0.45, 0], [27.6, -0.45, 2.6], 0.04, { name: 'mirror pole', seg: 6 });
  O.cap('ofMirror', [27.6, -0.45, 2.85], [27.6, -0.6, 2.85], 0.34, { name: 'mirror', seg: 12 });
  O.sign('mirror', 27.6, -0.62, 2.85, 0.6, 0.6, 's', { lift: 0.0 });
  /* Two vending machines at the alley's mouth, lit, a recycling bin. */
  for (const [x0, key, m] of [[LEN + TW, 'vendDrinks', 'ofVendRed'], [LEN + TW + 0.95, 'vendTea', 'ofVendBlue']]) {
    O.box(m, x0, 0.05, 0, x0 + 0.95, 0.8, 1.83, { name: 'vending machine' });
    O.box('ofVend', x0 + 0.03, 0.02, 1.83, x0 + 0.92, 0.8, 1.9, { name: 'vending machine' });
    O.sign(key, x0 + 0.475, 0.04, 1.15, 0.82, 1.22, 's', { glow: true });
    O.fine('ofBlack', x0 + 0.2, 0.03, 0.15, x0 + 0.75, 0.05, 0.35, 'vending slot');
  }
  O.box('ofVend', 26.6, 0.1, 0, 27.0, 0.5, 0.85, { name: 'bin' });
  O.fine('ofVendBlue', 26.6, 0.09, 0.6, 27.0, 0.1, 0.8, 'bin label');
  /* The kei truck at the open shutter, its bed half unloaded. */
  keiTruck(O, 10.6, -2.75, r);
  /* Bicycles by the entrance and in the alley. */
  bike(O, 22.9, -0.9, 'y');
  bike(O, 23.3, -1.75, 'y');
  bike(O, 28.6, 3.0, 'y');
  /* The alley: an air conditioner unit or two on the building's wall, a
   * stack of crates, potted plants, the gas meters. */
  for (const [y, h] of [[2.0, 1.4], [5.0, 5.6], [7.0, 9.2]]) {
    O.box('ofSteelOutDark', LEN + TW, y, h - 0.06, LEN + TW + 0.35, y + 0.9, h, { name: 'ac bracket' });
    O.box('ofAc', LEN + TW, y, h, LEN + TW + 0.32, y + 0.85, h + 0.62, { name: 'ac unit' });
    O.sign('fan', LEN + TW + 0.33, y + 0.38, h + 0.32, 0.46, 0.46, 'e', { lift: 0.0 });
  }
  for (let k = 0; k < 3; k += 1) {
    O.box(k % 2 ? 'ofTankBlue' : 'ofYellow', 28.4, 6.0 + k * 0.02, k * 0.32, 29.2, 6.6, k * 0.32 + 0.31, { name: 'crate' });
  }
  for (const y of [8.0, 8.6, 13.0]) {
    O.cap('ofPot', [29.3, y, 0], [29.3, y, 0.3], 0.16, { name: 'pot', seg: 8 });
    O.cap('ofLeaf', [29.3, y, 0.45], [29.3, y, 0.55], 0.2, { solid: false, look: 'capsule', seg: 6, name: 'leaves' });
  }
  O.box('ofSteel', LEN + TW, 12.2, 0.8, LEN + TW + 0.2, 12.7, 1.2, { name: 'gas meter' });
  O.box('ofSteel', LEN + TW, 12.7, 0.8, LEN + TW + 0.2, 13.2, 1.2, { name: 'gas meter' });
  /* The building's own face to the street: its name over the entrance,
   * the plate with its address, the drain pipe, the mailbox. */
  O.sign('buildingName', 21.2, -TW - 0.02, 3.0, 2.6, 0.5, 's');
  O.sign('address', 23.6, -TW - 0.02, 1.6, 0.3, 0.12, 's');
  O.box('ofSteel', 23.7, -0.45, 0.9, 24.15, -TW, 1.4, { name: 'mailbox' });
  O.box('ofPole', LEN + 0.05, -0.37, 0, LEN + 0.17, -TW, PARA, { name: 'drain pipe' });
  /* The neighbours: west, north, east and the row across the street. */
  neighbour(O, PX0, -0.5, -1.2, 15.6, 15.5, 'ofNbGrey', ['e', 's'], r, { pipes: true, ac: 0.0, win: 0.9, pitch: 3.0 });
  neighbour(O, PX0, 16.2, PX1, PY1, 9.5, 'ofNbBrown', ['s'], r, { pipes: true, ac: 0.0, win: 0.8, pitch: 3.2, blank: 0.4 });
  neighbour(O, 30.0, -0.5, PX1, 16.2, 12.5, 'ofNbCream', ['w', 's'], r, { pipes: true, ac: 0.0, win: 0.9, pitch: 2.8, shop: true });
  across(O, r);
  /* The shop fronts of the neighbours on this side. */
  O.sign('fudosan', -4.1, -0.52, 2.9, 4.6, 0.7, 's');
  O.sign('listings', -4.1, -0.52, 1.5, 3.0, 1.4, 's');
  O.face('ofSash', 'x', -0.5, -1, -6.4, -1.8, 0.3, 2.4);
  O.sign('laundry', 33.5, -0.52, 2.9, 5.0, 0.7, 's', { glow: true });
  O.face('ofScreenWarm', 'x', -0.5, -1, 31.0, 36.0, 0.3, 2.4);
  for (let x = 31.4; x < 35.6; x += 0.8) {
    O.box('ofWhite', x, -0.2, 0, x + 0.7, 0.35, 0.85, { name: 'washer' });
    O.fine('ofNbWindow', x + 0.15, -0.21, 0.25, x + 0.55, -0.2, 0.65, 'washer door');
  }
}

/* The row across the street: a ramen shop with flats over it, a block of
 * flats with balconies and the washing out, and a mixed block with the
 * tenants' sign up its corner. */
function across(O, r) {
  const y1 = -7.4;
  /* The ramen shop. */
  neighbour(O, PX0, PY0, 5.0, y1, 10.5, 'ofNbCream', ['n'], r, { shop: true, fh: 3.5, ac: 0.4, pitch: 2.4 });
  O.box('ofNbBrown', -6.5, y1, 3.0, 4.5, y1 + 0.9, 3.15, { name: 'awning' });
  O.sign('ramenSign', -1.0, y1 + 0.02, 3.5, 6.0, 0.62, 'n');
  O.face('ofScreenWarm', 'x', y1, 1, -5.5, -2.0, 0.3, 2.6);
  O.face('ofWoodDark', 'x', y1, 1, -1.6, 0.4, 0.0, 2.6);
  O.sign('noren', -0.6, y1 + 0.05, 2.25, 1.8, 0.75, 'n', { lift: 0.0 });
  O.cap('ofLantern', [1.2, y1 + 0.35, 2.0], [1.2, y1 + 0.35, 2.55], 0.22, { name: 'lantern', look: 'capsule', seg: 10 });
  O.sign('chochin', 1.2, y1 + 0.58, 2.28, 0.32, 0.4, 'n', { lift: 0.0 });
  O.box('ofSteel', 2.0, y1, 0, 4.0, y1 + 0.5, 0.05, { name: 'step' });
  /* The flats: balconies on two floors, their rails, the washing poles. */
  neighbour(O, 5.0, PY0, 20.0, y1, 9.0, 'ofNbTeal', ['n'], r, { fh: 3.0, ac: 0.0, win: 1.6, pitch: 2.5 });
  for (const h of [3.0, 6.0]) {
    O.box('ofNbCream', 5.2, y1, h - 0.15, 19.8, y1 + 1.0, h, { name: 'balcony' });
    O.box('ofNbCream', 5.2, y1 + 0.95, h, 19.8, y1 + 1.0, h + 1.05, { name: 'balcony rail' });
    for (let x = 5.2; x < 19.8; x += 2.5) {
      O.box('ofNbCream', x, y1, h, x + 0.05, y1 + 1.0, h + 1.05, { name: 'balcony wall' });
      O.cap('ofSteel', [x + 0.3, y1 + 0.5, h + 1.7], [x + 2.2, y1 + 0.5, h + 1.7], 0.015, { fine: true, seg: 4, name: 'washing pole' });
      if (r.chance(0.7)) {
        for (let k = 0; k < 4; k += 1) {
          const wx0 = x + 0.4 + k * 0.45;
          O.fine(r.pick(['ofWhite', 'ofPink', 'ofBinderBlue', 'ofYellow', 'ofTeal']), wx0, y1 + 0.48, h + 1.05, wx0 + 0.35, y1 + 0.52, h + 1.68, 'washing');
        }
      }
      if (r.chance(0.5)) {
        O.box('ofAc', x + 1.7, y1 + 0.55, h, x + 2.45, y1 + 0.95, h + 0.6, { name: 'ac unit' });
      }
    }
  }
  O.sign('corpo', 12.5, y1 + 0.02, 1.9, 2.6, 0.6, 'n');
  /* The mixed block: the shop on the ground, the tenants' sign. */
  neighbour(O, 20.0, PY0, PX1, y1, 16.5, 'ofNbSalmon', ['n'], r, { shop: true, fh: 3.3, ac: 0.3, win: 1.8, pitch: 2.8 });
  O.box('ofYellow', 22.0, y1, 2.7, 34.0, y1 + 1.0, 2.85, { name: 'awning' });
  O.sign('mart', 28.0, y1 + 0.02, 3.3, 7.0, 0.7, 'n', { glow: true });
  O.face('ofScreenWarm', 'x', y1, 1, 22.5, 33.5, 0.3, 2.6);
  O.box('ofBillboard', 20.4, y1, 4.0, 20.7, y1 + 1.2, 15.0, { name: 'tenant sign' });
  O.sign('tenants', 20.39, y1 + 0.6, 9.5, 1.1, 10.6, 'w', { lift: 0.0 });
  O.sign('tenants', 20.71, y1 + 0.6, 9.5, 1.1, 10.6, 'e', { lift: 0.0 });
}

function keiTruck(O, x, y, r) {
  /* Nose east: the cab at the east end, the bed west of it. */
  const L = 3.4;
  const W = 1.48;
  O.hidden(x + 0.2, y + 0.15, 0, x + L - 0.2, y + W - 0.15, 0.4, 'truck');
  O.box('ofKei', x + 2.2, y, 0.4, x + L, y + W, 1.25, { name: 'truck cab' });
  O.box('ofKei', x + 2.2, y + 0.03, 1.25, x + L - 0.05, y + W - 0.03, 1.85, { name: 'truck cab' });
  O.face('ofNbWindow', 'y', x + L, 1, y + 0.1, y + W - 0.1, 1.28, 1.8);
  O.face('ofNbWindow', 'x', y, -1, x + 2.45, x + 3.25, 1.3, 1.8);
  O.face('ofNbWindow', 'x', y + W, 1, x + 2.45, x + 3.25, 1.3, 1.8);
  O.box('ofKei', x, y, 0.4, x + 2.2, y + W, 0.55, { name: 'truck bed' });
  O.box('ofKei', x, y, 0.55, x + 2.2, y + 0.04, 0.85, { name: 'truck gate' });
  O.box('ofKei', x, y + W - 0.04, 0.55, x + 2.2, y + W, 0.85, { name: 'truck gate' });
  O.box('ofKei', x, y, 0.55, x + 0.04, y + W, 0.85, { name: 'truck gate' });
  O.box('ofSteel', x + 2.15, y, 0.55, x + 2.2, y + W, 1.75, { name: 'truck guard' });
  for (const dx of [0.35, 2.55]) {
    for (const [y0, y1] of [[y - 0.02, y + 0.16], [y + W - 0.16, y + W + 0.02]]) {
      O.box('ofBlack', x + dx, y0, 0, x + dx + 0.5, y1, 0.5, { name: 'wheel' });
    }
  }
  O.box('ofSteel', x + L - 0.02, y + 0.1, 0.4, x + L + 0.05, y + W - 0.1, 0.55, { name: 'bumper' });
  O.sign('plate', x + L + 0.06, y + W / 2, 0.68, 0.33, 0.165, 'e', { lift: 0.0 });
  load(O, x + 0.1, y + 0.1, x + 1.3, y + W - 0.1, 0.55, 0.65, r, { labels: 0.5 });
}

/* A bicycle, parked: two wheels and a frame, drawn, one solid round it. */
function bike(O, px, py, axis) {
  const L = 1.7;
  const [x0, y0, x1, y1] = axis === 'x' ? [px - 0.25, py - L / 2, px + 0.25, py + L / 2] : [px - L / 2, py - 0.25, px + L / 2, py + 0.25];
  O.hidden(x0 + 0.15, y0 + 0.1, 0, x1 - 0.15, y1 - 0.1, 1.0, 'bike');
  const along = (t, h) => (axis === 'x' ? [px, y0 + L * t, h] : [x0 + L * t, py, h]);
  for (const t of [0.18, 0.82]) {
    const [cx, cy, ch] = along(t, 0.33);
    O.sign('wheel', cx, cy, ch, 0.66, 0.66, axis === 'x' ? 'e' : 'n', { lift: 0.0 });
    O.sign('wheel', cx, cy, ch, 0.66, 0.66, axis === 'x' ? 'w' : 's', { lift: 0.0 });
  }
  O.cap('ofBike', along(0.18, 0.33), along(0.45, 0.85), 0.02, { fine: true, seg: 4, name: 'bike frame' });
  O.cap('ofBike', along(0.45, 0.85), along(0.82, 0.35), 0.02, { fine: true, seg: 4, name: 'bike frame' });
  O.cap('ofBike', along(0.45, 0.85), along(0.75, 0.9), 0.02, { fine: true, seg: 4, name: 'bike frame' });
  O.cap('ofBlack', along(0.75, 0.95), along(0.75, 1.0), 0.06, { fine: true, seg: 5, name: 'saddle' });
  O.cap('ofSteel', along(0.2, 0.9), along(0.2, 1.05), 0.12, { fine: true, seg: 6, name: 'basket' });
}

/* ------------------------------------------------------------------ */
/* The layout                                                          */
/* ------------------------------------------------------------------ */

export function officeLayout() {
  const O = new Office();
  shell(O);
  core(O);
  groundFloor(O);
  salesFloor(O);
  managementFloor(O);
  roof(O);
  fireEscape(O);
  street(O);
  return { parts: O.P.list.slice(), signs: O.signs.slice(), prisms: [], discs: [], cones: [], scaled: [] };
}

/* The partners' signs, each the wall it hangs on: a point on the face in
 * plan terms, the way the face looks, and how wide it is hung in real
 * metres (./index.js turns them into the built map's `markSpots`). */
export const SIGN_SPOTS = [
  /* Over the goods-in floor's east wall, seen down the cross aisle. */
  { slug: 'gds', at: [LEN, 8.4, F1 + 2.8], n: [-1, 0], w: 1.3, chunk: 'of1' },
  /* The sales floor's west wall, between two frosted windows, the first
   * thing down the aisle from the start. */
  { slug: 'mantisfpv', at: [0, 4.8, F2 + 1.95], n: [1, 0], w: 1.3, chunk: 'of2' },
  /* The management floor's west wall, over the cubicles. */
  { slug: 'wcmrc', at: [0, 4.8, F3 + 2.0], n: [1, 0], w: 1.3, chunk: 'of3' },
  /* The penthouse's front, facing the roof. */
  { slug: 'webleedfpv', at: [2.4, CORE_FACE - 0.012, ROOF + 1.4], n: [0, -1], w: 1.3, chunk: 'ofRoof' },
  /* Konex Drone's, the one hidden sign: down the lift shaft, on its back
   * wall between the ground floor's door head and the first floor, so it
   * is seen by a pilot who takes the drop and by nobody else. */
  { slug: 'konexdrone', at: [(SHAFT.x0 + SHAFT.x1) / 2, SHAFT.y1, F1 + 3.0], n: [0, -1], w: 0.9, chunk: 'of1' },
];

/* The sign spots in the world frame: `p` on the face, `n` out of it. A plan
 * normal (nx, ny) is (nx, 0, -ny) in the three.js frame, where north is -z. */
export function signSpots() {
  return SIGN_SPOTS.map((s) => ({
    slug: s.slug, p: worldAt(...s.at), n: [s.n[0], 0, -s.n[1]], up: [0, 1, 0], w: S * s.w, chunk: s.chunk,
  }));
}

/*
 * THE TITLE SCREEN'S LINE AND THE PICTURE'S LENS. The built map's own
 * backdrop circles the field clear of the tallest thing near it, which here
 * is the building, so the title would show the street and a wall. So the
 * office hands over its own: a loop round the sales floor over the desks
 * and under the lights, and one lens for the board's picture and card, from
 * the window aisle across the islands to the kamidana and the schedule
 * board (src/share/orbit.js, placeCardCamera).
 */
const LOOP = { x: 10.6, y: 5.6, rx: 7.4, ry: 2.4, h: F2 + 1.85, n: 48 };
export function officeLoop() {
  const out = [];
  const sc = { s: 0, c: 1 };
  for (let i = 0; i < LOOP.n; i += 1) {
    sincos((i / LOOP.n) * Math.PI * 2, sc);
    const [x, y, z] = worldAt(LOOP.x + LOOP.rx * sc.c, LOOP.y + LOOP.ry * sc.s, LOOP.h);
    out.push({ x, y, z });
  }
  return out;
}
export const CARD_LENS = { eye: worldAt(19.6, 1.0, F2 + 2.2), at: worldAt(5.0, 10.0, F2 + 0.9) };

/* The loop's numbers, for scripts/office-check.js. */
export const TITLE_LOOP = LOOP;
