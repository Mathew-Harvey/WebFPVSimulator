/*
 * driftroom.js: Drift Matsuri in a multiplayer room, the owner's ask of
 * 2026-10-29: "Every map should be available with friends so multiplayer
 * or single player, bots should be able to be added to either". Everybody
 * films one take of the battles, and the best reel wins.
 *
 * THE DOGFIGHT ROOM'S SLOTS, THE DRIFT ROUND'S CAMERAS. A DriftRoom is the
 * DogfightRoom (src/game/dogroom.js) for who is in the room, where the room
 * drew them and which bots the host's page flies, with the bots filming as
 * DriftRound's do (src/game/driftround.js).
 *
 * EVERY PAGE JUDGES ITS OWN TAKE. The cars run on each page's own clock,
 * so there is no one set of cars to agree on, and none is needed: a take is
 * scored on the page that flew it, by the map's judge (src/game/film.js),
 * against the cars that page drew, as a hit in a dogfight is what its
 * shooter saw. Each page says its score twice a second as it goes and once
 * more when the take is cut (drReel), the host's page for its bots too, and
 * the board keeps the rows and names the best reel (src/rooms.js
 * driftMessage).
 *
 * Rounds are the board's, as every room game's: the host starts one, the
 * board says GO, and every take starts at GO. A take flown before it is
 * thrown away.
 *
 * WHAT IT COSTS. The solo round's: a judge for each bot this page flies.
 * On the wire, a few dozen bytes twice a second from each page while its
 * take runs.
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
import { DriftRound, filming } from './driftround.js';
import { TAKE_MS, gradeOf } from './film.js';

export { ROOM_SLOTS };

/* How often a take's score is said while it runs. */
const REEL_EVERY_MS = 500;

export class DriftRoom extends DogfightRoom {
  /*
   * world: as the Dogfight's. pen: as DriftRound's, { film, poses }. now:
   * this page's clock, ms.
   */
  constructor(world, { now = () => performance.now(), seed = 1, pen = null } = {}) {
    super(world, { now, seed });
    filming(this, pen);
    this.driftRules = { game: 'drift', bots: 0, skill: 'pilot' };
    this.state = {
      phase: 'pit', n: 0, goAt: 0, endAt: 0, winner: null, rows: [],
    };
    this.winner = -1;
    /* What this page last said of each take it judges, and when. */
    this.toldScore = new Int32Array(ROOM_SLOTS).fill(-1);
    this.toldDone = new Uint8Array(ROOM_SLOTS);
    this.toldAt = new Float64Array(ROOM_SLOTS);
  }

  /* The take's own judge, this page's pilot's or a bot's flown here, or
   * what the room last said of anybody else's. */
  scoreOf(i) {
    if (i === ME) {
      return this.taking && this.film ? this.film.score : this.pops[ME];
    }
    if (this.isBot[i] && !this.puppet[i]) {
      return this.dScore[i];
    }
    return this.pops[i];
  }

  /* A bot put somewhere new films from there. */
  spawnBot(i, pick) {
    super.spawnBot(i, pick);
    if (this.dCar) {
      this.dCar[i] = -1;
      this.dfx[i] = this.fx[i];
      this.dfy[i] = this.fy[i];
      this.dfz[i] = this.fz[i];
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
    this.driftRules = { ...this.driftRules, bots: this.botCount() };
  }

  /* Every take this page judges starts now: its pilot's and its bots'. */
  roll() {
    this.taking = true;
    this.takeFrom = this.clockMs;
    if (this.film) {
      this.film.reset();
    }
    for (let i = 0; i < ROOM_SLOTS; i += 1) {
      const f = this.films[i];
      if (f) {
        f.reset();
      }
      this.dScore[i] = 0;
      this.toldScore[i] = -1;
      this.toldDone[i] = 0;
      this.toldAt[i] = 0;
    }
  }

  /*
   * The board's round, { phase, n, goAt, endAt, winner, rows: [{ id,
   * score, done }] }. toLocal as the dogfight room's.
   */
  heard(state, toLocal) {
    const goLocal = toLocal(state.goAt);
    const was = this.state;
    this.state = state;
    const inRound = state.phase === 'count' || state.phase === 'live' || state.phase === 'results';
    const fresh = inRound && state.n !== was.n;
    if (fresh) {
      this.taking = false;
    }
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
        this.dCar[i] = -1;
      }
      this.inFight[i] = 1;
      this.alive[i] = 1;
      /* Ours we know better than the room, which is a hearing behind. */
      const ours = i === ME || (this.isBot[i] && !this.puppet[i]);
      if (!ours || !this.taking) {
        this.pops[i] = Math.max(this.pops[i], row.score);
      }
    }
    const nowMs = this.now();
    if (state.phase === 'count' || state.phase === 'live') {
      this.startedMs = this.clockMs + Math.round(goLocal - nowMs);
      this.roundMs = 0;
      this.over = false;
      this.ended = false;
      this.dismissed = false;
      if (state.phase === 'live' && !this.taking) {
        this.roll();
      }
    } else if (state.phase === 'results') {
      this.winner = state.winner != null ? this.slotOf(state.winner) : -1;
      for (let i = 0; i < ROOM_SLOTS; i += 1) {
        const row = rowOf.get(this.idAt(i));
        if (row && this.inFight[i]) {
          this.pops[i] = row.score;
        }
      }
      if (!this.ended) {
        this.ended = true;
        this.over = true;
        this.dismissed = false;
        this.overAtMs = this.clockMs;
        this.taking = false;
        this.event('over', this.winner, -1, 0, '', 0, 0, 0);
      }
    } else {
      this.startedMs = -1;
      this.over = false;
      this.ended = false;
      this.dismissed = false;
      this.winner = -1;
      this.taking = false;
    }
  }

  /* A take's score the board passed on, { n, by, score, done }. */
  heardReel(msg) {
    if (msg.n !== this.state.n) {
      return;
    }
    const s = this.slotOf(msg.by);
    if (s < 0 || s === ME || (this.isBot[s] && !this.puppet[s])) {
      return;
    }
    this.inFight[s] = 1;
    if (Number.isInteger(msg.score) && msg.score > this.pops[s]) {
      this.pops[s] = msg.score;
    }
  }

  /* What this page judges, said to the room: each take's score when it
   * has moved and REEL_EVERY_MS has run, and its last when it is cut. */
  tell(i, now) {
    const score = Math.round(this.scoreOf(i));
    const f = i === ME ? this.film : this.films[i];
    const done = Boolean(f && f.done) || now - this.takeFrom > TAKE_MS + 1000;
    if (this.toldDone[i] || (score === this.toldScore[i] && !done) || (!done && now - this.toldAt[i] < REEL_EVERY_MS)) {
      return;
    }
    this.toldScore[i] = score;
    this.toldAt[i] = now;
    const msg = {
      t: 'drReel', n: this.state.n, score, done,
    };
    if (done) {
      this.toldDone[i] = 1;
    }
    if (i !== ME) {
      msg.by = this.idAt(i);
    }
    this.outbox.push(msg);
  }

  /* ONE FEED: the puppets where the room drew them, this page's pilot, the
   * bots this page flies filming, and what this page judged out to the
   * room. */
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
        this.driftBot(i, now);
      }
    }
    if (!this.taking || this.state.phase !== 'live') {
      return;
    }
    if (this.inFight[ME]) {
      this.pops[ME] = Math.round(this.scoreOf(ME));
      this.tell(ME, now);
    }
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.isBot[i] && !this.puppet[i] && this.idOf[i] >= 0 && this.inFight[i]) {
        this.pops[i] = Math.round(this.dScore[i]);
        this.tell(i, now);
      }
    }
  }

  get running() {
    return this.taking && !this.over;
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
        reel: this.pops[i],
        grade: gradeOf(this.pops[i]),
        pops: this.pops[i],
        popped: 0,
      });
    }
    out.sort((a, b) => (b.reel - a.reel) || (a.slot - b.slot));
    return out;
  }
}

/* DriftRound's filming, shared: the car a bot picks, how it films it, and
 * the take's clock. */
for (const k of ['pickCar', 'driftBot', 'leftMs']) {
  DriftRoom.prototype[k] = DriftRound.prototype[k];
}
