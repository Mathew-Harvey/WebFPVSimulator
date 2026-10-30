/*
 * roombots.js: bots in a room, the owner's ask of 2026-10-29 ("multiplayer
 * you can fill the roster with bots"). One transport for every mini game:
 * ribbon cutting (src/game/ribbons.js RibbonRoom), the dogfight, and the
 * roster page that seats them.
 *
 * A bot is a SEAT the host adds on the board (src/rooms.js in the board's
 * repository: botAdd, botDrop, botSkill), with a pilot id from
 * BOT_ID_FIRST up and a name from the board's closed list. The host's page
 * flies every bot and nobody else's does: each feed its game hands this
 * module where each bot is (pose), and this module sends them all in one
 * binary frame at most every POSE_MS, the 15 bytes a pilot's own pose
 * carries, with the bot's id in front. The board puts them in its pose
 * frames like any pilot, so on every other page a bot arrives through
 * RoomSession.eachRemote with pilot = { id, handle, avatar, bot: true,
 * skill }. A new host's page takes the same seats over.
 *
 * What a bot costs: a pilot's pose, 16 bytes, to every page but the host's,
 * at 10 a second (the board's BOT_EVERY), and one frame of 16 bytes a bot
 * up from the host at 20 a second.
 *
 *   createRoomBots(session)  for the room session (src/net/room.js)
 *     seats()                [{ id, name, skill }], the board's word
 *     add(skill)             a seat, Promise of its id, or null if refused
 *     drop(id), skill(id, s) the host's changes
 *     on('seats', fn)        every change; off('seats', fn)
 *     mine()                 whether this page is the host flying them
 *     pose(id, x, y, z, fx, fy, fz, ux, uy, uz)
 *                            a bot's place, world metres, its nose and up
 *     heard(seats)           the board's list (src/net/together.js)
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

import { encodePose, POSE_UP_BYTES } from './pose.js';

export const KIND_BOTS = 2;
export const BOT_ID_FIRST = 201;
export const BOTS_MAX = 7;
export const BOT_SKILLS = Object.freeze(['rookie', 'pilot', 'ace']);
/* A bot's livery, by seat: the dogfight's (src/render/dogfight.js
 * BOT_LIVERY), so a bot is the same colour on the host's page, which draws
 * it as the dogfight draws its own, and on everybody else's. */
const BOT_LIVERY = [0, 2, 9, 1, 4, 7, 6, 5];
const POSE_MS = 50;
const ADD_WAIT_MS = 4000;

export function isBotId(id) {
  return id >= BOT_ID_FIRST && id < BOT_ID_FIRST + BOTS_MAX;
}

/* A bot as the room's pilot list holds a pilot. */
export function botPilot(seat) {
  const slot = seat.id - BOT_ID_FIRST + 1;
  return {
    id: seat.id, handle: seat.name, skill: seat.skill, bot: true, away: false, avatar: { livery: BOT_LIVERY[slot] + 1 },
  };
}

/* A craft's quaternion from its nose and its up, the craft's own forward
 * being minus Z and its up plus Y. */
function quatOf(fx, fy, fz, ux, uy, uz, q) {
  let zx = -fx; let zy = -fy; let zz = -fz;
  const d = zx * ux + zy * uy + zz * uz;
  zx -= ux * d; zy -= uy * d; zz -= uz * d;
  let m = Math.sqrt(zx * zx + zy * zy + zz * zz);
  if (m < 1e-8) {
    zx = 0; zy = 0; zz = 1; m = 1;
  }
  zx /= m; zy /= m; zz /= m;
  const xx = uy * zz - uz * zy;
  const xy = uz * zx - ux * zz;
  const xz = ux * zy - uy * zx;
  const m00 = xx; const m01 = ux; const m02 = zx;
  const m10 = xy; const m11 = uy; const m12 = zy;
  const m20 = xz; const m21 = uz; const m22 = zz;
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q.w = 0.25 / s; q.x = (m21 - m12) * s; q.y = (m02 - m20) * s; q.z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q.w = (m21 - m12) / s; q.x = 0.25 * s; q.y = (m01 + m10) / s; q.z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q.w = (m02 - m20) / s; q.x = (m01 + m10) / s; q.y = 0.25 * s; q.z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q.w = (m10 - m01) / s; q.x = (m02 + m20) / s; q.y = (m12 + m21) / s; q.z = 0.25 * s;
  }
  return q;
}

export function createRoomBots(session) {
  let list = [];
  const fns = new Set();
  const waiting = [];
  const up = new Uint8Array(POSE_UP_BYTES);
  const frame = new Uint8Array(2 + BOTS_MAX * 16);
  const at = new Map();
  const q = {
    x: 0, y: 0, z: 0, w: 1,
  };
  let sentAt = -1e9;

  function mine() {
    return Boolean(session && session.inRoom && session.you === session.link.hostId);
  }

  function send(msg) {
    if (session && session.inRoom && mine()) {
      session.link.sendJson(msg);
      return true;
    }
    return false;
  }

  /* Every bot's last place, in one frame, at most every POSE_MS. */
  function flush() {
    const t = session.now();
    if (t - sentAt < POSE_MS - 4 || !at.size || !mine()) {
      return;
    }
    let n = 0;
    for (const [id, p] of at) {
      if (!list.some((s) => s.id === id)) continue;
      quatOf(p[3], p[4], p[5], p[6], p[7], p[8], q);
      encodePose(up, session.units, Math.round(t), 0x04, p[0], p[1], p[2], q.x, q.y, q.z, q.w);
      const o = 2 + n * 16;
      frame[o] = id;
      frame.set(up.subarray(1, 16), o + 1);
      n += 1;
    }
    if (!n) {
      return;
    }
    frame[0] = KIND_BOTS;
    frame[1] = n;
    if (session.link.sendPose(frame.slice(0, 2 + n * 16))) {
      sentAt = t;
    }
  }

  return {
    seats() {
      return list;
    },
    mine,
    add(skill = 'rookie') {
      const had = new Set(list.map((s) => s.id));
      if (!send({ t: 'botAdd', skill })) {
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        const w = { had, resolve, until: session.now() + ADD_WAIT_MS };
        waiting.push(w);
        setTimeout(() => {
          const i = waiting.indexOf(w);
          if (i >= 0) {
            waiting.splice(i, 1);
            resolve(null);
          }
        }, ADD_WAIT_MS);
      });
    },
    drop(id) {
      send({ t: 'botDrop', id });
    },
    skill(id, s) {
      send({ t: 'botSkill', id, skill: s });
    },
    on(name, fn) {
      if (name === 'seats') fns.add(fn);
    },
    off(name, fn) {
      if (name === 'seats') fns.delete(fn);
    },
    pose(id, x, y, z, fx, fy, fz, ux, uy, uz) {
      let p = at.get(id);
      if (!p) {
        p = new Float64Array(9);
        at.set(id, p);
      }
      p[0] = x; p[1] = y; p[2] = z;
      p[3] = fx; p[4] = fy; p[5] = fz;
      p[6] = ux; p[7] = uy; p[8] = uz;
      flush();
    },
    heard(seats) {
      list = Array.isArray(seats) ? seats.filter((s) => s && isBotId(s.id)) : [];
      for (const id of [...at.keys()]) {
        if (!list.some((s) => s.id === id)) at.delete(id);
      }
      for (const w of waiting.splice(0)) {
        const fresh = list.find((s) => !w.had.has(s.id));
        if (fresh) {
          w.resolve(fresh.id);
        } else {
          waiting.push(w);
        }
      }
      for (const fn of fns) {
        try {
          fn(list);
        } catch (e) {
          console.warn('roombots: a seats listener threw', e);
        }
      }
    },
  };
}
