/*
 * arena.js: Shiroyama FMX, the place. Pure: no Three.js, so its solids, its
 * lanes, its flights and its zones load in Node (scripts/fmx-check.js) as
 * they do in the browser, and the two cannot disagree about where a ramp is.
 *
 * WHAT IT IS. A freestyle motocross show put up for a weekend in a castle
 * park, the way the touring FMX contests are staged in front of a landmark:
 * a dirt floor walled with concrete barriers and painted boards, two steel
 * kickers that throw riders 26 m onto dirt landings, a festival drum tower
 * (a yagura) standing between the landings, scaffold grandstands down both
 * long sides, a big screen over the stage at the east end, floodlight
 * towers at the corners, and over the west end, across the moat, the castle
 * keep on its battered stone base. Not a dome and not a race track: the
 * stadium map and Ridgeline MX are both elsewhere, and this one is a show.
 *
 * THE NUMBERS ARE A REAL FMX SET'S. A rider leaves a 3.5 m steel kicker at
 * 40 degrees doing 13 m/s across the ground (about 61 km/h along the lip),
 * peaks 9.6 m up, clears 26 m from lip to knuckle and lands on a 31 degree
 * dirt face about 4 m past the knuckle, as a matched landing has them. The
 * arc is gravity's at that speed (./profile.js), so a backflip takes the two
 * and a third seconds it takes in a stadium.
 *
 * THE FRAME is the built map's (src/maps/built/place.js): the document's
 * plan in metres from its near left corner, x east and y north, and the
 * world's Three.js metres from the plot's middle, Y up. Every point here is
 * written in the plan and converted once, in w().
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
import { roadOf } from '../built/road.js';

/* The plot, metres. */
export const FIELD_W = 330;
export const FIELD_D = 230;

/* A plan point (x east, y north, h up) as the world's [x, y, z]. */
export function w(x, y, h = 0) {
  return [x - FIELD_W / 2, h, FIELD_D / 2 - y];
}

/* The dirt floor inside the barriers. */
export const ARENA = { x0: 110, x1: 252, y0: 78, y1: 142 };

/*
 * THE RIDERS' LOOP: east along the north lane, a flat U-turn at the east
 * end, west along the south lane, and round again. Corner radius 12, so
 * each end is a half circle 24 m across and the two lanes are 24 m apart.
 */
export const LANE_N = 122;
export const LANE_S = 98;
export const LOOP = { xw: 135, xe: 215, r: 12, width: 6 };

/* The kicker: a steel ramp `len` long, curving up to a lip `lip` high at a
 * slope of `tan` (40 degrees), `half` wide either side of the lane. */
export const KICKER = { len: 7, lip: 3.5, tan: 0.84, half: 2.1 };

/* The landing: a dirt deck `h` high from a timber retaining wall to the
 * knuckle, then a face of slope `slope` (31 degrees) to the floor. The gap
 * is lip to knuckle. Both landings stand either side of the yagura, centred
 * on x = xc, each facing the other way. */
export const LANDING = { xc: 175, deck: 7, h: 5, slope: 0.6, half: 4.6, gap: 26 };
export const LANDING_FACE = LANDING.h / LANDING.slope;

/* Where each lane's set begins, metres from the start of the kicker, as an
 * along-the-lane distance `a`: the kicker 0 to 7, the lip at 7, the wall at
 * lip + gap - deck, the knuckle at lip + gap, the floor at knuckle + face. */
export const SET = {
  kicker: 0,
  lip: KICKER.len,
  wall: KICKER.len + LANDING.gap - LANDING.deck,
  knuckle: KICKER.len + LANDING.gap,
  end: KICKER.len + LANDING.gap + LANDING_FACE,
};

/* The plan x the north set starts at (riders going east) and the south set
 * (riders going west), so both knuckles are LANDING.deck / 2 from xc. */
export const SET_X = {
  n: LANDING.xc + LANDING.deck / 2 - SET.knuckle,
  s: LANDING.xc - LANDING.deck / 2 + SET.knuckle,
};

/* The kicker's curve, height at an along distance a (0 to len): a cubic
 * from a gentle 0.15 at the foot to the lip's slope, as a fabricated FMX
 * ramp is rolled. */
export function kickerAt(a) {
  const L = KICKER.len;
  if (a <= 0) {
    return 0;
  }
  if (a >= L) {
    return KICKER.lip;
  }
  const u = a / L;
  const m0 = 0.15 * L;
  const m1 = KICKER.tan * L;
  const u2 = u * u;
  const u3 = u2 * u;
  return (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * KICKER.lip + (u3 - u2) * m1;
}

/* The landing's ground at an along distance a. */
export function landingAt(a) {
  if (a < SET.wall || a > SET.end) {
    return 0;
  }
  if (a <= SET.knuckle) {
    return LANDING.h;
  }
  return LANDING.h - LANDING.slope * (a - SET.knuckle);
}

/* The set's ground at an along distance a. */
export function setGround(a) {
  return a < SET.wall ? kickerAt(a) : landingAt(a);
}

/* The course as a road element: the loop's four corners, eased at r. */
export function loopElement(id = 'fx-loop') {
  const { xw, xe, r } = LOOP;
  const nodes = [[xw - r, LANE_N], [xe + r, LANE_N], [xe + r, LANE_S], [xw - r, LANE_S]];
  const [x0, y0] = nodes[0];
  return {
    id,
    type: 'road',
    name: '',
    position: { x: x0, y: y0, z: 0 },
    yaw: 0,
    pitch: 0,
    yawOverridden: false,
    closed: true,
    dims: { width: LOOP.width, lanes: 1, radius: r },
    nodes: nodes.map(([x, y]) => ({ x: x - x0, y: y - y0 })),
  };
}

export function loopLine() {
  return roadOf(loopElement()).centre;
}

/* ------------------------------------------------------------------ */
/* The grandstands                                                     */
/* ------------------------------------------------------------------ */

/*
 * Two temporary grandstands, the hired kind: tube and fitting scaffold
 * under raked steel decks. `front` is the plan y of the front kickboard and
 * `dir` the way the rake climbs (+1 north for the north stand). Rows are
 * ROW_D deep and climb ROW_H each, the first tread FRONT_H up. Under the
 * decks is open to the ends and the back: every slab is solid at its own
 * height and nothing fills under it but the scaffold's posts.
 */
export const STAND = {
  x0: 120, x1: 240, rows: 10, rowD: 1.2, rowH: 0.65, frontH: 1.4, slab: 0.25,
};
export const STANDS = [
  { id: 'north', front: 146, dir: 1, roof: true },
  { id: 'south', front: 74, dir: -1, roof: false },
];
/* Row i's tread height. */
export function treadH(i) {
  return STAND.frontH + STAND.rowH * i;
}
/* The posts, plan x: every 4 m from 122. */
export const STAND_POST_X = [];
for (let x = STAND.x0 + 2; x <= STAND.x1 - 2 + 1e-9; x += 4) {
  STAND_POST_X.push(x);
}
/* The north stand's roof: columns every 15 m along the back, a cantilever
 * truss from each to the front, the sheet over them. */
export const ROOF = {
  colX: [], back: 159, front: 145, chordLo: 14, chordHi: 16.4, sheet: 16.6, sheetT: 0.25,
};
for (let x = STAND.x0 + 2.5; x <= STAND.x1 - 2.5 + 1e-9; x += 15) {
  ROOF.colX.push(x);
}

/* ------------------------------------------------------------------ */
/* The rest of the show                                                */
/* ------------------------------------------------------------------ */

/* The yagura, the festival drum tower, between the landings: four legs, a
 * deck at deckY with a striped skirt below it, a hipped roof on posts. */
export const YAGURA = {
  x: LANDING.xc, y: (LANE_N + LANE_S) / 2, half: 3, deckY: 4.3, deckT: 0.3, skirt: 1.1, roofEave: 7.0, roofPeak: 8.7,
};

/* The big screen over the stage at the east end, facing west. */
export const SCREEN = {
  x: 262, y0: 101, y1: 119, z0: 6, z1: 16, t: 0.6, stage: { x0: 256, x1: 268, y0: 97, y1: 123, h: 1.2 },
};

/* The commentary box at the west end, on scaffold, glass to the arena. */
export const BOOTH = {
  x0: 99, x1: 107, y0: 97, y1: 123, legH: 4.2, cabH: 3.2,
};

/* The floodlight towers, plan x and y and their head's facing. */
export const TOWER_H = 30;
export const TOWER_HALF = 0.8;
export const LIGHT_TOWERS = [
  { x: 113, y: 150 }, { x: 247, y: 150 }, { x: 113, y: 70 }, { x: 247, y: 70 },
];

/* The castle: a battered stone base (ishigaki) and five tiers of keep,
 * facing east across the moat to the arena. */
export const CASTLE = {
  x: 45,
  y: 110,
  base: { w0: 36, d0: 30, w1: 28, d1: 22, h: 13, steps: 13 },
  /* Each tier's [width along x, depth along y, wall height]. */
  tiers: [[24, 18, 6], [20, 15, 5], [16, 12, 5], [13, 10, 4.5], [10, 8, 5]],
  eaveOut: 2.0,
  topRise: 4.4,
  moat: { x0: 13, x1: 77, y0: 82, y1: 138, coping: 1.0, copingT: 1.4 },
  bridge: { x0: 63, x1: 77, y: 110, half: 2.2, rise: 2.8, deckT: 0.35 },
};
/* The tiers' bases and tops, worked out once. */
export const KEEP = [];
{
  let y = CASTLE.base.h;
  for (const [tw, td, th] of CASTLE.tiers) {
    KEEP.push({
      w: tw, d: td, y0: y, y1: y + th,
    });
    y += th;
  }
}
export const KEEP_TOP = KEEP[KEEP.length - 1].y1;

/* The pits either side of the castle path at the west end: tents, the
 * riders' bikes on stands. Each is [x0, y0], a tent 12 by 6. */
export const PIT_TENTS = [[82, 124], [82, 132], [82, 82], [82, 90]];

/* The hidden Konex Drone sign: the inside of the yagura's east skirt,
 * facing west, under the deck. Only a quad that flies in between the legs
 * sees it. The world point is the middle of the paint. */
export const KONEX = {
  p: w(YAGURA.x + YAGURA.half - 0.06 - 0.02, YAGURA.y, YAGURA.deckY - YAGURA.skirt / 2),
  n: [-1, 0, 0],
  up: [0, 1, 0],
  w: 1.1,
};

/* ------------------------------------------------------------------ */
/* The solids                                                          */
/* ------------------------------------------------------------------ */

function pbox(P, m, x0, y0, h0, x1, y1, h1, opts) {
  const a = w(x0, y0, h0);
  const b = w(x1, y1, h1);
  return P.box(m, a[0], a[1], a[2], b[0], b[1], b[2], opts);
}

function ppost(P, m, x, y, h0, h1, r, opts) {
  const a = w(x, y, h0);
  return P.post(m, a[0], a[2], h0, h1, r, opts);
}

function pcap(P, m, ax, ay, ah, bx, by, bh, r, opts) {
  return P.cap(m, w(ax, ay, ah), w(bx, by, bh), r, opts);
}

/*
 * THE SETS. A kicker is a row of thin capsules across its surface, a lath
 * every 0.5 m at the curve's height, on four steel legs; under it is open.
 * A landing is a box from its retaining wall to the knuckle, the deck a
 * quad can land on, and a row of capsules down its face. All of it drawn by
 * ./dress.js from the same functions, so the face drawn is the face hit.
 */
function sets(P) {
  for (const [lane, x0, dir] of [[LANE_N, SET_X.n, 1], [LANE_S, SET_X.s, -1]]) {
    const at = (a) => x0 + dir * a;
    const kh = KICKER.half;
    for (let a = 0.5; a <= KICKER.len + 1e-9; a += 0.5) {
      const h = kickerAt(a);
      const r = 0.12;
      pcap(P, 'fxSteel', at(a), lane - kh, Math.max(h - r, 0.02), at(a), lane + kh, Math.max(h - r, 0.02), r, { draw: false, kind: 'wall', name: 'kicker deck' });
    }
    for (const a of [2.6, KICKER.len - 0.15]) {
      for (const side of [-1, 1]) {
        ppost(P, 'fxSteel', at(a), lane + side * (kh - 0.1), 0, kickerAt(a) - 0.1, 0.08, { draw: false, kind: 'pole', name: 'kicker leg' });
      }
    }
    const lh = LANDING.half;
    pbox(P, 'fxDirt', at(SET.wall), lane - lh, 0, at(SET.knuckle), lane + lh, LANDING.h, { draw: false, name: 'landing deck' });
    for (let a = SET.knuckle + 0.35; a < SET.end - 0.2; a += 0.7) {
      const h = landingAt(a);
      const r = 0.4;
      if (h < 0.15) {
        continue;
      }
      pcap(P, 'fxDirt', at(a), lane - lh, Math.max(h - r, 0), at(a), lane + lh, Math.max(h - r, 0), r, { draw: false, kind: 'wall', name: 'landing face' });
    }
  }
}

/* The barrier round the floor: concrete blocks 0.8 m high with painted
 * boards on them to 1.7 m, an opening at the west end where the riders come
 * in. Drawn by ./dress.js; solid here. */
export const WALL = { t: 0.6, h: 1.7, gateY0: 103, gateY1: 117 };
function barrier(P) {
  const { x0, x1, y0, y1 } = ARENA;
  const t = WALL.t;
  pbox(P, 'concrete', x0, y0 - t, 0, x1, y0, WALL.h, { draw: false, name: 'barrier' });
  pbox(P, 'concrete', x0, y1, 0, x1, y1 + t, WALL.h, { draw: false, name: 'barrier' });
  pbox(P, 'concrete', x1, y0 - t, 0, x1 + t, y1 + t, WALL.h, { draw: false, name: 'barrier' });
  pbox(P, 'concrete', x0 - t, y0 - t, 0, x0, WALL.gateY0, WALL.h, { draw: false, name: 'barrier' });
  pbox(P, 'concrete', x0 - t, WALL.gateY1, 0, x0, y1 + t, WALL.h, { draw: false, name: 'barrier' });
}

function stands(P) {
  const { x0, x1, rows, rowD, slab } = STAND;
  for (const S of STANDS) {
    const yAt = (k) => S.front + S.dir * k;
    /* The kickboard, the treads and the risers between them. */
    pbox(P, 'fxBoard', x0, yAt(0), 0, x1, yAt(0.12), treadH(0), { draw: false, name: 'stand front' });
    for (let i = 0; i < rows; i += 1) {
      const h = treadH(i);
      pbox(P, 'fxDeck', x0, yAt(i * rowD), h - slab, x1, yAt((i + 1) * rowD), h, { draw: false, name: 'stand tread' });
      if (i > 0) {
        pbox(P, 'fxDeck', x0, yAt(i * rowD), treadH(i - 1), x1, yAt(i * rowD + 0.06), h, { draw: false, name: 'stand riser' });
      }
    }
    /* The back rail. */
    const back = yAt(rows * rowD);
    pbox(P, 'scaffold', x0, back, treadH(rows - 1), x1, yAt(rows * rowD + 0.08), treadH(rows - 1) + 1.1, { draw: false, name: 'stand rail' });
    /* The posts: every 4 m along, at the back edge of every third row. */
    for (const k of [1, 4, 7, 10]) {
      const i = Math.min(k, rows) - 1;
      const y = yAt(Math.min(k, rows) * rowD - 0.1);
      for (const x of STAND_POST_X) {
        ppost(P, 'scaffold', x, y, 0, treadH(i) - slab, 0.06, { draw: false, kind: 'pole', name: 'stand post' });
      }
    }
    if (S.roof) {
      for (const x of ROOF.colX) {
        ppost(P, 'fxSteel', x, ROOF.back, 0, ROOF.sheet, 0.28, { draw: false, kind: 'pole', name: 'roof column' });
        pbox(P, 'fxSteel', x - 0.3, ROOF.front, ROOF.chordLo, x + 0.3, ROOF.back, ROOF.chordHi, { draw: false, name: 'roof truss' });
      }
      pbox(P, 'fxRoofSheet', x0 - 1, ROOF.front - 0.5, ROOF.sheet, x1 + 1, ROOF.back + 0.6, ROOF.sheet + ROOF.sheetT, { draw: false, name: 'stand roof' });
    }
  }
}

function yagura(P) {
  const { x, y, half, deckY, deckT, skirt, roofEave } = YAGURA;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ppost(P, 'fxTimber', x + dx * (half - 0.15), y + dy * (half - 0.15), 0, roofEave, 0.15, { draw: false, kind: 'pole', name: 'yagura leg' });
  }
  pbox(P, 'fxTimber', x - half, y - half, deckY, x + half, y + half, deckY + deckT, { draw: false, name: 'yagura deck' });
  /* The skirt, four thin boards, so the inside is open. */
  const t = 0.06;
  const s0 = deckY - skirt;
  pbox(P, 'fxKohaku', x - half, y - half, s0, x + half, y - half + t, deckY, { draw: false, name: 'yagura skirt' });
  pbox(P, 'fxKohaku', x - half, y + half - t, s0, x + half, y + half, deckY, { draw: false, name: 'yagura skirt' });
  pbox(P, 'fxKohaku', x - half, y - half, s0, x - half + t, y + half, deckY, { draw: false, name: 'yagura skirt' });
  pbox(P, 'fxKohaku', x + half - t, y - half, s0, x + half, y + half, deckY, { draw: false, name: 'yagura skirt' });
  pbox(P, 'fxRoof', x - half - 0.8, y - half - 0.8, roofEave, x + half + 0.8, y + half + 0.8, roofEave + 0.5, { draw: false, name: 'yagura roof' });
  pbox(P, 'fxRoof', x - 1.6, y - 1.6, roofEave + 0.5, x + 1.6, y + 1.6, YAGURA.roofPeak - 0.3, { draw: false, name: 'yagura roof' });
  /* The drum on the deck. */
  pcap(P, 'fxTimber', x, y, deckY + deckT + 0.7, x, y, deckY + deckT + 0.7, 0.75, { draw: false, kind: 'obstacle', name: 'taiko' });
}

function screen(P) {
  const { x, y0, y1, z0, z1, t, stage } = SCREEN;
  pbox(P, 'fxScreen', x - t / 2, y0, z0, x + t / 2, y1, z1, { draw: false, name: 'big screen' });
  pbox(P, 'fxDeck', stage.x0, stage.y0, 0, stage.x1, stage.y1, stage.h, { draw: false, name: 'stage' });
  for (const yy of [y0 + 0.4, y1 - 0.4]) {
    for (const xx of [x + 0.5, x + 3.2]) {
      ppost(P, 'scaffold', xx, yy, stage.h, z1 + 0.5, 0.07, { draw: false, kind: 'pole', name: 'screen post' });
    }
  }
}

function booth(P) {
  const { x0, x1, y0, y1, legH, cabH } = BOOTH;
  /* No leg in the riders' way: the barrier's opening between the middle two is
   * where they ride in under the booth. */
  for (const yy of [y0 + 0.3, WALL.gateY0 + 0.3, WALL.gateY1 - 0.3, y1 - 0.3]) {
    for (const xx of [x0 + 0.3, x1 - 0.3]) {
      ppost(P, 'scaffold', xx, yy, 0, legH, 0.07, { draw: false, kind: 'pole', name: 'booth leg' });
    }
  }
  pbox(P, 'fxDeck', x0, y0, legH, x1, y1, legH + 0.25, { draw: false, name: 'booth floor' });
  pbox(P, 'wallWhite', x0, y0, legH + 0.25, x1 - 0.3, y1, legH + cabH, { draw: false, name: 'booth' });
  pbox(P, 'fxRoof', x0 - 0.5, y0 - 0.5, legH + cabH, x1 + 0.8, y1 + 0.5, legH + cabH + 0.3, { draw: false, name: 'booth roof' });
}

/* The floodlight towers: four chords, a rung every 2.5 m (solid: the
 * lattice is a line), the head and its lamp frame. */
function towers(P) {
  const h = TOWER_HALF;
  for (const T of LIGHT_TOWERS) {
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ppost(P, 'fxSteel', T.x + dx * h, T.y + dy * h, 0, TOWER_H, 0.09, { draw: false, kind: 'pole', name: 'tower chord' });
    }
    for (let z = 2.5; z < TOWER_H - 1; z += 2.5) {
      pcap(P, 'fxSteel', T.x - h, T.y - h, z, T.x + h, T.y - h, z, 0.04, { draw: false, kind: 'pole', name: 'tower rung' });
      pcap(P, 'fxSteel', T.x - h, T.y + h, z, T.x + h, T.y + h, z, 0.04, { draw: false, kind: 'pole', name: 'tower rung' });
      pcap(P, 'fxSteel', T.x - h, T.y - h, z, T.x - h, T.y + h, z, 0.04, { draw: false, kind: 'pole', name: 'tower rung' });
      pcap(P, 'fxSteel', T.x + h, T.y - h, z, T.x + h, T.y + h, z, 0.04, { draw: false, kind: 'pole', name: 'tower rung' });
    }
    /* The head: a lamp frame 7 m wide square to the arena's middle, as
     * an axis aligned box across x (the towers stand at the corners and
     * light the floor across its length). */
    const sy = T.y > 110 ? -1 : 1;
    pbox(P, 'fxSteel', T.x - 3.5, T.y + sy * 0.2, TOWER_H, T.x + 3.5, T.y + sy * 0.9, TOWER_H + 3.6, { draw: false, name: 'lamp frame' });
  }
}

/* The castle's base, stepped a metre at a time to its batter, the keep's
 * tiers, and each tier's eave as two slabs under the drawn roof. */
function castle(P) {
  const { x, y, base, eaveOut, moat, bridge } = CASTLE;
  for (let i = 0; i < base.steps; i += 1) {
    const u = (i + 0.5) / base.steps;
    const hw = (base.w0 + (base.w1 - base.w0) * u) / 2;
    const hd = (base.d0 + (base.d1 - base.d0) * u) / 2;
    const h0 = (base.h * i) / base.steps;
    const h1 = (base.h * (i + 1)) / base.steps;
    pbox(P, 'fxStone', x - hw, y - hd, h0, x + hw, y + hd, h1, { draw: false, name: 'ishigaki' });
  }
  KEEP.forEach((T, i) => {
    pbox(P, 'fxPlaster', x - T.w / 2, y - T.d / 2, T.y0, x + T.w / 2, y + T.d / 2, T.y1, { draw: false, name: 'keep' });
    const next = KEEP[i + 1];
    const ow = T.w / 2 + eaveOut;
    const od = T.d / 2 + eaveOut;
    if (next) {
      /* The skirt roof from the eave up to the next tier's wall: an outer
       * slab at the eave, an inner one half way up. */
      pbox(P, 'fxRoof', x - ow, y - od, T.y1 - 0.75, x + ow, y + od, T.y1 - 0.35, { draw: false, name: 'eave' });
      const iw = (ow + next.w / 2) / 2;
      const id = (od + next.d / 2) / 2;
      pbox(P, 'fxRoof', x - iw, y - id, T.y1 - 0.35, x + iw, y + id, T.y1 + 0.45, { draw: false, name: 'eave' });
    } else {
      /* The top roof, hipped: three slabs climbing to the ridge. */
      for (let k = 0; k < 3; k += 1) {
        const f = k / 3;
        const hw = ow - (ow - 2.5) * f;
        const hd = od - (od - 0.6) * f;
        pbox(P, 'fxRoof', x - hw, y - hd, T.y1 - 0.6 + CASTLE.topRise * f, x + hw, y + hd, T.y1 - 0.6 + CASTLE.topRise * (f + 1 / 3), { draw: false, name: 'top roof' });
      }
    }
  });
  /* The moat's outer wall, a stone coping round the water, open where the
   * bridge lands. */
  const { x0, x1, y0, y1, coping, copingT } = moat;
  pbox(P, 'fxStone', x0 - copingT, y0 - copingT, 0, x1 + copingT, y0, coping, { draw: false, name: 'moat wall' });
  pbox(P, 'fxStone', x0 - copingT, y1, 0, x1 + copingT, y1 + copingT, coping, { draw: false, name: 'moat wall' });
  pbox(P, 'fxStone', x0 - copingT, y0, 0, x0, y1, coping, { draw: false, name: 'moat wall' });
  pbox(P, 'fxStone', x1, y0, 0, x1 + copingT, bridge.y - bridge.half, coping, { draw: false, name: 'moat wall' });
  pbox(P, 'fxStone', x1, bridge.y + bridge.half, 0, x1 + copingT, y1, coping, { draw: false, name: 'moat wall' });
  /* The bridge: its arched deck as a run of short slabs, and its rails. */
  const n = 14;
  for (let i = 0; i < n; i += 1) {
    const xa = bridge.x0 + ((bridge.x1 - bridge.x0) * i) / n;
    const xb = bridge.x0 + ((bridge.x1 - bridge.x0) * (i + 1)) / n;
    const h = bridgeAt((xa + xb) / 2);
    pbox(P, 'fxVermilion', xa, bridge.y - bridge.half, h - bridge.deckT, xb, bridge.y + bridge.half, h, { draw: false, name: 'bridge deck' });
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 6; i += 1) {
      const xx = bridge.x0 + 0.4 + ((bridge.x1 - bridge.x0 - 0.8) * i) / 6;
      ppost(P, 'fxVermilion', xx, bridge.y + side * (bridge.half - 0.1), bridgeAt(xx), bridgeAt(xx) + 1.0, 0.07, { draw: false, kind: 'pole', name: 'bridge post' });
    }
  }
}

/* The bridge deck's top at plan x: a flattened arch. */
export function bridgeAt(x) {
  const { x0, x1, rise } = CASTLE.bridge;
  const u = (x - x0) / (x1 - x0);
  const v = 4 * u * (1 - u);
  return 0.6 + rise * v * (1.5 - 0.5 * v);
}

/* The pits' tents, solid at their canopy and their legs. */
function pit(P) {
  for (const [x0, y0] of PIT_TENTS) {
    pbox(P, 'white', x0, y0, 2.5, x0 + 12, y0 + 6, 2.75, { draw: false, name: 'pit tent' });
    for (const [xx, yy] of [[x0 + 0.15, y0 + 0.15], [x0 + 11.85, y0 + 0.15], [x0 + 0.15, y0 + 5.85], [x0 + 11.85, y0 + 5.85]]) {
      ppost(P, 'fxSteel', xx, yy, 0, 2.5, 0.05, { draw: false, kind: 'pole', name: 'tent leg' });
    }
  }
}

/* ------------------------------------------------------------------ */
/* The game's circles                                                  */
/* ------------------------------------------------------------------ */

function zones() {
  const out = [];
  const at = (name, x, y, r) => {
    const q = w(x, y);
    out.push({ name, x: q[0], z: q[2], r });
  };
  at('Kicker', SET_X.n + SET.lip, LANE_N, 14);
  at('Kicker', SET_X.s - SET.lip, LANE_S, 14);
  at('Landing', SET_X.n + SET.knuckle + 4, LANE_N, 11);
  at('Landing', SET_X.s - SET.knuckle - 4, LANE_S, 11);
  at('Yagura', YAGURA.x, YAGURA.y, 9);
  return out;
}

/*
 * Everything the place is, worked out once.
 *
 *   parts   Parts: the solids. Every one is draw: false; ./dress.js draws
 *           the place over them from the same constants
 *   zones   { name, x, z, r } circles in the world, for the camera judge
 */
let MEMO = null;
export function arenaLayout() {
  if (MEMO) {
    return MEMO;
  }
  const P = new Parts();
  sets(P);
  barrier(P);
  stands(P);
  yagura(P);
  screen(P);
  booth(P);
  towers(P);
  castle(P);
  pit(P);
  MEMO = { parts: P.list, zones: zones(), line: loopLine() };
  return MEMO;
}
