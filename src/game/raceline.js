/*
 * raceline.js: the line a pilot is shown to follow through a RaceGOW room.
 *
 * Pure arithmetic: no Three.js, no DOM, nothing from the physics. It reads a
 * course (src/game/trackdoc.js) and answers with a lap of breadcrumbs, where
 * to be and how fast, and the shell draws them (src/render/raceline.js). It
 * feeds nothing back into the flight, so it may use Math.sin and Math.cos.
 *
 * WHY THE BUILDER'S OWN LINE IS NOT THIS. The builder's racing line
 * (src/trackbuilder/path.js) is a cubic through every opening's centre, square
 * on, with the tangent set by the gate's normal. That is the right line for a
 * plan and for the curvature warning, because it is forced through every
 * opening whatever the cost. It is not a line anyone flies: on the eight
 * shipped rooms 25 to 29 percent of its length turns tighter than a metre
 * radius, on an aircraft 0.35 m across, and at the tightest it is a 0.09 m
 * radius (PROGRESS.md, 2026-10-08). A pilot does not square up to every gate;
 * they cross it where the next turn is easiest and carry speed through it.
 *
 * WHAT THIS DOES. It keeps the builder's knots, because they carry which way
 * round every pole the lap goes and the waypoints the author put in for the
 * loops, and it lets each knot slide:
 *
 *   an opening's knot    anywhere inside the hole, less the aircraft and a
 *                        margin, and its heading may lean off the normal
 *   a pole's knot        outward from the pole along its pass side, and up
 *   a waypoint's knot    inside a leash round where the author put it
 *
 * Between knots it is the same cubic Hermite the builder draws, so a
 * parameter vector of zeros IS the builder's line (the baseline, reported
 * beside the answer) and the search only ever keeps a change that is no
 * worse. The cost is the lap time of the line at a stated cornering load
 * (speedProfile) plus a penalty, large enough to be a wall, for touching a
 * frame or a pole, crossing an opening the lap was not sent through, going
 * back through one, or leaving the room. An opening is any level of any
 * structure the lap flies, framed or a gap in the lattice (see THE RULES).
 * Coordinate descent with a shrinking step, in knot order, so the answer is
 * the same on every machine that has the same Math.
 *
 * THE RULES IT KEEPS. RaceGOW's published rules (the four documents linked
 * from racegow.com, read on 2026-10-08; the "Track Building Rules and
 * Information" one is quoted in src/trackbuilder/racegow.js) say two things
 * about the flying, in its General Track Rules, and nothing else:
 *
 *   5. "Tracks must be built and flown exactly as shown, no modifications
 *      allowed." (The Basic Concept says the same of the flythrough video:
 *      "fly them as shown".)
 *   7. "You cannot intentionally fly through any gates in the opposite
 *      direction to shorten your line. For example if you have to go past a
 *      gate and then back through it, you cannot just fly through it backward
 *      and then spin 180 back through the gate like a "cheese" move that many
 *      angle pilots use in place of a split-S or corkscrew type maneuver on
 *      Velocidrone."
 *
 * There is no penalty and no gate miss rule, and no word about an opening
 * with no pipe round it (Gate Rule 2 says a gate is "fully enclosed"), so the
 * rules do not forbid a pass through a gap in the lattice. Nor do RaceGOW's
 * own flythroughs keep to the lap: TRACK-FROM-GIF.md, step 8, records them
 * crossing openings more often than the lap scores them. The line is stricter
 * than both on purpose: the game scores a gap as an opening and lights it as
 * one, a trail through one the way the lap does not is the shortcut rule 7
 * names, and a trail through one at a moment the lap does not is a route that
 * is not the one shown. So a framed opening and a gap are alike a wall out of
 * turn and the wrong way, and a track whose line cannot be found without
 * crossing one gets no line.
 *
 * WHAT IT IS NOT. It is not a time optimal trajectory: the search moves a
 * knot's place, heading and tangent length, not the line itself, and the
 * speed limit is a point mass under a thrust vector budget, not the plant.
 * That is enough to say where to fly. Whether the plant can follow it is
 * scripts/raceline-check.js --fly, which flies the result through
 * dist/sim.wasm with Betaflight's loop, in empty sky, and scores it with Race.
 *
 * THE PACE IS A HUMAN'S, NOT A FIVE INCH'S. See PACE.
 *
 * Scene frame throughout: metres, Y up, as the course hands it over.
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

import { Race, gateAcross, gateUp, travelAxis } from './race.js';
import { MICRO_SCALE } from './track.js';
import { airframeById } from '../../configs/airframes.js';
import { frameParts } from '../props/aperture.js';
import {
  PIPE_OD, ROOM_WIDTH, ROOM_DEPTH, ROOM_HEIGHT,
} from '../trackbuilder/racegow.js';

const G = 9.81;

/* The aircraft's sweep radius in scene metres: the five inch's arm plus its
 * hull, 0.1735 m, which is what src/game/collide.js sweeps. A RaceGOW room is
 * built MICRO_SCALE times life size and flown with the five inch, so this is
 * the one length in the room that does not scale. */
const FIVE = airframeById('5inch').dims;
export const CRAFT_SWEEP = FIVE.arm + (FIVE.hullR ?? FIVE.propR);

/* A RaceGOW pipe's radius as built, scene metres. */
const TUBE_R = (PIPE_OD * MICRO_SCALE) / 2;

/*
 * PACE. The load the line is designed to and the speed it is capped at.
 *
 * lateral  g of sideways load in a level turn. The thrust the line may ask
 *          for is g * sqrt(1 + lateral^2), gravity included, so a climbing
 *          or diving turn pays for the weight it carries.
 * cap      m/s, the fastest the line ever asks for. On these rooms the turns
 *          decide the lap and this barely matters: 4 to 8 m/s moves a lap
 *          by under a percent.
 *
 * THIS IS AN EFFECTIVE FIGURE, NOT A MEASUREMENT. The plant could hold two
 * to three g through a turn and a pilot a good deal of it, so 0.35 g is not
 * what anyone corners at. It is the one number that makes the whole of this
 * file, the line's geometry and its speed limit together, take about as long
 * to fly as people do, and it was found that way: the lap this makes for the
 * five tracks on the board with eighteen or more times posted, against the
 * best of them (webfpv.org/board, 2026-10-08), over the five a ratio of
 *
 *     RaceGOW5 Track 1     0.93      RaceGOW6 Track 1     1.44
 *     RaceGOW5 Track 2     1.06      Whoop Triple Stack   0.72
 *     Master before buying Mobula8   0.91
 *
 * and a geometric mean of 0.99. A trail a world class pilot cannot fly
 * teaches nothing and one that is twice as slow is no race line, so the
 * target was the board's best, not a pace nobody has flown. The spread is the
 * model's: a point mass has no inertia in its attitude and the line is not
 * the best line, so a loop heavy track comes out slow (RaceGOW6 Track 1's
 * tower) and a track of short straights fast. scripts/raceline-check.js
 * prints the two of them that are presets (RaceGOW5 Track 1 and 2) and their
 * mean, so a change to either file shows up against it.
 */
export const PACE = { lateral: 0.35, cap: 6 };

/*
 * The room the aircraft keeps, beyond its own sweep, from a pipe or a wall,
 * metres. A pilot aiming at the middle of a 2.44 m hole is not accurate to a
 * centimetre, and a trail that threads the pipe at its edge is a trail that
 * gets people hit. A prop and a half.
 */
const MARGIN = 0.25;

/* Lean off a normal the heading may take, as a tangent, per kind of knot. A
 * pass 40 degrees off the normal still scores (the scoring box is a swept
 * volume) and the clearance penalty is what stops it clipping a stile. */
const LEAN_GATE = Math.tan((40 * Math.PI) / 180);
const LEAN_MARKER = Math.tan((55 * Math.PI) / 180);
const LEAN_WAYPOINT = Math.tan((70 * Math.PI) / 180);

/* How far a waypoint or a builder's wrap knot may move from where it was
 * put, in metres. RaceGOW's lattice is 0.762 m a unit, 2.6 m built. */
const LEASH_WAYPOINT = 1.3;
const LEASH_WRAP = 0.8;

/* The tangent's length is this multiple of the chord, as in the builder
 * (tangentScale, 1.1 in src/trackbuilder/elements.js), free between these. */
const SCALE_BASE = 1.1;
const SCALE_MIN = 0.35;
const SCALE_MAX = 1.8;

/* Arc spacing of the search's own samples and of the answer's, metres. */
const SEARCH_DS = 0.25;
const OUT_DS = 0.05;

/* The crumbs are dropped at equal intervals of lap time, so the gap between
 * two is the speed the line asks for there. Seconds. */
const CRUMB_DT = 0.15;

/* Penalties, in seconds of lap time. A wall, not a price. A crossing of an
 * opening out of turn, or the wrong way, is a flat sixty, whether the opening
 * has a frame or is a gap in the lattice. Being closer to a solid than the
 * aircraft and its margin allow costs a steep ramp, so a millimetre of it is
 * already dear and a centimetre is not worth any lap, and the ramp is there
 * (and not a cliff) so the search can feel which way is out. */
const PEN_STRAY = 60;

/* A knot is on the plane of its own opening; for the test of which side of it
 * a point is on, it counts as this far ahead of the plane when the leg is
 * leaving the opening and this far behind it when the leg is arriving
 * (metres, and only a tie breaker). */
const ON_PLANE = 1e-7;
const shortPen = (d) => 3000 * d + 50000 * d * d;

/* The coordinate descent's step, as a fraction of each parameter's reach. */
const STEPS = [0.5, 0.25, 0.125, 0.0625, 0.03];

/* What a clean answer may leave over, metres short of the clearance it was
 * asked to keep: the clearance is the aircraft's sweep and a margin of a
 * prop and a half, so two centimetres short of it is still a prop and a
 * quarter from the pipe. */
const CLEAN_SHORT = 0.02;

/* How many openings the answer may be sent round, one detour knot each,
 * when the knots the author and the builder gave it make it cross one out of
 * turn. */
const MAX_DETOURS = 8;

/* The loop a lap makes when it flies one hole twice in a row (a course may
 * list the same opening twice, and a pass counts only once the aircraft has
 * flown a little way since the last): the circle's radius and how far each of
 * its three knots may be moved, metres. 0.4 g at 3 m/s turns in about 2.3 m. */
const LOOP_R = 2.0;
const LEASH_LOOP = 1.5;

/* The searches tried, in this order, until one comes out clean. They differ in
 * how readily a knot in trouble is tried right across its reach, and neither
 * is best on every course: the first leaves a hole it has already got out of
 * alone, the second finds the way out of a corner the first stays in. */
const STRATEGIES = ['first', 'always'];

/* Samples of a knot's reach tried at once, for a knot that is in trouble,
 * before the search settles to small steps. The search cannot walk a knot out
 * of a hole across the pipe round it one step at a time, because the pipe
 * is a wall; it can be put on the far side of it. */
const REACH_SAMPLES = 9;

/* ------------------------------------------------------------------ *
 * small vector helpers
 * ------------------------------------------------------------------ */

const norm = (a, fb = [0, 0, 1]) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : fb;
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const vec = (o) => [o.x, o.y, o.z];

/* Distance from point p to the segment a-b. */
function segDist(px, py, pz, a, b) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const l2 = abx * abx + aby * aby + abz * abz;
  let u = 0;
  if (l2 > 1e-12) {
    u = clamp(((px - a[0]) * abx + (py - a[1]) * aby + (pz - a[2]) * abz) / l2, 0, 1);
  }
  const dx = a[0] + abx * u - px;
  const dy = a[1] + aby * u - py;
  const dz = a[2] + abz * u - pz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/* Distance from point p to the outside of an axis aligned box, zero inside. */
function boxDist(px, py, pz, lo, hi) {
  const dx = Math.max(lo[0] - px, 0, px - hi[0]);
  const dy = Math.max(lo[1] - py, 0, py - hi[1]);
  const dz = Math.max(lo[2] - pz, 0, pz - hi[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/* ------------------------------------------------------------------ *
 * the room's solids
 * ------------------------------------------------------------------ */

/*
 * THE FRAMES, in the structure's own axes (x across the opening, y up from
 * its base, z through it) and then turned to the room by the first station
 * that flies the structure, as scene.js places every gate: the plain cosine
 * and sine of its heading. src/props/aperture.js frameParts is the one
 * function the game builds a frame's solids from for a hoop, a hex gate and a
 * leaning dive gate, and an upright square gate is the same four sides on
 * the same pipe (src/render/scene.js obstacle(): uprights at half the clear
 * width plus the tube, a member over every opening, none under one that
 * stands on the floor). So it is used for all of them, a level at a time.
 */
function frameCaps(structure, yaw, pitch, out) {
  const d = structure.dims;
  const stack = Math.max(1, Math.round(d.stack ?? 1));
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  for (let k = 0; k < stack; k += 1) {
    const sill = d.sillH + k * d.levelPitch;
    const parts = frameParts(
      structure.shape ?? 'square', d.clearW / 2, d.clearH / 2, TUBE_R, sill, pitch, false,
    );
    for (const c of parts.caps) {
      out.push({
        a: [structure.x + c.ax * cs + c.az * sn, structure.baseY + c.ay, structure.z - c.ax * sn + c.az * cs],
        b: [structure.x + c.bx * cs + c.bz * sn, structure.baseY + c.by, structure.z - c.bx * sn + c.bz * cs],
        r: c.r,
      });
    }
  }
}

/*
 * Everything in a RaceGOW room the aircraft can hit, as capsules and boxes:
 * the frames, the poles, the bars, the walls and the ceiling. The floor is
 * not here, the line keeps its own height off it. Anything this does not
 * know how to build refuses the course (`unmodelled`), because a line drawn
 * through a solid it did not know about is worse than no line.
 */
export function solidsOf(course) {
  const caps = [];
  const boxes = [];
  const unmodelled = [];
  const firstStation = new Map();
  for (const st of course.stations) {
    if (!firstStation.has(st.elementId)) {
      firstStation.set(st.elementId, st);
    }
  }
  for (const s of course.structures) {
    const type = s.type;
    if (type === 'startPads' || type === 'waypoint') {
      continue;
    }
    if (s.kind === 'aperture') {
      if (s.unbuilt) {
        continue;
      }
      const shape = s.shape ?? 'square';
      if (shape !== 'square' && shape !== 'circle' && shape !== 'hex') {
        unmodelled.push(`${type} (${shape})`);
        continue;
      }
      const st = firstStation.get(s.id);
      if (!st) {
        /* A gate the lap does not fly is not built, unless it is a face of
         * a group, which is listed apart. */
        continue;
      }
      frameCaps(s, st.yaw, st.pitch ?? 0, caps);
      continue;
    }
    if (type === 'pole') {
      const r = Math.max(0.004, s.dims.poleRadius ?? 0.02);
      const h = Math.max(0.1, s.dims.height ?? 1.5);
      caps.push({ a: [s.x, s.baseY, s.z], b: [s.x, s.baseY + h, s.z], r });
      boxes.push({
        lo: [s.x - r * 2, s.baseY, s.z - r * 2], hi: [s.x + r * 2, s.baseY + r * 1.6, s.z + r * 2],
      });
      continue;
    }
    if (type === 'horizontalPole') {
      /* hpoleLayout in src/props/course.js: a bar of the document's width on
       * its base height, along the element's own x, on two legs to the floor. */
      const w = Math.max(0.2, s.dims.width);
      const t = Math.max(0.02, Math.min(s.dims.depth, s.dims.height));
      const rb = t / 2;
      const half = Math.max(0, w / 2 - rb);
      const cx = Math.cos(s.yaw);
      const cz = -Math.sin(s.yaw);
      caps.push({
        a: [s.x - cx * half, s.baseY, s.z - cz * half],
        b: [s.x + cx * half, s.baseY, s.z + cz * half],
        r: rb,
      });
      if (s.baseY > rb + 0.05) {
        const legR = Math.max(0.012, Math.min(0.02, rb * 0.5));
        const lx = Math.max(0, w / 2 - Math.min(0.14, w * 0.1));
        for (const sg of [-1, 1]) {
          caps.push({
            a: [s.x + cx * lx * sg, 0, s.z + cz * lx * sg],
            b: [s.x + cx * lx * sg, s.baseY - rb, s.z + cz * lx * sg],
            r: legR,
          });
        }
      }
      continue;
    }
    unmodelled.push(type);
  }
  for (const l of course.loose ?? []) {
    if (!l.structure.unbuilt) {
      frameCaps({ ...l.structure, x: l.x, z: l.z, baseY: l.baseY, shape: l.shape }, l.yaw, l.pitch ?? 0, caps);
    }
  }
  /* The walls and the ceiling: the inner faces are the room, the boxes are
   * 0.1 of a true metre thick as scene.js builds them. */
  const W = ROOM_WIDTH * MICRO_SCALE;
  const D = ROOM_DEPTH * MICRO_SCALE;
  const H = ROOM_HEIGHT * MICRO_SCALE;
  const T = 0.10 * MICRO_SCALE;
  boxes.push({ lo: [-W / 2 - T, -1, -D / 2 - T], hi: [-W / 2, H, D / 2 + T] });
  boxes.push({ lo: [W / 2, -1, -D / 2 - T], hi: [W / 2 + T, H, D / 2 + T] });
  boxes.push({ lo: [-W / 2 - T, -1, -D / 2 - T], hi: [W / 2 + T, H, -D / 2] });
  boxes.push({ lo: [-W / 2 - T, -1, D / 2], hi: [W / 2 + T, H, D / 2 + T] });
  boxes.push({ lo: [-W / 2 - T, H, -D / 2 - T], hi: [W / 2 + T, H + T, D / 2 + T] });
  for (const c of caps) {
    c.lo = [Math.min(c.a[0], c.b[0]) - c.r, Math.min(c.a[1], c.b[1]) - c.r, Math.min(c.a[2], c.b[2]) - c.r];
    c.hi = [Math.max(c.a[0], c.b[0]) + c.r, Math.max(c.a[1], c.b[1]) + c.r, Math.max(c.a[2], c.b[2]) + c.r];
  }
  return { caps, boxes, unmodelled, room: { W, D, H } };
}

/*
 * The solids of a world that is already built: the colliders the shell has
 * handed the plant, as they were added, a capsule or a box each. This is the
 * ground truth where the line is drawn in the game, so nothing a room holds
 * can be missing from it, a table or a barrier or a banner included, and
 * solidsOf above is what a script in Node uses without a scene to read.
 * `colliders` is a built Colliders (src/game/collide.js): it keeps its
 * frozen arrays after build().
 */
export function solidsFromColliders(colliders) {
  const caps = [];
  const boxes = [];
  const n = colliders.count | 0;
  for (let i = 0; i < n; i += 1) {
    if (colliders.fbox[i]) {
      boxes.push({
        lo: [colliders.fax[i], colliders.fay[i], colliders.faz[i]],
        hi: [colliders.fbx[i], colliders.fby[i], colliders.fbz[i]],
      });
      continue;
    }
    const r = colliders.fr[i];
    const a = [colliders.fax[i], colliders.fay[i], colliders.faz[i]];
    const b = [colliders.fbx[i], colliders.fby[i], colliders.fbz[i]];
    caps.push({
      a,
      b,
      r,
      lo: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r],
      hi: [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r],
    });
  }
  return { caps, boxes, unmodelled: [], room: null };
}

/*
 * The openings whose shape a window cannot describe, by name. A square, a
 * hoop and a hex are windowed as the rectangle that holds them (a hoop's
 * hole is smaller than its box, so the test is the cautious one); a letter
 * or any other shape has holes of its own and would be tested wrongly, in
 * both directions. Such a course is refused, as one with a piece the solids
 * cannot model is.
 */
export function apertureGaps(course) {
  const first = new Set(course.stations.map((st) => st.elementId));
  const out = [];
  for (const s of course.structures) {
    if (s.kind !== 'aperture' || s.unbuilt || !first.has(s.id)) {
      continue;
    }
    const shape = s.shape ?? 'square';
    if (shape !== 'square' && shape !== 'circle' && shape !== 'hex') {
      out.push(`${s.type} (${shape})`);
    }
  }
  return out;
}

/* A string that is the same for the same course and different for another:
 * what a cache of answers is keyed by. The positions and the knots, rounded to
 * a millimetre, and the pace. */
export function courseKey(course, pace) {
  const r = (v) => Math.round(v * 1000);
  const parts = [`${course.trackClass}`, `${pace?.lateral ?? PACE.lateral}/${pace?.cap ?? PACE.cap}`];
  for (const st of course.stations) {
    parts.push(`${st.elementId}.${st.apertureIndex ?? 0}:${r(st.x)},${r(st.z)},${r(st.baseY ?? 0)},${r(st.yaw)},${r(st.pitch ?? 0)}`);
  }
  for (const k of course.knots ?? []) {
    parts.push(`${k.role}:${r(k.x)},${r(k.y)},${r(k.z)},${r(k.tx)},${r(k.ty)},${r(k.tz)}`);
  }
  for (const s of course.structures) {
    parts.push(`${s.id}:${s.type}:${r(s.x ?? 0)},${r(s.z ?? 0)},${r(s.baseY ?? 0)}`);
  }
  return parts.join('|');
}

/*
 * THE OPENINGS, as windows to test a line against: every level of every built
 * structure, not only the ones the lap flies, because a line through a hole
 * the lap was not sent through is wrong whether or not the lap uses it.
 * Keyed by the structure and the level, which is how a station names its own.
 */
function windowsOf(course) {
  const out = [];
  const firstStation = new Map();
  for (const st of course.stations) {
    if (!firstStation.has(st.elementId)) {
      firstStation.set(st.elementId, st);
    }
  }
  const put = (id, k, x, baseY, z, yaw, pitch, centreY, clearW, clearH) => {
    const centre = [x, baseY + centreY, z];
    const r = Math.hypot(clearW, clearH) / 2 + 0.2;
    out.push({
      key: `${id}#${k}`,
      centre,
      across: vec(gateAcross(yaw)),
      up: vec(gateUp(yaw, pitch)),
      travel: vec(travelAxis(yaw, pitch)),
      halfW: clearW / 2,
      halfH: clearH / 2,
      lo: [centre[0] - r, centre[1] - r, centre[2] - r],
      hi: [centre[0] + r, centre[1] + r, centre[2] + r],
      keys: new Set([`${id}#${k}`]),
    });
  };
  for (const s of course.structures) {
    /* An unbuilt opening, a gap in the lattice with no pipe of its own, is
     * still an opening the lap is sent through and the game scores and lights
     * as one, so it is a window like the others and a pass of it out of turn
     * is as much a stray as a pass of a frame (THE RULES, in the header). The
     * line's own check, which finds a line's openings again from the Race's
     * frames, found the lines of four rooms crossing gaps out of turn when
     * they were left out of the solver's windows. */
    if (s.kind !== 'aperture') {
      continue;
    }
    const st = firstStation.get(s.id);
    if (!st) {
      continue;
    }
    const d = s.dims;
    const stack = Math.max(1, Math.round(d.stack ?? 1));
    for (let k = 0; k < stack; k += 1) {
      const sill = d.sillH + k * d.levelPitch;
      put(s.id, k, s.x, s.baseY, s.z, st.yaw, st.pitch ?? 0, sill + d.clearH / 2, d.clearW, d.clearH);
    }
  }
  /* One hole is one window. A course may stand two or three gates on the same
   * spot (RaceGOW6 Track 1 flies one tower opening three times, two ways
   * round), and a line through that hole is through every one of them at
   * once: counting each would make every crossing a stray against two gates
   * it is not meant for. Windows whose centre, plane and size agree are
   * merged into one that answers to all their keys. */
  const merged = [];
  for (const w of out) {
    const twin = merged.find((m) => Math.hypot(
      m.centre[0] - w.centre[0], m.centre[1] - w.centre[1], m.centre[2] - w.centre[2],
    ) < 0.05
      && Math.abs(m.travel[0] * w.travel[0] + m.travel[1] * w.travel[1] + m.travel[2] * w.travel[2]) > 0.999
      && Math.abs(m.halfW - w.halfW) < 0.02 && Math.abs(m.halfH - w.halfH) < 0.02);
    if (twin) {
      for (const key of w.keys) {
        twin.keys.add(key);
      }
    } else {
      merged.push(w);
    }
  }
  return merged;
}

/*
 * The course's stations as Race is handed them, and as scene.js hands them:
 * the structure's place, the station's heading and tilt, the opening's size.
 * Exported so the check script scores a line with the very same gates.
 */
export function gatesOf(course) {
  return course.stations.map((st, i) => ({
    flyOrder: st.flyOrder ?? i,
    position: { x: st.x, y: st.baseY ?? 0, z: st.z },
    heading: st.yaw,
    pitch: st.pitch ?? 0,
    entry: st.entry ?? 1,
    apertures: [{
      shape: st.shape ?? 'square',
      index: st.apertureIndex ?? 0,
      sillH: 0,
      centreY: st.centreY,
      clearW: st.clearW,
      clearH: st.clearH,
    }],
    kindName: st.type,
    elementId: st.elementId,
    apertureIndex: st.apertureIndex ?? 0,
    virtual: Boolean(st.virtual),
  }));
}

/* ------------------------------------------------------------------ *
 * the knots: what may move and how far
 * ------------------------------------------------------------------ */

/*
 * One searchable knot. `base` is where the builder put it and `t0` the way it
 * pointed it. `e` is the three axes it may slide on, `lo` and `hi` its reach
 * on each, `leanAxes` the two axes its heading may swing on and `lean` how
 * far, as a tangent.
 */
function knotsOf(course, tuning) {
  const out = [];
  const windowFlight = new Map();
  for (const w of windowsOf(course)) {
    for (const key of w.keys) {
      windowFlight.set(key, w.travel);
    }
  }
  const need = CRAFT_SWEEP + tuning.margin;
  const ymin = need;
  const ymax = ROOM_HEIGHT * MICRO_SCALE - need - 0.15;
  for (const raw of course.knots) {
    /* The builder's own steering knots are left out. A wrap round a stack or
     * a gate the lap comes back through was put where the builder's fixed
     * rule put it, and on a row of gates side by side that is inside the next
     * gate's hole. The search puts its own detour knot beside the hole where
     * it is wanted (see detour), at a place it can move. */
    if (raw.role === 'wrap') {
      continue;
    }
    const st = raw.station >= 0 ? course.stations[raw.station] : null;
    const k = {
      role: raw.role,
      station: raw.station,
      key: null,
      sense: 1,
      base: [raw.x, raw.y, raw.z],
      t0: norm([raw.tx, raw.ty, raw.tz]),
      e: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      lo: [0, 0, 0],
      hi: [0, 0, 0],
      leanAxes: [[1, 0, 0], [0, 1, 0]],
      lean: 0,
    };
    if (st && !st.virtual) {
      /* A hole. Its centre is the knot, its frame is Race's own. */
      const across = vec(gateAcross(st.yaw));
      const up = vec(gateUp(st.yaw, st.pitch ?? 0));
      const travel = vec(travelAxis(st.yaw, st.pitch ?? 0));
      k.key = `${st.elementId}#${st.apertureIndex ?? 0}`;
      k.base = [st.x, st.baseY + st.centreY, st.z];
      k.t0 = travel;
      /* An opening the lap flies both ways has one window, in the first
       * flight's frame; this pass's own direction against it decides which
       * side of the plane is ahead of it. */
      const own = windowFlight.get(k.key);
      k.sense = own && own[0] * travel[0] + own[1] * travel[1] + own[2] * travel[2] < 0 ? -1 : 1;
      k.e = [across, up, travel];
      /* Only a square hole is slid across to its edge: a hoop or a hex is
       * smaller than its box, and the inscribed square is a quarter of the
       * work. */
      const f = st.shape && st.shape !== 'square' ? 0.7 : 1;
      const ru = Math.max(0, (st.clearW / 2) * f - need);
      const rv = Math.max(0, (st.clearH / 2) * f - need);
      k.lo = [-ru, -rv, 0];
      k.hi = [ru, rv, 0];
      k.lean = LEAN_GATE;
      k.leanAxes = [across, norm(cross(travel, across), up)];
    } else if (st && st.virtual) {
      /* A pole's square. The knot stands off the pole by the pass distance
       * along the pass side; it may come in to the aircraft's own clearance
       * and go out to the square's far edge less a margin, and up or down. */
      const away = norm([raw.x - raw.poleX, 0, raw.z - raw.poleZ], [1, 0, 0]);
      const d0 = Math.hypot(raw.x - raw.poleX, raw.z - raw.poleZ);
      const poleR = Math.max(0.004, st.structure.dims.poleRadius ?? 0.02);
      const dMin = CRAFT_SWEEP + poleR + tuning.margin;
      const dMax = Math.max(d0, st.clearW - need);
      const bot = st.baseY;
      const top = st.baseY + st.clearH;
      const side = norm(cross([0, 1, 0], k.t0), [1, 0, 0]);
      k.e = [away, [0, 1, 0], side];
      k.lo = [Math.min(dMin - d0, 0), Math.min(Math.max(bot + need, ymin) - raw.y, 0), 0];
      k.hi = [Math.max(dMax - d0, 0), Math.max(Math.min(top - need, ymax) - raw.y, 0), 0];
      k.lean = LEAN_MARKER;
      k.leanAxes = [side, [0, 1, 0]];
    } else {
      /* A waypoint, a wrap, or a pole with no square. Slide inside a leash. */
      const leash = raw.role === 'wrap' ? LEASH_WRAP : LEASH_WAYPOINT;
      const flat = norm([k.t0[0], 0, k.t0[2]], [1, 0, 0]);
      const side = norm(cross([0, 1, 0], flat), [1, 0, 0]);
      k.e = [side, [0, 1, 0], flat];
      k.lo = [-leash, Math.max(-leash, ymin - raw.y), -leash];
      k.hi = [leash, Math.min(leash, ymax - raw.y), leash];
      k.lean = LEAN_WAYPOINT;
      k.leanAxes = [side, norm(cross(k.t0, side), [0, 1, 0])];
    }
    out.push(k);
  }
  /* A lap that finishes on the gate it started on may list that gate twice,
   * first and last (RaceGOW6 Track 1 does: el-1 and el-12 are one hole). The
   * line is a loop, so the two are one knot, and the second is dropped; the
   * station it was keeps the crumb the first has. */
  const alias = new Map();
  const loops = [];
  if (out.length > 3) {
    const a = out[0];
    const b = out[out.length - 1];
    const same = a.key && b.key && a.sense === b.sense
      && Math.hypot(a.base[0] - b.base[0], a.base[1] - b.base[1], a.base[2] - b.base[2]) < 0.05
      && a.t0[0] * b.t0[0] + a.t0[1] * b.t0[1] + a.t0[2] * b.t0[2] > 0.999;
    if (same) {
      out.pop();
      if (b.station >= 0 && a.station >= 0) {
        alias.set(b.station, a.station);
      }
    }
  }
  /* The same hole twice in a row, the same way through: the line has to
   * leave it and come back round to it, and a loop is how. */
  for (let i = 0; i + 1 < out.length; i += 1) {
    const a = out[i];
    const b = out[i + 1];
    if (a.key && b.key && a.sense === b.sense
      && Math.hypot(a.base[0] - b.base[0], a.base[1] - b.base[1], a.base[2] - b.base[2]) < 0.3
      && a.t0[0] * b.t0[0] + a.t0[1] * b.t0[1] + a.t0[2] * b.t0[2] > 0.99) {
      loops.push({ a, b });
    }
  }
  return { knots: out, ymin, ymax, alias, loops };
}

/* Parameters per knot: slide on three axes, lean on two, tangent length. */
const NP = 6;

function initialParams(knots) {
  const p = new Float64Array(knots.length * NP);
  for (let i = 0; i < knots.length; i += 1) {
    p[i * NP + 5] = SCALE_BASE;
  }
  return p;
}

/* A parameter's own limits. */
function limitsOf(k, d) {
  if (d < 3) {
    return [k.lo[d], k.hi[d]];
  }
  if (d < 5) {
    return [-k.lean, k.lean];
  }
  return [SCALE_MIN, SCALE_MAX];
}

function knotState(k, p, o) {
  const x = clamp(p[o], k.lo[0], k.hi[0]);
  const y = clamp(p[o + 1], k.lo[1], k.hi[1]);
  const z = clamp(p[o + 2], k.lo[2], k.hi[2]);
  const pos = [
    k.base[0] + k.e[0][0] * x + k.e[1][0] * y + k.e[2][0] * z,
    k.base[1] + k.e[0][1] * x + k.e[1][1] * y + k.e[2][1] * z,
    k.base[2] + k.e[0][2] * x + k.e[1][2] * y + k.e[2][2] * z,
  ];
  const a = clamp(p[o + 3], -k.lean, k.lean);
  const b = clamp(p[o + 4], -k.lean, k.lean);
  const tan = norm([
    k.t0[0] + k.leanAxes[0][0] * a + k.leanAxes[1][0] * b,
    k.t0[1] + k.leanAxes[0][1] * a + k.leanAxes[1][1] * b,
    k.t0[2] + k.leanAxes[0][2] * a + k.leanAxes[1][2] * b,
  ], k.t0);
  return { pos, tan, scale: clamp(p[o + 5], SCALE_MIN, SCALE_MAX) };
}

/* ------------------------------------------------------------------ *
 * the spline
 * ------------------------------------------------------------------ */

/*
 * One leg, knot a to knot b: n + 1 points from t = 0 to t = 1, each with the
 * unit tangent and the curvature vector there (its length the curvature, its
 * direction toward the centre of the turn). The last point is the next leg's
 * first, kept so a crossing at the join is seen by the leg that ends on it.
 */
function sampleLeg(A, B, ds) {
  const chord = Math.hypot(B.pos[0] - A.pos[0], B.pos[1] - A.pos[1], B.pos[2] - A.pos[2]);
  const n = clamp(Math.ceil((1.6 * chord) / ds), 4, 800);
  const m0 = [A.tan[0] * A.scale * chord, A.tan[1] * A.scale * chord, A.tan[2] * A.scale * chord];
  const m1 = [B.tan[0] * B.scale * chord, B.tan[1] * B.scale * chord, B.tan[2] * B.scale * chord];
  const P = new Float64Array((n + 1) * 3);
  const T = new Float64Array((n + 1) * 3);
  const K = new Float64Array((n + 1) * 3);
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const d00 = 6 * t2 - 6 * t;
    const d10 = 3 * t2 - 4 * t + 1;
    const d01 = -6 * t2 + 6 * t;
    const d11 = 3 * t2 - 2 * t;
    const e00 = 12 * t - 6;
    const e10 = 6 * t - 4;
    const e01 = -12 * t + 6;
    const e11 = 6 * t - 2;
    const o = i * 3;
    /* Unrolled by hand: this runs for every sample of every candidate leg of a
     * search, and two small arrays per sample were most of its garbage. */
    P[o] = h00 * A.pos[0] + h10 * m0[0] + h01 * B.pos[0] + h11 * m1[0];
    P[o + 1] = h00 * A.pos[1] + h10 * m0[1] + h01 * B.pos[1] + h11 * m1[1];
    P[o + 2] = h00 * A.pos[2] + h10 * m0[2] + h01 * B.pos[2] + h11 * m1[2];
    const d1x = d00 * A.pos[0] + d10 * m0[0] + d01 * B.pos[0] + d11 * m1[0];
    const d1y = d00 * A.pos[1] + d10 * m0[1] + d01 * B.pos[1] + d11 * m1[1];
    const d1z = d00 * A.pos[2] + d10 * m0[2] + d01 * B.pos[2] + d11 * m1[2];
    const d2x = e00 * A.pos[0] + e10 * m0[0] + e01 * B.pos[0] + e11 * m1[0];
    const d2y = e00 * A.pos[1] + e10 * m0[1] + e01 * B.pos[1] + e11 * m1[1];
    const d2z = e00 * A.pos[2] + e10 * m0[2] + e01 * B.pos[2] + e11 * m1[2];
    const sp = Math.sqrt(d1x * d1x + d1y * d1y + d1z * d1z);
    if (sp < 1e-6) {
      T[o] = A.tan[0];
      T[o + 1] = A.tan[1];
      T[o + 2] = A.tan[2];
      continue;
    }
    const tx = d1x / sp;
    const ty = d1y / sp;
    const tz = d1z / sp;
    const kt = d2x * tx + d2y * ty + d2z * tz;
    const s2 = sp * sp;
    T[o] = tx;
    T[o + 1] = ty;
    T[o + 2] = tz;
    K[o] = (d2x - tx * kt) / s2;
    K[o + 1] = (d2y - ty * kt) / s2;
    K[o + 2] = (d2z - tz * kt) / s2;
  }
  return { n, P, T, K };
}

/* ------------------------------------------------------------------ *
 * the speed profile
 * ------------------------------------------------------------------ */

/*
 * The fastest the line can be flown, point by point, under the thrust budget,
 * and the lap time that makes.
 *
 * The budget is a ball: the thrust vector's length is at most
 * A = g sqrt(1 + lateral^2). At speed v along a line of curvature vector k the
 * thrust must supply w = v^2 k + g up, plus the along track acceleration a
 * times the tangent, so |w + a t| <= A. With a = 0 that is a quadratic in v^2,
 * solved in closed form for the speed the turn alone allows. The forward pass
 * then lets speed grow only as fast as the budget leaves along track thrust,
 * and the backward pass lets it fall only as fast as the budget allows
 * braking, twice round the loop so the join settles.
 *
 * Arrays are of length n, the lap's samples; sample i is followed by i + 1 and
 * the last by the first. `out.v` and `out.ds` are written, the lap time is
 * returned.
 */
function speedProfile(P, T, K, n, pace, out) {
  const lat2 = pace.lateral * pace.lateral;
  const A2 = G * G * (1 + lat2);
  const cap2 = pace.cap * pace.cap;
  const v = out.v;
  const ds = out.ds;
  for (let i = 0; i < n; i += 1) {
    const j = i + 1 < n ? i + 1 : 0;
    const dx = P[j * 3] - P[i * 3];
    const dy = P[j * 3 + 1] - P[i * 3 + 1];
    const dz = P[j * 3 + 2] - P[i * 3 + 2];
    ds[i] = Math.max(1e-4, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const kx = K[i * 3];
    const ky = K[i * 3 + 1];
    const kz = K[i * 3 + 2];
    const c = kx * kx + ky * ky + kz * kz;
    let v2 = cap2;
    if (c > 1e-9) {
      /* |v^2 k + g up|^2 = v^4 c + 2 v^2 g ky + g^2 <= A^2 */
      const b = G * ky;
      const lim = (-b + Math.sqrt(b * b + c * (A2 - G * G))) / c;
      if (lim < v2) {
        v2 = lim;
      }
    }
    v[i] = Math.sqrt(Math.max(v2, 0.04));
  }
  /* The along track thrust left at speed s on sample i: the most it can push
   * forward (sign +) or brake (sign -). */
  const room = (i, s, sign) => {
    const s2 = s * s;
    const wx = s2 * K[i * 3];
    const wy = s2 * K[i * 3 + 1] + G;
    const wz = s2 * K[i * 3 + 2];
    const wt = wx * T[i * 3] + wy * T[i * 3 + 1] + wz * T[i * 3 + 2];
    const rad = wt * wt - (wx * wx + wy * wy + wz * wz) + A2;
    if (rad <= 0) {
      return 0;
    }
    const r = Math.sqrt(rad);
    return sign > 0 ? Math.max(0, -wt + r) : Math.max(0, wt + r);
  };
  /* Both passes start at the slowest sample the turns allow. No neighbour can
   * pull it lower, because a reach is never below the speed it grows from, so
   * it is already its final speed, and once round from it each way settles the
   * whole lap, the join included. (Starting at the first sample and going
   * twice round found the same answer by doing every step twice.) */
  let m = 0;
  for (let i = 1; i < n; i += 1) {
    if (v[i] < v[m]) {
      m = i;
    }
  }
  let i = m;
  for (let k = 0; k < n; k += 1) {
    const p = i;
    i = i + 1 < n ? i + 1 : 0;
    const reach = Math.sqrt(v[p] * v[p] + 2 * room(p, v[p], 1) * ds[p]);
    if (reach < v[i]) {
      v[i] = reach;
    }
  }
  i = m;
  for (let k = 0; k < n; k += 1) {
    const nx = i;
    i = i > 0 ? i - 1 : n - 1;
    const reach = Math.sqrt(v[nx] * v[nx] + 2 * room(nx, v[nx], -1) * ds[i]);
    if (reach < v[i]) {
      v[i] = reach;
    }
  }
  let time = 0;
  for (let i = 0; i < n; i += 1) {
    const j = i + 1 < n ? i + 1 : 0;
    time += ds[i] / (0.5 * (v[i] + v[j]));
  }
  return time;
}

/* ------------------------------------------------------------------ *
 * the penalties: what the line must not do
 * ------------------------------------------------------------------ */

/* Does the segment between points i and j of P pass through window w, in
 * either direction? The window is the clear opening with no margin: a line
 * that brushes the pipe is the clearance penalty's business.
 *
 * `tieA` and `tieB`, when given, stand in for the side of the plane the
 * segment's first and last point are on, because a knot sits ON the plane of
 * its own opening and a point on a plane is neither in front of it nor
 * behind. A leg that leaves its opening must step ahead of it and one that
 * arrives at its opening must come from behind; a leg that does anything else
 * there, even inside its first step, has turned back through the hole it is
 * leaving or come to the one it is meant to leave from the wrong side, and
 * that is read as a crossing. */
function crosses(w, P, i, j, tieA = null, tieB = null) {
  const ax = P[i * 3] - w.centre[0];
  const ay = P[i * 3 + 1] - w.centre[1];
  const az = P[i * 3 + 2] - w.centre[2];
  const bx = P[j * 3] - w.centre[0];
  const by = P[j * 3 + 1] - w.centre[1];
  const bz = P[j * 3 + 2] - w.centre[2];
  const za = tieA === null ? ax * w.travel[0] + ay * w.travel[1] + az * w.travel[2] : tieA;
  const zb = tieB === null ? bx * w.travel[0] + by * w.travel[1] + bz * w.travel[2] : tieB;
  if ((za > 0) === (zb > 0)) {
    return false;
  }
  const u = za / (za - zb);
  const px = ax + (bx - ax) * u;
  const py = ay + (by - ay) * u;
  const pz = az + (bz - az) * u;
  const x = px * w.across[0] + py * w.across[1] + pz * w.across[2];
  const y = px * w.up[0] + py * w.up[1] + pz * w.up[2];
  return Math.abs(x) <= w.halfW && Math.abs(y) <= w.halfH;
}

/*
 * The cost of one leg's geometry apart from its speed: touching a solid,
 * leaving the room, and crossing an opening. An opening a leg may cross is
 * its own end: the first segment of the leg starts on the plane of the
 * opening it leaves, and the last ends on the plane of the one it enters.
 * Any other crossing of either, in either direction, is a pass through a gate
 * the lap was not sent through at that moment, or back through one it has
 * just flown, and costs the same.
 */
function legPenalty(leg, ctx, kA, kB, tally) {
  const { P, n } = leg;
  const need = CRAFT_SWEEP + ctx.tuning.margin;
  let pen = 0;
  let lo0 = Infinity;
  let lo1 = Infinity;
  let lo2 = Infinity;
  let hi0 = -Infinity;
  let hi1 = -Infinity;
  let hi2 = -Infinity;
  for (let i = 0; i <= n; i += 1) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    if (x < lo0) { lo0 = x; }
    if (x > hi0) { hi0 = x; }
    if (y < lo1) { lo1 = y; }
    if (y > hi1) { hi1 = y; }
    if (z < lo2) { lo2 = z; }
    if (z > hi2) { hi2 = z; }
    if (y < ctx.ymin) {
      pen += shortPen(ctx.ymin - y);
      if (tally) { tally.clear = Math.max(tally.clear, ctx.ymin - y); }
    }
  }
  for (const c of ctx.solids.caps) {
    if (c.hi[0] + need < lo0 || c.lo[0] - need > hi0
      || c.hi[1] + need < lo1 || c.lo[1] - need > hi1
      || c.hi[2] + need < lo2 || c.lo[2] - need > hi2) {
      continue;
    }
    for (let i = 0; i <= n; i += 1) {
      const d = segDist(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], c.a, c.b) - c.r;
      if (d < need) {
        pen += shortPen(need - d);
        if (tally) { tally.clear = Math.max(tally.clear, need - d); }
      }
    }
  }
  for (const b of ctx.solids.boxes) {
    if (b.hi[0] + need < lo0 || b.lo[0] - need > hi0
      || b.hi[1] + need < lo1 || b.lo[1] - need > hi1
      || b.hi[2] + need < lo2 || b.lo[2] - need > hi2) {
      continue;
    }
    for (let i = 0; i <= n; i += 1) {
      const d = boxDist(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], b.lo, b.hi);
      if (d < need) {
        pen += shortPen(need - d);
        if (tally) { tally.clear = Math.max(tally.clear, need - d); }
      }
    }
  }
  for (const w of ctx.windows) {
    if (w.hi[0] < lo0 || w.lo[0] > hi0 || w.hi[1] < lo1 || w.lo[1] > hi1
      || w.hi[2] < lo2 || w.lo[2] > hi2) {
      continue;
    }
    const leaves = w.keys.has(kA.key);
    const arrives = w.keys.has(kB.key);
    for (let i = 0; i < n; i += 1) {
      let own = false;
      let tieA = null;
      let tieB = null;
      if (leaves && i === 0) {
        own = true;
        tieA = ON_PLANE * kA.sense;
      } else if (arrives && i === n - 1) {
        own = true;
        tieB = -ON_PLANE * kB.sense;
      }
      if (crosses(w, P, i, i + 1, tieA, tieB)) {
        pen += PEN_STRAY;
        if (tally) {
          const za = (P[i * 3] - w.centre[0]) * w.travel[0] + (P[i * 3 + 1] - w.centre[1]) * w.travel[1]
            + (P[i * 3 + 2] - w.centre[2]) * w.travel[2];
          tally.strays += 1;
          tally.where.push(`${w.key}@${tally.leg}`);
          /* A step back off the opening a leg leaves, or a way in from the
           * wrong side of the one it arrives at, is backward by definition. */
          tally.list.push({
            w, leg: tally.leg, own, dir: own || za >= 0 ? -1 : 1,
          });
        }
      }
    }
  }
  return pen;
}

/* ------------------------------------------------------------------ *
 * the search
 * ------------------------------------------------------------------ */

function prepare(course, options) {
  const tuning = {
    margin: options.margin ?? MARGIN,
    pace: { ...PACE, ...(options.pace || {}) },
  };
  if (!course || !Array.isArray(course.knots) || !course.stations || !course.stations.length) {
    return { error: 'no course' };
  }
  if (course.trackClass !== 'micro') {
    return { error: 'not a RaceGOW room' };
  }
  const solids = options.solids ?? solidsOf(course);
  if (solids.unmodelled && solids.unmodelled.length) {
    return { error: `a piece the line cannot avoid: ${solids.unmodelled.join(', ')}` };
  }
  const gaps = apertureGaps(course);
  if (gaps.length) {
    return { error: `an opening the line cannot tell from the room: ${gaps.join(', ')}` };
  }
  const { knots, ymin, ymax, alias, loops } = knotsOf(course, tuning);
  if (knots.length < 3) {
    return { error: 'too few knots' };
  }
  const need = CRAFT_SWEEP + tuning.margin;
  return {
    tuning,
    solids,
    windows: windowsOf(course),
    knots,
    alias,
    loops,
    ymin,
    ymax,
    halfX: (ROOM_WIDTH * MICRO_SCALE) / 2 - need,
    halfZ: (ROOM_DEPTH * MICRO_SCALE) / 2 - need,
  };
}

/*
 * A DETOUR round an opening the line crosses out of turn.
 *
 * `stray` says which opening, which leg crosses it and which way. The fix is a
 * new knot on the plane of that opening, beside its frame, pointing the way the
 * leg was going: the leg then goes past the hole and not through it. Four
 * places are tried, left, right, over and under, a prop and a half and a
 * margin outside the pipe, and the one that costs least once the new knot has
 * been moved about a little is kept. The knot is free to move afterwards like
 * any other, which is what the builder's own steering knots were not and why
 * they were left out.
 */
function detourKnots(stray, ctx) {
  const { w } = stray;
  const reach = CRAFT_SWEEP + ctx.tuning.margin + 0.4;
  const out = [];
  for (const [axis, half] of [[w.across, w.halfW], [w.across, -w.halfW], [w.up, w.halfH], [w.up, -w.halfH]]) {
    const off = Math.sign(half) * (Math.abs(half) + reach);
    const pos = [
      w.centre[0] + axis[0] * off,
      w.centre[1] + axis[1] * off,
      w.centre[2] + axis[2] * off,
    ];
    pos[1] = clamp(pos[1], ctx.ymin + 0.05, ctx.ymax - 0.05);
    pos[0] = clamp(pos[0], -ctx.halfX, ctx.halfX);
    pos[2] = clamp(pos[2], -ctx.halfZ, ctx.halfZ);
    const t0 = norm([w.travel[0] * stray.dir, w.travel[1] * stray.dir, w.travel[2] * stray.dir]);
    const flat = norm([t0[0], 0, t0[2]], [1, 0, 0]);
    const side = norm(cross([0, 1, 0], flat), [1, 0, 0]);
    out.push({
      role: 'steer',
      station: -1,
      key: null,
      sense: 1,
      base: pos,
      t0,
      e: [side, [0, 1, 0], flat],
      lo: [-LEASH_WRAP, Math.max(-LEASH_WRAP, ctx.ymin - pos[1]), -LEASH_WRAP],
      hi: [LEASH_WRAP, Math.min(LEASH_WRAP, ctx.ymax - pos[1]), LEASH_WRAP],
      leanAxes: [side, norm(cross(t0, side), [0, 1, 0])],
      lean: LEAN_WAYPOINT,
    });
  }
  return out;
}

/*
 * A LOOP out of a hole and back to it: three knots on a circle that leaves the
 * opening square on and comes round to it again, the same way through. Seen
 * from above, and starting at the opening heading `fwd` with the circle's
 * centre `sign` to one side:
 *
 *     the far point      a quarter turn on, heading across
 *     the near side      a half turn on, heading back past the opening, beside it
 *     the back point     three quarters on, heading back across
 *
 * The half turn crosses the opening's plane backward, so it has to be beside
 * the frame and not in a hole; the search moves the three knots until it is,
 * and which side is better is the caller's to try.
 */
function loopKnots(a, sign, ctx) {
  const fwd = norm([a.t0[0], 0, a.t0[2]], [1, 0, 0]);
  const side = norm(cross([0, 1, 0], fwd), [1, 0, 0]);
  const sd = [side[0] * sign, 0, side[2] * sign];
  const mk = (px, pz, t) => {
    const pos = [px, clamp(a.base[1], ctx.ymin + 0.05, ctx.ymax - 0.05), pz];
    pos[0] = clamp(pos[0], -ctx.halfX, ctx.halfX);
    pos[2] = clamp(pos[2], -ctx.halfZ, ctx.halfZ);
    const t0 = norm(t);
    const sideT = norm(cross([0, 1, 0], t0), [1, 0, 0]);
    return {
      role: 'steer',
      station: -1,
      key: null,
      sense: 1,
      base: pos,
      t0,
      e: [sideT, [0, 1, 0], norm([t0[0], 0, t0[2]], [1, 0, 0])],
      lo: [-LEASH_LOOP, Math.max(-LEASH_LOOP, ctx.ymin - pos[1]), -LEASH_LOOP],
      hi: [LEASH_LOOP, Math.min(LEASH_LOOP, ctx.ymax - pos[1]), LEASH_LOOP],
      leanAxes: [sideT, norm(cross(t0, sideT), [0, 1, 0])],
      lean: LEAN_WAYPOINT,
    };
  };
  const [hx, , hz] = a.base;
  return [
    mk(hx + fwd[0] * LOOP_R + sd[0] * LOOP_R, hz + fwd[2] * LOOP_R + sd[2] * LOOP_R, sd),
    mk(hx + sd[0] * 2 * LOOP_R, hz + sd[2] * 2 * LOOP_R, [-fwd[0], 0, -fwd[2]]),
    mk(hx - fwd[0] * LOOP_R + sd[0] * LOOP_R, hz - fwd[2] * LOOP_R + sd[2] * LOOP_R, [-sd[0], 0, -sd[2]]),
  ];
}

/*
 * How good an answer is, to pick between searches: fewer crossings out of
 * turn, then clearance kept, then the faster lap with its penalties.
 */
function rankOf(r) {
  return [r.strays, r.shortBy > CLEAN_SHORT ? 1 : 0, r.lapS + r.penalty];
}

function better(a, b) {
  const ra = rankOf(a);
  const rb = rankOf(b);
  for (let i = 0; i < ra.length; i += 1) {
    if (ra[i] !== rb[i]) {
      return ra[i] < rb[i];
    }
  }
  return false;
}

/**
 * The search, as a generator so a browser can run it a few milliseconds at a
 * time and Node can run it to the end. Yields { sweep, step, cost } after
 * each sweep; returns the result.
 *
 * It tries each of STRATEGIES in turn, on a fresh set of knots, and keeps the
 * first answer that is clean or, if none is, the best of them.
 */
export function* solveRaceLine(course, options = {}) {
  let ctx = prepare(course, options);
  if (ctx.error) {
    return { ok: false, reason: ctx.error };
  }
  const { solids } = ctx;
  let best = null;
  for (const strategy of STRATEGIES) {
    if (options.reach && options.reach !== strategy) {
      continue;
    }
    if (!ctx) {
      ctx = prepare(course, { ...options, solids });
    }
    const got = yield* search(course, ctx, strategy, options);
    ctx = null;
    if (!best || better(got, best)) {
      best = got;
    }
    if (best.clean) {
      break;
    }
  }
  return best ?? { ok: false, reason: 'no search was asked for' };
}

function* search(course, ctx, strategy, options) {
  const { knots, tuning } = ctx;
  let nk = knots.length;
  let p = initialParams(knots);
  let states = [];
  let legs = [];
  let pens = new Float64Array(nk);

  const rebuild = (j) => {
    const b = (j + 1) % nk;
    legs[j] = sampleLeg(states[j], states[b], SEARCH_DS);
    pens[j] = legPenalty(legs[j], ctx, knots[j], knots[b], null);
  };
  /* Everything from the parameters, after the knots have changed in number. */
  const rebuildAll = () => {
    nk = knots.length;
    states = knots.map((k, i) => knotState(k, p, i * NP));
    legs = new Array(nk);
    pens = new Float64Array(nk);
    for (let j = 0; j < nk; j += 1) {
      rebuild(j);
    }
  };
  let cap = 0;
  let P = null;
  let T = null;
  let K = null;
  let prof = null;
  const total = () => {
    let n = 0;
    for (const l of legs) {
      n += l.n;
    }
    if (n > cap) {
      cap = n + 64;
      P = new Float64Array(cap * 3);
      T = new Float64Array(cap * 3);
      K = new Float64Array(cap * 3);
      prof = { v: new Float64Array(cap), ds: new Float64Array(cap) };
    }
    let o = 0;
    let pen = 0;
    for (let j = 0; j < nk; j += 1) {
      const l = legs[j];
      /* A leg's points are n + 1, the last the next leg's first: the lap
       * takes the first n. */
      P.set(l.P.subarray(0, l.n * 3), o * 3);
      T.set(l.T.subarray(0, l.n * 3), o * 3);
      K.set(l.K.subarray(0, l.n * 3), o * 3);
      o += l.n;
      pen += pens[j];
    }
    return { time: speedProfile(P, T, K, n, tuning.pace, prof), pen };
  };
  const cost = () => {
    const t = total();
    return t.time + t.pen;
  };

  /* Put knots in at `at`, free of every parameter, or take them out again. */
  const insertAt = (at, list) => {
    knots.splice(at, 0, ...list);
    const grown = new Float64Array(knots.length * NP);
    grown.set(p.subarray(0, at * NP), 0);
    grown.set(p.subarray(at * NP), (at + list.length) * NP);
    for (let q = 0; q < list.length; q += 1) {
      grown[(at + q) * NP + 5] = SCALE_BASE;
    }
    p = grown;
    rebuildAll();
  };
  const removeAt = (at, count) => {
    knots.splice(at, count);
    const shrunk = new Float64Array(knots.length * NP);
    shrunk.set(p.subarray(0, at * NP), 0);
    shrunk.set(p.subarray((at + count) * NP), at * NP);
    p = shrunk;
    rebuildAll();
  };

  rebuildAll();
  const base = total();
  let best = base.time + base.pen;
  const baseline = { time: base.time, pen: base.pen };
  let sweeps = 0;

  /* Try one value of one parameter of one knot. Returns its cost, leaving it
   * in place. */
  const tryValue = (i, idx, val) => {
    p[idx] = val;
    states[i] = knotState(knots[i], p, i * NP);
    rebuild((i - 1 + nk) % nk);
    rebuild(i);
    return cost();
  };

  /* Move `count` knots from `from` about a little, at the given steps, and
   * return the cost: how a newly put knot is judged before it is kept. */
  function* polish(from, count, steps) {
    let c = cost();
    for (const step of steps) {
      for (let i = from; i < from + count; i += 1) {
        yield null;
        for (let d = 0; d < NP; d += 1) {
          const idx = i * NP + d;
          const [lo, hi] = limitsOf(knots[i], d);
          const span = hi - lo;
          if (span <= 1e-9) {
            continue;
          }
          const was = p[idx];
          let pick = was;
          for (const val of [clamp(was - step * span, lo, hi), clamp(was + step * span, lo, hi)]) {
            if (val === was) {
              continue;
            }
            const t = tryValue(i, idx, val);
            if (t < c - 1e-7) {
              c = t;
              pick = val;
            }
          }
          if (p[idx] !== pick) {
            tryValue(i, idx, pick);
          }
        }
      }
    }
    return c;
  }

  /* One sweep of every parameter of every knot at one step. `reach` tries a
   * knot that is in trouble at several places across its whole reach. */
  function* sweep(step, reach) {
    let improved = false;
    for (let i = 0; i < nk; i += 1) {
      /* A knot is a few milliseconds, which is the grain a browser can be
       * handed the search in without a frame being dropped. */
      yield null;
      const trouble = reach && pens[(i - 1 + nk) % nk] + pens[i] > 1;
      for (let d = 0; d < NP; d += 1) {
        const idx = i * NP + d;
        const [lo, hi] = limitsOf(knots[i], d);
        const span = hi - lo;
        if (span <= 1e-9) {
          continue;
        }
        const was = p[idx];
        let pick = was;
        let values;
        if (trouble && d < 3) {
          values = [];
          for (let q = 0; q < REACH_SAMPLES; q += 1) {
            values.push(lo + (span * q) / (REACH_SAMPLES - 1));
          }
        } else {
          values = [clamp(was - step * span, lo, hi), clamp(was + step * span, lo, hi)];
        }
        for (const val of values) {
          if (val === was) {
            continue;
          }
          const c = tryValue(i, idx, val);
          if (c < best - 1e-7) {
            best = c;
            pick = val;
          }
        }
        if (p[idx] !== pick) {
          tryValue(i, idx, pick);
        }
        if (pick !== was) {
          improved = true;
        }
      }
    }
    return improved;
  }

  function* descend(steps) {
    for (let si = 0; si < steps.length; si += 1) {
      for (let rep = 0; rep < 3; rep += 1) {
        const reach = strategy === 'always' || (si === 0 && rep === 0);
        const improved = yield* sweep(steps[si], reach);
        sweeps += 1;
        yield { sweep: sweeps, step: steps[si], cost: best };
        if (!improved) {
          break;
        }
      }
    }
  }

  /* The crossings of an opening out of turn the lap now has, with where. */
  const strays = () => {
    const out = [];
    for (let j = 0; j < nk; j += 1) {
      const tally = {
        clear: 0, strays: 0, where: [], list: [], leg: j,
      };
      legPenalty(legs[j], ctx, knots[j], knots[(j + 1) % nk], tally);
      out.push(...tally.list);
    }
    return out;
  };

  /* A hole flown twice in a row is left and come back to: put the loop on the
   * side that costs less. */
  for (const pair of ctx.loops) {
    const at = knots.indexOf(pair.a) + 1;
    if (at <= 0 || knots[at] !== pair.b) {
      continue;
    }
    let side = 1;
    let sideCost = Infinity;
    for (const sign of [1, -1]) {
      insertAt(at, loopKnots(pair.a, sign, ctx));
      const c = yield* polish(at, 3, [0.5, 0.25, 0.1]);
      if (c < sideCost) {
        sideCost = c;
        side = sign;
      }
      removeAt(at, 3);
    }
    insertAt(at, loopKnots(pair.a, side, ctx));
    if (options.log) {
      options.log(`loop after ${pair.a.key}: side ${side}`);
    }
  }
  best = cost();

  yield* descend(STEPS);

  /* Where the knots the author gave make the lap cross a hole out of turn and
   * moving them cannot stop it, send the line round the hole. A step back
   * through the opening a leg itself leaves or arrives at is a turn the search
   * has to straighten, not a hole to go round.
   *
   * A detour is kept for what the lap costs once the search has settled round
   * it, not for what it costs the moment it is put in. On RaceGOW5 Track 7,
   * where seven of the ten openings are gaps, the first detour leaves both
   * strays standing and it is the next two that clear them, so a detour judged
   * on its own cost left the lap with both. One that does not pay once settled
   * is taken out again, with everything the settling moved, and the search
   * stops. */
  for (let attempt = 0; attempt < MAX_DETOURS; attempt += 1) {
    const list = strays().filter((st) => !st.own);
    if (!list.length) {
      break;
    }
    const stray = list[0];
    const before = best;
    if (options.log) {
      options.log(`detour ${attempt}: ${list.length} stray(s), first ${[...stray.w.keys].join('+')} on leg ${stray.leg} dir ${stray.dir}, cost ${before.toFixed(2)}`);
    }
    const at = stray.leg + 1;
    let bestCand = null;
    let bestCost = Infinity;
    for (const cand of detourKnots(stray, ctx)) {
      insertAt(at, [cand]);
      const c = yield* polish(at, 1, [0.5, 0.25, 0.1]);
      if (options.log) {
        options.log(`  candidate at (${cand.base.map((v) => v.toFixed(2)).join(', ')}) costs ${c.toFixed(2)}`);
      }
      if (c < bestCost) {
        bestCost = c;
        bestCand = cand;
      }
      removeAt(at, 1);
    }
    if (!bestCand) {
      break;
    }
    const keptKnots = knots.slice();
    const keptParams = Float64Array.from(p);
    insertAt(at, [bestCand]);
    best = cost();
    yield* descend(STEPS.slice(1));
    if (options.log) {
      options.log(`  settled at ${best.toFixed(2)} against ${before.toFixed(2)}`);
    }
    if (!(best < before - 1e-7)) {
      knots.length = 0;
      knots.push(...keptKnots);
      p = keptParams;
      rebuildAll();
      best = cost();
      break;
    }
  }
  return finish(course, ctx, knots, states, baseline, sweeps);
}

/** Run the search to the end. For Node and for tests. */
export function raceLineFor(course, options) {
  const it = solveRaceLine(course, options);
  let r = it.next();
  while (!r.done) {
    r = it.next();
  }
  return r.value;
}

/* ------------------------------------------------------------------ *
 * the answer
 * ------------------------------------------------------------------ */

/*
 * Resample the winning line finely, put a speed on every point, and cut it
 * into crumbs at equal TIME, so the gap between two crumbs is the speed the
 * line asks for there: close together is slow.
 */
function finish(course, ctx, knots, states, baseline, sweeps) {
  const { tuning } = ctx;
  const nk = states.length;
  const legs = [];
  const tally = {
    clear: 0, strays: 0, where: [], list: [], leg: 0,
  };
  let penalty = 0;
  for (let j = 0; j < nk; j += 1) {
    const leg = sampleLeg(states[j], states[(j + 1) % nk], OUT_DS);
    legs.push(leg);
    tally.leg = j;
    penalty += legPenalty(leg, ctx, knots[j], knots[(j + 1) % nk], tally);
  }
  let n = 0;
  const starts = [];
  for (const l of legs) {
    starts.push(n);
    n += l.n;
  }
  const P = new Float64Array(n * 3);
  const T = new Float64Array(n * 3);
  const K = new Float64Array(n * 3);
  let o = 0;
  for (const l of legs) {
    P.set(l.P.subarray(0, l.n * 3), o * 3);
    T.set(l.T.subarray(0, l.n * 3), o * 3);
    K.set(l.K.subarray(0, l.n * 3), o * 3);
    o += l.n;
  }
  const prof = { v: new Float64Array(n), ds: new Float64Array(n) };
  const lapS = speedProfile(P, T, K, n, tuning.pace, prof);

  /* The time at every sample, from the lap's start at knot 0. */
  const time = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) {
    const j = i + 1 < n ? i + 1 : 0;
    time[i + 1] = time[i] + prof.ds[i] / (0.5 * (prof.v[i] + prof.v[j]));
  }
  const count = Math.max(8, Math.round(time[n] / CRUMB_DT));
  const dt = time[n] / count;
  const crumbs = new Float32Array(count * 3);
  const crumbV = new Float32Array(count);
  let s = 0;
  for (let c = 0; c < count; c += 1) {
    const t = c * dt;
    while (s + 1 < n && time[s + 1] <= t) {
      s += 1;
    }
    const span = time[s + 1] - time[s];
    const u = span > 1e-9 ? (t - time[s]) / span : 0;
    const j = s + 1 < n ? s + 1 : 0;
    for (let a = 0; a < 3; a += 1) {
      crumbs[c * 3 + a] = P[s * 3 + a] + (P[j * 3 + a] - P[s * 3 + a]) * u;
    }
    crumbV[c] = prof.v[s] + (prof.v[j] - prof.v[s]) * u;
  }
  /* The crumb nearest each station's crossing, in flying order. */
  const stationCrumb = new Int32Array(course.stations.length).fill(-1);
  knots.forEach((k, i) => {
    if (k.station >= 0) {
      stationCrumb[k.station] = Math.round(time[starts[i]] / dt) % count;
    }
  });
  for (const [from, to] of ctx.alias) {
    stationCrumb[from] = stationCrumb[to];
  }
  return {
    ok: true,
    clean: tally.strays === 0 && tally.clear < CLEAN_SHORT,
    penalty,
    strays: tally.strays,
    strayAt: tally.where,
    shortBy: tally.clear,
    sweeps,
    lapS,
    baselineS: baseline.time,
    baselinePenalty: baseline.pen,
    count,
    crumbs,
    crumbV,
    stationCrumb,
    dense: {
      points: P, tangents: T, curvature: K, speeds: prof.v, ds: prof.ds, count: n, time,
    },
    knotAt: starts,
    tuning,
  };
}

/* ------------------------------------------------------------------ *
 * the check the answer has to pass before anyone is shown it
 * ------------------------------------------------------------------ */

/*
 * Fly the line, as a point, round the course three times through the same
 * Race the shell scores with, and read what it says: every lap credited, the
 * gates in order, none voided. Cheap (a few thousand segment tests) and
 * exact about the one thing a pilot is told: that this line is a lap.
 */
export function verifyRaceLine(course, result) {
  if (!result || !result.ok) {
    return { ok: false, reason: result ? result.reason : 'no line' };
  }
  const race = new Race(gatesOf(course), course.trackClass);
  race.setRecordKey('raceline.verify');
  race.reset();
  const { points, speeds, ds, count } = result.dense;
  /* Start two metres before the timing gate so the first lap is a whole one. */
  const lead = Math.max(0, count - Math.round(2 / OUT_DS));
  let ms = 0;
  let prev = null;
  const LAPS = 3;
  /* Flown until three laps are credited, and for one round more than the
   * three at most. Where the timing gate's crossing falls in the line's own
   * array is not the line's business: it can be the last segment of a round
   * or the first of the next, and a verdict that depended on which refused a
   * good line in the browser on 2026-10-08 (two laps credited of the three
   * wanted, the third waiting one point past the end). */
  for (let lap = 0; lap <= LAPS + 1 && race.lap < LAPS; lap += 1) {
    for (let k = 0; k < count; k += 1) {
      const i = lap === 0 ? lead + k : k;
      if (i >= count) {
        break;
      }
      const cur = { x: points[i * 3], y: points[i * 3 + 1], z: points[i * 3 + 2] };
      const j = i + 1 < count ? i + 1 : 0;
      ms += (ds[i] / (0.5 * (speeds[i] + speeds[j]))) * 1000;
      if (prev) {
        race.update(prev, cur, ms, ms, true);
      }
      prev = cur;
    }
  }
  return { ok: race.lap >= LAPS, laps: race.lap, wanted: LAPS };
}
