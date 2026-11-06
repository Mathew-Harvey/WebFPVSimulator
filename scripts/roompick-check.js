/*
 * roompick-check.js: a room joined while the joystick picker is up hands
 * the sticks back to the radio.
 *
 * Copyright (C) 2026 Mathew Harvey
 *
 *
 * WHY THIS EXISTS
 *
 * bug-97aa6ae3, a blocking ticket of 2026-11-05: "Linked up with friend.
 * And i can't take off. Controller calibrates and saved, but inside room I
 * am dead." The report had two pads plugged in (an ExpressLRS radio and an
 * Xbox 360 pad), arrived on a room's link, and flew for 155 s with the
 * stick source "the joystick picker" on the flight screen: every channel
 * held at zero the whole time, whatever the radio did.
 *
 * Two pads at boot queue the joystick picker (seedPadRoster in
 * src/input/input.js), and the picker holds the sticks at zero while it
 * waits for a wiggle, which is right while its screen is up. A room's
 * link then asks "Join this room?" over it, and Join flies the pilot
 * through the room shell's fly (togetherShell in src/main.js), which takes
 * Fly's own path from any screen that is not the pause menu or flight.
 * The flight screen went up over the picker, and nothing ended the picker
 * itself: only leavePadPick did that, and only the picker's own buttons
 * call it. So the input layer kept answering for a picker nobody could see.
 *
 * This flies that path in headless Chromium: a board from the checkout
 * beside this one, a pilot in Node hosting a room, and the shell opened on
 * the room's link with the two pads of the ticket. It checks that the
 * picker is up first (the precondition, so a change that stops the picker
 * opening cannot pass this by accident), that Join reaches the room and
 * the air, and then that the picker is over and the radio's throttle
 * reaches the sticks. The same is then asked of the title's Fly, with the
 * picker stranded by hand, which is the general form of the rule: the
 * picker holds the sticks only while its screen is up.
 *
 * Not part of `npm run verify`: nothing here touches the flight model.
 *
 * Usage:
 *   npm run check:roompick
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

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { roomsUrl } from '../src/net/link.js';
import { RoomSession } from '../src/net/room.js';
import { roomUrl } from '../src/net/roomlinks.js';
import { rollAvatar } from '../src/net/avatar.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!cond) failures += 1;
  return Boolean(cond);
}

async function until(fn, ms = 10000, step = 50) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > end) return false;
    await wait(step);
  }
}

const boardDir = [process.env.NET_BOARD, join(root, '..', 'WebFPVSimulator-LeaderBoard'), join(root, '..', 'webfpvsimulator-leaderboard')]
  .filter(Boolean).find((p) => existsSync(join(p, 'src', 'rooms.js')));
if (!boardDir) {
  console.log('roompick-check: no checkout of the board\'s repository beside this one; set NET_BOARD to one');
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), 'webfpv-roompick-'));
const port = 4900 + Math.floor(Math.random() * 200);
const boardOrigin = `http://127.0.0.1:${port}`;
const board = spawn(process.execPath, [join(boardDir, 'src', 'server.js')], {
  cwd: boardDir,
  env: {
    ...process.env, PORT: String(port), BOARD_FILE: join(scratch, 'board.json'), DATABASE_URL: '', BOARD_ROOM_SECRET: randomBytes(24).toString('hex'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
board.stdout.resume();
board.stderr.resume();
const started = await until(async () => {
  try {
    return (await fetch(`${boardOrigin}/api/rooms/counts`)).ok;
  } catch (e) {
    return false;
  }
}, 8000, 25);
if (!started) {
  console.log('roompick-check: the board did not start');
  board.kill('SIGKILL');
  process.exit(1);
}

/*
 * The ticket's two pads. Pad 0 is the radio: eight axes in AETR order,
 * throttle parked low on axis 2, sixteen buttons, no standard mapping.
 * Pad 1 is the Xbox pad, a standard gamepad left on the desk. Both are
 * plain objects the check moves by hand, installed before the shell's
 * first line so the shell meets them the way it meets real ones.
 */
const PADS_SEED = `(() => {
  const btns = (n) => Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 }));
  window.__pads = [
    { index: 0, id: 'Unknown Gamepad (Vendor: e502 Product: bbab)', connected: true, mapping: '', timestamp: 1,
      axes: [0, 0, -1, 0, 0, 0, -1, 0], buttons: btns(16) },
    { index: 1, id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', connected: true, mapping: 'standard', timestamp: 1,
      axes: [0, 0, 0, 0], buttons: btns(17) },
  ];
  navigator.getGamepads = () => window.__pads;
})();`;

/* A pilot who has flown here before: a five inch on Bardwell's yard, a
 * name, an avatar, and the radio already chosen (the ticket's "Controller
 * calibrates and saved"). Two pads still queue the picker at boot. */
function seedFor(name) {
  return `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.airframeAsked = true;
  s.graphics = 'low';
  s.graphicsAuto = false;
  s.map = 'bardwell';
  s.airframe = '5inch';
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.pilot.name', ${JSON.stringify(name)});
  localStorage.setItem('webfpv.together.v1', JSON.stringify({ avatar: ${JSON.stringify(rollAvatar(() => 0.37))}, met: true, taught: true, watchTaught: true, watchRode: true }));
} catch (e) { /* Storage refused; the run boots on the defaults. */ }`;
}

/* Where the input layer is: the picker's state, the stick source, and the
 * throttle channel as flight reads it. */
const INPUT = `(() => {
  const i = window.__input;
  return {
    screen: window.__ui.screen,
    mode: window.__mode,
    picking: Boolean(i.padPick),
    calibrating: Boolean(i.calibration),
    source: i.source,
    banner: window.__ui.banner ? window.__ui.banner.textContent : '',
    throttle: i.channels.throttle,
  };
})()`;

/* The radio's throttle stick, moved to `v` on its own axis. */
const throttleTo = (v) => `(() => { const p = window.__pads[0]; p.axes[2] = ${v}; p.timestamp += 1; return 1; })()`;

async function radioReaches(page, label) {
  await page.evaluate(throttleTo(0.4));
  const moved = await until(async () => (await page.evaluate(INPUT)).throttle > 0.5, 3000);
  const after = await page.evaluate(INPUT);
  check(`${label}: the picker and the wizard are over`, !after.picking && !after.calibrating, `source "${after.source}"`);
  check(`${label}: the radio's throttle reaches the sticks`, moved, `throttle ${after.throttle.toFixed(3)}`);
  await page.evaluate(throttleTo(-1));
}

const hostBot = { heard: [] };
hostBot.s = new RoomSession({
  url: roomsUrl(boardOrigin),
  key: randomBytes(16).toString('hex'),
  handle: 'Kite Runner',
  avatar: rollAvatar(() => 0.61),
  onEvent: (name, data) => hostBot.heard.push({ name, data }),
});

try {
  console.log('roompick-check: a room link with two pads plugged in (bug-97aa6ae3)');
  hostBot.s.host({
    name: "Kite's room", way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50,
  });
  if (!(await until(() => hostBot.s.inRoom, 5000))) {
    throw new Error('the host could not open a room');
  }
  const link = new URL(roomUrl('http://127.0.0.1/index.html', hostBot.s.room, { invite: hostBot.s.invite }));
  link.searchParams.set('board', boardOrigin);
  const page = await openPage({
    root, width: 1280, height: 720, url: `${link.pathname}${link.search}${link.hash}`, seed: [PADS_SEED, seedFor('Pick Pilot')],
  });
  try {
    await page.until('window.__shellReady === true', 120000);
    await page.until('window.__map && window.__map().ready', 120000);
    const first = await page.evaluate(INPUT);
    check('two pads at boot put the joystick picker up', first.screen === 'padpick' && first.picking, `screen ${first.screen}`);
    await page.until("window.__together && window.__together() && window.__together().sheet === 'join'", 30000);
    const asked = await page.evaluate(INPUT);
    check('the room asks "Join this room?" with the picker still running', asked.picking, `screen ${asked.screen}`);
    await page.evaluate("(() => { const b = document.querySelector('#tg [data-k=\"join\"]'); if (!b) throw new Error('no join'); b.click(); return 1; })()");
    await page.until('window.__together && window.__together().inRoom', 15000);
    await page.until("window.__mode === 'flight' && window.__ui.screen === 'flight'", 30000);
    check('Join reaches the room and the air', true);
    await wait(300);
    await radioReaches(page, 'in the room');
  } finally {
    await page.close();
  }

  /*
   * The general form, off the room's path: the same two pads, no room, the
   * boot picker up, and Fly taken from under it the way the room's fly
   * takes it (flyToGrid in src/main.js is ui.act('fly')). The rule is that
   * the picker holds the sticks only while its screen is up, whichever
   * door the flight came in by.
   */
  const solo = await openPage({
    root, width: 1280, height: 720, url: `/index.html?board=${encodeURIComponent(boardOrigin)}`, seed: [PADS_SEED, seedFor('Solo Pilot')],
  });
  try {
    await solo.until('window.__shellReady === true', 120000);
    await solo.until('window.__map && window.__map().ready', 120000);
    const up = await solo.evaluate(INPUT);
    check('solo: two pads at boot put the joystick picker up', up.screen === 'padpick' && up.picking, `screen ${up.screen}`);
    await solo.evaluate("(() => { window.__ui.act('fly'); return 1; })()");
    await solo.until("window.__mode === 'flight' && window.__ui.screen === 'flight'", 30000);
    await wait(300);
    const said = await solo.evaluate(INPUT);
    check('solo: the banner says which joystick is flying', /Flying with Joystick 1/.test(said.banner), said.banner.replace(/\s+/g, ' ').slice(0, 80));
    await radioReaches(solo, 'solo, Fly from under the picker');

    /*
     * The wizard, by the door a room race's grid() takes: Settings'
     * Calibrate up, then Fly from under it. The mapping already in use is
     * the one that flies.
     */
    /* Any picker still up is ended by hand first, so this case says
     * something about the wizard alone. */
    await solo.evaluate("(() => { window.__input.cancelPadPick(); window.__input.padPickResult = null; window.__ui.act('title'); window.__ui.show('title'); return 1; })()");
    await solo.until("window.__ui.screen === 'title'", 10000);
    await solo.evaluate("(() => { window.__ui.act('calibrate'); return 1; })()");
    const wiz = await solo.evaluate(INPUT);
    check('solo: Calibrate puts the wizard up', wiz.screen === 'calibrate' && wiz.calibrating, `screen ${wiz.screen}, source "${wiz.source}"`);
    await solo.evaluate("(() => { window.__ui.act('fly'); return 1; })()");
    await solo.until("window.__mode === 'flight' && window.__ui.screen === 'flight'", 30000);
    await wait(300);
    await radioReaches(solo, 'solo, Fly from under the wizard');
  } finally {
    await solo.close();
  }
} catch (e) {
  failures += 1;
  console.log(`  FAIL  ${e.message}`);
} finally {
  try { hostBot.s.leave(); } catch (e) { /* Already gone. */ }
  board.kill('SIGKILL');
  rmSync(scratch, { recursive: true, force: true });
}

console.log(failures ? `roompick-check: ${failures} failed` : 'roompick-check: all passed');
process.exit(failures ? 1 : 0);
