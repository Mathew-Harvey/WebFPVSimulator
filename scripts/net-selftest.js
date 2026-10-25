/*
 * net-selftest.js: the multiplayer client, proven in Node.
 *
 * Drives src/net/ with no browser and no GL. The pose wire is round
 * tripped over thousands of random attitudes and positions and held to its
 * grain; a remote pilot is fed a synthetic flight at the board's two relay
 * rates with jitter, and what it draws is compared with where the flight
 * really was; teleports, clock wraps, late poses and silences are put
 * through it. Then, when a checkout of the leaderboard sits beside this
 * one (or NET_BOARD names one), two sessions fly through a real board, the
 * board is stopped the way Render stops it, a new one is started with the
 * same secret, and both pilots are expected back in the same room.
 *
 * Run: node scripts/net-selftest.js   (npm run net:selftest)
 * Exit code is the failure count, like the other selftests.
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
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POSE_ENTRY_BYTES, POSE_UP_BYTES, SCALES, decodeFrame, decodePoseAt, encodePose, poseFlags,
} from '../src/net/pose.js';
import { RemotePilot } from '../src/net/remote.js';
import { roomsUrl } from '../src/net/link.js';
import { RoomSession } from '../src/net/room.js';

let failures = 0;

function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  pass  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/* A seeded generator, so a failure is the same failure on the next run. */
let seed = 0x2545f491;
function rnd() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 1_000_000) / 1_000_000;
}

function randomQuat() {
  let x;
  let y;
  let z;
  let w;
  let n;
  do {
    x = rnd() * 2 - 1;
    y = rnd() * 2 - 1;
    z = rnd() * 2 - 1;
    w = rnd() * 2 - 1;
    n = Math.sqrt(x * x + y * y + z * z + w * w);
  } while (n < 0.1 || n > 1);
  return [x / n, y / n, z / n, w / n];
}

/* The turn between two unit quaternions, in degrees. */
function turnDeg(a, b) {
  const d = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return (2 * Math.acos(d) * 180) / Math.PI;
}

console.log('the pose wire');
{
  const out = new Uint8Array(POSE_UP_BYTES);
  const view = new DataView(out.buffer);
  const back = {};
  let worstTurn = 0;
  let worstPos = 0;
  let unitOk = true;
  for (let i = 0; i < 20000; i += 1) {
    const q = randomQuat();
    const units = SCALES[i % 3];
    const reach = 32767 / units;
    const p = [(rnd() * 2 - 1) * reach * 0.99, (rnd() * 2 - 1) * reach * 0.99, (rnd() * 2 - 1) * reach * 0.99];
    encodePose(out, units, i * 7, poseFlags(i % 2 === 0, i), p[0], p[1], p[2], q[0], q[1], q[2], q[3]);
    decodePoseAt(view, 1, units, back);
    worstTurn = Math.max(worstTurn, turnDeg(q, [back.qx, back.qy, back.qz, back.qw]));
    worstPos = Math.max(worstPos, Math.abs(back.px - p[0]) * units, Math.abs(back.py - p[1]) * units, Math.abs(back.pz - p[2]) * units);
    const n = Math.hypot(back.qx, back.qy, back.qz, back.qw);
    if (Math.abs(n - 1) > 1e-4) unitOk = false;
    if (back.spinning !== (i % 2 === 0) || back.resets !== (i & 3) || back.clock !== ((i * 7) & 0xffff)) {
      unitOk = false;
    }
  }
  check('sixteen bytes up, and sixteen a pilot down', POSE_UP_BYTES === 16 && POSE_ENTRY_BYTES === 16);
  check(`attitude within 0.01 degrees over 20,000 random turns (worst ${worstTurn.toFixed(4)})`, worstTurn < 0.01);
  check(`position within half a pose unit (worst ${worstPos.toFixed(3)} units)`, worstPos <= 0.5 + 1e-9);
  check('the rebuilt quaternion is unit length, and the flags and clock come back', unitOk);

  encodePose(out, 50, 0, 0, 1000, -1000, 3, 0, 0, 0, 1);
  decodePoseAt(view, 1, 50, back);
  check('a pilot past the reach is held at the edge, not wrapped', back.px > 655 && back.py < -655 && Math.abs(back.pz - 3) < 0.02);
  encodePose(out, 100, 0, 0, 1, 2, 3, 0, 0, 0, -1);
  decodePoseAt(view, 1, 100, back);
  check('minus the identity comes back as the identity', Math.abs(back.qw - 1) < 1e-6 && Math.abs(back.qx) < 1e-6);
  check('the board reads the position where it expects it', view.getInt16(4, true) === 100 && view.getInt16(6, true) === 200 && view.getInt16(8, true) === 300);

  /* A board frame of three pilots, as src/rooms.js builds one. */
  const frame = new Uint8Array(1 + 3 * POSE_ENTRY_BYTES);
  frame[0] = 1;
  for (let k = 0; k < 3; k += 1) {
    encodePose(out, 200, 1000 + k, 0, k, k + 0.5, -k, 0, 0, 0, 1);
    frame[1 + k * POSE_ENTRY_BYTES] = 7 + k;
    frame.set(out.subarray(1), 2 + k * POSE_ENTRY_BYTES);
  }
  const seen = [];
  const n = decodeFrame(frame, 200, (id, pose) => seen.push([id, pose.clock, pose.px, pose.py, pose.pz]));
  check('a frame of three pilots decodes as three, in order, with their ids', n === 3
    && seen.map((s) => s[0]).join() === '7,8,9' && seen[2][1] === 1002 && seen[2][2] === 2 && seen[2][3] === 2.5 && seen[2][4] === -2);
  check('a frame that is not whole entries is refused', decodeFrame(frame.subarray(0, 20), 200, () => {}) === -1);
}

/*
 * The synthetic flight: a 15 m circle at 20 m/s, three metres up, with a
 * climb and a yaw that follows the path. Smooth on every axis and cheap to
 * ask at any t.
 */
const R = 15;
const OMEGA = 20 / R;
function truth(tMs) {
  const t = tMs / 1000;
  const yaw = OMEGA * t;
  return {
    px: Math.cos(yaw) * R,
    py: 3 + Math.sin(t * 0.7),
    pz: Math.sin(yaw) * R,
    q: [0, Math.sin(-yaw / 2), 0, Math.cos(-yaw / 2)],
  };
}

/*
 * Feed a RemotePilot poses sent every `everyMs` (with `jitterMs` of random
 * extra delay on arrival, and a constant `pathMs` on top), draw it at 60 Hz,
 * and measure how far what it draws is from the truth at the time it is
 * drawing. Returns { worst, mean, delay }.
 */
function fly({
  everyMs, jitterMs, pathMs = 40, clockStart = 0, seconds = 8, resetAtMs = -1, teleport = null,
}) {
  const r = new RemotePilot(1);
  const arrivals = [];
  let resets = 0;
  for (let t = 0; t <= seconds * 1000; t += everyMs) {
    let s = truth(t);
    if (resetAtMs >= 0 && t >= resetAtMs) {
      if (!resets) resets = 1;
      s = teleport(t);
    }
    arrivals.push({
      at: t + pathMs + rnd() * jitterMs,
      pose: {
        clock: (clockStart + t) & 0xffff,
        spinning: true,
        resets,
        px: s.px,
        py: s.py,
        pz: s.pz,
        qx: s.q[0],
        qy: s.q[1],
        qz: s.q[2],
        qw: s.q[3],
      },
      sent: t,
    });
  }
  arrivals.sort((a, b) => a.at - b.at);
  const out = {};
  let k = 0;
  let worst = 0;
  let sum = 0;
  let count = 0;
  let cuts = 0;
  let worstTurn = 0;
  const local0 = 5000;
  for (let now = 0; now <= seconds * 1000; now += 1000 / 60) {
    while (k < arrivals.length && arrivals[k].at <= now) {
      r.push(arrivals[k].pose, local0 + arrivals[k].at);
      k += 1;
    }
    if (!r.sample(local0 + now, out)) continue;
    if (out.cut) cuts += 1;
    /* Settled after the first two seconds, and judged where it is drawing:
     * now minus the path and the delay it chose. */
    if (now > 2000 && (resetAtMs < 0 || Math.abs(now - resetAtMs) > 1200)) {
      const drawnAt = now - pathMs - r.delay;
      const s = resetAtMs >= 0 && drawnAt >= resetAtMs ? teleport(drawnAt) : truth(drawnAt);
      const e = Math.hypot(out.px - s.px, out.py - s.py, out.pz - s.pz);
      worst = Math.max(worst, e);
      worstTurn = Math.max(worstTurn, turnDeg(s.q, [out.qx, out.qy, out.qz, out.qw]));
      sum += e;
      count += 1;
    }
  }
  return {
    worst, mean: sum / Math.max(1, count), delay: r.delay, cuts, worstTurn, r,
  };
}

console.log('a remote pilot');
{
  const near = fly({ everyMs: 50, jitterMs: 25 });
  check(`near, 20 Hz with 25 ms of jitter: drawn within 15 cm of the truth (worst ${(near.worst * 100).toFixed(1)} cm, mean ${(near.mean * 100).toFixed(2)} cm)`, near.worst < 0.15);
  check(`near: the attitude within two degrees (worst ${near.worstTurn.toFixed(2)})`, near.worstTurn < 2);
  check(`near: drawn about 100 ms in the past (${near.delay.toFixed(0)} ms)`, near.delay > 80 && near.delay < 130);
  const far = fly({ everyMs: 200, jitterMs: 40 });
  check(`far, 5 Hz with 40 ms of jitter: drawn within 60 cm of the truth at 20 m/s (worst ${(far.worst * 100).toFixed(1)} cm)`, far.worst < 0.6);
  check(`far: drawn about a third of a second in the past (${far.delay.toFixed(0)} ms)`, far.delay > 280 && far.delay < 380);
  const wrap = fly({ everyMs: 50, jitterMs: 10, clockStart: 65536 - 3000 });
  check(`a sender clock that wraps mid flight changes nothing (worst ${(wrap.worst * 100).toFixed(1)} cm)`, wrap.worst < 0.15);

  /* A crash recovery: 40 m away in one pose, flagged by the reset count. */
  const away = (t) => {
    const s = truth(t);
    return { ...s, px: s.px + 40 };
  };
  const reset = fly({
    everyMs: 200, jitterMs: 20, resetAtMs: 4000, teleport: away,
  });
  check('a far pilot\'s reset is cut, not swept through the scenery', reset.cuts > 0);
  check(`and drawn true on either side of it (worst ${(reset.worst * 100).toFixed(1)} cm)`, reset.worst < 0.6);

  /* The same jump with no reset flag, as an older client would send it. */
  const r = new RemotePilot(2);
  const base = { spinning: true, resets: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  r.push({ ...base, clock: 0, px: 0, py: 3, pz: 0 }, 1000);
  r.push({ ...base, clock: 50, px: 1, py: 3, pz: 0 }, 1050);
  r.push({ ...base, clock: 100, px: 30, py: 3, pz: 0 }, 1100);
  r.push({ ...base, clock: 150, px: 31, py: 3, pz: 0 }, 1150);
  const o = {};
  let crossed = 0;
  for (let t = 1100; t < 1400; t += 5) {
    r.sample(t, o);
    if (o.px > 1.5 && o.px < 29.5) crossed += 1;
  }
  check('a jump faster than the ghost\'s cut speed is held, never drawn between', crossed === 0);

  /* Repeats and old poses are dropped. */
  check('a repeated pose is dropped', r.push({ ...base, clock: 150, px: 99, py: 0, pz: 0 }, 1200) === false);
  check('an older pose is dropped', r.push({ ...base, clock: 120, px: 99, py: 0, pz: 0 }, 1210) === false);

  /* Late: extrapolate a little, then hold. */
  const late = new RemotePilot(3);
  for (let t = 0; t <= 1000; t += 50) {
    late.push({ ...base, clock: t, px: t / 50, py: 3, pz: 0 }, 2000 + t);
  }
  late.sample(3000 + 100, o);
  const at100 = o.px;
  late.sample(3000 + 2000, o);
  const at2000 = o.px;
  late.sample(3000 + 9000, o);
  check(`a late pilot carries on at most 150 ms past its last pose (${at2000.toFixed(2)} m, last 20 m)`, at2000 <= 20 + 0.15 * 20 + 1e-6 && at2000 >= at100);
  check('and then holds, however long the silence', Math.abs(o.px - at2000) < 1e-9);

  /* A silence long enough that the clock could have wrapped starts a new line. */
  late.push({ ...base, clock: 5, px: -50, py: 3, pz: 0 }, 2000 + 60000);
  late.sample(2000 + 60000 + 10, o);
  check('after a long silence the next pose starts a new line, wherever it is', Math.abs(o.px + 50) < 1e-9);
}

console.log('the rooms address');
{
  check('production goes straight to the board on Render', roomsUrl('https://webfpv.org/board') === 'wss://webfpv-board.onrender.com/api/rooms/socket');
  check('a local board is its own host', roomsUrl('http://127.0.0.1:3100') === 'ws://127.0.0.1:3100/api/rooms/socket');
  check('?rooms= wins', roomsUrl('https://webfpv.org/board', 'https://rooms.webfpv.org/') === 'wss://rooms.webfpv.org/api/rooms/socket');
}

/* A board checkout beside this one, if there is one. */
function findBoard() {
  const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tries = [
    process.env.NET_BOARD,
    join(here, '..', 'WebFPVSimulator-LeaderBoard'),
    join(here, '..', 'webfpvsimulator-leaderboard'),
  ].filter(Boolean);
  return tries.find((p) => existsSync(join(p, 'src', 'rooms.js'))) || '';
}

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function until(cond, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    await wait(20);
  }
  return cond();
}

function startBoard(dir, port, file, secret) {
  const child = spawn(process.execPath, [join(dir, 'src', 'server.js')], {
    cwd: dir,
    env: {
      ...process.env, PORT: String(port), BOARD_FILE: file, DATABASE_URL: '', BOARD_ROOM_SECRET: secret,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.resume();
  child.stderr.resume();
  return child;
}

async function boardUp(port) {
  for (let i = 0; i < 200; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/rooms/counts`)).ok) return true;
    } catch (e) {
      /* Not listening yet. */
    }
    await wait(25);
  }
  return false;
}

console.log('two pilots through a real board');
const boardDir = findBoard();
if (!boardDir || typeof WebSocket === 'undefined') {
  console.log(`  skip  ${boardDir ? 'this Node has no WebSocket' : 'no checkout of the board beside this one (set NET_BOARD to one)'}`);
} else {
  const scratch = mkdtempSync(join(tmpdir(), 'webfpv-net-'));
  const port = 4300 + Math.floor(Math.random() * 400);
  const secret = randomBytes(24).toString('hex');
  const file = join(scratch, 'board.json');
  let board = startBoard(boardDir, port, file, secret);
  try {
    check('the board started', await boardUp(port));
    const url = roomsUrl(`http://127.0.0.1:${port}`);
    const events = { a: [], b: [] };
    const a = new RoomSession({
      url, key: randomBytes(16).toString('hex'), handle: 'Pilot A', avatar: { livery: 3 }, onEvent: (n) => events.a.push(n),
    });
    const b = new RoomSession({
      url, key: randomBytes(16).toString('hex'), handle: 'Pilot B', avatar: { livery: 5 }, onEvent: (n) => events.b.push(n),
    });
    a.host({
      name: 'Self test', way: 'freestyle', map: 'city', mapName: 'The town', scale: 100,
    });
    check('the host is in its room', await until(() => a.inRoom));
    const code = a.room && a.room.code;
    check('and has a six letter code', /^[A-Z2-9]{6}$/.test(code || ''));
    b.join(code, { invite: a.invite });
    check('the second pilot joins by code and invite', await until(() => b.inRoom));
    check('and both pilots know each other', await until(() => a.link.pilots.size === 2 && b.link.pilots.size === 2));
    check('the room\'s pose unit came from the host', b.units === 100);

    /*
     * A flies the circle for three seconds at 60 frames a second, B parks,
     * and B draws A every frame. Both run on this process's clock, so the
     * floor B learns is the real one way time through the board and the
     * time B draws A at is known exactly.
     */
    const t0 = performance.now();
    let sentA = 0;
    let drawn = null;
    let worst = 0;
    let judged = 0;
    const flying = setInterval(() => {
      const now = performance.now();
      const s = truth(now - t0);
      if (a.uplink(s.px, s.py, s.pz, s.q[0], s.q[1], s.q[2], s.q[3], true)) sentA += 1;
      b.uplink(5, 0.1, 5, 0, 0, 0, 1);
      b.eachRemote((id, pose, pilot) => {
        drawn = { id, pilot, ...pose };
        const r = b.remotes.get(id);
        if (now - t0 > 1000) {
          const want = truth(now - t0 - r.floor - r.delay);
          worst = Math.max(worst, Math.hypot(pose.px - want.px, pose.py - want.py, pose.pz - want.pz));
          judged += 1;
        }
      });
    }, 1000 / 60);
    await wait(3000);
    clearInterval(flying);
    check(`A sent 20 poses a second, never more (${sentA} in 3 s)`, sentA >= 55 && sentA <= 62);
    check(`B, parked, sent one pose and then nothing (${b.posesSent})`, b.posesSent === 1);
    check('B draws A, by A\'s id and handle', drawn && drawn.id === a.you && drawn.pilot.handle === 'Pilot A');
    /* The board relays the newest pose each 50 ms tick, so a pose that
     * lands in the same tick as the one after it is replaced, by design. */
    check(`B heard nine in ten of A's poses through the board (${b.posesHeard} of ${sentA})`, b.posesHeard >= sentA * 0.9);
    check(`and draws A within 20 cm of where A was, at 20 m/s (worst ${(worst * 100).toFixed(1)} cm over ${judged} frames)`, judged > 60 && worst < 0.2);
    let aSeesB = null;
    a.eachRemote((id, pose) => {
      aSeesB = { ...pose };
    });
    check('A draws B where B parked', aSeesB && Math.abs(aSeesB.px - 5) < 0.02 && Math.abs(aSeesB.pz - 5) < 0.02);

    /* Render stops a board with SIGTERM; the next one has the same secret. */
    board.kill('SIGTERM');
    await new Promise((r) => { board.once('exit', r); });
    check('a deploy drops both pilots, and they say they are trying again', await until(() => a.link.state !== 'in' && b.link.state !== 'in'));
    board = startBoard(boardDir, port, file, secret);
    check('the new board started', await boardUp(port));
    check('both pilots are back in, from their tickets', await until(() => a.inRoom && b.inRoom, 15000));
    check('in the same room', a.room && b.room && a.room.code === code && b.room.code === code);
    check('and still know each other', await until(() => a.link.pilots.size === 2 && b.link.pilots.size === 2));
    const s = truth(5000);
    a.lastSentAt = -Infinity;
    a.uplink(s.px, s.py, s.pz, s.q[0], s.q[1], s.q[2], s.q[3], true, 1);
    check('and poses flow again', await until(() => {
      let ok = false;
      b.eachRemote((id, pose) => {
        ok = Math.abs(pose.px - s.px) < 0.05;
      });
      return ok;
    }, 3000));

    b.leave();
    check('a pilot who leaves is gone from the other\'s list', await until(() => a.link.pilots.size === 1 && a.remotes.size === 0));
    a.leave();
    check('neither pilot tries again after leaving', a.link.state === 'idle' && b.link.state === 'idle'
      && !events.a.includes('lost') && !events.b.includes('lost'));
  } finally {
    board.kill('SIGKILL');
    rmSync(scratch, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures);
