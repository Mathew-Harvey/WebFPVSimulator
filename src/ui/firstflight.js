/*
 * firstflight.js: the words of a first flight, and when each one is said.
 *
 * WHAT IT IS. The first time a pilot flies each KIND of place, the banner
 * walks them through it: a five inch race track, a whoop room, or a
 * freestyle world (the town, Your map and Hibari Yard). Three kinds, not
 * every map one by one, because a pilot who has learned to take off in the
 * town does not need to be told again in the yard, and a guide that comes
 * back for every track on the board is a guide people stop reading.
 *
 * WHY IT IS STARTED AT LAUNCH AND NOT BY A MENU ROW. The guided First flight
 * row only exists on the title, for a browser that has never flown, and the
 * door most newcomers will use does not pass through the title at all: the
 * board's Fly this track, the builder's Fly and a CommunityGow round all
 * carry ?fly=1, which takes the pilot past the menu to the starting blocks
 * (see flyIfLinked in main.js). So the guide used to be skipped for exactly
 * the people who arrive from a link with a friend's track and have never
 * held a stick. Ui.flown() is called once at every launch by every door, so
 * it is the one place that sees them all.
 *
 * ONCE PER KIND, remembered in the settings blob (guidedRace, guidedWhoop,
 * guidedFreestyle). A profile saved before these existed is read for what it
 * shows: see guidesGiven. Getting that wrong in the other direction, a guide
 * in front of a veteran, is worse than missing it once, which is the rule
 * detectFirstRun already lives by.
 *
 * WHAT RETIRES IT is what the pilot does and not a clock: the third gate or
 * the first lap, for a race or a room, and for freestyle, which has no gates,
 * the sim's own airtime. So a slow first lap is never cut off mid prompt and
 * a fast one is never nagged.
 *
 * NO DOM, NO WASM. The words and the steps live here so that
 * scripts/firstflight-selftest.js can read every one of them in Node, and so
 * that main.js, which says them, and ui.js, which decides when to start,
 * agree on a single table. The race kind's words are the ones this simulator
 * has always said, character for character in the default stick mode, and
 * the selftest pins them.
 *
 * LATENCY. Nothing here is on the input, physics or render path. A guided
 * frame asks stepOf for an integer and compares five fields against the
 * last it said; the string is built when one of them changes and not before.
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

import { stickChannels } from '../input/stickmode.js';
import { AIRFRAMES, airframeById } from '../../configs/airframes.js';

export const GUIDE_KINDS = ['race', 'whoop', 'freestyle'];

/* The settings key that records a kind has had its guide. */
export const GUIDE_KEY = {
  race: 'guidedRace',
  whoop: 'guidedWhoop',
  freestyle: 'guidedFreestyle',
};

/*
 * Freestyle has no gates, so its guide reads the clock the sim keeps. The
 * first ten seconds in the air say how to fly and how the sticks behave, the
 * next twelve say how to start again, and then it is gone. Airtime is sim
 * time, held while landed and zeroed on a new run, so a pilot who crashes
 * in the first seconds sees it again from the top after R.
 */
export const FREESTYLE_STEP_MS = 10000;
export const FREESTYLE_RETIRE_MS = 22000;

/* The gates a race or a room guide stays up for. See stepOf. */
export const RACE_GATES = 3;

/*
 * Which kind of place a launch is in. A freestyle world has no gates and
 * flies the five inch; a room is the whoop's class of track; anything else
 * is a race track. The airframe's track class decides the second, not its
 * name, so the next airframe that flies rooms is guided without a line here.
 */
export function guideKind(freestyle, airframe) {
  if (freestyle) {
    return 'freestyle';
  }
  return airframeById(airframe).trackClass === 'micro' ? 'whoop' : 'race';
}

/*
 * What one of this browser's storage keys says about a lap on file: 'race'
 * for a lap on a five inch, 'whoop' for a lap in a room, '' for a key that is
 * not a best lap at all.
 *
 * Best laps are filed as webfpv.best.<hash>.<volts> with a suffix per
 * condition, and the airframe's id is one of them unless it is the five inch,
 * whose suffix is empty on purpose so that every record ever set stayed where
 * it was (recordKey in src/main.js). The oldest key, webfpv.bestLapMs,
 * predates airframes and is a five inch's. The suffix is read from the
 * airframe list and not typed here, so the next micro airframe is a room
 * lap without a line in this file.
 */
export function lapKindOfKey(key) {
  if (typeof key !== 'string' || !key.startsWith('webfpv.best')) {
    return '';
  }
  for (const a of AIRFRAMES) {
    if (a.trackClass === 'micro' && key.includes(`.${a.id}`)) {
      return 'whoop';
    }
  }
  return 'race';
}

/*
 * The guides a profile has already had, for one saved before the keys
 * existed. `ev` is what the loader could see:
 *
 *   returning      a settings blob is saved and it does not say this pilot
 *                  has not flown yet (hasFlown false)
 *   fiveInchLap    a finished lap is on file that was not flown on the whoop
 *   whoopSeen      the whoop is, or was, the seated aircraft, or a whoop lap
 *                  is on file
 *   freestyleSeen  a freestyle world is or was chosen
 *
 * A brand new browser, and one that answered the gate and never flew, have
 * had none. A returning pilot has had every kind they show evidence of, and
 * a kind with no evidence is due: a veteran who has never left the town gets
 * the race guide the first time they fly a track, which is the point. A
 * five inch pilot who has never finished a lap gets it too, and is better
 * for it.
 */
export function guidesGiven(ev) {
  if (!ev || !ev.returning) {
    return { race: false, whoop: false, freestyle: false };
  }
  return {
    race: Boolean(ev.fiveInchLap),
    whoop: Boolean(ev.whoopSeen),
    freestyle: Boolean(ev.freestyleSeen),
  };
}

/*
 * The controls, named from the stick mode. Mode 2 is the default and what
 * every string below was written for: throttle on the left stick (W and S
 * on the keyboard), pitch on the right (the arrows). The other three modes
 * put them elsewhere, and a prompt that says "the up arrow" to somebody
 * whose pitch is on W is worse than none.
 */
export function controls(stickMode) {
  const c = stickChannels(stickMode);
  const throttleLeft = c.left.vert === 'throttle';
  const pitchLeft = c.left.vert === 'pitch';
  return {
    throttleKey: throttleLeft ? 'W' : 'the up arrow',
    pitchKey: pitchLeft ? 'W' : 'the up arrow',
    throttleSide: throttleLeft ? 'left' : 'right',
    pitchSide: pitchLeft ? 'left' : 'right',
  };
}

/* Device is 'keys', 'pad' (a gamepad or a radio) or 'touch'. */

/*
 * The first line before take off, while the quad is parked. A parked quad
 * has the generic "Throttle up to take off" for everyone else; a guided one
 * names the control, because a pilot who has never held a stick does not
 * know that W is the throttle and the sticks drawn at the bottom of the
 * screen do not say which key moves them.
 */
export function takeoffLine(device, stickMode) {
  const c = controls(stickMode);
  if (device === 'touch') {
    return `Push the ${c.throttleSide} plate up to take off`;
  }
  if (device === 'pad') {
    return 'Ease the throttle up to take off';
  }
  return `Hold ${c.throttleKey} to take off`;
}

/* The step a parked quad is on, before any of the numbered ones. */
export const TAKEOFF = 'takeoff';

/*
 * The step a pilot is on, or -1 when the guide is done. Integers only, so a
 * frame can ask without building a string.
 *
 *   race, whoop   0 before the first gate, 1 after it, 2 after the second,
 *                 done at the third gate or the first lap, whichever is first
 *   freestyle     0 for the first ten seconds of airtime, 1 for the next
 *                 twelve, done after that
 */
export function stepOf(kind, state) {
  if (kind === 'freestyle') {
    if (state.airMs >= FREESTYLE_RETIRE_MS) {
      return -1;
    }
    return state.airMs >= FREESTYLE_STEP_MS ? 1 : 0;
  }
  if (state.lapDone || state.next >= RACE_GATES) {
    return -1;
  }
  return state.next < 0 ? 0 : state.next;
}

function noseLine(device, c) {
  if (device === 'touch') {
    return `Push the ${c.pitchSide} plate up, then throttle on the ${c.throttleSide}`;
  }
  if (device === 'pad') {
    return `Ease the ${c.pitchSide} stick forward, then throttle`;
  }
  return `Tip forward with ${c.pitchKey}, then throttle`;
}

/* Where a restart goes: the line on a track, the start in a free world. */
function againLine(device, place) {
  if (device === 'touch') {
    return `Pause, then Restart puts you back on the ${place}`;
  }
  return `R puts you back on the ${place}. Escape pauses`;
}

/*
 * What the sticks do when let go, which is the one thing a freestyle pilot
 * cannot see and every trick depends on. The keyboard races in Angle but
 * flies freestyle in whichever mode the setting says, which is Acro unless
 * it was changed, so a keyboard pilot's first freestyle flight is in Acro
 * with keys: the line says so, and says which key flips it.
 */
function modeLine(device, angle) {
  if (device === 'keys') {
    return angle
      ? 'Angle levels itself. M for Acro'
      : 'Acro holds its attitude. M for Angle';
  }
  return angle
    ? 'Angle levels itself when you let go'
    : 'Acro holds its attitude when you let go';
}

/*
 * The two lines for a step. `ctx` is { device, stickMode, angle }. A step
 * that is not one of the kind's steps says nothing.
 *
 * The race kind is what this simulator has always said, and a whoop says the
 * same from the second gate on: only the line before the first gate differs,
 * because that is where a room is not a field. The whole of a whoop's first
 * minute is a few metres of a room with a ceiling in it.
 */
export function textOf(kind, step, ctx) {
  if (step === TAKEOFF) {
    return takeoffLine(ctx.device, ctx.stickMode);
  }
  const c = controls(ctx.stickMode);
  const nose = noseLine(ctx.device, c);
  if (kind === 'freestyle') {
    if (step === 0) {
      return `${nose}\n${modeLine(ctx.device, ctx.angle)}`;
    }
    if (step === 1) {
      return `${againLine(ctx.device, 'start')}\nNo gates here. Fly where you like`;
    }
    return '';
  }
  if (step === 0) {
    return kind === 'whoop'
      ? `${nose}\nLow and slow, the room is small`
      : `${nose}\nThe green gate starts your lap`;
  }
  if (step === 1) {
    return 'Through. The next gate turns green\nRed is the same gate, wrong side';
  }
  if (step === 2) {
    return `Gate by gate. ${againLine(ctx.device, 'line')}`;
  }
  return '';
}
