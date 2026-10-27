/*
 * warehouse.js: Thomas More's warehouse, an exhibit builder's shop and
 * store, as the parts a built map holds. Pure data and arithmetic, no
 * Three.js, no JS trigonometry, so the solids can be built and checked in
 * plain Node.
 *
 * WHERE IT COMES FROM. The 89 stills Thomas More sent on 2026-10-27 (kept
 * in /mnt/project-files/tcmore-warehouse/): 70 phone photos of the floor
 * walked end to end, and 19 frames of a whoop flight through it. Nothing
 * else: no address, no map, no street view. The stills decide what it looks
 * like: one tall steel deck hall, cream block walls, grey concrete, a row of
 * cream columns, long white tube lights hung under the joists, and in it a
 * crate aisle between a black exhibit wall and stacks of wooden shipping
 * crates that runs to two white dock doors with a forklift in front of
 * them, a woodshop of saws and long benches with plywood stacked to the
 * east wall, pallet racking with a wall of navy bins, the cabinet makers'
 * white carcasses on trestles, a red floored corridor to a door, an office
 * at the front with a glass door, and a dusty spray booth in the far
 * corner. The stills do not give a plan, so the plan is a plausible one:
 * where each of these stands in relation to the others is this file's
 * choice, and the owner is told so.
 *
 * NO WORDS. The stills show brands, labels and a name sprayed on the booth.
 * None of it is drawn: a crate is a crate, a display is a coloured tower.
 * The only marks on this map are the partners' signs (./index.js).
 *
 * THE SCALE IS THE HOUSES'. Everything is three and a half times life size
 * (S, as in ../house/house.js), so a five inch flies it the way a whoop
 * flies the real shop. The plan below is in REAL metres and turned into the
 * world's by S once, in the helpers under it.
 *
 * THE PLAN'S FRAME. px runs east, py north, h up from the ground, real
 * metres, the origin the hall's south west corner inside on the slab. The
 * hall is 40 by 56 and 7 high. The front, with the glass door, is south; the
 * dock doors are in the north wall.
 *
 * WHAT IS SOLID. Walls, the roof, columns, joists, racking, crates, benches,
 * machines, the forklift and the lights, each as a box, drawn and solid from
 * the same numbers (../../props/parts.js). Paint is not solid. Every door
 * is a hole in its wall, and a door too small to fly is not a door.
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

/* The hall inside, real metres, and the plot round it: 8 m of apron to the
 * west and east, 6 to the south, 14 to the north where the trailer stands. */
export const LEN = 40;
export const DEP = 56;
export const HIGH = 7.0;
const MARGIN = { w: 8, e: 8, s: 6, n: 14 };
export const FIELD_W = (MARGIN.w + LEN + MARGIN.e) * S;
export const FIELD_D = (MARGIN.s + DEP + MARGIN.n) * S;
export const X0 = MARGIN.w * S;
export const Y0 = MARGIN.s * S;

/* The slab stands a step over the apron. */
export const FLOOR0 = 0.05;
/* The wall's thickness, outside the hall. */
const TW = 0.3;

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

/* Where the pilot starts: the front of the hall, in the open floor beside
 * the office, facing north up the crate aisle. */
export const SPAWN = { px: 14.4, py: 4.5, h: FLOOR0 };

/* ------------------------------------------------------------------ */
/* The doors, for the walls and for ./yard.js's gaps                    */
/* ------------------------------------------------------------------ */

/* Each a span along a wall at `y` (an east west wall) or `x` (a north south
 * one) and its sill and head, real metres. */
export const OPENINGS = {
  glassDoor: { x0: 4.0, x1: 6.6, y: -TW / 2, h0: FLOOR0, h1: 2.4 },
  driveIn: { x0: 20.0, x1: 24.0, y: -TW / 2, h0: FLOOR0, h1: 3.4 },
  officeDoor: { x0: 7.0, x1: 9.4, y: 10.0, h0: FLOOR0, h1: 2.2 },
  corridorDoor: { x0: 1.1, x1: 3.3, y: 10.0, h0: FLOOR0, h1: 2.2 },
  blackDoor: { y0: 22.0, y1: 24.4, x: 12.2, h0: FLOOR0, h1: 2.4 },
  dockOne: { x0: 8.0, x1: 11.2, y: DEP + TW / 2, h0: FLOOR0, h1: 3.6 },
  dockTwo: { x0: 14.0, x1: 17.2, y: DEP + TW / 2, h0: FLOOR0, h1: 3.6 },
  boothDoor: { y0: 48.0, y1: 50.8, x: 28.0, h0: FLOOR0, h1: 2.6 },
  corridorWindow: { y0: 22.0, y1: 24.4, x: 4.0, h0: FLOOR0, h1: 2.2 },
  corridorEnd: { y0: 34.0, y1: 36.4, x: 4.0, h0: FLOOR0, h1: 2.2 },
  digitalDoor: { x0: 1.0, x1: 2.4, y: 44.0, h0: FLOOR0, h1: 2.2 },
};

/* ------------------------------------------------------------------ */
/* The builder                                                         */
/* ------------------------------------------------------------------ */

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

  /* A solid that is not drawn. */
  hidden(px0, py0, h0, px1, py1, h1, name = 'hidden') {
    return this.box('whWall', px0, py0, h0, px1, py1, h1, { draw: false, name });
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

  /* A crate, a case or a carton standing on the slab or on `h0`. */
  crate(m, px0, py0, px1, py1, h0, h1, o = {}) {
    this.box(m, px0, py0, h0, px1, py1, h1, { name: o.name ?? 'crate' });
    /* Battens, paint a whisker proud: two up each north and south face, two
     * up the west face, the one the aisle sees, with a rail along its top. */
    const w = 0.06;
    for (const f of [0.15, 0.85]) {
      const x = px0 + (px1 - px0) * f;
      this.paint('whCrateDark', x - w, py0 - 0.012, h0, x + w, py0, h1);
      this.paint('whCrateDark', x - w, py1, h0, x + w, py1 + 0.012, h1);
      const y = py0 + (py1 - py0) * f;
      this.paint('whCrateDark', px0 - 0.012, y - w, h0, px0, y + w, h1);
    }
    this.paint('whCrateDark', px0 - 0.012, py0, h1 - 0.1, px0, py1, h1);
    /* The shipping label on the aisle face, white paper on wood and wood
     * coloured card on a white case. */
    if (o.label) {
      const y = (py0 + py1) / 2 + o.label;
      const z = h0 + (h1 - h0) * 0.55;
      this.paint(m === 'whWhite' ? 'whCrate' : 'whWhite', px0 - 0.014, y - 0.3, z - 0.17, px0 - 0.004, y + 0.3, z + 0.17);
    }
  }
}

/* ------------------------------------------------------------------ */
/* The shell                                                           */
/* ------------------------------------------------------------------ */

function shell(H) {
  const f = FLOOR0;
  /* The slab, and the apron round the hall over the ground. */
  H.box('whConcrete', 0, 0, 0, LEN, DEP, f, { name: 'slab', cast: false });
  H.paint('whAsphalt', -MARGIN.w, -MARGIN.s, 0, LEN + MARGIN.e, DEP + MARGIN.n, 0.02);
  /* The four walls, round the hall's outside so the inside is 40 by 56. */
  const top = HIGH + 0.25;
  H.wall('whWall', 'x', -TW / 2, -TW, LEN + TW, 0, top, TW, [
    [OPENINGS.glassDoor.x0, OPENINGS.glassDoor.x1, f, OPENINGS.glassDoor.h1],
    [OPENINGS.driveIn.x0, OPENINGS.driveIn.x1, f, OPENINGS.driveIn.h1],
  ], 'south wall');
  H.wall('whWall', 'x', DEP + TW / 2, -TW, LEN + TW, 0, top, TW, [
    [OPENINGS.dockOne.x0, OPENINGS.dockOne.x1, f, OPENINGS.dockOne.h1],
    [OPENINGS.dockTwo.x0, OPENINGS.dockTwo.x1, f, OPENINGS.dockTwo.h1],
  ], 'north wall');
  H.wall('whWall', 'y', -TW / 2, 0, DEP, 0, top, TW, [], 'west wall');
  H.wall('whWall', 'y', LEN + TW / 2, 0, DEP, 0, top, TW, [], 'east wall');
  /* The roof deck over everything, dark under, the joists below it. */
  H.box('whDeck', -TW, -TW, HIGH, LEN + TW, DEP + TW, top, { name: 'roof' });
  for (const y of [7, 14, 21, 28, 35, 42, 49]) {
    H.box('whSteel', 0, y - 0.15, HIGH - 0.8, LEN, y + 0.15, HIGH, { name: 'joist' });
  }
  /* The row of cream columns down the hall, and a second beside the east
   * wall's stacks. */
  for (const x of [24, 34]) {
    for (const y of [9.8, 19, 29, 39, 49]) {
      H.box('whColumn', x - 0.22, y - 0.22, f, x + 0.22, y + 0.22, HIGH - 0.8, { name: 'column' });
      /* The yellow guard round its foot, a forklift's knock taken. */
      H.box('whYellow', x - 0.3, y - 0.3, f, x + 0.3, y + 0.3, f + 0.9, { name: 'column guard' });
    }
  }
  /* The ventilation duct the length of the hall over the crates, between
   * two rows of lights, and the heaters hung off the joists. */
  H.box('whSteel', 17.6, 2.0, 5.9, 18.4, 54.0, 6.4, { name: 'duct' });
  for (const [x, y] of [[10, 21], [30, 21], [10, 42], [30, 42]]) {
    H.box('whRackOrange', x - 0.5, y - 0.4, 5.3, x + 0.5, y + 0.4, 6.0, { name: 'heater' });
    H.box('whSteel', x - 0.05, y - 0.05, 6.0, x + 0.05, y + 0.05, HIGH - 0.8, { name: 'hanger' });
  }
  /* The stripe round the inside at a hand over head, as on the shop's
   * walls, red here because it is one colour fewer. */
  H.paint('whRed', LEN - 0.01, 0, 2.2, LEN, DEP, 2.45);
  H.paint('whRed', 11.2, DEP - 0.01, 2.2, 28.0, DEP, 2.45);
  /* Outside: a dark plinth and the stripe round the hall, and a canopy
   * over the dock doors. */
  for (const [x0, y0, x1, y1] of [[-TW - 0.01, -TW, -TW, DEP + TW], [LEN + TW, -TW, LEN + TW + 0.01, DEP + TW]]) {
    H.paint('whSteel', x0, y0, 0, x1, y1, 1.2);
    H.paint('whRed', x0, y0, 5.0, x1, y1, 5.4);
  }
  for (const [y0, y1] of [[-TW - 0.01, -TW], [DEP + TW, DEP + TW + 0.01]]) {
    H.paint('whSteel', -TW, y0, 0, LEN + TW, y1, 1.2);
    H.paint('whRed', -TW, y0, 5.0, LEN + TW, y1, 5.4);
  }
  H.box('whSteel', 6.5, DEP + TW, 4.4, 19.0, DEP + 2.2, 4.6, { name: 'canopy' });
  /* Tube lights hung in rows under the joists, long white boxes. */
  for (const x of [6, 14, 22, 30, 38]) {
    for (const y of [3.5, 10.5, 17.5, 24.5, 31.5, 38.5, 45.5, 52.5]) {
      H.box('whLamp', x - 0.15, y - 1.2, 5.55, x + 0.15, y + 1.2, 5.7, { name: 'light' });
    }
  }
  /* Dock doors, both raised: the panels stacked over the opening, and a
   * door's track down each side. */
  for (const d of [OPENINGS.dockOne, OPENINGS.dockTwo]) {
    H.box('whWhite', d.x0, DEP, d.h1, d.x1, DEP + 0.25, d.h1 + 0.5, { name: 'door panels' });
  }
  /* The drive in door, raised the same. */
  H.box('whWhite', OPENINGS.driveIn.x0, -0.25, OPENINGS.driveIn.h1, OPENINGS.driveIn.x1, 0, OPENINGS.driveIn.h1 + 0.5, { name: 'door panels' });
  /* The glass door's frame: a head and a mullion, the glass flown through. */
  H.paint('whSteel', 4.0, -0.35, 2.3, 6.6, 0, 2.4);
  H.paint('whSteel', 5.25, -0.35, f, 5.35, 0, 2.3);
}

/* ------------------------------------------------------------------ */
/* The front: office and the red corridor                              */
/* ------------------------------------------------------------------ */

function front(H) {
  const f = FLOOR0;
  const o = OPENINGS;
  /* The office: x 0..11, y 0..10, walls to 3.4 and no ceiling, so a pilot
   * can go over as well as through. */
  H.wall('whWall', 'y', 11.0, 0, 10, 0, 3.4, 0.15, [], 'office east');
  H.wall('whWall', 'x', 10.0, 0, 11.0, 0, 3.4, 0.15, [
    [o.officeDoor.x0, o.officeDoor.x1, f, o.officeDoor.h1],
    [o.corridorDoor.x0, o.corridorDoor.x1, f, o.corridorDoor.h1],
  ], 'office north');
  /* Grey carpet on the office floor, a counter, a desk, a cabinet and a pinboard. */
  H.paint('whDeck', 0.1, 0.1, f, 10.9, 9.9, f + 0.01);
  H.box('whWhite', 7.6, 1.2, f, 10.925, 2.0, f + 1.1, { name: 'counter' });
  H.table('whWhite', 1.0, 6.5, 3.4, 8.0, 0.75, { name: 'desk', topM: 'whCrate' });
  H.box('whColumn', 9.9, 7.2, f, 10.925, 8.1, f + 1.5, { name: 'cabinet' });
  H.box('whBin', 0.0, 2.0, f + 0.9, 0.3, 4.4, f + 1.9, { name: 'pinboard' });
  /* The yellow ladder leant on the corridor wall. */
  H.box('whYellow', 5.0, 9.7, f, 5.9, 9.88, f + 2.4, { name: 'ladder' });
  /* The red corridor, x 0..4, from the office to the door at its north
   * end, with two doors on its east side into the hall. */
  H.wall('whWall', 'y', 4.0, 10.0, 44.0, 0, 3.6, 0.15, [
    [o.corridorWindow.y0, o.corridorWindow.y1, f, o.corridorWindow.h1],
    [o.corridorEnd.y0, o.corridorEnd.y1, f, o.corridorEnd.h1],
  ], 'corridor east');
  H.wall('whWall', 'x', 44.0, 0, 4.0, 0, 3.6, 0.15, [
    [o.digitalDoor.x0, o.digitalDoor.x1, f, o.digitalDoor.h1],
  ], 'corridor north');
  H.paint('whRed', 0.1, 10.2, f, 3.9, 43.9, f + 0.01);
  /* Black panels leant along its west wall, kettle bells on the floor, a
   * rack of clamps, a mitre saw on its stand. */
  for (let y = 12; y < 40; y += 6.2) {
    H.box('whBlack', 0.0, y, f, 0.3, y + 5.4, f + 2.1, { name: 'panel' });
  }
  for (let y = 13; y < 30; y += 3.1) {
    H.box('whBlack', 0.7, y, f, 1.0, y + 0.3, f + 0.3, { name: 'weight' });
  }
  H.table('whSteel', 2.6, 37.0, 3.9, 40.0, 0.9, { name: 'mitre saw', topM: 'whYellow' });
}

/* ------------------------------------------------------------------ */
/* The crate aisle                                                     */
/* ------------------------------------------------------------------ */

/* Crates stacked two and three high along the aisle's east side, the
 * exhibit wall on its west. */
function crateAisle(H) {
  const f = FLOOR0;
  const o = OPENINGS;
  /* The black exhibit wall, 4.6 high, with its door, and the warm strip
   * along its foot. */
  H.wall('whBlack', 'y', 12.2, 10.0, 34.0, 0, 4.6, 0.4, [
    [o.blackDoor.y0, o.blackDoor.y1, f, o.blackDoor.h1],
  ], 'exhibit wall');
  H.paint('whYellow', 12.4, 10.0, f, 12.6, 34.0, f + 0.14);
  /* A cart in the aisle with a bin on it, a ladder against the wall. */
  H.table('whSteel', 13.0, 26.8, 14.4, 28.2, 0.85, { name: 'cart', topM: 'whCrateDark' });
  H.box('whWhite', 13.3, 27.1, f + 0.85, 14.1, 27.9, f + 1.3, { name: 'bin' });
  H.box('whYellow', 12.4, 14.0, f, 12.55, 14.7, f + 3.2, { name: 'ladder' });
  const r = seededRandom(7001);
  /* Stack after stack, 2.2 to 3 m wide, in two columns of crates 2.3 deep
   * and with a 1.6 m passage between stacks every so often. */
  let y = 12;
  let n = 0;
  while (y < 44.4) {
    const len = Math.min(r.range(2.2, 3.2), 46 - y);
    for (const [x0, x1] of [[16.6, 18.9], [18.9, 21.2]]) {
      const tiers = r.pick([1, 2, 2, 3, 3]);
      let h = f + 0.15;
      H.box('whCrateDark', x0 + 0.1, y + 0.1, f, x1 - 0.1, y + len - 0.1, h, { name: 'pallet' });
      for (let k = 0; k < tiers; k += 1) {
        const t = r.range(1.15, 1.5);
        const m = (n + k) % 2 ? 'whCrate' : 'whWhite';
        H.crate(m, x0, y, x1, y + len, h, h + t, { label: x0 < 17 && r.chance(0.7) ? r.range(-0.4, 0.4) : 0 });
        h += t;
      }
      n += 1;
    }
    y += len + (n % 4 === 0 ? 1.7 : 0);
  }
  /* A box of loose sheet and a pallet of board in the aisle's end. */
  H.box('whCrate', 13.9, 44.0, f, 16.0, 45.5, f + 0.9, { name: 'cartons' });
}

/* ------------------------------------------------------------------ */
/* The dock                                                            */
/* ------------------------------------------------------------------ */

function dock(H) {
  const f = FLOOR0;
  /* The forklift, orange, parked off the first door: a body, a cab's four
   * posts and roof, a mast and two forks, nose to the door. */
  const fx = 11.8;
  const fy = 42.0;
  H.box('whOrange', fx, fy, f, fx + 1.2, fy + 2.4, f + 1.0, { name: 'forklift' });
  H.box('whOrange', fx + 0.1, fy, f + 1.0, fx + 1.1, fy + 0.9, f + 1.4, { name: 'forklift seat' });
  for (const [x, y] of [[fx + 0.05, fy + 0.15], [fx + 1.1, fy + 0.15], [fx + 0.05, fy + 1.45], [fx + 1.1, fy + 1.45]]) {
    H.box('whSteel', x, y, f + 1.0, x + 0.07, y + 0.07, f + 2.1, { name: 'cab post' });
  }
  H.box('whOrange', fx, fy + 0.05, f + 2.1, fx + 1.2, fy + 1.55, f + 2.18, { name: 'cab roof' });
  H.box('whSteel', fx + 0.15, fy + 2.4, f, fx + 0.25, fy + 2.5, f + 2.9, { name: 'mast' });
  H.box('whSteel', fx + 0.95, fy + 2.4, f, fx + 1.05, fy + 2.5, f + 2.9, { name: 'mast' });
  H.box('whSteel', fx + 0.15, fy + 2.42, f, fx + 0.25, fy + 3.7, f + 0.1, { name: 'fork' });
  H.box('whSteel', fx + 0.95, fy + 2.42, f, fx + 1.05, fy + 3.7, f + 0.1, { name: 'fork' });
  /* Carpet rolls in a pyramid on a pallet, strapped, in front of the second
   * door's left, and a pallet of boards beside. */
  H.box('whCrateDark', 18.0, 47.6, f, 21.0, 50.6, f + 0.15, { name: 'pallet' });
  H.box('whDeck', 18.1, 47.7, f + 0.15, 20.9, 49.1, f + 1.0, { name: 'roll' });
  H.box('whDeck', 18.1, 49.1, f + 0.15, 20.9, 50.5, f + 1.0, { name: 'roll' });
  H.box('whDeck', 18.5, 48.4, f + 1.0, 20.5, 49.8, f + 1.8, { name: 'roll' });
  H.box('whCrateDark', 24.0, 50.0, f, 27.0, 55.0, f + 0.15, { name: 'pallet' });
  H.box('whBoard', 24.1, 50.1, f + 0.15, 26.9, 54.9, f + 1.6, { name: 'boards' });
  /* Yellow tape on the slab: the dock's lanes and the aisle's edge. */
  H.paint('whYellow', 7.6, 46.0, f, 7.7, DEP, f + 0.008);
  H.paint('whYellow', 17.6, 46.0, f, 17.7, DEP, f + 0.008);
  H.paint('whYellow', 7.6, 46.0, f, 17.7, 46.1, f + 0.008);
  /* A stack of empty pallets by the first door. */
  H.box('whCrateDark', 4.2, 50.0, f, 6.6, 51.2, f + 1.35, { name: 'pallets' });
  for (let h = 0.15; h < 1.35; h += 0.15) {
    H.paint('whDeck', 4.188, 50.0, f + h - 0.03, 4.2, 51.2, f + h);
  }
  /* The trailer backed to the second door: a bed at 1.2, walls to 3.9, its
   * rear open to the door and its front closed, a tunnel to fly. */
  const x0 = 14.2;
  const x1 = 17.0;
  const y0 = DEP + 0.4;
  const y1 = DEP + 12.4;
  H.box('whWhite', x0 - 0.1, y0, 1.1, x1 + 0.1, y1, 1.25, { name: 'trailer bed' });
  H.box('whWhite', x0 - 0.1, y0, 3.8, x1 + 0.1, y1, 3.95, { name: 'trailer roof' });
  H.box('whWhite', x0 - 0.1, y0, 1.25, x0, y1, 3.8, { name: 'trailer side' });
  H.box('whWhite', x1, y0, 1.25, x1 + 0.1, y1, 3.8, { name: 'trailer side' });
  H.box('whWhite', x0, y1 - 0.1, 1.25, x1, y1, 3.8, { name: 'trailer front' });
  H.box('whSteel', x0 + 0.2, y0 + 1.0, 0.1, x1 - 0.2, y0 + 1.4, 1.1, { name: 'trailer axles' });
  H.box('whBlack', x0 - 0.15, y0 + 8.2, 0.05, x0 + 0.3, y0 + 10.2, 1.1, { name: 'trailer wheels' });
  H.box('whBlack', x1 - 0.3, y0 + 8.2, 0.05, x1 + 0.15, y0 + 10.2, 1.1, { name: 'trailer wheels' });
}

/* ------------------------------------------------------------------ */
/* The woodshop                                                        */
/* ------------------------------------------------------------------ */

function woodshop(H) {
  const f = FLOOR0;
  const r = seededRandom(7002);
  /* Plywood and board stacked against the east wall in bays, each stack a
   * different height, with a passage between them. */
  for (const [y0, y1, h] of [[14, 19.2, 4.2], [20.8, 26.0, 3.0], [27.6, 32.6, 4.6], [34.2, 39.0, 2.6]]) {
    const w = 4.0;
    H.box('whBoard', LEN - w, y0, f, LEN - 0.05, y1, f + h, { name: 'plywood stack' });
    let at = f + 0.5;
    while (at < f + h - 0.2) {
      H.paint('whCrateDark', LEN - w - 0.012, y0, at, LEN - w, y1, at + 0.06);
      at += r.range(0.35, 0.6);
    }
  }
  /* Long benches and the saws, in two rows down the shop. */
  const benches = [[25.5, 15.5, 29.5, 17.0], [31.0, 16.0, 34.0, 17.2], [25.8, 22.0, 30.5, 23.4], [26.0, 30.0, 31.5, 31.4]];
  for (const [x0, y0, x1, y1] of benches) {
    H.table('whSteel', x0, y0, x1, y1, 0.92, { topM: 'whWhite', top: 0.12, name: 'bench' });
  }
  /* Table saws: a big grey body with a fence and a dust hood. */
  for (const [x, y] of [[26.0, 36.0], [31.0, 36.5], [28.5, 19.4]]) {
    H.box('whSteel', x, y, f, x + 1.6, y + 1.2, f + 0.95, { name: 'saw' });
    H.box('whYellow', x + 0.1, y + 0.1, f + 0.95, x + 1.5, y + 0.3, f + 1.15, { name: 'saw fence' });
    H.box('whSteel', x + 1.3, y + 0.3, f + 0.95, x + 1.5, y + 0.5, f + 2.1, { name: 'dust hood' });
  }
  /* A pallet of cut boards, the two display towers, and a few panels
   * leant on the benches' ends. */
  H.box('whCrateDark', 22.4, 25.5, f, 24.6, 27.5, f + 0.15, { name: 'pallet' });
  H.box('whBoard', 22.5, 25.6, f + 0.15, 24.5, 27.4, f + 1.0, { name: 'boards' });
  for (const [x, y] of [[22.4, 12.5], [22.4, 33.5]]) {
    H.box('whOrange', x, y, f, x + 1.0, y + 1.0, f + 2.4, { name: 'display' });
    H.box('whYellow', x + 0.05, y + 0.05, f + 1.2, x + 0.95, y + 0.95, f + 1.5, { name: 'display band' });
  }
  for (const [x, y] of [[29.8, 15.6], [34.2, 15.9], [30.8, 21.8]]) {
    H.box('whBoard', x, y, f, x + 0.12, y + 1.6, f + 2.4, { name: 'panel' });
  }
}

/* ------------------------------------------------------------------ */
/* The racking: parts, bins and the cabinet carcasses                   */
/* ------------------------------------------------------------------ */

function rackRow(H, x0, x1, y0, y1, upright, beam, o = {}) {
  const f = FLOOR0;
  const r = seededRandom(o.seed ?? 7003);
  const levels = [0.35, 1.85, 3.35, 4.85];
  const bay = (x1 - x0) / Math.round((x1 - x0) / 2.7);
  for (let x = x0; x < x1 + 0.01; x += bay) {
    for (const y of [y0, y1 - 0.1]) {
      H.box(upright, x - 0.05, y, f, x + 0.05, y + 0.1, f + 5.2, { name: 'upright' });
    }
  }
  for (const h of levels) {
    for (const y of [y0, y1 - 0.1]) {
      H.box(beam, x0, y, f + h, x1, y + 0.1, f + h + 0.12, { name: 'beam' });
    }
  }
  /* Cartons on some of the shelves, back to the wall on a row that stands
   * against one (`flush`). */
  for (const h of levels) {
    for (let x = x0 + 0.15; x < x1 - 1.4; x += bay) {
      if (!(o.empty && x > o.empty[0] && x < o.empty[1]) && r.chance(o.fill ?? 0.55)) {
        const w = r.range(0.8, 1.9);
        const ht = r.range(0.4, 1.0);
        H.box(r.pick(['whCrate', 'whCrate', 'whWhite']), x + 0.1, o.flush ? 0 : y0 + 0.15, f + h + 0.12, x + 0.1 + w, y1 - 0.25, f + h + 0.12 + ht, { name: 'carton' });
      }
    }
  }
}

function racking(H) {
  const f = FLOOR0;
  /* South east: two rows of blue and orange racking, the hall's parts
   * store, with an aisle between. The north row has the wall of navy
   * bins, behind its beams. */
  rackRow(H, 24.0, 38.4, 2.0, 3.1, 'whRackBlue', 'whRackOrange', { seed: 7004, empty: [26.5, 30.5] });
  rackRow(H, 24.0, 38.4, 7.4, 8.5, 'whRackBlue', 'whRackOrange', { seed: 7005, fill: 0.3, empty: [26.5, 30.5] });
  /* The bins: rows of navy trays on the north row's rear, and a hole's
   * width left between every second bay. */
  for (let x = 24.2; x < 38.0; x += 2.7) {
    if (x > 26.0 && x < 30.5) {
      continue;
    }
    for (const h of [0.5, 1.4, 2.3]) {
      H.box('whBin', x, 8.0, f + h, x + 2.3, 8.35, f + h + 0.9, { name: 'bins' });
    }
  }
  /* Low shelving along the front wall east of the office, the stuff of a
   * shop: the same racking, two levels and full. */
  rackRow(H, 11.6, 19.4, 0.05, 0.95, 'whRackOrange', 'whRackBlue', { seed: 7007, fill: 0.8, flush: true });
  /* A pallet jack in the aisle. */
  H.box('whRackOrange', 30.0, 5.2, f, 31.2, 5.45, f + 0.2, { name: 'jack' });
  /* The red carpet rolls' racking down the west side, orange uprights with
   * dark rolls on the top beams, a red ladder against it. */
  rackRow(H, 5.0, 9.8, 12.8, 13.9, 'whRackOrange', 'whRackBlue', { seed: 7006, fill: 0.2 });
  for (const y of [12.6, 16.9, 21.2]) {
    H.box('whDeck', 5.1, y, f + 3.5, 9.7, y + 1.0, f + 4.3, { name: 'roll' });
  }
  H.box('whRackOrange', 4.9, 16.0, f, 5.0, 16.1, f + 3.4, { name: 'upright' });
  H.box('whRackOrange', 10.0, 16.0, f, 10.1, 16.1, f + 3.4, { name: 'upright' });
  H.box('whRackOrange', 4.9, 22.0, f, 5.0, 22.1, f + 3.4, { name: 'upright' });
  H.box('whRackOrange', 10.0, 22.0, f, 10.1, 22.1, f + 3.4, { name: 'upright' });
  H.box('whRackOrange', 5.0, 16.0, f + 3.4, 10.1, 16.1, f + 3.5, { name: 'beam' });
  H.box('whRackOrange', 5.0, 22.0, f + 3.4, 10.1, 22.1, f + 3.5, { name: 'beam' });
  H.box('whRed', 10.6, 26.0, f, 10.9, 26.3, f + 2.9, { name: 'ladder' });
  /* The cabinet makers' carcasses on trestles: long white boxes with the
   * three hollows the stills show, open on top. */
  for (const [x0, y0] of [[24.0, 39.9], [24.0, 42.0]]) {
    const x1 = x0 + 4.6;
    const y1 = y0 + 1.3;
    const h = 0.9;
    H.box('whWhite', x0, y0, f + h - 0.15, x1, y1, f + h, { name: 'carcass base' });
    H.box('whWhite', x0, y0, f + h, x1, y0 + 0.08, f + h + 0.7, { name: 'carcass' });
    H.box('whWhite', x0, y1 - 0.08, f + h, x1, y1, f + h + 0.7, { name: 'carcass' });
    for (const x of [x0, x0 + 1.5, x0 + 3.0, x1 - 0.08]) {
      H.box('whWhite', x, y0, f + h, x + 0.08, y1, f + h + 0.7, { name: 'carcass' });
    }
    for (const x of [x0 + 0.3, x1 - 0.5]) {
      H.box('whSteel', x, y0 + 0.1, f, x + 0.1, y1 - 0.1, f + h - 0.15, { name: 'trestle' });
    }
  }
}

/* ------------------------------------------------------------------ */
/* The spray booth                                                     */
/* ------------------------------------------------------------------ */

function booth(H) {
  const f = FLOOR0;
  const o = OPENINGS;
  /* The booth room in the north east corner: x 28..40, y 44..56, its west
   * and south walls 4.5 high with a door in the west. */
  H.wall('whWall', 'y', 28.0, 44.0, DEP, 0, 4.5, 0.15, [
    [o.boothDoor.y0, o.boothDoor.y1, f, o.boothDoor.h1],
  ], 'booth west');
  H.wall('whWall', 'x', 44.0, 28.0, LEN, 0, 4.5, 0.15, [
    [34.0, 36.6, f, 2.6],
  ], 'booth south');
  /* The hood across the back, white, standing over a dark filter wall, its
   * side walls grey with spray. */
  H.box('whWhite', 31.0, 53.6, 2.6, 38.2, DEP, 4.2, { name: 'hood' });
  H.box('whSteel', 31.0, 55.5, f, 38.2, DEP, 2.6, { name: 'filter wall' });
  H.box('whSteel', 30.8, 53.6, f, 31.0, DEP, 2.6, { name: 'booth side' });
  H.box('whSteel', 38.2, 53.6, f, 38.4, DEP, 2.6, { name: 'booth side' });
  /* Drying racks, shelves of board on a frame, and sawhorses. */
  for (const [x, y] of [[29.0, 46.0], [29.0, 51.8]]) {
    for (const h of [0.4, 0.95, 1.5, 2.05]) {
      H.box('whBoard', x, y, f + h, x + 1.2, y + 2.2, f + h + 0.06, { name: 'rack shelf' });
    }
    for (const [dx, dy] of [[0, 0], [1.1, 0], [0, 2.1], [1.1, 2.1]]) {
      H.box('whSteel', x + dx, y + dy, f, x + dx + 0.1, y + dy + 0.1, f + 2.2, { name: 'rack post' });
    }
  }
  for (const [x, y] of [[33.0, 51.0], [35.2, 51.0]]) {
    H.table('whSteel', x, y, x + 1.1, y + 0.4, 0.7, { name: 'sawhorse', top: 0.08 });
  }
  /* Paint drums and a bench, and the low lights over it all. */
  for (const [x, y] of [[36.8, 47.0], [37.4, 47.4], [36.9, 48.0], [39.0, 53.0]]) {
    H.box('whWhite', x, y, f, x + 0.4, y + 0.4, f + 0.45, { name: 'drum' });
  }
  H.table('whSteel', 36.5, 49.6, 39.6, 50.8, 0.9, { topM: 'whBoard', name: 'bench' });
  for (const [x, y] of [[31.0, 49.0], [35.0, 49.0], [33.0, 53.0], [37.0, 53.0]]) {
    H.box('whLamp', x - 1.0, y - 0.15, 3.1, x + 1.0, y + 0.15, 3.25, { name: 'light' });
  }
  /* The duct over the booth, a grey box up to the roof. */
  H.box('whSteel', 34.0, 54.0, 4.2, 37.0, 55.6, HIGH, { name: 'duct' });
}

/* ------------------------------------------------------------------ */
/* The clutter                                                         */
/* ------------------------------------------------------------------ */

/* What fills a working shop between the big things, each placed by hand so
 * the gap rule holds: a pallet of board, a cart, a bench with its load. */
function clutter(H) {
  const f = FLOOR0;
  const pallet = (x0, y0, x1, y1, h, m = 'whBoard') => {
    H.box('whCrateDark', x0, y0, f, x1, y1, f + 0.15, { name: 'pallet' });
    H.box(m, x0 + 0.05, y0 + 0.05, f + 0.15, x1 - 0.05, y1 - 0.05, f + h, { name: 'load' });
  };
  /* The woodshop: a fourth saw, a bench stacked with board, a cart of
   * offcuts, board on pallets, the dust collector and its pipe up. */
  H.box('whSteel', 32.5, 24.0, f, 34.1, 25.2, f + 0.95, { name: 'saw' });
  H.box('whYellow', 32.6, 24.1, f + 0.95, 34.0, 24.3, f + 1.15, { name: 'saw fence' });
  H.table('whSteel', 31.5, 30.0, 34.5, 31.4, 0.92, { topM: 'whWhite', top: 0.12, name: 'bench' });
  H.box('whBoard', 31.7, 30.1, f + 0.92, 33.9, 31.3, f + 1.12, { name: 'board on the bench' });
  H.table('whSteel', 22.6, 18.0, 23.8, 20.4, 0.8, { topM: 'whCrateDark', name: 'cart' });
  H.box('whCrate', 22.7, 18.2, f + 0.8, 23.7, 20.2, f + 1.6, { name: 'offcuts' });
  pallet(29.0, 38.6, 32.0, 40.4, 1.1);
  pallet(36.5, 40.6, 38.6, 42.6, 0.7, 'whCrate');
  H.box('whWhite', 34.9, 12.4, f, 35.7, 13.2, f + 2.6, { name: 'dust collector' });
  H.box('whSteel', 35.1, 12.6, f + 2.6, 35.5, 13.0, 5.4, { name: 'dust pipe' });
  /* Between the red corridor and the black wall, past the carpet racks: a
   * bench, a steel shelf of cartons, two crates. */
  H.table('whSteel', 5.0, 28.0, 8.0, 29.2, 0.92, { topM: 'whCrate', name: 'bench' });
  H.box('whSteel', 5.3, 28.2, f + 0.92, 6.0, 28.7, f + 1.2, { name: 'vice' });
  rackRow(H, 5.0, 10.4, 36.0, 37.0, 'whSteel', 'whSteel', { seed: 7008, fill: 0.7 });
  H.crate('whCrate', 5.0, 40.0, 7.4, 42.2, f, f + 1.3, { label: 0.2 });
  H.crate('whWhite', 5.0, 40.0, 7.4, 42.2, f + 1.3, f + 2.5);
  /* The dock end, west of the doors: board on pallets waiting to go. */
  pallet(4.2, 47.0, 6.6, 49.0, 0.9);
}

/* ------------------------------------------------------------------ */
/* The layout                                                          */
/* ------------------------------------------------------------------ */

export function warehouseLayout() {
  const H = new Hall();
  shell(H);
  front(H);
  crateAisle(H);
  dock(H);
  woodshop(H);
  racking(H);
  booth(H);
  clutter(H);
  return { parts: H.P.list.slice(), prisms: [], discs: [], cones: [], scaled: [] };
}

/* The partners' signs, each the wall it hangs on: a point on the face in
 * plan terms, the way the face looks, and how wide it is hung in real
 * metres (./index.js turns them into the built map's `markSpots`). */
export const SIGN_SPOTS = [
  { slug: 'gds', at: [LEN, 6.0, 3.2], n: [-1, 0], w: 1.3 },
  { slug: 'mantisfpv', at: [LEN, 44.0, 3.4], n: [-1, 0], w: 1.3 },
  { slug: 'wcmrc', at: [28.0, 0.0, 3.8], n: [0, 1], w: 1.3 },
  { slug: 'webleedfpv', at: [22.0, DEP, 3.6], n: [0, -1], w: 1.3 },
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
 * the tallest thing is the roof, so the title screen showed the roof and
 * nothing else; the board's picture, taken from outside, was a grey box. So
 * the hall hands over its own: a loop under the lights, over the crate tops
 * and round the woodshop, which passes no part closer than 2.2 m, measured
 * against this layout on 27 October 2026; and one lens for the board's
 * picture and card, up in the dock corner looking across the forklift and
 * the crates to the woodshop (src/share/orbit.js, placeCardCamera).
 */
const LOOP = { x: 22, y: 27, rx: 8, ry: 11, h: 4.9, n: 48 };
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
export const CARD_LENS = { eye: worldAt(1.5, 54.5, 5.4), at: worldAt(20, 25, 0.5) };
