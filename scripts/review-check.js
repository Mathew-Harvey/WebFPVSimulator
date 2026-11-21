#!/usr/bin/env node
/*
 * review-check.js: the review, opened from the real pause menu.
 *
 * scripts/review-splits-selftest.js proves the arithmetic. This proves the
 * shell hands it the right two laps: it flies two laps of the one gate
 * track scripts/review-trace-check.js flies, the second slower than the
 * first and chasing it as the session's best, pauses, presses the pause
 * menu's Review row, and reads the panel back. The second lap lost time to
 * the first, so its one section and the lap are red, by the difference of
 * the race's own two lap times.
 *
 * It also asserts the panel owns the keys while it is open: down moves its
 * own selection and not the menu's cursor behind it, and Escape closes it
 * and leaves the pause menu where it was.
 *
 * `REVIEW_SHOTS=<dir> node scripts/review-check.js` also leaves a picture
 * of the open panel there.
 *
 * Minutes of wall clock: it boots the whole shell. Not part of verify.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deltaText, seconds, toneOf } from '../src/review/splits.js';
import { openPage } from '../tests/lib/page.js';
import { decodePng } from '../tests/lib/png.js';
import { PILOT } from './lib/pilot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = 'http://127.0.0.1:3100';
const SHOTS = process.env.REVIEW_SHOTS || '';
/* The window, WIDTHxHEIGHT, for a look at the panel on a phone. */
const [WIDTH, HEIGHT] = (process.env.REVIEW_SIZE || '960x600').split('x').map(Number);

const TRACK = {
  schemaVersion: 1,
  id: 'trk-review002',
  name: 'Review Panel Check',
  trackClass: 'full',
  createdUtc: '2026-01-01T00:00:00Z',
  modifiedUtc: '2026-01-01T00:00:00Z',
  field: { width: 50, depth: 50, gridSize: 1 },
  settings: { tangentScale: 0.74, minCurveRadius: 2.5, samplesPerSegment: 48 },
  branding: { logo: null, logoName: '' },
  elements: [
    {
      id: 'el-1', type: 'gate', name: '0', position: { x: 10, y: 10, z: 0 }, yaw: 0, pitch: 0,
      yawOverridden: false, dims: { levels: 1, sillH: 0, clearW: 1.524, clearH: 1.524, levelPitch: 1.557401 },
    },
    {
      id: 'el-2', type: 'startPads', name: 'Grid', position: { x: 5, y: 5, z: 0 }, yaw: 0, pitch: 0,
      yawOverridden: false, dims: { pads: 2, spacing: 1.5, padSize: 0.6 },
    },
  ],
  sequence: [
    { id: 'sq-1', elementId: 'el-1', apertureIndex: 0, entry: -1, passSide: null, clearance: null, overridden: false },
  ],
};

/* The board, answered inside the page: the track, and no times on it. The
 * ghost is the session's best, so the second lap chases the first. */
const SEED = `(() => {
  const board = ${JSON.stringify(BOARD)};
  const base = '/api/tracks/' + ${JSON.stringify(TRACK.id)};
  const track = ${JSON.stringify({ id: TRACK.id, name: TRACK.name, author: 'review-check', document: TRACK })};
  const answer = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  }));
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, opts = {}) => {
    const url = String(input && input.url ? input.url : input);
    if (!url.startsWith(board)) {
      return realFetch(input, opts);
    }
    const path = url.slice(board.length);
    if (String(opts.method || 'GET').toUpperCase() !== 'GET') {
      return answer({});
    }
    if (path === base + '/document') {
      return answer(track);
    }
    if (path === base) {
      return answer({ id: ${JSON.stringify(TRACK.id)}, times: [] });
    }
    return answer({ error: 'not found' }, 404);
  };
  navigator.sendBeacon = () => true;
  try {
    const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
    s.graphics = 'low'; s.graphicsAuto = false; s.airframeAsked = true; s.ghost = 'best';
    localStorage.setItem('webfpv.settings.v3', JSON.stringify(s));
  } catch (e) { /* the run boots with its defaults */ }
})();`;

/* Through the timing gate from a settle before it, at `speed` m/s over the
 * twelve metres either side of it, then 400 ms more. */
const through = (seconds) => `(async () => {
  const { V } = window.__vm; const g = window.__race().gates[0];
  const a = V(g.x - g.az.x * 6, g.y - g.az.y * 6, g.z - g.az.z * 6);
  const b = V(g.x + g.az.x * 6, g.y + g.az.y * 6, g.z + g.az.z * 6);
  const hd = Math.atan2(g.az.x, g.az.z);
  await window.__settle(a, hd, 1.2);
  await window.__fly(window.__ramp(a, b, ${seconds}, 12 / ${seconds}), { heading: hd, extraMs: 400 });
  return 1;
})()`;
const HOLD = '(() => { const c = window.__craftState(); return window.__holdCraft(c.worldX, Math.max(c.worldY, 1.5), c.worldZ, 0) ? 1 : 0; })()';
const PAUSE = "(() => { const ui = window.__ui; ui.onAction('pause', ui.settings); ui.show('paused'); return 1; })()";
const ROW = "(() => { const r = window.__ui.items().find((i) => i.action === 'review'); return r ? { label: r.label, note: r.note } : null; })()";

let fails = 0;
const check = (what, ok, got = '') => {
  fails += ok ? 0 : 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${got === '' ? '' : `: ${got}`}`);
};

const page = await openPage({
  root: ROOT, width: WIDTH, height: HEIGHT, url: `/index.html?map=custom&share=${TRACK.id}&board=${BOARD}`, seed: [SEED],
});
try {
  await page.until('!!window.__shellReady', 120000);
  await page.evaluate("(() => { const ui = window.__ui; ui.onAction('fly', ui.settings); return 1; })()");
  await page.until('(() => { const m = window.__map && window.__map(); return !!(m && m.ready); })()', 120000);
  await page.until("window.__ui.screen === 'flight'", 60000).catch(() => {});
  const hooked = await page.evaluate("typeof window.__reviewOpen === 'function'");
  check('the shell has a review', hooked);
  if (!hooked) {
    throw new Error('no window.__reviewOpen: this tree has no review');
  }

  await page.evaluate(PAUSE);
  const before = await page.evaluate(ROW);
  check('before any lap the pause menu has no Review row, so it is no longer than it was', before === null, JSON.stringify(before));
  await page.evaluate("(() => { window.__ui.act('review'); return 1; })()");
  const empty = await page.evaluate('window.__review()');
  check('asked for anyway with no lap, it opens and says so', empty.open && /No lap flown/.test(empty.why) && empty.rows.length === 0, JSON.stringify(empty));
  await page.tap('Escape');
  check('Escape closes it', (await page.evaluate('window.__review().open')) === false);
  await page.evaluate("(() => { const ui = window.__ui; ui.onAction('resume', ui.settings); return 1; })()");
  await page.until("window.__ui.screen === 'flight'", 10000).catch(() => {});

  await page.evaluate(`(async () => { ${PILOT}\n return 1; })()`);
  /* Passes until two laps are in: the first starts a lap and each after
   * it finishes one. The scripted pilot misses the gate now and then (one
   * run in a dozen, 2026-11-21, a lap of three passes), so it flies again,
   * up to six passes, rather than failing on the pilot's aim. */
  for (let pass = 0; pass < 6 && (await page.evaluate('window.__race().laps.length')) < 2; pass += 1) {
    await page.evaluate(through(pass < 2 ? 2.4 : 4.0));
  }
  await page.evaluate(HOLD);
  const laps = await page.evaluate('window.__race().laps');
  check('two laps flown', laps.length >= 2, JSON.stringify(laps));
  const first = laps[laps.length - 2];
  const second = laps[laps.length - 1];
  /* The ghost is the first lap as the ghost recorder stored it, to the
   * whole millisecond, and that is the time the review compares with.
   * The scripted pilot's laps differ from run to run, so the second can be
   * slower (red, and the ghost is still Best), faster (green, and the
   * ghost is the previous best now) or, now and then, within a few
   * milliseconds of it (level, in the table's own colour: one run flew
   * 4102.6 and 4114.1 ms). Whichever way it went is asserted. */
  const ghostMs = Math.round(first);
  const want = deltaText(second - ghostMs);
  const tone = toneOf(second - ghostMs);
  const named = second < ghostMs ? 'Previous best' : 'Best';
  console.log(`  (the second lap ${tone} against the first: ${want})`);

  await page.evaluate(PAUSE);
  await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
  const row = await page.evaluate(ROW);
  check(`the row names the last lap against the ${named.toLowerCase()}, with the difference`, Boolean(row) && row.note.includes(`against ${named} `) && row.note.includes(want), row ? row.note : 'no row');
  const cursorBefore = await page.evaluate('window.__ui.cursor');
  await page.evaluate("(() => { window.__ui.act('review'); return 1; })()");
  const s = await page.evaluate('window.__review()');
  check('pressed, the review opens', s.open === true, JSON.stringify(s));
  check('its title is the lap against the ghost it chased', s.title === `Lap ${seconds(second)} against ${named} ${seconds(ghostMs)}`, s.title);
  check('the columns are the section, you, the ghost and the difference', JSON.stringify(s.head) === '["Section","You","Ghost","Difference"]', JSON.stringify(s.head));
  check('one gate: one section, the start to the finish', s.rows.length === 1 && s.rows[0].cells[0] === 'The start to the finish', JSON.stringify(s.rows));
  check(`the section and the lap are ${tone}, by the difference of the two lap times`,
    s.rows[0].tone === tone && s.total.tone === tone && s.total.cells[3] === want && s.rows[0].cells[3] === want,
    `${JSON.stringify(s.rows[0])} ${JSON.stringify(s.total)} want ${want}`);
  check('the lap row has both times, rounded as the lap clock rounds', s.total.cells[1] === `${seconds(second)} s` && s.total.cells[2] === `${seconds(ghostMs)} s`, JSON.stringify(s.total.cells));
  const shown = await page.evaluate("(() => { const r = document.querySelector('#review .review-total .review-delta'); return r ? getComputedStyle(r).color : ''; })()");
  const colour = { lost: 'rgb(255, 107, 94)', gained: 'rgb(125, 255, 180)', level: 'rgb(243, 234, 212)' }[tone];
  check(`${{ lost: 'red', gained: 'green', level: 'the table\'s own colour' }[tone]} on screen`, shown === colour, shown);
  /* The section beside the table, from above and from the side: both
   * lines drawn through it, and the gate seen edge on from the side. Then
   * the pixels, so a line drawn off the picture cannot pass: amber for
   * yours and blue for the ghost's, on both canvases. */
  const d = s.drawn;
  check('the section is drawn from above with both lines', Boolean(d) && d.top.lap > 10 && d.top.ref > 3, JSON.stringify(d));
  check('and from the side, with the gate', Boolean(d) && d.side.lap > 10 && d.side.ref > 3 && d.side.gates >= 1, JSON.stringify(d));
  const inks = await page.evaluate(`(() => {
    const count = (sel) => {
      const cv = document.querySelector(sel);
      const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let amber = 0; let blue = 0;
      for (let i = 0; i < px.length; i += 4) {
        const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
        if (r > 230 && g > 150 && g < 200 && b < 100) amber += 1;
        if (r < 160 && g > 190 && b > 230) blue += 1;
      }
      return { amber, blue, w: cv.width, h: cv.height };
    };
    return { top: count('#review .review-top'), side: count('#review .review-side') };
  })()`);
  /* Your line is drawn over the ghost's, so where the harness flies both
   * laps along one path the blue is mostly under the amber (one run left
   * 49 blue pixels on a picture, another 457). So the ink asserted is
   * yours, and the ghost's line is asserted by where it fell: some blue
   * showing, and every point of it inside the picture. */
  const within = (b) => Boolean(b && b.box) && b.box.x0 >= 0 && b.box.x1 <= b.w && b.box.y0 >= 0 && b.box.y1 <= b.h && b.box.x1 - b.box.x0 + b.box.y1 - b.box.y0 > 10;
  const fell = (v) => ({ box: v.boxes.ref, w: v.boxes.w, h: v.boxes.h });
  check('your line is on both pictures', inks.top.amber > 50 && inks.side.amber > 50, JSON.stringify(inks));
  check('and the ghost\'s, inside both pictures and showing', within(fell(d.top)) && within(fell(d.side)) && inks.top.blue > 0 && inks.side.blue > 0, JSON.stringify({ top: d.top.boxes, side: d.side.boxes, inks }));
  /*
   * THE LINES GO THROUGH THEIR GATES, in the gate's own frame as the race
   * scores a pass (window.__reviewAlign). The views draw each opening from
   * the same frame, so a line that is at the opening's plane and inside its
   * edges at its split is drawn through it. Your trace is the physics state
   * a hundred times a second: within 5 cm of the plane. The ghost is the
   * drawn pose thirty times a second: within 15 cm.
   */
  const align = await page.evaluate('window.__reviewAlign()');
  const inside = (o, half) => Math.abs(o.z) <= 0.01 && Math.abs(o.x) <= half[0] && Math.abs(o.y) <= half[1];
  check('your line is drawn through every gate of the lap, inside its opening', Array.isArray(align) && align.length >= 1 && align.every((a) => inside(a.you, a.half)), JSON.stringify(align));
  /* The ghost's recording stops at its finish, where the race credited
   * it, so at the finish it has no plane to reach and its line ends where
   * it was credited; at every other gate it goes through. This track's one
   * gate is the finish, so here it is the finish's rule that is asserted;
   * the plane itself is proven in Node (review-views-selftest). The ghost
   * is the drawn pose resampled thirty times a second, so where it stood
   * at the credit is known to a frame's travel, not to the millimetre: one
   * run read -0.536 m against the box's -0.5. So 15 cm, as for a ghost. */
  check('and so is the ghost\'s, except at the finish, where its recording ends at the credit',
    Array.isArray(align) && align.every((a) => a.ghost && (inside(a.ghost, a.half)
      || (a.gate === 0 && a.ghost.z === a.ghostCredited && a.ghostCredited >= -0.65 && a.ghostCredited <= 0.15))), JSON.stringify(align));
  /* The race credits the pass on entering its box, half a metre in front
   * of the opening on this full size track, so the split is there and not
   * at the opening: the reason the views look for the plane. */
  check('where the race credited it, in front of the opening by up to its pass depth', Array.isArray(align) && align.every((a) => a.credited <= 0.01 && a.credited >= -0.51), JSON.stringify(align.map((a) => a.credited)));

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    const shot = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    writeFileSync(join(SHOTS, 'review.png'), Buffer.from(shot.data, 'base64'));
    console.log(`  (picture: ${join(SHOTS, 'review.png')})`);
  }

  await page.tap('ArrowDown');
  check('down is the panel\'s, not the menu\'s', (await page.evaluate('window.__ui.cursor')) === cursorBefore && (await page.evaluate('window.__review().open')) === true);
  await page.tap('Escape');
  check('Escape closes it and leaves the pause menu up', (await page.evaluate('window.__review().open')) === false && (await page.evaluate('window.__ui.screen')) === 'paused');

  /*
   * THE REPLAY of the section, from the review: the two holograms in the
   * room on one timeline, over the pause with the menu hidden, and back to
   * the review on the same section. The lap and its ghost are this run's
   * two laps, so both holograms must stand somewhere and move as it plays.
   */
  await page.evaluate("(() => { window.__ui.act('review'); return 1; })()");
  const button = await page.evaluate("(() => { const b = document.querySelector('#review .review-replay-open'); return b ? b.textContent : ''; })()");
  check('the review has a button to replay the section', button === 'Replay this section', button);
  /* Read a moment after it opens: the holograms are placed by its first
   * frame, not by the call that opens it. */
  await page.evaluate("window.__reviewReplay('open', 0)");
  await page.sleep(200);
  const rp = await page.evaluate('window.__reviewReplay()');
  check('it opens the section\'s replay, playing, both holograms in the room', rp.open === true && rp.playing === true && Array.isArray(rp.youAt) && Array.isArray(rp.ghostAt), JSON.stringify(rp));
  const hidden = await page.evaluate("(() => ({ review: window.__review().open, watching: document.documentElement.classList.contains('tg-watching'), bar: !!document.querySelector('#review-replay') }))()");
  check('over the pause: the review put away, the menu hidden, the bar shown', hidden.review === false && hidden.watching === true && hidden.bar === true, JSON.stringify(hidden));
  check('both lines drawn in the room', rp.lines && rp.lines.you === true && rp.lines.ghost === true, JSON.stringify(rp.lines));
  await page.tap('KeyL');
  await page.sleep(200);
  const noLines = (await page.evaluate('window.__reviewReplay()')).lines;
  await page.tap('KeyL');
  await page.sleep(200);
  const linesBack = (await page.evaluate('window.__reviewReplay()')).lines;
  check('L hides them and shows them again', noLines && !noLines.you && !noLines.ghost && linesBack.you && linesBack.ghost, JSON.stringify({ noLines, linesBack }));
  await page.sleep(800);
  const later = await page.evaluate('window.__reviewReplay()');
  const moved = (a, b) => Array.isArray(a) && Array.isArray(b) && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 0.05;
  check('playing, the playhead moves and both holograms with it', later.t > rp.t + 200 && moved(later.youAt, rp.youAt) && moved(later.ghostAt, rp.ghostAt), `${rp.t} to ${later.t}; ${JSON.stringify(later)}; fault ${JSON.stringify(await page.evaluate('window.__frameFault || null'))}`);
  if (SHOTS) {
    const shot = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    writeFileSync(join(SHOTS, 'replay.png'), Buffer.from(shot.data, 'base64'));
    console.log(`  (picture: ${join(SHOTS, 'replay.png')})`);
  }
  const followed = await page.evaluate("window.__reviewReplay('follow')");
  check('the camera follows the ghost when asked', followed.follow === 'ghost');
  const paused = await page.evaluate("window.__reviewReplay('play')");
  const stepped = await page.evaluate("window.__reviewReplay('step', -1)");
  check('play pauses it, and a step moves it a tenth of a second', paused.playing === false && Math.abs(stepped.t - (paused.t - 100)) < 1e-6, `${paused.t} to ${stepped.t}`);
  /* Side by side: V, the two goggles' pictures, each the flight's shape,
   * named, drawn, and black around them; V again, the chase back. */
  await page.tap('KeyV');
  await page.sleep(400);
  const split = await page.evaluate("(() => { const s = window.__reviewReplay(); const tags = [...document.querySelectorAll('.review-replay-pane')].map((t) => ({ text: t.textContent, shown: !t.hidden })); const bar = document.querySelector('#review-replay').getBoundingClientRect(); return { s, tags, barTop: bar.top, vw: innerWidth, vh: innerHeight }; })()");
  const panes = split.s.panes || [];
  const shape = panes.length === 2 && panes.every((p) => Math.abs(p.w / p.h - 16 / 9) < 1e-6);
  check('V shows your goggles and the ghost\'s side by side, each the flight\'s shape, named', split.s.view === 'split' && shape && split.tags.map((t) => `${t.text}${t.shown ? '' : ' hidden'}`).join(',') === 'You,Ghost', JSON.stringify({ view: split.s.view, panes, tags: split.tags }));
  const across = split.vw >= split.vh;
  check('side by side on a wide screen, one over the other on an upright one, apart and inside it', panes.length === 2
    && (across ? Math.abs(panes[1].x - (panes[0].x + panes[0].w)) < 1e-6 : Math.abs(panes[1].y - (panes[0].y + panes[0].h)) < 1e-6)
    && panes.every((p) => p.x >= -1e-6 && p.y >= -1e-6 && p.x + p.w <= split.vw + 1e-6 && p.y + p.h <= split.vh + 1e-6), JSON.stringify({ panes, vw: split.vw, vh: split.vh }));
  {
    const shot = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    const png = decodePng(Buffer.from(shot.data, 'base64'));
    const k = png.width / split.vw;
    const px = (x, y) => {
      const i = (Math.floor(y * k) * png.width + Math.floor(x * k)) * png.channels;
      return [png.data[i], png.data[i + 1], png.data[i + 2]];
    };
    /* A pane's picture: many distinct colours over a grid, not one flat fill. */
    const variety = (p) => {
      const seen = new Set();
      for (let gy = 1; gy < 8; gy += 1) {
        for (let gx = 1; gx < 8; gx += 1) {
          const c = px(p.x + (p.w * gx) / 8, p.y + (p.h * gy) / 8);
          seen.add(c.map((v) => v >> 4).join(','));
        }
      }
      return seen.size;
    };
    const kinds = panes.map(variety);
    const lit = (c) => c[0] + c[1] + c[2] > 30;
    const outside = across
      ? (panes[0].y > 8 ? [px(split.vw / 2, panes[0].y / 2)] : [])
      : (panes[0].y > 8 ? [px(split.vw / 2, panes[0].y / 2)] : []);
    check('both panes drawn with a picture, the screen black around them', kinds.every((n) => n >= 6) && outside.every((c) => !lit(c)), JSON.stringify({ kinds, outside }));
    if (SHOTS) {
      writeFileSync(join(SHOTS, 'replay-split.png'), Buffer.from(shot.data, 'base64'));
      console.log(`  (picture: ${join(SHOTS, 'replay-split.png')})`);
    }
  }
  await page.tap('KeyV');
  await page.sleep(300);
  const chase = await page.evaluate("(() => ({ s: window.__reviewReplay(), tags: [...document.querySelectorAll('.review-replay-pane')].filter((t) => !t.hidden).length }))()");
  check('V again: the chase camera back, the names put away', chase.s.view === 'chase' && chase.tags === 0 && chase.s.camera === 'riding', JSON.stringify({ view: chase.s.view, tags: chase.tags, camera: chase.s.camera }));
  await page.tap('Escape');
  const back = await page.evaluate("(() => ({ replay: window.__reviewReplay().open, review: window.__review(), watching: document.documentElement.classList.contains('tg-watching'), screen: window.__ui.screen }))()");
  check('Escape goes back to the review on the same section, the menu back', back.replay === false && back.review.open === true && back.review.selected === 0 && back.watching === false && back.screen === 'paused', JSON.stringify({ ...back, review: back.review.open }));
  await page.tap('Escape');
  await page.evaluate("(() => { window.__ui.act('review'); return 1; })()");
  await page.evaluate("(() => { const ui = window.__ui; ui.onAction('resume', ui.settings); return 1; })()");
  await page.until("window.__ui.screen === 'flight'", 10000).catch(() => {});
  check('resuming by another route takes it away', (await page.evaluate('window.__review().open')) === false);

  /*
   * A SECTION THIS HARNESS CANNOT FLY, drawn by the real panel. The one gate
   * track has no stack and nothing across the room, and the contributor's
   * 15 gate track showed both break the side view (2026-11-20): a tall
   * gate across the room at the same distance along framed the picture
   * round its height and squashed the lines to a few pixels, and labels of
   * gates standing close together were printed over each other. So the
   * section is built: gate 1 at the bottom of a stack of four bays, a loop
   * back to gate 2 beside it, and a four metre gate eight metres across the
   * room. Each view draws the section's own two gates and none of the
   * others (the contributor, 2026-11-21: "make it more simple"), so the
   * stack and the far gate must not be in either picture. The panel is the
   * shell's own module, opened in this page.
   */
  const synth = await page.evaluate(`(async () => {
    const { ReviewPanel } = await import('/src/review/panel.js');
    const { stationOf } = await import('/src/review/views.js');
    const st = (x, y, z, heading, clearH = 0.6) => stationOf({ x, y, z, heading, clearW: 0.6, clearH });
    const stations = [
      st(3, 0.5, 0, 0),
      st(0, 0.5, 0, 0),
      st(-1.2, 0.5, 0, Math.PI),
      /* Bays stacked straight on gate 1, touching it and each other, as on
       * the contributor's track. */
      st(0, 1.1, 0, 0), st(0, 1.7, 0, 0), st(0, 2.3, 0, 0),
      st(8, 2, -0.7, 0, 4),
    ];
    const splits = [1000, 2000, 3000, 4000, 5000, 6000, 7000];
    const loop = (r, lift) => {
      const t = []; const x = []; const y = []; const z = [];
      for (let i = 0; i <= 100; i += 1) {
        const a = (i / 100) * Math.PI;
        t.push(1000 + i * 10);
        x.push(-0.6 + 0.6 * Math.cos(a) * r);
        /* Up on the way out and down on the way back, so from the side
         * it is a loop and not one line flown out and back on itself. */
        y.push(0.5 + lift * Math.sin(a) ** 2 * (1 + Math.cos(a)) * 0.6);
        /* Out further than across, so the side view, which looks across
         * the way the lines spread furthest, looks across this loop. */
        z.push(-1.8 * Math.sin(a) * r);
      }
      return { t, x, y, z };
    };
    const panel = new ReviewPanel();
    panel.open({
      lap: { splits, durationMs: 7000 }, ref: { splits, durationMs: 7000 },
      title: 'A built section', refName: 'Ghost',
      views: { stations, lapLine: loop(1, 0.3), refLine: loop(1.3, 0.5), lifeScale: 1 },
    });
    panel.select(1);
    const d = panel.state().drawn;
    const cv = document.querySelector('#review .review-side');
    const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let lo = Infinity; let hi = -Infinity; let left = Infinity; let right = -Infinity;
    for (let y = 0; y < cv.height; y += 1) {
      for (let x = 0; x < cv.width; x += 1) {
        const i = (y * cv.width + x) * 4;
        if (px[i] > 230 && px[i + 1] > 150 && px[i + 1] < 200 && px[i + 2] < 100) { lo = Math.min(lo, y); hi = Math.max(hi, y); left = Math.min(left, x); right = Math.max(right, x); }
      }
    }
    const overlaps = (rects) => !rects || rects.some((r, i) => rects.some((s, j) => j > i && r.x < s.x + s.w && s.x < r.x + r.w && r.y < s.y + s.h && s.y < r.y + r.h));
    const out = {
      sideGates: d.side.outlines.length, topGates: d.top.outlines.length, sideLabels: d.side.labels, topLabels: d.top.labels,
      /* How much of the picture your line spans, its wider way: a picture
       * framed on the lines fills its width or its height with them. */
      lineShare: Math.max((hi - lo) / cv.height, (right - left) / cv.width),
      overlapTop: overlaps(d.top.rects), overlapSide: overlaps(d.side.rects),
    };
    window.__builtPanel = panel;
    return out;
  })()`);
  if (SHOTS) {
    const shot = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    writeFileSync(join(SHOTS, 'review-built.png'), Buffer.from(shot.data, 'base64'));
    console.log(`  (picture: ${join(SHOTS, 'review-built.png')})`);
  }
  await page.evaluate('(() => { window.__builtPanel.close(); return 1; })()');
  check('each view draws the section\'s two gates and no other, not the stack or the gate across the room', synth.sideGates === 2 && synth.topGates === 2, JSON.stringify(synth));
  check('so your line spans a good part of the picture, not a few pixels', synth.lineShare > 0.4, `${(synth.lineShare * 100).toFixed(0)}% of the picture its wider way`);
  check('no label is printed over another, from above or from the side', !synth.overlapTop && !synth.overlapSide && synth.topLabels >= 2 && synth.sideLabels >= 2, JSON.stringify(synth));

  const errs = page.errors.filter((e) => !e.includes('net::ERR_CONNECTION_REFUSED'));
  check('no errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
} catch (e) {
  check('the run finished', false, e.message);
} finally {
  await page.close();
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
