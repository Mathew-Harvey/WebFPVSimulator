/*
 * pace.js: hold 60 frames per second by scaling the map's internal
 * buffer, not by switching the named graphics preset.
 *
 * The session already has a Render scale slider. This is that lever,
 * automatic, with hysteresis, so a 4K panel does not spend 16 ms on a
 * HalfFloat 4K blit while a 1080p panel stays native. Physics still
 * steps on the 1 kHz accumulator. A dropped frame still changes nothing
 * about the trajectory.
 *
 * Observe allocates nothing. The returned state object is reused. A
 * resize of the render targets is the caller's job, and only when
 * `dirty` is set, and only after the cooldown the caller records.
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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { internalScale } from './quality.js';

export const TARGET_HZ = 60;
export const TARGET_MS = 1000 / TARGET_HZ;
export const DROP_MS = 18;
export const RAISE_MS = 14.2;
export const PACE_STEP = 0.07;
export const PACE_WARM = 50;
export const PACE_COOL = 75;

export function createPace() {
  const dtRing = new Float64Array(256);
  const dtSort = new Float64Array(256);
  const s = {
    emaMs: TARGET_MS,
    renderEma: 4,
    shellEma: 4,
    scaleNow: 1,
    ceil: 1,
    floor: 1,
    want: 1,
    dirty: 0,
    cool: 0,
    warm: 0,
    changes: 0,
    cpuBound: 0,
    rw: 1,
    rh: 1,
    dtI: 0,
    dtN: 0,
  };

  function observe(dt, renderMs, blockMs, post) {
    s.dirty = 0;
    s.rw = post.size.x;
    s.rh = post.size.y;
    s.scaleNow = post.scale;
    /*
     * A target resize hitches the next few frames. Training the EMA on
     * that hitch would drop scale again, then hitch, then drop: a spiral.
     * Skip the sample while the cooldown is still in its hitch window.
     */
    const hitching = s.cool > PACE_COOL - 8;
    if (!hitching && dt > 0 && dt < 300) {
      s.emaMs += (dt - s.emaMs) * 0.15;
      dtRing[s.dtI] = dt;
      s.dtI = (s.dtI + 1) & 255;
      if (s.dtN < 256) {
        s.dtN += 1;
      }
    }
    if (!hitching) {
      s.renderEma += (renderMs - s.renderEma) * 0.15;
      s.shellEma += ((blockMs - renderMs) - s.shellEma) * 0.15;
    }
    if (s.warm < PACE_WARM) {
      s.warm += 1;
      return;
    }
    if (s.cool > 0) {
      s.cool -= 1;
      return;
    }
    const w = post._cssW;
    const h = post._cssH;
    const mapQ = post.mapQ;
    if (!(w > 0 && h > 0) || !mapQ) {
      return;
    }
    const user = post.userScale;
    const ceil = internalScale(w, h, mapQ, null, user);
    const floor = internalScale(w, h, mapQ, 0, user);
    s.ceil = ceil;
    s.floor = floor;
    /*
     * Resolution cannot buy back a CPU hitch. If the GPU half of the
     * callback is already cheap and the shell is not, dropping scale
     * only softens the picture.
     */
    if (s.renderEma < 7 && s.shellEma > 9 && s.emaMs > DROP_MS) {
      s.cpuBound = 1;
      return;
    }
    s.cpuBound = 0;
    let want = post.forceScale == null ? ceil : post.forceScale;
    if (s.emaMs > DROP_MS && want > floor + 0.001) {
      want = floor > want - PACE_STEP ? floor : want - PACE_STEP;
    } else if (s.emaMs < RAISE_MS && want < ceil - 0.001) {
      want = ceil < want + PACE_STEP ? ceil : want + PACE_STEP;
    } else {
      return;
    }
    if (want > ceil) {
      want = ceil;
    }
    if (want < floor) {
      want = floor;
    }
    if (want === post.forceScale || Math.abs(want - s.scaleNow) < 0.02) {
      return;
    }
    s.want = want;
    s.dirty = 1;
  }

  function resetSamples() {
    s.dtI = 0;
    s.dtN = 0;
  }

  function p95() {
    const n = s.dtN;
    if (n < 2) {
      return 0;
    }
    for (let i = 0; i < n; i += 1) {
      dtSort[i] = dtRing[i];
    }
    dtSort.subarray(0, n).sort();
    return dtSort[Math.min(n - 1, (n * 95 / 100) | 0)];
  }

  return { state: s, observe, resetSamples, p95 };
}
