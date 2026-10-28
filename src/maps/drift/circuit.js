/*
 * circuit.js: Drift Matsuri, the place. Pure: no Three.js, so its solids,
 * its road and its zones load in Node (scripts/drift-check.js) as they do in
 * the browser, and the two cannot disagree about where a wall is.
 *
 * WHAT IT IS. A drift circuit on a mountainside in spring, at a festival:
 * the owner's ask of 28 October 2026, "design and build a mini game map
 * where goal is to film drift races ... Research international drift
 * racing, and the sakura festival japanse drift racing world to get the
 * tracks and settings". Its bones come from Ebisu Circuit in Fukushima,
 * where the Drift Matsuri runs for thirty six hours three times a year and
 * the spring one is under the cherry blossom, and from how D1 and Formula
 * Drift lay a course out to be judged:
 *
 *   - THE FRONT STRAIGHT past the covered pits, as Ebisu's Minami course
 *     runs past its pit building, with the crowd on the pit roof.
 *   - TURN ONE, a long fast sweeper round the outside wall. In D1 the outer
 *     wall of a bend is an OUTER ZONE, painted in red and white blocks, and
 *     a rear bumper that brushes it scores; here the blocks are the wall.
 *     The spectator bank stands behind it under the trees.
 *   - THE TORII KINK, a flick under a festival torii through an avenue of
 *     cherries: the shot everybody wants.
 *   - THE HAIRPIN round a tyre wall, with a CLIPPING POINT, the post at
 *     the inside apex a judge watches the front of the car to.
 *   - THE MANJI, an S through the infield where a tandem pair change
 *     direction together, kerbed at each apex, back onto the straight.
 *
 * In the infield are the judges' tower, where the pilot starts with the
 * whole course below, and the festival: stalls under striped awnings,
 * lantern strings, nobori banners on poles. Round the outside, sakura and
 * pines, and the town's ridge lines behind (the built map's backdrop).
 *
 * THE FRAME is the built map's (src/maps/built/place.js): the document's
 * plan in metres from its near left corner, x east and y north, and the
 * world's Three.js metres from the plot's middle, Y up. Every point here is
 * written in the plan and converted once, in w(); every box goes through
 * Parts as the house maps' do, so a wall is drawn and solid from the same
 * six numbers. A barrier along a bend cannot be a box on the axes, so it is
 * a capsule lying along the road edge, solid and undrawn, under a drawn
 * block turned onto it (./index.js draws them).
 *
 * WHAT THE GAME READS (src/game/film.js): ZONES, the circles round the
 * clipping zones and points where a shot counts for more, and GROUPS, which
 * cars run together (a tandem pair, the train), so a shot with all of a
 * group in it is a tandem shot.
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
import { roadOf, pointAt, nearestOn } from '../built/road.js';

/* The plot, metres. */
export const FIELD_W = 340;
export const FIELD_D = 230;

/* A plan point (x east, y north, h up) as the world's [x, y, z]. */
export function w(x, y, h = 0) {
  return [x - FIELD_W / 2, h, FIELD_D / 2 - y];
}

/*
 * THE COURSE, its corners in the plan, driven in this order. The road is a
 * closed road of one lane (src/maps/built/road.js), so every car drives its
 * centre line, and the built map's bend radius eases every corner. 731 m
 * round, measured by roadOf; at the drift car's pace that is a lap in a
 * little under a minute, which is one take.
 */
export const COURSE_NODES = [
  [60, 50], [230, 50], [278, 80], [280, 128], [248, 162], [190, 166],
  [150, 148], [110, 168], [60, 178], [38, 152], [66, 128], [108, 112],
  [88, 88], [42, 80], [30, 58],
];
export const ROAD_WIDTH = 14;
export const ROAD_RADIUS = 22;

export function courseElement() {
  const [x0, y0] = COURSE_NODES[0];
  return {
    id: 'el-1',
    type: 'road',
    name: '',
    position: { x: x0, y: y0, z: 0 },
    yaw: 0,
    pitch: 0,
    yawOverridden: false,
    closed: true,
    dims: { width: ROAD_WIDTH, lanes: 1, radius: ROAD_RADIUS },
    nodes: COURSE_NODES.map(([x, y]) => ({ x: x - x0, y: y - y0 })),
  };
}

/* The centre line as the cars drive it. */
export function courseLine() {
  return roadOf(courseElement()).centre;
}

/* The arc length round the course of the point nearest a corner. */
function sAt(line, k) {
  const [x, y] = COURSE_NODES[k];
  return nearestOn(line, x, y).s;
}

/* Which way the line bends at s: +1 left, -1 right, 0 straight. */
function bendAt(line, s) {
  const a = pointAt(line, s - 3);
  const b = pointAt(line, s + 3);
  const cross = a.tx * b.ty - a.ty * b.tx;
  return cross > 1e-3 ? 1 : (cross < -1e-3 ? -1 : 0);
}

/* The arcs of road a feature runs along, from corner to corner and a
 * margin either side. */
function arc(line, k0, k1, before = 0, after = 0) {
  let s0 = sAt(line, k0) - before;
  let s1 = sAt(line, k1) + after;
  if (s1 < s0) {
    s1 += line.length;
  }
  return [s0, s1];
}

/*
 * THE BARRIERS. A run of segments along one side of the road, `off` metres
 * from the centre to the barrier's middle, each a capsule lying at its
 * height (solid, not drawn) and a block drawn over it (./index.js). `side`
 * is 'out' for the outside of the bend at each point, or +1 / -1 for the
 * line's left or right everywhere. `look` says how it is drawn: 'zone' red
 * and white blocks, 'wall' plain concrete, 'tyres' a stacked tyre wall.
 */
const SEG = 4;
function barrier(line, s0, s1, side, off, look, out) {
  const n = Math.max(1, Math.round((s1 - s0) / SEG));
  const step = (s1 - s0) / n;
  for (let i = 0; i < n; i += 1) {
    const sa = s0 + i * step;
    const sb = sa + step;
    const sm = (sa + sb) / 2;
    let sign = side;
    if (side === 'out') {
      const b = bendAt(line, sm);
      sign = b === 0 ? out.lastSign ?? 1 : -b;
    }
    out.lastSign = sign;
    const pa = pointAt(line, sa);
    const pb = pointAt(line, sb);
    const a = [pa.x - pa.ty * off * sign, pa.y + pa.tx * off * sign];
    const b = [pb.x - pb.ty * off * sign, pb.y + pb.tx * off * sign];
    out.list.push({ a, b, look, i });
  }
}

/* Kerbs at an apex: red and white blocks along the inside edge, flat on the
 * paving and not solid. */
function kerbs(line, s0, s1, out) {
  const n = Math.max(1, Math.round((s1 - s0) / 1.5));
  const step = (s1 - s0) / n;
  for (let i = 0; i < n; i += 1) {
    const sm = s0 + (i + 0.5) * step;
    const sign = bendAt(line, sm) || 1;
    const p = pointAt(line, sm);
    const off = ROAD_WIDTH / 2 - 0.35;
    out.push({ x: p.x - p.ty * off * sign, y: p.y + p.tx * off * sign, tx: p.tx, ty: p.ty, len: step, red: i % 2 === 0 });
  }
}

/* A plan point `off` metres to the left (+) of the line at s. */
function beside(line, s, off) {
  const p = pointAt(line, s);
  return { x: p.x - p.ty * off, y: p.y + p.tx * off, tx: p.tx, ty: p.ty };
}

/* ------------------------------------------------------------------ */
/* The buildings, on the axes                                          */
/* ------------------------------------------------------------------ */

/* A box in the plan: x and y the plan's, h up. */
function pbox(P, m, x0, y0, h0, x1, y1, h1, opts) {
  const a = w(x0, y0, h0);
  const b = w(x1, y1, h1);
  return P.box(m, a[0], a[1], a[2], b[0], b[1], b[2], opts);
}

function ppost(P, m, x, y, h0, h1, r, opts) {
  const a = w(x, y, h0);
  return P.post(m, a[0], a[2], h0, h1, r, opts);
}

/*
 * THE PITS, south of the straight: a long building open to the pit lane,
 * a garage every ten metres between square columns, a flat roof with a
 * parapet, and the crowd up on it. The covered pits are a line: a five inch
 * fits under the roof between the columns and out the back of a bay
 * through its open door.
 */
export const PITS = { x0: 70, x1: 220, y0: 14, y1: 30, h: 5.2 };
function pits(P, decor) {
  const { x0, x1, y0, y1, h } = PITS;
  /* The back wall, with a door at the back of every other bay. */
  for (let x = x0; x < x1; x += 10) {
    const door = ((x - x0) / 10) % 2 === 1;
    if (door) {
      pbox(P, 'wallCream', x, y0, 0, x + 3, y0 + 0.4, h);
      pbox(P, 'wallCream', x + 7, y0, 0, x + 10, y0 + 0.4, h);
      pbox(P, 'wallCream', x + 3, y0, 3.2, x + 7, y0 + 0.4, h);
    } else {
      pbox(P, 'wallCream', x, y0, 0, x + 10, y0 + 0.4, h);
    }
  }
  /* The end walls, and a column between every bay at the front. */
  pbox(P, 'wallCream', x0, y0, 0, x0 + 0.4, y1, h);
  pbox(P, 'wallCream', x1 - 0.4, y0, 0, x1, y1, h);
  for (let x = x0 + 10; x < x1; x += 10) {
    pbox(P, 'concrete', x - 0.3, y1 - 0.6, 0, x + 0.3, y1, h);
    /* A partition half way back between bays, so each is a garage. */
    pbox(P, 'concreteMid', x - 0.1, y0 + 0.4, 0, x + 0.1, y0 + 7, 2.8);
  }
  /* The roof and its parapet: the stand for the pit crowd. */
  pbox(P, 'concreteMid', x0, y0, h, x1, y1, h + 0.4);
  pbox(P, 'white', x0, y1 - 0.3, h + 0.4, x1, y1, h + 1.4);
  pbox(P, 'white', x0, y0, h + 0.4, x1, y0 + 0.3, h + 1.4);
  /* A shutter band painted over the back of each bay that has no door,
   * and the crowd: three rows along the parapet. */
  for (let x = x0; x < x1; x += 10) {
    decor.push({ t: 'shutter', x: x + 5, y: y0 + 0.42, h0: 0.2, h1: 3.0, wd: 7.2 });
  }
  crowdRows(P, decor, x0 + 2, x1 - 2, y1 - 1.0, h + 0.4, 3, -1.1, 'x');
  /* Lanterns along the eave, over the pit lane. */
  decor.push({ t: 'string', a: [x0 + 1, y1 + 0.2, h - 0.2], b: [x1 - 1, y1 + 0.2, h - 0.2], sag: 0.6, every: 2.4 });
}

/*
 * A CROWD: rows of people, each a body in one of the shirt colours and a
 * head, painted (decor), and one solid box over each row so a quad that
 * flies into the crowd hits it rather than passing through people. `along`
 * says which plan axis the rows run on; `dy` is how far back each next row
 * stands (signed) and each one stands 0.6 m higher.
 */
export const SHIRTS = ['wallBlue', 'awning', 'white', 'craneYellow', 'containerTeal', 'drIndigo'];
function crowdRows(P, decor, a0, a1, at, h, rows, dy, along, rise = 0) {
  let seat = 0;
  for (let r = 0; r < rows; r += 1) {
    const c = at + dy * r;
    const hh = h + rise * r;
    for (let a = a0; a <= a1; a += 1.15) {
      seat += 1;
      /* A gap now and then, so a row reads as people and not a fence. */
      if ((seat * 7) % 11 === 0) {
        continue;
      }
      const jitter = ((seat * 37) % 9) / 30 - 0.13;
      const x = along === 'x' ? a + jitter : c;
      const y = along === 'x' ? c : a + jitter;
      decor.push({
        t: 'fan', x, y, h: hh, shirt: SHIRTS[(seat * 5 + r) % SHIRTS.length], tall: 1.5 + ((seat * 13) % 5) * 0.05, cheer: (seat * 11) % 4 === 0,
      });
    }
    if (along === 'x') {
      pbox(P, 'white', a0, c - 0.35, hh, a1, c + 0.35, hh + 1.6, { draw: false, kind: 'obstacle', name: 'crowd' });
    } else {
      pbox(P, 'white', c - 0.35, a0, hh, c + 0.35, a1, hh + 1.6, { draw: false, kind: 'obstacle', name: 'crowd' });
    }
  }
}

/*
 * THE BANK behind turn one: concrete terraces stepping up away from the
 * wall, facing the course, with a crowd on every step and the cherries
 * behind. Solid steps, so the bank is somewhere to land.
 */
export const BANK = { x0: 300, y0: 66, y1: 150, steps: 5, depth: 1.6, rise: 0.7 };
function bank(P, decor) {
  const { x0, y0, y1, steps, depth, rise } = BANK;
  for (let i = 0; i < steps; i += 1) {
    pbox(P, i % 2 ? 'concrete' : 'concreteMid', x0 + i * depth, y0, 0, x0 + (i + 1) * depth, y1, rise * (i + 1));
  }
  crowdRows(P, decor, y0 + 2, y1 - 2, x0 + 0.8, rise, steps, depth, 'y', rise);
  /* Nobori along its front. */
  for (let y = y0 + 3; y < y1; y += 9) {
    nobori(P, decor, x0 - 1.2, y, (y / 9) | 0);
  }
}

/* A nobori: a tall pole and the long cloth hung down its side. */
const NOBORI = ['drNoboriRed', 'drIndigo', 'white', 'craneYellow'];
function nobori(P, decor, x, y, k) {
  ppost(P, 'flagMast', x, y, 0, 5.4, 0.05, { kind: 'pole', name: 'nobori' });
  const i = Math.floor(k);
  decor.push({ t: 'cloth', x, y, h0: 2.3, h1: 5.1, m: NOBORI[((i % NOBORI.length) + NOBORI.length) % NOBORI.length] });
}

/*
 * THE JUDGES' TOWER in the infield, where the pilot starts: four legs, a
 * deck, a glazed cabin the judges sit in, and its roof, which is the camera
 * platform the start pad stands on. From up there the whole course is
 * below: the straight, turn one and its bank, the torii, the hairpin and
 * the manji.
 */
export const TOWER = { x: 168, y: 112, half: 3.2, deck: 8, top: 11.6 };
function tower(P, decor) {
  const { x, y, half, deck, top } = TOWER;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ppost(P, 'metal', x + dx * (half - 0.4), y + dy * (half - 0.4), 0, deck, 0.22, { kind: 'pole', name: 'tower leg' });
  }
  /* Cross bracing, drawn only: thin, and the legs are what is hit. */
  decor.push({ t: 'brace', x, y, half: half - 0.4, h0: 0.6, h1: deck - 0.6 });
  pbox(P, 'concreteMid', x - half, y - half, deck, x + half, y + half, deck + 0.35);
  /* The cabin: solid walls below and above a glazed band (painted). */
  const c = half - 0.6;
  pbox(P, 'wallWhite', x - c, y - c, deck + 0.35, x + c, y + c, deck + 1.2);
  pbox(P, 'glassBlue', x - c + 0.05, y - c + 0.05, deck + 1.2, x + c - 0.05, y + c - 0.05, deck + 2.6);
  pbox(P, 'wallWhite', x - c, y - c, deck + 2.6, x + c, y + c, top - 0.3);
  pbox(P, 'drIndigo', x - half, y - half, top - 0.3, x + half, y + half, top);
  /* The ladder up a leg, drawn. */
  decor.push({ t: 'ladder', a: [x - half + 0.4, y - half - 0.3, 0], b: [x - half + 0.4, y - half - 0.3, deck] });
}

/*
 * THE FESTIVAL: two rows of stalls facing each other across a walk, under
 * lantern strings, nobori at each end. The yatai are a counter, four posts
 * and a striped awning, every one a different stripe colour.
 */
export const FAIR = { x0: 196, x1: 258, y: 112, walk: 7 };
const AWNINGS = ['awning', 'drIndigo', 'containerTeal', 'drNoboriRed', 'craneYellow'];
function fair(P, decor) {
  const { x0, x1, y, walk } = FAIR;
  let k = 0;
  for (let x = x0; x + 4 <= x1; x += 5) {
    for (const side of [-1, 1]) {
      const yf = y + side * walk / 2;
      const yb = yf + side * 3;
      k += 1;
      const lo = Math.min(yf, yb);
      const hi = Math.max(yf, yb);
      /* The counter at the front, the back wall, the posts and the roof. */
      pbox(P, 'plywood', x, side < 0 ? hi - 0.7 : lo, 0, x + 4, side < 0 ? hi : lo + 0.7, 1.0);
      pbox(P, 'plywood', x, side < 0 ? lo : hi - 0.2, 0, x + 4, side < 0 ? lo + 0.2 : hi, 2.3);
      for (const px of [x + 0.15, x + 3.85]) {
        ppost(P, 'trunk', px, yf, 0, 2.5, 0.08, { name: 'stall post' });
      }
      pbox(P, 'white', x - 0.2, lo - 0.3, 2.5, x + 4.2, hi + 0.3, 2.7, { draw: false, name: 'awning' });
      decor.push({ t: 'awning', x0: x - 0.2, x1: x + 4.2, y0: lo - 0.3, y1: hi + 0.3, h: 2.5, m: AWNINGS[k % AWNINGS.length] });
      decor.push({ t: 'lantern', x: x + 1, y: yf + side * -0.35, h: 2.2 });
      decor.push({ t: 'lantern', x: x + 3, y: yf + side * -0.35, h: 2.2 });
    }
  }
  /* Lantern strings across the walk, pole to pole. */
  for (let x = x0 - 1; x <= x1 + 1; x += 10) {
    ppost(P, 'trunk', x, y - walk / 2 - 3.6, 0, 6, 0.1, { name: 'lantern pole' });
    ppost(P, 'trunk', x, y + walk / 2 + 3.6, 0, 6, 0.1, { name: 'lantern pole' });
    decor.push({ t: 'string', a: [x, y - walk / 2 - 3.6, 5.8], b: [x, y + walk / 2 + 3.6, 5.8], sag: 0.9, every: 1.4 });
  }
  decor.push({ t: 'string', a: [x0 - 1, y - walk / 2 - 3.6, 5.8], b: [x1 + 1, y - walk / 2 - 3.6, 5.8], sag: 1.1, every: 1.8 });
  decor.push({ t: 'string', a: [x0 - 1, y + walk / 2 + 3.6, 5.8], b: [x1 + 1, y + walk / 2 + 3.6, 5.8], sag: 1.1, every: 1.8 });
  for (const x of [x0 - 3, x1 + 3]) {
    for (const s of [-1, 1]) {
      nobori(P, decor, x, y + s * 2.5, x + s);
    }
  }
}

/*
 * THE TORII over the kink: two vermilion pillars either side of the road,
 * the nuki tie beam through them, the black capped kasagi over the top
 * with its ends swept up, and the plaque between. Turned square to the road
 * where the cars pass under it, so its beams are capsules (solid) under
 * blocks drawn turned onto them.
 */
export const TORII_SPAN = 12;
function torii(line, P, decor) {
  const s = sAt(line, 6);
  const p = pointAt(line, s);
  const n = [-p.ty, p.tx];
  const L = [p.x + n[0] * TORII_SPAN, p.y + n[1] * TORII_SPAN];
  const R = [p.x - n[0] * TORII_SPAN, p.y - n[1] * TORII_SPAN];
  for (const q of [L, R]) {
    ppost(P, 'drToriiRed', q[0], q[1], 0, 10.8, 0.62, { kind: 'wall', name: 'torii pillar', seg: 12 });
    decor.push({ t: 'plinth', x: q[0], y: q[1] });
  }
  const over = 2.6;
  const LL = [p.x + n[0] * (TORII_SPAN + over), p.y + n[1] * (TORII_SPAN + over)];
  const RR = [p.x - n[0] * (TORII_SPAN + over), p.y - n[1] * (TORII_SPAN + over)];
  const cap = (a, b, h, r, name) => P.cap('drToriiRed', w(a[0], a[1], h), w(b[0], b[1], h), r, { draw: false, kind: 'wall', name });
  cap(L, R, 8.7, 0.32, 'torii nuki');
  cap(LL, RR, 10.9, 0.45, 'torii kasagi');
  decor.push({ t: 'torii', c: [p.x, p.y], n, span: TORII_SPAN, over });
  return { x: p.x, y: p.y, s };
}

/*
 * EVERYTHING ELSE THE PLACE IS, worked out once from the course.
 *
 *   parts     Parts on the axes and capsules: the solids, and what of them
 *             is drawn
 *   walls     barrier segments for ./index.js to draw over their capsules
 *   kerbs     red and white kerb blocks, painted
 *   decor     painted things: the crowd, lanterns, cloth, awnings, the
 *             torii's beams, shutters
 *   zones     the game's clipping zones and points (src/game/film.js),
 *             circles in the world: { name, x, z, r, kind }
 *   torii     where it stands
 */
export function circuitLayout() {
  const line = courseLine();
  const P = new Parts();
  const decor = [];
  const walls = { list: [], lastSign: 1 };
  const kerbList = [];

  /* The pit wall along the straight, plain, on the pit side (right as the
   * cars go east), and the zone wall round turn one's outside. */
  const [st0, st1] = arc(line, 0, 1, -8, -6);
  barrier(line, st0, st1, -1, ROAD_WIDTH / 2 + 1.4, 'wall', walls);
  const [t10, t11] = arc(line, 1, 4, -10, 10);
  barrier(line, t10, t11, 'out', ROAD_WIDTH / 2 + 2.2, 'zone', walls);
  /* Tyre walls round the outside of the hairpin and the last corner. */
  const [h0, h1] = arc(line, 8, 10, 6, -2);
  barrier(line, h0, h1, 'out', ROAD_WIDTH / 2 + 2.6, 'tyres', walls);
  const [l0, l1] = arc(line, 13, 14, 4, 10);
  barrier(line, l0, l1, 'out', ROAD_WIDTH / 2 + 2.6, 'tyres', walls);
  for (const seg of walls.list) {
    const r = seg.look === 'tyres' ? 0.55 : 0.5;
    P.cap(seg.look === 'tyres' ? 'drTyre' : 'concrete', w(seg.a[0], seg.a[1], r), w(seg.b[0], seg.b[1], r), r,
      { draw: false, kind: 'wall', name: `barrier ${seg.look}` });
  }

  /* Kerbs at every inside apex: the hairpin, the manji's two, the last
   * corner and the kink under the torii. */
  for (const [k, a, b] of [[9, 12, 12], [11, 10, 10], [12, 10, 10], [14, 8, 8], [6, 7, 7]]) {
    const s = sAt(line, k);
    kerbs(line, s - a, s + b, kerbList);
  }

  /* The clipping point posts at the inside of the hairpin and of the
   * manji's first apex: a pole with a red and white board on it. */
  const cps = [];
  for (const [k, name] of [[9, 'Hairpin clip'], [11, 'Manji clip']]) {
    const s = sAt(line, k);
    const sign = bendAt(line, s) || 1;
    const q = beside(line, s, (ROAD_WIDTH / 2 + 1.6) * sign);
    ppost(P, 'flagMast', q.x, q.y, 0, 3.2, 0.08, { kind: 'pole', name: 'clipping point' });
    decor.push({ t: 'cpBoard', x: q.x, y: q.y });
    cps.push({ name, x: q.x, y: q.y });
  }

  pits(P, decor);
  bank(P, decor);
  tower(P, decor);
  fair(P, decor);
  const gate = torii(line, P, decor);

  /* Nobori along the straight's infield side, facing the pits. */
  for (let x = 74; x <= 216; x += 8) {
    nobori(P, decor, x, 50 + ROAD_WIDTH / 2 + 3, x / 8);
  }

  /* The game's zones, in the world. Turn one's outer zone is two circles
   * along the wall; the torii, the hairpin's and the manji's clipping
   * points one each. */
  const zones = [];
  const zoneAt = (name, x, y, r, kind) => {
    const q = w(x, y);
    zones.push({ name, x: q[0], z: q[2], r, kind });
  };
  for (const k of [2, 3]) {
    const s = sAt(line, k);
    const sign = -(bendAt(line, s) || 1);
    const q = beside(line, s, (ROAD_WIDTH / 2) * sign);
    zoneAt('Outer zone', q.x, q.y, 18, 'zone');
  }
  zoneAt('Torii', gate.x, gate.y, 16, 'torii');
  for (const c of cps) {
    zoneAt(c.name, c.x, c.y, 14, 'clip');
  }

  return { line, parts: P.list, walls: walls.list, kerbs: kerbList, decor, zones, torii: gate };
}
