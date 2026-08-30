/*
 * tricks.js: the freestyle trick catalogue and the score model, as published
 * numbers and nothing else.
 *
 * Every figure in this file is transcribed from one spreadsheet: The Whoop
 * Pilots' freestyle scoring calculator, "Tyrantt_Pro_Whooper.xlsx", supplied
 * by the owner on 2026-08-30. It is the scoring sheet a real freestyle
 * competition runs on: a judge picks each trick off a list, marks how it was
 * flown, and the sheet applies the penalties. Nothing here is invented and
 * nothing here is tuned to feel good. When a number in this file looks wrong,
 * the sheet is the argument, not this file.
 *
 * The extracted workbook lives at
 *   .loop/evidence/freestyle-scoring/twp-calculator.json
 * and `npm run score:selftest` asserts this file still agrees with it, name
 * for name and point for point. The workbook itself is not vendored: it is 1.4 MB
 * of XLSX carrying three embedded images, and the project needs the numbers
 * rather than the file. That is the same rule src/game/track.js applies to
 * the MultiGP course PDFs.
 *
 * WHICH SHEET. The workbook scores indoor and outdoor separately, and the
 * two disagree: an indoor Flip is 75 points where an outdoor Flip is 50,
 * because indoor tricks are named against a specific obstacle class and
 * outdoor tricks are not. Freestyle city is a town, so this file carries the
 * OUTDOOR list, from the sheet "Trick List - Outdoor". The indoor sheet's
 * obstacle classes (Single Gate, Cube, Under/Over, Triple Gate Stack, Dive
 * Gate, Wall Taps) are in the evidence JSON if a hall is ever built.
 *
 * WHAT IS NOT HERE, and it is deliberate. The workbook also carries "Trick
 * of the Week", a KWAD letter bonus and a map-of-the-week multiplier. Those
 * are the administration of a weekly online competition, not a property of
 * flying, and a simulator that awarded a doubling for whichever trick a
 * coordinator posted on a Monday would be scoring the calendar. The tables
 * are preserved in the evidence JSON. They are the obvious shape for a daily
 * challenge later, which is the only reason to say what they were.
 *
 * Units: points are points, dimensionless. Angles anywhere near this file
 * are turns, not degrees and not radians, because the sheet's own language
 * is "180 degrees" and "360 degrees" and a turn is the honest unit for a
 * thing that is counted rather than measured.
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

/*
 * The catalogue. 90 tricks in ten categories, in the sheet's own order, which
 * is roughly easiest first within each category.
 *
 * `points` is the sheet's base value before any adjustment. Every multiplier
 * below scales it. The explanations are not carried: they are a paragraph
 * each, they are the judge's definition rather than the simulator's, and the
 * recogniser in src/game/trickdetect.js has to state its own conditions in
 * code anyway. They are in the evidence JSON where a wiki page can read them.
 */
export const TRICKS = [

  /* Open Air Tricks */
  { name: 'Flip', category: 'Open Air Tricks', difficulty: 'Beginner', points: 50 },
  { name: 'Roll', category: 'Open Air Tricks', difficulty: 'Beginner', points: 50 },
  { name: 'Yaw Spin', category: 'Open Air Tricks', difficulty: 'Beginner', points: 50 },
  { name: 'Segmented Flips/Rolls', category: 'Open Air Tricks', difficulty: 'Beginner', points: 75 },
  { name: 'Invert Rewind', category: 'Open Air Tricks', difficulty: 'Beginner', points: 75 },
  { name: 'Vanny Roll', category: 'Open Air Tricks', difficulty: 'Beginner', points: 125 },
  { name: 'Double Flip', category: 'Open Air Tricks', difficulty: 'Beginner', points: 150 },
  { name: 'Double Roll', category: 'Open Air Tricks', difficulty: 'Beginner', points: 150 },
  { name: 'Juicy Flick', category: 'Open Air Tricks', difficulty: 'Novice', points: 200 },
  { name: 'Snapback', category: 'Open Air Tricks', difficulty: 'Novice', points: 200 },
  { name: 'Rubik\'s Cube', category: 'Open Air Tricks', difficulty: 'Intermediate', points: 325 },
  { name: 'Cubik\'s Rube', category: 'Open Air Tricks', difficulty: 'Intermediate', points: 325 },
  { name: 'Inverted Yaw Spin', category: 'Open Air Tricks', difficulty: 'Advanced', points: 400 },
  { name: 'Inverted Yaw Tracking', category: 'Open Air Tricks', difficulty: 'Advanced', points: 425 },

  /* Powerloops */
  { name: 'Powerloop', category: 'Powerloops', difficulty: 'Novice', points: 200 },
  { name: 'Immelmann Turn', category: 'Powerloops', difficulty: 'Novice', points: 250 },
  { name: 'Power Split', category: 'Powerloops', difficulty: 'Intermediate', points: 300 },
  { name: 'Power Flip', category: 'Powerloops', difficulty: 'Intermediate', points: 350 },
  { name: 'Reversed Power Flip', category: 'Powerloops', difficulty: 'Intermediate', points: 325 },
  { name: 'Power Swap', category: 'Powerloops', difficulty: 'Intermediate', points: 350 },
  { name: 'Power Switch', category: 'Powerloops', difficulty: 'Advanced', points: 425 },
  { name: 'Power Roll', category: 'Powerloops', difficulty: 'Advanced', points: 450 },
  { name: 'Inverted 360 Powerloop', category: 'Powerloops', difficulty: 'Master', points: 650 },
  { name: 'Barani', category: 'Powerloops', difficulty: 'Master', points: 700 },
  { name: 'Beginner Switch', category: 'Powerloops', difficulty: 'Beginner', points: 150 },
  { name: 'Immelloop', category: 'Powerloops', difficulty: 'Intermediate', points: 300 },
  { name: 'Immelmatt', category: 'Powerloops', difficulty: 'Advanced', points: 450 },
  { name: 'Rollani', category: 'Powerloops', difficulty: 'Master', points: 800 },
  { name: 'Flipani', category: 'Powerloops', difficulty: 'Master', points: 850 },

  /* Maverick Loops */
  { name: 'Maverick Loop', category: 'Maverick Loops', difficulty: 'Beginner', points: 100 },
  { name: 'Mavvy Roll', category: 'Maverick Loops', difficulty: 'Novice', points: 250 },
  { name: 'Half Mavvy', category: 'Maverick Loops', difficulty: 'Advanced', points: 450 },
  { name: 'Mavik\'s Loop', category: 'Maverick Loops', difficulty: 'Advanced', points: 475 },
  { name: 'Mavani', category: 'Maverick Loops', difficulty: 'Advanced', points: 500 },
  { name: 'Donkey Loop', category: 'Maverick Loops', difficulty: 'Master', points: 600 },
  { name: 'Mavvelmann', category: 'Maverick Loops', difficulty: 'Novice', points: 250 },

  /* Matty Flips */
  { name: 'Beginner Matty', category: 'Matty Flips', difficulty: 'Beginner', points: 100 },
  { name: 'Matty Flip', category: 'Matty Flips', difficulty: 'Novice', points: 200 },
  { name: 'Matty Twister', category: 'Matty Flips', difficulty: 'Intermediate', points: 350 },
  { name: 'Half Matty', category: 'Matty Flips', difficulty: 'Intermediate', points: 350 },
  { name: '540 Half Matty', category: 'Matty Flips', difficulty: 'Advanced', points: 425 },
  { name: 'Matty 360', category: 'Matty Flips', difficulty: 'Advanced', points: 425 },
  { name: 'Forani', category: 'Matty Flips', difficulty: 'Advanced', points: 475 },
  { name: 'Anti Matty', category: 'Matty Flips', difficulty: 'Novice', points: 250 },
  { name: 'Power Matty', category: 'Matty Flips', difficulty: 'Intermediate', points: 300 },
  { name: 'Matty Roll', category: 'Matty Flips', difficulty: 'Advanced', points: 425 },

  /* SplitS */
  { name: 'Split-S', category: 'SplitS', difficulty: 'Beginner', points: 100 },
  { name: '540 Split S', category: 'SplitS', difficulty: 'Novice', points: 250 },
  { name: 'Split-Back', category: 'SplitS', difficulty: 'Intermediate', points: 300 },
  { name: 'Split Yaw', category: 'SplitS', difficulty: 'Intermediate', points: 300 },
  { name: 'Split Stall Matty Rewind', category: 'SplitS', difficulty: 'Intermediate', points: 350 },

  /* Pole Dancing */
  { name: 'Orbit x2', category: 'Pole Dancing', difficulty: 'Beginner', points: 75 },
  { name: 'Cradle', category: 'Pole Dancing', difficulty: 'Beginner', points: 150 },
  { name: 'Side-Lock Rewind', category: 'Pole Dancing', difficulty: 'Beginner', points: 150 },
  { name: 'Whiplash', category: 'Pole Dancing', difficulty: 'Beginner', points: 175 },
  { name: 'Pole Dance', category: 'Pole Dancing', difficulty: 'Advanced', points: 450 },
  { name: 'Trippy Spin x2', category: 'Pole Dancing', difficulty: 'Advanced', points: 500 },
  { name: 'Trippy Switch', category: 'Pole Dancing', difficulty: 'Advanced', points: 550 },
  { name: 'Double Rolling Trippy Spin', category: 'Pole Dancing', difficulty: 'Master', points: 750 },

  /* Jump Roping */
  { name: 'Jump Rope', category: 'Jump Roping', difficulty: 'Beginner', points: 100 },
  { name: 'Cinnamon Roll', category: 'Jump Roping', difficulty: 'Beginner', points: 175 },
  { name: 'Burrito Roll', category: 'Jump Roping', difficulty: 'Novice', points: 250 },
  { name: 'Side Loop', category: 'Jump Roping', difficulty: 'Novice', points: 200 },
  { name: 'Double Dutch', category: 'Jump Roping', difficulty: 'Intermediate', points: 300 },

  /* Rewinds */
  { name: 'Flip Stall Rewind', category: 'Rewinds', difficulty: 'Novice', points: 275 },
  { name: '360 Stall Rewind', category: 'Rewinds', difficulty: 'Novice', points: 275 },
  { name: 'Matty Stall Rewind', category: 'Rewinds', difficulty: 'Intermediate', points: 350 },
  { name: 'Half Matty Stall Rewind', category: 'Rewinds', difficulty: 'Intermediate', points: 375 },
  { name: '540 Half Matty Stall Rewind', category: 'Rewinds', difficulty: 'Advanced', points: 450 },
  { name: 'Stall Rewind', category: 'Rewinds', difficulty: 'Beginner', points: 75 },

  /* Wall Tricks */
  { name: 'Dive', category: 'Wall Tricks', difficulty: 'Beginner', points: 100 },
  { name: 'Wall Ride', category: 'Wall Tricks', difficulty: 'Beginner', points: 150 },
  { name: 'Wall Tap', category: 'Wall Tricks', difficulty: 'Beginner', points: 150 },
  { name: 'Roll Tap', category: 'Wall Tricks', difficulty: 'Novice', points: 250 },
  { name: 'Loop Tap', category: 'Wall Tricks', difficulty: 'Intermediate', points: 300 },
  { name: 'Ceiling Tap', category: 'Wall Tricks', difficulty: 'Intermediate', points: 300 },
  { name: 'Reverse Wall Ride', category: 'Wall Tricks', difficulty: 'Intermediate', points: 300 },
  { name: 'Downtown Tap', category: 'Wall Tricks', difficulty: 'Intermediate', points: 350 },
  { name: 'Maverick Tap Rewind', category: 'Wall Tricks', difficulty: 'Advanced', points: 500 },
  { name: 'Power Switch Tap', category: 'Wall Tricks', difficulty: 'Advanced', points: 550 },

  /* Gaps */
  { name: 'Knife Edge', category: 'Gaps', difficulty: 'Beginner', points: 150 },
  { name: 'Reverse Knife Edge', category: 'Gaps', difficulty: 'Intermediate', points: 300 },
  { name: 'Ninja Star', category: 'Gaps', difficulty: 'Advanced', points: 450 },

  /* Other Tricks */
  { name: 'Facepunch', category: 'Other Tricks', difficulty: 'Beginner', points: 100 },
  { name: 'Slide Disarm', category: 'Other Tricks', difficulty: 'Novice', points: 200 },
  { name: 'Perch', category: 'Other Tricks', difficulty: 'Novice', points: 200 },
  { name: 'Eject Roll', category: 'Other Tricks', difficulty: 'Novice', points: 200 },
  { name: 'Blindflip', category: 'Other Tricks', difficulty: 'Intermediate', points: 300 },
  { name: 'True Barani', category: 'Other Tricks', difficulty: 'Intermediate', points: 375 },
  { name: 'Stellar Eject Roll', category: 'Other Tricks', difficulty: 'Advanced', points: 450 },];

/*
 * The building blocks, from the sheet "Custom Trick Building Blocks". A
 * competitor who flies something the list does not name adds up the parts
 * instead, and this is the price list for a part.
 *
 * The recogniser uses these for the same reason a judge does: a quarter roll
 * that is not part of anything larger is still a quarter roll, and scoring it
 * as nothing means the first thirty seconds of a run reads as zero. They are
 * the floor under the catalogue, not a second catalogue.
 */
export const BUILDING_BLOCKS = [
  { name: '1/4 Flip', points: 25 },
  { name: '1/2 Flip', points: 50 },
  { name: '3/4 Flip', points: 75 },
  { name: '1 Flip', points: 100 },
  { name: '1/4 Roll', points: 25 },
  { name: '1/2 Roll', points: 50 },
  { name: '3/4 Roll', points: 75 },
  { name: '1 Roll', points: 100 },
  { name: '1/4 Yaw Spin', points: 25 },
  { name: '1/2 Yaw Spin', points: 50 },
  { name: '3/4 Yaw Spin', points: 75 },
  { name: '1 Yaw Spin', points: 100 },
  { name: '1/4 powerloop', points: 25 },
  { name: '1/2 Power Loop', points: 100 },
  { name: '3/4 Power Loop', points: 150 },
  { name: '1/2 Maverick', points: 50 },
  { name: 'Split-S', points: 100 },
  { name: '1/4 Matty Flip', points: 25 },
  { name: '1/2 Matty Flip', points: 100 },
  { name: '1/2 Trippy Spin', points: 50 },
  { name: '1 Trippy Spin', points: 100 },
  { name: 'Rewind', points: 100 },
  { name: 'Dive', points: 100 },
  { name: 'Eject', points: 100 },
  { name: 'Juicy Flick', points: 200 },
  { name: 'Wall Tap', points: 150 },
  { name: '1/4 Jump Rope', points: 25 },
  { name: '1/2 Jump Rope', points: 50 },];

/*
 * How a trick was flown, and what that costs. Sheet "Info Tables", columns
 * AG and AH, and the same table restated on the Landing Page.
 *
 *   CLEAN   flown as described.
 *   SLOPPY  no contact, but the motion broke up: segmented where it should
 *           have been one loop. 35% off.
 *   BUMP    completed, but tapped a gate, a wall or the ground without
 *           disarming. Half points, and it halves the streak.
 *   MISSED  did not complete, no contact. Nothing, and the streak stalls
 *           rather than dying.
 *   CRASH   did not complete, contact and disarm. Nothing, and the streak
 *           is gone.
 *
 * `streak` names what happens to the run's streak multiplier and is read by
 * src/game/score.js. The workbook says it in prose; this says it in a word
 * so that one switch statement can implement it.
 */
export const EXECUTION = {
  CLEAN: { points: 1.0, streak: 'grow', label: 'CLEAN' },
  SLOPPY: { points: 0.65, streak: 'grow', label: 'SLOPPY' },
  BUMP: { points: 0.5, streak: 'halve', label: 'BUMP' },
  MISSED: { points: 0.0, streak: 'hold', label: 'MISSED' },
  CRASH: { points: 0.0, streak: 'kill', label: 'CRASH' },
};

/*
 * Flying the same trick again, later in the run. Sheet "Info Tables",
 * columns T and U, indexed by how many times it has already been landed.
 *
 * Third repeat is worth nothing at all, which is the sheet being blunt about
 * what it wants: a run of thirty flips is not a freestyle run.
 */
export const REPEAT_TRICK = [1.0, 0.75, 0.5, 0.0];

/*
 * Flying the same trick again IMMEDIATELY. Sheet "Info Tables", columns Q
 * and R, indexed by the length of the back to back run. It halves each time
 * and the sheet tabulates it out to 34 places; a halving needs no table.
 */
export const BACK_TO_BACK_HALVING = 0.5;

/*
 * Staying on the same obstacle. Sheet "Info Tables", columns W and X,
 * indexed by how many tricks in a row have used it. Three is free, then it
 * falls away and the sixth is worth nothing.
 *
 * Nothing reads this yet. Obstacle awareness is stage 2 of this system, and
 * the table is here so that stage 2 is a wiring job rather than a second
 * reading of the workbook. See PROGRESS.md, 2026-08-30.
 */
export const REPEAT_OBSTACLE = [1.0, 1.0, 1.0, 1.0, 0.66, 0.33, 0.0];

/*
 * The run bonus for moving around. Sheet "Info Tables", columns AC, AD and
 * AE: a ladder on the number of times the run switched obstacle, applied to
 * the whole run's trick score as (multiplier - 1) * trickScore.
 *
 * Read as [switches, multiplier], lowest first, and the highest row whose
 * switch count has been reached wins. The sheet's first column, unique
 * obstacle count, is 1 on every row after the first and so decides nothing;
 * it is dropped here rather than carried as a column of ones.
 */
export const OBSTACLE_BONUS = [
  [0, 1.0],
  [3, 1.05],
  [6, 1.1],
  [9, 1.2],
  [12, 1.35],
  [15, 1.5],
  [18, 1.7],
  [21, 2.0],
];

/*
 * The streak multiplier's growth rate. From the calculator's own cell:
 *
 *   G(n) = G(n-1) + O(n-1) / 10000
 *
 * where O is the previous trick's score after the execution, repeat and back
 * to back adjustments but BEFORE the streak itself, so the streak cannot
 * compound on its own output. G starts at 1. A 200 point trick therefore buys
 * two hundredths of multiplier, and a full clean run of thirty tricks lands
 * somewhere near 1.9: this is a reward for not crashing for a long time, and
 * it is deliberately not a per-combo multiplier. The combo multiplier is a
 * separate thing that the workbook does not have, and it is defined and
 * argued in src/game/score.js rather than smuggled in here.
 */
export const STREAK_DIVISOR = 10000;

/* Name to entry, built once. The recogniser and the scorer both look tricks
 * up by the name they are printed under, because that name is the only
 * identifier the workbook gives them. */
const BY_NAME = new Map();
for (const t of TRICKS) {
  BY_NAME.set(t.name, t);
}
for (const b of BUILDING_BLOCKS) {
  /* A block is only reachable by name if the catalogue has not already
   * claimed the name. Split-S is in both, at 100 points in both, and the
   * catalogue entry is the one that carries a category. */
  if (!BY_NAME.has(b.name)) {
    BY_NAME.set(b.name, {
      name: b.name, category: 'Building Blocks', difficulty: 'Block', points: b.points,
    });
  }
}

/* The trick, or undefined. Callers that pass a name they built themselves
 * are wrong and should fail loudly, so this does not invent a default. */
export function trickByName(name) {
  return BY_NAME.get(name);
}

/* Base points for a named trick. Throws rather than scoring zero: a typo in
 * a pattern is a bug in the recogniser, and a silent zero hides it for
 * months. */
export function trickPoints(name) {
  const t = BY_NAME.get(name);
  if (!t) {
    throw new Error(`tricks: no trick named ${name}`);
  }
  return t.points;
}

/* Every name the catalogue and the blocks know, for the lint. */
export function trickNames() {
  return Array.from(BY_NAME.keys());
}

/*
 * The repeat penalty for a trick landed `priorCount` times already in this
 * run. Past the end of the table the answer stays at the last row, which is
 * zero, so a fifth repeat is worth what a fourth is: nothing.
 */
export function repeatTrickFactor(priorCount) {
  if (!(priorCount > 0)) {
    return REPEAT_TRICK[0];
  }
  return priorCount < REPEAT_TRICK.length
    ? REPEAT_TRICK[priorCount]
    : REPEAT_TRICK[REPEAT_TRICK.length - 1];
}

/*
 * The back to back penalty for the nth consecutive landing of the same
 * trick, n counted from 1. A halving per step, computed by repeated
 * multiplication rather than Math.pow: CLAUDE.md keeps pow out of anything
 * that has to give the same answer twice, and n here is a small integer.
 */
export function backToBackFactor(runLength) {
  let f = 1;
  for (let i = 1; i < runLength; i += 1) {
    f *= BACK_TO_BACK_HALVING;
  }
  return f;
}

/* The obstacle repeat penalty, same clamping rule as the trick repeat. */
export function repeatObstacleFactor(inARow) {
  if (!(inARow > 0)) {
    return REPEAT_OBSTACLE[0];
  }
  return inARow < REPEAT_OBSTACLE.length
    ? REPEAT_OBSTACLE[inARow]
    : REPEAT_OBSTACLE[REPEAT_OBSTACLE.length - 1];
}

/* The run's obstacle bonus multiplier for a given number of switches. */
export function obstacleBonusMultiplier(switches) {
  let m = OBSTACLE_BONUS[0][1];
  for (const [need, mult] of OBSTACLE_BONUS) {
    if (switches >= need) {
      m = mult;
    }
  }
  return m;
}
