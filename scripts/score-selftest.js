/*
 * score-selftest.js: the freestyle scoring system, proven in Node.
 *
 * Three things are checked here and they are three different kinds of
 * claim, which is why they are one file rather than three.
 *
 *   1. THE TRANSCRIPTION. src/game/tricks.js says it carries the owner's
 *      workbook. This reads the extracted workbook back out of
 *      .loop/evidence/freestyle-scoring/twp-calculator.json and compares
 *      it name for name and point for point. A catalogue that has drifted
 *      from its source is worse than no catalogue, because it still looks
 *      authoritative.
 *
 *   2. THE RECOGNISER. Synthetic body-rate traces are pushed through
 *      src/game/trickdetect.js one millisecond at a time, exactly as the
 *      shell pushes real ones, and the tricks that come out are compared
 *      against what was flown. This is the part that could silently be
 *      wrong forever: a detector that names a Rubik's Cube as three
 *      separate rolls still produces a score, just the wrong one.
 *
 *   3. THE ARITHMETIC. Sequences are scored through src/game/score.js and
 *      compared against totals worked out by hand from the workbook's own
 *      formulas, written out in the comments so the reader can check them
 *      without the spreadsheet open.
 *
 * Run: node scripts/score-selftest.js   (npm run score:selftest)
 * Exit code is the failure count, like the other selftests.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  TRICKS,
  BUILDING_BLOCKS,
  EXECUTION,
  OBSTACLE_BONUS,
  REPEAT_TRICK,
  REPEAT_OBSTACLE,
  backToBackFactor,
  obstacleBonusMultiplier,
  repeatTrickFactor,
  trickNames,
  trickPoints,
} from '../src/game/tricks.js';
import { PATTERNS, TrickDetector, snapTurns, AXIS_ROLL, AXIS_PITCH, AXIS_YAW } from '../src/game/trickdetect.js';
import { FreestyleScore, formatScore } from '../src/game/score.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = join(HERE, '..', '.loop', 'evidence', 'freestyle-scoring', 'twp-calculator.json');

let failures = 0;

function check(name, cond) {
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}`);
  }
}

function near(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

console.log('the transcription');
{
  const wb = JSON.parse(readFileSync(EVIDENCE, 'utf8'));

  check('the catalogue has every outdoor trick the workbook does',
    TRICKS.length === wb.outdoorTricks.length);
  let mismatched = 0;
  for (const row of wb.outdoorTricks) {
    const t = TRICKS.find((x) => x.name === row.trick);
    if (!t || t.points !== row.points || t.category !== row.category
      || t.difficulty !== row.difficulty) {
      mismatched += 1;
      console.log(`        drifted: ${row.trick}`);
    }
  }
  check('every trick matches the workbook on name, category, difficulty and points',
    mismatched === 0);

  check('the building blocks are all there',
    BUILDING_BLOCKS.length === wb.buildingBlocks.length);
  let blockMiss = 0;
  for (const row of wb.buildingBlocks) {
    const b = BUILDING_BLOCKS.find((x) => x.name === row.trick);
    if (!b || b.points !== row.points) {
      blockMiss += 1;
    }
  }
  check('every building block matches the workbook', blockMiss === 0);

  /* The five execution grades, from the Landing Page table. */
  const wbExec = new Map();
  for (const e of wb.trickExecution) {
    if (e.pointAdj != null && !wbExec.has(e.execution)) {
      wbExec.set(e.execution, e.pointAdj);
    }
  }
  let execMiss = 0;
  for (const [k, v] of wbExec) {
    if (!(k in EXECUTION)) {
      /* The Info Tables sheet restates the grades with two extra names,
       * GROUND TAP and FAIL, that are aliases of BUMP and CRASH at the
       * same values. The catalogue carries the five the calculator's own
       * dropdown uses. */
      continue;
    }
    if (!near(EXECUTION[k].points, v)) {
      execMiss += 1;
      console.log(`        drifted: ${k} ${EXECUTION[k].points} vs ${v}`);
    }
  }
  check('the execution adjustments match the workbook', execMiss === 0);

  /* The penalty ladders. The workbook tabulates each out to 50 rows; the
   * catalogue carries the part that varies and clamps the rest. */
  let repMiss = 0;
  for (const [priors, factor] of wb.repeatTrickPenalty) {
    if (!near(repeatTrickFactor(priors), factor)) {
      repMiss += 1;
    }
  }
  check('the repeat trick penalty matches the workbook at every row', repMiss === 0);

  let b2bMiss = 0;
  for (const [n, factor] of wb.backToBackPenalty) {
    /* Below 2^-30 the workbook's own tabulation has bottomed out at 0
     * where the halving has not; anything that small is zero on screen. */
    if (factor === 0) {
      continue;
    }
    if (!near(backToBackFactor(n), factor, 1e-12)) {
      b2bMiss += 1;
    }
  }
  check('the back to back halving matches the workbook at every row', b2bMiss === 0);

  let obsMiss = 0;
  for (const row of wb.obstacleBonus) {
    if (!near(obstacleBonusMultiplier(row.switches), row.multiplier)) {
      obsMiss += 1;
      console.log(`        drifted: ${row.switches} switches`);
    }
  }
  check('the obstacle bonus ladder matches the workbook', obsMiss === 0);

  check('the obstacle repeat table is the workbook\'s',
    REPEAT_OBSTACLE.join() === '1,1,1,1,0.66,0.33,0');
  check('the repeat trick table is the workbook\'s',
    REPEAT_TRICK.join() === '1,0.75,0.5,0');
  check('the ladder is stored lowest first', OBSTACLE_BONUS[0][0] === 0);
}

console.log('\nthe patterns name real tricks');
{
  const known = new Set(trickNames());
  let unknown = 0;
  for (const p of PATTERNS) {
    if (!known.has(p.name)) {
      unknown += 1;
      console.log(`        no such trick: ${p.name}`);
    }
  }
  check('every pattern names a trick in the catalogue', unknown === 0);
  /* trickPoints throws on an unknown name, which is the behaviour the
   * recogniser depends on to fail loudly rather than score zero. */
  let threw = false;
  try {
    trickPoints('Backflip McTwist');
  } catch {
    threw = true;
  }
  check('an unknown trick name throws rather than scoring zero', threw);
}

console.log('\nthe quarter turn snap');
{
  /* Upright at the end means a whole number of turns, whatever the
   * integral says: an overshot 372 degree roll is a Roll. */
  check('372 degrees ending upright is one turn', snapTurns(1.033, AXIS_ROLL, 1) === 1);
  check('340 degrees ending upright is one turn', snapTurns(0.944, AXIS_ROLL, 1) === 1);
  check('196 degrees ending inverted is a half', snapTurns(0.544, AXIS_ROLL, -1) === 0.5);
  check('160 degrees ending inverted is a half', snapTurns(0.444, AXIS_ROLL, -1) === 0.5);
  check('two turns ending upright is two', snapTurns(1.98, AXIS_PITCH, 1) === 2);
  check('a yaw takes the plain nearest quarter', snapTurns(0.51, AXIS_YAW, 1) === 0.5);
  check('a twitch is not a trick', snapTurns(0.08, AXIS_ROLL, 1) === 0);
  check('the sign does not change the count', snapTurns(-1.02, AXIS_ROLL, 1) === 1);
}

/*
 * The flight rig. Pushes a rate profile through the detector one
 * millisecond at a time and collects what it names.
 *
 * `fly` takes a list of moves. Each is an axis, a signed number of turns and
 * a peak rate, and it is flown as a trapezoid: ramp up over RAMP ms, hold,
 * ramp down. That is what a real stick input looks like and, more to the
 * point, it makes the detector cross RATE_ON and RATE_OFF the way a real
 * flight does rather than as a step function it could never see.
 *
 * The attitude fed alongside is not integrated from the rates. It is
 * SYNTHESISED from how much of the move has been flown, because all the
 * detector reads from the quaternion is which way up the craft is, and
 * building a full attitude integrator inside the test would be testing the
 * test. A move of a whole number of turns ends upright; a half ends
 * inverted.
 */
const TURN = 6.283185307179586;

function fly(moves) {
  const out = [];
  const det = new TrickDetector((t) => out.push(t));
  const RAMP = 60;

  const push = (ms, rate, axis, upZ, speed) => {
    for (let i = 0; i < ms; i += 1) {
      det.step(
        0.001,
        axis === AXIS_ROLL ? rate : 0,
        axis === AXIS_PITCH ? rate : 0,
        axis === AXIS_YAW ? rate : 0,
        /* Only the sign of upZ matters to the detector, and upZ is
         * 1 - 2(x^2 + y^2). Feeding x = 0 and y = sqrt((1 - upZ) / 2)
         * reproduces any upZ exactly with no trigonometry. */
        0, Math.sqrt(Math.max(0, (1 - upZ) / 2)),
        speed,
      );
    }
  };

  for (const m of moves) {
    if (m.wait !== undefined) {
      push(m.wait, 0, AXIS_ROLL, m.upZ ?? 1, m.speed ?? 12);
      continue;
    }
    const total = Math.abs(m.turns) * TURN;
    const peak = m.rate ?? 14;
    const sign = m.turns < 0 ? -1 : 1;
    /* Area of the trapezoid must equal the angle to fly, so the hold is
     * whatever is left after the two ramps have paid their half each. */
    const rampArea = peak * (RAMP / 1000);
    const holdMs = Math.max(1, Math.round(((total - rampArea) / peak) * 1000));
    /* The attitude is stepped with the move so that the sample at the
     * moment the run closes reads the end attitude. */
    const endUp = Math.abs(m.turns % 1) > 0.25 && Math.abs(m.turns % 1) < 0.75 ? -1 : 1;
    for (let i = 0; i < RAMP; i += 1) {
      push(1, sign * peak * (i / RAMP), m.axis, 1, m.speed ?? 12);
    }
    push(holdMs, sign * peak, m.axis, 0, m.speed ?? 12);
    for (let i = RAMP; i > 0; i -= 1) {
      push(1, sign * peak * (i / RAMP), m.axis, endUp, m.speed ?? 12);
    }
    /* A beat at zero rate at the end attitude, so the run can close. */
    push(m.gap ?? 120, 0, m.axis, endUp, m.speed ?? 12);
  }
  det.flush(1);
  return out;
}

const R = AXIS_ROLL;
const P = AXIS_PITCH;
const Y = AXIS_YAW;
const names = (list) => list.map((t) => t.name).join(' + ');

console.log('\nthe recogniser, on flown traces');
{
  check('a 360 roll is a Roll',
    names(fly([{ axis: R, turns: 1 }])) === 'Roll');
  check('a 360 flip is a Flip',
    names(fly([{ axis: P, turns: 1 }])) === 'Flip');
  check('a 360 yaw is a Yaw Spin',
    names(fly([{ axis: Y, turns: 1 }])) === 'Yaw Spin');
  check('a 720 roll is a Double Roll',
    names(fly([{ axis: R, turns: 2 }])) === 'Double Roll');
  check('a 720 flip is a Double Flip',
    names(fly([{ axis: P, turns: 2 }])) === 'Double Flip');
  check('a lone 180 roll is a building block',
    names(fly([{ axis: R, turns: 0.5 }])) === '1/2 Roll');
  check('a lone 90 roll is a building block',
    names(fly([{ axis: R, turns: 0.25 }])) === '1/4 Roll');
  check('a 540 roll is a Roll and then the leftover half',
    names(fly([{ axis: R, turns: 1.5 }])) === 'Roll + 1/2 Roll');

  check('half roll, whole flip, half roll the same way is a Rubik\'s Cube',
    names(fly([
      { axis: R, turns: 0.5 }, { axis: P, turns: 1 }, { axis: R, turns: 0.5 },
    ])) === "Rubik's Cube");
  check('half flip, whole roll, half flip the same way is a Cubik\'s Rube',
    names(fly([
      { axis: P, turns: 0.5 }, { axis: R, turns: 1 }, { axis: P, turns: 0.5 },
    ])) === "Cubik's Rube");
  check('half roll, whole yaw, half roll is an Inverted Yaw Spin',
    names(fly([
      { axis: R, turns: 0.5 }, { axis: Y, turns: 1 }, { axis: R, turns: 0.5 },
    ])) === 'Inverted Yaw Spin');
  check('half yaw, whole roll, half yaw is a Vanny Roll',
    names(fly([
      { axis: Y, turns: 0.5 }, { axis: R, turns: 1 }, { axis: Y, turns: 0.5 },
    ])) === 'Vanny Roll');
  check('180 out and 180 back is an Invert Rewind',
    names(fly([{ axis: R, turns: 0.5 }, { axis: R, turns: -0.5 }])) === 'Invert Rewind');
  check('a half flip nose down then a half roll is a Juicy Flick',
    names(fly([{ axis: P, turns: 0.5 }, { axis: R, turns: 0.5 }])) === 'Juicy Flick');
  check('a half flip nose up then a half roll is a Snapback',
    names(fly([{ axis: P, turns: -0.5 }, { axis: R, turns: 0.5 }])) === 'Snapback');

  /* The stall is the trick. Same two halves, the same way round, with and
   * without half a second of stall between them. */
  const segmented = fly([
    { axis: R, turns: 0.5 },
    { wait: 700, upZ: -1, speed: 1.0 },
    { axis: R, turns: 0.5, speed: 1.0 },
  ]);
  check('two halves the same way across a stall is a Segmented Flips/Rolls',
    names(segmented) === 'Segmented Flips/Rolls');
  const notSegmented = fly([
    { axis: R, turns: 0.5 },
    { axis: R, turns: 0.5 },
  ]);
  check('the same two halves with no stall is not',
    names(notSegmented) !== 'Segmented Flips/Rolls');

  /* Longest match wins. Flying the Rubik's Cube shape must not pay out as
   * three separate rotations, and the whole point of the buffer is that it
   * does not. */
  const cube = fly([
    { axis: R, turns: 0.5 }, { axis: P, turns: 1 }, { axis: R, turns: 0.5 },
  ]);
  check('the cube is one trick, not three', cube.length === 1);

  /* A pause longer than the settle window breaks the chain, so the same
   * three rotations flown slowly are three tricks. */
  const slow = fly([
    { axis: R, turns: 0.5, gap: 900 },
    { axis: P, turns: 1, gap: 900 },
    { axis: R, turns: 0.5, gap: 900 },
  ]);
  check('the same three flown slowly are three tricks', slow.length === 3);

  /* A whole roll cannot begin a longer pattern, so it names itself with no
   * settle wait at all. That is what keeps the popup prompt. */
  const oneRoll = fly([{ axis: R, turns: 1, gap: 30 }]);
  check('a whole roll names itself without waiting', oneRoll.length === 1);

  check('gentle attitude corrections are not tricks',
    fly([{ axis: R, turns: 0.05, rate: 2.0 }]).length === 0);

  /*
   * A bump MID ROTATION. The trick's own primitive does not exist yet when
   * the branch is clipped, so the buffer is empty and an earlier version of
   * the detector cleared the contact flag one millisecond later and scored
   * the trick CLEAN.
   */
  {
    const out = [];
    const det = new TrickDetector((t) => out.push(t));
    const peak = 14;
    const at = (rate, up) => det.step(0.001, rate, 0, 0, 0,
      Math.sqrt(Math.max(0, (1 - up) / 2)), 12);
    for (let i = 0; i < 60; i += 1) {
      at(peak * (i / 60), 1);
    }
    /* Halfway round, into a branch. */
    det.bump();
    for (let i = 0; i < 388; i += 1) {
      at(peak, 0);
    }
    for (let i = 60; i > 0; i -= 1) {
      at(peak * (i / 60), 1);
    }
    for (let i = 0; i < 700; i += 1) {
      at(0, 1);
    }
    det.flush(1);
    check('a roll flown into a branch is one Roll', names(out) === 'Roll');
    check('and it is graded BUMP, not CLEAN',
      out.length === 1 && out[0].execution === 'BUMP');
  }

  /* A bump long before a trick, with nothing buffered and nothing turning,
   * must not follow the pilot into the next one. */
  {
    const out = [];
    const det = new TrickDetector((t) => out.push(t));
    det.bump();
    for (let i = 0; i < 400; i += 1) {
      det.step(0.001, 0, 0, 0, 0, 0, 12);
    }
    const peak = 14;
    const at = (rate, up) => det.step(0.001, rate, 0, 0, 0,
      Math.sqrt(Math.max(0, (1 - up) / 2)), 12);
    for (let i = 0; i < 60; i += 1) {
      at(peak * (i / 60), 1);
    }
    for (let i = 0; i < 388; i += 1) {
      at(peak, 0);
    }
    for (let i = 60; i > 0; i -= 1) {
      at(peak * (i / 60), 1);
    }
    for (let i = 0; i < 300; i += 1) {
      at(0, 1);
    }
    det.flush(1);
    check('a bump between tricks does not follow into the next one',
      out.length === 1 && out[0].execution === 'CLEAN');
  }
}

console.log('\nthe arithmetic');
{
  /*
   * One clean Roll, on its own, banked.
   *   base 50, exec 1, repeat 1, back to back 1, streak 1  ->  50
   *   combo of one trick, multiplier 1                     ->  50
   */
  const s = new FreestyleScore();
  s.tick(0);
  s.land({ name: 'Roll', execution: 'CLEAN', endMs: 0 });
  s.tick(4000);
  check('one clean roll banks 50', s.total() === 50);

  /*
   * Four rolls in a row, all clean, no other trick between them.
   * Repeat penalty by count of priors: 1, 0.75, 0.5, 0.
   * Back to back run length 1, 2, 3, 4: 1, 0.5, 0.25, 0.125.
   * Streak: first is 1, then each grows by the previous RAW over 10000.
   *   #1 raw 50 * 1 * 1     = 50      streak 1        net 50
   *   #2 raw 50 * .75 * .5  = 18.75   streak 1.005    net 18.84375
   *   #3 raw 50 * .5 * .25  = 6.25    streak 1.0058   net 6.28609375
   *   #4 raw 50 * 0 * .125  = 0       streak 1.0064   net 0
   *   sum 75.12984375, multiplier 4  ->  300.51937500 -> 301
   */
  const four = new FreestyleScore();
  for (let i = 0; i < 4; i += 1) {
    four.tick(i * 500);
    four.land({ name: 'Roll', execution: 'CLEAN', endMs: i * 500 });
  }
  const raws = four.tricks.map((t) => t.raw);
  check('the repeat penalty falls 1, 0.75, 0.5, 0 across four rolls',
    four.tricks.map((t) => t.repeat).join() === '1,0.75,0.5,0');
  check('the back to back penalty halves each time',
    four.tricks.map((t) => t.b2b).join() === '1,0.5,0.25,0.125');
  check('the fourth identical roll is worth nothing', raws[3] === 0);
  check('the streak grows by the previous raw over 10000',
    near(four.tricks[1].streak, 1 + 50 / 10000));
  four.tick(9000);
  check('four rolls in a row bank 301', four.total() === 301);

  /*
   * The same four rotations, but flown as four different tricks. No repeat
   * penalty, no back to back penalty, and the combo multiplier is still 4.
   *   Roll 50, Flip 50, Yaw Spin 50, Double Roll 150, with the streak
   *   climbing 1, 1.005, 1.010, 1.015 -> 50 + 50.25 + 50.5 + 152.25
   *   = 303.0, times 4 = 1212
   */
  const varied = new FreestyleScore();
  const seq = ['Roll', 'Flip', 'Yaw Spin', 'Double Roll'];
  seq.forEach((n, i) => {
    varied.tick(i * 500);
    varied.land({ name: n, execution: 'CLEAN', endMs: i * 500 });
  });
  varied.tick(9000);
  check('four different tricks bank 1212, not 301', varied.total() === 1212);
  check('variety beats repetition by more than four times',
    varied.total() > four.total() * 4);

  /* Execution grades scale the trick and nothing else. */
  for (const [grade, factor] of [['CLEAN', 1], ['SLOPPY', 0.65], ['BUMP', 0.5], ['MISSED', 0], ['CRASH', 0]]) {
    const g = new FreestyleScore();
    g.tick(0);
    g.land({ name: 'Barani', execution: grade, endMs: 0 });
    g.tick(4000);
    check(`a ${grade} Barani scores ${Math.round(700 * factor)}`,
      g.total() === Math.round(700 * factor));
  }

  /* A bump halves the distance from the streak back down to one. */
  const bumped = new FreestyleScore();
  bumped.tick(0);
  bumped.land({ name: 'Barani', execution: 'CLEAN', endMs: 0 });
  bumped.tick(500);
  bumped.land({ name: 'Flip', execution: 'CLEAN', endMs: 500 });
  const grown = bumped.streak;
  bumped.tick(1000);
  bumped.land({ name: 'Roll', execution: 'BUMP', endMs: 1000 });
  check('a bump halves the streak\'s excess over one',
    near(bumped.streak, grown + (1 - grown) / 2));

  /* A crash loses the open combo and puts the streak back to one. */
  const bailed = new FreestyleScore();
  bailed.tick(0);
  bailed.land({ name: 'Barani', execution: 'CLEAN', endMs: 0 });
  bailed.tick(500);
  bailed.land({ name: 'Rollani', execution: 'CLEAN', endMs: 500 });
  const atRisk = bailed.view().combo.value;
  bailed.crash();
  check('the combo was worth something before the crash', atRisk > 2000);
  check('a crash banks nothing', bailed.total() === 0);
  check('a crash closes the combo', bailed.view().combo === null);
  bailed.tick(1000);
  bailed.land({ name: 'Flip', execution: 'CLEAN', endMs: 1000 });
  check('the streak is back to one after a crash', bailed.streak === 1);

  /* The combo multiplier is the length of the chain, capped. */
  const long = new FreestyleScore();
  for (let i = 0; i < 20; i += 1) {
    long.tick(i * 100);
    long.land({ name: 'Flip', execution: 'CLEAN', endMs: i * 100 });
  }
  check('the combo multiplier caps at 12', long.view().combo.mult === 12);

  /* With the combo layer off this is the competition sheet, exactly. */
  const sheet = new FreestyleScore({ comboEnabled: false });
  sheet.tick(0);
  sheet.land({ name: 'Roll', execution: 'CLEAN', endMs: 0 });
  sheet.tick(500);
  sheet.land({ name: 'Flip', execution: 'CLEAN', endMs: 500 });
  check('with the combo off, the score is the sum of the tricks',
    near(sheet.total(), 50 + 50 * (1 + 50 / 10000)));

  /* The summary a results screen would print. */
  const sum = varied.summary();
  check('the summary counts every trick', sum.tricks === 4);
  check('the summary counts unique tricks', sum.unique === 4);
  check('the summary leads with the biggest earner', sum.rows[0].name === 'Double Roll');
}

console.log('\nend to end');
{
  /*
   * A short run flown as rates, recognised, and scored: a Rubik's Cube,
   * a Double Roll and a Yaw Spin, linked inside the combo window.
   */
  const s = new FreestyleScore();
  const flown = [];
  const det = new TrickDetector((t) => {
    s.tick(t.endMs);
    s.land(t);
    flown.push(t.name);
  });
  const RAMP = 60;
  const push = (ms, p, q, r, upZ, speed) => {
    for (let i = 0; i < ms; i += 1) {
      det.step(0.001, p, q, r, 0, Math.sqrt(Math.max(0, (1 - upZ) / 2)), speed);
    }
  };
  const move = (axis, turns, endUp) => {
    const peak = 14;
    const sign = turns < 0 ? -1 : 1;
    const holdMs = Math.round(((Math.abs(turns) * TURN - peak * (RAMP / 1000)) / peak) * 1000);
    const at = (rate, up) => push(1,
      axis === AXIS_ROLL ? rate : 0,
      axis === AXIS_PITCH ? rate : 0,
      axis === AXIS_YAW ? rate : 0, up, 12);
    for (let i = 0; i < RAMP; i += 1) {
      at(sign * peak * (i / RAMP), 1);
    }
    for (let i = 0; i < holdMs; i += 1) {
      at(sign * peak, 0);
    }
    for (let i = RAMP; i > 0; i -= 1) {
      at(sign * peak * (i / RAMP), endUp);
    }
    push(150, 0, 0, 0, endUp, 12);
  };
  move(AXIS_ROLL, 0.5, -1);
  move(AXIS_PITCH, 1, -1);
  move(AXIS_ROLL, 0.5, 1);
  move(AXIS_ROLL, 2, 1);
  move(AXIS_YAW, 1, 1);
  det.flush(1);
  check('the run reads as three tricks',
    flown.join(' + ') === "Rubik's Cube + Double Roll + Yaw Spin");
  const before = s.view();
  check('the combo is open and worth something', before.combo && before.combo.mult === 3);
  s.tick(s.nowMs + 4000);
  check('flying away clean banks it', s.total() > 0 && s.view().combo === null);
  /*
   *   Rubik's Cube 325, streak 1                    -> 325
   *   Double Roll  150, streak 1 + 325/10000        -> 154.875
   *   Yaw Spin      50, streak 1.0325 + 150/10000   -> 52.375
   *   sum 532.25, multiplier 3                      -> 1596.75 -> 1597
   */
  check('and it banks 1597', s.total() === 1597);
  console.log(`        ${formatScore(s.total())} from ${flown.length} tricks`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures);
