/*
 * career-objectives.test.js: the lesson judges, driven with made up flights.
 *
 * Each case builds the frames a pilot would produce and checks the run says
 * what a pilot would expect: done when done, not before, and failed when the
 * lesson says a crash fails it.
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

import { createRun, matchesNeed, medalFor } from '../../src/career/objectives.js';
import { docToWorld, crossesDisc, attitude, v3 } from '../../src/career/geometry.js';
import { lessonById } from '../../src/career/curriculum.js';

const W = 160;
const D = 160;
const LEVEL = { fwd: v3(0, 0, -1), up: v3(0, 1, 0) };

/* A frame at a document point, heading north, level. */
function frame(t, doc, { landed = false, height, vel = v3(), prev, fwd, up, gate = null, lap = null, score = 0 } = {}) {
  const pos = docToWorld(W, D, doc[0], doc[1], doc[2] ?? 0);
  return {
    simMs: t,
    prev: prev ? docToWorld(W, D, prev[0], prev[1], prev[2] ?? 0) : pos,
    pos,
    vel,
    fwd: fwd || LEVEL.fwd,
    up: up || LEVEL.up,
    speed: Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z),
    height: height ?? (doc[2] ?? 0),
    landed,
    gate,
    lap,
    score,
  };
}

/* Feed a run frames every 16 ms from t0 for ms, at a fixed place. */
function hover(run, t0, ms, doc, extra = {}) {
  let t = t0;
  for (; t < t0 + ms; t += 16) {
    run.frame(frame(t, doc, extra));
  }
  return t;
}

test('geometry: a segment through a disc is seen, and its direction', () => {
  const c = v3(0, 3, 0);
  const n = v3(0, 0, -1);
  assert.equal(crossesDisc(v3(0, 3, 1), v3(0, 3, -1), c, n, 2), 1);
  assert.equal(crossesDisc(v3(0, 3, -1), v3(0, 3, 1), c, n, 2), -1);
  assert.equal(crossesDisc(v3(3, 3, 1), v3(3, 3, -1), c, n, 2), 0, 'outside the radius');
  assert.equal(crossesDisc(v3(0, 3, 1), v3(0, 3, 0.5), c, n, 2), 0, 'short of the plane');
});

test('geometry: attitude names level, knife edge and inverted', () => {
  const level = attitude(v3(0, 0, -1), v3(0, 1, 0));
  assert.ok(Math.abs(level.pitch) < 1e-9 && Math.abs(level.roll) < 1e-9 && Math.abs(level.tilt) < 1e-9);
  const knifeRight = attitude(v3(0, 0, -1), v3(1, 0, 0));
  assert.ok(Math.abs(knifeRight.roll - 90) < 1e-6, `right knife edge rolls +90, got ${knifeRight.roll}`);
  const inverted = attitude(v3(0, 0, -1), v3(0, -1, 0));
  assert.ok(Math.abs(inverted.tilt - 180) < 1e-6);
  const noseDown = attitude(v3(0, -0.5, -Math.sqrt(0.75)), v3(0, Math.sqrt(0.75), -0.5));
  assert.ok(Math.abs(noseDown.pitch + 30) < 1e-6);
});

test('1-1 Lift Off: takeoff, five seconds in the band, then a gentle landing', () => {
  const run = createRun(lessonById('1-1'), { W, D });
  let t = hover(run, 0, 500, [80, 25, 0], { landed: true, height: 0 });
  assert.equal(run.status().phase, 'ready', 'sitting on the pad is not flying yet');
  t = hover(run, t, 200, [80, 25, 0.8], { height: 0.8 });
  assert.equal(run.status().index, 1, 'took off');
  t = hover(run, t, 2000, [80, 25, 2], { height: 2 });
  assert.equal(run.status().index, 1, 'two seconds is not five');
  t = hover(run, t, 3200, [80, 25, 2], { height: 2 });
  assert.equal(run.status().index, 2, 'five seconds in the band');
  t = hover(run, t, 300, [80, 25, 0.5], { height: 0.5, vel: v3(0, -0.8, 0) });
  t = hover(run, t, 800, [80, 25, 0], { landed: true, height: 0 });
  const st = run.status();
  assert.equal(st.phase, 'complete');
  assert.ok(st.result.ms > 5000 && st.result.ms < 7000, `timed from takeoff, ${st.result.ms}`);
  assert.equal(st.medal, 'gold');
});

test('land: a hard touch does not count, a gentle one on the pad does', () => {
  const lesson = {
    id: 't-land',
    objectives: [{ kind: 'land', text: 'Land', pad: { at: [80, 40], r: 2 }, maxDescent: 1.5 }],
  };
  const run = createRun(lesson, { W, D });
  let t = hover(run, 0, 200, [80, 40, 3], { height: 3 });
  t = hover(run, t, 50, [80, 40, 0.3], { height: 0.3, vel: v3(0, -4, 0) });
  t = hover(run, t, 1000, [80, 40, 0], { landed: true, height: 0 });
  assert.equal(run.status().phase, 'flying', 'a 4 m/s touch is a crash landing');
  assert.equal(run.status().current.detail, 'hard');
  t = hover(run, t, 400, [80, 40, 2], { height: 2 });
  t = hover(run, t, 50, [86, 40, 0.3], { height: 0.3, vel: v3(0, -0.7, 0) });
  t = hover(run, t, 1000, [86, 40, 0], { landed: true, height: 0 });
  assert.equal(run.status().current.detail, 'offpad');
  t = hover(run, t, 400, [80, 40, 2], { height: 2 });
  t = hover(run, t, 50, [80, 40, 0.3], { height: 0.3, vel: v3(0, -0.7, 0) });
  hover(run, t, 1000, [80, 40, 0], { landed: true, height: 0 });
  assert.equal(run.status().phase, 'complete');
});

test('rings: in order, and a ring flown backwards does not count', () => {
  const lesson = {
    id: 't-rings',
    objectives: [{
      kind: 'rings', text: 'Rings',
      rings: [{ at: [80, 50, 3], yaw: Math.PI / 2, r: 2 }, { at: [80, 70, 3], yaw: Math.PI / 2, r: 2 }],
    }],
  };
  const run = createRun(lesson, { W, D });
  run.frame(frame(0, [80, 30, 3], { height: 3 }));
  /* Backwards through the first ring. */
  run.frame(frame(16, [80, 49, 3], { prev: [80, 51, 3], height: 3 }));
  assert.equal(run.status().current.state.index, 0);
  /* The second ring first does nothing either. */
  run.frame(frame(32, [80, 71, 3], { prev: [80, 69, 3], height: 3 }));
  assert.equal(run.status().current.state.index, 0);
  run.frame(frame(48, [80, 51, 3], { prev: [80, 49, 3], height: 3 }));
  run.frame(frame(64, [80, 71, 3], { prev: [80, 69, 3], height: 3 }));
  assert.equal(run.status().phase, 'complete');
});

test('face: four headings in turn, held', () => {
  const lesson = lessonById('1-3');
  const run = createRun(lesson, { W, D });
  let t = hover(run, 0, 100, [80, 25, 1.5], { height: 1.5 });
  const facing = (yawDeg) => {
    const y = (yawDeg * Math.PI) / 180;
    return v3(Math.cos(y), 0, -Math.sin(y));
  };
  for (const h of [0, -90, 180, 90]) {
    t = hover(run, t, 900, [80, 25, 1.5], { height: 1.5, fwd: facing(h) });
  }
  assert.equal(run.status().phase, 'complete');
});

test('a crash fails a lesson that says so, and only that one', () => {
  const strict = createRun({ id: 's', failOn: { crash: true }, objectives: [{ kind: 'speed', text: 'go', min: 10 }] }, { W, D });
  strict.frame(frame(0, [80, 40, 2], { height: 2 }));
  strict.crash();
  assert.equal(strict.status().phase, 'failed');
  assert.equal(strict.status().failReason, 'crash');
  const kind = createRun({ id: 'k', objectives: [{ kind: 'speed', text: 'go', min: 10 }] }, { W, D });
  kind.frame(frame(0, [80, 40, 2], { height: 2 }));
  kind.crash();
  assert.equal(kind.status().phase, 'flying');
  assert.equal(kind.status().crashes, 1);
});

test('tricks: direction and turns from the recogniser parts', () => {
  /* The signs the rig reads back off the real plant (tests/rig): a front
   * flip, pitch stick forward, is +1; a back flip is -1. */
  const backFlip = { name: 'Flip', axis: 'pitch', turns: 1, parts: [{ kind: 'rot', axis: 'pitch', dir: -1, turns: 1 }] };
  const frontFlip = { name: 'Flip', axis: 'pitch', turns: 1, parts: [{ kind: 'rot', axis: 'pitch', dir: 1, turns: 1 }] };
  const doubleRoll = { name: 'Double Roll', axis: 'roll', turns: 2, parts: [{ kind: 'rot', axis: 'roll', dir: 1, turns: 2 }] };
  assert.ok(matchesNeed({ axis: 'pitch', minTurns: 1, dir: 'back' }, backFlip));
  assert.ok(!matchesNeed({ axis: 'pitch', minTurns: 1, dir: 'back' }, frontFlip));
  assert.ok(matchesNeed({ axis: 'pitch', minTurns: 1, dir: 'forward' }, frontFlip));
  assert.ok(matchesNeed({ axes: ['pitch', 'roll'], minTurns: 2 }, doubleRoll));
  assert.ok(!matchesNeed({ axes: ['pitch', 'roll'], minTurns: 2 }, backFlip));
  assert.ok(matchesNeed({ names: ['Segmented Flips/Rolls'], axis: 'roll' }, { name: 'Segmented Flips/Rolls', axis: 'roll', parts: [{ axis: 'roll', dir: 1, turns: 0.5 }, { axis: 'roll', dir: 1, turns: 0.5 }] }));

  const run = createRun(lessonById('5-4'), { W, D });
  let t = hover(run, 0, 300, [80, 60, 8], { height: 8 });
  assert.equal(run.status().index, 1);
  run.trick({ name: 'Roll', axis: 'roll', turns: 1, parts: [{ kind: 'rot', axis: 'roll', dir: 1, turns: 1 }] });
  t = hover(run, t, 50, [80, 60, 8], { height: 8 });
  assert.equal(run.status().phase, 'flying', 'one way is half of both ways');
  run.trick({ name: 'Roll', axis: 'roll', turns: 1, parts: [{ kind: 'rot', axis: 'roll', dir: 1, turns: 1 }] });
  hover(run, t, 50, [80, 60, 8], { height: 8 });
  assert.equal(run.status().phase, 'flying', 'the same way twice is still one way');
  run.trick({ name: 'Roll', axis: 'roll', turns: 1, parts: [{ kind: 'rot', axis: 'roll', dir: -1, turns: 1 }] });
  hover(run, t + 100, 50, [80, 60, 8], { height: 8 });
  assert.equal(run.status().phase, 'complete');
});

test('orbit: two turns inside the band, not outside it', () => {
  const run = createRun(lessonById('3-4'), { W, D });
  const c = [80, 86];
  let t = 0;
  for (let i = 0; i <= 2 * 360; i += 3) {
    const a = (i * Math.PI) / 180;
    const p = [c[0] + 10 * Math.cos(a), c[1] + 10 * Math.sin(a), 4];
    run.frame(frame(t, p, { height: 4 }));
    t += 16;
  }
  assert.equal(run.status().phase, 'complete');
});

test('gaps: in order when the lesson says so', () => {
  const run = createRun(lessonById('4-3'), { W, D });
  hover(run, 0, 100, [80, 30, 3], { height: 3 });
  run.gap({ name: 'SIX METRE GAP' });
  hover(run, 200, 50, [80, 30, 3], { height: 3 });
  assert.equal(run.status().current.state.seen.length, 0, 'out of order');
  for (const n of ['WIDE GAP', 'SIX METRE GAP', 'FOUR METRE GAP']) {
    run.gap({ name: n });
  }
  hover(run, 300, 50, [80, 30, 3], { height: 3 });
  assert.equal(run.status().phase, 'complete');
});

test('medals: time thresholds, bronze for finishing', () => {
  const lesson = { medals: { gold: 10000, silver: 20000 } };
  assert.equal(medalFor(lesson, { complete: true, ms: 9000 }), 'gold');
  assert.equal(medalFor(lesson, { complete: true, ms: 15000 }), 'silver');
  assert.equal(medalFor(lesson, { complete: true, ms: 50000 }), 'bronze');
  assert.equal(medalFor(lesson, null), null);
  assert.equal(medalFor({ medals: { metric: 'score', gold: 3000, silver: 2000 } }, { complete: true, score: 2500 }), 'silver');
});
