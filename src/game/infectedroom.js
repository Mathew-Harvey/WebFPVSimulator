/*
 * infectedroom.js: Infected in a multiplayer room. The owner's mini game of
 * 2026-11-08 (./infected.js), with friends: "obviously going to need some
 * sort of prelobby for everyone to join", and bots in any seat, "any ratio
 * of bots to humans", each easy, medium or hard.
 *
 * THE DOGFIGHT ROOM'S SLOTS, THE ROUND'S RULES. An InfectedRoom is the
 * DogfightRoom (./dogroom.js) for who is in the room, where the room drew
 * them and which bots the host's page flies, with the school's arrays, the
 * brains and the sight lines of InfectedRound (./infected.js infecting),
 * and nothing fired.
 *
 * THE BOARD KEEPS THE MATCH (the board's src/rooms.js infMessage): who is
 * infected, the points, the last one, the clock, the pads and the three
 * rounds. Every page judges only its own: a tag by its own quad (or, on
 * the host's page, by a bot it flies) is sent as ifTag, and a close shave
 * of its own quad as ifShave, and neither is true until the board says it
 * back, so two pages can never both have tagged one pilot. A tag is
 * therefore drawn a round trip after the touch, a tenth of a second or so,
 * which a tag game forgives where a gun would not. The alive points are
 * the one thing every page works out for itself, from the board's clock,
 * because they change every ten seconds for everybody and nobody needs to
 * be told.
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
import {
  InfectedRound, infecting, POINTS, ALIVE_MS, CHAIN_MS, SNIFF_EVERY, LEGS,
} from './infected.js';
import { normaliseInfectedRules, ROUNDS } from './infectrules.js';

export { ROOM_SLOTS };

/* A tag or a shave sent and not yet said back is not sent again for this
 * long: the judge sees the touch every feed until the board answers. */
const PENDING_MS = 600;
/* The room's bot skills (src/net/roombots.js) in the game's words. */
const SKILL_WORDS = { rookie: 'easy', pilot: 'medium', ace: 'hard' };

export class InfectedRoom extends DogfightRoom {
  /*
   * world: the school's own grid (./infectbots.js schoolWorld). pen: the
   * school's game (map.infectedGame). now: this page's clock, ms.
   */
  constructor(world, { now = () => performance.now(), seed = 1, pen = null } = {}) {
    super(world, { now, seed });
    infecting(this, pen);
    const n = ROOM_SLOTS;
    /* What the board has counted for each slot, without the alive points,
     * and when it was caught, on this game's clock (-1: never). */
    this.ptsBase = new Int32Array(n);
    this.caughtMs = new Float64Array(n).fill(-1);
    this.boardClean = new Float64Array(n);
    /* The round each slot was last put on its pad for, so a slot is
     * seated once a round, and a pilot who comes in during one is too. */
    this.seatedN = new Int32Array(n).fill(-1);
    this.tagSent = new Float64Array(n).fill(-1e9);
    this.shaveSent = new Float64Array(n).fill(-1e9);
    this.state = {
      phase: 'pit', round: '3m', head: 10, first: 'random', n: 0, leg: 0, goAt: 0, huntAt: 0, endAt: 0, nextAt: 0, pz: -1, gold: -1, winner: null, rows: [],
    };
    this.infRules = normaliseInfectedRules({ bots: 1 });
    this.headMs = this.infRules.head * 1000;
    this.roundMs = 0;
    this.pz = -1;
    this.goSaid = false;
    this.freeSaid = false;
  }

  /* The skill a bot this page flies plays at: its seat's. */
  botSkill(i) {
    return SKILL_WORDS[this.skills[i]] || 'medium';
  }

  /* A bot of the room's: on this page a seat, sat on a pad until a round
   * puts it on its own. Never respawned: nobody is ever popped. */
  spawnBot() {}

  /* The board's seats. A seat new on the host's page sits down on a pad
   * of its own, by its place among the bots, so a room in the pit is not
   * a heap of quads at the origin. */
  setBots(seats) {
    const had = new Uint8Array(ROOM_SLOTS);
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      had[i] = this.isBot[i] && this.idOf[i] >= 0 ? 1 : 0;
    }
    super.setBots(seats);
    let b = 0;
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (!this.isBot[i] || this.idOf[i] < 0) continue;
      b += 1;
      if (!had[i] && this.host && this.state.phase === 'pit') {
        this.padSeat(i, b);
      }
    }
    this.infRules = { ...this.infRules, bots: b };
  }

  /* A new host takes the bots on where they are, flying. */
  setYou(you, host) {
    const was = this.host;
    super.setYou(you, host);
    if (this.host && !was) {
      for (let i = 1; i < ROOM_SLOTS; i += 1) {
        if (this.isBot[i] && this.idOf[i] >= 0) {
          this.bots.flyer.placed(i);
          this.bots.flyer.cls[i] = this.bots.skill(i).cls;
        }
      }
    }
  }

  /* Seat slot i on pad `pad` of the school's list, or in the tank (-1). */
  padSeat(i, pad) {
    const plan = this.plan;
    if (pad < 0) {
      const p = plan.TANK_PAD;
      this.seat(i, p, plan.floors[p.f] + p.h);
    } else {
      const p = plan.PADS[pad % plan.PADS.length];
      this.seat(i, p, plan.floors[p.f]);
    }
  }

  /* This page judges a touch for its own quad and the bots it flies. */
  judges(a) {
    return a === ME || (this.isBot[a] === 1 && !this.puppet[a] && this.idOf[a] >= 0);
  }

  /* A tag this page saw: to the board, and true when it says so. */
  tag(by, to) {
    if (this.clockMs - this.tagSent[to] < PENDING_MS || this.idAt(to) < 0) {
      return;
    }
    this.tagSent[to] = this.clockMs;
    const msg = { t: 'ifTag', n: this.state.n, to: this.idAt(to) };
    if (by !== ME) {
      msg.by = this.idAt(by);
    }
    this.outbox.push(msg);
  }

  /* A close shave this page saw: clean `to` (its own), infected `by`. */
  shave(to, by) {
    if (this.clockMs - this.shaveSent[to] < PENDING_MS || this.idAt(by) < 0) {
      return;
    }
    this.shaveSent[to] = this.clockMs;
    const msg = { t: 'ifShave', n: this.state.n, by: this.idAt(by) };
    if (to !== ME) {
      msg.to = this.idAt(to);
    }
    this.outbox.push(msg);
  }

  /*
   * The board's match: { phase, round, head, first, n, leg, goAt, huntAt,
   * endAt, nextAt, pz, gold, winner, rows: [{ id, inf, pad, pts, total,
   * tags, shaves, chain, caughtAt, last, left, cleanMs }] }. toLocal turns
   * a time on the board's clock into one on now()'s.
   */
  heard(state, toLocal) {
    const was = this.state;
    this.state = state;
    const inRound = state.phase === 'count' || state.phase === 'live' || state.phase === 'results';
    const fresh = inRound && state.n !== was.n;
    const nowMs = this.now();
    const local = (t) => this.clockMs + Math.round(toLocal(t) - nowMs);
    this.infRules = {
      ...this.infRules, round: state.round, head: state.head, first: state.first,
    };
    if (fresh) {
      this.inf.fill(0);
      this.tags.fill(0);
      this.shaves.fill(0);
      this.chain.fill(0);
      this.chainUntil.fill(0);
      this.near.fill(0);
      this.sniffOn.fill(0);
      this.lastFor.fill(0);
      this.ptsBase.fill(0);
      this.caughtMs.fill(-1);
      this.tagSent.fill(-1e9);
      this.shaveSent.fill(-1e9);
      this.totalled = false;
      this.bots.reset();
      this.goSaid = false;
      this.freeSaid = false;
      this.sniffAt = -Infinity;
    }
    const rowOf = new Map();
    for (const row of state.rows || []) {
      rowOf.set(row.id, row);
    }
    let meSeated = false;
    for (let i = 0; i < ROOM_SLOTS; i += 1) {
      const id = this.idAt(i);
      const row = id >= 0 ? rowOf.get(id) : undefined;
      if (!inRound || !row || row.left) {
        this.inFight[i] = 0;
        this.alive[i] = i === ME || (this.isBot[i] && id >= 0) ? 1 : 0;
        this.inf[i] = 0;
        this.pts[i] = 0;
        continue;
      }
      this.inFight[i] = 1;
      this.alive[i] = 1;
      this.inf[i] = row.inf ? 1 : 0;
      this.ptsBase[i] = row.pts;
      this.total[i] = row.total;
      this.tags[i] = row.tags;
      this.shaves[i] = row.shaves;
      this.lastFor[i] = row.last ? 1 : 0;
      this.boardClean[i] = row.cleanMs || 0;
      if (row.chain > 0 && row.chain !== this.chain[i]) {
        this.chain[i] = row.chain;
      }
      this.caughtMs[i] = row.inf && row.caughtAt ? local(row.caughtAt) : -1;
      if (state.phase !== 'results' && this.seatedN[i] !== state.n && (i === ME || this.judges(i))) {
        this.seatedN[i] = state.n;
        this.padSeat(i, Number.isInteger(row.pad) ? row.pad : -1);
        if (i === ME) {
          meSeated = true;
        }
      }
    }
    this.listFight();
    if (meSeated) {
      this.seatSerial += 1;
      this.event('seat', -1, ME, 0, '', this.seatX[ME], this.seatY[ME], this.seatZ[ME]);
    }
    this.pz = state.pz >= 0 ? this.slotOf(state.pz) : -1;
    const gold = state.gold >= 0 ? this.slotOf(state.gold) : -1;
    if (gold >= 0 && gold !== this.gold && state.phase === 'live') {
      this.event('last', -1, gold, 0, '', this.x[gold], this.y[gold], this.z[gold]);
    }
    this.gold = gold;
    this.leg = state.leg || 0;
    if (state.phase === 'count' || state.phase === 'live') {
      this.startedMs = local(state.goAt);
      this.huntAt = local(state.huntAt);
      this.endAt = local(state.endAt);
      this.headMs = Math.max(0, this.huntAt - this.startedMs);
      this.roundMs = Math.max(0, this.endAt - this.huntAt);
      if (fresh) {
        this.nextSniff = this.huntAt + SNIFF_EVERY;
      }
      this.over = false;
      this.ended = false;
      this.dismissed = false;
      this.winner = -1;
      this.points();
    } else if (state.phase === 'results') {
      this.endAt = local(state.endAt);
      for (let q = 0; q < this.inCount; q += 1) {
        const i = this.inList[q];
        this.pts[i] = this.ptsBase[i];
        this.cleanMs[i] = this.boardClean[i];
      }
      this.totalled = true;
      this.winner = state.winner != null ? this.slotOf(state.winner) : -1;
      if (!this.ended) {
        this.ended = true;
        this.over = true;
        this.dismissed = false;
        this.overAtMs = this.clockMs;
        let timeUp = false;
        for (let q = 0; q < this.inCount; q += 1) {
          const i = this.inList[q];
          if (!this.inf[i]) {
            timeUp = true;
            if (this.judges(i)) {
              this.bonus(i, this.lastFor[i] ? POINTS.lastOut : POINTS.survivor, this.lastFor[i] ? 'outlasted the clock' : 'survived');
            }
          }
        }
        this.event('over', this.winner, -1, timeUp ? 1 : 0, '', 0, 0, 0);
      }
    } else {
      this.startedMs = -1;
      this.huntAt = Infinity;
      this.endAt = Infinity;
      this.nextSniff = Infinity;
      this.over = false;
      this.ended = false;
      this.dismissed = false;
      this.winner = -1;
      this.pz = -1;
      this.gold = -1;
      this.roundMs = ROUNDS[state.round] || 0;
      this.headMs = (state.head || 10) * 1000;
    }
  }

  /* A tag the board believed, { n, by, to, got, chain, last }: true on
   * every page now, the tagger's own included, which drew nothing until
   * the board said so. `by` -1 is the infection handed on because the only
   * infected pilot left: no tagger, no points. */
  heardTag(msg) {
    if (msg.n !== this.state.n) {
      return;
    }
    const by = this.slotOf(msg.by);
    const to = this.slotOf(msg.to);
    if (to < 0) {
      return;
    }
    this.inf[to] = 1;
    this.caughtMs[to] = this.clockMs;
    this.tagSent[to] = -1e9;
    for (let o = 0; o < this.cap; o += 1) {
      this.near[o * this.cap + to] = 0;
      this.near[to * this.cap + o] = 0;
    }
    if (by >= 0) {
      this.chain[by] = msg.chain || 1;
      this.chainUntil[by] = this.clockMs + CHAIN_MS;
      this.tags[by] += 1;
      this.ptsBase[by] += msg.got || 0;
    }
    const e = this.event('tag', by, to, msg.got || 0, `x${msg.chain || 1}`, this.x[to], this.y[to], this.z[to]);
    if (e) e.pts = msg.got || 0;
    if (msg.last) {
      this.lastFor[to] = 1;
      this.gold = -1;
      this.bonus(to, POINTS.lastCaught, 'last caught');
      if (by >= 0) {
        this.bonus(by, POINTS.closer, 'caught the last one');
      }
    }
    this.points();
  }

  /* A close shave the board believed, { n, by, to, pts }. */
  heardShave(msg) {
    if (msg.n !== this.state.n) {
      return;
    }
    const to = this.slotOf(msg.to);
    const by = this.slotOf(msg.by);
    if (to < 0) {
      return;
    }
    this.ptsBase[to] = msg.pts;
    this.shaves[to] += 1;
    const e = this.event('shave', by, to, POINTS.shave, '', this.x[to], this.y[to], this.z[to]);
    if (e) e.pts = POINTS.shave;
    this.points();
  }

  /* The points as they stand: the board's, and ten for every ten seconds
   * clean since the head start ended, from the board's own times. */
  points() {
    if (this.over) {
      return;
    }
    const now = Math.min(this.clockMs, this.endAt);
    for (let q = 0; q < this.inCount; q += 1) {
      const i = this.inList[q];
      let clean = 0;
      if (now > this.huntAt) {
        if (!this.inf[i]) clean = now - this.huntAt;
        else if (this.caughtMs[i] >= 0) clean = Math.max(0, this.caughtMs[i] - this.huntAt);
      }
      this.cleanMs[i] = clean;
      this.pts[i] = this.ptsBase[i] + POINTS.alive * Math.floor(clean / ALIVE_MS);
    }
  }

  /* THE PHASE, as the round's: wait is the pit and the countdown. */
  get phase() {
    if (this.over) return 'over';
    if (this.startedMs < 0 || this.clockMs < this.startedMs) return 'wait';
    if (this.clockMs < this.huntAt) return 'head';
    return this.gold >= 0 ? 'last' : 'hunt';
  }

  /* Held on the pad: everybody out of a round and through its countdown,
   * and whoever started infected, in the tank, through the head start
   * (a friend who came in during it starts there too). Not one the board
   * handed the infection to when the only infected pilot left (infHandOff
   * in the board's src/rooms.js): that one has a caught time, is already
   * flying, and holding it would stop it where it is. */
  holds(i) {
    if (this.over || !this.inFight[i]) return !this.inFight[i] && this.isBot[i] === 1;
    if (this.startedMs < 0 || this.clockMs < this.startedMs) return true;
    return this.inf[i] === 1 && this.caughtMs[i] < 0 && this.clockMs < this.huntAt;
  }

  holdsMe() {
    if (!this.inFight[ME] || this.over || this.startedMs < 0) return false;
    return this.clockMs < this.startedMs || (this.inf[ME] === 1 && this.caughtMs[ME] < 0 && this.clockMs < this.huntAt);
  }

  headLeftMs() {
    if (this.startedMs < 0 || this.clockMs < this.startedMs) return this.headMs;
    return Math.max(0, this.huntAt - this.clockMs);
  }

  get matchOver() {
    return this.over && this.leg >= LEGS - 1;
  }

  /* ONE FEED: the puppets where the room drew them, this page's pilot, the
   * bots this page flies, the round's moments, this page's touches out to
   * the board, the sniff and the points. */
  step(me, teleported = false) {
    const t = this.now();
    this.tNow = t;
    this.carry(t);
    this.snapshot();
    this.clockMs += DOGFIGHT_EVERY;
    const now = this.clockMs;
    this.meFlying = Boolean(me.flying);
    this.feedMe(me, teleported);
    this.map.warm(this.hunting ? 2 : 10);
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.isBot[i] && !this.puppet[i] && this.idOf[i] >= 0) {
        this.bots.step(i, now);
      }
    }
    if (this.startedMs < 0 || this.over || this.state.phase === 'pit') {
      return;
    }
    if (!this.goSaid && now >= this.startedMs) {
      this.goSaid = true;
      this.event('go', -1, -1, 0, '', this.x[ME], this.y[ME], this.z[ME]);
    }
    if (!this.freeSaid && now >= this.huntAt) {
      this.freeSaid = true;
      if (this.pz >= 0 && this.inFight[this.pz]) {
        this.event('free', this.pz, this.pz, 0, '', this.x[this.pz], this.y[this.pz], this.z[this.pz]);
      }
    }
    if (now < this.huntAt || this.state.phase !== 'live') {
      return;
    }
    this.judge(now);
    if (now >= this.nextSniff) {
      this.nextSniff += SNIFF_EVERY;
      this.sniff(now);
    }
    this.points();
  }
}

/* InfectedRound's own, shared: the judge, the counts, the sniff, the
 * seats, a bonus line, the clock and the tables. Copied as descriptors, so
 * a getter stays a getter. */
for (const k of ['judge', 'counts', 'tally', 'sniff', 'seat', 'bonus', 'hunting', 'leftMs', 'standings', 'matchStandings']) {
  Object.defineProperty(InfectedRoom.prototype, k, Object.getOwnPropertyDescriptor(InfectedRound.prototype, k));
}
