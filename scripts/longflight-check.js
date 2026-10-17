/*
 * longflight-check.js: the support prompt on every exit, and a flight that
 * keeps flying cleanly around it.
 *
 * WHY THIS EXISTS. On 2026-10-05 three tickets in ten minutes, bug-03ae2f2a,
 * bug-551a5c32 and bug-7f783182, carried one fault: "ReferenceError: settings
 * is not defined" in frameBody. The support prompts added that morning ran
 * code in the frame loop that nothing had ever flown through, and past twenty
 * minutes every frame in the air threw. The prompt has since moved out of the
 * frame loop: it is shown once when a pilot leaves a flight for the title
 * (Ui.act, 'title', then Ui.onFlightExit), so there is no twenty minute line
 * to fly across. What this still guards is the other half of that lesson:
 * a real flight, real exits, and no frame faulting before, between or after.
 *
 *   - no frame faulted (window.__frameFault) and the shell kept drawing;
 *   - nothing over the flight, ever;
 *   - Pause then Quit to title: the prompt is up on the title, once, on the
 *     body, its close button and link what a click lands on, the Patreon link
 *     whole, a Settings button on it;
 *   - x closes it, and it does not come back on its own;
 *   - Results then Back to title: once, and only on the title (not on results);
 *   - Restart from the pause menu is not an exit: no prompt;
 *   - leaving the title for a flight removes it, and so does a dialog;
 *   - Escape on the title closes the prompt first, and the gate stays shut;
 *   - Support prompts Off, and the stored disabled key (after a reload):
 *     nothing shows and no beacon is sent;
 *   - its Settings button opens the Advanced room, and a stored Off is read
 *     back as Off by the shell and by the prompt module.
 *
 * Not deterministic to the bit, because the sticks are written on the frame
 * clock of a headless browser, so every assertion is an inequality.
 *
 * Usage: node scripts/longflight-check.js. Exit code is the number of failures.
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

/* In the page: take off and hold a hover for a moment. */
const AIR = `
  const air = (s) => new Promise((done) => {
    const t0 = performance.now();
    function f() {
      const t = (performance.now() - t0) / 1000;
      window.__stick(0, 0, 0, t < 0.8 ? 0.65 : 0.5);
      if (t < s && !window.__frameFault) {
        requestAnimationFrame(f);
      } else {
        done();
      }
    }
    requestAnimationFrame(f);
  });
  window.__stick(0, 0, 0, 0);
  await new Promise((r) => setTimeout(r, 800));
  const f0 = window.__boot().frames;
  await air(2);
  const up = window.__ground();
  window.__stick(0, 0, 0, 0);
  return { airborne: !up.landed, above: up.above, frames: window.__boot().frames - f0,
    fault: window.__frameFault ? window.__frameFault.message : null,
    inFlight: document.querySelectorAll('.support-prompt').length };`;

/* In the page: the prompt as a pilot would meet it. */
const PROMPT = `
  const all = document.querySelectorAll('.support-prompt');
  const p = all[0] || null;
  const hits = (n) => {
    if (!n) { return false; }
    const r = n.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(at) && (at === n || n.contains(at));
  };
  const link = p ? p.querySelector('.support-prompt-btn-primary') : null;
  const href = link ? link.href : '';
  return {
    screen: window.__ui.screen, count: all.length, held: window.__supportPrompt().screen,
    onBody: Boolean(p) && p.parentNode === document.body,
    closeHits: hits(p && p.querySelector('.support-prompt-close')), linkHits: hits(link),
    href, marks: (href.match(/[?]/g) || []).length, rid: href ? new URL(href).searchParams.get('rid') : null,
    settings: Boolean(p) && [...p.querySelectorAll('button')].some((b) => b.textContent === 'Settings'),
  };`;

/* In the page: Off, stored, then read back the two ways it is read. */
const OFF = `
  const key = 'webfpv.settings.v3';
  const stored = JSON.parse(localStorage.getItem(key) || '{}');
  localStorage.setItem(key, JSON.stringify({ ...stored, supportPrompts: false }));
  const { loadSettings } = await import('/src/ui/ui.js');
  const { isPromptDisabled } = await import('/src/share/supportprompt.js');
  return { kept: loadSettings().supportPrompts, disabled: isPromptDisabled() };`;

async function main() {
  let fails = 0;
  const check = (ok, what, got) => {
    fails += ok ? 0 : 1;
    console.log(`     ${ok ? 'pass' : 'FAIL'}  ${what}${got ? `: ${got}` : ''}`);
  };
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
  const settle = () => ev('await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return 1;');
  const prompts = () => ev('return document.querySelectorAll(".support-prompt").length');
  /* Beacons: count the ones the prompt sends, whatever page it is on. */
  const spy = () => ev(`window.__beacons = [];
    const real = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (u, b) => { window.__beacons.push(String(u)); return real(u, b); };
    const g = window.__ui; return 1;`);
  /* Boot the shell, put the five inch on the field and take off. */
  const toTheAir = async () => {
    for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady').catch(() => false)); i += 1) {
      await sleep(500);
    }
    await ev(`const ui = window.__ui; ui.settings.map = 'field'; ui.settings.airframe = '5inch';
      ui.settings.graphics = 'low'; ui.onAction('fly', ui.settings); return 1;`);
    let ready = false;
    for (let i = 0; i < 260 && !ready; i += 1) {
      const m = await ev('return window.__map ? window.__map() : null');
      ready = Boolean(m && m.ready);
      if (!ready) {
        await sleep(500);
      }
    }
    if (!ready) {
      throw new Error('the field never became ready');
    }
    await sleep(2000);
    if (!(await ev('return typeof window.__supportPrompt === "function"'))) {
      throw new Error('the shell has no window.__supportPrompt');
    }
    return ev(AIR);
  };
  try {
    const r = await toTheAir();
    console.log('  five inch on the field, in the air');
    check(r.airborne, 'the craft was in the air', `${r.above.toFixed(2)} m up`);
    check(r.fault === null, 'no frame faulted', r.fault || '');
    check(r.frames > 30, 'the shell kept drawing frames', `${r.frames} frames`);
    check(r.inFlight === 0, 'nothing over the flight', `${r.inFlight} up`);

    /* Pause, then Quit to title. */
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 5000).catch(() => {});
    check((await prompts()) === 0, 'paused: no prompt yet (the pause is not an exit)');
    await ev('window.__ui.act("title"); return 1;');
    await settle();
    const p = await ev(PROMPT);
    check(p.screen === 'title' && p.count === 1 && p.held === 'title', 'Pause, Quit to title: the prompt is up on the title, once',
      `${p.screen}, ${p.count} up, held on ${p.held}`);
    check(p.onBody, 'on the body, not inside a screen', '');
    check(p.closeHits && p.linkHits, 'its close button and its link are what a click lands on',
      `close ${p.closeHits}, link ${p.linkHits}`);
    check(p.marks === 1 && p.rid === '29846312', 'its coffee tier link has one question mark and the tier id whole', p.href);
    check(p.settings, 'it has a Settings button', '');

    /* x closes it, and it stays closed. */
    await ev('document.querySelector(".support-prompt-close").click(); return 1;');
    await sleep(600);
    check((await prompts()) === 0, 'x closes it, and it does not come back by itself');

    /* Escape on the title closes the prompt first and leaves the gate alone. */
    await ev('window.__ui.show("results"); return 1;');
    await settle();
    check((await prompts()) === 0, 'results: no prompt on the results screen itself');
    await ev('window.__ui.act("title"); return 1;');
    await settle();
    const q = await ev(PROMPT);
    check(q.screen === 'title' && q.count === 1, 'Results, Back to title: once, and on the title', `${q.screen}, ${q.count} up`);
    await ev('const u = window.__ui; u.craftGate = false; u.mode = "freestyle"; u.renderMenu(); return 1;');
    const gateBefore = await ev('return window.__ui.onGate()');
    await page.tap('Escape');
    await sleep(300);
    const gateAfter = await ev('return window.__ui.onGate()');
    check((await prompts()) === 0 && gateBefore === false && gateAfter === false,
      'Escape on the title closes the prompt and does not also walk back to the gate', `gate ${gateBefore} then ${gateAfter}`);

    /* The prompt yields to the tune question and to any dialog. */
    await ev('window.__ui.tuneAskTimer = 1; window.__ui.show("results"); window.__ui.act("title"); return 1;');
    await settle();
    check((await prompts()) === 0, 'a tune question pending for this exit: no prompt over it');
    await ev('window.__ui.tuneAskTimer = 0; window.__ui.show("results"); window.__ui.act("title"); return 1;');
    await settle();
    await ev('window.__ui.nameDialog.hidden = false; return 1;');
    await sleep(400);
    check((await prompts()) === 0, 'a dialog that opens while it is up takes it away');
    await ev('window.__ui.nameDialog.hidden = true; window.__ui.bugFiling = true; window.__ui.show("results"); window.__ui.act("title"); return 1;');
    await settle();
    check((await prompts()) === 0, 'a bug report being filed: no prompt over it');
    await ev('window.__ui.bugFiling = false; return 1;');

    /* Leaving the title removes it; coming back without flying shows nothing. */
    await ev('window.__ui.show("results"); window.__ui.act("title"); return 1;');
    await settle();
    check((await prompts()) === 1, 'another exit, another prompt');
    await ev('window.__ui.show("pilot"); return 1;');
    await settle();
    check((await prompts()) === 0, 'leaving the title removes it');
    await ev('window.__ui.show("title"); return 1;');
    await settle();
    await sleep(500);
    check((await prompts()) === 0, 'and coming back to the title without flying shows nothing');

    /* Restart is not an exit. */
    await ev('window.__ui.onAction("fly", window.__ui.settings); return 1;');
    await sleep(2500);
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 5000).catch(() => {});
    await ev('window.__ui.act("restart"); return 1;');
    await sleep(1500);
    check((await prompts()) === 0 && (await ev('return window.__ui.screen')) === 'flight', 'Restart from the pause menu: no prompt, back in flight');

    /* The Settings button. */
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 5000).catch(() => {});
    await ev('window.__ui.act("title"); return 1;');
    await settle();
    const opened = await ev(`const b = [...document.querySelectorAll('.support-prompt button')].find((x) => x.textContent === 'Settings');
      if (!b) { return { clicked: false }; }
      b.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { clicked: true, screen: window.__ui.screen, count: document.querySelectorAll('.support-prompt').length };`);
    check(opened.clicked && opened.screen === 'advanced' && opened.count === 0,
      'its Settings button opens the Advanced room and the prompt goes', JSON.stringify(opened));

    /* Off in Settings: nothing shows, no beacon. */
    await spy();
    await ev('window.__ui.settings.supportPrompts = false; window.__ui.show("results"); window.__ui.act("title"); return 1;');
    await settle();
    await sleep(500);
    const offBeacons = await ev('return window.__beacons.filter((u) => u.includes("stats")).length');
    check((await prompts()) === 0, 'Support prompts Off: an exit shows nothing');
    check(offBeacons === 0, 'and sends no beacon', String(offBeacons));
    await ev('window.__ui.settings.supportPrompts = true; window.__ui.show("results"); window.__ui.act("title"); return 1;');
    await settle();
    check((await prompts()) === 1, 'back On: the prompt returns');

    const off = await ev(OFF);
    check(off.kept === false, 'a stored Off is still Off when the settings are loaded again', String(off.kept));
    check(off.disabled === true, 'and the prompt module, which other pages use, reads it as Off', String(off.disabled));
    await ev(`const key = 'webfpv.settings.v3';
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...stored, supportPrompts: true }));
      localStorage.setItem('webfpv.support.disabled.v1', 'true'); return 1;`);

    /* The disabled key, across a reload. */
    await cdp.send('Page.reload', {}, sessionId);
    await sleep(1500);
    await toTheAir();
    await spy();
    await ev('window.__ui.act("pause"); window.__ui.act("title"); return 1;');
    await settle();
    await sleep(500);
    check((await prompts()) === 0 && (await ev('return window.__beacons.filter((u) => u.includes("stats")).length')) === 0,
      'webfpv.support.disabled.v1 set, after a reload: an exit shows nothing and sends no beacon');
    const late = await ev('return window.__frameFault ? window.__frameFault.message : null');
    const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
    check(late === null && uncaught.length === 0, 'no frame faulted and nothing threw, start to end',
      [late, ...uncaught.slice(0, 2)].filter(Boolean).join(' | '));
  } catch (e) {
    fails += 1;
    console.log(`  FAIL  the run did not complete: ${e.message}`);
  } finally {
    await page.close?.();
  }
  console.log(`\nlongflight-check: ${fails === 0 ? 'all pass' : `${fails} failed`}`);
  process.exit(fails);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
