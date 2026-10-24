/*
 * gate-settings-check.js: a setting that voids the lap leaves the lit gate
 * where the race is waiting. Fly three gates of the reference course in the
 * real shell, land, pause, turn Feel tuning on and move Air grip, resume, and
 * compare the gate the course lights with the gate the race scores.
 *
 * Before 2026-10-24 voidLap sent the race to the timing gate and the glow
 * stayed on the third, so the pilot flew the lit gate and nothing counted.
 * Camera angle alone voids nothing, so it is the control: the order must
 * not move at all.
 *
 * Usage: node scripts/gate-settings-check.js
 * Exit code is the number of failed checks.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const doc = readFileSync(join(ROOT, 'tests/fixtures/course-reference.json'), 'utf8');

/* The reference course in the five inch seat, Low, question answered. */
const seed = [`try {
  localStorage.setItem('webfpv.trackbuilder.autosave.v1', JSON.stringify(${doc}));
  const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
  s.map = 'custom'; s.graphics = 'low'; s.graphicsAuto = false; s.airframeAsked = true;
  localStorage.setItem('webfpv.settings.v3', JSON.stringify(s));
} catch (e) { /* the run boots on the default map */ }`];

/* Through gate k along its own axis, from 6 m short to 6 m past. */
const through = (k) => `
  const { V } = window.__vm; const g = window.__race().gates[${k}];
  const a = V(g.x - g.az.x * 6, g.y - g.az.y * 6, g.z - g.az.z * 6);
  const b = V(g.x + g.az.x * 6, g.y + g.az.y * 6, g.z + g.az.z * 6);
  const hd = Math.atan2(g.az.x, g.az.z);
  await window.__settle(a, hd, 1.2);
  await window.__fly(window.__ramp(a, b, 1.6, 8), { heading: hd, extraMs: 100 });
  return window.__race().next;`;

/* Land, open the pause panel, make the change, close it again. */
const settle = (change) => `
  const ui = window.__ui;
  window.__stick(0, 0, 0, 0);
  await new Promise((r) => setTimeout(r, 2500));
  ui.onAction('pause', ui.settings); ui.show('paused');
  await new Promise((r) => setTimeout(r, 400));
  ${change}
  ui.onAction('resume', ui.settings);
  await new Promise((r) => setTimeout(r, 400));
  const t = window.__gateTiers();
  return JSON.stringify({
    next: window.__race().next,
    lit: t.gates.filter((g) => g.tier === 'target').map((g) => g.flyOrder),
  });`;

async function main() {
  const page = await openPage({ root: ROOT, width: 400, height: 260, url: '/index.html', seed });
  const { cdp, sessionId } = page;
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  let fails = 0;
  const check = (what, ok, got) => {
    fails += ok ? 0 : 1;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}: ${got}`);
  };
  try {
    for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady')); i += 1) {
      await sleep(500);
    }
    const cases = [
      ['camera angle', "ui.settings.cameraAngle = (ui.settings.cameraAngle || 25) + 10;", false],
      ['air grip', "ui.settings.feelTuning = true; ui.settings.airGrip = 140;", true],
    ];
    for (const [name, change, voids] of cases) {
      await ev("const ui = window.__ui; ui.settings.feelTuning = false; ui.onAction('fly', ui.settings); return 1;");
      for (let i = 0; i < 120 && !(await ev('const m = window.__map && window.__map(); return !!(m && m.ready)')); i += 1) {
        await sleep(500);
      }
      await sleep(4000);
      await ev(`${PILOT}\nwindow.__drawOff && window.__drawOff(true); return 1;`);
      for (let k = 0; k < 3; k += 1) {
        await ev(through(k));
      }
      const got = JSON.parse(await ev(settle(change)));
      const want = voids ? 0 : 3;
      check(`${name}: the race waits for gate ${want}`, got.next === want, `race.next ${got.next}`);
      check(`${name}: the lit gate is the one the race waits for`, got.lit.length === 1 && got.lit[0] === got.next, `lit ${JSON.stringify(got.lit)}`);
    }
  } finally {
    await page.close?.();
  }
  console.log(`\ngate-settings-check: ${fails} failed`);
  process.exit(fails);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
