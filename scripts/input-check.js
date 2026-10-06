/*
 * input-check.js: the shell's half of the stick and calibration regressions,
 * driven through the real page in headless Chromium.
 *
 * scripts/input-selftest.js proves the InputManager does the right thing
 * with a synthetic radio in plain Node. This file is the other half of the
 * same tickets, the part that lives in the DOM and in main.js's frame loop
 * and cannot be seen from Node at all: the button that appears on the step
 * a radio might not be able to answer, the row that has to repaint when a
 * verdict arrives mid session, the help note that used to move the menu
 * under a stationary mouse, the captions that follow the stick mode, and
 * the setting that threw a whoop pilot onto a different track when they
 * touched the camera angle.
 *
 * Every check names the ticket it is for. Every one was reproduced against
 * the shipped page before the fix and probed again after it, from a
 * scratch directory that no longer exists. This is where those probes
 * live now.
 *
 * The rig is one synthetic six axis radio, yaw on axis 4 and a slider on
 * axis 3, installed by overriding navigator.getGamepads before the shell
 * boots. It is deliberately the radio the AETR guess gets wrong, because
 * a radio the guess gets right exercises none of this. A second page with
 * touch emulation on covers the thumb sticks, and a third with no radio at
 * all flies a real race on the keys. A fourth is Safari 27 on a Mac with a
 * radio the browser will not list, which is bug-616cc604, and a fifth is a
 * TX15 flown and paused, which is bug-2d93629e. The same TX15 then flies a
 * whoop race for the stick overlay the owner asked for on 2026-10-06. A
 * sixth is a touchscreen laptop with no radio, flown on its keys and on its
 * glass, which is bug-d1d3f4fb. Two more walk the builder's Fly this map
 * into the air, and a linked map that fails to load, and the last walk the
 * gate's Builder card into the builder and its chooser.
 *
 * Not part of `npm run verify`: this says nothing about the flight model.
 * Same shape as lint:shell. Run it on a change to src/input, to the
 * calibrate screen, to the Settings room, to the title's trouble rows or to
 * the flight overlay's stick boxes and the gate mark that parks clear of
 * them.
 *
 * Usage:
 *   npm run lint:input
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

import { keyInfo, openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { hoverStickPercent } from '../configs/rates.js';
import { presetsForClass } from '../src/trackbuilder/presets.js';
import { ROOM_HEIGHT } from '../src/trackbuilder/racegow.js';
import { MICRO_SCALE } from '../src/game/track.js';
import { THRASH_THROTTLE } from '../src/game/collide.js';
import { starterMap } from '../src/maps/built/starter.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
const fails = [];

function check(what, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${what}`);
    return;
  }
  failed += 1;
  fails.push(`${what}${detail ? `, ${detail}` : ''}`);
  console.log(`  FAIL  ${what}${detail ? `, ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n${title}`);
}

/* Pinned graphics, as lint:shell pins them, so the page boots the same way
 * on every machine and the run is about the shell rather than the GPU. */
const SETTINGS_SEED = `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.graphics = 'low';
  s.graphicsAuto = false;
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* Storage refused. The run still boots. */ }`;

/*
 * The radio. Six axes, four buttons, parked throttle on axis 2, yaw on
 * axis 4, and axis 3, which the guess calls yaw, is a slider that never
 * moves. Installed before the first line of the app so the shell meets it
 * the way it meets a real one: through navigator.getGamepads on a poll.
 */
const PAD_SEED = `window.__pad = {
  index: 0,
  id: 'Selftest six axis radio (Vendor: 1209 Product: 4f54)',
  connected: true,
  mapping: '',
  timestamp: 1,
  axes: [0, 0, -1, 0, 0, -1],
  buttons: [0, 1, 2, 3].map(() => ({ pressed: false, touched: false, value: 0 })),
};
navigator.getGamepads = () => [window.__pad];`;

/*
 * The Safari pilot of bug-616cc604: a Pocket plugged in on a MacBook Air, and
 * a browser that lists nothing. Safari's own user agent goes on the page
 * before the app runs, because the shell reads it once, and getGamepads
 * answers with four empty slots, which is what a browser with nothing to show
 * hands over. No radio is there to find, which is the point.
 */
const SAFARI_SEED = `Object.defineProperty(Navigator.prototype, 'userAgent', {
  configurable: true,
  get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15',
});
navigator.getGamepads = () => [null, null, null, null];`;

/*
 * The TX15 of bug-2d93629e: eight axes in AETR order then four aux switches,
 * twenty four buttons all released, a calibrated map (an empty stored map is
 * the default AETR one, marked stored, which is what the ticket's "map:
 * calibrated" is), and fullscreen off because a page with no gesture is
 * refused it anyway.
 */
const TX15_SEED = `window.__pad = {
  index: 0,
  id: 'RadioMaster TX15 Joystick (Vendor: 1209 Product: 4f54)',
  connected: true,
  mapping: '',
  timestamp: 1,
  axes: [0, 0, -0.3, 0, -1, 0, -1, -1],
  buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })),
};
navigator.getGamepads = () => [window.__pad];
try {
  localStorage.setItem('webfpv_stick_map_v1', '{}');
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const st = JSON.parse(localStorage.getItem(k) || '{}');
  st.fullscreenFly = false;
  localStorage.setItem(k, JSON.stringify(st));
} catch (e) { /* Storage refused. The page then meets an uncalibrated radio and says so. */ }`;

/*
 * The Chromebook pilot of bug-d1d3f4fb: a touchscreen laptop, 1366 by 768, no
 * radio, a five inch on the built map. The page is booted with touch emulation
 * on, so navigator reports touch points and the thumb plates mount, which is
 * the whole of what made the keyboard dead there.
 */
const TOUCH_LAPTOP_SEED = `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.graphics = 'low';
  s.graphicsAuto = false;
  s.airframe = '5inch';
  s.map = 'built';
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused. The flight then fails to start, and says so. */ }`;

/*
 * The keyboard pilot: no radio, no touch, on the whoop, with one shipped
 * RaceGOW track saved in this browser the way the builder saves one. The
 * whoop because the shipped tracks are all whoop tracks and the board is
 * not here to hand over a five inch one, and a race because racing on keys
 * is the one place the keyboard's own Angle choice is read.
 */
const KEY_TRACK = {
  ...presetsForClass('micro')[0],
  id: 'trk-6b0a2d00',
  name: 'Keyboard check track',
  modifiedUtc: '2026-09-24T00:00:00.000Z',
};
const KEYBOARD_SEED = `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.airframe = 'whoop65';
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.trackbuilder.library.v1', ${JSON.stringify(JSON.stringify({ [KEY_TRACK.id]: KEY_TRACK }))});
} catch (e) { /* Storage refused. The race below then fails to seat, and says so. */ }`;

/*
 * The stick overlay's radio pilot: the TX15 above with its throttle parked
 * at idle, on the keyboard pilot's whoop race, because the gate mark that
 * has to park clear of the overlay only exists where there is a next gate.
 * Every key it writes is merged, so a reload keeps what the page chose.
 */
const RADIO_RACE_SEED = `window.__pad = {
  index: 0,
  id: 'RadioMaster TX15 Joystick (Vendor: 1209 Product: 4f54)',
  connected: true,
  mapping: '',
  timestamp: 1,
  axes: [0, 0, -1, 0, -1, 0, -1, -1],
  buttons: Array.from({ length: 24 }, () => ({ pressed: false, touched: false, value: 0 })),
};
navigator.getGamepads = () => [window.__pad];
try {
  localStorage.setItem('webfpv_stick_map_v1', '{}');
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const st = JSON.parse(localStorage.getItem(k) || '{}');
  st.fullscreenFly = false;
  st.airframe = 'whoop65';
  localStorage.setItem(k, JSON.stringify(st));
  localStorage.setItem('webfpv.trackbuilder.library.v1', ${JSON.stringify(JSON.stringify({ [KEY_TRACK.id]: KEY_TRACK }))});
} catch (e) { /* Storage refused. The race then fails to seat, and says so. */ }`;

/*
 * The flight overlay's two stick boxes, as a person would find them: not
 * switched off by class, and actually laid out, which a box inside a hidden
 * block is not.
 */
const GIMBALS = `(() => {
  const ui = window.__ui;
  const up = (g) => !g.box.classList.contains('is-off') && g.box.getClientRects().length > 0;
  return { left: up(ui.osdStickLeft), right: up(ui.osdStickRight) };
})()`;
const GIMBALS_UP = `(() => { const g = ${GIMBALS}; return g.left && g.right; })()`;
const GIMBALS_DOWN = `(() => { const g = ${GIMBALS}; return !g.left && !g.right; })()`;

/*
 * Where the gate mark is parked and where the stick plates start, in page
 * pixels. The anchor is the chevron's centre, which its rotation does not
 * move. plateTop is null while the plates are not laid out.
 */
const MARK = `(() => {
  const ui = window.__ui;
  const a = ui.lockArrow.getBoundingClientRect();
  const p = ui.osdStickRight.box.querySelector('.osd-gimbal-plate').getBoundingClientRect();
  return { edge: ui.lock.classList.contains('is-edge') && !ui.lock.classList.contains('is-off'),
    y: Math.round(a.top + a.height / 2), x: Math.round(a.left + a.width / 2),
    plateTop: p.height > 0 ? Math.round(p.top) : null, h: window.innerHeight };
})()`;

/* The camera parked 200 m over the start line looking level, so the next
 * gate is far under the frame and the mark is pinned to its bottom edge,
 * which is where the stick overlay is. */
const CAM_OVER_START = 'const sp = window.__map().spawn; window.__setCam(sp.x, sp.y + 200, sp.z, sp.x + 100, sp.y + 200, sp.z); return 1;';
const MARK_PINNED = `(() => { const m = ${MARK}; return m.edge && m.y > m.h - 160; })()`;

/*
 * The freestyle pilot of bug-850375dc: a five inch, a five inch track
 * seated, answering the gate with Freestyle. Once per tab, because the
 * page under test reloads itself and the seed must not put the track back
 * under the town the page has just saved.
 */
const FREE_TRACK = {
  ...presetsForClass('full')[0],
  id: 'trk-850375dc',
  name: 'Freestyle check track',
  modifiedUtc: '2026-09-24T00:00:00.000Z',
};
const FREESTYLE_SEED = `try {
  if (!sessionStorage.getItem('check.freestyle.seeded')) {
    sessionStorage.setItem('check.freestyle.seeded', '1');
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.airframe = '5inch';
    s.map = 'custom';
    s.freestyleMap = 'city';
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.trackbuilder.library.v1', ${JSON.stringify(JSON.stringify({ [FREE_TRACK.id]: FREE_TRACK }))});
  }
} catch (e) { /* Storage refused. The gate still asks, and the check says what it found. */ }`;

/* Every walk starts past the gate, for the same reason lint:shell's do:
 * the menu these checks are about is behind it. */
const PAST_GATE = "ui.firstRun = false; ui.craftGate = false; if (!ui.mode) { ui.mode = 'race'; }";

/*
 * Drive the wizard from inside the page, on the page's own clock. The poll
 * runs on a 2 ms timer there, so every hold below is real time and the
 * timings are the wizard's constants with room to spare. `lay` names the
 * axis of each channel and where the throttle is put on the release step,
 * which is the one input that tells a parked throttle from a sprung one.
 * Returns a log, and 'done' as its last line when every step arrived.
 */
const DRIVE = (lay) => `(async () => {
  const lay = ${JSON.stringify(lay)};
  const pad = window.__pad;
  const im = window.__input;
  const log = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const set = (i, v) => { pad.axes[i] = v; pad.timestamp += 1; };
  const view = () => im.calibrationView();
  const waitStep = async (name, limit = 8000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < limit) {
      const v = view();
      if (v && v.step === name && v.phase === 'hold') { return true; }
      await sleep(20);
    }
    return false;
  };
  const waitPhase = async (phase, limit = 8000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < limit) {
      const v = view();
      if (v && v.phase === phase) { return true; }
      await sleep(20);
    }
    return false;
  };
  if (!await waitStep('sweep')) { log.push('centre never settled'); return log; }
  const rest = pad.axes.slice();
  log.push('rest ' + JSON.stringify(rest));
  for (const i of [lay.roll, lay.pitch, lay.yaw, lay.thr]) {
    set(i, 1); await sleep(60);
    set(i, -1); await sleep(60);
    set(i, rest[i]); await sleep(60);
  }
  if (!await waitStep('throttle')) { log.push('sweep never completed: ' + JSON.stringify(view())); return log; }
  const ident = [
    ['throttle', lay.thr, 1, lay.thrReturn],
    ['roll', lay.roll, 1, rest[lay.roll]],
    ['pitch', lay.pitch, -1, rest[lay.pitch]],
    ['yaw', lay.yaw, 1, rest[lay.yaw]],
  ];
  for (const [name, axis, push, back] of ident) {
    if (view().step !== name) { log.push('expected ' + name + ', on ' + view().step); return log; }
    set(axis, push);
    if (!await waitPhase('release')) { log.push(name + ' never identified'); return log; }
    set(axis, back);
    const steps = view().steps;
    const next = steps[steps.indexOf(name) + 1];
    if (!await waitStep(next)) { log.push(name + ' never released to ' + next); return log; }
    /* The hand comes off. A sprung throttle held down as told springs
     * back to the middle here, one step too late for the detector. Unless
     * the layout says the throttle stays held, which is the pilot who
     * never lets go until the check step. */
    set(axis, name === 'throttle' && lay.holdAfter !== undefined ? lay.holdAfter : rest[axis]);
    log.push(name + ' on axis ' + axis);
  }
  log.push('done');
  return log;
})()`;

async function bootPage(extra = {}) {
  const page = await openPage({
    root,
    width: 1600,
    height: 900,
    seed: [SETTINGS_SEED, PAD_SEED],
    ...extra,
  });
  await page.until('window.__shellReady === true', 90000);
  await page.until('!!window.__ui && !!window.__input', 10000);
  return page;
}

async function mousePage(page) {
  const ev = (expr) => page.evaluate(`(() => { const ui = window.__ui; const input = window.__input; ${expr} })()`);

  /* --------------------------------------------------------------------
   * 1. Signposts. "there is no menu item to calibrate my radio when i
   *    click fly now or fly i get no obvious option to calibrate the
   *    radio", and the rename that followed it. Asserted as agreement
   *    between the rooms rather than as strings: the room that HOLDS the
   *    calibrate row is the room the title's row and the how-to's prose
   *    send the pilot to, whatever it is called this month.
   * ------------------------------------------------------------------ */
  section('signposts: every sign that names the calibrate room names the room that holds it');
  const signs = await ev(`
    ${PAST_GATE}
    const out = {};
    const holders = [];
    for (const name of Object.keys(ui.screens)) {
      if (name === 'title' || name === 'flight' || name === 'calibrate' || name === 'padpick') { continue; }
      try {
        ui.show(name);
        if (ui.items().some((it) => it && it.action === 'calibrate')) { holders.push(name); }
      } catch (e) { /* a screen with no item list */ }
    }
    out.holders = holders;
    const room = holders[0];
    ui.show(room);
    out.roomName = ui.crumb.querySelector('.crumb-here') ? ui.crumb.querySelector('.crumb-here').textContent : '';
    out.roomHeading = ui.screens[room].querySelector('h2') ? ui.screens[room].querySelector('h2').textContent : '';
    ui.show('title');
    const row = ui.items().find((it) => it && it.action === room);
    out.titleRow = row ? { label: row.label, note: row.note || '' } : null;
    ui.show('rates');
    out.ratesTrail = Array.from(ui.crumb.querySelectorAll('.crumb-up, .crumb-here')).map((n) => n.textContent);
    ui.show('howto');
    ui.setHowtoSource('radio');
    out.howtoRadio = Array.from(ui.howtoKeys.querySelectorAll('dd')).map((n) => n.textContent).join(' ');
    ui.setHowtoSource('keyboard');
    ui.show('title');
    return JSON.stringify(out);
  `).then(JSON.parse);
  check('exactly one room holds the Calibrate sticks row', signs.holders.length === 1, JSON.stringify(signs.holders));
  check('that room is named in its crumb', Boolean(signs.roomName), JSON.stringify(signs));
  check('the title has a row that opens it, named the same', Boolean(signs.titleRow) && signs.titleRow.label === signs.roomName,
    JSON.stringify(signs.titleRow));
  check('and that row\'s note says calibration is inside', /Calibrate sticks/.test(signs.titleRow ? signs.titleRow.note : ''),
    signs.titleRow ? signs.titleRow.note : 'no row');
  check('the Rates room\'s trail starts in it', signs.ratesTrail[0] === signs.roomName, JSON.stringify(signs.ratesTrail));
  check('the how-to for a radio sends the pilot there by the same name',
    signs.howtoRadio.includes(`Calibrate sticks in ${signs.roomName}`), signs.howtoRadio.slice(0, 200));
  check('the room is called Settings, which is what the pilot asked for', signs.roomName === 'Settings', signs.roomName);

  /* --------------------------------------------------------------------
   * 2. Hover. bug on the Rates screen: "the menu jumps when I move the
   *    mouse over it". The help note is items[cursor].note and its height
   *    changed with every row the pointer crossed, and the note was in the
   *    same grid row as the list, so the list moved under the pointer,
   *    which put a different row under it, which fired again. Measured at
   *    86 px before the first fix and 51 px after it; it has to be 0. The
   *    PIDs screen wears the same layout and gets the same measurement.
   *    Real mouse events through the DevTools protocol, not setCursor,
   *    because the bug was in what a pointer does.
   *
   *    AT THE REPORTER'S WINDOW, 1358 by 602. In a tall window the list is
   *    taller than any note it can hold and the defect is invisible: with
   *    the fix removed, this same walk at 1600 by 900 measured 0. The
   *    number in the ticket was taken at 602 px, where the list is capped
   *    at 46vh and a long note stood 432 px tall beside it, and that is
   *    the only geometry in which this check can fail.
   * ------------------------------------------------------------------ */
  section('hover: rows stay put under the mouse while the help note changes, at 1358 by 602');
  const metrics = (width, height) => page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  await metrics(1358, 602);
  await ev(`${PAST_GATE} ui.show('rates');`);
  await page.sleep(400);
  const small = await ev("return JSON.stringify({ w: window.innerWidth, h: window.innerHeight });").then(JSON.parse);
  check('the window is the reporter\'s', small.w === 1358 && small.h === 602, JSON.stringify(small));
  for (const name of ['rates', 'pids']) {
    const rows = await ev(`
      ${PAST_GATE}
      ui.show('${name}');
      ui.setCursor(ui.firstStop(ui.items()));
      const menu = ui.screens['${name}'].querySelector('.menu');
      const box = menu.getBoundingClientRect();
      const items = ui.items();
      const out = [];
      Array.from(menu.querySelectorAll('.row')).forEach((r, k) => {
        const b = r.getBoundingClientRect();
        out.push({ k, top: b.top, x: b.left + Math.min(80, b.width / 2), y: b.top + b.height / 2,
          inside: b.top >= box.top && b.bottom <= box.bottom, label: r.querySelector('.row-label') ? r.querySelector('.row-label').textContent : '' });
      });
      return JSON.stringify(out);
    `).then(JSON.parse);
    const tops = rows.map((r) => r.top);
    let worst = 0;
    let landed = 0;
    let notes = 0;
    let lastNote = null;
    for (const r of rows) {
      if (!r.inside) {
        continue;
      }
      /* Two moves, because the shell ignores a pointer that has not moved
       * since it last saw it, which is the guard against a rebuilt row
       * appearing under a stationary mouse. */
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(r.x), y: Math.round(r.y) - 1 }, page.sessionId);
      await page.sleep(20);
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(r.x), y: Math.round(r.y) }, page.sessionId);
      const t0 = Date.now();
      let cur = null;
      while (Date.now() - t0 < 1500) {
        cur = await ev(`
          const items = ui.items();
          const it = items[ui.cursor];
          const rows = Array.from(ui.screens['${name}'].querySelectorAll('.menu .row'));
          const lit = rows.findIndex((n) => n.getAttribute('aria-selected') === 'true');
          return JSON.stringify({ lit, note: ui.screens['${name}'].querySelector('.menu-help').textContent });
        `).then(JSON.parse);
        if (cur.lit === r.k) {
          break;
        }
        await page.sleep(50);
      }
      if (!cur || cur.lit !== r.k) {
        continue;
      }
      landed += 1;
      if (cur.note !== lastNote) {
        notes += 1;
        lastNote = cur.note;
      }
      const now = await ev(`
        return JSON.stringify(Array.from(ui.screens['${name}'].querySelectorAll('.menu .row')).map((n) => n.getBoundingClientRect().top));
      `).then(JSON.parse);
      for (let k = 0; k < Math.min(now.length, tops.length); k += 1) {
        worst = Math.max(worst, Math.abs(Math.round(now[k] - tops[k])));
      }
    }
    /* Vacuity guards, not the assertion: the shift check below passes
     * trivially if the pointer never lands or the note never changes. At
     * 602 px the PIDs list shows three whole rows, so three is what there
     * is to land on. With the fix removed the pointer lands on two of
     * seventeen rates rows, because the rows leave from under it, which
     * is the defect read from the other end. */
    const inside = rows.filter((r) => r.inside).length;
    check(`${name}: the pointer landed on ${landed} of ${inside} visible rows, enough to mean something`, landed >= Math.min(3, inside),
      `${landed} of ${inside}`);
    check(`${name}: the help note changed as the pointer moved, ${notes} distinct notes`, notes >= 2, `${notes} distinct notes`);
    check(`${name}: worst row shift under the pointer is 0 px`, worst === 0, `${worst} px`);
  }
  /* Park the mouse off the menus so it cannot steer the rest of the run,
   * and give the window back. */
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }, page.sessionId);
  await metrics(1600, 900);
  await page.sleep(400);

  /* --------------------------------------------------------------------
   * 3. The trouble row that arrives mid session. bug-3d72d9a4, bug-94f7e52b,
   *    bug-13519874: no yaw on a guessed map whose throttle parked, and
   *    the review finding that the row it earns was decided in input.js
   *    and never painted until the pilot left the title and came back.
   *    Nothing here calls show() or renderMenu(): the frame loop has to
   *    do it. And the latch has to come back down when the guessed yaw
   *    axis finally moves.
   * ------------------------------------------------------------------ */
  section('title: the no-yaw row appears on its own, and goes away on its own');
  await ev(`${PAST_GATE} ui.show('title');`);
  await page.until('window.__input.padSummary().mapUsable === true', 5000).catch(() => {});
  const before = await ev(`
    const s = input.padSummary();
    return JSON.stringify({ usable: s.mapUsable, noYaw: s.guessNoYaw, calibrated: s.calibrated,
      warn: Array.from(ui.screens.title.querySelectorAll('.row-warn .row-label')).map((n) => n.textContent) });
  `).then(JSON.parse);
  check('the throttle parked, so the guess counts as a radio and nothing warns', before.usable && !before.calibrated && before.warn.length === 0,
    JSON.stringify(before));
  const NO_YAW = 'This browser cannot see your yaw stick';
  const rowShown = `Array.from(window.__ui.screens.title.querySelectorAll('.row-warn .row-label')).some((n) => n.textContent === ${JSON.stringify(NO_YAW)})`;
  await page.evaluate(`(async () => {
    const pad = window.__pad;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const v of [0.2, 0.45, 0.7, 0.95, 0.45, -0.3, -0.75, 0]) {
      pad.axes[4] = v; pad.timestamp += 1; await sleep(40);
    }
  })()`);
  let arrived = true;
  await page.until(rowShown, 5000).catch(() => { arrived = false; });
  check('sweeping the real yaw stick, on an axis the guess does not name, paints the row without leaving the screen', arrived);
  check('and input.js agrees', await ev('return input.padSummary().guessNoYaw === true;'));
  await page.evaluate(`(async () => {
    const pad = window.__pad;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    pad.axes[3] = 0.5; pad.timestamp += 1; await sleep(60);
    pad.axes[3] = 0; pad.timestamp += 1; await sleep(60);
  })()`);
  let cleared = true;
  await page.until(`!(${rowShown})`, 5000).catch(() => { cleared = false; });
  check('moving the axis the guess calls yaw takes the row down again, without leaving the screen', cleared);
  check('and it stays down', await ev('return input.padSummary().guessNoYaw === false && input.padSummary().mapUsable === true;'));

  /* --------------------------------------------------------------------
   * 3b. The throttle where the guess expects yaw. bug-c9423f3e, a
   *     Radiomaster Pocket in Firefox: "the throttle is mapped on the yaw
   *     axes and the throttle movement is not detected". Axis 3, which the
   *     guess calls yaw, is given what a throttle does: parked at the
   *     bottom and left there. The title says so by itself, after four
   *     seconds and not before, because before that it could be a thumb.
   * ------------------------------------------------------------------ */
  section('title: a throttle resting on the guessed yaw axis earns its own row');
  const AS_YAW = 'This browser has your throttle as yaw';
  const asYawShown = `Array.from(window.__ui.screens.title.querySelectorAll('.row-warn .row-label')).some((n) => n.textContent === ${JSON.stringify(AS_YAW)})`;
  await page.evaluate('window.__pad.axes[3] = -1; window.__pad.timestamp += 1; 0');
  const parkedAt = Date.now();
  let asYaw = true;
  await page.until(asYawShown, 20000).catch(() => { asYaw = false; });
  const tookMs = Date.now() - parkedAt;
  check('parked and left, the row arrives by itself, and not before four seconds', asYaw && tookMs >= 4000, `${tookMs} ms`);
  const asYawReport = await ev(`const r = input.mapReport(); const s = input.padSummary();
    return JSON.stringify({ parked: s.guessYawParked, noYaw: s.guessNoYaw, map: r && r.map, yawAxis: r && r.axes.yaw, live3: r && r.live[3] });`)
    .then(JSON.parse);
  check('and input.js agrees, and a report would show the axis and what it reads',
    asYawReport.parked === true && asYawReport.noYaw === false && asYawReport.map === 'guess'
    && asYawReport.yawAxis === 3 && asYawReport.live3 === -1, JSON.stringify(asYawReport));
  await page.evaluate('window.__pad.axes[3] = 0; window.__pad.timestamp += 1; 0');

  /* --------------------------------------------------------------------
   * 4. The wizard, end to end, on the radio with no way to answer step
   *    seven. bug-89b2c85c: "at step 7 of calibration i can't continue, i
   *    don't have any button on my radio". The step is only asked of a
   *    radio reporting NO buttons, which the reporter's did, so the pad
   *    loses its buttons for this one run: every switch on it arrives as
   *    an axis, and it has two to spare. The way past is the Skip button
   *    and the Enter key, both of which have to be there. Also
   *    bug-27386f07, the axis strip: six cells, one per axis, from step
   *    one.
   * ------------------------------------------------------------------ */
  section('calibrate: the axis strip, the Skip on the menu switch step, and Enter through to Save');
  await page.evaluate('window.__pad.buttons = []; window.__pad.timestamp += 1;');
  await ev(`${PAST_GATE} ui.show('pilot'); ui.act('calibrate');`);
  await page.until("window.__ui.screen === 'calibrate' && !!window.__input.calibration", 5000);
  /* Keys below go through the window, and a focused text field owns them
   * instead. Nothing here should have focused one; say so if it did,
   * because every key check after this would fail for the wrong reason. */
  check('no text field has focus, so the keys reach the shell',
    await ev("const a = document.activeElement; return !a || !['INPUT', 'TEXTAREA'].includes(a.tagName);"));
  await page.until("window.__ui.calAxes && window.__ui.calAxes.querySelectorAll('.cal-axis').length > 0", 5000).catch(() => {});
  const strip = await ev(`
    return JSON.stringify({ cells: ui.calAxes.querySelectorAll('.cal-axis').length, kicker: ui.calKicker.textContent, hiddenStrip: ui.calAxes.hidden });
  `).then(JSON.parse);
  check('the strip shows one cell per axis, six, on the first step', strip.cells === 6 && !strip.hiddenStrip, JSON.stringify(strip));
  check('and the wizard says it has eight steps', /of 8,/.test(strip.kicker), strip.kicker);
  const drove = await page.evaluate(DRIVE({
    roll: 0, pitch: 1, yaw: 4, thr: 2, thrReturn: -1,
  }));
  check('every flight channel identified and released', drove[drove.length - 1] === 'done', drove.join(' | '));
  await page.until("(() => { const v = window.__input.calibrationView(); return v && v.step === 'select'; })()", 3000).catch(() => {});
  await page.until('!window.__ui.calSkipBtn.hidden', 3000).catch(() => {});
  const atSelect = await ev(`
    const v = input.calibrationView();
    return JSON.stringify({ step: v && v.step, skipHidden: ui.calSkipBtn.hidden, saveDisabled: ui.calSaveBtn.disabled, kicker: ui.calKicker.textContent,
      mapped: v ? v.axes.filter((a) => a.mapped).map((a) => a.i) : [] });
  `).then(JSON.parse);
  check('it is on the menu switch step', atSelect.step === 'select', JSON.stringify(atSelect));
  check('the Skip button is showing and Save is not yet offered', atSelect.skipHidden === false && atSelect.saveDisabled === true, JSON.stringify(atSelect));
  check('the strip marks the four claimed axes, yaw among them on axis 4', atSelect.mapped.join() === '0,1,2,4', JSON.stringify(atSelect.mapped));
  await page.tap('Enter');
  let onConfirm = true;
  await page.until("(() => { const v = window.__input.calibrationView(); return v && v.step === 'confirm'; })()", 3000).catch(() => { onConfirm = false; });
  check('Enter on that step skips it', onConfirm);
  await page.until('!window.__ui.calSaveBtn.disabled', 3000).catch(() => {});
  const atConfirm = await ev(`
    return JSON.stringify({ saveDisabled: ui.calSaveBtn.disabled, skipHidden: ui.calSkipBtn.hidden, zeroHidden: ui.calZeroBtn.hidden, kicker: ui.calKicker.textContent });
  `).then(JSON.parse);
  check('the check step offers Save, and neither Skip nor the throttle zero button',
    atConfirm.saveDisabled === false && atConfirm.skipHidden && atConfirm.zeroHidden, JSON.stringify(atConfirm));
  await page.tap('Enter');
  let saved = true;
  await page.until("window.__ui.screen === 'pilot' && window.__input.calibration === null", 3000).catch(() => { saved = false; });
  check('Enter on the check step saves and returns to the room it came from', saved);
  const map = await ev('return JSON.stringify({ yaw: input.map.yaw.axis, stored: input.map.stored, select: input.map.select, thr: input.map.throttle });').then(JSON.parse);
  check('the saved map has yaw on axis 4, no menu switch, and a parked throttle',
    map.yaw === 4 && map.stored === true && map.select === null && map.thr.low === -1 && !map.thr.sprung, JSON.stringify(map));
  /* Buttons back, so the rest of the run is about a radio with a way to
   * press Enter. The no-buttons row on the title is a different story. */
  await page.evaluate('window.__pad.buttons = [0, 1, 2, 3].map(() => ({ pressed: false, touched: false, value: 0 })); window.__pad.timestamp += 1;');
  await ev("ui.show('title');");
  /* The frame loop carries the pad's story to the title one frame later,
   * and the row comes down on that frame, not on show(). Wait for it. */
  await page.until("window.__ui.screens.title.querySelectorAll('.row-warn').length === 0", 4000).catch(() => {});
  const rowAfter = await ev('return JSON.stringify(Array.from(ui.screens.title.querySelectorAll(\'.row-warn .row-label\')).map((n) => n.textContent));').then(JSON.parse);
  check('a calibrated radio has no trouble row', rowAfter.length === 0, JSON.stringify(rowAfter));

  /* --------------------------------------------------------------------
   * 5. The throttle that springs and the pilot who did as they were told.
   *    bug-851a43b7 through the real screen: the check step reads 50
   *    percent with nobody touching the stick, says so, shows the button,
   *    and T moves zero. The detector in input.js cannot see this case,
   *    so the screen is the whole of the fix. Same radio, throttle rest
   *    moved to the middle before the centre step, since rest is measured
   *    there. The pilot holds the throttle down from the release prompt
   *    until the check step, which used to stop the wizard at roll: see
   *    blockingAxis in input.js.
   * ------------------------------------------------------------------ */
  section('calibrate: the check step offers to move throttle zero, and T takes it');
  await page.evaluate("window.__pad.axes[2] = 0; window.__pad.timestamp += 1;");
  await ev(`ui.show('pilot'); ui.act('calibrate');`);
  await page.until("window.__ui.screen === 'calibrate' && !!window.__input.calibration", 5000);
  const drove2 = await page.evaluate(DRIVE({
    roll: 0, pitch: 1, yaw: 4, thr: 2, thrReturn: -1, holdAfter: -1,
  }));
  check('the wizard ran through with the sprung throttle held down the whole way', drove2[drove2.length - 1] === 'done', drove2.join(' | '));
  /* Seven steps this time, the radio has its buttons back, so the wizard
   * is already on the check step. */
  await page.until("(() => { const v = window.__input.calibrationView(); return v && v.step === 'confirm'; })()", 3000).catch(() => {});
  await page.until('window.__ui.calCanSave === true', 3000).catch(() => {});
  const held = await ev('const v = input.calibrationView(); return JSON.stringify({ pct: v.throttlePercent, zeroHidden: ui.calZeroBtn.hidden });').then(JSON.parse);
  check('still held down, the check step reads 0 and offers nothing', held.pct === 0 && held.zeroHidden === true, JSON.stringify(held));
  /* The hand comes off. */
  await page.evaluate("window.__pad.axes[2] = 0; window.__pad.timestamp += 1;");
  await page.until('!window.__ui.calZeroBtn.hidden', 3000).catch(() => {});
  const offer = await ev(`
    const v = input.calibrationView();
    return JSON.stringify({ pct: v.throttlePercent, zeroHidden: ui.calZeroBtn.hidden, hint: ui.calHint.textContent, low: input.calibration.draft.throttle.low });
  `).then(JSON.parse);
  check('the check step reads 50 percent with the stick at rest', offer.pct === 50, JSON.stringify(offer));
  check('the button is showing', offer.zeroHidden === false, JSON.stringify(offer));
  check('and the hint says the number and names the key', /50 percent/.test(offer.hint) && /press T/.test(offer.hint), offer.hint);
  await page.tap('KeyT');
  let zeroed = true;
  await page.until("window.__input.calibrationView().throttlePercent === 0 && window.__ui.calZeroBtn.hidden", 3000).catch(() => { zeroed = false; });
  check('T moves zero to where the stick rests and the offer goes away', zeroed);
  const draft = await ev('return JSON.stringify(input.calibration.draft.throttle);').then(JSON.parse);
  check('the draft has zero at rest and is marked sprung', draft.low === 0 && draft.high === 1 && draft.sprung === true, JSON.stringify(draft));
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'pilot'", 3000).catch(() => {});
  check('Escape cancels without keeping it', await ev("return input.calibration === null && input.map.throttle.low === -1 && ui.screen === 'pilot';"));
  await page.evaluate("window.__pad.axes[2] = -1; window.__pad.timestamp += 1;");

  /* --------------------------------------------------------------------
   * 5b. A backwards channel, and the repair that does not cost a whole
   *     calibration. bug-b0d085f0, "cant calibrate the sticks correctly.
   *     some are inverted and there's no option to change it", and
   *     bug-873a84ec, "i pushed the left stick but the right stick moved
   *     in the game", which is a Mode 1 pilot on a Mode 2 drawing.
   *
   *     Driven from the Settings row with the arrow keys and Enter, as a
   *     pilot reaches it, because the whole complaint was that there was
   *     no way in.
   * ------------------------------------------------------------------ */
  section('check sticks: reaching the repair from Settings, reversing a channel, swapping the hands');
  const row = await ev(`
    ${PAST_GATE}
    ui.show('pilot');
    const items = ui.items();
    const i = items.findIndex((it) => it && it.action === 'calibrate-check');
    if (i >= 0) { ui.setCursor(i); }
    return JSON.stringify({ i, label: i >= 0 ? items[i].label : null, note: i >= 0 ? (items[i].note || '') : '',
      stop: i >= 0 ? ui.isStop(items[i]) : false, calibrated: input.map.stored });
  `).then(JSON.parse);
  check('there is a row in Settings for it', row.i >= 0 && row.stop, JSON.stringify(row));
  check('and its note says what it is for', /reverses that channel/.test(row.note), row.note.slice(0, 120));
  check('the radio is calibrated going in, so there is a mapping to check', row.calibrated === true);
  await page.tap('Enter');
  let opened = true;
  await page.until("window.__ui.screen === 'calibrate' && !!window.__input.calibration", 4000).catch(() => { opened = false; });
  check('Enter on that row opens the check', opened);
  /* The view answers the instant the screen opens; the kicker and the
   * buttons are painted by the frame loop and still hold the last
   * section's text until it runs. Wait for the paint, not the state. */
  await page.until("/Check sticks/.test(window.__ui.calKicker.textContent)", 5000).catch(() => {});
  const head = await ev(`
    const v = input.calibrationView();
    return JSON.stringify({ step: v.step, count: v.stepCount, checkOnly: v.checkOnly, kicker: ui.calKicker.textContent,
      canSave: ui.calCanSave, revHidden: ui.calRevBtn.hidden, modeHidden: ui.calModeBtn.hidden,
      yaw: input.calibration.draft.yaw.axis, axes: v.axes.length });
  `).then(JSON.parse);
  check('it opens straight on the check step, one step long', head.step === 'confirm' && head.count === 1 && head.checkOnly === true,
    JSON.stringify(head));
  check('named as the check rather than as the wizard', /Check sticks/.test(head.kicker), head.kicker);
  check('carrying the saved mapping, yaw still on axis 4', head.yaw === 4 && head.axes === 6, JSON.stringify(head));
  check('Save is offered and the stick mode button is up; Reverse waits for a stick',
    head.canSave === true && head.modeHidden === false && head.revHidden === true, JSON.stringify(head));

  /* Move roll, which this radio has on axis 0. */
  await page.evaluate("window.__pad.axes[0] = 1; window.__pad.timestamp += 1;");
  /*
   * Wait on the SHELL's state, not on the view's. calibrationView is a
   * pure read and answers the instant the axis moves; calCanReverse and
   * the button's label are painted by the frame loop, and the R key is
   * gated on calCanReverse. Waiting on the view raced the paint and the
   * keypress was swallowed by a screen that did not yet know a channel
   * was live. The button label is the last thing to settle, so it is what
   * is waited on.
   */
  await page.until("window.__ui.calCanReverse === true && window.__ui.calRevBtn.textContent === 'Reverse roll'", 5000).catch(() => {});
  const moving = await ev(`
    const v = input.calibrationView();
    return JSON.stringify({ moving: v.moving, canReverse: v.canReverse, hint: ui.calHint.textContent,
      revHidden: ui.calRevBtn.hidden, revLabel: ui.calRevBtn.textContent, roll: v.channels.roll });
  `).then(JSON.parse);
  check('holding one stick names its channel', moving.moving === 'roll' && moving.canReverse === true, JSON.stringify(moving));
  check('the button appears and names it', moving.revHidden === false && moving.revLabel === 'Reverse roll', moving.revLabel);
  check('the hint offers both keys', /press R to reverse roll/.test(moving.hint) && /press M/.test(moving.hint), moving.hint);
  check('and roll reads full one way', moving.roll === 1, String(moving.roll));
  await page.tap('KeyR');
  let flipped = true;
  await page.until("window.__input.calibrationView().channels.roll === -1 && window.__ui.calRevBtn.textContent === 'Un-reverse roll'", 5000)
    .catch(() => { flipped = false; });
  check('R turns it round under the stick they are still holding', flipped);
  const after = await ev(`
    const v = input.calibrationView();
    return JSON.stringify({ roll: v.channels.roll, rev: v.reverse, label: ui.calRevBtn.textContent,
      savedRev: input.map.reverse.roll });
  `).then(JSON.parse);
  check('the draft records it', after.rev.roll === true && after.rev.pitch === false, JSON.stringify(after.rev));
  check('the button becomes the way back', after.label === 'Un-reverse roll', after.label);
  check('and the SAVED map is untouched until Save', after.savedRev === false);

  /* And the other ticket: the drawn sticks on the wrong hands. */
  const modeBefore = await ev('return JSON.stringify({ mode: ui.settings.stickMode, left: ui.calStickLeft.cap.textContent });').then(JSON.parse);
  await page.tap('KeyM');
  let swapped = true;
  await page.until('window.__ui.settings.stickMode !== ' + modeBefore.mode, 4000).catch(() => { swapped = false; });
  check('M moves the stick mode on', swapped, JSON.stringify(modeBefore));
  /* The setting moves in the key's own task and the calibration screen is
   * painted by the frame loop (ui.setCalibration, once a frame), so the
   * button's label is the last thing to settle, as with the reverse button
   * above, and is what is waited on. Reading it in the same task as the
   * setting was a race that a slow frame lost: under SwiftShader it failed
   * one run in nine on 2026-09-28, with the setting and the input layer
   * already at mode 3 and the label still reading mode 2. */
  await page.until('window.__ui.calModeBtn.textContent === "Stick mode " + window.__ui.settings.stickMode', 4000).catch(() => {});
  const modeAfter = await ev(`
    return JSON.stringify({ mode: ui.settings.stickMode, left: ui.calStickLeft.cap.textContent,
      inputMode: input.stickMode, btn: ui.calModeBtn.textContent });
  `).then(JSON.parse);
  check('the drawn gimbal is re-captioned where they can see it', modeAfter.left !== modeBefore.left,
    `${modeBefore.left} -> ${modeAfter.left}`);
  check('and the input layer and the button agree with the setting',
    modeAfter.inputMode === modeAfter.mode && modeAfter.btn === `Stick mode ${modeAfter.mode}`, JSON.stringify(modeAfter));

  await page.tap('Enter');
  let kept = true;
  await page.until("window.__ui.screen === 'pilot' && window.__input.calibration === null", 4000).catch(() => { kept = false; });
  check('Enter saves and returns to Settings', kept);
  const keptMap = await ev('return JSON.stringify({ rev: input.map.reverse, yaw: input.map.yaw.axis, thr: input.map.throttle.low });').then(JSON.parse);
  check('the reversal is kept and no axis assignment moved',
    keptMap.rev.roll === true && keptMap.yaw === 4 && keptMap.thr === -1, JSON.stringify(keptMap));
  await page.evaluate("window.__pad.axes[0] = 0; window.__pad.timestamp += 1;");
  /* Put the mode back so the section after this one starts where it expects. */
  await ev('ui.settings.stickMode = 2; ui.writeSettings();');

  /* --------------------------------------------------------------------
   * 5c. The pad edge tracker across a screen change. Found while building
   *     the check above: the wizard pins the channels to zero while it is
   *     up, so the menu's edge tracker believed every stick was centred,
   *     and a stick still held when the screen closed read as a brand new
   *     flick on the screen it landed on. Saving the check with roll held
   *     went Back, off Settings and onto the front page. See show().
   *
   *     Both halves are asserted, because suppressing a held stick is only
   *     half a fix if it also suppresses a real one: a radio pilot has to
   *     still be able to drive the menus.
   * ------------------------------------------------------------------ */
  section('the pad edge tracker: a held stick is not a gesture, a fresh one still is');
  const edges = await ev(`
    ${PAST_GATE}
    const out = {};
    /* Held BACK across a screen change must not leave the screen. */
    ui.show('pilot');
    ui.pollPad({ left: true });
    out.heldOnce = ui.screen;
    ui.pollPad({ left: true });
    out.heldTwice = ui.screen;
    /* Let go, then a real flick, which must go back. */
    ui.pollPad({});
    ui.pollPad({ left: true });
    out.afterFlick = ui.screen;
    /* And the cursor, the same way round. */
    ui.show('pilot');
    const start = ui.cursor;
    ui.pollPad({ down: true });
    out.cursorHeld = ui.cursor - start;
    ui.pollPad({ down: true });
    out.cursorStillHeld = ui.cursor - start;
    ui.pollPad({});
    ui.pollPad({ down: true });
    out.cursorFlicked = ui.cursor - start;
    ui.pollPad({});
    ui.show('title');
    return JSON.stringify(out);
  `).then(JSON.parse);
  check('a stick already held when the screen opened does nothing', edges.heldOnce === 'pilot' && edges.heldTwice === 'pilot',
    JSON.stringify(edges));
  check('releasing and flicking again still navigates', edges.afterFlick !== 'pilot', edges.afterFlick);
  check('and the cursor obeys the same rule', edges.cursorHeld === 0 && edges.cursorStillHeld === 0 && edges.cursorFlicked > 0,
    JSON.stringify(edges));

  /* --------------------------------------------------------------------
   * 5d. A frozen picture has to be able to say why. bug-579a663f, "when I
   *     really hardly crash the drone the game just freezes". main.js
   *     catches the first thrown frame fault, records it on
   *     window.__frameFault and tells the pilot to press F8, and the
   *     snapshot F8 sends never read it, so the ticket arrived looking
   *     like every other ticket. The fault itself is not reproducible from
   *     here; that the report carries one is.
   * ------------------------------------------------------------------ */
  section('a frozen frame reports itself');
  const clean = await ev('return JSON.stringify(Object.keys(ui.bugSnapshot()));').then(JSON.parse);
  check('an ordinary report carries no fault field', !clean.includes('fault'), clean.join(','));
  const faulted = await ev(`
    const NL = String.fromCharCode(10);
    window.__frameFault = { message: 'sim_state: SIM_ERR_STATE',
      stack: ['Error: sim_state', '  at readState (main.js:2747)', '  at frameBody (main.js:5940)',
        '  at frame (main.js:5758)', '  at deeper (main.js:1)'].join(NL), atMs: 12345 };
    const snap = ui.bugSnapshot();
    const keys = Object.keys(snap);
    delete window.__frameFault;
    return JSON.stringify({ keys, fault: snap.fault, chars: JSON.stringify(snap).length });
  `).then(JSON.parse);
  check('once one is recorded, the report carries it', Boolean(faulted.fault), JSON.stringify(faulted.keys));
  check('with the message that names the throwing call',
    faulted.fault && faulted.fault.message === 'sim_state: SIM_ERR_STATE', JSON.stringify(faulted.fault));
  check('and the top frames only, so a stack cannot blow the size cap',
    faulted.fault && faulted.fault.stack.split(' | ').length === 4 && !/deeper/.test(faulted.fault.stack),
    faulted.fault ? faulted.fault.stack : 'none');
  check('and when it happened', faulted.fault && faulted.fault.atMs === 12345);
  /* The board caps a context at 8000 characters over 32 keys, and the feel
   * form spreads this snapshot and adds five of its own. Assert the
   * headroom rather than discovering it when reports start bouncing. */
  check(`a faulted report is ${faulted.keys.length} keys and ${faulted.chars} chars, inside the board's 32 and 8000`,
    faulted.keys.length + 5 <= 32 && faulted.chars < 8000, `${faulted.keys.length} keys, ${faulted.chars} chars`);

  /* --------------------------------------------------------------------
   * 5e. A stuck craft has to be able to say how. bug-d7247563, "stuck in a
   *     container hole", and bug-ad038907, "ITS GETTING STUCK THE DRONE":
   *     each said stuck and nothing else, and neither could be made to
   *     happen from the words, because a report carried the pilot's settings
   *     and devices and nothing about the craft. It carries one key now,
   *     `craft`: parked or flying, on its back or waiting for a stick to
   *     centre, how long still, where, set downs and why, the stick keys the
   *     page believes are down and what the sticks feed the sim. A key
   *     whose release was lost holds a throttle at zero for good, and this
   *     is the only place it would show.
   * ------------------------------------------------------------------ */
  section('a stuck craft reports itself');
  const crafty = await ev(`
    const snap = ui.bugSnapshot();
    window.__input.keys.add('KeyS');
    window.__input.keys.add('ArrowLeft');
    window.__input.keys.add('KeyP');
    const held = ui.bugSnapshot().craft;
    window.__input.keys.delete('KeyS');
    window.__input.keys.delete('ArrowLeft');
    window.__input.keys.delete('KeyP');
    return JSON.stringify({ craft: snap.craft, held: held && held.keys, keys: Object.keys(snap).length, chars: JSON.stringify(snap).length });
  `).then(JSON.parse);
  const cr = crafty.craft || {};
  check('a report carries the craft: parked or not, turtle, attitude, speed, where, how still, set downs and sticks',
    typeof cr.landed === 'boolean' && 'turtle' in cr && 'upZ' in cr && 'speed' in cr && Array.isArray(cr.at) && cr.at.length === 3
    && typeof cr.stillS === 'number' && cr.setDowns && typeof cr.setDowns.n === 'number' && Array.isArray(cr.keys)
    && Array.isArray(cr.sticks) && cr.sticks.length === 4, JSON.stringify(cr));
  check('and the stick keys the page believes are down, which is how a lost key release would show, and only stick keys',
    JSON.stringify(crafty.held) === JSON.stringify(['ArrowLeft', 'KeyS']), JSON.stringify(crafty.held));
  check(`a report with it is ${crafty.keys} keys and ${crafty.chars} chars, inside the board's 32 and 8000 with the feel form's five`,
    crafty.keys + 5 <= 32 && crafty.chars < 8000, `${crafty.keys} keys, ${crafty.chars} chars`);

  /* --------------------------------------------------------------------
   * 6. The camera angle that changed the track. bug-4d5b2c51: on a whoop,
   *    in the town, nudging the camera angle threw the pilot onto the
   *    custom track, because syncMode ran on every settings write and
   *    forces race and custom on an aircraft that is not offered
   *    freestyle. It is gated on the aircraft moving now. Both halves:
   *    the camera leaves the seat alone, and swapping to the whoop still
   *    moves it, which is the case the sync was written for.
   * ------------------------------------------------------------------ */
  section('settings: only an aircraft change reseats the mode and the map');
  const sync = await ev(`
    ${PAST_GATE}
    ui.show('quad');
    const out = {};
    ui.settings.airframe = 'whoop65';
    ui.modeSyncedFor = 'whoop65';
    ui.mode = 'freestyle';
    ui.settings.map = 'city';
    const angle = ui.settings.cameraAngle;
    ui.settings.cameraAngle = angle === 15 ? 25 : 15;
    ui.writeSettings();
    out.afterCamera = { mode: ui.mode, map: ui.settings.map, angle: ui.settings.cameraAngle };
    ui.settings.airframe = '5inch';
    ui.modeSyncedFor = '5inch';
    ui.mode = 'freestyle';
    ui.settings.map = 'city';
    ui.settings.airframe = 'whoop65';
    ui.writeSettings();
    out.afterSwap = { mode: ui.mode, map: ui.settings.map };
    ui.settings.airframe = '5inch';
    ui.settings.cameraAngle = angle;
    ui.writeSettings();
    ui.show('title');
    return JSON.stringify(out);
  `).then(JSON.parse);
  check('camera angle on a seated whoop leaves freestyle and the town alone',
    sync.afterCamera.mode === 'freestyle' && sync.afterCamera.map === 'city', JSON.stringify(sync.afterCamera));
  check('swapping to the whoop still seats race on the custom track',
    sync.afterSwap.mode === 'race' && sync.afterSwap.map === 'custom', JSON.stringify(sync.afterSwap));

  /* --------------------------------------------------------------------
   * 6b. The joystick picker's picture. bug-9983ae9a, a Flysky SM001: "On
   *     the test image you can see on one side the bullet is moving for
   *     both sticks but not as they should." The cards drew raw axes 0 and
   *     1 as the left plate and 2 and 3 as the right, a gamepad's layout,
   *     uncaptioned. This radio's roll is axis 0, so pushing roll moved the
   *     LEFT plate. Drawn through the mapping the page flies now, captioned
   *     like every other drawn stick, and it says which mapping it is.
   * ------------------------------------------------------------------ */
  section('the joystick picker draws what the page will fly, and says which mapping that is');
  /* The section above swapped the aircraft and the map, and the frame loop
   * that opens the picker does nothing until the world it rebuilt is up. */
  await page.until('window.__map().ready', 90000).catch(() => {});
  await ev("ui.show('pilot'); input.requestPadPick('menu'); return 1;");
  let picking = true;
  await page.until("window.__ui.screen === 'padpick' && !!document.querySelector('.pad-card')", 10000).catch(() => { picking = false; });
  check('the picker opens from Settings', picking);
  /* Where each dot sits, as left and top in per cent of its plate. The dot
   * rides a track layer moved by translate() since bug-e82b8bb8 (a layout
   * every frame the keys were held, see placeNub in src/ui/ui.js); the
   * translate is in the same per cent, from the centre, so 50 plus it is the
   * left and top this check always read. */
  const NUB_AT = `(n) => { const t = n.querySelector('.osd-nub-track');
    const m = /translate\\(([-0-9.]+)%,\\s*([-0-9.]+)%\\)/.exec((t && t.style.transform) || '');
    return m ? [50 + parseFloat(m[1]), 50 + parseFloat(m[2])] : [50, 50]; }`;
  const plates = `const c = document.querySelector('.pad-card'); const g = c.querySelectorAll('.osd-gimbal');
    const at = ${NUB_AT};
    const cap = (n) => n.querySelector('.osd-gimbal-cap');`;
  const pick0 = await ev(`${plates}
    return JSON.stringify({ left: at(g[0]), right: at(g[1]), caps: [cap(g[0]).textContent, cap(g[1]).textContent],
      shown: cap(g[0]).offsetHeight > 0 && cap(g[1]).offsetHeight > 0, hint: ui.padHint.textContent });`).then(JSON.parse);
  check('the plates are captioned the way every other drawn stick is, and the captions show',
    pick0.caps[0] === 'Yaw, throttle' && pick0.caps[1] === 'Roll, pitch' && pick0.shown, JSON.stringify(pick0));
  check('calibrated earlier in this run, it says the sticks follow the saved calibration',
    /saved calibration/.test(pick0.hint), pick0.hint);
  await page.evaluate('window.__pad.axes[0] = 1; window.__pad.timestamp += 1;');
  /* Waited on, not slept on: the plates are repainted by the frame loop,
   * and with two browsers on this machine a frame took longer than the
   * 300 ms this used to sleep. */
  await page.until(`(() => { const n = document.querySelectorAll('.pad-card .osd-gimbal')[1];
    return Math.abs((${NUB_AT})(n)[0] - ${pick0.right[0]}) > 20; })()`, 3000).catch(() => {});
  const pick1 = await ev(`${plates} return JSON.stringify({ left: at(g[0]), right: at(g[1]) });`).then(JSON.parse);
  await page.evaluate('window.__pad.axes[0] = 0; window.__pad.timestamp += 1;');
  /* Sideways, not rightwards: section 5b reversed this page's roll and
   * saved it, and a picture drawn through the mapping shows that too. */
  check('roll moves the Roll, pitch plate sideways and leaves the other alone',
    Math.abs(pick1.right[0] - pick0.right[0]) > 20 && Math.abs(pick1.left[0] - pick0.left[0]) < 2 && Math.abs(pick1.left[1] - pick0.left[1]) < 2,
    `${JSON.stringify(pick0.left)} ${JSON.stringify(pick0.right)} -> ${JSON.stringify(pick1.left)} ${JSON.stringify(pick1.right)}`);
  /* The same screen with no calibration: the saved mapping put aside, then
   * put back, so nothing after this section inherits the difference. */
  const guessHint = await ev(`
    const key = 'webfpv_stick_map_v1';
    const kept = localStorage.getItem(key);
    localStorage.removeItem(key);
    input.map = input.loadMap();
    /* The same wait as the plates above, for the same reason: this slept
     * 300 ms and read the hint, and a slow frame left the old one there. */
    return new Promise((done) => {
      const t0 = performance.now();
      const look = () => {
        const hint = ui.padHint.textContent;
        if (!/a guess until you calibrate/.test(hint) && performance.now() - t0 < 3000) {
          requestAnimationFrame(look);
          return;
        }
        if (kept !== null) { localStorage.setItem(key, kept); }
        input.map = input.loadMap();
        done(JSON.stringify({ hint, restored: input.map.stored }));
      };
      requestAnimationFrame(look);
    });
  `).then(JSON.parse);
  check('uncalibrated, it says the picture is a guess and sends the pilot to Calibrate sticks in the room that holds it',
    /a guess until you calibrate/.test(guessHint.hint) && guessHint.hint.includes(`Calibrate sticks in ${signs.roomName}`),
    guessHint.hint);
  check('and the saved mapping is back afterwards', guessHint.restored === true);
  await ev("ui.act('padpick-cancel'); return ui.screen;");

  /* --------------------------------------------------------------------
   * 6c. The radio's restart switch. bug-a25bc2dd: "As people start to
   *     grind tracks they will need ready access to a restart race hot
   *     key... can be assigned to an AUX on the radio too." Assigned from
   *     its row in Settings by flipping it, the way a pilot would, then
   *     flipped in flight. This radio's axis 5 sits at -1 like an AUX.
   * ------------------------------------------------------------------ */
  section('the restart switch: assigned by flipping it, and a flip in flight is the start line');
  const restartRow = await ev(`ui.show('pilot'); const items = ui.items(); const i = items.findIndex((it) => it && it.label === 'Restart switch');
    ui.setCursor(i); return JSON.stringify({ i, value: i >= 0 ? items[i].value : null });`).then(JSON.parse);
  check('with a radio, Settings has a Restart switch row, not set', restartRow.i >= 0 && restartRow.value === 'Not set', JSON.stringify(restartRow));
  await page.tap('Enter');
  await page.until('window.__input.padSummary().restartCapturing === true', 3000).catch(() => {});
  await page.until("window.__ui.items().some((it) => it && it.label === 'Restart switch' && it.value === 'Flip it now')", 3000).catch(() => {});
  const listening = await ev("const it = ui.items().find((x) => x && x.label === 'Restart switch'); return JSON.stringify({ value: it && it.value });")
    .then(JSON.parse);
  check('choosing it listens, and the row says to flip it', listening.value === 'Flip it now', JSON.stringify(listening));
  await page.evaluate('window.__pad.axes[5] = 1; window.__pad.timestamp += 1; 0');
  await page.until("window.__ui.items().some((it) => it && it.label === 'Restart switch' && it.value === 'Switch on axis 5')", 3000).catch(() => {});
  const assigned = await ev(`const it = ui.items().find((x) => x && x.label === 'Restart switch');
    return JSON.stringify({ value: it && it.value, forget: ui.items().some((x) => x && x.label === 'Forget restart switch'),
      kept: JSON.parse(localStorage.getItem('webfpv.restart.v1') || 'null') });`).then(JSON.parse);
  check('the AUX flipped is the switch: the row names it, offers to forget it, and it is kept',
    assigned.value === 'Switch on axis 5' && assigned.forget && assigned.kept && assigned.kept.index === 5, JSON.stringify(assigned));
  /* In the air, well above the ground, so it is still flying when the
   * switch goes. The pad's throttle is parked, so it is falling. */
  await ev('const sp = window.__map().spawn; window.__placeCraft(sp.x + 6, sp.y + 30, sp.z); return 1;');
  await page.until("window.__ui.screen === 'flight' && !window.__craftState().landed", 5000).catch(() => {});
  await page.sleep(300);
  const away = await ev('const c = window.__craftState(); return JSON.stringify({ y: c.worldY, landed: c.landed, screen: ui.screen });').then(JSON.parse);
  await page.evaluate('window.__pad.axes[5] = -1; window.__pad.timestamp += 1; 0');
  await page.sleep(200);
  await page.evaluate('window.__pad.axes[5] = 1; window.__pad.timestamp += 1; 0');
  let restarted = true;
  await page.until(`(() => { const c = window.__craftState(); const sp = window.__map().spawn;
    return c.landed && Math.abs(c.worldX - sp.x) < 1 && Math.abs(c.worldZ - sp.z) < 1; })()`, 5000).catch(() => { restarted = false; });
  check('in flight, off and on again: back on the start line, parked', !away.landed && away.screen === 'flight' && restarted, JSON.stringify(away));
  await ev("ui.act('restart-switch-clear'); return 1;");
  await page.evaluate('window.__pad.axes[5] = -1; window.__pad.timestamp += 1; 0');
  check('and it can be forgotten', await ev("return input.padSummary().restart === null && localStorage.getItem('webfpv.restart.v1') === null;"));

  /* --------------------------------------------------------------------
   * 6d. bug-08577148. A feel report is sent from the pause or results
   *     screen with the sticks at rest, so the stick rate it read there
   *     said 0 Hz for eleven of the twenty two radio feel reports open on
   *     the 24th of September. The flight keeps its own record now. Flown
   *     here on the radio at the page's own pace, the throttle never past
   *     half and roll both ways, then paused, and the report read from the
   *     pause screen the way a pilot sends one.
   * ------------------------------------------------------------------ */
  section('a feel report sent from the pause screen carries what the flight measured');
  await ev('const sp = window.__map().spawn; window.__placeCraft(sp.x + 6, sp.y + 30, sp.z); return 1;');
  await page.until("window.__ui.screen === 'flight' && !window.__craftState().landed", 5000).catch(() => {});
  const flown = await page.evaluate(`(async () => {
    const pad = window.__pad;
    const im = window.__input;
    const m = im.map;
    const half = m.throttle.low + 0.5 * (m.throttle.high - m.throttle.low);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = performance.now();
    let k = 0;
    while (performance.now() - t0 < 1600) {
      pad.axes[m.throttle.axis] = k % 2 ? half : m.throttle.low;
      pad.axes[m.roll.axis] = [1, 0, -1, 0][k % 4];
      pad.timestamp += 1;
      k += 1;
      await sleep(20);
    }
    pad.axes[m.throttle.axis] = m.throttle.low;
    pad.axes[m.roll.axis] = 0;
    pad.timestamp += 1;
    return JSON.stringify({ k, screen: window.__ui.screen, thr: m.throttle });
  })()`).then(JSON.parse);
  await ev("ui.act('pause'); return 1;");
  await page.until("window.__ui.screen === 'paused'", 3000).catch(() => {});
  /* Two whole rate windows with the sticks at rest, as a pilot's are
   * while they fill in the form. */
  await page.sleep(1300);
  const sent = await ev('return JSON.stringify(ui.bugSnapshot().stick);').then(JSON.parse);
  const fr = sent && sent.flight;
  check('the moment of sending, from the pause screen with the sticks at rest, reads 0 Hz, as the old reports did',
    flown.screen === 'flight' && sent.padHz === 0, JSON.stringify({ flown, padHz: sent && sent.padHz }));
  check('the report carries the flight: a radio, its own refresh ceiling, and how long it covers',
    !!fr && fr.source === 'a radio' && fr.padHzMax >= 10 && fr.seconds >= 1.5, JSON.stringify(fr));
  check('the top of the throttle is the half it was flown at, and the bottom is idle',
    !!fr && fr.travel.throttle[0] === 0 && fr.travel.throttle[1] === 0.5, JSON.stringify(fr && fr.travel));
  check('and roll went both ways, to the stop', !!fr && fr.travel.roll.join() === '-1,1', JSON.stringify(fr && fr.travel));

  /* --------------------------------------------------------------------
   * 6e. Stick help, the owner's ask of 28 September: when a stick has not
   *     been used for long enough, help comes up. Whether a channel is
   *     dead is proven in Node (scripts/input-selftest.js, the dead stick
   *     verdict), over twenty seconds of flying this page would have to
   *     spend in real time, so here the verdict is handed in and this is
   *     the shell's half: the banner in flight, once; the pause row; the
   *     screen it opens reading the stick the pilot moves; and the wizard's
   *     round trip back to it.
   * ------------------------------------------------------------------ */
  section('stick help: a dead stick is said once in flight, the pause row opens the screen, and the screen reads it');
  check('Settings always holds a Stick help row, verdict or not',
    await ev("ui.show('pilot'); return ui.items().some((it) => it && it.action === 'stickhelp');"));
  /* Chosen again, so the verdicts the sections above latched are gone and
   * the row this section earns is the one that shows. */
  await ev('input.setPadChoice({ kind: \'pad\', id: window.__pad.id, index: 0 }); return 1;');
  await ev('const sp = window.__map().spawn; window.__placeCraft(sp.x + 6, sp.y + 30, sp.z); return 1;');
  await page.until("window.__ui.screen === 'flight'", 5000).catch(() => {});
  await ev("input.deadList = ['pitch']; return 1;");
  const LOST = 'Pitch is not reaching the sim.\nPause for Stick help.';
  const lostShown = `window.__ui.banner.textContent === ${JSON.stringify(LOST)}`;
  let lostSaid = true;
  await page.until(lostShown, 3000).catch(() => { lostSaid = false; });
  check('in flight, the frame loop says it by itself, in the banner', lostSaid,
    await ev('return JSON.stringify(ui.banner.textContent);'));
  /* Past the notice's five seconds, held in the air the whole time, so the
   * frame loop that said it once is still running and could say it again. */
  for (let k = 0; k < 3; k += 1) {
    await page.sleep(1950);
    await ev('const sp = window.__map().spawn; window.__placeCraft(sp.x + 6, sp.y + 30, sp.z); return 1;');
  }
  await page.sleep(100);
  check('once: the banner moves on and does not come back while the verdict stands',
    await ev(`return !(${lostShown}) && input.padSummary().deadChannels.includes('pitch');`));
  /* Escape, the way a pilot pauses: act('pause') alone moves the mode and
   * leaves the screen to the caller. */
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 3000).catch(() => {});
  const pauseRow = await ev(`const items = ui.items(); const i = items.findIndex((it) => it && it.rowClass === 'row-warn');
    return JSON.stringify({ i, label: i >= 0 ? items[i].label : null, action: i >= 0 ? items[i].action : null,
      first: items[0] && items[0].label });`).then(JSON.parse);
  check('the pause menu carries the row, under Resume, and it opens Stick help',
    pauseRow.label === 'Pitch is not reaching the sim' && pauseRow.action === 'stickhelp'
    && pauseRow.i > 0 && pauseRow.first === 'Resume', JSON.stringify(pauseRow));
  await ev(`ui.setCursor(${Math.max(0, pauseRow.i)}); return 1;`);
  await page.tap('Enter');
  await page.until("window.__ui.screen === 'stickhelp'", 3000).catch(() => {});
  await page.sleep(300);
  /* Whatever map is flying: the wizard earlier in this page has already
   * put this rig's yaw where it really is, on axis 4, so the cells are read
   * against input.map rather than written out, and the stray pushed is an
   * axis that map does not read. */
  const helpOpen = await ev(`const m = input.map;
    const owner = (i) => ['roll', 'pitch', 'yaw', 'throttle'].find((ch) => m[ch] && m[ch].axis === i) || 'unread';
    return JSON.stringify({ screen: ui.screen,
      cells: Array.from(ui.stickAxes.querySelectorAll('.cal-axis-ch')).map((n) => n.textContent),
      want: window.__pad.axes.map((v, i) => owner(i)),
      yaw: m.yaw.axis,
      say: ui.stickSay.textContent, watch: Boolean(input.stickCheck) });`).then(JSON.parse);
  check('Enter on it opens Stick help, watching, with a cell per axis naming what the sim reads there',
    helpOpen.screen === 'stickhelp' && helpOpen.watch && helpOpen.cells.length === 6
    && helpOpen.cells.join() === helpOpen.want.join(), JSON.stringify(helpOpen));
  check('and before anything moves, it names the dead stick and asks for it',
    /Pitch did not move once in flight/.test(helpOpen.say), helpOpen.say);
  const stray = helpOpen.want.indexOf('unread');
  const sweep = (axis) => page.evaluate(`(async () => {
    const pad = window.__pad;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const v of [0.2, 0.45, 0.7, 0.95, 0.8]) {
      pad.axes[${axis}] = v; pad.timestamp += 1; await sleep(40);
    }
  })()`);
  await sweep(stray);
  let named = true;
  await page.until(`/Axis ${stray} is moving like a stick/.test(window.__ui.stickSay.textContent)`, 3000).catch(() => { named = false; });
  check('a stick pushed on an axis the map does not read: named as a stick on the wrong channel',
    named, `axis ${stray}: ${await ev('return ui.stickSay.textContent;')}`);
  await page.evaluate(`window.__pad.axes[${stray}] = 0; window.__pad.timestamp += 1; 0`);
  await page.sleep(100);
  await sweep(helpOpen.yaw);
  let arrives = true;
  await page.until(`window.__ui.stickSay.textContent === 'That is yaw, on axis ${helpOpen.yaw}, and it is reaching the sim.'`, 3000)
    .catch(() => { arrives = false; });
  check('and the yaw stick, where the map reads it: named, and said to reach the sim',
    arrives, await ev('return ui.stickSay.textContent;'));
  await page.evaluate(`window.__pad.axes[${helpOpen.yaw}] = 0; window.__pad.timestamp += 1; 0`);
  await ev('ui.act(ui.items()[0].action); return 1;');
  await page.until("window.__ui.screen === 'calibrate'", 3000).catch(() => {});
  const wasCal = await ev('return ui.screen;');
  await page.tap('Escape');
  let cameBack = true;
  await page.until("window.__ui.screen === 'stickhelp'", 3000).catch(() => { cameBack = false; });
  check('its Calibrate sticks is a round trip: the wizard, Escape, and back on Stick help',
    wasCal === 'calibrate' && cameBack, wasCal);
  await page.tap('Escape');
  let toPause = true;
  await page.until("window.__ui.screen === 'paused'", 3000).catch(() => { toPause = false; });
  await page.sleep(200);
  check('and Escape from Stick help goes back to the pause it came from, with the watch stopped',
    toPause && await ev('return input.stickCheck === null;'));

  /* The report: bug-616cc604 and three Safari tickets before it could not
   * say what the browser had listed. With a radio it says one, and says which
   * of them this page flies. */
  const listed = await ev('return JSON.stringify(ui.bugSnapshot().stick.pads);').then(JSON.parse);
  check('a report from a page with a radio says the browser listed it and this page flies it, with its six axes named',
    listed.api === true && listed.listed === 1 && listed.used === 1 && listed.list.length === 1
    && /Selftest six axis radio/.test(listed.list[0]) && /6 axes, 4 buttons, connected$/.test(listed.list[0]),
    JSON.stringify(listed));
}

/*
 * Safari 27 on a Mac, and a Pocket the browser will not list: bug-616cc604.
 * Everything a pilot could ask of a radio that is not there, and what each
 * asks back. The words are read from the page, the way the pilot reads
 * them, and each is waited out before the next so one cannot answer for
 * another.
 *
 * FROM THE MENU NOTICE, NOT THE BANNER, since 2026-10-01 (MENUS-PLAN.md
 * 1.8). Every one of these is asked from Settings, and a notice raised on a
 * menu is the small line above the command bar now: the flight's banner had
 * printed it in three lines of large amber over the SETTINGS heading. Same
 * words, same timing, a different element. See setMenuNotice in ui.js.
 */
async function safariPage(page) {
  const ev = (expr) => page.evaluate(`(() => { const ui = window.__ui; const input = window.__input; ${expr} })()`);
  const SAFARI = '/Safari usually cannot see USB radios: try Chrome, Edge or Firefox\\./';
  const banner = () => ev('return ui.menuNotice.textContent;');
  /* Ask for a radio one way, and read what the notice says of it. */
  const ask = async (expr) => {
    await page.until("window.__ui.menuNotice.textContent === ''", 9000).catch(() => {});
    await ev(expr);
    let said = true;
    await page.until(`${SAFARI}.test(window.__ui.menuNotice.textContent)`, 3000).catch(() => { said = false; });
    return { said, text: await banner(), screen: await ev('return ui.screen;') };
  };

  section('safari: a browser that lists no radio says so, wherever a pilot asks for one');
  const who = await ev('return JSON.stringify({ platform: ui.stickPlatform, browser: ui.stickBrowser, blind: Boolean(ui.radioBlind) });')
    .then(JSON.parse);
  check('the shell reads the page as Safari on a Mac, which does not show a radio to a page',
    who.platform === 'mac' && who.browser === 'safari' && who.blind, JSON.stringify(who));

  const row = await ev(`${PAST_GATE} ui.show('pilot');
    const it = ui.items().find((x) => x && x.action === 'choosepad');
    return JSON.stringify({ note: it ? it.note : null });`).then(JSON.parse);
  check('Settings\' Choose joystick row says Safari in its help column, and not to plug one in',
    /^Safari usually cannot see USB radios/.test(row.note || '') && !/Plug in a radio in joystick mode/.test(row.note || ''),
    JSON.stringify(row));

  const chose = await ask("ui.act('choosepad'); return 1;");
  check('Choose joystick with none listed: the notice names Safari and the browsers to use, over two lines',
    chose.said && /^No radio or gamepad found\.\n/.test(chose.text) && chose.text.split('\n').length === 2
    && !/Plug one in/.test(chose.text) && chose.screen === 'pilot', JSON.stringify(chose));
  const calibrated = await ask("ui.act('calibrate'); return 1;");
  check('Calibrate sticks with none listed says the same, and does not open a wizard with nothing to calibrate',
    calibrated.said && calibrated.screen !== 'calibrate', JSON.stringify(calibrated));
  const checked = await ask("ui.act('calibrate-check'); return 1;");
  check('Check sticks with none listed says the same', checked.said && checked.screen !== 'calibrate', JSON.stringify(checked));
  const restart = await ask("ui.act('restart-switch'); return 1;");
  check('and so does the restart switch row', restart.said, JSON.stringify(restart));

  await ev("ui.act('stickhelp'); return 1;");
  await page.until("window.__ui.screen === 'stickhelp'", 3000).catch(() => {});
  await page.sleep(400);
  const help = await ev(`const h = ui.stickSteps.querySelector('h3');
    return JSON.stringify({ screen: ui.screen, pad: ui.stickPad.textContent, say: ui.stickSay.textContent,
      title: h ? h.textContent : null, block: ui.stickSteps.textContent });`).then(JSON.parse);
  check('Stick help with nothing listed: no pad, and a sentence that names Safari and does not ask for a stick to be moved',
    help.screen === 'stickhelp' && help.pad === 'No radio or gamepad.' && /^Safari is not showing this page/.test(help.say)
    && !/move a stick/.test(help.say), JSON.stringify({ pad: help.pad, say: help.say }));
  check('and its block is the Mac one, leading with the test that settles it: the same radio in another browser',
    help.title === 'If no bar moves: Mac' && /Try Chrome, Edge or Firefox before anything else/.test(help.block)
    && /If it shows up there, it was Safari/.test(help.block), JSON.stringify({ title: help.title }));
  await ev("ui.show('pilot'); return 1;");

  const howto = await ev(`ui.show('howto'); ui.setHowtoSource('radio');
    const dt = Array.from(ui.howtoKeys.querySelectorAll('dt')).map((n) => n.textContent);
    const dd = Array.from(ui.howtoKeys.querySelectorAll('dd')).map((n) => n.textContent);
    ui.show('pilot');
    return JSON.stringify(dd[dt.indexOf('Before you fly')] || '');`).then(JSON.parse);
  check('How to fly, on the radio tab: Before you fly leads with Safari, where the pilot looking for radio setup reads',
    /^Safari usually cannot see USB radios\. Open this page in Chrome, Edge or Firefox first/.test(howto), howto);

  const snap = await ev(`const s = ui.bugSnapshot();
    return JSON.stringify({ pads: s.stick && s.stick.pads, map: s.stick && s.stick.map, keys: Object.keys(s).length,
      chars: JSON.stringify(s).length });`).then(JSON.parse);
  check('a report from this page says the browser listed nothing, with the API there: the field the Safari tickets lacked',
    snap.pads && snap.pads.api === true && snap.pads.listed === 0 && snap.pads.used === 0 && snap.pads.list.length === 0
    && snap.map === null, JSON.stringify(snap));
  check(`and it stays inside the board's 32 keys and 8000 characters, at ${snap.keys} keys and ${snap.chars}`,
    snap.keys + 5 <= 32 && snap.chars < 8000);
}

/*
 * A TX15 flown, and paused: bug-2d93629e, "the interface/menu is displayed for
 * a second then the resume is automatically selected or clicked and the game
 * resumes". The pilot's hands are on the radio when Escape is pressed, so what
 * comes off the sticks in the seconds after it is the whole question, and it
 * is replayed here through the real pause menu: a release with an overshoot, a
 * bump either way at one second (each of which resumed the flight before the
 * fix, at 247 ms and 1.02 s), a roll held when the menu opened, a push made too
 * soon and a flick too short. Then a push that is meant, which has to still
 * resume it, because a radio is the only stick some pilots have.
 *
 * The replay runs in the page against its own clock so the timings are the
 * menu's, with the Escape sent as the window key event input.js listens to.
 */
async function pausePage(page) {
  const ev = (expr) => page.evaluate(`(() => { const ui = window.__ui; const input = window.__input; ${expr} })()`);
  /* Back in the air with the radio at rest and every button released. */
  const fly = async () => {
    await ev(`${PAST_GATE}
      const pad = window.__pad;
      pad.axes = [0, 0, -0.3, 0, -1, 0, -1, -1];
      for (let i = 0; i < 24; i += 1) { pad.buttons[i] = { pressed: false, touched: false, value: 0 }; }
      pad.timestamp += 1;
      ui.padLog.length = 0;
      const sp = window.__map().spawn; window.__placeCraft(sp.x + 6, sp.y + 30, sp.z); return 1;`);
    await page.until("window.__ui.screen === 'flight'", 8000).catch(() => {});
    await page.sleep(300);
  };
  /*
   * Press Escape with the radio doing `init`, then run `steps`, a list of
   * [ms after the press, change], and watch the screen for `ms`. Axes are the
   * device's: 0 roll, 1 pitch, 2 throttle, 3 yaw. Returns when it resumed, if
   * it did.
   */
  const replay = (init, steps, ms) => page.evaluate(`(async () => {
    const pad = window.__pad; const ui = window.__ui;
    const apply = (c) => {
      if (c.axes) for (const [i, v] of Object.entries(c.axes)) pad.axes[i] = v;
      if (c.buttons) for (const [i, v] of Object.entries(c.buttons)) pad.buttons[i] = { pressed: Boolean(v), touched: Boolean(v), value: v ? 1 : 0 };
      pad.timestamp += 1;
    };
    const todo = ${JSON.stringify(steps)}.slice();
    apply(${JSON.stringify(init)});
    const t0 = performance.now();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape', bubbles: true }));
    let pausedAt = null; let resumedAt = null; let hot = null;
    while (performance.now() - t0 < ${ms}) {
      const t = performance.now() - t0;
      while (todo.length && todo[0][0] <= t) apply(todo.shift()[1]);
      if (ui.screen === 'paused' && pausedAt === null) { pausedAt = Math.round(t); hot = ui.padGate.hot; }
      if (pausedAt !== null && ui.screen === 'flight' && resumedAt === null) resumedAt = Math.round(t);
      await new Promise((r) => setTimeout(r, 8));
    }
    apply({ axes: { 0: 0, 1: 0 }, buttons: { 0: 0, 1: 0, 2: 0, 3: 0 } });
    return { pausedAt, resumedAt, hot, screen: ui.screen };
  })()`);
  /* Resume with the keyboard, the way the pilot who paused with it would. */
  const back = async () => {
    if (await ev('return ui.screen;') === 'paused') {
      await page.tap('Enter');
      await page.until("window.__ui.screen === 'flight'", 4000).catch(() => {});
    }
  };
  const WINDOW = 2600;

  section('pause: a radio being handled does not resume the pause menu: bug-2d93629e');
  await ev(`${PAST_GATE} input.setPadChoice({ kind: 'pad', id: window.__pad.id, index: 0 }); ui.show('title'); return 1;`);
  await page.sleep(700);
  const cold = await ev('return JSON.stringify({ usable: input.mapUsable(), stored: input.map.stored, hot: ui.padGate.hot });').then(JSON.parse);
  check('the page has the ticket\'s radio: a calibrated map the menus can use, and the title is not an exposed menu',
    cold.usable === true && cold.stored === true && cold.hot === false, JSON.stringify(cold));

  await fly();
  let r = await replay({}, [], WINDOW);
  check('Escape pauses, and the visit to the menus is marked as begun in flight',
    r.pausedAt !== null && r.hot === true, JSON.stringify(r));
  check('with the radio quiet the menu stays up', r.resumedAt === null && r.screen === 'paused', JSON.stringify(r));
  await back();

  await fly();
  r = await replay({}, [[150, { axes: { 0: 0.8 } }], [300, { axes: { 0: 0 } }], [380, { axes: { 0: -0.6 } }], [480, { axes: { 0: 0 } }]], WINDOW);
  check('a roll let go with an overshoot to the other side, which resumed it at 247 ms: the menu stays up',
    r.resumedAt === null && r.screen === 'paused', JSON.stringify(r));
  await back();

  await fly();
  r = await replay({}, [[1000, { axes: { 0: 0.7 } }], [1080, { axes: { 0: 0 } }]], WINDOW);
  check('a bump right at one second, which selected Resume at 1.02 s: the menu stays up',
    r.resumedAt === null && r.screen === 'paused', JSON.stringify(r));
  const swallowed = await ev('return JSON.stringify(ui.padLogReport());').then(JSON.parse);
  check('and the bump never reached the menu, which the record of what the radio did to it shows: gate open, nothing on it',
    swallowed.gate === 'open' && swallowed.last.length === 0, JSON.stringify(swallowed));
  await back();

  await fly();
  r = await replay({}, [[1000, { axes: { 0: -0.7 } }], [1080, { axes: { 0: 0 } }]], WINDOW);
  check('a bump left at one second, which was Back, which is Resume: the menu stays up',
    r.resumedAt === null && r.screen === 'paused', JSON.stringify(r));
  await back();

  await fly();
  r = await replay({ axes: { 0: 0.8 } }, [[400, { axes: { 0: 0 } }]], WINDOW);
  check('a roll held when the menu opened and let go later: the menu stays up (the old seeding already caught this one)',
    r.resumedAt === null && r.screen === 'paused', JSON.stringify(r));
  await back();

  await fly();
  r = await replay({}, [[200, { axes: { 0: 0.8 } }], [700, { axes: { 0: 0 } }]], WINDOW);
  check('a push made 200 ms after the menu opened, held for half a second: swallowed, not delayed into an act',
    r.resumedAt === null && r.screen === 'paused', JSON.stringify(r));
  await back();

  await fly();
  r = await replay({}, [[1200, { axes: { 0: 0.8 } }], [1300, { axes: { 0: 0 } }]], WINDOW);
  check('a flick of 100 ms after the settle is too short to count: the menu stays up',
    r.resumedAt === null && r.screen === 'paused', JSON.stringify(r));
  await back();

  await fly();
  r = await replay({}, [[100, { buttons: { 0: 1 } }], [400, { buttons: { 0: 0 } }]], WINDOW);
  check('a switch on button 0 thrown while the hand is still on the radio, inside the settle: swallowed',
    r.resumedAt === null && r.screen === 'paused', JSON.stringify(r));
  await back();

  /* And the radio still works when it is meant. */
  await fly();
  r = await replay({}, [[1200, { axes: { 0: 0.8 } }], [1700, { axes: { 0: 0 } }]], 3200);
  check('a roll right held for half a second after the settle resumes it, which is what a radio only pilot needs',
    r.resumedAt !== null && r.resumedAt >= 1300 && r.resumedAt <= 1900 && r.screen === 'flight', JSON.stringify(r));
  check('and leaving the menus for the air closes the gate again', await ev('return ui.padGate.hot === false;'));
  const did = await ev('return JSON.stringify(ui.padLogReport());').then(JSON.parse);
  check('and the record names what resumed it: a roll right, on the pause menu, about 200 ms after the settle',
    did.gate === 'cold' && did.last.length === 1 && /^right \d+ms on paused$/.test(did.last[0]), JSON.stringify(did));
  const snap = await ev('const b = ui.bugSnapshot(); return JSON.stringify({ menu: b.stick && b.stick.menu, keys: Object.keys(b).length, chars: JSON.stringify(b).length });').then(JSON.parse);
  check('a report carries it, inside the board\'s 32 keys and 8000 characters',
    snap.menu && snap.menu.gate === 'cold' && snap.menu.last.length === 1 && snap.keys + 5 <= 32 && snap.chars < 8000, JSON.stringify(snap));

  await fly();
  r = await replay({}, [[1200, { axes: { 0: -0.8 } }], [1700, { axes: { 0: 0 } }]], 3200);
  check('and a roll left held the same way goes back, which on this menu is Resume',
    r.resumedAt !== null && r.resumedAt >= 1300 && r.resumedAt <= 1900 && r.screen === 'flight', JSON.stringify(r));

  await fly();
  r = await replay({}, [[1200, { buttons: { 0: 1 } }], [1400, { buttons: { 0: 0 } }]], 3200);
  check('a button thrown after the settle still selects: switches are menu keys by design, so Fly is one flick away',
    r.resumedAt !== null && r.screen === 'flight', JSON.stringify(r));

  /* The title is never a menu opened under the pilot's hands, and a visit to
   * the menus ends there: paused, then Back to the title, then Settings. */
  await fly();
  r = await replay({}, [], 400);
  await ev("ui.show('title'); return 1;");
  await page.sleep(200);
  const onTitle = await ev("return JSON.stringify({ hot: ui.padGate.hot, gate: ui.padLogReport().gate });").then(JSON.parse);
  const inSettings = await ev("ui.show('pilot'); return JSON.stringify({ hot: ui.padGate.hot });").then(JSON.parse);
  check('paused, then the title, then Settings: the gate was open on the pause and is not on the title or beyond it',
    r.hot === true && onTitle.hot === false && onTitle.gate === 'cold' && inSettings.hot === false,
    JSON.stringify({ paused: r.hot, onTitle, inSettings }));
  await fly();
  await ev("ui.show('title'); return 1;");
  const direct = await ev("ui.show('pilot'); return JSON.stringify({ hot: ui.padGate.hot });").then(JSON.parse);
  check('and straight from the air to the title is the same: the instant flick is there',
    direct.hot === false, JSON.stringify(direct));
}

/*
 * THE STICK OVERLAY ON A RADIO. The owner, 2026-10-06: "i want to be able to
 * turn on a stick overlay in the sim. should be toggled on by default, with a
 * setting to toggle it off", and then, that it is hidden on a touch screen
 * and up "only if i'm using keyboard ot joystick or radio contorller". The
 * boxes had been the keyboard's alone, so a radio pilot never saw them, and
 * the first build of the setting showed them without telling the gate mark,
 * which went back to parking on them. Both halves are checked here, on a
 * radio, in a race, because the mark only exists where there is a next gate.
 * The thumbs' half is in touchLaptopPage and the keys' in keyboardPage.
 */
async function overlayRadioPage(page) {
  const ev = (expr) => page.evaluate(`(() => { const ui = window.__ui; const input = window.__input; ${expr} })()`);
  const stored = `JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').stickOverlay`;
  const nubs = `[ui.osdStickLeft.nub.__wfX, ui.osdStickLeft.nub.__wfY, ui.osdStickRight.nub.__wfX, ui.osdStickRight.nub.__wfY]`;
  /* On to the start line of the saved race, through the Race room, with the
   * radio at rest. The launch card is answered when it is asked; after the
   * reload below the world is already built and Fly goes straight to the
   * line, as it does for a pilot who reloads on a race. */
  const race = async () => {
    await ev(`${PAST_GATE} input.setPadChoice({ kind: 'pad', id: window.__pad.id, index: 0 });
      ui.mode = 'race'; ui.show('courses'); ui.act('local:${KEY_TRACK.id}'); return 1;`);
    await page.until("(() => { const m = window.__map(); return m.id === 'custom' && m.ready && m.mode !== 'freestyle' && m.gates > 0; })()", 60000);
    await ev("ui.act('fly'); return 1;");
    await page.until("window.__ui.screen === 'launch' || window.__ui.screen === 'flight'", 20000);
    if (await ev('return ui.screen;') === 'launch') {
      await page.tap('Enter');
    }
    await page.until("window.__ui.screen === 'flight' && window.__craftState().mode === 'flight'", 60000);
    await page.sleep(500);
  };
  /* The row, the way a pilot reaches it mid race: Escape to the pause menu,
   * then Settings, then Enter on the row, which is the switch's flip. */
  const flipRow = async (want) => {
    /* Not over the start's fly in, which is the camera's and not the pilot's. */
    await page.until('window.__intro().ms < 0', 20000).catch(() => {});
    await page.tap('Escape');
    let paused = true;
    await page.until("window.__ui.screen === 'paused'", 3000).catch(() => { paused = false; });
    const row = await ev(`ui.show('pilot');
      const items = ui.items();
      const i = items.findIndex((it) => it && it.label === 'Stick overlay');
      if (i >= 0) { ui.setCursor(i); }
      return JSON.stringify({ paused: ${paused}, i, value: i >= 0 ? items[i].value : null,
        before: i > 0 ? items[i - 1].label : null });`).then(JSON.parse);
    if (row.i >= 0) {
      await page.tap('Enter');
      await page.until(`window.__ui.settings.stickOverlay === ${want}`, 3000).catch(() => {});
    }
    const after = await ev(`return JSON.stringify({ setting: ui.settings.stickOverlay, stored: ${stored},
      value: (ui.items()[ui.cursor] || {}).value });`).then(JSON.parse);
    return { row, after };
  };

  section('stick overlay, on a radio: on by default, the dots follow the radio, and the gate mark parks above it');
  await race();
  const fresh = await ev(`return JSON.stringify({ setting: ui.settings.stickOverlay, stored: ${stored}, kb: input.isKeyboardPrimary(),
    touch: input.isTouchPrimary(), mode: ui.settings.stickMode });`).then(JSON.parse);
  check('a radio is the stick, and the overlay is on for a pilot who never touched the setting',
    fresh.kb === false && fresh.touch === false && fresh.setting === true && fresh.stored !== false, JSON.stringify(fresh));
  let up = true;
  await page.until(GIMBALS_UP, 3000).catch(() => { up = false; });
  check('on the start line, both stick boxes are drawn for the radio', up, await page.evaluate(`JSON.stringify(${GIMBALS})`));

  const rest = await ev(`return JSON.stringify(${nubs});`).then(JSON.parse);
  await page.evaluate('window.__pad.axes[0] = 0.8; window.__pad.axes[3] = -0.8; window.__pad.timestamp += 1; 0');
  let followed = true;
  await page.until('window.__ui.osdStickRight.nub.__wfX >= 30 && window.__ui.osdStickLeft.nub.__wfX <= -30', 3000)
    .catch(() => { followed = false; });
  const held = await ev(`return JSON.stringify({ nubs: ${nubs}, ch: input.channels });`).then(JSON.parse);
  await page.evaluate('window.__pad.axes[0] = 0; window.__pad.axes[3] = 0; window.__pad.timestamp += 1; 0');
  let centred = true;
  await page.until('window.__ui.osdStickRight.nub.__wfX === 0 && window.__ui.osdStickLeft.nub.__wfX === 0', 3000)
    .catch(() => { centred = false; });
  check('at rest in Mode 2 the dots are centred, with the idle throttle at the bottom of the left box',
    fresh.mode === 2 && rest[0] === 0 && rest[1] === 50 && rest[2] === 0 && rest[3] === 0, JSON.stringify(rest));
  check('roll right on the radio moves the right dot right, and yaw left moves the left dot left',
    followed, JSON.stringify(held));
  check('and let go, both come back to the middle', centred, await ev(`return JSON.stringify(${nubs});`));

  await ev(CAM_OVER_START);
  let pinned = true;
  await page.until(MARK_PINNED, 3000).catch(() => { pinned = false; });
  const markOn = await page.evaluate(`JSON.stringify(${MARK})`).then(JSON.parse);
  check('with the next gate far under the frame, the gate mark is a chevron pinned to the bottom edge',
    pinned, JSON.stringify(markOn));
  check('and it parks above the stick plates rather than on them, as it does for the keyboard',
    pinned && markOn.plateTop !== null && markOn.y <= markOn.plateTop, JSON.stringify(markOn));
  await ev('window.__setCam(null); return 1;');

  section('stick overlay, on a radio: the Settings row turns it off, the choice survives a reload, and the mark comes down');
  const off = await flipRow(false);
  check('paused mid race, Settings has a Stick overlay row, beside Show FPS, and it reads On',
    off.row.paused && off.row.i >= 0 && off.row.before === 'Show FPS' && off.row.value === 'On', JSON.stringify(off.row));
  check('Enter on it is Off, in the row, the settings and storage',
    off.after.setting === false && off.after.stored === false && off.after.value === 'Off', JSON.stringify(off.after));

  await page.evaluate('window.__beforeReload = true; 0');
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await page.until('!window.__beforeReload && window.__shellReady === true', 90000);
  await page.until('!!window.__ui && !!window.__input', 10000);
  const reloaded = await ev(`return JSON.stringify({ setting: ui.settings.stickOverlay, stored: ${stored} });`).then(JSON.parse);
  check('a reload keeps it off', reloaded.setting === false && reloaded.stored === false, JSON.stringify(reloaded));

  await race();
  let down = true;
  await page.until(GIMBALS_DOWN, 3000).catch(() => { down = false; });
  const bits = await ev(`return JSON.stringify({ g: ${GIMBALS}, block: ui.osdSticks.className, air: ui.osdAir.box.className });`).then(JSON.parse);
  check('off, the radio pilot\'s race has no stick boxes, and the Weight slider between them stays',
    down && !/is-off/.test(bits.block) && !/is-off/.test(bits.air), JSON.stringify(bits));
  await ev(CAM_OVER_START);
  pinned = true;
  await page.until(MARK_PINNED, 3000).catch(() => { pinned = false; });
  const markOff = await page.evaluate(`JSON.stringify(${MARK})`).then(JSON.parse);
  check('and with nothing there the mark parks lower, over the corner instruments\' band, not the boxes\' one',
    pinned && markOff.y > markOn.y, JSON.stringify({ on: markOn, off: markOff }));
  await ev('window.__setCam(null); return 1;');

  const on = await flipRow(true);
  check('Enter on the row again is On, and stored',
    on.after.setting === true && on.after.stored === true && on.after.value === 'On', JSON.stringify(on.after));
  await race();
  up = true;
  await page.until(GIMBALS_UP, 3000).catch(() => { up = false; });
  check('and the boxes are back for the radio', up, await page.evaluate(`JSON.stringify(${GIMBALS})`));
}

async function touchPage(page) {
  const ev = (expr) => page.evaluate(`(() => { const ui = window.__ui; const input = window.__input; ${expr} })()`);

  /* --------------------------------------------------------------------
   * 7. Mode 1 on a phone. bug-94da186c, bug-a8cd61db. The setting is one
   *    row in Settings; what has to follow it is the thumb sticks'
   *    captions, the keyboard's throttle keys, the how-to prose and the
   *    gimbals drawn on the calibrate screen. Driven through the row with
   *    the arrow key, which is the way a pilot does it.
   * ------------------------------------------------------------------ */
  section('touch: the stick mode row reaches the thumbs, the keys, the how-to and the drawn gimbals');
  const start = await ev(`
    ${PAST_GATE}
    ui.show('pilot');
    const items = ui.items();
    const i = items.findIndex((it) => it && it.label === 'Stick mode');
    ui.setCursor(i);
    const cap = (side) => { const n = document.querySelector('.touch-zone-' + side + ' .osd-gimbal-cap'); return n ? n.textContent : null; };
    return JSON.stringify({ row: i, mode: ui.settings.stickMode, value: i >= 0 ? items[i].value : null, left: cap('left'), right: cap('right'),
      thrUp: input.throttleKeys.up, mounted: Boolean(document.querySelector('.touch-fly')) });
  `).then(JSON.parse);
  check('the thumb sticks are mounted on a touch device', start.mounted);
  check('there is a Stick mode row in Settings', start.row >= 0, JSON.stringify(start));
  check('it starts on Mode 2, and the plates say so', start.mode === 2 && start.value === 'Mode 2' && start.left === 'Yaw · throttle' && start.right === 'Roll · pitch',
    JSON.stringify(start));
  check('and W is the throttle', start.thrUp === 'KeyW', start.thrUp);
  await page.tap('ArrowLeft');
  let moved = true;
  await page.until('window.__ui.settings.stickMode === 1', 3000).catch(() => { moved = false; });
  check('one arrow left is Mode 1', moved);
  await page.until("document.querySelector('.touch-zone-left .osd-gimbal-cap').textContent === 'Yaw · pitch'", 3000).catch(() => {});
  const after = await ev(`
    const cap = (side) => { const n = document.querySelector('.touch-zone-' + side + ' .osd-gimbal-cap'); return n ? n.textContent : null; };
    ui.show('howto');
    ui.setHowtoSource('touch');
    const dd = Array.from(ui.howtoKeys.querySelectorAll('dd')).map((n) => n.textContent);
    ui.show('pilot');
    return JSON.stringify({ left: cap('left'), right: cap('right'), thrUp: input.throttleKeys.up, thrDown: input.throttleKeys.down,
      inputMode: input.stickMode, howtoLeft: dd[0] || '', howtoRight: dd[1] || '',
      calLeft: ui.calStickLeft.cap.textContent, calRight: ui.calStickRight.cap.textContent,
      osdLeft: ui.osdStickLeft.cap.textContent, osdRight: ui.osdStickRight.cap.textContent,
      value: ui.items()[ui.cursor].value });
  `).then(JSON.parse);
  check('the plates now read yaw and pitch on the left, roll and throttle on the right',
    after.left === 'Yaw · pitch' && after.right === 'Roll · throttle', JSON.stringify(after));
  check('the input manager has the mode and the arrows are the throttle',
    after.inputMode === 1 && after.thrUp === 'ArrowUp' && after.thrDown === 'ArrowDown', JSON.stringify(after));
  check('the how-to for thumbs names the same hands',
    after.howtoLeft.startsWith('Yaw, pitch') && after.howtoRight.startsWith('Roll, throttle'), JSON.stringify([after.howtoLeft, after.howtoRight]));
  check('the calibrate and OSD gimbals are captioned the same way',
    after.calLeft === 'Yaw, pitch' && after.calRight === 'Roll, throttle' && after.osdLeft === 'Yaw, pitch' && after.osdRight === 'Roll, throttle',
    JSON.stringify(after));
  check('and the row reads Mode 1', after.value === 'Mode 1', after.value);
  await page.tap('ArrowRight');
  await page.until('window.__ui.settings.stickMode === 2', 3000).catch(() => {});
  check('one arrow right puts it back', await ev("return ui.settings.stickMode === 2 && input.throttleKeys.up === 'KeyW';"));
}

async function touchLaptopPage(page) {
  const ev = (expr) => page.evaluate(`(() => { const ui = window.__ui; const input = window.__input; ${expr} })()`);
  /* The craft and the screen ride along in every sample, for the one check
   * below that has failed twice in about six full runs and never in five
   * runs of this section alone: "a stick key takes the sticks again" read
   * every channel 0 with the keys holding the sticks. The next failure says
   * whether the craft was flying when it did. */
  const snap = `return JSON.stringify({ ch: input.channels, source: input.source, hand: input.hand,
    overlay: document.getElementById('ui').classList.contains('touch-fly-on'), touchPrimary: input.isTouchPrimary(),
    keyboardPrimary: input.isKeyboardPrimary(), craft: window.__craftState().mode,
    landed: window.__craftState().landed, screen: ui.screen, gimbals: ${GIMBALS} });`;
  /* A key held until the page has answered it, and sampled while it is down.
   * Not for a fixed time: the keyboard's hold clock advances at most 40 ms a
   * poll, so on a busy machine 400 ms of wall time is well under 400 ms of
   * hold, and a fixed wait reads a smaller stick than the same key on a quiet
   * one (0.179 against 0.34 in one run). What is asked is that the keyboard
   * flies at all, so the wait is for the channel and it is generous. */
  const hold = async (code, answered) => {
    const info = keyInfo(code);
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info }, page.sessionId);
    await page.until(`(() => { const input = window.__input; return ${answered}; })()`, 4000).catch(() => {});
    const during = JSON.parse(await ev(snap));
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info }, page.sessionId);
    return during;
  };
  /* A real finger, through the browser's own touch input, so the page gets
   * a pointerdown of type touch and not a synthetic one. */
  const finger = (type, x, y) => page.cdp.send('Input.dispatchTouchEvent',
    { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] }, page.sessionId);

  /* --------------------------------------------------------------------
   * 9. A touchscreen laptop. bug-d1d3f4fb, "keyboard doesn't work it when I
   *    press the keboard it doesn't move anything": a Chromebook, 1366 by
   *    768, Chrome 152, no radio, and 93 seconds flown on the thumb plates
   *    with none on the keys. The plates mount wherever navigator reports
   *    touch points and poll() took their branch and never read a key.
   *    Measured on this page before the fix, holding W, the right arrow and
   *    D with the plates up: every channel read 0. The same page with touch
   *    emulation off read 0.34 for each.
   * ------------------------------------------------------------------ */
  section('a touchscreen laptop: the keys fly with the thumb plates up, and the sticks pass from hand to hand: bug-d1d3f4fb');
  await page.until("(() => { const m = window.__map(); return m.id === 'built' && m.ready; })()", 120000);
  await ev(`${PAST_GATE} ui.mode = 'freestyle'; ui.show('title'); ui.act('fly'); return 1;`);
  await page.until("window.__ui.screen === 'flight' && window.__craftState().mode === 'flight'", 60000);
  await page.sleep(800);
  const start = JSON.parse(await ev(snap));
  check('in flight the thumb plates are up and the thumbs have the sticks, before any key is pressed',
    start.overlay && start.hand === 'thumbs' && start.touchPrimary && start.source === 'the touch sticks', JSON.stringify(start));
  check('and the flight overlay draws no stick boxes over them: on glass the plates are the sticks',
    !start.gimbals.left && !start.gimbals.right, JSON.stringify(start.gimbals));

  const w = await hold('KeyW', 'input.channels.throttle > 0.25');
  check('W raises the throttle: the keyboard flies, with the plates up when it was pressed',
    w.source === 'the keyboard' && w.ch.throttle > 0.25, JSON.stringify(w));
  await page.sleep(300);
  const right = await hold('ArrowRight', 'input.channels.roll > 0.2');
  const yaw = await hold('KeyD', 'input.channels.yaw > 0.2');
  check('the right arrow rolls and D yaws',
    right.ch.roll > 0.2 && yaw.ch.yaw > 0.2, JSON.stringify({ roll: right.ch.roll, yaw: yaw.ch.yaw }));
  await page.sleep(300);
  const keys = JSON.parse(await ev(snap));
  check('the plates go away and the keyboard is the primary, as on a desktop',
    !keys.overlay && !keys.touchPrimary && keys.keyboardPrimary && keys.hand === 'keys', JSON.stringify(keys));
  check('and the stick boxes come up for the keys, as on a desktop',
    keys.gimbals.left && keys.gimbals.right, JSON.stringify(keys.gimbals));

  const before = keys.ch.throttle;
  await finger('touchStart', 683, 300);
  await page.sleep(500);
  await finger('touchEnd');
  await page.until("document.getElementById('ui').classList.contains('touch-fly-on')", 3000).catch(() => {});
  const back = JSON.parse(await ev(snap));
  check('a finger on the glass brings the plates back, and the thumbs are the source again',
    back.overlay && back.hand === 'thumbs' && back.touchPrimary && back.source === 'the touch sticks', JSON.stringify(back));
  check('at the throttle the keys left, with no punch at the change of hand',
    Math.abs(back.ch.throttle - before) < 0.05, `${before} -> ${back.ch.throttle}`);

  const zone = JSON.parse(await ev(`const r = document.querySelector('.touch-zone-right').getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });`));
  await finger('touchStart', zone.x, zone.y);
  await page.sleep(150);
  await finger('touchMove', zone.x + 90, zone.y);
  await page.sleep(250);
  const drag = JSON.parse(await ev(snap));
  await finger('touchEnd');
  check('and a thumb on the plate flies it: roll follows the drag',
    drag.ch.roll > 0.2 && drag.source === 'the touch sticks', JSON.stringify(drag));

  const again = await hold('KeyD', 'input.channels.yaw > 0.2');
  check('and a stick key takes the sticks again, the other way',
    again.hand === 'keys' && again.source === 'the keyboard' && again.ch.yaw > 0.2, JSON.stringify(again));

  /* Waited for rather than sampled with the plates: the frame that brings
   * the plates back decided the boxes a moment before the plates went up. */
  await finger('touchStart', 683, 300);
  await page.sleep(300);
  await finger('touchEnd');
  await page.until("document.getElementById('ui').classList.contains('touch-fly-on')", 3000).catch(() => {});
  let boxesGone = true;
  await page.until(GIMBALS_DOWN, 3000).catch(() => { boxesGone = false; });
  check('and a finger on the glass takes the stick boxes away again, with the plates back',
    boxesGone && await ev("return document.getElementById('ui').classList.contains('touch-fly-on');"),
    await page.evaluate(`JSON.stringify(${GIMBALS})`));
}

async function keyboardPage(page) {
  const ev = (expr) => page.evaluate(`(() => { const ui = window.__ui; const input = window.__input; ${expr} })()`);
  /* A key held for real wall time, which is what the keyboard's hold clock
   * runs on. page.tap is a 30 ms press and cannot hold anything. */
  const hold = async (code, ms) => {
    const info = keyInfo(code);
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info }, page.sessionId);
    await page.sleep(ms);
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info }, page.sessionId);
  };
  const craft = () => ev(`const c = window.__craftState(); return JSON.stringify({ y: c.worldY, vy: c.vel ? c.vel.y : 0,
    landed: c.landed, thr: input.channels.throttle, hover: input.kbHover });`).then(JSON.parse);

  /* --------------------------------------------------------------------
   * 8. The throttle keys. bug-3a7be142, "whenever I press W or S, it
   *    snaps strangely, and doesn't hold position like a real radio",
   *    asking for "an option to toggle snapping, or for the throttle to
   *    hold position". The keys sprang back to 0.22 where the shipped
   *    quad hovers at 0.350, so letting go of W fell out of the sky:
   *    measured through this same flow on the code before the fix, the
   *    quad dropped from 13.6 m to the floor in two and a half seconds.
   *    Both halves: the spring now lands on the measured hover, and the
   *    pilot can choose a throttle that does not spring at all.
   * ------------------------------------------------------------------ */
  /* The front page's whoop card says its pack the way the five inch's
   * says 6S. See 8b below for the OSD. */
  const whoopCard = await ev(`ui.firstRun = false; ui.craftGate = true; ui.show('title');
    const it = ui.items().find((x) => x && x.card === 'race-whoop65');
    const five = ui.items().find((x) => x && x.card === 'race-5inch');
    const out = JSON.stringify({ whoop: it && it.facts, five: five && five.facts });
    ui.craftGate = false;
    return out;`).then(JSON.parse);
  check('the front page whoop card leads with 1S, as the five inch card leads with 6S',
    Array.isArray(whoopCard.whoop) && whoopCard.whoop[0] === '1S' && Array.isArray(whoopCard.five) && whoopCard.five[0] === '6S',
    JSON.stringify(whoopCard));

  /* A browser that CAN show a radio, with none plugged in, is told what it
   * always was. bug-616cc604's words are for Safari and WebKit and nobody
   * else: see radioBlind in src/ui/stickhelp.js. */
  section('a browser that can show a radio, with none plugged in, keeps the ordinary advice');
  /* The menu notice, as in safariPage: asked from Settings, said on Settings. */
  await ev(`${PAST_GATE} ui.show('pilot'); ui.act('choosepad'); return 1;`);
  let plain = true;
  await page.until('/Plug one in, set it to joystick mode, then move it\\./.test(window.__ui.menuNotice.textContent)', 3000)
    .catch(() => { plain = false; });
  check('Choose joystick with no radio, in Chrome: plug one in, joystick mode, then move it, and no word about Safari',
    plain && await ev('return ui.radioBlind === null && !/Safari/.test(ui.menuNotice.textContent);'),
    await ev('return JSON.stringify(ui.menuNotice.textContent);'));
  const none = await ev('return JSON.stringify(ui.bugSnapshot().stick.pads);').then(JSON.parse);
  check('and its report says the API is there and the browser listed nothing, the same as a Safari page reads',
    none.api === true && none.listed === 0 && none.used === 0 && none.list.length === 0, JSON.stringify(none));
  await page.until("window.__ui.menuNotice.textContent === ''", 9000).catch(() => {});

  section('keyboard: the throttle keys spring to the measured hover, or stay put');
  const hand = await ev(`
    ${PAST_GATE}
    const s = ui.settings;
    return JSON.stringify({ kb: input.isKeyboardPrimary(), cap: s.rates.throttleCap, af: s.airframe, w: s.weight, v: s.packVoltage,
      hover: input.kbHover });
  `).then(JSON.parse);
  check('no radio: the keyboard is the stick', hand.kb === true);
  const want = hoverStickPercent(hand.cap, hand.af, hand.w, hand.v) / 100;
  check(`the keys rest at the measured hover for this cap, aircraft, weight and pack, ${want}`,
    Math.abs(hand.hover - want) < 1e-12, JSON.stringify(hand));
  const heavy = await ev(`
    ui.settings.weight = 140;
    ui.writeSettings();
    const at = input.kbHover;
    ui.settings.weight = 100;
    ui.writeSettings();
    return JSON.stringify({ at, back: input.kbHover });
  `).then(JSON.parse);
  check('and the weight slider moves it: heavier hovers higher up the stick',
    Math.abs(heavy.at - hoverStickPercent(hand.cap, hand.af, 140, hand.v) / 100) < 1e-12 && heavy.at > hand.hover
    && Math.abs(heavy.back - hand.hover) < 1e-12, JSON.stringify(heavy));

  const row = await ev(`
    ui.show('pilot');
    const items = ui.items();
    const i = items.findIndex((it) => it && it.label === 'Keyboard throttle');
    ui.setCursor(i);
    return JSON.stringify({ i, before: i > 0 ? items[i - 1].label : null, value: i >= 0 ? items[i].value : null, mode: input.keyThrottle });
  `).then(JSON.parse);
  check('Settings has a Keyboard throttle row, beside Stick mode', row.i >= 0 && row.before === 'Stick mode', JSON.stringify(row));
  check('and it starts on the spring, which is what the keys always did', row.value === 'Springs back' && row.mode === 'hover',
    JSON.stringify(row));
  await page.tap('ArrowRight');
  await page.until("window.__input.keyThrottle === 'hold'", 3000).catch(() => {});
  const held = await ev(`
    const it = ui.items()[ui.cursor];
    const stored = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').keyThrottle;
    ui.show('howto');
    ui.setHowtoSource('keyboard');
    const dt = Array.from(ui.howtoKeys.querySelectorAll('dt')).map((n) => n.textContent);
    const dd = Array.from(ui.howtoKeys.querySelectorAll('dd')).map((n) => n.textContent);
    ui.show('pilot');
    return JSON.stringify({ value: it.value, mode: input.keyThrottle, stored, ws: dd[dt.indexOf('W and S')] || '' });
  `).then(JSON.parse);
  check('one arrow right is Stays put, in the keys and in storage',
    held.value === 'Stays put' && held.mode === 'hold' && held.stored === 'hold', JSON.stringify(held));
  check('and the how-to says so', /stays where you leave it/.test(held.ws), held.ws);
  await page.tap('ArrowLeft');
  await page.until("window.__input.keyThrottle === 'hover'", 3000).catch(() => {});
  check('one arrow left is the spring again', await ev("return input.keyThrottle === 'hover' && ui.settings.keyThrottle === 'hover';"));

  /* Into a real race, on the start line, through the Race room and the
   * launch card, which is how a pilot gets there. */
  const seat = await ev(`
    ui.mode = 'race';
    ui.show('courses');
    ui.act('local:${KEY_TRACK.id}');
    return JSON.stringify({ map: ui.settings.map, screen: ui.screen });
  `).then(JSON.parse);
  check('the saved track seats', seat.map === 'custom', JSON.stringify(seat));
  /* The world swap is asynchronous. Flying before it lands flies the world
   * that was there before, which is freestyle, and every check below would
   * be reading the wrong branch. */
  const RACE_READY = "(() => { const m = window.__map(); return m.id === 'custom' && m.ready && m.mode !== 'freestyle' && m.gates > 0; })()";
  let raceReady = true;
  await page.until(RACE_READY, 60000).catch(() => { raceReady = false; });
  check('and the world it builds is a race with gates', raceReady, await page.evaluate('JSON.stringify(window.__map())').catch(() => ''));
  await ev("ui.act('fly'); return ui.screen;");
  await page.until("window.__ui.screen === 'launch'", 20000);
  await page.tap('Enter');
  await page.until("window.__ui.screen === 'flight' && window.__craftState().mode === 'flight'", 60000);
  await page.sleep(1000);

  /* --------------------------------------------------------------------
   * 8b. The whoop says 1S. bug-eb0552d6, "6S Whoops": "The battery voltage
   *     displays 25v at the start of the race." The owner: make the whoop
   *     say 1S and 4.2 V, and do not change the physics at all. Read on the
   *     start line, charged and at rest, beside the plant's own number.
   * ------------------------------------------------------------------ */
  section('keyboard: the whoop says a 1S pack, 4.2 volts charged, over the same 6S plant');
  const pack = await ev(`const c = window.__craftState();
    return JSON.stringify({ osd: ui.osdPack.textContent, plant: c.packVolts, landed: c.landed, perCell: ui.settings.packVoltage });`)
    .then(JSON.parse);
  check('charged, on the start line, the OSD reads 4.2 volts', pack.osd === '4.2 volts' && pack.perCell === 4.2 && pack.landed,
    JSON.stringify(pack));
  check('and the plant under it still holds its 6S pack, about 25.2 volts: only the display changed',
    Math.abs(pack.plant - 25.2) < 0.1, JSON.stringify(pack));

  /* --------------------------------------------------------------------
   * 9. Angle or Acro from the keyboard. bug-92007f3e, "Using m+k
   *    freestyle mode defaults to acro while the race courses default to
   *    angle. If there is a key to swap between modes on the keyboard I
   *    haven't found it." There was none: racing on keys forced Angle.
   *    M flips whichever choice is flying and keeps it.
   * ------------------------------------------------------------------ */
  section('keyboard: M switches Angle and Acro in flight, and keeps the choice');
  const race0 = await ev("return JSON.stringify({ mode: window.__flightMode(), krm: ui.settings.keyRaceMode, fm: ui.settings.flightMode });")
    .then(JSON.parse);
  check('racing on keys starts in Angle, as it always has', race0.mode === 'angle' && race0.krm === 'angle', JSON.stringify(race0));
  await page.tap('KeyM');
  /* The mode flips inside the key handler; the banner is painted by the
   * next frame, which is a hundred milliseconds away on this rasteriser. */
  await page.until("window.__flightMode() === 'acro' && /^ACRO/.test(window.__craftState().banner)", 3000).catch(() => {});
  const race1 = await ev(`return JSON.stringify({ mode: window.__flightMode(), krm: ui.settings.keyRaceMode, fm: ui.settings.flightMode,
    stored: JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').keyRaceMode, banner: window.__craftState().banner });`)
    .then(JSON.parse);
  check('M is Acro, and the keyboard racing choice is saved', race1.mode === 'acro' && race1.krm === 'acro' && race1.stored === 'acro',
    JSON.stringify(race1));
  check('the Flight mode row is left alone, because it is not what a race on keys reads', race1.fm === race0.fm, JSON.stringify(race1));
  check('and the pilot is told, in words', /^ACRO/.test(race1.banner), JSON.stringify(race1.banner));
  await page.tap('KeyM');
  await page.until("window.__flightMode() === 'angle'", 3000).catch(() => {});
  check('M again is Angle', await ev("return window.__flightMode() === 'angle' && ui.settings.keyRaceMode === 'angle';"));
  const probe = await ev('return JSON.stringify(ui.bugSnapshot().stick);').then(JSON.parse);
  check('a report says what was flying and what the keys were set to, inside the stick block',
    probe.flying === 'angle' && probe.keyRaceMode === 'angle' && probe.keyThrottle === 'hover'
    && Math.abs(probe.keyHover - hand.hover * 100) < 0.05, JSON.stringify(probe));

  section('keyboard: let go of W in the air and the quad holds height');
  await hold('KeyW', 1000);
  await page.sleep(500);
  const let0 = await craft();
  check('let go in the air, the throttle rests on the measured hover', !let0.landed && let0.thr === let0.hover, JSON.stringify(let0));
  await page.sleep(2500);
  const let1 = await craft();
  /* Before the fix this read 0.22 on the stick and minus six to minus
   * eleven metres a second on the way down. */
  check('three seconds on, it is still flying and has stopped climbing or sinking',
    !let1.landed && let1.thr === let1.hover && Math.abs(let1.vy) < 1.5, JSON.stringify(let1));

  await ev("ui.settings.keyThrottle = 'hold'; ui.writeSettings(); return input.keyThrottle;");
  await hold('KeyS', 300);
  const put0 = await craft();
  await page.sleep(1500);
  const put1 = await craft();
  check('on Stays put, a throttle key let go leaves the stick exactly where it was',
    put0.thr < let1.thr && put1.thr === put0.thr, `${let1.thr} -> ${put0.thr} -> ${put1.thr}`);
  await ev("ui.settings.keyThrottle = 'hover'; ui.writeSettings(); return input.keyThrottle;");

  /* --------------------------------------------------------------------
   * 10. The roof, and then the floor. Flying these checks by hand found it:
   *     held under the room's ceiling at full throttle the whoop is a
   *     thrash, the catch calls a crash, and the recovery, which then looked
   *     for clear air 0.6 m up first, found it on top of a ceiling slab
   *     0.343 m thick. Measured through this flow: pinned at 13.65 m, put
   *     back at 14.32 m over a roof whose top is 14.06 m, and sitting on it.
   *     Since 24 September a recovery sets the craft down on a flat
   *     surface, the owner's rule, and under this ceiling that is the floor.
   *
   *     Driven through X, the pilot's own unstick, which runs the same
   *     recovery, with the whoop pinned by a radio's throttle under the
   *     thrash throttle so that only X can fire. Not through the catch:
   *     whether a thrash confirms depends on how the contact flickers at the
   *     page's frame rate, and it fired in seven runs of eight here. A check
   *     that fires seven times in eight is not a check.
   * ------------------------------------------------------------------ */
  section('keyboard: X under the ceiling sets the whoop down on the room\'s floor, not on the roof');
  /* The room stands on the ground at zero. The pinned height below is what
   * says so: pinned anywhere else, it fails. */
  const ceiling = ROOM_HEIGHT * MICRO_SCALE;
  const lean = Math.round((hand.hover + THRASH_THROTTLE) * 50) / 100;
  await page.evaluate(`window.__stick(0, 0, 0, ${lean}); 0`);
  /* Not still: held there, it bounces between 13.54 and 13.65 m at up to
   * half a metre a second, measured frame by frame, so pinned is a height.
   * The wait is long because it is wall clock and the climb is sim clock,
   * which a busy machine slows: with four browsers here it took longer
   * than 15 s. */
  let pinned = null;
  await page.until(`window.__craftState().worldY > ${ceiling - 0.3}`, 60000)
    .then(async () => {
      await page.sleep(1500);
      pinned = await ev('const c = window.__craftState(); return JSON.stringify({ y: c.worldY, crashed: c.crashed });').then(JSON.parse);
    })
    .catch(() => {});
  check(`a radio's ${lean} throttle holds it against the ceiling, and nothing calls a crash`,
    Boolean(pinned) && !pinned.crashed && pinned.y > ceiling - 0.3 && pinned.y < ceiling,
    `${JSON.stringify(pinned)} under a ${ceiling.toFixed(3)} m ceiling`);
  /* Released, the override hands its throttle to the keys where it left
   * it, and a key nobody has pressed does not spring it: still pinned, and
   * now it is the keys a recovery has to put back at idle. */
  await page.evaluate('window.__stick(); 0');
  /* Every frame, in the page, from the key on. */
  const TRACE = (ms) => `window.__roofTrace = (async () => {
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < ${ms}) {
      await new Promise((r) => requestAnimationFrame(r));
      const c = window.__craftState();
      out.push({ y: c.worldY, landed: c.landed, crashed: c.crashed, thr: window.__input.channels.throttle });
    }
    return out;
  })(); 0`;
  await page.evaluate(TRACE(3000));
  await page.tap('KeyX');
  const roofTrace = await page.evaluate('window.__roofTrace');
  const setAt = roofTrace.findIndex((f) => f.y < 1);
  const afterSet = setAt < 0 ? [] : roofTrace.slice(setAt);
  const highest = Math.max(...roofTrace.map((f) => f.y));
  check('X sets it down on the floor, landed, and it stays there, never having been on the roof',
    afterSet.length > 0 && afterSet.every((f) => f.landed && !f.crashed && f.y < 0.3 && f.thr === 0) && highest < ceiling,
    afterSet.length ? `set down at ${afterSet[0].y.toFixed(3)}, ${afterSet.length} frames, landed throughout `
      + `${afterSet.every((f) => f.landed)}, highest ${highest.toFixed(3)}` : `never came down, highest ${highest.toFixed(3)}`);

  /* --------------------------------------------------------------------
   * 11. Set down anywhere, and fly on. X in a full throttle climb, in the
   *     open, metres under the ceiling where nothing is touched and no
   *     catch can fire, with the stick at the top and handed to the keys:
   *     a throttle key's pilot with W held. The recovery parks the whoop on
   *     the floor under it with the keys at idle, as R leaves them, and W
   *     takes it off again.
   *
   *     And the receiver's held frame, read in the same task as the key,
   *     before any frame can fly it. It was never reset, so the first block
   *     after a reset flew on the stick from before it: a whoop held against
   *     the ceiling at full throttle came out of a mid air recovery at
   *     3 m/s upward. A parked craft does not fly until it takes off, but
   *     the frame it takes off on should be the sticks it has, not the ones
   *     it crashed with.
   * ------------------------------------------------------------------ */
  section('keyboard: after X in the air, the whoop is parked on the floor under it, keys at idle, and W flies it again');
  await page.evaluate('window.__stick(0, 0, 0, 1); 0');
  let climbing = false;
  await page.until('(() => { const c = window.__craftState(); return c.worldY > 7 && c.vel && c.vel.y > 1; })()', 60000)
    .then(() => { climbing = true; }).catch(() => {});
  await page.evaluate('window.__stick(); 0');
  await page.until('window.__input.channels.throttle === 1', 3000).catch(() => {});
  /* Read here, not from the trace: the key can land before its first frame. */
  const before = await ev(`const c = window.__craftState(); return JSON.stringify({ y: c.worldY, vy: c.vel ? c.vel.y : 0,
    thr: input.channels.throttle, kb: input.isKeyboardPrimary() });`).then(JSON.parse);
  await page.evaluate(TRACE(2500));
  /* X through the window's own key listener, and the held frame read in the
   * same task. */
  const heldAtX = await page.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', key: 'x' }));
    const h = window.__stickPath().held;
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x' }));
    return JSON.stringify(h);
  })()`).then(JSON.parse);
  const parkTrace = await page.evaluate('window.__roofTrace');
  check('climbing at full throttle on the keys, in the open, when X goes',
    climbing && before.kb && before.thr === 1 && before.vy > 1 && before.y < ceiling - 0.5, JSON.stringify(before));
  check('the receiver\'s held frame after the recovery is idle, not the full stick from before it',
    heldAtX.throttle === 0 && heldAtX.roll === 0 && heldAtX.pitch === 0 && heldAtX.yaw === 0, JSON.stringify(heldAtX));
  const parkedAt = parkTrace.findIndex((f) => f.landed);
  const parked = parkedAt < 0 ? [] : parkTrace.slice(parkedAt);
  check('set down on the floor under it, landed, and it stays down with the keys at idle',
    parked.length > 0 && parked.every((f) => f.landed && f.y < 0.3 && f.thr === 0),
    parked.length ? `parked at ${parked[0].y.toFixed(3)} for ${parked.length} frames, `
      + `throttle ${[...new Set(parked.map((f) => f.thr))].join(' ')}` : `never landed: ${JSON.stringify(parkTrace.slice(-2))}`);
  /* W held until it is off the floor, not for a set time: the key's clock
   * is the wall's and the climb is the sim's. */
  const wKey = keyInfo('KeyW');
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...wKey }, page.sessionId);
  let flewAgain = false;
  await page.until('(() => { const c = window.__craftState(); return !c.landed && c.worldY > 1; })()', 20000)
    .then(() => { flewAgain = true; }).catch(() => {});
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...wKey }, page.sessionId);
  check('and W takes it off again from where it was set down', flewAgain,
    await ev('const c = window.__craftState(); return JSON.stringify({ y: c.worldY, landed: c.landed, thr: input.channels.throttle });'));

  /* R is still the start line with the stick at idle. */
  await page.tap('KeyR');
  await page.until('window.__craftState().landed', 10000).catch(() => {});
  await page.sleep(1500);
  const line = await ev('const c = window.__craftState(); return JSON.stringify({ landed: c.landed, thr: input.channels.throttle, air: input.kbAir });')
    .then(JSON.parse);
  check('R puts it on the start line, parked, with the keys at idle', line.landed && line.thr === 0 && !line.air, JSON.stringify(line));

  /* --------------------------------------------------------------------
   * 10. The sound. bug-453fb074, "SOUND JUST STOPPED WORKING", a Mac and a
   *     radio. A browser suspends the audio context for its own reasons and
   *     nothing asked for it back. Measured on this page before the fix:
   *     suspending it, then pressing a key and clicking, left it suspended
   *     with its clock stopped, for good, while the settings said sound was
   *     on. The rule itself is in scripts/music-selftest.js; this is the
   *     shell's wiring of it.
   * ------------------------------------------------------------------ */
  section('sound: a context the browser takes away is asked back, by a gesture, by itself and on the tab coming forward: bug-453fb074');
  const audioState = () => page.evaluate('window.__audio && window.__audio.ctx ? window.__audio.ctx.state : "none"');
  /* `spent` is the browser that will not resume without a gesture: the
   * allowance for asking on its own is used up first. */
  const suspend = (spent) => page.evaluate(`(async () => { const a = window.__audio; ${spent ? 'a.selfWakes = 99;' : ''}
    await a.ctx.suspend(); return 1; })()`);
  const running = (ms = 3000) => page.until('window.__audio.ctx.state === "running"', ms).then(() => true, () => false);
  check('the page has an audio context and it is running, to start from', await audioState() === 'running', await audioState());

  await suspend(false);
  check('suspended with no gesture at all, as a radio pilot flies: it comes back on its own', await running(), await audioState());

  await suspend(true);
  const suspendedNow = await audioState();
  await page.cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: 300, y: 300, button: 'left', clickCount: 1,
  }, page.sessionId);
  await page.cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: 300, y: 300, button: 'left', clickCount: 1,
  }, page.sessionId);
  check('a browser that will not resume unasked: a click brings it back',
    suspendedNow === 'suspended' && await running(), `${suspendedNow} then ${await audioState()}`);

  await suspend(true);
  await page.tap('KeyK');
  check('and so does a key', await running(), await audioState());

  await suspend(true);
  await page.evaluate("document.dispatchEvent(new Event('visibilitychange')), 1");
  check('and the tab coming back to the front', await running(), await audioState());

  const report = await page.evaluate('JSON.stringify(window.__perfProbe().audio)').then(JSON.parse);
  check('a bug report says what the context is doing, and whether the pilot has sound on',
    report.state === 'running' && report.on === true && report.sound === true && typeof report.volume === 'number', JSON.stringify(report));

  /* --------------------------------------------------------------------
   * 11. The stick overlay on the keys. They always had the boxes; the
   *     setting of 2026-10-06 has to be able to take them away here too,
   *     and the gate mark has to follow it both ways. The radio's half is
   *     overlayRadioPage.
   * ------------------------------------------------------------------ */
  section('stick overlay, on the keys: up by default, Off takes them away here too, and the gate mark follows');
  let kbUp = true;
  await page.until(GIMBALS_UP, 3000).catch(() => { kbUp = false; });
  const kbState = await ev(`return JSON.stringify({ g: ${GIMBALS}, setting: ui.settings.stickOverlay, kb: input.isKeyboardPrimary(),
    screen: ui.screen });`).then(JSON.parse);
  check('in the race on the keys, both stick boxes are drawn', kbUp && kbState.setting === true && kbState.kb, JSON.stringify(kbState));
  await ev(CAM_OVER_START);
  let kbPinned = true;
  await page.until(MARK_PINNED, 3000).catch(() => { kbPinned = false; });
  const kbOn = await page.evaluate(`JSON.stringify(${MARK})`).then(JSON.parse);
  check('the gate mark, pinned to the bottom edge, parks above the stick plates',
    kbPinned && kbOn.plateTop !== null && kbOn.y <= kbOn.plateTop, JSON.stringify(kbOn));
  await ev('ui.settings.stickOverlay = false; ui.writeSettings(); return 1;');
  let kbDown = true;
  await page.until(GIMBALS_DOWN, 3000).catch(() => { kbDown = false; });
  check('Off takes the keyboard\'s boxes away too', kbDown, await page.evaluate(`JSON.stringify(${GIMBALS})`));
  let kbLower = true;
  await page.until(`(() => { const m = ${MARK}; return m.edge && m.y > ${kbOn.y}; })()`, 3000).catch(() => { kbLower = false; });
  check('and the mark comes down to the corner instruments\' band', kbLower,
    await page.evaluate(`JSON.stringify(${MARK})`));
  await ev('window.__setCam(null); ui.settings.stickOverlay = true; ui.writeSettings(); return 1;');
  kbUp = true;
  await page.until(GIMBALS_UP, 3000).catch(() => { kbUp = false; });
  check('and On brings them back', kbUp, await page.evaluate(`JSON.stringify(${GIMBALS})`));
}

async function freestylePage(page) {
  const ev = (expr) => page.evaluate(`(() => { const ui = window.__ui; ${expr} })()`);

  /* --------------------------------------------------------------------
   * 12. The town that did not load. bug-850375dc: "got stuck on this
   *     screen while loading freestyle map", sent from the Freestyle room
   *     with the track seated. The town's load failed, the swap put the
   *     track back under a pilot still in freestyle, and Fly opened a room
   *     that stopped drawing cards when it was down to one world. Failed
   *     here the way a dropped connection fails it, once: the first
   *     request for the town's module is reset, the second is served.
   *     The pilot has flown the town before (freestyleMap 'city'): with
   *     Your map there are two freestyle worlds, and with none remembered
   *     the gate opens the picker instead of loading the town, whose card
   *     preview (orbit.html in an iframe) would then take the dropped
   *     request and the page itself would never see it fail. The title's
   *     row is labelled Map since the second world arrived.
   * ------------------------------------------------------------------ */
  section('freestyle: a town that failed to load leaves a way in, not a room with nothing to press');
  let townRequests = 0;
  page.cdp.onEvent((msg) => {
    if (msg.sessionId === page.sessionId && msg.method === 'Fetch.requestPaused'
      && /\/src\/maps\/city\/index\.js/.test(msg.params.request.url)) {
      townRequests += 1;
      if (townRequests === 1) {
        page.cdp.send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'ConnectionReset' }, page.sessionId)
          .catch(() => {});
      }
    }
  });
  await page.cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: 'https://cdn.jsdelivr.net/*' }, { urlPattern: '*/src/maps/city/index.js*' }],
  }, page.sessionId);
  const cards = await ev('return JSON.stringify(ui.items().map((it) => it && it.action));').then(JSON.parse);
  await ev(`ui.setCursor(${cards.indexOf('way-freestyle-5inch')}); return 1;`);
  await page.tap('Enter');
  /* Settled: the fallback has built the track and adopted it. */
  await page.until(`(() => { const m = window.__map(); const ui = window.__ui;
    return m.ready && m.id === 'custom' && ui.settings.map === 'custom' && !!ui.loadFailure; })()`, 60000).catch(() => {});
  const left = await ev(`const town = ui.items().find((x) => x && x.label === 'Map');
    return JSON.stringify({ mode: ui.mode, map: ui.settings.map, screen: ui.screen,
      value: town && town.value, note: town && town.note, failure: ui.bugSnapshot().loadFailure || null });`).then(JSON.parse);
  check('the failed town leaves freestyle with the track under it, the state the ticket was sent from',
    townRequests === 1 && left.mode === 'freestyle' && left.map === 'custom', JSON.stringify({ townRequests, ...left }));
  check('the town row says it did not load, and what Fly will do about it',
    left.value === 'Not loaded' && /did not load\. Fly reloads the page and tries again/.test(left.note || ''), JSON.stringify(left));
  check('a report carries the failure: the town, and the error the browser gave',
    !!left.failure && left.failure.map === 'city' && /dynamically imported module/.test(left.failure.message),
    JSON.stringify(left.failure));
  await ev("ui.act('freestyle'); return 1;");
  const room = await ev("return JSON.stringify({ screen: ui.screen, actions: ui.items().map((it) => it && it.action) });").then(JSON.parse);
  check('the Freestyle room has the town\'s card in it to press, where it had only Scoring, Quad, Physics model and Back',
    room.screen === 'freestyle' && room.actions.includes('map:city'), JSON.stringify(room));
  await ev("ui.show('title'); return 1;");
  const before = await page.evaluate('performance.timeOrigin');
  await ev("ui.act('fly'); return 1;");
  let reloaded = true;
  await page.until(`performance.timeOrigin !== ${before} && window.__shellReady === true`, 90000).catch(() => { reloaded = false; });
  await page.until("(() => { const m = window.__map(); return m.ready && m.id === 'city'; })()", 60000).catch(() => {});
  const after = await ev("return JSON.stringify({ map: ui.settings.map, built: window.__map().id, ready: window.__map().ready });")
    .then(JSON.parse);
  check('Fly reloads the page, the town is asked for again, and the new page builds it',
    reloaded && townRequests === 2 && after.map === 'city' && after.built === 'city' && after.ready, JSON.stringify({ reloaded, townRequests, ...after }));
}

/*
 * The builder's Fly this map, walked from the builder's own button. The
 * owner, 2026-09-25: "fix the flow from fly this map, to be actually
 * starting the map, it bumps me back to the fly menu, the my map etc". The
 * link named the map and not the aircraft, so the gate opened on every
 * visit, and nothing after it flew: three presses to the air. The pilot
 * here last flew the whoop and comes in the way the Freestyle room's Build
 * a freestyle map row sends them, ?mode=freestyle, so the builder's reseat
 * of the five inch is part of what is checked. Seeded once per tab,
 * because the page navigates and reloads.
 */
const FLY_MAP = { ...starterMap(), id: 'trk-f1e5ea9e', name: 'Fly this map check' };
const FLY_MAP_SEED = `try {
  if (!sessionStorage.getItem('check.flymap.seeded')) {
    sessionStorage.setItem('check.flymap.seeded', '1');
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.airframe = 'whoop65';
    s.airframeAsked = true;
    s.map = 'custom';
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.trackbuilder.autosave.freestyle.v1', ${JSON.stringify(JSON.stringify(FLY_MAP))});
    localStorage.setItem('webfpv.trackbuilder.canvas.v1', 'freestyle');
  }
} catch (e) { /* Storage refused. The builder then opens blank, and the checks say so. */ }`;

/*
 * The builder's Fly this track, the race half of the same press. The owner,
 * 2026-09-26: "when i click fly this track from the builder i should go
 * straight to the starting blocks not the initial menu". Its link was a
 * bare ?map=custom, so the pilot landed on the title and then the launch
 * card: two presses between the builder and the grid. The pilot here last
 * flew a freestyle map on the whoop, so the map in the settings is not the
 * one the link names, and the track is a whoop track, so the aircraft the
 * link names is read from the document's class.
 */
const FLY_TRACK = {
  ...presetsForClass('micro')[0],
  id: 'trk-f1e5ea7c',
  name: 'Fly this track check',
  modifiedUtc: '2026-09-26T00:00:00.000Z',
};
const FLY_TRACK_SEED = `try {
  if (!sessionStorage.getItem('check.flytrack.seeded')) {
    sessionStorage.setItem('check.flytrack.seeded', '1');
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.airframe = 'whoop65';
    s.airframeAsked = true;
    s.map = 'built';
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.trackbuilder.autosave.micro.v1', ${JSON.stringify(JSON.stringify(FLY_TRACK))});
    localStorage.setItem('webfpv.trackbuilder.canvas.v1', 'micro');
  }
} catch (e) { /* Storage refused. The builder then opens blank, and the checks say so. */ }`;

async function flyMapPages() {
  /* ----------------------------------------------------------------------
   * 13. Fly this map, from the builder to the air in the one press.
   * -------------------------------------------------------------------- */
  section('fly this map: the builder\'s button puts the pilot in the air on that map, with no menu between');
  let page = await openPage({ root, width: 1280, height: 720, url: '/src/trackbuilder/index.html?mode=freestyle', seed: [SETTINGS_SEED, FLY_MAP_SEED] });
  try {
    await page.until('!!window.trackBuilder', 60000).catch(() => {});
    const builder = await page.evaluate(`(() => { const app = window.trackBuilder;
      return JSON.stringify({ mode: app && app.doc.mode, name: app && app.doc.name, fly: app && app.flyBtn && app.flyBtn.textContent }); })()`).then(JSON.parse);
    check('the builder opens the seeded map, and its button says Fly this map',
      builder.mode === 'freestyle' && builder.name === FLY_MAP.name && builder.fly === 'Fly this map', JSON.stringify(builder));
    await page.evaluate('(() => { window.trackBuilder.flyBtn.click(); return 1; })()');
    await page.until("window.__shellReady === true && window.__mode === 'flight'", 120000).catch(() => {});
    const air = await page.evaluate(`(() => { const ui = window.__ui; const m = window.__map ? window.__map() : null;
      return JSON.stringify({ shell: window.__mode || null, screen: ui && ui.screen, world: m && m.id, source: m && m.source,
        name: m && m.name, airframe: ui && ui.settings.airframe, search: location.search }); })()`).then(JSON.parse);
    check('it lands in the air on the map it was pressed on, with no press between, on the five inch',
      air.shell === 'flight' && air.screen === 'flight' && air.world === 'built' && air.source === 'canvas'
        && air.name === FLY_MAP.name && air.airframe === '5inch', JSON.stringify(air));
    check('the one time fly=1 is gone from the address, and the map and the aircraft stay',
      air.search === '?map=built&craft=5inch', JSON.stringify(air));
    await page.evaluate('(() => { location.reload(); return 1; })()').catch(() => {});
    await page.until("window.__shellReady === true && !!window.__ui && window.__mode === 'title'", 120000).catch(() => {});
    const back = await page.evaluate(`(() => { const ui = window.__ui;
      return JSON.stringify({ shell: window.__mode || null, screen: ui && ui.screen, gate: ui && ui.onGate(), map: ui && ui.settings.map }); })()`).then(JSON.parse);
    check('a reload is a pilot reloading: the title, with the gate answered, not the air again',
      back.shell === 'title' && back.screen === 'title' && back.gate === false && back.map === 'built', JSON.stringify(back));
    const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the fly this map pages', uncaught.length === 0, uncaught.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }

  /* ----------------------------------------------------------------------
   * 14. The same link when the map fails to load. main.js puts the track
   *     back under the pilot and says why; fly=1 must not then fly the
   *     track, which nobody asked for.
   * -------------------------------------------------------------------- */
  section('fly this map: a linked map that fails to load leaves the pilot on the title, not in the track put back');
  page = await openPage({ root, width: 1280, height: 720, url: '/index.html?map=built&craft=5inch&fly=1', seed: [SETTINGS_SEED] });
  try {
    let builtRequests = 0;
    page.cdp.onEvent((msg) => {
      if (msg.sessionId === page.sessionId && msg.method === 'Fetch.requestPaused'
        && /\/src\/maps\/built\/index\.js/.test(msg.params.request.url)) {
        builtRequests += 1;
        page.cdp.send('Fetch.failRequest', { requestId: msg.params.requestId, errorReason: 'ConnectionReset' }, page.sessionId)
          .catch(() => {});
      }
    });
    await page.cdp.send('Fetch.enable', {
      patterns: [{ urlPattern: 'https://cdn.jsdelivr.net/*' }, { urlPattern: '*/src/maps/built/index.js*' }],
    }, page.sessionId);
    await page.until('window.__shellReady === true && !!window.__ui', 120000).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));
    const left = await page.evaluate(`(() => { const ui = window.__ui; const m = window.__map ? window.__map() : null;
      return JSON.stringify({ shell: window.__mode || null, screen: ui && ui.screen, map: ui && ui.settings.map, world: m && m.id,
        failed: ui && ui.loadFailure ? ui.loadFailure.map : null, search: location.search }); })()`).then(JSON.parse);
    check('the map failed, the track is back under the pilot, and they are on the title, not flying it',
      builtRequests >= 1 && left.failed === 'built' && left.world === 'custom' && left.shell === 'title' && left.screen === 'title'
        && left.search === '?map=built&craft=5inch', JSON.stringify({ builtRequests, ...left }));
  } finally {
    await page.close();
  }

  /* ----------------------------------------------------------------------
   * 15. Fly this track, from the builder to the starting blocks in the one
   *     press: no title, no launch card.
   * -------------------------------------------------------------------- */
  section('fly this track: the builder\'s button puts the pilot on the grid of that track, with no menu or card between');
  page = await openPage({ root, width: 1280, height: 720, url: '/src/trackbuilder/index.html?mode=race', seed: [SETTINGS_SEED, FLY_TRACK_SEED] });
  try {
    await page.until('!!window.trackBuilder', 60000).catch(() => {});
    const builder = await page.evaluate(`(() => { const app = window.trackBuilder;
      return JSON.stringify({ mode: app && (app.doc.mode || 'race'), cls: app && app.doc.trackClass, name: app && app.doc.name,
        fly: app && app.flyBtn && app.flyBtn.textContent }); })()`).then(JSON.parse);
    check('the builder opens the seeded whoop track, and its button says Fly this track',
      builder.mode === 'race' && builder.name === FLY_TRACK.name && builder.fly === 'Fly this track', JSON.stringify(builder));
    await page.evaluate('(() => { window.trackBuilder.flyBtn.click(); return 1; })()');
    await page.until("window.__shellReady === true && window.__mode === 'flight'", 120000).catch(() => {});
    const air = await page.evaluate(`(() => { const ui = window.__ui; const m = window.__map ? window.__map() : null;
      return JSON.stringify({ shell: window.__mode || null, screen: ui && ui.screen, world: m && m.id, map: ui && ui.settings.map,
        name: m && m.name, airframe: ui && ui.settings.airframe, search: location.search }); })()`).then(JSON.parse);
    check('it lands on the grid of the track it was pressed on, with no press between, on the whoop',
      air.shell === 'flight' && air.screen === 'flight' && air.world === 'custom' && air.map === 'custom'
        && air.airframe === 'whoop65', JSON.stringify(air));
    check('the one time fly=1 is gone from the address, and the track and the aircraft stay',
      air.search === '?map=custom&craft=whoop65', JSON.stringify(air));
    const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the fly this track pages', uncaught.length === 0, uncaught.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

/*
 * The gate's fourth card and the builder's chooser behind it. The owner,
 * 2026-09-25: "on this page i want a 4th box - map builder", and in the
 * builder, make the switch between 5 inch, whoop and freestyle "way more
 * prominant ... by offering an modal overlay, showing the same three menu
 * boxes wiht images, then if the user clicks on one they get that toggle,
 * retain the current method so the user can change back". Walked the way a
 * pilot walks it: the card on the gate, Enter, the builder's three cards,
 * a pick with the keys, and the switch in the bar changing it back. Then
 * the visits that must NOT be asked, because the way in already said.
 */
const CHOOSER_STATE = `(() => { const app = window.trackBuilder;
  const at = document.activeElement;
  return JSON.stringify({
    path: location.pathname, search: location.search,
    choosing: !!app && typeof app.choosing === 'function' && app.choosing(),
    canvas: app ? (app.doc.mode === 'freestyle' ? 'freestyle' : app.doc.trackClass) : null,
    focus: at && at.dataset ? (at.dataset.canvas || null) : null,
    cards: [...document.querySelectorAll('.tb-choose-card .tb-choose-name')].map((n) => n.textContent),
    imgs: [...document.querySelectorAll('.tb-choose-shot')].map((i) => i.naturalWidth),
    bar: [...document.querySelectorAll('.tb-class-btn.on')].map((b) => b.textContent),
    armed: app ? app.armed : null, view: app ? app.mode : null,
  }); })()`;

async function builderChooserPages() {
  /* ----------------------------------------------------------------------
   * 15. The gate's Builder card opens the builder, the builder asks
   *     with the gate's three cards, a card does what the switch does, and
   *     the switch still changes it back.
   * -------------------------------------------------------------------- */
  section('the builder: the gate\'s Builder card opens it, and it asks what is being built with the gate\'s three cards');
  let page = await openPage({ root, width: 1280, height: 720, seed: [SETTINGS_SEED] });
  try {
    await page.until('window.__shellReady === true && !!window.__ui && window.__ui.onGate()', 120000).catch(() => {});
    const gate = await page.evaluate(`(() => { const items = window.__ui.items();
      return JSON.stringify({ cards: items.filter((it) => it.card).map((it) => it.label),
        at: items.findIndex((it) => it.action === 'builder') }); })()`).then(JSON.parse);
    /* Builder, its one name since MENUS-PLAN.md 4.1: this card said Map
     * builder and the builder's own bar said Track builder. */
    check('the gate carries a fourth card, Builder, after the three ways in',
      gate.cards.join() === 'Five inch racing,Whoop racing,Freestyle,Builder' && gate.at === 3, JSON.stringify(gate));
    await page.evaluate(`(() => { window.__ui.setCursor(${gate.at}); return 1; })()`);
    await page.tap('Enter');
    await page.until("location.pathname.endsWith('/src/trackbuilder/index.html') && !!window.trackBuilder", 60000).catch(() => {});
    await page.until(`(() => { const shots = [...document.querySelectorAll('.tb-choose-shot')];
      return shots.length > 0 && shots.every((i) => i.complete && i.naturalWidth > 0); })()`, 20000).catch(() => {});
    const asked = await page.evaluate(CHOOSER_STATE).then(JSON.parse);
    check('Enter on it opens the builder with nothing in the address, and the builder asks',
      asked.path.endsWith('/src/trackbuilder/index.html') && asked.search === '' && asked.choosing, JSON.stringify(asked));
    check('the question is the gate\'s three cards, each with its picture loaded',
      asked.cards.join() === 'Five inch racing,Whoop racing,Freestyle' && asked.imgs.length === 3
        && asked.imgs.every((w) => w > 0), JSON.stringify(asked));
    check('the cursor opens on the canvas behind it, the five inch field for a five inch pilot',
      asked.canvas === 'full' && asked.focus === 'full', JSON.stringify(asked));
    await page.tap('KeyG');
    await page.tap('KeyV');
    const held = await page.evaluate(CHOOSER_STATE).then(JSON.parse);
    check('a key pressed at the question does nothing behind it: no tool armed, no 3D view',
      held.choosing && held.armed === null && held.view === '2d', JSON.stringify(held));
    await page.tap('ArrowRight');
    await page.tap('ArrowRight');
    await page.tap('ArrowRight');
    const walked = await page.evaluate(CHOOSER_STATE).then(JSON.parse);
    check('the arrows walk the cards and stop at the last', walked.focus === 'freestyle', JSON.stringify(walked));
    await page.tap('Enter');
    await page.until('!window.trackBuilder.choosing()', 10000).catch(() => {});
    const picked = await page.evaluate(CHOOSER_STATE).then(JSON.parse);
    check('Enter on Freestyle is the switch\'s Freestyle: the map canvas, and the bar says so',
      !picked.choosing && picked.canvas === 'freestyle' && picked.bar.join() === 'Freestyle', JSON.stringify(picked));
    /* Five inch, the switch's words since MENUS-PLAN.md 4.1: it read 5 inch
     * beside Whoop and Freestyle, the only one of the three in figures. */
    const pressed = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.tb-class-btn')]
      .find((x) => x.textContent === 'Five inch');
      if (!b) { return false; }
      b.click();
      return true; })()`).catch(() => false);
    const back = await page.evaluate(CHOOSER_STATE).then(JSON.parse);
    check('the switch in the bar is still there and still changes it back',
      pressed && back.canvas === 'full' && back.bar.join() === 'Five inch' && !back.choosing, JSON.stringify(back));
    await page.evaluate('(() => { location.reload(); return 1; })()').catch(() => {});
    await page.until('!!window.trackBuilder', 60000).catch(() => {});
    const reloaded = await page.evaluate(CHOOSER_STATE).then(JSON.parse);
    check('a reload is the same visit, in the middle of the work, and is not asked again',
      !reloaded.choosing && reloaded.canvas === 'full', JSON.stringify(reloaded));
    const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the chooser pages', uncaught.length === 0, uncaught.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }

  /* ----------------------------------------------------------------------
   * 16. The ways in that have already answered. The Track room's Build a
   *     track says race, the Freestyle room's row says the map, and a
   *     chooser in front of either is a press spent on a decision made on
   *     the page before. Escape on an asked visit keeps what is behind.
   * -------------------------------------------------------------------- */
  section('the builder: a way in that already said is not asked, and Escape keeps what is behind');
  for (const [url, want] of [['?mode=race', 'full'], ['?mode=freestyle', 'freestyle']]) {
    page = await openPage({ root, width: 1280, height: 720, url: `/src/trackbuilder/index.html${url}`, seed: [SETTINGS_SEED] });
    try {
      await page.until('!!window.trackBuilder', 60000).catch(() => {});
      const s = await page.evaluate(CHOOSER_STATE).then(JSON.parse);
      check(`${url} opens its canvas with no question`, !s.choosing && s.canvas === want, JSON.stringify(s));
    } finally {
      await page.close();
    }
  }
  page = await openPage({ root, width: 1280, height: 720, url: '/src/trackbuilder/index.html', seed: [SETTINGS_SEED] });
  try {
    await page.until('!!window.trackBuilder && window.trackBuilder.choosing()', 60000).catch(() => {});
    /* Asked first, or a builder with no question at all passes this. */
    const before = await page.evaluate(CHOOSER_STATE).then(JSON.parse);
    await page.tap('Escape');
    const kept = await page.evaluate(CHOOSER_STATE).then(JSON.parse);
    check('Escape closes the question and keeps the canvas behind it',
      before.choosing && !kept.choosing && kept.canvas === 'full', JSON.stringify({ before: before.choosing, ...kept }));
  } finally {
    await page.close();
  }
}

async function main() {
  const t0 = Date.now();
  let page = null;
  try {
    console.log('booting the shell with a six axis radio');
    page = await bootPage();
    await mousePage(page);
    const uncaught = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the mouse page', uncaught.length === 0, uncaught.slice(0, 3).join(' | '));
    await page.close();
    page = null;

    console.log('\nbooting the shell as a touch device');
    page = await bootPage({ touch: true });
    await touchPage(page);
    const uncaught2 = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the touch page', uncaught2.length === 0, uncaught2.slice(0, 3).join(' | '));
    await page.close();
    page = null;

    console.log('\nbooting the shell as a touchscreen laptop, a Chromebook with no radio');
    page = await bootPage({
      touch: true, width: 1366, height: 768, seed: [TOUCH_LAPTOP_SEED],
    });
    await touchLaptopPage(page);
    const uncaughtL = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the touch laptop page', uncaughtL.length === 0, uncaughtL.slice(0, 3).join(' | '));
    await page.close();
    page = null;

    console.log('\nbooting the shell with no radio, as a keyboard pilot on a whoop race');
    page = await bootPage({ seed: [SETTINGS_SEED, KEYBOARD_SEED] });
    await keyboardPage(page);
    const uncaught3 = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the keyboard page', uncaught3.length === 0, uncaught3.slice(0, 3).join(' | '));
    await page.close();
    page = null;

    console.log('\nbooting the shell as Safari on a Mac, with a radio the browser will not list');
    page = await bootPage({ seed: [SETTINGS_SEED, SAFARI_SEED] });
    await safariPage(page);
    const uncaughtS = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the Safari page', uncaughtS.length === 0, uncaughtS.slice(0, 3).join(' | '));
    await page.close();
    page = null;

    console.log('\nbooting the shell with a TX15, flown and paused');
    page = await bootPage({ seed: [SETTINGS_SEED, TX15_SEED] });
    await pausePage(page);
    const uncaughtP = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the pause page', uncaughtP.length === 0, uncaughtP.slice(0, 3).join(' | '));
    await page.close();
    page = null;

    console.log('\nbooting the shell with a TX15 on a whoop race, for the stick overlay');
    page = await bootPage({ seed: [SETTINGS_SEED, RADIO_RACE_SEED] });
    await overlayRadioPage(page);
    const uncaughtO = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the stick overlay page', uncaughtO.length === 0, uncaughtO.slice(0, 3).join(' | '));
    await page.close();
    page = null;

    console.log('\nbooting the shell as a five inch pilot answering Freestyle, on a connection that drops the town once');
    page = await bootPage({ seed: [SETTINGS_SEED, FREESTYLE_SEED] });
    await freestylePage(page);
    const uncaught4 = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the freestyle page', uncaught4.length === 0, uncaught4.slice(0, 3).join(' | '));
    await page.close();
    page = null;

    console.log('\nopening the builder on a map and pressing Fly this map');
    await flyMapPages();

    console.log('\nopening the builder from the gate\'s fourth card');
    await builderChooserPages();
  } catch (e) {
    check('the run completed', false, String(e && e.stack ? e.stack : e));
    if (page) {
      await page.close().catch(() => {});
    }
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(failed ? `\n${failed} failed, ${passed} passed, ${secs}s` : `\nall ${passed} passed, ${secs}s`);
  for (const f of fails) {
    console.log(`  FAIL ${f}`);
  }
  process.exitCode = failed ? 1 : 0;
}

main();
