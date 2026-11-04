/*
 * warehouse.js: Thomas More's Shop, an exhibit builder's shop and
 * store, as the parts a built map holds. Pure data and arithmetic, no
 * Three.js, no JS trigonometry, so the solids can be built and checked in
 * plain Node.
 *
 * WHERE IT COMES FROM. The nineteen frames of Thomas More's own whoop
 * flight through the shop (the "Screenshot 2026-10-21" stills in
 * /mnt/project-files/tcmore-warehouse/) for everything in it, and since 3
 * November 2026 the 70 phone photos beside them for the building only:
 * which wall the dock doors are in, what the barani doorway opens into,
 * where the booth stands. The first build of 27 October read the photos
 * for the contents too, and a big exhibit booth stood in the shop when they
 * were taken, so nothing the photos show standing on the floor is drawn
 * unless the flight shows it too. No address, no map, no street view.
 *
 * WHAT THE FLIGHT AND THE PHOTOS SHOW, and so what this is. One tall hall
 * under a dark steel deck, open web joists across it and maroon girders
 * along it, a round silver duct down it, long white lights and two ceiling
 * fans, cream block walls and cream round columns. The north wall is the
 * dock wall: three white roller doors shut under grey headers, a green,
 * white and red stripe along it and orange ladders leant on it, a stack of
 * empty pallets and grey carpet rolls at its east end, and it runs to the
 * barani corner (the phone photo taken by the forklift looks along it, the
 * doors on its left, to the taped partition and the doorway at its far
 * end). Off its middle door the crate aisle runs south, the forklift parked
 * nose to the door: facing the doors, orange racking and crates on the
 * left and green racking piled with mouldings on the right (frame 8.12.25),
 * the grey carpet runner and the black panel wall standing in it; crates on
 * pallets along the west wall, crate stacks two and three high east of the
 * aisle and a cantilever rack of sheet stock along the dock lane. At the
 * aisle's south end the white office against the south wall, a French door
 * and a window, a red tool chest under the window and black shelving of
 * carpet rolls beside it; east of it the wood lined door out, a work cart,
 * a green ladder and the panel rack. In the middle the workshop: benches,
 * carts, a big table on trestles, white carcasses and wrapped panels on
 * pallets, teal racking with yellow cabinets along the south wall, plywood
 * stacked head high against the dock wall at the barani corner and a white
 * door standing open in it. Down the east side a partition of taped
 * drywall to the roof, teal and orange racking against it with a black
 * display box on top, and in it three ways through: the open doorway into
 * the paint shop, the grey sliding door, and at the north end the wide
 * opening into the machine room, Thomas's doorway to barani through, with a
 * white door and a cubby beside it. Behind it the spray room, its booth's
 * white hood over a dark filter wall with its back to the taped wall
 * between the rooms, drying racks and a big square duct; and the machine
 * room, long and wide (the photos taken in the doorway), dust collectors
 * with their socks one after another down the dock wall, two sliding table
 * saws, the stripe across its far wall.
 *
 * WHAT IS A GUESS. Neither source gives the plan from above or a single
 * measurement, so where the rooms stand relative to each other is read
 * from what each picture has on its left and right, and every length is a
 * reading; inside the machine room the machines are the kind the photos
 * show, not counted ones; and where the wood lined door leads is not
 * shown, so here it leads out.
 *
 * NO WORDS. The pictures show crate labels, signs and a name sprayed on
 * the booth. None of it is drawn: a label is a white patch, a sign a
 * coloured plate. The only marks on this map are the partners' signs
 * (./index.js).
 *
 * THE SCALE IS THE HOUSES'. Everything is three and a half times life size
 * (S, as in ../house/house.js), so a five inch flies it the way a whoop
 * flies the real shop. The plan below is in REAL metres and turned into the
 * world's by S once, in the helpers under it.
 *
 * THE PLAN'S FRAME. px runs east, py north, h up from the ground, real
 * metres, the origin the hall's south west corner inside on the slab. The
 * hall is 50 by 56 and 7 high. The dock wall is north, the office south
 * west, the partition and the two rooms behind it east.
 *
 * WHAT IS SOLID. Walls, the roof, columns, joists, racking, crates, benches,
 * machines and the lights, each drawn and solid from the same numbers
 * (../../props/parts.js). Paint is not solid. Every open door is a hole in
 * its wall, and a door the flight shows shut is a wall with a door painted
 * on it. Where a thing is a lattice too fine to fly (a drying rack's
 * shelves, a ladder's rungs, carpet rolls on wire shelving) the fine part is
 * drawn and not solid and one box round it is the solid, because a slot a
 * craft cannot fit is a slot the gap rule forbids.
 *
 * ONE DRAW CALL A COLOUR. The kit bakes a batch per material per chunk and
 * the hall is one chunk, so it draws eighteen colours (src/props/homes.js),
 * fewer than any of the houses. Detail comes from boxes, which cost
 * triangles and never a call.
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

/* The hall inside, real metres, and 6 m of apron round it. 50 wide since
 * 3 November 2026 (44 before), for the machine room the photos show. */
export const LEN = 50;
export const DEP = 56;
export const HIGH = 7.0;
const MARGIN = { w: 6, e: 6, s: 6, n: 6 };
export const FIELD_W = (MARGIN.w + LEN + MARGIN.e) * S;
export const FIELD_D = (MARGIN.s + DEP + MARGIN.n) * S;
export const X0 = MARGIN.w * S;
export const Y0 = MARGIN.s * S;

/* The slab stands a step over the apron. */
export const FLOOR0 = 0.05;
/* The outside wall's thickness, outside the hall. */
const TW = 0.3;
/* The partition down the east side: its west face, and its thickness. */
const PX = 32.0;
const PT = 0.15;
/* The wall between the spray room (south) and the machine room (north). */
const RY = 28.5;

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

/* Where the pilot starts: the south end of the workshop, facing north up
 * it, the way the flight's first frame looks. */
export const SPAWN = { px: 22.0, py: 4.0, h: FLOOR0 };

/* ------------------------------------------------------------------ */
/* The doors, for the walls and for ./yard.js's gaps                    */
/* ------------------------------------------------------------------ */

/* Each a span along a wall at `y` (an east west wall) or `x` (a north south
 * one) and its sill and head, real metres. Only the open ones: the dock
 * doors and the grey doors are shut in every frame, so they are painted. */
export const OPENINGS = {
  /* The south wall: the wood lined door east of the office. The north
   * wall, the dock wall: the white door standing open at the workshop's
   * end. */
  woodDoor: { x0: 12.4, x1: 13.6, y: -TW / 2, h0: FLOOR0, h1: 2.2 },
  backDoor: { x0: 22.8, x1: 24.0, y: DEP + TW / 2, h0: FLOOR0, h1: 2.2 },
  /* The white office's French door and window, in its north wall, at the
   * crate aisle's south end. */
  frenchDoor: { x0: 8.6, x1: 9.8, y: 5.44, h0: FLOOR0, h1: 2.2 },
  officeWindow: { x0: 6.2, x1: 7.6, y: 5.44, h0: 1.0, h1: 2.1 },
  /* The office's side door, in its east wall, facing the workshop. */
  frontOffice: { y0: 1.2, y1: 2.4, x: 10.74, h0: FLOOR0, h1: 2.2 },
  /* The partition's three: the paint shop's open door at the south end,
   * the sliding door, and the barani doorway at the north end. */
  sprayDoor: { y0: 2.6, y1: 4.0, x: PX + PT / 2, h0: FLOOR0, h1: 2.2 },
  slidingDoor: { y0: 23.0, y1: 24.6, x: PX + PT / 2, h0: FLOOR0, h1: 2.4 },
  barani: { y0: 52.2, y1: 54.7, x: PX + PT / 2, h0: FLOOR0, h1: 3.1 },
};

/* An opening as the [along0, along1, up0, up1] its wall takes. */
const holeOf = (o) => (o.y !== undefined ? [o.x0, o.x1, o.h0, o.h1] : [o.y0, o.y1, o.h0, o.h1]);

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

class Hall {
  constructor() {
    this.P = new Parts();
  }

  /* A box between two plan corners, solid and drawn. */
  box(m, px0, py0, h0, px1, py1, h1, opts = {}) {
    return this.P.box(m, wx(px0), wy(h0), wz(py0), wx(px1), wy(h1), wz(py1), opts);
  }

  /* Paint: drawn, not solid. */
  paint(m, px0, py0, h0, px1, py1, h1) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, cast: false });
  }

  /* Drawn and not solid, for the fine part of a thing whose solid is one
   * box round it (`hidden`). */
  fine(m, px0, py0, h0, px1, py1, h1, name = 'fine') {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, name });
  }

  /* A solid that is not drawn. */
  hidden(px0, py0, h0, px1, py1, h1, name = 'hidden') {
    return this.box('whWall', px0, py0, h0, px1, py1, h1, { draw: false, name });
  }

  /* A round thing between two plan points, radius in real metres. */
  cap(m, a, b, r, opts = {}) {
    return this.P.cap(m, worldAt(a[0], a[1], a[2]), worldAt(b[0], b[1], b[2]), S * r, opts);
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
    this.P.wall(m, spec, { kind: 'wall', name });
  }

  /* Paint a rectangle on a wall's face, a whisker proud of it. `dir` 'x'
   * is a face along py = at, 'y' one along px = at; `side` the way it looks
   * (+1 north or east, -1 south or west). [a0, a1] along, [c0, c1] up. */
  face(m, dir, at, side, a0, a1, c0, c1) {
    const d0 = side > 0 ? at : at - 0.012;
    const d1 = side > 0 ? at + 0.012 : at;
    if (dir === 'x') {
      this.paint(m, a0, d0, c0, a1, d1, c1);
    } else {
      this.paint(m, d0, a0, c0, d1, a1, c1);
    }
  }

  /* A face painted all over but its holes. */
  faceBut(m, dir, at, side, a0, a1, c0, c1, holes = []) {
    for (const r of clip([a0, a1, c0, c1], holes)) {
      this.face(m, dir, at, side, ...r);
    }
  }

  /*
   * Taped drywall: tan paper sheets 1.22 by 2.44, hung upright, and the
   * white of the mudded joints between them. Drawn as one tan face for
   * the whole wall, cut round its holes, and the joints as white strips a
   * whisker over it: a strip for each upright joint and one for each
   * horizontal run, so a wall costs its columns plus its rows and not
   * their product. The tan stops short of each hole by a bead, and the
   * wall's own colour there is the corner bead.
   */
  taped(dir, at, side, a0, a1, c0, c1, holes = []) {
    const J = 0.045;
    const out = side > 0 ? at + 0.012 : at - 0.012;
    for (const r of clip([a0, a1, c0, c1], holes, 2 * J)) {
      this.face('whBoard', dir, at, side, ...r);
    }
    const strips = [];
    for (let a = a0 + 1.22; a < a1 - 0.05; a += 1.22) {
      strips.push([a - J, a + J, c0, c1]);
    }
    for (let c = c0 + 2.44; c < c1 - 0.05; c += 2.44) {
      strips.push([a0, a1, c - J, c + J]);
    }
    for (const [s0, s1, d0, d1] of strips) {
      for (const r of clip([Math.max(a0, s0), Math.min(a1, s1), Math.max(c0, d0), Math.min(c1, d1)], holes, 2 * J)) {
        this.face('whWhite', dir, out, side, ...r);
      }
    }
  }

  /* A table, bench or trestle: a top over four legs, flown under. */
  table(m, px0, py0, px1, py1, h, o = {}) {
    const top = o.top ?? 0.1;
    const leg = o.leg ?? 0.1;
    const f = FLOOR0;
    this.box(o.topM ?? m, px0, py0, f + h - top, px1, py1, f + h, { name: o.name ?? 'table' });
    for (const [x, y] of [[px0, py0], [px1 - leg, py0], [px0, py1 - leg], [px1 - leg, py1 - leg]]) {
      this.box(m, x, y, f, x + leg, y + leg, f + h - top, { name: 'leg' });
    }
  }

  /* A bench on a cabinet base: a top over a box, not flown under. */
  bench(px0, py0, px1, py1, o = {}) {
    const f = FLOOR0;
    const h = o.h ?? 0.92;
    this.box(o.topM ?? 'whBoard', px0, py0, f + h - 0.08, px1, py1, f + h, { name: 'bench top' });
    this.box(o.baseM ?? 'whCrateDark', px0 + 0.08, py0 + 0.08, f, px1 - 0.08, py1 - 0.08, f + h - 0.08, { name: 'bench base' });
  }

  /*
   * A plywood shipping crate standing on the slab or on `h0`: battens up the
   * faces `faces` names ('w', 'e', 's', 'n', the ones a pilot can see; a
   * face against the next crate is not painted), a rail along their tops,
   * and on the face `label` names a shipping label, a white patch with no
   * words, and sometimes the green tag the flight shows on them.
   */
  crate(m, px0, py0, px1, py1, h0, h1, o = {}) {
    this.box(m, px0, py0, h0, px1, py1, h1, { name: o.name ?? 'crate' });
    const w = 0.06;
    const e = 0.012;
    const faces = o.faces ?? 'wesn';
    for (const f of [0.12, 0.88]) {
      const x = px0 + (px1 - px0) * f;
      const y = py0 + (py1 - py0) * f;
      if (faces.includes('s')) {
        this.paint('whCrateDark', x - w, py0 - e, h0, x + w, py0, h1);
      }
      if (faces.includes('n')) {
        this.paint('whCrateDark', x - w, py1, h0, x + w, py1 + e, h1);
      }
      if (faces.includes('w')) {
        this.paint('whCrateDark', px0 - e, y - w, h0, px0, y + w, h1);
      }
      if (faces.includes('e')) {
        this.paint('whCrateDark', px1, y - w, h0, px1 + e, y + w, h1);
      }
    }
    if (faces.includes('w')) {
      this.paint('whCrateDark', px0 - e, py0, h1 - 0.1, px0, py1, h1);
    }
    if (faces.includes('e')) {
      this.paint('whCrateDark', px1, py0, h1 - 0.1, px1 + e, py1, h1);
    }
    if (!o.label) {
      return;
    }
    const z = h0 + (h1 - h0) * 0.6;
    const ink = m === 'whWhite' ? 'whCrate' : 'whWhite';
    const [u0, u1, v0, v1] = [z - 0.18, z + 0.18, z - 0.36, z - 0.24];
    if (o.label === 'w' || o.label === 'e') {
      const x0 = o.label === 'w' ? px0 - 0.02 : px1 + 0.008;
      const y = (py0 + py1) / 2 + (o.shift ?? 0);
      this.paint(ink, x0, y - 0.32, u0, x0 + 0.012, y + 0.32, u1);
      if (o.tag) {
        this.paint('whGreen', x0, y - 0.2, v0, x0 + 0.012, y + 0.0, v1);
      }
    } else {
      const y0 = o.label === 's' ? py0 - 0.02 : py1 + 0.008;
      const x = (px0 + px1) / 2 + (o.shift ?? 0);
      this.paint(ink, x - 0.32, y0, u0, x + 0.32, y0 + 0.012, u1);
      if (o.tag) {
        this.paint('whGreen', x - 0.2, y0, v0, x + 0.0, y0 + 0.012, v1);
      }
    }
  }

  /* A ladder stood against something: two rails solid, the rungs drawn
   * only. `dir` 'x' runs its rungs along px, 'y' along py. */
  ladder(m, px0, py0, px1, py1, h, dir) {
    const f = FLOOR0;
    const r = 0.07;
    if (dir === 'x') {
      this.box(m, px0, py0, f, px0 + r, py1, f + h, { name: 'ladder' });
      this.box(m, px1 - r, py0, f, px1, py1, f + h, { name: 'ladder' });
      for (let k = 0.3; k < h - 0.1; k += 0.3) {
        this.fine(m, px0 + r, py0, f + k, px1 - r, py1, f + k + 0.04, 'rung');
      }
    } else {
      this.box(m, px0, py0, f, px1, py0 + r, f + h, { name: 'ladder' });
      this.box(m, px0, py1 - r, f, px1, py1, f + h, { name: 'ladder' });
      for (let k = 0.3; k < h - 0.1; k += 0.3) {
        this.fine(m, px0, py0 + r, f + k, px1, py1 - r, f + k + 0.04, 'rung');
      }
    }
  }

  /* An exit sign: a small red plate on a wall, sticking out of it. */
  exitSign(dir, at, side, a, h) {
    if (dir === 'x') {
      const y0 = side > 0 ? at : at - 0.1;
      this.box('whRed', a - 0.18, y0, h, a + 0.18, y0 + 0.1, h + 0.2, { name: 'exit sign', cast: false });
    } else {
      const x0 = side > 0 ? at : at - 0.1;
      this.box('whRed', x0, a - 0.18, h, x0 + 0.1, a + 0.18, h + 0.2, { name: 'exit sign', cast: false });
    }
  }
}

/*
 * Pallet racking: uprights at every bay, a pair of beams at each level, and
 * the load. `axis` 'y' is a row running north (its depth across px), 'x' one
 * running east. `load(H, level, bay)` puts whatever the level holds; a bay
 * is { a0, a1, d0, d1, h } in the row's own along and across terms, and the
 * row hands back a function to turn those into a plan box.
 */
function rack(H, o) {
  const f = FLOOR0;
  const bays = Math.max(1, Math.round((o.a1 - o.a0) / (o.bay ?? 2.7)));
  const bay = (o.a1 - o.a0) / bays;
  const put = (m, a0, a1, d0, d1, h0, h1, opts = {}) => (o.axis === 'y'
    ? H.box(m, d0, a0, h0, d1, a1, h1, opts)
    : H.box(m, a0, d0, h0, a1, d1, h1, opts));
  const top = o.top ?? 5.2;
  const u = 0.1;
  for (let i = 0; i <= bays; i += 1) {
    const a = Math.min(o.a0 + i * bay, o.a1 - u);
    for (const d of [o.d0, o.d1 - u]) {
      put(o.upright, a, a + u, d, d + u, f, f + top, { name: 'upright' });
    }
  }
  for (const h of o.levels) {
    for (const d of [o.d0, o.d1 - u]) {
      put(o.beam, o.a0, o.a1, d, d + u, f + h, f + h + 0.12, { name: 'beam' });
    }
  }
  if (o.load) {
    for (let i = 0; i < bays; i += 1) {
      const b = { a0: o.a0 + i * bay + u, a1: o.a0 + (i + 1) * bay, d0: o.d0, d1: o.d1, i };
      o.load(put, -1, { ...b, h: f });
      o.levels.forEach((h, k) => o.load(put, k, { ...b, h: f + h + 0.12 }));
    }
  }
}

/* ------------------------------------------------------------------ */
/* The shell                                                           */
/* ------------------------------------------------------------------ */

function shell(H) {
  const f = FLOOR0;
  const o = OPENINGS;
  /* The slab, and the apron round the hall over the ground. */
  H.box('whConcrete', 0, 0, 0, LEN, DEP, f, { name: 'slab', cast: false });
  H.paint('whAsphalt', -MARGIN.w, -MARGIN.s, 0, LEN + MARGIN.e, DEP + MARGIN.n, 0.02);
  /* The four walls, round the hall's outside so the inside is 50 by 56. */
  const top = HIGH + 0.25;
  H.wall('whWall', 'x', -TW / 2, -TW, LEN + TW, 0, top, TW, [holeOf(o.woodDoor)], 'south wall');
  H.wall('whWall', 'x', DEP + TW / 2, -TW, LEN + TW, 0, top, TW, [holeOf(o.backDoor)], 'north wall');
  H.wall('whWall', 'y', -TW / 2, 0, DEP, 0, top, TW, [], 'west wall');
  H.wall('whWall', 'y', LEN + TW / 2, 0, DEP, 0, top, TW, [], 'east wall');
  /* The roof deck over everything, dark. Under it the open web joists
   * across the hall every two metres, each its bottom chord (the top one
   * lies against the dark deck and reads as nothing, so it is not drawn), and
   * the maroon girders along it on the column lines and over the rooms. */
  H.box('whDeck', -TW, -TW, HIGH, LEN + TW, DEP + TW, top, { name: 'roof' });
  for (let y = 1; y < DEP; y += 2) {
    H.box('whSteel', 0, y - 0.05, 6.2, LEN, y + 0.05, 6.28, { name: 'joist' });
  }
  for (const x of [18, 25, 38, 44]) {
    H.box('whRed', x - 0.15, 0, 5.95, x + 0.15, DEP, 6.95, { name: 'girder' });
  }
  /* The cream round columns, two rows of five. */
  for (const x of [18, 25]) {
    for (const y of [6, 17, 28, 39, 50]) {
      H.cap('whColumn', [x, y, f], [x, y, 5.95], 0.18, { name: 'column', kind: 'pole', seg: 10 });
    }
  }
  /* The round silver duct down the hall, one over the crates and one over
   * the workshop, and the red heaters hung off them. */
  for (const x of [12.8, 22.0]) {
    H.cap('whConcrete', [x, 1.5, 5.95], [x, 54.5, 5.95], 0.25, { name: 'duct', kind: 'wall', seg: 10 });
  }
  for (const [x, y] of [[12.8, 18.5], [22.0, 36.5]]) {
    H.box('whRackOrange', x - 0.4, y - 0.35, 5.2, x + 0.4, y + 0.35, 5.7, { name: 'heater' });
  }
  /* Long white lights in rows under the joists, and two ceiling fans over
   * the workshop between the rows. The rooms east get theirs in theirs. */
  for (const x of [3.0, 8.2, 15.4, 20.6, 28.6]) {
    for (const y of [4, 11, 18, 25, 32, 39, 46, 53]) {
      H.box('whLamp', x - 0.15, y - 1.2, 5.55, x + 0.15, y + 1.2, 5.7, { name: 'light' });
    }
  }
  for (const y of [22.5, 44.5]) {
    H.cap('whSteel', [25, y, 5.05], [25, y, 5.95], 0.04, { name: 'fan rod', seg: 6 });
    H.box('whSteel', 24.82, y - 0.18, 4.9, 25.18, y + 0.18, 5.1, { name: 'fan' });
    H.box('whWhite', 23.4, y - 0.12, 5.0, 26.6, y + 0.12, 5.05, { name: 'fan blade' });
    H.box('whWhite', 24.88, y - 1.6, 5.0, 25.12, y + 1.6, 5.05, { name: 'fan blade' });
  }
  /* Outside: a dark plinth round the hall. */
  for (const [x0, y0, x1, y1] of [[-TW - 0.012, -TW, -TW, DEP + TW], [LEN + TW, -TW, LEN + TW + 0.012, DEP + TW],
    [-TW, -TW - 0.012, LEN + TW, -TW], [-TW, DEP + TW, LEN + TW, DEP + TW + 0.012]]) {
    H.paint('whSteel', x0, y0, 0, x1, y1, 1.2);
  }
}

/* ------------------------------------------------------------------ */
/* The dock wall                                                       */
/* ------------------------------------------------------------------ */

/* The green, white and red stripe along the dock wall and on into the
 * machine room, red at the bottom. */
function stripe(H, dir, at, side, a0, a1, holes = []) {
  for (const [m, c0, c1] of [['whRed', 1.9, 2.15], ['whWhite', 2.15, 2.4], ['whGreen', 2.4, 2.65]]) {
    H.faceBut(m, dir, at, side, a0, a1, c0, c1, holes);
  }
}

/* The roller doors in the dock wall, west to east. The middle one is the
 * crate aisle's end, the forklift parked nose to it (frame 8.12.25 and the
 * phone photo looking up the aisle at the forklift's back). */
const DOCK_DOORS = [[2.6, 5.8], [8.0, 11.2], [13.4, 16.6]];

function dock(H) {
  const f = FLOOR0;
  /* The dock wall is the north wall, the one that runs from the crates to
   * the barani corner: the phone photo taken by the forklift looks along it,
   * doors on its left, to the taped partition and the barani doorway at its
   * far end. Three white roller doors, shut: painted on both faces with
   * their panel joints, a steel track up each side and the grey header box
   * over. */
  for (const [x0, x1] of DOCK_DOORS) {
    H.face('whWhite', 'x', DEP, -1, x0, x1, f, 3.6);
    H.face('whWhite', 'x', DEP + TW + 0.012, 1, x0, x1, f, 3.6);
    for (let h = 0.6; h < 3.6; h += 0.6) {
      H.paint('whSteel', x0, DEP - 0.02, f + h, x1, DEP - 0.012, f + h + 0.03);
    }
    H.box('whSteel', x0 - 0.12, DEP - 0.12, f, x0, DEP, 3.8, { name: 'door track' });
    H.box('whSteel', x1, DEP - 0.12, f, x1 + 0.12, DEP, 3.8, { name: 'door track' });
    H.box('whSteel', x0 - 0.3, DEP - 0.55, 3.75, x1 + 0.3, DEP, 4.25, { name: 'door header' });
  }
  /* The stripe runs from the west wall to the white door; the frame at
   * the barani corner shows the block bare above the plywood. */
  const holes = DOCK_DOORS.map(([x0, x1]) => [x0 - 0.2, x1 + 0.2, 0, 4]);
  stripe(H, 'x', DEP, -1, 0, OPENINGS.backDoor.x0 - 0.2, holes);
  /* Orange ladders stood against the wall between the doors. */
  for (const x of [6.4, 11.8, 17.2]) {
    H.ladder('whOrange', x, DEP - 0.2, x + 0.6, DEP, 3.4, 'x');
  }
  /* The forklift parked at the crate aisle's end, nose north to the middle
   * door: cream over an orange red chassis, a black mast and guard, the
   * forks down. */
  const x = 7.7;
  const y = 50.0;
  H.box('whRackOrange', x + 0.1, y, f, x + 1.3, y + 2.4, f + 0.55, { name: 'forklift' });
  H.box('whWhite', x + 0.1, y, f + 0.55, x + 1.3, y + 1.0, f + 1.3, { name: 'forklift' });
  H.box('whWhite', x + 0.1, y + 1.0, f + 0.55, x + 1.3, y + 2.4, f + 0.95, { name: 'forklift' });
  H.box('whBlack', x + 0.4, y + 1.0, f + 0.95, x + 1.0, y + 1.5, f + 1.4, { name: 'forklift seat' });
  for (const [dx, dy] of [[0.1, 0.9], [1.23, 0.9], [0.1, 2.25], [1.23, 2.25]]) {
    H.box('whBlack', x + dx, y + dy, f + 0.95, x + dx + 0.07, y + dy + 0.07, f + 2.2, { name: 'forklift guard' });
  }
  H.box('whBlack', x + 0.1, y + 0.9, f + 2.2, x + 1.3, y + 2.32, f + 2.27, { name: 'forklift guard' });
  for (const dx of [0.0, 1.28]) {
    H.box('whBlack', x + dx, y + 0.3, f, x + dx + 0.12, y + 0.8, f + 0.5, { name: 'wheel' });
    H.box('whBlack', x + dx, y + 1.7, f, x + dx + 0.12, y + 2.2, f + 0.5, { name: 'wheel' });
  }
  H.box('whBlack', x + 0.2, y + 2.4, f, x + 0.32, y + 2.55, f + 2.6, { name: 'mast' });
  H.box('whBlack', x + 1.08, y + 2.4, f, x + 1.2, y + 2.55, f + 2.6, { name: 'mast' });
  H.box('whBlack', x + 0.2, y + 2.4, f + 2.45, x + 1.2, y + 2.55, f + 2.6, { name: 'mast' });
  H.box('whSteel', x + 0.3, y + 2.55, f, x + 0.42, y + 3.75, f + 0.05, { name: 'fork' });
  H.box('whSteel', x + 0.98, y + 2.55, f, x + 1.1, y + 3.75, f + 0.05, { name: 'fork' });
  /* A red pallet jack by it. */
  H.box('whRed', 4.2, 50.4, f, 4.8, 51.6, f + 0.1, { name: 'pallet jack' });
  H.box('whRed', 4.42, 50.2, f, 4.58, 50.4, f + 1.2, { name: 'pallet jack' });
  /* The cantilever rack along the dock lane's south side, the one frame
   * 8.11.54 flies past with the doors on its other hand: three tiers of
   * sheet stock on pallets, a steel spine down its middle. */
  const [cx0, cx1, cy0, cy1] = [12.0, 17.6, 47.0, 48.8];
  for (const sx of [cx0, (cx0 + cx1) / 2 - 0.05, cx1 - 0.1]) {
    H.box('whSteel', sx, 47.85, f, sx + 0.1, 47.95, f + 2.9, { name: 'spine' });
  }
  const r = seededRandom(7101);
  for (const [h0, k] of [[0, 0], [0.95, 1], [1.95, 2]]) {
    H.box('whSteel', cx0, cy0, f + h0, cx1, cy1, f + h0 + 0.06, { name: 'stock deck' });
    const t = r.range(0.3, 0.5);
    H.box(k === 1 ? 'whWhite' : 'whBoard', cx0 + 0.1, cy0 + 0.05, f + h0 + 0.06, cx1 - 0.1, cy1 - 0.05, f + h0 + 0.06 + t, { name: 'sheet stock' });
    for (let z = 0.08; z < t; z += 0.14) {
      H.paint('whCrateDark', cx0 + 0.1, cy1 - 0.05, f + h0 + 0.06 + z, cx1 - 0.1, cy1 - 0.038, f + h0 + 0.075 + z);
    }
  }
  /* East of the doors, against the wall, the stack of empty pallets and the
   * grey carpet rolls laid on the slab in front of it, the way the photo by
   * the forklift has them. */
  H.box('whCrateDark', 18.8, 54.4, f, 22.4, DEP, f + 2.3, { name: 'pallet stack' });
  for (let z = 0.12; z < 2.25; z += 0.3) {
    H.paint('whCrate', 18.8, 54.388, f + z, 22.4, 54.4, f + z + 0.05);
  }
  H.hidden(18.6, 52.6, f, 22.6, 54.4, f + 1.1, 'carpet rolls');
  for (const [y, h] of [[52.9, 0.28], [53.45, 0.28], [54.0, 0.28], [53.45, 0.8]]) {
    H.cap('whConcrete', [18.7, y, f + h], [22.5, y, f + h], 0.27, { solid: false, seg: 8, name: 'carpet roll' });
  }
}

/* ------------------------------------------------------------------ */
/* The racking and the crate aisle                                     */
/* ------------------------------------------------------------------ */

function aisle(H) {
  const f = FLOOR0;
  const r = seededRandom(7102);
  /* The crate aisle runs from the white office at its south end to the
   * forklift and the middle dock door at its north end. Facing the doors,
   * orange racking and crates on the left hand and green racking of
   * mouldings on the right (frame 8.12.25), so facing the office the
   * mouldings are on the left and the black panel wall on the right (frame
   * 8.14.08). Green racking down the aisle's east side, piled with
   * mouldings and panel stock, a gap at the cross aisle. On the floor the
   * long strips are heaped and stick out into the aisle. Each bay's load
   * runs over the upright to meet the next, as long strips do, so no slot
   * opens between two bays. */
  for (const [a0, a1] of [[9.0, 20.0], [22.6, 42.0]]) {
    rack(H, {
      axis: 'y', a0, a1, d0: 10.1, d1: 11.5, upright: 'whGreen', beam: 'whGreen', levels: [1.4, 2.8, 4.2], top: 4.5,
      load: (put, k, b) => {
        if (k === 2 && r.chance(0.5)) {
          return;
        }
        const m = r.pick(['whBoard', 'whBoard', 'whWhite', 'whCrateDark', 'whBlack']);
        const h = k < 0 ? r.range(0.5, 0.95) : r.range(0.3, 0.72);
        const out = k < 0 ? 9.7 : (r.chance(0.4) ? 9.9 : 10.25);
        put(m, b.a0 - 0.08, b.a1 + 0.02, out, 11.35, b.h, b.h + h, { name: 'mouldings' });
      },
    });
  }
  /* The grey carpet runner up the aisle, a dark mat on it. */
  H.paint('whSteel', 7.3, 6.0, f, 9.3, 49.0, f + 0.012);
  H.paint('whBlack', 7.7, 40.5, f, 8.9, 41.9, f + 0.02);
  /* The black panel wall stood in the aisle's west edge, and the yellow
   * step ladder open against it. */
  H.box('whBlack', 6.45, 29.8, f, 6.7, 36.4, f + 2.6, { name: 'black wall' });
  H.box('whYellow', 7.43, 33.4, f, 7.5, 33.47, f + 2.0, { name: 'ladder' });
  H.box('whYellow', 7.43, 33.93, f, 7.5, 34.0, f + 2.0, { name: 'ladder' });
  H.box('whYellow', 6.7, 33.4, f, 6.77, 33.47, f + 2.0, { name: 'ladder' });
  H.box('whYellow', 6.7, 33.93, f, 6.77, 34.0, f + 2.0, { name: 'ladder' });
  H.box('whYellow', 6.7, 33.4, f + 1.94, 7.5, 34.0, f + 2.0, { name: 'ladder' });
  for (let k = 0.35; k < 1.9; k += 0.35) {
    H.fine('whYellow', 7.43, 33.47, f + k, 7.5, 33.93, f + k + 0.04, 'rung');
  }
  /* A little black cart with a carton on it, and cartons on a pallet near
   * the dock end. */
  H.table('whBlack', 7.8, 25.0, 8.6, 25.7, 0.85, { name: 'cart', top: 0.05, leg: 0.06 });
  H.box('whCrate', 7.9, 25.1, f + 0.85, 8.5, 25.6, f + 1.25, { name: 'carton' });
  H.box('whCrateDark', 6.4, 44.5, f, 7.4, 45.7, f + 0.15, { name: 'pallet' });
  H.box('whCrate', 6.4, 44.55, f + 0.15, 7.35, 45.65, f + 1.0, { name: 'cartons' });
  /* Orange racking down the aisle's west side, crates on the floor and
   * crates on the beams, the cross aisle through it. */
  for (const [a0, a1] of [[8.4, 20.0], [22.6, 43.2]]) {
    rack(H, {
      axis: 'y', a0, a1, d0: 5.0, d1: 6.4, upright: 'whRackOrange', beam: 'whRackOrange', levels: [2.2, 4.5], top: 4.8,
      load: (put, k, b) => {
        if (k === 1) {
          return;
        }
        if (k < 0) {
          H.crate(r.chance(0.25) ? 'whWhite' : 'whCrate', 5.0, b.a0 - 0.05, 6.4, b.a1 + 0.05, b.h, b.h + r.range(1.5, 1.9), {
            faces: 'we', label: 'e', shift: r.range(-0.3, 0.3), tag: r.chance(0.5),
          });
        } else {
          H.crate('whCrate', 5.0, b.a0 - 0.05, 6.4, b.a1 + 0.05, b.h, b.h + r.range(1.45, 1.72), { faces: 'we', label: 'e', tag: r.chance(0.4) });
        }
      },
    });
  }
  /* West of it, against the west wall, crates one and two high with a
   * lane between them and the racking, off the cross aisle and clear of
   * the partners' signs over them. */
  for (const [s0, s1] of [[9.0, 19.6], [23.0, 31.6], [35.6, 43.0]]) {
    let y = s0;
    while (y < s1 - 0.5) {
      const len = Math.min(r.range(2.2, 3.0), s1 - y);
      let h = f;
      const tiers = r.pick([1, 2, 2]);
      for (let k = 0; k < tiers; k += 1) {
        const t = r.range(1.1, 1.35);
        H.crate(r.chance(0.2) ? 'whWhite' : 'whCrate', 0.0, y, 3.0, y + len, h, h + t, {
          faces: 'e' + (y === s0 ? 's' : '') + (y + len >= s1 - 0.01 ? 'n' : ''), label: r.chance(0.5) ? 'e' : null, shift: r.range(-0.4, 0.4), tag: false,
        });
        h += t;
      }
      y += len;
    }
  }
}

/* Stacks of crates on pallets between the green racking and the workshop
 * north of the cross aisle, two columns of them touching, one to three
 * high, with a second passage through. South of the cross aisle the
 * workshop runs west to the racking, the way the flight's second frame
 * sees it. */
function crates(H) {
  const f = FLOOR0;
  const r = seededRandom(7103);
  for (const [s0, s1] of [[22.6, 37.6], [40.0, 45.0]]) {
    let y = s0;
    while (y < s1 - 0.5) {
      const len = Math.min(r.range(2.2, 3.2), s1 - y);
      [[12.0, 14.9], [14.9, 17.8]].forEach(([x0, x1], col) => {
        const tiers = r.pick([1, 2, 2, 3, 3, 3]);
        let h = f + 0.15;
        H.box('whCrateDark', x0 + 0.1, y + 0.1, f, x1 - 0.1, y + len - 0.1, h, { name: 'pallet' });
        for (let k = 0; k < tiers; k += 1) {
          const t = r.range(1.15, 1.45);
          const end = (y === s0 ? 's' : '') + (y + len >= s1 - 0.01 ? 'n' : '');
          const face = col === 1 ? 'e' : end.slice(0, 1) || null;
          H.crate(r.chance(0.2) ? 'whWhite' : 'whCrate', x0, y, x1, y + len, h, h + t, {
            faces: (col === 1 ? 'e' : 'w') + end, label: face && r.chance(0.75) ? face : null, shift: r.range(-0.4, 0.4), tag: r.chance(0.4),
          });
          h += t;
        }
      });
      y += len;
    }
  }
}

/* ------------------------------------------------------------------ */
/* The white office and the south west corner                          */
/* ------------------------------------------------------------------ */

/* The white office's footprint against the south wall, at the crate
 * aisle's south end. */
const OFFICE = { x0: 4.4, x1: 10.8, y1: 5.5 };

function office(H) {
  const f = FLOOR0;
  const o = OPENINGS;
  const { x0, x1, y1 } = OFFICE;
  /* A white box against the south wall, 3 high, a flat top flown over. In
   * its north face, the one the aisle looks at, a wood framed French door
   * and a window; the red tool chest under the window, the carpet shelving
   * west of it (frames 8.12.11 and 8.14.08). In its east face the side door
   * to the workshop, framed pictures and a glass cabinet (frame 8.13.32). */
  H.wall('whWhite', 'x', y1 - 0.06, x0, x1, 0, 3.0, 0.12, [holeOf(o.frenchDoor), holeOf(o.officeWindow)], 'office north');
  H.wall('whWhite', 'y', x0 + 0.06, 0, y1 - 0.12, 0, 3.0, 0.12, [], 'office west');
  H.wall('whWhite', 'y', x1 - 0.06, 0, y1 - 0.12, 0, 3.0, 0.12, [holeOf(o.frontOffice)], 'office east');
  H.box('whWhite', x0, 0, 2.92, x1, y1, 3.0, { name: 'office roof' });
  for (const [a0, a1, c0, c1] of [holeOf(o.frenchDoor), holeOf(o.officeWindow)]) {
    H.face('whCrate', 'x', y1, 1, a0 - 0.1, a0, c0, c1 + 0.1);
    H.face('whCrate', 'x', y1, 1, a1, a1 + 0.1, c0, c1 + 0.1);
    H.face('whCrate', 'x', y1, 1, a0, a1, c1, c1 + 0.1);
  }
  H.face('whCrate', 'x', y1, 1, 6.1, 7.7, 0.9, 1.0);
  for (const [y, h] of [[2.9, 1.5], [3.7, 1.6], [4.5, 1.45], [3.3, 2.2]]) {
    H.face('whCrateDark', 'y', x1, 1, y - 0.28, y + 0.28, h, h + 0.44);
    H.face('whWhite', 'y', x1 + 0.012, 1, y - 0.22, y + 0.22, h + 0.06, h + 0.38);
  }
  H.box('whWhite', x1, 4.95, f, x1 + 0.45, y1, f + 1.9, { name: 'cabinet' });
  H.face('whDeck', 'y', x1 + 0.45, 1, 5.0, 5.4, 0.9, 1.85);
  H.exitSign('y', x1, 1, (o.frontOffice.y0 + o.frontOffice.y1) / 2, 2.45);
  /* Inside: grey carpet, a desk on the south wall, a shelf, a cabinet. */
  H.paint('whSteel', x0 + 0.12, 0, f, x1 - 0.12, y1 - 0.12, f + 0.012);
  H.table('whWhite', 5.2, 0, 7.4, 1.2, 0.75, { name: 'desk', topM: 'whCrate' });
  H.box('whCrateDark', x0 + 0.12, 1.6, f, x0 + 0.5, 4.0, f + 1.8, { name: 'office shelf' });
  H.box('whWhite', 9.8, 0, f, x1 - 0.12, 0.8, f + 1.3, { name: 'filing cabinet' });
  /* The red tool chest under the window, its black top box. */
  H.box('whRed', 6.3, y1, f, 7.5, y1 + 0.5, f + 1.0, { name: 'tool chest' });
  H.box('whBlack', 6.4, y1 + 0.05, f + 1.0, 7.4, y1 + 0.45, f + 1.25, { name: 'tool chest' });
  for (let h = 0.2; h < 1.0; h += 0.2) {
    H.paint('whSteel', 6.35, y1 + 0.5, f + h, 7.45, y1 + 0.512, f + h + 0.03);
  }
  /* Black wire shelving west of it against the office's side, full of
   * carpet rolls end on, and a big crate on top; an orange tote in front. */
  const [sx0, sx1, sy0, sy1] = [1.2, x0, 4.0, y1];
  H.hidden(sx0, sy0, f, sx1, sy1, f + 2.2, 'carpet shelving');
  for (const x of [sx0, sx1 - 0.05]) {
    for (const y of [sy0, sy1 - 0.05]) {
      H.fine('whBlack', x, y, f, x + 0.05, y + 0.05, f + 2.2, 'shelving post');
    }
  }
  for (const h of [0.1, 0.8, 1.5, 2.15]) {
    H.fine('whBlack', sx0, sy0, f + h, sx1, sy1, f + h + 0.05, 'shelf');
    if (h > 2) {
      continue;
    }
    for (let x = sx0 + 0.25; x < sx1 - 0.2; x += 0.4) {
      for (const dz of [0.22, 0.58]) {
        if (h > 1.4 && dz > 0.5) {
          continue;
        }
        H.cap('whDeck', [x, sy0 + 0.05, f + h + dz], [x, sy1 - 0.05, f + h + dz], 0.17, { solid: false, seg: 8, name: 'carpet roll' });
      }
    }
  }
  H.crate('whCrate', sx0, sy0, sx1, sy1, f + 2.2, f + 3.4, { faces: 'nwe', label: 'n' });
  H.box('whOrange', 2.2, 6.0, f, 3.2, 6.8, f + 0.8, { name: 'tote' });
  /* East of the office along the south wall: a work cart and a green
   * ladder against the office's side, the wood lined door, plywood in its
   * reveal and its plywood leaf standing open outside, an extinguisher on
   * the wall, and the panel rack (frame 8.14.19). */
  const d = o.woodDoor;
  H.paint('whBoard', d.x0, -TW, f, d.x0 + 0.03, 0, d.h1);
  H.paint('whBoard', d.x1 - 0.03, -TW, f, d.x1, 0, d.h1);
  H.paint('whBoard', d.x0, -TW, d.h1 - 0.03, d.x1, 0, d.h1);
  H.face('whBoard', 'x', 0, 1, d.x0 - 0.12, d.x0, f, d.h1 + 0.12);
  H.face('whBoard', 'x', 0, 1, d.x1, d.x1 + 0.12, f, d.h1 + 0.12);
  H.face('whBoard', 'x', 0, 1, d.x0, d.x1, d.h1, d.h1 + 0.12);
  H.box('whBoard', d.x1, -TW - 1.15, f, d.x1 + 0.05, -TW, d.h1 - 0.05, { name: 'door leaf' });
  H.exitSign('x', 0, 1, (d.x0 + d.x1) / 2, 2.45);
  H.table('whCrateDark', x1, 0, 11.85, 1.1, 0.85, { name: 'cart', topM: 'whBoard' });
  H.box('whWhite', x1, 0, f + 0.85, 11.4, 0.7, f + 1.1, { name: 'bin' });
  H.ladder('whGreen', 11.85, 0, 12.4, 0.08, 2.6, 'x');
  H.face('whRed', 'x', 0, 1, 13.75, 13.95, 1.0, 1.45);
  H.face('whRed', 'x', 0, 1, 13.72, 13.98, 1.6, 1.85);
  /* The panel rack: sheets stood on edge in a wooden frame, four bays, and
   * on its top an orange rack's beams with paper rolls laid along them. */
  const [px0, px1, py0, py1] = [14.0, 18.5, 0.0, 1.4];
  const r = seededRandom(7104);
  const step = (px1 - px0 - 0.1) / 4;
  for (let i = 0; i <= 4; i += 1) {
    const x = px0 + i * step;
    H.box('whBoard', x, py0, f, x + 0.1, py1, f + 2.6, { name: 'panel rack' });
    if (i === 4) {
      continue;
    }
    const w = r.range(0.3, 0.58);
    const h = r.range(1.85, 2.15);
    H.box(r.pick(['whWhite', 'whBlack', 'whBoard', 'whWhite']), x + 0.1, py0 + 0.05, f, x + 0.1 + w, py1 - 0.05, f + h, { name: 'sheets' });
    for (let k = 0.08; k < w; k += 0.08) {
      H.paint('whCrateDark', x + 0.1 + k, py1 - 0.05, f, x + 0.1 + k + 0.015, py1 - 0.038, f + h - 0.1);
    }
  }
  H.box('whBoard', px0, py0, f + 2.6, px1, py1, f + 2.66, { name: 'panel rack' });
  for (const x of [px0, px1 - 0.1]) {
    for (const y of [py0 + 0.05, py1 - 0.15]) {
      H.box('whRackOrange', x, y, f, x + 0.1, y + 0.1, f + 3.4, { name: 'upright' });
    }
  }
  for (const y of [py0 + 0.05, py1 - 0.15]) {
    H.box('whRackOrange', px0, y, f + 2.6, px1, y + 0.1, f + 2.72, { name: 'beam' });
  }
  H.hidden(px0 + 0.1, py0, f + 2.66, px1 - 0.1, py1, f + 3.0, 'rolls');
  for (let x = px0 + 0.35; x < px1 - 0.3; x += 0.36) {
    H.cap('whCrate', [x, py0 + 0.2, f + 2.82], [x, py1 - 0.2, f + 2.82], 0.16, { solid: false, seg: 8, name: 'paper roll' });
  }
  /* The silver duct along the south wall over the office. */
  H.box('whConcrete', 1.8, 0, 4.5, 13.0, 0.5, 4.95, { name: 'wall duct' });
}

/* ------------------------------------------------------------------ */
/* The workshop                                                        */
/* ------------------------------------------------------------------ */

function workshop(H) {
  const f = FLOOR0;
  const r = seededRandom(7105);
  /* Teal racking along the south wall, yellow cabinets in two of its
   * bays and pails in another, cartons and pallets above. */
  rack(H, {
    axis: 'x', a0: 19.0, a1: 31.5, d0: 0.0, d1: 1.1, upright: 'whRackTeal', beam: 'whRackTeal', levels: [1.6, 3.1, 4.6],
    load: (put, k, b) => {
      if (k < 0) {
        if (b.i === 0 || b.i === 2) {
          put('whYellow', b.a0 + 0.1, b.a1 - 0.1, 0.0, 1.0, b.h, b.h + 1.2, { name: 'cabinet' });
        } else if (b.i === 3) {
          for (let x = b.a0 + 0.35; x < b.a1 - 0.4; x += 0.8) {
            put('whWhite', x, x + 0.35, 0.0, 0.4, b.h, b.h + 0.42, { name: 'pail' });
          }
        } else if (b.i === 1) {
          /* The wall of navy parts bins on shelving (the photos facing the
           * south racking): one block, the rows of bins painted on it. */
          put('whDeck', b.a0 - 0.3, b.a1 + 0.3, 0.0, 0.55, b.h, b.h + 1.72, { name: 'bins' });
          for (let z = 0.3; z < 1.5; z += 0.3) {
            put('whBlack', b.a0 - 0.3, b.a1 + 0.3, 0.55, 0.562, b.h + z, b.h + z + 0.03, { name: 'bin shelf', solid: false, cast: false });
          }
        } else if (b.i === 4) {
          put('whSteel', b.a0 + 0.5, b.a0 + 1.4, 0.0, 0.6, b.h, b.h + 1.9, { name: 'cabinet' });
        }
        return;
      }
      if (r.chance(0.7)) {
        const w = r.range(0.9, 1.9);
        const h = k === 2 ? r.range(0.3, 0.6) : r.range(0.4, 1.0);
        put(r.pick(['whCrate', 'whCrate', 'whWhite']), b.a0 + 0.1, b.a0 + 0.1 + w, 0.0, 0.9, b.h, b.h + h, { name: 'carton' });
      }
    },
  });
  /* The yellow cabinets' doors. */
  for (const x of [19.1, 24.3]) {
    H.paint('whCrateDark', x + 1.18, 1.0, f + 0.05, x + 1.22, 1.012, f + 1.15);
  }
  /* The partition's racking: teal north of the sliding door, orange beyond
   * it, and the black display box on the orange rack's top. */
  const load = (top) => (put, k, b) => {
    if (k >= top || (k >= 0 && !r.chance(0.65))) {
      return;
    }
    const h = k < 0 ? r.range(0.5, 1.3) : r.range(0.4, 1.05);
    const m = r.pick(['whCrate', 'whWhite', 'whCrate', 'whBlack']);
    const l = r.range(0.9, Math.max(1.0, b.a1 - b.a0 - 0.6));
    put(m, b.a0 + 0.05, b.a0 + 0.05 + l, 30.95, 31.95, b.h, b.h + h, { name: 'carton' });
  };
  rack(H, {
    axis: 'y', a0: 26.7, a1: 38.0, d0: 30.85, d1: PX, upright: 'whRackTeal', beam: 'whRackTeal', levels: [1.6, 3.1, 4.6], load: load(2),
  });
  rack(H, {
    axis: 'y', a0: 38.0, a1: 47.6, d0: 30.85, d1: PX, upright: 'whRackOrange', beam: 'whRackOrange', levels: [1.6, 3.1], top: 5.2, load: load(1),
  });
  H.box('whBlack', 30.85, 41.0, f + 3.22, PX, 43.6, f + 5.15, { name: 'display box' });
  H.paint('whCrate', 30.838, 41.15, f + 3.4, 30.85, 43.45, f + 5.0);
  for (const h of [3.95, 4.5]) {
    H.paint('whBoard', 30.826, 41.15, f + h, 30.838, 43.45, f + h + 0.06);
  }
  H.paint('whBoard', 30.826, 42.27, f + 3.4, 30.838, 42.33, f + 5.0);
  /* The benches: a big dark one with its stuff, two on cabinets down the
   * west side, the big white topped table on trestles, carts. */
  H.bench(20.0, 30.0, 23.2, 31.6, { topM: 'whCrateDark' });
  H.box('whWhite', 20.4, 30.3, f + 0.92, 21.2, 31.0, f + 1.25, { name: 'box' });
  H.box('whRed', 22.0, 30.5, f + 0.92, 22.6, 30.9, f + 1.1, { name: 'tool' });
  H.table('whBoard', 23.6, 30.0, 23.8, 31.2, 0.8, { name: 'sawhorse', top: 0.08, leg: 0.06 });
  H.bench(20.0, 8.0, 22.8, 9.4);
  H.box('whYellow', 20.3, 8.3, f + 0.92, 20.9, 8.8, f + 1.15, { name: 'tool' });
  H.bench(19.2, 36.0, 21.0, 38.4);
  H.bench(19.2, 42.0, 21.0, 44.4);
  H.box('whRed', 19.5, 42.4, f + 0.92, 20.2, 42.8, f + 1.2, { name: 'tool' });
  H.table('whBoard', 21.0, 12.0, 23.4, 13.2, 0.85, { name: 'table', topM: 'whWhite', top: 0.08 });
  H.ladder('whRackTeal', 20.2, 13.8, 20.8, 14.2, 1.8, 'x');
  H.table('whSteel', 22.0, 22.0, 22.9, 23.3, 0.85, { name: 'cart', topM: 'whBoard', top: 0.06, leg: 0.06 });
  H.box('whSteel', 22.06, 22.06, f, 22.84, 23.24, f + 0.12, { name: 'cart tray' });
  H.table('whSteel', 27.2, 35.0, 28.1, 36.3, 0.85, { name: 'cart', topM: 'whBoard', top: 0.06, leg: 0.06 });
  H.box('whSteel', 27.26, 35.06, f, 28.04, 36.24, f + 0.12, { name: 'cart tray' });
  /* The mitre saw on its cabinet, the white machine, a box fan on a stand. */
  H.bench(29.0, 31.0, 30.2, 33.4, { topM: 'whBoard' });
  H.box('whRed', 29.2, 31.8, f + 0.92, 29.9, 32.6, f + 1.3, { name: 'saw' });
  H.box('whWhite', 26.6, 24.6, f, 28.6, 26.0, f + 1.4, { name: 'machine' });
  H.box('whSteel', 26.8, 24.8, f + 1.4, 28.4, 25.0, f + 1.9, { name: 'machine' });
  H.box('whSteel', 22.66, 40.66, f, 22.74, 40.74, f + 0.9, { name: 'fan stand' });
  H.box('whSteel', 22.4, 40.6, f + 0.9, 23.0, 40.8, f + 1.5, { name: 'box fan' });
  /* Shrink wrapped stacks of white panels on pallets, and the white
   * carcasses on theirs. */
  for (const [x0, x1, h] of [[26.4, 27.6, 1.7], [27.6, 28.8, 1.5], [28.8, 30.0, 1.65]]) {
    H.box('whCrateDark', x0, 9.0, f, x1, 10.2, f + 0.15, { name: 'pallet' });
    H.box('whWhite', x0, 9.05, f + 0.15, x1, 10.15, f + h, { name: 'wrapped panels' });
    H.paint('whConcrete', x0 + 0.05, 9.038, f + 0.4, x1 - 0.05, 9.05, f + h - 0.2);
  }
  for (const y of [15.0, 46.0]) {
    H.box('whCrateDark', 26.6, y, f, 29.2, y + 0.8, f + 0.15, { name: 'pallet' });
    H.box('whWhite', 26.65, y + 0.05, f + 0.15, 29.15, y + 0.75, f + 1.15, { name: 'carcass' });
    for (const x of [27.45, 28.3]) {
      H.paint('whCrate', x, y + 0.038, f + 0.2, x + 0.04, y + 0.05, f + 1.1);
    }
  }
  /* The south west of the workshop, where the crates stop: a bench, a
   * cart, plywood on a pallet, a carcass, a white topped table. */
  H.bench(12.6, 8.0, 15.4, 9.2);
  H.box('whRed', 13.0, 8.3, f + 0.92, 13.6, 8.8, f + 1.2, { name: 'tool' });
  H.table('whSteel', 14.0, 12.0, 14.9, 13.3, 0.85, { name: 'cart', topM: 'whBoard', top: 0.06, leg: 0.06 });
  H.box('whSteel', 14.06, 12.06, f, 14.84, 13.24, f + 0.12, { name: 'cart tray' });
  H.box('whCrateDark', 12.4, 15.6, f, 14.8, 17.0, f + 0.15, { name: 'pallet' });
  H.box('whBoard', 12.45, 15.65, f + 0.15, 14.75, 16.95, f + 0.9, { name: 'plywood' });
  H.box('whCrateDark', 15.4, 10.4, f, 17.4, 11.1, f + 0.15, { name: 'pallet' });
  H.box('whWhite', 15.45, 10.45, f + 0.15, 17.35, 11.05, f + 1.05, { name: 'carcass' });
  H.table('whBoard', 15.4, 13.6, 17.4, 14.8, 0.85, { name: 'table', topM: 'whWhite', top: 0.08 });
  /* Up the workshop's east side, benches loaded with tools by the
   * racking, more carts, a white panel across two trestles, panels on a
   * pallet. */
  H.bench(28.6, 39.0, 30.4, 41.4);
  H.bench(28.6, 42.0, 30.4, 44.4);
  for (const [x, y, m] of [[28.9, 39.4, 'whRed'], [29.6, 40.6, 'whYellow'], [29.0, 42.5, 'whBlack'], [29.5, 43.4, 'whRed']]) {
    H.box(m, x, y, f + 0.92, x + 0.5, y + 0.4, f + 1.2, { name: 'tool' });
  }
  H.table('whSteel', 19.6, 18.0, 20.5, 19.3, 0.85, { name: 'cart', topM: 'whBoard', top: 0.06, leg: 0.06 });
  H.box('whSteel', 19.66, 18.06, f, 20.44, 19.24, f + 0.12, { name: 'cart tray' });
  H.table('whSteel', 23.0, 45.5, 23.9, 46.8, 0.85, { name: 'cart', topM: 'whBoard', top: 0.06, leg: 0.06 });
  H.box('whSteel', 23.06, 45.56, f, 23.84, 46.74, f + 0.12, { name: 'cart tray' });
  H.table('whBoard', 26.6, 18.5, 29.0, 19.7, 0.85, { name: 'table', topM: 'whWhite', top: 0.06, leg: 0.06 });
  H.box('whCrateDark', 19.4, 47.5, f, 21.8, 48.7, f + 0.15, { name: 'pallet' });
  H.box('whWhite', 19.45, 47.55, f + 0.15, 21.75, 48.65, f + 1.1, { name: 'panels' });
  /* Plywood stacked on spacers against the dock wall at the barani
   * corner, head high and more, each a different height, the spacers'
   * edges showing (frame 8.13.05 and the photos facing the doorway). */
  for (const [x0, x1, h] of [[26.6, 29.4, 3.0], [29.4, PX, 3.3]]) {
    H.box('whBoard', x0, 54.4, f, x1, DEP, f + h, { name: 'plywood stack' });
    for (let z = 0.35; z < h - 0.1; z += r.range(0.32, 0.5)) {
      H.paint('whCrateDark', x0, 54.388, f + z, x1, 54.4, f + z + 0.1);
    }
  }
  /* A white sheet on a dolly by the barani doorway. */
  H.box('whBoard', 28.0, 51.8, f, 30.6, 52.3, f + 0.2, { name: 'dolly' });
  H.box('whWhite', 28.0, 52.0, f + 0.2, 30.6, 52.1, f + 1.6, { name: 'sheet' });
  /* Tall cartons stood at the orange rack's end, by the cubby. */
  H.box('whCrate', 30.8, 47.6, f, PX, 48.6, f + 1.9, { name: 'cartons' });
  /* The back door standing open, white, and its exit sign. */
  const d = OPENINGS.backDoor;
  H.box('whWhite', d.x1, 54.8, f, d.x1 + 0.06, DEP, d.h1 - 0.05, { name: 'door leaf' });
  H.exitSign('x', DEP, -1, (d.x0 + d.x1) / 2, 2.45);
  /* The north wall at the corner: an exit sign, the exhaust fan's box, a
   * grey switch box and a run of conduit. */
  H.exitSign('x', DEP, -1, 30.9, 3.45);
  H.face('whSteel', 'x', DEP, -1, 28.6, 29.3, 4.3, 5.0);
  H.face('whSteel', 'x', DEP, -1, 30.1, 30.5, 3.7, 4.2);
  H.face('whSteel', 'x', DEP, -1, 24.2, PX, 3.6, 3.65);
}

/*
 * THE WORKSHOP'S CLUTTER, the second pass of 4 November 2026: every frame
 * of the workshop shows it packed, rolling benches and carts in rows down
 * its middle, white carcasses and shrink wrapped panels on pallets, panel
 * carts, stand fans, a blue step ladder and a red hand truck, and the
 * racking by the grey door (frames 8.11.19, 8.12.45, 8.13.24, 8.13.32).
 * Kept clear: the start, the low line down x 24.3, the line along the
 * columns at y 34.2 below 1.4 m, the cross aisle at y 21.3 and the lane to
 * the office's side door at y 1.8.
 */
function clutter(H) {
  const f = FLOOR0;
  const r = seededRandom(7107);
  /* A rolling bench: a board top over steel legs. */
  const roller = (x0, y0, x1, y1, h = 0.88) => {
    H.table('whSteel', x0, y0, x1, y1, h, { name: 'cart', topM: 'whBoard', top: 0.06, leg: 0.06 });
  };
  /* A white carcass, or a stack of them, on a pallet. */
  const carcass = (x0, y0, x1, y1, h) => {
    H.box('whCrateDark', x0, y0, f, x1, y1, f + 0.15, { name: 'pallet' });
    H.box('whWhite', x0 + 0.05, y0 + 0.05, f + 0.15, x1 - 0.05, y1 - 0.05, f + h, { name: 'carcass' });
  };
  /* A stand fan: a pole on a foot and its round head as a box. */
  const fan = (x, y) => {
    H.box('whSteel', x - 0.2, y - 0.2, f, x + 0.2, y + 0.2, f + 0.05, { name: 'fan foot' });
    H.box('whSteel', x - 0.03, y - 0.03, f + 0.05, x + 0.03, y + 0.03, f + 1.2, { name: 'fan pole' });
    H.box('whSteel', x - 0.3, y - 0.08, f + 1.2, x + 0.3, y + 0.08, f + 1.8, { name: 'fan head' });
  };
  /* The south west of the workshop (frame 8.11.19's left half). */
  roller(15.6, 4.0, 17.8, 5.1);
  roller(12.6, 18.4, 13.5, 19.7);
  H.bench(15.8, 16.4, 17.6, 18.8, { topM: 'whBoard' });
  carcass(12.6, 11.6, 13.6, 13.2, 1.2);
  /* Down the middle, west of the low line. */
  H.bench(19.0, 24.6, 22.6, 26.2, { topM: 'whBoard' });
  H.box('whWhite', 19.4, 24.9, f + 0.92, 20.4, 25.6, f + 1.2, { name: 'box' });
  roller(21.6, 15.6, 23.0, 16.6);
  roller(19.4, 39.8, 21.6, 40.8);
  carcass(21.2, 50.6, 23.3, 51.6, 1.0);
  /* The blue step ladder open on the slab, and the red hand truck. */
  H.box('whRackTeal', 19.2, 11.0, f, 19.27, 11.07, f + 1.8, { name: 'ladder' });
  H.box('whRackTeal', 19.73, 11.0, f, 19.8, 11.07, f + 1.8, { name: 'ladder' });
  H.box('whRackTeal', 19.2, 11.73, f, 19.27, 11.8, f + 1.6, { name: 'ladder' });
  H.box('whRackTeal', 19.73, 11.73, f, 19.8, 11.8, f + 1.6, { name: 'ladder' });
  H.box('whRackTeal', 19.2, 11.0, f + 1.74, 19.8, 11.8, f + 1.8, { name: 'ladder' });
  H.box('whRed', 22.0, 27.6, f, 22.6, 27.9, f + 0.08, { name: 'hand truck' });
  H.box('whRed', 22.0, 27.9, f, 22.06, 27.96, f + 1.2, { name: 'hand truck' });
  H.box('whRed', 22.54, 27.9, f, 22.6, 27.96, f + 1.2, { name: 'hand truck' });
  /* East of the low line: the shrink wrapped stacks of white panels the
   * start looks at, rolling benches, carcasses, a panel cart. */
  for (const [x0, x1, h] of [[25.8, 26.9, 1.8], [26.9, 28.0, 1.65]]) {
    H.box('whCrateDark', x0, 12.0, f, x1, 13.2, f + 0.15, { name: 'pallet' });
    H.box('whWhite', x0, 12.05, f + 0.15, x1, 13.15, f + h, { name: 'wrapped panels' });
    H.paint('whConcrete', x0 + 0.05, 11.988, f + 0.4, x1 - 0.05, 12.0, f + h - 0.2);
  }
  roller(26.0, 4.6, 28.6, 5.8);
  roller(29.2, 13.4, 30.4, 15.6);
  roller(26.2, 28.6, 28.6, 29.6);
  carcass(29.0, 21.6, 30.4, 23.2, 1.1);
  carcass(25.8, 48.6, 27.4, 49.6, 0.9);
  /* The panel cart: a dolly with sheets stood on edge in it. */
  H.box('whBoard', 26.0, 40.6, f, 27.8, 41.4, f + 0.2, { name: 'dolly' });
  H.box(r.pick(['whBoard', 'whWhite']), 26.1, 40.85, f + 0.2, 27.7, 41.15, f + 1.6, { name: 'sheets' });
  fan(23.0, 19.2);
  fan(26.4, 33.0);
  /* The racking north of the grey door on the partition's cream face,
   * orange uprights, teal beams, pallets of cartons on the beams (frame
   * 8.11.19's right half). */
  rack(H, {
    axis: 'y', a0: 6.4, a1: 11.1, d0: 30.85, d1: PX, upright: 'whRackOrange', beam: 'whRackTeal', levels: [1.6, 3.1], top: 3.6,
    load: (put, k, b) => {
      const h = k < 0 ? r.range(0.6, 1.2) : r.range(0.5, 0.9);
      put(k < 0 ? 'whWhite' : 'whCrate', b.a0 - 0.2, b.a1 + 0.2, 30.95, 31.95, b.h, b.h + h, { name: 'carton' });
    },
  });
}

/* ------------------------------------------------------------------ */
/* The partition                                                       */
/* ------------------------------------------------------------------ */

function partition(H) {
  const f = FLOOR0;
  const o = OPENINGS;
  const holes = [holeOf(o.sprayDoor), holeOf(o.slidingDoor), holeOf(o.barani)];
  /* Drywall to the roof, the colour of the mud, and the wall between the
   * spray room and the machine room. */
  H.wall('whWhite', 'y', PX + PT / 2, 0, DEP, 0, HIGH, PT, holes, 'partition');
  H.wall('whWhite', 'x', RY + PT / 2, PX + PT, LEN, 0, HIGH, PT, [], 'room wall');
  /* Its west face: painted white south of the sliding door, taped sheets
   * from there to the north wall, round the white door and the cubby; the
   * spray room's face cream; the machine room's taped, as is the wall
   * between the rooms on both sides. */
  H.taped('y', PX, -1, 22.8, DEP, 0, HIGH, [...holes, [48.1, 51.8, 0, 2.7]]);
  H.taped('y', PX + PT, 1, RY + PT, DEP, 0, HIGH, holes);
  H.faceBut('whWall', 'y', PX + PT, 1, 0, RY, 0, HIGH, holes);
  H.taped('x', RY, -1, PX + PT, LEN, 0, HIGH);
  H.taped('x', RY + PT, 1, PX + PT, LEN, 0, HIGH);
  /* The barani doorway: nothing but the opening, as it is. South of it
   * the white door, shut, with its little window and its signs, and the
   * recessed cubby with a red sign in it. */
  H.face('whSteel', 'y', PX, -1, 50.52, 51.68, f, 2.2);
  H.face('whWhite', 'y', PX - 0.012, -1, 50.6, 51.6, f, 2.12);
  H.face('whDeck', 'y', PX - 0.024, -1, 51.15, 51.45, 1.3, 1.75);
  H.face('whWhite', 'y', PX - 0.024, -1, 50.75, 51.45, 0.8, 1.1);
  H.face('whRed', 'y', PX, -1, 50.2, 50.42, 1.95, 2.3);
  H.box('whRed', PX - 0.15, 50.25, f + 1.0, PX, 50.4, f + 1.45, { name: 'extinguisher' });
  H.face('whBoard', 'y', PX, -1, 48.2, 49.8, 1.3, 2.6);
  H.face('whCrateDark', 'y', PX - 0.012, -1, 48.3, 49.7, 1.4, 2.5);
  H.face('whBoard', 'y', PX - 0.024, -1, 48.3, 49.7, 1.82, 1.88);
  H.face('whRed', 'y', PX - 0.024, -1, 48.8, 49.2, 2.0, 2.2);
  H.face('whWhite', 'y', PX, -1, 49.95, 50.15, 2.0, 2.3);
  /* The sliding door, grey steel, slid north along its track over the
   * opening's north side; its yellow warning plate and window. */
  const s = o.slidingDoor;
  H.box('whSteel', PX - 0.1, s.y1, f, PX - 0.02, s.y1 + 1.6, s.h1 + 0.05, { name: 'sliding door' });
  H.box('whSteel', PX - 0.15, s.y0 - 0.2, s.h1 + 0.05, PX, s.y1 + 1.8, s.h1 + 0.2, { name: 'door track' });
  H.face('whYellow', 'y', PX - 0.1, -1, s.y1 + 0.5, s.y1 + 1.2, 1.7, 2.05);
  H.face('whDeck', 'y', PX - 0.1, -1, s.y1 + 0.7, s.y1 + 0.9, 1.1, 1.5);
  /* The paint shop's door: open, and white framed on the room's cream
   * side, and the grey steel door beside it shut under an exit sign on
   * both. The room's side is painted over the cream, so one more whisker. */
  const p = o.sprayDoor;
  const out = PX + PT + 0.012;
  H.face('whWhite', 'y', out, 1, p.y0 - 0.1, p.y0, f, p.h1 + 0.1);
  H.face('whWhite', 'y', out, 1, p.y1, p.y1 + 0.1, f, p.h1 + 0.1);
  H.face('whWhite', 'y', out, 1, p.y0, p.y1, p.h1, p.h1 + 0.1);
  for (const [x, side] of [[PX, -1], [out, 1]]) {
    H.face('whSteel', 'y', x, side, 5.0, 6.0, f, 2.1);
    H.exitSign('y', x, side, 5.5, 2.3);
  }
}

/* ------------------------------------------------------------------ */
/* The spray room                                                      */
/* ------------------------------------------------------------------ */

function sprayRoom(H) {
  const f = FLOOR0;
  const r = seededRandom(7106);
  const X1 = LEN;
  /* Its east wall, taped as the partition is: the frames inside the room
   * see taped sheets behind the booth and beyond it. */
  H.taped('y', X1, -1, 0, RY, 0, HIGH, [[6.4, 7.6, 0.9, 2.1]]);
  /* The booth, its back to the taped wall between the rooms and its mouth
   * to the south, so the sliding door looks at it across the drying racks
   * on the left hand (frame 8.14.38) and the paint shop's cream wall is on
   * its left (frame 8.14.56): the white hood over a dark filter wall, white
   * sides, the grey of the overspray along the hood's lip, the sawhorses
   * in it. */
  const [b0, b1] = [36.0, 43.0];
  const back = RY - 0.4;
  const lip = RY - 2.4;
  H.box('whSteel', b0, back, f, b1, RY, f + 2.6, { name: 'filter wall' });
  for (let x = b0 + 0.5; x < b1 - 0.1; x += 0.5) {
    H.paint('whBlack', x - 0.02, back - 0.012, f, x + 0.02, back, f + 2.6);
  }
  for (let h = 0.5; h < 2.6; h += 0.5) {
    H.paint('whBlack', b0, back - 0.012, f + h - 0.02, b1, back, f + h + 0.02);
  }
  H.box('whWhite', b0, lip, f + 2.6, b1, RY, f + 3.8, { name: 'hood' });
  H.paint('whSteel', b0, lip - 0.012, f + 2.6, b1, lip, f + 2.8);
  H.paint('whBlack', 39.0, lip - 0.012, f + 3.0, 40.0, lip, f + 3.5);
  H.paint('whWhite', 39.08, lip - 0.024, f + 3.06, 39.92, lip - 0.012, f + 3.44);
  H.box('whWhite', b0, lip, f, b0 + 0.15, back, f + 2.6, { name: 'booth side' });
  H.box('whWhite', b1 - 0.15, lip, f, b1, back, f + 2.6, { name: 'booth side' });
  for (const x of [37.0, 41.0]) {
    H.table('whBoard', x, RY - 1.6, x + 1.2, RY - 1.2, 0.8, { name: 'sawhorse', top: 0.08, leg: 0.06 });
  }
  /* The big square duct, galvanised, along the west wall under the roof,
   * across over the hood and down into it, and the round flue out of the
   * hood's back to the roof. */
  H.box('whConcrete', 33.0, 1.0, 5.5, 34.2, 27.6, 6.2, { name: 'square duct' });
  H.box('whConcrete', 34.2, 26.4, 5.5, 40.0, 27.6, 6.2, { name: 'square duct' });
  H.box('whConcrete', 38.8, 26.4, f + 3.8, 40.0, 27.6, 5.5, { name: 'square duct' });
  for (let y = 3.0; y < 26; y += 2.4) {
    H.paint('whSteel', 32.988, y, 5.488, 34.212, y + 0.06, 6.2);
  }
  H.cap('whConcrete', [41.6, 27.7, f + 3.8], [41.6, 27.7, HIGH], 0.3, { name: 'flue', kind: 'wall', seg: 8 });
  /* Lights: three rows high, and four low in front of the booth. */
  for (const x of [35.0, 41.0, 47.0]) {
    for (const y of [4, 11, 18]) {
      H.box('whLamp', x - 0.15, y - 1.2, 5.55, x + 0.15, y + 1.2, 5.7, { name: 'light' });
    }
  }
  for (const x of [37.8, 41.2]) {
    for (const y of [24.4, 25.4]) {
      H.box('whLamp', x - 0.8, y - 0.15, 4.0, x + 0.8, y + 0.15, 4.15, { name: 'light' });
    }
  }
  /* Along the west wall from the paint shop's door north: a desk with its
   * shelves and pinboard, then the white wall cabinets over a counter with
   * boxes on top and paint pails along its foot. */
  const W = PX + PT;
  const C = W + 0.012;
  H.table('whSteel', W, 6.6, W + 0.8, 9.4, 0.75, { name: 'desk', topM: 'whBoard', top: 0.05, leg: 0.06 });
  H.face('whCrate', 'y', C, 1, 7.6, 9.2, 1.1, 1.9);
  H.face('whCrateDark', 'y', C, 1, 6.7, 7.4, 1.2, 2.3);
  H.face('whWhite', 'y', C + 0.012, 1, 6.85, 7.25, 1.4, 1.5);
  H.face('whWhite', 'y', C, 1, 8.2, 8.5, 2.2, 2.5);
  H.box('whWhite', W, 10.0, f, W + 0.6, 17.0, f + 0.9, { name: 'counter' });
  H.box('whWhite', W, 10.0, f + 1.6, W + 0.35, 17.0, f + 2.3, { name: 'wall cabinet' });
  for (let y = 10.7; y < 17; y += 0.7) {
    H.paint('whSteel', W + 0.35, y - 0.015, f + 1.62, W + 0.362, y + 0.015, f + 2.28);
    H.paint('whSteel', W + 0.6, y - 0.015, f + 0.05, W + 0.612, y + 0.015, f + 0.85);
  }
  for (const [y, w] of [[10.3, 0.7], [12.0, 0.5], [13.1, 0.9], [15.6, 0.6]]) {
    H.box('whCrate', W, y, f + 2.3, W + 0.35, y + w, f + 2.3 + r.range(0.25, 0.45), { name: 'box' });
  }
  for (let y = 10.2; y < 16.8; y += 0.75) {
    H.box('whWhite', W + 0.6, y, f, W + 0.9, y + 0.3, f + 0.38, { name: 'pail' });
  }
  /* The yellow line painted on the cream wall beside the booth. */
  H.face('whYellow', 'y', C, 1, 22.0, 22.12, 1.2, 2.6);
  /* Drying racks on wheels: a frame of four posts and a stack of thin
   * shelves, drawn, inside the one solid of the whole rack. */
  for (const [x, y] of [[35.8, 13.0], [35.8, 15.4], [39.6, 14.0], [36.0, 19.6], [37.8, 19.6]]) {
    const [x1, y1] = [x + 0.9, y + 1.4];
    H.hidden(x, y, f, x1, y1, f + 2.1, 'drying rack');
    for (const [px, py] of [[x, y], [x1 - 0.05, y], [x, y1 - 0.05], [x1 - 0.05, y1 - 0.05]]) {
      H.fine('whCrateDark', px, py, f, px + 0.05, py + 0.05, f + 2.1, 'rack post');
    }
    for (let h = 0.25; h < 2.05; h += 0.2) {
      H.fine('whBoard', x, y, f + h, x1, y1, f + h + 0.03, 'rack shelf');
    }
  }
  /* A rolling bench with a frame on it, and mouldings stood on the east
   * wall. */
  H.table('whCrateDark', 34.2, 7.0, 36.6, 8.0, 0.85, { name: 'bench', topM: 'whBoard' });
  H.box('whBoard', 34.4, 7.1, f + 0.85, 36.4, 7.9, f + 0.95, { name: 'frame' });
  for (const [y, w] of [[10.0, 0.25], [10.25, 0.18], [10.43, 0.3]]) {
    H.box(r.pick(['whBoard', 'whWhite']), X1 - 0.3, y, f, X1, y + w, f + r.range(2.6, 3.2), { name: 'mouldings' });
  }
  /* Paint drums by the booth. */
  for (const [x, y] of [[44.0, 25.4], [44.5, 25.4], [44.0, 25.9]]) {
    H.box('whWhite', x, y, f, x + 0.45, y + 0.45, f + 0.6, { name: 'drum' });
  }
}

/* ------------------------------------------------------------------ */
/* The machine room                                                    */
/* ------------------------------------------------------------------ */

/* A dust collector against a wall: its bin, the row of tan socks hung from
 * a rail into it, the hangers to the roof and its pipe up. */
function collector(H, x0, x1, y0) {
  const f = FLOOR0;
  H.box('whSteel', x0, y0, f, x1, DEP, f + 0.9, { name: 'collector bin' });
  H.box('whSteel', x0, y0 + 0.1, 3.25, x1, y0 + 0.2, 3.35, { name: 'sock rail' });
  for (const x of [x0, x1 - 0.1]) {
    H.box('whSteel', x, y0 + 0.1, 3.35, x + 0.1, y0 + 0.2, 6.2, { name: 'hanger' });
  }
  for (let x = x0 + 0.2; x < x1 - 0.2; x += 0.75) {
    H.box('whCrate', x, y0, f + 0.9, x + 0.3, y0 + 0.3, 3.25, { name: 'sock' });
  }
  H.cap('whConcrete', [(x0 + x1) / 2, y0 + 0.45, 3.35], [(x0 + x1) / 2, y0 + 0.45, 6.2], 0.2, { name: 'dust pipe', kind: 'wall', seg: 8 });
}

/* A sliding table saw: its cast body, the long sliding table on its east
 * side, the outrigger, the blade guard on its arm. Running along x. */
function slider(H, x0, y0) {
  const f = FLOOR0;
  H.box('whSteel', x0 + 1.6, y0, f, x0 + 3.0, y0 + 1.0, f + 0.88, { name: 'saw' });
  H.box('whWhite', x0, y0 + 1.0, f + 0.6, x0 + 4.4, y0 + 1.4, f + 0.9, { name: 'sliding table' });
  H.box('whSteel', x0 + 1.9, y0 + 1.05, f, x0 + 2.6, y0 + 1.35, f + 0.6, { name: 'saw' });
  H.box('whWhite', x0 + 1.4, y0 + 1.4, f + 0.84, x0 + 2.4, y0 + 2.6, f + 0.9, { name: 'outrigger' });
  H.box('whSteel', x0 + 2.2, y0 + 0.4, f + 0.88, x0 + 2.35, y0 + 0.55, f + 2.2, { name: 'saw guard' });
  H.box('whSteel', x0 + 2.0, y0 + 0.3, f + 1.5, x0 + 2.6, y0 + 0.7, f + 1.7, { name: 'saw guard' });
}

function machineRoom(H) {
  const f = FLOOR0;
  const X1 = LEN;
  const Y0 = RY + PT;
  /* Its walls: the stripe round it and a whiteboard, taped sheets on the
   * east wall's foot. The phone photos taken in the barani doorway show
   * the room long and wide, the stripe across its far wall, and dust
   * collectors one after another down the dock wall on the left hand. */
  H.taped('y', X1, -1, Y0, DEP, 0, 4.88);
  stripe(H, 'y', X1 - 0.012, -1, Y0, DEP);
  stripe(H, 'x', DEP, -1, PX + PT, X1);
  H.face('whSteel', 'y', X1 - 0.012, -1, 39.9, 42.5, 2.8, 4.2);
  H.face('whWhite', 'y', X1 - 0.024, -1, 40.0, 42.4, 2.9, 4.1);
  collector(H, 34.6, 39.0, 55.2);
  collector(H, 40.6, 45.0, 55.2);
  /* Two sliding table saws across the room, the first just inside the
   * doorway, pallets of cut parts and rolling benches between them. */
  slider(H, 35.4, 46.8);
  slider(H, 42.0, 40.2);
  H.table('whCrateDark', 38.0, 36.0, 40.4, 37.2, 0.85, { name: 'bench', topM: 'whBoard' });
  H.table('whCrateDark', 44.6, 49.0, 47.0, 50.2, 0.85, { name: 'bench', topM: 'whBoard' });
  /* A CNC router: its bed, and a gantry over it. */
  H.box('whWhite', 41.4, 31.6, f, 45.4, 33.6, f + 0.85, { name: 'router bed' });
  H.box('whBoard', 41.4, 31.6, f + 0.85, 45.4, 33.6, f + 0.9, { name: 'router bed' });
  for (const y of [31.4, 33.6]) {
    H.box('whSteel', 41.9, y, f, 42.2, y + 0.2, f + 2.3, { name: 'gantry' });
  }
  H.box('whSteel', 41.9, 31.4, f + 2.0, 42.2, 33.8, f + 2.3, { name: 'gantry' });
  H.box('whRed', 41.8, 32.3, f + 1.5, 42.3, 32.8, f + 2.0, { name: 'spindle' });
  /* An edge bander, long and white with a grey hood, along the room
   * wall. */
  H.box('whWhite', 33.4, 29.4, f, 38.9, 30.4, f + 1.2, { name: 'edge bander' });
  H.box('whSteel', 34.4, 29.4, f + 1.2, 36.4, 30.4, f + 1.5, { name: 'edge bander' });
  /* A panel saw stood on the east wall, a board in it. */
  H.box('whSteel', X1 - 0.4, 44.0, f + 0.7, X1, 49.0, f + 3.0, { name: 'panel saw' });
  H.box('whSteel', X1 - 1.0, 44.0, f + 0.55, X1, 49.0, f + 0.7, { name: 'panel saw' });
  H.box('whBoard', X1 - 0.52, 44.6, f + 0.7, X1 - 0.4, 48.4, f + 2.6, { name: 'board' });
  for (const y of [44.0, 48.85]) {
    H.box('whSteel', X1 - 1.0, y, f, X1, y + 0.15, f + 0.55, { name: 'panel saw' });
  }
  /* Pallets of cut parts. */
  for (const [x0, y0, x1, y1, h] of [[46.4, 31.0, 48.2, 32.2, 1.1], [38.6, 50.6, 40.6, 51.8, 0.8]]) {
    H.box('whCrateDark', x0, y0, f, x1, y1, f + 0.15, { name: 'pallet' });
    H.box('whBoard', x0 + 0.05, y0 + 0.05, f + 0.15, x1 - 0.05, y1 - 0.05, f + h, { name: 'cut parts' });
  }
  /* Lights. */
  for (const x of [35.0, 41.0, 47.0]) {
    for (const y of [32, 39, 46, 53]) {
      H.box('whLamp', x - 0.15, y - 1.2, 5.55, x + 0.15, y + 1.2, 5.7, { name: 'light' });
    }
  }
}

/* ------------------------------------------------------------------ */
/* The layout                                                          */
/* ------------------------------------------------------------------ */

export function warehouseLayout() {
  const H = new Hall();
  shell(H);
  dock(H);
  aisle(H);
  crates(H);
  office(H);
  workshop(H);
  clutter(H);
  partition(H);
  sprayRoom(H);
  machineRoom(H);
  return { parts: H.P.list.slice(), prisms: [], discs: [], cones: [], scaled: [] };
}

/* The partners' signs, each the wall it hangs on: a point on the face in
 * plan terms, the way the face looks, and how wide it is hung in real
 * metres (./index.js turns them into the built map's `markSpots`). Each
 * high on a wall the hall sees, clear of the doors and racking. */
export const SIGN_SPOTS = [
  { slug: 'gds', at: [0, 33.5, 4.4], n: [1, 0], w: 1.3 },
  { slug: 'mantisfpv', at: [27.4, DEP, 4.2], n: [0, -1], w: 1.3 },
  { slug: 'wcmrc', at: [PX, 12.0, 3.6], n: [-1, 0], w: 1.3 },
  { slug: 'webleedfpv', at: [0, 47.5, 4.0], n: [1, 0], w: 1.3 },
  /* Konex Drone's, the one hidden sign (the owner's promise of a logo hidden
   * in every map): low on the spray room's east wall, off the line of the
   * paint shop's door, which looks straight along y 2.6 to 4.0 and so
   * shows a pilot in the doorway bare wall. Small, 0.9 against the others'
   * 1.3. Nothing stands against the wall at that spot. */
  { slug: 'konexdrone', at: [LEN, 7.0, 1.5], n: [-1, 0], w: 0.9 },
];

/* The sign spots in the world frame: `p` on the face, `n` out of it. A plan
 * normal (nx, ny) is (nx, 0, -ny) in the three.js frame, where north is -z. */
export function signSpots() {
  return SIGN_SPOTS.map((s) => ({
    slug: s.slug, p: worldAt(...s.at), n: [s.n[0], 0, -s.n[1]], up: [0, 1, 0], w: S * s.w,
  }));
}

/*
 * THE TITLE SCREEN'S LINE AND THE PICTURE'S LENS. The built map's own
 * backdrop circles the field clear of the tallest thing near it, and here
 * the tallest thing is the roof, so the title screen would show the roof
 * and nothing else; the board's picture, taken from outside, a grey box. So
 * the hall hands over its own: a loop round the workshop under the lights,
 * which passes no box closer than 2.1 m and no column or fan closer than
 * that, measured against this layout on 27 October 2026; and one lens for
 * the board's picture and card, across the workshop to the barani doorway,
 * the taped wall and the plywood stacked by it (src/share/orbit.js,
 * placeCardCamera).
 */
const LOOP = { x: 24.5, y: 28, rx: 4.5, ry: 19, h: 4.4, n: 48 };
export function hallLoop() {
  const out = [];
  const sc = { s: 0, c: 1 };
  for (let i = 0; i < LOOP.n; i += 1) {
    sincos((i / LOOP.n) * Math.PI * 2, sc);
    const [x, y, z] = worldAt(LOOP.x + LOOP.rx * sc.c, LOOP.y + LOOP.ry * sc.s, LOOP.h);
    out.push({ x, y, z });
  }
  return out;
}
export const CARD_LENS = { eye: worldAt(20.5, 41.0, 3.8), at: worldAt(32.0, 53.4, 1.6) };
