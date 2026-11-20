#!/usr/bin/env node
/*
 * review-trace-check.js: the review's lap trace, recorded by the real shell.
 *
 * scripts/review-trace-selftest.js proves src/review/trace.js with a pretend
 * clock. It cannot see the places src/main.js calls it from, and those are
 * where this can go wrong without a single wrong number in the module: fed
 * from the wrong state, on the wrong clock, in the wrong frame, or cut at
 * the wrong lap. So this flies a lap in headless Chromium, on the one gate
 * track scripts/ghosttop-check.js flies, and reads the trace the shell made
 * of it.
 *
 * The strongest thing it asserts is against the ghost. The ghost recorder
 * has recorded the same lap for months and is checked on its own. If the
 * trace has the same duration and its positions lie on the ghost's path,
 * then the trace is on the race's clock and in the scene's frame, which are
 * the two things nothing else here can show.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { F, TRACE_FIELDS, TRACE_LEAD_MS, TRACE_STEP_MS, TraceLap } from '../src/review/trace.js';
import { decodeGhost, ghostFromBase64 } from '../src/share/ghostdata.js';
import { openPage } from '../tests/lib/page.js';
import { PILOT } from './lib/pilot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = 'http://127.0.0.1:3100';

const TRACK = {
  schemaVersion: 1,
  id: 'trk-review001',
  name: 'Review Check',
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

/* The board, answered inside the page: the track, and no times on it. */
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

/* Through the timing gate from a settle before it, as ghosttop-check does:
 * 4 m/s over 2.4 s, then 400 ms more. The first pass starts a lap and the
 * second finishes it. */
const THROUGH = `(async () => {
  const { V } = window.__vm; const g = window.__race().gates[0];
  const a = V(g.x - g.az.x * 6, g.y - g.az.y * 6, g.z - g.az.z * 6);
  const b = V(g.x + g.az.x * 6, g.y + g.az.y * 6, g.z + g.az.z * 6);
  const hd = Math.atan2(g.az.x, g.az.z);
  await window.__settle(a, hd, 1.2);
  await window.__fly(window.__ramp(a, b, 2.4, 4), { heading: hd, extraMs: 400 });
  return 1;
})()`;
const HOLD = '(() => { const c = window.__craftState(); return window.__holdCraft(c.worldX, Math.max(c.worldY, 1.5), c.worldZ, 0) ? 1 : 0; })()';

let fails = 0;
const check = (what, ok, got = '') => {
  fails += ok ? 0 : 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${got === '' ? '' : `: ${got}`}`);
};

const page = await openPage({
  root: ROOT, width: 640, height: 360, url: `/index.html?map=custom&share=${TRACK.id}&board=${BOARD}`, seed: [SEED],
});
try {
  await page.until('!!window.__shellReady', 120000);
  await page.evaluate("(() => { const ui = window.__ui; ui.onAction('fly', ui.settings); return 1; })()");
  await page.until('(() => { const m = window.__map && window.__map(); return !!(m && m.ready); })()', 120000);
  await page.until("window.__ui.screen === 'flight'", 60000).catch(() => {});

  const hooked = await page.evaluate("typeof window.__reviewTrace === 'function'");
  check('the shell has a review trace', hooked);
  if (!hooked) {
    throw new Error('no window.__reviewTrace: this tree records no trace');
  }
  const start = await page.evaluate('window.__reviewTrace()');
  check('the recorder is on from the first frame, with no lap yet', start.on === true && start.best === null, JSON.stringify(start));

  await page.evaluate(`(async () => { ${PILOT}\n return 1; })()`);
  await page.evaluate(THROUGH);
  const running = (await page.evaluate('window.__race().lapStartMs')) != null;
  check('the first pass starts a lap', running);
  await page.evaluate(THROUGH);
  await page.evaluate(HOLD);

  const laps = await page.evaluate('window.__race().laps.length');
  const held = await page.evaluate('window.__reviewTrace()');
  check('the second pass finishes it', laps >= 1, `${laps} laps`);
  check('and the shell has a trace of it, as the newest and the best', Boolean(held.best) && Boolean(held.last), JSON.stringify(held.best));

  const got = await page.evaluate("window.__reviewTraceLap('best')");
  const ghostB64 = await page.evaluate("window.__ghostExport('best')");
  check('both recorders have the lap', Boolean(got) && typeof ghostB64 === 'string');
  if (got && typeof ghostB64 === 'string') {
    const lap = new TraceLap({ ...got, rateHz: 100, worldScale: 1, data: Float32Array.from(got.data) });
    check('the samples agree with the count', got.data.length === got.count * TRACE_FIELDS);
    const ghost = decodeGhost(ghostFromBase64(ghostB64));
    const raceMs = await page.evaluate('window.__race().laps[window.__race().laps.length - 1]');
    console.log(`  (lap ${(lap.durationMs / 1000).toFixed(3)} s, ${lap.count} samples, ${lap.lead} before the line; ghost ${ghost.count} samples)`);

    check('its duration is the race\'s own lap time', Math.abs(lap.durationMs - raceMs) < 1e-6, `${lap.durationMs} against ${raceMs}`);
    check('and the ghost\'s, to the millisecond a ghost is stored at', Math.abs(lap.durationMs - ghost.durationMs) <= 1, `${lap.durationMs} against ${ghost.durationMs}`);
    check('half a second of lead in', lap.lead === TRACE_LEAD_MS / TRACE_STEP_MS, `${lap.lead}`);
    check('the course and the craft are named', Boolean(lap.meta.course) && Boolean(lap.meta.craft), JSON.stringify(lap.meta));
    check('the room\'s scale and the camera\'s tilt are in the meta',
      Number.isFinite(lap.meta.roomScale) && lap.meta.roomScale > 0 && Number.isFinite(lap.meta.cameraAngle), JSON.stringify(lap.meta));
    check('one split, the lap itself', lap.splits.length === 1 && Math.abs(lap.splits[0] - lap.durationMs) < 1e-6, JSON.stringify(lap.splits));

    /*
     * THE TRACE AGAINST THE GHOST. The ghost holds the pose the hero craft
     * was drawn at, on a 30 Hz grid from the lap's start. Read the trace at
     * each of those times and measure how far apart the two are. They are
     * not the same pose to the millimetre and should not be: the ghost is
     * resampled from display frames and the trace is the physics state. But
     * at 4 m/s a clock that was a frame out would show as centimetres and a
     * frame that was wrong would show as metres.
     *
     * ONE STRETCH IS LEFT OUT, AND IT IS THE HARNESS'S. Between its two
     * passes the scripted pilot is put back in front of the gate, a twelve
     * metre jump inside the lap that no pilot can make. The trace has it as
     * one impossible step and the ghost, resampled across it, as a glide of
     * a frame or two, so the two disagree by metres for those few samples
     * and are both right. Any sample beside a step faster than 100 m/s, the
     * ghost's own line between flight and teleport, is skipped, and the
     * count of them is checked so the skip cannot become the whole lap.
     */
    const JUMP = 100;
    let worst = 0;
    let at = 0;
    let skipped = 0;
    let compared = 0;
    const stepMs = 1000 / ghost.rateHz;
    const ghostJump = (i) => i > 0 && i < ghost.count && Math.hypot(
      ghost.pos[i * 3] - ghost.pos[(i - 1) * 3],
      ghost.pos[i * 3 + 1] - ghost.pos[(i - 1) * 3 + 1],
      ghost.pos[i * 3 + 2] - ghost.pos[(i - 1) * 3 + 2],
    ) / (stepMs / 1000) > JUMP;
    const traceJump = (k) => k > 0 && k < lap.count && Math.hypot(
      lap.at(k, F.PX) - lap.at(k - 1, F.PX), lap.at(k, F.PY) - lap.at(k - 1, F.PY), lap.at(k, F.PZ) - lap.at(k - 1, F.PZ),
    ) / (TRACE_STEP_MS / 1000) > JUMP;
    for (let i = 0; i < ghost.count; i += 1) {
      const t = i * stepMs;
      if (t > lap.durationMs) {
        break;
      }
      let k = lap.lead;
      while (k + 1 < lap.count && lap.at(k + 1, F.T) <= t) {
        k += 1;
      }
      const k1 = Math.min(lap.count - 1, k + 1);
      let nearJump = ghostJump(i - 1) || ghostJump(i) || ghostJump(i + 1) || ghostJump(i + 2);
      for (let j = k - 4; j <= k1 + 4; j += 1) {
        nearJump = nearJump || traceJump(j);
      }
      if (nearJump) {
        skipped += 1;
        continue;
      }
      compared += 1;
      const span = lap.at(k1, F.T) - lap.at(k, F.T);
      const u = span > 0 ? (t - lap.at(k, F.T)) / span : 0;
      const d = Math.hypot(
        lap.at(k, F.PX) + u * (lap.at(k1, F.PX) - lap.at(k, F.PX)) - ghost.pos[i * 3],
        lap.at(k, F.PY) + u * (lap.at(k1, F.PY) - lap.at(k, F.PY)) - ghost.pos[i * 3 + 1],
        lap.at(k, F.PZ) + u * (lap.at(k1, F.PZ) - lap.at(k, F.PZ)) - ghost.pos[i * 3 + 2],
      );
      if (d > worst) {
        worst = d;
        at = t;
      }
    }
    check('its positions lie on the ghost\'s path, to 15 cm', worst < 0.15, `${(worst * 100).toFixed(1)} cm at ${(at / 1000).toFixed(2)} s, over ${compared} samples`);
    check('only the harness\'s one jump was left out of that', skipped <= 8 && compared > 100, `${skipped} skipped, ${compared} compared`);

    const s = lap.summary();
    check('the plant\'s speed is in it', s.topSpeed > 1 && s.topSpeed < 30, `${s.topSpeed.toFixed(2)} m/s top`);
    check('the sticks are in it', s.meanThrottle > 0.02 && s.meanThrottle < 1, `mean throttle ${(s.meanThrottle * 100).toFixed(0)}%`);
    const i = lap.lead + 20;
    check('rotors are turning and the pack has volts', lap.at(i, F.RPM0) > 100 && lap.at(i, F.VOLTS) > 3, `${lap.at(i, F.RPM0).toFixed(0)} rpm, ${lap.at(i, F.VOLTS).toFixed(2)} V`);
    const qn = Math.hypot(lap.at(i, F.QX), lap.at(i, F.QY), lap.at(i, F.QZ), lap.at(i, F.QW));
    check('the attitude is a unit quaternion', Math.abs(qn - 1) < 1e-3, `${qn}`);
  }

  const errs = page.errors.filter((e) => !e.includes('net::ERR_CONNECTION_REFUSED'));
  check('no errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
} catch (e) {
  check('the run finished', false, e.message);
} finally {
  await page.close();
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
