/*
 * builder-flow-check.js: the whoop builder, driven the way a person drives it.
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

/*
 * WHY THIS IS A BROWSER CHECK AND NOT MORE OF THE SELF TEST.
 *
 * src/trackbuilder/selftest.js runs the builder's pure modules in Node, and it
 * cannot see the things a pilot meets first: whether a click in the middle of
 * a gate picks it, whether a number covers the gate it names, whether Fit puts
 * the track on the screen, whether a click that only selects leaves an undo
 * step behind. Every one of those was true of the whoop builder on
 * 2026-09-29 (WHOOP-BUILDER-PLAN.md, section 1), and none of them was visible
 * to any check that existed. This one drives the real page in headless
 * Chromium with real mouse events, the way scripts/device-check.js drives the
 * real menus, and asserts on what came out.
 *
 * It grows a stage at a time with the plan: Stage 0 is the repairs, and the
 * later cases build a track from an empty canvas with the pointer alone.
 *
 * `--root=DIR` runs it against another checkout, which is how a case is shown
 * to fail on the code as it stood before a fix. `--only=NAME` runs one case.
 */

import { openPage, keyInfo } from '../tests/lib/page.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const root = rootArg ? resolve(rootArg.slice('--root='.length)) : HERE;
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : '';

const failures = [];

/* The numbers are printed on a pass as well as on a fail: "62 percent" says
 * how far inside the line a case is, which a bare PASS does not. */
function check(name, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failures.push(name);
  }
}

/* The page's network errors are the board and the counter being unreachable
 * from a container, which is not what this is checking. Anything else the page
 * reports, an uncaught error or a console error of its own, is. */
function ownErrors(page) {
  return page.errors.filter((e) => !/Failed to load resource|net::ERR_/.test(e));
}

/*
 * A whoop canvas opens in the room once Three.js has arrived, by itself, so a
 * case that starts on the plan has to wait for that or the canvas changes under
 * it. `room: false` is for a page where the room is not expected to come.
 */
async function openBuilder(query = '?class=micro', width = 1600, height = 900, { room = true, block = false, touch = false } = {}) {
  const page = await openPage({ root, width, height, url: `/src/trackbuilder/index.html${query}`, block, touch });
  await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
  if (room && /class=(micro|full)/.test(query)) {
    /* Not fatal when it never comes: a checkout from before the room opened by
     * itself (which is how a case is shown to fail before its fix) has no room to
     * wait for, and what a case then finds is its own business. Both race
     * canvases are built in the room, the five inch's since TRACK-BUILDER-5IN-PLAN.md. */
    await page.until("window.trackBuilder.mode === '3d' && !!window.trackBuilder.view3d.renderer", 20000).catch(() => {});
    await page.sleep(300);
  }
  return page;
}

/* Load also lists the shipped tracks, which is noise in a line that is about
 * what somebody's own work turned into. */
const ownTracks = (names) => names.filter((n) => !/^RaceGOW/.test(n)).map((n) => `"${n}"`).join(', ') || 'none of it';

const json = async (page, expression) => JSON.parse(await page.evaluate(`JSON.stringify(${expression})`));

/* A real mouse click: the pointer moves there, presses and lets go, which is
 * three pointer events in the page, the same as a hand. */
async function mouse(page, type, x, y, buttons, mods = 0) {
  await page.cdp.send('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1, modifiers: mods,
  }, page.sessionId);
}

async function click(page, x, y) {
  await mouse(page, 'mouseMoved', x, y, 0);
  await mouse(page, 'mousePressed', x, y, 1);
  await page.sleep(50);
  await mouse(page, 'mouseReleased', x, y, 0);
  await page.sleep(80);
}

/* Two clicks a hand's distance in time apart: the second carries a click count of
 * two, which is what makes the page hear a double click. */
async function doubleClick(page, x, y) {
  await mouse(page, 'mouseMoved', x, y, 0);
  for (const n of [1, 2]) {
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: n }, page.sessionId);
    await page.sleep(40);
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: n }, page.sessionId);
    await page.sleep(60);
  }
  await page.sleep(80);
}

/* Press here, pull through `steps` intermediate points to there, and let go,
 * or stop short of letting go (`hold`) so the page can be looked at mid gesture.
 * `mods` is the modifier mask the protocol wants: Alt 1, Ctrl 2, Meta 4, Shift 8. */
async function drag(page, from, to, { steps = 8, hold = false, mods = 0, button = 'left' } = {}) {
  const send = (type, x, y, buttons) => page.cdp.send('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1, modifiers: mods,
  }, page.sessionId);
  const held = button === 'left' ? 1 : 2;
  await send('mouseMoved', from.x, from.y, 0);
  await send('mousePressed', from.x, from.y, held);
  for (let i = 1; i <= steps; i += 1) {
    await send('mouseMoved', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, held);
    await page.sleep(25);
  }
  if (!hold) {
    await send('mouseReleased', to.x, to.y, 0);
    await page.sleep(120);
  }
}

async function release(page, at) {
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', buttons: 0, clickCount: 1 }, page.sessionId);
  await page.sleep(120);
}

/*
 * Fingers. Real touch events over the protocol, which the browser turns into
 * pointer events with pointerType touch, the same as a screen does. A touch
 * event carries every finger that is down, so a finger is named by an id and
 * the caller says where each one is at each step.
 */
async function touch(page, type, fingers) {
  await page.cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: fingers.map((f) => ({ x: f.x, y: f.y, id: f.id })),
  }, page.sessionId);
}
const at1 = (p) => [{ id: 1, x: p.x, y: p.y }];

async function tap(page, p) {
  await touch(page, 'touchStart', at1(p));
  await page.sleep(60);
  await touch(page, 'touchEnd', []);
  await page.sleep(140);
}

/* One finger down here, pulled to there through `steps` points, and up, or
 * (`hold`) left down so the page can be looked at mid gesture. */
async function swipe(page, from, to, { steps = 8, hold = false } = {}) {
  await touch(page, 'touchStart', at1(from));
  for (let i = 1; i <= steps; i += 1) {
    await touch(page, 'touchMove', at1({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }));
    await page.sleep(25);
  }
  if (!hold) {
    await touch(page, 'touchEnd', []);
    await page.sleep(140);
  }
}

/* Two fingers, each carried from where it is to where it goes, together. */
async function pair(page, from, to, { steps = 8, hold = false } = {}) {
  const at = (i) => [
    { id: 1, x: from[0].x + ((to[0].x - from[0].x) * i) / steps, y: from[0].y + ((to[0].y - from[0].y) * i) / steps },
    { id: 2, x: from[1].x + ((to[1].x - from[1].x) * i) / steps, y: from[1].y + ((to[1].y - from[1].y) * i) / steps },
  ];
  await touch(page, 'touchStart', [at(0)[0]]);
  await touch(page, 'touchStart', at(0));
  for (let i = 1; i <= steps; i += 1) {
    await touch(page, 'touchMove', at(i));
    await page.sleep(25);
  }
  if (!hold) {
    await touch(page, 'touchEnd', []);
    await page.sleep(160);
  }
}

/* A key with modifiers, which the helper's own tap() has no way to send. */
async function key(page, code, mods = 0) {
  const info = keyInfo(code);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info, modifiers: mods }, page.sessionId);
  await page.sleep(30);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info, modifiers: mods }, page.sessionId);
  await page.sleep(80);
}

/* A palette tool, by the words on its button, pressed with the mouse. */
async function tool(page, label) {
  const at = await json(page, `(() => {
    const b = [...document.querySelectorAll('#tb-palette .tb-tool')].find((x) => x.querySelector('.tb-tool-label')?.textContent === ${JSON.stringify(label)});
    if (!b) return null;
    /* A map's palette is longer than the screen: the tool is brought into view as a hand would scroll to it. */
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!at) {
    throw new Error(`no tool called ${label}`);
  }
  await click(page, at.x, at.y);
}

/* Every toast the page raises, kept, because a toast is on screen for four
 * seconds and gone after, and a check that looked afterwards would miss it. */
async function trapToasts(page) {
  await page.evaluate(`(() => {
    const app = window.trackBuilder;
    window.__toasts = [];
    const say = app.toast.bind(app);
    app.toast = (m) => { window.__toasts.push(m); say(m); };
    return 1;
  })()`);
}

const toasts = (page) => json(page, 'window.__toasts');
const undoCount = (page) => page.evaluate('window.trackBuilder.history.past.length');
const elements = (page) => json(page, 'window.trackBuilder.doc.elements.map((e) => ({ id: e.id, type: e.type, x: e.position.x, y: e.position.y, z: e.position.z, yaw: e.yaw, pinned: e.yawOverridden }))');

/* A shipped whoop track, loaded as the working track. */
async function loadPreset(page, id) {
  await page.evaluate(`(async () => {
    const { PRESETS } = await import('/src/trackbuilder/presets.js');
    window.trackBuilder.loadDocument(JSON.parse(JSON.stringify(PRESETS.find((p) => p.id === '${id}'))), '');
    return 1;
  })()`);
}

/*
 * Where a document point is on the page, in viewport pixels, worked out here
 * from the view's own matrices and not by asking the view. A check that asked
 * the view where a gate is would agree with whatever the view believed, and
 * this is checking what a pilot sees; it also has to run against a checkout
 * that has none of the newer methods, which is how a case is shown to fail
 * before its fix. The room's root group is the one place a document point
 * becomes a scene point, so it is asked to.
 */
async function screenOf(page, view, x, y, z = 0) {
  return json(page, `(() => {
    const v = window.trackBuilder.${view};
    const r = v.canvas.getBoundingClientRect();
    if (${view === 'view2d'}) {
      const p = v.toScreen({ x: ${x}, y: ${y} });
      return { x: r.left + p.x, y: r.top + p.y };
    }
    v.applyCamera();
    v.camera.updateMatrixWorld(true);
    v.root.updateMatrixWorld(true);
    const p = new v.camera.position.constructor(${x}, ${y}, ${z});
    v.root.localToWorld(p);
    p.project(v.camera);
    return p.z < -1 || p.z > 1 ? null : { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, w: r.width };
  })()`);
}

async function inThreeD(page) {
  await page.evaluate("window.trackBuilder.setMode('3d'), 1");
  await page.until('!!window.trackBuilder.view3d.renderer && !window.trackBuilder.view3d.dirty', 60000);
  await page.sleep(300);
}

/* ------------------------------------------------------------------ */
/* The cases                                                           */
/* ------------------------------------------------------------------ */

const CASES = [];
const kase = (name, fn) => CASES.push([name, fn]);

/*
 * A CLICK THAT ONLY SELECTS IS NOT AN EDIT. Pressing an element began an undo
 * gesture, and finishing it stamped the track as modified a second after the
 * last stamp, so history recorded a step called "move" and Undo then seemed to
 * do nothing.
 */
kase('select', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track1');
    await page.evaluate("window.trackBuilder.setMode('2d'), 1");
    await page.sleep(1300); /* past a clock second, or a stamp could not differ */
    const t = await json(page, `(() => {
      const app = window.trackBuilder;
      const el = app.doc.elements.find((e) => e.type === 'gate');
      const s = app.view2d.toScreen({ x: el.position.x, y: el.position.y });
      const r = app.view2d.canvas.getBoundingClientRect();
      return { id: el.id, x: r.left + s.x, y: r.top + s.y, past: app.history.past.length, stamp: app.doc.modifiedUtc };
    })()`);
    await click(page, t.x, t.y);
    await page.until(`window.trackBuilder.selection.has('${t.id}')`, 10000);
    const after = await json(page, '({ past: window.trackBuilder.history.past.length, stamp: window.trackBuilder.doc.modifiedUtc })');
    check('a click that only selects a gate is not an undo step', after.past === t.past, `${t.past} steps before, ${after.past} after`);
    check('and does not change the stamp that says when the track last changed', after.stamp === t.stamp, `${t.stamp} then ${after.stamp}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * FIT AND EVERY LOAD FRAME THE TRACK. On 2026-09-29 both views framed the
 * whole 10 by 12 m hall, so a track a metre or two across opened as a small
 * cluster in an empty rectangle.
 */
/* How much of a view's drawing area the loaded track's own extent takes, across,
 * and whether all of it is inside. Measured from the elements' positions and
 * projected by the check itself, see screenOf. */
async function measureExtent(page, view) {
  const corners = await json(page, `(() => {
    const els = window.trackBuilder.doc.elements;
    const xs = els.map((e) => e.position.x);
    const ys = els.map((e) => e.position.y);
    return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.min(...xs), Math.max(...ys)], [Math.max(...xs), Math.max(...ys)]];
  })()`);
  const pts = [];
  for (const [x, y] of corners) {
    pts.push(await screenOf(page, view, x, y, 0));
  }
  const box = await json(page, `(() => { const r = window.trackBuilder.${view}.canvas.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; })()`);
  const left = Math.min(...pts.map((p) => p.x));
  const right = Math.max(...pts.map((p) => p.x));
  const top = Math.min(...pts.map((p) => p.y));
  const bottom = Math.max(...pts.map((p) => p.y));
  const across = (right - left) / (box.r - box.l);
  const tall = (bottom - top) / (box.b - box.t);
  return {
    across,
    tall,
    /* How much of the picture the track takes in its larger direction: a small
     * track in a wide window fills its height and little of its width. */
    fill: Math.max(across, tall),
    inside: left >= box.l && right <= box.r && top >= box.t && bottom <= box.b,
    wide: Math.round(box.r - box.l),
  };
}

kase('fit', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track1');
    await page.evaluate("window.trackBuilder.setMode('2d'), window.trackBuilder.frameAll(), 1");
    await page.sleep(200);
    const plan = await measureExtent(page, 'view2d');
    check('a whoop track loaded on the plan fills at least a third of the picture in its larger direction', plan.fill >= 0.35, `${(plan.fill * 100).toFixed(0)} percent`);
    /* The track was loaded while the plan was showing, so the room's canvas
     * had no size to frame for. Going to it must not leave it framed for a
     * canvas that was not there: no Fit here, on purpose. */
    await inThreeD(page);
    const flipped = await measureExtent(page, 'view3d');
    check('a track loaded on the plan, then seen in the room, is framed there without asking', flipped.fill >= 0.35 && flipped.inside, `${(flipped.fill * 100).toFixed(0)} percent, inside ${flipped.inside}`);
    await page.evaluate('window.trackBuilder.frameAll(), 1');
    await page.sleep(300);
    const room = await measureExtent(page, 'view3d');
    check('and Fit in the room fills as much, all of it in view', room.fill >= 0.35 && room.inside, `${(room.fill * 100).toFixed(0)} percent, inside ${room.inside}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE SAME IN A WINDOW TALLER THAN IT IS WIDE. A camera frames a sphere by its
 * narrower field of view, and a load on the plan frames a canvas that has no
 * size, so it assumed a wide one. In a wide window that is the same answer;
 * in a narrow one the track was framed for a window it was not in and ran off
 * both sides. At 820 wide the builder's canvas is about 320.
 */
kase('fit narrow', async () => {
  const page = await openBuilder('?class=micro', 820, 900);
  try {
    await loadPreset(page, 'racegow5-track1');
    await inThreeD(page);
    const m = await measureExtent(page, 'view3d');
    check('in a narrow window the whole track is in view in the room', m.inside && m.fill >= 0.35, `${(m.fill * 100).toFixed(0)} percent of a picture ${m.wide} px across, inside ${m.inside}`);
  } finally {
    await page.close();
  }
});

/*
 * THE MIDDLE OF A GATE PICKS IT. Only the pipes could be picked in the room,
 * 26.7 mm of PVC that is three or four pixels at any distance that shows a
 * whole track.
 */
kase('pick', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track1');
    await inThreeD(page);
    await page.evaluate('window.trackBuilder.frameAll(), 1');
    await page.sleep(300);
    const gates = await json(page, `window.trackBuilder.doc.elements.filter((e) => e.type === 'gate').map((e) => ({ id: e.id, x: e.position.x, y: e.position.y, z: e.dims.sillH + e.dims.clearH / 2 }))`);
    let picked = 0;
    const missed = [];
    for (const g of gates) {
      await page.evaluate('window.trackBuilder.setSelection([]), 1');
      const at = await screenOf(page, 'view3d', g.x, g.y, g.z);
      if (!at) {
        missed.push(`${g.id} off screen`);
        continue;
      }
      await click(page, at.x, at.y);
      const hit = await page.evaluate(`window.trackBuilder.selection.has('${g.id}')`);
      if (hit) {
        picked += 1;
      } else {
        missed.push(g.id);
      }
    }
    check('a click in the middle of a gate selects it, for most single gates on Track 1', gates.length > 0 && picked / gates.length >= 0.75, `${picked} of ${gates.length}${missed.length ? `, missed ${missed.join(', ')}` : ''}`);
    /* And a centimetre or two outside the side pipe, level with the middle of the
     * gate, where there is neither pipe nor pane: 26.7 mm of PVC is a few pixels
     * from here, and the pipe is picked by a fatter one that is never drawn. (Not
     * above the top pipe: the number hangs there.) */
    let near = 0;
    const onFloor = gates.filter((g) => g.z < 0.4);
    for (const g of onFloor) {
      await page.evaluate('window.trackBuilder.setSelection([]), 1');
      const yaw = await page.evaluate(`window.trackBuilder.doc.elements.find((e) => e.id === '${g.id}').yaw`);
      const out = 0.3556 + 0.0267 + 0.015;
      const beside = await screenOf(page, 'view3d', g.x - out * Math.sin(yaw), g.y + out * Math.cos(yaw), 0.36);
      if (beside) {
        await click(page, beside.x, beside.y);
        if (await page.evaluate(`window.trackBuilder.selection.has('${g.id}')`)) {
          near += 1;
        }
      }
    }
    check('and so does a click a centimetre or two outside the side pipe, of the gates on the floor', onFloor.length > 0 && near === onFloor.length, `${near} of ${onFloor.length}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A NUMBER DOES NOT COVER THE GATE IT NAMES. A whoop's order numbers were 0.33 m
 * tall over a gate 0.71 m across, so at the distance that shows a whole track
 * they were the gates. They are buttons over the canvas now, one size on the
 * screen at any distance, hung above the opening they belong to; what this
 * holds is the promise, and not how it is kept: every number is clear of the
 * opening of its own gate, seen from where a pilot stands.
 */
kase('labels', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track1');
    await inThreeD(page);
    await page.sleep(300);
    const gates = await json(page, `window.trackBuilder.doc.elements.filter((e) => e.type === 'gate' && e.dims.sillH === 0).map((e) => ({ id: e.id, x: e.position.x, y: e.position.y, h: e.dims.clearH }))`);
    const bubbles = await json(page, `[...document.querySelectorAll('.tb-bubble')].map((b) => { const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, cx: r.left + r.width / 2 }; })`);
    check('the numbers are there, one for each pass', bubbles.length >= gates.length && bubbles.length > 0, `${bubbles.length} numbers`);
    check('and each is about 22 px, whatever the distance', bubbles.every((b) => Math.abs(b.height - 22) < 1), bubbles.map((b) => b.height).join(', '));
    let covered = 0;
    for (const g of gates) {
      const top = await screenOf(page, 'view3d', g.x, g.y, g.h);
      const mine = bubbles.filter((b) => Math.abs(b.cx - top.x) < 20);
      if (mine.length && mine.every((b) => b.bottom > top.y + 3)) {
        covered += 1;
      }
    }
    check('no number sits down in the opening of its own gate', covered === 0, `${covered} of ${gates.length} gates have one in the opening`);
  } finally {
    await page.close();
  }
});

/*
 * IMPORT AND A ?track= LINK KEEP WHAT THEY DISPLACE, and a link whose name
 * holds a percent sign opens. Both replaced the canvas with nothing said, and
 * the link threw on the percent sign.
 */
kase('import', async () => {
  const page = await openBuilder();
  try {
    /* Work on the canvas that a file is about to replace. */
    await page.evaluate(`(async () => {
      const m = await import('/src/trackbuilder/model.js');
      const app = window.trackBuilder;
      app.loadDocument(m.createTrack('My work', 'micro'), '');
      app.arm('gate');
      app.placeAt({ x: 4, y: 5, z: 0 });
      app.placeAt({ x: 6, y: 5, z: 0 });
      app.disarm();
      return 1;
    })()`);
    const before = await page.evaluate('window.trackBuilder.doc.elements.length');
    await page.evaluate(`(async () => {
      const { PRESETS } = await import('/src/trackbuilder/presets.js');
      const inc = JSON.parse(JSON.stringify(PRESETS.find((p) => p.id === 'racegow5-track2')));
      inc.id = 'trk-11112222';
      inc.name = 'Incoming';
      await window.trackBuilder.importFile(new File([JSON.stringify(inc)], 'incoming.json', { type: 'application/json' }));
      return 1;
    })()`);
    const result = JSON.parse(await page.evaluate(`(async () => {
      const st = await import('/src/trackbuilder/storage.js');
      return JSON.stringify({
        name: window.trackBuilder.doc.name,
        library: st.listTracks('micro').map((t) => t.name),
        toast: document.getElementById('tb-toast').textContent,
      });
    })()`));
    check('an imported track opens', result.name === 'Incoming', result.name);
    check('and the work it replaced is in Load', before === 2 && result.library.includes('My work'), `${before} elements, Load holds ${ownTracks(result.library)}`);
    check('and the toast says so', /My work/.test(result.toast) && /Load/.test(result.toast), result.toast);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

kase('link', async () => {
  const page = await openBuilder();
  try {
    /* Work on the canvas, flushed to its autosave, then a link opened over it. */
    const url = JSON.parse(await page.evaluate(`(async () => {
      const m = await import('/src/trackbuilder/model.js');
      const app = window.trackBuilder;
      app.loadDocument(m.createTrack('Link work', 'micro'), '');
      app.arm('gate');
      app.placeAt({ x: 5, y: 6, z: 0 });
      app.disarm();
      app.autosaver.flush();
      const linked = m.createTrack('100% linked', 'micro');
      const el = m.createElement(linked, 'gate', { x: 5, y: 6, z: 0 }, 0);
      linked.elements.push(el);
      return JSON.stringify(location.origin + '/src/trackbuilder/index.html?class=micro&track=' + encodeURIComponent(m.serialize(linked)));
    })()`));
    await page.cdp.send('Page.navigate', { url }, page.sessionId);
    await page.until("!!(window.trackBuilder && window.trackBuilder.doc && window.trackBuilder.doc.name === '100% linked')", 15000);
    const result = JSON.parse(await page.evaluate(`(async () => {
      const st = await import('/src/trackbuilder/storage.js');
      return JSON.stringify({
        name: window.trackBuilder.doc.name,
        library: st.listTracks('micro').map((t) => t.name),
        toast: document.getElementById('tb-toast').textContent,
      });
    })()`));
    check('a ?track= link whose name holds a percent sign opens', result.name === '100% linked', result.name);
    check('and the work it replaced is in Load', result.library.includes('Link work'), `Load holds ${ownTracks(result.library)}`);
    check('and the toast says so', /Link work/.test(result.toast), result.toast);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * BUILD A TRACK IN THE ROOM WITH THE POINTER ALONE, which is what the tool is
 * for and what no earlier check could do: a person who has never seen it is
 * handed a picture of a layout and puts it on the floor. The layout is the
 * structures on the ground of RaceGOW5 Track 1 (three gates, a pole and two
 * horizontal poles), placed at positions projected onto the screen and clicked
 * there, one click each. Then the third gate is turned by the ring at its foot,
 * because the rule for where a new gate faces cannot know that this one is
 * flown from the side.
 *
 * What it asserts is what the plan's acceptance says: every piece within an
 * inch of where it was meant to go, every gate on an axis, exactly one undo
 * step for each gesture and no more, no toast the author did not ask for, and
 * nothing in the console.
 */
kase('build', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    const want = [
      { label: 'Gate', x: 4.267, y: 5.677 },
      { label: 'Gate', x: 5.741, y: 6.414 },
      { label: 'Gate', x: 4.636, y: 6.782 },
      { label: 'Pole', x: 4.991, y: 6.782 },
      { label: 'Horizontal pole', x: 5.372, y: 6.782 },
      { label: 'Horizontal pole', x: 4.267, y: 6.414 },
    ];
    let gestures = 0;
    for (const w of want) {
      const armed = await page.evaluate('window.trackBuilder.armed');
      const type = { Gate: 'gate', Pole: 'pole', 'Horizontal pole': 'horizontalPole' }[w.label];
      if (armed !== type) {
        await tool(page, w.label);
      }
      const at = await screenOf(page, 'view3d', w.x, w.y, 0);
      await click(page, at.x, at.y);
      gestures += 1;
      await page.until('!window.trackBuilder.view3d.dirty', 10000);
    }
    check('six clicks are six undo steps', (await undoCount(page)) === gestures, `${await undoCount(page)} steps for ${gestures} clicks`);

    const placed = await elements(page);
    const off = want.map((w, i) => Math.hypot((placed[i]?.x ?? 99) - w.x, (placed[i]?.y ?? 99) - w.y));
    check('every piece is within an inch of where it was meant to go', placed.length === want.length && off.every((d) => d < 0.03),
      off.map((d) => `${(d * 39.37).toFixed(2)} in`).join(', '));

    const gates = placed.filter((e) => e.type === 'gate');
    const quarter = (yaw) => Math.abs(Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2) - yaw) < 1e-5;
    check('every gate faces along an axis, which nobody had to arrange', gates.every((g) => quarter(g.yaw)),
      gates.map((g) => `${(g.yaw * 180 / Math.PI).toFixed(0)}`).join(', '));

    /* The third gate, turned by the ring: press the knob and pull it round to
     * the north of the gate. The tool is put away first, with the key the
     * plan names for it, or a click on the gate would place another piece. */
    await key(page, 'Escape');
    check('Escape puts the tool away', (await page.evaluate('window.trackBuilder.armed')) === null);
    await page.sleep(200);
    const g3 = gates[2];
    const gateMid = await screenOf(page, 'view3d', g3.x, g3.y, 0.355);
    await click(page, gateMid.x, gateMid.y);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const ring = await json(page, `(() => { const g = window.trackBuilder.doc.elements.find((e) => e.id === '${g3.id}'); return g.dims.clearW / 2 + 0.32; })()`);
    const knob = await screenOf(page, 'view3d', g3.x + Math.cos(g3.yaw) * ring, g3.y + Math.sin(g3.yaw) * ring, 0.05);
    const north = await screenOf(page, 'view3d', g3.x, g3.y + ring, 0);
    const before = await undoCount(page);
    await drag(page, knob, north, { steps: 10 });
    const after = (await elements(page)).find((e) => e.id === g3.id);
    check('pulling the knob on the ring turns the gate to face north', Math.abs(after.yaw - Math.PI / 2) < 1e-3, `${(after.yaw * 180 / Math.PI).toFixed(1)} degrees`);
    check('and that was one undo step', (await undoCount(page)) === before + 1, `${before} then ${await undoCount(page)}`);

    const bad = await json(page, `window.trackBuilder.warnings.filter((w) => w.id === 'rg-square-headings').map((w) => w.message)`);
    check('so the gates fail no RaceGOW rule about headings', bad.length === 0, bad.join(' | '));
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A DRAG MOVES THE PIECES, NOT THE SCENE. Measured, a whole rebuild of the room
 * is 8 to 53 ms of CPU, against a 16.7 ms frame, so a gate pulled across a 34
 * element track moves its own group and redraws the line and the scene is
 * rebuilt once, when it is let go. This holds the two halves of that promise:
 * nothing rebuilt while the pointer is down, and what is on the screen then
 * the same as a rebuild would draw, mesh for mesh.
 */
const SCENE = `(() => {
  const v = window.trackBuilder.view3d;
  v.root.updateMatrixWorld(true);
  const round = (n) => Math.round(n * 1e4) / 1e4;
  const out = [];
  v.content.traverse((o) => {
    if (!o.isMesh && !o.isLine) return;
    let shape = '';
    if (o.isLine) {
      const a = o.geometry.getAttribute('position').array;
      shape = a.length + ':' + Array.from(a).map(round).join(',');
    }
    out.push([o.geometry.type, o.userData.elementId || '', o.material.color ? o.material.color.getHex() : '', round(o.material.opacity ?? 1), o.matrixWorld.elements.map(round).join(','), shape].join('|'));
  });
  return out.sort();
})()`;

kase('drag', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track6');
    await page.until('!window.trackBuilder.view3d.dirty', 15000);
    await page.evaluate(`(() => { const v = window.trackBuilder.view3d; window.__builds = 0; const b = v.build.bind(v); v.build = () => { window.__builds += 1; b(); }; return 1; })()`);
    const els = await elements(page);
    check('the track is the 34 element one', els.length >= 30, `${els.length} elements`);
    /* A gate standing alone on the floor, well inside the room. */
    const g = els.find((e) => e.type === 'gate' && e.z === 0);
    const from = await screenOf(page, 'view3d', g.x, g.y, 0.355);
    const to = await screenOf(page, 'view3d', g.x + 0.5, g.y - 0.3, 0.355);
    const before = await undoCount(page);
    /* The press selects the gate, which redraws it as selected: that is the one
     * rebuild that belongs to the press. Everything after it is the drag. */
    await mouse(page, 'mouseMoved', from.x, from.y, 0);
    await mouse(page, 'mousePressed', from.x, from.y, 1);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const builds = await page.evaluate('window.__builds');
    for (let i = 1; i <= 12; i += 1) {
      await mouse(page, 'mouseMoved', from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12, 1);
      await page.sleep(25);
    }
    check('nothing is rebuilt while the pointer is down', (await page.evaluate('window.__builds')) === builds, `${await page.evaluate('window.__builds')} builds against ${builds}`);
    const fast = await json(page, SCENE);
    await page.evaluate('window.trackBuilder.view3d.build(), 1');
    const rebuilt = await json(page, SCENE);
    check('and what is on the screen is what a rebuild draws, mesh for mesh',
      JSON.stringify(fast) === JSON.stringify(rebuilt), `${fast.length} meshes against ${rebuilt.length}`);
    await release(page, to);
    const moved = (await elements(page)).find((e) => e.id === g.id);
    check('let go, the gate is where the pointer put it, to the inch',
      Math.abs(moved.x - (g.x + 0.5)) < 0.04 && Math.abs(moved.y - (g.y - 0.3)) < 0.04, `${(moved.x - g.x).toFixed(3)}, ${(moved.y - g.y).toFixed(3)}`);
    check('as one undo step', (await undoCount(page)) === before + 1, `${before} then ${await undoCount(page)}`);
    check('and the scene was rebuilt once, on release', (await page.evaluate('window.__builds')) > builds);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/* Three gates in a row on the floor, placed through the host the way a click
 * places them (the click itself is what the build case checks), for the cases
 * that are about what happens to a track once it is there. */
async function threeGates(page) {
  await page.evaluate(`(() => {
    const app = window.trackBuilder;
    app.arm('gate');
    for (const [x, y] of [[4.5, 5.5], [5.5, 5.5], [5.5, 6.75]]) app.placeAt({ x, y, z: 0 });
    app.disarm();
    app.setSelection([]);
    return 1;
  })()`);
  await page.until('!window.trackBuilder.view3d.dirty', 10000);
}

const gateAt = async (page, i, z = 0.355) => {
  const g = (await elements(page)).filter((e) => e.type === 'gate')[i];
  return { g, at: await screenOf(page, 'view3d', g.x, g.y, z) };
};

/*
 * THE CAMERA IS NOT AN EDIT, AND EMPTY FLOOR IS NOT A GATE. A drag on empty
 * floor orbits, a click there lets go of what was selected, Shift drags a box,
 * and right click puts a tool away. None of them may leave an undo step.
 */
kase('camera and selection', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    const steps = await undoCount(page);
    const one = await gateAt(page, 0);
    await click(page, one.at.x, one.at.y);
    check('a click in the middle of a gate selects it', await page.evaluate(`window.trackBuilder.selection.has('${one.g.id}')`));
    const floor = await screenOf(page, 'view3d', 7.5, 4.2, 0);
    await click(page, floor.x, floor.y);
    check('a click on empty floor lets go of it', (await page.evaluate('window.trackBuilder.selection.size')) === 0);

    const theta = await page.evaluate('window.trackBuilder.view3d.orbit.theta');
    await drag(page, floor, { x: floor.x + 120, y: floor.y + 20 }, { steps: 8 });
    check('a drag on empty floor orbits the camera', Math.abs((await page.evaluate('window.trackBuilder.view3d.orbit.theta')) - theta) > 0.3);
    const target = await json(page, 'window.trackBuilder.view3d.orbit.target');
    await drag(page, floor, { x: floor.x - 80, y: floor.y - 40 }, { steps: 6, button: 'right' });
    const moved = await json(page, 'window.trackBuilder.view3d.orbit.target');
    check('a right drag pans it', Math.hypot(moved.x - target.x, moved.z - target.z) > 0.1);
    const radius = await page.evaluate('window.trackBuilder.view3d.orbit.radius');
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: floor.x, y: floor.y, deltaX: 0, deltaY: -240 }, page.sessionId);
    await page.sleep(200);
    check('the wheel zooms in', (await page.evaluate('window.trackBuilder.view3d.orbit.radius')) < radius);

    const a = await gateAt(page, 0);
    const c = await gateAt(page, 2);
    const pad = 60;
    const topLeft = { x: Math.min(a.at.x, c.at.x) - pad, y: Math.min(a.at.y, c.at.y) - pad };
    const bottomRight = { x: Math.max(a.at.x, c.at.x) + pad, y: Math.max(a.at.y, c.at.y) + pad };
    await drag(page, topLeft, bottomRight, { steps: 8, mods: 8 });
    const picked = await json(page, '[...window.trackBuilder.selection]');
    check('a Shift drag draws a box and selects what is in it', picked.includes(a.g.id) && picked.includes(c.g.id), picked.join(', '));

    await key(page, 'KeyA', 2);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const lit = () => page.evaluate("document.querySelectorAll('.tb-bubble.on').length");
    check('Control A selects every gate, and the room shows it', (await lit()) === 3, `${await lit()} numbers lit`);
    await key(page, 'Escape');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    check('and Escape lets go, and the room shows that', (await lit()) === 0, `${await lit()} numbers lit`);
    await tool(page, 'Gate');
    check('a tool is armed by its button', (await page.evaluate('window.trackBuilder.armed')) === 'gate');
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: floor.x, y: floor.y, button: 'right', buttons: 2, clickCount: 1 }, page.sessionId);
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: floor.x, y: floor.y, button: 'right', buttons: 0, clickCount: 1 }, page.sessionId);
    await page.sleep(100);
    check('a right click puts it away', (await page.evaluate('window.trackBuilder.armed')) === null);
    check('and none of that left an undo step', (await undoCount(page)) === steps, `${steps} then ${await undoCount(page)}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE KEYS. Arrows nudge a grid square (six inches with Shift), Q and E turn a
 * quarter, X reverses the direction, Control D copies beside the gate, Delete
 * removes it, Control Z takes each of them back. One press is one undo step.
 */
kase('keys', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    await trapToasts(page);
    const two = await gateAt(page, 1);
    await click(page, two.at.x, two.at.y);
    const step = async (name, act, expect) => {
      const before = await undoCount(page);
      await act();
      const now = await undoCount(page);
      check(name, now === before + 1 && (await expect()), `${before} then ${now}`);
    };
    const pos = async () => (await elements(page)).filter((e) => e.type === 'gate')[1];

    const p0 = await pos();
    await step('an arrow key moves the selection one grid square, along one axis', () => key(page, 'ArrowUp'), async () => {
      const p = await pos();
      const d = Math.hypot(p.x - p0.x, p.y - p0.y);
      return Math.abs(d - 0.0254) < 1e-4 && (Math.abs(p.x - p0.x) < 1e-6 || Math.abs(p.y - p0.y) < 1e-6);
    });
    const p1 = await pos();
    await step('and with Shift six inches', () => key(page, 'ArrowLeft', 8), async () => {
      const p = await pos();
      return Math.abs(Math.hypot(p.x - p1.x, p.y - p1.y) - 6 * 0.0254) < 1e-4;
    });
    const yaw0 = (await pos()).yaw;
    await step('Q turns it a quarter', () => key(page, 'KeyQ'), async () => Math.abs(Math.abs((await pos()).yaw - yaw0) - Math.PI / 2) < 1e-4);
    await step('and E turns it back', () => key(page, 'KeyE'), async () => Math.abs((await pos()).yaw - yaw0) < 1e-4);
    const entry0 = await page.evaluate('window.trackBuilder.doc.sequence[1].entry');
    await step('X reverses the direction it is flown', () => key(page, 'KeyX'), async () => (await page.evaluate('window.trackBuilder.doc.sequence[1].entry')) === -entry0);

    const count = (await elements(page)).length;
    await step('Control D makes a copy', () => key(page, 'KeyD', 2), async () => (await elements(page)).length === count + 1);
    const all = await elements(page);
    const copy = all[all.length - 1];
    const orig = all[1];
    check('30 in along the width of the gate it copied', Math.abs(Math.hypot(copy.x - orig.x, copy.y - orig.y) - 30 * 0.0254) < 1e-3,
      `${(Math.hypot(copy.x - orig.x, copy.y - orig.y) / 0.0254).toFixed(1)} in`);
    check('the copy is what is selected, and is last in the flying order',
      await page.evaluate(`window.trackBuilder.selection.has('${copy.id}') && window.trackBuilder.selection.size === 1 && window.trackBuilder.doc.sequence.at(-1).elementId === '${copy.id}'`));
    await step('Delete removes it', () => key(page, 'Delete'), async () => (await elements(page)).length === count);
    const before = await undoCount(page);
    await key(page, 'KeyZ', 2);
    await key(page, 'KeyZ', 2);
    check('Control Z twice takes back the delete and then the copy', (await undoCount(page)) === before - 2 && (await elements(page)).length === count,
      `${before} then ${await undoCount(page)}, ${(await elements(page)).length} elements from ${count}`);
    await key(page, 'KeyZ', 2 | 8);
    check('and Control Shift Z puts the copy back', (await undoCount(page)) === before - 1 && (await elements(page)).length === count + 1,
      `${(await elements(page)).length} elements`);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE NUMBER ON A GATE IS A BUTTON. Click it and that pass is in focus; double
 * click it, type where that gate should come in the order, press Enter: it goes
 * there, and the numbers close up. That is one undo step, and Escape leaves it
 * alone.
 */
kase('numbers', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    const bubbles = () => json(page, `[...document.querySelectorAll('.tb-bubble')].map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })`);
    let b = await bubbles();
    check('every gate has its number over it', b.length === 3 && b.map((x) => x.text).join() === '1,2,3', b.map((x) => x.text).join());
    check('about 22 px across, at any distance', b.every((x) => Math.abs(x.w - 22) < 1 && Math.abs(x.h - 22) < 1), b.map((x) => `${x.w}x${x.h}`).join());
    const order = () => json(page, 'window.trackBuilder.doc.sequence.map((q) => q.elementId)');
    const first = await order();
    const steps = await undoCount(page);

    /* One click looks at the pass: it selects the piece and puts the pass in focus,
     * and it is not an edit. */
    await click(page, b[2].x, b[2].y);
    check('a click on a number selects its piece and puts that pass in focus, and is no edit',
      await page.evaluate(`window.trackBuilder.selection.has('${first[2]}') && window.trackBuilder.focusedPass() === window.trackBuilder.doc.sequence[2].id`)
      && (await undoCount(page)) === steps && !(await page.evaluate("!!document.querySelector('.tb-bubble-input')")));
    await doubleClick(page, b[2].x, b[2].y);
    await page.until("!!document.querySelector('.tb-bubble-input')", 5000);
    await page.evaluate("(() => { const i = document.querySelector('.tb-bubble-input'); i.value = '1'; return 1; })()");
    await key(page, 'Enter');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const now = await order();
    check('typing 1 into the number on the third gate makes it the first', now[0] === first[2] && now[1] === first[0] && now[2] === first[1], now.join());
    check('as one undo step', (await undoCount(page)) === steps + 1);
    b = await bubbles();
    check('and the numbers close up, one of each', b.map((x) => x.text).sort().join() === '1,2,3', b.map((x) => x.text).join());

    await doubleClick(page, b[0].x, b[0].y);
    await page.until("!!document.querySelector('.tb-bubble-input')", 5000);
    await page.evaluate("(() => { const i = document.querySelector('.tb-bubble-input'); i.value = '3'; return 1; })()");
    await key(page, 'Escape');
    check('Escape leaves the order alone', (await order()).join() === now.join() && (await undoCount(page)) === steps + 1);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE RACING LINE RUNS THROUGH THE MIDDLE OF EVERY GATE, so with the line on
 * and able to take a press, a click in a gate's opening was a click on the line
 * (and started a bend). Bend line is off by default now: the gate takes the
 * click and the line is only a picture. Turned on, a drag that starts on the
 * line drops a waypoint on it, as it always did.
 */
kase('bend line', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    check('the line is on by default on a whoop canvas', await page.evaluate('window.trackBuilder.pathVisible === true'));
    check('and Bend line is off', await page.evaluate('window.trackBuilder.bendLine === false'));
    /*
     * A spot on the line with nothing in front of it, seen from where the
     * camera is now (a gate in front of the line takes the press, which is
     * right, and is not what is being asked here). The view is asked which
     * samples are clear only to CHOOSE the spot; the press is a real one.
     */
    const freeSpot = () => json(page, `(() => {
      const v = window.trackBuilder.view3d;
      const r = v.canvas.getBoundingClientRect();
      v.applyCamera(); v.camera.updateMatrixWorld(true); v.root.updateMatrixWorld(true);
      const V = v.camera.position.constructor;
      const samples = window.trackBuilder.path.samples;
      for (let i = 0; i < samples.length; i += 2) {
        const q = new V(samples[i].pos.x, samples[i].pos.y, samples[i].pos.z);
        v.root.localToWorld(q); q.project(v.camera);
        const at = { clientX: r.left + ((q.x + 1) / 2) * r.width, clientY: r.top + ((1 - q.y) / 2) * r.height };
        if (at.clientX < r.left + 60 || at.clientX > r.right - 60 || at.clientY < r.top + 60 || at.clientY > r.bottom - 160) continue;
        if (!v.pickHit(at) && v.pathHit(at)) return { x: at.clientX, y: at.clientY };
      }
      return null;
    })()`);
    const at = await freeSpot();
    check('there is somewhere on the line with nothing in front of it', at !== null);
    const count = (await elements(page)).length;
    const steps = await undoCount(page);
    await drag(page, at, { x: at.x + 40, y: at.y - 40 }, { steps: 6 });
    check('a drag that starts on the line, with Bend line off, does not bend it', (await elements(page)).length === count && (await undoCount(page)) === steps);
    const gate = await gateAt(page, 0);
    await click(page, gate.at.x, gate.at.y);
    check('and a click in the middle of a gate, where the line runs, selects the gate', await page.evaluate(`window.trackBuilder.selection.has('${gate.g.id}')`));

    await page.evaluate("window.trackBuilder.toggleBendLine(), 1");
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const at2 = await freeSpot();
    await drag(page, at2, { x: at2.x + 50, y: at2.y - 50 }, { steps: 8 });
    const after = await elements(page);
    check('with Bend line on, the same drag drops a waypoint on the line', after.length === count + 1 && after.some((e) => e.type === 'waypoint'), `${after.length} elements from ${count}`);
    check('as one undo step', (await undoCount(page)) === steps + 1, `${steps} then ${await undoCount(page)}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE ROOM MAY NOT TAKE THE TOOL DOWN WITH IT. Three.js comes from a CDN, and
 * a network that cannot reach it must leave a builder that builds: view3d.js
 * says why the room is never load bearing, and a whoop canvas opening in the
 * room by itself is exactly where that promise is easiest to break. With every
 * request to the CDN refused, the canvas stays on the plan it has always had,
 * pressing 3D says why it did nothing and stays on the plan, and a track can
 * still be laid out on it, with the same rule for where a gate faces.
 */
kase('three blocked', async () => {
  const page = await openBuilder('?class=micro', 1600, 900, { room: false, block: true });
  try {
    await page.sleep(3000);
    check('the canvas stays on the plan', (await page.evaluate('window.trackBuilder.mode')) === '2d');
    check('the palette and the plan are there, and nothing has thrown', (await page.evaluate("document.querySelectorAll('#tb-palette .tb-tool').length")) > 5 && ownErrors(page).length === 0, ownErrors(page).join(' | '));
    await trapToasts(page);
    const room = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-topbar button')].find((x) => x.textContent === '3D' && x.getClientRects().length); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, room.x, room.y);
    await page.until('window.__toasts.length > 0', 15000);
    check('pressing 3D says why it did nothing', /could not load Three\.js/.test((await toasts(page))[0]), (await toasts(page))[0]);
    await page.until("window.trackBuilder.mode === '2d'", 5000);
    check('and leaves the plan up', (await page.evaluate('window.trackBuilder.mode')) === '2d');

    await tool(page, 'Gate');
    for (const [x, y] of [[4.5, 5.5], [5.5, 5.5], [5.5, 6.75]]) {
      const at = await screenOf(page, 'view2d', x, y);
      await click(page, at.x, at.y);
    }
    const placed = (await elements(page)).filter((e) => e.type === 'gate');
    check('three clicks on the plan place three gates, one undo step each', placed.length === 3 && (await undoCount(page)) === 3, `${placed.length} gates, ${await undoCount(page)} steps`);
    const quarter = (yaw) => Math.abs(Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2) - yaw) < 1e-5;
    check('each facing along an axis, as they do in the room', placed.every((g) => quarter(g.yaw)) && placed.every((g) => g.pinned), placed.map((g) => (g.yaw * 180 / Math.PI).toFixed(0)).join(', '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * 3D, 2D AND TOP (MENUS-PLAN.md 4.2). On the whoop canvas 3D is the room, where
 * it is built, and 2D is the plan canvas this tool has always had. Top is a
 * camera beside Fit that looks straight down on the room, for measuring, and
 * not a third view: the bar said Room, Plan and 2D, two of them plans. V goes
 * between 3D and 2D, as it does on every canvas. Home fits the track, F frames
 * what is selected.
 */
kase('views', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    const plan = () => page.evaluate('window.trackBuilder.view3d.isPlan()');
    const mode = () => page.evaluate('window.trackBuilder.mode');
    const lit = () => json(page, `(() => {
      const b = (t) => [...document.querySelectorAll('#tb-topbar button')].find((x) => x.textContent === t && x.getClientRects().length);
      const on = (t) => Boolean(b(t)?.classList.contains('on'));
      return { d3: on('3D'), d2: on('2D'), top: on('Top'), topShown: Boolean(b('Top')), views: [...document.querySelectorAll('#tb-topbar .tb-view-group button')].map((x) => x.textContent) };
    })()`);
    const button = (label) => json(page, `(() => { const b = [...document.querySelectorAll('#tb-topbar button')].find((x) => x.textContent === ${JSON.stringify(label)} && x.getClientRects().length); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    let now = await lit();
    check('it opens in 3D, the room seen from an angle, and the switch has 3D first', (await mode()) === '3d' && !(await plan()) && now.d3 && now.views.join('|') === '3D|2D', JSON.stringify(now));
    check('with Top beside Fit, not lit', now.topShown && !now.top);
    const top = await button('Top');
    await click(page, top.x, top.y);
    now = await lit();
    check('Top looks straight down on the room, still in 3D, and is lit', (await mode()) === '3d' && (await plan()) && now.top && now.d3, JSON.stringify(now));
    /* Off the middle, where the number hangs: from straight above a number sits
     * on its gate. */
    const g = await gateAt(page, 1);
    const along = await screenOf(page, 'view3d', g.g.x - 0.25 * Math.sin(g.g.yaw), g.g.y + 0.25 * Math.cos(g.g.yaw), 0.355);
    await click(page, along.x, along.y);
    check('a gate is picked from the top the way it is from the angle', await page.evaluate(`window.trackBuilder.selection.has('${g.g.id}')`));
    const again = await button('Top');
    await click(page, again.x, again.y);
    check('Top again is the angle it had', (await mode()) === '3d' && !(await plan()) && !(await lit()).top);

    await key(page, 'KeyV');
    now = await lit();
    check('V is 2D, the plan canvas, and Top goes with the room', (await mode()) === '2d' && now.d2 && !now.topShown, JSON.stringify(now));
    await key(page, 'KeyV');
    check('and V again is 3D', (await mode()) === '3d' && (await lit()).d3);
    const two = await button('2D');
    await click(page, two.x, two.y);
    check('2D is one press away on the bar too', (await mode()) === '2d' && (await lit()).d2);
    const three = await button('3D');
    await click(page, three.x, three.y);
    check('and so is 3D', (await mode()) === '3d');

    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    await key(page, 'Home');
    await page.sleep(300);
    const baseline = await measureExtent(page, 'view3d');
    const floor = await screenOf(page, 'view3d', 7.5, 4.2, 0);
    await drag(page, floor, { x: floor.x + 150, y: floor.y }, { steps: 6 });
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: floor.x, y: floor.y, deltaX: 0, deltaY: 900 }, page.sessionId);
    await page.sleep(300);
    await key(page, 'Home');
    await page.sleep(300);
    const fitted = await measureExtent(page, 'view3d');
    check('Home puts the whole track back in view, framed as it was, after the camera has gone', fitted.inside && Math.abs(fitted.fill - baseline.fill) < 0.04, `${(fitted.fill * 100).toFixed(0)} percent, and ${(baseline.fill * 100).toFixed(0)} before, inside ${fitted.inside}`);

    const one = await gateAt(page, 2);
    await click(page, one.at.x, one.at.y);
    const radius = await page.evaluate('window.trackBuilder.view3d.orbit.radius');
    await key(page, 'KeyF');
    await page.sleep(300);
    const after = await gateAt(page, 2);
    const rect = await json(page, 'window.trackBuilder.view3d.canvas.getBoundingClientRect().toJSON()');
    check('F closes in on what is selected', (await page.evaluate('window.trackBuilder.view3d.orbit.radius')) < radius, `${radius.toFixed(2)} then ${(await page.evaluate('window.trackBuilder.view3d.orbit.radius')).toFixed(2)}`);
    check('and puts it in the middle of the room', Math.abs(after.at.x - (rect.left + rect.width / 2)) < 30 && Math.abs(after.at.y - (rect.top + rect.height / 2)) < rect.height * 0.3,
      `${after.at.x.toFixed(0)}, ${after.at.y.toFixed(0)} in ${rect.width}x${rect.height}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE CARD BY THE SELECTED GATE holds the six things a pilot changes, in
 * inches, and a Copy, a Remove and a More. Typing in it is an edit like any
 * other: one undo step.
 */
kase('card', async () => {
  const page = await openBuilder();
  try {
    await threeGates(page);
    await trapToasts(page);
    check('nothing selected, no card', await page.evaluate("document.getElementById('tb-card').hidden"));
    const two = await gateAt(page, 1);
    await click(page, two.at.x, two.at.y);
    await page.until("!document.getElementById('tb-card').hidden", 5000);
    const labels = await json(page, `[...document.querySelectorAll('#tb-card .tb-field-label, #tb-card .tb-card-fig > span')].map((x) => x.textContent)`);
    check('the card has the six things the plan names', ['Place in order', 'X (in)', 'Y (in)', 'Height off floor (in)', 'Turn (degrees)', 'Direction'].every((l) => labels.includes(l)), labels.join(' | '));
    const buttons = await json(page, `[...document.querySelectorAll('#tb-card button')].map((x) => x.textContent)`);
    check('and Reverse, Copy, Remove and More', ['Reverse', 'Copy', 'Remove', 'More'].every((l) => buttons.includes(l)), buttons.join(' | '));
    const mm = await json(page, `[...document.querySelectorAll('#tb-card .tb-field-suffix')].map((x) => x.textContent)`);
    check('with the millimetres beside the inches', mm.length >= 3 && mm.every((t) => /mm$/.test(t)), mm.join(' | '));

    const type = async (key2, value) => {
      await page.evaluate(`(() => { const i = document.querySelector('#tb-card [data-tbkey^="${key2}"]'); i.value = ${JSON.stringify(String(value))}; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await page.sleep(150);
    };
    const gate = async () => (await elements(page)).filter((e) => e.type === 'gate')[1];
    let steps = await undoCount(page);
    await type('card-x-', 20);
    let now = await gate();
    check('typing 20 in X puts the gate 20 in east of the middle of the room', Math.abs(now.x - (5 + 20 * 0.0254)) < 1e-4 && (await undoCount(page)) === steps + 1, `${now.x}`);
    steps = await undoCount(page);
    await type('card-h-', 30);
    const sill = await page.evaluate(`window.trackBuilder.doc.elements.filter((e) => e.type === 'gate')[1].dims.sillH`);
    check('and 30 in of height off the floor lifts it 30 in', Math.abs(sill - 30 * 0.0254) < 1e-4 && (await undoCount(page)) === steps + 1, `${sill}`);
    steps = await undoCount(page);
    await type('card-turn-', 90);
    now = await gate();
    check('90 in Turn faces it north', Math.abs(now.yaw - Math.PI / 2) < 1e-4 && (await undoCount(page)) === steps + 1, `${now.yaw}`);
    steps = await undoCount(page);
    const before = await page.evaluate('window.trackBuilder.doc.sequence[1].entry');
    /* The card follows its piece, and the camera settles after an edit that moves the
     * piece, so what a press is aimed at is measured twice, a frame apart, until it
     * has stopped. */
    const where = (label) => json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === ${JSON.stringify(label)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const at = async (label) => {
      let last = await where(label);
      for (let i = 0; i < 20; i += 1) {
        await page.sleep(150);
        const now = await where(label);
        if (now && last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5) {
          return now;
        }
        last = now;
      }
      return last;
    };
    const rev = await at('Reverse');
    await click(page, rev.x, rev.y);
    check('Reverse turns the direction it is flown round', (await page.evaluate('window.trackBuilder.doc.sequence[1].entry')) === -before && (await undoCount(page)) === steps + 1);
    const more = await at('More');
    await click(page, more.x, more.y);
    check('More opens the drawer with everything else in it', await page.evaluate("document.body.classList.contains('tb-drawer')"));
    await page.evaluate('window.trackBuilder.toggleDrawer(false), 1');
    const copy = await at('Copy');
    const count = (await elements(page)).length;
    await click(page, copy.x, copy.y);
    check('Copy makes a copy beside it', (await elements(page)).length === count + 1);
    await page.until("!document.getElementById('tb-card').hidden", 5000);
    const remove = await at('Remove');
    await click(page, remove.x, remove.y);
    check('Remove takes it away, and the card with it', (await elements(page)).length === count && (await page.evaluate("document.getElementById('tb-card').hidden")));
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * AN EMPTY CANVAS SAYS WHAT TO DO. It is the hardest thing to start from, so
 * it says pick a gate and click the floor, and offers a finished RaceGOW track
 * to change instead. While the track is a few gates a line at the foot says what
 * the pointer does now, and it goes when there are three.
 */
kase('empty canvas', async () => {
  const page = await openBuilder();
  try {
    const empty = () => page.evaluate("!document.getElementById('tb-empty').hidden");
    const coach = () => page.evaluate("document.getElementById('tb-coach').hidden ? '' : document.getElementById('tb-coach').textContent");
    check('an empty whoop canvas says what to do', (await empty()) && /Pick a gate on the left, then click the floor/.test(await page.evaluate("document.getElementById('tb-empty').textContent")));
    check('and has no strip of passes along the foot, which would be a lone plus for a lap with nothing in it', (await page.evaluate("document.querySelectorAll('.tb-strip').length")) === 0);
    const start = await json(page, `(() => { const b = document.querySelector('#tb-empty button'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: b.textContent }; })()`);
    check('and offers a finished track to start from', start.text === 'Start from a RaceGOW track', start.text);
    await click(page, start.x, start.y);
    await page.until("!document.getElementById('tb-modal').hidden", 5000);
    const listed = await page.evaluate("document.getElementById('tb-modal').textContent");
    check('which opens the eight shipped ones in Load', (listed.match(/RaceGOW5 Track \d/g) || []).length >= 8, `${(listed.match(/RaceGOW5 Track \d/g) || []).length} of them`);
    await key(page, 'Escape');
    await page.until("document.getElementById('tb-modal').hidden", 5000);

    await tool(page, 'Gate');
    check('with a tool armed, the line at the foot says click the floor', /Click the floor/.test(await coach()), await coach());
    for (const [x, y] of [[5, 6], [5, 7.5]]) {
      const at = await screenOf(page, 'view3d', x, y, 0);
      await click(page, at.x, at.y);
    }
    check('the prompt goes with the first gate', !(await empty()));
    check('and the strip of passes comes with the gates, one chip for each and the plus', (await page.evaluate("document.querySelectorAll('.tb-strip .tb-chip[data-seq]').length")) === 2 && (await page.evaluate("document.querySelectorAll('.tb-strip .tb-chip-add').length")) === 1);
    check('and the line at the foot is still there with two gates', (await coach()) !== '');
    const at = await screenOf(page, 'view3d', 5, 9, 0);
    await click(page, at.x, at.y);
    check('and gone with three', (await coach()) === '', await coach());
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A GHOST FOLLOWS THE POINTER, snapped, with the distance to the gate before it.
 * That is the promise of placing in the room: what a click would do is on the
 * screen before the click. The distance is in the units the rules are in, and
 * green when the pair would be a legal side by side pair.
 */
kase('ghost', async () => {
  const page = await openBuilder();
  try {
    await tool(page, 'Gate');
    const first = await screenOf(page, 'view3d', 5, 6, 0);
    await click(page, first.x, first.y);
    const ghost = () => page.evaluate('window.trackBuilder.view3d.ghostGroup !== null');
    const measures = () => json(page, `[...document.querySelectorAll('.tb-measure')].filter((n) => n.style.display !== 'none').map((n) => ({ text: n.textContent, cls: n.className }))`);
    const hover = async (x, y) => {
      const at = await screenOf(page, 'view3d', x, y, 0);
      await mouse(page, 'mouseMoved', at.x, at.y, 0);
      await page.sleep(400);
    };
    await hover(5, 6 + 30 * 0.0254);
    check('with a tool armed, a ghost follows the pointer', await ghost());
    let m = await measures();
    check('with the distance to the gate before it, in inches and millimetres', m.length === 1 && m[0].text === '30 in (762 mm)', JSON.stringify(m));
    check('green, because 30 in is a legal side by side pair', m.length === 1 && /tone-legal/.test(m[0].cls), JSON.stringify(m));
    await hover(5, 9);
    m = await measures();
    check('a gate 3 m on is a plain distance, not coloured', m.length === 1 && /tone-plain/.test(m[0].cls) && /\d+ in \(\d+ mm\)/.test(m[0].text), JSON.stringify(m));
    await hover(5, 6 + 20 * 0.0254);
    m = await measures();
    check('and one 20 in on is amber, too close to be another gate', m.length === 1 && /tone-close/.test(m[0].cls), JSON.stringify(m));
    const steps = await undoCount(page);
    check('hovering is not an edit', steps === 1, String(steps));
    await mouse(page, 'mouseMoved', 5, 5, 0);
    await page.sleep(300);
    check('the ghost goes when the pointer leaves the room', !(await ghost()) && (await measures()).length === 0);
    await hover(5, 6 + 30 * 0.0254);
    await key(page, 'Escape');
    check('and when the tool is put away', !(await ghost()) && (await measures()).length === 0);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A PIECE LANDS WHERE THE RULES SAY IT GOES. Near a legal spot the magnet takes
 * it there and shows a guide: 30 in centre to centre along the width of a gate is
 * a side by side pair, 14 in off a gate is where a pole stands. A gate that lands
 * beside another faces the way it does. Alt turns all of it off. What is asserted
 * is what the pilot sees: the distance beside the ghost reads exactly 30 in while
 * the pointer is a few centimetres off it, and what a click puts down is where
 * the ghost was.
 */
kase('magnets', async () => {
  const page = await openBuilder();
  try {
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('gate');
      app.placeAt({ x: 5, y: 6, z: 0 });
      app.placeAt({ x: 5, y: 7.5, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const measures = () => json(page, `[...document.querySelectorAll('.tb-measure')].filter((n) => n.style.display !== 'none').map((n) => n.textContent)`);
    const hover = async (x, y, mods = 0) => {
      const at = await screenOf(page, 'view3d', x, y, 0);
      await mouse(page, 'mouseMoved', at.x, at.y, 0, mods);
      await page.sleep(400);
      return at;
    };
    const steps = await undoCount(page);
    await tool(page, 'Gate');
    const slotX = 5 + 30 * 0.0254;

    await hover(slotX + 0.03, 6.02);
    check('a few centimetres from 30 in beside a gate, the ghost reads 30 in', (await measures()).includes('30 in (762 mm)'), (await measures()).join(' | '));
    check('and the guide is there', (await page.evaluate('window.trackBuilder.guides.length')) === 1 && (await page.evaluate('window.trackBuilder.view3d.guideGroup !== null')));
    await hover(slotX + 0.03, 6.02, 1);
    const free = await measures();
    check('with Alt held it does not: the distance is what it is, and there is no guide', !free.includes('30 in (762 mm)') && (await page.evaluate('window.trackBuilder.guides.length')) === 0, free.join(' | '));

    const at = await hover(slotX + 0.03, 6.02);
    await click(page, at.x, at.y);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const gates = (await elements(page)).filter((e) => e.type === 'gate');
    const beside = gates[2];
    check('the click puts the gate exactly there', Math.abs(beside.x - slotX) < 1e-3 && Math.abs(beside.y - 6) < 1e-3, `${beside.x}, ${beside.y}`);
    check('facing the way its neighbour faces, north', Math.abs(beside.yaw - Math.PI / 2) < 1e-4 && beside.pinned, `${beside.yaw}`);
    check('as one undo step', (await undoCount(page)) === steps + 1, `${steps} then ${await undoCount(page)}`);

    await tool(page, 'Pole');
    await hover(5 - 14 * 0.0254 - 0.02, 6.03);
    check('a pole a few centimetres from 14 in beside a gate is guided to 14 in', await page.evaluate('window.trackBuilder.guides.some((g) => g.kind === "pole" && g.text === "14 in")'));
    await key(page, 'Escape');

    /* Pulled away and back, a gate lands beside its neighbour again. */
    await key(page, 'Escape');
    const pulled = (await elements(page)).filter((e) => e.type === 'gate')[2];
    const from = await screenOf(page, 'view3d', pulled.x, pulled.y, 0.355);
    const away = await screenOf(page, 'view3d', pulled.x + 0.6, pulled.y + 0.35, 0.355);
    const backNear = await screenOf(page, 'view3d', slotX + 0.03, 6.02, 0.355);
    await drag(page, from, away, { steps: 8 });
    const moved = (await elements(page)).filter((e) => e.type === 'gate')[2];
    check('a gate pulled 0.6 m away is where it was pulled to, on the grid', Math.hypot(moved.x - pulled.x, moved.y - pulled.y) > 0.5);
    await drag(page, await screenOf(page, 'view3d', moved.x, moved.y, 0.355), backNear, { steps: 8 });
    const home = (await elements(page)).filter((e) => e.type === 'gate')[2];
    check('and pulled back near the spot it lands there again, exactly', Math.abs(home.x - slotX) < 1e-3 && Math.abs(home.y - 6) < 1e-3, `${home.x}, ${home.y}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A ROW IS ONE DRAG. Two or three gates side by side, 30 in apart, is the most
 * common thing on a RaceGOW course, and building it as three placements and a
 * heading each was the hardest part of the plan view. With the row tool a drag
 * along the floor lays them, faint, with the 30 in between them, before the
 * button is let go; a click lays a pair. The result is one undo step, gates that
 * are pinned to a heading, the shared upright built once, and nothing to warn about.
 */
kase('row', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await tool(page, 'Side by side');
    check('the tool is on the palette and armed', await page.evaluate("window.trackBuilder.armed === 'row'"));
    const a = await screenOf(page, 'view3d', 4, 6, 0);
    const b = await screenOf(page, 'view3d', 5.5, 6, 0);
    await drag(page, a, b, { steps: 10, hold: true });
    await page.sleep(300);
    const live = await json(page, `({
      ghosts: window.trackBuilder.view3d.ghostGroup ? window.trackBuilder.view3d.ghostGroup.children.length : 0,
      measures: [...document.querySelectorAll('.tb-measure')].filter((n) => n.style.display !== 'none').map((n) => n.textContent),
      placed: window.trackBuilder.doc.elements.length,
    })`);
    check('mid drag, the three gates are drawn faint and nothing is placed yet', live.ghosts === 3 && live.placed === 0, JSON.stringify(live));
    check('with the 30 in between each pair of them', live.measures.length === 2 && live.measures.every((m) => m === '30 in (762 mm)'), live.measures.join(' | '));
    await release(page, b);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const gates = (await elements(page)).filter((e) => e.type === 'gate');
    check('letting go lays them as one undo step', gates.length === 3 && (await undoCount(page)) === 1, `${gates.length} gates, ${await undoCount(page)} steps`);
    const spacing = gates.slice(1).map((g, i) => Math.hypot(g.x - gates[i].x, g.y - gates[i].y));
    check('30 in apart, centre to centre', spacing.every((d) => Math.abs(d - 0.762) < 1e-6), spacing.join(', '));
    check('all facing the same way, north with nothing before them, and pinned there', gates.every((g) => Math.abs(g.yaw - Math.PI / 2) < 1e-6 && g.pinned), gates.map((g) => g.yaw).join(', '));
    const unbuilt = await json(page, "window.trackBuilder.doc.elements.filter((e) => e.type === 'gate').map((e) => (e.unbuiltSides || []).length)");
    check('each gate after the first shares its upright with the one before, built once', unbuilt.join() === '0,1,1', unbuilt.join());
    const selected = await page.evaluate('window.trackBuilder.selection.size');
    check('the row is what is selected', selected === 3, String(selected));
    check('the ghost is gone', await page.evaluate('window.trackBuilder.view3d.ghostGroup === null'));
    /* What the track says about it is what is true of it: no rule about spacing,
     * pairs or poles is broken, the line is only short of a way from one gate to the
     * next (three gates side by side all flown north is a hairpin between each, which
     * is what waypoints are for), the track is not finished, and a row of three is
     * wider than the frame. Any other code here is a rule the row does not keep. */
    const warned = await json(page, 'window.trackBuilder.warnings.map((w) => ({ code: w.code, message: w.message }))');
    const unexpected = warned.filter((w) => !['tight-corner', 'rg-envelope', 'no-start'].includes(w.code));
    check('the row breaks no rule of the sport', unexpected.length === 0, unexpected.map((w) => w.message).join(' | ') || warned.map((w) => w.code).join(', '));

    /* A second row, south of the first, faces away from it: the course is heading south. */
    await page.evaluate('window.trackBuilder.view3d.zoomToward(800, 450, 3), 1');
    const a2 = await screenOf(page, 'view3d', 4, 3, 0);
    const b2 = await screenOf(page, 'view3d', 5.5, 3, 0);
    const room = await json(page, "(() => { const r = window.trackBuilder.view3d.canvas.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()");
    const inside = (p) => p && p.x > room.l && p.x < room.r && p.y > room.t && p.y < room.b;
    check('with the room pulled back, the spot for it is on the screen', inside(a2) && inside(b2), JSON.stringify([a2, b2, room]));
    await drag(page, a2, b2, { steps: 10 });
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const next = (await elements(page)).filter((e) => e.type === 'gate').slice(3);
    check('a row laid south of the last one faces south, the way the course is going', next.length === 3 && next.every((g) => Math.abs(g.yaw + Math.PI / 2) < 1e-6), next.map((g) => g.yaw).join(', '));
    check('as another single undo step', (await undoCount(page)) === 2, String(await undoCount(page)));

    /* A click without a drag lays a pair. */
    const at = await screenOf(page, 'view3d', 8, 6, 0);
    check('with the spot for it on the screen', inside(at), JSON.stringify([at, room]));
    await click(page, at.x, at.y);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const all = (await elements(page)).filter((e) => e.type === 'gate');
    check('a click lays a pair', all.length === 8 && (await undoCount(page)) === 3, `${all.length} gates, ${await undoCount(page)} steps`);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE RULER ANSWERS "HOW FAR" AND LEAVES NO MARK. Two clicks: the distance is
 * drawn on the floor between them and said in inches with the millimetres beside
 * it. A click near a piece takes its middle, since the question is nearly always
 * how far one gate is from another. The ruler is not part of the track: nothing
 * is stored, it is not an undo step, and putting the tool away takes it off.
 */
kase('ruler', async () => {
  const page = await openBuilder();
  try {
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.placeRow({ x: 4, y: 6, z: 0 }, { x: 5.5, y: 6, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const stored = await page.evaluate('JSON.stringify(window.trackBuilder.doc)');
    const steps = await undoCount(page);
    await tool(page, 'Ruler');
    check('the ruler is armed', await page.evaluate("window.trackBuilder.armed === 'ruler'"));
    const gates = (await elements(page)).filter((e) => e.type === 'gate');
    const first = await screenOf(page, 'view3d', gates[0].x + 0.03, gates[0].y - 0.02, 0);
    const last = await screenOf(page, 'view3d', gates[2].x - 0.03, gates[2].y + 0.02, 0);
    const label = () => json(page, `[...document.querySelectorAll('.tb-measure.tone-ruler')].filter((n) => n.style.display !== 'none').map((n) => n.textContent)`);
    await click(page, first.x, first.y);
    await mouse(page, 'mouseMoved', last.x, last.y, 0);
    await page.sleep(300);
    check('between the clicks the line follows the pointer and says how far', (await label()).join() === '60 in (1524 mm)', (await label()).join());
    await click(page, last.x, last.y);
    check('the second click holds it: from middle to middle of two gates 60 in apart', (await label()).join() === '60 in (1524 mm)', (await label()).join());
    check('and the line is in the room', await page.evaluate('window.trackBuilder.view3d.rulerGroup !== null'));
    await mouse(page, 'mouseMoved', last.x + 60, last.y + 40, 0);
    await page.sleep(200);
    check('a held ruler does not follow the pointer', (await label()).join() === '60 in (1524 mm)', (await label()).join());
    check('it is not an undo step', (await undoCount(page)) === steps, `${steps} then ${await undoCount(page)}`);
    check('and nothing about it is in the track', (await page.evaluate('JSON.stringify(window.trackBuilder.doc)')) === stored);
    await key(page, 'Escape');
    check('putting the tool away takes it off', (await label()).length === 0 && (await page.evaluate('window.trackBuilder.view3d.rulerGroup === null')));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * REPLACE WITH SWAPS WHAT A PIECE IS AND LEAVES WHERE IT IS. A gate that ought to
 * have been a stack is changed where it stands, from the card, and keeps its
 * number and its heading, so it does not have to be deleted, placed again and
 * renumbered. It is one undo step, and the card offers only what the piece can
 * become: a gate is not offered a pole.
 */
kase('replace with', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('gate');
      app.placeAt({ x: 4, y: 6, z: 0 });
      app.placeAt({ x: 5, y: 7, z: 0 });
      app.placeAt({ x: 6, y: 6, z: 0 });
      app.arm('pole');
      app.placeAt({ x: 7, y: 6.5, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const list = await elements(page);
    const middle = list.filter((e) => e.type === 'gate')[1];
    const before = await json(page, 'window.trackBuilder.doc.sequence.map((q) => q.elementId)');
    const at = await screenOf(page, 'view3d', middle.x + 0.16, middle.y, 0.35);
    await click(page, at.x, at.y);
    await page.until(`window.trackBuilder.selection.has('${middle.id}')`, 5000);
    const offered = () => json(page, `[...document.querySelectorAll('#tb-card [data-tbkey="card-replace"] option')].map((o) => o.value).filter(Boolean)`);
    check('a selected gate offers the other six openings, the hoop and the hex gate last, and not a pole', (await offered()).join() === 'doubleStack,ladder,tower,diveGate,hoop,hexGate', (await offered()).join());
    const steps = await undoCount(page);
    const drawn = () => page.evaluate(`window.trackBuilder.view3d.pickables.filter((m) => m.userData.elementId === '${middle.id}').length`);
    const pieces = await drawn();
    const choose = async (value) => {
      await page.evaluate(`(() => {
        const s = document.querySelector('#tb-card [data-tbkey="card-replace"]');
        s.value = ${JSON.stringify(value)};
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
      })()`);
      await page.sleep(200);
      await page.until('!window.trackBuilder.view3d.dirty', 10000);
    };
    await choose('doubleStack');
    const now = (await elements(page)).find((e) => e.id === middle.id);
    check('choosing a double stack changes it where it stands', now.type === 'doubleStack' && Math.abs(now.x - middle.x) < 1e-9 && Math.abs(now.y - middle.y) < 1e-9 && Math.abs(now.yaw - middle.yaw) < 1e-9, JSON.stringify(now));
    check('in the same place in the flying order', (await json(page, 'window.trackBuilder.doc.sequence.map((q) => q.elementId)')).join() === before.join());
    check('as one undo step', (await undoCount(page)) === steps + 1, `${steps} then ${await undoCount(page)}`);
    check('the piece stays selected and the card now says what it is', await page.evaluate(`window.trackBuilder.selection.has('${middle.id}') && /Double stack/i.test(document.getElementById('tb-card').textContent)`), await page.evaluate("document.getElementById('tb-card').textContent.slice(0, 80)"));
    const stacked = await drawn();
    check('and the room draws it as a stack: more frame than the one gate had', pieces > 0 && stacked > pieces, `${pieces} pieces then ${stacked}`);
    check('it can be turned back into a gate from the card', (await offered()).includes('gate'));
    await choose('gate');
    check('and is a gate again, one more step', (await elements(page)).find((e) => e.id === middle.id).type === 'gate' && (await undoCount(page)) === steps + 2);
    await page.evaluate('window.trackBuilder.undo(), window.trackBuilder.undo(), 1');
    await page.sleep(200);
    check('undo takes it back, one step at a time', (await elements(page)).find((e) => e.id === middle.id).type === 'gate' && (await undoCount(page)) === steps);

    /* A pole offers a cone and nothing else, and a mixed selection offers nothing. */
    const pole = list.find((e) => e.type === 'pole');
    await page.evaluate(`window.trackBuilder.setSelection(['${pole.id}']), 1`);
    await page.sleep(200);
    check('a pole offers a cone, and only that', (await offered()).join() === 'cone', (await offered()).join());
    await page.evaluate(`window.trackBuilder.setSelection(['${pole.id}', '${middle.id}']), 1`);
    await page.sleep(200);
    check('a gate and a pole together offer nothing', (await offered()).length === 0 && (await page.evaluate("!document.getElementById('tb-card').hidden")));
    await page.evaluate(`window.trackBuilder.setSelection(['${middle.id}', '${list.filter((e) => e.type === 'gate')[0].id}']), 1`);
    await page.sleep(200);
    await choose('tower');
    const towers = (await elements(page)).filter((e) => e.type === 'tower').length;
    check('two gates selected are changed together, in one undo step', towers === 2 && (await undoCount(page)) === steps + 1, `${towers} towers, ${await undoCount(page)} steps`);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A WARNING IS ON THE PIECE IT IS ABOUT. The list of warnings in the drawer is
 * where a pilot has to go to find out what is wrong, and then has to find the gate
 * it means. A red mark sits by every piece that breaks a rule; the sentence is one
 * hover away, a click selects the piece and the card says it again in words, and
 * the mark goes the moment the rule is kept, even in the middle of a drag.
 */
kase('warnings on the piece', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('gate');
      app.placeAt({ x: 5, y: 6, z: 0 });
      app.placeAt({ x: 5 + 20 * 0.0254, y: 6, z: 0 });
      app.placeAt({ x: 7.5, y: 8, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    await page.sleep(300);
    const badges = () => json(page, `[...document.querySelectorAll('.tb-warnbadge')].filter((n) => n.style.display !== 'none').map((n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: n.getAttribute('aria-label') }; })`);
    const shown = await badges();
    check('two gates 20 in apart carry a mark each', shown.length === 2 && shown.every((b) => /20 in/.test(b.label)), JSON.stringify(shown.map((b) => b.label)));
    const gates = (await elements(page)).filter((e) => e.type === 'gate');
    const far = await screenOf(page, 'view3d', gates[2].x, gates[2].y, 0.8);
    check('and the gate that breaks nothing does not', shown.every((b) => Math.hypot(b.x - far.x, b.y - far.y) > 40), JSON.stringify([far, shown]));
    check('the notes the lap bar does not count are not marked: two warnings, not three', (await page.evaluate('window.trackBuilder.warnings.filter((w) => w.level === "info").length')) >= 1);

    const tip = () => json(page, `(() => { const t = document.querySelector('.tb-warn-tip'); return t && !t.hidden ? t.textContent : null; })()`);
    check('no sentence is on the screen until it is asked for', (await tip()) === null);
    await mouse(page, 'mouseMoved', shown[0].x, shown[0].y, 0);
    await page.sleep(250);
    const said = await tip();
    check('hovering a mark says what is wrong, in the rule\'s own words', Boolean(said) && /20 in \(508 mm\) apart/.test(said) && /27 to 33 in/.test(said), String(said));
    await mouse(page, 'mouseMoved', shown[0].x + 200, shown[0].y + 150, 0);
    await page.sleep(250);
    check('and takes it away again when the pointer leaves', (await tip()) === null);

    const steps = await undoCount(page);
    await click(page, shown[0].x, shown[0].y);
    await page.until('window.trackBuilder.selection.size === 1', 5000);
    const sel = await json(page, '[...window.trackBuilder.selection]');
    check('a click on a mark selects that gate', gates.some((g) => g.id === sel[0]) && (await undoCount(page)) === steps);
    const card = await page.evaluate("document.getElementById('tb-card').hidden ? '' : [...document.querySelectorAll('#tb-card .tb-card-warn')].map((n) => n.textContent).join(' | ')");
    check('and its card says it again in words', /20 in \(508 mm\) apart/.test(card), card);

    /* Pulled apart, the mark goes while the button is still down. */
    const other = gates.find((g) => g.id !== sel[0] && Math.hypot(g.x - gates[0].x, g.y - gates[0].y) < 1);
    const mine = gates.find((g) => g.id === sel[0]);
    const from = await screenOf(page, 'view3d', mine.x + (mine.x > other.x ? 0.16 : -0.16), mine.y, 0.35);
    const to = await screenOf(page, 'view3d', mine.x + (mine.x > other.x ? 0.16 : -0.16) + (mine.x > other.x ? 0.5 : -0.5), mine.y, 0.35);
    await drag(page, from, to, { steps: 10, hold: true });
    await page.sleep(200);
    check('pulled to a legal distance, the marks go before the button is let up', (await badges()).length === 0, JSON.stringify(await badges()));
    check('even though the pair is now "nearly a pair", which is a note and not a warning, and is not marked', await page.evaluate('window.trackBuilder.warnings.some((w) => w.code === "rg-spacing-near" && w.level === "info")'));
    await release(page, to);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    check('and stay gone after', (await badges()).length === 0);
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.sleep(300);
    check('undo brings the rule back, and the marks with it', (await badges()).length === 2);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE ROOM WORKS WITH FINGERS. A tablet is how a track gets built standing in the
 * hall it is for, and the room used to read a second finger as a new first one.
 * One finger does what the mouse does: a tap places or selects, a drag on a gate
 * moves it, a drag on the floor looks round. A second finger takes the camera,
 * and whatever the first was doing is put back: sliding, pinching, twisting. What
 * is asserted is what the hand sees: the floor stays under the fingers, a
 * clockwise twist turns the room clockwise, a piece half pulled goes home, a
 * finger left behind by a lifted pair does nothing.
 */
kase('touch', async () => {
  const page = await openBuilder('?class=micro', 1024, 768, { touch: true });
  try {
    await trapToasts(page);
    const orbit = () => json(page, '({ r: window.trackBuilder.view3d.orbit.radius, t: window.trackBuilder.view3d.orbit.theta, p: window.trackBuilder.view3d.orbit.phi, x: window.trackBuilder.view3d.orbit.target.x, y: window.trackBuilder.view3d.orbit.target.y, z: window.trackBuilder.view3d.orbit.target.z })');
    const same = (a, b) => Math.abs(a.r - b.r) < 1e-9 && Math.abs(a.t - b.t) < 1e-9 && Math.abs(a.p - b.p) < 1e-9 && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
    const canvas = await json(page, "(() => { const c = document.getElementById('tb-3d'); const r = c.getBoundingClientRect(); const s = getComputedStyle(c); return { touchAction: s.touchAction, select: s.userSelect, w: r.width, h: r.height, l: r.left, t: r.top }; })()");
    check('the room takes the touches itself: no page scroll or pinch on it', canvas.touchAction === 'none' && canvas.select === 'none', JSON.stringify(canvas));
    const coarse = await page.evaluate("matchMedia('(pointer: coarse)').matches");
    const mark = await page.evaluate(`(() => { const b = document.createElement('button'); b.className = 'tb-bubble'; document.querySelector('.tb-overlay').append(b); const w = b.getBoundingClientRect().width; b.remove(); return w; })()`);
    check('on a screen that is touched the numbers and marks are finger sized', !coarse || mark >= 30, `coarse ${coarse}, ${mark}px`);

    /* A tap with a tool armed places, and the tool stays armed. */
    await tool(page, 'Gate');
    for (const [x, y] of [[5, 6], [5, 7.5]]) {
      const at = await screenOf(page, 'view3d', x, y, 0);
      await tap(page, at);
    }
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    let gates = (await elements(page)).filter((e) => e.type === 'gate');
    check('a tap with a gate armed places it, and another places the next: two gates, two steps', gates.length === 2 && (await undoCount(page)) === 2, `${gates.length} gates, ${await undoCount(page)} steps`);
    check('and the tool is still armed', await page.evaluate("window.trackBuilder.armed === 'gate'"));
    await key(page, 'Escape');
    /* The card floats by whatever is selected, and a tap under it is a tap on the
     * card, so what the last placement left selected is let go of first. */
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(200);

    /* A tap on a gate selects it; a tap on the empty floor lets go. */
    const first = gates[0];
    const on = await screenOf(page, 'view3d', first.x + 0.16, first.y, 0.35);
    await tap(page, on);
    check('a tap on a gate selects it and the card is up', await page.evaluate(`window.trackBuilder.selection.has('${first.id}') && !document.getElementById('tb-card').hidden`));
    const bare = await screenOf(page, 'view3d', 6.6, 7.4, 0);
    await tap(page, bare);
    check('a tap on the empty floor lets go of it', (await page.evaluate('window.trackBuilder.selection.size')) === 0);
    check('and none of that is an edit', (await undoCount(page)) === 2);

    /* One finger on the floor looks round; on a gate it moves it. */
    const before = await orbit();
    await swipe(page, bare, { x: bare.x + 90, y: bare.y + 20 });
    const looked = await orbit();
    check('one finger dragged over the floor looks round the room', Math.abs(looked.t - before.t) > 0.1 && (await undoCount(page)) === 2, `${before.t} then ${looked.t}`);
    gates = (await elements(page)).filter((e) => e.type === 'gate');
    const start = { x: gates[1].x, y: gates[1].y };
    const grab = await screenOf(page, 'view3d', gates[1].x + 0.16, gates[1].y, 0.35);
    const drop = await screenOf(page, 'view3d', gates[1].x + 0.16 + 0.5, gates[1].y + 0.3, 0.35);
    await swipe(page, grab, drop, { steps: 10 });
    const pulled = (await elements(page)).filter((e) => e.type === 'gate')[1];
    check('one finger dragged on a gate moves it, as one step', Math.hypot(pulled.x - start.x, pulled.y - start.y) > 0.3 && (await undoCount(page)) === 3, `${pulled.x - start.x}, ${pulled.y - start.y}; ${await undoCount(page)} steps`);
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.sleep(200);

    /* A second finger while a gate is being pulled puts it back. */
    const home = (await elements(page)).filter((e) => e.type === 'gate')[1];
    const g1 = await screenOf(page, 'view3d', home.x + 0.16, home.y, 0.35);
    await touch(page, 'touchStart', at1(g1));
    for (let i = 1; i <= 6; i += 1) {
      await touch(page, 'touchMove', at1({ x: g1.x + i * 8, y: g1.y + i * 3 }));
      await page.sleep(25);
    }
    const midway = (await elements(page)).filter((e) => e.type === 'gate')[1];
    check('mid pull the gate is away from where it was', Math.hypot(midway.x - home.x, midway.y - home.y) > 0.05, `${midway.x - home.x}`);
    await touch(page, 'touchStart', [{ id: 1, x: g1.x + 48, y: g1.y + 18 }, { id: 2, x: g1.x + 200, y: g1.y - 120 }]);
    await page.sleep(100);
    const put = (await elements(page)).filter((e) => e.type === 'gate')[1];
    check('a second finger puts it back where it was, and leaves no step', Math.hypot(put.x - home.x, put.y - home.y) < 1e-9 && (await undoCount(page)) === 2, `${put.x - home.x}; ${await undoCount(page)} steps`);
    const settled = await orbit();
    await touch(page, 'touchMove', [{ id: 1, x: g1.x + 90, y: g1.y + 40 }, { id: 2, x: g1.x + 200, y: g1.y - 120 }]);
    await page.sleep(80);
    await touch(page, 'touchEnd', []);
    await page.sleep(160);
    check('and the pair that took it is the camera, not an edit', (await undoCount(page)) === 2);
    void settled;
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(200);

    /* The pair: a floor point under the fingers stays under them. */
    const P = { x: 5, y: 6.75 };
    await page.evaluate('window.trackBuilder.view3d.frameTrack(), window.trackBuilder.view3d.applyCamera(), 1');
    await page.sleep(200);
    let s0 = await screenOf(page, 'view3d', P.x, P.y, 0);
    let r0 = await orbit();
    await pair(page, [{ x: s0.x - 60, y: s0.y }, { x: s0.x + 60, y: s0.y }], [{ x: s0.x - 130, y: s0.y }, { x: s0.x + 130, y: s0.y }], { steps: 10 });
    let s1 = await screenOf(page, 'view3d', P.x, P.y, 0);
    let r1 = await orbit();
    check('pinching out brings the room closer, by the ratio the fingers spread', r1.r < r0.r * 0.6 && r1.r > r0.r * 0.42, `${r0.r} then ${r1.r}`);
    check('and what was between the fingers is still between them', Math.hypot(s1.x - s0.x, s1.y - s0.y) < 6, `${Math.hypot(s1.x - s0.x, s1.y - s0.y).toFixed(1)} px`);
    check('none of it is an edit', (await undoCount(page)) === 2);
    s0 = await screenOf(page, 'view3d', P.x, P.y, 0);
    r0 = await orbit();
    await pair(page, [{ x: s0.x - 130, y: s0.y }, { x: s0.x + 130, y: s0.y }], [{ x: s0.x - 50, y: s0.y }, { x: s0.x + 50, y: s0.y }], { steps: 10 });
    r1 = await orbit();
    check('pinching in takes it away again', r1.r > r0.r * 1.8, `${r0.r} then ${r1.r}`);

    s0 = await screenOf(page, 'view3d', P.x, P.y, 0);
    await pair(page, [{ x: s0.x - 60, y: s0.y }, { x: s0.x + 60, y: s0.y }], [{ x: s0.x - 60 + 90, y: s0.y + 40 }, { x: s0.x + 60 + 90, y: s0.y + 40 }], { steps: 10 });
    s1 = await screenOf(page, 'view3d', P.x, P.y, 0);
    const slid = { x: s1.x - s0.x, y: s1.y - s0.y };
    check('two fingers sliding take the room with them: it goes the way they went', slid.x > 60 && slid.y > 20 && Math.abs(slid.x - 90) < 25 && Math.abs(slid.y - 40) < 25, JSON.stringify(slid));

    /* Twisted clockwise, the room turns clockwise, looked at from above. */
    await page.evaluate('window.trackBuilder.showPlan(), 1');
    await page.sleep(500);
    /* The floor point the camera looks at: the scene's z is the document's minus y. */
    const T = await json(page, '({ x: window.trackBuilder.view3d.orbit.target.x, y: -window.trackBuilder.view3d.orbit.target.z })');
    const Q = { x: T.x + 1.0, y: T.y };
    const target = await screenOf(page, 'view3d', T.x, T.y, 0);
    const q0 = await screenOf(page, 'view3d', Q.x, Q.y, 0);
    const angle0 = Math.atan2(q0.y - target.y, q0.x - target.x);
    const twist = 0.7;
    const mid = { x: target.x + 40, y: target.y + 40 };
    const ends = (a) => [{ x: mid.x - Math.cos(a) * 80, y: mid.y - Math.sin(a) * 80 }, { x: mid.x + Math.cos(a) * 80, y: mid.y + Math.sin(a) * 80 }];
    await pair(page, ends(0), ends(twist), { steps: 14 });
    const target1 = await screenOf(page, 'view3d', T.x, T.y, 0);
    const q1 = await screenOf(page, 'view3d', Q.x, Q.y, 0);
    let turned = Math.atan2(q1.y - target1.y, q1.x - target1.x) - angle0;
    if (turned > Math.PI) {
      turned -= 2 * Math.PI;
    } else if (turned < -Math.PI) {
      turned += 2 * Math.PI;
    }
    check('twisting the fingers clockwise turns the room clockwise by about the same angle', Math.abs(turned - twist) < 0.15, `${turned.toFixed(3)} rad for a ${twist} rad twist`);

    /* A second finger that comes down on the card is still the second finger. */
    const cardGate = (await elements(page)).filter((e) => e.type === 'gate')[0];
    await page.evaluate(`window.trackBuilder.setSelection(['${cardGate.id}']), 1`);
    await page.sleep(300);
    const cardBox = await json(page, "(() => { const r = document.getElementById('tb-card').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20, hidden: document.getElementById('tb-card').hidden }; })()");
    const onFloor = { x: canvas.l + 60, y: canvas.t + 120 };
    const hand = await orbit();
    const stepsCard = await undoCount(page);
    await touch(page, 'touchStart', at1(onFloor));
    await touch(page, 'touchStart', [{ id: 1, ...onFloor }, { id: 2, x: cardBox.x, y: cardBox.y }]);
    for (let i = 1; i <= 8; i += 1) {
      await touch(page, 'touchMove', [{ id: 1, ...onFloor }, { id: 2, x: cardBox.x + i * 6, y: cardBox.y + i * 4 }]);
      await page.sleep(25);
    }
    const spread = await orbit();
    await touch(page, 'touchEnd', []);
    await page.sleep(200);
    check('with the card up, the second finger on it still joins: the pair zooms', !cardBox.hidden && spread.r < hand.r * 0.95, `${hand.r} then ${spread.r}`);
    check('and the card, which it landed on, was not pressed', (await undoCount(page)) === stepsCard);
    check('and lifting the pair did not let go of what was selected', await page.evaluate(`window.trackBuilder.selection.has('${cardGate.id}')`));
    /* And the first finger on the card's heading is the one that drags it (armCardDrag), toward the middle of
     * the stage so the edge does not stop it. No check had dragged it before 5 October. */
    const head = await json(page, "(() => { const h = document.querySelector('#tb-card .tb-card-head strong') || document.querySelector('#tb-card .tb-card-head'); const r = h.getBoundingClientRect(); const c = document.getElementById('tb-card').getBoundingClientRect(); return { x: r.left + Math.min(16, r.width / 2), y: r.top + r.height / 2, left: c.left, top: c.top, mx: c.left + c.width / 2 < innerWidth / 2 ? 40 : -40, my: c.top + c.height / 2 < innerHeight / 2 ? 30 : -30 }; })()");
    const roomBefore = await orbit();
    await swipe(page, head, { x: head.x + head.mx, y: head.y + head.my });
    const cardNow = await json(page, "(() => { const c = document.getElementById('tb-card').getBoundingClientRect(); return { left: c.left, top: c.top }; })()");
    check('one finger on the card\'s heading drags the card, and leaves the room alone',
      Math.hypot(cardNow.left - head.left - head.mx, cardNow.top - head.top - head.my) < 4 && same(roomBefore, await orbit()),
      JSON.stringify([head, cardNow]));
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(200);

    /* With a tool armed the first finger of a pair is a press that would place on
     * release; the pair is the camera, and places nothing. */
    await page.evaluate("window.trackBuilder.arm('gate'), 1");
    const armedCount = (await elements(page)).length;
    await pair(page, [{ x: canvas.l + 120, y: canvas.t + 140 }, { x: canvas.l + 240, y: canvas.t + 140 }], [{ x: canvas.l + 100, y: canvas.t + 140 }, { x: canvas.l + 260, y: canvas.t + 140 }], { steps: 6 });
    check('a pair with a gate armed places nothing', (await elements(page)).length === armedCount && (await undoCount(page)) === stepsCard);
    await page.evaluate('window.trackBuilder.disarm(), 1');

    /* A finger left behind by a lifted pair does nothing until the hand is off. */
    const keep = await orbit();
    const steps = await undoCount(page);
    const a = { x: 400, y: 400 };
    const b = { x: 560, y: 400 };
    await touch(page, 'touchStart', [{ id: 1, ...a }]);
    await touch(page, 'touchStart', [{ id: 1, ...a }, { id: 2, ...b }]);
    await touch(page, 'touchMove', [{ id: 1, x: a.x, y: a.y + 10 }, { id: 2, ...b }]);
    /* A touch end names the fingers that lift: the second one goes, the first stays down. */
    await touch(page, 'touchEnd', [{ id: 2, ...b }]);
    await page.sleep(80);
    const afterPair = await orbit();
    for (let i = 1; i <= 6; i += 1) {
      await touch(page, 'touchMove', [{ id: 1, x: a.x + i * 20, y: a.y + 10 + i * 10 }]);
      await page.sleep(25);
    }
    const leftover = await orbit();
    check('the finger that stays down after the other lifts does not go on to move the room', same(afterPair, leftover), JSON.stringify([afterPair, leftover]));
    await touch(page, 'touchEnd', []);
    await page.sleep(160);
    check('and lifting it is not a tap', (await undoCount(page)) === steps && (await page.evaluate('window.trackBuilder.selection.size')) === 0);
    void keep;
    await swipe(page, { x: 500, y: 500 }, { x: 560, y: 520 });
    check('the next single finger is a single finger again', !same(leftover, await orbit()));

    /* A hand that never reported its lift (a finger lost to the browser) does not
     * lock the room: the next first finger is a first finger. */
    await page.evaluate(`(() => { const e = window.trackBuilder.view3d.editor; e.touches.set(99, { x: 0, y: 0 }); return 1; })()`);
    const lonely = (await elements(page)).filter((e) => e.type === 'gate')[1];
    await page.evaluate('window.trackBuilder.frameAll(), window.trackBuilder.view3d.frameTrack(), 1');
    await page.sleep(300);
    await tap(page, await screenOf(page, 'view3d', lonely.x + 0.16, lonely.y, 0.35));
    check('a lost lift is forgotten by the next hand: a tap still selects', await page.evaluate(`window.trackBuilder.selection.has('${lonely.id}')`));
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(200);

    /* The ring at a gate's foot: a finger a little off it still has it. */
    await page.evaluate('window.trackBuilder.frameAll(), 1');
    await page.evaluate('window.trackBuilder.view3d.frameTrack(), 1');
    await page.sleep(300);
    const gate = (await elements(page)).filter((e) => e.type === 'gate')[0];
    await page.evaluate(`window.trackBuilder.setSelection(['${gate.id}']), 1`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const ringR = 0.7112 / 2 + 0.32;
    /* A side of the ring where the room is what is under the finger and not the card,
     * which floats to one side or the other of what is selected. */
    let clear = null;
    let edge = null;
    for (const sgn of [-1, 1]) {
      edge = (r) => screenOf(page, 'view3d', gate.x + sgn * r, gate.y, 0.008);
      const p = await edge(ringR);
      if (await page.evaluate(`document.elementFromPoint(${p.x}, ${p.y}) === document.getElementById('tb-3d')`)) {
        clear = sgn;
        break;
      }
    }
    check('a side of the ring is clear of the card', clear !== null);
    const e0 = await edge(ringR + 0.07);
    const e1 = await edge(ringR + 0.12);
    const pxPer = Math.hypot(e1.x - e0.x, e1.y - e0.y) / 0.05;
    const off = ringR + 0.07 + 9 / pxPer;
    const press = await edge(off);
    const probe = (pointerType) => page.evaluate(`(() => { const h = window.trackBuilder.view3d.pickHit({ clientX: ${press.x}, clientY: ${press.y}, pointerType: '${pointerType}' }); return !!(h && h.ring); })()`);
    check('9 px outside the ring, a mouse misses it', (await probe('mouse')) === false, JSON.stringify(press));
    check('and a finger has it', (await probe('touch')) === true);
    const steps2 = await undoCount(page);
    const south = await screenOf(page, 'view3d', gate.x, gate.y - ringR, 0.008);
    const yawWas = (await elements(page)).find((e) => e.id === gate.id).yaw;
    await swipe(page, press, south, { steps: 14 });
    const yawNow = (await elements(page)).find((e) => e.id === gate.id).yaw;
    check('and pulling it round turns the gate: it faces where the finger went', Math.abs(Math.abs(yawNow) - Math.PI / 2) < 1e-3 && Math.abs(yawNow - yawWas) > 1, `${yawWas} to ${yawNow}`);
    check('as one undo step', (await undoCount(page)) === steps2 + 1, `${steps2} then ${await undoCount(page)}`);

    /* What a keyboard did, a button does. */
    const turnBtn = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === 'Turn'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; })()`);
    check('the card has a Turn button, since there is no Q or E, and it is finger sized', Boolean(turnBtn) && (!coarse || turnBtn.h >= 40), JSON.stringify(turnBtn));
    if (turnBtn) {
      const yaw1 = (await elements(page)).find((e) => e.id === gate.id).yaw;
      await tap(page, turnBtn);
      const yaw2 = (await elements(page)).find((e) => e.id === gate.id).yaw;
      let d = Math.abs(yaw2 - yaw1);
      d = Math.min(d, 2 * Math.PI - d);
      check('a tap on it turns the gate a quarter', Math.abs(d - Math.PI / 2) < 1e-3, `${yaw1} to ${yaw2}`);
    }
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/* A More menu item, by the words on it, pressed with the mouse. */
async function menu(page, label) {
  const where = (selector, text) => json(page, `(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.textContent === ${JSON.stringify(text)});
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  const more = await where('#tb-topbar .tb-more > button', 'More');
  await click(page, more.x, more.y);
  await page.until("!document.querySelector('.tb-more-menu').hidden", 5000);
  const item = await where('.tb-more-item', label);
  if (!item) {
    throw new Error(`no menu item called ${label}`);
  }
  await click(page, item.x, item.y);
  await page.sleep(300);
}

/*
 * THE TRACK TRAVELS IN THE ADDRESS. A pilot with a room and a tape measure wants to
 * send a layout to a friend in a message, with no account and no upload: the link
 * carries the whole track after the hash sign, where a browser never sends it. It is
 * opened by a page that has never seen the track (a new browser profile), it opens as
 * a copy under a new id, it says so, it takes itself out of the address so a reload does
 * not open it again, and a link that is not one of ours opens nothing and breaks nothing.
 */
kase('share link', async () => {
  const page = await openBuilder();
  let hash = '';
  let original = null;
  try {
    await trapToasts(page);
    await loadPreset(page, 'racegow5-track3');
    original = await json(page, '({ id: window.trackBuilder.doc.id, name: window.trackBuilder.doc.name, elements: window.trackBuilder.doc.elements, sequence: window.trackBuilder.doc.sequence })');
    await menu(page, 'Copy share link');
    const link = await page.evaluate('window.trackBuilder.lastLink || ""');
    hash = link.slice(link.indexOf('#'));
    check('Copy share link makes a link: the address of the builder, a hash sign and the track', /^https?:\/\/[^#]+\/src\/trackbuilder\/index\.html#track=[zj]\.[A-Za-z0-9_-]+$/.test(link), link.slice(0, 90));
    check('that fits a chat message', link.length < 4000, `${link.length} characters`);
    const said = (await toasts(page)).join(' | ') + await page.evaluate("document.getElementById('tb-modal').textContent");
    check('and says it is copied, or shows it to be copied by hand', /Link copied|Copy this link/.test(said), said.slice(0, 120));
    check('and is not an edit', (await undoCount(page)) === 0);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
  const second = await openBuilder(`?class=micro${hash}`);
  try {
    const got = await json(second, `({
      id: window.trackBuilder.doc.id, name: window.trackBuilder.doc.name, elements: window.trackBuilder.doc.elements, sequence: window.trackBuilder.doc.sequence,
      hash: location.hash, steps: window.trackBuilder.history.past.length, toast: document.getElementById('tb-toast').textContent,
    })`);
    check('a browser that has never seen the track opens it from the link', got.name === original.name && got.elements.length === original.elements.length, `${got.name}, ${got.elements.length} elements`);
    check('every piece and every pass exactly as it was', JSON.stringify(got.elements) === JSON.stringify(original.elements) && JSON.stringify(got.sequence) === JSON.stringify(original.sequence));
    check('as a copy: under a new id, so nothing done to it is done to the original', got.id !== original.id && /^trk-/.test(got.id), got.id);
    check('and says so', /A shared track\. Editing makes your copy\./.test(got.toast), got.toast);
    check('and takes the fragment out of the address, so a reload does not open it again', got.hash === '', got.hash);
    check('and opening it is not an edit', got.steps === 0);
    check('the page reported no error of its own', ownErrors(second).length === 0, ownErrors(second).join(' | '));
  } finally {
    await second.close();
  }
  for (const [what, bad] of [['a link with a payload that is not a track', '#track=z.AAAA'], ['one with a version this does not know', '#track=q.abc'], ['one with nothing in it', '#track=']]) {
    const third = await openBuilder(`?class=micro${bad}`);
    try {
      const doc = await json(third, '({ n: window.trackBuilder.doc.elements.length, toast: document.getElementById("tb-toast").textContent })');
      check(`${what} opens the builder as it was, and says the link could not be opened`, doc.n === 0 && /share link could not be opened/.test(doc.toast) && !/A shared track/.test(doc.toast), JSON.stringify(doc));
      check('with no error of its own', ownErrors(third).length === 0, ownErrors(third).join(' | '));
    } finally {
      await third.close();
    }
  }
});

/*
 * A PICTURE OF THE ROOM, for a chat or a poster. The canvas alone would be a room
 * with no numbers on the gates, because the numbers are HTML laid over it, so the
 * picture is the canvas with them painted on. What is asserted is that a real PNG
 * comes out, the size of the canvas, that is not blank, and that where a number
 * sits on the screen the picture has the number's own colour.
 */
kase('picture', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await loadPreset(page, 'racegow5-track1');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    await page.sleep(500);
    await page.evaluate(`(() => {
      window.__downloads = [];
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) {
          window.__downloads.push({ href: this.href, name: this.download });
          window.__taken = fetch(this.href).then((r) => r.blob());
          return undefined;
        }
        return orig.call(this);
      };
      return 1;
    })()`);
    await menu(page, 'Picture');
    await page.until('window.__downloads && window.__downloads.length === 1', 10000);
    const facts = JSON.parse(await page.evaluate(`(async () => {
      const blob = await window.__taken;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const dv = new DataView(bytes.buffer);
      const bitmap = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const canvas = document.getElementById('tb-3d');
      const rect = canvas.getBoundingClientRect();
      const k = canvas.width / rect.width;
      const seen = new Set();
      for (let i = 0; i < 400; i += 1) {
        const p = ctx.getImageData(Math.floor(((i * 37) % c.width)), Math.floor(((i * 91) % c.height)), 1, 1).data;
        seen.add(p.join(','));
      }
      const bubble = [...document.querySelectorAll('.tb-bubble')].find((n) => n.style.display !== 'none');
      const b = bubble.getBoundingClientRect();
      const px = ctx.getImageData(Math.round((b.left - rect.left + b.width / 2 - 6) * k), Math.round((b.top - rect.top + b.height / 2 - 6) * k), 1, 1).data;
      const want = getComputedStyle(bubble).backgroundColor.match(/[0-9.]+/g).map(Number);
      return JSON.stringify({
        name: window.__downloads[0].name, type: blob.type, size: blob.size, sig: [...bytes.slice(0, 8)].join(','),
        w: dv.getUint32(16), h: dv.getUint32(20), cw: canvas.width, ch: canvas.height, colours: seen.size, got: [...px].slice(0, 3), want: want.slice(0, 3),
      });
    })()`));
    check('a PNG is saved, named for the track', facts.name === 'racegow5-track-1.png' || /\.png$/.test(facts.name), facts.name);
    check('a real one: the PNG signature, and the type says so', facts.sig === '137,80,78,71,13,10,26,10' && facts.type === 'image/png', `${facts.sig} ${facts.type}`);
    check('as big as the canvas it was taken from', facts.w === facts.cw && facts.h === facts.ch && facts.w > 400, `${facts.w} by ${facts.h}, canvas ${facts.cw} by ${facts.ch}`);
    check('and not blank', facts.colours > 12, `${facts.colours} colours in 400 samples`);
    check('where a number is on the screen, the picture has the number\'s own colour under it', facts.got.every((v, i) => Math.abs(v - facts.want[i]) <= 24), `picture ${facts.got}, number ${facts.want}`);
    check('and it says it saved', /Saved .*\.png/.test((await toasts(page)).join(' ')), (await toasts(page)).join(' | '));
    await page.evaluate("window.trackBuilder.setMode('2d'), 1");
    await page.sleep(300);
    await menu(page, 'Picture');
    check('in the 2D view it says to open 3D first, and saves nothing', (await page.evaluate('window.__downloads.length')) === 1 && /3D on the bar/.test((await toasts(page)).join(' ')), (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE BUILD SHEET is the page a pilot takes into the room: where every piece
 * stands measured from a corner, and what to buy. What is asserted is what they
 * would look at: it opens over the builder, it has Track 1's fifteen sections and
 * twelve elbows, the measurements change when the corner does, a name that is markup
 * is text on it, printing shows it and nothing else, and it goes away again.
 */
kase('build sheet', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track1');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    await page.evaluate(`(() => { window.trackBuilder.doc.name = '<img src=x onerror="window.__pwned=1"> Track 1'; window.trackBuilder.nameInput.value = window.trackBuilder.doc.name; return 1; })()`);
    await menu(page, 'Build sheet');
    const sheet = () => json(page, `(() => {
      const l = document.getElementById('tb-sheet');
      if (!l || l.hidden) return null;
      return { text: l.textContent, rows: [...l.querySelectorAll('.tb-sheet-table')][0].querySelectorAll('tbody tr').length, h1: l.querySelector('h1').textContent, imgs: l.querySelectorAll('img').length, svg: l.querySelectorAll('svg circle').length, firstX: l.querySelector('.tb-sheet-table tbody tr td:nth-child(3)').textContent, pwned: window.__pwned === 1 };
    })()`);
    const one = await sheet();
    check('it opens over the builder', Boolean(one));
    check('with seven rows for Track 1: the gate, two stacks, the pole, the pads and two bars', one.rows === 7, String(one.rows));
    check('fifteen sections of 27 in, twelve elbows and two tees', /15sections, 27 in \(686 mm\)/.test(one.text) && /12elbows/.test(one.text) && /2tees/.test(one.text), one.text.replace(/\s+/g, ' ').slice(one.text.indexOf('What to buy'), one.text.indexOf('What to buy') + 200));
    check('a track named with markup is text in the heading, and nothing ran', /<img src=x/.test(one.h1) && one.imgs === 0 && !one.pwned, one.h1);
    check('the plan has a mark for every row and the corner', one.svg >= one.rows);
    await page.evaluate(`(() => { const s = document.querySelector('#tb-sheet select'); s.value = 'ne'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.sleep(200);
    const other = await sheet();
    check('measured from another corner the measurements are different', other.firstX !== one.firstX && /north east/.test(other.text), `${one.firstX} then ${other.firstX}`);
    await page.cdp.send('Emulation.setEmulatedMedia', { media: 'print' }, page.sessionId);
    await page.sleep(200);
    const printed = await json(page, `({
      app: getComputedStyle(document.getElementById('tb-app')).display,
      bar: getComputedStyle(document.querySelector('.tb-sheet-bar')).display,
      position: getComputedStyle(document.getElementById('tb-sheet')).position,
      sheet: getComputedStyle(document.querySelector('.tb-sheet-page')).display,
    })`);
    await page.cdp.send('Emulation.setEmulatedMedia', { media: '' }, page.sessionId);
    check('printing shows the sheet and nothing else: the builder is hidden, the bar with it', printed.app === 'none' && printed.bar === 'none' && printed.position === 'static' && printed.sheet !== 'none', JSON.stringify(printed));
    await key(page, 'Escape');
    check('Escape closes it', (await sheet()) === null);
    /* The lap bar has it too: a pilot in the hall does not hunt through a menu. */
    const lap = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-lapbar button')].find((x) => x.textContent === 'Build sheet'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    check('the bar along the foot has a Build sheet button', Boolean(lap));
    if (lap) {
      await click(page, lap.x, lap.y);
      check('which opens it', (await sheet()) !== null);
      await key(page, 'Escape');
    }
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A TRACK DRAWN IN THE FPV EVENTS DESIGNER, pasted or chosen. The fixture is synthetic
 * with the shapes of a real one. What is asserted is what the pilot sees: it opens as a
 * whoop track named for where it came from, a dialog says what was kept, changed and
 * left out, and text that is not a track is refused in a sentence and changes nothing.
 */
kase('import from the designer', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    const fixture = {
      id: 'synthetic', name: 'Synthetic',
      data: {
        arena: { w: 6, d: 6, h: 3 },
        gates: [
          { typeId: 'square-75', x: 1, z: 2, height: 0, rotY: 0, dir: 'forward', prop: false },
          { typeId: 'square-75', x: 3, z: 2, height: 0, rotY: 1.571, dir: 'back', prop: false },
          { typeId: 'tall-pole-2m', x: 4, z: 4, height: 0, rotY: 0, dir: 'forward', prop: false },
          { typeId: 'tinywhoop-cube', x: 2, z: 5, height: 0, rotY: 0, dir: 'top>right', prop: false },
          { typeId: 'devon-banner', x: 0, z: 1, height: 0.1, rotY: 1.571, dir: 'forward', prop: true },
        ],
        measurements: [[[1, 0, 2], [3, 0, 2]]],
      },
    };
    await menu(page, 'Import');
    await page.until("!!document.querySelector('#tb-modal textarea.tb-paste')", 5000);
    check('Import offers a file and a place to paste', await page.evaluate("[...document.querySelectorAll('#tb-modal button')].some((b) => b.textContent === 'Choose a file') && !!document.querySelector('#tb-modal textarea')"));
    await page.evaluate(`(() => { const t = document.querySelector('#tb-modal textarea.tb-paste'); t.value = ${JSON.stringify(JSON.stringify(fixture))}; return 1; })()`);
    const go = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-modal button')].find((x) => x.textContent === 'Import pasted text'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, go.x, go.y);
    await page.until("!!document.querySelector('#tb-modal h2') && /came across/.test(document.querySelector('#tb-modal h2').textContent)", 10000);
    const doc = await json(page, '({ name: window.trackBuilder.doc.name, cls: window.trackBuilder.doc.trackClass, types: window.trackBuilder.doc.elements.map((e) => e.type), seq: window.trackBuilder.doc.sequence.length, grouped: window.trackBuilder.doc.elements.filter((e) => e.group).length })');
    check('it opens as a whoop track named for where it came from', doc.cls === 'micro' && doc.name === 'Synthetic (from the FPV Events designer)', doc.name);
    check('two gates and a pole, their cube as a cube of five gates in the flying order in two passes, and the banner standing in the room and not flown',
      doc.types.join() === 'gate,gate,pole,gate,gate,gate,gate,gate,banner' && doc.grouped === 5 && doc.seq === 5, `${doc.types.join()} ${doc.seq} ${doc.grouped}`);
    const said = await page.evaluate("document.getElementById('tb-modal').textContent");
    check('the dialog says what was kept, changed and left out, and that the banner became one of ours',
      /Kept/.test(said) && /Changed/.test(said) && /Left out/.test(said) && /it became a banner/.test(said) && /cube/.test(said) && /tape measurement/.test(said), said.slice(0, 200));
    await key(page, 'Escape');
    await page.evaluate("window.trackBuilder.closeModal(), 1");
    await menu(page, 'Import');
    await page.evaluate(`(() => { const t = document.querySelector('#tb-modal textarea.tb-paste'); t.value = 'this is not a track'; return 1; })()`);
    const go2 = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-modal button')].find((x) => x.textContent === 'Import pasted text'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const before = await page.evaluate('window.trackBuilder.doc.name');
    await click(page, go2.x, go2.y);
    check('text that is not a track is refused in a sentence and changes nothing', /Could not import/.test((await toasts(page)).join(' ')) && (await page.evaluate('window.trackBuilder.doc.name')) === before, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/* ------------------------------------------------------------------ */
/* A piece flown more than once                                        */
/* ------------------------------------------------------------------ */

/* The passes module's own answers, asked of the page's live document, so what is on
 * the screen is held to what the pure functions say about the same track. */
const passFacts = async (page, body) => JSON.parse(await page.evaluate(`(async () => {
  const P = await import('/src/trackbuilder/passes.js');
  const doc = window.trackBuilder.doc;
  return JSON.stringify((() => { ${body} })());
})()`));

/* Where a piece of the page is, measured twice a frame apart until it stops: a strip
 * scrolls a chip into view, the room spreads its tags apart, and a press has to be
 * aimed at where the thing ended up. */
async function settled(page, selector, { scroll = false } = {}) {
  const measure = () => json(page, `(() => {
    const n = document.querySelector(${JSON.stringify(selector)});
    if (!n) return null;
    ${scroll ? 'n.scrollIntoView({ block: "nearest", inline: "nearest" });' : ''}
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
  let last = await measure();
  for (let i = 0; i < 25; i += 1) {
    await page.sleep(120);
    const now = await measure();
    if (now && last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5) {
      return now;
    }
    last = now;
  }
  return last;
}

const chipOf = (seq) => `.tb-strip .tb-chip[data-seq="${seq}"]`;
const seqIds = (page) => json(page, 'window.trackBuilder.doc.sequence.map((q) => q.id)');
const focusOf = (page) => page.evaluate('window.trackBuilder.focusedPass()');

/*
 * A PIECE FLOWN MORE THAN ONCE IS ONE PIECE IN THE ROOM, AND ITS PASSES ARE ON A
 * STRIP. Track 8 flies 14 pieces 29 times, and the room used to hang 29 numbers,
 * 29 pairs of panes and 29 arrows on them. What is asserted is what a pilot does:
 * point at a pass, click it, take it out, fly it again, and see the same pass lit
 * on the strip, in the room and on the card, without looking having made an edit.
 */
kase('one piece, many passes', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await loadPreset(page, 'racegow5-track8');
    await page.until('!window.trackBuilder.view3d.dirty', 20000);
    await page.sleep(600);
    const facts = await passFacts(page, `
      const tags = P.tagsOf(doc);
      const most = tags.reduce((a, t) => (t.passes.length > a.passes.length ? t : a), tags[0]);
      return {
        tags: tags.length, reuse: P.reuseOf(doc), sequence: doc.sequence.length,
        most: { elementId: most.elementId, passes: most.passes.map((p) => ({ seqId: p.seq.id, number: p.number })) },
      };`);
    const pole = facts.most;
    check('Track 8 is 14 pieces flown 29 times', facts.reuse.pieces === 14 && facts.reuse.passes === 29, JSON.stringify(facts.reuse));
    check('and its busiest piece is flown six times', pole.passes.length === 6, pole.passes.map((p) => p.number).join(','));

    const tagCount = await page.evaluate("document.querySelectorAll('.tb-numtag').length");
    check('the room has one tag for each opening that is flown, and not one for each pass', tagCount === facts.tags && tagCount < facts.reuse.passes, `${tagCount} tags for ${facts.reuse.passes} passes`);
    const bar = await page.evaluate("document.getElementById('tb-lapbar').textContent");
    check('the lap bar says passes on pieces, and not gates', /Passes\s*29 on 14 pieces/.test(bar) && !/Gates/.test(bar), bar.replace(/\s+/g, ' ').slice(0, 90));

    const chips = await json(page, `[...document.querySelectorAll('.tb-strip .tb-chip[data-seq]')].map((c) => ({ seq: c.dataset.seq, text: c.textContent, bend: c.classList.contains('tb-chip-bend') }))`);
    const ids = await seqIds(page);
    check('the strip has a chip for every pass in flying order, a waypoint as a dot',
      chips.length === ids.length && chips.every((c, i) => c.seq === ids[i]) && chips.filter((c) => !c.bend).map((c) => c.text).join() === Array.from({ length: 29 }, (_, i) => i + 1).join(),
      `${chips.length} chips for ${ids.length} passes`);

    /* A toolbar of buttons: a list item role would take a chip's button role away from a screen reader. */
    check('the strip is a labelled toolbar and its chips are buttons still', (await page.evaluate(`(() => { const s = document.querySelector('.tb-strip'); const c = [...s.querySelectorAll('.tb-chip')]; return s.getAttribute('role') === 'toolbar' && !!s.getAttribute('aria-label') && c.every((x) => x.tagName === 'BUTTON' && !x.hasAttribute('role') && (x.getAttribute('aria-label') || x.textContent)); })()`)));
    /* The whole strip is one stop for Tab, from the start and not only once a chip has been used. */
    const stops = () => json(page, `[...document.querySelectorAll('.tb-strip .tb-chip[tabindex="0"]')].map((c) => c.dataset.seq || 'add')`);
    check('the strip is one tab stop from the start, and not one for each of its chips', (await stops()).length === 1, `${(await stops()).length} tab stops`);

    /* Pointing at a chip lights that pass everywhere and selects nothing. */
    const steps = await undoCount(page);
    const third = pole.passes[2];
    let at = await settled(page, chipOf(third.seqId), { scroll: true });
    await mouse(page, 'mouseMoved', at.x, at.y, 0);
    await page.until(`window.trackBuilder.focusedPass() === '${third.seqId}'`, 5000);
    await page.sleep(300);
    const lit = await json(page, `({ on: [...document.querySelectorAll('.tb-strip .tb-chip.on')].map((c) => c.dataset.seq), current: [...document.querySelectorAll('.tb-strip .tb-chip[aria-current]')].map((c) => c.dataset.seq), ringed: document.querySelectorAll('.tb-strip .tb-chip.linked').length, picked: window.trackBuilder.selection.size, room: window.trackBuilder.view3d.focusSeq })`);
    check('pointing at a chip puts that pass in focus, in the room too, and selects nothing', lit.on.join() === third.seqId && lit.room === third.seqId && lit.picked === 0, JSON.stringify(lit));
    check('and the chip in focus is the one a screen reader is told is current', lit.current.join() === third.seqId, lit.current.join());
    check('and rings the other five passes of the same piece on the strip', lit.ringed === 5, `${lit.ringed} ringed`);
    check('looking is no edit', (await undoCount(page)) === steps);
    await mouse(page, 'mouseMoved', 800, 300, 0);
    await page.until('window.trackBuilder.focusedPass() === null', 5000);
    check('the pointer going away lets the focus go', (await page.evaluate("document.querySelectorAll('.tb-strip .tb-chip.on').length")) === 0);

    /* A click selects the piece and keeps that pass in focus; the card names all six. */
    at = await settled(page, chipOf(third.seqId), { scroll: true });
    await click(page, at.x, at.y);
    await page.until("!document.getElementById('tb-card').hidden", 5000);
    check('a click on a chip selects its piece and puts that pass in focus, and is no edit', (await page.evaluate(`window.trackBuilder.selection.has('${pole.elementId}') && window.trackBuilder.focusedPass() === '${third.seqId}'`)) && (await undoCount(page)) === steps);
    /* The pointer is what the focus follows while it is on a chip. The click's own
     * part is what is left when it goes: the pass stays pinned, and does not fall back
     * to the first pass of the piece. */
    await mouse(page, 'mouseMoved', 800, 300, 0);
    await page.until('window.trackBuilder.passHover === null', 5000);
    await page.sleep(200);
    check('and the pass stays in focus when the pointer has gone', (await focusOf(page)) === third.seqId && (await page.evaluate("document.querySelectorAll('.tb-strip .tb-chip.on').length")) === 1, `${await focusOf(page)} for ${third.seqId}`);
    const card = await json(page, `({ title: document.querySelector('#tb-card .tb-card-head strong, #tb-card strong')?.textContent, chips: [...document.querySelectorAll('#tb-card .tb-card-passes .tb-chip')].map((c) => ({ text: c.textContent, on: c.classList.contains('on') })), buttons: [...document.querySelectorAll('#tb-card button')].map((b) => b.textContent) })`);
    check('the card says the piece is flown six times and lists the passes', /flown 6 times/.test(card.title) && card.chips.map((c) => c.text).join() === pole.passes.map((p) => p.number).join(), `${card.title} | ${card.chips.map((c) => c.text).join()}`);
    check('with this pass filled', card.chips.filter((c) => c.on).map((c) => c.text).join() === String(third.number), card.chips.filter((c) => c.on).map((c) => c.text).join());
    check('and Fly again and Remove piece among its buttons', card.buttons.includes('Fly again') && card.buttons.includes('Remove piece') && card.buttons.includes('Remove this pass'), card.buttons.join(' | '));

    /* The card's own chips turn the focus, and the strip follows. */
    const fifth = pole.passes[4];
    const cardChip = await settled(page, `#tb-card .tb-card-passes .tb-chip[data-seq="${fifth.seqId}"]`);
    await click(page, cardChip.x, cardChip.y);
    await page.until(`window.trackBuilder.focusedPass() === '${fifth.seqId}'`, 5000);
    const turned = await json(page, `({ strip: [...document.querySelectorAll('.tb-strip .tb-chip.on')].map((c) => c.dataset.seq), card: [...document.querySelectorAll('#tb-card .tb-card-passes .tb-chip.on')].map((c) => c.textContent), order: document.querySelector('#tb-card [data-tbkey^="card-order-"]')?.value })`);
    check('a chip on the card turns the focus, and the strip and the card agree', turned.strip.join() === fifth.seqId && turned.card.join() === String(fifth.number) && turned.order === String(fifth.number), JSON.stringify(turned));

    /* Passing over another pass of the piece lights it in the room and leaves the card
     * about the pass that was chosen, even when the card is drawn again meanwhile. */
    const other = pole.passes[1];
    const otherChip = await settled(page, chipOf(other.seqId), { scroll: true });
    await mouse(page, 'mouseMoved', otherChip.x, otherChip.y, 0);
    await page.until(`window.trackBuilder.focusedPass() === '${other.seqId}'`, 5000);
    await page.evaluate(`window.trackBuilder.setSelection(['${pole.elementId}']), 1`);
    await page.sleep(300);
    const passing = await json(page, `({ room: window.trackBuilder.view3d.focusSeq, card: [...document.querySelectorAll('#tb-card .tb-card-passes .tb-chip.on')].map((c) => c.textContent), order: document.querySelector('#tb-card [data-tbkey^="card-order-"]')?.value })`);
    check('passing over another pass lights it in the room and leaves the card about the pass that was chosen', passing.room === other.seqId && passing.card.join() === String(fifth.number) && passing.order === String(fifth.number), JSON.stringify(passing));
    await mouse(page, 'mouseMoved', 800, 300, 0);
    await page.until(`window.trackBuilder.focusedPass() === '${fifth.seqId}'`, 5000);
    check('and the pointer going away puts the room back on the pass that was chosen', true);

    /* Fly again puts one more pass at the end, in focus; Remove this pass takes just that one. */
    const before = await seqIds(page);
    const stepsA = await undoCount(page);
    const fly = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === 'Fly again'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, fly.x, fly.y);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length + 1}`, 5000);
    const after = await seqIds(page);
    const made = await json(page, `window.trackBuilder.doc.sequence[window.trackBuilder.doc.sequence.length - 1]`);
    check('Fly again adds one pass at the end of the lap through this piece, as one undo step', after.slice(0, -1).join() === before.join() && made.elementId === pole.elementId && (await undoCount(page)) === stepsA + 1, `${before.length} then ${after.length}`);
    const tagText = () => page.evaluate(`document.querySelector('.tb-numtag[data-key^="${pole.elementId}"]')?.textContent ?? ''`);
    await page.until(`/\\u00d77/.test(document.querySelector('.tb-numtag[data-key^="${pole.elementId}"]')?.textContent ?? '')`, 5000).catch(() => {});
    check('and the new pass is the one in focus, and the tag says seven', (await focusOf(page)) === made.id && /\u00d77/.test(await tagText()), `${await focusOf(page)} for ${made.id}: ${await tagText()}`);
    await page.sleep(200);
    const rem = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === 'Remove this pass'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, rem.x, rem.y);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length}`, 5000);
    check('Remove this pass takes only that pass, and the lap is as it was', (await seqIds(page)).join() === before.join() && (await page.evaluate(`!!window.trackBuilder.doc.elements.find((e) => e.id === '${pole.elementId}')`)));

    /* Delete on a chip takes that pass out and only that pass, and moves on to the next chip. */
    const victim = pole.passes[3];
    at = await settled(page, chipOf(victim.seqId), { scroll: true });
    await click(page, at.x, at.y);
    const stepsD = await undoCount(page);
    const elementsBefore = JSON.stringify(await elements(page));
    await key(page, 'Delete');
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length - 1}`, 5000);
    const gone = await seqIds(page);
    check('Delete on a chip takes that pass out of the lap and only that pass, as one undo step', gone.join() === before.filter((s) => s !== victim.seqId).join() && (await undoCount(page)) === stepsD + 1);
    check('the piece is still where it stood, and its other passes are still flown', JSON.stringify(await elements(page)) === elementsBefore);
    const next = before[before.indexOf(victim.seqId) + 1];
    await page.until(`document.activeElement && document.activeElement.dataset && document.activeElement.dataset.seq === '${next}'`, 5000).catch(() => {});
    const active = await page.evaluate('(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.seq) || document.activeElement.tagName');
    check('and the keyboard moves on to the next chip', active === next, `${active} for ${next}`);
    await key(page, 'KeyZ', 2);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length}`, 5000);
    check('Control Z brings that pass back in the same place', (await seqIds(page)).join() === before.join());

    /* Arrow keys on a chip walk the strip and nudge nothing. */
    at = await settled(page, chipOf(before[1]), { scroll: true });
    await click(page, at.x, at.y);
    const stepsK = await undoCount(page);
    const placed = JSON.stringify(await elements(page));
    await key(page, 'ArrowRight');
    await page.sleep(150);
    check('the arrow keys walk the strip and move nothing', (await page.evaluate('document.activeElement && document.activeElement.dataset && document.activeElement.dataset.seq')) === before[2]
      && JSON.stringify(await elements(page)) === placed && (await undoCount(page)) === stepsK);
    /* And the stop is the chip that last had the keyboard. */
    check('the tab stop is the chip the keyboard is on', (await stops()).join() === before[2], (await stops()).join());
    await key(page, 'Tab');
    check('Tab leaves the strip in one press', await page.evaluate("!document.activeElement.closest('.tb-strip')"));
    await key(page, 'Tab', 8);
    check('and Shift Tab comes back to the chip it left', (await page.evaluate('document.activeElement && document.activeElement.dataset && document.activeElement.dataset.seq')) === before[2]);
    /* An edit that makes the strip again does not take the keyboard from the pass that had it. */
    await page.evaluate(`window.trackBuilder.flyPieceAgain('${pole.elementId}', 0), 1`);
    await page.sleep(400);
    check('an edit that repaints the strip gives the keyboard back to the same pass', (await page.evaluate('document.activeElement && document.activeElement.dataset && document.activeElement.dataset.seq')) === before[2]);
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.until(`window.trackBuilder.doc.sequence.map((q) => q.id).join() === '${before.join()}'`, 5000);

    /* A drag on the strip moves a pass in the order. The drag is the page's own drag
     * and drop events, because the browser's is not one a protocol can start. */
    const moving = before[4];
    const target = before[1];
    const stepsM = await undoCount(page);
    await page.evaluate(`(() => {
      const from = document.querySelector('${chipOf(moving)}');
      const to = document.querySelector('${chipOf(target)}');
      const data = new DataTransfer();
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
      to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
      to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
      from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }));
      return 1;
    })()`);
    await page.sleep(300);
    const dragged = await seqIds(page);
    check('dragging a chip onto another moves that pass there, as one undo step', dragged.indexOf(moving) === before.indexOf(target) && dragged.length === before.length && (await undoCount(page)) === stepsM + 1, `${before.indexOf(moving)} to ${dragged.indexOf(moving)}`);
    await key(page, 'KeyZ', 2);
    await page.until(`window.trackBuilder.doc.sequence.map((q) => q.id).join() === '${before.join()}'`, 5000);
    check('and Control Z puts it back', true);

    /* The tag in the room: pointed at, it opens into a chip for each of the six. */
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(300);
    const tagAt = await settled(page, `.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble`);
    await mouse(page, 'mouseMoved', tagAt.x, tagAt.y, 0);
    await page.until(`document.querySelectorAll('.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble').length === 6`, 5000);
    const opened = await json(page, `[...document.querySelectorAll('.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble')].map((c) => c.firstChild.textContent)`);
    check('pointed at, the tag opens into a chip for each pass', opened.join() === pole.passes.map((p) => p.number).join(), opened.join());
    const chip24 = await settled(page, `.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble[data-seq="${pole.passes[4].seqId}"]`);
    await mouse(page, 'mouseMoved', chip24.x, chip24.y, 0);
    await page.until(`window.trackBuilder.focusedPass() === '${pole.passes[4].seqId}'`, 5000);
    check('and the pass under the pointer is the pass in focus, on the strip as well', (await page.evaluate(`document.querySelector('.tb-strip .tb-chip.on')?.dataset.seq`)) === pole.passes[4].seqId);
    await mouse(page, 'mouseMoved', 800, 200, 0);
    await page.until('window.trackBuilder.focusedPass() === null', 5000);
    check('the pointer going away closes it again', (await page.evaluate(`document.querySelectorAll('.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble').length`)) === 1);

    /* A double click on one chip of an opened tag gives that pass another place. */
    await page.evaluate(`window.trackBuilder.setSelection(['${pole.elementId}']), 1`);
    await page.sleep(400);
    const second = pole.passes[1];
    const chip4 = await settled(page, `.tb-numtag[data-key^="${pole.elementId}"] .tb-bubble[data-seq="${second.seqId}"]`);
    const stepsR = await undoCount(page);
    await doubleClick(page, chip4.x, chip4.y);
    await page.until("!!document.querySelector('.tb-bubble-input')", 5000);
    await page.evaluate("(() => { const i = document.querySelector('.tb-bubble-input'); i.value = '10'; return 1; })()");
    await key(page, 'Enter');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const renum = await seqIds(page);
    check('a double click on the second chip, 10 and Enter, gives that pass the tenth place, as one undo step', renum[9] === second.seqId && renum.length === before.length && (await undoCount(page)) === stepsR + 1, `now at ${renum.indexOf(second.seqId) + 1}`);
    await key(page, 'KeyZ', 2);
    await page.until(`window.trackBuilder.doc.sequence.map((q) => q.id).join() === '${before.join()}'`, 5000);
    check('and Control Z puts it back', true);

    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE PLAN SAYS THE SAME THING. Drawn on a canvas and not in the page, so this reads the
 * pixels: the tag of the pass in focus is lit, the tags of pieces the focus is not about
 * are drawn back, and a piece flown more than once shows its count and not a stack of
 * numbers.
 */
kase('the plan shows one tag for each opening', async () => {
  const page = await openBuilder();
  try {
    await loadPreset(page, 'racegow5-track8');
    await page.until('!window.trackBuilder.view3d.dirty', 20000);
    await page.evaluate("window.trackBuilder.setMode('2d'), 1");
    await page.sleep(500);
    const facts = await passFacts(page, `
      const tags = P.tagsOf(doc);
      const most = tags.reduce((a, t) => (t.passes.length > a.passes.length ? t : a), tags[0]);
      const single = tags.find((t) => t.passes.length === 1 && t.apertureIndex === 0 && t.elementId !== most.elementId);
      return { most: most.elementId, single: single.elementId };`);
    /* The pixel under the left of a tag's circle, clear of the digit written in the middle. */
    const tagPixel = (id) => json(page, `(() => {
      const v = window.trackBuilder.view2d;
      const el = window.trackBuilder.doc.elements.find((e) => e.id === '${id}');
      const c = v.toScreen(el.position);
      const d = v.canvas.getContext('2d').getImageData(Math.round((c.x - 6.5) * v.dpr), Math.round((c.y - 13) * v.dpr), 1, 1).data;
      return [d[0], d[1], d[2]];
    })()`);
    const amber = ([r, g, b]) => r > 235 && g > 190 && g < 230 && b < 140;
    const cream = ([r, g, b]) => r > 230 && g > 215 && b > 185;
    await page.evaluate("window.trackBuilder.setSelection([]), 1");
    await page.sleep(400);
    check('nothing selected, the tags are cream', cream(await tagPixel(facts.single)), (await tagPixel(facts.single)).join());
    await page.evaluate(`window.trackBuilder.setSelection(['${facts.most}']), 1`);
    await page.sleep(500);
    const lit = await tagPixel(facts.most);
    const other = await tagPixel(facts.single);
    check('the piece selected has the pass in focus lit in amber', amber(lit), lit.join());
    check('and the tag of a piece the focus is not about is drawn back, and is not amber', !amber(other) && !cream(other), other.join());
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE FLY ORDER TOOL BUILDS A LAP FROM NOTHING, BY CLICKING THE PIECES IN THE ORDER
 * THEY ARE FLOWN. A click on a piece again is another pass through it, Backspace takes
 * the last pass off, Start over empties the order, and Escape puts the tool away. Every
 * click is one undo step, and none of it is a toast.
 */
kase('fly order', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      const put = (t, x, y) => { app.arm(t); app.placeAt({ x, y, z: 0 }); app.disarm(); };
      put('gate', 4.2, 5.2); put('gate', 5.8, 5.2); put('gate', 5.0, 7.0); put('pole', 5.0, 6.0);
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    await page.sleep(400);
    const els = await json(page, "window.trackBuilder.doc.elements.map((e) => ({ id: e.id, type: e.type, x: e.position.x, y: e.position.y }))");
    const [g1, g2, g3, pole] = els;
    check('a lap of three gates and a pole is laid down in the order they were placed', (await seqIds(page)).length === 4);

    await key(page, 'KeyN');
    check('N arms the Fly order tool, and the coach says what a click does now', (await page.evaluate('window.trackBuilder.armed')) === 'route' && /Fly order/.test(await page.evaluate("document.getElementById('tb-coach').textContent")), await page.evaluate("document.getElementById('tb-coach').textContent"));
    /* With a tool in the hand a press is for the tool: the numbers and the marks let it through. */
    const lets = () => page.evaluate("(() => { const n = [...document.querySelectorAll('.tb-bubble, .tb-warnbadge')]; return n.length > 0 && n.every((x) => getComputedStyle(x).pointerEvents === 'none'); })()");
    /* Waited for, because the numbers are drawn a frame after the key is pressed and a
     * machine that is busy draws them late: the first full run on a loaded machine found
     * the list empty and called that a failure. A number that never lets a press through
     * still fails, after the wait. */
    await page.until("(() => { const n = [...document.querySelectorAll('.tb-bubble, .tb-warnbadge')]; return n.length > 0 && n.every((x) => getComputedStyle(x).pointerEvents === 'none'); })()", 3000).catch(() => {});
    check('with the tool armed the numbers and marks let a press through to the piece under them', await lets());
    const stepsS = await undoCount(page);
    const start = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-lapbar button')].find((x) => x.textContent === 'Start over'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    check('the lap bar has a Start over while there is an order', start != null);
    check('and nothing that can be pressed floats over the room in the coach, where it would take a tap meant for a piece', (await page.evaluate("document.querySelectorAll('#tb-coach button, #tb-coach a').length")) === 0);
    await click(page, start.x, start.y);
    check('Start over empties the order and keeps the pieces, as one undo step', (await seqIds(page)).length === 0 && (await elements(page)).length === 4 && (await undoCount(page)) === stepsS + 1);
    check('and the tool stays in the hand, with no Start over left to press on an empty order', (await page.evaluate('window.trackBuilder.armed')) === 'route'
      && !(await page.evaluate("[...document.querySelectorAll('#tb-lapbar button')].some((x) => x.textContent === 'Start over')")));

    const lap = [[g1, 0.4], [g2, 0.4], [pole, 0.9], [g2, 0.4], [g3, 0.4], [pole, 0.9], [g1, 0.4]];
    const stepsC = await undoCount(page);
    for (const [piece, z] of lap) {
      const spot = await screenOf(page, 'view3d', piece.x, piece.y, z);
      await click(page, spot.x, spot.y);
      await page.until('!window.trackBuilder.view3d.dirty', 10000);
    }
    const order = await json(page, 'window.trackBuilder.doc.sequence.map((q) => q.elementId)');
    check('seven clicks are seven passes, in the order they were clicked, a piece twice where it was clicked twice', order.join() === lap.map(([p]) => p.id).join(), order.join());
    check('each click is one undo step', (await undoCount(page)) === stepsC + 7, `${(await undoCount(page)) - stepsC} steps`);
    const last = await json(page, 'window.trackBuilder.doc.sequence[window.trackBuilder.doc.sequence.length - 1]');
    check('the last pass made is the one in focus', (await focusOf(page)) === last.id);
    const bar = await page.evaluate("document.getElementById('tb-lapbar').textContent");
    check('the lap bar says seven passes on four pieces', /Passes\s*7 on 4 pieces/.test(bar), bar.replace(/\s+/g, ' ').slice(0, 80));
    const tags = await json(page, `[...document.querySelectorAll('.tb-numtag')].map((t) => t.textContent.replace(/\\s+/g, ''))`);
    check('four tags, three of them counting two passes', tags.length === 4 && tags.filter((t) => /\u00d72/.test(t)).length === 3, tags.join(' '));

    await key(page, 'Backspace');
    await page.until('window.trackBuilder.doc.sequence.length === 6', 5000);
    check('Backspace takes the last pass off, and only it, and the tool stays armed', (await page.evaluate('window.trackBuilder.armed')) === 'route'
      && (await json(page, 'window.trackBuilder.doc.sequence.map((q) => q.elementId)')).join() === lap.slice(0, 6).map(([p]) => p.id).join());
    await key(page, 'KeyZ', 2);
    await page.until('window.trackBuilder.doc.sequence.length === 7', 5000);
    check('Control Z puts it back', true);

    /* Escape puts the tool away, and a click is then only a selection. */
    await key(page, 'Escape');
    check('Escape puts the tool away', (await page.evaluate('window.trackBuilder.armed')) === null);
    await page.sleep(300);
    check('and the numbers and marks take a press again', !(await lets()));
    const spot = await screenOf(page, 'view3d', g3.x, g3.y, 0.4);
    const stepsE = await undoCount(page);
    await click(page, spot.x, spot.y);
    check('and a click on a piece then only selects it', (await page.evaluate(`window.trackBuilder.selection.has('${g3.id}')`)) && (await seqIds(page)).length === 7 && (await undoCount(page)) === stepsE);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE SAME BY TOUCH, on a tablet: a tap on a chip looks at a pass, the card lists the passes
 * as chips a finger can press, Fly again is a tap, and the Fly order tool is a tap on its chip
 * and then a tap on each piece, put away by tapping the chip again because there is no Escape.
 */
kase('passes by touch', async () => {
  const page = await openBuilder('?class=micro', 1024, 768, { touch: true });
  try {
    await trapToasts(page);
    await loadPreset(page, 'racegow5-track8');
    await page.until('!window.trackBuilder.view3d.dirty', 20000);
    await page.sleep(700);
    const facts = await passFacts(page, `
      const tags = P.tagsOf(doc);
      const most = tags.reduce((a, t) => (t.passes.length > a.passes.length ? t : a), tags[0]);
      return { most: { elementId: most.elementId, passes: most.passes.map((p) => ({ seqId: p.seq.id, number: p.number })) } };`);
    const pole = facts.most;
    const third = pole.passes[2];
    const before = await seqIds(page);
    const steps = await undoCount(page);

    let at = await settled(page, chipOf(third.seqId), { scroll: true });
    await tap(page, at);
    await page.until(`window.trackBuilder.selection.has('${pole.elementId}')`, 5000);
    check('a tap on a chip selects its piece and puts that pass in focus, and is no edit', (await focusOf(page)) === third.seqId && (await undoCount(page)) === steps);
    const chipSize = await json(page, `[...document.querySelectorAll('.tb-strip .tb-chip')].map((c) => c.getBoundingClientRect().height)`);
    check('every chip on the strip is a finger tall', chipSize.length === before.length + 1 && chipSize.every((h) => h >= 43.5), `${Math.min(...chipSize)} px at the least`);

    await page.until("!document.getElementById('tb-card').hidden", 5000);
    const said = await page.evaluate("document.querySelector('#tb-card .tb-card-sub')?.textContent ?? ''");
    check('the touched card names the pass it is about and says how often the piece is flown, with no row of chips',
      new RegExp(`Flown 6 times, this is pass ${third.number}`).test(said) && !(await page.evaluate("!!document.querySelector('#tb-card .tb-card-passes')")), said);

    /* Another pass of the piece is a tap on its chip on the strip, and the card turns to it. */
    const fifth = pole.passes[4];
    const fifthChip = await settled(page, chipOf(fifth.seqId), { scroll: true });
    await tap(page, fifthChip);
    await page.until(`window.trackBuilder.focusedPass() === '${fifth.seqId}'`, 5000);
    await page.sleep(300);
    const said2 = await page.evaluate("document.querySelector('#tb-card .tb-card-sub')?.textContent ?? ''");
    check('a tap on another pass of the piece on the strip turns the card to it', new RegExp(`this is pass ${fifth.number}$`).test(said2), said2);

    /* Remove pass takes just that pass, and one Undo brings it back. */
    const rp = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === 'Remove pass'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; })()`);
    check('the card has a Remove pass a finger tall', rp != null && rp.h >= 43.5, rp ? `${rp.h} px` : 'no such button');
    await tap(page, rp);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length - 1}`, 5000);
    check('and a tap on it takes that pass out, only that pass, and leaves the piece', (await seqIds(page)).join() === before.filter((q) => q !== fifth.seqId).join() && (await page.evaluate(`!!window.trackBuilder.doc.elements.find((e) => e.id === '${pole.elementId}')`)));
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length}`, 5000);
    await page.evaluate(`window.trackBuilder.setSelection(['${pole.elementId}']), 1`);
    await page.sleep(600);

    const fly = await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === 'Fly again'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    check('the small bar of the card has Fly again on a touched screen', fly != null);
    await tap(page, fly);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length + 1}`, 5000);
    check('a tap on Fly again makes one more pass through the piece, in focus', (await page.evaluate('window.trackBuilder.doc.sequence.at(-1).elementId')) === pole.elementId && (await page.evaluate('window.trackBuilder.focusedPass() === window.trackBuilder.doc.sequence.at(-1).id')));
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length}`, 5000);

    /* Fly order: the chip on the strip arms it, a tap on a piece is a pass, the chip again puts it away. */
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(300);
    const add = await settled(page, '.tb-strip .tb-chip-add', { scroll: true });
    await tap(page, add);
    check('a tap on the plus chip arms Fly order', (await page.evaluate('window.trackBuilder.armed')) === 'route' && (await page.evaluate("document.querySelector('.tb-chip-add').classList.contains('on')")));
    const bar = await json(page, `(() => { const r = document.getElementById('tb-lapbar').getBoundingClientRect(); return r.top; })()`);
    const gates = await json(page, `window.trackBuilder.doc.elements.filter((e) => e.type === 'gate').map((e) => ({ id: e.id, x: e.position.x, y: e.position.y }))`);
    /* A gate that a tap on its middle picks as itself, clear of the bar: on a track this
     * close, a gate's middle can be the body of another piece in front of it. */
    let aim = null;
    for (const g of gates) {
      const p = await screenOf(page, 'view3d', g.x, g.y, 0.4);
      if (!p || !(p.x > 60 && p.x < 960 && p.y > 140 && p.y < bar - 60)) {
        continue;
      }
      const picked = await page.evaluate(`(() => { const h = window.trackBuilder.view3d.pickHit({ clientX: ${p.x}, clientY: ${p.y}, pointerType: 'touch' }); return h && !h.ring ? h.id : null; })()`);
      if (picked === g.id) {
        aim = { g, p };
        break;
      }
    }
    check('there is a gate in the room to tap, clear of the bar', aim != null);
    const stepsT = await undoCount(page);
    await tap(page, aim.p);
    await page.until(`window.trackBuilder.doc.sequence.length === ${before.length + 1}`, 5000);
    check('a tap on a piece with the tool armed is one more pass through it, as one undo step, and the tool stays armed',
      (await page.evaluate('window.trackBuilder.doc.sequence.at(-1).elementId')) === aim.g.id && (await undoCount(page)) === stepsT + 1 && (await page.evaluate('window.trackBuilder.armed')) === 'route');
    const away = await settled(page, '.tb-strip .tb-chip-add', { scroll: true });
    await tap(page, away);
    check('and the plus chip again puts the tool away', (await page.evaluate('window.trackBuilder.armed')) === null);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/* ------------------------------------------------------------------ */

/*
 * THE FURNITURE OF A ROOM. A table, a chair and a banner are on the palette after the
 * barrier, with an empty key chip because the letters ran out. They go down where the
 * pointer clicks, stand on the floor at a quarter turn, and the room draws each from the
 * boxes it is made of, so a click on a leg picks the table and a click where there is
 * only air under the top does not. They turn in quarter turns whatever is typed, and the
 * plan picks them where the room does.
 */
kase('furniture', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    const palette = await json(page, `[...document.querySelectorAll('#tb-palette .tb-tool')].map((b) => ({
      label: b.querySelector('.tb-tool-label').textContent,
      key: b.querySelector('.tb-tool-key').textContent,
      none: b.querySelector('.tb-tool-key').classList.contains('none'),
    }))`);
    const labels = palette.map((p) => p.label);
    const after = labels.indexOf('Barrier');
    check('the palette lists a table, a chair and a banner after the barrier and before the waypoint',
      labels.slice(after + 1, after + 4).join() === 'Table,Chair,Banner' && labels[after + 4] === 'Waypoint', labels.join());
    check('each with an empty key chip, and no word "undefined" anywhere on it',
      palette.slice(after + 1, after + 4).every((p) => p.key === '' && p.none)
      && !/undefined/.test(await page.evaluate("document.getElementById('tb-palette').textContent")));

    const boxCount = (id) => page.evaluate(`window.trackBuilder.view3d.pickables.filter((m) => m.userData.elementId === '${id}').length`);
    const floor = await screenOf(page, 'view3d', 5, 6, 0);
    await tool(page, 'Table');
    check('pressing Table arms it', (await page.evaluate('window.trackBuilder.armed')) === 'table');
    await mouse(page, 'mouseMoved', floor.x, floor.y, 0);
    await page.until('!!window.trackBuilder.view3d.ghostGroup', 5000).catch(() => {});
    check('the ghost under the pointer is a table: five boxes, not a slab', (await page.evaluate(`(() => {
      let n = 0;
      const g = window.trackBuilder.view3d.ghostGroup;
      if (g) g.traverse((o) => { if (o.isMesh && o.geometry.type === 'BoxGeometry') n += 1; });
      return n;
    })()`)) === 5);
    const steps = await undoCount(page);
    await click(page, floor.x, floor.y);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const table = (await elements(page)).find((e) => e.type === 'table');
    check('a click puts a table down where it was clicked, on the floor, at a quarter turn, as one undo step',
      Boolean(table) && Math.abs(table.x - 5) < 0.06 && Math.abs(table.y - 6) < 0.06 && table.z === 0
      && Math.abs(table.yaw / (Math.PI / 2) - Math.round(table.yaw / (Math.PI / 2))) < 1e-6 && (await undoCount(page)) === steps + 1,
      JSON.stringify(table));
    check('the tool stays armed for the next one, and Escape puts it away', (await page.evaluate('window.trackBuilder.armed')) === 'table');
    await key(page, 'Escape');
    check('Escape disarms it', (await page.evaluate('window.trackBuilder.armed')) == null);
    check('it is not a step in the flying order', (await page.evaluate('window.trackBuilder.doc.sequence.length')) === 0);

    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('chair');
      app.placeAt({ x: 7, y: 6, z: 0 });
      app.arm('banner');
      app.placeAt({ x: 5, y: 8, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const list = await elements(page);
    const chair = list.find((e) => e.type === 'chair');
    const banner = list.find((e) => e.type === 'banner');
    check('the room draws each from its boxes: five for the table, six for the chair, three for the banner',
      (await boxCount(table.id)) === 5 && (await boxCount(chair.id)) === 6 && (await boxCount(banner.id)) === 3,
      `${await boxCount(table.id)}, ${await boxCount(chair.id)}, ${await boxCount(banner.id)}`);

    /* Where a click lands. The table's own boxes, in the room's frame. */
    const bits = JSON.parse(await page.evaluate(`(async () => {
      const { roomBoxes } = await import('/src/props/room.js');
      const el = window.trackBuilder.doc.elements.find((e) => e.id === '${table.id}');
      return JSON.stringify({ boxes: roomBoxes('table', el.dims), at: el.position, dims: el.dims });
    })()`));
    const leg = bits.boxes.find((b) => b.name === 'table leg');
    const legAt = await screenOf(page, 'view3d', table.x + (leg.lo[0] + leg.hi[0]) / 2, table.y + (leg.lo[1] + leg.hi[1]) / 2, 0.3);
    await click(page, legAt.x, legAt.y);
    check('a click on a leg picks the table', await page.evaluate(`window.trackBuilder.selection.has('${table.id}')`));
    check('and the card names it', await page.evaluate("/Table/.test(document.getElementById('tb-card').textContent)"),
      await page.evaluate("document.getElementById('tb-card').textContent.slice(0, 80)"));
    const dimFields = await json(page, `[...document.querySelectorAll('#tb-inspector [data-tbkey^="dim-"]')].map((i) => i.dataset.tbkey.split('-').pop())`);
    check('the inspector offers a width, a depth and a height and nothing else', dimFields.join() === 'width,depth,height', dimFields.join());
    const sized = await json(page, `[...document.querySelectorAll('#tb-inspector [data-tbkey^="dim-"]')].map((i) => ({ min: i.min, max: i.max }))`);
    /* In inches, as everything on the whoop canvas is (MENUS-PLAN.md 4.2a): the same 0.05 to 6 m. */
    check('each held to what a room can have, 0.05 to 6 m, given in inches', sized.every((f) => Math.abs(Number(f.min) * 0.0254 - 0.05) < 1e-9 && Math.abs(Number(f.max) * 0.0254 - 6) < 1e-9), JSON.stringify(sized));

    /* Turning. Q turns a quarter and typing a heading snaps to one, and says why once. */
    const yawOf = async () => (await elements(page)).find((e) => e.id === table.id).yaw;
    const y0 = await yawOf();
    await key(page, 'KeyQ');
    check('Q turns it a quarter', Math.abs(Math.abs((await yawOf()) - y0) - Math.PI / 2) < 1e-4, `${y0} then ${await yawOf()}`);
    const typeYaw = async (deg) => {
      await page.evaluate(`(() => {
        const i = document.querySelector('#tb-inspector [data-tbkey="yaw-${table.id}"]');
        i.value = '${deg}';
        i.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
      })()`);
      await page.sleep(200);
    };
    await typeYaw(40);
    check('a heading of 40 degrees typed in is the nearest quarter, 0', Math.abs(await yawOf()) < 1e-6, String(await yawOf()));
    check('and the page says why, once, in words about furniture and not about buildings',
      (await toasts(page)).length === 1 && /table, a chair or a banner turns in quarter turns/.test((await toasts(page))[0]) && !/Buildings/.test((await toasts(page))[0]), (await toasts(page)).join(' | '));
    await typeYaw(90);
    check('90 degrees is a quarter', Math.abs((await yawOf()) - Math.PI / 2) < 1e-4);

    /* The room draws it turned: its long side now runs along y, so a point half a metre
     * along y at the height of the top is the table and, before the turn, was air. */
    await page.evaluate("window.trackBuilder.setSelection([]), 1");
    await page.sleep(150);
    const topHeight = bits.dims.height - 0.02;
    const along = await screenOf(page, 'view3d', table.x, table.y + 0.5, topHeight);
    await click(page, along.x, along.y);
    check('turned a quarter, a click half a metre along y at the height of the top picks the table',
      await page.evaluate(`window.trackBuilder.selection.has('${table.id}')`));
    await page.evaluate("window.trackBuilder.setSelection([]), 1");
    const before = await screenOf(page, 'view3d', table.x + 0.5, table.y, topHeight);
    await click(page, before.x, before.y);
    check('and half a metre along x at that height, where the top was before the turn, is air and picks nothing',
      await page.evaluate("window.trackBuilder.selection.size === 0"));

    /* The plan picks it where the room does. */
    await page.evaluate("window.trackBuilder.setMode('2d'), 1");
    await page.sleep(300);
    const planAlong = await screenOf(page, 'view2d', table.x, table.y + 0.5);
    await click(page, planAlong.x, planAlong.y);
    check('on the plan, a click half a metre along y picks it too', await page.evaluate(`window.trackBuilder.selection.has('${table.id}')`));
    const planOff = await screenOf(page, 'view2d', table.x + 0.5, table.y);
    await page.evaluate("window.trackBuilder.setSelection([]), 1");
    await click(page, planOff.x, planOff.y);
    check('and half a metre along x, where it was before the turn, picks nothing', await page.evaluate("window.trackBuilder.selection.size === 0"));
    const px = await page.evaluate(`(() => {
      const v = window.trackBuilder.view2d;
      const r = v.canvas.getBoundingClientRect();
      const p = v.toScreen({ x: ${table.x}, y: ${table.y + 0.3} });
      const c = v.canvas.getContext('2d');
      const d = c.getImageData(Math.round(p.x * (v.canvas.width / r.width)), Math.round(p.y * (v.canvas.height / r.height)), 1, 1).data;
      return [d[0], d[1], d[2]];
    })()`);
    check('the plan draws the top of it in the obstacle colour: red in it well above blue', px[0] > px[2] + 40, px.join());

    /* The board knows them, so Publish opens the form and does not turn the author away. */
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('gate');
      app.placeAt({ x: 4, y: 5, z: 0 });
      app.disarm();
      return 1;
    })()`);
    await page.evaluate('window.trackBuilder.publishBtn.click(), 1');
    await page.sleep(250);
    const said = await json(page, `(() => {
      const m = document.getElementById('tb-modal');
      return { open: !m.hidden, title: m.querySelector('h2')?.textContent ?? '', inputs: m.querySelectorAll('input').length };
    })()`);
    check('Publish on a track with a table in it opens the publish form, and does not say the board does not know it',
      said.open && said.title !== 'Not on the board yet' && said.inputs > 0, JSON.stringify(said));
    await page.evaluate("[...document.querySelectorAll('#tb-modal .tb-row-btns .tb-btn')].pop().click(), 1");
    await page.sleep(150);
    check('and closes', await page.evaluate("document.getElementById('tb-modal').hidden"));

    /* Delete and undo. */
    await page.evaluate("window.trackBuilder.setMode('3d'), 1");
    await page.sleep(300);
    await page.evaluate(`window.trackBuilder.setSelection(['${table.id}']), 1`);
    /* The dialog's button was pressed and has gone, and a key goes where the focus was. */
    await page.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur(), 1');
    const count = (await elements(page)).length;
    await key(page, 'Delete');
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    check('Delete removes it, boxes and all', (await elements(page)).length === count - 1 && (await boxCount(table.id)) === 0,
      `${count} elements, then ${(await elements(page)).length}, ${await boxCount(table.id)} boxes drawn`);
    await key(page, 'KeyZ', 2);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    check('and Control Z puts it back, drawn again', (await elements(page)).length === count && (await boxCount(table.id)) === 5);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A HOOP AND A HEX GATE are gates whose hole is not a rectangle. They are armed from the palette and
 * placed with a click like any gate, and they are flown in order, so each is a step; the room draws a
 * ring and a hexagon of tubes and a pane in their shape; the inspector offers one size, because the
 * height follows the shape, and no count of levels and no four sides to take away; the card can turn
 * a gate into either and back; and a track that has one cannot be published to a board that does not
 * know it.
 */
kase('a hoop and a hex gate', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    const palette = await json(page, `[...document.querySelectorAll('#tb-palette .tb-tool')].map((b) => ({
      label: b.querySelector('.tb-tool-label').textContent,
      key: b.querySelector('.tb-tool-key').textContent,
      none: b.querySelector('.tb-tool-key').classList.contains('none'),
    }))`);
    const labels = palette.map((p) => p.label);
    const at = labels.indexOf('Horizontal gate');
    check('the palette lists a hoop and a hex gate after the horizontal gate and before the pole, with no key chip',
      labels.slice(at + 1, at + 4).join() === 'Hoop,Hex gate,Pole' && palette.slice(at + 1, at + 3).every((p) => p.key === '' && p.none), labels.join());

    const parts = (id) => page.evaluate(`window.trackBuilder.view3d.pickables.filter((m) => m.userData.elementId === '${id}').length`);
    const floor = await screenOf(page, 'view3d', 5, 6, 0);
    await tool(page, 'Hoop');
    check('pressing Hoop arms it', (await page.evaluate('window.trackBuilder.armed')) === 'hoop');
    const steps = await undoCount(page);
    await click(page, floor.x, floor.y);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const hoop = (await elements(page)).find((e) => e.type === 'hoop');
    check('a click puts a hoop down where it was clicked, as one undo step, and it is the first step in the flying order',
      Boolean(hoop) && Math.abs(hoop.x - 5) < 0.06 && Math.abs(hoop.y - 6) < 0.06 && (await undoCount(page)) === steps + 1
      && (await page.evaluate('window.trackBuilder.doc.sequence.length')) === 1, JSON.stringify(hoop));
    await key(page, 'Escape');
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('hexGate');
      app.placeAt({ x: 6.6, y: 6, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const hex = (await elements(page)).find((e) => e.type === 'hexGate');
    check('a hex gate is the second step, and both are gates for the rules: no warning that a piece is out of the order',
      Boolean(hex) && (await page.evaluate('window.trackBuilder.doc.sequence.length')) === 2);

    /* What the room draws: a tube for each side of the shape that is above the floor, one lit pane, the ring's corners. */
    check('the room draws a hoop as twenty two tubes (the two under the floor are not drawn), and a hex gate as its six',
      (await page.evaluate(`window.trackBuilder.view3d.pickables.filter((m) => m.userData.elementId === '${hoop.id}' && m.geometry.type === 'BoxGeometry' && !m.userData.weak && m.visible).length`)) === 22
      && (await page.evaluate(`window.trackBuilder.view3d.pickables.filter((m) => m.userData.elementId === '${hex.id}' && m.geometry.type === 'BoxGeometry' && !m.userData.weak && m.visible).length`)) === 5,
      `${await parts(hoop.id)} and ${await parts(hex.id)} pickable parts`);
    const paneCorners = (id) => page.evaluate(`(() => {
      const m = window.trackBuilder.view3d.pickables.find((x) => x.userData.elementId === '${id}' && x.userData.weak);
      return m ? m.geometry.getAttribute('position').count : 0;
    })()`);
    check('and each is given a pane in its own shape: the hoop\'s is a fan of twenty five points, the hex gate\'s of seven, not a square\'s four',
      (await paneCorners(hoop.id)) === 25 && (await paneCorners(hex.id)) === 7, `${await paneCorners(hoop.id)} and ${await paneCorners(hex.id)}`);

    /* Picking: a click in the middle of the hole picks the piece, as it does a gate. */
    const middle = await screenOf(page, 'view3d', hoop.x, hoop.y, 0.5 * 0.711);
    await click(page, middle.x, middle.y);
    check('a click in the hole of a hoop picks it', await page.evaluate(`window.trackBuilder.selection.has('${hoop.id}')`));
    const fields = await json(page, `[...document.querySelectorAll('#tb-inspector [data-tbkey^="dim-"]')].map((i) => i.dataset.tbkey.split('-').pop())`);
    check('the inspector offers one size and the sill, and no count of levels and no opening height: the height follows the shape',
      fields.join() === 'sillH,clearW', fields.join());
    const label = await page.evaluate(`(() => {
      const i = document.querySelector('#tb-inspector [data-tbkey="dim-${hoop.id}-clearW"]');
      return i ? i.closest('label, div')?.textContent ?? '' : '';
    })()`);
    check('and the width is called a diameter', /Diameter/.test(label), label);
    check('there is no Frame section to take a side away from: a ring has none', !(await page.evaluate("!!document.querySelector('#tb-inspector .tb-frame-grid')")));
    check('the size row says the preset it is: 28 in across', await page.evaluate("/28 in across/.test(document.getElementById('tb-inspector').textContent)"),
      await page.evaluate("document.getElementById('tb-inspector').textContent.slice(0, 200)"));

    /* Typing a diameter keeps it round. The drawer is in inches on this canvas
     * (MENUS-PLAN.md 4.2a), so 0.6 m is typed as the inches it is. */
    const sized = await undoCount(page);
    await page.evaluate(`(() => {
      const i = document.querySelector('#tb-inspector [data-tbkey="dim-${hoop.id}-clearW"]');
      i.value = String(0.6 / 0.0254);
      i.dispatchEvent(new Event('change', { bubbles: true }));
      return 1;
    })()`);
    await page.sleep(250);
    const dimsOf = (id) => json(page, `window.trackBuilder.doc.elements.find((e) => e.id === '${id}').dims`);
    const now = await dimsOf(hoop.id);
    check('typing a diameter of 0.6 m, in inches, sets the width and the height to it, as one undo step', Math.abs(now.clearW - 0.6) < 1e-9 && Math.abs(now.clearH - 0.6) < 1e-9 && (await undoCount(page)) === sized + 1, JSON.stringify(now));
    await page.until('!window.trackBuilder.view3d.dirty', 10000);

    /* The control: a gate beside them still has its four sides, and its levels. */
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('gate');
      app.placeAt({ x: 8.2, y: 6, z: 0 });
      app.disarm();
      const g = app.doc.elements.find((e) => e.type === 'gate');
      app.setSelection([g.id]);
      return 1;
    })()`);
    await page.sleep(250);
    check('and a gate has one, and a count of levels and an opening height, as it always did',
      (await page.evaluate("!!document.querySelector('#tb-inspector .tb-frame-grid')"))
      && (await json(page, `[...document.querySelectorAll('#tb-inspector [data-tbkey^="dim-"]')].map((i) => i.dataset.tbkey.split('-').pop())`)).join() === 'levels,sillH,clearW,clearH');
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.sleep(250);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    await click(page, middle.x, middle.y);

    /* The lap strip's chip is the shape it is a pass of. */
    const kinds = await json(page, `[...document.querySelectorAll('#tb-lapbar .tb-chip[data-kind]')].map((c) => c.dataset.kind)`);
    check('the lap strip marks the two passes as a ring and a hexagon', kinds.join() === 'ring,hex', kinds.join());

    /* Replace with, from the card, both ways. */
    await click(page, middle.x, middle.y);
    const offered = () => json(page, `[...document.querySelectorAll('#tb-card [data-tbkey="card-replace"] option')].map((o) => o.value).filter(Boolean)`);
    check('a hoop can be turned into any other opening, the hex gate among them', (await offered()).join() === 'gate,doubleStack,ladder,tower,diveGate,hexGate', (await offered()).join());
    await page.evaluate(`(() => {
      const s = document.querySelector('#tb-card [data-tbkey="card-replace"]');
      s.value = 'hexGate';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return 1;
    })()`);
    await page.sleep(250);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const swapped = await dimsOf(hoop.id);
    check('turned into a hex gate in place, 0.6 across the points and as high as a hexagon that wide is',
      (await elements(page)).find((e) => e.id === hoop.id).type === 'hexGate' && Math.abs(swapped.clearW - 0.6) < 1e-9 && Math.abs(swapped.clearH - 0.6 * Math.sqrt(3) / 2) < 1e-6, JSON.stringify(swapped));
    await page.evaluate('window.trackBuilder.undo(), 1');
    await page.sleep(250);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    check('and undo puts the hoop back', (await elements(page)).find((e) => e.id === hoop.id).type === 'hoop');

    /* The plan draws them, and picks them. */
    await page.evaluate("window.trackBuilder.setMode('2d'), 1");
    await page.sleep(300);
    const planAt = await screenOf(page, 'view2d', hex.x, hex.y);
    await page.evaluate("window.trackBuilder.setSelection([]), 1");
    await click(page, planAt.x, planAt.y);
    check('on the plan, a click on the hex gate picks it', await page.evaluate(`window.trackBuilder.selection.has('${hex.id}')`));
    await page.evaluate("window.trackBuilder.setMode('3d'), 1");
    await page.sleep(300);

    /* The board has known them since 2026-10-14 (PLAN_APERTURE in the board's
     * src/validate.js), so Publish opens its form as it does for any track. */
    await page.evaluate('window.trackBuilder.publishBtn.click(), 1');
    await page.sleep(250);
    const said = await json(page, `(() => {
      const m = document.getElementById('tb-modal');
      return { open: !m.hidden, text: m.textContent, inputs: m.querySelectorAll('input').length };
    })()`);
    check('Publish on a track with a hoop and a hex gate opens the publish form, as the board takes them',
      said.open && /Publish this track/.test(said.text) && !/Not on the board yet/.test(said.text) && said.inputs > 0, JSON.stringify(said));
    await page.evaluate("[...document.querySelectorAll('#tb-modal .tb-row-btns .tb-btn')].pop().click(), 1");
    await page.sleep(150);

    /* The build sheet counts the six pipes of the hex gate and lists the hoop as a thing to bring. */
    const sheet = JSON.parse(await page.evaluate(`(async () => {
      const { buildSheet } = await import('/src/trackbuilder/buildsheet.js');
      const s = buildSheet(window.trackBuilder.doc);
      return JSON.stringify({ members: s.members, other: s.parts.other, pieces: s.pieces.map((p) => p.label) });
    })()`));
    check('the build sheet has the hex gate\'s six pipes and lists the hoop as one thing to bring', sheet.members === 6 && sheet.other.some((o) => o.label === 'Hoop' && o.count === 1) && sheet.pieces.join() === 'Hoop,Hex gate', JSON.stringify(sheet));

    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A CUBE. RaceGOW's cube is five gates that share their pipe: one tool, one click, one piece for everything
 * a pilot does to it, flown in at one face and out at another. What is asserted is what a hand does and what
 * the game builds: the key and the ghost, the click, picking any face, dragging, turning, copying, removing,
 * undo, what Publish says, and the world the game makes of it, counted in the real game.
 */
kase('a cube', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    const palette = await json(page, `[...document.querySelectorAll('#tb-palette .tb-tool')].map((b) => ({
      label: b.querySelector('.tb-tool-label').textContent,
      key: b.querySelector('.tb-tool-key').textContent,
    }))`);
    const cubeTool = palette.find((p) => p.label === 'Cube');
    check('the palette has a Cube tool with the key K', Boolean(cubeTool) && cubeTool.key === 'K', JSON.stringify(palette.map((p) => p.label)));

    const group = () => json(page, `window.trackBuilder.doc.elements.map((e) => ({ id: e.id, type: e.type, group: e.group ?? null, x: e.position.x, y: e.position.y, z: e.position.z, yaw: e.yaw, pitch: e.pitch, sillH: e.dims.sillH, unbuilt: e.unbuilt === true, sides: e.unbuiltSides ?? null }))`);
    const seq = () => json(page, 'window.trackBuilder.doc.sequence.map((q) => ({ id: q.elementId, entry: q.entry }))');
    const selected = () => json(page, '[...window.trackBuilder.selection].sort()');
    const settle = async () => {
      await page.sleep(200);
      await page.until('!window.trackBuilder.view3d.dirty', 10000);
    };

    /* THE KEY, THE GHOST AND THE CLICK */
    const floor = await screenOf(page, 'view3d', 5, 6, 0);
    await key(page, 'KeyK');
    check('K arms the cube', (await page.evaluate('window.trackBuilder.armed')) === 'cube');
    check('and the coach line says what a click does', await page.evaluate("/cube/i.test(document.getElementById('tb-coach')?.textContent ?? document.body.textContent)"));
    await mouse(page, 'mouseMoved', floor.x, floor.y, 0);
    await page.sleep(400);
    check('with it armed the ghost is the five faces, drawn faint, and none of them can be picked',
      (await page.evaluate('window.trackBuilder.view3d.ghost ? window.trackBuilder.view3d.ghost.items.length : 0')) === 5
      && (await page.evaluate('window.trackBuilder.view3d.ghostGroup ? window.trackBuilder.view3d.ghostGroup.children.length : 0')) === 5
      && (await page.evaluate('window.trackBuilder.doc.elements.length')) === 0);
    const steps = await undoCount(page);
    await click(page, floor.x, floor.y);
    await settle();
    let els = await group();
    check('a click lays five gates of one group as one undo step', els.length === 5 && els.every((e) => e.type === 'gate' && e.group && e.group === els[0].group) && (await undoCount(page)) === steps + 1,
      JSON.stringify(els.map((e) => e.group)));
    const top = els.find((e) => e.unbuilt && Math.abs(e.pitch) > 1);
    const cx = top.x;
    const cy = top.y;
    check('at the point that was clicked: the flat face is over the middle of the cube', Math.abs(cx - 5) < 0.06 && Math.abs(cy - 6) < 0.06, `${cx}, ${cy}`);
    let q = await seq();
    check('flown straight through: two passes, the back and then the front, the back against its normal and the front along it',
      q.length === 2 && q[0].entry === -1 && q[1].entry === 1 && q[0].id !== q[1].id
      && els.find((e) => e.id === q[0].id).x < cx && els.find((e) => e.id === q[1].id).x > cx, JSON.stringify(q));
    check('and all five are selected, the tool staying armed for the next one', (await selected()).length === 5 && (await page.evaluate('window.trackBuilder.armed')) === 'cube');
    await key(page, 'Escape');
    await settle();
    check('Escape puts the tool away, the cube stays picked, and the card says it is a cube',
      (await page.evaluate('window.trackBuilder.armed')) === null && (await selected()).length === 5
      && (await page.evaluate("document.querySelector('#tb-card .tb-card-head strong')?.textContent")) === 'Cube');
    await key(page, 'Escape');
    check('and the next lets go of it', (await selected()).length === 0);
    check('no warning in the lap strip or on any piece for a cube on its own',
      (await json(page, `window.trackBuilder.warnings.filter((w) => w.level === 'warn' && !['no-start'].includes(w.code)).map((w) => w.code)`)).length === 0,
      JSON.stringify(await json(page, `window.trackBuilder.warnings.map((w) => w.code)`)));

    /* PICKING ANY FACE PICKS THE CUBE */
    const left = els.find((e) => Math.abs(e.y - cy) > 0.2 && Math.abs(e.x - cx) < 0.01 && e.y > cy);
    const at = await screenOf(page, 'view3d', left.x, left.y, 0.3556);
    await click(page, at.x, at.y);
    check('a click on one face picks all five', (await selected()).length === 5, JSON.stringify(await selected()));

    /* DRAG IT: every face goes by the same amount, as one step */
    const before = await group();
    const dragFrom = await screenOf(page, 'view3d', left.x, left.y, 0.3556);
    const dragTo = await screenOf(page, 'view3d', left.x + 0.5, left.y - 0.4, 0.3556);
    const stepsDrag = await undoCount(page);
    await drag(page, dragFrom, dragTo);
    await settle();
    let after = await group();
    const moves = after.map((e, i) => ({ dx: e.x - before[i].x, dy: e.y - before[i].y }));
    check('dragging a face moves the whole cube by one and the same amount, as one undo step',
      moves.every((m) => Math.abs(m.dx - moves[0].dx) < 1e-6 && Math.abs(m.dy - moves[0].dy) < 1e-6) && Math.hypot(moves[0].dx, moves[0].dy) > 0.3 && (await undoCount(page)) === stepsDrag + 1,
      JSON.stringify(moves[0]));
    check('and it is still five gates in one group with the two passes', after.length === 5 && new Set(after.map((e) => e.group)).size === 1 && (await seq()).length === 2);

    /* TURN IT */
    const shapeBefore = await group();
    const flat = shapeBefore.find((e) => e.unbuilt && Math.abs(e.pitch) > 1);
    const stepsTurn = await undoCount(page);
    await key(page, 'KeyQ');
    await settle();
    const turned = await group();
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const tf = turned.find((e) => e.id === flat.id);
    check('Q turns the whole cube a quarter about the middle: every face has gone round with it, the flat one has not moved, as one step',
      turned.every((e, i) => Math.abs(Math.abs(wrap(e.yaw - shapeBefore[i].yaw)) - Math.PI / 2) < 1e-4 && Math.abs(wrap(e.yaw - shapeBefore[i].yaw) - wrap(turned[0].yaw - shapeBefore[0].yaw)) < 1e-4)
      && Math.abs(tf.x - flat.x) < 1e-6 && Math.abs(tf.y - flat.y) < 1e-6 && (await undoCount(page)) === stepsTurn + 1);
    const turnAngle = wrap(turned[0].yaw - shapeBefore[0].yaw);
    const rigid = turned.every((e, i) => {
      const ox = shapeBefore[i].x - flat.x;
      const oy = shapeBefore[i].y - flat.y;
      const rx = ox * Math.cos(turnAngle) - oy * Math.sin(turnAngle);
      const ry = ox * Math.sin(turnAngle) + oy * Math.cos(turnAngle);
      return Math.abs(e.x - (flat.x + rx)) < 2e-6 && Math.abs(e.y - (flat.y + ry)) < 2e-6;
    });
    check('and it is the same cube turned, not five gates turned where they stood: each is where the turn puts it', rigid);
    await key(page, 'KeyE');
    await settle();
    const back = await group();
    check('E turns it back to where it was, to the last digit', back.every((e, i) => Math.abs(e.x - shapeBefore[i].x) < 2e-6 && Math.abs(e.y - shapeBefore[i].y) < 2e-6 && Math.abs(wrap(e.yaw - shapeBefore[i].yaw)) < 2e-6));

    /* COPY IT AND REMOVE THE COPY */
    const stepsCopy = await undoCount(page);
    await key(page, 'KeyD', 2);
    await settle();
    els = await group();
    const ids0 = new Set(back.map((e) => e.id));
    const fresh = els.filter((e) => !ids0.has(e.id));
    q = await seq();
    check('Control D makes another cube: five more gates in a group of their own, the copy is what is selected, one step',
      els.length === 10 && fresh.length === 5 && new Set(fresh.map((e) => e.group)).size === 1 && fresh[0].group !== back[0].group
      && (await selected()).length === 5 && (await selected()).every((id) => fresh.some((e) => e.id === id)) && (await undoCount(page)) === stepsCopy + 1, `${els.length} gates`);
    check('and it is flown the way the first is: two more passes, in the same order, through its own back and front', q.length === 4 && q[2].entry === -1 && q[3].entry === 1
      && fresh.some((e) => e.id === q[2].id) && fresh.some((e) => e.id === q[3].id), JSON.stringify(q));
    const stepsDelete = await undoCount(page);
    await key(page, 'Delete');
    await settle();
    check('Delete takes the copy and its passes out, and only them, as one step', (await group()).length === 5 && (await seq()).length === 2 && (await undoCount(page)) === stepsDelete + 1);
    await key(page, 'KeyZ', 2);
    await settle();
    check('and Control Z brings all of it back', (await group()).length === 10 && (await seq()).length === 4);
    await key(page, 'KeyZ', 2);
    await settle();
    check('and one more takes the copy away again, leaving the cube as it was', (await group()).length === 5 && (await seq()).length === 2
      && (await group()).every((e, i) => Math.abs(e.x - back[i].x) < 2e-6 && Math.abs(e.y - back[i].y) < 2e-6));

    /* WHAT THE LAP STRIP AND THE PLAN SHOW */
    const chips = await json(page, `[...document.querySelectorAll('#tb-lapbar .tb-chip')].map((c) => c.textContent + '|' + (c.dataset.kind ?? ''))`);
    check('the lap strip shows the two passes, both gates, and the plus that adds another', chips.join() === '1|gate,2|gate,+|', JSON.stringify(chips));
    await page.evaluate("window.trackBuilder.setMode('2d'), 1");
    await page.sleep(300);
    const planFace = await screenOf(page, 'view2d', left.x + moves[0].dx, left.y + moves[0].dy);
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(300);
    /* A gate that has an upright taken away is drawn with a red cross where it stood. The left and the right of a cube have
     * none of theirs because the front and the back carry them, and a cross at each corner of a cube says something is
     * missing from it. Pixels near the red of the cross, in a window at each corner of the cube. */
    const flatNow = (await group()).find((e) => e.unbuilt && Math.abs(e.pitch) > 1);
    const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => [flatNow.x + sx * 0.3689, flatNow.y + sy * 0.3689]);
    let red = 0;
    for (const [x, y] of corners) {
      const c = await screenOf(page, 'view2d', x, y);
      red += await page.evaluate(`(() => {
        const cv = window.trackBuilder.view2d.canvas;
        const r = cv.getBoundingClientRect();
        const k = cv.width / r.width;
        const px = Math.round((${c.x} - r.left) * k);
        const py = Math.round((${c.y} - r.top) * k);
        const w = Math.round(10 * k);
        const data = cv.getContext('2d').getImageData(px - w, py - w, 2 * w, 2 * w).data;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (Math.abs(data[i] - 255) < 30 && Math.abs(data[i + 1] - 125) < 30 && Math.abs(data[i + 2] - 125) < 30) {
            n += 1;
          }
        }
        return n;
      })()`);
    }
    check('on the plan the corners of a cube carry no red cross: nothing is missing from it', red === 0, `${red} red pixels`);
    await click(page, planFace.x, planFace.y);
    check('on the plan a click on a face picks the whole cube too', (await selected()).length === 5, JSON.stringify(await selected()));
    await page.evaluate("window.trackBuilder.setMode('3d'), 1");
    await page.sleep(300);

    /* THE BOARD TAKES IT: a cube is gates that share a group, stored as sent (the
     * board's src/validate.js, since 2026-10-14). */
    await page.evaluate('window.trackBuilder.publishBtn.click(), 1');
    await page.sleep(250);
    const said = await json(page, `(() => {
      const m = document.getElementById('tb-modal');
      return { open: !m.hidden, text: m.textContent, inputs: m.querySelectorAll('input').length };
    })()`);
    check('Publish on a track with a cube opens the publish form, as the board takes it',
      said.open && /Publish this track/.test(said.text) && !/Not on the board yet/.test(said.text) && said.inputs > 0, JSON.stringify(said));
    await page.evaluate("[...document.querySelectorAll('#tb-modal .tb-row-btns .tb-btn')].pop().click(), 1");
    await page.sleep(150);

    /* THE SHEET: twelve pipes, eight corners */
    const sheet = JSON.parse(await page.evaluate(`(async () => {
      const { buildSheet } = await import('/src/trackbuilder/buildsheet.js');
      const s = buildSheet(window.trackBuilder.doc);
      return JSON.stringify({ members: s.members, fittings: s.parts.fittings });
    })()`));
    check('the build sheet says twelve pipes and eight three way corners for it', sheet.members === 12 && sheet.fittings.some((f) => f.kind === '3-way corner' && f.count === 8), JSON.stringify(sheet));

    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));

    /* THE WORLD: fly it. The game builds every face, counted in the game's own collider set: the front and the
     * back are two uprights, a top bar and two feet each, the left and the right are a top bar each, and the
     * top has no pipe at all. The four stubs are the obstacle kind and the eight tubes the gate kind. */
    await page.evaluate('window.trackBuilder.flyThisTrack(), 1').catch(() => {});
    await page.sleep(2500);
    await page.until('window.__mode === "flight" && typeof window.__colliderShapes === "function"', 120000);
    await page.sleep(1500);
    const got = await json(page, 'window.__colliderShapes()');
    check('in the game the cube is all there: eight tubes and four feet, and nothing else in the world but the room\'s own walls',
      got.byKind.gate === 8 && got.byKind.obstacle === 4 && got.capsules === 12 && got.boxes === (got.byKind.wall ?? 0),
      JSON.stringify({ capsules: got.capsules, boxes: got.boxes, byKind: got.byKind }));
  } finally {
    await page.close();
  }
});

/*
 * A CUBE IS FLOWN THROUGH ANY TWO OF ITS FACES. The designer's own example is in at the top and out at the
 * right: the Fly order tool takes the passes off and puts two others on, by clicking the faces, and the world
 * the game builds is the same cube whichever two it is flown through.
 */
kase('a cube flown through other faces', async () => {
  const page = await openBuilder();
  try {
    await trapToasts(page);
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('cube');
      app.placeAt({ x: 5, y: 6, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.sleep(300);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const els = await json(page, `window.trackBuilder.doc.elements.map((e) => ({ id: e.id, x: e.position.x, y: e.position.y, yaw: e.yaw, pitch: e.pitch, sillH: e.dims.sillH }))`);
    const flat = els.find((e) => Math.abs(e.pitch) > 1);
    const rightFace = els.find((e) => Math.abs(e.y - (flat.y - 0.3689)) < 0.01 && Math.abs(e.x - flat.x) < 0.01);
    const seq = () => json(page, 'window.trackBuilder.doc.sequence.map((q) => ({ id: q.elementId, entry: q.entry }))');
    check('to begin with it is flown straight through', (await seq()).length === 2);

    await key(page, 'KeyN');
    check('N arms the Fly order tool', (await page.evaluate('window.trackBuilder.armed')) === 'route');
    await key(page, 'Backspace');
    await key(page, 'Backspace');
    check('Backspace twice takes both passes off, and the cube is still all there', (await seq()).length === 0 && els.length === 5);
    check('and nothing shouts about a cube that nothing flies but the one sentence, once', (await json(page, `window.trackBuilder.warnings.filter((w) => w.code === 'unsequenced').length`)) === 1);

    const topAt = await screenOf(page, 'view3d', flat.x, flat.y, 0.7245);
    await click(page, topAt.x, topAt.y);
    let q = await seq();
    check('a click on the top face is a pass through the top face, and only it', q.length === 1 && q[0].id === flat.id, JSON.stringify(q));
    const rightAt = await screenOf(page, 'view3d', rightFace.x, rightFace.y, 0.3556);
    await click(page, rightAt.x, rightAt.y);
    q = await seq();
    check('and a click on the right face is the next: in at the top and out at the right, the top flown down through and the right flown outward',
      q.length === 2 && q[0].id === flat.id && q[1].id === rightFace.id && q[0].entry === -1 && q[1].entry === 1, JSON.stringify(q));
    check('and there is no warning of a face that is not flown: it is the same cube', (await json(page, `window.trackBuilder.warnings.filter((w) => w.code === 'unsequenced').length`)) === 0);
    await key(page, 'Escape');
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));

    /* The world: the same eight tubes and four feet, whichever two faces it is flown through. */
    await page.evaluate('window.trackBuilder.flyThisTrack(), 1').catch(() => {});
    await page.sleep(2500);
    await page.until('window.__mode === "flight" && typeof window.__colliderShapes === "function"', 120000);
    await page.sleep(1500);
    const got = await json(page, 'window.__colliderShapes()');
    check('in the game it is the same cube: eight tubes and four feet, the front, the back and the left built with nothing to score',
      got.byKind.gate === 8 && got.byKind.obstacle === 4 && got.capsules === 12 && got.boxes === (got.byKind.wall ?? 0),
      JSON.stringify({ capsules: got.capsules, boxes: got.boxes, byKind: got.byKind }));
  } finally {
    await page.close();
  }
});

/*
 * A CUBE BY TOUCH. A tap with the tool armed lays it, a tap on any face picks the whole cube and puts the card
 * up, the card's Turn turns all of it, and one finger pulled on a face carries all of it.
 */
kase('a cube by touch', async () => {
  const page = await openBuilder('?class=micro', 1024, 768, { touch: true });
  try {
    await trapToasts(page);
    const els = () => json(page, `window.trackBuilder.doc.elements.map((e) => ({ id: e.id, group: e.group ?? null, x: e.position.x, y: e.position.y, yaw: e.yaw, pitch: e.pitch }))`);
    /* The tools are at the foot of the palette, which is a column that scrolls on a screen this short. */
    await page.evaluate(`(() => {
      const b = [...document.querySelectorAll('#tb-palette .tb-tool')].find((x) => x.querySelector('.tb-tool-label')?.textContent === 'Cube');
      b.scrollIntoView({ block: 'center' });
      return 1;
    })()`);
    await page.sleep(200);
    await tool(page, 'Cube');
    check('touching the Cube tool arms it', (await page.evaluate('window.trackBuilder.armed')) === 'cube');
    const coach = await page.evaluate("document.getElementById('tb-coach')?.textContent ?? ''");
    check('and the line above the room says tap, what a tap does, and how to put the tool away: the Cube button again, there is no plus for it',
      /Tap the floor/.test(coach) && /cube/i.test(coach) && /Tap Cube again to put it away/.test(coach) && !/plus/i.test(coach), coach);
    const at = await screenOf(page, 'view3d', 5, 6.5, 0);
    await tap(page, at);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    let list = await els();
    check('a tap lays five gates of one group, as one step, and the tool is still armed', list.length === 5 && new Set(list.map((e) => e.group)).size === 1 && (await undoCount(page)) === 1
      && (await page.evaluate("window.trackBuilder.armed === 'cube'")), `${list.length} gates, ${await undoCount(page)} steps`);
    await key(page, 'Escape');
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(200);

    const face = list.find((e) => Math.abs(e.pitch) < 1 && e.x > list.find((f) => Math.abs(f.pitch) > 1).x + 0.1);
    const on = await screenOf(page, 'view3d', face.x, face.y, 0.35);
    await tap(page, on);
    check('a tap on one face picks all five, and the card says it is a cube',
      (await page.evaluate('window.trackBuilder.selection.size')) === 5 && (await page.evaluate("document.querySelector('#tb-card .tb-card-head strong')?.textContent")) === 'Cube');
    const before = await els();
    const turnAt = await json(page, `(() => {
      const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === 'Turn');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    check('the card has a Turn button', Boolean(turnAt));
    await tap(page, turnAt);
    await page.sleep(200);
    const turned = await els();
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    check('and it turns all five a quarter together, as one step', turned.every((e, i) => Math.abs(Math.abs(wrap(e.yaw - before[i].yaw)) - Math.PI / 2) < 1e-4) && (await undoCount(page)) === 2, `${await undoCount(page)} steps`);
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(200);

    const start = await els();
    const grabFace = start.find((e) => Math.abs(e.pitch) < 1);
    const grab = await screenOf(page, 'view3d', grabFace.x, grabFace.y, 0.35);
    const drop = await screenOf(page, 'view3d', grabFace.x + 0.5, grabFace.y - 0.4, 0.35);
    await swipe(page, grab, drop, { steps: 10 });
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const moved = await els();
    const d = moved.map((e, i) => ({ dx: e.x - start[i].x, dy: e.y - start[i].y }));
    check('one finger pulled on a face carries all five by the same amount, as one step',
      d.every((m) => Math.abs(m.dx - d[0].dx) < 1e-6 && Math.abs(m.dy - d[0].dy) < 1e-6) && Math.hypot(d[0].dx, d[0].dy) > 0.3 && (await undoCount(page)) === 3, `${JSON.stringify(d[0])}; ${await undoCount(page)} steps`);
    check('no toast the author did not ask for', (await toasts(page)).length === 0, (await toasts(page)).join(' | '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * WHAT THE GHOST SHOWS IS WHAT THE CLICK LAYS. Next to a gate the gate tool's magnet would take the piece 30 in
 * along the gate's width, which is a side by side pair and is not where a cube goes (it is 30 in wide itself),
 * so the cube has no such magnet, and the faint faces under the pointer are where the click puts the cube.
 */
kase('a cube ghost is where the click lays it', async () => {
  const page = await openBuilder();
  try {
    await page.evaluate(`(() => {
      const app = window.trackBuilder;
      app.arm('gate');
      app.placeAt({ x: 5, y: 6, z: 0 });
      app.disarm();
      app.setSelection([]);
      return 1;
    })()`);
    await page.sleep(300);
    await key(page, 'KeyK');
    /* A hand's distance from the spot the gate's magnet would take a piece to: 30 in along its width. */
    const near = await screenOf(page, 'view3d', 5.02, 6.79, 0);
    await mouse(page, 'mouseMoved', near.x, near.y, 0);
    await page.sleep(400);
    const ghost = await json(page, `window.trackBuilder.view3d.ghost.items.map((g) => ({ x: g.position.x, y: g.position.y, yaw: g.yaw }))`);
    check('the ghost is five faces', ghost.length === 5);
    await click(page, near.x, near.y);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    const laid = await json(page, `window.trackBuilder.doc.elements.filter((e) => e.group).map((e) => ({ x: e.position.x, y: e.position.y, yaw: e.yaw }))`);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    check('and the five gates the click lays are exactly where they were shown, face by face, heading by heading',
      laid.length === 5 && laid.every((g, i) => Math.abs(g.x - ghost[i].x) < 1e-6 && Math.abs(g.y - ghost[i].y) < 1e-6 && Math.abs(wrap(g.yaw - ghost[i].yaw)) < 1e-6),
      JSON.stringify({ ghost: ghost[4], laid: laid[4] }));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/* ------------------------------------------------------------------ */
/* The five inch canvas, built in the room                              */
/* ------------------------------------------------------------------ */

/*
 * TRACK-BUILDER-5IN-PLAN.md: the 5 inch canvas is built in the room the whoop canvas is, with metres for lengths, a
 * wall dragged out along the ground, a hurdle and an up gate, the flags as one choice on the card, a spiral round a
 * flag, and a plan's compass for which way a gate faces. The cases below drive it with the pointer and the keys, and
 * the last one builds the Drone Nationals qualifying track from an empty canvas and compares it with the one that
 * ships.
 */

async function openField(width = 1600, height = 900, { touch = false } = {}) {
  const page = await openPage({ root, width, height, url: '/src/trackbuilder/index.html?class=full', touch });
  await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
  await page.until("window.trackBuilder.mode === '3d' && !!window.trackBuilder.view3d.renderer", 30000).catch(() => {});
  await page.sleep(400);
  return page;
}

/* A button on the card, by the words on it, optionally in the row that has a label: the card moves as it is edited, so
 * it is waited for until it stops. */
async function cardClick(page, label, row = null) {
  let at = null;
  /* Two frames: the card is put beside its piece by the frame after it appears, and a press that lands between the two
   * is a press on the room. */
  await page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(1))))');
  for (let i = 0; i < 20; i += 1) {
    const now = await json(page, `(() => {
      const card = document.getElementById('tb-card');
      if (!card || card.hidden) return null;
      const scope = ${JSON.stringify(row)}
        ? [...card.querySelectorAll('.tb-card-choice')].find((c) => c.textContent.trim().toLowerCase().startsWith(${JSON.stringify(row)}.toLowerCase()))
        : card;
      const b = scope && [...scope.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (now && at && Math.abs(now.x - at.x) < 0.5 && Math.abs(now.y - at.y) < 0.5) {
      at = now;
      break;
    }
    at = now;
    await page.sleep(90);
  }
  if (!at) {
    throw new Error(`no button called ${label}${row ? ` in the ${row} row` : ''} on the card`);
  }
  await click(page, at.x, at.y);
}

/* A number typed into a field of the card: clicked, set, and Enter. */
async function cardType(page, label, value) {
  await page.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(1))))');
  await page.sleep(250);
  const at = await json(page, `(() => {
    const l = [...document.querySelectorAll('#tb-card label')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)}));
    const i = l && l.querySelector('input');
    if (!i) return null;
    const r = i.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!at) {
    throw new Error(`no field called ${label} on the card`);
  }
  await click(page, at.x, at.y);
  await page.evaluate(`(() => { document.activeElement.value = ${JSON.stringify(String(value))}; return 1; })()`);
  await key(page, 'Enter');
}

const cardRows = (page) => json(page, `[...document.querySelectorAll('#tb-card .tb-card-choice')].map((c) => c.querySelector('.tb-card-choice-label').textContent + ': ' + [...c.querySelectorAll('button')].map((b) => b.textContent.trim() + (b.classList.contains('on') ? '*' : '')).join(' '))`);
const lit = async (page, row) => {
  const rows = await cardRows(page);
  const mine = rows.find((r) => r.toLowerCase().startsWith(row.toLowerCase()));
  return mine ? mine.split(': ')[1].split(' ').filter((w) => w.endsWith('*')).map((w) => w.slice(0, -1)).join(' ') : null;
};

/* Put a piece down with a tool and a click on the ground at field metres. */
async function layAt(page, toolName, x, y) {
  await tool(page, toolName);
  const at = await screenOf(page, 'view3d', x, y, 0);
  if (!at) {
    throw new Error(`${x}, ${y} is off the screen`);
  }
  await click(page, at.x, at.y);
}

const placed = (page) => json(page, 'window.trackBuilder.doc.elements.map((e) => ({ id: e.id, type: e.type, group: e.group ?? null, x: e.position.x, y: e.position.y, z: e.position.z, yaw: e.yaw, pitch: e.pitch, flag: e.flagSide ?? null, pinned: Boolean(e.yawOverridden), style: e.style ?? null, clearW: e.dims.clearW ?? null }))');
const passes = (page) => json(page, 'window.trackBuilder.doc.sequence.map((q) => ({ id: q.id, el: q.elementId, entry: q.entry, clearance: q.clearance, set: Boolean(q.overridden) }))');

kase('five inch: the room', async () => {
  const page = await openField();
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    check('a five inch canvas opens in the room, as the whoop canvas does, and builds there', (await app('a.mode')) === '3d' && (await app('a.buildsIn3D()')) && !(await app('a.isWhoopRace()')));
    const labels = await json(page, "[...document.querySelectorAll('#tb-palette .tb-tool-label')].map((x) => x.textContent)");
    check('the palette has the wall, the up gate and the hurdle among the pieces, and Fly order and Ruler under Tools',
      ['Wall', 'Up gate', 'Hurdle', 'Fly order', 'Ruler'].every((l) => labels.includes(l)), labels.join());
    check('and nothing of RaceGOW\'s: no build sheet on the foot of the room, none or a picture in More, and the share link there, which is a race track\'s on either canvas',
      !(await page.evaluate("[...document.querySelectorAll('#tb-lapbar button')].some((b) => b.textContent === 'Build sheet')"))
      && (await page.evaluate("['sheet', 'picture'].every((id) => window.trackBuilder.moreItems.get(id).style.display === 'none') && window.trackBuilder.moreItems.get('link').style.display !== 'none'")));
    check('an empty canvas says to click the field, in the words of a field',
      /click the field/.test(await page.evaluate("document.getElementById('tb-empty').textContent")));
    /* The views are the room's, as the whoop's are: 3D first, 2D second, Top beside Fit, and V between the two. */
    const bar = await json(page, `(() => ({
      views: [...document.querySelectorAll('#tb-topbar .tb-view-group button')].map((b) => b.textContent),
      top: [...document.querySelectorAll('#tb-topbar button')].some((b) => b.textContent === 'Top' && b.getClientRects().length),
      note: (() => { const n = document.querySelector('#tb-palette .tb-preview-note'); return Boolean(n && n.getClientRects().length); })(),
    }))()`);
    check('the switch says 3D first and 2D second, as the whoop\'s does, with Top beside Fit, and no word of a preview', bar.views.join('|') === '3D|2D' && bar.top && !bar.note, JSON.stringify(bar));
    await key(page, 'KeyV');
    check('V goes to the plan and back to the room', (await app('a.mode')) === '2d' && (await key(page, 'KeyV'), (await app('a.mode')) === '3d'));

    await tool(page, 'Gate');
    check('the coach says what a click does', /Click the ground to place it/.test(await page.evaluate("document.getElementById('tb-coach').textContent")));
    const near = await screenOf(page, 'view3d', 20, 19, 0);
    await mouse(page, 'mouseMoved', near.x, near.y, 0);
    await page.sleep(300);
    const readout = await page.evaluate("document.getElementById('tb-readout').textContent");
    check('the status line says where the pointer is on the ground, in metres, as the plan does', /^\d+\.\d\d, \d+\.\d\d m$/.test(readout) && readout !== '0.00, 0.00 m', readout);
    check('and a ghost of the gate follows it', (await app('a.view3d.ghost && a.view3d.ghost.items.length')) === 1);
    const steps = await undoCount(page);
    await click(page, near.x, near.y);
    await key(page, 'Escape');
    const els = await placed(page);
    check('a click puts a gate on the grid, as one undo step', els.length === 1 && els[0].type === 'gate' && Math.abs(els[0].x - 20) < 0.01 && Math.abs(els[0].y - 19) < 0.01 && (await undoCount(page)) === steps + 1,
      JSON.stringify(els[0]));
    const at = await screenOf(page, 'view3d', 20, 19, 0.76);
    await click(page, at.x, at.y);
    check('a click on it picks it, and its card is in metres', (await app('a.selection.size')) === 1 && /X \(m\)/.test(await page.evaluate("document.getElementById('tb-card').textContent"))
      && /Faces/.test(await page.evaluate("document.getElementById('tb-card').textContent")));
    check('the card says no North, East, South or West is lit before anything has been chosen, except where the gate faces', (await lit(page, 'Faces')) === 'East');
    const before = await undoCount(page);
    await cardClick(page, 'North', 'Faces');
    let g = (await placed(page))[0];
    check('North turns it to face north and keeps it there, as one undo step', Math.abs(g.yaw - Math.PI / 2) < 1e-6 && g.pinned && (await undoCount(page)) === before + 1, `yaw ${g.yaw}`);
    await cardClick(page, 'Both', 'Flags');
    g = (await placed(page))[0];
    check('Both on the flags makes it a flagged gate with a pennant on each upright, and keeps everything else it is',
      g.type === 'flaggedGate' && g.flag === 'both' && Math.abs(g.x - 20) < 0.01 && Math.abs(g.yaw - Math.PI / 2) < 1e-6);
    await cardClick(page, 'None', 'Flags');
    g = (await placed(page))[0];
    check('None takes them off and makes it the plain gate again', g.type === 'gate' && g.flag === null);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/* ------------------------------------------------------------------ */
/* The menus plan's builder half (MENUS-PLAN.md 1.18 to 1.26, Stage 4,  */
/* 5.2), driven the way a person drives it.                            */
/* ------------------------------------------------------------------ */

/* The centre of a visible control, found by a selector and its words. */
const centreOf = (page, selector, text = null) => json(page, `(() => {
  const b = [...document.querySelectorAll(${JSON.stringify(selector)})]
    .find((x) => x.getClientRects().length && (${JSON.stringify(text)} === null || x.textContent === ${JSON.stringify(text)}));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

/* The value of an expression that awaits something, by way of JSON. */
const ajson = async (page, body) => JSON.parse(await page.evaluate(`(async () => JSON.stringify(await (async () => { ${body} })()))()`));

/* A drawer slides, and a software rasteriser draws the slide at a frame or two
 * a second under a room: a hit test is only fair once it has stopped. */
const slid = (page, id) => page.until(`(() => { const n = document.getElementById('${id}'); const t = getComputedStyle(n).transform; return t === 'none' || /^matrix\\(1, 0, 0, 1, 0, 0\\)$/.test(t); })()`, 10000);

/* Whether what is under the middle of a control is that control: nothing
 * laid over it, nothing it is under. */
const uncovered = (page, selector) => page.evaluate(`(() => {
  const b = document.querySelector(${JSON.stringify(selector)});
  if (!b || !b.getClientRects().length) return false;
  const r = b.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit === b || b.contains(hit);
})()`);

/* Every request the page makes to a board's API, answered here and kept, so
 * nothing reaches a board at all: a publish is answered as the board would,
 * a list or a document as `board` says, a track's own summary and an admin's
 * sign in as `board.official` and `board.admin` say, and anything else under
 * /api/ with an empty object. A seed, so it is in place before the page's
 * first line. */
const BOARD_STUB = (board = {}) => `(() => {
  const real = window.fetch.bind(window);
  const board = ${JSON.stringify(board)};
  window.__api = [];
  window.fetch = async (input, init = {}) => {
    const url = String(input && input.url ? input.url : input);
    if (!/\\/api\\//.test(url)) return real(input, init);
    const method = (init.method || 'GET').toUpperCase();
    window.__api.push(method + ' ' + url);
    const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (board.down) return answer(503, { error: 'The board is asleep.' });
    /* What is published is kept, in this origin's storage so the card's own
     * frame can read it back, as the board would hand it back. */
    const keep = (kind, id, sent) => {
      try { localStorage.setItem('flow-board:' + kind + ':' + id, JSON.stringify({ id, name: sent.document.name, author: sent.author, document: sent.document })); } catch (e) {}
    };
    if (method === 'POST' && /\\/api\\/tracks$/.test(url)) {
      const sent = JSON.parse(init.body);
      keep('tracks', sent.document.id, sent);
      return answer(200, { id: sent.document.id, name: sent.document.name, editKey: 'flow-key' });
    }
    if (method === 'POST' && /\\/api\\/maps$/.test(url)) {
      const sent = JSON.parse(init.body);
      keep('maps', sent.document.id, sent);
      return answer(200, { id: sent.document.id, name: sent.document.name, editKey: 'flow-key' });
    }
    const kept = url.match(/\\/api\\/(tracks|maps)\\/([^/]+)\\/document$/);
    if (method === 'GET' && kept) {
      let held = null;
      try { held = localStorage.getItem('flow-board:' + kept[1] + ':' + decodeURIComponent(kept[2])); } catch (e) {}
      if (held) return answer(200, JSON.parse(held));
    }
    /* An admin who can sign in, for the cases about official tracks. */
    if (method === 'POST' && /\\/api\\/admin\\/login$/.test(url)) {
      const sent = JSON.parse(init.body);
      if (board.admin && sent.email === board.admin.email && sent.password === board.admin.password) {
        return answer(200, { token: 'stub-admin-token', email: sent.email, expiresUtc: new Date(Date.now() + 3600e3).toISOString() });
      }
      return answer(401, { error: 'That email and password do not open this board.' });
    }
    if (method === 'GET' && /\\/api\\/admin\\/session$/.test(url)) {
      return board.admin && JSON.stringify(init.headers || {}).includes('stub-admin-token')
        ? answer(200, { email: board.admin.email })
        : answer(401, { error: 'Not signed in.' });
    }
    /* One track's own summary, which is where the board says it is official.
     * Only for the ids board.official names, so every other case still gets
     * the 404 it always did. */
    const one = url.match(/\\/api\\/tracks\\/([^/?]+)$/);
    if (method === 'GET' && one && board.official && decodeURIComponent(one[1]) in board.official) {
      const id = decodeURIComponent(one[1]);
      return answer(200, { id, official: Boolean(board.official[id]), times: [] });
    }
    if (method === 'GET' && /\\/api\\/tracks$/.test(url)) return answer(200, { tracks: board.tracks || [] });
    const doc = url.match(/\\/api\\/tracks\\/([^/]+)\\/document$/);
    if (method === 'GET' && doc && board.documents && board.documents[decodeURIComponent(doc[1])]) {
      return answer(200, board.documents[decodeURIComponent(doc[1])]);
    }
    if (method === 'GET') return answer(404, { error: 'No such thing: ' + url });
    return answer(200, {});
  };
})()`;

/* A five inch document with a gate on it, made in Node by the page's own model. */
async function fieldDoc(name, gates = 1) {
  const { createTrack, createElement, toPlain } = await import(pathToFileURL(resolve(root, 'src/trackbuilder/model.js')).href);
  const d = createTrack(name, 'full');
  for (let i = 0; i < gates; i += 1) {
    const g = createElement(d, 'gate', { x: 10 + i * 8, y: 12, z: 0 }, 0);
    d.elements.push(g);
    d.sequence.push({ id: `sq-${i + 1}`, elementId: g.id, apertureIndex: 0, entry: 1 });
  }
  return toPlain(d);
}

/*
 * THE WHOOP DRAWER HAS ITS OWN WAY OUT (MENUS-PLAN.md 1.18). Its only toggle was
 * on the lap bar, under it when it was open, so the drawer could be opened and
 * not closed by the button that opened it; Escape let go of the selection first
 * and left the drawer over half the room. Now it has a close button that
 * nothing covers, the toggle stands clear of it and is lit, Escape closes it
 * before anything else, the keyboard comes back to where it was, and a dialog
 * opened over it is over it.
 */
kase('drawer', async () => {
  const page = await openBuilder('?class=micro', 1280, 800);
  try {
    await threeGates(page);
    const open = () => page.evaluate("document.body.classList.contains('tb-drawer')");
    const toggle = '#tb-lapbar [data-drawer]';
    let at = await centreOf(page, toggle);
    await click(page, at.x, at.y);
    await slid(page, 'tb-side');
    check('the lap bar\'s Flying order opens the drawer', await open());
    check('the drawer has its own close button, and nothing covers it', await uncovered(page, '#tb-side-x'));
    check('the toggle stands clear of the open drawer, lit, and says it is open',
      (await uncovered(page, toggle)) && (await page.evaluate(`document.querySelector('${toggle}').classList.contains('on') && document.querySelector('${toggle}').getAttribute('aria-expanded') === 'true'`)));
    at = await centreOf(page, '#tb-side-x');
    await click(page, at.x, at.y);
    await page.sleep(300);
    check('its close button closes it', !(await open()));

    await page.evaluate("window.trackBuilder.setSelection([window.trackBuilder.doc.elements[0].id]), 1");
    at = await centreOf(page, toggle);
    await click(page, at.x, at.y);
    await slid(page, 'tb-side');
    check('it opens again with a gate selected', await open());
    await key(page, 'Escape');
    check('Escape closes the drawer first, and the gate stays selected', !(await open()) && (await page.evaluate('window.trackBuilder.selection.size')) === 1);
    await key(page, 'Escape');
    check('the next Escape lets go of the gate', (await page.evaluate('window.trackBuilder.selection.size')) === 0);

    await page.evaluate(`document.querySelector('${toggle}').focus(), 1`);
    await key(page, 'Enter');
    await slid(page, 'tb-side');
    check('opened from the keyboard, the keyboard is on its close button', (await open()) && (await page.evaluate("document.activeElement?.id === 'tb-side-x'")));
    await key(page, 'Escape');
    await page.sleep(300);
    check('and Escape there gives the keyboard back to the toggle', !(await open()) && (await page.evaluate(`!!document.activeElement?.matches('${toggle}')`)));

    at = await centreOf(page, toggle);
    await click(page, at.x, at.y);
    await slid(page, 'tb-side');
    await page.evaluate('window.trackBuilder.openLoad(), 1');
    await page.sleep(300);
    const over = await json(page, `(() => {
      const m = document.querySelector('#tb-modal .tb-modal');
      const side = document.getElementById('tb-side').getBoundingClientRect();
      const r = m.getBoundingClientRect();
      const x = Math.max(r.left + 4, Math.min(r.right - 4, side.left + 24));
      const y = r.top + r.height / 2;
      return { inside: m.contains(document.elementFromPoint(x, y)), overlaps: r.right > side.left };
    })()`);
    check('a dialog opened with the drawer open is over it, where the two overlap', over.inside, JSON.stringify(over));
    await key(page, 'Escape');
    check('and Escape closes the dialog before the drawer', (await page.evaluate("document.getElementById('tb-modal').hidden")) && (await open()));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

kase('five inch: a wall by drag', async () => {
  const page = await openField();
  try {
    await trapToasts(page);
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    await key(page, 'KeyK');
    check('K arms the wall tool, and the coach says to drag', (await app('a.armed')) === 'wall' && /Drag along the ground/.test(await page.evaluate("document.getElementById('tb-coach').textContent")));
    const a = await screenOf(page, 'view3d', 24, 30, 0);
    const b = await screenOf(page, 'view3d', 18, 30, 0);
    const steps = await undoCount(page);
    await drag(page, a, b, { hold: true, steps: 10 });
    const ghost = await app('a.view3d.ghost && a.view3d.ghost.items.length');
    const said = await page.evaluate("[...document.querySelectorAll('.tb-measure')].map((n) => n.textContent).join('|')");
    check('while it is dragged the bays it will lay are shown, and how many and how long', ghost === 3 && /3 bays, 5\.37 m/.test(said), `${ghost} ${said}`);
    await release(page, b);
    const els = (await placed(page)).filter((e) => e.group);
    check('it lays three gates in one group in the plain dress, as one undo step', els.length === 3 && els.every((e) => e.style === 'plain') && (await undoCount(page)) === steps + 1);
    check('the tool is put away, because what comes next is the wall\'s own card', (await app('a.armed')) === null && (await app('a.selection.size')) === 3);
    const gap = Math.abs(els[0].x - els[1].x);
    check('the bays stand a world\'s pitch apart, so their uprights meet where the game builds them', Math.abs(gap - 1.7910111) < 1e-5, String(gap));
    check('and the card says what it is', /Wall, 3 bays/.test(await page.evaluate("document.getElementById('tb-card').textContent")));
    const entriesNow = async () => (await passes(page)).map((q) => q.entry);
    const woven = (entries) => entries.length > 1 && entries.every((e, i) => i === 0 || e !== entries[i - 1]);
    check('it is flown as a weave, every bay the other way to the one before, and the card says so', woven(await entriesNow()) && (await lit(page, 'Flown')) === 'Weave');
    await cardClick(page, 'Straight', 'Flown');
    check('Straight flies every bay the same way', new Set(await entriesNow()).size === 1 && (await lit(page, 'Flown')) === 'Straight');
    await cardClick(page, 'Weave', 'Flown');
    check('and Weave goes back', woven(await entriesNow()) && (await lit(page, 'Flown')) === 'Weave');
    const first = (await passes(page))[0].entry;
    await cardClick(page, 'Reverse');
    check('Reverse turns every pass round', (await passes(page))[0].entry === -first);
    await cardClick(page, 'Wide', 'Bay');
    const wide = (await placed(page)).filter((e) => e.group);
    check('Wide lays the bays again at 2 m, from the same first post', Math.abs(Math.abs(wide[0].x - wide[1].x) - 2) < 1e-5 && Math.abs((wide[0].x + 1) - (els[0].x + 1.7910111 / 2)) < 1e-5, wide.map((w) => w.x.toFixed(3)).join());
    await cardClick(page, 'First end', 'Flags');
    const flagged = (await placed(page)).filter((e) => e.group && e.type === 'flaggedGate');
    check('First end puts one pennant on the outer upright of the bay it was dragged from', flagged.length === 1 && flagged[0].id === wide[0].id);
    const drag1 = await screenOf(page, 'view3d', wide[1].x, wide[1].y, 0.76);
    const to1 = { x: drag1.x, y: drag1.y + 70 };
    const was = (await placed(page)).filter((e) => e.group).map((e) => [e.x, e.y]);
    await drag(page, drag1, to1, { steps: 8 });
    const now = (await placed(page)).filter((e) => e.group).map((e) => [e.x, e.y]);
    const moved = now.map((p, i) => [p[0] - was[i][0], p[1] - was[i][1]]);
    check('dragging one bay moves the whole wall by the same amount: it is one piece',
      moved.every((m) => Math.abs(m[0] - moved[0][0]) < 1e-6 && Math.abs(m[1] - moved[0][1]) < 1e-6) && Math.hypot(moved[0][0], moved[0][1]) > 0.5, JSON.stringify(moved));
    await key(page, 'KeyD', 2);
    check('Control D copies the wall, three bays and the passes through them, as a wall of its own',
      (await placed(page)).filter((e) => e.group).length === 6 && new Set((await placed(page)).filter((e) => e.group).map((e) => e.group)).size === 2 && (await passes(page)).length === 6);
    await key(page, 'Delete');
    check('and Delete takes the whole piece away, not a bay', (await placed(page)).filter((e) => e.group).length === 3 && (await passes(page)).length === 3);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

kase('five inch: a hurdle, an up gate and Fly order', async () => {
  const page = await openField();
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    await page.evaluate("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Square').click()");
    check('Square is on the bar for a field, and lights', (await app('a.square')) === true);
    await layAt(page, 'Gate', 20, 19);
    await key(page, 'Escape');
    const steps = await undoCount(page);
    await key(page, 'KeyU');
    check('U arms the hurdle', (await app('a.armed')) === 'hurdle');
    const at = await screenOf(page, 'view3d', 27, 28, 0);
    await click(page, at.x, at.y);
    const els = await placed(page);
    const h = els.find((e) => e.type === 'barrier');
    check('a click puts down a hurdle with a flag at each end, turned across the course on the compass, and a waypoint over it, in one step',
      h && h.flag === 'both' && Math.abs(Math.sin(2 * h.yaw)) < 1e-5 && els.some((e) => e.type === 'waypoint' && Math.abs(e.z - 2) < 1e-6) && (await undoCount(page)) === steps + 1,
      JSON.stringify(h));
    check('the tool is put away, and the hurdle\'s card has its flags and a Fly over', (await app('a.armed')) === null
      && (await cardRows(page)).some((r) => /^Flags: None Left Right Both\*$/.test(r)) && /Fly over/.test(await page.evaluate("document.getElementById('tb-card').textContent")));
    await cardClick(page, 'Right', 'Flags');
    const after = (await placed(page)).find((e) => e.type === 'barrier');
    check('the flags on a hurdle are one choice too: Right leaves one, on the right', after.flag === 'right', `${after.flag} ${(await cardRows(page)).join(' / ')}`);

    await layAt(page, 'Up gate', 33, 43);
    const up = (await placed(page)).find((e) => e.type === 'diveGate');
    const upPass = (await passes(page)).find((q) => q.el === up.id);
    check('an up gate is a dive gate leaning 45 degrees with its lower edge 1.5 m up, facing along a quarter turn, flown up through',
      up && Math.abs(up.pitch - Math.PI / 4) < 1e-6 && Math.abs(Math.sin(2 * up.yaw)) < 1e-5 && upPass.entry === 1 && upPass.set === true, JSON.stringify(up));

    const n = (await passes(page)).length;
    await key(page, 'KeyN');
    check('N arms Fly order, and the coach says a hurdle is flown over', (await app('a.armed')) === 'route' && /A hurdle is flown over/.test(await page.evaluate("document.getElementById('tb-coach').textContent")));
    const onHurdle = await screenOf(page, 'view3d', 27, 28, 0.5);
    await click(page, onHurdle.x, onHurdle.y);
    const wps = (await placed(page)).filter((e) => e.type === 'waypoint');
    check('a click on the hurdle with Fly order adds another pass over it, a waypoint above its middle', wps.length === 2 && (await passes(page)).length === n + 1);
    await key(page, 'Backspace');
    check('Backspace takes the last pass off', (await passes(page)).length === n);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/* A button in the details or the palette, by the words on it (or on its picture), scrolled to and pressed with the mouse. */
async function pressIn(page, scope, label) {
  const at = await json(page, `(() => {
    const root = document.querySelector(${JSON.stringify(scope)});
    const b = root && [...root.querySelectorAll('button')].find((x) => (x.querySelector('strong')?.textContent ?? x.textContent).trim() === ${JSON.stringify(label)});
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!at) {
    throw new Error(`no button called ${label} in ${scope}`);
  }
  await page.sleep(120);
  const now = await json(page, `(() => { const root = document.querySelector(${JSON.stringify(scope)}); const b = [...root.querySelectorAll('button')].find((x) => (x.querySelector('strong')?.textContent ?? x.textContent).trim() === ${JSON.stringify(label)}); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await click(page, now.x, now.y);
}

kase('five inch: variants', async () => {
  const page = await openField();
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    const names = () => json(page, `window.trackBuilder.doc.sequence.map((q) => { const e = window.trackBuilder.doc.elements.find((x) => x.id === q.elementId); return e.type === 'waypoint' ? e.name : e.type; })`);
    /* A line of three gates, east, to put the variants on. */
    await tool(page, 'Gate');
    for (const x of [15, 35, 55]) {
      const at = await screenOf(page, 'view3d', x, 30, 0);
      await click(page, at.x, at.y);
    }
    await key(page, 'Escape');

    /* ---- a flight path: Then, in the details, with a picture ---- */
    const mid = await screenOf(page, 'view3d', 35, 30, 0.8);
    await click(page, mid.x, mid.y);
    const rows = await cardRows(page);
    check('a gate\'s card has a Flight path row with Then and Into, each saying what is laid there',
      rows.some((r) => /^Flight path: Then: None ▾ Into: None ▾$/.test(r)), rows.join(' / '));
    const steps = await undoCount(page);
    await cardClick(page, 'Then: None ▾', 'Flight path');
    await page.sleep(500);
    const open = await json(page, `({ drawer: document.body.classList.contains('tb-drawer'), flight: Boolean(document.getElementById('tb-flight')), lit: [...document.querySelectorAll('#tb-flight .tb-seg-btn.on')].map((b) => b.textContent.trim()), cards: document.querySelectorAll('#tb-flight .tb-fig-card svg').length })`);
    check('pressing it opens the details at the Flight path, on the tab for Then, with a picture on every card',
      open.drawer && open.flight && open.lit.includes('Then') && open.cards >= 15, JSON.stringify(open));
    await pressIn(page, '#tb-flight', 'Turn');
    const turned = await names();
    check('the Turn card lays a half turn after the gate, left, in one undo step, as waypoints in the flying order',
      turned.filter((n) => n === 'Turn left 180').length === 5 && turned[1] === 'gate' && turned[2] === 'Turn left 180' && (await undoCount(page)) === steps + 1, turned.join());
    const wps = await json(page, `window.trackBuilder.doc.elements.filter((e) => e.type === 'waypoint').map((e) => ({ y: e.position.y, pitch: e.pitch, pinned: e.yawOverridden }))`);
    check('they bend to the left of the way the gate is flown, and each is kept pointing the way the line goes', wps.every((w) => w.pinned === true) && wps[wps.length - 1].y > 30 + 4, JSON.stringify(wps));
    await pressIn(page, '#tb-flight', 'Right');
    await pressIn(page, '#tb-flight', '360°');
    const orbit = await names();
    check('Right and 360 degrees change the figure that is laid, where it is: an orbit to the right, and nothing added beside it',
      orbit.every((n) => n === 'gate' || n === 'Turn right 360') && orbit.filter((n) => n !== 'gate').length === 9, orbit.join());
    await pressIn(page, '#tb-flight', 'None');
    check('None takes it out, and the order is the three gates again', (await names()).join() === 'gate,gate,gate');
    await pressIn(page, '#tb-flight', 'Into it');
    await pressIn(page, '#tb-flight', 'Power loop');
    const loop = await json(page, `(() => { const a = window.trackBuilder; return { names: a.doc.sequence.length, top: Math.max(...a.doc.elements.filter((e) => e.type === 'waypoint').map((e) => e.position.z)) }; })()`);
    check('Into it lays a power loop before the gate, which climbs a diameter', loop.names === 12 && loop.top > 5.5, JSON.stringify(loop));
    const wp = await json(page, `window.trackBuilder.doc.elements.find((e) => e.type === 'waypoint').id`);
    await page.evaluate(`window.trackBuilder.setSelection(['${wp}']), 1`);
    await page.sleep(400);
    check('selecting one point of it says it is one point of a figure, and offers to take the whole figure out',
      /One point of Power loop/.test(await page.evaluate("document.getElementById('tb-inspector').textContent")));
    await pressIn(page, '#tb-inspector', 'Take the figure out');
    check('which takes every point of it', (await names()).join() === 'gate,gate,gate');
    await page.evaluate('window.trackBuilder.toggleDrawer(false), 1');

    /* ---- a section ---- */
    await key(page, 'Escape');
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await key(page, 'KeyJ');
    check('J arms the Section tool, and its choices stand under it', (await app('a.armed')) === 'run'
      && (await json(page, "!document.querySelector('.tb-run-opts').hidden")));
    await pressIn(page, '.tb-run-opts', 'Chicane');
    const before = (await placed(page)).length;
    const step2 = await undoCount(page);
    const spot = await screenOf(page, 'view3d', 62, 38, 0);
    await click(page, spot.x, spot.y);
    const after = await placed(page);
    check('a click lays a chicane of four gates in one undo step, flown in order, and puts the tool away',
      after.length === before + 4 && (await undoCount(page)) === step2 + 1 && (await app('a.armed')) === null && (await app('a.selection.size')) === 4, `${before} then ${after.length}`);
    const laid = after.slice(-4);
    /* Across the heading the first gate faces, which is the way the section was begun. */
    const across = (g) => -(g.x - laid[0].x) * Math.sin(laid[0].yaw) + (g.y - laid[0].y) * Math.cos(laid[0].yaw);
    check('they swing off the line and come back to it, the last gate on the line the first stands on and the two between it a few metres out',
      Math.abs(across(laid[3])) < 0.5 && Math.min(Math.abs(across(laid[1])), Math.abs(across(laid[2]))) > 2 && across(laid[1]) * across(laid[2]) < 0,
      laid.map((g) => across(g).toFixed(2)).join(' '));
    await page.evaluate('window.trackBuilder.undo(), 1');
    check('and one Undo takes the whole section away', (await placed(page)).length === before);

    /* ---- a bar hurdle: under, over, and at an angle ---- */
    await layAt(page, 'Bar hurdle', 45, 22);
    const bar = (await placed(page)).find((e) => e.type === 'horizontalPole');
    check('the Bar hurdle tool lays a bar ten feet wide, five feet up, with the lap pinned over it',
      bar && Math.abs(bar.z - 1.524) < 1e-6 && (await names()).includes('Over the bar'), JSON.stringify(bar));
    const hrows = await cardRows(page);
    check('its card has Size, Flown and Set at', hrows.some((r) => /^Size: 10 x 5 ft\* Super$/.test(r)) && hrows.some((r) => /^Flown: Over\* Skim Under$/.test(r))
      && hrows.some((r) => /^Set at: Square/.test(r)), hrows.join(' / '));
    await cardClick(page, 'Under', 'Flown');
    check('Under puts the lap beneath the bar, between its legs', (await names()).includes('Under the bar')
      && (await json(page, "window.trackBuilder.doc.elements.find((e) => e.name === 'Under the bar').position.z")) < 1);
    await cardClick(page, '45° left', 'Set at');
    check('45 degrees left turns it an eighth off square', (await cardRows(page)).some((r) => /^Set at: Square 45° left\* 45° right$/.test(r)), (await cardRows(page)).join(' / '));

    /* ---- a launch gate ---- */
    await key(page, 'Escape');
    await layAt(page, 'Launch gate', 70, 30);
    const gate = (await placed(page)).find((e) => e.type === 'diveGate');
    const order = await names();
    check('the Launch gate tool lays a horizontal gate 15 ft up, flown up, with a pull up before it and a push over after',
      gate && Math.abs(gate.pitch - Math.PI / 2) < 1e-6 && order.filter((n) => n === 'Pull up').length === 3 && order.filter((n) => n === 'Push over').length === 2, order.join());
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

kase('five inch: by touch', async () => {
  const page = await openField(1024, 768, { touch: true });
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    const toolAt = (label) => json(page, `(() => {
      const b = [...document.querySelectorAll('#tb-palette .tb-tool')].find((x) => x.querySelector('.tb-tool-label')?.textContent === ${JSON.stringify(label)});
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await tap(page, await toolAt('Gate'));
    check('a finger arms a tool', (await app('a.armed')) === 'gate');
    const spot = await screenOf(page, 'view3d', 20, 19, 0);
    await tap(page, spot);
    check('and a tap on the ground puts a gate there', (await placed(page)).length === 1);
    await tap(page, await toolAt('Gate'));
    const on = await screenOf(page, 'view3d', 20, 19, 0.76);
    await tap(page, on);
    check('a tap on the gate selects it, and its card is up', (await app('a.selection.size')) === 1 && (await page.evaluate("!document.getElementById('tb-card').hidden")));
    const sizes = await json(page, "[...document.querySelectorAll('#tb-card .tb-seg-btn')].map((b) => Math.round(b.getBoundingClientRect().height))");
    check('every choice on it is a finger tall: 44 px at the least', sizes.length >= 9 && sizes.every((h) => h >= 44), sizes.join());
    const north = await json(page, `(() => {
      const row = [...document.querySelectorAll('#tb-card .tb-card-choice')].find((c) => c.textContent.startsWith('Faces'));
      const b = [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'North');
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await tap(page, north);
    check('a tap on North turns it north', Math.abs((await placed(page))[0].yaw - Math.PI / 2) < 1e-6);
    await tap(page, await toolAt('Wall'));
    await tap(page, await screenOf(page, 'view3d', 30, 30, 0));
    const wall = (await placed(page)).filter((e) => e.group);
    check('a tap with the wall tool lays three bays across the spot, and puts the tool away', wall.length === 3 && (await app('a.armed')) === null);
    check('and its card is a wall\'s', /Wall, 3 bays/.test(await page.evaluate("document.getElementById('tb-card').textContent")));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * MORE IS A MENU (MENUS-PLAN.md 1.19): Escape closes it and puts the keyboard
 * back on More, which it did not; opened from the keyboard its first item has
 * the keyboard, the arrows walk it, and on a five inch track it has the share
 * link the whoop canvas had (4.2b).
 */
kase('more', async () => {
  const page = await openBuilder('?mode=race&class=full');
  try {
    const shown = () => page.evaluate('!window.trackBuilder.moreMenu.hidden');
    const at = await centreOf(page, '#tb-topbar .tb-more > button', 'More');
    await click(page, at.x, at.y);
    check('More opens its menu and says it is open', (await shown()) && (await page.evaluate("window.trackBuilder.moreBtn.getAttribute('aria-expanded')")) === 'true');
    const items = await json(page, "[...document.querySelectorAll('.tb-more-menu .tb-more-item')].filter((b) => b.getClientRects().length).map((b) => b.textContent)");
    check('on a five inch track it has Copy share link', items.includes('Copy share link'), items.join(', '));
    await key(page, 'Escape');
    check('Escape closes it', !(await shown()));
    check('and the keyboard is on More', await page.evaluate('document.activeElement === window.trackBuilder.moreBtn'));
    await key(page, 'Enter');
    check('Enter on More opens it with the keyboard on its first item', (await shown()) && (await page.evaluate("document.activeElement?.textContent === 'Duplicate'")),
      await page.evaluate('document.activeElement?.textContent'));
    await key(page, 'ArrowDown');
    check('the arrows walk it', await page.evaluate("document.activeElement?.textContent === 'Import'"), await page.evaluate('document.activeElement?.textContent'));
    await key(page, 'Escape');
    check('and Escape from an item closes it and gives the keyboard back to More', !(await shown()) && (await page.evaluate('document.activeElement === window.trackBuilder.moreBtn')));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE PAGE AND ITS CANVASES SAY WHAT THEY ARE (MENUS-PLAN.md 4.1, 1.23 to 1.26,
 * 4.2c, 4.3a): the Builder, a switch in the gate's words, the ground named the
 * canvas's way, Show line on the bar and no Path on the palette, the way back
 * carrying the canvas, the storage notice folding after a first save, a switch
 * that says what it did, the parts the board refuses marked before they are
 * placed, and no Flying order panel on a map.
 */
kase('canvas words', async () => {
  const page = await openBuilder('?mode=race&class=full');
  try {
    await trapToasts(page);
    const facts = () => json(page, `(() => {
      const bar = document.getElementById('tb-topbar');
      const vis = (n) => Boolean(n && n.getClientRects().length);
      const keep = document.getElementById('tb-keep');
      return {
        title: document.title,
        barTitle: bar.querySelector('.tb-title')?.textContent,
        canvases: [...bar.querySelectorAll('.tb-class-btn')].map((b) => b.textContent + '=' + b.title),
        heading: document.querySelector('#tb-inspector h3')?.textContent,
        back: bar.querySelector('.tb-back')?.getAttribute('href'),
        showLine: [...bar.querySelectorAll('button')].some((b) => b.textContent === 'Show line' && vis(b)),
        path: [...document.querySelectorAll('#tb-palette .tb-tool-label')].some((s) => s.textContent === 'Path'),
        lit: [...document.querySelectorAll('#tb-palette .tb-tool')].filter((b) => b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true').length,
        sequence: vis(document.getElementById('tb-sequence')),
        keep: vis(keep) ? keep.textContent.replace(/\\s+/g, ' ').trim() : '',
        kept: [...bar.querySelectorAll('.tb-kept')].filter(vis).map((n) => n.textContent),
        keptTitle: bar.querySelector('.tb-kept')?.title || '',
        notes: [...document.querySelectorAll('#tb-palette .tb-tool')].filter((b) => b.querySelector('.tb-tool-note')).map((b) => b.querySelector('.tb-tool-label').textContent),
      };
    })()`);
    let f = await facts();
    check('the page is the Builder, in its tab and on its bar', f.title === 'Builder, WebFPV' && f.barTitle === 'Builder', `${f.title} / ${f.barTitle}`);
    check('the switch says Five inch, Whoop and Freestyle, each titled with what it makes',
      f.canvases.length === 3 && /^Five inch=A five inch race track/.test(f.canvases[0]) && /^Whoop=A whoop track/.test(f.canvases[1]) && /^Freestyle=A freestyle map/.test(f.canvases[2]),
      f.canvases.join(' | '));
    check('a five inch canvas calls its ground the Field', f.heading === 'Field', f.heading);
    check('Back to the simulator goes to the custom track on the five inch, and not into the air', f.back === '../../index.html?map=custom&craft=5inch', f.back);
    check('Show line is on the bar, and the palette has no Path', f.showLine && !f.path);
    check('and with nothing armed nothing on the palette is lit', f.lit === 0, String(f.lit));
    check('a browser that has saved nothing is told, on the strip, that tracks stay in it', /Tracks you build stay here/.test(f.keep) && f.kept.length === 0, f.keep);
    await page.evaluate('window.trackBuilder.save(), 1');
    await page.sleep(200);
    f = await facts();
    check('after the first save the strip folds to Saved in this browser, beside Save, with the sentence in its title',
      f.keep === '' && f.kept.join() === 'Saved in this browser' && /This browser only\. Tracks you build stay here/.test(f.keptTitle), JSON.stringify({ keep: f.keep, kept: f.kept, title: f.keptTitle }));
    check('and that first save says where the track went', /in this browser\. It is in Load from now on/.test((await toasts(page)).join(' ')), (await toasts(page)).join(' | '));

    let at = await centreOf(page, '#tb-topbar .tb-class-btn', 'Whoop');
    await click(page, at.x, at.y);
    await page.until("document.body.classList.contains('tb-whoop')", 10000);
    await page.sleep(300);
    f = await facts();
    const said = (await toasts(page)).slice(-1)[0] || '';
    check('switching canvas says undo starts again, and which aircraft the simulator will fly', /Undo starts again here, and the simulator will fly the whoop/.test(said), said);
    check('a whoop canvas calls its ground the Room, and its way back is the whoop', f.heading === 'Room' && f.back === '../../index.html?map=custom&craft=whoop65', `${f.heading} ${f.back}`);
    check('no part is marked on the palette as missing from the board, because the board knows them all',
      f.notes.length === 0, f.notes.join(', '));

    at = await centreOf(page, '#tb-topbar .tb-class-btn', 'Freestyle');
    await click(page, at.x, at.y);
    await page.until("document.body.classList.contains('tb-map')", 10000);
    await page.sleep(300);
    f = await facts();
    check('a map calls its ground the Plot, has no Flying order panel, and its way back is the built map',
      f.heading === 'Plot' && !f.sequence && f.back === '../../index.html?map=built&craft=5inch', `${f.heading} ${f.sequence} ${f.back}`);
    check('and the folded notice there talks about maps', /Maps you build stay here/.test(f.keptTitle), f.keptTitle);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE ACCEPTANCE RUN, which is what the plan was for: the Drone Nationals qualifying track, built from an empty canvas
 * with the pointer and the keys and nothing else, and compared piece for piece with the one that ships
 * (scripts/mission-preset.js). The number of gestures is counted and printed. Before this work the same plan took about a
 * hundred and could not be finished: a gate with a flag on top, the spirals, a wall of bays and the hurdle's flags had no way in.
 * Its spirals are one turn down round a flag and then one pass, and its wall is entered round the flag on its end and
 * flown north first: the owner's correction of 2026-10-01 to a first reading that had loops back through the gates and
 * the wall the other way.
 */
kase('five inch: the Nationals qualifier, built from an empty canvas', async () => {
  const page = await openField();
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    let gestures = 0;
    const did = () => { gestures += 1; };
    const stand = async (toolName, x, y) => { await layAt(page, toolName, x, y); did(); did(); };
    const card = async (label, row) => { await cardClick(page, label, row); did(); };

    /* The field the plan is drawn on: its size is on the foot of the room. */
    await page.sleep(200);
    const fieldButton = await json(page, "(() => { const b = [...document.querySelectorAll('#tb-lapbar button')].find((x) => /^Field /.test(x.textContent)); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: b.textContent }; })()");
    check('the size of the field is a button on the foot of the room, and says it', /Field 60 \u00d7 40 m/.test(fieldButton.text), fieldButton.text);
    await click(page, fieldButton.x, fieldButton.y);
    did();
    await page.sleep(300);
    for (const [key2, value] of [['field-w', 45], ['field-d', 55], ['set-radius', 1]]) {
      const at = await json(page, `(() => { const i = document.querySelector('[data-tbkey="${key2}"]'); i.scrollIntoView({ block: 'center' }); const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await page.sleep(120);
      const now = await json(page, `(() => { const r = document.querySelector('[data-tbkey="${key2}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await click(page, now.x, now.y);
      await page.evaluate(`document.activeElement.value = '${value}'`);
      await key(page, 'Enter');
      did();
    }
    check('and opens the field\'s width and depth, which are set to the plan\'s 45 by 55 m, and how tight a turn is warned about, which the plan\'s spirals make a metre',
      (await app('[a.doc.field.width, a.doc.field.depth, a.doc.settings.minCurveRadius].join()')) === '45,55,1');
    await app('(a.toggleDrawer(false), a.view3d.frameTrack(), a.requestDraw(), 1)');
    await page.sleep(500);
    await page.evaluate("[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Square').click()");
    did();

    /* In the order it is flown. */
    await stand('Gate', 20, 19);
    await stand('Hurdle', 27, 28);
    await stand('Flagged gate', 30, 35);
    await key(page, 'Escape');
    did();
    await card('East', 'Faces');
    await card('Both', 'Flags');
    /* A spiral down round the south flag, the right hand one as it is flown, and then the one pass. */
    await card('Right', 'Round the flag');
    await key(page, 'Escape');
    did();
    await stand('Up gate', 33, 43);
    await stand('Waypoint', 31, 48);
    await key(page, 'Escape');
    did();
    await tool(page, 'Wall');
    did();
    const wa = await screenOf(page, 'view3d', 24, 43, 0);
    const wb = await screenOf(page, 'view3d', 18, 43, 0);
    await drag(page, wa, wb, { steps: 10 });
    did();
    await card('First end', 'Flags');
    await card('Wide', 'Bay');
    /* The tool flies the first bay away from where the course comes from; the plan goes round the flag on its end
     * first, so it is turned round, and entered round that flag with no spiral. */
    await card('Reverse');
    await card('Spiral down', 'Into it');
    await card('Right', 'Into it');
    await key(page, 'Escape');
    did();
    await stand('Waypoint', 16, 45);
    await key(page, 'Escape');
    did();
    await stand('Flagged gate', 5, 29);
    await key(page, 'Escape');
    did();
    await card('East', 'Faces');
    await card('Right', 'Flags');
    const westFlown = await passes(page);
    if (westFlown[westFlown.length - 1].entry !== 1) {
      await card('Reverse');
    }
    /* Round the north flag, the left hand one as it is flown, spiralling down again. */
    await card('Spiral down', 'Round the flag');
    await card('Left', 'Round the flag');
    await key(page, 'Escape');
    did();
    await stand('Waypoint', 7, 26);
    await key(page, 'Escape');
    did();
    await stand('Waypoint', 3, 23);
    await key(page, 'Escape');
    did();
    await stand('Flagged gate', 5, 19);
    await key(page, 'Escape');
    did();
    await card('East', 'Faces');
    await card('Both', 'Flags');
    await key(page, 'Escape');
    did();
    await stand('Flag', 5, 5);
    await key(page, 'Escape');
    did();
    await page.sleep(300);
    const flag = (await placed(page)).find((e) => e.type === 'flag');
    const onFlag = await screenOf(page, 'view3d', flag.x, flag.y, 0.8);
    await click(page, onFlag.x, onFlag.y);
    did();
    await card('South', 'Line passes');
    await cardType(page, 'Turn clearance', 2.5);
    did();
    await key(page, 'Escape');
    did();
    /* The lower gate again, after the flag. */
    const lower = (await placed(page)).find((e) => e.type === 'flaggedGate' && Math.abs(e.x - 5) < 0.01 && Math.abs(e.y - 19) < 0.01);
    const onLower = await screenOf(page, 'view3d', lower.x, lower.y, 0.8);
    await click(page, onLower.x, onLower.y);
    did();
    await card('Fly again');
    await key(page, 'Escape');
    did();
    await stand('Start pads', 17, 19);
    await key(page, 'Escape');
    did();
    /* Every gate that is not a wall's the plan's width. */
    await key(page, 'KeyA', 2);
    did();
    await card('Wide', 'Gate size');
    await key(page, 'Escape');
    did();
    await page.sleep(300);

    /* Against the track that ships. */
    const built = await json(page, 'JSON.parse(JSON.stringify(window.trackBuilder.doc))');
    const ref = JSON.parse(await page.evaluate(`(async () => { const m = await import('/src/trackbuilder/presets5.js'); return JSON.stringify(m.FIVE_INCH_PRESETS[0]); })()`));
    const types = (d) => d.elements.map((e) => e.type).sort().join();
    check('every piece the plan lists is there, of the type it is: the same pieces as the one that ships', types(built) === types(ref), `${types(built)}\n   ${types(ref)}`);
    /* Each shipped piece, matched to the nearest built piece of its type. */
    const taken = new Set();
    const match = new Map();
    let worst = 0;
    let worstHeading = 0;
    for (const r of ref.elements) {
      let best = null;
      for (const b of built.elements) {
        if (b.type !== r.type || taken.has(b.id)) continue;
        const d = Math.hypot(b.position.x - r.position.x, b.position.y - r.position.y);
        if (!best || d < best.d) best = { b, d };
      }
      if (!best) continue;
      taken.add(best.b.id);
      match.set(r.id, best.b);
      const tol = r.type === 'waypoint' ? 0.3 : 0.15;
      worst = Math.max(worst, best.d - (r.type === 'waypoint' ? 0.15 : 0));
      if (best.d > tol) {
        check(`${r.type} ${r.id} is where the plan puts it`, false, `${best.d.toFixed(3)} m out, at ${best.b.position.x},${best.b.position.y} for ${r.position.x},${r.position.y}`);
      }
      if (r.type !== 'waypoint' && r.type !== 'startPads' && r.type !== 'flag') {
        const dy = Math.abs(Math.atan2(Math.sin(best.b.yaw - r.yaw), Math.cos(best.b.yaw - r.yaw)));
        worstHeading = Math.max(worstHeading, dy);
      }
    }
    check('every piece is within 0.15 m of the plan (0.3 m for a waypoint, whose spiral went round a flag on a gate that was resized after)', match.size === ref.elements.length, `${match.size} of ${ref.elements.length} matched`);
    check('every gate, the hurdle and the up gate face the way the plan has them, to a degree', worstHeading < 0.0175, `${(worstHeading * 180 / Math.PI).toFixed(2)} degrees at worst`);
    const flagsOf = (d) => d.elements.filter((e) => e.flagSide).map((e) => `${e.type}:${e.flagSide}`).sort().join();
    check('and carry the flags it has them with', flagsOf(built) === flagsOf(ref), `${flagsOf(built)}\n   ${flagsOf(ref)}`);
    const orderOf = (d, map) => d.sequence.map((q) => `${map ? map(q.elementId) : q.elementId}:${q.entry ?? '-'}`).join(' ');
    const builtOrder = orderOf(built, (id) => { const hit = [...match.entries()].find(([, b]) => b.id === id); return hit ? hit[0] : id; });
    check('they are flown in the plan\'s order, and each the way the plan flies it', builtOrder === orderOf(ref), `${builtOrder}\n   ${orderOf(ref)}`);
    const pad = built.elements.find((e) => e.type === 'startPads');
    const sizes = built.elements.filter((e) => e.group).map((e) => e.dims.clearW);
    check('the wall\'s bays are 2 m between uprights in the world and are one piece, and the lap closes with nothing to warn about',
      sizes.length === 3 && new Set(sizes.map((v) => v.toFixed(4))).size === 1 && Math.abs(sizes[0] - 1.7057294) < 1e-4
      && (await app('a.path && a.path.closed')) && (await app('a.warnings.filter((w) => w.level === "warn").length')) === 0 && Boolean(pad),
      await app('a.warnings.map((w) => w.message).join(" | ")'));
    console.log(`  the track took ${gestures} gestures, a gesture being a click, a drag, a key or a typed number`);
    check('and that is a gesture a piece or two, not a hundred: no more than seventy', gestures <= 70, String(gestures));

    /* The card shows the figure that is in front of a pass, as Flags shows the flags, and None takes it off. */
    const row = (label) => json(page, `(() => {
      const r = [...document.querySelectorAll('#tb-card .tb-card-choice')].find((c) => c.textContent.trim().startsWith(${JSON.stringify(label)}));
      return r ? [...r.querySelectorAll('button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '') + (b.disabled ? '-' : '')) : null;
    })()`);
    const pick = (find) => app(`(a.setSelection([a.doc.elements.find(${find}).id]), 1)`);
    await pick("(e) => e.type === 'flaggedGate' && Math.abs(e.position.x - 30) < 0.01 && Math.abs(e.position.y - 35) < 0.01");
    await page.sleep(400);
    check('the east gate\'s card says what is in front of it: a spiral down round the right hand flag',
      (await row('Round the flag'))?.join() === 'None,Left,Right*,Spiral down*', (await row('Round the flag'))?.join());
    await pick('(e) => e.group && e.flagSide');
    await page.sleep(400);
    check('and the wall\'s, that it is entered round the flag on its end with no spiral, and that its other end has none to go round',
      (await row('Into it round the flag'))?.join() === 'None,Left-,Right*,Spiral down', (await row('Into it round the flag'))?.join());
    const wps = () => app("a.doc.elements.filter((e) => e.type === 'waypoint').length");
    const before = await wps();
    await cardClick(page, 'None', 'Into it');
    await page.sleep(300);
    /* With nothing there, Spiral down is what the next press makes, which the west gate left on. */
    check('None takes the turn round the flag off, and the row says so', (await wps()) === before - 2
      && (await row('Into it round the flag'))?.join() === 'None*,Left-,Right,Spiral down*', `${before} then ${await wps()}, ${(await row('Into it round the flag'))?.join()}`);
    await key(page, 'KeyZ', 2);
    await page.sleep(300);
    check('and Undo puts it back', (await wps()) === before);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A MAP IS BUILT IN THE ROOM (FREESTYLE-3D-BUILD-PLAN.md). Its 3D was a preview
 * (MENUS-PLAN.md 4.2): a tool armed there placed nothing, the palette said Build in
 * 2D and a tool picked took the author to the plan. It is the whoop's and the five
 * inch's room now, with a map's own words: it opens in 3D by itself, the switch
 * says 3D first, Top is beside Fit, nothing says preview, a tool is armed where it
 * is picked, and the chrome along the foot is a map's, with no flying order.
 */
async function openMap(width = 1600, height = 900, { touch = false } = {}) {
  const page = await openPage({ root, width, height, url: '/src/trackbuilder/index.html?mode=freestyle', touch });
  await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
  /* The room waits for the map's kit as well as Three.js, so it is the scene of the map that is waited for. */
  await page.until("window.trackBuilder.mode === '3d' && !!window.trackBuilder.view3d.renderer && !!window.trackBuilder.view3d.fs", 60000).catch(() => {});
  await page.sleep(500);
  return page;
}

kase('map: the room', async () => {
  const page = await openMap();
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    check('a map opens in the room by itself, and builds there, and is not RaceGOW\'s', (await app('a.mode')) === '3d' && (await app('a.buildsIn3D()')) && !(await app('a.isWhoopRace()')));
    const bar = await json(page, `(() => ({
      views: [...document.querySelectorAll('#tb-topbar .tb-view-group button')].map((b) => b.textContent),
      top: [...document.querySelectorAll('#tb-topbar button')].some((b) => b.textContent === 'Top' && b.getClientRects().length),
      note: Boolean(document.querySelector('#tb-palette .tb-preview-note')),
    }))()`);
    check('the switch says 3D first and 2D second, Top is beside Fit, and nothing says preview', bar.views.join('|') === '3D|2D' && bar.top && !bar.note, JSON.stringify(bar));
    const labels = await json(page, "[...document.querySelectorAll('#tb-palette .tb-tool-label')].map((x) => x.textContent)");
    check('the palette has the assets, the road and the car, and the Ruler under Tools, and no Fly order', ['Building', 'Containers', 'Billboard', 'Road', 'Vehicle', 'Ruler'].every((l) => labels.includes(l)) && !labels.includes('Fly order'), labels.join());
    check('an empty map says to click the plot, in the words of a map, and offers the yard',
      /click the plot/.test(await page.evaluate("document.getElementById('tb-empty').textContent"))
      && /Start from the yard/.test(await page.evaluate("document.getElementById('tb-empty').textContent")));
    const foot = await json(page, "[...document.querySelectorAll('#tb-lapbar .tb-lap-fig, #tb-lapbar button')].map((x) => x.textContent.replace(/\\s+/g, ' ').trim())");
    check('the bar along the foot is a map\'s: what is on it, the solids, the warnings, the plot and the details; no lap, no flying order',
      foot.some((t) => /^Things/.test(t)) && foot.some((t) => /^Solids/.test(t)) && foot.some((t) => /^Warnings/.test(t)) && foot.some((t) => /^Plot 160/.test(t)) && foot.includes('Details')
      && !foot.some((t) => /Flying order|^Lap|^Length|^Gates/.test(t)), foot.join(' | '));
    check('nothing is selected, so no card, and the readout is in metres from the corner', (await app('document.getElementById("tb-card").hidden')) === true);

    await key(page, 'KeyV');
    check('V goes to the plan and back to the room', (await app('a.mode')) === '2d' && (await key(page, 'KeyV'), (await app('a.mode')) === '3d'));
    await key(page, 'KeyV');
    await tool(page, 'Building');
    check('in the plan a tool is armed where it is picked: no hop, no word of a preview', (await app('a.mode')) === '2d' && (await app('a.armed === "building"')));
    await key(page, 'KeyV');
    await page.until("window.trackBuilder.mode === '3d'", 10000);
    check('going to the room keeps the tool in hand, and the coach says what a click does',
      (await app('a.armed === "building"')) && /Click the plot to place it/.test(await page.evaluate("document.getElementById('tb-coach').textContent")));
    await key(page, 'Escape');
    await key(page, 'Digit1');
    check('and a tool\'s key does what its button does', await app('a.armed === "building"'));
    await key(page, 'Escape');
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE ROOM'S GESTURES ON A MAP: a ghost follows the pointer and a click puts the
 * piece down on the grid; a press takes it and a drag moves it; the ring at its
 * foot turns it, in quarters for a building and in fifteen degrees for a crane;
 * Shift drags a box; Control D copies and Delete removes. Each is one undo step.
 */
kase('map: build by pointer', async () => {
  const page = await openMap();
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    await trapToasts(page);
    await tool(page, 'Building');
    const near = await screenOf(page, 'view3d', 50, 50, 0);
    await mouse(page, 'mouseMoved', near.x, near.y, 0);
    await page.sleep(400);
    check('a ghost of the building follows the pointer', (await app('a.view3d.ghost && a.view3d.ghost.items.length')) === 1 && (await app('!!a.view3d.ghostGroup && a.view3d.ghostGroup.parent === a.view3d.fs.root')));
    const readout = await page.evaluate("document.getElementById('tb-readout').textContent");
    check('the status line says where the pointer is on the ground, in metres', /^\d+\.\d\d, \d+\.\d\d m$/.test(readout) && readout !== '0.00, 0.00 m', readout);
    const steps = await undoCount(page);
    await click(page, near.x, near.y);
    const first = (await placed(page))[0];
    check('a click puts it on the grid, selected, as one undo step', first && first.type === 'building' && Math.abs(first.x - 50) < 0.51 && Math.abs(first.y - 50) < 0.51 && first.z === 0
      && (await undoCount(page)) === steps + 1 && (await app('a.selection.size')) === 1, JSON.stringify(first));
    check('the tool stays in hand, and the card is not up while it is', (await app('a.armed === "building"')) && (await app('document.getElementById("tb-card").hidden')));
    await key(page, 'Escape');
    const card = await page.evaluate("document.getElementById('tb-card').textContent");
    check('Escape puts the tool away and the card is the building\'s: style, where it stands, which way, how big',
      !(await app('a.armed')) && /Building/.test(card) && /Flats/.test(card) && /X \(m\)/.test(card) && /Base \(m\)/.test(card) && /Turn \(degrees\)/.test(card) && /Width \(m\)/.test(card), card.slice(0, 160));
    check('and the ring is at its foot', (await app('!!a.view3d.ring && !!a.view3d.ring.parts')));

    /* Moved by a drag on its body: the grid takes the place, and one undo step is all it was. */
    const body = await screenOf(page, 'view3d', first.x, first.y, 3);
    const to = await screenOf(page, 'view3d', first.x + 20, first.y - 10, 3);
    const before = await undoCount(page);
    await drag(page, body, to);
    const moved = (await placed(page))[0];
    check('a drag on it moves it across the ground, to the grid, as one undo step',
      Math.abs(moved.x - (first.x + 20)) < 1.6 && Math.abs(moved.y - (first.y - 10)) < 1.6 && moved.z === 0 && (await undoCount(page)) === before + 1, `${moved.x}, ${moved.y}`);
    check('what was dragged is still what is selected, and its card follows it', (await app('a.selection.size')) === 1);

    /* The ring turns a building by quarters. The ring is made on the frame after the selection is, for the piece
     * that is selected, and it is waited for. */
    const knob = async () => {
      await page.until(`(() => { const a = window.trackBuilder; const v = a.view3d; return !v.dirty && v.ring && v.ring.parts && a.selection.size === 1 && v.ring.id === [...a.selection][0]; })()`, 20000);
      return knobAt();
    };
    const knobAt = () => json(page, `(() => {
      const v = window.trackBuilder.view3d;
      const m = v.ring.parts.userData.meshes[1];
      const r = v.canvas.getBoundingClientRect();
      v.applyCamera(); v.camera.updateMatrixWorld(true);
      const p = m.getWorldPosition(new v.camera.position.constructor());
      p.project(v.camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    })()`);
    const k0 = await knob();
    const centre = await screenOf(page, 'view3d', moved.x, moved.y, 0);
    /* Pulled to a point north of the building, whatever the camera: the knob goes round to where it is pulled. */
    const north = await screenOf(page, 'view3d', moved.x, moved.y + 14, 0);
    const turnSteps = await undoCount(page);
    await drag(page, k0, north, { steps: 12 });
    const turned = (await placed(page))[0];
    check('the ring turns a building to a compass point, and says why the first time it is pulled off one',
      Math.abs(turned.yaw - Math.PI / 2) < 1e-6 && (await undoCount(page)) === turnSteps + 1, `yaw ${turned.yaw}`);
    await key(page, 'KeyE');
    const e1 = (await placed(page))[0];
    check('E turns it a quarter, the way a building turns, and Q turns it back', Math.abs(Math.abs(e1.yaw - turned.yaw) - Math.PI / 2) < 1e-6);
    await key(page, 'KeyQ');
    check('Q puts it back', Math.abs((await placed(page))[0].yaw - turned.yaw) < 1e-6);

    /* A crane is free: fifteen degree steps. */
    await layAt(page, 'Tower crane', 110, 100);
    await key(page, 'Escape');
    const crane = (await placed(page)).find((e) => e.type === 'crane');
    const c0 = await knob();
    const c1 = await screenOf(page, 'view3d', crane.x + 10, crane.y + 5, 0);
    await drag(page, c0, c1, { steps: 12 });
    const cy = (await placed(page)).find((e) => e.type === 'crane').yaw;
    check('the same ring turns a crane in fifteen degree steps', Math.abs(cy / (Math.PI / 12) - Math.round(cy / (Math.PI / 12))) < 1e-6 && Math.abs(cy) > 0.01 && Math.abs(Math.abs(cy) - Math.PI / 2) > 0.01, `yaw ${cy}`);
    /* The card's Turn is a quarter: from a heading nobody chose it squares the piece up first, as it does a gate. */
    await cardClick(page, 'Turn');
    const sq = (await placed(page)).find((e) => e.type === 'crane').yaw;
    await cardClick(page, 'Turn');
    const sq2 = (await placed(page)).find((e) => e.type === 'crane').yaw;
    check('and the card\'s Turn squares a crane up and then turns it a quarter', Math.abs(sq) < 1e-6 && Math.abs(Math.abs(sq2) - Math.PI / 2) < 1e-6, `${cy} to ${sq} to ${sq2}`);

    /* A box, a copy, a removal. The box is on the screen, so it is drawn round where the two pieces are seen. */
    await key(page, 'Escape');
    const [p1, p2] = await Promise.all([
      screenOf(page, 'view3d', moved.x, moved.y, 0),
      screenOf(page, 'view3d', crane.x, crane.y, 0),
    ]);
    const a = { x: Math.min(p1.x, p2.x) - 140, y: Math.min(p1.y, p2.y) - 160 };
    const b = { x: Math.max(p1.x, p2.x) + 140, y: Math.max(p1.y, p2.y) + 60 };
    await drag(page, a, b, { mods: 8, steps: 10 });
    check('Shift drags a box that takes both pieces', (await app('a.selection.size')) === 2, `${await app('a.selection.size')}`);
    const n0 = (await placed(page)).length;
    await key(page, 'KeyD', 2);
    check('Control D copies both, beside them, and the copies are what is selected', (await placed(page)).length === n0 + 2 && (await app('a.selection.size')) === 2);
    await key(page, 'Delete');
    check('Delete takes them away, and Undo brings them back', (await placed(page)).length === n0 && (await key(page, 'KeyZ', 2), (await placed(page)).length === n0 + 2));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A PIECE STANDS ON WHAT THE POINTER IS OVER (FREESTYLE-3D-BUILD-PLAN.md, 2.2). The
 * ghost, a click and a drag all find the highest roof, container or deck under the
 * spot at or below where the pointer is looking, so a billboard is put on a roof by
 * pointing at the roof, comes down when it is dragged off, and goes with a building
 * that is moved. The height is the seat's own, so nothing is set down afterwards.
 */
kase('map: standing on things', async () => {
  const page = await openMap();
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    await trapToasts(page);
    await page.evaluate(`(async () => {
      const a = window.trackBuilder;
      const { createElement } = await import('/src/trackbuilder/model.js');
      a.edit('probe', (d) => {
        d.elements.push(createElement(d, 'building', { x: 60, y: 60 }, 0));
        d.elements.push(createElement(d, 'containers', { x: 110, y: 100 }, 0));
      });
      a.view3d.markDirty();
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 20000);
    const roof = await app('a.view3d.landings().under(60, 60, 1000, null).top');
    check('the building has a roof to stand on', roof > 5, `${roof} m`);

    /* The ghost, then the click. */
    await tool(page, 'Billboard');
    const over = await screenOf(page, 'view3d', 60, 60, roof);
    await mouse(page, 'mouseMoved', over.x, over.y, 0);
    await page.sleep(500);
    const ghost = await app('a.view3d.ghost && a.view3d.ghost.items[0].position.z');
    check('the ghost of a billboard stands on the roof the pointer is over', Math.abs(ghost - roof) < 1e-6, `${ghost} against ${roof}`);
    check('and the status line says how high that is', /m up$/.test(await page.evaluate("document.getElementById('tb-readout').textContent")));
    await click(page, over.x, over.y);
    await key(page, 'Escape');
    const bb = (await placed(page)).find((e) => e.type === 'billboard');
    check('a click puts it on the roof, at the height the ghost showed, and nothing is set down afterwards',
      bb && Math.abs(bb.z - roof) < 1e-6 && !(await toasts(page)).some((t) => /nothing under it|now stands on/.test(t)), JSON.stringify(bb));

    /* Pulled off the roof and on to the paving, it comes down; pulled back, it goes up. */
    const grabbed = await screenOf(page, 'view3d', bb.x, bb.y, bb.z + 2);
    const ground = await screenOf(page, 'view3d', 95, 60, 2);
    await drag(page, grabbed, ground, { steps: 14 });
    let now = (await placed(page)).find((e) => e.type === 'billboard');
    check('dragged off the roof on to open ground it comes down to the paving', now.z === 0 && now.x > 80, `${now.x}, ${now.y}, ${now.z}`);
    const again = await screenOf(page, 'view3d', now.x, now.y, 2);
    const onRoof = await screenOf(page, 'view3d', 60, 60, roof);
    await drag(page, again, onRoof, { steps: 14 });
    now = (await placed(page)).find((e) => e.type === 'billboard');
    check('dragged back over the roof it stands on it again', Math.abs(now.z - roof) < 1e-6, `${now.x}, ${now.y}, ${now.z}`);

    /* The building is moved and what stands on it goes with it. */
    const b0 = (await placed(page)).find((e) => e.type === 'building');
    const wall = await screenOf(page, 'view3d', b0.x - 6, b0.y - 3, 4);
    const away = await screenOf(page, 'view3d', b0.x - 6 + 20, b0.y - 3 - 15, 4);
    const before = await undoCount(page);
    await drag(page, wall, away, { steps: 14 });
    const b1 = (await placed(page)).find((e) => e.type === 'building');
    const c1 = (await placed(page)).find((e) => e.type === 'billboard');
    const dx = b1.x - b0.x;
    const dy = b1.y - b0.y;
    check('moving the building takes the billboard on its roof with it, as one undo step',
      Math.abs(dx) > 5 && Math.abs(c1.x - now.x - dx) < 1e-6 && Math.abs(c1.y - now.y - dy) < 1e-6 && Math.abs(c1.z - roof) < 1e-6 && (await undoCount(page)) === before + 1,
      `building ${dx}, ${dy}; billboard ${c1.x - now.x}, ${c1.y - now.y}, z ${c1.z}`);
    check('and nothing was set down on the way', !(await toasts(page)).some((t) => /nothing under it|now stands on/.test(t)));
    await key(page, 'Escape');

    /* A stack: a second set of containers on the first, by pointing at the top of the first. */
    await tool(page, 'Containers');
    const cTop = await app('a.view3d.landings().under(110, 100, 1000, null).top');
    const top = await screenOf(page, 'view3d', 110, 100, cTop);
    await click(page, top.x, top.y);
    await key(page, 'Escape');
    const stack = (await placed(page)).filter((e) => e.type === 'containers');
    check('a second set of containers pointed at on the top of the first stands on it', stack.length === 2 && Math.abs(stack[1].z - cTop) < 1e-6, stack.map((e) => e.z).join(', '));
    const low = await screenOf(page, 'view3d', stack[0].x, stack[0].y, 1);
    const lowTo = await screenOf(page, 'view3d', stack[0].x - 18, stack[0].y + 4, 1);
    await drag(page, low, lowTo, { steps: 12 });
    const after = (await placed(page)).filter((e) => e.type === 'containers');
    check('the one under it is moved and the one on it goes along, still standing on it',
      Math.abs(after[1].x - after[0].x - (stack[1].x - stack[0].x)) < 1e-6 && Math.abs(after[1].z - cTop) < 1e-6 && after[0].x < stack[0].x - 5, after.map((e) => `${e.x},${e.y},${e.z}`).join(' | '));

    /* A bar on legs starts at the height it is made with, whatever it is pointed at: the roof is not its ground. */
    await tool(page, 'Horizontal pole');
    const poleOver = await screenOf(page, 'view3d', b1.x + 6, b1.y + 2, roof);
    await mouse(page, 'mouseMoved', poleOver.x, poleOver.y, 0);
    await page.sleep(400);
    const poleGhost = await app('a.view3d.ghost && a.view3d.ghost.items[0].position.z');
    await click(page, poleOver.x, poleOver.y);
    await key(page, 'Escape');
    const pole = (await placed(page)).find((e) => e.type === 'horizontalPole');
    check('a horizontal pole pointed at a roof is made at its own height, in the ghost and when it is put down', poleGhost === undefined && pole && Math.abs(pole.z - 1.6) < 1e-6, `ghost ${poleGhost}, placed ${pole && pole.z}`);

    /* Page Up and Page Down step a gap, and say what they will not step. */
    await layAt(page, 'Named gap', 30, 130);
    await key(page, 'Escape');
    const gap0 = (await placed(page)).find((e) => e.type === 'gap');
    await key(page, 'PageUp');
    await key(page, 'PageUp', 8);
    const gap1 = (await placed(page)).find((e) => e.type === 'gap');
    check('Page Up lifts a gap a quarter metre, and a metre with Shift', Math.abs(gap1.z - gap0.z - 1.25) < 1e-6, `${gap0.z} to ${gap1.z}`);
    await key(page, 'PageDown', 8);
    await key(page, 'PageDown', 8);
    check('Page Down brings it down and not below the paving', (await placed(page)).find((e) => e.type === 'gap').z === 0);
    await key(page, 'Escape');
    await app('a.setSelection([a.doc.elements.find((e) => e.type === "building").id]), 1');
    await key(page, 'PageUp');
    check('a building has no height to step, and the first press says where its height comes from',
      (await toasts(page)).some((t) => /stands on what is under it/.test(t)) && (await placed(page)).find((e) => e.type === 'building').z === 0);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * ROADS AND CARS ARE LAID IN THE ROOM (FREESTYLE-3D-BUILD-PLAN.md, 2.5). The road
 * tool lays a node a click on the ground, a click on the first closes a loop, and a
 * right click puts a half laid road away; a car is dropped by a click on a road and
 * slid along it; a selected road shows its nodes and a knob between each pair, and
 * a node is pulled or put in as on the plan. A road has no mesh, so a click on the
 * tarmac is what selects it.
 */
kase('map: roads and cars', async () => {
  const page = await openMap();
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    await trapToasts(page);
    await tool(page, 'Road');
    check('the coach says what the first click does', /Click the ground to lay the road's first node/.test(await page.evaluate("document.getElementById('tb-coach').textContent")));
    const corner = (x, y) => screenOf(page, 'view3d', x, y, 0);
    const steps = await undoCount(page);
    for (const [x, y] of [[40, 40], [90, 40], [90, 90]]) {
      const at = await corner(x, y);
      await click(page, at.x, at.y);
    }
    check('each click lays a node and is no edit until the road is finished', (await app('a.roadDraft.length')) === 3 && (await undoCount(page)) === steps);
    const hover = await corner(40, 90);
    await mouse(page, 'mouseMoved', hover.x, hover.y, 0);
    await page.sleep(500);
    check('the draft is drawn, with a band to where the next node would go', (await app('!!a.view3d.draftGroup && a.view3d.draftGroup.children.length >= 4')));
    check('and the coach counts the nodes', /3 nodes laid/.test(await page.evaluate("document.getElementById('tb-coach').textContent")));
    await click(page, hover.x, hover.y);
    const first = await corner(40, 40);
    await click(page, first.x, first.y);
    let road = (await json(page, 'window.trackBuilder.doc.elements.filter((e) => e.type === "road")'))[0];
    check('a click on the first node closes the loop, as one undo step, and selects it',
      road && road.closed === true && road.nodes.length === 4 && (await undoCount(page)) === steps + 1 && (await app('a.selection.has(a.doc.elements.find((e) => e.type === "road").id)')),
      JSON.stringify(road && { closed: road.closed, n: road.nodes.length }));
    check('the draft is put away, and the tool stays in hand for the next road', (await app('a.roadDraft === null && a.armed === "road"')));

    /* A half laid road is put away by the right button. */
    const lone = await corner(130, 130);
    await click(page, lone.x, lone.y);
    check('a node of the next road is a draft', (await app('a.roadDraft && a.roadDraft.length === 1')));
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: lone.x, y: lone.y, button: 'right', buttons: 2, clickCount: 1 }, page.sessionId);
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lone.x, y: lone.y, button: 'right', buttons: 0, clickCount: 1 }, page.sessionId);
    await page.sleep(150);
    check('the right button puts the draft away and leaves the tool in hand', (await app('a.roadDraft === null && a.armed === "road"')));
    await key(page, 'Escape');

    /* A car on the road. */
    await tool(page, 'Vehicle');
    const onRoad = await corner(65, 40);
    await mouse(page, 'mouseMoved', onRoad.x, onRoad.y, 0);
    await page.sleep(500);
    check('the car shows where it would stand, on the road', (await app('!!a.view3d.carGhostGroup')));
    const off = await corner(120, 120);
    await mouse(page, 'mouseMoved', off.x, off.y, 0);
    await page.sleep(300);
    check('and nothing where no road is near', (await app('!a.view3d.carGhostGroup')));
    const before = await undoCount(page);
    await click(page, onRoad.x, onRoad.y);
    await key(page, 'Escape');
    const car = (await json(page, 'window.trackBuilder.doc.elements.filter((e) => e.type === "vehicle")'))[0];
    check('a click on the road puts a car on it, selected, as one undo step',
      car && car.road === road.id && Math.abs(car.dims.offset - 25) < 3 && (await undoCount(page)) === before + 1 && (await app('a.selection.has(a.doc.elements.find((e) => e.type === "vehicle").id)')),
      JSON.stringify(car && car.dims));
    await page.until('!window.trackBuilder.view3d.dirty && !!window.trackBuilder.view3d.traffic && window.trackBuilder.view3d.traffic.cars && window.trackBuilder.view3d.traffic.cars.cars.length === 1', 20000);
    check('the card is the car\'s: how it drives and which way', /Driving/.test(await page.evaluate("document.getElementById('tb-card').textContent")) && /Direction/.test(await page.evaluate("document.getElementById('tb-card').textContent")));
    check('and the Play button is on the canvas, with a car to drive', (await app('!!document.querySelector(".tb-play") && !document.querySelector(".tb-play").hidden')));

    /* Slid along its road. */
    /* Where the car is drawn, in the scene, which is the document's own point: the one conversion read back. */
    const here = await json(page, `(() => {
      const a = window.trackBuilder;
      const v = a.view3d;
      const car = a.doc.elements.find((e) => e.type === 'vehicle');
      const t = v.traffic.cars.cars.find((c) => c.element === car.id);
      const p = t.root.getWorldPosition(new v.camera.position.constructor());
      return { wx: p.x, wz: p.z };
    })()`);
    const carScreen = await screenOf(page, 'view3d', here.wx, -here.wz, 0.7);
    const slideTo = await corner(90, 70);
    const slid0 = await undoCount(page);
    await drag(page, carScreen, slideTo, { steps: 12 });
    const slid = (await json(page, 'window.trackBuilder.doc.elements.filter((e) => e.type === "vehicle")'))[0];
    check('a drag on the car slides it along its road, as one undo step', slid.dims.offset > car.dims.offset + 20 && (await undoCount(page)) === slid0 + 1, `${car.dims.offset} to ${slid.dims.offset}`);

    /* Control D puts a copy further on. */
    await key(page, 'KeyD', 2);
    const cars = await json(page, 'window.trackBuilder.doc.elements.filter((e) => e.type === "vehicle").map((e) => e.dims.offset)');
    check('Control D puts a copy of the car further along the same road, not on it', cars.length === 2 && Math.abs(cars[1] - cars[0]) > 5, cars.join(', '));

    /* The road: selected by a click on its tarmac, its nodes pulled. */
    await key(page, 'Escape');
    const tarmac = await corner(40, 65);
    await click(page, tarmac.x, tarmac.y);
    check('a click on the tarmac selects the road, which has no mesh', (await app('a.selection.size === 1 && a.selection.has(a.doc.elements.find((e) => e.type === "road").id)')));
    await page.until('!window.trackBuilder.view3d.dirty && !!window.trackBuilder.view3d.handles', 20000);
    check('and its handles are up: a node each and a knob between each pair', (await app('a.view3d.handles.handles.filter((m) => m.userData.node != null).length === 4 && a.view3d.handles.handles.filter((m) => m.userData.leg != null).length === 4')));
    const handleAt = (kind, index) => json(page, `(() => {
      const v = window.trackBuilder.view3d;
      const m = v.handles.handles.find((h) => h.userData.${kind} === ${index});
      const r = v.canvas.getBoundingClientRect();
      v.applyCamera(); v.camera.updateMatrixWorld(true);
      const p = m.getWorldPosition(new v.camera.position.constructor());
      p.project(v.camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    })()`);
    const n2 = await handleAt('node', 2);
    const n2to = await corner(110, 110);
    const pulled0 = await undoCount(page);
    await drag(page, n2, n2to, { steps: 12 });
    road = (await json(page, 'window.trackBuilder.doc.elements.filter((e) => e.type === "road")'))[0];
    const abs = road.nodes.map((n) => [road.position.x + n.x, road.position.y + n.y]);
    check('a node is pulled to the grid, as one undo step, and the road bends through it',
      Math.abs(abs[2][0] - 110) < 1.6 && Math.abs(abs[2][1] - 110) < 1.6 && (await undoCount(page)) === pulled0 + 1, JSON.stringify(abs[2]));
    const knob0 = await handleAt('leg', 0);
    await page.until('!window.trackBuilder.view3d.dirty && !!window.trackBuilder.view3d.handles', 20000);
    const knob = await handleAt('leg', 0);
    const knobTo = await corner(65, 20);
    await drag(page, knob, knobTo, { steps: 12 });
    road = (await json(page, 'window.trackBuilder.doc.elements.filter((e) => e.type === "road")'))[0];
    check('a knob between two nodes puts a new one in and pulls it', road.nodes.length === 5, `${road.nodes.length} nodes`);
    await key(page, 'Delete');
    road = (await json(page, 'window.trackBuilder.doc.elements.filter((e) => e.type === "road")'))[0];
    check('Delete takes the picked node out again, and not the road', road && road.nodes.length === 4);
    check('the cars were kept on the road through every bend', (await json(page, 'window.trackBuilder.doc.elements.filter((e) => e.type === "vehicle").every((e) => e.road === window.trackBuilder.doc.elements.find((r) => r.type === "road").id)')));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A MAP BY TOUCH, ON A TABLET (FREESTYLE-3D-BUILD-PLAN.md): a tap puts the piece down, a tap
 * on it selects it, and its card is the small bar of Turn, Copy, Remove and More and nothing
 * else, because a card of fields at finger size covers the map it is for. A road is laid by
 * taps, the last again finishing it, and a finger has no right button to put a draft away with,
 * so the coach says where the tool is put away.
 */
kase('map: by touch', async () => {
  const page = await openMap(1024, 768, { touch: true });
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    const toolAt = async (label) => {
      await page.evaluate(`(() => { const b = [...document.querySelectorAll('#tb-palette .tb-tool')].find((x) => x.querySelector('.tb-tool-label')?.textContent === ${JSON.stringify(label)}); b.scrollIntoView({ block: 'center' }); })()`);
      await page.sleep(200);
      return json(page, `(() => {
        const b = [...document.querySelectorAll('#tb-palette .tb-tool')].find((x) => x.querySelector('.tb-tool-label')?.textContent === ${JSON.stringify(label)});
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
    };
    await tap(page, await toolAt('Containers'));
    check('a finger arms a tool, and the coach says tap', (await app('a.armed')) === 'containers' && /Tap the plot to place it/.test(await page.evaluate("document.getElementById('tb-coach').textContent")));
    await tap(page, await screenOf(page, 'view3d', 60, 60, 0));
    const first = (await placed(page))[0];
    check('a tap on the ground puts the piece there', first && first.type === 'containers' && Math.abs(first.x - 60) < 0.51 && Math.abs(first.y - 60) < 0.51, JSON.stringify(first));
    await tap(page, await toolAt('Containers'));
    await tap(page, await screenOf(page, 'view3d', first.x, first.y, 1));
    await page.until('!window.trackBuilder.view3d.dirty', 20000);
    check('a tap on it selects it, and its card is up', (await app('a.selection.size')) === 1 && (await page.evaluate("!document.getElementById('tb-card').hidden")));
    const card = await json(page, `(() => {
      const c = document.getElementById('tb-card');
      const r = c.getBoundingClientRect();
      const s = document.getElementById('tb-stage').getBoundingClientRect();
      return {
        words: [...c.querySelectorAll('button')].map((b) => b.textContent.trim()),
        inputs: c.querySelectorAll('input').length,
        tall: [...c.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().height)),
        inside: r.left >= s.left - 0.5 && r.right <= s.right + 0.5 && r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5,
        share: r.height / s.height,
      };
    })()`);
    check('the card is the small bar: Turn, Copy, Remove and More, with no field on it', ['Turn', 'Copy', 'Remove', 'More'].every((w) => card.words.includes(w)) && card.inputs === 0, JSON.stringify(card.words));
    check('every button on it is a finger tall, it is inside the drawing and well under the 45 percent the check allows', card.tall.every((h) => h >= 44) && card.inside && card.share < 0.45, `${card.tall.join()} ${card.share.toFixed(2)}`);
    const before = await undoCount(page);
    await tap(page, await json(page, `(() => {
      const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent.trim() === 'Turn');
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`));
    check('a tap on Turn turns it a quarter, as one undo step', Math.abs(Math.abs((await placed(page))[0].yaw) - Math.PI / 2) < 1e-6 && (await undoCount(page)) === before + 1);

    /* Moved by a finger: a drag on the piece. */
    await tap(page, await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card .tb-card-x')][0]; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
    const at = (await placed(page))[0];
    const from = await screenOf(page, 'view3d', at.x, at.y, 1);
    const to = await screenOf(page, 'view3d', at.x + 20, at.y, 1);
    await swipe(page, from, to, { steps: 10 });
    const moved = (await placed(page))[0];
    check('a finger dragged on a piece moves it', Math.abs(moved.x - (at.x + 20)) < 2.1, `${at.x} to ${moved.x}`);

    /* A road by taps. */
    await tap(page, await json(page, `(() => { const b = [...document.querySelectorAll('#tb-card .tb-card-x')][0]; if (!b) return { x: 5, y: 5 }; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
    await tap(page, await toolAt('Road'));
    check('the coach says what a finger does with the road tool', /Tap the ground to lay the road/.test(await page.evaluate("document.getElementById('tb-coach').textContent")));
    for (const [x, y] of [[20, 120], [80, 120], [80, 140]]) {
      await tap(page, await screenOf(page, 'view3d', x, y, 0));
    }
    check('three taps are three nodes of a draft', (await app('a.roadDraft && a.roadDraft.length')) === 3);
    check('and the coach says how a finger finishes it', /tap the last again to finish/.test(await page.evaluate("document.getElementById('tb-coach').textContent")));
    await tap(page, await screenOf(page, 'view3d', 80, 140, 0));
    const road = (await json(page, 'window.trackBuilder.doc.elements.filter((e) => e.type === "road")'))[0];
    check('a tap on the last node finishes the road, open, as one road', road && road.nodes.length === 3 && road.closed === false, JSON.stringify(road && road.nodes));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * EVERY TOOL ON A MAP'S PALETTE ARMS, SHOWS ITS GHOST, PLACES ONE PIECE AND HAS A CARD. The
 * ghost, the drop and the card are written for kinds (a solid asset, a window, paint, a note,
 * the pads, the furniture gates and flags), and a kind with no branch is a tool that does
 * nothing, which is how `pole` once went undrawn and unsolid. So each tool is walked: armed
 * by its button, hovered, clicked, selected, and taken away again.
 */
/*
 * bug-67ae1762, a map builder's report: "the specs card that pops up when you select an object isn't
 * particularly practical ... you have all the specs on the right side panel, so the card is just
 * duplication of the same info. And what is more this card covers the view and obstructs placing and
 * moving the object", and "they ... snap to ground if move object underneath". On a map the card steps
 * aside for the open drawer, which holds every field it has, and for a pull; and a position typed into
 * a field carries what stands on the piece, as pulling it and the arrow keys do.
 */
kase('map: the card steps aside, and a typed position carries what stands on the piece', async () => {
  const page = await openMap();
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    await trapToasts(page);
    await page.evaluate(`(async () => {
      const a = window.trackBuilder;
      const { createElement } = await import('/src/trackbuilder/model.js');
      a.edit('probe', (d) => {
        d.elements.push(createElement(d, 'containers', { x: 60, y: 60 }, 0));
      });
      a.view3d.markDirty();
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 20000);
    const cardShown = () => page.evaluate(`(() => { const c = document.getElementById('tb-card'); const s = getComputedStyle(c); return !c.hidden && s.display !== 'none' && s.visibility !== 'hidden'; })()`);
    const floor = (type) => app(`a.doc.elements.find((e) => e.type === ${JSON.stringify(type)})`);
    await app(`a.setSelection([a.doc.elements.find((e) => e.type === 'containers').id]), 1`);
    await page.until("!document.getElementById('tb-card').hidden && !window.trackBuilder.view3d.dirty", 10000);
    await page.sleep(300);
    check('selecting a piece on a map puts its card beside it', await cardShown());
    await app('a.toggleDrawer(true), 1');
    await page.sleep(500);
    check('with the drawer open the card steps aside: the drawer holds the same fields', !(await cardShown()));
    await app('a.toggleDrawer(false), 1');
    await page.sleep(500);
    check('and with the drawer shut again the card is back', await cardShown());
    /* A pull, as the room's drag makes it: an edit begun, and frames drawn while it is open. */
    await app("a.beginEdit('move'), 1");
    await app('a.view3d.markDirty(), a.requestDraw(), 1');
    await page.sleep(500);
    check('while a piece is being pulled the card is not over it', !(await cardShown()));
    await app('a.endEdit(), 1');
    await app('a.view3d.markDirty(), a.requestDraw(), 1');
    await page.sleep(500);
    check('and it is back when the piece is put down', await cardShown());
    /* The same under a real mouse: a press on the piece and a pull. */
    const piece = await app(`(() => { const e = a.doc.elements.find((x) => x.type === 'containers'); return { x: e.position.x, y: e.position.y }; })()`);
    const grab = await screenOf(page, 'view3d', piece.x, piece.y, 1.2);
    const drop = await screenOf(page, 'view3d', piece.x + 12, piece.y - 8, 1.2);
    await mouse(page, 'mouseMoved', grab.x, grab.y, 0);
    await mouse(page, 'mousePressed', grab.x, grab.y, 1);
    for (let k = 1; k <= 8; k += 1) {
      await mouse(page, 'mouseMoved', grab.x + ((drop.x - grab.x) * k) / 8, grab.y + ((drop.y - grab.y) * k) / 8, 1);
      await page.sleep(40);
    }
    await page.sleep(300);
    check('and under a real pull of the mouse the card stays out of the way while the piece is held',
      (await app('a.gesturing()')) && !(await cardShown()));
    await mouse(page, 'mouseReleased', drop.x, drop.y, 0);
    await page.sleep(500);
    check('and is back when the mouse is let go, and the piece has moved',
      !(await app('a.gesturing()')) && (await cardShown()) && (await app(`a.doc.elements.find((x) => x.type === 'containers').position.x`)) > piece.x + 5, `${await app("a.doc.elements.find((x) => x.type === 'containers').position.x")}`);

    /* A typed position carries what stands on the piece. */
    const ids = await page.evaluate(`(async () => {
      const a = window.trackBuilder;
      const m = await import('/src/trackbuilder/model.js');
      const base = a.doc.elements.find((e) => e.type === 'containers');
      const top = m.topOf(base);
      let rider = null;
      a.edit('probe', (d) => {
        rider = m.createElement(d, 'containers', { x: base.position.x, y: base.position.y, z: top }, 0);
        rider.pitch = Math.PI / 2;
        d.elements.push(rider);
      });
      a.view3d.markDirty();
      return { base: base.id, rider: rider.id, top };
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 20000);
    const at = (id) => app(`(() => { const e = a.doc.elements.find((x) => x.id === ${JSON.stringify(id)}); return { x: e.position.x, y: e.position.y, z: e.position.z }; })()`);
    const before = await at(ids.rider);
    check('a container stood on end is on the roof of the one under it', Math.abs(before.z - ids.top) < 0.01 && before.z > 2, JSON.stringify(before));
    await app(`a.setSelection([${JSON.stringify(ids.base)}]), 1`);
    await page.until("!document.getElementById('tb-card').hidden && !window.trackBuilder.view3d.dirty", 10000);
    await page.sleep(300);
    /* The X field of the card of the piece underneath, typed into as a hand does. */
    await page.evaluate(`(() => { const i = document.querySelector('#tb-card [data-tbkey^="card-x-"]'); i.value = '75'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.sleep(400);
    const base1 = await at(ids.base);
    const rider1 = await at(ids.rider);
    check('typing X into the piece underneath moves it', Math.abs(base1.x - 75) < 1e-6, JSON.stringify(base1));
    check('and what stands on it goes with it, still standing on it, and does not drop to the ground',
      Math.abs(rider1.x - 75) < 1e-6 && Math.abs(rider1.z - ids.top) < 0.01, JSON.stringify(rider1));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

kase('map: every tool', async () => {
  const page = await openMap();
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    const every = await json(page, "[...document.querySelectorAll('#tb-palette .tb-tool')].map((b) => b.dataset.tool).filter((id) => id !== 'road' && id !== 'vehicle' && id !== 'ruler')");
    check('the palette has the whole map vocabulary to walk: the assets, the gap, the pads, the paint, the label and the furniture', every.length >= 30, `${every.length} tools`);
    /* The paint is a board admin's since 2026-10-11 (250b1ef), and this page
     * is signed in as nobody, so it is asked to refuse rather than to place. */
    const ids = every.filter((id) => id !== 'groundLogo');
    if (every.includes('groundLogo')) {
      await page.evaluate("window.trackBuilder.pickTool('groundLogo'), 1");
      check('the paint stays out of a hand that is not a board admin\'s', (await app('a.armed')) !== 'groundLogo');
    }
    const spot = await screenOf(page, 'view3d', 80, 80, 0);
    const bad = [];
    for (const id of ids) {
      await page.evaluate(`window.trackBuilder.pickTool(${JSON.stringify(id)}), 1`);
      await mouse(page, 'mouseMoved', spot.x - 3, spot.y - 3, 0);
      await mouse(page, 'mouseMoved', spot.x, spot.y, 0);
      await page.sleep(120);
      const ghost = await app('!!a.view3d.ghost && a.view3d.ghost.items.length === 1 && !!a.view3d.ghostGroup && a.view3d.ghostGroup.children.length > 0');
      const before = await app('a.doc.elements.length');
      await click(page, spot.x, spot.y);
      const made = await json(page, 'window.trackBuilder.doc.elements.slice(-1).map((e) => ({ type: e.type, n: window.trackBuilder.doc.elements.length }))');
      const placedOne = made[0] && made[0].type === id && made[0].n === before + 1;
      const ok = ghost && placedOne;
      if (!ok) {
        bad.push(`${id}: ${ghost ? '' : 'no ghost '}${placedOne ? '' : 'not placed'}`);
      }
      await page.evaluate('window.trackBuilder.disarm(), window.trackBuilder.setSelection([]), 1');
      /* A tool that put nothing down is already in the list, and has no card
       * to look at: selecting the last element of an empty plot threw, and
       * the throw ended the walk before it said which tool it was. */
      if (!made[0]) {
        continue;
      }
      /* The card of what was just put down, by selecting it. */
      await page.evaluate(`(() => { const a = window.trackBuilder; const e = a.doc.elements[a.doc.elements.length - 1]; a.setSelection([e.id]); return 1; })()`);
      const card = await page.evaluate("(() => { const c = document.getElementById('tb-card'); return !c.hidden && c.querySelector('strong') && [...c.querySelectorAll('button')].some((b) => b.textContent === 'Remove') && [...c.querySelectorAll('button')].some((b) => b.textContent === 'More'); })()");
      if (!card) {
        bad.push(`${id}: no card`);
      }
      await page.evaluate('window.trackBuilder.deleteSelection(), 1');
    }
    check('every one of them arms, shows a ghost, puts one piece down where it was clicked, and has a card with Remove and More', bad.length === 0, bad.join('; '));
    check('and the plot is as empty as it started, so nothing was left behind', (await app('a.doc.elements.length')) === 0);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * WHAT THE BUG INBOX ASKED OF THE MAP, REACHED IN THE ROOM (bug-e605ff6a): a piece sunk into the ground to hide part
 * of it, a container stood on end, and a copy of what is selected. Each was made when a map was built on the plan and
 * looked at in a preview, and each has to be where a hand is now: the card's Base takes a sunk base and says so, Page
 * Down and Page Up step it with what stands on it, a drag keeps a sunk piece sunk over the ground and brings it up on
 * to a roof, the card offers Stands, and the card's Copy and Control D put a copy beside it.
 */
kase('map: sinking, standing on end and copying', async () => {
  const page = await openMap();
  try {
    const app = (expr) => page.evaluate(`(() => { const a = window.trackBuilder; return ${expr}; })()`);
    await trapToasts(page);
    await page.evaluate(`(async () => {
      const a = window.trackBuilder;
      const { createElement } = await import('/src/trackbuilder/model.js');
      a.edit('probe', (d) => {
        d.elements.push(createElement(d, 'building', { x: 60, y: 60 }, 0));
        d.elements.push(createElement(d, 'containers', { x: 110, y: 100 }, 0));
      });
      a.view3d.markDirty();
      return 1;
    })()`);
    await page.until('!window.trackBuilder.view3d.dirty', 20000);
    const one = async (type) => (await placed(page)).find((e) => e.type === type);
    const topOf = (type) => app(`(() => { const e = a.doc.elements.find((x) => x.type === ${JSON.stringify(type)}); return import('/src/trackbuilder/model.js').then((m) => m.topOf(e)); })()`);
    /* A press on a button of the card, once the card has stopped following its piece. */
    const cardButton = async (label) => {
      const where = () => json(page, `(() => { const b = [...document.querySelectorAll('#tb-card button')].find((x) => x.textContent === ${JSON.stringify(label)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      let last = await where();
      for (let i = 0; i < 20; i += 1) {
        await page.sleep(150);
        const now = await where();
        if (now && last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5) {
          return now;
        }
        last = now;
      }
      return last;
    };
    const typeBase = async (value) => {
      await page.evaluate(`(() => { const i = document.querySelector('#tb-card [data-tbkey^="card-h-"]'); i.value = ${JSON.stringify(String(value))}; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await page.sleep(200);
    };
    const pick = async (type) => {
      await app(`a.setSelection([a.doc.elements.find((e) => e.type === ${JSON.stringify(type)}).id]), 1`);
      await page.until("!document.getElementById('tb-card').hidden && !window.trackBuilder.view3d.dirty", 10000);
    };

    /* Standing on end: a choice on the card, one undo step, and as tall as it is long. */
    await pick('containers');
    const labels = await json(page, "[...document.querySelectorAll('#tb-card .tb-card-choice-label')].map((x) => x.textContent)");
    check('a container\'s card offers Stands beside its Style', labels.includes('Stands') && labels.includes('Style'), labels.join());
    const flat = await topOf('containers');
    const steps0 = await undoCount(page);
    const onEnd = await cardButton('On end');
    await click(page, onEnd.x, onEnd.y);
    await page.sleep(200);
    const tall = await topOf('containers');
    check('On end stands it up, as one undo step, and it is as tall as it was long', tall > flat + 5 && (await one('containers')).pitch !== 0 && (await undoCount(page)) === steps0 + 1, `${flat} then ${tall}`);
    await page.until('!window.trackBuilder.view3d.dirty', 10000);
    check('and the room still has its ring at its foot', (await app('!!a.view3d.ring && !!a.view3d.ring.parts')));
    /* What a piece is put on is the top of what stands there, so a stood container is a roof as tall as it is long. */
    const roofOn = await app(`(() => {
      let best = 0;
      for (let dx = -2; dx <= 2; dx += 0.5) {
        for (let dy = -2; dy <= 2; dy += 0.5) {
          const t = a.view3d.landings().under(110 + dx, 100 + dy, 1000, null);
          best = t && t.top > best ? t.top : best;
        }
      }
      return best;
    })()`);
    check('and what is pointed at above it lands on its top, as tall as the readout says and not far under it', roofOn <= tall + 0.01 && roofOn > tall - 1.5, `${roofOn} against ${tall}`);
    const flatBtn = await cardButton('Flat');
    await click(page, flatBtn.x, flatBtn.y);
    await page.sleep(200);
    check('Flat lays it down again', Math.abs((await topOf('containers')) - flat) < 1e-6);

    /* Sinking: Base takes a negative number, says so, and Page Up brings it back to the paving. */
    await typeBase(-1.5);
    check('a typed Base of -1.5 sinks it, and the card says how far', (await one('containers')).z === -1.5
      && /Sunk 1\.5 m into the ground/.test(await page.evaluate("document.getElementById('tb-card').textContent")), `${(await one('containers')).z}`);
    await key(page, 'PageUp');
    await key(page, 'PageUp');
    check('Page Up brings it up a quarter metre at a time, and Shift a metre', (await one('containers')).z === -1, `${(await one('containers')).z}`);
    await key(page, 'PageUp', 8);
    check('and it stops at the paving', (await one('containers')).z === 0);
    const before = await undoCount(page);
    await key(page, 'PageDown', 8);
    check('Page Down sinks it a metre, as one step', (await one('containers')).z === -1 && (await undoCount(page)) === before + 1);

    /* A drag keeps it sunk over the ground, and puts it on a roof when it is let go over one. */
    const bld = await one('building');
    const roof = await app('a.view3d.landings().under(60, 60, 1000, null).top');
    const grab = await app(`(() => { const c = a.doc.elements.find((e) => e.type === 'containers'); return { x: c.position.x, y: c.position.y }; })()`);
    const from = await screenOf(page, 'view3d', grab.x, grab.y, 0);
    const over = await screenOf(page, 'view3d', grab.x - 25, grab.y + 10, 0);
    await drag(page, from, over, { steps: 12 });
    const slid = await one('containers');
    check('pulled across the ground it stays sunk', slid.x < grab.x - 10 && slid.z === -1, `${slid.x}, ${slid.y}, ${slid.z}`);
    const slidAt = await screenOf(page, 'view3d', slid.x, slid.y, 0);
    const onRoof = await screenOf(page, 'view3d', bld.x, bld.y, roof);
    await drag(page, slidAt, onRoof, { steps: 14 });
    const up = await one('containers');
    check('and carried over a roof it stands on it, with no sink left to put it inside the building', Math.abs(up.z - roof) < 1e-6, `${up.z} against a roof at ${roof}`);
    check('nothing was set down on the way', !(await toasts(page)).some((t) => /nothing under it|now stands on/.test(t)));

    /* Copy: the card's button and Control D put one beside it, and what is selected is the copy. */
    await key(page, 'Escape');
    await pick('building');
    const n0 = (await placed(page)).length;
    const copyBtn = await cardButton('Copy');
    await click(page, copyBtn.x, copyBtn.y);
    await page.sleep(200);
    const afterCopy = await placed(page);
    const made = afterCopy.filter((e) => e.type === 'building');
    check('the card\'s Copy makes a building beside it, and it is the copy that is selected', afterCopy.length === n0 + 1 && made.length === 2
      && Math.hypot(made[1].x - made[0].x, made[1].y - made[0].y) > 10 && (await app('a.selection.size === 1 && a.selection.has(a.doc.elements.filter((e) => e.type === "building")[1].id)')),
      made.map((e) => `${e.x},${e.y}`).join(' | '));
    await key(page, 'KeyD', 2);
    check('Control D makes another, and a map\'s copy is not put in a flying order it has none of', (await placed(page)).filter((e) => e.type === 'building').length === 3
      && (await app('a.doc.sequence.length')) === 0);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * LOAD LISTS THIS CANVAS'S OWN (MENUS-PLAN.md 1.21). A whoop track opened from
 * the five inch canvas moved the author to the whoop and reseated the aircraft
 * under them; Delete removed a row on one click; a time was an ISO stamp; a row
 * did not say what it was. Each row now says its kind and when it changed the
 * way a person says it, the other canvas's are counted with a way there, and
 * Delete leaves an Undo in the row.
 */
kase('load', async () => {
  const page = await openBuilder('?mode=race&class=full');
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000 - 3600000).toISOString();
    await page.evaluate(`(async () => {
      const m = await import('/src/trackbuilder/model.js');
      const s = await import('/src/trackbuilder/storage.js');
      const field = m.toPlain(m.createTrack('Back field', 'full'));
      field.modifiedUtc = '${twoDaysAgo}';
      s.restoreTrack(field);
      s.saveTrack(m.createTrack('Hall', 'micro'));
      return 1;
    })()`);
    const at = await centreOf(page, '#tb-topbar button', 'Load');
    await click(page, at.x, at.y);
    await page.sleep(300);
    const rows = () => json(page, `(() => {
      const box = document.querySelector('#tb-modal .tb-modal');
      return {
        title: box.getAttribute('aria-label'),
        rows: [...box.querySelectorAll('.tb-load-row')].map((r) => ({
          name: r.querySelector('.tb-load-title')?.textContent || r.textContent,
          kind: r.querySelector('.tb-load-kind')?.textContent || '',
          meta: r.querySelector('.tb-load-meta')?.textContent || '',
          when: r.querySelector('.tb-load-meta span[title]')?.title || '',
          buttons: [...r.querySelectorAll('button')].map((b) => b.textContent),
        })),
        others: box.querySelector('.tb-load-others')?.textContent || '',
      };
    })()`);
    let list = await rows();
    const back = list.rows.find((r) => r.name === 'Back field');
    check('the five inch canvas\'s Load is its saved five inch tracks', list.title === 'Saved five inch tracks' && Boolean(back) && !list.rows.some((r) => r.name === 'Hall'),
      `${list.title}: ${list.rows.map((r) => r.name).join(', ')}`);
    check('each row says what it is and when it changed, the way a person says it', back && back.kind === 'Five inch track' && /changed 2 days ago/.test(back.meta), back && back.meta);
    check('with the whole date in its title', back && /\b20\d\d\b/.test(back.when), back && back.when);
    check('and the whoop track is counted, with the one press that gets there', /1 whoop track saved here opens on the Whoop canvas/.test(list.others) && /Show it/.test(list.others), list.others);
    const del = await json(page, `(() => {
      const row = [...document.querySelectorAll('#tb-modal .tb-load-row')].find((r) => r.querySelector('.tb-load-title')?.textContent === 'Back field');
      const b = [...row.querySelectorAll('button')].find((x) => x.textContent === 'Delete');
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await click(page, del.x, del.y);
    await page.sleep(200);
    const gone = await json(page, `(() => ({
      said: [...document.querySelectorAll('#tb-modal .tb-load-gone')].map((r) => r.textContent).join(' '),
      focus: document.activeElement?.textContent,
      saved: JSON.parse(localStorage.getItem('webfpv.trackbuilder.library.v1') || '{}'),
    }))()`);
    check('Delete takes it out, says so in its row, and puts the keyboard on Undo',
      /Deleted "Back field"\./.test(gone.said) && gone.focus === 'Undo' && !Object.values(gone.saved).some((d) => d.name === 'Back field'), JSON.stringify({ said: gone.said, focus: gone.focus }));
    await key(page, 'Enter');
    await page.sleep(300);
    list = await rows();
    const again = list.rows.find((r) => r.name === 'Back field');
    check('Undo puts it back, as it was: still changed 2 days ago', Boolean(again) && /changed 2 days ago/.test(again.meta), again && again.meta);
    const show = await centreOf(page, '#tb-modal .tb-load-others button');
    await click(page, show.x, show.y);
    await page.until("document.body.classList.contains('tb-whoop')", 10000);
    await page.sleep(300);
    list = await rows();
    check('Show it goes to the Whoop canvas and its Load, which has the whoop track', list.title === 'Saved whoop tracks' && list.rows.some((r) => r.name === 'Hall') && !list.rows.some((r) => r.name === 'Back field'),
      `${list.title}: ${list.rows.map((r) => r.name).slice(0, 4).join(', ')}`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * PUBLISH ASKS FOR A REAL NAME, AND THEN LINKS THE TRACK'S OWN SHEET
 * (MENUS-PLAN.md 4.3, 1.22, 5.2). The board's first impression was a row of
 * Untitled track. Publish keeps its dialog and asks there, with the caret in
 * the name and a line that says why, and sends nothing. The board address is
 * not in front of every author any more. Once it is up, the link is to this
 * track on Maps and Tracks, not the board's front page. Every request to a
 * board is answered by BOARD_STUB: nothing leaves the machine.
 */
kase('publish', async () => {
  const page = await openPage({ root, width: 1600, height: 900, url: '/src/trackbuilder/index.html?mode=race&class=full', seed: [BOARD_STUB()] });
  try {
    await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    await page.evaluate("(() => { const app = window.trackBuilder; app.arm('gate'); app.placeAt({ x: 20, y: 20, z: 0 }); app.disarm(); return 1; })()");
    await page.evaluate('window.trackBuilder.openPublish(), 1');
    await page.sleep(300);
    const state = () => json(page, `(() => {
      const box = document.querySelector('#tb-modal .tb-modal');
      const input = document.getElementById('tb-publish-name');
      const why = document.getElementById('tb-publish-name-why');
      return {
        title: box?.getAttribute('aria-label'), focused: document.activeElement === input, invalid: input?.getAttribute('aria-invalid'),
        why: why && !why.hidden ? why.textContent : '', board: /Board address/i.test(box?.textContent || ''),
        tags: [...(box?.querySelectorAll('.tb-tag') || [])].map((b) => b.textContent),
        calls: window.__api.filter((c) => c.startsWith('POST')).length,
      };
    })()`);
    let s = await state();
    check('Publish on an untitled track opens with the caret in the name', s.title === 'Publish this track' && s.focused, JSON.stringify(s));
    check('there is no board address in the dialog', !s.board);
    check('a five inch track is offered Small field and Big field', s.tags.includes('Small field') && s.tags.includes('Big field'), s.tags.join(', '));
    let send = await centreOf(page, '#tb-modal button', 'Publish this track');
    await click(page, send.x, send.y);
    s = await state();
    check('pressed with that name it sends nothing, and says why under the field, which keeps the caret',
      /Give it a name first/.test(s.why) && s.invalid === 'true' && s.focused && s.calls === 0, JSON.stringify(s));
    await page.evaluate(`(() => {
      const inputs = [...document.querySelectorAll('#tb-modal input[type="text"]')];
      inputs[0].value = 'Flow check field';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].value = 'FlowPilot';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      return 1;
    })()`);
    send = await centreOf(page, '#tb-modal button', 'Publish this track');
    await click(page, send.x, send.y);
    await page.until("!!document.querySelector('#tb-modal a.tb-btn')", 20000);
    const done = await ajson(page, `
      const a = document.querySelector('#tb-modal a.tb-btn');
      const b = await import('/src/share/board.js');
      return {
        text: a.textContent, href: a.href,
        want: new URL(b.boardPageUrl(b.boardOrigin(), '5inch', { track: window.trackBuilder.doc.id }), location.href).href,
        calls: window.__api, close: [...document.querySelectorAll('#tb-modal button')].map((x) => x.textContent),
      };`);
    check('with a name it goes, and the dialog links this track on Maps and Tracks', done.text === 'This track on Maps and Tracks' && done.href === done.want, JSON.stringify({ text: done.text, href: done.href, want: done.want }));
    check('and its other button says Close', done.close.includes('Close'), done.close.join(', '));
    check('every request went to the board this page points at, answered here', done.calls.length > 0 && done.calls.every((c) => !/webfpv\.org/.test(c)), done.calls.join(' | '));
    await page.evaluate('window.trackBuilder.closeModal(), 1');

    /* A whoop track is not offered the field sizes. */
    await loadPreset(page, 'racegow5-track1');
    await page.evaluate("window.trackBuilder.doc.name = 'Flow check room', window.trackBuilder.updateTopBar(), window.trackBuilder.openPublish(), 1");
    await page.sleep(300);
    s = await state();
    check('a whoop track is not offered Small field or Big field', s.title === 'Publish this track' && s.tags.length > 3 && !s.tags.includes('Small field') && !s.tags.includes('Big field'), `${s.title}: ${s.tags.join(', ')}`);
    await page.evaluate('window.trackBuilder.closeModal(), 1');
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
  /* A map, the same way: a name first, and then the map's own sheet. */
  const map = await openPage({ root, width: 1600, height: 900, url: '/src/trackbuilder/index.html?mode=freestyle', seed: [BOARD_STUB()] });
  try {
    await map.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    await map.evaluate("(() => { const app = window.trackBuilder; app.arm('tree'); app.placeAt({ x: 40, y: 40, z: 0 }); app.disarm(); return 1; })()");
    await map.evaluate('window.trackBuilder.openPublish(), 1');
    await map.sleep(300);
    const s = await json(map, `(() => {
      const box = document.querySelector('#tb-modal .tb-modal');
      const input = box.querySelector('input[type="text"]');
      return { title: box.getAttribute('aria-label'), focused: document.activeElement === input, value: input.value, board: /Board address/i.test(box.textContent) };
    })()`);
    check('a map\'s Publish opens with the caret in its name, and no board address', s.title === 'Publish this map' && s.focused && !s.board, JSON.stringify(s));
    let send = await centreOf(map, '#tb-modal button', 'Publish this map');
    await click(map, send.x, send.y);
    check('and sends nothing under Untitled map', (await map.evaluate("window.__api.filter((c) => c.startsWith('POST')).length")) === 0
      && /Give it a name first/.test(await map.evaluate("document.querySelector('#tb-modal .tb-ask')?.textContent || ''")));
    await map.evaluate(`(() => {
      const inputs = [...document.querySelectorAll('#tb-modal input[type="text"]')];
      inputs[0].value = 'Flow check plot';
      inputs[1].value = 'FlowPilot';
      return 1;
    })()`);
    send = await centreOf(map, '#tb-modal button', 'Publish this map');
    await click(map, send.x, send.y);
    await map.until("!!document.querySelector('#tb-modal a.tb-btn')", 20000);
    const done = await ajson(map, `
      const a = document.querySelector('#tb-modal a.tb-btn');
      const b = await import('/src/share/board.js');
      return { text: a.textContent, href: a.href, want: new URL(b.boardPageUrl(b.boardOrigin(), null, { map: window.trackBuilder.doc.id }), location.href).href };`);
    check('with a name it goes, and links this map on Maps and Tracks', done.text === 'This map on Maps and Tracks' && done.href === done.want, JSON.stringify(done));
    check('the page reported no error of its own', ownErrors(map).length === 0, ownErrors(map).join(' | '));
  } finally {
    await map.close();
  }
});

/*
 * AN EMPTY FIVE INCH CANVAS SAYS WHAT TO DO (MENUS-PLAN.md 4.2b): pick a gate
 * and click the field, or start from a track on the board, opened as a copy.
 * Offline, or with the board asleep, it says the board could not be reached
 * and offers Load, rather than an empty list that looks like an empty board.
 */
kase('five inch empty', async () => {
  const doc = await fieldDoc('Board field', 3);
  const board = {
    tracks: [
      { id: 'trk-board1', name: 'Board field', author: 'Ada', gates: 3, times: 12, trackClass: 'full' },
      { id: 'trk-board2', name: 'Board room', author: 'Bo', gates: 5, times: 40, trackClass: 'micro' },
    ],
    documents: { 'trk-board1': { id: 'trk-board1', name: 'Board field', author: 'Ada', document: doc } },
  };
  const page = await openPage({ root, width: 1600, height: 900, url: '/src/trackbuilder/index.html?mode=race&class=full', seed: [BOARD_STUB(board)] });
  try {
    await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    /* The five inch opens in the room once it is ready, and the box moves with it: pressed before that, the press
     * lands where the box was. */
    await page.until("window.trackBuilder.mode === '3d' && !!window.trackBuilder.view3d.renderer", 60000).catch(() => {});
    await page.sleep(400);
    await trapToasts(page);
    const empty = await json(page, "(() => { const e = document.getElementById('tb-empty'); return { shown: !e.hidden && e.getClientRects().length > 0, text: e.textContent }; })()");
    check('an empty five inch canvas says what to do', empty.shown && /Pick a gate on the left, then click the field/.test(empty.text) && /Start from a track on the board/.test(empty.text), empty.text);
    const go = await centreOf(page, '#tb-empty button');
    await click(page, go.x, go.y);
    await page.until("document.querySelectorAll('#tb-modal .tb-load-row').length > 0", 10000);
    const rows = await json(page, "[...document.querySelectorAll('#tb-modal .tb-load-row')].map((r) => r.textContent)");
    check('Start from a track on the board lists the board\'s five inch tracks, and not its rooms', rows.length === 1 && /Board field/.test(rows[0]) && /by Ada/.test(rows[0]) && /12 times posted/.test(rows[0]), rows.join(' | '));
    const open = await centreOf(page, '#tb-modal .tb-load-row button', 'Open a copy');
    await click(page, open.x, open.y);
    await page.until("document.getElementById('tb-modal').hidden", 10000);
    await page.sleep(300);
    const got = await json(page, '({ id: window.trackBuilder.doc.id, name: window.trackBuilder.doc.name, n: window.trackBuilder.doc.elements.length })');
    check('Open a copy opens it as the author\'s own copy, under a new id', got.n === 3 && got.id !== doc.id && /Board field/.test(got.name), JSON.stringify(got));
    check('and says it is a copy to publish under a new name', /your copy of "Board field"/.test((await toasts(page)).join(' ')), (await toasts(page)).join(' | '));
    check('the empty state is gone with something on the canvas', await page.evaluate("document.getElementById('tb-empty').hidden"));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
  const down = await openPage({ root, width: 1600, height: 900, url: '/src/trackbuilder/index.html?mode=race&class=full', seed: [BOARD_STUB({ down: true })] });
  try {
    await down.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    await down.until("window.trackBuilder.mode === '3d' && !!window.trackBuilder.view3d.renderer", 60000).catch(() => {});
    await down.sleep(400);
    const go = await centreOf(down, '#tb-empty button');
    await click(down, go.x, go.y);
    await down.until("/could not be reached/.test(document.querySelector('#tb-modal')?.textContent || '')", 10000);
    const said = await json(down, "({ text: document.querySelector('#tb-modal').textContent, buttons: [...document.querySelectorAll('#tb-modal button')].map((b) => b.textContent) })");
    check('with the board asleep it says the board could not be reached, and offers Try again and Load',
      /The board could not be reached/.test(said.text) && said.buttons.includes('Try again') && said.buttons.includes('Load'), said.buttons.join(', '));
    check('the page reported no error of its own', ownErrors(down).length === 0, ownErrors(down).join(' | '));
  } finally {
    await down.close();
  }
});

/*
 * THE SIMULATOR'S BUILD A TRACK (MENUS-PLAN.md 2.4) writes a 'new' intent and
 * opens this page on ?mode=race. It used to land on whatever track was last on
 * the canvas. It starts a blank one now, as New does, and the work that was on
 * the canvas goes into Load first and the toast says so: nothing is lost.
 */
kase('build a track', async () => {
  const old = await fieldDoc('Old field', 2);
  const seed = `(() => {
    try {
      if (sessionStorage.getItem('flow-seeded')) return;
      sessionStorage.setItem('flow-seeded', '1');
      localStorage.setItem('webfpv.share.builderIntent.v1', JSON.stringify({ kind: 'new' }));
      localStorage.setItem('webfpv.trackbuilder.autosave.v1', ${JSON.stringify(JSON.stringify(old))});
    } catch (e) {}
  })()`;
  const page = await openPage({ root, width: 1600, height: 900, url: '/src/trackbuilder/index.html?mode=race', seed: [seed] });
  try {
    await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    const got = await json(page, `({
      name: window.trackBuilder.doc.name, n: window.trackBuilder.doc.elements.length, id: window.trackBuilder.doc.id,
      toast: document.getElementById('tb-toast').textContent,
      library: Object.values(JSON.parse(localStorage.getItem('webfpv.trackbuilder.library.v1') || '{}')).map((d) => d.name + '/' + d.elements.length),
      intent: localStorage.getItem('webfpv.share.builderIntent.v1'),
      modal: !document.getElementById('tb-modal').hidden,
    })`);
    check('it opens a blank five inch track', got.n === 0 && got.name === 'Untitled track' && got.id !== old.id, JSON.stringify(got));
    check('the track that was on the canvas is in Load, whole', got.library.includes('Old field/2'), got.library.join(', '));
    check('and the toast says both', /New track\./.test(got.toast) && /"Old field" is in Load\./.test(got.toast), got.toast);
    check('without asking first, and the intent is used up', !got.modal && got.intent === null);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
  /* An empty canvas has nothing to keep, so nothing is said about Load. */
  const blank = await openPage({ root, width: 1600, height: 900, url: '/src/trackbuilder/index.html?mode=race', seed: ["try { localStorage.setItem('webfpv.share.builderIntent.v1', JSON.stringify({ kind: 'new' })); } catch (e) {}"] });
  try {
    await blank.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    const got = await json(blank, `({
      n: window.trackBuilder.doc.elements.length, toast: document.getElementById('tb-toast').textContent,
      library: Object.keys(JSON.parse(localStorage.getItem('webfpv.trackbuilder.library.v1') || '{}')).length,
    })`);
    check('on an empty canvas it opens a blank one and keeps nothing', got.n === 0 && got.library === 0 && !/in Load/.test(got.toast), JSON.stringify(got));
  } finally {
    await blank.close();
  }
});

/*
 * A LINK OPENS ONCE (MENUS-PLAN.md 4.5). Measured on 831b724: a ?track= link,
 * edited and reloaded, came back as the link's version with the edits moved to
 * Load; a ?share= copy, edited and reloaded, asked "Open a copy...?" again. The
 * parameter comes out of the address once read, so a reload is the author
 * reloading their own work. A ?share= the board could not answer stays, so a
 * reload asks again.
 */
kase('links open once', async () => {
  const linked = await fieldDoc('Linked field', 1);
  const page = await openBuilder(`?class=full&track=${encodeURIComponent(JSON.stringify(linked))}`, 1600, 900);
  try {
    let got = await json(page, '({ name: window.trackBuilder.doc.name, search: location.search, n: window.trackBuilder.doc.elements.length })');
    check('a ?track= link opens its track', got.name === 'Linked field' && got.n === 1, JSON.stringify(got));
    check('and leaves the address once it is read', !/track=/.test(got.search) && /class=full/.test(got.search), got.search);
    await page.evaluate("(() => { const app = window.trackBuilder; app.arm('gate'); app.placeAt({ x: 30, y: 20, z: 0 }); app.disarm(); app.autosaver.flush(); return 1; })()");
    await page.evaluate('location.reload(), 1');
    await page.sleep(1000);
    await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    got = await json(page, '({ name: window.trackBuilder.doc.name, n: window.trackBuilder.doc.elements.length, modal: !document.getElementById("tb-modal").hidden })');
    check('so a reload after an edit is the edited track, not the link again', got.name === 'Linked field' && got.n === 2 && !got.modal, JSON.stringify(got));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
  const broken = await openBuilder('?class=full&track=%7Bnot%20a%20track', 1600, 900);
  try {
    const toast = await broken.evaluate("document.getElementById('tb-toast').textContent");
    check('a ?track= link that holds no track says so', /That track link could not be opened/.test(toast), toast);
  } finally {
    await broken.close();
  }
  const shared = await fieldDoc('Shared field', 2);
  const board = { documents: { 'trk-shared1': { id: 'trk-shared1', name: 'Shared field', author: 'Ada', document: shared } } };
  const share = await openPage({ root, width: 1600, height: 900, url: '/src/trackbuilder/index.html?class=full&share=trk-shared1', seed: [BOARD_STUB(board)] });
  try {
    await share.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    let got = await json(share, '({ name: window.trackBuilder.doc.name, n: window.trackBuilder.doc.elements.length, search: location.search })');
    check('a ?share= link opens the board\'s track as a copy', got.n === 2 && /Shared field/.test(got.name), JSON.stringify(got));
    check('and leaves the address once the board has answered', !/share=/.test(got.search), got.search);
    await share.evaluate("(() => { const app = window.trackBuilder; app.arm('gate'); app.placeAt({ x: 40, y: 20, z: 0 }); app.disarm(); app.autosaver.flush(); return 1; })()");
    await share.evaluate('location.reload(), 1');
    await share.sleep(1000);
    await share.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    got = await json(share, '({ n: window.trackBuilder.doc.elements.length, modal: !document.getElementById("tb-modal").hidden, text: document.getElementById("tb-modal").textContent })');
    check('so a reload keeps the copy and its edit, and asks nothing', got.n === 3 && !got.modal, JSON.stringify(got));
    check('the page reported no error of its own', ownErrors(share).length === 0, ownErrors(share).join(' | '));
  } finally {
    await share.close();
  }
  const asleep = await openPage({ root, width: 1600, height: 900, url: '/src/trackbuilder/index.html?class=full&share=trk-shared1', seed: [BOARD_STUB({ down: true })] });
  try {
    await asleep.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    const got = await json(asleep, '({ search: location.search, toast: document.getElementById("tb-toast").textContent })');
    check('a ?share= the board could not answer stays in the address, and the toast says a reload tries again', /share=trk-shared1/.test(got.search) && /Reload to try again/.test(got.toast), JSON.stringify(got));
  } finally {
    await asleep.close();
  }
});

/*
 * AN OFFICIAL TRACK DOES NOT OPEN FOR ANYBODY BUT AN ADMIN (the owner's rule of
 * 2026-10-04, after they could still open one in the builder). Every door that
 * hands the builder a track asks the board whether it is official, a stranger and
 * the browser that published it get the same answer and a dialog that says why,
 * the canvas is left as it was, and an admin's sign in from that dialog opens the
 * door it stopped at. A canvas that comes back official is taken off it with
 * what the board lacks kept in Load. The board is BOARD_STUB, which says which
 * tracks are official and who the admin is: nothing leaves the machine.
 */
kase('official tracks', async () => {
  const BOARD = 'https://board.test';
  const official = await fieldDoc('The Official', 2);
  const ordinary = await fieldDoc('The Ordinary', 3);
  const edited = { ...official, elements: [...official.elements, ...(await fieldDoc('x', 3)).elements.slice(2)] };
  const board = {
    official: { [official.id]: true, [ordinary.id]: false },
    documents: {
      [official.id]: { id: official.id, name: 'The Official', author: 'Ada', document: official },
      [ordinary.id]: { id: ordinary.id, name: 'The Ordinary', author: 'Ada', document: ordinary },
    },
    tracks: [
      { id: official.id, name: 'The Official', author: 'Ada', gates: 2, times: 0, official: true, trackClass: 'full' },
      { id: ordinary.id, name: 'The Ordinary', author: 'Ada', gates: 3, times: 0, official: false, trackClass: 'full' },
    ],
    admin: { email: 'keeper@example.com', password: 'pw' },
  };
  const at = (query = '') => `/src/trackbuilder/index.html?class=full&board=${BOARD}${query}`;
  const modal = (page) => page.evaluate("(() => { const m = document.getElementById('tb-modal'); return m.hidden ? '' : m.textContent; })()");
  const dialog = (page, words) => page.until(`(() => { const m = document.getElementById('tb-modal'); return !m.hidden && m.textContent.includes(${JSON.stringify(words)}); })()`, 20000);
  const press = (page, label) => page.evaluate(`(() => { const b = [...document.querySelectorAll('#tb-modal button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (b) b.click(); return Boolean(b); })()`);
  const toast = (page) => page.evaluate("document.getElementById('tb-toast').textContent");
  const booted = (page) => page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
  const asked = (page, id) => page.evaluate(`window.__api.some((c) => c === 'GET ${BOARD}/api/tracks/${id}')`);
  /* What the pilot's browser held, before the page's first line: the library, the
   * edit key that says this browser published the track, the canvas it left. */
  const held = (docs, { canvas = null, key = null } = {}) => `(() => {
    try {
      if (sessionStorage.getItem('flow-seeded')) return;
      sessionStorage.setItem('flow-seeded', '1');
      localStorage.setItem('webfpv.trackbuilder.library.v1', ${JSON.stringify(JSON.stringify(Object.fromEntries(docs.map((d) => [d.id, d]))))});
      ${key ? `localStorage.setItem('webfpv.share.editkeys.v1', ${JSON.stringify(JSON.stringify({ [key]: 'flow-key' }))});` : ''}
      ${canvas ? `localStorage.setItem('webfpv.trackbuilder.autosave.v1', ${JSON.stringify(JSON.stringify(canvas))});` : ''}
    } catch (e) {}
  })()`;
  const open = async (query, seeds = []) => {
    const page = await openPage({ root, width: 1600, height: 900, url: at(query), seed: [BOARD_STUB(board), ...seeds] });
    await booted(page);
    return page;
  };

  /* A BOARD LINK, from a stranger: the answer, not a copy. And an admin signs in from the dialog. */
  let page = await open(`&share=${official.id}`);
  try {
    await dialog(page, 'is an official track');
    const said = await modal(page);
    check('a board link to an official track says it is official and who can open it', /"The Official" is an official track\. Only a board admin can open an official track in the builder/.test(said), said);
    check('it asked the board, and opened neither the track nor a copy of it',
      (await asked(page, official.id)) && (await page.evaluate('window.trackBuilder.doc.id')) !== official.id && !/your copy/.test(await toast(page)));
    check('it can still be flown, and the dialog says so', /fly it and post a time/.test(said), said);
    await press(page, 'Board admin? Sign in');
    await page.until("!!document.getElementById('tb-admin-email')", 5000);
    await page.evaluate("(() => { document.getElementById('tb-admin-email').value = 'keeper@example.com'; document.getElementById('tb-admin-password').value = 'nope'; })()");
    await press(page, 'Sign in');
    await page.until("document.getElementById('tb-modal').textContent.includes('do not open this board')", 10000);
    check('a wrong password is told no, in the board\'s words, and nothing opens', (await page.evaluate('window.trackBuilder.doc.id')) !== official.id);
    await page.evaluate("document.getElementById('tb-admin-password').value = 'pw'");
    await press(page, 'Sign in');
    await page.until(`window.trackBuilder.doc.id === ${JSON.stringify(official.id)}`, 20000);
    check('signing in as an admin from the dialog opens the official track in place, under its own id', true);
    check('and the toast says it is an admin\'s edit', /as an admin/.test(await toast(page)), await toast(page));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }

  /* An ordinary track is a copy, as it always was, with no dialog. */
  page = await open(`&share=${ordinary.id}`);
  try {
    await page.until("/your copy/.test(document.getElementById('tb-toast').textContent)", 15000);
    check('a board link to an ordinary track still opens a copy', (await page.evaluate('window.trackBuilder.doc.id')) !== ordinary.id && (await modal(page)) === '');
  } finally {
    await page.close();
  }

  /* LOAD, for the browser that published it: the edit key does not get it in. */
  page = await open('', [held([official], { key: official.id })]);
  try {
    const before = await page.evaluate('window.trackBuilder.doc.id');
    await page.evaluate('window.trackBuilder.openLoad()');
    await page.until("[...document.querySelectorAll('#tb-modal .tb-load-row')].some((r) => r.textContent.includes('The Official'))", 10000);
    await page.evaluate("[...document.querySelectorAll('#tb-modal .tb-load-row')].find((r) => r.textContent.includes('The Official')).querySelector('button').click()");
    await dialog(page, 'is an official track');
    check('Open in Load on an official track the browser published is answered with why, and the canvas stays', (await page.evaluate('window.trackBuilder.doc.id')) === before);
  } finally {
    await page.close();
  }

  /* THE CANVAS A BROWSER REOPENS ON, official since: taken off, nothing lost. */
  page = await open('', [held([], { canvas: official, key: official.id })]);
  try {
    await dialog(page, 'is an official track');
    const library = await json(page, "Object.values(JSON.parse(localStorage.getItem('webfpv.trackbuilder.library.v1') || '{}')).map((d) => d.name)");
    check('a reopened canvas that is now official is taken off, and the dialog says it is', (await page.evaluate('window.trackBuilder.doc.id')) !== official.id && !/Load as/.test(await modal(page)));
    check('with nothing to keep, nothing is added to Load', library.length === 0, library.join(', '));
  } finally {
    await page.close();
  }
  page = await open('', [held([], { canvas: edited, key: official.id })]);
  try {
    await dialog(page, 'is an official track');
    const library = await json(page, "Object.values(JSON.parse(localStorage.getItem('webfpv.trackbuilder.library.v1') || '{}')).map((d) => d.name + '/' + d.elements.length)");
    check('with changes the board lacks, they go into Load as a copy, and the dialog says where', library.includes('The Official (local changes)/3') && /is in Load as "The Official \(local changes\)"/.test(await modal(page)), `${library.join(', ')} :: ${await modal(page)}`);
    check('and the canvas is a fresh track', (await page.evaluate('window.trackBuilder.doc.id')) !== official.id && (await page.evaluate('window.trackBuilder.doc.elements.length')) === 0);
  } finally {
    await page.close();
  }

  /* THE SAME RELOAD, SIGNED IN AS AN ADMIN, keeps the track. */
  const session = `(() => { try { sessionStorage.setItem('webfpv.share.admin.v1', ${JSON.stringify(JSON.stringify({ token: 'stub-admin-token', email: 'keeper@example.com', expiresUtc: new Date(Date.now() + 36e5).toISOString(), board: BOARD }))}); } catch (e) {} })()`;
  page = await open('', [held([], { canvas: official, key: official.id }), session]);
  try {
    await page.sleep(2000);
    check('an admin who reloads onto an official track keeps it, with no dialog', (await page.evaluate('window.trackBuilder.doc.id')) === official.id && (await modal(page)) === '');
  } finally {
    await page.close();
  }

  /* THE BOARD PICKER: the row says so and has no button to press, for a stranger. */
  page = await open();
  try {
    await page.evaluate('window.trackBuilder.openBoardStarters()');
    await page.until("document.querySelectorAll('#tb-modal .tb-load-row').length === 2", 10000);
    const rows = await json(page, "[...document.querySelectorAll('#tb-modal .tb-load-row')].map((r) => ({ text: r.textContent, label: r.querySelector('button').textContent, off: r.querySelector('button').disabled }))");
    const row = (name) => rows.find((r) => r.text.includes(name));
    check('an official row says official and its button is shut', row('The Official').off === true && row('The Official').label === 'Official' && /official/.test(row('The Official').text), JSON.stringify(row('The Official')));
    check('an ordinary row still opens a copy', row('The Ordinary').off === false && row('The Ordinary').label === 'Open a copy', JSON.stringify(row('The Ordinary')));
    check('and the line above the list says why some are shut', /Official ones can be flown/.test(await modal(page)));
  } finally {
    await page.close();
  }
  page = await open('', [session]);
  try {
    await page.evaluate('window.trackBuilder.openBoardStarters()');
    await page.until("document.querySelectorAll('#tb-modal .tb-load-row').length === 2", 10000);
    const off = await json(page, "[...document.querySelectorAll('#tb-modal .tb-load-row button')].map((b) => b.disabled)");
    check('signed in as an admin, every row opens', off.every((x) => x === false), JSON.stringify(off));
  } finally {
    await page.close();
  }

  /* AN IMPORTED FILE keeps the id it was published under. */
  page = await open();
  try {
    const before = await page.evaluate('window.trackBuilder.doc.id');
    await page.evaluate(`(async () => { const m = await import('/src/trackbuilder/model.js'); await window.trackBuilder.importText(m.serialize(m.normalize(${JSON.stringify(official)}).doc)); })()`);
    await dialog(page, 'is an official track');
    check('importing an official track\'s file is answered the same way, and the canvas stays', (await page.evaluate('window.trackBuilder.doc.id')) === before);
    await page.evaluate('window.trackBuilder.closeModal()');
    await page.evaluate(`(async () => { const m = await import('/src/trackbuilder/model.js'); await window.trackBuilder.importText(m.serialize(m.normalize(${JSON.stringify(ordinary)}).doc)); })()`);
    await page.until(`window.trackBuilder.doc.id === ${JSON.stringify(ordinary.id)}`, 10000);
    check('and a file that is not official imports as it always did', (await modal(page)) === '');
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * A MAP'S BOARD COPY THAT MOVED ON WITHOUT THIS BROWSER IS NOT PUBLISHED OVER
 * (2026-10-17). An admin put 106 stickers on the board's copy of the Infinity
 * Loops map; its author's builder still held the copy from before them, under
 * the same id, so the board link left that copy on the canvas ("already on your
 * canvas") and Update the board put it back over the stickers. Now the board
 * link opens the board's copy, or asks when it cannot tell which is newer, and
 * Update asks before taking pieces off the board that the canvas has not got.
 * `--root=` on a checkout from before the fix fails the first check.
 */
kase('map board copy', async () => {
  const BOARD = 'https://board.test';
  const { createTrack, createElement, toPlain } = await import(pathToFileURL(resolve(root, 'src/trackbuilder/model.js')).href);
  const listing = await import(pathToFileURL(resolve(root, 'src/share/listing.js')).href);
  const fingerprint = listing.contentFingerprint || (() => '');
  const base = createTrack('Sticker plot', 'full', 'freestyle');
  /* One at a time: an element's id is the next one free in the document, so two made before either is pushed share one. */
  base.elements.push(createElement(base, 'tree', { x: 20, y: 20, z: 0 }));
  base.elements.push(createElement(base, 'tree', { x: 40, y: 24, z: 0 }));
  const A = toPlain(base);
  const stickered = createTrack('Sticker plot', 'full', 'freestyle');
  stickered.id = base.id;
  stickered.elements = A.elements.map((e) => ({ ...e }));
  for (let i = 0; i < 3; i += 1) {
    const el = createElement(stickered, 'groundLogo', { x: 10 + i * 6, y: 30, z: 0 });
    stickered.elements.push(el);
  }
  const B = toPlain(stickered);
  B.elements.filter((e) => e.type === 'groundLogo').forEach((e, i) => { e.crop = { x: i * 0.25, y: 0, w: 0.25, h: 0.5 }; e.achievement = '90%er'; });
  const edited = JSON.parse(JSON.stringify(A));
  edited.elements[1].position.x += 6;
  const at = (query = '') => `/src/trackbuilder/index.html?mode=freestyle&board=${BOARD}${query}`;
  const modal = (page) => page.evaluate("(() => { const m = document.getElementById('tb-modal'); return m.hidden ? '' : m.textContent; })()");
  const press = (page, label) => page.evaluate(`(() => { const b = [...document.querySelectorAll('#tb-modal button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (b) b.click(); return Boolean(b); })()`);
  const toast = (page) => page.evaluate("document.getElementById('tb-toast').textContent");
  const canvas = (page) => json(page, "(() => { const d = window.trackBuilder.doc; return { id: d.id, pieces: d.elements.length, crops: d.elements.filter((e) => e.crop).length, x: (d.elements[1] || {}).position?.x }; })()");
  const posts = (page) => page.evaluate("window.__api.filter((c) => c.startsWith('POST') && /\\/api\\/maps$/.test(c)).length");
  const library = (page) => json(page, "Object.values(JSON.parse(localStorage.getItem('webfpv.trackbuilder.library.v1') || '{}')).map((d) => d.name + '/' + d.elements.length)");
  const boardHash = (page) => page.evaluate(`(JSON.parse(localStorage.getItem('webfpv.share.maps.v1') || '{}')[${JSON.stringify(A.id)}] || {}).boardHash || ''`);
  /* What the author's browser held, and what the board holds, before the page's first line. */
  const held = ({ seat, onBoard, hash = '' }) => `(() => {
    try {
      if (sessionStorage.getItem('flow-seeded')) return;
      sessionStorage.setItem('flow-seeded', '1');
      localStorage.setItem('webfpv.trackbuilder.autosave.freestyle.v1', ${JSON.stringify(JSON.stringify(seat))});
      localStorage.setItem('webfpv.share.maps.v1', ${JSON.stringify(JSON.stringify({ [A.id]: { editKey: 'flow-key', board: BOARD, author: 'Mat', nameOnBoard: 'Sticker plot', ...(hash ? { boardHash: hash } : {}) } }))});
      localStorage.setItem('flow-board:maps:' + ${JSON.stringify(A.id)}, ${JSON.stringify(JSON.stringify({ id: A.id, name: 'Sticker plot', author: 'Mat', document: onBoard }))});
    } catch (e) {}
  })()`;
  const open = async (query, seeds) => {
    const page = await openPage({ root, width: 1600, height: 900, url: at(query), seed: [BOARD_STUB(), ...seeds] });
    await page.until('!!(window.trackBuilder && window.trackBuilder.doc)', 60000);
    return page;
  };
  /* Update the board from the publish dialog, with the author's name filled in. */
  const update = async (page) => {
    await page.evaluate('window.trackBuilder.openPublish(), 1');
    await page.until("!!document.querySelector('#tb-modal input[type=\"text\"]')", 10000);
    await page.evaluate("(() => { const i = [...document.querySelectorAll('#tb-modal input[type=\"text\"]')]; i[1].value = 'Mat'; return 1; })()");
    await press(page, 'Update the board');
  };

  /* THE CASE THAT HAPPENED: an old copy on the canvas, a map published before boardHash was kept, the board link. */
  let page = await open(`&mapshare=${A.id}`, [held({ seat: A, onBoard: B })]);
  try {
    await page.until("!document.getElementById('tb-modal').hidden || /canvas/.test(document.getElementById('tb-toast').textContent)", 20000);
    const said = await modal(page);
    check('the board link to your own map asks before keeping an older canvas, and says how many pieces the board has that it has not',
      /Open the board's copy of "Sticker plot"\?/.test(said) && /3 pieces your canvas does not/.test(said), said || await toast(page));
    await press(page, 'Open the board\'s copy');
    await page.until(`window.trackBuilder.doc.elements.length === ${B.elements.length}`, 10000);
    const c = await canvas(page);
    check('opening it puts the board\'s copy on the canvas, stickers and all', c.id === A.id && c.crops === 3, JSON.stringify(c));
    check('and the older canvas is kept in Load', (await library(page)).includes(`Sticker plot/${A.elements.length}`), (await library(page)).join(', '));
    check('and the listing remembers what the board holds', (await boardHash(page)) === fingerprint(B) && fingerprint(B) !== '');
    await update(page);
    await page.until("!!document.querySelector('#tb-modal a.tb-btn')", 20000);
    const sent = await json(page, `JSON.parse(localStorage.getItem('flow-board:maps:${A.id}')).document.elements.filter((e) => e.crop).length`);
    check('then Update goes straight up, with no question, and the stickers go with it', (await posts(page)) === 1 && sent === 3, `${await posts(page)} posts, ${sent} crops`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }

  /* NO LINK: the builder reopens on the old copy, and Update is pressed. */
  page = await open('', [held({ seat: A, onBoard: B })]);
  try {
    await update(page);
    await page.until("document.getElementById('tb-modal').textContent.includes('Update anyway')", 20000);
    const said = await modal(page);
    check('Update over a board copy with pieces the canvas has not got says so, and sends nothing',
      /has 3 pieces your canvas does not/.test(said) && (await posts(page)) === 0, said);
    await press(page, 'Open the board\'s copy');
    await page.until(`window.trackBuilder.doc.elements.length === ${B.elements.length}`, 10000);
    check('and it offers the board\'s copy instead', (await canvas(page)).crops === 3);
  } finally {
    await page.close();
  }
  page = await open('', [held({ seat: A, onBoard: B })]);
  try {
    await update(page);
    await page.until("document.getElementById('tb-modal').textContent.includes('Update anyway')", 20000);
    await press(page, 'Update anyway');
    await page.until("!!document.querySelector('#tb-modal a.tb-btn')", 20000);
    check('a second press, Update anyway, still sends it', (await posts(page)) === 1);
  } finally {
    await page.close();
  }

  /* KNOWN: the board moved and the canvas did not. The board's copy opens with no question. */
  page = await open(`&mapshare=${A.id}`, [held({ seat: A, onBoard: B, hash: fingerprint(A) })]);
  try {
    await page.until(`window.trackBuilder.doc.elements.length === ${B.elements.length} || !document.getElementById('tb-modal').hidden`, 20000);
    check('a board copy that moved on while the canvas did not opens by itself', (await canvas(page)).crops === 3 && (await modal(page)) === '', await modal(page));
  } finally {
    await page.close();
  }

  /* KNOWN: the canvas moved and the board did not. The canvas stays, and Update asks nothing. */
  page = await open(`&mapshare=${A.id}`, [held({ seat: edited, onBoard: A, hash: fingerprint(A) })]);
  try {
    await page.until("/canvas/.test(document.getElementById('tb-toast').textContent)", 20000);
    const c = await canvas(page);
    check('your own newer edits stay on the canvas when the board has not moved', c.x === edited.elements[1].position.x && (await modal(page)) === '', JSON.stringify(c));
    await update(page);
    await page.until("!!document.querySelector('#tb-modal a.tb-btn')", 20000);
    check('and Update sends them with no question', (await posts(page)) === 1);
  } finally {
    await page.close();
  }
});

/*
 * THE PHONE (MENUS-PLAN.md 4.4). At 390 by 844 the drawing was 0 px wide and
 * nine of the bar's controls were past the right edge. Now Tools and Details
 * open the palette and the inspector as drawers, a tool picked closes the
 * palette and its name stays on the bar while it is in hand, one finger taps
 * to place and drags to look, two fingers slide and pinch the plan and place
 * nothing, the bar's second row is in More, and Fly is on the bar.
 */
kase('phone', async () => {
  const page = await openBuilder('?mode=race&class=full', 390, 844, { touch: true });
  try {
    await trapToasts(page);
    /* The five inch opens in the room, and the plan is one press away. This case is the plan's gestures with a finger
     * (the room's are "five inch: by touch"), so it goes to the plan once the room has opened by itself. */
    await page.until("window.trackBuilder.mode === '3d' && !!window.trackBuilder.view3d.renderer", 60000).catch(() => {});
    await page.evaluate('window.trackBuilder.show2d(), 1');
    await page.sleep(400);
    const facts = await json(page, `(() => {
      const W = innerWidth;
      const bar = [...document.querySelectorAll('#tb-topbar button, #tb-topbar a, #tb-topbar input')]
        .filter((c) => !c.closest('.tb-more-menu') && c.getClientRects().length);
      const stage = document.getElementById('tb-stage').getBoundingClientRect();
      return {
        off: bar.filter((c) => { const r = c.getBoundingClientRect(); return r.right > W + 0.5 || r.left < -0.5; }).map((c) => c.textContent),
        words: bar.map((c) => (c.textContent || c.value || '').trim()),
        stage: { w: stage.width, h: stage.height }, docW: document.documentElement.scrollWidth,
        keep: document.getElementById('tb-keep').getClientRects().length,
      };
    })()`);
    check('nothing on the bar is past the edge of a portrait phone, and the page does not scroll sideways', facts.off.length === 0 && facts.docW === 390, `${facts.off.join(', ')} ${facts.docW}`);
    check('the bar has Tools, Details, Undo, Load, More and Fly, and nothing a phone does not need',
      ['Tools', 'Details', 'Undo', 'Redo', 'Load', 'More'].every((w) => facts.words.includes(w)) && facts.words.some((w) => /^Fly/.test(w))
      && !facts.words.includes('Publish') && !facts.words.includes('Fit'), facts.words.join(', '));
    check('the drawing has the screen under the bar, and there is no storage strip', facts.stage.w === 390 && facts.stage.h > 700 && facts.keep === 0, JSON.stringify(facts.stage));

    const tools = await centreOf(page, '#tb-topbar .tb-tools-btn');
    await tap(page, tools);
    await slid(page, 'tb-palette');
    check('Tools opens the palette as a drawer, with its own close button', (await page.evaluate("document.body.classList.contains('tb-tools')")) && (await uncovered(page, '#tb-palette .tb-tools-x')));
    const gate = await centreOf(page, '#tb-palette .tb-tool', null);
    await tap(page, gate);
    await page.sleep(300);
    const armed = await json(page, "({ armed: window.trackBuilder.armed, open: document.body.classList.contains('tb-tools'), btn: window.trackBuilder.toolsBtn.textContent })");
    check('a tool picked closes the drawer, and the Tools button carries its name while it is in hand', armed.armed === 'gate' && !armed.open && armed.btn === 'Gate', JSON.stringify(armed));
    check('and the coach line at the foot says what a tap does now, and where the tool is put away', /Tap the ground to place it/.test(await page.evaluate("document.getElementById('tb-coach').textContent")) && /Put it away from Tools/.test(await page.evaluate("document.getElementById('tb-coach').textContent")),
      await page.evaluate("document.getElementById('tb-coach').textContent"));
    const spot = await screenOf(page, 'view2d', 30, 20);
    await tap(page, spot);
    check('a tap on the plan places it', (await elements(page)).length === 1 && (await undoCount(page)) === 1);
    const scale0 = await page.evaluate('window.trackBuilder.view2d.cam.scale');
    const mid = await screenOf(page, 'view2d', 30, 30);
    await pair(page, [{ x: mid.x - 50, y: mid.y }, { x: mid.x + 50, y: mid.y }], [{ x: mid.x - 110, y: mid.y }, { x: mid.x + 110, y: mid.y }], { steps: 10 });
    const scale1 = await page.evaluate('window.trackBuilder.view2d.cam.scale');
    const after = await screenOf(page, 'view2d', 30, 30);
    check('two fingers pinch the plan closer, with a tool in hand, and place nothing', scale1 > scale0 * 1.6 && (await elements(page)).length === 1 && (await undoCount(page)) === 1, `${scale0} then ${scale1}`);
    check('and what was between them stays between them', Math.hypot(after.x - mid.x, after.y - mid.y) < 8, `${Math.hypot(after.x - mid.x, after.y - mid.y).toFixed(1)} px`);
    const from = await screenOf(page, 'view2d', 20, 30);
    await swipe(page, from, { x: from.x + 60, y: from.y + 40 });
    const moved = await screenOf(page, 'view2d', 20, 30);
    check('one finger dragged with a tool in hand slides the plan and places nothing', Math.hypot(moved.x - from.x - 60, moved.y - from.y - 40) < 12 && (await elements(page)).length === 1,
      `${(moved.x - from.x).toFixed(0)}, ${(moved.y - from.y).toFixed(0)}`);
    await tap(page, tools);
    await slid(page, 'tb-palette');
    const lit = await centreOf(page, '#tb-palette .tb-tool.on');
    await tap(page, lit);
    await page.sleep(300);
    check('Tools, and the tool again, puts it away, and the button says Tools again', !(await page.evaluate('window.trackBuilder.armed')) && (await page.evaluate('window.trackBuilder.toolsBtn.textContent')) === 'Tools');
    await page.evaluate('window.trackBuilder.closeTools(), 1');

    const details = await centreOf(page, '#tb-topbar .tb-details-btn');
    await tap(page, details);
    await slid(page, 'tb-side');
    check('Details opens the inspector as a drawer, with its own close button', (await page.evaluate("document.body.classList.contains('tb-drawer')")) && (await uncovered(page, '#tb-side-x')));
    const scroll = await json(page, "(() => { const s = document.getElementById('tb-side'); return { scrolls: s.scrollHeight > s.clientHeight, style: getComputedStyle(s).overflowY }; })()");
    check('and it scrolls as one, rather than three panels a hundred pixels tall', scroll.style === 'auto', JSON.stringify(scroll));
    await tap(page, { x: 8, y: 400 });
    await page.sleep(300);
    check('a tap on the dimmed drawing beside it closes it, and places nothing', !(await page.evaluate("document.body.classList.contains('tb-drawer')")) && (await elements(page)).length === 1);

    const more = await centreOf(page, '#tb-topbar .tb-more > button', 'More');
    await tap(page, more);
    await page.sleep(300);
    const menu = await json(page, "[...document.querySelectorAll('.tb-more-menu .tb-more-item')].filter((b) => b.getClientRects().length).map((b) => b.textContent)");
    check('More holds the bar\'s second row: the canvas, New, Save, the view (3D first, as a room\'s is), Fit, Show line, Square, Labels, Sponsor logos and Publish, then More\'s own',
      ['Five inch', 'Whoop', 'Freestyle', 'New track', 'Save', '3D', '2D', 'Fit', 'Show line', 'Square', 'Labels', 'Sponsor logos', 'Publish', 'Duplicate', 'Back to the simulator'].every((w) => menu.includes(w))
      && menu.indexOf('3D') < menu.indexOf('2D') && !menu.includes('Top') && menu.indexOf('Five inch') < menu.indexOf('Duplicate'), menu.join(', '));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE ANIMATION'S SIZE IS A CHOICE. Export animation drew every file at 512
 * and offered no way to ask for more, so a field with forty gates came out as
 * a few pixels of grey a gate under a name nobody could read. The box has a
 * Size now, and this holds the part of it a pilot meets: three sizes with the
 * usual one chosen, what each costs said under it and tied to it for a screen
 * reader, a render that saves the file the pilot always got, and a box that
 * can be walked away from, which stops the render. That last one is here
 * because a render at the top size is minutes, and a box that cannot be closed
 * for minutes is one people close the tab on.
 *
 * The downloads are caught in the page and not made. Standard is followed
 * through to the file. The bigger sizes' names are the file name rule's, which
 * scripts/gif-selftest.js holds, and what they draw is checked by looking at
 * them, so a render at 1024 is not what this is for.
 *
 * THE WAIT AFTER THE CLOSE is the one soft thing in it: nothing in the page
 * says a render has stopped, so it waits well past the time the rest of the
 * render would have taken and checks that no file arrived. A machine slower
 * than this one's software rasteriser can only make that pass when it should
 * not, never fail when it should not.
 */
kase('animation size', async () => {
  const page = await openBuilder();
  const press = (label) => page.evaluate(`(() => {
    const b = [...document.querySelectorAll('.tb-modal button')].find((x) => x.textContent === ${JSON.stringify(label)});
    if (!b) return false;
    b.click();
    return true;
  })()`);
  const choose = (edge) => page.evaluate(`(() => {
    const s = document.getElementById('tb-animation-size');
    s.value = '${edge}';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return s.value;
  })()`);
  const note = () => page.evaluate("document.getElementById('tb-animation-size-note').textContent");
  const boxText = () => page.evaluate("(document.querySelector('.tb-modal') || { textContent: '' }).textContent");
  try {
    await page.evaluate(`(() => {
      window.__downloads = [];
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) {
          const rec = { name: this.download, bytes: -1 };
          window.__downloads.push(rec);
          fetch(this.href).then((r) => r.blob()).then((b) => { rec.bytes = b.size; });
          return undefined;
        }
        return click.call(this);
      };
      return 1;
    })()`);
    await loadPreset(page, 'racegow5-track1');
    await menu(page, 'Export animation');
    await page.until("!!document.getElementById('tb-animation-size')", 5000);

    const shape = await json(page, `(() => {
      const s = document.getElementById('tb-animation-size');
      const l = document.querySelector("label[for='tb-animation-size']");
      return {
        options: [...s.options].map((o) => o.value),
        chosen: s.value,
        label: l ? l.textContent : null,
        described: s.getAttribute('aria-describedby'),
        noteId: document.getElementById('tb-animation-size-note') ? 'tb-animation-size-note' : null,
      };
    })()`);
    check('Export animation offers three sizes, the usual first, then 1024 and 2048', shape.options.join() === '512,1024,2048', shape.options.join());
    check('and the usual one is chosen when the box opens, so doing nothing gets the file it always did', shape.chosen === '512', shape.chosen);
    check('the choice has a label, and what it costs is tied to it for a screen reader', shape.label === 'Size' && shape.described && shape.described === shape.noteId, JSON.stringify(shape));
    const notes = [await note()];
    await choose(1024);
    notes.push(await note());
    await choose(2048);
    notes.push(await note());
    check('what each size costs is said under it, and says something different for each', notes.every((n) => n.length > 30) && new Set(notes).size === 3, notes.map((n) => n.slice(0, 30)).join(' | '));
    check('the box says that closing it stops the render', /closing this box stops it/.test(await boxText()));
    check('a whoop track is flown in a room, so there is no race field to choose and no Setting', (await page.evaluate("!!document.getElementById('tb-animation-setting')")) === false);

    /* Standard, through to the file. */
    await choose(512);
    check('Render the animation was pressed', await press('Render the animation'));
    await page.until("/Frame \\d+ of \\d+/.test(((document.querySelector('.tb-modal') || {}).textContent) || '')", 60000);
    check('the size cannot be changed while it renders', await page.evaluate("document.getElementById('tb-animation-size').disabled") === true);
    await page.until("/Done\\./.test(((document.querySelector('.tb-modal') || {}).textContent) || '')", 240000);
    await page.sleep(800);
    const done = await json(page, `({
      files: window.__downloads,
      locked: document.getElementById('tb-animation-size').disabled,
      buttons: [...document.querySelectorAll('.tb-modal button')].map((b) => b.textContent),
    })`);
    check('one file was saved, and at the usual size it has the name it always had', done.files.length === 1 && done.files[0].name === 'racegow5-track-1.gif', JSON.stringify(done.files));
    check('and it is a real animation, not an empty file', done.files[0] && done.files[0].bytes > 20000, String(done.files[0] && done.files[0].bytes));
    check('then the size can be changed again, and the button offers another go', done.locked === false && done.buttons.includes('Render it again'), JSON.stringify(done));

    /* The box closed part way through a render stops it. */
    check('the box closed', await press('Close'));
    await menu(page, 'Export animation');
    await page.until("!!document.getElementById('tb-animation-size')", 5000);
    await press('Render the animation');
    await page.until("/Frame [3-9]/.test(((document.querySelector('.tb-modal') || {}).textContent) || '')", 60000);
    check('and the box was closed with the render under way', await press('Close'));
    await page.sleep(25000);
    const after = await page.evaluate('window.__downloads.length');
    check('closing the box part way through stopped the render: no second file arrived', after === 1, `${after} files`);
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * THE SETTING OF A FIVE INCH ANIMATION. The black stage it has always been
 * shot on, or the track on a race field with the sponsors on the grass. The
 * field is what the bigger sizes are for, so choosing one puts it on, until
 * the pilot has chosen for themselves, after which their choice stands at any
 * size. Nothing is rendered here: what the field looks like is looked at, and
 * the file name that says it is the file name rule's, which
 * scripts/gif-selftest.js holds.
 */
kase('animation setting', async () => {
  const page = await openBuilder('?class=full');
  const choose = (id, value) => page.evaluate(`(() => {
    const s = document.getElementById('${id}');
    s.value = '${value}';
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return s.value;
  })()`);
  const setting = () => page.evaluate("document.getElementById('tb-animation-setting').value");
  try {
    await page.evaluate(`(async () => {
      const { FIVE_INCH_PRESETS } = await import('/src/trackbuilder/presets5.js');
      window.trackBuilder.loadDocument(JSON.parse(JSON.stringify(FIVE_INCH_PRESETS[0])), '');
      return 1;
    })()`);
    await menu(page, 'Export animation');
    await page.until("!!document.getElementById('tb-animation-size')", 5000);
    const shape = await json(page, `(() => {
      const s = document.getElementById('tb-animation-setting');
      const l = document.querySelector("label[for='tb-animation-setting']");
      const n = document.getElementById('tb-animation-setting-note');
      return { options: s ? [...s.options].map((o) => o.value) : null, chosen: s && s.value, label: l && l.textContent, described: s && s.getAttribute('aria-describedby'), note: n ? n.textContent : '' };
    })()`);
    check('a five inch track is offered a Setting: the black stage, or the race field', shape.options && shape.options.join() === 'stage,field', JSON.stringify(shape));
    check('it is labelled, and what it does is tied to it for a screen reader', shape.label === 'Setting' && shape.described === 'tb-animation-setting-note' && shape.note.length > 20, JSON.stringify(shape));
    check('at the usual size it is the stage, so the file is the one it always was', shape.chosen === 'stage', String(shape.chosen));
    await choose('tb-animation-size', 1024);
    check('choosing High puts it on the race field', (await setting()) === 'field');
    await choose('tb-animation-size', 512);
    check('and going back to Standard puts the stage back, while the pilot has not chosen', (await setting()) === 'stage');
    await choose('tb-animation-size', 2048);
    check('Very high is the field too', (await setting()) === 'field');
    const noteField = await page.evaluate("document.getElementById('tb-animation-setting-note').textContent");
    await choose('tb-animation-setting', 'stage');
    check('the pilot choosing the stage changes what the note says', (await page.evaluate("document.getElementById('tb-animation-setting-note').textContent")) !== noteField);
    await choose('tb-animation-size', 1024);
    check('and their choice then stands at any size', (await setting()) === 'stage');
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

/*
 * LETTERS, AND GATES WITH NO FRAME, on the five inch canvas, laid and changed the way a person does it: the palette's
 * button and its chooser, a click on the plan, the card beside what was laid. A letter is a capital of pipe with gaps in
 * it to fly through (the WA State Champs' W), and an invisible gate is an opening with nothing built round it. The pure
 * half is in the self test; what only a page can say is that the chooser is there, that a click lays the letter that is lit,
 * that the card offers what a letter and a gate each can be, and that each change is ONE step to undo.
 */
kase('letters and invisible gates', async () => {
  const page = await openBuilder('?class=full');
  try {
    await page.evaluate("window.trackBuilder.setMode('2d'), 1");
    await page.sleep(500);
    const at = (x, y) => json(page, `(() => {
      const app = window.trackBuilder;
      const s = app.view2d.toScreen({ x: ${x}, y: ${y} });
      const r = app.view2d.canvas.getBoundingClientRect();
      return { x: r.left + s.x, y: r.top + s.y };
    })()`);
    const steps = () => page.evaluate('window.trackBuilder.history.past.length');
    const tool = (id) => page.evaluate(`document.querySelector('#tb-palette .tb-tool[data-tool="${id}"]').click(), 1`);
    const card = () => page.evaluate("(document.getElementById('tb-card') || {}).innerText || ''");
    const choiceButton = (label, index) => page.evaluate(`(() => {
      const row = [...document.querySelectorAll('#tb-card .tb-card-choice')].find((r) => r.innerText.trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())}));
      if (!row) { return false; }
      row.querySelectorAll('button')[${index}].click();
      return true;
    })()`);
    const pick = (key, value) => page.evaluate(`(() => {
      const sel = document.querySelector('[data-tbkey="${key}"]');
      if (!sel) { return false; }
      sel.value = ${JSON.stringify(value)};
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    const docOf = (i) => json(page, `window.trackBuilder.doc.elements[${i}]`);

    /* THE TOOL AND ITS CHOOSER */
    const palette = await json(page, `({
      tools: [...document.querySelectorAll('#tb-palette .tb-tool')].map((b) => b.dataset.tool),
      letterKey: document.querySelector('#tb-palette .tb-tool[data-tool="letter"] .tb-tool-key').textContent,
      invisibleKey: document.querySelector('#tb-palette .tb-tool[data-tool="invisibleGate"] .tb-tool-key').textContent,
      boxShownBefore: !document.querySelector('.tb-letter-opts').hidden,
    })`);
    check('the five inch palette has a Letter tool, after the dive gate and before the barrier, and an Invisible gate piece, right after the gate',
      palette.tools.indexOf('diveGate') < palette.tools.indexOf('letter') && palette.tools.indexOf('letter') < palette.tools.indexOf('barrier')
      && palette.tools.indexOf('invisibleGate') === palette.tools.indexOf('gate') + 1, palette.tools.join());
    check('the invisible gate has its key, I, and the letter has none, because the free ones are a map\'s', palette.invisibleKey === 'I' && palette.letterKey === '', `${palette.invisibleKey} ${palette.letterKey}`);
    check('the chooser is not shown until the tool is in hand', palette.boxShownBefore === false);
    await tool('letter');
    await page.until("window.trackBuilder.armed === 'letter' && !document.querySelector('.tb-letter-opts').hidden", 5000);
    const chips = await json(page, `[...document.querySelectorAll('.tb-letter-grid [data-letter]')].map((b) => b.dataset.letter)`);
    check('with the tool in hand the chooser shows all twenty six capitals', chips.join('') === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', chips.join(''));
    await page.evaluate("document.querySelector('.tb-letter-grid [data-letter=\"W\"]').click(), 1");
    check('a chip lights, and is the letter in hand', await page.evaluate('window.trackBuilder.letterTool') === 'W'
      && await page.evaluate("document.querySelector('.tb-letter-grid [data-letter=\"W\"]').getAttribute('aria-pressed')") === 'true');

    /* LAYING ONE */
    const before = await steps();
    const w = await at(24, 20);
    await click(page, w.x, w.y);
    await page.until("window.trackBuilder.doc.elements.some((e) => e.type === 'letter')", 5000);
    const laid = await docOf(0);
    check('a click on the plan lays the letter in hand, a W, in the flying order, as one step',
      laid.type === 'letter' && laid.letter === 'W' && laid.name === 'Letter W' && await page.evaluate('window.trackBuilder.doc.sequence.length') === 1
      && await steps() === before + 1, JSON.stringify(laid));
    check('and the tool stays in hand for the next one, as a gate does', await page.evaluate('window.trackBuilder.armed') === 'letter');
    await page.evaluate("document.querySelector('.tb-letter-grid [data-letter=\"B\"]').click(), 1");
    const b = await at(34, 24);
    await click(page, b.x, b.y);
    await page.until("window.trackBuilder.doc.elements.length === 2", 5000);
    const second = await docOf(1);
    check('another chip, another letter: a B, whose first pass is through its lower bowl', second.letter === 'B' && await page.evaluate('window.trackBuilder.doc.sequence[1].apertureIndex') === 0);
    check('and the choice is remembered for the next visit', await page.evaluate("localStorage.getItem('webfpv.trackbuilder.letter.v1')") === 'B');

    /* THE CARD OF A LETTER */
    await page.evaluate('window.trackBuilder.disarm(), window.trackBuilder.setSelection([window.trackBuilder.doc.elements[0].id]), 1');
    await page.until("document.getElementById('tb-card') && !document.getElementById('tb-card').hidden", 5000);
    let text = await card();
    check('the card of a letter names it, offers the other capitals, the frame and the size, and has no flag to go round',
      /Letter W/.test(text) && /FRAME/i.test(text) && /Width \(m\)/.test(text) && /Height \(m\)/.test(text) && !/ROUND THE FLAG/i.test(text) && !/FLAGS/i.test(text), text.slice(0, 160));
    const was = await steps();
    check('Letter on the card changes it to an N in place', await pick(`card-letter-${laid.id}`, 'N'));
    await page.sleep(200);
    const changed = await docOf(0);
    check('the same piece, another letter, as one step: it keeps its place and its size follows the scale it had',
      changed.id === laid.id && changed.letter === 'N' && changed.name === 'Letter N' && await steps() === was + 1 && await page.evaluate('window.trackBuilder.doc.sequence.length') === 2, JSON.stringify(changed));
    await page.until("document.querySelector('#tb-card .tb-card-choice') && /FLIES THROUGH/i.test(document.getElementById('tb-card').innerText)", 5000);
    check('an N has two gaps, and the card says which one this pass goes through', await choiceButton('Flies through', 1));
    await page.sleep(200);
    check('and choosing the other gap moves the pass', await page.evaluate('window.trackBuilder.doc.sequence[0].apertureIndex') === 1);
    check('Frame: Invisible takes the pipe away, and Built puts it back, each one step',
      await choiceButton('Frame', 1) && (await page.sleep(150), await docOf(0)).unbuilt === true && await choiceButton('Frame', 0) && (await page.sleep(150), await docOf(0)).unbuilt === undefined);
    await page.evaluate('window.trackBuilder.undo && window.trackBuilder.undo(), 1');

    /* AN INVISIBLE GATE, from the palette */
    await page.evaluate('window.trackBuilder.disarm(), window.trackBuilder.setSelection([]), 1');
    await tool('invisibleGate');
    await page.until("window.trackBuilder.armed === 'invisibleGate'", 5000);
    const g = await at(44, 22);
    const n0 = await steps();
    await click(page, g.x, g.y);
    await page.until("window.trackBuilder.doc.elements.length === 3", 5000);
    const inv = await docOf(2);
    check('a click with the Invisible gate piece lays a gate with nothing built, in the flying order, as one step',
      inv.type === 'gate' && inv.unbuilt === true && await page.evaluate('window.trackBuilder.doc.sequence.length') === 3 && await steps() === n0 + 1, JSON.stringify(inv));
    check('it stays in hand, like a gate', await page.evaluate('window.trackBuilder.armed') === 'invisibleGate');
    await page.evaluate('window.trackBuilder.disarm(), 1');
    await page.until("document.getElementById('tb-card') && !document.getElementById('tb-card').hidden", 5000);
    text = await card();
    check('its card calls it an invisible gate, offers Frame with Invisible lit, and offers to make it a letter', /Invisible gate/.test(text) && /FRAME/i.test(text) && /Make it a letter/.test(text), text.slice(0, 120));
    check('and has no flags to put on a thing with nothing built', !/FLAGS/i.test(text));

    /* A GATE THAT IS THERE BECOMES A LETTER: how a track is edited */
    await page.evaluate('window.trackBuilder.pickTool("gate"), 1');
    const gp = await at(50, 12);
    await click(page, gp.x, gp.y);
    await page.until("window.trackBuilder.doc.elements.length === 4", 5000);
    await page.evaluate('window.trackBuilder.disarm(), 1');
    await page.until("document.getElementById('tb-card') && !document.getElementById('tb-card').hidden", 5000);
    const gate = await docOf(3);
    const order = await json(page, 'window.trackBuilder.doc.sequence.map((s) => s.elementId)');
    const s0 = await steps();
    check('a plain gate\'s card offers Make it a letter, and choosing one makes it that letter', await pick(`card-make-letter-${gate.id}`, 'K'));
    await page.sleep(250);
    const made = await docOf(3);
    check('in the same place, with the same id, in the same place in the flying order, as one step',
      made.type === 'letter' && made.letter === 'K' && made.id === gate.id && Math.abs(made.position.x - gate.position.x) < 1e-9 && Math.abs(made.position.y - gate.position.y) < 1e-9
      && JSON.stringify(await json(page, 'window.trackBuilder.doc.sequence.map((s) => s.elementId)')) === JSON.stringify(order) && await steps() === s0 + 1, JSON.stringify(made));
    await page.evaluate('window.trackBuilder.undo && window.trackBuilder.undo(), 1');
    check('and Undo puts the gate back, as it was', (await docOf(3)).type === 'gate');

    /* IN THE ROOM: a letter is picked by its pipe, and by the gap that is the gate */
    await page.evaluate(`(() => {
      const t = window.trackBuilder;
      t.edit('lay a W for the room', (d) => {
        d.elements.length = 0;
        d.sequence.length = 0;
      });
      t.pickTool('letter');
      t.setLetterTool('W');
      t.placeAt({ x: 30, y: 20 });
      t.disarm();
      t.setSelection([]);
      return 1;
    })()`);
    await inThreeD(page);
    await page.evaluate('window.trackBuilder.setSelection([window.trackBuilder.doc.elements[0].id]), window.trackBuilder.frameSelection(), window.trackBuilder.setSelection([]), 1');
    await page.sleep(500);
    const lone = await json(page, 'window.trackBuilder.doc.elements[0]');
    const gap = await screenOf(page, 'view3d', lone.position.x, lone.position.y, 1.05);
    check('the gap of a W is on the screen', Boolean(gap), JSON.stringify(gap));
    await click(page, gap.x, gap.y);
    await page.sleep(250);
    check('a click in the gap between the Vs picks the W', await page.evaluate('window.trackBuilder.selection.has(window.trackBuilder.doc.elements[0].id)') === true);
    await page.evaluate('window.trackBuilder.setSelection([]), 1');
    await page.sleep(200);
    const leg = await screenOf(page, 'view3d', lone.position.x, lone.position.y + 1.8375, 1.765);
    await click(page, leg.x, leg.y);
    await page.sleep(250);
    check('and a click on its left pipe picks it too', await page.evaluate('window.trackBuilder.selection.has(window.trackBuilder.doc.elements[0].id)') === true, JSON.stringify(leg));
    await page.evaluate('window.trackBuilder.setSelection([]), window.trackBuilder.setSelection([window.trackBuilder.doc.elements[0].id]), 1');
    await page.evaluate("window.trackBuilder.setPieceInvisible(window.trackBuilder.doc.elements[0].id, true), window.trackBuilder.setSelection([]), 1");
    await page.sleep(300);
    await click(page, gap.x, gap.y);
    await page.sleep(250);
    check('an invisible W is still found by its gap, which is all that is left of it', await page.evaluate('window.trackBuilder.selection.has(window.trackBuilder.doc.elements[0].id)') === true);

    /* THE FILE AND THE ROUND TRIP */
    const kept = await json(page, `(() => {
      const t = window.trackBuilder;
      const text = JSON.stringify(t.doc);
      return { letters: t.doc.elements.filter((e) => e.type === 'letter').length, hasSchema: t.doc.schemaVersion };
    })()`);
    check('the document holds the letter and the schema version is the one it was', kept.letters === 1 && kept.hasSchema === 3, JSON.stringify(kept));
    check('the page reported no error of its own', ownErrors(page).length === 0, ownErrors(page).join(' | '));
  } finally {
    await page.close();
  }
});

async function main() {
  console.log(`builder flow check${rootArg ? ` (against ${root})` : ''}\n`);
  for (const [name, fn] of CASES) {
    if (only && name !== only) {
      continue;
    }
    console.log(name);
    try {
      await fn();
    } catch (e) {
      check(`${name} ran to the end`, false, e.message);
    }
  }
  if (failures.length) {
    console.log(`\nFAIL, ${failures.length}:`);
    for (const f of failures) {
      console.log(`  ${f}`);
    }
    return 1;
  }
  console.log('\nPASS');
  return 0;
}

process.exit(await main());
