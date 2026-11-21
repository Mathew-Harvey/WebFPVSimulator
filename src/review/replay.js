/*
 * replay.js: the arithmetic of the review's replay. Two laps on one
 * timeline through one section: where each quad is at a moment, and the
 * playhead. The screen is src/review/replayview.js.
 *
 * LINED UP AT THE SECTION'S FIRST GATE. The timeline is your time from the
 * moment your line went through the section's first opening; the ghost is
 * placed at the same time from the moment its line went through it. So the
 * two start together and the gap between them opens and closes as it did,
 * and at the end the one in front is the one that was quicker.
 *
 * PURE. No DOM, no Three.js, no clock: the screen hands in the wall time
 * that passed, and scripts/review-replay-selftest.js drives all of this in
 * Node. Downstream of everything and feeding nothing back, so Math.sin and
 * friends are fine here.
 *
 * ONE FRAME. A line here is src/review/views.js's ({ t, x, y, z } and the
 * attitude as qx, qy, qz, qw): scene positions and a scene quaternion, the
 * frame a trace and a ghost are both stored in. Nothing is converted.
 *
 * SIDE BY SIDE. Your goggles and the ghost's, two pictures at once:
 * splitPanes lays them out and gogglePose puts each camera where the
 * quad's own lens was. THE ORBIT: orbitDir places a camera round a quad.
 * THE LINES: how much of each is drawn (pathWindow, tubeRange). THE
 * TIMELINE: the playhead's speed and loop, the
 * stretch of it shown (zoomView, followView), and each lap's sticks
 * (sticksOf, sticksAt).
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { F } from './trace.js';

/* Before the section's first gate and after the later of the two finishes,
 * so each quad is seen coming in and going out. */
export const LEAD_MS = 400;
export const TAIL_MS = 400;
/* A frame longer than this (a tab in the background) moves the playhead
 * no further. */
export const MAX_FRAME_MS = 100;

/*
 * Spherical interpolation from a to b ([x, y, z, w], unit), by u from 0 to
 * 1, along the shorter way round. Close to straight it blends straight and
 * normalises, where the angle is too small to divide by.
 */
export function slerp(a, b, u) {
  let [bx, by, bz, bw] = b;
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (d < 0) {
    d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  let ka;
  let kb;
  if (d > 0.9995) {
    ka = 1 - u;
    kb = u;
  } else {
    const th = Math.acos(d);
    const s = Math.sin(th);
    ka = Math.sin((1 - u) * th) / s;
    kb = Math.sin(u * th) / s;
  }
  const q = [a[0] * ka + bx * kb, a[1] * ka + by * kb, a[2] * ka + bz * kb, a[3] * ka + bw * kb];
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/* Where a line's quad is at ms: { x, y, z, q }, between the two samples
 * either side, held at the first or the last outside them. */
export function poseAt(line, ms) {
  const { t } = line;
  const n = t.length;
  let i = 0;
  while (i + 1 < n && t[i + 1] <= ms) {
    i += 1;
  }
  const j = Math.min(i + 1, n - 1);
  const u = t[j] > t[i] ? Math.max(0, Math.min(1, (ms - t[i]) / (t[j] - t[i]))) : 0;
  const mix = (a) => a[i] + (a[j] - a[i]) * u;
  const q = slerp([line.qx[i], line.qy[i], line.qz[i], line.qw[i]], [line.qx[j], line.qy[j], line.qz[j], line.qw[j]], u);
  return { x: mix(line.x), y: mix(line.y), z: mix(line.z), q };
}

/*
 * The section's timeline. you: [a, b], the times your line went through
 * the section's first and last openings; ghost: the same for the ghost's,
 * or null with no ghost. The playhead t is your lap time; the ghost is at
 * ghost[0] + (t - you[0]). It runs from LEAD_MS before the first gate to
 * TAIL_MS after the later of the two finishes.
 */
export function sectionTimeline(you, ghost) {
  const youMs = you[1] - you[0];
  const ghostMs = ghost ? ghost[1] - ghost[0] : null;
  const longest = Math.max(youMs, ghostMs ?? 0);
  return {
    you, ghost, youMs, ghostMs,
    startMs: you[0] - LEAD_MS,
    endMs: you[0] + longest + TAIL_MS,
    ghostAt: (t) => (ghost ? ghost[0] + (t - you[0]) : null),
  };
}

/* The playhead: t from startMs to endMs, moved by rate times the wall
 * time handed to advance() while it plays, stopping at the end, or with
 * loop on going round again from the start. Play at the end starts it
 * again from the start. */
export const PLAY_RATES = [1, 0.5, 0.25];

export class Playhead {
  constructor(startMs, endMs) {
    this.startMs = startMs;
    this.endMs = Math.max(startMs, endMs);
    this.t = startMs;
    this.playing = false;
    this.rate = 1;
    this.loop = false;
  }

  seek(ms) {
    this.t = Math.max(this.startMs, Math.min(this.endMs, ms));
  }

  toggle() {
    if (this.playing) {
      this.playing = false;
      return;
    }
    if (this.t >= this.endMs) {
      this.t = this.startMs;
    }
    this.playing = true;
  }

  advance(wallMs) {
    if (!this.playing) {
      return;
    }
    this.t += Math.min(MAX_FRAME_MS, Math.max(0, wallMs)) * this.rate;
    if (this.t >= this.endMs) {
      if (this.loop && this.endMs > this.startMs) {
        this.t = this.startMs + ((this.t - this.startMs) % (this.endMs - this.startMs));
      } else {
        this.t = this.endMs;
        this.playing = false;
      }
    }
  }
}

/*
 * Where the two pictures of the side by side view go on a screen w by h
 * (CSS pixels, from the top left): each the shape of the pilot's own
 * picture, aspect wide (16:9), as large as fits, side by side on a screen
 * wider than tall and one over the other on one taller than wide, the
 * pair in the middle. [yours, the ghost's], each { x, y, w, h }. The same
 * shape as in flight, so a pilot reads them as the goggles they flew in.
 */
export function splitPanes(w, h, aspect = 16 / 9) {
  const across = w >= h;
  const boxW = across ? w / 2 : w;
  const boxH = across ? h : h / 2;
  const pw = Math.min(boxW, boxH * aspect);
  const ph = pw / aspect;
  const x0 = across ? (w - 2 * pw) / 2 : (w - pw) / 2;
  const y0 = across ? (h - ph) / 2 : (h - 2 * ph) / 2;
  return [
    { x: x0, y: y0, w: pw, h: ph },
    across ? { x: x0 + pw, y: y0, w: pw, h: ph } : { x: x0, y: y0 + ph, w: pw, h: ph },
  ];
}

/* q times r, both [x, y, z, w]. */
function qMul(q, r) {
  return [
    q[3] * r[0] + q[0] * r[3] + q[1] * r[2] - q[2] * r[1],
    q[3] * r[1] - q[0] * r[2] + q[1] * r[3] + q[2] * r[0],
    q[3] * r[2] + q[0] * r[1] - q[1] * r[0] + q[2] * r[3],
    q[3] * r[3] - q[0] * r[0] - q[1] * r[1] - q[2] * r[2],
  ];
}

/* v turned by q. */
function qRot(q, v) {
  const p = qMul(qMul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]);
  return [p[0], p[1], p[2]];
}

/*
 * The goggles' camera on a quad at pose ({ x, y, z, q }, from poseAt): at
 * its camera, lens.up above and lens.forward ahead of its centre in the
 * craft's frame (the mount in src/render/lens.js, where main.js puts the
 * live camera; plant metres) times size (scene
 * metres to a plant metre), and looking out of it tilted up by tiltRad,
 * as the shell turns the live camera (the quad's attitude, then the tilt
 * about its own x). { pos: [x, y, z], q: [x, y, z, w] }.
 */
export function gogglePose(pose, lens, size, tiltRad) {
  const off = qRot(pose.q, [0, lens.up * size, -lens.forward * size]);
  const h = tiltRad / 2;
  return {
    pos: [pose.x + off[0], pose.y + off[1], pose.z + off[2]],
    q: qMul(pose.q, [Math.sin(h), 0, 0, Math.cos(h)]),
  };
}

/*
 * THE ORBIT. The camera round a quad, at heading (radians about the up
 * axis, 0 looking north, -z) and tilt (radians above level): the way from
 * the quad to the camera, a unit vector.
 */
export function orbitDir(heading, tilt) {
  const c = Math.cos(tilt);
  return [Math.sin(heading) * c, Math.sin(tilt), Math.cos(heading) * c];
}

/*
 * THE TIMELINE ZOOMED, as the coach branch's: the stretch [a, b] ms of the
 * whole [s, e] the bar and the lanes show. A wheel notch takes it to
 * ZOOM_STEP of itself (in) or back (out), never under ZOOM_MIN_MS, about
 * the time under the pointer, which stays where it was on the bar. At the
 * whole it is the whole again: null.
 */
export const ZOOM_STEP = 0.8;
export const ZOOM_MIN_MS = 500;

export function zoomView(view, full, atMs, steps) {
  const [s, e] = full;
  const whole = e - s;
  const [a, b] = view || full;
  const span = b - a;
  const next = Math.max(Math.min(ZOOM_MIN_MS, whole), Math.min(whole, span * ZOOM_STEP ** steps));
  if (!(whole > 0) || next >= whole - 1e-6) {
    return null;
  }
  const at = Math.max(a, Math.min(b, atMs));
  const u = span > 0 ? (at - a) / span : 0.5;
  const a2 = Math.max(s, Math.min(e - next, at - u * next));
  return [a2, a2 + next];
}

/* The stretch moved to keep the playhead on it: when t runs off one end
 * it turns over like a page, t a fifth of the way in, so play reads on
 * without the bar sliding under it every frame. Null stays null. */
export function followView(view, full, t) {
  if (!view) {
    return null;
  }
  const [s, e] = full;
  const [a, b] = view;
  const span = b - a;
  let a2 = a;
  if (t > b) {
    a2 = t - span * 0.2;
  } else if (t < a) {
    a2 = t - span * 0.8;
  }
  a2 = Math.max(s, Math.min(e - span, a2));
  return a2 === a ? view : [a2, a2 + span];
}

/* A trace's sticks (src/review/trace.js): { t, throttle, roll, pitch, yaw },
 * throttle 0 to 1 and the others -1 to 1, as the radio gave them. */
export const LANES = ['throttle', 'roll', 'pitch', 'yaw'];

export function sticksOf(trace) {
  const n = trace.count;
  const out = { t: new Float64Array(n) };
  const field = { throttle: F.THROTTLE, roll: F.ROLL, pitch: F.PITCH, yaw: F.YAW };
  for (const k of LANES) {
    out[k] = new Float32Array(n);
  }
  for (let i = 0; i < n; i += 1) {
    out.t[i] = trace.at(i, F.T);
    for (const k of LANES) {
      out[k][i] = trace.at(i, field[k]);
    }
  }
  return out;
}

/* The sticks at ms, between the two samples either side; NaN outside the
 * recording, or with none (null). */
export function sticksAt(sticks, ms) {
  const none = { throttle: NaN, roll: NaN, pitch: NaN, yaw: NaN };
  const n = sticks ? sticks.t.length : 0;
  if (!n || !(ms >= sticks.t[0]) || !(ms <= sticks.t[n - 1])) {
    return none;
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (sticks.t[m] <= ms) {
      lo = m;
    } else {
      hi = m;
    }
  }
  const u = sticks.t[hi] > sticks.t[lo] ? (ms - sticks.t[lo]) / (sticks.t[hi] - sticks.t[lo]) : 0;
  const out = {};
  for (const k of LANES) {
    out[k] = sticks[k][lo] + (sticks[k][hi] - sticks[k][lo]) * u;
  }
  return out;
}

/*
 * THE LINES, how much of each is drawn, as the coach branch's: 'near',
 * from NEAR_BEHIND_MS behind the quad to NEAR_AHEAD_MS ahead of it on its
 * own clock; 'section', its own stretch of the section under the playhead;
 * 'all', the whole of the replay. pathWindow says which stretch of its
 * clock, [lo, hi], or null for all of it; seg is its own [from, to] of the
 * section (or null).
 */
export const PATH_MODES = ['near', 'section', 'all'];
export const NEAR_BEHIND_MS = 1500;
export const NEAR_AHEAD_MS = 1000;

export function pathWindow(mode, ms, seg) {
  if (mode === 'near') {
    return [ms - NEAR_BEHIND_MS, ms + NEAR_AHEAD_MS];
  }
  if (mode === 'section' && seg) {
    return [seg[0], seg[1]];
  }
  return null;
}

/* The run of a tube's segments [j0, j1) that covers lo to hi of a line
 * built over span [a, b] with `segments` segments even in time. */
export function tubeRange(span, segments, lo, hi) {
  const [a, b] = span;
  const at = (ms) => Math.max(0, Math.min(segments, ((ms - a) / (b - a)) * segments));
  const j0 = Math.floor(at(lo));
  const j1 = Math.ceil(at(hi));
  return j1 > j0 ? [j0, j1] : [j0, j0];
}
