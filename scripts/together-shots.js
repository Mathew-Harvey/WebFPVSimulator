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
      ...process.env, PORT: String(port), BOARD_FILE: join(scratch, 'board.json'), DATABASE_URL: '', BOARD_ROOM_SECRET: secret,
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

function shooter(page, scene) {
  return async (name) => {
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    const file = `${scene}-${name}.png`;
    await writeFile(join(outDir, file), Buffer.from(data, 'base64'));
    console.log(`  shot  ${join(opts.out, file)}`);
  };
}

const T = 'window.__together && window.__together()';
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
    const talk = await page.until("(() => { const t = document.querySelector('#tg .talk'); return t && !t.hidden && t.textContent.includes('GG!'); })()", 5000).then(() => true, () => false);
    check('a quick line arrives as dialogue, with the speaker\'s portrait', talk);
    await wait(500);
    await shot('talk-quick');
    const talkOn = await overlaps(page, '#tg .talk');
    check('a line said covers none of the shell\'s instruments, the sticks and the pack included', !talkOn, talkOn);
    await wait(1800);
    bots[1].s.chat('Nice to fly with you', 'laugh');
    const typed = await page.until("(() => { const t = document.querySelector('#tg .talk'); return t && !t.hidden && t.textContent.includes('Nice to fly with you'); })()", 5000).then(() => true, () => false);
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
    const thanks = await page.until("document.querySelector('#tg').textContent.includes('Sent.')", 5000).then(() => true, () => false);
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
    const errors = errorsOf(page);
    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
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
    const welcome = await page.evaluate("document.querySelector('#tg').textContent.includes('Welcome to')");
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
    const errors = errorsOf(page);
    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
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
    const errors = errorsOf(page);
    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
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
    const errors = errorsOf(page);
    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
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
      const errors = errorsOf(p);
      check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
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
    const errors = errorsOf(page).filter((e) => !/Offline: the Steam edition/.test(e));
    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
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
const says = (page) => page.evaluate("(() => { const s = document.querySelector('#tg .tg-modal .say'); return s ? s.textContent : ''; })()");
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
    const errors = errorsOf(page).filter((e) => !/status of 404 .*\/api\/rooms\/ZZZZZ2\)$/.test(e));
    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
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
    const lostSaid = await page.until("document.querySelector('#tg').textContent.includes('Lost the board for a moment')", 5000).then(() => true, () => false);
    check('and a banner says it is trying again', lostSaid);
    await settled(page, '#tg .tg-banner');
    const lostSeen = await unseen(page, '#tg .tg-banner');
    check('which the pilot can see', lostSeen === '', lostSeen);
    await page.tap('Digit1');
    await wait(150);
    const notSaid = await page.evaluate("document.querySelector('#tg .tg-toasts').textContent");
    check('a quick line meanwhile says it was not said, rather than nothing', /Not said/.test(notSaid), notSaid);
    await shot('reconnecting');
    await page.evaluate("(() => { window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('room-sheet'); return 1; })()");
    await wait(200);
    const meanwhile = await page.evaluate("document.querySelector('#tg .tg-toasts').textContent");
    check('the room\'s page asked for meanwhile says to wait a moment', /One moment/.test(meanwhile), meanwhile);
    await page.evaluate("(() => { window.__ui.act('resume'); return 1; })()");

    await freshBoard();
    const back = await page.until(`${T} && window.__together().inRoom`, 15000).then(() => true, () => false);
    check('the board back: the page is back in from its ticket', back && (await state(page)).code === room.code, JSON.stringify(await state(page)));
    check('with a banner that says so', await page.evaluate("document.querySelector('#tg').textContent.includes('Back in')"));
    await settled(page, '#tg .tg-banner');
    const backSeen = await unseen(page, '#tg .tg-banner');
    check('which the pilot can see', backSeen === '', backSeen);
    const backOn = await overlaps(page, '#tg .tg-banner', BANNER_CLEAR_OF);
    check('and which covers nothing', !backOn, backOn);
    const stale = await page.evaluate("document.querySelector('#tg .tg-toasts').textContent");
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
    const tagged = await page.until("document.querySelector('#tg .tg-modal').textContent.includes('Getting back in')", 4000).then(() => true, () => false);
    check('a drop with the room\'s page open keeps the page, and its tags say so', tagged && (await state(page)).sheet === 'room', JSON.stringify(await state(page)));
    await pressKey(page, 'talk');
    const waits = await page.evaluate("document.querySelector('#tg .tg-toasts').textContent");
    check('and Talk says to wait a moment', /One moment/.test(waits) && (await state(page)).sheet === 'room', waits);
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
    check('it says so', await page.evaluate("document.querySelector('#tg').textContent.includes('The room closed while you were away')"));
    await wait(300);
    const st = await state(page);
    check('and the room\'s page closed with it', st.sheet === '', JSON.stringify(st));
    const rows = await pauseRows(page);
    check('the pause menu is a solo one again', !rows.includes('Room'), rows.join(', '));
    await shot('lost');
    const errors = errorsOf(page);
    check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${e.message}`);
    await shot('failed').catch(() => {});
  } finally {
    keeper.s.leave();
    await page.close();
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
} finally {
  if (board) board.kill('SIGKILL');
  rmSync(scratch, { recursive: true, force: true });
}
console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures);
