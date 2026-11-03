/*
 * tuneplant-check.js: a tune is offered only on the plant it was measured
 * on, and the shell's stored choices obey that.
 *
 * bug-bb1e9529, 2026-11-02: a five inch flown on 'whoop-champion', the 1S
 * whoop's factory tune. On 2026-10-23 the whoop moved from plant 1 to the
 * five inch's plant 0 and its default tune moved to betaflight-default, and
 * the record says a stored whoop on 'whoop-champion' is reseated. It was not.
 * tunesFor in configs/registry.js found a tune's plant through the airframe
 * it was written for, the whoop, whose plant was now 0, so the 1S tune was
 * offered on BOTH airframes' Tune rows and on the Presets tab, and every
 * profile already holding it kept it. 24 of the 220 feel and tune reports
 * filed from the move to this fix were flown on it, 7 on a five inch, among
 * them bug-46401224 on the whoop.
 *
 * Each tune now names its own `plant`. What is checked:
 *
 *   - every tune an airframe is offered was written for that airframe's
 *     plant, and each airframe's default is on its own list;
 *   - on today's table each airframe is offered betaflight-default alone,
 *     which is the registry header's "one shipped tune";
 *   - the Presets tab's list is exactly the Tune rows' lists put together,
 *     and the screen reads that list and not the whole table;
 *   - plant 1 still has 'whoop-champion', so an airframe that selects plant
 *     1 again gets it back with no edit, and the two retired tunes stay
 *     retired there;
 *   - the bug held in place: the old rule, run on today's table, offers
 *     'whoop-champion' to the five inch, so the first checks can fail;
 *   - through the real loadSettings and seatAirframe in src/ui/ui.js, a five
 *     inch (the ticket) and a whoop (bug-46401224) stored on it load on
 *     betaflight-default, and so does a whoop kept on it in the hangar when
 *     it is seated, and a five inch holding it when it moves to the whoop.
 *
 * Node only, no module, no browser, well under a second.
 *
 * Usage:
 *   npm run check:tuneplant
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* As much of a browser as ui.js touches at import and in loadSettings, the
 * same stub scripts/seat-selftest.js uses. */
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { AIRFRAMES, airframeById } = await import('../configs/airframes.js');
const registry = await import('../configs/registry.js');
const { TUNES, OFFERED_TUNES, tunesFor } = registry;
const { SETTINGS_KEY, loadSettings, seatAirframe } = await import('../src/ui/ui.js');

const rows = [];
let failed = 0;

function check(name, ok, detail = '') {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

const ids = (list) => list.map((t) => t.id).join(', ') || 'none';
const CHAMP = 'whoop-champion';
const STOCK = 'betaflight-default';

/* The rule. */
for (const a of AIRFRAMES) {
  const list = tunesFor(a.id);
  check(`${a.id}: every tune offered was written for its plant ${a.simId}`,
    list.length > 0 && list.every((t) => t.plant === a.simId),
    list.map((t) => `${t.id} plant ${t.plant}`).join(', '));
  check(`${a.id}: its default tune is on its own list`,
    list.some((t) => t.id === a.defaultTune), `${a.defaultTune} in [${ids(list)}]`);
}
check('every tune names the plant it was measured on',
  TUNES.every((t) => Number.isInteger(t.plant)), TUNES.map((t) => `${t.id} ${t.plant}`).join(', '));

/* Today's table. */
check('the five inch is offered betaflight-default alone (bug-bb1e9529)',
  ids(tunesFor('5inch')) === STOCK, ids(tunesFor('5inch')));
check('the whoop on plant 0 is offered betaflight-default alone (bug-46401224)',
  airframeById('whoop65').simId !== 0 || ids(tunesFor('whoop65')) === STOCK, ids(tunesFor('whoop65')));
check('no airframe on plant 0 is offered the 1S whoop tune',
  AIRFRAMES.filter((a) => a.simId === 0).every((a) => !tunesFor(a.id).some((t) => t.id === CHAMP)),
  AIRFRAMES.map((a) => `${a.id}: ${ids(tunesFor(a.id))}`).join('; '));

/* The second room. */
const union = TUNES.filter((t) => AIRFRAMES.some((a) => tunesFor(a.id).includes(t)));
check('the Presets tab offers exactly what some Tune row offers', ids(OFFERED_TUNES) === ids(union),
  `presets [${ids(OFFERED_TUNES)}], rows [${ids(union)}]`);
{
  const fc = readFileSync(join(root, 'src/ui/fc.js'), 'utf8');
  const reads = /for \(const t of OFFERED_TUNES\)/.test(fc);
  const whole = /import\s*\{[^}]*\bTUNES\b[^}]*\}\s*from\s*'..\/..\/configs\/registry\.js'/.test(fc);
  check('the Presets tab lists OFFERED_TUNES and never the whole table', reads && !whole,
    `reads OFFERED_TUNES ${reads}, imports TUNES ${whole}`);
}

/* Plant 1 is still in the module (check:plant, whoop:gates) and keeps its tune. */
if (typeof registry.tunesForPlant === 'function') {
  const p1 = registry.tunesForPlant(1);
  check('plant 1 is still offered whoop-champion, and only it', ids(p1) === CHAMP, ids(p1));
} else {
  check('plant 1 is still offered whoop-champion, and only it', false, 'no tunesForPlant in configs/registry.js');
}

/* The bug, held in place: the plant read off the airframe a tune was
 * written for, as tunesFor did until this check. */
{
  const oldRule = (airframeId) => {
    const want = AIRFRAMES.find((a) => a.id === airframeId);
    return TUNES.filter((t) => {
      const owner = t.airframe && AIRFRAMES.find((a) => a.id === t.airframe);
      return Boolean(owner) && owner.simId === want.simId;
    });
  };
  check('the old rule offers the 1S whoop tune to the five inch (the bug)',
    oldRule('5inch').some((t) => t.id === CHAMP), ids(oldRule('5inch')));
}

/* The shell. A profile stored by the shell, loaded back. */
function stored(blob) {
  store.clear();
  store.set(SETTINGS_KEY, JSON.stringify(blob));
}

{
  stored({ airframe: '5inch', airframeAsked: true, seatedFor: '5inch', tune: CHAMP });
  const s = loadSettings();
  check('a five inch stored on whoop-champion loads on betaflight-default (the ticket)',
    s.airframe === '5inch' && s.tune === STOCK, `${s.airframe} ${s.tune}`);
}
{
  stored({ airframe: 'whoop65', airframeAsked: true, seatedFor: 'whoop65', tune: CHAMP });
  const s = loadSettings();
  check('a whoop stored on whoop-champion loads on betaflight-default',
    s.airframe === 'whoop65' && s.tune === STOCK, `${s.airframe} ${s.tune}`);
}
{
  stored({ airframe: 'whoop65', tune: CHAMP });
  const s = loadSettings();
  check('an unmarked whoop on whoop-champion loads on betaflight-default',
    s.airframe === 'whoop65' && s.tune === STOCK, `${s.airframe} ${s.tune}`);
}
{
  stored({ airframe: '5inch', airframeAsked: true, seatedFor: '5inch', tune: STOCK,
    hangar: { whoop65: { tune: CHAMP } } });
  const s = loadSettings();
  seatAirframe(s, 'whoop65');
  check('a whoop kept in the hangar on whoop-champion is seated on betaflight-default',
    s.airframe === 'whoop65' && s.tune === STOCK, `${s.airframe} ${s.tune}`);
}
{
  stored({ airframe: '5inch', airframeAsked: true, seatedFor: '5inch', tune: STOCK });
  const s = loadSettings();
  s.tune = CHAMP;
  seatAirframe(s, 'whoop65');
  check('a five inch holding whoop-champion moves to the whoop on betaflight-default',
    s.airframe === 'whoop65' && s.tune === STOCK, `${s.airframe} ${s.tune}`);
}

const w = Math.max(...rows.map((r) => r[0].length));
console.log('tuneplant-check: a tune is offered on the plant it was measured on\n');
for (const [name, status, detail] of rows) {
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} checks clean`);
process.exit(failed === 0 ? 0 : 1);
