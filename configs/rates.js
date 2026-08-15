/*
 * rates.js: the pilot's rates, and the only place they are decided.
 *
 * WHY RATES ARE NOT IN A TUNE FILE ANY MORE.
 *
 * They were, and it made the tunes impossible to compare. The Karate race
 * preset shipped with sugarK's own racing rates, 420 deg/s and 54 expo
 * against the Betaflight default's 670 and none, so switching to it changed
 * the tune AND halved the stick authority in one keypress. The owner flew it
 * and reported the obvious: the default felt better and Karate did not, which
 * is what happens when you change two things and only mean to change one.
 *
 * A tune is P, I, D, feedforward and filtering. Rates are how far the sticks
 * go. They are separate settings on a real radio, they belong to the pilot
 * rather than to the tune, and they are separate here: no file in configs/
 * carries a rateprofile, and this module owns the rate profile for every
 * tune including a diff the pilot drops on the page.
 *
 * ACTUAL rates only, because it is the Betaflight curve whose ends mean what
 * they say. From fc/rc.c applyActualRates:
 *
 *     centreSensitivity = rc_rate * 10
 *     stickMovement     = max(0, srate * 10 - centreSensitivity)
 *     angleRate         = stick * centreSensitivity + stickMovement * expof
 *
 * At full stick expof is 1, so the rate is exactly srate * 10: MAX RATE IS
 * WHAT IT SAYS. Centre sensitivity is NOT the rate at half stick, which is
 * what an earlier version of this comment and of the menu note both claimed.
 * It is the SLOPE of the curve at centre, the coefficient on the linear term,
 * so near the middle the rate is about stick times it and further out the
 * expo term takes over. With the Betaflight defaults, 70 and 670 and no
 * expo, the real curve is 13 deg/s at a tenth of stick, 55 at a quarter,
 * 185 at half, 390 at three quarters and 670 at the stop.
 *
 * Betaflight stores rc_rate and srate in TENS of deg/s in a uint8, so every
 * value offered here is a multiple of 10 and at most 2550, and expo is
 * hundredths in a uint8. Nothing here is a slider with invented units.
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
 * Betaflight 4.5.1's own ACTUAL rate profile defaults, from
 * pgResetFn_controlRateProfiles in fc/controlrate_profile.c: rcRates 7,
 * rates 67, rcExpo 0. In this file's units that is 70 deg/s at centre,
 * 670 deg/s at full stick, no expo. A freshly flashed quad flies exactly
 * this, which is why it is where the menu starts.
 */
export const RATE_DEFAULTS = {
  rateMax: 670,
  rateYawMax: 670,
  rateCentre: 70,
  rateExpo: 0,
  /* 100 is off, which is what a freshly flashed quad does. */
  throttleCap: 100,
};

/* Offered values. Multiples of 10 because the firmware field is tens of
 * deg/s; 670 is in both lists because it is the default and has to be
 * reachable. */
export const RATE_MAX_CHOICES = [400, 420, 500, 600, 670, 700, 800, 900, 1000, 1100, 1200, 1400];
export const RATE_CENTRE_CHOICES = [30, 40, 50, 60, 70, 80, 100, 120, 140];
export const RATE_EXPO_CHOICES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70];

/*
 * The throttle cap, as a percentage of full throttle.
 *
 * WHY A RACE QUAD NEEDS ONE. This airframe is 9.2 : 1 static thrust to
 * weight, which is what a 650 g 5 inch on 6S with 1900 kV motors really is,
 * and it hovers at 19.5 percent of stick (scripts/flightcheck.js measures
 * both). So four fifths of the throttle travel is above hover, the useful
 * band around it is a couple of percent of stick, and ten percent of stick
 * takes you from holding altitude to climbing at 9 m/s. That is not a bug in
 * the model, it is what the aircraft is, and it is exactly why the throttle
 * limit exists in Betaflight and why racers use it.
 *
 * SCALE, NOT CLIP, and the difference is the whole point. Betaflight offers
 * both in flight/mixer.c applyThrottleLimit:
 *
 *   CLIP    output = min(stick, cap).   Stick above the cap does nothing.
 *           The travel is thrown away and the resolution below is unchanged.
 *   SCALE   output = stick * cap.       Full stick travel is redistributed
 *           across nothing-to-cap, so every millimetre of stick is worth
 *           `cap` as much throttle and the resolution improves by 1/cap.
 *
 * SCALE is the one that gives resolution back. At 60 percent, hover moves
 * from 19.5 to 32 percent of stick and the stick is two thirds as touchy; at
 * 40 percent, hover sits at half stick, which is the classic setup.
 *
 * The cap is NOT reimplemented here. These two lines go into the rate profile
 * and Betaflight's own mixer does the work, per CLAUDE.md: if a Betaflight
 * behaviour is missing, compile more of Betaflight rather than approximate
 * it. It was already compiled; nothing had ever switched it on.
 */
export const THROTTLE_CAP_CHOICES = [100, 90, 80, 70, 60, 50, 40];

function nearest(choices, value) {
  let best = choices[0];
  for (const c of choices) {
    if (Math.abs(c - value) < Math.abs(best - value)) {
      best = c;
    }
  }
  return best;
}

/* Clamp a stored setting onto the offered list, so a localStorage value from
 * an older build cannot put an out of range number into a uint8 field. */
export function normaliseRates(s) {
  return {
    rateMax: nearest(RATE_MAX_CHOICES, s.rateMax ?? RATE_DEFAULTS.rateMax),
    rateYawMax: nearest(RATE_MAX_CHOICES, s.rateYawMax ?? RATE_DEFAULTS.rateYawMax),
    rateCentre: nearest(RATE_CENTRE_CHOICES, s.rateCentre ?? RATE_DEFAULTS.rateCentre),
    rateExpo: nearest(RATE_EXPO_CHOICES, s.rateExpo ?? RATE_DEFAULTS.rateExpo),
    throttleCap: nearest(THROTTLE_CAP_CHOICES, s.throttleCap ?? RATE_DEFAULTS.throttleCap),
  };
}

/*
 * The rate profile as Betaflight CLI text, appended to whichever tune is
 * loaded. It goes through the same parser a dropped file does, so the rates
 * the pilot chose are applied by Betaflight's own rate curve code and by
 * nothing else. Appended LAST on purpose: a tune that still carried a
 * rateprofile would be overridden rather than silently winning.
 */
export function ratesDiff(s) {
  const r = normaliseRates(s);
  return [
    '',
    '# Rates, from the menu. See configs/rates.js.',
    'rateprofile 0',
    'set rates_type = ACTUAL',
    `set roll_rc_rate = ${r.rateCentre / 10}`,
    `set pitch_rc_rate = ${r.rateCentre / 10}`,
    `set yaw_rc_rate = ${r.rateCentre / 10}`,
    `set roll_srate = ${r.rateMax / 10}`,
    `set pitch_srate = ${r.rateMax / 10}`,
    `set yaw_srate = ${r.rateYawMax / 10}`,
    `set roll_expo = ${r.rateExpo}`,
    `set pitch_expo = ${r.rateExpo}`,
    `set yaw_expo = ${r.rateExpo}`,
    /* Both lines always, so turning the cap off writes OFF rather than
     * leaving the previous SCALE in a rate profile that is not reset between
     * inits. */
    `set throttle_limit_type = ${r.throttleCap < 100 ? 'SCALE' : 'OFF'}`,
    `set throttle_limit_percent = ${r.throttleCap}`,
    '',
  ].join('\n');
}

/* One line for the menu, so the pilot can read the whole curve at a glance. */
export function ratesSummary(s) {
  const r = normaliseRates(s);
  const cap = r.throttleCap < 100 ? `, throttle capped at ${r.throttleCap}` : '';
  return `${r.rateCentre} centre, ${r.rateMax} max, ${r.rateExpo / 100} expo${cap}`;
}

/*
 * Where hover lands on the stick at each cap, as a percentage of travel.
 *
 * MEASURED, NOT DERIVED, and the difference is the reason this is a table
 * rather than a formula. The obvious formula is hover divided by the cap,
 * because SCALE multiplies the mixer's throttle by it. That overstates every
 * value, by six percentage points at a cap of 40, because thrust is not
 * linear in the throttle command: the pack sags and the motors load up, so
 * halving the command does not halve the thrust and the stick does not have
 * to come up as far as the algebra says.
 *
 * These are read off the compiled module by scripts/flightcheck.js, which
 * bisects for the throttle that holds altitude at each cap. Re-run it if the
 * plant changes. It is in the menu because "60 percent" means nothing to a
 * pilot and "hover near a third of the stick" means everything.
 */
const HOVER_STICK_PERCENT = new Map([
  [100, 19.5], [90, 21.1], [80, 23.1], [70, 25.8], [60, 29.2], [50, 33.9], [40, 41.1],
]);

export function hoverStickPercent(cap) {
  return HOVER_STICK_PERCENT.get(nearest(THROTTLE_CAP_CHOICES, cap)) ?? 19.5;
}
