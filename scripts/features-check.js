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
    const a = typeof answer === 'function' ? answer(body) : answer;
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
    /* Taking it down empties the preview and the focus with it (see the
     * report of 2026-11-06 in PROGRESS.md), so the way out is Close. */
    await clickText(page, '.name-dialog button', 'Close');
    await page.until("document.querySelector('.name-dialog').hidden", 5000);
    check('quad: Close closes the Load dialog', true);
    await clickText(page, '.screen-quad .row', 'Load a tune');
    await page.until("(() => { const d = document.querySelector('.name-dialog'); return !d.hidden && document.activeElement === document.querySelector('.tune-code-field'); })()", 10000);
    await page.tap('Escape');
    await page.until("document.querySelector('.name-dialog').hidden && window.__ui.screen === 'quad'", 5000);
    check('quad: Escape closes the Load dialog', true);
    errorsCheck(page, 'quad');
  } catch (e) {
    check('quad: the scenario ran to the end', false, e.message);
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

async function scenarioRoom() {
  const page = await openPage({
    root,
    width: 1280,
    /* Over 720 px high: below it the results screen puts its plan away. */
    height: 900,
    seed: [BOARD_STUB, settingsSeed({ airframe: 'whoop65', raceLine: true },
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
    errorsCheck(page, 'modules');
  } catch (e) {
    check('modules: the scenario ran to the end', false, e.message);
  } finally {
    await page.close();
  }
}

const SCENARIOS = {
  quad: scenarioQuad,
  room: scenarioRoom,
  capture: scenarioCapture,
  loadfail: scenarioLoadFail,
  gallery: scenarioGallery,
  bundle: scenarioBundle,
  orbit: scenarioOrbit,
  city: scenarioCity,
  logos: scenarioLogos,
  modules: scenarioModules,
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
