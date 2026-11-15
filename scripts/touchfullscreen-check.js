/*
 * touchfullscreen-check.js: flight fullscreen is never asked for on an
 * iPhone or iPad, and is still asked for everywhere else.
 *
 * bug-6912271c, an iPad on the thumb sticks: "Each time I try to touch the
 * controller it goes offscreen Because it thought I was typing", and
 * bug-df539511 two days before it, another iPad: "it keeps pausing game".
 * WebKit's element fullscreen on iOS scores every touch that ends and, when
 * they come quick and spread, stops the page under "It looks like you are
 * typing while in full screen" with Exit and Stay (WKFullScreenViewController
 * and FullscreenTouchSecheuristic in WebKit). Thumbs on two sticks are that.
 * Exit leaves fullscreen, the shell pauses on a fullscreen exit, and every
 * Resume asked for fullscreen again.
 *
 * Headless Chromium has no such guard, so this cannot show Safari's alert.
 * What it shows is the shell's half, which is the half this code owns:
 *
 *   - on a desktop a Fly pressed by a person takes fullscreen, and leaving
 *     it pauses the flight, as it always has. This is the control: it is
 *     what makes the iPad's "no fullscreen" mean the shell did not ask,
 *     rather than that this browser could not;
 *   - on an iPad (Safari's own user agent, which says Macintosh, and touch
 *     points no Mac has) the shell reads the platform as iOS, and Fly,
 *     Resume and Restart, each pressed by a person, take no fullscreen: the
 *     thumb sticks are up and the flight goes on flying;
 *   - its Pilot screen row says why, there and only there;
 *   - an iPhone's user agent reads as iOS too;
 *   - an Android phone on the thumb sticks still takes fullscreen on Fly,
 *     because Chrome has no such guard and a phone gains the room its
 *     address bar took.
 *
 * Usage:
 *   node scripts/touchfullscreen-check.js
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
import { stickPlatform } from '../src/ui/stickhelp.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* The tickets' own: bug-6912271c's iPad sent this word for word. */
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Safari/605.1.15';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!cond) failures += 1;
  return Boolean(cond);
}

/* A returning pilot on the built map, so Fly goes straight to the air. The
 * user agent goes on before the app runs, because the shell reads it once,
 * and Safari has no Client Hints, so they go too. */
const seed = (ua) => `try {
  ${ua ? `Object.defineProperty(Navigator.prototype, 'userAgent', { configurable: true, get: () => ${JSON.stringify(ua)} });
  Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => undefined });` : ''}
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, {
    airframeAsked: true, hasFlown: true, feelAsked: true, graphics: 'low', graphicsAuto: false,
    airframe: '5inch', map: 'built', fullscreenFly: true,
  });
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* defaults */ }`;

/* A press by a person: fullscreen is granted only inside a user gesture,
 * and Runtime.evaluate can carry one, as a click would. */
async function press(page, expression) {
  const r = await page.cdp.send('Runtime.evaluate', {
    expression, userGesture: true, returnByValue: true, awaitPromise: true,
  }, page.sessionId);
  if (r.exceptionDetails) {
    throw new Error(`press threw: ${r.exceptionDetails.text}`);
  }
}

/* The page's own errors. No board runs beside this check, so its two
 * counters' calls are refused, and that is the harness, not the page. */
const pageErrors = (page) => page.errors.filter((e) => !/net::ERR_CONNECTION_REFUSED/.test(e));

const FULL = 'Boolean(document.fullscreenElement)';
const PLATES = '(() => { const t = window.__touch && window.__touch(); return t ? t.visible : null; })()';
const ROW = `(() => {
  window.__ui.show('pilot');
  const it = window.__ui.items().find((x) => x.label === 'Fullscreen in flight');
  return it ? it.note : null;
})()`;

async function boot(ua, touch, width, height) {
  const page = await openPage({ root, width, height, touch, seed: [seed(ua)] });
  await page.until('window.__shellReady === true && window.__map && window.__map().ready', 120000);
  return page;
}

async function fly(page) {
  await press(page, "window.__ui.act('fly')");
  await page.until("window.__mode === 'flight'", 60000);
  await page.sleep(600);
}

async function desktop() {
  console.log('desktop, the control');
  const page = await boot(null, false, 1280, 720);
  try {
    check('the platform is not iOS', await page.evaluate('window.__ui.stickPlatform') !== 'ios');
    await fly(page);
    check('a Fly pressed by a person takes fullscreen', await page.evaluate(FULL));
    await page.evaluate('document.exitFullscreen().then(() => 1)');
    await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
    check('and leaving it pauses, the Escape idiom', await page.evaluate("window.__ui.screen === 'paused'"));
    check('its row says what fullscreen is for', /On: Fly, Restart and Resume go fullscreen/.test(await page.evaluate(ROW) || ''));
    check('no page error', pageErrors(page).length === 0, pageErrors(page).slice(0, 2).join(' | '));
  } finally {
    await page.close();
  }
}

async function ipad() {
  console.log('iPad on the thumb sticks, bug-6912271c');
  const page = await boot(IPAD_UA, true, 1180, 676);
  try {
    check('Safari\'s own user agent with touch points reads as iOS', await page.evaluate('window.__ui.stickPlatform') === 'ios');
    await fly(page);
    check('a Fly pressed by a person takes no fullscreen', !(await page.evaluate(FULL)));
    check('the thumb sticks are up', await page.evaluate(PLATES) === true);
    await page.sleep(1200);
    check('and the flight goes on flying', await page.evaluate("window.__mode === 'flight' && window.__ui.screen === 'flight'"));
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); return 1; })()");
    await page.until("window.__ui.screen === 'paused'", 10000);
    await press(page, "window.__ui.act('resume')");
    await page.until("window.__ui.screen === 'flight'", 10000);
    await page.sleep(400);
    check('Resume pressed by a person takes no fullscreen', !(await page.evaluate(FULL)));
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); return 1; })()");
    await page.until("window.__ui.screen === 'paused'", 10000);
    await press(page, "window.__ui.act('restart')");
    await page.until("window.__mode === 'flight' && window.__ui.screen === 'flight'", 30000);
    await page.sleep(400);
    check('nor does Restart', !(await page.evaluate(FULL)));
    check('the flight is still flying, unpaused', await page.evaluate("window.__ui.screen === 'flight'"));
    const note = await page.evaluate(ROW);
    check('the Pilot screen row says why, on an iPad', /Not on an iPhone or iPad/.test(note || '') && /typing/.test(note || ''), note);
    check('no page error', pageErrors(page).length === 0, pageErrors(page).slice(0, 2).join(' | '));
  } finally {
    await page.close();
  }
}

async function android() {
  console.log('Android phone on the thumb sticks');
  const page = await boot(ANDROID_UA, true, 844, 390);
  try {
    check('the platform reads as Android', await page.evaluate('window.__ui.stickPlatform') === 'android');
    await fly(page);
    check('a Fly pressed by a person still takes fullscreen', await page.evaluate(FULL));
    check('the thumb sticks are up', await page.evaluate(PLATES) === true);
    const note = await page.evaluate(ROW);
    check('and its row is the usual one', /On: Fly, Restart and Resume go fullscreen/.test(note || ''), note);
  } finally {
    await page.close();
  }
}

console.log('the platform, in Node');
check('an iPhone reads as iOS', stickPlatform({ userAgent: IPHONE_UA, maxTouchPoints: 5 }) === 'ios');
check('a Mac with no touch points does not', stickPlatform({ userAgent: IPAD_UA, maxTouchPoints: 0 }) === 'mac');

await desktop();
await ipad();
await android();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exitCode = failures ? 1 : 0;
