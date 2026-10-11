/*
 * seat-selftest.js: each aircraft's own settings against a stub browser.
 * What a load keeps, what a change of aircraft puts away and gives back, and
 * whose "Your edits" dump each aircraft flies.
 *
 * Two tickets from one pilot on 30 September. bug-ddfe1c6d: "It doesn't
 * remember the camera angle and fov that I set. Always return to default 30
 * degrees uptilt and 85 degrees vertical FOV", and going to the whoop and
 * back dropped the five inch's tune. bug-693b9ed4: tuning the whoop on the
 * Flight controller screen took the five inch's tune away. Every check below
 * that names one of them failed before the fix.
 *
 * Usage:
 *   npm run seat:selftest
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
};
globalThis.window = globalThis.window || {
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
};

const { SETTINGS_KEY, loadSettings, seatAirframe } = await import('../src/ui/ui.js');
const { FC_DUMP_KEY, FC_DUMP_AIRFRAME_KEY, fcDumpKeyFor, readFcDump, writeFcDump } = await import('../src/fc/dump.js');
const { airframeById } = await import('../configs/airframes.js');

const rows = [];
let failed = 0;

function check(name, ok, detail) {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

const FIVE = airframeById('5inch');
const WHOOP = airframeById('whoop65');

function stored(blob) {
  store.set(SETTINGS_KEY, JSON.stringify(blob));
}

/* What the shell does with a settings object it has changed: save the lot. */
function save(s) {
  stored(s);
}

function cam(s) {
  return `${s.airframe} ${s.cameraFov}/${s.cameraAngle}`;
}

/* A profile the shell has loaded and saved once, so it is marked. */
function marked(over) {
  store.clear();
  stored({ airframe: '5inch', airframeAsked: true });
  const s = loadSettings();
  Object.assign(s, over);
  save(s);
  return s;
}

/*
 * THE LOAD. The whoop's stock lens is 95, which a five inch can pick too, and
 * the old guess on every load read a five inch on 95 as still holding the
 * whoop's stock and put it back on 85.
 */
{
  const fovs = [];
  for (const fov of [75, 85, 95, 105, 115]) {
    marked({ cameraFov: fov, cameraAngle: 35 });
    const s = loadSettings();
    if (s.cameraFov !== fov || s.cameraAngle !== 35) {
      fovs.push(`${fov}/35 came back ${s.cameraFov}/${s.cameraAngle}`);
    }
  }
  check('bug-ddfe1c6d: every lens on the five inch survives a reload, 95 included',
    fovs.length === 0, fovs.join(', ') || 'all five kept');
  marked({ cameraAngle: WHOOP.cameraAngle });
  const t = loadSettings();
  check('and the whoop\'s stock tilt on the five inch survives one too',
    t.cameraAngle === WHOOP.cameraAngle, `${WHOOP.cameraAngle} came back ${t.cameraAngle}`);
  store.clear();
  stored({ airframe: 'whoop65', airframeAsked: true });
  const w = loadSettings();
  w.cameraFov = FIVE.cameraFov;
  w.cameraAngle = FIVE.cameraAngle;
  save(w);
  const w2 = loadSettings();
  check('and the five inch\'s stock camera on the whoop',
    w2.cameraFov === FIVE.cameraFov && w2.cameraAngle === FIVE.cameraAngle, cam(w2));
}

/*
 * A BLOB FROM BEFORE THE MARK cannot say which aircraft its settings were
 * set for, so it gets the old guess one last time and comes out marked.
 */
{
  store.clear();
  stored({ airframe: 'whoop65', airframeAsked: true, cameraFov: FIVE.cameraFov, cameraAngle: FIVE.cameraAngle });
  const s = loadSettings();
  check('an unmarked whoop on the five inch\'s stock camera is moved to the whoop\'s, as before',
    s.cameraFov === WHOOP.cameraFov && s.cameraAngle === WHOOP.cameraAngle, cam(s));
  check('and comes out marked for the whoop', s.seatedFor === 'whoop65', s.seatedFor);
}

/*
 * THE LINK. The builder's Fly button writes ?craft=5inch, and seating the
 * aircraft already seated wrote its stock camera over the pilot's.
 */
{
  const s = marked({ cameraFov: 105, cameraAngle: 35, weight: 130 });
  const before = JSON.stringify(s);
  seatAirframe(s, '5inch');
  check('bug-ddfe1c6d: seating the aircraft already seated changes nothing',
    JSON.stringify(s) === before, cam(s));
}

/*
 * THE SWAP, there and back. The first visit is what it always was; every
 * visit after gives back what the pilot left.
 */
{
  const s = marked({
    cameraFov: 105, cameraAngle: 35, weight: 130,
    pids: { 'betaflight-default': { sliders: { master: 120 } } },
  });
  seatAirframe(s, 'whoop65');
  check('first time on the whoop: its stock camera',
    s.cameraFov === WHOOP.cameraFov && s.cameraAngle === WHOOP.cameraAngle, cam(s));
  check('first time on the whoop: the weight comes down to its top',
    s.weight === WHOOP.weightMax, `${s.weight}`);
  check('first time on the whoop: the PIDs as they stood',
    s.pids['betaflight-default'] && s.pids['betaflight-default'].sliders.master === 120,
    JSON.stringify(s.pids));
  s.cameraFov = 115;
  s.cameraAngle = 40;
  s.weight = 90;
  s.pids = { 'betaflight-default': { sliders: { master: 80 } } };
  seatAirframe(s, '5inch');
  check('bug-ddfe1c6d: back on the five inch, its own camera',
    s.cameraFov === 105 && s.cameraAngle === 35, cam(s));
  check('back on the five inch, its own weight', s.weight === 130, `${s.weight}`);
  check('bug-693b9ed4: back on the five inch, its own PIDs, not the whoop\'s',
    s.pids['betaflight-default'] && s.pids['betaflight-default'].sliders.master === 120,
    JSON.stringify(s.pids));
  seatAirframe(s, 'whoop65');
  const master = s.pids['betaflight-default'] ? s.pids['betaflight-default'].sliders.master : 'none';
  check('and the whoop gets its own back', s.cameraFov === 115 && s.cameraAngle === 40
    && s.weight === 90 && master === 80, `${cam(s)} weight ${s.weight} master ${master}`);
  save(s);
  const r = loadSettings();
  const away = (r.hangar || {})['5inch'];
  check('all of it survives a reload', r.airframe === 'whoop65' && r.cameraFov === 115
    && Boolean(away) && away.cameraFov === 105,
  `${cam(r)}, five inch put away at ${away && away.cameraFov}`);
}

/*
 * THE BUILDER'S TOGGLE writes the airframe and nothing else. The load sees
 * the mark disagree and makes the same move the Aircraft row makes.
 */
{
  const s = marked({ cameraFov: 105, cameraAngle: 35 });
  seatAirframe(s, 'whoop65');
  s.cameraFov = 115;
  save(s);
  const raw = JSON.parse(store.get(SETTINGS_KEY));
  raw.airframe = '5inch';
  stored(raw);
  const t = loadSettings();
  check('a toggle in the builder gives the five inch back its own camera',
    t.airframe === '5inch' && t.cameraFov === 105 && t.cameraAngle === 35, cam(t));
  const away = (t.hangar || {}).whoop65;
  check('and puts the whoop\'s away', Boolean(away) && away.cameraFov === 115,
    JSON.stringify(away && away.cameraFov));
}

/*
 * The put away PIDs are the five inch's alone. On a first visit the whoop
 * keeps flying the PIDs as they stood, and a Reset to stock deletes from that
 * object in place (clearPidsFor), so a shared object would reach into the
 * five inch's copy.
 */
{
  const { clearPidsFor } = await import('../configs/pids.js');
  const s = marked({ pids: { 'betaflight-default': { sliders: { master: 120 } } } });
  seatAirframe(s, 'whoop65');
  clearPidsFor(s.pids, 'betaflight-default');
  seatAirframe(s, '5inch');
  check('a Reset to stock on the whoop leaves the five inch\'s PIDs alone',
    Boolean(s.pids['betaflight-default']) && s.pids['betaflight-default'].sliders.master === 120,
    JSON.stringify(s.pids));
}

/* A hangar entry is validated against its aircraft on the way back. */
{
  const s = marked({});
  s.hangar = { whoop65: { tune: 'no-such-tune', cameraFov: 5, cameraAngle: 900, weight: 1e6, packVoltage: 9, pids: 'x' } };
  seatAirframe(s, 'whoop65');
  check('a hand edited hangar comes back inside every list and range',
    s.tune === WHOOP.defaultTune && s.cameraFov === WHOOP.cameraFov && s.cameraAngle <= 60
    && s.weight === WHOOP.weightMax && WHOOP.packVoltages.includes(s.packVoltage)
    && JSON.stringify(s.pids) === '{}',
  `${s.tune} ${cam(s)} weight ${s.weight} pack ${s.packVoltage} pids ${JSON.stringify(s.pids)}`);
}

/*
 * THE DUMP, one per aircraft. One slot stamped with one aircraft was how a
 * Save on the whoop took the five inch's Your edits away.
 */
{
  store.clear();
  writeFcDump('5inch', 'five');
  writeFcDump('whoop65', 'whoop');
  check('bug-693b9ed4: a Save on the whoop leaves the five inch\'s dump alone',
    readFcDump('5inch') === 'five' && readFcDump('whoop65') === 'whoop',
    `${readFcDump('5inch')} / ${readFcDump('whoop65')}`);

  store.clear();
  store.set(FC_DUMP_KEY, 'old');
  check('an old unstamped dump is still the five inch\'s, and not the whoop\'s',
    readFcDump('5inch') === 'old' && readFcDump('whoop65') === null,
    `${readFcDump('5inch')} / ${readFcDump('whoop65')}`);

  store.clear();
  store.set(FC_DUMP_KEY, 'old');
  store.set(FC_DUMP_AIRFRAME_KEY, 'whoop65');
  writeFcDump('5inch', 'five');
  check('an old dump stamped for the whoop survives a five inch Save, and stays the whoop\'s',
    readFcDump('whoop65') === 'old' && readFcDump('5inch') === 'five' && store.get(FC_DUMP_KEY) === 'old',
    `${readFcDump('5inch')} / ${readFcDump('whoop65')}`);
  writeFcDump('whoop65', 'whoop');
  check('and the whoop\'s own Save supersedes it and clears the old slot',
    readFcDump('whoop65') === 'whoop' && !store.has(FC_DUMP_KEY) && !store.has(FC_DUMP_AIRFRAME_KEY),
    `${readFcDump('whoop65')}, old slot ${store.has(FC_DUMP_KEY) ? 'left' : 'cleared'}`);
  check('each under its own key', store.get(fcDumpKeyFor('5inch')) === 'five'
    && store.get(fcDumpKeyFor('whoop65')) === 'whoop', [...store.keys()].join(' '));

  /* And the Tune row, which offers Your edits off the same reader. */
  const s = marked({});
  writeFcDump('5inch', 'five');
  s.tune = 'custom';
  seatAirframe(s, 'whoop65');
  check('Your edits is not offered on an aircraft with no dump of its own',
    s.tune === WHOOP.defaultTune, s.tune);
  seatAirframe(s, '5inch');
  check('bug-ddfe1c6d: and the five inch gets Your edits back on the way home',
    s.tune === 'custom', s.tune);
}

/*
 * THE SOFTER DEFAULT RATES (2026-10-09). A profile still on the old stock
 * 70 / 670 on every axis never chose it, so it moves to the new default
 * once; anything a pilot set is left, and so is the old stock typed back
 * after the move. The throttle limit is never part of it.
 */
{
  const OLD = { rcRate: 7, srate: 67, expo: 0 };
  const oldStock = (extra) => ({
    type: 'ACTUAL', roll: { ...OLD }, pitch: { ...OLD }, yaw: { ...OLD }, ...extra,
  });
  const axes = (r) => ['roll', 'pitch', 'yaw'].map((a) => `${r[a].rcRate}/${r[a].srate}/${r[a].expo}`).join(' ');
  const isNew = (r) => ['roll', 'pitch', 'yaw'].every((a) => r[a].rcRate === 6 && r[a].srate === 60 && r[a].expo === 0);

  store.clear();
  let s = loadSettings();
  check('rates: a fresh profile starts on Actual 60 / 600', isNew(s.rates) && s.stockRates === 1, axes(s.rates));

  store.clear();
  stored({ airframe: '5inch', airframeAsked: true, seatedFor: '5inch', rates: oldStock({ throttleCap: 80 }) });
  s = loadSettings();
  check('rates: an unmarked profile on the old stock moves to 60 / 600 and keeps its cap',
    isNew(s.rates) && s.rates.throttleCap === 80 && s.stockRates === 1, `${axes(s.rates)} cap ${s.rates.throttleCap}`);

  save({ ...s, rates: oldStock({ throttleCap: 80 }) });
  s = loadSettings();
  check('rates: the old stock typed back after the move is the pilot\'s and stays',
    axes(s.rates) === '7/67/0 7/67/0 7/67/0', axes(s.rates));

  store.clear();
  stored({ airframe: '5inch', airframeAsked: true, seatedFor: '5inch',
    rates: { type: 'ACTUAL', roll: { rcRate: 7, srate: 80, expo: 0 }, pitch: { ...OLD }, yaw: { ...OLD } } });
  s = loadSettings();
  check('rates: a pilot\'s own rates are not moved', s.rates.roll.srate === 80 && s.rates.pitch.srate === 67, axes(s.rates));

  store.clear();
  stored({ airframe: 'whoop65', airframeAsked: true, seatedFor: 'whoop65', rates: oldStock({}) });
  s = loadSettings();
  check('rates: the whoop on the old stock moves too', isNew(s.rates) && s.airframe === 'whoop65', axes(s.rates));
}

const w = Math.max(...rows.map((r) => r[0].length));
console.log('seat-selftest: each aircraft\'s own settings, and its own dump\n');
for (const [name, status, detail] of rows) {
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} checks clean`);
process.exit(failed === 0 ? 0 : 1);
