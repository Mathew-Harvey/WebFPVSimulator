/*
 * roads-check.js: the road tool's geometry and the starter's traffic, held
 * to what the physics module accepts and how it drives.
 *
 * WHY. A road is a list of an author's nodes, and what reaches the physics
 * is the line src/maps/built/road.js eases out of them. The module
 * (src/native/world.c section 5) refuses a road with a point that turns
 * more than 30 degrees, and drives a car's velocity round every point it
 * keeps, so a corner handed over as one point is a lurch and a curvature
 * that steps from nothing to a bend's full is a drift car's heading
 * kicking. None of that shows in a screenshot. This file looks for it in
 * plain Node, against dist/sim.wasm, in four blocks:
 *
 *   1. shapes    the starter's road and a hostile set of control polygons
 *                (hairpins, near and exact folds, short legs, duplicate and
 *                collinear nodes, two node roads, closed triangles, a
 *                zigzag, a star, seeded random polygons, a loop round the
 *                edge of a 1 km field): road.js never throws and never makes
 *                a NaN, and gives either a line or an error problem. Every
 *                line, and every lane line of a two lane loop, is spaced as
 *                road.js promises, turns well under 30 degrees at every
 *                point, has zero curvature at both ends of every bend and
 *                no step in curvature inside one, and is ACCEPTED by
 *                sim_world_road, which returns an index. And road.js and
 *                traffic.js call no JS trigonometry, pow, exp or hypot
 *   2. mirror    road.js moduleCheck says what the module says, on roads
 *                the module refuses (an uneased corner, a 1 cm segment, a
 *                point past 1e6 m) and on every line of block 1, and the
 *                checks of block 1 fail an uneased polygon, so they can
 *   3. starter   trafficOf(starterMap()) uploads through uploadTraffic with
 *                no problem, and 20 s of the module's clock, set step by
 *                step with sim_world_clock and read with readVehicles, give
 *                finite poses, every car on its own line to a micrometre,
 *                ordinary cars that never slip, and a drift car that slides
 *                in every bend and not on a straight; and, as a target, how
 *                far its yaw rate steps in a millisecond (YAW_STEP_TARGET)
 *   4. yard      over a whole lap of each car, every car's box stays at
 *                least CAR_CLEAR from every solid of the starter's that it
 *                could reach, the drift car's slide included; the road's
 *                6 m keep ROAD_CLEAR from every solid under a car's roof
 *                height and PADS_CLEAR from the start pads; the two working
 *                vehicles' laps agree to LAP_MATCH
 *
 * A threshold here is never widened to make a line pass (CLAUDE.md); the
 * argument goes in PROGRESS.md.
 *
 * Usage: node scripts/roads-check.js [--verbose] [--targets]
 * Exit code is the number of failed checks, plus failed targets with
 * --targets.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, simErrorName } from '../tests/lib/simmod.js';
import { threePosToSim } from '../src/render/frame.js';
import { makeVehiclePoses, readVehicles, setVehicleClock, uploadRoad, addVehicle } from '../src/game/plantworld.js';
import { placeSolids } from '../src/props/solids.js';
import { seededRandom } from '../src/props/parts.js';
import { normalize } from '../src/trackbuilder/model.js';
import { starterMap } from '../src/maps/built/starter.js';
import { placeDocument, docToWorld } from '../src/maps/built/place.js';
import {
  roadOf, roadNodesOf, centreLine, laneLine, nearestOn, moduleCheck,
  BEND_STEP_MAX, STRAIGHT_STEP, DRIVE_RADIUS_MIN, MODULE,
} from '../src/maps/built/road.js';
import { trafficOf, uploadTraffic, DRIFT } from '../src/maps/built/traffic.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const verbose = process.argv.includes('--verbose');

/* The bars, each argued where it is used. */
/* Turn at any one point, degrees: road.js samples a bend at about 2.3
 * degrees a point, and the module refuses past 30. */
const TURN_MAX_DEG = 10;
const TURN_MAX_COS = Math.cos((TURN_MAX_DEG * Math.PI) / 180);
/* Curvature at a bend's two ends, as a share of its peak: zero, to the
 * rounding of three points a few hundred metres out. */
const END_KAPPA = 1e-6;
/* The most the curvature may change from one point to the next inside a
 * bend, as a share of the bend's peak: the smallest bend ramps in half and
 * then all of it (road.js MIN_STEPS); anything more is a step. */
const KAPPA_STEP = 0.5;
/* Every car on its own line: the pose's road point off the line, m. */
const ON_LINE = 1e-6;
/*
 * A TARGET, not a guard: the drift car's yaw rate from one millisecond to
 * the next, rad/s. Printed every run, counted only with --targets, the
 * split scripts/world-check.js makes. The P2 verification measured kicks
 * of up to 4.2 rad/s where a road's curvature stepped from nothing at a
 * bend, on a road sampled at half a metre on its bends and a metre on its
 * straights. Measured on the starter (2026-09-26): 1.3 rad/s with this
 * road's straights a metre apart up to each bend; 0.62 with them at the
 * bend's own step; 1.15 with the same bends' easing taken out, circular
 * arcs whose curvature steps, because the module measures curvature across
 * 1.5 m either way and so smooths a step itself. What is left at 0.62 is
 * not the road: it is where the module's speed profile switches from
 * pulling away to braking inside the chicane, a step in the car's
 * acceleration that the drift's slip, which follows speed squared times
 * curvature, turns into a step in its yaw rate. That is the physics' own,
 * and PROGRESS.md puts it to the owner. So the guard on the road is the
 * curvature step of block 1; this is the number the pilot would feel.
 */
const YAW_STEP_TARGET = 1.0;
const enforceTargets = process.argv.includes('--targets');
/* The drift car slides in a bend: tan(slip / 2) past this somewhere in
 * each (0.1 is 11 degrees), and on a straight not at all. */
const SLIP_IN_BEND = 0.1;
const SLIP_ON_STRAIGHT = 1e-9;
/* The yard: every car's box from every solid, the road's edge from every
 * solid a car could reach, and the road from the pads, m. The starter's
 * header promises the first two. */
const CAR_CLEAR = 2.0;
const ROAD_CLEAR = 1.5;
const PADS_CLEAR = 10;
/* The box truck's and the kei van's laps, s: the starter promises 5 ms. */
const LAP_MATCH = 0.005;

let failures = 0;
function check(name, ok, detail) {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}
function target(name, ok, detail) {
  if (!ok && enforceTargets) {
    failures += 1;
  }
  console.log(`  ${ok ? 'met ' : (enforceTargets ? 'FAIL' : 'not ')}  target  ${name}${detail ? `: ${detail}` : ''}`);
}
function note(line) {
  console.log(`        ${line}`);
}
const r3 = (v) => (Number.isFinite(v) ? Number(v.toFixed(3)) : v);

/* ------------------------------------------------------------------ *
 * Measuring a line.
 * ------------------------------------------------------------------ */

/* Each point's Menger curvature (the module's measure) and the cosine of
 * its turn; an open line's ends are 0 and 1. */
function shapeOf(line) {
  const n = line.points.length;
  const kappa = new Float64Array(n);
  const cosTurn = new Float64Array(n).fill(1);
  for (let i = 0; i < n; i += 1) {
    if (!line.closed && (i === 0 || i === n - 1)) {
      continue;
    }
    const a = line.points[(i + n - 1) % n];
    const b = line.points[i];
    const c = line.points[(i + 1) % n];
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const vx = c.x - b.x;
    const vy = c.y - b.y;
    const lu = Math.sqrt(ux * ux + uy * uy);
    const lv = Math.sqrt(vx * vx + vy * vy);
    const wx = c.x - a.x;
    const wy = c.y - a.y;
    const lw = Math.sqrt(wx * wx + wy * wy);
    const cross = ux * vy - uy * vx;
    kappa[i] = lu * lv * lw > 0 ? (2 * cross) / (lu * lv * lw) : 0;
    cosTurn[i] = lu * lv > 0 ? (ux * vx + uy * vy) / (lu * lv) : 1;
  }
  return { kappa, cosTurn };
}

/*
 * Everything block 1 asks of a line, as a list of what is wrong with it
 * (empty when nothing is): finite; spaced at least the module's 1 cm and at
 * most BEND_STEP_MAX where it turns or STRAIGHT_STEP where it does not;
 * turning under TURN_MAX_DEG at every point; and in every bend, a run of
 * points that turn, the curvature zero at its two ends and never stepping
 * by more than KAPPA_STEP of the bend's peak. `lane` relaxes the spacing on
 * a bend by the lane's own shortening: a lane is the centre moved sideways,
 * point for point.
 */
function lineFaults(line, lane = 0) {
  const out = [];
  const n = line.points.length;
  if (line.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    return ['a point is not a number'];
  }
  const { kappa, cosTurn } = shapeOf(line);
  /* A point is on a bend when its curvature is more than a straight's
   * collinear points round to, relative to the line's sharpest bend. */
  let peakAll = 0;
  for (let i = 0; i < n; i += 1) {
    peakAll = Math.max(peakAll, Math.abs(kappa[i]));
  }
  const flat = (k) => Math.abs(k) <= END_KAPPA * Math.max(peakAll, 1e-3);
  const nseg = line.closed ? n : n - 1;
  let worstSp = 0;
  let worstShort = Infinity;
  for (let i = 0; i < nseg; i += 1) {
    const a = line.points[i];
    const b = line.points[(i + 1) % n];
    const d = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
    const bend = !flat(kappa[i]) || !flat(kappa[(i + 1) % n]);
    const bound = bend ? BEND_STEP_MAX * (1 + lane * Math.max(Math.abs(kappa[i]), Math.abs(kappa[(i + 1) % n]))) : STRAIGHT_STEP;
    worstSp = Math.max(worstSp, d / bound);
    worstShort = Math.min(worstShort, d);
  }
  if (worstSp > 1 + 1e-9) {
    out.push(`a segment ${r3(worstSp)} times its bound`);
  }
  if (!(worstShort >= MODULE.MIN_SEG)) {
    out.push(`a segment of ${r3(worstShort)} m`);
  }
  let worstCos = 1;
  for (let i = 0; i < n; i += 1) {
    worstCos = Math.min(worstCos, cosTurn[i]);
  }
  if (!(worstCos >= TURN_MAX_COS)) {
    out.push(`a point turns ${r3((Math.acos(Math.max(-1, worstCos)) * 180) / Math.PI)} degrees`);
  }
  /* The bends: maximal runs of points that are not flat. */
  const inBend = (i) => !flat(kappa[i]);
  const starts = [];
  for (let i = 0; i < n; i += 1) {
    const prev = line.closed ? (i + n - 1) % n : i - 1;
    if (inBend(i) && (prev < 0 || !inBend(prev))) {
      starts.push(i);
    }
  }
  if (line.closed && starts.length === 0 && peakAll > 0) {
    /* One bend all the way round: nothing to begin or end. */
    starts.push(0);
  }
  let worstStep = 0;
  for (const s0 of starts) {
    const run = [];
    for (let k = 0; k < n; k += 1) {
      const i = (s0 + k) % n;
      if (!line.closed && s0 + k >= n) {
        break;
      }
      if (!inBend(i)) {
        break;
      }
      run.push(i);
    }
    let peak = 0;
    for (const i of run) {
      peak = Math.max(peak, Math.abs(kappa[i]));
    }
    /* The ends: the points either side of the run are flat, by the run's
     * own definition, and the jump onto the run's first point is a step
     * like any other. */
    const before = line.closed ? (run[0] + n - 1) % n : run[0] - 1;
    const after = line.closed ? (run[run.length - 1] + 1) % n : run[run.length - 1] + 1;
    const seq = [before, ...run, after].filter((i) => i >= 0 && i < n);
    for (let k = 1; k < seq.length; k += 1) {
      worstStep = Math.max(worstStep, Math.abs(kappa[seq[k]] - kappa[seq[k - 1]]) / peak);
    }
  }
  if (worstStep > KAPPA_STEP) {
    out.push(`the curvature steps by ${r3(worstStep)} of a bend's peak`);
  }
  out.worstStep = worstStep;
  return out;
}

/* A plan LINE on a field of W by D as the physics frame numbers
 * sim_world_road is handed, through place.js and frame.js as traffic.js
 * does it. */
function simXYZ(line, W, D) {
  const xyz = new Float64Array(line.points.length * 3);
  const S = { x: 0, y: 0, z: 0 };
  line.points.forEach((p, i) => {
    const w = docToWorld(W, D, p.x, p.y, 0);
    threePosToSim(w.x, w.y, w.z, S);
    xyz[3 * i] = S.x;
    xyz[3 * i + 1] = S.y;
    xyz[3 * i + 2] = S.z;
  });
  return xyz;
}

/* sim_world_road on a fresh world, the points copied in as uploadRoad
 * copies them. Returns its code. */
function moduleTakes(sim, xyz, closed) {
  sim.e.sim_world_clear();
  sim.e.sim_world_build();
  const n = xyz.length / 3;
  const ptr = sim.e.malloc(xyz.length * 8 || 8);
  try {
    new Float64Array(sim.e.memory.buffer, ptr, xyz.length).set(xyz);
    return sim.e.sim_world_road(ptr, n, closed ? 1 : 0);
  } finally {
    sim.e.free(ptr);
  }
}

/* ------------------------------------------------------------------ *
 * 1 and 2. The shapes, and the mirror.
 * ------------------------------------------------------------------ */

function hostileShapes() {
  const out = [
    { name: 'a U turn on 8 m', nodes: [[0, 0], [40, 0], [40, 8], [0, 8]] },
    { name: 'a hairpin on 3 m', nodes: [[0, 0], [30, 0], [30, 3], [0, 3]] },
    { name: 'a hairpin of 176 degrees', nodes: [[0, 0], [30, 0], [0, 2]] },
    { name: 'a fold of 179.9 degrees', nodes: [[0, 0], [30, 0], [0, 0.05]] },
    { name: 'an exact fold', nodes: [[0, 0], [30, 0], [0, 0]] },
    { name: 'an exact fold mid road', nodes: [[0, 0], [30, 0], [10, 0], [10, 20]] },
    { name: 'legs of 30 cm round a square', nodes: [[0, 0], [0.3, 0], [0.3, 0.3], [10, 0.3]] },
    { name: 'a leg of a centimetre', nodes: [[0, 0], [0.01, 0], [10, 0], [10, 10]] },
    { name: 'a leg of 5 mm', nodes: [[0, 0], [0.005, 0], [10, 0]] },
    { name: 'duplicate nodes', nodes: [[0, 0], [0, 0], [10, 0], [10, 0], [10, 10], [10, 10]] },
    { name: 'collinear nodes, open', nodes: [[0, 0], [5, 0], [10, 0], [20, 0]] },
    { name: 'collinear nodes, closed', nodes: [[0, 0], [5, 0], [10, 0], [20, 0]], closed: true },
    { name: 'two nodes', nodes: [[0, 0], [10, 0]] },
    { name: 'two nodes on top of each other', nodes: [[0, 0], [0.001, 0]] },
    { name: 'one node', nodes: [[5, 5]] },
    { name: 'no nodes', nodes: [] },
    { name: 'nodes that are not numbers', nodes: [[0, 0], [NaN, 1], [Infinity, 2], [10, 0]] },
    { name: 'a closed triangle', nodes: [[0, 0], [20, 0], [10, 17.32]], closed: true },
    { name: 'a closed triangle of a metre', nodes: [[0, 0], [1, 0], [0.5, 0.866]], closed: true },
    { name: 'a closed square, one lane', nodes: [[0, 0], [40, 0], [40, 40], [0, 40]], closed: true, lanes: 1 },
    { name: 'a closed square, 20 m wide', nodes: [[0, 0], [60, 0], [60, 60], [0, 60]], closed: true, width: 20 },
    { name: 'a gentle kink of a degree', nodes: [[0, 0], [50, 0], [100, 0.87]] },
    { name: 'a kink of a tenth of a degree', nodes: [[0, 0], [50, 0], [100, 0.087]] },
    {
      name: 'a zigzag of 20 teeth',
      nodes: Array.from({ length: 21 }, (_, i) => [i * 4, (i % 2) * 6]),
    },
    {
      name: 'a closed star of seven points',
      nodes: Array.from({ length: 14 }, (_, i) => {
        const a = (i * Math.PI) / 7;
        const r = i % 2 ? 12 : 40;
        return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
      }),
      closed: true,
    },
    {
      name: 'a road round the edge of a 1 km field',
      nodes: [[1, 1], [999, 1], [999, 999], [1, 999]],
      closed: true,
      field: 1000,
    },
    {
      name: 'a road through the middle of a 1 km field',
      nodes: [[0, 500], [500, 500], [500, 1000], [1000, 1000], [1000, 0]],
      field: 1000,
    },
  ];
  /* Seeded random polygons in a 100 m box, 3 to 12 nodes, open and closed:
   * the shapes nobody would draw on purpose. */
  const rng = seededRandom(0x5eed_0ad5);
  for (let k = 0; k < 24; k += 1) {
    const n = 3 + Math.floor(rng.next() * 10);
    const nodes = [];
    for (let i = 0; i < n; i += 1) {
      nodes.push([rng.next() * 100, rng.next() * 100]);
    }
    out.push({ name: `random polygon ${k + 1} of ${n} nodes${k % 2 ? ', closed' : ''}`, nodes, closed: k % 2 === 1 });
  }
  return out;
}

/* A shape as a road element, on its own field. */
function roadElement(shape, i) {
  return {
    id: `el-${i + 1}`,
    type: 'road',
    position: { x: 0, y: 0, z: 0 },
    dims: { width: shape.width ?? 6, lanes: shape.lanes ?? 2, radius: 12 },
    nodes: shape.nodes.map(([x, y]) => ({ x, y })),
    closed: shape.closed === true,
  };
}

async function shapesBlock(sim, shapes, starterRoad) {
  console.log('\n1. shapes: road.js on the starter\'s road and on hostile control polygons');
  const all = [{ name: 'the starter\'s yard loop', el: starterRoad, field: 160 }, ...shapes.map((s, i) => ({ name: s.name, el: roadElement(s, i), field: s.field ?? 160 }))];
  let lines = 0;
  let refusedByModule = [];
  let faulty = [];
  let threw = [];
  let empty = 0;
  let unexplained = [];
  let mirror = [];
  let worstCost = { ms: 0, name: '' };
  let worstStep = { step: 0, name: '' };
  for (const s of all) {
    let r;
    try {
      const t0 = performance.now();
      r = roadOf(s.el);
      const ms = performance.now() - t0;
      if (ms > worstCost.ms) {
        worstCost = { ms, name: s.name };
      }
    } catch (e) {
      threw.push(`${s.name}: ${e.message}`);
      continue;
    }
    if (r.centre.points.length === 0) {
      empty += 1;
      if (!r.problems.some((p) => p.level === 'error')) {
        unexplained.push(s.name);
      }
      if (verbose) {
        note(`${s.name}: no line (${r.problems.map((p) => p.code).join(', ')})`);
      }
      continue;
    }
    const set = [{ label: 'centre', line: r.centre, lane: 0 }];
    if (r.laneOffset) {
      set.push({ label: 'left lane', line: laneLine(r.centre, r.laneOffset), lane: r.laneOffset });
      set.push({ label: 'right lane', line: laneLine(r.centre, -r.laneOffset), lane: r.laneOffset });
    }
    for (const { label, line, lane } of set) {
      lines += 1;
      const faults = lineFaults(line, lane);
      if (faults.length) {
        faulty.push(`${s.name}, ${label}: ${faults.join('; ')}`);
      }
      if (faults.worstStep > worstStep.step) {
        worstStep = { step: faults.worstStep, name: `${s.name}, ${label}` };
      }
      const xyz = simXYZ(line, s.field, s.field);
      const code = moduleTakes(sim, xyz, line.closed);
      if (code < 0) {
        refusedByModule.push(`${s.name}, ${label}: ${simErrorName(code)}`);
      }
      const mine = moduleCheck(xyz, line.closed);
      if ((code < 0) !== Boolean(mine.code)) {
        mirror.push(`${s.name}, ${label}: module ${code}, moduleCheck ${mine.code || 'accepts'}`);
      }
    }
    if (verbose) {
      note(`${s.name}: ${r.centre.points.length} points, ${r3(r.centre.length)} m, tightest ${r3(r.report.tightest.radius)} m${r.problems.length ? `, ${r.problems.map((p) => p.code).join(', ')}` : ''}`);
    }
  }
  check(`road.js never throws, on ${all.length} roads`, threw.length === 0, threw.join('; '));
  check('a road with no line always says why, with an error problem', unexplained.length === 0,
    unexplained.length ? unexplained.join('; ') : `${empty} with no line, every one explained`);
  check(`every line and lane line (${lines}) is spaced, turns under ${TURN_MAX_DEG} degrees a point, and has bends whose curvature starts and ends at zero and never steps`,
    faulty.length === 0, faulty.join(' | '));
  check(`sim_world_road accepts every one of them`, refusedByModule.length === 0, refusedByModule.join('; '));
  check('road.js moduleCheck agrees with the module on every one', mirror.length === 0, mirror.join('; '));
  note(`the largest step in curvature inside a bend: ${r3(worstStep.step)} of its peak, ${worstStep.name}`);
  note(`the slowest road to work out: ${r3(worstCost.ms)} ms, ${worstCost.name}`);
}

/*
 * ARITHMETIC ONLY: road.js and traffic.js hand the module its road points,
 * so neither may call a function JavaScript does not specify to the bit.
 * The source, comments taken out, is searched for Math's transcendental
 * functions, Math.random, and the ** operator (as loosely specified as
 * Math.pow). The scan is shown to find each in a planted line.
 */
const FORBIDDEN = /Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|pow|exp|expm1|log|log1p|log2|log10|hypot|cbrt|random)\b|\*\*/g;
function arithmeticProblems(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return [...new Set((code.match(FORBIDDEN) || []))];
}

async function sourceBlock() {
  const found = [];
  for (const f of ['src/maps/built/road.js', 'src/maps/built/traffic.js']) {
    const bad = arithmeticProblems(await readFile(join(root, f), 'utf8'));
    if (bad.length) {
      found.push(`${f}: ${bad.join(', ')}`);
    }
  }
  check('road.js and traffic.js use + - * / and Math.sqrt: no JS trigonometry, pow, exp, hypot, random or **', found.length === 0,
    found.join('; ') || 'none found');
  const planted = arithmeticProblems('/* Math.sin in a comment is fine */\nconst a = Math.atan2(1, 2) + Math.hypot(3, 4) + 2 ** 3;\n');
  check('and the search finds each in a planted line, and nothing in a comment',
    planted.includes('Math.atan2') && planted.includes('Math.hypot') && planted.includes('**') && !planted.includes('Math.sin'),
    planted.join(', '));
}

async function mirrorBlock(sim) {
  console.log('\n2. mirror: the checks and moduleCheck can see a bad road');
  /* Roads the module refuses, handed over raw, as the physics frame numbers
   * it would be given. */
  const raw = (pts) => {
    const xyz = new Float64Array(pts.length * 3);
    pts.forEach((p, i) => {
      xyz[3 * i] = p[0];
      xyz[3 * i + 1] = p[1];
      xyz[3 * i + 2] = 0;
    });
    return xyz;
  };
  const bad = [
    { name: 'a square corner as one point', xyz: raw([[0, 0], [10, 0], [10, 10]]), closed: false },
    { name: 'a segment of 5 mm', xyz: raw([[0, 0], [0.005, 0], [10, 0]]), closed: false },
    { name: 'a point 2e6 m out', xyz: raw([[0, 0], [2e6, 0]]), closed: false },
    { name: 'a closed road of two points', xyz: raw([[0, 0], [10, 0]]), closed: true },
    { name: 'a turn of 31 degrees', xyz: raw([[0, 0], [10, 0], [10 + 10 * Math.cos(0.541), 10 * Math.sin(0.541)]]), closed: false },
    { name: 'a road of 9000 points', xyz: raw(Array.from({ length: 9000 }, (_, i) => [i * 0.5, 0])), closed: false },
  ];
  const good = [
    { name: 'a turn of 29 degrees', xyz: raw([[0, 0], [10, 0], [10 + 10 * Math.cos(0.506), 10 * Math.sin(0.506)]]), closed: false },
    { name: 'a segment of 2 cm', xyz: raw([[0, 0], [0.02, 0], [10, 0]]), closed: false },
  ];
  const wrong = [];
  for (const b of [...bad, ...good]) {
    const code = moduleTakes(sim, b.xyz, b.closed);
    const mine = moduleCheck(b.xyz, b.closed);
    const shouldRefuse = bad.includes(b);
    if ((code < 0) !== shouldRefuse || Boolean(mine.code) !== shouldRefuse) {
      wrong.push(`${b.name}: module ${code}, moduleCheck ${mine.code || 'accepts'}`);
    }
  }
  check(`moduleCheck refuses the ${bad.length} roads the module refuses and takes the ${good.length} it takes`, wrong.length === 0, wrong.join('; '));
  /* And the geometry checks fail a polygon handed over uneased: a square
   * whose corners are single points, its sides cut to a metre. */
  const square = [];
  const corners = [[0, 0], [40, 0], [40, 40], [0, 40]];
  for (let c = 0; c < 4; c += 1) {
    const a = corners[c];
    const b = corners[(c + 1) % 4];
    for (let j = 0; j < 40; j += 1) {
      square.push({ x: a[0] + ((b[0] - a[0]) * j) / 40, y: a[1] + ((b[1] - a[1]) * j) / 40 });
    }
  }
  const s = [0];
  for (let i = 1; i < square.length; i += 1) {
    s.push(s[i - 1] + 1);
  }
  const uneased = { points: square, s, length: 160, closed: true, node: square.map(() => -1) };
  const faults = lineFaults(uneased);
  check('the geometry checks fail an uneased square', faults.some((f) => f.includes('turns')) && faults.some((f) => f.includes('steps')),
    faults.join('; ') || 'nothing seen');
  const tight = centreLine([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }], false, { radius: 12 });
  check('and pass the same corner eased', lineFaults(tight).length === 0, lineFaults(tight).join('; ') || 'nothing wrong');
}

/* ------------------------------------------------------------------ *
 * 3 and 4. The starter's traffic, in the module.
 * ------------------------------------------------------------------ */

/* A pose's road point, back in the plan: the inverse of docToWorld. */
function toPlan(W, D, x, z) {
  return { x: x + W / 2, y: D / 2 - z };
}

/* The gap between a car's box and a solid's bounding box in plan, by the
 * separating axes of the two (the solid's and the car's own): positive is
 * apart, and a lower bound on the distance between them. */
function planGap(cx, cz, hx, hz, L, Wd, b) {
  const axes = [[1, 0], [0, 1], [hx, hz], [-hz, hx]];
  const corners = [];
  for (const sl of [-1, 1]) {
    for (const sw of [-1, 1]) {
      corners.push([cx + (hx * sl * L) / 2 - (hz * sw * Wd) / 2, cz + (hz * sl * L) / 2 + (hx * sw * Wd) / 2]);
    }
  }
  const bc = [[b[0], b[2]], [b[3], b[2]], [b[0], b[5]], [b[3], b[5]]];
  let best = -Infinity;
  for (const [ux, uz] of axes) {
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (const [x, z] of corners) {
      const d = x * ux + z * uz;
      a0 = Math.min(a0, d);
      a1 = Math.max(a1, d);
    }
    for (const [x, z] of bc) {
      const d = x * ux + z * uz;
      b0 = Math.min(b0, d);
      b1 = Math.max(b1, d);
    }
    best = Math.max(best, b0 - a1, a0 - b1);
  }
  return best;
}

/* A solid's bounds, Three.js metres: a capsule by its segment and radius,
 * which is more than the capsule, so a gap to it is a gap to the capsule. */
function boundsOf(s) {
  if (s.box) {
    return s.box;
  }
  const c = s.cap;
  return [
    Math.min(c[0], c[3]) - c[6], Math.min(c[1], c[4]) - c[6], Math.min(c[2], c[5]) - c[6],
    Math.max(c[0], c[3]) + c[6], Math.max(c[1], c[4]) + c[6], Math.max(c[2], c[5]) + c[6],
  ];
}

/*
 * The comparison the yaw rate target is printed beside: the drift car on
 * the starter's loop with its bends built with no easing (road.js ramp 0,
 * circular arcs), in a module of its own, over the same 20 s.
 */
async function unrampedYawStep(wasm, doc, traffic) {
  const roadEl = doc.elements.find((e) => e.type === 'road');
  const r = roadOf(roadEl);
  const c = centreLine(roadNodesOf(roadEl), true, { radius: r.radius, floor: DRIVE_RADIUS_MIN + r.laneOffset, ramp: 0 });
  const lane = laneLine(c, r.laneOffset);
  const sim = await loadSim(wasm);
  sim.e.sim_world_clear();
  sim.e.sim_world_build();
  const road = uploadRoad(sim, lane.points.map((p) => docToWorld(doc.field.width, doc.field.depth, p.x, p.y, 0)), true);
  const v = traffic.vehicles.find((q) => q.drift > 0);
  addVehicle(sim, 0, road, v);
  const poses = makeVehiclePoses();
  let prev = null;
  let worst = 0;
  for (let step = 0; step <= 20000; step += 1) {
    setVehicleClock(sim, step);
    readVehicles(sim, poses);
    if (prev !== null) {
      worst = Math.max(worst, Math.abs(poses[0].yawRate - prev));
    }
    prev = poses[0].yawRate;
  }
  return worst;
}

async function starterBlocks(wasm) {
  const { doc, repairs } = normalize(starterMap());
  const W = doc.field.width;
  const D = doc.field.depth;
  const traffic = trafficOf(doc);
  console.log('\n3. starter: trafficOf(starterMap()) in the module, 20 s of its clock');
  check('the starter normalizes with no repairs', repairs.length === 0, repairs.join('; '));
  check('trafficOf the starter: no problems', traffic.problems.length === 0,
    traffic.problems.map((p) => `${p.code} ${p.message}`).join('; ') || `${traffic.roads.length} lanes, ${traffic.vehicles.length} vehicles`);
  const sim = await loadSim(wasm);
  sim.e.sim_world_clear();
  sim.e.sim_world_build();
  const up = uploadTraffic(sim, traffic);
  check('uploadTraffic: every lane and every vehicle taken',
    up.problems.length === 0 && up.roads === traffic.roads.length && up.vehicles === traffic.vehicles.length,
    `${up.roads} lanes, ${up.vehicles} vehicles${up.problems.length ? `; ${up.problems.map((p) => p.message).join('; ')}` : ''}`);

  const poses = makeVehiclePoses();
  const cars = traffic.vehicles;
  const lines = traffic.roads.map((r) => r.line);
  const shapes = lines.map((l) => shapeOf(l));
  let finite = true;
  let offLine = 0;
  let offWhere = '';
  let plainSlip = 0;
  let straightSlip = 0;
  let yawStep = 0;
  let yawAt = 0;
  const drift = cars.findIndex((v) => v.drift > 0);
  /* Which bends the drift car has slid in: by the node each bend belongs
   * to, on its own line. */
  const bendSlip = new Map();
  let prevYaw = null;
  for (let step = 0; step <= 20000; step += 1) {
    setVehicleClock(sim, step);
    readVehicles(sim, poses);
    for (let k = 0; k < cars.length; k += 1) {
      const v = cars[k];
      const p = poses[v.slot];
      const nums = [p.x, p.y, p.z, p.hx, p.hz, p.qx, p.qy, p.qz, p.qw, p.vx, p.vy, p.vz, p.speed, p.distance, p.yawRate, p.curvature, p.slip];
      if (!p.on || nums.some((q) => !Number.isFinite(q))) {
        finite = false;
      }
      if (step % 10 !== 0 && k !== drift) {
        continue;
      }
      const line = lines[v.road];
      const at = toPlan(W, D, p.x, p.z);
      const near = nearestOn(line, at.x, at.y);
      if (near.d > ON_LINE && near.d > offLine) {
        offLine = near.d;
        offWhere = `${v.element} ${v.style} at step ${step}`;
      }
      if (k !== drift) {
        plainSlip = Math.max(plainSlip, Math.abs(p.slip));
        continue;
      }
      /* On a straight: the nearest point of the line and everything within
       * the module's 1.5 m either way belong to no bend. */
      const i = line.s.findIndex((s) => s >= near.s);
      const idx = i < 0 ? line.points.length - 1 : i;
      let straight = true;
      for (let j = 0; j < line.points.length; j += 1) {
        const ds = Math.abs(line.s[j] - line.s[idx]);
        const wrap = line.closed ? Math.min(ds, line.length - ds) : ds;
        if (wrap <= 2.5 && line.node[j] !== -1) {
          straight = false;
          break;
        }
      }
      if (straight) {
        straightSlip = Math.max(straightSlip, Math.abs(p.slip));
      } else if (line.node[idx] !== -1) {
        const n = line.node[idx];
        bendSlip.set(n, Math.max(bendSlip.get(n) ?? 0, Math.abs(p.slip)));
      }
      if (prevYaw !== null && Math.abs(p.yawRate - prevYaw) > yawStep) {
        yawStep = Math.abs(p.yawRate - prevYaw);
        yawAt = step;
      }
      prevYaw = p.yawRate;
    }
  }
  check('20 s of poses: every car on, every number finite', finite);
  check(`every car on its own line, to ${ON_LINE} m`, offLine === 0, offLine ? `${r3(offLine)} m off, ${offWhere}` : 'all on');
  check('the ordinary cars never slip', plainSlip === 0, `largest tan(slip / 2) ${plainSlip}`);
  const dline = lines[cars[drift].road];
  const bends = [...new Set(dline.node.filter((n) => n !== -1))];
  const slid = bends.filter((n) => (bendSlip.get(n) ?? 0) > SLIP_IN_BEND);
  check(`the drift car slides in every bend it reached in 20 s, tan(slip / 2) past ${SLIP_IN_BEND}`,
    slid.length === bendSlip.size && bendSlip.size >= 4,
    [...bendSlip].map(([n, t]) => `node ${n + 1} ${r3((2 * Math.atan(t) * 180) / Math.PI)} deg`).join(', '));
  check(`and not on a straight: tan(slip / 2) under ${SLIP_ON_STRAIGHT}`, straightSlip < SLIP_ON_STRAIGHT, `largest ${straightSlip}`);
  const unramped = await unrampedYawStep(wasm, doc, traffic);
  target(`its yaw rate steps by no more than ${YAW_STEP_TARGET} rad/s in a millisecond`, yawStep <= YAW_STEP_TARGET,
    `largest ${r3(yawStep)} rad/s, at step ${yawAt}; the same loop with its bends' easing taken out, ${r3(unramped)} rad/s`);
  note(`drift gain ${DRIFT.gain}, cornering ${DRIFT.lateral} m/s/s`);

  /* ---- 4. the yard ---- */
  console.log('\n4. yard: the loop and its cars against the starter\'s solids');
  const placed = placeDocument(doc);
  const owner = [];
  for (const it of placed.items) {
    const k = placeSolids(it.parts, it.x, it.y, it.z, it.yaw, it.turns, []).length;
    for (let j = 0; j < k; j += 1) {
      owner.push(`${it.el.id} ${it.el.type}`);
    }
  }
  const bounds = placed.solids.map(boundsOf);
  /* Laps, from the module's own distance: the clock at which each car has
   * driven its line's length, found by halving. */
  const lapOf = (v) => {
    setVehicleClock(sim, 0);
    readVehicles(sim, poses);
    const d0 = poses[v.slot].distance;
    const L = traffic.roads[v.road].length;
    let lo = 0;
    let hi = 1;
    for (;;) {
      setVehicleClock(sim, hi);
      readVehicles(sim, poses);
      if (poses[v.slot].distance - d0 >= L) {
        break;
      }
      lo = hi;
      hi *= 2;
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      setVehicleClock(sim, mid);
      readVehicles(sim, poses);
      if (poses[v.slot].distance - d0 >= L) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return hi;
  };
  const laps = cars.map(lapOf);
  const worst = cars.map(() => ({ gap: Infinity, what: '' }));
  const longest = Math.max(...laps);
  for (let step = 0; step <= longest; step += 5) {
    setVehicleClock(sim, step);
    readVehicles(sim, poses);
    cars.forEach((v, k) => {
      const p = poses[v.slot];
      const reach = v.length + 4;
      for (let i = 0; i < bounds.length; i += 1) {
        const b = bounds[i];
        if (b[1] >= p.y + v.clearance + v.height || b[4] <= p.y + v.clearance) {
          continue;
        }
        if (b[0] > p.x + reach || b[3] < p.x - reach || b[2] > p.z + reach || b[5] < p.z - reach) {
          continue;
        }
        const g = planGap(p.x, p.z, p.hx, p.hz, v.length, v.width, b);
        if (g < worst[k].gap) {
          const at = toPlan(W, D, p.x, p.z);
          worst[k] = { gap: g, what: `${owner[i]} ${placed.solids[i].name || ''}`, at: `(${r3(at.x)}, ${r3(at.y)})` };
        }
      }
    });
  }
  cars.forEach((v, k) => {
    check(`${v.element} ${v.style}${v.drift ? ', the drift car,' : ''} keeps ${CAR_CLEAR} m from every solid over its whole lap (${r3(laps[k] / 1000)} s)`,
      worst[k].gap >= CAR_CLEAR, `nearest ${worst[k].what} at ${r3(worst[k].gap)} m, the car at ${worst[k].at}`);
  });
  /* The road's own 6 m, against every solid a car could reach: under the
   * tallest car's roof. */
  const roadEl = doc.elements.find((e) => e.type === 'road');
  const road = roadOf(roadEl);
  const tallest = Math.max(...cars.map((v) => v.clearance + v.height));
  let band = { d: Infinity, what: '', at: '' };
  for (const p of road.centre.points) {
    const w = docToWorld(W, D, p.x, p.y, 0);
    for (let i = 0; i < bounds.length; i += 1) {
      const b = bounds[i];
      if (b[1] >= tallest) {
        continue;
      }
      const dx = Math.max(b[0] - w.x, 0, w.x - b[3]);
      const dz = Math.max(b[2] - w.z, 0, w.z - b[5]);
      const d = Math.sqrt(dx * dx + dz * dz) - road.width / 2;
      if (d < band.d) {
        band = { d, what: `${owner[i]} ${placed.solids[i].name || ''}`, at: `(${r3(p.x)}, ${r3(p.y)})` };
      }
    }
  }
  check(`the road's ${road.width} m keep ${ROAD_CLEAR} m from every solid under ${r3(tallest)} m`, band.d >= ROAD_CLEAR,
    `nearest ${band.what} at ${r3(band.d)} m, from the centre line at ${band.at}`);
  const pads = doc.elements.find((e) => e.type === 'startPads');
  const nearPads = nearestOn(road.centre, pads.position.x, pads.position.y);
  check(`and ${PADS_CLEAR} m from the start pads`, nearPads.d - road.width / 2 >= PADS_CLEAR, `${r3(nearPads.d - road.width / 2)} m`);
  const truck = cars.findIndex((v) => v.style === 'boxtruck');
  const van = cars.findIndex((v) => v.style === 'keivan');
  if (truck < 0 || van < 0) {
    check('the starter has its box truck and kei van', false);
  } else {
    /* Ten laps each, so a millisecond's rounding of the clock is a tenth of
     * one in a lap. */
    const lap10 = (v) => {
      setVehicleClock(sim, 0);
      readVehicles(sim, poses);
      const d0 = poses[v.slot].distance;
      const L = 10 * traffic.roads[v.road].length;
      let lo = 0;
      let hi = 600000;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        setVehicleClock(sim, mid);
        readVehicles(sim, poses);
        if (poses[v.slot].distance - d0 >= L) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      return hi / 10000;
    };
    const lt = lap10(cars[truck]);
    const lv = lap10(cars[van]);
    check(`the box truck's and the kei van's laps agree to ${LAP_MATCH * 1000} ms`, Math.abs(lt - lv) <= LAP_MATCH,
      `${r3(lt)} s and ${r3(lv)} s`);
  }
}

/* ------------------------------------------------------------------ */

async function main() {
  const t0 = performance.now();
  const wasm = await readFile(join(root, 'dist/sim.wasm'));
  console.log('roads-check: the road tool\'s geometry and the starter\'s traffic, in dist/sim.wasm');
  const sim = await loadSim(wasm);
  const starterRoad = normalize(starterMap()).doc.elements.find((e) => e.type === 'road');
  await shapesBlock(sim, hostileShapes(), starterRoad);
  await sourceBlock();
  await mirrorBlock(sim);
  await starterBlocks(wasm);
  console.log(`\nroads-check: ${failures === 0 ? 'all passed' : `${failures} FAILED`} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  return failures;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(e);
  process.exit(99);
});
