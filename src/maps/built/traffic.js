/*
 * traffic.js: a map document's roads and vehicles, as the physics module
 * takes them. Pure: no Three.js, no DOM, and no trigonometry.
 *
 * ONE FUNCTION FOR EVERY CALLER. The simulator, the builder's Play and the
 * checks all call trafficOf(doc), so all three hand the module the same
 * numbers: the same lane lines, point for point, the same offsets, the same
 * bodies and speeds. A car's pose is then worked out inside the module from
 * its step clock (src/native/world.c section 5), so where a car is at a
 * given step is the same wherever the map is flown. uploadTraffic hands the
 * result over through src/game/plantworld.js, so nobody writes that loop
 * twice.
 *
 * WHAT A CAR DRIVES. A road element is eased into a centre line by
 * ./road.js. A car's line is that centre line, reversed when it drives
 * against the node order, and moved to its own left by the road's lane
 * offset: width / 4 on a closed road of two lanes, because Japan drives on
 * the left and the built maps are Japanese. On an open road, or a road of
 * one lane, the offset is 0 and the car drives the centre: the module turns
 * a car round at each end of an open road on the line it came along, so a
 * car kept to its left on the way out would come back on the wrong side
 * (road.js roadOf says the same). Only the lines some car drives are
 * uploaded, each once however many cars share it.
 *
 * THE FRAME. Road points are worked out in the document's plan and taken to
 * the world by docToWorld in ./place.js, the one conversion every element of
 * a built map goes through. The world is Three.js metres, Y up, which is
 * what plantworld.uploadRoad takes. ROAD HEIGHT: the built map's ground is
 * flat at zero (./index.js, "the paving is flat and at zero"), and a road is
 * laid on the ground, so every road point is at y = 0; the roofs that
 * groundUnder finds are not where roads go, and the builder warns about a
 * road that crosses a building.
 *
 * THE BODY. world.c models a car as ONE box, from `clearance` up to
 * `clearance + height` in its own frame. The drawn car (src/props/street.js
 * CAR_KINDS, drawn by the town's own builder) has its wheels under a sill
 * 0.36 to 0.52 m up, and the parked car's solids close the slot under it
 * ("a 0.15 m slot under a car is not a line"). A clearance at the sill
 * would leave that slot open under a moving car, a gap a quad could be
 * flown through between the wheels, which a real car's wheels and axles
 * would never allow. So the clearance is 0: the box stands on the road, as
 * the parked car's `under` solid does, and a car is solid from the road to
 * its roof. The box is the drawn car's own length, width and height (for
 * the box lorry, its box body's width, the widest part), so the solid car
 * is the drawn car. Over a saloon's bonnet and boot the box fills air a
 * roof line leaves, a few tenths of a metre: the module holds one box a car,
 * and a box that stopped at the waist would let a quad through the cabin.
 *
 * SPEEDS. Ordinary traffic takes a yard at 10 to 14 m/s, a top speed each
 * vehicle's document carries (its style's to start with, STYLE_DIMS in
 * src/props/types.js), and corners at 2.5 to 4 m/s/s, a driver's comfort,
 * so a 12 m bend is taken at 5.5 to 7 m/s. THE DRIFT CAR, a vehicle with
 * `drift` on, corners at DRIFT.lateral, 8 m/s/s, and slides: the module
 * turns its body into the bend by a slip whose tangent of half is the drift
 * gain times the lateral acceleration, so at DRIFT.gain 0.05 and 8 m/s/s
 * the nose sits about 44 degrees inside its path at the height of a bend,
 * easing in and out with the bend's own curvature, and nothing on a
 * straight. Its top speed is its document's like any vehicle's; DRIFT.speed,
 * 20 m/s, is what the builder offers when drift is switched on. A 12 m bend
 * at 8 m/s/s is 9.8 m/s, and it pulls away at the module's 2.5 m/s/s, so a
 * five inch at 20 to 40 m/s has to work to hold its tail through the bends
 * and to keep up with nothing on the straights.
 *
 * THE LIMITS ARE THE MODULE'S, checked here rather than met there: 16
 * roads, 64 mover slots (a built map has no train, so all 64 are cars'),
 * 8,192 points a road and 16,384 for all of them, 64 speed tables and
 * 65,536 table entries. Each road is also held to sim_world_road's own
 * tests on the very numbers it will be handed (road.js moduleCheck). What
 * does not fit is left out with a problem the builder can show, so
 * uploadTraffic never meets a refusal for anything a document can say.
 *
 * THE API.
 *
 *   VEHICLE_KINDS[style]    { length, width, height, clearance, topSpeed,
 *                           lateral }: each of the town's cars (CAR_STYLES)
 *   DRIFT                   { gain, lateral, speed } for the drift car
 *   VEHICLE_MATERIAL        contactMaterial's name for a car: 'train', the
 *                           painted steel the shell knows moving things by
 *   trafficOf(doc)          { roads, vehicles, problems }:
 *     roads[i]    { index: i, points: [{ x, y, z }] Three.js metres, closed,
 *                   element: the road's id, lane: 'left' | 'right' |
 *                   'centre' (of the node order), reverse, length (m),
 *                   modulePoints: the points the module keeps, line: the
 *                   same line in the plan (a road.js LINE), for drawing }
 *     vehicles[k] { slot, road: an index into roads, offset (m along that
 *                   road's line from its first point, as addVehicle takes
 *                   it), topSpeed, lateral, drift, length, width, height,
 *                   clearance, kind, style, variant, seed (seedOf, the
 *                   parked car's colour pick), element: the vehicle's id,
 *                   name: the author's name for it, or '' }
 *     problems    [{ level, code, message, elementId }], every road's own
 *                 (road.js) and every vehicle left out and why
 *     drawn[j]    { element: the road's id, width, lanes, closed,
 *                   laneOffset, line: its centre line in the plan (road.js
 *                   roadOf's, shared: read it, never change it) }, one for
 *                   EVERY road element with a line, driven or not, for
 *                   drawing it (./roadmesh.js): a road nobody drives is
 *                   still a road on the map
 *     field       { width, depth } of the document's plot, m, which is
 *                 what place.js docToWorld takes a plan point to the world
 *                 with; null for a document with no field
 *                 A document that is not a freestyle map has no traffic,
 *                 and nothing drawn.
 *   uploadTraffic(sim, t)   uploadRoad for each road then addVehicle for
 *                           each vehicle, after uploadWorld; returns
 *                           { roads, vehicles, problems }, never throws.
 *                           The clock is the caller's (setVehicleClock).
 *   vehicleStart(doc, el)   where a vehicle is at step 0, in the plan:
 *                           { x, y, tx, ty, length, width } (its heading
 *                           tx, ty), or null when it has no road to be on.
 *                           For drawing a car where it starts, without the
 *                           module.
 *   roadKeepOut(t)          where a crashed craft must not be set down, for
 *                           findRestSpot: { roads, blocks(x, z, y, pad),
 *                           verges(x, z, pad, visit) } in the world, or
 *                           null when no car drives. See its own comment.
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

import { ELEMENTS, KIND, docModeOf, clampByLimits } from '../../trackbuilder/elements.js';
import { CAR_STYLES, STYLE_DIMS } from '../../props/types.js';
import { CAR_KINDS } from '../../props/street.js';
import { seedOf } from '../../props/parts.js';
import { threePosToSim } from '../../render/frame.js';
import { uploadRoad, addVehicle, MOVER_SLOTS } from '../../game/plantworld.js';
import { docToWorld } from './place.js';
import {
  roadOf, laneLine, reverseLine, arcOn, pointAt, nearestOn, moduleCheck, MODULE,
} from './road.js';

/* How hard each of the town's cars is driven round a bend, m/s/s: a
 * driver's comfortable 0.25 to 0.4 g, the tall and the heavy ones gentler. */
const LATERAL = {
  kei: 3.5, keivan: 3.0, hatch: 4.0, sedan: 4.0, wagon: 4.0, minivan: 3.5, van: 3.0, boxtruck: 2.5, minibus: 2.5,
};

/* Each of the town's cars as the module drives it. The body is the drawn
 * car's own box (CAR_KINDS in src/props/street.js); see the header for the
 * clearance. */
export const VEHICLE_KINDS = Object.freeze(Object.fromEntries(CAR_STYLES.map((style) => {
  const k = CAR_KINDS[style];
  return [style, Object.freeze({
    length: k.L,
    width: k.W,
    height: k.H,
    clearance: 0,
    topSpeed: STYLE_DIMS.vehicle[style].speed,
    lateral: LATERAL[style],
  })];
})));

/* The drift car. gain is world.c's slip gain per m/s/s of lateral
 * acceleration (0 to VEHICLE_DRIFT_MAX, 1; its slip is capped at 60
 * degrees); lateral its cornering, m/s/s; speed the top speed the builder
 * offers when drift is switched on, m/s. */
export const DRIFT = Object.freeze({ gain: 0.05, lateral: 8, speed: 20 });

export const VEHICLE_MATERIAL = 'train';

function problem(level, code, message, elementId) {
  return { level, code, message, elementId };
}

/*
 * The line a vehicle drives, in the plan, and where on it the vehicle is at
 * step 0. Returns { key, lane, fwd, line, offset, reverse }: `key` names the
 * line, so the cars that share one share one upload; `line` is what is
 * uploaded, `fwd` the same lane in node order (the one the document's offset
 * is measured along, point for point with the centre), `offset` the
 * module's, metres along `line` from its first point, round a loop or out
 * and back along an open road; `reverse` whether `line` runs against the
 * node order. `r` is road.js roadOf's answer for the vehicle's road.
 */
function drive(r, el) {
  const centre = r.centre;
  const L = centre.length;
  const want = clampByLimits(ELEMENTS.vehicle, 'offset', el.dims?.offset);
  const reverse = el.reverse === true;
  if (!r.closed) {
    /* The centre, both ways: out along it is 0 to L, back is L to 2 L. */
    const s = want > L ? L : want;
    return { key: `${r.el.id}|centre`, lane: 'centre', fwd: centre, line: centre, offset: reverse ? 2 * L - s : s, reverse: false };
  }
  const s = want - Math.floor(want / L) * L;
  const side = reverse ? -1 : 1;
  const fwd = r.laneOffset ? laneLine(centre, side * r.laneOffset) : centre;
  const a = arcOn(centre, fwd, s < L ? s : 0);
  const line = reverse ? reverseLine(fwd) : fwd;
  const offset = reverse ? (a > 0 ? fwd.length - a : 0) : a;
  const lane = r.laneOffset ? (reverse ? 'right' : 'left') : 'centre';
  return { key: `${r.el.id}|${reverse ? 'reverse' : 'forward'}`, lane, fwd, line, offset, reverse };
}

/* A plan LINE as the world points uploadRoad takes, and as the physics
 * frame numbers sim_world_road will be handed, for moduleCheck. */
function toWorld(line, W, D) {
  const points = [];
  const xyz = new Float64Array(line.points.length * 3);
  const S = { x: 0, y: 0, z: 0 };
  line.points.forEach((p, i) => {
    const w = docToWorld(W, D, p.x, p.y, 0);
    points.push(w);
    threePosToSim(w.x, w.y, w.z, S);
    xyz[3 * i] = S.x;
    xyz[3 * i + 1] = S.y;
    xyz[3 * i + 2] = S.z;
  });
  return { points, xyz };
}

/*
 * The document's traffic, as the module takes it. See the header.
 */
export function trafficOf(doc) {
  const out = { roads: [], vehicles: [], problems: [], drawn: [], field: null };
  if (!doc || docModeOf(doc) !== 'freestyle' || !Array.isArray(doc.elements) || !doc.field) {
    return out;
  }
  const W = doc.field.width;
  const D = doc.field.depth;
  out.field = { width: W, depth: D };
  const byId = new Map();
  const roadInfo = new Map();
  for (const el of doc.elements) {
    byId.set(el.id, el);
    if (ELEMENTS[el.type]?.kind === KIND.ROAD) {
      const r = roadOf(el);
      roadInfo.set(el.id, r);
      out.problems.push(...r.problems);
      if (r.centre.points.length >= 2) {
        out.drawn.push({
          element: el.id, width: r.width, lanes: r.lanes, closed: r.closed, laneOffset: r.laneOffset, line: r.centre,
        });
      }
    }
  }
  const lines = new Map();
  const tables = new Map();
  let worldPoints = 0;
  let tablePoints = 0;
  for (const el of doc.elements) {
    if (ELEMENTS[el.type]?.kind !== KIND.VEHICLE) {
      continue;
    }
    const target = byId.get(el.road);
    const r = target && ELEMENTS[target.type]?.kind === KIND.ROAD ? roadInfo.get(target.id) : null;
    if (!r) {
      out.problems.push(problem('warn', 'tr-no-road',
        el.road ? `A vehicle names ${target ? `${target.type} ${el.road}, which is not a road` : `road ${el.road}, which is not on the map`}, so it stays parked. Put it on a road.`
          : 'A vehicle has no road, so it stays parked. Put it on a road.', el.id));
      continue;
    }
    if (r.centre.points.length < 2) {
      out.problems.push(problem('warn', 'tr-road-unusable',
        `A vehicle is on road ${r.el.id}, which has no line to drive, so it stays parked.`, el.id));
      continue;
    }
    if (out.vehicles.length >= MOVER_SLOTS) {
      out.problems.push(problem('warn', 'tr-slots',
        `The physics drives ${MOVER_SLOTS} vehicles at most, and this map has more: this one stays parked.`, el.id));
      continue;
    }
    const dv = drive(r, el);
    let entry = lines.get(dv.key);
    if (!entry) {
      entry = { refused: null };
      lines.set(dv.key, entry);
      const w = toWorld(dv.line, W, D);
      const check = moduleCheck(w.xyz, dv.line.closed);
      if (check.code) {
        entry.refused = `the physics would refuse its line: ${check.message}`;
      } else if (out.roads.length >= MODULE.MAX_ROADS) {
        entry.refused = `the physics holds ${MODULE.MAX_ROADS} lanes of road, and this map needs more`;
      } else if (worldPoints + check.points > MODULE.WORLD_POINTS) {
        entry.refused = `the physics holds ${MODULE.WORLD_POINTS} points of road in all, and this lane would pass that`;
      } else {
        worldPoints += check.points;
        entry.road = {
          index: out.roads.length,
          points: w.points,
          closed: dv.line.closed,
          element: r.el.id,
          lane: dv.lane,
          reverse: dv.reverse,
          length: dv.line.length,
          modulePoints: check.points,
          line: dv.line,
        };
        out.roads.push(entry.road);
      }
    }
    if (entry.refused) {
      out.problems.push(problem('warn', 'tr-lane', `A vehicle on road ${r.el.id} stays parked: ${entry.refused}.`, el.id));
      continue;
    }
    const style = CAR_STYLES.includes(el.style) ? el.style : CAR_STYLES[0];
    const kind = VEHICLE_KINDS[style];
    const drift = el.drift === true;
    const topSpeed = clampByLimits(ELEMENTS.vehicle, 'speed', el.dims?.speed);
    const lateral = drift ? DRIFT.lateral : kind.lateral;
    /* The module keeps one speed table for each road, top speed and
     * cornering, as long as its road, and shares it between the cars that
     * match. */
    const tkey = `${entry.road.index}|${topSpeed}|${lateral}`;
    if (!tables.has(tkey)) {
      if (tables.size >= MODULE.MAX_PROFILES || tablePoints + entry.road.modulePoints > MODULE.PROFILE_POINTS) {
        out.problems.push(problem('warn', 'tr-tables',
          'The physics has no room for another speed table: give this vehicle the same top speed as another on its lane, or use fewer.', el.id));
        continue;
      }
      tables.set(tkey, true);
      tablePoints += entry.road.modulePoints;
    }
    out.vehicles.push({
      slot: out.vehicles.length,
      road: entry.road.index,
      offset: dv.offset,
      topSpeed,
      lateral,
      drift: drift ? DRIFT.gain : 0,
      length: kind.length,
      width: kind.width,
      height: kind.height,
      clearance: kind.clearance,
      kind: VEHICLE_MATERIAL,
      style,
      variant: clampByLimits(ELEMENTS.vehicle, 'variant', el.dims?.variant),
      seed: seedOf(el),
      element: el.id,
      name: typeof el.name === 'string' ? el.name : '',
    });
  }
  return out;
}

/*
 * Hand trafficOf's result to the module: every road, then every vehicle, in
 * order. Call after uploadWorld, which clears the roads with everything
 * else, and set the clock after (plantworld.setVehicleClock). Returns
 * { roads, vehicles, problems }: how many of each the module took, and why
 * any it did not. Never throws: a road the module refuses leaves its cars
 * parked, which is a missing car and not a wall a craft flies through.
 */
export function uploadTraffic(sim, traffic) {
  const problems = [];
  const index = new Map();
  for (const r of traffic.roads) {
    try {
      index.set(r.index, uploadRoad(sim, r.points, r.closed));
    } catch (e) {
      problems.push(problem('warn', 'tr-refused', `road ${r.element} (${r.lane}): ${e.message}`, r.element));
    }
  }
  let vehicles = 0;
  for (const v of traffic.vehicles) {
    const road = index.get(v.road);
    if (road === undefined) {
      problems.push(problem('warn', 'tr-refused', `vehicle ${v.element}: its road was not taken`, v.element));
      continue;
    }
    try {
      addVehicle(sim, v.slot, road, v);
      vehicles += 1;
    } catch (e) {
      problems.push(problem('warn', 'tr-refused', `vehicle ${v.element}: ${e.message}`, v.element));
    }
  }
  return { roads: index.size, vehicles, problems };
}

/*
 * Where a vehicle is at step 0, in the plan, and which way it faces: the
 * same line and offset trafficOf hands the module, read with road.js
 * pointAt. { x, y, tx, ty, length, width }, or null when it has no road
 * with a line. An open road's car on its way back faces back.
 */
export function vehicleStart(doc, el) {
  const target = (doc?.elements ?? []).find((e) => e.id === el?.road);
  if (!target || ELEMENTS[target.type]?.kind !== KIND.ROAD) {
    return null;
  }
  const r = roadOf(target);
  if (r.centre.points.length < 2) {
    return null;
  }
  const dv = drive(r, el);
  const L = dv.line.length;
  const back = !dv.line.closed && dv.offset > L;
  const p = pointAt(dv.line, back ? 2 * L - dv.offset : dv.offset);
  const style = CAR_STYLES.includes(el.style) ? el.style : CAR_STYLES[0];
  const kind = VEHICLE_KINDS[style];
  return {
    x: p.x,
    y: p.y,
    tx: back ? -p.tx : p.tx,
    ty: back ? -p.ty : p.ty,
    length: kind.length,
    width: kind.width,
  };
}

/*
 * WHERE A CRASHED CRAFT MUST NOT BE SET DOWN: the roads the traffic drives.
 *
 * A crash is set down on the nearest flat surface (findRestSpot in
 * src/game/collide.js), and a road is flat, so a crash on the yard loop was
 * put on the lane; a landed craft is not stepped, and the next car drove
 * through it, with the pilot looking at the underside of a lorry (PROGRESS.md,
 * Stage E). The owner's decision of 2026-09-26: a crash on a road sets the
 * craft down on the verge.
 *
 * So a rest spot is refused when it is within `clear` of the centre line of
 * a road some car drives, measured with road.js nearestOn in the plan: a
 * lane's half width, plus the most any car on that road reaches from the
 * line it drives, plus the caller's `pad` (the parked craft's own radius).
 * On a two lane loop a lane's half width IS the lane's offset from the
 * centre, so that is the outer edge of a car in either lane; on a road of
 * one lane it is the whole road. A car reaches half its width, and the
 * drift car, whose body turns across its path in a slide, half its
 * diagonal, the most it can reach at any slip. A spot on a surface above
 * the tallest car on the road, a footbridge's deck, is not in the traffic.
 *
 * And the verge is offered: `verges` hands the caller, for each such road,
 * the two points square off its centre line from the nearest point to
 * (x, z), just clear either side, so a crash in the middle of a wide road
 * is not sent back to the start line for want of a candidate. The caller
 * judges them like any other spot and takes the nearest that is flat,
 * clear and reachable.
 *
 * World in, world out (Three.js metres, x and z), through the one
 * conversion place.js makes. Null when no car drives: every map but one
 * with traffic is set down exactly as before.
 */
const VERGE_SLACK = 0.1;

export function roadKeepOut(t) {
  if (!t || !t.field || !t.vehicles.length) {
    return null;
  }
  const W = t.field.width;
  const D = t.field.depth;
  const byRoad = new Map();
  for (const v of t.vehicles) {
    const lane = t.roads[v.road];
    const drawn = lane ? t.drawn.find((d) => d.element === lane.element) : null;
    if (!drawn) {
      continue;
    }
    const reach = v.drift > 0
      ? Math.sqrt(v.length * v.length + v.width * v.width) / 2
      : v.width / 2;
    const top = v.clearance + v.height;
    const had = byRoad.get(drawn.element);
    const laneHalf = drawn.width / (2 * (drawn.lanes > 0 ? drawn.lanes : 1));
    if (!had) {
      byRoad.set(drawn.element, { line: drawn.line, clear: laneHalf + reach, top });
    } else {
      had.clear = Math.max(had.clear, laneHalf + reach);
      had.top = Math.max(had.top, top);
    }
  }
  const roads = [...byRoad.values()];
  if (!roads.length) {
    return null;
  }
  return {
    roads,
    /* Is a craft parked at (x, z) on a surface at height y in the traffic? */
    blocks(x, z, y, pad) {
      const px = x + W / 2;
      const py = D / 2 - z;
      for (const r of roads) {
        if (y < r.top && nearestOn(r.line, px, py).d < r.clear + pad) {
          return true;
        }
      }
      return false;
    },
    /* The verge either side of each road, square off its centre line from
     * the nearest point to (x, z): visit(x, z) for each, in the world. */
    verges(x, z, pad, visit) {
      const px = x + W / 2;
      const py = D / 2 - z;
      for (const r of roads) {
        const n = nearestOn(r.line, px, py);
        const at = pointAt(r.line, n.s);
        /* The line's own left, the tangent turned a quarter. */
        const lx = -at.ty;
        const ly = at.tx;
        const out = r.clear + pad + VERGE_SLACK;
        for (const side of [1, -1]) {
          visit(n.x + lx * side * out - W / 2, D / 2 - (n.y + ly * side * out));
        }
      }
    },
  };
}
