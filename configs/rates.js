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
 * That preset is no longer shipped at all, and the rule outlived it. It is
 * still why no file in configs/ may carry a rateprofile, and scripts/fc-trace.js
 * F7 and F8 now read every file in that directory rather than the one that
 * misbehaved, so the claim cannot be deleted by deleting a file.
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
 * flashed quad flies exactly that, which is why RATE_DEFAULTS below is an
 * Actual profile rather than the first entry in this table. It is no longer
 * exactly that profile: see there.
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
 * The rate profile a pilot starts on: Actual rates, 60 deg/s at centre, 600
 * deg/s at full stick, no expo, on every axis. Held as the CLI uint8s the
 * firmware stores, which is what everything below moves around; the menu is
 * the only place a display number exists.
 *
 * A LITTLE UNDER BETAFLIGHT'S OWN, on the owner's word (2026-10-09: "Overall
 * its twitchy, so im gonna suggest we start with lowering the default rates
 * just a little"). These were Betaflight 4.5.1's firmware defaults, 70 and
 * 670, until then. Twitchy and stiff were a third of every flight feel
 * verdict the board had read, and 670 with no expo is a profile for 40 mm of
 * sprung gimbal and a wrist. One step down on both columns, the same shape:
 * still Actual, still linear, so a pilot who knows Betaflight reads it at a
 * glance. That takes 10 to 14 percent off at every stick position (a quarter
 * stick is 49 deg/s instead of 55, half stick 165 instead of 185, the stop
 * 600 instead of 670). The ACTUAL entry in RATE_SYSTEMS above keeps
 * Configurator's 70 and 670, because that table is what switching type
 * loads in Configurator and is quoted from it.
 *
 * Nothing about this is in the flight loop. It is the same eleven numbers
 * ratesDiff always writes into the CLI, read by the same Betaflight rate
 * function in the module, so the path from stick to motor is the same length
 * at any value. A pilot who set their own rates keeps them; a profile still
 * holding the old stock exactly is moved once, by SUPERSEDED_RATES below.
 */
export const RATE_DEFAULTS = Object.freeze({
  type: 'ACTUAL',
  roll: Object.freeze({ rcRate: 6, srate: 60, expo: 0 }),
  pitch: Object.freeze({ rcRate: 6, srate: 60, expo: 0 }),
  yaw: Object.freeze({ rcRate: 6, srate: 60, expo: 0 }),
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
 * THE STOCK AXES THAT HAVE BEEN SUPERSEDED, and the generation a profile
 * carries once it has been moved off them. Every axis exactly 70 / 670 / no
 * expo on Actual is a profile that never chose its rates: it is what the
 * shell stored for every pilot who did not open the Rates screen. Such a
 * profile is moved to RATE_DEFAULTS once (loadSettings in src/ui/ui.js,
 * marked by stockRates), so the softer default reaches the pilots it was
 * meant for and not only newcomers. Any other profile, including one a
 * pilot typed back to 70 and 670 after the move, is theirs and is left.
 * The throttle limit and curve are not part of this and never move.
 */
export const SUPERSEDED_RATES = Object.freeze({
  GENERATION: 1,
  type: 'ACTUAL',
  axis: Object.freeze({ rcRate: 7, srate: 67, expo: 0 }),
});

export function ratesAreSupersededStock(r) {
  const a = normaliseRates(r);
  const old = SUPERSEDED_RATES.axis;
  return a.type === SUPERSEDED_RATES.type
    && RATE_AXES.every((axis) => RATE_FIELDS.every((k) => a[axis][k] === old[k]));
}

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
  /* A known type fills a missing field from that type's Configurator
   * default, which is what switching type loads. An unknown one is the
   * shipped profile whole, RATE_DEFAULTS, which is not Configurator's. */
  const fallbackFor = (axis) => (known ? typeDefaults(type) : RATE_DEFAULTS[axis]);
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
    const fallback = fallbackFor(axis);
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
/*
 * 75 and 65 are both on this list because an airframe has seated each of
 * them, and the rule everywhere else in this project is that a seeded value
 * has to be one the pilot could have chosen themselves. A 23 g whoop on a 1S
 * pack has four and a half to one of thrust to weight and holds a hover at
 * under a third of the stick, so full travel is two thirds of a stick nobody
 * uses and a handful of one they do. 65 was the first answer to that, the
 * owner flew it to 75, and then flew it back to 65 with the stock tune
 * when the whoop was reported hard to fly: hover at 49 percent of stick, the
 * middle, with 9.5 m/s of climb still at the top. Both stay on the list
 * because a pilot who liked either has to be able to get back to it.
 * Betaflight takes any integer here; the list is this menu's granularity,
 * and two extra stops are cheaper than a seeded value the menu cannot show.
 */
export const THROTTLE_CAP_CHOICES = [100, 90, 80, 75, 70, 65, 60, 50, 40];

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
 * The same reading, short enough for a menu row's value column: the type,
 * then full stick deg/s as roll/pitch/yaw, the way a pilot writes a rate
 * profile down. ratesSummary's sentence ran past the column on Quad, on
 * Settings and on pause and ended "Actual, 670 roll and pitc...". The
 * throttle cap, when there is one, rides at the end. The sentence stays for
 * the bug report, the feel report and the preset list, which have the room.
 */
export function ratesShort(r) {
  const p = normaliseRates(r);
  const nums = RATE_AXES.map((axis) => fullStickDeg(p, axis)).join('/');
  const cap = p.throttleCap < 100 ? `, cap ${p.throttleCap}%` : '';
  return `${RATE_TYPE_LABEL[p.type]} ${nums}${cap}`;
}

/*
 * The throttle curve in full, for a bug report rather than for the menu.
 *
 * ratesSummary above says nothing about the throttle when the cap is 100 and
 * nothing about thrMid or thrExpo ever, which is right for a one line menu
 * row and was wrong everywhere else: a feel report saying "throttle is
 * touchy" arrived carrying a rates string that could not say whether the
 * pilot had a cap on, and the cap is the whole answer to that complaint. The
 * report now states all three, including the defaults, because "cap 100" is
 * the fact worth having and an omitted field is not a fact at all.
 *
 * Hover comes along because the number a pilot feels is where hover sits on
 * their stick, not what percentage is in the config, and it is measured per
 * airframe. See HOVER_STICK_PERCENT.
 *
 * AT THE PILOT'S OWN WEIGHT AND PACK, which the report passes. This took the
 * airframe alone, so it quoted the shipped machine on a fresh pack whatever
 * the pilot flew: "Underpowered Whoop", 2026-09-28, was a whoop at Weight 70
 * and read "hover near 39.9 percent", which is Weight 100's figure, beside a
 * weight of 70 and a keyboard hover of 32.3 in the same report. A hover that
 * makes the quad sound heavier than it was flown points the reader at the
 * wrong answer. Left out, both are the shipped machine's, as the menu quotes.
 * Motor power is the same: it moves hover, so the report passes the pilot's
 * (a percent, 100 when the tuning mode is off) and the line agrees with the
 * keyboard's.
 */
export function throttleSummary(r, airframe = '5inch', weight = 100, cellV = 4.2, motorKv = 100) {
  const p = normaliseRates(r);
  const hover = hoverStickPercent(p.throttleCap, airframe, weight, cellV, motorKv);
  const curve = p.thrExpo > 0 ? `, mid ${p.thrMid} expo ${p.thrExpo}` : ', no expo';
  return `cap ${p.throttleCap}${curve}, hover near ${hover.toFixed(1)} percent of stick`;
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
/*
 * ONE COLUMN PER AIRCRAFT, because hover does not land in the same place on
 * the stick on both. A 23 g whoop hovers at 32.3 percent of travel uncapped
 * where a 710 g five inch hovers at 26.5, and the gap widens under a cap:
 * the sag and the motor loading that make this a measurement rather than an
 * algebraic hover-over-cap are different on a 1S 280 mAh pack and a 6S one.
 *
 * Re-recorded in full on 2026-09-06 with `node scripts/flightcheck.js` and
 * `node scripts/flightcheck.js --airframe=whoop65`. The five inch column
 * moved by 0.2 to 0.6 of a point from the figures stored before that, which
 * is the plant drifting under it since the table was first taken; nothing
 * reads these but the menu, and a table half of one vintage and half of
 * another is worse than one taken in a single run.
 *
 * The 75 row was taken in the same way when 75 joined the list. Both columns
 * were re-read on the build that added the descent rotor drag, and neither
 * moved: that term is exactly zero at and above a hover, and a hover is the
 * only thing this table measures.
 */
/*
 * READ AT THE WEIGHT THE SHELL FLIES, NOT THE HARNESS'S. The module's own
 * gravity is 1.0 and every check in tests/ runs there; the shell asserts
 * configs/airframes.js gravityBase, 1.62 on the five inch and 2.025 on the
 * whoop, through sim_set_gravity before a pilot ever touches the stick, and
 * a menu that quoted the 1.0 hover to a pilot flying at 1.62 would be eight
 * and a half points low at every cap.
 * So:
 *
 *     node scripts/flightcheck.js --gravity=1.62
 *
 * which is the same bisection with the same flag the shell uses. The 1.0
 * table it replaced read 26.5, 28.9, 31.8, 33.6, 35.6, 38.0, 40.8, 47.9,
 * 58.6, for anyone reading an old report against a new one.
 *
 * THE WHOOP HAS ITS OWN TABLE AGAIN, on the same plant. Both entries have
 * a simId of 0, so the whoop flies the five inch plant, and for a while that
 * meant one table for both. Then the whoop's gravityBase moved to 2.025, the
 * five inch's 125, and a plant flown at a different gravity hovers at a
 * different stick: HOVER_WHOOP below is the same five inch plant read at
 * the whoop's own weights, with --gravity and no --airframe. The whoop
 * column before that one, 33.6 at cap 100, had been read off
 * SIM_AIRFRAME_WHOOP65 with --airframe=whoop65, a plant the shell does not
 * select. If a whoop plant is ever selected again it gets its own table
 * read at its own gravityBase.
 */
const HOVER_5IN_AT_BASE = new Map([
  [100, 35.0], [90, 38.3], [80, 42.5], [75, 44.9], [70, 47.8],
  [65, 51.1], [60, 54.9], [50, 64.9], [40, 79.8],
]);

/*
 * AND AT THE PILOT'S WEIGHT AND PACK, because since bug-3a7be142 something
 * flies on this number rather than printing it: the keyboard's throttle
 * keys spring back to hover when they are let go, and a spring to the wrong
 * number is a quad that falls out of the sky every time a key comes up.
 *
 * It did. The keyboard sprang to 0.22, "a hair over measured hover 0.2051",
 * a figure taken at 1.0 g on the plant of 15 August. At the shipped weight
 * hover is 35.0, so letting go of W dropped the stick thirteen points under
 * it and the quad lost a metre in half a second and three in under one.
 *
 * Hover moves with three things a pilot sets, so it is read at all three:
 *
 *   the throttle cap, the rows, which is the table above;
 *   the Weight slider, the columns: 60, 100 and 140 are its ends and its
 *     middle, flown at gravityScaleFor's 0.972, 1.62 and 2.268;
 *   the pack charge a run starts on, the blocks: 4.2, 3.8 and 3.5 per
 *     cell, which are PACK_VOLTAGES and the only charges a run can start at.
 *
 * Nothing else moves it. The pack does not run down in flight: four minutes
 * at hover read 25.05 V under load from the first second to the last, so the
 * charge a run STARTS on is the charge it hovers on throughout.
 *
 * Between two weight columns the answer is interpolated, which is 0.2 of a
 * point at worst uncapped and 0.5 at a cap of 40, measured against all
 * seventeen stops of the slider. Near hover this plant climbs or sinks
 * about 0.9 m/s per point of stick, so half a point is a drift a pilot
 * corrects with a tap, where thirteen was a fall.
 *
 * 100 means full stick is not enough: a 140 weight on a tired pack at a cap
 * of 40 cannot hover at all, and the bisection says so by hitting the stop.
 *
 * Taken 2026-09-24 with the same bisection as scripts/flightcheck.js, on the
 * same config, at each of the nine pairs:
 *
 *     node scripts/flightcheck.js --gravity=0.972 --cell=4.2
 *
 * and so on for 1.62 and 2.268, and 3.8 and 3.5. The weight 100 column at
 * 4.2 reproduced HOVER_5IN_AT_BASE above to the tenth at every cap.
 *
 * The columns are per airframe because the slider's top is: the five inch
 * reads 60, 100 and 140, the whoop 60, 100 and 120, since the module
 * refuses the whoop's 125 and above.
 */
const HOVER_CELLS = [4.2, 3.8, 3.5];
const HOVER_5IN = new Map([
  [4.2, [
    new Map([
      [100, 26.0], [90, 28.4], [80, 31.4], [75, 33.1], [70, 35.1],
      [65, 37.3], [60, 40.1], [50, 47.0], [40, 57.6],
    ]),
    HOVER_5IN_AT_BASE,
    new Map([
      [100, 42.8], [90, 46.9], [80, 52.2], [75, 55.3], [70, 58.8],
      [65, 63.0], [60, 67.8], [50, 80.4], [40, 99.2],
    ]),
  ]],
  [3.8, [
    new Map([
      [100, 28.9], [90, 31.6], [80, 34.8], [75, 36.8], [70, 39.1],
      [65, 41.7], [60, 44.8], [50, 52.6], [40, 64.5],
    ]),
    new Map([
      [100, 38.8], [90, 42.5], [80, 47.2], [75, 50.0], [70, 53.2],
      [65, 56.9], [60, 61.2], [50, 72.5], [40, 89.3],
    ]),
    new Map([
      [100, 47.4], [90, 52.1], [80, 58.0], [75, 61.5], [70, 65.5],
      [65, 70.1], [60, 75.5], [50, 89.7], [40, 100],
    ]),
  ]],
  [3.5, [
    new Map([
      [100, 31.5], [90, 34.3], [80, 38.0], [75, 40.2], [70, 42.7],
      [65, 45.6], [60, 48.9], [50, 57.8], [40, 70.9],
    ]),
    new Map([
      [100, 42.2], [90, 46.3], [80, 51.5], [75, 54.5], [70, 58.1],
      [65, 62.1], [60, 66.9], [50, 79.3], [40, 97.9],
    ]),
    new Map([
      [100, 51.6], [90, 56.7], [80, 63.2], [75, 67.1], [70, 71.5],
      [65, 76.7], [60, 82.6], [50, 98.1], [40, 100],
    ]),
  ]],
]);
/*
 * THE WHOOP, at its own base of 2.025 and its own slider: weight 60, 100 and
 * 120 are 1.215, 2.025 and 2.43 times g. Taken 2026-09-24 the same way as
 * the five inch's above, nine runs of
 *
 *     node scripts/flightcheck.js --gravity=2.025 --cell=4.2
 *
 * and so on, five inch plant and baseline config, because that is what the
 * whoop flies. Weight 80 on the whoop is 1.62, the five inch's normal, and
 * its column interpolates to 34.8 against the 35.0 measured there. Weight
 * 110 interpolates to within 0.1 of the 42.3 measured, uncapped, and is two
 * points low at a cap of 40, where the 120 column has hit the stop.
 */
const HOVER_WHOOP = new Map([
  [4.2, [
    new Map([
      [100, 29.7], [90, 32.3], [80, 35.7], [75, 37.8], [70, 40.1],
      [65, 42.9], [60, 46.0], [50, 54.2], [40, 66.4],
    ]),
    new Map([
      [100, 39.9], [90, 43.8], [80, 48.7], [75, 51.5], [70, 54.8],
      [65, 58.7], [60, 63.2], [50, 74.8], [40, 92.2],
    ]),
    new Map([
      [100, 44.6], [90, 48.9], [80, 54.4], [75, 57.7], [70, 61.5],
      [65, 65.8], [60, 70.9], [50, 84.0], [40, 100],
    ]),
  ]],
  [3.8, [
    new Map([
      [100, 32.8], [90, 35.9], [80, 39.7], [75, 42.0], [70, 44.7],
      [65, 47.7], [60, 51.3], [50, 60.5], [40, 74.4],
    ]),
    new Map([
      [100, 44.3], [90, 48.7], [80, 54.1], [75, 57.3], [70, 61.0],
      [65, 65.4], [60, 70.4], [50, 83.4], [40, 100],
    ]),
    new Map([
      [100, 49.4], [90, 54.4], [80, 60.5], [75, 64.1], [70, 68.4],
      [65, 73.3], [60, 79.0], [50, 93.7], [40, 100],
    ]),
  ]],
  [3.5, [
    new Map([
      [100, 35.7], [90, 39.1], [80, 43.3], [75, 45.9], [70, 48.8],
      [65, 52.2], [60, 56.1], [50, 66.3], [40, 81.6],
    ]),
    new Map([
      [100, 48.2], [90, 52.9], [80, 58.9], [75, 62.5], [70, 66.6],
      [65, 71.4], [60, 76.9], [50, 91.3], [40, 100],
    ]),
    new Map([
      [100, 53.8], [90, 59.2], [80, 66.0], [75, 70.0], [70, 74.7],
      [65, 80.1], [60, 86.3], [50, 100], [40, 100],
    ]),
  ]],
]);
/*
 * AND AT THE PILOT'S MOTOR POWER, because the Motor power slider moves hover
 * too. A motor wound for a higher kV turns the same prop at the same speed on
 * less duty (sim_set_motor_kv; src/native/sim_internal.h has the model), so
 * hover sits lower on the stick, and the keyboard's throttle springs back to
 * it: without this axis every Motor power setting but 100 would make letting
 * go of W a climb or a fall.
 *
 * The four tables below are the stock ones read again at the two ends of the
 * slider, 80 and 120, one pair per airframe, with the same bisection and the
 * same flags plus --kv:
 *
 *     node scripts/flightcheck.js --gravity=0.972 --cell=4.2 --kv=0.8
 *
 * and so on at each of the nine gravity and charge pairs, at 0.8 and at 1.2.
 * The whoop's are read at its own gravities with no --airframe, because it
 * flies the five inch plant, as the note above HOVER_5IN_AT_BASE says.
 *
 * Between a stop and 100 the answer is interpolated in 1 / kV and not in kV.
 * Hover is a duty, and duty goes as 1 / kV (the rotor needs the same speed
 * and torque, and the back EMF per unit speed is 1 / kV of what it was), so
 * the stick, which is affine in duty, is linear in 1 / kV. Measured against
 * flightcheck at 85, 90, 110 and 115, on all 18 airframe, weight and charge
 * columns at nine caps each (648 values): wherever hover is below 80 percent
 * of the stick, 543 of them, the mean error is 0.04 of a point and the worst
 * 0.15, where interpolating in kV itself is 0.5 on average and 1.15 at worst.
 * It grows only where the quad is nearly out of stick, because a table entry
 * is clipped at full stick and the interpolation cannot see past the clip:
 * 0.9 of a point worst between 80 and 90 percent, and 1 to 6 points under the
 * true figure past 90, which is a cap of 40 or 50 on a low kV, a tired pack
 * or a heavy quad, with next to no travel left above hover to climb with.
 */
const HOVER_5IN_KV80 = new Map([
  [4.2, [
    new Map([
      [100, 32.7], [90, 35.7], [80, 39.6], [75, 41.9], [70, 44.6],
      [65, 47.6], [60, 51.1], [50, 60.3], [40, 74.1],
    ]),
    new Map([
      [100, 43.8], [90, 48.2], [80, 53.5], [75, 56.7], [70, 60.4],
      [65, 64.7], [60, 69.6], [50, 82.6], [40, 100],
    ]),
    new Map([
      [100, 53.5], [90, 58.9], [80, 65.7], [75, 69.6], [70, 74.3],
      [65, 79.6], [60, 85.8], [50, 100], [40, 100],
    ]),
  ]],
  [3.8, [
    new Map([
      [100, 36.2], [90, 39.6], [80, 44.0], [75, 46.6], [70, 49.5],
      [65, 52.9], [60, 56.9], [50, 67.3], [40, 82.9],
    ]),
    new Map([
      [100, 48.6], [90, 53.4], [80, 59.5], [75, 63.1], [70, 67.2],
      [65, 72.0], [60, 77.5], [50, 92.1], [40, 100],
    ]),
    new Map([
      [100, 59.3], [90, 65.4], [80, 72.9], [75, 77.4], [70, 82.6],
      [65, 88.6], [60, 95.5], [50, 100], [40, 100],
    ]),
  ]],
  [3.5, [
    new Map([
      [100, 39.3], [90, 43.1], [80, 48.0], [75, 50.8], [70, 54.1],
      [65, 57.9], [60, 62.2], [50, 73.6], [40, 90.8],
    ]),
    new Map([
      [100, 52.8], [90, 58.2], [80, 64.8], [75, 68.8], [70, 73.4],
      [65, 78.6], [60, 84.7], [50, 100], [40, 100],
    ]),
    new Map([
      [100, 64.6], [90, 71.3], [80, 79.5], [75, 84.5], [70, 90.1],
      [65, 96.6], [60, 100], [50, 100], [40, 100],
    ]),
  ]],
]);
const HOVER_5IN_KV120 = new Map([
  [4.2, [
    new Map([
      [100, 21.7], [90, 23.5], [80, 25.8], [75, 27.2], [70, 28.8],
      [65, 30.6], [60, 32.7], [50, 38.2], [40, 46.5],
    ]),
    new Map([
      [100, 29.1], [90, 31.7], [80, 35.1], [75, 37.1], [70, 39.3],
      [65, 42.0], [60, 45.0], [50, 53.1], [40, 65.1],
    ]),
    new Map([
      [100, 35.5], [90, 39.0], [80, 43.1], [75, 45.7], [70, 48.6],
      [65, 51.9], [60, 55.9], [50, 65.9], [40, 81.2],
    ]),
  ]],
  [3.8, [
    new Map([
      [100, 24.0], [90, 26.1], [80, 28.7], [75, 30.3], [70, 32.1],
      [65, 34.2], [60, 36.6], [50, 42.9], [40, 52.4],
    ]),
    new Map([
      [100, 32.2], [90, 35.3], [80, 39.1], [75, 41.3], [70, 43.9],
      [65, 46.8], [60, 50.4], [50, 59.4], [40, 73.0],
    ]),
    new Map([
      [100, 39.4], [90, 43.2], [80, 48.0], [75, 50.8], [70, 54.2],
      [65, 57.9], [60, 62.3], [50, 73.7], [40, 90.9],
    ]),
  ]],
  [3.5, [
    new Map([
      [100, 26.1], [90, 28.4], [80, 31.4], [75, 33.1], [70, 35.1],
      [65, 37.4], [60, 40.1], [50, 47.1], [40, 57.6],
    ]),
    new Map([
      [100, 35.1], [90, 38.4], [80, 42.6], [75, 45.0], [70, 48.0],
      [65, 51.2], [60, 55.1], [50, 65.1], [40, 80.1],
    ]),
    new Map([
      [100, 43.0], [90, 47.1], [80, 52.4], [75, 55.5], [70, 59.1],
      [65, 63.3], [60, 68.1], [50, 80.8], [40, 99.7],
    ]),
  ]],
]);
const HOVER_WHOOP_KV80 = new Map([
  [4.2, [
    new Map([
      [100, 37.2], [90, 40.7], [80, 45.1], [75, 47.8], [70, 50.8],
      [65, 54.4], [60, 58.5], [50, 69.2], [40, 85.2],
    ]),
    new Map([
      [100, 50.0], [90, 55.0], [80, 61.3], [75, 65.0], [70, 69.3],
      [65, 74.2], [60, 80.0], [50, 94.9], [40, 100],
    ]),
    new Map([
      [100, 55.8], [90, 61.4], [80, 68.5], [75, 72.7], [70, 77.5],
      [65, 83.1], [60, 89.6], [50, 100], [40, 100],
    ]),
  ]],
  [3.8, [
    new Map([
      [100, 41.1], [90, 45.1], [80, 50.2], [75, 53.1], [70, 56.5],
      [65, 60.5], [60, 65.2], [50, 77.2], [40, 95.2],
    ]),
    new Map([
      [100, 55.4], [90, 61.0], [80, 68.0], [75, 72.2], [70, 77.0],
      [65, 82.6], [60, 89.0], [50, 100], [40, 100],
    ]),
    new Map([
      [100, 61.9], [90, 68.2], [80, 76.1], [75, 80.8], [70, 86.2],
      [65, 92.4], [60, 99.8], [50, 100], [40, 100],
    ]),
  ]],
  [3.5, [
    new Map([
      [100, 44.8], [90, 49.1], [80, 54.6], [75, 58.0], [70, 61.7],
      [65, 66.0], [60, 71.2], [50, 84.4], [40, 100],
    ]),
    new Map([
      [100, 60.3], [90, 66.5], [80, 74.1], [75, 78.8], [70, 84.0],
      [65, 90.1], [60, 97.2], [50, 100], [40, 100],
    ]),
    new Map([
      [100, 67.4], [90, 74.3], [80, 82.9], [75, 88.2], [70, 94.1],
      [65, 100], [60, 100], [50, 100], [40, 100],
    ]),
  ]],
]);
const HOVER_WHOOP_KV120 = new Map([
  [4.2, [
    new Map([
      [100, 24.6], [90, 26.8], [80, 29.5], [75, 31.1], [70, 33.0],
      [65, 35.2], [60, 37.6], [50, 44.1], [40, 53.9],
    ]),
    new Map([
      [100, 33.2], [90, 36.3], [80, 40.2], [75, 42.6], [70, 45.2],
      [65, 48.4], [60, 52.0], [50, 61.3], [40, 75.3],
    ]),
    new Map([
      [100, 37.1], [90, 40.6], [80, 45.0], [75, 47.7], [70, 50.7],
      [65, 54.3], [60, 58.3], [50, 69.0], [40, 84.9],
    ]),
  ]],
  [3.8, [
    new Map([
      [100, 27.3], [90, 29.7], [80, 32.8], [75, 34.7], [70, 36.8],
      [65, 39.2], [60, 42.1], [50, 49.4], [40, 60.5],
    ]),
    new Map([
      [100, 36.8], [90, 40.3], [80, 44.8], [75, 47.4], [70, 50.4],
      [65, 53.9], [60, 58.0], [50, 68.5], [40, 84.4],
    ]),
    new Map([
      [100, 41.1], [90, 45.1], [80, 50.1], [75, 53.1], [70, 56.5],
      [65, 60.5], [60, 65.1], [50, 77.2], [40, 95.1],
    ]),
  ]],
  [3.5, [
    new Map([
      [100, 29.7], [90, 32.4], [80, 35.8], [75, 37.8], [70, 40.2],
      [65, 42.9], [60, 46.1], [50, 54.3], [40, 66.5],
    ]),
    new Map([
      [100, 40.1], [90, 44.0], [80, 48.8], [75, 51.7], [70, 55.1],
      [65, 58.9], [60, 63.4], [50, 75.1], [40, 92.5],
    ]),
    new Map([
      [100, 44.8], [90, 49.2], [80, 54.7], [75, 58.0], [70, 61.8],
      [65, 66.1], [60, 71.3], [50, 84.5], [40, 100],
    ]),
  ]],
]);
const HOVER_STICK_PERCENT = {
  '5inch': {
    weights: [60, 100, 140],
    cells: HOVER_5IN,
    kv: { 80: HOVER_5IN_KV80, 120: HOVER_5IN_KV120 },
  },
  whoop65: {
    weights: [60, 100, 120],
    cells: HOVER_WHOOP,
    kv: { 80: HOVER_WHOOP_KV80, 120: HOVER_WHOOP_KV120 },
  },
};

/* One table's answer for this cap, weight and charge: the weight columns
 * interpolated, the pack block picked by the nearest charge. */
function hoverAt(table, cells, cap, weight, cellV) {
  const cols = cells.get(nearest(HOVER_CELLS, Number(cellV) || 4.2));
  const c = nearest(THROTTLE_CAP_CHOICES, cap);
  const at = (i) => cols[i].get(c) ?? cols[i].get(100);
  const [light, mid, heavy] = table.weights;
  const w = Math.min(heavy, Math.max(light, Number(weight) || mid));
  /* Out from the middle column, so the stock weight returns the table's own
   * figure exactly rather than a sum that rounds to it. */
  const edge = w < mid ? 0 : 2;
  const u = (w - mid) / ((edge === 0 ? light : heavy) - mid);
  return u === 0 ? at(1) : at(1) + (at(edge) - at(1)) * u;
}

/*
 * Where hover sits on the stick, as a percentage of travel, for this cap on
 * this aircraft. The airframe is optional and defaults to the five inch,
 * which is what every caller meant when there was one aircraft.
 *
 * Weight, the pack's starting charge per cell and Motor power are optional
 * too, and default to the shipped machine on a fresh pack, which is what the
 * menu quotes. The keyboard passes the run's own, because it flies on the
 * answer. Motor power is a percent, 80 to 120, and 100 returns the table's own
 * figure exactly as it always did: that branch is taken before any of the new
 * arithmetic, so a pilot who never touches the slider reads the numbers that
 * were measured before it existed.
 */
export function hoverStickPercent(cap, airframe = '5inch', weight = 100, cellV = 4.2, motorKv = 100) {
  const table = HOVER_STICK_PERCENT[airframe] ?? HOVER_STICK_PERCENT['5inch'];
  const stock = hoverAt(table, table.cells, cap, weight, cellV);
  const kv = Math.min(120, Math.max(80, Number(motorKv) || 100));
  if (kv === 100) {
    return stock;
  }
  const stop = kv < 100 ? 80 : 120;
  const far = hoverAt(table, table.kv[stop], cap, weight, cellV);
  if (kv === stop) {
    return far;
  }
  /* Linear in 1 / kV between 100 and the stop: see the note above the tables. */
  return stock + (far - stock) * ((100 / kv - 1) / (100 / stop - 1));
}
