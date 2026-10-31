/*
 * yokocho.js: the old lanes, between the railway viaduct and the
 * expressway, under the towers. After the drinking lanes that survived
 * beside the big stations (Omoide Yokocho by Shinjuku's tracks is about
 * sixty bars on lanes two to three metres wide, two storeys of timber and
 * tin, built from the late 1940s): four lanes east to west and one across
 * them, each lined both sides with two storey shacks three and a half to
 * four and a half metres wide, their counters open to the lane under a
 * noren, red and white lanterns at the door, a blade sign, an air
 * conditioner hung on the upper floor, crates of bottles stacked outside,
 * and a tangle of cables over the lane.
 *
 * A lane is 2.6 m clear between the shacks' fronts to 3 m up, which is the
 * line to fly: everything that hangs into it (lanterns, signs, cables) is
 * above that or flat to a wall.
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

import { block, RAIL } from './streets.js';
import { rng } from './frame.js';

const B = block(1, 0);
export const LANE_W = 2.6;
export const LANES = [B.y0 + 14, B.y0 + 36, B.y0 + 58, B.y0 + 80];
export const CROSS = { px: (B.x0 + B.x1) / 2, w: 2.4 };
const DEPTH = 6.2;
const FLOOR1 = 3.1;
const FLOOR2 = 2.7;

const WALLS = ['twWood', 'twPlaster', 'twWoodDark', 'twPlaster', 'wallTea', 'twWood'];
const ROOFS = ['twTin', 'twTinRust', 'twTinBlue', 'twTin'];
const FASCIAS = ['ramen', 'kokuya', 'sozai', 'bento', 'conbini', 'record', 'denki', 'zakka'];
const NOREN = ['ramen', 'soba', 'wagashi', 'sento', 'bento', 'record'];

/*
 * One shack, its front on the lane at `front` (a plan y), facing `dir`
 * (+1 north, -1 south), from x0 to x1 along the lane. Solid as two boxes,
 * the ground floor and the upper one, which oversails the lane by 0.3 m.
 */
function shack(T, x0, x1, front, dir, r) {
  const back = front - dir * DEPTH;
  const [ya, yb] = dir > 0 ? [back, front] : [front, back];
  const wall = r.pick(WALLS);
  const h1 = FLOOR1;
  const h2 = FLOOR1 + FLOOR2 + r.range(-0.2, 0.4);
  T.box(wall, x0 + 0.05, ya, 0, x1 - 0.05, yb, h1, { name: 'shack' });
  const over = 0.3 * dir;
  const [ua, ub] = dir > 0 ? [ya, yb + over] : [ya + over, yb];
  T.box(r.pick(WALLS), x0 + 0.05, ua, h1, x1 - 0.05, ub, h2, { name: 'shack upper' });
  /* The tin roof, a shallow slope down to the lane, its edge solid. */
  const roof = r.pick(ROOFS);
  const edge = front + over + dir * 0.35;
  T.prism(roof, 'x', dir > 0 ? [[back, h2 + 0.7], [edge, h2 + 0.05], [edge, h2], [back, h2]] : [[edge, h2 + 0.05], [back, h2 + 0.7], [back, h2], [edge, h2]], x0, x1);
  T.box(roof, x0, Math.min(back, edge), h2, x1, Math.max(back, edge), h2 + 0.3, { draw: false, name: 'shack roof' });
  const mid = (x0 + x1) / 2;
  const face = dir > 0 ? 'n' : 's';
  const fy = front + dir * 0.012;
  /* The front, all of it fine: the counter's opening, its noren, the
   * fascia board over it, the lanterns, the blade sign, the unit. */
  T.dress(() => T.wide(() => {
    const lo = Math.min(fy, fy + dir * 0.01);
    T.paint('glassLit', x0 + 0.4, lo, 0.9, x1 - 0.4, lo + 0.01, 2.5);
    T.paint('twWoodDark', x0 + 0.3, lo + dir * 0.01, 0.82, x1 - 0.3, lo + dir * 0.01 + 0.01, 0.92);
    T.plate('shopFascia', r.pick(FASCIAS), mid, front + dir * 0.03, h1 - 0.3, (x1 - x0) - 0.4, 0.5, face);
    if (r.chance(0.75)) {
      T.plate('norenTex', r.pick(NOREN), mid, front + dir * 0.05, 2.15, Math.min(2.2, x1 - x0 - 1), 0.7, face);
    }
    /* Upper floor windows, a frosted pane or two. */
    const wy = front + over + dir * 0.012;
    const wlo = Math.min(wy, wy + dir * 0.01);
    T.paint(r.chance(0.5) ? 'curtainCream' : 'glassDark', mid - 0.9, wlo, h1 + 0.7, mid + 0.9, wlo + 0.01, h1 + 1.9);
    T.paint('twWoodDark', mid - 1.0, wlo, h1 + 0.62, mid + 1.0, wlo + 0.01, h1 + 0.7);
  }));
  T.dress(() => {
    /* Red lanterns either side of the door, flat to the wall. */
    for (const lx of [x0 + 0.45, x1 - 0.45]) {
      if (r.chance(0.7)) {
        T.cyl(r.chance(0.7) ? 'twLanternRed' : 'twLantern', [lx, front + dir * 0.28, 2.0], [lx, front + dir * 0.28, 2.75], 0.24, 8);
        T.cyl('twBlack', [lx, front + dir * 0.28, 2.75], [lx, front + dir * 0.28, 2.82], 0.18, 8);
      }
    }
    /* An air conditioner on the upper floor, its pipe down the wall. */
    if (r.chance(0.6)) {
      const ax = r.chance(0.5) ? x0 + 0.8 : x1 - 0.8;
      const ay = front + over + dir * 0.25;
      T.box('acUnit', ax - 0.4, ay - 0.15, h1 + 0.3, ax + 0.4, ay + 0.15, h1 + 0.9);
      T.cyl('white', [ax + 0.3, ay, h1 + 0.3], [ax + 0.3, ay, 0.4], 0.03, 4);
    }
    /* Crates of bottles stacked by the door. */
    if (r.chance(0.45)) {
      const cx = r.chance(0.5) ? x0 + 0.5 : x1 - 0.5;
      const cy = front + dir * 0.35;
      for (let k = 0; k < r.int(1, 3); k += 1) {
        T.box(r.chance(0.5) ? 'twCrate' : 'twCrateRed', cx - 0.25, cy - 0.2, k * 0.3, cx + 0.25, cy + 0.2, k * 0.3 + 0.28);
      }
    }
    /* A beer keg. */
    if (r.chance(0.2)) {
      T.cyl('metal', [mid + 0.8, front + dir * 0.35, 0], [mid + 0.8, front + dir * 0.35, 0.55], 0.2, 8);
    }
  });
  /* A blade sign on the upper floor, out into the lane above the line. */
  if (r.chance(0.35)) {
    const bx = r.chance(0.5) ? x0 + 0.2 : x1 - 0.2;
    T.dress(() => {
      T.box('twWoodDark', bx - 0.05, front + over, h1 + 0.4, bx + 0.05, front + over + dir * 0.75, h1 + 2.0);
    });
    T.plate('shopBlade', r.pick(['ramen', 'sozai', 'kokuya', 'bento']), bx + 0.06, front + over + dir * 0.4, h1 + 1.2, 0.7, 1.6, 'e');
    T.plate('shopBlade', r.pick(['ramen', 'sozai', 'kokuya', 'bento']), bx - 0.06, front + over + dir * 0.4, h1 + 1.2, 0.7, 1.6, 'w');
  }
}

/* A row of shacks along a lane's side, from x0 to x1, broken at the cross
 * lane. */
function row(T, x0, x1, front, dir, seed) {
  const r = rng(seed);
  let x = x0;
  while (x < x1 - 2.5) {
    let w = r.range(3.4, 4.6);
    if (x + w > x1 - 2.5) {
      w = x1 - x;
    }
    if (x < CROSS.px + CROSS.w / 2 && x + w > CROSS.px - CROSS.w / 2) {
      const cut = CROSS.px - CROSS.w / 2;
      if (cut - x > 2.5) {
        shack(T, x, cut, front, dir, r);
      }
      x = CROSS.px + CROSS.w / 2;
      continue;
    }
    shack(T, x, x + w, front, dir, r);
    x += w;
  }
}

/* The cables over a lane: from the eaves on one side to the other, sagging,
 * every few metres, with a festoon of small lanterns on some. */
function cables(T, y, seed) {
  const r = rng(seed);
  const hw = LANE_W / 2 + 0.3;
  for (let x = B.x0 + 3; x < B.x1 - 3; x += r.range(3, 6)) {
    T.wire('rope', [x, y - hw, FLOOR1 + 2.2 + r.range(0, 0.5)], [x + r.range(-2, 2), y + hw, FLOOR1 + 2.0 + r.range(0, 0.5)], 0.25, 0.015);
  }
  for (let k = 0; k < 2; k += 1) {
    const xa = B.x0 + 6 + r.range(0, B.x1 - B.x0 - 30);
    const h = FLOOR1 + 1.6;
    T.wire('rope', [xa, y, h], [xa + 22, y, h], 0.35, 0.012);
    T.dress(() => {
      for (let i = 1; i < 11; i += 1) {
        const t = i / 11;
        const sag = 4 * 0.35 * t * (1 - t);
        T.bead(i % 2 ? 'twLanternRed' : 'twLantern', xa + 22 * t, y, h - sag - 0.2, 0.13);
      }
    });
  }
}

export function yokocho(T) {
  /* The ground: worn asphalt in the lanes, the whole block's floor. */
  T.paint('twRoadDark', B.x0, B.y0 - 2, 0, B.x1, B.y1, 0.025);
  LANES.forEach((y, i) => {
    const s = LANE_W / 2;
    row(T, B.x0 + 1, B.x1 - 1, y - s, -1, 101 + i * 13);
    row(T, B.x0 + 1, B.x1 - 1, y + s, 1, 211 + i * 17);
    cables(T, y, 307 + i * 11);
    T.dress(() => T.wide(() => {
      /* A gutter line down the middle of the lane. */
      T.paint('twCurb', B.x0, y - 0.12, 0.025, B.x1, y + 0.12, 0.032);
    }));
  });
  /* Back walls between back to back rows: a lane's worth of service alley,
   * walled at each end so the backs are a maze of their own. */
  for (let i = 0; i + 1 < LANES.length; i += 1) {
    const a = LANES[i] + LANE_W / 2 + DEPTH;
    const b = LANES[i + 1] - LANE_W / 2 - DEPTH;
    if (b - a < 2) {
      continue;
    }
    T.dress(() => {
      const r = rng(401 + i);
      for (let x = B.x0 + 4; x < B.x1 - 4; x += r.range(4, 8)) {
        if (Math.abs(x - CROSS.px) < 3) {
          continue;
        }
        T.box('acUnit', x - 0.4, a + 0.05, 0, x + 0.4, a + 0.45, 0.6);
        T.cyl('twTin', [x + 1.2, a + 0.3, 0], [x + 1.2, a + 0.3, 0.7], 0.25, 8);
        if (r.chance(0.5)) {
          T.cyl('white', [x, b - 0.1, 0.5], [x, b - 0.1, 5.4], 0.05, 4);
        }
      }
    });
  }
  /* The lanes' gate arches at the west and east ends of each lane: two
   * posts and a lit sign board over the lane, high enough to fly under. */
  LANES.forEach((y) => {
    for (const x of [B.x0 + 0.6, B.x1 - 0.6]) {
      for (const s of [-1, 1]) {
        T.post('twBlack', x, y + s * (LANE_W / 2 - 0.12), 0, 4.2, 0.09, { name: 'lane gate post' });
      }
      T.box('twBlack', x - 0.12, y - LANE_W / 2, 3.6, x + 0.12, y + LANE_W / 2, 4.3, { name: 'lane gate sign' });
      T.plate('alleyPlate', 0, x + (x < CROSS.px ? -0.14 : 0.14), y, 3.95, LANE_W - 0.2, 0.6, x < CROSS.px ? 'w' : 'e');
    }
  });
  /* The utility poles at the lanes' ends, on the pavements, wired by the
   * kit as the town's are: in ./yard.js. */
  void RAIL;
}

/* Where ./yard.js stands a utility pole: the lanes' ends. */
export const POLES = LANES.flatMap((y) => [[B.x0 - 2.5, y + 2.2], [B.x1 + 2.5, y + 2.2]]);
export const BOUNDS = B;
