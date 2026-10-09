/*
 * firstflight-check.js: the first flight guide in the real shell, in
 * headless Chromium, through the doors a newcomer actually uses.
 *
 * scripts/firstflight-selftest.js holds the words, the steps and the memory
 * against a stub browser in a second. What it cannot see is the shell: that
 * a launch arms the guide for the kind of place it is, that main.js puts the
 * words on the banner at the right moment, that the flag is written only
 * when a line is on the glass, and that a ?fly=1 link, which skips the menu
 * and with it the old guided First flight row, gets the guide too.
 *
 * Every scenario opens its own page on its own empty profile, seeds exactly
 * what its pilot would have, and reads the banner and the stored settings
 * the way a pilot's next visit would meet them:
 *
 *   A  a newcomer, a whoop room by link: every step of the room's guide,
 *      then the second visit, which says nothing
 *   B  a newcomer, a five inch track by link
 *   C  a newcomer, the town by link: the freestyle words, and, in the air
 *      for the airtime they are keyed to, the second of them
 *   D  a five inch veteran meets the whoop for the first time: the room's
 *      guide and not the track's, and the track stays quiet afterwards
 *   E  a newcomer on a phone, a whoop room by link: the plates, not keys
 *   F  ?guide=1 on a profile that has had them all
 *   G  the title's own First flight row, the door that used to be the only
 *      one
 *
 * Usage:
 *   npm run check:firstflight
 *
 * It takes a few minutes, mostly the town. It is not part of verify: it
 * checks the shell, not the physics. Console noise from a board that is not
 * running is filtered the way scripts/shell-check.js filters it.
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
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { presetsForClass } from '../src/trackbuilder/presets.js';
import { textOf } from '../src/ui/firstflight.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const rows = [];
let failed = 0;

function check(name, ok, detail) {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

/* The builder's autosave seats, copied from scripts/shots.js and
 * src/trackbuilder/storage.js: one per class. */
const FULL_SEAT = 'webfpv.trackbuilder.autosave.v1';
const MICRO_SEAT = 'webfpv.trackbuilder.autosave.micro.v1';
const FULL_DOC = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'course-reference.json'), 'utf8'));
const MICRO_DOC = presetsForClass('micro')[0];

/* A five inch best lap, the evidence a veteran of the track carries. */
const FIVE_LAP = 'webfpv.best.1f2e3d.16.80';

const KEYS = { device: 'keys', stickMode: 2, angle: true };

/*
 * The seed: stored settings and extra keys, written once per tab, before the
 * first line of the app, through the door the pilot's own browser uses.
 * `hasFlown: false` is how a newcomer who has a track in front of them reads:
 * a blob that says they have not flown yet is a first run whatever else is
 * stored beside it (detectFirstRun).
 */
function seedFor({ settings, keys = {} }) {
  return `try {
    if (!sessionStorage.getItem('ff-seeded')) {
      sessionStorage.setItem('ff-seeded', '1');
      localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(${JSON.stringify({
    graphics: 'low', graphicsAuto: false, ...settings,
  })}));
      const extra = ${JSON.stringify(keys)};
      for (const k of Object.keys(extra)) { localStorage.setItem(k, extra[k]); }
    }
  } catch (e) { /* Storage refused. The checks below will say so. */ }`;
}

const NEWCOMER = { hasFlown: false, map: 'custom' };
const WHOOP_ROOM = { [MICRO_SEAT]: JSON.stringify(MICRO_DOC) };
const FIVE_TRACK = { [FULL_SEAT]: JSON.stringify(FULL_DOC) };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* FF_ONLY=A,D2 runs just those scenarios, matched on the letter and number
 * each name starts with. For chasing one failure without the town. */
const ONLY = (process.env.FF_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);

async function banner(page) {
  return page.evaluate('window.__ui.banner.textContent');
}

/* Until the banner reads exactly this, or say what it read instead. */
async function bannerIs(page, want, ms = 30000) {
  try {
    await page.until(`window.__ui.banner.textContent === ${JSON.stringify(want)}`, ms);
    return { ok: true, got: want };
  } catch (e) {
    return { ok: false, got: await banner(page) };
  }
}

async function state(page) {
  return JSON.parse(await page.evaluate(`JSON.stringify((() => {
    const s = window.__ui.settings;
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}'); } catch (e) { stored = {}; }
    return {
      screen: window.__ui.screen,
      guided: window.__ui.guided,
      firstRun: window.__ui.firstRun,
      airframe: s.airframe,
      flags: [s.guidedRace, s.guidedWhoop, s.guidedFreestyle].map((f) => (f ? 'T' : 'F')).join(''),
      stored: [stored.guidedRace, stored.guidedWhoop, stored.guidedFreestyle].map((f) => (f ? 'T' : 'F')).join(''),
      fault: window.__frameFault ? window.__frameFault.message : null,
    };
  })())`));
}

async function launched(page, ms = 150000) {
  await page.until(
    "window.__shellReady === true && window.__ui.screen === 'flight' && window.__craftState().mode === 'flight'",
    ms,
  );
}

/* Lift off and let go, so the run counts as flown. The throttle is the one
 * scripts/device-check.js lifts a five inch on; a room's ceiling is close,
 * so it lets go the moment the craft is off the ground. */
async function takeOff(page) {
  await page.evaluate('window.__stick(0, 0, 0, 0.62), 1');
  await page.until('window.__craftState().flownThisRun === true', 60000);
  await page.evaluate('window.__stick(0, 0, 0, 0.42), 1');
}

/* Go to a link inside the same tab, so the profile carries over, and wait for
 * the new document to be the one answering. */
async function visit(page, url) {
  await page.evaluate('window.__before = true, 1');
  await page.evaluate(`location.href = ${JSON.stringify(url)}, 1`).catch(() => {});
  await page.until('window.__before === undefined && window.__shellReady === true', 150000);
}

async function scenario(name, opts, run) {
  if (ONLY.length && !ONLY.includes(name.split(' ')[0])) {
    return;
  }
  const t0 = Date.now();
  let page = null;
  try {
    page = await openPage({
      root,
      width: opts.width || 1280,
      height: opts.height || 720,
      url: opts.url,
      touch: Boolean(opts.touch),
      seed: [seedFor(opts)],
    });
    await run(page);
    const uncaught = page.errors.filter((m) => !/net::ERR_|Failed to load resource/.test(m));
    check(`${name}: no uncaught error, no frame fault`, uncaught.length === 0 && !(await state(page)).fault,
      uncaught.slice(0, 2).join(' | ') || 'clean');
  } catch (e) {
    check(`${name}: ran to the end`, false, String(e.message || e).slice(0, 240));
  } finally {
    if (page) {
      await page.close();
    }
    console.log(`  ${name}: ${Math.round((Date.now() - t0) / 1000)} s`);
  }
}

/* ---- A: a newcomer, a whoop room, by link ------------------------------- */

const WHOOP_LINK = '/index.html?map=custom&craft=whoop65&fly=1';

await scenario('A whoop room by link', { url: WHOOP_LINK, settings: NEWCOMER, keys: WHOOP_ROOM }, async (page) => {
  await launched(page);
  const s0 = await state(page);
  check('A: the link took them past the menu to the grid, on the whoop, with the room guide armed',
    s0.screen === 'flight' && s0.airframe === 'whoop65' && s0.guided === 'whoop', JSON.stringify(s0));
  const pre = await bannerIs(page, 'Hold W to take off\nThe green gate starts your lap');
  check('A: before take off the banner names the throttle key', pre.ok, JSON.stringify(pre.got));
  check('A: and the room is marked as guided only now it is on the glass',
    s0.flags === 'FTF' && s0.stored === 'FTF', `flags ${s0.flags}, stored ${s0.stored}`);

  await takeOff(page);
  const step0 = await bannerIs(page, textOf('whoop', 0, KEYS));
  check('A: in the air, before the first gate, it says the room is small', step0.ok, JSON.stringify(step0.got));
  await page.evaluate('window.__setRaceNext(1), 1');
  const step1 = await bannerIs(page, textOf('whoop', 1, KEYS), 15000);
  check('A: after the first gate it says what the colours mean', step1.ok, JSON.stringify(step1.got));
  await page.evaluate('window.__setRaceNext(2), 1');
  const step2 = await bannerIs(page, textOf('whoop', 2, KEYS), 15000);
  check('A: after the second it says how to start again', step2.ok, JSON.stringify(step2.got));
  await page.evaluate('window.__setRaceNext(3), 1');
  await page.until('window.__ui.guided === false', 15000).catch(() => {});
  const done = await state(page);
  check('A: at the third gate the guide retires itself', done.guided === false, JSON.stringify(done.guided));

  await visit(page, WHOOP_LINK);
  await launched(page);
  const again = await bannerIs(page, 'Throttle up to take off\nThe green gate starts your lap');
  const s1 = await state(page);
  check('A: the second visit is the usual prompt, with no guide', again.ok && s1.guided === false,
    `${JSON.stringify(again.got)} guided ${s1.guided}`);
  check('A: and the flags it left stand', s1.flags === 'FTF', s1.flags);
});

/* ---- B: a newcomer, a five inch track, by link -------------------------- */

const FIVE_LINK = '/index.html?map=custom&craft=5inch&fly=1';

await scenario('B five inch track by link', { url: FIVE_LINK, settings: NEWCOMER, keys: FIVE_TRACK }, async (page) => {
  await launched(page);
  const s0 = await state(page);
  const pre = await bannerIs(page, 'Hold W to take off\nThe green gate starts your lap');
  check('B: the track gets the race guide, and the banner names the throttle key',
    s0.guided === 'race' && s0.airframe === '5inch' && pre.ok, `${s0.guided} ${JSON.stringify(pre.got)}`);
  check('B: only the race flag is set', s0.flags === 'TFF' && s0.stored === 'TFF', `flags ${s0.flags}, stored ${s0.stored}`);
  await takeOff(page);
  const step0 = await bannerIs(page, textOf('race', 0, KEYS));
  check('B: in the air it is the words this simulator has always said',
    step0.ok && step0.got === 'Tip forward with the up arrow, then throttle\nThe green gate starts your lap',
    JSON.stringify(step0.got));
});

/* ---- C: a newcomer, the town, by link ----------------------------------- */

await scenario('C the town by link', { url: '/index.html?map=city&craft=5inch&fly=1', settings: { hasFlown: false, map: 'city' } }, async (page) => {
  await launched(page, 240000);
  const s0 = await state(page);
  const pre = await banner(page);
  check('C: the town gets the freestyle guide and the banner leads with the throttle key',
    s0.guided === 'freestyle' && pre.startsWith('Hold W to take off\n'), `${s0.guided} ${JSON.stringify(pre)}`);
  check('C: only the freestyle flag is set', s0.flags === 'FFT' && s0.stored === 'FFT', `flags ${s0.flags}, stored ${s0.stored}`);

  await takeOff(page);
  const acro = await page.evaluate('window.__flightMode()');
  const step0 = await bannerIs(page, textOf('freestyle', 0, { ...KEYS, angle: acro === 'angle' }));
  check('C: in the air it says what the sticks do when let go, and which key changes it',
    step0.ok && step0.got.includes('M for'), JSON.stringify(step0.got));

  /* Hold a hover so the airtime the second step is keyed to keeps counting.
   * A proportional hold on height, from the same hooks a pilot's flight
   * log reads. If the craft cannot be kept up the step is reported as not
   * reached rather than passed. */
  await page.evaluate(`(() => {
    let prev = null; let prevT = performance.now();
    const hold = () => {
      const g = window.__ground();
      const now = performance.now();
      const vz = prev == null ? 0 : (g.above - prev) / Math.max(0.001, (now - prevT) / 1000);
      prev = g.above; prevT = now;
      const thr = Math.min(0.85, Math.max(0.25, 0.5 + 0.14 * (6 - g.above) - 0.07 * vz));
      window.__stick(0, 0, 0, thr);
      window.__hoverFrame = requestAnimationFrame(hold);
    };
    hold();
    return 1;
  })()`);
  const step1 = await bannerIs(page, textOf('freestyle', 1, KEYS), 150000);
  check('C: after ten seconds of airtime the second step comes up, and it is about starting again',
    step1.ok && step1.got.includes('start'), JSON.stringify(step1.got));
  await page.until('window.__ui.guided === false', 150000).catch(() => {});
  const done = await state(page);
  check('C: after twenty two the guide has gone', done.guided === false, JSON.stringify(done.guided));
  await page.evaluate('cancelAnimationFrame(window.__hoverFrame); window.__stick(), 1');
});

/* ---- D: a five inch veteran meets the whoop ----------------------------- */

const VETERAN = { hasFlown: true, map: 'custom' };

await scenario('D veteran meets the whoop', {
  url: WHOOP_LINK, settings: VETERAN, keys: { ...WHOOP_ROOM, [FIVE_LAP]: '123456' },
}, async (page) => {
  await launched(page);
  const s0 = await state(page);
  const pre = await bannerIs(page, 'Hold W to take off\nThe green gate starts your lap');
  check('D: and the first room they fly gets the room guide, not the track one',
    s0.guided === 'whoop' && pre.ok, `${s0.guided} ${JSON.stringify(pre.got)}`);
  check('D: the lap on file marked the track as had, the room is marked now it is on the glass',
    s0.flags === 'TTF' && s0.stored === 'TTF', `flags ${s0.flags}, stored ${s0.stored}`);
});

await scenario('D2 veteran, the track they know', {
  url: FIVE_LINK, settings: VETERAN, keys: { ...FIVE_TRACK, [FIVE_LAP]: '123456' },
}, async (page) => {
  await launched(page);
  const s0 = await state(page);
  const pre = await bannerIs(page, 'Throttle up to take off\nThe green gate starts your lap');
  check('D2: a veteran flying the kind they know is told nothing they have not been told',
    s0.guided === false && pre.ok, `${s0.guided} ${JSON.stringify(pre.got)}`);
  check('D2: and no flag is written on their behalf beyond what the loader read', s0.flags === 'TFF', s0.flags);
});

/* ---- E: a newcomer on a phone ------------------------------------------- */

await scenario('E phone, whoop room by link', {
  url: WHOOP_LINK, settings: NEWCOMER, keys: WHOOP_ROOM, touch: true, width: 844, height: 390,
}, async (page) => {
  await launched(page);
  const s0 = await state(page);
  const pre = await bannerIs(page, 'Push the left plate up to take off\nThe green gate starts your lap');
  check('E: on glass the banner names the plate, not a key', s0.guided === 'whoop' && pre.ok,
    `${s0.guided} ${JSON.stringify(pre.got)}`);
});

/* ---- F: ?guide=1 -------------------------------------------------------- */

await scenario('F guide=1 on a profile that has had them', {
  url: `${FIVE_LINK}&guide=1`,
  settings: { hasFlown: true, map: 'custom', guidedRace: true, guidedWhoop: true, guidedFreestyle: true },
  keys: FIVE_TRACK,
}, async (page) => {
  await launched(page);
  const s0 = await state(page);
  const pre = await bannerIs(page, 'Hold W to take off\nThe green gate starts your lap');
  check('F: the guides are back for a profile that had them all', s0.guided === 'race' && pre.ok,
    `${s0.guided} ${JSON.stringify(pre.got)}`);
  check('F: the other two are cleared too, ready for their kinds', s0.flags === 'TFF', s0.flags);
  const url = await page.evaluate('location.search');
  check('F: and the address no longer asks for it, so a reload is only a reload', !/guide=/.test(url), url);
});

/* ---- G: the title's own First flight row -------------------------------- */

await scenario('G the First flight row', { url: '/index.html', settings: NEWCOMER, keys: FIVE_TRACK }, async (page) => {
  await page.until("window.__shellReady === true && window.__map().ready === true", 150000);
  await page.evaluate("(() => { const ui = window.__ui; ui.craftGate = false; ui.mode = 'race'; ui.show('title'); return 1; })()");
  const before = await state(page);
  check('G: it is a first run, on the title, with nothing armed', before.firstRun === true && before.guided === false,
    JSON.stringify(before));
  await page.evaluate("window.__ui.act('firstflight'), 1");
  await launched(page);
  const s0 = await state(page);
  const pre = await bannerIs(page, 'Hold W to take off\nThe green gate starts your lap');
  check('G: the row arms the guide for the kind it launches, and the banner names the key',
    s0.guided === 'race' && pre.ok, `${s0.guided} ${JSON.stringify(pre.got)}`);
});

/* ---- report ------------------------------------------------------------- */

await sleep(10);
const w = Math.max(...rows.map((r) => r[0].length));
console.log('\nfirstflight-check: the first flight guide in the shell, through the doors a newcomer uses\n');
for (const [name, status, detail] of rows) {
  console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} checks clean`);
process.exit(failed === 0 ? 0 : 1);
