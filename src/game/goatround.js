/*
 * goatround.js: goat herding as a round with bots, the owner's asks of
 * 2026-10-29: "Every map should be available with friends so multiplayer or
 * single player, bots should be able to be added to either", and, picked on
 * the card, "Most goats wins": every goat is whoever pushed it in last.
 *
 * IT IS THE DOGFIGHT WITH A HERD FOR A TARGET. The arena, the spawns, the
 * bots' flying (src/game/botflyer.js) and the world the shell reads from
 * the map are src/game/dogfight.js's, and the herd is the map's own
 * (src/maps/goats/herd.js), stepped by the map as it always is, with the
 * bots handed to it as more craft (`others`). Nothing is fired. A goat that
 * walks into Heads' garage after the round started is a point to whoever
 * spooked it last, or to whoever spooked the goat it followed; `pops` holds
 * the count, so everything that reads a dogfight's score reads this one.
 *
 * A BOT HERDS as a dog does: it picks a goat, finds the way that goat has
 * to walk home (the herd's homeField, a walk out from the garage made once
 * a map), and comes down low on the far side of it, so the goat runs from
 * it toward the garage, round corners included. Getting there it flies
 * over the roofs, above SPOOK_H, so it does not scatter the goat it is
 * after on the way round. The skill says how close it works, how fast it
 * presses, how straight its line is and how soon it gives up on a goat.
 *
 * PURE, as the dogfight is: no Three.js, no DOM, no JS trigonometry,
 * nothing allocated on a step, its own clock fed every DOGFIGHT_EVERY
 * steps of the lap clock. The herd itself runs on the map's clock, as it
 * does without a round.
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
  Dogfight, DOGFIGHT_EVERY, MAX_PILOTS, MAX_BOTS, ME, SKILLS,
} from './dogfight.js';
import { BotFlyer } from './botflyer.js';

const DT = DOGFIGHT_EVERY / 1000;

/* The herd's numbers this round leans on (src/maps/goats/herd.js): a goat
 * at home, and the height under which a craft spooks one. */
const HOME = 2;
const SPOOK_H = 3.2;

/* Rounds: how long, or 'all' for until every goat is home. */
export const GOAT_ROUNDS = {
  '3m': 180000,
  '5m': 300000,
  all: 0,
};

/*
 * HOW THE BOTS HERD, plan metres and seconds. behind: how far behind its
 * goat it works. pace: how fast it presses once it is there, m/s; a goat
 * bolts at 4.6. wobble: how far off its line it wanders, a new wander every
 * second and a half. thinkMs: how long it stays on one goat before it
 * looks again.
 */
export const GOAT_BOTS = {
  rookie: {
    behind: 3.2, pace: 2.2, wobble: 1.8, thinkMs: 6000,
  },
  pilot: {
    behind: 2.7, pace: 3.0, wobble: 1.0, thinkMs: 4000,
  },
  ace: {
    behind: 2.3, pace: 3.8, wobble: 0.4, thinkMs: 2500,
  },
};

/* How high a bot herds, and how high it flies round to its goat, plan
 * metres: under the spook and over the roofs. */
const LOW = 1.3;
const HIGH = 6.5;
/* Inside this of where it should be, it comes down. */
const DOWN = 3;
/* A goat that has come no nearer home in this long is stuck on something
 * (a post square in its way, a corner): the bot works from a side, and
 * the other side the next time. */
const STUCK_MS = 2500;
const SIDE = 1.4;

/*
 * WHERE TO HERD FROM: behind the goat at (x, y) on its way home, `behind`
 * metres, moved `side` metres across that way, into out[0..1]; nearer when
 * that point is somewhere that cannot get home (a wall, a fence). `way` is
 * scratch for the way home. The bots' rule, and scripts/goats-check.js
 * flies the same.
 */
export function herdPoint(field, x, y, behind, side, way, out) {
  field.way(x, y, way);
  let wx = x - way[0] * behind - way[1] * side;
  let wy = y - way[1] * behind + way[0] * side;
  if (field.at(wx, wy) < 0) {
    wx = x - way[0] * behind * 0.5;
    wy = y - way[1] * behind * 0.5;
  }
  out[0] = wx;
  out[1] = wy;
}

export function normaliseGoatRules(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  return {
    game: 'goats',
    bots: Number.isInteger(r.bots) ? Math.max(0, Math.min(MAX_BOTS, r.bots)) : 3,
    skill: has(SKILLS, r.skill) ? r.skill : 'rookie',
    round: has(GOAT_ROUNDS, r.round) ? r.round : '3m',
  };
}

/* The rules as the dogfight underneath wants them. */
function underneath(r) {
  return {
    bots: r.bots, skill: r.skill, round: 'none', hits: 'arcade',
  };
}

/*
 * What a herding game keeps beside the dogfight's, for every slot it has:
 * the map's herd and its frame, the goat each bot is after and how it is
 * getting on with it, and the bots' flying. GoatRound's and a room's
 * (src/game/goatroom.js GoatRoom), which shares the methods below.
 */
export function herding(g, pen) {
  const n = g.cap;
  g.pen = pen;
  g.herd = pen ? pen.herd : null;
  g.field = pen ? pen.field() : null;
  g.plan = pen ? pen.frame : { OX: 0, OZ: 0, S: 1 };
  const N = g.herd ? g.herd.count : 0;
  g.counted = new Uint8Array(N);
  g.herdFrom = 0;
  g.gTarget = new Int16Array(n).fill(-1);
  g.gRetarget = new Float64Array(n);
  g.gWobbleAt = new Float64Array(n);
  g.gwx = new Float64Array(n);
  g.gwy = new Float64Array(n);
  g.hx = new Float64Array(n);
  g.hy = new Float64Array(n);
  g.hz = new Float64Array(n);
  g.way = new Float64Array(2);
  g.at2 = new Float64Array(2);
  g.gHome = new Int32Array(n);
  g.gHomeAt = new Float64Array(n);
  g.gSide = new Float64Array(n);
  g.flyer = new BotFlyer(g, { DT, MAX: n });
  for (const e of g.events) {
    e.goat = -1;
  }
}

export class GoatRound extends Dogfight {
  /*
   * pen: the goat map's game (map.goatGame, src/maps/goats/index.js): its
   * herd, its plan frame, its way home and the `others` it steps the herd
   * with. Without one there is no herd, and the bots only fly about.
   */
  constructor(world, rules, seed, pen = null) {
    const r = normaliseGoatRules(rules);
    super(world, underneath(r), seed);
    this.goatRules = r;
    herding(this, pen);
    this.reset(0);
  }

  /* Changing the rules mid round starts a fresh round on them. */
  setRules(rules) {
    this.goatRules = normaliseGoatRules(rules);
    this.rules = underneath(this.goatRules);
    this.reset(this.round + 1);
  }

  reset(round) {
    super.reset(round);
    /* The dogfight's constructor resets before this class has its arrays. */
    if (!this.counted) {
      return;
    }
    this.roundMs = GOAT_ROUNDS[this.goatRules.round];
    this.popsToWin = 0;
    if (!this.flyer.nav.length && this.brain && this.brain.nav.length) {
      this.flyer.nav = this.brain.nav;
    }
    this.flyer.reset();
    this.winner = -1;
    this.counted.fill(0);
    this.gTarget.fill(-1);
    this.gRetarget.fill(0);
    this.gWobbleAt.fill(0);
    for (let i = 0; i < this.cap; i += 1) {
      this.shieldUntil[i] = 0;
      if (this.isBot[i]) {
        this.flyer.placed(i);
        this.hx[i] = this.x[i];
        this.hy[i] = this.y[i];
        this.hz[i] = this.z[i];
      }
    }
    /* A fresh herd, out on the street, the round's own. */
    if (this.herd) {
      this.herd.reset();
    }
    this.tellHerd();
  }

  /* Every goat in the round's herd, and how many are home since it began. */
  get total() {
    return this.counted.length;
  }

  get home() {
    let n = 0;
    for (let i = 0; i < this.cap; i += 1) {
      n += this.pops[i];
    }
    return n;
  }

  /* Whether slot s leans on the goats: here, a bot that is flying. */
  pushes(s) {
    return this.isBot[s] === 1 && this.alive[s] === 1;
  }

  /* The others to the herd, as more craft in the plan: slot s is the
   * herd's pusher s, so a goat's BY is the slot that pushed it. A slot
   * with nobody in it is out of reach overhead, and the herd is handed
   * only as many as reach the last one somebody is in. */
  tellHerd() {
    const pen = this.pen;
    if (!pen) {
      return;
    }
    const { OX, OZ, S } = this.plan;
    const o = pen.others;
    const n = Math.min(this.cap - 1, (o.length / 3) | 0);
    let last = 0;
    for (let s = 1; s <= n; s += 1) {
      const b = (s - 1) * 3;
      if (this.pushes(s)) {
        o[b] = (this.x[s] - OX) / S;
        o[b + 1] = (OZ - this.z[s]) / S;
        o[b + 2] = this.y[s] / S;
        last = s;
      } else {
        o[b] = 0;
        o[b + 1] = 0;
        o[b + 2] = 1e9;
      }
    }
    pen.nOthers = last;
  }

  /* Off the map's herd, when the round is put away. */
  detach() {
    if (this.pen) {
      this.pen.nOthers = 0;
    }
  }

  /* The goat bot i goes after: the nearest that is not home and can get
   * there, nearer the garage counting for a little, and one another bot
   * is on counting against it. */
  pickGoat(i, px, py) {
    const H = this.herd;
    const f = this.field;
    let best = -1;
    let bestScore = Infinity;
    for (let g = 0; g < H.count; g += 1) {
      if (H.MODE[g] === HOME) {
        continue;
      }
      const home = f.at(H.X[g], H.Y[g]);
      if (home < 0) {
        continue;
      }
      const dx = H.X[g] - px;
      const dy = H.Y[g] - py;
      let score = Math.sqrt(dx * dx + dy * dy) + home * 0.25;
      for (let j = 1; j < this.cap; j += 1) {
        if (j !== i && this.isBot[j] && this.gTarget[j] === g) {
          score += 25;
        }
      }
      if (score < bestScore) {
        bestScore = score;
        best = g;
      }
    }
    return best;
  }

  /* ONE FEED OF A BOT. */
  herdBot(i, now) {
    const skill = this.skillOf(i);
    const sk = GOAT_BOTS[skill] || GOAT_BOTS.pilot;
    const { OX, OZ, S } = this.plan;
    const w = this.world;
    const H = this.herd;
    let gx = this.hx[i];
    let gy = this.hy[i];
    let gz = this.hz[i];
    let speed = 0;
    if (H && this.running) {
      const px = (this.x[i] - OX) / S;
      const py = (OZ - this.z[i]) / S;
      let t = this.gTarget[i];
      if (t < 0 || H.MODE[t] === HOME || now >= this.gRetarget[i]) {
        const was = t;
        t = this.pickGoat(i, px, py);
        this.gTarget[i] = t;
        this.gRetarget[i] = now + sk.thinkMs + Math.floor(this.rand() * 1500);
        if (t !== was) {
          this.gHome[i] = 1 << 30;
          this.gHomeAt[i] = now;
          this.gSide[i] = 0;
        }
      }
      if (now >= this.gWobbleAt[i]) {
        this.gWobbleAt[i] = now + 1500;
        this.gwx[i] = (this.rand() * 2 - 1) * sk.wobble;
        this.gwy[i] = (this.rand() * 2 - 1) * sk.wobble;
      }
      if (t >= 0) {
        const way = this.way;
        /* No nearer home for a while: from the side, then the other. */
        const left = this.field.at(H.X[t], H.Y[t]);
        if (left < this.gHome[i]) {
          this.gHome[i] = left;
          this.gHomeAt[i] = now;
        } else if (now - this.gHomeAt[i] > STUCK_MS) {
          this.gSide[i] = this.gSide[i] > 0 ? -SIDE : SIDE;
          this.gHomeAt[i] = now;
        }
        /* Behind the goat on its way home, off by the bot's wobble. */
        herdPoint(this.field, H.X[t], H.Y[t], sk.behind, this.gSide[i], way, this.at2);
        const wx = this.at2[0] + this.gwx[i];
        const wy = this.at2[1] + this.gwy[i];
        const dx = wx - px;
        const dy = wy - py;
        const d = Math.sqrt(dx * dx + dy * dy);
        /* On the goat's garage side, or still far: round it overhead. */
        const ahead = (px - H.X[t]) * way[0] + (py - H.Y[t]) * way[1] > 0;
        const low = d < DOWN && !ahead;
        gx = OX + wx * S;
        gz = OZ - wy * S;
        gy = w.floorAt(gx, this.y[i], gz) + (low ? LOW : HIGH) * S;
        if (gy < LOW * S) {
          gy = LOW * S;
        }
        speed = low ? sk.pace * S : 0;
      }
    }
    this.flyer.setGoal(i, gx, gy, gz, speed);
    this.flyer.step(i, now, SKILLS[skill] || SKILLS.pilot);
  }

  /* ONE FEED. me: as the dogfight's, gun and missile ignored. */
  step(me, teleported = false) {
    this.snapshot();
    this.clockMs += DOGFIGHT_EVERY;
    const now = this.clockMs;
    this.meFlying = Boolean(me.flying);
    this.feedMe(me, teleported);
    const H = this.herd;
    if (this.meFlying && this.startedMs < 0 && this.alive[ME]) {
      this.startedMs = now;
      this.herdFrom = H ? H.clock() : 0;
      this.event('go', -1, -1, 0, '', this.x[ME], this.y[ME], this.z[ME]);
    }
    for (let i = 1; i < this.cap; i += 1) {
      if (this.isBot[i] && this.alive[i]) {
        this.herdBot(i, now);
      }
    }
    this.tellHerd();
    if (!this.running || !H) {
      return;
    }
    /* The goats home since the round began, each to whoever moved it. */
    const { OX, OZ, S } = this.plan;
    let home = 0;
    for (let g = 0; g < H.count; g += 1) {
      if (H.MODE[g] !== HOME) {
        continue;
      }
      home += 1;
      if (this.counted[g] || H.HOME_AT[g] < this.herdFrom) {
        continue;
      }
      this.counted[g] = 1;
      const by = H.BY[g];
      const slot = by >= 0 && by < this.cap && this.inFight[by] ? by : -1;
      if (slot >= 0) {
        this.pops[slot] += 1;
      }
      const e = this.event('home', slot, -1, 0, '', OX + H.X[g] * S, S * 0.4, OZ - H.Y[g] * S);
      if (e) {
        e.goat = g;
      }
    }
    const timeUp = this.roundMs > 0 && now - this.startedMs >= this.roundMs;
    if (timeUp || home >= H.count) {
      this.over = true;
      this.overAtMs = now;
      /* Most goats wins; level at the top is a draw. */
      const rows = this.standings();
      const a = rows[0];
      const b = rows[1];
      this.winner = a && a.goats > 0 && (!b || b.goats < a.goats) ? a.slot : -1;
      this.event('over', this.winner, -1, 0, '', 0, 0, 0);
    }
  }

  standings() {
    const out = [];
    for (let i = 0; i < this.cap; i += 1) {
      if (!this.inFight[i]) {
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

export { MAX_PILOTS, ME };
