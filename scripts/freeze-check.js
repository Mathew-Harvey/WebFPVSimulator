/*
 * freeze-check.js: the town's frozen scene graph still draws everything
 * where it is.
 *
 * WHY THIS EXISTS. freezeStill in src/maps/city/bake.js takes four thousand
 * still nodes out of three's per frame matrix walk (the note there says what
 * that costs and why). The failure it can cause is silent: a node that code
 * moves after the freeze is drawn where it was frozen, and a node added
 * under a frozen parent is never given a world matrix at all. Neither shows
 * in a count, and a pilot would report it as "the train stopped" a week
 * later. So this flies the real town on the real loop for long enough for
 * the train, the booms and the traffic to move, then recomposes EVERY
 * frozen node by force and compares its world matrix with the one the frame
 * was drawing: a difference is a mover that was frozen, and it is named by
 * its path.
 *
 * It also asserts the freeze is in force: the scene and the root no longer
 * auto compose (one that does forces its children and undoes the whole
 * thing), the frozen count is in the thousands, and the train is live.
 *
 * Headless Chromium on a software rasteriser, so nothing here is a timing.
 *
 * Usage:
 *   node scripts/freeze-check.js [--graphics=low,high] [--secs=8]
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

import { openPage } from '../tests/lib/page.js';
import { PILOT } from './lib/pilot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = 'http://127.0.0.1:3100';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1'];
}));
const PRESETS = String(args.graphics || 'low,high').split(',');
const SECS = Number(args.secs || 8);

function seed(graphics) {
  return `(() => {
    const board = ${JSON.stringify(BOARD)};
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, opts = {}) => {
      const url = String(input && input.url ? input.url : input);
      if (!url.startsWith(board)) { return realFetch(input, opts); }
      return Promise.resolve(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
    };
    navigator.sendBeacon = () => true;
    try {
      const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
      s.graphics = ${JSON.stringify(graphics)}; s.graphicsAuto = false; s.airframeAsked = true;
      localStorage.setItem('webfpv.settings.v3', JSON.stringify(s));
    } catch (e) { /* the run boots with the default preset */ }
  })();`;
}

/* An orbit about the spawn, flown on the sticks through the pilot helper,
 * wide enough to pass the crossing and the lake rigs' cells. */
const ORBIT = `
window.__orbit = (c, r, h, speed, secs) => {
  const { V } = window.__vm;
  const w = speed / r;
  const fn = (t) => {
    const a = w * t;
    return {
      p: V(c.x + r * Math.cos(a), c.y + h, c.z + r * Math.sin(a)),
      v: V(-r * w * Math.sin(a), 0, r * w * Math.cos(a)),
      a: V(-r * w * w * Math.cos(a), 0, -r * w * w * Math.sin(a)),
      done: t >= secs,
    };
  };
  fn.total = secs;
  return fn;
};`;

/* Recompose every node by force and report the frozen ones that land
 * somewhere else than the frame was drawing them. */
const COMPARE = `(() => {
  const scene = window.__mapScene();
  const world = window.__cityWorld();
  const root = world.root;
  const path = (o) => { const p = []; for (let n = o; n && n !== scene; n = n.parent) { p.push(n.name || n.type); } return p.reverse().join('/'); };
  const frozen = [];
  root.traverse((o) => { if (o.userData && o.userData.still) { frozen.push(o); } });
  const worldBefore = frozen.map((o) => o.matrixWorld.elements.slice());
  const localBefore = frozen.map((o) => o.matrix.elements.slice());
  const flags = [];
  scene.traverse((o) => { flags.push([o, o.matrixAutoUpdate, o.matrixWorldAutoUpdate]); o.matrixAutoUpdate = true; o.matrixWorldAutoUpdate = true; });
  scene.updateMatrixWorld(true);
  const drifted = [];
  const differs = (a, b) => { for (let k = 0; k < 16; k += 1) { if (Math.abs(a[k] - b[k]) > 1e-5) { return true; } } return false; };
  frozen.forEach((o, i) => {
    if (differs(o.matrixWorld.elements, worldBefore[i])) {
      drifted.push({ path: path(o), type: o.type, local: differs(o.matrix.elements, localBefore[i]) });
    }
  });
  for (const [o, a, b] of flags) { o.matrixAutoUpdate = a; o.matrixWorldAutoUpdate = b; }
  /* Back to the frozen numbers, which are the ones the frame draws. */
  scene.updateMatrixWorld(true);
  let live = 0; let nodes = 0;
  root.traverse((o) => { nodes += 1; if (o !== root && o.matrixWorldAutoUpdate) { live += 1; } });
  const train = world.train && world.train.group ? world.train.group : null;
  return {
    nodes, frozen: frozen.length, live,
    sceneAuto: scene.matrixAutoUpdate, rootAuto: root.matrixAutoUpdate, rootWorldAuto: root.matrixWorldAutoUpdate,
    trainLive: train ? !(train.userData && train.userData.still) && train.matrixWorldAutoUpdate : null,
    drifted: drifted.length, driftedList: drifted.slice(0, 12),
    stats: window.__map().stats ? (window.__map().stats.frozen || null) : null,
  };
})()`;

async function run(graphics) {
  const page = await openPage({
    root: ROOT, width: 640, height: 360, url: `/index.html?map=city&board=${BOARD}`, seed: [seed(graphics)],
  });
  let fails = 0;
  const check = (what, ok, got) => {
    fails += ok ? 0 : 1;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${graphics}: ${what}: ${got}`);
  };
  try {
    await page.until('!!window.__shellReady', 180000);
    await page.evaluate("(() => { const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; ui.onAction('fly', ui.settings); return 1; })()");
    await page.until('(() => { const m = window.__map && window.__map(); return !!(m && m.ready); })()', 180000);
    await page.sleep(1500);
    await page.evaluate(`(async () => { ${PILOT}\n ${ORBIT}\n return 1; })()`);
    const trainBefore = await page.evaluate('(() => { const w = window.__cityWorld(); return w.train && w.train.group ? w.train.group.matrixWorld.elements.slice() : null; })()');
    await page.evaluate(`(async () => {
      const { V } = window.__vm; const c = window.__craftState();
      const s = V(c.worldX, c.worldY, c.worldZ);
      await window.__settle(V(s.x, s.y + 5, s.z), 0, 1.5);
      const R = 30;
      await window.__fly(window.__orbit(V(s.x - R, s.y, s.z), R, 6, 12, ${SECS}), { heading: 0 });
      return 1;
    })()`);
    const r = await page.evaluate(COMPARE);
    check('the scene no longer auto composes', r.sceneAuto === false, `scene.matrixAutoUpdate ${r.sceneAuto}`);
    check('the root no longer auto composes but still visits its live children', r.rootAuto === false && r.rootWorldAuto === true, `root auto ${r.rootAuto}, world auto ${r.rootWorldAuto}`);
    check('thousands of nodes are frozen', r.frozen > 1000, `${r.frozen} frozen of ${r.nodes}, ${r.live} live`);
    check('the train is live', r.trainLive === true, `train live ${r.trainLive}`);
    const trainAfter = await page.evaluate('(() => { const w = window.__cityWorld(); return w.train && w.train.group ? w.train.group.matrixWorld.elements.slice() : null; })()');
    const moved = trainBefore && trainAfter && trainBefore.some((v, i) => Math.abs(v - trainAfter[i]) > 1e-6);
    check('the train moved during the flight', moved === true, moved ? 'moved' : 'did not move');
    check('no frozen node is drawn anywhere but where it is', r.drifted === 0, r.drifted === 0 ? 'none drifted' : `${r.drifted} drifted: ${JSON.stringify(r.driftedList)}`);
    const errs = page.errors.filter((e) => !e.includes('net::ERR_CONNECTION_REFUSED'));
    check('no errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  } finally {
    await page.close();
  }
  return fails;
}

let fails = 0;
for (const g of PRESETS) {
  fails += await run(g);
}
console.log(`\nfreeze-check: ${fails} failed`);
process.exit(fails);
