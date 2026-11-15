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
 * And since 4 November 2026 the reel Mat sent, 233 frames of two packs
 * flown through the shop when the photos were taken (in
 * /mnt/project-files/tcmore-warehouse/reel-frames/), for its LINES: every
 * way it flies is a way here, and what a line needs is built for it, the
 * print room behind the grey door, the red carpet corner, the coat room
 * through the wood lined door, a way under the racking, a cardboard tube,
 * and, by the owner's pick, two plain exhibit booths (the section "The
 * reel's lines" below).
 *
 * WHAT THE FLIGHT AND THE PHOTOS SHOW, and so what this is. One tall hall
 * under a dark steel deck, open web joists down it and maroon girders
 * across it, a round silver duct down it, long white lights and two ceiling
 * fans, cream block walls and cream round columns. The north wall is the
 * dock wall: one white roller door shut under a grey header between tall
 * white cabinets stood against the wall, a green,
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
 * carpet rolls beside it; east of it, past a narrow slot with the
 * office's side door in it, a tall white block walled to the roof, the wood
 * lined door in its side, a work cart before it, and the green racking's
 * end bay stood full of panels against it. In the middle the workshop: big
 * assembly tables on plywood cupboards each side of a clear aisle, carts,
 * a big table on trestles, white carcasses, cabinet towers and wrapped
 * panels on pallets, teal racking with yellow cabinets and navy bins off
 * the south wall with the red corridor behind it to the washroom, plywood
 * stacked head high against the dock wall short of the barani corner and
 * the white exit door standing open past it. Down the east side a
 * partition, painted white along the grey door's room at the south end and
 * taped drywall to the roof from there, racking against it all the way
 * with a black display box on top, and in it three ways through: the
 * grey door near the south wall into the print room, the grey sliding
 * door into the paint shop at its south west corner, and at the north end
 * the wide opening into the machine room, Thomas's doorway to barani
 * through, with a white door and a cubby beside it. Behind it the
 * spray room, its booth in the corner by the partition, white hood over a
 * dark filter wall with its back to the taped wall between the rooms, the
 * desk, cabinets and counter along the cream wall, drying racks and a big
 * square duct; and the machine
 * room, long and wide (the photos taken in the doorway), dust collectors
 * with their socks one after another down the dock wall, two sliding table
 * saws, the stripe across its far wall.
 *
 * WHAT IS A GUESS. Neither source gives the plan from above or a single
 * measurement, so where the rooms stand relative to each other is read
 * from what each picture has on its left and right, and every length is a
 * reading; inside the machine room the machines are the kind the photos
 * show, not counted ones; and where the wood lined door leads is not
 * shown, so here it leads round to the coat room and the front door. The
 * floor plan of 4 November 2026 (in /mnt/project-files/tcmore-warehouse/
 * plans/) marks which walls are read and which are guessed: the white
 * block's east and north extent, the passage's way out and the red
 * corridor's line are the guesses.
 *
 * NO WORDS. The pictures show crate labels, signs and a name sprayed on
 * the booth, and the reel's booths carry their clients' names. None of it
 * is drawn: a label is a white patch, a sign a coloured plate, a booth's
 * name nothing. The only marks on this map are the partners' signs
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
export const S = 3.0;

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
/* The wall between the spray room (south) and the machine room (north),
 * where Thomas More's markup of 15 November 2026 has it. */
const RY = 37.0;
/* THE DIGITAL DEPARTMENT, the rooms behind the grey door (the same
 * markup's "Graph" box): north of the hallway and south of the paint shop.
 * Its white west face stands out into the workshop, west of the
 * partition's line, from its south corner to `notch`, and from there
 * north the partition is the wall (photos 0147, 0415 and 0416). */
export const DIG = { x0: 28.2, x1: 40.2, y0: 14.2, y1: 22.6, notch: 19.4 };
/* The spray room's south wall, its north face: the sliding door opens at
 * the spray room's south west corner (frames 8.11.19 and 8.15.03). */
const SHOP_S = DIG.y1 + PT;

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

/* Where the pilot starts: the south end of the workshop, by the hallway's
 * mouth, facing north up it, the way the flight's first frame looks. */
export const SPAWN = { px: 24.2, py: 14.6, h: FLOOR0 };

/* THE OFFICE AREA, Thomas More's markup of 15 November 2026: "This tall
 * white block doesn't exist", "Everything in that space is office area",
 * "move everything on the right of the tall white block to be in line with
 * the tall white block". So one flat cream wall, to the roof deck, from the
 * barani doorway's corner east to the hallway, and everything south of it
 * is offices nobody flies in, solid, but for the lunch room behind its
 * green door, the plywood passage and the coat room at the front door. Its
 * west face is the poster wall, the white office butted against it. The
 * floor plan of 4 November drew a white block 6.5 wide here with the
 * workshop running south past it to the south wall. */
export const BLOCK = { x0: 11.5, x1: LEN, y1: 11.5 };
/* The depth of the racking against the flat wall. */
const SR = 1.1;

/* ------------------------------------------------------------------ */
/* The doors, for the walls and for ./yard.js's gaps                    */
/* ------------------------------------------------------------------ */

/* Each a span along a wall at `y` (an east west wall) or `x` (a north south
 * one) and its sill and head, real metres. Only the open ones: the dock
 * doors and the grey doors are shut in every frame, so they are painted. */
export const OPENINGS = {
  /* The south wall: the front door, out of the coat room. The north wall,
   * the dock wall: the white exit door standing open at its east corner,
   * past the plywood stacks (photo 0131 and frame 8.13.05). */
  woodDoor: { x0: 12.4, x1: 13.6, y: -TW / 2, h0: FLOOR0, h1: 2.2 },
  backDoor: { x0: 30.2, x1: 31.4, y: DEP + TW / 2, h0: FLOOR0, h1: 2.2 },
  /* The white office's French door and window, in its north wall, at the
   * crate aisle's south end. */
  frenchDoor: { x0: 8.6, x1: 9.8, y: 5.44, h0: FLOOR0, h1: 2.2 },
  officeWindow: { x0: 6.2, x1: 7.6, y: 5.44, h0: 1.0, h1: 2.1 },
  /* The lunch room's green door in the flat wall, standing open (photo
   * 0414). */
  lunchDoor: { x0: 13.0, x1: 13.9, y: BLOCK.y1 - 0.06, h0: FLOOR0, h1: 2.1 },
  /* THE BARANI DOORWAY: the wood lined opening under the rolls of veneer,
   * through the line of the green racking at the flat wall's corner
   * (Thomas More's word of 15 November 2026 and photos 0374, 0414 and
   * 0427). The wide opening into the machine room carried this name until
   * then, wrongly. */
  barani: { y0: 11.62, y1: 12.72, x: 10.8, h0: FLOOR0, h1: 2.2 },
  /* The partition's two: the sliding door into the paint shop, at its
   * south west corner (frames 8.14.38 and 8.15.03), and the wide opening
   * into the machine room, the CNC area, at the north end. */
  slidingDoor: { y0: 23.1, y1: 24.7, x: PX + PT / 2, h0: FLOOR0, h1: 2.4 },
  cncDoor: { y0: 52.2, y1: 54.7, x: PX + PT / 2, h0: FLOOR0, h1: 3.1 },
  /* The grey door into the Digital Department, in its west face at the
   * hallway's corner, open since 4 November 2026: the reel flies in at it
   * and the length of the print room behind it. */
  greyDoor: { y0: 14.6, y1: 15.6, x: DIG.x0 + 0.06, h0: FLOOR0, h1: 2.1 },
  /* The print room's office, its door off the long room. */
  printOffice: { x0: 34.0, x1: 35.0, y: 17.46, h0: FLOOR0, h1: 2.1 },
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
   * running north and south every two metres, each its bottom chord (the
   * top one lies against the dark deck and reads as nothing, so it is not
   * drawn), and the maroon girders across the hall, east and west, on the
   * column lines. That way round since the polish of 4 November 2026: frames
   * 8.11.32, 8.12.11 and 8.14.08 look down the hall along the joists and
   * across the girders, and photo 0132 looks into the machine room across
   * the joists. None over the office area, which is walled to the deck, nor
   * over the Digital Department; the paint shop's girders are its walls. */
  H.box('whDeck', -TW, -TW, HIGH, LEN + TW, DEP + TW, top, { name: 'roof' });
  for (let x = 1; x < LEN; x += 2) {
    const y0 = x > BLOCK.x0 && x < BLOCK.x1 ? BLOCK.y1 : 0;
    H.box('whSteel', x - 0.05, y0, 6.2, x + 0.05, DEP, 6.28, { name: 'joist' });
  }
  for (const [y, spans] of [
    [6, [[0, BLOCK.x0]]], [17, [[0, DIG.x0]]], [28, [[0, PX]]], [39, [[0, LEN]]], [50, [[0, LEN]]],
  ]) {
    for (const [x0, x1] of spans) {
      H.box('whRed', x0, y - 0.15, 5.95, x1, y + 0.15, 6.95, { name: 'girder' });
    }
  }
  /* The cream round columns, two rows of four. */
  for (const x of [18, 25]) {
    for (const y of [17, 28, 39, 50]) {
      H.cap('whColumn', [x, y, f], [x, y, 5.95], 0.18, { name: 'column', kind: 'pole', seg: 10 });
    }
  }
  /* The round silver duct down the hall, one over the crate aisle and one
   * over the workshop, hung under the girders, and the orange heaters hung
   * off them and over the dock (photo 0425). The one over the aisle starts
   * at the flex up from the office's roof (photos 0374 and 0427). */
  for (const [x, y0] of [[9.4, 8.0], [22.0, BLOCK.y1 + SR + 0.5]]) {
    H.cap('whConcrete', [x, y0, 5.7], [x, 54.5, 5.7], 0.25, { name: 'duct', kind: 'wall', seg: 10 });
  }
  for (const [x, y] of [[9.4, 18.5], [22.0, 36.5], [5.4, 51.0], [15.6, 50.6]]) {
    H.box('whRackOrange', x - 0.4, y - 0.35, 4.95, x + 0.4, y + 0.35, 5.45, { name: 'heater' });
  }
  /* Long white lights in rows under the joists, clear of the girders, and
   * two ceiling fans over the workshop between the rows. None inside the
   * office area or the Digital Department. The rooms east get theirs in
   * theirs. */
  for (const x of [3.0, 8.2, 15.4, 20.6, 28.6]) {
    for (const y of [4, 11, 19.6, 25, 32, 41, 46, 53]) {
      if (x > BLOCK.x0 && x < BLOCK.x1 && y - 1.2 < BLOCK.y1) {
        continue;
      }
      if (x > DIG.x0 && y + 1.2 > DIG.y0 && y - 1.2 < DIG.notch) {
        continue;
      }
      H.box('whLamp', x - 0.15, y - 1.2, 5.55, x + 0.15, y + 1.2, 5.7, { name: 'light' });
    }
  }
  for (const y of [22.5, 44.5]) {
    H.cap('whSteel', [25, y, 5.05], [25, y, 6.2], 0.04, { name: 'fan rod', seg: 6 });
    H.box('whSteel', 24.82, y - 0.18, 4.9, 25.18, y + 0.18, 5.1, { name: 'fan' });
    H.box('whWhite', 23.4, y - 0.12, 5.0, 26.6, y + 0.12, 5.05, { name: 'fan blade' });
    H.box('whWhite', 24.88, y - 1.6, 5.0, 25.12, y + 1.6, 5.05, { name: 'fan blade' });
  }
  /* Outside: a dark plinth round the hall, stopped at the two doors (the
   * leak check of 4 November 2026 found it drawn across them). */
  for (const [x0, y0, x1, y1] of [[-TW - 0.012, -TW, -TW, DEP + TW], [LEN + TW, -TW, LEN + TW + 0.012, DEP + TW]]) {
    H.paint('whSteel', x0, y0, 0, x1, y1, 1.2);
  }
  const door = (d) => [d.x0, d.x1, 0, d.h1];
  H.faceBut('whSteel', 'x', -TW, -1, -TW, LEN + TW, 0, 1.2, [door(o.woodDoor)]);
  H.faceBut('whSteel', 'x', DEP + TW, 1, -TW, LEN + TW, 0, 1.2, [door(o.backDoor)]);
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

/* The two roller doors in the dock wall, side by side at the crate aisle's
 * end, the forklift parked nose to the left one, and a regular door beside
 * each (Thomas More's photo 0425 and his word of 15 November 2026:
 * "There's two bay doors and each have a regular door next to them").
 * That replaces the pick of 4 November, one roller door between tall
 * white cabinets. */
const DOCK_DOORS = [[6.6, 9.6], [10.4, 13.4]];
/* The regular doors, shut: a dark one left of the left bay and a white one
 * right of the right bay. */
const DOCK_SIDE_DOORS = [[4.7, 5.6, 'whDeck'], [14.5, 15.4, 'whWhite']];
/* The forklift, parked east of the doors before the pallet stacks, its
 * forks to the west (photo 0425): its back's east end and its south side. */
export const FORKLIFT = { x: 19.4, y: 50.2 };

function dock(H) {
  const f = FLOOR0;
  /* The dock wall is the north wall, the one that runs from the crates to
   * the back door's corner. Two white roller doors, shut: painted on both
   * faces with their panel joints, a steel track up each side, a silver
   * hood over each and a dark mat on the slab before it. */
  for (const [x0, x1] of DOCK_DOORS) {
    H.face('whWhite', 'x', DEP, -1, x0, x1, f, 3.3);
    H.face('whWhite', 'x', DEP + TW + 0.012, 1, x0, x1, f, 3.3);
    for (let h = 0.55; h < 3.3; h += 0.55) {
      H.paint('whSteel', x0, DEP - 0.02, f + h, x1, DEP - 0.012, f + h + 0.03);
    }
    H.box('whSteel', x0 - 0.12, DEP - 0.12, f, x0, DEP, 3.35, { name: 'door track' });
    H.box('whSteel', x1, DEP - 0.12, f, x1 + 0.12, DEP, 3.35, { name: 'door track' });
    H.box('whConcrete', x0 - 0.12, DEP - 0.5, 3.35, x1 + 0.12, DEP, 3.85, { name: 'door hood' });
    H.paint('whBlack', x0 + 0.3, DEP - 1.7, f, x1 - 0.3, DEP - 0.25, f + 0.014);
  }
  /* The regular doors: a grey frame, the leaf, its handle, and the exit
   * sign over it. */
  for (const [x0, x1, m] of DOCK_SIDE_DOORS) {
    H.face('whSteel', 'x', DEP, -1, x0 - 0.08, x1 + 0.08, f, 2.2);
    H.face(m, 'x', DEP - 0.012, -1, x0, x1, f, 2.12);
    H.face('whSteel', 'x', DEP - 0.024, -1, x1 - 0.16, x1 - 0.06, 0.98, 1.08);
    H.face(m, 'x', DEP + TW + 0.012, 1, x0, x1, f, 2.12);
    H.exitSign('x', DEP, -1, (x0 + x1) / 2, 2.32);
  }
  /* Between and beside them, against the wall: a grey filing cabinet, a
   * few boards stood between the bays, a small white fridge, a stack of
   * tyres. */
  H.box('whSteel', 5.9, DEP - 0.6, f, 6.48, DEP, f + 1.35, { name: 'filing cabinet' });
  for (const h of [0.34, 0.68, 1.02]) {
    H.paint('whBlack', 5.92, DEP - 0.612, f + h, 6.46, DEP - 0.6, f + h + 0.02);
  }
  H.box('whBoard', 9.72, DEP - 0.25, f, 10.28, DEP, f + 1.5, { name: 'boards' });
  H.box('whWhite', 13.52, DEP - 0.55, f, 14.1, DEP, f + 0.9, { name: 'fridge' });
  H.box('whBlack', 15.6, DEP - 0.75, f, 16.35, DEP, f + 1.3, { name: 'tyres' });
  for (let h = 0.26; h < 1.3; h += 0.26) {
    H.paint('whSteel', 15.6, DEP - 0.762, f + h - 0.015, 16.35, DEP - 0.75, f + h + 0.015);
  }
  /* The stripe runs from the west wall to the back door; the frame at
   * that corner shows the block bare above the plywood. It turns the
   * corner onto the west wall and runs down it to the south wall behind
   * the crates (photos 0105 and 0106). Conduit along the wall over it. */
  stripe(H, 'y', 0, 1, 0, DEP);
  const holes = [
    ...DOCK_DOORS.map(([x0, x1]) => [x0 - 0.2, x1 + 0.2, 0, 4]),
    ...DOCK_SIDE_DOORS.map(([x0, x1]) => [x0 - 0.08, x1 + 0.08, 0, 2.7]),
  ];
  stripe(H, 'x', DEP, -1, 0, OPENINGS.backDoor.x0 - 0.2, holes);
  H.face('whSteel', 'x', DEP, -1, 0.4, 23.0, 4.4, 4.45);
  for (const x of [5.9, 10.0, 13.8]) {
    H.face('whSteel', 'x', DEP, -1, x, x + 0.05, 2.7, 4.4);
  }
  H.face('whSteel', 'x', DEP, -1, 13.6, 14.05, 1.5, 2.0);
  /* The west corner (the photo's left hand): a big shipping crate with a
   * wrapped load on it, empty pallets stacked behind it against the wall,
   * and before it black rug rolls laid on a pallet, the rolls drawn inside
   * one solid. */
  H.crate('whCrate', 0.0, 51.8, 3.0, 55.0, f, f + 1.9, { faces: 'es', label: 'e' });
  H.box('whWhite', 0.0, 52.2, f + 1.9, 2.6, 55.0, f + 2.55, { name: 'wrapped load' });
  H.box('whCrateDark', 0.0, 55.0, f, 3.0, DEP, f + 3.4, { name: 'pallet stack' });
  for (let z = 0.12; z < 3.35; z += 0.3) {
    H.paint('whCrate', 3.0, 55.0, f + z, 3.012, DEP, f + z + 0.05);
  }
  H.box('whCrateDark', 0.8, 49.0, f, 2.2, 51.2, f + 0.15, { name: 'pallet' });
  H.hidden(0.8, 49.0, f + 0.15, 2.2, 51.2, f + 0.95, 'rug rolls');
  for (const [x, h, m] of [[1.05, 0.36, 'whBlack'], [1.5, 0.36, 'whDeck'], [1.95, 0.36, 'whWhite'], [1.28, 0.72, 'whBlack'], [1.73, 0.72, 'whBlack']]) {
    H.cap(m, [x, 49.1, f + h], [x, 51.1, f + h], 0.2, { solid: false, seg: 8, name: 'rug roll' });
  }
  /* The forklift: cream over an orange red chassis, a black mast and
   * guard, the forks down. Written along its own length (v, from its back)
   * and width (u), and turned to face west. */
  const F = FORKLIFT;
  const fk = (m, u0, v0, h0, u1, v1, h1, name) => H.box(m, F.x - v1, F.y + u0, f + h0, F.x - v0, F.y + u1, f + h1, { name });
  fk('whRackOrange', 0.1, 0, 0, 1.3, 2.4, 0.55, 'forklift');
  fk('whWhite', 0.1, 0, 0.55, 1.3, 1.0, 1.3, 'forklift');
  fk('whWhite', 0.1, 1.0, 0.55, 1.3, 2.4, 0.95, 'forklift');
  fk('whBlack', 0.4, 1.0, 0.95, 1.0, 1.5, 1.4, 'forklift seat');
  for (const [du, dv] of [[0.1, 0.9], [1.23, 0.9], [0.1, 2.25], [1.23, 2.25]]) {
    fk('whBlack', du, dv, 0.95, du + 0.07, dv + 0.07, 2.2, 'forklift guard');
  }
  fk('whBlack', 0.1, 0.9, 2.2, 1.3, 2.32, 2.27, 'forklift guard');
  for (const du of [0.0, 1.28]) {
    fk('whBlack', du, 0.3, 0, du + 0.12, 0.8, 0.5, 'wheel');
    fk('whBlack', du, 1.7, 0, du + 0.12, 2.2, 0.5, 'wheel');
  }
  fk('whBlack', 0.2, 2.4, 0, 0.32, 2.55, 2.6, 'mast');
  fk('whBlack', 1.08, 2.4, 0, 1.2, 2.55, 2.6, 'mast');
  fk('whBlack', 0.2, 2.4, 2.45, 1.2, 2.55, 2.6, 'mast');
  fk('whSteel', 0.3, 2.55, 0, 0.42, 3.75, 0.05, 'fork');
  fk('whSteel', 0.98, 2.55, 0, 1.1, 3.75, 0.05, 'fork');
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
  /* East of the doors, against the wall, the stacks of empty pallets behind
   * the forklift and the grey carpet rolls laid on the slab before them. */
  for (const [x0, x1, h] of [[17.0, 18.8, 2.6], [18.8, 20.6, 2.0], [20.6, 22.4, 2.9]]) {
    H.box('whCrateDark', x0, 54.0, f, x1, DEP, f + h, { name: 'pallet stack' });
    for (let z = 0.12; z < h - 0.05; z += 0.3) {
      H.paint('whCrate', x0 + 0.03, 53.988, f + z, x1 - 0.03, 54.0, f + z + 0.05);
    }
  }
  H.hidden(18.6, 52.2, f, 22.6, 54.0, f + 1.1, 'carpet rolls');
  for (const [y, h] of [[52.5, 0.28], [53.05, 0.28], [53.6, 0.28], [53.05, 0.8]]) {
    H.cap('whConcrete', [18.7, y, f + h], [22.5, y, f + h], 0.27, { solid: false, seg: 8, name: 'carpet roll' });
  }
}

/* ------------------------------------------------------------------ */
/* The racking and the crate aisle                                     */
/* ------------------------------------------------------------------ */

/* The cardboard tube in the west lane, outside and in: 0.5 inside. */
export const TUBE = { x0: 3.5, x1: 4.1, y0: 15.2, y1: 18.2 };

/* Two bays of the orange racking with nothing on the slab, so the west
 * lane can be left under the first beam into the crate aisle, the way the
 * reel ducks under a pallet rack (its frames 36 and 37). */
const UNDER_RACK = [26.5, 39.4];

function aisle(H) {
  const f = FLOOR0;
  const r = seededRandom(7102);
  /* The crate aisle runs from the white office at its south end to the
   * forklift and the middle dock door at its north end. Facing the doors,
   * orange racking and crates on the left hand and green racking of
   * mouldings on the right (frame 8.12.25), so facing the office the
   * mouldings are on the left and the black panel wall on the right (frame
   * 8.14.08). Green racking down the aisle's east side, piled with
   * mouldings and panel stock, from the barani doorway's bay north, a gap
   * at the cross aisle. On the floor the
   * long strips are heaped and stick out into the aisle. Each bay's load
   * runs over the upright to meet the next, as long strips do, so no slot
   * opens between two bays. */
  for (const [a0, a1, bay] of [[16.0, 20.0, 2.0], [22.6, 42.0, 2.7]]) {
    rack(H, {
      axis: 'y', a0, a1, bay, d0: 10.1, d1: 11.5, upright: 'whGreen', beam: 'whGreen', levels: [1.4, 2.8, 4.2], top: 4.5,
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
   * crates on the beams, the cross aisle through it. It stops short of the
   * office: photos 0374 and 0427 are taken across open floor there. */
  for (const [a0, a1] of [[14.6, 20.0], [22.6, 43.2]]) {
    rack(H, {
      axis: 'y', a0, a1, d0: 5.0, d1: 6.4, upright: 'whRackOrange', beam: 'whRackOrange', levels: [2.2, 4.5], top: 4.8,
      load: (put, k, b) => {
        if (k === 1) {
          return;
        }
        if (k < 0 && UNDER_RACK.some((y) => y > b.a0 && y < b.a1)) {
          return;
        }
        if (k < 0) {
          H.crate(r.chance(0.25) ? 'whWhite' : 'whCrate', 5.0, b.a0 - 0.05, 6.4, b.a1 + 0.05, b.h, b.h + r.range(1.5, 1.84), {
            faces: 'we', label: 'e', shift: r.range(-0.3, 0.3), tag: r.chance(0.5),
          });
        } else {
          H.crate('whCrate', 5.0, b.a0 - 0.05, 6.4, b.a1 + 0.05, b.h, b.h + r.range(1.45, 1.72), { faces: 'we', label: 'e', tag: r.chance(0.4) });
        }
      },
    });
  }
  /* A big cardboard tube laid in the west lane, its two neighbours on
   * it, and the reel flies the length of one (its frame 230): square here,
   * a whoop's width and more inside, its ends darker. */
  const T = TUBE;
  H.box('whCrate', T.x0, T.y0, f, T.x1, T.y1, f + 0.05, { name: 'tube' });
  H.box('whCrate', T.x0, T.y0, f + 0.55, T.x1, T.y1, f + 0.6, { name: 'tube' });
  H.box('whCrate', T.x0, T.y0, f + 0.05, T.x0 + 0.05, T.y1, f + 0.55, { name: 'tube' });
  H.box('whCrate', T.x1 - 0.05, T.y0, f + 0.05, T.x1, T.y1, f + 0.55, { name: 'tube' });
  /* Its cut ends darker, a rim round each mouth, and the inside dark. */
  for (const y of [T.y0 - 0.012, T.y1]) {
    H.paint('whCrateDark', T.x0, y, f, T.x1, y + 0.012, f + 0.05);
    H.paint('whCrateDark', T.x0, y, f + 0.55, T.x1, y + 0.012, f + 0.6);
    H.paint('whCrateDark', T.x0, y, f + 0.05, T.x0 + 0.05, y + 0.012, f + 0.55);
    H.paint('whCrateDark', T.x1 - 0.05, y, f + 0.05, T.x1, y + 0.012, f + 0.55);
  }
  H.paint('whCrateDark', T.x0 + 0.05, T.y0, f + 0.05, T.x1 - 0.05, T.y1, f + 0.062);
  H.paint('whCrateDark', T.x0 + 0.05, T.y0, f + 0.538, T.x1 - 0.05, T.y1, f + 0.55);
  for (const x of [T.x0 + 0.15, T.x1 - 0.15]) {
    H.cap('whCrate', [x, T.y0 + 0.2, f + 0.75], [x, T.y1 - 0.2, f + 0.75], 0.15, { name: 'tube', seg: 8 });
  }
  /* West of it, against the west wall, crates one and two high with a
   * lane between them and the racking, off the cross aisle and clear of
   * the partners' signs over them. */
  for (const [s0, s1] of [[14.6, 19.6], [23.0, 31.6], [35.6, 43.0]]) {
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
  for (const [s0, s1] of [[22.6, 25.8], [39.6, 45.0]]) {
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
 * aisle's south end. It butts against the poster wall on its east side and
 * has no side door (Thomas More's markup of 15 November 2026). */
const OFFICE = { x0: 4.4, x1: BLOCK.x0, y1: 5.5 };

function office(H) {
  const f = FLOOR0;
  const o = OPENINGS;
  const { x0, x1, y1 } = OFFICE;
  /* A white box in the corner of the south wall and the poster wall, 3
   * high, a flat top flown over. In its north face, the one the aisle looks
   * at, a wood framed French door and a window, the framed jerseys over the
   * window; the red tool chest under the window, the carpet shelving west
   * of it (frames 8.12.11 and 8.14.08, photos 0374 and 0427). */
  H.wall('whWhite', 'x', y1 - 0.06, x0, x1, 0, 3.0, 0.12, [holeOf(o.frenchDoor), holeOf(o.officeWindow)], 'office north');
  H.wall('whWhite', 'y', x0 + 0.06, 0, y1 - 0.12, 0, 3.0, 0.12, [], 'office west');
  H.box('whWhite', x0, 0, 2.92, x1, y1, 3.0, { name: 'office roof' });
  H.face('whWhite', 'y', x1, -1, 0, y1 - 0.12, f, 2.92);
  for (const [a0, a1, c0, c1] of [holeOf(o.frenchDoor), holeOf(o.officeWindow)]) {
    H.face('whCrate', 'x', y1, 1, a0 - 0.1, a0, c0, c1 + 0.1);
    H.face('whCrate', 'x', y1, 1, a1, a1 + 0.1, c0, c1 + 0.1);
    H.face('whCrate', 'x', y1, 1, a0, a1, c1, c1 + 0.1);
  }
  H.face('whCrate', 'x', y1, 1, 6.1, 7.7, 0.9, 1.0);
  for (const [a, m] of [[6.2, 'whDeck'], [6.95, 'whWhite']]) {
    H.face('whBlack', 'x', y1, 1, a, a + 0.65, 2.3, 2.85);
    H.face(m, 'x', y1 + 0.012, 1, a + 0.12, a + 0.53, 2.38, 2.77);
  }
  H.face('whWhite', 'x', y1, 1, 8.8, 9.6, 2.42, 2.6);
  H.face('whRed', 'x', y1, 1, 10.2, 10.6, 1.5, 1.75);
  /* Inside: grey carpet, a desk on the south wall, a shelf, a cabinet. */
  H.paint('whSteel', x0 + 0.12, 0, f, x1, y1 - 0.12, f + 0.012);
  H.table('whWhite', 5.2, 0, 7.4, 1.2, 0.75, { name: 'desk', topM: 'whCrate' });
  H.box('whCrateDark', x0 + 0.12, 1.6, f, x0 + 0.5, 4.0, f + 1.8, { name: 'office shelf' });
  H.box('whWhite', 10.5, 0, f, x1, 0.8, f + 1.3, { name: 'filing cabinet' });
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
  /* The front door in the south wall, out of the coat room behind the
   * flat wall: plywood in its reveal and its plywood leaf standing open
   * outside. */
  const d = o.woodDoor;
  H.paint('whBoard', d.x0, -TW, f, d.x0 + 0.03, 0, d.h1);
  H.paint('whBoard', d.x1 - 0.03, -TW, f, d.x1, 0, d.h1);
  H.paint('whBoard', d.x0, -TW, d.h1 - 0.03, d.x1, 0, d.h1);
  H.face('whBoard', 'x', 0, 1, d.x0 - 0.12, d.x0, f, d.h1 + 0.12);
  H.face('whBoard', 'x', 0, 1, d.x1, d.x1 + 0.12, f, d.h1 + 0.12);
  H.face('whBoard', 'x', 0, 1, d.x0, d.x1, d.h1, d.h1 + 0.12);
  H.box('whBoard', d.x1, -TW - 1.15, f, d.x1 + 0.05, -TW, d.h1 - 0.05, { name: 'door leaf' });
  H.exitSign('x', 0, 1, (d.x0 + d.x1) / 2, 2.45);
  /* THE POSTER WALL between the office and the barani doorway, the tall
   * cream wall of photos 0374 and 0427: the bear poster by the corner, a
   * sheet of paper over it, a yellow diamond high up, a blue poster, a
   * flag, a tall orange poster, the slatted notice board with its papers,
   * the extinguisher and its sign by the doorway; the rolling work cart
   * before it with a bin on it. No words on any of them. */
  const P = x1;
  H.face('whBlack', 'y', P, -1, 10.2, 10.85, 2.15, 3.7);
  H.face('whWhite', 'y', P, -1, 10.25, 10.8, 3.85, 4.55);
  H.face('whYellow', 'y', P, -1, 8.85, 9.4, 3.0, 3.55);
  H.face('whDeck', 'y', P, -1, 9.5, 10.05, 1.7, 2.35);
  H.face('whRed', 'y', P, -1, 9.1, 9.38, 2.4, 2.6);
  H.face('whOrange', 'y', P, -1, 7.2, 7.6, 2.3, 3.35);
  H.face('whBoard', 'y', P, -1, 7.85, 9.3, 1.25, 1.95);
  for (const y of [7.95, 8.42, 8.9]) {
    H.face('whWhite', 'y', P - 0.012, -1, y, y + 0.32, 1.35, 1.82);
  }
  H.face('whCrate', 'y', P, -1, 6.1, 6.9, 1.3, 2.2);
  H.box('whRed', P - 0.15, 10.98, f + 1.0, P, 11.14, f + 1.45, { name: 'extinguisher' });
  H.face('whRed', 'y', P, -1, 10.93, 11.19, 1.6, 1.85);
  /* The open floor before the office and the doorway (the same photos):
   * cartons stacked on a pallet, white cabinets on another beside it, the
   * black and yellow tool boxes by the red chest, and a low black bench
   * before the panels. */
  H.box('whCrateDark', 6.6, 8.6, f, 7.8, 9.8, f + 0.15, { name: 'pallet' });
  H.box('whCrate', 6.62, 8.62, f + 0.15, 7.78, 9.78, f + 1.0, { name: 'cartons' });
  H.box('whCrate', 6.62, 9.0, f + 1.0, 7.4, 9.78, f + 1.45, { name: 'cartons' });
  H.paint('whWhite', 6.9, 8.608, f + 0.55, 7.2, 8.62, f + 0.75);
  H.box('whCrateDark', 5.4, 8.6, f, 6.6, 9.8, f + 0.15, { name: 'pallet' });
  H.box('whWhite', 5.42, 8.62, f + 0.15, 6.6, 9.78, f + 1.05, { name: 'cabinets' });
  H.box('whBlack', 7.6, y1, f, 8.4, y1 + 0.5, f + 0.8, { name: 'tool box' });
  H.box('whYellow', 7.6, y1, f + 0.8, 8.4, y1 + 0.5, f + 0.9, { name: 'tool box' });
  H.box('whBlack', 8.7, 13.9, f, 9.4, 15.7, f + 0.45, { name: 'bench' });
  H.table('whCrateDark', 9.9, 6.4, 10.95, 7.5, 0.85, { name: 'cart', topM: 'whBoard' });
  H.box('whWhite', 9.95, 6.8, f + 0.85, 10.55, 7.45, f + 1.1, { name: 'bin' });
  /* The silver duct out of the poster wall over the office's roof, and
   * the flex from it up to the round duct over the crate aisle (the same
   * photos). */
  H.box('whConcrete', 7.6, 4.3, 3.0, P, 4.9, 3.45, { name: 'wall duct' });
  H.cap('whConcrete', [9.4, 4.6, 3.45], [9.4, 8.0, 5.7], 0.2, { name: 'flex duct', kind: 'wall', seg: 8 });
}

/*
 * THE BARANI DOORWAY (Thomas More's word of 15 November 2026: "the opening
 * with the rolls of veneer on top of it", "at the corner of that tall white
 * block and the green block"). At the corner where the poster wall meets
 * the flat wall, at the south end of the green racking: a wood lined
 * opening through the line of the racking, from the crate aisle's side
 * east into the lane along the flat wall, cartons on its header; and
 * north of it one bay of racking, blue uprights and an orange beam, sheet
 * stock stood on edge under the beam in a plywood frame and the rolls of
 * veneer piled on it, their ends to both sides (photos 0374, 0414 and
 * 0427, frame 8.14.08). The rolls and the cartons are drawn and not
 * solid inside one solid, as the gap rule has it.
 */
function baraniDoorway(H) {
  const f = FLOOR0;
  const r = seededRandom(7110);
  const o = OPENINGS.barani;
  const [x0, x1] = [10.1, BLOCK.x0];
  const Y = BLOCK.y1;
  const HEAD = 2.5;
  H.box('whBoard', x0, Y, f, x1, o.y0, HEAD, { name: 'door lining' });
  H.box('whBoard', x0, o.y1, f, x1, o.y1 + 0.12, HEAD, { name: 'door lining' });
  H.box('whBoard', x0, o.y0, o.h1, x1, o.y1, HEAD, { name: 'door lining' });
  const R0 = o.y1 + 0.12;
  const R1 = 16.0;
  rack(H, {
    axis: 'y', a0: R0, a1: R1, bay: R1 - R0, d0: x0, d1: x1, upright: 'whRackTeal', beam: 'whRackOrange', levels: [HEAD - f], top: 3.7,
    load: (put, k, b) => {
      if (k >= 0) {
        return;
      }
      put('whBoard', b.a0 - 0.1, b.a1, x0 + 0.1, x1, b.h, HEAD, { name: 'panels' });
      for (let y = b.a0 + 0.1; y < b.a1 - 0.1; y += 0.22) {
        const m = r.pick(['whCrateDark', 'whWhite', 'whBlack', 'whWhite']);
        H.paint(m, x0 + 0.088, y, b.h + 0.05, x0 + 0.1, y + 0.05, HEAD - 0.1);
        H.paint(m, x1, y, b.h + 0.05, x1 + 0.012, y + 0.05, HEAD - 0.1);
      }
    },
  });
  /* The green upright the racking goes on from. */
  H.box('whGreen', x0, R1 - 0.1, f, x0 + 0.1, R1, f + 4.5, { name: 'upright' });
  /* The rolls on the beam and over the header, end on to both sides, and
   * the cartons on the header's west half (photo 0427). */
  const TOP = HEAD + 1.15;
  const xm = (x0 + x1) / 2;
  H.hidden(x0, Y, HEAD, x1, R1, TOP, 'rolls');
  H.fine('whCrate', x0 + 0.05, Y + 0.05, HEAD, xm, 12.15, HEAD + 0.6, 'carton');
  H.fine('whCrate', x0 + 0.12, 12.2, HEAD, xm, R0 - 0.05, HEAD + 0.42, 'carton');
  H.fine('whWhite', x0 + 0.1, Y + 0.1, HEAD + 0.6, xm - 0.1, 12.0, HEAD + 0.95, 'carton');
  H.paint('whRackOrange', x1, Y, HEAD - 0.12, x1 + 0.012, R0, HEAD);
  const roll = (y, h) => {
    H.cap('whCrate', [y < R0 ? xm + 0.05 : x0 + 0.05, y, h], [x1 - 0.05, y, h], 0.2, { solid: false, seg: 8, name: 'veneer roll' });
  };
  for (let y = Y + 0.28; y < R1 - 0.22; y += 0.42) {
    roll(y, HEAD + 0.2);
  }
  for (let y = Y + 0.49; y < R1 - 0.4; y += 0.42) {
    if (r.chance(0.85)) {
      roll(y, HEAD + 0.56);
    }
  }
  for (const y of [Y + 0.7, R0 + 0.5, R0 + 0.92, R0 + 1.76]) {
    roll(y, HEAD + 0.92);
  }
  /* A white standing desk before the panels on the aisle's side. */
  H.table('whCrate', 9.5, 13.5, x0 + 0.1, 15.3, 1.0, { name: 'desk', topM: 'whWhite', top: 0.06, leg: 0.08 });
}

/*
 * THE OFFICE AREA behind the flat wall (Thomas More's markup of 15
 * November 2026: "Everything in that space is office area"). Solid from
 * the poster wall to the east wall and from the south wall to the flat
 * wall, cream to the roof deck on the two faces the hall sees. Inside, all
 * a pilot can reach: the lunch room behind the open green door in the
 * flat wall (photo 0414 looks in at its cupboards), white, lit; out of
 * its south side the plywood passage, a jacket hung in it (photo 0173 and
 * the reel's frames 66 and 67); and at its end the coat room, white, lit,
 * coats on hooks over a bench, shelves, and the front door out. Everything
 * else in it is solid, not drawn. That the lunch room leads to the passage
 * is a guess: no picture shows the way between them.
 */
function whiteBlock(H) {
  const f = FLOOR0;
  const { x0, x1, y1 } = BLOCK;
  const d = OPENINGS.lunchDoor;
  const [b0, b1, top] = [12.4, 13.6, 2.2];
  const P0 = 5.0;
  const C = { x0: x0 + 0.15, x1: 15.4, h: 2.7 };
  const L = { x0: 12.2, x1: 15.6, y0: 7.6, y1: y1 - 0.12 };
  /* The solid: round the coat room, the passage and the lunch room. */
  H.hidden(x0, 0, C.h, x1, y1, HIGH, 'office area');
  H.hidden(L.x1, 0, f, x1, y1, C.h, 'office area');
  H.hidden(C.x1, 0, f, L.x1, P0, C.h, 'office area');
  H.hidden(x0, 0, f, C.x0, P0, C.h, 'office area');
  H.hidden(x0, P0, f, b0, L.y0, C.h, 'office area');
  H.hidden(b1, P0, f, L.x1, L.y0, C.h, 'office area');
  H.hidden(b0, P0, top, b1, L.y0, C.h, 'office area');
  H.hidden(x0, L.y0, f, L.x0, y1, C.h, 'office area');
  H.hidden(L.x0, L.y1, f, d.x0, y1, C.h, 'office area');
  H.hidden(d.x1, L.y1, f, L.x1, y1, C.h, 'office area');
  H.hidden(d.x0, L.y1, d.h1, d.x1, y1, C.h, 'office area');
  /* Its two faces: the poster wall and the flat wall. */
  H.face('whWall', 'y', x0, -1, OFFICE.y1, y1, 0, HIGH);
  H.face('whWall', 'y', x0, -1, 0, OFFICE.y1, 3.0, HIGH);
  H.faceBut('whWall', 'x', y1, 1, x0, DIG.x1, 0, HIGH, [holeOf(d)]);
  /* The lunch room: white walls and ceiling, grey floor, the cupboards and
   * the counter along its east side, a fridge, a light. */
  H.face('whWhite', 'y', L.x0, 1, L.y0, L.y1, f, C.h);
  H.face('whWhite', 'y', L.x1, -1, L.y0, L.y1, f, C.h);
  H.faceBut('whWhite', 'x', L.y0, 1, L.x0, L.x1, f, C.h, [[b0, b1, f, top]]);
  H.faceBut('whWhite', 'x', L.y1, -1, L.x0, L.x1, f, C.h, [[d.x0, d.x1, f, d.h1]]);
  H.paint('whWhite', L.x0, L.y0, C.h - 0.012, L.x1, L.y1, C.h);
  H.paint('whSteel', L.x0, L.y0, f, L.x1, L.y1, f + 0.012);
  H.paint('whGreen', d.x0, L.y1, f, d.x0 + 0.03, y1, d.h1);
  H.paint('whGreen', d.x1 - 0.03, L.y1, f, d.x1, y1, d.h1);
  H.paint('whGreen', d.x0, L.y1, d.h1 - 0.03, d.x1, y1, d.h1);
  H.box('whCrate', L.x1 - 0.6, 8.3, f, L.x1, L.y1, f + 0.86, { name: 'counter' });
  H.box('whBoard', L.x1 - 0.6, 8.3, f + 0.86, L.x1, L.y1, f + 0.9, { name: 'counter' });
  H.box('whCrate', L.x1 - 0.35, 8.3, f + 1.5, L.x1, L.y1, C.h, { name: 'cupboards' });
  for (let y = 8.9; y < L.y1 - 0.1; y += 0.6) {
    H.paint('whCrateDark', L.x1 - 0.612, y, f + 0.05, L.x1 - 0.6, y + 0.02, f + 0.84);
    H.paint('whCrateDark', L.x1 - 0.362, y, f + 1.52, L.x1 - 0.35, y + 0.02, C.h - 0.03);
  }
  H.box('whWhite', L.x1 - 0.7, L.y0, f, L.x1, 8.3, f + 1.8, { name: 'fridge' });
  H.box('whLamp', 13.3, 9.3, C.h - 0.1, 14.5, 9.6, C.h - 0.012, { name: 'light', cast: false });
  /* The passage's plywood, the jacket hung in it. */
  H.face('whBoard', 'y', b0, 1, P0, L.y0, f, top);
  H.face('whBoard', 'y', b1, -1, P0, L.y0, f, top);
  H.paint('whBoard', b0, P0, top - 0.012, b1, L.y0, top);
  H.box('whBlack', b1 - 0.25, 6.0, f + 0.9, b1, 6.6, f + 1.65, { name: 'jacket' });
  H.fine('whSteel', b1 - 0.06, 5.9, f + 1.65, b1, 6.7, f + 1.7, 'hook rail');
  /* The coat room: white walls and ceiling, the plywood passage's mouth in
   * its north wall, a light, the coats over the bench, the shelves. */
  H.face('whWhite', 'y', C.x0, 1, 0, P0, f, C.h);
  H.face('whWhite', 'y', C.x1, -1, 0, P0, f, C.h);
  H.faceBut('whWhite', 'x', P0, -1, C.x0, C.x1, f, C.h, [[b0, b1, f, top]]);
  const w = OPENINGS.woodDoor;
  H.faceBut('whWhite', 'x', 0, 1, C.x0, C.x1, f, C.h, [[w.x0 - 0.12, w.x1 + 0.12, 0, w.h1 + 0.12]]);
  H.paint('whWhite', C.x0, 0, C.h - 0.012, C.x1, P0, C.h);
  H.box('whLamp', 13.4, 2.3, C.h - 0.1, 14.6, 2.6, C.h - 0.012, { name: 'light', cast: false });
  H.box('whBoard', C.x0, 1.0, f, C.x0 + 0.38, 3.6, f + 0.45, { name: 'bench' });
  H.box('whBlack', C.x0, 1.1, f + 1.0, C.x0 + 0.28, 1.9, f + 1.8, { name: 'coat' });
  H.box('whRed', C.x0, 1.9, f + 1.1, C.x0 + 0.28, 2.5, f + 1.8, { name: 'coat' });
  H.box('whRackTeal', C.x0, 2.5, f + 1.05, C.x0 + 0.28, 3.1, f + 1.8, { name: 'coat' });
  H.box('whSteel', C.x0, 1.0, f + 1.8, C.x0 + 0.08, 3.6, f + 1.85, { name: 'hook rail' });
  H.box('whWhite', C.x1 - 0.4, 0, f, C.x1, 3.4, f + 2.0, { name: 'shelves' });
  for (const h of [0.3, 0.8, 1.3]) {
    H.paint('whCrate', C.x1 - 0.412, 0.1, f + h, C.x1 - 0.4, 3.3, f + h + 0.35);
  }
}

/*
 * THE FLAT WALL, the workshop's south wall (Thomas More's word of 15
 * November 2026: "the wall should be flat with the shelving", "the same
 * wall that leads to the barani doorway"). One cream wall from the barani
 * doorway's corner east to the hallway. Along it from the doorway (photo
 * 0414, taken in the lane looking back at the doorway, and photos 0144 and
 * 0145): a black panel leant on it, the lunch room's green door standing
 * open, a dark window, the first aid cabinet over a heap of cartons, the
 * signs, a green door, shut, with its little window; then the teal
 * racking against it to the hallway's mouth, navy bins, a red tool chest
 * and pails, a yellow cabinet, a grey cabinet, cartons and pallets above,
 * and its last bay half open at the slab with the red carpet in it (the
 * reel's frames 6 and 13 to 15). North of the lane the wooden cubbies and
 * a rack of cartons, and in the lane a cart wrapped in a blue blanket.
 *
 * THE HALLWAY (photos 0151 to 0159, 0415 and 0416, and Thomas's "There's a
 * hallway between the lower wall and the digital department"): past the
 * racking's end the wall runs on east behind plywood sheeted head high,
 * cartons on top of it, and between that and the Digital Department's
 * side the red floored hallway, open to the roof, black boards and a
 * ladder leant along the department's side, to the washroom's door at its
 * end, shut.
 */
function flatWall(H) {
  const f = FLOOR0;
  const r = seededRandom(7105);
  const Y = BLOCK.y1;
  const D = DIG;
  const d = OPENINGS.lunchDoor;
  H.face('whGreen', 'x', Y, 1, d.x0 - 0.1, d.x0, f, d.h1 + 0.1);
  H.face('whGreen', 'x', Y, 1, d.x1, d.x1 + 0.1, f, d.h1 + 0.1);
  H.face('whGreen', 'x', Y, 1, d.x0, d.x1, d.h1, d.h1 + 0.1);
  H.box('whBlack', 12.0, Y, f, 12.6, Y + 0.08, f + 2.0, { name: 'panel' });
  H.face('whWhite', 'x', Y, 1, 14.5, 16.5, 1.1, 2.3);
  H.face('whDeck', 'x', Y + 0.012, 1, 14.58, 16.42, 1.18, 2.22);
  H.box('whWhite', 16.9, Y, f + 1.05, 17.9, Y + 0.28, f + 2.0, { name: 'first aid cabinet' });
  H.paint('whSteel', 17.39, Y + 0.28, f + 1.1, 17.41, Y + 0.292, f + 1.95);
  for (const x of [17.07, 17.57]) {
    H.paint('whRed', x, Y + 0.28, f + 1.68, x + 0.16, Y + 0.292, f + 1.84);
  }
  H.box('whCrate', 16.7, Y, f, 18.2, Y + 0.7, f + 0.55, { name: 'cartons' });
  H.box('whCrate', 16.9, Y, f + 0.55, 17.9, Y + 0.5, f + 1.05, { name: 'cartons' });
  H.face('whWhite', 'x', Y, 1, 17.55, 17.8, 2.22, 2.48);
  H.face('whRed', 'x', Y + 0.012, 1, 17.62, 17.73, 2.28, 2.42);
  H.face('whWhite', 'x', Y, 1, 17.95, 18.42, 2.22, 2.48);
  H.face('whGreen', 'x', Y + 0.012, 1, 18.0, 18.37, 2.25, 2.33);
  H.face('whGreen', 'x', Y, 1, 18.5, 19.6, f, 2.2);
  H.face('whSteel', 'x', Y + 0.012, 1, 18.85, 19.25, 1.25, 1.6);
  H.face('whSteel', 'x', Y + 0.012, 1, 18.62, 19.48, 1.95, 2.0);
  H.face('whDeck', 'x', Y, 1, 18.7, 19.45, 2.3, 3.1);
  H.paint('whSteel', 12.0, Y, f, 19.7, Y + 0.9, f + 0.012);
  /* The teal racking, four bays to the hallway's mouth. */
  const A1 = D.x0;
  const A0 = A1 - 4 * 2.1;
  const box = (m, a0, a1, d0, d1, h0, h1, name) => H.box(m, a0, Y + d0, h0, a1, Y + d1, h1, { name });
  rack(H, {
    axis: 'x', a0: A0, a1: A1, d0: Y, d1: Y + SR, bay: 2.1, upright: 'whRackTeal', beam: 'whRackTeal', levels: [1.6, 3.1, 4.6],
    load: (put, k, b) => {
      if (k < 0) {
        if (b.i === 0) {
          /* The wall of navy parts bins: one block, the rows painted on. */
          box('whDeck', b.a0 - 0.1, b.a1, 0, 0.55, b.h, b.h + 1.72, 'bins');
          for (let z = 0.3; z < 1.6; z += 0.3) {
            H.paint('whBlack', b.a0 - 0.1, Y + 0.55, b.h + z, b.a1, Y + 0.562, b.h + z + 0.03);
          }
        } else if (b.i === 1) {
          box('whRed', b.a0 - 0.1, b.a0 + 0.9, 0, 0.6, b.h, b.h + 1.0, 'tool chest');
          box('whWhite', b.a0 + 1.4, b.a1, 0, 0.4, b.h, b.h + 0.42, 'pails');
          H.face('whBoard', 'x', Y, 1, b.a0 + 1.0, b.a1 - 0.1, 0.9, 1.5);
        } else if (b.i === 2) {
          box('whYellow', b.a0 - 0.1, b.a1, 0, 1.0, b.h, b.h + 1.2, 'cabinet');
          const c = (b.a0 + b.a1) / 2;
          H.paint('whCrateDark', c - 0.02, Y + 1.0, b.h + 0.05, c + 0.02, Y + 1.012, b.h + 1.15);
        } else {
          box('whConcrete', b.a0 - 0.1, b.a0 + 0.85, 0, 0.55, b.h, b.h + 1.72, 'cabinet');
          H.paint('whSteel', b.a0 + 0.36, Y + 0.55, b.h + 0.05, b.a0 + 0.38, Y + 0.562, b.h + 1.67);
        }
        return;
      }
      if (r.chance(0.95)) {
        /* The whole bay, upright to upright, or short of it by more than
         * a whoop: never a hand's width, which is a slot. */
        const w = r.chance(0.6) ? b.a1 - b.a0 : r.range(1.2, b.a1 - b.a0 - 0.7);
        const h = k === 2 ? r.range(0.3, 0.6) : r.range(0.4, 1.0);
        box(r.pick(['whCrate', 'whCrate', 'whWhite']), b.a0 - 0.1, b.a0 + w, 0, 0.9, b.h, b.h + h, 'carton');
      }
    },
  });
  /* The red carpet in the open bay, on the slab before the grey door and
   * down the hallway. */
  H.paint('whRed', A1 - 1.1, Y, f, A1, Y + SR, f + 0.012);
  H.paint('whRed', A1 - 1.8, Y + SR, f, D.x0, D.y0 + 1.6, f + 0.012);
  H.paint('whRed', D.x0, Y + SR, f, D.x1, D.y0, f + 0.012);
  /* The plywood along the wall, its joints, and what is stood on it. */
  H.box('whBoard', D.x0, Y, f, D.x1, Y + SR, f + 2.4, { name: 'plywood' });
  for (let x = D.x0 + 1.22; x < D.x1 - 0.1; x += 1.22) {
    H.paint('whCrateDark', x - 0.015, Y + SR, f, x + 0.015, Y + SR + 0.012, f + 2.4);
  }
  for (const [a, b, h, m] of [[28.6, 30.4, 0.5, 'whCrate'], [31.2, 33.0, 0.8, 'whWhite'], [35.0, 36.6, 0.45, 'whCrate'], [37.4, 39.4, 0.7, 'whCrate']]) {
    H.box(m, a, Y, f + 2.4, b, Y + 0.9, f + 2.4 + h, { name: 'carton' });
  }
  /* The Digital Department's side: the black boards and a ladder. */
  for (const [a, b, h] of [[29.6, 30.9, 2.1], [31.0, 32.4, 1.9], [33.4, 34.7, 2.2], [34.8, 36.0, 1.8]]) {
    H.face('whBlack', 'x', D.y0, -1, a, b, 0.25, h);
    H.face('whDeck', 'x', D.y0 - 0.012, -1, a + 0.06, b - 0.06, 0.31, h - 0.06);
  }
  H.ladder('whYellow', 37.2, D.y0 - 0.2, 37.8, D.y0, 2.2, 'x');
  /* The hallway's end: the washroom's wall and its door, shut. */
  H.face('whWhite', 'y', D.x1, -1, Y, D.y0, 0, HIGH);
  H.face('whSteel', 'y', D.x1 - 0.012, -1, Y + SR + 0.3, Y + SR + 1.25, f, 2.1);
  H.face('whYellow', 'y', D.x1 - 0.012, -1, Y + SR + 0.55, Y + SR + 1.0, 2.2, 2.4);
  /* North of the lane: the wooden cubbies, their red bins, and a bay of
   * racking with cartons to the top (photo 0414's right hand). */
  H.box('whCrateDark', 14.2, 14.3, f, 17.3, 14.9, f + 2.0, { name: 'cubbies' });
  for (const h of [0.5, 1.0, 1.5]) {
    H.paint('whBoard', 14.2, 14.288, f + h, 17.3, 14.3, f + h + 0.04);
  }
  for (let x = 14.4; x < 17.0; x += 0.5) {
    H.paint('whRed', x, 14.288, f + 1.08, x + 0.3, 14.3, f + 1.3);
  }
  rack(H, {
    axis: 'x', a0: 17.9, a1: 19.7, bay: 1.8, d0: 14.3, d1: 15.3, upright: 'whRackOrange', beam: 'whRackTeal', levels: [1.5, 3.0], top: 4.4,
    load: (put, k, b) => {
      const h = k < 0 ? 1.62 : r.range(0.7, 1.1);
      put(k < 0 ? 'whBoard' : 'whCrate', b.a0 - 0.1, b.a1, 14.3, 15.3, b.h, b.h + h, { name: 'carton' });
    },
  });
  /* The cart wrapped in a blue blanket, in the lane. */
  H.box('whBoard', 14.9, 12.75, f, 15.8, 13.45, f + 0.15, { name: 'dolly' });
  H.box('whRackTeal', 15.0, 12.8, f + 0.15, 15.7, 13.4, f + 1.75, { name: 'wrapped cart' });
}

/* ------------------------------------------------------------------ */
/* The workshop                                                        */
/* ------------------------------------------------------------------ */

function workshop(H) {
  const f = FLOOR0;
  const r = seededRandom(7105);
  /* The partition's racking: teal from the sliding door's track north,
   * orange beyond it, and the black display box on the orange rack's top
   * (frames 8.11.19, 8.11.32 and 8.14.38). */
  const load = (top) => (put, k, b) => {
    if (k >= top || (k >= 0 && !r.chance(0.95))) {
      return;
    }
    const h = k < 0 ? r.range(0.7, 1.3) : r.range(0.6, 1.05);
    const m = r.pick(['whCrate', 'whWhite', 'whCrate', 'whBlack']);
    const l = r.chance(0.6) ? b.a1 - b.a0 : r.range(1.2, b.a1 - b.a0 - 0.6);
    put(m, b.a0 - 0.1, b.a0 + l, 30.95, 31.95, b.h, b.h + h, { name: 'carton' });
  };
  rack(H, {
    axis: 'y', a0: OPENINGS.slidingDoor.y1 + 1.9, a1: 38.0, d0: 30.85, d1: PX, upright: 'whRackTeal', beam: 'whRackTeal', levels: [1.6, 3.1, 4.6], load: load(2),
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
  H.bench(19.2, 36.0, 21.0, 38.4);
  H.bench(19.2, 42.0, 21.0, 44.4);
  H.box('whRed', 19.5, 42.4, f + 0.92, 20.2, 42.8, f + 1.2, { name: 'tool' });
  H.table('whBoard', 21.0, 15.2, 23.4, 16.4, 0.85, { name: 'table', topM: 'whWhite', top: 0.08 });
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
  /* White carcasses on a pallet. */
  for (const y of [46.0]) {
    H.box('whCrateDark', 26.6, y, f, 29.2, y + 0.8, f + 0.15, { name: 'pallet' });
    H.box('whWhite', 26.65, y + 0.05, f + 0.15, 29.15, y + 0.75, f + 1.15, { name: 'carcass' });
    for (const x of [27.45, 28.3]) {
      H.paint('whCrate', x, y + 0.038, f + 0.2, x + 0.04, y + 0.05, f + 1.1);
    }
  }
  /* The south west of the workshop, where the crates stop: plywood on a
   * pallet. */
  H.box('whCrateDark', 12.4, 15.6, f, 14.8, 17.0, f + 0.15, { name: 'pallet' });
  H.box('whBoard', 12.45, 15.65, f + 0.15, 14.75, 16.95, f + 0.9, { name: 'plywood' });
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
  H.box('whCrateDark', 19.4, 47.5, f, 21.8, 48.7, f + 0.15, { name: 'pallet' });
  H.box('whWhite', 19.45, 47.55, f + 0.15, 21.75, 48.65, f + 1.1, { name: 'panels' });
  /* Plywood stacked on spacers against the dock wall short of the back
   * door's corner, head high and more, each a different height, the spacers'
   * edges showing (frame 8.13.05 and the photos facing the doorway); past
   * them, in the corner, the exit door (photo 0131). */
  for (const [x0, x1, h] of [[23.4, 26.4, 3.0], [26.4, 29.2, 3.3]]) {
    H.box('whBoard', x0, 54.4, f, x1, DEP, f + h, { name: 'plywood stack' });
    for (let z = 0.35; z < h - 0.1; z += r.range(0.32, 0.5)) {
      H.paint('whCrateDark', x0, 54.388, f + z, x1, 54.4, f + z + 0.1);
    }
  }
  /* A white sheet on a dolly by the machine room's doorway. */
  H.box('whBoard', 28.0, 51.8, f, 30.6, 52.3, f + 0.2, { name: 'dolly' });
  H.box('whWhite', 28.0, 52.0, f + 0.2, 30.6, 52.1, f + 1.6, { name: 'sheet' });
  /* Tall cartons stood at the orange rack's end, by the cubby. */
  H.box('whCrate', 30.8, 47.6, f, PX, 48.6, f + 1.9, { name: 'cartons' });
  /* The exit door standing open, white, its red frame and its exit sign
   * (photo 0131). */
  const d = OPENINGS.backDoor;
  H.box('whWhite', d.x1, 54.8, f, d.x1 + 0.06, DEP, d.h1 - 0.05, { name: 'door leaf' });
  H.exitSign('x', DEP, -1, (d.x0 + d.x1) / 2, 2.45);
  H.face('whRed', 'x', DEP, -1, d.x0 - 0.1, d.x0, f, d.h1 + 0.1);
  H.face('whRed', 'x', DEP, -1, d.x1, d.x1 + 0.1, f, d.h1 + 0.1);
  H.face('whRed', 'x', DEP, -1, d.x0, d.x1, d.h1, d.h1 + 0.1);
  /* The north wall at the corner: the exhaust fan's box, a grey switch
   * box and a run of conduit. */
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
 * columns at y 34.2 below 1.4 m, the cross aisle at y 21.3 and the lane
 * along the flat wall to the barani doorway.
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
  /* The west of the workshop (frame 8.11.19's left half). */
  roller(12.6, 18.4, 13.5, 19.7);
  H.bench(15.8, 16.4, 17.6, 18.8, { topM: 'whBoard' });
  /* Down the middle, west of the low line. */
  H.bench(19.0, 24.6, 22.6, 26.2, { topM: 'whBoard' });
  H.box('whWhite', 19.4, 24.9, f + 0.92, 20.4, 25.6, f + 1.2, { name: 'box' });
  roller(19.4, 39.8, 21.6, 40.8);
  carcass(21.2, 50.6, 23.3, 51.6, 1.0);
  /* The blue step ladder open on the slab, and the red hand truck. */
  H.box('whRackTeal', 19.0, 16.0, f, 19.07, 16.07, f + 1.8, { name: 'ladder' });
  H.box('whRackTeal', 19.53, 16.0, f, 19.6, 16.07, f + 1.8, { name: 'ladder' });
  H.box('whRackTeal', 19.0, 16.73, f, 19.07, 16.8, f + 1.6, { name: 'ladder' });
  H.box('whRackTeal', 19.53, 16.73, f, 19.6, 16.8, f + 1.6, { name: 'ladder' });
  H.box('whRackTeal', 19.0, 16.0, f + 1.74, 19.6, 16.8, f + 1.8, { name: 'ladder' });
  H.box('whRed', 22.0, 27.6, f, 22.6, 27.9, f + 0.08, { name: 'hand truck' });
  H.box('whRed', 22.0, 27.9, f, 22.06, 27.96, f + 1.2, { name: 'hand truck' });
  H.box('whRed', 22.54, 27.9, f, 22.6, 27.96, f + 1.2, { name: 'hand truck' });
  /* East of the low line: rolling benches, carcasses, a panel cart. */
  roller(26.2, 28.6, 28.6, 29.6);
  carcass(25.8, 48.6, 27.4, 49.6, 0.9);
  /* The panel cart: a dolly with sheets stood on edge in it. */
  H.box('whBoard', 26.0, 40.6, f, 27.8, 41.4, f + 0.2, { name: 'dolly' });
  H.box(r.pick(['whBoard', 'whWhite']), 26.1, 40.85, f + 0.2, 27.7, 41.15, f + 1.6, { name: 'sheets' });
  fan(23.0, 19.2);
  fan(26.4, 33.0);
  /* The dock end (frames 8.11.54 and the photo up the crate aisle): a
   * yellow cart against the green racking by the forklift, a red bag and a
   * hand truck on the orange side, and low white cabinets on the slab
   * north of the dock lane. */
  H.box('whYellow', 9.3, 46.0, f, 10.1, 47.4, f + 0.06, { name: 'cart' });
  H.box('whYellow', 9.3, 46.0, f + 0.9, 10.1, 47.4, f + 0.96, { name: 'cart' });
  for (const [cx, cy] of [[9.3, 46.0], [10.04, 46.0], [9.3, 47.34], [10.04, 47.34]]) {
    H.box('whYellow', cx, cy, f, cx + 0.06, cy + 0.06, f + 1.0, { name: 'cart' });
  }
  H.box('whWhite', 9.4, 46.1, f + 0.96, 10.0, 47.3, f + 1.3, { name: 'box' });
  H.box('whRed', 6.4, 46.4, f, 7.1, 47.6, f + 0.45, { name: 'bag' });
  H.box('whSteel', 6.4, 47.6, f, 6.46, 47.66, f + 1.2, { name: 'hand truck' });
  H.box('whSteel', 7.04, 47.6, f, 7.1, 47.66, f + 1.2, { name: 'hand truck' });
  for (const [x0, x1] of [[12.6, 14.0]]) {
    H.box('whWhite', x0, 50.4, f, x1, 51.2, f + 0.9, { name: 'cabinet' });
    H.paint('whSteel', x0, 50.388, f + 0.08, x1, 50.4, f + 0.11);
    H.paint('whSteel', (x0 + x1) / 2 - 0.01, 50.388, f + 0.15, (x0 + x1) / 2 + 0.01, 50.4, f + 0.85);
  }
  /* The Digital Department's corner (photos 0147, 0415 and 0416, and
   * frame 8.11.19's right half): against its white face north of the grey
   * door a bay of racking, orange uprights, teal beams, pallets of cartons
   * on the beams and on the slab; a pallet of flat cartons on the slab
   * before it; and in the nook north of the department, the tan drawer
   * cabinet against its side, a yellow cabinet against the partition by
   * the sliding door, grey panels and a red sign plate on the wall. */
  rack(H, {
    axis: 'y', a0: 16.0, a1: 18.8, d0: DIG.x0 - 1.15, d1: DIG.x0, upright: 'whRackOrange', beam: 'whRackTeal', levels: [1.6, 3.1], top: 3.6,
    load: (put, k, b) => {
      const h = k < 0 ? r.range(0.6, 1.2) : r.range(0.5, 0.9);
      put(k < 0 ? 'whWhite' : 'whCrate', b.a0 - 0.2, b.a1 + 0.2, DIG.x0 - 1.05, DIG.x0, b.h, b.h + h, { name: 'carton' });
    },
  });
  H.box('whCrateDark', 25.5, 16.5, f, 26.6, 18.3, f + 0.15, { name: 'pallet' });
  H.box('whCrate', 25.55, 16.55, f + 0.15, 26.55, 18.25, f + 0.75, { name: 'cartons' });
  H.box('whBoard', 28.6, DIG.notch, f, 29.8, DIG.notch + 0.6, f + 1.3, { name: 'cabinet' });
  for (const h of [0.45, 0.88]) {
    H.paint('whCrateDark', 28.65, DIG.notch + 0.6, f + h, 29.75, DIG.notch + 0.612, f + h + 0.03);
  }
  H.box('whYellow', PX - 0.65, 19.9, f, PX, 21.1, f + 1.65, { name: 'cabinet' });
  H.paint('whCrateDark', PX - 0.662, 20.49, f + 0.05, PX - 0.65, 20.51, f + 1.6);
  H.face('whSteel', 'y', PX - 0.012, -1, 21.5, 22.7, 0.3, 2.3);
  H.face('whRed', 'y', PX - 0.012, -1, 20.0, 21.0, 2.6, 3.4);
}

/*
 * THE WORKSHOP FLOOR, the fifth pass of 4 November 2026: the big assembly
 * tables the photos are full of, white topped on plywood cupboards, a row
 * of them each side of the clear aisle down the middle (photos 0137 to
 * 0142, frames 8.11.32 and 8.12.45), the white topped table on sawhorses
 * by the sliding door (frame 8.11.19).
 * Each 0.6 m or more from its neighbours or touching, so no slot; tables
 * are cupboards, not flown under, but the aisle at x 23.4 to 25.0, the
 * cross aisle and the start stay as they were.
 */
function shopFloor(H) {
  const f = FLOOR0;
  const r = seededRandom(7108);
  const big = (x0, y0, x1, y1, top = 'whWhite') => {
    H.bench(x0, y0, x1, y1, { topM: top, baseM: 'whCrate' });
    for (const x of [x0 + (x1 - x0) / 3, x0 + (2 * (x1 - x0)) / 3]) {
      H.paint('whCrateDark', x - 0.015, y0 + 0.068, f + 0.1, x + 0.015, y0 + 0.08, f + 0.78);
    }
  };
  /* West of the aisle. */
  big(18.7, 27.0, 21.4, 28.4);
  big(19.0, 32.4, 22.6, 33.6, 'whSteel');
  big(18.7, 45.0, 22.3, 46.2);
  /* East of it. */
  big(25.6, 20.6, 28.4, 22.0, 'whSteel');
  big(25.6, 31.0, 28.4, 32.4);
  big(25.6, 37.0, 28.4, 38.4);
  big(25.6, 42.6, 28.0, 44.0, 'whSteel');
  /* What stands on them: boxes, offcuts, a tool or two. */
  for (const [x, y] of [[19.2, 27.3], [26.0, 21.0], [20.4, 32.7], [26.0, 31.3], [27.2, 37.4], [19.4, 45.3]]) {
    const w = r.range(0.4, 0.8);
    H.box(r.pick(['whCrate', 'whWhite', 'whRed', 'whCrate']), x, y, f + 0.92, x + w, y + 0.5, f + 0.92 + r.range(0.12, 0.35), { name: 'box' });
  }
  /* The things stood between them a head high and more: white cabinet
   * towers, carcasses stacked on carts, shrink wrapped bundles (frames
   * 8.11.19 and 8.11.32 are full of them). */
  for (const [x0, y0, x1, y1, h, m] of [
    [18.7, 22.6, 19.3, 23.2, 2.2, 'whWhite'], [21.8, 36.4, 22.8, 38.4, 1.6, 'whWhite'],
    [21.6, 42.4, 22.6, 43.6, 1.9, 'whWhite'], [18.8, 29.0, 19.4, 30.2, 2.0, 'whCrate'],
    [25.6, 26.6, 26.6, 28.0, 1.7, 'whWhite'],
    [25.6, 39.0, 26.8, 40.0, 1.5, 'whCrate'], [29.6, 45.0, 30.4, 46.2, 1.6, 'whWhite'],
  ]) {
    H.box(m, x0, y0, f, x1, y1, f + h, { name: 'cabinets' });
    H.paint('whSteel', x0, y0 - 0.012, f + h * 0.5, x1, y0, f + h * 0.5 + 0.03);
  }
  /* The white topped table on sawhorses by the sliding door. */
  H.table('whBoard', 27.2, 23.2, 30.2, 24.6, 0.85, { name: 'table', topM: 'whWhite', top: 0.06, leg: 0.08 });
  /* Pallets of cartons by the racking. */
  for (const [x0, y0, x1, y1, h] of [[29.2, 26.4, 30.4, 27.6, 1.2], [29.4, 35.0, 30.4, 36.4, 1.0]]) {
    H.box('whCrateDark', x0, y0, f, x1, y1, f + 0.15, { name: 'pallet' });
    H.box('whCrate', x0 + 0.05, y0 + 0.05, f + 0.15, x1 - 0.05, y1 - 0.05, f + h, { name: 'cartons' });
  }
}

/* ------------------------------------------------------------------ */
/* The partition                                                       */
/* ------------------------------------------------------------------ */

function partition(H) {
  const f = FLOOR0;
  const o = OPENINGS;
  const D = DIG;
  const holes = [holeOf(o.slidingDoor), holeOf(o.cncDoor)];
  /* Drywall to the roof, the colour of the mud, from the Digital
   * Department's corner to the dock wall; the wall between the paint shop
   * and the machine room; the paint shop's south wall, cream; and east of
   * the paint shop and the department the rooms nobody flies in, solid. */
  H.wall('whWhite', 'y', PX + PT / 2, D.notch, DEP, 0, HIGH, PT, holes, 'partition');
  H.wall('whWhite', 'x', RY + PT / 2, PX + PT, LEN, 0, HIGH, PT, [], 'room wall');
  H.wall('whWall', 'x', D.y1 + PT / 2, PX + PT, D.x1, 0, HIGH, PT, [], 'paint shop wall');
  H.hidden(D.x1, BLOCK.y1, 0, LEN, RY, HIGH, 'east rooms');
  /* THE DIGITAL DEPARTMENT's walls, white to the roof: its west face
   * stands out into the workshop past the partition's line (photos 0147,
   * 0415 and 0416), the grey door in it at the hallway's corner. */
  H.wall('whWhite', 'y', D.x0 + 0.06, D.y0, D.notch, 0, HIGH, 0.12, [holeOf(o.greyDoor)], 'digital wall');
  H.wall('whWhite', 'x', D.y0 + 0.06, D.x0 + 0.12, D.x1, 0, HIGH, 0.12, [], 'digital wall');
  H.wall('whWhite', 'x', D.notch - 0.06, D.x0 + 0.12, PX, 0, HIGH, 0.12, [], 'digital wall');
  /* The partition's west face: taped sheets from the department's corner
   * to the dock wall, round the sliding door, the white door and the
   * cubby; the paint shop's walls cream, taped over its booths; the
   * machine room's side of both walls taped. */
  H.taped('y', PX, -1, D.notch, DEP, 0, HIGH, [...holes, [48.1, 51.8, 0, 2.7]]);
  H.taped('y', PX + PT, 1, RY + PT, DEP, 0, HIGH, holes);
  H.faceBut('whWall', 'y', PX + PT, 1, SHOP_S, RY, 0, HIGH, holes);
  H.face('whWall', 'y', D.x1, -1, SHOP_S, RY, 0, HIGH);
  H.taped('x', RY, -1, PX + PT, D.x1, 0, HIGH);
  H.taped('x', RY + PT, 1, PX + PT, LEN, 0, HIGH);
  /* The machine room's doorway: nothing but the opening, as it is. South
   * of it the white door, shut, with its little window and its signs, and
   * the recessed cubby with a red sign in it. */
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
   * opening's north side; its yellow warning plate and window. Inside, the
   * same grey with its plate beside the opening, and the exit sign over
   * them (frame 8.15.03). */
  const s = o.slidingDoor;
  H.box('whSteel', PX - 0.1, s.y1, f, PX - 0.02, s.y1 + 1.6, s.h1 + 0.05, { name: 'sliding door' });
  H.box('whSteel', PX - 0.15, s.y0 - 0.2, s.h1 + 0.05, PX, s.y1 + 1.8, s.h1 + 0.2, { name: 'door track' });
  H.face('whYellow', 'y', PX - 0.1, -1, s.y1 + 0.5, s.y1 + 1.2, 1.7, 2.05);
  H.face('whDeck', 'y', PX - 0.1, -1, s.y1 + 0.7, s.y1 + 0.9, 1.1, 1.5);
  const out = PX + PT + 0.012;
  H.face('whSteel', 'y', out, 1, s.y1, s.y1 + 1.6, f, s.h1 + 0.05);
  H.face('whYellow', 'y', out + 0.012, 1, s.y1 + 0.4, s.y1 + 0.9, 1.9, 2.15);
  H.exitSign('y', out, 1, s.y1, s.h1 + 0.3);
  /* The grey door into the Digital Department, in its west face at the
   * hallway's corner (photos 0151 and 0153): its grey frame, the red
   * notice over it, and the door standing open inside against the wall,
   * its paper sign on it. Shut in the photos and the flight's frames,
   * open in the reel's. */
  const g = o.greyDoor;
  H.face('whSteel', 'y', D.x0, -1, g.y0 - 0.08, g.y0, f, g.h1 + 0.08);
  H.face('whSteel', 'y', D.x0, -1, g.y1, g.y1 + 0.08, f, g.h1 + 0.08);
  H.face('whSteel', 'y', D.x0, -1, g.y0, g.y1, g.h1, g.h1 + 0.08);
  H.box('whSteel', D.x0 + 0.12, g.y1, f, D.x0 + 0.17, g.y1 + 0.95, g.h1 - 0.02, { name: 'door leaf' });
  H.face('whWhite', 'y', D.x0 + 0.17, 1, g.y1 + 0.25, g.y1 + 0.7, 1.35, 1.7);
  H.face('whRed', 'y', D.x0, -1, g.y0 + 0.15, g.y1 - 0.15, 2.3, 2.55);
}

/* ------------------------------------------------------------------ */
/* The paint shop                                                      */
/* ------------------------------------------------------------------ */

/*
 * The spray room, from Thomas More's photo taken in its doorway (0418,
 * 15 November 2026) and his markup of the plan: long and narrow, north
 * from the sliding door at its south west corner, cream walls. At its far
 * end two booths side by side against the taped wall, the wide one on the
 * left and a smaller one on the right, each a white hood over a dark
 * filter wall and a round flue to the roof. The big square duct along the
 * left wall under the roof, wide by the door and narrower on to the left
 * booth's hood. On the left wall a white wall cabinet over a counter of
 * tins; in the room low work tables with cabinet parts on them, a cart
 * with a little wooden bureau on it, drying racks left of the middle; on
 * the right wall flat dollies and a sign leant on it, a black drum, a tall
 * cabinet with a mirror door, pails, a table and a chair by the right
 * booth; lights hung low on chains down the middle.
 */
function sprayRoom(H) {
  const f = FLOOR0;
  const r = seededRandom(7106);
  const X0 = PX + PT;
  const X1 = DIG.x1;
  const booth = (x0, x1, depth, hood) => {
    const back = RY - 0.4;
    const lip = RY - depth;
    H.box('whSteel', x0, back, f, x1, RY, f + 2.5, { name: 'filter wall' });
    for (let x = x0 + 0.5; x < x1 - 0.2; x += 0.5) {
      H.paint('whBlack', x - 0.02, back - 0.012, f, x + 0.02, back, f + 2.5);
    }
    for (let h = 0.5; h < 2.5; h += 0.5) {
      H.paint('whBlack', x0 + 0.15, back - 0.012, f + h - 0.02, x1 - 0.15, back, f + h + 0.02);
    }
    H.box('whWhite', x0, lip, f + 2.5, x1, RY, f + 2.5 + hood, { name: 'hood' });
    H.paint('whSteel', x0, lip - 0.012, f + 2.5, x1, lip, f + 2.68);
    H.box('whWhite', x0, lip, f, x0 + 0.15, back, f + 2.5, { name: 'booth side' });
    H.box('whWhite', x1 - 0.15, lip, f, x1, back, f + 2.5, { name: 'booth side' });
    return lip;
  };
  const lipW = booth(X0, 36.5, 2.6, 1.0);
  const lipE = booth(37.1, X1, 2.2, 0.8);
  H.paint('whBlack', 33.8, lipW - 0.012, f + 2.85, 34.8, lipW, f + 3.3);
  H.paint('whWhite', 33.88, lipW - 0.024, f + 2.91, 34.72, lipW - 0.012, f + 3.24);
  H.paint('whDeck', 37.9, lipE - 0.012, f + 2.78, 39.4, lipE, f + 3.12);
  H.paint('whWhite', 38.3, RY - 0.412, f + 1.2, 38.9, RY - 0.4, f + 1.8);
  H.table('whBoard', 33.6, RY - 1.6, 35.0, RY - 1.2, 0.8, { name: 'sawhorse', top: 0.08, leg: 0.06 });
  H.cap('whConcrete', [34.3, RY - 0.9, f + 3.5], [34.3, RY - 0.9, HIGH], 0.3, { name: 'flue', kind: 'wall', seg: 8 });
  H.cap('whConcrete', [38.6, RY - 0.8, f + 3.3], [38.6, RY - 0.8, HIGH], 0.25, { name: 'flue', kind: 'wall', seg: 8 });
  /* The square duct, galvanised: the wide part by the door, the narrower
   * run on, and down into the left booth's hood. */
  H.box('whConcrete', X0, 25.2, 5.1, X0 + 1.5, 30.8, 6.2, { name: 'square duct' });
  H.box('whConcrete', X0, 30.8, 5.4, X0 + 1.0, 35.8, 6.1, { name: 'square duct' });
  H.box('whConcrete', X0, 34.6, f + 3.5, X0 + 1.0, 35.8, 5.4, { name: 'square duct' });
  for (let y = 26.6; y < 30.5; y += 1.4) {
    H.paint('whSteel', X0 + 1.5, y, 5.1, X0 + 1.512, y + 0.05, 6.2);
  }
  /* The lights on their chains. */
  for (const y of [25.6, 28.8, 32.0]) {
    H.box('whLamp', 35.2, y - 0.25, 3.9, 37.6, y + 0.25, 4.05, { name: 'light' });
    for (const x of [35.5, 37.27]) {
      H.fine('whSteel', x, y - 0.015, 4.05, x + 0.03, y + 0.015, 6.2, 'chain');
    }
  }
  /* The left wall: the wall cabinet, the counter and its tins. */
  H.box('whWhite', X0, 26.6, f + 1.45, X0 + 0.35, 28.0, f + 2.15, { name: 'wall cabinet' });
  H.paint('whSteel', X0 + 0.35, 27.29, f + 1.48, X0 + 0.362, 27.31, f + 2.12);
  H.box('whCrateDark', X0, 26.5, f, X0 + 0.75, 30.5, f + 0.84, { name: 'counter' });
  H.box('whBoard', X0, 26.5, f + 0.84, X0 + 0.75, 30.5, f + 0.9, { name: 'counter' });
  for (let y = 26.7; y < 30.3; y += 0.3) {
    H.fine(r.pick(['whWhite', 'whSteel', 'whYellow', 'whWhite']), X0 + 0.22, y, f + 0.9, X0 + 0.4, y + 0.18, f + 1.08, 'tin');
  }
  /* The work tables: cabinet parts on a low table, a tray on a black one,
   * the cart with the little bureau. */
  H.table('whCrateDark', 33.6, 25.4, 35.0, 27.4, 0.62, { name: 'table', topM: 'whBoard' });
  H.box('whCrate', 33.75, 25.6, f + 0.62, 34.85, 27.2, f + 1.15, { name: 'cabinet parts' });
  for (const y of [26.13, 26.67]) {
    H.paint('whCrateDark', 34.85, y, f + 0.64, 34.862, y + 0.02, f + 1.13);
  }
  H.table('whBlack', 35.6, 27.4, 36.8, 29.0, 0.6, { name: 'table' });
  H.box('whCrate', 35.75, 27.6, f + 0.6, 36.65, 28.8, f + 0.78, { name: 'tray' });
  H.table('whSteel', 35.9, 29.7, 36.9, 30.9, 0.75, { name: 'cart', topM: 'whBoard', top: 0.06, leg: 0.06 });
  H.box('whCrate', 36.0, 29.85, f + 0.75, 36.8, 30.75, f + 1.55, { name: 'bureau' });
  /* Drying racks on wheels: a frame of four posts and a stack of thin
   * shelves, drawn, inside the one solid of the whole rack. */
  for (const [x, y] of [[33.7, 29.0], [33.7, 31.5], [35.3, 31.5]]) {
    const [x1, y1] = [x + 0.9, y + 1.4];
    H.hidden(x, y, f, x1, y1, f + 2.1, 'drying rack');
    for (const [px, py] of [[x, y], [x1 - 0.05, y], [x, y1 - 0.05], [x1 - 0.05, y1 - 0.05]]) {
      H.fine('whCrateDark', px, py, f, px + 0.05, py + 0.05, f + 2.1, 'rack post');
    }
    for (let h = 0.25; h < 2.05; h += 0.2) {
      H.fine('whBoard', x, y, f + h, x1, y1, f + h + 0.03, 'rack shelf');
    }
  }
  /* The right wall: the sign and the dollies leant on it, the drum and
   * its pail, the cabinet with the mirror door, pails; the table and the
   * chair by the right booth. */
  H.box('whWhite', X1 - 0.2, 23.4, f, X1, 24.4, f + 2.3, { name: 'sign' });
  H.paint('whGreen', X1 - 0.212, 23.4, f, X1 - 0.2, 23.46, f + 2.3);
  H.box('whCrateDark', X1 - 0.35, 25.0, f, X1, 27.4, f + 1.25, { name: 'dollies' });
  for (const y of [25.6, 26.2, 26.8]) {
    H.paint('whBoard', X1 - 0.362, y, f, X1 - 0.35, y + 0.03, f + 1.25);
  }
  H.box('whBlack', X1 - 0.55, 28.9, f, X1, 29.45, f + 0.9, { name: 'drum' });
  H.box('whWhite', X1 - 0.45, 29.0, f + 0.9, X1 - 0.1, 29.35, f + 1.2, { name: 'pail' });
  H.box('whCrateDark', X1 - 0.65, 30.2, f, X1, 31.8, f + 2.1, { name: 'mirror cabinet' });
  H.face('whConcrete', 'y', X1 - 0.65, -1, 30.25, 31.0, 0.1, 2.05);
  H.face('whSteel', 'y', X1 - 0.662, -1, 30.99, 31.01, 0.1, 2.05);
  H.box('whWhite', X1 - 0.32, 32.4, f, X1, 33.1, f + 0.38, { name: 'pails' });
  H.table('whBoard', 37.9, 33.2, 39.2, 34.0, 0.8, { name: 'table', top: 0.06, leg: 0.06 });
  H.box('whBlack', 38.3, 32.2, f, 38.8, 32.7, f + 0.95, { name: 'chair' });
}

/* ------------------------------------------------------------------ */
/* The machine room                                                    */
/* ------------------------------------------------------------------ */

/* A dust collector against the east wall: its bin, the row of tan socks
 * hung from a rail into it, the hangers to the roof and its pipe up. */
function collector(H, y0, y1, x0) {
  const f = FLOOR0;
  H.box('whConcrete', x0, y0, f, LEN, y1, f + 0.9, { name: 'collector bin' });
  H.box('whSteel', x0 + 0.1, y0, 3.25, x0 + 0.2, y1, 3.35, { name: 'sock rail' });
  for (const y of [y0, y1 - 0.1]) {
    H.box('whSteel', x0 + 0.1, y, 3.35, x0 + 0.2, y + 0.1, 6.2, { name: 'hanger' });
  }
  for (let y = y0; y < y1 - 0.2; y += 0.8) {
    H.box('whCrate', x0, y, f + 0.9, x0 + 0.3, y + 0.3, 3.25, { name: 'sock' });
  }
  H.cap('whConcrete', [x0 + 0.45, (y0 + y1) / 2, 3.35], [x0 + 0.45, (y0 + y1) / 2, 6.2], 0.2, { name: 'dust pipe', kind: 'wall', seg: 8 });
}

/* A sliding table saw: its cast body, the long sliding table on its east
 * side, the outrigger, the blade guard on its arm. Running along x. */
function slider(H, x0, y0) {
  const f = FLOOR0;
  H.box('whWhite', x0 + 1.6, y0, f, x0 + 3.0, y0 + 1.0, f + 0.88, { name: 'saw' });
  H.box('whConcrete', x0, y0 + 1.0, f + 0.6, x0 + 4.4, y0 + 1.4, f + 0.9, { name: 'sliding table' });
  H.box('whWhite', x0 + 1.9, y0 + 1.05, f, x0 + 2.6, y0 + 1.35, f + 0.6, { name: 'saw' });
  H.box('whConcrete', x0 + 1.4, y0 + 1.4, f + 0.84, x0 + 2.4, y0 + 2.6, f + 0.9, { name: 'outrigger' });
  H.box('whSteel', x0 + 2.2, y0 + 0.4, f + 0.88, x0 + 2.35, y0 + 0.55, f + 2.2, { name: 'saw guard' });
  H.box('whSteel', x0 + 2.0, y0 + 0.3, f + 1.5, x0 + 2.6, y0 + 0.7, f + 1.7, { name: 'saw guard' });
}

/*
 * The machine room, the CNC area, from Thomas More's two photos of 15
 * November 2026 (0420 taken in its doorway, 0423 from the opposite corner)
 * and his markup of the plan, which has it shorter than the first build
 * drew it. Cream block walls north and east, the stripe along both; the
 * partition's side and the paint shop's wall taped. In the north wall,
 * just inside the doorway, a white roller door under a silver hood, shut;
 * along the rest of it a silver duct, sheet stock leant on it, and the
 * boards. Along the east wall the dust collector's socks in the south
 * corner (photo 0423 has them at its right hand), then the long router, a
 * black bed on a grey base, its green gantry and its cabinet, the silver
 * ducts forked down to it and their tan hoses. Against the partition the
 * beam saw, its three tables out into the room, boards leant on the wall
 * beside it and cardboard tubes stood on end. In the open middle the two
 * sliding table saws, rolling tables, sheet stock on orange pallets, the
 * round column with the dust collector's big bags beside it, more tubes
 * and a heap of offcuts; a small dark window high in the taped south wall.
 * The machines are the kind the photos show, placed as the photos have
 * them, not measured.
 */
function machineRoom(H) {
  const f = FLOOR0;
  const X0 = PX + PT;
  const X1 = LEN;
  const Y0 = RY + PT;
  stripe(H, 'y', X1, -1, Y0, DEP);
  stripe(H, 'x', DEP, -1, X0, X1, [[32.8, 36.2, 0, 4]]);
  /* The roller door in the north wall, as the dock's two. */
  const [d0, d1] = [33.0, 36.0];
  H.face('whWhite', 'x', DEP, -1, d0, d1, f, 3.3);
  H.face('whWhite', 'x', DEP + TW + 0.012, 1, d0, d1, f, 3.3);
  for (let h = 0.55; h < 3.3; h += 0.55) {
    H.paint('whSteel', d0, DEP - 0.02, f + h, d1, DEP - 0.012, f + h + 0.03);
  }
  H.box('whSteel', d0 - 0.12, DEP - 0.12, f, d0, DEP, 3.35, { name: 'door track' });
  H.box('whSteel', d1, DEP - 0.12, f, d1 + 0.12, DEP, 3.35, { name: 'door track' });
  H.box('whConcrete', d0 - 0.2, DEP - 0.5, 3.35, d1 + 0.2, DEP, 3.85, { name: 'door hood' });
  /* The ducts along the north and east walls, the collector's socks, sheet
   * stock leant on the north wall, a steel table and the planer on its
   * stand. */
  H.cap('whConcrete', [37.0, DEP - 0.4, 4.5], [49.5, DEP - 0.4, 4.5], 0.2, { name: 'duct', kind: 'wall', seg: 8 });
  H.cap('whConcrete', [49.5, 39.0, 4.5], [49.5, DEP - 0.4, 4.5], 0.2, { name: 'duct', kind: 'wall', seg: 8 });
  H.cap('whConcrete', [49.5, 51.6, 1.6], [49.5, 51.6, 4.5], 0.16, { name: 'duct', kind: 'wall', seg: 8 });
  for (const y of [42.0, 44.4]) {
    H.cap('whConcrete', [49.5, y, 4.5], [48.7, 43.2, 2.6], 0.16, { name: 'duct', kind: 'pole', seg: 8 });
  }
  H.cap('whConcrete', [48.7, 43.2, 1.3], [48.7, 43.2, 2.6], 0.16, { name: 'duct', kind: 'pole', seg: 8 });
  collector(H, Y0, 40.0, 49.2);
  H.box('whWhite', 42.6, DEP - 0.4, f, 44.4, DEP, f + 2.4, { name: 'sheet stock' });
  H.box('whBoard', 44.4, DEP - 0.4, f, 46.6, DEP, f + 2.1, { name: 'sheet stock' });
  H.box('whBoard', 38.0, DEP - 0.5, f, 40.4, DEP, f + 2.6, { name: 'sheet stock' });
  H.paint('whCrateDark', 38.0, DEP - 0.512, f, 38.03, DEP - 0.5, f + 2.6);
  H.paint('whCrateDark', 39.2, DEP - 0.512, f, 39.23, DEP - 0.5, f + 2.6);
  H.box('whGreen', 40.4, DEP - 0.3, f, 41.6, DEP, f + 1.25, { name: 'sheet stock' });
  H.box('whConcrete', 36.5, 54.4, f, 37.5, 55.3, f + 0.95, { name: 'steel table' });
  H.table('whBoard', 38.6, 53.9, 39.6, 54.7, 0.8, { name: 'table', top: 0.06, leg: 0.06 });
  H.box('whYellow', 38.75, 54.0, f + 0.8, 39.45, 54.6, f + 1.15, { name: 'planer' });
  H.cap('whCrate', [38.2, DEP - 0.45, 4.3], [39.1, 54.3, 1.25], 0.12, { name: 'hose', kind: 'pole', seg: 6 });
  /* The east wall: the router, its gantry, spindle and cabinet, the hoses
   * down to it, a whiteboard, and two rolling tables beside it. */
  H.box('whConcrete', 47.6, 40.0, f, X1, 48.0, f + 0.78, { name: 'router bed' });
  H.box('whBlack', 47.6, 40.0, f + 0.78, X1, 48.0, f + 0.86, { name: 'router bed' });
  H.box('whGreen', 47.45, 45.8, f, X1, 46.9, f + 1.9, { name: 'gantry' });
  H.box('whRed', 48.4, 46.1, f + 1.9, 48.9, 46.6, f + 2.3, { name: 'spindle' });
  H.box('whWhite', 48.4, 48.0, f, X1, 48.8, f + 1.5, { name: 'router cabinet' });
  H.cap('whCrate', [49.4, 48.7, 4.4], [48.65, 46.35, 2.4], 0.14, { name: 'hose', kind: 'pole', seg: 6 });
  H.face('whSteel', 'y', X1, -1, 50.0, 52.6, 2.8, 4.2);
  H.face('whWhite', 'y', X1 - 0.012, -1, 50.1, 52.5, 2.9, 4.1);
  H.table('whCrateDark', 44.6, 41.4, 46.6, 42.8, 0.85, { name: 'bench', topM: 'whBoard' });
  H.table('whCrateDark', 44.6, 44.2, 46.6, 45.6, 0.85, { name: 'bench', topM: 'whBoard' });
  /* The beam saw against the partition: its base and its long white
   * housing, a green band along it, three tables on pedestals out into the
   * room; boards leant on the wall north of it, and the cardboard tubes. */
  H.box('whConcrete', X0, 40.4, f, 34.1, 47.2, f + 0.55, { name: 'beam saw' });
  H.box('whWhite', X0, 40.8, f + 0.55, 33.5, 46.8, f + 1.5, { name: 'beam saw' });
  H.paint('whGreen', 33.5, 41.2, f + 1.1, 33.512, 46.4, f + 1.3);
  for (const y of [41.0, 43.0, 45.0]) {
    H.box('whBoard', 34.1, y, f + 0.8, 35.7, y + 1.2, f + 0.88, { name: 'table' });
    H.box('whConcrete', 34.6, y + 0.2, f, 35.4, y + 1.0, f + 0.8, { name: 'pedestal' });
  }
  H.box('whBoard', X0, 48.0, f, X0 + 0.4, 50.4, f + 2.5, { name: 'boards' });
  H.box('whWhite', X0 + 0.4, 48.2, f, X0 + 0.55, 50.0, f + 2.2, { name: 'boards' });
  for (const [x, y, h] of [[32.5, 50.95, 2.6], [32.95, 51.15, 2.9], [32.55, 51.45, 2.4]]) {
    H.cap('whCrate', [x, y, f], [x, y, f + h], 0.18, { name: 'tube', kind: 'pole', seg: 8 });
  }
  /* The middle: the column and the dust collector's bags beside it, tubes,
   * the offcuts, the two sliding table saws, the edge bander along the
   * paint shop's wall, sheet stock on orange pallets. */
  H.cap('whColumn', [40.0, 50.0, f], [40.0, 50.0, 5.95], 0.18, { name: 'column', kind: 'pole', seg: 10 });
  H.box('whConcrete', 40.5, 49.5, f, 42.3, 50.5, f + 1.0, { name: 'collector' });
  for (const x of [40.95, 41.85]) {
    H.cap('whCrate', [x, 50.0, f + 1.38], [x, 50.0, f + 3.0], 0.38, { name: 'dust bag', kind: 'pole', seg: 8 });
  }
  H.box('whSteel', 40.5, 49.5, f + 3.38, 42.3, 50.5, f + 3.6, { name: 'collector' });
  for (const [x, y, h] of [[43.0, 49.8, 2.7], [43.45, 50.25, 2.3]]) {
    H.cap('whCrate', [x, y, f], [x, y, f + h], 0.2, { name: 'tube', kind: 'pole', seg: 8 });
  }
  H.box('whBoard', 42.0, 47.2, f, 44.0, 48.6, f + 0.5, { name: 'offcuts' });
  H.box('whCrate', 42.3, 47.4, f + 0.5, 43.6, 48.4, f + 0.85, { name: 'offcuts' });
  slider(H, 36.6, 46.0);
  slider(H, 43.0, 38.0);
  H.box('whWhite', 33.4, Y0 + 0.75, f, 38.9, Y0 + 1.75, f + 1.2, { name: 'edge bander' });
  H.box('whSteel', 34.4, Y0 + 0.75, f + 1.2, 36.4, Y0 + 1.75, f + 1.5, { name: 'edge bander' });
  for (const [x0, y0, x1, y1, h] of [
    [37.0, 40.4, 39.4, 41.7, 0.5], [37.0, 42.6, 39.4, 43.9, 0.36], [33.8, 49.6, 36.2, 51.2, 0.48], [44.0, 51.6, 46.4, 52.9, 0.9],
  ]) {
    H.box('whOrange', x0, y0, f, x1, y1, f + 0.15, { name: 'pallet' });
    H.box('whBoard', x0 + 0.05, y0 + 0.05, f + 0.15, x1 - 0.05, y1 - 0.05, f + h, { name: 'sheet stock' });
  }
  /* The small dark window high in the south wall, a heater, the lights. */
  H.face('whWhite', 'x', Y0, 1, 45.5, 46.7, 3.4, 4.3);
  H.face('whDeck', 'x', Y0 + 0.012, 1, 45.6, 46.6, 3.5, 4.2);
  H.box('whRackOrange', 35.6, 49.0, 4.95, 36.4, 49.7, 5.45, { name: 'heater' });
  for (const x of [35.0, 41.0, 47.0]) {
    for (const y of [41.0, 45.0, 52.5]) {
      H.box('whLamp', x - 0.15, y - 1.2, 5.55, x + 0.15, y + 1.2, 5.7, { name: 'light' });
    }
  }
}


/* ------------------------------------------------------------------ */
/* The reel's lines, 4 November 2026                                    */
/* ------------------------------------------------------------------ */

/*
 * THE DIGITAL DEPARTMENT behind the grey door (the reel's frames 18 to
 * 33), north of the hallway since Thomas More's markup of 15 November
 * 2026. The reel climbs over its rooms and looks down into them, so
 * inside it is a wall without a ceiling under the hall's own roof: a
 * long room along the hallway's side, red floored, the printers along the
 * wall and the prints pinned up opposite; the office north of it, desks
 * and screens, its door off the long room; and at the far end a little
 * white room's door, shut.
 */
const PRINT = { wall: 17.4, top: 3.2 };

function printRoom(H) {
  const f = FLOOR0;
  const D = DIG;
  const { wall, top } = PRINT;
  const o = OPENINGS;
  const x0 = D.x0 + 0.12;
  const x1 = D.x1;
  const s = D.y0 + 0.12;
  /* The wall between the long room and the office, and the end. */
  H.wall('whWhite', 'x', wall + 0.06, x0, x1, 0, top, 0.12, [holeOf(o.printOffice)], 'print room wall');
  H.face('whWhite', 'y', x1, -1, s, D.y1, 0, HIGH);
  H.face('whWhite', 'x', D.y1, -1, PX + PT, x1, 0, HIGH);
  H.face('whSteel', 'y', x1 - 0.012, -1, 15.3, 16.4, f, 2.15);
  H.face('whDeck', 'y', x1 - 0.024, -1, 15.65, 16.05, 1.3, 1.85);
  /* The long room's red floor, the office's grey carpet. */
  H.paint('whRed', x0, s, f, x1, wall, f + 0.012);
  H.paint('whSteel', x0, wall + 0.12, f, PX + PT, D.notch - 0.12, f + 0.012);
  H.paint('whSteel', PX + PT, wall + 0.12, f, x1, D.y1, f + 0.012);
  /* The printers along the hallway's wall, black, the paper's white edge
   * along each one's front, and prints leant on the wall between them. */
  for (const [a, b] of [[30.2, 32.4], [33.6, 35.8], [37.0, 39.2]]) {
    H.box('whBlack', a, s, f, b, s + 0.85, f + 1.15, { name: 'printer' });
    H.paint('whWhite', a + 0.1, s + 0.85, f + 0.95, b - 0.1, s + 0.862, f + 1.02);
    H.paint('whSteel', a, s + 0.85, f + 0.1, b, s + 0.862, f + 0.3);
  }
  for (const [a, b, h, m] of [[32.4, 33.6, 1.4, 'whBlack'], [35.8, 37.0, 1.1, 'whBoard']]) {
    H.box(m, a, s, f, b, s + 0.12, f + h, { name: 'prints' });
  }
  /* The prints pinned up along the long room's north wall, each a
   * colour on a black frame (the reel's frames 22 and 32). */
  for (const [a, b, c0, c1, m, n] of [
    [29.0, 31.2, 0.9, 2.6, 'whRackTeal', 'whOrange'], [31.8, 33.2, 1.1, 2.5, 'whYellow', 'whRed'],
    [35.6, 37.0, 1.3, 2.3, 'whOrange', 'whBlack'], [37.4, 39.8, 0.8, 2.6, 'whGreen', 'whBoard'],
  ]) {
    H.face('whBlack', 'x', wall, -1, a, b, c0, c1);
    H.face(m, 'x', wall - 0.012, -1, a + 0.06, b - 0.06, c0 + 0.06, c1 - 0.06);
    H.face(n, 'x', wall - 0.024, -1, a + (b - a) * 0.3, a + (b - a) * 0.75, c0 + (c1 - c0) * 0.25, c0 + (c1 - c0) * 0.6);
  }
  /* The office: desks along the paint shop's wall with their screens and
   * chairs, a bookcase, a whiteboard. */
  const back = D.y1;
  for (const a of [33.0, 35.4, 37.8]) {
    H.table('whWhite', a, back - 0.8, a + 1.8, back, 0.75, { name: 'desk', topM: 'whBoard', top: 0.05, leg: 0.06 });
    H.box('whBlack', a + 0.5, back - 0.12, f + 0.75, a + 1.3, back, f + 1.2, { name: 'screen' });
    H.box('whBlack', a + 0.6, back - 1.3, f, a + 1.2, back - 0.8, f + 0.95, { name: 'chair' });
  }
  H.box('whWhite', x0, wall + 0.12, f, x0 + 0.4, D.notch - 0.12, f + 2.0, { name: 'bookcase' });
  for (const h of [0.5, 1.0, 1.5]) {
    H.paint('whCrate', x0 + 0.4, wall + 0.2, f + h, x0 + 0.412, D.notch - 0.2, f + h + 0.3);
  }
  H.face('whWhite', 'y', x1 - 0.012, -1, 19.0, 20.6, 1.0, 2.0);
  H.face('whSteel', 'y', x1 - 0.024, -1, 19.0, 20.6, 0.95, 1.0);
  /* Its lights, under the joists, over the walls' tops. */
  for (const [x, y] of [[31.0, 15.9], [36.6, 15.9], [36.2, 20.2]]) {
    H.box('whLamp', x - 1.2, y - 0.15, 5.55, x + 1.2, y + 0.15, 5.7, { name: 'light' });
  }
}

/*
 * THE BOOTHS, the owner's pick of 4 November 2026 ("Add plain booths"):
 * the reel flies through two exhibit booths stood in the shop, so here
 * they are, with no names, logos or words on them, as nothing on this map
 * has. The white one in the crate block east of the green racking (frames
 * 74 to 91 and 201 to 222): an open white frame room, a mullion down each
 * side and a transom across, flown through and out of its open top; a
 * white wall with a screen; a black tower with a lit blue edge and lit
 * shelves; and a white window frame of four panes before a black wall,
 * flown through a pane. The black one stood in the machine room's open
 * middle until 15 November 2026, when Thomas More's photos of the room
 * (0420 and 0423) showed the machines that stand there; it is gone, the
 * machines are in.
 */
export const BOOTH_A = { x0: 12.6, x1: 15.6, y0: 26.8, y1: 30.4, h: 3.2, mull: 28.6, tran: 2.3 };
export const WINDOW_A = { x0: 12.6, x1: 15.6, y: 35.8, h: 2.95 };

function booths(H) {
  const f = FLOOR0;
  const u = 0.1;
  /* The white frame room: four posts, a rail round the top and one
   * across it, a mullion down each long side with a transom across both,
   * and its south side a solid white panel with a screen on an arm. */
  const A = BOOTH_A;
  for (const [x, y] of [[A.x0, A.y0], [A.x1 - u, A.y0], [A.x0, A.y1 - u], [A.x1 - u, A.y1 - u]]) {
    H.box('whWhite', x, y, f, x + u, y + u, A.h, { name: 'booth frame' });
  }
  for (const x of [A.x0, A.x1 - u]) {
    H.box('whWhite', x, A.y0 + u, A.h - u, x + u, A.y1 - u, A.h, { name: 'booth frame' });
    H.box('whWhite', x, A.mull - u / 2, f, x + u, A.mull + u / 2, A.h - u, { name: 'booth frame' });
    H.box('whWhite', x, A.y0 + u, A.tran, x + u, A.y1 - u, A.tran + u, { name: 'booth frame' });
  }
  H.box('whWhite', A.x0 + u, A.y1 - u, A.h - u, A.x1 - u, A.y1, A.h, { name: 'booth frame' });
  H.box('whWhite', A.x0 + u, A.mull - u / 2, A.h - u, A.x1 - u, A.mull + u / 2, A.h, { name: 'booth frame' });
  H.box('whWhite', A.x0 + u, A.y0, f, A.x1 - u, A.y0 + u, A.h, { name: 'booth panel' });
  H.paint('whBlack', A.x0 + 0.9, A.y0 + u, 1.6, A.x0 + 2.1, A.y0 + u + 0.012, 2.3);
  H.paint('whRackTeal', A.x0 + 0.95, A.y0 + u + 0.012, 1.65, A.x0 + 2.05, A.y0 + u + 0.024, 2.25);
  /* The white wall with its screen and the navy plate at its foot, both
   * faces, and the black tower it meets, its edge lit blue and its face
   * lit shelves. */
  const [wy0, wy1] = [32.4, 32.7];
  H.box('whWhite', 12.6, wy0, f, 16.6, wy1, f + 3.4, { name: 'booth wall' });
  for (const [y, side] of [[wy0, -1], [wy1, 1]]) {
    H.face('whBlack', 'x', y, side, 13.4, 15.6, 1.6, 2.8);
    H.face('whRackTeal', 'x', y + side * 0.012, side, 13.5, 15.5, 1.68, 2.72);
    H.face('whDeck', 'x', y, side, 13.6, 15.4, 0.2, 0.75);
  }
  const [tx0, tx1, ty0, ty1] = [16.6, 17.6, 31.2, 35.4];
  H.box('whBlack', tx0, ty0, f, tx1, ty1, f + 3.8, { name: 'booth tower' });
  H.paint('whRackTeal', tx0 - 0.012, ty1 - 0.25, f, tx0, ty1, f + 3.8);
  H.paint('whRackTeal', tx0, ty1, f, tx1, ty1 + 0.012, f + 3.8);
  for (const h of [0.6, 1.4, 2.2]) {
    H.paint('whLamp', tx0 - 0.012, wy1 + 0.3, f + h, tx0, ty1 - 0.4, f + h + 0.05);
    H.paint('whDeck', tx0 - 0.012, wy1 + 0.3, f + h + 0.05, tx0, ty1 - 0.4, f + h + 0.5);
  }
  /* The window frame of four panes, and the black wall behind it. */
  const W = WINDOW_A;
  const xm = (W.x0 + W.x1) / 2;
  for (const x of [W.x0, xm - u / 2, W.x1 - u]) {
    H.box('whWhite', x, W.y, f, x + u, W.y + u, W.h, { name: 'window frame' });
  }
  for (const h of [f + 0.1, (f + W.h) / 2 - u / 2, W.h - u]) {
    H.box('whWhite', W.x0 + u, W.y, h, W.x1 - u, W.y + u, h + u, { name: 'window frame' });
  }
  H.box('whBlack', 12.4, 37.0, f, 17.6, 37.3, f + 3.4, { name: 'booth wall' });
  H.face('whRackTeal', 'x', 37.0, -1, 12.4, 12.6, 0, 3.45);
  H.face('whLamp', 'x', 37.0, -1, 13.2, 16.8, 2.6, 2.66);
}

/* ------------------------------------------------------------------ */
/* The layout                                                          */
/* ------------------------------------------------------------------ */

export function warehouseLayout() {
  const H = new Hall();
  shell(H);
  dock(H);
  aisle(H);
  baraniDoorway(H);
  crates(H);
  office(H);
  whiteBlock(H);
  flatWall(H);
  workshop(H);
  clutter(H);
  shopFloor(H);
  partition(H);
  sprayRoom(H);
  machineRoom(H);
  printRoom(H);
  booths(H);
  return { parts: H.P.list.slice(), prisms: [], discs: [], cones: [], scaled: [] };
}

/* The partners' signs, each the wall it hangs on: a point on the face in
 * plan terms, the way the face looks, and how wide it is hung in real
 * metres (./index.js turns them into the built map's `markSpots`). Each
 * high on a wall the hall sees, clear of the doors and racking. */
export const SIGN_SPOTS = [
  { slug: 'gds', at: [0, 33.5, 4.4], n: [1, 0], w: 1.3 },
  { slug: 'mantisfpv', at: [27.4, DEP, 4.2], n: [0, -1], w: 1.3 },
  { slug: 'wcmrc', at: [DIG.x0, 17.4, 5.0], n: [-1, 0], w: 1.3 },
  { slug: 'webleedfpv', at: [0, 47.5, 4.0], n: [1, 0], w: 1.3 },
  /* Konex Drone's, the one hidden sign (the owner's promise of a logo hidden
   * in every map): low on the paint shop's south wall, the wall its door is
   * in, so a pilot coming in has it behind them and sees it only on the
   * way out. Small, 0.9 against the others' 1.3. Nothing stands against
   * the wall at that spot. */
  { slug: 'konexdrone', at: [37.0, SHOP_S, 1.4], n: [0, 1], w: 0.9 },
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
 * that, measured against this layout on 15 November 2026; and one lens for
 * the board's picture and card, across the workshop to the flat wall, its
 * racking and the barani doorway under the rolls at its corner
 * (src/share/orbit.js, placeCardCamera).
 */
const LOOP = { x: 24.5, y: 33.5, rx: 4.5, ry: 13.3, h: 4.4, n: 48 };
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
export const CARD_LENS = { eye: worldAt(24.5, 23.5, 3.4), at: worldAt(12.5, 12.6, 1.6) };
