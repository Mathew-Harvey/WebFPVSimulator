/*
 * features-check.js: the features no other check ever loaded, driven from
 * where a pilot reaches them, in the real shell in headless Chromium.
 *
 * WHY THIS EXISTS. A coverage run on 2026-11-06 (scripts/coverage.js, with
 * tests/lib/page.js measuring the page) found files that no check loaded at
 * all and others it barely touched: the shared tunes dialog, the Quad room's
 * 3D preview, the race line's dots, the results plan, the loading screen's
 * dead end, the asset gallery, the builder's Export bundle, the board's
 * thumbnail page, capture mode, the cavity scan, ribbon cutting's HUD, the
 * sponsor marks on a built map and the overview's trails. A file nothing
 * loads cannot fail when it breaks, so each scenario below opens its own
 * page on its own profile and asserts on what came out, not on what ran:
 *
 *   quad      the Quad room: the 3D preview draws the seated aircraft and
 *             again after a swap to the whoop; Load a tune finds a seeded
 *             tune by its code, lists what is in it, rates it, puts it on
 *             and puts the pilot's own back; Share this tune posts the
 *             snapshot and the code it gets back takes it down again
 *   lazy      the tunes dialog and the career, their code blocked before
 *             it is fetched: the press says so, and nothing is unhandled
 *   room      a whoop track with Race line on: the line is solved off the
 *             flight and its dots are in the picture in flight; the results
 *             screen draws the course's plan
 *   capture   ?capture=1: the virtual clock moves exactly a frame a step and
 *             not at all between steps, and the ball game starts on it
 *   loadfail  a network that cannot reach the CDN: the loading screen says
 *             what to try, names the CDN and offers Try again
 *   gallery   src/props/gallery.html draws one asset, and one palette row
 *   bundle    the whoop builder's More, Export bundle: a zip whose manifest
 *             is BUNDLE-FORMAT.md's, every file it lists present with its
 *             size and CRC, the six views and the lap animation among them
 *   orbit     src/share/orbit.html, the board's thumbnail: one camera cycle
 *             recorded into a clip, and the clip played from the cache on
 *             the next visit without building the world
 *   city      the town with the cavity scan armed over a small window, and a
 *             ribbon cutting round whose HUD takes a snip, a cut and the
 *             round's results
 *   logos     a built map wearing five sponsor marks: on the billboard's
 *             face, a sign on the building's wall, graffiti on a bando
 *             wall, and the ones with no wall in reach on the ground
 *   modules   in the booted page: the overview's trails drawn while a length
 *             is picked and nothing drawn at Off, the track plan's three
 *             quarter view and a freestyle map's plan, every achievement
 *             badge a well formed SVG
 *   lettering the lettered titles keep their word spaces and kern their
 *             pairs (ART-1, FUN-10)
 *   thumbs    every world picture in assets/thumbs is one the generator
 *             draws with nothing but the world in frame (ART-5)
 *   offline   the Track map with no board seats a shipped track rather
 *             than an empty field, and gives it up when the board answers
 *             (ART-20)
 *   library   the Maps room on a phone on its side shows a card, its bar
 *             is an ink strip, and Fly it is not said twice (ART-8, ART-16)
 *   results   the race results as a page of the magazine (round 1 FUN-4,
 *             ART-10, ART-9): paper, a lettered title, the PB and board
 *             rank stamps from what is in hand (and no board request made
 *             to draw them), the best lap gate by gate, Next track second
 *             and pressing it asks the board for that track, Run ended on
 *             the same paper, and at 844 by 390 and 740 by 360 the page,
 *             the menu, the bug chip and both bars clear of each other
 *   front     the gate's masthead (round 1 FUN-15, CORE-10, FUN-18):
 *             Settings and Controls on every page and each opens its room,
 *             Fly again for a returning pilot naming the last thing flown
 *             and none for a new one, F flying it, and the Mini games
 *             panels wearing the bests this browser keeps
 *
 * No wall clock timing is asserted: on a software rasteriser under load a
 * frame can take 200 ms, so every wait polls the page with until(). Every
 * scenario fails on a console error or an uncaught error of the page's own;
 * the only errors forgiven are the network's, from a board that is not
 * running in a container, and in loadfail the CDN failures it asked for.
 *
 * Usage:
 *   npm run check:features
 *   FEAT_ONLY=quad,bundle npm run check:features     just those scenarios
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { answerQuadPicker, openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { presetsForClass } from '../src/trackbuilder/presets.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ONLY = (process.env.FEAT_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

/* The page's own errors. A board that is not running refuses its
 * connections, and that is the container, not the page. */
function ownErrors(page, extra = null) {
  return page.errors.filter((e) => !/Failed to load resource|net::ERR_/.test(e) && !(extra && extra.test(e)));
}

function errorsCheck(page, what, extra = null) {
  const bad = ownErrors(page, extra);
  check(`${what}: no console error and no uncaught error`, bad.length === 0, bad.slice(0, 4).join(' | '));
}

const json = async (page, expression) => JSON.parse(await page.evaluate(`(async () => JSON.stringify(await (${expression})))()`));

/* A real click: the pointer moves there, presses and lets go. */
async function clickAt(page, x, y) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.cdp.send('Input.dispatchMouseEvent', {
      type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1,
    }, page.sessionId);
    await page.sleep(20);
  }
}

/* Click the visible element matching `selector` whose text is `text`, with
 * the mouse, where it is on the screen. */
async function clickText(page, selector, text) {
  const at = await json(page, `(() => {
    const n = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((x) => x.textContent.trim() === ${JSON.stringify(text)} && x.getClientRects().length);
    if (!n) return null;
    n.scrollIntoView({ block: 'center' });
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!at) {
    throw new Error(`nothing reads "${text}" in ${selector}`);
  }
  await clickAt(page, at.x, at.y);
}

/* Type into a text box the way a keyboard does, one character at a time. */
async function typeInto(page, selector, text) {
  await page.evaluate(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); i.focus(); i.value = ''; return 1; })()`);
  await page.cdp.send('Input.insertText', { text }, page.sessionId);
}

/*
 * THE BOARD, ANSWERED IN THE PAGE. Every request for the default board
 * origin goes through window.__board, which a scenario fills with answers
 * keyed "METHOD /path" and reads back as the requests it was sent. Anything
 * not answered is refused the way a board that is down refuses it, so the
 * shell's own boot reads (the week, the lists) behave as they do in every
 * other check.
 */
const BOARD_STUB = `(() => {
  const BOARD = 'http://127.0.0.1:3100';
  const real = window.fetch.bind(window);
  window.__board = { routes: {}, calls: [] };
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (!url.startsWith(BOARD)) {
      return real(input, init);
    }
    const path = url.slice(BOARD.length).split('?')[0];
    const method = String(init.method || 'GET').toUpperCase();
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch (e) { body = String(init.body); }
    window.__board.calls.push({ method, path, body });
    const answer = window.__board.routes[method + ' ' + path];
    if (!answer) {
      throw new TypeError('Failed to fetch');
    }
    /* A function may answer later, as a slow link does. */
    const a = await (typeof answer === 'function' ? answer(body) : answer);
    return new Response(JSON.stringify(a.body ?? null), {
      status: a.status ?? 200, headers: { 'content-type': 'application/json' },
    });
  };
})();`;

function settingsSeed(patch, extra = '') {
  return `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, { graphics: 'low', graphicsAuto: false }, ${JSON.stringify(patch)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
    ${extra}
  } catch (e) { /* Storage refused: the scenario then fails on what it finds. */ }`;
}

const PAST_GATE = "(() => { const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; if (!ui.mode) { ui.mode = 'race'; } return 1; })()";

/*
 * What a WebGL canvas shows, sampled through a 2D copy: how many distinct
 * colours on a grid, and how many samples are not the clear colour. A copy
 * taken in the same task as a draw, by a rAF callback queued after the
 * shell's own, which is the moment the drawing buffer still holds it.
 */
function canvasLook(expr, clear = null) {
  return `new Promise((resolve) => requestAnimationFrame(() => {
    const src = ${expr};
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    const seen = new Set();
    let off = 0;
    let n = 0;
    const all = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 1; i < 64; i += 1) {
      for (let j = 1; j < 40; j += 1) {
        const o = (Math.floor((j * c.height) / 40) * c.width + Math.floor((i * c.width) / 64)) * 4;
        const p = all.subarray(o, o + 4);
        seen.add((p[0] >> 3) + ',' + (p[1] >> 3) + ',' + (p[2] >> 3));
        n += 1;
        ${clear ? `if (Math.abs(p[0] - ${clear[0]}) + Math.abs(p[1] - ${clear[1]}) + Math.abs(p[2] - ${clear[2]}) > 24) off += 1;` : 'off += 1;'}
      }
    }
    resolve(JSON.stringify({ w: c.width, h: c.height, colours: seen.size, off, n }));
  }))`;
}

/*
 * A WebGL read, taken again until it shows a picture or the time is up. A
 * copy can land after the browser has let the drawing buffer go and read
 * one flat colour, which is the copy failing and not the picture, so a
 * flat read is retried; a canvas that never shows `ok` still fails.
 */
async function lookUntil(page, expr, clear, ok, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  for (;;) {
    last = JSON.parse(await page.evaluate(canvasLook(expr, clear)));
    if (ok(last) || Date.now() > deadline) {
      return last;
    }
    await page.sleep(250);
  }
}

/* ------------------------------------------------------------------ */
/* quad: the 3D preview and the tunes dialogs                           */
/* ------------------------------------------------------------------ */

const TUNE_ID = 'k7mq2xrt9vwd';

async function scenarioQuad() {
  const page = await openPage({ root, width: 1280, height: 800, seed: [BOARD_STUB, settingsSeed({ airframe: '5inch', map: 'city' })] });
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 120000);
    await page.evaluate(PAST_GATE);
    await page.evaluate("window.__ui.show('quad'), 1");
    /* The showcase sizes its canvas to the frame when it is made active. */
    await page.until("(() => { const c = window.__ui.craftCanvas; return c.clientWidth > 8 && c.width === c.clientWidth && c.height === c.clientHeight; })()", 30000);
    await page.sleep(400);
    /* The clear colour is 0x1a241c. */
    const drawn = (l) => l.colours >= 6 && l.off >= 8 && l.off < l.n;
    const five = await lookUntil(page, 'window.__ui.craftCanvas', [0x1a, 0x24, 0x1c], drawn);
    check('quad: the 3D preview draws the 5 inch, not just its clear colour', drawn(five),
      `${five.colours} colours, ${five.off} of ${five.n} samples off the clear colour, ${five.w} by ${five.h}`);
    const caption = await page.evaluate("(document.querySelector('.craft-showcase-cap') || {}).textContent || ''");
    check('quad: the preview did not say it could not start', !/could not start/.test(caption), caption.slice(0, 80));
    /* The Quad room's list is longer than its box: its foot fades while
     * there is more, rather than a row cut through its letters, and the
     * fade goes at the foot (art.md ART-14). */
    /* The finding's window, 1600 by 900, where the room is two columns and
     * the list runs past its box; then the window it was. */
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId);
    await page.until('window.innerHeight === 900', 10000);
    const fade = await json(page, `(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const m = window.__ui.quadMenu;
      const look = () => ({ more: m.scrollHeight - m.scrollTop - m.clientHeight > 2, cls: m.classList.contains('has-more'), mask: getComputedStyle(m).maskImage || getComputedStyle(m).webkitMaskImage || '' });
      const top = look();
      m.scrollTop = m.scrollHeight;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const foot = look();
      m.scrollTop = 0;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { top, foot };
    })()`);
    check('quad: the room\'s list fades at its foot while there is more, and not at the foot',
      fade.top.more && fade.top.cls && /gradient/.test(fade.top.mask) && !fade.foot.more && !fade.foot.cls && !/gradient/.test(fade.foot.mask), JSON.stringify(fade));
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, page.sessionId);
    await page.until('window.innerHeight === 800', 10000);
    /* A drag orbits it; the next frames still draw. */
    const box = await json(page, "(() => { const r = window.__ui.craftCanvas.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()");
    const cy = box.y + box.h / 2;
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + box.w * 0.3, y: cy, button: 'none', buttons: 0 }, page.sessionId);
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x + box.w * 0.3, y: cy, button: 'left', buttons: 1, clickCount: 1 }, page.sessionId);
    for (let k = 1; k <= 6; k += 1) {
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + box.w * (0.3 + k * 0.06), y: cy, button: 'left', buttons: 1 }, page.sessionId);
      await page.sleep(40);
    }
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + box.w * 0.66, y: cy, button: 'left', buttons: 0, clickCount: 1 }, page.sessionId);

    /* The whoop has its own model and its own framing: the stage is rebuilt. */
    await page.evaluate("(() => { const ui = window.__ui; ui.settings.airframe = 'whoop65'; ui.modeSyncedFor = 'whoop65'; ui.writeSettings(); ui.renderMenu(); return 1; })()");
    await page.until("(() => { const c = window.__ui.craftCanvas; return c.width === c.clientWidth && c.width > 8; })()", 20000);
    await page.sleep(600);
    const whoop = await lookUntil(page, 'window.__ui.craftCanvas', [0x1a, 0x24, 0x1c], drawn);
    check('quad: after a swap to the whoop the preview draws it', drawn(whoop),
      `${whoop.colours} colours, ${whoop.off} of ${whoop.n} off the clear colour`);
    await page.evaluate("(() => { const ui = window.__ui; ui.settings.airframe = '5inch'; ui.modeSyncedFor = '5inch'; ui.writeSettings(); ui.renderMenu(); return 1; })()");

    /* A tune on the board: the pilot's own snapshot, made different enough
     * that putting it on shows. */
    const mine = await json(page, '({ snap: window.__ui.tuneSnapshot(), weight: window.__ui.settings.weight, fov: window.__ui.settings.cameraFov })');
    const tuneWeight = mine.weight === 110 ? 90 : 110;
    const tune = {
      id: TUNE_ID,
      name: 'Feature check tune',
      author: 'Checker',
      airframe: mine.snap.airframe,
      notes: 'Seeded by scripts/features-check.js.',
      setup: { ...mine.snap.setup, weight: tuneWeight },
      rating: { count: 2, avg: 3.5 },
    };
    await page.evaluate(`(() => {
      const r = window.__board.routes;
      r['GET /api/setups/${TUNE_ID}'] = { body: ${JSON.stringify(tune)} };
      r['GET /api/setups/zzzzzzzzzzzz'] = { status: 404, body: { error: 'not found' } };
      r['POST /api/ratings'] = (b) => ({ body: { rating: { count: 3, avg: (7 + b.stars) / 3 } } });
      r['POST /api/setups'] = { body: { id: 'p2q3r4s5t6v7', code: 'p2q3-r4s5-t6v7', editKey: 'k'.repeat(32) } };
      r['GET /api/setups/p2q3r4s5t6v7'] = { body: { ...${JSON.stringify(tune)}, id: 'p2q3r4s5t6v7', name: 'My shared tune' } };
      r['POST /api/setups/p2q3r4s5t6v7/remove'] = { body: { ok: true } };
      return 1;
    })()`);

    await clickText(page, '.screen-quad .row', 'Load a tune');
    await page.until("(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden && (d.querySelector('h2') || {}).textContent === 'Load a tune'; })()", 10000);
    check('quad: Load a tune opens its dialog from the Quad room row', true);

    await typeInto(page, '.tune-code-field', 'zzzz-zzzz-zzzz');
    await clickText(page, '.name-dialog button', 'Look it up');
    await page.until("/No tune has that code/.test(document.querySelector('.name-dialog .name-dialog-err').textContent)", 10000)
      .then(() => check('quad: a code the board does not have says so', true))
      .catch(() => check('quad: a code the board does not have says so', false, page.evaluate("document.querySelector('.name-dialog .name-dialog-err').textContent")));

    await typeInto(page, '.tune-code-field', 'K7MQ 2XRT 9VWD');
    await clickText(page, '.name-dialog button', 'Look it up');
    await page.until("(document.querySelector('.tune-preview-name') || {}).textContent === 'Feature check tune'", 10000);
    const preview = await json(page, `(() => {
      const p = document.querySelector('.tune-preview');
      return {
        code: document.querySelector('.tune-code-field').value,
        lines: [...p.querySelectorAll('.tune-share-list li')].map((li) => li.textContent),
        text: p.textContent,
        rating: (p.querySelector('.tune-rate .feel-hint') || {}).textContent || '',
      };
    })()`);
    check('quad: the code is found however it was typed, and shown as it is said', preview.code === 'k7mq-2xrt-9vwd', preview.code);
    check('quad: the preview lists what is in the tune, its weight included',
      preview.lines.some((l) => l.includes(`Weight ${tuneWeight}%`)) && preview.lines.some((l) => /^Rates: /.test(l)),
      preview.lines.join(' / '));
    check('quad: and who made it, and its rating', /by Checker/.test(preview.text) && preview.rating === '3.5 of 5 from 2 ratings', preview.rating);

    await clickText(page, '.tune-preview .feel-chip', '4 stars');
    await page.until("/counted/.test(document.querySelector('.tune-rate .name-dialog-err').textContent)", 10000);
    const rated = await json(page, `({
      call: window.__board.calls.filter((c) => c.method === 'POST' && c.path === '/api/ratings').pop(),
      summary: document.querySelector('.tune-rate .feel-hint').textContent,
      on: document.querySelectorAll('.tune-rate .feel-chip.on').length,
    })`);
    check('quad: four stars posts kind setup, this tune and 4', rated.call && rated.call.body.kind === 'setup' && rated.call.body.id === TUNE_ID && rated.call.body.stars === 4 && /^[0-9a-f]{32}$/.test(rated.call.body.raterKey || ''),
      JSON.stringify(rated.call && { ...rated.call.body, raterKey: undefined }));
    check('quad: and the board\'s new average is shown, four chips lit', rated.summary === '3.7 of 5 from 3 ratings' && rated.on === 4, `${rated.summary}, ${rated.on} lit`);

    await clickText(page, '.tune-preview button', 'Use this tune');
    await page.until("(document.querySelector('.tune-preview-name') || {}).textContent === 'Loaded'", 10000);
    const worn = await json(page, `({ weight: window.__ui.settings.weight, stored: JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).weight })`);
    check('quad: Use this tune puts its weight on, in the page and in the saved settings', worn.weight === tuneWeight && worn.stored === tuneWeight, JSON.stringify(worn));
    await clickText(page, '.tune-preview button', 'Put mine back');
    await page.until("/previous settings are back/.test(document.querySelector('.name-dialog .name-dialog-err').textContent)", 10000);
    const back = await json(page, `({ weight: window.__ui.settings.weight, stored: JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).weight })`);
    check('quad: Put mine back restores the weight it replaced', back.weight === mine.weight && back.stored === mine.weight, `${JSON.stringify(back)} against ${mine.weight}`);
    await clickText(page, '.tune-preview button', 'Done');
    await page.until("document.querySelector('.name-dialog').hidden", 5000);
    check('quad: Done closes the dialog', true);

    /* Share this tune: the snapshot is what goes up, and its code takes it down. */
    await clickText(page, '.screen-quad .row', 'Share this tune');
    await page.until("(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden && (d.querySelector('h2') || {}).textContent === 'Share this tune'; })()", 10000);
    await clickText(page, '.name-dialog button', 'Share');
    const tooShort = await page.evaluate("document.querySelector('.name-dialog .name-dialog-err').textContent");
    check('quad: Share with no name asks for one and sends nothing', /three characters/.test(tooShort)
      && !(await page.evaluate("window.__board.calls.some((c) => c.method === 'POST' && c.path === '/api/setups')")), tooShort);
    await typeInto(page, '.name-dialog input[aria-label="Name this tune"]', 'My shared tune');
    await typeInto(page, '.name-dialog input[aria-label="Your pilot name"]', 'Checker');
    await clickText(page, '.name-dialog button', 'Share');
    await page.until("(document.querySelector('.name-dialog h2') || {}).textContent === 'Shared'", 10000);
    const shared = await json(page, `({
      call: window.__board.calls.filter((c) => c.method === 'POST' && c.path === '/api/setups').pop(),
      snap: window.__ui.tuneSnapshot(),
      code: (document.querySelector('.name-dialog .tune-code') || {}).textContent,
      kept: JSON.parse(localStorage.getItem('webfpv.tunes.mine.v1') || '[]'),
    })`);
    check('quad: Share posts the name, the author and exactly the snapshot',
      shared.call && shared.call.body.name === 'My shared tune' && shared.call.body.author === 'Checker'
        && JSON.stringify(shared.call.body.setup) === JSON.stringify(shared.snap.setup) && shared.call.body.airframe === shared.snap.airframe,
      shared.call ? Object.keys(shared.call.body).join(',') : 'no call');
    check('quad: the code the board gave is shown, and its key kept in this browser',
      shared.code === 'p2q3-r4s5-t6v7' && shared.kept.length === 1 && shared.kept[0].id === 'p2q3r4s5t6v7' && shared.kept[0].editKey === 'k'.repeat(32),
      `${shared.code}, ${shared.kept.length} kept`);
    await clickText(page, '.name-dialog button', 'Done');
    await page.until("document.querySelector('.name-dialog').hidden", 5000);

    await clickText(page, '.screen-quad .row', 'Load a tune');
    await page.until("!!document.querySelector('.tune-code-field')", 10000);
    await typeInto(page, '.tune-code-field', 'p2q3r4s5t6v7');
    await page.tap('Enter');
    await page.until("(document.querySelector('.tune-preview-name') || {}).textContent === 'My shared tune'", 10000);
    await clickText(page, '.tune-preview button', 'Take my tune down');
    await page.until("/Taken down/.test(document.querySelector('.name-dialog .name-dialog-err').textContent)", 10000);
    const down = await json(page, `({
      call: window.__board.calls.filter((c) => c.path === '/api/setups/p2q3r4s5t6v7/remove').pop(),
      kept: JSON.parse(localStorage.getItem('webfpv.tunes.mine.v1') || '[]').length,
    })`);
    check('quad: a tune this browser shared can be taken down with its key, and is forgotten',
      down.call && down.call.body.editKey === 'k'.repeat(32) && down.kept === 0, JSON.stringify(down));
    /* Taking it down empties the preview. It used to empty the focus with
     * it, to the body, where the dialog's Escape is not heard (PROGRESS.md,
     * 2026-11-06); the focus stays in the dialog now, and Escape works. */
    const after = await json(page, "(() => { const a = document.activeElement; return { tag: a ? a.tagName : '', inDialog: Boolean(a && a.closest && a.closest('.name-dialog')) }; })()");
    check('quad: after Take my tune down the focus is still in the dialog', after.inDialog, after.tag);
    await page.tap('Escape');
    const escaped = await page.until("document.querySelector('.name-dialog').hidden && window.__ui.screen === 'quad'", 5000).then(() => true, () => false);
    check('quad: and Escape closes the dialog after Take my tune down', escaped, escaped ? '' : 'still open');
    if (!escaped) {
      await clickText(page, '.name-dialog button', 'Close');
      await page.until("document.querySelector('.name-dialog').hidden", 5000);
    }
    /* Close, with the mouse. */
    await clickText(page, '.screen-quad .row', 'Load a tune');
    await page.until("!!document.querySelector('.tune-code-field') && !document.querySelector('.name-dialog').hidden", 10000);
    await clickText(page, '.name-dialog button', 'Close');
    await page.until("document.querySelector('.name-dialog').hidden", 5000);
    check('quad: Close closes the Load dialog', true);

    await clickText(page, '.screen-quad .row', 'Load a tune');
    await page.until("(() => { const d = document.querySelector('.name-dialog'); return !d.hidden && document.activeElement === document.querySelector('.tune-code-field'); })()", 10000);
    await page.tap('Escape');
    await page.until("document.querySelector('.name-dialog').hidden && window.__ui.screen === 'quad'", 5000);
    check('quad: Escape closes the Load dialog', true);

    /* A board track that lands after the pilot left (bugs.md BUG-4). The
     * fetch is held until the pilot has walked away, then let go: nothing
     * may be seated, the pilot is not sent to the title or flown, and
     * their seat and share are as they were. Track of the week's Fly it
     * first, then a board card's open with its Fly it to follow. */
    const late = { ...presetsForClass('micro')[0], id: 'trk-fea7late', name: 'Late track' };
    await page.evaluate(`(() => {
      window.__lateGo = [];
      window.__board.routes['GET /api/tracks/trk-fea7late/document'] = () => new Promise((go) => {
        window.__lateGo.push(() => go({ body: { id: 'trk-fea7late', name: 'Late track', author: 'Checker', document: ${JSON.stringify(late)} } }));
      });
      return 1;
    })()`);
    const seatOf = "({ screen: window.__ui.screen, map: window.__ui.settings.map, mode: window.__ui.mode, airframe: window.__ui.settings.airframe, share: window.__ui.share ? window.__ui.share.id : null, opening: Boolean(window.__ui.openingBoardCourse) })";
    for (const way of ['week', 'card']) {
      await page.evaluate("window.__ui.show('quad'), 1");
      const before = await json(page, seatOf);
      await page.evaluate(`(() => {
        const ui = window.__ui;
        window.__lateThen = false;
        if (${JSON.stringify(way)} === 'week') {
          ui.week = { track: { id: 'trk-fea7late', name: 'Late track' }, times: [] };
          ui.flyWeek();
        } else {
          ui.boardCourses = [{ id: 'trk-fea7late', name: 'Late track', board: 'http://127.0.0.1:3100' }];
          ui.openBoardCourse('trk-fea7late', () => { window.__lateThen = true; });
        }
        return 1;
      })()`);
      await page.until('window.__lateGo.length > 0', 10000);
      /* The pilot leaves for the Pilot room, then the track lands. */
      await page.evaluate("window.__ui.show('pilot'), 1");
      await page.evaluate('(window.__lateGo.shift())(), 1');
      await page.until('!window.__ui.openingBoardCourse', 10000);
      await page.sleep(300);
      const after = await json(page, `(() => { const s = ${seatOf}; s.then = window.__lateThen; return s; })()`);
      check(`quad: a board load (${way === 'week' ? 'Track of the week' : 'a board card'}) that lands after the pilot left seats nothing and moves nobody`,
        after.screen === 'pilot' && after.map === before.map && after.mode === before.mode && after.airframe === before.airframe
          && after.share === before.share && !after.then,
        `${JSON.stringify(before)} then ${JSON.stringify(after)}`);
    }
    errorsCheck(page, 'quad');
  } catch (e) {
    check('quad: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* lazy: a menu chunk that will not fetch                               */
/* ------------------------------------------------------------------ */

/*
 * The tunes dialogs and the career are fetched on the press. A chunk that
 * will not fetch (a flaky link, a deploy mid session) used to leave an
 * unhandled rejection and a press that did nothing (bugs.md BUG-13). Each
 * is blocked here before its first fetch and pressed: the pilot is told,
 * and nothing is left unhandled. A browser keeps a failed module fetch
 * for the page's life, which is why the words say to reload.
 */
async function scenarioLazy() {
  const page = await openPage({ root, width: 1280, height: 800, seed: [BOARD_STUB, settingsSeed({ airframe: '5inch', map: 'city' })] });
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 120000);
    await page.cdp.send('Network.enable', {}, page.sessionId);
    await page.cdp.send('Network.setBlockedURLs', { urls: ['*/src/ui/tunesdialog.js*', '*/src/career/controller.js*'] }, page.sessionId);
    await page.evaluate(PAST_GATE);
    await page.evaluate("window.__ui.show('quad'), 1");
    const notice = "((document.querySelector('.menu-notice') || {}).textContent || '')";
    await clickText(page, '.screen-quad .row', 'Load a tune');
    const tunes = await page.until(`/did not open/.test(${notice})`, 15000).then(() => true, () => false);
    check('lazy: Load a tune whose dialog will not fetch says so', tunes, await page.evaluate(notice));
    /* The career card's press, as the gate routes it. */
    await page.evaluate("window.__ui.act('career'), 1");
    const career = await page.until(`/Could not open the career/.test(${notice})`, 15000).then(() => true, () => false);
    check('lazy: the career whose code will not fetch says so', career, await page.evaluate(notice));
    const loose = page.errors.filter((e) => /^uncaught/.test(e));
    check('lazy: neither leaves an unhandled rejection', loose.length === 0, loose.slice(0, 2).join(' | '));
    errorsCheck(page, 'lazy');
  } catch (e) {
    check('lazy: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* room: the race line and the results plan                             */
/* ------------------------------------------------------------------ */

const ROOM_TRACK = {
  ...presetsForClass('micro')[0],
  id: 'trk-fea70001',
  name: 'Features check track',
  modifiedUtc: '2026-11-06T00:00:00.000Z',
};

const INITIAL_CARD = "window.__board.routes['GET /api/tracks'] = { body: { tracks: [{ id: 'trk-fea7init', name: 'Initial on a card', author: 'Pilot', gates: 6, times: 0, trackClass: 'micro' }] } };";

async function scenarioRoom() {
  const page = await openPage({
    root,
    width: 1280,
    /* Over 720 px high: below it the results screen puts its plan away. */
    height: 900,
    /* One board track with neither a picture nor a plan, so the shelf has a
     * card that still falls back to its initial: since FUN-17 every track
     * in this browser's library draws its plan over it (see the ART-15
     * check below). */
    seed: [BOARD_STUB, INITIAL_CARD, settingsSeed({ airframe: 'whoop65', raceLine: true },
      `localStorage.setItem('webfpv.trackbuilder.library.v1', ${JSON.stringify(JSON.stringify({ [ROOM_TRACK.id]: ROOM_TRACK }))});`)],
  });
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 120000);
    await page.evaluate(`(() => { const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; ui.mode = 'race';
      ui.show('courses'); ui.act('local:${ROOM_TRACK.id}'); return 1; })()`);
    await page.until("(() => { const m = window.__map(); return m.id === 'custom' && m.ready && m.mode !== 'freestyle' && m.gates > 0; })()", 120000);
    /* Off the flight the line is worked out; nothing is solved in a flying frame. */
    await page.until("(() => { const r = window.__raceLine(); return r && (r.state.phase === 'ready' || r.state.phase === 'refused'); })()", 120000);
    const line = await json(page, '(() => { const s = window.__raceLine().state; return { phase: s.phase, reason: s.reason, crumbs: s.crumbs, lapS: s.lapS, wanted: s.wanted }; })()');
    check('room: with Race line on, the whoop track\'s line is solved', line.phase === 'ready' && line.crumbs > 50 && line.lapS > 0 && line.wanted,
      `${line.phase}${line.reason ? ` (${line.reason})` : ''}, ${line.crumbs} crumbs, ${line.lapS.toFixed ? line.lapS.toFixed(1) : line.lapS} s a lap`);

    /* A card with no picture shows the track's initial, and it never
     * prints through the card's lettered name (art.md ART-15). Read on the
     * Tracks cards: the initial's own glyphs against each name line. A card
     * whose plan is drawn has lost its initial (FUN-17), so the one read is
     * the board's INITIAL_CARD, which has no plan to draw. */
    await page.evaluate("window.__ui.show('courses'), 1");
    const initials = await json(page, `(async () => {
      let cards = [];
      for (let i = 0; i < 100; i += 1) {
        cards = [...document.querySelectorAll('.wp-card')].filter((c) => c.querySelector('.wp-blank') && c.querySelector('.wp-nm canvas, .wp-nm.is-text'));
        if (cards.length) { break; }
        await new Promise((r) => setTimeout(r, 100));
      }
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return cards.map((c) => {
        const blank = c.querySelector('.wp-blank');
        const range = document.createRange();
        range.selectNodeContents(blank);
        const g = range.getBoundingClientRect();
        const lines = [...c.querySelectorAll('.wp-nm canvas, .wp-nm.is-text')].map((n) => n.getBoundingClientRect());
        return { initial: blank.textContent, over: lines.some((l) => hit(g, l)) };
      });
    })()`);
    check('room: a card\'s fallback initial does not overprint its name', initials.length > 0 && initials.every((x) => !x.over), JSON.stringify(initials));

    /* The Quad room on a race seated, on the keyboard: the preview's
     * caption says which of the two mode rows this flight follows, so it
     * never says Angle under a Flight mode row lit Acro without saying why
     * (fun.md FUN-21). */
    await page.evaluate("window.__ui.show('quad'), 1");
    const modes = await json(page, `(async () => {
      for (let i = 0; i < 50 && !/Keyboard races|^(Acro|Angle)/.test(window.__ui.craftCaption.textContent); i += 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
      await new Promise((r) => setTimeout(r, 300));
      const s = window.__ui.settings;
      return { caption: window.__ui.craftCaption.textContent, flightMode: s.flightMode, keyRaceMode: s.keyRaceMode };
    })()`);
    const keyWord = modes.keyRaceMode === 'acro' ? 'Acro' : 'Angle';
    check('quad room, a race on keys: the caption names Keyboard races and the mode it flies',
      modes.caption.startsWith(`Keyboard races fly ${keyWord}.`), `${modes.caption} (Flight mode ${modes.flightMode}, Keyboard races ${modes.keyRaceMode})`);
    await page.evaluate("window.__ui.show('courses'), 1");

    await page.evaluate("window.__ui.act('fly'), 1");
    await page.until("window.__ui.screen === 'launch'", 30000);
    await page.tap('Enter');
    await page.until("window.__ui.screen === 'flight' && window.__craftState().mode === 'flight'", 60000);
    await page.until('window.__raceLine().state.shown === true', 20000)
      .then(() => check('room: in flight the line\'s dots are in the picture, through the next gates', true))
      .catch(() => check('room: in flight the line\'s dots are in the picture, through the next gates', false, JSON.stringify(page.evaluate('window.__raceLine().state'))));
    /* The step loop reads the state into buffers it owns (core.md
     * CORE-13): every frame of flight runs its steps, a thousand a second,
     * and the frame's state is one of the same four arrays throughout, not
     * a new one a step. Read over forty drawn frames in flight, and the sim
     * clock in the state has to have moved, or no step ran to be judged. */
    await page.evaluate('window.__stick(0, 0, 0, 0.62), 1');
    await page.until('window.__craftState().flownThisRun === true', 30000).catch(() => {});
    const pooled = await json(page, `(async () => {
      const seen = new Set();
      const t0 = window.__stateRef()[0];
      for (let k = 0; k < 40; k += 1) { await new Promise((r) => requestAnimationFrame(r)); seen.add(window.__stateRef()); }
      return { arrays: seen.size, simS: window.__stateRef()[0] - t0 };
    })()`);
    check('room: forty frames of flight hold their state in at most four arrays, never a new one a step',
      pooled.simS > 0.05 && pooled.arrays <= 4, JSON.stringify(pooled));
    await page.evaluate('window.__stick(0, 0, 0, 0), 1');
    const shown = await json(page, `(() => {
      let pts = null;
      window.__mapScene().traverse((o) => { if (o.isPoints && o.visible && o.geometry && o.geometry.drawRange) pts = o; });
      return pts ? { count: pts.geometry.drawRange.count, all: pts.geometry.attributes.position.count } : null;
    })()`);
    check('room: and only part of the lap is drawn at once', shown && shown.count > 0 && shown.count < shown.all, JSON.stringify(shown));
    /* The ground cluster's small captions sit on an ink plate at 11 px or
     * more, so they read over the white checks, a pale yard and snow
     * (art.md ART-6), and the corners' small lines carry the 2 px edge. */
    const caps = await json(page, `(() => {
      const plate = [...document.querySelectorAll('.osd .osd-gimbal-cap, .osd .osd-air-end, .osd .osd-air-cap')]
        .filter((n) => n.textContent.trim() && n.getClientRects().length)
        .map((n) => { const c = getComputedStyle(n); const a = /rgba\([^)]*,\s*([0-9.]+)\)/.exec(c.backgroundColor); return { t: n.textContent, px: parseFloat(c.fontSize), alpha: a ? Number(a[1]) : (c.backgroundColor === 'transparent' ? 0 : 1) }; });
      const edge = [...document.querySelectorAll('.osd .osd-corner .osd-label, .osd .osd-corner .osd-sub')]
        .map((n) => /2px 2px 0px/.test(getComputedStyle(n).textShadow));
      return { plate, edge: edge.length > 0 && edge.every(Boolean) };
    })()`);
    check('room: the OSD\'s small captions sit on ink at 11 px or more, the corners\' lines on a 2 px edge',
      caps.plate.length >= 3 && caps.plate.every((x) => x.px >= 11 && x.alpha >= 0.5) && caps.edge,
      JSON.stringify(caps.plate.filter((x) => !(x.px >= 11 && x.alpha >= 0.5)).slice(0, 3)) + (caps.edge ? '' : ' (a corner line has the 1 px edge)'));
    /* Paused, the live readings are put away and the pack stays (art.md
     * ART-24): dimmed, they ghosted behind the pause menu. */
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 20000);
    const ghost = await json(page, `(() => {
      const vis = (sel) => { const n = document.querySelector(sel); return n ? getComputedStyle(n).visibility : 'none'; };
      return { right: vis('.osd .osd-right'), sticks: vis('.osd .osd-sticks'), pack: vis('.osd .osd-left'), top: vis('.osd .osd-top') };
    })()`);
    check('room: paused, the speed corner and the gimbals are put away and the pack stays',
      ghost.right === 'hidden' && ghost.sticks === 'hidden' && ghost.pack === 'visible', JSON.stringify(ghost));
    await page.evaluate("window.__ui.act('resume'), 1");
    await page.until("window.__ui.screen === 'flight'", 20000);
    const back = await json(page, "(() => getComputedStyle(document.querySelector('.osd .osd-right')).visibility)()");
    check('room: and back in flight they are shown again', back === 'visible', back);
    await page.evaluate("(() => { window.__ui.settings.raceLine = false; window.__ui.writeSettings(); return 1; })()");
    await page.until('window.__raceLine().state.shown === false', 20000)
      .then(() => check('room: turned off, the dots go', true))
      .catch(() => check('room: turned off, the dots go', false));

    /* Race time is night on a five inch race track only, so on a whoop
     * room a change to it must not rebuild the room to draw the same
     * picture (bugs.md BUG-11). The scene is marked, the pick is changed
     * the way Settings changes it, and the mark is looked for after. */
    await page.evaluate("(() => { window.__mapScene().userData.featMark = 11; window.__ui.settings.raceTime = 'night'; window.__ui.writeSettings(); return 1; })()");
    await page.sleep(4000);
    const kept = await json(page, "(() => { const m = window.__map(); return { mark: window.__mapScene().userData.featMark || null, ready: m.ready, raceTime: m.raceTime }; })()");
    check('room: changing Race time on a whoop room keeps the room as it is', kept.mark === 11 && kept.ready, JSON.stringify(kept));

    /* The results screen of a course draws its plan, with the scale bar. */
    await page.evaluate("(() => { window.__ui.showResults([{ n: 1, ms: 30000 }, { n: 2, ms: 29500 }, { n: 3, ms: 29800 }], 29500, null, null, {}); return 1; })()");
    await page.until("window.__ui.screen === 'results' && !window.__ui.resultsPlanWrap.hidden && window.__ui.resultsPlan.getBoundingClientRect().width > 8", 20000);
    /* drawPlan sizes the canvas to its box when it paints, a frame later. */
    await page.until("(() => { const c = window.__ui.resultsPlan; return c.width === Math.round(c.getBoundingClientRect().width * Math.min(2, devicePixelRatio || 1)); })()", 20000).catch(() => {});
    const plan = await json(page, `(() => {
      const c = window.__ui.resultsPlan;
      const ctx = c.getContext('2d');
      const seen = new Set();
      for (let i = 1; i < 30; i += 1) for (let j = 1; j < 20; j += 1) {
        const p = ctx.getImageData(Math.floor(i * c.width / 30), Math.floor(j * c.height / 20), 1, 1).data;
        seen.add((p[0] >> 3) + ',' + (p[1] >> 3) + ',' + (p[2] >> 3));
      }
      const r = c.getBoundingClientRect();
      return { w: c.width, h: c.height, colours: seen.size, marks: (c.planData && c.planData.marks || []).length, rw: r.width, rh: r.height, wrap: getComputedStyle(window.__ui.resultsPlanWrap).display };
    })()`);
    check('room: the results screen draws the course plan', plan.w > 8 && plan.colours >= 4 && plan.marks > 0,
      `${plan.w} by ${plan.h} (laid out ${plan.rw} by ${plan.rh}, ${plan.wrap}), ${plan.colours} colours, ${plan.marks} marks`);
    errorsCheck(page, 'room');
  } catch (e) {
    check('room: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* capture: the virtual clock                                           */
/* ------------------------------------------------------------------ */

async function scenarioCapture() {
  const page = await openPage({
    root, width: 540, height: 960, url: '/index.html?capture=1&map=ball&craft=5inch&fly=1&seed=7', seed: [settingsSeed({ showFps: true })],
  });
  try {
    await page.until('!!window.__capture', 60000);
    const started = await json(page, "window.__capture.start('ball', { size: 2, skill: 'rookie' })");
    check('capture: the ball game starts on the virtual clock, on its seed', started.mode === 'ball' && started.seed === 7 && started.frame % 3 === 0,
      JSON.stringify(started));
    const a = await json(page, '({ t: window.__capture.now(), perf: performance.now(), date: Date.now(), f: window.__capture.frame() })');
    await page.sleep(700);
    const b = await json(page, '({ t: window.__capture.now(), perf: performance.now(), date: Date.now(), f: window.__capture.frame() })');
    check('capture: no clock the page can see moves between steps', a.t === b.t && a.perf === b.perf && a.date === b.date && a.f === b.f, `${JSON.stringify(a)} then ${JSON.stringify(b)}`);
    await page.evaluate('window.__capture.step(60).then(() => 1)');
    const c = await json(page, '({ t: window.__capture.now(), perf: performance.now(), date: Date.now(), f: window.__capture.frame() })');
    check('capture: sixty steps are sixty frames and one second, exactly',
      c.f - b.f === 60 && Math.abs(c.t - b.t - 1000) < 1e-6 && Math.abs(c.perf - b.perf - 1000) < 1e-6 && c.date - b.date >= 999 && c.date - b.date <= 1001,
      `${c.f - b.f} frames, ${(c.t - b.t).toFixed(6)} ms`);
    const game = await json(page, '(() => { const g = window.__dogfight(); return g ? { ok: true, kind: g.constructor.name } : null; })()');
    check('capture: the ball game is running under it', Boolean(game && game.ok), JSON.stringify(game));
    /* Show FPS is on: its MEM row walks the whole scene for its figure,
     * and that walk ran inside the flight frame every 5 s (bugs.md BUG-5).
     * Twenty seconds of flight on the virtual clock is four asks; the
     * figure cannot move unless something was uploaded or freed, so it
     * may walk once, for the first, and not again. */
    const walks0 = await page.evaluate('window.__memWalks');
    await page.evaluate('window.__capture.step(1200).then(() => 1)');
    const mem = await json(page, '({ walks: window.__memWalks, mb: window.__ui.perfMem.mb.textContent, shown: !window.__ui.perfMem.row.hidden })');
    check('capture: Show FPS asks for MEM through twenty seconds of flight and walks the scene at most once',
      Number.isInteger(walks0) && mem.shown && /^\d+$/.test(mem.mb) && mem.walks - walks0 <= 1 && mem.walks >= 1,
      `${walks0} then ${mem.walks} walks, row ${JSON.stringify(mem)}`);
    const fault = await page.evaluate('window.__frameFault || null');
    check('capture: no frame faulted', !fault, String(fault));
    errorsCheck(page, 'capture');
  } catch (e) {
    check('capture: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* loadfail: the loading screen's way out                               */
/* ------------------------------------------------------------------ */

async function scenarioLoadFail() {
  const page = await openPage({ root, width: 1280, height: 720, block: true, seed: [settingsSeed({})] });
  try {
    await page.until("(() => { const h = document.querySelector('#loading .loading-help'); return h && !h.hidden && h.querySelector('ol li'); })()", 90000);
    const help = await json(page, `(() => {
      const root = document.getElementById('loading');
      const h = root.querySelector('.loading-help');
      return {
        stage: root.querySelector('.loading-stage').textContent,
        why: (h.querySelector('.loading-why') || {}).textContent || '',
        steps: [...h.querySelectorAll('ol li')].map((li) => li.textContent),
        buttons: [...h.querySelectorAll('.loading-actions button')].map((b) => b.textContent),
        focused: document.activeElement && document.activeElement.textContent,
        detail: (h.querySelector('.loading-detail') || {}).textContent || '',
        failed: window.__loading.failed,
        visible: !root.hidden && getComputedStyle(root).opacity === '1',
      };
    })()`);
    check('loadfail: the loading screen says it could not start, and stays up', help.stage === 'Could not start' && help.failed && help.visible, `${help.stage}, failed ${help.failed}`);
    check('loadfail: it names the cause as something that did not arrive', /did not arrive|CDN/.test(help.why), help.why);
    check('loadfail: and says to allow the CDN', help.steps.some((s) => s.includes('cdn.jsdelivr.net')), help.steps.join(' / ').slice(0, 300));
    check('loadfail: Try again is offered and has the focus', help.buttons.includes('Try again') && help.focused === 'Try again', help.buttons.join(', '));
    check('loadfail: what the page measured is shown', /WebGL2 (yes|no)/.test(help.detail) && /WebAssembly yes/.test(help.detail), help.detail);
    /* ART-11: the screen is the menus' paper and ink, and it fetched
     * nothing to be so: the words on a paper panel framed in the ink line,
     * the joke in a balloon, the bar an ink strip, the failure ink on paper
     * with the paper reaching its last button, and no font or picture
     * asked for by the stylesheet. */
    const look = await json(page, `(() => {
      const root = document.getElementById('loading');
      const panel = root.querySelector('.loading-panel');
      if (!panel) {
        return { panel: false };
      }
      const frame = getComputedStyle(panel, '::before');
      const cs = (sel) => getComputedStyle(root.querySelector(sel));
      const pr = panel.getBoundingClientRect();
      const last = [...root.querySelectorAll('.loading-help button')].pop().getBoundingClientRect();
      return {
        panel: true,
        paper: frame.backgroundColor,
        border: frame.borderTopWidth + ' ' + frame.borderTopColor,
        stage: cs('.loading-stage').color,
        help: cs('.loading-help').color,
        balloon: cs('.loading-joke').borderTopWidth + ' ' + cs('.loading-joke').backgroundColor,
        track: cs('.loading-track').borderTopWidth,
        holds: last.bottom <= pr.bottom && last.top >= pr.top,
        fetched: performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'css' || /\\.(woff2?|ttf|otf)(\\?|$)/.test(r.name)).map((r) => r.name),
      };
    })()`);
    const ink = 'rgb(11, 17, 22)';
    check('loadfail: the words sit on a paper panel framed in the ink line', look.panel && look.paper === 'rgb(247, 240, 220)' && look.border === `4px ${ink}`, JSON.stringify(look).slice(0, 200));
    check('loadfail: the stage and the failure are ink on that paper', look.stage === ink && look.help === ink, `${look.stage}, ${look.help}`);
    check('loadfail: the joke is a balloon and the bar an ink strip', /^3px rgb\(255, 250, 240\)$/.test(look.balloon || '') && look.track === '3px', `${look.balloon}, ${look.track}`);
    check('loadfail: the paper reaches the last button', look.holds === true);
    check('loadfail: the stylesheet fetched no font and no picture', Array.isArray(look.fetched) && look.fetched.length === 0, (look.fetched || []).join(', '));
    await clickText(page, '#loading .loading-actions button', 'Copy the details');
    await page.until("/Copied|Select and copy/.test([...document.querySelectorAll('#loading .loading-actions button')].map((b) => b.textContent).join(' '))", 10000);
    const copied = await json(page, "({ label: document.querySelector('#loading .loading-actions .quiet').textContent, shown: [...document.querySelectorAll('#loading .loading-detail')].map((d) => d.textContent).join(' ') })");
    check('loadfail: Copy the details copies, or shows the text to select', copied.label === 'Copied' || (copied.label === 'Select and copy' && /WebFPV failed to start/.test(copied.shown)), copied.label);
    /* The CDN failures are what this scenario asked for. */
    errorsCheck(page, 'loadfail', /three|jsdelivr|Failed to fetch dynamically imported module|Importing a module script failed|ConnectionRefused/i);
  } catch (e) {
    check('loadfail: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* gallery: the asset gallery                                           */
/* ------------------------------------------------------------------ */

async function scenarioGallery() {
  for (const [query, what, want] of [['?asset=crane', 'one asset', 1], ['?row=industrial', 'one palette row', 2]]) {
    const page = await openPage({ root, width: 960, height: 540, url: `/src/props/gallery.html${query}` });
    try {
      await page.until('window.__galleryReady === true', 90000);
      const g = await json(page, `({
        items: window.__gallery.items.map((i) => i.type),
        batches: window.__gallery.batches,
        tris: window.__gallery.renderer.info.render.triangles,
        label: document.getElementById('label').textContent,
      })`);
      check(`gallery: ${what} is laid out and drawn`, g.items.length >= want && g.batches > 0 && g.tris > 100,
        `${g.items.length} items (${[...new Set(g.items)].slice(0, 4).join(', ')}), ${g.batches} batches, ${g.tris} triangles`);
      if (want === 1) {
        check('gallery: the asset it was asked for, and named under it', g.items.length === 1 && g.items[0] === 'crane' && /crane/i.test(g.label), g.label);
      }
      const look = await lookUntil(page, "document.getElementById('view')", null, (l) => l.colours >= 8);
      check(`gallery: ${what}: the picture is not blank`, look.colours >= 8, `${look.colours} colours`);
      errorsCheck(page, `gallery ${query}`);
    } catch (e) {
      check(`gallery: ${what}: the page ran to the end`, false, e.message);
    } finally {
      await page.close();
    }
  }
}

/* ------------------------------------------------------------------ */
/* bundle: Export bundle, and BUNDLE-FORMAT.md                          */
/* ------------------------------------------------------------------ */

/* The stored zip, read back: zip.js writes no compression, so each entry's
 * bytes follow its local header. Deflated entries are read too, in case. */
function readZip(buf) {
  const files = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('no end of central directory');
  }
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error(`bad central header ${k}`);
    }
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const packed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const lName = buf.readUInt16LE(local + 26);
    const lExtra = buf.readUInt16LE(local + 28);
    const start = local + 30 + lName + lExtra;
    const data = method === 0 ? buf.subarray(start, start + size) : inflateRawSync(buf.subarray(start, start + packed));
    files.set(name, { data, crc, method });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function scenarioBundle() {
  const page = await openPage({ root, width: 1600, height: 900, url: '/src/trackbuilder/index.html?class=micro' });
  try {
    await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    await page.until("window.trackBuilder.mode === '3d' && !!window.trackBuilder.view3d.renderer", 30000).catch(() => {});
    await page.evaluate(`(async () => {
      const { PRESETS } = await import('/src/trackbuilder/presets.js');
      window.trackBuilder.loadDocument(JSON.parse(JSON.stringify(PRESETS.find((p) => p.id === 'racegow5-track1'))), '');
      return 1;
    })()`);
    await page.sleep(500);
    /* The download is caught where the builder hands it to the browser. */
    await page.evaluate(`(() => {
      window.__downloads = [];
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) {
          window.__downloads.push({ name: this.download, taken: fetch(this.href).then((r) => r.arrayBuffer()) });
          return undefined;
        }
        return orig.call(this);
      };
      return 1;
    })()`);
    await clickText(page, '#tb-topbar .tb-more > button', 'More');
    await page.until("!document.querySelector('.tb-more-menu').hidden", 5000);
    await clickText(page, '.tb-more-item', 'Export bundle');
    await page.until("!!document.getElementById('tb-bundle-gif')", 10000);
    check('bundle: More, Export bundle opens its box with the small animation and the six views picked',
      await page.evaluate("document.getElementById('tb-bundle-gif').value === 'card' && document.getElementById('tb-bundle-stills').value === 'yes'"));
    await clickText(page, 'button', 'Make the bundle');
    await page.until('window.__downloads.length === 1', 300000);
    const got = await json(page, `(async () => {
      const d = window.__downloads[0];
      const buf = new Uint8Array(await d.taken);
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { name: d.name, b64: btoa(s) };
    })()`);
    await page.until("/^Done\\./.test([...document.querySelectorAll('.tb-help')].map((p) => p.textContent).join(' ').match(/Done\\.[^]*$/) ? 'Done.' : '')", 10000).catch(() => {});
    const status = await page.evaluate("[...document.querySelectorAll('.tb-help')].map((p) => p.textContent).find((t) => /^Done\\./.test(t)) || ''");
    const zip = readZip(Buffer.from(got.b64, 'base64'));
    check('bundle: a zip is saved, named for the track', /\.zip$/.test(got.name) && zip.size > 3, `${got.name}, ${zip.size} files`);
    const manifest = zip.has('bundle.json') ? JSON.parse(zip.get('bundle.json').data.toString('utf8')) : null;
    check('bundle: bundle.json is format webfpv.track-bundle, version 1', manifest && manifest.format === 'webfpv.track-bundle' && manifest.formatVersion === 1,
      manifest ? `${manifest.format} ${manifest.formatVersion}` : 'no bundle.json');
    if (manifest) {
      const keys = ['track', 'room', 'lap', 'gates', 'route', 'build', 'views', 'files'];
      check('bundle: the manifest has every key the format names', keys.every((k) => k in manifest), keys.filter((k) => !(k in manifest)).join(', '));
      check('bundle: the track is named, a whoop room, its own id', manifest.track.name === 'RaceGOW5 Track 1' && manifest.track.class === 'micro' && manifest.track.id === 'racegow5-track1',
        `${manifest.track.name} ${manifest.track.class} ${manifest.track.id}`);
      check('bundle: the room and the lap are measured', manifest.room.widthM > 0 && manifest.room.depthM > 0 && manifest.lap.lengthM > 0 && manifest.lap.gateCount === manifest.gates.length && manifest.lap.lapsCounted === 3,
        `${manifest.room.widthM} by ${manifest.room.depthM} m, lap ${manifest.lap.lengthM} m, ${manifest.lap.gateCount} gates`);
      const pts = manifest.route.points || [];
      check('bundle: the route is a point every spacingM round the lap', manifest.route.spacingM === 0.1 && pts.length > 10 && pts.every((q) => q.length === 3)
        && Math.abs(pts.length * manifest.route.spacingM - manifest.route.lengthM) < 1, `${pts.length} points, ${manifest.route.lengthM} m`);
      const roles = manifest.files.map((f) => f.role);
      for (const role of ['document', 'map', 'instructions', 'lap']) {
        check(`bundle: a ${role} file is listed`, roles.includes(role), roles.join(', '));
      }
      check('bundle: six views, with the line and without it', roles.filter((r) => r === 'view-route').length === 3 && roles.filter((r) => r === 'view-obstacles').length === 3,
        `${roles.filter((r) => r.startsWith('view-')).length} views`);
      const bad = [];
      for (const f of manifest.files) {
        const z = zip.get(f.path);
        if (!z) {
          bad.push(`${f.path} missing`);
        } else if (z.data.length !== f.bytes || crc32(z.data).toString(16).padStart(8, '0') !== f.crc32 || z.crc.toString(16).padStart(8, '0') !== f.crc32) {
          bad.push(`${f.path} ${z.data.length}/${f.bytes} ${crc32(z.data).toString(16)}/${f.crc32}`);
        }
      }
      check('bundle: every listed file is in the zip with its size and its CRC-32', bad.length === 0, bad.slice(0, 3).join('; '));
      check('bundle: bundle.json is not in its own list, and nothing is in the zip that is not listed',
        !manifest.files.some((f) => f.path === 'bundle.json') && [...zip.keys()].every((k) => k === 'bundle.json' || manifest.files.some((f) => f.path === k)),
        [...zip.keys()].join(', '));
      const png = manifest.files.find((f) => f.role === 'view-route');
      const gif = manifest.files.find((f) => f.role === 'lap');
      check('bundle: a view is a PNG of 800 by 500, the lap a GIF', png && zip.get(png.path).data.subarray(1, 4).toString() === 'PNG'
        && zip.get(png.path).data.readUInt32BE(16) === 800 && zip.get(png.path).data.readUInt32BE(20) === 500
        && gif && zip.get(gif.path).data.subarray(0, 6).toString() === 'GIF89a', png ? png.path : 'no view');
      const doc = zip.has('track.json') ? JSON.parse(zip.get('track.json').data.toString('utf8')) : null;
      check('bundle: track.json is the builder\'s own document, schemaVersion 3', doc && doc.schemaVersion === 3 && doc.id === manifest.track.id, doc ? `v${doc.schemaVersion}` : 'none');
    }
    check('bundle: the box says it is done, and left nothing out', /^Done\./.test(status) && !/Left out/.test(status), status);
    errorsCheck(page, 'bundle');
  } catch (e) {
    check('bundle: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* orbit: the board's thumbnail page                                    */
/* ------------------------------------------------------------------ */

async function scenarioOrbit() {
  const page = await openPage({ root, width: 854, height: 480, url: '/src/share/orbit.html?map=custom' });
  try {
    await page.until('window.__orbitReady === true || !!window.__orbitError', 180000);
    const first = await json(page, '({ cached: Boolean(window.__orbitCached), error: window.__orbitError || null, loopMs: window.__orbitLoopMs })');
    check('orbit: the first visit builds the world and flies the title camera', !first.cached && !first.error && first.loopMs >= 8000 && first.loopMs <= 12000, JSON.stringify(first));
    await page.until('(window.__orbitFrames || 0) > 8', 60000);
    const look = await lookUntil(page, "document.getElementById('view')", [0x14, 0x1c, 0x16], (l) => l.colours >= 8 && l.off > l.n / 2);
    check('orbit: the world is drawn, not its background', look.colours >= 8 && look.off > look.n / 2, `${look.colours} colours, ${look.off} of ${look.n} off the background`);
    /* One camera cycle is recorded, then played. */
    await page.until("!!document.querySelector('.orbit-clip')", 120000);
    const clip = await json(page, `(async () => {
      const v = document.querySelector('.orbit-clip');
      const blob = await fetch(v.src).then((r) => r.blob());
      return { tag: v.tagName, type: blob.type, bytes: blob.size, canvas: Boolean(document.getElementById('view')), status: document.getElementById('status').className };
    })()`);
    check('orbit: one cycle is recorded into a video clip that replaces the canvas', clip.tag === 'VIDEO' && /^video\//.test(clip.type) && clip.bytes > 10000 && !clip.canvas && clip.status === 'gone',
      `${clip.tag} ${clip.type} ${clip.bytes} bytes`);
    await page.until("(() => { const v = document.querySelector('.orbit-clip'); return v && v.readyState >= 2 && Number.isFinite(v.duration) && v.duration > 0.2; })()", 30000)
      .then(() => check('orbit: the clip plays, with a duration it can loop on', true))
      .catch(async () => check('orbit: the clip plays, with a duration it can loop on', false, await page.evaluate("(() => { const v = document.querySelector('.orbit-clip'); return v ? v.readyState + ' ' + v.duration : 'none'; })()")));
    /* The next visit plays the clip and never builds the world. */
    await page.evaluate('location.reload(), 1');
    await page.until('window.__orbitReady === true || !!window.__orbitError', 60000);
    const again = await json(page, `({
      cached: Boolean(window.__orbitCached), error: window.__orbitError || null,
      clip: Boolean(document.querySelector('.orbit-clip')), frames: window.__orbitFrames || 0,
    })`);
    check('orbit: the second visit plays the cached clip without building the world', again.cached && !again.error && again.clip && again.frames === 0, JSON.stringify(again));
    errorsCheck(page, 'orbit');
  } catch (e) {
    check('orbit: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* city: the cavity scan, and ribbon cutting's HUD                      */
/* ------------------------------------------------------------------ */

async function scenarioCity() {
  const page = await openPage({
    root,
    width: 1280,
    height: 720,
    /* A window of the town, so the scan costs seconds and not minutes. */
    seed: [BOARD_STUB, settingsSeed({ airframe: '5inch', map: 'city' }), 'globalThis.__CITY_CAVITY = { x0: -30, x1: 30, z0: -30, z1: 30 };'],
  });
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 180000);
    await page.until("window.__map().id === 'city' && window.__map().ready", 180000);
    const scan = await json(page, `(() => { const c = window.__map().colliderCavity; return c ? {
      skipped: c.skipped || null, bounds: c.bounds, cells: c.cells, grid: c.grid, colliders: c.colliders,
      drawn: c.drawnMeshes, air: c.airCells, inside: c.insideCells,
    } : null; })()`);
    check('city: the cavity scan ran over the window it was given', scan && !scan.skipped && scan.bounds[0] === -30 && scan.bounds[3] === 30 && scan.cells === scan.grid[0] * scan.grid[1] * scan.grid[2],
      JSON.stringify(scan && { bounds: scan.bounds, grid: scan.grid }));
    check('city: it saw the town\'s drawing and its colliders, and found free air', scan && scan.drawn > 0 && scan.colliders > 100 && scan.air > 0,
      scan ? `${scan.drawn} drawn meshes, ${scan.colliders} colliders, ${scan.air} air cells` : '');

    /* Ribbon cutting, as the Games row starts it. */
    await page.evaluate(PAST_GATE);
    await page.evaluate("(() => { const ui = window.__ui; ui.mode = 'freestyle'; ui.show('title'); ui.act('fly'); return 1; })()");
    await answerQuadPicker(page, 60000).catch(() => {});
    await page.until("window.__ui.screen === 'flight'", 60000);
    await page.evaluate("(() => { window.__ui.dogfight = { game: 'ribbon', bots: 2, skill: 'rookie', length: 'normal', round: '2m' }; return 1; })()");
    await page.until('!!(window.__dogfight() && window.__dogfightHud() && window.__dogfightHud().visible)', 60000);
    await page.sleep(800);
    const hud = await json(page, `(() => {
      const h = window.__dogfightHud();
      return { kind: h.constructor.name, text: h.root.textContent.replace(/\\s+/g, ' ').slice(0, 200), on: !h.root.classList.contains('is-off') };
    })()`);
    check('city: ribbon cutting puts its own HUD up', hud.kind === 'RibbonHud' && hud.on && /LEFT 3\/3|PRACTICE/.test(hud.text), `${hud.kind}: ${hud.text.slice(0, 80)}`);
    /* The events a round raises, handed to the HUD as the game hands them. */
    const ev = await json(page, `(() => {
      const h = window.__dogfightHud();
      const g = window.__dogfight();
      const now = performance.now();
      const out = {};
      out.snip = h.event({ type: 'cut', by: 0, to: 1 }, g, now);
      out.snipOn = !h.snipCall.classList.contains('is-off');
      out.cut = h.event({ type: 'out', by: 0, to: 2 }, g, now);
      out.cutOn = !h.cutCall.classList.contains('is-off') && h.snipCall.classList.contains('is-off');
      out.hurt = h.event({ type: 'cut', by: 1, to: 0 }, g, now);
      out.go = h.event({ type: 'go' }, g, now);
      out.feed = [...h.feed.children].map((s) => s.textContent);
      return out;
    })()`);
    check('city: a snip of mine says SNIP! and sounds the clip', ev.snip === 'clip' && ev.snipOn, JSON.stringify(ev));
    check('city: taking a ribbon says CUT!, sounds the gate and goes in the feed', ev.cut === 'gate' && ev.cutOn && ev.feed.some((t) => /cut .*ribbon/.test(t)), ev.feed.join(' | '));
    check('city: being cut sounds the crash, GO the select', ev.hurt === 'crash' && ev.go === 'select', `${ev.hurt} ${ev.go}`);
    /* Put away by a frame past its 900 ms: polled, because a frame here
     * can take a fifth of a second. */
    await page.until('window.__dogfightHud().cutCall.classList.contains("is-off")', 20000)
      .then(() => check('city: the call goes after its moment', true))
      .catch(() => check('city: the call goes after its moment', false));
    const result = await json(page, `(() => {
      const h = window.__dogfightHud();
      h.showResult(window.__dogfight(), { best: 2, newBest: true, kicker: 'Ribbon cutting' });
      return {
        title: h.result.querySelector('h2').textContent,
        rows: h.result.querySelectorAll('table tr').length,
        medals: [...h.result.querySelectorAll('.df-medal')].map((m) => m.textContent),
        buttons: [...h.result.querySelectorAll('button')].map((b) => b.textContent),
      };
    })()`);
    check('city: the results list every pilot of the round, under a title', /Ribbon cutting/.test(result.title) && result.rows === 4, `${result.title}, ${result.rows - 1} pilots`);
    check('city: with my medals and the way on', result.medals.some((m) => /Ribbons taken/.test(m)) && result.medals.some((m) => /a new best/.test(m)) && ['Again', 'Change the ribbons', 'Leave'].every((b) => result.buttons.includes(b)),
      `${result.medals.join(' | ')}; ${result.buttons.join(', ')}`);
    errorsCheck(page, 'city');
  } catch (e) {
    check('city: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* logos: which surface a sponsor's mark is on                          */
/* ------------------------------------------------------------------ */

/* A 16 by 8 PNG, one colour, as the logo every mark wears. */
const LOGO_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAAGElEQVR4nGP4z8Dwn4ECzDBqwKgBwwYAAGVuB/k5u3vNAAAAAElFTkSuQmCC';

async function scenarioLogos() {
  const page = await openPage({ root, width: 1280, height: 720, seed: [BOARD_STUB, settingsSeed({ airframe: '5inch', map: 'city' })] });
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 120000);
    /* The starter map, wearing five marks: one on the billboard, one beside
     * the office block, two at the bando's edges and one out in the open. */
    const placed = await json(page, `(async () => {
      const { starterMap } = await import('/src/maps/built/starter.js');
      const { writeAutosave } = await import('/src/trackbuilder/storage.js');
      const doc = starterMap();
      const at = (t) => doc.elements.find((e) => e.type === t);
      const bb = at('billboard');
      const bd = at('building');
      const bn = at('bando');
      doc.branding = { logos: [{ id: 'logo-check', name: 'Check', image: ${JSON.stringify(LOGO_PNG)} }] };
      const mark = (id, x, y) => ({ id, type: 'groundLogo', position: { x, y, z: 0 }, yaw: 0, pitch: 0, yawOverridden: false, dims: { width: 4, depth: 2 }, logoId: 'logo-check' });
      doc.elements.push(
        mark('el-logo-bb', bb.position.x, bb.position.y),
        mark('el-logo-bd', bd.position.x, bd.position.y),
        /* Near the bando's edge, where its walls stand: its middle is an
         * open court with no wall within reach, and a mark there honestly
         * stays on the ground. */
        mark('el-logo-bn', bn.position.x + bn.dims.width / 2 - 0.5, bn.position.y),
        mark('el-logo-bn2', bn.position.x, bn.position.y - (bn.dims.depth / 2 - 0.5)),
        mark('el-logo-open', -150, -150),
      );
      doc.id = 'map-fea7logo';
      doc.name = 'Features check marks';
      writeAutosave(doc);
      return { billboard: Boolean(bb), building: Boolean(bd), bando: Boolean(bn), ground: doc.field && doc.field.ground };
    })()`);
    check('logos: the starter map has a billboard, a building and a bando to hang marks on', placed.billboard && placed.building && placed.bando, JSON.stringify(placed));
    await page.evaluate("window.__setMap('built'), 1");
    await page.until("(() => { const m = window.__map(); return m.id === 'built' && m.ready && m.documentId === 'map-fea7logo'; })()", 180000);
    await page.until("(() => { let n = 0; window.__mapScene().traverse((o) => { if (o.name === 'groundLogo') n += 1; }); return n >= 5; })()", 30000).catch(() => {});
    const marks = await json(page, `(() => {
      const out = [];
      window.__mapScene().traverse((o) => { if (o.name === 'groundLogo') out.push({ surface: o.userData.surface, y: +o.position.y.toFixed(2) }); });
      return { marks: out, painted: window.__map().painted, ground: window.__map().scene && window.__map().scene.ground };
    })()`);
    const kinds = marks.marks.map((m) => m.surface).sort();
    check('logos: all five marks are painted', marks.painted && marks.painted.logos === 5 && marks.marks.length === 5, `${marks.painted && marks.painted.logos} painted, ${marks.marks.length} meshes`);
    check('logos: one on the billboard\'s face, one a sign on the building, graffiti on a bando wall',
      kinds.includes('billboard') && kinds.includes('sign') && kinds.includes('graffiti'), kinds.join(', '));
    check('logos: and the one out in the open stays on the ground', kinds.includes(marks.ground === 'grass' ? 'sprayed' : 'ground'), `${kinds.join(', ')} on ${marks.ground}`);
    check('logos: the ones on a wall stand off the ground', marks.marks.filter((m) => ['billboard', 'sign', 'graffiti'].includes(m.surface)).every((m) => m.y > 0.5),
      marks.marks.map((m) => `${m.surface} ${m.y}`).join(', '));
    errorsCheck(page, 'logos');
  } catch (e) {
    check('logos: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* modules: the trails, the plans and the badges, in the booted page    */
/* ------------------------------------------------------------------ */

async function scenarioModules() {
  const page = await openPage({ root, width: 1280, height: 720, seed: [BOARD_STUB, settingsSeed({ airframe: '5inch', map: 'custom' })] });
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 120000);

    /* THE HARNESS SERVES IMAGES AS IMAGES (art.md ART-23): the credits'
     * SVG logo under Powered by was application/octet-stream here, so
     * every capture of the loading screen showed it broken. */
    const logo = await json(page, `(async () => {
      const r = await fetch('/assets/credits/betaflight-mono.svg');
      const img = new Image();
      img.src = '/assets/credits/betaflight-mono.svg';
      const drawn = await img.decode().then(() => img.naturalWidth > 0, () => false);
      return { type: r.headers.get('content-type'), drawn };
    })()`);
    check('modules: the harness serves an SVG as image/svg+xml, and it decodes', logo.type === 'image/svg+xml' && logo.drawn, JSON.stringify(logo));

    /* A GAME HUD'S 'select' IS THE MENU CLICK (fun.md FUN-5). Quad Ball's
     * kick off, overtime and reset, a goal against, the dogfight and the
     * ribbons send 'select' to audio.event, and it used to play the
     * landing thump. The real class, its voices stubbed, so what is read
     * is which path the call took. */
    const cue = await json(page, `(async () => {
      const { MotorAudio } = await import('/src/render/audio.js');
      const a = new MotorAudio();
      const touched = [];
      const param = (name) => ({
        cancelScheduledValues() { touched.push(name); }, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {},
      });
      a.ctx = { currentTime: 0 };
      a.mix = { ...a.mix, effects: 1 };
      a.cueGain = { gain: param('cueGain') };
      a.cueOsc = { frequency: param('cueOsc') };
      a.crashGain = { gain: param('crashGain') };
      a.crashLp = { frequency: param('crashLp'), Q: param('crashLpQ') };
      a.duckFlight = () => touched.push('duck');
      a.music = { duckNow: () => touched.push('duckMusic') };
      const ui = [];
      a.ui = (k) => ui.push(k);
      a.event('select');
      return { ui, touched };
    })()`);
    check('modules: audio.event(\'select\') plays the menu click, not the landing thump', cue.ui.join() === 'select' && cue.touched.length === 0, JSON.stringify(cue));

    /* THE TRAILS, from a real FieldWatch fed two pilots' poses, drawn by a
     * renderer of its own looking down on them. */
    const trails = await json(page, `(async () => {
      const THREE = window.__three;
      const tr = await import('/src/render/trails.js');
      const { FieldWatch } = await import('/src/net/fieldwatch.js');
      const field = new FieldWatch();
      let t = 1000;
      for (let i = 0; i < 400; i += 1) {
        t += 50;
        field.note('a', i * 0.2 - 40, 2, 0, false, t);
        field.note('b', i * 0.2 - 40, 2, 6, false, t);
      }
      const trails = tr.buildTrails();
      const colour = (id) => (id === 'a' ? 0xff7d96 : 0x7dffb4);
      const one = () => 1;
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 200;
      const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
      renderer.setClearColor(0x000000, 1);
      const scene = new THREE.Scene();
      scene.add(trails.mesh);
      const camera = new THREE.PerspectiveCamera(60, 320 / 200, 0.5, 400);
      camera.position.set(0, 60, 3);
      camera.lookAt(0, 0, 3);
      const lit = () => {
        renderer.render(scene, camera);
        const gl = renderer.getContext();
        const px = new Uint8Array(320 * 200 * 4);
        gl.readPixels(0, 0, 320, 200, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let n = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 60) n += 1;
        return n;
      };
      const out = { lengths: tr.TRAIL_LENGTHS.map((l) => l.key) };
      const at = (key) => tr.TRAIL_LENGTHS.find((l) => l.key === key).ms;
      trails.update(field, t, at('long'), colour, one, () => 0);
      out.long = { visible: trails.mesh.visible, steps: trails.mesh.geometry.instanceCount, lit: lit() };
      trails.update(field, t, at('short'), colour, one, () => 0);
      out.short = { visible: trails.mesh.visible, steps: trails.mesh.geometry.instanceCount };
      trails.update(field, t, at('lap'), colour, one, () => field.clock(t) - 8000);
      out.lap = { visible: trails.mesh.visible, steps: trails.mesh.geometry.instanceCount };
      trails.update(field, t, at('long'), (id) => (id === 'a' ? 0xff7d96 : -1), one, () => 0);
      out.onlyA = { steps: trails.mesh.geometry.instanceCount };
      trails.update(field, t, at('off'), colour, one, () => 0);
      out.off = { visible: trails.mesh.visible, lit: lit() };
      trails.hide();
      out.hidden = !trails.mesh.visible;
      trails.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      return out;
    })()`);
    check('modules: trails: Long draws both pilots\' trails', trails.long.visible && trails.long.steps > 100 && trails.long.lit > 50, JSON.stringify(trails.long));
    check('modules: trails: Short is fewer steps than Long, the whole lap the lap\'s', trails.short.visible && trails.short.steps > 0 && trails.short.steps < trails.long.steps && trails.lap.steps > trails.short.steps,
      `short ${trails.short.steps}, long ${trails.long.steps}, lap ${trails.lap.steps}`);
    check('modules: trails: a pilot left out is not drawn', trails.onlyA.steps > 0 && trails.onlyA.steps * 2 <= trails.long.steps + 2, `${trails.onlyA.steps} of ${trails.long.steps}`);
    check('modules: trails: at Off nothing is drawn', !trails.off.visible && trails.off.lit === 0 && trails.hidden, JSON.stringify(trails.off));

    /* THE PLANS: a whoop track's three quarter view, as the course cards draw
     * it, and a freestyle map's plan, as the board's map tiles do. */
    const plans = await json(page, `(async () => {
      const P = await import('/src/share/plan.js');
      const { presetsForClass } = await import('/src/trackbuilder/presets.js');
      const { FIVE_INCH_PRESETS } = await import('/src/trackbuilder/presets5.js');
      const { boardPlanOf } = await import('/src/trackbuilder/view2d.js');
      const { starterMap } = await import('/src/maps/built/starter.js');
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:200px;z-index:-1';
      document.body.append(host);
      const look = (c) => {
        const ctx = c.getContext('2d');
        const seen = new Set();
        for (let i = 1; i < 32; i += 1) for (let j = 1; j < 20; j += 1) {
          const p = ctx.getImageData(Math.floor(i * c.width / 32), Math.floor(j * c.height / 20), 1, 1).data;
          seen.add((p[0] >> 3) + ',' + (p[1] >> 3) + ',' + (p[2] >> 3) + ',' + (p[3] >> 5));
        }
        return seen.size;
      };
      const out = {};
      const track = P.planFromDocument(presetsForClass('micro')[0]);
      const c1 = P.planCanvas(track, 'Plan');
      c1.style.cssText = 'width:320px;height:200px;display:block';
      host.append(c1);
      out.lapMs = P.isoLapMs(track);
      P.drawIso(c1, track, {});
      out.isoStill = look(c1);
      P.drawIso(c1, track, { phase: 0.25 });
      out.isoLap = look(c1);
      const c2 = P.planCanvas(track, 'Plan');
      c2.style.cssText = 'width:320px;height:200px;display:block';
      host.append(c2);
      out.flat = P.drawPlan(c2, track, { scaleBar: true }) && look(c2);
      const big = P.planFromDocument(FIVE_INCH_PRESETS[0]);
      const c3 = P.planCanvas(big, 'Plan');
      c3.style.cssText = 'width:320px;height:200px;display:block';
      host.append(c3);
      out.full = P.drawPlan(c3, big, {}) && look(c3);
      out.fullIso = (P.drawIso(c3, big, { phase: 0.5 }), look(c3));
      /* A map's plan is the one the builder hands the board. */
      const mapPlan = boardPlanOf(starterMap());
      out.isMap = P.isMapPlan(mapPlan);
      const c4 = P.planCanvas(mapPlan, 'Plan');
      c4.style.cssText = 'width:320px;height:200px;display:block';
      host.append(c4);
      out.map = P.drawPlan(c4, mapPlan, { scaleBar: true }) && look(c4);
      const c5 = P.planCanvas(null, 'Plan');
      c5.style.cssText = 'width:320px;height:200px;display:block';
      host.append(c5);
      out.blank = P.drawPlan(c5, null, {}) && look(c5);
      host.remove();
      return out;
    })()`);
    check('modules: plan: a whoop track\'s three quarter view draws, still and mid lap', plans.isoStill >= 6 && plans.isoLap >= 6 && plans.lapMs > 0,
      `${plans.isoStill} and ${plans.isoLap} colours, lap ${Math.round(plans.lapMs)} ms`);
    check('modules: plan: drawn flat with numbers and a scale it has more ink than the empty plate', plans.flat > plans.blank && plans.blank >= 1, `${plans.flat} against ${plans.blank}`);
    check('modules: plan: a 5 inch field draws both ways', plans.full > plans.blank && plans.fullIso >= 6, `${plans.full}, ${plans.fullIso}`);
    check('modules: plan: a freestyle map is a map plan and draws its pieces', plans.isMap && plans.map > plans.blank, `${plans.map} colours`);

    /* THE BADGES: every glyph, earned and not, is well formed SVG. */
    const badges = await json(page, `(async () => {
      const A = await import('/src/steam/achievementart.js');
      const bad = [];
      const ids = ['CAREER_FIRST', 'RACE_FIRST', 'FLY_FIRST', 'TRICK_FIRST'];
      let n = 0;
      for (const glyph of [...A.GLYPH_NAMES, 'no-such-glyph']) {
        for (const id of ids) {
          for (const earned of [true, false]) {
            const svg = A.achievementSvg({ id, glyph }, earned);
            const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
            n += 1;
            if (doc.querySelector('parsererror') || doc.documentElement.nodeName !== 'svg' || doc.documentElement.children.length < 4) {
              bad.push(glyph + ' ' + id + ' ' + earned);
            }
          }
        }
      }
      const a = A.achievementSvg({ id: 'RACE_FIRST', glyph: A.GLYPH_NAMES[0] }, true);
      const b = A.achievementSvg({ id: 'RACE_FIRST', glyph: A.GLYPH_NAMES[0] }, false);
      return { glyphs: A.GLYPH_NAMES.length, n, bad, differ: a !== b };
    })()`);
    check('modules: badges: every achievement glyph, earned and not, parses as SVG', badges.glyphs > 5 && badges.bad.length === 0, `${badges.n} drawings, ${badges.bad.slice(0, 3).join('; ')}`);
    check('modules: badges: unearned is not the earned picture', badges.differ);
    /* THE SOLO PAGE'S MINI GAMES PANEL (fun.md FUN-22, FUN-14): its POW!
     * and its NEW! sticker do not overprint, and the Quad Ball caption
     * names nobody else's game. */
    const { GATE_GAMES } = await import('../src/ui/gatepages.js');
    const ball = GATE_GAMES.find((g) => g.id === 'mg-ball');
    check('modules: the Quad Ball caption names no other company\'s game', ball && !/rocket league/i.test(ball.caption), ball && ball.caption);
    await page.evaluate("window.__ui.turnGate('solo'), 1");
    const stick = await json(page, `(async () => {
      const box = (sel) => { const n = document.querySelector(sel); if (!n) { return null; } const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      let a = null; let b = null;
      for (let i = 0; i < 100; i += 1) {
        a = box('.gate-card-games .gp-dog-sfx');
        b = box('.gate-card-games .gp-dog-sticker');
        const card = box('.gate-card-games');
        if (a && b && card && card.r <= window.innerWidth + 1) { break; }
        await new Promise((r) => setTimeout(r, 100));
      }
      return { a, b, over: Boolean(a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) };
    })()`);
    check('modules: on the solo page the Mini games POW! and NEW! do not overlap', stick.a && stick.b && !stick.over, JSON.stringify(stick));
    errorsCheck(page, 'modules');
  } catch (e) {
    check('modules: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* lettering: the titles read as their words                            */
/* ------------------------------------------------------------------ */

/*
 * ART-1 and FUN-10: every lettered title lost its word spaces ("THETOWN")
 * and had holes after L and A ("MUL TIPLA YER"), because each glyph was
 * measured alone and a space was narrower than the two outlines either
 * side of it. Asserted on the canvas itself and on the layout:
 *
 *   gap    a title of two words, painted by paintTitle, has a run of clear
 *          paper between the words at least a tenth of its size wide, read
 *          along the slant (the glyphs are sheared, so a straight column
 *          would cut through both words even where the eye sees a gap)
 *   kern   after L, A or an apostrophe's L, the next glyph advances less
 *          than it does after H, by at least four hundredths of the size:
 *          the font's own pair kerning, which a glyph measured alone loses
 */
async function scenarioLettering() {
  const page = await openPage({ root, width: 800, height: 600, url: '/scripts/og.html' });
  try {
    const r = await json(page, `(async () => {
      const L = await import('/src/ui/lettering.js');
      const px = 48;
      const gapOf = (text) => {
        const c = document.createElement('canvas');
        const m = L.paintTitle(c, [{ text, fill: L.INKS.cream }], px);
        const ctx = c.getContext('2d');
        const { width: W, height: H } = c;
        const d = ctx.getImageData(0, 0, W, H).data;
        const s = W / m.w;
        const base = m.base * s;
        /* Clear columns along the slant, and the widest run of them that
         * has ink on both sides. */
        const clear = [];
        for (let x = 0; x < W; x += 1) {
          let ok = true;
          for (let y = 0; y < H && ok; y += 1) {
            const xx = Math.round(x + 0.24 * (base - y));
            if (xx >= 0 && xx < W && d[(y * W + xx) * 4 + 3] > 24) {
              ok = false;
            }
          }
          clear.push(ok);
        }
        const first = clear.indexOf(false);
        const last = clear.lastIndexOf(false);
        let best = 0;
        let run = 0;
        for (let x = first; x <= last; x += 1) {
          run = clear[x] ? run + 1 : 0;
          best = Math.max(best, run);
        }
        return best / s;
      };
      const ctx = document.createElement('canvas').getContext('2d');
      const after = (a, b) => L.wordWidth(ctx, a + b, px) - L.wordWidth(ctx, a, px);
      return {
        gaps: ['THE TOWN', 'HOW DO', 'RUN ENDED', 'YOUR MAP'].map((t) => [t, gapOf(t)]),
        kern: [['L', 'T'], ['A', 'Y'], ['L', 'V'], ['L', "'"]].map(([a, b]) => [a + b, (after('H', b) - after(a, b)) / px]),
      };
    })()`);
    for (const [t, g] of r.gaps) {
      check(`lettering: "${t}" has clear paper between its words`, g >= 4.8, `${g.toFixed(1)} px at 48 px`);
    }
    for (const [pair, k] of r.kern) {
      check(`lettering: "${pair}" is kerned closer than after H`, k >= 0.04, `${(k * 100).toFixed(1)} hundredths of the size`);
    }
    errorsCheck(page, 'lettering');
  } catch (e) {
    check('lettering: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* thumbs: every shipped world picture comes from the generator          */
/* ------------------------------------------------------------------ */

/*
 * ART-5: assets/thumbs/drift.jpg was a screenshot of the shell, with the
 * music dock and the key hint bar in it, because Drift Matsuri was never
 * on the list scripts/boardcards.js --worlds draws from orbit.html with
 * nothing but the world in frame. So every picture in assets/thumbs/ has
 * to be one that list names, and no world is left to be photographed by
 * hand. No browser: the list and the folder.
 */
async function scenarioThumbs() {
  const { readFile, readdir } = await import('node:fs/promises');
  const src = await readFile(`${root}/scripts/boardcards.js`, 'utf8');
  const listed = new Set([...src.matchAll(/\{ id: '[\w-]+', file: '([\w.-]+)'/g)].map((m) => m[1]));
  const files = (await readdir(`${root}/assets/thumbs`)).filter((f) => /\.jpg$/.test(f));
  const loose = files.filter((f) => !listed.has(f));
  check('thumbs: every picture in assets/thumbs is drawn by boardcards.js --worlds', files.length > 20 && loose.length === 0, loose.length ? `not on its list: ${loose.join(', ')}` : `${files.length} pictures`);
}

/* ------------------------------------------------------------------ */
/* offline: the Track map with no board still has a track               */
/* ------------------------------------------------------------------ */

/*
 * ART-20: a cold boot on the Track map whose board does not answer built
 * an empty field with no gates. It seats a shipped track now, marked as a
 * stand in, and a later boot that reaches the board gives the seat to the
 * board's most flown track. Two pages: no board at all, then a board that
 * answers, on a profile already holding the stand in.
 */
async function scenarioOffline() {
  const SEAT = 'webfpv.share.import.v1';
  const seatOf = `JSON.parse(localStorage.getItem(${JSON.stringify(SEAT)}) || 'null')`;
  const page = await openPage({ root, width: 1280, height: 720, seed: [settingsSeed({ airframe: '5inch', map: 'custom' })] });
  let held = null;
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 120000);
    await page.until("(() => { const m = window.__map && window.__map(); return m && m.ready && m.id === 'custom'; })()", 120000);
    const r = await json(page, `(() => {
      const seat = ${seatOf};
      const race = window.__race && window.__race();
      return { seat, gates: race && race.gates ? race.gates.length : 0 };
    })()`);
    held = r.seat;
    check('offline: with no board the Track map seats a shipped track, as a stand in', Boolean(r.seat && r.seat.standIn && r.seat.stock && r.seat.document), r.seat ? `${r.seat.name}, standIn ${r.seat.standIn}` : 'nothing seated');
    check('offline: and the field has its gates', r.gates > 0, `${r.gates} gates`);
    errorsCheck(page, 'offline');
  } catch (e) {
    check('offline: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
  if (!held) {
    return;
  }
  const { FIVE_INCH_PRESETS } = await import('../src/trackbuilder/presets5.js');
  const doc = JSON.parse(JSON.stringify(FIVE_INCH_PRESETS[1]));
  doc.id = 'trk-feat0001';
  const routes = `window.__board.routes['GET /api/tracks'] = { body: { tracks: [{ id: 'trk-feat0001', name: 'Board track', author: 'Pilot', gates: 12, times: 9, trackClass: 'full' }] } };
    window.__board.routes['GET /api/tracks/trk-feat0001/document'] = { body: { id: 'trk-feat0001', name: 'Board track', author: 'Pilot', document: ${JSON.stringify(doc)} } };`;
  const again = await openPage({
    root, width: 1280, height: 720,
    seed: [BOARD_STUB, routes, settingsSeed({ airframe: '5inch', map: 'custom' }, `localStorage.setItem(${JSON.stringify(SEAT)}, ${JSON.stringify(JSON.stringify(held))});`)],
  });
  try {
    await again.until('window.__shellReady === true && !!window.__ui', 120000);
    await again.until(`(() => { const s = ${seatOf}; return s && s.id === 'trk-feat0001'; })()`, 30000).catch(() => {});
    const seat = await json(again, seatOf);
    check('offline: a later boot that reaches the board gives the seat to its most flown track', Boolean(seat && seat.id === 'trk-feat0001' && !seat.standIn), seat ? `${seat.id}, standIn ${seat.standIn}` : 'nothing seated');
    errorsCheck(again, 'offline, board back');
  } catch (e) {
    check('offline: the board back scenario ran to the end', false, e.message);
  } finally {
    await again.close();
  }
}

/* ------------------------------------------------------------------ */
/* library: the Tracks and Maps rooms on a phone, and the command bar    */
/* ------------------------------------------------------------------ */

/*
 * ART-8: on a phone on its side the library's head took the whole height
 * and the sticky caption covered the rest, so no card was in sight. ART-16:
 * the command bar's legend was cream on the cream paper, and its Fly it
 * repeated the caption's FLY THIS. Asserted on the Maps room, which lists
 * the shipped worlds with no board, at two phone sizes and a desktop one:
 *
 *   seen     at least one card wholly between the top bar and the caption
 *   caption  one line on a phone: no taller than 80 px
 *   bar      the command bar is an ink strip where its words are
 *   once     the bar's Fly it is hidden while the caption's FLY THIS is in
 *            sight
 */
async function scenarioLibrary() {
  for (const [w, h, touch] of [[844, 390, true], [740, 360, true], [1600, 900, false]]) {
    const page = await openPage({ root, width: w, height: h, touch, seed: [settingsSeed({ airframe: '5inch', map: 'city' })] });
    const at = `${w}x${h}`;
    try {
      await page.until('window.__shellReady === true && !!window.__ui', 120000);
      await page.evaluate(`(() => { ${PAST_GATE}; window.__ui.show('freestyle'); return 1; })()`);
      await page.until("!!document.querySelector('.room-picker .wp-card') && !!document.querySelector('.room-picker .wp-hero:not([hidden]) .wp-act.is-primary')", 60000);
      await page.sleep(2500);
      const r = await json(page, `(() => {
        const ui = window.__ui;
        const bars = getComputedStyle(ui.root);
        const top = parseFloat(bars.getPropertyValue('--bar-top')) || 0;
        const bot = innerHeight - (parseFloat(bars.getPropertyValue('--bar-bot')) || 0);
        const cap = document.querySelector('.room-picker .wp-hero').getBoundingClientRect();
        const floor = Math.min(bot, cap.top);
        const seen = [...document.querySelectorAll('.room-picker .wp-strip .wp-card')]
          .map((c) => c.getBoundingClientRect()).filter((b) => b.height > 0 && b.top >= top - 1 && b.bottom <= floor + 1).length;
        const fb = document.querySelector('.frame-bot');
        const fp = document.querySelector('.frame-primary');
        return { seen, cap: Math.round(cap.height), bar: getComputedStyle(fb).backgroundImage, flyIt: !fp.hidden };
      })()`);
      check(`library ${at}: a card is wholly in sight between the bars and the caption`, r.seen >= 1, `${r.seen} card(s)`);
      if (touch) {
        check(`library ${at}: the caption is one line`, r.cap <= 80, `${r.cap} px`);
      }
      check(`library ${at}: the command bar is an ink strip where its words are`, /rgba\(11, 17, 22, 0\.97\)/.test(r.bar), r.bar.slice(0, 90));
      check(`library ${at}: no second Fly it while the caption's FLY THIS is in sight`, r.flyIt === false);
      errorsCheck(page, `library ${at}`);
    } catch (e) {
      check(`library ${at}: the scenario ran to the end`, false, e.message);
    } finally {
      await page.close();
    }
  }
  /* The Tracks room on the whoop, with one of the pilot's own tracks: it
   * has no picture, so its card draws its plan (FUN-17) and not a letter,
   * and once it is chosen the caption's FLY THIS is the only Fly it. */
  /* 640 high, so the rows under the picker, the screen's own Fly it among
   * them, are below the fold, which is when the bar repeats it. */
  const page = await openPage({
    root, width: 1280, height: 640,
    seed: [settingsSeed({ airframe: 'whoop65', map: 'city' },
      `localStorage.setItem('webfpv.trackbuilder.library.v1', ${JSON.stringify(JSON.stringify({ [ROOM_TRACK.id]: ROOM_TRACK }))});`)],
  });
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 120000);
    await page.evaluate(`(() => { ${PAST_GATE}; window.__ui.show('courses'); return 1; })()`);
    const card = `[...document.querySelectorAll('.room-picker .wp-strip .wp-card')].find((c) => /Features check track/.test(c.getAttribute('aria-label') || ''))`;
    await page.until(`!!(${card})`, 60000);
    await page.until(`!!(${card}).querySelector('canvas.wp-plan[data-done]')`, 15000).catch(() => {});
    const drawn = await json(page, `(() => { const c = ${card}; return { plan: !!c.querySelector('canvas.wp-plan[data-done]'), letter: !!c.querySelector('.wp-blank') }; })()`);
    check('library: a track with no picture draws its plan on its card, not its initial', drawn.plan && !drawn.letter, JSON.stringify(drawn));
    const at = await json(page, `(() => { const r = (${card}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await clickAt(page, at.x, at.y);
    await page.until("!!document.querySelector('.room-picker .wp-hero:not([hidden]) .wp-act.is-primary')", 15000);
    await page.evaluate("(() => { document.querySelector('.screen-courses:not([style*=none])').scrollTop = 0; return 1; })()");
    await page.sleep(800);
    const once = await json(page, `(() => ({
      name: document.querySelector('.room-picker .wp-hero .wp-sr') ? document.querySelector('.room-picker .wp-hero .wp-sr').textContent : '',
      own: document.querySelector('.room-picker .wp-hero .wp-act.is-primary').textContent,
      bar: !document.querySelector('.frame-primary').hidden,
      barText: document.querySelector('.frame-primary').textContent,
      capPlan: !!document.querySelector('.room-picker .wp-hero canvas.wp-plan[data-done]'),
    }))()`);
    check('library: the chosen track\'s caption draws its plan too', once.capPlan, JSON.stringify(once));
    check('library: no second Fly it on the bar while the caption\'s own is in sight', !once.bar, `caption ${once.own}, bar ${once.bar ? once.barText : 'hidden'}`);
    errorsCheck(page, 'library tracks');
  } catch (e) {
    check('library: the Tracks room ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* results: the magazine's results page                                 */
/* ------------------------------------------------------------------ */

/* Six gates a lap, as a race keeps them: ms from the lap's start. */
const RESULTS_LOG = `(() => {
  const sp = (a) => { let t = 0; return a.map((x) => (t += x)); };
  return [
    { n: 1, ms: 15230, splits: sp([2100, 2600, 3100, 2900, 2230, 2300]) },
    { n: 2, ms: 14800, splits: sp([2000, 2700, 2900, 2800, 2200, 2200]) },
    { n: 3, ms: null, reason: 'Missed gate 4' },
  ];
})()`;

const RESULTS_SEAT = `(() => {
  const ui = window.__ui;
  ui.settings.feelAsked = true;
  ui.share = { id: 'trk-feaA', name: 'Features check track', author: 'Check' };
  ui.boardCourses = [
    { id: 'trk-feaA', name: 'Features check track', trackClass: 'micro' },
    { id: 'trk-feaB', name: 'Kingston Loop', author: 'Ben', trackClass: 'micro' },
  ];
  ui.standingsFor = { id: 'trk-feaA' };
  ui.standingsTimes = [{ lapMs: 13000, threeMs: 40000 }, { lapMs: 14000, threeMs: 42000 }, { lapMs: 14500, threeMs: 43000 }, { lapMs: 15500, threeMs: 47000 }];
  return 1;
})()`;

async function resultsPhone(w, h) {
  const page = await openPage({ root, width: w, height: h, touch: true, seed: [BOARD_STUB, settingsSeed({ hasFlown: true, feelAsked: true })] });
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 120000);
    await page.evaluate(RESULTS_SEAT);
    await page.evaluate(`(() => { window.__ui.firstRun = false; window.__ui.showResults(${RESULTS_LOG}, 14100, 14100, null, { threeMs: null, trackClass: 'micro' }); return 1; })()`);
    await page.until("window.__ui.screen === 'results'", 10000);
    await page.sleep(700);
    const r = await json(page, `(() => {
      for (const a of document.getAnimations()) { a.finish(); }
      const scr = document.querySelector('.screen-results');
      const box = (n) => { const b = n.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
      const top = box(scr.querySelector('.results-top'));
      const menu = box(scr.querySelector('.menu'));
      const chipN = document.querySelector('.bug-chip');
      const chip = chipN && !chipN.hidden ? box(chipN) : null;
      const barTop = box(document.querySelector('.frame-top'));
      const barBot = box(document.querySelector('.frame-bot'));
      const head = box(scr.querySelector('.results-head'));
      const bad = [];
      if (hit(top, menu)) bad.push('the page and the menu overlap');
      if (chip && (hit(chip, top) || hit(chip, menu))) bad.push('the bug chip sits on the page or the menu');
      if (head.t < barTop.b - 1) bad.push('the title is under the status bar');
      if (menu.b > barBot.t + 1) bad.push('the menu runs ' + Math.round(menu.b - barBot.t) + ' px under the command bar');
      if (top.b > barBot.t + 1) bad.push('the page runs under the command bar');
      if (top.r > innerWidth + 1 || menu.r > innerWidth + 1) bad.push('wider than the glass');
      const m = scr.querySelector('.menu');
      const rows = [...m.querySelectorAll('.row')];
      const last = rows[rows.length - 1];
      m.scrollTop = m.scrollHeight;
      if (last && box(last).b > box(m).b + 1) bad.push('the last row cannot be scrolled to');
      return { bad, paper: getComputedStyle(scr.querySelector('.results-top')).backgroundColor };
    })()`);
    check(`results: ${w} by ${h}: the page, the menu, the bug chip and both bars clear of each other`, r.bad.length === 0 && r.paper === 'rgb(247, 240, 220)', r.bad.join('; ') || r.paper);
    errorsCheck(page, `results ${w}x${h}`);
  } catch (e) {
    check(`results: ${w} by ${h}: the scenario ran to the end`, false, e.message);
  } finally {
    await page.close();
  }
}

async function scenarioResults() {
  const page = await openPage({
    root, width: 1600, height: 900,
    seed: [BOARD_STUB, settingsSeed({ airframe: 'whoop65', hasFlown: true, feelAsked: true },
      `localStorage.setItem('webfpv.trackbuilder.library.v1', ${JSON.stringify(JSON.stringify({ [ROOM_TRACK.id]: ROOM_TRACK }))});`)],
  });
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 120000);
    await page.evaluate(`(() => { const ui = window.__ui; ui.firstRun = false; ui.craftGate = false; ui.mode = 'race';
      ui.show('courses'); ui.act('local:${ROOM_TRACK.id}'); return 1; })()`);
    await page.until("(() => { const m = window.__map(); return m.id === 'custom' && m.ready && m.mode !== 'freestyle' && m.gates > 0; })()", 120000);
    await page.evaluate(RESULTS_SEAT);
    const callsBefore = await page.evaluate('window.__board.calls.length');
    await page.evaluate(`(() => { window.__ui.osdMode = 'race'; window.__ui.showResults(${RESULTS_LOG}, 14100, 14100, null, { threeMs: null, trackClass: 'full' }); return 1; })()`);
    await page.until("window.__ui.screen === 'results' && document.querySelector('.screen-results .results-head').classList.contains('is-lettered')", 10000)
      .catch(() => {});
    const r = await json(page, `(() => {
      const ui = window.__ui;
      const scr = document.querySelector('.screen-results');
      return {
        paper: getComputedStyle(scr.querySelector('.results-top')).backgroundColor,
        lettered: scr.querySelector('.results-head').classList.contains('is-lettered'),
        stamps: [...scr.querySelectorAll('.results-stamp')].map((n) => n.textContent),
        cells: [...scr.querySelectorAll('.gate-cell')].map((n) => n.textContent),
        worst: (scr.querySelector('.gate-cell.is-worst') || { textContent: '' }).textContent,
        line: (scr.querySelector('.results-gates-line') || { textContent: '' }).textContent,
        rows: ui.items().map((it) => it.label + (it.value ? '=' + it.value : '')),
        calls: window.__board.calls.length,
      };
    })()`);
    check('results: the copy is a sheet of paper and its title is lettered', r.paper === 'rgb(247, 240, 220)' && r.lettered, `${r.paper}, lettered ${r.lettered}`);
    check('results: the board rank stamp, from the standings already in hand', r.stamps.includes('#4On the board'), r.stamps.join(' | '));
    check('results: and no board request was made to draw the page', r.calls === callsBefore, `${callsBefore} before, ${r.calls} after`);
    check('results: the best lap gate by gate, the gate that lost the most marked', r.cells.length === 6 && /^2\s*2\.70\+0\.10$/.test(r.worst) && /gate 2/.test(r.line) && /14\.70/.test(r.line), `${r.cells.join(' ')}; worst ${r.worst}; ${r.line}`);
    check('results: Next track is the second row and names the next board track', r.rows[0] === 'Fly again' && r.rows[1] === 'Next track=Kingston Loop', r.rows.join(' | '));
    /* R2M-9: the nearest faster board lap with a ghost is the third row,
     * from the times main.js already holds, and pressing it arms that lap
     * and flies. The pilot's fastest in RESULTS_LOG is 14.80: Ana's 14.40
     * is the nearest faster, Bo's 12.00 is the record, Cy's 14.90 is slower. */
    const rival = await json(page, `(() => {
      const ui = window.__ui;
      ui.boardGhostTimes = [
        { id: 'tm-bo', name: 'Bo', lapMs: 12000, hasGhost: true },
        { id: 'tm-ana', name: 'Ana', lapMs: 14400, hasGhost: true },
        { id: 'tm-cy', name: 'Cy', lapMs: 14900, hasGhost: true },
      ];
      const before = window.__board.calls.length;
      ui.showResults(${RESULTS_LOG}, 14100, 14100, null, { threeMs: null, trackClass: 'full' });
      const rows = ui.items().map((it) => ({ label: it.label, action: it.action }));
      const first = rows.slice(0, 3).map((r) => r.label);
      const fastest = ui.resultsFastest;
      ui.boardGhostTimes = [{ id: 'tm-cy', name: 'Cy', lapMs: 14900, hasGhost: true }];
      ui.showResults(${RESULTS_LOG}, 14100, 14100, null, { threeMs: null, trackClass: 'full' });
      const top = ui.items().map((it) => it.label);
      ui.boardGhostTimes = [
        { id: 'tm-bo', name: 'Bo', lapMs: 12000, hasGhost: true },
        { id: 'tm-ana', name: 'Ana', lapMs: 14400, hasGhost: true },
      ];
      ui.showResults(${RESULTS_LOG}, 14100, 14100, null, { threeMs: null, trackClass: 'full' });
      const real = ui.onChaseRival;
      let chased = null;
      ui.onChaseRival = (t) => { chased = t.id; };
      const i = ui.items().findIndex((it) => /^Chase /.test(it.label));
      ui.setCursor(i);
      ui.select();
      ui.onChaseRival = real;
      ui.boardGhostTimes = null;
      return { first, fastest, top, chased, calls: window.__board.calls.length - before };
    })()`);
    check('results: the third row chases the nearest faster board lap, by name and gap', rival.first[2] === 'Chase Ana, 0.4 faster', `${rival.first.join(' | ')} (fastest ${rival.fastest})`);
    check('results: a pilot ahead of every recorded lap is offered the record', rival.top.includes('Chase the record'), rival.top.join(' | '));
    check('results: pressing it arms that lap by its id, and drawing it asked the board nothing', rival.chased === 'tm-ana' && rival.calls === 0, JSON.stringify({ chased: rival.chased, calls: rival.calls }));
    await page.until("window.__ui.screen === 'flight'", 20000)
      .then(() => check('results: and flies again', true))
      .catch(async () => check('results: and flies again', false, await page.evaluate('window.__ui.screen')));
    await page.evaluate(RESULTS_SEAT);
    /* A new best puts the gold stamp on. */
    await page.evaluate(`(() => { window.__ui.showResults(${RESULTS_LOG}, 14800, 15000, null, { trackClass: 'full' }); return 1; })()`);
    const pb = await json(page, "[...document.querySelectorAll('.screen-results .results-stamp')].map((n) => n.className + ':' + n.textContent)");
    check('results: a new best wears the gold PB stamp', pb.some((x) => /is-gold/.test(x) && /PB!/.test(x)), pb.join(' | '));
    /* Next track, pressed: the board is asked for that track. */
    await page.evaluate(`(() => { const ui = window.__ui; const i = ui.items().findIndex((it) => it.action === 'next-track'); ui.setCursor(i); ui.select(); return 1; })()`);
    await page.until("window.__board.calls.some((c) => /trk-feaB/.test(c.path))", 10000)
      .then(() => check('results: pressing Next track asks the board for that track', true))
      .catch(async () => check('results: pressing Next track asks the board for that track', false, JSON.stringify(await page.evaluate('window.__board.calls.map((c) => c.path)'))));
    /* Run ended, on the same paper. */
    await page.evaluate(`(() => { window.__ui.showFreestyleResults({ total: 0, counter: 0, tricks: 0, unique: 0, bestCombo: 0, crashes: 1, bonus: 0, rows: [], timed: false }); return 1; })()`);
    await page.sleep(300);
    const ended = await json(page, `(() => {
      const scr = document.querySelector('.screen-results');
      return { head: scr.querySelector('.results-head').textContent, paper: getComputedStyle(scr.querySelector('.results-top')).backgroundColor,
        copy: !!scr.querySelector('.results-top .results-empty'), gates: scr.querySelector('.results-gates').hidden, stamps: scr.querySelectorAll('.results-stamp').length };
    })()`);
    check('results: Run ended is on the same paper, with no stale strip or stamp', /^Run ended/.test(ended.head) && ended.paper === 'rgb(247, 240, 220)' && ended.copy && ended.gates && ended.stamps === 0, JSON.stringify(ended));
    errorsCheck(page, 'results');
  } catch (e) {
    check('results: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
  await resultsPhone(844, 390);
  await resultsPhone(740, 360);
}

/* ------------------------------------------------------------------ */
/* front: the gate's masthead                                           */
/* ------------------------------------------------------------------ */

async function scenarioFront() {
  const page = await openPage({
    root, width: 1600, height: 900,
    seed: [BOARD_STUB, settingsSeed({ hasFlown: true, lastFlyMode: 'freestyle', map: 'city', airframeAsked: true },
      "localStorage.setItem('webfpv.goats.best.goats:x:five', '7'); localStorage.setItem('webfpv.goats.best.goats:y:whoop', '3'); localStorage.setItem('webfpv.drift.best.v1', '1234');")],
  });
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 120000);
    await page.until("(() => { const m = window.__map(); return m.id === 'city' && m.ready; })()", 120000);
    /* The cover is there while rooms are on, which the board says; no
     * board here, so the page is told. */
    await page.evaluate("(() => { const ui = window.__ui; ui.roomsOn = true; ui.firstRun = false; ui.renderMenu(); return 1; })()");
    const tools = async () => json(page, `(() => {
      const ui = window.__ui;
      const shown = (n) => n && !n.hidden && n.getClientRects().length > 0 && !n.closest('[hidden]');
      return { page: ui.gatePageNow(), gate: ui.onGate(),
        words: [...document.querySelectorAll('.screen-title .gate-tool')].filter(shown).map((n) => n.textContent) };
    })()`);
    const cover = await tools();
    check('front: the cover wears Fly again, Settings and Controls', cover.gate && cover.words.length === 3
      && /^Fly againThe town/.test(cover.words[0]) && cover.words[1] === 'Settings' && cover.words[2] === 'Controls', JSON.stringify(cover));
    await clickText(page, '.screen-title .gate-tool', 'Settings');
    await page.until("window.__ui.screen === 'pilot'", 5000)
      .then(() => check('front: Settings opens Settings', true))
      .catch(async () => check('front: Settings opens Settings', false, await page.evaluate('window.__ui.screen')));
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'title' && window.__ui.onGate()", 5000).catch(() => {});
    await clickText(page, '.screen-title .gate-tool', 'Controls');
    await page.until("window.__ui.screen === 'stickhelp'", 5000)
      .then(() => check('front: Controls opens Stick help, where calibrating is', true))
      .catch(async () => check('front: Controls opens Stick help, where calibrating is', false, await page.evaluate('window.__ui.screen')));
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'title' && window.__ui.onGate()", 5000).catch(() => {});
    await page.evaluate("(() => { const ui = window.__ui; ui.turnGate('solo'); return 1; })()");
    const solo = await tools();
    check('front: and so does the Fly solo page', solo.page === 'solo' && solo.words.length === 3, JSON.stringify(solo));
    await page.evaluate("(() => { const ui = window.__ui; ui.turnGate('games'); return 1; })()");
    const bests = await json(page, "[...document.querySelectorAll('.gate-card .gate-chip.is-best')].map((n) => n.closest('.gate-card').className.match(/gate-card-(mg-[a-z]+)/)[1] + '=' + n.textContent)");
    check('front: the Mini games panels wear this browser\'s bests, the highest of each game\'s', bests.includes('mg-goats=Best 7 goats') && bests.includes('mg-drift=Best reel 1,234') && bests.length === 2, bests.join(' | '));
    /* A pilot who has never flown has nothing to fly again. */
    const fresh = await json(page, "(() => { const ui = window.__ui; ui.settings.hasFlown = false; ui.renderMenu(); const n = ui.flyAgainBtn; const out = !n.hidden; ui.settings.hasFlown = true; ui.renderMenu(); return out; })()");
    check('front: and a pilot who has never flown gets no Fly again', fresh === false);
    await page.evaluate("(() => { const ui = window.__ui; ui.turnGate('solo'); ui.turnGate('cover'); return 1; })()");
    await page.tap('KeyF');
    await page.until("window.__ui.screen === 'flight' && window.__map().id === 'city'", 30000)
      .then(() => check('front: F on the cover flies the last thing flown, the town', true))
      .catch(async () => check('front: F on the cover flies the last thing flown, the town', false, await page.evaluate("window.__ui.screen + ' ' + window.__map().id")));
    errorsCheck(page, 'front');
  } catch (e) {
    check('front: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------ */
/* eye: the predicted view never puts the eye past a wall (R2M-1)       */
/* ------------------------------------------------------------------ */

async function scenarioEye() {
  const page = await openPage({
    root, width: 1280, height: 720, seed: [BOARD_STUB, settingsSeed({ airframe: '5inch', map: 'city' })],
  });
  try {
    await page.until('window.__shellReady === true && !!window.__ui', 180000);
    await page.until("window.__map().id === 'city' && window.__map().ready", 180000);
    await page.evaluate(PAST_GATE);
    await page.evaluate("(() => { const ui = window.__ui; ui.mode = 'freestyle'; ui.show('title'); ui.act('fly'); return 1; })()");
    await answerQuadPicker(page, 60000).catch(() => {});
    await page.until("window.__ui.screen === 'flight'", 60000);
    /*
     * R2M-11: on the pad before the first throttle the stick cluster sits
     * on its ink plate, and the first throttle takes it back to its flying
     * size. Read off the element's own class, then a held throttle.
     */
    const padBefore = await page.until("document.querySelector('.osd-sticks').classList.contains('is-pad')", 20000)
      .then(() => true).catch(() => false);
    await page.evaluate('(window.__stick(0, 0, 0, 0.6), 1)');
    const padAfter = await page.until("!document.querySelector('.osd-sticks').classList.contains('is-pad')", 20000)
      .then(() => true).catch(() => false);
    await page.evaluate('(window.__stick(), 1)');
    check('eye: on the pad the sticks sit on the ink plate, and the first throttle takes it off', padBefore && padAfter,
      JSON.stringify({ padBefore, padAfter, cls: await page.evaluate("document.querySelector('.osd-sticks').className") }));
    /*
     * The cost, in the town, which has the most colliders of any map: the
     * frame's own call on the segments a fast frame makes, 0.33 m (25 ms
     * at 20 m/s) in every direction from points along the streets near the
     * pad at head height, timed over thousands so the clock's grain does
     * not decide it. One call per drawn frame is what the frame pays.
     */
    const cost = await json(page, `(() => {
      const s = window.__craftState();
      const pts = [];
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 4000; i += 1) {
        const x = s.worldX + (rnd() - 0.5) * 120;
        const z = s.worldZ + (rnd() - 0.5) * 120;
        const y = s.worldY + 0.5 + rnd() * 6;
        const a = rnd() * Math.PI * 2;
        const e = (rnd() - 0.5) * 1.2;
        pts.push([x, y, z, x + 0.33 * Math.cos(a) * Math.cos(e), y + 0.33 * Math.sin(e), z + 0.33 * Math.sin(a) * Math.cos(e)]);
      }
      let hits = 0;
      for (const p of pts) { if (window.__eyeSweep(...p) >= 0) hits += 1; }
      let best = Infinity;
      for (let round = 0; round < 5; round += 1) {
        const t0 = performance.now();
        for (const p of pts) window.__eyeSweep(...p);
        best = Math.min(best, (performance.now() - t0) / pts.length);
      }
      /* And the near plane sized at the moved eye, as the frame sizes it:
       * fpvNear whole, colliders, cars, sails and the floor (R3-7, R3-9:
       * once a predicted frame, where it was the gap query alone timed
       * here and fpvNear twice in the frame). */
      let gapBest = Infinity;
      for (let round = 0; round < 5; round += 1) {
        const t0 = performance.now();
        for (const p of pts) window.__fpvNear(p[3], p[4], p[5]);
        gapBest = Math.min(gapBest, (performance.now() - t0) / pts.length);
      }
      return { ms: best + gapBest, sweepMs: best, gapMs: gapBest, hits, n: pts.length, colliders: window.__colliders().count, radius: window.__eyeSweepRadius() };
    })()`);
    console.log(`  info  eye sweep and near plane in the town: ${(cost.ms * 1000).toFixed(2)} us a frame (sweep ${(cost.sweepMs * 1000).toFixed(2)}, fpvNear ${(cost.gapMs * 1000).toFixed(2)}) (${cost.colliders} colliders, ball ${(cost.radius * 100).toFixed(2)} cm, ${cost.hits} of ${cost.n} sample segments touch a solid)`);
    check('eye: the sweep sees the town (some sample segments touch a solid, most do not)', cost.hits > 0 && cost.hits < cost.n / 2, `${cost.hits} of ${cost.n}`);
    check('eye: the sweep and the second near plane cost no more than 0.02 ms a frame', cost.ms <= 0.02, `${(cost.ms * 1000).toFixed(2)} us`);
    /* A wall's face found by walking out from the pad, then the eye swept at
     * it from 0.2 m off: it stops a near plane short, not inside. */
    const wall = await json(page, `(() => {
      const s = window.__craftState();
      for (let d = 1; d < 80; d += 0.5) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = s.worldX + dx * d;
          const z = s.worldZ + dz * d;
          const y = s.worldY + 1.5;
          const g = window.__nearSolid(x, y, z, 0.25);
          if (g !== null && g > 0.18 && g < 0.22) {
            /* Toward the face: the one of the six ways whose far end is nearest. */
            let best = null;
            for (const [ux, uy, uz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
              const fx = x + ux * 0.33;
              const fy = y + uy * 0.33;
              const fz = z + uz * 0.33;
              const gs = window.__nearSolid(fx, fy, fz, 0.5);
              const v = gs === null ? Infinity : gs;
              if (!best || v < best.v) best = { v, ux, uy, uz };
            }
            const t = window.__eyeSweep(x, y, z, x + best.ux * 0.33, y + best.uy * 0.33, z + best.uz * 0.33);
            const k = 0.33 * (t < 0 ? 1 : t);
            const ex = x + best.ux * k;
            const ey = y + best.uy * k;
            const ez = z + best.uz * k;
            return { t, gapStart: g, gapAfter: window.__nearSolid(ex, ey, ez, 0.25), gapStraight: best.v, near: window.__fpvNear(ex, ey, ez), radius: window.__eyeSweepRadius() };
          }
        }
      }
      return null;
    })()`);
    check('eye: swept at a town wall from 0.2 m, it stops outside the face', wall && wall.t > 0 && wall.t < 1 && wall.gapAfter > 0.005,
      JSON.stringify(wall));
    /* R3-2: where it stops, the plane it is given is no more than the
     * fraction of the clearance, so its corners are in front of the face
     * too, not only its centre. */
    check('eye: and there the near plane is at most 0.45 of the clearance, so its corners stay in front of the face',
      wall && wall.near <= wall.gapAfter * 0.45 + 1e-6, JSON.stringify(wall));
    /* In flight, in open air, the lead is untouched and the near plane is the
     * one sized where the drawn eye is. */
    await page.evaluate("(window.__stick(0, 0, 0, 0.75), 1)");
    let pr = null;
    for (let i = 0; i < 40 && !(pr && pr.applied); i += 1) {
      await page.sleep(100);
      pr = await json(page, 'window.__predict()');
    }
    check('eye: in open air the prediction runs, is not cut, and the near plane is sized at the drawn eye',
      pr.applied === true && pr.clippedT === -1 && pr.near > 0 && pr.near <= 0.2, JSON.stringify(pr));
    const fault = await page.evaluate('window.__frameFault || null');
    check('eye: no frame faulted', !fault, String(fault));
    errorsCheck(page, 'eye');
  } catch (e) {
    check('eye: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

const SCENARIOS = {
  quad: scenarioQuad,
  lazy: scenarioLazy,
  room: scenarioRoom,
  capture: scenarioCapture,
  loadfail: scenarioLoadFail,
  gallery: scenarioGallery,
  bundle: scenarioBundle,
  orbit: scenarioOrbit,
  city: scenarioCity,
  logos: scenarioLogos,
  modules: scenarioModules,
  lettering: scenarioLettering,
  thumbs: scenarioThumbs,
  offline: scenarioOffline,
  library: scenarioLibrary,
  results: scenarioResults,
  front: scenarioFront,
  eye: scenarioEye,
};

const t0 = Date.now();
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (ONLY.length && !ONLY.includes(name)) {
    continue;
  }
  console.log(`${name}`);
  await run();
}
console.log(`\nfeatures-check: ${passed} passed, ${failed} failed, ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(failed ? 1 : 0);
