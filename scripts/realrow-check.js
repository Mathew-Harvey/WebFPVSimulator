/*
 * realrow-check.js: the Realistic physics switch, in the real shell.
 *
 * The owner, 2026-11-14: "Let's build it all but put all changes behind a
 * realistic physics switch in settings, so nothing changes untill the switch
 * is toggled to on". The module's half of that promise is check:realism and
 * the plant golden, which fly the module directly. This is the shell's half,
 * in headless Chromium on the real page:
 *
 *   - a fresh boot gives the module no mask, flies the airframe's own
 *     gravity, files laps under the key it always did and is not Tuned;
 *   - the Pilot screen has the row, and it is Off;
 *   - a click on its On segment reaches the module at once: the mask the
 *     module reports is the shell's, gravity is one real g, the record key
 *     gains `.real` and the machine is Tuned;
 *   - on a freestyle map with nothing scored the pack drains (the pack bit
 *     is set), and on a race course it does not, so a lap never depends on
 *     how long the pilot has been flying;
 *   - a click on Off puts every one of those back where the boot had them.
 *
 * Usage:
 *   node scripts/realrow-check.js
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

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

const ALL = 255;
const PACK = 16;

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!cond) failures += 1;
  return Boolean(cond);
}

const seed = (map) => `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.airframeAsked = true;
  s.graphics = 'low';
  s.graphicsAuto = false;
  s.airframe = '5inch';
  s.map = ${JSON.stringify(map)};
  delete s.realPhysics;
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* defaults */ }`;

const click = (word) => `(() => {
  const row = [...document.querySelectorAll('.menu .row')].find((r) => /Realistic physics/.test(r.textContent));
  if (!row) return 0;
  const b = [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(word)});
  if (!b) return 0;
  b.click();
  return 1;
})()`;
const OPEN = "(() => { window.__ui.show('pilot'); return window.__ui.items().findIndex((it) => it.label === 'Realistic physics'); })()";
const READ = '(() => ({ ...window.__realism(), setting: window.__ui.settings.realPhysics, mode: window.__map().mode }))()';

async function one(map) {
  console.log(`map ${map}`);
  const errors = [];
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: [seed(map)] });
  try {
    if (page.page && page.page.on) {
      page.page.on('pageerror', (e) => errors.push(String(e)));
    }
    await page.until('window.__shellReady === true', 120000);
    await page.until('window.__map && window.__map().ready', 120000);
    const boot = await page.evaluate(READ);
    check('a fresh boot gives the module no mask', boot.shell === 0 && boot.module === 0, JSON.stringify(boot));
    check('and flies the airframe own gravity', boot.gravity === 1.62, String(boot.gravity));
    check('files under the key it always did', !/\.real/.test(boot.key), boot.key);
    check('and is not Tuned', boot.tuned === false);
    const at = await page.evaluate(OPEN);
    await wait(300);
    check('the Pilot screen has the row', at >= 0, String(at));
    check('clicking On finds the switch', await page.evaluate(click('On')) === 1);
    await wait(300);
    const on = await page.evaluate(READ);
    check('the setting is on', on.setting === true, JSON.stringify(on));
    check('the module holds the shell mask, at once', on.shell !== 0 && on.module === on.shell, JSON.stringify(on));
    check('every part but the pack is on', (on.shell | PACK) === ALL, String(on.shell));
    check('gravity is one real g', on.gravity === 1, String(on.gravity));
    check('the record key gains .real', on.key === `${boot.key}.real`.replace('.g162', ''), `${boot.key} -> ${on.key}`);
    check('and the machine is Tuned', on.tuned === true);
    await page.evaluate("(() => { const ui = window.__ui; ui.onAction('fly', ui.settings); return 1; })()");
    await page.until("window.__mode === 'flight'", 60000);
    await wait(500);
    const fly = await page.evaluate(READ);
    const drains = (fly.shell & PACK) !== 0;
    check(fly.mode === 'freestyle' ? 'in freestyle the pack drains' : 'on a race course the pack does not drain',
      drains === (fly.mode === 'freestyle') && fly.module === fly.shell, JSON.stringify(fly));
    await page.evaluate(OPEN);
    await wait(300);
    check('clicking Off finds the switch', await page.evaluate(click('Off')) === 1);
    await wait(300);
    const off = await page.evaluate(READ);
    check('Off puts the mask, the gravity, the key and the tag back',
      off.shell === 0 && off.module === 0 && off.gravity === 1.62 && off.key === boot.key && off.tuned === false,
      JSON.stringify(off));
    check('no page error', errors.length === 0, errors.join(' | '));
    return fly.mode;
  } finally {
    await page.close();
  }
}

const modes = [await one('built'), await one('field')];
check('one freestyle map and one race course were flown', modes.includes('freestyle') && modes.some((m) => m !== 'freestyle'), modes.join(', '));
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exitCode = failures ? 1 : 0;
