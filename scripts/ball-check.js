/*
 * ball-check.js: Quad Ball in the real shell (headless Chromium): the arena
 * loads, a solo match builds with bots, taking off starts it, the HUD is
 * up, and a picture of the arena and of the match is left in the shots
 * folder. `node scripts/ball-check.js [--shots=DIR]`. Headless runs about a
 * fifth of real time, so waits are on the match's own clock.
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

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerQuadPicker, openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS = shotsArg ? shotsArg.slice(8) : '';
if (SHOTS) {
  mkdirSync(SHOTS, { recursive: true });
}

const sleep = (ms) => new Promise((r) => {
  setTimeout(r, ms);
});

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}${detail ? `: ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}

const G = 'const g = window.__dogfight();';

async function main() {
  const map = 'ball';
  const page = await openPage({ root: ROOT, width: 960, height: 540, url: `/index.html?map=${map}&craft=5inch&fly=1` });
  const ev = async (body) => {
    const r = await page.cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true,
    }, page.sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  const until = async (body, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await ev(body)) {
        return true;
      }
      await sleep(200);
    }
    return false;
  };
  const shot = async (name) => {
    if (!SHOTS) {
      return;
    }
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
  };
  try {
    check('the shell comes up', await until('return !!window.__shellReady', 120000));
    check('the arena map is ready', await until(`const m = window.__map ? window.__map() : null; return Boolean(m && m.ready && m.id === '${map}');`, 150000));
    await answerQuadPicker(page, 60000).catch(() => {});
    await until("return window.__ui.screen === 'flight'", 20000);
    await shot('arena');
    await ev("window.__ui.dogfight = { game: 'ball', size: 2, skill: 'pilot', round: '3m' }; return 1;");
    check('the match is built once its modules land', await until('return Boolean(window.__dogfight())', 30000));
    check('it is Quad Ball', await ev(`${G} return g.ballRules.size === 2 && g.inFight.reduce((a, v) => a + v, 0) === 4;`));
    check('the arena came from the map', await ev(`${G} return g.arena && g.arena.hx === 55;`));
    check('the HUD is up', await until("const h = document.querySelector('.df-hud'); return Boolean(h) && !h.classList.contains('is-off');", 10000));
    await ev('window.__stick(0, 0, 0, 0.7); return 1;');
    check('taking off starts the match', await until(`${G} return g.startedMs >= 0;`, 20000));
    check('the countdown is on', await ev(`${G} return g.countdownS() > 0;`));
    await shot('kickoff');
    check('the ball goes live', await until(`${G} return g.inPlay;`, 60000));
    await ev('window.__stick(0, 0, 0, 0.5); return 1;');
    /* A camera over the arena's corner, for the pictures. */
    await ev('window.__setCam(-62, 30, -52, 0, 4, 0); return 1;');
    await sleep(8000);
    /* Draw calls and triangles of the frame, for the PR's latency line:
     * a proxy, the headless page has no GPU. */
    const rs = await ev('return window.__renderStats();');
    console.log(`  info  overview frame: ${rs.calls} draw calls, ${rs.triangles} triangles`);
    await shot('overview');
    /* A goal, for the fireworks: the ball put in front of the east goal. */
    await ev('window.__setCam(-10, 6, 0, 45, 30, 0); return 1;');
    await ev(`${G} const b = g.ball; b.x = 44; b.y = 3; b.z = 0; b.vx = 30; b.vy = 0; b.vz = 0; return 1;`);
    check('a goal is scored', await until(`${G} return g.teamScore[0] + g.teamScore[1] > 0;`, 20000));
    for (let i = 0; i < 6; i += 1) {
      await sleep(300);
      await shot(`goal-fireworks${i}`);
    }
    await ev('window.__setCam(-62, 30, -52, 0, 4, 0); return 1;');
    if (SHOTS) {
      /* The gate card's picture: the same view with the page's own
       * furniture hidden, scaled to 448 high and cropped to 720 wide by
       * hand for assets/gate/ball.jpg. */
      await ev("window.__ui.root.style.visibility = 'hidden'; return 1;");
      await ev('window.__setCam(10, 70, -30, 0, 0, 2); return 1;');
      await sleep(1200);
      await shot('card');
      await ev("window.__ui.root.style.visibility = ''; return 1;");
    }
    await ev('window.__setCam(60, 8, 0, -20, 6, 0); return 1;');
    await sleep(1500);
    await shot('goal-end');
    await ev('window.__setCam(); return 1;');
    const finite = await ev(`${G} const b = g.ball; return Number.isFinite(b.x + b.y + b.z);`);
    check('the ball is somewhere real', finite);
    const errs = page.errors.filter((e) => !/api\/|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ev("window.__ui.act('pause'); window.__ui.act('fight-leave'); return 1;");
    check('leaving ends the match', await until('return window.__dogfight() === null', 5000));
  } finally {
    await page.close();
  }
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
