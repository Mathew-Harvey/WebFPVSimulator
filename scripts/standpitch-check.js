/*
 * standpitch-check.js: the start block's ramp pitch is drawn on the start
 * block, and nowhere else, in the real shell.
 *
 * WHY THIS EXISTS. bug-98fb5e79, "Starting Block Glitch", from a race lesson
 * (career 7-2, Weave) on a radio: "Throttling up does not launch you
 * correctly off the starting block. The drone clips into the block or gets
 * thrown off into the ground", every time, in the race lessons. Its report
 * had the craft parked on the grass a metre and a half from the stand.
 *
 * A designed course parks the craft on a launch stand whose rails are a 28
 * degree ramp, and the parked pose is DRAWN pitched by it (startPitch in
 * src/main.js) while the plant holds it level. The seating read that pitch
 * on every landing, not only on the stand: once a craft had hopped off the
 * block, every landing on flat grass was drawn 28 degrees nose down with its
 * front in the ground and the parked lens tipped the same way, and the next
 * throttle snapped the picture level. Launch control staged there seeded the
 * plant at the ramp's pitch on flat ground. Only a turtle flip or a set down
 * elsewhere cleared it, and R put it back. Measured on the base (0a97f7c):
 * on the block 28.0 degrees, landed on the grass 28.0 degrees with the
 * plant level.
 *
 * WHAT IT DOES, on a fresh browser, in lesson 7-2 with its own stand:
 *
 *   on the block     parked at the start, drawn at the stand's 28 degrees
 *                    (the fix must not lose the stand).
 *   in the air       drawn as the plant has it.
 *   on the grass     taken off, moved over the grass and let down: parked,
 *                    drawn as the plant has it (level), not 28 degrees nose
 *                    down, and seated at its rest height, not into the
 *                    ground.
 *   launch control   armed on the grass (L): the plant is staged at the
 *                    pitch it is drawn at, not at the ramp's.
 *   R                back to the start: on the block, drawn at 28 degrees
 *                    again.
 *
 * The drawn pose is read off the airframe in the scene, which is what a
 * pilot sees; the plant's is window.__craftState(). Every wait is on state.
 *
 * Not part of `npm run verify`. Run it as `npm run check:standpitch`.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { startBlockDims } from '../src/art/startblock.js';

const ROOT = process.env.STANDPITCH_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');

/* The stand's ramp, from the stand's own numbers: the default pad. */
const RAMP_DEG = (startBlockDims(0.6).tilt * 180) / Math.PI;
/* Half a degree for the stand, which is drawn exactly; a degree between the
 * drawn and the plant's tilt anywhere else, which is interpolation only. */
const STAND_TOL = 0.5;
const LEVEL_TOL = 1;

/* The board is never asked: a lesson flies its stand in, as career-ui-check
 * explains. */
const NO_BOARD = `(() => {
  const real = window.fetch.bind(window);
  const theirs = (u) => { try { const x = new URL(u, location.href); return x.origin !== location.origin; } catch (e) { return false; } };
  window.fetch = (input, opts) => {
    const url = String(input && input.url ? input.url : input);
    return theirs(url) && /\\/api\\//.test(url) ? Promise.reject(new TypeError('Failed to fetch')) : real(input, opts);
  };
  navigator.sendBeacon = () => true;
})();`;

const seed = [NO_BOARD, `try {
  const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
  s.graphics = 'low'; s.graphicsAuto = false; s.airframeAsked = true;
  localStorage.setItem('webfpv.settings.v3', JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* the run boots on the defaults */ }`];

/* The drawn airframe against the plant, in one read. Tilt is the angle of
 * the body's up from world up, in degrees; `above` is the drawn centre over
 * the surface under it, `rest` the level craft's rest height. */
const LOOK = `(() => {
  const T = window.__three;
  const q = window.__mapScene().getObjectByName(window.__craft().drawn);
  const up = new T.Vector3(0, 1, 0).applyQuaternion(q.quaternion);
  const c = window.__craftState();
  const g = window.__ground();
  const deg = (y) => Math.acos(Math.max(-1, Math.min(1, y))) * 180 / Math.PI;
  return {
    landed: c.landed,
    drawnTilt: +deg(up.y).toFixed(2),
    plantTilt: c.up ? +deg(c.up.y).toFixed(2) : null,
    plantPitch: +c.pitchDeg.toFixed(2),
    x: +q.position.x.toFixed(3),
    z: +q.position.z.toFixed(3),
    above: +(q.position.y - g.surf).toFixed(4),
    rest: g.rest,
  };
})()`;

let fails = 0;
let passes = 0;
const check = (what, ok, got = '') => {
  if (ok) {
    passes += 1;
  } else {
    fails += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${got === '' ? '' : `: ${got}`}`);
  return ok;
};

const page = await openPage({ root: ROOT, width: 960, height: 540, seed });
const look = () => page.evaluate(LOOK);
/* A frame drawn after the state asked for, so the airframe read is that
 * state's and not the one before it. */
const drawn = async () => {
  const d = await page.evaluate('window.__timerYield().draws');
  await page.until(`window.__timerYield().draws >= ${d + 2}`, 20000);
};

try {
  console.log(`\nlesson 7-2, the stand's ramp ${RAMP_DEG.toFixed(1)} degrees`);
  await page.until('!!window.__shellReady', 180000);
  await page.evaluate("window.__career.open('7-2')");
  await page.until("window.__career.state() === 'briefing'", 60000);
  await page.until("(() => { const b = document.querySelector('#career .cr-brief .cr-btn.primary'); return b && !b.disabled; })()", 90000);
  await page.evaluate('window.__career.fly()');
  await page.until("window.__career.state() === 'flight'", 60000);
  await drawn();
  await page.until('window.__craftState().landed', 30000);
  await drawn();

  const block = await look();
  check('parked at the start, on the block, drawn at the ramp',
    block.landed && Math.abs(block.drawnTilt - RAMP_DEG) <= STAND_TOL, JSON.stringify(block));

  await page.evaluate('window.__stick(0, 0, 0, 0.6)');
  await page.until('window.__craftState().worldY > 1.5', 20000);
  await drawn();
  const air = await look();
  check('in the air, drawn as the plant has it',
    !air.landed && Math.abs(air.drawnTilt - air.plantTilt) <= LEVEL_TOL, JSON.stringify(air));

  /* Over the grass, four metres up the field and three to the side of the
   * stand, and let down. */
  await page.evaluate('(window.__stick(0, 0, 0, 0.45), window.__placeCraft(-20, 1.2, 3), 1)');
  await page.sleep(300);
  await page.evaluate('(window.__stick(0, 0, 0, 0), 1)');
  await page.until('window.__craftState().landed', 30000);
  await drawn();
  const grass = await look();
  check('landed on the grass, off the stand', grass.landed && Math.abs(grass.x + 20) < 0.5 && Math.abs(grass.z - 3) < 0.5,
    JSON.stringify(grass));
  check('parked on the grass, drawn as the plant has it, not at the ramp',
    Math.abs(grass.drawnTilt - grass.plantTilt) <= LEVEL_TOL, `drawn ${grass.drawnTilt}, plant ${grass.plantTilt}`);
  check('parked on the grass, seated at its rest height, not into the ground',
    grass.above >= grass.rest * 0.95, `centre ${grass.above} m over the grass, rest ${grass.rest}`);

  /* Launch control from where it landed: staged at the pitch it is drawn at. */
  await page.evaluate('(window.__ui.settings.launchControl = true, 1)');
  await page.tap('KeyL');
  await page.until('window.__craftState().landed === false || window.__craftState().pitchDeg !== 0', 5000).catch(() => {});
  await page.sleep(400);
  await drawn();
  const lc = await look();
  check('launch control armed on the grass stages the plant at the pitch it was drawn at, not at the ramp',
    Math.abs(lc.plantPitch) <= LEVEL_TOL, JSON.stringify(lc));
  await page.tap('KeyL');
  await page.sleep(300);
  await page.evaluate('(window.__ui.settings.launchControl = false, 1)');

  /* R: back to the start, on the stand. */
  await page.tap('KeyR');
  await page.until('window.__craftState().landed && Math.abs(window.__craftState().worldX + 24) < 0.3', 20000);
  await drawn();
  const again = await look();
  check('R puts it back on the block, drawn at the ramp again',
    again.landed && Math.abs(again.drawnTilt - RAMP_DEG) <= STAND_TOL, JSON.stringify(again));

  const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  check('no uncaught error or console.error', errs.length === 0, errs.slice(0, 4).join(' | ') || 'none');
} catch (e) {
  check('the run went to the end', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
} finally {
  await page.close();
}

console.log(`\nstandpitch-check: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
