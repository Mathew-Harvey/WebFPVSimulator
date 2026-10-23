/*
 * tune-selftest.js: flight feel tuning's numbers and words, in Node, with no
 * page and no module: the bands and what they snap to, the multiples the
 * module is handed (and that 100 is exactly the 1.0 it already holds), the
 * stock rule, the log the end of flight question reads, when that question
 * asks, and the ticket it sends.
 *
 * It also checks the ticket against the board. When a checkout of
 * WebFPVSimulator-LeaderBoard sits beside this one (or BOARD_DIR names it),
 * every ticket built here is put through the board's own inspectBugCreate,
 * which is the only honest test that the two sides agree on a band: a tune
 * the board refuses is a pilot told off about a slider. With no checkout it
 * says `skip` and does not pretend.
 *
 * Usage:
 *   npm run tune:selftest
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

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  tuneCardText,
  tuneSliderBlurbs,
  tuneSliderNames,
  tuneSliderWords,
  AIR_GRIP_MAX,
  AIR_GRIP_MIN,
  AIR_GRIP_STEP,
  AIR_GRIP_STOCK,
  FEEL_WORDS,
  MOTOR_KV_MAX,
  MOTOR_KV_MIN,
  MOTOR_KV_STEP,
  MOTOR_KV_STOCK,
  TUNE_MIN_AIR_MS,
  TUNE_VERDICT_IDS,
  TuneLog,
  airScaleFor,
  airtimeWords,
  buildTunePayload,
  clampAirGrip,
  clampMotorKv,
  effectiveTune,
  inputKindFromSource,
  kvScaleFor,
  offBoardTune,
  ratesForTune,
  tuneAskReason,
  tuneIsStock,
  tuneDefaultsFor,
  TUNE_DEFAULTS,
  SUPERSEDED_TUNE,
  tuneKey,
  tuneTitle,
  tuneValuesLine,
} from '../src/share/tune.js';
import { airframeById } from '../configs/airframes.js';
import { RATE_DEFAULTS } from '../configs/rates.js';
import { Race } from '../src/game/race.js';

/* configs/airframes.js gravityBase times the weight, to three places: what
 * gravityScaleFor in src/ui/ui.js says, without importing a page. */
function gravityScaleFor(weight, airframeId) {
  return Math.round(airframeById(airframeId).gravityBase * (weight / 100) * 1000) / 1000;
}

const rows = [];
let failed = 0;

function check(name, ok, detail = '') {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

function skip(name, detail) {
  rows.push([name, 'skip', detail]);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------------------------------ */
/* The bands                                                           */
/* ------------------------------------------------------------------ */

check('air grip band is 50 to 175 in fives, stock 100',
  AIR_GRIP_MIN === 50 && AIR_GRIP_MAX === 175 && AIR_GRIP_STEP === 5 && AIR_GRIP_STOCK === 100);
check('motor power band is 80 to 120 in fives, stock 100',
  MOTOR_KV_MIN === 80 && MOTOR_KV_MAX === 120 && MOTOR_KV_STEP === 5 && MOTOR_KV_STOCK === 100);

check('clamp snaps to the step and holds the ends',
  clampAirGrip(47) === 50 && clampAirGrip(52) === 50 && clampAirGrip(53) === 55 && clampAirGrip(999) === 175
  && clampMotorKv(79) === 80 && clampMotorKv(103) === 105 && clampMotorKv(-5) === 80,
  'air 47,52,53,999 and kv 79,103,-5');
check('clamp turns anything that is not a number into stock, a null included',
  clampAirGrip(NaN) === 100 && clampAirGrip(undefined) === 100 && clampAirGrip('x') === 100
  && clampAirGrip(null) === 100 && clampMotorKv(null) === 100 && clampMotorKv('') === 100
  && clampMotorKv(true) === 100 && clampMotorKv({}) === 100,
  'NaN, undefined, x, null, empty, true, {}');
check('clamp is idempotent over the whole band', (() => {
  for (let v = AIR_GRIP_MIN; v <= AIR_GRIP_MAX; v += AIR_GRIP_STEP) {
    if (clampAirGrip(v) !== v) {
      return false;
    }
  }
  for (let v = MOTOR_KV_MIN; v <= MOTOR_KV_MAX; v += MOTOR_KV_STEP) {
    if (clampMotorKv(v) !== v) {
      return false;
    }
  }
  return true;
})());

/* ------------------------------------------------------------------ */
/* The multiples the module is handed                                  */
/* ------------------------------------------------------------------ */

check('100 is exactly the 1.0 the module already holds (stock is bit identical)',
  airScaleFor(100) === 1 && kvScaleFor(100) === 1 && Object.is(airScaleFor(100), 1) && Object.is(kvScaleFor(100), 1),
  `${airScaleFor(100)}, ${kvScaleFor(100)}`);
check('one setting is one double: scale is the percentage over a hundred, to three places', (() => {
  for (let v = AIR_GRIP_MIN; v <= AIR_GRIP_MAX; v += AIR_GRIP_STEP) {
    if (airScaleFor(v) !== v / 100 || Math.round(airScaleFor(v) * 100) !== v) {
      return false;
    }
  }
  for (let v = MOTOR_KV_MIN; v <= MOTOR_KV_MAX; v += MOTOR_KV_STEP) {
    if (kvScaleFor(v) !== v / 100 || Math.round(kvScaleFor(v) * 100) !== v) {
      return false;
    }
  }
  return true;
})());
check('the record key suffix round trips (.a85 is 0.85, .k110 is 1.1)',
  Math.round(airScaleFor(85) * 100) === 85 && Math.round(kvScaleFor(110) * 100) === 110);
check('every scale is inside what the module accepts',
  airScaleFor(AIR_GRIP_MIN) >= 0.5 && airScaleFor(AIR_GRIP_MAX) <= 2.0
  && kvScaleFor(MOTOR_KV_MIN) >= 0.8 && kvScaleFor(MOTOR_KV_MAX) <= 1.2,
  `air ${airScaleFor(AIR_GRIP_MIN)}..${airScaleFor(AIR_GRIP_MAX)}, kv ${kvScaleFor(MOTOR_KV_MIN)}..${kvScaleFor(MOTOR_KV_MAX)}`);

/* ------------------------------------------------------------------ */
/* The stock rule                                                      */
/* ------------------------------------------------------------------ */

check('mode off is stock, whatever the sliders say',
  same(effectiveTune({ feelTuning: false, airGrip: 70, motorKv: 115 }), { airGrip: 100, motorKv: 100 }));
check('mode off is stock when the settings have never heard of the mode',
  same(effectiveTune({}), { airGrip: 100, motorKv: 100 }) && same(effectiveTune(null), { airGrip: 100, motorKv: 100 }));
check('mode on and nothing touched is stock',
  same(effectiveTune({ feelTuning: true, airGrip: 100, motorKv: 100 }), { airGrip: 100, motorKv: 100 }));
check('mode on flies the sliders, clamped',
  same(effectiveTune({ feelTuning: true, airGrip: 85, motorKv: 130 }), { airGrip: 85, motorKv: 120 }));
check('the stock combination is the one that stays on the board',
  !offBoardTune(100, 100) && offBoardTune(95, 100) && offBoardTune(100, 105) && offBoardTune(60, 120));
check('weight alone does not keep a flight off the board (it is labelled there)',
  !offBoardTune(AIR_GRIP_STOCK, MOTOR_KV_STOCK));
check('tuneIsStock reads all three',
  tuneIsStock({ weight: 100, airGrip: 100, motorKv: 100 })
  && !tuneIsStock({ weight: 105, airGrip: 100, motorKv: 100 })
  && !tuneIsStock({ weight: 100, airGrip: 95, motorKv: 100 })
  && !tuneIsStock({ weight: 100, airGrip: 100, motorKv: 95 }));

/* ------------------------------------------------------------------ */
/* The defaults pilots set (2026-10-21)                                */
/* ------------------------------------------------------------------ */

check('the defaults are on the sliders\' own steps and inside their bands',
  Object.values(TUNE_DEFAULTS).every((d) => clampAirGrip(d.airGrip) === d.airGrip && clampMotorKv(d.motorKv) === d.motorKv),
  JSON.stringify(TUNE_DEFAULTS));
check('the five inch ships on Air grip 110, and the whoop on the same since it flies the five inch\'s plant',
  same(tuneDefaultsFor('5inch'), { airGrip: 110, motorKv: 100 }) && same(tuneDefaultsFor('whoop65'), { airGrip: 110, motorKv: 100 }));
check('an aircraft nobody listed, or none, is 100 and 100',
  same(tuneDefaultsFor('nope'), { airGrip: 100, motorKv: 100 }) && same(tuneDefaultsFor(undefined), { airGrip: 100, motorKv: 100 })
  && same(tuneDefaultsFor('__proto__'), { airGrip: 100, motorKv: 100 }));
check('mode off flies the aircraft\'s default, whatever the sliders say',
  same(effectiveTune({ airframe: '5inch', feelTuning: false, airGrip: 70, motorKv: 115 }), { airGrip: 110, motorKv: 100 })
  && same(effectiveTune({ airframe: 'whoop65', feelTuning: false, airGrip: 70, motorKv: 115 }), { airGrip: 110, motorKv: 100 }));
check('mode on still flies the sliders as set, 100 included',
  same(effectiveTune({ airframe: '5inch', feelTuning: true, airGrip: 100, motorKv: 100 }), { airGrip: 100, motorKv: 100 }));
check('the Tuned tag is measured from the aircraft\'s default',
  !offBoardTune(110, 100, '5inch') && offBoardTune(100, 100, '5inch')
  && !offBoardTune(110, 100, 'whoop65') && offBoardTune(100, 90, 'whoop65'));
check('and so is the question',
  tuneIsStock({ airframe: '5inch', weight: 100, airGrip: 110, motorKv: 100 })
  && !tuneIsStock({ airframe: '5inch', weight: 100, airGrip: 100, motorKv: 100 })
  && tuneIsStock({ airframe: 'whoop65', weight: 100, airGrip: 110, motorKv: 100 }));
check('the old stock is what moves once',
  SUPERSEDED_TUNE.GENERATION >= 1 && SUPERSEDED_TUNE.airGrip === 100 && SUPERSEDED_TUNE.motorKv === 100);

/* ------------------------------------------------------------------ */
/* The log the end of flight question reads                            */
/* ------------------------------------------------------------------ */

{
  const log = new TuneLog();
  check('an empty log has no dominant combination', log.dominant() === null);
  const a = { airframe: '5inch', weight: 120, airGrip: 85, motorKv: 100, gravityScale: 1.944 };
  const b = { airframe: '5inch', weight: 100, airGrip: 85, motorKv: 100, gravityScale: 1.62 };
  const ka = tuneKey('5inch', 120, 85, 100);
  const kb = tuneKey('5inch', 100, 85, 100);
  log.add(ka, a, 4000);
  log.add(kb, b, 9000);
  log.add(ka, a, 7000);
  const top = log.dominant();
  check('the combination flown longest is the one asked about', top && top.key === ka && top.ms === 11000 && top.weight === 120,
    top ? `${top.key} ${top.ms} ms` : 'null');
  check('a dominant entry carries its meta', top && top.airGrip === 85 && top.gravityScale === 1.944);
  log.clear();
  check('clear empties it', log.dominant() === null);
  check('keys name the airframe, so a whoop tune is never a five inch one',
    tuneKey('5inch', 100, 100, 100) !== tuneKey('whoop65', 100, 100, 100));
}

/* ------------------------------------------------------------------ */
/* When the question asks                                              */
/* ------------------------------------------------------------------ */

{
  const flight = { key: 'k1', airtimeS: TUNE_MIN_AIR_MS / 1000 };
  const base = {
    flight, tuning: true, ask: true, asked: new Set(), pad: false,
  };
  check('asks after thirty seconds in the mode', tuneAskReason(base) === '');
  check('not with the mode off', tuneAskReason({ ...base, tuning: false }) === 'mode off');
  check('not after Stop asking', tuneAskReason({ ...base, ask: false }) === 'opted out');
  check('not under thirty seconds of airtime',
    tuneAskReason({ ...base, flight: { key: 'k1', airtimeS: 29.9 } }) === 'too short');
  check('not with no flight', tuneAskReason({ ...base, flight: null }) === 'too short');
  check('not twice for one combination', tuneAskReason({ ...base, asked: new Set(['k1']) }) === 'already asked');
  check('asks again for a different combination', tuneAskReason({ ...base, asked: new Set(['k0']) }) === '');
  check('not a radio, which cannot answer a dialog', tuneAskReason({ ...base, pad: true }) === 'radio');
  check('the length rule is thirty seconds of sim time', TUNE_MIN_AIR_MS === 30000);
}

check('input kind: keyboard, touch, pad and the rest',
  inputKindFromSource('the keyboard') === 'keyboard'
  && inputKindFromSource('the touch sticks') === 'touch'
  && inputKindFromSource('a radio') === 'pad'
  && inputKindFromSource('a radio whose stick order is a guess') === 'pad'
  && inputKindFromSource('the joystick picker') === 'pad'
  && inputKindFromSource('the calibration wizard') === 'pad'
  && inputKindFromSource('the harness override') === 'unknown'
  && inputKindFromSource(undefined) === 'unknown');
check('airtime in words', airtimeWords(1) === '1 second' && airtimeWords(45) === '45 seconds'
  && airtimeWords(89) === '89 seconds' && airtimeWords(300) === '5 minutes',
  `${airtimeWords(1)}, ${airtimeWords(45)}, ${airtimeWords(300)}`);

/* ------------------------------------------------------------------ */
/* Laps flown off stock go to the board, tagged                         */
/* ------------------------------------------------------------------ */

{
  /* The shell stamps every counted lap through setTuned (main.js), and the
   * race's log is the shape race.js pushes: a stock lap has no `tuned` key. */
  const race = new Race([], 'full');
  race.log.push({ n: 1, ms: 21000, weight: 100 });
  race.log.push({ n: 2, ms: 19500, weight: 100, tuned: true });
  race.log.push({ n: 3, ms: 20500, weight: 100 });
  const row = race.boardRow();
  check('a tuned lap is the lap the board is sent when it is the fastest, and says so',
    Boolean(row) && row.lapMs === 19500 && row.tuned === true, JSON.stringify(row));
  check('and the race says it had one, for the results row', race.hasTunedLaps() === true);
  const only = new Race([], 'full');
  only.log.push({ n: 1, ms: 19500, weight: 100, tuned: true });
  check('a run of nothing but tuned laps has a board row, tagged tuned',
    Boolean(only.boardRow()) && only.boardRow().tuned === true);
  check('the race starts stock and follows what the shell says', new Race([], 'full').tuned === false
    && (() => { const r = new Race([], 'full'); r.setTuned(true); return r.tuned === true; })());
  const stock = new Race([], 'full');
  stock.log.push({ n: 1, ms: 21000, weight: 100 });
  check('a stock run is what it always was', stock.boardRow().lapMs === 21000 && stock.boardRow().tuned === false && stock.hasTunedLaps() === false
    && Object.keys(stock.log[0]).join(',') === 'n,ms,weight');
}

/* ------------------------------------------------------------------ */
/* The ticket                                                          */
/* ------------------------------------------------------------------ */

const rates = RATE_DEFAULTS ? { ...RATE_DEFAULTS } : {};
const context = { href: 'https://webfpv.org/', screen: 'results', map: 'custom', flightMode: 'acro' };

function ticket(over = {}) {
  const airGrip = over.airGrip ?? 85;
  const motorKv = over.motorKv ?? 110;
  const weight = over.weight ?? 120;
  const airframe = over.airframe ?? '5inch';
  return buildTunePayload({
    verdict: 'better',
    feel: 'right',
    words: 'Carries a lot further, and the punch is better.',
    reporter: 'Tester',
    airframe,
    airframeShort: airframe === '5inch' ? '5 inch' : 'Whoop',
    weight,
    airGrip,
    motorKv,
    gravityScale: gravityScaleFor(weight, airframe),
    airtimeS: 312.4,
    flightMode: 'acro',
    tuneId: 'betaflight-default',
    input: 'pad',
    rates,
    context,
    ...over,
  });
}

{
  const t = ticket();
  check('the ticket is kind tune and names its aircraft', t.kind === 'tune' && t.airframe === '5inch');
  check('the title is eight to a hundred and twenty characters',
    t.title.length >= 8 && t.title.length <= 120, t.title);
  check('the sentence is at least twenty characters and carries the values',
    t.what.length >= 20 && t.what.includes('Weight 120%') && t.what.includes('Air grip 85%') && t.what.includes('Motor power 110%'),
    t.what.split('\n')[1]);
  check('the typed object holds the values as flown',
    t.tune.weight === 120 && t.tune.airGrip === 85 && t.tune.motorKv === 110
    && t.tune.airScale === 0.85 && t.tune.kvScale === 1.1 && t.tune.airtimeS === 312);
  check('gravityScale is three places', Number.isFinite(t.tune.gravityScale)
    && Math.round(t.tune.gravityScale * 1000) / 1000 === t.tune.gravityScale, String(t.tune.gravityScale));
  check('the profile travels as numbers and one sentence', t.tune.rates && typeof t.tune.rates.summary === 'string'
    && Number.isFinite(t.tune.rates.rollDeg) && Number.isFinite(t.tune.rates.throttleCap),
    t.tune.rates && t.tune.rates.summary);
  check('the context is passed through untouched', t.context === context);
  check('nothing identifying is in the ticket', !('id' in t) && !('ip' in t) && !('email' in t));

  const bad = ticket({ input: 'wand', flightMode: 'turbo', tuneId: '  Bad Id!! ' });
  check('an unknown input and mode fold to the closed list', bad.tune.input === 'unknown' && bad.tune.flightMode === 'acro');
  check('a tune id is made safe', /^[a-z0-9][a-z0-9._-]{0,39}$/.test(bad.tune.tuneId), bad.tune.tuneId);
  const odd = ticket({ airtimeS: 99999999 });
  check('airtime is capped at ten hours', odd.tune.airtimeS === 36000);
  check('the title names the verdict, aircraft and values', tuneTitle({
    verdict: 'worse', weight: 100, airGrip: 70, motorKv: 95,
  }, 'Whoop') === 'Tune: worse, Whoop, grip 70, motor 95, weight 100');
  check('values line', tuneValuesLine({ weight: 100, airGrip: 70, motorKv: 95 }) === 'Weight 100%, Air grip 70%, Motor power 95%');
  const sample = { weight: 100, airGrip: 70, motorKv: 95 };
  check('a build without Motor power does not name it to a pilot',
    tuneValuesLine(sample, { air: true, kv: false }) === 'Weight 100%, Air grip 70%'
    && tuneSliderWords({ air: true, kv: false }) === 'Air grip'
    && tuneSliderWords({ air: true, kv: true }) === 'Air grip and Motor power'
    && tuneSliderWords({ air: false, kv: false }) === ''
    && tuneSliderNames().length === 2);
  check('the card and the blurbs follow the same caps',
    /Motor power/.test(tuneCardText()) && /Motor power/.test(tuneSliderBlurbs())
    && !/Motor power/.test(tuneCardText({ air: true, kv: false }))
    && !/Motor power/.test(tuneSliderBlurbs({ air: true, kv: false }))
    && /^One more slider/.test(tuneCardText({ air: true, kv: false }))
    && /^Two more sliders/.test(tuneCardText({ air: true, kv: true })));
  check('the verdict and feel words are the board\'s closed lists',
    same(TUNE_VERDICT_IDS, ['much_better', 'better', 'same', 'worse'])
    && same(FEEL_WORDS.map((f) => f.id), ['floppy', 'soft', 'right', 'stiff', 'twitchy']));
  check('ratesForTune is bounded', JSON.stringify(ratesForTune(rates)).length < 600);
}

/* ------------------------------------------------------------------ */
/* Against the board                                                   */
/* ------------------------------------------------------------------ */

async function boardValidator() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const candidates = [
    process.env.BOARD_DIR,
    path.join(here, '..', '..', 'WebFPVSimulator-LeaderBoard'),
    path.join(here, '..', '..', 'webfpvsimulator-leaderboard'),
  ].filter(Boolean);
  for (const dir of candidates) {
    const file = path.join(dir, 'src', 'validate.js');
    if (existsSync(file)) {
      const mod = await import(pathToFileURL(file).href);
      if (typeof mod.inspectBugCreate === 'function') {
        return { inspect: mod.inspectBugCreate, file };
      }
    }
  }
  return null;
}

const board = await boardValidator();
if (!board) {
  skip('the board takes what this sends', 'no checkout of WebFPVSimulator-LeaderBoard beside this one; set BOARD_DIR');
} else {
  const sim = { wasm: '0a1f60b4c2d9e871', deploy: 't9k3x2' };
  const wire = (t) => JSON.parse(JSON.stringify({ ...t, sim }));
  const probe = board.inspect({ kind: 'tune' });
  if (!probe || !probe.error || /pick a kind: crash, blocking, wrong, visual, feel or other/i.test(probe.error)) {
    skip('the board takes what this sends', `${board.file} does not know the tune kind yet`);
  } else {
    let refused = '';
    for (const airframe of ['5inch', 'whoop65']) {
      const top = airframe === '5inch' ? 140 : 120;
      for (const verdict of TUNE_VERDICT_IDS) {
        for (const airGrip of [AIR_GRIP_MIN, 85, AIR_GRIP_STOCK, AIR_GRIP_MAX]) {
          for (const motorKv of [MOTOR_KV_MIN, 95, MOTOR_KV_STOCK, MOTOR_KV_MAX]) {
            for (const weight of [60, 100, top]) {
              const t = ticket({
                airframe, verdict, airGrip, motorKv, weight,
              });
              const got = board.inspect(wire(t));
              if (got.error) {
                refused = `${airframe} ${verdict} grip ${airGrip} motor ${motorKv} weight ${weight}: ${got.error}`;
                break;
              }
            }
            if (refused) {
              break;
            }
          }
          if (refused) {
            break;
          }
        }
        if (refused) {
          break;
        }
      }
      if (refused) {
        break;
      }
    }
    check('the board takes every corner of the bands, both aircraft, all four verdicts', refused === '', refused || `via ${path.relative(process.cwd(), board.file)}`);
    check('the board takes a tune with no feel word', !board.inspect(wire(ticket({ feel: null }))).error);
    const none = board.inspect({ ...wire(ticket()), airframe: undefined });
    check('the board refuses a tune that does not name its aircraft', Boolean(none.error), none.error || 'accepted');
    const noSim = board.inspect({ ...wire(ticket()), sim: undefined });
    check('the board refuses a tune that does not name its physics', Boolean(noSim.error), noSim.error || 'accepted');
    const outside = board.inspect(wire(ticket({ airGrip: AIR_GRIP_MAX + AIR_GRIP_STEP })));
    check('the board refuses a slider outside its band, so the clamp here and there agree', Boolean(outside.error), outside.error || 'accepted');
  }
}

/* ------------------------------------------------------------------ */

const w = Math.max(...rows.map((r) => r[0].length));
console.log('tune-selftest: flight feel tuning, its bands, stock rule, question and ticket\n');
for (const [name, status, detail] of rows) {
  const tag = status === 'ok' ? ' ok ' : (status === 'skip' ? 'skip' : 'FAIL');
  console.log(`${tag}  ${name.padEnd(w)}  ${detail}`);
}
const skipped = rows.filter((r) => r[1] === 'skip').length;
console.log(`\n${rows.length - failed - skipped} of ${rows.length - skipped} checks clean${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(failed === 0 ? 0 : 1);
