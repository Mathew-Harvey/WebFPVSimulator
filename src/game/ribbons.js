/*
 * ribbons.js: Ribbon cutting, a game on any map. Every quad trails a
 * ribbon. Fly through somebody else's to cut it, keep your own whole, and
 * the last with a ribbon wins. The owner's ask of 2026-10-29: "ribbon
 * cutting, where everyone has a ribbon attached to their quad and they need
 * to cut others ribbons off and preserve their own, the last with a ribbon
 * wins".
 *
 * IT IS THE DOGFIGHT WITHOUT THE GUNS. The bots, their flying, the arena,
 * the spawns and the world the shell reads from the map are
 * src/game/dogfight.js's, and this class is that game with the gun and the
 * missiles never fired, the bots aiming at a ribbon instead of a quad, and
 * a ribbon on everybody. Everything that file promises holds here: PURE,
 * no Three.js, no DOM, no JS trigonometry, nothing allocated on a step, its
 * own clock fed every DOGFIGHT_EVERY steps of the lap clock, integer random
 * numbers, so a round replays bit for bit in Node and in the browser.
 *
 * NOTHING HERE TOUCHES THE PLANT. A ribbon is drawn and never uploaded; it
 * pulls on nothing and a cut changes nothing about how the quad flies.
 *
 * A RIBBON is RIBBON_POINTS points on a string. The first is tied to the
 * back of the quad. Each feed every other point keeps a share of the way it
 * was moving (the air holds a ribbon back), falls a little (it is light),
 * and is then pulled to within one link of the point in front of it, from
 * the quad down to the tail: a rope that only resists stretching. So it
 * streams out straight behind a quad going fast, hangs and drifts down
 * under one that hovers, and lies on the floor under one that has landed.
 * That is a square root a link and nothing else.
 *
 * A CUT is a quad's centre passing within RIBBON.cutR of a link of
 * somebody else's ribbon, along the line the quad moved since the last
 * feed, so a quad going fast cannot step over a ribbon between feeds. The
 * ribbon is cut there and the tail falls away. A ribbon cut shorter than
 * RIBBON.stub of its length is gone, and so is its pilot: out of the round.
 * The links next to the quad cannot be cut (the knot), so a bump is not a
 * cut, and nobody can cut their own.
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
  Dogfight, DOGFIGHT_EVERY, MAX_PILOTS, MAX_BOTS, ME, SKILLS, rng,
} from './dogfight.js';
import { BotFlyer } from './botflyer.js';

const DT = DOGFIGHT_EVERY / 1000;
const G = 9.81;

export const RIBBON_POINTS = 16;

/*
 * THE RIBBON, in the aircraft's own metres.
 *
 * lengths   how long a whole ribbon is, by the round's setting. Longer is
 *           easier to cut and harder to keep.
 * cutR      how near a pilot's quad has to pass a link to cut it: the
 *           props' reach and a little more, because a near miss that cuts
 *           feels right on an FPV lens and a pass through that does not
 *           feels broken.
 * botCutR   the same for a bot, which flies a perfect line and needs no
 *           help.
 * knot      how much of the ribbon next to the quad cannot be cut: a bump
 *           into the quad is not a cut.
 * stub      the share of what can be cut that a ribbon can lose all but
 *           and still count. Shorter than this and it is gone.
 * drag      the share of its motion a point keeps from one feed to the
 *           next. With fall, a ribbon on its own drifts down at a little
 *           over a metre a second, the way a streamer does.
 * fall      the share of gravity a point feels.
 * graceMs   after the round starts, how long before a ribbon can be cut,
 *           so a bot that spawned behind the pilot does not end the round
 *           before anybody has flown.
 * safeMs    how long a ribbon that has just been cut cannot be cut again,
 *           so a quad flying straight down a ribbon cuts it once and does
 *           not eat it link by link in a quarter of a second.
 */
export const RIBBON = {
  lengths: { short: 3, normal: 4.5, long: 6 },
  cutR: 0.5,
  botCutR: 0.3,
  knot: 0.8,
  stub: 0.25,
  drag: 0.96,
  fall: 0.5,
  graceMs: 1500,
  safeMs: 400,
};

/*
 * HOW THE BOTS GO FOR A RIBBON, by the dogfight's skills. miss: how far
 * off the ribbon, in metres, a bot's line wanders, a new wander every
 * second and a half. calmMs: after a cut, how long it flies off before it
 * picks another ribbon, so a pilot cut once has a moment to get away and
 * the bots do not queue up on the same quad.
 */
export const RIBBON_BOTS = {
  rookie: { miss: 3.6, calmMs: 6000 },
  pilot: { miss: 2, calmMs: 3500 },
  ace: { miss: 0.8, calmMs: 1500 },
};

/* Rounds: how long, 0 for no clock. When the clock runs out the longest
 * ribbon left wins. */
export const RIBBON_ROUNDS = {
  '2m': 120000,
  '4m': 240000,
  none: 0,
};

/* A quad that moves further than this in one feed was put there, not
 * flown there (a crash recovery, a restart): 300 m/s. Its line is not a
 * line it flew through anything, and its ribbon is laid again where it
 * landed. */
const JUMP = 3;

export function normaliseRibbonRules(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const bots = Number.isInteger(r.bots) ? Math.max(0, Math.min(MAX_BOTS, r.bots)) : 3;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  return {
    game: 'ribbon',
    bots,
    skill: has(SKILLS, r.skill) ? r.skill : 'rookie',
    round: has(RIBBON_ROUNDS, r.round) ? r.round : '2m',
    length: has(RIBBON.lengths, r.length) ? r.length : 'normal',
  };
}

/* The rules as the dogfight underneath wants them: its bots and their
 * skill, no clock of its own and no pop target. */
function underneath(r) {
  return {
    bots: r.bots, skill: r.skill, round: 'none', hits: 'arcade',
  };
}

export class RibbonCut extends Dogfight {
  constructor(world, rules, seed) {
    const r = normaliseRibbonRules(rules);
    super(world, underneath(r), seed);
    this.ribbon = r;
    /* How many slots there are: the dogfight's eight here, a room's
     * pilots in RibbonRoom below. */
    this.cap = MAX_PILOTS;
    const n = MAX_PILOTS * RIBBON_POINTS;
    const f = () => new Float64Array(n);
    this.rx = f(); this.ry = f(); this.rz = f();
    this.rox = f(); this.roy = f(); this.roz = f();
    this.rxPrev = f(); this.ryPrev = f(); this.rzPrev = f();
    this.rCount = new Int8Array(MAX_PILOTS);
    this.rSafeUntil = new Float64Array(MAX_PILOTS);
    this.outAt = new Float64Array(MAX_PILOTS);
    this.cuts = new Int32Array(MAX_PILOTS);
    this.snips = new Int32Array(MAX_PILOTS);
    this.calmUntil = new Float64Array(MAX_PILOTS);
    this.missAt = new Float64Array(MAX_PILOTS);
    this.mx0 = new Float64Array(MAX_PILOTS);
    this.my0 = new Float64Array(MAX_PILOTS);
    this.mz0 = new Float64Array(MAX_PILOTS);
    /* Bots fly at a ribbon, straight through it, and never break off: a
     * flyer of their own (src/game/botflyer.js), the dogfight's flying
     * without its fighting, on the ways round the dogfight's brain found. */
    this.chaseArrays(MAX_PILOTS);
    this.flyer = new BotFlyer(this, { DT, MAX: MAX_PILOTS });
    for (const e of this.events) {
      e.at = 0;
      e.end = 0;
      e.share = 0;
    }
    this.reset(0);
  }

  /* Changing the rules mid round starts a fresh round on them. */
  setRules(rules) {
    this.ribbon = normaliseRibbonRules(rules);
    this.rules = underneath(this.ribbon);
    this.reset(this.round + 1);
  }

  get linkLen() {
    return (RIBBON.lengths[this.ribbon.length] / (RIBBON_POINTS - 1)) * this.k;
  }

  /* The first link that can be cut, link s running from point s - 1 to
   * point s: the first that starts past the knot. */
  get firstLink() {
    const link = RIBBON.lengths[this.ribbon.length] / (RIBBON_POINTS - 1);
    return Math.ceil(RIBBON.knot / link - 1e-9) + 1;
  }

  reset(round) {
    super.reset(round);
    /* The dogfight's constructor resets before this class has its arrays:
     * that first round is the dogfight's alone, and this constructor resets
     * again once they exist. */
    if (!this.rx) {
      return;
    }
    this.roundMs = RIBBON_ROUNDS[this.ribbon.round];
    this.popsToWin = 0;
    if (!this.flyer.nav.length && this.brain && this.brain.nav.length) {
      this.flyer.nav = this.brain.nav;
    }
    this.flyer.reset();
    this.rTarget.fill(-1);
    this.rRetarget.fill(0);
    this.rWanderAt.fill(0);
    this.winner = -1;
    this.rSafeUntil.fill(0);
    this.outAt.fill(0);
    this.cuts.fill(0);
    this.snips.fill(0);
    this.calmUntil.fill(0);
    this.missAt.fill(0);
    for (let i = 0; i < this.cap; i += 1) {
      /* Nobody comes back in this game, and nobody needs a shield. */
      this.shieldUntil[i] = 0;
      this.rCount[i] = this.inFight[i] ? RIBBON_POINTS : 0;
      if (this.inFight[i]) {
        this.layRibbon(i);
      }
      if (this.isBot[i]) {
        this.flyer.placed(i);
      }
    }
  }

  /* What a chasing bot keeps, for `n` slots: who it is after and until
   * when, where it wanders with nobody to chase, and the line it was given
   * this feed. */
  chaseArrays(n) {
    this.rTarget = new Int8Array(n).fill(-1);
    this.rRetarget = new Float64Array(n);
    this.rWanderAt = new Float64Array(n);
    this.rwx = new Float64Array(n);
    this.rwy = new Float64Array(n);
    this.rwz = new Float64Array(n);
    this.gx = 0;
    this.gy = 0;
    this.gz = 0;
  }

  /*
   * ONE FEED OF A BOT: a ribbon to go after, the nearest one ahead, asked
   * again every second and a half or when it is gone; the point on it this
   * bot aims for (goal); and the flyer takes it there, round whatever is
   * in the way, at the skill's speed and agility.
   */
  chase(i, now, skill) {
    const first = this.firstLink;
    let t = this.rTarget[i];
    if (t < 0 || !this.live(t) || this.rCount[t] <= first || now >= this.rRetarget[i]) {
      let best = -1;
      let bestScore = Infinity;
      for (let j = 0; j < this.cap; j += 1) {
        if (j === i || !this.live(j) || this.rCount[j] <= first || (j === ME && !this.meFlying)) {
          continue;
        }
        const dx = this.x[j] - this.x[i];
        const dy = this.y[j] - this.y[i];
        const dz = this.z[j] - this.z[i];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const front = d > 1e-6 ? (dx * this.fx[i] + dy * this.fy[i] + dz * this.fz[i]) / d : 0;
        const score = d * (1.4 - 0.5 * front);
        if (score < bestScore) {
          bestScore = score;
          best = j;
        }
      }
      t = best;
      this.rTarget[i] = t;
      this.rRetarget[i] = now + 1500 + Math.floor(this.rand() * 1000);
    }
    this.ribbon.skill = skill;
    if (t >= 0) {
      this.goal(i, t);
      /* Through it, not to it: the flyer slows for a goal it is reaching,
       * and a ribbon is cut at speed. */
      const dx = this.gx - this.x[i];
      const dy = this.gy - this.y[i];
      const dz = this.gz - this.z[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 1e-6) {
        const on = (8 * this.world.k) / d;
        this.gx += dx * on;
        this.gy += dy * on;
        this.gz += dz * on;
      }
    } else {
      /* Nobody to chase: about the arena. */
      const w = this.world;
      if (now >= this.rWanderAt[i]) {
        this.rWanderAt[i] = now + 4000;
        this.rwx[i] = w.cx + (this.rand() * 2 - 1) * w.radius * 0.6;
        this.rwz[i] = w.cz + (this.rand() * 2 - 1) * w.radius * 0.6;
        this.rwy[i] = w.cy + (2 + this.rand() * 6) * w.k;
      }
      this.gx = this.rwx[i];
      this.gy = this.rwy[i];
      this.gz = this.rwz[i];
    }
    this.flyer.setGoal(i, this.gx, this.gy, this.gz, 0);
    this.flyer.step(i, now, SKILLS[skill]);
  }

  /* How many pilots are in the round, and how many still have a ribbon. */
  get starters() {
    let n = 0;
    for (let i = 0; i < this.cap; i += 1) {
      n += this.inFight[i];
    }
    return n;
  }

  get left() {
    let n = 0;
    for (let i = 0; i < this.cap; i += 1) {
      if (this.live(i)) {
        n += 1;
      }
    }
    return n;
  }

  /* What is left of pilot i's ribbon, 0 to 1. */
  share(i) {
    const c = this.rCount[i];
    return c > 1 ? (c - 1) / (RIBBON_POINTS - 1) : 0;
  }

  /* Where pilot i's ribbon is tied: the back of the quad, a little low. */
  anchor(i) {
    const k = this.k;
    this.anx = this.x[i] - this.fx[i] * 0.12 * k - this.ux[i] * 0.03 * k;
    this.any = this.y[i] - this.fy[i] * 0.12 * k - this.uy[i] * 0.03 * k;
    this.anz = this.z[i] - this.fz[i] * 0.12 * k - this.uz[i] * 0.03 * k;
  }

  /* Pilot i's ribbon laid out fresh behind it, level, at rest: the start
   * of a round, or where a quad was put down. */
  layRibbon(i) {
    this.anchor(i);
    let bx = -this.fx[i];
    let bz = -this.fz[i];
    let m = Math.sqrt(bx * bx + bz * bz);
    if (m < 1e-6) {
      bx = 0;
      bz = 1;
      m = 1;
    }
    bx /= m;
    bz /= m;
    const L = this.linkLen;
    const base = i * RIBBON_POINTS;
    const lift = 0.02 * this.k;
    for (let s = 0; s < RIBBON_POINTS; s += 1) {
      const j = base + s;
      const x = this.anx + bx * L * s;
      const z = this.anz + bz * L * s;
      const fl = this.world.floorAt(x, this.any, z) + lift;
      const y = this.any < fl ? fl : this.any;
      this.rx[j] = x; this.ry[j] = y; this.rz[j] = z;
      this.rox[j] = x; this.roy[j] = y; this.roz[j] = z;
      this.rxPrev[j] = x; this.ryPrev[j] = y; this.rzPrev[j] = z;
    }
  }

  snapshot() {
    for (let i = 0; i < this.cap; i += 1) {
      this.xPrev[i] = this.x[i];
      this.yPrev[i] = this.y[i];
      this.zPrev[i] = this.z[i];
      this.fxPrev[i] = this.fx[i];
      this.fyPrev[i] = this.fy[i];
      this.fzPrev[i] = this.fz[i];
      this.uxPrev[i] = this.ux[i];
      this.uyPrev[i] = this.uy[i];
      this.uzPrev[i] = this.uz[i];
    }
    this.rxPrev.set(this.rx);
    this.ryPrev.set(this.ry);
    this.rzPrev.set(this.rz);
  }

  /* Whether a cut may land: the round running, past its grace. */
  get cutting() {
    return this.running && this.clockMs >= this.startedMs + RIBBON.graceMs;
  }

  /* Bots chase a ribbon: a point most of the way down it, where a cut
   * takes the most. */
  goal(i, t) {
    const now = this.clockMs;
    const k = this.k;
    /* Just cut somebody: straight on, away from it. */
    if (now < this.calmUntil[i]) {
      this.gx = this.x[i] + this.fx[i] * 20 * k;
      this.gy = this.y[i] + this.fy[i] * 4 * k;
      this.gz = this.z[i] + this.fz[i] * 20 * k;
      return;
    }
    const c = this.rCount[t];
    const first = this.firstLink;
    if (c <= first) {
      this.gx = this.x[t];
      this.gy = this.y[t];
      this.gz = this.z[t];
      return;
    }
    let s = Math.floor((c - 1) * 0.75);
    if (s < first) {
      s = first;
    }
    /* The line wanders off the ribbon by the bot's skill. */
    if (now >= this.missAt[i]) {
      this.missAt[i] = now + 1500;
      const miss = RIBBON_BOTS[this.ribbon.skill].miss * k;
      this.mx0[i] = (this.rand() * 2 - 1) * miss;
      this.my0[i] = (this.rand() * 2 - 1) * miss * 0.6;
      this.mz0[i] = (this.rand() * 2 - 1) * miss;
    }
    const j = t * RIBBON_POINTS + s;
    this.gx = this.rx[j] + this.mx0[i];
    this.gy = this.ry[j] + this.my0[i];
    this.gz = this.rz[j] + this.mz0[i];
  }

  /*
   * ONE FEED. me: as the dogfight's, gun and missile ignored.
   */
  step(me, teleported = false) {
    this.snapshot();
    this.clockMs += DOGFIGHT_EVERY;
    const now = this.clockMs;
    this.meFlying = Boolean(me.flying);
    const wasX = this.x[ME];
    const wasY = this.y[ME];
    const wasZ = this.z[ME];
    const first = !this.havePrevMe;
    this.feedMe(me, teleported);
    const jx = this.x[ME] - wasX;
    const jy = this.y[ME] - wasY;
    const jz = this.z[ME] - wasZ;
    const jump = first || teleported || jx * jx + jy * jy + jz * jz > JUMP * JUMP * this.k * this.k;
    if (jump) {
      this.xPrev[ME] = this.x[ME];
      this.yPrev[ME] = this.y[ME];
      this.zPrev[ME] = this.z[ME];
      if (this.rCount[ME] > 0) {
        this.layRibbon(ME);
      }
    }
    if (this.meFlying && this.startedMs < 0 && this.alive[ME]) {
      this.startedMs = now;
      this.event('go', -1, -1, 0, '', this.x[ME], this.y[ME], this.z[ME]);
    }
    for (let i = 1; i < this.cap; i += 1) {
      if (this.isBot[i] && this.alive[i]) {
        this.chase(i, now, this.ribbon.skill);
      }
    }
    for (let i = 0; i < this.cap; i += 1) {
      if (this.rCount[i] > 1) {
        this.stepRibbon(i);
      }
    }
    if (this.cutting) {
      for (let c = 0; c < this.cap; c += 1) {
        if (!this.live(c) || (c === ME && (jump || !this.meFlying))) {
          continue;
        }
        this.cutsBy(c, now);
      }
    }
    if (this.running) {
      const many = this.starters > 1;
      const timeUp = this.roundMs > 0 && now - this.startedMs >= this.roundMs;
      if (timeUp || !this.alive[ME] || (many && this.left <= 1)) {
        this.over = true;
        this.overAtMs = now;
        /* The last one flying wins. When the clock runs out the longest
         * ribbon wins, and two still flying with the same ribbon and the
         * same cuts is a draw. When the pilot is cut out with others still
         * flying, the round is over for this page and nobody has won it. */
        const rows = this.standings();
        const a = rows[0];
        const b = rows[1];
        this.winner = -1;
        if (a && a.alive && (!b || !b.alive)) {
          this.winner = a.slot;
        } else if (timeUp && a && a.alive) {
          const draw = b && b.alive && a.share === b.share && a.cuts === b.cuts;
          this.winner = draw ? -1 : a.slot;
        }
        this.event('over', this.winner, -1, 0, '', 0, 0, 0);
      }
    }
  }

  /* One feed of pilot i's ribbon: tied to the quad, carried on by what it
   * was doing, a little fall, then pulled into a string from the quad
   * down, and never through the floor. */
  stepRibbon(i) {
    const base = i * RIBBON_POINTS;
    const c = this.rCount[i];
    const k = this.k;
    const L = this.linkLen;
    const drag = RIBBON.drag;
    const fall = RIBBON.fall * G * k * DT * DT;
    const lift = 0.02 * k;
    const w = this.world;
    this.anchor(i);
    this.rox[base] = this.rx[base];
    this.roy[base] = this.ry[base];
    this.roz[base] = this.rz[base];
    this.rx[base] = this.anx;
    this.ry[base] = this.any;
    this.rz[base] = this.anz;
    for (let s = 1; s < c; s += 1) {
      const j = base + s;
      const vx = (this.rx[j] - this.rox[j]) * drag;
      const vy = (this.ry[j] - this.roy[j]) * drag;
      const vz = (this.rz[j] - this.roz[j]) * drag;
      this.rox[j] = this.rx[j];
      this.roy[j] = this.ry[j];
      this.roz[j] = this.rz[j];
      this.rx[j] += vx;
      this.ry[j] += vy - fall;
      this.rz[j] += vz;
    }
    for (let s = 1; s < c; s += 1) {
      const j = base + s;
      const dx = this.rx[j] - this.rx[j - 1];
      const dy = this.ry[j] - this.ry[j - 1];
      const dz = this.rz[j] - this.rz[j - 1];
      const m = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (m > L) {
        /* Pulled along, and the pull is not kept as speed: a point that
         * kept it would whip past the one in front and the tail would
         * fold back on itself. */
        const f = L / m;
        const nx = this.rx[j - 1] + dx * f;
        const ny = this.ry[j - 1] + dy * f;
        const nz = this.rz[j - 1] + dz * f;
        this.rox[j] += nx - this.rx[j];
        this.roy[j] += ny - this.ry[j];
        this.roz[j] += nz - this.rz[j];
        this.rx[j] = nx;
        this.ry[j] = ny;
        this.rz[j] = nz;
      }
      const fl = w.floorAt(this.rx[j], this.ry[j], this.rz[j]) + lift;
      if (this.ry[j] < fl) {
        /* On the floor it stops falling and drags. */
        this.ry[j] = fl;
        this.roy[j] = fl;
        this.rox[j] = (this.rox[j] + this.rx[j]) * 0.5;
        this.roz[j] = (this.roz[j] + this.rz[j]) * 0.5;
      }
    }
  }

  /* Every ribbon pilot c's last move crossed, cut where it crossed nearest
   * the quad it belongs to. */
  cutsBy(c, now) {
    const k = this.k;
    const r = (this.isBot[c] ? RIBBON.botCutR : RIBBON.cutR) * k;
    const r2 = r * r;
    const ax = this.xPrev[c];
    const ay = this.yPrev[c];
    const az = this.zPrev[c];
    const ex = this.x[c] - ax;
    const ey = this.y[c] - ay;
    const ez = this.z[c] - az;
    const moved = Math.sqrt(ex * ex + ey * ey + ez * ez);
    const reach = RIBBON.lengths[this.ribbon.length] * k + r + moved + 1 * k;
    const first = this.firstLink;
    for (let o = 0; o < this.cap; o += 1) {
      if (o === c || !this.live(o) || this.rCount[o] <= first || now < this.rSafeUntil[o]) {
        continue;
      }
      const base = o * RIBBON_POINTS;
      const qx = this.rx[base] - ax;
      const qy = this.ry[base] - ay;
      const qz = this.rz[base] - az;
      if (qx * qx + qy * qy + qz * qz > reach * reach) {
        continue;
      }
      const cnt = this.rCount[o];
      for (let s = first; s < cnt; s += 1) {
        const j = base + s;
        const d2 = segSeg2(
          ax, ay, az, ex, ey, ez,
          this.rx[j - 1], this.ry[j - 1], this.rz[j - 1],
          this.rx[j] - this.rx[j - 1], this.ry[j] - this.ry[j - 1], this.rz[j] - this.rz[j - 1],
        );
        if (d2 <= r2) {
          this.cut(c, o, s, now);
          break;
        }
      }
    }
  }

  /* Pilot c cuts pilot o's ribbon in the link that ends at point s: the
   * points from s on fall away. */
  cut(c, o, s, now) {
    const old = this.rCount[o];
    const j = o * RIBBON_POINTS + s - 1;
    const x = this.rx[j];
    const y = this.ry[j];
    const z = this.rz[j];
    this.snips[c] += 1;
    this.rSafeUntil[o] = now + RIBBON.safeMs;
    if (this.isBot[c]) {
      this.calmUntil[c] = now + RIBBON_BOTS[this.ribbon.skill].calmMs;
    }
    /* What is left of the part that could be cut. */
    const first = this.firstLink;
    const left = (s - first) / (RIBBON_POINTS - first);
    let e;
    if (left < RIBBON.stub) {
      /* Gone, and its pilot with it. The whole ribbon falls. */
      this.rCount[o] = 0;
      this.alive[o] = 0;
      this.outAt[o] = now;
      this.cuts[c] += 1;
      this.pops[c] += 1;
      this.popped[o] += 1;
      e = this.event('out', c, o, 0, 'ribbon', x, y, z, true);
      if (e) {
        e.at = 0;
      }
    } else {
      this.rCount[o] = s;
      e = this.event('cut', c, o, 0, 'ribbon', x, y, z, false);
      if (e) {
        e.at = s - 1;
      }
    }
    if (e) {
      e.end = old;
      e.share = this.share(o);
    }
  }

  /* The table for the results and the HUD: whoever still has a ribbon
   * first, the longest first, then whoever went out last. Allocates, so it
   * is asked when the round ends, never per step. */
  standings() {
    const out = [];
    for (let i = 0; i < this.cap; i += 1) {
      if (!this.inFight[i]) {
        continue;
      }
      out.push({
        slot: i,
        bot: Boolean(this.isBot[i]),
        alive: this.alive[i] === 1,
        share: this.share(i),
        cuts: this.cuts[i],
        snips: this.snips[i],
        outAt: this.outAt[i],
        /* The dogfight's names for the same, for anything that reads them. */
        pops: this.cuts[i],
        popped: this.popped[i],
      });
    }
    out.sort((a, b) => (Number(b.alive) - Number(a.alive))
      || (a.alive ? (b.share - a.share) : (b.outAt - a.outAt))
      || (b.cuts - a.cuts) || (a.slot - b.slot));
    return out;
  }
}

/*
 * RIBBON CUTTING IN A ROOM. The board holds the round (src/rooms.js in the
 * board's repository): who is in it, how long every ribbon is, who is out,
 * and who won. This page draws every pilot's ribbon from the poses the room
 * sends, as RibbonCut draws a bot's from where the bot flew, and looks for
 * cuts by its own quad only. A cut it sees is not made here: it goes to the
 * board as { t: 'rbCut', n, to, s }, and the board's word back, heard by
 * every page in the room at once, is what cuts the ribbon (applyCut). So
 * two pages that both saw a cut agree on the one the board believed, and a
 * page that is behind is put right by the next word.
 *
 * It is a RibbonCut to the view and the HUD: the same arrays, the same
 * events, for up to ROOM_SLOTS pilots, slot 0 this page's. Nobody here is a
 * bot, and nothing is fired.
 */
export const ROOM_SLOTS = MAX_PILOTS + 64;
/* The host's bots are slots 1 to 7, as the dogfight's are, so the view
 * draws the host's own as it draws the dogfight's; a bot's room id is its
 * slot past BOT_ID_BASE (src/net/roombots.js BOT_ID_FIRST is 201). Room
 * pilots are from slot 8. */
const BOT_ID_BASE = 200;
const FIRST_PILOT_SLOT = MAX_PILOTS;
/* A remote pilot not heard from for this long is not drawn, ms. */
const GONE_MS = 1500;

function borrow(to, from, names) {
  for (const name of names) {
    Object.defineProperty(to, name, Object.getOwnPropertyDescriptor(from, name));
  }
}

export class RibbonRoom {
  constructor(world, { now = () => performance.now() } = {}) {
    this.world = world;
    this.k = world.k;
    this.now = now;
    this.room = true;
    this.cap = ROOM_SLOTS;
    this.ribbon = {
      game: 'ribbon', bots: 0, skill: 'rookie', round: '2m', length: 'normal',
    };
    const n = ROOM_SLOTS;
    const f = (m = n) => new Float64Array(m);
    for (const a of ['x', 'y', 'z', 'fx', 'fy', 'fz', 'ux', 'uy', 'uz']) {
      this[a] = f();
      this[`${a}Prev`] = f();
    }
    this.uy.fill(1);
    this.uyPrev.fill(1);
    this.fz.fill(-1);
    this.fzPrev.fill(-1);
    this.alive = new Uint8Array(n);
    this.inFight = new Uint8Array(n);
    this.isBot = new Uint8Array(n);
    /* The host's bots: how they move, and what chasing a ribbon keeps
     * (RibbonCut chase and goal, borrowed below). */
    for (const a of ['vx', 'vy', 'vz', 'calmUntil', 'missAt', 'mx0', 'my0', 'mz0']) {
      this[a] = f();
    }
    this.firing = new Uint8Array(n);
    this.botSkill = new Array(n).fill('rookie');
    this.rand = rng(0x5eed);
    this.chaseArrays(n);
    this.flyer = new BotFlyer(this, { DT, MAX: n });
    this.flyer.reset();
    this.pops = new Int32Array(n);
    this.popped = new Int32Array(n);
    this.cuts = new Int32Array(n);
    this.snips = new Int32Array(n);
    this.outAt = new Float64Array(n);
    this.rSafeUntil = new Float64Array(n);
    this.rCount = new Int8Array(n);
    const m = n * RIBBON_POINTS;
    this.rx = f(m); this.ry = f(m); this.rz = f(m);
    this.rox = f(m); this.roy = f(m); this.roz = f(m);
    this.rxPrev = f(m); this.ryPrev = f(m); this.rzPrev = f(m);
    /* Nothing is fired in a ribbon round: the view's loops find none. */
    this.pAlive = [];
    this.mAlive = [];
    this.events = [];
    for (let i = 0; i < 96; i += 1) {
      this.events.push({
        type: '', by: -1, to: -1, dmg: 0, weapon: '', x: 0, y: 0, z: 0, big: false, fromX: 0, fromY: 0, fromZ: 0, at: 0, end: 0, share: 0,
      });
    }
    this.eventCount = 0;
    /* Which room pilot is in which slot, their name, and the latest pose
     * the room drew for them, taken at the next feed. */
    this.idOf = new Int32Array(n).fill(-1);
    this.slots = new Map();
    this.names = new Array(n).fill('');
    this.avatars = new Array(n).fill(null);
    this.seenAt = new Float64Array(n).fill(-1e9);
    this.fresh = new Uint8Array(n);
    this.tx = f(); this.ty = f(); this.tz = f();
    this.tfx = f(); this.tfy = f(); this.tfz = f();
    this.tux = f(); this.tuy = f(); this.tuz = f();
    this.relay = new Uint8Array(n);
    this.you = 0;
    this.host = false;
    this.state = {
      phase: 'pit', length: 'normal', round: '2m', n: 0, goAt: 0, endAt: 0, winner: null, rows: [],
    };
    this.rows = new Map();
    this.goLocal = 0;
    this.endLocal = 0;
    this.heardOverAt = 0;
    this.dismissed = false;
    this.outbox = [];
    this.clockMs = 0;
    this.havePrevMe = false;
    this.meFlying = false;
    this.round = 0;
    this.alive[ME] = 1;
    this.inFight[ME] = 1;
    this.rCount[ME] = RIBBON_POINTS;
  }

  /* The room's numbers for the HUD. */
  get phase() {
    return this.state.phase;
  }

  get roundMs() {
    return RIBBON_ROUNDS[this.state.round] || 0;
  }

  /* In a round: counting down, live, or its results. */
  get inRound() {
    const p = this.state.phase;
    return (p === 'count' || p === 'live' || p === 'results') && !this.dismissed;
  }

  get running() {
    return this.state.phase === 'live';
  }

  get cutting() {
    return this.state.phase === 'live' && this.now() >= this.goLocal + RIBBON.graceMs;
  }

  /* Over, for the results panel: the board's results, until they have
   * been up for RESULT_MS on this page. */
  get over() {
    return this.state.phase === 'results' && !this.dismissed;
  }

  get startedMs() {
    return this.running ? 0 : -1;
  }

  get winner() {
    const w = this.state.winner;
    return w == null || !this.slots.has(w) ? -1 : this.slots.get(w);
  }

  leftMs() {
    if (!this.roundMs) {
      return 0;
    }
    if (this.state.phase === 'live' || this.state.phase === 'count') {
      return Math.max(0, Math.min(this.roundMs, this.endLocal - this.now()));
    }
    return this.roundMs;
  }

  sinceOverMs() {
    return this.over ? this.now() - this.heardOverAt : 0;
  }

  /* Results are dismissed after their time; a fresh run changes nothing
   * else, since the round is the room's. */
  reset() {
    if (this.over) {
      this.dismissed = true;
      this.fillAll();
    }
    this.havePrevMe = false;
  }

  setRules() {
  }

  nameOf(i) {
    return i === ME ? 'YOU' : (this.names[i] || 'PILOT');
  }

  /* A slot for room pilot `id`, made the first time it is asked for. A
   * bot's is fixed by its id. */
  slotFor(id) {
    if (id === this.you) {
      return ME;
    }
    let s = this.slots.get(id);
    if (s !== undefined) {
      return s;
    }
    if (id > BOT_ID_BASE && id < BOT_ID_BASE + FIRST_PILOT_SLOT) {
      s = id - BOT_ID_BASE;
      this.idOf[s] = id;
      this.slots.set(id, s);
      return s;
    }
    s = -1;
    for (let i = FIRST_PILOT_SLOT; i < ROOM_SLOTS; i += 1) {
      if (this.idOf[i] < 0) {
        s = i;
        break;
      }
    }
    if (s < 0) {
      /* Full: the one longest unheard and not in the round gives way. */
      let oldest = Infinity;
      for (let i = FIRST_PILOT_SLOT; i < ROOM_SLOTS; i += 1) {
        if (!this.rows.has(this.idOf[i]) && this.seenAt[i] < oldest) {
          oldest = this.seenAt[i];
          s = i;
        }
      }
      if (s < 0) {
        return -1;
      }
      this.slots.delete(this.idOf[s]);
    }
    this.idOf[s] = id;
    this.slots.set(id, s);
    this.names[s] = '';
    this.avatars[s] = null;
    this.fresh[s] = 1;
    this.rCount[s] = 0;
    this.alive[s] = 0;
    this.inFight[s] = 0;
    return s;
  }

  /* Present: this page's own pilot, a bot this page flies, or a remote
   * one drawn lately. */
  here(i) {
    return i === ME || this.isBot[i] === 1 || this.now() - this.seenAt[i] < GONE_MS;
  }

  /*
   * The board's bot seats, [{ id, name, skill }], and whether this page is
   * the host that flies them. A bot this page starts flying starts where
   * the room last drew it, or at a spawn if it was never drawn.
   */
  setBots(seats, mine) {
    for (let s = 1; s < FIRST_PILOT_SLOT; s += 1) {
      const id = BOT_ID_BASE + s;
      let seat = null;
      for (let n = 0; n < seats.length; n += 1) {
        if (seats[n].id === id) seat = seats[n];
      }
      if (!seat) {
        if (this.idOf[s] >= 0) {
          this.slots.delete(this.idOf[s]);
          this.idOf[s] = -1;
          this.isBot[s] = 0;
          this.rCount[s] = 0;
          this.inFight[s] = 0;
          this.alive[s] = 0;
        }
        continue;
      }
      const fresh = this.idOf[s] < 0;
      this.slotFor(id);
      this.names[s] = seat.name;
      this.botSkill[s] = seat.skill;
      if (mine && !this.isBot[s]) {
        this.isBot[s] = 1;
        if (fresh || this.now() - this.seenAt[s] > GONE_MS) {
          const sp = this.world.spawns[(s - 1) % this.world.spawns.length];
          this.x[s] = sp.x; this.y[s] = sp.y; this.z[s] = sp.z;
          const dx = this.world.cx - sp.x;
          const dz = this.world.cz - sp.z;
          const m = Math.sqrt(dx * dx + dz * dz) || 1;
          this.fx[s] = dx / m; this.fy[s] = 0; this.fz[s] = dz / m;
          this.ux[s] = 0; this.uy[s] = 1; this.uz[s] = 0;
          this.vx[s] = 0; this.vy[s] = 0; this.vz[s] = 0;
          this.xPrev[s] = sp.x; this.yPrev[s] = sp.y; this.zPrev[s] = sp.z;
        }
        this.flyer.placed(s);
        this.rTarget[s] = -1;
        if (!this.inRound) {
          this.inFight[s] = 1;
          this.alive[s] = 1;
          this.rCount[s] = RIBBON_POINTS;
          this.layRibbon(s);
        }
      } else if (!mine && this.isBot[s]) {
        this.isBot[s] = 0;
        this.fresh[s] = 1;
      }
    }
  }

  /* Whether bot slot s should be in the air: in the round, or between
   * rounds. */
  botFlies(s) {
    return this.isBot[s] === 1 && (this.inRound ? this.live(s) : true);
  }

  live(i) {
    return this.inFight[i] === 1 && this.alive[i] === 1 && this.here(i);
  }

  /*
   * A remote pilot's pose as the room drew it this frame (src/main.js
   * mpDraw): world metres and the craft's quaternion, and the room's
   * pilot, { handle, avatar }, for the name and the ribbon's livery. Taken
   * at the next feed, so the ribbon moves on the game's own beat.
   */
  remote(id, pose, pilot) {
    const s = this.slotFor(id);
    if (s <= 0) {
      return;
    }
    if (pilot) {
      this.names[s] = String(pilot.handle || '').slice(0, 24);
      this.avatars[s] = pilot.avatar || null;
    }
    const t = this.now();
    if (pose.cut || t - this.seenAt[s] > GONE_MS) {
      this.fresh[s] = 1;
    }
    this.seenAt[s] = t;
    const qx = pose.qx; const qy = pose.qy; const qz = pose.qz; const qw = pose.qw;
    this.tx[s] = pose.px;
    this.ty[s] = pose.py;
    this.tz[s] = pose.pz;
    /* The craft's up, +Y turned, and its nose, -Z turned. */
    this.tux[s] = 2 * (qx * qy - qw * qz);
    this.tuy[s] = 1 - 2 * (qx * qx + qz * qz);
    this.tuz[s] = 2 * (qy * qz + qw * qx);
    this.tfx[s] = -2 * (qx * qz + qw * qy);
    this.tfy[s] = -2 * (qy * qz - qw * qx);
    this.tfz[s] = -(1 - 2 * (qx * qx + qy * qy));
  }

  /* Who this page is in the room, whether it is the host, and its own
   * avatar for its ribbon's livery. */
  setYou(you, host, avatar = null) {
    if (you !== this.you) {
      const s = this.slots.get(you);
      if (s !== undefined) {
        this.slots.delete(you);
        this.idOf[s] = -1;
      }
      this.you = you;
    }
    this.host = Boolean(host);
    this.avatars[ME] = avatar;
  }

  /*
   * The board's round, { phase, length, round, n, goAt, endAt, winner,
   * rows }, with GO and the end already put on this page's clock.
   */
  heard(state, goLocal, endLocal) {
    const was = this.state;
    this.state = state;
    this.goLocal = goLocal;
    this.endLocal = endLocal;
    this.ribbon.length = state.length;
    this.ribbon.round = state.round;
    const fresh = state.n !== was.n || state.length !== was.length;
    if (state.phase === 'results' && (was.phase !== 'results' || state.n !== was.n)) {
      this.heardOverAt = this.now();
      this.dismissed = false;
    }
    if (state.phase !== 'results') {
      this.dismissed = false;
    }
    this.rows = new Map();
    for (const row of state.rows) {
      this.rows.set(row.id, { ...row });
    }
    if (!this.inRound) {
      this.fillAll(fresh);
      return;
    }
    for (let i = 0; i < ROOM_SLOTS; i += 1) {
      const id = i === ME ? this.you : this.idOf[i];
      const row = id >= 0 ? this.rows.get(id) : null;
      if (!row) {
        this.inFight[i] = 0;
        this.alive[i] = 0;
        this.rCount[i] = 0;
        continue;
      }
      this.inFight[i] = 1;
      this.alive[i] = row.out ? 0 : 1;
      this.cuts[i] = row.cuts;
      this.pops[i] = row.cuts;
      this.snips[i] = row.snips;
      this.outAt[i] = row.outAt;
      const want = row.out ? 0 : row.count;
      if (fresh || want > this.rCount[i]) {
        this.rCount[i] = want;
        if (want) {
          this.layRibbon(i);
        }
      } else {
        this.rCount[i] = want;
      }
    }
    /* Rows for pilots this page has not drawn yet get their slot now, so
     * the table can name them. */
    for (const id of this.rows.keys()) {
      this.slotFor(id);
    }
  }

  /* Out of a round: everybody here flies a whole ribbon, which nothing can
   * cut until the host starts one. */
  fillAll(relay = false) {
    for (let i = 0; i < ROOM_SLOTS; i += 1) {
      const known = i === ME || this.idOf[i] >= 0;
      this.inFight[i] = known ? 1 : 0;
      this.alive[i] = known ? 1 : 0;
      this.cuts[i] = 0;
      this.pops[i] = 0;
      this.snips[i] = 0;
      if (known && (relay || this.rCount[i] < RIBBON_POINTS)) {
        this.rCount[i] = RIBBON_POINTS;
        this.layRibbon(i);
      }
    }
  }

  /* The board's word on a cut: { by, to, s, out } for round n. */
  applyCut(msg) {
    if (msg.n !== this.state.n) {
      return;
    }
    const c = this.slotFor(msg.by);
    const o = this.slotFor(msg.to);
    const row = this.rows.get(msg.to);
    const byRow = this.rows.get(msg.by);
    if (byRow) {
      byRow.snips += 1;
      if (msg.out) {
        byRow.cuts += 1;
      }
    }
    if (row) {
      row.count = msg.out ? 0 : msg.s;
      row.out = Boolean(msg.out);
      if (msg.out) {
        row.outAt = this.now();
      }
    }
    if (o < 0) {
      return;
    }
    const old = this.rCount[o];
    const at = Math.max(1, Math.min(msg.s, old > 0 ? old : msg.s));
    const j = o * RIBBON_POINTS + at - 1;
    const x = this.rx[j];
    const y = this.ry[j];
    const z = this.rz[j];
    if (c >= 0) {
      this.snips[c] += 1;
      if (msg.out) {
        this.cuts[c] += 1;
        this.pops[c] += 1;
      }
    }
    let e;
    if (msg.out) {
      this.rCount[o] = 0;
      this.alive[o] = 0;
      this.outAt[o] = this.now();
      e = this.event('out', c, o, 0, 'ribbon', x, y, z, true);
      if (e) e.at = 0;
    } else {
      this.rCount[o] = Math.min(old, msg.s);
      e = this.event('cut', c, o, 0, 'ribbon', x, y, z, false);
      if (e) e.at = at - 1;
    }
    if (e) {
      e.end = old;
      e.share = this.share(o);
    }
  }

  /* A cut this page saw, its pilot's or a bot's it flies, for the board
   * to judge. Not made here; and the same ribbon is not asked about again
   * until the board could have answered. */
  cut(c, o, s, now) {
    const to = o === ME ? this.you : this.idOf[o];
    if ((c !== ME && !this.isBot[c]) || to < 0) {
      return;
    }
    this.rSafeUntil[o] = now + RIBBON.safeMs;
    const msg = {
      t: 'rbCut', n: this.state.n, to, s,
    };
    if (c !== ME) {
      msg.by = this.idOf[c];
      this.calmUntil[c] = now + RIBBON_BOTS[this.botSkill[c]].calmMs;
    }
    this.outbox.push(msg);
  }

  /* What there is to send, taken. */
  takeOutbox() {
    if (!this.outbox.length) {
      return null;
    }
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  snapshot() {
    for (const a of ['x', 'y', 'z', 'fx', 'fy', 'fz', 'ux', 'uy', 'uz']) {
      this[`${a}Prev`].set(this[a]);
    }
    this.rxPrev.set(this.rx);
    this.ryPrev.set(this.ry);
    this.rzPrev.set(this.rz);
  }

  /* ONE FEED: this page's pilot as RibbonCut takes it, the others where
   * the room last drew them, every ribbon on, and this pilot's cuts. */
  step(me, teleported = false) {
    this.snapshot();
    this.clockMs += DOGFIGHT_EVERY;
    const now = this.clockMs;
    this.meFlying = Boolean(me.flying);
    const wasX = this.x[ME];
    const wasY = this.y[ME];
    const wasZ = this.z[ME];
    const first = !this.havePrevMe;
    this.havePrevMe = true;
    this.x[ME] = me.x; this.y[ME] = me.y; this.z[ME] = me.z;
    this.fx[ME] = me.fx; this.fy[ME] = me.fy; this.fz[ME] = me.fz;
    this.ux[ME] = me.ux; this.uy[ME] = me.uy; this.uz[ME] = me.uz;
    const k = this.k;
    const jx = me.x - wasX;
    const jy = me.y - wasY;
    const jz = me.z - wasZ;
    const jump = first || teleported || jx * jx + jy * jy + jz * jz > JUMP * JUMP * k * k;
    if (jump) {
      this.xPrev[ME] = me.x;
      this.yPrev[ME] = me.y;
      this.zPrev[ME] = me.z;
      if (this.rCount[ME] > 0) {
        this.layRibbon(ME);
      }
    }
    for (let i = 1; i < ROOM_SLOTS; i += 1) {
      if (this.isBot[i]) {
        if (this.botFlies(i)) {
          this.chase(i, now, this.botSkill[i]);
        }
        continue;
      }
      if (this.idOf[i] < 0 || !this.here(i)) {
        continue;
      }
      this.x[i] = this.tx[i]; this.y[i] = this.ty[i]; this.z[i] = this.tz[i];
      this.fx[i] = this.tfx[i]; this.fy[i] = this.tfy[i]; this.fz[i] = this.tfz[i];
      this.ux[i] = this.tux[i]; this.uy[i] = this.tuy[i]; this.uz[i] = this.tuz[i];
      const dx = this.x[i] - this.xPrev[i];
      const dy = this.y[i] - this.yPrev[i];
      const dz = this.z[i] - this.zPrev[i];
      /* Its speed, which a bot leads it by. */
      this.vx[i] = dx / DT;
      this.vy[i] = dy / DT;
      this.vz[i] = dz / DT;
      if (this.fresh[i] || dx * dx + dy * dy + dz * dz > JUMP * JUMP * k * k) {
        this.vx[i] = 0;
        this.vy[i] = 0;
        this.vz[i] = 0;
        this.fresh[i] = 0;
        this.xPrev[i] = this.x[i]; this.yPrev[i] = this.y[i]; this.zPrev[i] = this.z[i];
        if (!this.inRound && this.rCount[i] < RIBBON_POINTS) {
          this.inFight[i] = 1;
          this.alive[i] = 1;
          this.rCount[i] = RIBBON_POINTS;
        }
        if (this.rCount[i] > 0) {
          this.layRibbon(i);
        }
      }
    }
    for (let i = 0; i < ROOM_SLOTS; i += 1) {
      if (this.rCount[i] > 1 && this.here(i)) {
        this.stepRibbon(i);
      }
    }
    if (this.cutting) {
      if (this.live(ME) && this.meFlying && !jump) {
        this.cutsBy(ME, now);
      }
      for (let c = 1; c < FIRST_PILOT_SLOT; c += 1) {
        if (this.isBot[c] && this.live(c)) {
          this.cutsBy(c, now);
        }
      }
    }
  }

  /* How many are in the round, and how many still have a ribbon. */
  get starters() {
    if (!this.inRound) {
      let n = 0;
      for (let i = 0; i < ROOM_SLOTS; i += 1) {
        if (this.idOf[i] >= 0 || i === ME) n += this.here(i) ? 1 : 0;
      }
      return n;
    }
    return this.rows.size;
  }

  get left() {
    if (!this.inRound) {
      return this.starters;
    }
    let n = 0;
    for (const row of this.rows.values()) {
      n += row.out ? 0 : 1;
    }
    return n;
  }

  /* Whether this pilot flies in the round on now. */
  get mine() {
    return this.rows.has(this.you);
  }

  /* The table, as the board sorts it. */
  standings() {
    const out = [];
    for (const row of this.rows.values()) {
      const slot = this.slotFor(row.id);
      out.push({
        slot,
        bot: false,
        alive: !row.out,
        share: row.out || row.count <= 1 ? 0 : (row.count - 1) / (RIBBON_POINTS - 1),
        cuts: row.cuts,
        snips: row.snips,
        outAt: row.outAt,
        pops: row.cuts,
        popped: 0,
      });
    }
    out.sort((a, b) => (Number(b.alive) - Number(a.alive))
      || (a.alive ? (b.share - a.share) : (b.outAt - a.outAt))
      || (b.cuts - a.cuts) || (a.slot - b.slot));
    return out;
  }

  /* The line across the top, or '' for none. */
  get banner() {
    const st = this.state;
    const t = this.now();
    if (st.phase === 'count' || (st.phase === 'live' && t < this.goLocal + RIBBON.graceMs)) {
      if (!this.mine) {
        return 'A round is starting. You fly the next one.';
      }
      const s = Math.ceil((this.goLocal - t) / 1000);
      return s > 0 ? `Ribbons out in ${s}` : 'Ribbons out!';
    }
    if (st.phase === 'live') {
      if (!this.mine) {
        return 'This round started before you came in. You fly the next one.';
      }
      return this.alive[ME] ? '' : 'You are out. The round goes on without you.';
    }
    if (this.over) {
      return '';
    }
    if (this.starters < 2) {
      return 'Ribbon cutting needs two pilots. Send the room\'s link to a friend.';
    }
    return this.host
      ? 'Press G to start a round. Everybody here gets a ribbon.'
      : 'Waiting for the host to start a round. Fly about and get ready.';
  }
}

borrow(RibbonRoom.prototype, RibbonCut.prototype, ['linkLen', 'firstLink', 'share', 'anchor', 'layRibbon', 'stepRibbon', 'cutsBy', 'goal', 'chaseArrays', 'chase']);
borrow(RibbonRoom.prototype, Dogfight.prototype, ['event']);

/*
 * The squared distance between two segments, a + s e and b + t f with s
 * and t in 0 to 1: the closest points by the textbook clamp (Ericson,
 * Real-Time Collision Detection, 5.1.9). Divisions and products only.
 */
function segSeg2(ax, ay, az, ex, ey, ez, bx, by, bz, fx, fy, fz) {
  const rx = ax - bx;
  const ry = ay - by;
  const rz = az - bz;
  const a = ex * ex + ey * ey + ez * ez;
  const e = fx * fx + fy * fy + fz * fz;
  const f = fx * rx + fy * ry + fz * rz;
  let s;
  let t;
  if (a <= 1e-12 && e <= 1e-12) {
    return rx * rx + ry * ry + rz * rz;
  }
  if (a <= 1e-12) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = ex * rx + ey * ry + ez * rz;
    if (e <= 1e-12) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = ex * fx + ey * fy + ez * fz;
      const den = a * e - b * b;
      s = den > 1e-12 ? clamp01((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const dx = rx + ex * s - fx * t;
  const dy = ry + ey * s - fy * t;
  const dz = rz + ez * s - fz * t;
  return dx * dx + dy * dy + dz * dz;
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}
