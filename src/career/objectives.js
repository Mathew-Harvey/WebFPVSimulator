/*
 * objectives.js: a lesson's run, judged one frame at a time.
 *
 * A lesson is data (./curriculum.js): a world, a flight mode, objectives in
 * order and medal times. createRun turns one into a run, and the shell feeds
 * the run what happened: a frame record every rendered frame while flying,
 * and the discrete moments the game already detects (a trick from
 * src/game/trickdetect.js, a named gap from src/game/gaps.js, a crash from
 * the crash judge). The run answers with where the pilot is in the lesson.
 *
 * PURE. No THREE, no DOM, no clock of its own: time is the sim clock the
 * frames carry. So the same run judges the shell and the Node flight rig, and
 * a test can drive it with made up frames.
 *
 * THE FRAME RECORD, in the world frame (./geometry.js):
 *   simMs     the sim clock, ms
 *   prev      where the craft was drawn last frame, {x,y,z}
 *   pos       where it is drawn now
 *   vel       its velocity, m/s
 *   fwd, up   its nose and top plate, unit vectors
 *   speed     |vel|
 *   height    clearance above whatever is under it, m
 *   landed    sitting on the ground (the shell's perch)
 *   gate      a race gate passed this frame (scene index), or null
 *   lap       a lap completed this frame: { ms } or null
 *   score     the freestyle counter's total so far, or 0
 *
 * OBJECTIVES run in order; each is { kind, text, hint, ...params }. The kinds
 * are documented on each judge below. A run's clock starts at the first
 * takeoff unless the lesson says clock: 'start'.
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  DEG, angleDiff, attitude, crossesDisc, docToWorld, headingOf, inZone, v3, yawDir, zoneCentre,
} from './geometry.js';

/* ---------------------------------------------------------------- *
 * Preparing a lesson: the document frame's numbers into world ones.
 * ---------------------------------------------------------------- */

function worldZone(z, W, D) {
  if (!z || z.kind === 'any' || z.kind === 'band') {
    return z ? { ...z } : { kind: 'any' };
  }
  if (z.kind === 'box') {
    const [x, y, h] = z.at;
    const [w, d, tall] = z.size;
    return { kind: 'box', c: docToWorld(W, D, x, y, h), hx: w / 2, hy: tall / 2, hz: d / 2 };
  }
  if (z.kind === 'cylinder') {
    const [x, y] = z.at;
    return { kind: 'cylinder', c: docToWorld(W, D, x, y, 0), r: z.r, y0: z.z0 ?? -1, y1: z.z1 ?? 1000 };
  }
  throw new Error(`career: unknown zone kind ${z.kind}`);
}

/* A ring: a disc the craft flies through. `yaw` is the way through it, in
 * the document frame; `pitch` tilts that way down (a dive ring) or up. */
function worldRing(r, W, D) {
  const [x, y, z] = r.at;
  const dir = yawDir(r.yaw || 0);
  const p = (r.pitch || 0) * DEG;
  const n = v3(dir.x * Math.cos(p), -Math.sin(p), dir.z * Math.cos(p));
  return { c: docToWorld(W, D, x, y, z), n, r: r.r ?? 2.5, yaw: r.yaw || 0, pitch: r.pitch || 0 };
}

export function prepareObjective(o, W, D) {
  const out = { ...o };
  if (o.zone) {
    out.zone = worldZone(o.zone, W, D);
  }
  if (o.rings) {
    out.rings = o.rings.map((r) => worldRing(r, W, D));
  }
  if (o.pad) {
    const [x, y] = o.pad.at;
    out.pad = { c: docToWorld(W, D, x, y, 0), r: o.pad.r ?? 1.5 };
  }
  if (o.pads) {
    out.pads = o.pads.map((p) => ({ c: docToWorld(W, D, p.at[0], p.at[1], 0), r: p.r ?? 1.5 }));
  }
  if (o.center) {
    out.center = docToWorld(W, D, o.center[0], o.center[1], 0);
  }
  if (o.headings) {
    out.headings = o.headings.map((h) => h * DEG);
  }
  return out;
}

/* ---------------------------------------------------------------- *
 * The judges. Each is { start(o), frame(s, o, f, ctx), trick, gap }.
 * A judge's state carries `done`, `progress` (0..1) and `detail`.
 * ---------------------------------------------------------------- */

/*
 * Which way a rotation went, by the sign src/game/trickdetect.js keeps on
 * each primitive. Pinned by tests/rig/career-rig.test.js, which flies each
 * one through the real plant and reads the sign back: a forward flip is the
 * pitch stick pushed forward, which is pitch -1 on this simulator's channels
 * (src/input/input.js: forward on a pitch stick is nose down, the negative
 * key), and it reads +1; a right roll is roll +1 and reads +1.
 */
export const DIR_SIGN = Object.freeze({
  pitch: Object.freeze({ forward: 1, back: -1 }),
  roll: Object.freeze({ right: 1, left: -1 }),
  yaw: Object.freeze({ right: 1, left: -1 }),
});

/* The first rotation of a trick, and how many turns it made on an axis. */
function firstRot(t) {
  const prims = Array.isArray(t.parts) ? t.parts : [];
  return prims.find((p) => p && p.kind === 'rot') || prims[0] || null;
}

function turnsOn(t, axis) {
  const prims = Array.isArray(t.parts) ? t.parts : [];
  let sum = 0;
  for (const p of prims) {
    if (p && p.axis === axis && Number.isFinite(p.turns)) {
      sum += Math.abs(p.turns);
    }
  }
  if (sum === 0 && t.axis === axis && Number.isFinite(t.turns)) {
    sum = Math.abs(t.turns);
  }
  return sum;
}

export function matchesNeed(n, t) {
  if (n.names && n.names.length && !n.names.includes(t.name)) {
    return false;
  }
  const first = firstRot(t);
  const axis = first ? first.axis : t.axis;
  const axes = n.axes || (n.axis ? [n.axis] : null);
  if (axes && !axes.includes(axis)) {
    return false;
  }
  if (n.minTurns != null && turnsOn(t, axis) < n.minTurns - 0.13) {
    return false;
  }
  if (n.dir) {
    const want = typeof n.dir === 'number'
      ? Math.sign(n.dir)
      : ((DIR_SIGN[axis] || {})[n.dir] ?? 0);
    if (!first || !want || Math.sign(first.dir) !== want) {
      return false;
    }
  }
  return true;
}

const near2d = (a, b, r) => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz <= r * r;
};

const JUDGES = {
  /* takeoff { minHeight = 0.5 }: off the ground and climbing. */
  takeoff: {
    start: () => ({}),
    frame(s, o, f) {
      if (!f.landed && f.height >= (o.minHeight ?? 0.5)) {
        s.done = true;
      }
      s.progress = s.done ? 1 : Math.min(0.99, Math.max(0, f.height / (o.minHeight ?? 0.5)));
    },
  },

  /*
   * hold { zone, seconds, continuous = false, maxSpeed, airborne = true }:
   * time inside a zone, optionally slow. Continuous means one unbroken
   * stretch; otherwise the time adds up.
   */
  hold: {
    start: () => ({ acc: 0 }),
    frame(s, o, f, ctx) {
      const air = !(o.airborne ?? true) || !f.landed;
      const slow = o.maxSpeed == null || f.speed <= o.maxSpeed;
      const inside = air && slow && inZone(o.zone, f.pos, f.height);
      s.inside = inside;
      if (inside) {
        s.acc += ctx.dtMs;
      } else if (o.continuous) {
        s.acc = 0;
      }
      if (!air) {
        s.detail = 'airborne';
      } else if (!inZone(o.zone, f.pos, f.height)) {
        s.detail = 'outside';
      } else if (!slow) {
        s.detail = 'fast';
      } else {
        s.detail = '';
      }
      s.progress = Math.min(1, s.acc / (o.seconds * 1000));
      s.done = s.progress >= 1;
    },
  },

  /*
   * land { pad: {at, r} | pads: [...] | none, maxDescent = 2, settle = 0.6 }:
   * touch down gently (vertical speed at the touch under maxDescent), on the
   * pad when there is one, and sit still for `settle` seconds. With `pads`
   * every pad is landed on once, in order.
   */
  land: {
    start: () => ({ wasLanded: true, airborne: false, vy: 0, sat: 0, index: 0, hard: false }),
    frame(s, o, f, ctx) {
      const pads = o.pads || (o.pad ? [o.pad] : null);
      const target = pads ? pads[s.index] : null;
      if (!f.landed) {
        s.airborne = true;
        s.vy = f.vel.y;
        s.sat = 0;
        s.detail = '';
      } else if (s.airborne && !s.wasLanded) {
        /* The touch. */
        const gentle = -s.vy <= (o.maxDescent ?? 2);
        const onPad = !target || near2d(f.pos, target.c, target.r);
        s.hard = !gentle;
        s.offPad = !onPad;
        s.good = gentle && onPad;
        s.detail = !gentle ? 'hard' : (!onPad ? 'offpad' : '');
      }
      if (f.landed && s.good) {
        s.sat += ctx.dtMs;
        if (s.sat >= (o.settle ?? 0.6) * 1000) {
          s.index += 1;
          s.good = false;
          s.airborne = false;
          s.sat = 0;
          if (!pads || s.index >= pads.length) {
            s.done = true;
          }
        }
      }
      s.wasLanded = f.landed;
      const total = pads ? pads.length : 1;
      s.progress = Math.min(1, (s.index + (s.good ? 0.5 : 0)) / total);
      s.target = target;
    },
  },

  /*
   * rings { rings: [{at, yaw, pitch, r}], ordered = true, either = false }:
   * through each ring, in order, the way it faces (or either way).
   */
  rings: {
    start: () => ({ index: 0, passed: [] }),
    frame(s, o, f) {
      const rings = o.rings;
      const check = (i) => {
        const dir = crossesDisc(f.prev, f.pos, rings[i].c, rings[i].n, rings[i].r);
        return dir === 1 || (o.either && dir === -1);
      };
      if (o.ordered === false) {
        for (let i = 0; i < rings.length; i += 1) {
          if (!s.passed[i] && check(i)) {
            s.passed[i] = true;
            s.justPassed = i;
          }
        }
        s.index = s.passed.filter(Boolean).length;
      } else if (s.index < rings.length && check(s.index)) {
        s.passed[s.index] = true;
        s.justPassed = s.index;
        s.index += 1;
      }
      s.progress = s.index / rings.length;
      s.done = s.index >= rings.length;
      s.target = s.done ? null : (o.ordered === false
        ? rings.find((r, i) => !s.passed[i]) : rings[s.index]);
    },
  },

  /*
   * face { headings: [degrees], tol = 12, hold = 0.8, zone, maxHeight }:
   * turn on the spot to point the nose along each heading in turn.
   */
  face: {
    start: () => ({ index: 0, acc: 0 }),
    frame(s, o, f, ctx) {
      const want = o.headings[s.index];
      const flat = v3(f.fwd.x, 0, f.fwd.z);
      const have = headingOf(flat);
      const err = Math.abs(angleDiff(have, want)) / DEG;
      const inside = !f.landed && inZone(o.zone, f.pos, f.height)
        && (o.maxHeight == null || f.height <= o.maxHeight);
      s.error = err;
      s.detail = !inside ? 'outside' : (err > (o.tol ?? 12) ? (angleDiff(want, have) > 0 ? 'left' : 'right') : '');
      if (inside && err <= (o.tol ?? 12)) {
        s.acc += ctx.dtMs;
        if (s.acc >= (o.hold ?? 0.8) * 1000) {
          s.index += 1;
          s.acc = 0;
        }
      } else {
        s.acc = 0;
      }
      s.done = s.index >= o.headings.length;
      s.progress = Math.min(1, (s.index + s.acc / ((o.hold ?? 0.8) * 1000)) / o.headings.length);
    },
  },

  /*
   * gates { laps = 1 }: the race's own gates and laps (src/game/race.js),
   * which the shell reports on the frame. ctx.gatesPerLap sizes the bar.
   */
  gates: {
    start: () => ({ gates: 0, laps: 0, lapTimes: [] }),
    frame(s, o, f, ctx) {
      if (f.gate != null) {
        s.gates += 1;
      }
      if (f.lap) {
        s.laps += 1;
        s.lapTimes.push(f.lap.ms);
      }
      const per = Math.max(1, ctx.gatesPerLap || 1);
      const laps = o.laps ?? 1;
      s.done = s.laps >= laps;
      s.progress = Math.min(1, s.done ? 1 : (s.laps + Math.min(0.99, (s.gates % (per + 1)) / per)) / laps);
    },
  },

  /*
   * trick { need: [{ names, axis, axes, dir, minTurns, count = 1 }],
   *         minHeight, clean }:
   * the recogniser's own reports (src/game/trickdetect.js). A need matches a
   * trick by name, by the axis of its first rotation (`axes` for any of
   * several), by direction ('forward', 'back', 'left', 'right', read off the
   * first rotation's sign, which the event's `parts` carry), and by how many
   * turns it made on that axis. Every need is met, in any order.
   */
  trick: {
    start: (o) => ({ got: o.need.map(() => 0) }),
    frame(s, o) {
      const total = o.need.reduce((n, x) => n + (x.count ?? 1), 0);
      const have = o.need.reduce((n, x, i) => n + Math.min(s.got[i], x.count ?? 1), 0);
      s.progress = have / total;
      s.done = have >= total;
    },
    trick(s, o, t, ctx) {
      if (o.clean && t.execution !== 'CLEAN') {
        s.detail = 'sloppy';
        return false;
      }
      /* Height where the trick STARTED: the recogniser names a rotation
       * once it is over, by when a double flip has dropped the height it
       * was started with. Its clock is the frames' sim clock. */
      const h = Number.isFinite(t.startMs) && ctx.heightAt ? ctx.heightAt(t.startMs) : ctx.height;
      if (o.minHeight != null && h < o.minHeight) {
        s.detail = 'low';
        return false;
      }
      for (let i = 0; i < o.need.length; i += 1) {
        const n = o.need[i];
        if (s.got[i] >= (n.count ?? 1)) {
          continue;
        }
        if (matchesNeed(n, t)) {
          s.got[i] += 1;
          s.detail = '';
          return true;
        }
      }
      s.detail = 'other';
      s.lastName = t.name;
      return false;
    },
  },

  /*
   * segmented { axis, mode = 'same' | 'back', stopMin = 300, stopMax = 2500,
   *             minHeight }:
   * a rotation in two halves on one axis with a clear stop between them,
   * the second half the same way round ('same', a segmented roll or flip)
   * or back the way it came ('back', an invert rewind). Read off the
   * recogniser's half turns, whether it named the pair as one trick or, as
   * it does when the stop is not a near hover (its Segmented Flips/Rolls
   * asks for a stall under 2.5 m/s, which a falling quad upside down cannot
   * hold for half a second), as two halves a moment apart. tests/rig flies
   * both.
   */
  segmented: {
    start: () => ({ half: null }),
    frame(s) {
      s.progress = s.done ? 1 : (s.half ? 0.5 : 0);
    },
    trick(s, o, t, ctx) {
      const halves = (Array.isArray(t.parts) ? t.parts : [])
        .filter((p) => p && p.kind === 'rot' && p.axis === o.axis && Math.abs(Math.abs(p.turns) - 0.5) <= 0.15);
      const stopMin = o.stopMin ?? 300;
      const stopMax = o.stopMax ?? 2500;
      const fits = (a, b) => {
        const stop = (b.startMs ?? 0) - (a.endMs ?? 0);
        const same = Math.sign(a.dir) === Math.sign(b.dir);
        return stop >= stopMin && stop <= stopMax && ((o.mode ?? 'same') === 'same' ? same : !same);
      };
      const high = (p) => o.minHeight == null || !ctx.heightAt || ctx.heightAt(p.startMs ?? t.startMs) >= o.minHeight;
      /*
       * THE HALVES IN ORDER: the one kept from the last trick, then this
       * trick's own. The recogniser decides what a trick is by its own
       * stall rule, so a pilot who flies half a roll, a clear stop, the
       * other half and then rolls out gets "1/2 Roll" and then a trick
       * made of the second half and the roll out, with the pair split
       * across the two. Any two neighbours in the sequence that fit are a
       * segmented roll. Two halves inside one trick are the recogniser's
       * own pair (its stall rule already decided the stop, so only the
       * direction is asked); a half from the last trick is checked for its
       * stop here.
       */
      const kept = s.half ? [s.half] : [];
      const seq = [...kept, ...halves];
      const wantSame = (o.mode ?? 'same') === 'same';
      for (let i = 0; i + 1 < seq.length; i += 1) {
        const a = seq[i];
        const b = seq[i + 1];
        const joined = i >= kept.length;
        const same = Math.sign(a.dir) === Math.sign(b.dir);
        if ((joined ? wantSame === same : fits(a, b)) && high(a)) {
          s.done = true;
          s.detail = '';
          return true;
        }
      }
      if (halves.length >= 2) {
        /* A pair that was not the right way round: start again from this
         * trick's last half, so the next one can pair with it. */
        s.half = halves[halves.length - 1];
        s.detail = '';
        return true;
      }
      if (halves.length === 1 && Array.isArray(t.parts) && t.parts.length === 1) {
        const h = halves[0];
        if (s.half && fits(s.half, h) && high(s.half)) {
          s.done = true;
          s.detail = '';
          return true;
        }
        if (!high(h)) {
          s.detail = 'low';
          s.half = null;
          return false;
        }
        if (s.half && (h.startMs ?? 0) - (s.half.endMs ?? 0) < stopMin) {
          s.detail = 'nostop';
        } else {
          s.detail = '';
        }
        s.half = h;
        return true;
      }
      s.half = null;
      s.detail = 'other';
      s.lastName = t.name;
      return false;
    },
  },

  /*
   * attitude { pose: 'knife'|'inverted'|'noseDown', band = [lo, hi],
   *            seconds, minHeight = 2, minSpeed }:
   * hold an attitude for an unbroken stretch, in the air.
   *   knife     roll within 25 degrees of 90, either side
   *   inverted  top plate pointing down, within 35 degrees
   *   noseDown  nose below the horizon by band[0] to band[1] degrees
   */
  attitude: {
    start: () => ({ acc: 0, best: 0 }),
    frame(s, o, f, ctx) {
      const a = attitude(f.fwd, f.up);
      let pose = false;
      if (o.pose === 'knife') {
        pose = Math.abs(Math.abs(a.roll) - 90) <= (o.tol ?? 25) && Math.abs(a.pitch) <= 35;
      } else if (o.pose === 'inverted') {
        pose = a.tilt >= 180 - (o.tol ?? 35);
      } else if (o.pose === 'noseDown') {
        const down = -a.pitch;
        pose = down >= o.band[0] && down <= o.band[1] && Math.abs(a.roll) <= 30;
      }
      const air = !f.landed && f.height >= (o.minHeight ?? 2);
      const fast = o.minSpeed == null || f.speed >= o.minSpeed;
      s.pose = pose;
      s.att = a;
      if (pose && air && fast) {
        s.acc += ctx.dtMs;
        s.best = Math.max(s.best, s.acc);
      } else if (o.accumulate) {
        /* keep what was held */
      } else {
        s.acc = 0;
      }
      s.detail = !air ? 'low' : (!fast ? 'slow' : (pose ? '' : 'pose'));
      s.progress = Math.min(1, (o.accumulate ? s.acc : s.best) / (o.seconds * 1000));
      s.done = s.progress >= 1;
    },
  },

  /* level { seconds = 0.5 }: back upright and steady, in the air. */
  level: {
    start: () => ({ acc: 0 }),
    frame(s, o, f, ctx) {
      const a = attitude(f.fwd, f.up);
      const ok = !f.landed && a.tilt <= (o.tol ?? 25);
      s.acc = ok ? s.acc + ctx.dtMs : 0;
      s.progress = Math.min(1, s.acc / ((o.seconds ?? 0.5) * 1000));
      s.done = s.progress >= 1;
    },
  },

  /*
   * orbit { center, rMin, rMax, turns, minHeight = 1 }: circle a point the
   * whole way round, the angle swept counted only inside the band.
   */
  orbit: {
    start: () => ({ swept: 0, last: null }),
    frame(s, o, f) {
      const dx = f.pos.x - o.center.x;
      const dz = f.pos.z - o.center.z;
      const r = Math.sqrt(dx * dx + dz * dz);
      const inside = r >= o.rMin && r <= o.rMax && f.height >= (o.minHeight ?? 1) && !f.landed;
      const ang = Math.atan2(dz, dx);
      if (inside && s.last != null) {
        s.swept += angleDiff(ang, s.last);
      }
      s.last = inside ? ang : null;
      s.detail = inside ? '' : (r < o.rMin ? 'close' : (r > o.rMax ? 'far' : 'low'));
      s.progress = Math.min(1, Math.abs(s.swept) / (2 * Math.PI * o.turns));
      s.done = s.progress >= 1;
    },
  },

  /* gap { names, ordered = false, count }: named gaps, as the map's own
   * gap counter pays them (src/game/gaps.js). */
  gap: {
    start: () => ({ seen: [], index: 0 }),
    frame(s, o) {
      const total = o.count ?? o.names.length;
      s.progress = Math.min(1, s.seen.length / total);
      s.done = s.seen.length >= total;
      s.target = o.ordered ? o.names[s.seen.length] : null;
    },
    gap(s, o, e) {
      const name = String(e.name || '');
      if (!o.names.includes(name)) {
        return false;
      }
      if (o.ordered) {
        if (o.names[s.seen.length] !== name) {
          s.detail = 'order';
          return false;
        }
        s.seen.push(name);
        return true;
      }
      if (o.count != null) {
        s.seen.push(name);
        return true;
      }
      if (!s.seen.includes(name)) {
        s.seen.push(name);
        return true;
      }
      return false;
    },
  },

  /* speed { min }: reach a speed, m/s. */
  speed: {
    start: () => ({ best: 0 }),
    frame(s, o, f) {
      s.best = Math.max(s.best, f.landed ? 0 : f.speed);
      s.progress = Math.min(1, s.best / o.min);
      s.done = s.best >= o.min;
    },
  },

  /*
   * score { points, seconds }: the freestyle counter's banked total. With
   * `seconds` it is a timed run, the way a freestyle run is scored: the
   * objective ends when the run has flown that long, done if the total
   * reached `points` and failed if it did not, and the medal is the total.
   * Without, it is done the moment the total reaches `points`.
   */
  score: {
    start: () => ({ best: 0 }),
    frame(s, o, f, ctx) {
      s.best = Math.max(s.best, f.score || 0);
      if (o.seconds) {
        const total = o.seconds * 1000;
        s.remainMs = Math.max(0, total - ctx.elapsedMs);
        s.progress = Math.min(1, ctx.elapsedMs / total);
        if (ctx.elapsedMs >= total) {
          if (s.best >= o.points) {
            s.done = true;
          } else {
            s.failed = 'score';
          }
        }
        return;
      }
      s.progress = Math.min(1, s.best / o.points);
      s.done = s.best >= o.points;
    },
  },
};

export const OBJECTIVE_KINDS = Object.freeze(Object.keys(JUDGES));

/* ---------------------------------------------------------------- *
 * The run.
 * ---------------------------------------------------------------- */

/*
 * Medal for a finished run. Lessons are timed unless their medals say
 * metric: 'score'. Finishing is bronze; silver and gold are thresholds.
 */
export function medalFor(lesson, result) {
  const m = lesson.medals || {};
  if (!result || !result.complete) {
    return null;
  }
  if (m.metric === 'score') {
    if (m.gold != null && result.score >= m.gold) {
      return 'gold';
    }
    if (m.silver != null && result.score >= m.silver) {
      return 'silver';
    }
    return 'bronze';
  }
  if (m.gold != null && result.ms <= m.gold) {
    return 'gold';
  }
  if (m.silver != null && result.ms <= m.silver) {
    return 'silver';
  }
  return 'bronze';
}

export const MEDAL_RANK = Object.freeze({ gold: 3, silver: 2, bronze: 1 });

export function createRun(lesson, world = {}) {
  const W = world.W ?? 160;
  const D = world.D ?? 160;
  const objectives = lesson.objectives.map((o) => prepareObjective(o, W, D));
  for (const o of objectives) {
    if (!JUDGES[o.kind]) {
      throw new Error(`career: lesson ${lesson.id} has an unknown objective kind ${o.kind}`);
    }
  }
  /* The last few seconds of heights on the sim clock, for a judge that
   * asks how high the craft was when something began (heightAt). */
  const HIST = 600;
  const histT = new Float64Array(HIST);
  const histH = new Float64Array(HIST);
  let histN = 0;
  const heightAt = (ms) => {
    let best = -1;
    let bestD = Infinity;
    const n = Math.min(histN, HIST);
    for (let k = 0; k < n; k += 1) {
      const i = (histN - 1 - k + HIST) % HIST;
      const d = Math.abs(histT[i] - ms);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
      if (histT[i] < ms - 50) {
        break;
      }
    }
    return best < 0 ? 0 : histH[best];
  };
  const ctx = {
    dtMs: 0, height: 0, elapsedMs: 0, gatesPerLap: world.gatesPerLap || 0, heightAt,
  };
  let index = 0;
  let states = objectives.map((o) => JUDGES[o.kind].start(o));
  let phase = 'ready';
  let startMs = null;
  let lastMs = null;
  let elapsedMs = 0;
  let crashes = 0;
  let maxSpeed = 0;
  let failReason = '';
  let finishedMs = null;
  let lastScore = 0;
  const events = [];

  function emit(type, data = {}) {
    events.push({ type, ...data });
  }

  function advance() {
    while (index < objectives.length && states[index].done) {
      emit('objective', { index, text: objectives[index].text });
      index += 1;
    }
    if (index >= objectives.length && phase === 'flying') {
      phase = 'complete';
      finishedMs = elapsedMs;
      emit('complete', { ms: elapsedMs });
    }
  }

  function fail(reason) {
    if (phase === 'complete' || phase === 'failed') {
      return;
    }
    phase = 'failed';
    failReason = reason;
    emit('failed', { reason });
  }

  return {
    lesson,
    objectives,

    /* A frame of flight. Returns the run's status. */
    frame(f) {
      if (phase === 'complete' || phase === 'failed') {
        return this.status();
      }
      ctx.dtMs = lastMs == null ? 0 : Math.max(0, Math.min(250, f.simMs - lastMs));
      lastMs = f.simMs;
      ctx.height = f.height;
      histT[histN % HIST] = f.simMs;
      histH[histN % HIST] = f.height;
      histN += 1;
      lastScore = f.score || 0;
      if (phase === 'ready') {
        const go = lesson.clock === 'start' || !f.landed;
        if (go) {
          phase = 'flying';
          startMs = f.simMs;
          emit('start');
        }
      }
      if (phase === 'flying') {
        elapsedMs += ctx.dtMs;
        if (!f.landed) {
          maxSpeed = Math.max(maxSpeed, f.speed);
        }
        if (lesson.timeLimitMs && elapsedMs > lesson.timeLimitMs) {
          fail('time');
          return this.status();
        }
        if (lesson.area && !inZone(prepareAreaOnce(), f.pos, f.height)) {
          fail('area');
          return this.status();
        }
      }
      ctx.elapsedMs = elapsedMs;
      if (index < objectives.length) {
        JUDGES[objectives[index].kind].frame(states[index], objectives[index], f, ctx);
        /* A judge that can fail (a timed score run that fell short) ends
         * the run as a lesson's own limits do. */
        if (states[index].failed && phase === 'flying') {
          fail(states[index].failed);
          return this.status();
        }
      }
      advance();
      return this.status();
    },

    /* A trick the recogniser named. True when it counted. */
    trick(t) {
      if (phase !== 'flying' || index >= objectives.length) {
        return false;
      }
      const j = JUDGES[objectives[index].kind];
      if (!j.trick) {
        return false;
      }
      const counted = j.trick(states[index], objectives[index], t, ctx);
      emit('trick', { name: t.name, counted });
      return counted;
    },

    /* A named gap the map's counter paid. */
    gap(e) {
      if (phase !== 'flying' || index >= objectives.length) {
        return false;
      }
      const j = JUDGES[objectives[index].kind];
      const counted = j.gap ? j.gap(states[index], objectives[index], e) : false;
      emit('gap', { name: e.name, counted });
      return counted;
    },

    crash() {
      crashes += 1;
      emit('crash');
      if (lesson.failOn && lesson.failOn.crash && phase === 'flying') {
        fail('crash');
      }
    },

    /* Take the events since the last call: the HUD's pops and sounds. */
    drain() {
      return events.splice(0, events.length);
    },

    status() {
      const cur = index < objectives.length ? objectives[index] : null;
      const st = index < states.length ? states[index] : null;
      const result = phase === 'complete'
        ? { complete: true, ms: finishedMs, score: lastScore, crashes, maxSpeed }
        : null;
      return {
        phase,
        index,
        count: objectives.length,
        elapsedMs,
        startMs,
        crashes,
        maxSpeed,
        failReason,
        current: cur ? {
          kind: cur.kind,
          text: cur.text,
          hint: cur.hint || '',
          progress: st.progress || 0,
          detail: st.detail || '',
          state: st,
          objective: cur,
          marker: markerFor(cur, st),
        } : null,
        list: objectives.map((o, i) => ({
          text: o.text,
          done: i < index,
          active: i === index,
          progress: i < index ? 1 : (i === index ? (states[i].progress || 0) : 0),
        })),
        result,
        medal: result ? medalFor(lesson, result) : null,
      };
    },
  };

  function prepareAreaOnce() {
    if (!lesson.areaWorld) {
      lesson.areaWorld = worldZone(lesson.area, W, D);
    }
    return lesson.areaWorld;
  }
}

/* Where the HUD's arrow should point for the objective under way, or null. */
function markerFor(o, s) {
  if (o.kind === 'rings') {
    return s.target ? s.target.c : null;
  }
  if (o.kind === 'hold' || o.kind === 'face') {
    return zoneCentre(o.zone);
  }
  if (o.kind === 'land') {
    return s.target ? s.target.c : null;
  }
  if (o.kind === 'orbit') {
    return o.center;
  }
  return null;
}
