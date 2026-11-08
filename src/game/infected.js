/*
 * infected.js: Infected, the owner's mini game of 2026-11-08. His words:
 * "1 player (infected ...) vs everyone else (normal ...) to start.
 * Basically a game of tag, but when you're tagged, you turn green and join
 * the infected. Winner is the last normal alive." Then: "whoops only",
 * sniff yes, "call in infected... just infected", and bots in any mix,
 * each easy, medium or hard.
 *
 * A ROUND. Everybody sits on a pad in Midori Gakuen (src/maps/school/),
 * the first infected pilot on the one in the glass tank in the science
 * lab. The round goes when the pilot takes off (in a room, when the host
 * starts it). The clean pilots get a head start, five, ten or fifteen
 * seconds, while the first infected waits on the pad, disarmed: nothing
 * opens, so no wall in the map ever moves. Then the hunt: an infected pilot
 * that comes within TAG_R of a clean one, with nothing in between, tags
 * them, and they are infected from then on. When one clean pilot is left
 * they are the last one: gold, seen by everybody through walls, and the
 * clock drops to LAST_MS at most, so the end is a chase everybody is in
 * and not one pilot in a cupboard while the rest wait. The round ends when
 * nobody is clean or the clock runs out. Three rounds are a match, and the
 * first pilot caught in one starts the next infected.
 *
 * THE POINTS, the owner's list with numbers on it:
 *   a tag, POINTS.tag, times the chain: tag again within CHAIN_MS and the
 *     next is worth twice, then three times, then four at most;
 *   alive, POINTS.alive for every ALIVE_MS a clean pilot stays clean;
 *   a close shave, POINTS.shave, when an infected pilot comes within
 *     SHAVE_R of a clean one and goes away again without the tag;
 *   alive with others when the clock runs out, POINTS.survivor each;
 *   the last one caught, POINTS.lastCaught; the last one who outlasts the
 *     clock, POINTS.lastOut, the top prize ("max bonus if you're last
 *     alive"); and catching the last one, POINTS.closer.
 *
 * THE SNIFF: every SNIFF_EVERY of the hunt, the infected see where every
 * clean pilot is for a moment, through walls (the HUD draws it, and the
 * bots that use it learn it). A hint, not a lock.
 *
 * IT IS THE DOGFIGHT WITH TAG FOR A TARGET, as goat herding is with goats
 * (./goatround.js): the pilots' arrays, the clock, the events and the
 * shell's wiring are ./dogfight.js's, the world is the school's own fine
 * grid and the bots are ./infectbots.js's. Nothing is fired.
 *
 * PURE, as the dogfight is: no Three.js, no DOM, no JS trigonometry,
 * nothing allocated on a step.
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

import {
  Dogfight, DOGFIGHT_EVERY, ME,
} from './dogfight.js';
import {
  InfectBrain, SchoolMap, BOT_SKILLS, schoolWorld,
} from './infectbots.js';
import { sincos } from '../props/trig.js';
import {
  CAP, MAX_BOTS, ROUNDS, HEADS, FIRSTS, INFECT_NAMES, normaliseInfectedRules,
} from './infectrules.js';

export {
  schoolWorld, BOT_SKILLS, CAP, MAX_BOTS, ROUNDS, HEADS, FIRSTS, INFECT_NAMES, normaliseInfectedRules,
};

/* Three rounds a match. */
export const LEGS = 3;
/* How long the table stays up between rounds. */
export const RESULT_MS = 9000;

/* Real metres, centre to centre: a tag, a close shave, and how far apart
 * again a shave is paid at. */
export const TAG_R = 0.6;
export const SHAVE_R = 1.2;
const SHAVE_AWAY = 2.0;
const SHAVE_COOL_MS = 4000;
/* The last one's clock, the chain's window and the sniff's. */
export const LAST_MS = 45000;
export const CHAIN_MS = 30000;
export const CHAIN_MAX = 4;
export const SNIFF_EVERY = 20000;
export const SNIFF_MS = 1000;
export const ALIVE_MS = 10000;

export const POINTS = {
  tag: 100,
  alive: 10,
  shave: 25,
  survivor: 300,
  lastCaught: 500,
  lastOut: 1000,
  closer: 200,
};

const DT = DOGFIGHT_EVERY / 1000;

/* The rules as the dogfight underneath wants them: its bots are seated
 * again by this round, so only its count matters, and none of its guns. */
function underneath(r) {
  return {
    bots: Math.min(7, r.bots), skill: 'pilot', round: 'none', hits: 'arcade',
  };
}

/*
 * The arrays and the bots, on a dogfight: this round's and a room's.
 * pen: the school's game (map.infectedGame), whose plan says where the
 * rooms, the ways through and the pads are.
 */
export function infecting(g, pen) {
  const n = g.cap;
  g.pen = pen;
  g.plan = pen.plan;
  g.inf = new Uint8Array(n);
  g.pts = new Int32Array(n);
  g.total = new Int32Array(n);
  g.tags = new Int32Array(n);
  g.shaves = new Int32Array(n);
  g.chain = new Int32Array(n);
  g.chainUntil = new Float64Array(n);
  g.aliveAcc = new Float64Array(n);
  g.cleanMs = new Float64Array(n);
  g.shaveAt = new Float64Array(n);
  g.near = new Uint8Array(n * n);
  g.seatX = new Float64Array(n);
  g.seatY = new Float64Array(n);
  g.seatZ = new Float64Array(n);
  g.seatYaw = new Float64Array(n);
  g.seatFloor = new Float64Array(n);
  g.sniffX = new Float64Array(n);
  g.sniffY = new Float64Array(n);
  g.sniffZ = new Float64Array(n);
  g.sniffOn = new Uint8Array(n);
  g.sniffAt = -Infinity;
  g.lastFor = new Uint8Array(n);
  g.pz = 0;
  g.gold = -1;
  g.firstCaught = -1;
  g.leg = 0;
  g.huntAt = Infinity;
  g.endAt = Infinity;
  g.nextSniff = Infinity;
  g.winner = -1;
  g.wantGo = false;
  g.seatSerial = 0;
  g.totalled = false;
  g.sc = { s: 0, c: 1 };
  g.map = new SchoolMap(g.world, g.plan);
  g.bots = new InfectBrain(g, g.map, DT);
  g.padOrder = new Int32Array(g.plan.PADS.length);
  for (const e of g.events) {
    e.pts = 0;
  }
}

export class InfectedRound extends Dogfight {
  constructor(world, rules, seed, pen) {
    const r = normaliseInfectedRules(rules);
    super(world, underneath(r), seed, CAP);
    this.infRules = r;
    this.freshMatch = true;
    infecting(this, pen);
    this.reset(0);
  }

  setRules(rules) {
    this.infRules = normaliseInfectedRules(rules);
    this.rules = underneath(this.infRules);
    this.freshMatch = true;
    this.reset(this.round + 1);
  }

  /* The skill bot slot i plays at: its seat's. */
  botSkill(i) {
    return this.infRules.skills[(i - 1) % MAX_BOTS] || 'medium';
  }

  nameOf(i) {
    return i === ME ? 'YOU' : INFECT_NAMES[(i - 1) % INFECT_NAMES.length];
  }

  reset(round) {
    const ended = this.over;
    super.reset(round);
    /* The dogfight's constructor resets before this class has its arrays. */
    if (!this.inf) {
      return;
    }
    const r = this.infRules;
    for (let i = 0; i < this.cap; i += 1) {
      this.isBot[i] = i > 0 && i <= r.bots ? 1 : 0;
      this.inFight[i] = i === ME || this.isBot[i] ? 1 : 0;
      this.alive[i] = this.inFight[i];
      this.shieldUntil[i] = 0;
    }
    this.listFight();
    /* Three rounds a match: the next of the three when the last ended,
     * else a new match. */
    if (this.freshMatch || !ended || this.leg >= LEGS - 1) {
      this.leg = 0;
      this.total.fill(0);
      this.freshMatch = false;
    } else {
      this.leg += 1;
    }
    this.roundMs = ROUNDS[r.round];
    this.headMs = r.head * 1000;
    this.begin(this.pickFirst());
  }

  /* Who starts infected: the first caught last round, else the rule. */
  pickFirst() {
    const r = this.infRules;
    if (this.leg > 0 && this.firstCaught >= 0 && this.inFight[this.firstCaught]) {
      return this.firstCaught;
    }
    if (r.first === 'me') {
      return ME;
    }
    const pool = [];
    for (let q = 0; q < this.inCount; q += 1) {
      const i = this.inList[q];
      if (r.first === 'bot' && i === ME) continue;
      pool.push(i);
    }
    return pool.length ? pool[Math.floor(this.rand() * pool.length)] : ME;
  }

  /* A fresh round with `pz` infected: everybody on a pad, sitting. */
  begin(pz) {
    this.pz = pz;
    this.gold = -1;
    this.firstCaught = -1;
    this.winner = -1;
    this.huntAt = Infinity;
    this.endAt = Infinity;
    this.nextSniff = Infinity;
    this.sniffAt = -Infinity;
    this.wantGo = false;
    this.totalled = false;
    this.inf.fill(0);
    this.inf[pz] = 1;
    this.pts.fill(0);
    this.tags.fill(0);
    this.shaves.fill(0);
    this.chain.fill(0);
    this.chainUntil.fill(0);
    this.aliveAcc.fill(0);
    this.cleanMs.fill(0);
    this.shaveAt.fill(0);
    this.near.fill(0);
    this.sniffOn.fill(0);
    this.lastFor.fill(0);
    this.bots.reset();
    this.seatAll();
  }

  /* The pads: the first infected in the tank, everybody else on the
   * school's pads, the first few (the farthest apart) shuffled among them. */
  seatAll() {
    const plan = this.plan;
    const PADS = plan.PADS;
    const order = this.padOrder;
    for (let p = 0; p < order.length; p += 1) order[p] = p;
    let clean = 0;
    for (let q = 0; q < this.inCount; q += 1) {
      if (this.inList[q] !== this.pz) clean += 1;
    }
    const m = Math.min(clean, order.length);
    for (let p = m - 1; p > 0; p -= 1) {
      const s = Math.floor(this.rand() * (p + 1));
      const t = order[p];
      order[p] = order[s];
      order[s] = t;
    }
    let next = 0;
    for (let q = 0; q < this.inCount; q += 1) {
      const i = this.inList[q];
      let pad;
      let h;
      if (i === this.pz) {
        pad = plan.TANK_PAD;
        h = plan.floors[pad.f] + pad.h;
      } else {
        pad = PADS[order[next % order.length]];
        h = plan.floors[pad.f];
        next += 1;
      }
      this.seat(i, pad, h);
    }
    this.seatSerial += 1;
    if (this.inFight[ME]) {
      this.event('seat', -1, ME, 0, '', this.seatX[ME], this.seatY[ME], this.seatZ[ME]);
    }
  }

  seat(i, pad, h) {
    const plan = this.plan;
    const [x, y, z] = plan.worldAt(pad.px, pad.py, h);
    const sc = sincos(pad.yaw, this.sc);
    this.seatX[i] = x;
    this.seatY[i] = y;
    this.seatZ[i] = z;
    this.seatYaw[i] = pad.yaw;
    this.seatFloor[i] = y;
    if (i === ME) {
      return;
    }
    const sitY = y + 0.03 * this.k;
    this.x[i] = x;
    this.y[i] = sitY;
    this.z[i] = z;
    this.xPrev[i] = x;
    this.yPrev[i] = sitY;
    this.zPrev[i] = z;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.vz[i] = 0;
    /* Plan yaw 0 is east, a quarter turn north; the world's north is -z. */
    this.fx[i] = sc.c;
    this.fy[i] = 0;
    this.fz[i] = -sc.s;
    this.ux[i] = 0;
    this.uy[i] = 1;
    this.uz[i] = 0;
    this.fxPrev[i] = sc.c;
    this.fyPrev[i] = 0;
    this.fzPrev[i] = -sc.s;
    this.uxPrev[i] = 0;
    this.uyPrev[i] = 1;
    this.uzPrev[i] = 0;
    this.bots.placed(i);
  }

  /* The dogfight's respawn is not this game's: nobody is ever popped. */
  spawnBot(i, pick) {
    if (!this.inf) {
      super.spawnBot(i, pick);
    }
  }

  /* THE PHASE. wait: on the pads. head: the head start. hunt. last: one
   * clean pilot left. over. */
  get phase() {
    if (this.over) return 'over';
    if (this.startedMs < 0) return 'wait';
    if (this.clockMs < this.huntAt) return 'head';
    return this.gold >= 0 ? 'last' : 'hunt';
  }

  get hunting() {
    return this.startedMs >= 0 && !this.over && this.clockMs >= this.huntAt;
  }

  /* Whether slot i is held on its pad: everybody until the round goes,
   * and the first infected until the head start is over. */
  holds(i) {
    if (this.over) return false;
    if (this.startedMs < 0) return true;
    return i === this.pz && this.clockMs < this.huntAt;
  }

  /* The pilot held: the first infected, until they are let go. The shell
   * keeps the craft on its pad and takes a throttle up as "go". */
  holdsMe() {
    return this.inFight[ME] === 1 && this.pz === ME && !this.over && (this.startedMs < 0 || this.clockMs < this.huntAt);
  }

  headLeftMs() {
    if (this.startedMs < 0) return this.headMs;
    return Math.max(0, this.huntAt - this.clockMs);
  }

  leftMs() {
    if (this.over) return 0;
    if (!Number.isFinite(this.endAt)) return this.roundMs;
    return Math.max(0, this.endAt - Math.max(this.clockMs, this.huntAt));
  }

  /* How many are clean and how many infected. */
  counts(out) {
    let c = 0;
    let f = 0;
    for (let q = 0; q < this.inCount; q += 1) {
      const i = this.inList[q];
      if (this.inf[i]) f += 1;
      else c += 1;
    }
    out.clean = c;
    out.infected = f;
    return out;
  }

  /* ONE FEED. me: as the dogfight's; gun and missile ignored. */
  step(me, teleported = false) {
    this.snapshot();
    this.clockMs += DOGFIGHT_EVERY;
    const now = this.clockMs;
    this.meFlying = Boolean(me.flying);
    this.feedMe(me, teleported);
    if (this.startedMs < 0 && !this.over && (this.meFlying || this.wantGo)) {
      this.go(now);
    }
    this.play(now);
  }

  /* The round goes: the head start runs from now. */
  go(now) {
    this.startedMs = now;
    this.huntAt = now + this.headMs;
    this.endAt = this.huntAt + this.roundMs;
    this.nextSniff = this.huntAt + SNIFF_EVERY;
    this.wantGo = false;
    this.event('go', -1, -1, 0, '', this.x[ME], this.y[ME], this.z[ME]);
    if (this.pz === ME) {
      this.event('held', -1, ME, 0, '', this.seatX[ME], this.seatY[ME], this.seatZ[ME]);
    }
  }

  /* Everything after the pilot is fed: the bots, the head start's end,
   * the tags, the shaves, the sniff, the points and the end. */
  play(now) {
    /* The bots' map rows, a few a feed while everybody sits and fewer
     * after, until all are done. */
    this.map.warm(this.hunting ? 2 : 10);
    for (let i = 1; i < this.cap; i += 1) {
      if (this.isBot[i] && this.inFight[i] && !this.puppet[i]) {
        this.bots.step(i, now);
      }
    }
    if (this.startedMs < 0 || this.over) {
      return;
    }
    if (now === this.huntAt) {
      this.event('free', this.pz, this.pz, 0, '', this.x[this.pz], this.y[this.pz], this.z[this.pz]);
    }
    if (now < this.huntAt) {
      return;
    }
    this.judge(now);
    if (now >= this.nextSniff) {
      this.nextSniff += SNIFF_EVERY;
      this.sniff(now);
    }
    /* Clean and alive: ten points every ten seconds. */
    for (let q = 0; q < this.inCount; q += 1) {
      const i = this.inList[q];
      if (this.inf[i]) continue;
      this.cleanMs[i] += DOGFIGHT_EVERY;
      this.aliveAcc[i] += DOGFIGHT_EVERY;
      if (this.aliveAcc[i] >= ALIVE_MS) {
        this.aliveAcc[i] -= ALIVE_MS;
        this.pts[i] += POINTS.alive;
      }
    }
    if (now >= this.endAt) {
      this.end(now, true);
    }
  }

  /* Whether this page decides what happens between slots a and b: here,
   * always; in a room, the tagger's page (./infectedroom.js). */
  judges() {
    return true;
  }

  /* The tags and the close shaves, between every infected and every clean
   * pilot in the round. */
  judge(now) {
    const k = this.k;
    const w = this.world;
    const tag2 = TAG_R * TAG_R * k * k;
    const shave2 = SHAVE_R * SHAVE_R * k * k;
    const away2 = SHAVE_AWAY * SHAVE_AWAY * k * k;
    const n = this.cap;
    for (let qa = 0; qa < this.inCount; qa += 1) {
      const i = this.inList[qa];
      if (!this.inf[i]) continue;
      for (let qb = 0; qb < this.inCount; qb += 1) {
        const j = this.inList[qb];
        if (this.inf[j] || this.over) continue;
        const dx = this.x[j] - this.x[i];
        const dy = this.y[j] - this.y[i];
        const dz = this.z[j] - this.z[i];
        const d2 = dx * dx + dy * dy + dz * dz;
        const pair = i * n + j;
        if (d2 < tag2 && this.judges(i, j) && w.blocked(this.x[i], this.y[i], this.z[i], this.x[j], this.y[j], this.z[j]) < 0) {
          this.near[pair] = 0;
          this.tag(i, j, now);
          continue;
        }
        if (d2 < shave2) {
          this.near[pair] = 1;
        } else if (this.near[pair] && d2 > away2) {
          this.near[pair] = 0;
          if (now >= this.shaveAt[j] && this.judges(j, i)) {
            this.shaveAt[j] = now + SHAVE_COOL_MS;
            this.shave(j, i);
          }
        }
      }
    }
  }

  /* Infected pilot `by` tags clean pilot `to`. */
  tag(by, to, now) {
    const was = this.gold === to;
    this.chain[by] = now < this.chainUntil[by] ? Math.min(CHAIN_MAX, this.chain[by] + 1) : 1;
    this.chainUntil[by] = now + CHAIN_MS;
    const got = POINTS.tag * this.chain[by];
    this.pts[by] += got;
    this.tags[by] += 1;
    this.inf[to] = 1;
    this.popped[to] += 1;
    this.pops[by] += 1;
    for (let o = 0; o < this.cap; o += 1) {
      this.near[o * this.cap + to] = 0;
      this.near[to * this.cap + o] = 0;
    }
    if (this.firstCaught < 0) {
      this.firstCaught = to;
    }
    const e = this.event('tag', by, to, got, `x${this.chain[by]}`, this.x[to], this.y[to], this.z[to]);
    if (e) e.pts = got;
    if (was) {
      this.gold = -1;
      this.pts[to] += POINTS.lastCaught;
      this.pts[by] += POINTS.closer;
      this.lastFor[to] = 1;
      this.bonus(to, POINTS.lastCaught, 'last caught');
      this.bonus(by, POINTS.closer, 'caught the last one');
    }
    const c = this.counts(this.tally);
    if (c.clean === 0) {
      this.end(now, false);
    } else if (c.clean === 1 && !was && this.inCount >= 3) {
      for (let q = 0; q < this.inCount; q += 1) {
        const i = this.inList[q];
        if (!this.inf[i]) this.gold = i;
      }
      this.endAt = Math.min(this.endAt, now + LAST_MS);
      this.event('last', -1, this.gold, 0, '', this.x[this.gold], this.y[this.gold], this.z[this.gold]);
    }
  }

  get tally() {
    if (!this._tally) this._tally = { clean: 0, infected: 0 };
    return this._tally;
  }

  shave(to, by) {
    this.pts[to] += POINTS.shave;
    this.shaves[to] += 1;
    const e = this.event('shave', by, to, POINTS.shave, '', this.x[to], this.y[to], this.z[to]);
    if (e) e.pts = POINTS.shave;
  }

  bonus(to, pts, why) {
    const e = this.event('bonus', -1, to, pts, why, this.x[to], this.y[to], this.z[to]);
    if (e) e.pts = pts;
  }

  /* Where every clean pilot is, to the infected, for a moment. */
  sniff(now) {
    this.sniffAt = now;
    for (let i = 0; i < this.cap; i += 1) {
      const on = this.live(i) && !this.inf[i] ? 1 : 0;
      this.sniffOn[i] = on;
      if (on) {
        this.sniffX[i] = this.x[i];
        this.sniffY[i] = this.y[i];
        this.sniffZ[i] = this.z[i];
      }
    }
    this.bots.sniffed(now);
    this.event('sniff', -1, -1, 0, '', 0, 0, 0);
  }

  /* The round is over: the clock ran out (timeUp) or nobody is clean. */
  end(now, timeUp) {
    if (this.over) return;
    if (timeUp) {
      const c = this.counts(this.tally);
      for (let q = 0; q < this.inCount; q += 1) {
        const i = this.inList[q];
        if (this.inf[i]) continue;
        if (this.gold === i || c.clean === 1) {
          this.pts[i] += POINTS.lastOut;
          this.lastFor[i] = 1;
          this.bonus(i, POINTS.lastOut, 'outlasted the clock');
        } else {
          this.pts[i] += POINTS.survivor;
          this.bonus(i, POINTS.survivor, 'survived');
        }
      }
    }
    this.over = true;
    this.overAtMs = now;
    this.addTotals();
    /* The owner's rule: the winner is the last clean pilot, caught at
     * the end or outlasting the clock. With nobody last (the clock ran out
     * on several, or a round of two), the most points. */
    const rows = this.standings();
    let last = -1;
    for (let q = 0; q < this.inCount; q += 1) {
      if (this.lastFor[this.inList[q]]) last = this.inList[q];
    }
    this.winner = last >= 0 ? last : (rows[0] ? rows[0].slot : -1);
    this.event('over', this.winner, -1, timeUp ? 1 : 0, '', 0, 0, 0);
  }

  addTotals() {
    if (this.totalled) return;
    this.totalled = true;
    for (let i = 0; i < this.cap; i += 1) {
      this.total[i] += this.pts[i];
    }
  }

  /* Whether the match is over with this round. */
  get matchOver() {
    return this.over && this.leg >= LEGS - 1;
  }

  /* The table: this round's points first, the match's after. */
  standings() {
    const out = [];
    for (let q = 0; q < this.inCount; q += 1) {
      const i = this.inList[q];
      out.push({
        slot: i,
        bot: Boolean(this.isBot[i]),
        alive: !this.inf[i],
        infected: Boolean(this.inf[i]),
        first: i === this.pz,
        last: Boolean(this.lastFor[i]) || this.gold === i,
        pts: this.pts[i],
        total: this.total[i] + (this.totalled ? 0 : this.pts[i]),
        tags: this.tags[i],
        shaves: this.shaves[i],
        cleanMs: this.cleanMs[i],
        pops: this.tags[i],
        popped: this.inf[i] && i !== this.pz ? 1 : 0,
        goats: 0,
      });
    }
    out.sort((a, b) => (b.pts - a.pts) || (b.cleanMs - a.cleanMs) || (a.slot - b.slot));
    return out;
  }

  /* The match table: by points over the rounds so far. */
  matchStandings() {
    return this.standings().sort((a, b) => (b.total - a.total) || (a.slot - b.slot));
  }
}

export { ME, DOGFIGHT_EVERY };
export const MAX_PILOTS = CAP;
