/*
 * seat-check.js: each aircraft's own settings and its own "Your edits" in
 * the real shell, in headless Chromium.
 *
 * scripts/seat-selftest.js holds the settings rules against a stub browser
 * in a second. What it cannot see is the shell: the ?craft= link the track
 * builder's Fly button writes, and which dump the compiled module is flying
 * after a change of aircraft, which src/main.js decides. This drives both
 * through the page a pilot gets.
 *
 *   bug-ddfe1c6d  a five inch on 95 degrees of lens and 35 of tilt, opened
 *                 through ?map=built&craft=5inch, came back on 85 and 30,
 *                 and did again at every reload, because the address keeps
 *                 the craft.
 *   bug-693b9ed4  a Save on the whoop's Flight controller screen took the
 *                 five inch's Your edits off its Tune row.
 *
 * Usage:
 *   npm run check:seat
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const rows = [];
let failed = 0;

function check(name, ok, detail) {
  rows.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) {
    failed += 1;
  }
}

/*
 * A five inch pilot who has loaded the shell before, so the blob is marked,
 * on the whoop's stock lens and their own tilt. Seeded ONCE per tab, not on
 * every document, or the reload below would be a reload of the seed.
 */
const SEED = `try {
  if (!sessionStorage.getItem('seat-seeded')) {
    sessionStorage.setItem('seat-seeded', '1');
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify({
      graphics: 'low', graphicsAuto: false, airframe: '5inch', seatedFor: '5inch',
      airframeAsked: true, cameraFov: 95, cameraAngle: 35,
    }));
  }
} catch (e) { /* Storage refused. The checks below will say so. */ }`;

const STATE = `(() => {
  const s = window.__ui.settings;
  return {
    airframe: s.airframe, fov: s.cameraFov, tilt: s.cameraAngle, tune: s.tune,
    loaded: window.__tune().id, pRoll: Number(window.__pids().module.p_roll),
  };
})()`;

/* The Flight controller screen's Save, with p_roll set by hand: what a
 * pilot does on the PID page, through the same callback the Save row calls. */
function saveDump(page, pRoll) {
  return page.evaluate(`(async () => {
    const d = await import('/src/fc/dump.js');
    window.__ui.onFcOpen('pid');
    let draft = window.__ui.fc.draft;
    draft = d.setCliValue(draft, 'simplified_pids_mode', 'OFF');
    draft = d.setCliValue(draft, 'p_roll', ${pRoll});
    window.__ui.onFcSave(draft, { exit: true });
    return true;
  })()`);
}

/* The Aircraft row: seatAirframe, then the save and apply every row ends in. */
function seat(page, id) {
  return page.evaluate(`(async () => {
    const m = await import('/src/ui/ui.js');
    m.seatAirframe(window.__ui.settings, ${JSON.stringify(id)});
    window.__ui.writeSettings();
    return true;
  })()`);
}

/* Until the module is flying what the menu says, or the timeout says so. */
async function settled(page, airframe, loaded, pRoll) {
  try {
    await page.until(`(() => { const s = ${STATE};
      return s.airframe === ${JSON.stringify(airframe)} && s.loaded === ${JSON.stringify(loaded)}
        && s.pRoll === ${pRoll}; })()`, 20000);
  } catch (e) {
    /* Reported by the check that reads the state next. */
  }
  return JSON.parse(JSON.stringify(await page.evaluate(STATE)));
}

function say(s) {
  return `${s.airframe} ${s.fov}/${s.tilt} tune ${s.tune} flying ${s.loaded} p_roll ${s.pRoll}`;
}

async function main() {
  const page = await openPage({ root, url: '/index.html?map=built&craft=5inch', seed: [SEED] });
  try {
    await page.until('window.__shellReady === true', 90000);
    let s = await page.evaluate(STATE);
    check('bug-ddfe1c6d: through the builder\'s ?craft=5inch link, the five inch keeps 95/35',
      s.fov === 95 && s.tilt === 35, say(s));
    await page.evaluate('location.reload()');
    await page.sleep(500);
    await page.until('window.__shellReady === true', 90000);
    s = await page.evaluate(STATE);
    check('and keeps it over a reload of the same address',
      s.fov === 95 && s.tilt === 35 && /craft=5inch/.test(await page.evaluate('location.search')), say(s));

    await saveDump(page, 55);
    s = await settled(page, '5inch', 'custom', 55);
    check('a Save on the five inch flies its edits', s.loaded === 'custom' && s.pRoll === 55, say(s));

    await seat(page, 'whoop65');
    /* The whoop's stock is its own since 2026-10-09 (configs/airframes.js,
     * defaultTune), the maker's 1S tune, whose p_roll is 33
     * (configs/whoop-champion.diff), not the five inch's 45. */
    s = await settled(page, 'whoop65', 'whoop-champion', 33);
    check('the whoop has no edits of its own yet, so it flies the stock tune',
      s.tune === 'whoop-champion' && s.loaded === 'whoop-champion' && s.pRoll === 33, say(s));

    await saveDump(page, 77);
    s = await settled(page, 'whoop65', 'custom', 77);
    check('a Save on the whoop flies the whoop\'s edits', s.loaded === 'custom' && s.pRoll === 77, say(s));

    await seat(page, '5inch');
    s = await settled(page, '5inch', 'custom', 55);
    check('bug-693b9ed4: back on the five inch, its own edits fly, not the whoop\'s',
      s.tune === 'custom' && s.loaded === 'custom' && s.pRoll === 55, say(s));
    check('bug-ddfe1c6d: and its own camera came back with it', s.fov === 95 && s.tilt === 35, say(s));

    /* Your edits on both: the tune id does not change, only whose dump. */
    await seat(page, 'whoop65');
    s = await settled(page, 'whoop65', 'custom', 77);
    check('Your edits to Your edits: the whoop flies its own dump, not the five inch\'s',
      s.loaded === 'custom' && s.pRoll === 77, say(s));

    /* The address still says craft=5inch, as the pilot's does, so a reload
     * seats the five inch: the link names it. What it must not do any more
     * is cost either machine anything. */
    await page.evaluate('location.reload()');
    await page.sleep(500);
    await page.until('window.__shellReady === true', 90000);
    s = await settled(page, '5inch', 'custom', 55);
    check('a reload of the link seats the five inch it names, on its own edits and camera',
      s.loaded === 'custom' && s.pRoll === 55 && s.fov === 95 && s.tilt === 35, say(s));

    await seat(page, 'whoop65');
    await settled(page, 'whoop65', 'custom', 77);
    await page.evaluate('location.href = "/index.html?map=built"');
    await page.sleep(500);
    await page.until('window.__shellReady === true', 90000);
    s = await settled(page, 'whoop65', 'custom', 77);
    check('and an address with no craft boots the whoop on its own edits',
      s.airframe === 'whoop65' && s.loaded === 'custom' && s.pRoll === 77, say(s));
  } finally {
    await page.close();
  }

  const w = Math.max(...rows.map((r) => r[0].length));
  console.log('seat-check: each aircraft\'s own settings and edits, in the shell\n');
  for (const [name, status, detail] of rows) {
    console.log(`${status === 'ok' ? ' ok ' : 'FAIL'}  ${name.padEnd(w)}  ${detail}`);
  }
  console.log(`\n${rows.length - failed} of ${rows.length} checks clean`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
