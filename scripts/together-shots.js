/*
 * together-shots.js: fly the real shell in a room with synthetic pilots,
 * and take pictures of what it draws.
 *
 * Multiplayer can only be looked at with somebody else in the room, and the
 * only somebody a container has is a program. So this starts a board from
 * the leaderboard checkout beside this one (or NET_BOARD), has a few pilots
 * in Node open a room on Your map and fly round in it, boots the shell in
 * headless Chromium with that room's link (?mp=1&room=CODE&i=INVITE), puts
 * it in the air, and photographs the other pilots from the hero's camera:
 * their comic airframes in livery, their discs, their name tags. The pilots
 * in Node use src/net/room.js, the same client the shell runs, so the bytes
 * on the wire are the real ones in both directions.
 *
 * What it asserts, beyond the pictures: the shell joins the room, its own
 * pose reaches the other pilots, the other pilots are drawn, and the whole
 * room costs three draw calls, measured in the same view a frame apart.
 *
 * Usage:
 *   node scripts/together-shots.js [--out=DIR] [--w=1280] [--h=720]
 * DIR defaults to .loop/together, whose pictures git ignores.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const opts = { out: '.loop/together', w: 1280, h: 720 };
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)=(.*)$/);
  if (m) opts[m[1]] = /^\d+$/.test(m[2]) ? Number(m[2]) : m[2];
}
const outDir = isAbsolute(String(opts.out)) ? String(opts.out) : join(root, opts.out);
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!cond) failures += 1;
}

const boardDir = [process.env.NET_BOARD, join(root, '..', 'WebFPVSimulator-LeaderBoard'), join(root, '..', 'webfpvsimulator-leaderboard')]
  .filter(Boolean).find((p) => existsSync(join(p, 'src', 'rooms.js')));
if (!boardDir) {
  console.log('together-shots: no checkout of the board's repository beside this one; set NET_BOARD to one');
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), 'webfpv-together-'));
const port = 4700 + Math.floor(Math.random() * 200);
const board = spawn(process.execPath, [join(boardDir, 'src', 'server.js')], {
  cwd: boardDir,
  env: {
    ...process.env, PORT: String(port), BOARD_FILE: join(scratch, 'board.json'), DATABASE_URL: '', BOARD_ROOM_SECRET: randomBytes(24).toString('hex'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
board.stdout.resume();
board.stderr.resume();
const boardOrigin = `http://127.0.0.1:${port}`;
for (let i = 0; i < 200; i += 1) {
  try {
    if ((await fetch(`${boardOrigin}/api/rooms/counts`)).ok) break;
  } catch (e) {
    /* Not listening yet. */
  }
  await wait(25);
}

/* Three pilots in Node: a host, and two who join. */
const url = roomsUrl(boardOrigin);
const bots = [
  { handle: 'Sakura Wing', livery: 1 },
  { handle: 'Amber Hornet', livery: 2 },
  { handle: 'Slate Kite', livery: 3 },
].map((b) => ({
  ...b,
  s: new RoomSession({
    url, key: randomBytes(16).toString('hex'), handle: b.handle, avatar: { livery: b.livery },
  }),
}));
const host = bots[0].s;
host.host({
  name: 'Together shots', way: 'freestyle', map: 'built', mapName: 'Your map', scale: 50,
});
for (let i = 0; i < 100 && !host.inRoom; i += 1) await wait(50);
const code = host.room.code;
for (const b of bots.slice(1)) b.s.join(code, { invite: host.invite });
for (let i = 0; i < 100 && !bots.every((b) => b.s.inRoom); i += 1) await wait(50);
console.log(`together-shots: room ${code} on ${url}, ${bots.length} pilots in Node`);

const seated = `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.airframeAsked = true;
  s.graphics = 'low';
  s.graphicsAuto = false;
  s.map = 'built';
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.pilot.name', 'Shell Pilot');
} catch (e) { /* Storage refused; the run boots on the defaults. */ }`;
const query = `?mp=1&board=${encodeURIComponent(boardOrigin)}&map=built&room=${code}&i=${host.invite}`;
const page = await openPage({
  root, width: opts.w, height: opts.h, url: `/index.html${query}`, seed: [seated],
});
await mkdir(outDir, { recursive: true });
async function shot(name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`  shot  ${join(opts.out, `${name}.png`)}`);
}

let flying = null;
try {
  await page.until('window.__shellReady === true', 120000);
  await page.evaluate("(() => { const ui = window.__ui; ui.settings.map = 'built'; ui.onAction('fly', ui.settings); return 1; })()");
  await page.until("window.__mode === 'flight' && window.__map && window.__map().ready", 120000);
  await page.until("location.search.includes('room=')", 30000).catch(() => {});
  const there = await page.evaluate('location.search');
  check('the shell joined the room and kept it in its address', there.includes(`room=${code}`), there);
  for (let i = 0; i < 100 && host.link.pilots.size < 4; i += 1) await wait(100);
  check('the other pilots see the shell arrive', host.link.pilots.size === 4, `${host.link.pilots.size} pilots`);

  /* Where the shell's craft is, from its own pose on the wire. */
  let centre = null;
  for (let i = 0; i < 100 && !centre; i += 1) {
    host.eachRemote((id, pose, pilot) => {
      if (pilot.handle === 'Shell Pilot' || !centre) centre = { ...pose };
    });
    if (!centre) await wait(100);
  }
  check('the shell\'s pose reaches the other pilots', Boolean(centre), centre ? `${centre.px.toFixed(1)}, ${centre.py.toFixed(1)}, ${centre.pz.toFixed(1)}` : 'none');
  /* Ahead of it: the craft's own forward, minus z turned by its attitude,
   * which is where the camera on its nose looks. */
  const q = centre;
  let fx = -2 * (q.qx * q.qz + q.qw * q.qy);
  let fz = -(1 - 2 * (q.qx * q.qx + q.qy * q.qy));
  const fl = Math.hypot(fx, fz) || 1;
  fx /= fl;
  fz /= fl;
  const base = { x: centre.px, y: centre.py, z: centre.pz };

  /* Fly: the host circles four metres ahead, the others sit beside it. */
  const t0 = performance.now();
  flying = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const cx = base.x + fx * 6;
    const cz = base.z + fz * 6;
    const y = base.y + 0.6;
    bots.forEach((b, k) => {
      const a = k === 0 ? t * 0.9 : (k === 1 ? -0.9 : 0.9);
      const r = k === 0 ? 2.2 : 1.6;
      const px = cx + Math.cos(a) * r - (k === 2 ? fx * 3 : 0);
      const pz = cz + Math.sin(a) * r - (k === 2 ? fz * 3 : 0);
      /* Facing along the circle, banked a little into it. */
      const yaw = -a + (k === 0 ? Math.PI : 0);
      const h = yaw / 2;
      const bank = k === 0 ? 0.35 : 0;
      b.s.uplink(px, y + (k === 1 ? 0.5 : 0), pz,
        Math.sin(bank / 2) * Math.cos(h), Math.sin(h) * Math.cos(bank / 2), -Math.sin(bank / 2) * Math.sin(h), Math.cos(h) * Math.cos(bank / 2),
        k !== 2, 0);
    });
  }, 1000 / 60);
  await wait(2500);
  const drawn = await page.evaluate(`(() => {
    const s = window.__mapScene ? window.__mapScene() : null;
    let g = null;
    if (s) s.traverse((o) => { if (o.name === 'room-craft') g = o; });
    return g ? { visible: g.visible, counts: g.children.map((c) => c.name + ':' + c.count) } : null;
  })()`);
  check('the other three pilots are drawn', Boolean(drawn && drawn.visible && drawn.counts.includes('room-craft-bodies:3')), JSON.stringify(drawn));
  /*
   * The cost: how many times the room's meshes are drawn a frame, counted
   * at each draw over ten frames. The world's own total moves by a few
   * calls from frame to frame (traffic, culling), so a difference of two
   * totals cannot see three; counting the room's own draws can.
   */
  const cost = await page.evaluate(`(async () => {
    const s = window.__mapScene();
    let g = null;
    s.traverse((o) => { if (o.name === 'room-craft') g = o; });
    let draws = 0;
    const kept = g.children.map((c) => c.onBeforeRender);
    g.children.forEach((c, i) => { c.onBeforeRender = function (...a) { draws += 1; return kept[i].apply(this, a); }; });
    /* Counted against the scene's own renders, which is what a draw call
     * is made inside: the shell does not render on every animation frame
     * here, and a post chain could render the scene more than once. */
    let renders = 0;
    const sceneKept = s.onBeforeRender;
    s.onBeforeRender = function (...a) { renders += 1; return sceneKept.apply(this, a); };
    let ticks = 0;
    await new Promise((r) => { const tick = () => { ticks += 1; if (renders >= 12 || ticks > 600) r(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    s.onBeforeRender = sceneKept;
    g.children.forEach((c, i) => { c.onBeforeRender = kept[i]; });
    return { perRender: renders ? draws / renders : -1, renders, meshes: g.children.length };
  })()`);
  check(`three pilots cost three draw calls each time the scene is drawn (${cost.perRender.toFixed(2)} over ${cost.renders} renders, ${cost.meshes} meshes)`,
    cost.perRender === 3 && cost.meshes === 3);
  await shot('room-ahead');
  await wait(1200);
  await shot('room-ahead-later');
  /* Pull the host close, to see the ink and the livery. */
  clearInterval(flying);
  flying = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const h = (t * 0.6) / 2;
    host.uplink(base.x + fx * 2.2, base.y + 1.1, base.z + fz * 2.2, 0, Math.sin(h), 0, Math.cos(h), true, 0);
  }, 1000 / 60);
  await wait(1500);
  await shot('room-close');
  const errors = page.errors.filter((e) => !/favicon|ERR_CONNECTION_REFUSED/.test(String(e)));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  failures += 1;
  console.log(`  FAIL  ${e.message}`);
} finally {
  if (flying) clearInterval(flying);
  for (const b of bots) b.s.leave();
  await page.close();
  board.kill('SIGKILL');
  rmSync(scratch, { recursive: true, force: true });
}
console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures);
