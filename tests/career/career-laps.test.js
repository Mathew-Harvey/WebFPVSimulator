/*
 * career-laps.test.js: every race lesson's track can be lapped, and its
 * medal times ask for a speed a pilot can fly.
 *
 * Each lesson's track is built the way the game builds it
 * (src/game/trackdoc.js), handed to the game's own lap counter
 * (src/game/race.js) through src/game/raceline.js's gatesOf, which is the
 * same hand off the scene makes, and flown by a point that goes straight
 * through every opening in the flying order, along each one's own direction
 * of travel. No physics: this is the question "is there a lap in this
 * document at all", which the builder's warnings cannot answer, and
 * "is gold a speed", which the lesson's numbers alone cannot.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalize } from '../../src/trackbuilder/model.js';
import { courseFromDocument } from '../../src/game/trackdoc.js';
import { gatesOf } from '../../src/game/raceline.js';
import { Race } from '../../src/game/race.js';
import { allLessons } from '../../src/career/curriculum.js';
import { OFFICIAL_COURSES, OFFICIAL_UTT, officialDoc } from '../../src/career/tracks.js';
import { createRun } from '../../src/career/objectives.js';
import { MICRO_SCALE } from '../../configs/airframes.js';

/* How far before and after an opening the point flies square to it: three
 * metres on the field, and less than a metre in a room, where three would
 * put the point through the wall. */
const LEAD_M = { full: 3, micro: 0.6 };
/* The point's step: small against PASS_DEPTH, so nothing is tunnelled. */
const STEP_M = 0.05;
/*
 * The fastest a pilot holds round a small track's corners on average, in
 * m/s, and so the floor under every gold time: a 5 inch quad tops out near
 * 40 m/s on a straight, but a lap of tight gates averages a third of that
 * for a good pilot. A gold that needs more than this is a typo.
 */
const GOLD_AVG_MAX = 16;
/*
 * The same floor for the 65 mm whoop in a room: it tops out near 12 m/s,
 * but a lap of 28 inch gates in a ten by twelve metre room is turns from end
 * to end, and a good pilot averages well under half that.
 */
const WHOOP_GOLD_AVG_MAX = 5.5;
/* And a silver a beginner can reach: no slower on average than this. */
const SILVER_AVG_MIN = { full: 4, micro: 1.5 };

function raceOf(doc) {
  const { doc: norm } = normalize(doc);
  const course = courseFromDocument(norm);
  const race = new Race(gatesOf(course), course.trackClass || 'full');
  race.lead = LEAD_M[course.trackClass === 'micro' ? 'micro' : 'full'];
  return race;
}

/* The polyline for one lap: in square through each opening and out. */
function lapPoints(race) {
  const pts = [];
  const lead = race.lead;
  for (const g of race.gates) {
    const ap = g.apertures[0];
    const c = { x: g.x, y: g.y + ap.centreY, z: g.z };
    const d = g.az;
    pts.push({ x: c.x - d.x * lead, y: c.y - d.y * lead, z: c.z - d.z * lead });
    pts.push({ x: c.x + d.x * lead, y: c.y + d.y * lead, z: c.z + d.z * lead });
  }
  return pts;
}

function length(pts, closed = true) {
  let L = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    L += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return L;
}

/* Fly `laps` laps plus the opening gate along the points, at `speed` m/s on
 * a sim clock, and return what the race counted. */
function fly(race, laps, speed = 10) {
  const one = lapPoints(race);
  const path = [];
  for (let k = 0; k <= laps; k += 1) {
    path.push(...one);
  }
  path.push(one[0], one[1]);
  race.reset();
  let prev = { ...path[0] };
  let t = 0;
  let gates = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const n = Math.max(1, Math.ceil(L / STEP_M));
    for (let s = 1; s <= n; s += 1) {
      const u = s / n;
      const cur = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
      t += ((L / n) / speed) * 1000;
      const res = race.update(prev, cur, t, t, true);
      if (res.passed != null) {
        gates += 1;
      }
      prev = cur;
    }
  }
  return { laps: race.laps.length, gates, lapM: length(one) };
}

/*
 * Every race lesson the game can fly without the board: its own track, and
 * the fallback of one whose track is on the board (the board's own are
 * checked against copies in tests/career, see below). Laps are what a
 * lesson's gates objective needs to be done: its laps, two for a lap that
 * has to beat the one before it, and none for the start, which is gates.
 */
function lapsWanted(o) {
  if (o.count != null) {
    return 0;
  }
  if (o.beat != null) {
    return 2;
  }
  return o.laps ?? 1;
}

const seen = new Set();
const raceLessons = [];
for (const lesson of allLessons()) {
  for (const l of [lesson, lesson.fallback ? { ...lesson, ...lesson.fallback } : null]) {
    if (l && l.world.map === 'custom' && l.world.doc && l.objectives.some((o) => o.kind === 'gates')) {
      raceLessons.push(l);
    }
  }
}
for (const lesson of raceLessons) {
  const o = lesson.objectives.find((x) => x.kind === 'gates');
  const want = lapsWanted(o);
  test(`lesson ${lesson.id} (${lesson.world.doc.name}): ${want ? `${want} lap(s)` : `${o.count} gates`} can be flown and gold is a speed`, () => {
    const race = raceOf(lesson.world.doc);
    const flown = fly(race, Math.max(1, want));
    assert.ok(flown.laps >= want, `${flown.laps} laps counted of ${want}, ${flown.gates} gates`);
    /* The lesson's own judge agrees, fed the same laps, each one 300 ms
     * faster than the last and none further apart than that, so a lap to
     * beat is beaten and steady laps are steady. */
    const run = createRun(lesson, {
      W: lesson.world.doc.field.width, D: lesson.world.doc.field.depth, gatesPerLap: race.gates.length,
    });
    let simMs = 0;
    const frame = (extra) => run.frame({
      simMs, prev: { x: 0, y: 3, z: 0 }, pos: { x: 0, y: 3, z: 0 }, vel: { x: 0, y: 0, z: 0 },
      fwd: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, speed: 8, height: 3, landed: false, gate: null, lap: null, score: 0, ...extra,
    });
    frame({});
    if (want === 0) {
      for (let k = 0; k < o.count; k += 1) {
        simMs += 1500;
        frame({ gate: k });
      }
    }
    const lapMs = (k) => (o.steady != null ? 9000 - Math.min(o.steady / 2, 100) * k : 9000 - 300 * k);
    for (let k = 0; k < want; k += 1) {
      simMs += 9000;
      frame({ lap: { ms: lapMs(k) } });
    }
    assert.equal(run.status().phase, 'complete');
    /* Gold, less a run up, over the laps: an average speed. A room is
     * built MICRO_SCALE times life size round a whoop that flies in real
     * metres, so its lap is measured in those. The start's distance is the
     * pads to its last gate, which a lap's first gates stand for here. */
    const micro = (lesson.world.doc.trackClass || 'full') === 'micro';
    const lapM = flown.lapM / (micro ? MICRO_SCALE : 1);
    const metres = want ? lapM * want : (lapM * o.count) / Math.max(1, race.gates.length);
    const avg = metres / Math.max(1, (lesson.medals.gold - (want ? 2000 : 0)) / 1000);
    const max = micro ? WHOOP_GOLD_AVG_MAX : GOLD_AVG_MAX;
    assert.ok(avg <= max, `gold asks for ${avg.toFixed(1)} m/s average over ${lapM.toFixed(0)} m laps`);
    assert.ok(lesson.medals.silver > lesson.medals.gold, 'silver is slower than gold');
    seen.add(lesson.world.doc.id);
  });
}

for (const t of OFFICIAL_COURSES) {
  const what = t.preset ? 'UTT track' : (t.trackClass === 'micro' ? 'room' : 'track');
  test(`official ${what} ${t.id} laps${t.gold != null ? ', and its lap golds are a speed' : ''}`, () => {
    const raw = officialDoc(t);
    assert.equal(raw.id, t.docId, 'the index knows the document by its id');
    assert.equal(raw.trackClass, t.trackClass);
    const race = raceOf(raw);
    const flown = fly(race, 2);
    assert.ok(flown.laps >= 2, `${flown.laps} laps`);
    if (t.gold == null) {
      /* A UTT track has no medals until somebody flies it to a time; it
       * still has to lap, and it has its board. */
      assert.equal(t.silver, null);
      assert.match(t.board, /^LAP_UTT_TRACK_\d+$/);
      return;
    }
    /* A room is built MICRO_SCALE times life size round a whoop whose plant
     * flies in real metres (configs/airframes.js), so its lap is measured in
     * the room's own metres before it is a speed. */
    const lapM = flown.lapM / (t.trackClass === 'micro' ? MICRO_SCALE : 1);
    const avg = lapM / (t.gold / 1000);
    const max = t.trackClass === 'micro' ? WHOOP_GOLD_AVG_MAX : GOLD_AVG_MAX;
    if (process.env.LAP_REPORT) {
      console.log(`${t.id}: lap ${lapM.toFixed(1)} m, gold ${avg.toFixed(2)} m/s, silver ${(lapM / (t.silver / 1000)).toFixed(2)} m/s`);
    }
    assert.ok(avg <= max, `lap gold asks for ${avg.toFixed(1)} m/s over ${lapM.toFixed(0)} m`);
    assert.ok(t.silver > t.gold, 'silver is slower than gold');
    const slow = lapM / (t.silver / 1000);
    assert.ok(slow >= SILVER_AVG_MIN[t.trackClass], `silver is a crawl: ${slow.toFixed(2)} m/s`);
  });
}

test('the UTT tracks are all eight RaceGOW layouts, each once, named in track order', () => {
  assert.equal(OFFICIAL_UTT.length, 8);
  assert.deepEqual(OFFICIAL_UTT.map((t) => t.name), [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `UTT Track ${n}`));
  assert.equal(new Set(OFFICIAL_UTT.map((t) => t.docId)).size, 8);
  for (const t of OFFICIAL_UTT) {
    assert.ok(t.designer, `${t.id} names its builder`);
  }
});

/*
 * THE BOARD'S TRACKS. A lesson on a track from the board fetches it when it
 * opens, and this test cannot, so its laps were measured once with the
 * same polyline as above from the board's copy on 2026-10-28 and are kept
 * here: a lap in the room's own metres for a whoop, the field's for a five
 * inch. A track republished much longer or shorter wants its medals set
 * again, and this is where that shows.
 */
const BOARD_LAP_M = {
  'trk-69109146': { lapM: 22.9, micro: true },
  'trk-85c74ecc': { lapM: 25.9, micro: true },
  'trk-d16e93ac': { lapM: 457.8, micro: false },
};
for (const lesson of allLessons()) {
  if (!lesson.world.board || lesson.world.board.kind !== 'track') {
    continue;
  }
  test(`lesson ${lesson.id} on the board's ${lesson.world.board.id}: gold is a speed on its measured lap`, () => {
    const m = BOARD_LAP_M[lesson.world.board.id];
    assert.ok(m, 'its lap was measured');
    const laps = lesson.objectives.find((x) => x.kind === 'gates').laps ?? 1;
    const avg = (m.lapM * laps) / ((lesson.medals.gold - 2000) / 1000);
    assert.ok(avg <= (m.micro ? WHOOP_GOLD_AVG_MAX : GOLD_AVG_MAX), `gold asks for ${avg.toFixed(1)} m/s`);
    const slow = (m.lapM * laps) / ((lesson.medals.silver - 2500) / 1000);
    assert.ok(slow >= SILVER_AVG_MIN[m.micro ? 'micro' : 'full'], `silver is a crawl: ${slow.toFixed(2)} m/s`);
    assert.equal(lesson.airframe === 'whoop65', m.micro, 'a room is flown on the whoop, a field on the five inch');
  });
}
