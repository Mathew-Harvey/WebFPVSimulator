/*
 * room.js: a flight shared with other pilots, as the shell sees it.
 *
 * Three jobs, none of which touch the physics. It sends this pilot's
 * rendered pose twenty times a second, read from the same interpolated
 * world pose the hero craft is drawn at; it keeps a RemotePilot for every
 * other pilot in the room and feeds it the poses the board relays; and it
 * answers "where is each of them now" once a frame for the renderer. The
 * connection itself is src/net/link.js, and the craft they are drawn as is
 * src/render/roomcraft.js. Stage 2 of the multiplayer plan, behind ?mp=1.
 *
 * SENDING NOTHING IS A FEATURE. A pose that has not changed since the last
 * one sent is not sent again: a pilot parked on the pad, paused or reading
 * a menu costs the board and everyone in the room nothing, and the board
 * already gives a pilot who arrives later the last pose it holds. "Not
 * changed" is under a pose unit of movement and a hundredth of a degree of
 * turn, which is below what the wire carries anyway.
 *
 * The pilot's own clock is performance.now, the same clock the frame loop
 * runs on, sent as its low sixteen bits; remote.js learns each sender's
 * clock from their poses, so no clocks are ever set or compared.
 *
 * No three.js here either, so scripts/net-selftest.js can put a session
 * through a real board in Node.
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

import { RoomLink } from './link.js';
import {
  POSE_UP_BYTES, SCALES, decodeFrame, encodePose, poseFlags,
} from './pose.js';
import { RemotePilot } from './remote.js';

/* Twenty a second, the board's relay rate for near pilots. */
export const POSE_INTERVAL_MS = 50;
const POSE_SLACK_MS = 4;
/* Under a hundredth of a degree of turn the attitude counts as unchanged.
 * The dot of two unit quaternions is the cosine of half the turn between
 * them, and one minus the cosine of half a hundredth of a degree is about
 * 3.8e-9. */
const SAME_TURN_DOT = 1 - 3.8e-9;

export class RoomSession {
  /*
   * url, key, handle, avatar: as RoomLink. onEvent hears the link's
   * events, after the session has acted on them. now: the frame clock.
   */
  constructor({
    url, key, handle, avatar, onEvent = () => {}, now = () => performance.now(), WebSocketImpl,
  }) {
    this.now = now;
    this.onEvent = onEvent;
    this.units = SCALES[0];
    this.remotes = new Map();
    this.up = new Uint8Array(POSE_UP_BYTES);
    this.lastSentAt = -Infinity;
    this.last = {
      flags: -1, ix: 0, iy: 0, iz: 0, qx: 0, qy: 0, qz: 0, qw: 1,
    };
    this.posesSent = 0;
    this.posesHeard = 0;
    this.scratch = {
      px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false, spinning: false,
    };
    this.link = new RoomLink({
      url,
      key,
      handle,
      avatar,
      WebSocketImpl,
      onEvent: (name, data) => this.heard(name, data),
      onPoses: (bytes) => this.poses(bytes),
    });
  }

  get inRoom() {
    return this.link.inRoom;
  }

  get you() {
    return this.link.you;
  }

  get room() {
    return this.link.room;
  }

  get invite() {
    return this.link.invite;
  }

  host(room) {
    this.link.host(room);
  }

  join(code, opts) {
    this.link.join(code, opts);
  }

  away(on) {
    this.link.away(on);
  }

  leave() {
    this.link.leave();
    this.remotes.clear();
  }

  heard(name, data) {
    if (name === 'welcome' || name === 'room') {
      const units = data.room && data.room.scale;
      if (SCALES.includes(units) && units !== this.units) {
        this.units = units;
      }
      if (name === 'welcome') {
        /* A resume after a deploy can come back with other ids; the poses
         * held for the old ones would be drawn at the wrong pilots. */
        this.remotes.clear();
        this.last.flags = -1;
      }
    } else if (name === 'left') {
      this.remotes.delete(data.id);
    }
    this.onEvent(name, data);
  }

  poses(bytes) {
    const at = this.now();
    decodeFrame(bytes, this.units, (id, pose) => {
      if (id === this.link.you || !this.link.pilots.has(id)) {
        return;
      }
      let r = this.remotes.get(id);
      if (!r) {
        r = new RemotePilot(id);
        this.remotes.set(id, r);
      }
      if (r.push(pose, at)) {
        this.posesHeard += 1;
      }
    });
  }

  /*
   * This pilot's pose, every frame, in scene world metres, whether the
   * props are turning, and how many times the craft has been put back.
   * Sends at most one pose every POSE_INTERVAL_MS, and none when nothing
   * changed. Returns true when one went. Positional, so the frame loop
   * that calls it allocates nothing.
   */
  uplink(px, py, pz, qx, qy, qz, qw, spinning = false, resets = 0) {
    if (!this.link.inRoom) {
      return false;
    }
    const t = this.now();
    /* Frames do not land on 50 ms, so three 16.7 ms frames can measure
     * 49.9 and a 60 Hz display would send every fourth: 15 a second. The
     * slack keeps it at every third, and the board's limit of 40 a second
     * is still a long way off. */
    if (t - this.lastSentAt < POSE_INTERVAL_MS - POSE_SLACK_MS) {
      return false;
    }
    const flags = poseFlags(spinning, resets);
    const ix = Math.round(px * this.units);
    const iy = Math.round(py * this.units);
    const iz = Math.round(pz * this.units);
    const L = this.last;
    const dot = Math.abs(qx * L.qx + qy * L.qy + qz * L.qz + qw * L.qw);
    if (flags === L.flags && ix === L.ix && iy === L.iy && iz === L.iz && dot >= SAME_TURN_DOT) {
      return false;
    }
    encodePose(this.up, this.units, Math.round(t), flags, px, py, pz, qx, qy, qz, qw);
    if (!this.link.sendPose(this.up)) {
      return false;
    }
    this.lastSentAt = t;
    L.flags = flags;
    L.ix = ix;
    L.iy = iy;
    L.iz = iz;
    L.qx = qx;
    L.qy = qy;
    L.qz = qz;
    L.qw = qw;
    this.posesSent += 1;
    return true;
  }

  /*
   * Every other pilot's pose for this frame: calls draw(id, pose, pilot)
   * for each one with a pose to draw, pose being one reused object and
   * pilot the board's { id, handle, avatar, away }.
   */
  eachRemote(draw) {
    const t = this.now();
    for (const r of this.remotes.values()) {
      const pilot = this.link.pilots.get(r.id);
      if (pilot && r.sample(t, this.scratch)) {
        draw(r.id, this.scratch, pilot);
      }
    }
  }
}
