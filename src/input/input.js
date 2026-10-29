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
  stickChannels, stickCaption, stickSideOf, DEFAULT_STICK_MODE, normaliseStickMode, STICK_MODES,
} from './stickmode.js';
import { hoverStickPercent } from '../../configs/rates.js';

const STORE_KEY = 'webfpv_stick_map_v1';
const PAD_STORE_KEY = 'webfpv.pad.v1';
/*
 * THE RADIO'S RESTART SWITCH, bug-a25bc2dd: "As people start to grind
 * tracks they will need ready access to a restart race hot key. The default
 * in VDrone is A but can be assigned to an AUX on the radio too." R is the
 * key and has been; a pilot with both hands on a radio had no way to it but
 * the pause menu. This is any button, or a switch that arrives as an axis,
 * picked by flipping it from the Restart switch row in Settings.
 *
 * Kept under its own key and against the pad's id, not in the stick map:
 * saving the map would make an uncalibrated guess look calibrated, and a
 * button number on one radio is an arming switch on another.
 */
const RESTART_STORE_KEY = 'webfpv.restart.v1';
/*
 * THE AUTO RESET SWITCH, bug-918a8c99: the Auto reset setting, bindable to a
 * radio switch the way Restart is, for a pilot who cannot reach the menu
 * with both hands on the sticks. Same machinery, its own key, so one switch
 * can be bound to either job and neither forgets the other. An axis (a
 * switch) sets the setting to its position, because that is what a radio
 * switch means; a button toggles it, because a button has no position.
 */
const AUTORESET_STORE_KEY = 'webfpv.autoreset.v1';
/* An axis counts as the switch being flipped when it moves this far from
 * where it was when the row was chosen: half its travel, so a three
 * position switch moved one notch counts and a jittering gimbal does not. */
/*
 * THE DOGFIGHT'S GUN AND MISSILE (the owner's ask of 2026-10-29: "prompted
 * to bind a gun and missile to a button or switch"). A pad's are picked
 * the way the restart switch is, by flipping or pressing the thing wanted,
 * and kept the same way, each under its own key. The gun fires while its
 * button is held or its switch is on; the missile fires once each time its
 * button goes down or its switch goes on. A standard gamepad that has
 * picked nothing fires on its right trigger and right bumper. The keys are
 * Space and Left Shift unless the pilot picked others, and the touch
 * screen gets two buttons of its own (src/ui/dogfighthud.js), so nothing
 * there needs picking. None of it is read outside a dogfight, except while
 * a pick is being made.
 */
const GUN_STORE_KEY = 'webfpv.dogfight.gun.v1';
const MISSILE_STORE_KEY = 'webfpv.dogfight.missile.v1';
const WEAPON_KEYS_STORE_KEY = 'webfpv.dogfight.keys.v1';
export const WEAPON_KEYS_DEFAULT = Object.freeze({ gun: 'Space', missile: 'ShiftLeft' });
/* The standard gamepad's right trigger and right bumper. */
const PAD_GUN_DEFAULT = 7;
const PAD_MISSILE_DEFAULT = 5;
/* Keys a weapon may not take: the sticks, and the menu's own. */
const WEAPON_KEYS_REFUSED = new Set(['Escape', 'Enter', 'Tab', 'KeyR']);

const RESTART_FLIP = 1.0;
/* And the switch is ON while the axis is this far towards the side it was
 * flipped to. */
const RESTART_ON = 0.5;

const DEFAULT_MAP = {
  /* AETR axis order, up and right positive, throttle low at -1. */
  roll: { axis: 0, center: 0, full: 1 },
  pitch: { axis: 1, center: 0, full: -1 },
  yaw: { axis: 3, center: 0, full: 1 },
  throttle: { axis: 2, low: -1, high: 1 },
};

/*
 * A GAMEPAD IS NOT A RADIO, AND THE AETR GUESS PUT ITS THROTTLE SIDEWAYS.
 *
 * DEFAULT_MAP is the order a transmitter in joystick mode reports. A pad the
 * browser recognises reports `mapping === 'standard'`, and the Standard
 * Gamepad layout is fixed by the Gamepad spec: axis 0 left stick right,
 * 1 left stick down, 2 right stick right, 3 right stick down. Read through
 * AETR that is roll and pitch on the LEFT stick, throttle on the right
 * stick's horizontal and yaw on its vertical. Three tickets from the 25th
 * and 26th are that one fact:
 *
 *   bug-aeb29de7  DualSense Edge: "Throttle/Yaw should be on left stick, but
 *                 it's on the right stick. If you hit (M) then the Left stick
 *                 is correct on the left BUT now controls pitch/roll."
 *   bug-6c81072b  DualSense: "the right stick has vertical pitch and
 *                 horizontal roll (or visa versa)... let it be customizeable"
 *   bug-585786cd  DJI RC 2, a STANDARD GAMEPAD to Chrome: "It is impossible
 *                 to have the throttle on my right vertical stick"
 *
 * A pad has no stick mode of its own, unlike a radio, so the pilot's mode
 * setting is the only thing that can say which stick is the throttle, and
 * it now does. The throttle is the sprung spec the wizard already writes for
 * a gamepad (see noteThrottleSpring): zero at rest, full at the top, idle
 * below centre.
 */
function standardGuessMap(mode) {
  const sticks = stickChannels(mode);
  const map = cloneMap({ ...DEFAULT_MAP, stored: false });
  const place = (axis, ch) => {
    if (ch === 'throttle') {
      /* Up is -1 on the Standard Gamepad's vertical axes. */
      map.throttle = { axis, low: 0, high: -1, sprung: true };
      return;
    }
    /* Right is +1 for roll and yaw, and pulled back is +1 for pitch, which
     * is the raw direction on both of the standard layout's axes. */
    map[ch] = { axis, center: 0, pos: 1, neg: -1 };
  };
  place(0, sticks.left.horiz);
  place(1, sticks.left.vert);
  place(2, sticks.right.horiz);
  place(3, sticks.right.vert);
  map.guess = 'standard';
  return map;
}

/*
 * A SAVED MAP THAT IS STILL THE AETR GUESS, untouched.
 *
 * Check sticks opens the check step with whatever is flying as its draft,
 * and Save writes it. On a gamepad before standardGuessMap that was the AETR
 * guess, saved as the pilot's own and called calibrated from then on. Both
 * DualSense reports above carry exactly that map. The wizard never writes
 * one: it measures rest, so its centred channels carry pos and neg and its
 * throttle carries the measured ends. On a standard pad, a map like this is
 * the guess, and it is set aside in memory. Storage is left alone, because
 * on a radio the same map is right.
 */
function isAetrGuess(map) {
  if (!map) {
    return false;
  }
  for (const ch of ['roll', 'pitch', 'yaw']) {
    const m = map[ch];
    const d = DEFAULT_MAP[ch];
    if (!m || m.axis !== d.axis || m.center !== d.center || m.full !== d.full
      || m.pos != null || m.neg != null) {
      return false;
    }
  }
  const t = map.throttle;
  return Boolean(t && t.axis === DEFAULT_MAP.throttle.axis && t.low === DEFAULT_MAP.throttle.low
    && t.high === DEFAULT_MAP.throttle.high && !t.sprung);
}

/*
 * A SAVED MAP THAT IS STILL THE STANDARD LAYOUT, untouched, on a radio that
 * Firefox has dressed as a gamepad. bug-52a66f69, "pitch is not reaching
 * sim", a Radiomaster Pocket in Firefox on Linux.
 *
 * The case above, one rung over. Check sticks opens with whatever is flying
 * as its draft and Save writes it, and from 27 September until firefoxRadio
 * landed on the 28th a Firefox radio flew the standard layout, so a pilot who
 * pressed Save then wrote that layout down as their own. A saved map
 * outranks every guess, so the Firefox guess never reached them: yaw,
 * throttle, roll and pitch on axes 0 to 3 reads pitch from channel 5, a
 * switch, and reads the throttle stick from nothing. The ticket's map is that
 * one to the digit, and calibrating is the only way out of it.
 *
 * The wizard never writes this map. It measures rest and the ends, and a
 * Firefox radio's throttle is on axis 4 and does not spring, so its answer
 * differs from the standard layout in the axes alone. What is exactly the
 * standard layout in some stick mode, a sprung throttle included, is the
 * guess saved as if it were a measurement. The pilot's reversals ride on top
 * of it and are ignored: they were set against the wrong axes.
 *
 * Only a Firefox radio sets it aside, and only in memory. On a real gamepad
 * this very map is right, so storage is left alone.
 */
function isStandardGuess(map) {
  if (!map) {
    return false;
  }
  const t = map.throttle;
  for (const mode of STICK_MODES) {
    const std = standardGuessMap(mode);
    let same = Boolean(t && t.axis === std.throttle.axis && t.low === std.throttle.low
      && t.high === std.throttle.high && Boolean(t.sprung) === Boolean(std.throttle.sprung));
    for (const ch of ['roll', 'pitch', 'yaw']) {
      const m = map[ch];
      const s = std[ch];
      same = same && Boolean(m && m.axis === s.axis && m.center === s.center
        && m.pos === s.pos && m.neg === s.neg);
    }
    if (same) {
      return true;
    }
  }
  return false;
}

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
  /*
   * A RADIO WITH SHORT THROWS NEVER REACHED IDENT_DELTA, AND THE WIZARD
   * WAITED FOR IT FOR EVER.
   *
   * IDENT_DELTA is raw axis units from rest, which a radio sending the full
   * -1 to 1 passes at under half stick. The sweep step only asks for
   * SWEEP_TRAVEL, 0.55 of travel END TO END, so a radio whose sticks span
   * 0.55 to 0.9 finishes the sweep and then has under 0.45 on each side of
   * centre to give: a stick held hard against its stop, the axis strip
   * showing it at the end of its range, and nothing happening.
   *
   *   bug-feffc32f, bug-03300b11  a Reely HT-4 through a PPM cable (0401:0401),
   *                 both stuck at "hold the right stick fully to the right",
   *                 one saying "ch 0 was indeed at the max of the previously
   *                 measured range"
   *   bug-faac0b57  a SIMtransmitter 6 (06f7:0003): "range too short for
   *                 log as full axis move"
   *
   * So the bar is IDENT_SPAN of the travel the sweep measured on that side
   * of that axis, never more than IDENT_DELTA and never less than
   * IDENT_FLOOR, which is well clear of REST_NOISE. Any radio with 0.57 or
   * more on the side being asked for, which is every radio that sends the
   * whole range, gets exactly the old bar. The gap shrinks with it, in the
   * same proportion it has to IDENT_DELTA.
   */
  IDENT_SPAN: 0.8,
  IDENT_FLOOR: 0.2,
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
  /* The least travel a throttle may be left with after zero is moved. A
   * press with the stick most of the way up would otherwise leave a
   * throttle that is idle everywhere but the last few percent, and the
   * only way back is to recalibrate. See zeroThrottleHere. */
  THROTTLE_MIN_RANGE: 0.3,
  /*
   * How far a channel has to be deflected on the check step, and how far
   * clear of every other channel, before the screen will name it as the
   * one the pilot is moving and offer to reverse it. See movingChannel.
   *
   * These are CHANNEL units, nought to one after the mapping, not the raw
   * axis units the identify step works in. They are deliberately the same
   * numbers as IDENT_DELTA and IDENT_GAP: the question is the same one,
   * which stick is being moved and is it unambiguous, and a pilot who has
   * just been through six steps of holding one stick at a time should not
   * have to learn a second feel for it.
   */
  REV_DELTA: 0.45,
  REV_GAP: 0.18,
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
  /* The guess's yaw axis is PARKED, the way a throttle rests and a sprung
   * yaw stick never does, when it sits this far off centre, the line
   * noteThrottleParked draws for the same question... */
  PARK_OFF: 0.35,
  /* ...and stays within this of where it settled... */
  PARK_STILL: 0.01,
  /* ...for this long, on the wall clock (see noteYawParked). A thumb
   * holding yaw at the stop for four seconds is seven turns of a spin; a
   * throttle waiting at the bottom on the title screen is there for
   * minutes. */
  PARK_MS: 4000,
};

/*
 * A STICK THE PILOT IS FLYING WITHOUT. See noteDeadChannels.
 *
 * The three questions above are asked of the AETR guess and nothing else,
 * and each asks about one axis. Most of the stick tickets on the board were
 * outside all three: a calibrated map, a standard gamepad, a saved map on a
 * different radio, and above all a phone whose browser never delivered the
 * axis in the first place. What they share is the symptom, so this watches
 * the symptom: a channel that has not moved once in real flying, while the
 * pilot has plainly been using the others.
 */
const DEAD = {
  /* Flight time on this pad and this map before a still channel is called
   * dead. Long enough that a pilot who has not needed yaw yet is not told
   * off for it, short enough that the pilot who is trying to yaw hears about
   * it inside their first minute. */
  FLY_MS: 20000,
  /* The throttle is judged sooner, because without it nothing leaves the
   * pad, and eight seconds of wiggling every other stick on the start block
   * is already a pilot looking for it. */
  THROTTLE_MS: 8000,
  /* A channel counts as in use once it has swept this far, in the channel's
   * own units: -1 to 1 for the centred three, 0 to 1 for the throttle. With
   * the level count below, so a switch thrown twice does not count. */
  USED: 0.6,
  USED_THROTTLE: 0.3,
  /* How many of the other three have to be in use. Two, so a pilot who is
   * only hovering on throttle and pitch is not judged on roll and yaw. */
  OTHERS: 2,
  /* A channel whose whole range in flight is under this has not moved. The
   * deadband in readGamepad already holds a resting stick at exactly 0, so a
   * live stick nobody touches reads 0 here, and so does an axis that is not
   * there at all. */
  STILL: 0.05,
  /* And once a channel has moved like a stick, this far and through enough
   * levels, it is alive, the verdict comes down, and nothing reopens it on
   * this pad and map. The same latch noteGuessOrder keeps, for its reason: a
   * warning that blinks is worse than either answer. */
  ALIVE: 0.4,
};

/* Did this range move like a stick: far enough, and through enough distinct
 * levels that it was not a switch. Shared by the flight's watch and the help
 * screen's, which ask the same question. */
function sweptLikeStick(span, far) {
  return span.hi - span.lo >= far && span.levels.size >= GUESS.STRAY_LEVELS;
}

/* One range, grown by one reading. The level set stops growing at the
 * count sweptLikeStick asks for, so a long flight costs nothing more. */
function growSpan(span, v) {
  if (v < span.lo) {
    span.lo = v;
  }
  if (v > span.hi) {
    span.hi = v;
  }
  if (span.levels.size < GUESS.STRAY_LEVELS) {
    span.levels.add(Math.round(v / GUESS.LEVEL_STEP));
  }
}

function newSpan(v) {
  return { lo: v, hi: v, levels: new Set([Math.round(v / GUESS.LEVEL_STEP)]) };
}

/*
 * A BROWSER THAT HANDS OVER EXACTLY FOUR AXES.
 *
 * Chrome on Android, given a joystick it does not recognise, passes on four
 * axes and drops every other one. Its fallback mapping (GamepadMappings.java,
 * UnknownGamepadMappings) keeps X, Y, the last of Z and Rx, and the last of
 * Ry and Rz. A radio in AETR order sends throttle on Z and yaw on Rx, so one
 * of the two is always among the dropped, and which one depends on the radio
 * and the phone. Nine radio tickets from phones up to 28 September read like
 * this, every one about yaw or throttle, and the two that listed their axes
 * listed four (bug-338cd29b, bug-f532d90b). The mapping for an unknown pad is
 * never 'standard' there, which is what tells it from a gamepad Chrome knows.
 *
 * This file cannot see the phone, only the four axes, so it reports the
 * shape and the shell, which can read the platform, says what it means.
 */
function fourAxisPad(gp) {
  return Boolean(gp && gp.mapping !== 'standard' && gp.axes && gp.axes.length === 4);
}

/*
 * FIREFOX ON LINUX CALLS A RADIO A GAMEPAD, AND MOVES ITS AXES WHEN IT DOES.
 *
 * Its evdev backend (dom/gamepad/linux/LinuxGamepad.cpp) treats any device
 * with the BTN_GAMEPAD key as a standard gamepad, and an EdgeTX radio in
 * joystick mode has it: bug-9cc39ca4's Pocket arrived as `mapping ===
 * 'standard'` with eight axes. Firefox then takes axes 0 to 3 from X, Y, Rx
 * and Ry, the standard layout's four sticks, and appends every other axis
 * after them in evdev order: Z, Rz, then the sliders. The radio sends its
 * channels on X, Y, Z, Rx, Ry, Rz and the two sliders, in order, so an AETR
 * radio reads here as
 *
 *   0 aileron  1 elevator  2 rudder  3 channel 5  4 throttle  5 channel 6 ...
 *
 * Both Firefox tickets on the board are that table:
 *
 *   bug-c9423f3e  Radiomaster Pocket, 24 September, on the AETR guess:
 *                 "the throttle is mapped on the yaw axes and the throttle
 *                 movement is not detected". Axis 2 is the rudder and the
 *                 throttle is on axis 4, which nothing read.
 *   bug-9cc39ca4  the same radio, 27 September, on the standard layout the
 *                 gamepad change had just given it: "no pitch". Pitch was
 *                 read from axis 3, which is channel 5, a switch.
 *
 * So a standard pad that Firefox names like a radio is flown as the AETR
 * guess read through that table. Only Firefox builds an id as vendor,
 * product and name joined by hyphens, and the name has to say Joystick or
 * the firmware, so a real gamepad in Firefox and every pad in Chrome keep
 * the standard layout. It is still a guess, with every check the AETR guess
 * gets, and the wizard still overrides it.
 */
const FIREFOX_PAD_ID = /^[0-9a-f]{4}-[0-9a-f]{4}-(.*)$/i;
const RADIO_NAME = /joystick|edgetx|opentx|freedomtx/i;

function firefoxRadio(gp) {
  if (!gp || gp.mapping !== 'standard' || !gp.axes || gp.axes.length < 5) {
    return false;
  }
  const m = FIREFOX_PAD_ID.exec(String(gp.id || ''));
  return Boolean(m && RADIO_NAME.test(m[1]));
}

function firefoxRadioGuessMap() {
  const map = cloneMap({ ...DEFAULT_MAP, stored: false });
  map.yaw = { ...DEFAULT_MAP.yaw, axis: 2 };
  map.throttle = { ...DEFAULT_MAP.throttle, axis: 4 };
  map.guess = 'firefox';
  return map;
}

/*
 * WHICH CHANNELS ARE BACKWARDS, AND WHY THIS HAD TO EXIST.
 *
 * The wizard works out a channel's direction from the direction the pilot
 * pushed while it was asking, which is right and is what makes it work on a
 * radio with reversed channels in its own setup: whichever way they push
 * when told "fully to the right" becomes right. It has one failure mode,
 * and a human will always be able to hit it. Push the wrong way once, at
 * one of six steps, and that channel is backwards for good.
 *
 *   bug-b0d085f0, gazgano: "cant calibrate the sticks correctly. some are
 *   inverted and there's no option to change it"
 *
 * The second half of that sentence is the bug. The mapping was write once:
 * nothing in the shell could show a pilot what had been recorded, and
 * nothing could change one channel of it. The only repair for a single
 * wrong push was the whole wizard again, with the same chance of the same
 * mistake, which is why the report reads as helpless as it does.
 *
 * So direction is a property of the MAPPING, stored beside it, and it can
 * be flipped one channel at a time from the check step without touching
 * anything the wizard learned. Every transmitter ever built has this
 * control and it is on the first page of the menu.
 */
function cloneReverse(rev) {
  const out = {
    roll: false, pitch: false, yaw: false, throttle: false,
  };
  if (rev) {
    for (const ch of IDENT_CHANNELS) {
      out[ch] = Boolean(rev[ch]);
    }
  }
  return out;
}

function cloneMap(map) {
  return {
    roll: { ...map.roll },
    pitch: { ...map.pitch },
    yaw: { ...map.yaw },
    throttle: { ...map.throttle },
    /* Optional, and null for every radio that has buttons. It is not a
     * flight channel: readGamepad never looks at it. */
    select: map.select ? { ...map.select } : null,
    /* Always all four keys, present or not in what came in, so a map
     * stored before this existed loads with every channel the right way
     * round rather than with undefined holes. */
    reverse: cloneReverse(map.reverse),
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

/* How often the pad roster runs when the pad count has not changed: see
 * poll. */
const ROSTER_MS = 100;

function listGamepads() {
  const out = [];
  const list = typeof navigator !== 'undefined' && navigator.getGamepads
    ? navigator.getGamepads()
    : [];
  for (let i = 0; i < list.length; i += 1) {
    const gp = list[i];
    if (gp && gp.connected && gp.axes && gp.axes.length >= 4) {
      out.push(firefoxTriggerView(gp));
    }
  }
  return out;
}

/*
 * FIREFOX ON LINUX DOES NOT PUT THE THROTTLE ON AXIS 4 EITHER. IT PUTS IT IN
 * A BUTTON.
 *
 * The table above firefoxRadio was right about where Firefox makes ROOM for
 * Z and Rz, slots 4 and 5, and wrong about where it sends them. Its evdev
 * backend, for any pad it calls standard, turns every ABS_Z event into the
 * analog value of button 6 (the left trigger) and every ABS_RZ event into
 * button 7, as (v + 1) / 2, and never moves slots 4 and 5 at all
 * (LinuxGamepad.cpp, the `case ABS_Z` and `case ABS_RZ` of its event loop).
 * A radio in AETR order sends its throttle on Z. So on Firefox on Linux the
 * throttle was in a button the whole time, and the Firefox guess read a
 * slot that sits at the 0 Firefox starts it at, for ever.
 *
 * Every Firefox radio ticket since says so in numbers, once the report
 * learned to carry button travel:
 *
 *   bug-c9b9b4b4  Pocket, EdgeTX 2.11.7, Firefox 155: "doesnt see throttle,
 *                 thinks yaw is throttle". Button 6 read 0 to 0.44, every
 *                 axis still.
 *   bug-75b812f5  Pocket, Firefox 156: "no throttle". Button 6, 0 to 1.
 *   bug-264724a7  Pocket, Zen (Firefox 157): "moving the throttle axis does
 *                 nothing... works correctly in evtest". Button 6, 0 to 1.
 *   bug-ad12371a  Boxer, Firefox 152: "throttle stick not recognized at all".
 *   bug-77a63e1e  DJI FPV Controller 3, Firefox 157: "the throttle just
 *                 doesnt move". Button 6, 0 to 1.
 *
 * So the two slots are given back their channels here, once, where the pads
 * are listed, and everything downstream (the guess, the wizard, the checks,
 * the report) sees the radio's channels where the table says they are. The
 * transform is exact: Firefox's own (v + 1) / 2, undone. A slot is only ever
 * filled while it has never read anything but 0, so a Firefox that one day
 * sends Z to the axis again, or a pad whose slot 4 is a real slider, keeps
 * its own axis from its first movement on. Only Firefox builds an id as
 * vendor, product and name joined by hyphens, so no other browser comes
 * near this. It allocates one small array per Firefox radio per listing,
 * nothing at all for any other pad.
 */
const firefoxLiveSlots = new Map();

function firefoxTriggerView(gp) {
  const b = gp.buttons;
  if (gp.mapping !== 'standard' || gp.axes.length < 5 || !b || b.length < 8
    || !FIREFOX_PAD_ID.test(String(gp.id || ''))) {
    return gp;
  }
  const key = padKey(gp);
  let live = firefoxLiveSlots.get(key) || 0;
  if (gp.axes[4] !== 0) {
    live |= 1;
  }
  if (gp.axes.length > 5 && gp.axes[5] !== 0) {
    live |= 2;
  }
  firefoxLiveSlots.set(key, live);
  const fill5 = gp.axes.length > 5 && !(live & 2);
  if ((live & 1) && !fill5) {
    return gp;
  }
  const axes = Array.from(gp.axes);
  const asAxis = (btn) => Math.max(-1, Math.min(1, (btn ? btn.value : 0) * 2 - 1));
  if (!(live & 1)) {
    axes[4] = asAxis(b[6]);
  }
  if (fill5) {
    axes[5] = asAxis(b[7]);
  }
  return {
    id: gp.id,
    index: gp.index,
    mapping: gp.mapping,
    connected: gp.connected,
    timestamp: gp.timestamp,
    buttons: b,
    axes,
  };
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

function loadRestartSpec(key = RESTART_STORE_KEY) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (raw && typeof raw.id === 'string' && (raw.kind === 'button' || raw.kind === 'axis')
      && Number.isInteger(raw.index) && raw.index >= 0 && (raw.dir === 1 || raw.dir === -1)) {
      return { id: raw.id, kind: raw.kind, index: raw.index, dir: raw.dir };
    }
  } catch (e) {
    /* Private mode or a corrupt blob: no switch, and R still works. */
  }
  return null;
}

function saveRestartSpec(spec, key = RESTART_STORE_KEY) {
  try {
    if (!spec) {
      localStorage.removeItem(key);
      return true;
    }
    localStorage.setItem(key, JSON.stringify(spec));
    return true;
  } catch (e) {
    return false;
  }
}

/* Is the assigned switch on right now, on this pad? */
function restartOn(gp, spec) {
  if (spec.kind === 'button') {
    return Boolean(gp.buttons && gp.buttons[spec.index] && gp.buttons[spec.index].pressed);
  }
  return spec.index < gp.axes.length && gp.axes[spec.index] * spec.dir > RESTART_ON;
}

/* What the Settings row says. Axes are numbered as the calibrate screen's
 * axis strip numbers them, from zero, so the two agree. */
export function describeRestart(spec) {
  if (!spec) {
    return null;
  }
  return spec.kind === 'button' ? `Button ${spec.index}` : `Switch on axis ${spec.index}`;
}

/* A key code as the pilot reads it on the key: "Space", "Left Shift", "F". */
export function describeKey(code) {
  if (!code) {
    return null;
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  const side = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code);
  if (side) {
    const name = { Control: 'Ctrl', Meta: 'Cmd' }[side[1]] || side[1];
    return `${side[2]} ${name}`;
  }
  return code.replace(/^Numpad/, 'Pad ');
}

function loadWeaponKeys() {
  try {
    const raw = JSON.parse(localStorage.getItem(WEAPON_KEYS_STORE_KEY) || 'null');
    if (raw && typeof raw.gun === 'string' && typeof raw.missile === 'string' && raw.gun !== raw.missile) {
      return { gun: raw.gun, missile: raw.missile };
    }
  } catch (e) {
    /* Private mode or a corrupt blob: the defaults. */
  }
  return { ...WEAPON_KEYS_DEFAULT };
}

function saveWeaponKeys(keys) {
  try {
    localStorage.setItem(WEAPON_KEYS_STORE_KEY, JSON.stringify(keys));
    return true;
  } catch (e) {
    return false;
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

/*
 * IS EVERYTHING BUT `except` WHERE THE WIZARD LAST ACCEPTED IT?
 *
 * The release phase of every channel waits for the OTHER axes to be at
 * rest, so that the next step starts clean and a diagonal is not read as
 * two moves. Rest meant the centre step's reading, for every axis, and that
 * was wrong for exactly one of them: a throttle that has already been
 * identified.
 *
 * The throttle's own release accepts two places, its low end or its rest,
 * because "Now put the throttle all the way back down" is what the prompt
 * says and on a radio the bottom is where it stays. A pilot with a self
 * centring throttle (the LiteRadio of bug-851a43b7) who let go at the
 * centre step, so rest is the middle, and then obeyed that prompt and HELD
 * the throttle down, passed the throttle step and could not pass the next
 * one. Roll never released, because the throttle sat a whole unit from rest
 * and counted as another stick being held, and the hint said "One direction
 * at a time" to a pilot moving one stick. The only way on was to let go of
 * the throttle, which nothing told them. Found by the first draft of
 * scripts/input-selftest.js, which was that pilot and never got past roll.
 *
 * So an identified throttle is parked at either of the two places the
 * wizard has talked about: the bottom of its travel as the sweep found it,
 * or its rest. The bottom is read from the sweep rather than from `low`,
 * because noteThrottleSpring moves `low` to rest on a gamepad, and a
 * gamepad's stick can still be pushed to its physical bottom. Every other
 * axis, identified or not, still has to be at the centre step's rest: a
 * spring centred gimbal has one resting place and being anywhere else is a
 * hold, which is the discipline that keeps a diagonal from assigning two
 * channels.
 *
 * AND IT SAYS WHICH AXIS, the first one out of place, or -1 when every one
 * is parked.
 *
 * Because the screen has to say. bug-f06287ff, a BETAFPV JoyStick whose
 * throttle springs back to the middle, held down at the centre step as that
 * step asks, so its rest is the bottom: the yaw release told the pilot to let
 * the left stick come back to the centre, the throttle sprang up with it, and
 * the wizard waited for it to come back down with a hint about diagonals.
 * "calibration menu process seems to stop around the point where i need to
 * let the left stick come back to center." The wait is the rule above and is
 * right; saying nothing about it was the fault.
 */
function blockingAxis(c, axes, except) {
  const thr = c.draft.throttle;
  const thrAxis = thr && Number.isInteger(thr.axis) && thr.axis !== except ? thr.axis : -1;
  const n = Math.min(axes.length, c.rest.length);
  for (let i = 0; i < n; i += 1) {
    if (i === except || i === thrAxis) {
      continue;
    }
    if (Math.abs(axes[i] - c.rest[i]) > CAL.NEAR_REST) {
      return i;
    }
  }
  if (thrAxis < 0) {
    return -1;
  }
  const rest = c.rest[thrAxis];
  const bottom = thr.high >= rest ? c.min[thrAxis] : c.max[thrAxis];
  const v = axes[thrAxis];
  return Math.abs(v - bottom) <= CAL.NEAR_REST || Math.abs(v - rest) <= CAL.NEAR_REST ? -1 : thrAxis;
}

/*
 * What a channel's release is waiting on: an axis blockingAxis would name, or
 * the channel's own axis while it has not come back, or -1 when nothing is
 * and the release timer may run. calIdentify waits on it and calibrationView
 * names it, so the two cannot disagree. The throttle's own release accepts
 * its low end or its rest, because its prompt says "all the way back down".
 */
function releaseWaitsOn(c, axes) {
  const spec = c.draft[c.step];
  const own = spec ? spec.axis : -1;
  const other = blockingAxis(c, axes, own);
  if (other >= 0 || own < 0) {
    return other;
  }
  const v = axes[own];
  const back = c.step === 'throttle'
    ? Math.abs(v - spec.low) <= CAL.NEAR_REST || Math.abs(v - c.rest[own]) <= CAL.NEAR_REST
    : Math.abs(v - c.rest[own]) <= CAL.NEAR_REST;
  return back ? -1 : own;
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

/*
 * WHICH CHANNEL IS THE PILOT MOVING RIGHT NOW?
 *
 * The check step has no cursor. It is driven by sticks, by design, because
 * the radio it is checking may be the only thing the pilot can press with,
 * so there is no row to put a Reverse control on and no way to point at a
 * channel with a key. There is a better pointer anyway, and the pilot is
 * already holding it: the stick that is moving IS the selection.
 *
 * So the screen names the channel with a clear lead over the others, and
 * one key reverses that one. The pilot pushes right, sees the drawn stick
 * go left, presses the key while still holding it, and watches it come
 * good. Nothing to read, nothing to choose from a list.
 *
 * A clear lead matters: on a diagonal, or with a thumb resting on the
 * throttle, two channels are live and reversing either would be a guess.
 * Then nothing is named and no key does anything, which is the same
 * discipline the identify steps use for the same reason.
 */
function movingChannel(channels) {
  let best = null;
  let bestMag = 0;
  let secondMag = 0;
  for (const ch of IDENT_CHANNELS) {
    const mag = Math.abs(channels[ch] || 0);
    if (mag > bestMag) {
      secondMag = bestMag;
      bestMag = mag;
      best = ch;
    } else if (mag > secondMag) {
      secondMag = mag;
    }
  }
  if (!best || bestMag < CAL.REV_DELTA || bestMag - secondMag < CAL.REV_GAP) {
    return null;
  }
  return best;
}

/* How far from rest axis i has to be held, on the side it is being held,
 * to count as the stick the wizard asked for. See IDENT_SPAN. */
function identBar(c, i, v) {
  if (!c.sweepMin || !c.sweepMax || i >= c.sweepMin.length || i >= c.rest.length) {
    return CAL.IDENT_DELTA;
  }
  const side = v >= c.rest[i] ? c.sweepMax[i] - c.rest[i] : c.rest[i] - c.sweepMin[i];
  return Math.max(CAL.IDENT_FLOOR, Math.min(CAL.IDENT_DELTA, CAL.IDENT_SPAN * side));
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
 *
 * The same pilot, still holding the throttle down on the roll step, met a
 * second wall one step later, and that one is fixed rather than asked
 * about: see blockingAxis.
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
    confirm: c.checkOnly ? 'Check sticks' : 'Check',
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
    /* The stick that carries the throttle as well says to leave the throttle
     * down, because "come back to the centre" is an instruction to let go,
     * and a throttle that springs goes up to the middle when let go of. The
     * release then waits for it (blockingAxis), and the pilot of
     * bug-f06287ff, on a BETAFPV JoyStick, read that as the wizard stopping. */
    const centre = (ch) => (side(ch) === side('throttle')
      ? `Let the ${side(ch)} stick come back to the centre, with the throttle still all the way down.`
      : `Let the ${side(ch)} stick come back to the centre.`);
    return {
      throttle: 'Now put the throttle all the way back down.',
      roll: centre('roll'),
      pitch: centre('pitch'),
      yaw: centre('yaw'),
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

function calHint(c, travelled, need, gp, idleThrottle = 0, moving = null, blocked = null) {
  if (!gp) {
    return 'Radio disconnected. Plug it back in, joystick mode.';
  }
  if (c.step === 'center') {
    return 'Waiting until the reading is steady.';
  }
  if (c.step === 'sweep') {
    /*
     * A RADIO WITH EXACTLY FOUR AXES, ONE OF WHICH HAS NEVER MOVED AT ALL.
     *
     * bug-338cd29b, an OpenTX TX15 on an Android phone: "Doesn't recognize
     * yaw". The report's four axes read roll, pitch and a parked throttle,
     * and axis 3 read exactly 0. Every axis there is must be one of the
     * four sticks, so a still one is a stick the radio is not sending, and
     * no amount of stick moving on this screen will finish the step. Say
     * which, and where the fix is. Only for a radio with no spare axis,
     * because on one with switches and sliders a still axis is normal.
     *
     * AND IT IS NOT ALWAYS THE RADIO. Four axes is also exactly what Chrome
     * on Android hands over from a radio it does not recognise, having
     * dropped the rest, and that is the more common way to arrive here: see
     * fourAxisPad. The sentence used to send every one of those pilots to a
     * radio setting that was already right. It names both now, and the
     * screen that can tell them apart.
     */
    if (travelled === need - 1 && c.min && c.max && c.min.length === need) {
      for (let i = 0; i < need; i += 1) {
        if (c.max[i] - c.min[i] < 0.02) {
          return `Axis ${i} has not moved at all. If you have moved every stick, that one`
            + ' is not reaching this browser. Either the radio is not sending it (in its'
            + ' USB joystick settings, give each of the four sticks a channel, then'
            + ' reconnect), or the browser is dropping it, which Chrome on Android does.'
            + ' Stick help, in Settings, tells the two apart.';
        }
      }
    }
    if (travelled < need) {
      return `Keep going. Full travel on ${travelled} of ${need} axes so far.`;
    }
    /*
     * AND "BACK TO REST" DID NOT SAY WHICH REST.
     *
     * The step waits until EVERY axis is back within NEAR_REST of where the
     * centre step read it, and rest there is throttle all the way down and
     * every switch where it was. bug-6afb51eb, a Radiomaster Pocket: "Stuck
     * on step2. Centered the sticks, does not help". The report has the
     * throttle at the middle, which is centring the sticks, and not rest.
     * So name the axis that is holding the step up, and what rest is for it.
     */
    const live = gp.axes || [];
    let worst = -1;
    let worstD = CAL.NEAR_REST;
    for (let i = 0; i < Math.min(live.length, c.rest ? c.rest.length : 0); i += 1) {
      const d = Math.abs(live[i] - c.rest[i]);
      if (d >= worstD) {
        worst = i;
        worstD = d;
      }
    }
    if (worst < 0) {
      return 'Back to rest to continue.';
    }
    if (Math.abs(c.rest[worst]) > 0.8 && c.max[worst] - c.min[worst] >= CAL.SWEEP_TRAVEL) {
      return `Back to rest to continue: axis ${worst} has not come back to where it started.`
        + ' If that is the throttle, put it all the way down, as it was at the start.';
    }
    if (c.max[worst] - c.min[worst] < CAL.SWEEP_TRAVEL) {
      return `Back to rest to continue: axis ${worst} is not where it was at the start.`
        + ' If you flipped a switch, flip it back.';
    }
    return `Back to rest to continue: let the sticks come back to the centre (axis ${worst} is still off it).`;
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
    /*
     * The channel under their thumb, named, with the one key that fixes it
     * if it is backwards. This is the whole of the answer to "some are
     * inverted and there's no option to change it": the option is on the
     * screen that shows them the problem, at the moment they are looking
     * at it. See movingChannel and reverseChannel.
     */
    if (moving) {
      const rev = c.draft && c.draft.reverse && c.draft.reverse[moving];
      return `Moving ${moving}${rev ? ', reversed' : ''}.`
        + ' If the wrong stick moved on screen, press M.'
        + ` If it moved the wrong way, press R to reverse ${moving}.`;
    }
    const keep = c.checkOnly
      ? 'Enter or Save mapping keeps the change. Escape leaves it as it was.'
      : (c.draft && c.draft.select
        ? 'Enter, Save mapping, or the switch you just assigned. Escape cancels.'
        : 'Enter or Save mapping keeps it. Escape cancels.');
    return `Move one stick at a time and watch it. ${keep}`;
  }
  if (c.step === 'select') {
    return 'This radio reports no buttons, so one channel can be the button.'
      + ' No switch to spare? Skip. Holding any stick away from centre for'
      + ' a second counts as a press either way.';
  }
  if (c.phase === 'release') {
    /* What the release is waiting on, when it is not the stick just asked
     * for: the prompt already covers that one. See blockingAxis. */
    if (blocked && blocked.channel === 'throttle') {
      return `Waiting for the throttle, which reads ${blocked.percent} percent. It has to be all the way`
        + ' down before the next step. If it springs back up when you let go, hold it down: the last'
        + ' step offers to set zero where it rests.';
    }
    if (blocked && blocked.channel === SELECT_STEP) {
      return 'Waiting for the menu switch to go back where it was.';
    }
    if (blocked && blocked.channel) {
      return `Waiting for ${blocked.channel} to come back to the centre.`;
    }
    if (blocked) {
      return `Waiting for axis ${blocked.axis}, which has not gone back to where it was at the start.`
        + ' If that is a switch or a dial, put it back.';
    }
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
 *   hold    240 ms  -> 0.34  a flyable cruise on the way up
 *   after   240 ms  keeps rising, no flat part (a plateau felt like a pause)
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
  if (heldMs >= FULL_MS) {
    return 1;
  }
  /* No flat part: a plateau here read as the key sticking, a pause in the
   * middle of a hold. The stick keeps rising from the cruise value. */
  const u = (heldMs - CRUISE_MS) / (FULL_MS - CRUISE_MS);
  return CRUISE + (1 - CRUISE) * u;
}

/*
 * THE TWO THINGS A THROTTLE KEY CAN DO WHEN IT IS LET GO, the pilot's
 * choice on the Settings screen. bug-3a7be142: "whenever I press W or S, it
 * snaps strangely, and doesn't hold position like a real radio", asking for
 * "an option to toggle snapping, or for the throttle to hold position".
 *
 *   'hover'  springs back to hover once airborne and to idle on the pad.
 *            What the keys have always done, and the default.
 *   'hold'   stays exactly where it was left, the way a radio's throttle
 *            does, because a radio's throttle has no spring.
 */
export const KEY_THROTTLE_MODES = ['hover', 'hold'];

export function normaliseKeyThrottle(mode) {
  return mode === 'hold' ? 'hold' : 'hover';
}

/*
 * The stick a throttle key has to reach before letting go rests at hover.
 * It is main.js's TAKEOFF_THROTTLE, the point where the shell lifts a
 * landed craft, so the keys and the shell agree about what a takeoff is.
 * See applyKeyboardCollective.
 */
const KEY_LIFTOFF = 0.25;

/*
 * HOLD TIME TO TRAVEL, for the throttle that stays put.
 *
 * analogMag above is a POSITION, which is right for a key that springs back:
 * letting go ends the gesture. A throttle that stays put needs a RATE
 * instead, because every gesture starts from wherever the last one left it,
 * and the rate has to serve two jobs a single number cannot. Near hover this
 * plant climbs or sinks about 0.9 m/s per point of stick, so trimming a
 * hover wants taps worth a point or so. Punching out of a hover or cutting
 * to idle wants the whole stick in about a second.
 *
 * So the rate starts slow and speeds up the longer the key is held:
 *
 *   tap      90 ms  ->  1.1 points  a trim
 *   hold    250 ms  ->  5.5 points
 *   hold    500 ms  -> 27.4 points
 *   hold    750 ms  -> 65.2 points  hover to full at the shipped weight
 *   full    968 ms  -> the whole stick, idle to the top
 *
 * latchTravel(heldMs) is the travel a hold of that length has made in total,
 * and a poll moves the throttle by the difference across its own slice of
 * the hold. The travel is then the same however the slices fall, so the
 * poll rate, the frame rate and a dropped frame cannot change it. The hold
 * clock still advances at most 40 ms a poll, as it does for analogMag.
 */
function latchTravel(heldMs) {
  const SLOW = 0.12;       /* stick per second for the first touch */
  const FAST = 1.6;        /* stick per second once the key is held */
  const TAP_MS = 120;      /* the slow band: a tap stays inside it */
  const RAMP_MS = 500;     /* then the rate climbs to FAST over this */
  if (heldMs <= 0) {
    return 0;
  }
  const t = heldMs / 1000;
  const tap = TAP_MS / 1000;
  const ramp = RAMP_MS / 1000;
  if (t <= tap) {
    return SLOW * t;
  }
  const inRamp = Math.min(t - tap, ramp);
  let d = SLOW * tap + SLOW * inRamp + ((FAST - SLOW) / (2 * ramp)) * inRamp * inRamp;
  if (t > tap + ramp) {
    d += FAST * (t - tap - ramp);
  }
  return d;
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
    /*
     * WHICH HAND HAS THE STICKS on a device that has thumbs and keys both: a
     * touchscreen laptop, a Chromebook, a tablet with a keyboard. 'thumbs'
     * until a stick key goes down, 'keys' until a finger lands. Nothing to
     * decide on a phone, which has no keys, or on a desktop, which has no
     * thumb sticks, so this only ever matters where touchSource is set.
     *
     * bug-d1d3f4fb: a Chromebook pilot, "when I press the keyboard it doesn't
     * move anything". The thumb sticks mount wherever navigator reports touch
     * points and poll() took their branch and never read a key, while the
     * header of touchsticks.js said a touchscreen laptop keeps its keyboard.
     * It did not: every channel read 0 for W, the arrows and D, with the
     * overlay up, and read 0.34 on the same page with touch off.
     */
    this.hand = 'thumbs';
    this.keys = new Set();
    this.kb = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    /* Keyboard collective, used only when no radio is the stick source.
     * kbAir: W has taken us off the pad and S has not yet parked us.
     * kbThrFromKeys: W or S actually drove throttle this session, so a
     * harness poke via __stick is left alone instead of sprung. */
    this.kbAir = false;
    this.kbThrFromKeys = false;
    /* While launch control is holding on the pad, rest is idle, never hover,
     * so a W tap cannot spring to hover and fire the launch. */
    this.forcePadRest = false;
    /*
     * What the throttle keys do when let go, 'hover' or 'hold'. See
     * KEY_THROTTLE_MODES. main.js sets it from Settings.
     */
    this.keyThrottle = 'hover';
    /*
     * WHERE 'hover' SPRINGS TO, as stick travel. It was a constant, 0.22, and
     * it was wrong by thirteen points at the shipped weight: bug-3a7be142.
     * main.js now hands over the measured hover for the run's own throttle
     * cap, weight and pack through setKeyHover. This starting value is the
     * shipped machine, so a shell that never calls it still holds height.
     */
    this.kbHover = hoverStickPercent(100) / 100;
    /*
     * Whether the craft was sitting on something at the end of the last
     * frame, from main.js through noteLanded. Only the moment it BECOMES true
     * is used: see noteLanded for why the level would be wrong.
     */
    this.kbLanded = false;
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
    /* ownMap is what the pilot saved, or the AETR default when they have
     * not. map is what flies, and differs only for a standard gamepad. See
     * syncGuess. */
    this.ownMap = this.loadMap();
    this.map = this.ownMap;
    this.mapKey = 'own';
    this.padChoice = loadPadChoice();
    this.padPick = null;
    this.padPickQueued = null;
    this.padPickResult = null;
    this.seenPadKeys = new Set();
    this.padWasPresent = false;
    /* When the roster last ran and how many pads it saw: see poll. */
    this.rosterAt = -1e9;
    this.rosterCount = -1;
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
    /* And whether the guess's yaw axis rests like a throttle. See
     * noteYawParked. */
    this.guessYawParked = false;
    this.yawParkAt = null;
    this.yawParkSince = 0;
    /* The stick the pilot is flying without, on any map: the flight's
     * watch, the channels judged dead (a new array on every change, so the
     * shell can compare it by reference), and the ones that have proved
     * alive and are never judged again. See noteDeadChannels. Reset with
     * the pad and with the map, because it is a fact about both. */
    this.deadWatch = null;
    this.btnSpan = null;
    this.deadList = [];
    this.deadAlive = new Set();
    /* A pad the browser calls a standard gamepad whose stick axis rests off
     * centre like a throttle, which no gamepad does. See
     * noteStandardParked. */
    this.radioAsGamepad = false;
    this.stdPark = null;
    /* The help screen's own watch, from the moment it opened: every axis's
     * rest and range. Null while the screen is not up. See stickCheckView. */
    this.stickCheck = null;
    /* The radio's restart switch. See RESTART_STORE_KEY and
     * noteRestartSwitch. restartPrevOn starts unknown, so a switch that is
     * already on when the page loads is not a flip. */
    this.restartSpec = loadRestartSpec();
    this.restartPrevOn = null;
    this.restartCapture = null;
    this.restartFired = false;
    this.restartResult = null;
    /* The Auto reset switch. See AUTORESET_STORE_KEY. autoEdge is the
     * pending change main.js takes with takeAutoResetSwitch: true or false
     * for a switch's new position, 'toggle' for a button, null for none. */
    this.autoSpec = loadRestartSpec(AUTORESET_STORE_KEY);
    this.autoPrevOn = null;
    this.autoCapture = null;
    this.autoEdge = null;
    this.autoResult = null;
    /* The dogfight's gun and missile. See GUN_STORE_KEY. weaponsLive is set
     * by main.js while a dogfight is flying; nothing is read while it is
     * not, except a pick in progress. */
    this.weaponSpec = { gun: loadRestartSpec(GUN_STORE_KEY), missile: loadRestartSpec(MISSILE_STORE_KEY) };
    this.weaponKeys = loadWeaponKeys();
    this.weaponsLive = false;
    this.weaponCapture = null;
    this.weaponResult = null;
    this.padGun = false;
    this.padMissilePrev = null;
    this.missileFired = false;
    this.touchGun = false;
    /* The last pad seen, standard or not, for the arm up page's words. */
    this.weaponPadKind = null;
    /* The hold-to-select bootstrap for a radio reporting zero buttons.
     * See SELECT_STEP. */
    this.holdMs = 0;
    this.holdFired = false;
    this.holdAt = 0;
    this.onKey = null; /* main.js hooks non stick keys here; (code, repeat) */
    /* Which stick carries which channel, for the keyboard, an uncalibrated
     * standard gamepad and every gimbal this shell draws. A radio's mode
     * lives in the radio. See stickmode.js and standardGuessMap. */
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
     * WHAT THE FLIGHT MEASURED, for a feel report. bug-08577148.
     *
     * padHz above is read when a report is sent, and a report is sent from
     * the pause or results screen, with the pilot's hand on the mouse and
     * the sticks at rest. The browsers on the board move the Gamepad
     * timestamp only when something changes, so on the 24th of September
     * eleven of the twenty two radio reports among the open feel reports
     * said 0 Hz, ten of them sent from the pause screen, and the one that
     * said 12 was sent from results. A number that looks like an answer and
     * is not one, which is what the round that put padHz in the report
     * warned of.
     *
     * So the flight keeps its own record, and only the flight writes it.
     * main.js sets `flying` every frame. A rate window counts only when
     * every poll in it was in flight, so a window that straddles the pause
     * lends neither side its number. padHzMax is the highest such window: a
     * timestamp cannot change faster than the browser refreshes it, so the
     * highest window is the ceiling, and the ceiling is the question. travel
     * is how far each channel went, as the controller was fed it, so "it
     * will not give me the thrust to recover" can be read against the top
     * of the throttle the pilot actually reached.
     *
     * Forgotten with the pad and with a new map, beside the stick
     * resolution, and when the kind of source changes, because a record
     * that mixes the keyboard's travel with a radio's describes neither.
     */
    this.flying = false;
    this.windowFlying = true;
    this.flightRec = null;
    /* The record of the source that flew BEFORE this one, kept rather than
     * dropped when the kind of source changes. bug-e82b8bb8 was filed on
     * the keyboard four seconds after a radio had flown the complaint, and
     * the radio's record, the one that could have said how the flight went,
     * was gone. See flightRecord. */
    this.flightRecBefore = null;

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
      if (!e.repeat && this.weaponCapture && this.weaponCapture.keys) {
        if (this.takeWeaponKey(e.code)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      if (!e.repeat && this.weaponsLive && e.code === this.weaponKeys.missile) {
        this.missileFired = true;
      }
      if (!e.repeat) {
        this.keys.add(e.code);
        /* A stick key is the keyboard asking for the sticks. Edge triggered
         * on purpose: a key held down while a finger lands must not win the
         * hand back every poll. */
        if (this.isStickKey(e.code)) {
          this.takeKeys();
        }
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
    /* A finger on the glass, anywhere, gives the sticks back to the thumbs.
     * Captured, so it runs before the plates read the throttle it seeds. The
     * plates are hidden while the keys have the hand, so nothing else can
     * hear this touch. */
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.takeThumbs();
      }
    }, true);
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
    if (this.mapSeenParked || this.map.stored || this.map.guess === 'standard') {
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
    /* The standard layout is not a guess about the order: the spec fixes
     * it. Nothing here or in the two beside it has anything to find. */
    if (this.map.stored || this.map.guess === 'standard' || this.guessYawAlive) {
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

  /*
   * AND IS THE GUESS'S YAW REALLY A YAW STICK, OR IS IT A THROTTLE?
   *
   * bug-c9423f3e, a Radiomaster Pocket in Firefox: "the throttle is mapped on
   * the yaw axes and the throttle movement is not detected". Neither
   * question above catches it. noteThrottleParked had seen the guessed
   * throttle axis off centre once, and noteGuessOrder saw the guessed yaw
   * move plenty, because what is on it is the throttle.
   *
   * What gives a throttle away is how it RESTS. It has no spring, so it
   * stays where it was left, most often at the bottom, and it stays there
   * still for as long as nobody touches it. A yaw stick is on a spring and
   * comes back to the middle the moment the thumb lets go. So if the axis
   * the guess calls yaw sits off centre and still for PARK_MS, the guess has
   * a throttle where it expects yaw, and the pilot's throttle is turning the
   * quad instead of lifting it.
   *
   * Sticky, for the reason on noteThrottleParked: a warning that blinks is
   * worse than either answer. The one false positive is a thumb holding
   * full yaw against the stop for four seconds, and what it earns is an
   * offer to calibrate, which is not a wrong thing to offer.
   *
   * ON THE WALL CLOCK. How long a stick has rested is the pilot's time, so
   * the rest is timed from the wall stamp of the first poll that saw it
   * there, and not summed from the poll's dtMs. That dtMs is capped at
   * 100 ms for the keyboard's integration, so a main thread held up for
   * seconds (the title's world still building, shaders compiling) was
   * credited 100 ms of however long it was. Measured in lint:input, where
   * this row's check came in late or not at all in some runs: one run lost
   * 5.4 s in six capped polls, 5.2 s of it a single stall, and the row
   * arrived at 9.4 s of wall with 4.1 s credited; runs recorded in PROGRESS
   * waited past the check's 20 s. A pilot with a radio in the wrong mode on a slow machine
   * waited the same way. A stick read at the same place either side of a
   * stall rested through it as far as anything can tell.
   */
  noteYawParked(gp, nowWall) {
    if (this.map.stored || this.map.guess === 'standard' || this.guessYawParked) {
      return;
    }
    const spec = this.map.yaw;
    if (!gp || !spec || !Number.isInteger(spec.axis) || spec.axis >= gp.axes.length) {
      return;
    }
    const v = gp.axes[spec.axis];
    if (!(Math.abs(v) >= GUESS.PARK_OFF)) {
      this.yawParkAt = null;
      this.yawParkSince = 0;
      return;
    }
    if (this.yawParkAt === null || Math.abs(v - this.yawParkAt) > GUESS.PARK_STILL) {
      this.yawParkAt = v;
      this.yawParkSince = nowWall;
      return;
    }
    if (nowWall - this.yawParkSince >= GUESS.PARK_MS) {
      this.guessYawParked = true;
    }
  }

  /*
   * A CHANNEL THAT HAS NOT MOVED ONCE IN REAL FLYING.
   *
   * The owner, 28 September: tickets saying a controller "can't use yaw or
   * pitch", and no way to tell a radio set up wrong from a fault here. The
   * pilot who files one has usually spent a minute trying to yaw first, and
   * that minute is evidence nobody was reading. So the flight reads it: how
   * far each channel has gone, as this pad and this map deliver it, before
   * any key is laid over the top, and how long it has been flown.
   *
   * A channel is called DEAD when its whole range in DEAD.FLY_MS of flight
   * (the throttle's in THROTTLE_MS) is under DEAD.STILL, while at least two
   * of the others have swept like sticks. Nothing about why: the axis may
   * not exist on this pad (see missingChannels), the browser may never have
   * delivered it (see fourAxisPad), the map may have the stick somewhere
   * else (see strayAxes), or the radio may not send it. Telling those apart
   * is the help screen's job, with the pilot's hand on the stick, and this
   * only has to say that there is something to tell apart.
   *
   * Tested both ways, as every latch here is: a dead channel that then moves
   * like a stick comes down and is never judged again on this pad and map,
   * and a switch thrown on the same axis is not a stick moving.
   *
   * Called from poll() while flying, with the pad's own reading. Nothing is
   * allocated per poll once the watch exists: the ranges are grown in place
   * and the list is replaced only when a verdict changes.
   */
  noteDeadChannels(ch, gp, dtMs) {
    let w = this.deadWatch;
    if (!w) {
      w = { ms: 0, span: {}, axes: [] };
      for (const name of IDENT_CHANNELS) {
        w.span[name] = newSpan(ch[name]);
      }
      this.deadWatch = w;
    }
    w.ms += dtMs;
    for (const name of IDENT_CHANNELS) {
      growSpan(w.span[name], ch[name]);
    }
    /* The raw axes too, bounded like mapReport's, so a report and the help
     * screen can say where a missing stick went. See strayAxes. */
    const n = Math.min(gp.axes.length, 16);
    for (let i = 0; i < n; i += 1) {
      if (w.axes[i]) {
        growSpan(w.axes[i], gp.axes[i]);
      } else {
        w.axes[i] = newSpan(gp.axes[i]);
      }
    }
    for (const name of IDENT_CHANNELS) {
      if (this.deadAlive.has(name)) {
        continue;
      }
      const s = w.span[name];
      if (sweptLikeStick(s, DEAD.ALIVE)) {
        this.deadAlive.add(name);
        if (this.deadList.includes(name)) {
          this.deadList = this.deadList.filter((x) => x !== name);
        }
        continue;
      }
      if (this.deadList.includes(name) || s.hi - s.lo >= DEAD.STILL) {
        continue;
      }
      if (w.ms < (name === 'throttle' ? DEAD.THROTTLE_MS : DEAD.FLY_MS)) {
        continue;
      }
      let others = 0;
      for (const o of IDENT_CHANNELS) {
        if (o !== name && sweptLikeStick(w.span[o], o === 'throttle' ? DEAD.USED_THROTTLE : DEAD.USED)) {
          others += 1;
        }
      }
      if (others >= DEAD.OTHERS) {
        this.deadList = this.deadList.concat(name);
      }
    }
  }

  /* A new pad or a new map: the old flight said nothing about either. */
  forgetDeadChannels() {
    this.deadWatch = null;
    this.btnSpan = null;
    if (this.deadList.length) {
      this.deadList = [];
    }
    this.deadAlive.clear();
  }

  /*
   * THE SAVED MAP NAMES AN AXIS THIS PAD DOES NOT HAVE.
   *
   * readGamepad reads a missing axis as 0, silently, which is right for a
   * poll and wrong for a pilot: calibrate a radio with eight axes, plug in
   * one with four, or open the same page on a phone whose browser hands over
   * four, and yaw on axis 5 is a stick that does nothing and says nothing.
   * The map is one per browser, not one per radio, so this is not rare.
   * Asked live rather than latched, because plugging the first radio back in
   * answers it.
   */
  missingChannels(gp) {
    if (!gp || !gp.axes) {
      return [];
    }
    const out = [];
    for (const ch of IDENT_CHANNELS) {
      const spec = this.map[ch];
      if (spec && Number.isInteger(spec.axis) && spec.axis >= gp.axes.length) {
        out.push(ch);
      }
    }
    return out;
  }

  /*
   * WHAT THE PAD'S BUTTONS HAVE READ, for a bug report and nothing else.
   *
   * bug-2a9d8037, a DJI Controller 3 on a Pixel 9 in Chrome: four axes and
   * seventeen buttons, roll, pitch and throttle moving and the fourth axis
   * flat for the whole flight, and the same radio fine on a PC. Chrome's
   * Android fallback turns the axes it knows as triggers (Brake, Gas,
   * Throttle, Ltrigger, Rtrigger) into the analog VALUE of buttons 6 and 7
   * and drops or aliases the rest, so a stick the axes never show may be
   * sitting in a button's value. The report carried the axes and not one
   * number about the buttons, so that could not be told from a stick the
   * phone never delivers. This keeps, for each button that has ever left
   * rest, the lowest and highest value it read. Nothing flies on it.
   * Bounded: sixteen entries, reset with the pad.
   */
  noteButtonTravel(gp) {
    const b = gp.buttons;
    if (!b) {
      return;
    }
    if (!this.btnSpan) {
      this.btnSpan = {};
    }
    const n = Math.min(b.length, 32);
    for (let i = 0; i < n; i += 1) {
      const v = b[i] ? b[i].value : 0;
      const seen = this.btnSpan[i];
      if (seen) {
        if (v < seen[0]) {
          seen[0] = v;
        }
        if (v > seen[1]) {
          seen[1] = v;
        }
      } else if (Math.abs(v) > 0.02 && Object.keys(this.btnSpan).length < 16) {
        this.btnSpan[i] = [Math.min(0, v), Math.max(0, v)];
      }
    }
  }

  /* The two for the report: [lo, hi] per button that has left rest, and the
   * span of every raw axis the flight has watched. */
  rawTravel() {
    const round = (v) => Math.round(v * 100) / 100;
    const buttons = {};
    if (this.btnSpan) {
      for (const k of Object.keys(this.btnSpan)) {
        buttons[k] = [round(this.btnSpan[k][0]), round(this.btnSpan[k][1])];
      }
    }
    const w = this.deadWatch;
    const axes = w ? w.axes.map((s) => (s ? [round(s.lo), round(s.hi)] : null)) : [];
    return { axes, buttons };
  }

  /*
   * AXES THE MAP DOES NOT READ THAT THE FLIGHT HAS SEEN SWEPT LIKE A STICK,
   * which is where a dead channel usually went. noteGuessOrder's question,
   * asked of every map rather than the guess alone, and only answered here
   * for a report and the help screen: on its own it proves nothing, because
   * a pilot may simply have turned a knob.
   */
  strayAxes() {
    const w = this.deadWatch;
    if (!w) {
      return [];
    }
    const named = usedAxes(this.map);
    const out = [];
    for (let i = 0; i < w.axes.length; i += 1) {
      if (w.axes[i] && !named.has(i) && sweptLikeStick(w.axes[i], GUESS.STRAY_SWEPT)) {
        out.push(i);
      }
    }
    return out;
  }

  /*
   * A STANDARD GAMEPAD WHOSE STICK RESTS LIKE A THROTTLE IS NOT A GAMEPAD.
   *
   * The Standard Gamepad layout's axes 0 to 3 are four sprung stick axes,
   * and a sprung stick nobody is touching reads zero. A radio's throttle has
   * no spring and waits wherever it was left. So a pad the browser calls
   * standard, flying the standard layout, with one of those four axes off
   * centre and still for GUESS.PARK_MS, is a radio the browser has dressed
   * as a gamepad, and the standard layout is putting its sticks on the wrong
   * channels. firefoxRadio catches the case this is known to happen in by
   * name; this catches it by behaviour, wherever else it turns up.
   *
   * ONLY OUT OF FLIGHT. In flight a gamepad pilot holds full throttle against
   * the stop for seconds at a time, which is exactly this reading. In a menu
   * nobody does, and a radio's throttle sits at the bottom through all of it.
   * The verdict changes nothing that flies: it is a row offering the wizard,
   * which maps whatever actually moves.
   */
  noteStandardParked(gp, nowWall) {
    if (this.flying) {
      this.stdPark = null;
      return;
    }
    if (this.radioAsGamepad || this.map.guess !== 'standard') {
      return;
    }
    const n = Math.min(gp.axes.length, 4);
    if (!this.stdPark || this.stdPark.length !== n) {
      this.stdPark = [];
      for (let i = 0; i < n; i += 1) {
        this.stdPark.push({ at: null, since: 0 });
      }
    }
    for (let i = 0; i < n; i += 1) {
      const v = gp.axes[i];
      const p = this.stdPark[i];
      if (!(Math.abs(v) >= GUESS.PARK_OFF)) {
        p.at = null;
        continue;
      }
      if (p.at === null || Math.abs(v - p.at) > GUESS.PARK_STILL) {
        p.at = v;
        p.since = nowWall;
        continue;
      }
      if (nowWall - p.since >= GUESS.PARK_MS) {
        this.radioAsGamepad = true;
        return;
      }
    }
  }

  /*
   * THE RESTART SWITCH, watched on every poll that reads a radio.
   *
   * A flip is the moment it goes from off to on. Only that moment counts, so
   * a two position switch left on after a restart does nothing more until
   * it is turned off and on again, and a switch that was on before anyone
   * assigned it is not a flip either. main.js takes it with takeRestart and
   * acts on it in flight only, exactly where R acts.
   */
  noteRestartSwitch(gp) {
    if (this.restartCapture) {
      this.runRestartCapture(gp);
      return;
    }
    const spec = this.restartSpec;
    if (!spec || spec.id !== gp.id) {
      this.restartPrevOn = null;
      return;
    }
    const on = restartOn(gp, spec);
    if (this.restartPrevOn === false && on) {
      this.restartFired = true;
    }
    this.restartPrevOn = on;
  }

  /* Choosing the row: the next button to go down, or the next axis the
   * sticks do not use to move half its travel, becomes the switch. The pad
   * is snapshotted on the first poll after this, so whatever is already
   * held or flipped does not count. */
  beginRestartCapture() {
    this.cancelAutoResetCapture();
    this.restartCapture = { id: null, buttons: null, axes: null };
    this.restartResult = null;
  }

  cancelRestartCapture() {
    this.restartCapture = null;
  }

  clearRestartSwitch() {
    this.restartSpec = null;
    this.restartPrevOn = null;
    this.restartFired = false;
    saveRestartSpec(null);
  }

  /* Listen for the one thing to flip or press, on whichever capture object
   * is passed, and hand back its spec or null. Shared by the Restart switch
   * and the Auto reset switch. */
  captureSwitch(cap, gp) {
    const pressedAt = (i) => Boolean(gp.buttons && gp.buttons[i] && gp.buttons[i].pressed);
    if (!cap.buttons || cap.id !== gp.id) {
      cap.id = gp.id;
      cap.buttons = (gp.buttons || []).map((b, i) => pressedAt(i));
      cap.axes = Array.from(gp.axes);
      return null;
    }
    let spec = null;
    for (let i = 0; i < cap.buttons.length && !spec; i += 1) {
      const p = pressedAt(i);
      if (p && !cap.buttons[i]) {
        spec = { id: gp.id, kind: 'button', index: i, dir: 1 };
      }
      /* Let go, and it can be pressed for the job after all. */
      cap.buttons[i] = p;
    }
    if (!spec) {
      const sticks = new Set();
      for (const ch of IDENT_CHANNELS) {
        const m = this.map[ch];
        if (m && Number.isInteger(m.axis)) {
          sticks.add(m.axis);
        }
      }
      for (let i = 0; i < gp.axes.length && i < cap.axes.length && !spec; i += 1) {
        const d = gp.axes[i] - cap.axes[i];
        if (!sticks.has(i) && Math.abs(d) >= RESTART_FLIP) {
          spec = { id: gp.id, kind: 'axis', index: i, dir: (gp.axes[i] > 0 || (gp.axes[i] === 0 && d > 0)) ? 1 : -1 };
        }
      }
    }
    return spec;
  }

  runRestartCapture(gp) {
    const spec = this.captureSwitch(this.restartCapture, gp);
    if (!spec) {
      return;
    }
    this.restartSpec = spec;
    this.restartCapture = null;
    /* On now, because it was just flipped on: the flip that assigned it is
     * not a restart. */
    this.restartPrevOn = restartOn(gp, spec);
    this.restartFired = false;
    this.restartResult = saveRestartSpec(spec) ? 'saved' : 'unsaved';
  }

  /*
   * THE AUTO RESET SWITCH, watched beside the restart switch on every poll
   * that reads a radio. A switch (an axis) reports its position whenever it
   * changes, so up is on and down is off whatever the menu said last; a
   * button reports a toggle. The first read after the page loads, or after a
   * different pad, only learns the position, as the restart switch does, so
   * a switch left on does not overrule the setting the pilot saved.
   */
  noteAutoResetSwitch(gp) {
    if (this.autoCapture) {
      const spec = this.captureSwitch(this.autoCapture, gp);
      if (spec) {
        this.autoSpec = spec;
        this.autoCapture = null;
        this.autoPrevOn = restartOn(gp, spec);
        this.autoEdge = null;
        this.autoResult = saveRestartSpec(spec, AUTORESET_STORE_KEY) ? 'saved' : 'unsaved';
      }
      return;
    }
    const spec = this.autoSpec;
    if (!spec || spec.id !== gp.id) {
      this.autoPrevOn = null;
      return;
    }
    const on = restartOn(gp, spec);
    if (this.autoPrevOn !== null && on !== this.autoPrevOn) {
      if (spec.kind === 'button') {
        if (on) {
          this.autoEdge = 'toggle';
        }
      } else {
        this.autoEdge = on;
      }
    }
    this.autoPrevOn = on;
  }

  beginAutoResetCapture() {
    this.cancelRestartCapture();
    this.autoCapture = { id: null, buttons: null, axes: null };
    this.autoResult = null;
  }

  cancelAutoResetCapture() {
    this.autoCapture = null;
  }

  clearAutoResetSwitch() {
    this.autoSpec = null;
    this.autoPrevOn = null;
    this.autoEdge = null;
    saveRestartSpec(null, AUTORESET_STORE_KEY);
  }

  /* null, true, false or 'toggle': one change, taken once. */
  takeAutoResetSwitch() {
    const e = this.autoEdge;
    this.autoEdge = null;
    return e;
  }

  takeAutoResetResult() {
    const r = this.autoResult;
    this.autoResult = null;
    return r;
  }

  /* One flip, one restart. */
  takeRestart() {
    const fired = this.restartFired;
    this.restartFired = false;
    return fired;
  }

  takeRestartResult() {
    const r = this.restartResult;
    this.restartResult = null;
    return r;
  }

  /*
   * THE DOGFIGHT'S GUN AND MISSILE on a pad, watched on every poll that
   * reads one, beside the restart switch. A pick in progress listens for
   * the next button or switch, as the restart switch's does; otherwise,
   * only while a dogfight flies, the gun is whether its button or switch
   * is on and the missile is the moment its own goes on.
   */
  noteWeapons(gp) {
    this.weaponPadKind = gp.mapping === 'standard' ? 'gamepad' : 'radio';
    const cap = this.weaponCapture;
    if (cap && cap.pad) {
      const spec = this.captureSwitch(cap.pad, gp);
      if (spec) {
        const other = cap.which === 'gun' ? 'missile' : 'gun';
        const o = this.weaponSpec[other];
        /* One switch cannot be both: the other one gives it up. */
        if (o && o.id === spec.id && o.kind === spec.kind && o.index === spec.index) {
          this.weaponSpec[other] = null;
          saveRestartSpec(null, other === 'gun' ? GUN_STORE_KEY : MISSILE_STORE_KEY);
        }
        this.weaponSpec[cap.which] = spec;
        this.weaponCapture = null;
        this.padMissilePrev = null;
        this.weaponResult = {
          which: cap.which,
          saved: saveRestartSpec(spec, cap.which === 'gun' ? GUN_STORE_KEY : MISSILE_STORE_KEY),
          label: describeRestart(spec),
        };
      }
      return;
    }
    if (!this.weaponsLive) {
      this.padGun = false;
      this.padMissilePrev = null;
      return;
    }
    const gun = this.weaponSpecFor('gun', gp);
    this.padGun = gun ? restartOn(gp, gun) : false;
    const missile = this.weaponSpecFor('missile', gp);
    if (!missile) {
      this.padMissilePrev = null;
      return;
    }
    const on = restartOn(gp, missile);
    if (this.padMissilePrev === false && on) {
      this.missileFired = true;
    }
    this.padMissilePrev = on;
  }

  /* The spec in use on this pad: the one picked for it, or a standard
   * gamepad's trigger and bumper when nothing was. */
  weaponSpecFor(which, gp) {
    const spec = this.weaponSpec[which];
    if (spec && spec.id === gp.id) {
      return spec;
    }
    if (!spec && gp.mapping === 'standard') {
      return { id: gp.id, kind: 'button', index: which === 'gun' ? PAD_GUN_DEFAULT : PAD_MISSILE_DEFAULT, dir: 1 };
    }
    return null;
  }

  /* Pick the gun or the missile: the next button, switch or key. */
  beginWeaponCapture(which) {
    this.cancelRestartCapture();
    this.cancelAutoResetCapture();
    this.weaponCapture = { which, pad: { id: null, buttons: null, axes: null }, keys: true };
    this.weaponResult = null;
  }

  cancelWeaponCapture() {
    this.weaponCapture = null;
  }

  /* A key pressed while a pick is listening. False when the key is not one
   * a weapon may take, so it does what it always does. */
  takeWeaponKey(code) {
    const cap = this.weaponCapture;
    if (!cap || WEAPON_KEYS_REFUSED.has(code) || this.isStickKey(code)) {
      return false;
    }
    const other = cap.which === 'gun' ? 'missile' : 'gun';
    const keys = { ...this.weaponKeys, [cap.which]: code };
    if (keys[other] === code) {
      keys[other] = this.weaponKeys[cap.which];
    }
    this.weaponKeys = keys;
    this.weaponCapture = null;
    this.weaponResult = { which: cap.which, saved: saveWeaponKeys(keys), label: describeKey(code), key: true };
    return true;
  }

  takeWeaponResult() {
    const r = this.weaponResult;
    this.weaponResult = null;
    return r;
  }

  clearWeaponSwitch(which) {
    this.weaponSpec[which] = null;
    saveRestartSpec(null, which === 'gun' ? GUN_STORE_KEY : MISSILE_STORE_KEY);
  }

  /* Held this poll: the key, the pad's button or switch, or the screen's
   * button. */
  gunHeld() {
    return this.keys.has(this.weaponKeys.gun) || this.padGun || this.touchGun;
  }

  /* Pressed since it was last asked: once a press. */
  takeMissile() {
    const f = this.missileFired;
    this.missileFired = false;
    return f;
  }

  /* What the arm up page and Settings say the weapons are on, for the pad
   * in use, or the keys when there is none. */
  weaponLabels(gp = null) {
    const out = {};
    for (const which of ['gun', 'missile']) {
      const spec = gp ? this.weaponSpecFor(which, gp) : this.weaponSpec[which];
      let pad = null;
      if (spec) {
        pad = this.weaponSpec[which] ? describeRestart(spec)
          : (which === 'gun' ? 'Right trigger' : 'Right bumper');
      }
      out[which] = { pad, picked: Boolean(this.weaponSpec[which]), key: describeKey(this.weaponKeys[which]) };
    }
    return out;
  }

  /* Can the mapping be trusted for more than flying: a pilot's own map
   * always, and the AETR guess once it has behaved like a radio. This is
   * what decides whether the menus let the sticks move left and right, and
   * whether the front page says anything at all. */
  mapUsable() {
    return Boolean(this.map.stored || this.mapSeenParked || this.map.guess === 'standard');
  }

  /*
   * WHICH MAP FLIES THIS PAD. The pilot's own, unless the pad is a standard
   * gamepad and there is no own map or the own map is the saved AETR guess,
   * in which case the standard layout in the pilot's stick mode. See
   * standardGuessMap and isAetrGuess. Rebuilt only when the answer changes,
   * so the map object a poll reads is stable between changes.
   */
  guessKey(gp) {
    const own = this.ownMap;
    const standard = Boolean(gp && gp.mapping === 'standard');
    const radio = standard && firefoxRadio(gp);
    /* The saved AETR guess on any standard pad, and the saved standard layout
     * on a Firefox radio, are guesses somebody pressed Save on. See
     * isAetrGuess and isStandardGuess. */
    const mine = own.stored && !(standard && isAetrGuess(own))
      && !(radio && isStandardGuess(own));
    if (mine || !standard) {
      return 'own';
    }
    /* A radio Firefox has called a gamepad. Not in the stick mode's key: a
     * radio applies its own mode. See firefoxRadio. */
    return radio ? 'firefox' : `standard${this.stickMode}`;
  }

  /* The map a given pad would fly, without making it the one that flies.
   * The pad picker previews every plugged-in pad through this. */
  mapFor(gp) {
    const key = this.guessKey(gp);
    if (key === this.mapKey) {
      return this.map;
    }
    if (key === 'own') {
      return this.ownMap;
    }
    return key === 'firefox' ? firefoxRadioGuessMap() : standardGuessMap(this.stickMode);
  }

  syncGuess(gp) {
    const key = this.guessKey(gp);
    if (key === this.mapKey) {
      return;
    }
    this.map = this.mapFor(gp);
    this.mapKey = key;
    /* Different axes, so the step measured on the old ones is not these,
     * and a channel judged on the old map was judged on other axes. */
    this.forgetAxisResolution();
    this.forgetDeadChannels();
  }

  /*
   * WHICH AXES THIS PAGE IS FLYING AND WHAT THEY READ, for a bug report.
   *
   * A radio ticket arrived with the stick path's rates and nothing about the
   * mapping, so "the throttle is mapped on the yaw axes" could not be
   * checked against anything and the reporter had to be asked for a
   * screenshot they might never send. This is that screenshot: the pad,
   * whether the map is the pilot's or the guess, the axis each channel is
   * read from, every axis as it reads at the moment of sending, and the
   * three verdicts about the guess. Null with no pad. Every axis, not
   * snapshotAxes' eight: an axis past the eighth is exactly what the
   * Android throttle lead in PROGRESS.md suspects and nothing else here
   * would show it. Sixteen bounds the report.
   */
  mapReport() {
    const gp = this.firstGamepad();
    if (!gp) {
      return null;
    }
    this.syncGuess(gp);
    const m = this.map || {};
    const at = (ch) => (m[ch] && Number.isInteger(m[ch].axis) ? m[ch].axis : null);
    return {
      pad: shortPadName(gp.id),
      /* 'standard' is the Standard Gamepad layout in the pilot's mode, and
       * `layout` and `mode` say why: three tickets carried a gamepad flying
       * the radio guess and nothing in them said it was a gamepad. */
      map: m.stored ? 'calibrated' : (m.guess === 'standard' ? 'standard' : 'guess'),
      layout: gp.mapping || 'none',
      mode: this.stickMode,
      axes: { roll: at('roll'), pitch: at('pitch'), yaw: at('yaw'), throttle: at('throttle') },
      live: Array.from(gp.axes).slice(0, 16).map((v) => Math.round(v * 100) / 100),
      usable: this.mapUsable(),
      noYaw: this.guessWrongOrder,
      yawParked: this.guessYawParked,
      /*
       * WHICH GUESS, AND WHAT THE STICK CHECK HAS SEEN. `map` says guess for
       * the AETR guess and for the Firefox radio guess alike, and they read
       * different axes. The button count is the other half of a pad's shape:
       * four axes and sixteen or seventeen buttons with no mapping is Chrome
       * on Android's fallback for a radio (see fourAxisPad), and none of the
       * phone tickets could say so.
       */
      guess: m.stored ? null : (m.guess || 'aetr'),
      buttons: gp.buttons ? gp.buttons.length : 0,
      raw: this.rawTravel(),
      check: {
        dead: this.deadList,
        missing: this.missingChannels(gp),
        stray: this.strayAxes(),
        flownS: this.deadWatch ? Math.round(this.deadWatch.ms / 1000) : 0,
        asGamepad: this.radioAsGamepad,
      },
    };
  }

  /*
   * WHAT THE BROWSER LISTED, before this page decided which of it to fly.
   *
   * Four tickets from WebKit, three of them a radio on a Mac in Safari
   * (bug-c3ecb273, bug-7d3064fc, bug-616cc604) and one an iPad
   * (bug-40980a75), read the same: `source` the keyboard, `padHz` 0, `map`
   * null. That is one symptom with two causes a report could not tell apart.
   * Either the browser handed this page nothing, or it handed it something
   * that listGamepads then threw away for being disconnected or having fewer
   * than four axes, and both look like a pilot with no radio. So a Safari
   * ticket could only ever be argued from the other Safari tickets.
   *
   * This is the missing field: whether the Gamepad API is there at all, how
   * many entries navigator.getGamepads() returned, how many of them this page
   * flies, and the shape of the first few, so that a pad that was listed and
   * dropped is named with its axis count. Read when a report is sent and
   * never per frame. Four entries of sixty four characters bound it, because
   * the board caps a context at 8000 characters.
   */
  browserPads() {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav || typeof nav.getGamepads !== 'function') {
      return { api: false, listed: 0, used: 0, list: [] };
    }
    let entries;
    try {
      entries = Array.from(nav.getGamepads() || []);
    } catch (e) {
      /* Some browsers throw where a page may not read gamepads at all. That
       * is a different answer from an empty list, so it says which. */
      return {
        api: true, threw: String((e && e.name) || 'error').slice(0, 40), listed: 0, used: 0, list: [],
      };
    }
    const list = [];
    let listed = 0;
    for (let i = 0; i < entries.length; i += 1) {
      const gp = entries[i];
      if (!gp) {
        continue;
      }
      listed += 1;
      if (list.length < 4) {
        list.push(`#${gp.index} ${String(gp.id || '').slice(0, 64)}, ${gp.mapping || 'no mapping'},`
          + ` ${gp.axes ? gp.axes.length : 0} axes, ${gp.buttons ? gp.buttons.length : 0} buttons,`
          + ` ${gp.connected ? 'connected' : 'not connected'}`);
      }
    }
    return { api: true, listed, used: listGamepads().length, list };
  }

  firstGamepad() {
    return this.pickPad(listGamepads());
  }

  /* firstGamepad for a list already in hand: poll() lists the pads once a
   * tick and hands the one list to this and to the roster. */
  pickPad(pads) {
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
    /* And what its axes have been seen doing: see noteGuessOrder and
     * noteYawParked. */
    this.guessSpan = null;
    this.guessYawAlive = false;
    this.guessWrongOrder = false;
    this.guessYawParked = false;
    this.yawParkAt = null;
    this.yawParkSince = 0;
    /* And so is the stick resolution. Same line, same reason. */
    this.forgetAxisResolution();
    this.forgetFlightRecord();
    /* And what the flight and the menus have said about its sticks: see
     * noteDeadChannels and noteStandardParked. */
    this.forgetDeadChannels();
    this.radioAsGamepad = false;
    this.stdPark = null;
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
  notePadRoster(pads = listGamepads()) {
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
      cards.push({
        key,
        title: `Joystick ${i + 1}`,
        name: shortPadName(gp.id),
        motion,
        live: motion >= PAD_PICK.WIGGLE,
        chosen: p.candidateKey === key,
        /*
         * THE STICKS AS THIS PAGE WOULD FLY THEM, not the device's raw axes.
         *
         * The card drew axes 0 and 1 as the left stick and 2 and 3 as the
         * right, which is a gamepad's layout and nothing else's. A radio
         * reports its channels in channel order, so the picture answered
         * neither question a pilot brings to it: it was not their sticks
         * and it was not what the quad would do. bug-9983ae9a, a Flysky
         * SM001: "On the test image you can see on one side the bullet is
         * moving for both sticks but not as they should". A radio that
         * reports throttle first draws exactly that: its left plate moves
         * for the throttle and for the roll.
         *
         * readGamepad through the live mapping is what flight reads, so
         * the picture is now a preview that is true either way. Calibrated,
         * it follows the pilot's hands. Uncalibrated, it is the AETR guess,
         * and a guess that is wrong for this radio shows up wrong HERE,
         * before the quad does it, beside the words that say how to fix it.
         * Which of the two it is rides out as mapKnown below. Motion and the
         * lit card still come from the raw axes above, because they answer
         * "which device is this" and no mapping should get in the way.
         */
        sticks: this.readGamepad(gp, this.mapFor(gp)),
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
      /* Whether the sticks drawn on the cards come through the pilot's own
       * calibration or through the built in AETR guess. */
      mapKnown: Boolean(this.map.stored),
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
      /* guessYawParked the guess's yaw axis rests off centre and still, the
       *            way a throttle does: the pilot's throttle is on the axis
       *            being flown as yaw. See noteYawParked. */
      guessYawParked: this.guessYawParked,
      /* deadChannels  channels that have not moved once in real flying while
       *            the others were in use, on any map. The same array until
       *            a verdict changes. See noteDeadChannels.
       * missingChannels  channels the map reads from an axis this pad does
       *            not have. See missingChannels.
       * radioAsGamepad  a pad the browser calls a gamepad that rests like a
       *            radio. See noteStandardParked.
       * fourAxes   the pad hands over exactly four axes and is not a
       *            standard gamepad: what Chrome on Android does with a
       *            radio. The shell knows the platform. See fourAxisPad.
       * axisCount  how many it hands over, for the words. */
      deadChannels: this.deadList,
      missingChannels: this.missingChannels(selected),
      radioAsGamepad: this.radioAsGamepad,
      fourAxes: fourAxisPad(selected),
      axisCount: selected && selected.axes ? selected.axes.length : 0,
      /* restart    the restart switch for the pad in use, as the Settings
       *            row names it, or null. restartCapturing: the row is
       *            waiting for a flip. See noteRestartSwitch. */
      restart: selected && this.restartSpec && this.restartSpec.id === selected.id
        ? describeRestart(this.restartSpec)
        : null,
      restartCapturing: Boolean(this.restartCapture),
      /* autoReset    the Auto reset switch for the pad in use, worded as the
       *              restart one is, or null. autoResetCapturing: the row
       *              is waiting for a flip. See noteAutoResetSwitch. */
      autoReset: selected && this.autoSpec && this.autoSpec.id === selected.id
        ? describeRestart(this.autoSpec)
        : null,
      autoResetCapturing: Boolean(this.autoCapture),
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
      return { up: false, down: false, dev: 0 };
    }
    const axes = gp.axes;
    if (!this.navRest || this.navRest.length !== axes.length) {
      this.navRest = Array.from(axes);
      return { up: false, down: false, dev: 0 };
    }
    let worst = 0;
    for (let i = 0; i < axes.length; i += 1) {
      const d = axes[i] - this.navRest[i];
      if (Math.abs(d) > Math.abs(worst)) {
        worst = d;
      }
    }
    /* `dev` is how far the worst axis is from where it rested, for a menu
     * that opened under the pilot's hands to ask whether the radio is quiet:
     * see src/input/padgate.js. */
    return { up: worst > 0.55, down: worst < -0.55, dev: Math.abs(worst) };
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
        roll: null,
        pitch: null,
        yaw: null,
        throttle: null,
        select: null,
        /* Nothing is backwards until a pilot says so. The wizard learns
         * direction from the direction they push. See cloneReverse. */
        reverse: cloneReverse(null),
      },
    };
  }

  /*
   * THE CHECK STEP ON ITS OWN, AGAINST THE MAPPING ALREADY SAVED.
   *
   * The wizard's last step is the only place in this shell that shows a
   * pilot what their mapping actually does: live gimbals, every axis, and
   * now the reverse control. It was reachable only by completing the six
   * steps in front of it, so a pilot who noticed a backwards channel a week
   * later had to do the whole calibration again to reach the one screen
   * that could tell them anything, and had the same chance of the same
   * wrong push on the way.
   *
   * This opens that screen by itself with the saved map as the draft. Save
   * writes it back, Escape leaves it alone, and neither touches an axis
   * assignment. `rest` is taken here rather than measured, because there is
   * no Centre step to measure it with and the strip only uses it to decide
   * which cells to light.
   */
  startCalibrationCheck() {
    this.calResult = null;
    const gp = this.firstGamepad();
    if (!gp) {
      return false;
    }
    this.syncGuess(gp);
    const axes = snapshotAxes(gp);
    this.calibration = {
      step: 'confirm',
      phase: 'hold',
      holdMs: 0,
      rest: axes.slice(),
      restGuess: null,
      min: axes.slice(),
      max: axes.slice(),
      waiting: false,
      steps: ['confirm'],
      /* So the screen can say which of the two things it is. */
      checkOnly: true,
      /* The draft is the standard layout rather than anything the pilot
       * saved, so the stick mode moves it. See setStickMode. */
      fromGuess: this.map.guess === 'standard',
      draft: cloneMap(this.map),
    };
    return true;
  }

  /*
   * Flip one channel, in the draft, on the check step. Nothing reaches the
   * saved map until Save, so a pilot can try it, watch the gimbal, and back
   * out with Escape if they were wrong about which way round it was.
   */
  reverseChannel(channel) {
    const c = this.calibration;
    if (!c || c.step !== 'confirm' || !IDENT_CHANNELS.includes(channel)) {
      return false;
    }
    if (!c.draft.reverse) {
      c.draft.reverse = cloneReverse(null);
    }
    c.draft.reverse[channel] = !c.draft.reverse[channel];
    return true;
  }

  /* Reverse whichever channel the pilot is moving, and say which it was so
   * the shell can name it. See movingChannel. */
  reverseMovingChannel() {
    const view = this.calibrationView();
    if (!view || !view.moving) {
      return null;
    }
    return this.reverseChannel(view.moving) ? view.moving : null;
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
    /* Not with the stick most of the way up. The offer is shown whenever
     * the throttle reads above idle, which includes a pilot deliberately
     * holding full throttle to check it, and exact equality with `high`
     * was the only guard: a press one step below it would have left a
     * throttle with a hair of travel and a divisor near zero. */
    if (!Number.isFinite(v) || Math.abs(spec.high - v) < CAL.THROTTLE_MIN_RANGE) {
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
    this.ownMap = this.map;
    this.mapKey = 'own';
    /* New axes to watch, so the old axes' step is not this map's, and the
     * flight flown on the old map is not a flight on this one. */
    this.forgetAxisResolution();
    this.forgetFlightRecord();
    /* A calibrated map answers the guess's questions by existing, and the
     * evidence gathered against the guess is about a map that is gone. */
    this.guessSpan = null;
    this.guessYawAlive = false;
    this.guessWrongOrder = false;
    this.guessYawParked = false;
    this.yawParkAt = null;
    this.yawParkSince = 0;
    /* The same goes for a dead channel, which was judged on the old axes,
     * and for a radio dressed as a gamepad, which the wizard has just read
     * for what it is. */
    this.forgetDeadChannels();
    this.radioAsGamepad = false;
    this.stdPark = null;
    /* Two outcomes, and the shell says which. See saveMap. */
    this.calResult = this.saveMap() ? 'saved' : 'saved-unstored';
    this.calibration = null;
    return true;
  }

  /*
   * STICK HELP, the screen a pilot is sent to when a stick does nothing.
   *
   * Its whole method is one question asked with the pilot's hand on the
   * stick: move the stick that is not working, and does ANY axis move? The
   * answer splits every cause there is into two piles.
   *
   *   An axis moves   the browser has the stick and this page is reading it
   *                   as something else, or not at all. That is a mapping,
   *                   and the wizard fixes it in a minute.
   *   Nothing moves   the stick never reached the browser. No calibration
   *                   in any page can fix that; the radio's USB joystick
   *                   setup, the operating system or the browser can, and
   *                   the shell says which for the platform it is on.
   *
   * That split is also the owner's question about the tickets, "is it their
   * radio or is it us", answered by the pilot before they file one.
   *
   * The watch starts when the screen opens and stops when it closes. Every
   * axis's rest is where it was at the first poll, and its range grows from
   * there, in poll() at the pad's own rate rather than the frame's, so a
   * quick flick is not missed between two paints.
   */
  startStickCheck() {
    this.stickCheck = { id: null, rest: null, axes: [] };
  }

  stopStickCheck() {
    this.stickCheck = null;
  }

  noteStickCheck(gp) {
    const c = this.stickCheck;
    const n = Math.min(gp.axes.length, 16);
    if (c.id !== gp.id || !c.rest || c.rest.length !== n) {
      /* A different pad, or the same one reporting a different shape, is a
       * fresh start: nothing it did before counts for this one. */
      c.id = gp.id;
      c.rest = [];
      c.axes = [];
      for (let i = 0; i < n; i += 1) {
        c.rest.push(gp.axes[i]);
        c.axes.push(newSpan(gp.axes[i]));
      }
      return;
    }
    for (let i = 0; i < n; i += 1) {
      growSpan(c.axes[i], gp.axes[i]);
    }
  }

  /*
   * What the help screen draws, every frame it is up. No opinion about what
   * any of it means, which is the shell's job and src/ui/stickhelp.js's:
   * this is the axes, which channel reads each, which have moved like a
   * stick since the screen opened, which one is moving now, and the
   * verdicts the flight and the map have already reached.
   */
  stickCheckView() {
    const gp = this.firstGamepad();
    const view = {
      pad: null,
      axisCount: 0,
      buttons: 0,
      layout: 'none',
      map: 'guess',
      guess: null,
      axes: [],
      moving: null,
      strays: [],
      moved: [],
      dead: this.deadList,
      missing: [],
      fourAxes: false,
      asGamepad: this.radioAsGamepad,
    };
    if (!gp) {
      return view;
    }
    this.syncGuess(gp);
    const m = this.map;
    const owner = new Map();
    for (const ch of IDENT_CHANNELS) {
      const spec = m[ch];
      if (spec && Number.isInteger(spec.axis)) {
        owner.set(spec.axis, ch);
      }
    }
    const c = this.stickCheck;
    const n = Math.min(gp.axes.length, 16);
    const ready = Boolean(c && c.rest && c.id === gp.id && c.rest.length === n);
    let best = 0;
    let bestAxis = -1;
    for (let i = 0; i < n; i += 1) {
      const v = gp.axes[i];
      const span = ready ? c.axes[i] : null;
      const rest = ready ? c.rest[i] : v;
      view.axes.push({
        i,
        v,
        rest,
        lo: span ? span.lo : v,
        hi: span ? span.hi : v,
        channel: owner.get(i) || null,
        mapped: owner.has(i),
        stick: Boolean(span && sweptLikeStick(span, GUESS.STRAY_SWEPT)),
      });
      const d = Math.abs(v - rest);
      if (d > best) {
        best = d;
        bestAxis = i;
      }
    }
    /* The same line the identify steps call a deliberate push. */
    if (best >= CAL.IDENT_DELTA) {
      view.moving = { axis: bestAxis, channel: owner.get(bestAxis) || null };
    }
    for (const a of view.axes) {
      if (a.stick && !a.mapped) {
        view.strays.push(a.i);
      }
    }
    for (const ch of IDENT_CHANNELS) {
      const spec = m[ch];
      const a = spec && Number.isInteger(spec.axis) ? view.axes[spec.axis] : null;
      if (a && a.stick) {
        view.moved.push(ch);
      }
    }
    view.pad = shortPadName(gp.id);
    view.axisCount = gp.axes.length;
    view.buttons = gp.buttons ? gp.buttons.length : 0;
    view.layout = gp.mapping || 'none';
    view.map = m.stored ? 'calibrated' : (m.guess === 'standard' ? 'standard' : 'guess');
    view.guess = m.stored ? null : (m.guess || 'aetr');
    view.missing = this.missingChannels(gp);
    view.fourAxes = fourAxisPad(gp);
    return view;
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
    let blocked = null;
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
      /* What a release is waiting on, named on the screen when it is not
       * the stick that was just asked for. See blockingAxis. */
      const spec = c.phase === 'release' && c.rest ? c.draft[c.step] : null;
      const on = spec ? releaseWaitsOn(c, live) : -1;
      if (on >= 0 && on !== spec.axis) {
        const owner = [...IDENT_CHANNELS, SELECT_STEP].find((ch) => c.draft[ch] && c.draft[ch].axis === on);
        blocked = { axis: on, channel: owner || null, percent: Math.round(channels.throttle * 100) };
      }
    }
    /* Only ever asked on the check step: everywhere else the gimbals are
     * showing the wizard's own preview and "which one is moving" is a
     * question the step itself is already answering. */
    const moving = c.step === 'confirm' ? movingChannel(channels) : null;
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
      /* The channel the pilot is moving, on the check step only, and the
       * offer that goes with it. See movingChannel. */
      moving,
      canReverse: Boolean(moving),
      /* Which channels this draft has turned round, so the screen can
       * show the state rather than only the control. */
      reverse: cloneReverse(c.draft && c.draft.reverse),
      /* Whether this is the wizard's last step or the check opened on its
       * own, which is the difference between Save and Cancel meaning keep
       * and discard a NEW mapping or an edit to the saved one. */
      checkOnly: Boolean(c.checkOnly),
      title: calTitle(c),
      prompt: calPrompt(c, this.stickMode),
      hint: calHint(c, travelled, need, gp, c.step === 'confirm' ? channels.throttle : 0, moving, blocked),
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
    /* What each axis could give on each side of rest, as the sweep found
     * it, for identBar. Kept apart from min and max, which go on widening
     * with every sample and so would always contain the very deflection
     * they are asked to judge. */
    c.sweepMin = c.min.slice();
    c.sweepMax = c.max.slice();
    c.step = 'throttle';
    c.phase = 'hold';
    c.holdMs = 0;
  }

  calIdentify(c, axes, dtMs) {
    const channel = c.step;
    if (c.phase === 'hold') {
      const pick = pickUnusedAxis(axes, c.rest, usedAxes(c.draft));
      const bar = pick.best < 0 ? CAL.IDENT_DELTA : identBar(c, pick.best, axes[pick.best]);
      const unique = pick.bestAbs - pick.secondAbs >= CAL.IDENT_GAP * (bar / CAL.IDENT_DELTA);
      if (pick.best < 0 || pick.bestAbs < bar || !unique) {
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
    if (releaseWaitsOn(c, axes) >= 0) {
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

  readGamepad(gp, map = this.map, fly3d = false) {
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
      /* A sprung throttle at rest is zero thrust in 3D mode too, but the
       * centre of the CHANNEL, so its whole travel is used: up is forward,
       * down past rest is reverse. Off, below rest is idle as it was. */
      throttle = fly3d && m.throttle.sprung
        ? Math.max(0, Math.min(1, 0.5 + 0.5 * t))
        : Math.max(0, Math.min(1, t));
    }
    /*
     * The pilot's own reversals, applied last, over whatever the wizard
     * recorded. See cloneReverse. A centred channel negates; the throttle
     * is already nought to one, so it subtracts from one, which keeps it
     * in range without a second clamp.
     *
     * `v !== 0` rather than a bare negation, because -0 is a real value in
     * JavaScript and poll() compares samples with !==. A reversed channel
     * sitting at rest would otherwise emit a sample every poll, for ever,
     * and call it a change.
     */
    const rev = m.reverse || {};
    const flip = (v, on) => (on && v !== 0 ? -v : v);
    return {
      roll: flip(norm(m.roll), rev.roll),
      pitch: flip(norm(m.pitch), rev.pitch),
      yaw: flip(norm(m.yaw), rev.yaw),
      throttle: rev.throttle ? 1 - throttle : throttle,
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
   *
   * HOVER IS HANDED IN, NOT WRITTEN HERE. It was 0.22 here, "a hair over
   * measured hover 0.2051", taken at 1.0 g on the plant of 15 August. The
   * shell has flown at 1.62 g since the 18th of September, where hover is
   * 35.0 percent of stick, so letting go dropped the stick thirteen points
   * under it and the quad lost a metre in half a second: bug-3a7be142, "it
   * snaps strangely, and doesn't hold position". kbHover is the measured
   * hover for the run's cap, weight and pack. See setKeyHover.
   *
   * LIFTOFF IS THE SHELL'S OWN TAKEOFF, main.js's TAKEOFF_THROTTLE. It was
   * 0.18, and that only worked because the wrong hover sat under takeoff:
   * springing to 0.22 on the pad never launched anything. A real hover sits
   * above it, so latching hover on the pad IS a launch, and only a press
   * that launched the craft may do it. A shorter tap springs back to idle.
   * Coming DOWN is noteLanded's job.
   *
   * 'hold' does none of this: see holdKeyboardCollective.
   */
  applyKeyboardCollective(dtHold, w, s, springStep) {
    /* 3D mode has no idle at the bottom to spring back to: the bottom is full
     * reverse. So the keys move a collective that stays put, from the middle,
     * where 3D's no thrust is, whichever mode the row is on. See set3d. */
    if (this.keyThrottle === 'hold' || this.mode3d) {
      this.holdKeyboardCollective(dtHold, w, s);
      return;
    }
    const HOVER = this.kbHover;
    const LIFTOFF = KEY_LIFTOFF;

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

  /*
   * THE THROTTLE THAT STAYS PUT: a key held moves it, a key let go leaves
   * it, and there is no rest to go back to. Both keys at once is neither.
   * The pad, hover and the airborne latch mean nothing here, because a
   * radio's throttle does not know whether the quad is flying either.
   */
  holdKeyboardCollective(dtHold, w, s) {
    if (w === s) {
      if (w) {
        this.kbThrFromKeys = true;
      }
      this.kbHoldMs.w = 0;
      this.kbHoldMs.s = 0;
      return;
    }
    this.kbThrFromKeys = true;
    const key = w ? 'w' : 's';
    const was = this.kbHoldMs[key];
    this.kbHoldMs[key] = was + dtHold;
    this.kbHoldMs[w ? 's' : 'w'] = 0;
    const move = latchTravel(this.kbHoldMs[key]) - latchTravel(was);
    this.kb.throttle = Math.max(0, Math.min(1, this.kb.throttle + (w ? move : -move)));
  }

  /*
   * What the throttle keys do when let go, from Settings. The collective
   * stays where it is across the change, the same promise setStickMode
   * makes. Coming back to 'hover' in the air re-arms the rest at hover, or
   * the first poll would spring a flying quad to idle: 'hold' keeps no
   * airborne latch, because it has no rest to latch.
   */
  setKeyThrottle(mode) {
    const m = normaliseKeyThrottle(mode);
    if (m === this.keyThrottle) {
      return m;
    }
    this.keyThrottle = m;
    this.kbHoldMs.w = 0;
    this.kbHoldMs.s = 0;
    if (m === 'hover') {
      this.kbAir = !this.kbLanded && this.kb.throttle >= KEY_LIFTOFF;
    }
    return m;
  }

  /*
   * Where 'hover' springs to, as stick travel from 0 to 1: main.js passes
   * hoverStickPercent for the run's throttle cap, weight and pack, on every
   * settings write, so the weight slider in flight moves it too. Anything
   * that is not a number is ignored rather than trusted.
   */
  /*
   * 3D MODE, from main.js's reset(). Three things read it, and only these:
   * the keyboard's collective, which stays put and starts from the middle
   * (applyKeyboardCollective, resetKeyboardSticks), the thumb sticks, whose
   * sticky throttle starts from the middle too, and a gamepad whose throttle
   * springs back, which flies its whole travel with no thrust at rest instead
   * of only the top half (readGamepad). A radio's throttle needs nothing: it
   * already covers the whole range, and Betaflight's 3D mode reads it there.
   * Off, every one of them is what it was.
   */
  set3d(on) {
    const next = Boolean(on);
    if (next === Boolean(this.mode3d)) {
      return next;
    }
    this.mode3d = next;
    this.kb.throttle = next ? 0.5 : 0;
    if (this.touchSource && typeof this.touchSource.setRestThrottle === 'function') {
      this.touchSource.setRestThrottle(next ? 0.5 : 0);
    }
    return next;
  }

  setKeyHover(frac) {
    const v = Number(frac);
    if (Number.isFinite(v)) {
      this.kbHover = Math.max(0, Math.min(1, v));
    }
    return this.kbHover;
  }

  /*
   * THE CRAFT HAS COME DOWN, so the collective's rest goes back to idle.
   *
   * A real hover sits above the shell's takeoff throttle, so a quad that
   * touched down and was let go would spring back to hover and lift off
   * again by itself: land on a roof, let go of S, and it leaves. The old
   * 0.22 hid that by being wrong, low enough to sit under takeoff.
   *
   * main.js calls this once a frame, AFTER that frame's landing judgement,
   * so the polls between frames already know. Only the moment it becomes
   * true is acted on, never the level, and the level would be a bug: a
   * pilot presses past takeoff on the pad and lets go, the release latches
   * hover, and the craft is still marked landed until main.js reads the
   * sample. A level test would un-latch it in that gap and spring the stick
   * to idle under a quad that had just been told to fly.
   *
   * Touching down with the throttle key held is a touch and go: the latch
   * stays, and the throttle that is up relaunches it on the next frame.
   */
  noteLanded(on) {
    const down = Boolean(on);
    if (down && !this.kbLanded && !this.keys.has(this.throttleKeys.up)) {
      this.kbAir = false;
    }
    this.kbLanded = down;
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
    this.kb.throttle = this.mode3d ? 0.5 : 0;
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
    if (this.mode3d && source && typeof source.setRestThrottle === 'function') {
      source.setRestThrottle(0.5);
    }
  }

  /* Whether a key flies the quad in the pilot's stick mode: a roll, pitch or
   * yaw key or a throttle key. Escape, R, M and the rest are not the sticks,
   * and pressing one of them does not hand the sticks to the keyboard. */
  isStickKey(code) {
    return code === this.throttleKeys.up || code === this.throttleKeys.down
      || this.keyAxes.some(([, neg, pos]) => code === neg || code === pos);
  }

  /*
   * A stick key went down on a device with thumb sticks: the keyboard takes
   * the sticks. From here poll() reads the keys exactly as it does on a
   * desktop, and isTouchPrimary() is false, so everything the shell decides
   * from it (the flight mode a key pilot is given, the ghost gimbals, the
   * turtle cue, the rate profile) is what a keyboard pilot gets anywhere. The
   * shell hides the plates on its next frame.
   *
   * THE COLLECTIVE IS CARRIED ACROSS. The thumbs' throttle is sticky, so a
   * pilot hovering on glass who reaches for a key must not find the keys'
   * own throttle, 0, under them: the level stays where it was until a
   * throttle key is pressed, and from then on it is the keyboard's, with the
   * airborne latch set if the quad is up, so W climbs from hover as it does
   * for any keyboard pilot in the air. The thumbs' springs are dropped by the
   * shell hiding the plates, and the keys' own roll, pitch and yaw start
   * from rest.
   */
  takeKeys() {
    if (!this.touchSource || this.hand === 'keys') {
      return;
    }
    this.hand = 'keys';
    this.kb.roll = 0;
    this.kb.pitch = 0;
    this.kb.yaw = 0;
    this.kb.throttle = this.channels.throttle;
    this.kbThrFromKeys = false;
    this.kbAir = !this.kbLanded && this.kb.throttle >= KEY_LIFTOFF;
  }

  /*
   * A finger landed: the thumbs take the sticks back. The plates come up on
   * the shell's next frame and the sticky throttle starts where the keys left
   * the collective, so the change of hand is not a punch. This finger is not
   * a grip, because the plates were not there to receive it; it wakes them.
   */
  takeThumbs() {
    if (!this.touchSource || this.hand === 'thumbs') {
      return;
    }
    this.hand = 'thumbs';
    if (typeof this.touchSource.setThrottle === 'function') {
      this.touchSource.setThrottle(this.channels.throttle);
    }
  }

  /*
   * THE PILOT'S STICK MODE, which reaches the keyboard, the thumb sticks and
   * an uncalibrated standard gamepad. A radio has already applied its own
   * before the browser sees an axis, and the wizard learns whatever comes
   * out of it.
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
    /*
     * A standard gamepad's guess follows the mode on the next poll, through
     * syncGuess. The check step's draft is a copy and has to be told, or M
     * there would do what bug-aeb29de7 describes: redraw the gimbals to
     * agree with the wrong sticks and leave the channels where they were.
     * The pilot's reversals ride across.
     */
    const c = this.calibration;
    if (c && c.checkOnly && c.fromGuess) {
      const draft = cloneMap(standardGuessMap(m));
      draft.reverse = cloneReverse(c.draft.reverse);
      c.draft = draft;
    }
    return m;
  }

  /*
   * Whether the thumbs are the stick source right now. Split from
   * isKeyboardPrimary because the two answer different questions: the
   * keyboard races in angle mode by default and draws its ghost gimbals,
   * while the thumb sticks are a proportional stick like a radio, fly
   * whichever flight mode the setting says, and draw themselves.
   */
  isTouchPrimary() {
    return this.firstGamepad() === null
      && this.hand !== 'keys'
      && Boolean(this.touchSource && this.touchSource.active());
  }

  /* Called once per animation frame. Emits one timestamped sample when
   * anything changed, plus a heartbeat sample every 100 ms. */
  poll(nowWall) {
    /* When the poll before this one ran: the start of the stretch in which
     * whatever this poll finds new actually happened. See prevWall on the
     * sample below. */
    const prevWall = this.lastWall;
    const dtMs = Math.min(nowWall - this.lastWall, 100);
    this.lastWall = nowWall;
    /* One poll off the flight spoils its rate window. See flightRec. */
    this.windowFlying = this.windowFlying && this.flying;

    const pads = listGamepads();
    const gp = this.pickPad(pads);
    this.syncGuess(gp);
    /*
     * THE ROSTER (hotplug, the picker's queue, a lost radio) at once when the
     * number of pads changes, and otherwise every ROSTER_MS. It builds a Set
     * and a string per pad, and it ran on every 2 ms tick, a few hundred
     * small allocations a second for a GC to clear on the machines this
     * timer is hardest on (review finding F8, 2026-09-27). A plug or an
     * unplug changes the count and is seen on the tick it happens, as
     * before; only one pad swapped for another inside a tenth of a second
     * waits for the next tenth.
     */
    if (pads.length !== this.rosterCount || nowWall - this.rosterAt >= ROSTER_MS || nowWall < this.rosterAt) {
      this.rosterAt = nowWall;
      this.rosterCount = pads.length;
      this.notePadRoster(pads);
    }
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
      if (this.windowFlying) {
        const r = this.flightRecord();
        r.padHzMax = Math.max(r.padHzMax, this.padHz);
        r.sampleHzMax = Math.max(r.sampleHzMax, this.sampleHz);
      }
      this.windowFlying = true;
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
      next = this.readGamepad(gp, this.map, Boolean(this.mode3d));
      /* The pad's own reading, before the keys below are laid over it: a
       * yaw flown on A and D is not the radio's yaw arriving. */
      if (this.flying) {
        this.noteDeadChannels(next, gp, dtMs);
      }
      this.noteThrottleParked(gp);
      this.noteGuessOrder(gp);
      this.noteButtonTravel(gp);
      this.noteYawParked(gp, nowWall);
      this.noteStandardParked(gp, nowWall);
      this.noteRestartSwitch(gp);
      this.noteAutoResetSwitch(gp);
      this.noteWeapons(gp);
      if (this.stickCheck) {
        this.noteStickCheck(gp);
      }
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
    } else if (this.hand !== 'keys' && this.touchSource && this.touchSource.active()) {
      /* The thumbs. Sample every poll, not only on events, because the
       * spring back to centre is time, not touches, and the sticky
       * throttle has to keep feeding while no finger is down at all. Not
       * while the keys have the hand: see takeKeys. */
      next = this.touchSource.sample(dtMs);
      this.source = 'the touch sticks';
    } else {
      next = this.readKeyboard(dtMs, true);
      this.source = 'the keyboard';
    }
    if (this.flying) {
      this.noteFlightTravel(next, dtMs);
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
      /*
       * `prevWall` is when the poll before this one ran, which is not
       * always 2 ms ago. The timer that polls runs on the main thread, so a
       * long frame, a garbage collection or a shader compile holds it, and
       * a stick that moved smoothly through the hold is found here in one
       * piece. main.js spreads that piece back across the hold (see
       * THE STICK THROUGH A STALL there) rather than handing the controller
       * one step.
       */
      this.queue.push({ wallT: nowWall, prevWall, ...next });
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
   *
   * `alsoEach` rides the same tick, after the sticks: main.js hangs the GPU
   * guard's fence poll here (see src/render/gpugate.js) rather than start a
   * second timer at the same rate, because every tick is a wakeup a laptop
   * pays for, and a slow laptop is who the guard is for.
   */
  startPolling(periodMs = 2, alsoEach = null) {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => {
      const now = performance.now();
      this.poll(now);
      if (alsoEach) {
        alsoEach(now);
      }
    }, periodMs);
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

  /* And the flight's record, for the same reason. See flightRec. */
  forgetFlightRecord() {
    this.flightRec = null;
    this.flightRecBefore = null;
  }

  /*
   * The record for the source flying now, started afresh when the kind of
   * source changes. 'a radio' and 'a radio whose stick order is a guess'
   * are one kind: the guess becomes usable in mid flight once its throttle
   * is seen parked, and that is the same radio in the same hands.
   */
  flightRecord() {
    const kind = this.source.startsWith('a radio') ? 'a radio' : this.source;
    if (!this.flightRec || this.flightRec.source !== kind) {
      /* The one it replaces moves aside rather than out, if it ever flew:
       * a record with no travel says nothing a report could use. */
      if (this.flightRec && this.flightRec.travel) {
        this.flightRecBefore = this.flightRec;
      }
      this.flightRec = { source: kind, ms: 0, padHzMax: 0, sampleHzMax: 0, travel: null };
    }
    return this.flightRec;
  }

  noteFlightTravel(ch, dtMs) {
    const r = this.flightRecord();
    r.ms += dtMs;
    if (!r.travel) {
      r.travel = {};
      for (const name of IDENT_CHANNELS) {
        r.travel[name] = [ch[name], ch[name]];
      }
      return;
    }
    for (const name of IDENT_CHANNELS) {
      const span = r.travel[name];
      span[0] = Math.min(span[0], ch[name]);
      span[1] = Math.max(span[1], ch[name]);
    }
  }

  /*
   * The flight's record as a report carries it, or null before the first
   * flight. Hundredths, because the question it answers is "did the
   * throttle ever reach the top", and 0.52 answers that where
   * 0.5213541666 only looks more careful.
   */
  flightReport() {
    const two = (v) => Math.round(v * 100) / 100;
    const summary = (r) => {
      if (!r || !r.travel) {
        return null;
      }
      const travel = {};
      for (const name of IDENT_CHANNELS) {
        travel[name] = r.travel[name].map(two);
      }
      return {
        source: r.source,
        seconds: Math.round(r.ms / 100) / 10,
        padHzMax: r.padHzMax,
        sampleHzMax: r.sampleHzMax,
        travel,
      };
    };
    /*
     * The source flying now, and under it the one that flew before it when
     * there was one. A report sent from the keyboard after a radio flew the
     * complaint carries both; with nothing flown now, the earlier record is
     * the report's record, as it would have been had the source not moved.
     */
    const now = summary(this.flightRec);
    const before = summary(this.flightRecBefore);
    if (!now) {
      return before;
    }
    return before ? { ...now, before } : now;
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
