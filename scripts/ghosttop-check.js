/*
 * ghosttop-check.js: Ghost, Board top 3 (the owner's pick of 2026-11-05,
 * idea 5 of the sweep).
 *
 * A one gate track whose board answers inside the page (the seed is
 * tests/replay-test.js's, with three laps), flown with Ghost set to Board
 * top 3: the three laps are fetched fastest first, the fastest is the one
 * chased, the other two fly on their own rigs once the lap starts, and the
 * draw calls they add are printed, because the latency rule wants the
 * number and a translucent craft is not free. Then Ghost off parks both.
 * Then the three arriving in the middle of a lap, held for the next lap
 * start (bugs.md BUG-9), and Board top 3 on a track with no ghosts on the
 * board, where the pilot's own best flies (BUG-8).
 *
 * Not part of `npm run verify`. Run it as `npm run check:ghosttop`.
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
import { PILOT } from './lib/pilot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = 'http://127.0.0.1:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRACK = {
  schemaVersion: 1,
  id: 'trk-top30001',
  name: 'Top Three',
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
/* Three laps off the one recording, slowest listed first so the sort is
 * what puts them in order. */
const GHOSTS = [
  { ...AJAX, id: 'tm-00000003', name: 'Third', lapMs: AJAX.lapMs + 300 },
  { ...AJAX, id: 'tm-00000001', name: 'First', lapMs: AJAX.lapMs },
  { ...AJAX, id: 'tm-00000002', name: 'Second', lapMs: AJAX.lapMs + 100 },
];

/* hold: the ghosts are not answered until the page sets window.__releaseGhosts,
 * so they can arrive in the middle of a lap. ghosts: false lists the times
 * with no recording, a track the board has no ghosts for. */
function boardSeed({ hold = false, ghosts = true } = {}) {
  const track = { id: TRACK.id, name: TRACK.name, author: 'ghosttop-check', document: TRACK };
  const listing = { id: TRACK.id, times: GHOSTS.map((g) => ({ id: g.id, name: g.name, lapMs: g.lapMs, hasGhost: ghosts })) };
  return `(() => {
    const board = ${JSON.stringify(BOARD)};
    const base = '/api/tracks/' + ${JSON.stringify(TRACK.id)};
    const track = ${JSON.stringify(track)};
    const listing = ${JSON.stringify(listing)};
    const ghosts = ${JSON.stringify(GHOSTS)};
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
        return answer(listing);
      }
      const ghost = ghosts.find((g) => path === base + '/times/' + g.id + '/ghost');
      if (!ghost) {
        return answer({ error: 'not found' }, 404);
      }
      window.__ghostAsks = (window.__ghostAsks || 0) + 1;
      if (!${JSON.stringify(hold)}) {
        return answer(ghost);
      }
      return new Promise((resolve) => {
        const wait = () => (window.__releaseGhosts ? resolve(answer(ghost)) : setTimeout(wait, 50));
        wait();
      });
    };
    navigator.sendBeacon = () => true;
    try {
      const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
      s.graphics = 'low'; s.graphicsAuto = false; s.airframeAsked = true; s.ghost = 'top3';
      localStorage.setItem('webfpv.settings.v3', JSON.stringify(s));
    } catch (e) { /* the run boots with Best */ }
  })();`;
}

let fails = 0;
const check = (what, ok, got) => {
  fails += ok ? 0 : 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}: ${got}`);
};

/* Through the timing gate, from a settle before it, which starts a lap
 * (and on a one gate track ends the one before). Slower than the first
 * scenario's pass, 4 m/s over 2.4 s: on a loaded machine the tracker's
 * error at 8 m/s reached 2.6 m, more than the gate's half width, and a
 * missed crossing is not what these scenarios are about. */
const THROUGH = `(async () => {
  const { V } = window.__vm; const g = window.__race().gates[0];
  const a = V(g.x - g.az.x * 6, g.y - g.az.y * 6, g.z - g.az.z * 6);
  const b = V(g.x + g.az.x * 6, g.y + g.az.y * 6, g.z + g.az.z * 6);
  const hd = Math.atan2(g.az.x, g.az.z);
  await window.__settle(a, hd, 1.2);
  await window.__fly(window.__ramp(a, b, 2.4, 4), { heading: hd, extraMs: 400 });
  return 1;
})()`;
/* Hold the craft where it is, the integrator frozen, so a lap stays running
 * however long a wait is on a loaded machine: a craft left to fall would
 * crash, and the auto reset would throw the lap away. */
const HOLD = '(() => { const c = window.__craftState(); return window.__holdCraft(c.worldX, Math.max(c.worldY, 1.5), c.worldZ, 0) ? 1 : 0; })()';

async function boot(opts) {
  const page = await openPage({
    root: ROOT, width: 640, height: 360, url: `/index.html?map=custom&share=${TRACK.id}&board=${BOARD}`, seed: [boardSeed(opts)],
  });
  await page.until('!!window.__shellReady', 120000);
  await page.evaluate("(() => { const ui = window.__ui; ui.onAction('fly', ui.settings); return 1; })()");
  await page.until('(() => { const m = window.__map && window.__map(); return !!(m && m.ready); })()', 120000);
  await page.until("window.__ui.screen === 'flight'", 60000).catch(() => {});
  return page;
}

function errorsOf(page) {
  return page.errors.filter((e) => !e.includes('net::ERR_CONNECTION_REFUSED'));
}

/*
 * bugs.md BUG-9: the three laps arrive in the middle of a lap. They used to
 * be armed there and then, so the lap's gaps were read against two laps
 * and the extra rigs popped in at mid lap time. They are held for the next
 * lap start.
 */
async function midLap() {
  console.log('\nthe board top 3 arrive in the middle of a lap');
  const page = await boot({ hold: true });
  try {
    await page.until('window.__ghost().boardTimes === 3 && (window.__ghostAsks || 0) >= 1', 60000);
    await sleep(3000);
    await page.evaluate(`(async () => { ${PILOT}\n return 1; })()`);
    await page.evaluate(THROUGH);
    await page.evaluate(HOLD);
    const running = (await page.evaluate('window.__race().lapStartMs')) != null;
    await page.evaluate('(() => { window.__releaseGhosts = true; return 1; })()');
    await page.until('(() => { const g = window.__ghost(); return g.pendingTop === 3 || g.top.length === 3; })()', 60000);
    const g0 = await page.evaluate('window.__ghost()');
    check('a lap is running when they arrive', running && (await page.evaluate('window.__race().lapStartMs')) != null, `lap ${running}`);
    check('and they are held for the next lap, not armed in this one', g0.pendingTop === 3 && g0.top.length === 0
      && g0.extrasVisible.every((v) => !v), JSON.stringify({ pending: g0.pendingTop, top: g0.top, armed: g0.armedMs, extras: g0.extrasVisible }));
    await page.evaluate(THROUGH);
    await page.evaluate(HOLD);
    const g1 = await page.evaluate('window.__ghost()');
    check('the next lap start arms them, the fastest chased', g1.top.length === 3 && g1.pendingTop === 0 && g1.armedMs === g1.top[0],
      JSON.stringify({ top: g1.top, armed: g1.armedMs }));
    const errs = errorsOf(page);
    check('no errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  } finally {
    await page.close();
  }
}

/*
 * bugs.md BUG-8: Board top 3 on a track the board has no ghosts for flew
 * nothing at all, while the gap still read against the pilot's best. The
 * best flies instead.
 */
async function noGhosts() {
  console.log('\nBoard top 3 on a track with no ghosts on the board');
  const page = await boot({ ghosts: false });
  try {
    await sleep(5000);
    await page.evaluate(`(async () => { ${PILOT}\n return 1; })()`);
    await page.evaluate(THROUGH);
    await page.evaluate(HOLD);
    const first = await page.evaluate('window.__race().lapStartMs');
    await sleep(500);
    await page.evaluate(THROUGH);
    await page.evaluate(HOLD);
    console.log(`  (the first crossing started a lap: ${first != null}; laps on record: ${await page.evaluate('window.__race().laps.length')})`);
    const g = await page.evaluate('window.__ghost()');
    check('a lap is flown and the next one running', g.bestMs != null && (await page.evaluate('window.__race().lapStartMs')) != null, `best ${g.bestMs}`);
    check('the pilot\'s own best flies as the ghost', g.choice === 'top3' && g.armed && g.armedMs === g.bestMs && g.top.length === 0,
      JSON.stringify({ choice: g.choice, armed: g.armed, armedMs: g.armedMs, bestMs: g.bestMs }));
    const errs = errorsOf(page);
    check('no errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('the board top 3, answered at once');
  const page = await boot({});
  try {
    await page.until('window.__ghost().top.length === 3', 60000);
    const g0 = await page.evaluate('window.__ghost()');
    check('three laps fetched, fastest first', JSON.stringify(g0.top) === JSON.stringify([...g0.top].sort((a, b) => a - b)), JSON.stringify(g0.top));
    check('the fastest is the one chased', g0.armedMs === g0.top[0], `armed ${g0.armedMs}`);
    await sleep(3000);
    await page.evaluate(`(async () => { ${PILOT}\n return 1; })()`);
    const callsBefore = (await page.evaluate('window.__renderStats()')).calls;
    /* Through the timing gate, which starts the lap the ghosts fly. */
    await page.evaluate(`(async () => {
      const { V } = window.__vm; const g = window.__race().gates[0];
      const a = V(g.x - g.az.x * 6, g.y - g.az.y * 6, g.z - g.az.z * 6);
      const b = V(g.x + g.az.x * 6, g.y + g.az.y * 6, g.z + g.az.z * 6);
      const hd = Math.atan2(g.az.x, g.az.z);
      await window.__settle(a, hd, 1.2);
      await window.__fly(window.__ramp(a, b, 1.6, 8), { heading: hd, extraMs: 700 });
      return 1;
    })()`);
    const g1 = await page.evaluate('window.__ghost()');
    const callsDuring = (await page.evaluate('window.__renderStats()')).calls;
    check('the lap is running', (await page.evaluate('window.__race().lapStartMs')) != null, 'lap started');
    check('the chased ghost is in the air', g1.visible, `visible ${g1.visible}`);
    check('the second and third fly beside it', g1.extrasVisible.length === 2 && g1.extrasVisible.every(Boolean), JSON.stringify(g1.extrasVisible));
    console.log(`  one ghost rig is ${g1.rigDraws} draws (meshes and its tag); the two extra rigs add ${2 * g1.rigDraws} while in the air (frame total with all three: ${callsDuring}, on the intro: ${callsBefore})`);
    await page.evaluate("(() => { window.__ui.settings.ghost = 'off'; return 1; })()");
    await page.evaluate("(() => { const ui = window.__ui; ui.onAction('pause', ui.settings); ui.show('paused'); return 1; })()");
    await sleep(300);
    await page.evaluate("(() => { const ui = window.__ui; ui.onAction('resume', ui.settings); return 1; })()");
    const errs = page.errors.filter((e) => !e.includes('net::ERR_CONNECTION_REFUSED'));
    check('no errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  } finally {
    await page.close();
  }
  await midLap();
  await noGhosts();
  console.log(`\nghosttop-check: ${fails} failed`);
  process.exit(fails);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
