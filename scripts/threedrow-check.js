/*
 * threedrow-check.js: 3D mode cannot be switched on by accident, says so in
 * flight, and the check step lets a pilot pick which stick is which.
 *
 * A pilot on Discord, 2026-11-06: "not sure what happened but the sim is
 * completely unplayable for me now", beside three tickets that read as 3D
 * mode flown by pilots who did not know it was on (bug-6f04ebea,
 * bug-e4571129, bug-9c9d953e). 3D mode is the first row of the Pilot
 * screen, where the cursor opens, and a radio's roll is Right in the menus,
 * which a switch row took as On; a radio's switches are Select. Checked here
 * in headless Chromium on the real shell with a radio installed as a fake:
 *
 *   - the cursor opens on the 3D row, and roll right there leaves it Off;
 *   - one Select asks, and leaves it Off; a second inside four seconds turns
 *     it on; one more turns it off;
 *   - a mouse click on the switch asks too, and a second click turns it on;
 *   - flying with it on puts "3D mode is on" in the banner;
 *   - Check sticks shows a pick button per channel, and pressing Roll then
 *     pushing another axis right puts roll on that axis.
 *
 * Usage:
 *   node scripts/threedrow-check.js
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

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!cond) failures += 1;
  return Boolean(cond);
}

/* One radio: AETR, throttle parked low on axis 2, a spare axis 4. */
const PADS_SEED = `(() => {
  const btns = (n) => Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 }));
  window.__pads = [
    { index: 0, id: 'Selftest radio (Vendor: 1209 Product: 4f54)', connected: true, mapping: '', timestamp: 1,
      axes: [0, 0, -1, 0, 0, 0], buttons: btns(8) },
  ];
  navigator.getGamepads = () => window.__pads;
})();`;
const SEED = `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.airframeAsked = true;
  s.graphics = 'low';
  s.graphicsAuto = false;
  s.airframe = '5inch';
  s.map = 'bardwell';
  s.mode3d = false;
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* defaults */ }`;

const axis = (i, v) => `(() => { const p = window.__pads[0]; p.axes[${i}] = ${v}; p.timestamp += 1; return 1; })()`;
const button = (i, on) => `(() => { const p = window.__pads[0]; p.buttons[${i}] = { pressed: ${on}, touched: ${on}, value: ${on ? 1 : 0} }; p.timestamp += 1; return 1; })()`;
const STATE = `(() => ({
  screen: window.__ui.screen,
  on: window.__ui.settings.mode3d === true,
  row: (window.__ui.items()[window.__ui.cursor] || {}).label,
  value: (window.__ui.items()[window.__ui.cursor] || {}).value,
  banner: window.__ui.banner ? window.__ui.banner.textContent : '',
}))()`;

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: [PADS_SEED, SEED] });
try {
  await page.until('window.__shellReady === true', 120000);
  await page.until('window.__map && window.__map().ready', 120000);
  await page.evaluate("(() => { window.__ui.show('pilot'); window.__ui.setCursor(window.__ui.items().findIndex((it) => it.label === '3D mode')); return 1; })()");
  await wait(300);
  let s = await page.evaluate(STATE);
  check('the Pilot screen, cursor on 3D mode', s.screen === 'pilot' && s.row === '3D mode', `${s.screen} ${s.row}`);
  await page.evaluate(axis(0, 1)); await wait(250);
  await page.evaluate(axis(0, 0)); await wait(250);
  s = await page.evaluate(STATE);
  check('roll right on the row leaves 3D off', !s.on && s.row === '3D mode', JSON.stringify(s));
  await page.evaluate(button(0, true)); await wait(200);
  await page.evaluate(button(0, false)); await wait(200);
  s = await page.evaluate(STATE);
  check('one press of a radio switch asks, and leaves it off', !s.on && s.value === 'Press again', JSON.stringify(s));
  await page.evaluate(button(0, true)); await wait(200);
  await page.evaluate(button(0, false)); await wait(200);
  s = await page.evaluate(STATE);
  check('a second press turns it on', s.on, JSON.stringify(s));
  await page.evaluate(button(0, true)); await wait(200);
  await page.evaluate(button(0, false)); await wait(200);
  s = await page.evaluate(STATE);
  check('one more press turns it off', !s.on, JSON.stringify(s));
  /* The mouse: the switch's On segment, twice. */
  const clickOn = "(() => { const segs = [...document.querySelectorAll('.menu .row')].find((r) => /3D mode/.test(r.textContent)).querySelectorAll('button'); const b = [...segs].find((x) => /On/.test(x.textContent)) || segs[segs.length - 1]; b.click(); return segs.length; })()";
  await page.evaluate(clickOn); await wait(200);
  s = await page.evaluate(STATE);
  check('a click asks first', !s.on, JSON.stringify(s));
  await page.evaluate(clickOn); await wait(200);
  s = await page.evaluate(STATE);
  check('a second click turns it on', s.on, JSON.stringify(s));
  await page.evaluate("(() => { window.__ui.act('fly'); return 1; })()");
  await page.until("window.__mode === 'flight' && window.__ui.screen === 'flight'", 30000);
  await wait(500);
  s = await page.evaluate(STATE);
  check('flying in 3D says so in the banner', /3D mode is on/.test(s.banner), s.banner);
  check('and the sim is in 3D', await page.evaluate('window.__mode3d().shell === true'));
  /*
   * bug-ccc6de42, on a Radiomaster Pocket with 3D on: "when i went to change
   * it to give no throttle when my stick is all the way down nothing
   * happened". The pilot went to Gamepad throttle, picked Whole stick, whose
   * note said "the bottom of the stick is no throttle", and nothing moved,
   * because in 3D the throttle is the whole stick with no thrust in the
   * middle whatever that row says (readGamepad's fly3d). So while 3D is on
   * the row has to say that it changes nothing and where 3D is turned off,
   * and what it says is read against what the input reads: the radio's
   * throttle at the bottom, through the flight's own call, on every choice.
   */
  const PAD_ROW = `(() => {
    const it = window.__ui.items().find((r) => r.label === 'Gamepad throttle');
    const im = window.__input;
    return {
      row: (window.__ui.items()[window.__ui.cursor] || {}).label,
      value: it && it.value,
      note: it ? String(it.note) : '',
      set: im.padThrottle,
      fly3d: Boolean(im.mode3d),
      thr: im.readGamepad(window.__pads[0], im.map, Boolean(im.mode3d), true).throttle,
    };
  })()`;
  await page.evaluate("(() => { window.__ui.show('pilot'); window.__ui.setCursor(window.__ui.items().findIndex((it) => it.label === 'Gamepad throttle')); return 1; })()");
  await wait(300);
  const seen = [];
  for (let i = 0; i < 3; i += 1) {
    seen.push(await page.evaluate(PAD_ROW));
    await page.tap('ArrowRight');
    await wait(250);
  }
  check('in 3D, Right on Gamepad throttle still steps through all three choices, and the input takes each',
    seen.every((r) => r.row === 'Gamepad throttle' && r.fly3d) && new Set(seen.map((r) => r.set)).size === 3,
    JSON.stringify(seen.map((r) => [r.row, r.value, r.set, r.fly3d])));
  check('and every choice flies the same throttle with the radio\'s stick at the bottom',
    seen.every((r) => r.thr === seen[0].thr), JSON.stringify(seen.map((r) => [r.set, r.thr])));
  check('so every note says 3D mode is on and this row changes nothing',
    seen.every((r) => /3D mode is on/.test(r.note) && /changes nothing/.test(r.note)),
    seen.map((r) => r.note).join(' | '));
  check('none promises no throttle at the bottom of the stick, which 3D makes full reverse',
    seen.every((r) => /bottom is full reverse/.test(r.note) && !/bottom of the stick is no throttle/.test(r.note)),
    seen.map((r) => r.note).join(' | '));
  check('and each says where to turn 3D off',
    seen.every((r) => /turn 3D mode off/i.test(r.note) && /first row/.test(r.note)),
    seen.map((r) => r.note).join(' | '));
  /* Check sticks, by hand. */
  await page.evaluate("(() => { window.__ui.show('pilot'); window.__ui.act('calibrate-check'); return 1; })()");
  await wait(300);
  const btnsShown = await page.evaluate("(() => [...document.querySelectorAll('.cal-assign button')].filter((b) => b.offsetParent).map((b) => b.textContent))()");
  check('the check step shows a pick button per channel', btnsShown.length === 4, JSON.stringify(btnsShown));
  await page.evaluate("(() => { [...document.querySelectorAll('.cal-assign button')].find((b) => /Roll/.test(b.textContent)).click(); return 1; })()");
  await wait(200);
  const listening = await page.evaluate("(() => [...document.querySelectorAll('.cal-assign button')].find((b) => /Roll/.test(b.textContent)).textContent)()");
  check('pressing Roll asks for the stick', /move it/.test(listening), listening);
  await page.evaluate(axis(4, 1)); await wait(250);
  await page.evaluate(axis(4, 0)); await wait(250);
  const after = await page.evaluate("(() => [...document.querySelectorAll('.cal-assign button')].map((b) => b.textContent))()");
  check('pushing axis 4 right makes it roll', after.includes('Roll: axis 4'), JSON.stringify(after));
  /* And with 3D off again, by Left on its row, the Gamepad throttle notes
   * are the ones they always were: the warning is 3D's alone. */
  await page.evaluate("(() => { window.__ui.show('pilot'); window.__ui.setCursor(window.__ui.items().findIndex((it) => it.label === '3D mode')); return 1; })()");
  await wait(300);
  await page.tap('ArrowLeft');
  await wait(250);
  s = await page.evaluate(STATE);
  check('Left on the 3D row turns it off', !s.on && s.row === '3D mode', JSON.stringify(s));
  const off = await page.evaluate(PAD_ROW);
  check('with 3D off the Gamepad throttle note says what its choice does, and nothing about 3D',
    !/3D mode is on/.test(off.note) && /^(Upper half|Whole stick|Right trigger):/.test(off.note), off.note);
} finally {
  await page.close();
}
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exitCode = failures ? 1 : 0;
