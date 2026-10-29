/*
 * driftround.js: Drift Matsuri as a round with bots, the owner's asks of
 * 2026-10-29: "Every map should be available with friends so multiplayer or
 * single player, bots should be able to be added to either", and the plan
 * he was shown for this map, best reel wins: everybody films one take of
 * the battles, and the best take wins.
 *
 * THE JUDGE IS THE MAP'S. Every take is scored by src/game/film.js, the
 * same judge the map has always had: the pilot's by the map's own Film,
 * fed by the shell as it always is, and each bot's by a Film of its own fed
 * from the bot's camera here, against the same cars. So a bot's score is
 * what the pilot's would be had they flown that camera.
 *
 * A BOT FILMS as a camera operator on a crane would: it picks a car, holds
 * a spot behind and beside it, and keeps its lens on the car, or between
 * the car and the one battling it, for the tandem. Its skill says how
 * close it works, how tight it follows, how steady its lens is and whether
 * it goes for the tandem. It is not flown through the dogfight's bot brain
 * because a camera is the point and the drift cars are on a clock: it is
 * carried, with a limit on how hard it can pull, so it lags a car that
 * flicks and catches up on the straights, as a real one does.
 *
 * THE ROUND is one take: TAKE_MS from the pilot's take off. The bots start
 * theirs then too, so every take is the same length, and the round ends
 * when the last of them is cut. A pilot who crashes keeps what they filmed.
 *
 * PURE, as the dogfight is: no Three.js, no DOM, no JS trigonometry, its
 * own clock fed every DOGFIGHT_EVERY. A bot's take allocates its card once
 * when it is cut, nothing on a feed.
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
import { Film, TAKE_MS, gradeOf } from './film.js';

const DT = DOGFIGHT_EVERY / 1000;

/*
 * HOW THE BOTS FILM, world metres and seconds. along: how far behind its
 * car it sits. side: how far off its car's line. up: how high over the
 * road. pull: how hard it closes on its spot, per second. most: the most
 * it can change its speed by, metres a second a second. aim: how quickly
 * its lens comes round to the car, per second. shake: how far its lens
 * wanders, a new wander every second. tandem: whether it frames both cars
 * of a battle. thinkMs: how long it stays on one car.
 */
export const DRIFT_BOTS = {
  rookie: {
    along: 8, side: 3.5, up: 2.6, pull: 1.4, most: 18, aim: 3, shake: 0.12, tandem: false, thinkMs: 9000,
  },
  pilot: {
    along: 6, side: 2.5, up: 2, pull: 2.4, most: 30, aim: 6, shake: 0.05, tandem: true, thinkMs: 12000,
  },
  ace: {
    along: 4.5, side: 1.8, up: 1.5, pull: 3.6, most: 45, aim: 10, shake: 0.015, tandem: true, thinkMs: 15000,
  },
};

export function normaliseDriftRules(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  return {
    game: 'drift',
    bots: Number.isInteger(r.bots) ? Math.max(0, Math.min(MAX_BOTS, r.bots)) : 3,
    skill: has(SKILLS, r.skill) ? r.skill : 'rookie',
  };
}

function underneath(r) {
  return {
    bots: r.bots, skill: r.skill, round: 'none', hits: 'arcade',
  };
}

/*
 * What a filming game keeps beside the dogfight's, for every slot it has:
 * the map's judge and cars, each bot's own judge, the car it is on and how
 * its lens is pointing. DriftRound's and a room's (src/game/driftroom.js),
 * which shares the methods below.
 */
export function filming(g, pen) {
  const n = g.cap;
  g.pen = pen;
  g.film = pen ? pen.film : null;
  g.films = [];
  for (let i = 0; i < n; i += 1) {
    g.films.push(null);
  }
  g.dCar = new Int16Array(n).fill(-1);
  g.dWith = new Int16Array(n).fill(-1);
  g.dThinkAt = new Float64Array(n);
  g.dShakeAt = new Float64Array(n);
  g.dsx = new Float64Array(n);
  g.dsy = new Float64Array(n);
  g.dfx = new Float64Array(n);
  g.dfy = new Float64Array(n);
  g.dfz = new Float64Array(n);
  g.dScore = new Float64Array(n);
  g.cam = {
    x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, rx: 1, ry: 0, rz: 0, p: 0, q: 0, r: 0,
  };
  g.takeFrom = 0;
  g.taking = false;
}

/* A judge for bot i, set to the map's cars, groups, zones and lens. */
function botFilm(g, i) {
  if (!g.films[i] && g.film) {
    const f = new Film();
    f.cars = g.film.cars;
    f.groups = g.film.groups;
    f.seen = new Int32Array(Math.max(1, g.film.groups.length));
    f.zones = g.film.zones;
    g.films[i] = f;
  }
  const f = g.films[i];
  if (f && g.film) {
    f.tanHalf = g.film.tanHalf;
    f.aspect = g.film.aspect;
  }
  return f;
}

export class DriftRound extends Dogfight {
  /*
   * pen: { film, poses }: the drift map's judge (map.filmGame.film) and a
   * function giving the cars' poses as the shell last read them. Without
   * one there is nothing to film, and the bots only hover.
   */
  constructor(world, rules, seed, pen = null) {
    const r = normaliseDriftRules(rules);
    super(world, underneath(r), seed);
    this.driftRules = r;
    filming(this, pen);
    this.reset(0);
  }

  setRules(rules) {
    this.driftRules = normaliseDriftRules(rules);
    this.rules = underneath(this.driftRules);
    this.reset(this.round + 1);
  }

  reset(round) {
    super.reset(round);
    if (!this.dCar) {
      return;
    }
    this.roundMs = TAKE_MS;
    this.popsToWin = 0;
    this.winner = -1;
    this.takeFrom = 0;
    this.taking = false;
    this.dCar.fill(-1);
    this.dThinkAt.fill(0);
    this.dScore.fill(0);
    for (let i = 0; i < this.cap; i += 1) {
      this.shieldUntil[i] = 0;
      const f = this.films[i];
      if (f) {
        f.reset();
      }
      this.dfx[i] = this.fx[i];
      this.dfy[i] = this.fy[i];
      this.dfz[i] = this.fz[i];
    }
    /* A fresh take for the pilot too: the round's take is from take off. */
    if (this.film) {
      this.film.reset();
    }
  }

  /* The pilot's take, and each bot's, as points. */
  scoreOf(i) {
    if (i === ME) {
      return this.film ? this.film.score : 0;
    }
    return this.dScore[i];
  }

  /* The take's grade for slot i. */
  gradeOf(i) {
    return gradeOf(this.scoreOf(i));
  }

  /* The car bot i films: a car on the course, one another bot is on
   * counting against it, and with it, for a bot that frames battles, the
   * nearest car of its group. */
  pickCar(i, poses) {
    const cars = this.film.cars;
    let best = -1;
    let bestScore = Infinity;
    for (let c = 0; c < cars.length; c += 1) {
      const p = poses[cars[c].slot];
      if (!p || !p.on) {
        continue;
      }
      const dx = p.x - this.x[i];
      const dz = p.z - this.z[i];
      let score = Math.sqrt(dx * dx + dz * dz) + this.rand() * 20;
      for (let j = 1; j < this.cap; j += 1) {
        if (j !== i && this.dCar[j] === c) {
          score += 40;
        }
      }
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    let mate = -1;
    if (best >= 0) {
      const a = poses[cars[best].slot];
      let near = Infinity;
      for (let c = 0; c < cars.length; c += 1) {
        const p = poses[cars[c].slot];
        if (c === best || cars[c].group !== cars[best].group || !p || !p.on) {
          continue;
        }
        const dx = p.x - a.x;
        const dz = p.z - a.z;
        const d = dx * dx + dz * dz;
        if (d < near) {
          near = d;
          mate = c;
        }
      }
    }
    this.dCar[i] = best;
    this.dWith[i] = mate;
  }

  /* ONE FEED OF A BOT: to its spot off its car, its lens on the shot, and
   * what that lens sees to its own judge once its take is running. */
  driftBot(i, now) {
    const poses = this.pen && this.pen.poses ? this.pen.poses() : null;
    if (!poses || !this.film || !this.film.cars.length) {
      return;
    }
    const sk = DRIFT_BOTS[this.skillOf(i)] || DRIFT_BOTS.pilot;
    const cars = this.film.cars;
    let c = this.dCar[i];
    if (c < 0 || now >= this.dThinkAt[i] || !poses[cars[c].slot] || !poses[cars[c].slot].on) {
      this.pickCar(i, poses);
      c = this.dCar[i];
      this.dThinkAt[i] = now + sk.thinkMs + Math.floor(this.rand() * 4000);
    }
    if (c < 0) {
      return;
    }
    const a = poses[cars[c].slot];
    const m = sk.tandem && this.dWith[i] >= 0 ? poses[cars[this.dWith[i]].slot] : null;
    /* The spot: behind its car on its heading, off to the side it is
     * already on, so it does not swing across the car's nose. */
    const rx = -a.hz;
    const rz = a.hx;
    const onSide = (this.x[i] - a.x) * rx + (this.z[i] - a.z) * rz >= 0 ? 1 : -1;
    const tx = a.x - a.hx * sk.along + rx * sk.side * onSide;
    const tz = a.z - a.hz * sk.along + rz * sk.side * onSide;
    const ty = a.y + sk.up;
    /* Carried: the car's own speed and a pull to the spot, the change in
     * speed held to what it can pull. */
    const wvx = (a.vx || 0) + (tx - this.x[i]) * sk.pull;
    const wvy = (ty - this.y[i]) * sk.pull;
    const wvz = (a.vz || 0) + (tz - this.z[i]) * sk.pull;
    let ax = (wvx - this.vx[i]) / DT;
    let ay = (wvy - this.vy[i]) / DT;
    let az = (wvz - this.vz[i]) / DT;
    const am = Math.sqrt(ax * ax + ay * ay + az * az);
    if (am > sk.most) {
      ax *= sk.most / am;
      ay *= sk.most / am;
      az *= sk.most / am;
    }
    this.vx[i] += ax * DT;
    this.vy[i] += ay * DT;
    this.vz[i] += az * DT;
    this.x[i] += this.vx[i] * DT;
    this.y[i] += this.vy[i] * DT;
    this.z[i] += this.vz[i] * DT;
    const floor = this.world.floorAt(this.x[i], this.y[i], this.z[i]) + 0.4;
    if (this.y[i] < floor) {
      this.y[i] = floor;
      this.vy[i] = 0;
    }
    /* The lens: on the car, or between it and its battle, and a wander. */
    if (now >= this.dShakeAt[i]) {
      this.dShakeAt[i] = now + 1000;
      this.dsx[i] = (this.rand() * 2 - 1) * sk.shake;
      this.dsy[i] = (this.rand() * 2 - 1) * sk.shake;
    }
    const h = cars[c].height || 1.3;
    let lx = a.x;
    let ly = a.y + h * 0.5;
    let lz = a.z;
    if (m && m.on) {
      lx = (a.x + m.x) / 2;
      lz = (a.z + m.z) / 2;
    }
    let fx = lx - this.x[i];
    let fy = ly - this.y[i];
    let fz = lz - this.z[i];
    let fm = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    fx = fx / fm + rx * this.dsx[i];
    fy = fy / fm + this.dsy[i];
    fz = fz / fm + rz * this.dsx[i];
    const k = Math.min(1, sk.aim * DT);
    let nx = this.dfx[i] + (fx - this.dfx[i]) * k;
    let ny = this.dfy[i] + (fy - this.dfy[i]) * k;
    let nz = this.dfz[i] + (fz - this.dfz[i]) * k;
    fm = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= fm;
    ny /= fm;
    nz /= fm;
    /* How fast the lens turned, rad/s, as the judge reads a craft's rates. */
    const tx2 = nx - this.dfx[i];
    const ty2 = ny - this.dfy[i];
    const tz2 = nz - this.dfz[i];
    const turn = Math.sqrt(tx2 * tx2 + ty2 * ty2 + tz2 * tz2) / DT;
    this.dfx[i] = nx;
    this.dfy[i] = ny;
    this.dfz[i] = nz;
    this.fx[i] = nx;
    this.fy[i] = ny;
    this.fz[i] = nz;
    /* Up: the world's, square to the lens; right: the lens across it. */
    let ux = -nx * ny;
    let uy = 1 - ny * ny;
    let uz = -nz * ny;
    const um = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= um;
    uy /= um;
    uz /= um;
    this.ux[i] = ux;
    this.uy[i] = uy;
    this.uz[i] = uz;
    if (!this.running || !this.taking) {
      return;
    }
    const f = botFilm(this, i);
    if (!f) {
      return;
    }
    const cam = this.cam;
    cam.x = this.x[i];
    cam.y = this.y[i];
    cam.z = this.z[i];
    cam.fx = nx; cam.fy = ny; cam.fz = nz;
    cam.ux = ux; cam.uy = uy; cam.uz = uz;
    cam.rx = ny * uz - nz * uy;
    cam.ry = nz * ux - nx * uz;
    cam.rz = nx * uy - ny * ux;
    cam.p = turn;
    cam.q = 0;
    cam.r = 0;
    f.step(now - this.takeFrom, cam, poses, false);
    f.events.length = 0;
    this.dScore[i] = f.score;
  }

  /* Whether every take of the round is cut: the bots' on the clock, the
   * pilot's when its judge says so or the clock is well past. */
  takesDone(now) {
    if (!this.taking) {
      return false;
    }
    const late = now - this.takeFrom >= TAKE_MS + 3000;
    for (let i = 1; i < this.cap; i += 1) {
      if (this.inFight[i] && this.isBot[i] && this.films[i] && !this.films[i].done && !late) {
        return false;
      }
    }
    return late || !this.film || this.film.done;
  }

  /* ONE FEED. me: as the dogfight's, gun and missile ignored. */
  step(me, teleported = false) {
    this.snapshot();
    this.clockMs += DOGFIGHT_EVERY;
    const now = this.clockMs;
    this.meFlying = Boolean(me.flying);
    this.feedMe(me, teleported);
    if (this.meFlying && this.startedMs < 0 && this.alive[ME]) {
      this.startedMs = now;
      this.takeFrom = now;
      this.taking = true;
      this.event('go', -1, -1, 0, '', this.x[ME], this.y[ME], this.z[ME]);
    }
    for (let i = 1; i < this.cap; i += 1) {
      if (this.isBot[i] && this.alive[i]) {
        this.driftBot(i, now);
      }
    }
    for (let i = 0; i < this.cap; i += 1) {
      if (this.inFight[i]) {
        this.pops[i] = Math.round(this.scoreOf(i));
      }
    }
    if (!this.running) {
      return;
    }
    if (this.takesDone(now)) {
      this.over = true;
      this.overAtMs = now;
      const rows = this.standings();
      const a = rows[0];
      const b = rows[1];
      this.winner = a && a.reel > 0 && (!b || b.reel < a.reel) ? a.slot : -1;
      this.event('over', this.winner, -1, 0, '', 0, 0, 0);
    }
  }

  /* The take's clock, for the HUD: what is left of it. */
  leftMs() {
    if (!this.taking) {
      return TAKE_MS;
    }
    return Math.max(0, TAKE_MS - (this.clockMs - this.takeFrom));
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

export { MAX_PILOTS, ME, TAKE_MS };
