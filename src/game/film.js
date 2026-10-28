/*
 * film.js: the camera judge of Drift Matsuri (src/maps/drift/), the
 * owner's ask of 28 October 2026, "a mini game map where goal is to film
 * drift races". Pure: no Three.js, no DOM, no clock of its own, no JS
 * trigonometry, and nothing allocated on a step, so it runs in Node against
 * scripted flights (scripts/drift-check.js) and the same feed gives the
 * same take to the bit.
 *
 * WHAT A GOOD SHOT IS, from how the FPV pilots who fly Formula Drift and
 * D1 for broadcast work: a few metres off the cars, in the smoke, the car
 * in the middle of the picture, the camera moving like it is on a crane
 * and not like it is on a quad, and both cars of a battle in the shot when
 * they are close. So every feed, the craft's camera is checked against
 * every car, and what scores is geometry, the same for everybody:
 *
 *   FRAME    where the car is in the picture: the middle is worth all of
 *            it, the edge little, out of the picture nothing. Measured
 *            through the pilot's own lens, the field of view and the
 *            screen's shape they fly with, from the camera tilted up as
 *            they set it.
 *   CLOSE    how far the camera is from the car: two and a half to nine
 *            metres is the shot, nearer is too close to read, further
 *            fades to nothing at FAR.
 *   SMOOTH   how steady the camera is: the change in the craft's rotation
 *            rate over a fraction of a second, and the rate itself. A
 *            stick that twitches or a flip through the shot costs it.
 *   TANDEM   all of a group in the shot at once, the lead and the chase
 *            car or the whole train: worth half again, the train more.
 *   ZONE     the car in a clipping zone or at a clipping point (the circles
 *            src/maps/drift/circuit.js gives): worth half again, because
 *            that is where the judges are looking.
 *
 * The best car in the picture is the SUBJECT, and the shot is scored on it,
 * BASE points a second at its best, for a TAKE of TAKE_MS from the first
 * feed in the air. A crash ends the take early and keeps what was filmed.
 * Things worth a callout are events: ACTION at the start, a MONEY SHOT (a
 * tandem in a zone, framed and steady for MONEY_HOLD_MS), THROUGH THE SMOKE
 * (low behind a sliding car), LOST (the shot gone for LOST_MS after holding
 * one), and the CUT at the end with the take's card.
 *
 * WHAT THE SHELL FEEDS IT, every FILM_EVERY steps of the lap clock in the
 * air, from the same poses the chase is fed (src/main.js trafficStep):
 *
 *   film.setLens(tanHalf, aspect)    the camera's vertical half angle's
 *                                    tangent and the screen's shape, once a
 *                                    frame (cheap) or when they change
 *   film.setCars(cars)               [{ slot, group, height, label }]: which
 *                                    mover slot is which drift car, and
 *                                    which group it runs in
 *   film.setGroups(groups)           [{ name, size }]
 *   film.setZones(zones)             [{ name, x, z, r }], world metres
 *   film.step(step, cam, poses, crashed)
 *                                    step: the lap clock, whole ms
 *                                    cam: { x, y, z, fx, fy, fz, ux, uy, uz,
 *                                      rx, ry, rz, p, q, r }: the camera's
 *                                      place, its forward, up and right in
 *                                      the world, and the craft's body rates
 *                                      in rad/s
 *                                    poses: readVehicles' array at `step`
 *                                    crashed: the shell called a crash since
 *                                      the last feed
 *   film.view()                      the live shot, one object reused
 *   film.drainEvents()               what happened since the last drain,
 *                                    or null
 *   film.reset()                     a new run
 *
 * A step that goes backwards is a new run. A feed more than GAP_MS after
 * the last (the craft sat landed while the clock ran) scores nothing over
 * the gap.
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

export const FILM_EVERY = 8;
export const TAKE_MS = 60000;
export const GAP_MS = 250;

/* Points a second for the best shot there is of one car. */
export const BASE = 100;

/* The picture: a car nearer the lens than NEAR_PLANE is not in it. */
const NEAR_PLANE = 0.5;

/* CLOSE, metres: the shot is SWEET_NEAR to SWEET_FAR, fading to TOO_NEAR
 * on the near side and to FAR on the far one. */
export const TOO_NEAR = 1.0;
export const SWEET_NEAR = 2.5;
export const SWEET_FAR = 9;
export const FAR = 32;

/* SMOOTH: the change in body rate, rad/s each second, averaged over about
 * SMOOTH_TAU_MS, is free up to JERK_OK and worth nothing at JERK_BAD; and
 * the rate itself, rad/s, free to RATE_OK and nothing at RATE_BAD (a flip
 * through the shot). */
const SMOOTH_TAU_MS = 300;
export const JERK_OK = 20;
export const JERK_BAD = 160;
export const RATE_OK = 3;
export const RATE_BAD = 9;

/* What a group in the shot is worth, by how many of it: two, three. */
const TANDEM = [1, 1, 1.5, 1.8];
const ZONE = 1.5;

/* The money shot: a tandem in a zone, framed (FRAME times CLOSE at least
 * MONEY_SHOT) and steady (SMOOTH at least MONEY_STEADY), held this long. */
export const MONEY_HOLD_MS = 600;
const MONEY_SHOT = 0.5;
const MONEY_STEADY = 0.5;
export const MONEY_POINTS = 250;

/* Through the smoke: within SMOKE_BACK behind a car that slides past
 * SMOKE_SLIP radians, within SMOKE_SIDE of its line and under SMOKE_HIGH
 * over the road. Once every SMOKE_COOL_MS. */
const SMOKE_BACK = 4;
const SMOKE_SIDE = 2.2;
const SMOKE_HIGH = 2.6;
const SMOKE_SLIP = 0.15;
const SMOKE_COOL_MS = 4000;
export const SMOKE_POINTS = 150;

/* The shot lost: nothing in the picture for LOST_MS after holding a
 * subject for at least LOST_AFTER_MS. */
const LOST_MS = 1500;
const LOST_AFTER_MS = 2000;

/* The grade on the card, by score. */
export const GRADES = [
  { at: 7000, grade: 'S' },
  { at: 5000, grade: 'A' },
  { at: 3000, grade: 'B' },
  { at: 1500, grade: 'C' },
  { at: 0, grade: 'D' },
];
export function gradeOf(score) {
  for (const g of GRADES) {
    if (score >= g.at) {
      return g.grade;
    }
  }
  return 'D';
}

const clamp01 = (v) => (v < 0 ? 0 : (v > 1 ? 1 : v));

/* How close is worth, by distance. */
export function closeness(d) {
  if (d < TOO_NEAR) {
    return 0.3;
  }
  if (d < SWEET_NEAR) {
    return 0.3 + 0.7 * (d - TOO_NEAR) / (SWEET_NEAR - TOO_NEAR);
  }
  if (d <= SWEET_FAR) {
    return 1;
  }
  return clamp01(1 - (d - SWEET_FAR) / (FAR - SWEET_FAR));
}

/* Where in the picture is worth, by the car's place on the screen, -1 to 1
 * each way. */
export function framing(sx, sy) {
  return clamp01(1 - 0.6 * (sx * sx + sy * sy));
}

export class Film {
  constructor() {
    this.tanHalf = 0.7;
    this.aspect = 16 / 9;
    this.cars = [];
    this.groups = [];
    this.zones = [];
    /* Scratch, sized to the groups when they come. */
    this.seen = new Int32Array(8);
    this.live = {
      on: false, running: false, done: false, timeMs: 0, score: 0,
      subject: '', frame: 0, close: 0, smooth: 1, tandem: 0, zone: '', onShotMs: 0, grade: 'D',
      sx: 0, sy: 0,
    };
    this.events = [];
    this.reset();
  }

  setLens(tanHalf, aspect) {
    if (tanHalf > 0) {
      this.tanHalf = tanHalf;
    }
    if (aspect > 0) {
      this.aspect = aspect;
    }
  }

  setCars(cars) {
    this.cars = cars.map((c) => ({ slot: c.slot, group: c.group, height: c.height || 1.3, label: c.label || '' }));
  }

  setGroups(groups) {
    this.groups = groups.map((g) => ({ name: g.name, size: g.size }));
    this.seen = new Int32Array(Math.max(1, this.groups.length));
  }

  setZones(zones) {
    this.zones = zones.map((z) => ({ name: z.name, x: z.x, z: z.z, r2: z.r * z.r }));
  }

  reset() {
    this.lastStep = -1;
    this.startStep = -1;
    this.running = false;
    this.done = false;
    this.score = 0;
    this.prevP = 0;
    this.prevQ = 0;
    this.prevR = 0;
    this.haveRate = false;
    this.jerk = 0;
    this.frameMs = 0;
    this.frameSum = 0;
    this.closeSum = 0;
    this.smoothSum = 0;
    this.flownMs = 0;
    this.tandemMs = 0;
    this.money = 0;
    this.smoke = 0;
    this.moneyHold = 0;
    this.moneyZone = -1;
    this.smokeAt = -1e9;
    this.onShot = 0;
    this.offShot = 0;
    this.lostCalled = false;
    this.summary = null;
    this.events.length = 0;
    const v = this.live;
    if (v) {
      v.on = false;
      v.running = false;
      v.done = false;
      v.timeMs = 0;
      v.score = 0;
      v.subject = '';
      v.frame = 0;
      v.close = 0;
      v.smooth = 1;
      v.tandem = 0;
      v.zone = '';
      v.onShotMs = 0;
      v.grade = 'D';
    }
  }

  step(step, cam, poses, crashed) {
    if (step < this.lastStep) {
      this.reset();
    }
    if (this.done) {
      this.lastStep = step;
      return;
    }
    if (!this.running) {
      this.running = true;
      this.startStep = step;
      this.lastStep = step;
      this.events.push({ type: 'action', step });
      return;
    }
    let dt = step - this.lastStep;
    this.lastStep = step;
    if (dt <= 0) {
      return;
    }
    const gap = dt > GAP_MS;
    if (gap) {
      dt = 0;
      this.haveRate = false;
    }

    /* SMOOTH, from the body rates. */
    const p = cam.p;
    const q = cam.q;
    const r = cam.r;
    const rate = Math.sqrt(p * p + q * q + r * r);
    if (this.haveRate && dt > 0) {
      const dp = p - this.prevP;
      const dq = q - this.prevQ;
      const dr = r - this.prevR;
      const jerk = Math.sqrt(dp * dp + dq * dq + dr * dr) * 1000 / dt;
      const k = dt >= SMOOTH_TAU_MS ? 1 : dt / SMOOTH_TAU_MS;
      this.jerk += (jerk - this.jerk) * k;
    }
    this.haveRate = true;
    this.prevP = p;
    this.prevQ = q;
    this.prevR = r;
    const smooth = clamp01(1 - (this.jerk - JERK_OK) / (JERK_BAD - JERK_OK))
      * clamp01(1 - (rate - RATE_OK) / (RATE_BAD - RATE_OK));

    /* Every car through the lens. */
    const seen = this.seen;
    seen.fill(0);
    let best = -1;
    let bestV = 0;
    let bestF = 0;
    let bestC = 0;
    let bestSx = 0;
    let bestSy = 0;
    const th = this.tanHalf;
    const tw = this.tanHalf * this.aspect;
    let smokeHit = false;
    for (let i = 0; i < this.cars.length; i += 1) {
      const c = this.cars[i];
      const pose = poses[c.slot];
      if (!pose || !pose.on) {
        continue;
      }
      const dx = pose.x - cam.x;
      const dy = pose.y + c.height * 0.5 - cam.y;
      const dz = pose.z - cam.z;
      /* Through the smoke: behind it on its line, low, while it slides. */
      if (!smokeHit && (pose.slip > SMOKE_SLIP || pose.slip < -SMOKE_SLIP)) {
        const along = -(dx * pose.hx + dz * pose.hz);
        const side = -dx * pose.hz + dz * pose.hx;
        if (along < -1 && along > -SMOKE_BACK - 2 && side < SMOKE_SIDE && side > -SMOKE_SIDE && cam.y - pose.y < SMOKE_HIGH) {
          smokeHit = true;
        }
      }
      const depth = dx * cam.fx + dy * cam.fy + dz * cam.fz;
      if (depth < NEAR_PLANE) {
        continue;
      }
      const sx = (dx * cam.rx + dy * cam.ry + dz * cam.rz) / (depth * tw);
      const sy = (dx * cam.ux + dy * cam.uy + dz * cam.uz) / (depth * th);
      if (sx <= -1 || sx >= 1 || sy <= -1 || sy >= 1) {
        continue;
      }
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > FAR) {
        continue;
      }
      seen[c.group] += 1;
      const f = framing(sx, sy);
      const cl = closeness(d);
      const v = f * cl;
      if (v > bestV) {
        best = i;
        bestV = v;
        bestF = f;
        bestC = cl;
        bestSx = sx;
        bestSy = sy;
      }
    }

    const live = this.live;
    let tandem = 0;
    let zone = -1;
    if (best >= 0) {
      const c = this.cars[best];
      const g = this.groups[c.group];
      const n = seen[c.group];
      if (g && g.size >= 2 && n >= 2) {
        tandem = n;
      }
      const pose = poses[c.slot];
      for (let k = 0; k < this.zones.length; k += 1) {
        const zz = this.zones[k];
        const ex = pose.x - zz.x;
        const ez = pose.z - zz.z;
        if (ex * ex + ez * ez < zz.r2) {
          zone = k;
          break;
        }
      }
    }
    const mult = (tandem ? TANDEM[tandem > 3 ? 3 : tandem] : 1) * (zone >= 0 ? ZONE : 1);
    const pts = best >= 0 ? BASE * bestV * (0.35 + 0.65 * smooth) * mult : 0;
    const sec = dt / 1000;
    this.score += pts * sec;
    this.flownMs += dt;
    this.smoothSum += smooth * dt;
    if (best >= 0) {
      this.frameMs += dt;
      this.frameSum += bestF * dt;
      this.closeSum += bestC * dt;
      if (tandem) {
        this.tandemMs += dt;
      }
      this.onShot += dt;
      this.offShot = 0;
      this.lostCalled = false;
    } else {
      if (this.onShot >= LOST_AFTER_MS || this.offShot > 0) {
        this.offShot += dt;
      }
      if (this.offShot >= LOST_MS && !this.lostCalled) {
        this.lostCalled = true;
        this.events.push({ type: 'lost', step });
      }
      if (this.offShot > 0 || this.onShot < LOST_AFTER_MS) {
        this.onShot = 0;
      }
    }

    /* The money shot. */
    if (tandem && zone >= 0 && bestV >= MONEY_SHOT && smooth >= MONEY_STEADY) {
      this.moneyHold += dt;
      if (this.moneyHold >= MONEY_HOLD_MS && this.moneyZone !== zone) {
        this.moneyZone = zone;
        this.money += 1;
        this.score += MONEY_POINTS;
        this.events.push({ type: 'money', step, zone: this.zones[zone].name, points: MONEY_POINTS });
      }
    } else {
      this.moneyHold = 0;
      if (zone < 0) {
        this.moneyZone = -1;
      }
    }

    /* Through the smoke. */
    if (smokeHit && step - this.smokeAt >= SMOKE_COOL_MS) {
      this.smokeAt = step;
      this.smoke += 1;
      this.score += SMOKE_POINTS;
      this.events.push({ type: 'smoke', step, points: SMOKE_POINTS });
    }

    const t = step - this.startStep;
    live.on = true;
    live.running = true;
    live.timeMs = t > TAKE_MS ? TAKE_MS : t;
    live.score = this.score;
    live.subject = best >= 0 ? (this.groups[this.cars[best].group]?.name || this.cars[best].label) : '';
    live.frame = best >= 0 ? bestF : 0;
    live.close = best >= 0 ? bestC : 0;
    live.smooth = smooth;
    live.tandem = tandem;
    live.zone = zone >= 0 ? this.zones[zone].name : '';
    live.onShotMs = this.onShot;
    live.sx = bestSx;
    live.sy = bestSy;
    live.grade = gradeOf(this.score);

    if (crashed || t >= TAKE_MS) {
      this.finish(step, crashed && t < TAKE_MS ? 'crash' : 'cut');
    }
  }

  finish(step, reason) {
    this.done = true;
    this.running = false;
    const fl = this.flownMs || 1;
    const fr = this.frameMs || 1;
    this.summary = {
      reason,
      score: Math.round(this.score),
      grade: gradeOf(this.score),
      seconds: Math.round(Math.min(TAKE_MS, step - this.startStep) / 100) / 10,
      inShot: this.frameMs / fl,
      frame: this.frameMs ? this.frameSum / fr : 0,
      close: this.frameMs ? this.closeSum / fr : 0,
      smooth: this.smoothSum / fl,
      tandemS: Math.round(this.tandemMs / 100) / 10,
      money: this.money,
      smoke: this.smoke,
    };
    const v = this.live;
    v.running = false;
    v.done = true;
    v.score = this.score;
    v.grade = this.summary.grade;
    this.events.push({ type: reason, step, summary: this.summary });
  }

  view() {
    return this.live;
  }

  drainEvents() {
    if (!this.events.length) {
      return null;
    }
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }
}
