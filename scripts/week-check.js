/*
 * week-check.js: the track of the week on the Fly solo page (the board's
 * src/week.js, the owner's pick of 2026-11-05, idea 1 of the sweep).
 *
 * The board answers inside the page: /api/week names a one gate track with
 * one lap this week, and the track and its lap are served as a board serves
 * them. The check counts the asks (once a session at most), opens the Fly
 * solo page and asks for the card and its words, presses it, and asks what was seated and flown: the five inch, the
 * week's track, the race mode, and the leader's lap armed as the ghost. And
 * with no board, no card and no error.
 *
 * Not part of `npm run verify`. Run it as `npm run check:week`.
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = 'http://127.0.0.1:3100';

const TRACK = {
  schemaVersion: 1,
  id: 'trk-3eec0001',
  name: 'Week Field',
  trackClass: 'full',
  createdUtc: '2026-01-01T00:00:00Z',
  modifiedUtc: '2026-01-01T00:00:00Z',
  field: { width: 50, depth: 50, gridSize: 1 },
  settings: { tangentScale: 0.74, minCurveRadius: 2.5, samplesPerSegment: 48 },
  branding: { logo: null, logoName: '' },
  elements: [
    {
      id: 'el-1', type: 'gate', name: '0', position: { x: 10, y: 10, z: 0 }, yaw: 0, pitch: 0,
      yawOverridden: false, dims: { levels: 1, sillH: 0, clearW: 1.524, clearH: 1.524, levelPitch: 1.557401 },
    },
    {
      id: 'el-2', type: 'startPads', name: 'Grid', position: { x: 5, y: 5, z: 0 }, yaw: 0, pitch: 0,
      yawOverridden: false, dims: { pads: 2, spacing: 1.5, padSize: 0.6 },
    },
  ],
  sequence: [
    { id: 'sq-1', elementId: 'el-1', apertureIndex: 0, entry: -1, passSide: null, clearance: null, overridden: false },
  ],
};
const AJAX = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/ghost-tm-aae280e5.json'), 'utf8'));

function boardSeed(on) {
  const week = {
    week: 2918, startsUtc: '2026-11-02T00:00:00.000Z', endsUtc: '2026-11-09T00:00:00.000Z',
    track: { id: TRACK.id, name: TRACK.name, author: 'week-check', trackClass: 'full' },
    times: [{ id: AJAX.id, name: 'Ajax', lapMs: AJAX.lapMs, hasGhost: true }],
  };
  return `(() => {
    const on = ${JSON.stringify(on)};
    const board = ${JSON.stringify(BOARD)};
    const base = '/api/tracks/' + ${JSON.stringify(TRACK.id)};
    const doc = ${JSON.stringify({ id: TRACK.id, name: TRACK.name, author: 'week-check', document: TRACK })};
    const week = ${JSON.stringify(week)};
    const ghost = ${JSON.stringify(AJAX)};
    window.__weekAsks = 0;
    const answer = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
      status, headers: { 'content-type': 'application/json' },
    }));
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, opts = {}) => {
      const url = String(input && input.url ? input.url : input);
      if (!url.startsWith(board)) {
        return realFetch(input, opts);
      }
      if (!on) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      const path = url.slice(board.length);
      if (path === '/api/week') { window.__weekAsks += 1; return answer(week); }
      if (path === base + '/document') return answer(doc);
      if (path === base) return answer({ id: doc.id, times: [{ id: ghost.id, name: ghost.name, lapMs: ghost.lapMs, hasGhost: true }] });
      if (path === base + '/times/' + ghost.id + '/ghost') return answer(ghost);
      return answer({ error: 'not found' }, 404);
    };
    navigator.sendBeacon = () => true;
    try {
      const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
      s.graphics = 'low'; s.graphicsAuto = false; s.airframeAsked = true; s.airframe = 'whoop65';
      localStorage.setItem('webfpv.settings.v3', JSON.stringify(s));
    } catch (e) { /* defaults */ }
  })();`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (what, ok, got) => {
  fails += ok ? 0 : 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}: ${got}`);
};

async function run(on) {
  const page = await openPage({ root: ROOT, width: 1280, height: 720, url: `/index.html?board=${encodeURIComponent(BOARD)}`, seed: [boardSeed(on)] });
  try {
    await page.until('!!window.__shellReady', 120000);
    const asksBefore = await page.evaluate('window.__weekAsks');
    await page.evaluate("(() => { window.__ui.act('gate-solo'); return 1; })()");
    await sleep(1500);
    const card = await page.evaluate("(() => { const c = document.querySelector('.gate-card-week'); return c ? c.textContent : null; })()");
    if (!on) {
      check('no board: no card', card === null, String(card));
      const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to fetch/.test(e));
      check('no board: no error', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
      return;
    }
    check('the board is asked once at most, and only for the week', asksBefore <= 1 && (await page.evaluate('window.__weekAsks')) <= 1, `asked ${asksBefore} before the page, ${await page.evaluate('window.__weekAsks')} in all`);
    check('the card is on the Fly solo page', Boolean(card), String(card).slice(0, 160));
    check('it names the track and the leader', /Week Field/.test(card || '') && /Ajax leads/.test(card || ''), '');
    await page.evaluate("(() => { window.__ui.act('week-fly'); return 1; })()");
    await page.until("(() => { const m = window.__map && window.__map(); return !!(m && m.ready && m.id === 'custom'); })()", 120000);
    await sleep(2500);
    const s = await page.evaluate('(() => ({ airframe: window.__ui.settings.airframe, map: window.__ui.settings.map, mode: window.__ui.mode, screen: window.__ui.screen, ghost: window.__ghost() }))()');
    check('the five inch is seated', s.airframe === '5inch', s.airframe);
    check('the week\'s track is seated as a race', s.map === 'custom' && s.mode === 'race', `${s.map} ${s.mode}`);
    check('the leader\'s lap is the ghost', s.ghost.choice === `board:${AJAX.id}`, s.ghost.choice);
    check('and it is in flight or at the line', s.screen === 'flight' || s.screen === 'launch', s.screen);
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    check('no errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  } finally {
    await page.close();
  }
}

await run(true);
await run(false);
console.log(`\nweek-check: ${fails} failed`);
process.exit(fails);
