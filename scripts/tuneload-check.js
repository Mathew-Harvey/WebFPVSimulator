/*
 * tuneload-check.js: a tune loaded from the board flies at once, including
 * the case the tune id alone cannot see. A pilot already flying Your edits
 * who loads a shared tune that is itself a Betaflight dump stays on the one
 * id 'custom' on the same aircraft, so only the dump changes; the module
 * has to be given the new dump, and Put mine back has to give it the old
 * one again. Read straight from the module through window.__tune().pRoll.
 *
 * Usage: node scripts/tuneload-check.js  (npm run check:tuneload)
 * Exit code is the number of failed checks. About half a minute.
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const page = await openPage({ root: ROOT, width: 400, height: 260, url: '/index.html' });
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
    /* Your edits A (P roll 61), then a shared custom tune B (P roll 73) on
     * the same aircraft, then Put mine back. Each step waits for the swap. */
    const rows = await ev(`
      const ui = window.__ui;
      const { writeFcDump } = await import('/src/fc/dump.js');
      const { tunePath } = await import('/configs/registry.js');
      const base = await (await fetch(tunePath(ui.settings.tune))).text();
      const af = ui.settings.airframe;
      const body = base.split('\\n').filter((l) => !/^set p_roll\\b/.test(l.trim())).join('\\n');
      const settle = () => new Promise((r) => setTimeout(r, 1500));
      writeFcDump(af, body + '\\nset p_roll = 61\\n');
      ui.settings.tune = 'custom';
      ui.onSettings(ui.settings);
      await settle();
      const a = { id: window.__tune().id, p: window.__tune().pRoll };
      const s = ui.settings;
      const res = ui.applyCommunityTune({ airframe: af, setup: {
        base: 'custom', dump: body + '\\nset p_roll = 73\\n', rates: s.rates, weight: s.weight, airGrip: 100,
        motorKv: 100, packVoltage: s.packVoltage, cameraFov: s.cameraFov, cameraAngle: s.cameraAngle,
      } });
      await settle();
      const b = { id: window.__tune().id, p: window.__tune().pRoll, error: res.error || '' };
      ui.undoCommunityTune();
      await settle();
      const back = { id: window.__tune().id, p: window.__tune().pRoll };
      return { a, b, back };`);
    console.log('tuneload-check: shell ready\n');
    check('Your edits flies its own dump', rows.a.id === 'custom' && rows.a.p === 61, `${rows.a.id}, P roll ${rows.a.p}`);
    check('a shared dump loaded over Your edits flies at once', !rows.b.error && rows.b.p === 73, `P roll ${rows.b.p} ${rows.b.error}`);
    check('Put mine back flies the old dump again', rows.back.p === 61, `P roll ${rows.back.p}`);
  } finally {
    await page.close?.();
  }
  console.log(`\ntuneload-check: ${fails} failed`);
  process.exit(fails);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
