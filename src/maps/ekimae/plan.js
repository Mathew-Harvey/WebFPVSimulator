/*
 * plan.js: Ekimae Drift, the place. Pure: no Three.js, so its solids, its
 * paint, its zones and its gaps load in Node (scripts/ekimae-check.js) as
 * they do in the browser, and the two cannot disagree about where a wall is.
 *
 * WHAT IT IS. A street drift event in the station district of a Japanese
 * harbour town at golden hour, the streets closed off and lined with
 * barriers for a day, the drift cars battling round four city blocks in
 * tandem: the owner's ask of 31 October 2026, a city map with drift cars
 * to chase, in the manga look of the town. It is built from the kind of
 * place, never from another game's map:
 *
 *   - D1 Grand Prix ran its Tokyo rounds on a course laid out in a car
 *     park at Odaiba, a bayside district under an expressway, and street
 *     drift exhibitions close city streets the same way: concrete blocks,
 *     catch fence, the crowd behind it on the pavements and footbridges.
 *   - THE EXPRESSWAY is an elevated urban expressway of the Tokyo and
 *     Osaka kind: a deck about ten metres up on T piers in the median of
 *     the street below, a noise wall on each edge, lamp posts and a green
 *     direction gantry on top.
 *   - THE VIADUCT is a brick arch railway viaduct of the Meiji kind, like
 *     the line through Yurakucho, with bars and storerooms in its arches
 *     and steel spans where it crosses a street, and the station on it.
 *   - THE ROTARY is the taxi and bus turning circle every station front in
 *     Japan has, with a clock and a statue on its island.
 *   - THE STREETS are the town's: concrete poles strung with wires, drinks
 *     machines, a police box on the corner, a little shrine, a covered
 *     shopping street, a multi storey car park and a petrol station.
 *
 * THE SIZES are the real ones, and three are measured into the check
 * (scripts/ekimae-check.js): a lane of 3 m (Japan's road structure order
 * gives 2.75 to 3.5 m for an urban lane), so four lanes kerb to kerb is the
 * course's 12 m; a concrete utility pole of 10 m standing, the 12 m pole
 * with a sixth of it in the ground; and the narrow gauge train's car, 20 m
 * long and 2.95 m wide over the body, the standard commuter car. The town's
 * drinks machine, 1.83 m, comes in with the kit.
 *
 * THE FRAME is ./frame.js: every point here is written in the plan and
 * turned into the world once, in w(). Every box goes through Parts, so a
 * wall is drawn and solid from the same six numbers. A barrier along a bend
 * cannot be a box on the axes, so it is a capsule lying along the road
 * edge, solid and undrawn, under a drawn block turned onto it (./index.js).
 *
 * `fine` on a part or a decor item marks detail Low leaves out. Nothing fine
 * is solid, so the flight is the same on every preset.
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

import { Parts } from '../../props/parts.js';
import { pointAt, nearestOn } from '../built/road.js';
import {
  W, D, w, HALF, COURSE_NODES, courseLine, CHUNK_CUTS, rng,
} from './frame.js';

/* ------------------------------------------------------------------ */
/* The landmarks, in the plan                                          */
/* ------------------------------------------------------------------ */

/* The elevated expressway over the straight: its deck from y0 to y1, the
 * underside of its girders, the deck's soffit and its top, a pier in the
 * median every `every` metres, and the cap beam's underside. It runs out
 * past the plot both ways, into the fog. */
export const EXP = {
  y0: 36, y1: 64, girder: 9.0, soffit: 9.6, top: 11.2, wall: 2.0,
  x0: -70, x1: W + 70, pier0: 22, every: 36, pierY0: 42.6, pierY1: 49.4, cap0: 7.6, cap1: 9.0,
};

/* The south carriageway, the median and the shore road's own pavements. */
export const SOUTH = { y0: 30, y1: 42, walk0: 26 };

/* The railway viaduct, east to west across the plot, its deck's soffit
 * and its top, and the steel spans where it crosses the course. */
export const VIA = {
  y0: 144, y1: 156, soffit: 6.6, top: 7.6, x0: -60, x1: W + 60, bay: 12, pier: 2, lintel: 5.4,
  spans: [[301, 335], [205, 227]],
};

/* The station on the viaduct, and the concourse under it. */
export const STA = {
  x0: 104, x1: 196, y0: 138, y1: 162, platform: 8.7, canopy: 11.2, pass0: 140, pass1: 160, passH: 4.4,
};

/* The train standing at the south platform: four cars of 20 m. */
export const TRAIN = { x0: 110, cars: 4, len: 19.5, gap: 0.5, y: 146.6, half: 1.475, floor: 8.0, roof: 11.6 };

/* The bay of the viaduct left open, a passage of lanterns under the
 * tracks: a named gap, and the hidden Konex sign. */
export const ALLEY = { x0: 253, x1: 263 };

/* The multi storey car park at the start, west of the last hairpin. */
export const CP = {
  x0: 4, x1: 34, y0: 66, y1: 106, floor: 3.2, decks: 4, slab: 0.3, parapet: 1.0,
  cols: [4.3, 11.75, 19.25, 26.75, 33.7], rows: [66.3, 74.2, 82.1, 90.0, 97.9, 105.7],
};
CP.roof = CP.floor * CP.decks;

/* The petrol station inside the last hairpin. */
export const PS = { x0: 64, x1: 106, y0: 66, y1: 85, c0: 68, c1: 98, cy0: 69, cy1: 83, h0: 5.0, h1: 5.7, isl: [72.5, 79.5] };

/* The police box on turn one's inside corner, and its clipping post. */
export const KOBAN = { x0: 300, x1: 308, y0: 68, y1: 76, h: 6.2 };

/* The footbridge over the straight. */
export const FB = { x: 184, half: 1.3, y0: 27, y1: 70, deck0: 5.0, deck1: 5.4, rail: 6.5 };

/* The shrine on the back street: the torii, the path and the hall. */
export const SHRINE = { x: 131, y0: 98, y1: 127, torii: 100.5, toriiHalf: 1.6, toriiH: 3.4 };

/* The station's rotary island. */
export const ROTARY = { x: 137.4, y: 210, r: 6.2 };

/* The covered shopping street: east to west through the block north of
 * the viaduct, shops both sides, a roof over the lane. */
export const ARCADE = { x0: 222, x1: 316, y0: 184, y1: 192, roof0: 7.6, roof1: 8.2 };

/* ------------------------------------------------------------------ */
/* The builder                                                         */
/* ------------------------------------------------------------------ */

/* A plan box: x and y the plan's, h up. */
function pbox(T, m, x0, y0, h0, x1, y1, h1, opts = {}) {
  const a = w(x0, y0, h0);
  const b = w(x1, y1, h1);
  const p = T.P.box(m, a[0], a[1], a[2], b[0], b[1], b[2], opts.fine ? { ...opts, solid: false, cast: false } : opts);
  if (p && opts.fine) {
    p.fine = true;
  }
  return p;
}

/* A plan box split at the chunk cuts, so a long run is filed in pieces. */
function pboxCut(T, m, x0, y0, h0, x1, y1, h1, opts = {}) {
  const cuts = [x0, ...CHUNK_CUTS.filter((c) => c > x0 && c < x1), x1];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    pbox(T, m, cuts[i], y0, h0, cuts[i + 1], y1, h1, opts);
  }
}

function ppost(T, m, x, y, h0, h1, r, opts = {}) {
  const a = w(x, y, h0);
  const p = T.P.post(m, a[0], a[2], h0, h1, r, opts.fine ? { ...opts, solid: false, cast: false } : opts);
  if (p && opts.fine) {
    p.fine = true;
  }
  return p;
}

function pcap(T, m, a, b, r, opts = {}) {
  const p = T.P.cap(m, w(a[0], a[1], a[2]), w(b[0], b[1], b[2]), r, opts.fine ? { ...opts, solid: false, cast: false } : opts);
  if (p && opts.fine) {
    p.fine = true;
  }
  return p;
}

/* Paint: a slab a few centimetres thick on the ground, never solid. */
function paint(T, m, x0, y0, x1, y1, h = 0.02, fine = false) {
  return pbox(T, m, x0, y0, 0, x1, y1, h, { solid: false, cast: false, fine });
}

/* A sign on the atlas (./signs.js): `face` the way it looks, n s e w. */
function sign(T, key, x, y, h, wd, ht, face, lift = 0.03) {
  T.signs.push({ key, px: x, py: y, h, w: wd, ht, face, lift });
}

/* Where the course is: a plan point's distance from the centre line. */
function offCourse(T, x, y) {
  return nearestOn(T.line, x, y).d;
}

/* ------------------------------------------------------------------ */
/* The streets                                                         */
/* ------------------------------------------------------------------ */

/*
 * THE BLOCKS, each a slab of pale paving 15 cm proud of the street, its
 * kerb a darker band round the edge, and the streets between them the
 * plot's own tarmac. The course is drawn over it by the pipeline. A block
 * is paint, not solid: a kerb is under any gap a pilot could fly.
 */
export const BLOCKS = [
  /* south of the expressway, along the south carriageway */
  [0, 0, 400, SOUTH.y0],
  /* between the straight and the back street: the petrol station's and
   * the footbridge's block */
  [62, 62, 202, 86],
  /* the big block east of the manji, up to the viaduct */
  [226, 62, 316, VIA.y0],
  /* the shrine's block, between the back street and the viaduct */
  [62, 98, 182, VIA.y0],
  /* the car park's, west of the last hairpin */
  [0, 62, 38, VIA.y0],
  /* the station plaza north of the viaduct, round the rotary */
  [100, VIA.y1, 208, 186],
  /* west of the rotary */
  [0, VIA.y1, 112, 220],
  /* the arcade's block */
  [220, VIA.y1, 316, 220],
  /* east of the station road, the harbour side */
  [328, 62, 400, VIA.y0],
  [328, VIA.y1, 400, 220],
  /* north of the north street, the whole width */
  [0, 234, 316, D],
  [328, 234, 400, D],
  /* the island between the rotary's loop and the back of the manji */
  [130, 198, 208, 220],
];

function streets(T) {
  for (const [x0, y0, x1, y1] of BLOCKS) {
    paint(T, 'bldPaving', x0, y0, x1, y1, 0.15);
    /* The kerb: a darker band round the edge of the block. */
    paint(T, 'concreteMid', x0, y0, x1, y0 + 0.3, 0.16);
    paint(T, 'concreteMid', x0, y1 - 0.3, x1, y1, 0.16);
    paint(T, 'concreteMid', x0, y0, x0 + 0.3, y1, 0.16);
    paint(T, 'concreteMid', x1 - 0.3, y0, x1, y1, 0.16);
  }
  /* The median under the expressway's piers, raised and kerbed. */
  paint(T, 'concreteMid', -70, 42, W + 70, 50, 0.18);
  /* Lane lines on the streets the cars do not use: the south carriageway's
   * dashes, and the arms of turn one's crossing. */
  for (let x = 2; x < W; x += 10) {
    paint(T, 'lineWhite', x, 35.9, x + 5, 36.1, 0.03, true);
  }
  for (let y = 2; y < 30; y += 8) {
    paint(T, 'lineWhite', 321.9, y, 322.1, y + 4, 0.03, true);
  }
  for (let y = 236; y < D; y += 8) {
    paint(T, 'lineWhite', 321.9, y, 322.1, y + 4, 0.03, true);
  }
  for (let x = 332; x < W; x += 8) {
    paint(T, 'lineWhite', x, 55.9, x + 4, 56.1, 0.03, true);
  }
  for (let x = 2; x < 110; x += 8) {
    paint(T, 'lineWhite', x, 225.9, x + 4, 226.1, 0.03, true);
  }
  /*
   * TURN ONE IS A SCRAMBLE CROSSING: zebra stripes over all four arms and
   * both diagonals, the way the big crossings in front of a station are
   * painted. White bars half a metre wide, half a metre apart.
   */
  const zebra = (x0, y0, x1, y1, alongX) => {
    if (alongX) {
      for (let x = x0; x + 0.45 <= x1; x += 1.0) {
        paint(T, 'lineWhite', x, y0, x + 0.45, y1, 0.03);
      }
    } else {
      for (let y = y0; y + 0.45 <= y1; y += 1.0) {
        paint(T, 'lineWhite', x0, y, x1, y + 0.45, 0.03);
      }
    }
  };
  zebra(316, 42.5, 328, 46.5, true);
  zebra(316, 65.5, 328, 69.5, true);
  zebra(330.5, 50, 334.5, 62, false);
  zebra(309.5, 50, 313.5, 62, false);
  /* The diagonals, as a ladder of short bars stepping across. */
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8;
    const x = 314 + t * 15;
    const y = 48 + t * 15.5;
    paint(T, 'lineWhite', x - 0.5, y - 0.22, x + 0.5, y + 0.22, 0.031, true);
    paint(T, 'lineWhite', x - 0.5, 63.5 - t * 15.5 - 0.22, x + 0.5, 63.5 - t * 15.5 + 0.22, 0.031, true);
  }
  /* Crossings at the rotary and on the north street by the arcade. */
  zebra(100, 186.5, 104, 197.5, false);
  zebra(206, 186.5, 210, 197.5, false);
  zebra(222.5, 220, 226.5, 232, true);
  zebra(240, 220.2, 244, 231.8, true);
  /* Stop lines and the painted words, white on the arms. */
  paint(T, 'lineWhite', 316, 41.7, 322, 42.1, 0.03);
  paint(T, 'lineWhite', 322, 69.9, 328, 70.3, 0.03);
}

/* ------------------------------------------------------------------ */
/* The barriers and the course furniture                              */
/* ------------------------------------------------------------------ */

/* Which way the line bends at s: +1 left, -1 right, 0 straight. */
function bendAt(line, s) {
  const a = pointAt(line, s - 3);
  const b = pointAt(line, s + 3);
  const cross = a.tx * b.ty - a.ty * b.tx;
  return cross > 1e-3 ? 1 : (cross < -1e-3 ? -1 : 0);
}

/* A plan point `off` metres to the left (+) of the line at s. */
function beside(line, s, off) {
  const p = pointAt(line, s);
  return { x: p.x - p.ty * off, y: p.y + p.tx * off, tx: p.tx, ty: p.ty };
}

/* The arc length round the course of the point nearest a corner. */
function sAt(line, k) {
  const [x, y] = COURSE_NODES[k];
  return nearestOn(line, x, y).s;
}

/*
 * THE BARRIERS, both sides of the whole lap: the concrete blocks a street
 * course is lined with, 4 m each, on the kerb line, red and white on the
 * outside of every corner where a judge would call a zone. Each is a capsule
 * lying at its height (solid, not drawn) under a block turned onto it.
 * Where the course crosses a street the block is left out, so a quad can
 * fly the crossing low.
 */
const SEG = 4;
const OPEN = [
  /* turn one's crossing: the south arm and the east arm stay open */
  { x0: 312, x1: 336, y0: 38, y1: 74 },
  /* the north street's crossing at turn two */
  { x0: 312, x1: 336, y0: 214, y1: 240 },
];
function barriers(T) {
  const line = T.line;
  const corners = COURSE_NODES.map((_, k) => sAt(line, k));
  const nearCorner = (s) => corners.some((c) => {
    let d = Math.abs(c - s);
    d = Math.min(d, line.length - d);
    return d < 26;
  });
  const n = Math.floor(line.length / SEG);
  const step = line.length / n;
  for (let i = 0; i < n; i += 1) {
    const sa = i * step;
    const sb = sa + step;
    const sm = (sa + sb) / 2;
    const bend = bendAt(line, sm);
    for (const side of [1, -1]) {
      const pa = beside(line, sa, side * (HALF + 0.55));
      const pb = beside(line, sb, side * (HALF + 0.55));
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      if (OPEN.some((o) => mx > o.x0 && mx < o.x1 && my > o.y0 && my < o.y1)) {
        continue;
      }
      /* Inside a tight bend the two ends of a block meet the next one's
       * from the inside; the blocks are short enough not to cross. */
      const outside = bend !== 0 && side === -bend;
      const look = outside && nearCorner(sm) ? 'zone' : 'wall';
      T.walls.push({ a: [pa.x, pa.y], b: [pb.x, pb.y], look, i });
    }
  }
  for (const seg of T.walls) {
    pcap(T, 'concrete', [seg.a[0], seg.a[1], 0.45], [seg.b[0], seg.b[1], 0.45], 0.45, { draw: false, kind: 'wall', name: 'barrier' });
  }
}

/*
 * CATCH FENCE on the outside of the corners, a post every four metres just
 * behind the blocks, and the crowd behind it on the pavement. Each run is
 * the arc of a corner and a margin either side.
 */
const FENCED = [[1, 14, 12], [2, 12, 12], [3, 10, 6], [4, 6, 10], [5, 10, 10], [8, 10, 10], [9, 14, 12], [0, 12, 16]];
function fences(T) {
  const line = T.line;
  for (const [k, before, after] of FENCED) {
    const s0 = sAt(line, k) - before;
    const s1 = sAt(line, k) + after;
    let prev = null;
    let seat = 0;
    for (let s = s0; s <= s1; s += 4) {
      const ss = (s + line.length) % line.length;
      const bend = bendAt(line, ss);
      const side = bend ? -bend : (prev ? prev.side : -1);
      const q = beside(line, ss, (HALF + 1.6) * side);
      if (OPEN.some((o) => q.x > o.x0 && q.x < o.x1 && q.y > o.y0 && q.y < o.y1)) {
        prev = null;
        continue;
      }
      if (T.solidNear(q.x, q.y, 0.9)) {
        prev = null;
        continue;
      }
      ppost(T, 'metal', q.x, q.y, 0, 3.6, 0.05, { kind: 'pole', name: 'catch fence' });
      if (prev) {
        T.decor.push({ t: 'fence', a: [prev.x, prev.y], b: [q.x, q.y], h: 3.6 });
        /* The crowd: two rows on the pavement behind the fence. */
        for (let r = 0; r < 2; r += 1) {
          for (let j = 0; j < 3; j += 1) {
            seat += 1;
            if ((seat * 7) % 5 === 0) {
              continue;
            }
            const t = (j + 0.5) / 3;
            const off = (HALF + 2.4 + r * 0.8) * side;
            const p = beside(line, ss - 4 + t * 4, off);
            if (T.solidNear(p.x, p.y, 0.6) || offCourse(T, p.x, p.y) < HALF + 2) {
              continue;
            }
            T.decor.push(fan(p.x, p.y, 0.15, seat + r));
          }
        }
      }
      prev = { x: q.x, y: q.y, side };
    }
  }
}

export const SHIRTS = ['wallBlue', 'awning', 'white', 'craneYellow', 'containerTeal', 'drIndigo', 'bldClothPink', 'concreteDark'];
function fan(x, y, h, seat) {
  return {
    t: 'fan', x, y, h, fine: true,
    shirt: SHIRTS[(seat * 5) % SHIRTS.length],
    tall: 1.5 + ((seat * 13) % 5) * 0.06,
    cheer: (seat * 11) % 4 === 0,
  };
}

/* A row of people standing along a line at height h. */
function crowdLine(T, x0, y0, x1, y1, h, every, seed) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.floor(len / every));
  for (let i = 0; i <= n; i += 1) {
    if (((i + seed) * 7) % 6 === 0) {
      continue;
    }
    const t = i / n;
    T.decor.push(fan(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, h, i + seed));
  }
}

/* ------------------------------------------------------------------ */
/* The expressway                                                      */
/* ------------------------------------------------------------------ */

function expressway(T) {
  const { y0, y1, girder, soffit, top, wall, x0, x1 } = EXP;
  /* The deck: one slab, its two noise walls, and four steel box girders
   * under it, solid, so the soffit a quad meets is the girders'. */
  pboxCut(T, 'concreteMid', x0, y0, soffit, x1, y1, top, { name: 'expressway deck' });
  pboxCut(T, 'concrete', x0, y0, top, x1, y0 + 0.4, top + wall, { name: 'noise wall' });
  pboxCut(T, 'concrete', x0, y1 - 0.4, top, x1, y1, top + wall, { name: 'noise wall' });
  for (const gy of [39.5, 46.0, 52.5, 59.0]) {
    pboxCut(T, 'bridgeSteel', x0, gy - 0.6, girder, x1, gy + 0.6, soffit, { name: 'girder' });
  }
  /* The noise wall's clear upper panels and the cream band along its foot,
   * and the deck's painted lanes. */
  for (const [a, b] of [[y0 - 0.02, y0 + 0.42], [y1 - 0.42, y1 + 0.02]]) {
    pboxCut(T, 'glassBlue', x0, a, top + wall - 0.9, x1, b, top + wall - 0.1, { solid: false, cast: false, fine: true });
    pboxCut(T, 'white', x0, a, top + 0.15, x1, b, top + 0.35, { solid: false, cast: false, fine: true });
  }
  for (let x = x0 + 4; x < x1; x += 12) {
    for (const ly of [43, 50, 57]) {
      pbox(T, 'lineWhite', x, ly - 0.08, top, x + 6, ly + 0.08, top + 0.03, { solid: false, cast: false, fine: true });
    }
  }
  /* The fascia: a darker band down the deck's edges, where the town's ink
   * pass draws the expressway's line against the sky. */
  pboxCut(T, 'concreteDark', x0, y0 - 0.05, soffit, x1, y0, top, { solid: false, cast: false });
  pboxCut(T, 'concreteDark', x0, y1, soffit, x1, y1 + 0.05, top, { solid: false, cast: false });
  /*
   * THE PIERS, T shaped, in the median: a column of 2.6 by 6.8 m and a cap
   * beam across the whole deck under the girders. The cap beam is the low
   * bar over the course, 7.6 m up: a line under every one of them.
   */
  for (let x = EXP.pier0 - 3 * EXP.every; x <= x1; x += EXP.every) {
    pbox(T, 'concrete', x - 1.3, EXP.pierY0, 0, x + 1.3, EXP.pierY1, EXP.cap0, { name: 'expressway pier' });
    pbox(T, 'concrete', x - 1.2, y0 + 0.5, EXP.cap0, x + 1.2, y1 - 0.5, EXP.cap1, { name: 'cap beam' });
    /* The bearing plinths and the drain down the column, drawn. */
    pbox(T, 'concreteDark', x - 1.32, EXP.pierY0 - 0.02, 0, x + 1.32, EXP.pierY1 + 0.02, 0.6, { solid: false, cast: false, fine: true });
    pbox(T, 'metalDark', x + 1.3, 45.6, 0.6, x + 1.42, 45.8, EXP.cap0, { solid: false, cast: false, fine: true });
  }
  /* Lamp posts on the deck's median every pier, an arm out each way. */
  for (let x = EXP.pier0 + EXP.every / 2 - 3 * EXP.every; x <= x1; x += EXP.every) {
    ppost(T, 'metal', x, 49.5, top, top + 8, 0.12, { kind: 'pole', name: 'deck lamp' });
    for (const s of [-1, 1]) {
      pcap(T, 'metal', [x, 49.5, top + 7.8], [x, 49.5 + s * 2.6, top + 8.2], 0.06, { fine: true });
      pbox(T, 'lampHead', x - 0.25, 49.5 + s * 2.6 - 0.35, top + 7.95, x + 0.25, 49.5 + s * 2.6 + 0.35, top + 8.25, { solid: false, cast: false, fine: true });
    }
  }
  /*
   * THE GANTRY, a green direction sign over the eastbound lanes: two legs
   * on the deck's edges, a beam, and the board. The air between the deck
   * and the board is a line (a named gap).
   */
  const gx = 150;
  for (const gy of [y0 + 1.2, y1 - 1.2]) {
    ppost(T, 'metal', gx, gy, top, top + 7.2, 0.22, { kind: 'pole', name: 'gantry leg' });
  }
  pbox(T, 'metal', gx - 0.3, y0 + 1, top + 6.7, gx + 0.3, y1 - 1, top + 7.3, { name: 'gantry beam' });
  pbox(T, 'containerGreen', gx - 0.15, 42, top + 2.9, gx + 0.15, 58, top + 6.6, { name: 'gantry sign' });
  sign(T, 'expressE', gx + 0.15, 50, top + 4.75, 15.6, 3.5, 'e');
  sign(T, 'expressW', gx - 0.15, 50, top + 4.75, 15.6, 3.5, 'w');
}

/* ------------------------------------------------------------------ */
/* The railway viaduct and the station                                 */
/* ------------------------------------------------------------------ */

const inSpan = (x) => VIA.spans.some(([a, b]) => x > a && x < b);
const inStation = (x) => x > STA.x0 && x < STA.x1;

function viaduct(T) {
  const { y0, y1, soffit, top, x0, x1, bay, pier, lintel } = VIA;
  /* The deck the whole way, and its parapets; at the station the deck is
   * wider and the platforms take the parapets' place. */
  const runs = [[x0, STA.x0], [STA.x1, x1]];
  for (const [a, b] of runs) {
    pboxCut(T, 'brick', a, y0, soffit, b, y1, top, { name: 'viaduct deck' });
    pboxCut(T, 'concrete', a, y0, top, b, y0 + 0.35, top + 1.0, { name: 'viaduct parapet' });
    pboxCut(T, 'concrete', a, y1 - 0.35, top, b, y1, top + 1.0, { name: 'viaduct parapet' });
    /* The cornice under the parapet, a band of darker brick. */
    pboxCut(T, 'rustDeep', a, y0 - 0.12, top - 0.5, b, y0, top - 0.2, { solid: false, cast: false, fine: true });
    pboxCut(T, 'rustDeep', a, y1, top - 0.5, b, y1 + 0.12, top - 0.2, { solid: false, cast: false, fine: true });
  }
  /* The piers and the bays between them. */
  let k = 0;
  for (let x = Math.ceil(x0 / bay) * bay; x <= x1; x += bay, k += 1) {
    const a = x - pier / 2;
    const b = x + pier / 2;
    if (inSpan(x) || inStation(x)) {
      continue;
    }
    pbox(T, 'brick', a, y0, 0, b, y1, soffit, { name: 'viaduct pier' });
    /* A stone band at the springing of the arches. */
    pbox(T, 'concreteMid', a - 0.06, y0 - 0.06, lintel - 0.3, b + 0.06, y1 + 0.06, lintel, { solid: false, cast: false, fine: true });
    const n = x + bay;
    if (n > x1 || inSpan(n - 1) || inSpan(x + 1) || inStation(n - 1) || inStation(x + 1)) {
      continue;
    }
    /* The arch over the bay: the lintel's solid, with its curve drawn. */
    pbox(T, 'brick', b, y0, lintel, n - pier / 2, y1, soffit, { name: 'arch' });
    T.decor.push({ t: 'arch', x0: b, x1: n - pier / 2, y0, y1, h0: lintel, fine: true });
    archBay(T, b, n - pier / 2, k, x);
  }
  /* The steel spans: plate girders down both edges, the deck between. */
  for (const [a, b] of VIA.spans) {
    pbox(T, 'concrete', a - 2, y0 - 0.5, 0, a, y1 + 0.5, top, { name: 'abutment' });
    pbox(T, 'concrete', b, y0 - 0.5, 0, b + 2, y1 + 0.5, top, { name: 'abutment' });
    pbox(T, 'bridgeSteel', a, y0, soffit - 0.8, b, y0 + 0.5, top + 1.6, { name: 'plate girder' });
    pbox(T, 'bridgeSteel', a, y1 - 0.5, soffit - 0.8, b, y1, top + 1.6, { name: 'plate girder' });
    /* The stiffeners down the girders' faces, and a clearance board. */
    for (let x = a + 2; x < b - 1; x += 3) {
      for (const [ya, yb] of [[y0 - 0.12, y0], [y1, y1 + 0.12]]) {
        pbox(T, 'bridgeSteelDark', x - 0.1, ya, soffit - 0.8, x + 0.1, yb, top + 1.6, { solid: false, cast: false, fine: true });
      }
    }
    sign(T, 'clearance', (a + b) / 2, y0 - 0.13, soffit - 0.4, 3.2, 0.7, 's');
    sign(T, 'clearance', (a + b) / 2, y1 + 0.13, soffit - 0.4, 3.2, 0.7, 'n');
  }
  /* The rails: two tracks on ballast, the whole way. */
  for (const ty of [146.6, 153.4]) {
    pboxCut(T, 'concreteDark', x0, ty - 1.4, top, x1, ty + 1.4, top + 0.18, { solid: false, cast: false, fine: true });
    for (const r of [-0.54, 0.54]) {
      pboxCut(T, 'metal', x0, ty + r - 0.04, top + 0.18, x1, ty + r + 0.04, top + 0.32, { solid: false, cast: false, fine: true });
    }
  }
  /* Catenary masts, a portal every 36 m, and the wires over each track. */
  for (let x = x0 + 10; x < x1; x += 36) {
    if (inStation(x) || inStation(x + 6) || inStation(x - 6)) {
      continue;
    }
    for (const my of [y0 + 0.6, y1 - 0.6]) {
      ppost(T, 'metal', x, my, top, top + 5.8, 0.13, { kind: 'pole', name: 'catenary mast' });
    }
    pcap(T, 'metal', [x, y0 + 0.6, top + 5.5], [x, y1 - 0.6, top + 5.5], 0.09, { kind: 'pole', name: 'catenary beam' });
  }
  for (const ty of [146.6, 153.4]) {
    for (const [a, b] of [[x0, STA.x0], [STA.x0, STA.x1], [STA.x1, x1]]) {
      T.decor.push({ t: 'span', a: [a, ty, top + 5.1], b: [b, ty, top + 5.1], r: 0.02, m: 'rope', fine: true });
    }
  }
  station(T);
  train(T);
}

/* What is in a bay of the arches: a bar with its curtain and lanterns, a
 * storeroom behind a shutter, or the open passage. */
function archBay(T, a, b, k, x) {
  const { y0, y1, lintel } = VIA;
  if (a >= ALLEY.x0 - 0.5 && b <= ALLEY.x1 + 0.5) {
    /* The lantern alley: open front to back, lanterns down both walls. */
    for (const ly of [146.5, 149.5, 152.5]) {
      T.decor.push({ t: 'lantern', x: a + 0.45, y: ly, h: 3.4, fine: false });
      T.decor.push({ t: 'lantern', x: b - 0.45, y: ly, h: 3.4, fine: false });
    }
    T.decor.push({ t: 'string', a: [a + 0.2, 145, 4.6], b: [b - 0.2, 155, 4.6], sag: 0.4, every: 1.6, fine: true });
    sign(T, 'yokocho', (a + b) / 2, y0 - 0.05, lintel - 0.75, 5.2, 0.9, 's');
    sign(T, 'yokocho', (a + b) / 2, y1 + 0.05, lintel - 0.75, 5.2, 0.9, 'n');
    return;
  }
  if (x < 0 || x > W) {
    /* Out in the fog: closed, plain. */
    pbox(T, 'brick', a, y0 + 1, 0, b, y1 - 1, lintel, { name: 'bay' });
    return;
  }
  /* A closed bay, its fronts set 0.8 m back under the arch. */
  pbox(T, 'brick', a, y0 + 0.8, 0, b, y1 - 0.8, lintel, { name: 'bay' });
  const kinds = ['izakaya', 'shutter', 'yakitori', 'shutter', 'bar', 'izakaya', 'soba', 'shutter'];
  const kind = kinds[((k % kinds.length) + kinds.length) % kinds.length];
  for (const [fy, face, out] of [[y0 + 0.78, 's', -1], [y1 - 0.78, 'n', 1]]) {
    if (kind === 'shutter') {
      pbox(T, 'shutterLight', a + 0.6, fy + out * 0.03, 0.1, b - 0.6, fy, 3.6, { solid: false, cast: false });
      pbox(T, 'shutter', a + 0.5, fy + out * 0.1, 3.6, b - 0.5, fy, 4.1, { solid: false, cast: false, fine: true });
      continue;
    }
    /* A bar front: dark glass, a wooden frame, a curtain over the door,
     * a red lantern either side and its name over it. */
    pbox(T, 'glassDark', a + 0.8, fy + out * 0.02, 0.4, b - 0.8, fy, 2.6, { solid: false, cast: false });
    pbox(T, 'plywood', a + 0.6, fy + out * 0.06, 2.6, b - 0.6, fy, 2.9, { solid: false, cast: false, fine: true });
    const mid = (a + b) / 2;
    pbox(T, kind === 'soba' ? 'drIndigo' : 'drNoboriRed', mid - 1.0, fy + out * 0.08, 1.7, mid + 1.0, fy + out * 0.04, 2.55, { solid: false, cast: false });
    T.decor.push({ t: 'lantern', x: a + 1.1, y: fy + out * 0.35, h: 2.3, fine: false });
    T.decor.push({ t: 'lantern', x: b - 1.1, y: fy + out * 0.35, h: 2.3, fine: false });
    sign(T, kind, mid, fy + out * 0.08, 3.4, 4.2, 0.8, face);
    /* A crate of empties and a stool out front. */
    pbox(T, 'containerOrange', a + 1.6, fy + out * 0.3, 0, a + 2.2, fy + out * 0.75, 0.32, { solid: false, cast: false, fine: true });
    pbox(T, 'containerBlue', b - 2.4, fy + out * 0.3, 0, b - 1.8, fy + out * 0.75, 0.32, { solid: false, cast: false, fine: true });
  }
}

function station(T) {
  const { x0, x1, y0, y1, platform, canopy } = STA;
  const top = VIA.top;
  /* The wider deck, the platforms, and a fence on their outer edges. */
  pbox(T, 'concreteMid', x0, y0, VIA.soffit, x1, y1, top, { name: 'station deck' });
  pbox(T, 'concrete', x0, y0, top, x1, y0 + 4.6, platform, { name: 'platform' });
  pbox(T, 'concrete', x0, y1 - 4.6, top, x1, y1, platform, { name: 'platform' });
  pbox(T, 'metal', x0, y0, platform, x1, y0 + 0.12, platform + 1.4, { name: 'platform fence' });
  pbox(T, 'metal', x0, y1 - 0.12, platform, x1, y1, platform + 1.4, { name: 'platform fence' });
  /* The yellow tactile line along each platform edge. */
  pbox(T, 'craneYellow', x0, y0 + 3.9, platform, x1, y0 + 4.2, platform + 0.02, { solid: false, cast: false, fine: true });
  pbox(T, 'craneYellow', x0, y1 - 4.2, platform, x1, y1 - 3.9, platform + 0.02, { solid: false, cast: false, fine: true });
  /* The canopies, on a row of columns down each platform. */
  for (const [ca, cb, cy] of [[y0 - 0.4, y0 + 5.0, y0 + 2.3], [y1 - 5.0, y1 + 0.4, y1 - 2.3]]) {
    pbox(T, 'bldRoof', x0 + 6, ca, canopy, x1 - 6, cb, canopy + 0.35, { name: 'platform canopy' });
    pbox(T, 'white', x0 + 6, ca - 0.04, canopy - 0.25, x1 - 6, ca, canopy + 0.35, { solid: false, cast: false, fine: true });
    pbox(T, 'white', x0 + 6, cb, canopy - 0.25, x1 - 6, cb + 0.04, canopy + 0.35, { solid: false, cast: false, fine: true });
    for (let x = x0 + 10; x <= x1 - 10; x += 12) {
      ppost(T, 'metal', x, cy, platform, canopy, 0.14, { kind: 'pole', name: 'canopy column' });
    }
    /* Name boards hung under the canopy, and benches. */
    for (const x of [x0 + 22, x0 + 46, x1 - 22]) {
      sign(T, 'staName', x, cy, canopy - 0.75, 2.6, 0.8, cy < 150 ? 'n' : 's', 0.0);
      sign(T, 'staName', x, cy, canopy - 0.75, 2.6, 0.8, cy < 150 ? 's' : 'n', 0.0);
      T.decor.push({ t: 'cyl', m: 'metal', a: [x, cy, canopy - 0.4], b: [x, cy, canopy], r: 0.02, seg: 4, fine: true });
    }
    for (const x of [x0 + 16, x0 + 40, x1 - 34]) {
      pbox(T, 'containerTeal', x - 1, cy - 0.25, platform, x + 1, cy + 0.25, platform + 0.45, { solid: false, cast: false, fine: true });
    }
    /* A drinks machine on each platform. */
    T.decor.push({ t: 'vend', x: x0 + 30, y: cy + (cy < 150 ? -1.4 : 1.4), h: platform, yaw: cy < 150 ? Math.PI / 2 : -Math.PI / 2, seed: cy });
  }
  /*
   * THE CONCOURSE under the viaduct: two halls either side of the passage
   * through, which is open from the plaza on the north to the back street
   * on the south, ticket gates down the middle. Glass fronts both faces.
   */
  const { pass0, pass1, passH } = STA;
  pbox(T, 'wallWhite', x0, y0, 0, pass0, y1, VIA.soffit, { name: 'concourse' });
  pbox(T, 'wallWhite', pass1, y0, 0, x1, y1, VIA.soffit, { name: 'concourse' });
  pbox(T, 'concreteMid', pass0, y0, passH, pass1, y1, VIA.soffit, { name: 'concourse lintel' });
  for (const [fy, face, out] of [[y0, 's', -1], [y1, 'n', 1]]) {
    for (const [a, b] of [[x0 + 2, pass0 - 2], [pass1 + 2, x1 - 2]]) {
      pbox(T, 'glassBlue', a, fy + out * 0.03, 0.3, b, fy, 3.6, { solid: false, cast: false });
      for (let x = a; x <= b; x += 3) {
        pbox(T, 'bldFrame', x - 0.06, fy + out * 0.06, 0.3, x + 0.06, fy, 3.6, { solid: false, cast: false, fine: true });
      }
      pbox(T, 'bldFrame', a, fy + out * 0.06, 3.6, b, fy, 3.8, { solid: false, cast: false, fine: true });
    }
    /* The station's name over the passage, and the exit's. */
    sign(T, 'staBig', (pass0 + pass1) / 2, fy + out * 0.04, 5.4, 14, 1.8, face);
    sign(T, face === 'n' ? 'exitN' : 'exitS', (pass0 + pass1) / 2, fy + out * 0.04, passH - 0.45, 5, 0.7, face);
    /* Coin lockers and a ticket machine bank either side of the mouth. */
    pbox(T, 'containerGrey', pass0 - 1.6, fy + out * 0.02, 0, pass0, fy + out * 0.62, 1.9, { solid: false, cast: false, fine: true });
    pbox(T, 'white', pass1, fy + out * 0.02, 0, pass1 + 2.4, fy + out * 0.62, 1.8, { solid: false, cast: false, fine: true });
  }
  /* The ticket gates: a row of waist high cabinets across the passage,
   * drawn, never solid (a quad slips between them). */
  for (let x = pass0 + 1.4; x < pass1 - 1; x += 1.6) {
    pbox(T, 'bldVendWhite', x - 0.12, 149.4, 0, x + 0.12, 150.6, 1.0, { solid: false, cast: false, fine: true });
    pbox(T, 'craneYellow', x - 0.13, 150.4, 0.9, x + 0.13, 150.6, 1.02, { solid: false, cast: false, fine: true });
  }
  sign(T, 'gates', (pass0 + pass1) / 2, 149.3, 3.2, 9, 0.8, 'n');
  sign(T, 'gates', (pass0 + pass1) / 2, 150.7, 3.2, 9, 0.8, 's');
}

/* The commuter train at the south platform: four cars, a stripe, windows
 * and doors, and a pantograph on the second car. Solid as one box a car. */
function train(T) {
  const { x0, cars, len, gap, y, half, floor, roof } = TRAIN;
  for (let i = 0; i < cars; i += 1) {
    const a = x0 + i * (len + gap);
    const b = a + len;
    pbox(T, 'white', a, y - half, floor, b, y + half, roof, { name: 'train car' });
    /* The roof's grey and the skirt. */
    pbox(T, 'concreteMid', a + 0.2, y - half + 0.2, roof, b - 0.2, y + half - 0.2, roof + 0.18, { solid: false, cast: false });
    pbox(T, 'metalDark', a + 1.5, y - half + 0.15, VIA.top + 0.3, b - 1.5, y + half - 0.15, floor, { solid: false, cast: false });
    for (const [fy, out] of [[y - half, -1], [y + half, 1]]) {
      /* The line's colour band under the windows, and a thinner one over. */
      pbox(T, 'containerGreen', a, fy + out * 0.02, floor + 1.0, b, fy, floor + 1.35, { solid: false, cast: false });
      pbox(T, 'containerOrange', a, fy + out * 0.02, roof - 0.5, b, fy, roof - 0.35, { solid: false, cast: false, fine: true });
      /* Four doors a side, windows between. */
      for (let d = 0; d < 4; d += 1) {
        const dx = a + 2.4 + d * 4.9;
        pbox(T, 'bldFrame', dx - 0.65, fy + out * 0.025, floor + 0.05, dx + 0.65, fy, floor + 2.0, { solid: false, cast: false });
        pbox(T, 'glassDark', dx - 0.5, fy + out * 0.03, floor + 1.1, dx + 0.5, fy, floor + 1.9, { solid: false, cast: false, fine: true });
        if (d < 3) {
          pbox(T, 'glassDark', dx + 1.0, fy + out * 0.03, floor + 1.45, dx + 3.9, fy, floor + 2.4, { solid: false, cast: false });
        }
      }
    }
    /* The ends: a cab with a dark windscreen on the two outer cars. */
    if (i === 0 || i === cars - 1) {
      const ex = i === 0 ? a : b;
      const out = i === 0 ? -1 : 1;
      pbox(T, 'glassDark', ex, y - half + 0.3, floor + 1.6, ex + out * 0.03, y + half - 0.3, floor + 2.7, { solid: false, cast: false });
      pbox(T, 'containerGreen', ex, y - half + 0.1, floor + 0.6, ex + out * 0.04, y + half - 0.1, floor + 1.35, { solid: false, cast: false });
      for (const s of [-1, 1]) {
        pbox(T, 'lampGlow', ex, y + s * 0.95 - 0.18, floor + 0.85, ex + out * 0.05, y + s * 0.95 + 0.18, floor + 1.1, { solid: false, cast: false, fine: true });
      }
    }
    if (i === 1) {
      const px = a + len / 2;
      T.decor.push({ t: 'cyl', m: 'metalDark', a: [px - 1.2, y, roof + 0.2], b: [px, y, roof + 1.4], r: 0.04, seg: 4, fine: true });
      T.decor.push({ t: 'cyl', m: 'metalDark', a: [px + 1.2, y, roof + 0.2], b: [px, y, roof + 1.4], r: 0.04, seg: 4, fine: true });
      pbox(T, 'metalDark', px - 0.9, y - 0.08, roof + 1.38, px + 0.9, y + 0.08, roof + 1.48, { solid: false, cast: false, fine: true });
    }
  }
}

/* ------------------------------------------------------------------ */
/* The car park, the start                                             */
/* ------------------------------------------------------------------ */

function carPark(T) {
  const { x0, x1, y0, y1, floor, decks, slab, parapet, cols, rows } = CP;
  const roof = CP.roof;
  /* The columns, the whole height. */
  for (const cx of cols) {
    for (const cy of rows) {
      pbox(T, 'concrete', cx - 0.3, cy - 0.3, 0, cx + 0.3, cy + 0.3, roof, { name: 'car park column' });
    }
  }
  for (let d = 1; d <= decks; d += 1) {
    const h = d * floor;
    pbox(T, 'concreteMid', x0, y0, h - slab, x1, y1, h, { name: 'car park deck' });
    /* The parapet round the deck: a solid wall a metre high, cream with
     * a green band, and bays painted on the deck. */
    pbox(T, 'wallCream', x0, y0, h, x1, y0 + 0.2, h + parapet, { name: 'parapet' });
    pbox(T, 'wallCream', x0, y1 - 0.2, h, x1, y1, h + parapet, { name: 'parapet' });
    pbox(T, 'wallCream', x0, y0, h, x0 + 0.2, y1, h + parapet, { name: 'parapet' });
    pbox(T, 'wallCream', x1 - 0.2, y0, h, x1, y1, h + parapet, { name: 'parapet' });
    for (const [a, b, c, e] of [[x0 - 0.03, y0 - 0.03, x1 + 0.03, y0], [x0 - 0.03, y1, x1 + 0.03, y1 + 0.03], [x0 - 0.03, y0, x0, y1], [x1, y0, x1 + 0.03, y1]]) {
      pbox(T, 'containerGreen', a, b, h + 0.55, c, e, h + 0.75, { solid: false, cast: false, fine: true });
    }
    for (let by = y0 + 3; by < y1 - 3; by += 2.6) {
      for (const bx of [x0 + 0.6, x1 - 5.6]) {
        pbox(T, 'lineWhite', bx, by - 0.06, h, bx + 5, by + 0.06, h + 0.02, { solid: false, cast: false, fine: true });
      }
    }
  }
  /* The ground floor's low wall, open where the cars come in on the east. */
  pbox(T, 'wallCream', x0, y0, 0, x1, y0 + 0.2, 0.9, { name: 'parapet' });
  pbox(T, 'wallCream', x0, y1 - 0.2, 0, x1, y1, 0.9, { name: 'parapet' });
  pbox(T, 'wallCream', x0, y0, 0, x0 + 0.2, y1, 0.9, { name: 'parapet' });
  /* The stair and lift tower in the north west corner, up through the roof. */
  pbox(T, 'wallWhite', x0, y1 - 6, 0, x0 + 6, y1, roof + 2.8, { name: 'stair tower' });
  pbox(T, 'containerGreen', x0 - 0.03, y1 - 6, roof + 2.0, x0 + 6.03, y1 + 0.03, roof + 2.6, { solid: false, cast: false });
  for (let d = 0; d <= decks; d += 1) {
    pbox(T, 'glassDark', x0 + 6, y1 - 4.6, d * floor + 1.2, x0 + 6.04, y1 - 1.4, d * floor + 2.4, { solid: false, cast: false, fine: true });
  }
  /* The big P on a blade at the south east corner, and the name. */
  pbox(T, 'containerBlue', x1 - 0.3, y0 - 0.4, 4, x1 + 0.1, y0 + 1.6, roof + 3.5, { name: 'car park sign' });
  sign(T, 'parkP', x1 + 0.1, y0 + 0.6, roof + 1.8, 1.8, 3.0, 'e');
  sign(T, 'parkP', x1 - 0.3, y0 + 0.6, roof + 1.8, 1.8, 3.0, 'w');
  sign(T, 'parkName', x1 + 0.1, y0 + 0.6, 7.5, 1.6, 6.0, 'e');
  /* Cars parked on the decks, nose in along both long sides. Each stands
   * in a solid box the size of its body, which is not drawn. */
  const r = rng(77);
  const kinds = ['kei', 'hatch', 'sedan', 'wagon', 'minivan', 'keivan'];
  const colours = ['white', 'pearl', 'silver', 'wine', 'navy', 'charcoal', 'cream', 'mint'];
  for (let d = 0; d <= decks; d += 1) {
    const h = d * floor;
    for (let by = y0 + 4.3; by < y1 - 4; by += 2.6) {
      for (const [bx, yaw] of [[x0 + 3.1, Math.PI], [x1 - 3.1, 0]]) {
        if (d === 0 && bx > 20) {
          continue;
        }
        if (d === decks && by > y1 - 10) {
          continue;
        }
        /* A few a deck: each is about three thousand triangles. */
        if (!r.chance(d === decks ? 0.15 : 0.22)) {
          continue;
        }
        const kind = r.pick(kinds);
        T.decor.push({ t: 'car', kind, colour: r.pick(colours), x: bx, y: by, h, yaw, variant: r.int(1, 9) });
        pbox(T, 'concrete', bx - 2.0, by - 0.8, h, bx + 2.0, by + 0.8, h + 1.5, { draw: false, name: 'parked car' });
      }
    }
  }
  /* People at the roof's east parapet, watching the hairpin. */
  crowdLine(T, x1 - 0.7, y0 + 2, x1 - 0.7, y1 - 12, roof, 1.0, 3);
  crowdLine(T, x1 - 0.7, y0 + 2, x1 - 0.7, y1 - 2, floor * 2, 1.4, 9);
}

/* ------------------------------------------------------------------ */
/* The petrol station                                                  */
/* ------------------------------------------------------------------ */

function petrol(T) {
  const { x0, x1, y0, y1, c0, c1, cy0, cy1, h0, h1, isl } = PS;
  paint(T, 'concrete', x0, y0, x1, y1, 0.17);
  /* The canopy: a white slab with a red band, on four columns. */
  pbox(T, 'white', c0, cy0, h0, c1, cy1, h1, { name: 'canopy' });
  pbox(T, 'drNoboriRed', c0 - 0.04, cy0 - 0.04, h0 + 0.15, c1 + 0.04, cy1 + 0.04, h0 + 0.45, { solid: false, cast: false });
  pbox(T, 'lampGlow', c0 + 1, cy0 + 1, h0 - 0.04, c1 - 1, cy1 - 1, h0, { solid: false, cast: false, fine: true });
  for (const cx of [c0 + 4, c1 - 4]) {
    for (const cy of [cy0 + 2, cy1 - 2]) {
      ppost(T, 'white', cx, cy, 0, h0, 0.28, { kind: 'pole', name: 'canopy column' });
    }
  }
  sign(T, 'gas', (c0 + c1) / 2, cy0 - 0.05, h0 + 0.3, 8, 0.6, 's');
  sign(T, 'gas', (c0 + c1) / 2, cy1 + 0.05, h0 + 0.3, 8, 0.6, 'n');
  /* Two pump islands, two pumps each. */
  for (const iy of isl) {
    pbox(T, 'concreteMid', 74, iy - 0.7, 0, 92, iy + 0.7, 0.25, { name: 'pump island' });
    for (const px of [78, 88]) {
      pbox(T, 'white', px - 0.45, iy - 0.35, 0.25, px + 0.45, iy + 0.35, 2.0, { name: 'pump' });
      pbox(T, 'drNoboriRed', px - 0.47, iy - 0.37, 1.55, px + 0.47, iy + 0.37, 1.9, { solid: false, cast: false });
      pbox(T, 'glassDark', px - 0.3, iy - 0.38, 1.0, px + 0.3, iy + 0.38, 1.4, { solid: false, cast: false, fine: true });
      T.decor.push({ t: 'cyl', m: 'metalDark', a: [px + 0.47, iy, 1.2], b: [px + 0.9, iy, 0.5], r: 0.03, seg: 4, fine: true });
    }
  }
  /* The kiosk and its glass front, the air pump, the tyres for sale. */
  pbox(T, 'wallWhite', 99, 68, 0, 106, 84, 3.4, { name: 'kiosk' });
  pbox(T, 'drNoboriRed', 98.96, 68, 2.7, 99, 84, 3.3, { solid: false, cast: false });
  pbox(T, 'glassBlue', 98.97, 70, 0.3, 99, 82, 2.5, { solid: false, cast: false });
  for (let y = 72; y < 82; y += 2) {
    pbox(T, 'bldFrame', 98.94, y - 0.05, 0.3, 99, y + 0.05, 2.5, { solid: false, cast: false, fine: true });
  }
  pbox(T, 'acUnit', 101, 68.6, 3.4, 103, 70, 4.2, { solid: false, cast: false, fine: true });
  /* The price board on its pole at the corner, readable from the hairpin. */
  ppost(T, 'metal', 64.8, 84, 0, 7.2, 0.14, { kind: 'pole', name: 'price pole' });
  pbox(T, 'white', 64.4, 83.2, 4.2, 65.2, 84.8, 7.0, { name: 'price board' });
  sign(T, 'price', 64.4, 84, 5.6, 1.5, 2.7, 'w');
  sign(T, 'price', 65.2, 84, 5.6, 1.5, 2.7, 'e');
  T.decor.push({ t: 'tyres', x: 97, y: 84, n: 4, fine: true });
  T.decor.push({ t: 'tyres', x: 97, y: 67.4, n: 3, fine: true });
}

/* ------------------------------------------------------------------ */
/* The police box, turn one's clipping point                           */
/* ------------------------------------------------------------------ */

function koban(T) {
  const { x0, x1, y0, y1, h } = KOBAN;
  /* A two storey box with a pitched roof, its door on the corner side, and
   * the red lamp over the door every police box has. */
  pbox(T, 'wallWhite', x0, y0, 0, x1, y1, h, { name: 'police box' });
  pbox(T, 'drIndigo', x0 - 0.05, y0 - 0.05, 0, x1 + 0.05, y1 + 0.05, 0.6, { solid: false, cast: false });
  T.decor.push({
    t: 'prism', m: 'drIndigo', axis: 'x', e0: x0 - 0.6, e1: x1 + 0.6,
    profile: [[y0 - 0.6, h - 0.1], [(y0 + y1) / 2, h + 2.2], [y1 + 0.6, h - 0.1]],
  });
  pbox(T, 'glassDark', x1, y0 + 1.2, 0.3, x1 + 0.04, y0 + 3.6, 2.4, { solid: false, cast: false });
  pbox(T, 'glassBlue', x1, y0 + 4.4, 3.4, x1 + 0.04, y1 - 1.0, 4.8, { solid: false, cast: false });
  pbox(T, 'glassBlue', x0 + 1, y0 - 0.04, 1.1, x1 - 1, y0, 2.3, { solid: false, cast: false });
  pbox(T, 'glassBlue', x0 + 1, y0 - 0.04, 3.4, x1 - 1, y0, 4.8, { solid: false, cast: false });
  T.decor.push({ t: 'ball', m: 'lampRed', c: [x1 + 0.35, y0 + 2.4, 2.95], r: 0.24 });
  pbox(T, 'metal', x1, y0 + 2.3, 2.75, x1 + 0.35, y0 + 2.5, 2.8, { solid: false, cast: false, fine: true });
  sign(T, 'koban', x1 + 0.05, (y0 + y1) / 2 + 0.6, 2.95, 3.2, 0.62, 'e');
  sign(T, 'koban', (x0 + x1) / 2, y0 - 0.05, 2.95, 3.2, 0.62, 's');
  /* The bicycle at the door, the officer's. */
  T.decor.push({ t: 'cyl', m: 'metalDark', a: [x1 + 0.8, y0 + 4.2, 0.35], b: [x1 + 0.8, y0 + 5.8, 0.35], r: 0.33, seg: 10, ring: true, fine: true });
}

/* ------------------------------------------------------------------ */
/* The footbridge                                                      */
/* ------------------------------------------------------------------ */

function footbridge(T) {
  const { x, half, y0, y1, deck0, deck1, rail } = FB;
  pbox(T, 'bridgeSteel', x - half, y0, deck0, x + half, y1, deck1, { name: 'footbridge deck' });
  pbox(T, 'bridgeSteel', x - half, y0, deck1, x - half + 0.1, y1, rail, { name: 'footbridge side' });
  pbox(T, 'bridgeSteel', x + half - 0.1, y0, deck1, x + half, y1, rail, { name: 'footbridge side' });
  pbox(T, 'bridgeSteelDark', x - half - 0.03, y0, deck0 - 0.02, x + half + 0.03, y1, deck0 + 0.12, { solid: false, cast: false });
  for (const cy of [y0 + 1.2, 46, y1 - 1.2]) {
    pbox(T, 'bridgeSteel', x - 0.35, cy - 0.35, 0, x + 0.35, cy + 0.35, deck0, { name: 'footbridge column' });
  }
  /* The stairs, down along the pavement at each end. Each step is solid
   * from the ground up, so the flight is a stepped wall under it. */
  const steps = 14;
  const rise = deck1 / steps;
  for (let i = 0; i < steps; i += 1) {
    const top = deck1 - (i + 1) * rise + rise;
    const xa = x + half + i * 0.9;
    pbox(T, 'bridgeSteel', xa, y1 - 2.6, 0, xa + 0.9, y1, top, { name: 'stair' });
    const xb = x - half - i * 0.9;
    pbox(T, 'bridgeSteel', xb - 0.9, y0, 0, xb, y0 + 2.6, top, { name: 'stair' });
  }
  pbox(T, 'bridgeSteel', x + half, y1 - 2.7, deck1, x + half + steps * 0.9, y1 - 2.6, rail - 0.2, { solid: false, cast: false, fine: true });
  pbox(T, 'bridgeSteel', x - half - steps * 0.9, y0 + 2.6, deck1, x - half, y0 + 2.7, rail - 0.2, { solid: false, cast: false, fine: true });
  /* The event's banner along both sides over the course. */
  sign(T, 'event', x + half, 56, (deck1 + rail) / 2, 11.5, rail - deck1 - 0.05, 'e', 0.02);
  sign(T, 'event', x - half, 56, (deck1 + rail) / 2, 11.5, rail - deck1 - 0.05, 'w', 0.02);
  /* The crowd on the bridge, along both rails. */
  crowdLine(T, x - half + 0.45, y0 + 4, x - half + 0.45, y1 - 4, deck1, 0.9, 5);
  crowdLine(T, x + half - 0.45, y0 + 4, x + half - 0.45, y1 - 4, deck1, 0.9, 11);
}

/* ------------------------------------------------------------------ */
/* The shrine                                                          */
/* ------------------------------------------------------------------ */

function shrine(T) {
  const { x, torii, toriiHalf, toriiH } = SHRINE;
  /* The stone torii at the street: two posts, the nuki through them and
   * the kasagi over them with its ends lifted. */
  for (const s of [-1, 1]) {
    ppost(T, 'concreteMid', x + s * toriiHalf, torii, 0, toriiH, 0.2, { kind: 'pole', name: 'torii post' });
  }
  pbox(T, 'concreteMid', x - toriiHalf - 0.35, torii - 0.15, toriiH - 0.65, x + toriiHalf + 0.35, torii + 0.15, toriiH - 0.42, { name: 'nuki' });
  pbox(T, 'concreteMid', x - toriiHalf - 0.7, torii - 0.25, toriiH, x + toriiHalf + 0.7, torii + 0.25, toriiH + 0.35, { name: 'kasagi' });
  for (const s of [-1, 1]) {
    pbox(T, 'concreteMid', x + s * (toriiHalf + 0.45) - 0.3, torii - 0.25, toriiH + 0.35, x + s * (toriiHalf + 0.45) + 0.3, torii + 0.25, toriiH + 0.5, { solid: false, cast: false, fine: true });
  }
  /* The path of stone to the hall, a pair of lanterns, the hand basin. */
  paint(T, 'concrete', x - 1.2, torii + 0.5, x + 1.2, 116, 0.18);
  for (const s of [-1, 1]) {
    const lx = x + s * 2.4;
    pbox(T, 'concreteMid', lx - 0.35, 106.6, 0, lx + 0.35, 107.3, 0.4, { name: 'lantern foot' });
    ppost(T, 'concreteMid', lx, 107, 0.4, 1.3, 0.12, { kind: 'pole', name: 'lantern' });
    pbox(T, 'concreteMid', lx - 0.32, 106.68, 1.3, lx + 0.32, 107.32, 1.8, { name: 'lantern box' });
    T.decor.push({ t: 'prism', m: 'concreteMid', axis: 'x', e0: lx - 0.48, e1: lx + 0.48, profile: [[106.5, 1.8], [107, 2.15], [107.5, 1.8]], fine: true });
  }
  pbox(T, 'concrete', x + 3.2, 110, 0, x + 4.6, 111.2, 0.8, { name: 'basin' });
  T.decor.push({ t: 'prism', m: 'plywood', axis: 'x', e0: x + 2.8, e1: x + 5, profile: [[109.5, 2.2], [110.6, 2.8], [111.7, 2.2]], fine: true });
  /* The hall: raised on posts, a wooden body and a deep gable roof, the
   * rope and the bell over the steps. */
  pbox(T, 'concreteMid', x - 5.5, 116, 0, x + 5.5, 126, 0.7, { name: 'hall plinth' });
  pbox(T, 'plywood', x - 4.2, 117.5, 0.7, x + 4.2, 125, 3.6, { name: 'hall' });
  pbox(T, 'drToriiRed', x - 4.25, 117.45, 2.9, x + 4.25, 125.05, 3.3, { solid: false, cast: false });
  T.decor.push({
    t: 'prism', m: 'drToriiBlack', axis: 'x', e0: x - 5.6, e1: x + 5.6,
    profile: [[115.8, 3.4], [121.2, 6.4], [126.6, 3.4]],
  });
  pbox(T, 'plywood', x - 2.0, 116, 0.7, x + 2.0, 117.5, 1.2, { name: 'hall step' });
  T.decor.push({ t: 'cyl', m: 'craneYellow', a: [x, 117.3, 2.2], b: [x, 117.3, 3.3], r: 0.05, seg: 4, fine: true });
  T.decor.push({ t: 'ball', m: 'craneYellowDeep', c: [x, 117.3, 3.25], r: 0.16, fine: true });
  pbox(T, 'white', x - 1.4, 117.35, 3.0, x + 1.4, 117.45, 3.15, { solid: false, cast: false, fine: true });
  /* A low stone fence round the precinct. */
  for (const [a, b, c, d] of [[x - 9, 99, x - toriiHalf - 0.6, 99.4], [x + toriiHalf + 0.6, 99, x + 9, 99.4], [x - 9, 99, x - 8.6, 128], [x + 8.6, 99, x + 9, 128], [x - 9, 127.6, x + 9, 128]]) {
    pbox(T, 'concrete', a, b, 0, c, d, 0.6, { name: 'shrine fence' });
  }
  /* Paper streamers on the torii, and the votive plaques by the hall. */
  pbox(T, 'white', x - 0.4, torii - 0.18, toriiH - 0.8, x + 0.4, torii + 0.18, toriiH - 0.66, { solid: false, cast: false, fine: true });
  pbox(T, 'plywood', x + 5.5, 118, 0, x + 5.7, 122, 1.6, { name: 'ema board' });
}

/* ------------------------------------------------------------------ */
/* The rotary                                                          */
/* ------------------------------------------------------------------ */

function rotary(T) {
  const { x, y, r } = ROTARY;
  /* The island: a kerbed ring and a lawn, a clock on a pole, and a bronze
   * tanuki on a plinth, the station's own mascot. */
  T.decor.push({ t: 'disc', m: 'concreteMid', x, y, h0: 0, h1: 0.22, r, seg: 24 });
  T.decor.push({ t: 'disc', m: 'stGrove1', x, y, h0: 0, h1: 0.26, r: r - 0.5, seg: 24 });
  ppost(T, 'metal', x, y, 0, 4.8, 0.09, { kind: 'pole', name: 'clock pole' });
  pbox(T, 'white', x - 0.5, y - 0.12, 4.2, x + 0.5, y + 0.12, 5.2, { name: 'clock' });
  sign(T, 'clock', x, y - 0.13, 4.7, 0.9, 0.9, 's');
  sign(T, 'clock', x, y + 0.13, 4.7, 0.9, 0.9, 'n');
  pbox(T, 'concrete', x - 2.6, y - 1.9, 0, x - 1.0, y - 0.3, 1.1, { name: 'statue plinth' });
  T.decor.push({ t: 'tanuki', x: x - 1.8, y: y - 1.1, h: 1.1 });
  /* A curved bench round the island's east side for the taxis' drivers,
   * and a rank sign. */
  sign(T, 'taxi', 150, 201, 2.4, 1.2, 0.8, 's');
  ppost(T, 'metal', 150, 201, 0, 2.9, 0.05, { kind: 'pole', name: 'rank sign' });
  /* The bus shelter on the plaza's north edge, by the stop. */
  pbox(T, 'metal', 160, 177.9, 0, 160.12, 179.2, 2.6, { name: 'shelter post' });
  pbox(T, 'metal', 168, 177.9, 0, 168.12, 179.2, 2.6, { name: 'shelter post' });
  pbox(T, 'glassBlue', 160, 177.9, 0.3, 168.12, 178.0, 2.4, { solid: false, cast: false });
  pbox(T, 'bldRoof', 159.6, 177.6, 2.6, 168.5, 180.4, 2.8, { name: 'shelter roof' });
  pbox(T, 'containerTeal', 161, 178.1, 0.4, 167, 178.45, 0.55, { solid: false, cast: false, fine: true });
  ppost(T, 'metal', 170, 180.6, 0, 2.6, 0.05, { kind: 'pole', name: 'bus stop' });
  T.decor.push({ t: 'disc', m: 'wallBlue', x: 170, y: 180.6, h0: 2.4, h1: 2.46, r: 0.35, seg: 12, fine: true });
}

/* ------------------------------------------------------------------ */
/* The covered shopping street                                         */
/* ------------------------------------------------------------------ */

/*
 * THE ARCADE: a lane 8 m wide between two rows of shops (the document's,
 * ./yard.js), a roof of ribbed translucent panels over it on steel arches,
 * a gateway sign at each end, lanterns and paper banners down its length.
 * The air under the roof is a 94 m tunnel open at both ends.
 */
function arcade(T) {
  const { x0, x1, y0, y1, roof0, roof1 } = ARCADE;
  paint(T, 'bldTilePale', x0, y0, x1, y1, 0.17);
  for (let x = x0 + 2; x < x1; x += 4) {
    paint(T, 'bldPaving', x, y0 + 0.4, x + 2, y1 - 0.4, 0.175, true);
  }
  /* The roof: a slab of panels, solid, and the arches over it, drawn. */
  pboxCut(T, 'sheetBlue', x0, y0, roof0, x1, y1, roof1, { name: 'arcade roof' });
  for (let x = x0 + 1; x < x1; x += 6) {
    T.decor.push({ t: 'arc', x, y0, y1, h: roof1, rise: 1.6, m: 'bridgeSteel', fine: true });
    pbox(T, 'bridgeSteel', x - 0.12, y0 + 0.05, roof0 - 0.35, x + 0.12, y1 - 0.05, roof0, { solid: false, cast: false });
  }
  /* The gateways at each end: a sign board on legs. */
  for (const gx of [x0 + 0.6, x1 - 0.6]) {
    for (const gy of [y0 + 0.4, y1 - 0.4]) {
      ppost(T, 'metal', gx, gy, 0, roof1 + 2.2, 0.15, { kind: 'pole', name: 'arcade gate post' });
    }
    pbox(T, 'drToriiBlack', gx - 0.2, y0 + 0.1, roof1 + 0.2, gx + 0.2, y1 - 0.1, roof1 + 2.0, { name: 'arcade gate sign' });
    sign(T, 'arcade', gx + 0.2, (y0 + y1) / 2, roof1 + 1.1, 7.4, 1.6, 'e');
    sign(T, 'arcade', gx - 0.2, (y0 + y1) / 2, roof1 + 1.1, 7.4, 1.6, 'w');
  }
  /* Lanterns down the middle and paper banners hung from the arches. */
  for (let x = x0 + 4; x < x1 - 2; x += 6) {
    T.decor.push({ t: 'lantern', x, y: (y0 + y1) / 2, h: roof0 - 1.0, fine: true });
    T.decor.push({ t: 'cloth', x: x + 1.5, y: y0 + 1.4, h0: roof0 - 2.3, h1: roof0 - 0.4, m: x % 12 < 6 ? 'drNoboriRed' : 'craneYellow', fine: true });
    T.decor.push({ t: 'cloth', x: x + 1.5, y: y1 - 1.4, h0: roof0 - 2.3, h1: roof0 - 0.4, m: x % 12 < 6 ? 'containerTeal' : 'bldClothPink', fine: true });
  }
  /* Bicycles parked along the shop fronts, and the shops' signboards out
   * on the paving. */
  const r = rng(31);
  for (let x = x0 + 3; x < x1 - 3; x += 2.2) {
    if (r.chance(0.35)) {
      const yy = r.chance(0.5) ? y0 + 0.9 : y1 - 0.9;
      T.decor.push({ t: 'bike', x, y: yy, fine: true });
    } else if (r.chance(0.3)) {
      const yy = r.chance(0.5) ? y0 + 1.1 : y1 - 1.1;
      pbox(T, r.pick(['white', 'drNoboriRed', 'containerTeal']), x - 0.3, yy - 0.1, 0, x + 0.3, yy + 0.1, 1.0, { solid: false, cast: false, fine: true });
    }
  }
}

/* ------------------------------------------------------------------ */
/* The game: zones, gaps, the start, the marks                         */
/* ------------------------------------------------------------------ */

/* The named gaps, each a rectangle a pilot flies through. `deg` is the
 * heading the gap's width runs across, as the built map's gap reads it:
 * 0 for a gap flown east or west, 90 for one flown north or south. */
export function ekimaeGaps() {
  const M = 0.3;
  const cpBand0 = CP.floor + CP.parapet;
  const cpBand1 = 2 * CP.floor - CP.slab;
  return [
    { name: 'THE SANDWICH', px: FB.x, py: 56, deg: 0, w: 10, h0: FB.rail + 0.5, h1: EXP.girder - 0.4, points: 1000 },
    { name: 'UNDER THE FOOTBRIDGE', px: FB.x, py: 56, deg: 0, w: 10, h0: 0.5, h1: FB.deck0 - M, points: 100 },
    { name: 'OVER THE TOP', px: 150, py: 50, deg: 0, w: 12, h0: EXP.top + 0.4, h1: EXP.top + 2.9 - M, points: 500 },
    { name: 'LANTERN ALLEY', px: (ALLEY.x0 + ALLEY.x1) / 2, py: VIA.y0, deg: 90, w: ALLEY.x1 - ALLEY.x0 - 2.4, h0: M, h1: VIA.lintel - 0.6, points: 500 },
    { name: 'TICKET GATES', px: (STA.pass0 + STA.pass1) / 2, py: STA.y1, deg: 90, w: STA.pass1 - STA.pass0 - 2 * M, h0: 1.2, h1: STA.passH - M - 0.5, points: 500 },
    { name: 'PLATFORM RUN', px: STA.x0 + 6, py: STA.y1 - 3.8, deg: 0, w: 2.0, h0: STA.platform + 0.4, h1: STA.canopy - M, points: 1000 },
    { name: 'CAR PARK', px: CP.x1, py: 86, deg: 0, w: 6, h0: cpBand0 + M, h1: cpBand1 - M, points: 1000 },
    { name: 'PUMP LANE', px: PS.c0, py: (PS.isl[0] + PS.isl[1]) / 2, deg: 0, w: 4.6, h0: 0.5, h1: PS.h0 - M - 0.3, points: 250 },
    { name: 'STONE TORII', px: SHRINE.x, py: SHRINE.torii, deg: 90, w: 2 * SHRINE.toriiHalf - 0.4 - 2 * M, h0: M, h1: SHRINE.toriiH - 0.65 - M, points: 1000 },
    { name: 'SHOTENGAI', px: ARCADE.x1 - 0.6, py: (ARCADE.y0 + ARCADE.y1) / 2, deg: 0, w: ARCADE.y1 - ARCADE.y0 - 2 * M - 1.2, h0: M + 0.4, h1: ARCADE.roof0 - 0.4 - M, points: 250 },
    { name: 'GIRDER GAP', px: (VIA.spans[0][0] + VIA.spans[0][1]) / 2, py: VIA.y1, deg: 90, w: 10, h0: 0.5, h1: VIA.soffit - 0.8 - M, points: 100 },
  ];
}

/* The start: one pad on the car park's roof, looking east down the
 * straight under the expressway. */
export const START = { x: 26, y: 84, yaw: -0.25 };

/*
 * THE HIDDEN KONEX SIGN (the owner's promise of a logo hidden in every
 * map): inside the lantern alley under the tracks, on the east wall of the
 * passage, half way through and 2 m up, so it is read flying the alley.
 */
export function ekimaeMarkSpots() {
  const p = w(ALLEY.x1 - 0.02, (VIA.y0 + VIA.y1) / 2, 2.0);
  return [{
    slug: 'konexdrone', key: 'ekimae#konexdrone~hidden', p, n: [-1, 0, 0], up: [0, 1, 0], w: 1.2,
  }];
}

/* ------------------------------------------------------------------ */
/* The whole place                                                     */
/* ------------------------------------------------------------------ */

/*
 * The layout: everything the map draws and makes solid that is not in the
 * document (./yard.js has the buildings, the poles, the machines, the
 * trees and the cars).
 *
 *   parts   Parts in the world frame: the solids, and what of them is drawn
 *   walls   barrier segments for ./index.js to draw over their capsules
 *   decor   what is drawn and never solid: fences, lanterns, the crowd,
 *           the cars parked in the car park, roofs and rings
 *   signs   the painted signs, on one atlas (./signs.js)
 *   zones   the filming game's clipping zones (src/game/film.js), world
 *   gaps    the named gaps, plan
 *   line    the course's centre line
 */
let memo = null;
export function ekimaeLayout() {
  if (!memo) {
    memo = layoutOnce();
  }
  return memo;
}

function layoutOnce() {
  const T = {
    P: new Parts(), decor: [], signs: [], walls: [], line: courseLine(),
  };
  /* Whether a solid part stands within r of a plan point at the ground. */
  T.solidNear = (x, y, r) => {
    const [wx, , wz] = w(x, y);
    for (const p of T.P.list) {
      if (!p.solid || p.name === 'barrier') {
        continue;
      }
      if (p.t === 'box') {
        if (p.lo[1] > 2.5) {
          continue;
        }
        const dx = Math.max(p.lo[0] - wx, 0, wx - p.hi[0]);
        const dz = Math.max(p.lo[2] - wz, 0, wz - p.hi[2]);
        if (dx * dx + dz * dz < r * r) {
          return true;
        }
      } else if (Math.min(p.a[1], p.b[1]) < 2.5) {
        const ax = p.a[0];
        const az = p.a[2];
        const bx = p.b[0];
        const bz = p.b[2];
        const vx = bx - ax;
        const vz = bz - az;
        const L = vx * vx + vz * vz;
        const t = L > 0 ? Math.max(0, Math.min(1, ((wx - ax) * vx + (wz - az) * vz) / L)) : 0;
        const dx = ax + vx * t - wx;
        const dz = az + vz * t - wz;
        if (dx * dx + dz * dz < (r + p.r) * (r + p.r)) {
          return true;
        }
      }
    }
    return false;
  };
  streets(T);
  expressway(T);
  viaduct(T);
  carPark(T);
  petrol(T);
  koban(T);
  footbridge(T);
  shrine(T);
  rotary(T);
  arcade(T);
  barriers(T);
  fences(T);
  /* The clipping post at turn one's apex, by the police box: a red and
   * white bollard on the inside kerb. */
  const line = T.line;
  const cps = [];
  for (const [k, name] of [[1, 'Koban corner'], [3, 'Rotary'], [7, 'Manji'], [9, 'Petrol hairpin']]) {
    let s = sAt(line, k);
    if (k === 3) {
      /* The hairpin's apex is between its two corners. */
      s = (sAt(line, 3) + sAt(line, 4)) / 2;
    }
    if (k === 9) {
      s = (sAt(line, 9) + sAt(line, 0) + line.length) / 2;
      s %= line.length;
    }
    const sign0 = bendAt(line, s) || 1;
    const q = beside(line, s, (HALF + 1.4) * sign0);
    cps.push({ name, x: q.x, y: q.y });
    if (k === 1 || k === 7) {
      ppost(T, 'mastRed', q.x, q.y, 0, 1.1, 0.12, { kind: 'pole', name: 'clipping post' });
      pbox(T, 'white', q.x - 0.13, q.y - 0.13, 0.55, q.x + 0.13, q.y + 0.13, 0.75, { solid: false, cast: false });
    }
  }
  const zones = [];
  for (const c of cps) {
    const q = w(c.x, c.y);
    zones.push({ name: c.name, x: q[0], z: q[2], r: 15, kind: 'clip' });
  }
  /* Under the tracks, where the station road goes through the steel span:
   * the shot with the train overhead. */
  const u = w(322, 150);
  zones.push({ name: 'Under the tracks', x: u[0], z: u[2], r: 12, kind: 'zone' });
  return {
    line, parts: T.P.list, walls: T.walls, decor: T.decor, signs: T.signs, zones, gaps: ekimaeGaps(), clips: cps,
  };
}
