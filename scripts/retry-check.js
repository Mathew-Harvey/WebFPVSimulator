/*
 * retry-check.js: Reset to Last gate (the owner's pick of 2026-11-05, idea 4
 * of the sweep) and the gate gap with Ghost off (idea 2).
 *
 * Flies the reference course through its first three stations, then presses
 * R with Reset to set to Last gate, and asks the race and the craft what
 * happened: the craft sits a few metres past the last gate flown, facing on
 * through it, landed; the running lap was thrown away, so no lap time can
 * come out of the section; and the race waits for the gate after it, not
 * for the start. Then R with Reset to on Start line is the old R exactly:
 * the craft on the line and the race waiting for the first station. Last,
 * with Ghost off, a full lap and the first gates of the next one: the gate
 * gap is read against your best lap, unseen.
 *
 * Cheap for a browser check: one page, Low, draw off. Not part of
 * `npm run verify`. Run it as `npm run check:retry`.
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

import { openPage, keyInfo } from '../tests/lib/page.js';
import { PILOT } from './lib/pilot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* The reference course cut to the four stations scripts/gate-settings-check.js
 * already flies (its timing gate and three flags) and its pads, so a whole
 * lap is four passes the rig is known to make. */
const full = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/course-reference.json'), 'utf8'));
const keep = new Set(full.sequence.slice(0, 4).map((q) => q.elementId));
const doc = JSON.stringify({
  ...full,
  elements: full.elements.filter((e) => keep.has(e.id) || e.type === 'startPads'),
  sequence: full.sequence.slice(0, 4),
});

const seed = [`try {
  localStorage.setItem('webfpv.trackbuilder.autosave.v1', JSON.stringify(${doc}));
  const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
  s.map = 'custom'; s.graphics = 'low'; s.graphicsAuto = false; s.airframeAsked = true; s.ghost = 'off';
  localStorage.setItem('webfpv.settings.v3', JSON.stringify(s));
} catch (e) { /* the run boots on the default map */ }`];

const through = (k) => `
  const { V } = window.__vm; const g = window.__race().gates[${k}];
  const a = V(g.x - g.az.x * 6, g.y - g.az.y * 6, g.z - g.az.z * 6);
  const b = V(g.x + g.az.x * 6, g.y + g.az.y * 6, g.z + g.az.z * 6);
  const hd = Math.atan2(g.az.x, g.az.z);
  await window.__settle(a, hd, 1.2);
  await window.__fly(window.__ramp(a, b, 1.6, 8), { heading: hd, extraMs: 100 });
  return window.__race().next;`;

const STATE = `
  const r = window.__race(); const c = window.__craftState();
  return JSON.stringify({ next: r.next, lapStartMs: r.lapStartMs, laps: r.laps.length, gates: r.gates,
    p: [c.worldX, c.worldY, c.worldZ], landed: c.landed, gap: window.__ghost ? window.__ghost().gapMs : null });`;

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
  const pressR = async () => {
    const k = keyInfo('KeyR');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...k }, sessionId);
    await sleep(60);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode }, sessionId);
    await sleep(600);
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
    await ev("const ui = window.__ui; ui.settings.resetTo = 'gate'; ui.onAction('fly', ui.settings); return 1;");
    for (let i = 0; i < 120 && !(await ev('const m = window.__map && window.__map(); return !!(m && m.ready)')); i += 1) {
      await sleep(500);
    }
    await sleep(4000);
    await ev(`${PILOT}\nwindow.__drawOff && window.__drawOff(true); return 1;`);
    for (let k = 0; k < 3; k += 1) {
      await ev(through(k));
    }
    const before = JSON.parse(await ev(STATE));
    check('three stations flown, the lap running', before.next === 3 && before.lapStartMs != null, `next ${before.next}, lap start ${before.lapStartMs}`);
    await ev('window.__stick(0, 0, 0, 0); return 1;');
    await pressR();
    const after = JSON.parse(await ev(STATE));
    const g = after.gates[2];
    const dx = after.p[0] - g.x;
    const dz = after.p[2] - g.z;
    const along = dx * g.az.x + dz * g.az.z;
    const off = Math.hypot(dx - along * g.az.x, dz - along * g.az.z);
    check('Last gate: put down past the last gate flown', along > 0.5 && along < 6 && off < 3, `${along.toFixed(2)} m along, ${off.toFixed(2)} m off its line`);
    check('Last gate: landed there', after.landed, `landed ${after.landed}`);
    check('Last gate: the race waits for the next gate, not the start', after.next === 3, `next ${after.next}`);
    check('Last gate: the running lap is thrown away', after.lapStartMs == null && after.laps === 0, `lap start ${after.lapStartMs}, laps ${after.laps}`);

    await ev("window.__ui.settings.resetTo = 'start'; return 1;");
    await pressR();
    const line = JSON.parse(await ev(STATE));
    check('Start line: R goes back to the first station', line.next === 0 && line.lapStartMs == null, `next ${line.next}, lap start ${line.lapStartMs}`);

    /*
     * bugs.md BUG-10: Last gate taken just after the timing gate, the
     * commonest crash point, put the craft down PAST it with the clock
     * stopped, for a whole untimed lap. It goes down before the timing
     * gate instead, and the next crossing starts the clock.
     */
    await ev(through(0));
    const started = JSON.parse(await ev(STATE));
    await ev("window.__ui.settings.resetTo = 'gate'; window.__stick(0, 0, 0, 0); return 1;");
    await pressR();
    const back = JSON.parse(await ev(STATE));
    const t0 = back.gates[0];
    const bAlong = (back.p[0] - t0.x) * t0.az.x + (back.p[2] - t0.z) * t0.az.z;
    check('Last gate after the timing gate: put down before it, the clock stopped', started.lapStartMs != null && back.lapStartMs == null
      && bAlong < -0.5 && bAlong > -6 && back.next === 0, `${bAlong.toFixed(2)} m along, next ${back.next}, lap start ${back.lapStartMs}`);
    await ev(through(0));
    const again = JSON.parse(await ev(STATE));
    check('and the next crossing of it starts the clock', again.lapStartMs != null && again.next === 1, `next ${again.next}, lap start ${again.lapStartMs}`);
    await ev("window.__ui.settings.resetTo = 'start'; return 1;");
    await pressR();

    /* A full lap, then the first gates of the next with Ghost off. */
    const n = line.gates.length;
    const order = [];
    for (let k = 0; k < n + 2; k += 1) {
      order.push(await ev(through(k % n)));
    }
    console.log(`  (the order after each pass: ${order.join(' ')})`);
    const lap = JSON.parse(await ev(STATE));
    check('Ghost off: a lap is on record', lap.laps >= 1, `laps ${lap.laps}`);
    check('Ghost off: the OSD still reads a gap to your best at a gate', Number.isFinite(lap.gap), `gap ${lap.gap}`);
  } finally {
    await page.close?.();
  }
  console.log(`\nretry-check: ${fails} failed`);
  process.exit(fails);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
