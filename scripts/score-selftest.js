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

import { existsSync, readFileSync } from 'node:fs';
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
import {
  PATTERNS, TrickDetector, snapTurns, snapPathTurns,
  AXIS_ROLL, AXIS_PITCH, AXIS_YAW,
} from '../src/game/trickdetect.js';
import {
  ObstacleField, OB_BAR, OB_POLE, deriveObstacles, sameAxis,
} from '../src/game/obstacles.js';
import { FreestyleScore, formatScore } from '../src/game/score.js';
import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
/* The one and only conversion between the plant's frame and the world's,
 * imported rather than retyped: CLAUDE.md says it lives in one file and a
 * test that made its own copy would be the first place the two drifted. */
import { simPosToThree } from '../src/render/frame.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = join(HERE, '..', '.loop', 'evidence', 'freestyle-scoring', 'twp-calculator.json');
const WASM = join(HERE, '..', 'dist', 'sim.wasm');

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
  /* Ending the same way up as it started means a whole number of turns,
   * whatever the integral says: an overshot 372 degree roll is a Roll. */
  check('372 degrees, upright to upright, is one turn',
    snapTurns(1.033, AXIS_ROLL, 1, 1) === 1);
  check('340 degrees, upright to upright, is one turn',
    snapTurns(0.944, AXIS_ROLL, 1, 1) === 1);
  check('196 degrees, upright to inverted, is a half',
    snapTurns(0.544, AXIS_ROLL, 1, -1) === 0.5);
  check('160 degrees, upright to inverted, is a half',
    snapTurns(0.444, AXIS_ROLL, 1, -1) === 0.5);
  check('two turns, upright to upright, is two',
    snapTurns(1.98, AXIS_PITCH, 1, 1) === 2);
  check('a yaw takes the plain nearest quarter',
    snapTurns(0.51, AXIS_YAW, 1, 1) === 0.5);
  check('a twitch is not a trick', snapTurns(0.08, AXIS_ROLL, 1, 1) === 0);
  check('the sign does not change the count',
    snapTurns(-1.02, AXIS_ROLL, 1, 1) === 1);

  /*
   * THE CASE THE END-STATE RULE GOT WRONG. The middle of a Rubik's Cube is
   * a whole flip that BEGINS inverted and ends inverted. Read as an end
   * state that is a half turn, which would take the Cube apart.
   */
  check('a whole flip flown inverted is a whole turn',
    snapTurns(0.998, AXIS_PITCH, -1, -1) === 1);
  check('and still is when it is flown long',
    snapTurns(1.15, AXIS_PITCH, -1, -1) === 1);
  check('a half flip out of inverted is a half',
    snapTurns(0.53, AXIS_PITCH, -1, 1) === 0.5);
  check('a quarter roll ending on its side is a quarter',
    snapTurns(0.27, AXIS_ROLL, 1, 0) === 0.25);
  check('three quarters ending on its side is three quarters',
    snapTurns(0.72, AXIS_ROLL, 1, 0) === 0.75);
  check('a rotation begun on its side takes the plain quarter',
    snapTurns(0.51, AXIS_ROLL, 0, 1) === 0.5);
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
 * The attitude fed alongside is not integrated from the rates, because
 * building an attitude integrator inside the test would be testing the
 * test. It is CARRIED: the rig holds which way up the craft is and each
 * move flips it or does not, by the one rule that decides it in the real
 * world, which is that a rotation about a horizontal body axis inverts the
 * craft exactly when it covers a half-integer number of turns.
 *
 * That the attitude is carried rather than reset per move is the whole
 * point. The old rig started every move upright, which is false the moment
 * a trick has more than one part, and it hid a real defect in the snap:
 * see the comment on snapTurns. The real flight section below is the
 * independent check on this one, since there the attitude comes out of the
 * plant.
 */
const TURN = 6.283185307179586;

/* Which way up a move leaves the craft, given where it started. */
function endUpFor(curUp, axis, turns) {
  if (axis === AXIS_YAW) {
    return curUp;
  }
  const f = Math.abs(turns) % 1;
  if (f > 0.375 && f < 0.625) {
    return -curUp;
  }
  if (f < 0.125 || f > 0.875) {
    return curUp;
  }
  /* A quarter or three quarters leaves it on its side. */
  return 0;
}

function fly(moves) {
  const out = [];
  const det = new TrickDetector((t) => out.push(t));
  const RAMP = 60;
  let curUp = 1;

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
      push(m.wait, 0, AXIS_ROLL, m.upZ ?? curUp, m.speed ?? 12);
      continue;
    }
    const total = Math.abs(m.turns) * TURN;
    const peak = m.rate ?? 14;
    const sign = m.turns < 0 ? -1 : 1;
    /* Area of the trapezoid must equal the angle to fly, so the hold is
     * whatever is left after the two ramps have paid their half each. */
    const rampArea = peak * (RAMP / 1000);
    const holdMs = Math.max(1, Math.round(((total - rampArea) / peak) * 1000));
    const endUp = endUpFor(curUp, m.axis, m.turns);
    /* The run opens a few milliseconds into the ramp, so the start
     * attitude it records is the one pushed here. */
    for (let i = 0; i < RAMP; i += 1) {
      push(1, sign * peak * (i / RAMP), m.axis, curUp, m.speed ?? 12);
    }
    push(holdMs, sign * peak, m.axis, m.axis === AXIS_YAW ? curUp : 0, m.speed ?? 12);
    for (let i = RAMP; i > 0; i -= 1) {
      push(1, sign * peak * (i / RAMP), m.axis, endUp, m.speed ?? 12);
    }
    /* A beat at zero rate at the end attitude, so the run can close. */
    push(m.gap ?? 120, 0, m.axis, endUp, m.speed ?? 12);
    curUp = endUp;
  }
  det.flush(curUp);
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
  /*
   * THE CORNER TEST, in miniature. A quarter roll is a bank and a half yaw
   * spin is turning around, and the workbook's price list for those exists
   * for a judge pricing a DECLARED custom trick, not for a pilot flying a
   * line. Scoring them made six hard corners on the real aircraft read as
   * twelve tricks. See the comment on SINGLES.
   */
  check('a lone 90 roll is not a trick', fly([{ axis: R, turns: 0.25 }]).length === 0);
  check('a lone 90 flip is not a trick', fly([{ axis: P, turns: 0.25 }]).length === 0);
  check('a lone 180 yaw is not a trick', fly([{ axis: Y, turns: 0.5 }]).length === 0);
  check('a lone 270 yaw is not a trick', fly([{ axis: Y, turns: 0.75 }]).length === 0);
  check('but a lone 180 roll still is',
    names(fly([{ axis: R, turns: 0.5 }])) === '1/2 Roll');
  check('and a whole yaw spin still is',
    names(fly([{ axis: Y, turns: 1 }])) === 'Yaw Spin');
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

  /*
   * DOES IT ACTUALLY REWARD STRINGING TRICKS TOGETHER? That is the whole
   * point of putting a combo layer on top of the workbook, so it is checked
   * rather than assumed. Six tricks, flown as one chain and flown as six
   * separate ones, and the marginal value of every trick added to a chain.
   */
  const chainOf = (list, gapMs) => {
    const s = new FreestyleScore();
    let t = 0;
    for (const n of list) {
      t += gapMs;
      s.tick(t);
      s.land({ name: n, execution: 'CLEAN', endMs: t });
    }
    s.tick(t + 5000);
    return s.total();
  };
  const SIX = ['Roll', 'Flip', 'Yaw Spin', 'Double Roll', 'Powerloop', 'Matty Flip'];
  const linked = chainOf(SIX, 1500);
  const apart = chainOf(SIX, 4000);
  check('six tricks linked beat the same six flown apart', linked > apart);
  check('and by a lot: at least four times', linked >= apart * 4);
  console.log(`        six linked ${formatScore(linked)} against ${formatScore(apart)} apart, `
    + `x${(linked / apart).toFixed(1)}`);

  /* Every trick added to a chain must be worth adding, or a pilot is better
   * off stopping, which is the opposite of the intent. */
  const POOL = ['Roll', 'Flip', 'Yaw Spin', 'Double Roll', 'Powerloop', 'Matty Flip',
    'Split-S', 'Wall Ride', 'Knife Edge', 'Dive', 'Cradle', 'Jump Rope',
    'Barani', 'Immelmann Turn'];
  let monotonic = true;
  let prevTotal = 0;
  for (let n = 1; n <= POOL.length; n += 1) {
    const v = chainOf(POOL.slice(0, n), 1500);
    if (v <= prevTotal) {
      monotonic = false;
    }
    prevTotal = v;
  }
  check('a longer chain is always worth more, out to fourteen tricks', monotonic);
  console.log(`        fourteen linked banks ${formatScore(prevTotal)}`);

  /* And padding a chain with the same cheap trick must not beat flying. */
  const eightSame = chainOf(Array(8).fill('Powerloop'), 1500);
  const eightVaried = chainOf(POOL.slice(0, 8), 1500);
  check('eight different tricks beat the same trick eight times',
    eightVaried > eightSame * 2.5);
  console.log(`        eight varied ${formatScore(eightVaried)} against `
    + `${formatScore(eightSame)} repeated`);

  /* The gamble has to be real: the chain must be worth losing. */
  {
    const s = new FreestyleScore();
    let t = 0;
    for (const n of POOL.slice(0, 8)) {
      t += 1500;
      s.tick(t);
      s.land({ name: n, execution: 'CLEAN', endMs: t });
    }
    const atRisk = s.view().combo.value;
    s.crash();
    check('bailing an eight trick chain costs the whole chain',
      atRisk === eightVaried && s.total() === 0);
    console.log(`        bailing there costs ${formatScore(atRisk)}`);
  }

  /* The summary a results screen would print. */
  const sum = varied.summary();
  check('the summary counts every trick', sum.tricks === 4);
  check('the summary counts unique tricks', sum.unique === 4);
  check('the summary leads with the biggest earner', sum.rows[0].name === 'Double Roll');
}

console.log('\nend to end, on a synthetic trace');
{
  /*
   * A short run flown as rates, recognised, and scored: a Rubik's Cube, a
   * Double Roll and a Yaw Spin, linked inside the combo window. It goes
   * through the same fly() rig as the recogniser checks above rather than a
   * second copy of one, because the second copy was where the old attitude
   * bug hid.
   */
  const flown = fly([
    { axis: R, turns: 0.5 }, { axis: P, turns: 1 }, { axis: R, turns: 0.5 },
    { axis: R, turns: 2 },
    { axis: Y, turns: 1 },
  ]);
  check('the run reads as three tricks',
    names(flown) === "Rubik's Cube + Double Roll + Yaw Spin");

  const s = new FreestyleScore();
  for (const t of flown) {
    s.tick(t.endMs);
    s.land(t);
  }
  const before = s.view();
  check('the combo is open and worth something', Boolean(before.combo) && before.combo.mult === 3);
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

console.log('\nthe obstacle field');
{
  /* A hand built field, so near() and sameAxis can be checked exactly. */
  const f = new ObstacleField();
  f.add(OB_BAR, 0, 6, 0, 1, 0, 0, 8);
  f.add(OB_POLE, 40, 5, 0, 0, 1, 0, 5);
  f.build();
  check('the field holds what was put in it', f.count === 2);
  check('and knows what kind each is', f.countOf(OB_BAR) === 1 && f.countOf(OB_POLE) === 1);
  check('a craft under the bar finds the bar',
    f.near(0, 2, 0) === f.items[0]);
  check('a craft beside the pole finds the pole',
    f.near(44, 5, 0) === f.items[1]);
  check('a craft far from both finds nothing', f.near(0, 5, 300) === null);
  check('and one past the end of the bar finds nothing',
    f.near(60, 6, 0) === null);

  /*
   * COLLINEAR SEGMENTS ARE ONE OBSTACLE. The town builds a railing out of
   * an 8 m piece, a 17 m piece and another 8 m piece, and a pilot looping
   * the join must not have the loop cut in half because engagement stepped
   * from one collider to the next.
   */
  const a = { kind: OB_BAR, cx: 0, cy: 6, cz: 0, dx: 1, dy: 0, dz: 0, half: 4 };
  const b = { kind: OB_BAR, cx: 9, cy: 6, cz: 0, dx: 1, dy: 0, dz: 0, half: 4 };
  const c = { kind: OB_BAR, cx: 0, cy: 6, cz: 6, dx: 1, dy: 0, dz: 0, half: 4 };
  const d = { kind: OB_BAR, cx: 0, cy: 6, cz: 0, dx: 0, dy: 0, dz: 1, half: 4 };
  check('two rails end to end are the same line', sameAxis(a, b));
  check('two parallel rails six metres apart are not', !sameAxis(a, c));
  check('two rails at right angles are not', !sameAxis(a, d));

  /*
   * DERIVATION FROM COLLIDERS. The shapes below are the ones the city
   * actually contains: a 0.16 m lamp post, a 0.1 m fence rail at 1.5 m, a
   * building wall, a kerb, and a wall box that reaches sixty metres
   * underground, which is what the ground clamp exists for.
   */
  const boxes = {
    /* Opposite corners, minimum then maximum, the way Colliders stores a
     * box. In order: a 0.16 m lamp post, an 18 m fence rail at 1.5 m, a
     * building wall, a kerb, a wall box reaching sixty metres underground,
     * and a low slab. */
    fbox: [1, 1, 1, 1, 1, 1],
    fax: [0, 10, 30, 50, 70, 90],
    fay: [0, 1.5, 0, 0, -60, 0.4],
    faz: [0, 0, 0, 0, 0, 0],
    fbx: [0.16, 28.4, 38, 90, 70.7, 92],
    fby: [4.2, 1.6, 9, 0.14, 0.2, 0.5],
    fbz: [0.16, 0.1, 0.4, 6, 0.7, 3],
  };
  const got = deriveObstacles(boxes, () => 0);
  check('a lamp post is a pole', got.countOf(OB_POLE) === 1);
  check('a fence rail with daylight under it is a bar', got.countOf(OB_BAR) === 1);
  check('a building wall, a kerb and a slab are neither', got.count === 2);
  const buried = deriveObstacles(
    { fbox: [1], fax: [0], fay: [-60], faz: [0], fbx: [0.7], fby: [0.2], fbz: [0.7] },
    () => 0,
  );
  check('a box that reaches sixty metres underground is not a four metre pole',
    buried.count === 0);
  const low = deriveObstacles(
    { fbox: [1], fax: [0], fay: [0.4], faz: [0], fbx: [8], fby: [0.5], fbz: [0.1] },
    () => 0,
  );
  check('a rail too low to fly under is not a bar', low.count === 0);
}

console.log('\nthe lap snap');
{
  /* Same shape as the attitude snap, decided by which side of the rail the
   * craft came out on rather than by which way up it ended. */
  check('under to under, one turn, is a lap',
    snapPathTurns(1.06, OB_BAR, -1, -1) === 1);
  check('and still is when the geometry stretches it to 1.3',
    snapPathTurns(1.3, OB_BAR, -1, -1) === 1);
  check('over to under, half a turn, is half a lap',
    snapPathTurns(0.52, OB_BAR, 1, -1) === 0.5);
  check('under to over is half a lap too',
    snapPathTurns(0.44, OB_BAR, -1, 1) === 0.5);
  /*
   * THE FLY-BY. A quad going straight past a rail sweeps up to half a turn
   * of angle at that rail, and goes in under it and comes out under it.
   * Same side means a whole number of turns, and half a turn is not one.
   * Rejected outright rather than rounded, which is the difference between
   * this snap and the attitude one.
   */
  check('a half turn that came out the side it went in is not a lap',
    snapPathTurns(0.5, OB_BAR, -1, -1) === 0);
  check('nor is a third of a turn', snapPathTurns(0.33, OB_BAR, 1, 1) === 0);
  check('a pole takes the plain nearest quarter, having no sides',
    snapPathTurns(1.98, OB_POLE, 0, 0) === 2);
}

/*
 * THE OBSTACLE TRICKS, on constructed paths.
 *
 * The flights here are geometry, not physics: an arc of a given radius
 * about a given axis, with a stated amount of rotation happening at the
 * same time. That is deliberate. What is under test is the GRAMMAR, that a
 * full lap from under with a flip is a Powerloop and the same lap without
 * the flip is a Maverick Loop, and a real aircraft cannot fly those two
 * distinctly enough to tell one test failure from one bad flight. The real
 * aircraft flies a Powerloop further down, which is the check that the
 * geometry here is reachable at all.
 */
console.log('\nthe obstacle tricks, on constructed paths');
{
  const BAR = { cx: 0, cy: 6, cz: 0 };
  const POLE = { cx: 0, cy: 6, cz: 0 };
  const barField = () => {
    const f = new ObstacleField();
    f.add(OB_BAR, BAR.cx, BAR.cy, BAR.cz, 1, 0, 0, 8);
    return f.build();
  };
  const poleField = () => {
    const f = new ObstacleField();
    f.add(OB_POLE, POLE.cx, POLE.cy, POLE.cz, 0, 1, 0, 5);
    return f.build();
  };

  class Path {
    constructor(field) {
      this.out = [];
      this.det = new TrickDetector((t) => this.out.push(t), field);
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.upZ = 1;
    }
    feed(p, q, r) {
      this.det.step(0.001, p, q, r, 0, Math.sqrt(Math.max(0, (1 - this.upZ) / 2)),
        12, this.x, this.y, this.z);
    }
    cruise(ms, vz) {
      for (let i = 0; i < ms; i += 1) {
        this.z += vz * 0.001;
        this.feed(0, 0, 0);
      }
    }
    /* Fly straight to where an arc begins, so the winding sees no jump. */
    approach(ob, radius, startAngle, ms, speed, vertical) {
      if (vertical) {
        this.x = ob.cx + radius * Math.cos(startAngle);
        this.y = ob.cy;
        this.z = ob.cz + radius * Math.sin(startAngle) + speed * (ms / 1000);
      } else {
        this.x = ob.cx;
        this.y = ob.cy - radius * Math.cos(startAngle);
        this.z = ob.cz + radius * Math.sin(startAngle) + speed * (ms / 1000);
      }
      this.cruise(ms, -speed);
    }
    /* An arc in the vertical plane, about a bar running along x. */
    arcBar(ob, radius, startAngle, turns, ms, rot, flip) {
      for (let i = 0; i < ms; i += 1) {
        const a = startAngle + (turns * TURN * i) / ms;
        this.x = ob.cx;
        this.y = ob.cy - radius * Math.cos(a);
        this.z = ob.cz + radius * Math.sin(a);
        if (flip) {
          this.upZ = Math.cos(flip * (i / ms) * TURN);
        }
        this.feed(
          ((rot[0] ?? 0) * TURN) / (ms / 1000),
          ((rot[1] ?? 0) * TURN) / (ms / 1000),
          ((rot[2] ?? 0) * TURN) / (ms / 1000),
        );
      }
    }
    /* An orbit in the horizontal plane, about a vertical pole. */
    arcPole(ob, radius, startAngle, turns, ms, rot, upZ) {
      for (let i = 0; i < ms; i += 1) {
        const a = startAngle + (turns * TURN * i) / ms;
        this.x = ob.cx + radius * Math.cos(a);
        this.y = ob.cy;
        this.z = ob.cz + radius * Math.sin(a);
        if (upZ !== undefined) {
          this.upZ = upZ;
        }
        this.feed(
          ((rot[0] ?? 0) * TURN) / (ms / 1000),
          ((rot[1] ?? 0) * TURN) / (ms / 1000),
          ((rot[2] ?? 0) * TURN) / (ms / 1000),
        );
      }
    }
    spin(axis, turns, ms, endUp) {
      const rate = (turns * TURN) / (ms / 1000);
      for (let i = 0; i < ms; i += 1) {
        this.feed(axis === 0 ? rate : 0, axis === 1 ? rate : 0, axis === 2 ? rate : 0);
      }
      if (endUp !== undefined) {
        this.upZ = endUp;
      }
      for (let i = 0; i < 200; i += 1) {
        this.feed(0, 0, 0);
      }
    }
    finish() {
      this.det.flush(this.upZ);
      return this.out.map((t) => t.name).join(' + ') || 'NOTHING';
    }
  }

  /* Under the rail, all the way round it, flipping with the loop. */
  {
    const s = new Path(barField());
    s.approach(BAR, 4, 0, 500, 8, false);
    s.arcBar(BAR, 4, 0, -1, 1400, [0, 1, 0], 1);
    s.cruise(900, -8);
    check('a full lap from under, flipping, is a Powerloop', s.finish() === 'Powerloop');
  }
  /* The same lap flown facing forward: no flip. */
  {
    const s = new Path(barField());
    s.approach(BAR, 4, 0, 500, 8, false);
    s.arcBar(BAR, 4, 0, -1, 1400, [0, 0, 0], 0);
    s.cruise(900, -8);
    check('the same lap without the flip is a Maverick Loop',
      s.finish() === 'Maverick Loop');
  }
  /* Over the rail, half a front flip, out underneath. */
  {
    const s = new Path(barField());
    s.approach(BAR, 4, Math.PI, 500, 8, false);
    s.arcBar(BAR, 4, Math.PI, 0.5, 800, [0, 0.5, 0], 0.5);
    s.cruise(900, -8);
    check('half a lap from over, half flipping, is a Matty Flip',
      s.finish() === 'Matty Flip');
  }
  {
    const s = new Path(barField());
    s.approach(BAR, 4, Math.PI, 500, 8, false);
    s.arcBar(BAR, 4, Math.PI, 0.5, 800, [0, 0, 0], 0);
    s.cruise(900, -8);
    check('the same flown flat is a Beginner Matty',
      s.finish() === 'Beginner Matty');
  }
  {
    const s = new Path(barField());
    s.approach(BAR, 4, Math.PI, 500, 8, false);
    s.arcBar(BAR, 4, Math.PI, 0.5, 800, [0.5, 0.5, 0], 0.5);
    s.cruise(900, -8);
    check('and with a roll in it is a Split-S', s.finish() === 'Split-S');
  }
  /* Half a loop up from under, then the roll that finishes it. */
  {
    const s = new Path(barField());
    s.approach(BAR, 4, 0, 500, 8, false);
    s.arcBar(BAR, 4, 0, -0.5, 800, [0, 0.5, 0], 0.5);
    s.upZ = -1;
    s.spin(0, 0.5, 250, 1);
    s.cruise(900, -8);
    check('half a lap from under and then a roll is an Immelmann Turn',
      s.finish() === 'Immelmann Turn');
  }
  /* Two laps of a pole with the nose tracking it. */
  {
    const s = new Path(poleField());
    s.approach(POLE, 5, 0, 500, 8, true);
    s.arcPole(POLE, 5, 0, 2, 3000, [0, 0, 2], 1);
    s.cruise(900, -8);
    check('two laps of a pole with the nose tracking is an Orbit x2',
      s.finish() === 'Orbit x2');
  }
  {
    const s = new Path(poleField());
    s.approach(POLE, 5, 0, 500, 8, true);
    s.upZ = -1;
    s.arcPole(POLE, 5, 0, 2, 3000, [0, 0, 2], -1);
    s.cruise(900, -8);
    check('the same flown inverted is a Trippy Spin x2',
      s.finish() === 'Trippy Spin x2');
  }

  /*
   * AND THE CASES THAT MUST NOT SCORE. These matter more than the eight
   * above: an obstacle recogniser that pays out for flying past a lamp post
   * would make the whole score meaningless in a town with 886 of them.
   */
  {
    const s = new Path(barField());
    s.x = 0;
    s.y = BAR.cy - 5;
    s.z = BAR.cz + 9;
    s.cruise(300, 0);
    s.spin(1, 1, 500, 1);
    s.cruise(900, 0);
    check('a plain flip beside a rail is still just a Flip', s.finish() === 'Flip');
  }
  {
    const s = new Path(barField());
    s.x = 0;
    s.y = BAR.cy - 3;
    s.z = BAR.cz + 40;
    s.cruise(4000, -20);
    check('flying straight under a rail scores nothing', s.finish() === 'NOTHING');
  }
  {
    const s = new Path(poleField());
    s.x = POLE.cx + 4;
    s.y = POLE.cy;
    s.z = POLE.cz + 40;
    s.cruise(4000, -20);
    check('flying straight past a pole scores nothing', s.finish() === 'NOTHING');
  }
}

/*
 * THE REAL AIRCRAFT.
 *
 * Everything above drives the recogniser with rate profiles this file made
 * up. That proves the grammar and the arithmetic and it proves nothing at
 * all about whether a pilot flying the actual quad can score a point,
 * because the rates a pilot produces come out of Betaflight's rate curve,
 * the PID loop, the mixer and the plant, and none of those has been in the
 * loop until here.
 *
 * So this section loads dist/sim.wasm, arms it, and FLIES. Sticks go in at
 * 500 Hz on a grid, the module steps a millisecond at a time, and the
 * detector is fed the same six numbers the shell feeds it out of the same
 * state block. The stick is held until the integrated body rate reaches the
 * target and then centred, which is what a pilot does with their eyes.
 * Nothing is synthesised: the attitude the snap reads is the plant's own.
 *
 * SKIPPED, loudly, when dist/sim.wasm is absent, because a missing module
 * is a fault in the setup rather than in this code, and a check that
 * quietly passes on no module is worse than no check.
 */
console.log('\nend to end, on the real aircraft');
if (!existsSync(WASM)) {
  console.log('  SKIP  dist/sim.wasm is not built, so nothing was flown');
} else {
  const wasm = readFileSync(WASM);
  const diff = readFileSync(join(HERE, '..', 'configs', 'betaflight-default.diff'), 'utf8');

  /* One rig per trial, so a trial cannot inherit the last one's attitude. */
  const rig = async (field = null) => {
    const sim = await loadSim(wasm);
    if (sim.init(diff) !== SIM_OK) {
      throw new Error('sim_init failed');
    }
    sim.reset();
    const out = [];
    const det = new TrickDetector((t) => out.push(t), field);
    const track = [];
    let stepIdx = 0;
    let rcNext = 0;
    /* simPosToThree writes into anything with a set(x, y, z); a plain
     * object saves pulling Three into a Node test. */
    const w = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    const ms = (roll, pitch, yaw, thr) => {
      const t = stepIdx / 1000;
      if (t >= rcNext) {
        sim.input(t, roll, pitch, yaw, thr);
        rcNext += 0.002;
      }
      sim.step(1);
      stepIdx += 1;
      const st = sim.readState().state;
      simPosToThree(st[1], st[2], st[3], w);
      track.push([w.x, w.y, w.z]);
      det.step(0.001, st[11], st[12], st[13], st[8], st[9],
        Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]), w.x, w.y, w.z);
      return st;
    };
    const upZ = () => {
      const st = sim.readState().state;
      return 1 - 2 * (st[8] * st[8] + st[9] * st[9]);
    };
    /* Hold the stick until the rotation is flown, then let go. */
    /* `busy` holds the OTHER axes off centre, so a trick can be flown the
     * way one really is, with the pilot still correcting. */
    const rotate = (axis, turns, sign, thr = 0.5, busy = {}) => {
      let acc = 0;
      let n = 0;
      while (Math.abs(acc) < Math.abs(turns) * TURN && n < 6000) {
        const st = ms(
          axis === 'roll' ? sign : (busy.roll ?? 0),
          axis === 'pitch' ? sign : (busy.pitch ?? 0),
          axis === 'yaw' ? sign : (busy.yaw ?? 0),
          thr,
        );
        acc += (axis === 'roll' ? st[11] : axis === 'pitch' ? st[12] : st[13]) * 0.001;
        n += 1;
      }
      return acc / TURN;
    };
    const hold = (n, thr = 0.5, roll = 0, pitch = 0, yaw = 0) => {
      for (let i = 0; i < n; i += 1) {
        ms(roll, pitch, yaw, thr);
      }
    };
    const done = () => {
      hold(700);
      det.flush(upZ());
      return out;
    };
    return { ms, rotate, hold, upZ, done, out, track, state: () => sim.readState().state };
  };

  const flightNames = (list) => list.map((t) => t.name).join(' + ');

  {
    const f = await rig();
    f.hold(250);
    f.rotate('roll', 1, 1);
    check('a flown 360 roll is a Roll', flightNames(f.done()) === 'Roll');
  }
  {
    const f = await rig();
    f.hold(250);
    f.rotate('pitch', 1, 1);
    check('a flown backflip is a Flip', flightNames(f.done()) === 'Flip');
  }
  {
    const f = await rig();
    f.hold(250);
    f.rotate('pitch', 1, -1);
    check('a flown front flip is a Flip', flightNames(f.done()) === 'Flip');
  }
  {
    const f = await rig();
    f.hold(250);
    f.rotate('yaw', 1, 1);
    check('a flown 360 yaw is a Yaw Spin', flightNames(f.done()) === 'Yaw Spin');
  }
  {
    const f = await rig();
    f.hold(250);
    f.rotate('roll', 2, 1);
    check('a flown 720 roll is a Double Roll', flightNames(f.done()) === 'Double Roll');
  }
  {
    const f = await rig();
    f.hold(250);
    f.rotate('roll', 0.5, 1);
    check('a flown 180 roll is a building block', flightNames(f.done()) === '1/2 Roll');
  }
  {
    const f = await rig();
    f.hold(250);
    f.rotate('roll', 0.5, 1);
    f.hold(80);
    f.rotate('roll', 0.5, -1);
    check('a flown 180 out and back is an Invert Rewind',
      flightNames(f.done()) === 'Invert Rewind');
  }
  {
    /* The one that caught the attitude bug: the middle flip begins and ends
     * inverted, and the craft's real quaternion says so. */
    const f = await rig();
    f.hold(250);
    f.rotate('roll', 0.5, 1);
    const invert = f.upZ();
    f.hold(60);
    f.rotate('pitch', 1, 1);
    const stillInverted = f.upZ();
    f.hold(60);
    f.rotate('roll', 0.5, 1);
    const home = f.upZ();
    const got = f.done();
    check('the craft really is inverted through the middle of a Cube',
      invert < -0.8 && stillInverted < -0.8 && home > 0.8);
    check('a flown Rubik\'s Cube is one Rubik\'s Cube',
      flightNames(got) === "Rubik's Cube");
    check('and it is one trick, not three', got.length === 1);
  }
  /*
   * THE FALSE POSITIVE CASES. These matter more than any of the recognition
   * checks above, because a detector that misses a trick disappoints a
   * pilot once and a detector that invents one destroys the meaning of the
   * whole score. Each of these is a pilot flying NORMALLY and none of them
   * may produce a single trick.
   */
  {
    const f = await rig();
    /* Ten seconds of twitchy stick, the way a quad is actually flown. */
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return (seed / 4294967296) * 2 - 1;
    };
    for (let k = 0; k < 10000; k += 1) {
      f.ms(rnd() * 0.18, rnd() * 0.18, rnd() * 0.15, 0.55);
    }
    check('ten seconds of twitchy cruising scores nothing', f.done().length === 0);
  }
  {
    const f = await rig();
    for (let c = 0; c < 6; c += 1) {
      f.hold(420, 0.6, 0.55, 0, 0.75);
      f.hold(300, 0.5);
    }
    check('six hard corners score nothing', f.done().length === 0);
  }
  {
    /*
     * A COORDINATED CIRCLING TURN, which is the case that decides RATE_ON.
     * Yaw held with a bank on, for one and a half full turns at about 109
     * deg/s. That is a pilot flying around a park, not a pirouette, and at
     * RATE_ON 1.8 or below it scores a Yaw Spin. See the sweep written up
     * on RATE_ON in trickdetect.js.
     */
    const f = await rig();
    f.hold(200);
    let peak = 0;
    let total = 0;
    for (let k = 0; k < 6000; k += 1) {
      const st = f.ms(0.14, 0.12, 0.35, 0.55);
      const r = st[13] < 0 ? -st[13] : st[13];
      if (r > peak) {
        peak = r;
      }
      total += r * 0.001;
    }
    const got = f.done();
    check('the circling turn really did cover more than a full turn',
      total / TURN > 1.2);
    check('and at about 100 deg/s', peak * 57.2958 > 90 && peak * 57.2958 < 130);
    check('a coordinated circling turn scores nothing', got.length === 0);
  }
  {
    const f = await rig();
    f.hold(200);
    f.hold(1500, 1.0);
    f.hold(800, 0.3);
    check('a punch out with no rotation scores nothing', f.done().length === 0);
  }
  {
    /* A rotation flown with the other axes busy is still the trick. */
    const f = await rig();
    f.hold(250);
    f.rotate('roll', 1, 1, 0.5, { yaw: -0.45 });
    check('a roll flown with yaw mixed in is still a Roll',
      flightNames(f.done()) === 'Roll');
  }
  {
    const f = await rig();
    f.hold(250);
    f.rotate('yaw', 1, 1, 0.5, { roll: 0.12 });
    check('a yaw spin flown with a roll correction is still a Yaw Spin',
      flightNames(f.done()) === 'Yaw Spin');
  }

  {
    /* A whole run, flown, recognised and scored end to end. */
    const f = await rig();
    f.hold(250);
    f.rotate('roll', 0.5, 1);
    f.hold(60);
    f.rotate('pitch', 1, 1);
    f.hold(60);
    f.rotate('roll', 0.5, 1);
    f.hold(200);
    f.rotate('roll', 2, 1);
    f.hold(200);
    f.rotate('yaw', 1, 1);
    const got = f.done();
    const s = new FreestyleScore();
    for (const t of got) {
      s.tick(t.endMs);
      s.land(t);
    }
    s.tick(s.nowMs + 4000);
    check('a flown run of three tricks names all three',
      flightNames(got) === "Rubik's Cube + Double Roll + Yaw Spin");
    check('and banks the same 1597 the synthetic trace did', s.total() === 1597);
    console.log(`        flown: ${formatScore(s.total())} from ${got.length} tricks, `
      + `every trick CLEAN: ${got.every((t) => t.execution === 'CLEAN')}`);
  }

  /*
   * A FLOWN POWERLOOP, which is the whole point of the obstacle work.
   *
   * Two passes. The first flies the loop with no obstacle in the world and
   * records where the craft went. The second puts a rail at the place a
   * pilot would have chosen, low in the loop, since a powerloop goes under
   * the object and over it and back under, and flies the identical inputs.
   * The module is deterministic, so pass two traces pass one exactly; the
   * only difference is that this time there is something to loop around.
   *
   * Nothing about the flight is faked. Betaflight's rate curve, the PID
   * loop, the mixer and the plant produce the path, and the winding is
   * measured off it.
   */
  const flyLoop = async (field, barY) => {
    const f = await rig(field);
    f.hold(250, 0.5);
    /* Nose down under power until the craft is doing 12 m/s, which is the
     * speed that makes a 12 m loop at this pitch rate: the loop radius is
     * the speed over the pitch rate, and the centripetal acceleration it
     * needs has to fit inside the airframe's 4.9 g of thrust. */
    for (let k = 0; k < 4000; k += 1) {
      const st = f.state();
      if (Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]) >= 12) {
        break;
      }
      f.ms(0, -0.30, 0, 0.80);
    }
    f.hold(160, 0.55, 0, 0.20, 0);
    const mark = f.track.length;
    let acc = 0;
    for (let k = 0; k < 6000; k += 1) {
      const st = f.ms(0, 0.60, 0, 1.0);
      acc += st[12] * 0.001;
      /* A powerloop is not finished until you are back under the object. */
      if (Math.abs(acc) >= TURN && (barY === null || f.track[f.track.length - 1][1] < barY)) {
        break;
      }
    }
    f.hold(900, 0.5);
    return { f, mark, pitchTurns: acc / TURN };
  };
  /* Winding of a path about a point in the vertical plane, in turns. */
  const windAbout = (pts, cy, cz) => {
    let a = 0;
    for (let i = 1; i < pts.length; i += 1) {
      const ay = pts[i - 1][1] - cy;
      const az = pts[i - 1][2] - cz;
      const by = pts[i][1] - cy;
      const bz = pts[i][2] - cz;
      const la = Math.sqrt(ay * ay + az * az);
      const lb = Math.sqrt(by * by + bz * bz);
      if (la < 0.5 || lb < 0.5) {
        return NaN;
      }
      a += (ay * bz - az * by) / (la * lb);
    }
    return a / TURN;
  };
  {
    const first = await flyLoop(null, null);
    const pts = first.f.track.slice(first.mark);
    let minY = 1e9;
    let maxY = -1e9;
    let minZ = 1e9;
    let maxZ = -1e9;
    let sx = 0;
    for (const p of pts) {
      if (p[1] < minY) { minY = p[1]; }
      if (p[1] > maxY) { maxY = p[1]; }
      if (p[2] < minZ) { minZ = p[2]; }
      if (p[2] > maxZ) { maxZ = p[2]; }
      sx += p[0];
    }
    check('the flown loop really is a loop, not a climb',
      maxY - minY > 6 && maxZ - minZ > 6);
    let best = null;
    for (let fy = 0.05; fy <= 0.35; fy += 0.02) {
      for (let fz = 0.1; fz <= 0.9; fz += 0.02) {
        const cy = minY + (maxY - minY) * fy;
        const cz = minZ + (maxZ - minZ) * fz;
        const wv = windAbout(pts, cy, cz);
        if (Number.isNaN(wv)) {
          continue;
        }
        const err = Math.abs(Math.abs(wv) - 1);
        if (!best || err < best.err) {
          best = { cy, cz, w: wv, err };
        }
      }
    }
    check('and it winds a full turn about a point low inside it',
      Boolean(best) && Math.abs(Math.abs(best.w) - 1) < 0.15);

    const field = new ObstacleField();
    field.add(OB_BAR, sx / pts.length, best.cy, best.cz, 1, 0, 0, 8);
    field.build();
    const second = await flyLoop(field, best.cy);
    second.f.done();
    check('a flown powerloop around a real rail is a Powerloop',
      flightNames(second.f.out) === 'Powerloop');
    console.log(`        rail at y ${best.cy.toFixed(1)} z ${best.cz.toFixed(1)}, `
      + `path wound ${best.w.toFixed(2)} turns, pitch ${first.pitchTurns.toFixed(2)}`);
  }
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures);
