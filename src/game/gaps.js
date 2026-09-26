/*
 * gaps.js: the named gaps, flown. FREESTYLE-MAPS-PLAN.md section 7 item 2,
 * Stage C. Pure: no Three.js, no DOM, no clock of its own and no JS
 * trigonometry on a step, and nothing allocated on a step, so it runs in
 * Node against a map's real placement (scripts/counter-check.js) and the
 * same step stream gives the same crossings to the bit.
 *
 * WHAT A NAMED GAP IS. An author's window in the air, the way a skate game
 * names one: a rectangle with a name and a points tier (100, 250, 500, 1000
 * or 2500, src/props/types.js GAP_POINTS). Nothing solid and nothing drawn.
 * The town has none; a built map has what its author placed.
 *
 * WHERE IT IS. This file converts nothing from the document. The gaps come
 * from src/maps/built/place.js placeDocument, whose `zones` are every gap
 * element already through docToWorld, the one conversion every element and
 * every road point goes through, so a gap cannot be placed in a different
 * frame from the crane it is under. A zone's x, y, z is the middle of the
 * window's SILL in the world (y is the sill's height, the element's
 * position.z), and its yaw is the window's NORMAL, the way an aperture's
 * is (see starter.js's comment on the gaps and src/trackbuilder/schema.md,
 * "Named gaps"): the window is `w` across that normal and `h` up from the
 * sill. A document yaw turns into the world as Object3D.rotation.y does, so
 * the normal is (cos yaw, 0, -sin yaw) and the across axis (-sin yaw, 0,
 * -cos yaw). The sine and cosine are src/props/trig.js's, taken once when
 * the map's gaps are set, never on a step.
 *
 * WHAT FLYING IT MEANS. The craft's path from one physics step to the next,
 * its centre of gravity at the step before and at this one, crosses the
 * window: the segment goes from one side of the window's plane to the other
 * (either way) and the point where it meets the plane is inside the
 * rectangle. A swept test, the same kind src/game/race.js makes for a gate
 * opening, so it is decided by arithmetic on the step stream and never by a
 * sample that could fall either side of a thin window. A named gap has no
 * frame to clip, so there is no depth either side of the plane and no
 * margin inside the edges: the window is where the author drew it.
 *
 * DITHERING DOES NOT FARM IT. After a crossing the gap is disarmed until the
 * craft's centre has been GAP_REARM_M from the window (the rectangle, not
 * its infinite plane). Hovering in the window and rocking back and forth
 * across its plane scores the first crossing and nothing after it; flying
 * away and coming back through scores again, as the same gap flown again
 * (the counter prices a repeat, src/game/score.js).
 *
 * NEVER PAYS FOR A CRASH (section 14). A crossing waits GAP_CONFIRM_MS clean,
 * and then chase.js's REPORT_LAG_MS for the shell to say whether it crashed
 * (it decides a crash at the end of a frame, up to 100 steps late), before
 * it is handed on. A crash told through bail() inside that time loses it.
 * After that it is in the counter's open combo, and a crash there loses it
 * with the rest of the combo.
 *
 * THE SHELL'S SIDE:
 *
 *   gaps.setGaps(namedGaps(zones))   when a map is placed; [] for none
 *   gaps.step(step, x, y, z)         every physics step, the lap clock in
 *                                    whole 1 ms steps and the craft's CG in
 *                                    the world after that step
 *   gaps.cut()                       the craft was put somewhere (a reset,
 *                                    a set down): the next step starts a
 *                                    new path rather than sweeping the jump
 *   gaps.bail(step)                  the shell called a crash
 *   gaps.events                      the crossings that paid, oldest first:
 *                                    { kind: 'gap', name, tier, index, dir,
 *                                    step, paidStep }. The shell reads and
 *                                    empties it (events.length = 0), so
 *                                    nothing is allocated to drain it
 *   gaps.reset()                     a new run
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

import { sincos } from '../props/trig.js';
import { REPORT_LAG_MS } from './chase.js';

/* The physics runs at 1 kHz: a step is a millisecond. */
const STEP_MS = 1;

/*
 * How far the craft's centre has to get from a window it has just flown
 * before that window scores again, in metres. Two metres is about ten hull
 * widths and a tenth of a second at freestyle speed: nothing a pilot
 * rocking in the window does reaches it, and any line that leaves and comes
 * back through does.
 */
export const GAP_REARM_M = 2;

/*
 * How long a crossing waits clean before it is handed to the counter, in
 * ms, before the report lag on top. A quarter of a second is the line
 * through the gap and out the other side of the thing it is cut in: a
 * pilot who clips the container tunnel's far end on the way out has
 * crashed in the gap, not after it.
 */
export const GAP_CONFIRM_MS = 250;

/* A step further than this from the last is a gap in the stepping (the lap
 * clock ran on with the craft landed, or a new run), not one step of
 * travel: nothing is swept across it. */
export const GAP_STEP_MAX = 250;

/* A segment longer than this in one step is a craft that was put
 * somewhere, not flown there: 1000 m/s. Nothing is swept along it. */
const JUMP_M = 1;

/* At most this many crossings wait out their window at once. The re-arm
 * distance keeps it to one a gap in practice. */
const PEND_MAX = 16;

/*
 * The named gaps of a map as world rectangles, from placeDocument's
 * `zones`. Allocates, once a map. A zone whose numbers are not a window (a
 * size that is not positive, a place that is not a number) is left out
 * rather than guessed at.
 *
 * Each rectangle: { name, tier, x, y, z, nx, nz, ax, az, hw, h }: the sill's
 * middle, the unit normal and across axis in plan (both level: a gap stands
 * upright), half its width and its height.
 */
export function namedGaps(zones) {
  const out = [];
  const sc = { s: 0, c: 1 };
  for (const z of zones || []) {
    if (!z) {
      continue;
    }
    const w = Number(z.w);
    const h = Number(z.h);
    const x = Number(z.x);
    const y = Number(z.y);
    const zz = Number(z.z);
    if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h)
      && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(zz))) {
      continue;
    }
    sincos(Number(z.yaw) || 0, sc);
    out.push({
      name: String(z.name || 'GAP'),
      tier: Number(z.points) > 0 ? Number(z.points) : 0,
      x,
      y,
      z: zz,
      nx: sc.c,
      nz: -sc.s,
      ax: -sc.s,
      az: -sc.c,
      hw: w / 2,
      h,
    });
  }
  return out;
}

export class NamedGapCounter {
  constructor() {
    this.setGaps([]);
  }

  /* The map's gaps, from namedGaps. Replaces what was there and starts the
   * run over. */
  setGaps(rects) {
    const list = Array.isArray(rects) ? rects : [];
    const n = list.length;
    this.n = n;
    this.rects = list.slice();
    this.gx = new Float64Array(n);
    this.gy = new Float64Array(n);
    this.gz = new Float64Array(n);
    this.gnx = new Float64Array(n);
    this.gnz = new Float64Array(n);
    this.gax = new Float64Array(n);
    this.gaz = new Float64Array(n);
    this.ghw = new Float64Array(n);
    this.gh = new Float64Array(n);
    this.armed = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      const r = list[i];
      this.gx[i] = r.x;
      this.gy[i] = r.y;
      this.gz[i] = r.z;
      this.gnx[i] = r.nx;
      this.gnz[i] = r.nz;
      this.gax[i] = r.ax;
      this.gaz[i] = r.az;
      this.ghw[i] = r.hw;
      this.gh[i] = r.h;
    }
    this.pIndex = new Int32Array(PEND_MAX);
    this.pDir = new Int8Array(PEND_MAX);
    this.pFrom = new Float64Array(PEND_MAX);
    this.pDue = new Float64Array(PEND_MAX);
    this.pOn = new Uint8Array(PEND_MAX);
    this.events = [];
    this.reset();
  }

  /* How many gaps this map has. */
  count() {
    return this.n;
  }

  /* A new run: nothing waiting, nothing queued, every gap armed. */
  reset() {
    this.armed.fill(1);
    this.pOn.fill(0);
    this.events.length = 0;
    this.fed = false;
    this.lastStep = 0;
    this.px = 0;
    this.py = 0;
    this.pz = 0;
    /* Crossings flown this run, for the harness. */
    this.crossings = 0;
  }

  /* The craft was put somewhere: the next step begins a new path. What is
   * waiting keeps waiting, and the arming is kept, so a set down in a
   * window does not make that window score. */
  cut() {
    this.fed = false;
  }

  /*
   * One physics step. See the header. Returns nothing; the paying crossings
   * go onto `events`.
   */
  step(step, x, y, z) {
    if (!(step >= 0 || step < 0) || !(x < Infinity && x > -Infinity)
      || !(y < Infinity && y > -Infinity) || !(z < Infinity && z > -Infinity)) {
      return;
    }
    if (this.fed && step < this.lastStep) {
      /* The clock went back: a new run, as a seek is. */
      this.pOn.fill(0);
      this.armed.fill(1);
      this.fed = false;
    }
    const swept = this.fed && step > this.lastStep && step - this.lastStep <= GAP_STEP_MAX;
    const ax = this.px;
    const ay = this.py;
    const az = this.pz;
    this.px = x;
    this.py = y;
    this.pz = z;
    this.lastStep = step;
    this.fed = true;
    if (this.n === 0) {
      return;
    }
    const dx = x - ax;
    const dy = y - ay;
    const dz = z - az;
    const jump = dx * dx + dy * dy + dz * dz > JUMP_M * JUMP_M;
    for (let i = 0; i < this.n; i += 1) {
      const sx = this.gx[i];
      const sy = this.gy[i];
      const sz = this.gz[i];
      const nx = this.gnx[i];
      const nz = this.gnz[i];
      const cx = this.gax[i];
      const cz = this.gaz[i];
      const hw = this.ghw[i];
      const h = this.gh[i];
      /* The signed distance of this step's end from the window's plane,
       * and where on the window's own axes it is. */
      const d1 = (x - sx) * nx + (z - sz) * nz;
      if (!this.armed[i]) {
        const u = (x - sx) * cx + (z - sz) * cz;
        const v = y - sy;
        const du = u < -hw ? u + hw : (u > hw ? u - hw : 0);
        const dv = v < 0 ? v : (v > h ? v - h : 0);
        if (d1 * d1 + du * du + dv * dv > GAP_REARM_M * GAP_REARM_M) {
          this.armed[i] = 1;
        }
        continue;
      }
      if (!swept || jump) {
        continue;
      }
      const d0 = (ax - sx) * nx + (az - sz) * nz;
      if (!((d0 < 0 && d1 >= 0) || (d0 > 0 && d1 <= 0))) {
        continue;
      }
      /* Where the step met the plane: a straight share of the way. */
      const t = d0 / (d0 - d1);
      const mx = ax + t * dx;
      const my = ay + t * dy;
      const mz = az + t * dz;
      const u = (mx - sx) * cx + (mz - sz) * cz;
      const v = my - sy;
      if (!(u >= -hw && u <= hw && v >= 0 && v <= h)) {
        continue;
      }
      this.armed[i] = 0;
      this.crossings += 1;
      this.pend(i, d1 > d0 ? 1 : -1, step);
    }
    this.settle(step);
  }

  pend(i, dir, step) {
    for (let k = 0; k < PEND_MAX; k += 1) {
      if (!this.pOn[k]) {
        this.pOn[k] = 1;
        this.pIndex[k] = i;
        this.pDir[k] = dir;
        this.pFrom[k] = step;
        this.pDue[k] = step + GAP_CONFIRM_MS / STEP_MS;
        return;
      }
    }
  }

  /* Hand on what has waited out its window and the report lag clean,
   * oldest first. */
  settle(step) {
    for (;;) {
      let pick = -1;
      for (let k = 0; k < PEND_MAX; k += 1) {
        if (this.pOn[k] && step >= this.pDue[k] + REPORT_LAG_MS / STEP_MS
          && (pick < 0 || this.pFrom[k] < this.pFrom[pick])) {
          pick = k;
        }
      }
      if (pick < 0) {
        return;
      }
      const r = this.rects[this.pIndex[pick]];
      this.events.push({
        kind: 'gap',
        name: r.name,
        tier: r.tier,
        index: this.pIndex[pick],
        dir: this.pDir[pick],
        step: this.pFrom[pick],
        paidStep: step,
      });
      this.pOn[pick] = 0;
    }
  }

  /*
   * A crash at `atStep`, or up to REPORT_LAG_MS before it: every crossing
   * whose window reached that far back is lost. Nothing is queued for a
   * lost one; the counter's bail says what the crash cost.
   */
  bail(atStep) {
    const since = atStep - REPORT_LAG_MS / STEP_MS;
    for (let k = 0; k < PEND_MAX; k += 1) {
      if (this.pOn[k] && this.pFrom[k] <= atStep && this.pDue[k] >= since) {
        this.pOn[k] = 0;
      }
    }
  }

  /* How many crossings are waiting, for the harness. */
  waiting() {
    let n = 0;
    for (let k = 0; k < PEND_MAX; k += 1) {
      n += this.pOn[k];
    }
    return n;
  }
}
