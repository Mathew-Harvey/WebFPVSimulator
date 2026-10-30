/*
 * goatroom.js: goat herding in a multiplayer room. The owner's ask of
 * 2026-10-29: "Every map should be available with friends so multiplayer
 * or single player, bots should be able to be added to either", with his
 * pick of the same day, "Most goats wins": every goat that gets into Heads'
 * garage is whoever pushed it in last.
 *
 * THE DOGFIGHT ROOM'S SLOTS, THE GOAT ROUND'S HERDING. A GoatRoom is the
 * DogfightRoom (src/game/dogroom.js) for who is in the room, where the
 * room drew them and which bots the host's page flies, with the bots
 * herding as GoatRound's do (src/game/goatround.js), and nothing fired.
 *
 * THE HERD IS THE HOST'S. Two quads leaning on one goat from two pages
 * would send it two ways, so one page has to say where it is. The host's
 * page steps the map's herd with every pilot and every bot in it as
 * pushers, says when a goat gets home and whose it was (gtHome, which the
 * board counts, src/rooms.js goatsMessage), and sends where the goats are
 * that moved, four times a second, and all of them every four seconds
 * (gtHerd). Every other page steps its own herd the same way, with the same
 * pilots in it, so a goat runs from a quad on every page at once, and is
 * pulled back to the host's every time it hears. A goat on this page is a
 * quarter second behind the host's at worst, and the pull is gentle when
 * the two are close, so a friend's goat does not jump.
 *
 * Rounds are the board's, as every room game's: the host starts one, the
 * board says GO and when it ends, and every page lets the herd out to the
 * same places at the round's start because the let out is numbered by the
 * board's round (herd.reset(n)).
 *
 * WHAT IT COSTS. On the host: the herd stepped with the others in it,
 * which is the solo round's cost, and a few hundred bytes of herd four
 * times a second while goats move. On everybody else: the same step, and
 * reading those bytes. Nothing is allocated on a feed but the herd message
 * itself, four times a second on the host's page.
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

import { DOGFIGHT_EVERY, ME } from './dogfight.js';
import { DogfightRoom, ROOM_SLOTS } from './dogroom.js';
import { GoatRound, herding } from './goatround.js';

export { ROOM_SLOTS };

/* The herd's word for a goat at home (src/maps/goats/herd.js). */
const HOME = 2;
/* How often the host sends the goats that moved, and all of them. */
const HERD_EVERY_MS = 250;
const WHOLE_EVERY_MS = 4000;
/* Moved this far since it was last sent, plan metres, and a goat is sent:
 * a goat on the run at once, one grazing only when it has wandered off,
 * because every page grazes its goats the same slow way and a hundred of
 * them four times a second was five kilobytes a second for nothing. */
const MOVED = 0.05;
const MOVED_GRAZING = 1;
const GRAZE = 0;
/* Further than this from the host's, plan metres, and a goat is put where
 * the host says; nearer, it is pulled half way, a hearing at a time. */
const SNAP = 2;
/* The bytes of one goat: its number, x and y in 5 cm, its velocity in 5 cm
 * a second, its mode and its fear. */
const GOAT_BYTES = 9;

export class GoatRoom extends DogfightRoom {
  /*
   * world: as the Dogfight's. pen: the goat map's game (map.goatGame), as
   * GoatRound's. now: this page's clock, ms.
   */
  constructor(world, { now = () => performance.now(), seed = 1, pen = null } = {}) {
    super(world, { now, seed });
    herding(this, pen);
    this.goatRules = { game: 'goats', bots: 0, skill: 'pilot', round: '3m' };
    this.state = {
      phase: 'pit', round: '3m', n: 0, goAt: 0, endAt: 0, total: 0, home: 0, winner: null, rows: [],
    };
    this.winner = -1;
    this.homeN = 0;
    this.herdFrom = -1;
    const N = this.herd ? this.herd.count : 0;
    /* Where each goat was when the host last sent it. */
    this.sentX = new Float64Array(N);
    this.sentY = new Float64Array(N);
    this.sentMode = new Uint8Array(N).fill(255);
    this.herdAt = 0;
    this.wholeAt = 0;
    this.herdBuf = new Uint8Array(1 + N * GOAT_BYTES);
    /* The goats the host has told the board are home, apart from the ones
     * the board has said back (counted): the host's own word comes back to
     * it, and is counted then, as everybody's is. */
    this.told = new Uint8Array(N);
    if (!this.flyer.nav.length && this.brain.nav.length) {
      this.flyer.nav = this.brain.nav;
    }
    this.flyer.reset();
  }

  get total() {
    return this.state.total || (this.herd ? this.herd.count : 0);
  }

  get home() {
    return this.homeN;
  }

  /* Leaning on the goats: every pilot in the room drawn lately, and every
   * bot, wherever it is flown. */
  pushes(s) {
    if (this.idOf[s] < 0) {
      return false;
    }
    return this.puppet[s] ? this.here(s) : this.isBot[s] === 1;
  }

  /* A bot put somewhere new is herding from there. */
  spawnBot(i, pick) {
    super.spawnBot(i, pick);
    if (this.flyer) {
      this.flyer.placed(i);
      this.hx[i] = this.x[i];
      this.hy[i] = this.y[i];
      this.hz[i] = this.z[i];
      this.gTarget[i] = -1;
    }
  }

  setYou(you, host) {
    const was = this.host;
    super.setYou(you, host);
    if (this.host && !was && this.flyer) {
      for (let i = 1; i < ROOM_SLOTS; i += 1) {
        if (this.isBot[i] && this.idOf[i] >= 0) {
          this.flyer.placed(i);
          this.hx[i] = this.x[i];
          this.hy[i] = this.y[i];
          this.hz[i] = this.z[i];
          this.gTarget[i] = -1;
        }
      }
      /* A new host sends the whole herd at once. */
      this.wholeAt = 0;
      this.sentMode.fill(255);
    }
  }

  /*
   * The board's round, { phase, round, n, goAt, endAt, total, home,
   * winner, rows: [{ id, goats }] }. toLocal as the dogfight room's.
   */
  heard(state, toLocal) {
    const goLocal = toLocal(state.goAt);
    const endLocal = state.endAt ? toLocal(state.endAt) : 0;
    const was = this.state;
    this.state = state;
    const inRound = state.phase === 'count' || state.phase === 'live' || state.phase === 'results';
    const fresh = inRound && state.n !== was.n;
    if (fresh) {
      /* Every page lets the goats out to the same places. */
      if (this.herd) {
        this.herd.reset(state.n);
      }
      this.counted.fill(0);
      this.told.fill(0);
      this.herdFrom = -1;
      this.wholeAt = 0;
      this.sentMode.fill(255);
    }
    this.homeN = state.home || 0;
    this.goatRules = { ...this.goatRules, round: state.round, bots: this.botCount() };
    const rowOf = new Map();
    for (const row of state.rows || []) {
      rowOf.set(row.id, row);
    }
    for (let i = 0; i < ROOM_SLOTS; i += 1) {
      const id = this.idAt(i);
      const row = id >= 0 ? rowOf.get(id) : undefined;
      if (!inRound || !row) {
        this.inFight[i] = 0;
        this.alive[i] = i === ME || (this.isBot[i] && id >= 0) ? 1 : 0;
        if (!inRound) {
          this.pops[i] = 0;
        }
        continue;
      }
      if (fresh) {
        this.zero(i);
        this.gTarget[i] = -1;
        if (this.isBot[i] && !this.puppet[i]) {
          this.spawnBot(i, -1);
        }
      }
      this.inFight[i] = 1;
      this.alive[i] = 1;
      this.pops[i] = row.goats;
    }
    const nowMs = this.now();
    if (state.phase === 'count' || state.phase === 'live') {
      this.startedMs = this.clockMs + Math.round(goLocal - nowMs);
      this.roundMs = endLocal > goLocal ? Math.round(endLocal - goLocal) : 0;
      this.over = false;
      this.ended = false;
      this.dismissed = false;
    } else if (state.phase === 'results') {
      this.winner = state.winner != null ? this.slotOf(state.winner) : -1;
      if (!this.ended) {
        this.ended = true;
        this.over = true;
        this.dismissed = false;
        this.overAtMs = this.clockMs;
        this.event('over', this.winner, -1, 0, '', 0, 0, 0);
      }
    } else {
      this.startedMs = -1;
      this.over = false;
      this.ended = false;
      this.dismissed = false;
      this.winner = -1;
    }
  }

  botCount() {
    let n = 0;
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.isBot[i] && this.idOf[i] >= 0) {
        n += 1;
      }
    }
    return n;
  }

  setBots(seats) {
    super.setBots(seats);
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.isBot[i] && this.idOf[i] >= 0) {
        this.alive[i] = 1;
      }
    }
    this.goatRules = { ...this.goatRules, bots: this.botCount() };
  }

  /* A goat the board counted, { n, goat, by, goats }: whose it was, and
   * how many that pilot has now. */
  heardHome(msg) {
    if (msg.n !== this.state.n || !this.herd) {
      return;
    }
    const g = msg.goat;
    if (!Number.isInteger(g) || g < 0 || g >= this.herd.count || this.counted[g]) {
      return;
    }
    this.counted[g] = 1;
    this.homeN += 1;
    const slot = Number.isInteger(msg.by) && msg.by >= 0 ? this.slotOf(msg.by) : -1;
    if (slot >= 0) {
      this.pops[slot] = msg.goats;
      this.inFight[slot] = 1;
    }
    const { OX, OZ, S } = this.plan;
    const H = this.herd;
    const e = this.event('home', slot, -1, 0, '', OX + H.X[g] * S, S * 0.4, OZ - H.Y[g] * S);
    if (e) {
      e.goat = g;
    }
  }

  /* Where the host's herd says the goats are, as gtHerd's `d`. */
  heardHerd(msg) {
    const H = this.herd;
    if (this.host || !H || typeof msg.d !== 'string' || msg.n !== this.state.n) {
      return;
    }
    let bytes;
    try {
      bytes = fromBase64(msg.d);
    } catch (e) {
      return;
    }
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let o = 1; o + GOAT_BYTES <= bytes.length; o += GOAT_BYTES) {
      const g = bytes[o];
      if (g >= H.count) {
        continue;
      }
      const sx = v.getInt16(o + 1, true) / 20;
      const sy = v.getInt16(o + 3, true) / 20;
      const svx = v.getInt8(o + 5) / 20;
      const svy = v.getInt8(o + 6) / 20;
      const mode = bytes[o + 7] > 2 ? 0 : bytes[o + 7];
      const fear = bytes[o + 8] / 255;
      const dx = sx - H.X[g];
      const dy = sy - H.Y[g];
      const far = dx * dx + dy * dy > SNAP * SNAP;
      H.put(g, far ? sx : H.X[g] + dx * 0.5, far ? sy : H.Y[g] + dy * 0.5, svx, svy, mode, fear);
    }
  }

  /* The host's herd out to the room: the goats that moved since they
   * were last sent, or all of them every WHOLE_EVERY_MS. */
  sendHerd() {
    const H = this.herd;
    const t = this.clockMs;
    if (!H || t - this.herdAt < HERD_EVERY_MS) {
      return;
    }
    this.herdAt = t;
    const whole = t - this.wholeAt >= WHOLE_EVERY_MS;
    if (whole) {
      this.wholeAt = t;
    }
    const b = this.herdBuf;
    const v = new DataView(b.buffer);
    b[0] = whole ? 1 : 0;
    let o = 1;
    for (let g = 0; g < H.count; g += 1) {
      const dx = H.X[g] - this.sentX[g];
      const dy = H.Y[g] - this.sentY[g];
      const near = H.MODE[g] === GRAZE ? MOVED_GRAZING : MOVED;
      if (!whole && H.MODE[g] === this.sentMode[g] && dx * dx + dy * dy < near * near) {
        continue;
      }
      this.sentX[g] = H.X[g];
      this.sentY[g] = H.Y[g];
      this.sentMode[g] = H.MODE[g];
      b[o] = g;
      v.setInt16(o + 1, clamp(Math.round(H.X[g] * 20), -32768, 32767), true);
      v.setInt16(o + 3, clamp(Math.round(H.Y[g] * 20), -32768, 32767), true);
      v.setInt8(o + 5, clamp(Math.round(H.VX[g] * 20), -127, 127));
      v.setInt8(o + 6, clamp(Math.round(H.VY[g] * 20), -127, 127));
      b[o + 7] = H.MODE[g];
      b[o + 8] = clamp(Math.round(H.FEAR[g] * 255), 0, 255);
      o += GOAT_BYTES;
    }
    if (o > 1) {
      this.outbox.push({ t: 'gtHerd', n: this.state.n, d: toBase64(b, o) });
    }
  }

  /* The host's word on every goat home since GO: whose, by the slot that
   * pushed it in last, or nobody's for one that walked in or got there
   * before the clock ran. The board counts it, and says it back. */
  sendHomes() {
    const H = this.herd;
    if (!H) {
      return;
    }
    if (this.herdFrom < 0) {
      this.herdFrom = H.clock();
    }
    for (let g = 0; g < H.count; g += 1) {
      if (H.MODE[g] !== HOME || this.told[g] || this.counted[g]) {
        continue;
      }
      this.told[g] = 1;
      const by = H.BY[g];
      const id = H.HOME_AT[g] >= this.herdFrom && by >= 0 && by < ROOM_SLOTS ? this.idAt(by) : -1;
      this.outbox.push({
        t: 'gtHome', n: this.state.n, goat: g, by: id >= 0 ? id : -1,
      });
    }
  }

  /* ONE FEED: the puppets where the room drew them, this page's pilot, the
   * bots this page flies herding, the herd told who is where, and on the
   * host's page the herd and its goats home out to the room. */
  step(me, teleported = false) {
    const t = this.now();
    this.tNow = t;
    this.carry(t);
    this.snapshot();
    this.clockMs += DOGFIGHT_EVERY;
    const now = this.clockMs;
    this.meFlying = Boolean(me.flying);
    this.feedMe(me, teleported);
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.isBot[i] && !this.puppet[i] && this.idOf[i] >= 0) {
        this.herdBot(i, now);
      }
    }
    this.tellHerd();
    if (!this.host) {
      return;
    }
    this.sendHerd();
    if (this.running && this.state.phase === 'live') {
      this.sendHomes();
    }
  }

  standings() {
    const out = [];
    for (let i = 0; i < ROOM_SLOTS; i += 1) {
      if (!this.inFight[i] || this.idAt(i) < 0) {
        continue;
      }
      out.push({
        slot: i,
        bot: Boolean(this.isBot[i]),
        alive: true,
        goats: this.pops[i],
        pops: this.pops[i],
        popped: 0,
      });
    }
    out.sort((a, b) => (b.goats - a.goats) || (a.slot - b.slot));
    return out;
  }
}

/* GoatRound's herding, shared: the goat a bot picks, how it herds it, the
 * herd told of the others, and off the map's herd when it ends. */
for (const k of ['pickGoat', 'herdBot', 'tellHerd', 'detach']) {
  GoatRoom.prototype[k] = GoatRound.prototype[k];
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function toBase64(bytes, n) {
  let s = '';
  for (let i = 0; i < n; i += 1) {
    s += String.fromCharCode(bytes[i]);
  }
  return btoa(s);
}

function fromBase64(d) {
  const s = atob(d);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) {
    out[i] = s.charCodeAt(i);
  }
  return out;
}
