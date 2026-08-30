/*
 * score.js: what a freestyle run is worth.
 *
 * TWO SOURCES, AND THE SEAM BETWEEN THEM IS THE POINT OF THIS FILE.
 *
 * The first is the workbook in src/game/tricks.js: a real competition's
 * scoring sheet, which prices each trick and then takes it apart again with
 * four penalties (flew it badly, flew it before, flew it twice in a row,
 * stayed on the same obstacle) and one reward (have not crashed in a long
 * time). Every one of those numbers is transcribed, not tuned.
 *
 * The second is Tony Hawk's Pro Skater, which the owner asked for by name,
 * and which the workbook has nothing corresponding to. THPS does not score
 * tricks, it scores COMBOS: tricks chain while you are in the air, the chain
 * carries a multiplier equal to how many tricks are in it, and it is worth
 * nothing at all until you land it. Bail and the whole chain is gone. That
 * loop, risk that compounds and then has to be cashed in, is the thing that
 * makes the scoring fun rather than arithmetic, and it is the only mechanic
 * in this file that the workbook does not contain.
 *
 * They are kept apart on purpose. Everything down to a trick's `net` is the
 * workbook and can be checked against it line by line. The combo multiplier
 * and the bank sit on top and are named COMBO_ constants so that turning
 * them off leaves an exact implementation of the competition sheet.
 *
 * WHAT "LANDING" MEANS FOR A QUAD. In THPS the combo banks when the wheels
 * come down. A quad never lands: it is in the air for the whole run, so
 * there is no wheels-down moment to bank on. The honest translation is the
 * one a pilot would recognise: the combo banks when you FLY AWAY CLEAN, that
 * is, when COMBO_WINDOW_MS passes with no new trick, and it bails when you
 * crash. A bump, the workbook's word for touching something without
 * disarming, costs the trick half its points and halves the streak but does
 * not break the chain, because in the air a clipped branch is not a bail.
 *
 * This file holds no timers of its own and reads no clock. It is told the
 * time. That keeps it testable off a recorded trace and keeps CLAUDE.md's
 * rule that nothing downstream of the physics may read frame time.
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

import {
  EXECUTION,
  STREAK_DIVISOR,
  trickPoints,
  repeatTrickFactor,
  backToBackFactor,
} from './tricks.js';

/*
 * How long a combo stays open with nothing new added to it.
 *
 * This is the single number that decides whether the mode feels like
 * freestyle or like a chore. Too short and two tricks never link, because
 * setting up for the next obstacle takes longer than that. Too long and
 * every run is one enormous combo and the bank never means anything. Three
 * seconds is about one line between two obstacles at freestyle speeds, which
 * is the unit a pilot already thinks in.
 */
export const COMBO_WINDOW_MS = 3000;

/*
 * The most a combo's multiplier can reach.
 *
 * THPS does not cap it, and THPS is a game where a good player scores in the
 * millions on purpose. Nothing here breaks without a cap either; it is here
 * because an uncapped count times the workbook's own streak bonus makes the
 * last trick of a long chain worth more than the whole rest of the run, and
 * that reads as a bug to anybody who has not seen this comment. Twelve is
 * high enough that reaching it is a story.
 */
export const COMBO_MULT_MAX = 12;

/* A trick that scored nothing still counts as flown, but not as landed: it
 * must not raise the repeat count of a trick the pilot never completed. */
function landed(execution) {
  return EXECUTION[execution].points > 0;
}

/*
 * One freestyle run's score.
 *
 * The caller feeds it named tricks from the recogniser, tells it when the
 * craft crashed, and ticks it with the run clock. Everything it knows is
 * readable through view(), which allocates one object per call and is meant
 * to be called once a frame, not once a step.
 */
export class FreestyleScore {
  constructor(opts = {}) {
    this.comboWindowMs = opts.comboWindowMs ?? COMBO_WINDOW_MS;
    this.multMax = opts.multMax ?? COMBO_MULT_MAX;
    /* Off makes this an exact implementation of the competition sheet, with
     * no combo layer at all. Kept as a switch rather than a fork so the
     * self-test can check the workbook arithmetic on its own. */
    this.comboEnabled = opts.comboEnabled !== false;
    this.reset();
  }

  reset() {
    this.banked = 0;
    this.tricks = [];
    this.counts = new Map();
    this.lastName = '';
    this.b2bRun = 0;
    this.streak = 1;
    this.prevRaw = 0;
    /* True until the first trick after a reset or a crash, which is the
     * sheet's "streak count is 1" case and forces the multiplier back to
     * one whatever it had climbed to. */
    this.streakFresh = true;
    this.combo = null;
    this.bestCombo = 0;
    this.bestTrick = 0;
    this.crashes = 0;
    this.bumps = 0;
    this.nowMs = 0;
    /* The last thing that happened, for the display to announce. Cleared by
     * the reader, so an event is shown once. */
    this.events = [];
  }

  /*
   * Score one recognised trick.
   *
   * `trick` is the recogniser's object: { name, execution, endMs, ... }.
   * Returns the scored record, which is also pushed onto this.tricks.
   */
  land(trick) {
    const name = trick.name;
    const execution = trick.execution in EXECUTION ? trick.execution : 'CLEAN';
    const base = trickPoints(name);
    const exec = EXECUTION[execution].points;

    /* The four penalties, in the sheet's own order. */
    const priors = this.counts.get(name) ?? 0;
    const repeat = repeatTrickFactor(priors);
    const b2bRun = name === this.lastName ? this.b2bRun + 1 : 1;
    const b2b = backToBackFactor(b2bRun);

    /*
     * The streak, resolved for THIS trick from the state the previous one
     * left. Sheet "Calculator - Outdoor", column G:
     *   first trick of a streak -> 1
     *   bumped                  -> half the distance back down to 1
     *   otherwise               -> plus the previous trick's raw over 10000
     */
    if (this.streakFresh) {
      this.streak = 1;
      this.streakFresh = false;
    } else if (EXECUTION[execution].streak === 'halve') {
      this.streak += (1 - this.streak) / 2;
    } else if (EXECUTION[execution].streak === 'grow') {
      this.streak += this.prevRaw / STREAK_DIVISOR;
    }
    /* 'hold' and 'kill' fall through: hold leaves the streak where it is,
     * and kill is handled by crash(), which sets streakFresh. */

    const raw = base * exec * repeat * b2b;
    const net = raw * this.streak;

    const record = {
      name,
      execution,
      base,
      exec,
      repeat,
      b2b,
      streak: this.streak,
      raw,
      net,
      atMs: trick.endMs ?? this.nowMs,
      turns: trick.turns ?? 0,
    };
    this.tricks.push(record);
    this.prevRaw = raw;
    this.lastName = name;
    this.b2bRun = b2bRun;
    if (landed(execution)) {
      this.counts.set(name, priors + 1);
    }
    if (execution === 'BUMP') {
      this.bumps += 1;
    }
    if (net > this.bestTrick) {
      this.bestTrick = net;
    }

    if (this.comboEnabled) {
      /*
       * The combo window runs from when the trick ENDED, on the detector's
       * own clock, not from the last tick. Both count milliseconds of
       * simulated time from the same zero, and the difference between them
       * is however far into the frame the trick landed. Using the tick
       * would make the window one frame shorter on a slow machine, which is
       * a frame-rate dependence in the game rules.
       */
      const at = record.atMs;
      if (!this.combo) {
        this.combo = { names: [], points: 0, startMs: at, untilMs: 0 };
      }
      this.combo.names.push(name);
      this.combo.points += net;
      this.combo.untilMs = at + this.comboWindowMs;
    } else {
      this.banked += net;
    }
    this.events.push({ kind: 'trick', name, points: net, execution });
    return record;
  }

  /*
   * Advance the run clock. Banks a combo whose window has run out, which is
   * this game's "landed it".
   */
  tick(nowMs) {
    this.nowMs = nowMs;
    if (this.combo && nowMs >= this.combo.untilMs) {
      this.bank();
    }
  }

  /* Cash the open combo in. Safe to call with none open. */
  bank() {
    if (!this.combo) {
      return 0;
    }
    const mult = this.comboMultiplier();
    const value = Math.round(this.combo.points * mult);
    this.banked += value;
    if (value > this.bestCombo) {
      this.bestCombo = value;
    }
    this.events.push({
      kind: 'bank', points: value, mult, names: this.combo.names.slice(),
    });
    this.combo = null;
    return value;
  }

  /*
   * The run crashed. THPS calls this a bail: the open combo is gone, not
   * banked, and the streak multiplier goes back to one.
   */
  crash() {
    this.crashes += 1;
    this.streakFresh = true;
    this.prevRaw = 0;
    this.lastName = '';
    this.b2bRun = 0;
    if (this.combo) {
      const lost = Math.round(this.combo.points * this.comboMultiplier());
      this.events.push({ kind: 'bail', points: lost, names: this.combo.names.slice() });
      this.combo = null;
    }
  }

  /* The run is over. Whatever is open is banked, not lost: the pilot did
   * not crash, the battery ran out or they quit. */
  finish() {
    this.bank();
    return this.total();
  }

  comboMultiplier() {
    if (!this.combo) {
      return 0;
    }
    const n = this.combo.names.length;
    return n > this.multMax ? this.multMax : n;
  }

  total() {
    return this.banked;
  }

  /*
   * What the HUD draws. One allocation per call, called once a frame.
   *
   * `combo.remain` is 0 to 1 rather than milliseconds, because the only
   * thing that reads it is a bar, and a bar wants a fraction.
   */
  view() {
    const c = this.combo;
    return {
      total: this.banked,
      streak: this.streak,
      trickCount: this.tricks.length,
      bestCombo: this.bestCombo,
      bestTrick: this.bestTrick,
      crashes: this.crashes,
      combo: c
        ? {
          names: c.names,
          points: Math.round(c.points),
          mult: this.comboMultiplier(),
          value: Math.round(c.points * this.comboMultiplier()),
          remain: Math.max(0, Math.min(1, (c.untilMs - this.nowMs) / this.comboWindowMs)),
        }
        : null,
    };
  }

  /* Take the events queued since the last call. The HUD is the only reader
   * and it must see each one once. */
  drainEvents() {
    if (this.events.length === 0) {
      return null;
    }
    const out = this.events;
    this.events = [];
    return out;
  }

  /*
   * The run summary, for the results screen. `byName` is the run's own
   * tally, biggest earner first, because "you flew nine flips" is the most
   * useful single sentence a freestyle scorer can say to a pilot.
   */
  summary() {
    const byName = new Map();
    for (const t of this.tricks) {
      const e = byName.get(t.name) ?? { name: t.name, count: 0, points: 0 };
      e.count += 1;
      e.points += t.net;
      byName.set(t.name, e);
    }
    const rows = Array.from(byName.values());
    rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    for (const r of rows) {
      r.points = Math.round(r.points);
    }
    return {
      total: this.banked,
      tricks: this.tricks.length,
      unique: rows.length,
      bestCombo: this.bestCombo,
      bestTrick: Math.round(this.bestTrick),
      streak: this.streak,
      crashes: this.crashes,
      bumps: this.bumps,
      rows,
    };
  }
}

/* Thousands separators, no locale: a score is read the same way in every
 * language this ships in and Intl brings a formatter object per call. */
export function formatScore(n) {
  const neg = n < 0;
  let s = String(Math.round(neg ? -n : n));
  let out = '';
  while (s.length > 3) {
    out = `,${s.slice(-3)}${out}`;
    s = s.slice(0, -3);
  }
  out = s + out;
  return neg ? `-${out}` : out;
}
