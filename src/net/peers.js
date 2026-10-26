/*
 * peers.js: direct links to the nearest pilots.
 *
 * Stage 5 of the multiplayer plan the owner approved on 25 October 2026.
 * The board relays every pose (src/rooms.js there), and that is what a room
 * costs: about 15 MB an hour down for each pilot in a full room. The pilots
 * that matter most, the eight nearest, are the ones a direct link can carry
 * instead, so each page opens a WebRTC data channel to the pilots the board
 * pairs it with, sends them the same 16 bytes it sends the board, and the
 * board leaves a pair out of its relay once both say their link is up.
 *
 * WHO LINKS TO WHOM is the board's call, from the near sets it already
 * keeps: it sends each page the ids to link to ('peers') whenever they
 * change, and carries one offer and one answer between two paired pages
 * ('signal') and nothing else. The lower id offers, so two pages never
 * offer to each other at once. There is no trickle: a page waits for its
 * candidates (at most GATHER_MS) and sends them in the description, which
 * is one message each way rather than a dozen.
 *
 * WHAT THE OTHER PILOT LEARNS. In a room that does not hide addresses the
 * link may be direct, and two pilots see each other's address, as any
 * game's peer link does. In a room that hides them (every listed and
 * school safe room) the board hands out Cloudflare TURN with relay: true,
 * the page refuses every candidate but a relayed one, and neither ever sees
 * the other's address. Without TURN such a room has no direct links at all
 * and stays on the board's relay, which costs bytes and nothing else.
 *
 * A LINK THAT FAILS falls back to the relay the moment it does: the page
 * says direct off, the board starts relaying the pair again on its next
 * tick, and the page tries the link again later. Poses that arrive both
 * ways while a link comes or goes are the same pose twice, and the remote
 * pilot's buffer drops the second by its sender clock (src/net/remote.js).
 *
 * The constructor takes the RTCPeerConnection to use, so the self test can
 * drive all of this in Node with a pair of fakes that talk to each other.
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

/* How long to wait for candidates before sending what there is. */
export const GATHER_MS = 3000;
/* A link that has not opened by now is given up and tried again later. */
const OPEN_MS = 12000;
/* After a failure, how long before the same pair tries again. */
const RETRY_MS = 15000;
/* A channel with this much unsent gets no pose: a pose is worth nothing
 * late, and the next one replaces it. */
const CHANNEL_BACKLOG = 4096;

export class Peers {
  /*
   * link: the RoomLink, for signal, direct and p2p. onPose(id, bytes): a
   * pose that came over a link, the 16 bytes as sent. RTC: the
   * RTCPeerConnection constructor, or null where there is none. now: a
   * clock for the retries.
   */
  constructor({
    link, onPose, RTC = globalThis.RTCPeerConnection || null, now = () => Date.now(), log = () => {},
  }) {
    this.link = link;
    this.onPose = onPose;
    this.RTC = RTC;
    this.now = now;
    this.log = log;
    this.ice = null;
    /* id -> { pc, channel, open, timer, offered } */
    this.links = new Map();
    /* id -> when it may be tried again */
    this.cooldown = new Map();
    this.wanted = new Set();
    this.announced = false;
    this.sent = 0;
    this.heard = 0;
  }

  /* Can this page link at all: WebRTC exists, and the room allows it. */
  get able() {
    return Boolean(this.RTC && this.ice && Array.isArray(this.ice.servers));
  }

  /* What to link through, from the welcome or a later 'ice'. Null means
   * no direct links in this room. */
  setIce(ice, you) {
    this.you = you;
    this.ice = ice && Array.isArray(ice.servers) && ice.servers.length ? ice : null;
    if (!this.able) {
      this.closeAll();
      if (this.announced) {
        this.link.p2p(false);
        this.announced = false;
      }
      return;
    }
    if (!this.announced) {
      this.announced = this.link.p2p(true) !== false;
    }
  }

  /* A fresh room, after a welcome: every old link belongs to old ids. */
  reset() {
    this.closeAll();
    this.cooldown.clear();
    this.wanted.clear();
    this.announced = false;
  }

  /* The board's list of who to link to. */
  want(ids) {
    this.wanted = new Set(Array.isArray(ids) ? ids : []);
    for (const id of [...this.links.keys()]) {
      if (!this.wanted.has(id)) {
        this.drop(id, false);
      }
    }
    this.tick();
  }

  /* Start the links that are wanted and not started; the lower id offers.
   * Called on every list and now and then, for the retries. */
  tick() {
    if (!this.able) {
      return;
    }
    const at = this.now();
    for (const id of this.wanted) {
      if (this.links.has(id) || (this.cooldown.get(id) || 0) > at) {
        continue;
      }
      if (this.you < id) {
        this.offer(id);
      }
    }
  }

  config() {
    return {
      iceServers: this.ice.servers,
      iceTransportPolicy: this.ice.relay ? 'relay' : 'all',
    };
  }

  make(id) {
    const pc = new this.RTC(this.config());
    const l = {
      pc, channel: null, open: false, timer: null,
    };
    this.links.set(id, l);
    l.timer = setTimeout(() => {
      if (this.links.get(id) === l && !l.open) {
        this.fail(id, 'never opened');
      }
    }, OPEN_MS);
    pc.onconnectionstatechange = () => {
      if (this.links.get(id) !== l) return;
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') {
        this.fail(id, s);
      }
    };
    pc.ondatachannel = (e) => {
      if (this.links.get(id) === l) {
        this.channel(id, l, e.channel);
      }
    };
    return l;
  }

  channel(id, l, ch) {
    l.channel = ch;
    ch.binaryType = 'arraybuffer';
    ch.onopen = () => {
      if (this.links.get(id) !== l) return;
      l.open = true;
      clearTimeout(l.timer);
      this.link.direct(id, true);
    };
    ch.onclose = () => {
      if (this.links.get(id) === l) {
        this.fail(id, 'closed');
      }
    };
    ch.onmessage = (e) => {
      if (this.links.get(id) !== l || !(e.data instanceof ArrayBuffer)) return;
      this.heard += 1;
      this.onPose(id, new Uint8Array(e.data));
    };
  }

  /* The description once candidates are in, or after GATHER_MS with what
   * there is. */
  gathered(pc) {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const t = setTimeout(resolve, GATHER_MS);
      const prev = pc.onicegatheringstatechange;
      pc.onicegatheringstatechange = (e) => {
        if (prev) prev(e);
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(t);
          resolve();
        }
      };
    });
  }

  async offer(id) {
    const l = this.make(id);
    try {
      this.channel(id, l, l.pc.createDataChannel('pose', { ordered: false, maxRetransmits: 0 }));
      await l.pc.setLocalDescription(await l.pc.createOffer());
      await this.gathered(l.pc);
      if (this.links.get(id) !== l) return;
      const d = l.pc.localDescription;
      this.link.signal(id, { type: d.type, sdp: d.sdp });
    } catch (e) {
      this.fail(id, e.message || 'offer');
    }
  }

  /* An offer or an answer from a pilot the board paired with this one. */
  async signal(from, data) {
    if (!this.able || !data || (data.type !== 'offer' && data.type !== 'answer') || typeof data.sdp !== 'string') {
      return;
    }
    if (data.type === 'offer') {
      /* A fresh offer replaces whatever was there: the other side gave up
       * on it and started again. */
      if (this.links.has(from)) {
        this.drop(from, false);
      }
      const l = this.make(from);
      try {
        await l.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        await l.pc.setLocalDescription(await l.pc.createAnswer());
        await this.gathered(l.pc);
        if (this.links.get(from) !== l) return;
        const d = l.pc.localDescription;
        this.link.signal(from, { type: d.type, sdp: d.sdp });
      } catch (e) {
        this.fail(from, e.message || 'answer');
      }
      return;
    }
    const l = this.links.get(from);
    if (!l) {
      return;
    }
    try {
      await l.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    } catch (e) {
      this.fail(from, e.message || 'answer');
    }
  }

  /* A link gone wrong: back on the relay now, and again later. */
  fail(id, why) {
    this.log(`link to ${id}: ${why}`);
    this.drop(id, true);
    this.cooldown.set(id, this.now() + RETRY_MS);
  }

  drop(id, said) {
    const l = this.links.get(id);
    if (!l) {
      return;
    }
    this.links.delete(id);
    clearTimeout(l.timer);
    if (l.open || said) {
      this.link.direct(id, false);
    }
    try {
      if (l.channel) l.channel.close();
      l.pc.close();
    } catch (e) {
      /* Already closed. */
    }
  }

  closeAll() {
    for (const id of [...this.links.keys()]) {
      this.drop(id, false);
    }
  }

  /* One pose to every open link. Returns how many it went to. */
  send(bytes) {
    let n = 0;
    for (const l of this.links.values()) {
      const ch = l.channel;
      if (l.open && ch && ch.readyState === 'open' && ch.bufferedAmount <= CHANNEL_BACKLOG) {
        try {
          ch.send(bytes);
          n += 1;
        } catch (e) {
          /* A channel closing under us: its onclose does the rest. */
        }
      }
    }
    this.sent += n;
    return n;
  }

  /* How many links are up, for the signal bars and the admin's sums. */
  openCount() {
    let n = 0;
    for (const l of this.links.values()) {
      if (l.open) n += 1;
    }
    return n;
  }

  isDirect(id) {
    const l = this.links.get(id);
    return Boolean(l && l.open);
  }
}
