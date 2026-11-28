/*
 * rooms-check.js: multiplayer rooms, end to end, asserted.
 *
 * scripts/together-shots.js walks every room screen and takes pictures of
 * it, and it is not an npm script, so no coverage run and no check run ever
 * went through it: on 2026-11-06 a coverage run found src/net/together.js
 * at a fifth and the spectator cameras and the room card never loaded at
 * all. This is the part of that walk that a regression must not get past,
 * as outcomes rather than pictures, and it is `npm run check:rooms`.
 *
 * It starts a board from the leaderboard checkout beside this one (or
 * NET_BOARD) on a free local port, with its own scratch store and room
 * secret, so it runs offline. Pilots in Node use src/net/room.js, the
 * client the shell runs, so the wire is the real one. Scenes:
 *
 *   pair     two browsers. One meets its avatar, hosts a private room from
 *            the picker (typed chat off by default) and its room card
 *            reaches the board; the other joins by the code. Each draws
 *            the other's craft where it is and sees it move, a quick line
 *            crosses both ways, the second watches the first (watch cam,
 *            following a move) and opens the overview (picks the pilot,
 *            keeps them in view). A Node pilot is banned and refused at the
 *            door; the second browser is kicked and told so again at the door.
 *   shelf    a listed room on the Rooms shelf, joined from its card under
 *            the name the page typed, and a name the word list stops shown
 *            as a made up one; then a school safe room hosted by the page:
 *            typed chat locked off, a typed line refused, no typing box in
 *            the talk scene, and the host's own name never sent to the
 *            room; then School safe off gives the typed name back, and
 *            listing the room warns of no new names and changes none
 *   bots     a dogfight room the page ends up hosting, a bot seated from
 *            the roster sheet and seen as a pilot by somebody who joins
 *   dfpop    a dogfight room joined with a round on: no POP! for a pilot
 *            who is only out of the round, in it or in the pit, a line
 *            that says why, and POP! still up and gone for a real pop
 *            (bug-85f93166)
 *   votepad  the host moves the room while the page flies on a pad, which
 *            the question tells "Pause, then Room, to follow": the pause
 *            menu comes up with nothing of the room's over it, its Room
 *            row says a vote is on and takes a real click, the question
 *            comes back in the air while unanswered, and Go on the room's
 *            page takes the page to the host's new map in the same room
 *            (bug-0bead284)
 *   deploy   the board replaced the way a deploy replaces it (SIGTERM,
 *            every socket closed with 1012) and started again with the
 *            same secret: the page is back in its room from the sealed
 *            ticket, then leaves and joins again by the code
 *   flow     hosting from the front page, as a pilot presses it. The first
 *            room asks its options once and Open room and fly is in the
 *            air with no invite page between, the code and Copy link on
 *            a banner. A run that ends in the room has Leave room and Quit
 *            to title, not Back to title; Esc from it keeps the room, and
 *            the menus then have the way back: the bar's button, the
 *            room's panel on the cover under the cursor (Enter flies it)
 *            and on the Multiplayer page, and the pilot's own room in
 *            Open rooms. Another map flown alone keeps the room, and
 *            the way back then flies the room's own map in the same page,
 *            the same seat and still the host. The second room is four
 *            presses, the map the last, opened as the first was; Room
 *            options changes that (the owner's recording of 2026-11-28)
 *
 * Every scene ends with no console error and no uncaught error on any page.
 * Failed network loads are not counted, because the board going away on
 * purpose is a failed load. Nothing here times anything: other browser
 * checks share the machine, so every wait polls for its outcome.
 *
 * Usage: node scripts/rooms-check.js [--only=pair,shelf,bots,dfpop,votepad,deploy,flow]
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
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import * as shellUi from '../src/ui/ui.js';
import { roomsUrl } from '../src/net/link.js';
import { RoomSession } from '../src/net/room.js';
import { rollAvatar } from '../src/net/avatar.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { SETTINGS_KEY } = shellUi;
/* Read through the namespace, so a shell without it fails its lines and
 * not the whole run. */
const roomRow = shellUi.roomRow || (() => ({ value: '', note: '', action: '' }));
const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const only = new Set(onlyArg.split(',').filter(Boolean));
const wanted = (name) => !only.size || only.has(name);
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
const t0 = Date.now();

let passes = 0;
let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'pass' : 'FAIL'}  ${name}${!cond && detail ? `  (${detail})` : ''}`);
  if (cond) passes += 1;
  else failures += 1;
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
const pass = (p) => p.then(() => true, () => false);

const boardDir = [process.env.NET_BOARD, join(root, '..', 'WebFPVSimulator-LeaderBoard'), join(root, '..', 'webfpvsimulator-leaderboard')]
  .filter(Boolean).find((p) => existsSync(join(p, 'src', 'rooms.js')));
if (!boardDir) {
  console.log('rooms-check: no checkout of the board\'s repository beside this one; set NET_BOARD to one');
  process.exit(1);
}

/* A free port, asked of the system rather than guessed, so two runs on one
 * machine do not take each other's board. */
const port = await new Promise((r) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); });
});
const boardOrigin = `http://127.0.0.1:${port}`;
const wsUrl = roomsUrl(boardOrigin);
const scratch = mkdtempSync(join(tmpdir(), 'webfpv-rooms-'));
const roomSecret = randomBytes(24).toString('hex');
let board = null;

/* A board of the scene's own: the board allows six rooms hosted from one
 * address in ten minutes, and every pilot here is 127.0.0.1. */
async function startBoard() {
  board = spawn(process.execPath, [join(boardDir, 'src', 'server.js')], {
    cwd: boardDir,
    env: {
      ...process.env, PORT: String(port), BOARD_FILE: join(scratch, 'board.json'), DATABASE_URL: '', BOARD_ROOM_SECRET: roomSecret,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  board.stdout.resume();
  board.stderr.resume();
  const up = await until(async () => {
    try {
      return (await fetch(`${boardOrigin}/api/rooms/counts`)).ok;
    } catch (e) {
      return false;
    }
  }, 20000, 50);
  if (!up) throw new Error('the board did not start');
}
async function stopBoard(signal = 'SIGKILL') {
  if (!board) return;
  const was = board;
  board = null;
  const gone = new Promise((r) => { if (was.exitCode !== null || was.signalCode) r(); else was.once('exit', r); });
  was.kill(signal);
  await gone;
}
async function freshBoard() {
  await stopBoard();
  await startBoard();
}

/* A pilot in Node, with a made up avatar and what it heard. */
function bot(handle, seed) {
  let n = seed;
  const rand = () => {
    n = (n * 16807) % 2147483647;
    return (n - 1) / 2147483646;
  };
  const b = { handle, heard: [] };
  b.s = new RoomSession({
    url: wsUrl,
    key: randomBytes(16).toString('hex'),
    handle,
    avatar: rollAvatar(rand),
    onEvent: (name, data) => b.heard.push({ name, data }),
  });
  return b;
}
async function hostRoom(b, room) {
  b.s.host(room);
  if (!(await until(() => b.s.inRoom, 8000))) throw new Error(`${b.handle} could not host ${room.name}`);
  return b.s.room;
}

/* The pilot's name and settings, through the doors a pilot uses. */
function seedFor({ name, met = true }) {
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
  localStorage.setItem('webfpv.together.v1', JSON.stringify({ ${met ? `avatar: ${JSON.stringify(rollAvatar(() => 0.37))}, met: true, ` : 'met: false, '}taught: true, watchTaught: true, watchRode: true }));
} catch (e) { /* Storage refused; the run boots on the defaults. */ }`;
}

const pages = [];
async function open(name, met = true, world = '&map=bardwell&craft=5inch') {
  const page = await openPage({
    root, width: 1280, height: 720, url: `/index.html?mp=1&board=${encodeURIComponent(boardOrigin)}${world}`, seed: [seedFor({ name, met })],
  });
  page.name = name;
  pages.push(page);
  await page.until('window.__shellReady === true', 180000);
  await page.until('window.__map && window.__map().ready', 180000);
  return page;
}
async function close(page) {
  const i = pages.indexOf(page);
  if (i >= 0) pages.splice(i, 1);
  await page.close().catch(() => {});
}

const T = 'window.__together && window.__together()';
const state = (page) => page.evaluate(T);
const sheetIs = (page, name, ms = 20000) => page.until(`${T} && window.__together().sheet === ${JSON.stringify(name)}`, ms);
const flying = (page, ms = 30000) => page.until("window.__mode === 'flight' && window.__ui.screen === 'flight'", ms);

/* True when a pilot can see `words` inside `scope`: text with a size, on
 * screen, nothing above it hidden. */
const SEES = (words, scope = '#tg') => `(() => {
  const want = ${JSON.stringify(words)};
  const box = document.querySelector(${JSON.stringify(scope)});
  if (!box) return false;
  const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.data.includes(want)) continue;
    let ok = true;
    for (let p = n.parentElement; p && ok; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden') ok = false;
      else if (cs.opacity === '0' && !p.getAnimations().some((a) => a.playState === 'running')) ok = false;
    }
    if (!ok) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) return true;
  }
  return false;
})()`;
/* What the room's "can't" card says, '' when none is shown. */
const says = (page) => page.evaluate("(() => { const s = document.querySelector('#tg .tg-modal .say'); return s ? s.textContent : ''; })()");

async function pressKey(page, data) {
  await page.evaluate(`(() => { const b = document.querySelector('#tg [data-k=${JSON.stringify(data)}]'); if (!b) throw new Error('no button ${data}'); b.click(); return 1; })()`);
  await wait(120);
}
/* A key with the focus nowhere, so the window hears it, not a sheet. */
async function tapLoose(page, code) {
  await page.evaluate('(() => { if (document.activeElement) document.activeElement.blur(); return 1; })()');
  await page.tap(code);
}
/* Held until its effect shows: on a software rasteriser a frame can take
 * longer than a quick press, and a press no frame saw was never made. */
async function holdUntil(page, code, done, ms = 5000) {
  await page.evaluate('(() => { if (document.activeElement) document.activeElement.blur(); return 1; })()');
  const info = { code, key: code.replace(/^Key|^Digit/, '').toLowerCase(), windowsVirtualKeyCode: /^(Key|Digit)/.test(code) ? code.slice(-1).charCodeAt(0) : 0 };
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info }, page.sessionId);
  const ok = await pass(page.until(done, ms));
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info }, page.sessionId);
  return ok;
}

async function joinByCode(page, code) {
  await page.evaluate("(() => { window.__ui.onRooms('freestyle'); return 1; })()");
  await sheetIs(page, 'lobby');
  await page.evaluate(`(() => { const i = document.querySelector('#tg-code'); i.value = ${JSON.stringify(code)}; i.dispatchEvent(new Event('input')); return 1; })()`);
  await pressKey(page, 'code-go');
}
async function roomPage(page) {
  await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-sheet'); return 1; })()");
  await sheetIs(page, 'room');
}
async function toFlight(page) {
  for (let i = 0; i < 4 && (await state(page)).sheet; i += 1) {
    await page.tap('Escape');
    await wait(150);
  }
  await page.evaluate("(() => { window.__ui.act('resume'); return 1; })()");
  await flying(page, 10000);
}
async function leaveRoom(page) {
  await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-leave'); return 1; })()");
  await sheetIs(page, 'confirm');
  await pressKey(page, 'yes');
  await page.until(`${T} && !window.__together().inRoom`, 8000);
}

/* Host a room from the map picker's Fly together, as a pilot does, with
 * `form` pressing whatever the host sheet should have pressed. */
async function hostFromPicker(page, form = async () => {}) {
  await page.evaluate("(() => { window.__ui.show('freestyle'); return 1; })()");
  await page.until("document.querySelector('.wp-rooms') !== null", 30000);
  await page.evaluate("(() => { window.__ui.picker.select('map:bardwell'); return 1; })()");
  await page.until("[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Fly together')", 10000);
  await page.evaluate("(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Fly together').click(); return 1; })()");
  const st = await page.until(`${T} && ['meet', 'host'].includes(window.__together().sheet)`, 20000).then(() => state(page));
  if (st.sheet === 'meet') return st;
  await form();
  return st;
}

/* The other pilots' craft as this page draws them: every instance of the
 * room's craft bodies, as world positions. */
const DRAWN = `(() => {
  const s = window.__mapScene ? window.__mapScene() : null;
  let m = null;
  if (s) s.traverse((o) => { if (o.name === 'room-craft-bodies') m = o; });
  if (!m || !m.parent || !m.parent.visible) return [];
  const out = [];
  const M = new m.matrix.constructor();
  for (let i = 0; i < m.count; i += 1) {
    m.getMatrixAt(i, M);
    out.push([M.elements[12], M.elements[13], M.elements[14]]);
  }
  return out;
})()`;
const craftOf = async (page) => (await page.evaluate('window.__watch()')).craft;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/* Whether `page` draws a craft within `r` metres of `at`. */
async function drawsNear(page, at, r = 0.6, ms = 15000) {
  return until(async () => (await page.evaluate(DRAWN)).some((p) => dist(p, at) < r), ms, 150);
}
/* Hold the page's craft at a spot, the integrator frozen, so where it is
 * does not depend on how fast this machine flies it. */
const holdAt = (page, p) => page.evaluate(`window.__holdCraft(${p[0]}, ${p[1]}, ${p[2]}, 0) ? 1 : 0`);
/*
 * Fly the held craft from `a` to `b` and slow to a stop there, as a pilot
 * parks. A craft that stops dead is drawn where it stopped too, since the
 * sender's uplink sends one copy of the resting pose (src/net/room.js), and
 * scripts/net-selftest.js asserts that; this check asserts the drawing of
 * a pilot who slows down.
 */
async function moveTo(page, a, b, steps = 24) {
  for (let k = 1; k <= steps; k += 1) {
    const u = 1 - (1 - k / steps) ** 3;
    await holdAt(page, a.map((v, i) => v + (b[i] - v) * u));
    await wait(40);
  }
  await holdAt(page, b);
}

/* Console errors and uncaught errors. A failed network load is left out,
 * because the scenes take the board away on purpose. */
function errorsOf(page) {
  return page.errors.filter((e) => !/^network: /.test(String(e)) && !/favicon/.test(String(e)));
}
function endChecks(page) {
  const errors = errorsOf(page);
  check(`${page.name}: no console error and no uncaught error`, errors.length === 0, errors.slice(0, 4).join(' | '));
}

/* ------------------------------------------------------------------ */

async function scenePair() {
  console.log('\npair: two browsers in a private room');
  const a = await open('Left Pilot', false);
  const b = await open('Right Pilot');
  const ban = bot('Prop Ben', 227);
  try {
    /* A meets its avatar on the way to the host sheet. */
    await hostFromPicker(a);
    check('the first time, Fly together introduces the pilot to their avatar', (await state(a)).sheet === 'meet');
    await pressKey(a, 'look');
    await sheetIs(a, 'editor');
    await pressKey(a, 'tab-Hair');
    await pressKey(a, 'hair-3');
    await pressKey(a, 'done');
    await sheetIs(a, 'meet');
    await pressKey(a, 'keep');
    check('then the host sheet', await pass(sheetIs(a, 'host')));
    const saved = await a.evaluate("(() => { try { return JSON.parse(localStorage.getItem('webfpv.together.v1')); } catch (e) { return null; } })()");
    check('the avatar edited is kept, hair 3', saved && saved.met === true && saved.avatar && saved.avatar.hair === 3, JSON.stringify(saved));
    const chat = await a.evaluate('document.querySelector(\'#tg [data-k="sw-typedChat"]\').getAttribute(\'aria-checked\')');
    check('a private room starts with typed chat off', chat === 'false', chat);
    await pressKey(a, 'open');
    check('Open room and fly makes the room', await pass(a.until(`${T} && window.__together().inRoom`, 20000)));
    const st = await state(a);
    check('the host is in a room with a code', st.inRoom && /^[A-Z2-9]{6}$/.test(st.code), JSON.stringify(st));
    const code = st.code;
    /* The room card: drawn by the host's page while the board opens the
     * room and sent before it takes off, and kept by the board for the
     * link's picture (src/net/roomcard.js, together.js cardEarly and
     * flyHosted). A machine too slow to have it ready inside the wait is
     * flown anyway, and the card goes at the host's first pause, never in
     * the air: this machine's software renderer is sometimes that machine,
     * so the check takes either and says which. */
    let listing = null;
    const hasCard = async () => {
      listing = await (await fetch(`${boardOrigin}/api/rooms/${code}`)).json();
      return listing.hasCard;
    };
    let carded = await until(hasCard, 8000, 250);
    if (!carded) {
      console.log('  note  the card was not ready before takeoff here: pausing, where it is owed');
      await flying(a);
      await a.tap('Escape');
      await a.until("window.__ui.screen === 'paused'", 10000);
      carded = await until(hasCard, 20000, 250);
      await a.evaluate("(() => { window.__ui.act('resume'); return 1; })()");
    }
    check('the room card reaches the board', carded, JSON.stringify(listing));
    if (carded) {
      const res = await fetch(`${boardOrigin}/api/rooms/${code}/card?v=${encodeURIComponent(listing.cardUtc)}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      check('and it is a JPEG the board serves', res.ok && res.headers.get('content-type') === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8,
        `${res.status} ${res.headers.get('content-type')} ${bytes.length}`);
    }
    check('and the host is flying, with no invite page between', await pass(flying(a)) && (await state(a)).sheet === '', JSON.stringify(await state(a)));

    await joinByCode(b, code);
    check('the second browser joins by the code', await pass(b.until(`${T} && window.__together().inRoom && window.__together().code === ${JSON.stringify(code)}`, 20000)));
    await flying(b);
    check('both see two pilots', await pass(a.until(`${T} && window.__together().pilots === 2`, 10000))
      && await pass(b.until(`${T} && window.__together().pilots === 2`, 10000)));
    const aId = (await state(a)).you;
    const bId = (await state(b)).you;
    check('and agree on who is host', (await state(b)).host === aId && (await state(a)).host === aId, JSON.stringify([aId, bId]));

    /* Each draws the other where the other is, and follows a move. */
    const aHome = await craftOf(a);
    const bHome = await craftOf(b);
    const p1 = [aHome[0], aHome[1] + 1.2, aHome[2]];
    const p2 = [aHome[0] + 1.5, aHome[1] + 1.2, aHome[2] + 1];
    await moveTo(a, aHome, p1);
    check('the second browser draws the host\'s craft where it is', await drawsNear(b, p1), JSON.stringify(await b.evaluate(DRAWN)));
    await moveTo(a, p1, p2);
    check('and sees it move', await drawsNear(b, p2), JSON.stringify({ want: p2, drawn: await b.evaluate(DRAWN) }));
    const q1 = [bHome[0] - 1, bHome[1] + 1.4, bHome[2]];
    await moveTo(b, bHome, q1);
    check('the host draws the second browser\'s craft, and its move', await drawsNear(a, q1), JSON.stringify({ want: q1, drawn: await a.evaluate(DRAWN) }));

    /* Preset chat, both ways. */
    check('1 on the host says Hi! to the room, shown on the other page',
      await holdUntil(a, 'Digit1', SEES('Hi!', '#tg .talk'), 300) || await pass(b.until(SEES('Hi!', '#tg .talk'), 8000)));
    check('and the other page shows it', await pass(b.until(SEES('Hi!', '#tg .talk'), 8000)));
    await holdUntil(b, 'Digit2', SEES('GG!', '#tg .talk'), 300);
    check('2 on the other page says GG! to the host', await pass(a.until(SEES('GG!', '#tg .talk'), 8000)));

    /* The watch cam, on the second browser, riding behind the host. */
    const watchOn = await holdUntil(b, 'KeyV', `${T} && window.__together().watching === ${aId}`);
    check('V on the second browser watches the host', watchOn, JSON.stringify((await state(b)).watching));
    const rode = await pass(b.until("window.__watch().phase === 'riding'", 15000));
    const ride = await b.evaluate('window.__watch()');
    const behind = (w, p) => {
      const d = [p[0] - w.cam[0], p[1] - w.cam[1], p[2] - w.cam[2]];
      const len = Math.hypot(...d) || 1;
      return { len, along: (d[0] * w.look[0] + d[1] * w.look[1] + d[2] * w.look[2]) / len };
    };
    const b1 = ride.target ? behind(ride, ride.target) : { len: Infinity, along: 0 };
    check('the watch cam flies out and rides near the host\'s craft, looking at it', rode && ride.classOn && b1.len < 4 && b1.along > 0.7
      && dist(ride.target, p2) < 0.6, JSON.stringify({ ride, b1 }));
    const p3 = [p2[0] - 2, p2[1] + 0.5, p2[2] - 1.5];
    await moveTo(a, p2, p3);
    const followed = await until(async () => {
      const w = await b.evaluate('window.__watch()');
      if (!w.target) return false;
      const k = behind(w, w.target);
      return w.target && dist(w.target, p3) < 0.6 && k.len < 4 && k.along > 0.7;
    }, 15000, 200);
    check('and follows when the host moves', followed, JSON.stringify(await b.evaluate('window.__watch()')));
    const home = await holdUntil(b, 'KeyV', `${T} && window.__together().watching === 0`);
    check('V again flies home and the flight carries on', home && await pass(flying(b, 15000)) && !(await b.evaluate('window.__watch()')).classOn);

    /* The overview: up over the field, the host picked and kept in view. */
    const ovOn = await holdUntil(b, 'KeyO', `${T} && window.__together().overviewing === true`);
    check('O opens the overview', ovOn);
    const up = await pass(b.until("window.__watch().phase === 'riding' && window.__watch().overview.on", 15000));
    const ov = await b.evaluate('window.__watch()');
    check('the camera rises over the field', up && ov.cam[1] > ov.craft[1] + 3, JSON.stringify({ cam: ov.cam, craft: ov.craft }));
    check('its board names the host', await pass(b.until(SEES('Left Pilot', '#tg .ovboard'), 8000)));
    await pressKey(b, `ov-row-${aId}`);
    check('a row picks the host', (await b.evaluate('window.__watch()')).overview.pick === aId);
    await holdUntil(b, 'KeyK', 'window.__watch().overview.keep === true');
    const kept0 = (await b.evaluate('window.__watch()')).cam;
    const p4 = [p3[0] + 3, p3[1], p3[2] + 3];
    await moveTo(a, p3, p4);
    const keptMoved = await until(async () => dist((await b.evaluate('window.__watch()')).cam, kept0) > 0.5, 15000, 200);
    check('K keeps the host in view: the camera moves when they do', keptMoved, JSON.stringify(await b.evaluate('window.__watch().overview')));
    const ovHome = await holdUntil(b, 'Escape', `${T} && window.__together().overviewing === false`);
    check('Esc flies home from the overview', ovHome && await pass(flying(b, 15000)) && !(await b.evaluate('window.__watch()')).overview.on);

    /* A kick, of the second browser, from the host's room page. It comes
     * before the ban because a ban holds the address too, and every pilot
     * here is 127.0.0.1. */
    await roomPage(a);
    await pressKey(a, `pilot-${bId}`);
    await pressKey(a, `kick-${bId}`);
    await sheetIs(a, 'confirm');
    await pressKey(a, 'yes');
    check('Kick takes the second browser out', await pass(b.until(`${T} && !window.__together().inRoom`, 10000)));
    check('the host\'s page counts one pilot', await pass(a.until(`${T} && window.__together().pilots === 1`, 10000)));
    await pass(sheetIs(b, 'cant', 10000));
    const kicked = await says(b);
    check('the kicked page is told who and for how long', kicked.includes('took you out') && kicked.includes('five minutes'), kicked);
    await b.tap('Escape');
    await b.until(`${T} && window.__together().sheet === ''`, 5000).catch(() => {});
    await joinByCode(b, code);
    await pass(sheetIs(b, 'cant', 10000));
    const again = await says(b);
    check('and at the door again within five minutes it is said again, and not let in', again.includes('five minutes') && !(await state(b)).inRoom, again);
    /* A ban, of a pilot in Node, from the host's room page. */
    ban.s.join(code, {});
    check('a third pilot joins', await until(() => ban.s.inRoom, 8000) && await pass(a.until(`${T} && window.__together().pilots === 2`, 10000)));
    const banId = ban.s.you;
    await roomPage(a);
    await pressKey(a, `pilot-${banId}`);
    await pressKey(a, `ban-${banId}`);
    await sheetIs(a, 'confirm');
    await pressKey(a, 'yes');
    check('Ban takes the pilot out', await until(() => !ban.s.inRoom, 8000));
    ban.heard.length = 0;
    ban.s.join(code, {});
    await until(() => ban.heard.some((x) => x.name === 'refused' || x.name === 'closed'), 8000);
    const no = ban.heard.find((x) => x.name === 'refused' || x.name === 'closed');
    check('and the banned browser is refused at the door, as banned', no && !ban.s.inRoom && (no.data.code === 4006 || no.data.why === 'banned' || no.data.reason === 'banned'),
      JSON.stringify(no));

    await toFlight(a);
    endChecks(a);
    endChecks(b);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.stack || e.message}`);
  } finally {
    ban.s.leave();
    await close(a);
    await close(b);
  }
}

async function sceneShelf() {
  console.log('\nshelf: a listed room on the Rooms shelf, and a school safe room');
  const lister = bot('Mint Ranger', 41);
  const pupil = bot('Rotor Ann', 223);
  await hostRoom(lister, {
    name: 'Pines at dusk', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50, listed: true, tags: ['chill'],
  });
  const page = await open('School Host');
  try {
    await page.evaluate("(() => { window.__ui.onRooms('freestyle'); return 1; })()");
    await sheetIs(page, 'lobby');
    const listed = await pass(page.until("[...document.querySelectorAll('#tg .room h4')].some((h) => h.textContent === 'Pines at dusk')", 15000));
    check('a listed room shows on the Rooms shelf', listed);
    await pressKey(page, `room-${lister.s.room.code}`);
    check('and its card joins it', await pass(page.until(`${T} && window.__together().inRoom && window.__together().code === ${JSON.stringify(lister.s.room.code)}`, 20000)));
    await flying(page);
    /* Own names in every room but a school safe one, the owner's word of
     * 2026-11-08 ("in all multi player, if i don't select school mode, i
     * should be able to make my own name. Lets put a black list of words
     * to keep it clean"). This line expected a made up name in a listed
     * room, the rule before that, and failed on main from then on. */
    const shown = [...lister.s.link.pilots.values()].map((p) => p.handle);
    check('a listed room shows the page under the name it typed', shown.length === 2 && shown.includes('School Host'), shown.join(', '));
    /* The word list's half of the same rule: a name it stops flies under
     * a made up one, in a listed room as anywhere. */
    const snap = bot('Snapchat Sam', 229);
    snap.s.join(lister.s.room.code, {});
    check('a pilot whose typed name the word list stops joins the listed room', await until(() => snap.s.inRoom, 8000));
    const withSnap = await until(() => lister.s.link.pilots.size === 3, 8000);
    const snapShown = [...lister.s.link.pilots.values()].map((p) => p.handle);
    check('and is shown under a made up name, never the one typed', withSnap && !snapShown.some((n) => /snapchat/i.test(n)), snapShown.join(', '));
    snap.s.leave();
    await leaveRoom(page);
    await toFlight(page);

    await hostFromPicker(page, async () => {
      await pressKey(page, 'sw-schoolSafe');
    });
    const form = await page.evaluate(`(() => ({
      safe: document.querySelector('#tg [data-k="sw-schoolSafe"]').getAttribute('aria-checked'),
      chat: document.querySelector('#tg [data-k="sw-typedChat"]').getAttribute('aria-checked'),
      chatLocked: document.querySelector('#tg [data-k="sw-typedChat"]').getAttribute('aria-disabled'),
    }))()`);
    check('School safe on locks typed chat off', form.safe === 'true' && form.chat === 'false' && form.chatLocked === 'true', JSON.stringify(form));
    await pressKey(page, 'open');
    await page.until(`${T} && window.__together().inRoom`, 20000);
    const code = (await state(page)).code;
    await flying(page);
    pupil.s.join(code, {});
    check('a pilot joins the school safe room', await until(() => pupil.s.inRoom, 8000));
    check('which the board holds as school safe, typed chat off', pupil.s.room.schoolSafe === true && !pupil.s.room.typedChat, JSON.stringify(pupil.s.room));
    const names = [...pupil.s.link.pilots.values()].map((p) => p.handle);
    check('the host\'s own name never reaches the room', !names.includes('School Host'), names.join(', '));
    pupil.s.chat('hello from a keyboard', 'calm');
    check('a typed line is refused', await until(() => pupil.heard.some((x) => x.name === 'chatRefused'), 5000), JSON.stringify(pupil.heard.slice(-3).map((x) => x.name)));
    await wait(800);
    check('and never shown on the host\'s page', !(await page.evaluate(SEES('hello from a keyboard'))));
    pupil.s.say('nice');
    check('a preset line is shown', await pass(page.until(SEES('Nice line!', '#tg .talk'), 8000)));
    await roomPage(page);
    await pressKey(page, 'talk');
    await sheetIs(page, 'scene');
    check('the talk scene offers the preset lines and no box to type in',
      await page.evaluate("Boolean(document.querySelector('#tg [data-k=\"q-0\"]')) && !document.querySelector('#tg-say')"));
    await toFlight(page);

    /* School safe off, from Room settings: the sheet says everybody gets
     * their own name back, and they do. The board kept the made up names
     * School safe had forced, for good. */
    const note = () => page.evaluate("(() => { const n = document.querySelector('#tg .footer-row .note'); return n ? n.textContent : ''; })()");
    await roomPage(page);
    await pressKey(page, 'settings');
    await sheetIs(page, 'roomSettings');
    await pressKey(page, 'sw-schoolSafe');
    const offNote = await note();
    check('turning School safe off says everybody gets their own name back', /own name back/.test(offNote), offNote);
    await pressKey(page, 'save');
    check('and saved, the room is no longer school safe', await until(() => pupil.s.room && pupil.s.room.schoolSafe === false, 8000), JSON.stringify(pupil.s.room));
    const ownAgain = await until(() => [...pupil.s.link.pilots.values()].some((p) => p.handle === 'School Host'), 8000);
    check('and the other pilot sees the host under the name it typed', ownAgain, [...pupil.s.link.pilots.values()].map((p) => p.handle).join(', '));
    await toFlight(page);

    /* Listing the room keeps the names: the sheet said listing gave
     * everybody a made up name, the rule before 2026-11-08. */
    await roomPage(page);
    await pressKey(page, 'settings');
    await sheetIs(page, 'roomSettings');
    await pressKey(page, 'sw-listed');
    const listNote = await note();
    check('turning Listed on warns of no new names, because there are none', !/made up name/.test(listNote), listNote);
    await pressKey(page, 'save');
    check('and saved, the room is listed', await until(() => pupil.s.room && pupil.s.room.listed === true, 8000), JSON.stringify(pupil.s.room));
    await wait(500);
    check('and the host keeps the name it typed', [...pupil.s.link.pilots.values()].some((p) => p.handle === 'School Host'),
      [...pupil.s.link.pilots.values()].map((p) => p.handle).join(', '));
    await toFlight(page);
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.stack || e.message}`);
  } finally {
    lister.s.leave();
    pupil.s.leave();
    await close(page);
  }
}

async function sceneBots() {
  console.log('\nbots: a dogfight room with a bot in a seat');
  const kite = bot('Kite Runner', 351);
  const moss = bot('Moss Comet', 353);
  const room = await hostRoom(kite, {
    name: 'Dogfight', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50, game: 'dogfight',
  });
  const page = await open('Dogfight Pilot');
  const G = 'window.__dogfight && window.__dogfight()';
  try {
    check('the board opens a dogfight room', room.game === 'dogfight', String(room.game));
    await joinByCode(page, room.code);
    await page.until(`${T} && window.__together().inRoom`, 20000);
    await flying(page);
    check('the page plays the room\'s dogfight', await pass(page.until(`${G} && window.__dogfight().room === true`, 20000)));
    kite.s.leave();
    check('the page is host once the host goes', await pass(page.until(`${T} && window.__together().host === window.__together().you`, 15000)));
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-roster'); return 1; })()");
    check('Fill the roster opens the roster sheet', await pass(page.until("Boolean(document.querySelector('#tg .botroster'))", 8000)));
    await page.evaluate("(() => { document.querySelector('#tg .botroster [data-k=\"add-0\"]').click(); return 1; })()");
    const seated = await pass(page.until(`${G} && (() => { const g = window.__dogfight(); for (let i = 1; i < g.cap; i += 1) if (g.isBot[i] && !g.puppet[i]) return true; return false; })()`, 10000));
    check('Add a bot seats a bot the page flies', seated);
    const rb = await page.evaluate('(() => { const b = window.__roomBots(); return b ? Object.keys(b) : null; })()');
    check('the room\'s bot seats are there to read', Array.isArray(rb), JSON.stringify(rb));
    await toFlight(page);
    moss.s.join(room.code, {});
    check('a pilot joins', await until(() => moss.s.inRoom, 8000));
    const sees = await until(() => {
      let k = 0;
      moss.s.eachRemote((id, pose, p) => { if (p.bot) k += 1; });
      return k >= 1;
    }, 15000, 100);
    check('and sees the bot fly, as a pilot', sees);
    /* The host starts a round with the bot in it. */
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-df-start'); return 1; })()");
    const started = await until(() => {
      const r = moss.heard.filter((h) => h.name === 'dogfight').pop();
      return r && r.data.dogfight && r.data.dogfight.phase === 'count' && r.data.dogfight.rows.length === 3;
    }, 10000, 100);
    check('the host\'s start counts the bot into the round, as the room hears it', started,
      JSON.stringify((moss.heard.filter((h) => h.name === 'dogfight').pop() || {}).data));
    check('and the round goes live on the page', await pass(page.until(`${G} && window.__dogfight().state.phase === 'live'`, 20000)));
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.stack || e.message}`);
  } finally {
    kite.s.leave();
    moss.s.leave();
    await close(page);
  }
}

/*
 * POP IS A POP, AND NOTHING ELSE. bug-85f93166, "Pop always stays there
 * when playing dogfights" (a Chromebook in room JREZ7Q, on the town): the
 * HUD put up POP! and BACK IN 1 for any pilot whose slot was not alive,
 * and in a room a pilot is not alive while not in the round at all,
 * before the host starts one, after joining one already on (the board's
 * "watching until the next round", its roundsJoin), or after sitting in
 * the menus through GO. So the overlay sat over the picture until the next
 * round, which for a pilot alone in a room is never. Here: a page joins a
 * round two Node pilots are already in, sits through the pit and is in the
 * next round, and is then popped for real by a Node pilot's two missiles,
 * which must still show POP and still clear when the board says back.
 */
const POP_SHOWN = `(() => {
  const h = window.__dogfightHud && window.__dogfightHud();
  return Boolean(h && h.visible && h.pop && h.pop.getClientRects().length > 0);
})()`;
const BANNER = `(() => {
  const h = window.__dogfightHud && window.__dogfightHud();
  return h && h.banner && h.banner.getClientRects().length > 0 ? h.banner.textContent : '';
})()`;
async function sceneDfPop() {
  console.log('\ndfpop: a dogfight room, POP only for a pilot who was popped');
  const kite = bot('Kite Runner', 451);
  const moss = bot('Moss Comet', 453);
  const room = await hostRoom(kite, {
    name: 'Dogfight', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50, game: 'dogfight',
  });
  const page = await open('Late Pilot');
  const G = 'window.__dogfight && window.__dogfight()';
  const dfState = (b) => {
    const r = b.heard.filter((h) => h.name === 'dogfight').pop();
    return r && r.data && r.data.dogfight ? r.data.dogfight : null;
  };
  try {
    moss.s.join(room.code, {});
    check('a second pilot joins the host', await until(() => moss.s.inRoom, 8000));
    kite.s.link.raceSend({ t: 'dfStart' });
    check('the host starts a round with the two of them in it', await until(() => {
      const d = dfState(moss);
      return d && (d.phase === 'count' || d.phase === 'live') && d.rows.length === 2;
    }, 10000, 100), JSON.stringify(dfState(moss)));

    /* The page comes in with the round on: it watches this one. */
    await joinByCode(page, room.code);
    await page.until(`${T} && window.__together().inRoom`, 20000);
    await flying(page);
    await page.until(`${G} && window.__dogfight().room === true && ['count', 'live'].includes(window.__dogfight().state.phase)`, 20000);
    await page.until(`${G} && window.__dogfight().state.phase === 'live'`, 20000);
    await wait(500);
    const outOf = await page.evaluate(`${G} && window.__dogfight().inFight[0] === 0`);
    check('a pilot who came in after GO is not in this round (the board\'s rule)', outOf);
    check('and is not shown POP!, because nobody popped them', !(await page.evaluate(POP_SHOWN)),
      JSON.stringify(await page.evaluate(`(() => { const g = window.__dogfight(); return { alive: g.alive[0], inFight: g.inFight[0], over: g.over }; })()`)));
    const late = await page.evaluate(BANNER);
    check('the HUD says the round started without them and they fly the next one', /next one/i.test(late), late);

    /* Back to the pit: still nobody popped, and the page says it waits. */
    kite.s.link.raceSend({ t: 'dfPit' });
    await page.until(`${G} && window.__dogfight().state.phase === 'pit'`, 10000);
    await wait(300);
    check('in the pit, before the host starts a round, there is no POP! either', !(await page.evaluate(POP_SHOWN)));
    const pit = await page.evaluate(BANNER);
    check('and the HUD says the host starts the round', /host/i.test(pit) && /start/i.test(pit), pit);

    /* The next round has the page in it. */
    kite.s.link.raceSend({ t: 'dfStart' });
    check('the host\'s next round has the page in it', await pass(page.until(`${G} && window.__dogfight().inFight[0] === 1 && window.__dogfight().alive[0] === 1`, 15000)));
    check('in a round and whole, no POP!', !(await page.evaluate(POP_SHOWN)));
    check('and no wait line', (await page.evaluate(BANNER)).indexOf('next one') < 0);

    /* Popped for real: two of Moss's missiles, past the page's shield. */
    await page.until(`${G} && window.__dogfight().state.phase === 'live'`, 15000);
    const d = dfState(moss);
    const you = (await state(page)).you;
    const shieldOver = d.goAt + 2000;
    await until(() => Date.now() > shieldOver + 300, 10000, 100);
    const hit = () => moss.s.link.raceSend({ t: 'dfHit', n: d.n, to: you, w: 'missile', d: 55 });
    hit();
    await wait(150);
    hit();
    check('two missiles pop the page, and the page shows POP!', await pass(page.until(POP_SHOWN, 8000)),
      JSON.stringify(await page.evaluate(`(() => { const g = window.__dogfight(); return { alive: g.alive[0], inFight: g.inFight[0], hp: g.hp[0] }; })()`)));
    const back = await page.evaluate("(() => { const h = window.__dogfightHud(); return h.popBack.textContent; })()");
    check('with the count back', /BACK IN/.test(back), back);
    check('and POP! goes when the board\'s wait is up', await pass(page.until(`!${POP_SHOWN} && window.__dogfight().alive[0] === 1`, 10000)));
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.stack || e.message}`);
  } finally {
    kite.s.leave();
    moss.s.leave();
    await close(page);
  }
}

async function sceneDeploy() {
  console.log('\ndeploy: the board replaced under a room, and back in from the ticket');
  const keeper = bot('Night Owl', 151);
  const room = await hostRoom(keeper, {
    name: 'Late session', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50,
  });
  const page = await open('Deploy Pilot');
  try {
    await joinByCode(page, room.code);
    await page.until(`${T} && window.__together().inRoom`, 20000);
    await flying(page);
    await page.until(`${T} && window.__together().pilots === 2`, 10000);
    keeper.heard.length = 0;
    await stopBoard('SIGTERM');
    const told = await until(() => keeper.heard.some((x) => x.name === 'retrying'), 8000);
    const codes = keeper.heard.filter((x) => x.name === 'retrying').map((x) => x.data.code);
    check('a deploy closes the room\'s sockets with 1012', told && codes[0] === 1012, codes.join());
    check('the page knows the board is gone and tries again', await pass(page.until(`${T} && ['retrying', 'connecting'].includes(window.__together().link)`, 10000)),
      JSON.stringify(await state(page)));
    await startBoard();
    const back = await pass(page.until(`${T} && window.__together().inRoom && window.__together().link === 'in'`, 30000));
    const st = await state(page);
    check('the new board takes the page back in from its sealed ticket, same room', back && st.code === room.code, JSON.stringify(st));
    check('and says so', await pass(page.until(SEES('Back in'), 8000)));
    check('the other pilot is back beside it', await pass(page.until(`${T} && window.__together().pilots === 2`, 20000)), JSON.stringify(await state(page)));
    keeper.s.say('gg');
    check('and the room talks again', await pass(page.until(SEES('GG!', '#tg .talk'), 8000)));
    await leaveRoom(page);
    await toFlight(page);
    check('the page leaves', !(await state(page)).inRoom);
    await joinByCode(page, room.code);
    check('and joins again by the code', await pass(page.until(`${T} && window.__together().inRoom && window.__together().code === ${JSON.stringify(room.code)}`, 20000)));
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.stack || e.message}`);
  } finally {
    keeper.s.leave();
    await close(page);
  }
}

/*
 * bug-0bead284, 2026-11-15, a guest on a pad: "Map change multiplayer is
 * not working for guests. The info is overlapping with the pause menu. not
 * able to switch with the host". A pad has no keys for Follow, so the
 * question across the middle says "Pause, then Room, to follow", and on
 * the base the pause it sent the pilot to opened under it: the panel
 * covered the menu from the Room row down and a click on Room landed on
 * the panel. Here the page flies on a pad the page can read, a host in
 * Node moves the room, and the page goes the way it is told.
 */
const PAD_ON = `(() => {
  window.__pad = {
    index: 0, id: 'Check pad (Vendor: 045e Product: 028e)', connected: true, mapping: 'standard', timestamp: 1,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  navigator.getGamepads = () => [window.__pad, null, null, null];
  return 1;
})()`;
/* The shell's own menu rows the room's layer covers at their middles:
 * what a click there would land on instead of the row. */
const COVERED = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('.row')) {
    if (el.closest('#tg')) continue;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height || b.bottom < 0 || b.top > innerHeight) continue;
    const at = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    if (at && at.closest('#tg')) out.push((el.querySelector('.row-label') || el).textContent.trim());
  }
  return out;
})()`;
const roomRowOf = (page) => page.evaluate("(() => { const r = window.__ui.items().find((it) => it.label === 'Room'); return r ? { value: r.value, note: r.note } : null; })()");
/* A real click in the middle of the pause menu's Room row, so whatever is
 * on top of it there is what gets it. */
async function clickRoomRow(page) {
  const at = await page.evaluate(`(() => {
    const row = [...document.querySelectorAll('.row')].find((el) => !el.closest('#tg') && /^Room/.test(el.textContent.trim()));
    if (!row) return null;
    const b = row.getBoundingClientRect();
    return [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
  })()`);
  if (!at) return false;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.cdp.send('Input.dispatchMouseEvent', { type, x: at[0], y: at[1], button: 'left', clickCount: 1 }, page.sessionId);
  }
  return true;
}
const splashUp = "(() => { const v = document.querySelector('#tg .tg-vote:not(.tg-swap)'); return Boolean(v && !v.hidden && v.querySelector('.vsheet')); })()";

async function sceneVotePad() {
  console.log('\nvotepad: a pad flying guest follows the host to a new map (bug-0bead284)');
  /* The row's words, as the shell is given them. */
  const base = { code: 'ABC234', n: 3, race: false };
  check('the Room row with no vote is the room\'s code and pilots', roomRow(base).value === 'ABC234 · 3 pilots');
  const asked = roomRow({ ...base, vote: { mapName: 'The town', host: false, by: 'Kite Runner', answer: null } });
  check('with a vote on it names the map and how to answer', asked.value === 'Vote: The town' && asked.note.includes('Kite Runner') && asked.action === 'room-sheet', JSON.stringify(asked));
  check('and says what the pilot answered', roomRow({ ...base, vote: { mapName: 'The town', host: false, by: 'K', answer: true } }).note.startsWith('You are going to The town')
    && roomRow({ ...base, vote: { mapName: 'The town', host: false, by: 'K', answer: false } }).note.startsWith('You are staying here'));

  const kite = bot('Kite Runner', 311);
  const room = await hostRoom(kite, {
    name: 'Movers', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50,
  });
  const page = await open('Pad Guest');
  try {
    await joinByCode(page, room.code);
    await page.until(`${T} && window.__together().inRoom`, 20000);
    await flying(page);
    await page.until(`${T} && window.__together().pilots === 2`, 10000);
    await page.evaluate(PAD_ON);
    const youId = (await state(page)).you;

    kite.s.link.mapVote('city', 'The town', 50);
    const told = await pass(page.until(SEES('Pause, then Room, to follow', '#tg .tg-vote'), 10000));
    check('a pilot on a pad is asked across the middle and told to pause, then Room', told,
      await page.evaluate("(document.querySelector('#tg .tg-vote') || {}).textContent || ''"));

    /* Paused, as it says. */
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 10000);
    check('the question steps aside for the pause menu', await pass(page.until(`!${splashUp}`, 3000)));
    const covered = await page.evaluate(COVERED);
    check('nothing of the room\'s covers a row of the pause menu', covered.length === 0, covered.join(', '));
    const row = await roomRowOf(page);
    check('the Room row says a vote is on, the map and the host', row && row.value === 'Vote: The town' && row.note.includes('Kite Runner'), JSON.stringify(row));

    /* In the air again with no answer: the question is back. */
    await page.evaluate("(() => { window.__ui.act('resume'); return 1; })()");
    await flying(page, 10000);
    check('back in the air unanswered, the question comes back', await pass(page.until(splashUp, 5000)));

    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 10000);
    check('a click on the Room row reaches the row', await clickRoomRow(page) && await pass(sheetIs(page, 'room', 5000)), JSON.stringify(await state(page)));
    check('the room\'s page has Go to the new map', await page.evaluate(SEES('Go to The town', '#tg .tg-menu')));
    await pressKey(page, 'vote-go');
    check('Go is heard by the room', await until(() => kite.s.link.vote && kite.s.link.vote.go.includes(youId), 5000), JSON.stringify(kite.s.link.vote));
    /* Everybody has answered, so the board ends the vote and moves both. */
    check('the host and the page are sent on', await until(() => Boolean(kite.s.link.moved), 8000));
    check('the page loads the host\'s new map', await pass(page.until(`window.__map && window.__map().ready && location.search.includes('map=city') && ${T} && window.__together().map === 'city'`, 120000)),
      JSON.stringify(await state(page).catch(() => null)));
    check('and is back in the same room', await pass(page.until(`${T} && window.__together().inRoom && window.__together().code === ${JSON.stringify(room.code)}`, 60000)),
      JSON.stringify(await state(page).catch(() => null)));
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.stack || e.message}`);
  } finally {
    kite.s.leave();
    await close(page);
  }
}

/* ------------------------------------------------------------------ */

/* The front page's panels and the map page, pressed as a pilot presses
 * them: Multiplayer, Freestyle, Host a room, and a double click on a map. */
const GATE_PAGE = "window.__ui.screen === 'title' && window.__ui.onGate() && window.__ui.gatePageNow()";
const CARD_NAMES = "[...document.querySelectorAll('.screen-title .gate-card')].filter((c) => c.offsetParent !== null).map((c) => c.querySelector('.gate-card-name').textContent)";
const ROWS = "window.__ui.items().filter((i) => !i.section).map((i) => `${i.label}<${i.action || ''}>`)";
const DOOR = "(() => { const b = document.querySelector('.frame-room'); return Boolean(b) && !b.hidden && b.offsetParent !== null && /Back to your room/i.test(b.textContent); })()";
async function toHostPage(page) {
  await page.evaluate("(() => { window.__ui.act('gate-together'); return 1; })()");
  await page.until(`${GATE_PAGE} === 'mpway'`, 8000);
  await page.evaluate("(() => { window.__ui.act('mpway:freestyle'); return 1; })()");
  await page.until(`${GATE_PAGE} === 'together'`, 8000);
  await page.evaluate("(() => { window.__ui.act('mp-host'); return 1; })()");
  await page.until("window.__ui.screen === 'freestyle' && document.querySelector('.room-picker.is-hosting') && document.querySelector('.wp-card')", 30000);
}
async function doubleClickMap(page, name) {
  return page.evaluate(`(() => {
    const c = [...document.querySelectorAll('.wp-card')].find((b) => (b.getAttribute('aria-label') || '').includes(${JSON.stringify(name)}));
    if (!c) return 'no card for ' + ${JSON.stringify(name)};
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    return 'ok';
  })()`);
}
/* The two minute horn, staged, which is how a run ends in a freestyle
 * room (main.js __scoreFinish). */
async function endRun(page) {
  await page.evaluate('(() => { window.__scoreFinish(); return 1; })()');
  await page.until("window.__ui.screen === 'results'", 10000);
}

async function sceneFlow() {
  console.log('\nflow: host in four presses, and the way back to the room from the menus');
  const page = await open('Flow Pilot', true, '');
  const band = () => page.evaluate("(() => { const b = document.querySelector('.host-band'); return b && !b.hidden ? b.textContent : ''; })()");
  const optionsUp = () => page.evaluate("(() => { const b = document.querySelector('.host-band-options'); return Boolean(b) && !b.hidden && b.offsetParent !== null; })()");
  const kept = () => page.evaluate("(() => { try { return JSON.parse(localStorage.getItem('webfpv.together.v1')).host || null; } catch (e) { return null; } })()");
  try {
    await page.until(`${GATE_PAGE} === 'cover'`, 30000);
    /* A scored run is what ends on a results page: Scoring, in the Maps
     * room. */
    await page.evaluate("(() => { window.__ui.settings.freestyleScoring = 'scored'; window.__ui.writeSettings(); return 1; })()");

    /* THE FIRST ROOM: the options are asked, once. */
    await toHostPage(page);
    check('the first time, the map page says nothing of a kind of room and has no Room options', !/as last time/.test(await band()) && !(await optionsUp()), await band());
    check('a double click on a map', (await doubleClickMap(page, 'Bardwell')) === 'ok');
    check('asks the first room\'s options', await pass(sheetIs(page, 'host')));
    const openWord = await page.evaluate("document.querySelector('#tg [data-k=\"open\"]').textContent");
    check('whose button says Open room and fly', openWord === 'Open room and fly', openWord);
    await pressKey(page, 'listed');
    await pressKey(page, 'open');
    check('and the room opens', await pass(page.until(`${T} && window.__together().inRoom`, 20000)), JSON.stringify(await state(page)));
    const code = (await state(page)).code;
    check('into the air, with no invite page between', await pass(flying(page)) && (await state(page)).sheet === '', JSON.stringify(await state(page)));
    check('under a banner with the room\'s code', await pass(page.until(SEES(`Room code ${code}`, '#tg .tg-banner'), 8000)));
    check('and a Copy link button', await page.evaluate("(() => { const b = document.querySelector('#tg .tg-banner [data-k=\"open-copy\"]'); return Boolean(b) && b.offsetParent !== null; })()"));
    const first = await kept();
    check('how the room was opened is kept, and never a password', Boolean(first) && first.listed === true && !('password' in first), JSON.stringify(first));

    /* A RUN ENDS IN THE ROOM. Its page used to have Back to title, which
     * kept the room and left the pilot on menus with no way back to it. */
    await endRun(page);
    const rows = await page.evaluate(ROWS);
    check('a run that ends in the room has Leave room and Quit to title', rows.includes('Leave room<room-leave>') && rows.includes('Quit to title<room-title>'), rows.join(', '));
    check('and no Back to title', !rows.some((r) => /title<title>/.test(r)), rows.join(', '));
    await page.tap('Escape');
    check('Esc from it is the front page, the room kept', await pass(page.until(`${GATE_PAGE} === 'cover'`, 10000)) && (await state(page)).inRoom, JSON.stringify(await state(page)));

    /* THE WAY BACK, on the menus. */
    check('the bar has Back to your room', await pass(page.until(DOOR, 5000)));
    const cover = await page.evaluate(CARD_NAMES);
    check('the cover has the room\'s panel where Multiplayer was', cover.some((n) => /back to your room/i.test(n)) && !cover.some((n) => /multiplayer/i.test(n)), cover.join(', '));
    check('with the cursor on it', await page.evaluate("(window.__ui.items()[window.__ui.cursor] || {}).action === 'room-back'"));
    await tapLoose(page, 'Enter');
    check('Enter from the front page is back in the air', await pass(flying(page, 20000)), JSON.stringify(await state(page)));
    check('in the same room', (await state(page)).inRoom && (await state(page)).code === code, JSON.stringify(await state(page)));

    /* The Multiplayer page, reached as Back from a map page reaches it. */
    await endRun(page);
    await page.tap('Escape');
    await page.until(`${GATE_PAGE} === 'cover'`, 10000);
    await page.evaluate("(() => { window.__ui.turnGate('together'); return 1; })()");
    await page.until(`${GATE_PAGE} === 'together'`, 8000);
    const mp = await page.evaluate(CARD_NAMES);
    check('the Multiplayer page has the room\'s panel where Host a room was', mp.some((n) => /back to your room/i.test(n)) && !mp.some((n) => /host a room/i.test(n)), mp.join(', '));
    /* Their own room in Open rooms said "You are in this room already"
     * and closed. */
    await page.evaluate("(() => { window.__ui.act('mp-find'); return 1; })()");
    await sheetIs(page, 'lobby');
    check('the pilot\'s own room is in Open rooms', await pass(page.until(`Boolean(document.querySelector('#tg [data-k="room-${code}"]'))`, 15000)));
    await pressKey(page, `room-${code}`);
    check('and pressing it flies it', await pass(flying(page, 20000)) && (await state(page)).inRoom && (await state(page)).code === code, JSON.stringify(await state(page)));

    /* The bar's button, from a map page. */
    await endRun(page);
    await page.tap('Escape');
    await page.until(`${GATE_PAGE} === 'cover'`, 10000);
    await page.evaluate("(() => { window.__ui.show('freestyle'); return 1; })()");
    await page.until("window.__ui.screen === 'freestyle' && document.querySelector('.wp-card')", 30000);
    check('a map page has Back to your room on its bar', await pass(page.until(DOOR, 5000)));
    await page.evaluate("(() => { document.querySelector('.frame-room').click(); return 1; })()");
    check('which flies the room', await pass(flying(page, 20000)) && (await state(page)).inRoom && (await state(page)).code === code, JSON.stringify(await state(page)));

    /* ANOTHER MAP FLOWN ALONE, the room held. The way back seats the
     * room's own world and flies it in this page, so the room is never
     * left: by the room's link the pilot's going emptied the room, and
     * the board's answer to a link for an empty room is No such room. */
    await endRun(page);
    await page.tap('Escape');
    await page.until(`${GATE_PAGE} === 'cover'`, 10000);
    await page.evaluate("(() => { window.__ui.act('gate-solo'); return 1; })()");
    await page.until(`${GATE_PAGE} === 'solo'`, 8000);
    await page.evaluate("(() => { window.__ui.act('way-freestyle-5inch'); return 1; })()");
    await page.until("window.__ui.screen === 'freestyle' && document.querySelector('.wp-card')", 30000);
    check('another map, flown alone from the Fly solo page', (await doubleClickMap(page, 'Hoshino')) === 'ok'
      && await pass(page.until("window.__mode === 'flight' && window.__ui.screen === 'flight' && window.__ui.settings.map === 'office'", 120000)), await page.evaluate('window.__ui.settings.map'));
    const seat = await state(page);
    check('keeps the room', seat.inRoom && seat.code === code, JSON.stringify(seat));
    await endRun(page);
    await page.tap('Escape');
    await page.until(`${GATE_PAGE} === 'cover'`, 10000);
    check('the front page still has the way back, under the cursor', await pass(page.until(DOOR, 5000))
      && await page.evaluate("(window.__ui.items()[window.__ui.cursor] || {}).action === 'room-back'"));
    await page.evaluate('(() => { window.__samePage = true; return 1; })()');
    await tapLoose(page, 'Enter');
    check('and Enter flies the room\'s own map again', await pass(page.until("window.__samePage === true && window.__mode === 'flight' && window.__ui.screen === 'flight' && window.__ui.settings.map === 'bardwell'", 120000)),
      await page.evaluate("JSON.stringify([window.__samePage === true, window.__mode, window.__ui.screen, window.__ui.settings.map])").catch((e) => e.message));
    const landed = await state(page);
    check('in this page, the room never left: the same seat, still the host', Boolean(landed) && landed.inRoom && landed.code === code && landed.you === seat.you && landed.host === landed.you, JSON.stringify(landed));

    /* QUIT TO TITLE on the results page leaves the room, as it says. */
    await endRun(page);
    await page.evaluate("(() => { window.__ui.act('room-title'); return 1; })()");
    check('Quit to title from the results leaves the room', await pass(page.until(`${GATE_PAGE} === 'cover' && ${T} && !window.__together().inRoom`, 10000)), JSON.stringify(await state(page)));
    const after = await page.evaluate(CARD_NAMES);
    check('and the cover has Multiplayer again, the bar\'s button gone', after.some((n) => /multiplayer/i.test(n)) && !(await page.evaluate(DOOR)), after.join(', '));

    /* THE SECOND ROOM: four presses, the map the last. */
    await toHostPage(page);
    check('the map page says what a double click opens', /listed under Rooms, as last time/.test(await band()), await band());
    check('and has Room options', await optionsUp());
    check('a double click on a map', (await doubleClickMap(page, 'Bardwell')) === 'ok');
    let asked = false;
    const up = await until(async () => {
      const st = await state(page);
      asked = asked || st.sheet === 'host' || st.sheet === 'share';
      return st.inRoom && st.sheet === '' && await page.evaluate("window.__mode === 'flight' && window.__ui.screen === 'flight'");
    }, 30000, 40);
    check('opens the room and flies it', up, JSON.stringify(await state(page)));
    check('with no options page and no invite page on the way', !asked);
    const second = (await state(page)).code;
    const shelf = await (await fetch(`${boardOrigin}/api/rooms?way=freestyle`)).json();
    check('the room is listed, as the first was', JSON.stringify(shelf).includes(second), JSON.stringify(shelf).slice(0, 300));

    /* ROOM OPTIONS changes what the next one opens as. */
    await endRun(page);
    await page.evaluate("(() => { window.__ui.act('room-title'); return 1; })()");
    await page.until(`${GATE_PAGE} === 'cover' && ${T} && !window.__together().inRoom`, 10000);
    await toHostPage(page);
    await page.evaluate("(() => { document.querySelector('.host-band-options').click(); return 1; })()");
    check('Room options opens the options with nothing to open', await pass(sheetIs(page, 'host'))
      && await page.evaluate("Boolean(document.querySelector('#tg [data-k=\"save\"]')) && !document.querySelector('#tg [data-k=\"open\"]') && !document.querySelector('#tg-pw')"));
    await pressKey(page, 'private');
    await pressKey(page, 'save');
    const changed = await kept();
    check('Save keeps the change', Boolean(changed) && changed.listed === false, JSON.stringify(changed));
    check('and the map page says link only', await pass(page.until("(() => { const b = document.querySelector('.host-band'); return Boolean(b) && !b.hidden && /link only, as last time/.test(b.textContent); })()", 5000)), await band());
    check('with no room opened by it', !(await state(page)).inRoom && (await state(page)).sheet === '', JSON.stringify(await state(page)));
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.stack || e.message}`);
  } finally {
    await close(page);
  }
}

try {
  if (wanted('pair')) { await freshBoard(); await scenePair(); }
  if (wanted('shelf')) { await freshBoard(); await sceneShelf(); }
  if (wanted('bots')) { await freshBoard(); await sceneBots(); }
  if (wanted('dfpop')) { await freshBoard(); await sceneDfPop(); }
  if (wanted('votepad')) { await freshBoard(); await sceneVotePad(); }
  if (wanted('deploy')) { await freshBoard(); await sceneDeploy(); }
  if (wanted('flow')) { await freshBoard(); await sceneFlow(); }
} catch (e) {
  failures += 1;
  console.log(`  FAIL  ${e.stack || e.message}`);
} finally {
  for (const p of [...pages]) await close(p);
  await stopBoard();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\nrooms-check: ${passes} passed, ${failures} failed, ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(failures ? 1 : 0);
