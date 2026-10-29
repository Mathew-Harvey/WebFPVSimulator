/*
 * dogfight.js: Dogfight, a game on any map. The pilot and up to seven bots
 * fly round the map with a gun and missiles, and the most pops when the
 * round ends wins. The owner's ask of 2026-10-29: "a dog fighting mini
 * game, give a new hud and missiles and guns with variable damage, and the
 * ability to add in bots to a single player map or multiplayer map".
 *
 * PURE, as src/game/balloons.js is: no Three.js, no DOM, no JS
 * trigonometry and nothing allocated on a step. Its clock is its own,
 * DOGFIGHT_EVERY ms a feed. In flight the shell feeds it every
 * DOGFIGHT_EVERY steps of the lap clock, from the step loop, so a dropped
 * frame changes nothing it does and the same seed and the same craft path
 * give the same fight; while the plant is not stepping (landed, popped and
 * waiting) the frame feeds it so the bots fly on. Directions turn by adding
 * a small perpendicular and renormalising, which is a square root (exact
 * in IEEE) rather than a sine, and the random numbers are integer
 * arithmetic, so a fight replays bit for bit in Node and in the browser.
 *
 * NOTHING HERE TOUCHES THE PLANT. The bots, the pellets and the missiles
 * are drawn and never uploaded: a hit takes health and nothing else, so the
 * quad flies exactly as it does with the game off (the owner's choice on
 * whether a hit should shove the quad is the physics model's, and this
 * file never makes it). A pop is the shell's ordinary reset.
 *
 * THE WORLD, in Three.js world metres, Y up, from the shell:
 *
 *   k          world metres per metre of the pilot's aircraft, 1 / the
 *              world scale, so a five inch in a house built three and a half
 *              times life size meets bots and pellets at its own scale
 *   cruise     the pilot's aircraft's cruising speed in its own metres a
 *              second: what a bot flies at, before its skill
 *   cx, cy, cz the spawn, and radius: how far from it the bots roam
 *   spawns     [{ x, y, z }]: where a bot comes back
 *   floorAt(x, y, z)                 the surface under the point
 *   blocked(ax, ay, az, bx, by, bz)  where along the segment a solid
 *              first stands, 0 to 1, or -1 for clear
 *
 * Everything in this file's constants is in the aircraft's own metres and
 * goes through k on its way into the world.
 *
 * PILOTS are slots: 0 is this page's pilot, fed every step from the plant;
 * 1 to 7 are bots, flown here. A room (stage 2 of the plan) adds pilots fed
 * from the wire, the same way slot 0 is.
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

/* Milliseconds of the game's clock a feed, and steps of the lap clock
 * between feeds in flight. 100 a second is finer than any frame and a
 * tenth of the plant's rate, so the game's whole cost is a tenth of what
 * stepping it with the plant would be. */
export const DOGFIGHT_EVERY = 10;
const DT = DOGFIGHT_EVERY / 1000;

export const MAX_PILOTS = 8;
export const MAX_BOTS = MAX_PILOTS - 1;
export const ME = 0;

/* How close a pellet or a missile has to pass a quad's centre to hit it.
 * Generous, as the balloons' reach is, because a near miss that hits feels
 * right on an FPV lens and a pass through that does not feels broken. */
const HIT_R = 0.55;

/* THE GUN. Fires while held. Damage falls off with range and is half as
 * much again on a hit square from behind. Heat rises with every shot, and a
 * gun held past HEAT_SHOTS is hot until it has cooled to HEAT_RESUME. */
export const GUN = {
  everyMs: 83,
  speed: 220,
  range: 180,
  near: 9,
  far: 4,
  behind: 1.5,
  drop: 1,
  heatShots: 36,
  coolPerS: 1 / 1.5,
  resume: 0.35,
};

/* THE MISSILE. One a press. Locks after LOCK_MS with a target held in the
 * circle; without a lock it flies straight. It turns at TURN rad/s, which
 * is less than a quad can, so a hard turn at the right moment beats it. */
export const MISSILE = {
  speed0: 45,
  speedMax: 70,
  accel: 25,
  turn: 3.5,
  lifeMs: 10000,
  rack: 4,
  reloadMs: 8000,
  coolMs: 600,
  fuse: 1.2,
  blast: 4,
  direct: 55,
  blastNear: 35,
  blastFar: 10,
  lockMs: 800,
  lockRange: 350,
};
/* cos 12 degrees: the lock circle. */
export const LOCK_COS = 0.97815;

/* Hits: health and how long a popped pilot waits. */
export const HITS = {
  arcade: { hp: 100, backMs: 3000 },
  hard: { hp: 60, backMs: 5000 },
};
export const SHIELD_MS = 2000;

/* Rounds. `ms` 0 is no clock. `pops` 0 is no pop target. */
export const ROUNDS = {
  '3m': { ms: 180000, pops: 0 },
  '5m': { ms: 300000, pops: 0 },
  first10: { ms: 0, pops: 10 },
  none: { ms: 0, pops: 0 },
};
export const RESULT_MS = 9000;

/*
 * THE BOTS' SKILLS. speed is a share of the pilot's own aircraft's cruise;
 * turn is rad/s; aim is how far off their aim wanders, rad; lead is how
 * much of the target's motion they aim for; fireCos is how square the
 * target must be in front of them before they shoot; dodge is the chance
 * they break when a missile is coming; missile is the chance a lock is
 * fired, asked twice a second; react is how long a new target takes them.
 */
export const SKILLS = {
  rookie: {
    speed: 0.7, turn: 2.0, aim: 0.07, lead: 0, fireCos: 0.985, dodge: 0, missile: 0.25, react: 900, lockMul: 1.6,
  },
  pilot: {
    speed: 0.85, turn: 2.8, aim: 0.035, lead: 0.6, fireCos: 0.975, dodge: 0.25, missile: 0.5, react: 500, lockMul: 1.2,
  },
  ace: {
    speed: 1.0, turn: 3.4, aim: 0.015, lead: 1.0, fireCos: 0.96, dodge: 0.5, missile: 0.8, react: 250, lockMul: 1,
  },
};

/* Made up names a bot flies under, one per slot, in the menus' capitals.
 * Cartoon on purpose: the youngest pilots are eight. */
export const BOT_NAMES = ['MOCHI', 'GIZMO', 'PIP', 'TOFU', 'ZIPPY', 'BOLT', 'NORI'];

const PELLETS = 256;
const MISSILES = 24;
const EVENTS = 96;
const G = 9.81;

/* mulberry32: integer arithmetic only, so the same seed gives the same
 * stream in every engine. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashKey(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/* The rules a fight is set up with, every field checked, so a stored
 * setting from an older build or a hand edit cannot break a round. */
export function normaliseRules(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const bots = Number.isInteger(r.bots) ? Math.max(0, Math.min(MAX_BOTS, r.bots)) : 3;
  return {
    bots,
    skill: Object.prototype.hasOwnProperty.call(SKILLS, r.skill) ? r.skill : 'pilot',
    round: Object.prototype.hasOwnProperty.call(ROUNDS, r.round) ? r.round : '3m',
    hits: Object.prototype.hasOwnProperty.call(HITS, r.hits) ? r.hits : 'arcade',
  };
}

export class Dogfight {
  /*
   * world: see the header. rules: normaliseRules. seed: the fight's.
   */
  constructor(world, rules, seed) {
    this.world = world;
    this.rules = normaliseRules(rules);
    this.seed = seed >>> 0;
    const n = MAX_PILOTS;
    const f = () => new Float64Array(n);
    /* Pilots, struct of arrays. */
    this.x = f(); this.y = f(); this.z = f();
    this.xPrev = f(); this.yPrev = f(); this.zPrev = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.fx = f(); this.fy = f(); this.fz = f();
    this.ux = f(); this.uy = f(); this.uz = f();
    this.fxPrev = f(); this.fyPrev = f(); this.fzPrev = f();
    this.uxPrev = f(); this.uyPrev = f(); this.uzPrev = f();
    this.hp = f();
    this.backAt = f();
    this.shieldUntil = f();
    this.heat = f();
    this.nextShotAt = f();
    this.rack = f();
    this.reloadAt = f();
    this.missileAt = f();
    this.lockMs = f();
    this.lockOn = new Int8Array(n);
    this.target = new Int8Array(n);
    this.retargetAt = f();
    this.avoidUntil = f();
    this.ax = f(); this.ay = f(); this.az = f();
    this.lookAt = f();
    this.losAt = f();
    this.losOk = new Uint8Array(n);
    this.burstUntil = f();
    this.restUntil = f();
    this.wanderAt = f();
    this.wx = f(); this.wy = f(); this.wz = f();
    this.breakUntil = f();
    this.breakSign = f();
    this.missileTry = f();
    this.alive = new Uint8Array(n);
    this.inFight = new Uint8Array(n);
    this.hot = new Uint8Array(n);
    this.firing = new Uint8Array(n);
    this.isBot = new Uint8Array(n);
    /* Score. */
    this.pops = new Int32Array(n);
    this.popped = new Int32Array(n);
    this.hits = new Int32Array(n);
    this.shots = new Int32Array(n);
    this.streak = new Int32Array(n);
    this.bestStreak = new Int32Array(n);
    this.dodged = new Int32Array(n);
    this.longest = f();
    this.dealt = new Int32Array(n);
    /* Pellets. */
    const p = () => new Float64Array(PELLETS);
    this.pAlive = new Uint8Array(PELLETS);
    this.pOwner = new Int8Array(PELLETS);
    this.px = p(); this.py = p(); this.pz = p();
    this.pxPrev = p(); this.pyPrev = p(); this.pzPrev = p();
    this.pvx = p(); this.pvy = p(); this.pvz = p();
    this.pGone = p();
    this.pWall = p();
    this.pNext = 0;
    /* Missiles. */
    const m = () => new Float64Array(MISSILES);
    this.mAlive = new Uint8Array(MISSILES);
    this.mOwner = new Int8Array(MISSILES);
    this.mTarget = new Int8Array(MISSILES);
    this.mDodge = new Uint8Array(MISSILES);
    this.mx = m(); this.my = m(); this.mz = m();
    this.mxPrev = m(); this.myPrev = m(); this.mzPrev = m();
    this.mdx = m(); this.mdy = m(); this.mdz = m();
    this.mSpeed = m();
    this.mAge = m();
    this.mFromX = m(); this.mFromY = m(); this.mFromZ = m();
    this.mId = new Int32Array(MISSILES);
    this.mSerial = 0;
    /* Events since the shell last drained them. Fixed size; a frame makes
     * a handful. */
    this.events = [];
    for (let i = 0; i < EVENTS; i += 1) {
      this.events.push({
        type: '', by: -1, to: -1, dmg: 0, weapon: '', x: 0, y: 0, z: 0, big: false, fromX: 0, fromY: 0, fromZ: 0,
      });
    }
    this.eventCount = 0;
    this.seen = { x: 0, y: 0, z: 0 };
    /* A bot's goal (goal()), and how near it, in the aircraft's metres, a
     * bot chasing to shoot breaks off and comes round again. */
    this.gx = 0;
    this.gy = 0;
    this.gz = 0;
    this.closeIn = 6;
    /* How much nearer than they are the bots count the pilot when they
     * choose whom to chase: under 1 is the pilot first. */
    this.meBias = 0.75;
    this.reset(0);
  }

  get k() {
    return this.world.k;
  }

  /* Changing the rules mid fight starts a fresh round on them. */
  setRules(rules) {
    this.rules = normaliseRules(rules);
    this.reset(this.round + 1);
  }

  /* A fresh round: everybody whole, at a spawn, no score. */
  reset(round) {
    this.round = round;
    this.rand = rng(this.seed ^ Math.imul(round + 1, 0x9e3779b1));
    const r = this.rules;
    this.hpMax = HITS[r.hits].hp;
    this.backMs = HITS[r.hits].backMs;
    this.roundMs = ROUNDS[r.round].ms;
    this.popsToWin = ROUNDS[r.round].pops;
    this.clockMs = 0;
    this.startedMs = -1;
    this.over = false;
    this.overAtMs = -1;
    this.eventCount = 0;
    this.pAlive.fill(0);
    this.mAlive.fill(0);
    this.havePrevMe = false;
    this.meFlying = false;
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      this.isBot[i] = i > 0 && i <= r.bots ? 1 : 0;
      this.inFight[i] = i === ME || this.isBot[i] ? 1 : 0;
      this.pops[i] = 0;
      this.popped[i] = 0;
      this.hits[i] = 0;
      this.shots[i] = 0;
      this.streak[i] = 0;
      this.bestStreak[i] = 0;
      this.dodged[i] = 0;
      this.longest[i] = 0;
      this.dealt[i] = 0;
      this.target[i] = -1;
      this.lockOn[i] = -1;
      this.lockMs[i] = 0;
      this.firing[i] = 0;
      this.whole(i);
      this.alive[i] = this.inFight[i];
      this.backAt[i] = 0;
      this.shieldUntil[i] = i === ME ? Infinity : SHIELD_MS;
    }
    for (let i = 1; i < MAX_PILOTS; i += 1) {
      if (this.isBot[i]) {
        this.spawnBot(i, (i - 1) * 3);
      }
    }
  }

  whole(i) {
    this.hp[i] = this.hpMax;
    this.heat[i] = 0;
    this.hot[i] = 0;
    this.rack[i] = MISSILE.rack;
    this.reloadAt[i] = 0;
    this.missileAt[i] = 0;
    this.nextShotAt[i] = 0;
    this.avoidUntil[i] = 0;
    this.breakUntil[i] = 0;
    this.burstUntil[i] = 0;
    this.restUntil[i] = 0;
    this.lookAt[i] = i * 7;
    this.losAt[i] = 0;
    this.losOk[i] = 0;
    this.retargetAt[i] = 0;
    this.wanderAt[i] = 0;
    this.missileTry[i] = 0;
  }

  /* A bot at a spawn: slot `pick` of the world's spawns, or the one
   * farthest from anybody who could shoot it, when pick is -1. */
  spawnBot(i, pick) {
    const w = this.world;
    const sp = w.spawns;
    let s = null;
    if (sp.length && pick >= 0) {
      s = sp[pick % sp.length];
    } else if (sp.length) {
      let best = -1;
      for (let k = 0; k < sp.length; k += 1) {
        let near = Infinity;
        for (let j = 0; j < MAX_PILOTS; j += 1) {
          if (j === i || !this.alive[j]) {
            continue;
          }
          const dx = sp[k].x - this.x[j];
          const dy = sp[k].y - this.y[j];
          const dz = sp[k].z - this.z[j];
          const d = dx * dx + dy * dy + dz * dz;
          if (d < near) {
            near = d;
          }
        }
        if (near > best) {
          best = near;
          s = sp[k];
        }
      }
    }
    if (!s) {
      s = { x: w.cx, y: w.cy + 3 * w.k, z: w.cz };
    }
    this.x[i] = s.x;
    this.y[i] = s.y;
    this.z[i] = s.z;
    /* Facing the middle of the arena, level. */
    let dx = w.cx - s.x;
    let dz = w.cz - s.z;
    let m = Math.sqrt(dx * dx + dz * dz);
    if (m < 1e-6) {
      dx = 1;
      dz = 0;
      m = 1;
    }
    this.fx[i] = dx / m;
    this.fy[i] = 0;
    this.fz[i] = dz / m;
    this.ux[i] = 0;
    this.uy[i] = 1;
    this.uz[i] = 0;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.vz[i] = 0;
    this.xPrev[i] = s.x;
    this.yPrev[i] = s.y;
    this.zPrev[i] = s.z;
    this.fxPrev[i] = this.fx[i];
    this.fyPrev[i] = 0;
    this.fzPrev[i] = this.fz[i];
    this.uxPrev[i] = 0;
    this.uyPrev[i] = 1;
    this.uzPrev[i] = 0;
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
    for (let i = 0; i < PELLETS; i += 1) {
      this.pxPrev[i] = this.px[i];
      this.pyPrev[i] = this.py[i];
      this.pzPrev[i] = this.pz[i];
    }
    for (let i = 0; i < MISSILES; i += 1) {
      this.mxPrev[i] = this.mx[i];
      this.myPrev[i] = this.my[i];
      this.mzPrev[i] = this.mz[i];
    }
  }

  event(type, by, to, dmg, weapon, x, y, z, big = false) {
    if (this.eventCount >= EVENTS) {
      return null;
    }
    const e = this.events[this.eventCount];
    this.eventCount += 1;
    e.type = type;
    e.by = by;
    e.to = to;
    e.dmg = dmg;
    e.weapon = weapon;
    e.x = x;
    e.y = y;
    e.z = z;
    e.big = big;
    e.fromX = by >= 0 ? this.x[by] : x;
    e.fromY = by >= 0 ? this.y[by] : y;
    e.fromZ = by >= 0 ? this.z[by] : z;
    return e;
  }

  /* Live: in the fight, not popped. Hittable: live and not shielded. */
  live(i) {
    return this.inFight[i] === 1 && this.alive[i] === 1;
  }

  hittable(i) {
    return this.live(i) && this.clockMs >= this.shieldUntil[i];
  }

  /* Whether the round's clock is running and a shot may land. */
  get running() {
    return this.startedMs >= 0 && !this.over;
  }

  leftMs() {
    if (!this.roundMs) {
      return 0;
    }
    if (this.startedMs < 0) {
      return this.roundMs;
    }
    return Math.max(0, this.roundMs - (this.clockMs - this.startedMs));
  }

  sinceOverMs() {
    return this.over ? this.clockMs - this.overAtMs : 0;
  }

  /*
   * ONE FEED, DOGFIGHT_EVERY ms of the game's own clock.
   *
   * me: { x, y, z, fx, fy, fz, ux, uy, uz, gun, missile, flying }, this
   * page's pilot, world metres: where the craft is, where its camera looks
   * (f, the gun's line, camera angle included), its up, the gun held, a
   * missile pressed since the last feed, and whether it is in the air and
   * the run is live. teleported: the craft was put somewhere it did not fly
   * to since the last feed, so its velocity there is not a velocity.
   */
  step(me, teleported = false) {
    this.snapshot();
    this.clockMs += DOGFIGHT_EVERY;
    const now = this.clockMs;
    this.meFlying = Boolean(me.flying);
    this.feedMe(me, teleported);
    if (this.meFlying && this.startedMs < 0 && this.alive[ME]) {
      this.startedMs = now;
    }
    if (this.meFlying && this.shieldUntil[ME] === Infinity && this.alive[ME]) {
      this.shieldUntil[ME] = now + SHIELD_MS;
    }
    /* Back from a pop. */
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      if (this.inFight[i] && !this.alive[i] && now >= this.backAt[i]) {
        this.whole(i);
        this.alive[i] = 1;
        if (i === ME) {
          /* Shielded until the craft is flying again, then SHIELD_MS. */
          this.shieldUntil[i] = Infinity;
        } else {
          this.spawnBot(i, -1);
          this.shieldUntil[i] = now + SHIELD_MS;
        }
        this.event('back', i, i, 0, '', this.x[i], this.y[i], this.z[i]);
      }
    }
    /* Racks and heat. */
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      if (!this.inFight[i]) {
        continue;
      }
      if (this.rack[i] < MISSILE.rack && now >= this.reloadAt[i]) {
        this.rack[i] += 1;
        this.reloadAt[i] = this.rack[i] < MISSILE.rack ? now + MISSILE.reloadMs : 0;
      }
      if (!this.firing[i]) {
        this.heat[i] = Math.max(0, this.heat[i] - GUN.coolPerS * DT);
      }
      if (this.hot[i] && this.heat[i] <= GUN.resume) {
        this.hot[i] = 0;
      }
    }
    const armed = this.running;
    /* The pilot's guns, then the bots'. */
    this.firing[ME] = 0;
    if (armed && this.live(ME) && this.meFlying) {
      this.lockFor(ME, now);
      if (me.gun) {
        this.pull(ME, this.fx[ME], this.fy[ME], this.fz[ME], now);
      }
      if (me.missile) {
        this.launch(ME, now);
      }
    } else {
      this.lockOn[ME] = -1;
      this.lockMs[ME] = 0;
    }
    for (let i = 1; i < MAX_PILOTS; i += 1) {
      if (this.isBot[i] && this.alive[i]) {
        this.fly(i, now, armed);
      }
    }
    this.stepPellets(now, armed);
    this.stepMissiles(now, armed);
    /* The round's end. */
    if (armed) {
      let ended = this.roundMs > 0 && now - this.startedMs >= this.roundMs;
      if (this.popsToWin > 0) {
        for (let i = 0; i < MAX_PILOTS; i += 1) {
          if (this.inFight[i] && this.pops[i] >= this.popsToWin) {
            ended = true;
          }
        }
      }
      if (ended) {
        this.over = true;
        this.overAtMs = now;
        this.pAlive.fill(0);
        for (let i = 0; i < MISSILES; i += 1) {
          if (this.mAlive[i]) {
            this.boom(i, false);
          }
        }
        this.event('over', -1, -1, 0, '', 0, 0, 0);
      }
    }
  }

  feedMe(me, teleported) {
    const i = ME;
    const nx = me.x;
    const ny = me.y;
    const nz = me.z;
    if (this.havePrevMe && !teleported) {
      this.vx[i] = (nx - this.x[i]) / DT;
      this.vy[i] = (ny - this.y[i]) / DT;
      this.vz[i] = (nz - this.z[i]) / DT;
    } else {
      this.vx[i] = 0;
      this.vy[i] = 0;
      this.vz[i] = 0;
      this.xPrev[i] = nx;
      this.yPrev[i] = ny;
      this.zPrev[i] = nz;
    }
    this.havePrevMe = true;
    this.x[i] = nx;
    this.y[i] = ny;
    this.z[i] = nz;
    this.fx[i] = me.fx;
    this.fy[i] = me.fy;
    this.fz[i] = me.fz;
    this.ux[i] = me.ux;
    this.uy[i] = me.uy;
    this.uz[i] = me.uz;
  }

  /* Who is in pilot i's lock circle: the most centred live opponent in
   * range with nothing in between, held for LOCK_MS. */
  lockFor(i, now) {
    const k = this.k;
    const reach = MISSILE.lockRange * k;
    let best = -1;
    let bestDot = LOCK_COS;
    for (let j = 0; j < MAX_PILOTS; j += 1) {
      if (j === i || !this.hittable(j)) {
        continue;
      }
      const dx = this.x[j] - this.x[i];
      const dy = this.y[j] - this.y[i];
      const dz = this.z[j] - this.z[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-6 || d > reach) {
        continue;
      }
      const dot = (dx * this.fx[i] + dy * this.fy[i] + dz * this.fz[i]) / d;
      if (dot > bestDot) {
        bestDot = dot;
        best = j;
      }
    }
    if (best !== this.lockOn[i]) {
      this.lockOn[i] = best;
      this.lockMs[i] = 0;
      this.losAt[i] = 0;
    }
    if (best < 0) {
      return;
    }
    /* Nothing in between, asked five times a second. */
    if (now >= this.losAt[i]) {
      this.losAt[i] = now + 200;
      this.losOk[i] = this.clear(i, best) ? 1 : 0;
    }
    if (this.losOk[i]) {
      const was = this.lockMs[i];
      this.lockMs[i] += DOGFIGHT_EVERY;
      if (was < MISSILE.lockMs && this.lockMs[i] >= MISSILE.lockMs && i === ME) {
        this.event('lock', i, best, 0, 'missile', this.x[best], this.y[best], this.z[best]);
      }
    } else {
      this.lockMs[i] = 0;
    }
  }

  locked(i) {
    return this.lockOn[i] >= 0 && this.lockMs[i] >= MISSILE.lockMs;
  }

  clear(i, j) {
    const t = this.world.blocked(this.x[i], this.y[i], this.z[i], this.x[j], this.y[j], this.z[j]);
    return t < 0;
  }

  /*
   * One pull of the trigger for this feed: a pellet if the gun is ready
   * and cool, along (dx, dy, dz), from pilot i, inheriting its velocity.
   * The shot's wall is found once, now, along the gun's whole reach, so a
   * pellet in flight asks nothing of the world but the floor.
   */
  pull(i, dx, dy, dz, now) {
    this.firing[i] = 1;
    if (this.hot[i] || now < this.nextShotAt[i]) {
      return;
    }
    this.nextShotAt[i] = now + GUN.everyMs;
    this.heat[i] += 1 / GUN.heatShots;
    if (this.heat[i] >= 1) {
      this.heat[i] = 1;
      this.hot[i] = 1;
    }
    /* Firing ends a shield. */
    if (this.shieldUntil[i] > now) {
      this.shieldUntil[i] = now;
    }
    const k = this.k;
    let s = -1;
    for (let n = 0; n < PELLETS; n += 1) {
      const c = (this.pNext + n) % PELLETS;
      if (!this.pAlive[c]) {
        s = c;
        break;
      }
    }
    if (s < 0) {
      s = this.pNext;
    }
    this.pNext = (s + 1) % PELLETS;
    const ox = this.x[i] + dx * 0.3 * k;
    const oy = this.y[i] + dy * 0.3 * k;
    const oz = this.z[i] + dz * 0.3 * k;
    const sp = GUN.speed * k;
    this.pAlive[s] = 1;
    this.pOwner[s] = i;
    this.px[s] = ox;
    this.py[s] = oy;
    this.pz[s] = oz;
    this.pxPrev[s] = ox;
    this.pyPrev[s] = oy;
    this.pzPrev[s] = oz;
    this.pvx[s] = dx * sp + this.vx[i];
    this.pvy[s] = dy * sp + this.vy[i];
    this.pvz[s] = dz * sp + this.vz[i];
    this.pGone[s] = 0;
    const reach = GUN.range * k;
    const t = this.world.blocked(ox, oy, oz, ox + dx * reach, oy + dy * reach, oz + dz * reach);
    this.pWall[s] = t < 0 ? Infinity : t * reach;
    this.shots[i] += 1;
  }

  /* A missile from pilot i: homing on its lock, straight without one. */
  launch(i, now) {
    if (this.rack[i] <= 0 || now < this.missileAt[i]) {
      return false;
    }
    let s = -1;
    for (let n = 0; n < MISSILES; n += 1) {
      if (!this.mAlive[n]) {
        s = n;
        break;
      }
    }
    if (s < 0) {
      return false;
    }
    if (this.rack[i] === MISSILE.rack) {
      this.reloadAt[i] = now + MISSILE.reloadMs;
    }
    this.rack[i] -= 1;
    this.missileAt[i] = now + MISSILE.coolMs;
    if (this.shieldUntil[i] > now) {
      this.shieldUntil[i] = now;
    }
    const k = this.k;
    const tgt = this.locked(i) ? this.lockOn[i] : -1;
    this.mAlive[s] = 1;
    this.mOwner[s] = i;
    this.mTarget[s] = tgt;
    this.mSerial += 1;
    this.mId[s] = this.mSerial;
    /* Will the target try to dodge it: a bot's skill, asked once. */
    this.mDodge[s] = tgt > 0 && this.isBot[tgt] && this.rand() < SKILLS[this.rules.skill].dodge ? 1 : 0;
    this.mdx[s] = this.fx[i];
    this.mdy[s] = this.fy[i];
    this.mdz[s] = this.fz[i];
    this.mx[s] = this.x[i] + this.fx[i] * 0.4 * k;
    this.my[s] = this.y[i] + this.fy[i] * 0.4 * k - 0.05 * k;
    this.mz[s] = this.z[i] + this.fz[i] * 0.4 * k;
    this.mxPrev[s] = this.mx[s];
    this.myPrev[s] = this.my[s];
    this.mzPrev[s] = this.mz[s];
    this.mFromX[s] = this.mx[s];
    this.mFromY[s] = this.my[s];
    this.mFromZ[s] = this.mz[s];
    const own = this.vx[i] * this.fx[i] + this.vy[i] * this.fy[i] + this.vz[i] * this.fz[i];
    this.mSpeed[s] = Math.max(MISSILE.speed0 * k, own + MISSILE.speed0 * k * 0.5);
    this.mAge[s] = 0;
    this.shots[i] += 1;
    this.event('launch', i, tgt, 0, 'missile', this.mx[s], this.my[s], this.mz[s]);
    return true;
  }

  /*
   * DAMAGE. Every hit is its own number, so variable damage is something
   * a pilot sees: the gun's falls with range and is more from behind, the
   * missile's falls with how far from the blast the quad was.
   */
  damage(to, by, dmg, weapon, x, y, z) {
    if (!this.hittable(to) || dmg <= 0) {
      return;
    }
    const d = Math.max(1, Math.round(dmg));
    this.hp[to] -= d;
    this.hits[by] += 1;
    this.dealt[by] += d;
    this.event('hit', by, to, d, weapon, x, y, z, weapon === 'missile' || d >= 12);
    if (this.hp[to] > 0) {
      return;
    }
    this.hp[to] = 0;
    this.alive[to] = 0;
    this.lockOn[to] = -1;
    this.lockMs[to] = 0;
    this.firing[to] = 0;
    this.backAt[to] = this.clockMs + this.backMs;
    this.popped[to] += 1;
    this.streak[to] = 0;
    if (by !== to && by >= 0) {
      this.pops[by] += 1;
      this.streak[by] += 1;
      if (this.streak[by] > this.bestStreak[by]) {
        this.bestStreak[by] = this.streak[by];
      }
    }
    this.event('pop', by, to, d, weapon, this.x[to], this.y[to], this.z[to], true);
  }

  stepPellets(now, armed) {
    const k = this.k;
    const r2 = HIT_R * HIT_R * k * k;
    const drop = GUN.drop * k * DT;
    const reach = GUN.range * k;
    const w = this.world;
    for (let s = 0; s < PELLETS; s += 1) {
      if (!this.pAlive[s]) {
        continue;
      }
      const ax = this.px[s];
      const ay = this.py[s];
      const az = this.pz[s];
      this.pvy[s] -= drop;
      const dx = this.pvx[s] * DT;
      const dy = this.pvy[s] * DT;
      const dz = this.pvz[s] * DT;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let gone = this.pGone[s];
      /* The wall it was always going to meet. */
      let tEnd = 1;
      let wall = false;
      if (gone + len >= this.pWall[s]) {
        tEnd = len > 0 ? Math.max(0, (this.pWall[s] - gone) / len) : 0;
        wall = true;
      }
      /* A quad in the way first. */
      const owner = this.pOwner[s];
      let hit = -1;
      let hitT = tEnd;
      if (armed) {
        const dd = dx * dx + dy * dy + dz * dz;
        for (let j = 0; j < MAX_PILOTS; j += 1) {
          if (j === owner || !this.hittable(j)) {
            continue;
          }
          const ox = this.x[j] - ax;
          const oy = this.y[j] - ay;
          const oz = this.z[j] - az;
          let t = dd > 0 ? (ox * dx + oy * dy + oz * dz) / dd : 0;
          if (t < 0) t = 0;
          if (t > hitT) t = hitT;
          const cx = ox - dx * t;
          const cy = oy - dy * t;
          const cz = oz - dz * t;
          if (cx * cx + cy * cy + cz * cz <= r2) {
            hit = j;
            hitT = t;
          }
        }
      }
      const hx = ax + dx * hitT;
      const hy = ay + dy * hitT;
      const hz = az + dz * hitT;
      if (hit >= 0) {
        gone += len * hitT;
        let dmg = GUN.near + (GUN.far - GUN.near) * Math.min(1, gone / reach);
        /* From behind: the shot travels the way the target faces. */
        if (len > 0) {
          const along = (dx * this.fx[hit] + dy * this.fy[hit] + dz * this.fz[hit]) / len;
          if (along > 0.5) {
            dmg *= GUN.behind;
          }
        }
        this.pAlive[s] = 0;
        this.px[s] = hx;
        this.py[s] = hy;
        this.pz[s] = hz;
        this.damage(hit, owner, dmg, 'gun', hx, hy, hz);
        continue;
      }
      this.px[s] = hx;
      this.py[s] = hy;
      this.pz[s] = hz;
      this.pGone[s] = gone + len * tEnd;
      if (wall) {
        this.pAlive[s] = 0;
        this.event('spark', owner, -1, 0, 'gun', hx, hy, hz);
        continue;
      }
      if (this.pGone[s] >= reach) {
        this.pAlive[s] = 0;
        continue;
      }
      if (hy < w.floorAt(hx, ay, hz)) {
        this.pAlive[s] = 0;
        this.event('spark', owner, -1, 0, 'gun', hx, hy, hz);
      }
    }
  }

  stepMissiles(now, armed) {
    const k = this.k;
    const fuse2 = MISSILE.fuse * MISSILE.fuse * k * k;
    const w = this.world;
    for (let s = 0; s < MISSILES; s += 1) {
      if (!this.mAlive[s]) {
        continue;
      }
      this.mAge[s] += DOGFIGHT_EVERY;
      if (this.mAge[s] >= MISSILE.lifeMs) {
        this.boom(s, armed);
        continue;
      }
      this.mSpeed[s] = Math.min(MISSILE.speedMax * k, this.mSpeed[s] + MISSILE.accel * k * DT);
      const t = this.mTarget[s];
      if (t >= 0 && this.live(t)) {
        const tx = this.x[t] - this.mx[s];
        const ty = this.y[t] - this.my[s];
        const tz = this.z[t] - this.mz[s];
        const d = Math.sqrt(tx * tx + ty * ty + tz * tz);
        let go = d / this.mSpeed[s];
        if (go > 2) go = 2;
        const ax = tx + this.vx[t] * go;
        const ay = ty + this.vy[t] * go;
        const az = tz + this.vz[t] * go;
        turnToward(this, 'md', s, ax, ay, az, MISSILE.turn * DT);
      }
      const sp = this.mSpeed[s] * DT;
      const bx = this.mx[s] + this.mdx[s] * sp;
      const by = this.my[s] + this.mdy[s] * sp;
      const bz = this.mz[s] + this.mdz[s] * sp;
      /* A quad within the fuse. */
      let fused = false;
      if (armed) {
        for (let j = 0; j < MAX_PILOTS; j += 1) {
          if (j === this.mOwner[s] || !this.hittable(j)) {
            continue;
          }
          const ox = this.x[j] - bx;
          const oy = this.y[j] - by;
          const oz = this.z[j] - bz;
          if (ox * ox + oy * oy + oz * oz <= fuse2) {
            fused = true;
            break;
          }
        }
      }
      const hitT = w.blocked(this.mx[s], this.my[s], this.mz[s], bx, by, bz);
      if (hitT >= 0) {
        this.mx[s] += (bx - this.mx[s]) * hitT;
        this.my[s] += (by - this.my[s]) * hitT;
        this.mz[s] += (bz - this.mz[s]) * hitT;
        this.boom(s, armed);
        continue;
      }
      this.mx[s] = bx;
      this.my[s] = by;
      this.mz[s] = bz;
      if (fused || by < w.floorAt(bx, by + 1, bz)) {
        this.boom(s, armed);
      }
    }
  }

  /* A missile goes off where it is, and everybody near enough is hit by
   * how near they were. */
  boom(s, armed) {
    this.mAlive[s] = 0;
    const k = this.k;
    const x = this.mx[s];
    const y = this.my[s];
    const z = this.mz[s];
    const owner = this.mOwner[s];
    const tgt = this.mTarget[s];
    this.event('boom', owner, tgt, 0, 'missile', x, y, z, true);
    if (!armed) {
      return;
    }
    const blast = MISSILE.blast * k;
    let caught = false;
    for (let j = 0; j < MAX_PILOTS; j += 1) {
      if (j === owner || !this.hittable(j)) {
        continue;
      }
      const dx = this.x[j] - x;
      const dy = this.y[j] - y;
      const dz = this.z[j] - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > blast) {
        continue;
      }
      let dmg;
      if (d <= MISSILE.fuse * k) {
        dmg = MISSILE.direct;
      } else {
        const u = (d - MISSILE.fuse * k) / (blast - MISSILE.fuse * k);
        dmg = MISSILE.blastNear + (MISSILE.blastFar - MISSILE.blastNear) * u;
      }
      if (j === tgt) {
        caught = true;
      }
      const fx = x - this.mFromX[s];
      const fy = y - this.mFromY[s];
      const fz = z - this.mFromZ[s];
      const far = Math.sqrt(fx * fx + fy * fy + fz * fz) / k;
      if (far > this.longest[owner]) {
        this.longest[owner] = far;
      }
      this.damage(j, owner, dmg, 'missile', x, y, z);
    }
    if (tgt >= 0 && !caught && this.live(tgt)) {
      this.dodged[tgt] += 1;
      if (tgt === ME) {
        this.event('dodge', owner, tgt, 0, 'missile', x, y, z);
      }
    }
  }

  /* Is a missile coming for pilot i: its slot, or -1. */
  incoming(i) {
    let best = -1;
    let near = Infinity;
    for (let s = 0; s < MISSILES; s += 1) {
      if (!this.mAlive[s] || this.mTarget[s] !== i) {
        continue;
      }
      const dx = this.mx[s] - this.x[i];
      const dy = this.my[s] - this.y[i];
      const dz = this.mz[s] - this.z[i];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < near) {
        near = d;
        best = s;
      }
    }
    return best;
  }

  /*
   * A BOT, one feed: choose a target, choose a direction, turn toward it at
   * its skill's rate, keep off the floor and out of the walls, and shoot
   * when the target is square in front of it.
   */
  fly(i, now, armed) {
    const w = this.world;
    const k = this.k;
    const sk = SKILLS[this.rules.skill];
    const speed = w.cruise * sk.speed * k;
    /* Target: the nearest live opponent in front, the pilot a little
     * nearer than they are, re-asked every so often or when it pops. */
    let t = this.target[i];
    if (t >= 0 && !this.live(t)) {
      t = -1;
    }
    if (t < 0 || now >= this.retargetAt[i]) {
      let best = -1;
      let bestScore = Infinity;
      for (let j = 0; j < MAX_PILOTS; j += 1) {
        if (j === i || !this.live(j)) {
          continue;
        }
        if (j === ME && !this.meFlying) {
          continue;
        }
        const dx = this.x[j] - this.x[i];
        const dy = this.y[j] - this.y[i];
        const dz = this.z[j] - this.z[i];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const front = d > 1e-6 ? (dx * this.fx[i] + dy * this.fy[i] + dz * this.fz[i]) / d : 0;
        let score = d * (1.4 - 0.5 * front);
        if (j === ME) {
          score *= this.meBias;
        }
        if (score < bestScore) {
          bestScore = score;
          best = j;
        }
      }
      if (best !== this.target[i]) {
        /* A new target takes a moment to react to. */
        this.burstUntil[i] = 0;
        this.restUntil[i] = now + sk.react;
        this.lockMs[i] = 0;
      }
      t = best;
      this.target[i] = t;
      this.retargetAt[i] = now + 1500 + Math.floor(this.rand() * 1000);
    }
    /* Desired direction. */
    let dx = 0;
    let dy = 0;
    let dz = 0;
    let dist = Infinity;
    const inc = this.incoming(i);
    if (now < this.avoidUntil[i]) {
      dx = this.ax[i];
      dy = this.ay[i];
      dz = this.az[i];
    } else if (inc >= 0 && (now < this.breakUntil[i] || this.mDodge[inc])) {
      /* Break across the missile's line, and a little up. */
      if (now >= this.breakUntil[i]) {
        this.breakUntil[i] = now + 1200;
        this.breakSign[i] = this.rand() < 0.5 ? -1 : 1;
      }
      const mx = this.mdx[inc];
      const mz = this.mdz[inc];
      const side = this.breakSign[i];
      dx = -mz * side;
      dy = 0.35;
      dz = mx * side;
    } else if (t >= 0) {
      this.goal(i, t);
      const tx = this.gx - this.x[i];
      const ty = this.gy - this.y[i];
      const tz = this.gz - this.z[i];
      dist = Math.sqrt(tx * tx + ty * ty + tz * tz);
      const tof = dist / (GUN.speed * k);
      dx = tx + this.vx[t] * tof * sk.lead;
      dy = ty + this.vy[t] * tof * sk.lead;
      dz = tz + this.vz[t] * tof * sk.lead;
      /* Too close: overshoot and come round again rather than sit on it. */
      if (dist < this.closeIn * k) {
        /* Two on the same spot have no line between them: straight on. */
        const near = dist > 1e-6 ? 0.3 / dist : 0;
        dx = this.fx[i] + tx * near;
        dy = this.fy[i] + 0.3;
        dz = this.fz[i] + tz * near;
      }
    } else {
      if (now >= this.wanderAt[i]) {
        this.wanderAt[i] = now + 4000;
        const a = this.rand() * 2 - 1;
        const b = this.rand() * 2 - 1;
        this.wx[i] = w.cx + a * w.radius * 0.6;
        this.wz[i] = w.cz + b * w.radius * 0.6;
        this.wy[i] = w.cy + (2 + this.rand() * 6) * k;
      }
      dx = this.wx[i] - this.x[i];
      dy = this.wy[i] - this.y[i];
      dz = this.wz[i] - this.z[i];
    }
    let m = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (m < 1e-9) {
      dx = this.fx[i];
      dy = this.fy[i];
      dz = this.fz[i];
      m = 1;
    }
    dx /= m;
    dy /= m;
    dz /= m;
    /* Keep off the floor. */
    const floor = w.floorAt(this.x[i], this.y[i], this.z[i]);
    const above = this.y[i] - floor;
    const low = 2.5 * k;
    if (above < low) {
      dy += (low - above) / low * 1.5;
    }
    /* And within the arena. */
    const rx = this.x[i] - w.cx;
    const rz = this.z[i] - w.cz;
    const r2 = rx * rx + rz * rz;
    if (r2 > w.radius * w.radius) {
      const r = Math.sqrt(r2);
      dx -= rx / r * 0.8;
      dz -= rz / r * 0.8;
    }
    const top = w.cy + w.top;
    if (this.y[i] > top) {
      dy -= 0.8 + (this.y[i] - top) / k * 0.2;
    }
    /* Look ahead for walls, 20 times a second, staggered across the bots. */
    if (now >= this.lookAt[i]) {
      this.lookAt[i] = now + 50;
      this.lookAhead(i, speed, now);
    }
    turnToward(this, 'f', i, dx, dy, dz, sk.turn * DT);
    /* Fly it, and never through anything. */
    const ox = this.x[i];
    const oy = this.y[i];
    const oz = this.z[i];
    const nvx = this.fx[i] * speed;
    const nvy = this.fy[i] * speed;
    const nvz = this.fz[i] * speed;
    const bx = ox + nvx * DT;
    const by = oy + nvy * DT;
    const bz = oz + nvz * DT;
    const hit = w.blocked(ox, oy, oz, bx, by, bz);
    if (hit >= 0) {
      /* Bounce off and turn away. */
      this.avoidUntil[i] = now + 600;
      this.ax[i] = -this.fx[i];
      this.ay[i] = 0.6;
      this.az[i] = -this.fz[i];
      this.fx[i] = -this.fx[i];
      this.fz[i] = -this.fz[i];
      this.fy[i] = 0;
      normalise(this, 'f', i);
      this.vx[i] = 0;
      this.vy[i] = 0;
      this.vz[i] = 0;
    } else {
      /* Never under the floor, and never far over the arena's top. */
      const roof = top + 3 * k;
      const lift = by < floor + 0.3 * k ? floor + 0.3 * k : (by > roof ? roof : by);
      this.x[i] = bx;
      this.y[i] = lift;
      this.z[i] = bz;
      /* The bank: thrust is what it takes to make this turn and hold the
       * height, plus a nose down share for the speed, as a quad leans. */
      const axx = (nvx - this.vx[i]) / DT;
      const ayy = (nvy - this.vy[i]) / DT;
      const azz = (nvz - this.vz[i]) / DT;
      this.vx[i] = nvx;
      this.vy[i] = nvy;
      this.vz[i] = nvz;
      const lean = 0.35 * G * k;
      /* At most two g of it, so a bounce off a wall, which turns the
       * velocity round in one feed, does not lay the bot on its side, and
       * a hard turn banks it to about sixty degrees, where it still reads
       * as a quad and not as a line. */
      const am = Math.sqrt(axx * axx + ayy * ayy + azz * azz);
      const cap = 2 * G * k;
      const as = am > cap ? cap / am : 1;
      let ux = axx * as + this.fx[i] * lean;
      let uy = ayy * as + G * k;
      let uz = azz * as + this.fz[i] * lean;
      const um = Math.sqrt(ux * ux + uy * uy + uz * uz);
      if (um > 1e-9) {
        ux /= um;
        uy /= um;
        uz /= um;
        this.ux[i] = this.ux[i] * 0.8 + ux * 0.2;
        this.uy[i] = this.uy[i] * 0.8 + uy * 0.2;
        this.uz[i] = this.uz[i] * 0.8 + uz * 0.2;
        normalise(this, 'u', i);
      }
    }
    /* Shoot. */
    this.firing[i] = 0;
    if (!armed || t < 0 || !this.hittable(t)) {
      return;
    }
    const tx = this.x[t] - this.x[i];
    const ty = this.y[t] - this.y[i];
    const tz = this.z[t] - this.z[i];
    dist = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (dist < 1e-6) {
      return;
    }
    const front = (tx * this.fx[i] + ty * this.fy[i] + tz * this.fz[i]) / dist;
    if (now >= this.losAt[i]) {
      this.losAt[i] = now + 150;
      this.losOk[i] = this.clear(i, t) ? 1 : 0;
    }
    if (!this.losOk[i]) {
      this.lockMs[i] = 0;
      return;
    }
    /* Missiles: a lock held long enough, asked twice a second. */
    if (front > LOCK_COS && dist < MISSILE.lockRange * k) {
      this.lockOn[i] = t;
      this.lockMs[i] += DOGFIGHT_EVERY;
      if (this.lockMs[i] >= MISSILE.lockMs * sk.lockMul && now >= this.missileTry[i]) {
        this.missileTry[i] = now + 500;
        if (this.rand() < sk.missile) {
          this.lockMs[i] = MISSILE.lockMs;
          this.launch(i, now);
          this.lockMs[i] = 0;
        }
      }
    } else {
      this.lockMs[i] = 0;
    }
    /* The gun, in bursts. */
    if (front < sk.fireCos || dist > GUN.range * k * 0.8 || now < this.restUntil[i]) {
      return;
    }
    if (this.burstUntil[i] <= now) {
      if (this.burstUntil[i] > 0) {
        this.restUntil[i] = now + 400 + Math.floor(this.rand() * 600);
        this.burstUntil[i] = 0;
        return;
      }
      this.burstUntil[i] = now + 600 + Math.floor(this.rand() * 600);
    }
    if (this.heat[i] > 0.8) {
      return;
    }
    /* Aim at where the target will be, give or take the skill's error. */
    const tof = dist / (GUN.speed * k);
    let ax = tx + this.vx[t] * tof * sk.lead;
    let ay = ty + this.vy[t] * tof * sk.lead;
    let az = tz + this.vz[t] * tof * sk.lead;
    const am = Math.sqrt(ax * ax + ay * ay + az * az);
    ax /= am;
    ay /= am;
    az /= am;
    const e = sk.aim;
    ax += (this.rand() * 2 - 1) * e;
    ay += (this.rand() * 2 - 1) * e;
    az += (this.rand() * 2 - 1) * e;
    const em = Math.sqrt(ax * ax + ay * ay + az * az);
    this.pull(i, ax / em, ay / em, az / em, now);
  }

  /* Where a bot chasing pilot t flies to, into gx, gy, gz: the pilot
   * itself. Ribbon cutting (src/game/ribbons.js) aims at the ribbon. */
  goal(i, t) {
    this.gx = this.x[t];
    this.gy = this.y[t];
    this.gz = this.z[t];
  }

  /* Something ahead within a second: turn up, or to a side, whichever of
   * them is clear, and hold it for a moment. */
  lookAhead(i, speed, now) {
    const w = this.world;
    const k = this.k;
    const reach = speed * 0.9 + 2 * k;
    const x = this.x[i];
    const y = this.y[i];
    const z = this.z[i];
    const fx = this.fx[i];
    const fy = this.fy[i];
    const fz = this.fz[i];
    if (w.blocked(x, y, z, x + fx * reach, y + fy * reach, z + fz * reach) < 0) {
      return;
    }
    /* The side: across the heading, level. */
    let sx = -fz;
    let sz = fx;
    const sm = Math.sqrt(sx * sx + sz * sz);
    if (sm > 1e-6) {
      sx /= sm;
      sz /= sm;
    } else {
      sx = 1;
      sz = 0;
    }
    const first = this.rand() < 0.5 ? 1 : -1;
    /* Round it first, then over or under it: a bot that always went over
     * climbed out of a town on the first run and fought above the roofs,
     * out of anybody's sight. Under the arena's top it may go over; at the
     * top only down. */
    const high = y > w.cy + w.top * 0.8;
    const tries = [
      [fx * 0.3 + sx * first, 0, fz * 0.3 + sz * first],
      [fx * 0.3 - sx * first, 0, fz * 0.3 - sz * first],
      [fx * 0.4, high ? -0.8 : 1, fz * 0.4],
      [-fx, high ? -0.3 : 0.3, -fz],
    ];
    for (let n = 0; n < tries.length; n += 1) {
      const [a, b, c] = tries[n];
      const m = Math.sqrt(a * a + b * b + c * c);
      const ex = x + (a / m) * reach * 0.7;
      const ey = y + (b / m) * reach * 0.7;
      const ez = z + (c / m) * reach * 0.7;
      if (n === tries.length - 1 || w.blocked(x, y, z, ex, ey, ez) < 0) {
        this.ax[i] = a / m;
        this.ay[i] = b / m;
        this.az[i] = c / m;
        this.avoidUntil[i] = now + 400;
        return;
      }
    }
  }

  /* The table for the results page and the HUD's score: every pilot in the
   * fight, most pops first, fewest times popped breaking a tie. Allocates,
   * so it is asked when the round ends and when the score changes, never
   * per step. */
  standings() {
    const out = [];
    for (let i = 0; i < MAX_PILOTS; i += 1) {
      if (!this.inFight[i]) {
        continue;
      }
      out.push({
        slot: i,
        bot: Boolean(this.isBot[i]),
        pops: this.pops[i],
        popped: this.popped[i],
        hits: this.hits[i],
        shots: this.shots[i],
        dealt: this.dealt[i],
        bestStreak: this.bestStreak[i],
        dodged: this.dodged[i],
        longest: this.longest[i],
      });
    }
    out.sort((a, b) => (b.pops - a.pops) || (a.popped - b.popped) || (a.slot - b.slot));
    return out;
  }
}

/* Turn the unit vector stored as `${pre}x/y/z` at slot i toward (dx, dy,
 * dz) by at most `step` radians: add the perpendicular part of the wanted
 * direction, scaled to the step, and renormalise. tan(step) is step to
 * within a part in two thousand at the rates used here, and no sine is
 * needed. Past the target it snaps onto it. */
function turnToward(g, pre, i, dx, dy, dz, step) {
  const X = g[`${pre}x`];
  const Y = g[`${pre}y`];
  const Z = g[`${pre}z`];
  let m = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (m < 1e-12) {
    return;
  }
  dx /= m;
  dy /= m;
  dz /= m;
  const fx = X[i];
  const fy = Y[i];
  const fz = Z[i];
  const dot = fx * dx + fy * dy + fz * dz;
  if (dot >= 1 - step * step * 0.5) {
    X[i] = dx;
    Y[i] = dy;
    Z[i] = dz;
    return;
  }
  let px = dx - fx * dot;
  let py = dy - fy * dot;
  let pz = dz - fz * dot;
  m = Math.sqrt(px * px + py * py + pz * pz);
  if (m < 1e-9) {
    /* Straight behind: any perpendicular, the world's up first. */
    px = -fz;
    py = 0;
    pz = fx;
    m = Math.sqrt(px * px + pz * pz);
    if (m < 1e-9) {
      px = 1;
      pz = 0;
      m = 1;
    }
  }
  const s = step / m;
  let nx = fx + px * s;
  let ny = fy + py * s;
  let nz = fz + pz * s;
  const n = Math.sqrt(nx * nx + ny * ny + nz * nz);
  nx /= n;
  ny /= n;
  nz /= n;
  X[i] = nx;
  Y[i] = ny;
  Z[i] = nz;
}

function normalise(g, pre, i) {
  const X = g[`${pre}x`];
  const Y = g[`${pre}y`];
  const Z = g[`${pre}z`];
  const m = Math.sqrt(X[i] * X[i] + Y[i] * Y[i] + Z[i] * Z[i]);
  if (m > 1e-12) {
    X[i] /= m;
    Y[i] /= m;
    Z[i] /= m;
  } else {
    X[i] = 0;
    Y[i] = 1;
    Z[i] = 0;
  }
}
