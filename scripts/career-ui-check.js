/*
 * career-ui-check.js: the career's screens, driven in the real shell the way
 * a pilot drives them.
 *
 * WHY THIS EXISTS. `npm run check:career` runs the career's logic in Node
 * (the judges, the progress record, the curriculum's words), and nothing
 * ever loaded its screens: a coverage run on 2026-11-06 found
 * src/career/screens.js, controller.js, style.js, visuals.js, icons.js and
 * sticks.js at nought. A rewrite of the cover could drop the Start button,
 * and every check would still be green.
 *
 * WHAT IT DOES, on a fresh browser, at a desktop size and a phone held
 * landscape:
 *
 *   the gate      Fly solo, and the Career card is under the cursor because
 *                 this browser has never flown a lesson; Enter opens it.
 *   the cover     the first lesson is up next, the licence card counts
 *                 nothing yet, and freestyle is locked.
 *   the tree      the current part is marked, a locked part says why, a
 *                 locked lesson refuses a click, Q and E walk the parts.
 *   a briefing    from the tree and from the cover, its Fly button waits
 *                 for the world, Esc goes back to where it came from.
 *   a pass        Lift Off flown on the throttle alone, by feedback on the
 *                 craft's height: the results say it finished, and the
 *                 medal and the time are in storage.
 *   the pause     a lesson's own rows, its briefing, and back into flight.
 *   Set my level  a Yes marked as known, the save code copied, a bad code
 *                 refused, a good one merged without losing a medal, the
 *                 whole tree opened, and the marks cleared.
 *   the fork      race or freestyle, and the choice saved.
 *   a fail        the Checkride, which one crash ends, dropped from a
 *                 height: the results say Crashed, storage has a run and no
 *                 medal, and Fly again flies it again.
 *   Paint Shop    a locked livery says how to earn it, an earned one goes
 *                 on the quad and into storage.
 *   leaving       Esc from the cover is the title again, the career hidden
 *                 and the pilot's own map seated, and the gate no longer
 *                 opens on the career.
 *
 * Every step asserts what the pilot would see (the screen, the words on
 * it, which button is lit) or what the career kept (localStorage), and no
 * face may scroll sideways. No uncaught error or console.error is allowed,
 * except the board this page cannot reach, which nobody runs here.
 *
 * NO STOPWATCH. Other browser checks share this box and a software
 * rasteriser frame can take 200 ms, so every wait is `until` on state,
 * never a fixed sleep standing in for one. The one short pause is the
 * quad picker's deaf period, and a negative ("the locked tile did not
 * open") is read straight after a synchronous click handler has run.
 *
 * FOUND BY THIS CHECK. It found four bugs on 2026-11-06, first printed as
 * `known` lines or stepped round, and each is a check now that it is
 * fixed: the returning visitor's cover opens on Fly solo, the first tap on
 * a part in the narrow tree opens it, Enter does not also click a button
 * the mouse left focused, and a lesson load walked away from lets go
 * without an error. PROGRESS.md has the repros. A bug found and not fixed
 * is printed as a `known` line, not counted, until it is.
 *
 * Not part of `npm run verify`. Run it as `npm run check:careerui`.
 * `--only=desktop` or `--only=phone` runs one size.
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
import { PARTS, LEVEL_QUESTIONS } from '../src/career/tree.js';
import { lessonById } from '../src/career/curriculum.js';
import { emptyProgress, recordRun, encodeSave } from '../src/career/progress.js';
import { LIVERIES } from '../src/render/livery.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

const SIZES = [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'phone', width: 844, height: 390, touch: true },
];

/* A save from another browser: the whole trunk and the Rookie Licence flown,
 * each a bronze in a time slower than anything this check flies, so a merge
 * that kept the worse time would show. Made with the career's own encoder. */
const TRUNK = PARTS.filter((p) => p.branch === 'trunk').flatMap((p) => p.lessons);
const CODE = (() => {
  const p = emptyProgress();
  const when = new Date('2026-11-01T00:00:00Z');
  for (const id of TRUNK) {
    recordRun(p, id, { complete: true, ms: 999000, medal: 'bronze', score: 0 }, when);
  }
  return encodeSave(p);
})();

/* The board is never asked: another check on this box may have one up at
 * the address the page names, and its answers are not this check's. A
 * request for it fails as an unreachable board does, which the career
 * already handles (a lesson flies its stand in). */
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
} catch (e) { /* the run boots on the defaults */ }`];

/* The page's own view of the career, in one read. */
const VIEW = `(() => {
  const root = document.getElementById('career');
  const face = root ? root.querySelector('.cr-screen:not([hidden])') : null;
  const on = root && root.dataset.screen ? root.querySelector({
    cover: '.cr-cover', tree: '.cr-tree', fork: '.cr-fork', level: '.cr-level', briefing: '.cr-brief',
    results: '.cr-results', paint: '.cr-paint', flight: '.cr-hud',
  }[root.dataset.screen] || '.none') : null;
  const txt = (sel) => { const n = on && on.querySelector(sel); return n ? n.textContent.trim() : null; };
  const focus = on ? on.querySelector('.is-focus') : null;
  let progress = null;
  try { progress = JSON.parse(localStorage.getItem('webfpv.career.v2') || 'null'); } catch (e) { progress = 'unreadable'; }
  return {
    state: window.__career && window.__career.state ? window.__career.state() : null,
    screen: root ? (root.hidden ? '' : root.dataset.screen) : null,
    menu: document.body.classList.contains('career-menu'),
    flightBody: document.body.classList.contains('career-flight'),
    ui: window.__ui.screen,
    focus: focus ? focus.textContent.replace(/\\s+/g, ' ').trim().slice(0, 160) : null,
    overflowX: on && on.classList.contains('cr-screen') ? on.scrollWidth - on.clientWidth : 0,
    pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    title: txt('.cr-title-text'),
    progress,
    livery: (() => { try { return localStorage.getItem('webfpv.livery'); } catch (e) { return 'unreadable'; } })(),
  };
})()`;

let fails = 0;
let passes = 0;
let knownBugs = 0;

async function run(size) {
  console.log(`\n${size.name} ${size.width}x${size.height}${size.touch ? ' touch' : ''}`);
  const page = await openPage({
    root: ROOT, width: size.width, height: size.height, touch: size.touch, seed,
  });
  const { cdp, sessionId } = page;
  const check = (what, ok, got = '') => {
    if (ok) {
      passes += 1;
    } else {
      fails += 1;
    }
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${got === '' ? '' : `: ${got}`}`);
    return ok;
  };
  const view = () => page.evaluate(VIEW);
  const state = (s) => `window.__career && window.__career.state() === ${JSON.stringify(s)}`;
  const fits = (v, where) => check(`${where} does not scroll sideways`, v.overflowX <= 1 && v.pageOverflowX <= 1, `face ${v.overflowX} px, page ${v.pageOverflowX} px`);

  /* A finger on a phone, the mouse on a desktop. A tap's target is fixed
   * where the finger lands; a mouse's is wherever the pointer is when the
   * button comes up, so the two are not the same test on a list that
   * scrolls when hovered (see PROGRESS.md, 2026-11-06). */
  const press = async (x, y) => {
    if (size.touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }, sessionId);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
      return;
    }
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', {
        type, x, y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1,
      }, sessionId);
    }
  };

  /* A real click or tap on the middle of the first element matching `sel`
   * whose text includes `text`, after scrolling it into view. It fails the
   * step when something else is on top of it, which is a click a pilot
   * could not make. */
  const click = async (sel, text = '', { keepFocus = false } = {}) => {
    const at = await page.evaluate(`(() => {
      const root = document.getElementById('career');
      const all = [...root.querySelectorAll(${JSON.stringify(sel)})].filter((n) => n.offsetParent !== null || n.getClientRects().length);
      const n = all.find((x) => x.textContent.includes(${JSON.stringify(text)}));
      if (!n) { return null; }
      n.scrollIntoView({ block: 'center', inline: 'center' });
      const r = n.getBoundingClientRect();
      const x = r.left + r.width / 2; const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, hit: Boolean(hit && (hit === n || n.contains(hit))), on: hit ? (hit.className || hit.tagName) + '' : '' };
    })()`);
    if (!at) {
      check(`there is a ${sel} reading "${text}" to click`, false, 'not found');
      return false;
    }
    if (!at.hit) {
      check(`"${text || sel}" is not covered where the pilot clicks`, false, `covered by ${at.on}`);
      return false;
    }
    await press(at.x, at.y);
    /* The hand comes off the mouse, as it does before the keys: a pointer
     * left over a part would take the cursor back to it on the next layout,
     * because hovering moves the cursor by design. */
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -20, y: -20 }, sessionId);
    /* And the clicked button lets go of the browser's focus, as a hand that
     * goes to the keys would leave it, unless the step is about that
     * focus. Left focused, Enter used to click it natively as well as
     * pressing the career's own cursor (PROGRESS.md, 2026-11-06); the one
     * step that keeps it asserts that it no longer does. */
    if (keepFocus) {
      return true;
    }
    await page.evaluate("(() => { const a = document.activeElement; if (a && a !== document.body && !/^(TEXTAREA|INPUT)$/.test(a.tagName)) { a.blur(); } return 1; })()");
    return true;
  };
  const tap = (code) => page.tap(code);
  /* Walk the pause menu's cursor down to a row, a key at a time, each step
   * waited for on the cursor itself. */
  const pauseRow = async (action) => {
    for (let i = 0; i < 20; i += 1) {
      const at = await page.evaluate('window.__ui.cursor');
      if (await page.evaluate(`(window.__ui.items()[window.__ui.cursor] || {}).action === ${JSON.stringify(action)}`)) {
        return;
      }
      await tap('ArrowDown');
      await page.until(`window.__ui.cursor !== ${at}`);
    }
    throw new Error(`no ${action} row in the pause menu`);
  };

  /* Lift Off on the throttle alone. Angle mode holds the quad level, so a
   * climb to two metres, a hold, and a slow sink is the whole lesson. The
   * hover throttle is learned by an integrator rather than written down,
   * and the loop reads the craft's height and climb rate every frame, so
   * a slow frame is a slow hand, not a different answer. */
  /* The world is not drawn while the script flies: the pilot's loop is one
   * look a frame, and on a loaded box a drawn frame can take half a second,
   * which is a hand too slow to hold a hover. The career's display is DOM
   * and is still painted. */
  const flyLiftOff = () => page.evaluate(`window.__drawOff(true), new Promise((done) => {
    let y0 = null; let hov = 0.3; let last = performance.now(); let landAt = null;
    const t0 = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      const s = window.__career.state();
      if (s !== 'flight' || now - t0 > 240000) { window.__stick(); window.__drawOff(false); done(s); return; }
      const c = window.__craftState();
      const st = window.__career.status();
      if (y0 == null) { y0 = c.worldY; }
      const h = c.worldY - y0;
      const vy = c.vel ? c.vel.y : 0;
      const idx = st ? st.index : 0;
      let want;
      if (idx < 2) {
        want = Math.max(-0.7, Math.min(0.9, 0.8 * (2 - h)));
      } else {
        if (landAt == null) { landAt = now; }
        want = c.landed ? -1 : -0.45;
      }
      /* On the pad and asked to climb, the hover guess was too low: raise it
       * until the quad lifts, which is what a thumb does. */
      if (c.landed && idx < 2) {
        hov = Math.min(0.7, hov + 0.12 * dt);
      } else if (!c.landed) {
        hov = Math.max(0.08, Math.min(0.7, hov + 0.05 * (want - vy) * dt));
      }
      const thr = c.landed && idx >= 2 ? 0 : Math.max(0, Math.min(1, hov + 0.07 * (want - vy)));
      window.__stick(0, 0, 0, thr);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`);

  try {
    await page.until('!!window.__shellReady', 180000);
    const mapBefore = await page.evaluate('window.__ui.settings.map');

    /* ---------------- the gate ---------------- */
    let v = await view();
    check('boot: the title gate, the career not loaded', v.ui === 'title' && v.state === null, `${v.ui}, career ${v.state}`);
    await tap('Enter');
    await page.until("window.__ui.gatePageNow() === 'solo'");
    const card = await page.evaluate('(() => { const it = window.__ui.items()[window.__ui.cursor]; return it ? it.action + "|" + it.label : null; })()');
    check('Fly solo opens with the cursor on the Career card (never flown)', card === 'career|Career', card);
    await tap('Enter');
    await page.until(state('cover'), 60000);

    /* ---------------- the cover ---------------- */
    v = await view();
    const first = lessonById('1-1');
    check('the cover is up over a hidden shell', v.screen === 'cover' && v.menu, `${v.screen}, menu ${v.menu}`);
    const cover = await page.evaluate(`(() => {
      const c = document.querySelector('#career .cr-cover');
      const t = (s) => { const n = c.querySelector(s); return n ? n.textContent.trim() : null; };
      return {
        next: t('.cr-continue-title .cr-title-text'), go: t('.cr-continue .cr-btn-label'),
        licence: (t('.cr-licence-line') || '').trim(), free: c.querySelector('.cr-way-freestyle').classList.contains('is-locked'),
        race: c.querySelector('.cr-way-race').classList.contains('is-locked'),
        lettered: !!c.querySelector('.cr-cover-title canvas.cr-letters'),
      };
    })()`);
    check('up next is the first lesson, and the button says Start', cover.next === first.title && cover.go === 'Start', `${cover.next} / ${cover.go}`);
    check('the licence card counts nothing flown', /^0 stars, 0 of \d+ lessons$/.test(cover.licence || ''), cover.licence);
    check('both ways are locked before the Rookie Licence', cover.free && cover.race, `race ${cover.race}, freestyle ${cover.free}`);
    check('the title is lettered on a canvas', cover.lettered);
    check('the cursor starts on Start', /^Start/.test(v.focus || ''), v.focus);
    fits(v, 'the cover');
    /* On a desktop the cover's foot, Back and the save note, is above the
     * key bar on the first view, not under it (core.md CORE-21: clipped at
     * 1280x720). A phone's cover is a list that scrolls, and is not asked. */
    if (!size.touch) {
      const foot = await page.evaluate(`(() => {
        const c = document.querySelector('#career .cr-cover');
        const bar = c.querySelector('.cr-legend').getBoundingClientRect();
        const back = [...c.querySelectorAll('.cr-cover-foot .cr-btn')].find((b) => /Back/.test(b.textContent));
        const note = c.querySelector('.cr-save-note');
        const low = Math.max(back ? back.getBoundingClientRect().bottom : 1e9, note ? note.getBoundingClientRect().bottom : 1e9);
        return { scroll: c.scrollTop, low: Math.round(low), bar: Math.round(bar.top) };
      })()`);
      check('the cover\'s Back and save note sit above the key bar', foot.scroll === 0 && foot.low <= foot.bar, JSON.stringify(foot));
    }

    /* ---------------- the tree ---------------- */
    await tap('KeyT');
    await page.until(state('tree'));
    v = await view();
    const tree = await page.evaluate(`(() => {
      const t = document.querySelector('#career .cr-tree');
      const parts = [...t.querySelectorAll('.cr-part')];
      const by = (name) => parts.find((p) => p.querySelector('.cr-part-name').textContent === name);
      return {
        parts: parts.length,
        current: (by('First Hover') || {}).className || '',
        next: (by('Angle Navigation') || {}).className || '',
        sheet: t.querySelector('.cr-sheet-title') ? t.querySelector('.cr-sheet-title').textContent : null,
        tiles: [...t.querySelectorAll('.cr-sheet .cr-tile')].map((x) => (x.classList.contains('is-locked') ? 'L' : 'o') + x.querySelector('.cr-tile-name').textContent),
        links: t.querySelectorAll('.cr-links path').length,
      };
    })()`);
    check('the tree draws every part', tree.parts === PARTS.length, `${tree.parts} of ${PARTS.length}`);
    check('First Hover is where the pilot is', /is-current/.test(tree.current) && /is-open|is-current/.test(tree.current), tree.current);
    check('Angle Navigation is locked', /is-locked/.test(tree.next), tree.next);
    check('the sheet is First Hover\'s, first lesson open and the rest locked', tree.sheet === 'First Hover' && tree.tiles[0] === `o${first.title}` && tree.tiles.slice(1).every((x) => x[0] === 'L'), `${tree.sheet}: ${tree.tiles.join(', ')}`);
    await page.until("document.querySelectorAll('#career .cr-tree .cr-links path').length > 0");
    check('the links between parts are drawn', true);
    fits(v, 'the tree');
    /* A locked lesson refuses. The tile's handler runs in the click, so the
     * state read straight after it is the answer. */
    if (await click('.cr-sheet .cr-tile', lessonById('1-2').title)) {
      v = await view();
      check('a locked lesson does not open', v.state === 'tree', v.state);
    }
    let partFocused = false;
    if (await click('.cr-part', 'Angle Navigation', { keepFocus: true })) {
      partFocused = await page.evaluate("(() => { const a = document.activeElement; return Boolean(a && a.closest && a.closest('.cr-part') && a.textContent.includes('Angle Navigation')); })()");
      /* A part that is not the chosen one, tapped on a narrow tree. The
       * tap's mouseover used to choose it, which scrolled it to the top of
       * the list (screens.js markTree), and the click landed on whatever
       * was under the finger after the scroll. Found by this check on
       * 2026-11-06; in the list a hover chooses nothing now. */
      check('the first click on a part opens its lessons', await page.evaluate("!document.querySelector('#career .cr-part.is-focus')"));
      const said = await page.evaluate("document.querySelector('#career .cr-sheet .cr-panel-line').textContent");
      check('a locked part says what opens it', /Finish First Hover to open it/.test(said), said);
    }
    /* The click opened the part's lessons; Esc steps back to the parts,
     * and does not leave the tree. */
    await tap('Escape');
    await page.until("document.querySelector('#career .cr-part.is-focus') !== null");
    v = await view();
    check('Esc in a part\'s lessons is back to the parts, still on the tree', v.state === 'tree', `${v.state}, focus ${v.focus}`);
    await tap('KeyE');
    await page.until("document.querySelector('#career .cr-sheet-title').textContent === 'Switching to Acro'");
    check('E walks to the next part', true);
    await tap('KeyQ');
    await tap('KeyQ');
    await page.until("document.querySelector('#career .cr-sheet-title').textContent === 'First Hover'");
    check('Q walks back', true);
    /* Angle Navigation still has the browser's focus from its click (when
     * the browser gave it one). Enter is the career's alone: it opens First
     * Hover, where the cursor is, and does not click Angle Navigation too. */
    await tap('Enter');
    await page.until("document.querySelector('#career .cr-sheet .cr-tile.is-focus') !== null");
    const opened = await page.evaluate("document.querySelector('#career .cr-sheet-title').textContent");
    check('Enter opens the part under the cursor, not the button the mouse left focused', opened === 'First Hover', `${opened}${partFocused ? '' : ' (the click left no focus, so this step proves less)'}`);
    await page.until("(() => { const f = document.querySelector('#career .cr-sheet .cr-tile.is-focus'); return f && f.textContent.includes(" + JSON.stringify(first.title) + "); })()");
    check('Enter on a part puts the cursor on its first open lesson', true);
    await tap('Enter');
    await page.until(state('briefing'));

    /* ---------------- a briefing, from the tree ---------------- */
    v = await view();
    const brief = await page.evaluate(`(() => {
      const b = document.querySelector('#career .cr-brief');
      return {
        title: b.querySelector('.cr-brief-title .cr-title-text').textContent,
        place: b.querySelector('.cr-brief-hero .cr-kick').textContent,
        tags: [...b.querySelectorAll('.cr-tag')].map((x) => x.textContent),
        steps: b.querySelectorAll('.cr-steps li').length,
        sticks: b.querySelectorAll('.cr-brief-sticks svg').length,
        back: [...b.querySelectorAll('.cr-btn-label')].map((x) => x.textContent),
      };
    })()`);
    check('the briefing is Lift Off\'s', brief.title === first.title && /First Hover/.test(brief.place), `${brief.title}, ${brief.place}`);
    check('its tags say Angle and Chase camera', brief.tags.includes('Angle') && brief.tags.includes('Chase camera'), brief.tags.join(', '));
    check('its steps and its stick drawing are there', brief.steps === first.briefing.steps.length && brief.sticks > 0, `${brief.steps} steps, ${brief.sticks} drawings`);
    check('opened from the tree, Back goes to the tree', brief.back.includes('Back to the tree'), brief.back.join(', '));
    fits(v, 'the briefing');
    await page.until("(() => { const b = document.querySelector('#career .cr-brief .cr-btn.primary'); return b && !b.disabled; })()", 120000);
    const ready = await page.evaluate("document.querySelector('#career .cr-load').textContent");
    check('Fly is offered once the field is ready', /^Ready/.test(ready), ready);
    await tap('Escape');
    await page.until(state('tree'));
    v = await view();
    check('Esc from the briefing is the tree, on First Hover', await page.evaluate("document.querySelector('#career .cr-sheet-title').textContent") === 'First Hover', v.state);
    check('and the cursor is back on the lesson it opened', /Lift Off/.test(v.focus || '') && await page.evaluate("!!document.querySelector('#career .cr-sheet .cr-tile.is-focus')"), v.focus);
    await tap('Escape');
    await page.until("document.querySelector('#career .cr-part.is-focus') !== null");
    await tap('Escape');
    await page.until(state('cover'));
    check('Esc from the lessons, then from the parts, is the cover', true);

    /* ---------------- into flight, from the cover ---------------- */
    await tap('Enter');
    await page.until(state('briefing'));
    const back2 = await page.evaluate("[...document.querySelectorAll('#career .cr-brief .cr-btn-label')].map((x) => x.textContent)");
    check('opened from the cover, Back says Back', back2.includes('Back') && !back2.includes('Back to the tree'), back2.join(', '));
    await page.until("(() => { const b = document.querySelector('#career .cr-brief .cr-btn.primary'); return b && !b.disabled; })()", 120000);
    await tap('Enter');
    await page.until(state('flight'), 60000);
    v = await view();
    const hud = await page.evaluate(`(() => {
      const h = document.querySelector('#career .cr-hud');
      return { kicker: h.querySelector('.cr-obj-kicker').textContent, obj: h.querySelector('.cr-obj-text').textContent,
        list: h.querySelectorAll('.cr-list li').length, timer: h.querySelector('.cr-timer').textContent,
        shown: getComputedStyle(h).visibility };
    })()`);
    check('in flight: the shell flies under the career\'s display', v.flightBody && !v.menu && v.ui === 'flight', `career-flight ${v.flightBody}, menu ${v.menu}, ui ${v.ui}`);
    check('the display names the lesson and its first objective', hud.kicker.includes(first.title) && hud.obj === first.objectives[0].text, `${hud.kicker} / ${hud.obj}`);
    check('every objective is listed, and the clock waits for takeoff', hud.list === first.objectives.length && /TAKE OFF TO START/.test(hud.timer), `${hud.list} listed, ${hud.timer}`);
    check('the display is visible', hud.shown === 'visible', hud.shown);

    /* The pause menu is the lesson's. */
    await tap('Escape');
    await page.until("window.__ui.screen === 'paused'");
    const rows = await page.evaluate('window.__ui.items().map((i) => i.action)');
    check('the pause menu has the lesson\'s rows', ['career-briefing', 'career-hub', 'career-title'].every((a) => rows.includes(a)), rows.filter(Boolean).join(', '));
    await page.until("(() => { const h = document.querySelector('#career .cr-hud'); return getComputedStyle(h).visibility === 'hidden'; })()");
    check('the lesson\'s display hides under the pause menu', true);
    await pauseRow('career-briefing');
    await tap('Enter');
    await page.until(state('briefing'));
    v = await view();
    check('Briefing from the pause menu is the lesson\'s page, ready to fly', v.title === first.title && await page.evaluate("!document.querySelector('#career .cr-brief .cr-btn.primary').disabled"), v.title);
    await tap('Enter');
    await page.until(state('flight'), 60000);
    check('and Fly from it is a run again', true);

    /* ---------------- a pass ---------------- */
    const ended = await flyLiftOff();
    await page.until(state('results'), 30000).catch(() => {});
    v = await view();
    const res = await page.evaluate(`(() => {
      const r = document.querySelector('#career .cr-results');
      return { failed: r.classList.contains('is-failed'), word: (r.querySelector('.cr-res-word .cr-title-text') || {}).textContent,
        said: (r.querySelector('.cr-res-time span') || {}).textContent, buttons: [...r.querySelectorAll('.cr-res-actions .cr-btn-label')].map((x) => x.textContent),
        coach: (r.querySelector('.cr-res-coach .cr-balloon') || {}).textContent || '' };
    })()`).catch((e) => ({ error: e.message }));
    const rec = v.progress && v.progress.lessons ? v.progress.lessons['1-1'] : null;
    check('Lift Off flown on the throttle reaches the results', v.state === 'results', `ended in ${ended}`);
    check('the results say it finished', !res.failed && /Gold!|Silver!|Finished!/.test(res.word || ''), `${res.word}`);
    check('and that it is a first finish', /First finish\./.test(res.said || ''), res.said);
    /* A hover lesson: no top speed, which read as a fault ("Top speed
     * 2 km/h"), and the briefing's coach is still there on a pass, saying
     * what the lesson is for in the words the briefing used (fun.md FUN-12). */
    check('a hover lesson\'s results print no top speed', !/top speed/i.test(res.said || ''), res.said);
    check('the briefing\'s coach is on the results of a pass', res.coach.length > 0 && res.coach.startsWith(first.briefing.why.slice(0, 20)), res.coach.slice(0, 80));
    check('the medal and the time are saved', Boolean(rec && rec.medal && Number.isFinite(rec.bestMs) && rec.runs === 1 && v.progress.last === '1-1'), JSON.stringify(rec));
    check('Next offers the next lesson', (res.buttons || []).includes(`Next: ${lessonById('1-2').title}`), (res.buttons || []).join(', '));
    check('the lesson\'s display is gone over the results', v.menu && !v.flightBody, `menu ${v.menu}`);
    fits(v, 'the results');
    const flownMs = rec ? rec.bestMs : null;

    await tap('KeyT');
    await page.until(state('tree'));
    const after = await page.evaluate("[...document.querySelectorAll('#career .cr-sheet .cr-tile')].slice(0, 2).map((x) => x.className)");
    check('on the tree Lift Off wears its medal and Hold the Box is open', after[0].includes(`is-${rec && rec.medal}`) && !after[1].includes('is-locked'), after.join(' | '));
    await tap('Escape');
    await page.until(state('cover'));
    const cover2 = await page.evaluate("[document.querySelector('#career .cr-continue-title .cr-title-text').textContent, document.querySelector('#career .cr-continue .cr-btn-label').textContent, document.querySelector('#career .cr-licence-line').textContent.trim()]");
    check('the cover moves on to Hold the Box, and says Continue', cover2[0] === lessonById('1-2').title && cover2[1] === 'Continue', cover2.join(' / '));
    check('the licence card counts the lesson', /, 1 of \d+ lessons$/.test(cover2[2]) && !/^0 stars/.test(cover2[2]), cover2[2]);

    /* ---------------- a load walked away from ---------------- */
    /* Out and Back's briefing (its own field, One Gate), and before that
     * world is built, Lift Off's (the Training Field): the pilot has moved
     * on. The trunk's lessons share one field, so it has to be a lesson
     * from a branch. The first wait
     * used to poll on for 90 s and then log "took too long" as a
     * console.error into a career that had moved on (PROGRESS.md,
     * 2026-11-06). It lets go when the second lesson asks for its world,
     * so once that one is ready nothing is waiting. The harness hook opens
     * them because a key press is too slow a hand to beat a fast build. */
    const walked = await page.evaluate(`(async () => {
      const c = window.__career;
      c.open('7-1');
      for (let i = 0; i < 2000 && c.waits() === 0; i += 1) {
        await new Promise((r) => setTimeout(r, 0));
      }
      const pending = c.waits();
      c.open('1-1');
      return pending;
    })()`);
    await page.until(state('briefing'));
    await page.until("(() => { const b = document.querySelector('#career .cr-brief .cr-btn.primary'); return b && !b.disabled && /Lift Off/.test(document.querySelector('#career .cr-brief-title').textContent); })()", 120000);
    const waits = await page.evaluate('window.__career.waits()');
    check('a lesson load walked away from lets go when another lesson loads', walked > 0 && waits === 0, `${walked} waiting when the pilot moved on, ${waits} once the next was ready`);
    /* Opened as from the tree: Esc steps back out (the tree, its parts)
     * to the cover, each step waited for on what it changed. */
    const where = "(() => { const f = document.querySelector('#career .is-focus'); return window.__career.state() + '|' + (f ? f.className + f.textContent.slice(0, 40) : ''); })()";
    for (let i = 0; i < 4 && !(await page.evaluate(state('cover'))); i += 1) {
      const was = await page.evaluate(where);
      await tap('Escape');
      await page.until(`${where} !== ${JSON.stringify(was)}`);
    }
    await page.until(state('cover'));

    /* ---------------- Set my level ---------------- */
    await tap('KeyL');
    await page.until(state('level'));
    v = await view();
    const qs = await page.evaluate("document.querySelectorAll('#career .cr-level .cr-q').length");
    check('Set my level asks its questions', qs === LEVEL_QUESTIONS.length, `${qs} of ${LEVEL_QUESTIONS.length}`);
    fits(v, 'Set my level');
    const yes = await page.evaluate(`(() => {
      const row = [...document.querySelectorAll('#career .cr-q')].find((r) => r.textContent.includes(${JSON.stringify(LEVEL_QUESTIONS[0].text)}));
      const b = row.querySelector('.cr-choice');
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await press(yes.x, yes.y);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: -20, y: -20 }, sessionId);
    await page.until(`(() => { const row = [...document.querySelectorAll('#career .cr-q')].find((r) => r.textContent.includes(${JSON.stringify(LEVEL_QUESTIONS[0].text)})); return row && row.querySelector('.cr-choice').classList.contains('is-picked'); })()`);
    check('Yes is picked', true);
    await click('.cr-btn', 'Mark these as known');
    await page.until(state('tree'));
    v = await view();
    const known = v.progress ? v.progress.known : [];
    check('the parts a Yes takes are saved as known', LEVEL_QUESTIONS[0].parts.every((id) => known.includes(id)), JSON.stringify(known));
    const stamps = await page.evaluate("[...document.querySelectorAll('#career .cr-part.is-known .cr-part-name')].map((x) => x.textContent)");
    check('and the tree stamps them Known', stamps.includes('Angle Navigation'), stamps.join(', '));

    await tap('KeyL');
    await page.until(state('level'));
    await click('.cr-btn', 'Copy save code');
    await page.until("(() => { const f = document.querySelector('#career .cr-code'); return f && !f.hidden && f.value.length > 0; })()");
    const code = await page.evaluate("document.querySelector('#career .cr-code').value");
    check('Copy save code shows the code', /^WFPV2/.test(code), `${code.slice(0, 12)}...`);
    await click('.cr-btn', 'Load a code');
    await page.until("(() => { const f = document.querySelector('#career .cr-code'); return f && !f.readOnly && f.value === ''; })()");
    await click('.cr-code');
    await cdp.send('Input.insertText', { text: 'WFPV2-not-a-real-code' }, sessionId);
    await click('.cr-btn', 'Load this code');
    let said = await page.evaluate("document.querySelector('#career .cr-code-said').textContent");
    check('a code that does not read is refused, and says so', /did not read/.test(said), said);
    await page.evaluate("(() => { const f = document.querySelector('#career .cr-code'); f.select(); return 1; })()");
    await cdp.send('Input.insertText', { text: CODE }, sessionId);
    await click('.cr-btn', 'Load this code');
    said = await page.evaluate("document.querySelector('#career .cr-code-said').textContent");
    v = await view();
    const l11 = v.progress && v.progress.lessons ? v.progress.lessons['1-1'] : null;
    check('a good code loads', /^Loaded\./.test(said), said);
    check('the code\'s lessons are in storage', TRUNK.every((id) => v.progress.lessons[id] && v.progress.lessons[id].medal), `${TRUNK.filter((id) => v.progress.lessons[id]).length} of ${TRUNK.length}`);
    check('the merge keeps the better time flown here', l11 && l11.bestMs === flownMs, `${l11 && l11.bestMs} against ${flownMs}`);
    await click('.cr-btn', 'Open the whole tree');
    await page.until("(() => { const m = document.querySelector('#career .cr-level-message'); return m && /Every part of the tree is open/.test(m.textContent); })()");
    v = await view();
    check('Open the whole tree is saved', v.progress.openAll === true, String(v.progress.openAll));
    await click('.cr-btn', 'Clear what I marked');
    await page.until("(() => { const m = document.querySelector('#career .cr-level-message'); return m && /Nothing is marked as known/.test(m.textContent); })()");
    v = await view();
    check('Clear what I marked empties the marks and keeps the flying', v.progress.known.length === 0 && Boolean(v.progress.lessons['1-1'].medal), JSON.stringify(v.progress.known));
    await tap('Escape');
    await page.until(state('tree'));
    check('Esc from Set my level opened on the tree is the tree', true);

    /* ---------------- the fork ---------------- */
    await tap('Escape');
    await page.until(state('cover'));
    const go = await page.evaluate("document.querySelector('#career .cr-continue .cr-btn-label').textContent");
    check('with the Rookie Licence and no way chosen, the cover asks to pick a way', go === 'Pick a way', go);
    await tap('Enter');
    await page.until(state('fork'));
    v = await view();
    check('the fork offers race and freestyle', /Start racing/.test(v.focus || ''), v.focus);
    fits(v, 'the fork');
    await tap('ArrowRight');
    await page.until("(() => { const f = document.querySelector('#career .cr-fork .is-focus'); return f && /Start freestyle/.test(f.textContent); })()");
    check('the arrows move to freestyle', true);
    await tap('ArrowLeft');
    await page.until("(() => { const f = document.querySelector('#career .cr-fork .is-focus'); return f && /Start racing/.test(f.textContent); })()");
    await tap('Enter');
    await page.until(state('briefing'));
    v = await view();
    const raceFirst = (await page.evaluate("window.__career.state() && document.querySelector('#career .cr-brief-hero .cr-kick').textContent")) || '';
    check('Start racing saves the choice', v.progress.first === 'race', String(v.progress.first));
    check('and opens the first race lesson', v.title === lessonById('7-1').title, `${v.title} (${raceFirst})`);
    /* Its world is let finish before Esc. Backed out of while it builds,
     * and another lesson opened, its wait times out ninety seconds later
     * and logs a console.error for a load nobody is waiting for: a bug this
     * check found and reports (PROGRESS.md, 2026-11-06). */
    await page.until("(() => { const b = document.querySelector('#career .cr-brief .cr-btn.primary'); return b && !b.disabled; })()", 120000);
    await tap('Escape');
    await page.until(state('cover'));

    /* ---------------- a fail ---------------- */
    await tap('KeyT');
    await page.until(state('tree'));
    for (let i = 0; i < PARTS.length; i += 1) {
      if (await page.evaluate("document.querySelector('#career .cr-sheet-title').textContent === 'WebFPV Pro'")) {
        break;
      }
      const before = await page.evaluate("document.querySelector('#career .cr-sheet-title').textContent");
      await tap('KeyQ');
      await page.until(`document.querySelector('#career .cr-sheet-title').textContent !== ${JSON.stringify(before)}`);
    }
    const pro = await page.evaluate("[document.querySelector('#career .cr-sheet-title').textContent, document.querySelector('#career .cr-sheet .cr-tile').className]");
    check('with the whole tree open the crown\'s lesson can be opened', pro[0] === 'WebFPV Pro' && !pro[1].includes('is-locked'), pro.join(' | '));
    await tap('Enter');
    await tap('Enter');
    await page.until(state('briefing'));
    const check10 = lessonById('10-1');
    const tags = await page.evaluate("[...document.querySelectorAll('#career .cr-brief .cr-tag')].map((x) => x.textContent)");
    v = await view();
    check('the Checkride\'s briefing warns No crashes', v.title === check10.title && tags.includes('No crashes') && tags.includes('Acro'), `${v.title}: ${tags.join(', ')}`);
    await page.until("(() => { const b = document.querySelector('#career .cr-brief .cr-btn.primary'); return b && !b.disabled; })()", 120000);
    await tap('Enter');
    await page.until(state('flight'), 60000);
    /* Dropped from forty metres, throttle off and rolling: the ground's
     * hard hit, which is the shell's one defined crash. Rolling because a
     * level drop on grass perches (collide.js canPerch) and is a landing,
     * however fast. The attitude at the ground is the plant's to choose, so
     * a drop that perches anyway is flown again, three times at most. */
    let drops = 0;
    for (; drops < 3 && !(await page.evaluate(state('results'))); drops += 1) {
      await page.evaluate(`(() => {
        const c = window.__craftState();
        window.__stick(1, 0, 0, 0);
        window.__placeCraft(c.worldX, c.worldY + 40, c.worldZ);
        return 1;
      })()`);
      await page.until(`${state('results')} || window.__craftState().landed`, 60000).catch(() => {});
    }
    await page.evaluate('window.__stick()');
    v = await view();
    const fres = await page.evaluate(`(() => {
      const r = document.querySelector('#career .cr-results');
      return { failed: r.classList.contains('is-failed'), word: (r.querySelector('.cr-res-word .cr-title-text') || {}).textContent,
        tip: (r.querySelector('.cr-res-coach .cr-balloon') || {}).textContent, focus: (r.querySelector('.is-focus') || {}).textContent,
        reason: window.__career.status() && window.__career.status().failReason };
    })()`).catch((e) => ({ error: e.message }));
    const r10 = v.progress && v.progress.lessons ? v.progress.lessons['10-1'] : null;
    check('a crash in the Checkride ends it on the results', v.state === 'results' && fres.failed && fres.reason === 'crash', `${v.state}, failed ${fres.failed}, ${fres.reason}, ${drops} drop${drops === 1 ? '' : 's'}`);
    check('the results say Crashed! and give the tip', fres.word === 'Crashed!' && (fres.tip || '').length > 10, `${fres.word}: ${(fres.tip || '').slice(0, 60)}`);
    check('Fly again is the first thing offered', /^Fly again/.test(fres.focus || ''), fres.focus);
    check('storage has the run and no medal', Boolean(r10 && r10.runs === 1 && !r10.medal), JSON.stringify(r10));
    fits(v, 'the failed results');
    await tap('KeyR');
    await page.until(state('flight'), 60000);
    const ob = await page.evaluate("document.querySelector('#career .cr-hud .cr-obj-text').textContent");
    check('R flies it again, from its first objective', ob === check10.objectives[0].text, ob);
    await tap('Escape');
    await page.until("window.__ui.screen === 'paused'");
    await pauseRow('career-hub');
    await tap('Enter');
    await page.until(state('tree'));
    const onPro = await page.evaluate("document.querySelector('#career .cr-sheet-title').textContent");
    check('Back to the career is the tree, on the lesson\'s part', onPro === 'WebFPV Pro', onPro);
    /* The cursor is back on the lesson, so Esc is the parts first. */
    if (await page.evaluate("!!document.querySelector('#career .cr-sheet .cr-tile.is-focus')")) {
      await tap('Escape');
      await page.until("document.querySelector('#career .cr-part.is-focus') !== null");
    }
    await tap('Escape');
    await page.until(state('cover'));

    /* ---------------- the Paint Shop ---------------- */
    await tap('KeyP');
    await page.until(state('paint'));
    v = await view();
    const shop = await page.evaluate("[...document.querySelectorAll('#career .cr-livery')].map((t) => ({ id: t.dataset.livery, locked: t.classList.contains('is-locked'), on: t.classList.contains('is-on'), name: t.querySelector('.cr-livery-name').textContent }))");
    const earned = ['webfpv', ...PARTS.filter((p) => p.branch === 'trunk').map((p) => p.livery)];
    check('every livery is in the shop', shop.length === LIVERIES.length, `${shop.length} of ${LIVERIES.length}`);
    check('the house paint is on, and the trunk\'s liveries are earned', shop[0] && shop[0].on && shop.filter((t) => !t.locked).map((t) => t.id).sort().join() === earned.sort().join(), shop.filter((t) => !t.locked).map((t) => t.id).join(', '));
    fits(v, 'the Paint Shop');
    const lockedOne = shop.find((t) => t.locked);
    await click('.cr-livery', lockedOne.name);
    said = await page.evaluate("document.querySelector('#career .cr-paint-said').textContent");
    check('a locked livery says how to earn it, and is not painted', /^Fly every lesson of/.test(said) && (await view()).livery === null, said);
    const rookie = shop.find((t) => t.id === 'rookie');
    await click('.cr-livery', rookie.name);
    await page.until("(() => { const t = document.querySelector('#career .cr-livery.is-on'); return t && t.dataset.livery === 'rookie'; })()");
    v = await view();
    said = await page.evaluate("document.querySelector('#career .cr-paint-said').textContent");
    check('an earned livery goes on the quad and into storage', v.livery === 'rookie' && said.includes('on your quad'), `${v.livery}: ${said}`);
    const name0 = await page.evaluate("document.querySelector('#career .cr-paint-name').textContent");
    await tap('ArrowRight');
    await page.until(`document.querySelector('#career .cr-paint-name').textContent !== ${JSON.stringify(name0)}`);
    check('the arrows walk the swatches and the preview follows', true);
    await tap('Escape');
    await page.until(state('cover'));
    const pc = await page.evaluate("document.querySelector('#career .cr-paintcard .cr-panel-line').textContent");
    check('the cover shows the new paint', pc.startsWith(`${rookie.name} paint.`), pc);

    /* ---------------- leaving ---------------- */
    await tap('Escape');
    await page.until(state('idle'), 60000);
    await page.until("window.__ui.screen === 'title'", 60000);
    v = await view();
    check('Esc from the cover leaves the career for the title', v.screen === '' && !v.menu && !v.flightBody, `screen "${v.screen}", menu ${v.menu}`);
    await page.until(`window.__ui.settings.map === ${JSON.stringify(mapBefore)}`, 60000).catch(() => {});
    const mapAfter = await page.evaluate('window.__ui.settings.map');
    check('the pilot\'s own map is seated again', mapAfter === mapBefore, `${mapAfter} (was ${mapBefore})`);
    /* A fresh visit: the career is kept, and the gate no longer opens on
     * it, because this browser has flown a lesson. */
    await page.evaluate('window.__beforeReload = true');
    await cdp.send('Page.reload', {}, sessionId);
    await page.until('!window.__beforeReload && !!window.__shellReady', 180000);
    /* The cover's cursor is on Fly solo. It was on Multiplayer once a
     * lesson was flown and the seated way was the first one: the gate's
     * first cursor was a solo page index (ui.js, the constructor's
     * "at + 1") used on the two card cover, until Ui.turnRoomsOn picked it
     * again. Found by this check on 2026-11-06. */
    const side = await page.evaluate('(window.__ui.items()[window.__ui.cursor] || {}).action');
    check('on the next visit the gate\'s cover opens on Fly solo', side === 'gate-solo', side);
    if (side !== 'gate-solo') {
      const at = await page.evaluate('window.__ui.cursor');
      await tap('ArrowLeft');
      await page.until(`window.__ui.cursor !== ${at}`);
    }
    await tap('Enter');
    await page.until("window.__ui.gatePageNow() === 'solo'");
    const card2 = await page.evaluate('(() => { const it = window.__ui.items()[window.__ui.cursor]; return it ? it.action : null; })()');
    check('on the next visit Fly solo opens on a way, not the career', card2 !== null && card2 !== 'career', card2);
    /* The Career card is the first, so the arrows walk back to it. */
    for (let i = 0; i < 8 && await page.evaluate("(window.__ui.items()[window.__ui.cursor] || {}).action !== 'career'"); i += 1) {
      const at = await page.evaluate('window.__ui.cursor');
      await tap('ArrowLeft');
      await page.until(`window.__ui.cursor !== ${at}`);
    }
    await tap('Enter');
    await page.until(state('cover'), 60000);
    const kept = await page.evaluate("[document.querySelector('#career .cr-continue-title .cr-title-text').textContent, document.querySelector('#career .cr-licence-line').textContent.trim(), document.querySelector('#career .cr-paintcard .cr-panel-line').textContent]");
    check('and the career opens where it was left, paint and all', kept[0] === check10.title && /, \d+ of \d+ lessons$/.test(kept[1]) && !/^0 stars/.test(kept[1]) && kept[2].startsWith(`${rookie.name} paint.`), kept.join(' / '));
  } catch (e) {
    check('the walk ran to its end', false, e.message.slice(0, 300));
  } finally {
    /* The board is stubbed out above (NO_BOARD); a refused connection to
     * it, should one get past the stub, is the only error that is not the
     * career's. */
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    check('no uncaught error or console.error', errs.length === 0, errs.slice(0, 4).join(' | ') || 'none');
    await page.close();
  }
}

const t0 = Date.now();
for (const size of SIZES) {
  if (!ONLY || ONLY === size.name) {
    await run(size);
  }
}
console.log(`\ncareer-ui-check: ${passes} passed, ${fails} failed, ${knownBugs} known, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fails ? 1 : 0);
