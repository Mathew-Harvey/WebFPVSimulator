/*
 * roadtool.js: the road tool's arithmetic. Laying a road's nodes and closing
 * it, inserting, moving and deleting a node, putting a vehicle on a road and
 * sliding it along one, where a vehicle is drawn, and the few tests the
 * builder's road warnings are made of. Pure: no DOM, no canvas, no Three.js,
 * so src/trackbuilder/selftest.js runs every rule here in Node, and
 * view2d.js and app.js call these rather than deciding any of it themselves.
 *
 * THE FRAME is the document's plan (schema.md): metres, x east, y north. A
 * road element's `nodes` are relative to its `position`, and the tool keeps
 * the road's FIRST NODE AT ITS POSITION: a road it lays starts there, and
 * moving or deleting the first node moves the position with it. So the X
 * and Y the inspector shows, a box select and the plot check all read the
 * road's first node, and dragging the road's body still moves the position
 * and nothing else. A road made any other way (a hand edit, a file) is read
 * as it is; nothing here needs the first node to be at the position.
 *
 * WHERE A VEHICLE IS comes from its road and its offset and nothing else
 * (schema.md). `offset` is metres along the road's CENTRE line from its
 * first node, whichever lane the car drives and whichever way, so putting a
 * car on a road is finding the nearest point of the centre line and its arc
 * length (snapToRoad), and sliding it is the same with only its own road.
 * The drawing is src/maps/built/traffic.js vehicleStart, the same line and
 * offset trafficOf hands the physics. A vehicle with no road to be on has
 * no place, so it is drawn parked in a row along the plot's south edge
 * (PARK), where the author can find it and drag it onto a road.
 *
 * THE LAP TIME. Two cars in one lane with different speed tables drive
 * through each other sooner or later, because nothing in the physics makes
 * one car wait for another; two with the same table never meet. The starter
 * yard has a box truck and a kei van in one lane on purpose, their top
 * speeds chosen so their laps are the same to a tenth of a millisecond over
 * ten laps (PROGRESS.md, the Stage E foundation). So "different speeds" is
 * not the test: different LAP TIMES are, and only the module knows its lap
 * time. moduleRoad and lapTable below restate src/native/world.c's
 * sim_world_road and profile_for on the very numbers the module is handed,
 * the way src/maps/built/road.js moduleCheck restates its refusals, so the
 * warning can say whether and when two cars meet. Nothing here drives a car:
 * the Play button and the simulator read every pose from the module.
 *
 * Plain Math is fine here, trigonometry included: nothing in this file
 * reaches the integrator. The lap time port uses + - * / and Math.sqrt,
 * floor and ceil only, as world.c does, so it agrees with the module to the
 * last bit on the same input, which the warning does not need but costs
 * nothing.
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

import { ELEMENTS, KIND, ROAD_NODES_MAX } from './elements.js';
import { roadOf, nearestOn, pointAt, NODE_MERGE } from '../maps/built/road.js';
import { vehicleStart, VEHICLE_KINDS } from '../maps/built/traffic.js';
import { threePosToSim } from '../render/frame.js';
import { CAR_STYLES } from '../props/types.js';

/* The fewest nodes an open road and a loop are made of. */
export const OPEN_MIN = 2;
export const LOOP_MIN = 3;

function isRoad(el) {
  return ELEMENTS[el?.type]?.kind === KIND.ROAD;
}

function isVehicle(el) {
  return ELEMENTS[el?.type]?.kind === KIND.VEHICLE;
}

function near(p, x, y, reach) {
  const dx = p.x - x;
  const dy = p.y - y;
  return dx * dx + dy * dy <= reach * reach;
}

/* ------------------------------------------------------------------ *
 * Laying a road: the draft, a list of plan points, absolute.
 * ------------------------------------------------------------------ */

/* A click at (x, y) on a draft's first node closes it into a loop, once it
 * has the three nodes a loop needs. */
export function closesDraft(nodes, x, y, reach) {
  return nodes.length >= LOOP_MIN && near(nodes[0], x, y, reach);
}

/* A click on the draft's last node finishes it as an open road: the second
 * click of a double click lands there, and so does a deliberate one. */
export function endsDraft(nodes, x, y, reach) {
  return nodes.length >= OPEN_MIN && near(nodes[nodes.length - 1], x, y, reach);
}

/* The draft with a node added at p. A point on top of the last node is not
 * a new node (road.js would merge it), and a road keeps ROAD_NODES_MAX. */
export function addDraftNode(nodes, p) {
  const last = nodes[nodes.length - 1];
  if (last && near(last, p.x, p.y, NODE_MERGE)) {
    return nodes;
  }
  if (nodes.length >= ROAD_NODES_MAX) {
    return nodes;
  }
  return [...nodes, { x: p.x, y: p.y }];
}

/* The road a draft makes: { position, nodes, closed }, its first node at its
 * position, or null when there are too few nodes for it. */
export function roadFromDraft(nodes, closed) {
  if (nodes.length < (closed ? LOOP_MIN : OPEN_MIN)) {
    return null;
  }
  const o = nodes[0];
  return {
    position: { x: o.x, y: o.y, z: 0 },
    nodes: nodes.map((p) => ({ x: p.x - o.x, y: p.y - o.y })),
    closed: Boolean(closed),
  };
}

/* ------------------------------------------------------------------ *
 * Editing a road's nodes. Each returns what to write, or null.
 * ------------------------------------------------------------------ */

/* A road's nodes in plan, absolute, as plain { x, y }. */
export function absNodes(el) {
  const ox = Number(el?.position?.x) || 0;
  const oy = Number(el?.position?.y) || 0;
  return (Array.isArray(el?.nodes) ? el.nodes : []).map((n) => ({ x: ox + n.x, y: oy + n.y }));
}

/* Absolute nodes back into { position, nodes }, the first node at the
 * position. */
function rebased(abs) {
  const o = abs[0] ?? { x: 0, y: 0 };
  return {
    position: { x: o.x, y: o.y, z: 0 },
    nodes: abs.map((p) => ({ x: p.x - o.x, y: p.y - o.y })),
  };
}

/* How many legs a road has: node to node, and last back to first on a
 * loop. */
export function legCount(el) {
  const n = Array.isArray(el?.nodes) ? el.nodes.length : 0;
  if (n < 2) {
    return 0;
  }
  return el.closed === true ? n : n - 1;
}

/* The middle of each leg of the node line, absolute: where the tool offers
 * to insert a node. [{ leg, x, y }] */
export function legMidpoints(el) {
  const abs = absNodes(el);
  const out = [];
  for (let leg = 0; leg < legCount(el); leg += 1) {
    const a = abs[leg];
    const b = abs[(leg + 1) % abs.length];
    out.push({ leg, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return out;
}

/* A node put in on leg `leg`, at p (absolute): { position, nodes, index },
 * index the new node's. Null past the nodes a road keeps or for a leg the
 * road does not have. */
export function insertNode(el, leg, p) {
  const abs = absNodes(el);
  if (abs.length >= ROAD_NODES_MAX || !(leg >= 0 && leg < legCount(el))) {
    return null;
  }
  abs.splice(leg + 1, 0, { x: p.x, y: p.y });
  return { ...rebased(abs), index: leg + 1 };
}

/* Node i moved to p (absolute): { position, nodes }. */
export function moveNode(el, i, p) {
  const abs = absNodes(el);
  if (!(i >= 0 && i < abs.length)) {
    return null;
  }
  abs[i] = { x: p.x, y: p.y };
  return rebased(abs);
}

/*
 * Node i taken out: { position, nodes, closed }. A loop of three becomes an
 * open road of two, since two nodes cannot close; an open road of two is
 * not made any shorter, because one node is not a road, and that is null:
 * delete the road instead.
 */
export function deleteNode(el, i) {
  const abs = absNodes(el);
  const closed = el?.closed === true;
  if (!(i >= 0 && i < abs.length) || abs.length <= OPEN_MIN) {
    return null;
  }
  abs.splice(i, 1);
  return { ...rebased(abs), closed: closed && abs.length >= LOOP_MIN };
}

/* The node of a road nearest (x, y) within reach, or -1. */
export function pickNode(el, x, y, reach) {
  let best = -1;
  let bestD = reach * reach;
  absNodes(el).forEach((p, i) => {
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/* The leg whose middle is nearest (x, y) within reach, or -1. */
export function pickLeg(el, x, y, reach) {
  let best = -1;
  let bestD = reach * reach;
  for (const m of legMidpoints(el)) {
    const d = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
    if (d <= bestD) {
      best = m.leg;
      bestD = d;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Putting a vehicle on a road.
 * ------------------------------------------------------------------ */

/*
 * The road nearest (x, y) and the point on its centre line, when the point
 * is within the road's half width plus `slack` of that line: { road: the
 * road's id, offset: the arc length there to the centimetre (the vehicle's
 * dims.offset), d, x, y, right, twoLaneLoop }. `right` is whether (x, y) is
 * to the right of the centre line in its node order: on a two lane loop that
 * is the lane a car set to Reverse drives, so a car dropped there faces that
 * way. `only` keeps it to one road, for sliding a car along its own.
 * Null when no road is near enough.
 */
export function snapToRoad(doc, x, y, slack, only = null) {
  let best = null;
  for (const el of doc?.elements ?? []) {
    if (!isRoad(el) || (only && el.id !== only)) {
      continue;
    }
    const r = roadOf(el);
    const line = r.centre;
    if (line.points.length < 2) {
      continue;
    }
    const hit = nearestOn(line, x, y);
    if (!(hit.d <= r.width / 2 + slack) || (best && hit.d >= best.d)) {
      continue;
    }
    const at = pointAt(line, hit.s);
    const side = at.tx * (y - hit.y) - at.ty * (x - hit.x);
    let offset = Math.round(hit.s * 100) / 100;
    if (line.closed && offset >= line.length) {
      offset = 0;
    }
    if (!line.closed && offset > line.length) {
      offset = Math.floor(line.length * 100) / 100;
    }
    best = {
      road: el.id,
      offset,
      d: hit.d,
      x: hit.x,
      y: hit.y,
      right: side < 0,
      twoLaneLoop: r.closed && r.lanes === 2,
    };
  }
  return best;
}

/* The style a vehicle is drawn and driven as. */
export function vehicleStyleOf(el) {
  return CAR_STYLES.includes(el?.style) ? el.style : CAR_STYLES[0];
}

/*
 * Where a vehicle with no road waits: side by side along the plot's south
 * edge from its south west corner, nose north, PARK.step apart, in the order
 * they are in the document. Nowhere the physics puts it (a car with no road
 * is left out of the physics altogether); only where the plan draws it.
 */
export const PARK = Object.freeze({ x: 8, y: 5, step: 3 });

function hasLine(doc, el) {
  const road = (doc?.elements ?? []).find((e) => e.id === el.road);
  return Boolean(road && isRoad(road) && roadOf(road).centre.points.length >= 2);
}

/*
 * Where a vehicle is drawn: { x, y, tx, ty, length, width, onRoad }, its
 * centre, the way its nose points (unit) and its body. On a road that is
 * vehicleStart's, the place trafficOf hands the module; with no road it is
 * its place in the parking row.
 */
export function vehiclePlace(doc, el) {
  const at = vehicleStart(doc, el);
  if (at) {
    return { ...at, onRoad: true };
  }
  const kind = VEHICLE_KINDS[vehicleStyleOf(el)];
  let k = 0;
  for (const e of doc?.elements ?? []) {
    if (e === el || e.id === el.id) {
      break;
    }
    if (isVehicle(e) && !hasLine(doc, e)) {
      k += 1;
    }
  }
  return {
    x: PARK.x + k * PARK.step,
    y: PARK.y,
    tx: 0,
    ty: 1,
    length: kind.length,
    width: kind.width,
    onRoad: false,
  };
}

/* A body's four corners in plan, from its centre, heading and size: rear
 * right, front right, front left, rear left. */
export function footprint(p) {
  const hl = p.length / 2;
  const hw = p.width / 2;
  const lx = -p.ty;
  const ly = p.tx;
  return [
    { x: p.x - p.tx * hl - lx * hw, y: p.y - p.ty * hl - ly * hw },
    { x: p.x + p.tx * hl - lx * hw, y: p.y + p.ty * hl - ly * hw },
    { x: p.x + p.tx * hl + lx * hw, y: p.y + p.ty * hl + ly * hw },
    { x: p.x - p.tx * hl + lx * hw, y: p.y - p.ty * hl + ly * hw },
  ];
}

/* Whether two turned rectangles overlap, by the separating axis test on
 * their four edge directions. Touching is not overlapping. */
export function bodiesOverlap(a, b) {
  const pa = footprint(a);
  const pb = footprint(b);
  for (const ax of [[a.tx, a.ty], [-a.ty, a.tx], [b.tx, b.ty], [-b.ty, b.tx]]) {
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (const p of pa) {
      const d = p.x * ax[0] + p.y * ax[1];
      a0 = Math.min(a0, d);
      a1 = Math.max(a1, d);
    }
    for (const p of pb) {
      const d = p.x * ax[0] + p.y * ax[1];
      b0 = Math.min(b0, d);
      b1 = Math.max(b1, d);
    }
    if (a1 <= b0 || b1 <= a0) {
      return false;
    }
  }
  return true;
}

/*
 * Every pair of vehicles whose bodies overlap where they start: [[a, b]],
 * elements, a before b in the document. Only cars on a road: the parking
 * row is spaced so its cars never touch.
 */
export function startOverlaps(doc) {
  const cars = [];
  for (const el of doc?.elements ?? []) {
    if (isVehicle(el)) {
      const at = vehicleStart(doc, el);
      if (at) {
        cars.push({ el, at, r: Math.hypot(at.length, at.width) / 2 });
      }
    }
  }
  const out = [];
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const A = cars[i];
      const B = cars[j];
      if (Math.hypot(A.at.x - B.at.x, A.at.y - B.at.y) >= A.r + B.r) {
        continue;
      }
      if (bodiesOverlap(A.at, B.at)) {
        out.push([A.el, B.el]);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Plan geometry for the road warnings: a road's line against a solid.
 * ------------------------------------------------------------------ */

/* Distance from a point to a segment, in plan. */
export function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const ll = dx * dx + dy * dy;
  let t = ll > 0 ? ((px - ax) * dx + (py - ay) * dy) / ll : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function crosses(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/* Distance between two segments in plan, 0 where they cross. */
export function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
  if (crosses(ax, ay, bx, by, cx, cy, dx, dy)) {
    return 0;
  }
  return Math.min(
    pointSegDist(ax, ay, cx, cy, dx, dy),
    pointSegDist(bx, by, cx, cy, dx, dy),
    pointSegDist(cx, cy, ax, ay, bx, by),
    pointSegDist(dx, dy, ax, ay, bx, by),
  );
}

/* Whether a point is inside a convex polygon given in either winding. */
function insideConvex(poly, x, y) {
  let sign = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c !== 0) {
      const s = c > 0 ? 1 : -1;
      if (sign && s !== sign) {
        return false;
      }
      sign = s;
    }
  }
  return true;
}

/* Distance from a segment to a convex polygon in plan, 0 where they touch
 * or the segment is inside it. */
export function segPolyDist(ax, ay, bx, by, poly) {
  if (insideConvex(poly, ax, ay) || insideConvex(poly, bx, by)) {
    return 0;
  }
  let d = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    d = Math.min(d, segSegDist(ax, ay, bx, by, p.x, p.y, q.x, q.y));
    if (d === 0) {
      return 0;
    }
  }
  return d;
}

/*
 * The least plan distance from a line of points (open or closed) to a
 * shape: { poly } a convex polygon, or { seg: [ax, ay, bx, by], r } a
 * capsule's axis and radius, or { point: [x, y] }. `box` is the shape's
 * plan bounds [x0, y0, x1, y1], so only segments that come within `reach`
 * of it are measured. Returns Infinity when none come that close.
 */
export function lineShapeDist(pts, closed, shape, box, reach) {
  const n = pts.length;
  const nseg = closed ? n : n - 1;
  let best = Infinity;
  for (let i = 0; i < nseg; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (Math.max(a.x, b.x) < box[0] - reach || Math.min(a.x, b.x) > box[2] + reach
      || Math.max(a.y, b.y) < box[1] - reach || Math.min(a.y, b.y) > box[3] + reach) {
      continue;
    }
    let d;
    if (shape.poly) {
      d = segPolyDist(a.x, a.y, b.x, b.y, shape.poly);
    } else if (shape.seg) {
      const s = shape.seg;
      d = segSegDist(a.x, a.y, b.x, b.y, s[0], s[1], s[2], s[3]) - shape.r;
    } else {
      d = pointSegDist(shape.point[0], shape.point[1], a.x, a.y, b.x, b.y);
    }
    if (d < best) {
      best = d;
    }
  }
  return best;
}

/*
 * How far either side of a road's centre line a car's body can reach: the
 * lane's offset plus half the car. A car is its width across; a DRIFT car
 * slides up to about 44 degrees across its path (src/maps/built/traffic.js),
 * so its corners sweep up to half its diagonal. The cars that drive the
 * road decide it; a road with none is held to the widest of the town's.
 * Returns { reach, height }: the height is the tallest of the same cars,
 * because a deck over the road higher than every car is not in their way.
 */
export function roadReach(doc, road) {
  const r = roadOf(road);
  const cars = (doc?.elements ?? []).filter((e) => isVehicle(e) && e.road === road.id);
  let half = 0;
  let height = 0;
  if (cars.length) {
    for (const v of cars) {
      const k = VEHICLE_KINDS[vehicleStyleOf(v)];
      half = Math.max(half, v.drift === true ? Math.hypot(k.length, k.width) / 2 : k.width / 2);
      height = Math.max(height, k.height);
    }
  } else {
    for (const k of Object.values(VEHICLE_KINDS)) {
      half = Math.max(half, k.width / 2);
      height = Math.max(height, k.height);
    }
  }
  return { reach: r.laneOffset + half, height };
}

/* ------------------------------------------------------------------ *
 * The module's lap time, restated from src/native/world.c.
 * ------------------------------------------------------------------ */

/* world.c's own numbers: ROAD_STEP, ROAD_WINDOW, VEHICLE_ACCEL,
 * VEHICLE_BRAKE and ROAD_KAPPA_MAX. */
const W_STEP = 1.0;
const W_WINDOW = 1.5;
const W_ACCEL = 2.5;
const W_BRAKE = 4.0;
const W_KAPPA_MAX = 2.0;

function pieces(len, lone) {
  let k = Math.ceil(len / W_STEP);
  k = k < 1 ? 1 : k;
  if (lone && k < 2) {
    k = 2;
  }
  return k;
}

/* road_seg_s: the last point at or before arc length sg. */
function segS(s, np, sg) {
  let lo = 0;
  let hi = np - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid] <= sg) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/*
 * sim_world_road on `xyz` (the physics frame, x y z a point, exactly what
 * plantworld.uploadRoad hands it): the points it keeps with its long
 * segments cut, their arc lengths, and each point's bend across ROAD_WINDOW
 * either way. { p: [[x, y, z]], s, k, np, len, closed }. The road is
 * assumed to be one the module takes (road.js moduleCheck says so first).
 */
export function moduleRoad(xyz, closed) {
  const n = xyz.length / 3;
  const nseg = closed ? n : n - 1;
  const lone = !closed && nseg === 1;
  const p = [];
  for (let i = 0; i < nseg; i += 1) {
    const a = 3 * i;
    const b = 3 * ((i + 1) % n);
    const dx = xyz[b] - xyz[a];
    const dy = xyz[b + 1] - xyz[a + 1];
    const dz = xyz[b + 2] - xyz[a + 2];
    const k = pieces(Math.sqrt(dx * dx + dy * dy + dz * dz), lone);
    p.push([xyz[a], xyz[a + 1], xyz[a + 2]]);
    for (let j = 1; j < k; j += 1) {
      const f = j / k;
      p.push([xyz[a] + (xyz[b] - xyz[a]) * f, xyz[a + 1] + (xyz[b + 1] - xyz[a + 1]) * f, xyz[a + 2] + (xyz[b + 2] - xyz[a + 2]) * f]);
    }
  }
  const e = closed ? 0 : 3 * (n - 1);
  p.push([xyz[e], xyz[e + 1], xyz[e + 2]]);
  const np = p.length;
  const s = new Array(np).fill(0);
  for (let i = 1; i < np; i += 1) {
    const dx = p[i][0] - p[i - 1][0];
    const dy = p[i][1] - p[i - 1][1];
    const dz = p[i][2] - p[i - 1][2];
    s[i] = s[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const len = s[np - 1];
  /* road_on and road_point_at, in plan: the bend reads x and y only. */
  const at = (sg, out) => {
    let g = sg;
    if (closed) {
      g -= Math.floor(g / len) * len;
    }
    g = g < 0 ? 0 : (g > len ? len : g);
    const i = segS(s, np, g);
    let f = (g - s[i]) / (s[i + 1] - s[i]);
    f = f < 0 ? 0 : (f > 1 ? 1 : f);
    out[0] = p[i][0] + (p[i + 1][0] - p[i][0]) * f;
    out[1] = p[i][1] + (p[i + 1][1] - p[i][1]) * f;
    return out;
  };
  const k = new Array(np).fill(0);
  const A = [0, 0];
  const C = [0, 0];
  const own = closed ? np - 1 : np;
  for (let i = 0; i < own; i += 1) {
    at(s[i] - W_WINDOW, A);
    at(s[i] + W_WINDOW, C);
    const cx = C[0] - A[0];
    const cy = C[1] - A[1];
    const cl = Math.sqrt(cx * cx + cy * cy);
    const abx = p[i][0] - A[0];
    const aby = p[i][1] - A[1];
    const bcx = C[0] - p[i][0];
    const bcy = C[1] - p[i][1];
    const cross = abx * bcy - aby * bcx;
    const den = Math.sqrt(abx * abx + aby * aby) * Math.sqrt(bcx * bcx + bcy * bcy) * cl;
    let kk = den > 0 ? (2 * cross) / den : 0;
    kk = kk > W_KAPPA_MAX ? W_KAPPA_MAX : (kk < -W_KAPPA_MAX ? -W_KAPPA_MAX : kk);
    k[i] = kk;
  }
  if (closed) {
    k[np - 1] = k[0];
  }
  return { p, s, k, np, len, closed: Boolean(closed) };
}

/*
 * profile_for: the speed and the time at every point of a module road
 * driven with top speed vmax and cornering alat. { v, t, T }: T is the
 * time from the first point to the last, a lap of a closed road and the
 * way out of an open one.
 */
export function lapTable(road, vmax, alat) {
  const { s, k, np, closed } = road;
  const v = new Array(np).fill(0);
  const t = new Array(np).fill(0);
  const nu = closed ? np - 1 : np;
  const ak = (i) => (k[i] < 0 ? -k[i] : k[i]);
  for (let i = 0; i < nu; i += 1) {
    let ia = i - 1;
    let ib = i + 1;
    if (closed) {
      ia = (i + nu - 1) % nu;
      ib = (i + 1) % nu;
    } else {
      ia = ia < 0 ? 0 : ia;
      ib = ib > np - 1 ? np - 1 : ib;
    }
    let kk = ak(i);
    kk = ak(ia) > kk ? ak(ia) : kk;
    kk = ak(ib) > kk ? ak(ib) : kk;
    let vc = vmax;
    if (kk > 0) {
      const vl = Math.sqrt(alat / kk);
      vc = vl < vc ? vl : vc;
    }
    v[i] = vc;
  }
  if (closed) {
    let m = 0;
    for (let i = 1; i < nu; i += 1) {
      if (v[i] < v[m]) {
        m = i;
      }
    }
    for (let j = 1; j < nu; j += 1) {
      const i = (m + j) % nu;
      const h = (i + nu - 1) % nu;
      const lim = Math.sqrt(v[h] * v[h] + 2 * W_ACCEL * (s[h + 1] - s[h]));
      v[i] = lim < v[i] ? lim : v[i];
    }
    for (let j = 1; j < nu; j += 1) {
      const i = (m + nu - j) % nu;
      const h = (i + 1) % nu;
      const lim = Math.sqrt(v[h] * v[h] + 2 * W_BRAKE * (s[i + 1] - s[i]));
      v[i] = lim < v[i] ? lim : v[i];
    }
    v[np - 1] = v[0];
  } else {
    v[0] = 0;
    v[np - 1] = 0;
    for (let i = 1; i < np; i += 1) {
      const lim = Math.sqrt(v[i - 1] * v[i - 1] + 2 * W_ACCEL * (s[i] - s[i - 1]));
      v[i] = lim < v[i] ? lim : v[i];
    }
    for (let i = np - 2; i >= 0; i -= 1) {
      const lim = Math.sqrt(v[i + 1] * v[i + 1] + 2 * W_ACCEL * (s[i + 1] - s[i]));
      v[i] = lim < v[i] ? lim : v[i];
    }
  }
  t[0] = 0;
  for (let i = 0; i + 1 < np; i += 1) {
    t[i + 1] = t[i] + (2 * (s[i + 1] - s[i])) / (v[i] + v[i + 1]);
  }
  return { v, t, T: t[np - 1] };
}

/* time_at_s: the time into a table at which its car reaches arc length sg. */
function timeAtS(road, tab, sg) {
  const { s, np, len } = road;
  const at = sg < 0 ? 0 : (sg > len ? len : sg);
  const i = segS(s, np, at);
  const L = s[i + 1] - s[i];
  let d = at - s[i];
  d = d < 0 ? 0 : (d > L ? L : d);
  const v0 = tab.v[i];
  const v1 = tab.v[i + 1];
  let w = v0 * v0 + (v1 * v1 - v0 * v0) * (d / L);
  w = w < 0 ? 0 : w;
  const den = v0 + Math.sqrt(w);
  return tab.t[i] + (den > 0 ? (2 * d) / den : 0);
}

/* route_time: the route time at which a car is at `offset` along its
 * route (round a loop, or out and back along an open road). */
export function routeTime(road, tab, offset) {
  const troute = road.closed ? tab.T : 2 * tab.T;
  const sroute = road.closed ? road.len : 2 * road.len;
  let lap = Math.floor(offset / sroute);
  let rem = offset - lap * sroute;
  if (rem >= sroute) {
    rem -= sroute;
    lap += 1;
  }
  rem = rem < 0 ? 0 : rem;
  const tl = road.closed || rem <= road.len
    ? timeAtS(road, tab, rem)
    : troute - timeAtS(road, tab, sroute - rem);
  return lap * troute + tl;
}

/* How far round a closed road's route a car is at route time tau, counted
 * from its first point and on over every lap: laps times the length plus
 * the arc length. Constant acceleration along each piece, as the module
 * has it. */
function routeDistance(road, tab, tau) {
  const T = tab.T;
  const lap = Math.floor(tau / T);
  let tr = tau - lap * T;
  tr = tr < 0 ? 0 : (tr >= T ? 0 : tr);
  const { t, v } = tab;
  let lo = 0;
  let hi = road.np - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t[mid] <= tr) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const L = road.s[lo + 1] - road.s[lo];
  const dt = tr - t[lo];
  const a = L > 0 ? (v[lo + 1] * v[lo + 1] - v[lo] * v[lo]) / (2 * L) : 0;
  let d = v[lo] * dt + 0.5 * a * dt * dt;
  d = d < 0 ? 0 : (d > L ? L : d);
  return lap * road.len + road.s[lo] + d;
}

/*
 * When two cars that share one closed lane first touch, in seconds of the
 * clock from 0, or null when they do not within `horizon` seconds. Each car
 * is { table, offset, length }: its lapTable on the lane (moduleRoad), its
 * module offset and its body's length. They touch when the distance along
 * the lane between their centres comes under half their two lengths, found
 * by stepping the clock `dt` at a time and also catching a pass between two
 * steps, where one's lead over the other goes through a whole lap. Cars
 * with the same table keep the same gap in time for ever, so this is only
 * asked of two with different ones.
 */
export function firstMeeting(road, a, b, horizon, dt = 0.1) {
  const L = road.len;
  const ta = routeTime(road, a.table, a.offset);
  const tb = routeTime(road, b.table, b.offset);
  const touch = (a.length + b.length) / 2;
  let prevLap = null;
  for (let clock = 0; clock <= horizon; clock += dt) {
    const rel = routeDistance(road, b.table, tb + clock) - routeDistance(road, a.table, ta + clock);
    const lap = Math.floor(rel / L);
    const gap = rel - lap * L;
    if (gap < touch || L - gap < touch || (prevLap !== null && lap !== prevLap)) {
      return clock;
    }
    prevLap = lap;
  }
  return null;
}

/*
 * A lane as the module will be handed it: trafficOf's road entry's world
 * points, through the same conversion plantworld.uploadRoad makes.
 */
export function laneXyz(entry) {
  const S = { x: 0, y: 0, z: 0 };
  const xyz = new Float64Array(entry.points.length * 3);
  entry.points.forEach((q, i) => {
    threePosToSim(q.x, q.y, q.z, S);
    xyz[3 * i] = S.x;
    xyz[3 * i + 1] = S.y;
    xyz[3 * i + 2] = S.z;
  });
  return xyz;
}

/*
 * Every clash between two cars in one lane, from trafficOf's answer:
 *   { kind: 'open', a, b }      two cars on one open road, which every car
 *                               drives out and back along its middle, so
 *                               they meet head on
 *   { kind: 'head-on', a, b }   two cars driving a one lane loop in opposite
 *                               directions
 *   { kind: 'catch', a, b, at } two cars in one lane of a loop whose laps
 *                               differ, which first touch `at` seconds into
 *                               the clock, within `horizon`
 * a and b are trafficOf vehicle entries, a first in the document. One
 * clash a lane: the first pair found.
 */
export function laneClashes(traffic, horizon) {
  const out = [];
  const groups = new Map();
  for (const v of traffic.vehicles) {
    const entry = traffic.roads[v.road];
    const key = `${entry.element}|${entry.lane}`;
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push({ v, entry });
  }
  const modules = new Map();
  const moduleOf = (entry) => {
    let m = modules.get(entry.index);
    if (!m) {
      m = moduleRoad(laneXyz(entry), entry.closed);
      modules.set(entry.index, m);
    }
    return m;
  };
  for (const g of groups.values()) {
    if (g.length < 2) {
      continue;
    }
    if (!g[0].entry.closed) {
      out.push({ kind: 'open', a: g[0].v, b: g[1].v });
      continue;
    }
    const other = g.find((x) => x.entry.index !== g[0].entry.index);
    if (other) {
      out.push({ kind: 'head-on', a: g[0].v, b: other.v });
      continue;
    }
    /* One lane, one way round: only cars with different tables can meet. */
    let found = null;
    for (let i = 0; i < g.length && !found; i += 1) {
      for (let j = i + 1; j < g.length && !found; j += 1) {
        const A = g[i].v;
        const B = g[j].v;
        if (A.topSpeed === B.topSpeed && A.lateral === B.lateral) {
          continue;
        }
        const road = moduleOf(g[i].entry);
        const at = firstMeeting(road,
          { table: lapTable(road, A.topSpeed, A.lateral), offset: A.offset, length: A.length },
          { table: lapTable(road, B.topSpeed, B.lateral), offset: B.offset, length: B.length },
          horizon);
        if (at !== null) {
          found = { kind: 'catch', a: A, b: B, at };
        }
      }
    }
    if (found) {
      out.push(found);
    }
  }
  return out;
}
