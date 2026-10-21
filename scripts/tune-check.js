/*
 * tune-check.js: flight feel tuning on the real page, start to finish.
 *
 * WHY THIS EXISTS. scripts/tune-selftest.js proves the numbers in Node, and
 * lint:shell walks the menus on the harness page, but neither loads
 * index.html, and every promise this feature makes is made there: that a
 * pilot who never turns the mode on flies the quad that shipped, that a
 * slider moved on the ground reaches the module and the record key, that
 * thirty seconds of real airtime turns into a question at the end and that
 * nothing leaves the browser unless Send is pressed. So this flies the real
 * shell, on the field, in headless Chromium, and asks the page and the
 * module rather than the source.
 *
 * Five pages, because the situations must not share a profile:
 *
 *   STOCK       default settings. The module is called once, to seat the
 *               five inch's default Air grip of 110 (TUNE_DEFAULTS in
 *               src/share/tune.js, since 2026-10-21) and never again, the
 *               record key carries no suffix, the group is not drawn, and
 *               the page is what it was.
 *   ON, UNTOUCHED  the mode on and every slider on its default. Still
 *               stock, to the call: the group is drawn and the exports are
 *               not invoked beyond that one seating call.
 *               On a screen with room its card is raised once and retired
 *               at takeoff, and never beside the Weight card.
 *   TUNED       the mode on, Air grip 85. The module reads back 0.85, the
 *               key names it, a slider moved on the ground arrives, Reset
 *               goes home, and a real flight of thirty seconds ends in the
 *               question, the form and a ticket the board's own validator
 *               accepts.
 *   PHONE       thumb sticks on an 844 by 390 screen, which is where the
 *               block is tightest: the group fits between the plates and
 *               puts nothing new under itself, the card stays down, and
 *               upright the whole block is put away as it always was.
 *   MOTOR POWER the mode on, Motor power 110. The module says 1.1 and Air
 *               grip never reached it, the key names it, the keyboard's
 *               spring moved with it (hover sits lower on the stick), a
 *               slider moved on the ground arrives and Reset goes home, and
 *               a tune sent from it carries both numbers and is accepted by
 *               the board's own validator. The page the numbers come from.
 *               Whether that spring number holds altitude is not asked here:
 *               scripts/motor-kv-check.js flies it against the module.
 *
 * Overlap is judged against the Weight slider alone, never against nothing:
 * a 390 px wide desktop window already has the Weight block on the pack bar
 * (measured on main before this feature), and a check that fails on that
 * says nothing about this feature.
 *
 * Not deterministic to the bit, because the sticks are written on the frame
 * clock of a headless browser, so every flight assertion is an inequality.
 * Nothing here is a threshold on feel. Pictures go to a scratch directory
 * and are never committed.
 *
 * Usage: node scripts/tune-check.js [--no-flight]
 *   --no-flight  skip the thirty second flight and feed the end of flight
 *                question an injected flight instead. Seconds, not minutes.
 * Exit code is the number of failures.
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

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { hoverStickPercent } from '../configs/rates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.TUNE_SHOTS_DIR || join(tmpdir(), 'webfpv-tune-shots');
const NO_FLIGHT = process.argv.includes('--no-flight');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const check = (ok, what, got) => {
  fails += ok ? 0 : 1;
  console.log(`     ${ok ? 'pass' : 'FAIL'}  ${what}${got !== undefined && got !== '' ? `: ${got}` : ''}`);
};
const note = (text) => console.log(`  ${text}`);

/* The settings a page starts with, written before the first line of the app
 * runs: the same door a pilot's stored settings come through. */
const seedSettings = (patch) => `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(patch)});
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused */ }`;

/*
 * The board, stubbed, in the page. Every ticket the shell posts is recorded
 * whole and answered with the board's own shape. `__boardMode` 'old' answers
 * the way a board that predates the tune kind does, which is a 400 and a
 * sentence about kinds. Everything else goes to the real fetch, which fails
 * fast because no board is running here.
 */
function boardStub() {
  window.__posted = [];
  window.__boardMode = 'ok';
  const real = window.fetch.bind(window);
  window.fetch = (url, init) => {
    const u = String(url);
    if (/\/api\/bugs$/.test(u) && init && String(init.method).toUpperCase() === 'POST') {
      let body = null;
      try {
        body = JSON.parse(init.body);
      } catch (e) {
        body = null;
      }
      window.__posted.push(body);
      const json = { 'content-type': 'application/json' };
      if (window.__boardMode === 'old') {
        return Promise.resolve(new Response(
          JSON.stringify({ error: 'Pick a kind: crash, blocking, wrong, visual, feel or other.' }),
          { status: 400, headers: json },
        ));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true, id: 'bug-check0001' }), { status: 200, headers: json }));
    }
    return real(url, init);
  };
}

/* The board's own validator, when a checkout of it sits beside this one. */
async function boardValidator() {
  const candidates = [
    process.env.BOARD_DIR,
    join(ROOT, '..', 'WebFPVSimulator-LeaderBoard'),
    join(ROOT, '..', 'webfpvsimulator-leaderboard'),
  ].filter(Boolean);
  for (const dir of candidates) {
    const file = join(dir, 'src', 'validate.js');
    if (existsSync(file)) {
      const mod = await import(pathToFileURL(file).href);
      if (typeof mod.inspectBugCreate === 'function') {
        return mod.inspectBugCreate;
      }
    }
  }
  return null;
}

/* One page, flying: boots the shell, puts the aircraft on the field and
 * hands back the helpers every section uses. */
async function openFlight({
  patch = {}, width = 480, height = 300, touch = false, airframe = '5inch', seenAirHint = true,
}) {
  const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe);
  const page = await openPage({
    root: ROOT,
    width,
    height,
    touch,
    url: '/index.html',
    seed: [
      seedSettings({
        ...seated, graphics: 'low', graphicsAuto: false, airframeAsked: true, ...patch,
      }),
      /* The Weight slider's own card, seen, unless a section is about it: it
       * keeps the block from fading while it is up, which is not what is
       * being asked in most of these. */
      seenAirHint ? 'try { localStorage.setItem("webfpv.airhint.v2", "1"); } catch (e) {}' : '',
      `(${boardStub.toString()})();`,
    ].filter(Boolean),
  });
  const ev = async (expr) => {
    const r = await page.cdp.send('Runtime.evaluate', {
      expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true,
    }, page.sessionId);
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    }
    return r.result.value;
  };
  for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady').catch(() => false)); i += 1) {
    await sleep(500);
  }
  await ev(`const ui = window.__ui; ui.settings.map = 'field'; ui.settings.airframe = ${JSON.stringify(airframe)};
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
  await sleep(1500);
  const resize = (w, h) => page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  const shot = async (name) => {
    await mkdir(SHOTS, { recursive: true });
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    const file = join(SHOTS, `${name}.png`);
    await writeFile(file, Buffer.from(data, 'base64'));
    return file;
  };
  return {
    page, ev, resize, shot,
  };
}

/* What the page believes about the machine it is flying, in one read. */
const AIR = 'return window.__air();';

/*
 * In the page: hold three metres on a proportional-integral-derivative
 * throttle, hands off the other sticks, until `until` says stop or `cap`
 * seconds of wall clock pass. Straight up and down is enough: the question
 * is about airtime, not about flying anywhere.
 */
const hold = (until, capS, target = 3) => `
  const target = ${target};
  let hover = window.__hover || 0.5;
  let prev = null;
  const out = { faulted: false, capped: false, maxAbove: 0, aloftClass: false, bothCards: false };
  const shown = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden'; };
  await new Promise((done) => {
    const t0 = performance.now();
    function f(now) {
      const t = (now - t0) / 1000;
      const g = window.__ground();
      out.maxAbove = Math.max(out.maxAbove, g.above);
      const air = document.querySelector('.osd-air');
      if (air && air.className.includes('is-aloft')) { out.aloftClass = true; }
      if ([...document.querySelectorAll('.osd-air-hint')].filter(shown).length > 1) { out.bothCards = true; }
      let thr = 0.65;
      if (t >= 0.9) {
        const dt = prev ? Math.max(0.001, (now - prev.t) / 1000) : 0.016;
        const vz = prev ? (g.above - prev.above) / dt : 0;
        const err = target - g.above;
        hover = Math.min(0.7, Math.max(0.3, hover + 0.03 * err * dt));
        thr = Math.min(0.85, Math.max(0.2, hover + 0.08 * err - 0.05 * vz));
      }
      prev = { t: now, above: g.above };
      window.__stick(0, 0, 0, thr);
      window.__hover = hover;
      if (window.__frameFault) { out.faulted = true; }
      if (${until} || out.faulted) {
        done();
      } else if (t > ${capS}) {
        out.capped = true;
        done();
      } else {
        requestAnimationFrame(f);
      }
    }
    requestAnimationFrame(f);
  });
  window.__stick(0, 0, 0, 0);
  return out;`;

/* The slider rows and the card, as a pilot would find them. */
const GROUP = `
  const box = document.querySelector('.osd-tune');
  const vis = (n) => {
    if (!n) { return false; }
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const items = [...document.querySelectorAll('.osd-tune-item')];
  const caps = items.filter(vis).map((n) => n.querySelector('.osd-air-cap').textContent);
  const hint = document.querySelector('.osd-tune-hint');
  const reset = document.querySelector('.osd-tune-reset');
  return {
    drawn: vis(box), caps, hintUp: vis(hint), resetUp: vis(reset),
    blockClass: (document.querySelector('.osd-air') || {}).className || '',
  };`;

/*
 * Where the group is and what it added. The block is measured twice, with the
 * group put away and with it shown, and what it sits on the second time but
 * not the first is the feature's doing. Elements are named by class, because
 * their sizes move with the block.
 */
const LAYOUT = `
  const air = document.querySelector('.osd-air');
  const tune = document.querySelector('.osd-tune');
  const vis = (n) => {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const sitsOn = () => {
    const rect = air.getBoundingClientRect();
    const names = new Set();
    const osd = document.querySelector('.osd');
    for (const n of osd ? osd.querySelectorAll('*') : []) {
      if (n.closest('.osd-air') || !vis(n)) { continue; }
      const hasText = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!hasText && n.children.length) { continue; }
      const r = n.getBoundingClientRect();
      const w = Math.min(r.right, rect.right) - Math.max(r.left, rect.left);
      const h = Math.min(r.bottom, rect.bottom) - Math.max(r.top, rect.top);
      if (w > 2 && h > 2) { names.add(String(n.className || n.tagName)); }
    }
    return [...names];
  };
  const drawn = vis(tune);
  const rect = tune.getBoundingClientRect();
  const was = tune.hidden;
  tune.hidden = true;
  const without = sitsOn();
  tune.hidden = was;
  const withIt = sitsOn();
  return {
    drawn, without, added: withIt.filter((c) => !without.includes(c)),
    rect: { l: Math.round(rect.left), t: Math.round(rect.top), r: Math.round(rect.right), b: Math.round(rect.bottom) },
    view: { w: innerWidth, h: innerHeight },
  };`;

/* Stock, to the call: the five inch's defaults, Air grip 110 and Motor power
 * 100, seated with the one call that takes the module off its own 1.0. */
const isStock = (a) => a.airScale === 1.1 && a.kvScale === 1 && a.calls === 1 && a.tuned === false
  && a.flown === null && !/\.[ak]\d+$/.test(a.key);

/* ------------------------------------------------------------------ */
/* 1. A page that never turned the mode on                             */
/* ------------------------------------------------------------------ */

async function stockPage() {
  note('STOCK: default settings, five inch on the field');
  const { page, ev, shot } = await openFlight({});
  try {
    const a = await ev(AIR);
    check(a.tuning === false, 'tuning is off by default', String(a.tuning));
    check(isStock(a), 'on the ground the page holds stock and called the module once, to seat Air grip 110', JSON.stringify({
      airScale: a.airScale, kvScale: a.kvScale, calls: a.calls, key: a.key.slice(-14),
    }));
    check(a.moduleAir === 1.1, 'the module holds air 1.1', String(a.moduleAir));
    const g = await ev(GROUP);
    check(g.drawn === false && g.hintUp === false, 'the tuning group is not drawn and its card is not up', JSON.stringify({ drawn: g.drawn, hint: g.hintUp }));
    const up = await ev(hold('t > 3', 30));
    check(!up.faulted && up.maxAbove > 1, 'took off and flew three seconds', `${up.maxAbove.toFixed(1)} m up`);
    const b = await ev(AIR);
    check(isStock(b), 'in the air it is still stock and the module was not called again', JSON.stringify({ calls: b.calls, flown: b.flown }));
    check(b.moduleAir === 1.1, 'the module still holds air 1.1', String(b.moduleAir));
    await shot('stock-flight');
    const late = await ev('return window.__frameFault ? window.__frameFault.message : null');
    const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
    check(late === null && uncaught.length === 0, 'no frame faulted and nothing threw', [late, ...uncaught.slice(0, 2)].filter(Boolean).join(' | '));
    return b;
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* 2. The mode on and nothing touched                                  */
/* ------------------------------------------------------------------ */

async function untouchedPage() {
  note('ON, UNTOUCHED: the mode on, every slider on its default, on a screen with room');
  const {
    page, ev, resize, shot,
  } = await openFlight({ patch: { feelTuning: true }, width: 1280, height: 720, seenAirHint: false });
  try {
    const a = await ev(AIR);
    check(a.tuning === true && isStock(a), 'the mode on and nothing moved is stock, one seating call and no more', JSON.stringify({
      calls: a.calls, airScale: a.airScale, key: a.key.slice(-14),
    }));
    const g = await ev(GROUP);
    const asked = g.caps.join(' | ');
    check(g.drawn && g.caps.length >= 1 && g.caps.every((c) => /^(Air grip 110|Motor power 100)%$/.test(c)), 'on the ground the group is drawn, Air grip at 110 and Motor power at 100', asked);
    check(g.hintUp, 'and its card is up, once, on this first flight', String(g.hintUp));
    check(g.resetUp === false, 'Reset to stock is not offered at stock', String(g.resetUp));
    for (const [w, h, label] of [[1600, 900, 'desktop'], [1280, 720, 'laptop'], [960, 540, 'short desktop window']]) {
      await resize(w, h);
      await sleep(900);
      const s = await ev(LAYOUT);
      const inside = s.rect.l >= 0 && s.rect.t >= 0 && s.rect.r <= s.view.w && s.rect.b <= s.view.h;
      check(s.drawn && inside && s.added.length === 0, `${label} ${w}x${h}: the group is inside the screen and sits on nothing the Weight slider did not`,
        `${JSON.stringify(s.rect)} added [${s.added.join(', ')}]`);
      const cards = await ev(GROUP);
      const tall = h >= 561;
      check(cards.hintUp === tall, `${label}: the card is ${tall ? 'up' : 'not raised'}, because the screen is ${h} px tall`, String(cards.hintUp));
      await shot(`landed-${w}x${h}`);
    }
    await resize(1280, 720);
    await sleep(900);
    const up = await ev(hold('t > 2.5', 60));
    check(!up.faulted && up.maxAbove > 1, 'took off', `${up.maxAbove.toFixed(1)} m up`);
    check(up.bothCards === false, 'the two cards are never up together', String(up.bothCards));
    const b = await ev(AIR);
    check(b.tuning === true && isStock(b), 'in the air with the mode on and nothing moved it is still stock, no export called again', JSON.stringify({ calls: b.calls, flown: b.flown }));
    const seen = await ev('return localStorage.getItem("webfpv.tunehint.v1")');
    check(seen === '1', 'the card was retired and remembered at takeoff', String(seen));
    const late = await ev('return window.__frameFault ? window.__frameFault.message : null');
    const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
    check(late === null && uncaught.length === 0, 'no frame faulted and nothing threw', [late, ...uncaught.slice(0, 2)].filter(Boolean).join(' | '));
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* 2b. A phone, thumb sticks, where the block is tightest              */
/* ------------------------------------------------------------------ */

async function phonePage() {
  note('PHONE: thumb sticks, 844x390, the mode on and Air grip 85');
  const {
    page, ev, resize, shot,
  } = await openFlight({
    patch: { feelTuning: true, airGrip: 85 }, width: 844, height: 390, touch: true, seenAirHint: false,
  });
  try {
    const t = await ev('return window.__touch ? window.__touch() : null');
    check(t !== null, 'the page mounted the thumb sticks', t === null ? 'no window.__touch' : '');
    const a = await ev(AIR);
    check(a.moduleAir === 0.85 && /\.a85$/.test(a.key), 'the module and the key hold Air grip 85 on glass as well', JSON.stringify({ moduleAir: a.moduleAir, key: a.key.slice(-8) }));
    await sleep(600);
    const g = await ev(GROUP);
    check(g.drawn && g.caps.some((c) => /^Air grip 85%$/.test(c)), 'landed, the group is on the glass', g.caps.join(' | '));
    check(g.hintUp === false, 'and the card stays down on a 390 px tall screen', String(g.hintUp));
    const s = await ev(LAYOUT);
    const inside = s.rect.l >= 0 && s.rect.t >= 0 && s.rect.r <= s.view.w && s.rect.b <= s.view.h;
    check(inside && s.added.length === 0, 'it fits between the plates and sits on nothing the Weight slider did not',
      `${JSON.stringify(s.rect)} added [${s.added.join(', ')}]`);
    await shot('landed-phone-touch');
    await resize(390, 844);
    await sleep(900);
    const upright = await ev(GROUP);
    check(upright.drawn === false, 'held upright the whole block is put away, as it always was', String(upright.drawn));
    await shot('landed-phone-upright');
    await resize(844, 390);
    await sleep(900);
    const up = await ev(hold('t > 3', 60));
    check(!up.faulted && up.maxAbove > 1, 'took off on glass', `${up.maxAbove.toFixed(1)} m up`);
    check(up.aloftClass, 'and the block fades in the air', String(up.aloftClass));
    const late = await ev('return window.__frameFault ? window.__frameFault.message : null');
    const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
    check(late === null && uncaught.length === 0, 'no frame faulted and nothing threw', [late, ...uncaught.slice(0, 2)].filter(Boolean).join(' | '));
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* 3. A tuned flight and everything that follows it                    */
/* ------------------------------------------------------------------ */

const DIALOG = `
  const d = window.__ui.nameDialog;
  const up = Boolean(d) && !d.hidden;
  return {
    up,
    title: up && d.querySelector('h2') ? d.querySelector('h2').textContent : '',
    tune: up && Boolean(d.querySelector('.tune')),
    buttons: up ? [...d.querySelectorAll('button')].map((b) => b.textContent) : [],
    text: up ? d.textContent : '',
  };`;

const clickText = (label, scope = 'window.__ui.nameDialog') => `
  const b = [...${scope}.querySelectorAll('button')].find((x) => x.textContent === ${JSON.stringify(label)});
  if (!b) { return false; }
  b.click();
  return true;`;

async function dialogUp(ev, ms = 8000) {
  const t0 = Date.now();
  for (;;) {
    const d = await ev(DIALOG);
    if (d.up && d.tune) {
      return d;
    }
    if (Date.now() - t0 > ms) {
      return d;
    }
    await sleep(150);
  }
}

async function tunedPage(inspect) {
  note('TUNED: the mode on, Air grip 85');
  const { page, ev, resize, shot } = await openFlight({ patch: { feelTuning: true, airGrip: 85 } });
  try {
    const a = await ev(AIR);
    check(a.tuning && a.airGrip === 85 && a.airScale === 0.85, 'the page holds Air grip 85 as a scale of 0.85', JSON.stringify({ airGrip: a.airGrip, airScale: a.airScale }));
    check(a.moduleAir === 0.85, 'and the module says it has 0.85', String(a.moduleAir));
    check(a.calls === 1, 'with exactly one call to the module, for the one slider that moved', String(a.calls));
    check(/\.a85$/.test(a.key), 'the record key names it', a.key.slice(-12));
    check(a.tuned === true, 'the race knows laps are off the public board', String(a.tuned));
    const g = await ev(GROUP);
    check(g.drawn && g.caps.some((c) => /^Air grip 85%$/.test(c)), 'the Air grip row reads 85%', g.caps.join(' | '));
    check(g.resetUp, 'Reset to stock is offered', String(g.resetUp));

    /* A slider moved on the ground, the way the pointer moves it. */
    const move = `
      const r = document.querySelector('.osd-tune-item .osd-air-range');
      r.value = ${JSON.stringify('__V__')};
      r.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(d)));
      return 1;`;
    await ev(move.replace('"__V__"', '120'));
    const b = await ev(AIR);
    check(b.airGrip === 120 && b.airScale === 1.2 && b.moduleAir === 1.2, 'a slider moved to 120 reaches the module as 1.2', JSON.stringify({ airScale: b.airScale, moduleAir: b.moduleAir }));
    check(/\.a120$/.test(b.key), 'and the key follows', b.key.slice(-12));
    const stored = await ev(`return JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).airGrip`);
    check(stored === 120, 'and it was stored', String(stored));
    await ev(clickText('Reset to stock', 'document.querySelector(".osd-tune")'));
    await sleep(300);
    const c = await ev(AIR);
    check(c.airGrip === 110 && c.airScale === 1.1 && c.moduleAir === 1.1, 'Reset to stock sends the module back to the default, 1.1', JSON.stringify({ airScale: c.airScale, moduleAir: c.moduleAir }));
    check(!/\.[ak]\d+$/.test(c.key) && c.tuned === false, 'and the key and the race are stock again', c.key.slice(-12));
    const gg = await ev(GROUP);
    check(gg.resetUp === false, 'Reset to stock puts itself away', String(gg.resetUp));
    await ev(move.replace('"__V__"', '85'));
    const d = await ev(AIR);
    check(d.moduleAir === 0.85 && d.tuning, 'back to 85 for the flight', String(d.moduleAir));
    /* The calls so far are the ones the sliders above made; the flight must add none. */
    const callsBefore = d.calls;

    /* The flight. Real airtime, accumulated by the frame loop, or an
     * injected flight under --no-flight. */
    let flown = null;
    const g0 = await ev(GROUP);
    check(g0.hintUp === false, 'on this short screen the card is not raised', String(g0.hintUp));
    if (NO_FLIGHT) {
      const fade = await ev(hold('t > 3', 30));
      check(fade.aloftClass, 'the block fades while the quad is in the air', String(fade.aloftClass));
      await ev(`window.__stick(0, 0, 0, 0); return 1;`);
      await ev(`window.__ui.setTuneProbe(() => ({ key: '5inch:100:85:100', airframe: '5inch', weight: 100, airGrip: 85, motorKv: 100,
        gravityScale: 1, airtimeS: 41 })); return 1;`);
      flown = { ms: 41000, airGrip: 85 };
    } else {
      const t0 = Date.now();
      const up = await ev(hold('(window.__air().flown ? window.__air().flown.ms : 0) >= 30500', 240));
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      check(!up.faulted && !up.capped, 'flew until the log held thirty seconds of airtime', `${secs} s of wall clock`);
      check(up.aloftClass, 'the block faded while it was in the air', String(up.aloftClass));
      const e = await ev(AIR);
      flown = e.flown;
      check(flown !== null && flown.ms >= 30000, 'the flight log holds the airtime, in sim time', flown ? `${(flown.ms / 1000).toFixed(1)} s` : 'null');
      check(flown !== null && flown.key === '5inch:100:85:100', 'filed under the combination that was flown', flown ? flown.key : 'null');
      check(e.calls === callsBefore && e.moduleAir === 0.85, 'and the module was not touched again in the air', JSON.stringify({ calls: e.calls, before: callsBefore, moduleAir: e.moduleAir }));
    }

    /* The pause screen has the sliders as rows. */
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 8000).catch(() => {});
    const rows = await ev(`return window.__ui.items().map((i) => i.label)`);
    check(rows.includes('Air grip'), 'the pause menu has an Air grip row', rows.slice(0, 12).join(' | '));
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'flight'", 8000).catch(() => {});

    /* End the run through the real route to Results. */
    await ev('window.__stick(0, 0, 0, 0); window.__scoreFinish(); return 1;');
    await page.until("window.__ui.screen === 'results'", 8000).catch(() => {});
    const onResults = await ev('return window.__ui.screen');
    check(onResults === 'results', 'the run ended on the results screen', onResults);
    const rowNames = await ev('return window.__ui.items().map((i) => i.label)');
    check(rowNames.includes('Share this tune'), 'Results offers Share this tune', rowNames.join(' | '));
    await resize(1280, 720);
    const dlg = await dialogUp(ev, 9000);
    check(dlg.up && dlg.tune && /Did that feel better than stock\?/.test(dlg.title), 'a beat later the question is up', dlg.title);
    /* It names the sliders the module has: Motor power only when the build can answer it. */
    const caps = await ev('return window.__ui.tuneCaps');
    const want = `Weight 100%, Air grip 85%${caps.kv ? ', Motor power 100%' : ''}.`;
    check(dlg.text.includes(want), 'and it names what was flown, and only the sliders this build has', dlg.text.slice(0, 160));
    check(['Better than stock', 'Same or worse', 'Not now', 'Stop asking'].every((x) => dlg.buttons.includes(x)), 'with its four answers', dlg.buttons.join(' | '));
    await shot('question');
    const before = await ev('return window.__posted.length');
    await sleep(400);
    await ev(clickText('Not now'));
    await sleep(200);
    const closed = await ev(DIALOG);
    check(!closed.up, 'Not now closes it', JSON.stringify(closed.up));
    check((await ev('return window.__posted.length')) === before, 'and sends nothing', String(before));
    const wait = await ev('return window.__ui.tuneAsked.size');
    check(wait === 1, 'the combination is marked asked, so this session will not ask again', String(wait));

    /* The way back: the Share row opens the same form, nothing chosen. */
    await ev(`window.__ui.act('sharetune'); return 1;`);
    await sleep(500);
    let form = await ev(DIALOG);
    check(form.up && /Send your tune/.test(form.title), 'Share this tune opens the form', form.title);
    check(['Much better', 'Better', 'About the same', 'Worse'].every((x) => form.text.includes(x)), 'with all four verdicts and none chosen for the pilot', '');
    await shot('form');
    await ev(clickText('Send'));
    await sleep(300);
    form = await ev(DIALOG);
    check(/Pick how it felt compared with stock/.test(form.text), 'Send with no verdict asks for one and sends nothing', String(await ev('return window.__posted.length')));

    /* The form, filled in as a pilot would. */
    await ev(`
      const d = window.__ui.nameDialog;
      const pick = (t) => [...d.querySelectorAll('.feel-chip')].find((c) => c.textContent === t).click();
      pick('Better'); pick('Soft');
      const ta = d.querySelector('textarea'); ta.value = 'Carries further on the straights, still turns fine.';
      const nm = d.querySelector('input[type=text]'); nm.value = 'Checker';
      return 1;`);
    await ev('window.__boardMode = "old"; return 1;');
    await ev(clickText('Send'));
    await sleep(500);
    form = await ev(DIALOG);
    check(form.up && /has not been updated to take tunes yet/.test(form.text), 'a board that predates tunes gets a sentence a pilot can read, and the form stays', form.text.slice(-120));
    await ev('window.__boardMode = "ok"; return 1;');
    await ev(clickText('Send'));
    for (let i = 0; i < 20 && (await ev('return window.__posted.length')) < 2; i += 1) {
      await sleep(150);
    }
    const posted = await ev('return window.__posted');
    const body = posted[posted.length - 1];
    check(posted.length === 2 && body && body.kind === 'tune', 'Send posts one ticket of kind tune (the first, refused, is the old board test)', `${posted.length} posts`);
    if (body) {
      check(body.tune && body.tune.verdict === 'better' && body.tune.feel === 'soft', 'with the verdict and the feel word', JSON.stringify({ verdict: body.tune && body.tune.verdict, feel: body.tune && body.tune.feel }));
      check(body.tune && body.tune.airGrip === 85 && body.tune.motorKv === 100 && body.tune.weight === 100, 'with the numbers that were flown, not the ones the sliders say now', JSON.stringify({ g: body.tune.airGrip, k: body.tune.motorKv, w: body.tune.weight }));
      check(body.airframe === '5inch' && body.sim && /^[0-9a-f]{0,16}$/.test(body.sim.wasm) && /^[0-9a-z]{0,12}$/.test(body.sim.deploy), 'on the aircraft and the physics it came from', JSON.stringify({ a: body.airframe, sim: body.sim }));
      check(body.sim.wasm.length === 16, 'the physics fingerprint is the first sixteen hex characters of the module', body.sim.wasm);
      check(body.reporter === 'Checker' && /Carries further/.test(body.what), 'and the pilot\'s words and name', JSON.stringify({ reporter: body.reporter }));
      check(body.tune.airtimeS >= 30, 'with the airtime', String(body.tune.airtimeS));
      if (inspect) {
        const got = inspect(body);
        check(!got.error, 'and the board\'s own validator takes the ticket the page sent', got.error || 'accepted');
      } else {
        note('     skip  the board\'s own validator: no checkout of the board beside this one');
      }
    }
    const thanks = await ev(DIALOG);
    check(/Thanks/.test(thanks.title), 'the pilot is thanked', thanks.title);
    await ev(clickText('Close'));
    await sleep(200);
    const rowsAfter = await ev('return window.__ui.items().filter((i) => /tune/i.test(i.label)).map((i) => i.label + (i.disabled ? " (disabled)" : ""))');
    check(rowsAfter.some((r) => /^Tune sent \(disabled\)$/.test(r)), 'and the row reads Tune sent', rowsAfter.join(' | '));

    /* Stop asking turns the question off for good. */
    await ev(`const ui = window.__ui;
      ui.tuneAsked.clear();
      ui.resultsTune = null;
      ui.show('title');
      ui.setTuneProbe(() => ({ key: '5inch:100:115:100', airframe: '5inch', weight: 100, airGrip: 115, motorKv: 100, gravityScale: 1, airtimeS: 41 }));
      ui.maybeAskTune(ui.takeTuneFlight());
      return 1;`);
    const again = await dialogUp(ev, 6000);
    check(again.up && again.tune, 'a different combination is asked', again.title);
    await sleep(400);
    await ev(clickText('Stop asking'));
    await sleep(200);
    const off = await ev(`return JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).feelTuneAsk`);
    check(off === false, 'Stop asking is stored', String(off));
    await ev(`const ui = window.__ui;
      ui.setTuneProbe(() => ({ key: '5inch:100:120:100', airframe: '5inch', weight: 100, airGrip: 120, motorKv: 100, gravityScale: 1, airtimeS: 41 }));
      ui.maybeAskTune(ui.takeTuneFlight());
      return 1;`);
    await sleep(3200);
    const quiet = await ev(DIALOG);
    check(!quiet.up, 'and after it the question stays away', JSON.stringify(quiet.up));

    /* A flight that was too short is not asked about. */
    await ev(`const ui = window.__ui;
      ui.settings.feelTuneAsk = true;
      ui.setTuneProbe(() => ({ key: '5inch:100:130:100', airframe: '5inch', weight: 100, airGrip: 130, motorKv: 100, gravityScale: 1, airtimeS: 12 }));
      ui.maybeAskTune(ui.takeTuneFlight());
      return 1;`);
    await sleep(3200);
    const short = await ev(DIALOG);
    check(!short.up, 'twelve seconds in the air is not enough to be asked', JSON.stringify(short.up));

    const late = await ev('return window.__frameFault ? window.__frameFault.message : null');
    const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
    check(late === null && uncaught.length === 0, 'no frame faulted and nothing threw, start to end', [late, ...uncaught.slice(0, 2)].filter(Boolean).join(' | '));
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* 4. Motor power, now that the module has the export                  */
/* ------------------------------------------------------------------ */

/* A slider moved on the ground by its label, the way the pointer moves it. */
const moveSlider = (label, value) => `
  const item = [...document.querySelectorAll('.osd-tune-item')]
    .find((n) => n.querySelector('.osd-air-cap').textContent.startsWith(${JSON.stringify(label)}));
  const r = item.querySelector('.osd-air-range');
  r.value = ${JSON.stringify(String(value))};
  r.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(d)));
  return 1;`;

/* What the page's keyboard spring and the table it reads say, side by side. */
const SPRING = `
  const s = window.__ui.settings;
  return { cap: s.rates.throttleCap, af: s.airframe, w: s.weight, v: s.packVoltage, at: window.__input.kbHover };`;

async function motorPage(inspect) {
  note('MOTOR POWER: the mode on, Motor power 110, Air grip on its default');
  const { page, ev, shot } = await openFlight({ patch: { feelTuning: true, motorKv: 110, airGrip: 110 } });
  try {
    const caps = await ev('return window.__ui.tuneCaps');
    check(caps.kv === true && caps.air === true, 'this build has both exports, so both rows are drawn', JSON.stringify(caps));
    const a = await ev(AIR);
    check(a.motorKv === 110 && a.kvScale === 1.1 && a.moduleKv === 1.1, 'the page holds Motor power 110 as a scale of 1.1 and the module says it has 1.1',
      JSON.stringify({ motorKv: a.motorKv, kvScale: a.kvScale, moduleKv: a.moduleKv }));
    check(a.calls === 2 && a.airScale === 1.1 && a.moduleAir === 1.1, 'with two calls, one for Motor power and one seating the default Air grip of 1.1',
      JSON.stringify({ calls: a.calls, airScale: a.airScale, moduleAir: a.moduleAir }));
    check(/\.k110$/.test(a.key) && !/\.a\d+/.test(a.key) && a.tuned === true, 'the record key names it and the race knows laps are off the public board', a.key.slice(-12));
    const g = await ev(GROUP);
    check(g.drawn && g.caps.includes('Motor power 110%') && g.caps.includes('Air grip 110%'), 'both rows are drawn, Motor power at 110% and Air grip at 110%', g.caps.join(' | '));
    check(g.resetUp, 'Reset to stock is offered', String(g.resetUp));
    await shot('landed-motor-power');

    /* The keyboard's throttle springs to hover, and hover moved. */
    const sp = await ev(SPRING);
    const want = hoverStickPercent(sp.cap, sp.af, sp.w, sp.v, 110) / 100;
    const stock = hoverStickPercent(sp.cap, sp.af, sp.w, sp.v, 100) / 100;
    check(Math.abs(sp.at - want) < 1e-12 && sp.at < stock, 'the keyboard spring rests at the hover for Motor power 110, lower on the stick than stock',
      `${sp.at.toFixed(4)} against ${stock.toFixed(4)} stock`);

    /* A slider moved on the ground arrives, and the spring follows it. */
    await ev(moveSlider('Motor power', 90));
    const b = await ev(AIR);
    check(b.motorKv === 90 && b.kvScale === 0.9 && b.moduleKv === 0.9 && b.calls === 3, 'Motor power moved to 90 reaches the module as 0.9, one more call',
      JSON.stringify({ kvScale: b.kvScale, moduleKv: b.moduleKv, calls: b.calls }));
    check(/\.k90$/.test(b.key), 'and the key follows', b.key.slice(-12));
    const sp90 = await ev(SPRING);
    check(Math.abs(sp90.at - hoverStickPercent(sp90.cap, sp90.af, sp90.w, sp90.v, 90) / 100) < 1e-12 && sp90.at > stock,
      'the spring moved with it: hover sits higher on the stick at 90 than at stock', `${sp90.at.toFixed(4)}`);
    await ev(moveSlider('Air grip', 120));
    const c = await ev(AIR);
    check(c.moduleAir === 1.2 && c.moduleKv === 0.9 && /\.a120\.k90$/.test(c.key), 'both sliders at once reach the module and the key names both',
      JSON.stringify({ moduleAir: c.moduleAir, moduleKv: c.moduleKv, key: c.key.slice(-12) }));
    await ev(clickText('Reset to stock', 'document.querySelector(".osd-tune")'));
    await sleep(300);
    const d = await ev(AIR);
    check(d.moduleKv === 1 && d.moduleAir === 1.1 && !/\.[ak]\d+$/.test(d.key) && d.tuned === false, 'Reset to stock sends both back to the defaults, 1.0 and 1.1, and the key and the race are stock again',
      JSON.stringify({ moduleKv: d.moduleKv, moduleAir: d.moduleAir, key: d.key.slice(-12) }));
    const sp100 = await ev(SPRING);
    check(Math.abs(sp100.at - stock) < 1e-12, 'and the keyboard spring is back at the stock hover, to the last bit', `${sp100.at}`);
    await ev(moveSlider('Motor power', 110));
    const e = await ev(AIR);
    check(e.moduleKv === 1.1, 'back to 110 for the flight', String(e.moduleKv));
    const callsBefore = e.calls;

    /* Aloft: the module is not touched again, and the question names Motor power. */
    const up = await ev(hold('t > 3', 60));
    check(!up.faulted && up.maxAbove > 1, 'took off with Motor power 110', `${up.maxAbove.toFixed(1)} m up`);
    const f = await ev(AIR);
    check(f.calls === callsBefore && f.moduleKv === 1.1, 'and the module was not touched again in the air', JSON.stringify({ calls: f.calls, before: callsBefore, moduleKv: f.moduleKv }));

    /* An injected flight stands in for the thirty seconds; tunedPage flies the real one. */
    await ev(`const ui = window.__ui;
      ui.show('title');
      ui.setTuneProbe(() => ({ key: '5inch:100:100:110', airframe: '5inch', weight: 100, airGrip: 100, motorKv: 110, gravityScale: 1.62, airtimeS: 41 }));
      ui.maybeAskTune(ui.takeTuneFlight());
      return 1;`);
    const dlg = await dialogUp(ev, 9000);
    check(dlg.up && dlg.text.includes('Weight 100%, Air grip 100%, Motor power 110%.'), 'the question names Motor power with the other two', dlg.text.slice(0, 160));
    await sleep(400);
    await ev(clickText('Better than stock'));
    await sleep(500);
    await ev(`
      const d = window.__ui.nameDialog;
      const pick = (t) => [...d.querySelectorAll('.feel-chip')].find((c) => c.textContent === t).click();
      pick('Much better'); pick('Twitchy');
      d.querySelector('textarea').value = 'More punch out of corners.';
      d.querySelector('input[type=text]').value = 'Checker';
      return 1;`);
    await ev(clickText('Send'));
    for (let i = 0; i < 20 && (await ev('return window.__posted.length')) < 1; i += 1) {
      await sleep(150);
    }
    const posted = await ev('return window.__posted');
    const body = posted[posted.length - 1];
    check(posted.length === 1 && body && body.kind === 'tune', 'Send posts one ticket of kind tune', `${posted.length} posts`);
    if (body) {
      check(body.tune.motorKv === 110 && body.tune.kvScale === 1.1 && body.tune.airGrip === 100 && body.tune.airScale === 1,
        'carrying Motor power 110 and its scale of 1.1, and Air grip untouched', JSON.stringify({ k: body.tune.motorKv, ks: body.tune.kvScale, g: body.tune.airGrip }));
      check(/Motor power 110%/.test(body.what) && /motor 110/.test(body.title), 'and the words and the title say so', body.title);
      if (inspect) {
        const got = inspect(body);
        check(!got.error && got.tune && got.tune.motorKv === 110, 'the board\'s own validator takes it and keeps Motor power 110', got.error || 'accepted');
      }
    }
    const late = await ev('return window.__frameFault ? window.__frameFault.message : null');
    const uncaught = page.errors.filter((x) => x.startsWith('uncaught:'));
    check(late === null && uncaught.length === 0, 'no frame faulted and nothing threw', [late, ...uncaught.slice(0, 2)].filter(Boolean).join(' | '));
  } finally {
    await page.close();
  }
}

async function main() {
  const inspect = await boardValidator();
  try {
    await stockPage();
    await untouchedPage();
    await phonePage();
    await motorPage(inspect);
    await tunedPage(inspect);
  } catch (e) {
    fails += 1;
    console.log(`  FAIL  the run did not complete: ${e.stack || e.message}`);
  }
  console.log(`\ntune-check: ${fails === 0 ? 'all pass' : `${fails} failed`}  (pictures in ${SHOTS})`);
  process.exit(fails);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
