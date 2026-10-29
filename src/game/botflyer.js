/*
 * botflyer.js: how a bot flies, and nothing about why. A bot is a point
 * with a pose that flies like a quad: it asks for a velocity, its body
 * swings its thrust toward what that needs no faster than its roll rate,
 * pushes no harder than its motors and drag and gravity do the rest. It
 * minds the walls (a look ahead, whiskers, rings of ways round, braking for
 * the room it has, sliding along what it touches), it gets unstuck, and it
 * finds its way round a building by a graph of open points grown from the
 * pilot's start.
 *
 * Split out of src/game/dogbrain.js on 2026-10-29 so the mini games that
 * want a bot that flies somewhere (goats, drift) do not carry a dogfight's
 * mind. The Dogfight's BotBrain extends it; anything else can use it as it
 * is, with setGoal and step:
 *
 *   const flyer = new BotFlyer(game, { DT, MAX });
 *   flyer.reset();                       once a round: finds the graph
 *   flyer.placed(i);                     after a bot is put somewhere new
 *   flyer.setGoal(i, x, y, z, speed);    where to, at most how fast, m/s
 *   flyer.step(i, now, spec);            each feed, per bot
 *
 * `game` holds the bots' state in arrays of MAX: x y z, vx vy vz, the
 * camera's forward fx fy fz and the body's up ux uy uz (all written here),
 * live(j) for who to keep apart from, rand() an integer stream giving
 * [0, 1), and world: { k, cx, cy, cz, radius, top, cruise, spawns,
 * floorAt(x, y, z), blocked(ax, ay, az, bx, by, bz) -> t or -1,
 * inside(x, y, z) } as the Dogfight's gridWorld builds it. `spec` is how
 * the bot flies: { speed (a share of the world's cruise), thrust (g), rate
 * (rad/s its thrust swings), yaw (rad/s its nose), agility (1/s), alt (m
 * it likes above the floor) }; the Dogfight's SKILLS carry the first five.
 *
 * Determinism: the game's integer random stream and square roots only, no
 * JS trigonometry; the few fixed angles are written out as cosines.
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

export const G = 9.81;
/* The camera's tilt up from the body: sin and cos of 20 degrees. */
export const CAM_S = 0.34202;
export const CAM_C = 0.93969;
/* The least thrust: airmode idle, a twelfth of a g. */
const T_MIN = 0.08;
/* The most points in the graph of ways round a map. */
const NAV = 64;

/* The rings of directions a bot tries round the way it wants to go when
 * that way is blocked: 30, 60, 90 and 135 degrees off it, eight round
 * each. Cosine then sine of each ring's angle. */
const RINGS = [
  [0.86603, 0.5],
  [0.5, 0.86603],
  [0, 1],
  [-0.70711, 0.70711],
];
const ROUND8 = [
  [1, 0], [0.70711, 0.70711], [0, 1], [-0.70711, 0.70711],
  [-1, 0], [-0.70711, -0.70711], [0, -1], [0.70711, -0.70711],
];

export class BotFlyer {
  /* game: see above. rules: { DT, MAX }, the feed's step in s and how
   * many bots there can be. */
  constructor(game, rules) {
    this.g = game;
    this.DT = rules.DT;
    const n = rules.MAX;
    this.n = n;
    const f = () => new Float64Array(n);
    this.goalX = f(); this.goalY = f(); this.goalZ = f();
    this.goalAt = f();
    this.goalSpeed = f();
    /* The body's forward, level with its thrust. The game's f is the
     * camera's. */
    this.bx = f(); this.by = f(); this.bz = f();
    /* A wander on the way it flies, so no path is a ruler line. */
    this.wx = f(); this.wy = f(); this.wz = f();
    /* Obstacle avoidance: a way round, held for a moment. */
    this.avoidX = f(); this.avoidY = f(); this.avoidZ = f();
    this.avoidUntil = f();
    this.avoidSlow = f();
    this.lookAt = f();
    /* A roll, motors at idle, the thrust swung round the nose. */
    this.rollUntil = f();
    this.rollSign = f();
    /* Stuck: where it was a second ago. */
    this.stuckX = f(); this.stuckY = f(); this.stuckZ = f();
    this.stuckAt = f();
    this.unstickUntil = f();
    this.nav = [];
    this.navNear = new Float64Array(8);
    this.navDist = new Float64Array(NAV);
    this.navPrev = new Int16Array(NAV);
    this.navDone = new Uint8Array(NAV);
    this.routeTo = new Int16Array(n).fill(-1);
    this.routeAt = f();
    this.to = { x: 0, y: 0, z: 0 };
    /* Scratch, so a feed allocates nothing. */
    this.want = {
      vx: 0, vy: 0, vz: 0, aim: false, ax: 0, ay: 0, az: 0, face: false, fx: 0, fy: 0, fz: 0, wander: 0,
    };
    this.u3 = new Float64Array(3);
    /* The parts of a blocked move to keep, most first: slide along a
     * wall, along a floor or a ceiling, along an edge. */
    this.slides = [[1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 0, 0], [0, 0, 1], [0, 1, 0]];
    /* Counts for the arena's report (scripts/dogfight-arena.js): scrapes
     * along a solid, and times it was stuck. */
    this.scrapes = new Int32Array(n);
    this.stucks = new Int32Array(n);
    this.floorScrapes = new Int32Array(n);
  }

  /* A fresh round: the open air read for ways round, once a world. */
  reset() {
    if (!this.nav.length) {
      this.findNav();
    }
  }

  /* Bot i was just put somewhere (a spawn): forget how it was flying. */
  placed(i) {
    const g = this.g;
    this.goalAt[i] = 0;
    this.bx[i] = g.fx[i];
    this.by[i] = 0;
    this.bz[i] = g.fz[i];
    this.wx[i] = 0; this.wy[i] = 0; this.wz[i] = 0;
    this.avoidUntil[i] = 0;
    this.rollUntil[i] = 0;
    this.stuckX[i] = g.x[i]; this.stuckY[i] = g.y[i]; this.stuckZ[i] = g.z[i];
    this.stuckAt[i] = g.clockMs + 1000;
    this.unstickUntil[i] = 0;
    this.lookAt[i] = g.clockMs + i * 7;
    this.routeAt[i] = 0;
    this.routeTo[i] = -1;
  }

  /* Where bot i should go, and at most how fast, m/s. */
  setGoal(i, x, y, z, speed) {
    this.goalX[i] = x;
    this.goalY[i] = y;
    this.goalZ[i] = z;
    this.goalSpeed[i] = speed;
  }

  /* One feed of bot i flying to its goal, round whatever is in the way. */
  step(i, now, spec) {
    const g = this.g;
    const w = g.world;
    const vmax = Math.min(w.cruise * spec.speed * 1.45 * w.k, this.goalSpeed[i] || Infinity);
    const want = this.want;
    want.vx = 0; want.vy = 0; want.vz = 0;
    want.aim = false; want.face = false;
    want.wander = 0.15;
    const to = this.to;
    this.route(i, this.goalX[i], this.goalY[i], this.goalZ[i], now, to);
    this.toward(i, to.x, to.y, to.z, vmax, want);
    const vx = g.vx[i];
    const vy = g.vy[i];
    const vz = g.vz[i];
    this.pilot(i, now, spec, spec.alt || 2, vmax, want, Math.sqrt(vx * vx + vy * vy + vz * vz));
  }

  /* What a game adds to the velocity a bot wants, after keeping apart
   * and before minding the walls. Nothing here. */
  push() {}

  /*
   * FLYING IT: from the velocity it wants to its motors, its body and its
   * nose, never through anything.
   */
  pilot(i, now, sk, alt, vmax, want, speed) {
    const g = this.g;
    const w = g.world;
    const k = w.k;
    const DT = this.DT;
    const n = this.n;
    const Tmax = sk.thrust * G * k;
    const gk = G * k;
    /* Drag that makes full thrust, level, top out at vmax. */
    const cd = Math.sqrt(Tmax * Tmax - gk * gk) / (vmax * vmax);
    const x = g.x[i];
    const y = g.y[i];
    const z = g.z[i];
    const vx = g.vx[i];
    const vy = g.vy[i];
    const vz = g.vz[i];
    /* The wander: a slow random drift on the way it goes. */
    const tau = 1.6;
    const kick = Math.sqrt((2 * DT) / tau);
    this.wx[i] += -this.wx[i] * (DT / tau) + (g.rand() * 2 - 1) * kick;
    this.wy[i] += -this.wy[i] * (DT / tau) + (g.rand() * 2 - 1) * kick * 0.5;
    this.wz[i] += -this.wz[i] * (DT / tau) + (g.rand() * 2 - 1) * kick;
    const wl = Math.sqrt(want.vx * want.vx + want.vy * want.vy + want.vz * want.vz);
    want.vx += this.wx[i] * wl * want.wander;
    want.vy += this.wy[i] * wl * want.wander;
    want.vz += this.wz[i] * wl * want.wander;
    /* Keep apart from everybody else. */
    for (let j = 0; j < n; j += 1) {
      if (j === i || !g.live(j)) {
        continue;
      }
      const dx = x - g.x[j];
      const dy = y - g.y[j];
      const dz = z - g.z[j];
      const d2 = dx * dx + dy * dy + dz * dz;
      const r = 3 * k;
      if (d2 < r * r && d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const push = ((r - d) / r) * vmax * 0.7;
        want.vx += (dx / d) * push;
        want.vy += (dy / d) * push;
        want.vz += (dz / d) * push;
      }
    }
    /* Whatever the game adds to the way it wants to go. */
    this.push(i, want, sk);
    /* Off the floor, under the arena's top, inside its edge, looking half
     * a second ahead. */
    const ahead = 0.6;
    const px = x + vx * ahead;
    const py = y + vy * ahead;
    const pz = z + vz * ahead;
    const floorHere = w.floorAt(x, y, z);
    const floorAhead = w.floorAt(px, y, pz);
    const minAlt = Math.max(1.0 * k, Math.min(alt * 0.5 * k, 2.5 * k));
    const low = Math.max(floorHere, floorAhead) + minAlt;
    if (py < low) {
      want.vy += (low - py) * 3;
    }
    const top = w.cy + w.top;
    if (py > top) {
      want.vy -= (py - top) * 2 + vmax * 0.2;
    }
    const rx = px - w.cx;
    const rz = pz - w.cz;
    const r2 = rx * rx + rz * rz;
    if (r2 > w.radius * w.radius) {
      const r = Math.sqrt(r2);
      want.vx -= (rx / r) * (r - w.radius) * 2 + (rx / r) * vmax * 0.3;
      want.vz -= (rz / r) * (r - w.radius) * 2 + (rz / r) * vmax * 0.3;
    }
    /* Round anything in the way, and no shot is worth a wall. */
    this.avoid(i, now, vmax, want, speed, sk);
    if (now < this.avoidUntil[i]) {
      want.aim = false;
    }
    /* Stuck against something for a second: go somewhere else. */
    if (now >= this.stuckAt[i]) {
      const mx = x - this.stuckX[i];
      const my = y - this.stuckY[i];
      const mz = z - this.stuckZ[i];
      const want2 = want.vx * want.vx + want.vy * want.vy + want.vz * want.vz;
      if (mx * mx + my * my + mz * mz < 2.25 * k * k && want2 > vmax * vmax * 0.09) {
        this.unstickUntil[i] = now + 700;
        this.stucks[i] += 1;
        this.goalAt[i] = 0;
        this.avoidX[i] = -this.bx[i] * 0.5 + (g.rand() * 2 - 1) * 0.6;
        this.avoidY[i] = 0.6;
        this.avoidZ[i] = -this.bz[i] * 0.5 + (g.rand() * 2 - 1) * 0.6;
      }
      this.stuckX[i] = x; this.stuckY[i] = y; this.stuckZ[i] = z;
      this.stuckAt[i] = now + 1000;
    }
    if (now < this.unstickUntil[i]) {
      want.vx = this.avoidX[i] * vmax * 0.5;
      want.vy = this.avoidY[i] * vmax * 0.5;
      want.vz = this.avoidZ[i] * vmax * 0.5;
      want.aim = false;
    }
    /* WHAT IT ASKS OF ITS MOTORS: the acceleration that closes on the
     * wanted velocity, plus a jink, plus what holds it up and what drag
     * takes away; the thrust is that, turned to its body. */
    const gain = sk.agility;
    let ax = (want.vx - vx) * gain;
    let ay = (want.vy - vy) * gain;
    let az = (want.vz - vz) * gain;
    const am = Math.sqrt(ax * ax + ay * ay + az * az);
    const acap = Tmax * 1.3;
    if (am > acap) {
      ax *= acap / am;
      ay *= acap / am;
      az *= acap / am;
    }
    const drag = cd * speed;
    let tx = ax + vx * drag;
    let ty = ay + gk + vy * drag;
    let tz = az + vz * drag;
    let tm = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tm < 1e-9) {
      tx = 0; ty = 1; tz = 0; tm = 1e-9;
    }
    let ux = tx / tm;
    let uy = ty / tm;
    let uz = tz / tm;
    /* To shoot, the camera has to be on the target, so the thrust is the
     * nearest it can be to what was asked that leaves the camera there:
     * on the cone at 70 degrees round the line of fire. */
    if (want.aim) {
      const d = ux * want.ax + uy * want.ay + uz * want.az;
      let nx = ux - want.ax * d;
      let ny = uy - want.ay * d;
      let nz = uz - want.az * d;
      let nm = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nm < 1e-6) {
        nx = -want.ay * want.ax;
        ny = 1 - want.ay * want.ay;
        nz = -want.ay * want.az;
        nm = Math.sqrt(nx * nx + ny * ny + nz * nz);
      }
      if (nm > 1e-9) {
        ux = want.ax * CAM_S + (nx / nm) * CAM_C;
        uy = want.ay * CAM_S + (ny / nm) * CAM_C;
        uz = want.az * CAM_S + (nz / nm) * CAM_C;
      }
    }
    /* A roll for the crowd after a pop: the thrust swung round the nose,
     * motors at idle, as a pilot rolls. */
    let idle = false;
    if (now < this.rollUntil[i]) {
      const s = this.rollSign[i];
      const fx = this.bx[i];
      const fy = this.by[i];
      const fz = this.bz[i];
      /* Across the body: forward cross up. */
      const cx = fy * g.uz[i] - fz * g.uy[i];
      const cy = fz * g.ux[i] - fx * g.uz[i];
      const cz = fx * g.uy[i] - fy * g.ux[i];
      ux = g.ux[i] + cx * s * 2;
      uy = g.uy[i] + cy * s * 2;
      uz = g.uz[i] + cz * s * 2;
      idle = true;
    }
    /* The body turns its thrust there no faster than the skill rolls. */
    this.u3[0] = g.ux[i]; this.u3[1] = g.uy[i]; this.u3[2] = g.uz[i];
    turn3(this.u3, ux, uy, uz, (idle ? 14 : sk.rate) * DT);
    const bux = this.u3[0];
    const buy = this.u3[1];
    const buz = this.u3[2];
    g.ux[i] = bux; g.uy[i] = buy; g.uz[i] = buz;
    let thrust = idle ? T_MIN * gk : tx * bux + ty * buy + tz * buz;
    if (thrust < T_MIN * gk) thrust = T_MIN * gk;
    if (thrust > Tmax) thrust = Tmax;
    /* Fly it. */
    const nvx = vx + (bux * thrust - vx * drag) * DT;
    const nvy = vy + (buy * thrust - gk - vy * drag) * DT;
    const nvz = vz + (buz * thrust - vz * drag) * DT;
    this.move(i, nvx, nvy, nvz, floorHere);
    /* THE NOSE: level with the thrust, toward what it is shooting or
     * looking at, else where it is going; the camera tilted up from it. */
    let hx;
    let hy;
    let hz;
    if (want.aim) {
      hx = want.ax; hy = want.ay; hz = want.az;
    } else if (want.face) {
      hx = want.fx; hy = want.fy; hz = want.fz;
    } else if (speed > 1.5 * k) {
      hx = vx; hy = vy; hz = vz;
    } else {
      hx = this.bx[i]; hy = this.by[i]; hz = this.bz[i];
    }
    const hd = hx * bux + hy * buy + hz * buz;
    hx -= bux * hd;
    hy -= buy * hd;
    hz -= buz * hd;
    const hm = Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (hm > 1e-6) {
      this.u3[0] = this.bx[i]; this.u3[1] = this.by[i]; this.u3[2] = this.bz[i];
      turn3(this.u3, hx / hm, hy / hm, hz / hm, sk.yaw * DT);
      let fx = this.u3[0];
      let fy = this.u3[1];
      let fz = this.u3[2];
      /* Square to the thrust again after the turn. */
      const fd = fx * bux + fy * buy + fz * buz;
      fx -= bux * fd;
      fy -= buy * fd;
      fz -= buz * fd;
      const fm = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (fm > 1e-6) {
        this.bx[i] = fx / fm;
        this.by[i] = fy / fm;
        this.bz[i] = fz / fm;
      }
    } else {
      const fd = this.bx[i] * bux + this.by[i] * buy + this.bz[i] * buz;
      let fx = this.bx[i] - bux * fd;
      let fy = this.by[i] - buy * fd;
      let fz = this.bz[i] - buz * fd;
      let fm = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (fm < 1e-6) {
        fx = 1; fy = 0; fz = 0; fm = 1;
      }
      this.bx[i] = fx / fm;
      this.by[i] = fy / fm;
      this.bz[i] = fz / fm;
    }
    g.fx[i] = this.bx[i] * CAM_C + bux * CAM_S;
    g.fy[i] = this.by[i] * CAM_C + buy * CAM_S;
    g.fz[i] = this.bz[i] * CAM_C + buz * CAM_S;
  }

  /*
   * THE WAYS ROUND THE MAP, found once a fight: up to NAV points in the
   * open air, each one seen from one already found, so every point is
   * reachable from where the pilot started and none is out in the void
   * past a building's walls; and the lines between them that are clear,
   * which make a graph a bot can find its way round a wall by. It grows
   * from the start outward, so a map that is one warehouse fills the
   * warehouse and a town fills the town.
   */
  findNav() {
    const g = this.g;
    const w = g.world;
    const k = w.k;
    const rand = g.rand;
    const solid = w.inside ? w.inside : () => false;
    const out = [];
    const reach = 60 * k;
    const open = (x, y, z) => {
      const r = 1.2 * k;
      return !(solid(x, y, z) || solid(x + r, y, z) || solid(x - r, y, z) || solid(x, y, z + r) || solid(x, y, z - r)
        || solid(x, y + r, z) || solid(x, y - r, z));
    };
    const add = (x, y, z, low) => {
      out.push({
        x, y, z, low, links: [],
      });
    };
    /* The roots: the pilot's start, and the map's spawns that it can see. */
    const sy = w.cy + 2 * k;
    add(w.cx, sy, w.cz, true);
    for (let s = 0; s < w.spawns.length; s += 1) {
      const p = w.spawns[s];
      if (w.blocked(w.cx, sy, w.cz, p.x, p.y, p.z) < 0) {
        add(p.x, p.y, p.z, false);
      }
    }
    /* The nearest few found so far, scratch. */
    const near = this.navNear;
    for (let tries = 0; tries < 1200 && out.length < NAV; tries += 1) {
      /* Near a point already found, so it grows outward from the start. */
      const from = out[Math.floor(rand() * out.length)];
      const x = from.x + (rand() * 2 - 1) * reach;
      const z = from.z + (rand() * 2 - 1) * reach;
      const rx = x - w.cx;
      const rz = z - w.cz;
      if (rx * rx + rz * rz > w.radius * w.radius) {
        continue;
      }
      const floor = w.floorAt(x, from.y, z);
      const y = Math.min(w.cy + w.top - 1 * k, floor + (1.5 + rand() * 9) * k);
      if (y < floor + 1.2 * k || !open(x, y, z)) {
        continue;
      }
      /* Not on top of one it has, and seen from at least one of the
       * nearest. */
      let tooNear = false;
      let found = 0;
      for (let n = 0; n < out.length; n += 1) {
        const o = out[n];
        const d = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y) + (o.z - z) * (o.z - z);
        if (d < 64 * k * k) {
          tooNear = true;
          break;
        }
        found = keepNearest(near, found, n, d);
      }
      if (tooNear || !found) {
        continue;
      }
      const at = out.length;
      let linked = false;
      for (let m = 0; m < found; m += 1) {
        const o = out[near[m * 2]];
        if (near[m * 2 + 1] < reach * reach * 1.6 && w.blocked(x, y, z, o.x, o.y, o.z) < 0) {
          if (!linked) {
            add(x, y, z, y - floor < 4 * k);
            linked = true;
          }
          out[at].links.push(near[m * 2]);
          o.links.push(at);
        }
      }
    }
    this.nav = out;
  }

  /*
   * Where bot i should fly next to get to (x, y, z): straight there if it
   * can see it, else the next point on the shortest way round through the
   * graph, worked out again every so often. Writes the point to `to`.
   */
  route(i, x, y, z, now, to) {
    const g = this.g;
    const w = g.world;
    const nav = this.nav;
    to.x = x;
    to.y = y;
    to.z = z;
    if (now >= this.routeAt[i]) {
      this.routeAt[i] = now + 500 + (i * 37) % 200;
      this.routeTo[i] = -1;
      if (w.blocked(g.x[i], g.y[i], g.z[i], x, y, z) < 0 || nav.length < 2) {
        return;
      }
      const start = this.nearestSeen(g.x[i], g.y[i], g.z[i]);
      const end = this.nearestSeen(x, y, z);
      if (start < 0 || end < 0) {
        return;
      }
      this.routeTo[i] = start === end ? end : this.nextStep(start, end);
    }
    const n = this.routeTo[i];
    if (n >= 0) {
      to.x = nav[n].x;
      to.y = nav[n].y;
      to.z = nav[n].z;
      /* There: ask again now. */
      const k = w.k;
      if (this.near(i, to.x, to.y, to.z, 4 * k)) {
        this.routeAt[i] = 0;
      }
    }
  }

  /* The graph's point nearest (x, y, z) that can be seen from it, of the
   * four nearest. */
  nearestSeen(x, y, z) {
    const nav = this.nav;
    const near = this.navNear;
    let found = 0;
    for (let n = 0; n < nav.length; n += 1) {
      const o = nav[n];
      const d = (o.x - x) * (o.x - x) + (o.y - y) * (o.y - y) + (o.z - z) * (o.z - z);
      found = keepNearest(near, found, n, d);
    }
    /* Nearest first. */
    for (let a = 0; a < found; a += 1) {
      let b = a;
      for (let m = a + 1; m < found; m += 1) {
        if (near[m * 2 + 1] < near[b * 2 + 1]) b = m;
      }
      const n = near[b * 2];
      const d = near[b * 2 + 1];
      near[b * 2] = near[a * 2];
      near[b * 2 + 1] = near[a * 2 + 1];
      near[a * 2] = n;
      near[a * 2 + 1] = d;
      const o = nav[n];
      if (this.g.world.blocked(x, y, z, o.x, o.y, o.z) < 0) {
        return n;
      }
    }
    return -1;
  }

  /* The first step from graph point a toward b on the shortest way, by
   * Dijkstra over a graph of at most NAV points; a itself if there is no
   * way. */
  nextStep(a, b) {
    const nav = this.nav;
    const n = nav.length;
    const dist = this.navDist;
    const prev = this.navPrev;
    const done = this.navDone;
    for (let m = 0; m < n; m += 1) {
      dist[m] = Infinity;
      prev[m] = -1;
      done[m] = 0;
    }
    dist[a] = 0;
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let m = 0; m < n; m += 1) {
        if (!done[m] && dist[m] < best) {
          best = dist[m];
          u = m;
        }
      }
      if (u < 0 || u === b) {
        break;
      }
      done[u] = 1;
      const links = nav[u].links;
      for (let l = 0; l < links.length; l += 1) {
        const v = links[l];
        const dx = nav[v].x - nav[u].x;
        const dy = nav[v].y - nav[u].y;
        const dz = nav[v].z - nav[u].z;
        const d = best + Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < dist[v]) {
          dist[v] = d;
          prev[v] = u;
        }
      }
    }
    if (prev[b] < 0) {
      return a;
    }
    let step = b;
    while (prev[step] !== a && prev[step] >= 0) {
      step = prev[step];
    }
    return step;
  }

  /*
   * Move bot i at its new velocity, and never through anything: a move
   * that would enter a solid slides along it instead, losing the
   * velocity into it, as a quad scrapes a wall.
   */
  move(i, nvx, nvy, nvz, floorHere) {
    const g = this.g;
    const w = g.world;
    const k = w.k;
    const DT = this.DT;
    const ox = g.x[i];
    const oy = g.y[i];
    const oz = g.z[i];
    let vx = nvx;
    let vy = nvy;
    let vz = nvz;
    if (w.blocked(ox, oy, oz, ox + vx * DT, oy + vy * DT, oz + vz * DT) >= 0) {
      if (oy + vy * DT < w.floorAt(ox + vx * DT, oy, oz + vz * DT) + 0.05 * k) this.floorScrapes[i] += 1;
      /* Which way is into it: try dropping each part of the move. */
      const tries = this.slides;
      let done = false;
      for (let s = 0; s < tries.length && !done; s += 1) {
        const m = tries[s];
        const sx = m[0] ? vx : 0;
        const sy = m[1] ? vy : 0;
        const sz = m[2] ? vz : 0;
        if ((sx || sy || sz) && w.blocked(ox, oy, oz, ox + sx * DT, oy + sy * DT, oz + sz * DT) < 0) {
          vx = m[0] ? vx : -vx * 0.2;
          vy = m[1] ? vy : -vy * 0.2;
          vz = m[2] ? vz : -vz * 0.2;
          g.x[i] = ox + sx * DT;
          g.y[i] = oy + sy * DT;
          g.z[i] = oz + sz * DT;
          done = true;
        }
      }
      if (!done) {
        vx *= -0.2;
        vy *= -0.2;
        vz *= -0.2;
      }
      /* And a way round, now. */
      this.lookAt[i] = 0;
      this.avoidUntil[i] = 0;
      this.scrapes[i] += 1;
    } else {
      g.x[i] = ox + vx * DT;
      g.y[i] = oy + vy * DT;
      g.z[i] = oz + vz * DT;
    }
    const floor = Math.max(floorHere, w.floorAt(g.x[i], g.y[i], g.z[i]));
    if (g.y[i] < floor + 0.3 * k) {
      g.y[i] = floor + 0.3 * k;
      if (vy < 0) vy = 0;
    }
    const roof = w.cy + w.top + 3 * k;
    if (g.y[i] > roof) {
      g.y[i] = roof;
      if (vy > 0) vy = 0;
    }
    g.vx[i] = vx;
    g.vy[i] = vy;
    g.vz[i] = vz;
  }

  near(i, x, y, z, r) {
    const g = this.g;
    const dx = x - g.x[i];
    const dy = y - g.y[i];
    const dz = z - g.z[i];
    return dx * dx + dy * dy + dz * dz < r * r;
  }

  /* Want to fly to (x, y, z) at `speed`, slowing on the way in. */
  toward(i, x, y, z, speed, want) {
    const g = this.g;
    const dx = x - g.x[i];
    const dy = y - g.y[i];
    const dz = z - g.z[i];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-6) {
      return;
    }
    const s = Math.min(speed, d * 1.2);
    want.vx = (dx / d) * s;
    want.vy = (dy / d) * s;
    want.vz = (dz / d) * s;
  }

  /*
   * ROUND WHAT IS IN THE WAY. Twenty times a second, staggered, look as
   * far ahead as it takes to stop plus a little, along the way it wants to
   * go; if that is blocked, try rings of directions round it, the ones
   * nearest what it wants first, and hold the first clear one for a
   * moment. Nothing clear: brake and climb.
   */
  avoid(i, now, vmax, want, speed, sk) {
    const g = this.g;
    const w = g.world;
    const k = w.k;
    let dx = want.vx;
    let dy = want.vy;
    let dz = want.vz;
    let dm = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dm < 1e-6) {
      return;
    }
    const holding = now < this.avoidUntil[i];
    if (now < this.lookAt[i]) {
      if (holding) {
        this.hold(i, dm, vmax, want);
      }
      return;
    }
    /* Looked at more often while it is dodging something. */
    this.lookAt[i] = now + (holding ? 30 : 50);
    dx /= dm; dy /= dm; dz /= dm;
    /* As far as it takes to stop, plus how far it goes before it has
     * answered the stick, plus a little. */
    const brake = (speed * speed) / (2 * sk.thrust * G * k) + speed * (1 / sk.agility + 1.6 / sk.rate) + 3 * k;
    const reach = Math.max(4 * k, brake);
    const x = g.x[i];
    const y = g.y[i];
    const z = g.z[i];
    /* Where it is going now matters as much as where it wants to. */
    const along = speed > 1e-6 ? w.blocked(x, y, z, x + g.vx[i] / speed * reach, y + g.vy[i] / speed * reach, z + g.vz[i] / speed * reach) : -1;
    const ahead = w.blocked(x, y, z, x + dx * reach, y + dy * reach, z + dz * reach);
    if (along < 0 && !this.whiskers(i, speed)) {
      if (holding) {
        /* Still clear the way it is dodging: keep dodging. */
        const hx = this.avoidX[i];
        const hy = this.avoidY[i];
        const hz = this.avoidZ[i];
        if (w.blocked(x, y, z, x + hx * reach, y + hy * reach, z + hz * reach) < 0) {
          this.hold(i, dm, vmax, want);
          return;
        }
      } else if (ahead < 0) {
        return;
      }
    }
    /* A frame round the wanted way: across it level, and its up. */
    let sx = -dz;
    let sz = dx;
    let sm = Math.sqrt(sx * sx + sz * sz);
    if (sm < 1e-6) {
      sx = 1; sz = 0; sm = 1;
    }
    sx /= sm; sz /= sm;
    /* up = s cross d */
    const ux = 0 * dz - sz * dy;
    const uy = sz * dx - sx * dz;
    const uz = sx * dy - 0 * dx;
    const floor = w.floorAt(x, y, z);
    const low = y - floor < 3 * k;
    const high = y > w.cy + w.top * 0.85;
    const start = Math.floor(g.rand() * 8);
    const updown = low ? 1 : (high ? -1 : 0);
    for (let r = 0; r < RINGS.length; r += 1) {
      const cr = RINGS[r][0];
      const sr = RINGS[r][1];
      /* Best first: the two level ones and the one away from the floor or
       * the top, then the rest, starting somewhere new each time so it is
       * not always the left. */
      let found = -1;
      let foundScore = -Infinity;
      for (let m = 0; m < 8; m += 1) {
        const ca = ROUND8[(start + m) % 8][0];
        const sa = ROUND8[(start + m) % 8][1];
        const cx = dx * cr + (sx * ca + ux * sa) * sr;
        const cy = dy * cr + (0 * ca + uy * sa) * sr;
        const cz = dz * cr + (sz * ca + uz * sa) * sr;
        let score = -Math.abs(sa) * 0.3 + updown * cy;
        if (cy < -0.5 && y - floor < 5 * k) score -= 2;
        if (score <= foundScore) continue;
        if (w.blocked(x, y, z, x + cx * reach, y + cy * reach, z + cz * reach) < 0) {
          found = m;
          foundScore = score;
          this.avoidX[i] = cx;
          this.avoidY[i] = cy;
          this.avoidZ[i] = cz;
          /* A level clear way is as good as it gets. */
          if (Math.abs(sa) < 0.1 && updown === 0) break;
        }
      }
      if (found >= 0) {
        this.avoidUntil[i] = now + 250;
        this.avoidSlow[i] = r === 0 ? 1 : (r === 1 ? 0.75 : 0.45);
        /* What it is heading into decides how hard it brakes: no faster
         * than it could stop in the room it has. */
        if (along >= 0) {
          const room = Math.max(0.5 * k, along * reach - 1.5 * k);
          const stop = Math.sqrt(2 * sk.thrust * G * k * room);
          this.avoidSlow[i] = Math.min(this.avoidSlow[i], stop / Math.max(dm, 1e-6));
        }
        const s = Math.max(dm * this.avoidSlow[i], vmax * 0.2);
        want.vx = this.avoidX[i] * s;
        want.vy = this.avoidY[i] * s;
        want.vz = this.avoidZ[i] * s;
        return;
      }
    }
    /* Boxed in: stop, and up. */
    this.avoidX[i] = -dx * 0.3;
    this.avoidY[i] = 0.95;
    this.avoidZ[i] = -dz * 0.3;
    this.avoidUntil[i] = now + 300;
    this.avoidSlow[i] = 0.3;
    want.vx = this.avoidX[i] * vmax * 0.3;
    want.vy = this.avoidY[i] * vmax * 0.3;
    want.vz = this.avoidZ[i] * vmax * 0.3;
  }

  /* Keep dodging the way it chose. */
  hold(i, dm, vmax, want) {
    const s = Math.max(dm * this.avoidSlow[i], vmax * 0.15);
    want.vx = this.avoidX[i] * s;
    want.vy = this.avoidY[i] * s;
    want.vz = this.avoidZ[i] * s;
  }

  /* Whiskers: a quarter of a second ahead where it is going, and a
   * little to each side and over and under it, so a corner it would pass
   * too close to counts as in the way. Five reads of the grid. */
  whiskers(i, speed) {
    const g = this.g;
    const w = g.world;
    if (!w.inside || speed < 1e-6) {
      return false;
    }
    const k = w.k;
    const vx = g.vx[i] / speed;
    const vy = g.vy[i] / speed;
    const vz = g.vz[i] / speed;
    const t = speed * 0.25 + 1 * k;
    const cx = g.x[i] + vx * t;
    const cy = g.y[i] + vy * t;
    const cz = g.z[i] + vz * t;
    let sx = -vz;
    let sz = vx;
    const sm = Math.sqrt(sx * sx + sz * sz);
    if (sm < 1e-6) {
      sx = 1; sz = 0;
    } else {
      sx /= sm; sz /= sm;
    }
    const r = 1.2 * k;
    return w.inside(cx, cy, cz) || w.inside(cx + sx * r, cy, cz + sz * r) || w.inside(cx - sx * r, cy, cz - sz * r)
      || w.inside(cx, cy + r, cz) || w.inside(cx, cy - r * 0.6, cz);
  }
}

/* Keep the four nearest of a list (pairs of index and squared distance
 * in `near`, `found` long): append while there is room, else put n in
 * place of the farthest if it is nearer. Returns the new length. */
function keepNearest(near, found, n, d) {
  if (found < 4) {
    near[found * 2] = n;
    near[found * 2 + 1] = d;
    return found + 1;
  }
  let far = 0;
  for (let m = 1; m < 4; m += 1) {
    if (near[m * 2 + 1] > near[far * 2 + 1]) far = m;
  }
  if (d < near[far * 2 + 1]) {
    near[far * 2] = n;
    near[far * 2 + 1] = d;
  }
  return 4;
}

/* Turn unit vector v (three numbers) toward (dx, dy, dz) by at most
 * `step` radians, by adding the perpendicular and renormalising: a square
 * root, never a sine. Straight behind, any perpendicular, the world's up
 * first. */
function turn3(v, dx, dy, dz, step) {
  let m = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (m < 1e-12) {
    return;
  }
  dx /= m; dy /= m; dz /= m;
  const fx = v[0];
  const fy = v[1];
  const fz = v[2];
  const dot = fx * dx + fy * dy + fz * dz;
  if (dot >= 1 - step * step * 0.5) {
    v[0] = dx; v[1] = dy; v[2] = dz;
    return;
  }
  let px = dx - fx * dot;
  let py = dy - fy * dot;
  let pz = dz - fz * dot;
  m = Math.sqrt(px * px + py * py + pz * pz);
  if (m < 1e-9) {
    px = -fy * fx;
    py = 1 - fy * fy;
    pz = -fy * fz;
    m = Math.sqrt(px * px + py * py + pz * pz);
    if (m < 1e-9) {
      px = 1; py = 0; pz = 0; m = 1;
    }
  }
  /* Past ninety degrees a step of `step` along the perpendicular is less
   * than `step` of arc; that is fine, it only has to be steady. */
  const s = step / m;
  let nx = fx + px * s;
  let ny = fy + py * s;
  let nz = fz + pz * s;
  const n = Math.sqrt(nx * nx + ny * ny + nz * nz);
  nx /= n; ny /= n; nz /= n;
  v[0] = nx; v[1] = ny; v[2] = nz;
}
