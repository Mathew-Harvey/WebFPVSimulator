/*
 * roomrace.js: a race in a room, as one pilot's page takes part in it.
 *
 * Stage 6 of the multiplayer plan the owner approved on 25 October 2026.
 * The board runs the race (src/rooms.js there): who is ready, the laps, a
 * GO time on its own clock, the finish order, the results and the vote for
 * one more. This file is the other half: it learns the board's clock, puts
 * this pilot on the grid when a countdown they are in begins, says GO at
 * the same moment every other page does, and turns the sim's own lap
 * crossings into the laps the board is sent.
 *
 * THE CLOCK. The board's GO is a time on its clock, sent five seconds
 * ahead. Each page pings, keeps the eight latest answers and believes the
 * one that came back fastest, because the fastest round trip is the one
 * whose half way point is best known. Its offset puts GO on this page's own
 * monotonic clock to within a few milliseconds of every other page's.
 *
 * A LAP, in a room, is timed from GO: the first lap the board is told is
 * the run from the grid through the first full lap, and each one after is
 * the time from the last finish crossing to this one, on the wall clock at
 * the crossing. So the laps add up to the time since GO, a reset or a
 * pause costs what it costs a real pilot, and a pilot who waits on the pad
 * cannot hide the wait. The sim's own lap clock, the one the board's lap
 * table and the ghost read, is untouched: a room race reads it, never
 * writes it.
 *
 * No three.js and no DOM, so scripts/net-selftest.js drives this in Node.
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

/* The board's own lists (src/rooms.js RACE_WAYS, RACE_LAPS_MAX). */
export const RACE_WAYS = Object.freeze(['5inch', 'whoop']);
export const RACE_LAPS_MAX = 10;
/* The board lets a pilot onto a countdown's grid until this long before
 * GO (src/rooms.js COUNT_JOIN_MS). */
export const COUNT_JOIN_MS = 1500;
/* A round trip slower than this says nothing useful about the clock. */
const RTT_LIMIT_MS = 5000;
const SAMPLES_KEPT = 8;
/* After a welcome, a burst of pings to learn the clock quickly, then one
 * now and then to follow a drifting one. */
const PING_BURST = 6;
const PING_BURST_MS = 350;
const PING_EVERY_MS = 15000;
/* A lap the board has not taken this long after it was sent was refused:
 * its answer comes back in one round trip, and no track is lapped faster
 * than the board's floor of a second and a half. */
const LAP_ANSWER_MS = 1000;

/*
 * The board's clock, from pings. `offset` is board time minus this page's
 * time, so board = local + offset.
 */
export class BoardClock {
  constructor() {
    this.samples = [];
    this.offset = null;
    this.rtt = Infinity;
    this.coarseOnly = true;
  }

  /* The welcome's `now`, believed only until the first ping answers. */
  coarse(boardNow, localAt) {
    if (this.coarseOnly && Number.isFinite(boardNow)) {
      this.offset = boardNow - localAt;
    }
  }

  /* A pong: c is when this page sent the ping, s the board's time when it
   * answered, at when the answer arrived, the first and last on this
   * page's clock. False for an answer that says nothing. */
  heard(c, s, at) {
    const rtt = at - c;
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > RTT_LIMIT_MS || !Number.isFinite(s)) {
      return false;
    }
    this.samples.push({ rtt, offset: s - (c + rtt / 2) });
    if (this.samples.length > SAMPLES_KEPT) {
      this.samples.shift();
    }
    let best = this.samples[0];
    for (const x of this.samples) {
      if (x.rtt < best.rtt) {
        best = x;
      }
    }
    this.offset = best.offset;
    this.rtt = best.rtt;
    this.coarseOnly = false;
    return true;
  }

  get known() {
    return this.offset !== null;
  }

  toLocal(boardMs) {
    return boardMs - (this.offset || 0);
  }

  toBoard(localMs) {
    return localMs + (this.offset || 0);
  }
}

/*
 * One page's part in its room's race.
 *
 *   send(msg)       a message for the board, { t: ... }
 *   you()           this pilot's id in the room
 *   now()           this page's clock, performance.now()
 *
 * The shell drives it: heard(race) on every 'race' the board sends,
 * frame() once a frame, lap(crossLocalMs) on every clean lap the sim's own
 * race counts. frame() returns what the shell must do this frame, if
 * anything: 'grid' to put the craft on the start line for a countdown this
 * pilot is in, and 'go' once, at GO.
 */
export class RoomRace {
  constructor({ send, you, now = () => performance.now() }) {
    this.send = send;
    this.you = you;
    this.now = now;
    this.clock = new BoardClock();
    this.race = null;
    /* The race number this page has put the pilot on the grid for, and the
     * one it has said GO for, so each happens once a race. */
    this.gridFor = 0;
    this.goFor = 0;
    this.goLocal = 0;
    this.lastFinish = 0;
    this.lapsSent = 0;
    this.lapSentAt = 0;
    this.pings = 0;
    this.nextPingAt = 0;
  }

  /* Is the room a racing room at all: a track, flown by a five inch or a
   * whoop. */
  static racing(way) {
    return RACE_WAYS.includes(way);
  }

  welcome(m, at) {
    this.clock.coarse(m.now, at);
    this.pings = 0;
    this.nextPingAt = at;
    this.heard(m.race);
  }

  pong(m, at) {
    this.clock.heard(m.c, m.s, at);
  }

  heard(race) {
    const had = this.race;
    this.race = race || null;
    if (!race) {
      return;
    }
    if (!had || had.n !== race.n) {
      /* A new race: nothing sent for it yet. */
      if (race.phase === 'count' || race.phase === 'live') {
        this.lapsSent = 0;
      }
    }
  }

  get phase() {
    return this.race ? this.race.phase : 'pit';
  }

  /* Is this pilot racing in the race on now. */
  racing() {
    const r = this.race;
    return Boolean(r && (r.phase === 'count' || r.phase === 'live') && r.racers.includes(this.you()));
  }

  /* GO, on this page's clock, or 0 when there is no race on. */
  goAt() {
    const r = this.race;
    return r && r.goAt && (r.phase === 'count' || r.phase === 'live') ? this.clock.toLocal(r.goAt) : 0;
  }

  /* Pings to learn the clock: a burst after a welcome, then a slow beat. */
  ping(at) {
    if (at < this.nextPingAt) {
      return false;
    }
    this.pings += 1;
    this.nextPingAt = at + (this.pings < PING_BURST ? PING_BURST_MS : PING_EVERY_MS);
    return this.send({ t: 'ping', c: Math.round(at) }) !== false;
  }

  frame() {
    const at = this.now();
    this.ping(at);
    const r = this.race;
    if (!r || !this.racing()) {
      return '';
    }
    if (this.gridFor !== r.n) {
      this.gridFor = r.n;
      return 'grid';
    }
    const go = this.goAt();
    if (this.goFor !== r.n && go && at >= go) {
      this.goFor = r.n;
      this.goLocal = go;
      this.lastFinish = go;
      this.lapsSent = 0;
      return 'go';
    }
    return '';
  }

  /* A countdown this pilot is not in, with time enough left for the board
   * to put them on its grid: its last moment, and one round trip more for
   * the ask to reach it. */
  canJoin() {
    const r = this.race;
    if (!r || r.phase !== 'count' || this.racing()) {
      return false;
    }
    const left = this.toGo();
    return left !== null && left > COUNT_JOIN_MS + Math.min(this.clock.rtt || 250, 1000);
  }

  /* Before GO, in a countdown this pilot is in. */
  holding() {
    const r = this.race;
    return Boolean(r && r.phase === 'count' && this.racing() && this.goFor !== r.n);
  }

  /* Milliseconds to GO, for the countdown's numbers, or null. */
  toGo() {
    const go = this.goAt();
    return go ? go - this.now() : null;
  }

  /*
   * A clean lap the sim counted, its finish crossing at crossLocal on this
   * page's clock. Sent as the time since the last finish, or since GO for
   * the first. Returns the message, or null when there is no race to send
   * it to.
   */
  lap(crossLocal) {
    const r = this.race;
    if (!r || r.phase !== 'live' || !this.racing() || this.goFor !== r.n) {
      return null;
    }
    const row = (r.rows || []).find((x) => x.id === this.you());
    if (row && (row.done || row.dnf)) {
      return null;
    }
    /* A lap the board refused would leave every later one numbered past
     * its count, and refused too, for the rest of the race. So once the
     * board has had time to answer and has fewer laps than were sent, the
     * count and the last finish are taken from what it holds: the refused
     * lap's time goes into this one, and the laps still add up to the time
     * since GO, which is the board's own test. */
    if (row && row.laps < this.lapsSent && this.now() - this.lapSentAt >= LAP_ANSWER_MS) {
      this.lapsSent = row.laps;
      this.lastFinish = this.goLocal + row.total;
    }
    const ms = Math.round(crossLocal - this.lastFinish);
    if (!(ms > 0)) {
      return null;
    }
    this.lastFinish = crossLocal;
    this.lapsSent += 1;
    this.lapSentAt = this.now();
    const msg = { t: 'lap', n: this.lapsSent, ms };
    this.send(msg);
    return msg;
  }

  /* This pilot's row in the standings, or null. */
  myRow() {
    const r = this.race;
    return r && r.rows ? r.rows.find((x) => x.id === this.you()) || null : null;
  }

  /* The time since GO, for the race clock on screen. */
  elapsed() {
    return this.goFor && this.race && this.goFor === this.race.n ? this.now() - this.goLocal : 0;
  }
}
