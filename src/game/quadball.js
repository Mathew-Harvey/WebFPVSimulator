/*
 * quadball.js: Quad Ball, rocket league with quads. The owner's ask of
 * 2026-10-29: "rocket league but with quads", solo with bots and in rooms
 * with bots. Two teams, pink and mint, a ball the size of a car and a goal
 * at each end of the arena (src/maps/ball/arena.js): push the ball into the
 * other team's goal.
 *
 * IT IS THE DOGFIGHT WITH A BALL FOR A TARGET. The slots, the spawns, the
 * bots' flying (src/game/botflyer.js) and the world the shell reads from the
 * map are src/game/dogfight.js's. Nothing is fired. `pops` holds each
 * pilot's goals, so everything that reads a dogfight's score reads this
 * one's, and `teamScore` holds the teams'.
 *
 * NOTHING HERE TOUCHES THE PLANT. The ball is a game object, as a bot is: a
 * quad that meets it bumps it and flies on exactly as it would with the game
 * off, so a hit is the ball's business and the quad is not shoved. A goal
 * never resets the pilot either: the ball goes back to the middle and the
 * bots to their kickoff spots, held for a few seconds so the pilot can fly
 * back.
 *
 * THE BALL, in world metres through k like the dogfight's bots: a sphere
 * with gravity (floaty, as the genre likes it), a little air drag, rolling
 * friction on the floor and a bounce off the arena (arenaStep, pure, here so
 * the checks drive it without a game). A quad within the ball's radius and
 * the quad's own gives it a push along the line between them, the harder the
 * faster the quad closes, and a little of the quad's own motion besides.
 *
 * A BOT PLAYS as a team mate would: the one nearest the ball is the
 * attacker, it works round to the far side of the ball from the goal it
 * wants and then flies through the ball toward it; the next is the support
 * and takes a spot upfield and across; the last stays back between the ball
 * and its own goal, and comes out to clear when the ball is near. The skill
 * says how fast it flies, how far ahead it reads the ball and how often it
 * thinks again.
 *
 * PURE, as the dogfight is: no Three.js, no DOM, no JS trigonometry, nothing
 * allocated on a step, its own clock fed every DOGFIGHT_EVERY steps of the
 * lap clock.
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

/* The ball and the quad, in the aircraft's own metres. */
export const BALL = {
  radius: 1.5,
  /* A quad's reach into the ball: its own body. */
  quad: 0.5,
  gravity: 5.5,
  drag: 0.1,
  floor: 0.62,
  wall: 0.78,
  roof: 0.5,
  roll: 0.35,
  /* How hard a closing quad pushes: the share of its closing speed,
   * on top of undoing the ball's own, and of its own motion carried. */
  push: 1.55,
  carry: 0.18,
  top: 46,
  /* Surface grip: the share of a bounce's normal impulse a surface can give
   * back sideways, which is what turns a skid into a roll and a glance into
   * spin. The grass, the walls, and a quad's frame. */
  muFloor: 0.5,
  muWall: 0.28,
  muQuad: 0.3,
  /* Below this impact speed (metres a second, at scale 1) a bounce is
   * cushioned toward dead, so the ball settles and does not chatter. */
  soft: 4,
  /* Spin lost to the air and to the pivot on the grass, per second. */
  spinDrag: 0.15,
  pivot: 1.2,
  /* A hit's normal is tilted up by this much, so a low touch lifts. */
  lift: 0.2,
};

/* How long, ms: the kickoff countdown, the pause for a goal, the pause on
 * the table before the next round. */
export const KICK_MS = 3500;
export const GOAL_MS = 3200;

/* Rounds: 'ms' the clock, 'goals' the target, 0 for none. */
export const BALL_ROUNDS = {
  /* Practice: no clock and no target, the ball only kicked off again. */
  free: { ms: 0, goals: 0 },
  '3m': { ms: 180000, goals: 0 },
  '5m': { ms: 300000, goals: 0 },
  first5: { ms: 0, goals: 5 },
};

export const BALL_SIZES = [1, 2, 3];

/*
 * HOW THE BOTS PLAY, aircraft metres and ms. stand: how far behind the ball
 * the attacker lines up. lead: how many seconds ahead of the ball it reads.
 * think: how long it holds a decision, ms. pace: the share of its top speed
 * it presses at once it is lined up.
 */
export const BALL_BOTS = {
  rookie: {
    stand: 7, lead: 0.1, think: 420, pace: 0.8,
  },
  pilot: {
    stand: 6, lead: 0.28, think: 260, pace: 0.92,
  },
  ace: {
    stand: 5, lead: 0.45, think: 140, pace: 1,
  },
};

export function normaliseBallRules(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  /* Practice is the arena flown as freestyle: the pilot and the ball and
   * nobody else, no clock. It is never asked for by a page, only by the
   * shell when the map is flown without a match (src/main.js). */
  const practice = r.practice === true;
  return {
    game: 'ball',
    practice,
    size: practice ? 1 : (BALL_SIZES.includes(r.size) ? r.size : 2),
    skill: has(SKILLS, r.skill) ? r.skill : 'rookie',
    round: practice ? 'free' : (has(BALL_ROUNDS, r.round) && r.round !== 'free' ? r.round : '3m'),
  };
}

/* The dogfight underneath: 2v2 is the pilot and three bots. */
function underneath(r) {
  return {
    bots: r.practice ? 0 : Math.min(MAX_BOTS, r.size * 2 - 1), skill: r.skill, round: 'none', hits: 'arcade',
  };
}

/* The team a solo slot is on: the pilot and the first size - 1 bots are
 * pink, the rest mint. */
export function soloTeam(slot, size) {
  return slot < size ? 0 : 1;
}

/*
 * Where team t's rank r kicks off, world metres, into out[0..1] as x, z:
 * a staggered line in front of its own goal, nearest the ball first.
 */
export function kickoffSpot(A, t, r, k, out) {
  const dir = t === 0 ? 1 : -1;
  out[0] = -dir * (A.hx * 0.46 + (r > 0 ? r * 8 * k : 0));
  const side = r === 0 ? 0 : (r % 2 ? 1 : -1);
  out[1] = side * (A.gw * 0.9 + (r > 2 ? 6 : 0));
}

/*
 * FRICTION AT A CONTACT, pure. The ball is a solid sphere (I = 2/5 R^2, unit
 * mass). n points from the surface to the ball's centre, jn is the normal
 * impulse that was just given, (ux, uy, uz) is the surface's own velocity.
 * The point of the ball on the surface slides at its velocity less the
 * surface's; Coulomb friction takes it toward zero, no more than mu * jn,
 * and the impulse that does it also spins the ball.
 */
export function grip(b, R, nx, ny, nz, jn, mu, ux = 0, uy = 0, uz = 0) {
  const wx = b.wx || 0;
  const wy = b.wy || 0;
  const wz = b.wz || 0;
  let cx = b.vx - ux - R * (wy * nz - wz * ny);
  let cy = b.vy - uy - R * (wz * nx - wx * nz);
  let cz = b.vz - uz - R * (wx * ny - wy * nx);
  const cn = cx * nx + cy * ny + cz * nz;
  cx -= cn * nx;
  cy -= cn * ny;
  cz -= cn * nz;
  const tm = Math.hypot(cx, cy, cz);
  if (tm < 1e-9) {
    return;
  }
  /* 2/7 of the slip stops it: a sphere that is also free to spin. */
  const j = Math.min(tm * (2 / 7), mu * jn) / tm;
  const sx = -cx * j;
  const sy = -cy * j;
  const sz = -cz * j;
  b.vx += sx;
  b.vy += sy;
  b.vz += sz;
  const f = 2.5 / R;
  b.wx = wx - f * (ny * sz - nz * sy);
  b.wy = wy - f * (nz * sx - nx * sz);
  b.wz = wz - f * (nx * sy - ny * sx);
}

/*
 * A BOUNCE off a fixed surface with normal n (toward the ball), restitution
 * e and grip mu. A hard impact bounces by e; a soft one is cushioned, so a
 * ball dropped from low settles in a few hops and not a hundred. Returns the
 * impact speed, 0 for a ball already leaving.
 */
function bounce(b, R, k, nx, ny, nz, e, mu) {
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) {
    return 0;
  }
  const sp = -vn;
  const soft = BALL.soft * k;
  const ee = sp >= soft ? e : e * (sp / soft);
  const jn = sp * (1 + ee);
  b.vx += nx * jn;
  b.vy += ny * jn;
  b.vz += nz * jn;
  grip(b, R, nx, ny, nz, jn, mu);
  return sp;
}

/*
 * ONE STEP OF THE BALL against the arena, pure. b: { x, y, z, vx, vy, vz }
 * and, when it has them, wx, wy, wz, its spin in radians a second (a ball
 * without them gets them). R the ball's radius, k the scale, A the arena.
 * Returns 0, or -1 when the ball is wholly in the west goal, +1 in the east.
 *
 * Every surface is a bounce with grip (above), so a ball landing skidding
 * grabs and rolls on, a ball kissed off the wall comes away spinning, and
 * the spin changes the next bounce: the three things a real ball does that
 * a bare reflection does not. The goal mouth's posts and crossbar are edges
 * the ball strikes round, not a gap in the wall that clips.
 */
export function arenaStep(b, R, k, A, dt) {
  if (b.wx === undefined) {
    b.wx = 0;
    b.wy = 0;
    b.wz = 0;
  }
  b.vy -= BALL.gravity * k * dt;
  const drag = 1 - BALL.drag * dt;
  b.vx *= drag;
  b.vy *= drag;
  b.vz *= drag;
  const sd = 1 - BALL.spinDrag * dt;
  b.wx *= sd;
  b.wy *= sd;
  b.wz *= sd;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  let m = Math.hypot(b.vx, b.vy, b.vz);
  const cap = BALL.top * k;
  if (m > cap) {
    const s = cap / m;
    b.vx *= s;
    b.vy *= s;
    b.vz *= s;
    m = cap;
  }
  const ax = Math.abs(b.x);
  const sx = b.x < 0 ? -1 : 1;
  const sz = b.z < 0 ? -1 : 1;
  const pocket = ax > A.hx;
  /* The floor. */
  const floor = A.floor || 0;
  if (b.y < floor + R) {
    b.y = floor + R;
    bounce(b, R, k, 0, 1, 0, BALL.floor, BALL.muFloor);
    if (b.vy < 1.0 * k) {
      b.vy = 0;
    }
  }
  if (b.vy === 0 && b.y <= floor + R + 1e-9) {
    /* On the grass: gravity presses it, so the grass still grips, and a
     * roll loses a little to the blades, spin and speed together so a roll
     * stays a roll. */
    grip(b, R, 0, 1, 0, BALL.gravity * k * dt, BALL.muFloor);
    const f = 1 - BALL.roll * dt;
    b.vx *= f;
    b.vz *= f;
    b.wx *= f;
    b.wz *= f;
    b.wy *= 1 - BALL.pivot * dt;
    if (b.vx * b.vx + b.vz * b.vz < (0.04 * k) * (0.04 * k)) {
      b.vx = 0;
      b.vz = 0;
    }
  }
  /* The ceiling: the arena's, or the pocket's roof. */
  const top = (pocket ? A.gh : A.ceil) - R;
  if (b.y > top) {
    b.y = top;
    bounce(b, R, k, 0, -1, 0, BALL.roof, BALL.muWall);
  }
  /* The sides: the arena's, or the pocket's narrower ones. */
  const zl = (pocket ? A.gw : A.hz) - R;
  if (b.z > zl) {
    b.z = zl;
    bounce(b, R, k, 0, 0, -1, BALL.wall, BALL.muWall);
  } else if (b.z < -zl) {
    b.z = -zl;
    bounce(b, R, k, 0, 0, 1, BALL.wall, BALL.muWall);
  }
  /* The end walls, where the centre is outside the mouth. */
  const inMouth = Math.abs(b.z) < A.gw && b.y < A.gh;
  if (ax > A.hx - R && ax <= A.hx && !inMouth) {
    b.x = sx * (A.hx - R);
    bounce(b, R, k, -sx, 0, 0, BALL.wall, BALL.muWall);
  } else if (!pocket && ax > A.hx - R && inMouth) {
    /* The posts and the crossbar, edges at the end wall's face. ex, ez, ey are the
     * ball's offset from the edge, ex negative toward the pitch. */
    const ex = ax - A.hx;
    const ez = A.gw - Math.abs(b.z);
    const ey = b.y - A.gh;
    for (let pass = 0; pass < 2; pass += 1) {
      const d = pass === 0 ? Math.hypot(ex, ez) : Math.hypot(ex, ey);
      if (d >= R || d < 1e-9) {
        continue;
      }
      const gx = ex / d;
      /* Out along the edge's normal to a radius, then bounce off it. */
      b.x = sx * (A.hx + gx * R);
      if (pass === 0) {
        const gz = -ez / d;
        b.z = sz * (A.gw + gz * R);
        bounce(b, R, k, sx * gx, 0, sz * gz, BALL.wall, BALL.muWall);
      } else {
        const gy = ey / d;
        b.y = A.gh + gy * R;
        bounce(b, R, k, sx * gx, gy, 0, BALL.wall, BALL.muWall);
      }
    }
  }
  /* The back of the pocket. */
  const back = A.hx + A.gd - R;
  if (ax > back) {
    b.x = sx * back;
    bounce(b, R, k, -sx, 0, 0, BALL.wall, BALL.muWall);
  }
  return Math.abs(b.x) > A.hx + R * 0.9 && b.y <= A.gh ? sx : 0;
}

export class BallRound extends Dogfight {
  /*
   * world: as the Dogfight's, with `arena` the map's (map.ballGame.arena).
   * pen: map.ballGame.
   */
  constructor(world, rules, seed, pen = null) {
    const r = normaliseBallRules(rules);
    super(world, underneath(r), seed);
    this.ballRules = r;
    this.pen = pen;
    this.arena = (pen && pen.arena) || world.arena;
    this.setup();
    this.reset(0);
  }

  /* Everything this game keeps beside the dogfight's, for every slot. */
  setup() {
    const n = this.cap;
    this.team = new Uint8Array(n);
    this.touches = new Int32Array(n);
    this.ownGoals = new Int32Array(n);
    this.teamScore = new Int32Array(2);
    this.flyer = new BotFlyer(this, { DT, MAX: n });
    this.ball = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0,
    };
    this.ballPrev = { x: 0, y: 0, z: 0 };
    this.touchAt = new Float64Array(n);
    this.role = new Int8Array(n);
    this.thinkAt = new Float64Array(n);
    this.gx = new Float64Array(n);
    this.gy = new Float64Array(n);
    this.gz = new Float64Array(n);
    this.gv = new Float64Array(n);
    this.spot = new Float64Array(2);
    this.scratch = new Float64Array(8);
    this.lastTouch = -1;
    this.lastTouchTeam = -1;
    this.holdUntil = 0;
    this.goalUntil = 0;
    this.goalPending = false;
    this.overtime = false;
    this.winnerTeam = -1;
    this.lastScorer = -1;
    this.lastScoringTeam = -1;
    this.lastOwn = false;
  }

  get bR() {
    return BALL.radius * this.world.k;
  }

  setRules(rules) {
    this.ballRules = normaliseBallRules(rules);
    this.rules = underneath(this.ballRules);
    this.reset(this.round + 1);
  }

  /* Whether slot i is in the match and flying a quad the ball can meet. */
  plays(i) {
    return this.inFight[i] === 1 && this.alive[i] === 1;
  }

  assignSolo() {
    for (let i = 0; i < this.cap; i += 1) {
      this.team[i] = soloTeam(i, this.ballRules.size);
    }
  }

  reset(round) {
    super.reset(round);
    /* The dogfight's constructor resets before this class has its arrays. */
    if (!this.team) {
      return;
    }
    const br = BALL_ROUNDS[this.ballRules.round];
    this.roundMs = br.ms;
    this.goalsToWin = br.goals;
    this.popsToWin = 0;
    this.assignSolo();
    if (!this.flyer.nav.length && this.brain && this.brain.nav.length) {
      this.flyer.nav = this.brain.nav;
    }
    this.flyer.reset();
    this.teamScore.fill(0);
    this.touches.fill(0);
    this.ownGoals.fill(0);
    this.touchAt.fill(0);
    this.thinkAt.fill(0);
    this.role.fill(0);
    this.winner = -1;
    this.winnerTeam = -1;
    this.overtime = false;
    this.lastTouch = -1;
    this.lastTouchTeam = -1;
    this.lastScorer = -1;
    this.lastScoringTeam = -1;
    this.lastOwn = false;
    this.goalUntil = 0;
    this.goalPending = false;
    this.holdUntil = 0;
    this.kickoff(true);
  }

  /* Ball to the middle, held in the air; bots to their kickoff spots. */
  kickoff(first) {
    const A = this.arena;
    const k = this.world.k;
    const b = this.ball;
    b.x = 0;
    b.y = (A.floor || 0) + 5 * k;
    b.z = 0;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
    b.wx = 0;
    b.wy = 0;
    b.wz = 0;
    this.ballPrev.x = b.x;
    this.ballPrev.y = b.y;
    this.ballPrev.z = b.z;
    const rank = [0, 0];
    for (let i = 0; i < this.cap; i += 1) {
      if (!this.inFight[i]) {
        continue;
      }
      const t = this.team[i];
      const r = rank[t];
      rank[t] += 1;
      if (!this.isBot[i] || this.puppet[i]) {
        continue;
      }
      kickoffSpot(A, t, r, k, this.spot);
      this.x[i] = this.spot[0];
      this.z[i] = this.spot[1];
      this.y[i] = (A.floor || 0) + 3 * k;
      this.vx[i] = 0;
      this.vy[i] = 0;
      this.vz[i] = 0;
      this.fx[i] = t === 0 ? 1 : -1;
      this.fy[i] = 0;
      this.fz[i] = 0;
      this.ux[i] = 0;
      this.uy[i] = 1;
      this.uz[i] = 0;
      this.xPrev[i] = this.x[i];
      this.yPrev[i] = this.y[i];
      this.zPrev[i] = this.z[i];
      this.fxPrev[i] = this.fx[i];
      this.fyPrev[i] = 0;
      this.fzPrev[i] = 0;
      this.uxPrev[i] = 0;
      this.uyPrev[i] = 1;
      this.uzPrev[i] = 0;
      this.shieldUntil[i] = 0;
      this.flyer.placed(i);
      this.gx[i] = this.x[i];
      this.gy[i] = this.y[i];
      this.gz[i] = this.z[i];
    }
    this.holdUntil = first ? Infinity : this.clockMs + KICK_MS;
  }

  /* Whether the ball is live: the countdown is over and no goal is being
   * celebrated. */
  get inPlay() {
    return this.running && this.clockMs >= this.holdUntil && this.clockMs >= this.goalUntil;
  }

  /* Seconds left of the countdown to a kickoff, 0 once the ball is live. */
  countdownS() {
    if (this.over || this.startedMs < 0 || this.clockMs < this.goalUntil) {
      return 0;
    }
    return this.clockMs < this.holdUntil ? Math.ceil((this.holdUntil - this.clockMs) / 1000) : 0;
  }

  /* Whose goal slot s attacks: +1 east for pink, -1 west for mint. */
  dirOf(s) {
    return this.team[s] === 0 ? 1 : -1;
  }

  /* ONE BOT. Its role, where to be and how fast, then the flying. */
  playBot(i, now) {
    const A = this.arena;
    const k = this.world.k;
    const skill = this.skillOf(i);
    const sk = BALL_BOTS[skill] || BALL_BOTS.pilot;
    const spec = SKILLS[skill] || SKILLS.pilot;
    const b = this.ball;
    const t = this.team[i];
    const dir = t === 0 ? 1 : -1;
    const live = this.inPlay;
    if (now >= this.thinkAt[i]) {
      this.thinkAt[i] = now + sk.think + Math.floor(this.rand() * 120);
      this.pickRole(i);
    }
    let gx = this.gx[i];
    let gy = this.gy[i];
    let gz = this.gz[i];
    let speed = 0;
    if (!live) {
      kickoffSpot(A, t, this.rankOf(i), k, this.spot);
      gx = this.spot[0];
      gz = this.spot[1];
      gy = (A.floor || 0) + 3 * k;
      speed = 6 * k;
    } else {
      const role = this.role[i];
      /* Where the ball will be, a little ahead. */
      const px = b.x + b.vx * sk.lead;
      const py = Math.max(b.y + b.vy * sk.lead, this.bR);
      const pz = b.z + b.vz * sk.lead;
      /* The line from the ball to the goal it wants. */
      let hx = dir * A.hx - px;
      let hy = A.gh * 0.4 - py;
      let hz = -pz;
      const hm = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
      hx /= hm;
      hy /= hm;
      hz /= hm;
      if (role === 0) {
        /* Attacker. */
        const stand = this.bR + sk.stand * k;
        const bx = px - hx * stand;
        const by = Math.max(py - hy * stand, 1.4 * k);
        const bz = pz - hz * stand;
        const dx = bx - this.x[i];
        const dy = by - this.y[i];
        const dz = bz - this.z[i];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const tx = px - this.x[i];
        const ty = py - this.y[i];
        const tz = pz - this.z[i];
        const tm = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
        const aligned = (tx * hx + ty * hy + tz * hz) / tm > 0.62;
        if (aligned || dist < 3 * k) {
          /* Through the ball, toward the goal. */
          gx = px + hx * this.bR * 1.6;
          gy = Math.max(py + hy * this.bR * 1.6, 1.2 * k);
          gz = pz + hz * this.bR * 1.6;
          speed = 0;
        } else {
          gx = bx;
          gy = by;
          gz = bz;
          speed = 0;
        }
      } else if (role === 1) {
        /* Support: upfield of the ball and across from it. */
        gx = px + dir * 14 * k;
        gz = pz > 0 ? -A.gw * 0.6 : A.gw * 0.6;
        gy = 5 * k;
        speed = spec.speed * 24 * k * 0.9;
      } else {
        /* Back: between the ball and its own goal. */
        gx = -dir * (A.hx - 12 * k);
        gz = Math.max(-A.gw * 0.7, Math.min(A.gw * 0.7, pz * 0.45));
        gy = A.gh * 0.45;
        speed = spec.speed * 24 * k;
      }
      gx = Math.max(-A.hx + 2 * k, Math.min(A.hx - 2 * k, gx));
      gz = Math.max(-A.hz + 2 * k, Math.min(A.hz - 2 * k, gz));
      gy = Math.min(A.ceil - 2 * k, gy);
    }
    this.gx[i] = gx;
    this.gy[i] = gy;
    this.gz[i] = gz;
    this.flyer.setGoal(i, gx, gy, gz, speed);
    this.flyer.step(i, now, spec);
  }

  /* Slot i's place in its team's line by slot order, 0 first. */
  rankOf(i) {
    let r = 0;
    for (let j = 0; j < i; j += 1) {
      if (this.inFight[j] && this.team[j] === this.team[i]) {
        r += 1;
      }
    }
    return r;
  }

  /* Attacker, support or back for bot i: by who of its team's bots is
   * nearest the ball; the one nearest attacks, the next supports, the rest
   * stay back until the ball comes within reach of their goal, when they
   * clear it. */
  pickRole(i) {
    const b = this.ball;
    const t = this.team[i];
    const A = this.arena;
    const k = this.world.k;
    const d2 = (j) => {
      const dx = this.x[j] - b.x;
      const dy = this.y[j] - b.y;
      const dz = this.z[j] - b.z;
      return dx * dx + dy * dy + dz * dz;
    };
    const mine = d2(i);
    let ahead = 0;
    for (let j = 1; j < this.cap; j += 1) {
      if (j !== i && this.inFight[j] && this.isBot[j] && this.team[j] === t && d2(j) < mine) {
        ahead += 1;
      }
    }
    let role = ahead >= 2 ? 2 : ahead;
    const dir = t === 0 ? 1 : -1;
    /* The ball is near our goal: the back clears. */
    if (role === 2 && -dir * b.x > A.hx - 26 * k) {
      role = 0;
    }
    this.role[i] = role;
  }

  /* The quad of slot i against the ball. */
  meet(i, now) {
    const k = this.world.k;
    const b = this.ball;
    const R = this.bR;
    const reach = R + BALL.quad * k;
    const dx = b.x - this.x[i];
    const dy = b.y - this.y[i];
    const dz = b.z - this.z[i];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= reach * reach) {
      return;
    }
    const d = Math.sqrt(d2) || 1e-6;
    let nx = dx / d;
    let ny = dy / d;
    let nz = dz / d;
    const rel = (this.vx[i] - b.vx) * nx + (this.vy[i] - b.vy) * ny + (this.vz[i] - b.vz) * nz;
    b.x = this.x[i] + nx * reach;
    b.y = this.y[i] + ny * reach;
    b.z = this.z[i] + nz * reach;
    if (rel <= 0) {
      return;
    }
    /* A light touch cushions: the ball is trapped and dribbled, not
     * punted. A hard one gives the full bounce. */
    const soft = BALL.soft * k * 1.5;
    const e = BALL.push - 1;
    const j = rel * (1 + (rel >= soft ? e : e * (rel / soft)));
    /* The push leans up a little, as a boot under a ball does. */
    const ln = BALL.lift * (rel >= soft ? 1 : rel / soft);
    const nl = Math.hypot(nx, ny + ln, nz);
    nx /= nl;
    ny = (ny + ln) / nl;
    nz /= nl;
    b.vx += nx * j;
    b.vy += ny * j;
    b.vz += nz * j;
    /* The frame drags across the ball's skin: it carries it a little and
     * puts spin on it, from a glancing hit. */
    grip(b, R, dx / d, dy / d, dz / d, j, BALL.muQuad, this.vx[i], this.vy[i], this.vz[i]);
    b.vx += this.vx[i] * BALL.carry;
    b.vy += this.vy[i] * BALL.carry;
    b.vz += this.vz[i] * BALL.carry;
    if (now - this.touchAt[i] > 120) {
      this.touches[i] += 1;
      this.event('touch', i, -1, 0, '', b.x, b.y, b.z, rel > 14 * k);
    }
    this.touchAt[i] = now;
    this.lastTouch = i;
    this.lastTouchTeam = this.team[i];
  }

  /* A goal for the team on the side the ball went into. */
  goal(side, now) {
    const A = this.arena;
    const scorer = side > 0 ? 0 : 1;
    const own = this.lastTouch >= 0 && this.lastTouchTeam !== scorer;
    this.teamScore[scorer] += 1;
    let by = -1;
    if (this.lastTouch >= 0 && !own) {
      by = this.lastTouch;
      this.pops[by] += 1;
    } else if (own) {
      this.ownGoals[this.lastTouch] += 1;
    }
    this.lastScorer = by;
    this.lastScoringTeam = scorer;
    this.lastOwn = own;
    this.goalUntil = now + GOAL_MS;
    this.holdUntil = now + GOAL_MS + KICK_MS;
    this.event('goal', by, scorer, 0, own ? 'own' : '', this.ball.x, this.ball.y, this.ball.z, true);
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.vz = 0;
    this.ball.wx = 0;
    this.ball.wy = 0;
    this.ball.wz = 0;
    this.lastTouch = -1;
    this.lastTouchTeam = -1;
    if (this.overtime || (this.goalsToWin > 0 && this.teamScore[scorer] >= this.goalsToWin)) {
      this.finish(scorer, now);
    }
    return A;
  }

  finish(team, now) {
    this.over = true;
    this.overAtMs = now;
    this.winnerTeam = team;
    let best = -1;
    for (let i = 0; i < this.cap; i += 1) {
      if (this.inFight[i] && this.team[i] === team && (best < 0 || this.pops[i] > this.pops[best])) {
        best = i;
      }
    }
    this.winner = team >= 0 ? best : -1;
    this.event('over', this.winner, team, 0, '', 0, 0, 0);
  }

  /* After a goal is celebrated: the ball back, the bots to their spots. */
  afterGoal() {
    if (this.goalPending && this.clockMs >= this.goalUntil && !this.over) {
      this.goalPending = false;
      const hold = this.holdUntil;
      this.kickoff(false);
      this.holdUntil = hold;
    }
  }

  /* ONE FEED. me: as the dogfight's, gun and missile ignored. */
  step(me, teleported = false) {
    this.snapshot();
    this.ballPrev.x = this.ball.x;
    this.ballPrev.y = this.ball.y;
    this.ballPrev.z = this.ball.z;
    this.clockMs += DOGFIGHT_EVERY;
    const now = this.clockMs;
    this.meFlying = Boolean(me.flying);
    this.feedMe(me, teleported);
    if (this.meFlying && this.startedMs < 0 && this.alive[ME]) {
      this.startedMs = now;
      this.holdUntil = now + KICK_MS;
      this.event('go', -1, -1, 0, '', this.x[ME], this.y[ME], this.z[ME]);
    }
    for (let i = 1; i < this.cap; i += 1) {
      if (this.isBot[i] && this.alive[i] && !this.puppet[i]) {
        this.playBot(i, now);
      }
    }
    this.play(now);
  }

  /* The ball's feed and the round's end, shared with a room's host. */
  play(now) {
    if (this.goalPending) {
      this.afterGoal();
    }
    if (!this.running) {
      return;
    }
    if (this.inPlay) {
      const k = this.world.k;
      const b = this.ball;
      const R = this.bR;
      for (let i = 0; i < this.cap; i += 1) {
        if (this.plays(i)) {
          this.meet(i, now);
        }
      }
      const side = arenaStep(b, R, k, this.arena, DT);
      if (side !== 0) {
        this.goalPending = true;
        this.goal(side, now);
      }
    } else if (this.clockMs < this.holdUntil && this.clockMs >= this.goalUntil && !this.goalPending) {
      /* The countdown: the ball hangs where it was put. */
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.vz = 0;
      this.ball.wx = 0;
      this.ball.wy = 0;
      this.ball.wz = 0;
    }
    if (this.over) {
      return;
    }
    const timeUp = this.roundMs > 0 && now - this.startedMs >= this.roundMs;
    if (timeUp && now >= this.goalUntil) {
      const a = this.teamScore[0];
      const c = this.teamScore[1];
      if (a === c) {
        if (!this.overtime) {
          this.overtime = true;
          this.event('overtime', -1, -1, 0, '', 0, 0, 0);
        }
      } else {
        this.finish(a > c ? 0 : 1, now);
      }
    }
  }

  leftMs() {
    if (this.overtime) {
      return 0;
    }
    return super.leftMs();
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
        team: this.team[i],
        goals: this.pops[i],
        touches: this.touches[i],
        own: this.ownGoals[i],
        pops: this.pops[i],
        popped: 0,
      });
    }
    out.sort((a, b) => (b.goals - a.goals) || (b.touches - a.touches) || (a.slot - b.slot));
    return out;
  }
}

export { MAX_PILOTS, ME };
