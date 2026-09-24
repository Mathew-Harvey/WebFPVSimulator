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
 * all flies a real race on the keys.
 *
 * Not part of `npm run verify`: this says nothing about the flight model.
 * Same shape as lint:shell. Run it on a change to src/input, to the
 * calibrate screen, to the Settings room or to the title's trouble rows.
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
   *    othersParked in input.js.
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
  const plates = `const c = document.querySelector('.pad-card'); const g = c.querySelectorAll('.osd-gimbal');
    const at = (n) => { const s = n.querySelector('.osd-nub').style; return [parseFloat(s.left) || 0, parseFloat(s.top) || 0]; };
    const cap = (n) => n.querySelector('.osd-gimbal-cap');`;
  const pick0 = await ev(`${plates}
    return JSON.stringify({ left: at(g[0]), right: at(g[1]), caps: [cap(g[0]).textContent, cap(g[1]).textContent],
      shown: cap(g[0]).offsetHeight > 0 && cap(g[1]).offsetHeight > 0, hint: ui.padHint.textContent });`).then(JSON.parse);
  check('the plates are captioned the way every other drawn stick is, and the captions show',
    pick0.caps[0] === 'Yaw, throttle' && pick0.caps[1] === 'Roll, pitch' && pick0.shown, JSON.stringify(pick0));
  check('calibrated earlier in this run, it says the sticks follow the saved calibration',
    /saved calibration/.test(pick0.hint), pick0.hint);
  await page.evaluate('window.__pad.axes[0] = 1; window.__pad.timestamp += 1;');
  await page.sleep(300);
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
    return new Promise((done) => setTimeout(() => {
      const hint = ui.padHint.textContent;
      if (kept !== null) { localStorage.setItem(key, kept); }
      input.map = input.loadMap();
      done(JSON.stringify({ hint, restored: input.map.stored }));
    }, 300));
  `).then(JSON.parse);
  check('uncalibrated, it says the picture is a guess and sends the pilot to Calibrate sticks in the room that holds it',
    /a guess until you calibrate/.test(guessHint.hint) && guessHint.hint.includes(`Calibrate sticks in ${signs.roomName}`),
    guessHint.hint);
  check('and the saved mapping is back afterwards', guessHint.restored === true);
  await ev("ui.act('padpick-cancel'); return ui.screen;");
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

    console.log('\nbooting the shell with no radio, as a keyboard pilot on a whoop race');
    page = await bootPage({ seed: [SETTINGS_SEED, KEYBOARD_SEED] });
    await keyboardPage(page);
    const uncaught3 = page.errors.filter((e) => e.startsWith('uncaught:'));
    check('no uncaught exception on the keyboard page', uncaught3.length === 0, uncaught3.slice(0, 3).join(' | '));
    await page.close();
    page = null;
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
