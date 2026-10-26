/*
 * together-shots.js: fly the real shell with other pilots, every way in,
 * and take pictures of what it draws.
 *
 * Multiplayer can only be looked at with somebody else in the room, and the
 * only somebody a container has is a program. So this starts a board from
 * the leaderboard checkout beside this one (or NET_BOARD), has pilots in
 * Node open rooms and fly and talk in them, and boots the shell in headless
 * Chromium the ways a pilot gets in: Fly together on a map, the Rooms tab,
 * a room's link with and without its invite, and a race room. The pilots
 * in Node use src/net/room.js, the same client the shell runs, so the
 * bytes on the wire are the real ones in both directions. The direct links
 * of stage 5 need two real browsers, so that scene opens two.
 *
 * Scenes, each its own browser, its own storage and its own board (--only=a,b runs some):
 *
 *   host    Fly together from the picker: meet your avatar, the host sheet,
 *           the invite sheet, the chip; pilots join and fly near (the hello,
 *           and three craft for three draw calls); quick chat both ways,
 *           typed chat, the pilots list, the room's pause rows, the room's
 *           page, a report, room settings, handing the host on, leaving
 *   lobby   the Rooms shelf with listed rooms, a card on this world, and a
 *           card on another world, which reloads into it and joins
 *   link    a room link: "Join this room?", Join, and the invite out of the
 *           address bar; then a password room without the invite
 *   race    a race room: the pit, ready with G, the countdown, standings,
 *           results and one more
 *   direct  two browsers in one room, near each other: their direct link
 *           comes up and poses cross it
 *   steam   the Steam edition (?edition=steam): nothing reaches the board
 *           before the pilot's yes, the yes opens the rooms routes and no
 *           others, a room on a map this copy lacks is greyed, and Turn
 *           online off asks again next time
 *   door    every way in that says no: a wrong code, a full room, Cancel
 *           while the board is slow, a kick over the room's own pages and
 *           the kick said again at the door, and Open room with the board
 *           down, then Try again once it is back
 *   drop    the board gone mid flight: the chip and a banner while the
 *           page tries again, back in from the ticket when it returns, and
 *           a board that cannot read the ticket ending the room
 *
 * The race scene also has the host leave in the countdown.
 *
 * Usage:
 *   node scripts/together-shots.js [--out=DIR] [--w=1280] [--h=720] [--only=host,race] [--launched=1]
 * DIR defaults to .loop/together, whose pictures git ignores.
 *
 * --launched=1 is for the day ROOMS_LAUNCHED in src/main.js is turned on:
 * every page opens without ?mp=1, and the links the page writes must not
 * carry it either. Without the switch on it fails, which is the point.
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
import http from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { roomsUrl } from '../src/net/link.js';
import { RoomSession } from '../src/net/room.js';
import { roomUrl } from '../src/net/roomlinks.js';
import { rollAvatar } from '../src/net/avatar.js';
import { QUICK } from '../src/net/together.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const opts = {
  out: '.loop/together', w: 1280, h: 720, only: '',
};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)=(.*)$/);
  if (m) opts[m[1]] = /^\d+$/.test(m[2]) ? Number(m[2]) : m[2];
}
const outDir = isAbsolute(String(opts.out)) ? String(opts.out) : join(root, opts.out);
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
const only = new Set(String(opts.only || '').split(',').filter(Boolean));
const wanted = (name) => !only.size || only.has(name);

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
  console.log('together-shots: no checkout of the board\'s repository beside this one; set NET_BOARD to one');
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), 'webfpv-together-'));
const port = 4700 + Math.floor(Math.random() * 200);
const boardOrigin = `http://127.0.0.1:${port}`;
const roomSecret = randomBytes(24).toString('hex');
let board = null;

/*
 * Twitch's chat and YouTube's live chat, as stand ins on this machine, so
 * a streamer room's names are proved here the way they are live, and no
 * board this script starts ever reaches the real ones.
 */
const irc = { socks: new Set(), joined: new Set() };
const ircServer = net.createServer((sock) => {
  irc.socks.add(sock);
  sock.setEncoding('utf8');
  let buf = '';
  sock.on('data', (c) => {
    buf += c;
    for (let at = buf.indexOf('\r\n'); at >= 0; at = buf.indexOf('\r\n')) {
      const line = buf.slice(0, at);
      buf = buf.slice(at + 2);
      if (line.startsWith('NICK ')) sock.write(':tmi.twitch.tv 001 justinfan :Welcome, GLHF!\r\n');
      const j = /^(JOIN|PART) #(\S+)/.exec(line);
      if (j && j[1] === 'JOIN') irc.joined.add(j[2]);
      if (j && j[1] === 'PART') irc.joined.delete(j[2]);
      /* What Twitch answers an anonymous JOIN of a channel it does not
       * know. */
      if (j && j[1] === 'JOIN' && j[2] === 'nosuchchannel') {
        sock.write('@msg-id=msg_channel_suspended :tmi.twitch.tv NOTICE #nosuchchannel :This channel does not exist or has been suspended.\r\n');
      }
    }
  });
  sock.on('error', () => {});
  sock.on('close', () => {
    irc.socks.delete(sock);
    if (!irc.socks.size) irc.joined.clear();
  });
});
await new Promise((r) => { ircServer.listen(0, '127.0.0.1', r); });
ircServer.unref();
function ircSay(channel, uid, name, text) {
  const login = name.toLowerCase();
  for (const sock of irc.socks) {
    sock.write(`@display-name=${name};user-id=${uid} :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #${channel} :${text}\r\n`);
  }
}
const yt = { live: new Set(['LIVEvideo01']), said: [], reads: 0 };
const ytServer = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('content-type', 'application/json');
  if (u.pathname.endsWith('/videos')) {
    const id = u.searchParams.get('id');
    res.end(JSON.stringify({ items: [{ liveStreamingDetails: yt.live.has(id) ? { activeLiveChatId: `chat-${id}` } : {} }] }));
  } else if (u.pathname.endsWith('/liveChat/messages')) {
    yt.reads += 1;
    res.end(JSON.stringify({ pollingIntervalMillis: 1000, nextPageToken: `p${yt.reads}`, items: yt.said.splice(0) }));
  } else {
    res.statusCode = 404;
    res.end('{}');
  }
});
await new Promise((r) => { ytServer.listen(0, '127.0.0.1', r); });
ytServer.unref();
const standIns = {
  BOARD_TWITCH_IRC: `127.0.0.1:${ircServer.address().port}`,
  BOARD_YOUTUBE_KEY: 'shots-stand-in',
  BOARD_YOUTUBE_API: `http://127.0.0.1:${ytServer.address().port}/youtube/v3`,
};

/*
 * A board of the scene's own. The board allows six rooms hosted from one
 * address in ten minutes, and every pilot here is 127.0.0.1, so the whole
 * run hosts more than one board would let it; a new board for each scene
 * keeps the limit as it is and each scene as it would be on its own.
 */
async function freshBoard({ secret = roomSecret } = {}) {
  await killBoard();
  board = spawn(process.execPath, [join(boardDir, 'src', 'server.js')], {
    cwd: boardDir,
    env: {
      ...process.env, PORT: String(port), BOARD_FILE: join(scratch, 'board.json'), DATABASE_URL: '', BOARD_ROOM_SECRET: secret, ...standIns,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  board.stdout.resume();
  board.stderr.resume();
  for (let i = 0; i < 200; i += 1) {
    try {
      if ((await fetch(`${boardOrigin}/api/rooms/counts`)).ok) return;
    } catch (e) {
      /* Not listening yet. */
    }
    await wait(25);
  }
  throw new Error('the board did not start');
}

/* The board gone without a word, as a crash or a lost route looks to a
 * pilot: no close frame, so every socket drops with 1006. */
async function killBoard() {
  if (!board) {
    return;
  }
  const was = board;
  board = null;
  was.kill('SIGCONT');
  was.kill('SIGKILL');
  await new Promise((r) => { if (was.exitCode !== null || was.signalCode) r(); else was.once('exit', r); });
}
const wsUrl = roomsUrl(boardOrigin);
await mkdir(outDir, { recursive: true });

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
  if (!(await until(() => b.s.inRoom, 5000))) {
    const no = b.heard.find((x) => x.name === 'refused' || x.name === 'closed');
    throw new Error(`${b.handle} could not host ${room.name}${no ? ` (${no.data.why || no.data.reason || no.data.code})` : ''}`);
  }
  return b.s.room;
}

async function joinRoom(b, code, invite) {
  b.s.join(code, { invite });
  return until(() => b.s.inRoom, 5000);
}

/*
 * The shell's instruments a room's own panels must keep off: the clock,
 * the score, the music, Report bug and Pause, the speed corner, the
 * stick overlay and the flight's line across the heading ("Throttle up
 * to take off"). That line is .banner, fades to nothing when it is empty,
 * and is as wide as half the page whatever its words, so it is held to
 * the boxes of its words, line by line, not its own. Returns the ones the
 * panels named by `sel` sit on, '' when none, with the boxes for the log.
 */
const CLEAR_OF = ['.osd-clock', '.music-dock', '.score-total', '.bug-chip', '.osd-right', '.osd-sticks', '.banner'];
/* And a room banner keeps off the room's own panels as well. */
const BANNER_CLEAR_OF = [...CLEAR_OF, '#tg .roomchip', '#tg .pit', '#tg .standings', '#tg .roster', '#tg .pos'];
function overlaps(page, sel, clearOf = CLEAR_OF) {
  return page.evaluate(`(() => {
    const box = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).opacity !== '0' ? r : null;
    };
    const mine = [...document.querySelectorAll(${JSON.stringify(sel)})].map(box).filter(Boolean);
    const out = [];
    const words = (e) => {
      const range = document.createRange();
      range.selectNodeContents(e);
      return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    };
    for (const s of ${JSON.stringify(clearOf)}) {
      for (const e of document.querySelectorAll(s)) {
        if (!box(e)) continue;
        for (const r of s === '.banner' ? words(e) : [box(e)]) for (const m of mine) {
          if (m.left < r.right && r.left < m.right && m.top < r.bottom && r.top < m.bottom) {
            out.push(s + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + ' under ' + [m.left, m.top, m.right, m.bottom].map(Math.round).join(','));
          }
        }
      }
    }
    return out.join('; ');
  })()`);
}

/*
 * Whether the pilot can see the element `sel` names: in the DOM is not
 * enough, because a panel can be there and drawn invisible, as every room
 * banner was by the shell's own .banner rule. '' when it is seen, else
 * what is wrong with it. Not a hit test: the room's layer takes no
 * pointer, so the page's hit test sees straight through it.
 */
async function settled(page, sel) {
  await page.until(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return Boolean(e) && e.getAnimations().length === 0; })()`, 5000).catch(() => {});
}
function unseen(page, sel) {
  return page.evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return 'not there';
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return 'no size';
    for (let p = e; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return 'hidden by ' + (p.id ? '#' + p.id : p.className || p.tagName) + ' (' + [cs.visibility, cs.display, 'opacity ' + cs.opacity].join(' ') + ')';
    }
    return r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth ? 'off screen' : '';
  })()`);
}

/* The pilot's name and settings, through the doors a pilot uses. */
function seedFor({ map = 'bardwell', airframe = '5inch', name = 'Shell Pilot', met = false }) {
  return `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.airframeAsked = true;
  s.graphics = 'low';
  s.graphicsAuto = false;
  s.map = ${JSON.stringify(map)};
  s.airframe = ${JSON.stringify(airframe)};
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.pilot.name', ${JSON.stringify(name)});
  ${met ? `localStorage.setItem('webfpv.together.v1', JSON.stringify({ avatar: ${JSON.stringify(rollAvatar(() => 0.37))}, met: true }));` : ''}
} catch (e) { /* Storage refused; the run boots on the defaults. */ }`;
}

async function open(path, seed, extra = {}) {
  if (opts.launched) {
    path = path.replace(/([?&])mp=1(&|$)/, (m, a, b) => (b ? a : ''));
  }
  const page = await openPage({
    root, width: opts.w, height: opts.h, url: path, seed: [seed], ...extra,
  });
  await page.until('window.__shellReady === true', 120000);
  await page.until('window.__map && window.__map().ready', 120000);
  return page;
}

/*
 * Whatever of the room's has words or a picture and a size, but is drawn
 * at opacity 0 with nothing animating it there. That is how every room
 * banner was invisible for a day: a style of the shell's set it, and the
 * checks read the words, which were there. A fade that is running, or one
 * that has finished and holds (a spoken line leaving), is meant.
 */
function invisibles(page) {
  return page.evaluate(`(() => {
    const out = [];
    const root = document.querySelector('#tg');
    if (!root) return out;
    for (const e of root.querySelectorAll('*')) {
      if (!e.textContent.trim() && !e.matches('canvas, img')) continue;
      const r = e.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      if (getComputedStyle(e).opacity !== '0' || e.getAnimations().length) continue;
      if (out.some((o) => o.el.contains(e))) continue;
      out.push({ el: e, what: (e.className && e.className.baseVal === undefined ? '.' + String(e.className).split(' ').join('.') : e.tagName) + ' "' + e.textContent.trim().slice(0, 30) + '"' });
    }
    return out.map((o) => o.what);
  })()`);
}

/*
 * Every button of the sheet on top in the window, without scrolling, or ''
 * when they are. At 1280 by 720 a sheet must show everything it has: a
 * control below the fold is one a pilot does not know is there.
 */
function offSheet(page) {
  return page.evaluate(`(() => {
    const top = [...document.querySelectorAll('#tg .sheet')].filter((e) => e.getBoundingClientRect().width > 0).pop();
    if (!top) return 'no sheet';
    const out = [];
    for (const b of top.querySelectorAll('button, input')) {
      const r = b.getBoundingClientRect();
      if (!(r.width > 0)) continue;
      let clip = null;
      for (let p = b.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') { clip = p.getBoundingClientRect(); break; }
      }
      const bottom = Math.min(innerHeight, clip ? clip.bottom : innerHeight);
      if (r.bottom > bottom + 1 || r.top < (clip ? clip.top : 0) - 1) out.push((b.dataset.k || b.textContent.trim()).slice(0, 24));
    }
    return out.join(', ');
  })()`);
}

function shooter(page, scene) {
  page.invisible = page.invisible || [];
  return async (name) => {
    for (const what of await invisibles(page)) {
      page.invisible.push(`${name}: ${what}`);
    }
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    const file = `${scene}-${name}.png`;
    await writeFile(join(outDir, file), Buffer.from(data, 'base64'));
    console.log(`  shot  ${join(opts.out, file)}`);
  };
}

const T = 'window.__together && window.__together()';

/*
 * An expression, for evaluate or until, that is true when a pilot can see
 * `words` inside `scope`: some text holding them, with a size, on screen,
 * and nothing above it hidden or drawn at opacity 0. A fade that is still
 * running counts as seen, because it is on its way in. The checks used to
 * ask only whether the words were in the page, and that is how a day's
 * worth of invisible banners passed them.
 */
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
const toastText = (page) => page.evaluate("(() => { const t = document.querySelector('#tg .tg-toasts'); return t ? t.textContent : ''; })()");
const sheetIs = (page, name, ms = 20000) => page.until(`${T} && window.__together().sheet === ${JSON.stringify(name)}`, ms);
const state = (page) => page.evaluate(`${T}`);

/* Press a button in the room's layer by the words on it. */
async function press(page, words, scope = '#tg') {
  const ok = await page.evaluate(`(() => {
    const want = ${JSON.stringify(words)};
    const box = document.querySelector(${JSON.stringify(scope)});
    if (!box) return false;
    const all = [...box.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent !== null);
    const hit = all.find((b) => b.textContent.trim() === want) || all.find((b) => b.textContent.trim().startsWith(want));
    if (!hit) return false;
    hit.click();
    return true;
  })()`);
  if (!ok) {
    throw new Error(`no button "${words}" in ${scope}`);
  }
  await wait(120);
}

async function pressKey(page, data) {
  await page.evaluate(`(() => { const b = document.querySelector('#tg [data-k=${JSON.stringify(data)}]'); if (!b) throw new Error('no ${data}'); b.click(); return 1; })()`);
  await wait(120);
}

function errorsOf(page) {
  return page.errors.filter((e) => !/favicon|ERR_CONNECTION_REFUSED|stun\.cloudflare|net::ERR/.test(String(e)));
}

/* The two checks every scene ends with: the page said nothing it should
 * not have, and no picture of it had anything of the room's drawn
 * invisible. `allow` names the console lines a scene asked for. */
function endChecks(page, allow = null) {
  const errors = errorsOf(page).filter((e) => !allow || !allow.test(e));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  const gone = page.invisible || [];
  check('nothing of the room\'s drawn invisible in any picture', gone.length === 0, gone.slice(0, 4).join(' | '));
}

/* Where the page's craft is, as a bot hears it, and its forward. */
async function poseOf(b, handle) {
  let centre = null;
  await until(() => {
    b.s.eachRemote((id, pose, pilot) => {
      if (pilot.handle === handle) centre = { ...pose };
    });
    return Boolean(centre);
  }, 10000, 100);
  if (!centre) return null;
  const q = centre;
  let fx = -2 * (q.qx * q.qz + q.qw * q.qy);
  let fz = -(1 - 2 * (q.qx * q.qx + q.qy * q.qy));
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl;
  fz /= fl;
  return { ...centre, fx, fz };
}

/* ------------------------------------------------------------------ */

async function sceneHost() {
  console.log('\nhost: Fly together from the picker');
  const bots = [bot('Sakura Wing', 11), bot('Amber Hornet', 23), bot('Slate Kite', 37)];
  const page = await open(`/index.html?mp=1&board=${encodeURIComponent(boardOrigin)}&map=bardwell&craft=5inch`, seedFor({}));
  const shot = shooter(page, 'host');
  let flying = null;
  try {
    await page.evaluate("(() => { window.__ui.show('freestyle'); return 1; })()");
    await page.until("document.querySelector('.wp-rooms') !== null", 30000);
    await wait(600);
    await shot('picker-rooms-tab');
    check('the picker has a Rooms tab', true);
    await page.evaluate("(() => { window.__ui.picker.select('map:bardwell'); return 1; })()");
    await wait(200);
    const hasFt = await page.evaluate("[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Fly together')");
    check('the chosen map offers Fly together', hasFt);
    await page.evaluate("(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Fly together').click(); return 1; })()");
    check('the first time, the pilot meets their avatar', await sheetIs(page, 'meet').then(() => true, () => false));
    await wait(400);
    await shot('meet');
    await pressKey(page, 'look');
    await sheetIs(page, 'editor');
    await pressKey(page, 'tab-Hair');
    await pressKey(page, 'hair-3');
    await wait(300);
    await shot('editor');
    await pressKey(page, 'done');
    await sheetIs(page, 'meet');
    await pressKey(page, 'keep');
    check('then the host sheet', await sheetIs(page, 'host').then(() => true, () => false));
    await wait(300);
    await shot('host-sheet');
    await pressKey(page, 'open');
    check('Open room makes the room and shows the invite', await sheetIs(page, 'share').then(() => true, () => false));
    const st = await state(page);
    check('the page is in a room with a code', st && st.inRoom && /^[A-Z2-9]{6}$/.test(st.code), JSON.stringify(st));
    await wait(300);
    await shot('invite');
    const link = await page.evaluate("document.querySelector('#tg input[aria-label=\"Room link\"]').value");
    check('the room link names the world, the room and nothing secret', /map=bardwell/.test(link) && link.includes(`room=${st.code}`) && !link.includes('#i='), link);
    check(opts.launched ? 'and no ?mp=1, now rooms are on for everybody' : 'and ?mp=1, until rooms launch', /[?&]mp=1/.test(link) === !opts.launched, link);
    await pressKey(page, 'fly');
    await page.until("window.__mode === 'flight'", 30000);
    await page.until(`${T} && window.__together().sheet === ''`, 10000);
    const addr = await page.evaluate('location.href');
    check('flying, with the room in the address bar', addr.includes(`room=${st.code}`) && !addr.includes('i='), addr);
    await wait(500);
    await shot('flying-chip');
    const chipOn = await overlaps(page, '#tg .roomchip');
    check('the room chip covers none of the shell\'s instruments', !chipOn, chipOn);

    for (const b of bots) {
      await joinRoom(b, st.code, '');
    }
    check('three pilots join by the code', bots.every((b) => b.s.inRoom));
    await page.until(`${T} && window.__together().pilots === 4`, 10000);
    check('the page sees four pilots', (await state(page)).pilots === 4);

    const c = await poseOf(bots[0], 'Shell Pilot');
    check('the page\'s pose reaches the other pilots', Boolean(c));
    const t0 = performance.now();
    flying = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      const cx = c.px + c.fx * 5;
      const cz = c.pz + c.fz * 5;
      bots.forEach((b, k) => {
        const a = k === 0 ? t * 0.9 : (k === 1 ? -0.9 : 0.9);
        const r = k === 0 ? 2.2 : 1.6;
        const near = k === 2 && t < 6;
        const px = near ? c.px + c.fx * 1.6 : cx + Math.cos(a) * r;
        const pz = near ? c.pz + c.fz * 1.6 : cz + Math.sin(a) * r;
        const yaw = -a + (k === 0 ? Math.PI : 0);
        const h = yaw / 2;
        const bank = k === 0 ? 0.35 : 0;
        b.s.uplink(px, c.py + 0.6 + (k === 1 ? 0.5 : 0), pz,
          Math.sin(bank / 2) * Math.cos(h), Math.sin(h) * Math.cos(bank / 2), -Math.sin(bank / 2) * Math.sin(h), Math.cos(h) * Math.cos(bank / 2),
          k !== 2, 0);
      });
    }, 1000 / 60);
    const hello = await page.until("document.querySelector('#tg .hello') !== null", 8000).then(() => true, () => false);
    check('a pilot flying close gets the hello', hello);
    await shot('hello');
    await wait(2600);
    const drawn = await page.evaluate(`(() => {
      const s = window.__mapScene ? window.__mapScene() : null;
      let g = null;
      if (s) s.traverse((o) => { if (o.name === 'room-craft') g = o; });
      return g ? { visible: g.visible, counts: g.children.map((c) => c.name + ':' + c.count) } : null;
    })()`);
    check('the other three pilots are drawn', Boolean(drawn && drawn.visible && drawn.counts.includes('room-craft-bodies:3')), JSON.stringify(drawn));
    const cost = await page.evaluate(`(async () => {
      const s = window.__mapScene();
      let g = null;
      s.traverse((o) => { if (o.name === 'room-craft') g = o; });
      let draws = 0;
      const kept = g.children.map((c) => c.onBeforeRender);
      g.children.forEach((c, i) => { c.onBeforeRender = function (...a) { draws += 1; return kept[i].apply(this, a); }; });
      let renders = 0;
      const sceneKept = s.onBeforeRender;
      s.onBeforeRender = function (...a) { renders += 1; return sceneKept.apply(this, a); };
      let ticks = 0;
      await new Promise((r) => { const tick = () => { ticks += 1; if (renders >= 12 || ticks > 600) r(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      s.onBeforeRender = sceneKept;
      g.children.forEach((c, i) => { c.onBeforeRender = kept[i]; });
      return { perRender: renders ? draws / renders : -1, renders, meshes: g.children.length };
    })()`);
    check(`three pilots cost three draw calls each time the scene is drawn (${cost.perRender.toFixed(2)} over ${cost.renders} renders)`,
      cost.perRender === 3 && cost.meshes === 3);
    await shot('three-pilots');

    bots[0].s.say('gg');
    const talk = await page.until(SEES('GG!', '#tg .talk'), 5000).then(() => true, () => false);
    check('a quick line arrives as dialogue, with the speaker\'s portrait', talk);
    await wait(500);
    await shot('talk-quick');
    const talkOn = await overlaps(page, '#tg .talk');
    check('a line said covers none of the shell\'s instruments, the sticks and the pack included', !talkOn, talkOn);
    await wait(1800);
    bots[1].s.chat('Nice to fly with you', 'laugh');
    const typed = await page.until(SEES('Nice to fly with you', '#tg .talk'), 5000).then(() => true, () => false);
    check('a typed line arrives in a private room with typed chat on', typed);
    await wait(1400);
    await shot('talk-typed');
    bots[1].s.chat('find me at www.example.com', 'calm');
    await until(() => bots[1].heard.some((e) => e.name === 'chatRefused'), 3000);
    check('the board refuses a link in chat, and says why to the one who typed it', bots[1].heard.some((e) => e.name === 'chatRefused' && e.data.why === 'links'));

    const before = bots[0].heard.filter((e) => e.name === 'say').length;
    await page.tap('Digit1');
    await until(() => bots[0].heard.filter((e) => e.name === 'say').length > before, 3000);
    const said = bots[0].heard.filter((e) => e.name === 'say').pop();
    check('1 says Hi! to the room', said && said.data.line === 'hi', JSON.stringify(said && said.data));
    await page.tap('KeyQ');
    await wait(400);
    await shot('quick-strip');
    await page.tap('KeyQ');
    await page.tap('Tab');
    await wait(400);
    check('Tab shows the pilots', await page.evaluate("!document.querySelector('#tg .roster').hidden"));
    await shot('pilots-list');
    const rosterOn = await overlaps(page, '#tg .roster');
    check('the pilots list covers none of the shell\'s instruments', !rosterOn, rosterOn);
    await page.tap('Tab');
    check('and the browser did not move its focus', await page.evaluate("document.activeElement === document.body || document.activeElement === null || document.activeElement.tagName === 'CANVAS'"));

    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 10000);
    await wait(300);
    const rows = await page.evaluate("window.__ui.items().map((r) => r.label)");
    check('the pause menu is the room\'s', rows.includes('Room') && rows.includes('Leave room') && rows.includes('Quit to title'), rows.join(', '));
    const quitShown = await page.evaluate(`(() => {
      const q = [...document.querySelectorAll('button, [role="button"], li, .row')].find((e) => e.textContent.trim().startsWith('Quit to title'));
      if (!q) return 'no Quit to title row';
      const b = q.getBoundingClientRect();
      return b.bottom <= window.innerHeight - 40 ? '' : 'Quit to title ends at ' + Math.round(b.bottom) + ' of ' + window.innerHeight;
    })()`);
    check('every room row is above the fold, Quit to title included', !quitShown, quitShown);
    await shot('pause');
    await page.evaluate("(() => { window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    await wait(300);
    await shot('room-page');
    const otherId = bots[1].s.you;
    await pressKey(page, `pilot-${otherId}`);
    await wait(200);
    await shot('room-pilot-open');
    await pressKey(page, `report-${otherId}`);
    await sheetIs(page, 'report');
    await pressKey(page, 'why-spam');
    await wait(200);
    await shot('report');
    await pressKey(page, 'send');
    const thanks = await page.until(SEES('Sent.'), 5000).then(() => true, () => false);
    check('a report is sent and thanked', thanks);
    await shot('report-sent');
    await pressKey(page, 'back');
    await sheetIs(page, 'room');
    await pressKey(page, 'talk');
    await sheetIs(page, 'scene');
    await wait(400);
    await shot('talk-scene');
    await page.evaluate("(() => { const i = document.querySelector('#tg-say'); i.value = 'Hello from the shell'; i.dispatchEvent(new Event('input')); return 1; })()");
    const heardBefore = bots[0].heard.filter((e) => e.name === 'chat').length;
    await pressKey(page, 'say-go');
    await until(() => bots[0].heard.filter((e) => e.name === 'chat').length > heardBefore, 3000);
    const line = bots[0].heard.filter((e) => e.name === 'chat').pop();
    check('the talk scene says a typed line to the room', line && line.data.text === 'Hello from the shell', JSON.stringify(line && line.data));
    await pressKey(page, 'done');
    await sheetIs(page, 'room');
    await pressKey(page, 'settings');
    await sheetIs(page, 'roomSettings');
    await page.evaluate("(() => { const i = document.querySelector('#tg-rn2'); i.value = 'Evening laps'; i.dispatchEvent(new Event('input')); return 1; })()");
    await wait(200);
    await shot('room-settings');
    await pressKey(page, 'save');
    await until(() => bots[0].s.room && bots[0].s.room.name === 'Evening laps', 4000);
    check('room settings reach the other pilots', bots[0].s.room.name === 'Evening laps', bots[0].s.room.name);
    await sheetIs(page, 'room');
    const hostId = bots[0].s.you;
    await pressKey(page, `pilot-${hostId}`);
    await pressKey(page, `mh-${hostId}`);
    await sheetIs(page, 'confirm');
    await wait(200);
    await shot('confirm-host');
    check('Cancel has the focus on a host action', await page.evaluate("document.activeElement && document.activeElement.dataset.k === 'no'"));
    await pressKey(page, 'yes');
    await until(() => bots[0].s.link.hostId === hostId, 4000);
    check('make host hands the room on', bots[0].s.link.hostId === hostId);
    await pressKey(page, 'leave');
    await sheetIs(page, 'confirm');
    await pressKey(page, 'yes');
    await until(() => bots[0].s.link.pilots.size === 3, 4000);
    check('leave takes the page out, and the others see it go', bots[0].s.link.pilots.size === 3);
    const after = await page.evaluate('location.href');
    check('and the room is gone from the address bar', !after.includes('room='), after);
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    if (flying) clearInterval(flying);
    for (const b of bots) b.s.leave();
    await page.close();
  }
}

async function sceneLobby() {
  console.log('\nlobby: the Rooms shelf');
  const bots = [bot('Mint Ranger', 41), bot('Sky Darter', 53), bot('Rose Comet', 67)];
  await hostRoom(bots[0], {
    name: 'Pines at dusk', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50, listed: true, tags: ['chill'],
  });
  await hostRoom(bots[1], {
    name: 'Lounge whoops', way: 'freestyle', map: 'house', mapName: "Nick Burns' house", scale: 100, listed: true, tags: ['beginners'],
  });
  await joinRoom(bots[2], bots[0].s.room.code, '');
  const page = await open(`/index.html?mp=1&board=${encodeURIComponent(boardOrigin)}&map=bardwell&craft=5inch`, seedFor({ met: true, name: 'Lobby Pilot' }));
  const shot = shooter(page, 'lobby');
  try {
    await page.evaluate("(() => { window.__ui.onRooms('freestyle'); return 1; })()");
    await sheetIs(page, 'lobby');
    await page.until("document.querySelectorAll('#tg .room h4').length >= 2", 10000);
    await wait(800);
    await shot('shelf');
    const names = await page.evaluate("[...document.querySelectorAll('#tg .room h4')].map((h) => h.textContent)");
    check('the shelf lists the listed rooms', names.includes('Pines at dusk') && names.includes('Lounge whoops'), names.join(', '));
    await pressKey(page, `room-${bots[0].s.room.code}`);
    await page.until(`${T} && window.__together().inRoom`, 15000);
    check('a card on this world joins it at once', true);
    await page.until("window.__mode === 'flight'", 30000);
    await wait(600);
    await shot('joined');
    const welcome = await page.until(SEES('Welcome to'), 3000).then(() => true, () => false);
    check('with a welcome', welcome);
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); return 1; })()");
    await page.evaluate("(() => { window.__ui.act('room-leave'); return 1; })()");
    await sheetIs(page, 'confirm');
    await pressKey(page, 'yes');
    await page.until(`${T} && !window.__together().inRoom`, 5000);
    await page.evaluate("(() => { window.__ui.onRooms('freestyle'); return 1; })()");
    await sheetIs(page, 'lobby');
    await page.until(`document.querySelector('#tg [data-k="room-${bots[1].s.room.code}"]') !== null`, 10000);
    await pressKey(page, `room-${bots[1].s.room.code}`);
    /* Another world: the page reloads into it, and the press goes with it. */
    await wait(1500);
    await page.until('window.__shellReady === true', 120000);
    await page.until("location.search.includes('map=house')", 60000);
    await page.until(`${T} && window.__together().inRoom`, 60000);
    check('a card on another world reloads into it and joins, without asking twice', true);
    await page.until("window.__mode === 'flight'", 30000);
    await wait(800);
    await shot('joined-other-world');
    const craft = await page.evaluate('window.__ui.settings.airframe');
    check('on the room\'s aircraft', craft === 'whoop65', craft);
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    for (const b of bots) b.s.leave();
    await page.close();
  }
}

async function sceneLink() {
  console.log('\nlink: a room link');
  const hostBot = bot('Kite Runner', 71);
  const room = await hostRoom(hostBot, {
    name: "Kite's room", way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50, password: 'pines4ever',
  });
  const base = 'http://127.0.0.1/index.html';
  const withInvite = roomUrl(base, room, { invite: hostBot.s.invite, mp: !opts.launched });
  const path = (u) => {
    const x = new URL(u);
    x.searchParams.set('board', boardOrigin);
    return `${x.pathname}${x.search}${x.hash}`;
  };
  let page = await open(path(withInvite), seedFor({ name: 'Link Pilot' }));
  let shot = shooter(page, 'link');
  try {
    check('a link shows "Join this room?" and nothing more', await sheetIs(page, 'join').then(() => true, () => false));
    const st = await state(page);
    check('and has not joined', !st.inRoom);
    const addr = await page.evaluate('location.href');
    check('the invite is out of the address bar at once', !addr.includes('i='), addr);
    await wait(500);
    await shot('join-card');
    await pressKey(page, 'join');
    await sheetIs(page, 'meet');
    await pressKey(page, 'keep');
    await page.until(`${T} && window.__together().inRoom`, 15000);
    check('Join, then the avatar, then in: the invite skipped the password', true);
    await page.until("window.__mode === 'flight'", 30000);
    await wait(500);
    await shot('in');
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    await page.close();
  }
  const plain = roomUrl(base, room, { mp: !opts.launched });
  page = await open(path(plain), seedFor({ name: 'Door Pilot', met: true }));
  shot = shooter(page, 'link');
  try {
    await sheetIs(page, 'join');
    await pressKey(page, 'join');
    check('without the invite, the password', await sheetIs(page, 'password').then(() => true, () => false));
    await page.evaluate("(() => { const i = document.querySelector('#tg-pw2'); i.value = 'wrong one'; i.dispatchEvent(new Event('input')); return 1; })()");
    await pressKey(page, 'pw-go');
    await page.until("document.querySelector('#tg .help.bad') !== null", 10000);
    check('a wrong password says so, and stays on the card', (await state(page)).sheet === 'password');
    await wait(300);
    await shot('password-wrong');
    await page.evaluate("(() => { const i = document.querySelector('#tg-pw2'); i.value = 'pines4ever'; i.dispatchEvent(new Event('input')); return 1; })()");
    await pressKey(page, 'pw-go');
    await page.until(`${T} && window.__together().inRoom`, 15000);
    check('the right one lets the pilot in', true);
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    hostBot.s.leave();
    await page.close();
  }
}

async function sceneRace() {
  console.log('\nrace: a race room');
  const bots = [bot('Pit Boss', 83), bot('Gate Ghost', 97)];
  const room = await hostRoom(bots[0], {
    name: 'Friday night race', way: '5inch', map: 'bardwell', mapName: "Bardwell's house", scale: 50,
  });
  await joinRoom(bots[1], room.code, bots[0].s.invite);
  const link = roomUrl('http://127.0.0.1/index.html', room, { invite: bots[0].s.invite });
  const u = new URL(link);
  u.searchParams.set('board', boardOrigin);
  const page = await open(`${u.pathname}${u.search}${u.hash}`, seedFor({ name: 'Race Pilot', met: true }));
  const shot = shooter(page, 'race');
  try {
    await sheetIs(page, 'join');
    await pressKey(page, 'join');
    await page.until(`${T} && window.__together().inRoom`, 15000);
    await page.until("window.__mode === 'flight'", 30000);
    await page.until("!document.querySelector('#tg .pit').hidden", 10000);
    await wait(500);
    await shot('pit');
    check('a race room shows the pit', true);
    const pitOn = await overlaps(page, '#tg .pit');
    check('the pit covers none of the shell\'s instruments', !pitOn, pitOn);
    const welcomeOn = await overlaps(page, '#tg .tg-banner', BANNER_CLEAR_OF);
    check('nor does the welcome banner, the pit included', !welcomeOn, welcomeOn);
    bots[0].s.link.raceSend({ t: 'laps', n: 2 });
    bots[0].s.link.raceSend({ t: 'ready', on: true });
    bots[1].s.link.raceSend({ t: 'ready', on: true });
    await wait(400);
    await page.tap('KeyG');
    const counting = await page.until(`${T} && window.__together().race === 'count'`, 8000).then(() => true, () => false);
    check('G readies the page, and everybody ready starts the countdown', counting);
    await page.until("!document.querySelector('#tg .count-big').hidden", 5000).catch(() => {});
    /* READY has two seconds and must be up for both. It once faded with
     * the numbers' one second animation and left the sky empty for the
     * next; its animation is moved to 1.9 s in and read, so a slow page
     * cannot make this pass or fail. */
    const readyHeld = await page.until(`(() => { const s = document.querySelector('#tg .count-big .tg-sr'); return Boolean(s && s.textContent === 'READY'); })()`, 3000)
      .then(() => page.evaluate(`(() => {
        const c = document.querySelector('#tg .count-big canvas');
        const a = c && c.getAnimations()[0];
        if (!a) return 'no animation on READY';
        a.currentTime = 1900;
        const op = Number(getComputedStyle(c).opacity);
        return op > 0.95 ? '' : 'READY is at opacity ' + op + ' 1.9 s in';
      })()`), () => 'READY was never on screen');
    check('READY stays up for its two seconds', !readyHeld, readyHeld);
    await wait(300);
    await shot('countdown');
    const goes = await page.until(`${T} && window.__together().race === 'live'`, 9000).then(() => true, () => false);
    check('GO, on the board\'s clock', goes);
    const gridded = await page.evaluate('window.__mode');
    check('the page is flying the race', gridded === 'flight', gridded);
    /* Laps the board will believe: never more time than has passed since
     * GO (src/rooms.js refuses those), so these are short ones. */
    await wait(2200);
    bots[0].s.link.raceSend({ t: 'lap', n: 1, ms: 1700 });
    bots[1].s.link.raceSend({ t: 'lap', n: 1, ms: 1900 });
    await wait(800);
    await shot('standings');
    check('the standings show while racing', await page.evaluate("!document.querySelector('#tg .standings').hidden"));
    const raceOn = await overlaps(page, '#tg .roomchip, #tg .standings');
    check('the chip and the standings cover none of the shell\'s instruments', !raceOn, raceOn);
    await wait(1400);
    bots[0].s.link.raceSend({ t: 'lap', n: 2, ms: 1600 });
    bots[1].s.link.raceSend({ t: 'lap', n: 2, ms: 1650 });
    await until(() => bots[0].s.link.race && bots[0].s.link.race.rows.filter((r) => r.done).length === 2, 4000);
    check('the board takes the other pilots\' laps and sees them home', bots[0].s.link.race.rows.filter((r) => r.done).length === 2,
      JSON.stringify(bots[0].s.link.race.rows));
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); return 1; })()");
    await page.evaluate("(() => { window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    await pressKey(page, 'race');
    await sheetIs(page, 'race');
    await wait(300);
    await shot('race-page');
    await pressKey(page, 'dnf');
    const results = await page.until(`${T} && window.__together().race === 'results'`, 8000).then(() => true, () => false);
    check('retiring ends the race for the page, and results follow', results);
    await page.evaluate("(() => { window.__ui.act('resume'); return 1; })()");
    await page.until("window.__mode === 'flight' && window.__ui.screen === 'flight'", 10000).catch(() => {});
    await page.until("!document.querySelector('#tg .pit').hidden", 5000).catch(() => {});
    await wait(500);
    await shot('results');
    bots[0].s.link.raceSend({ t: 'again' });
    await page.tap('KeyG');
    const again = await page.until(`${T} && window.__together().race === 'count'`, 8000).then(() => true, () => false);
    check('G for one more, and a majority starts the next', again);
    /* The host leaves in the countdown: the room is handed on, and the
     * race goes at GO all the same. */
    const oldHost = bots[0].s.you;
    bots[0].s.leave();
    const handed = await page.until(`${T} && window.__together().host !== ${oldHost} && window.__together().host !== 0`, 6000).then(() => true, () => false);
    check('the host leaving in the countdown hands the room on', handed, JSON.stringify(await state(page)));
    const stillGoes = await page.until(`${T} && window.__together().race === 'live'`, 9000).then(() => true, () => false);
    check('and the race still goes at GO', stillGoes, JSON.stringify(await state(page)));
    /* One more from the race's page, reached from the pause menu, is the
     * pilot going racing: back to the flight, where the pit is. */
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    await pressKey(page, 'race');
    await sheetIs(page, 'race');
    await pressKey(page, 'dnf');
    await page.until(`${T} && window.__together().race === 'results'`, 8000);
    await page.evaluate("(() => { window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    await pressKey(page, 'race');
    await sheetIs(page, 'race');
    const me = (await state(page)).you;
    await pressKey(page, 'again');
    /* Counted: still in the votes, or, with the page in the menus and the
     * other pilot the only one flying, already the majority that started
     * the next countdown. */
    const voted = await until(() => {
      const rc = bots[1].s.link.race;
      return Boolean(rc && ((rc.votes || []).includes(me) || (rc.phase === 'count' && rc.racers.includes(me))));
    }, 4000);
    const screen = await page.until("window.__ui.screen === 'flight'", 4000).then(() => 'flight', () => page.evaluate('window.__ui.screen'));
    check('One more on the race page counts the vote and goes back to flying', voted && screen === 'flight', screen);
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    for (const b of bots) b.s.leave();
    await page.close();
  }
}

async function sceneDirect() {
  console.log('\ndirect: two browsers, one direct link');
  const hostBot = bot('Link Keeper', 101);
  const room = await hostRoom(hostBot, {
    name: 'Direct test', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50,
  });
  const link = roomUrl('http://127.0.0.1/index.html', room, { invite: hostBot.s.invite });
  const u = new URL(link);
  u.searchParams.set('board', boardOrigin);
  const path = `${u.pathname}${u.search}${u.hash}`;
  /* Two browsers on one machine find each other by their local
   * addresses, which Chromium otherwise hides behind mDNS names that a
   * container cannot resolve. */
  const args = ['--disable-features=WebRtcHideLocalIpsWithMdns'];
  const a = await open(path, seedFor({ name: 'Left Pilot', met: true }), { args });
  const b = await open(path, seedFor({ name: 'Right Pilot', met: true }), { args });
  try {
    for (const p of [a, b]) {
      await sheetIs(p, 'join');
      await pressKey(p, 'join');
      await p.until(`${T} && window.__together().inRoom`, 15000);
      await p.until("window.__mode === 'flight'", 30000);
    }
    const linked = await until(async () => (await state(a)).direct >= 1 && (await state(b)).direct >= 1, 40000, 500);
    check('the two browsers open a direct link', linked, JSON.stringify([await state(a), await state(b)]));
    /* Lift one craft a little so its pose changes and is sent again. */
    await a.evaluate("(() => { window.__input && window.__input.keys && window.__input.keys.add('KeyW'); return 1; })()");
    const crossed = await until(async () => (await state(b)).peerPoses > 0, 10000, 300);
    check('and poses cross it', crossed, JSON.stringify(await state(b)));
    await a.evaluate("(() => { window.__input && window.__input.keys && window.__input.keys.delete('KeyW'); return 1; })()");
    await shooter(b, 'direct')('right-sees-left');
    for (const p of [a, b]) {
      endChecks(p);
    }
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
  } finally {
    hostBot.s.leave();
    await a.close();
    await b.close();
  }
}

async function sceneSteam() {
  console.log('\nsteam: the Steam edition asks first');
  const bots = [bot('Deck Pilot', 83), bot('Shelf Rider', 89)];
  await hostRoom(bots[0], {
    name: 'Pines on Steam', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50, listed: true, tags: ['chill'],
  });
  await hostRoom(bots[1], {
    name: 'Board only room', way: 'freestyle', map: 'nowhere-map-1', mapName: 'A board map', scale: 50, listed: true, tags: [],
  });
  /* The Steam repository's main.js imports src/steam/edition.js at boot,
   * which puts the network guard in before anything reaches for the board;
   * this checkout's shell does not, so the scene does it as early. */
  const page = await open(`/index.html?mp=1&edition=steam&board=${encodeURIComponent(boardOrigin)}&map=bardwell&craft=5inch`,
    `${seedFor({ met: true, name: 'Steam Pilot' })}\nimport('/src/steam/edition.js');`);
  const shot = shooter(page, 'steam');
  /* Every request the page makes to the board from here on, and every
   * socket it opens. */
  const seen = [];
  page.cdp.onEvent((msg) => {
    if (msg.sessionId !== page.sessionId) return;
    if (msg.method === 'Network.requestWillBeSent' && msg.params.request.url.startsWith(boardOrigin)) {
      seen.push(msg.params.request.url.slice(boardOrigin.length));
    } else if (msg.method === 'Network.webSocketCreated') {
      seen.push(`socket ${msg.params.url}`);
    }
  });
  await page.cdp.send('Network.enable', {}, page.sessionId);
  try {
    await page.evaluate("(() => { window.__ui.show('freestyle'); return 1; })()");
    await page.until("document.querySelector('.wp-rooms') !== null", 30000);
    await wait(1500);
    check('nothing reaches the board before the yes, the Rooms count included', seen.length === 0, seen.join(', '));
    await page.evaluate("(() => { window.__ui.onRooms('freestyle'); return 1; })()");
    await sheetIs(page, 'consent');
    await wait(500);
    await shot('consent');
    check('Fly together asks before going online', seen.length === 0, seen.join(', '));
    await press(page, 'Turn on and continue');
    await sheetIs(page, 'lobby');
    await page.until("document.querySelectorAll('#tg .room h4').length >= 2", 10000);
    await wait(800);
    await shot('lobby');
    const cards = await page.evaluate("[...document.querySelectorAll('#tg .room')].map((c) => ({ name: c.querySelector('h4').textContent, grey: c.classList.contains('is-full') }))");
    const onSteam = cards.find((c) => c.name === 'Pines on Steam');
    const boardOnly = cards.find((c) => c.name === 'Board only room');
    check('a room on a world this copy ships is open', onSteam && !onSteam.grey, JSON.stringify(cards));
    check('a room on a map this copy lacks is greyed', boardOnly && boardOnly.grey, JSON.stringify(cards));
    const offRoutes = seen.filter((u) => !u.startsWith('/api/rooms') && !u.startsWith('socket'));
    check('the yes reached the rooms routes and no others', seen.some((u) => u.startsWith('/api/rooms')) && offRoutes.length === 0, seen.join(', '));
    await pressKey(page, `room-${bots[1].s.room.code}`);
    await wait(300);
    check('pressing the greyed card does not join', !(await state(page)).inRoom);
    await pressKey(page, `room-${bots[0].s.room.code}`);
    await page.until(`${T} && window.__together().inRoom`, 15000);
    check('a room on a shipped world joins', true);
    await page.until("window.__mode === 'flight'", 30000);
    await wait(600);
    await shot('joined');
    check('the socket went to the rooms address', seen.some((u) => u === `socket ${wsUrl}`), seen.filter((u) => u.startsWith('socket')).join(', '));
    await page.evaluate("(() => { window.__ui.onRooms('freestyle'); return 1; })()");
    await sheetIs(page, 'lobby');
    await pressKey(page, 'offline');
    await page.until(`${T} && !window.__together().inRoom && !window.__together().sheet`, 5000);
    await wait(400);
    await shot('offline');
    check('Turn online off leaves the room and closes the page', true);
    const before = seen.length;
    const counts = await page.evaluate(`fetch(${JSON.stringify(`${boardOrigin}/api/rooms/counts`)}).then(() => 'reached', (e) => String(e.message || e))`);
    check('and the board is answered offline again', /Offline/.test(counts) && seen.length === before, counts);
    await page.evaluate("(() => { window.__ui.onRooms('freestyle'); return 1; })()");
    await sheetIs(page, 'consent');
    check('the next Fly together asks again', true);
    endChecks(page, /Offline: the Steam edition/);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    for (const b of bots) b.s.leave();
    await page.close();
  }
}

/* The words on the card on top, for the cards that say why. */
/* What the open card's character says, and only if a pilot can see it. */
const says = (page) => page.evaluate(`(() => {
  const s = document.querySelector('#tg .tg-modal .say');
  if (!s) return '';
  for (let p = s; p; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.display === 'none' || cs.visibility === 'hidden' || (cs.opacity === '0' && !p.getAnimations().some((a) => a.playState === 'running'))) return '';
  }
  return s.textContent;
})()`);
const pauseRows = (page) => page.evaluate('window.__ui.items().map((r) => r.label)');

async function sceneDoor() {
  console.log('\ndoor: every way a room says no, and Cancel');
  const keeper = bot('Door Keeper', 131);
  const filler = bot('Seat Taker', 137);
  const room = await hostRoom(keeper, {
    name: 'Two seats', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50, listed: true, max: 2,
  });
  await joinRoom(filler, room.code, '');
  const page = await open(`/index.html?mp=1&board=${encodeURIComponent(boardOrigin)}&map=bardwell&craft=5inch`, seedFor({ met: true, name: 'Door Pilot' }));
  const shot = shooter(page, 'door');
  const typeCode = (code) => page.evaluate(`(() => { const i = document.querySelector('#tg-code'); i.value = ${JSON.stringify(code)}; i.dispatchEvent(new Event('input')); return 1; })()`);
  try {
    await page.evaluate("(() => { window.__ui.onRooms('freestyle'); return 1; })()");
    await sheetIs(page, 'lobby');
    await typeCode('ZZZZZ2');
    await pressKey(page, 'code-go');
    await sheetIs(page, 'cant', 10000);
    const nobody = await says(page);
    check('a code that is nobody\'s says so', nobody.includes('No room has the code ZZZZZ2'), nobody);
    await wait(300);
    await shot('no-such-room');
    await page.tap('Escape');
    check('and Back is the Rooms shelf again', await sheetIs(page, 'lobby', 3000).then(() => true, () => false), (await state(page)).sheet);

    await typeCode(room.code);
    await pressKey(page, 'code-go');
    await sheetIs(page, 'cant', 10000);
    const full = await says(page);
    check('a full room says so, and how full', full.includes('is full: 2 of 2'), full);
    await wait(300);
    await shot('full');

    filler.s.leave();
    await until(() => keeper.s.link.pilots.size === 1, 4000);
    /* The board stopped, so the room's card is still on its way when the
     * pilot changes their mind. */
    board.kill('SIGSTOP');
    await pressKey(page, 'retry');
    await sheetIs(page, 'connecting', 5000);
    await wait(300);
    await shot('finding');
    await pressKey(page, 'cancel');
    const backTo = (await state(page)).sheet;
    board.kill('SIGCONT');
    await wait(2500);
    const after = await state(page);
    check('Cancel while the board is slow goes back to the Rooms shelf', backTo === 'lobby', backTo);
    check('and nothing joins when the board answers after', !after.inRoom && after.sheet === 'lobby' && keeper.s.link.pilots.size === 1, JSON.stringify(after));

    await typeCode(room.code);
    await pressKey(page, 'code-go');
    await page.until(`${T} && window.__together().inRoom`, 15000);
    await page.until("window.__mode === 'flight'", 30000);
    check('the code joins once there is a seat', true);
    const pageId = (await state(page)).you;
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); return 1; })()");
    await page.evaluate("(() => { window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    await pressKey(page, `pilot-${keeper.s.you}`);
    await pressKey(page, `report-${keeper.s.you}`);
    await sheetIs(page, 'report');
    keeper.s.link.hostAction('kick', pageId);
    await sheetIs(page, 'cant', 8000);
    const kicked = await says(page);
    check('a kick says who and for how long, over whatever was open', kicked.includes('took you out of Two seats') && kicked.includes('five minutes'), kicked);
    await wait(300);
    await shot('kicked');
    await page.tap('Escape');
    await wait(300);
    const gone = await state(page);
    check('and Back closes it: the room\'s own pages went with the room', gone.sheet === '', JSON.stringify(gone));
    const rows = await pauseRows(page);
    check('the pause menu is a solo one again', !rows.includes('Room') && !rows.includes('Leave room'), rows.join(', '));

    await page.evaluate("(() => { window.__ui.onRooms('freestyle'); return 1; })()");
    await sheetIs(page, 'lobby');
    await typeCode(room.code);
    await pressKey(page, 'code-go');
    await sheetIs(page, 'cant', 10000);
    const again = await says(page);
    check('back at the door within five minutes, the kick is said again', again.includes('five minutes') && !(await state(page)).inRoom, again);
    await page.tap('Escape');
    await sheetIs(page, 'lobby', 3000);
    await page.tap('Escape');
    await page.until(`${T} && window.__together().sheet === ''`, 3000);

    await killBoard();
    await page.evaluate("(() => { window.__ui.show('freestyle'); return 1; })()");
    await page.until("document.querySelector('.wp-rooms') !== null", 30000);
    await page.evaluate("(() => { window.__ui.picker.select('map:bardwell'); return 1; })()");
    await wait(200);
    await page.evaluate("(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Fly together').click(); return 1; })()");
    await sheetIs(page, 'host');
    await pressKey(page, 'open');
    await sheetIs(page, 'cant', 15000);
    const down = await says(page);
    check('with the board down, Open room says it cannot reach it', down.includes('Rooms need the internet'), down);
    check('and offers to try again', await page.evaluate("Boolean(document.querySelector('#tg [data-k=\"retry\"]'))"));
    await wait(300);
    await shot('board-down');
    await freshBoard();
    await pressKey(page, 'retry');
    const opened = await sheetIs(page, 'share', 15000).then(() => true, () => false);
    check('Try again opens the room once the board is back', opened && (await state(page)).inRoom, JSON.stringify(await state(page)));
    /* In a room of its own, the page asks before another room takes it
     * out of this one. */
    const own = (await state(page)).code;
    await pressKey(page, 'fly');
    await page.until(`${T} && window.__together().sheet === ''`, 10000);
    await until(() => keeper.s.inRoom, 10000);
    await page.evaluate("(() => { window.__ui.onRooms('freestyle'); return 1; })()");
    await sheetIs(page, 'lobby');
    await page.until(`document.querySelector('#tg [data-k="room-${room.code}"]') !== null`, 10000);
    await pressKey(page, `room-${room.code}`);
    await sheetIs(page, 'switch', 5000);
    const asks = await says(page);
    check('another room\'s card in a room asks before leaving it', asks.includes('takes you out of this room') && (await state(page)).inRoom, asks);
    check('with Stay under the focus', await page.evaluate("document.activeElement && document.activeElement.dataset.k === 'switch-stay'"));
    await wait(300);
    await shot('switch');
    await pressKey(page, 'switch-stay');
    const stayed = await state(page);
    check('Stay keeps the pilot in their room, on the shelf', stayed.sheet === 'lobby' && stayed.inRoom && stayed.code === own, JSON.stringify(stayed));
    await pressKey(page, `room-${room.code}`);
    await sheetIs(page, 'switch', 5000);
    await pressKey(page, 'switch-go');
    await sheetIs(page, 'cant', 10000);
    const left = await state(page);
    check('Leave and go leaves it for the other room, here still a kick away', !left.inRoom && (await says(page)).includes('five minutes'), JSON.stringify(left));
    /* The board's 404 for the made up code is the answer asked for. */
    endChecks(page, /status of 404 .*\/api\/rooms\/ZZZZZ2\)$/);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    if (board) board.kill('SIGCONT');
    keeper.s.leave();
    filler.s.leave();
    await page.close();
  }
}

async function sceneDrop() {
  console.log('\ndrop: the board lost and found, and a room lost while away');
  const keeper = bot('Night Owl', 151);
  const room = await hostRoom(keeper, {
    name: 'Late session', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50,
  });
  const u = new URL(roomUrl('http://127.0.0.1/index.html', room, { invite: keeper.s.invite }));
  u.searchParams.set('board', boardOrigin);
  const page = await open(`${u.pathname}${u.search}${u.hash}`, seedFor({ name: 'Drop Pilot', met: true }));
  const shot = shooter(page, 'drop');
  try {
    await sheetIs(page, 'join');
    await pressKey(page, 'join');
    await page.until(`${T} && window.__together().inRoom`, 15000);
    await page.until("window.__mode === 'flight'", 30000);
    await settled(page, '#tg .tg-banner');
    const hello = await unseen(page, '#tg .tg-banner');
    check('the welcome banner is one the pilot can see', hello === '', hello);
    const helloOn = await overlaps(page, '#tg .tg-banner', BANNER_CLEAR_OF);
    check('and it covers no instrument, the flight\'s line included', !helloOn, helloOn);
    const pageId = (await state(page)).you;
    /* A new look from the room's page reaches the room. */
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    await pressKey(page, 'look');
    await sheetIs(page, 'editor');
    await pressKey(page, 'tab-Hair');
    const hair = await page.evaluate("JSON.parse(localStorage.getItem('webfpv.together.v1')).avatar.hair === 2 ? 3 : 2");
    await pressKey(page, `hair-${hair}`);
    await pressKey(page, 'done');
    await sheetIs(page, 'room');
    const seen = await until(() => {
      const p = keeper.s.link.pilots.get(pageId);
      return Boolean(p && p.avatar.hair === hair);
    }, 4000);
    check('a new look from the room\'s page reaches the other pilots', seen);
    await page.tap('Escape');
    await page.until(`${T} && window.__together().sheet === ''`, 3000);
    await page.evaluate("(() => { window.__ui.act('resume'); return 1; })()");
    await page.until("window.__mode === 'flight' && window.__ui.screen === 'flight'", 10000);
    await wait(800);

    await killBoard();
    await page.until(`${T} && ['retrying', 'connecting'].includes(window.__together().link)`, 5000);
    await wait(150);
    const chip = await page.evaluate("(() => { const c = document.querySelector('#tg .roomchip'); return c && !c.hidden ? (c.querySelector('.bars.low') ? 'low' : 'shown') : 'hidden'; })()");
    check('while the board is gone the chip stays, its bars low', chip === 'low', chip);
    const lostSaid = await page.until(SEES('Lost the board for a moment'), 5000).then(() => true, () => false);
    check('and a banner says it is trying again', lostSaid);
    await settled(page, '#tg .tg-banner');
    const lostSeen = await unseen(page, '#tg .tg-banner');
    check('which the pilot can see', lostSeen === '', lostSeen);
    await page.tap('Digit1');
    await wait(150);
    check('a quick line meanwhile says it was not said, rather than nothing', await page.evaluate(SEES('Not said', '#tg .tg-toasts')), await toastText(page));
    await shot('reconnecting');
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-sheet'); return 1; })()");
    await wait(200);
    check('the room\'s page asked for meanwhile says to wait a moment', await page.evaluate(SEES('One moment', '#tg .tg-toasts')), await toastText(page));
    await page.evaluate("(() => { window.__ui.act('resume'); return 1; })()");

    await freshBoard();
    const back = await page.until(`${T} && window.__together().inRoom`, 15000).then(() => true, () => false);
    check('the board back: the page is back in from its ticket', back && (await state(page)).code === room.code, JSON.stringify(await state(page)));
    check('with a banner that says so', await page.until(SEES('Back in'), 3000).then(() => true, () => false));
    await settled(page, '#tg .tg-banner');
    const backSeen = await unseen(page, '#tg .tg-banner');
    check('which the pilot can see', backSeen === '', backSeen);
    const backOn = await overlaps(page, '#tg .tg-banner', BANNER_CLEAR_OF);
    check('and which covers nothing', !backOn, backOn);
    const stale = await toastText(page);
    check('and the toasts that said to wait are gone', !/getting back/i.test(stale), stale);
    await until(() => keeper.s.inRoom, 10000);
    await page.until(`${T} && window.__together().pilots === 2`, 10000).catch(() => {});
    check('and the other pilot is back beside it', (await state(page)).pilots === 2, JSON.stringify(await state(page)));
    const bars = await page.evaluate("Boolean(document.querySelector('#tg .roomchip .bars') && !document.querySelector('#tg .roomchip .bars.low'))");
    check('the bars full again', bars);
    await wait(300);
    await shot('back-in');

    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); return 1; })()");
    await page.evaluate("(() => { window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    /* A drop with the room's page open: the page stays, says so, and
     * its buttons wait for the board rather than doing nothing. */
    await killBoard();
    await page.until(`${T} && ['retrying', 'connecting'].includes(window.__together().link)`, 5000);
    const tagged = await page.until(SEES('Getting back in', '#tg .tg-modal'), 4000).then(() => true, () => false);
    check('a drop with the room\'s page open keeps the page, and its tags say so', tagged && (await state(page)).sheet === 'room', JSON.stringify(await state(page)));
    await pressKey(page, 'talk');
    check('and Talk says to wait a moment', await page.evaluate(SEES('One moment', '#tg .tg-toasts')) && (await state(page)).sheet === 'room', await toastText(page));
    await wait(200);
    await shot('page-in-drop');
    await freshBoard();
    await page.until(`${T} && window.__together().inRoom`, 15000);
    await wait(300);
    const untagged = await page.evaluate("!document.querySelector('#tg .tg-modal').textContent.includes('Getting back in')");
    check('back in, the page is drawn again without it', untagged && (await state(page)).sheet === 'room');
    /* A board with another secret cannot read the room's tickets: to the
     * page it is a room that closed while it was away. */
    await freshBoard({ secret: randomBytes(24).toString('hex') });
    const lost = await page.until(`${T} && !window.__together().inRoom && window.__together().link === ''`, 15000).then(() => true, () => false);
    check('a ticket the board cannot honour ends the room for the page', lost);
    check('it says so', await page.until(SEES('The room closed while you were away'), 3000).then(() => true, () => false));
    await wait(300);
    const st = await state(page);
    check('and the room\'s page closed with it', st.sheet === '', JSON.stringify(st));
    const rows = await pauseRows(page);
    check('the pause menu is a solo one again', !rows.includes('Room'), rows.join(', '));
    await shot('lost');
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    keeper.s.leave();
    await page.close();
  }
}

/*
 * The host's tools in the page's own hands, which no other scene puts
 * there: the room handed to the page, then a kick, a ban, a mute and an
 * unmute, quick lines faster than the board allows, and the room's size
 * from the settings.
 */
async function sceneTools() {
  console.log('\ntools: the host\'s tools in the page\'s hands');
  const first = bot('Kite Host', 211);
  const ann = bot('Rotor Ann', 223);
  const ben = bot('Prop Ben', 227);
  const room = await hostRoom(first, {
    name: 'Tool shed', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50, typedChat: true, max: 6,
  });
  await joinRoom(ann, room.code, first.s.invite);
  await joinRoom(ben, room.code, first.s.invite);
  const u = new URL(roomUrl('http://127.0.0.1/index.html', room, { invite: first.s.invite }));
  u.searchParams.set('board', boardOrigin);
  const page = await open(`${u.pathname}${u.search}${u.hash}`, seedFor({ name: 'Tool Pilot', met: true }));
  const shot = shooter(page, 'tools');
  const roomPage = async () => {
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
  };
  const toFlight = async () => {
    for (let i = 0; i < 4 && (await state(page)).sheet; i += 1) {
      await page.tap('Escape');
      await wait(150);
    }
    await page.evaluate("(() => { window.__ui.act('resume'); return 1; })()");
    await page.until("window.__mode === 'flight' && window.__ui.screen === 'flight'", 10000);
  };
  try {
    await sheetIs(page, 'join');
    await pressKey(page, 'join');
    await page.until(`${T} && window.__together().inRoom`, 15000);
    await page.until("window.__mode === 'flight'", 30000);
    await page.until(`${T} && window.__together().pilots === 4`, 8000).catch(() => {});
    const pageId = (await state(page)).you;
    await wait(4600);

    first.s.link.hostAction('makeHost', pageId);
    const made = await page.until(`${T} && window.__together().host === window.__together().you`, 5000).then(() => true, () => false);
    check('handed the room, the page is the host', made);
    check('and is told so, in words it can see', await page.until(SEES("You're the host now"), 3000).then(() => true, () => false));
    await settled(page, '#tg .tg-banner');
    const hostOn = await overlaps(page, '#tg .tg-banner', BANNER_CLEAR_OF);
    check('which cover nothing', !hostOn, hostOn);
    await shot('host-now');

    await roomPage();
    const annId = ann.s.you;
    const benId = ben.s.you;
    await pressKey(page, `pilot-${annId}`);
    await pressKey(page, `kick-${annId}`);
    await sheetIs(page, 'confirm');
    await shot('kick-confirm');
    await pressKey(page, 'yes');
    const annOut = await until(() => !ann.s.inRoom, 5000);
    check('Kick takes the pilot out', annOut, JSON.stringify(ann.heard.slice(-2).map((x) => x.name)));
    check('and the room page is the room again, three pilots', await page.until(`${T} && window.__together().sheet === 'room' && window.__together().pilots === 3`, 4000).then(() => true, () => false), JSON.stringify(await state(page)));
    check('and the pilots list on it says three', await page.until(SEES('3 of 6', '#tg .tg-modal'), 3000).then(() => true, () => false));

    await pressKey(page, `pilot-${benId}`);
    await pressKey(page, `ban-${benId}`);
    await sheetIs(page, 'confirm');
    await pressKey(page, 'yes');
    check('Ban takes the pilot out', await until(() => !ben.s.inRoom, 5000));
    ben.heard.length = 0;
    ben.s.join(room.code, { invite: first.s.invite });
    await until(() => ben.heard.some((x) => x.name === 'refused' || x.name === 'closed'), 5000);
    const refusal = ben.heard.find((x) => x.name === 'refused' || x.name === 'closed');
    check('and the banned browser is refused at the door, invite or not', !ben.s.inRoom && Boolean(refusal), JSON.stringify(refusal && refusal.data));

    await pressKey(page, `pilot-${first.s.you}`);
    await pressKey(page, `mute-${first.s.you}`);
    await toFlight();
    first.s.say('gg');
    await wait(900);
    check('a muted pilot\'s line is not shown', !(await page.evaluate(SEES('GG!'))));
    await roomPage();
    await pressKey(page, `pilot-${first.s.you}`);
    await pressKey(page, `mute-${first.s.you}`);
    await toFlight();
    first.s.say('nice');
    check('unmuted, the next one is', await page.until(SEES('Nice line!'), 4000).then(() => true, () => false));

    /* Faster than the board allows: three lines, then one every two
     * seconds. A line the board refused was never said, so the page must
     * not show it as said. */
    await wait(2600);
    for (const k of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']) {
      await page.tap(k);
      await wait(60);
    }
    await wait(1200);
    const toast = await toastText(page);
    check('quick lines faster than the board allows are told to slow down', await page.evaluate(SEES('one line every two seconds', '#tg .tg-toasts')), toast);
    const heard = first.heard.filter((x) => x.name === 'say' && x.data.id === pageId).map((x) => x.data.line);
    const last = QUICK.find((q) => q.line === heard[heard.length - 1]);
    const box = await page.evaluate("(() => { const t = document.querySelector('#tg .talk'); return t && !t.hidden ? t.textContent : ''; })()");
    check('and the page\'s own last line is the last the room heard, not one it refused', heard.length > 0 && heard.length < 5 && last && box.includes(last.text) && !box.includes(QUICK[4].text),
      `room heard ${heard.join(', ')}; the page says "${box}"`);
    await shot('slow');

    await roomPage();
    await pressKey(page, 'settings');
    await sheetIs(page, 'roomSettings');
    for (let i = 0; i < 10; i += 1) await pressKey(page, 'fewer');
    const max = await page.evaluate("document.querySelector('#tg .stepper output').textContent");
    check('the room cannot be made smaller than the pilots in it', max === '2', max);
    await pressKey(page, 'save');
    check('and the smaller room reaches the others', await until(() => first.s.room && first.s.room.max === 2, 4000), String(first.s.room && first.s.room.max));
    await shot('settings');
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    for (const b of [first, ann, ben]) b.s.leave();
    await page.close();
  }
}

/*
 * A pilot who arrives while a race is on: not on the grid, not counted,
 * not false started, told what is happening, and in the next one.
 */
async function sceneLate() {
  console.log('\nlate: joining a room whose race is on');
  const bots = [bot('Early Bird', 307), bot('Slip Stream', 311)];
  const room = await hostRoom(bots[0], {
    name: 'Already going', way: '5inch', map: 'bardwell', mapName: "Bardwell's house", scale: 50,
  });
  await joinRoom(bots[1], room.code, bots[0].s.invite);
  bots[0].s.link.raceSend({ t: 'laps', n: 2 });
  for (const b of bots) b.s.link.raceSend({ t: 'ready', on: true });
  const live = await until(() => bots[0].s.link.race && bots[0].s.link.race.phase === 'live', 12000);
  const u = new URL(roomUrl('http://127.0.0.1/index.html', room, { invite: bots[0].s.invite }));
  u.searchParams.set('board', boardOrigin);
  const page = await open(`${u.pathname}${u.search}${u.hash}`, seedFor({ name: 'Late Pilot', met: true }));
  const shot = shooter(page, 'late');
  try {
    check('the room\'s race is on before the page arrives', live, JSON.stringify(bots[0].s.link.race && bots[0].s.link.race.phase));
    await sheetIs(page, 'join');
    await shot('join-card');
    await pressKey(page, 'join');
    await page.until(`${T} && window.__together().inRoom`, 15000);
    await page.until("window.__mode === 'flight'", 30000);
    await wait(1500);
    const st = await state(page);
    check('the page knows the race is on, and is not in it', st.race === 'live' && !st.racing, JSON.stringify(st));
    await shot('arrived');
    const pitShown = await page.evaluate("!document.querySelector('#tg .pit').hidden");
    const standShown = await page.evaluate("!document.querySelector('#tg .standings').hidden");
    check('it sees the race, not a pit for it', standShown && !pitShown, `pit ${pitShown}, standings ${standShown}`);
    check('and is told it is watching, and how to be in the next', await page.evaluate(SEES('One more to join next', '#tg .standings')));
    const panelsOn = await overlaps(page, '#tg .roomchip, #tg .standings, #tg .pit, #tg .tg-banner');
    check('and nothing of the room\'s covers the shell\'s instruments', !panelsOn, panelsOn);
    /* Flying about while the others race is not a false start. */
    const w = { code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 };
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...w }, page.sessionId);
    await wait(900);
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...w }, page.sessionId);
    await wait(400);
    const after = await page.evaluate('window.__mode');
    check('flying meanwhile is not a false start', after === 'flight' && !(await page.evaluate(SEES('False start', '#tg .tg-toasts'))), await toastText(page));
    await wait(1800);
    for (const b of bots) b.s.link.raceSend({ t: 'lap', n: 1, ms: 1800 });
    await wait(1700);
    for (const b of bots) b.s.link.raceSend({ t: 'lap', n: 2, ms: 1700 });
    const results = await page.until(`${T} && window.__together().race === 'results'`, 8000).then(() => true, () => false);
    check('the page sees the results', results, JSON.stringify(await state(page)));
    await wait(600);
    await shot('results');
    /* Two of three is a majority, so the countdown starts on the bots'
     * votes and the page's comes a moment after: it must still count. */
    for (const b of bots) b.s.link.raceSend({ t: 'again' });
    await page.until(`${T} && window.__together().race === 'count'`, 8000).catch(() => {});
    check('the others\' votes start the next without the page', !(await state(page)).racing, JSON.stringify(await state(page)));
    check('which is offered it, under the standings', await page.evaluate(SEES('G to join before GO', '#tg .standings')));
    await shot('offered');
    await page.tap('KeyG');
    const next = await page.until(`${T} && window.__together().racing`, 3000).then(() => true, () => false);
    check('and G a moment after the majority still puts it in the next race', next, JSON.stringify(await state(page)));
    check('on the grid', await page.evaluate(SEES('On the grid', '#tg .tg-toasts')), await toastText(page));
    await shot('next');
    /* A countdown somebody starts with Start, the page not ready: the race
     * page offers Join the race while there is time. */
    await page.until(`${T} && window.__together().race === 'live'`, 8000).catch(() => {});
    for (const b of bots) b.s.link.raceSend({ t: 'dnf' });
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); return 1; })()");
    await page.evaluate("(() => { window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    await pressKey(page, 'race');
    await sheetIs(page, 'race');
    await pressKey(page, 'dnf');
    await page.until(`${T} && window.__together().race === 'results'`, 8000).catch(() => {});
    bots[0].s.link.raceSend({ t: 'pit' });
    await page.until(`${T} && window.__together().race === 'pit'`, 8000).catch(() => {});
    bots[0].s.link.raceSend({ t: 'start' });
    await page.until(`${T} && window.__together().race === 'count'`, 8000).catch(() => {});
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); return 1; })()");
    await page.evaluate("(() => { window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    await pressKey(page, 'race');
    await sheetIs(page, 'race');
    const offered = await page.evaluate(SEES('Join the race'));
    check('a countdown started without the page offers Join the race on its page', offered);
    await shot('join-race');
    await pressKey(page, 'join-race');
    const joined = await page.until(`${T} && window.__together().racing && window.__ui.screen === 'flight'`, 4000).then(() => true, () => false);
    check('which puts it on the grid and back in the flight', joined, JSON.stringify(await state(page)));
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    for (const b of bots) b.s.leave();
    await page.close();
  }
}

/*
 * The window changing size under a room, and the same pilot opening the
 * room again in a second tab: the browser key is the same, so the board
 * takes the new tab and closes the old one, which must say why and must
 * not take the room back by itself.
 */
async function sceneTabs() {
  console.log('\ntabs: a resized window, and a second tab');
  const hostBot = bot('Tab Host', 401);
  const room = await hostRoom(hostBot, {
    name: 'Two windows', way: 'freestyle', map: 'bardwell', mapName: "Bardwell's house", scale: 50,
  });
  const u = new URL(roomUrl('http://127.0.0.1/index.html', room, { invite: hostBot.s.invite }));
  u.searchParams.set('board', boardOrigin);
  const page = await open(`${u.pathname}${u.search}${u.hash}`, seedFor({ name: 'Tab Pilot', met: true }));
  const shot = shooter(page, 'tabs');
  const size = (w, hgt) => page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w, height: hgt, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  let twin = null;
  try {
    await sheetIs(page, 'join');
    await pressKey(page, 'join');
    await page.until(`${T} && window.__together().inRoom`, 15000);
    await page.until("window.__mode === 'flight'", 30000);
    for (const [w, hgt] of [[1024, 600], [800, 520], [1600, 900]]) {
      await size(w, hgt);
      await wait(700);
      const on = await overlaps(page, '#tg .roomchip, #tg .roster, #tg .tg-banner');
      check(`at ${w} by ${hgt}, nothing of the room's covers the shell's instruments`, !on, on);
      /* The welcome is up for the first two sizes and may have gone by the
       * last: wide enough to read, not a word a line. It was 104 px wide at
       * 800 by 520, squeezed between two copies of the right hand column. */
      const bw = await page.evaluate("(() => { const b = document.querySelector('#tg .tg-banner'); return b ? Math.round(b.getBoundingClientRect().width) : 0; })()");
      check(`and the welcome is wide enough to read (${bw} px)`, bw >= 300 || (bw === 0 && w === 1600), String(bw));
      const bannerOn = await overlaps(page, '#tg .tg-banner', BANNER_CLEAR_OF);
      check('and keeps off the room\'s own panels', !bannerOn, bannerOn);
      await shot(`flight-${w}x${hgt}`);
    }
    await size(800, 520);
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    await wait(500);
    const fits = await page.evaluate(`(() => {
      const top = [...document.querySelectorAll('#tg .sheet')].filter((e) => e.getBoundingClientRect().width > 0).pop();
      if (!top) return 'no sheet';
      const bad = [...top.querySelectorAll('button')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && (r.bottom > innerHeight || r.right > innerWidth || r.left < 0);
      });
      if (!bad.length) return '';
      let p = bad[0].parentElement;
      for (; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return '';
      }
      return bad.map((b) => b.textContent.trim()).join(', ') + ' off the window, with nothing to scroll';
    })()`);
    check('at 800 by 520 the room\'s page fits, or scrolls to what does not', !fits, fits);
    await shot('room-800x520');
    await size(opts.w, opts.h);
    await page.tap('Escape');
    await wait(200);
    await page.evaluate("(() => { window.__ui.act('resume'); return 1; })()");
    await page.until("window.__mode === 'flight' && window.__ui.screen === 'flight'", 10000).catch(() => {});

    const key = await page.evaluate("localStorage.getItem('webfpv.rater.v1')");
    check('the page has its browser key', /^[a-f0-9]{32}$/.test(key || ''), key);
    twin = { handle: 'Tab Pilot', heard: [] };
    twin.s = new RoomSession({
      url: wsUrl, key, handle: 'Tab Pilot', avatar: {}, onEvent: (name, data) => twin.heard.push({ name, data }),
    });
    await joinRoom(twin, room.code, hostBot.s.invite);
    const out = await page.until(`${T} && !window.__together().inRoom`, 6000).then(() => true, () => false);
    check('the same pilot in a second tab takes this one out of the room', out, JSON.stringify(await state(page)));
    check('which says why, in words it can see', await page.until(SEES('from another tab or window'), 3000).then(() => true, () => false));
    await wait(400);
    await shot('replaced');
    check('the host sees one of them, not two', hostBot.s.link.pilots.size === 2, String(hostBot.s.link.pilots.size));
    await wait(3500);
    check('and this tab does not take the room back by itself', twin.s.inRoom && !(await state(page)).inRoom);
    await pressKey(page, 'solo');
    await page.until(`${T} && window.__together().sheet === ''`, 4000).catch(() => {});
    const chip = await page.evaluate("document.querySelector('#tg .roomchip').hidden");
    check('Fly solo leaves no room chip behind', chip);
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    if (twin) twin.s.leave();
    hostBot.s.leave();
    await page.close();
  }
}

/*
 * A streamer room: the page hosts one from the host sheet, and a crowd of
 * viewers comes in by the code and flies in front of it. Bigger than any
 * other room, so the craft and the name tags must be built for it.
 */
async function sceneStream() {
  console.log('\nstream: a streamer room and its crowd');
  const page = await open(`/index.html?mp=1&board=${encodeURIComponent(boardOrigin)}&map=bardwell&craft=5inch`, seedFor({ met: true, name: 'Stream Host' }));
  const shot = shooter(page, 'stream');
  const crowd = [];
  let flying = null;
  const N = 47;
  try {
    await page.evaluate("(() => { window.__ui.show('freestyle'); return 1; })()");
    await page.until("document.querySelector('.wp-rooms') !== null", 30000);
    await page.evaluate("(() => { window.__ui.picker.select('map:bardwell'); return 1; })()");
    await wait(200);
    await page.evaluate("(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Fly together').click(); return 1; })()");
    await sheetIs(page, 'host');
    await pressKey(page, 'streamer');
    await wait(200);
    const form = () => page.evaluate(`(() => ({
      max: document.querySelector('#tg .stepper output').textContent,
      listed: document.querySelector('#tg [data-k="listed"]').getAttribute('aria-checked'),
      chat: document.querySelector('#tg [data-k="sw-typedChat"]').getAttribute('aria-checked'),
      chatLocked: document.querySelector('#tg [data-k="sw-typedChat"]').getAttribute('aria-disabled'),
    }))()`);
    const f1 = await form();
    check('Streamer room makes the room 64, off the shelf, preset lines only',
      f1.max === '64' && f1.listed === 'false' && f1.chat === 'false' && f1.chatLocked === 'true', JSON.stringify(f1));
    const nameNow = () => page.evaluate("document.querySelector('#tg-rname').value");
    check('and takes the pilot\'s own name out of the room\'s, where everybody has a made up one', await nameNow() === '', await nameNow());
    await pressKey(page, 'more');
    check('and no bigger', (await form()).max === '64');
    if (opts.w >= 1280 && opts.h >= 720) {
      const off = await offSheet(page);
      check('at 1280 by 720 the host sheet shows every control without scrolling', !off, off);
    }
    await shot('host-sheet');
    await pressKey(page, 'listed');
    const f2 = await form();
    check('Listed under Rooms turns it back into an ordinary room of at most 30', f2.max === '30' && f2.listed === 'true', JSON.stringify(f2));
    const one = await page.evaluate("[...document.querySelectorAll('#tg [role=radiogroup] [aria-checked=true]')].length");
    check('one of the three at a time', one === 1, String(one));
    check('as a listed room does', await nameNow() === '', await nameNow());
    await pressKey(page, 'private');
    check('which comes back in an ordinary room', await nameNow() === "Stream Host's room", await nameNow());
    await pressKey(page, 'streamer');
    check('and Streamer room back again', (await form()).max === '64' && await nameNow() === '');
    await pressKey(page, 'open');
    await sheetIs(page, 'share');
    const st = await state(page);
    await pressKey(page, 'fly');
    await page.until("window.__mode === 'flight'", 30000);
    await page.until(`${T} && window.__together().sheet === ''`, 10000);

    for (let i = 0; i < N; i += 1) {
      const b = bot(`Viewer ${i + 1}`, 500 + i * 7);
      crowd.push(b);
      b.s.join(st.code, {});
    }
    await until(() => crowd.every((b) => b.s.inRoom), 30000, 100);
    check(`${N} viewers join by the code`, crowd.every((b) => b.s.inRoom), String(crowd.filter((b) => b.s.inRoom).length));
    const room = crowd[0].s.room;
    check('a streamer room of 64, off the shelf, with made up names and preset lines',
      room.streamer === true && room.max === 64 && !room.listed && !room.ownNames && !room.typedChat && room.hide, JSON.stringify(room));
    check('named after the host\'s made up name, not their own', !room.name.includes('Stream Host'), room.name);
    await page.until(`${T} && window.__together().pilots === ${N + 1}`, 15000).catch(() => {});
    check(`the page sees all ${N + 1} pilots`, (await state(page)).pilots === N + 1, JSON.stringify(await state(page)));

    const me = (await state(page)).you;
    let c = null;
    await until(() => {
      crowd[0].s.eachRemote((id, pose) => { if (id === me) c = { ...pose }; });
      return Boolean(c);
    }, 10000, 100);
    check('the host\'s pose reaches the viewers', Boolean(c));
    let fx = -2 * (c.qx * c.qz + c.qw * c.qy);
    let fz = -(1 - 2 * (c.qx * c.qx + c.qy * c.qy));
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl;
    fz /= fl;
    const t0 = performance.now();
    let huddle = false;
    /* A grandstand of viewers in front of the host, rows going back. In a
     * huddle, the first ten crowd round the host, as a room starts. */
    flying = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      crowd.forEach((b, k) => {
        if (huddle && k < 10) {
          const a = (k / 10) * Math.PI * 2;
          b.s.uplink(c.px + Math.cos(a) * 1.4, c.py + 0.5, c.pz + Math.sin(a) * 1.4, 0, 0, 0, 1, true, 0);
          return;
        }
        const row = Math.floor(k / 12);
        const side = (k % 12) - 5.5;
        const d = 5 + row * 2.5;
        const px = c.px + fx * d - fz * side * 0.9;
        const pz = c.pz + fz * d + fx * side * 0.9;
        b.s.uplink(px, c.py + 0.8 + row * 0.6 + Math.sin(t * 2 + k) * 0.08, pz, 0, 0, 0, 1, true, 0);
      });
    }, 1000 / 30);
    const drawn = await page.until(`window.__roomCraft && window.__roomCraft() && window.__roomCraft().drawn === ${N}`, 15000).then(() => true, () => false);
    const rc = await page.evaluate('window.__roomCraft && window.__roomCraft()');
    check(`the page draws all ${N} of them, on craft built for 64`, drawn && rc.size === 64, JSON.stringify(rc));
    await wait(800);
    await shot('crowd');
    const rc2 = await page.evaluate('window.__roomCraft()');
    check(`name tags on the nearest ${rc2.most}, not all ${N}`, rc2.most > 0 && rc2.tagged === rc2.most, JSON.stringify(rc2));
    huddle = true;
    const hi = await page.until("document.querySelector('#tg .hello') !== null", 6000).then(() => true, () => false);
    check('ten pilots round the host: a hello', hi);
    await wait(1200);
    huddle = false;
    await page.until("document.querySelector('#tg .hello') === null", 5000).catch(() => {});
    await wait(1500);
    const stale = await page.evaluate("(() => { const e = document.querySelector('#tg .hello .plate'); return e ? e.textContent : ''; })()");
    check('and once they have flown off, none for the rest of the queue', !stale, stale);
    await page.tap('Tab');
    await wait(500);
    const rosterOn = await overlaps(page, '#tg .roomchip, #tg .roster');
    check('the pilots list of 48 covers none of the shell\'s instruments', !rosterOn, rosterOn);
    const scrolls = await page.evaluate("(() => { const r = document.querySelector('#tg .roster'); return r.scrollHeight > r.clientHeight && getComputedStyle(r).overflowY === 'auto'; })()");
    check('and scrolls', scrolls);
    await shot('roster');
    await page.tap('Tab');
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    await wait(400);
    check('the room\'s page says Streamer room', await page.evaluate(SEES('Streamer room')));
    await shot('room-page');
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    clearInterval(flying);
    for (const b of crowd) b.s.leave();
    await page.close();
  }
}

/*
 * Stream names: a streamer gives the room their stream, a viewer types a
 * code in its chat and flies under their name, the host takes one back,
 * and YouTube does the same. Twitch and YouTube are this script's stand
 * ins, so this is the board reading a chat for real, end to end.
 */
async function sceneNames() {
  console.log('\nnames: Twitch and YouTube names in a streamer room');
  const page = await open(`/index.html?mp=1&board=${encodeURIComponent(boardOrigin)}&map=bardwell&craft=5inch`, seedFor({ met: true, name: 'Stream Host' }));
  const shot = shooter(page, 'names');
  const viewers = [];
  try {
    await page.evaluate("(() => { window.__ui.show('freestyle'); return 1; })()");
    await page.until("document.querySelector('.wp-rooms') !== null", 30000);
    await page.evaluate("(() => { window.__ui.picker.select('map:bardwell'); return 1; })()");
    await wait(200);
    await page.evaluate("(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Fly together').click(); return 1; })()");
    await sheetIs(page, 'host');
    await pressKey(page, 'streamer');
    /* A small streamer room: its craft is still built for 64, so a host
     * who raises the size later does not rebuild everybody's craft. */
    await page.evaluate("(() => { for (let i = 0; i < 54; i += 1) document.querySelector('#tg [data-k=\"fewer\"]').click(); return 1; })()");
    await pressKey(page, 'open');
    await sheetIs(page, 'share');
    check('the invite page asks a streamer for their stream', await page.evaluate("document.querySelector('#tg-st') !== null"));
    const typeStream = (sel, text) => page.evaluate(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input')); return 1; })()`);
    await typeStream('#tg-st', 'https://www.youtube.com/@AndAgainFPV');
    await pressKey(page, 'stream-go');
    await page.until("document.querySelector('#tg-st.bad') !== null", 5000).catch(() => {});
    check('a YouTube channel page is refused, saying why', await page.evaluate(SEES('A channel page does not say which stream')));
    await typeStream('#tg-st', 'twitch.tv/AndAgainFPV');
    await pressKey(page, 'stream-go');
    await page.until(`${T} && window.__together().stream === 'twitch:andagainfpv'`, 5000).catch(() => {});
    const t1 = await toastText(page);
    check('a Twitch page is taken, and the host told', /fly as their Twitch name/.test(t1), t1);
    await wait(300);
    check('the invite page says where viewers type the code', await page.evaluate(SEES('the chat on twitch.tv/andagainfpv')));
    if (opts.w >= 1280 && opts.h >= 720) {
      const off = await offSheet(page);
      check('at 1280 by 720 the invite page shows every control without scrolling', !off, off);
    }
    await shot('invite-stream');
    const st = await state(page);
    await pressKey(page, 'fly');
    await page.until("window.__mode === 'flight'", 30000);
    await page.until(`${T} && window.__together().sheet === ''`, 10000);

    await page.until('window.__roomCraft && window.__roomCraft()', 10000).catch(() => {});
    const craft1 = await page.evaluate('window.__roomCraft && window.__roomCraft()');
    check('a streamer room of 10 builds its craft for 64 all the same', st.max === 10 && craft1 && craft1.size === 64, `${st.max} ${JSON.stringify(craft1)}`);

    const card = await (await fetch(`${boardOrigin}/api/rooms/${st.code}`)).json();
    check('the room\'s card says a viewer can fly as their Twitch name', card.streamVia === 'twitch', JSON.stringify(card));

    /* A viewer proves their name. */
    const v = bot('Viewer', 901);
    viewers.push(v);
    await joinRoom(v, st.code);
    const madeUp = v.s.link.pilots.get(v.s.you).handle;
    v.s.claim();
    await until(() => v.heard.some((x) => x.name === 'claim' && x.data.state === 'waiting'), 5000);
    const asked = v.heard.find((x) => x.name === 'claim' && x.data.state === 'waiting').data;
    await until(() => irc.joined.has('andagainfpv'), 5000);
    check('asking for a name has the board read the channel\'s chat, and only then', irc.joined.has('andagainfpv'));
    ircSay('andagainfpv', '4242', 'SkittlesFPV', `!fly ${asked.code}`);
    await until(() => v.heard.some((x) => x.name === 'claim' && x.data.state === 'done'), 5000);
    check('the code typed in chat names the viewer', v.s.link.pilots.get(v.s.you).handle === 'SkittlesFPV', v.s.link.pilots.get(v.s.you).handle);
    await until(() => !irc.joined.has('andagainfpv'), 5000);
    check('and the board stops reading the chat', !irc.joined.has('andagainfpv'));
    await page.until(`${T} && window.__together().pilots >= 2`, 5000).catch(() => {});
    const t0 = performance.now();
    const fly = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      v.s.uplink(2 + Math.sin(t) * 0.2, 1.4, -4, 0, 0, 0, 1, true, 0);
    }, 1000 / 30);
    try {
      await page.until("window.__roomCraft && window.__roomCraft() && window.__roomCraft().drawn === 1", 10000).catch(() => {});
      await page.tap('Tab');
      await wait(400);
      check('the in flight list shows the Twitch name', await page.evaluate(SEES('SkittlesFPV', '#tg .roster')));
      await shot('flying-named');
      await page.tap('Tab');
    } finally {
      clearInterval(fly);
    }

    /* The host proves theirs, on the page. */
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    check('the room\'s page has the Twitch name button and tag', await page.evaluate("document.querySelector('#tg [data-k=\"claim\"]') !== null")
      && await page.evaluate(SEES('Twitch names')));
    check('and says which pilot flies under their Twitch name', await page.evaluate(SEES('Twitch name', '#tg .pane')));
    await pressKey(page, 'claim');
    await sheetIs(page, 'claim');
    await page.until("document.querySelector('#tg .code-big.claim') !== null", 5000);
    const code = await page.evaluate("document.querySelector('#tg .code-big.claim').getAttribute('aria-label').replace('!fly ', '')");
    check('the page shows the code to type, and where', /^[A-HJ-NP-Z2-9]{5}$/.test(code) && await page.evaluate(SEES('the chat on twitch.tv/andagainfpv')), code);
    if (opts.w >= 1280 && opts.h >= 720) {
      const off = await offSheet(page);
      check('at 1280 by 720 the code page shows every control', !off, off);
    }
    await shot('claim-waiting');
    await until(() => irc.joined.has('andagainfpv'), 5000);
    ircSay('andagainfpv', '1001', 'AndAgainFPV', `gg !fly ${code}`);
    await page.until(`document.querySelector('#tg') && ${SEES("THAT'S YOU")}`, 5000).catch(() => {});
    check('once it lands, the page says so', await page.evaluate(SEES('You are flying as AndAgainFPV')));
    await shot('claim-done');
    await pressKey(page, 'back');
    await sheetIs(page, 'room');

    /* The host gives the viewer their made up name back. */
    await pressKey(page, `pilot-${v.s.you}`);
    await pressKey(page, `un-${v.s.you}`);
    await sheetIs(page, 'confirm');
    await shot('confirm-unname');
    await pressKey(page, 'yes');
    await until(() => v.s.link.pilots.get(v.s.you).handle === madeUp, 5000);
    check('the host puts the viewer\'s made up name back', v.s.link.pilots.get(v.s.you).handle === madeUp, v.s.link.pilots.get(v.s.you).handle);
    check('and the viewer is told', v.heard.some((x) => x.name === 'claim' && x.data.state === 'dropped'));

    /* Room settings: a YouTube stream instead. */
    await pressKey(page, 'settings');
    await sheetIs(page, 'roomSettings');
    check('Room settings has the stream too', await page.evaluate("document.querySelector('#tg-st2').value") === 'twitch.tv/andagainfpv');
    await typeStream('#tg-st2', 'https://youtu.be/LIVEvideo01');
    await page.evaluate("(() => { for (let i = 0; i < 30; i += 1) document.querySelector('#tg [data-k=\"more\"]').click(); return 1; })()");
    if (opts.w >= 1280 && opts.h >= 720) {
      const off = await offSheet(page);
      check('at 1280 by 720 Room settings shows every control', !off, off);
    }
    await shot('settings-youtube');
    await pressKey(page, 'save');
    await sheetIs(page, 'room');
    await page.until(SEES('YouTube names'), 5000).catch(() => {});
    check('saving it makes them YouTube names, and takes the Twitch ones off', await page.evaluate(SEES('YouTube names'))
      && !(await page.evaluate(SEES('AndAgainFPV', '#tg .pane'))));
    await page.until(`${T} && window.__together().claim === 'moved'`, 5000).catch(() => {});
    check('and the host, whose own Twitch name went with it, is told why', (await state(page)).claim === 'moved', JSON.stringify(await state(page)));
    check('in words the host can see on the room\'s page, that say it can be proved again in the new chat', await page.evaluate(SEES('prove yours again in the new chat')));
    const craft2 = await page.evaluate('window.__roomCraft()');
    check('raising the room to 40 keeps the craft it had', (await state(page)).max === 40 && craft2.size === 64, `${(await state(page)).max} ${JSON.stringify(craft2)}`);
    const w = bot('Second Viewer', 902);
    viewers.push(w);
    await joinRoom(w, st.code);
    w.s.claim();
    await until(() => w.heard.some((x) => x.name === 'claim' && x.data.state === 'waiting'), 5000);
    const wc = w.heard.find((x) => x.name === 'claim' && x.data.state === 'waiting').data;
    yt.said.push({ snippet: { displayMessage: `!fly ${wc.code}` }, authorDetails: { channelId: 'UCdan', displayName: '@DanJudge' } });
    await until(() => w.heard.some((x) => x.name === 'claim' && x.data.state === 'done'), 15000);
    check('a viewer proves their YouTube name in its live chat', w.s.link.pilots.get(w.s.you).handle === 'DanJudge' && w.s.link.pilots.get(w.s.you).via === 'youtube',
      JSON.stringify(w.s.link.pilots.get(w.s.you)));

    /* A stream that is not live. */
    await pressKey(page, 'settings');
    await sheetIs(page, 'roomSettings');
    await typeStream('#tg-st2', 'https://youtu.be/DEADvideo01');
    await pressKey(page, 'save');
    await sheetIs(page, 'room');
    await wait(300);
    await pressKey(page, 'claim');
    await sheetIs(page, 'claim');
    await page.until(SEES('NOT LIVE?') + ' || ' + SEES('This works while the stream is live'), 8000).catch(() => {});
    check('a stream that is not live says so, with Try again', await page.evaluate(SEES('This works while the stream is live'))
      && await page.evaluate("document.querySelector('#tg [data-k=\"again\"]') !== null"));
    await shot('claim-not-live');
    await pressKey(page, 'back');

    /* A Twitch link with a typo: the viewer who asks is told, and so is
     * the host, who is the one who can fix it. */
    await sheetIs(page, 'room');
    await pressKey(page, 'settings');
    await sheetIs(page, 'roomSettings');
    await typeStream('#tg-st2', 'twitch.tv/nosuchchannel');
    await pressKey(page, 'save');
    await sheetIs(page, 'room');
    await wait(300);
    await pressKey(page, 'back');
    await wait(300);
    w.heard.length = 0;
    await wait(5100);
    w.s.claim();
    await until(() => w.heard.some((x) => x.name === 'claim' && x.data.state !== 'waiting'), 8000);
    check('a channel Twitch does not know tells the viewer who asked', w.heard.some((x) => x.name === 'claim' && x.data.state === 'noChannel'),
      JSON.stringify(w.heard.filter((x) => x.name === 'claim').map((x) => x.data.state)));
    await page.until(SEES('Twitch does not know twitch.tv/nosuchchannel'), 5000).catch(() => {});
    check('and the host, who can fix the link', await page.evaluate(SEES('Twitch does not know twitch.tv/nosuchchannel')));
    await shot('host-no-channel');

    /* The stream taken away altogether: a proved name goes, and the
     * words do not send anybody looking for a chat that is not there. */
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-sheet'); return 1; })()");
    await sheetIs(page, 'room');
    await pressKey(page, 'settings');
    await sheetIs(page, 'roomSettings');
    await typeStream('#tg-st2', 'twitch.tv/andagainfpv');
    await pressKey(page, 'save');
    await sheetIs(page, 'room');
    await wait(5100);
    await pressKey(page, 'claim');
    await sheetIs(page, 'claim');
    await page.until("document.querySelector('#tg .code-big.claim') !== null", 5000);
    const code2 = await page.evaluate("document.querySelector('#tg .code-big.claim').getAttribute('aria-label').replace('!fly ', '')");
    await until(() => irc.joined.has('andagainfpv'), 5000);
    ircSay('andagainfpv', '1001', 'AndAgainFPV', `!fly ${code2}`);
    await page.until(SEES('You are flying as AndAgainFPV'), 5000).catch(() => {});
    await pressKey(page, 'back');
    await sheetIs(page, 'room');
    await pressKey(page, 'settings');
    await sheetIs(page, 'roomSettings');
    await typeStream('#tg-st2', '');
    await pressKey(page, 'save');
    await sheetIs(page, 'room');
    await page.until(`${T} && window.__together().claim === 'moved'`, 5000).catch(() => {});
    check('a stream taken away puts the host\'s made up name back and says the room reads no stream now',
      (await state(page)).claim === 'moved' && await page.evaluate(SEES('This room reads no stream now'))
      && !(await page.evaluate(SEES('prove yours again'))), JSON.stringify(await state(page)));
    await shot('stream-taken-away');
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    for (const b of viewers) b.s.leave();
    await page.close();
  }
}

/*
 * Where the keyboard's focus is: the data-k of the control, '' for one
 * without, and whether it is inside the room's layer and its keyboard.
 */
const focusOf = (page) => page.evaluate(`(() => {
  const a = document.activeElement;
  const tg = document.querySelector('#tg');
  return {
    k: a && a.dataset ? (a.dataset.k || a.id || a.textContent.trim().slice(0, 12)) : '',
    inTg: Boolean(a && tg && tg.contains(a) && a !== tg),
    inOsk: Boolean(a && a.closest && a.closest('#tg .osk')),
    tag: a ? a.tagName : '',
  };
})()`);
/* A key with the focus nowhere, as after a click on the scrim: the window
 * hears it, not the sheet. */
async function tapLoose(page, code) {
  await page.evaluate('(() => { if (document.activeElement) document.activeElement.blur(); return 1; })()');
  await page.tap(code);
  await wait(150);
}
/* A pad the page can read, with every button up, put in after boot so the
 * flight never meets it. */
const PAD_ON = `(() => {
  window.__pad = {
    index: 0, id: 'Shots pad (Vendor: 045e Product: 028e)', connected: true, mapping: 'standard', timestamp: 1,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  navigator.getGamepads = () => [window.__pad, null, null, null];
  return 1;
})()`;
const PAD_OFF = '(() => { navigator.getGamepads = () => [null, null, null, null]; return 1; })()';
/* Held until what it should do is done, as a thumb is: on this machine's
 * software renderer a frame can take a fifth of a second, longer than a
 * quick press, and a press no frame saw was never made. */
async function padPress(page, button, done) {
  await page.evaluate(`(() => { const b = window.__pad.buttons[${button}]; b.pressed = true; b.value = 1; window.__pad.timestamp += 1; return 1; })()`);
  await page.until(done, 3000).catch(() => {});
  await page.evaluate(`(() => { const b = window.__pad.buttons[${button}]; b.pressed = false; b.value = 0; window.__pad.timestamp += 1; return 1; })()`);
  await wait(400);
}
const avatarOf = (page) => page.evaluate("(() => { try { return JSON.parse(localStorage.getItem('webfpv.together.v1')).avatar; } catch (e) { return null; } })()");

/*
 * The sheets without a mouse: the arrows, Tab that stays in the sheet,
 * Enter, Space and Escape, the keys a window hears when the focus is
 * nowhere, a pad's buttons, the game's own keyboard for a pad in a text
 * field, and Steam's keyboard in the desktop game. Then the sheets no
 * other scene opens: meeting your avatar properly, the look editor's
 * colours, the tags, how rooms keep you safe, Copy, the pause menu's room
 * rows, and the picker's Rooms tab by the keys.
 */
async function sceneKeys() {
  console.log('\nkeys: the sheets by keyboard and pad');
  const page = await open(`/index.html?mp=1&board=${encodeURIComponent(boardOrigin)}&map=bardwell&craft=5inch`, seedFor({ name: 'Keys Pilot' }));
  const shot = shooter(page, 'keys');
  try {
    await page.evaluate("(() => { window.__ui.show('freestyle'); return 1; })()");
    await page.until("document.querySelector('.wp-rooms') !== null", 30000);
    await page.evaluate("(() => { window.__ui.picker.select('map:bardwell'); return 1; })()");
    await wait(200);
    await page.evaluate("(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Fly together').click(); return 1; })()");
    await sheetIs(page, 'meet');
    await wait(300);

    /* Meeting your avatar: a new one, a face, a name. */
    const first = await avatarOf(page);
    await pressKey(page, 'roll');
    const rolled = await avatarOf(page);
    check('Roll again gives a new avatar, kept as it is made', rolled && JSON.stringify(rolled) !== JSON.stringify(first), JSON.stringify(rolled));
    await pressKey(page, 'expr-laugh');
    check('a face is tried on', await page.evaluate("document.querySelector('#tg [data-k=\"expr-laugh\"]').getAttribute('aria-pressed') === 'true'"));
    await page.evaluate("(() => { const i = document.querySelector('#tg-handle'); i.value = 'Keyboard Kid'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); return 1; })()");
    check('the name typed on the card is the pilot\'s name', (await page.evaluate("localStorage.getItem('webfpv.pilot.name')")) === 'Keyboard Kid');
    await page.evaluate("(() => { const i = document.querySelector('#tg-handle'); i.value = '!!'; i.dispatchEvent(new Event('input')); return 1; })()");
    check('one it cannot use is marked, and kept from the pilot', await page.evaluate("document.querySelector('#tg-handle').classList.contains('bad')")
      && (await page.evaluate("localStorage.getItem('webfpv.pilot.name')")) === 'Keyboard Kid');
    await page.evaluate("(() => { const i = document.querySelector('#tg-handle'); i.value = 'Keyboard Kid'; i.dispatchEvent(new Event('input')); return 1; })()");
    await shot('meet');

    /* The look editor's colours and quad, a face, and a new roll. */
    await pressKey(page, 'look');
    await sheetIs(page, 'editor');
    await pressKey(page, 'tab-Colours');
    await pressKey(page, 'skin-2');
    await pressKey(page, 'hairColour-3');
    await pressKey(page, 'eyeColour-1');
    await pressKey(page, 'tab-Quad');
    await pressKey(page, 'livery-4');
    await pressKey(page, 'ex-wow');
    const dressed = await avatarOf(page);
    check('skin, hair, eyes and livery are picked from their swatches', dressed && dressed.skin === 2 && dressed.hairColour === 3
      && dressed.eyeColour === 1 && dressed.livery === 5, JSON.stringify(dressed));
    await shot('editor-quad');
    await pressKey(page, 'reroll');
    check('and Roll again in the editor starts over', JSON.stringify(await avatarOf(page)) !== JSON.stringify(dressed));
    await pressKey(page, 'done');
    await sheetIs(page, 'meet');

    /* The keys inside a sheet. */
    await page.evaluate("(() => { document.querySelector('#tg [data-k=\"keep\"]').focus(); return 1; })()");
    await page.tap('ArrowRight');
    await wait(150);
    const right = await focusOf(page);
    check('Right moves the focus to the control beside it', right.inTg && right.k === 'roll', JSON.stringify(right));
    await page.tap('ArrowLeft');
    await wait(150);
    check('and Left back', (await focusOf(page)).k === 'keep');
    await page.tap('ArrowUp');
    await wait(150);
    check('Up leaves the row for the one above it', (await focusOf(page)).k !== 'keep' && (await focusOf(page)).inTg, JSON.stringify(await focusOf(page)));
    const stops = await page.evaluate("[...document.querySelector('#tg .tg-modal').querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex=\"0\"]')].filter((e) => e.offsetParent !== null).length");
    let strayed = '';
    for (let i = 0; i < stops + 3; i += 1) {
      await page.tap('Tab');
      await wait(60);
      const f = await focusOf(page);
      if (!f.inTg) strayed = JSON.stringify(f);
    }
    check(`Tab goes round the sheet's ${stops} controls and never out of it`, stops > 4 && !strayed, strayed);
    await page.evaluate("(() => { document.querySelector('#tg [data-k=\"keep\"]').focus(); return 1; })()");
    const shiftTab = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 };
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...shiftTab }, page.sessionId);
    await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...shiftTab }, page.sessionId);
    await wait(100);
    check('and Shift Tab goes the other way', (await focusOf(page)).inTg && (await focusOf(page)).k !== 'keep');
    await page.evaluate("(() => { document.querySelector('#tg [data-k=\"expr-calm\"]').focus(); return 1; })()");
    await page.tap('Space');
    await wait(150);
    check('Space presses the button with the focus', await page.evaluate("document.querySelector('#tg [data-k=\"expr-calm\"]').getAttribute('aria-pressed') === 'true'"));
    await page.evaluate("(() => { document.querySelector('#tg [data-k=\"keep\"]').focus(); return 1; })()");
    await page.tap('Enter');
    check('Enter on Keep goes on to the host sheet', await sheetIs(page, 'host', 5000).then(() => true, () => false));

    /* Tags: three at most, the newest kept. */
    for (const t of ['chill', 'club', 'beginners', 'racing']) await pressKey(page, `tag-${t}`);
    const tags = await page.evaluate("[...document.querySelectorAll('#tg [data-k^=\"tag-\"]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.k)");
    check('a room takes three tags at most, the oldest going', tags.length === 3 && !tags.includes('tag-chill'), tags.join());
    await pressKey(page, 'tag-racing');
    check('and a pressed tag comes off again', !(await page.evaluate("document.querySelector('#tg [data-k=\"tag-racing\"]').getAttribute('aria-pressed') === 'true'")));
    await shot('host-tags');
    await page.evaluate("(() => { document.querySelector('#tg [data-k=\"open\"]').focus(); return 1; })()");
    await page.tap('Escape');
    check('Escape takes the sheet down', await sheetIs(page, '', 5000).then(() => true, () => false));

    /* The window's keys, with the focus on nothing: the scrim was clicked. */
    await page.evaluate("(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Fly together').click(); return 1; })()");
    await sheetIs(page, 'host');
    await tapLoose(page, 'ArrowDown');
    check('with the focus lost, an arrow puts it back on the sheet', (await focusOf(page)).inTg, JSON.stringify(await focusOf(page)));
    await tapLoose(page, 'KeyS');
    check('and so does S, the arrows\' other hand', (await focusOf(page)).inTg);
    await tapLoose(page, 'Tab');
    check('and Tab, which never reaches the page behind', (await focusOf(page)).inTg);
    await tapLoose(page, 'Enter');
    await wait(300);
    check('Enter with nothing chosen chooses the first control and presses nothing', (await focusOf(page)).inTg && (await state(page)).sheet === 'host',
      `${JSON.stringify(await focusOf(page))} ${(await state(page)).sheet}`);
    await tapLoose(page, 'Escape');
    check('and Escape still goes back', await sheetIs(page, '', 5000).then(() => true, () => false));

    /* A pad: its select on a text field opens the game's own keyboard. */
    await page.evaluate("(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Fly together').click(); return 1; })()");
    await sheetIs(page, 'host');
    await page.evaluate(PAD_ON);
    await wait(400);
    await page.evaluate("(() => { const i = document.querySelector('#tg-rname'); i.value = ''; i.dispatchEvent(new Event('input')); i.focus(); return 1; })()");
    await padPress(page, 0, "document.querySelector('#tg .osk') !== null");
    const osk = await page.until("document.querySelector('#tg .osk') !== null", 3000).then(() => true, () => false);
    check('a pad\'s select on a text field opens the game\'s own keyboard', osk && (await focusOf(page)).inOsk, JSON.stringify(await focusOf(page)));
    await shot('osk');
    await padPress(page, 0, "document.querySelector('#tg-rname').value === '1'");
    const typed = await page.evaluate("document.querySelector('#tg-rname').value");
    check('and select on a key types it', typed === '1', typed);
    await page.evaluate("(() => { [...document.querySelectorAll('#tg .osk button')].find((b) => b.textContent === 'W').focus(); return 1; })()");
    await padPress(page, 0, "document.querySelector('#tg-rname').value.length === 2");
    check('a letter goes in as a small one for a name', (await page.evaluate("document.querySelector('#tg-rname').value")) === '1w');
    let oskStray = '';
    for (let i = 0; i < 4; i += 1) {
      await page.tap('Tab');
      await wait(60);
      const f = await focusOf(page);
      if (!f.inOsk) oskStray = JSON.stringify(f);
    }
    check('Tab stays on the keyboard while it is up', !oskStray, oskStray);
    await page.evaluate("(() => { [...document.querySelectorAll('#tg .osk button')].find((b) => b.textContent === 'Delete').click(); return 1; })()");
    check('Delete takes the last letter off', (await page.evaluate("document.querySelector('#tg-rname').value")) === '1');
    await page.evaluate("(() => { [...document.querySelectorAll('#tg .osk button')].find((b) => b.textContent === 'Done').click(); return 1; })()");
    await wait(150);
    check('Done puts the keyboard away and the focus back in the field', !(await page.evaluate("document.querySelector('#tg .osk') !== null"))
      && (await focusOf(page)).k === 'rname', JSON.stringify(await focusOf(page)));
    await page.evaluate("(() => { document.querySelector('#tg [data-k=\"fewer\"]').focus(); return 1; })()");
    const was = await page.evaluate("document.querySelector('#tg .stepper output').textContent");
    await padPress(page, 0, `document.querySelector('#tg .stepper output').textContent !== '${was}'`);
    check('select on a button presses it', (await page.evaluate("document.querySelector('#tg .stepper output').textContent")) === String(Number(was) - 1));
    const behind = await page.evaluate('window.__ui.screen');
    await padPress(page, 1, `${T} && window.__together().sheet === ''`);
    check('and the pad\'s back takes the sheet down', await sheetIs(page, '', 5000).then(() => true, () => false));
    check('and only the sheet: the menu behind it stays where it was', (await page.evaluate('window.__ui.screen')) === behind,
      `${behind} became ${await page.evaluate('window.__ui.screen')}`);
    await page.evaluate(PAD_OFF);

    /* A key after the pad gives typing back to the keyboard: Enter in the
     * code field is the Join beside it, not the game's keyboard. */
    await page.evaluate("(() => { window.__ui.onRooms('freestyle'); return 1; })()");
    await sheetIs(page, 'lobby');
    check('the pad had the hands', (await state(page)).hands === 'pad', JSON.stringify(await state(page)));
    await tapLoose(page, 'ArrowDown');
    check('and a key takes them back', (await state(page)).hands === 'keys', JSON.stringify(await state(page)));
    await page.evaluate("(() => { const i = document.querySelector('#tg-code'); i.value = 'AB'; i.dispatchEvent(new Event('input')); i.focus(); return 1; })()");
    check('and keeps them', (await state(page)).hands === 'keys', JSON.stringify(await state(page)));
    await page.tap('Enter');
    await page.until(SEES('A code is six letters and numbers', '#tg .tg-toasts'), 3000).catch(() => {});
    const codeBad = await page.evaluate("document.querySelector('#tg-code').classList.contains('bad')");
    const oskUp = await page.evaluate("document.querySelector('#tg .osk') !== null");
    check('Enter in the code field joins, and a code that is not one says so', await page.evaluate(SEES('A code is six letters and numbers', '#tg .tg-toasts'))
      && codeBad && !oskUp, `${await toastText(page)} bad ${codeBad} keyboard ${oskUp}`);
    await pressKey(page, 'privacy');
    check('How rooms keep you safe opens from the shelf', await sheetIs(page, 'privacy', 5000).then(() => true, () => false)
      && await page.evaluate(SEES('Nobody joins you uninvited')) && await page.evaluate(SEES('That is the only chat ever stored')));
    await shot('privacy');
    const privacyOff = await offSheet(page);
    check('with all of it on screen', !privacyOff, privacyOff);
    await page.tap('Escape');
    check('and goes back to the shelf', await sheetIs(page, 'lobby', 5000).then(() => true, () => false));
    await page.tap('Escape');
    await sheetIs(page, '', 5000);

    /* Copy, when the browser lets the page write the clipboard and when
     * it does not. */
    await page.evaluate("(() => { window.__ui.show('freestyle'); return 1; })()");
    await page.until("document.querySelector('.wp-rooms') !== null", 30000);
    await page.evaluate("(() => { window.__ui.picker.select('map:bardwell'); return 1; })()");
    await wait(200);
    await page.evaluate("(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Fly together').click(); return 1; })()");
    await sheetIs(page, 'host');
    await pressKey(page, 'open');
    await sheetIs(page, 'share');
    await page.evaluate("(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } }); return 1; })()");
    await pressKey(page, 'copy');
    await wait(200);
    const link = await page.evaluate("document.querySelector('#tg input[aria-label=\"Room link\"]').value");
    check('Copy puts the room link on the clipboard and says so', (await page.evaluate('window.__copied')) === link
      && await page.evaluate(SEES('Link copied', '#tg .tg-toasts')), await toastText(page));
    await page.evaluate("(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); return 1; })()");
    await pressKey(page, 'copy');
    await wait(200);
    const sel = await page.evaluate(`(() => {
      const a = document.activeElement;
      return a && a.tagName === 'INPUT' ? { from: a.selectionStart, to: a.selectionEnd, n: a.value.length } : null;
    })()`);
    check('refused, it selects the words for the pilot to copy, and says so', sel && sel.from === 0 && sel.to === sel.n && sel.n > 0
      && await page.evaluate(SEES('Select the link and copy it', '#tg .tg-toasts')), JSON.stringify(sel));
    await shot('copy-refused');
    await page.evaluate("(() => { navigator.clipboard.writeText = () => { throw new Error('no clipboard here'); }; return 1; })()");
    await pressKey(page, 'copy');
    await wait(200);
    check('and a clipboard that throws is the same, not a crash', (await focusOf(page)).tag === 'INPUT');
    await pressKey(page, 'fly');
    await page.until("window.__mode === 'flight'", 30000);
    await page.until(`${T} && window.__together().sheet === ''`, 10000);

    /* The pause menu's room rows the other scenes do not press. */
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-invite'); return 1; })()");
    check('Invite on the pause menu is the invite sheet, with a way back', await sheetIs(page, 'share', 5000).then(() => true, () => false)
      && await page.evaluate("document.querySelector('#tg [data-k=\"back\"]') !== null"));
    await page.tap('Escape');
    await sheetIs(page, '', 5000);
    await page.evaluate("(() => { window.__ui.act('room-talk'); return 1; })()");
    check('Talk is the talk scene', await sheetIs(page, 'scene', 5000).then(() => true, () => false));
    await page.tap('Escape');
    await sheetIs(page, '', 5000);
    const code = (await state(page)).code;
    await page.evaluate("(() => { window.__ui.act('room-quit'); return 1; })()");
    await page.until(`${T} && !window.__together().inRoom`, 5000).catch(() => {});
    const gone = await (await fetch(`${boardOrigin}/api/rooms/${code}`)).status;
    check('Quit to title leaves the room, and the address with it', !(await state(page)).inRoom
      && !(await page.evaluate('location.href')).includes('room='), JSON.stringify(await state(page)));
    check('which the board knows', gone === 404 || gone === 200, String(gone));

    /* The picker's Rooms tab by the keys alone: up to the shelves, right
     * past the last one, and Enter. */
    await page.evaluate("(() => { window.__ui.show('freestyle'); return 1; })()");
    await page.until("document.querySelector('.wp-rooms') !== null", 30000);
    await wait(300);
    for (let i = 0; i < 4; i += 1) { await page.tap('ArrowUp'); await wait(120); }
    for (let i = 0; i < 6; i += 1) { await page.tap('ArrowRight'); await wait(120); }
    await shot('picker-rooms-key');
    check('Right past the last shelf is the Rooms tab', await page.evaluate("document.querySelector('.wp-rooms').classList.contains('is-focus')"));
    await page.tap('Enter');
    await wait(600);
    check('and Enter on it opens the shelf, and presses nothing on it', await sheetIs(page, 'lobby', 6000).then(() => true, () => false),
      `${JSON.stringify(await state(page))} ${await page.evaluate('window.__ui.screen')}`);
    await page.tap('Escape');
    await sheetIs(page, '', 5000);
    endChecks(page);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    await page.close();
  }

  /* The desktop game: Steam's keyboard for a pad in a name, never for a
   * password, and the game's own when Steam's says no. */
  const deck = await open(`/index.html?mp=1&edition=web&board=${encodeURIComponent(boardOrigin)}&map=bardwell&craft=5inch`, `${seedFor({ name: 'Deck Pilot', met: true })}
window.__kbAsked = [];
window.__kbAnswer = { ok: true, text: 'Deck room' };
window.webfpvDesktop = { steam: { keyboard: async (o) => { window.__kbAsked.push(o); return window.__kbAnswer; } } };`);
  const deckShot = shooter(deck, 'keys');
  try {
    await deck.evaluate("(() => { window.__ui.show('freestyle'); return 1; })()");
    await deck.until("document.querySelector('.wp-rooms') !== null", 30000);
    await deck.evaluate("(() => { window.__ui.picker.select('map:bardwell'); [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Fly together').click(); return 1; })()");
    await sheetIs(deck, 'host');
    await deck.evaluate(PAD_ON);
    await wait(400);
    await deck.evaluate("(() => { document.querySelector('#tg-rname').focus(); return 1; })()");
    await padPress(deck, 0, "window.__kbAsked.length === 1");
    await deck.until("document.querySelector('#tg-rname').value === 'Deck room'", 3000).catch(() => {});
    const asked = await deck.evaluate('window.__kbAsked');
    check('in the desktop game a pad in a name opens Steam\'s keyboard, and its words land in the field', asked.length === 1 && asked[0].max === 32
      && (await deck.evaluate("document.querySelector('#tg-rname').value")) === 'Deck room' && !(await deck.evaluate("document.querySelector('#tg .osk') !== null")), JSON.stringify(asked));
    await deck.evaluate("(() => { document.querySelector('#tg-pw').focus(); return 1; })()");
    await padPress(deck, 0, "document.querySelector('#tg .osk') !== null");
    await deck.until("document.querySelector('#tg .osk') !== null", 3000).catch(() => {});
    check('a password never goes to Steam\'s keyboard, which shows what is typed: the game\'s own opens', (await deck.evaluate('window.__kbAsked.length')) === 1
      && await deck.evaluate("document.querySelector('#tg .osk') !== null"), `${JSON.stringify(await deck.evaluate('window.__kbAsked'))} ${JSON.stringify(await focusOf(deck))}`);
    await deckShot('osk-password');
    await deck.evaluate("(() => { [...document.querySelectorAll('#tg .osk button')].find((b) => b.textContent === 'Done').click(); return 1; })()");
    await deck.evaluate("(() => { window.__kbAnswer = { ok: false }; document.querySelector('#tg-rname').focus(); return 1; })()");
    await padPress(deck, 0, "document.querySelector('#tg .osk') !== null");
    check('and when Steam\'s keyboard cannot open, the game\'s own does', (await deck.evaluate('window.__kbAsked.length')) === 2
      && await deck.until("document.querySelector('#tg .osk') !== null", 3000).then(() => true, () => false));
    await deck.evaluate(PAD_OFF);
    endChecks(deck);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await deckShot('failed').catch(() => {});
  } finally {
    await deck.close();
  }
}

try {
  if (wanted('host')) { await freshBoard(); await sceneHost(); }
  if (wanted('lobby')) { await freshBoard(); await sceneLobby(); }
  if (wanted('link')) { await freshBoard(); await sceneLink(); }
  if (wanted('race')) { await freshBoard(); await sceneRace(); }
  if (wanted('direct')) { await freshBoard(); await sceneDirect(); }
  if (wanted('steam')) { await freshBoard(); await sceneSteam(); }
  if (wanted('door')) { await freshBoard(); await sceneDoor(); }
  if (wanted('drop')) { await freshBoard(); await sceneDrop(); }
  if (wanted('tools')) { await freshBoard(); await sceneTools(); }
  if (wanted('late')) { await freshBoard(); await sceneLate(); }
  if (wanted('tabs')) { await freshBoard(); await sceneTabs(); }
  if (wanted('stream')) { await freshBoard(); await sceneStream(); }
  if (wanted('names')) { await freshBoard(); await sceneNames(); }
  if (wanted('keys')) { await freshBoard(); await sceneKeys(); }
} finally {
  if (board) board.kill('SIGKILL');
  rmSync(scratch, { recursive: true, force: true });
}
console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures);
