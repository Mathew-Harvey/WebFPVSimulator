/*
 * counterrun.js: a craft on a scripted path, fed to the counter the way the
 * shell feeds it. Shared by scripts/score-selftest.js (synthetic solids) and
 * scripts/counter-check.js (Hibari Yard's and the town's real ones), so the
 * two check the same feed rather than two copies of it.
 *
 * THE ORDER IS src/main.js's. Every physics step: the craft's CG to the
 * named gaps (src/game/gaps.js), and every CC_EVERY steps of the clock the
 * close calls (src/game/closecall.js) with the hard contact flag since the
 * last feed; whatever either has settled goes into the counter at once, in
 * step order, and a held skim holds the combo open. Then, at the end of
 * each frame (FRAME_STEPS steps), a crash the shell would call is told to
 * all three, and the counter is ticked with the clock.
 *
 * A CRASH TWIN is a path that runs into something. `crashOnContact` stops
 * the craft dead at the first step its centre is within CONTACT_M of a
 * solid (the hull in it), which is a velocity change of its whole speed in
 * one step, so the close calls see it as a hard contact at their next feed,
 * as they would the real one; and the shell calls the crash at the end of
 * that frame, as main.js does for a solid crash. `crashAtStep` calls one at
 * a given step without touching anything, for a crash somewhere else.
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

import { Counter } from '../../src/game/score.js';
import { NamedGapCounter } from '../../src/game/gaps.js';
import { CloseCalls, CC_EVERY, CC_HARD_DV } from '../../src/game/closecall.js';
import { CRAFT_WORLD_R } from '../../src/game/collide.js';

/* A frame of the shell at 60 Hz, in steps: 16 or 17, taken as 16. */
export const FRAME_STEPS = 16;

/* The hull in a solid: the centre this near one, metres. */
export const CONTACT_M = 0.8 * CRAFT_WORLD_R;

/*
 * A path through points at constant speeds: legs [{ to: [x, y, z], speed }]
 * from `from`, then holding the last point. Returns at(step) -> the craft
 * { x, y, z, vx, vy, vz } at that step (steps from 0, a millisecond each)
 * and `steps`, how many the legs take.
 */
export function polyline(from, legs) {
  const pts = [from.slice()];
  const segs = [];
  let t = 0;
  let a = from;
  for (const leg of legs) {
    const b = leg.to;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ms = len > 0 ? (len / leg.speed) * 1000 : 0;
    segs.push({
      a, dx, dy, dz, len, t0: t, t1: t + ms, vx: ms > 0 ? dx / (ms / 1000) : 0, vy: ms > 0 ? dy / (ms / 1000) : 0, vz: ms > 0 ? dz / (ms / 1000) : 0,
    });
    t += ms;
    a = b;
    pts.push(b.slice());
  }
  const out = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  };
  const at = (step) => {
    for (const s of segs) {
      if (step <= s.t1) {
        const u = s.t1 > s.t0 ? (step - s.t0) / (s.t1 - s.t0) : 1;
        out.x = s.a[0] + s.dx * u;
        out.y = s.a[1] + s.dy * u;
        out.z = s.a[2] + s.dz * u;
        out.vx = s.vx;
        out.vy = s.vy;
        out.vz = s.vz;
        return out;
      }
    }
    const last = pts[pts.length - 1];
    out.x = last[0];
    out.y = last[1];
    out.z = last[2];
    out.vx = 0;
    out.vy = 0;
    out.vz = 0;
    return out;
  };
  return { at, steps: Math.ceil(t) };
}

/*
 * Fly one path. Options:
 *   colliders        the map's Colliders (gapAt is all the close calls ask)
 *   gaps             namedGaps(...) rectangles, or none
 *   path             polyline(...)
 *   groundY          the ground under the craft, a number or (x, z) => y
 *   afterMs          how long to keep ticking once the path ends, so what is
 *                    waiting can pay (default 4000: past any window)
 *   crashOnContact   stop dead in the first solid, and have the shell call
 *                    the crash at the end of that frame
 *   crashAtStep      the shell calls a crash at the end of the frame holding
 *                    this step
 *   counter          a Counter to feed (a fresh one, timed off, otherwise)
 *   holds            extra held skims, [[fromStep, toStep]], for a check
 *                    that wants a hold without a wall
 *
 * Returns { counter, events, ccEvents, gapEvents, crashedAt, cc, gapsRun,
 * feeds, ms } with every counter event drained over the run, every close
 * call and gap event as its module queued it (lost ones included), and
 * the feed count and wall time of the close call feeds.
 */
export function flyCounter(o) {
  const counter = o.counter || new Counter({ timed: false, tricks: true });
  const cc = new CloseCalls(o.colliders);
  const gapsRun = new NamedGapCounter();
  gapsRun.setGaps(o.gaps || []);
  const ground = typeof o.groundY === 'function' ? o.groundY : () => (o.groundY ?? 0);
  const total = o.path.steps + (o.afterMs ?? 4000);
  const events = [];
  const ccEvents = [];
  const gapEvents = [];
  const craft = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  };
  let frozen = null;
  let crashedAt = -1;
  let crashTold = false;
  let hard = false;
  let pvx = 0;
  let pvy = 0;
  let pvz = 0;
  let feeds = 0;
  let ms = 0;
  for (let s = 1; s <= total; s += 1) {
    const p = o.path.at(s);
    if (frozen) {
      craft.vx = 0;
      craft.vy = 0;
      craft.vz = 0;
    } else {
      craft.x = p.x;
      craft.y = p.y;
      craft.z = p.z;
      craft.vx = p.vx;
      craft.vy = p.vy;
      craft.vz = p.vz;
      if (o.crashOnContact && o.colliders
        && o.colliders.gapAt(craft.x, craft.y, craft.z, CONTACT_M) < CONTACT_M) {
        frozen = s;
        crashedAt = s;
        craft.vx = 0;
        craft.vy = 0;
        craft.vz = 0;
      }
    }
    /* The shell's STOP measure, one step's velocity change, at the stop.
     * A polyline's own corners turn in one step, which no craft can, so
     * they are not asked: only the stop in the solid is a contact. */
    if (frozen === s) {
      const dvx = craft.vx - pvx;
      const dvy = craft.vy - pvy;
      const dvz = craft.vz - pvz;
      if (dvx * dvx + dvy * dvy + dvz * dvz >= CC_HARD_DV * CC_HARD_DV) {
        hard = true;
      }
    }
    pvx = craft.vx;
    pvy = craft.vy;
    pvz = craft.vz;
    gapsRun.step(s, craft.x, craft.y, craft.z);
    for (const e of gapsRun.events) {
      gapEvents.push(e);
      counter.gap(e.name, e.tier, e.paidStep, e.index);
    }
    gapsRun.events.length = 0;
    if (s % CC_EVERY === 0) {
      const t0 = performance.now();
      cc.step(s, craft, ground(craft.x, craft.z), hard, false);
      ms += performance.now() - t0;
      feeds += 1;
      hard = false;
      for (const e of cc.events) {
        ccEvents.push(e);
        if (e.value > 0 && e.kind !== 'lost') {
          counter.closeCall(e);
        }
      }
      cc.events.length = 0;
      if (cc.skimHeld()) {
        counter.hold(s);
      }
      if (o.holds) {
        for (const [a, b] of o.holds) {
          if (s >= a && s <= b) {
            counter.hold(s);
          }
        }
      }
      counter.setSkim(cc.live.skim, cc.live.holdMs, cc.live.clearance);
    }
    if (s % FRAME_STEPS === 0) {
      const wantCrash = (crashedAt > 0 && !crashTold)
        || (o.crashAtStep > 0 && s >= o.crashAtStep && !crashTold);
      if (wantCrash) {
        crashTold = true;
        if (crashedAt < 0) {
          crashedAt = o.crashAtStep;
        }
        counter.crash();
        gapsRun.bail(s);
        cc.bail(s, 'crash');
        for (const e of cc.events) {
          ccEvents.push(e);
        }
        cc.events.length = 0;
      }
      cc.tick(s);
      for (const e of cc.events) {
        ccEvents.push(e);
        if (e.value > 0 && e.kind !== 'lost') {
          counter.closeCall(e);
        }
      }
      cc.events.length = 0;
      counter.tick(s);
      const drained = counter.drainEvents();
      if (drained) {
        events.push(...drained);
      }
    }
  }
  counter.tick(total + 10000);
  const drained = counter.drainEvents();
  if (drained) {
    events.push(...drained);
  }
  return {
    counter, events, ccEvents, gapEvents, crashedAt, cc, gapsRun, feeds, ms,
  };
}

/* The counter events of one kind. */
export function ofKind(events, kind) {
  return events.filter((e) => e.kind === kind);
}

/* Everything the geometry put into combos, before multipliers. */
export function geometryPoints(events) {
  let n = 0;
  for (const e of events) {
    if (e.kind !== 'trick' && e.kind !== 'bank' && e.kind !== 'bail' && e.kind !== 'finish') {
      n += e.points;
    }
  }
  return n;
}
