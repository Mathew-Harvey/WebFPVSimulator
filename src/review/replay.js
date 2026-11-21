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

/* The playhead: t from startMs to endMs, moved by the wall time handed to
 * advance() while it plays, stopping at the end. Play at the end starts it
 * again from the start. */
export class Playhead {
  constructor(startMs, endMs) {
    this.startMs = startMs;
    this.endMs = Math.max(startMs, endMs);
    this.t = startMs;
    this.playing = false;
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
    this.t += Math.min(MAX_FRAME_MS, Math.max(0, wallMs));
    if (this.t >= this.endMs) {
      this.t = this.endMs;
      this.playing = false;
    }
  }
}
