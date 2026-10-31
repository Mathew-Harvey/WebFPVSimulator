/*
 * wards.js: the sanatorium itself. Two ward wings either side of the
 * administration block and its clock tower, the chapel at the west end
 * on its covered walkway, the boiler house and its stack, and the water
 * tower behind. Pure, in Sunnyfield's plan frame (../sunny/frame.js): px
 * east, py north, h up, metres, life size.
 *
 * WHAT IT IS. A sanatorium of the 1930s, built on a terrace cut into a
 * hillside above a town, where the air was the treatment: every ward on
 * the south side of a single loaded corridor, every ward opening onto a
 * deep veranda the patients' beds were wheeled out to, three storeys of it
 * to a flat roof that was a sun deck too. Reinforced concrete under white
 * plaster, a copper roofed tower over the entrance, and a small chapel
 * the patients walked to under a roof. It closed when the drugs came, the
 * town left it to the weather, and it is a haikyo now: the glass mostly
 * out, the beds still in the wards, the roof fallen in over two of them,
 * ivy up the ends.
 *
 * THE MEASURES, and where they come from (the report in PROGRESS.md says
 * the same). A ward wing is 80 m, inside the 60 to 120 m a pavilion wing
 * of the period ran to. Floor to floor is 3.8 m. The corridor is 2.4 m
 * clear: between the 1.8 m Japan's hospital rules ask of a single loaded
 * corridor and the 2.7 m they ask of a double loaded one (Ministry of
 * Health, Labour and Welfare, s0128-7p), and wide enough to fly. The
 * veranda is 2.6 m clear behind its columns, a bed's length and a nurse.
 *
 * THE LINES, which are why every one of those numbers is what it is:
 *
 *   1. THE LONG CORRIDOR. The ground floor corridor runs the length of both
 *      wings and through the entrance hall between them, open at both
 *      ends: 180 m, straight. Out of its west end it runs on under the
 *      covered walkway and through the chapel's two side doors, so the
 *      whole line is 230 m from the east end to the chapel's west wall.
 *   2. THE VERANDA. The ground floor veranda is open at both ends and
 *      through the hall too, a second line beside the first, outside.
 *   3. WINDOW TO WINDOW. Every ward's door is opposite its south window
 *      and its corridor window, so each ward is a line across the wing:
 *      in at a north window, across the corridor, through the door, the
 *      ward, the south window and out between the veranda's columns.
 *   4. THE ROOF HOLES. The roof has fallen in over ward 4 of the east wing,
 *      and the floors under it went too: a shaft from the sun deck to the
 *      ground floor, a dive with three ways out at the bottom. Over ward
 *      10 of the east wing and ward 8 of the west only the roof is gone,
 *      into the top floor's ward. The chapel's roof is open on its east
 *      side over the nave.
 *   5. THE TOWER. The belvedere at the top of the clock tower is open on
 *      all four sides, and the chapel's bell gable has lost its bell.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { rng } from '../sunny/frame.js';
import { wall, frame, pane, roofDrawn, roofSolid, gable, steps } from './walls.js';

/* The terrace the sanatorium stands on, and its top. */
export const TERRACE = { x0: 70, x1: 330, y0: 120, y1: 215, h: 5 };
export const TH = TERRACE.h;

/* Floor to floor, and the slab. */
export const FL = 3.8;
const SLAB = 0.3;

/*
 * A WING'S SECTION, south to north, in py: the veranda's columns, the
 * veranda, the wards' south wall, the wards, the corridor wall, the
 * corridor, the north wall.
 */
export const SEC = {
  col0: 150, col1: 150.4,
  s0: 153, s1: 153.3,
  c0: 158.2, c1: 158.4,
  n0: 160.8, n1: 161.1,
};
/* The wings, each 80 m, and the ward bay: 13 wards of 6 m and an end. */
export const WINGS = [
  { id: 'west', x0: 110, x1: 190, end: 'w', label: 'ward1' },
  { id: 'east', x0: 210, x1: 290, end: 'e', label: 'ward2' },
];
const BAY = 6;
const BAYS = 13;
const END = 1;
/* The ward's windows and door, across its bay's middle. */
const SOUTH_W = 2.2;
const DOOR_W = 2.0;
const NORTH_W = 2.0;
export const OPEN = {
  south: { s: 0.8, e: 3.0 },
  door: { s: 0, e: 2.6 },
  north: { s: 0.9, e: 2.9 },
};

/* The bay k's span in px on a wing. */
export function bayOf(wing, k) {
  const a0 = wing.x0 + (wing.end === 'w' ? END : 0) + BAY * k;
  return { a0, a1: a0 + BAY, mid: a0 + BAY / 2 };
}

/*
 * THE HOLES. `roof` gone over that bay; `floors` the storeys whose floor
 * went with it (1 is the first floor's slab, 2 the second's). The hole is
 * 3.6 m square in the ward's middle.
 */
export const HOLES = [
  { wing: 'east', bay: 3, roof: true, floors: [1, 2] },
  { wing: 'east', bay: 9, roof: true, floors: [] },
  { wing: 'west', bay: 7, roof: true, floors: [] },
  { wing: 'west', bay: 10, roof: false, floors: [1] },
];
const HOLE = 3.6;
export function holeOf(wing, k) {
  const b = bayOf(wing, k);
  const ym = (SEC.s1 + SEC.c0) / 2;
  return { x0: b.mid - HOLE / 2, x1: b.mid + HOLE / 2, y0: ym - HOLE / 2, y1: ym + HOLE / 2 };
}

/* The administration block, the clock tower on it and the porch. */
export const ADMIN = { x0: 190, x1: 210, y0: 144, y1: 169, floors: 4, doorW: 6, doorH: 3.6 };
export const TOWER = { x0: 196, x1: 204, y0: 153, y1: 161, base: TH + 4 * FL, bel0: TH + 4 * FL + 6.4, bel1: TH + 4 * FL + 10.8, pier: 1.2 };
export const PORCH = { x0: 195, x1: 205, y0: 137.5, y1: 144, h: TH + 4.0 };
/* The chapel, its bell gable, and the covered walkway to it. */
export const CHAPEL = { x0: 76, x1: 90, y0: 148, y1: 176, eave: TH + 8, ridge: TH + 13, doorW: 3, doorH: 4.2, t: 0.5 };
export const BELFRY = { x0: 80, x1: 86, y0: 147.6, y1: 148.6, top: TH + 18.5, s: TH + 14.2, e: TH + 17.0, w: 3 };
export const WALK = { x0: 90, x1: 110, y0: 158.0, y1: 161.2, h: TH + 3.2, posts: [92, 96, 100, 104, 108] };
/* The boiler house, its stack, and the water tower. */
export const BOILER = { x0: 300, x1: 318, y0: 176, y1: 194, h: TH + 7, door0: 183, door1: 187, doorH: TH + 4 };
export const STACK = { px: 312, py: 202, r0: 1.6, r1: 1.1, h: TH + 30 };
export const WATER = { px: 262, py: 196, half: 2.5, legR: 0.3, brace: TH + 6.5, tank0: TH + 13, tank1: TH + 18, r: 3.4 };

/* The wing's floors: the ground floor's top is the terrace's. */
const floorTop = (k) => TH + FL * k;

function wingHasHole(wing, k, storey) {
  return HOLES.some((h) => h.wing === wing.id && h.bay === k && (storey === 3 ? h.roof : h.floors.includes(storey)));
}

/* A slab over a rectangle, with the hole of any bay that has one at this
 * storey left out of it. */
function slab(T, m, x0, y0, x1, y1, h0, h1, holes, name) {
  const cut = holes.filter((h) => h.x1 > x0 && h.x0 < x1 && h.y1 > y0 && h.y0 < y1);
  if (!cut.length) {
    T.box(m, x0, y0, h0, x1, y1, h1, { kind: 'wall', name });
    return;
  }
  /* Strips along x between the holes, and round each the frame of it. */
  let at = x0;
  for (const h of cut.sort((p, q) => p.x0 - q.x0)) {
    T.box(m, at, y0, h0, h.x0, y1, h1, { kind: 'wall', name });
    T.box(m, h.x0, y0, h0, h.x1, h.y0, h1, { kind: 'wall', name });
    T.box(m, h.x0, h.y1, h0, h.x1, y1, h1, { kind: 'wall', name });
    at = h.x1;
  }
  T.box(m, at, y0, h0, x1, y1, h1, { kind: 'wall', name });
}

/* The jagged edge of a hole: broken slab ends hanging into it and the
 * reinforcing bars, all drawn and none solid. */
function holeEdge(T, h, z, r) {
  for (let i = 0; i < 6; i += 1) {
    const side = i % 4;
    const f = r.range(0.15, 0.85);
    const len = r.range(0.4, 0.9);
    const x = h.x0 + (h.x1 - h.x0) * f;
    const y = h.y0 + (h.y1 - h.y0) * f;
    if (side === 0) {
      T.deco('slab', x - len / 2, h.y0, z - 0.6, x + len / 2, h.y0 + 0.25, z - 0.05, true);
    } else if (side === 1) {
      T.deco('slab', x - len / 2, h.y1 - 0.25, z - 0.5, x + len / 2, h.y1, z - 0.05, true);
    } else if (side === 2) {
      T.deco('slab', h.x0, y - len / 2, z - 0.55, h.x0 + 0.25, y + len / 2, z - 0.05, true);
    } else {
      T.deco('slab', h.x1 - 0.25, y - len / 2, z - 0.45, h.x1, y + len / 2, z - 0.05, true);
    }
  }
  for (let i = 0; i < 5; i += 1) {
    const x = h.x0 + 0.4 + i * ((h.x1 - h.x0 - 0.8) / 4);
    T.cyl('rustDeep', [x, h.y0, z - 0.15], [x + r.range(-0.3, 0.3), h.y0 + r.range(0.5, 0.9), z - r.range(0.4, 0.9)], 0.025, 3, null, true);
    T.cyl('rustDeep', [x, h.y1, z - 0.15], [x + r.range(-0.3, 0.3), h.y1 - r.range(0.5, 0.9), z - r.range(0.4, 0.9)], 0.025, 3, null, true);
  }
}

/* A heap of what fell, on the floor under a hole: a few slabs on edge and
 * a mound, drawn only, low enough to fly over to any of the ward's ways
 * out. */
function rubble(T, h, z, r) {
  const cx = (h.x0 + h.x1) / 2;
  const cy = (h.y0 + h.y1) / 2;
  T.frustum('rubble', { x0: cx - 1.6, y0: cy - 1.4, x1: cx + 1.6, y1: cy + 1.4 }, z, { x0: cx - 0.6, y0: cy - 0.5, x1: cx + 0.5, y1: cy + 0.4 }, z + 0.55, true);
  for (let i = 0; i < 4; i += 1) {
    const x = cx + r.range(-1.4, 1.4);
    const y = cy + r.range(-1.2, 1.2);
    T.deco('slab', x - 0.5, y - 0.2, z, x + 0.5, y + 0.2, z + r.range(0.3, 0.7), true);
  }
}

/* An iron bed, head to the wall, foot to the window: the frame, the
 * mattress, and the bars at each end. Set dressing. */
function bed(T, x, y0, z, len = 1.95) {
  const w = 0.9;
  const y1 = y0 + len;
  T.deco('kiBed', x - w / 2, y0, z + 0.42, x + w / 2, y1, z + 0.48);
  T.deco('kiMattress', x - w / 2 + 0.05, y0 + 0.05, z + 0.48, x + w / 2 - 0.05, y1 - 0.05, z + 0.62);
  for (const [y, top] of [[y0 + 0.02, 1.05], [y1 - 0.02, 0.85]]) {
    T.cyl('kiBed', [x - w / 2, y, z], [x - w / 2, y, z + top], 0.025, 4);
    T.cyl('kiBed', [x + w / 2, y, z], [x + w / 2, y, z + top], 0.025, 4);
    T.cyl('kiBed', [x - w / 2, y, z + top], [x + w / 2, y, z + top], 0.025, 4);
    T.cyl('kiBed', [x - w / 2, y, z + top - 0.35], [x + w / 2, y, z + top - 0.35], 0.02, 4);
  }
}

/* A wheelchair of the period: two big wheels, a seat, a back. */
function wheelchair(T, x, y, z, along) {
  const [dx, dy] = along ? [0.3, 0] : [0, 0.3];
  for (const s of [-1, 1]) {
    T.torus('kiBed', x + s * dy, y + s * dx, z + 0.3, 0.28, 0.025, along ? 0 : 1, along ? 1 : 0, 4, 12);
  }
  T.deco('kiTimberPale', x - 0.25, y - 0.25, z + 0.45, x + 0.25, y + 0.25, z + 0.5);
  if (along) {
    T.deco('kiTimberPale', x - 0.25, y + 0.2, z + 0.5, x + 0.25, y + 0.25, z + 1.0);
  } else {
    T.deco('kiTimberPale', x + 0.2, y - 0.25, z + 0.5, x + 0.25, y + 0.25, z + 1.0);
  }
}

/*
 * A WING. Walls, slabs, columns, the parapets of the upper verandas, the
 * end walls with the corridor and the veranda open through them, and the
 * roof deck. Then, as set dressing, the frames, the stains, the beds.
 */
function wingOf(T, wing, r) {
  const { x0, x1 } = wing;
  const open = wing.end;
  const bays = [...Array(BAYS).keys()].map((k) => bayOf(wing, k));
  const holes = (storey) => bays.map((b, k) => (wingHasHole(wing, k, storey) ? holeOf(wing, k) : null)).filter(Boolean);
  const top = floorTop(3);
  /* The floors over the ground: the first, the second, and the roof deck,
   * each under the storey it carries, over the veranda too. */
  for (let st = 1; st <= 3; st += 1) {
    const z = floorTop(st);
    slab(T, 'slab', x0, SEC.col0 - 0.2, x1, SEC.n1 + 0.1, z - SLAB, z, holes(st), st === 3 ? 'roof deck' : 'floor');
    /* The cornice: the slab's edge stands proud on the south face. */
    T.box('concreteWorn', x0, SEC.col0 - 0.45, z - SLAB - 0.05, x1, SEC.col0 - 0.2, z + 0.05, { kind: 'wall', name: 'cornice' });
  }
  /* The ground floor's floor: tiles in the corridor and the wards, the
   * veranda's concrete, all paint on the terrace's top. */
  T.paint('kiTile', x0, SEC.s1, TH + 0.01, x1, SEC.n0, TH + 0.03);
  T.paint('concreteWorn', x0, SEC.col0, TH + 0.01, x1, SEC.s0, TH + 0.03);
  /* The plinth the veranda stands on: a step down to the terrace. */
  T.box('kiStoneDark', x0, SEC.col0 - 0.9, TH - 0.4, x1, SEC.col0, TH + 0.15, { kind: 'wall', name: 'plinth' });
  for (let st = 0; st < 3; st += 1) {
    const z = floorTop(st);
    const ceil = floorTop(st + 1) - SLAB;
    const groundSt = st === 0;
    /* The south wall: a window in every ward. */
    const south = bays.map((b) => ({ a0: b.mid - SOUTH_W / 2, a1: b.mid + SOUTH_W / 2, s: z + OPEN.south.s, e: z + OPEN.south.e }));
    wall(T, 'wallCream', 'x', x0, x1, SEC.s0, SEC.s1, z, ceil, south, { kind: 'wall', name: 'ward south wall' });
    /* The corridor wall: a door into every ward. */
    const doors = bays.map((b) => ({ a0: b.mid - DOOR_W / 2, a1: b.mid + DOOR_W / 2, s: z, e: z + OPEN.door.e }));
    wall(T, 'kiPlaster', 'x', x0, x1, SEC.c0, SEC.c1, z, ceil, doors, { kind: 'wall', name: 'corridor wall' });
    /* The north wall: a window opposite every door. */
    const north = bays.map((b) => ({ a0: b.mid - NORTH_W / 2, a1: b.mid + NORTH_W / 2, s: z + OPEN.north.s, e: z + OPEN.north.e }));
    wall(T, 'wallCream', 'x', x0, x1, SEC.n0, SEC.n1, z, ceil, north, { kind: 'wall', name: 'north wall' });
    /* The wards' partitions, on the bays' lines. */
    for (let k = 1; k < BAYS; k += 1) {
      const a = bays[k].a0;
      T.box('kiPlaster', a - 0.1, SEC.s1, z, a + 0.1, SEC.c0, ceil, { kind: 'wall', name: 'partition' });
    }
    /* The veranda's columns, one on each bay line and at each end. */
    const cols = [x0 + 0.2, ...bays.slice(1).map((b) => b.a0), x1 - 0.2];
    for (const cx of cols) {
      T.box('kiPlaster', cx - 0.2, SEC.col0, z, cx + 0.2, SEC.col1, ceil, { kind: 'wall', name: 'column' });
    }
    /* The upper verandas' parapets, a metre high between the columns. */
    if (!groundSt) {
      for (let i = 0; i + 1 < cols.length; i += 1) {
        T.box('wallCream', cols[i] + 0.2, SEC.col0 + 0.05, z, cols[i + 1] - 0.2, SEC.col0 + 0.25, z + 1.0, { kind: 'wall', name: 'parapet' });
      }
    }
    /* Panes left in: more of them the higher the storey, never on the
     * named crossings (./plan.js keeps those open by bay). */
    for (let k = 0; k < BAYS; k += 1) {
      if (wingHasHole(wing, k, st + 1) || wingHasHole(wing, k, st)) {
        continue;
      }
      if (KEEP_OPEN.has(`${wing.id}:${st}:${k}`)) {
        continue;
      }
      if (r.chance(groundSt ? 0.08 : 0.22 + 0.1 * st)) {
        pane(T, 'x', south[k], SEC.s0, SEC.s1);
      }
      if (r.chance(groundSt ? 0.1 : 0.3)) {
        pane(T, 'x', north[k], SEC.n0, SEC.n1);
      }
    }
    /* The end walls. On the open end the corridor and the veranda go
     * straight through on the ground floor; above it the corridor ends in
     * a window. The end against the hall is the hall's wall. */
    const ex = open === 'w' ? [x0, x0 + END] : [x1 - END, x1];
    const endHoles = groundSt
      ? [{ a0: SEC.c1, a1: SEC.n0, s: z, e: z + 3.0 }]
      : [{ a0: SEC.c1 + 0.3, a1: SEC.n0 - 0.3, s: z + 0.9, e: z + 2.9 }];
    wall(T, 'wallCream', 'y', SEC.s0, SEC.n1, ex[0], ex[1], z, ceil, [...endHoles, { a0: SEC.s1 + 1.2, a1: SEC.c0 - 1.2, s: z + 0.9, e: z + 2.9 }], { kind: 'wall', name: 'end wall' });
  }
  /* The roof deck's parapet and its coping. */
  T.box('concreteWorn', x0, SEC.col0 - 0.2, top, x1, SEC.col0 + 0.1, top + 1.0, { kind: 'wall', name: 'roof parapet' });
  T.box('concreteWorn', x0, SEC.n1 - 0.2, top, x1, SEC.n1 + 0.1, top + 1.0, { kind: 'wall', name: 'roof parapet' });
  const endX = open === 'w' ? x0 : x1 - 0.3;
  T.box('concreteWorn', endX, SEC.col0 - 0.2, top, endX + 0.3, SEC.n1 + 0.1, top + 1.0, { kind: 'wall', name: 'roof parapet' });
  /* The deck's own furniture: water tanks on a stand, a stair house. */
  const tx = open === 'w' ? x0 + 14 : x1 - 14;
  T.box('concreteWorn', tx - 2, SEC.c1 + 0.2, top, tx + 2, SEC.n0 - 0.2, top + 0.6, { kind: 'wall', name: 'tank stand' });
  T.cap('tank', [tx - 1.1, (SEC.c1 + SEC.n0) / 2, top + 0.6], [tx - 1.1, (SEC.c1 + SEC.n0) / 2, top + 2.0], 0.85, { kind: 'wall', name: 'tank', look: 'cyl', seg: 12 });
  T.cap('tank', [tx + 1.1, (SEC.c1 + SEC.n0) / 2, top + 0.6], [tx + 1.1, (SEC.c1 + SEC.n0) / 2, top + 2.0], 0.85, { kind: 'wall', name: 'tank', look: 'cyl', seg: 12 });
  const sx = open === 'w' ? x1 - 12 : x0 + 8;
  T.box('wallCream', sx, SEC.c0, top, sx + 4, SEC.n1, top + 2.8, { kind: 'wall', name: 'stair house' });
  T.box('concreteWorn', sx - 0.2, SEC.c0 - 0.2, top + 2.8, sx + 4.2, SEC.n1 + 0.2, top + 3.05, { kind: 'wall', name: 'stair house roof' });
  T.box('kiTimber', sx + 1.2, SEC.c0 - 0.06, top, sx + 2.6, SEC.c0, top + 2.1, { solid: false, cast: false });

  /* THE SET DRESSING. */
  T.dress(() => {
    /* What is fixed to the walls is seen from anywhere: the frames, the
     * stains, the downpipes, the ivy, the ward signs. */
    T.wide(() => {
      for (let st = 0; st < 3; st += 1) {
        const z = floorTop(st);
        for (let k = 0; k < BAYS; k += 1) {
          const b = bays[k];
          frame(T, 'kiFrame', 'x', { a0: b.mid - SOUTH_W / 2, a1: b.mid + SOUTH_W / 2, s: z + OPEN.south.s, e: z + OPEN.south.e }, SEC.s0, -0.06);
          frame(T, 'kiFrame', 'x', { a0: b.mid - NORTH_W / 2, a1: b.mid + NORTH_W / 2, s: z + OPEN.north.s, e: z + OPEN.north.e }, SEC.n1, 0.06);
          /* A damp streak under some windows, from the sill down. */
          if (r.chance(0.45)) {
            const w = r.range(0.25, 0.7);
            const xs = b.mid + r.range(-0.8, 0.8);
            T.paint('kiDamp', xs - w / 2, SEC.s0 - 0.03, z + 0.05, xs + w / 2, SEC.s0 - 0.01, z + OPEN.south.s - 0.06);
          }
          if (r.chance(0.35)) {
            const xs = b.mid + r.range(-0.8, 0.8);
            T.paint('kiDamp', xs - 0.3, SEC.n1 + 0.01, z + r.range(0.1, 0.5), xs + 0.3, SEC.n1 + 0.03, z + OPEN.north.s - 0.06);
          }
        }
        /* The grey under each cornice, where the rain runs back. */
        T.paint('kiStain', x0, SEC.s0 - 0.03, floorTop(st + 1) - SLAB - 0.35, x1, SEC.s0 - 0.01, floorTop(st + 1) - SLAB);
        T.paint('kiStain', x0, SEC.n1 + 0.01, floorTop(st + 1) - SLAB - 0.5, x1, SEC.n1 + 0.03, floorTop(st + 1) - SLAB);
      }
      /* The wet foot of the walls. */
      T.paint('kiStain', x0, SEC.s0 - 0.03, TH, x1, SEC.s0 - 0.01, TH + 0.7);
      T.paint('kiDamp', x0, SEC.n1 + 0.01, TH, x1, SEC.n1 + 0.03, TH + 0.9);
      /* Downpipes on the north face, and the streak each has left. */
      for (let k = 1; k < BAYS; k += 3) {
        const x = bays[k].a0;
        T.cyl('metalDark', [x, SEC.n1 + 0.12, TH], [x, SEC.n1 + 0.12, top + 0.4], 0.06, 5);
        T.paint('kiDamp', x - 0.35, SEC.n1 + 0.01, TH + 0.9, x + 0.35, SEC.n1 + 0.03, top);
      }
      /* Ivy up the open end, thick at the foot and thinning out. */
      const iv = open === 'w' ? x0 - 0.05 : x1;
      for (let i = 0; i < 9; i += 1) {
        const y = SEC.s0 + r.range(0, SEC.n1 - SEC.s0 - 1.5);
        const hgt = r.range(3, top - TH - 1);
        T.paint('kiIvy', iv, y, TH, iv + 0.05, y + r.range(0.8, 1.6), TH + hgt);
        T.ball('kiIvy', open === 'w' ? iv - 0.1 : iv + 0.15, y + 0.6, TH + hgt, r.range(0.4, 0.7));
      }
      /* And along the plinth, the weeds and the ivy have the veranda. */
      for (let x = x0 + 2; x < x1 - 1; x += r.range(4, 9)) {
        T.paint('kiIvy', x, SEC.col0 - 0.06, TH, x + 0.25, SEC.col0 - 0.02, TH + r.range(1.2, 3.4));
      }
      /* The ward's name on the open end. */
      T.sign(wing.label, open === 'w' ? x0 - 0.02 : x1 + 0.02, (SEC.s0 + SEC.c0) / 2, TH + 9.5, 1.0, 3.2, open === 'w' ? 'w' : 'e');
      /* The green running man over the corridor's ends. */
      T.sign('exit', open === 'w' ? x0 + END + 0.02 : x1 - END - 0.02, (SEC.c1 + SEC.n0) / 2, TH + 3.25, 0.9, 0.3, open === 'w' ? 'e' : 'w');
    });
    /* Inside: a bed in most wards, some pushed out onto the veranda, a
     * wheelchair in the corridor now and then, the ceiling come down in
     * places. Near only, as all set dressing is. */
    for (let st = 0; st < 3; st += 1) {
      const z = floorTop(st);
      for (let k = 0; k < BAYS; k += 1) {
        const b = bays[k];
        if (wingHasHole(wing, k, st) || wingHasHole(wing, k, st + 1)) {
          continue;
        }
        if (r.chance(0.7)) {
          bed(T, b.a0 + 1.0, SEC.s1 + 0.3, z, 1.95);
        }
        if (r.chance(0.45)) {
          bed(T, b.a1 - 1.0, SEC.c0 - 2.3, z, 1.95);
        }
        if (r.chance(0.18)) {
          bed(T, b.a0 + r.range(0.8, 1.6), SEC.col1 + 0.3, z, 1.9);
        }
        if (r.chance(0.12)) {
          wheelchair(T, b.mid + r.range(-2, 2), (SEC.c1 + SEC.n0) / 2 + 0.6, z, true);
        }
        /* A ceiling board hanging down at an angle, near the partition. */
        if (st > 0 && r.chance(0.3)) {
          const x = b.a0 + 0.4;
          T.prism('kiTimberPale', 'y', [[x, z - SLAB - 0.02], [x + 1.6, z - SLAB - 1.1], [x + 1.6, z - SLAB - 1.05], [x, z - SLAB + 0.02]].map(([a, h]) => [a, h + FL]), SEC.s1 + 0.6, SEC.s1 + 1.8);
        }
        /* Paper and plaster on the floor. */
        if (r.chance(0.5)) {
          const x = b.mid + r.range(-2, 2);
          const y = r.range(SEC.s1 + 0.5, SEC.c0 - 0.5);
          T.paint('kiStain', x - 0.6, y - 0.4, z + 0.03, x + 0.6, y + 0.4, z + 0.06);
        }
      }
    }
    /* Under and round each hole, its broken edge and what fell. */
    for (const h of HOLES.filter((q) => q.wing === wing.id)) {
      const hole = holeOf(wing, h.bay);
      if (h.roof) {
        holeEdge(T, hole, floorTop(3), r);
      }
      for (const st of h.floors) {
        holeEdge(T, hole, floorTop(st), r);
      }
      const lowest = h.floors.length ? Math.min(...h.floors) - 1 : 2;
      rubble(T, hole, floorTop(lowest), r);
    }
    /* On the sun deck: weeds in the cracks, puddles, a sapling. */
    for (let i = 0; i < 18; i += 1) {
      const x = r.range(x0 + 1, x1 - 1);
      const y = r.range(SEC.col0 + 0.4, SEC.n1 - 0.4);
      T.cone('kiMoss', x, y, top, r.range(0.2, 0.45), r.range(0.3, 0.7), 5);
    }
    for (let i = 0; i < 5; i += 1) {
      const x = r.range(x0 + 3, x1 - 3);
      const y = r.range(SEC.s0, SEC.c0);
      T.paint('kiPond', x - 1.2, y - 0.7, top + 0.01, x + 1.2, y + 0.7, top + 0.03);
    }
  });
}

/* Wards kept open on every storey listed here, for the named crossings:
 * 'wing:storey:bay'. */
export const KEEP_OPEN = new Set(['west:0:6', 'east:1:5', 'west:1:3', 'east:0:7']);

/*
 * THE ADMINISTRATION BLOCK. Four storeys over the entrance hall. The hall
 * is open from the porch to the back door and from wing to wing, so the
 * corridor and the veranda go through it, and a stair well climbs through
 * every floor in its north west corner.
 */
function adminOf(T, r) {
  const A = ADMIN;
  const top = floorTop(A.floors);
  const t = 0.4;
  const well = { x0: 191, x1: 195, y0: 163.5, y1: 168 };
  for (let st = 1; st <= A.floors; st += 1) {
    const z = floorTop(st);
    slab(T, 'slab', A.x0, A.y0, A.x1, A.y1, z - SLAB, z, st < A.floors ? [well] : [], st === A.floors ? 'roof' : 'floor');
    T.box('concreteWorn', A.x0 - 0.25, A.y0 - 0.25, z - SLAB - 0.05, A.x1 + 0.25, A.y1 + 0.25, z + 0.05, { kind: 'wall', name: 'cornice' });
  }
  T.paint('kiTile', A.x0, A.y0, TH + 0.01, A.x1, A.y1, TH + 0.03);
  const mid = (A.x0 + A.x1) / 2;
  for (let st = 0; st < A.floors; st += 1) {
    const z = floorTop(st);
    const ceil = floorTop(st + 1) - SLAB;
    const g = st === 0;
    /* The front: the doors on the ground floor, three windows above. */
    const winS = [192.5, mid, 207.5].map((c) => ({ a0: c - 1.0, a1: c + 1.0, s: z + 0.9, e: z + 2.9 }));
    const front = g ? [{ a0: mid - A.doorW / 2, a1: mid + A.doorW / 2, s: z, e: z + A.doorH }] : winS;
    wall(T, 'wallWhite', 'x', A.x0, A.x1, A.y0, A.y0 + t, z, ceil, front, { kind: 'wall', name: 'hall front' });
    const back = g ? [{ a0: mid - 2, a1: mid + 2, s: z, e: z + 3.2 }] : winS;
    wall(T, 'wallWhite', 'x', A.x0, A.x1, A.y1 - t, A.y1, z, ceil, back, { kind: 'wall', name: 'hall back' });
    /* The sides: on the ground floor the veranda and the corridor go
     * through; above, the corridor's door into each wing's corridor. */
    const through = g
      ? [{ a0: SEC.col1 + 0.1, a1: SEC.s0 - 0.1, s: z, e: z + 3.0 }, { a0: SEC.c1, a1: SEC.n0, s: z, e: z + 3.0 }]
      : [{ a0: SEC.c1 + 0.2, a1: SEC.n0 - 0.2, s: z, e: z + 2.6 }];
    /* The sides' own windows, on the part of the block that stands clear
     * of the wings, front and back. */
    const sideWin = [{ a0: 145.5, a1: 147.5, s: z + 0.9, e: z + 2.9 }, { a0: 164, a1: 166, s: z + 0.9, e: z + 2.9 }];
    for (const x of [A.x0, A.x1 - t]) {
      const ws = st >= 3 ? [...through, { a0: 151, a1: 153, s: z + 0.9, e: z + 2.9 }] : through;
      wall(T, 'wallWhite', 'y', A.y0 + t, A.y1 - t, x, x + t, z, ceil, [...ws, ...sideWin], { kind: 'wall', name: 'hall side' });
    }
  }
  /* The roof's parapet. */
  for (const [x0, y0, x1, y1] of [[A.x0, A.y0, A.x1, A.y0 + 0.3], [A.x0, A.y1 - 0.3, A.x1, A.y1], [A.x0, A.y0, A.x0 + 0.3, A.y1], [A.x1 - 0.3, A.y0, A.x1, A.y1]]) {
    T.box('concreteWorn', x0, y0, top, x1, y1, top + 1.1, { kind: 'wall', name: 'roof parapet' });
  }
  /* The stair in the well, a flight a storey along y, and its landing. */
  for (let st = 0; st < A.floors - 1; st += 1) {
    steps(T, 'concreteWorn', well.x0 + 0.1, well.x0 + 1.6, well.y0 + 0.2, 1, 0.38, FL / 10, 10, floorTop(st), 'stair');
  }
  /* THE PORCH, a slab on four columns, and a gable over its front. */
  const P = PORCH;
  for (const [x, y] of [[P.x0 + 0.35, P.y0 + 0.35], [P.x1 - 0.35, P.y0 + 0.35], [P.x0 + 0.35, P.y1 - 0.2], [P.x1 - 0.35, P.y1 - 0.2]]) {
    T.post('wallWhite', x, y, TH, P.h, 0.32, { kind: 'wall', name: 'porch column', seg: 10 });
  }
  T.box('concreteWorn', P.x0 - 0.3, P.y0 - 0.3, P.h, P.x1 + 0.3, P.y1, P.h + 0.5, { kind: 'wall', name: 'porch roof' });
  roofDrawn(T, 'kiCopper', 'y', P.x0 - 0.3, P.x1 + 0.3, P.h + 0.5, P.h + 2.4, P.y0 - 0.3, P.y1, 0.3, 0.25);
  gable(T, 'wallWhite', 'y', P.x0 - 0.3, P.x1 + 0.3, P.h + 0.5, P.h + 2.1, P.y0 - 0.2, 0.2);
  roofSolid(T, 'y', P.x0 - 0.3, P.x1 + 0.3, P.h + 0.5, P.h + 2.1, P.y0 - 0.3, P.y1, 3, null, 'porch roof');
  /* Steps up to the hall from the porch. */
  T.box('kiStoneDark', P.x0, P.y0, TH, P.x1, A.y0, TH + 0.15, { kind: 'wall', name: 'porch floor' });
  /* THE TOWER, on the roof over the hall. A solid stage with a clock on
   * each face, the belvedere open on all four sides on four piers, a
   * slab, and the copper pyramid with its finial. */
  const W = TOWER;
  T.box('wallWhite', W.x0, W.y0, top, W.x1, W.y1, W.bel0, { kind: 'wall', name: 'tower' });
  T.box('concreteWorn', W.x0 - 0.25, W.y0 - 0.25, W.bel0 - 0.4, W.x1 + 0.25, W.y1 + 0.25, W.bel0, { kind: 'wall', name: 'tower cornice' });
  for (const [x, y] of [[W.x0, W.y0], [W.x1 - W.pier, W.y0], [W.x0, W.y1 - W.pier], [W.x1 - W.pier, W.y1 - W.pier]]) {
    T.box('wallWhite', x, y, W.bel0, x + W.pier, y + W.pier, W.bel1, { kind: 'wall', name: 'belvedere pier' });
  }
  T.box('concreteWorn', W.x0 - 0.4, W.y0 - 0.4, W.bel1, W.x1 + 0.4, W.y1 + 0.4, W.bel1 + 0.45, { kind: 'wall', name: 'belvedere roof' });
  const ap = W.bel1 + 0.45;
  T.frustum('kiCopper', { x0: W.x0 - 0.4, y0: W.y0 - 0.4, x1: W.x1 + 0.4, y1: W.y1 + 0.4 }, ap, { x0: 199.7, y0: 156.7, x1: 200.3, y1: 157.3 }, ap + 4.2);
  T.frustumSolid({ x0: W.x0 - 0.4, y0: W.y0 - 0.4, x1: W.x1 + 0.4, y1: W.y1 + 0.4 }, ap, { x0: 199.7, y0: 156.7, x1: 200.3, y1: 157.3 }, ap + 4.2, 4, 'tower roof');
  T.post('kiBronze', 200, 157, ap + 4.2, ap + 5.6, 0.06, { kind: 'pole', name: 'finial', seg: 5 });
  T.ball('kiBronze', 200, 157, ap + 4.7, 0.22);
  /* The clocks, one a face, stopped. */
  const cz = (top + W.bel0) / 2 + 0.4;
  T.sign('clock', mid, W.y0 - 0.02, cz, 2.6, 2.6, 's');
  T.sign('clock', mid, W.y1 + 0.02, cz, 2.6, 2.6, 'n');
  T.sign('clock', W.x0 - 0.02, 157, cz, 2.6, 2.6, 'w');
  T.sign('clock', W.x1 + 0.02, 157, cz, 2.6, 2.6, 'e');
  T.dress(() => {
    T.wide(() => {
      for (let st = 1; st < A.floors; st += 1) {
        const z = floorTop(st);
        for (const c of [192.5, mid, 207.5]) {
          frame(T, 'kiFrame', 'x', { a0: c - 1.0, a1: c + 1.0, s: z + 0.9, e: z + 2.9 }, A.y0, -0.06);
          frame(T, 'kiFrame', 'x', { a0: c - 1.0, a1: c + 1.0, s: z + 0.9, e: z + 2.9 }, A.y1, 0.06);
        }
      }
      /* The name over the door, and the stains down the front. */
      T.sign('name', mid, A.y0 - 0.03, TH + 4.6, 5.2, 0.9, 's');
      T.paint('kiStain', A.x0, A.y0 - 0.03, TH, A.x1, A.y0 - 0.01, TH + 0.8);
      for (const x of [191.2, 196, 204, 208.8]) {
        T.paint('kiDamp', x - 0.3, A.y0 - 0.03, TH + 5, x + 0.3, A.y0 - 0.01, top);
      }
      /* Pilasters either side of the door, and the clock's ring. */
      for (const x of [mid - A.doorW / 2 - 0.5, mid + A.doorW / 2 + 0.1]) {
        T.deco('concreteWorn', x, A.y0 - 0.2, TH, x + 0.4, A.y0, top);
      }
      T.paint('kiStain', W.x0, W.y0 - 0.03, top, W.x1, W.y0 - 0.01, top + 1.2);
    });
    /* Inside the hall: the reception counter, benches, a fallen chandelier. */
    T.deco('kiTimber', 193, 152, TH, 196, 152.6, TH + 1.05);
    T.deco('kiTimberPale', 192.9, 151.9, TH + 1.05, 196.1, 152.7, TH + 1.12);
    for (const y of [146.2, 147.8]) {
      T.deco('kiTimber', 204.5, y, TH + 0.42, 208.5, y + 0.45, TH + 0.5);
    }
    T.torus('kiBronze', 200, 156, TH + 0.12, 0.8, 0.05, 0, 0, 4, 16);
    T.paint('glassDark', 199, 155, TH + 0.03, 201.4, 157.2, TH + 0.05);
    void r;
  });
}

/*
 * THE CHAPEL. A nave under a pitched roof, its front gable to the south
 * with the door and the bell gable over it, a door in each side on the
 * corridor's line, tall windows, and the apse window. The ceiling and the
 * roof's east side are gone over two bays.
 */
function chapelOf(T, r) {
  const C = CHAPEL;
  const mid = (C.x0 + C.x1) / 2;
  const t = C.t;
  /* The front and back walls, to the eave; the gables over them. */
  wall(T, 'kiPlaster', 'x', C.x0, C.x1, C.y0, C.y0 + t, TH, C.eave, [
    { a0: mid - C.doorW / 2, a1: mid + C.doorW / 2, s: TH, e: TH + C.doorH },
  ], { kind: 'wall', name: 'chapel front' });
  wall(T, 'kiPlaster', 'x', C.x0, C.x1, C.y1 - t, C.y1, TH, C.eave, [
    { a0: mid - 1.5, a1: mid + 1.5, s: TH + 3.0, e: TH + 7.0 },
  ], { kind: 'wall', name: 'chapel apse' });
  gable(T, 'kiPlaster', 'y', C.x0, C.x1, C.eave, C.ridge, C.y0, t);
  gable(T, 'kiPlaster', 'y', C.x0, C.x1, C.eave, C.ridge, C.y1 - t, t);
  /* The sides: the door on the corridor's line, three tall windows. */
  const side = [
    { a0: SEC.c1, a1: SEC.n0, s: TH, e: TH + 3.0 },
    { a0: 152.2, a1: 154.0, s: TH + 2.2, e: TH + 6.4 },
    { a0: 165.1, a1: 166.9, s: TH + 2.2, e: TH + 6.4 },
    { a0: 170.6, a1: 172.4, s: TH + 2.2, e: TH + 6.4 },
  ];
  for (const x of [C.x0, C.x1 - t]) {
    wall(T, 'kiPlaster', 'y', C.y0 + t, C.y1 - t, x, x + t, TH, C.eave, side, { kind: 'wall', name: 'chapel side' });
  }
  /* The roof, in bays; the east side of two is gone. */
  const cuts = [148, 154, 158, 162, 166, 170, 176];
  const gone = new Set([162, 166]);
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const e0 = i === 0 ? C.y0 - 0.45 : cuts[i];
    const e1 = i === cuts.length - 2 ? C.y1 + 0.45 : cuts[i + 1];
    const half = gone.has(cuts[i]) ? 'lo' : null;
    roofDrawn(T, 'kiCopperDark', 'y', C.x0, C.x1, C.eave, C.ridge, e0, e1, 0.45, 0.3, half);
    roofSolid(T, 'y', C.x0, C.x1, C.eave, C.ridge, cuts[i], cuts[i + 1], 5, half, 'chapel roof');
    /* The ceiling, a timber board at the eave, gone with the roof. */
    if (!half) {
      T.box('kiTimber', C.x0 + t, cuts[i], C.eave - 0.25, C.x1 - t, cuts[i + 1], C.eave, { kind: 'wall', name: 'chapel ceiling' });
    } else {
      /* Where the roof fell, the west side's own underside is the roof's
       * timbers, drawn, so the solid under the slope is what is seen. */
      T.box('kiTimber', C.x0 + t, cuts[i], C.eave - 0.25, mid - 0.2, cuts[i + 1], C.eave, { kind: 'wall', name: 'chapel ceiling' });
    }
  }
  /* The rafters left over the hole, each a timber across the gap, not
   * solid: a quad that clips one goes on. */
  T.dress(() => {
    T.wide(() => {
      for (const y of [163.9, 167.9]) {
        T.cyl('kiTimber', [mid, y, C.ridge - 0.2], [C.x1 + 0.2, y, C.eave - 0.1], 0.1, 4);
      }
    });
  });
  /* THE BELL GABLE, on the front gable: a wall standing above the ridge
   * with the bell's opening through it, and its little roof. */
  const B = BELFRY;
  wall(T, 'kiPlaster', 'x', B.x0, B.x1, B.y0, B.y1, C.ridge - 1.6, B.top, [
    { a0: mid - B.w / 2, a1: mid + B.w / 2, s: B.s, e: B.e },
  ], { kind: 'wall', name: 'bell gable' });
  roofDrawn(T, 'kiCopper', 'y', B.x0, B.x1, B.top, B.top + 1.4, B.y0 - 0.3, B.y1 + 0.3, 0.3, 0.2);
  roofSolid(T, 'y', B.x0, B.x1, B.top, B.top + 1.4, B.y0, B.y1, 2, null, 'bell gable roof');
  /* The cross on its peak. */
  T.box('kiBronze', mid - 0.06, B.y0 + 0.4, B.top + 1.4, mid + 0.06, B.y0 + 0.55, B.top + 2.6, { kind: 'pole', name: 'cross' });
  T.box('kiBronze', mid - 0.4, B.y0 + 0.4, B.top + 2.0, mid + 0.4, B.y0 + 0.55, B.top + 2.12, { kind: 'pole', name: 'cross' });
  /* The bell, fallen, on the ground in front of the door. */
  T.cap('kiBronze', [mid + 3.4, C.y0 - 2.8, TH + 0.7], [mid + 3.4, C.y0 - 2.8, TH + 0.7], 0.7, { kind: 'obstacle', name: 'fallen bell', look: 'capsule', seg: 10 });
  /* The step at the door. */
  T.box('kiStoneDark', mid - 2.4, C.y0 - 1.4, TH, mid + 2.4, C.y0, TH + 0.2, { kind: 'wall', name: 'chapel step' });
  T.paint('kiTimberPale', C.x0 + t, C.y0 + t, TH + 0.01, C.x1 - t, C.y1 - t, TH + 0.03);
  T.dress(() => {
    T.wide(() => {
      /* The round window over the door, the arches over the windows. */
      T.cyl('glassDark', [mid, C.y0 - 0.03, C.eave + 1.5], [mid, C.y0 + 0.1, C.eave + 1.5], 0.95, 16);
      T.torus('kiFrame', mid, C.y0 - 0.06, C.eave + 1.5, 1.0, 0.09, 0, -1, 4, 20);
      for (const x of [C.x0 - 0.03, C.x1 + 0.03]) {
        for (const o of side.slice(1)) {
          T.prism('kiFrame', 'x', [[o.a0, o.e], [(o.a0 + o.a1) / 2, o.e + 0.9], [o.a1, o.e]], x - 0.03, x + 0.03);
          T.paint('kiDamp', x - 0.02, o.a0 + 0.3, TH + 0.4, x + 0.02, o.a0 + 0.8, o.s);
        }
      }
      /* Ivy over the west side and up the front's corner. */
      for (let i = 0; i < 12; i += 1) {
        const y = r.range(C.y0 + 0.5, C.y1 - 2);
        T.paint('kiIvy', C.x0 - 0.06, y, TH, C.x0 - 0.02, y + r.range(1.0, 2.2), TH + r.range(2, 7.5));
      }
      for (let i = 0; i < 6; i += 1) {
        const x = r.range(C.x0, C.x0 + 4);
        T.paint('kiIvy', x, C.y0 - 0.06, TH, x + r.range(0.6, 1.4), C.y0 - 0.02, TH + r.range(3, 9));
      }
      T.sign('chapel', mid, C.y0 - 0.04, TH + C.doorH + 0.6, 2.4, 0.6, 's');
    });
    /* The pews, in two rows either side of the aisle, a few knocked over,
     * the altar and its rail. */
    for (let y = 151; y < 156.5; y += 1.4) {
      T.deco('kiTimber', C.x0 + 1, y, TH + 0.42, mid - 0.9, y + 0.4, TH + 0.48);
      T.deco('kiTimber', C.x0 + 1, y + 0.32, TH + 0.48, mid - 0.9, y + 0.4, TH + 0.95);
      T.deco('kiTimber', mid + 0.9, y, TH + 0.42, C.x1 - 1, y + 0.4, TH + 0.48);
      T.deco('kiTimber', mid + 0.9, y + 0.32, TH + 0.48, C.x1 - 1, y + 0.4, TH + 0.95);
    }
    for (let y = 162; y < 170; y += 1.6) {
      if (r.chance(0.5)) {
        T.deco('kiTimber', C.x0 + 1, y, TH + 0.42, mid - 0.9, y + 0.4, TH + 0.48);
      } else {
        T.deco('kiTimber', C.x0 + 1.2, y, TH, mid - 1.1, y + 0.45, TH + 0.12);
      }
    }
    T.deco('kiTimberPale', mid - 1.4, C.y1 - 3.2, TH, mid + 1.4, C.y1 - 2.2, TH + 1.0);
    T.deco('kiTimber', C.x0 + 1, C.y1 - 4.6, TH + 0.9, C.x1 - 1, C.y1 - 4.5, TH + 0.98);
    /* The fallen roof on the nave floor. */
    T.frustum('rubble', { x0: mid + 0.5, y0: 162.5, x1: C.x1 - 0.8, y1: 169.5 }, TH, { x0: mid + 2, y0: 164, x1: C.x1 - 2, y1: 168 }, TH + 0.6);
    for (let i = 0; i < 5; i += 1) {
      const y = r.range(162.5, 169);
      T.deco('kiCopperDark', mid + 1, y, TH + 0.4, C.x1 - 1, y + 0.6, TH + r.range(0.7, 1.4));
    }
  });
}

/*
 * THE COVERED WALKWAY (渡り廊下) from the west wing's open end to the
 * chapel's side door, a roof on two rows of posts, its floor a strip of
 * concrete. On the corridor's line, so the long corridor flies on under it.
 */
function walkOf(T) {
  const K = WALK;
  for (const x of K.posts) {
    for (const y of [K.y0 + 0.15, K.y1 - 0.15]) {
      T.post('kiTimber', x, y, TH, K.h, 0.12, { kind: 'pole', name: 'walkway post', seg: 6 });
    }
  }
  T.box('kiTimber', K.x0, K.y0 - 0.3, K.h, K.x1, K.y1 + 0.3, K.h + 0.2, { kind: 'wall', name: 'walkway roof' });
  roofDrawn(T, 'rustDeep', 'x', K.y0 - 0.3, K.y1 + 0.3, K.h + 0.2, K.h + 1.0, K.x0, K.x1, 0.25, 0.12);
  roofSolid(T, 'x', K.y0 - 0.3, K.y1 + 0.3, K.h + 0.2, K.h + 0.9, K.x0, K.x1, 2, null, 'walkway roof');
  T.paint('concreteWorn', K.x0, K.y0, TH + 0.01, K.x1, K.y1, TH + 0.04);
  T.dress(() => {
    T.wide(() => {
      /* A sheet slipped off, hanging by one corner, and the gutter. */
      T.prism('rustDeep', 'x', [[K.y1 + 0.2, K.h + 0.3], [K.y1 + 1.0, K.h - 0.9], [K.y1 + 1.06, K.h - 0.86], [K.y1 + 0.26, K.h + 0.34]], 100.5, 102.5);
      T.cyl('metalDark', [K.x0, K.y0 - 0.35, K.h + 0.15], [K.x1, K.y0 - 0.35, K.h + 0.15], 0.06, 5);
      for (const x of K.posts) {
        T.paint('kiIvy', x - 0.14, K.y0 + 0.02, TH, x + 0.14, K.y0 + 0.28, TH + 1.8);
      }
    });
  });
}

/* THE BOILER HOUSE and its stack, east of the east wing: through doors
 * west and east on one line, the boiler beside it, the flue to the stack. */
function boilerOf(T, r) {
  const B = BOILER;
  const t = 0.4;
  const door = { a0: B.door0, a1: B.door1, s: TH, e: B.doorH };
  const win = (a) => ({ a0: a - 1.0, a1: a + 1.0, s: TH + 3.6, e: TH + 5.6 });
  for (const x of [B.x0, B.x1 - t]) {
    wall(T, 'brick', 'y', B.y0, B.y1, x, x + t, TH, B.h, [win(179), door, win(190.5)], { kind: 'wall', name: 'boiler house' });
  }
  for (const y of [B.y0, B.y1 - t]) {
    wall(T, 'brick', 'x', B.x0 + t, B.x1 - t, y, y + t, TH, B.h, [win(304.5), win(313.5)], { kind: 'wall', name: 'boiler house' });
  }
  T.box('concreteWorn', B.x0 - 0.3, B.y0 - 0.3, B.h, B.x1 + 0.3, B.y1 + 0.3, B.h + 0.35, { kind: 'wall', name: 'boiler roof' });
  /* A monitor along the ridge, its louvres open. */
  T.box('sheet', 305, B.y0 + 3, B.h + 0.35, 313, B.y1 - 3, B.h + 1.6, { kind: 'wall', name: 'monitor' });
  T.box('sheetRib', 304.6, B.y0 + 2.6, B.h + 1.6, 313.4, B.y1 - 2.6, B.h + 1.8, { kind: 'wall', name: 'monitor roof' });
  /* The boiler: a drum on its side, out of the doors' line. */
  T.cap('kiSoot', [303.5, 179.4, TH + 1.5], [314.5, 179.4, TH + 1.5], 1.3, { kind: 'wall', name: 'boiler', look: 'capsule', seg: 12 });
  T.box('brick', 303, 177.8, TH, 315, 181, TH + 0.5, { kind: 'wall', name: 'boiler bed' });
  T.paint('rubble', B.x0 + t, B.y0 + t, TH + 0.01, B.x1 - t, B.y1 - t, TH + 0.03);
  /* The flue to the stack, high over the yard, and the stack. */
  const S = STACK;
  T.box('kiSoot', S.px - 0.6, B.y1 - 0.2, TH + 5.4, S.px + 0.6, S.py - 0.8, TH + 6.6, { kind: 'wall', name: 'flue' });
  T.cyl('kiBrick', [S.px, S.py, TH - 0.2], [S.px, S.py, S.h], S.r0, 14, S.r1);
  T.cap('kiBrick', [S.px, S.py, TH], [S.px, S.py, S.h], S.r1, { draw: false, kind: 'wall', name: 'stack' });
  /* The stack's taper as solid: a fatter capsule up to two thirds. */
  T.cap('kiBrick', [S.px, S.py, TH], [S.px, S.py, TH + 10], S.r0 - 0.1, { draw: false, kind: 'wall', name: 'stack foot' });
  T.cyl('kiSoot', [S.px, S.py, S.h - 1.2], [S.px, S.py, S.h + 0.1], S.r1 + 0.12, 14, S.r1 + 0.12);
  T.torus('kiSoot', S.px, S.py, S.h - 3, S.r1 + 0.18, 0.12, 0, 0, 4, 14);
  T.dress(() => {
    T.wide(() => {
      /* The stack's ladder, and the soot down the brick. */
      T.cyl('rustDeep', [S.px - 0.3, S.py - S.r0 - 0.15, TH + 2], [S.px - 0.3, S.py - S.r1 - 0.15, S.h - 1], 0.03, 3);
      T.cyl('rustDeep', [S.px + 0.3, S.py - S.r0 - 0.15, TH + 2], [S.px + 0.3, S.py - S.r1 - 0.15, S.h - 1], 0.03, 3);
      T.sign('boiler', B.x0 - 0.03, 181, TH + 4.6, 1.6, 0.4, 'w');
      T.paint('kiSoot', B.x0 - 0.03, B.door0, B.doorH, B.x0 - 0.01, B.door1, B.doorH + 1.4);
      T.paint('kiSoot', B.x1 + 0.01, B.door0, B.doorH, B.x1 + 0.03, B.door1, B.doorH + 1.4);
    });
    /* Coal and a barrow by the west door, pipes along the walls. */
    T.frustum('kiSoot', { x0: B.x0 + 1, y0: B.y1 - 4.5, x1: B.x0 + 5, y1: B.y1 - 0.6 }, TH, { x0: B.x0 + 2, y0: B.y1 - 3.5, x1: B.x0 + 3.5, y1: B.y1 - 1.5 }, TH + 1.1);
    T.cyl('rustDeep', [B.x0 + 0.6, B.y0 + 0.6, TH + 3.2], [B.x1 - 0.6, B.y0 + 0.6, TH + 3.2], 0.12, 6);
    T.cyl('rustDeep', [303.5, 179.4, TH + 2.8], [303.5, 179.4, B.h], 0.18, 6);
    void r;
  });
}

/* THE WATER TOWER: four legs, two rings of braces between them, the tank
 * and its lid, a ladder. Between the legs is a window under the braces and
 * another over them. */
function waterOf(T) {
  const Wt = WATER;
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [Wt.px + a * Wt.half, Wt.py + b * Wt.half]);
  for (const [x, y] of legs) {
    T.post('concreteWorn', x, y, TH, Wt.tank0, Wt.legR, { kind: 'wall', name: 'tower leg', seg: 8 });
  }
  const h = Wt.half;
  for (const z of [Wt.brace]) {
    T.box('concreteWorn', Wt.px - h, Wt.py - h - 0.2, z, Wt.px + h, Wt.py - h + 0.2, z + 0.4, { kind: 'wall', name: 'brace' });
    T.box('concreteWorn', Wt.px - h, Wt.py + h - 0.2, z, Wt.px + h, Wt.py + h + 0.2, z + 0.4, { kind: 'wall', name: 'brace' });
    T.box('concreteWorn', Wt.px - h - 0.2, Wt.py - h, z, Wt.px - h + 0.2, Wt.py + h, z + 0.4, { kind: 'wall', name: 'brace' });
    T.box('concreteWorn', Wt.px + h - 0.2, Wt.py - h, z, Wt.px + h + 0.2, Wt.py + h, z + 0.4, { kind: 'wall', name: 'brace' });
  }
  T.box('concreteWorn', Wt.px - h - 0.5, Wt.py - h - 0.5, Wt.tank0 - 0.5, Wt.px + h + 0.5, Wt.py + h + 0.5, Wt.tank0, { kind: 'wall', name: 'tank floor' });
  T.cyl('tankPaint', [Wt.px, Wt.py, Wt.tank0], [Wt.px, Wt.py, Wt.tank1], Wt.r, 16);
  T.cap('tankPaint', [Wt.px, Wt.py, Wt.tank0 + Wt.r * 0.6], [Wt.px, Wt.py, Wt.tank1 - Wt.r * 0.6], Wt.r - 0.05, { draw: false, kind: 'wall', name: 'tank' });
  T.hidden(Wt.px - Wt.r * 0.7, Wt.py - Wt.r * 0.7, Wt.tank0, Wt.px + Wt.r * 0.7, Wt.py + Wt.r * 0.7, Wt.tank1, 'wall', 'tank');
  T.cone('kiCopperDark', Wt.px, Wt.py, Wt.tank1, Wt.r + 0.3, 1.6, 16);
  T.dress(() => {
    T.wide(() => {
      T.paint('kiDamp', Wt.px - 1, Wt.py - Wt.r - 0.02, Wt.tank0, Wt.px + 0.4, Wt.py - Wt.r + 0.1, Wt.tank1 - 0.6);
      T.cyl('rustDeep', [Wt.px + Wt.half + 0.35, Wt.py - 0.25, TH], [Wt.px + Wt.half + 0.35, Wt.py - 0.25, Wt.tank1], 0.03, 3);
      T.cyl('rustDeep', [Wt.px + Wt.half + 0.35, Wt.py + 0.25, TH], [Wt.px + Wt.half + 0.35, Wt.py + 0.25, Wt.tank1], 0.03, 3);
      T.torus('rustDeep', Wt.px, Wt.py, Wt.tank0 + 2.5, Wt.r + 0.04, 0.05, 0, 0, 3, 24);
    });
  });
}

/* The whole sanatorium on its terrace. */
export function sanatorium(T) {
  const r = rng(1938);
  for (const wing of WINGS) {
    wingOf(T, wing, r);
  }
  adminOf(T, r);
  chapelOf(T, r);
  walkOf(T);
  boilerOf(T, r);
  waterOf(T);
}
