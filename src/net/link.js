/*
 * link.js: one pilot's connection to a room on the board.
 *
 * The board's half is src/rooms.js and src/ws.js in the leaderboard's
 * repository, and its README's "Multiplayer rooms" is the protocol: JSON
 * text for everything said once (host, join, settings, who came and went),
 * binary for the poses (src/net/pose.js). This file speaks the text half,
 * hands the binary half up untouched, and keeps the connection alive.
 *
 * KEEPING IT ALIVE IS THE TICKET. Every pilot in a room holds a ticket the
 * board sealed for that browser. When the socket drops, for a train going
 * into a tunnel or for the board being redeployed (close code 1012), this
 * reconnects and sends the ticket instead of the code, and the board puts
 * the pilot back in the same room as the same pilot. A deploy closes every
 * socket at once, so the first try after 1012 waits a random part of a
 * second, which spreads a room's thirty pilots over it instead of having
 * them all arrive in the same millisecond. Later tries back off to eight
 * seconds and carry on until the ticket expires, which is ten minutes after
 * it was last refreshed.
 *
 * WHAT IS NEVER RETRIED: a refusal (4000 to 4011: wrong password, a full
 * room, a ban, an older client) and a removal (4020 to 4022: kicked,
 * banned, or the same browser joining from another tab). Those are
 * answers, and asking again would only get the same one.
 *
 * WHAT THIS IS NOT ALLOWED TO DO is queue poses. A pose is worth something
 * for one frame; when the socket is behind, this drops the new one rather
 * than adding it to the queue, so a slow link costs smoothness and never
 * latency. That is the project's rule (latency first) applied to the wire.
 *
 * The transport the room session sees is three things: sendPose(bytes),
 * onPoses(bytes) and whether it is in. Stage 5 adds direct links to the
 * nearest pilots behind the same three, so nothing above this file
 * changes when it does.
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

/* The board's protocol version, src/rooms.js PROTOCOL. */
export const PROTOCOL = 1;
export const SOCKET_PATH = '/api/rooms/socket';

/* The board's close codes, in the order of its REFUSALS list. */
export const REFUSALS = Object.freeze([
  'bad', 'version', 'fields', 'notFound', 'password', 'full', 'banned', 'kicked', 'tooMany', 'busy', 'expired', 'hello',
]);
const CLOSE_RESTART = 1012;
const REFUSED_FIRST = 4000;
const REMOVED_FIRST = 4020;
const REMOVED_LAST = 4029;

/* A socket this far behind is not sent a pose. Four poses' worth of frame
 * overhead and then some: anything more is a queue. */
const POSE_BACKLOG = 256;
const RETRY_FIRST_MS = 250;
const RETRY_MAX_MS = 8000;
const RESTART_SPREAD_MS = 1000;
const CONNECT_MS = 10000;

/*
 * The address of the rooms for a board origin. The board's public origin
 * is a path behind the Worker on webfpv.org, which serves pages and does
 * not carry sockets, so production goes straight to the board's own
 * Render address. Anywhere else the board is served as itself, and the
 * socket is on the same host.
 */
export const PRODUCTION_ROOMS_ORIGIN = 'wss://webfpv-board.onrender.com';
export function roomsUrl(boardOrigin, override = '') {
  const pick = override || '';
  if (pick) {
    return `${pick.replace(/\/+$/, '').replace(/^http/, 'ws')}${SOCKET_PATH}`;
  }
  const origin = String(boardOrigin || '').replace(/\/+$/, '');
  if (/^https:\/\/(www\.)?webfpv\.org(\/|$)/.test(origin)) {
    return `${PRODUCTION_ROOMS_ORIGIN}${SOCKET_PATH}`;
  }
  return `${origin.replace(/^http/, 'ws')}${SOCKET_PATH}`;
}

export class RoomLink {
  /*
   * url: the socket's address. key: this browser's 32 hex key (the
   * rating key, src/share/rating.js, so one browser is one key on the
   * board). handle and avatar: what the other pilots are told. onEvent
   * (name, data) hears everything: 'welcome', 'joined', 'left', 'host',
   * 'room', 'pilots', 'away', 'removed', 'refused', 'retrying', 'lost',
   * 'closed', and from stages 4 to 6 'say', 'chat', 'chatRefused',
   * 'reported', 'reportFailed', 'settingsRefused', 'peers', 'signal',
   * 'ice', 'pong' and 'race'. onPoses(bytes) hears the binary frames.
   */
  constructor({
    url, key, handle = '', avatar = {}, onEvent = () => {}, onPoses = () => {},
    WebSocketImpl = globalThis.WebSocket, now = () => Date.now(),
    random = Math.random,
  }) {
    this.url = url;
    this.key = key;
    this.handle = handle;
    this.avatar = avatar;
    this.onEvent = onEvent;
    this.onPoses = onPoses;
    this.WebSocketImpl = WebSocketImpl;
    this.now = now;
    this.random = random;
    this.ws = null;
    this.state = 'idle';
    this.hello = null;
    this.ticket = '';
    this.ticketAt = 0;
    this.you = 0;
    this.hostId = 0;
    this.room = null;
    this.invite = '';
    /* What to open direct links through, from the welcome (stage 5), and
     * the room's race as the board last sent it (stage 6). */
    this.ice = null;
    this.race = null;
    this.pilots = new Map();
    this.retries = 0;
    this.retryTimer = null;
    this.connectTimer = null;
    this.awayOn = false;
    this.sentBytes = 0;
    this.gotBytes = 0;
  }

  get inRoom() {
    return this.state === 'in';
  }

  /* Make a room and be its host. room is what the board's README lists. */
  host(room) {
    this.start({ t: 'host', room });
  }

  /* Join a room by its code, with its password or an invite. */
  join(code, { password = '', invite = '' } = {}) {
    const msg = { t: 'join', code: String(code || '').toUpperCase() };
    if (password) msg.password = password;
    if (invite) msg.invite = invite;
    this.start(msg);
  }

  start(msg) {
    this.hello = msg;
    this.ticket = '';
    this.retries = 0;
    this.open(msg);
  }

  open(msg) {
    this.clearRetry();
    this.dropSocket();
    this.state = 'connecting';
    let ws;
    try {
      ws = new this.WebSocketImpl(this.url);
    } catch (e) {
      this.state = 'closed';
      this.onEvent('closed', { why: 'url', message: String(e && e.message ? e.message : e) });
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.sendJson({
        v: PROTOCOL, key: this.key, handle: this.handle, avatar: this.avatar, ...msg,
      });
      if (this.awayOn && msg.t === 'resume') {
        this.sendJson({ t: 'away', on: true });
      }
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      if (typeof e.data === 'string') {
        this.gotBytes += e.data.length;
        let m;
        try {
          m = JSON.parse(e.data);
        } catch (err) {
          return;
        }
        this.heard(m);
      } else {
        this.gotBytes += e.data.byteLength;
        if (this.state === 'in') {
          this.onPoses(new Uint8Array(e.data));
        }
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.dropSocket();
      this.closed(e.code, e.reason || '');
    };
    ws.onerror = () => {
      /* On an open socket onclose follows, with the code that says what to
       * do. A socket that never opened is another matter: a browser
       * follows with a 1006, but Node's WebSocket stays CONNECTING for
       * ever, so a failed connection is a drop here, once, whichever way
       * the runtime tells it. */
      if (this.ws !== ws || ws.readyState === 1) return;
      this.dropSocket();
      this.closed(1006, 'no connection');
    };
    /* A connection that neither opens nor fails, which a captive portal or
     * a half dead route can do, is given up on and tried again. */
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      if (this.ws !== ws || this.state === 'in') return;
      this.dropSocket();
      this.closed(1006, 'timed out');
    }, CONNECT_MS);
  }

  /* Forget the socket, closing it if it is still there to close. */
  dropSocket() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState < 2) {
      try {
        ws.close();
      } catch (e) {
        /* Not yet open, or already going. */
      }
    }
  }

  heard(m) {
    switch (m.t) {
      case 'welcome':
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }
        this.state = 'in';
        this.retries = 0;
        this.you = m.you;
        this.hostId = m.host;
        this.room = m.room;
        this.invite = m.invite || '';
        this.ice = m.ice || null;
        this.race = m.race || null;
        this.takeTicket(m.ticket);
        this.pilots.clear();
        for (const p of m.pilots || []) {
          this.pilots.set(p.id, p);
        }
        this.onEvent('welcome', m);
        break;
      case 'joined':
        this.pilots.set(m.pilot.id, m.pilot);
        this.onEvent('joined', m.pilot);
        break;
      case 'left': {
        /* Who it was goes with the word, because the list no longer
         * holds them once it is said. */
        const gone = this.pilots.get(m.id) || null;
        this.pilots.delete(m.id);
        this.onEvent('left', { ...m, pilot: gone });
        break;
      }
      case 'host':
        this.hostId = m.id;
        this.onEvent('host', m);
        break;
      case 'room':
        this.room = m.room;
        if (m.invite != null) this.invite = m.invite;
        this.takeTicket(m.ticket);
        this.onEvent('room', m);
        break;
      case 'pilots':
        this.pilots.clear();
        for (const p of m.pilots || []) {
          this.pilots.set(p.id, p);
        }
        this.onEvent('pilots', m);
        break;
      case 'ticket':
        this.takeTicket(m.ticket);
        break;
      case 'away': {
        const p = this.pilots.get(m.id);
        if (p) p.away = Boolean(m.on);
        this.onEvent('away', m);
        break;
      }
      case 'removed':
        this.ticket = '';
        this.onEvent('removed', m);
        break;
      case 'say':
      case 'chat':
      case 'chatRefused':
      case 'reported':
      case 'reportFailed':
      case 'settingsRefused':
      case 'peers':
      case 'signal':
      case 'pong':
        /* Stages 4 to 6: said, refused, linked and timed. The link only
         * passes them on; the session and the shell decide what they mean. */
        this.onEvent(m.t, m);
        break;
      case 'ice':
        this.ice = m.ice || null;
        this.onEvent('ice', m);
        break;
      case 'race':
        this.race = m.race || null;
        this.onEvent('race', m);
        break;
      case 'refused':
        /* A resume the board cannot honour is the end of this room for
         * this pilot, which the shell says differently from a refusal at
         * the door. */
        if (this.hello && this.state !== 'in' && this.ticket && (m.why === 'expired' || m.why === 'notFound')) {
          this.ticket = '';
          this.onEvent('lost', m);
        } else {
          this.onEvent('refused', m);
        }
        break;
      default:
        /* A newer board's word this client does not know: ignored, so a
         * deploy of the board never breaks a client that is mid flight. */
        break;
    }
  }

  takeTicket(ticket) {
    if (typeof ticket === 'string' && ticket) {
      this.ticket = ticket;
      this.ticketAt = this.now();
    }
  }

  closed(code, reason) {
    const wasIn = this.state === 'in';
    this.state = 'closed';
    const refused = code >= REFUSED_FIRST && code < REFUSED_FIRST + REFUSALS.length;
    const removed = code >= REMOVED_FIRST && code <= REMOVED_LAST;
    if (refused || removed || code === 1000 || !this.hello) {
      this.onEvent('closed', { code, reason, wasIn });
      return;
    }
    /* A drop or a deploy. Back with the ticket if there is one; a pilot
     * who never got in has no ticket and tries the door again. */
    this.retries += 1;
    let wait = Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * (2 ** (this.retries - 1)));
    if (code === CLOSE_RESTART && this.retries === 1) {
      wait = 100 + this.random() * RESTART_SPREAD_MS;
    }
    this.state = 'retrying';
    this.onEvent('retrying', { code, reason, inMs: Math.round(wait), tries: this.retries });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.ticket) {
        this.open({ t: 'resume', ticket: this.ticket });
      } else {
        this.open(this.hello);
      }
    }, wait);
  }

  clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  sendJson(msg) {
    if (!this.ws || this.ws.readyState !== 1) {
      return false;
    }
    const text = JSON.stringify(msg);
    this.ws.send(text);
    this.sentBytes += text.length;
    return true;
  }

  /* One pose, or nothing if the socket is behind: never a queue. */
  sendPose(bytes) {
    const ws = this.ws;
    if (this.state !== 'in' || !ws || ws.readyState !== 1 || ws.bufferedAmount > POSE_BACKLOG) {
      return false;
    }
    ws.send(bytes);
    this.sentBytes += bytes.byteLength;
    return true;
  }

  /* Paused, or in an overlay: the others see the tag dim. */
  away(on) {
    this.awayOn = Boolean(on);
    this.sendJson({ t: 'away', on: this.awayOn });
  }

  settings(room) {
    this.sendJson({ t: 'settings', room });
  }

  hostAction(t, id) {
    this.sendJson({ t, id });
  }

  /* Stage 4. A quick chat word (the board's QUICK_LINES), a typed line
   * with the face it is said with, and a report. */
  say(line) {
    return this.sendJson({ t: 'say', line });
  }

  chat(text, face) {
    return this.sendJson({ t: 'chat', text, face });
  }

  report(id, why) {
    return this.sendJson({ t: 'report', id, why });
  }

  /* Stage 5. This client can link directly; an offer or an answer for one
   * pilot; and whether the link to one pilot is up. */
  p2p(on) {
    return this.sendJson({ t: 'p2p', on: Boolean(on) });
  }

  signal(to, data) {
    return this.sendJson({ t: 'signal', to, data });
  }

  direct(id, on) {
    return this.sendJson({ t: 'direct', id, on: Boolean(on) });
  }

  /* Stage 6. A ping for the board's clock, and the race's own words:
   * ready, laps, start, lap, dnf, again and pit. */
  ping(c) {
    return this.sendJson({ t: 'ping', c });
  }

  raceSend(msg) {
    return this.sendJson(msg);
  }

  /* Gone on purpose: no retry, and the others are told 'left'. */
  leave() {
    this.clearRetry();
    this.hello = null;
    this.ticket = '';
    const ws = this.ws;
    if (ws && ws.readyState === 1) {
      this.sendJson({ t: 'leave' });
      ws.close(1000, 'leave');
      this.ws = null;
    }
    this.dropSocket();
    this.state = 'idle';
  }
}
