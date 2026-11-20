#!/usr/bin/env node
/*
 * review-check.js: the review, opened from the real pause menu.
 *
 * scripts/review-splits-selftest.js proves the arithmetic. This proves the
 * shell hands it the right two laps: it flies two laps of the one gate
 * track scripts/review-trace-check.js flies, the second slower than the
 * first and chasing it as the session's best, pauses, presses the pause
 * menu's Review row, and reads the panel back. The second lap lost time to
 * the first, so its one section and the lap are red, by the difference of
 * the race's own two lap times.
 *
 * It also asserts the panel owns the keys while it is open: down moves its
 * own selection and not the menu's cursor behind it, and Escape closes it
 * and leaves the pause menu where it was.
 *
 * `REVIEW_SHOTS=<dir> node scripts/review-check.js` also leaves a picture
 * of the open panel there.
 *
 * Minutes of wall clock: it boots the whole shell. Not part of verify.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deltaText, seconds, toneOf } from '../src/review/splits.js';
import { openPage } from '../tests/lib/page.js';
import { PILOT } from './lib/pilot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = 'http://127.0.0.1:3100';
const SHOTS = process.env.REVIEW_SHOTS || '';
/* The window, WIDTHxHEIGHT, for a look at the panel on a phone. */
const [WIDTH, HEIGHT] = (process.env.REVIEW_SIZE || '960x600').split('x').map(Number);

const TRACK = {
  schemaVersion: 1,
  id: 'trk-review002',
  name: 'Review Panel Check',
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

/* The board, answered inside the page: the track, and no times on it. The
 * ghost is the session's best, so the second lap chases the first. */
const SEED = `(() => {
  const board = ${JSON.stringify(BOARD)};
  const base = '/api/tracks/' + ${JSON.stringify(TRACK.id)};
  const track = ${JSON.stringify({ id: TRACK.id, name: TRACK.name, author: 'review-check', document: TRACK })};
  const answer = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  }));
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, opts = {}) => {
    const url = String(input && input.url ? input.url : input);
    if (!url.startsWith(board)) {
      return realFetch(input, opts);
    }
    const path = url.slice(board.length);
    if (String(opts.method || 'GET').toUpperCase() !== 'GET') {
      return answer({});
    }
    if (path === base + '/document') {
      return answer(track);
    }
    if (path === base) {
      return answer({ id: ${JSON.stringify(TRACK.id)}, times: [] });
    }
    return answer({ error: 'not found' }, 404);
  };
  navigator.sendBeacon = () => true;
  try {
    const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
    s.graphics = 'low'; s.graphicsAuto = false; s.airframeAsked = true; s.ghost = 'best';
    localStorage.setItem('webfpv.settings.v3', JSON.stringify(s));
  } catch (e) { /* the run boots with its defaults */ }
})();`;

/* Through the timing gate from a settle before it, at `speed` m/s over the
 * twelve metres either side of it, then 400 ms more. */
const through = (seconds) => `(async () => {
  const { V } = window.__vm; const g = window.__race().gates[0];
  const a = V(g.x - g.az.x * 6, g.y - g.az.y * 6, g.z - g.az.z * 6);
  const b = V(g.x + g.az.x * 6, g.y + g.az.y * 6, g.z + g.az.z * 6);
  const hd = Math.atan2(g.az.x, g.az.z);
  await window.__settle(a, hd, 1.2);
  await window.__fly(window.__ramp(a, b, ${seconds}, 12 / ${seconds}), { heading: hd, extraMs: 400 });
  return 1;
})()`;
const HOLD = '(() => { const c = window.__craftState(); return window.__holdCraft(c.worldX, Math.max(c.worldY, 1.5), c.worldZ, 0) ? 1 : 0; })()';
const PAUSE = "(() => { const ui = window.__ui; ui.onAction('pause', ui.settings); ui.show('paused'); return 1; })()";
const ROW = "(() => { const r = window.__ui.items().find((i) => i.action === 'review'); return r ? { label: r.label, note: r.note } : null; })()";

let fails = 0;
const check = (what, ok, got = '') => {
  fails += ok ? 0 : 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${got === '' ? '' : `: ${got}`}`);
};

const page = await openPage({
  root: ROOT, width: WIDTH, height: HEIGHT, url: `/index.html?map=custom&share=${TRACK.id}&board=${BOARD}`, seed: [SEED],
});
try {
  await page.until('!!window.__shellReady', 120000);
  await page.evaluate("(() => { const ui = window.__ui; ui.onAction('fly', ui.settings); return 1; })()");
  await page.until('(() => { const m = window.__map && window.__map(); return !!(m && m.ready); })()', 120000);
  await page.until("window.__ui.screen === 'flight'", 60000).catch(() => {});
  const hooked = await page.evaluate("typeof window.__reviewOpen === 'function'");
  check('the shell has a review', hooked);
  if (!hooked) {
    throw new Error('no window.__reviewOpen: this tree has no review');
  }

  await page.evaluate(PAUSE);
  const before = await page.evaluate(ROW);
  check('before any lap the pause menu has no Review row, so it is no longer than it was', before === null, JSON.stringify(before));
  await page.evaluate("(() => { window.__ui.act('review'); return 1; })()");
  const empty = await page.evaluate('window.__review()');
  check('asked for anyway with no lap, it opens and says so', empty.open && /No lap flown/.test(empty.why) && empty.rows.length === 0, JSON.stringify(empty));
  await page.tap('Escape');
  check('Escape closes it', (await page.evaluate('window.__review().open')) === false);
  await page.evaluate("(() => { const ui = window.__ui; ui.onAction('resume', ui.settings); return 1; })()");
  await page.until("window.__ui.screen === 'flight'", 10000).catch(() => {});

  await page.evaluate(`(async () => { ${PILOT}\n return 1; })()`);
  await page.evaluate(through(2.4));
  await page.evaluate(through(2.4));
  await page.evaluate(through(4.0));
  await page.evaluate(HOLD);
  const laps = await page.evaluate('window.__race().laps');
  check('two laps flown, of different times', laps.length >= 2 && Math.abs(laps[laps.length - 1] - laps[laps.length - 2]) > 20, JSON.stringify(laps));
  const first = laps[laps.length - 2];
  const second = laps[laps.length - 1];
  /* The ghost is the first lap as the ghost recorder stored it, to the
   * whole millisecond, and that is the time the review compares with.
   * The scripted pilot's laps differ from run to run, so the second can be
   * slower (red, and the ghost is still Best) or faster (green, and the
   * ghost is the previous best now). Either way is asserted. */
  const ghostMs = Math.round(first);
  const want = deltaText(second - ghostMs);
  const tone = toneOf(second - ghostMs);
  const named = second < ghostMs ? 'Previous best' : 'Best';
  console.log(`  (the second lap ${tone} against the first: ${want})`);

  await page.evaluate(PAUSE);
  await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
  const row = await page.evaluate(ROW);
  check(`the row names the last lap against the ${named.toLowerCase()}, with the difference`, Boolean(row) && row.note.includes(`against ${named} `) && row.note.includes(want), row ? row.note : 'no row');
  const cursorBefore = await page.evaluate('window.__ui.cursor');
  await page.evaluate("(() => { window.__ui.act('review'); return 1; })()");
  const s = await page.evaluate('window.__review()');
  check('pressed, the review opens', s.open === true, JSON.stringify(s));
  check('its title is the lap against the ghost it chased', s.title === `Lap ${seconds(second)} against ${named} ${seconds(ghostMs)}`, s.title);
  check('the columns are the section, you, the ghost and the difference', JSON.stringify(s.head) === '["Section","You","Ghost","Difference"]', JSON.stringify(s.head));
  check('one gate: one section, the start to the finish', s.rows.length === 1 && s.rows[0].cells[0] === 'The start to the finish', JSON.stringify(s.rows));
  check(`the section and the lap are ${tone}, by the difference of the two lap times`,
    s.rows[0].tone === tone && s.total.tone === tone && s.total.cells[3] === want && s.rows[0].cells[3] === want,
    `${JSON.stringify(s.rows[0])} ${JSON.stringify(s.total)} want ${want}`);
  check('the lap row has both times, rounded as the lap clock rounds', s.total.cells[1] === `${seconds(second)} s` && s.total.cells[2] === `${seconds(ghostMs)} s`, JSON.stringify(s.total.cells));
  const shown = await page.evaluate("(() => { const r = document.querySelector('#review .review-total .review-delta'); return r ? getComputedStyle(r).color : ''; })()");
  const colour = { lost: 'rgb(255, 107, 94)', gained: 'rgb(125, 255, 180)' }[tone];
  check(`${tone === 'lost' ? 'red' : 'green'} on screen`, shown === colour, shown);
  /* The section beside the table, from above and from the side: both
   * lines drawn through it, and the gate seen edge on from the side. Then
   * the pixels, so a line drawn off the picture cannot pass: amber for
   * yours and blue for the ghost's, on both canvases. */
  const d = s.drawn;
  check('the section is drawn from above with both lines', Boolean(d) && d.top.lap > 10 && d.top.ref > 3, JSON.stringify(d));
  check('and from the side, with the gate', Boolean(d) && d.side.lap > 10 && d.side.ref > 3 && d.side.gates >= 1, JSON.stringify(d));
  const inks = await page.evaluate(`(() => {
    const count = (sel) => {
      const cv = document.querySelector(sel);
      const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let amber = 0; let blue = 0;
      for (let i = 0; i < px.length; i += 4) {
        const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
        if (r > 230 && g > 150 && g < 200 && b < 100) amber += 1;
        if (r < 160 && g > 190 && b > 230) blue += 1;
      }
      return { amber, blue, w: cv.width, h: cv.height };
    };
    return { top: count('#review .review-top'), side: count('#review .review-side') };
  })()`);
  check('your line and the ghost\'s are on both pictures', inks.top.amber > 50 && inks.top.blue > 50 && inks.side.amber > 50 && inks.side.blue > 50, JSON.stringify(inks));

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    const shot = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    writeFileSync(join(SHOTS, 'review.png'), Buffer.from(shot.data, 'base64'));
    console.log(`  (picture: ${join(SHOTS, 'review.png')})`);
  }

  await page.tap('ArrowDown');
  check('down is the panel\'s, not the menu\'s', (await page.evaluate('window.__ui.cursor')) === cursorBefore && (await page.evaluate('window.__review().open')) === true);
  await page.tap('Escape');
  check('Escape closes it and leaves the pause menu up', (await page.evaluate('window.__review().open')) === false && (await page.evaluate('window.__ui.screen')) === 'paused');
  await page.evaluate("(() => { window.__ui.act('review'); return 1; })()");
  await page.evaluate("(() => { const ui = window.__ui; ui.onAction('resume', ui.settings); return 1; })()");
  await page.until("window.__ui.screen === 'flight'", 10000).catch(() => {});
  check('resuming by another route takes it away', (await page.evaluate('window.__review().open')) === false);

  const errs = page.errors.filter((e) => !e.includes('net::ERR_CONNECTION_REFUSED'));
  check('no errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
} catch (e) {
  check('the run finished', false, e.message);
} finally {
  await page.close();
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
