/*
 * tune.js: flight feel tuning, the part of it with no page in it.
 *
 * WHAT IT IS. Flight feel tuning is a mode, off by default, that puts two
 * more sliders beside the Weight slider while the quad is on the ground:
 *
 *   Air grip     how much the air holds the quad back, so how far it carries
 *                with the sticks centred. It drives sim_set_air, the scale on
 *                the body drag, the rotor H force and the ducted descent brake.
 *   Motor power  the motors' KV, how much speed they make for a volt. It
 *                drives sim_set_motor_kv, a scale on the winding: back EMF
 *                constant divided by it, resistance divided by its square.
 *
 * At the end of a flight flown off stock a pilot is asked whether the quad
 * felt better than the one that ships. If it did they may send the numbers
 * with their words to the board, as a ticket of kind "tune", so that what
 * pilots actually prefer can be read off the board over time by airframe and
 * by physics version. Nothing is sent without a yes.
 *
 * WHY A FILE OF ITS OWN. ui.js is seventeen thousand lines and needs a page,
 * main.js needs the module, and the numbers and words that cross to the
 * board need neither. They are also the part that has to agree with
 * WebFPVSimulator-LeaderBoard's src/validate.js to the digit: a pilot whose
 * tune is refused with a sentence about a slider has been failed by a
 * constant that moved on one side. So this file holds them once, has no DOM
 * and no module, and scripts/tune-selftest.js reads it in Node. The contract
 * is written out in full in the board's README, under Tunes.
 *
 * THE STOCK RULE, which is the whole safety of this feature. Tuning off is
 * the aircraft's default, whatever the stored sliders say (effectiveTune),
 * so a pilot who never turns the mode on, or turns it on and touches
 * nothing, flies the quad that ships. Since 2026-10-21 that default is not
 * 100 on every slider: it is what pilots sent (TUNE_DEFAULTS below).
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { fullStickDeg, normaliseRates, ratesSummary } from '../../configs/rates.js';

/*
 * THE BANDS. A percentage of the machine as it ships, in steps of five, and
 * the board holds the same four numbers for each (the Tunes section of its
 * src/validate.js). Widen one here and it widens there first.
 *
 * Air grip is 50 to 150 because sim_set_air accepts 0.5 to 2.0 and refuses
 * anything outside it, and a symmetric band round 100 is the one a pilot
 * reads without a manual. Motor power is 80 to 120 because the winding scale
 * is a power law: at 120 the motors make 44 percent more power from the same
 * pack, which is already a different quad, and the module refuses anything
 * outside 0.8 to 1.2 (sim_set_motor_kv).
 *
 * WHAT THE AIR GRIP BAND DOES, measured off dist/sim.wasm by
 * scripts/tune-measure.js (npm run feel:measure) at the machine the shell
 * flies: the hands off carry is the run from 20 m/s to half of it with the
 * sticks centred at hover throttle in angle mode, and flat out is the fastest
 * level speed. Hover does not move at all, which is why the slider is safe to
 * leave on a pilot's memorised throttle.
 *
 *                        50       100      150
 *   five inch carry      54.8 m   26.9 m   18.0 m   (20 m/s to 10 m/s)
 *   five inch flat out   221      152      113 km/h
 *   whoop carry          18.8 m   9.4 m    6.4 m    (12 m/s to 6 m/s)
 *   whoop flat out       115      81       61 km/h
 *
 * So the two ends are the quad carrying twice as far and two thirds as far,
 * which is a difference a pilot feels in one corner, and not the "hardly
 * discernable" one the first air slider was reported as: that was asked about
 * vertically, and the vertical axis is gravity's, not the air's.
 */
export const AIR_GRIP_MIN = 50;
export const AIR_GRIP_MAX = 150;
export const AIR_GRIP_STEP = 5;
export const AIR_GRIP_STOCK = 100;
export const MOTOR_KV_MIN = 80;
export const MOTOR_KV_MAX = 120;
export const MOTOR_KV_STEP = 5;
export const MOTOR_KV_STOCK = 100;

/* The weight's own stock, repeated here so this file does not import the
 * page: ui.js asserts they are the same number. */
export const WEIGHT_STOCK_PCT = 100;

/*
 * HOW LONG A TUNE HAS TO BE FLOWN before a pilot is asked about it, as sim
 * milliseconds of airtime. Thirty seconds is long enough to have turned,
 * climbed and dropped on the setting, short enough that a pilot who tried a
 * slider, liked it and landed is still asked.
 */
export const TUNE_MIN_AIR_MS = 30000;

function snap(v, min, max, step, stock) {
  /* Number(null) and Number('') are 0, which would clamp to the far end of
   * the band: a corrupt or hand edited blob lands on stock, not on 50. */
  const raw = v === null || v === '' || typeof v === 'boolean' ? NaN : Number(v);
  const n = Math.round(raw / step) * step;
  if (!Number.isFinite(n)) {
    return stock;
  }
  return Math.min(max, Math.max(min, n));
}

export function clampAirGrip(v) {
  return snap(v, AIR_GRIP_MIN, AIR_GRIP_MAX, AIR_GRIP_STEP, AIR_GRIP_STOCK);
}

export function clampMotorKv(v) {
  return snap(v, MOTOR_KV_MIN, MOTOR_KV_MAX, MOTOR_KV_STEP, MOTOR_KV_STOCK);
}

/*
 * The multiple the module is asked for, from a slider value. Rounded to three
 * places so one setting is always one double, the reason gravityScaleFor
 * gives, and written as an integer over a thousand so that 100 is exactly 1:
 * sim_set_air(1) and sim_set_motor_kv(1) are the values the module starts
 * with, which is what keeps stock bit identical.
 */
export function airScaleFor(pct) {
  return Math.round(clampAirGrip(pct) * 10) / 1000;
}

export function kvScaleFor(pct) {
  return Math.round(clampMotorKv(pct) * 10) / 1000;
}

/*
 * THE DEFAULTS, PER AIRCRAFT, FROM WHAT PILOTS SENT. The owner, 2026-10-21:
 * "review all the tunes and adjust the preset in game to the average or
 * better tune for each type of quad feel ... make the default match what
 * people are saying". Read off every tune ticket on the board that morning,
 * one ticket per pilot, the longest flown of the ones they called better
 * than stock. PROGRESS.md has the tables; the short of it:
 *
 *   five inch, 37 pilots   Air grip: 25 went up, 8 stayed, 4 went down.
 *                          Median 105, mean 114, so 110. Motor power and
 *                          Weight split evenly round 100 and stay.
 *   whoop, 11 pilots       Motor power: 7 went down, 3 stayed, 1 went up,
 *                          median 85, mean 92, so 90, and the whoop's feel
 *                          reports agree (twitchy and "throttle is touchy"
 *                          lead them). Air grip and Weight split and stay.
 *
 * These are slider values, on the same scale as the sliders and the tickets,
 * so 100 still means the module's own 1.0 and every ticket ever sent reads
 * the same way. What moved is which value a pilot flies when they have not
 * chosen one: tuning off flies these, the sliders start on them, the stock
 * notch and the Tuned tag are measured from them, and the "better than
 * stock?" question compares against them. An aircraft not listed, or no
 * aircraft at all, gets 100 and 100.
 */
export const TUNE_DEFAULTS = Object.freeze({
  '5inch': Object.freeze({ airGrip: 110, motorKv: 100 }),
  whoop65: Object.freeze({ airGrip: 100, motorKv: 90 }),
});

const NEUTRAL = Object.freeze({ airGrip: AIR_GRIP_STOCK, motorKv: MOTOR_KV_STOCK });

export function tuneDefaultsFor(airframe) {
  return Object.hasOwn(TUNE_DEFAULTS, airframe) ? TUNE_DEFAULTS[airframe] : NEUTRAL;
}

/*
 * The defaults before 2026-10-21, which every profile held: 100 and 100 on
 * both aircraft. A profile still on them exactly never chose them, so it
 * moves once to the new defaults (src/ui/ui.js, stockTune), the way the
 * rates moved in SUPERSEDED_RATES. A pilot who sets 100 back keeps it.
 */
export const SUPERSEDED_TUNE = Object.freeze({ GENERATION: 1, airGrip: 100, motorKv: 100 });

/*
 * What the module is flown at, from the stored settings. Tuning off is the
 * aircraft's default whatever is stored, so a pilot's tune is kept for the
 * next time they turn the mode on and never flies by accident.
 */
export function effectiveTune(s) {
  const on = Boolean(s && s.feelTuning);
  const d = tuneDefaultsFor(s && s.airframe);
  return {
    airGrip: on ? clampAirGrip(s.airGrip) : d.airGrip,
    motorKv: on ? clampMotorKv(s.motorKv) : d.motorKv,
  };
}

/* The two new sliders are off the aircraft's default: the lap is tagged
 * Tuned (Weight keeps the rule it has always had, a lap goes up with its
 * weight beside the name). */
export function offBoardTune(airGrip, motorKv, airframe) {
  const d = tuneDefaultsFor(airframe);
  return airGrip !== d.airGrip || motorKv !== d.motorKv;
}

/* All three on the default, which is when a pilot is not worth asking. */
export function tuneIsStock(t) {
  const d = tuneDefaultsFor(t.airframe);
  return t.weight === WEIGHT_STOCK_PCT && t.airGrip === d.airGrip && t.motorKv === d.motorKv;
}

/* One flight's combination, as a key. */
export function tuneKey(airframe, weight, airGrip, motorKv) {
  return `${airframe}:${weight}:${airGrip}:${motorKv}`;
}

/*
 * THE AIRTIME EACH COMBINATION WAS FLOWN FOR, this flight. A pilot may move a
 * slider mid flight, and a question about "the tune" has to name one, so the
 * log keeps every combination with its airtime and the question is asked about
 * the one that was flown longest. Fed once a frame from the physics branch
 * with the steps that frame took; a Map lookup and an add, no allocation once
 * the combination is known.
 */
export class TuneLog {
  constructor() {
    this.ms = new Map();
    this.meta = new Map();
  }

  clear() {
    this.ms.clear();
    this.meta.clear();
  }

  add(key, meta, ms) {
    const had = this.ms.get(key);
    if (had === undefined) {
      this.meta.set(key, meta);
      this.ms.set(key, ms);
    } else {
      this.ms.set(key, had + ms);
    }
  }

  /* The combination with the most airtime, or null if nothing was logged. */
  dominant() {
    let best = null;
    for (const [key, ms] of this.ms) {
      if (best === null || ms > best.ms) {
        best = { key, ms, ...this.meta.get(key) };
      }
    }
    return best;
  }
}

/* The words a verdict can be, in the order the form offers them. The ids are
 * the board's closed list. */
export const TUNE_VERDICTS = [
  { id: 'much_better', label: 'Much better' },
  { id: 'better', label: 'Better' },
  { id: 'same', label: 'About the same' },
  { id: 'worse', label: 'Worse' },
];
export const TUNE_VERDICT_IDS = TUNE_VERDICTS.map((v) => v.id);

/* The feel words, shared with the flight feel form so a tune's word and a
 * feedback ticket's word are the same five. Also the board's closed list. */
export const FEEL_WORDS = [
  { id: 'floppy', label: 'Floppy' },
  { id: 'soft', label: 'Soft' },
  { id: 'right', label: 'About right' },
  { id: 'stiff', label: 'Stiff' },
  { id: 'twitchy', label: 'Twitchy' },
];

export const TUNE_INPUTS = ['keyboard', 'pad', 'touch', 'unknown'];

const VERDICT_SENTENCE = {
  much_better: 'much better than stock',
  better: 'better than stock',
  same: 'about the same as stock',
  worse: 'worse than stock',
};

/*
 * WHAT THE PILOT FLEW WITH, from the stick path's own words (src/input/input.js
 * writes `source`). 'pad' covers radios and gamepads together because the
 * browser cannot tell them apart, and says so on the board. Anything the
 * harness or a future source says that is not recognised is 'unknown', never
 * a guess.
 */
export function inputKindFromSource(source) {
  const src = String(source || '').toLowerCase();
  if (src.includes('touch')) {
    return 'touch';
  }
  if (src.includes('keyboard')) {
    return 'keyboard';
  }
  if (src.includes('radio') || src.includes('joystick') || src.includes('calibration') || src.includes('gamepad')) {
    return 'pad';
  }
  return 'unknown';
}

/* "45 seconds", "3 minutes": how long a tune was flown, for a sentence. */
export function airtimeWords(seconds) {
  const n = Math.max(0, Math.round(Number(seconds) || 0));
  if (n < 90) {
    return `${n} second${n === 1 ? '' : 's'}`;
  }
  const m = Math.round(n / 60);
  return `${m} minutes`;
}

/*
 * WHETHER THE END OF A FLIGHT ASKS, as one pure decision so the reasons can be
 * read and tested without a page. Returns '' to ask, or the reason it does
 * not. The order is the order a pilot would argue it: the mode is on, they
 * have not turned the question off, the flight was long enough on one
 * combination, this combination has not already been asked about this session,
 * and the pilot is not on a radio (a dialog cannot be answered with sticks,
 * which is why Results carries a row for them instead).
 */
export function tuneAskReason({
  flight, tuning, ask, asked, pad,
}) {
  if (!tuning) {
    return 'mode off';
  }
  if (!ask) {
    return 'opted out';
  }
  if (!flight || !(flight.airtimeS * 1000 >= TUNE_MIN_AIR_MS)) {
    return 'too short';
  }
  if (asked && asked.has(flight.key)) {
    return 'already asked';
  }
  if (pad) {
    return 'radio';
  }
  return '';
}

/*
 * THE SLIDERS A MODULE CAN ANSWER, which main.js reads off the loaded module
 * as {air, kv} (a module without the export would take a slider and ignore
 * it). Every sentence a pilot reads that names the sliders goes through
 * these, so a build with one of them says one and not two: a pilot is never
 * told about a control they cannot see. No caps means both, which is what
 * the ticket always carries, since the board's numbers do not depend on the
 * build that flew them (a slider the module lacks is simply 100).
 */
const BOTH = { air: true, kv: true };

export function tuneSliderNames(caps) {
  const c = caps || BOTH;
  return [c.air ? 'Air grip' : null, c.kv ? 'Motor power' : null].filter(Boolean);
}

/* "Air grip and Motor power", "Air grip", or "" when neither is there. */
export function tuneSliderWords(caps) {
  return tuneSliderNames(caps).join(' and ');
}

/* The same, each with what it does, for the one sentence that introduces
 * them: "Air grip (how far the quad carries) and Motor power (how hard the
 * motors pull)". */
export function tuneSliderBlurbs(caps) {
  const c = caps || BOTH;
  return [
    c.air ? 'Air grip (how far the quad carries)' : null,
    c.kv ? 'Motor power (how hard the motors pull)' : null,
  ].filter(Boolean).join(' and ');
}

/* The card that explains the sliders once, on the first flight with the mode
 * on. Words, so it lives here; ui.js hangs it above the block. */
export function tuneCardText(caps) {
  const c = caps || BOTH;
  const parts = [c.air && c.kv ? 'Two more sliders while you are down.' : 'One more slider while you are down.'];
  if (c.air) {
    parts.push('Air grip: left and the quad carries, right and the air holds it.');
  }
  if (c.kv) {
    parts.push('Motor power: left is softer, right is punchier.');
  }
  parts.push('Each starts where the quad ships. After a flight that felt better than stock you can send your numbers. Nothing is sent unless you say so.');
  return parts.join(' ');
}

/* "Weight 120%, Air grip 85%, Motor power 110%", for a dialog and a ticket.
 * With `caps`, a slider the module cannot answer is left out of the words. */
export function tuneValuesLine(t, caps) {
  const c = caps || BOTH;
  const parts = [`Weight ${t.weight}%`];
  if (c.air) {
    parts.push(`Air grip ${t.airGrip}%`);
  }
  if (c.kv) {
    parts.push(`Motor power ${t.motorKv}%`);
  }
  return parts.join(', ');
}

export function tuneTitle(t, airframeShort) {
  const verdict = (TUNE_VERDICTS.find((v) => v.id === t.verdict) || TUNE_VERDICTS[1]).label.toLowerCase();
  return `Tune: ${verdict}, ${airframeShort}, grip ${t.airGrip}, motor ${t.motorKv}, weight ${t.weight}`.slice(0, 120);
}

/*
 * The profile that travels with a tune, as numbers the board can group on
 * later and one sentence a person can read. The same curve the Rates screen
 * draws, in deg/s at full stick, because it is the one figure all five rate
 * systems agree on.
 */
export function ratesForTune(rates) {
  const p = normaliseRates(rates || {});
  return {
    summary: String(ratesSummary(p)).slice(0, 160),
    type: String(p.type).slice(0, 24),
    rollDeg: fullStickDeg(p, 'roll'),
    pitchDeg: fullStickDeg(p, 'pitch'),
    yawDeg: fullStickDeg(p, 'yaw'),
    throttleCap: p.throttleCap,
  };
}

function tuneIdOf(raw) {
  const id = String(raw || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 40);
  return id || 'unknown';
}

/*
 * THE TICKET. Kind "tune", exactly the shape the board's inspectBugCreate
 * takes (board-contract, the Tunes section of the board's README): the typed
 * `tune` object is what the board aggregates, `context` is the feel report's
 * snapshot, unchanged, and the airframe and the physics version ride beside
 * it. The version is added by submitBug, from main.js, so every kind carries
 * it the same way.
 */
export function buildTunePayload({
  verdict, feel, words, reporter, airframe, airframeShort,
  weight, airGrip, motorKv, gravityScale, airtimeS, flightMode,
  tuneId, input, rates, context,
}) {
  const t = {
    verdict,
    weight,
    airGrip,
    motorKv,
    gravityScale: Math.round(gravityScale * 1000) / 1000,
    airScale: airScaleFor(airGrip),
    kvScale: kvScaleFor(motorKv),
    feel: feel || null,
    airtimeS: Math.max(0, Math.min(36000, Math.round(airtimeS))),
    flightMode: flightMode === 'angle' ? 'angle' : 'acro',
    tuneId: tuneIdOf(tuneId),
    input: TUNE_INPUTS.includes(input) ? input : 'unknown',
    rates: ratesForTune(rates),
  };
  const lines = [
    `A flight feel tune, ${VERDICT_SENTENCE[verdict] || VERDICT_SENTENCE.better}.`,
    `${tuneValuesLine(t)}, flown for ${t.airtimeS} seconds in the air on the ${airframeShort}, ${t.flightMode === 'angle' ? 'Angle' : 'Acro'}.`,
    /* Which stock it was compared with, because stock moved on 2026-10-21
     * (TUNE_DEFAULTS) and a verdict means nothing without its baseline. */
    `Compared with the default of ${tuneValuesLine({ weight: WEIGHT_STOCK_PCT, ...tuneDefaultsFor(airframe) })}.`,
  ];
  if (t.feel) {
    const word = (FEEL_WORDS.find((f) => f.id === t.feel) || { label: t.feel }).label.toLowerCase();
    lines.push(`The quad felt ${word}.`);
  }
  const said = String(words || '').trim();
  if (said) {
    lines.push(said);
  }
  return {
    kind: 'tune',
    title: tuneTitle(t, airframeShort),
    what: lines.join('\n'),
    reporter: reporter || '',
    airframe,
    tune: t,
    context,
  };
}
