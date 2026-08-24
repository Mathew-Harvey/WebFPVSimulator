/*
 * rates.js: the pilot's rate profile, and the only place it is decided.
 *
 * WHY RATES ARE NOT IN A TUNE FILE.
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
 * WHAT CHANGED, AND WHY THE LISTS WENT.
 *
 * This used to offer five knobs, each a step on a short list: Max rate from
 * a list that stopped at 1400, Centre sensitivity from a list that stopped at
 * 140, ACTUAL rates only, roll and pitch welded together. A pilot who flies
 * 1500 deg/s, or 850, or anything not on the list, could not type it, and a
 * pilot who thinks in Betaflight RC Rate and Super Rate could not enter their
 * own numbers at all. That was reported as the bug it is.
 *
 * So the shape is Betaflight Configurator's shape: a rates TYPE, and three
 * numbers per axis in the units that type displays. The ranges below are
 * Configurator 10.10's own (`changeRatesSystem` in tabs/pid_tuning.js), which
 * are narrower than the firmware's uint8 in the deg/s columns because the
 * setpoint is clamped at rate_limit, 1998 deg/s, and a column that offered
 * 2550 would be offering nothing.
 *
 * UNITS. Everything stored here is the CLI uint8 the firmware holds, not the
 * number the menu shows. Display and storage differ by a per type SCALE:
 * ACTUAL shows rc_rate 7 as 70 deg/s, BETAFLIGHT shows rc_rate 100 as 1.00,
 * and the same uint8 means both. One firmware unit is one step of the menu,
 * which is why a step is not stored: there is nothing between two uint8s.
 *
 * THE CURVES ARE NOT HERE. src/fc/ratescurve.js transcribes all five of
 * Betaflight's rate functions for drawing, and the compiled module flies its
 * own. scripts/fc-trace.js F15 sweeps the two against each other for every
 * type, which is what makes a preview worth drawing.
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

import { angleRateDeg } from '../src/fc/ratescurve.js';

/* The lookup in the firmware's RATES_TYPE table, in its own order, because
 * that is the order Configurator lists and a pilot arriving from it is
 * looking for the row they know. */
export const RATE_TYPES = ['BETAFLIGHT', 'RACEFLIGHT', 'KISS', 'ACTUAL', 'QUICK'];

export const RATE_TYPE_LABEL = {
  BETAFLIGHT: 'Betaflight',
  RACEFLIGHT: 'Raceflight',
  KISS: 'KISS',
  ACTUAL: 'Actual',
  QUICK: 'Quick',
};

export const RATE_AXES = ['roll', 'pitch', 'yaw'];

/* The three firmware fields, in the order Configurator lays its columns out.
 * srate is the one whose name is a lie in four of the five systems: it is
 * `roll_srate` in the CLI whatever the column above it is called. */
export const RATE_FIELDS = ['rcRate', 'srate', 'expo'];

/*
 * One editable column.
 *
 * cliMin and cliMax are the firmware's uint8, scale turns it into the number
 * on the screen, and decimals is how that number is written. Everything else
 * about the row, including its arrow step, falls out of those: one press is
 * one firmware unit, because there is nothing finer to move to.
 */
function field(label, cliMin, cliMax, scale, decimals, unit, note) {
  return {
    label, cliMin, cliMax, scale, decimals, unit, note,
  };
}

/*
 * The five rate systems, with Configurator 10.10's ranges and its defaults.
 *
 * The defaults are worth stating exactly, because switching type loads them
 * and a wrong one would fly. From `changeRatesSystem`: Betaflight and KISS
 * take the shared 1.00 / 0.70 / 0.00, Raceflight 370 / 80 / 50, Actual
 * 70 / 670 / 0.00 on API 1.44 and later, Quick keeps the shared RC Rate of
 * 1.00 with a 670 deg/s Max Rate.
 *
 * Actual's 70 and 670 are also Betaflight 4.5.1's own firmware defaults, from
 * pgResetFn_controlRateProfiles: rcRates 7, rates 67, rcExpo 0. A freshly
 * flashed quad flies exactly that, which is why it is where this menu starts
 * and why RATE_DEFAULTS below is the Actual profile rather than the first
 * entry in this table.
 */
const RATE_SYSTEMS = {
  BETAFLIGHT: {
    fields: {
      rcRate: field('RC rate', 1, 255, 0.01, 2, '',
        'The linear part of the curve, and the whole of it when Super rate is zero. 1.00 is 200 deg/s at full stick.'),
      srate: field('Super rate', 0, 100, 0.01, 2, '',
        'How hard the ends of the travel are stretched. Zero is a straight line; every step up adds rate at the stop without touching the middle, and the top of the range is where a small stick move near the stop is worth a great deal.'),
      expo: field('RC expo', 0, 100, 0.01, 2, '',
        'Softens the middle of the stick and leaves the ends alone. Zero is linear.'),
    },
    defaults: { rcRate: 100, srate: 70, expo: 0 },
  },
  RACEFLIGHT: {
    fields: {
      rcRate: field('Rate', 1, 200, 10, 0, 'deg/s',
        'Raceflight states the rate directly, in degrees per second, before Acro+ stretches the ends.'),
      srate: field('Acro+', 0, 255, 1, 0, '',
        'Raceflight\'s super rate. It adds to the rate in proportion to how far the stick is from centre, so the ends get faster and the middle does not.'),
      expo: field('Expo', 0, 100, 1, 0, '',
        'Softens the middle of the stick. Whole numbers here, not hundredths, which is how Raceflight writes it.'),
    },
    defaults: { rcRate: 37, srate: 80, expo: 50 },
  },
  KISS: {
    fields: {
      rcRate: field('RC rate', 1, 255, 0.01, 2, '',
        'KISS\'s linear term. The curve is Betaflight\'s with KISS\'s own scaling, so the numbers look like Betaflight\'s and do not mean quite the same thing.'),
      srate: field('Rate', 0, 99, 0.01, 2, '',
        'KISS\'s super rate, stopping at 0.99 because 1.00 divides by zero at full stick and the firmware would sit on its own clamp.'),
      expo: field('RC curve', 0, 100, 0.01, 2, '',
        'KISS calls its expo a curve. Same idea: it softens the middle and leaves the ends.'),
    },
    defaults: { rcRate: 100, srate: 70, expo: 0 },
  },
  ACTUAL: {
    fields: {
      rcRate: field('Centre sensitivity', 1, 200, 10, 0, 'deg/s',
        'How quickly the quad answers a small stick move, as the SLOPE of the curve at the middle. Low is calm for a smooth line, high is twitchy and quick. It is not the rate at half stick: read the curve. Configurator calls this column Center Sensitivity.'),
      srate: field('Max rate', 1, 200, 10, 0, 'deg/s',
        'What the quad does at full stick, exactly. This is the number Actual rates exist for: the end of the curve is the number you type, whatever expo does to the middle.'),
      expo: field('Expo', 0, 100, 0.01, 2, '',
        'How much of the travel is spent near the middle. Zero is a straight line from centre sensitivity to the stop. Higher softens the middle and keeps the same maximum, which is why the ends of the curve do not move when you change it.'),
    },
    defaults: { rcRate: 7, srate: 67, expo: 0 },
  },
  QUICK: {
    fields: {
      rcRate: field('RC rate', 1, 255, 0.01, 2, '',
        'The slope at centre, in Betaflight\'s units: 1.00 is 200 deg/s of centre sensitivity. Quick rates work out the super rate for you from this and Max rate.'),
      srate: field('Max rate', 1, 200, 10, 0, 'deg/s',
        'What the quad does at full stick. Quick rates are Betaflight rates with the super rate solved for you, so this end of the curve is exact and the middle is whatever RC rate says.'),
      expo: field('Expo', 0, 100, 0.01, 2, '',
        'Softens the middle of the stick and leaves the ends alone.'),
    },
    defaults: { rcRate: 100, srate: 67, expo: 0 },
  },
};

/*
 * Betaflight 4.5.1's own ACTUAL rate profile defaults. In this file's display
 * units that is 70 deg/s at centre, 670 deg/s at full stick, no expo. Held as
 * the CLI uint8s the firmware stores, which is what everything below moves
 * around; the menu is the only place a display number exists.
 */
export const RATE_DEFAULTS = Object.freeze({
  type: 'ACTUAL',
  roll: Object.freeze({ rcRate: 7, srate: 67, expo: 0 }),
  pitch: Object.freeze({ rcRate: 7, srate: 67, expo: 0 }),
  yaw: Object.freeze({ rcRate: 7, srate: 67, expo: 0 }),
  /* 100 is off, which is what a freshly flashed quad does. */
  throttleCap: 100,
  /* Betaflight's throttle curve, thr_mid and thr_expo, stored as the
   * firmware's uint8s exactly like the axis fields above. 50 and 0 are the
   * factory values: mid at half stick, no bend. A board report asked for
   * these by name; they were compiled and live all along, reachable by
   * nothing. */
  thrMid: 50,
  thrExpo: 0,
});

/*
 * The throttle curve fields, same shape as an axis field so the same number
 * row can edit them. The firmware stores hundredths: thr_mid 50 is
 * Configurator's 0.50, thr_expo 0 is no bend. The curve itself is
 * fc/rc.c's rcLookupThrottle over the table generateThrottleCurve builds,
 * nothing is transcribed here.
 */
export const THROTTLE_CURVE_FIELDS = Object.freeze({
  thrMid: field('Throttle mid', 0, 100, 0.01, 2, '',
    'Where the curve pivots. 0.50 is the factory middle; pilots who hover low often bring it down toward their hover stick so the expo softens the right part of the travel.'),
  thrExpo: field('Throttle expo', 0, 100, 0.01, 2, '',
    'Flattens the throttle around the mid point and steepens the ends, exactly Betaflight\'s thr_expo. 0 is the factory straight line.'),
});

/*
 * The rate profile thumb sticks start on, and only start on: it is a
 * DEFAULT, seeded for a fresh profile on a touch device and offered once
 * to a stock-rates profile the first time touch flies (src/main.js
 * adoptTouchRates). A pilot who has set their own rates is never touched,
 * and after the seed these are ordinary rates on the Rates screen, theirs
 * to change.
 *
 * WHY GENTLER AT ALL. The stock 670 with no expo is calibrated against a
 * gimbal: 40 mm of sprung travel and a wrist behind it. A thumb on glass
 * gets about a quarter of that travel and no spring centring it, so the
 * same profile puts tens of degrees per second inside one millimetre of
 * shake, which is the "way too fast" the first phone pilot reported.
 *
 * THE NUMBERS. Actual rates, 60 deg/s at centre and 450 at the stop for
 * roll and pitch: 450 is a flyable freestyle rate, quick enough to race
 * the field's corners, calm enough to hold a line with a thumb. 0.25 expo
 * spends more of the short travel near the middle without softening the
 * stop. Yaw 400, a touch under roll, because the default camera sits at
 * 20 degrees and yaw on glass is mostly small corrections.
 */
export const TOUCH_RATE_DEFAULTS = Object.freeze({
  type: 'ACTUAL',
  roll: Object.freeze({ rcRate: 6, srate: 45, expo: 25 }),
  pitch: Object.freeze({ rcRate: 6, srate: 45, expo: 25 }),
  yaw: Object.freeze({ rcRate: 6, srate: 40, expo: 25 }),
  throttleCap: 100,
  thrMid: 50,
  thrExpo: 0,
});

function rateFields(type) {
  return (RATE_SYSTEMS[type] || RATE_SYSTEMS.ACTUAL).fields;
}

export function rateField(type, key) {
  return rateFields(type)[key] || rateFields(type).rcRate;
}

/* The profile a type starts on, fresh every call so that nothing downstream
 * can write through into the table above. */
function typeDefaults(type) {
  const d = (RATE_SYSTEMS[type] || RATE_SYSTEMS.ACTUAL).defaults;
  return { rcRate: d.rcRate, srate: d.srate, expo: d.expo };
}

/* Firmware unit to the number on the screen, and back. The round is where a
 * typed 675 on an Actual max rate becomes 670: the quad holds a uint8 in tens
 * of deg/s, so 675 is not a rate it can be given, and showing it back would
 * be showing a number that is not being flown. */
function displayOf(spec, cli) {
  return cli * spec.scale;
}

export function cliOf(spec, display) {
  if (!Number.isFinite(display)) {
    return null;
  }
  const cli = Math.round(display / spec.scale);
  return Math.max(spec.cliMin, Math.min(spec.cliMax, cli));
}

export function formatRate(spec, cli) {
  return displayOf(spec, cli).toFixed(spec.decimals);
}

function clampField(spec, value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(spec.cliMin, Math.min(spec.cliMax, Math.round(n)));
}

/*
 * Clamp a stored profile onto what the firmware and the chosen type will
 * take, so a localStorage blob from an older build, a hand edit, or a dropped
 * dump cannot put an out of range number into a uint8 field.
 *
 * An unknown type takes the whole default profile rather than being clamped
 * onto one, because the three numbers under an unknown type mean nothing:
 * 670 is a fine Actual max rate and a Betaflight super rate of 670 is not a
 * number at all.
 */
export function normaliseRates(r) {
  const given = r && typeof r === 'object' ? r : {};
  const known = RATE_TYPES.includes(given.type);
  const type = known ? given.type : RATE_DEFAULTS.type;
  /* An unknown type takes the default profile's numbers as well as its name.
   * Clamping the given ones onto it would be reading a Betaflight super rate
   * of 250 as an Actual max rate and flying it. The throttle limit is not
   * part of the rates system, so it survives either way. */
  const src = known ? given : {
    throttleCap: given.throttleCap, thrMid: given.thrMid, thrExpo: given.thrExpo,
  };
  const fields = rateFields(type);
  const fallback = typeDefaults(type);
  const out = {
    type,
    throttleCap: nearest(THROTTLE_CAP_CHOICES, src.throttleCap ?? RATE_DEFAULTS.throttleCap),
    /* The throttle curve is not part of the rates system either, so it
     * survives a type change the same way the limit does. */
    thrMid: clampField(THROTTLE_CURVE_FIELDS.thrMid, src.thrMid, RATE_DEFAULTS.thrMid),
    thrExpo: clampField(THROTTLE_CURVE_FIELDS.thrExpo, src.thrExpo, RATE_DEFAULTS.thrExpo),
  };
  for (const axis of RATE_AXES) {
    const a = src[axis] && typeof src[axis] === 'object' ? src[axis] : {};
    out[axis] = {
      rcRate: clampField(fields.rcRate, a.rcRate, fallback.rcRate),
      srate: clampField(fields.srate, a.srate, fallback.srate),
      expo: clampField(fields.expo, a.expo, fallback.expo),
    };
  }
  return out;
}

/* A fresh profile on a type, keeping the throttle limit, because the throttle
 * limit is not part of the rates system and a pilot who set it did not ask
 * for it back. Same rule Configurator follows: change the system, take that
 * system's numbers, because the old ones do not carry across. */
export function profileForType(type, r) {
  const keep = normaliseRates(r);
  const d = typeDefaults(type);
  return normaliseRates({
    type,
    roll: { ...d },
    pitch: { ...d },
    yaw: { ...d },
    throttleCap: keep.throttleCap,
    thrMid: keep.thrMid,
    thrExpo: keep.thrExpo,
  });
}

/*
 * The pre v4 settings blob: five flat knobs, ACTUAL only, roll and pitch
 * welded together, in deg/s and whole expo rather than firmware units.
 *
 * Read once on the way past, so a pilot who had 900 deg/s and 20 expo still
 * has them after this change rather than being quietly put back on the
 * Betaflight default. Anything off the old lists lands where the clamp puts
 * it, which is the same place the old menu would have put it.
 */
export function ratesFromLegacy(s) {
  if (!s || typeof s !== 'object') {
    return null;
  }
  const keys = ['rateMax', 'rateYawMax', 'rateCentre', 'rateExpo'];
  if (!keys.some((k) => Number.isFinite(Number(s[k])))) {
    return null;
  }
  const centre = Number(s.rateCentre);
  const max = Number(s.rateMax);
  const yaw = Number(s.rateYawMax);
  const expo = Number(s.rateExpo);
  const axis = (srateDeg) => ({
    rcRate: Number.isFinite(centre) ? Math.round(centre / 10) : RATE_DEFAULTS.roll.rcRate,
    srate: Number.isFinite(srateDeg) ? Math.round(srateDeg / 10) : RATE_DEFAULTS.roll.srate,
    expo: Number.isFinite(expo) ? Math.round(expo) : 0,
  });
  return normaliseRates({
    type: 'ACTUAL',
    roll: axis(max),
    pitch: axis(max),
    yaw: axis(yaw),
    throttleCap: Number.isFinite(Number(s.throttleCap)) ? Number(s.throttleCap) : RATE_DEFAULTS.throttleCap,
  });
}

export function ratesAreDefault(r) {
  const a = normaliseRates(r);
  const b = normaliseRates(RATE_DEFAULTS);
  if (a.type !== b.type || a.throttleCap !== b.throttleCap
      || a.thrMid !== b.thrMid || a.thrExpo !== b.thrExpo) {
    return false;
  }
  return RATE_AXES.every((axis) => RATE_FIELDS.every((k) => a[axis][k] === b[axis][k]));
}

export function pitchMatchesRoll(r) {
  const a = normaliseRates(r);
  return RATE_FIELDS.every((k) => a.roll[k] === a.pitch[k]);
}

/*
 * The throttle cap, as a percentage of full throttle.
 *
 * WHY A RACE QUAD NEEDS ONE. This airframe is 8.4 : 1 static thrust to
 * weight, which is what a 710 g 5 inch on 6S with 1900 kV motors really is,
 * and it hovers at 26.2 percent of stick (scripts/flightcheck.js measures
 * both). So three quarters of the throttle travel is above hover, the useful
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
 * from 26.2 to 40 percent of stick and the stick is two thirds as touchy; at
 * 40 percent, hover sits past half stick, which is the classic setup.
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

/*
 * The rate profile as Betaflight CLI text, appended to whichever tune is
 * loaded. It goes through the same parser a dropped file does, so the rates
 * the pilot chose are applied by Betaflight's own rate curve code and by
 * nothing else. Appended LAST on purpose: a tune that still carried a
 * rateprofile would be overridden rather than silently winning.
 *
 * EVERY LINE EVERY TIME, including the ones that are switched off. A rate
 * profile is not reset between inits, so a key left unwritten keeps whatever
 * the last profile put there: the throttle limit would stay on SCALE after
 * being turned off, and quickrates_rc_expo would stay on after a visit to
 * Quick rates and quietly change the Betaflight curve underneath the drawing
 * on the screen.
 */
export function ratesDiff(r) {
  const p = normaliseRates(r);
  return [
    '',
    '# Rates, from the menu. See configs/rates.js.',
    'rateprofile 0',
    `set rates_type = ${p.type}`,
    `set roll_rc_rate = ${p.roll.rcRate}`,
    `set pitch_rc_rate = ${p.pitch.rcRate}`,
    `set yaw_rc_rate = ${p.yaw.rcRate}`,
    `set roll_srate = ${p.roll.srate}`,
    `set pitch_srate = ${p.pitch.srate}`,
    `set yaw_srate = ${p.yaw.srate}`,
    `set roll_expo = ${p.roll.expo}`,
    `set pitch_expo = ${p.pitch.expo}`,
    `set yaw_expo = ${p.yaw.expo}`,
    /* OFF is both the firmware default and what Configurator's own preview
     * assumes when it draws a Quick rates curve, so it is what the picture
     * beside the menu is drawn from. */
    'set quickrates_rc_expo = OFF',
    `set throttle_limit_type = ${p.throttleCap < 100 ? 'SCALE' : 'OFF'}`,
    `set throttle_limit_percent = ${p.throttleCap}`,
    `set thr_mid = ${p.thrMid}`,
    `set thr_expo = ${p.thrExpo}`,
    '',
  ].join('\n');
}

/* One axis of a profile in the shape src/fc/ratescurve.js wants. limit is
 * rate_limit, which nothing here writes, so it is the firmware default and
 * the same 1998 the module will clamp at. */
export function rateAxis(r, axis) {
  const p = normaliseRates(r);
  const a = p[axis] || p.roll;
  return {
    rcRate: a.rcRate, srate: a.srate, expo: a.expo, quickRcExpo: false,
  };
}

/* Degrees per second at a stick position, through Betaflight's own curve for
 * the chosen type. Display only: the module flies its own copy. */
function axisRateDeg(r, axis, stick) {
  const p = normaliseRates(r);
  return angleRateDeg(p.type, rateAxis(p, axis), stick);
}

export function fullStickDeg(r, axis) {
  return Math.round(axisRateDeg(r, axis, 1));
}

/*
 * One line for the menu, so the pilot can read the whole profile at a glance.
 *
 * IN DEG/S, WHATEVER THE TYPE, because that is the only thing all five
 * systems agree on: a Betaflight RC rate of 1.00 and an Actual max rate of
 * 670 cannot be compared, and what the stick does at the stop can. The
 * numbers come from the same curve the graph is drawn from.
 */
export function ratesSummary(r) {
  const p = normaliseRates(r);
  const roll = fullStickDeg(p, 'roll');
  const pitch = fullStickDeg(p, 'pitch');
  const yaw = fullStickDeg(p, 'yaw');
  const label = RATE_TYPE_LABEL[p.type];
  const body = pitch === roll
    ? `${roll} roll and pitch, ${yaw} yaw`
    : `${roll} roll, ${pitch} pitch, ${yaw} yaw`;
  const cap = p.throttleCap < 100 ? `, throttle capped at ${p.throttleCap}` : '';
  return `${label}, ${body} deg/s${cap}`;
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
  [100, 26.2], [90, 28.6], [80, 31.6], [70, 35.4], [60, 40.4], [50, 47.4], [40, 58.0],
]);

export function hoverStickPercent(cap) {
  return HOVER_STICK_PERCENT.get(nearest(THROTTLE_CAP_CHOICES, cap)) ?? 26.2;
}
