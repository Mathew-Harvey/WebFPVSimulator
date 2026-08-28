/*
 * responsive-check.js: a pilot using a room is never locked out of it.
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

/*
 * WHY THIS EXISTS.
 *
 * Reported as "the freestyle page is unresponsive when I get to it, becomes
 * responsive after a time". Measured on arrival with a cold clip cache: 23
 * frames in 10.4 seconds, and one gap of 5155 ms in which the page did not
 * paint at all.
 *
 * The cause is that each world card's preview loads src/share/orbit.html in
 * a SAME ORIGIN iframe, which builds a whole Three.js scene on this thread.
 * The clip is cached per browser afterwards, so it is a first visit cost,
 * and it is worth paying: it is just not worth paying while somebody is
 * trying to use the room.
 *
 * WHAT IT MEASURES, and why it is a frame gap rather than a stopwatch.
 *
 * "Responsive" is not how long a thing takes, it is whether the page can
 * paint and answer a key while it happens. So the check drives the room the
 * way a person would, a key press every 400 ms, and records the gap between
 * animation frames throughout. A long gap IS the freeze, whatever caused it.
 *
 * The room is allowed one slow frame: tearing down an iframe mid-build
 * costs something, and the alternative is never recording a preview at all.
 * What it is not allowed is a second of nothing, repeatedly.
 */

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * The Freestyle room only, and the exclusion is worth writing down.
 *
 * It is the room that was reported, and it is the one where this
 * measurement means what it says: main.js keeps the 3D world HIDDEN behind
 * it, so a frame gap there is the room's own fault.
 *
 * The Race room is deliberately not here. It keeps the world LIVE, so the
 * seated track is visible behind the cards, and on this container's
 * software rasteriser a world frame costs about 200 ms. Driving it measures
 * 33 frames in seven seconds, which looks identical to a lock-up and is
 * really a missing GPU. A check that cannot tell those two apart would fail
 * on every machine without a graphics card and teach whoever runs it to
 * ignore the result.
 */
const ROOMS = ['freestyle'];

/* How long to drive the room for, and how often to press a key. */
const DRIVE_MS = 7000;
const KEY_EVERY_MS = 400;

/*
 * Budgets, set from the measured before and after rather than from taste.
 * Before the recorder learned to get out of the way the Freestyle room gave
 * 10 frames and a 4321 ms worst gap while being driven; after, 338 frames
 * and 960 ms. These sit well inside the fixed behaviour and well outside
 * the broken one, so the check tells the two apart without failing on the
 * noise of a shared container.
 */
const MIN_FRAMES = 120;
const MAX_GAP_MS = 1600;
const MAX_LONG_GAPS = 2;

async function drive(room) {
  const page = await openPage({
    root,
    width: 1280,
    height: 720,
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.graphics = 'low';
      s.graphicsAuto = false;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* Storage refused. The run still boots. */ }`],
  });
  try {
    await page.until('window.__shellReady === true', 90000);
    await page.until('!!window.__ui', 10000);
    await page.evaluate(`(() => {
      const ui = window.__ui;
      if (ui.firstRun) { ui.act('skipfirst'); }
      window.__gaps = [];
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        window.__gaps.push(Math.round(now - last));
        last = now;
        requestAnimationFrame(tick);
      };
      ui.show(${JSON.stringify(room)});
      requestAnimationFrame(tick);
      window.__busy = setInterval(() => { ui.handleKey('ArrowDown'); }, ${KEY_EVERY_MS});
      return 1;
    })()`);
    await new Promise((resolve) => { setTimeout(resolve, DRIVE_MS); });
    const raw = await page.evaluate(`(() => {
      clearInterval(window.__busy);
      const g = window.__gaps || [];
      return JSON.stringify({
        frames: g.length,
        worst: g.length ? Math.max.apply(null, g) : 0,
        longGaps: g.filter((n) => n > 500).length,
      });
    })()`);
    return JSON.parse(raw);
  } finally {
    await page.close();
  }
}

async function main() {
  const failures = [];
  console.log(`responsive check: driving each room for ${DRIVE_MS / 1000}s, a key every ${KEY_EVERY_MS}ms\n`);
  for (const room of ROOMS) {
    const r = await drive(room);
    console.log(
      `  ${room.padEnd(10)} ${String(r.frames).padStart(4)} frames`
      + `  worst gap ${String(r.worst).padStart(5)} ms`
      + `  ${r.longGaps} gap(s) over 500 ms`,
    );
    if (r.frames < MIN_FRAMES) {
      failures.push(`${room}: only ${r.frames} frames in ${DRIVE_MS / 1000}s, the room is locked up`);
    }
    if (r.worst > MAX_GAP_MS) {
      failures.push(`${room}: a ${r.worst} ms frame gap, the page stopped painting`);
    }
    if (r.longGaps > MAX_LONG_GAPS) {
      failures.push(`${room}: ${r.longGaps} gaps over half a second while being driven`);
    }
  }
  if (failures.length) {
    console.log(`\nFAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.log(`  ${f}`);
    }
    return 1;
  }
  console.log('\nPASS, a pilot using a room is never locked out of it');
  return 0;
}

process.exit(await main());
