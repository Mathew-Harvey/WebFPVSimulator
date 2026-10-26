/*
 * net-selftest.js: the multiplayer client, proven in Node.
 *
 * Drives src/net/ with no browser and no GL. The pose wire is round
 * tripped over thousands of random attitudes and positions and held to its
 * grain; a remote pilot is fed a synthetic flight at the board's two relay
 * rates with jitter, and what it draws is compared with where the flight
 * really was; teleports, clock wraps, late poses and silences are put
 * through it. A room's address, a pilot's face, the board's clock and one
 * page's part in a race are each held to what they promise, with no board.
 * Then, when a checkout of the leaderboard sits beside this one (or
 * NET_BOARD names one), the board's lists are held to this client's, two
 * sessions fly through a real board, the board is stopped the way Render
 * stops it, a new one is started with the same secret, and both pilots are
 * expected back in the same room; two pilots race a track through it, and
 * four talk in a listed room and a private one.
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
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  POSE_ENTRY_BYTES, POSE_UP_BYTES, SCALES, decodeFrame, decodePoseAt, encodePose, poseFlags,
} from '../src/net/pose.js';
import { RemotePilot } from '../src/net/remote.js';
import { PROTOCOL, REFUSALS, ROOM_MAX, STREAM_MAX, roomsUrl } from '../src/net/link.js';
import { RoomSession } from '../src/net/room.js';
import {
  CODE_RE, JOIN_TOKEN_MS, addressInRoom, addressOutOfRoom, craftForRoom, isBuiltInWorld, normaliseCode,
  readRoomAddress, roomUrl, takeJoinToken, worldParamsOf, writeJoinToken,
} from '../src/net/roomlinks.js';
import {
  AVATAR_FIELDS, EXPRESSIONS, FIELD_COUNTS, LIVERIES, cleanAvatar, liveryIndex, rollAvatar,
} from '../src/net/avatar.js';
import {
  BoardClock, COUNT_JOIN_MS, RACE_LAPS_MAX, RACE_WAYS, RoomRace,
} from '../src/net/roomrace.js';
import { QUICK, WAVE } from '../src/net/together.js';

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

console.log('room links');
{
  check('a code is read as somebody typed it', normaliseCode(' k7q-x2m ') === 'K7QX2M' && normaliseCode('k7 qx 2m') === 'K7QX2M');
  check('and is not a code with an O, a 0, an I or a 1 in it, or the wrong length',
    ['K7QX2O', 'K7QX20', 'K7QX2I', 'K7QX21', 'K7QX2', 'K7QX2MM', '', null].every((x) => normaliseCode(x) === ''));
  check('the worlds the sim ships are its own, the pilot\'s own map and a track are not',
    isBuiltInWorld('city') && isBuiltInWorld('house') && !isBuiltInWorld('built') && !isBuiltInWorld('custom') && !isBuiltInWorld('a-board-map'));

  check('a whoop room is flown on a whoop and a five inch room on a five inch',
    craftForRoom({ way: 'whoop', map: 'city' }) === 'whoop65' && craftForRoom({ way: '5inch', map: 'house' }) === '5inch');
  check('freestyle on a house is a whoop\'s, because the house is',
    craftForRoom({ way: 'freestyle', map: 'house', scale: 50 }) === 'whoop65');
  check('freestyle on a board map follows the host\'s pose unit',
    craftForRoom({ way: 'freestyle', map: 'a-board-map', scale: 100 }) === 'whoop65'
    && craftForRoom({ way: 'freestyle', map: 'a-board-map', scale: 50 }) === '5inch');
  check('no room is a five inch', craftForRoom(null) === '5inch');

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check('a world the sim ships opens by name', same(worldParamsOf({ way: 'freestyle', map: 'city' }), { map: 'city' }));
  check('a board map opens as a map share', same(worldParamsOf({ way: 'freestyle', map: 'pines-1' }), { map: 'built', mapshare: 'pines-1' }));
  check('a track opens as a track share', same(worldParamsOf({ way: '5inch', map: 'gates-2' }), { map: 'custom', share: 'gates-2' }));

  const room = {
    code: 'K7QX2M', way: '5inch', map: 'gates-2', scale: 50,
  };
  const invite = 'abcdEFGH1234_-xy';
  const base = 'https://webfpv.org/sim/?map=city&craft=whoop65&fly=1&mapshare=old&gfx=low#start';
  const href = roomUrl(base, room, { invite });
  const u = new URL(href);
  check('a room\'s address names its world, its craft and its code', u.searchParams.get('map') === 'custom'
    && u.searchParams.get('share') === 'gates-2' && u.searchParams.get('craft') === '5inch' && u.searchParams.get('room') === 'K7QX2M');
  check('drops the world it was on and keeps what is not a world', !u.searchParams.has('mapshare') && !u.searchParams.has('fly') && u.searchParams.get('gfx') === 'low');
  check('carries the invite after the #, where a server never sees it', u.hash === `#i=${invite}` && !u.search.includes(invite));
  check('keeps ?mp=1 until rooms are launched, and not after', u.searchParams.get('mp') === '1'
    && !new URL(roomUrl(base, room, { invite, mp: false })).searchParams.has('mp'));
  check('a malformed invite is left off', new URL(roomUrl(base, room, { invite: 'short' })).hash === '');

  const read = readRoomAddress(u.search, u.hash);
  check('the address reads back as its code and invite', read.code === 'K7QX2M' && read.invite === invite);
  check('an older address with the invite in the query still reads', readRoomAddress(`?room=k7qx2m&i=${invite}`, '').invite === invite);
  check('an invite with no room is no invite', same(readRoomAddress('?map=city', `#i=${invite}`), { code: '', invite: '' }));

  const inRoom = addressInRoom('https://webfpv.org/sim/?map=city&craft=whoop65&room=AAAAAA&mp=1#i=abcdEFGH1234_-xy', { map: 'built', mapshare: 'pines-1' }, 'K7QX2M');
  const v = new URL(inRoom);
  check('in a room the address bar names the world and the room, and keeps the craft being flown',
    v.searchParams.get('map') === 'built' && v.searchParams.get('mapshare') === 'pines-1' && v.searchParams.get('room') === 'K7QX2M' && v.searchParams.get('craft') === 'whoop65');
  check('and drops the invite, so a copied address is not one', v.hash === '');
  check('an address already right is not written again', addressInRoom(inRoom, { map: 'built', mapshare: 'pines-1' }, 'K7QX2M') === '');
  const out = new URL(addressOutOfRoom(`${inRoom}#i=${invite}`));
  check('leaving takes the room and the invite off and nothing else', !out.searchParams.has('room') && out.hash === '' && out.searchParams.get('mapshare') === 'pines-1');
  check('and is nothing to write when there was no room', addressOutOfRoom('https://webfpv.org/sim/?map=city') === '');

  const memory = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), removeItem: (k) => m.delete(k),
    };
  };
  const store = memory();
  writeJoinToken(store, { code: 'K7QX2M', invite }, 1000);
  check('a press carries across the reload it causes', same(takeJoinToken(store, 'K7QX2M', 1500), { code: 'K7QX2M', invite }));
  check('once', takeJoinToken(store, 'K7QX2M', 1600) === null);
  writeJoinToken(store, { code: 'K7QX2M', invite }, 1000);
  check('and only for its own room', takeJoinToken(store, 'AAAAAA', 1500) === null && takeJoinToken(store, 'K7QX2M', 1500) === null);
  writeJoinToken(store, { code: 'K7QX2M', invite }, 1000);
  check('and only while it is fresh', takeJoinToken(store, 'K7QX2M', 1000 + JOIN_TOKEN_MS + 1) === null);
  writeJoinToken(store, { code: 'K7QX2M', invite }, 5000);
  check('and never from the future', takeJoinToken(store, 'K7QX2M', 4000) === null);
  writeJoinToken(store, { code: 'K7QX2M', invite: '<script>' }, 1000);
  check('a stored invite that is not one is dropped', same(takeJoinToken(store, 'K7QX2M', 1200), { code: 'K7QX2M', invite: '' }));
  const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => {} };
  check('storage that throws is no press, not a crash', writeJoinToken(broken, { code: 'K7QX2M' }, 1) === false && takeJoinToken(broken, 'K7QX2M', 1) === null);
}

console.log('avatars');
{
  const inRange = (a) => AVATAR_FIELDS.every((k) => Number.isInteger(a[k]) && a[k] >= 0 && a[k] < FIELD_COUNTS[k]);
  check('nothing, or anything, cleans to a face in range',
    [null, undefined, 7, 'x', [], {
      face: 99, hair: -1, eyes: 2.5, acc: '3', skin: NaN, livery: 1e9,
    }].every((x) => inRange(cleanAvatar(x))));
  check('a face in range is kept as it is', JSON.stringify(cleanAvatar({
    face: 3, hair: 7, eyes: 5, acc: 8, skin: 5, hairColour: 8, eyeColour: 5, livery: 12,
  })) === JSON.stringify({
    face: 3, hair: 7, eyes: 5, acc: 8, skin: 5, hairColour: 8, eyeColour: 5, livery: 12,
  }));
  let allIn = true;
  let bare = 0;
  let noLivery = 0;
  const seen = Object.fromEntries(AVATAR_FIELDS.map((k) => [k, new Set()]));
  for (let i = 0; i < 5000; i += 1) {
    const a = rollAvatar(rnd);
    if (!inRange(a)) allIn = false;
    if (a.acc === 0) bare += 1;
    if (a.livery === 0) noLivery += 1;
    for (const k of AVATAR_FIELDS) seen[k].add(a[k]);
  }
  check('5,000 rolled faces are all in range', allIn);
  check('and between them use every part', AVATAR_FIELDS.every((k) => seen[k].size === FIELD_COUNTS[k] - (k === 'livery' ? 1 : 0)));
  check(`one in four wears nothing (${(bare / 50).toFixed(1)}%)`, bare > 1000 && bare < 1500);
  check('a rolled pilot always has a livery of their own', noLivery === 0);
  check('a rand that returns 1 is still in range', inRange(rollAvatar(() => 1)));
  check('a pilot with no livery takes one from their id', liveryIndex({ livery: 0 }, 3) === 3 && liveryIndex(null, LIVERIES.length + 2) === 2);
  check('a chosen livery wins over the id', liveryIndex({ livery: 5 }, 3) === 4);
}

console.log('the board clock');
{
  const c = new BoardClock();
  check('a new clock knows nothing and changes nothing', !c.known && c.toLocal(1234) === 1234);
  c.coarse(90000, 1000);
  check('the welcome\'s time is believed for now', c.known && c.coarseOnly && c.toBoard(1000) === 90000 && c.toLocal(90000) === 1000);
  check('a ping answered in no time at all is believed', c.heard(2000, 2000 + 89000 + 3, 2006));
  check('as the board\'s time at the middle of the round trip', c.offset === 89000 && !c.coarseOnly && c.rtt === 6);
  c.coarse(0, 0);
  check('after which a welcome\'s time is not', c.offset === 89000);
  check('an answer that arrived before it was asked says nothing', c.heard(3000, 92000, 2990) === false);
  check('nor one that took more than five seconds', c.heard(3000, 92000, 8001) === false);
  check('nor one with no time in it', c.heard(3000, NaN, 3010) === false);
  /* Slower answers, with the board's clock half way through each, do not
   * beat the quick one; once the quick one is eight answers old, the best
   * of the eight since is used. */
  for (let i = 0; i < 7; i += 1) c.heard(4000 + i * 100, 4000 + i * 100 + 20 + 89010, 4000 + i * 100 + 40);
  check('the quickest of the last eight answers is the one believed', c.offset === 89000 && c.rtt === 6);
  c.heard(5000, 5000 + 20 + 89010, 5040);
  check('and an old quick answer gives way to the newer ones', c.offset === 89010 && c.rtt === 40);
  check('toLocal and toBoard undo each other', c.toLocal(c.toBoard(123456.5)) === 123456.5);
}

console.log('a race on one page');
{
  let t = 1000;
  const sent = [];
  const B = 50000;
  const rr = new RoomRace({ send: (m) => { sent.push(m); return true; }, you: () => 2, now: () => t });
  const pit = {
    phase: 'pit', laps: 2, ready: [], racers: [], goAt: 0, n: 0, votes: [], rows: [],
  };
  rr.welcome({ now: t + B, race: pit }, t);
  check('a room\'s race, in the pit, asks nothing of the page', rr.frame() === '' && !rr.racing() && rr.goAt() === 0 && rr.phase === 'pit');
  for (; t < 4000; t += 50) rr.frame();
  const burst = sent.filter((m) => m.t === 'ping').length;
  for (; t < 14000; t += 50) rr.frame();
  check(`six quick pings after a welcome (${burst}), then one every fifteen seconds`, burst === 6 && sent.filter((m) => m.t === 'ping').length === 6);
  rr.pong({ c: 14000, s: 14000 + 5 + B + 7 }, 14010);
  check('a pong sets the clock', rr.clock.offset === B + 7 && rr.clock.rtt === 10);

  const goLocal = t + 5000;
  const rows = [{
    id: 1, laps: 0, total: 0, best: 0, done: false, dnf: false,
  }, {
    id: 2, laps: 0, total: 0, best: 0, done: false, dnf: false,
  }];
  const count = {
    ...pit, phase: 'count', n: 1, racers: [1, 2], goAt: goLocal + B + 7, rows,
  };
  rr.heard(count);
  check('a countdown this pilot is in puts the craft on the grid', rr.racing() && rr.frame() === 'grid');
  check('once', rr.frame() === '' && rr.holding());
  check('and counts down to GO on this page\'s clock', rr.goAt() === goLocal && rr.toGo() === 5000);
  check('a lap before GO is not sent', rr.lap(t + 100) === null);
  t = goLocal - 1;
  check('nothing a millisecond before GO', rr.frame() === '');
  t = goLocal;
  check('GO at GO', rr.frame() === 'go' && !rr.holding());
  t += 5;
  check('once', rr.frame() === '');
  check('a lap before the board says live is not sent', rr.lap(goLocal + 1600) === null);
  rr.heard({ ...count, phase: 'live' });
  const l1 = rr.lap(goLocal + 1600.4);
  const l2 = rr.lap(goLocal + 3300.4);
  check('the first lap is the time since GO, the next since the last', l1.n === 1 && l1.ms === 1600 && l2.n === 2 && l2.ms === 1700);
  check('a lap of no time is not a lap', rr.lap(goLocal + 3300.4) === null && rr.lapsSent === 2);
  check('the laps went to the board', sent.filter((m) => m.t === 'lap').length === 2);
  t = goLocal + 4000;
  check('the race clock runs from GO', rr.elapsed() === 4000);
  rr.heard({ ...count, phase: 'live', rows: [rows[0], { ...rows[1], laps: 2, done: true }] });
  check('a pilot home sends no more laps', rr.lap(goLocal + 6000) === null && rr.myRow().done);

  /* A lap the board refused, in a three lap race: it took the first and
   * never the second. */
  const three = { ...count, laps: 3, phase: 'live' };
  rr.heard({ ...three, rows: [rows[0], { ...rows[1], laps: 1, total: 1600, best: 1600 }] });
  t = goLocal + 7000;
  const healed = rr.lap(goLocal + 7000.2);
  check('once it has had time to answer, the next lap is numbered and timed from what the board holds',
    healed.n === 2 && healed.ms === 5400);
  const quick = rr.lap(goLocal + 8600.2);
  check('and a lap sent before the board can have answered the last is numbered on from it', quick.n === 3 && quick.ms === 1600);

  const watcher = new RoomRace({ send: () => true, you: () => 3, now: () => t });
  watcher.heard(count);
  check('a pilot who is not in the race is not put on the grid', watcher.frame() === '' && watcher.lap(t) === null && !watcher.holding());
  /* The board lets a pilot onto a countdown's grid until COUNT_JOIN_MS
   * before GO, so a page offers it while there is that much and a little
   * over for the word to arrive. */
  watcher.welcome({ now: t + B + 7, race: { ...count, goAt: t + 4000 + B + 7 } }, t);
  check('a pilot not in a countdown is offered it with time to spare', watcher.canJoin());
  t += 4000 - COUNT_JOIN_MS - 100;
  check('and not once there is too little left', !watcher.canJoin());
  t -= 4000 - COUNT_JOIN_MS - 100;
  check('nor to a pilot already in it', !rr.canJoin() && !new RoomRace({ send: () => true, you: () => 1, now: () => t }).canJoin());
  watcher.heard({ ...count, phase: 'live' });
  check('nor once the race is live', !watcher.canJoin());

  rr.heard({
    ...count, n: 2, goAt: t + 5000 + B + 7, rows,
  });
  check('race two puts the craft on the grid again', rr.frame() === 'grid' && rr.lapsSent === 0);
  check('and the race clock waits for its GO', rr.elapsed() === 0);
  check('a track is raced by a five inch or a whoop, and freestyle is not', RoomRace.racing('5inch') && RoomRace.racing('whoop') && !RoomRace.racing('freestyle'));
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

/*
 * Twitch's chat, as a stand in on this machine, so a streamer room's names
 * are proved here the way they are live and the board never reaches the
 * real one. YouTube is left unset, so the board offers Twitch alone.
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

function startBoard(dir, port, file, secret) {
  const child = spawn(process.execPath, [join(dir, 'src', 'server.js')], {
    cwd: dir,
    env: {
      ...process.env, PORT: String(port), BOARD_FILE: file, DATABASE_URL: '', BOARD_ROOM_SECRET: secret,
      BOARD_TWITCH_IRC: `127.0.0.1:${ircServer.address().port}`, BOARD_YOUTUBE_KEY: '',
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

/* A pilot with a race, wired as together.js wires one: the welcome, the
 * pongs and the race reach the page's RoomRace, and what is said and
 * refused is kept to look at. */
function racer(url, handle) {
  const p = { races: [], said: [], refused: [] };
  p.s = new RoomSession({
    url,
    key: randomBytes(16).toString('hex'),
    handle,
    avatar: rollAvatar(rnd),
    onEvent: (name, data) => {
      const now = performance.now();
      if (name === 'welcome') {
        p.race.welcome(data, now);
      } else if (name === 'pong') {
        p.race.pong(data, now);
      } else if (name === 'race') {
        p.race.heard(data.race);
        p.races.push(data.race);
      } else if (name === 'say' || name === 'chat') {
        p.said.push(data);
      } else if (name === 'chatRefused') {
        p.refused.push(data.why);
      }
    },
  });
  p.race = new RoomRace({ send: (m) => p.s.link.raceSend(m), you: () => p.s.you });
  return p;
}

const raceOn = (p) => p.race.race || {};
const rowOf = (p, id) => (p.race.race && p.race.race.rows ? p.race.race.rows.find((r) => r.id === id) : null);

/*
 * Two pilots race two laps on a track through the board, on this
 * process's clock and the board's Date.now, so GO can be held to the
 * board's own time. The laps are made up, as the sim's own race would
 * report them; the board is expected to believe the possible ones and
 * nothing else.
 */
async function raceScene(url) {
  console.log('a race through the board');
  const a = racer(url, 'Racer A');
  const b = racer(url, 'Racer B');
  const did = { a: [], b: [] };
  const ticker = setInterval(() => {
    for (const [k, p] of [['a', a], ['b', b]]) {
      const f = p.race.frame();
      if (f) {
        did[k].push({
          f, at: performance.now(), wall: Date.now(), n: raceOn(p).n,
        });
      }
    }
  }, 1000 / 60);
  try {
    a.s.host({
      name: 'Race test', way: '5inch', map: 'selftest-gates', mapName: 'Self test gates', scale: 50,
    });
    check('the host is in a five inch room', await until(() => a.s.inRoom));
    b.s.join(a.s.room.code, { invite: a.s.invite });
    check('and a second racer joins it', await until(() => b.s.inRoom && a.s.link.pilots.size === 2));
    check('a racing room starts in the pit, with no race until somebody asks for one', RoomRace.racing(a.s.room.way) && a.race.phase === 'pit' && a.race.race === null);
    check('both pages learn the board\'s clock from pings', await until(() => !a.race.clock.coarseOnly && !b.race.clock.coarseOnly, 2000));
    const spread = Math.abs(a.race.clock.offset - b.race.clock.offset);
    const truthOffset = Date.now() - performance.now();
    const error = Math.abs(a.race.clock.offset - truthOffset);
    check(`and agree on it to a few ms (${spread.toFixed(2)} ms apart, ${error.toFixed(2)} ms from the truth)`, spread < 5 && error < 5);

    b.s.link.raceSend({ t: 'laps', n: 7 });
    a.s.link.raceSend({ t: 'laps', n: 2 });
    check('the host sets the laps, and only the host', await until(() => raceOn(a).laps === 2 && raceOn(b).laps === 2)
      && !b.races.some((r) => r.laps === 7));
    a.s.link.raceSend({ t: 'ready', on: true });
    check('one pilot ready is not a race', await until(() => raceOn(a).ready.length === 1) && a.race.phase === 'pit');
    b.s.link.raceSend({ t: 'ready', on: true });
    check('both ready starts the countdown with no press from the host', await until(() => a.race.phase === 'count' && b.race.phase === 'count'));
    const first = a.race.race;
    check('both race, in id order', first.racers.length === 2 && first.racers[0] < first.racers[1] && a.race.racing() && b.race.racing());
    check('each page puts its craft on the grid, once', await until(() => did.a.length === 1 && did.b.length === 1)
      && did.a[0].f === 'grid' && did.b[0].f === 'grid');
    const toGo = a.race.toGo();
    check(`and counts about five seconds down (${Math.round(toGo)} ms to go)`, toGo > 4500 && toGo <= 5050 && a.race.holding());
    check('no lap is sent before GO', a.race.lap(performance.now()) === null);
    check('GO comes once on each page', await until(() => did.a.length === 2 && did.b.length === 2, 7000)
      && did.a[1].f === 'go' && did.b[1].f === 'go');
    const late = [did.a[1].wall - first.goAt, did.b[1].wall - first.goAt];
    check(`at the board's GO, within a frame (${late.map((x) => x.toFixed(0)).join(' and ')} ms after it)`, late.every((x) => x > -5 && x < 45));
    check('the board goes live', await until(() => a.race.phase === 'live' && b.race.phase === 'live', 2000));

    /* Laps the board must not believe: shorter than any track, longer than
     * the race has been running, and out of order. */
    b.s.link.raceSend({ t: 'lap', n: 1, ms: 1000 });
    b.s.link.raceSend({ t: 'lap', n: 1, ms: 30000 });
    b.s.link.raceSend({ t: 'lap', n: 2, ms: 2000 });
    const goA = a.race.goLocal;
    const goB = b.race.goLocal;
    const l1 = a.race.lap(goA + 1600);
    check('A\'s first lap goes as the time since GO', l1 && l1.n === 1 && l1.ms === 1600);
    check('and the board takes it', await until(() => (rowOf(a, a.s.you) || {}).laps === 1));
    await until(() => performance.now() > goA + 1400, 3000);
    const l2 = a.race.lap(goA + 3300);
    check('A\'s second lap goes as the time since the first', l2 && l2.n === 2 && l2.ms === 1700);
    check('A is home', await until(() => (rowOf(b, a.s.you) || {}).done === true));
    check('and sends nothing after', a.race.lap(goA + 9000) === null);
    await until(() => performance.now() > goB + 1800, 3000);
    b.race.lap(goB + 1800);
    b.race.lap(goB + 3700);
    check('everybody home is the results', await until(() => a.race.phase === 'results' && b.race.phase === 'results'));
    const rows = raceOn(a).rows;
    check('A first on 3.3 s with a best of 1.6 s', rows[0].id === a.s.you && rows[0].total === 3300 && rows[0].best === 1600 && rows[0].done);
    check('B second on 3.7 s: none of the impossible laps counted', rows[1].id === b.s.you && rows[1].total === 3700 && rows[1].laps === 2);

    a.s.link.raceSend({ t: 'again' });
    check('one vote of two for another is not a majority', await until(() => raceOn(a).votes.length === 1) && a.race.phase === 'results');
    b.s.link.raceSend({ t: 'again' });
    check('two of two is race two', await until(() => a.race.phase === 'count' && raceOn(a).n === 2 && raceOn(b).n === 2));
    check('and both are on the grid again', await until(() => did.a.length === 3 && did.b.length === 3) && did.a[2].f === 'grid' && did.b[2].f === 'grid');
    b.s.link.raceSend({ t: 'dnf' });
    check('a pilot can retire in the countdown', await until(() => (rowOf(a, b.s.you) || {}).dnf === true));
    a.s.link.raceSend({ t: 'pit' });
    check('the host calls it off and the room is back in the pit', await until(() => a.race.phase === 'pit' && b.race.phase === 'pit')
      && raceOn(a).racers.length === 0 && !a.race.racing());
    await wait(200);
    check('and race two never said GO', !did.a.some((d) => d.n === 2 && d.f === 'go') && !did.b.some((d) => d.n === 2 && d.f === 'go'));
  } finally {
    clearInterval(ticker);
    a.s.leave();
    b.s.leave();
  }
}

/*
 * Talk, as the owner's rules have it: a listed room shows made up handles
 * and has quick chat only; a private room whose host turns typed chat on
 * has typed chat, through the board's filters.
 */
async function talkScene(url) {
  console.log('talk through the board');
  const a = racer(url, 'Talker A');
  const b = racer(url, 'Talker B');
  const c = racer(url, 'Talker C');
  const d = racer(url, 'Talker D');
  try {
    a.s.host({
      name: 'Listed talk', way: 'freestyle', map: 'city', mapName: 'The town', scale: 100, listed: true, typedChat: true,
    });
    check('a listed room opens', await until(() => a.s.inRoom));
    b.s.join(a.s.room.code, { invite: a.s.invite });
    check('and a second pilot joins', await until(() => b.s.inRoom && a.s.link.pilots.size === 2 && b.s.link.pilots.size === 2));
    check('with typed chat off, whatever the host asked for', a.s.room.typedChat === false);
    const seenA = b.s.link.pilots.get(a.s.you);
    const seenB = a.s.link.pilots.get(b.s.you);
    check(`and made up handles, never the typed ones (${seenA.handle}, ${seenB.handle})`, seenA.handle !== 'Talker A' && seenB.handle !== 'Talker B'
      && !/Talker/.test(JSON.stringify([...a.s.link.pilots.values(), ...b.s.link.pilots.values()])));

    a.s.say('hi');
    check('a quick line reaches the other pilot, by id', await until(() => b.said.some((m) => m.t === 'say' && m.line === 'hi' && m.id === a.s.you)));
    a.s.say('sell');
    a.s.chat('hello there', 'calm');
    check('typed chat in a listed room is refused', await until(() => a.refused.includes('off')));
    for (let i = 0; i < 3; i += 1) a.s.say('gg');
    check('a fourth line inside two seconds is refused as too quick', await until(() => a.refused.includes('slow')));
    await wait(150);
    check('the two before it went, and a line that is not a quick line did not', b.said.filter((m) => m.line === 'gg').length === 2
      && !b.said.some((m) => m.line === 'sell'));
    check('a pilot hears their own quick lines back, which is when their screen shows them',
      a.said.filter((m) => m.t === 'say' && m.id === a.s.you).map((m) => m.line).join() === 'hi,gg,gg');
    check('and never one the board refused as too quick', a.said.filter((m) => m.t === 'say' && m.line === 'gg').length === 2);

    c.s.host({
      name: 'Private talk', way: 'freestyle', map: 'city', mapName: 'The town', scale: 100, typedChat: true,
    });
    check('a private room opens', await until(() => c.s.inRoom));
    d.s.join(c.s.room.code, { invite: c.s.invite });
    check('and a second pilot joins with the invite', await until(() => d.s.inRoom && c.s.link.pilots.size === 2));
    check('with typed chat on and the handles the pilots typed', c.s.room.typedChat === true && d.s.link.pilots.get(c.s.you).handle === 'Talker C');
    c.s.chat('Nice line through the gate', 'smug');
    check('a typed line goes to everybody, the one who typed it too', await until(() => [c, d].every((p) => p.said.some((m) => m.t === 'chat'
      && m.text === 'Nice line through the gate' && m.face === 'smug' && m.id === c.s.you))));
    c.s.chat('ring me on 0412 345 678', 'calm');
    c.s.chat('come to www.example.com', 'calm');
    d.s.chat('x'.repeat(200), 'calm');
    d.s.chat('ok then', 'grin');
    check('a phone number and an address are refused', await until(() => c.refused.filter((w) => w === 'links').length === 2));
    check('a line too long is refused', await until(() => d.refused.includes('long')));
    check('a face that is not one is said calm', await until(() => c.said.some((m) => m.text === 'ok then' && m.face === 'calm')));
    check('and nothing refused reached anybody', ![c, d].some((p) => p.said.some((m) => /0412|example|xxxx/.test(m.text || ''))));
    const newLook = { ...d.s.link.avatar, hair: (d.s.link.avatar.hair + 1) % 4 };
    d.s.look(newLook);
    check('a new look from the room\'s page reaches the others', await until(() => c.s.link.pilots.get(d.s.you).avatar.hair === newLook.hair));
    check('and the pilot\'s own entry, which the room\'s page draws', d.s.link.pilots.get(d.s.you).avatar.hair === newLook.hair);
    check('and a hello after a drop carries it', d.s.link.avatar.hair === newLook.hair);
  } finally {
    for (const p of [a, b, c, d]) p.s.leave();
  }
}

/*
 * A streamer room's viewer proves their Twitch name by typing a code in
 * the stream's chat, as the room's page wires it: the code, the name on
 * everybody's list, the ticket that carries it through a drop, the host
 * putting the made up name back, and that account refused after.
 */
async function namesScene(url, deploy) {
  console.log('stream names through the board');
  const heard = { a: [], b: [] };
  const pilot = (handle, into) => new RoomSession({
    url,
    key: randomBytes(16).toString('hex'),
    handle,
    avatar: rollAvatar(rnd),
    onEvent: (name, data) => {
      if (name === 'claim' || name === 'named') into.push({ name, ...data });
    },
  });
  const a = pilot('Streamer', heard.a);
  const b = pilot('Viewer', heard.b);
  const lastClaim = (list) => [...list].reverse().find((m) => m.name === 'claim') || {};
  try {
    a.host({
      name: 'Stream night', way: 'freestyle', map: 'city', mapName: 'The town', scale: 100, streamer: true, stream: 'https://www.twitch.tv/AndAgainFPV',
    });
    check('a streamer room opens with its Twitch channel', await until(() => a.inRoom));
    check('which the board keeps as a channel, in lower case, and offers Twitch names alone',
      a.room.stream && a.room.stream.via === 'twitch' && a.room.stream.id === 'andagainfpv' && a.room.streamNames.join() === 'twitch');
    b.join(a.room.code);
    check('a viewer joins under a made up name', await until(() => b.inRoom && a.link.pilots.size === 2)
      && a.link.pilots.get(b.you).handle !== 'Viewer' && !a.link.pilots.get(b.you).via);
    check('and nobody reads the chat while nobody is waiting', irc.joined.size === 0);
    b.claim();
    check('asking gives a five character code, and where to type it', await until(() => lastClaim(heard.b).state === 'waiting')
      && /^[A-Z0-9]{5}$/.test(lastClaim(heard.b).code) && lastClaim(heard.b).at === 'andagainfpv');
    check('and the board joins the channel while it waits', await until(() => irc.joined.has('andagainfpv')));
    const { code } = lastClaim(heard.b);
    ircSay('andagainfpv', '4401', 'Lurker', `!fly ${code.replace(/./, (c) => (c === 'A' ? 'B' : 'A'))}`);
    ircSay('andagainfpv', '4402', 'SkittlesFPV', `gg !fly ${code.toLowerCase()} lets go`);
    check('the code typed in chat, in any case, names the viewer for everybody', await until(() => a.link.pilots.get(b.you).handle === 'SkittlesFPV'
      && a.link.pilots.get(b.you).via === 'twitch' && b.link.pilots.get(b.you).handle === 'SkittlesFPV'));
    check('and a wrong code from somebody else named nobody', ![...a.link.pilots.values()].some((p) => p.handle === 'Lurker'));
    check('the viewer is told it is done', lastClaim(heard.b).state === 'done' && lastClaim(heard.b).handle === 'SkittlesFPV');
    check('and the board lets the channel go once nobody is waiting', await until(() => !irc.joined.has('andagainfpv')));
    check('the account\'s id is in no message a pilot was sent', !JSON.stringify([heard.a, heard.b, a.room, [...a.link.pilots.values()]]).includes('4402'));

    await deploy();
    check('a deploy, and back in from the tickets, keeps the name', await until(() => a.inRoom && b.inRoom && a.link.pilots.size === 2
      && a.link.pilots.get(b.you) && a.link.pilots.get(b.you).handle === 'SkittlesFPV' && a.link.pilots.get(b.you).via === 'twitch', 15000));

    a.unname(b.you);
    check('the host puts the made up name back, for everybody', await until(() => a.link.pilots.get(b.you).handle !== 'SkittlesFPV'
      && !a.link.pilots.get(b.you).via && !b.link.pilots.get(b.you).via));
    check('and the viewer is told why', await until(() => lastClaim(heard.b).state === 'dropped'));
    await deploy();
    check('and after another deploy', await until(() => a.inRoom && b.inRoom && a.link.pilots.size === 2, 15000));
    heard.b.length = 0;
    b.claim();
    check('the viewer may ask again', await until(() => lastClaim(heard.b).state === 'waiting'));
    ircSay('andagainfpv', '4402', 'SkittlesFPV', `!fly ${lastClaim(heard.b).code}`);
    check('but that account is refused in this room, the deploy notwithstanding', await until(() => lastClaim(heard.b).state === 'dropped')
      && a.link.pilots.get(b.you).handle !== 'SkittlesFPV');
    heard.b.length = 0;
    b.claim();
    await until(() => lastClaim(heard.b).state === 'slow' || lastClaim(heard.b).state === 'waiting');
    check('asking twice inside five seconds is turned down as too quick', lastClaim(heard.b).state === 'slow');

    a.link.settings({ stream: '' });
    check('the host can take the stream off', await until(() => !b.room.stream));
    await wait(5100);
    heard.b.length = 0;
    b.claim();
    check('and then asking is turned down', await until(() => lastClaim(heard.b).state === 'off'));
  } finally {
    a.leave();
    b.leave();
  }
}

/*
 * The room's styles and the shell's, kept apart. Every room banner was
 * drawn at opacity 0 for a day because it wore .banner, the shell's own
 * launch line, which index.html starts invisible. Every check of it read
 * its words, which were there. So: no rule of the shell may land on the
 * room's elements by their class names alone, and no rule of the room may
 * reach outside #tg.
 */
console.log('the room\'s styles and the shell\'s');
{
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (p) => readFileSync(join(here, '..', p), 'utf8');
  const uncomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const shellCss = uncomment([...read('index.html').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n'));
  const { TOGETHER_CSS } = await import('../src/net/togetherstyle.js');
  const roomCss = uncomment(TOGETHER_CSS);
  const togetherJs = read('src/net/together.js');
  const ours = new Set();
  for (const m of togetherJs.matchAll(/\bh\(\s*[`'"][a-z0-9]*((?:\.[a-zA-Z][\w-]*)+)/g)) {
    for (const c of m[1].split('.').filter(Boolean)) ours.add(c);
  }
  for (const m of togetherJs.matchAll(/\bclassList\.(?:add|toggle)\(\s*'([\w-]+)'/g)) ours.add(m[1]);
  for (const m of roomCss.matchAll(/\.([a-zA-Z][\w-]*)/g)) ours.add(m[1]);
  /* Selectors of a sheet's plain rules, @media blocks opened up and
   * @keyframes left out. */
  const selectors = (css) => {
    const out = [];
    const flat = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    for (const m of flat.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      const sel = m[1].replace(/@media[^{]*\{/g, '').trim();
      if (sel && !sel.startsWith('@')) out.push(...sel.split(',').map((s) => s.trim()).filter(Boolean));
    }
    return out;
  };
  const reaching = [];
  for (const sel of selectors(shellCss)) {
    const last = sel.split(/\s*[\s>+~]\s*/).pop().replace(/::?[\w-]+(\([^)]*\))?/g, '');
    if (!last.startsWith('.') || /[#[]/.test(last)) continue;
    const classes = last.split('.').filter(Boolean);
    if (classes.length && classes.every((c) => ours.has(c))) reaching.push(sel);
  }
  check('no style of the shell lands on the room\'s elements by a class name alone', ours.size > 50 && reaching.length === 0,
    reaching.length ? reaching.slice(0, 6).join(' | ') : `${ours.size} class names`);
  const outside = selectors(roomCss).filter((s) => !s.startsWith('#tg') && !/^(from|to|\d+%)/.test(s));
  check('and no style of the room reaches outside #tg', outside.length === 0, outside.slice(0, 6).join(' | '));
}

console.log('the board and this client agree');
const boardDir = findBoard();
if (!boardDir) {
  console.log('  skip  no checkout of the board beside this one (set NET_BOARD to one)');
} else {
  const board = await import(pathToFileURL(join(boardDir, 'src', 'rooms.js')).href);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check('the same protocol', board.PROTOCOL === PROTOCOL);
  check('the same room codes', board.CODE_RE.source === CODE_RE.source);
  check('the refusals in the order of their close codes',
    same(Object.entries(board.REFUSALS).sort((x, y) => x[1] - y[1]).map(([k]) => k), REFUSALS)
    && Object.values(board.REFUSALS).every((code, i, all) => i === 0 || code === all[i - 1] + 1));
  check('the same pose units and sizes', same(board.SCALES, SCALES) && board.POSE_UP_BYTES === POSE_UP_BYTES && board.POSE_ENTRY_BYTES === POSE_ENTRY_BYTES);
  check('the same race ways and lap limit', same(board.RACE_WAYS, RACE_WAYS) && board.RACE_LAPS_MAX === RACE_LAPS_MAX);
  check('the same last moment to join a countdown', board.COUNT_JOIN_MS === COUNT_JOIN_MS);
  check('the same room sizes, a streamer room\'s included', board.ROOM_MAX === ROOM_MAX && board.STREAM_MAX === STREAM_MAX);
  check('the same quick lines, in the same words', [...QUICK, WAVE].every((q) => board.QUICK_LINES[q.line] === q.text)
    && Object.keys(board.QUICK_LINES).length === QUICK.length + 1);
  check('the same faces', same(board.FACES, EXPRESSIONS));
  check('the same avatar fields', same(board.AVATAR_FIELDS, AVATAR_FIELDS));
  let kept = true;
  for (let i = 0; i < 500; i += 1) {
    const a = rollAvatar(rnd);
    if (!same(board.normaliseAvatar(a), a)) kept = false;
  }
  check('every face this client can roll, the board keeps as it is', kept);
}

console.log('two pilots through a real board');
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

    await raceScene(url);
    await talkScene(url);
    await namesScene(url, async () => {
      board.kill('SIGTERM');
      await new Promise((r) => { board.once('exit', r); });
      board = startBoard(boardDir, port, file, secret);
      check('the new board started', await boardUp(port));
    });
  } finally {
    board.kill('SIGKILL');
    rmSync(scratch, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures);
