/*
 * school.js: Midori Gakuen, the school the Infected mini game is played
 * in, as the parts a built map holds. Pure data and arithmetic, no
 * Three.js, no JS trigonometry, so the solids can be built and checked in
 * plain Node, and so the game's bots can read the same plan in plain Node
 * (src/game/infected.js).
 *
 * WHAT IT IS. An original two floor school, the kind a school manga is set
 * in, at whoop size: a long hallway down the middle of each floor, the
 * classrooms off its south side and the special rooms off its north, a
 * stairwell at each end. Nothing in it is a real school. The owner's brief
 * of 8 November 2026 for the Infected map was "low ceilings with tight
 * corridors to discourage pilots just max cam angle and dogging it all over
 * the map. Lots of chances for paths to cross (ie, forced tunnels between
 * rooms, close quarters in some places.)", and every room here is laid out
 * for that:
 *
 *   EVERY ROOM HAS TWO WAYS OUT, so a room is a loop and never a trap: two
 *   doors to the hallway, or a door and a vent, a hatch or a door to the
 *   next room. A pilot who is chased in at one door can leave by the other,
 *   and a hunter who knows the loop goes round to meet them there.
 *
 *   FOUR VENTS are the forced tunnels: square ducts through the walls
 *   between two rooms, two low and two high under the ceiling, each 45 cm
 *   inside, a whoop's tight squeeze. The book lift is a fifth, a shaft from
 *   the science lab up to the library.
 *
 *   TWO STAIRWELLS, one at each end of the hallway, are the only way
 *   between the floors for anyone who does not know the book lift.
 *
 *   WINDOWS INTO THE HALLWAY, some open, so the hallway is never a drag
 *   strip: a pilot in it sees into the rooms either side and can leave
 *   through a window as well as a door, and a pilot in a room sees who is
 *   coming down the hallway.
 *
 * THE SCALE IS THE HOUSES'. Everything is three and a half times life size
 * (S, as in ../house/house.js), and the game is flown on whoops only (the
 * owner's word of 8 November 2026), so a whoop flies it the way a whoop
 * flies a real school. The plan below is in REAL metres and turned into the
 * world's by S once, in the helpers under it.
 *
 * THE PLAN'S FRAME. px runs east, py north, h up from the ground, real
 * metres, the origin the building's south west corner inside. The school is
 * 40 by 17 inside and two floors high. The hallway runs east and west
 * between py 7.4 and 10.0 on both floors.
 *
 * WHAT IS SOLID. Walls, slabs, ceilings, furniture, lamps, ducts and the
 * stairs, each drawn and solid from the same numbers (../../props/parts.js).
 * Paint is not solid: the blackboards, the notices, the windows painted on
 * the outside walls, the patches of sun on the floor. Every open door,
 * window, transom and vent is a hole. The glass panes in the hallway walls
 * are solid and not drawn, with their frames drawn round them and white
 * streaks drawn across them, because a pilot has to see through glass to
 * see who is coming, and the school's one colour per draw call has no room
 * for a see through one. The outside walls' windows are painted: nobody
 * plays outside, and an open one would let the round out into the yard.
 *
 * ONE DRAW CALL A COLOUR. The kit bakes a batch per material per chunk and
 * the school is one chunk, so it draws sixteen colours (src/props/school.js).
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
import { sincos } from '../../props/trig.js';

/* ------------------------------------------------------------------ */
/* The frame                                                           */
/* ------------------------------------------------------------------ */

/* World metres to a real metre, the houses'. */
export const S = 3.5;

/* The school inside, real metres, and 8 m of yard round it. */
export const LEN = 40;
export const DEP = 17;
const MARGIN = 8;
export const FIELD_W = (LEN + 2 * MARGIN) * S;
export const FIELD_D = (DEP + 2 * MARGIN) * S;
export const X0 = MARGIN * S;
export const Y0 = MARGIN * S;

/* The heights, real metres. The ground floor stands a step over the yard;
 * its ceiling is the first floor slab's underside, the slab 40 cm with its
 * floor on top; the first floor's ceiling is the roof slab's underside. */
export const FLOOR0 = 0.05;
export const CEIL0 = 2.85;
export const F1 = 3.25;
export const CEIL1 = 6.05;
export const ROOF = 6.35;
export const HIGH = ROOF;
const SLAB = 3.2;

/* The floor and the ceiling of a storey, 0 the ground and 1 the first. */
export const floorOf = (f) => (f ? F1 : FLOOR0);
export const ceilOf = (f) => (f ? CEIL1 : CEIL0);

/* The outside wall's thickness, outside the plan; the hallway walls' and
 * the partitions', centred on their lines. */
const TW = 0.25;
const HT = 0.15;
const PT = 0.12;

/* The hallway, both floors: between its two walls' faces. */
export const HALL = { y0: 7.4, y1: 10.0 };
const HALL_S = 7.325;
const HALL_N = 10.075;

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

/* A world point as the plan's [px, py, h]. */
export function planAt(x, y, z) {
  return [(x - OX) / S, (OZ - z) / S, y / S];
}

export const FRAME = { OX, OZ, S };

/* ------------------------------------------------------------------ */
/* The rooms                                                           */
/* ------------------------------------------------------------------ */

/*
 * Each room's air in plan, between its walls' faces, and the storey it is
 * on. The bots' map is made from these (src/game/infected.js), and the HUD
 * names where somebody is from them, so the names are the ones a pilot
 * would say. The stairwells are both storeys: `f` is null.
 */
export const ROOMS = [
  { id: 'hall0', name: 'Hallway', f: 0, x0: 0, x1: LEN, y0: HALL.y0, y1: HALL.y1 },
  { id: '1a', name: 'Class 1-A', f: 0, x0: 3.06, x1: 10.94, y0: 0, y1: 7.25 },
  { id: 'lab', name: 'Science lab', f: 0, x0: 11.06, x1: 20.94, y0: 0, y1: 7.25 },
  { id: '1b', name: 'Class 1-B', f: 0, x0: 21.06, x1: 28.94, y0: 0, y1: 7.25 },
  { id: 'shoes', name: 'Shoe lockers', f: 0, x0: 29.06, x1: 36.94, y0: 0, y1: 7.25 },
  { id: 'lunch', name: 'Lunch room', f: 0, x0: 3.06, x1: 14.94, y0: 10.15, y1: DEP },
  { id: 'kitchen', name: 'Kitchen', f: 0, x0: 15.06, x1: 18.94, y0: 10.15, y1: DEP },
  { id: 'staff', name: 'Staff room', f: 0, x0: 19.06, x1: 26.94, y0: 10.15, y1: DEP },
  { id: 'nurse', name: "Nurse's room", f: 0, x0: 27.06, x1: 30.94, y0: 10.15, y1: DEP },
  { id: 'store', name: 'Sports store', f: 0, x0: 31.06, x1: 36.94, y0: 10.15, y1: DEP },
  { id: 'hall1', name: 'Upstairs hallway', f: 1, x0: 0, x1: LEN, y0: HALL.y0, y1: HALL.y1 },
  { id: '2a', name: 'Class 2-A', f: 1, x0: 3.06, x1: 10.94, y0: 0, y1: 7.25 },
  { id: 'library', name: 'Library', f: 1, x0: 11.06, x1: 20.94, y0: 0, y1: 7.25 },
  { id: '2b', name: 'Class 2-B', f: 1, x0: 21.06, x1: 28.94, y0: 0, y1: 7.25 },
  { id: 'music', name: 'Music room', f: 1, x0: 29.06, x1: 36.94, y0: 0, y1: 7.25 },
  { id: 'art', name: 'Art room', f: 1, x0: 3.06, x1: 14.94, y0: 10.15, y1: DEP },
  { id: 'computer', name: 'Computer room', f: 1, x0: 15.06, x1: 26.94, y0: 10.15, y1: DEP },
  { id: 'club', name: 'Club room', f: 1, x0: 27.06, x1: 36.94, y0: 10.15, y1: DEP },
  { id: 'stairW', name: 'West stairs', f: null, x0: 0, x1: 2.94, y0: 10.0, y1: 12.94 },
  { id: 'stairE', name: 'East stairs', f: null, x0: 37.06, x1: LEN, y0: 10.0, y1: 12.94 },
];

/* The room a plan point is in, or null. A stairwell first, since it is both
 * storeys; then the storey from the height. */
export function roomAt(px, py, h) {
  for (const r of ROOMS) {
    if (r.f === null && px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1) {
      return r;
    }
  }
  const f = h >= SLAB ? 1 : 0;
  for (const r of ROOMS) {
    if (r.f === f && px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1) {
      return r;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The openings                                                        */
/* ------------------------------------------------------------------ */

/*
 * Every way through a wall, for the walls and for the bots. `axis` 'x' is
 * a wall running east along py = at, 'y' one running north along px = at;
 * [a0, a1] along it and [h0, h1] up, real metres from the ground. `rooms`
 * is the room on its south or west side and the room on its north or east.
 * `kind` is door, wide, window, transom, hatch or vent; `glass` a pane in
 * it. A vent's `duct` is how far its duct runs each side of the wall, and
 * its `mouth` how far in front of the wall each end of it opens, so the
 * bots enter it straight.
 */
const DOOR = 1.9;
const WIN = [1.0, 1.85];
const TRANSOM = [2.05, 2.5];

function hallwayWall(f, side, spec) {
  const at = side === 's' ? HALL_S : HALL_N;
  const hall = f ? 'hall1' : 'hall0';
  const lv = floorOf(f);
  const out = [];
  for (const [room, items] of spec) {
    for (const [kind, a0, a1, glass] of items) {
      const h = kind === 'door' ? [0, DOOR] : kind === 'wide' ? [0, 2.2] : kind === 'window' ? WIN
        : kind === 'transom' ? TRANSOM : kind === 'hatch' ? [0.85, 1.35] : null;
      out.push({
        id: `${f}${side}-${room}-${kind}-${a0}`,
        axis: 'x', at, a0, a1, h0: lv + h[0], h1: lv + h[1], kind, glass: Boolean(glass), f,
        rooms: side === 's' ? [room, hall] : [hall, room],
      });
    }
  }
  return out;
}

export const OPENINGS = [
  ...hallwayWall(0, 's', [
    ['1a', [['door', 4.0, 4.9], ['window', 5.4, 6.6], ['window', 6.7, 7.9, true], ['window', 8.0, 9.2, true], ['transom', 6.7, 7.9], ['door', 9.6, 10.5]]],
    ['lab', [['door', 12.0, 12.9], ['window', 13.4, 14.6, true], ['window', 14.7, 15.9, true], ['window', 16.0, 17.2, true], ['window', 17.3, 18.5, true], ['transom', 13.4, 14.6], ['door', 19.6, 20.5]]],
    ['1b', [['door', 22.0, 22.9], ['window', 23.4, 24.6, true], ['window', 24.7, 25.9], ['window', 26.0, 27.2, true], ['transom', 23.4, 24.6], ['door', 27.6, 28.5]]],
    ['shoes', [['wide', 30.0, 32.0], ['wide', 34.6, 36.6]]],
  ]),
  ...hallwayWall(0, 'n', [
    ['lunch', [['door', 5.0, 5.9], ['window', 6.4, 7.6], ['window', 7.7, 8.9, true], ['window', 9.0, 10.2, true], ['window', 10.3, 11.5], ['transom', 9.0, 10.2], ['door', 12.6, 13.5]]],
    ['kitchen', [['hatch', 16.5, 17.1]]],
    ['staff', [['door', 20.0, 20.9], ['window', 21.4, 22.6, true], ['window', 22.7, 23.9, true], ['window', 24.0, 25.2, true], ['transom', 22.7, 23.9], ['door', 25.6, 26.5]]],
    ['nurse', [['door', 28.6, 29.5], ['window', 29.9, 30.7, true]]],
    ['store', [['door', 33.0, 33.9]]],
  ]),
  ...hallwayWall(1, 's', [
    ['2a', [['door', 4.0, 4.9], ['window', 5.4, 6.6, true], ['window', 6.7, 7.9, true], ['window', 8.0, 9.2], ['transom', 5.4, 6.6], ['door', 9.6, 10.5]]],
    ['library', [['door', 12.0, 12.9], ['window', 13.4, 14.6], ['window', 14.7, 15.9, true], ['window', 16.0, 17.2, true], ['window', 17.3, 18.5], ['door', 19.6, 20.5]]],
    ['2b', [['door', 22.0, 22.9], ['window', 23.4, 24.6, true], ['window', 24.7, 25.9, true], ['window', 26.0, 27.2], ['transom', 24.7, 25.9], ['door', 27.6, 28.5]]],
    ['music', [['door', 30.0, 30.9], ['window', 31.4, 32.6, true], ['window', 32.7, 33.9, true], ['window', 34.0, 35.2, true], ['door', 35.6, 36.5]]],
  ]),
  ...hallwayWall(1, 'n', [
    ['art', [['door', 5.0, 5.9], ['window', 6.4, 7.6, true], ['window', 7.7, 8.9], ['window', 9.0, 10.2, true], ['window', 10.3, 11.5, true], ['transom', 6.4, 7.6], ['door', 12.6, 13.5]]],
    ['computer', [['door', 17.0, 17.9], ['window', 18.4, 19.6, true], ['window', 19.7, 20.9, true], ['window', 21.0, 22.2], ['window', 22.3, 23.5, true], ['transom', 19.7, 20.9], ['door', 24.6, 25.5]]],
    ['club', [['door', 28.6, 29.5], ['window', 30.0, 31.2], ['window', 31.3, 32.5, true], ['window', 32.6, 33.8, true], ['transom', 31.3, 32.5], ['door', 34.6, 35.5]]],
  ]),
  /* Doors between rooms. */
  { id: 'lab-1b', axis: 'y', at: 21, a0: 5.6, a1: 6.5, h0: FLOOR0, h1: FLOOR0 + DOOR, kind: 'door', f: 0, rooms: ['lab', '1b'] },
  { id: 'lunch-kitchen', axis: 'y', at: 15, a0: 14.1, a1: 15.0, h0: FLOOR0, h1: FLOOR0 + DOOR, kind: 'door', f: 0, rooms: ['lunch', 'kitchen'] },
  { id: 'nurse-store', axis: 'y', at: 31, a0: 12.5, a1: 13.4, h0: FLOOR0, h1: FLOOR0 + DOOR, kind: 'door', f: 0, rooms: ['nurse', 'store'] },
  { id: '2a-library', axis: 'y', at: 11, a0: 2.1, a1: 3.0, h0: F1, h1: F1 + DOOR, kind: 'door', f: 1, rooms: ['2a', 'library'] },
  /* The vents: A low from 1-A to the lab, B high from the kitchen to the
   * staff room, C low from 2-B to the music room, D high from the art room
   * to the computer room. 45 cm inside: a whoop's squeeze. A low duct's
   * mouth in a classroom is in the face of the cubbies along the back wall,
   * so its west run there is only to the cubbies' face. */
  { id: 'ventA', axis: 'y', at: 11, a0: 3.8, a1: 4.25, h0: FLOOR0 + 0.3, h1: FLOOR0 + 0.75, kind: 'vent', f: 0, rooms: ['1a', 'lab'], duct: [0.6, 1.2] },
  { id: 'ventB', axis: 'y', at: 19, a0: 13.0, a1: 13.45, h0: CEIL0 - 0.51, h1: CEIL0 - 0.06, kind: 'vent', f: 0, rooms: ['kitchen', 'staff'], duct: [1.4, 1.4] },
  { id: 'ventC', axis: 'y', at: 29, a0: 3.8, a1: 4.25, h0: F1 + 0.3, h1: F1 + 0.75, kind: 'vent', f: 1, rooms: ['2b', 'music'], duct: [0.6, 1.2] },
  { id: 'ventD', axis: 'y', at: 15, a0: 12.4, a1: 12.85, h0: CEIL1 - 0.51, h1: CEIL1 - 0.06, kind: 'vent', f: 1, rooms: ['art', 'computer'], duct: [1.4, 1.4] },
];

/* An opening by id. */
export const openingOf = (id) => OPENINGS.find((o) => o.id === id);

/*
 * THE BOOK LIFT, a dumbwaiter from the science lab's south east corner up
 * to the library's: a shaft 78 by 70 cm inside, open on its north face at
 * each floor, between 80 cm and 1.5 m over it. Solid under the ground
 * opening (the car) and over the first floor's (its top).
 */
export const LIFT = { x0: 20.16, x1: 20.94, y0: 0, y1: 0.7, t: 0.06, open: [0.8, 1.5] };

/*
 * THE GLASS TANK in the science lab, where the first infected waits out
 * the head start (src/game/infected.js holds them in it): a big empty
 * terrarium on a green base, glass to 1.7 m, open on top. `pad` is where
 * they start, on the base.
 */
export const TANK = { x0: 14.5, x1: 17.5, y0: 3.0, y1: 6.0, base: 0.2, top: 1.7, pad: [16.0, 4.5] };

/*
 * THE STAIRS. Each stairwell, the west one here and the east its mirror: a
 * flight up the outer side from the hallway's end to a landing against the
 * north wall, and a flight back down the inner side to the first floor's
 * hallway, a wall between them, the well open over both to the roof.
 */
const STAIR = { y0: 10.0, y1: 12.0, land: 12.94, split: [1.45, 1.55], wall: 2.94, mid: 1.65, steps: 8 };

/*
 * The ways a bot has to be led through rather than seeing its way: up and
 * down the stairs, up and down the book lift, and along each vent. Each is
 * a chain of plan points [px, py, h], walked in either direction; the first
 * and last are in the rooms named, and a bot steers point to point in
 * between (src/game/infected.js).
 */
function stairPath(east) {
  const X = (px) => (east ? LEN - px : px);
  return [[X(1.5), 8.7, 1.3], [X(0.72), 10.6, 1.25], [X(0.9), 12.45, 2.55], [X(2.2), 12.3, 3.55], [X(2.25), 10.9, 4.25], [X(1.8), 8.7, F1 + 1.3]];
}
function ventPath(o) {
  const c = (o.a0 + o.a1) / 2;
  const h = (o.h0 + o.h1) / 2;
  const [w, e] = o.duct;
  return [[o.at - w - 0.7, c, h], [o.at - w - 0.15, c, h], [o.at + e + 0.15, c, h], [o.at + e + 0.7, c, h]];
}
const LX = (LIFT.x0 + LIFT.x1) / 2;
export const PATHS = [
  { id: 'stairW', rooms: ['hall0', 'hall1'], cost: 1.6, points: stairPath(false) },
  { id: 'stairE', rooms: ['hall0', 'hall1'], cost: 1.6, points: stairPath(true) },
  {
    id: 'lift', rooms: ['lab', 'library'], cost: 2.4, tight: true,
    points: [[LX, 1.55, 1.15], [LX, 0.9, 1.15], [LX, 0.35, 1.15], [LX, 0.35, F1 + 1.15], [LX, 0.9, F1 + 1.15], [LX, 1.55, F1 + 1.15]],
  },
  ...OPENINGS.filter((o) => o.kind === 'vent').map((o) => ({ id: o.id, rooms: o.rooms, cost: 2.0, tight: true, points: ventPath(o) })),
];

/* ------------------------------------------------------------------ */
/* The builder                                                         */
/* ------------------------------------------------------------------ */

/* The parts of a rectangle [a0, a1] x [c0, c1] that no hole covers. */
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

class School {
  constructor() {
    this.P = new Parts();
  }

  /* A box between two plan corners, solid and drawn. */
  box(m, px0, py0, h0, px1, py1, h1, opts = {}) {
    return this.P.box(m, wx(px0), wy(h0), wz(py0), wx(px1), wy(h1), wz(py1), opts);
  }

  /* Paint: drawn, not solid. */
  paint(m, px0, py0, h0, px1, py1, h1) {
    return this.box(m, px0, py0, h0, px1, py1, h1, { solid: false, cast: false, name: 'paint' });
  }

  /* A solid that is not drawn: a pane of glass. */
  hidden(px0, py0, h0, px1, py1, h1, name = 'glass') {
    return this.box('scWhite', px0, py0, h0, px1, py1, h1, { draw: false, name });
  }

  /* A round thing between two plan points, radius in real metres. */
  cap(m, a, b, r, opts = {}) {
    return this.P.cap(m, worldAt(a[0], a[1], a[2]), worldAt(b[0], b[1], b[2]), S * r, opts);
  }

  /* A wall with its openings, in plan terms. `dir` 'x' runs east along
   * py = at from a0 to a1; 'y' runs north along px = at. holes are
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
  face(m, dir, at, side, a0, a1, c0, c1, lift = 0) {
    const o = at + side * lift;
    const d0 = side > 0 ? o : o - 0.012;
    const d1 = side > 0 ? o + 0.012 : o;
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

  /* A frame round a rectangle on a face: four strips `w` wide. */
  frame(m, dir, at, side, a0, a1, c0, c1, w = 0.05, lift = 0.012) {
    this.face(m, dir, at, side, a0 - w, a1 + w, c0 - w, c0, lift);
    this.face(m, dir, at, side, a0 - w, a1 + w, c1, c1 + w, lift);
    this.face(m, dir, at, side, a0 - w, a0, c0, c1, lift);
    this.face(m, dir, at, side, a1, a1 + w, c0, c1, lift);
  }

  /* A floor's patch of something flat: paint a whisker over it. */
  floorPaint(m, px0, py0, px1, py1, lv, n = 0) {
    this.paint(m, px0, py0, lv + 0.004 + n * 0.004, px1, py1, lv + 0.008 + n * 0.004);
  }

  /* A table or desk: a top over four legs, flown under. */
  table(m, px0, py0, px1, py1, lv, h, o = {}) {
    const top = o.top ?? 0.04;
    const leg = o.leg ?? 0.04;
    this.box(o.topM ?? m, px0, py0, lv + h - top, px1, py1, lv + h, { name: o.name ?? 'table' });
    for (const [x, y] of [[px0, py0], [px1 - leg, py0], [px0, py1 - leg], [px1 - leg, py1 - leg]]) {
      this.box(o.legM ?? 'scSteel', x, y, lv, x + leg, y + leg, lv + h - top, { name: 'leg' });
    }
  }

  /* A block of a thing, not flown under: a cabinet, a bench, a bed. */
  block(m, px0, py0, px1, py1, h0, h1, name = 'block') {
    return this.box(m, px0, py0, h0, px1, py1, h1, { name });
  }
}

/* An opening as the [along0, along1, up0, up1] its wall takes. */
const holeOf = (o) => [o.a0, o.a1, o.h0, o.h1];

/* ------------------------------------------------------------------ */
/* The shell                                                           */
/* ------------------------------------------------------------------ */

/* The slabs' holes: the two stair wells and the book lift. */
const WELLS = [[0, STAIR.wall, STAIR.y0, STAIR.land], [LEN - STAIR.wall, LEN, STAIR.y0, STAIR.land]];
const SLAB_HOLES = [...WELLS, [LIFT.x0, LIFT.x1, LIFT.y0, LIFT.y1]];

/* The floor finish of each room, under its walls. */
const FLOORS = {
  hall0: 'scLino', hall1: 'scLino', '1a': 'scWood', '2a': 'scWood', '1b': 'scWood', '2b': 'scWood', lab: 'scLino', library: 'scWood',
  shoes: 'scLino', music: 'scWood', lunch: 'scLino', kitchen: 'scLino', staff: 'scLino', nurse: 'scLino', store: 'scLino',
  art: 'scLino', computer: 'scLino', club: 'scWood',
};

/* The room's floor rectangle, out to its walls' centre lines. */
function floorRect(r) {
  const out = (v, lo) => (lo ? (v <= 0.01 ? v : v - 0.06) : (v >= LEN - 0.01 ? v : v + 0.06));
  return [out(r.x0, true), r.x1 >= LEN - 0.01 ? LEN : r.x1 + 0.06, r.y0 <= 0.01 ? 0 : r.y0 === HALL.y0 ? HALL_S : r.y0 - 0.075,
    r.y1 >= DEP - 0.01 ? DEP : r.y1 === HALL.y1 ? HALL_N : r.y1 + 0.075];
}

function shell(H) {
  /* The ground slab and the first floor's, room by room in its colour; the
   * first floor's structure under it, white, which is the ground floor's
   * ceiling; the roof slab over all, white under. */
  for (const r of ROOMS) {
    if (r.f === null) {
      continue;
    }
    const [x0, x1, y0, y1] = floorRect(r);
    if (r.f === 0) {
      H.box(FLOORS[r.id], x0, y0, 0, x1, y1, FLOOR0, { name: 'slab', cast: false });
    } else {
      for (const [a0, a1, c0, c1] of clip([x0, x1, y0, y1], SLAB_HOLES)) {
        H.box(FLOORS[r.id], a0, c0, SLAB, a1, c1, F1, { name: 'slab', cast: false });
      }
    }
  }
  /* The closed corners behind the stairwells, and the wells' own floors. */
  for (const [x0, x1] of [[0, STAIR.wall], [LEN - STAIR.wall, LEN]]) {
    H.box('scLino', x0, 0, 0, x1, HALL_S, FLOOR0, { name: 'slab', cast: false });
    H.box('scLino', x0, HALL_N, 0, x1, DEP, FLOOR0, { name: 'slab', cast: false });
    for (const [c0, c1] of [[0, HALL_S], [STAIR.land, DEP]]) {
      H.box('scLino', x0, c0, SLAB, x1, c1, F1, { name: 'slab', cast: false });
    }
  }
  for (const [a0, a1, c0, c1] of clip([0, LEN, 0, DEP], SLAB_HOLES)) {
    H.box('scWhite', a0, c0, CEIL0, a1, c1, SLAB, { name: 'ceiling', cast: false });
  }
  H.box('scWhite', -TW, -TW, CEIL1, LEN + TW, DEP + TW, ROOF - 0.05, { name: 'roof' });
  H.box('scDark', -TW, -TW, ROOF - 0.05, LEN + TW, DEP + TW, ROOF, { name: 'roof' });
  /* The four outside walls, round the plan so the inside is 40 by 17, a
   * parapet over the roof. */
  const top = ROOF + 0.3;
  H.wall('scWall', 'x', -TW / 2, -TW, LEN + TW, 0, top, TW, [], 'south wall');
  H.wall('scWall', 'x', DEP + TW / 2, -TW, LEN + TW, 0, top, TW, [], 'north wall');
  H.wall('scWall', 'y', -TW / 2, 0, DEP, 0, top, TW, [], 'west wall');
  H.wall('scWall', 'y', LEN + TW / 2, 0, DEP, 0, top, TW, [], 'east wall');
  /* Outside: a white band at each floor line and a grey plinth. */
  for (const [dir, at, side, a0, a1] of [['x', -TW, -1, -TW, LEN + TW], ['x', DEP + TW, 1, -TW, LEN + TW], ['y', -TW, -1, -TW, DEP + TW], ['y', LEN + TW, 1, -TW, DEP + TW]]) {
    H.face('scSteel', dir, at, side, a0, a1, 0, 0.5);
    H.face('scWhite', dir, at, side, a0, a1, CEIL0, F1 + 0.1);
    H.face('scWhite', dir, at, side, a0, a1, ROOF - 0.1, top);
  }
  /* The hallway's two walls, both floors, between the stairwells' walls,
   * with every opening in them; the stairwells' south walls, which close
   * the corners behind them. */
  for (const f of [0, 1]) {
    const lv = floorOf(f);
    const ce = ceilOf(f);
    for (const [side, at] of [['s', HALL_S], ['n', HALL_N]]) {
      const own = OPENINGS.filter((o) => o.f === f && o.axis === 'x' && o.at === at);
      H.wall('scWall', 'x', at, 3.06, LEN - 3.06, f ? F1 : 0, ce, HT, own.map(holeOf), 'hallway wall');
    }
    for (const [x0, x1] of [[0, STAIR.wall], [LEN - STAIR.wall, LEN]]) {
      H.wall('scWall', 'x', HALL_S, x0, x1, f ? F1 : 0, ce, HT, [], 'stair wall');
    }
    void lv;
  }
  /* The stairwells' inner walls, the length of the school either side of
   * the hallway, and their north walls across the wells' ends. */
  for (const x of [3, LEN - 3]) {
    for (const [y0, y1] of [[0, HALL_S + HT / 2], [HALL_N - HT / 2, DEP]]) {
      H.wall('scWall', 'y', x, y0, y1, 0, CEIL1, PT, [], 'stair wall');
    }
  }
  for (const [x0, x1] of [[0, STAIR.wall], [LEN - STAIR.wall, LEN]]) {
    H.wall('scWall', 'x', STAIR.land + PT / 2, x0, x1, 0, CEIL1, PT, [], 'stair wall');
  }
  /* The partitions between rooms, each storey, with their doors and vents. */
  const parts = [
    [0, 11, 0, HALL_S], [0, 21, 0, HALL_S], [0, 29, 0, HALL_S],
    [0, 15, HALL_N, DEP], [0, 19, HALL_N, DEP], [0, 27, HALL_N, DEP], [0, 31, HALL_N, DEP],
    [1, 11, 0, HALL_S], [1, 21, 0, HALL_S], [1, 29, 0, HALL_S],
    [1, 15, HALL_N, DEP], [1, 27, HALL_N, DEP],
  ];
  for (const [f, x, y0, y1] of parts) {
    const own = OPENINGS.filter((o) => o.f === f && o.axis === 'y' && o.at === x);
    H.wall('scWall', 'y', x, y0 + (y0 > 0 ? HT / 2 : 0), y1 - (y1 < DEP ? HT / 2 : 0), f ? F1 : 0, ceilOf(f), PT, own.map(holeOf), 'partition');
  }
}

/* ------------------------------------------------------------------ */
/* The openings' furniture                                              */
/* ------------------------------------------------------------------ */

/*
 * The hallway walls' windows, transoms and doors: a white frame round each
 * on both faces, and in a glass pane its glass, solid and not drawn, with
 * two white streaks across it on each side. The doors' frames are wood.
 */
function openingTrim(H) {
  for (const o of OPENINGS) {
    if (o.axis !== 'x' || o.kind === 'vent') {
      continue;
    }
    const t = HT / 2;
    for (const side of [-1, 1]) {
      const at = o.at + side * t;
      if (o.kind === 'door' || o.kind === 'wide') {
        const w = 0.06;
        H.face('scWood', 'x', at, side, o.a0 - w, o.a0, o.h0, o.h1 + w);
        H.face('scWood', 'x', at, side, o.a1, o.a1 + w, o.h0, o.h1 + w);
        H.face('scWood', 'x', at, side, o.a0 - w, o.a1 + w, o.h1, o.h1 + w);
      } else {
        H.frame('scWhite', 'x', at, side, o.a0, o.a1, o.h0, o.h1, 0.05, 0);
      }
    }
    if (o.glass) {
      H.hidden(o.a0, o.at - 0.02, o.h0, o.a1, o.at + 0.02, o.h1);
      /* The streaks, a whisker either side of the pane: two short white
       * bars high on its left, the way a page draws glass. */
      const w = o.a1 - o.a0;
      const hh = o.h1 - o.h0;
      for (const y of [o.at - 0.035, o.at + 0.023]) {
        H.paint('scWhite', o.a0 + w * 0.14, y, o.h0 + hh * 0.38, o.a0 + w * 0.17, y + 0.012, o.h0 + hh * 0.86);
        H.paint('scWhite', o.a0 + w * 0.24, y, o.h0 + hh * 0.52, o.a0 + w * 0.26, y + 0.012, o.h0 + hh * 0.82);
        H.paint('scWhite', o.a0 + w * 0.08, y, o.h0 + hh * 0.06, o.a1 - w * 0.08, y + 0.012, o.h0 + hh * 0.1);
      }
    }
  }
}

/*
 * A vent: the hole in the wall (in the wall already) and a square steel
 * duct through it, 6 cm walls round the hole's 45 cm, running `duct` each
 * way. A low one stands on the floor, its underside filled down to it, and
 * a high one hangs against the ceiling, its top touching it, so there is
 * never a slot under or over one. Grilles painted on its ends' rims.
 */
function vent(H, o) {
  const t = 0.06;
  const [w, e] = o.duct;
  const x0 = o.at - w;
  const x1 = o.at + e;
  const lo = o.h0 - t;
  const hi = o.h1 + t;
  const low = o.h0 < floorOf(o.f) + 1;
  const base = low ? floorOf(o.f) : lo;
  const top = low ? hi : ceilOf(o.f);
  H.block('scSteel', x0, o.a0 - t, x1, o.a0, base, top, 'duct');
  H.block('scSteel', x0, o.a1, x1, o.a1 + t, base, top, 'duct');
  H.block('scSteel', x0, o.a0, x1, o.a1, base, o.h0, 'duct');
  H.block('scSteel', x0, o.a0, x1, o.a1, o.h1, top, 'duct');
  /* The rims, dark, so the mouth reads as a hole from across a room. */
  for (const [x, s] of [[x0, -1], [x1, 1]]) {
    H.face('scDark', 'y', x, s, o.a0 - t, o.a0, o.h0, o.h1);
    H.face('scDark', 'y', x, s, o.a1, o.a1 + t, o.h0, o.h1);
    H.face('scDark', 'y', x, s, o.a0 - t, o.a1 + t, o.h0 - t, o.h0);
    H.face('scDark', 'y', x, s, o.a0 - t, o.a1 + t, o.h1, o.h1 + t);
  }
}

/* The book lift's shaft, its car at the bottom and its top. */
function bookLift(H) {
  const L = LIFT;
  const xw = L.x0 - L.t;
  const yn = L.y1 + L.t;
  const [o0, o1] = L.open;
  /* The ground floor's run, the slab's thickness between, the first's. */
  for (const [lv, h0, h1] of [[FLOOR0, 0, CEIL0], [F1, F1, F1 + o1 + 0.06]]) {
    H.wall('scWood', 'y', xw + L.t / 2, L.y0, yn, h0, h1, L.t, [], 'lift');
    H.wall('scWood', 'x', L.y1 + L.t / 2, xw, L.x1, h0, h1, L.t, [[L.x0, L.x1, lv + o0, lv + o1]], 'lift');
    H.frame('scDark', 'x', yn, 1, L.x0, L.x1, lv + o0, lv + o1, 0.04, 0);
  }
  H.block('scSteel', L.x0, L.y0, L.x1, L.y1, FLOOR0, FLOOR0 + o0, 'lift car');
  H.block('scWood', xw, L.y0, L.x1, yn, F1 + o1, F1 + o1 + 0.06, 'lift');
  /* A brass plate over each opening, a little bell beside it. */
  for (const lv of [FLOOR0, F1]) {
    H.face('scYellow', 'x', yn, 1, L.x0 + 0.2, L.x1 - 0.2, lv + o1 + 0.12, lv + o1 + 0.22);
  }
}

/* The glass tank in the lab. */
function tank(H) {
  const T = TANK;
  const f = FLOOR0;
  H.block('scGreen', T.x0, T.y0, T.x1, T.y1, f, T.base, 'tank base');
  H.floorPaint('scWhite', T.pad[0] - 0.22, T.pad[1] - 0.22, T.pad[0] + 0.22, T.pad[1] + 0.22, T.base);
  H.floorPaint('scGreen', T.pad[0] - 0.16, T.pad[1] - 0.16, T.pad[0] + 0.16, T.pad[1] + 0.16, T.base, 1);
  const g = 0.04;
  const p = 0.06;
  H.hidden(T.x0, T.y0 + p, T.base, T.x0 + g, T.y1 - p, T.top);
  H.hidden(T.x1 - g, T.y0 + p, T.base, T.x1, T.y1 - p, T.top);
  H.hidden(T.x0 + p, T.y0, T.base, T.x1 - p, T.y0 + g, T.top);
  H.hidden(T.x0 + p, T.y1 - g, T.base, T.x1 - p, T.y1, T.top);
  for (const [x, y] of [[T.x0, T.y0], [T.x1 - p, T.y0], [T.x0, T.y1 - p], [T.x1 - p, T.y1 - p]]) {
    H.block('scSteel', x, y, x + p, y + p, T.base, T.top + p, 'tank frame');
  }
  H.block('scSteel', T.x0 + p, T.y0, T.x1 - p, T.y0 + p, T.top, T.top + p, 'tank frame');
  H.block('scSteel', T.x0 + p, T.y1 - p, T.x1 - p, T.y1, T.top, T.top + p, 'tank frame');
  H.block('scSteel', T.x0, T.y0 + p, T.x0 + p, T.y1 - p, T.top, T.top + p, 'tank frame');
  H.block('scSteel', T.x1 - p, T.y0 + p, T.x1, T.y1 - p, T.top, T.top + p, 'tank frame');
  /* Streaks on the glass, both faces of each pane. */
  const hh = T.top - T.base;
  for (const [y, s] of [[T.y0, -1], [T.y1, 1]]) {
    const at = y + s * 0.003;
    for (const k of [0.2, 0.62]) {
      const a = T.x0 + (T.x1 - T.x0) * k;
      H.face('scWhite', 'x', at, s, a, a + 0.05, T.base + hh * 0.35, T.base + hh * 0.85);
      H.face('scWhite', 'x', at, s, a + 0.12, a + 0.15, T.base + hh * 0.5, T.base + hh * 0.8);
    }
  }
  for (const [x, s] of [[T.x0, -1], [T.x1, 1]]) {
    const at = x + s * 0.003;
    const a = T.y0 + (T.y1 - T.y0) * 0.3;
    H.face('scWhite', 'y', at, s, a, a + 0.05, T.base + hh * 0.35, T.base + hh * 0.85);
    H.face('scWhite', 'y', at, s, a + 0.12, a + 0.15, T.base + hh * 0.5, T.base + hh * 0.8);
  }
  /* A hazard stripe round the base. */
  for (const [y, s] of [[T.y0, -1], [T.y1, 1]]) {
    H.face('scYellow', 'x', y, s, T.x0, T.x1, f + 0.06, f + 0.11);
  }
  for (const [x, s] of [[T.x0, -1], [T.x1, 1]]) {
    H.face('scYellow', 'y', x, s, T.y0, T.y1, f + 0.06, f + 0.11);
  }
}

/* ------------------------------------------------------------------ */
/* The stairs                                                          */
/* ------------------------------------------------------------------ */

function stairs(H, east) {
  const X = (px) => (east ? LEN - px : px);
  const bx = (m, a0, y0, h0, a1, y1, h1, name) => H.box(m, Math.min(X(a0), X(a1)), y0, h0, Math.max(X(a0), X(a1)), y1, h1, { name });
  const pt = (m, a0, y0, h0, a1, y1, h1) => H.paint(m, Math.min(X(a0), X(a1)), y0, h0, Math.max(X(a0), X(a1)), y1, h1);
  const St = STAIR;
  const run = (St.y1 - St.y0) / St.steps;
  const rise1 = (St.mid - FLOOR0) / St.steps;
  const rise2 = (F1 - St.mid) / St.steps;
  for (let k = 0; k < St.steps; k += 1) {
    /* Flight one up the outer side, northward. */
    const y0 = St.y0 + run * k;
    const h1 = FLOOR0 + rise1 * (k + 1);
    bx('scLino', 0, y0, 0, St.split[0], y0 + run, h1, 'stair');
    pt('scDark', 0, y0 + run - 0.04, h1, St.split[0], y0 + run, h1 + 0.006);
    /* Flight two up the inner side, southward. */
    const z0 = St.y1 - run * (k + 1);
    const z1 = St.mid + rise2 * (k + 1);
    bx('scLino', St.split[1], z0, 0, St.wall, z0 + run, z1, 'stair');
  }
  bx('scLino', 0, St.y1, 0, St.wall, St.land, St.mid, 'landing');
  /* The wall between the flights, to a handrail's height over the upper. */
  bx('scWall', St.split[0], St.y0, 0, St.split[1], St.y1, F1 + 0.9, 'stair wall');
  bx('scWood', St.split[0] - 0.03, St.y0, F1 + 0.9, St.split[1] + 0.03, St.y1, F1 + 0.95, 'handrail');
  /* The balustrade along the well's edge upstairs, over flight one. */
  bx('scWall', 0, St.y0 - 0.08, F1, St.split[0], St.y0, F1 + 0.9, 'balustrade');
  bx('scWood', 0, St.y0 - 0.1, F1 + 0.9, St.split[0], St.y0 + 0.02, F1 + 0.95, 'handrail');
  /* A tall window painted on the outer wall over the landing, sun on the
   * landing under it. */
  const wxAt = east ? LEN : 0;
  const side = east ? -1 : 1;
  H.face('scSky', 'y', wxAt, side, 10.6, 12.4, St.mid + 1.0, F1 + 1.6);
  H.frame('scWhite', 'y', wxAt, side, 10.6, 12.4, St.mid + 1.0, F1 + 1.6, 0.06);
  H.face('scWhite', 'y', wxAt, side, 11.47, 11.53, St.mid + 1.0, F1 + 1.6, 0.012);
  pt('scSun', 0.1, St.y1 + 0.1, St.mid + 0.004, 1.4, St.land - 0.1, St.mid + 0.008);
  /* Lamps: one over each landing under the slab, one high in the well. */
  for (const [y, h] of [[8.7, CEIL0], [8.7, CEIL1], [11.5, CEIL1]]) {
    bx('scLamp', 0.9, y - 0.1, h - 0.05, 2.1, y + 0.1, h, 'lamp');
  }
  /* The landings' ends: a mirror at the hallway's end, and a pad. */
  for (const f of [0, 1]) {
    const lv = floorOf(f);
    H.face('scSteel', 'y', wxAt, side, 8.0, 9.4, lv + 0.6, lv + 1.9);
    H.frame('scWood', 'y', wxAt, side, 8.0, 9.4, lv + 0.6, lv + 1.9, 0.05);
  }
}

/* ------------------------------------------------------------------ */
/* The rooms' things                                                   */
/* ------------------------------------------------------------------ */

/* The outside wall's painted windows along a room, sun on its floor. */
function outerWindows(H, f, x0, x1, north, sun = true) {
  const lv = floorOf(f);
  const at = north ? DEP : 0;
  const side = north ? -1 : 1;
  const n = Math.max(1, Math.floor((x1 - x0 - 0.4) / 2.0));
  const pitch = (x1 - x0) / n;
  for (let i = 0; i < n; i += 1) {
    const c = x0 + pitch * (i + 0.5);
    const a0 = c - 0.75;
    const a1 = c + 0.75;
    H.face('scSky', 'x', at, side, a0, a1, lv + 0.9, lv + 2.4);
    H.frame('scWhite', 'x', at, side, a0, a1, lv + 0.9, lv + 2.4, 0.06);
    H.face('scWhite', 'x', at, side, c - 0.03, c + 0.03, lv + 0.9, lv + 2.4, 0.012);
    H.face('scWhite', 'x', at, side, a0, a1, lv + 1.62, lv + 1.67, 0.012);
    /* The curtains gathered each side, pale yellow. */
    H.face('scYellow', 'x', at, side, a0 - 0.28, a0 - 0.08, lv + 0.8, lv + 2.55, 0.024);
    H.face('scYellow', 'x', at, side, a1 + 0.08, a1 + 0.28, lv + 0.8, lv + 2.55, 0.024);
    if (sun && !north) {
      H.floorPaint('scSun', a0 + 0.5, 0.7, a1 + 0.7, 2.1, lv);
    }
  }
}

/* The ceiling lamps over a room: rows of long flat lamps against it. */
function lamps(H, f, xs, ys, along = 'x', len = 1.2) {
  const ce = ceilOf(f);
  for (const x of xs) {
    for (const y of ys) {
      if (along === 'x') {
        H.box('scLamp', x - len / 2, y - 0.1, ce - 0.05, x + len / 2, y + 0.1, ce, { name: 'lamp', cast: false });
      } else {
        H.box('scLamp', x - 0.1, y - len / 2, ce - 0.05, x + 0.1, y + len / 2, ce, { name: 'lamp', cast: false });
      }
    }
  }
}

/* A pupil's desk facing west, its chair behind it. */
function deskSet(H, d, c, lv) {
  H.table('scWood', d, c - 0.3, d + 0.45, c + 0.3, lv, 0.7, { name: 'desk' });
  H.box('scWood', d + 0.55, c - 0.2, lv + 0.4, d + 0.95, c + 0.2, lv + 0.44, { name: 'chair' });
  H.box('scWood', d + 0.91, c - 0.2, lv + 0.44, d + 0.95, c + 0.2, lv + 0.85, { name: 'chair back' });
  for (const [x, y] of [[d + 0.55, c - 0.2], [d + 0.875, c - 0.2], [d + 0.55, c + 0.165], [d + 0.875, c + 0.165]]) {
    H.box('scSteel', x, y, lv, x + 0.035, y + 0.035, lv + 0.4, { name: 'leg' });
  }
}

/*
 * A classroom: the blackboard on its west wall over the teacher's
 * platform and podium, four rows of five desks facing it, cubbies along
 * the back wall under a notice board, the windows on the outside wall.
 * `o.platform` and `o.board` are its spans in py, `o.cubbies` the cubbies'
 * runs, `o.skip` desks left out as [row, column].
 */
function classroom(H, x0, f, o = {}) {
  const lv = floorOf(f);
  const ce = ceilOf(f);
  const wf = x0 + 0.06;
  const [p0, p1] = o.platform ?? [1.0, 6.2];
  const [b0, b1] = o.board ?? [1.0, 6.2];
  H.block('scWood', wf, p0, x0 + 1.0, p1, lv, lv + 0.2, 'platform');
  const pc = o.podium ?? 3.7;
  H.block('scWood', x0 + 0.5, pc - 0.4, x0 + 1.0, pc + 0.4, lv + 0.2, lv + 1.05, 'podium');
  H.face('scBoard', 'y', wf, 1, b0, b1, lv + 0.9, lv + 2.1);
  H.frame('scWood', 'y', wf, 1, b0, b1, lv + 0.9, lv + 2.1, 0.05);
  H.face('scWhite', 'y', wf, 1, b0, b1, lv + 0.85, lv + 0.88, 0.024);
  /* Chalk: a noughts and crosses grid and a line of the day's lesson. */
  const g = b0 + 0.6;
  for (const k of [0.25, 0.5]) {
    H.face('scWhite', 'y', wf, 1, g + k, g + k + 0.025, lv + 1.25, lv + 1.95, 0.024);
    H.face('scWhite', 'y', wf, 1, g, g + 0.75, lv + 1.25 + k * 1.4, lv + 1.275 + k * 1.4, 0.024);
  }
  for (let a = b0 + 1.8; a < b1 - 0.6; a += 0.34) {
    H.face('scWhite', 'y', wf, 1, a, a + 0.22, lv + 1.8, lv + 1.83, 0.024);
    H.face('scWhite', 'y', wf, 1, a + 0.06, a + 0.26, lv + 1.55, lv + 1.58, 0.024);
  }
  /* The clock over the board. */
  H.face('scWhite', 'y', wf, 1, pc - 0.16, pc + 0.16, lv + 2.28, lv + 2.6);
  H.face('scDark', 'y', wf, 1, pc - 0.015, pc + 0.015, lv + 2.44, lv + 2.57, 0.024);
  H.face('scDark', 'y', wf, 1, pc - 0.015, pc + 0.1, lv + 2.43, lv + 2.46, 0.024);
  /* The desks. */
  const skip = new Set((o.skip ?? []).map(([r, c]) => `${r},${c}`));
  [1.8, 3.2, 4.6, 6.0].forEach((dx, r) => {
    [1.2, 2.4, 3.6, 4.8, 6.0].forEach((cy, c) => {
      if (!skip.has(`${r},${c}`)) {
        deskSet(H, x0 + dx, cy, lv);
      }
    });
  });
  /* The cubbies and the notice board on the back wall. */
  const wb = x0 + 7.94;
  for (const [y0, y1, h0 = lv, h1 = lv + 1.0] of o.cubbies ?? [[0, 6.75]]) {
    H.block('scWood', x0 + 7.4, y0, wb, y1, h0, h1, 'cubby');
    if (h0 === lv) {
      for (let y = y0 + 0.05; y < y1 - 0.3; y += 0.45) {
        H.face('scDark', 'y', x0 + 7.4, -1, y + 0.04, y + 0.4, lv + 0.12, lv + 0.45);
        H.face('scDark', 'y', x0 + 7.4, -1, y + 0.04, y + 0.4, lv + 0.56, lv + 0.88);
      }
    }
  }
  const [n0, n1] = o.notice ?? [1.0, 6.0];
  H.face('scWood', 'y', wb, -1, n0, n1, lv + 1.3, lv + 2.25);
  [[1.3, 1.8, 2.15], [2.2, 1.6, 2.0], [3.4, 1.85, 2.18], [4.3, 1.45, 1.95], [5.2, 1.7, 2.1]].forEach(([y, h0, h1], i) => {
    if (y >= n0 && y + 0.5 <= n1) {
      H.face(i % 2 ? 'scWhite' : 'scPink', 'y', wb, -1, y, y + 0.5, lv + h0, lv + h1, 0.024);
    }
  });
  /* Lamps, the windows on the outside wall. */
  lamps(H, f, [x0 + 2.0, x0 + 4.0, x0 + 6.0], [2.2, 5.0]);
  outerWindows(H, f, x0, x0 + 8, false);
  void ce;
}

/* The science lab. */
function lab(H) {
  const lv = FLOOR0;
  tank(H);
  bookLift(H);
  /* Benches, blocks with black tops, and stools. */
  for (const [x0, y0, x1, y1] of [[11.8, 1.0, 13.8, 1.8], [18.2, 1.0, 19.6, 1.8], [12.6, 5.0, 13.8, 6.0], [18.2, 3.0, 19.4, 4.0]]) {
    H.block('scWhite', x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04, lv, lv + 0.85, 'bench');
    H.block('scDark', x0, y0, x1, y1, lv + 0.85, lv + 0.9, 'bench top');
    /* A tap and a rack of tubes on it. */
    H.cap('scSteel', [x0 + 0.3, (y0 + y1) / 2, lv + 0.9], [x0 + 0.3, (y0 + y1) / 2, lv + 1.2], 0.02, { name: 'tap', seg: 6 });
    H.block('scWood', x1 - 0.5, y0 + 0.2, x1 - 0.2, y0 + 0.35, lv + 0.9, lv + 0.98, 'rack');
    for (const k of [0, 1, 2]) {
      H.box(k === 1 ? 'scGreen' : 'scBlue', x1 - 0.48 + k * 0.1, y0 + 0.24, lv + 0.98, x1 - 0.42 + k * 0.1, y0 + 0.31, lv + 1.12, { name: 'tube' });
    }
  }
  /* The counter along the south wall under the windows, a sink in it,
   * beakers on it. */
  H.block('scWhite', 14.2, 0, 17.8, 0.6, lv, lv + 0.85, 'counter');
  H.block('scDark', 14.2, 0, 17.8, 0.62, lv + 0.85, lv + 0.9, 'counter top');
  H.floorPaint('scSteel', 15.4, 0.1, 16.2, 0.5, lv + 0.9);
  for (const [x, m] of [[14.5, 'scBlue'], [14.8, 'scGreen'], [17.0, 'scPink'], [17.35, 'scYellow']]) {
    H.box(m, x, 0.2, lv + 0.9, x + 0.12, 0.32, lv + 1.08, { name: 'beaker' });
  }
  /* The anatomy model in the north west corner, on its stand. */
  const sx = 11.65;
  const sy = 6.55;
  H.block('scDark', sx - 0.2, sy - 0.2, sx + 0.2, sy + 0.2, lv, lv + 0.06, 'stand');
  H.cap('scSteel', [sx, sy, lv + 0.06], [sx, sy, lv + 0.9], 0.025, { name: 'stand pole', seg: 6 });
  H.cap('scWhite', [sx, sy, lv + 0.95], [sx, sy, lv + 1.45], 0.11, { name: 'model', look: 'capsule', seg: 8 });
  H.cap('scWhite', [sx, sy, lv + 1.62], [sx, sy, lv + 1.66], 0.1, { name: 'model head', look: 'capsule', seg: 8 });
  /* A periodic table, a poster of colours, on the west wall. */
  const wf = 11.06;
  H.face('scWhite', 'y', wf, 1, 1.6, 4.4, lv + 1.1, lv + 2.2);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      if (r === 0 && c > 0 && c < 8) {
        continue;
      }
      const m = c < 2 ? 'scPink' : c > 6 ? 'scBlue' : 'scYellow';
      H.face(m, 'y', wf, 1, 1.7 + c * 0.3, 1.94 + c * 0.3, lv + 1.95 - r * 0.22, lv + 2.12 - r * 0.22, 0.024);
    }
  }
  lamps(H, 0, [12.8, 16.0, 19.2], [2.2, 5.0]);
  outerWindows(H, 0, 11, 20, false);
}

/* The library: a maze of shelves, a reading table, the librarian's desk
 * by the book lift's top. */
function library(H) {
  const lv = F1;
  const books = ['scRed', 'scBlue', 'scYellow', 'scWood', 'scGreen', 'scPink'];
  let n = 0;
  const shelf = (x, y0, y1) => {
    H.block('scWood', x, y0, x + 0.35, y1, lv, lv + 1.8, 'shelf');
    for (const [fx, s] of [[x, -1], [x + 0.35, 1]]) {
      for (let k = 0; k < 4; k += 1) {
        const h0 = lv + 0.12 + k * 0.42;
        for (let y = y0 + 0.05; y < y1 - 0.2; y += 0.55) {
          H.face(books[n % books.length], 'y', fx, s, y, Math.min(y1 - 0.05, y + 0.5), h0, h0 + 0.3);
          n += 1;
        }
      }
    }
  };
  /* Four long shelves north and south, each broken once so the aisles
   * join; the breaks staggered, which makes the maze. */
  shelf(12.6, 1.0, 3.0);
  shelf(12.6, 3.9, 5.6);
  shelf(14.4, 1.0, 4.6);
  shelf(16.2, 1.0, 2.2);
  shelf(16.2, 3.1, 5.6);
  shelf(18.0, 1.9, 5.6);
  /* The reading table along the hallway end, flown under. */
  H.table('scWood', 13.2, 6.2, 17.8, 6.8, lv, 0.72, { name: 'table', top: 0.05, leg: 0.06 });
  /* The librarian's desk and the lift's top beside it. */
  H.block('scWood', 18.9, 1.2, 19.6, 1.9, lv, lv + 0.85, 'desk');
  H.block('scDark', 18.95, 1.4, 19.3, 1.7, lv + 0.85, lv + 1.05, 'monitor');
  lamps(H, 1, [13.5, 15.3, 17.1, 19.5], [2.2, 5.0], 'y', 1.0);
  outerWindows(H, 1, 11, 20, false);
}

/* The music room: risers along the windows, the piano, music stands. */
function music(H) {
  const lv = F1;
  for (const [y0, y1, h] of [[0, 0.9, 0.6], [0.9, 1.6, 0.4], [1.6, 2.4, 0.2]]) {
    H.block('scWood', 31.0, y0, 36.0, y1, lv, lv + h, 'riser');
  }
  H.block('scDark', 33.4, 4.8, 35.0, 5.45, lv, lv + 1.1, 'piano');
  H.block('scWhite', 33.5, 4.65, 34.9, 4.8, lv + 0.72, lv + 0.76, 'keys');
  H.block('scDark', 33.75, 3.95, 34.65, 4.2, lv, lv + 0.48, 'piano stool');
  for (const x of [30.6, 31.8, 33.0]) {
    H.cap('scSteel', [x, 3.4, lv], [x, 3.4, lv + 1.05], 0.02, { name: 'stand', seg: 6 });
    H.box('scDark', x - 0.2, 3.38, lv + 1.05, x + 0.2, 3.42, lv + 1.35, { name: 'stand' });
  }
  /* The board on the east wall, its staves. */
  H.face('scBoard', 'y', 36.94, -1, 1.2, 6.0, lv + 0.9, lv + 2.1);
  H.frame('scWood', 'y', 36.94, -1, 1.2, 6.0, lv + 0.9, lv + 2.1, 0.05);
  for (let k = 0; k < 5; k += 1) {
    H.face('scWhite', 'y', 36.94, -1, 1.5, 5.7, lv + 1.3 + k * 0.1, lv + 1.32 + k * 0.1, 0.024);
  }
  lamps(H, 1, [31.0, 33.0, 35.0], [2.2, 5.0]);
  outerWindows(H, 1, 29, 37, false);
}

/* The shoe lockers: three rows of cubbies, the entrance's glass doors. */
function shoes(H) {
  const lv = FLOOR0;
  for (const [y0, y1] of [[5.6, 6.1], [3.9, 4.4], [2.2, 2.7]]) {
    H.block('scWood', 30.2, y0, 35.8, y1, lv, lv + 1.8, 'locker');
    for (const [y, s] of [[y0, -1], [y1, 1]]) {
      for (let x = 30.3; x < 35.6; x += 0.4) {
        for (let k = 0; k < 4; k += 1) {
          H.face('scDark', 'x', y, s, x, x + 0.32, lv + 0.12 + k * 0.42, lv + 0.42 + k * 0.42);
        }
      }
    }
  }
  /* The entrance's doors painted on the south wall, sky through them, and
   * a mat in front. */
  for (const [a0, a1] of [[30.6, 32.4], [33.6, 35.4]]) {
    H.face('scSky', 'x', 0, 1, a0, a1, lv, lv + 2.1);
    H.frame('scSteel', 'x', 0, 1, a0, a1, lv, lv + 2.1, 0.06);
    H.face('scSteel', 'x', 0, 1, (a0 + a1) / 2 - 0.03, (a0 + a1) / 2 + 0.03, lv, lv + 2.1, 0.012);
  }
  H.floorPaint('scSun', 30.4, 0.3, 35.6, 1.8, lv);
  /* A trophy case on the west wall. */
  H.block('scWood', 29.06, 0.6, 29.5, 1.8, lv, lv + 1.8, 'trophy case');
  for (const [y, m] of [[0.8, 'scYellow'], [1.2, 'scSteel'], [1.5, 'scYellow']]) {
    H.face(m, 'y', 29.5, 1, y, y + 0.18, lv + 1.0, lv + 1.35, 0.012);
  }
  lamps(H, 0, [31.0, 33.0, 35.0], [1.4, 3.2, 5.0]);
}

/* The lunch room: two long tables either side of a cross aisle, benches. */
function lunch(H) {
  const lv = FLOOR0;
  for (const [y0, y1] of [[11.6, 12.4], [14.4, 15.2]]) {
    for (const [x0, x1] of [[4.0, 8.0], [9.0, 13.0]]) {
      H.table('scWood', x0, y0, x1, y1, lv, 0.72, { name: 'table', top: 0.05, leg: 0.06 });
      for (const [b0, b1] of [[y0 - 0.6, y0 - 0.3], [y1 + 0.3, y1 + 0.6]]) {
        H.box('scWood', x0, b0, lv + 0.4, x1, b1, lv + 0.44, { name: 'bench' });
        for (const x of [x0 + 0.1, x1 - 0.15]) {
          H.box('scSteel', x, b0, lv, x + 0.05, b1, lv + 0.4, { name: 'leg' });
        }
      }
    }
  }
  /* A water cooler and a menu board. */
  H.block('scWhite', 3.06, 16.3, 3.6, 17.0, lv, lv + 1.1, 'cooler');
  H.block('scBlue', 3.15, 16.4, 3.5, DEP, lv + 1.1, lv + 1.45, 'cooler');
  H.face('scBoard', 'y', 3.06, 1, 11.0, 13.6, lv + 1.0, lv + 2.0);
  H.frame('scWood', 'y', 3.06, 1, 11.0, 13.6, lv + 1.0, lv + 2.0, 0.05);
  lamps(H, 0, [5.0, 8.5, 12.0], [12.0, 14.8]);
  outerWindows(H, 0, 3, 15, true);
}

/* The kitchen: the serving counter under the hatch, a prep island, the
 * stove and its pots, the fridge, a shelf. */
function kitchen(H) {
  const lv = FLOOR0;
  H.block('scSteel', 15.8, 10.15, 17.8, 10.75, lv, 0.85, 'counter');
  H.block('scSteel', 16.2, 12.6, 17.8, 14.0, lv, lv + 0.9, 'island');
  H.block('scWhite', 16.3, 12.8, 16.9, 13.1, lv + 0.9, lv + 0.95, 'board');
  H.block('scDark', 15.06, 15.6, 16.2, 17.0, lv, lv + 0.9, 'stove');
  for (const [x, y, r] of [[15.4, 16.0, 0.18], [15.85, 16.5, 0.15]]) {
    H.cap('scSteel', [x, y, lv + 0.9], [x, y, lv + 1.15], r, { name: 'pot', seg: 10 });
  }
  H.block('scWhite', 17.9, 16.2, 18.94, 17.0, lv, lv + 1.9, 'fridge');
  H.face('scSteel', 'x', 16.2, -1, 18.0, 18.06, lv + 0.6, lv + 1.5);
  H.block('scWood', 18.5, 10.95, 18.94, 12.4, lv, lv + 1.8, 'shelf');
  for (const [y, m] of [[11.1, 'scRed'], [11.55, 'scYellow'], [12.0, 'scBlue']]) {
    H.box(m, 18.62, y, lv + 1.8, 18.8, y + 0.18, lv + 2.0, { name: 'tin' });
  }
  /* The food trolleys parked by the hatch, flown under. */
  H.table('scSteel', 17.95, 14.3, 18.75, 15.3, lv, 0.85, { name: 'cart', top: 0.05, leg: 0.05 });
  lamps(H, 0, [17.0], [12.0, 15.2], 'y', 1.0);
}

/* The staff room: desk islands with monitors and paper, a copier. */
function staff(H) {
  const lv = FLOOR0;
  for (const [x0, y0, x1, y1] of [[21.0, 11.8, 23.4, 13.2], [21.0, 14.4, 23.4, 15.8], [24.4, 11.8, 26.2, 13.2]]) {
    H.block('scSteel', x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, lv, lv + 0.68, 'desk');
    H.block('scWood', x0, y0, x1, y1, lv + 0.68, lv + 0.72, 'desk top');
    for (let x = x0 + 0.3; x < x1 - 0.3; x += 1.0) {
      H.block('scDark', x, (y0 + y1) / 2 - 0.04, x + 0.45, (y0 + y1) / 2 + 0.04, lv + 0.72, lv + 1.05, 'monitor');
      H.block('scWhite', x + 0.05, y0 + 0.15, x + 0.35, y0 + 0.4, lv + 0.72, lv + 0.86, 'paper');
    }
  }
  H.block('scWhite', 25.2, 16.2, 26.4, 17.0, lv, lv + 1.0, 'copier');
  H.block('scDark', 25.3, 16.3, 26.3, 16.9, lv + 1.0, lv + 1.08, 'copier');
  H.face('scWhite', 'y', 19.06, 1, 14.5, 16.6, lv + 1.0, lv + 2.0);
  for (let k = 1; k < 5; k += 1) {
    H.face('scBlue', 'y', 19.06, 1, 14.5, 16.6, lv + 1.0 + k * 0.2, lv + 1.012 + k * 0.2, 0.024);
    H.face('scBlue', 'y', 19.06, 1, 14.5 + k * 0.42, 14.512 + k * 0.42, lv + 1.0, lv + 2.0, 0.024);
  }
  lamps(H, 0, [21.0, 23.0, 25.0], [12.4, 15.2]);
  outerWindows(H, 0, 19, 27, true);
}

/* The nurse's room: two beds behind curtains, a desk, a cabinet. */
function nurse(H) {
  const lv = FLOOR0;
  for (const x0 of [27.55, 29.45]) {
    H.block('scSteel', x0, 14.9, x0 + 1.0, 17.0, lv, lv + 0.42, 'bed');
    H.block('scWhite', x0 + 0.03, 14.93, x0 + 0.97, 16.97, lv + 0.42, lv + 0.55, 'mattress');
    H.block('scWhite', x0 + 0.2, 16.4, x0 + 0.8, 16.85, lv + 0.55, lv + 0.65, 'pillow');
    H.block('scBlue', x0 + 0.03, 14.93, x0 + 0.97, 15.8, lv + 0.55, lv + 0.6, 'blanket');
  }
  /* The curtains hang from the ceiling to half a metre off the floor. */
  H.box('scPink', 27.06, 14.47, lv + 0.45, 28.7, 14.5, CEIL0, { name: 'curtain' });
  H.box('scPink', 29.0, 14.5, lv + 0.45, 29.03, 17.0, CEIL0, { name: 'curtain' });
  H.block('scWood', 27.06, 11.0, 28.3, 11.7, lv, lv + 0.72, 'desk');
  H.block('scWhite', 30.4, 10.6, 30.94, 12.0, lv, lv + 1.8, 'cabinet');
  H.face('scSky', 'y', 30.4, -1, 10.7, 11.9, lv + 1.0, lv + 1.7);
  H.face('scBlue', 'y', 27.06, 1, 12.6, 13.4, lv + 1.5, lv + 2.1);
  H.face('scWhite', 'y', 27.06, 1, 12.9, 13.1, lv + 1.6, lv + 2.0, 0.024);
  H.face('scWhite', 'y', 27.06, 1, 12.7, 13.3, lv + 1.72, lv + 1.88, 0.024);
  lamps(H, 0, [29.0], [12.0, 15.6], 'y', 1.0);
  outerWindows(H, 0, 27, 31, true);
}

/* The sports store: shelves of kit, mats, the vaulting box, balls. */
function store(H) {
  const lv = FLOOR0;
  for (const [y0, y1] of [[12.0, 12.4], [14.0, 14.4]]) {
    H.block('scSteel', 32.0, y0, 36.0, y1, lv, lv + 2.35, 'shelf');
    for (const [y, s] of [[y0, -1], [y1, 1]]) {
      for (let k = 0; k < 4; k += 1) {
        for (let x = 32.1; x < 35.8; x += 0.7) {
          H.face(['scRed', 'scBlue', 'scYellow', 'scWhite'][(k + Math.round(x)) % 4], 'x', y, s, x, x + 0.5, lv + 0.15 + k * 0.58, lv + 0.45 + k * 0.58);
        }
      }
    }
  }
  /* The vaulting box, stepped like the real one. */
  for (let k = 0; k < 4; k += 1) {
    H.block(k === 3 ? 'scWhite' : 'scWood', 32.8 + k * 0.03, 15.2 + k * 0.03, 34.2 - k * 0.03, 16.0 - k * 0.03, lv + k * 0.22, lv + (k + 1) * 0.22, 'vault');
  }
  H.block('scBlue', 35.0, 15.2, 36.94, 17.0, lv, lv + 0.4, 'mats');
  H.block('scBlue', 35.1, 15.3, 36.94, 17.0, lv + 0.4, lv + 0.6, 'mats');
  for (const [x, y, m] of [[31.8, 16.4, 'scRed'], [32.3, 16.6, 'scWhite'], [31.7, 15.6, 'scYellow']]) {
    H.cap(m, [x, y, lv + 0.15], [x, y, lv + 0.16], 0.13, { name: 'ball', look: 'capsule', seg: 8 });
  }
  lamps(H, 0, [34.0], [11.2, 13.2, 15.4]);
  outerWindows(H, 0, 31, 37, true);
}

/* The art room: big tables, easels by the windows, the drying rack. */
function art(H) {
  const lv = F1;
  for (const [x0, y0] of [[4.5, 12.0], [7.8, 12.0], [4.5, 14.4], [7.8, 14.4]]) {
    H.table('scWood', x0, y0, x0 + 2.4, y0 + 1.3, lv, 0.75, { name: 'table', top: 0.05, leg: 0.06 });
  }
  H.floorPaint('scBlue', 5.2, 13.5, 5.6, 13.8, lv);
  H.floorPaint('scPink', 8.9, 13.6, 9.2, 13.85, lv);
  H.floorPaint('scYellow', 6.4, 14.0, 6.6, 14.2, lv);
  /* Easels: three legs and a canvas. */
  for (const x of [11.3, 12.5, 13.7]) {
    const y = 15.9;
    H.cap('scWood', [x - 0.25, y + 0.1, lv], [x, y - 0.05, lv + 1.7], 0.025, { name: 'easel', seg: 6 });
    H.cap('scWood', [x + 0.25, y + 0.1, lv], [x, y - 0.05, lv + 1.7], 0.025, { name: 'easel', seg: 6 });
    H.cap('scWood', [x, y + 0.45, lv], [x, y + 0.05, lv + 1.6], 0.025, { name: 'easel', seg: 6 });
    H.box('scWhite', x - 0.32, y - 0.12, lv + 0.85, x + 0.32, y - 0.08, lv + 1.55, { name: 'canvas' });
  }
  H.block('scWood', 11.2, 11.0, 12.4, 11.6, lv, lv + 1.6, 'rack');
  for (let k = 1; k < 8; k += 1) {
    H.face('scDark', 'x', 11.0, -1, 11.25, 12.35, lv + k * 0.2, lv + k * 0.2 + 0.02);
  }
  H.block('scWhite', 3.06, 11.0, 3.7, 13.0, lv, lv + 0.85, 'sink');
  /* The plaster bust on its stand. */
  H.block('scWhite', 8.6, 16.6, 9.0, DEP, lv, lv + 1.0, 'stand');
  H.cap('scWhite', [8.8, 16.8, lv + 1.15], [8.8, 16.8, lv + 1.2], 0.14, { name: 'bust', look: 'capsule', seg: 8 });
  lamps(H, 1, [5.0, 8.5, 12.0], [12.2, 15.2]);
  outerWindows(H, 1, 3, 15, true);
}

/* The computer room: rows of benching with monitors, the tray of cables
 * along the ceiling, the server rack. */
function computer(H) {
  const lv = F1;
  for (const [y0, y1] of [[11.6, 12.4], [13.6, 14.4], [15.6, 16.4]]) {
    H.block('scWhite', 16.8, y0, 25.2, y1, lv, lv + 0.75, 'bench');
    for (let x = 17.0; x < 25.0; x += 1.1) {
      H.block('scDark', x, (y0 + y1) / 2 - 0.03, x + 0.5, (y0 + y1) / 2 + 0.03, lv + 0.78, lv + 1.12, 'monitor');
      H.block('scDark', x + 0.2, (y0 + y1) / 2 - 0.08, x + 0.3, (y0 + y1) / 2 + 0.08, lv + 0.75, lv + 0.78, 'monitor stand');
      H.face('scSky', 'x', (y0 + y1) / 2 - 0.03, -1, x + 0.04, x + 0.46, lv + 0.82, lv + 1.08);
    }
  }
  H.block('scSteel', 16.8, 13.95, 25.2, 14.05, CEIL1 - 0.15, CEIL1, 'tray');
  H.block('scDark', 26.2, 16.2, 26.94, 17.0, lv, lv + 2.0, 'rack');
  for (let k = 0; k < 6; k += 1) {
    H.face(k % 2 ? 'scGreen' : 'scLamp', 'y', 26.2, -1, 16.3, 16.36, lv + 0.3 + k * 0.28, lv + 0.36 + k * 0.28);
  }
  lamps(H, 1, [18.0, 21.0, 24.0], [12.6, 15.0]);
  outerWindows(H, 1, 15, 27, true);
}

/* The club room: the drone club's. A sofa, a kotatsu, boxes, and a whoop
 * gate on the floor, which is the only gate in the school. */
function club(H) {
  const lv = F1;
  H.block('scRed', 28.0, 15.9, 30.4, 17.0, lv, lv + 0.45, 'sofa');
  H.block('scRed', 28.0, 16.55, 30.4, 17.0, lv + 0.45, lv + 0.85, 'sofa');
  H.block('scRed', 28.0, 15.9, 28.25, 16.55, lv + 0.45, lv + 0.65, 'sofa');
  H.block('scRed', 30.15, 15.9, 30.4, 16.55, lv + 0.45, lv + 0.65, 'sofa');
  H.block('scPink', 30.8, 13.2, 32.0, 14.4, lv, lv + 0.35, 'kotatsu');
  H.block('scWood', 30.75, 13.15, 32.05, 14.45, lv + 0.35, lv + 0.4, 'kotatsu');
  H.block('scWood', 35.6, 15.6, 36.94, 17.0, lv, lv + 0.6, 'box');
  H.block('scWood', 35.8, 15.8, 36.94, 17.0, lv + 0.6, lv + 1.2, 'box');
  H.block('scWood', 36.4, 11.0, 36.94, 12.6, lv, lv + 1.8, 'shelf');
  for (const [y, m] of [[11.2, 'scYellow'], [11.7, 'scSteel'], [12.2, 'scYellow']]) {
    H.box(m, 36.6, y, lv + 1.8, 36.75, y + 0.15, lv + 2.1, { name: 'trophy' });
  }
  /* The gate. */
  const gx = 33.3;
  const gy = 12.4;
  H.cap('scYellow', [gx, gy, lv], [gx, gy, lv + 0.82], 0.02, { name: 'gate', seg: 6 });
  H.cap('scYellow', [gx + 0.62, gy, lv], [gx + 0.62, gy, lv + 0.82], 0.02, { name: 'gate', seg: 6 });
  H.cap('scYellow', [gx, gy, lv + 0.82], [gx + 0.62, gy, lv + 0.82], 0.02, { name: 'gate', seg: 6 });
  H.floorPaint('scWhite', gx - 0.1, gy - 1.0, gx + 0.72, gy - 0.96, lv);
  /* Posters. */
  for (const [y, m] of [[11.0, 'scBlue'], [12.0, 'scYellow'], [13.2, 'scPink']]) {
    H.face(m, 'y', 27.06, 1, y, y + 0.7, lv + 1.2, lv + 2.1);
  }
  lamps(H, 1, [29.0, 32.0, 35.0], [12.4, 15.2]);
  outerWindows(H, 1, 27, 37, true);
}

/* The hallways: wainscot, lamps, the pillar stubs at the partitions, the
 * banners, the notice boards, the sinks, a bench, the trophy case and the
 * class plates over the doors. */
function hallways(H) {
  for (const f of [0, 1]) {
    const lv = floorOf(f);
    const ce = ceilOf(f);
    for (const [at, side] of [[HALL.y0, 1], [HALL.y1, -1]]) {
      const wallAt = side > 0 ? HALL_S : HALL_N;
      const holes = OPENINGS.filter((o) => o.f === f && o.axis === 'x' && o.at === wallAt).map(holeOf);
      H.faceBut('scWainscot', 'x', at, side, 3.06, LEN - 3.06, lv, lv + 0.95, holes);
      H.faceBut('scWood', 'x', at, side, 3.06, LEN - 3.06, lv + 0.95, lv + 1.0, holes);
    }
    for (const x of [0, LEN]) {
      H.face('scWainscot', 'y', x, x ? -1 : 1, HALL.y0, HALL.y1, lv, lv + 0.95);
    }
    /* The stubs: a pillar each side of a partition's end. */
    const south = [11, 21, 29];
    const north = f ? [15, 27] : [15, 19, 27, 31];
    for (const x of south) {
      H.block('scWall', x - 0.15, HALL.y0, x + 0.15, HALL.y0 + 0.25, lv, ce, 'pillar');
    }
    for (const x of north) {
      H.block('scWall', x - 0.15, HALL.y1 - 0.25, x + 0.15, HALL.y1, lv, ce, 'pillar');
    }
    const lampsX = [];
    for (let x = 5.0; x < LEN - 4; x += 2.5) {
      lampsX.push(x);
    }
    lamps(H, f, lampsX, [8.7]);
    /* Banners across the hallway under the ceiling, the school's colours. */
    for (const [x, m] of [[8.5, 'scRed'], [21.15, 'scBlue'], [33.75, 'scYellow']]) {
      H.box(m, x, HALL.y0, ce - 0.55, x + 0.03, HALL.y1, ce, { name: 'banner' });
      H.paint('scWhite', x - 0.01, HALL.y0 + 0.3, ce - 0.42, x + 0.04, HALL.y1 - 0.3, ce - 0.38);
    }
    /* A class plate over each door, out from the wall. */
    for (const o of OPENINGS.filter((q) => q.f === f && q.axis === 'x' && q.kind === 'door')) {
      const s = o.at === HALL_S ? 1 : -1;
      const y0 = s > 0 ? HALL.y0 : HALL.y1 - 0.3;
      const x = o.a0 + 0.02;
      H.box('scWhite', x, y0, lv + 2.2, x + 0.03, y0 + 0.3, lv + 2.38, { name: 'plate', cast: false });
      H.paint('scWood', x - 0.005, y0 + 0.02, lv + 2.34, x + 0.035, y0 + 0.28, lv + 2.37);
    }
    /* Notice boards between doors. */
    for (const [a0, a1, at, side] of f
      ? [[18.55, 19.5, HALL.y0, 1], [23.55, 24.5, HALL.y1, -1]]
      : [[18.55, 19.5, HALL.y0, 1], [32.4, 34.2, HALL.y0, 1], [13.6, 14.8, HALL.y1, -1]]) {
      if (a1 - a0 < 0.5) {
        continue;
      }
      H.face('scWood', 'x', at, side, a0, a1, lv + 1.2, lv + 1.9);
      H.face('scWhite', 'x', at, side, a0 + 0.1, a0 + 0.5, lv + 1.35, lv + 1.75, 0.024);
      H.face('scPink', 'x', at, side, a0 + 0.6, a1 - 0.1, lv + 1.3, lv + 1.6, 0.024);
    }
  }
  /* Downstairs: the hand basins by the kitchen, a bench, the trophy case. */
  const lv = FLOOR0;
  H.block('scSteel', 17.4, HALL.y1 - 0.4, 18.85, HALL.y1, lv, lv + 0.8, 'basin');
  for (const x of [17.7, 18.2, 18.6]) {
    H.cap('scSteel', [x, HALL.y1 - 0.08, lv + 0.8], [x, HALL.y1 - 0.08, lv + 1.0], 0.02, { name: 'tap', seg: 6 });
  }
  H.face('scSteel', 'x', HALL.y1, -1, 17.4, 18.85, lv + 1.2, lv + 1.7);
  H.block('scWood', 24.0, HALL.y0, 25.5, HALL.y0 + 0.4, lv, lv + 0.45, 'bench');
  H.block('scWood', 31.15, HALL.y1 - 0.4, 32.5, HALL.y1, lv, lv + 1.6, 'trophy case');
  H.face('scSky', 'x', HALL.y1 - 0.4, -1, 31.25, 32.4, lv + 0.6, lv + 1.5);
  /* Upstairs: a bench, a water fountain at the east end. */
  H.block('scWood', 6.0, HALL.y0, 7.5, HALL.y0 + 0.4, F1, F1 + 0.45, 'bench');
  H.block('scSteel', 36.5, HALL.y1 - 0.45, 36.94, HALL.y1, F1, F1 + 0.85, 'fountain');
}

/* ------------------------------------------------------------------ */
/* The pads                                                            */
/* ------------------------------------------------------------------ */

/*
 * Where the clean pilots start, each a plan point, the storey and the way
 * the pad faces (radians, 0 east, counter clockwise from above), spread
 * over both floors and out of sight of the lab. The game takes them in this
 * order, so the first few are far apart: a round of four starts in four
 * corners of the school. A white square on the floor marks each.
 */
export const PADS = [
  { px: 33.0, py: 8.7, f: 0, yaw: Math.PI },
  { px: 7.35, py: 13.85, f: 1, yaw: 0 },
  { px: 19.5, py: 3.5, f: 1, yaw: Math.PI / 2 },
  { px: 8.5, py: 16.4, f: 0, yaw: 0 },
  { px: 34.0, py: 13.2, f: 0, yaw: Math.PI },
  { px: 35.5, py: 3.6, f: 1, yaw: Math.PI },
  { px: 6.0, py: 8.7, f: 0, yaw: 0 },
  { px: 24.6, py: 15.0, f: 0, yaw: Math.PI },
  { px: 20.0, py: 13.0, f: 1, yaw: 0 },
  { px: 32.5, py: 1.4, f: 0, yaw: Math.PI / 2 },
  { px: 33.0, py: 14.6, f: 1, yaw: Math.PI },
  { px: 4.4, py: 6.75, f: 1, yaw: 0 },
  { px: 29.0, py: 12.5, f: 0, yaw: -Math.PI / 2 },
  { px: 26.0, py: 8.7, f: 1, yaw: Math.PI },
  { px: 1.5, py: 8.7, f: 1, yaw: 0 },
  { px: 38.5, py: 8.7, f: 0, yaw: Math.PI },
];

/* The first infected's pad, in the tank, facing north to the hallway. */
export const TANK_PAD = { px: TANK.pad[0], py: TANK.pad[1], f: 0, yaw: Math.PI / 2, h: TANK.base };

function pads(H) {
  for (const p of PADS) {
    const lv = floorOf(p.f);
    H.floorPaint('scWhite', p.px - 0.17, p.py - 0.17, p.px + 0.17, p.py + 0.17, lv, 2);
    H.floorPaint('scDark', p.px - 0.12, p.py - 0.12, p.px + 0.12, p.py + 0.12, lv, 3);
  }
}

/* ------------------------------------------------------------------ */
/* The layout                                                          */
/* ------------------------------------------------------------------ */

export function schoolLayout() {
  const H = new School();
  shell(H);
  openingTrim(H);
  for (const o of OPENINGS.filter((q) => q.kind === 'vent')) {
    vent(H, o);
  }
  stairs(H, false);
  stairs(H, true);
  hallways(H);
  /* 1-A: vent A's mouth in its cubbies, a desk left out in front of it. */
  classroom(H, 3, 0, { cubbies: [[0, 3.74], [4.31, 6.75], [3.74, 4.31, FLOOR0 + 0.81, FLOOR0 + 1.0]] });
  lab(H);
  /* 1-B: the lab's door in its front wall, so its board stops short. */
  classroom(H, 21, 0, { platform: [1.0, 5.2], board: [1.0, 5.0], podium: 3.1 });
  shoes(H);
  lunch(H);
  kitchen(H);
  staff(H);
  nurse(H);
  store(H);
  /* 2-A: the library's door in its back wall. */
  classroom(H, 3, 1, { cubbies: [[0, 1.6], [3.5, 6.75]], notice: [3.3, 6.2] });
  library(H);
  /* 2-B: vent C's mouth in its cubbies. */
  classroom(H, 21, 1, { cubbies: [[0, 3.74], [4.31, 6.75], [3.74, 4.31, F1 + 0.81, F1 + 1.0]] });
  music(H);
  art(H);
  computer(H);
  club(H);
  pads(H);
  return { parts: H.P.list.slice(), prisms: [], discs: [], cones: [], scaled: [] };
}

/* ------------------------------------------------------------------ */
/* The signs, the title screen's line and the picture's lens            */
/* ------------------------------------------------------------------ */

/* The partners' signs, each the wall it hangs on: the hallway's four ends,
 * the ends of the stair landings, where every round passes. Konex Drone's,
 * the one hidden sign (the owner's promise of a logo hidden in every map),
 * small, inside the book lift's shaft on its back wall, where only a pilot
 * who flies up the lift sees it. */
export const SIGN_SPOTS = [
  { slug: 'gds', at: [0, 8.7, 2.25], n: [1, 0], w: 1.0 },
  { slug: 'mantisfpv', at: [LEN, 8.7, 2.25], n: [-1, 0], w: 1.0 },
  { slug: 'wcmrc', at: [0, 8.7, F1 + 2.25], n: [1, 0], w: 1.0 },
  { slug: 'webleedfpv', at: [LEN, 8.7, F1 + 2.25], n: [-1, 0], w: 1.0 },
  { slug: 'konexdrone', at: [LX, 0, 2.3], n: [0, 1], w: 0.5 },
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
 * backdrop circles the field clear of the tallest thing near it, which here
 * is the roof of a closed box. So the school hands over its own: a long
 * loop down the ground floor hallway and back, 60 cm clear of the pillars,
 * under the banners; and one lens for the board's picture and card, down
 * the hallway from its east end in the evening light.
 */
const LOOP = { x: 20, y: 8.7, rx: 15.6, ry: 0.42, h: 1.45, n: 64 };
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
export const CARD_LENS = { eye: worldAt(36.2, 8.0, 1.75), at: worldAt(14.0, 9.0, 1.1) };

/*
 * WHAT THE GAME NEEDS OF THE PLACE, for src/game/infected.js by way of the
 * map's `infectedGame` (./index.js): the rooms and the ways between them
 * for the bots' map, the pads, the tank, and the frame to turn plan points
 * into the world's. Plain data and pure functions, so the game and its
 * Node checks read the same school the map draws.
 */
export const SCHOOL_PLAN = {
  S, LEN, DEP, HALL, ROOMS, OPENINGS, PATHS, PADS, TANK, TANK_PAD, LIFT,
  worldAt, planAt, floorOf, ceilOf, roomAt,
  floors: [FLOOR0, F1], ceilings: [CEIL0, CEIL1], high: ROOF,
};
