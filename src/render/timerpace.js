/*
 * timerpace.js: when the timer loop draws its next frame, locked to the
 * display's own beat.
 *
 * WHY THIS EXISTS. 2026-11-15, a pilot on the Discord: "really weird digital
 * tearing going on halfway on the screen horizontally and it's insanely
 * jittery, and I have prop wash off and even tried going down to the lowest
 * settings of the graphics". Low is exactly what turns the timer on (Frame
 * pacing's Auto, pacingTimerOn in ui.js), and the timer as it was drew at a
 * rate unrelated to the display's.
 *
 * Its delay was the display's period less the GPU's frame, used as a
 * PERIOD. That number is a phase (start the frame so it finishes at the
 * next refresh), and as a period it is a frequency a little above the
 * display's that drifts across it. On a 60 Hz panel with the GPU at 2 ms,
 * which is what Low makes of an ordinary desktop card, the timer drew every
 * 14.7 ms and a timeout's lateness: about 67 frames a second, so six to
 * eight times a second a refresh was handed a frame two draws on from the
 * last and the next one only one, a hitch no frame counter shows. The lower the
 * preset, the quicker the GPU and the slower and more visible the beat.
 * The timer's own judge (timeryield.js) keeps it, because 14.7 ms is under
 * 0.95 of 16.7. And where the browser really presents the low latency
 * canvas off vsync (Android's single buffer, some Windows), each of those
 * presents lands mid scan, so the tear line walks the screen with the beat.
 *
 * WHAT IT DOES NOW. The timer draws exactly twice per refresh, at times
 * counted from the last refresh the kept rAF saw, so the picture each
 * refresh takes is always the same age and the motion is even. Twice
 * because that is the owner's laptop's case (125 frames a second on a 60 Hz
 * panel, key to screen 80 to 64 ms at the median, 2026-09-28) and it keeps
 * that freshness whatever the compositor's deadline is. When half the
 * period is shorter than the GPU's frame or than the 4 ms a chained timeout
 * is clamped to (a 144 Hz panel, or a slow GPU), two draws a refresh cannot
 * be kept, and any other count is a beat again: the tick then says so as a
 * fallback, and the timer's judge hands the frames to the display loop,
 * which is the one cadence a slower machine can hold evenly.
 *
 * Pure, and allocation free per call, so scripts/timerpace-check.js runs it
 * against a modelled display in Node.
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

/* The shortest gap a chained setTimeout keeps (the HTML spec clamps nested
 * timeouts to 4 ms). */
export const TIMER_FLOOR_MS = 4;
/* How long before a refresh the frame aims to be done, past the GPU's own
 * time: the main thread's frame body (about a millisecond on Low) and a
 * timeout's lateness (0.1 to 0.6 ms measured), with room to spare. A
 * frame that still misses costs one step of age, never an uneven advance. */
export const PACE_MARGIN_MS = 2.5;
/* The smallest delay asked for. A target closer than this is taken one
 * step later, because a timeout cannot land inside it. */
const MIN_DELAY_MS = 0.5;

/*
 * The draws per refresh the timer can keep evenly: 2 or 1. `periodMs` is
 * the display's period, `gpuMs` the GPU's frame (0 when not yet measured).
 */
export function drawsPerRefresh(periodMs, gpuMs) {
  const half = periodMs / 2;
  return half >= TIMER_FLOOR_MS && half >= gpuMs ? 2 : 1;
}

/*
 * The delay to the next draw. `nowMs` is performance.now(), `vsyncMs` the
 * timestamp of the last rAF callback (a refresh, in the same clock), or a
 * negative number when there has been none yet, `periodMs` the display's
 * period, `gpuMs` the GPU's frame. The draws sit at
 * vsync + k * step - lead: each finishes about PACE_MARGIN_MS before a
 * draw boundary, and every refresh sees the same phase. Without a refresh
 * to count from it falls back to a plain step, which is what the first
 * frame or two after a start have.
 */
export function paceDelay(nowMs, vsyncMs, periodMs, gpuMs) {
  const n = drawsPerRefresh(periodMs, gpuMs);
  const step = periodMs / n;
  if (!(vsyncMs >= 0) || !(step > 0)) {
    return step > 0 ? step : 16;
  }
  let lead = (gpuMs + PACE_MARGIN_MS) % step;
  if (lead < 0) {
    lead = 0;
  }
  const base = vsyncMs - lead;
  let k = Math.ceil((nowMs + MIN_DELAY_MS - base) / step);
  let target = base + k * step;
  if (target - nowMs < MIN_DELAY_MS) {
    k += 1;
    target = base + k * step;
  }
  return target - nowMs;
}

/*
 * The display's period as the kept rAF sees it, for the timer only: the
 * refresh learner stands down while the timer paces (latency.js), so on a
 * page that boots on Low it never learns, and its 60 Hz default would set
 * the step on a 144 Hz panel. A ring of the last 16 rAF gaps, read at the
 * 25th percentile so a gap a busy main thread stretched to two refreshes
 * does not count. Gaps outside 3 to 50 ms are not a refresh. Not ready
 * until it has four gaps; the caller keeps its own period until then.
 */
export function createRafPeriod() {
  const N = 16;
  const gaps = new Float32Array(N);
  const sorted = new Float32Array(N);
  let i = 0;
  let n = 0;
  let last = -1;
  let period = 1000 / 60;
  function note(ts) {
    if (last >= 0) {
      const g = ts - last;
      if (g >= 3 && g <= 50) {
        gaps[i] = g;
        i = (i + 1) % N;
        if (n < N) {
          n += 1;
        }
        if (n >= 4) {
          for (let a = 0; a < n; a += 1) {
            const v = gaps[a];
            let b = a - 1;
            while (b >= 0 && sorted[b] > v) {
              sorted[b + 1] = sorted[b];
              b -= 1;
            }
            sorted[b + 1] = v;
          }
          period = sorted[Math.floor(0.25 * n)];
        }
      }
    }
    last = ts;
  }
  function reset() {
    last = -1;
  }
  return {
    note,
    reset,
    ready: () => n >= 4,
    periodMs: () => period,
    lastMs: () => last,
  };
}
