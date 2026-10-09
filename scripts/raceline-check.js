/*
 * raceline-check.js: the whoop rooms' race line, solved and judged in Node.
 *
 * The line is src/game/raceline.js (the trail the "Race line" setting draws,
 * src/render/raceline.js). It is pure arithmetic over a course and the room's
 * solids, so every shipped whoop track can be solved here in seconds with no
 * browser, and this file holds each answer to what a beginner is promised.
 * It is cheap enough to run on any change to the solver, the course reader
 * or the race.
 *
 * FOR EVERY WHOOP PRESET
 *
 *   a line is found, and the solver calls it clean;
 *   the three laps of it are credited by the real Race, in order (the
 *   solver's own gate before anything is shown);
 *   the order the line goes through the openings is the course's, and
 *   nothing else: found again here from the Race's own gate frames and a
 *   plane test of this file's own, so a mistake in the solver's crossing
 *   count cannot also be a mistake in the check. A pass of an opening out of
 *   turn, or the wrong way, is a mismatch; so is a missed one;
 *   the aircraft's clearance is kept from every solid, measured here with
 *   distance functions of this file's own;
 *   the line is quicker than the builder's own through the same openings,
 *   and about as long as people take (the board's best, for the tracks of
 *   the presets that are on it, 2026-10-08);
 *   the crumbs the render draws leave no gap a beginner would lose the line
 *   in, and the table that says where each gate is on them is in order;
 *   a second solve is the same answer to the last bit.
 *
 * `--fly` also flies the line through the real plant (dist/sim.wasm, with
 * Betaflight's own loop), in empty sky, on a follower that chases a point
 * going round the line at the line's own speeds and holding back when the
 * aircraft falls behind it, and says what the plant took a lap against what
 * the line's model says, how far the aircraft strays, and whether the race
 * credits three laps. It answers "can the aircraft follow this at this pace",
 * which is as far as a machine can say "achievable". It is not a human, and
 * it has no room round it, so a collision is not measured.
 *
 *   node scripts/raceline-check.js [--fly] [track name fragment]
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { presetsForClass } from '../src/trackbuilder/presets.js';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { Race } from '../src/game/race.js';
import {
  raceLineFor, verifyRaceLine, solidsOf, gatesOf, CRAFT_SWEEP, PACE,
} from '../src/game/raceline.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const FLY = args.includes('--fly');
const want = (args.find((a) => !a.startsWith('--')) ?? '').toLowerCase();

/* The fastest laps posted on the public board for the presets that are on it,
 * seconds, read from webfpv.org/board on 2026-10-08 (the list's best.lapMs).
 * They are what the pace in src/game/raceline.js was set against, and the
 * check keeps a change to that pace, or to the line's geometry, honest about
 * it. A figure that has since been beaten is still a figure from that day. */
const BOARD_BEST_S = {
  'RaceGOW5 Track 1': 17.956,
  'RaceGOW5 Track 2': 22.391,
};
/* How far from the board's best a line's lap may sit, as a ratio. The
 * calibration's own spread over the five tracks it was fitted to was 0.71 to
 * 1.44 (a loop heavy tower track is the slow end and a track of short
 * straights the fast), so this is wide on purpose: it catches a pace that has
 * been moved, not a line that is a few percent different. */
const RATIO = [0.8, 1.25];

/* The clearance this file calls a failure: the aircraft's sweep less the
 * solver's own tolerance (CLEAN_SHORT, two centimetres), so a line the solver
 * calls clean and this file does not is a disagreement between the two. */
const CLEARANCE_SLACK = 0.02;
/* The widest gap between two crumbs, metres. Dropped at equal lap times, the
 * gap is the speed times the interval: at the pace's cap of 6 m/s and 0.15 s
 * that is 0.9 m, and a beginner following dots needs the next one in sight. */
const CRUMB_GAP_MAX = 1.0;

let fails = 0;
function check(name, ok, extra) {
  if (ok) {
    console.log(`  pass  ${name}`);
    return;
  }
  fails += 1;
  console.log(`  FAIL  ${name}${extra === undefined ? '' : `  ${extra}`}`);
}

/* ------------------------------------------------------------------ *
 * the clearance, measured here
 * ------------------------------------------------------------------ */

function segDist(px, py, pz, a, b) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const l2 = abx * abx + aby * aby + abz * abz;
  let u = 0;
  if (l2 > 1e-12) {
    u = Math.min(1, Math.max(0, ((px - a[0]) * abx + (py - a[1]) * aby + (pz - a[2]) * abz) / l2));
  }
  const dx = a[0] + abx * u - px;
  const dy = a[1] + aby * u - py;
  const dz = a[2] + abz * u - pz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function boxDist(px, py, pz, lo, hi) {
  const dx = Math.max(lo[0] - px, 0, px - hi[0]);
  const dy = Math.max(lo[1] - py, 0, py - hi[1]);
  const dz = Math.max(lo[2] - pz, 0, pz - hi[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/* The least distance from any point of the dense line to the surface of any
 * solid, metres. The aircraft's centre must stay CRAFT_SWEEP clear. */
function leastClearance(dense, solids) {
  const { points, count } = dense;
  let least = Infinity;
  for (let i = 0; i < count; i += 1) {
    const x = points[i * 3];
    const y = points[i * 3 + 1];
    const z = points[i * 3 + 2];
    for (const c of solids.caps) {
      const d = segDist(x, y, z, c.a, c.b) - c.r;
      if (d < least) {
        least = d;
      }
    }
    for (const b of solids.boxes) {
      const d = boxDist(x, y, z, b.lo, b.hi);
      if (d < least) {
        least = d;
      }
    }
  }
  return least;
}

/* ------------------------------------------------------------------ *
 * the openings, in the order they are gone through
 * ------------------------------------------------------------------ */

/*
 * What the line goes through, as a list of "hole+" and "hole-" (through it the
 * way the hole's first station is flown, or the way back), and what the
 * course asks for in the same words. The holes are the Race's own gates, in
 * its frames: x across, y up, z along the travel. A crossing is a segment of
 * the dense line whose two ends are on either side of that plane with the
 * crossing point inside the hole the Race scores (its clear opening less the
 * margin it shrinks every hole by). A point exactly on the plane counts as
 * ahead of it, which is where the line's own start sits.
 *
 * A hole is built (a frame) or a gap in the lattice (no pipe of its own). They
 * are judged alike, as one list: RaceGOW's rules say a course is flown
 * "exactly as shown" and forbid a pass through a gate the other way to shorten
 * the line, and the game scores a gap as it does a frame (src/game/raceline.js,
 * THE RULES). They are still counted apart, so a failure says which it was.
 */
function openingOrder(course, dense) {
  const race = new Race(gatesOf(course), course.trackClass);
  const unbuilt = new Set(course.structures.filter((st) => st.unbuilt).map((st) => st.id));
  const holes = new Map();
  const expected = [];
  for (const g of race.gates) {
    if (g.virtual) {
      continue;
    }
    const key = `${g.elementId}#${g.apertureIndex ?? 0}`;
    if (!holes.has(key)) {
      holes.set(key, {
        key, g, ap: g.apertures[0], gap: unbuilt.has(g.elementId),
      });
    }
    const ref = holes.get(key).g;
    const along = g.az.x * ref.az.x + g.az.y * ref.az.y + g.az.z * ref.az.z;
    expected.push(`${key}${along > 0 ? '+' : '-'}`);
  }
  const { points, count } = dense;
  const found = [];
  for (let i = 0; i < count; i += 1) {
    const j = i + 1 < count ? i + 1 : 0;
    for (const { key, g, ap } of holes.values()) {
      const a = race.local(g, ap.centreY, points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
      const b = race.local(g, ap.centreY, points[j * 3], points[j * 3 + 1], points[j * 3 + 2]);
      if ((a.z >= 0) === (b.z >= 0)) {
        continue;
      }
      const u = a.z / (a.z - b.z);
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u;
      if (Math.abs(x) <= ap.clearW / 2 - race.passMargin
        && Math.abs(y) <= ap.clearH / 2 - race.passMargin) {
        found.push(`${key}${b.z > a.z ? '+' : '-'}`);
      }
    }
  }
  const isGap = (e) => holes.get(e.slice(0, -1)).gap;
  return {
    all: { expected, found },
    built: {
      expected: expected.filter((e) => !isGap(e)),
      found: found.filter((e) => !isGap(e)),
    },
    gaps: {
      expected: expected.filter(isGap),
      found: found.filter(isGap),
    },
  };
}

/* Whether two lists are the same going round, from wherever the line's first
 * point happens to fall. Returns the first place they differ when they are
 * not, for the message. */
function sameRound(found, expected) {
  if (found.length !== expected.length) {
    return {
      ok: false,
      why: `${found.length} openings gone through, ${expected.length} asked for: line ${found.join(' ')}, course ${expected.join(' ')}`,
    };
  }
  for (let r = 0; r < found.length; r += 1) {
    let same = true;
    for (let i = 0; i < found.length && same; i += 1) {
      same = found[(i + r) % found.length] === expected[i];
    }
    if (same) {
      return { ok: true };
    }
  }
  const at = found.findIndex((f, i) => f !== expected[i]);
  return { ok: false, why: `first difference at ${at}: line ${found[at]}, course ${expected[at]}` };
}

/* ------------------------------------------------------------------ *
 * the crumbs
 * ------------------------------------------------------------------ */

function crumbReport(r, course) {
  const { crumbs, count, stationCrumb } = r;
  let gap = 0;
  for (let c = 0; c < count; c += 1) {
    const d = (c + 1) % count;
    const g = Math.hypot(
      crumbs[d * 3] - crumbs[c * 3],
      crumbs[d * 3 + 1] - crumbs[c * 3 + 1],
      crumbs[d * 3 + 2] - crumbs[c * 3 + 2],
    );
    if (g > gap) {
      gap = g;
    }
  }
  let ordered = stationCrumb.length === course.stations.length;
  for (let s = 0; s < stationCrumb.length; s += 1) {
    if (!(stationCrumb[s] >= 0 && stationCrumb[s] < count)) {
      ordered = false;
    }
    if (s > 0 && stationCrumb[s] < stationCrumb[s - 1]) {
      ordered = false;
    }
  }
  return { gap, ordered };
}

/* ------------------------------------------------------------------ *
 * the plant flies it (--fly)
 * ------------------------------------------------------------------ */

/* The follower's hover throttle for this tune at 4.0 V a cell, found by holding
 * a point and bisecting on steady state height (0.26 sat 0.10 m low, 0.30 sat
 * 0.11 m high). The rig's default, 0.345, was fitted for another tune and sat
 * 0.33 m high at a hover. The gains are the ones that held a 1 g line in the
 * investigation of 2026-10-08 (PROGRESS.md): the rig's default ones lost it. */
const HOVER = 0.28;
const KP = 14;
const KD = 7.5;
const KA = 20;
const MAX_RATE = 12;
const DAMP = 0.14;

/* Laps the follower is asked for, and the least of them the race must credit.
 * Three are what a race is, and the fourth is slack for a lap the first one
 * spends joining the line. */
const LAPS_FLOWN = 4;
const LAPS_NEEDED = 3;

/* The follower may take this many times the line's own time over the laps
 * before it is called off. The line's time is a point mass's, which turns
 * without turning its body, so a craft that took the same time would be doing
 * better than the model, and one that takes half as long again is flying the
 * line at two thirds of the pace the trail promises: the most the trail can be
 * off by and still mean what it says. Fixed before the first run of it, and
 * the eight rooms took 1.05 to 1.17 times. */
const TIME_BUDGET = 1.5;

/* The reference the follower chases is a point that goes round the line at the
 * line's own speed and slows to a stop as the craft falls behind it: a pilot
 * on a trail goes along it as fast as he can hold it, and does not chase a
 * stopwatch. (A point on a schedule was the first version, and it could not
 * tell a craft that was a metre behind at a corner from one that was lost: a
 * craft behind a corner it has not turned yet is asked to cut it, the error
 * grows, and the rig's own tracker rolls it over for the climb it wants.)
 * Free inside the first distance, stopped beyond the second, metres. */
const LEASH_FREE = 0.3;
const LEASH_STOP = 1.0;

/* The follower does not chase more than this much of the line's own
 * acceleration, m/s^2. The line has kinks a few centimetres across (a corner
 * the model takes at 0.2 m/s costs it nothing to put in), and the acceleration
 * at one is ten metres a second squared for a tenth of a second, which a
 * pilot would fly straight across and the follower rolled the aircraft over
 * for: at 8 a kink in RaceGOW5 Track 7's line did it in two laps of four, and
 * at 6, 4 and 3 no track lost a lap. Half a g is what the line's own turns
 * ask for (0.35 g sideways and a little along). It trims the feed forward only;
 * the error is measured against the line as it is. */
const FF_MAX = 5;

/* The follower never asks for thrust more than this far off the vertical, nor
 * for less than 15 percent of a hover's. A pilot who wants to go down lowers
 * the throttle, and does not roll the aircraft over to push: without this, a
 * climb error a corner or two earlier asked for more than a g downward and the
 * craft was inverted on the floor in one lap of four on two of the eight
 * tracks, whichever way the other gains were set (2026-10-08). Radians. */
const TILT_MAX = (80 * Math.PI) / 180;
const MIN_UP = 0.15;

/* A craft that has held the reference stopped for this long is on the floor, or
 * as good as, and the flight is over: milliseconds. */
const LOST_MS = 10000;

/* A time parametrised path for the follower: where the line is, how fast
 * it is going and the acceleration it asks for, at a time. The line's own
 * analytic tangent and curvature are used, so the feed forward is the line's
 * and not a finite difference of its samples. */
function timedPath(dense, laps, V) {
  const { points, tangents, curvature, speeds, ds, count } = dense;
  const t = new Float64Array(count + 1);
  for (let i = 0; i < count; i += 1) {
    const j = i + 1 < count ? i + 1 : 0;
    t[i + 1] = t[i] + ds[i] / (0.5 * (speeds[i] + speeds[j]));
  }
  const lapT = t[count];
  const fn = (time) => {
    const tt = Math.min(time, lapT * laps);
    const tl = tt % lapT;
    let lo = 0;
    let hi = count;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (t[m] <= tl) {
        lo = m;
      } else {
        hi = m;
      }
    }
    const j = lo + 1 < count ? lo + 1 : 0;
    const u = (tl - t[lo]) / (t[lo + 1] - t[lo] || 1);
    const lerp = (a, b) => a + (b - a) * u;
    const sp = lerp(speeds[lo], speeds[j]);
    const at = sp * ((speeds[j] - speeds[lo]) / ds[lo]);
    const tx = tangents[lo * 3];
    const ty = tangents[lo * 3 + 1];
    const tz = tangents[lo * 3 + 2];
    return {
      p: V(
        lerp(points[lo * 3], points[j * 3]),
        lerp(points[lo * 3 + 1], points[j * 3 + 1]),
        lerp(points[lo * 3 + 2], points[j * 3 + 2]),
      ),
      v: V(tx * sp, ty * sp, tz * sp),
      a: V(
        sp * sp * lerp(curvature[lo * 3], curvature[j * 3]) + tx * at,
        sp * sp * lerp(curvature[lo * 3 + 1], curvature[j * 3 + 1]) + ty * at,
        sp * sp * lerp(curvature[lo * 3 + 2], curvature[j * 3 + 2]) + tz * at,
      ),
    };
  };
  fn.lapT = lapT;
  fn.total = lapT * laps;
  return fn;
}

async function flyLine(course, r, rig) {
  const {
    makeRig, V, linePath, add, mul, dot, cross, norm, cl,
  } = rig;
  const wasmBytes = readFileSync(join(root, 'dist', 'sim.wasm'));
  const diffText = readFileSync(join(root, 'configs', 'betaflight-default.diff'), 'utf8');
  const { points, tangents } = r.dense;
  const timed = timedPath(r.dense, LAPS_FLOWN, V);
  const yaw0 = Math.atan2(-tangents[0], -tangents[2]);
  const craft = await makeRig({
    wasmBytes,
    diffText,
    colliders: null,
    field: null,
    spawn: V(points[0], 0, points[2]),
    spawnYaw: yaw0,
    groundY: 0,
    cell: 4.0,
  });
  /* Climb to the first point and arrive there, so the laps start on the line
   * and not from the floor. */
  craft.fly(
    linePath(craft.craft().p, V(points[0], points[1], points[2]), 2.5),
    { hover: HOVER },
  );
  const lead = craft.simMs();
  const race = new Race(gatesOf(course), course.trackClass);
  race.setRecordKey('raceline.check');
  race.reset();

  /*
   * The follower is the rig's guidance law (its thrust vector goes where a
   * position and a velocity error and the line's own acceleration send it, and
   * the craft's attitude is steered to that vector) with the two things the
   * rig's pilot does that a line does not need: it holds no heading, because
   * the plant does not care where the nose points, and its throttle trim
   * integrates HEIGHT error and not climb rate. The rig's integrates climb
   * rate, which is nothing at a hover, so a trim wound by an earlier moment
   * stayed wound and held the craft 0.8 m below the line for a minute
   * (RaceGOW5 Track 7, 2026-10-08) with its proportional term and the trim
   * cancelling to the digit.
   */
  let tau = 0;
  let rate = 1;
  let trim = 0;
  let prev = null;
  let worst = 0;
  let worstAt = 0;
  let sum = 0;
  let n = 0;
  const lapAt = [];
  let stopped = 0;
  let lostAt = 0;
  const budgetMs = Math.round(timed.total * TIME_BUDGET * 1000);
  for (let i = 0; i < budgetMs && race.lap < LAPS_FLOWN; i += 1) {
    const c = craft.craft();
    const ref = timed(tau);
    const ep = V(ref.p.x - c.p.x, ref.p.y - c.p.y, ref.p.z - c.p.z);
    const e = Math.hypot(ep.x, ep.y, ep.z);
    if (e > worst) {
      worst = e;
      worstAt = tau % timed.lapT;
    }
    sum += e;
    n += 1;
    const ev = V(ref.v.x * rate - c.v.x, ref.v.y * rate - c.v.y, ref.v.z * rate - c.v.z);
    const aLine = Math.hypot(ref.a.x, ref.a.y, ref.a.z);
    const ff = rate * rate * (aLine > FF_MAX ? FF_MAX / aLine : 1);
    const aCmd = add(mul(ref.a, ff), add(mul(ep, KP), mul(ev, KD)));
    const want = V(aCmd.x, aCmd.y + 9.81, aCmd.z);
    const up = Math.max(want.y, MIN_UP * 9.81);
    const room = up * Math.tan(TILT_MAX);
    const side = Math.hypot(want.x, want.z);
    const squeeze = side > room ? room / side : 1;
    const f = V(want.x * squeeze, up, want.z * squeeze);
    const b3 = c.up;
    const fwd = norm(c.fwd);
    const right = norm(cross(fwd, b3));
    const err = cross(b3, norm(f));
    const roll = cl((KA * Math.asin(cl(dot(err, fwd), -1, 1)) - DAMP * c.rates.p) / MAX_RATE, -1, 1);
    const pitch = cl((KA * Math.asin(cl(dot(err, right), -1, 1)) + DAMP * c.rates.q) / MAX_RATE, -1, 1);
    if (e < LEASH_STOP * 0.6) {
      trim = cl(trim + ep.y * 0.00002, -0.1, 0.1);
    }
    const thr = cl(HOVER * Math.sqrt(Math.max(0.02, dot(f, b3)) / 9.81) + trim, 0.02, 1);
    craft.hold(1, roll, pitch, 0, thr);
    /* The reference goes on round the line, as fast as the leash lets it. */
    rate = cl((LEASH_STOP - e) / (LEASH_STOP - LEASH_FREE), 0, 1);
    tau = Math.min(tau + 0.001 * rate, timed.total);
    stopped = rate === 0 ? stopped + 1 : 0;
    if (stopped > LOST_MS) {
      lostAt = i / 1000;
      break;
    }
    const now = craft.craft().p;
    const cur = { x: now.x, y: now.y, z: now.z };
    if (prev) {
      const lap = race.lap;
      race.update(prev, cur, craft.simMs() - lead, craft.simMs() - lead, true);
      if (race.lap > lap) {
        lapAt.push((craft.simMs() - lead) / 1000);
      }
    }
    prev = cur;
  }
  /* What the plant took per lap, against what the line's model says: the
   * time between the first credited lap and the last, over the laps between. */
  const flown = lapAt.length > 1 ? (lapAt[lapAt.length - 1] - lapAt[0]) / (lapAt.length - 1) : 0;
  return {
    worst,
    worstAt,
    mean: n ? sum / n : 0,
    laps: race.lap,
    lapT: timed.lapT,
    flownLapT: flown,
    lostAt,
  };
}

/* ------------------------------------------------------------------ *
 * the run
 * ------------------------------------------------------------------ */

const docs = presetsForClass('micro').filter((d) => d.name.toLowerCase().includes(want));
if (!docs.length) {
  console.error(`no whoop preset matches "${want}"`);
  process.exit(1);
}
console.log(`pace ${PACE.lateral} g of sideways load, cap ${PACE.cap} m/s; the aircraft sweeps ${CRAFT_SWEEP.toFixed(4)} m`);

let rigModule = null;
if (FLY) {
  rigModule = await import('./lib/flightrig.js');
}
const first = docs[0];
const ratios = [];
for (const doc of docs) {
  console.log(`\n${doc.name}`);
  const course = courseFromDocument(doc);
  const began = performance.now();
  const r = raceLineFor(course, {});
  const ms = performance.now() - began;
  check('a line is found', r.ok, r.reason);
  if (!r.ok) {
    continue;
  }
  check(
    'the solver calls it clean',
    r.clean,
    `strays ${r.strays} ${JSON.stringify(r.strayAt)}, short by ${r.shortBy.toFixed(3)} m`,
  );
  const verdict = verifyRaceLine(course, r);
  check('the real Race credits three laps of it', verdict.ok, `${verdict.laps} of ${verdict.wanted}`);

  /* The openings are judged as one list, a frame and a gap alike (see
   * openingOrder), and each kind again on its own so a failure names it. */
  const order = openingOrder(course, r.dense);
  const round = sameRound(order.all.found, order.all.expected);
  check(
    'it goes through the course\'s openings in order and through no other, never the wrong way',
    round.ok,
    round.why,
  );
  const builtRound = sameRound(order.built.found, order.built.expected);
  check('  of them the built gates', builtRound.ok, builtRound.why);
  const gapRound = sameRound(order.gaps.found, order.gaps.expected);
  check('  of them the gaps in the lattice', gapRound.ok, gapRound.why);

  const solids = solidsOf(course);
  check('every solid of the room is one the line can avoid', solids.unmodelled.length === 0, JSON.stringify(solids.unmodelled));
  const least = leastClearance(r.dense, solids);
  check(
    `the aircraft keeps ${CRAFT_SWEEP.toFixed(3)} m from every solid`,
    least >= CRAFT_SWEEP - CLEARANCE_SLACK,
    `least ${least.toFixed(3)} m`,
  );

  check(
    'it is quicker than the builder\'s own line through the same openings',
    r.lapS <= r.baselineS,
    `${r.lapS.toFixed(2)} s against ${r.baselineS.toFixed(2)} s`,
  );
  const board = BOARD_BEST_S[doc.name];
  if (board) {
    const ratio = r.lapS / board;
    ratios.push(ratio);
    check(
      `its lap is about the board's best (${board.toFixed(3)} s)`,
      ratio >= RATIO[0] && ratio <= RATIO[1],
      `${r.lapS.toFixed(2)} s, a ratio of ${ratio.toFixed(2)}`,
    );
  }

  const crumbs = crumbReport(r, course);
  check(
    `no two crumbs are more than ${CRUMB_GAP_MAX.toFixed(1)} m apart`,
    crumbs.gap <= CRUMB_GAP_MAX,
    `${crumbs.gap.toFixed(2)} m`,
  );
  check('the gates are on the crumbs in order', crumbs.ordered, JSON.stringify(Array.from(r.stationCrumb)));

  if (doc === first) {
    const again = raceLineFor(courseFromDocument(doc), {});
    let same = again.count === r.count;
    for (let i = 0; same && i < r.crumbs.length; i += 1) {
      same = r.crumbs[i] === again.crumbs[i];
    }
    check('a second solve is the same answer to the last bit', same);
  }

  console.log(`        lap ${r.lapS.toFixed(2)} s, ${r.count} crumbs, ${course.stations.length} gates, least clearance ${least.toFixed(3)} m, solved in ${ms.toFixed(0)} ms`);
  console.log(`        openings gone through: ${order.built.found.length} built, ${order.gaps.found.length} gaps; the solver counts ${r.strays} out of turn`);

  if (FLY) {
    // eslint-disable-next-line no-await-in-loop
    const fl = await flyLine(course, r, rigModule);
    /* Where the worst of it was, on the line's own terms: how far round the
     * lap, how tight and how slow the line is there. */
    const { time, curvature, speeds, count } = r.dense;
    let at = 0;
    while (at + 1 < count && time[at + 1] <= fl.worstAt) {
      at += 1;
    }
    const kappa = Math.hypot(curvature[at * 3], curvature[at * 3 + 1], curvature[at * 3 + 2]);
    const lost = fl.lostAt ? ` (on the floor from ${fl.lostAt.toFixed(0)} s)` : '';
    const pace = fl.flownLapT ? `${fl.flownLapT.toFixed(1)} s a lap against the line's ${fl.lapT.toFixed(1)} (${(fl.flownLapT / fl.lapT).toFixed(2)} times)` : 'too few laps to time one';
    console.log(`        flown through the plant: ${fl.laps} of ${LAPS_FLOWN} laps credited${lost}, ${pace}; error mean ${fl.mean.toFixed(2)} m, worst ${fl.worst.toFixed(2)} m at ${fl.worstAt.toFixed(1)} s of the lap (the line's radius there ${(1 / Math.max(kappa, 1e-6)).toFixed(2)} m, ${speeds[at].toFixed(2)} m/s)`);
    check('the plant flies the line and the race credits its laps', fl.laps >= LAPS_NEEDED, `${fl.laps} of ${LAPS_NEEDED} needed`);
  }
}

if (ratios.length) {
  const gm = Math.exp(ratios.reduce((a, x) => a + Math.log(x), 0) / ratios.length);
  console.log(`\nagainst the board's best on ${ratios.length} of them: geometric mean of the ratios ${gm.toFixed(2)}`);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
