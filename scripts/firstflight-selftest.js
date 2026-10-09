/*
 * firstflight-selftest.js: the first flight guide's words, steps and memory,
 * in Node, against a stub browser. No page, no module.
 *
 * What it pins, and why each is worth a failing check:
 *
 *   the race words      character for character what this simulator said
 *                       before the guide had kinds, on all three devices, so
 *                       the new guide cannot have changed a string a pilot
 *                       has already read
 *   the other stick     modes, so the key named for pitch and for throttle
 *                       is the key that does it
 *   the kinds           a whoop room is told about a room, a freestyle world
 *                       is not told about gates
 *   the steps           what retires a guide, and that a lap or a third gate
 *                       always does
 *   the migration       a profile saved before the keys existed is read for
 *                       what it shows, and a newcomer is read as having had
 *                       nothing. The veteran case is the one that matters:
 *                       a guide in front of two hundred laps is a bug
 *   arming              the guide is armed at launch for the kind the seat
 *                       is, is not marked given until it is on the glass,
 *                       and never reads one kind's words over another
 *
 * Usage:
 *   npm run firstflight:selftest
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

/* As much of a browser as ui.js touches at import and in loadSettings. */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  get length() {
    return store.size;
  },
  key: (i) => [...store.keys()][i] ?? null,
};
globalThis.window = globalThis.window || {
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
};

const { SETTINGS_KEY, Ui, loadSettings } = await import('../src/ui/ui.js');
const {
  FREESTYLE_RETIRE_MS, FREESTYLE_STEP_MS, GUIDE_KEY, GUIDE_KINDS, RACE_GATES, TAKEOFF,
  controls, guideKind, guidesGiven, lapKindOfKey, stepOf, takeoffLine, textOf,
} = await import('../src/ui/firstflight.js');
const { AIRFRAMES } = await import('../configs/airframes.js');

const rows = [];
let failed = 0;

function check(name, ok, detail) {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

const DEVICES = ['keys', 'pad', 'touch'];

/* ---- the race words, as they were -------------------------------------- */

/* Copied from the guidedWords table in src/main.js as it stood on main at
 * afda081, before the guide had kinds. Mode 2, which is what every pilot
 * who has never opened Settings is on. */
const WAS = {
  touch: {
    nose: 'Push the right plate up, then throttle on the left',
    again: 'Pause, then Restart puts you back on the line',
  },
  pad: {
    nose: 'Ease the right stick forward, then throttle',
    again: 'R puts you back on the line. Escape pauses',
  },
  keys: {
    nose: 'Tip forward with the up arrow, then throttle',
    again: 'R puts you back on the line. Escape pauses',
  },
};

for (const device of DEVICES) {
  const ctx = { device, stickMode: 2, angle: true };
  const was = WAS[device];
  const want = [
    `${was.nose}\nThe green gate starts your lap`,
    'Through. The next gate turns green\nRed is the same gate, wrong side',
    `Gate by gate. ${was.again}`,
  ];
  const got = [0, 1, 2].map((step) => textOf('race', step, ctx));
  check(`race words on ${device} are the ones this simulator always said`,
    got.every((t, i) => t === want[i]), got.map((t) => JSON.stringify(t)).join(' | '));
}

/* ---- the other stick modes --------------------------------------------- */

const k1 = controls(1);
const k2 = controls(2);
const k3 = controls(3);
const k4 = controls(4);
check('mode 2 and 4: throttle on the left stick, W on the keys, pitch on the arrows',
  [k2, k4].every((c) => c.throttleSide === 'left' && c.throttleKey === 'W'
    && c.pitchSide === 'right' && c.pitchKey === 'the up arrow'),
  JSON.stringify([k2, k4]));
check('mode 1 and 3: throttle on the right stick, the arrows on the keys, pitch on W',
  [k1, k3].every((c) => c.throttleSide === 'right' && c.throttleKey === 'the up arrow'
    && c.pitchSide === 'left' && c.pitchKey === 'W'),
  JSON.stringify([k1, k3]));
check('a stick mode nobody has heard of is the default, as the input layer has it',
  JSON.stringify(controls(9)) === JSON.stringify(k2) && JSON.stringify(controls('x')) === JSON.stringify(k2),
  JSON.stringify(controls(9)));

check('mode 1 keys: tip forward with W, not the arrow that is the throttle',
  textOf('race', 0, { device: 'keys', stickMode: 1, angle: true })
    === 'Tip forward with W, then throttle\nThe green gate starts your lap',
  JSON.stringify(textOf('race', 0, { device: 'keys', stickMode: 1, angle: true })));
check('mode 1 touch: the plates are the other way round',
  textOf('race', 0, { device: 'touch', stickMode: 1, angle: true })
    === 'Push the left plate up, then throttle on the right\nThe green gate starts your lap',
  JSON.stringify(textOf('race', 0, { device: 'touch', stickMode: 1, angle: true })));
check('mode 1 pad: the left stick is the pitch',
  textOf('race', 0, { device: 'pad', stickMode: 1, angle: true })
    === 'Ease the left stick forward, then throttle\nThe green gate starts your lap',
  JSON.stringify(textOf('race', 0, { device: 'pad', stickMode: 1, angle: true })));

/* ---- take off ----------------------------------------------------------- */

const takeoffs = {
  keys2: takeoffLine('keys', 2),
  keys1: takeoffLine('keys', 1),
  pad: takeoffLine('pad', 2),
  touch2: takeoffLine('touch', 2),
  touch1: takeoffLine('touch', 1),
};
check('take off names the throttle: W in mode 2, the up arrow in mode 1',
  takeoffs.keys2 === 'Hold W to take off' && takeoffs.keys1 === 'Hold the up arrow to take off',
  `${takeoffs.keys2} / ${takeoffs.keys1}`);
check('take off on a radio and on glass',
  takeoffs.pad === 'Ease the throttle up to take off'
    && takeoffs.touch2 === 'Push the left plate up to take off'
    && takeoffs.touch1 === 'Push the right plate up to take off',
  `${takeoffs.pad} / ${takeoffs.touch2} / ${takeoffs.touch1}`);
check('the take off step is the same in every kind of place',
  GUIDE_KINDS.every((kind) => DEVICES.every((device) => textOf(kind, TAKEOFF, { device, stickMode: 2, angle: false })
    === takeoffLine(device, 2))),
  GUIDE_KINDS.join(' '));

/* ---- kinds -------------------------------------------------------------- */

check('freestyle wins whatever the aircraft',
  guideKind(true, '5inch') === 'freestyle' && guideKind(true, 'whoop65') === 'freestyle',
  `${guideKind(true, '5inch')} ${guideKind(true, 'whoop65')}`);
check('a track is a race on the five inch and a room on the whoop',
  guideKind(false, '5inch') === 'race' && guideKind(false, 'whoop65') === 'whoop',
  `${guideKind(false, '5inch')} ${guideKind(false, 'whoop65')}`);
check('an aircraft the build does not know is the five inch, like everywhere else',
  guideKind(false, 'zeppelin') === 'race' && guideKind(false, undefined) === 'race',
  `${guideKind(false, 'zeppelin')} ${guideKind(false, undefined)}`);
check('every airframe is a room exactly when its track class is micro',
  AIRFRAMES.every((a) => (guideKind(false, a.id) === 'whoop') === (a.trackClass === 'micro')),
  AIRFRAMES.map((a) => `${a.id}:${guideKind(false, a.id)}`).join(' '));

const roomZero = textOf('whoop', 0, { device: 'keys', stickMode: 2, angle: true });
const raceZero = textOf('race', 0, { device: 'keys', stickMode: 2, angle: true });
check('a room says the room is small before the first gate, and the race does not',
  roomZero.includes('room') && !raceZero.includes('room')
    && roomZero.split('\n')[0] === raceZero.split('\n')[0],
  JSON.stringify(roomZero));
check('after the first gate a room is told exactly what a track is',
  DEVICES.every((device) => [1, 2].every((step) => textOf('whoop', step, { device, stickMode: 2, angle: true })
    === textOf('race', step, { device, stickMode: 2, angle: true }))),
  'steps 1 and 2 on three devices');

/* ---- freestyle ---------------------------------------------------------- */

check('freestyle on keys in Acro says what Acro does and which key changes it',
  textOf('freestyle', 0, { device: 'keys', stickMode: 2, angle: false })
    === 'Tip forward with the up arrow, then throttle\nAcro holds its attitude. M for Angle',
  JSON.stringify(textOf('freestyle', 0, { device: 'keys', stickMode: 2, angle: false })));
check('freestyle on keys in Angle says so and names M back',
  textOf('freestyle', 0, { device: 'keys', stickMode: 2, angle: true })
    .endsWith('Angle levels itself. M for Acro'),
  JSON.stringify(textOf('freestyle', 0, { device: 'keys', stickMode: 2, angle: true })));
check('freestyle on a radio or glass has no M to name',
  ['pad', 'touch'].every((device) => [true, false].every((angle) => !/\bM\b/.test(textOf('freestyle', 0, { device, stickMode: 2, angle })))),
  'pad and touch, both modes');
check('freestyle restart goes to the start, not to a line',
  DEVICES.every((device) => textOf('freestyle', 1, { device, stickMode: 2, angle: false }).includes('start')
    && !textOf('freestyle', 1, { device, stickMode: 2, angle: false }).includes('the line')),
  JSON.stringify(textOf('freestyle', 1, { device: 'keys', stickMode: 2, angle: false })));
check('freestyle promises no gates and no clock it might not have',
  DEVICES.every((device) => [0, 1].every((step) => !/clock|lap|gate by gate/i.test(
    textOf('freestyle', step, { device, stickMode: 2, angle: false })))),
  'steps 0 and 1');

/* ---- steps -------------------------------------------------------------- */

const raceSteps = [
  [{ next: 0, lapDone: false }, 0],
  [{ next: 1, lapDone: false }, 1],
  [{ next: 2, lapDone: false }, 2],
  [{ next: RACE_GATES, lapDone: false }, -1],
  [{ next: 9, lapDone: false }, -1],
  [{ next: 0, lapDone: true }, -1],
  [{ next: 1, lapDone: true }, -1],
];
for (const kind of ['race', 'whoop']) {
  const got = raceSteps.map(([state]) => stepOf(kind, { ...state, airMs: 0 }));
  check(`${kind}: the guide follows the next gate and is gone by the third or the first lap`,
    got.every((g, i) => g === raceSteps[i][1]), got.join(' '));
}
const freeSteps = [
  [0, 0], [FREESTYLE_STEP_MS - 1, 0], [FREESTYLE_STEP_MS, 1],
  [FREESTYLE_RETIRE_MS - 1, 1], [FREESTYLE_RETIRE_MS, -1], [10 * FREESTYLE_RETIRE_MS, -1],
];
{
  const got = freeSteps.map(([airMs]) => stepOf('freestyle', { next: 0, lapDone: false, airMs }));
  check('freestyle: ten seconds of airtime for the first lines, twelve more for the second, then gone',
    got.every((g, i) => g === freeSteps[i][1]), got.join(' '));
}
check('freestyle ignores gates and laps, and a race ignores airtime',
  stepOf('freestyle', { next: 5, lapDone: true, airMs: 0 }) === 0
    && stepOf('race', { next: 0, lapDone: false, airMs: 10 * FREESTYLE_RETIRE_MS }) === 0,
  'freestyle 0, race 0');
check('a step past the end says nothing',
  GUIDE_KINDS.every((kind) => textOf(kind, 3, { device: 'keys', stickMode: 2, angle: true }) === ''
    && textOf(kind, -1, { device: 'keys', stickMode: 2, angle: true }) === ''),
  'steps 3 and -1');

/* ---- house style: what a banner can carry ------------------------------ */

{
  /* The longest LINE the race guide said before it had kinds, as shipped:
   * "Gate by gate. R puts you back on the line. Escape pauses". The first
   * version of this check measured the fragments in WAS and so came out at
   * 50; the bound is what a banner has already been seen to carry. */
  const longest = Math.max(...DEVICES.flatMap((device) => [0, 1, 2]
    .flatMap((step) => textOf('race', step, { device, stickMode: 2, angle: true }).split('\n'))
    .map((line) => line.length)));
  const bad = [];
  let count = 0;
  for (const kind of GUIDE_KINDS) {
    for (const device of DEVICES) {
      for (const stickMode of [1, 2, 3, 4]) {
        for (const angle of [true, false]) {
          for (const step of [TAKEOFF, 0, 1, 2]) {
            const text = textOf(kind, step, { device, stickMode, angle });
            count += 1;
            const lines = text.split('\n');
            if (!text && !(step === 2 && kind === 'freestyle')) {
              bad.push(`${kind}/${device}/${stickMode}/${step}: empty`);
            }
            if (/[\u2013\u2014]/.test(text)) {
              bad.push(`${kind}/${device}/${stickMode}/${step}: a dash`);
            }
            if (lines.length > 2) {
              bad.push(`${kind}/${device}/${stickMode}/${step}: ${lines.length} lines`);
            }
            for (const line of lines) {
              if (line.length > longest) {
                bad.push(`${kind}/${device}/${stickMode}/${step}: "${line}" is ${line.length}`);
              }
            }
          }
        }
      }
    }
  }
  check(`no line is longer than the longest this simulator already said (${longest}), none has a dash, none runs to three lines (${count} strings)`,
    bad.length === 0, bad.slice(0, 3).join('; ') || 'clean');
}

/* ---- which keys are best laps ------------------------------------------ */

const lapKeys = [
  ['webfpv.best.1f2e3d.16.80', 'race'],
  ['webfpv.best.1f2e3d.16.80.arcade', 'race'],
  ['webfpv.best.1f2e3d.16.80.g162.a85.k110', 'race'],
  ['webfpv.best.1f2e3d.4.20.whoop65', 'whoop'],
  ['webfpv.best.1f2e3d.4.20.arcade.whoop65.g162', 'whoop'],
  ['webfpv.bestLapMs', 'race'],
  ['webfpv.settings', ''],
  ['webfpv.trackbuilder.doc', ''],
  ['', ''],
  [null, ''],
];
{
  const got = lapKeys.map(([key]) => lapKindOfKey(key));
  check('a best lap key says which kind of place it was flown in; nothing else says anything',
    got.every((g, i) => g === lapKeys[i][1]), got.map((g) => g || '-').join(' '));
}

/* ---- what a profile has had -------------------------------------------- */

const NONE = { race: false, whoop: false, freestyle: false };
check('a newcomer has had nothing, whatever evidence is lying about',
  JSON.stringify(guidesGiven({ returning: false, fiveInchLap: true, whoopSeen: true, freestyleSeen: true }))
    === JSON.stringify(NONE) && JSON.stringify(guidesGiven(null)) === JSON.stringify(NONE)
    && JSON.stringify(guidesGiven(undefined)) === JSON.stringify(NONE),
  'returning false');
check('a returning pilot has had what they show',
  JSON.stringify(guidesGiven({ returning: true, fiveInchLap: true, whoopSeen: false, freestyleSeen: true }))
    === JSON.stringify({ race: true, whoop: false, freestyle: true }),
  'race and freestyle');
check('a returning pilot with nothing to show is due all three',
  JSON.stringify(guidesGiven({ returning: true })) === JSON.stringify(NONE), 'none');

/* ---- loadSettings reads a saved profile -------------------------------- */

function flags(s) {
  return `${s.guidedRace ? 'R' : '-'}${s.guidedWhoop ? 'W' : '-'}${s.guidedFreestyle ? 'F' : '-'}`;
}

function load(blob, keys = []) {
  store.clear();
  if (blob !== undefined) {
    store.set(SETTINGS_KEY, typeof blob === 'string' ? blob : JSON.stringify(blob));
  }
  for (const k of keys) {
    store.set(k, '123456');
  }
  return loadSettings();
}

const FIVE_LAP = 'webfpv.best.1f2e3d.16.80';
const WHOOP_LAP = 'webfpv.best.1f2e3d.4.20.whoop65.g162';

const cases = [
  ['a browser that has never been here', undefined, [], '---'],
  ['a pilot who answered the gate and never flew, on the whoop', { hasFlown: false, airframe: 'whoop65', airframeAsked: true }, [], '---'],
  ['unreadable storage', 'not json at all', [], '---'],
  ['a saved profile with no laps and no worlds', { map: 'custom' }, [], '---'],
  ['a five inch lap on file', { map: 'custom' }, [FIVE_LAP], 'R--'],
  ['the oldest best lap key, from before aircraft', { map: 'custom' }, ['webfpv.bestLapMs'], 'R--'],
  ['a whoop lap on file and no five inch one', { map: 'custom' }, [WHOOP_LAP], '-W-'],
  ['both kinds of lap on file', { map: 'custom' }, [FIVE_LAP, WHOOP_LAP], 'RW-'],
  ['a track builder document is not a lap', { map: 'custom' }, ['webfpv.trackbuilder.doc1'], '---'],
  ['a freestyle world chosen once', { freestyleMap: 'city' }, [], '--F'],
  ['a freestyle world seated now', { map: 'city' }, [], '--F'],
  ['the whoop seated now, no lap yet', { airframe: 'whoop65' }, [], '-W-'],
  ['the whoop in the hangar, flown and put away', { hangar: { whoop65: { tune: 'whoop-stock' } } }, [], '-W-'],
  ['a veteran of everything', { map: 'city', freestyleMap: 'city', airframe: 'whoop65' }, [FIVE_LAP, WHOOP_LAP], 'RWF'],
  ['a pilot who has not flown yet, with laps lying around', { hasFlown: false, freestyleMap: 'city' }, [FIVE_LAP], '---'],
  ['keys already there stand, whatever the laps say', { hasFlown: true, guidedRace: false, guidedWhoop: true, guidedFreestyle: false }, [FIVE_LAP], '-W-'],
  ['keys already there stand when they are all true', { hasFlown: true, guidedRace: true, guidedWhoop: true, guidedFreestyle: true }, [], 'RWF'],
  ['one key lost to an older tab is read again, the others stand', { hasFlown: true, guidedRace: false, guidedWhoop: false, freestyleMap: 'city' }, [FIVE_LAP], '--F'],
  ['a key of the wrong type is a missing key', { hasFlown: true, guidedRace: 'yes', map: 'custom' }, [FIVE_LAP], 'R--'],
];
for (const [name, blob, keys, want] of cases) {
  const got = flags(load(blob, keys));
  check(`loads: ${name}`, got === want, `${got} (want ${want})`);
}
{
  const s = load(undefined);
  check('the three keys are booleans in the loaded settings, so saveSettings writes them',
    GUIDE_KINDS.every((kind) => typeof s[GUIDE_KEY[kind]] === 'boolean'), GUIDE_KINDS.map((k) => GUIDE_KEY[k]).join(' '));
}
{
  /* Private mode: storage that throws. The loader must still load, and the
   * guide is due. */
  const real = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
    get length() {
      throw new Error('denied');
    },
    key() {
      throw new Error('denied');
    },
  };
  let s = null;
  let err = '';
  try {
    s = loadSettings();
  } catch (e) {
    err = String(e);
  }
  globalThis.localStorage = real;
  check('storage that throws loads as a newcomer, all three due', s && flags(s) === '---', err || flags(s));
}

/* ---- arming at launch --------------------------------------------------- */

function fresh(over) {
  const s = load(undefined);
  return Object.assign(s, over);
}

function arm(settings, guided = false) {
  const ui = { settings, guided };
  Ui.prototype.armGuide.call(ui);
  return ui;
}

check('a race track on the five inch arms the race guide',
  arm(fresh({ map: 'custom', airframe: '5inch' })).guided === 'race', arm(fresh({})).guided);
check('a race track on the whoop arms the room guide',
  arm(fresh({ map: 'custom', airframe: 'whoop65' })).guided === 'whoop', arm(fresh({ airframe: 'whoop65' })).guided);
check('the town arms the freestyle guide',
  arm(fresh({ map: 'city' })).guided === 'freestyle', arm(fresh({ map: 'city' })).guided);
check('Your map and the yard arm it too: every freestyle world is one kind',
  arm(fresh({ map: 'built' })).guided === 'freestyle', arm(fresh({ map: 'built' })).guided);
check('the whoop seated while a freestyle world is chosen is still freestyle',
  arm(fresh({ map: 'city', airframe: 'whoop65' })).guided === 'freestyle', arm(fresh({ map: 'city', airframe: 'whoop65' })).guided);

{
  const s = fresh({ map: 'custom', airframe: '5inch' });
  const ui = arm(s);
  check('armed is not given: the flag is still false until the guide is on the glass',
    ui.guided === 'race' && s.guidedRace === false && !store.has(SETTINGS_KEY), `${ui.guided} ${s.guidedRace}`);
  Ui.prototype.noteGuideShown.call(ui);
  const saved = JSON.parse(store.get(SETTINGS_KEY) || '{}');
  check('shown is given: the flag is set and saved',
    s.guidedRace === true && saved.guidedRace === true && saved.guidedWhoop === false,
    `${s.guidedRace} saved ${saved.guidedRace}`);
  store.delete(SETTINGS_KEY);
  Ui.prototype.noteGuideShown.call(ui);
  check('and it is saved once, not every frame it is drawn', !store.has(SETTINGS_KEY), 'no second write');
  const again = arm(s, 'race');
  check('a restart of the same kind keeps the guide running', again.guided === 'race', again.guided);
  const other = arm(fresh({ map: 'custom', airframe: '5inch', guidedRace: true }), false);
  check('a kind that has had its guide arms nothing', other.guided === false, other.guided);
  const swapped = arm(fresh({ map: 'custom', airframe: '5inch', guidedRace: true }), 'whoop');
  check('and drops a guide still armed for another kind, so a track is never told a room\'s words',
    swapped.guided === false, swapped.guided);
  const moved = arm(fresh({ map: 'city' }), 'race');
  check('a kind that is due replaces an armed guide for another kind',
    moved.guided === 'freestyle', moved.guided);
}
{
  const ui = { settings: fresh({}), guided: false };
  Ui.prototype.noteGuideShown.call(ui);
  check('noting a guide that is not armed writes nothing', !store.has(SETTINGS_KEY)
    && GUIDE_KINDS.every((kind) => ui.settings[GUIDE_KEY[kind]] === false), 'nothing');
}

/* ---- report ------------------------------------------------------------- */

const w = Math.max(...rows.map((r) => r[0].length));
console.log('firstflight-selftest: the first flight guide, per kind of place\n');
for (const [name, status, detail] of rows) {
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} checks clean`);
process.exit(failed === 0 ? 0 : 1);
