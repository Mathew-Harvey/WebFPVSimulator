/*
 * input.js: stick input for the shell.
 *
 * Sources, in priority order:
 *   1. A radio or controller in joystick mode via the Gamepad API. The
 *      first pad in navigator.getGamepads() is the OS order, which on
 *      Windows follows the Game Controllers list and is not something a
 *      pilot can rearrange without unplugging. Settings, Choose joystick
 *      and the boot/hotplug picker learn which device they meant by a
 *      wiggle, then store id plus index. Axis order and polarity still
 *      differ per radio, so a calibration wizard (Settings, Calibrate
 *      sticks) learns the mapping the usual way: centre, full range, then
 *      one named deflection per channel with a return to rest between
 *      each, then a live check before anything is saved. Until calibrated
 *      a common AETR guess is used for flight, and menu navigation falls
 *      back to any axis at all, so the wizard is always reachable. The
 *      guess is not treated as broken on principle: a radio's throttle is
 *      parked off centre because it has no centring spring, and a guess
 *      seen doing that is trusted for the menus too. See mapUsable.
 *   2. Keyboard: WASD plus arrows mimic a Mode 2 radio. A/D are yaw,
 *      arrows are the right stick: up arrow pushes the stick forward
 *      (nose down), left and right arrows roll. Rate limited so it is
 *      flyable. W/S are a collective, not a latched slider: a radio
 *      throttle is analog and stays where the stick is, a key is digital
 *      and cannot. Hold time is the analog: a tap is a nudge, a longer
 *      hold moves the stick further, a long hold opens to full, and
 *      letting go springs back (to centre on the right stick, to hover
 *      on throttle once airborne). A connected radio keeps its own
 *      analog throttle.
 *
 * Channels are the sim_abi.h convention: roll +1 right, pitch +1 nose up
 * (stick pulled back), yaw +1 nose right, throttle 0..1.
 *
 * Every change is queued as a sample stamped with performance.now(); the
 * main loop maps those wall timestamps onto the simulated clock and the
 * module consumes them by timestamp, per STAGE1.md. WebHID raw report
 * input arrives in a later turn; joystick mode radios are gamepads and
 * take this path.
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
  stickChannels, stickCaption, stickSideOf, DEFAULT_STICK_MODE, normaliseStickMode,
} from './stickmode.js';

const STORE_KEY = 'webfpv_stick_map_v1';
const PAD_STORE_KEY = 'webfpv.pad.v1';

const DEFAULT_MAP = {
  /* AETR axis order, up and right positive, throttle low at -1. */
  roll: { axis: 0, center: 0, full: 1 },
  pitch: { axis: 1, center: 0, full: -1 },
  yaw: { axis: 3, center: 0, full: 1 },
  throttle: { axis: 2, low: -1, high: 1 },
};

export const CAL_STEPS = ['center', 'sweep', 'throttle', 'roll', 'pitch', 'yaw', 'confirm'];

/*
 * A RADIO WHOSE SWITCHES ARRIVE AS AXES HAS NOTHING TO PRESS.
 *
 * padMenuButtons reads buttons 0 to 3, which is right for a gamepad and for
 * most radios in joystick mode. Some report every switch as an AXIS and
 * expose no buttons at all: `gamepad.buttons` is empty. navRaw still moves
 * the cursor for them, deliberately, because calibration is a menu item and
 * would otherwise be unreachable by the only device that needs it. But
 * nothing selects. The cursor walks the list and Enter never happens: a
 * product that can be browsed and not used.
 *
 * Two answers, and the wizard is the good one.
 *
 *   The MENU SWITCH, assigned in the wizard like any other channel, on its
 *   own axis. Once assigned it edge-latches exactly like a button.
 *
 *   Until then, a HOLD. Any axis held away from rest for SELECT_HOLD_MS
 *   counts as one select, once, until it comes back. A brief excursion
 *   still moves the cursor, which is what makes both gestures fit on one
 *   stick: a flick moves, a hold presses. It is only ever armed for a pad
 *   reporting zero buttons, so no radio that already works changes at all.
 *
 * Back needs no equivalent. Every screen in this shell carries a Back row,
 * so a working select reaches it.
 */
export const SELECT_STEP = 'select';
const SELECT_HOLD_MS = 700;

/* The wizard's steps for a given radio. The menu switch is only asked for
 * when the radio cannot answer any other way, because asking every pilot to
 * assign one is friction for a problem they do not have. */
export function calSteps(hasButtons, axisCount = 0) {
  if (hasButtons) {
    return CAL_STEPS;
  }
  /*
   * AND ONLY WHEN THE RADIO HAS AN AXIS TO SPARE, because otherwise the
   * question has no answer and the wizard becomes a room with no door.
   *
   * The four gimbal channels claim four axes, and usedAxes deliberately
   * keeps the menu switch off every one of them, so on a four axis radio
   * pickUnusedAxis returns -1 on every frame of this step, for ever. Save
   * is only ever enabled on confirm, which is the step after, so the pilot
   * cannot finish and cannot keep what they just did: Escape and start
   * again is the whole of what is left. Reported from the board as "when
   * i'm at step 7 of calibration i can't continue, i don't have any button
   * on my radio, so it's just not finishing the calibration and i can't
   * play", which is exactly this and is a fair description of it.
   *
   * That radio is not left without a way to press Enter. The HOLD gesture
   * is armed for any pad reporting zero buttons whether or not a switch was
   * ever assigned, which is what makes skipping this safe, here and on the
   * Skip that the step itself now offers.
   */
  if (axisCount <= IDENT_CHANNELS.length) {
    return CAL_STEPS;
  }
  const out = CAL_STEPS.slice();
  out.splice(out.indexOf('confirm'), 0, SELECT_STEP);
  return out;
}

/* How far a stick has to leave centre to count as a menu keypress. Shared
 * with main.js padNav, which used to spell it out four more times. */
export const NAV_DEFLECT = 0.55;
const IDENT_CHANNELS = ['throttle', 'roll', 'pitch', 'yaw'];

const CAL = {
  REST_MS: 900,
  REST_NOISE: 0.08,
  SWEEP_TRAVEL: 0.55,
  NEAR_REST: 0.2,
  SWEEP_REST_MS: 450,
  IDENT_DELTA: 0.45,
  IDENT_GAP: 0.18,
  IDENT_HOLD_MS: 400,
  RELEASE_MS: 280,
  /*
   * HOW FAR THE THROTTLE'S REST HAS TO BE FROM THE BOTTOM OF ITS TRAVEL
   * before the rest is believed to be a spring rather than a parked stick.
   * See noteThrottleSpring.
   *
   * A radio told to put its throttle all the way down at the centre step
   * measures 0 here, and a sloppily centred one measures a few hundredths.
   * A gamepad measures a whole unit, because its rest IS the middle and its
   * low end is the bottom of the same stick. 0.35 sits in the empty band
   * between those two populations with room on both sides.
   */
  THROTTLE_SPRING: 0.35,
  /* Above this, a throttle the pilot is not touching is flying the quad, and
   * the check step says so and offers to move zero. See zeroThrottleHere. */
  THROTTLE_IDLE: 0.12,
};

const PAD_PICK = {
  WIGGLE: 0.34,
  WIGGLE_MS: 160,
  IGNORE_MS: 450,
};

/* When the AETR guess is describing somebody else's radio. See
 * noteGuessOrder for what each of these is watching for. */
const GUESS = {
  /* Yaw counts as alive once it has swept this far. A deliberate yaw input
   * is a whole stick: trim, noise and a knocked gimbal are nowhere near it. */
  YAW_ALIVE: 0.30,
  /* An axis the guess does not name has swept this far. The same number the
   * wizard calls a full stick, CAL.SWEEP_TRAVEL. */
  STRAY_SWEPT: 0.55,
  /* And has been seen at this many distinct levels, which is what tells a
   * gimbal from a switch. A two position switch offers two, a three
   * position switch three, a swept stick dozens. */
  STRAY_LEVELS: 6,
  /* The quantiser those levels are counted in. Coarse enough that jitter on
   * a float axis cannot manufacture them. */
  LEVEL_STEP: 1 / 16,
};

function cloneMap(map) {
  return {
    roll: { ...map.roll },
    pitch: { ...map.pitch },
    yaw: { ...map.yaw },
    throttle: { ...map.throttle },
    /* Optional, and null for every radio that has buttons. It is not a
     * flight channel: readGamepad never looks at it. */
    select: map.select ? { ...map.select } : null,
    stored: Boolean(map.stored),
  };
}

function snapshotAxes(gp) {
  const n = Math.min(gp.axes.length, 8);
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = gp.axes[i];
  }
  return out;
}

function listGamepads() {
  const out = [];
  const list = typeof navigator !== 'undefined' && navigator.getGamepads
    ? navigator.getGamepads()
    : [];
  for (let i = 0; i < list.length; i += 1) {
    const gp = list[i];
    if (gp && gp.connected && gp.axes && gp.axes.length >= 4) {
      out.push(gp);
    }
  }
  return out;
}

function padKey(gp) {
  return `${gp.index}\0${gp.id || ''}`;
}

function shortPadName(id) {
  let name = String(id || 'Joystick').replace(/\s+/g, ' ').trim();
  name = name.replace(/\s*\(Vendor:.*$/i, '').trim();
  if (name.length < 4) {
    name = String(id || 'Joystick').trim() || 'Joystick';
  }
  if (name.length > 44) {
    return `${name.slice(0, 42)}...`;
  }
  return name;
}

function loadPadChoice() {
  try {
    const raw = JSON.parse(localStorage.getItem(PAD_STORE_KEY) || 'null');
    if (raw && raw.kind === 'none') {
      return { kind: 'none' };
    }
    if (raw && raw.kind === 'pad' && typeof raw.id === 'string' && Number.isInteger(raw.index)) {
      return { kind: 'pad', id: raw.id, index: raw.index };
    }
  } catch (e) {
    /* Private mode or a corrupt blob: fly the old first-pad rule. */
  }
  return { kind: 'auto' };
}

function savePadChoice(choice) {
  try {
    if (!choice || choice.kind === 'auto') {
      localStorage.removeItem(PAD_STORE_KEY);
      return;
    }
    if (choice.kind === 'none') {
      localStorage.setItem(PAD_STORE_KEY, JSON.stringify({ kind: 'none' }));
      return;
    }
    localStorage.setItem(PAD_STORE_KEY, JSON.stringify({
      kind: 'pad',
      id: choice.id,
      index: choice.index,
    }));
  } catch (e) {
    /* private mode */
  }
}

function maxAbsDelta(axes, rest) {
  return maxAbsDeltaExcept(axes, rest, -1);
}

function maxAbsDeltaExcept(axes, rest, except) {
  let worst = 0;
  const n = Math.min(axes.length, rest.length);
  for (let i = 0; i < n; i += 1) {
    if (i === except) {
      continue;
    }
    const d = Math.abs(axes[i] - rest[i]);
    if (d > worst) {
      worst = d;
    }
  }
  return worst;
}

function expandRange(min, max, axes) {
  const n = Math.min(axes.length, min.length);
  for (let i = 0; i < n; i += 1) {
    if (axes[i] < min[i]) {
      min[i] = axes[i];
    }
    if (axes[i] > max[i]) {
      max[i] = axes[i];
    }
  }
}

function travelCount(min, max, threshold) {
  let n = 0;
  for (let i = 0; i < min.length; i += 1) {
    if (max[i] - min[i] >= threshold) {
      n += 1;
    }
  }
  return n;
}

function usedAxes(draft) {
  const used = new Set();
  /* The menu switch is included: it is asked for last, so this is what
   * stops it being assigned to a gimbal a pilot happens to nudge. */
  for (const ch of IDENT_CHANNELS.concat([SELECT_STEP])) {
    const spec = draft[ch];
    if (spec && Number.isInteger(spec.axis)) {
      used.add(spec.axis);
    }
  }
  return used;
}

function pickUnusedAxis(axes, rest, used) {
  let best = -1;
  let bestAbs = 0;
  let secondAbs = 0;
  const n = Math.min(axes.length, rest.length);
  for (let i = 0; i < n; i += 1) {
    if (used.has(i)) {
      continue;
    }
    const a = Math.abs(axes[i] - rest[i]);
    if (a > bestAbs) {
      secondAbs = bestAbs;
      bestAbs = a;
      best = i;
    } else if (a > secondAbs) {
      secondAbs = a;
    }
  }
  return { best, bestAbs, secondAbs };
}

function channelSpec(axis, rest, sample, min, max) {
  const towardHigh = sample >= rest;
  return {
    axis,
    center: rest,
    pos: towardHigh ? max[axis] : min[axis],
    neg: towardHigh ? min[axis] : max[axis],
  };
}

function throttleSpec(axis, rest, sample, min, max) {
  const towardHigh = sample >= rest;
  return {
    axis,
    low: towardHigh ? min[axis] : max[axis],
    high: towardHigh ? max[axis] : min[axis],
  };
}

/*
 * A THROTTLE THAT SPRINGS BACK HAS NO BOTTOM END, AND THE QUAD TOOK OFF ON
 * ITS OWN BECAUSE THIS CODE ASSUMED IT DID.
 *
 * throttleSpec above maps the far end of the sweep to zero throttle, which
 * is exactly right for a radio: a transmitter's throttle gimbal has no
 * centring spring, so it stays wherever it was put and its bottom stop IS
 * zero. A GAMEPAD's left stick is sprung in both axes. Its bottom stop is
 * one end of a stick that returns to the middle, so the middle, where the
 * stick sits when nobody is touching it, was being read as HALF THROTTLE.
 *
 *   bug-93400859, Fredrik Wormke:
 *   "I found no way to calibrate where 0 throttle is at the resting
 *    position for a gamepad joystick... Drone will take off with no input."
 *
 * Reproduced exactly: a gamepad taken through the wizard the way it asks
 * saves {axis: 2, low: -1, high: 1} and reads 0.500 with nothing touching
 * it. There was no way to calibrate around it, because the wizard never
 * asked the question.
 *
 * It does not have to ask. The release step already watches where the axis
 * goes when the pilot lets go, and it already accepts either answer:
 * `parked` is true at the low end OR back at rest. Which of the two
 * happened is the entire discriminator and it was being thrown away.
 *
 *   a radio      told to put the throttle down, then told to put it back
 *                down, settles AT ITS LOW END. rest and low are the same
 *                place, so there is nothing to correct.
 *   a gamepad    let go, settles AT REST, and rest is a whole unit away
 *                from the low end. Zero throttle belongs at rest.
 *
 * Only `low` moves. `high` is still the end the pilot pushed toward, so
 * full stick is still full throttle, and readGamepad clamps below zero, so
 * pushing the sprung stick past centre the other way is simply idle. The
 * cost is the half of that stick's travel below centre, which is the cost
 * of the control being a centring stick, and it is what the reporter asked
 * for in as many words.
 *
 * A RADIO WHOSE PILOT IGNORED THE CENTRE STEP and left the throttle at
 * mid-stick, then returned it to mid-stick rather than to the bottom,
 * reads as sprung here and gets zero at mid-stick. That is a fair reading
 * of what they demonstrated twice, it is what the prompts asked them not
 * to do, and the failure it produces, half the throttle range, is the
 * recoverable one. The failure in the other direction is a quad that flies
 * away from a pilot who is not touching anything.
 */
/*
 * AND THE DETECTOR ABOVE CAN BE FOOLED BY A PILOT DOING AS THEY ARE TOLD.
 *
 * noteThrottleSpring reads ONE INSTANT, the moment the release timer
 * completes, and asks where the axis ended up. That is a fair question for a
 * gamepad, whose pilot simply lets go, and it is the wrong question for a
 * radio whose throttle self centres, because the release step tells them
 * "Now put the throttle all the way back down" and they HOLD IT THERE. The
 * axis is then sitting on its low end, the detector reads a parked throttle,
 * and the spring is missed:
 *
 *   bug-851a43b7, BetaFPV LiteRadio 3:
 *   "the throttle doesn't go down all the way to 0%. I tried calibrating and
 *    the bottom on the sticks marks the center on the calibrating display."
 *
 * Reproduced through the real wizard: the saved map is {low: -1, high: 1},
 * the check step reads 0.500 with the stick where it rests, and flight reads
 * 0.500 with nobody touching anything.
 *
 * No better instant exists. A pilot may hold the throttle anywhere for any
 * reason and the wizard cannot tell holding from resting, so this stops
 * guessing and ASKS. The check step already shows the live throttle; when it
 * reads high enough to be flying the quad, the screen offers to put zero
 * where the stick is now. The pilot knows whether their hand is on it, and
 * nothing else in this file does.
 */
function noteThrottleSpring(c, spec, axes) {
  const rest = c.rest[spec.axis];
  const settled = axes[spec.axis];
  /* It came back to the low end: a parked throttle, nothing to do. */
  if (Math.abs(settled - rest) > CAL.NEAR_REST) {
    return;
  }
  /* Rest IS the low end: a radio that centred where it was told to. */
  if (Math.abs(rest - spec.low) <= CAL.THROTTLE_SPRING) {
    return;
  }
  spec.low = rest;
  /* Recorded rather than inferred, so a ticket carrying a saved map says
   * which kind of throttle the wizard decided it had. */
  spec.sprung = true;
}

/*
 * Map a raw axis onto -1..1. pos is the raw value that means +1 on the
 * channel, neg is -1. Legacy maps store `full` as (pos - center) instead.
 */
function mapCentered(v, spec) {
  const center = spec.center;
  const pos = spec.pos != null ? spec.pos : center + (spec.full || 1);
  const neg = spec.neg != null ? spec.neg : center - (pos - center);
  if (v >= center) {
    const top = pos > center ? pos : neg;
    const sign = pos > center ? 1 : -1;
    return sign * (v - center) / ((top - center) || 1);
  }
  const bot = pos < center ? pos : neg;
  const sign = pos < center ? 1 : -1;
  return sign * (center - v) / ((center - bot) || 1);
}

function calTitle(c) {
  return {
    center: 'Centre',
    sweep: 'Full range',
    throttle: 'Throttle',
    roll: 'Roll',
    pitch: 'Pitch',
    yaw: 'Yaw',
    select: 'Menu switch',
    confirm: 'Check',
  }[c.step] || '';
}

/*
 * EVERY PROMPT HERE THAT NAMES A STICK WAS NAMING A MODE 2 STICK.
 *
 * "Pull the right stick fully back" is true on a Mode 2 radio and false on a
 * Mode 1 one, where pitch is the left gimbal. The wizard would still have
 * mapped the axis correctly, because it maps whatever moved, but it would
 * have been telling a Mode 1 pilot to move the wrong hand while it did. The
 * side comes out of the pilot's stick mode now. `mode` is threaded in from
 * calibrationView rather than read from a module global, because this file
 * has no idea what the shell's settings are and should not.
 */
function calPrompt(c, mode) {
  if (c.step === 'center') {
    return 'Both sticks in the centre. Throttle all the way down. Hold still.';
  }
  if (c.step === 'sweep') {
    return 'Move both sticks through every corner, and the throttle up and down, then put them back.';
  }
  if (c.step === 'confirm') {
    return `Move the sticks. Left is ${stickCaption(mode, 'left').toLowerCase()},`
      + ` right is ${stickCaption(mode, 'right').toLowerCase()}.`;
  }
  const side = (ch) => stickSideOf(mode, ch);
  if (c.phase === 'release') {
    return {
      throttle: 'Now put the throttle all the way back down.',
      roll: `Let the ${side('roll')} stick come back to the centre.`,
      pitch: `Let the ${side('pitch')} stick come back to the centre.`,
      yaw: `Let the ${side('yaw')} stick come back to the centre.`,
      select: 'Put it back where it was.',
    }[c.step] || 'Return to rest.';
  }
  return {
    throttle: 'Push the throttle all the way up and hold it.',
    roll: `Hold the ${side('roll')} stick fully to the right.`,
    pitch: `Pull the ${side('pitch')} stick fully back, toward you.`,
    yaw: `Hold the ${side('yaw')} stick fully to the right.`,
    /* Only ever asked of a radio reporting no buttons at all, so there is
     * no press to describe and the pilot is choosing which switch becomes
     * one. See SELECT_STEP. */
    select: 'Throw the switch you want to use as Enter, and hold it.',
  }[c.step] || '';
}

function calHint(c, travelled, need, gp, idleThrottle = 0) {
  if (!gp) {
    return 'Radio disconnected. Plug it back in, joystick mode.';
  }
  if (c.step === 'center') {
    return 'Waiting until the reading is steady.';
  }
  if (c.step === 'sweep') {
    return travelled < need
      ? `Keep going. Full travel on ${travelled} of ${need} axes so far.`
      : 'Back to rest to continue.';
  }
  if (c.step === 'confirm') {
    /* A throttle reading this high with the sticks sitting where the pilot
     * left them is a quad that will fly itself. Say the number, because the
     * gimbal alone does not make it obvious, and name the way out. */
    if (idleThrottle > CAL.THROTTLE_IDLE) {
      return `Throttle is reading ${Math.round(idleThrottle * 100)} percent right now.`
        + ' If that is where your throttle sits when you let go, press T or'
        + ' Throttle zero is here.';
    }
    return c.draft && c.draft.select
      ? 'Enter, Save mapping, or the switch you just assigned. Escape cancels.'
      : 'Enter or Save mapping keeps it. Escape cancels.';
  }
  if (c.step === 'select') {
    return 'This radio reports no buttons, so one channel can be the button.'
      + ' No switch to spare? Skip. Holding any stick away from centre for'
      + ' a second counts as a press either way.';
  }
  if (c.phase === 'release') {
    return 'One direction at a time. Diagonals are ignored.';
  }
  return 'Hold it there. Diagonals are ignored.';
}

/*
 * THE KEYS ARE TWO STICKS, AND THE MODE SAYS WHAT EACH STICK DOES.
 *
 * WASD is the left gimbal and the arrows are the right one. That was always
 * the arrangement; what was hard-wired was the CHANNEL on each of them, so a
 * Mode 1 pilot reaching for the right stick's throttle got pitch and could
 * not fly. See stickmode.js.
 *
 * `up` is forward on both, which is why the vertical pair is read by
 * direction rather than by sign: forward on a PITCH stick is nose down, so
 * the forward key is the negative one, while forward on a THROTTLE is more
 * throttle, so the forward key is the positive one. Getting that backwards
 * is the whole of what Mode 1 would feel like if this were a straight swap.
 */
const KEY_STICKS = {
  left: {
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  },
  right: {
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  },
};

/* The spring centred channels only: [channel, negative key, positive key].
 * Throttle is not here because it does not spring and is not integrated the
 * same way; see throttleKeys and readKeyboard. */
function keyAxes(mode) {
  const c = stickChannels(mode);
  const out = [];
  for (const side of ['left', 'right']) {
    const k = KEY_STICKS[side];
    out.push([c[side].horiz, k.left, k.right]);
    if (c[side].vert !== 'throttle') {
      out.push([c[side].vert, k.up, k.down]);
    }
  }
  return out;
}

/* Whichever gimbal is carrying the collective this mode. */
function throttleKeys(mode) {
  const c = stickChannels(mode);
  const side = c.left.vert === 'throttle' ? 'left' : 'right';
  return { up: KEY_STICKS[side].up, down: KEY_STICKS[side].down };
}

/*
 * HOLD TIME TO STICK, which is the only analog a key can offer.
 *
 * RATE_UP of 9 reached full deflection in 110 ms, so a tap and a punch
 * were the same input. A radio stick can sit at 30 percent for a whole
 * straight. A key cannot: holding it used to run away to the stop.
 *
 * analogMag(heldMs) is the stick travel while the key is down:
 *   tap     ~90 ms  -> 0.16  a nudge, then spring back on release
 *   hold    240 ms  -> 0.34  a flyable cruise, and it STAYS there
 *   stretch 750 ms  still cruise, so a gate does not become a punch
 *   full   1250 ms  -> 1.00  committed, only a long hold
 *
 * Release springs to rest. Throttle rest is hover once airborne, else 0.
 * Hitch protection is on the hold clock (40 ms), not on a per-frame
 * stick step: the mag comes from time, so a slow frame cannot skip the
 * nudge band the way RATE_UP * 100 ms used to.
 */
function analogMag(heldMs) {
  const TAP_MS = 90;
  const TAP = 0.16;
  const CRUISE_MS = 240;
  const CRUISE = 0.34;
  const STRETCH_MS = 750;
  const FULL_MS = 1250;
  if (heldMs <= 0) {
    return 0;
  }
  if (heldMs <= TAP_MS) {
    return TAP * (heldMs / TAP_MS);
  }
  if (heldMs <= CRUISE_MS) {
    const u = (heldMs - TAP_MS) / (CRUISE_MS - TAP_MS);
    return TAP + (CRUISE - TAP) * u;
  }
  if (heldMs <= STRETCH_MS) {
    return CRUISE;
  }
  if (heldMs >= FULL_MS) {
    return 1;
  }
  const u = (heldMs - STRETCH_MS) / (FULL_MS - STRETCH_MS);
  return CRUISE + (1 - CRUISE) * u;
}

export class InputManager {
  constructor() {
    this.channels = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    this.queue = [];
    this.source = 'the keyboard';
    /* The thumb sticks, when a touch device mounted them: an object with
     * active(), sample(dtMs) and reset(), from src/input/touchsticks.js.
     * Sits under a radio and over the keyboard in poll()'s ladder. */
    this.touchSource = null;
    this.keys = new Set();
    this.kb = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    /* Keyboard collective, used only when no radio is the stick source.
     * kbAir: W has taken us off the pad and S has not yet parked us.
     * kbThrFromKeys: W or S actually drove throttle this session, so a
     * harness poke via __stick is left alone instead of sprung. */
    this.kbAir = false;
    this.kbThrFromKeys = false;
    /* While launch control is holding on the pad, rest is idle, never hover,
     * so a W tap cannot spring to 22 percent and fire the launch. */
    this.forcePadRest = false;
    /*
     * The harness stick, set through window.__stick and nothing else. When
     * non-null it IS the channels, held like a radio's gimbals until the
     * next write, above every source in poll()'s ladder. It exists because
     * the keyboard path recomputes its axes from held KEYS every poll, so a
     * value written into this.kb evaporated one poll later and a capture
     * literally could not hold a stick: the og card round measured the
     * fallout, several runs of a craft that could not leave the grass.
     * Nothing in the shell writes this; a pilot never meets it.
     */
    this.harnessChannels = null;
    this.kbHoldMs = { roll: 0, pitch: 0, yaw: 0, w: 0, s: 0 };
    this.kbHoldDir = { roll: 0, pitch: 0, yaw: 0 };
    this.map = this.loadMap();
    this.padChoice = loadPadChoice();
    this.padPick = null;
    this.padPickQueued = null;
    this.padPickResult = null;
    this.seenPadKeys = new Set();
    this.padWasPresent = false;
    this.calibration = null;
    this.calResult = null;
    this.lastWall = performance.now();
    this.padArmed = false; /* set once the pad's menu buttons are seen released */
    this.navRest = null;   /* axis rest values, for uncalibrated menu nav */
    /* Whether the axis the AETR guess calls the throttle has ever been seen
     * parked away from centre. See mapUsable. Reset with the pad, because it
     * is a fact about one radio and not about this browser. */
    this.mapSeenParked = false;
    /* The travel seen on every axis while flying an uncalibrated map, and
     * the two verdicts drawn from it. Reset with the pad, same reason. See
     * noteGuessOrder. */
    this.guessSpan = null;
    this.guessYawAlive = false;
    this.guessWrongOrder = false;
    /* The hold-to-select bootstrap for a radio reporting zero buttons.
     * See SELECT_STEP. */
    this.holdMs = 0;
    this.holdFired = false;
    this.holdAt = 0;
    this.onKey = null; /* main.js hooks non stick keys here; (code, repeat) */
    /* Which stick carries which channel, for the keyboard and for every
     * gimbal this shell draws. A radio's mode lives in the radio. See
     * stickmode.js. */
    this.stickMode = DEFAULT_STICK_MODE;
    this.keyAxes = keyAxes(this.stickMode);
    this.throttleKeys = throttleKeys(this.stickMode);

    /*
     * STICK RATE, AND WHY IT IS NOT THE FRAME RATE ANY MORE.
     *
     * poll() used to be called once per rendered frame and main.js used the
     * newest sample for every RC frame in that render frame. At 60 fps the
     * flight controller therefore saw the same stick value four times and
     * then a jump, while updateRcRefreshRate told it the link was 250 Hz.
     * Two things follow, and the second is the one a pilot feels.
     *
     * Betaflight auto-tunes its rc smoothing cutoffs from the interval it
     * measures, so it filtered for a 250 Hz link and the 60 Hz staircase
     * walked through it. And feedforward is the DERIVATIVE of the setpoint
     * between rc frames, so it saw zero, zero, zero, spike: an impulse train
     * at frame rate instead of a signal. Feedforward is most of what makes a
     * quad feel connected to your thumb.
     *
     * So the pad is polled on its own timer now, independent of
     * requestAnimationFrame, and every sample carries the wall clock time it
     * was taken at. main.js maps those onto the RC grid by timestamp.
     *
     * Whether that actually yields fresher data is a property of the browser
     * and the device, not something this file can assert, so it is MEASURED:
     * padHz counts how often the Gamepad object's own timestamp changes, and
     * sampleHz counts what reaches the queue. If padHz sits at the frame rate
     * the browser is rAF-locked and only WebHID will fix it.
     */
    this.timer = null;
    this.padStamp = -1;
    this.padUpdates = 0;
    this.samplesTaken = 0;
    this.rateWindowMs = 0;
    this.padHz = 0;
    this.sampleHz = 0;

    /*
     * STICK RESOLUTION, AND WHY THE MEASUREMENT IS ONE SIDED.
     *
     * padHz says how OFTEN the browser refreshes a stick. It says nothing
     * about how FINELY. A radio in USB joystick mode reports each axis with
     * whatever bit depth its firmware chose, the browser normalises that to
     * a float, and two radios on the same desk can hand this page travel
     * quantised to 256 steps or to 65,536. The coarse one steps its way
     * through a rate curve, and feedforward is the DERIVATIVE of the
     * setpoint, so a step is a spike. That is one of the two ways a report
     * can say "twitchy" about code that did not change.
     *
     * What is recorded is the smallest non-zero change seen on any mapped
     * axis since the pad was picked. For a genuine quantiser that IS the
     * step, because every change is a whole number of them.
     *
     * READ IT IN ONE DIRECTION ONLY. Noise, a browser's own normalisation
     * arithmetic and a float axis all push the minimum DOWN, never up. So a
     * coarse reading is evidence and a fine one is not: 0.0078 means eight
     * bits and can be believed, while 1e-7 means only "nothing coarse was
     * seen yet", which is the answer before the stick has properly moved.
     */
    this.axisPrev = new Map();
    this.axisStepMin = 0;

    window.addEventListener('keydown', (e) => {
      /*
       * A text field owns its own keys. This listener is on the window and
       * the fields below it (the pilot name, the course name, the board
       * address, the FC dump) do not stop propagation for anything but
       * Enter and Escape, so without this bail out the preventDefault below
       * ate the space bar: a pilot could not type a space in their own name,
       * and the arrows could not move the caret. Sticks are not flown from a
       * text box, so swallowing the whole event here is right.
       */
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        /* Escape still belongs to the menu: a focused rates field or CLI
         * dump used to swallow it, so the FC screen had no leave key. */
        if (e.code === 'Escape' && !e.repeat && this.onKey) {
          this.onKey(e.code, false);
        }
        return;
      }
      if (!e.repeat) {
        this.keys.add(e.code);
      }
      if (this.onKey) {
        this.onKey(e.code, e.repeat);
      }
      /* Repeats must preventDefault too. Skipping them used to let ArrowDown
       * scroll the menu while the cursor stayed put, then a synthetic
       * mousemove snapped the highlight back to the row under the mouse. */
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.seedPadRoster();
  }

  loadMap() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        return cloneMap({ ...DEFAULT_MAP, ...JSON.parse(raw), stored: true });
      }
    } catch {
      /* fall through to default */
    }
    return cloneMap({ ...DEFAULT_MAP, stored: false });
  }

  /*
   * Guarded, like loadMap above it and like savePadChoice and saveSettings.
   * It was the one bare localStorage write left in the shell, and setItem
   * throws in private mode and on a full quota. The throw came out of
   * acceptCalibration, past main.js's `if (input.acceptCalibration())`, and
   * stranded the pilot on the calibration screen: the map was already in
   * memory and worked for that session, but the screen never closed and the
   * only visible sign was a console error. Failing to PERSIST a mapping is
   * a disappointment. Failing to leave the wizard is a broken page.
   */
  saveMap() {
    this.map.stored = true;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.map));
      return true;
    } catch (e) {
      /*
       * Private mode or no quota. `stored` STAYS TRUE, deliberately. It reads
       * like a fact about localStorage and is used as a fact about the map:
       * padNav in main.js only lets a radio drive the menus when it is set,
       * and the readout says "a radio that is not calibrated yet" when it is
       * not. Clearing it here would take stick navigation away from somebody
       * who had just finished calibrating, and call their mapping uncalibrated
       * while it was flying the quad. The map is calibrated. It simply will
       * not survive a reload in this browser.
       *
       * BUT THE PILOT HAS TO BE TOLD, and for a long time they were not.
       * This swallowed the throw whole and the shell went on to print
       * "Stick mapping saved." over the top of it. The next visit had none
       * of it, so the radio was uncalibrated again with no account of what
       * had happened to the minute they spent: "Do not save the stcks
       * movement after setupp of Radiomaster Pocket", filed five minutes
       * after the same pilot's ticket about the step before this one.
       *
       * So the failure is returned rather than hidden. What it is NOT is a
       * refusal: the mapping is live and the quad flies on it for as long
       * as this tab is open, which is worth saying plainly and is better
       * than throwing the calibration away over a storage quota.
       */
      return false;
    }
  }

  /*
   * IS THE BUILT IN GUESS ACTUALLY THIS RADIO'S STICK ORDER?
   *
   * DEFAULT_MAP is not a placeholder, it is AETR: the order every real
   * transmitter in joystick mode reports, and the order this page's own
   * advice tells a pilot to put their radio in. A pilot with such a radio
   * plugs it in, the sticks fly the quad correctly, and they never open the
   * wizard because nothing is wrong. The shell called that pilot's radio
   * "not calibrated yet" on the front page, in red, forever. Reported as a
   * bug, and it is one: the claim was about a FLAG, `map.stored`, which
   * records whether somebody has been through the wizard, not whether the
   * mapping is right.
   *
   * There is a cheap observation that tells the two apart, and it is the
   * throttle. A THROTTLE DOES NOT SPRING BACK. On a Mode 2 transmitter the
   * left gimbal has no vertical centring spring, so a parked radio leaves
   * that axis sitting at one end, and the axis DEFAULT_MAP calls the
   * throttle reads near -1 with nobody touching it. Every other axis on the
   * machine is spring centred and reads about zero. So if the guessed
   * throttle axis is parked off centre, the guess is describing a real
   * throttle and the mapping is behaving like a radio's.
   *
   * If it is NOT, the guess is wrong in the way that matters most: a
   * gamepad, where axis 2 is half of the right stick, would have "throttle"
   * spring centred at half power. That pilot does need the wizard and is
   * told so.
   *
   * Sticky, because a pilot who moves the throttle through centre has not
   * suddenly acquired a different radio, and a warning that blinks is worse
   * than either answer.
   */
  noteThrottleParked(gp) {
    if (this.mapSeenParked || this.map.stored) {
      return;
    }
    const spec = this.map.throttle;
    if (!gp || !spec || !Number.isInteger(spec.axis) || spec.axis >= gp.axes.length) {
      return;
    }
    if (Math.abs(gp.axes[spec.axis]) > 0.35) {
      this.mapSeenParked = true;
    }
  }

  /*
   * AND IS THE GUESS'S YAW REALLY THIS RADIO'S YAW?
   *
   * noteThrottleParked asks the best single question there is about the
   * guess, and a parked throttle is a real answer. But it is ONE AXIS OUT
   * OF FOUR, and it is the only one anything was ever asking about. A radio
   * can satisfy it and still be wrong everywhere else: AETR puts yaw on
   * axis 3, and plenty of transmitters in joystick mode put a slider, a
   * knob or a switch there and yaw further out. That pilot flies with roll,
   * pitch and throttle correct and NO YAW AT ALL, and because the throttle
   * parked, the shell has already decided the guess is behaving like a
   * radio and says nothing at all.
   *
   * Three tickets off the board are this, and none of them knew it:
   * "My yaw doesn't work", "Cant yaw", "No yaw, automatic eject". The third
   * is the same fault read from the other end, a spring centred axis being
   * flown as a throttle, which is a quad that takes off on its own.
   *
   * The observation needs no wizard and costs one pass over the axes. Watch
   * how far each axis has ever travelled. If the axis the guess calls yaw
   * has never left centre, while an axis the guess does not name has swept
   * a full stick's worth AND has been seen at enough distinct levels to be
   * a gimbal rather than a switch, then the pilot is flying a map that does
   * not describe their radio, and the thing they cannot do is yaw.
   *
   * ALIVE LATCHES AND ALIVE WINS. The moment yaw moves once the question is
   * settled in the guess's favour for good, and nothing this function could
   * see afterwards is allowed to reopen it, for the reason on
   * noteThrottleParked: a warning that blinks is worse than either answer.
   *
   * The wrong verdict is NOT a latch of the same kind. It holds until yaw
   * moves, and then it clears, once, permanently. The first draft latched
   * both and returned early on either, which meant the one false positive
   * this can produce, a pilot whose yaw is mapped correctly, who has not
   * touched it yet, and who has swept some other proportional control a
   * long way, got a warning that STAYED UP after they went on to yaw and
   * proved it wrong, until they calibrated or re-picked the pad. The row's
   * own words are "has not moved once", and a row that keeps saying that
   * after it has moved is the blinking warning's uglier cousin. So the
   * spans keep being watched while the row is up, and yaw moving takes it
   * down. That is one transition, not a blink, and it is the transition
   * the sentence above says matters most.
   *
   * What is left is that same pilot seeing the row until the first time
   * they yaw. They get a row offering calibration, and calibration is not a
   * wrong thing to offer them.
   */
  noteGuessOrder(gp) {
    if (this.map.stored || this.guessYawAlive) {
      return;
    }
    const n = Math.min(gp.axes.length, 8);
    if (!this.guessSpan || this.guessSpan.length !== n) {
      this.guessSpan = [];
      for (let i = 0; i < n; i += 1) {
        this.guessSpan.push({ lo: gp.axes[i], hi: gp.axes[i], levels: new Set() });
      }
    }
    for (let i = 0; i < n; i += 1) {
      const v = gp.axes[i];
      const seen = this.guessSpan[i];
      if (v < seen.lo) {
        seen.lo = v;
      }
      if (v > seen.hi) {
        seen.hi = v;
      }
      /* Bounded: once it is proportional enough, stop counting. */
      if (seen.levels.size < GUESS.STRAY_LEVELS) {
        seen.levels.add(Math.round(v / GUESS.LEVEL_STEP));
      }
    }
    const yawAxis = this.map.yaw && Number.isInteger(this.map.yaw.axis)
      ? this.map.yaw.axis
      : -1;
    if (yawAxis < 0 || yawAxis >= n) {
      return;
    }
    if (this.guessSpan[yawAxis].hi - this.guessSpan[yawAxis].lo >= GUESS.YAW_ALIVE) {
      this.guessYawAlive = true;
      this.guessWrongOrder = false;
      return;
    }
    /* Decided, and still watching yaw above: nothing below can change. */
    if (this.guessWrongOrder) {
      return;
    }
    const named = new Set();
    for (const ch of IDENT_CHANNELS) {
      const spec = this.map[ch];
      if (spec && Number.isInteger(spec.axis)) {
        named.add(spec.axis);
      }
    }
    for (let i = 0; i < n; i += 1) {
      if (named.has(i)) {
        continue;
      }
      const seen = this.guessSpan[i];
      if (seen.hi - seen.lo >= GUESS.STRAY_SWEPT && seen.levels.size >= GUESS.STRAY_LEVELS) {
        this.guessWrongOrder = true;
        return;
      }
    }
  }

  /* Can the mapping be trusted for more than flying: a pilot's own map
   * always, and the AETR guess once it has behaved like a radio. This is
   * what decides whether the menus let the sticks move left and right, and
   * whether the front page says anything at all. */
  mapUsable() {
    return Boolean(this.map.stored || this.mapSeenParked);
  }

  firstGamepad() {
    const pads = listGamepads();
    if (!pads.length) {
      return null;
    }
    const choice = this.padChoice;
    if (choice && choice.kind === 'none') {
      return null;
    }
    if (choice && choice.kind === 'pad') {
      const exact = this.matchPad(pads, choice);
      if (exact) {
        return exact;
      }
      return null;
    }
    return pads[0];
  }

  matchPad(pads, choice) {
    if (!choice || choice.kind !== 'pad') {
      return null;
    }
    for (let i = 0; i < pads.length; i += 1) {
      if (pads[i].id === choice.id && pads[i].index === choice.index) {
        return pads[i];
      }
    }
    const sameId = [];
    for (let i = 0; i < pads.length; i += 1) {
      if (pads[i].id === choice.id) {
        sameId.push(pads[i]);
      }
    }
    return sameId.length === 1 ? sameId[0] : null;
  }

  setPadChoice(choice) {
    this.padChoice = choice;
    savePadChoice(choice);
    this.navRest = null;
    this.padArmed = false;
    /* A different radio has to earn it again: see noteThrottleParked. It is
     * a fact about the machine that is plugged in, and this is the line
     * where that machine changes. */
    this.mapSeenParked = false;
    /* And what its axes have been seen doing: see noteGuessOrder. */
    this.guessSpan = null;
    this.guessYawAlive = false;
    this.guessWrongOrder = false;
    /* And so is the stick resolution. Same line, same reason. */
    this.forgetAxisResolution();
  }

  seedPadRoster() {
    const pads = listGamepads();
    this.seenPadKeys = new Set(pads.map(padKey));
    this.padWasPresent = Boolean(this.matchPad(pads, this.padChoice));
    if (pads.length >= 2) {
      this.padPickQueued = 'boot';
      return;
    }
    if (pads.length === 1 && !this.matchPad(pads, this.padChoice)) {
      this.setPadChoice({ kind: 'pad', id: pads[0].id, index: pads[0].index });
      this.padWasPresent = true;
    }
  }

  /*
   * Chrome often hides a pad until something on it moves, and Windows can
   * reorder the Game Controllers list on a replug, so the roster is polled
   * rather than trusted to gamepadconnected. A new key in the list is a
   * device the picker has not seen this session.
   */
  notePadRoster() {
    const pads = listGamepads();
    const nowKeys = new Set(pads.map(padKey));
    let added = 0;
    nowKeys.forEach((k) => {
      if (!this.seenPadKeys.has(k)) {
        added += 1;
      }
    });
    const prevCount = this.seenPadKeys.size;
    this.seenPadKeys = nowKeys;
    if (this.padPick) {
      return;
    }
    if (added > 0 && pads.length >= 2) {
      this.padPickQueued = prevCount === 0 ? 'boot' : 'hotplug';
      return;
    }
    if (added > 0 && pads.length === 1 && !this.matchPad(pads, this.padChoice)) {
      this.setPadChoice({ kind: 'pad', id: pads[0].id, index: pads[0].index });
    }
    if (this.padChoice && this.padChoice.kind === 'pad') {
      const found = this.matchPad(pads, this.padChoice);
      if (found) {
        this.padWasPresent = true;
      } else if (this.padWasPresent && pads.length >= 1) {
        this.padWasPresent = false;
        this.padPickQueued = this.padPickQueued || 'missing';
      } else {
        this.padWasPresent = false;
      }
    }
  }

  takePadPickQueue() {
    const reason = this.padPickQueued;
    this.padPickQueued = null;
    return reason;
  }

  requestPadPick(reason) {
    if (this.padPick) {
      return;
    }
    this.padPickQueued = reason || 'menu';
  }

  startPadPick(reason) {
    const pads = listGamepads();
    if (!pads.length) {
      return false;
    }
    this.padPick = {
      reason: reason || 'menu',
      phase: 'wiggle',
      candidateKey: null,
      blockedKey: null,
      ignoreUntil: 0,
      holdMs: 0,
      rest: new Map(),
      armed: false,
    };
    this.padPickResult = null;
    this.snapshotPadRests(pads);
    return true;
  }

  snapshotPadRests(pads) {
    const p = this.padPick;
    if (!p) {
      return;
    }
    const live = pads || listGamepads();
    const keep = new Set();
    for (let i = 0; i < live.length; i += 1) {
      const gp = live[i];
      const key = padKey(gp);
      keep.add(key);
      if (!p.rest.has(key) || p.rest.get(key).length !== Math.min(gp.axes.length, 8)) {
        p.rest.set(key, snapshotAxes(gp));
      }
    }
    p.rest.forEach((v, key) => {
      if (!keep.has(key)) {
        p.rest.delete(key);
        if (p.candidateKey === key) {
          p.phase = 'wiggle';
          p.candidateKey = null;
          p.holdMs = 0;
          p.armed = false;
        }
      }
    });
  }

  cancelPadPick() {
    this.padPick = null;
    this.padPickResult = 'cancelled';
  }

  skipPadPick() {
    this.setPadChoice({ kind: 'none' });
    this.padWasPresent = false;
    this.padPick = null;
    this.padPickResult = 'skipped';
  }

  acceptPadPick() {
    const p = this.padPick;
    if (!p || p.phase !== 'confirm' || !p.candidateKey) {
      return false;
    }
    const pads = listGamepads();
    const gp = pads.find((g) => padKey(g) === p.candidateKey);
    if (!gp) {
      return false;
    }
    this.setPadChoice({ kind: 'pad', id: gp.id, index: gp.index });
    this.padWasPresent = true;
    this.padPick = null;
    this.padPickResult = 'accepted';
    return true;
  }

  rejectPadPick() {
    const p = this.padPick;
    if (!p) {
      return;
    }
    const blocked = p.candidateKey;
    p.phase = 'wiggle';
    p.candidateKey = null;
    p.holdMs = 0;
    p.armed = false;
    p.blockedKey = blocked;
    p.ignoreUntil = performance.now() + PAD_PICK.IGNORE_MS;
    this.snapshotPadRests();
  }

  padPickView() {
    const p = this.padPick;
    if (!p) {
      return null;
    }
    const pads = listGamepads();
    this.snapshotPadRests(pads);
    const now = performance.now();
    const cards = [];
    for (let i = 0; i < pads.length; i += 1) {
      const gp = pads[i];
      const key = padKey(gp);
      const rest = p.rest.get(key) || snapshotAxes(gp);
      const motion = maxAbsDelta(snapshotAxes(gp), rest);
      const axes = [0, 0, 0, 0];
      for (let a = 0; a < 4; a += 1) {
        axes[a] = gp.axes[a] || 0;
      }
      cards.push({
        key,
        title: `Joystick ${i + 1}`,
        name: shortPadName(gp.id),
        motion,
        live: motion >= PAD_PICK.WIGGLE,
        chosen: p.candidateKey === key,
        axes,
      });
    }
    const chosen = cards.find((c) => c.chosen) || null;
    let prompt = 'Move the joystick you want to fly with.';
    let hint = 'Each box is one plugged-in device. The one you move lights up.';
    if (!cards.length) {
      prompt = 'No joystick found.';
      hint = 'Plug one in, set it to joystick mode, then move it.';
    } else if (p.phase === 'confirm' && chosen) {
      prompt = `Use ${chosen.title}?`;
      hint = 'Yes keeps it. No waits for another wiggle.';
    }
    const skipLabel = p.reason === 'menu' ? 'Cancel' : 'Use keyboard instead';
    return {
      phase: p.phase,
      reason: p.reason,
      prompt,
      hint,
      canAccept: p.phase === 'confirm' && Boolean(chosen),
      skipLabel,
      cooling: now < p.ignoreUntil,
      pads: cards,
    };
  }

  runPadPick(dtMs) {
    const p = this.padPick;
    if (!p) {
      return;
    }
    const pads = listGamepads();
    this.snapshotPadRests(pads);
    const now = performance.now();
    if (p.phase === 'confirm') {
      const gp = pads.find((g) => padKey(g) === p.candidateKey);
      if (!gp) {
        this.rejectPadPick();
        return;
      }
      const at = (i) => Boolean(gp.buttons && gp.buttons[i] && gp.buttons[i].pressed);
      const b = [at(0), at(1), at(2), at(3)];
      const any = b.some(Boolean);
      if (!p.armed) {
        if (!any) {
          p.armed = true;
        }
        return;
      }
      if (b[1]) {
        this.rejectPadPick();
        return;
      }
      if (b[0] || b[2] || b[3]) {
        this.acceptPadPick();
      }
      return;
    }
    if (now < p.ignoreUntil) {
      p.holdMs = 0;
      return;
    }
    let best = null;
    let bestMotion = 0;
    for (let i = 0; i < pads.length; i += 1) {
      const gp = pads[i];
      const key = padKey(gp);
      const rest = p.rest.get(key);
      if (!rest) {
        continue;
      }
      const motion = maxAbsDelta(snapshotAxes(gp), rest);
      if (p.blockedKey && key === p.blockedKey) {
        if (motion < PAD_PICK.WIGGLE) {
          p.blockedKey = null;
        } else {
          continue;
        }
      }
      if (motion > bestMotion) {
        bestMotion = motion;
        best = key;
      }
    }
    if (!best || bestMotion < PAD_PICK.WIGGLE) {
      p.holdMs = 0;
      return;
    }
    p.holdMs += dtMs;
    if (p.holdMs < PAD_PICK.WIGGLE_MS) {
      return;
    }
    p.phase = 'confirm';
    p.candidateKey = best;
    p.holdMs = 0;
    p.armed = false;
  }

  padSummary() {
    const pads = listGamepads();
    const selected = this.firstGamepad();
    let using = 'Keyboard';
    if (selected) {
      const n = pads.findIndex((g) => g.index === selected.index && g.id === selected.id) + 1;
      using = n > 0 ? `Joystick ${n}, ${shortPadName(selected.id)}` : shortPadName(selected.id);
    } else if (this.padChoice && this.padChoice.kind === 'none') {
      using = 'Keyboard';
    }
    return {
      count: pads.length,
      using,
      /*
       * What the shell needs to say when a radio cannot be used, rather
       * than leaving the pilot to work it out from a cursor that moves and
       * an Enter that does nothing. See SELECT_STEP.
       *
       * buttons     0 means every switch on this radio arrives as an axis.
       * hasSelect   a menu switch has been assigned in the wizard.
       * calibrated  the axis map is this pilot's, not the AETR guess. Until
       *             it is, navRaw gives up and down only, so no value row
       *             can be adjusted from the sticks.
       */
      buttons: selected && selected.buttons ? selected.buttons.length : 0,
      hasSelect: Boolean(this.map && this.map.select),
      calibrated: Boolean(this.map && this.map.stored),
      /* mapUsable  the mapping is this pilot's, or the AETR guess has been
       *            seen behaving like a radio. See mapUsable. */
      mapUsable: this.mapUsable(),
      /* guessNoYaw the guess's yaw axis has never moved while another axis
       *            the guess cannot see has been swept like a gimbal. The
       *            pilot has no yaw and does not know why. See
       *            noteGuessOrder. */
      guessNoYaw: this.guessWrongOrder,
    };
  }

  /*
   * Menu buttons on the first gamepad: index 1 goes back, indices 0, 2
   * and 3 select. Not every button, because a radio in joystick mode
   * reports its switches as buttons and a latched arming switch reads as
   * pressed forever: counting every button made a latched switch fire the
   * first menu item before the player saw the title.
   *
   * Nothing counts until the pad has been seen with both buttons
   * released, for the same reason.
   */
  /*
   * Is the assigned menu switch thrown? mapCentered turns the raw axis into
   * the same -1..1 the gimbals use, so a switch assigned by flicking it up
   * reads positive when it is up, whichever way round the hardware sends it.
   * NAV_DEFLECT is the threshold the cursor already uses, so a switch and a
   * stick agree about how far is far enough.
   */
  selectAxisThrown(gp, spec) {
    if (!gp || !spec || !Number.isInteger(spec.axis) || spec.axis >= gp.axes.length) {
      return false;
    }
    return mapCentered(gp.axes[spec.axis], spec) >= NAV_DEFLECT;
  }

  /*
   * The bootstrap for a radio with no buttons and no menu switch yet: any
   * axis held away from rest counts as ONE select, once, until it comes
   * back. See SELECT_STEP above for why this exists and why it is armed
   * only in that case.
   *
   * navRest is the resting snapshot navRaw already keeps, so this and the
   * cursor agree about where the sticks live and a stick parked off centre
   * at page load does not press anything.
   */
  holdSelect(gp) {
    /*
     * Its own clock, rather than a frame delta threaded down from main.js
     * through padNav. This is the MENU, not the physics path: nothing here
     * reaches the integrator, and the alternative is a new argument on a
     * call chain that has no delta to give it. Clamped, so a backgrounded
     * tab coming forward does not arrive with a two second hold already
     * banked and press whatever the cursor is on.
     */
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    const dtMs = this.holdAt ? Math.min(100, Math.max(0, now - this.holdAt)) : 0;
    this.holdAt = now;
    if (!this.navRest || this.navRest.length !== gp.axes.length) {
      this.holdMs = 0;
      this.holdFired = false;
      return false;
    }
    let worst = 0;
    for (let i = 0; i < gp.axes.length; i += 1) {
      const d = Math.abs(gp.axes[i] - this.navRest[i]);
      if (d > worst) {
        worst = d;
      }
    }
    if (worst < NAV_DEFLECT) {
      this.holdMs = 0;
      this.holdFired = false;
      return false;
    }
    this.holdMs += dtMs;
    if (this.holdMs < SELECT_HOLD_MS || this.holdFired) {
      return false;
    }
    /* Latched until release, so a stick left leaning does not press the
     * same row sixty times a second. */
    this.holdFired = true;
    return true;
  }

  padMenuButtons() {
    const gp = this.firstGamepad();
    if (gp && gp.axes && (!gp.buttons || !gp.buttons.length)) {
      /*
       * ZERO BUTTONS. Everything below reads buttons and would return a
       * permanent no, which is the dead end: a cursor that walks and an
       * Enter that never happens.
       */
      const spec = this.calibration && this.calibration.draft
        ? (this.calibration.draft.select || this.map.select)
        : this.map.select;
      if (spec) {
        /* Level, not an edge. The caller latches edges through padPrev,
         * exactly as it does for a real button. */
        return { select: this.selectAxisThrown(gp, spec), back: false };
      }
      return { select: this.holdSelect(gp), back: false };
    }
    if (!gp || !gp.buttons) {
      /* Disarm as well as bail. The release guard below only runs once per
       * arming, so a pad that goes away and comes back with a latched
       * switch still held would have kept the arming it earned before it
       * was unplugged, and fired the first menu item on sight. */
      this.padArmed = false;
      return { select: false, back: false };
    }
    const at = (i) => Boolean(gp.buttons[i] && gp.buttons[i].pressed);
    const b = [at(0), at(1), at(2), at(3)];
    if (!this.padArmed) {
      if (!b.some(Boolean)) {
        this.padArmed = true;
      }
      return { select: false, back: false };
    }
    /* Button 1 goes back, the rest select. A radio's switches land
     * anywhere in this range, so more than one selects; the release guard
     * above is what makes that safe. */
    return { select: b[0] || b[2] || b[3], back: b[1] };
  }

  /*
   * Cursor movement for a radio whose axis order is not known yet.
   *
   * Menu navigation cannot depend on calibration, because the way to
   * calibrate is a menu item: if the AETR guess is wrong the cursor will
   * not move and the fix is unreachable by the only device that needs
   * it. So while uncalibrated, ANY axis pushed away from where it rested
   * at page load moves the cursor, and the sign of that excursion is the
   * direction. It cannot tell pitch from roll without calibration, and it
   * does not need to.
   */
  navRaw() {
    const gp = this.firstGamepad();
    if (!gp) {
      /* Forget where the sticks rested. A different radio with the same
       * axis count would otherwise be measured against the last one's
       * resting position and read as permanently deflected. */
      this.navRest = null;
      return { up: false, down: false };
    }
    const axes = gp.axes;
    if (!this.navRest || this.navRest.length !== axes.length) {
      this.navRest = Array.from(axes);
      return { up: false, down: false };
    }
    let worst = 0;
    for (let i = 0; i < axes.length; i += 1) {
      const d = axes[i] - this.navRest[i];
      if (Math.abs(d) > Math.abs(worst)) {
        worst = d;
      }
    }
    return { up: worst > 0.55, down: worst < -0.55 };
  }

  /*
   * Calibration wizard. Standard radio / gamepad procedure, not a five
   * sentence overlay:
   *
   *   1. Centre: both gimbals still, throttle at the bottom, until the
   *      reading is steady. That snapshot is rest.
   *   2. Full range: move every stick through its travel, then return to
   *      rest. That records min and max per axis, both ends, so a lopsided
   *      gimbal still reaches +1 and -1.
   *   3. Identify: one named deflection per channel. The wizard will not
   *      take the next channel until every axis is back at rest, which is
   *      the thing the old overlay skipped: throttle is not spring centred,
   *      so holding it up and immediately asking for roll assigned all four
   *      channels to the throttle axis.
   *   4. Check: live Mode 2 gimbals from the draft map. Nothing is written
   *      to localStorage until this is accepted.
   *
   * The in-memory flight map is left alone until accept, so cancelling
   * mid-wizard cannot leave a half mapping in the sticks.
   */
  startCalibration() {
    this.calResult = null;
    const gp = this.firstGamepad();
    /* The step list is decided once, at the start, from what this radio
     * reports. Recomputing it per frame would let a wizard grow a step
     * halfway through if a button happened to be read late. */
    const steps = calSteps(
      Boolean(gp && gp.buttons && gp.buttons.length),
      gp ? snapshotAxes(gp).length : 0,
    );
    this.calibration = {
      step: 'center',
      phase: 'hold',
      holdMs: 0,
      rest: null,
      restGuess: null,
      min: null,
      max: null,
      waiting: false,
      steps,
      draft: {
        roll: null, pitch: null, yaw: null, throttle: null, select: null,
      },
    };
  }

  cancelCalibration() {
    this.calibration = null;
    this.calResult = 'cancelled';
  }

  /*
   * PASS ON THE MENU SWITCH AND GO ON TO THE CHECK.
   *
   * calSteps no longer asks a four axis radio for one at all, which is the
   * case that could not be answered. This is the other one: a radio with
   * axes to spare whose pilot has no switch they are willing to give up, or
   * whose switches are all latched somewhere this wizard cannot see. They
   * were in the same room with the same single exit, and Escape threw away
   * a calibration they had just spent a minute on.
   *
   * Nothing is lost by passing. `select` rides along in the draft and
   * cloneMap keeps it null, which is what every radio with buttons already
   * stores, and the hold gesture stays armed because it is armed on the
   * button count rather than on this. The pilot gets the same shell they
   * would have had, one press slower.
   */
  skipCalibrationSelect() {
    const c = this.calibration;
    if (!c || c.step !== SELECT_STEP) {
      return false;
    }
    c.draft.select = null;
    const steps = c.steps || CAL_STEPS;
    c.step = steps[steps.indexOf(c.step) + 1] || 'confirm';
    c.phase = 'hold';
    c.holdMs = 0;
    return true;
  }

  /*
   * THE PILOT SAYS WHERE ZERO IS, for the throttle this wizard could not
   * read on its own. Only `low` moves, exactly as in noteThrottleSpring:
   * `high` is still the end they pushed toward, so full stick is still full
   * throttle, and readGamepad's clamp makes everything beyond zero idle
   * rather than negative.
   *
   * Nothing is written to the saved map here. This edits the DRAFT, on the
   * check step, with the live gimbals in front of the pilot, so they press
   * it and watch the throttle fall to zero before anything is kept.
   */
  zeroThrottleHere() {
    const c = this.calibration;
    if (!c || c.step !== 'confirm') {
      return false;
    }
    const spec = c.draft.throttle;
    const gp = this.firstGamepad();
    if (!spec || !gp || !Number.isInteger(spec.axis)) {
      return false;
    }
    const v = snapshotAxes(gp)[spec.axis];
    if (!Number.isFinite(v) || v === spec.high) {
      return false;
    }
    spec.low = v;
    spec.sprung = true;
    return true;
  }

  acceptCalibration() {
    const c = this.calibration;
    if (!c || c.step !== 'confirm') {
      return false;
    }
    if (!c.draft.roll || !c.draft.pitch || !c.draft.yaw || !c.draft.throttle) {
      return false;
    }
    /* select rides along in the draft and cloneMap keeps it. A radio with
     * buttons never assigned one and carries null, which is the same as
     * before this existed. */
    this.map = cloneMap({ ...c.draft, stored: true });
    /* New axes to watch, so the old axes' step is not this map's. */
    this.forgetAxisResolution();
    /* A calibrated map answers the guess's questions by existing, and the
     * evidence gathered against the guess is about a map that is gone. */
    this.guessSpan = null;
    this.guessYawAlive = false;
    this.guessWrongOrder = false;
    /* Two outcomes, and the shell says which. See saveMap. */
    this.calResult = this.saveMap() ? 'saved' : 'saved-unstored';
    this.calibration = null;
    return true;
  }

  calibrationView() {
    const c = this.calibration;
    if (!c) {
      return null;
    }
    const steps = c.steps || CAL_STEPS;
    const stepIndex = Math.max(0, steps.indexOf(c.step));
    const travelled = c.min && c.max ? travelCount(c.min, c.max, CAL.SWEEP_TRAVEL) : 0;
    const need = c.min ? Math.min(4, c.min.length) : 4;
    const gp = this.firstGamepad();
    let channels = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    let axes = [];
    if (gp) {
      const live = snapshotAxes(gp);
      /*
       * EVERY AXIS THIS RADIO HAS, ALWAYS, AND IT IS THE HONEST PART OF
       * THIS SCREEN.
       *
       * The two gimbals above it can only ever show four channels, and
       * until the wizard has finished it does not know which four axes
       * those are. So a pilot whose yaw is on axis 5 moved their yaw stick
       * on the full range step and watched a gimbal that cannot see axis 5
       * sit still: "Step 2 do not show yaw in the set up. Using RADIOMASTER
       * POCKET". Nothing was broken. The screen was looking somewhere else
       * and had no way to say so.
       *
       * This strip has no opinion about what anything is. It is the raw
       * axis vector with the resting value marked, so "the browser can see
       * my stick" and "the browser has put my stick in the right box" stop
       * being the same question. It is also the first thing worth asking
       * for in a ticket, and now it is on the screen the ticket is about.
       */
      const rest = c.rest || live;
      const claimed = usedAxes(c.draft);
      for (let i = 0; i < live.length; i += 1) {
        axes.push({
          i,
          v: live[i],
          rest: rest[i] ?? 0,
          /* The range seen so far, as its two ends. It was a width once,
           * drawn centred on rest, which is right for a spring centred
           * gimbal and wrong for anything else: a slider resting at 0.5 and
           * pushed to 1 drew its bar from 0.25 to 0.75. */
          lo: c.min && i < c.min.length ? c.min[i] : live[i],
          hi: c.max && i < c.max.length ? c.max[i] : live[i],
          /* Already spoken for by a channel this wizard has identified, so
           * the strip can show the map filling in as it is made. */
          mapped: claimed.has(i),
        });
      }
      if (c.step === 'center' || c.step === 'sweep') {
        channels = this.readGamepad(gp, DEFAULT_MAP);
      } else {
        channels = this.readGamepad(gp, c.draft);
        /*
         * AND THE GIMBAL USED TO SIT DEAD ON THE STEP THAT ASKS FOR
         * MOVEMENT.
         *
         * c.draft holds only the channels already identified, so on the
         * roll step roll, pitch and yaw all read zero however hard the
         * stick is pushed. The pilot is told "hold the right stick fully to
         * the right" beside a stick that does not move, and concludes the
         * wizard has stopped hearing them: "max axes and throttle work but
         * stuck on roll, no input during that time". They were moving it.
         *
         * So the channel BEING ASKED FOR is driven by the axis that is
         * actually moving, chosen by the same pickUnusedAxis call that is
         * about to assign it. It is a preview of the assignment, which is
         * the thing the pilot needs to see.
         *
         * The magnitude is real and the SIGN IS THE PROMPT'S. The prompt
         * names a direction ("fully to the right", "back, toward you") and
         * the polarity of the underlying axis is exactly what has not been
         * worked out yet, so feeding the raw sign through would move the
         * dot the wrong way on half the radios in the world and teach the
         * pilot that the wizard is mirrored. What is claimed here is "this
         * much of the deflection I asked for", and that much is measured.
         *
         * "This much" is a fraction of the REACH THE SWEEP SHOWED, not of a
         * raw axis unit. A throttle parked at -1 travels two units to its
         * stop, and a radio with its endpoints wound in never reaches 1.0
         * at all, so in raw units the throttle dot hit the top at half
         * stick and the wound in radio never got there. The sweep already
         * measured how far each axis goes from rest, and throttleSpec and
         * channelSpec record exactly that range as full, so the preview is
         * held to the same ruler the assignment is about to use. The live
         * reading rides in the maximum because it can be one poll newer
         * than the sweep's record, and a ratio over one is a lie.
         */
        if (c.phase === 'hold' && c.rest && IDENT_CHANNELS.includes(c.step) && !c.draft[c.step]) {
          const pick = pickUnusedAxis(live, c.rest, usedAxes(c.draft));
          if (pick.best >= 0) {
            const b = pick.best;
            const delta = Math.abs(live[b] - c.rest[b]);
            const reach = Math.max(
              Math.abs(c.max[b] - c.rest[b]),
              Math.abs(c.rest[b] - c.min[b]),
              delta,
            ) || 1;
            channels = { ...channels, [c.step]: Math.min(1, delta / reach) };
          }
        }
      }
    }
    return {
      step: c.step,
      phase: c.phase,
      stepIndex,
      stepCount: steps.length,
      /* The list itself, so the wizard's own ladder is drawn from what this
       * radio was actually asked, not from the constant. */
      steps: steps.slice(),
      waiting: Boolean(c.waiting) || !gp,
      travelled,
      need,
      canSave: c.step === 'confirm',
      /* Only the menu switch is ever skippable, and only because the hold
       * gesture covers the radio that is asked for one. See
       * skipCalibrationSelect. */
      canSkip: c.step === SELECT_STEP,
      /* Only on the check step, and only when the throttle is reading high
       * enough to fly the quad on its own. See zeroThrottleHere. */
      canZeroThrottle: c.step === 'confirm' && channels.throttle > CAL.THROTTLE_IDLE,
      throttlePercent: Math.round(channels.throttle * 100),
      channels,
      axes,
      title: calTitle(c),
      prompt: calPrompt(c, this.stickMode),
      hint: calHint(c, travelled, need, gp, c.step === 'confirm' ? channels.throttle : 0),
    };
  }

  runCalibration(gp, dtMs) {
    const c = this.calibration;
    if (!gp) {
      c.waiting = true;
      return;
    }
    c.waiting = false;
    const axes = snapshotAxes(gp);
    if (c.rest) {
      expandRange(c.min, c.max, axes);
    }
    if (c.step === 'center') {
      this.calCenter(c, axes, dtMs);
      return;
    }
    if (c.step === 'sweep') {
      this.calSweep(c, axes, dtMs);
      return;
    }
    /* The menu switch identifies exactly like a flight channel: pick the
     * axis that moved, hold, record, wait for it to come back. It gets the
     * same machinery rather than its own, and usedAxes keeps it off an axis
     * a gimbal already owns. */
    if (IDENT_CHANNELS.includes(c.step) || c.step === SELECT_STEP) {
      this.calIdentify(c, axes, dtMs);
    }
  }

  calCenter(c, axes, dtMs) {
    if (!c.restGuess || c.restGuess.length !== axes.length) {
      c.restGuess = axes.slice();
      c.holdMs = 0;
      return;
    }
    if (maxAbsDelta(axes, c.restGuess) > CAL.REST_NOISE) {
      c.restGuess = axes.slice();
      c.holdMs = 0;
      return;
    }
    c.holdMs += dtMs;
    if (c.holdMs < CAL.REST_MS) {
      return;
    }
    c.rest = c.restGuess.slice();
    c.min = c.rest.slice();
    c.max = c.rest.slice();
    c.step = 'sweep';
    c.holdMs = 0;
  }

  calSweep(c, axes, dtMs) {
    const need = Math.min(4, c.min.length);
    const travelled = travelCount(c.min, c.max, CAL.SWEEP_TRAVEL);
    const settled = maxAbsDelta(axes, c.rest) < CAL.NEAR_REST;
    if (travelled < need || !settled) {
      c.holdMs = 0;
      return;
    }
    c.holdMs += dtMs;
    if (c.holdMs < CAL.SWEEP_REST_MS) {
      return;
    }
    c.step = 'throttle';
    c.phase = 'hold';
    c.holdMs = 0;
  }

  calIdentify(c, axes, dtMs) {
    const channel = c.step;
    if (c.phase === 'hold') {
      const pick = pickUnusedAxis(axes, c.rest, usedAxes(c.draft));
      const unique = pick.bestAbs - pick.secondAbs >= CAL.IDENT_GAP;
      if (pick.best < 0 || pick.bestAbs < CAL.IDENT_DELTA || !unique) {
        c.holdMs = 0;
        return;
      }
      c.holdMs += dtMs;
      if (c.holdMs < CAL.IDENT_HOLD_MS) {
        return;
      }
      const sample = axes[pick.best];
      const rest = c.rest[pick.best];
      if (channel === 'throttle') {
        c.draft.throttle = throttleSpec(pick.best, rest, sample, c.min, c.max);
      } else {
        c.draft[channel] = channelSpec(pick.best, rest, sample, c.min, c.max);
      }
      c.phase = 'release';
      c.holdMs = 0;
      return;
    }
    const spec = c.draft[channel];
    const others = maxAbsDeltaExcept(axes, c.rest, spec ? spec.axis : -1);
    let parked = others <= CAL.NEAR_REST;
    if (parked && spec) {
      const v = axes[spec.axis];
      if (channel === 'throttle') {
        parked = Math.abs(v - spec.low) <= CAL.NEAR_REST
          || Math.abs(v - c.rest[spec.axis]) <= CAL.NEAR_REST;
      } else {
        parked = Math.abs(v - c.rest[spec.axis]) <= CAL.NEAR_REST;
      }
    }
    if (!parked) {
      c.holdMs = 0;
      return;
    }
    c.holdMs += dtMs;
    if (c.holdMs < CAL.RELEASE_MS) {
      return;
    }
    /* Where the throttle CAME BACK TO is the whole of what tells a radio's
     * throttle from a gamepad's, and this is the moment it is known. */
    if (channel === 'throttle' && spec) {
      noteThrottleSpring(c, spec, axes);
    }
    const steps = c.steps || CAL_STEPS;
    const next = steps[steps.indexOf(c.step) + 1] || 'confirm';
    c.step = next;
    c.phase = 'hold';
    c.holdMs = 0;
  }

  readGamepad(gp, map = this.map) {
    const ax = (i) => (i < gp.axes.length ? gp.axes[i] : 0);
    const dead = (v) => (Math.abs(v) < 0.012 ? 0 : v);
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const m = map;
    const norm = (spec) => {
      if (!spec || !Number.isInteger(spec.axis)) {
        return 0;
      }
      return dead(clamp(mapCentered(ax(spec.axis), spec)));
    };
    let throttle = 0;
    if (m.throttle && Number.isInteger(m.throttle.axis)) {
      const t = (ax(m.throttle.axis) - m.throttle.low) / ((m.throttle.high - m.throttle.low) || 1);
      throttle = Math.max(0, Math.min(1, t));
    }
    return {
      roll: norm(m.roll),
      pitch: norm(m.pitch),
      yaw: norm(m.yaw),
      throttle,
    };
  }

  readKeyboard(dtMs, springThr = false) {
    const dt = dtMs / 1000;
    const RATE_DOWN = 9.0;   /* return to rest per second */
    const THR_RATE = 0.9;    /* latched throttle travel per second, radio overlay only */
    const THR_SPRING = 2.6;
    /*
     * A CAP ON WHAT ONE FRAME CAN DO, and it is what makes the keyboard
     * playable on a slow machine.
     *
     * The rates above are per second, and poll() clamps a frame to 100 ms, so
     * at 10 frames per second or worse the smallest possible keypress moved the
     * stick 0.9 of full deflection. A pilot measured what that costs: 0.9 stick
     * is worth about 74 ms of full stick, which throws the craft more than a
     * metre off line, and a regulation gate's whole budget is 0.572 m either
     * side. The keyboard was a coin flip on exactly the hardware this project
     * is built for.
     *
     * Hold-time analog does not integrate RATE_UP any more, so a hitch cannot
     * skip the nudge band. The cap still applies to the spring back, and the
     * hold clock itself advances by at most 40 ms per poll.
     */
    const MAX_STEP = 0.18;
    const dtHold = Math.min(dtMs, 40);
    const step = (rate) => Math.min(rate * dt, MAX_STEP);
    for (const [ch, negKey, posKey] of this.keyAxes) {
      const want = (this.keys.has(posKey) ? 1 : 0) - (this.keys.has(negKey) ? 1 : 0);
      if (want === 0) {
        this.kbHoldMs[ch] = 0;
        this.kbHoldDir[ch] = 0;
        const cur = this.kb[ch];
        if (cur > 0) {
          this.kb[ch] = Math.max(0, cur - step(RATE_DOWN));
        } else if (cur < 0) {
          this.kb[ch] = Math.min(0, cur + step(RATE_DOWN));
        }
      } else {
        if (this.kbHoldDir[ch] !== want) {
          this.kbHoldMs[ch] = 0;
          this.kbHoldDir[ch] = want;
        }
        this.kbHoldMs[ch] += dtHold;
        this.kb[ch] = want * analogMag(this.kbHoldMs[ch]);
      }
    }
    const w = this.keys.has(this.throttleKeys.up);
    const s = this.keys.has(this.throttleKeys.down);
    if (!springThr) {
      const thrWant = (w ? 1 : 0) - (s ? 1 : 0);
      this.kb.throttle = Math.max(0, Math.min(1, this.kb.throttle + thrWant * step(THR_RATE)));
      return { ...this.kb };
    }
    this.applyKeyboardCollective(dtHold, w, s, step(THR_SPRING));
    return { ...this.kb };
  }

  /*
   * KEYBOARD COLLECTIVE, same analog as the other keys.
   *
   * W is left-stick forward on a Mode 2 radio: a tap nudges throttle up,
   * a hold climbs, a long hold punches. S is the other way. Rest is 0
   * on the pad. Once throttle has actually left the pad, rest becomes
   * hover so letting go holds height instead of dropping it. kbAir is
   * latched on release, not while W is held, so the first takeoff does
   * not jump from "mag from zero" to "mag from hover" mid-press.
   *
   * Only the keyboard-as-primary path calls this. A radio keeps analog
   * latch. __stick and a reset clear the flags so a written throttle is
   * not sprung out from under them.
   */
  applyKeyboardCollective(dtHold, w, s, springStep) {
    const HOVER = 0.22; /* a hair over measured hover 0.2051, so level holds */
    const LIFTOFF = 0.18;

    const air = this.forcePadRest ? false : this.kbAir;
    if (w && !s) {
      this.kbThrFromKeys = true;
      this.kbHoldMs.w += dtHold;
      this.kbHoldMs.s = 0;
      const mag = analogMag(this.kbHoldMs.w);
      this.kb.throttle = air ? HOVER + mag * (1 - HOVER) : mag;
    } else if (s && !w) {
      this.kbThrFromKeys = true;
      this.kbHoldMs.s += dtHold;
      this.kbHoldMs.w = 0;
      const mag = analogMag(this.kbHoldMs.s);
      const rest = air ? HOVER : 0;
      this.kb.throttle = rest * (1 - mag);
      if (this.kb.throttle <= 0.04) {
        this.kbAir = false;
        this.kb.throttle = 0;
      }
    } else {
      if (w && s) {
        this.kbThrFromKeys = true;
      }
      if (!this.forcePadRest && this.kbHoldMs.w > 0 && this.kb.throttle >= LIFTOFF) {
        this.kbAir = true;
      }
      this.kbHoldMs.w = 0;
      this.kbHoldMs.s = 0;
      if (!this.kbThrFromKeys) {
        return;
      }
      const target = air ? HOVER : 0;
      if (this.kb.throttle < target) {
        this.kb.throttle = Math.min(target, this.kb.throttle + springStep);
      } else if (this.kb.throttle > target) {
        this.kb.throttle = Math.max(target, this.kb.throttle - springStep);
      }
    }
  }

  /* Zero the sticks and the collective so a reset or a harness poke
   * cannot be sprung toward hover on the next poll. The thumb sticks
   * reset with the keys and for the same reason, plus one of their own:
   * their throttle is sticky, and a crash recovery that kept it high
   * would relaunch the wreck by itself. */
  resetKeyboardSticks() {
    this.kb.roll = 0;
    this.kb.pitch = 0;
    this.kb.yaw = 0;
    this.kb.throttle = 0;
    this.kbAir = false;
    this.kbThrFromKeys = false;
    this.forcePadRest = false;
    this.kbHoldMs = { roll: 0, pitch: 0, yaw: 0, w: 0, s: 0 };
    this.kbHoldDir = { roll: 0, pitch: 0, yaw: 0 };
    if (this.touchSource) {
      this.touchSource.reset();
    }
  }

  /* The thumb sticks, mounted by the shell on a touch device. */
  attachTouch(source) {
    this.touchSource = source;
    if (source && typeof source.setStickMode === 'function') {
      source.setStickMode(this.stickMode);
    }
  }

  /*
   * THE PILOT'S STICK MODE, which reaches the keyboard and the thumb sticks
   * and nothing else. A radio has already applied its own before the browser
   * sees an axis, and the wizard learns whatever comes out of it.
   *
   * The spring centred channels are ZEROED on a change, and they have to be.
   * The keyboard integrates per channel: hold the arrow that was pitch,
   * change mode so that key is now throttle, and pitch would have kept
   * whatever deflection it was carrying with no key left able to return it.
   * Throttle survives deliberately, because it is the same collective either
   * way and a radio's throttle does not jump when you put the radio down.
   */
  setStickMode(mode) {
    const m = normaliseStickMode(mode);
    if (m === this.stickMode) {
      return m;
    }
    this.stickMode = m;
    this.keyAxes = keyAxes(m);
    this.throttleKeys = throttleKeys(m);
    for (const ch of ['roll', 'pitch', 'yaw']) {
      this.kb[ch] = 0;
      this.kbHoldMs[ch] = 0;
      this.kbHoldDir[ch] = 0;
    }
    if (this.touchSource && typeof this.touchSource.setStickMode === 'function') {
      this.touchSource.setStickMode(m);
    }
    return m;
  }

  /*
   * Whether the thumbs are the stick source right now. Split from
   * isKeyboardPrimary because the two answer different questions: the
   * keyboard forces angle mode and draws its ghost gimbals, while the
   * thumb sticks are a proportional stick like a radio, fly whichever
   * flight mode the setting says, and draw themselves.
   */
  isTouchPrimary() {
    return this.firstGamepad() === null
      && Boolean(this.touchSource && this.touchSource.active());
  }

  /* Called once per animation frame. Emits one timestamped sample when
   * anything changed, plus a heartbeat sample every 100 ms. */
  poll(nowWall) {
    const dtMs = Math.min(nowWall - this.lastWall, 100);
    this.lastWall = nowWall;

    const gp = this.firstGamepad();
    this.notePadRoster();
    /* The Gamepad object's own timestamp is the only honest statement of when
     * the browser last refreshed it. Counting its changes is how we find out
     * whether polling faster than the frame rate buys anything at all. */
    if (gp && gp.timestamp !== this.padStamp) {
      this.padStamp = gp.timestamp;
      this.padUpdates += 1;
      /* Only on a refresh: re-reading an unchanged axis says nothing, and
       * doing this every 2 ms would be three quarters wasted work. */
      this.noteAxisResolution(gp);
    }
    this.rateWindowMs += dtMs;
    if (this.rateWindowMs >= 500) {
      this.padHz = Math.round((this.padUpdates * 1000) / this.rateWindowMs);
      this.sampleHz = Math.round((this.samplesTaken * 1000) / this.rateWindowMs);
      this.padUpdates = 0;
      this.samplesTaken = 0;
      this.rateWindowMs = 0;
    }
    let next;
    if (this.harnessChannels) {
      /* The harness override, above everything: a capture wrote a stick
       * and means it. Mirrored into kb.throttle so releasing the override
       * hands the collective back where it left it rather than springing. */
      next = { ...this.harnessChannels };
      this.kb.throttle = next.throttle;
      this.source = 'the harness override';
    } else if (this.padPick) {
      this.runPadPick(dtMs);
      next = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
      this.source = 'the joystick picker';
    } else if (this.calibration) {
      /* Unconditional: runCalibration's own first line sets waiting when
       * there is no pad, so the else arm here was a second copy that could
       * only ever agree with it. */
      this.runCalibration(gp, dtMs);
      next = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
      this.source = 'the calibration wizard';
    } else if (gp) {
      next = this.readGamepad(gp);
      this.noteThrottleParked(gp);
      this.noteGuessOrder(gp);
      this.source = this.mapUsable() ? 'a radio' : 'a radio whose stick order is a guess';
      /* Keyboard still works while a pad is plugged in: any held stick
       * key overrides that channel. */
      const kb = this.readKeyboard(dtMs, false);
      for (const ch of ['roll', 'pitch', 'yaw']) {
        if (kb[ch] !== 0) {
          next[ch] = kb[ch];
        }
      }
      if (this.keys.has(this.throttleKeys.up) || this.keys.has(this.throttleKeys.down)) {
        next.throttle = kb.throttle;
      } else {
        this.kb.throttle = next.throttle;
      }
    } else if (this.touchSource && this.touchSource.active()) {
      /* The thumbs. Sample every poll, not only on events, because the
       * spring back to centre is time, not touches, and the sticky
       * throttle has to keep feeding while no finger is down at all. */
      next = this.touchSource.sample(dtMs);
      this.source = 'the touch sticks';
    } else {
      next = this.readKeyboard(dtMs, true);
      this.source = 'the keyboard';
    }

    const changed =
      next.roll !== this.channels.roll ||
      next.pitch !== this.channels.pitch ||
      next.yaw !== this.channels.yaw ||
      next.throttle !== this.channels.throttle;
    this.heartbeatMs = (this.heartbeatMs ?? 0) + dtMs;
    if (changed || this.heartbeatMs >= 100) {
      this.heartbeatMs = 0;
      this.channels = next;
      this.queue.push({ wallT: nowWall, ...next });
      this.samplesTaken += 1;
      /* The integrator is frozen while the craft sits landed, so nothing
       * drains then. Bound it: the newest samples are the ones worth keeping. */
      if (this.queue.length > 2048) {
        this.queue.splice(0, this.queue.length - 512);
      }
    }
  }

  /*
   * Poll independently of the render loop. 2 ms is asked for; browsers clamp
   * setInterval and a busy frame delays it, which is exactly why every sample
   * is timestamped rather than assumed to be on a grid. Calling poll() from
   * the frame as well is harmless: dtMs is measured off lastWall, so the
   * keyboard integration cannot be double counted.
   */
  startPolling(periodMs = 2) {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => this.poll(performance.now()), periodMs);
  }

  stopPolling() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /*
   * Keyboard is the stick source when no radio has enumerated. WASD and
   * the arrows still overlay a connected pad channel by channel, but that
   * is not "using the keyboard rather than a controller": the pad is the
   * primary, and angle mode follows the setting.
   */
  isKeyboardPrimary() {
    return this.firstGamepad() === null;
  }

  /*
   * The smallest step this radio has been seen to take, over the mapped
   * axes only: an unmapped axis is a switch or a pot and its travel is not
   * a stick's. See the note on axisStepMin: noise can only push this BELOW
   * the true step, so it is a lower bound on the step and therefore an
   * upper bound on how fine the stick really is.
   */
  noteAxisResolution(gp) {
    const m = this.map;
    if (!m) {
      return;
    }
    for (const ch of ['roll', 'pitch', 'yaw', 'throttle']) {
      const spec = m[ch];
      if (!spec || !Number.isInteger(spec.axis) || spec.axis >= gp.axes.length) {
        continue;
      }
      const v = gp.axes[spec.axis];
      if (!Number.isFinite(v)) {
        continue;
      }
      const prev = this.axisPrev.get(spec.axis);
      this.axisPrev.set(spec.axis, v);
      if (prev === undefined || v === prev) {
        continue;
      }
      const d = Math.abs(v - prev);
      if (this.axisStepMin === 0 || d < this.axisStepMin) {
        this.axisStepMin = d;
      }
    }
  }

  /* A new radio, or a new map for the same one, is a new transducer: the
   * step measured through the old one says nothing about this one. */
  forgetAxisResolution() {
    this.axisPrev.clear();
    this.axisStepMin = 0;
  }

  stats() {
    /*
     * stickLevels is axisStepMin expressed as the number of steps across an
     * axis's full -1..1 travel, because "256" is a sentence a pilot and a
     * bug report can both read and "0.0078" is not. Zero means the stick has
     * not moved enough to say, which is a different answer from "fine" and
     * has to stay distinguishable from it.
     */
    return {
      padHz: this.padHz,
      sampleHz: this.sampleHz,
      queued: this.queue.length,
      source: this.source,
      axisStepMin: this.axisStepMin,
      stickLevels: this.axisStepMin > 0 ? Math.round(2 / this.axisStepMin) : 0,
    };
  }

  drain() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
