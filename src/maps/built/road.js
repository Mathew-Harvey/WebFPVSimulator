/*
 * road.js: a road's centre line, its lane lines and its edges, worked out
 * from the road element's control nodes. Pure: no Three.js, no DOM, and no
 * trigonometry.
 *
 * THE FRAME is the document's plan (schema.md): metres, x east, y north, the
 * origin at the plot's south west corner. A road element's `nodes` are
 * relative to its `position`, so dragging a road moves its position and
 * nothing else; roadNodesOf adds the two. src/maps/built/traffic.js takes
 * what comes out of here to the world, through the one conversion
 * src/maps/built/place.js makes for every element.
 *
 * WHY THE BENDS ARE EASED. The physics module drives a car along the points
 * it is handed (src/native/world.c, section 5): the car's centre follows
 * them, so where the road turns at a point the car's velocity turns by as
 * much within one 1 ms step, and the module refuses any point that turns
 * more than 30 degrees. A corner drawn as one point is a lurch. The P2
 * verification also measured a drift car's yaw rate kicking by up to 4.2
 * rad/s where the curvature steps from nothing at the start of a bend,
 * because the drift's slip is proportional to the lateral acceleration, so a
 * step in curvature is a step in heading. So every bend here is EASED: its
 * curvature rises from zero where it leaves the straight, holds, and falls
 * back to zero where it meets the next one, and it is sampled finely enough
 * (BEND_STEP_MAX) that no point turns by more than a few degrees.
 *
 * HOW A BEND IS MADE. At each node where the road turns, the bend is
 * symmetric about the corner's bisector. Its first half is built by walking
 * from the tangent point on the incoming leg in equal steps, turning at each
 * step by an angle that ramps up linearly over the first RAMP of the half
 * and then holds (a discrete clothoid into a circular arc), and its second
 * half is the first reflected across the bisector. A turn is never an angle:
 * it is a rotation by t = tan(turn / 2), cos = (1 - t^2) / (1 + t^2), sin =
 * 2 t / (1 + t^2), the same rational rotation world.c turns a drift by. The
 * one number the shape needs, how hard the plateau turns, is found by
 * halving until the half bend ends exactly on the bisector's heading, whose
 * cosine and sine come from the two legs by the half angle identities. The
 * size then follows from where the two halves meet: the tangent length T
 * from the corner to where the bend begins, which is capped so two bends
 * never overlap on a leg (LEG_SHARE), and the plateau's radius, which is
 * what a car's corner speed is worked out from.
 *
 * ARITHMETIC ONLY. + - * / and Math.sqrt, which IEEE 754 rounds correctly
 * and so gives the same bits in every engine, and Math.round, floor, ceil,
 * min and max, which are exact. No Math.sin, cos, pow, exp, atan2 or hypot:
 * these points are handed to the physics module, and CLAUDE.md requires the
 * same input to give a bit identical state trace in Node and in every
 * browser.
 *
 * DEGENERATE INPUT never throws and never makes a NaN. Nodes that are not
 * finite are left out (the document's normalize has dropped them already,
 * with a note); a node within NODE_MERGE of the one before it is merged
 * into it; a node where the road turns so sharply that no bend fits its
 * legs at DRIVE_RADIUS_MIN (a fold back on itself included), or whose legs
 * are too short for even the least bend, is dropped, and the road is
 * worked out again without it. Each of those is a problem entry naming the
 * node. A road left with fewer than two nodes (three closed) has no centre
 * line and says so.
 *
 * THE API. Plain objects in, plain objects out, nothing kept but roadOf's
 * memory of recent answers.
 *
 *   roadNodesOf(el)                  the element's nodes in plan, absolute:
 *                                    [{ x, y, node }], `node` its index in
 *                                    el.nodes; nodes that are not finite are
 *                                    left out
 *   centreLine(nodes, closed, opts)  the eased centre line. opts.radius is
 *                                    the bend radius wanted (RADIUS_DEFAULT),
 *                                    opts.floor the tightest allowed
 *                                    (DRIVE_RADIUS_MIN), opts.ramp the share
 *                                    of a half bend spent easing in (RAMP;
 *                                    only scripts/roads-check.js asks for
 *                                    another, 0, a bend with no easing, to
 *                                    show its checks can see one). Returns a
 *                                    LINE:
 *                                      { points: [{ x, y }], tangents:
 *                                        [{ x, y }] unit, s: [arc length],
 *                                        length, closed, node: [the node
 *                                        each point belongs to, -1 on a
 *                                        straight], corners: [{ node, x, y,
 *                                        radius, turn }], problems }
 *                                    An open road starts at its first node
 *                                    and ends at its last. A closed road
 *                                    starts at the middle of its first
 *                                    node's bend (at the node, where it has
 *                                    none) and its last point is NOT the
 *                                    first repeated.
 *   laneLine(line, offset)           the same line moved `offset` metres to
 *                                    its own left (negative, right), point
 *                                    for point, so point i of a lane is
 *                                    point i of the centre: a LINE
 *   reverseLine(line)                the same points driven the other way:
 *                                    an open line end to start, a closed one
 *                                    from the same first point round the
 *                                    other way: a LINE
 *   edgesOf(line, width)             { left, right }: the road's two edges,
 *                                    width / 2 either side, for drawing
 *   pointAt(line, s)                 { x, y, tx, ty } at arc length s,
 *                                    round a closed line, clamped on an open
 *   nearestOn(line, x, y)            { s, d, x, y }: the nearest point of the
 *                                    line to (x, y) and how far it is
 *   arcOn(line, other, s)            the arc length on `other`, a lane of the
 *                                    same centre, of the point that is at s
 *                                    on `line`
 *   roadReport(line)                 { length, tightest: { radius, x, y, s,
 *                                    node }, crossing: { x, y } or null }
 *   moduleCheck(xyz, closed)         what sim_world_road would make of this
 *                                    road: { points } it would keep, or
 *                                    { code, message } why it would refuse
 *                                    it, by the module's own tests on the
 *                                    numbers it would be handed
 *   roadOf(el)                       everything about one road element:
 *                                    { el, width, lanes, radius, closed,
 *                                    laneOffset, centre, report, problems },
 *                                    remembered for the last 64 roads asked
 *                                    about, so it is shared: never change it
 *
 * A problem is { level, code, message, elementId, node }, the shape the
 * builder's warnings take (src/trackbuilder/warnings.js), so the builder
 * can list them beside its own. `level` is 'info' for a repair nobody need
 * act on, 'warn' for a node that was not used, 'error' for a road with no
 * centre line.
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

/* Pi to seventeen figures, a constant: nothing here takes an angle's sine. */
const PI = 3.141592653589793;

/*
 * SAMPLING. On a bend a point every BEND_STEP_MAX or closer, and closer on a
 * tight one: the plateau's radius over BEND_PER_RADIUS, so a point turns by
 * about 1.1 degrees, never under BEND_STEP_MIN. On a straight a point every
 * STRAIGHT_STEP, the module's own ROAD_STEP, where it would cut the road
 * into pieces that long itself, except within NEAR_BEND of a bend, where
 * the straight takes the bend's own spacing.
 *
 * Why so fine near a bend. The module measures a road's curvature at each
 * point across 1.5 m either way and interpolates it linearly between
 * points, and a drift car's slip follows that curvature, so its yaw rate
 * follows the curvature's slope, which changes only at points. Where a
 * bend begins, the measured curvature bends up from zero over those 3 m;
 * with the straight's points a metre apart it does so in a few big
 * changes of slope, each a step in the drift car's yaw rate. A point every
 * bend's step through the window spreads the same change over many small
 * ones: on the starter the drift car's largest step in a millisecond fell
 * from 1.3 rad/s to 0.62, and what is left is the module's speed profile,
 * not the road (scripts/roads-check.js, YAW_STEP_TARGET).
 */
export const BEND_STEP_MAX = 0.5;
export const BEND_STEP_MIN = 0.05;
const BEND_PER_RADIUS = 50;
export const STRAIGHT_STEP = 1.0;
const NEAR_BEND = 3.0;

/* The bend radius a road gets unless it asks for another, m: a car in a
 * yard takes a corner of 12 m at 7 to 10 m/s. */
export const RADIUS_DEFAULT = 12;

/*
 * The tightest a car's own line may bend, m. The module drives any smooth
 * road, and its speed tables treat anything tighter than half a metre as
 * half a metre (world.c ROAD_KAPPA_MAX). A metre keeps a car on the road it
 * is drawn on, and a bend of it is sampled about every 5 cm.
 * A lane line is the centre moved sideways, and a move toward the inside of
 * a bend shortens its radius by the move, so a road whose cars keep to a
 * lane is eased with the lane's offset added to this (roadOf): the lane
 * line is acceptable to the module by construction, not by a clamp.
 */
export const DRIVE_RADIUS_MIN = 1.0;

/* The share of each half bend spent easing into the plateau. A half is a
 * ramp then an arc, so a whole bend is a quarter ramp in, half arc, a
 * quarter ramp out. */
export const RAMP = 0.5;

/* Nodes this close to the one before are one node, m. Well over the
 * module's 1 cm shortest segment, well under anything an author means. */
export const NODE_MERGE = 0.05;

/* The most of a leg two bends may take between them. What is left is a
 * straight at least 2 percent of the leg, so the two never meet in a point
 * that rounding could put behind itself. */
const LEG_SHARE = 0.98;

/* A point this close to the last one kept is not a new point, m. Only ever
 * true where a straight of no length joins two bends, on the leg's own
 * line, so leaving it out bends nothing. */
const JOIN_MIN = 0.02;

/*
 * Turns too small to ease. Every node that turns at all is eased, a tiny
 * turn over a bend of at least MIN_STEPS points a half at BEND_STEP_MIN, so
 * no node is ever handed over as a corner. A node whose legs are too short
 * for even that is left out: with a note if it turned by no more than
 * KINK_COS (2 degrees), because the road then passes within a few
 * centimetres of it, and with a warning if it turned by more. A cosine,
 * written to seventeen figures.
 */
const KINK_COS = 0.99939082701909576;
/* A turn past this is a fold back on itself: 179.9 degrees. */
const FOLD_COS = -0.99999847691328769;

/* The half bend every corner's size is first estimated with, steps. */
const REF_STEPS = 32;
/* The fewest steps a half bend is sampled in: eight, so even the smallest
 * ramps in over four points, a quarter of its peak at a time, and never
 * steps from a straight to its full curvature at one point. And the most. */
const MIN_STEPS = 8;
const MAX_STEPS = 4096;

/*
 * The module's own limits, restated from src/native/world.c so a road can
 * be checked here before it is handed over (moduleCheck): the road it
 * would refuse is named, rather than thrown about at load.
 */
export const MODULE = {
  STEP: 1.0,            /* ROAD_STEP */
  MIN_SEG: 0.01,        /* ROAD_MIN_SEG */
  TURN_COS: 0.86602540378443865, /* ROAD_TURN_COS, 30 degrees */
  COORD_MAX: 1e6,       /* ROAD_COORD_MAX */
  MAX_POINTS: 8192,     /* ROAD_MAX_POINTS */
  WORLD_POINTS: 16384,  /* WORLD_ROAD_POINTS */
  MAX_ROADS: 16,        /* WORLD_MAX_ROADS */
  PROFILE_POINTS: 65536, /* WORLD_PROFILE_POINTS */
  MAX_PROFILES: 64,     /* WORLD_MAX_PROFILES */
};

function problem(level, code, message, elementId, node) {
  const p = { level, code, message };
  if (elementId !== undefined) {
    p.elementId = elementId;
  }
  if (node !== undefined) {
    p.node = node;
  }
  return p;
}

/* ------------------------------------------------------------------ *
 * The rational rotation, and the half bend.
 * ------------------------------------------------------------------ */

const ROT = { x: 0, y: 0 };

/* (x, y) turned left by the angle whose half has tangent q, into ROT, and
 * put back on the unit circle so a long walk does not drift off it. */
function turn(x, y, q) {
  const qq = q * q;
  const den = 1 + qq;
  const c = (1 - qq) / den;
  const s = (2 * q) / den;
  const nx = x * c - y * s;
  const ny = x * s + y * c;
  const l = Math.sqrt(nx * nx + ny * ny);
  ROT.x = nx / l;
  ROT.y = ny / l;
  return ROT;
}

/* How hard step k of n turns, as a share of the plateau: a ramp over the
 * first m steps, then all of it. */
function share(k, m) {
  return k < m ? k / m : 1;
}

/* The heading a half bend of n steps ends on, at the apex, when its plateau
 * turns by tan(turn / 2) = c: n - 1 turns at its points, then half the
 * apex's, whose own half angle has tangent c / (1 + sqrt(1 + c^2)). */
function tipOf(c, n, m) {
  let x = 1;
  let y = 0;
  for (let k = 1; k < n; k += 1) {
    turn(x, y, c * share(k, m));
    x = ROT.x;
    y = ROT.y;
  }
  return turn(x, y, c / (1 + Math.sqrt(1 + c * c)));
}

/*
 * The first half of a bend that turns through the angle whose cosine is
 * `dot`, in n steps of one metre, in its own frame: it starts at the origin
 * heading +x and turns left. Returns { pts, T, R, wc, ws }: its n + 1
 * points, the tangent length T from where it starts to the corner, the
 * plateau's radius R (both in steps), and the heading at the apex, the
 * bisector's, whose cosine and sine are those of half the turn.
 *
 * The plateau's rate is found by halving between 0 and pi / (2 sum + 1),
 * where the whole of the half's turning cannot pass half a turn, so the
 * heading at the apex moves one way as the rate grows and its x says which
 * side of the bisector it is. 64 halvings is past a double's resolution.
 */
function halfBend(dot, n, ramp) {
  const wc = Math.sqrt((1 + dot) / 2);
  const ws = Math.sqrt((1 - dot) / 2);
  const m = Math.max(1, Math.round(ramp * n));
  let sum = 0;
  for (let k = 1; k < n; k += 1) {
    sum += share(k, m);
  }
  let lo = 0;
  let hi = PI / (2 * sum + 1);
  for (let it = 0; it < 64; it += 1) {
    const c = 0.5 * (lo + hi);
    if (tipOf(c, n, m).x > wc) {
      lo = c;
    } else {
      hi = c;
    }
  }
  const c = 0.5 * (lo + hi);
  const pts = [{ x: 0, y: 0 }];
  let dx = 1;
  let dy = 0;
  let px = 0;
  let py = 0;
  for (let k = 1; k <= n; k += 1) {
    px += dx;
    py += dy;
    pts.push({ x: px, y: py });
    if (k < n) {
      turn(dx, dy, c * share(k, m));
      dx = ROT.x;
      dy = ROT.y;
    }
  }
  /* The corner is where the start's tangent meets the bisector, the line
   * through the apex square to its heading. */
  const T = px + (py * ws) / wc;
  /* Three points one step apart turning by a with tan(a / 2) = c stand on a
   * circle of 1 / (2 sin(a / 2)). */
  const R = Math.sqrt(1 + c * c) / (2 * c);
  return { pts, T, R, wc, ws, n };
}

/* ------------------------------------------------------------------ *
 * Planning: which nodes bend, and how big each bend is.
 * ------------------------------------------------------------------ */

/*
 * One pass over the nodes: every leg, and every corner with the bend it
 * would get. A corner is
 *
 *   'straight'  exactly in line with its legs: a point on a straight
 *   'bend'      eased, T metres either side, plateau radius R
 *   'bad'       a fold, no bend at the floor fits its legs, or its legs are
 *               too short for the least bend (`kink` when it turns 2
 *               degrees or less)
 */
function planPass(nodes, closed, radius, floor, shapes, ramp) {
  const n = nodes.length;
  const nleg = closed ? n : n - 1;
  const legs = [];
  for (let j = 0; j < nleg; j += 1) {
    const a = nodes[j];
    const b = nodes[(j + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.sqrt(dx * dx + dy * dy);
    legs.push({ L, ux: dx / L, uy: dy / L });
  }
  const corners = new Array(n).fill(null);
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i += 1) {
    const a = legs[(i + nleg - 1) % nleg];
    const b = legs[i];
    let dot = a.ux * b.ux + a.uy * b.uy;
    dot = dot > 1 ? 1 : (dot < -1 ? -1 : dot);
    const cross = a.ux * b.uy - a.uy * b.ux;
    const c = { i, dot, left: cross >= 0, kind: 'bend', want: 0, T: 0, R: Infinity, g: 0, lam: 0 };
    if (cross === 0 && dot > 0) {
      /* Exactly in line: a point on a straight. */
      c.kind = 'straight';
    } else if (dot <= FOLD_COS) {
      c.kind = 'bad';
      c.R = 0;
      c.fold = true;
    } else {
      const sh = shapeOf(dot, shapes, ramp);
      c.g = sh.g;
      c.lam = sh.lam;
      c.least = sh.least;
      /* The radius asked for, or the least bend that can be sampled,
       * whichever is the larger: a turn of a fraction of a degree at 12 m
       * would be a bend a few centimetres long. */
      c.want = Math.max(c.g * radius, c.least * BEND_STEP_MIN);
    }
    corners[i] = c;
  }
  /* What each corner may take of a leg: all it wants if the leg holds both
   * ends' wants, else its share of LEG_SHARE of the leg by want. */
  const avail = (c, j, other) => {
    const L = legs[j].L * LEG_SHARE;
    const ow = other ? other.want : 0;
    return c.want + ow <= L ? c.want : (L * c.want) / (c.want + ow);
  };
  for (const c of corners) {
    if (!c || c.kind !== 'bend') {
      continue;
    }
    const jin = (c.i + nleg - 1) % nleg;
    const jout = c.i;
    const prev = corners[(c.i + n - 1) % n];
    const next = corners[(c.i + 1) % n];
    c.T = Math.min(c.want, avail(c, jin, closed || c.i > 0 ? prev : null), avail(c, jout, next));
    c.R = c.T / c.g;
    /* The smallest this bend can be sampled: MIN_STEPS a half, each at
     * least BEND_STEP_MIN. */
    const hmin = c.T / c.least;
    if (!(c.R >= floor)) {
      c.kind = 'bad';
    } else if (!(hmin >= BEND_STEP_MIN)) {
      c.kind = 'bad';
      c.kink = c.dot >= KINK_COS;
    }
  }
  return { legs, corners };
}

/* A turn's shape in a few numbers: g, the tangent length over the
 * plateau's radius; lam, the half bend's length over its tangent length;
 * least, the tangent length of a half bend of MIN_STEPS unit steps. The
 * same turn gives the same numbers, so a plan that goes round again after
 * dropping a node works out only the turns that changed. */
function shapeOf(dot, shapes, ramp) {
  let sh = shapes.get(dot);
  if (!sh) {
    const ref = halfBend(dot, REF_STEPS, ramp);
    sh = { g: ref.T / ref.R, lam: REF_STEPS / ref.T, least: halfBend(dot, MIN_STEPS, ramp).T };
    shapes.set(dot, sh);
  }
  return sh;
}

/*
 * Plan the road: pass after pass, each time dropping the one node that
 * cannot bend (the one with the least room, a fold first), until every node
 * can. Returns { nodes, legs, corners, problems }; nodes may be too few to
 * be a road, which the caller says.
 */
function plan(input, closed, radius, floor, elementId, ramp) {
  const problems = [];
  const shapes = new Map();
  let nodes = input.slice();
  for (;;) {
    if (nodes.length < (closed ? 3 : 2)) {
      return { nodes, legs: [], corners: [], problems };
    }
    const p = planPass(nodes, closed, radius, floor, shapes, ramp);
    let worst = null;
    for (const c of p.corners) {
      if (c && c.kind === 'bad' && (!worst || c.R < worst.R)) {
        worst = c;
      }
    }
    if (!worst) {
      return { nodes, legs: p.legs, corners: p.corners, problems };
    }
    const nd = nodes[worst.i];
    if (worst.kink) {
      problems.push(problem('info', 'rd-kink',
        `Node ${nd.node + 1} turns by under 2 degrees on legs too short to ease it, so the road runs straight past it.`,
        elementId, nd.node));
    } else {
      problems.push(problem('warn', worst.fold ? 'rd-fold' : 'rd-tight',
        worst.fold
          ? `The road folds back on itself at node ${nd.node + 1}, so no car can turn there. That node was left out: pull it apart into two.`
          : `The road turns too sharply at node ${nd.node + 1} for its legs: no bend of ${floor.toFixed(1)} m radius or more fits. That node was left out: give it longer legs or a gentler turn.`,
        elementId, nd.node));
    }
    nodes = nodes.filter((_, k) => k !== worst.i);
    /* Dropping a node can put two nodes on top of each other. */
    nodes = mergeNodes(nodes, closed, problems, elementId);
  }
}

/* Nodes within NODE_MERGE of the one kept before them are merged into it;
 * on a closed road the last is also merged into the first. */
function mergeNodes(nodes, closed, problems, elementId) {
  const out = [];
  for (const nd of nodes) {
    const last = out[out.length - 1];
    if (last) {
      const dx = nd.x - last.x;
      const dy = nd.y - last.y;
      if (dx * dx + dy * dy < NODE_MERGE * NODE_MERGE) {
        problems.push(problem('info', 'rd-merged',
          `Node ${nd.node + 1} is on top of node ${last.node + 1} and was read as the same node.`, elementId, nd.node));
        continue;
      }
    }
    out.push(nd);
  }
  if (closed && out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx * dx + dy * dy < NODE_MERGE * NODE_MERGE) {
      problems.push(problem('info', 'rd-merged',
        `Node ${b.node + 1} is on top of node ${a.node + 1}, where the loop closes, and was read as the same node.`, elementId, b.node));
      out.pop();
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Building the line.
 * ------------------------------------------------------------------ */

/* A bend's points in plan, from its tangent point on the leg in to its
 * tangent point on the leg out: 2 n + 1 of them, the apex at n. */
function bendPoints(c, node, uin, ramp) {
  /* Steps a half: enough that a step is under the spacing the plateau's
   * radius wants, found from the reference shape and checked on the real
   * one. */
  const target = Math.min(BEND_STEP_MAX, Math.max(BEND_STEP_MIN, c.R / BEND_PER_RADIUS));
  let n = Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.ceil((c.lam * c.T) / target)));
  let hb = halfBend(c.dot, n, ramp);
  let h = c.T / hb.T;
  for (let k = 0; k < 4 && h > BEND_STEP_MAX && n < MAX_STEPS; k += 1) {
    n = Math.min(MAX_STEPS, Math.ceil((n * h) / (0.95 * BEND_STEP_MAX)));
    hb = halfBend(c.dot, n, ramp);
    h = c.T / hb.T;
  }
  /* The second half is the first reflected across the bisector, the line
   * through the apex square to its heading (wc, ws). */
  const pts = hb.pts;
  const M = pts[n];
  const ax = -hb.ws;
  const ay = hb.wc;
  const local = pts.slice();
  for (let j = n - 1; j >= 0; j -= 1) {
    const qx = pts[j].x - M.x;
    const qy = pts[j].y - M.y;
    const along = qx * ax + qy * ay;
    const across = qx * hb.wc + qy * hb.ws;
    local.push({ x: M.x + along * ax - across * hb.wc, y: M.y + along * ay - across * hb.ws });
  }
  /* Into the plan: the start is T before the node on the leg in, x along
   * the leg in, y to its left, or to its right for a right hand bend. */
  const sg = c.left ? 1 : -1;
  const lx = -uin.uy * sg;
  const ly = uin.ux * sg;
  const ox = node.x - hb.T * h * uin.ux;
  const oy = node.y - hb.T * h * uin.uy;
  const out = [];
  for (const p of local) {
    out.push({ x: ox + h * (p.x * uin.ux + p.y * lx), y: oy + h * (p.x * uin.uy + p.y * ly) });
  }
  return { pts: out, apex: n, radius: hb.R * h, step: h };
}

/*
 * The eased centre line of a road through `nodes` (plan, absolute; each
 * { x, y, node }), open or closed. See the header for what comes back.
 */
export function centreLine(nodesIn, closed, opts = {}) {
  const radius = Number.isFinite(opts.radius) && opts.radius > 0 ? opts.radius : RADIUS_DEFAULT;
  const floor = Number.isFinite(opts.floor) && opts.floor > 0 ? opts.floor : DRIVE_RADIUS_MIN;
  const ramp = Number.isFinite(opts.ramp) && opts.ramp >= 0 && opts.ramp <= 1 ? opts.ramp : RAMP;
  const elementId = opts.elementId;
  const problems = [];
  const clean = [];
  (Array.isArray(nodesIn) ? nodesIn : []).forEach((nd, k) => {
    if (nd && Number.isFinite(nd.x) && Number.isFinite(nd.y)) {
      clean.push({ x: nd.x, y: nd.y, node: Number.isInteger(nd.node) ? nd.node : k });
    }
  });
  const merged = mergeNodes(clean, Boolean(closed), problems, elementId);
  const pl = plan(merged, Boolean(closed), radius, floor, elementId, ramp);
  problems.push(...pl.problems);
  const empty = { points: [], tangents: [], s: [], node: [], length: 0, closed: Boolean(closed), corners: [], problems };
  const nodes = pl.nodes;
  if (nodes.length < (closed ? 3 : 2)) {
    problems.push(problem('error', 'rd-too-few',
      closed
        ? 'A closed road needs three nodes that are not on top of each other and do not fold back. This one has no line to drive.'
        : 'A road needs two nodes that are not on top of each other. This one has no line to drive.',
      elementId));
    return empty;
  }

  const pts = [];
  const own = [];
  const corners = [];
  const push = (p, node) => {
    const last = pts[pts.length - 1];
    if (last) {
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (dx * dx + dy * dy < JOIN_MIN * JOIN_MIN) {
        return;
      }
    }
    pts.push({ x: p.x, y: p.y });
    own.push(node);
  };
  /* A straight from the last point kept to `b`, its points between, b left
   * for whatever comes next. `ha` and `hb` are the steps of the bends at its
   * two ends, 0 where there is none: within NEAR_BEND of a bend the
   * straight is sampled at the bend's step, and between at STRAIGHT_STEP. */
  const straightTo = (b, ha, hb) => {
    const a = pts[pts.length - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.sqrt(dx * dx + dy * dy);
    const at = [];
    let lo = 0;
    let hi = L;
    if (ha > 0) {
      const k = Math.floor(Math.min(NEAR_BEND, L / 2) / ha);
      for (let j = 1; j <= k; j += 1) {
        at.push(j * ha);
      }
      lo = k * ha;
    }
    const tail = [];
    if (hb > 0) {
      const k = Math.floor(Math.min(NEAR_BEND, L / 2) / hb);
      for (let j = k; j >= 1; j -= 1) {
        tail.push(L - j * hb);
      }
      hi = k > 0 ? L - k * hb : L;
    }
    const mid = hi - lo;
    const k = Math.ceil(mid / STRAIGHT_STEP);
    for (let j = 1; j < k; j += 1) {
      at.push(lo + mid * (j / k));
    }
    if (hi < L) {
      at.push(hi);
    }
    for (const d of tail.slice(1)) {
      at.push(d);
    }
    for (const d of at) {
      if (d > 0 && d < L) {
        push({ x: a.x + dx * (d / L), y: a.y + dy * (d / L) }, -1);
      }
    }
  };
  const n = nodes.length;
  const nleg = pl.legs.length;
  /* The points of corner i: a bend's, or the node alone where the road
   * runs straight through it. */
  const cornerPts = (i) => {
    const c = pl.corners[i];
    const nd = nodes[i];
    if (!c || c.kind !== 'bend') {
      return { pts: [{ x: nd.x, y: nd.y }], apex: 0, step: 0 };
    }
    const b = bendPoints(c, nd, pl.legs[(i + nleg - 1) % nleg], ramp);
    corners.push({ node: nd.node, x: b.pts[b.apex].x, y: b.pts[b.apex].y, radius: b.radius, turn: c.left ? 'left' : 'right' });
    return b;
  };

  let start = 0;
  if (!closed) {
    push(nodes[0], nodes[0].node);
    let last = 0;
    for (let i = 1; i < n - 1; i += 1) {
      const b = cornerPts(i);
      straightTo(b.pts[0], last, b.step);
      for (const p of b.pts) {
        push(p, b.step > 0 ? nodes[i].node : -1);
      }
      last = b.step;
    }
    straightTo(nodes[n - 1], last, 0);
    push(nodes[n - 1], nodes[n - 1].node);
  } else {
    let last = 0;
    let first = 0;
    for (let i = 0; i < n; i += 1) {
      const b = cornerPts(i);
      if (i > 0) {
        straightTo(b.pts[0], last, b.step);
      } else {
        first = b.step;
      }
      const at = pts.length;
      for (const p of b.pts) {
        push(p, b.step > 0 ? nodes[i].node : -1);
      }
      if (i === 0) {
        start = at + b.apex;
      }
      last = b.step;
    }
    straightTo(pts[0], last, first);
    const a = pts[0];
    const z = pts[pts.length - 1];
    const dx = z.x - a.x;
    const dy = z.y - a.y;
    if (dx * dx + dy * dy < JOIN_MIN * JOIN_MIN) {
      pts.pop();
      own.pop();
    }
  }
  const P = closed ? pts.slice(start).concat(pts.slice(0, start)) : pts;
  const N = closed ? own.slice(start).concat(own.slice(0, start)) : own;
  return finish(P, N, Boolean(closed), corners, problems);
}

/* Arc lengths and unit tangents for a list of points: a LINE. A tangent is
 * the bisector of the two segments at a point, the segment's own at an
 * open line's ends. */
function finish(points, node, closed, corners, problems) {
  const n = points.length;
  const s = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    s[i] = s[i - 1] + Math.sqrt(dx * dx + dy * dy);
  }
  let length = n ? s[n - 1] : 0;
  if (closed && n > 1) {
    const dx = points[0].x - points[n - 1].x;
    const dy = points[0].y - points[n - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  const unitOf = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.sqrt(dx * dx + dy * dy);
    return l > 0 ? { x: dx / l, y: dy / l } : { x: 1, y: 0 };
  };
  const tangents = [];
  for (let i = 0; i < n; i += 1) {
    const hasPrev = closed || i > 0;
    const hasNext = closed || i < n - 1;
    const a = hasPrev ? unitOf(points[(i + n - 1) % n], points[i]) : null;
    const b = hasNext ? unitOf(points[i], points[(i + 1) % n]) : null;
    if (a && b) {
      const x = a.x + b.x;
      const y = a.y + b.y;
      const l = Math.sqrt(x * x + y * y);
      tangents.push(l > 1e-12 ? { x: x / l, y: y / l } : b);
    } else {
      tangents.push(a || b || { x: 1, y: 0 });
    }
  }
  return { points, tangents, s, length, closed, node, corners, problems };
}

/* ------------------------------------------------------------------ *
 * Lanes, edges and places on a line.
 * ------------------------------------------------------------------ */

/* The line moved `offset` to its own left, point for point. */
export function laneLine(line, offset) {
  const pts = line.points.map((p, i) => ({
    x: p.x - offset * line.tangents[i].y,
    y: p.y + offset * line.tangents[i].x,
  }));
  return finish(pts, line.node.slice(), line.closed, line.corners, []);
}

/* The line driven the other way. A closed one keeps its first point, so
 * point 0 is the same place both ways round. */
export function reverseLine(line) {
  const n = line.points.length;
  const order = [];
  for (let k = 0; k < n; k += 1) {
    order.push(line.closed ? (n - k) % n : n - 1 - k);
  }
  return finish(order.map((i) => ({ x: line.points[i].x, y: line.points[i].y })),
    order.map((i) => line.node[i]), line.closed, line.corners, []);
}

/* The road's two edges, for drawing: { left, right }, width / 2 to each
 * side of the line in its own direction. */
export function edgesOf(line, width) {
  const h = width / 2;
  return {
    left: laneLine(line, h).points,
    right: laneLine(line, -h).points,
  };
}

/* Arc length s on a line: round a closed one, held to the ends of an open
 * one. */
function wrapS(line, s) {
  const L = line.length;
  if (!(L > 0) || !Number.isFinite(s)) {
    return 0;
  }
  if (line.closed) {
    const r = s - Math.floor(s / L) * L;
    return r < 0 ? 0 : (r >= L ? 0 : r);
  }
  return s < 0 ? 0 : (s > L ? L : s);
}

/* The segment arc length s falls on: [i, j, f], from point i to point j
 * (the first again past a closed line's last), f of the way. */
function segAt(line, s) {
  const n = line.points.length;
  const at = wrapS(line, s);
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (line.s[mid] <= at) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  if (!line.closed && lo >= n - 1) {
    lo = Math.max(0, n - 2);
  }
  const j = (lo + 1) % n;
  const s1 = lo + 1 < n ? line.s[lo + 1] : line.length;
  const len = s1 - line.s[lo];
  let f = len > 0 ? (at - line.s[lo]) / len : 0;
  f = f < 0 ? 0 : (f > 1 ? 1 : f);
  return [lo, j, f];
}

/* Where arc length s is on a line, and the way the line goes there. */
export function pointAt(line, s) {
  if (!line.points.length) {
    return { x: 0, y: 0, tx: 1, ty: 0 };
  }
  if (line.points.length === 1) {
    return { x: line.points[0].x, y: line.points[0].y, tx: 1, ty: 0 };
  }
  const [i, j, f] = segAt(line, s);
  const a = line.points[i];
  const b = line.points[j];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.sqrt(dx * dx + dy * dy);
  return {
    x: a.x + dx * f,
    y: a.y + dy * f,
    tx: l > 0 ? dx / l : 1,
    ty: l > 0 ? dy / l : 0,
  };
}

/* The point of a line nearest (x, y): { s, d, x, y }. */
export function nearestOn(line, x, y) {
  const n = line.points.length;
  let best = { s: 0, d: Infinity, x: 0, y: 0 };
  const nseg = line.closed ? n : n - 1;
  for (let i = 0; i < nseg; i += 1) {
    const a = line.points[i];
    const b = line.points[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ll = dx * dx + dy * dy;
    let f = ll > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / ll : 0;
    f = f < 0 ? 0 : (f > 1 ? 1 : f);
    const px = a.x + dx * f;
    const py = a.y + dy * f;
    const d = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
    if (d < best.d) {
      best = { s: line.s[i] + f * Math.sqrt(ll), d, x: px, y: py };
    }
  }
  if (n === 1) {
    const p = line.points[0];
    best = { s: 0, d: Math.sqrt((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y)), x: p.x, y: p.y };
  }
  return best;
}

/* The arc length on `other` of the point at s on `line`, where the two are
 * point for point the same line (a centre and one of its lanes). */
export function arcOn(line, other, s) {
  if (line.points.length < 2) {
    return 0;
  }
  const [i, j, f] = segAt(line, s);
  const s0 = other.s[i];
  const s1 = j === 0 && i !== 0 ? other.length : other.s[j];
  return s0 + (s1 - s0) * f;
}

/* ------------------------------------------------------------------ *
 * The builder's report, and the module's own tests.
 * ------------------------------------------------------------------ */

/*
 * How long the line is, where it is tightest, and whether it crosses
 * itself. The tightest radius is the circle through each point and its two
 * neighbours (the Menger curvature, as world.c measures a road), so it is
 * the line as drawn, not as planned. The crossing test files every segment
 * in 8 m cells and tests the pairs that share one, so a road of a few
 * thousand points costs a few thousand tests.
 */
export function roadReport(line) {
  const n = line.points.length;
  const out = { length: line.length, tightest: null, crossing: null };
  let kmax = 0;
  for (let i = 0; i < n; i += 1) {
    if (!line.closed && (i === 0 || i === n - 1)) {
      continue;
    }
    const a = line.points[(i + n - 1) % n];
    const b = line.points[i];
    const c = line.points[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    const acx = c.x - a.x;
    const acy = c.y - a.y;
    const den = Math.sqrt(abx * abx + aby * aby) * Math.sqrt(bcx * bcx + bcy * bcy) * Math.sqrt(acx * acx + acy * acy);
    const cross = abx * bcy - aby * bcx;
    const k = den > 0 ? (2 * (cross < 0 ? -cross : cross)) / den : 0;
    /* Under a nanometre's worth of bend a metre is a straight's rounding. */
    if (k > kmax && k > 1e-9) {
      kmax = k;
      out.tightest = { radius: 1 / k, x: b.x, y: b.y, s: line.s[i], node: line.node[i] };
    }
  }
  if (!out.tightest) {
    out.tightest = { radius: Infinity, x: n ? line.points[0].x : 0, y: n ? line.points[0].y : 0, s: 0, node: -1 };
  }
  out.crossing = selfCrossing(line);
  return out;
}

const CELL = 8;

function selfCrossing(line) {
  const n = line.points.length;
  const nseg = line.closed ? n : n - 1;
  if (nseg < 3) {
    return null;
  }
  const cells = new Map();
  const key = (i, j) => `${i},${j}`;
  for (let k = 0; k < nseg; k += 1) {
    const a = line.points[k];
    const b = line.points[(k + 1) % n];
    const i0 = Math.floor(Math.min(a.x, b.x) / CELL);
    const i1 = Math.floor(Math.max(a.x, b.x) / CELL);
    const j0 = Math.floor(Math.min(a.y, b.y) / CELL);
    const j1 = Math.floor(Math.max(a.y, b.y) / CELL);
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        const kk = key(i, j);
        let list = cells.get(kk);
        if (!list) {
          list = [];
          cells.set(kk, list);
        }
        list.push(k);
      }
    }
  }
  let found = null;
  let foundAt = Infinity;
  for (const list of cells.values()) {
    for (let x = 0; x < list.length; x += 1) {
      for (let y = x + 1; y < list.length; y += 1) {
        const p = list[x];
        const q = list[y];
        /* Neighbours share a point; so do the last and first of a loop. */
        if (q - p <= 1 || (line.closed && p === 0 && q === nseg - 1)) {
          continue;
        }
        const hit = segHit(line.points[p], line.points[(p + 1) % n], line.points[q], line.points[(q + 1) % n]);
        if (hit && p < foundAt) {
          found = hit;
          foundAt = p;
        }
      }
    }
  }
  return found;
}

/* Where two segments cross, or null: a proper crossing, by the signs of
 * four cross products. */
function segHit(a, b, c, d) {
  const d1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
  const d3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
  const d4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d1 / (d1 - d2);
    return { x: c.x + (d.x - c.x) * t, y: c.y + (d.y - c.y) * t };
  }
  return null;
}

/*
 * What sim_world_road would make of a road. `xyz` is what it would be
 * handed, x y z a point, in the physics frame; the tests are the module's
 * own (world.c sim_world_road), in its order and on its numbers: too few or
 * too many points, a coordinate not finite or past COORD_MAX, a segment
 * shorter than MIN_SEG in plan, more points than a road keeps once its long
 * segments are cut to STEP, a point that turns more than 30 degrees.
 * Returns { points }, how many points the module would keep, so a caller
 * can count the tables it fills; or { code, message } for a refusal.
 */
export function moduleCheck(xyz, closed) {
  const n = xyz.length / 3;
  if (n < (closed ? 3 : 2) || n > MODULE.MAX_POINTS) {
    return { code: 'rd-points', message: `the module takes 2 to ${MODULE.MAX_POINTS} points (3 closed), and this is ${n}` };
  }
  for (let i = 0; i < 3 * n; i += 1) {
    const v = xyz[i];
    if (!Number.isFinite(v) || !((v < 0 ? -v : v) <= MODULE.COORD_MAX)) {
      return { code: 'rd-far', message: `a point is past the ${MODULE.COORD_MAX} m the module reaches` };
    }
  }
  const nseg = closed ? n : n - 1;
  const lone = !closed && nseg === 1;
  let total = 1;
  for (let i = 0; i < nseg; i += 1) {
    const a = 3 * i;
    const b = 3 * ((i + 1) % n);
    const dx = xyz[b] - xyz[a];
    const dy = xyz[b + 1] - xyz[a + 1];
    const dz = xyz[b + 2] - xyz[a + 2];
    if (!(Math.sqrt(dx * dx + dy * dy) >= MODULE.MIN_SEG)) {
      return { code: 'rd-short', message: `two points are under ${MODULE.MIN_SEG * 100} cm apart` };
    }
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let k = Math.ceil(len / MODULE.STEP);
    k = k < 1 ? 1 : k;
    if (lone && k < 2) {
      k = 2;
    }
    total += k;
    if (total > MODULE.MAX_POINTS) {
      return { code: 'rd-long', message: `the road would be over the ${MODULE.MAX_POINTS} points a road keeps` };
    }
  }
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i += 1) {
    const a = 3 * ((i + n - 1) % n);
    const b = 3 * i;
    const c = 3 * ((i + 1) % n);
    const ux = xyz[b] - xyz[a];
    const uy = xyz[b + 1] - xyz[a + 1];
    const vx = xyz[c] - xyz[b];
    const vy = xyz[c + 1] - xyz[b + 1];
    const lens = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    if (!(ux * vx + uy * vy >= MODULE.TURN_COS * lens)) {
      return { code: 'rd-corner', message: 'a point turns by more than the 30 degrees the module takes' };
    }
  }
  return { points: total };
}

/* ------------------------------------------------------------------ *
 * A road element.
 * ------------------------------------------------------------------ */

/* A road element's nodes in plan: its position plus each node, the node's
 * index kept. Nodes that are not finite are left out. */
export function roadNodesOf(el) {
  const out = [];
  const ox = Number(el?.position?.x) || 0;
  const oy = Number(el?.position?.y) || 0;
  const list = Array.isArray(el?.nodes) ? el.nodes : [];
  list.forEach((nd, k) => {
    const x = Number(nd?.x);
    const y = Number(nd?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      out.push({ x: ox + x, y: oy + y, node: k });
    }
  });
  return out;
}

/*
 * Everything about one road element. `laneOffset` is where a car's line is,
 * to its own left of the centre as it drives: width / 4 on a closed road of
 * two lanes (Japan drives on the left, and so does every car here), and 0
 * on a road of one lane or on an OPEN road, whose cars drive its centre
 * line. The module turns a car round at each end of an open road on the
 * same line it came on, so a car kept to its left lane on the way out would
 * come back on the wrong side; the centre is the honest answer until the
 * road tool has turning circles.
 */
const MEMO = new Map();
const MEMO_MAX = 64;

export function roadOf(el) {
  /* Remembered by everything it is worked out from, so the builder can ask
   * for a road on every pointer move and pay for it once an edit. The
   * answer is shared: read it, never change it. */
  const key = roadKey(el);
  const hit = MEMO.get(key);
  if (hit) {
    return hit.el === el ? hit : { ...hit, el };
  }
  const r = roadOfUncached(el);
  if (MEMO.size >= MEMO_MAX) {
    MEMO.delete(MEMO.keys().next().value);
  }
  MEMO.set(key, r);
  return r;
}

/* Everything a road's line is worked out from, as a string. Numbers are
 * written by String, which is exact for a double. */
function roadKey(el) {
  const d = el?.dims ?? {};
  const nodes = Array.isArray(el?.nodes) ? el.nodes.map((n) => `${n?.x},${n?.y}`).join(';') : '';
  return `${el?.id}|${el?.position?.x},${el?.position?.y}|${el?.closed === true}|${d.width},${d.lanes},${d.radius}|${nodes}`;
}

function roadOfUncached(el) {
  const d = el?.dims ?? {};
  const width = Number.isFinite(d.width) && d.width > 0 ? d.width : 6;
  const lanes = d.lanes === 1 ? 1 : 2;
  const radius = Number.isFinite(d.radius) && d.radius > 0 ? d.radius : RADIUS_DEFAULT;
  const closed = el?.closed === true;
  const laneOffset = closed && lanes === 2 ? width / 4 : 0;
  const centre = centreLine(roadNodesOf(el), closed, {
    radius,
    floor: DRIVE_RADIUS_MIN + laneOffset,
    elementId: el?.id,
  });
  const report = roadReport(centre);
  const problems = centre.problems.slice();
  if (report.crossing) {
    problems.push(problem('warn', 'rd-crossing',
      `The road crosses itself near (${report.crossing.x.toFixed(1)}, ${report.crossing.y.toFixed(1)}). Cars on it pass through each other there.`,
      el?.id));
  }
  return { el, width, lanes, radius, closed, laneOffset, centre, report, problems };
}
