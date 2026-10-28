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
 * THE FURNITURE, the owner's second ask of 28 October 2026, "add lots more
 * detail to the track with furniture": everything a drift day leaves
 * standing round a circuit that is not a building. Floodlight masts round
 * the outside, catch fencing behind turn one's wall and along the pit wall,
 * the start gantry over the straight with its lights, a big screen facing
 * the pits, marshal huts with their flags at the corners, camera scaffolds
 * at turn one and the hairpin, speaker poles down the straight, the pit
 * lane's tool chests, tyre stacks and jacks, the paddock's canopies and team
 * trucks, toilets, vending machines, benches and bins by the festival, cones
 * at the pit exit, tyre heaps behind the hairpin, and picnic blankets with
 * people sitting on them under the trees.
 *
 * Every piece is in a colour the map already draws in, and the map's own
 * structure is one cull chunk baked one batch a material
 * (src/maps/built/index.js), so all of this adds triangles and no draw
 * call. What a quad could hit is solid; what is a wire or a cloth is drawn
 * only. Nothing solid stands nearer the course's middle than the barriers
 * do, and anything placed by rule is skipped where the road comes near.
 * `keep` collects a circle round every piece, so ./yard.js plants no tree
 * through one.
 */
function clearOfRoad(line, x, y, d) {
  return nearestOn(line, x, y).d >= d;
}

/* Turned toward a plan point: a heading for ./index.js. */
function toward(x, y, tx, ty) {
  return Math.atan2(ty - y, tx - x);
}

function furniture(line, P, decor, keep) {
  const MID = [170, 115];

  /* FLOODLIGHT MASTS round the outside, each turned on the infield. */
  for (const [x, y] of [[40, 28], [150, 7], [258, 26], [312, 52], [318, 168], [262, 196], [180, 192],
    [105, 200], [28, 205], [10, 128], [14, 70], [130, 128], [70, 104]]) {
    if (!clearOfRoad(line, x, y, 14)) {
      continue;
    }
    ppost(P, 'metal', x, y, 0, 15, 0.22, { kind: 'pole', name: 'floodlight mast' });
    pbox(P, 'concrete', x - 0.7, y - 0.7, 0, x + 0.7, y + 0.7, 0.5);
    decor.push({ t: 'flood', x, y, h: 15, yaw: toward(x, y, MID[0], MID[1]) });
    keep.push({ x, y, r: 3 });
  }

  /* CATCH FENCE behind turn one's zone wall: a post every four metres,
   * three wires and a top rail, and a cloth panel on every other bay. */
  const [f0, f1] = arc(line, 1, 4, -10, 10);
  let k = 0;
  let prev = null;
  for (let s = f0; s <= f1; s += 4, k += 1) {
    /* The outside of the bend; on a straight bit between bends, the
     * side the last post stood on (already the outside, so not turned
     * again: turning it again put every other post across the road). */
    const bend = bendAt(line, s);
    const sign = bend ? -bend : (prev ? prev.sign : -1);
    const q = beside(line, s, (ROAD_WIDTH / 2 + 4) * sign);
    ppost(P, 'metal', q.x, q.y, 0, 4.2, 0.06, { kind: 'pole', name: 'catch fence' });
    if (prev) {
      decor.push({ t: 'fence', a: [prev.x, prev.y], b: [q.x, q.y], h: 4.2 });
      if (k % 2) {
        decor.push({ t: 'panel', a: [prev.x, prev.y], b: [q.x, q.y], h0: 0.6, h1: 1.8, m: k % 4 === 1 ? 'drIndigo' : 'white' });
      }
    }
    prev = { x: q.x, y: q.y, sign };
  }
  /* Along the pit wall too, with the gap at the pit entry and exit. */
  for (let x = 70, last = null; x <= 220; x += 5) {
    const y = 50 - ROAD_WIDTH / 2 - 1.4;
    ppost(P, 'metal', x, y, 0.9, 3.4, 0.05, { kind: 'pole', name: 'pit fence' });
    if (last != null) {
      decor.push({ t: 'fence', a: [last, y], b: [x, y], h: 3.4, h0: 1.0 });
    }
    last = x;
  }

  /* THE START GANTRY over the straight: two lattice legs outside the walls,
   * the beam high over the road with the start lights, and a checkered band
   * under it. The beam is solid: a quad can hit it, and fly under it. */
  {
    const x = 197;
    const ys = 50 - 10;
    const yn = 50 + 10;
    for (const y of [ys, yn]) {
      for (const dx of [-0.5, 0.5]) {
        ppost(P, 'metal', x + dx, y, 0, 8.2, 0.12, { kind: 'pole', name: 'gantry leg' });
      }
      decor.push({ t: 'lattice', x, y, h: 8.2 });
      keep.push({ x, y, r: 2 });
    }
    pbox(P, 'drToriiBlack', x - 0.7, ys - 0.6, 7.2, x + 0.7, yn + 0.6, 8.4, { kind: 'obstacle', name: 'gantry beam' });
    decor.push({ t: 'gantry', x, y0: ys, y1: yn, h: 7.2 });
  }

  /* THE BIG SCREEN in the infield, turned to the pits and the straight. */
  {
    const [x, y] = [222, 80];
    for (const dx of [-3.5, 3.5]) {
      ppost(P, 'metal', x + dx, y, 0, 4, 0.18, { kind: 'pole', name: 'screen leg' });
    }
    pbox(P, 'drToriiBlack', x - 5.4, y - 0.3, 4, x + 5.4, y + 0.3, 10.2, { kind: 'obstacle', name: 'big screen', draw: false });
    decor.push({ t: 'screen', x, y, w: 10.8, h0: 4, h1: 10.2 });
    keep.push({ x, y, r: 7 });
  }

  /* MARSHAL HUTS at the corners, on the outside, each with its flag. */
  const huts = [[2, 'craneYellow'], [6, 'drIndigo'], [9, 'craneYellow'], [11, 'white'], [13, 'craneYellow'], [4, 'containerTeal']];
  for (const [n, flag] of huts) {
    const s = sAt(line, n);
    const sign = -(bendAt(line, s) || 1);
    const q = beside(line, s, (ROAD_WIDTH / 2 + 7.5) * sign);
    if (!clearOfRoad(line, q.x, q.y, 13)) {
      continue;
    }
    pbox(P, 'wallWhite', q.x - 0.9, q.y - 0.9, 0, q.x + 0.9, q.y + 0.9, 2.2, { kind: 'obstacle', name: 'marshal hut' });
    pbox(P, 'drNoboriRed', q.x - 1.1, q.y - 1.1, 2.2, q.x + 1.1, q.y + 1.1, 2.45, { kind: 'obstacle', name: 'marshal hut roof' });
    ppost(P, 'flagMast', q.x + 1.3, q.y, 0, 3.6, 0.04, { kind: 'pole', name: 'marshal flag' });
    /* The window on whichever face of the hut is most toward the road. */
    const face = Math.round(toward(q.x, q.y, q.x + q.ty * sign, q.y - q.tx * sign) / (Math.PI / 2)) * (Math.PI / 2);
    decor.push({ t: 'hutFace', x: q.x, y: q.y, yaw: face });
    decor.push({ t: 'flag', x: q.x + 1.3, y: q.y, h: 3.5, m: flag });
    decor.push({ t: 'fan', x: q.x + 1.2, y: q.y + 0.9, h: 0, shirt: 'craneYellow', tall: 1.7, cheer: true });
    keep.push({ x: q.x, y: q.y, r: 3 });
  }

  /* CAMERA SCAFFOLDS: a deck on four poles, a camera on a tripod and its
   * operator, at turn one's infield and outside the hairpin. */
  for (const [x, y, tx, ty] of [[250, 92, 280, 110], [16, 166, 45, 150], [120, 80, 90, 85]]) {
    if (!clearOfRoad(line, x, y, 12)) {
      continue;
    }
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ppost(P, 'metal', x + dx * 1.1, y + dy * 1.1, 0, 4.2, 0.05, { kind: 'pole', name: 'scaffold' });
    }
    pbox(P, 'plywood', x - 1.3, y - 1.3, 3.6, x + 1.3, y + 1.3, 3.75, { kind: 'obstacle', name: 'scaffold deck' });
    decor.push({ t: 'scaffold', x, y, h: 3.75, yaw: toward(x, y, tx, ty) });
    decor.push({ t: 'fan', x: x - 0.5, y: y - 0.4, h: 3.75, shirt: 'drIndigo', tall: 1.65, cheer: false });
    decor.push({ t: 'ladder', a: [x + 1.3, y - 0.3, 0], b: [x + 1.3, y - 0.3, 3.75] });
    keep.push({ x, y, r: 3.5 });
  }

  /* SPEAKER POLES down the straight's infield side, between the nobori. */
  for (let x = 86; x <= 214; x += 32) {
    const y = 50 + ROAD_WIDTH / 2 + 5.5;
    ppost(P, 'flagMast', x, y, 0, 6.5, 0.07, { kind: 'pole', name: 'speaker pole' });
    decor.push({ t: 'speaker', x, y, h: 6.1 });
  }

  /* THE PIT LANE: in every bay with no car, a tool chest, a stack of
   * tyres and a jack; in every bay, a bench at the back and a fire
   * extinguisher by the column. */
  for (let b = 0; b < 15; b += 1) {
    const x = PITS.x0 + 5 + b * 10;
    const car = b % 2 === 1;
    /* The bench stands clear of the back door in a bay that has one, so
     * the line out through it stays open. */
    const [b0, b1] = car ? [x + 2.3, x + 4.7] : [x - 3.5, x + 1.5];
    pbox(P, 'plywood', b0, PITS.y0 + 0.5, 0, b1, PITS.y0 + 1.3, 0.95, { kind: 'obstacle', name: 'workbench' });
    decor.push({ t: 'tools', x: (b0 + b1) / 2, y: PITS.y0 + 0.45, h: 0.95, w: b1 - b0 });
    decor.push({ t: 'extinguisher', x: x + 4.4, y: PITS.y1 - 0.9 });
    if (car) {
      pbox(P, 'drNoboriRed', x - 4.4, PITS.y1 + 1.0, 0, x - 3.4, PITS.y1 + 1.6, 1.05, { kind: 'obstacle', name: 'tool chest' });
      decor.push({ t: 'chest', x: x - 3.9, y: PITS.y1 + 1.6, h: 1.05, w: 1.0 });
      continue;
    }
    pbox(P, b % 4 === 0 ? 'drNoboriRed' : 'drIndigo', x - 3, PITS.y1 + 1.2, 0, x - 1.6, PITS.y1 + 1.9, 1.05, { kind: 'obstacle', name: 'tool chest' });
    decor.push({ t: 'chest', x: x - 2.3, y: PITS.y1 + 1.9, h: 1.05, w: 1.4 });
    for (const [dx, n] of [[1, 4], [2.3, 3]]) {
      ppost(P, 'drTyre', x + dx, PITS.y1 + 2.4, 0, n * 0.26, 0.34, { kind: 'obstacle', name: 'tyre stack', draw: false });
      decor.push({ t: 'tyres', x: x + dx, y: PITS.y1 + 2.4, n });
    }
    decor.push({ t: 'jack', x: x - 0.6, y: PITS.y1 + 4.6 });
  }

  /* THE PADDOCK east of the pits: canopies over tables, team trucks, a
   * generator. Each canopy is a striped roof on four legs. */
  const CANOPY = ['drIndigo', 'drNoboriRed', 'containerTeal', 'craneYellow'];
  for (let i = 0; i < 4; i += 1) {
    const x = 228 + i * 7.5;
    const y = 30;
    for (const [dx, dy] of [[0.1, -2.9], [5.9, -2.9], [0.1, 2.9], [5.9, 2.9]]) {
      ppost(P, 'metal', x + dx, y + dy, 0, 2.8, 0.04, { kind: 'pole', name: 'canopy leg' });
    }
    pbox(P, 'white', x, y - 3, 2.8, x + 6, y + 3, 3.0, { draw: false, name: 'canopy' });
    decor.push({ t: 'awning', x0: x, x1: x + 6, y0: y - 3, y1: y + 3, h: 2.8, m: CANOPY[i] });
    pbox(P, 'plywood', x + 1.5, y - 0.6, 0.7, x + 4.5, y + 0.6, 0.8, { kind: 'obstacle', name: 'table' });
    decor.push({ t: 'tableLegs', x: x + 3, y, w: 3, d: 1.2, h: 0.7 });
    decor.push({ t: 'fan', x: x + 2, y: y + 1.2, h: 0, shirt: CANOPY[(i + 1) % 4], tall: 1.7, cheer: false });
    keep.push({ x: x + 3, y, r: 5 });
  }
  for (const [i, m] of [[0, 'containerTeal'], [1, 'drIndigo'], [2, 'white']]) {
    const x = 226 + i * 11;
    const y = 16;
    pbox(P, m, x, y - 1.25, 0.9, x + 7.5, y + 1.25, 4.0, { kind: 'obstacle', name: 'team truck box' });
    pbox(P, 'wallWhite', x + 7.6, y - 1.2, 0.6, x + 9.6, y + 1.2, 3.0, { kind: 'obstacle', name: 'team truck cab' });
    pbox(P, 'drToriiBlack', x + 0.2, y - 1.1, 0.3, x + 9.4, y + 1.1, 0.9, { kind: 'obstacle', name: 'team truck chassis' });
    decor.push({ t: 'truck', x, y, m });
    keep.push({ x: x + 5, y, r: 7 });
  }
  pbox(P, 'craneYellow', 262, 22, 0, 264.2, 23.4, 1.4, { kind: 'obstacle', name: 'generator' });
  keep.push({ x: 263, y: 23, r: 3 });

  /* BY THE FESTIVAL: toilets in a row, vending machines at the walk's
   * east end, benches and bins. */
  for (let i = 0; i < 6; i += 1) {
    const x = 200 + i * 1.6;
    pbox(P, 'containerTeal', x, 93.5, 0, x + 1.4, 95, 2.3, { kind: 'obstacle', name: 'toilet' });
    pbox(P, 'white', x - 0.05, 93.45, 2.3, x + 1.45, 95.05, 2.45, { kind: 'obstacle', name: 'toilet roof' });
    decor.push({ t: 'door', x: x + 0.7, y: 95.02 });
  }
  keep.push({ x: 205, y: 94, r: 6 });
  for (let i = 0; i < 4; i += 1) {
    const y = 106 + i * 1.2;
    const m = ['drNoboriRed', 'wallBlue', 'white', 'drNoboriRed'][i];
    pbox(P, m, 263.2, y, 0, 264.1, y + 1.05, 1.85, { kind: 'obstacle', name: 'vending machine' });
    decor.push({ t: 'vend', x: 263.2, y: y + 0.52 });
  }
  keep.push({ x: 263.6, y: 108.5, r: 4 });
  for (const [x, y] of [[150, 100], [156, 100], [186, 104], [186, 120], [202, 128], [222, 128], [242, 128], [212, 98]]) {
    pbox(P, 'plywood', x - 0.9, y - 0.22, 0.42, x + 0.9, y + 0.22, 0.48, { kind: 'obstacle', name: 'bench' });
    decor.push({ t: 'bench', x, y });
    keep.push({ x, y, r: 2 });
  }
  for (const [x, y] of [[193, 106], [193, 118], [261, 118], [226, 98], [72, 38], [146, 38], [218, 38], [176, 104]]) {
    ppost(P, 'drIndigo', x, y, 0, 0.9, 0.28, { kind: 'obstacle', name: 'bin' });
    decor.push({ t: 'binLid', x, y });
  }

  /* CONES along the pit exit, drawn only, and TYRE HEAPS behind the
   * hairpin's tyre wall: spares, stacked where they were dropped. */
  for (let x = 222; x <= 240; x += 2) {
    decor.push({ t: 'cone', x, y: 41.6 + (x - 222) * 0.12 });
  }
  const hp = sAt(line, 8);
  for (let i = -2; i <= 2; i += 1) {
    const s = hp + i * 6;
    const sign = -(bendAt(line, s) || 1);
    const q = beside(line, s, (ROAD_WIDTH / 2 + 5.4 + (i & 1) * 0.9) * sign);
    if (!clearOfRoad(line, q.x, q.y, 12)) {
      continue;
    }
    const n = 3 + ((i + 5) % 3);
    ppost(P, 'drTyre', q.x, q.y, 0, n * 0.26, 0.34, { kind: 'obstacle', name: 'tyre heap', draw: false });
    decor.push({ t: 'tyres', x: q.x, y: q.y, n });
    keep.push({ x: q.x, y: q.y, r: 2 });
  }

  /* PICNICS under the trees: a blanket, two or three people sitting on
   * it, a cool box. */
  const BLANKETS = ['awning', 'drIndigo', 'containerTeal', 'drNoboriRed', 'craneYellow', 'wallBlue'];
  const picnics = [[96, 140], [92, 150], [206, 142], [196, 146], [128, 184], [60, 196], [22, 120], [300, 168], [292, 176],
    [230, 186], [214, 184], [48, 112], [36, 100], [140, 72], [160, 76]];
  picnics.forEach(([x, y], i) => {
    if (!clearOfRoad(line, x, y, 13)) {
      return;
    }
    decor.push({ t: 'blanket', x, y, m: BLANKETS[i % BLANKETS.length], yaw: (i * 0.7) % 3.1 });
    for (let j = 0; j < 2 + (i % 2); j += 1) {
      decor.push({
        t: 'fan', x: x - 0.7 + j * 0.75, y: y + ((j * 5 + i) % 3 - 1) * 0.35, h: 0.06,
        shirt: SHIRTS[(i * 3 + j) % SHIRTS.length], tall: 0.95, cheer: (i + j) % 5 === 0,
      });
    }
    decor.push({ t: 'coolbox', x: x + 1.1, y: y - 0.7 });
    keep.push({ x, y, r: 2.5 });
  });
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
 *   keep      circles round the furniture no tree may stand in
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
  const keep = [];
  furniture(line, P, decor, keep);

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

  return { line, parts: P.list, walls: walls.list, kerbs: kerbList, decor, zones, torii: gate, keep };
}
