/*
 * dogbrain.js: how a Dogfight bot flies and fights. The owner's ask of
 * 2026-10-29, on the first bots: "I want them to be really good, not just
 * deterministic predictable behaviour, I want them to be AAA game quality".
 *
 * A BOT FLIES A QUAD, NOT A CURSOR. Each feed its brain asks for an
 * acceleration; the body turns its thrust toward what that needs at the
 * skill's roll rate, pushes along it no harder than its motors can, and
 * drag and gravity do the rest. So a bot leans into a chase, overshoots a
 * turn it took too fast, cuts the throttle and flips to dive, and climbs
 * out on a punch, as a pilot's quad does. Its gun points where its camera
 * does, tilted up from the body as an FPV camera is, so to aim it has to
 * fly the nose onto the target and a hit is earned, not drawn.
 *
 * A BOT SEES, AND REMEMBERS. It knows where another pilot is only while it
 * can see them (a line of sight, inside its camera's view or near enough
 * to hear), when they fire, and when they hit it; otherwise it remembers
 * where they were and where they were going. What it knows lags what is,
 * by its skill's reaction time, so a juke the moment a bot opens fire
 * makes it miss, as it makes a person miss.
 *
 * A BOT HAS A MIND OF ITS OWN. Seven named personalities: a turn fighter,
 * a boom and zoom diver, a brawler, a sniper, a jinker, a hunter of the
 * leader and an ambusher, each nudged a little every fight. They choose
 * between patrolling, hunting a pilot they lost, attacking, defending,
 * evading a missile, extending away to come round again and hiding to
 * live, by weighing what they know, a few times a second, with a little
 * noise and a little stubbornness. Their aim wanders as a hand does,
 * settles while they track and is thrown by a turn. They pick on the
 * pilot, but only so many at once (the attack tokens a shooter gives its
 * enemies), they leave a pilot who was just popped alone for a moment, and
 * they ease off a pilot who is having a bad round and press one having a
 * good one.
 *
 * ALL OF IT REPLAYS. The random numbers are the game's own integer stream
 * and the only roots are square roots, so the same seed and the same
 * pilot give the same fight, bit for bit; a fight is unpredictable to
 * the person flying it because every fight's seed is new and because a
 * bot's next move depends on more than anybody can watch at once. No JS
 * trigonometry: the few fixed angles are their cosines, written out.
 *
 * NOTHING HERE TOUCHES THE PLANT: a bot is a point with a pose, drawn and
 * never uploaded.
 *
 * Everything is in the aircraft's own metres and goes through the world's
 * k on its way into the world, so a whoop in a house built bigger meets
 * bots flying as big.
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
  BotFlyer, G, CAM_S, CAM_C,
} from './botflyer.js';

/* What a bot is doing. */
export const PATROL = 0;
export const HUNT = 1;
export const ATTACK = 2;
export const DEFEND = 3;
export const EVADE = 4;
export const EXTEND = 5;
export const HIDE = 6;
export const MODE_NAMES = ['patrol', 'hunt', 'attack', 'defend', 'evade', 'extend', 'hide'];

/* How a bot likes to fight. */
const TURN = 0;
const BOOM = 1;
const BRAWL = 2;
const SNIPE = 3;
const JINK = 4;
const LEADER = 5;
const AMBUSH = 6;

/*
 * THE PERSONALITIES, one per slot, so MOCHI is always MOCHI. range: the
 * distance they like to shoot from, m. alt: how high they like to cruise
 * over the floor, m. aggression: how readily they attack rather than
 * defend. caution: how readily they defend and hide. jink: how hard and
 * often they throw their quad about when shot at. trigger: how loosely
 * they shoot, 0 waits for a sure hit, 1 sprays. aim: their aim against
 * the skill's, below 1 is better. showoff: the chance of a roll after a
 * pop. focus: how much they finish off a hurt pilot.
 */
const PERSONAS = [
  null,
  /* MOCHI: a patient turn fighter, sits on a tail. */
  {
    style: TURN, range: 22, alt: 5, aggression: 0.65, caution: 0.45, jink: 0.45, trigger: 0.35, aim: 0.95, showoff: 0.35, focus: 0.6,
  },
  /* GIZMO: boom and zoom, dives from height and climbs away. */
  {
    style: BOOM, range: 35, alt: 12, aggression: 0.6, caution: 0.55, jink: 0.5, trigger: 0.45, aim: 1.0, showoff: 0.5, focus: 0.4,
  },
  /* PIP: a brawler, low and close and loud. */
  {
    style: BRAWL, range: 12, alt: 3, aggression: 0.9, caution: 0.2, jink: 0.35, trigger: 0.8, aim: 1.15, showoff: 0.6, focus: 0.5,
  },
  /* TOFU: a careful sniper, long shots and missiles. */
  {
    style: SNIPE, range: 60, alt: 9, aggression: 0.45, caution: 0.75, jink: 0.55, trigger: 0.2, aim: 0.85, showoff: 0.15, focus: 0.8,
  },
  /* ZIPPY: never flies straight. */
  {
    style: JINK, range: 25, alt: 6, aggression: 0.7, caution: 0.5, jink: 0.95, trigger: 0.55, aim: 1.05, showoff: 0.8, focus: 0.3,
  },
  /* BOLT: hunts whoever is winning. */
  {
    style: LEADER, range: 28, alt: 7, aggression: 0.8, caution: 0.35, jink: 0.5, trigger: 0.45, aim: 0.9, showoff: 0.4, focus: 0.7,
  },
  /* NORI: waits low by a wall and pounces. */
  {
    style: AMBUSH, range: 20, alt: 2.2, aggression: 0.55, caution: 0.65, jink: 0.6, trigger: 0.4, aim: 0.9, showoff: 0.2, focus: 0.9,
  },
];

/* How far a bot's gun line may sit off its camera's, rad: what a pilot's
 * thumb does inside the crosshair, never more. */
const GIMBAL = 0.05;
/* How near another pilot can be heard however it is facing, m. */
const HEAR = 14;
/* How far a gun can be heard, m. */
const GUN_HEARD = 150;
/* How far a bot can pick a quad out at all, m. */
const SIGHT = 170;
/* How long a pilot out of sight is remembered, ms. */
const MEMORY_MS = 5000;
/* How long a pilot just back from a pop is left alone, ms. */
const GRACE_MS = 2500;


export class BotBrain extends BotFlyer {
  /*
   * game: the Dogfight. rules: { GUN, MISSILE, SKILLS, HIT_R, DT, EVERY,
   * MAX, MISSILES }, the game's constants, handed in rather than imported
   * so this file and the game's do not import each other.
   */
  constructor(game, rules) {
    super(game, rules);
    this.c = rules;
    const n = rules.MAX;
    this.n = n;
    const f = () => new Float64Array(n);
    this.mode = new Int8Array(n);
    this.modeAt = f();
    this.thinkAt = f();
    /* The aim's wander, a vector across the line of fire, rad. */
    this.ex = f(); this.ey = f(); this.ez = f();
    this.trackMs = f();
    this.trackOn = new Int8Array(n);
    /* Jinks: an acceleration thrown in for a moment when shot at. */
    this.jx = f(); this.jy = f(); this.jz = f();
    this.jinkAt = f();
    /* Who is on my tail, and since when. */
    this.threatBy = new Int8Array(n).fill(-1);
    this.threatAt = f();
    this.hitAt = f();
    this.side = f();
    /* Firing. */
    this.burst = new Uint8Array(n);
    this.burstAt = f();
    this.offAt = f();
    this.missileAt = f();
    /* A missile: noticed when, and when to break. */
    this.evadeId = new Int32Array(n);
    this.breakAt = f();
    this.noticeMs = f();
    /* A roll after a pop, and a dive after a boom pass. */
    this.passAt = f();
    /* What each bot knows of each pilot, n by n. */
    const nn = () => new Float64Array(n * n);
    this.kx = nn(); this.ky = nn(); this.kz = nn();
    this.kvx = nn(); this.kvy = nn(); this.kvz = nn();
    this.seenAt = nn();
    this.firedAt = f();
    this.losOk = new Uint8Array(n * n);
    this.losAt = nn();
    this.known = new Uint8Array(n * n);
    /* The personality each bot flies with this fight. */
    this.p = [];
    for (let i = 0; i < n; i += 1) {
      this.p.push({ ...(PERSONAS[i] || PERSONAS[1]) });
    }
    /* How the round is going for the pilot: up for pops, down for being
     * popped, forgetting over about 45 s. */
    this.mePerf = 0;
    this.meBackAt = -Infinity;
  }

  /* Once a feed, before any bot flies: the pilot's round forgets. */
  tick() {
    this.mePerf *= 1 - this.c.DT / 45;
  }

  /* A fresh round: new nudges to every personality, the open air read
   * again for places to fly to. */
  reset() {
    const g = this.g;
    const rand = g.rand;
    for (let i = 1; i < this.n; i += 1) {
      const base = PERSONAS[i] || PERSONAS[1];
      const p = this.p[i];
      const nudge = (v, by) => v * (1 + (rand() * 2 - 1) * by);
      p.style = base.style;
      p.range = nudge(base.range, 0.2);
      p.alt = nudge(base.alt, 0.25);
      p.aggression = Math.min(1, nudge(base.aggression, 0.15));
      p.caution = Math.min(1, nudge(base.caution, 0.15));
      p.jink = Math.min(1, nudge(base.jink, 0.2));
      p.trigger = Math.min(1, nudge(base.trigger, 0.2));
      p.aim = nudge(base.aim, 0.1);
      p.showoff = base.showoff;
      p.focus = base.focus;
    }
    this.mePerf = 0;
    this.meBackAt = -Infinity;
    this.known.fill(0);
    this.losOk.fill(0);
    this.losAt.fill(0);
    this.seenAt.fill(-Infinity);
    this.firedAt.fill(-Infinity);
    super.reset();
  }





  /* A bot back at a spawn: no memory of where it was, nothing on its
   * tail. */
  spawned(i) {
    const g = this.g;
    this.placed(i);
    this.mode[i] = PATROL;
    this.modeAt[i] = g.clockMs;
    this.thinkAt[i] = g.clockMs + 200 + Math.floor(g.rand() * 400);
    this.ex[i] = 0; this.ey[i] = 0; this.ez[i] = 0;
    this.jx[i] = 0; this.jy[i] = 0; this.jz[i] = 0;
    this.trackMs[i] = 0;
    this.trackOn[i] = -1;
    this.threatBy[i] = -1;
    this.threatAt[i] = -Infinity;
    this.hitAt[i] = -Infinity;
    this.side[i] = g.rand() < 0.5 ? -1 : 1;
    this.burst[i] = 0;
    this.missileAt[i] = g.clockMs + 1500;
    this.evadeId[i] = 0;
    this.passAt[i] = 0;
    const n = this.n;
    for (let j = 0; j < n; j += 1) {
      this.known[i * n + j] = 0;
    }
  }

  /* The game tells the brains what happened. */
  onFire(i) {
    this.firedAt[i] = this.g.clockMs;
  }

  onHit(to, by) {
    if (to < 0 || by < 0 || to === by) {
      return;
    }
    const g = this.g;
    this.hitAt[to] = g.clockMs;
    this.threatBy[to] = by;
    this.threatAt[to] = g.clockMs;
    /* Being hit tells a pilot exactly where the shooter is. */
    this.see(to, by, 1);
  }

  onPop(to, by) {
    const g = this.g;
    if (to === 0) {
      this.mePerf -= 1;
    }
    if (by === 0 && to !== 0) {
      this.mePerf += 1;
    }
    if (by > 0 && g.isBot[by] && g.rand() < this.p[by].showoff) {
      this.rollUntil[by] = g.clockMs + 450;
      this.rollSign[by] = g.rand() < 0.5 ? -1 : 1;
    }
  }

  onBack(i) {
    if (i === 0) {
      this.meBackAt = this.g.clockMs;
    }
  }

  /* Bot i sees pilot j: what it knows of j moves toward what is, by
   * `alpha`, 1 for at once. */
  see(i, j, alpha) {
    const g = this.g;
    const n = this.n;
    const q = i * n + j;
    if (!this.known[q] || alpha >= 1) {
      this.kx[q] = g.x[j]; this.ky[q] = g.y[j]; this.kz[q] = g.z[j];
      this.kvx[q] = g.vx[j]; this.kvy[q] = g.vy[j]; this.kvz[q] = g.vz[j];
    } else {
      /* Where it was going says where it is now; what is seen corrects
       * that, the place at twice the rate of the motion, as an eye sees
       * where something is before it sees which way it turned. */
      const DT = this.c.DT;
      this.kx[q] += this.kvx[q] * DT;
      this.ky[q] += this.kvy[q] * DT;
      this.kz[q] += this.kvz[q] * DT;
      const pa = Math.min(1, alpha * 2);
      this.kx[q] += (g.x[j] - this.kx[q]) * pa;
      this.ky[q] += (g.y[j] - this.ky[q]) * pa;
      this.kz[q] += (g.z[j] - this.kz[q]) * pa;
      this.kvx[q] += (g.vx[j] - this.kvx[q]) * alpha;
      this.kvy[q] += (g.vy[j] - this.kvy[q]) * alpha;
      this.kvz[q] += (g.vz[j] - this.kvz[q]) * alpha;
    }
    this.known[q] = 1;
    this.seenAt[q] = g.clockMs;
  }

  /* What bot i can see this feed. One line of sight a feed, round the
   * others in turn, so a bot's sight costs one walk of the grid a feed. */
  perceive(i, now, sk) {
    const g = this.g;
    const n = this.n;
    const k = g.world.k;
    const DT = this.c.DT;
    const alpha = Math.min(1, (DT * 1000) / sk.react);
    /* Whose line to ask about this feed: the next one after the last that
     * it could see if the line were clear, near enough and in its view or
     * its hearing. Its target and whoever is on its tail are asked often,
     * the rest now and then; a pilot it could not see anyway is never
     * asked, which is most of the saving. */
    let ask = -1;
    const tick = Math.floor(now / this.c.EVERY);
    /* Every other feed, half the bots on each. */
    const from = (tick + i) % 2 === 0 ? (tick >> 1) % n : n;
    const far = SIGHT * k;
    for (let s = 0; from < n && s < n; s += 1) {
      const j = (from + s) % n;
      const q = i * n + j;
      if (j === i || !g.live(j) || now < this.losAt[q]) {
        continue;
      }
      const dx = g.x[j] - g.x[i];
      const dy = g.y[j] - g.y[i];
      const dz = g.z[j] - g.z[i];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > far * far) {
        this.losOk[q] = 0;
        this.losAt[q] = now + 200;
        continue;
      }
      if (d2 > HEAR * HEAR * k * k) {
        const d = Math.sqrt(d2);
        if ((dx * g.fx[i] + dy * g.fy[i] + dz * g.fz[i]) / d <= sk.fov) {
          this.losOk[q] = 0;
          this.losAt[q] = now + 100;
          continue;
        }
      }
      ask = j;
      break;
    }
    if (ask >= 0) {
      const q = i * n + ask;
      const often = ask === g.target[i] || ask === this.threatBy[i];
      this.losAt[q] = now + (often ? 80 : 200);
      this.losOk[q] = g.world.blocked(g.x[i], g.y[i], g.z[i], g.x[ask], g.y[ask], g.z[ask]) < 0 ? 1 : 0;
    }
    for (let j = 0; j < n; j += 1) {
      if (j === i) {
        continue;
      }
      const q = i * n + j;
      if (!g.live(j) || (j === 0 && !g.meFlying)) {
        this.known[q] = 0;
        continue;
      }
      const dx = g.x[j] - g.x[i];
      const dy = g.y[j] - g.y[i];
      const dz = g.z[j] - g.z[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let sees = false;
      if (this.losOk[q]) {
        if (d < HEAR * k) {
          sees = true;
        } else {
          const front = d > 1e-9 ? (dx * g.fx[i] + dy * g.fy[i] + dz * g.fz[i]) / d : 1;
          sees = front > sk.fov;
        }
      }
      /* A gun is heard however the hearer is facing, and roughly. */
      if (!sees && now - this.firedAt[j] < 200 && d < GUN_HEARD * k) {
        sees = true;
      }
      if (sees) {
        this.see(i, j, alpha);
      } else if (this.known[q]) {
        /* Out of sight: where it was going, slowing, then forgotten. */
        this.kx[q] += this.kvx[q] * DT;
        this.ky[q] += this.kvy[q] * DT;
        this.kz[q] += this.kvz[q] * DT;
        this.kvx[q] *= 0.99;
        this.kvy[q] *= 0.99;
        this.kvz[q] *= 0.99;
        if (now - this.seenAt[q] > MEMORY_MS) {
          this.known[q] = 0;
        }
      }
    }
  }

  /* A missile coming for bot i: noticed after the skill's moment, or, for
   * some, never; when noticed, evade at once. */
  warn(i, now, sk) {
    const g = this.g;
    const inc = g.incoming(i);
    if (inc < 0) {
      return;
    }
    if (this.evadeId[i] !== g.mId[inc]) {
      this.evadeId[i] = g.mId[inc];
      this.noticeMs[i] = now + sk.notice * (0.6 + g.rand() * 0.8);
      if (g.rand() > sk.dodge) {
        this.noticeMs[i] = Infinity;
      }
      this.breakAt[i] = sk.breakTti * (0.75 + g.rand() * 0.5);
      this.side[i] = g.rand() < 0.5 ? -1 : 1;
    }
    if (now >= this.noticeMs[i] && this.mode[i] !== EVADE) {
      this.set(i, EVADE, now);
    }
  }

  /* Is bot i seeing pilot j right now, rather than remembering it. */
  sees(i, j, now) {
    return this.known[i * this.n + j] === 1 && now - this.seenAt[i * this.n + j] < 120;
  }

  /*
   * ONE FEED OF BOT i.
   */
  fly(i, now, armed) {
    const g = this.g;
    const c = this.c;
    const w = g.world;
    const sk = c.SKILLS[g.rules.skill];
    const p = this.p[i];
    const vmax = w.cruise * sk.speed * 1.45 * w.k;
    this.perceive(i, now, sk);
    /* A missile is felt every feed, not when it next thinks: the warning
     * tone in its goggles, after its skill's moment. */
    this.warn(i, now, sk);
    if (now >= this.thinkAt[i]) {
      this.think(i, now, sk, armed);
      this.thinkAt[i] = now + sk.think + Math.floor(g.rand() * sk.think);
    }
    const vx = g.vx[i];
    const vy = g.vy[i];
    const vz = g.vz[i];
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    /* WHERE IT WANTS TO GO: a velocity, from what it is doing. */
    const want = this.want;
    want.vx = 0; want.vy = 0; want.vz = 0;
    want.aim = false; want.ax = 0; want.ay = 0; want.az = 0;
    want.face = false; want.fx = 0; want.fy = 0; want.fz = 0;
    want.wander = 0.15;
    this.steer(i, now, sk, p, vmax, want);
    this.pilot(i, now, sk, p.alt, vmax, want, speed);
    /* Jinks wear off. */
    this.jx[i] *= 0.9;
    this.jy[i] *= 0.9;
    this.jz[i] *= 0.9;
    this.shoot(i, now, sk, p, armed, want);
  }

  /* A jink is asked for as the velocity it would make, so the walls are
   * minded for it like for anything else. */
  push(i, want, sk) {
    const jg = 1 / sk.agility;
    want.vx += this.jx[i] * jg;
    want.vy += this.jy[i] * jg;
    want.vz += this.jz[i] * jg;
  }


  /*
   * THINKING, a few times a second: what to do, at whom.
   */
  think(i, now, sk, armed) {
    const g = this.g;
    const n = this.n;
    const k = g.world.k;
    const p = this.p[i];
    const was = this.mode[i];
    /* Evading a missile it has noticed: nothing else matters. */
    const inc = g.incoming(i);
    if (inc >= 0 && this.evadeId[i] === g.mId[inc] && now >= this.noticeMs[i]) {
      this.set(i, EVADE, now);
      return;
    }
    /* On my tail: somebody with me in their gun's line, near enough,
     * firing or about to, or who just hit me. */
    let threat = -1;
    let threatScore = 0;
    for (let j = 0; j < n; j += 1) {
      if (j === i || !this.known[i * n + j]) {
        continue;
      }
      const q = i * n + j;
      const dx = g.x[i] - this.kx[q];
      const dy = g.y[i] - this.ky[q];
      const dz = g.z[i] - this.kz[q];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > this.c.GUN.range * k || d < 1e-6) {
        continue;
      }
      /* Where j's camera points is seen only when j is. */
      const look = this.sees(i, j, now) ? (dx * g.fx[j] + dy * g.fy[j] + dz * g.fz[j]) / d : 0;
      let s = 0;
      if (look > 0.93) {
        s = (look - 0.93) * 14 * (1 - d / (this.c.GUN.range * k));
        /* Only looked at: worth a glance. Shot at: worth a break. */
        s *= now - this.firedAt[j] < 500 ? 1.8 : 0.35;
      }
      if (this.threatBy[i] === j && now - this.hitAt[i] < 1500) {
        s += 0.6;
      }
      if (s > threatScore) {
        threatScore = s;
        threat = j;
      }
    }
    if (threat >= 0) {
      this.threatBy[i] = threat;
      this.threatAt[i] = now;
    }
    const hpFrac = g.hp[i] / g.hpMax;
    /* Hurt and hunted: get out of sight. */
    if (threat >= 0 && hpFrac < 0.25 + p.caution * 0.25 && threatScore > 0.4 && g.rand() < p.caution + 0.2) {
      if (was === HIDE || this.findCover(i, threat)) {
        this.set(i, HIDE, now);
        return;
      }
    }
    if (was === HIDE && now - this.modeAt[i] < 3500) {
      return;
    }
    /* Pick a fight. */
    const t = this.pickTarget(i, now, sk, p);
    const prev = g.target[i];
    if (t !== prev) {
      this.trackMs[i] = 0;
    }
    g.target[i] = t;
    /* Defend, or turn it round: a bold pilot whose own shot is good stays
     * on it and trades. */
    if (threat >= 0) {
      let stay = false;
      if (t >= 0 && was === ATTACK) {
        const q = i * n + t;
        const dx = this.kx[q] - g.x[i];
        const dy = this.ky[q] - g.y[i];
        const dz = this.kz[q] - g.z[i];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const front = d > 1e-6 ? (dx * g.fx[i] + dy * g.fy[i] + dz * g.fz[i]) / d : 0;
        stay = front > 0.95 && d < this.c.GUN.range * k * 0.6 && g.rand() < p.aggression * 0.8;
      }
      /* A long defence wears thin: after a couple of seconds of it a bot
       * wants a real reason to keep running, and a bold one turns on
       * whoever is chasing it. */
      let bar = 0.55 - p.caution * 0.3;
      if (was === DEFEND && now - this.modeAt[i] > 2200) {
        bar += 0.6;
        if (g.rand() < p.aggression * 0.6 && this.sees(i, threat, now)) {
          g.target[i] = threat;
          this.set(i, ATTACK, now);
          return;
        }
      }
      if (!stay && threatScore > bar) {
        if (was !== DEFEND) {
          this.side[i] = g.rand() < 0.5 ? -1 : 1;
        }
        this.set(i, DEFEND, now);
        return;
      }
    }
    if (was === EXTEND && now - this.modeAt[i] < 1800) {
      return;
    }
    if (t >= 0) {
      if (this.sees(i, t, now) || now - this.seenAt[i * n + t] < 600) {
        this.set(i, ATTACK, now);
      } else {
        this.set(i, HUNT, now);
      }
      return;
    }
    this.set(i, PATROL, now);
  }

  set(i, mode, now) {
    if (this.mode[i] !== mode) {
      this.mode[i] = mode;
      this.modeAt[i] = now;
      this.goalAt[i] = 0;
    }
  }

  /* Whom to fight: the best of the pilots it knows of, by how near, how
   * much in front, how hurt, who hit it last, the leader for BOLT, with
   * a little noise and a little loyalty to the one it has. The pilot gets
   * no more attackers than the skill's tokens, and a moment's grace after
   * coming back. */
  pickTarget(i, now, sk, p) {
    const g = this.g;
    const n = this.n;
    const k = g.world.k;
    let tokens = sk.tokens;
    if (this.mePerf > 2) tokens += 1;
    if (this.mePerf < -2) tokens -= 1;
    if (tokens < 1) tokens = 1;
    let onMe = 0;
    for (let j = 1; j < n; j += 1) {
      if (j !== i && g.isBot[j] && g.alive[j] && g.target[j] === 0 && this.mode[j] === ATTACK) {
        onMe += 1;
      }
    }
    let leader = -1;
    let most = 0;
    for (let j = 0; j < n; j += 1) {
      if (g.inFight[j] && g.pops[j] > most) {
        most = g.pops[j];
        leader = j;
      }
    }
    let best = -1;
    let bestScore = 0;
    for (let j = 0; j < n; j += 1) {
      const q = i * n + j;
      if (j === i || !this.known[q] || !g.live(j)) {
        continue;
      }
      const dx = this.kx[q] - g.x[i];
      const dy = this.ky[q] - g.y[i];
      const dz = this.kz[q] - g.z[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const front = d > 1e-6 ? (dx * g.fx[i] + dy * g.fy[i] + dz * g.fz[i]) / d : 0;
      let s = 100 / (d / k + 15);
      s *= 1 + 0.5 * front;
      s *= 1 + (1 - g.hp[j] / g.hpMax) * p.focus;
      if (this.threatBy[i] === j && now - this.threatAt[i] < 3000) {
        s *= 1.6;
      }
      if (j === g.target[i]) {
        s *= 1.35;
      }
      if (p.style === LEADER && j === leader) {
        s *= 1.8;
      }
      if (j === 0) {
        s *= 1.3;
        if (now - this.meBackAt < GRACE_MS) {
          s *= 0.1;
        }
        if (g.target[i] !== 0 && onMe >= tokens) {
          s *= 0.2;
        }
      }
      s *= 0.85 + g.rand() * 0.3;
      if (s > bestScore) {
        bestScore = s;
        best = j;
      }
    }
    return best;
  }

  /* A place out of `from`'s sight that bot i can fly straight to. */
  findCover(i, from) {
    const g = this.g;
    const w = g.world;
    const k = w.k;
    const q = i * this.n + from;
    const nav = this.nav;
    let best = -1;
    let bestD = Infinity;
    let asked = 0;
    for (let s = 0; s < nav.length && asked < 10; s += 1) {
      const a = nav[(s + i * 5) % nav.length];
      const dx = a.x - g.x[i];
      const dy = a.y - g.y[i];
      const dz = a.z - g.z[i];
      const d = dx * dx + dy * dy + dz * dz;
      if (d > 50 * 50 * k * k || d < 4 * k * k || d >= bestD) {
        continue;
      }
      asked += 1;
      if (w.blocked(this.kx[q], this.ky[q], this.kz[q], a.x, a.y, a.z) < 0) {
        continue;
      }
      if (w.blocked(g.x[i], g.y[i], g.z[i], a.x, a.y, a.z) >= 0) {
        continue;
      }
      best = (s + i * 5) % nav.length;
      bestD = d;
    }
    if (best < 0) {
      return false;
    }
    this.goalX[i] = nav[best].x;
    this.goalY[i] = nav[best].y;
    this.goalZ[i] = nav[best].z;
    this.goalAt[i] = Infinity;
    return true;
  }

  /*
   * THE WAY IT WANTS TO GO, by what it is doing: a velocity in `want`,
   * and whether its camera must be on a line (want.aim) or only looking
   * along one (want.face).
   */
  steer(i, now, sk, p, vmax, want) {
    const g = this.g;
    const w = g.world;
    const k = w.k;
    const n = this.n;
    const c = this.c;
    const mode = this.mode[i];
    const x = g.x[i];
    const y = g.y[i];
    const z = g.z[i];
    const floor = w.floorAt(x, y, z);
    if (mode === EVADE) {
      this.steerEvade(i, now, sk, p, vmax, want);
      return;
    }
    if (mode === DEFEND) {
      this.steerDefend(i, now, sk, p, vmax, want);
      return;
    }
    if (mode === HIDE) {
      this.toward(i, this.goalX[i], this.goalY[i], this.goalZ[i], vmax * 0.85, want);
      want.wander = 0.05;
      return;
    }
    const t = g.target[i];
    if ((mode === ATTACK || mode === EXTEND) && t >= 0 && this.known[i * n + t]) {
      this.steerAttack(i, now, sk, p, vmax, want, t);
      return;
    }
    if (mode === HUNT && t >= 0 && this.known[i * n + t]) {
      /* To where it was last seen, a little above, looking for it. */
      const q = i * n + t;
      const to = this.to;
      this.route(i, this.kx[q], this.ky[q] + 1.5 * k, this.kz[q], now, to);
      this.toward(i, to.x, to.y, to.z, vmax * 0.8, want);
      want.wander = 0.2;
      return;
    }
    /* Patrol: from one open place to another, at the height it likes. An
     * ambusher waits low and slow. */
    const ambush = p.style === AMBUSH;
    if (now >= this.goalAt[i] || this.near(i, this.goalX[i], this.goalY[i], this.goalZ[i], 5 * k)) {
      this.pickGoal(i, ambush);
      this.goalAt[i] = now + (ambush ? 6000 : 4000) + Math.floor(g.rand() * 4000);
    }
    const to = this.to;
    this.route(i, this.goalX[i], this.goalY[i], this.goalZ[i], now, to);
    let gy = to.y;
    if (!ambush) {
      gy = Math.max(gy, Math.min(floor + p.alt * k, w.cy + w.top - 1 * k));
    } else if (this.routeTo[i] < 0) {
      /* In sight of where it is going: down to its own height, low. */
      gy = Math.min(gy, floor + p.alt * k + 1 * k);
    }
    this.toward(i, to.x, gy, to.z, vmax * (ambush ? 0.3 : 0.6), want);
    want.wander = 0.35;
  }

  /* An open place to patrol to: a little way off, not too far. */
  pickGoal(i, low) {
    const g = this.g;
    const w = g.world;
    const k = w.k;
    const nav = this.nav;
    if (!nav.length) {
      this.goalX[i] = w.cx + (g.rand() * 2 - 1) * w.radius * 0.5;
      this.goalZ[i] = w.cz + (g.rand() * 2 - 1) * w.radius * 0.5;
      this.goalY[i] = w.cy + (2 + g.rand() * 6) * k;
      return;
    }
    let best = 0;
    let bestS = -Infinity;
    for (let s = 0; s < 6; s += 1) {
      const a = nav[Math.floor(g.rand() * nav.length)];
      const dx = a.x - g.x[i];
      const dz = a.z - g.z[i];
      const d = Math.sqrt(dx * dx + dz * dz) / k;
      let score = -Math.abs(d - 45) + g.rand() * 20;
      if (low && a.low) score += 25;
      if (score > bestS) {
        bestS = score;
        best = a;
      }
    }
    this.goalX[i] = best.x;
    this.goalY[i] = best.y;
    this.goalZ[i] = best.z;
  }



  /*
   * ATTACKING t. Get behind it at the range this bot likes, lead it, put
   * the camera on it and shoot. The boom and zoom bot climbs over and dives
   * through; anybody who overshoots pulls up rather than flies past; the
   * sniper keeps its distance.
   */
  steerAttack(i, now, sk, p, vmax, want, t) {
    const g = this.g;
    const w = g.world;
    const k = w.k;
    const c = this.c;
    const q = i * this.n + t;
    const x = g.x[i];
    const y = g.y[i];
    const z = g.z[i];
    const tx = this.kx[q];
    const ty = this.ky[q];
    const tz = this.kz[q];
    const tvx = this.kvx[q];
    const tvy = this.kvy[q];
    const tvz = this.kvz[q];
    const rx = tx - x;
    const ry = ty - y;
    const rz = tz - z;
    const d = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (d < 1e-6) {
      return;
    }
    const tspeed = Math.sqrt(tvx * tvx + tvy * tvy + tvz * tvz);
    const range = p.range * k;
    const gunR = c.GUN.range * k;
    /* The lead: where a pellet meets it, from how the two of us move. */
    const tof = d / (c.GUN.speed * k);
    const lead = sk.lead;
    const lx = rx + (tvx - g.vx[i]) * tof * lead;
    const ly = ry + (tvy - g.vy[i]) * tof * lead;
    const lz = rz + (tvz - g.vz[i]) * tof * lead;
    const lm = Math.sqrt(lx * lx + ly * ly + lz * lz);
    /* Closing speed. */
    const close = -((tvx - g.vx[i]) * rx + (tvy - g.vy[i]) * ry + (tvz - g.vz[i]) * rz) / d;
    /* After a pass: run out, then come round. */
    if (this.mode[i] === EXTEND) {
      const back = d > 1e-6 ? -1 / d : 0;
      want.vx = rx * back * vmax;
      want.vy = (p.style === BOOM ? 0.5 : 0.15) * vmax;
      want.vz = rz * back * vmax;
      want.wander = 0.25;
      return;
    }
    /* Where to be: behind it at my range, or for the boom and zoom bot,
     * above it first. */
    let fx = tvx;
    let fy = tvy;
    let fz = tvz;
    let fm = tspeed;
    if (fm < 2 * k) {
      fx = g.fx[t]; fy = g.fy[t]; fz = g.fz[t]; fm = 1;
    }
    fx /= fm; fy /= fm; fz /= fm;
    const floor = w.floorAt(x, y, z);
    let gx = tx - fx * range;
    let gy = ty - fy * range;
    let gz = tz - fz * range;
    let speed = vmax;
    if (p.style === BOOM && d > range * 0.8) {
      const above = y - ty;
      if (above < 8 * k && d < 90 * k) {
        gy = Math.min(w.cy + w.top - 1 * k, ty + 12 * k);
      } else if (above >= 6 * k) {
        /* The dive: at the lead, flat out. */
        gx = x + lx; gy = y + ly; gz = z + lz;
      }
    }
    if (p.style === SNIPE && d < range * 0.6) {
      /* Too close: back off sideways, nose still on it. */
      gx = x - rx + this.side[i] * -rz;
      gy = y + 2 * k;
      gz = z - rz + this.side[i] * rx;
    }
    gy = Math.max(gy, floor + 1.5 * k);
    /* Far: cut the corner to it. Near: fly the lead. */
    let ax;
    let ay;
    let az;
    if (d > range * 2.2) {
      const look = Math.min(1.5, d / vmax) * lead;
      ax = rx + tvx * look;
      ay = ry + tvy * look;
      az = rz + tvz * look;
      /* Swing wide of its nose rather than meet it head on. */
      ax = ax * 0.7 + (gx - x) * 0.3;
      ay = ay * 0.7 + (gy - y) * 0.3;
      az = az * 0.7 + (gz - z) * 0.3;
    } else {
      ax = lx * 0.75 + (gx - x) * 0.25;
      ay = ly * 0.75 + (gy - y) * 0.25;
      az = lz * 0.75 + (gz - z) * 0.25;
      /* Hold my range: as fast as it goes, plus what closes the gap. */
      speed = Math.max(vmax * 0.35, Math.min(vmax, tspeed + (d - range) * 1.4));
    }
    /* Overshooting: closing fast and near, or it is beside me. Pull up
     * out of its plane and bleed speed, the high yo-yo. */
    if (d < range * 1.1 && close > vmax * 0.45) {
      ay += d * 0.8;
      speed = Math.max(vmax * 0.3, speed - close * 0.6);
    }
    const am = Math.sqrt(ax * ax + ay * ay + az * az);
    if (am > 1e-6) {
      want.vx = (ax / am) * speed;
      want.vy = (ay / am) * speed;
      want.vz = (az / am) * speed;
    }
    want.wander = p.style === JINK ? 0.3 : 0.08;
    /* The camera: on the lead when it can be got there, else looking at
     * it, as a pilot keeps the target in view. */
    if (lm > 1e-6) {
      const ldx = lx / lm;
      const ldy = ly / lm;
      const ldz = lz / lm;
      const camOn = ldx * g.fx[i] + ldy * g.fy[i] + ldz * g.fz[i];
      const alt = y - floor;
      if (d < gunR * 1.15 && camOn > 0.6 && (alt > 3 * k || ldy > -0.3)) {
        want.aim = true;
        want.ax = ldx;
        want.ay = ldy;
        want.az = ldz;
      } else if (d < gunR * 2) {
        want.face = true;
        want.fx = ldx;
        want.fy = ldy;
        want.fz = ldz;
      }
    }
    /* Past it: it is behind me and near. Run out and come back, or for
     * the turn fighter, turn. */
    const ahead = (rx * this.bx[i] + ry * this.by[i] + rz * this.bz[i]) / d;
    if (ahead < -0.3 && d < range * 1.5) {
      if (p.style === BOOM || (p.style !== TURN && p.style !== BRAWL && g.rand() < 0.02)) {
        this.set(i, EXTEND, now);
      }
    }
  }

  /*
   * DEFENDING: somebody is on my tail. Break across their line of fire,
   * into their turn, and throw the quad about; dive for cover if it is
   * low and near.
   */
  steerDefend(i, now, sk, p, vmax, want) {
    const g = this.g;
    const w = g.world;
    const k = w.k;
    const a = this.threatBy[i];
    if (a < 0 || !this.known[i * this.n + a]) {
      this.toward(i, g.x[i] + g.vx[i], g.y[i] + g.vy[i], g.z[i] + g.vz[i], vmax, want);
      return;
    }
    const q = i * this.n + a;
    /* From the attacker to me. */
    let rx = g.x[i] - this.kx[q];
    let ry = g.y[i] - this.ky[q];
    let rz = g.z[i] - this.kz[q];
    const d = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (d < 1e-6) {
      return;
    }
    rx /= d; ry /= d; rz /= d;
    /* Across the line: my velocity's share across it, or a side. */
    let sx = g.vx[i] - rx * (g.vx[i] * rx + g.vy[i] * ry + g.vz[i] * rz);
    let sy = 0;
    let sz = g.vz[i] - rz * (g.vx[i] * rx + g.vy[i] * ry + g.vz[i] * rz);
    let sm = Math.sqrt(sx * sx + sz * sz);
    if (sm < 2 * k) {
      sx = -rz * this.side[i];
      sz = rx * this.side[i];
      sm = Math.sqrt(sx * sx + sz * sz);
    }
    if (sm > 1e-9) {
      sx /= sm;
      sz /= sm;
    }
    /* Into the attacker a little, which takes its angle away, and up or
     * down by how high it is. */
    const alt = g.y[i] - w.floorAt(g.x[i], g.y[i], g.z[i]);
    sy = alt > 8 * k ? -0.35 : 0.25;
    const vxW = sx - rx * 0.35;
    const vyW = sy;
    const vzW = sz - rz * 0.35;
    const m = Math.sqrt(vxW * vxW + vyW * vyW + vzW * vzW);
    want.vx = (vxW / m) * vmax;
    want.vy = (vyW / m) * vmax;
    want.vz = (vzW / m) * vmax;
    want.wander = 0.15;
    /* Jinks, harder for the jinker, at uneven moments. */
    if (now >= this.jinkAt[i]) {
      const jinkMs = 250 + Math.floor((1 - p.jink) * 450 + g.rand() * 300);
      this.jinkAt[i] = now + jinkMs;
      const amp = p.jink * sk.thrust * G * k * 0.9;
      /* Across the line of fire, never along it. */
      let jx = g.rand() * 2 - 1;
      let jy = (g.rand() * 2 - 1) * 0.8;
      let jz = g.rand() * 2 - 1;
      const along = jx * rx + jy * ry + jz * rz;
      jx -= rx * along;
      jy -= ry * along;
      jz -= rz * along;
      const jm = Math.sqrt(jx * jx + jy * jy + jz * jz);
      if (jm > 1e-6) {
        this.jx[i] = (jx / jm) * amp;
        this.jy[i] = (jy / jm) * amp;
        this.jz[i] = (jz / jm) * amp;
      }
      /* Sometimes reverse the break: a scissors. */
      if (g.rand() < 0.25 * p.jink) {
        this.side[i] = -this.side[i];
      }
    }
  }

  /*
   * A MISSILE COMING. Turn side on to it while it is far, so it has to
   * turn to follow; at the skill's moment before it arrives, break hard
   * across its path and change height, which it cannot follow that late.
   * A wall between it and me is the best dodge of all, so a bot near one
   * goes for the far side.
   */
  steerEvade(i, now, sk, p, vmax, want) {
    const g = this.g;
    const w = g.world;
    const k = w.k;
    const s = g.incoming(i);
    if (s < 0) {
      this.toward(i, g.x[i] + g.vx[i], g.y[i] + g.vy[i], g.z[i] + g.vz[i], vmax, want);
      return;
    }
    let rx = g.x[i] - g.mx[s];
    let ry = g.y[i] - g.my[s];
    let rz = g.z[i] - g.mz[s];
    const d = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (d < 1e-6) {
      return;
    }
    rx /= d; ry /= d; rz /= d;
    const close = g.mSpeed[s] - (g.vx[i] * rx + g.vy[i] * ry + g.vz[i] * rz);
    const tti = d / Math.max(close, 1 * k);
    const side = this.side[i];
    /* Side on: across its line, level. */
    let sx = -rz * side;
    let sz = rx * side;
    const sm = Math.sqrt(sx * sx + sz * sz);
    if (sm > 1e-9) {
      sx /= sm;
      sz /= sm;
    } else {
      sx = 1; sz = 0;
    }
    const alt = g.y[i] - w.floorAt(g.x[i], g.y[i], g.z[i]);
    if (tti > this.breakAt[i]) {
      want.vx = sx * vmax;
      want.vy = (alt < 4 * k ? 0.2 : -0.1) * vmax;
      want.vz = sz * vmax;
      /* Cover: if a nav point out of its sight is near, go there. */
      if (this.goalAt[i] === 0) {
        this.goalAt[i] = -1;
        const q = this.nav;
        for (let a = 0; a < q.length && a < 8; a += 1) {
          const pnt = q[(a + i * 3 + Math.floor(now / 100)) % q.length];
          if (!this.near(i, pnt.x, pnt.y, pnt.z, 25 * k)) continue;
          if (w.blocked(g.mx[s], g.my[s], g.mz[s], pnt.x, pnt.y, pnt.z) >= 0
            && w.blocked(g.x[i], g.y[i], g.z[i], pnt.x, pnt.y, pnt.z) < 0) {
            this.goalX[i] = pnt.x; this.goalY[i] = pnt.y; this.goalZ[i] = pnt.z;
            this.goalAt[i] = 1;
            break;
          }
        }
      }
      if (this.goalAt[i] === 1) {
        this.toward(i, this.goalX[i], this.goalY[i], this.goalZ[i], vmax, want);
      }
    } else {
      /* The break: still side on at full speed, which is what makes it
       * swing its nose fastest, and hard over or under, which its lead
       * did not allow for. */
      const up = alt < 6 * k ? 1 : -1;
      want.vx = sx * vmax;
      want.vy = up * vmax * 0.8;
      want.vz = sz * vmax;
    }
    want.wander = 0.05;
  }




  /*
   * SHOOTING. The gun fires along the camera, nudged no more than a
   * thumb's worth toward where the bot believes the lead is, give or take
   * its aim's wander; it pulls when that line passes near enough to the
   * lead for its trigger, in bursts, and minds the heat. A missile goes
   * when it holds a lock and the shot is a good one.
   */
  shoot(i, now, sk, p, armed, want) {
    const g = this.g;
    const c = this.c;
    const k = g.world.k;
    const n = this.n;
    const DT = c.DT;
    g.firing[i] = 0;
    /* The aim's wander, always moving. */
    const tau = 0.35;
    const kick = Math.sqrt((2 * DT) / tau);
    this.ex[i] += -this.ex[i] * (DT / tau) + (g.rand() * 2 - 1) * kick;
    this.ey[i] += -this.ey[i] * (DT / tau) + (g.rand() * 2 - 1) * kick;
    this.ez[i] += -this.ez[i] * (DT / tau) + (g.rand() * 2 - 1) * kick;
    if (!armed) {
      return;
    }
    g.lockFor(i, now);
    const t = g.target[i];
    if (t < 0 || !g.hittable(t) || this.mode[i] !== ATTACK || !this.sees(i, t, now) || !this.losOk[i * n + t]) {
      this.burst[i] = 0;
      this.trackMs[i] = 0;
      return;
    }
    const q = i * n + t;
    const rx = this.kx[q] - g.x[i];
    const ry = this.ky[q] - g.y[i];
    const rz = this.kz[q] - g.z[i];
    const d = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (d < 1e-6) {
      return;
    }
    /* Missiles. */
    if (g.locked(i) && g.lockOn[i] === t && now >= this.missileAt[i] && g.rack[i] > 0) {
      this.missileAt[i] = now + 400;
      const r = d / (c.MISSILE.lockRange * k);
      let want2 = sk.missile;
      if (r < 0.12) want2 = 0;
      if (p.style === SNIPE) want2 *= 1.5;
      if (g.hp[t] < g.hpMax * 0.5) want2 *= 1.3;
      /* One of mine already on its way to it: wait. */
      for (let s = 0; s < c.MISSILES; s += 1) {
        if (g.mAlive[s] && g.mOwner[s] === i && g.mTarget[s] === t) {
          want2 = 0;
        }
      }
      if (t === 0 && this.mePerf < -2) want2 *= 0.5;
      if (g.rand() < want2 * 0.4) {
        g.launch(i, now);
      }
    }
    const gunR = c.GUN.range * k;
    if (d > gunR * 0.9 || !want.aim) {
      this.burst[i] = 0;
      this.trackMs[i] = Math.max(0, this.trackMs[i] - c.EVERY * 2);
      return;
    }
    this.trackMs[i] += c.EVERY;
    /* Where it believes the lead is. */
    const tof = d / (c.GUN.speed * k);
    let lx = rx + (this.kvx[q] - g.vx[i]) * tof * sk.lead;
    let ly = ry + (this.kvy[q] - g.vy[i]) * tof * sk.lead;
    let lz = rz + (this.kvz[q] - g.vz[i]) * tof * sk.lead;
    const lm = Math.sqrt(lx * lx + ly * ly + lz * lz);
    lx /= lm; ly /= lm; lz /= lm;
    /* The wander's size: the skill's, this bot's, worse before it has
     * settled on the target, worse against a pilot crossing fast, and
     * eased or pressed by how the pilot's round is going. */
    const settle = Math.max(0, 1 - this.trackMs[i] / 1200);
    const cvx = this.kvx[q] - g.vx[i];
    const cvy = this.kvy[q] - g.vy[i];
    const cvz = this.kvz[q] - g.vz[i];
    const cross = Math.sqrt(cvx * cvx + cvy * cvy + cvz * cvz) / Math.max(d, 5 * k);
    let sigma = sk.aim * p.aim * (1 + settle) * (1 + Math.min(1.5, cross * 0.8));
    if (t === 0) {
      sigma *= Math.max(0.8, Math.min(1.35, 1 - this.mePerf * 0.07));
    }
    let ax = lx + this.ex[i] * sigma;
    let ay = ly + this.ey[i] * sigma;
    let az = lz + this.ez[i] * sigma;
    /* The gun: the camera, nudged toward that by no more than GIMBAL. */
    const fx = g.fx[i];
    const fy = g.fy[i];
    const fz = g.fz[i];
    const am = Math.sqrt(ax * ax + ay * ay + az * az);
    ax /= am; ay /= am; az /= am;
    let ox = ax - fx;
    let oy = ay - fy;
    let oz = az - fz;
    const om = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (om > GIMBAL) {
      ox *= GIMBAL / om;
      oy *= GIMBAL / om;
      oz *= GIMBAL / om;
    }
    let sx = fx + ox;
    let sy = fy + oy;
    let sz = fz + oz;
    const sm = Math.sqrt(sx * sx + sy * sy + sz * sz);
    sx /= sm; sy /= sm; sz /= sm;
    /* How far it would pass from where it believes the lead is. */
    const ex = sx - lx;
    const ey = sy - ly;
    const ez = sz - lz;
    const miss = Math.sqrt(ex * ex + ey * ey + ez * ez) * d;
    const slack = c.HIT_R * k * (1.2 + p.trigger * 3 + (1 - sk.discipline) * 2);
    const heatCap = g.hp[t] < g.hpMax * 0.15 ? 0.97 : 0.8;
    if (this.burst[i]) {
      if (miss > slack * 2 || now > this.burstAt[i] || g.heat[i] > heatCap) {
        this.burst[i] = 0;
        this.offAt[i] = now + 150 + Math.floor(g.rand() * (500 - p.trigger * 300));
      }
    } else if (miss < slack && now >= this.offAt[i] && g.heat[i] < heatCap - 0.15 && this.trackMs[i] > sk.react * 0.6) {
      this.burst[i] = 1;
      this.burstAt[i] = now + 300 + Math.floor(g.rand() * (500 + p.trigger * 700));
    }
    if (this.burst[i]) {
      g.pull(i, sx, sy, sz, now);
    }
  }
}




