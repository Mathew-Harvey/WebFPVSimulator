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
  Dogfight, DOGFIGHT_EVERY, MAX_PILOTS, MAX_BOTS, ME, SKILLS,
} from './dogfight.js';

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
  rookie: { miss: 2.6, calmMs: 4000 },
  pilot: { miss: 1.4, calmMs: 2500 },
  ace: { miss: 0.6, calmMs: 1200 },
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
    /* Bots fly at a ribbon, straight through it, and never break off; and
     * the pilot is one of the field to them, not the one they want. */
    this.closeIn = 0;
    this.meBias = 1;
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
    this.winner = -1;
    this.rSafeUntil.fill(0);
    this.outAt.fill(0);
    this.cuts.fill(0);
    this.snips.fill(0);
    this.calmUntil.fill(0);
    this.missAt.fill(0);
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      /* Nobody comes back in this game, and nobody needs a shield. */
      this.shieldUntil[i] = 0;
      this.rCount[i] = this.inFight[i] ? RIBBON_POINTS : 0;
      if (this.inFight[i]) {
        this.layRibbon(i);
      }
    }
  }

  /* How many pilots are in the round, and how many still have a ribbon. */
  get starters() {
    let n = 0;
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      n += this.inFight[i];
    }
    return n;
  }

  get left() {
    let n = 0;
    for (let i = 0; i < MAX_PILOTS; i += 1) {
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
    for (let i = 0; i < MAX_PILOTS; i += 1) {
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
      super.goal(i, t);
      return;
    }
    let s = Math.floor((c - 1) * 0.6);
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
    for (let i = 1; i < MAX_PILOTS; i += 1) {
      if (this.isBot[i] && this.alive[i]) {
        this.fly(i, now, false);
      }
    }
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      if (this.rCount[i] > 1) {
        this.stepRibbon(i);
      }
    }
    if (this.cutting) {
      for (let c = 0; c < MAX_PILOTS; c += 1) {
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
    for (let o = 0; o < MAX_PILOTS; o += 1) {
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
    for (let i = 0; i < MAX_PILOTS; i += 1) {
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
