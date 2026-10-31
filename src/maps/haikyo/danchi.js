/*
 * danchi.js: Block 1, the long one. A five storey walk up of the kind the
 * public housing corporations built by the thousand in the 1960s and 70s:
 * a reinforced concrete frame twelve bays long, one flat to a bay, an open
 * access corridor down the north face, a balcony down the south face, and
 * a stair tower standing off the corridor at each end. Five storeys,
 * because under six the law of the day did not ask for a lift, which is
 * why a whole generation of these blocks have none.
 *
 * WHAT IS LEFT OF IT, each of which is a line:
 *
 *   THE DROP       bay 3's floors are holed one over another from the roof
 *                  to the ground, three by four metres, so a pilot can go
 *                  in at the roof and come out of the ground floor flat
 *   THE PILOTIS    bay 7's ground floor is a through passage, south to
 *                  north, under the block (half the blocks of the day had
 *                  one, for the bins and the bicycles)
 *   THE CORRIDOR   the open access corridors, 2.3 m clear from the doors to
 *                  the parapet and 2.75 m to the slab over them
 *   THE BALCONIES  2 m deep from the column line, their partitions mostly
 *                  kicked out, a strafe the length of the block on every
 *                  floor between the balustrade and the slab above
 *   THE STAIRS     two open stair towers whose wells run clear from the
 *                  ground to the top, 2.5 by 3.4 m; the west one's roof
 *                  is gone, so its well is a dive from the sky
 *   THE COLLAPSE   the east end's top floor: its roof gone, its floor down
 *                  and leaning on the floor under it, a ramp to skim
 *   and holes in the floors and the party walls up and down the block, a
 *   room to the next and a floor to the next
 *
 * REAL SIZES (metres): bays of 6.0 on the column grid, which is the span a
 * flat of the day was planned on; floor to floor 3.0 (a danchi's was 2.7
 * to 2.8; the brief asked for 3.0 to 3.5 and a five inch needs the air);
 * slabs 0.25 thick and beams 0.5 deep, which leaves 2.25 under a beam;
 * corridor 2.3 clear; balustrades and parapets 1.1 high, the height the
 * building standards ask of a balcony's. The south openings are a room's
 * sliding doors, 3.6 by 2.0 with the frames gone. The corridor windows are
 * kitchen windows, 1.6 wide and 1.4 high from a 0.8 sill: the commonest
 * aluminium sash there was is 1.69 by 1.37, and the brief's 1.2 m window
 * is under the gap rule (1.4 m, src/props/parts.js GAP_MIN).
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

import { rng } from './frame.js';
import { wall, slab, flight, sloped, rebar } from './bits.js';

/* The block, in the plan. Bays are numbered from 0 at the west end. */
export const BLOCK = {
  x0: 54, x1: 126, bay: 6, n: 12,
  /* the column lines: the south one carries the balcony, the north one
   * the corridor */
  yS: 100, yN: 108,
  /* the balcony's front and the corridor's outer edge */
  yB: 97.9, yC: 110.6,
  fh: 3.0, floors: 5, slab: 0.25, beam: 0.5, col: 0.6,
  roof: 15.0, parapet: 1.1,
};

/* The stair towers, off the corridor: west edge and the tower's depth. */
export const STAIRS = [
  { x: 55, open: true },
  { x: 119, open: false },
];
export const TOWER = { y0: BLOCK.yC, y1: BLOCK.yC + 6.6, w: 6, land: 1.6 };

const bayX = (i) => BLOCK.x0 + i * BLOCK.bay;

/* The bays the story above names. */
export const DROP_BAY = 2;
export const PILOTIS_BAY = 6;
const COLLAPSE = [10, 11];

/* The holes in the floors: k is the floor whose slab is holed (1 is the
 * first floor's floor, 5 the roof), each a plan rectangle. */
function holes() {
  const H = [];
  const d = bayX(DROP_BAY);
  for (let k = 1; k <= 5; k += 1) {
    H.push({ k, x0: d + 1.5, x1: d + 4.5, y0: 102, y1: 106, rebar: true });
  }
  H.push({ k: 3, x0: bayX(5) + 1, x1: bayX(5) + 5, y0: 101.4, y1: 104.6, rebar: true });
  H.push({ k: 2, x0: bayX(8) + 1, x1: bayX(8) + 4, y0: 103, y1: 107, rebar: true });
  H.push({ k: 4, x0: bayX(8) + 2, x1: bayX(8) + 5, y0: 100.8, y1: 104, rebar: true });
  H.push({ k: 2, x0: bayX(3) + 2, x1: bayX(3) + 4.5, y0: 108.4, y1: 110.2, rebar: true });
  /* The collapse: the roof over the east end's two bays is gone, and the
   * top floor's floor of the last bay is down. */
  H.push({ k: 5, x0: bayX(COLLAPSE[0]), x1: BLOCK.x1 + 0.3, y0: BLOCK.yB - 0.1, y1: BLOCK.yC + 0.1 });
  H.push({ k: 4, x0: bayX(11) + 0.3, x1: BLOCK.x1 - 0.15, y0: 100.3, y1: 107.7 });
  return H;
}
export const FLOOR_HOLES = holes();

/*
 * What each flat's walls are, by bay i and floor k, rolled once from a
 * seed so every engine builds the same block: the south wall's sliding
 * doors open, shuttered or gone; the corridor wall's door shut or smashed
 * through; the party wall to the east intact, holed or gone.
 */
function rollWalls() {
  const r = rng(0x1d4c0e);
  const out = {};
  for (let k = 0; k < BLOCK.floors; k += 1) {
    for (let i = 0; i < BLOCK.n; i += 1) {
      const south = r.pick(['open', 'open', 'open', 'shut', 'gone']);
      const north = r.pick(['door', 'door', 'smashed']);
      const party = r.pick(['intact', 'holed', 'holed', 'gone']);
      const grille = r.chance(0.45);
      out[`${i},${k}`] = { south, north, party, grille };
    }
  }
  /* What the lines need, whatever the roll: the drop comes out of the
   * ground floor's sliding doors, the pilotis has no walls, the collapsed
   * top floor has none either. */
  for (let k = 0; k < BLOCK.floors; k += 1) {
    out[`${DROP_BAY},${k}`].south = 'open';
  }
  out[`${PILOTIS_BAY},0`] = { south: 'none', north: 'none', party: 'gone', grille: false };
  out[`${PILOTIS_BAY - 1},0`].party = 'gone';
  for (const i of COLLAPSE) {
    out[`${i},4`] = { south: 'none', north: 'none', party: 'gone', grille: false };
  }
  out[`${COLLAPSE[0] - 1},4`].party = 'holed';
  /* The bridge's end: the flat it lands in has lost its south wall. */
  out['11,1'].south = 'gone';
  /* The party wall the hidden sign is painted on, inside the drop. */
  out['1,2'].party = 'intact';
  return out;
}
export const WALLS = rollWalls();

/* Which balcony partitions still stand, and which bays' balustrades fell. */
function rollBalconies() {
  const r = rng(0x5ba1c0);
  const parts = new Set();
  const lost = new Set();
  for (let k = 1; k < BLOCK.floors; k += 1) {
    for (let i = 1; i < BLOCK.n; i += 1) {
      if (r.chance(0.3)) {
        parts.add(`${i},${k}`);
      }
    }
    for (let i = 0; i < BLOCK.n; i += 1) {
      if (r.chance(0.08)) {
        lost.add(`${i},${k}`);
      }
    }
  }
  /* The strafe down the second floor's balconies is kept clear end to end,
   * and the bridge from the annex comes in over bay 11's balustrade. */
  for (let i = 1; i < BLOCK.n; i += 1) {
    parts.delete(`${i},1`);
  }
  lost.add('11,1');
  return { parts, lost };
}
export const BALCONIES = rollBalconies();

export function danchi(T) {
  const B = BLOCK;
  const r = rng(0xda7c41);
  const top = (k) => k * B.fh;

  /* COLUMNS, on both lines, from the ground to the roof; at the collapse
   * the top floor's are stumps with their bars out. */
  for (let i = 0; i <= B.n; i += 1) {
    const x = bayX(i);
    for (const y of [B.yS, B.yN]) {
      let h1 = B.roof;
      if (i === 11 || i === 12) {
        h1 = i === 11 ? 13.4 : 13.9;
      }
      T.box('hkFrame', x - B.col / 2, y - B.col / 2, 0, x + B.col / 2, y + B.col / 2, h1, { name: 'column' });
      if (h1 < B.roof) {
        T.dress(() => {
          for (let b = 0; b < 4; b += 1) {
            const ox = b % 2 ? 0.18 : -0.18;
            const oy = b < 2 ? 0.18 : -0.18;
            T.cyl('bandoRebar', [x + ox, y + oy, h1 - 0.05], [x + ox * 1.6, y + oy * 1.4, h1 + r.range(0.5, 1.1)], 0.016, 3, null, true);
          }
        });
      }
    }
  }

  /* SLABS, with their holes, and the beams under them. The slab covers the
   * balcony and the corridor too: one plate from front to back. */
  for (let k = 1; k <= B.floors; k += 1) {
    const h = top(k);
    const hs = FLOOR_HOLES.filter((q) => q.k === k);
    slab(T, k === B.floors ? 'hkFelt' : 'slab', B.x0, B.yB, B.x1, B.yC, h - B.slab, h, hs, { name: k === B.floors ? 'roof' : 'floor' });
    for (const q of hs) {
      if (q.rebar) {
        T.dress(() => {
          rebar(T, q.x0, q.y0, q.x1, q.y0, h - 0.12, 0, 1, r);
          rebar(T, q.x0, q.y1, q.x1, q.y1, h - 0.12, 0, -1, r);
          rebar(T, q.x0, q.y0, q.x0, q.y1, h - 0.12, 1, 0, r);
          rebar(T, q.x1, q.y0, q.x1, q.y1, h - 0.12, -1, 0, r);
        });
      }
    }
    /* Beams: along both column lines and across at every column, except
     * where the roof is gone. */
    const roofGone = (x) => k === B.floors && x >= bayX(COLLAPSE[0]) - 0.01;
    for (const y of [B.yS, B.yN]) {
      const x1 = k === B.floors ? bayX(COLLAPSE[0]) : B.x1;
      T.box('hkFrame', B.x0, y - 0.2, h - B.slab - B.beam, x1, y + 0.2, h - B.slab, { name: 'beam' });
    }
    for (let i = 0; i <= B.n; i += 1) {
      const x = bayX(i);
      if (roofGone(x) || (k === 4 && i === 12)) {
        continue;
      }
      T.box('hkFrame', x - 0.2, B.yS, h - B.slab - B.beam, x + 0.2, B.yN, h - B.slab, { name: 'beam' });
    }
    /* The slab edges, painted the band colour the estate wore. */
    T.wide(() => T.dress(() => {
      T.paint('hkBand', B.x0, B.yB - 0.02, h - B.slab, k === B.floors ? bayX(COLLAPSE[0]) : B.x1, B.yB, h);
      T.paint('hkBand', B.x0, B.yC, h - B.slab, k === B.floors ? bayX(COLLAPSE[0]) : B.x1, B.yC + 0.02, h);
    }));
  }

  /* THE TOP FLOOR'S FLOOR AT THE EAST END, come down onto the floor under
   * it: hinged at the west where it tore, lying on the fourth floor at the
   * gable. */
  sloped(T, 'slab', 'x', bayX(11) + 0.35, BLOCK.x1 - 0.3, 12.0, 9.0 + 0.27, 100.5, 107.5, 0.25, 5);
  T.dress(() => {
    rebar(T, bayX(11) + 0.3, 100.5, bayX(11) + 0.3, 107.5, 11.85, 1, 0, r);
    /* Rubble where it lies. */
    for (let n = 0; n < 9; n += 1) {
      const x = r.range(bayX(11) + 3.8, B.x1 - 0.5);
      const y = r.range(100.6, 107.4);
      const s = r.range(0.25, 0.6);
      T.deco('rubble', x - s, y - s * 0.7, 9.0, x + s, y + s * 0.7, 9.0 + s * 0.6);
    }
  });

  /* WALLS, flat by flat. */
  for (let k = 0; k < B.floors; k += 1) {
    const h = top(k);
    const ceil = h + B.fh - B.slab;
    for (let i = 0; i < B.n; i += 1) {
      const w = WALLS[`${i},${k}`];
      const xa = bayX(i) + B.col / 2;
      const xb = bayX(i + 1) - B.col / 2;
      const xm = (xa + xb) / 2;
      /* The south wall: the sliding doors' opening, or shut behind its
       * storm shutters, or gone with its frame. */
      if (w.south === 'open' || w.south === 'shut') {
        const hole = { from: xm - 1.8, to: xm + 1.8, h0: h + (k === 0 ? 0 : 0.05), h1: h + 2.05 };
        wall(T, 'hkRender', 'x', B.yS, 0.2, xa, xb, h, ceil, w.south === 'open' ? [hole] : [], { name: 'wall' });
        T.dress(() => T.wide(() => {
          /* The frame's head and the sill, left behind. */
          T.deco('hkSash', hole.from, B.yS - 0.13, hole.h1 - 0.06, hole.to, B.yS - 0.1, hole.h1);
          if (w.south === 'shut') {
            /* The shutters: three panels, a little proud of the wall. */
            for (let s = 0; s < 3; s += 1) {
              T.paint('sheet', hole.from + s * 1.2 + 0.02, B.yS - 0.13, hole.h0 + 0.02, hole.from + (s + 1) * 1.2 - 0.02, B.yS - 0.1, hole.h1 - 0.08);
            }
          }
          /* Rain streaks under the opening's corners. */
          T.paint('hkStreak', hole.from + 0.1, B.yS - 0.115, h + 0.1, hole.from + 0.22, B.yS - 0.1, hole.h0 + (k === 0 ? 0.3 : 0.02));
        }));
      }
      /* The corridor wall: a steel door shut in its frame and a kitchen
       * window beside it, or the door and the wall round it smashed
       * through to a hole a quad can take. On the ground floor the
       * corridor is the path, so the same wall faces the bicycles. */
      if (w.north === 'door' || w.north === 'smashed') {
        const win = { from: xm + 0.3, to: xm + 1.9, h0: h + 0.8, h1: h + 2.2 };
        const smash = { from: xa + 0.4, to: xa + 2.6, h0: h, h1: h + 2.1 };
        const hs = w.grille ? [] : [win];
        if (w.north === 'smashed') {
          hs.push(smash);
        }
        wall(T, 'hkRender', 'x', B.yN, 0.2, xa, xb, h, ceil, hs, { name: 'wall' });
        T.dress(() => T.wide(() => {
          const yo = B.yN + 0.1;
          if (w.north === 'door') {
            /* The door, its frame and its post slot and meter box. */
            T.paint(r.pick(['hkDoorGreen', 'hkDoorBlue', 'hkDoorBrown']), xa + 0.7, yo, h + 0.02, xa + 1.6, yo + 0.03, h + 1.95);
            T.paint('hkSash', xa + 0.64, yo, h + 1.95, xa + 1.66, yo + 0.04, h + 2.02);
            T.deco('metal', xa + 1.75, yo, h + 1.3, xa + 2.15, yo + 0.12, h + 1.75);
          }
          /* The window's frame, and on the grilled ones the grille: its
           * bars drawn, its solid the wall behind it. */
          T.paint('hkSash', win.from - 0.05, yo, win.h0 - 0.06, win.to + 0.05, yo + 0.04, win.h0);
          if (w.grille) {
            T.paint('hkDark', win.from, yo - 0.005, win.h0, win.to, yo + 0.005, win.h1);
            for (let b = 0; b <= 6; b += 1) {
              const bx = win.from + 0.05 + b * 0.25;
              T.deco('metal', bx - 0.015, yo + 0.04, win.h0, bx + 0.015, yo + 0.07, win.h1);
            }
            T.deco('metal', win.from, yo + 0.04, win.h1 - 0.04, win.to, yo + 0.08, win.h1);
          }
          T.paint('hkStreak', win.from + 0.2, yo, win.h0 - 0.9, win.from + 0.3, yo + 0.015, win.h0 - 0.06);
        }));
      }
      /* The party wall to the east, under the column line. */
      if (i < B.n - 1 && w.party !== 'gone') {
        const xp = bayX(i + 1);
        const hs = w.party === 'holed' ? [{ from: 103, to: 105.2, h0: h, h1: h + 2.05 }] : [];
        wall(T, 'hkWallpaper', 'y', xp, 0.2, B.yS + 0.3, B.yN - 0.3, h, ceil, hs, { name: 'party wall' });
        if (w.party === 'holed') {
          T.dress(() => rebar(T, xp, 103, xp, 105.2, h + 2.05, 0, 0.0001, r, 0.4));
        }
      }
    }
  }

  /* THE GABLES, full height, each with the block's number painted on it
   * big enough to read from the far side of the estate. The east one's top
   * storey is broken open where the floor came down. */
  wall(T, 'hkRender', 'y', B.x0 - 0.1, 0.25, B.yB, B.yC, 0, B.roof + B.parapet, [], { name: 'gable' });
  wall(T, 'hkRender', 'y', B.x1 + 0.1, 0.25, B.yB, B.yC, 0, B.roof + B.parapet, [{ from: 100.8, to: 106.6, h0: 12.6, h1: 16.2 }], { name: 'gable' });
  T.sign('gable1', B.x0 - 0.23, 104.25, 10.6, 4.4, 6.2, 'w');
  T.sign('gable1', B.x1 + 0.23, 104.25, 7.4, 4.4, 6.2, 'e');

  /* BALCONIES: the balustrades and the partitions between neighbours. */
  for (let k = 1; k < B.floors; k += 1) {
    const h = top(k);
    for (let i = 0; i < B.n; i += 1) {
      if (BALCONIES.lost.has(`${i},${k}`)) {
        continue;
      }
      T.box('hkRender', bayX(i), B.yB, h, bayX(i + 1), B.yB + 0.2, h + B.parapet, { name: 'balustrade' });
      T.dress(() => T.wide(() => {
        T.paint('hkBand', bayX(i), B.yB - 0.015, h + B.parapet - 0.12, bayX(i + 1), B.yB, h + B.parapet);
        T.paint('hkStreak', bayX(i) + 0.8, B.yB - 0.012, h - 1.0, bayX(i) + 0.95, B.yB, h - B.slab);
        T.paint('hkStreak', bayX(i) + 4.1, B.yB - 0.012, h - 0.7, bayX(i) + 4.22, B.yB, h - B.slab);
      }));
    }
    for (let i = 1; i < B.n; i += 1) {
      if (BALCONIES.parts.has(`${i},${k}`)) {
        T.box('sheet', bayX(i) - 0.04, B.yB + 0.2, h, bayX(i) + 0.04, B.yS - B.col / 2, h + B.fh - B.slab, { name: 'balcony partition' });
      }
    }
  }

  /* CORRIDOR PARAPETS, open where a stair tower meets the corridor, and
   * the roof's parapet round its edge where the roof still is. */
  const towerOpen = STAIRS.map((s) => [s.x, s.x + TOWER.w]);
  for (let k = 1; k < B.floors; k += 1) {
    const h = top(k);
    const cuts = towerOpen.map(([a, b]) => ({ from: a, to: b, h0: h - 1, h1: h + 2 }));
    wall(T, 'hkRender', 'x', B.yC - 0.1, 0.2, B.x0, B.x1, h, h + B.parapet, cuts, { name: 'corridor parapet' });
    T.dress(() => T.wide(() => {
      for (const [a, b] of [[B.x0, towerOpen[0][0]], [towerOpen[0][1], towerOpen[1][0]], [towerOpen[1][1], B.x1]]) {
        T.cyl('hkRust', [a, B.yC - 0.1, h + B.parapet + 0.05], [b, B.yC - 0.1, h + B.parapet + 0.05], 0.03, 4, null, true);
        T.paint('hkBand', a, B.yC, h + B.parapet - 0.12, b, B.yC + 0.015, h + B.parapet);
      }
    }));
  }
  const roofEnd = bayX(COLLAPSE[0]);
  T.box('hkRender', B.x0, B.yB, B.roof, roofEnd, B.yB + 0.2, B.roof + B.parapet, { name: 'roof parapet' });
  T.box('hkRender', B.x0, B.yC - 0.2, B.roof, roofEnd, B.yC, B.roof + B.parapet, { name: 'roof parapet' });
  /* The roof's own furniture: a vent stack a bay, aerials on their masts,
   * the drains, a lightning rod at each end. */
  T.dress(() => {
    for (let i = 0; i < COLLAPSE[0]; i += 1) {
      if (i === DROP_BAY) {
        continue;
      }
      const x = bayX(i) + 3;
      T.cyl('metal', [x + 1.6, 104.8, B.roof], [x + 1.6, 104.8, B.roof + 0.8], 0.06, 6);
      T.cyl('metalDark', [x + 1.6, 104.8, B.roof + 0.8], [x + 1.6, 104.8, B.roof + 0.86], 0.1, 6);
      if (i % 2 === 0) {
        T.cyl('metal', [x - 1.5, 106.8, B.roof], [x - 1.5, 106.8, B.roof + 2.6], 0.025, 4);
        for (let a = 0; a < 4; a += 1) {
          const hz = B.roof + 1.7 + a * 0.25;
          T.cyl('metal', [x - 2.1 + a * 0.1, 106.8, hz], [x - 0.9 - a * 0.1, 106.8, hz], 0.01, 3);
        }
      }
    }
    for (const x of [B.x0 + 0.4, roofEnd - 0.4]) {
      T.cyl('metal', [x, B.yB + 0.3, B.roof + B.parapet], [x, B.yB + 0.3, B.roof + 3.2], 0.015, 3);
    }
  });

  stairTowers(T, r);
}

/*
 * THE STAIR TOWERS, off the corridor at each end, open on their north face
 * above a balustrade at every half landing. Two flights a storey side by
 * side with the well between them, 2.5 by 3.4 m clear from the ground to
 * the top: the west tower's head has fallen in, so its well is open to the
 * sky; the east one keeps its penthouse.
 */
function stairTowers(T, r) {
  const B = BLOCK;
  const { y0, y1, w, land } = TOWER;
  const fl = 1.45;
  for (const s of STAIRS) {
    const x0 = s.x;
    const x1 = s.x + w;
    const headTop = s.open ? B.roof + B.parapet : B.roof + 2.8;
    /* The side walls, closed, with a strip of the patterned block a stair
     * of the day was screened with set in each. */
    for (const xw of [x0 + 0.1, x1 - 0.1]) {
      wall(T, 'hkRender', 'y', xw, 0.2, y0, y1, 0, headTop, [], { name: 'stair wall' });
      T.dress(() => T.wide(() => {
        const out = xw < (x0 + x1) / 2 ? -0.11 : 0.11;
        for (let h = 1.2; h < headTop - 1; h += 0.42) {
          for (let c = 0; c < 4; c += 1) {
            const cy = y0 + 2.2 + c * 0.42;
            T.paint('hkRenderShade', xw + out - 0.005, cy, h, xw + out + 0.005, cy + 0.3, h + 0.3);
          }
        }
      }));
    }
    /* Floor landings at each floor, on the corridor side; half landings on
     * the north side, half a storey up; the north balustrade at each half
     * landing. */
    for (let k = 1; k <= B.floors; k += 1) {
      const h = k * B.fh;
      T.box('slab', x0 + 0.2, y0, h - 0.2, x1 - 0.2, y0 + land, h, { name: 'stair landing' });
    }
    for (let k = 0; k < B.floors; k += 1) {
      const h = k * B.fh + B.fh / 2;
      T.box('slab', x0 + 0.2, y1 - land, h - 0.2, x1 - 0.2, y1, h, { name: 'half landing' });
      T.box('hkRender', x0 + 0.2, y1 - 0.2, h, x1 - 0.2, y1, h + 1.1, { name: 'stair balustrade' });
      /* The flights: up north from the floor, up south to the next. */
      const run = y1 - land - (y0 + land);
      flight(T, 'concreteWorn', 'y+', y0 + land, run, x0 + 0.2, x0 + 0.2 + fl, k * B.fh, h, 10);
      flight(T, 'concreteWorn', 'y-', y1 - land, run, x1 - 0.2 - fl, x1 - 0.2, h, (k + 1) * B.fh, 10);
      /* The balustrades on the well's side of each flight, sloped with it. */
      sloped(T, 'hkRender', 'y', y0 + land, y1 - land, k * B.fh + 1.0, h + 1.0, x0 + 0.2 + fl, x0 + 0.35 + fl, 1.2, 3, true, 'stair balustrade');
      sloped(T, 'hkRender', 'y', y1 - land, y0 + land, h + 1.0, (k + 1) * B.fh + 1.0, x1 - 0.35 - fl, x1 - 0.2 - fl, 1.2, 3, true, 'stair balustrade');
    }
    /* The corner columns. */
    for (const [cx, cy] of [[x0 + 0.25, y1 - 0.25], [x1 - 0.25, y1 - 0.25]]) {
      T.box('hkFrame', cx - 0.25, cy - 0.25, 0, cx + 0.25, cy + 0.25, headTop, { name: 'stair column' });
    }
    if (s.open) {
      /* Its head fallen in: the stumps of the penthouse walls and the bars
       * out of them. */
      T.dress(() => {
        rebar(T, x0 + 0.2, y0, x0 + 0.2, y1, headTop, 0.4, 0, r, 0.4);
        rebar(T, x1 - 0.2, y0, x1 - 0.2, y1, headTop, -0.4, 0, r, 0.4);
      });
    } else {
      /* The penthouse: its north wall, its door onto the roof long gone,
       * its roof and the water's overflow pipe off it. */
      T.box('hkRender', x0 + 0.2, y1 - 0.2, B.roof + 1.1, x1 - 0.2, y1, headTop, { name: 'penthouse' });
      T.box('slab', x0, y0 - 0.3, headTop - 0.2, x1, y1, headTop, { name: 'penthouse roof' });
      T.dress(() => T.cyl('metal', [x0 + 1, y1 + 0.05, headTop - 0.3], [x0 + 1, y1 + 0.05, 0.3], 0.04, 5));
    }
    /* The tower's lamp at each landing, dead. */
    T.dress(() => {
      for (let k = 1; k < B.floors; k += 1) {
        T.deco('metal', x0 + 2.7, y0 + 0.4, k * B.fh + 2.55, x0 + 3.3, y0 + 0.7, k * B.fh + 2.75);
      }
    });
  }
}

/* The named gaps this block gives (./plan.js lists them all). */
export function danchiGaps() {
  const M = 0.3;
  const B = BLOCK;
  const drop = bayX(DROP_BAY) + B.bay / 2;
  const pil = bayX(PILOTIS_BAY) + B.bay / 2;
  const west = STAIRS[0];
  return {
    drop: { name: 'THE DROP', px: drop, py: B.yS, deg: 270, w: 3.6 - 2 * M, h0: M, h1: 2.05 - M, points: 2500 },
    pilotis: { name: 'THE PILOTIS', px: pil, py: B.yS, deg: 90, w: B.bay - B.col - 2 * M, h0: M, h1: B.fh - B.slab - B.beam - M, points: 250 },
    corridor: { name: 'THE CORRIDOR', px: bayX(5) + 3, py: (B.yN + 0.1 + B.yC - 0.2) / 2, deg: 0, w: (B.yC - 0.2) - (B.yN + 0.1) - 2 * M, h0: 2 * B.fh + M, h1: 3 * B.fh - B.slab - M, points: 500 },
    stairwell: { name: 'THE STAIRWELL', px: west.x + TOWER.w / 2, py: TOWER.y0 + TOWER.land, deg: 270, w: TOWER.w - 0.4 - 2 * 1.45 - 0.3 - 2 * M, h0: M, h1: B.fh - 0.2 - M, points: 1000 },
    balcony: { name: 'THE BALCONIES', px: bayX(6), py: (B.yB + 0.2 + B.yS - B.col / 2) / 2, deg: 0, w: (B.yS - B.col / 2) - (B.yB + 0.2) - 2 * M, h0: B.fh + B.parapet + M, h1: 2 * B.fh - B.slab - M, points: 500 },
  };
}
