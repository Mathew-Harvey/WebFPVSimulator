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
 * THE COUNTER (FREESTYLE-MAPS-PLAN.md section 7, Stage C). One combo, fed
 * by five kinds of thing: tricks, named gaps (src/game/gaps.js), close calls
 * (src/game/closecall.js), the chase (src/game/chase.js) and the STF mark.
 * The geometry joins the SAME combo a trick does, under the same rules: a
 * three second window, a multiplier to twelve bought one scoring thing at a
 * time, banked when the window runs out and lost on a crash. It never
 * touches the workbook: a gap or a skim adds to the combo's points and buys
 * multiplier, and trickTotal, the streak, the penalties and the obstacle
 * bonus are the tricks' alone. A held skim or a held tail holds the window
 * open while it is held, the way a manual does. Geometry repeats pay less
 * by the workbook's own REPEAT_TRICK table, a named gap per run and a close
 * call or a chase event per combo: see gap() and repeatInCombo().
 *
 * TWO TOTALS, AND WHICH IS WHICH. The public board bounds every posted run
 * against trick only arithmetic (src/share/board.js postFreestyleRun), and
 * the plan keeps the town's board as it is, so the number that goes to the
 * board is the trick scorer's own, computed as it always was. Counter, at
 * the bottom, is the pair: `run`, the counter, everything above in one
 * combo, which is what the HUD shows; and `board`, a second FreestyleScore
 * fed the tricks alone exactly as the one scorer used to be. Its summary()
 * keeps every field it had with the board's meaning (`total` is what is
 * posted) and adds `counter`, the counter's total, beside it.
 *
 * THE COUNTER'S EVENTS, from drainEvents() once a frame, for the HUD. The
 * trick scorer's four are unchanged: { kind: 'trick', name, points,
 * execution } (only while the Scoring switch counts tricks), { kind: 'bank',
 * points, mult, names }, { kind: 'bail', points, names } and { kind:
 * 'finish', points, bonus, mult, switches }. The geometry's, each with
 * `points` (what it put into the combo, after any repeat) and `atMs` (the
 * sim ms it went in), and `repeat` (how many of the same were there before
 * it: this run's crossings for a gap, this combo's for the rest):
 *
 *   { kind: 'gap', name, tier }              name and tier are the author's
 *   { kind: 'skim', name, holdMs, clearance } 'Wall skim' or 'Roof skim'
 *   { kind: 'under', name, clearance }       'Under'
 *   { kind: 'thread', name, clearance }      'Thread'
 *   { kind: 'lowpass', name, holdMs, clearance }   'Low pass'
 *   { kind: 'tail', name, holdMs, drift }    chase.js: 'Tail', 'Drift Tail'
 *   { kind: 'chase-thread', name }           chase.js: 'Thread'
 *   { kind: 'hurdle', name }                 chase.js: 'Hurdle', 'Leapfrog'
 *   { kind: 'egg', name: 'STF' }             once a run
 *
 * A close call is sent when it ends and pays, not while it is held; the
 * held skim is view().skim, { on, holdMs, clearance }, for a meter.
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
  repeatObstacleFactor,
  obstacleBonusMultiplier,
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

/*
 * HOW LONG A RUN IS, in milliseconds of SIMULATED time.
 *
 * A freestyle score is only a score if two of them can be compared, and two
 * of them can only be compared if they were flown over the same amount of
 * flying. Before this there was no run at all: the total climbed from the
 * moment the world loaded until something reset it, so the top of any board
 * would be whoever left the tab open longest. That is not a leaderboard, it
 * is an odometer.
 *
 * Two minutes is the length of a real freestyle heat, it is what the
 * workbook's own calculator is laid out to hold, and it is about as long as
 * a pilot can hold a line together. It is simulated time, not wall time, for
 * the same reason a lap is: a frame hitch must not spend a pilot's run for
 * them.
 */
export const RUN_MS = 120_000;

/*
 * The three states a run can be in. `ready` is a world with nobody scoring
 * in it yet, which is where every run starts and where a pilot who wants to
 * look around first can stay as long as they like.
 */
export const RUN_READY = 'ready';
export const RUN_FLYING = 'flying';
export const RUN_OVER = 'over';

/*
 * THE STF MARK, found: a one off bonus into the combo, once a run (section
 * 9). A named gap's 1000 tier, and not its top one, 2500: since decision 10
 * the mark is painted to be seen from the pads, so finding it is flying up
 * to it rather than a search, and it is worth what an author gives a gap
 * that takes some flying.
 */
export const EGG_POINTS = 1000;

/* chase.js's event kinds, as the counter names them: a car thread is not a
 * close call's thread, and the two are told apart by kind. */
const CHASE_KIND = { tail: 'tail', thread: 'chase-thread', hurdle: 'hurdle' };

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
    this.runMs = opts.runMs ?? RUN_MS;
    /* Off makes this an exact implementation of the competition sheet, with
     * no combo layer at all. Kept as a switch rather than a fork so the
     * self-test can check the workbook arithmetic on its own. */
    this.comboEnabled = opts.comboEnabled !== false;
    /* Off makes the run open ended, which is what every test written before
     * the clock existed assumes. The game always has the clock. */
    this.timed = opts.timed !== false;
    /* The held skim, for the meter: see setSkim. One object, rewritten in
     * place and handed out by view(). */
    this.skim = { on: false, holdMs: 0, clearance: 0 };
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
    this.bestChain = 0;
    this.bestTrick = 0;
    this.crashes = 0;
    this.bumps = 0;
    this.nowMs = 0;
    /*
     * THE RUN. `startedMs` is the endMs of the first trick, not the moment
     * the world loaded, so the clock starts when the pilot does. A pilot who
     * wants to fly a lap of the town first, or find the post they mean to
     * orbit, is not spending their run to do it.
     */
    this.state = RUN_READY;
    this.startedMs = 0;
    this.endedMs = 0;
    /*
     * The sum of every landed trick's net, kept apart from `banked` because
     * the workbook's obstacle bonus is a percentage of the TRICK score and
     * not of the combo layer's output. Multiplying the two together would
     * pay the variety bonus on the combo multiplier as well, which is one
     * mechanic quietly scaling another.
     */
    this.trickTotal = 0;
    this.bonus = 0;
    /* Which obstacle the last obstacle trick used, how many in a row have
     * used it, and how many times the run has moved. See land(). */
    this.lastObstacle = null;
    this.obstacleRun = 0;
    this.obstacleSwitches = 0;
    /*
     * Set by any trick that did not come out of the recogniser. The debug
     * hooks in main.js can land a named trick directly, which is the only
     * way to photograph this overlay, and a run that used them must not be
     * postable to a public board as if it had been flown.
     */
    this.assisted = false;
    /* The last thing that happened, for the display to announce. Cleared by
     * the reader, so an event is shown once. */
    this.events = [];
    /*
     * THE GEOMETRY'S RUN. How many times this run has flown each named gap,
     * by its key, for the repeat price; whether the STF mark has paid; and
     * the run's bests for the results page. None of it is read by the
     * workbook arithmetic above.
     */
    this.gapPriors = new Map();
    this.eggFound = false;
    this.gapsFlown = 0;
    this.bestGap = null;
    this.longestSkim = null;
    this.bestTail = null;
    this.bestTailValue = 0;
    this.closeCalls = {
      skim: 0, under: 0, thread: 0, lowpass: 0,
    };
    this.skim.on = false;
    this.skim.holdMs = 0;
    this.skim.clearance = 0;
  }

  /* Is the run finished? Nothing more can be scored into it. */
  over() {
    return this.state === RUN_OVER;
  }

  /* Milliseconds of run left, or the whole run before it has started. */
  remainMs() {
    if (!this.timed) {
      return Infinity;
    }
    if (this.state === RUN_READY) {
      return this.runMs;
    }
    if (this.state === RUN_OVER) {
      return 0;
    }
    const left = this.runMs - (this.nowMs - this.startedMs);
    return left > 0 ? left : 0;
  }

  /*
   * Score one recognised trick.
   *
   * `trick` is the recogniser's object: { name, execution, endMs, ... }.
   * Returns the scored record, which is also pushed onto this.tricks.
   */
  land(trick) {
    /* A finished run is finished. The recogniser keeps running for a moment
     * after the clock stops, because a trick that was in the air when it
     * stopped still has to close, and that trick is not in this run. */
    if (this.state === RUN_OVER) {
      return null;
    }
    const name = trick.name;
    const execution = trick.execution in EXECUTION ? trick.execution : 'CLEAN';
    const base = trickPoints(name);
    const exec = EXECUTION[execution].points;
    const at = trick.endMs ?? this.nowMs;
    if (trick.assisted) {
      this.assisted = true;
    }
    if (this.state === RUN_READY) {
      this.state = RUN_FLYING;
      this.startedMs = at;
    }

    /* The four penalties, in the sheet's own order. */
    const priors = this.counts.get(name) ?? 0;
    const repeat = repeatTrickFactor(priors);
    const b2bRun = name === this.lastName ? this.b2bRun + 1 : 1;
    const b2b = backToBackFactor(b2bRun);

    /*
     * THE FOURTH PENALTY, WHICH NOTHING READ UNTIL NOW.
     *
     * REPEAT_OBSTACLE has been in tricks.js since the workbook was
     * transcribed, with a comment saying obstacle awareness was stage 2 and
     * that wiring it up would be a wiring job. This is that job. The
     * recogniser knows which thing a lap went around, and passes it as a
     * small integer that treats a railing built out of six collinear boxes
     * as one railing: see groupOf in src/game/trickdetect.js.
     *
     * Indexed by PRIORS, the same convention repeatTrickFactor uses, so the
     * first trick on a post is free and it is the fifth that starts to
     * cost. An open air trick names no obstacle, and neither continues a
     * run on one nor breaks it: the workbook counts tricks that USED the
     * obstacle, and a flip flown between two powerloops on the same rail
     * has not moved the pilot off that rail.
     *
     * What this closes is the most obvious way to farm this scorer: sit on
     * one lamp post and orbit it until the battery runs out. The seventh
     * consecutive trick on one obstacle is worth nothing at all.
     */
    const group = trick.obstacle ?? null;
    let obstacle = 1;
    if (group != null) {
      if (this.lastObstacle != null && group !== this.lastObstacle) {
        this.obstacleSwitches += 1;
      }
      const inARow = group === this.lastObstacle ? this.obstacleRun : 0;
      obstacle = repeatObstacleFactor(inARow);
      this.lastObstacle = group;
      this.obstacleRun = inARow + 1;
    }

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

    const raw = base * exec * repeat * b2b * obstacle;
    const net = raw * this.streak;

    const record = {
      name,
      execution,
      base,
      exec,
      repeat,
      b2b,
      obstacle,
      streak: this.streak,
      raw,
      net,
      atMs: at,
      turns: trick.turns ?? 0,
    };
    this.tricks.push(record);
    this.trickTotal += net;
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
      if (!this.combo) {
        this.combo = {
          names: [], kinds: [], scoring: 0, points: 0, startMs: at, untilMs: at + this.comboWindowMs,
        };
      }
      this.combo.names.push(name);
      this.combo.kinds.push('trick');
      this.combo.points += net;
      /*
       * A TRICK THAT SCORED NOTHING BUYS NOTHING, and this is the hole that
       * mattered most.
       *
       * The multiplier used to be the chain's LENGTH, and land() pushes a
       * name whatever it was worth, so a worthless trick bought a whole
       * point of multiplier. Measured: three master tricks chained bank
       * 7,601; the same three with nine repeated half rolls thrown in
       * afterwards bank 31,515. Those nine half rolls are worth 62, 23, 8
       * and then zero six times over, ninety three points of flying, and
       * they more than quadrupled the run. Any pilot who found that would
       * fly nothing else, and they would be right to.
       *
       * The name still goes up on the HUD, because a pilot has to SEE the
       * repeat penalty happening to understand it. It simply does not pay.
       * And it does not hold the window open either: the chain is bought
       * with points, so a pilot cannot keep one alive indefinitely by
       * flicking half rolls while they reposition.
       */
      if (net > 0) {
        this.combo.scoring += 1;
        this.combo.untilMs = at + this.comboWindowMs;
      }
      if (this.combo.names.length > this.bestChain) {
        this.bestChain = this.combo.names.length;
      }
      this.events.push({ kind: 'trick', name, points: net, execution });
      /*
       * THE CHAIN CASHES ITSELF IN WHEN THE MULTIPLIER TOPS OUT.
       *
       * Past COMBO_MULT_MAX another trick in the chain is worth exactly
       * what it would be worth in a fresh chain, and it is at risk on top,
       * so continuing is strictly worse than banking and starting again.
       * Leaving that to the pilot meant punishing the ones who did not
       * know. Measured before this: forty tricks landed 2.9 s apart never
       * banked at all, so the whole run was one chain, the multiplier sat
       * pinned at twelve for thirty seven of them, and the Score readout
       * said nought for two minutes.
       */
      if (this.combo.scoring >= this.multMax) {
        this.bank();
      }
      return record;
    }
    this.banked += net;
    this.events.push({ kind: 'trick', name, points: net, execution });
    return record;
  }

  /*
   * Advance the run clock. Banks a combo whose window has run out, which is
   * this game's "landed it".
   */
  tick(nowMs) {
    this.nowMs = nowMs;
    if (this.state === RUN_OVER) {
      return;
    }
    if (this.timed && this.state === RUN_FLYING && nowMs - this.startedMs >= this.runMs) {
      this.finish();
      return;
    }
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
    /* The craft is back at the spawn, so whatever it was orbiting it is not
     * orbiting now. Leaving the obstacle run standing would charge the
     * pilot for staying on a post they have just been thrown off. */
    this.lastObstacle = null;
    this.obstacleRun = 0;
    if (this.combo) {
      const lost = Math.round(this.combo.points * this.comboMultiplier());
      this.events.push({ kind: 'bail', points: lost, names: this.combo.names.slice() });
      this.combo = null;
    }
  }

  /*
   * ------------------------------------------------------------------
   * THE GEOMETRY. Everything below adds to the combo and nothing below
   * reads or writes the workbook's state: trickTotal, the streak, the
   * repeat counts, the back to back run and the obstacle run are the
   * tricks' alone, so a run with no geometry in it is scored exactly as it
   * was before any of this existed.
   * ------------------------------------------------------------------
   */

  /*
   * Can geometry at `atMs` go in? Not into a finished run, and not past the
   * end of a timed one: tick() finishes the run on the frame, and a gap
   * crossed a few steps after the horn is not in it. A combo whose window
   * ran out before `atMs` is banked first, on the event's own clock, so what
   * goes into which combo is decided by the step stream and not by where a
   * frame happened to end.
   */
  geometryOpen(atMs) {
    if (this.state === RUN_OVER || !(atMs >= 0 || atMs < 0)) {
      return false;
    }
    if (this.timed && this.state === RUN_FLYING && atMs - this.startedMs >= this.runMs) {
      return false;
    }
    if (this.combo && atMs >= this.combo.untilMs) {
      this.bank();
    }
    return true;
  }

  /*
   * How many things of this kind and name are already in the open combo.
   * THE REPEAT PRICE FOR GEOMETRY is the workbook's own REPEAT_TRICK table
   * (src/game/tricks.js repeatTrickFactor), full, three quarters, a half,
   * then nothing, because a skim flown again is the same thing flown again
   * and the sheet already says what that is worth. It is counted per COMBO
   * for close calls and the chase, which is Tony Hawk's own rule for a
   * repeat inside a chain: a line is made of skims and a two minute run
   * holds dozens of them, so a per run count would price every skim after
   * the third at nothing, where per combo it prices bobbing along one kerb
   * to buy multiplier. A thing worth nothing buys nothing (see land()), so
   * the fourth Wall skim in a chain cannot raise its multiplier.
   */
  repeatInCombo(kind, name) {
    const c = this.combo;
    if (!c) {
      return 0;
    }
    let n = 0;
    for (let i = 0; i < c.names.length; i += 1) {
      if (c.kinds[i] === kind && c.names[i] === name) {
        n += 1;
      }
    }
    return n;
  }

  /*
   * Put one geometric event into the combo, opening one if none is open, as
   * land() does for a trick: its points add to the combo's, and if it is
   * worth anything it buys a point of multiplier and holds the window open
   * for another COMBO_WINDOW_MS from when it went in. The first thing a run
   * scores starts the run's clock, whatever kind it is.
   */
  addGeometry(e) {
    const at = e.atMs;
    if (this.state === RUN_READY) {
      this.state = RUN_FLYING;
      this.startedMs = at;
    }
    if (!this.comboEnabled) {
      this.banked += e.points;
      this.events.push(e);
      return e;
    }
    if (!this.combo) {
      this.combo = {
        names: [], kinds: [], scoring: 0, points: 0, startMs: at, untilMs: at + this.comboWindowMs,
      };
    }
    this.combo.names.push(e.name);
    this.combo.kinds.push(e.kind);
    this.combo.points += e.points;
    if (e.points > 0) {
      this.combo.scoring += 1;
      const until = at + this.comboWindowMs;
      if (until > this.combo.untilMs) {
        this.combo.untilMs = until;
      }
    }
    if (this.combo.names.length > this.bestChain) {
      this.bestChain = this.combo.names.length;
    }
    this.events.push(e);
    /* The chain cashes itself in at the top, as land() says why. */
    if (this.combo.scoring >= this.multMax) {
      this.bank();
    }
    return e;
  }

  /*
   * A NAMED GAP, flown: the author's `tier` (100 to 2500) at `atMs`, priced
   * down by REPEAT_TRICK for every time this run has already flown it. The
   * workbook's repeat table fits a gap exactly: a gap is a named line, the
   * same way a trick is a named figure, and flying it a second time in a
   * run is the thing the sheet charges for, so the fourth crossing is
   * worth nothing and buys nothing (and is still shown, so the pilot sees
   * why). Counted per RUN, not per combo, because a gap is one place: a
   * pilot who could bank a combo and fly the crane gap again at full price
   * would fly nothing else. `key` tells two gaps with the same name apart
   * (a new gap is called GAP until its author names it): the index
   * src/game/gaps.js reports, or the name when there is none.
   */
  gap(name, tier, atMs, key) {
    if (!this.geometryOpen(atMs)) {
      return null;
    }
    const k = key ?? name;
    const priors = this.gapPriors.get(k) ?? 0;
    const t = tier > 0 ? tier : 0;
    const points = Math.round(t * repeatTrickFactor(priors));
    this.gapPriors.set(k, priors + 1);
    this.gapsFlown += 1;
    if (!this.bestGap || points > this.bestGap.points) {
      this.bestGap = { name, points };
    }
    return this.addGeometry({
      kind: 'gap', name, tier: t, repeat: priors, points, atMs,
    });
  }

  /*
   * A CLOSE CALL that ended clean and paid: src/game/closecall.js's event,
   * { kind, name, value, holdMs, clearance, paidStep }, which goes in at
   * `paidStep`, priced down by REPEAT_TRICK for the same kind and name
   * already in this combo.
   */
  closeCall(c) {
    const kind = c && c.kind;
    if (!(kind in this.closeCalls) || !(c.value > 0)) {
      return null;
    }
    const at = c.paidStep;
    if (!this.geometryOpen(at)) {
      return null;
    }
    const repeat = this.repeatInCombo(kind, c.name);
    const points = Math.round(c.value * repeatTrickFactor(repeat));
    this.closeCalls[kind] += 1;
    const clearance = Math.round(c.clearance * 100) / 100;
    let e;
    if (kind === 'skim' || kind === 'lowpass') {
      if (kind === 'skim' && (!this.longestSkim || c.holdMs > this.longestSkim.ms)) {
        this.longestSkim = { ms: c.holdMs, name: c.name };
      }
      e = {
        kind, name: c.name, holdMs: c.holdMs, clearance, repeat, points, atMs: at,
      };
    } else {
      e = {
        kind, name: c.name, clearance, repeat, points, atMs: at,
      };
    }
    return this.addGeometry(e);
  }

  /*
   * A CHASE EVENT that paid (src/game/chase.js pays(e)): a tail banked, a
   * thread between two moving cars, a hurdle or leapfrog over one, with
   * chase.js's own name and value, going in at its paidStep and priced down
   * for the same one already in this combo. A car thread is kind
   * 'chase-thread', so it is not a repeat of a close call's thread.
   */
  chaseEvent(ev) {
    const kind = ev && CHASE_KIND[ev.kind];
    if (!kind || !(ev.value > 0)) {
      return null;
    }
    const at = ev.paidStep;
    if (!this.geometryOpen(at)) {
      return null;
    }
    const repeat = this.repeatInCombo(kind, ev.name);
    const points = Math.round(ev.value * repeatTrickFactor(repeat));
    let e;
    if (kind === 'tail') {
      if (!this.bestTail || ev.value > this.bestTailValue) {
        this.bestTail = { ms: ev.ms, drift: Boolean(ev.drift) };
        this.bestTailValue = ev.value;
      }
      e = {
        kind, name: ev.name, holdMs: ev.ms, drift: Boolean(ev.drift), repeat, points, atMs: at,
      };
    } else {
      e = {
        kind, name: ev.name, repeat, points, atMs: at,
      };
    }
    return this.addGeometry(e);
  }

  /* THE STF MARK, found: EGG_POINTS into the combo, once a run. */
  egg(atMs) {
    if (this.eggFound || !this.geometryOpen(atMs)) {
      return null;
    }
    this.eggFound = true;
    return this.addGeometry({
      kind: 'egg', name: 'STF', repeat: 0, points: EGG_POINTS, atMs,
    });
  }

  /*
   * A HELD SKIM OR A HELD TAIL, at `atMs`: the open combo's window is held
   * open for COMBO_WINDOW_MS from here, the way a manual keeps a skate
   * game's combo alive. It adds nothing and buys nothing; the skim or the
   * tail pays when it ends. With no combo open there is nothing to hold.
   */
  hold(atMs) {
    if (!this.combo || this.state === RUN_OVER) {
      return;
    }
    if (atMs >= this.combo.untilMs) {
      this.bank();
      return;
    }
    const until = atMs + this.comboWindowMs;
    if (until > this.combo.untilMs) {
      this.combo.untilMs = until;
    }
  }

  /* The skim being held, for view().skim: closecall.js's live skim. */
  setSkim(on, holdMs, clearance) {
    this.skim.on = Boolean(on);
    this.skim.holdMs = on ? holdMs : 0;
    this.skim.clearance = on ? clearance : 0;
  }

  /*
   * The run is over. Whatever is open is banked, not lost: the pilot did
   * not crash, the clock ran out.
   *
   * This is also where the workbook's one REWARD lands. OBSTACLE_BONUS is a
   * ladder on how many times the run moved between obstacles, applied to
   * the whole run's trick score, and like REPEAT_OBSTACLE it has sat in
   * tricks.js unread since the transcription. It is a run level number and
   * cannot be paid per trick, because how much a pilot moved around is not
   * known until they stop.
   *
   * It is added to the banked total rather than multiplied into it. The
   * combo layer is this game's and the bonus is the workbook's, and
   * multiplying them would have the variety bonus scaling the combo
   * multiplier as well: a pilot with a twelve chain would be paid twelve
   * times as much for moving around as a pilot with a one chain, which is
   * not what a bonus for moving around means.
   */
  finish() {
    if (this.state === RUN_OVER) {
      return this.total();
    }
    this.bank();
    this.state = RUN_OVER;
    this.endedMs = this.nowMs;
    const mult = obstacleBonusMultiplier(this.obstacleSwitches);
    this.bonus = Math.round((mult - 1) * this.trickTotal);
    this.banked += this.bonus;
    this.events.push({
      kind: 'finish',
      points: this.banked,
      bonus: this.bonus,
      mult,
      switches: this.obstacleSwitches,
    });
    return this.total();
  }

  /*
   * The open chain's multiplier: how many tricks in it were worth
   * something, capped. Not how many are in it. See land().
   */
  comboMultiplier() {
    if (!this.combo) {
      return 0;
    }
    const n = this.combo.scoring;
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
      bestTrick: Math.round(this.bestTrick),
      crashes: this.crashes,
      /*
       * THE RUN CLOCK, for the one readout a timed run needs. `state` is
       * what the HUD switches on: ready means the clock has not started and
       * saying "2:00" would be a lie about a run nobody has begun.
       */
      state: this.state,
      remainMs: this.remainMs(),
      runMs: this.runMs,
      combo: c
        ? {
          names: c.names,
          points: Math.round(c.points),
          mult: this.comboMultiplier(),
          value: Math.round(c.points * this.comboMultiplier()),
          remain: Math.max(0, Math.min(1, (c.untilMs - this.nowMs) / this.comboWindowMs)),
        }
        : null,
      /* The skim being held, for a meter: { on, holdMs, clearance }, the
       * same object every frame. See setSkim. */
      skim: this.skim,
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
    /*
     * The one trick the run is remembered by. A board row has space for a
     * name and not for a table, and "their biggest was a Trippy Spin x2"
     * is the sentence a pilot reads first.
     */
    let signature = '';
    let signatureNet = 0;
    for (const t of this.tricks) {
      if (t.net > signatureNet) {
        signatureNet = t.net;
        signature = t.name;
      }
    }
    return {
      total: this.banked,
      /* Everything a board row could want, and nothing it has to compute
       * for itself. See src/share/freestyle.js for what actually travels. */
      tricks: this.tricks.length,
      unique: rows.length,
      bestCombo: this.bestCombo,
      bestChain: this.bestChain,
      bestTrick: Math.round(this.bestTrick),
      signature,
      streak: this.streak,
      crashes: this.crashes,
      bumps: this.bumps,
      obstacles: this.obstacleSwitches,
      bonus: this.bonus,
      state: this.state,
      /* Zero before the first trick, which is the honest answer to how long
       * a run that has not started has lasted. */
      durationMs: this.state === RUN_READY
        ? 0
        : Math.max(0, (this.state === RUN_OVER ? this.endedMs : this.nowMs) - this.startedMs),
      assisted: this.assisted,
      /* Free flight has no clock and no board. Carried on the summary so
       * the OSD and the results card do not each have to go and ask the
       * settings what kind of run this was. */
      timed: this.timed,
      rows,
      /*
       * THE GEOMETRY, for the results page. `counter` is this scorer's own
       * total, the same number as `total` here; on Counter's summary, below,
       * `total` is the board's and `counter` the counter's, and this is the
       * field that tells them apart.
       */
      counter: this.banked,
      bestGap: this.bestGap ? { name: this.bestGap.name, points: this.bestGap.points } : null,
      longestSkim: this.longestSkim ? { ms: this.longestSkim.ms, name: this.longestSkim.name } : null,
      bestTail: this.bestTail ? { ms: this.bestTail.ms, drift: this.bestTail.drift } : null,
      eggFound: this.eggFound,
      gaps: this.gapsFlown,
      closeCalls: { ...this.closeCalls },
    };
  }
}

/*
 * THE COUNTER AND ITS BOARD TWIN, which is what the shell holds.
 *
 * `run` is the counter: tricks (while `tricks` says the Scoring switch
 * counts them), named gaps, close calls, the chase and the STF mark, in one
 * combo. It owns the run's one clock: a scored run is two minutes from the
 * first thing it scores, whatever kind that is, and it is what the HUD
 * draws (view(), drainEvents()).
 *
 * `board` is the trick scorer as it always was: every trick the recogniser
 * names, whatever the switch says (Off is a display decision, and the
 * scorer keeps its total underneath it, as src/main.js has always said),
 * crashed where the shell has always told it to crash, and nothing else.
 * Its total is the number the board is posted, so a run on the town posts
 * exactly the arithmetic the board's inspectRun bounds. It has no clock of
 * its own: it ends when the counter's run ends. Every trick it is fed goes
 * into the counter too while tricks count, so the counter's run starts no
 * later than the board's first trick and a scored run on the board is
 * never longer than the two minutes on the screen. When the first thing a
 * run scores is a trick the two end on the same tick, and the board's
 * total is exactly what the one scorer's was before the counter existed. When a gap or a skim came first, the board holds the tricks
 * flown inside the run the pilot was shown.
 *
 * The pair allocates nothing more than the one scorer did: the board's
 * events are thrown away as they are made (events.length = 0), because the
 * HUD reads the counter's.
 */
export class Counter {
  constructor(opts = {}) {
    this.run = new FreestyleScore({ ...opts, timed: opts.timed !== false });
    this.board = new FreestyleScore({ ...opts, timed: false });
    /* Whether tricks count in the counter: the Scoring switch, re-read by
     * the shell every run (decision 2). The board counts them regardless. */
    this.tricks = opts.tricks !== false;
  }

  get timed() {
    return this.run.timed;
  }

  set timed(v) {
    this.run.timed = v !== false;
  }

  reset() {
    this.run.reset();
    this.board.reset();
  }

  over() {
    return this.run.over();
  }

  remainMs() {
    return this.run.remainMs();
  }

  total() {
    return this.run.total();
  }

  /* A trick from the recogniser: to the board always, and to the counter
   * while tricks count. Returns the counter's record, or the board's when
   * tricks do not count. */
  land(trick) {
    if (this.run.over()) {
      return null;
    }
    const b = this.board.land(trick);
    this.board.events.length = 0;
    return this.tricks ? this.run.land(trick) : b;
  }

  tick(nowMs) {
    this.run.tick(nowMs);
    this.board.tick(nowMs);
    if (this.run.over() && this.board.state === RUN_FLYING) {
      this.board.finish();
    }
    this.board.events.length = 0;
  }

  finish() {
    const total = this.run.finish();
    if (this.board.state === RUN_FLYING) {
      this.board.finish();
    }
    this.board.events.length = 0;
    return total;
  }

  /* A crash the shell has always told the trick scorer about: both hear
   * it. */
  crash() {
    this.run.crash();
    this.board.crash();
    this.board.events.length = 0;
  }

  /*
   * A crash on a path that never reached the trick scorer (the solid crash
   * that sets the craft down, src/main.js crashResetTick): the counter
   * bails, because a crash must never be paid for and every crash loses the
   * open combo, and the board is left as it was, so the number it is posted
   * is still computed as it always was. PROGRESS.md 2026-09-26 puts the
   * difference to the owner.
   */
  bailCounter() {
    this.run.crash();
  }

  gap(name, tier, atMs, key) {
    return this.run.gap(name, tier, atMs, key);
  }

  closeCall(c) {
    return this.run.closeCall(c);
  }

  chaseEvent(e) {
    return this.run.chaseEvent(e);
  }

  egg(atMs) {
    return this.run.egg(atMs);
  }

  hold(atMs) {
    this.run.hold(atMs);
  }

  setSkim(on, holdMs, clearance) {
    this.run.setSkim(on, holdMs, clearance);
  }

  /* The counter, for the HUD. */
  view() {
    return this.run.view();
  }

  drainEvents() {
    this.board.events.length = 0;
    return this.run.drainEvents();
  }

  /*
   * The run summary. Every field the trick scorer's summary had keeps its
   * meaning and comes from the board: `total` is what is posted, with the
   * tricks, the best combo, the signature and the duration it is posted
   * with. `state` and `timed` are the run's, because the run has one clock.
   * Beside them, the counter's: `counter` its total, `counterBestCombo`,
   * `counterDurationMs`, and the geometry's bests and counts.
   */
  summary() {
    const s = this.board.summary();
    const r = this.run.summary();
    s.state = r.state;
    s.timed = r.timed;
    s.assisted = s.assisted || r.assisted;
    s.counter = r.counter;
    s.counterBestCombo = r.bestCombo;
    s.counterDurationMs = r.durationMs;
    s.bestGap = r.bestGap;
    s.longestSkim = r.longestSkim;
    s.bestTail = r.bestTail;
    s.eggFound = r.eggFound;
    s.gaps = r.gaps;
    s.closeCalls = r.closeCalls;
    return s;
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
