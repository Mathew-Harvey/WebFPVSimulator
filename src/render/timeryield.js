/*
 * timeryield.js: whether the timer loop is drawing more frames than the
 * display shows, and the moment it is not, so it can hand the frames back.
 *
 * WHY THIS EXISTS. bug-5dfce5a7, 2026-11-08: "fps is 100-180 but it looks
 * like 20-40 ... I have set all graphics to lowest and have tried brave,
 * chrome and edge." The report's perf block says the rest: the refresh
 * learned at 185 Hz, the timer loop pacing (Low, so Frame pacing's Auto
 * picked it), 154 frames a second, a frame interval of 6.5 ms at the median
 * and 11.2 at the 90th, and the GPU guard's average at 6.4 ms.
 *
 * The timer exists to draw MORE often than the display refreshes, so each
 * refresh is handed a fresher frame (the owner's A against B of 2026-09-28:
 * 125 frames a second on a 60 Hz panel, key to screen 80 to 64 ms at the
 * median). On that machine it drew FEWER. timerDelay in main.js asks for
 * the display's period minus the GPU's time, and when the GPU's time is the
 * whole period or more it asks for the period itself, "exactly the cadence
 * a display loop would have had". A timeout cannot keep that promise:
 * setTimeout takes a whole number of milliseconds, so 5.4 is 5, and it fires
 * after whatever else the main thread is doing (the page's own frame, the
 * browser's style and paint of the HUD), so the ticks came 6.5 ms apart
 * against a 5.4 ms refresh. Unsynchronised and slower, the display shows
 * the same frame twice 185 minus 154 times a second, 31 stalls a second,
 * and a picture that stalls 31 times a second reads as 20 to 40 frames a
 * second whatever the counter says. The faster the panel the worse it gets:
 * the timer's floor is 4 ms plus the main thread, so near 200 frames a
 * second is the most it can draw, and a 240 Hz panel repeats a frame forty
 * times a second however fast the GPU is.
 *
 * SO THE TIMER JUDGES ITSELF while it paces live flight, on two signals,
 * and hands the frames to the display loop if either says it is not
 * drawing faster than the display:
 *
 *   drawn   the median interval between the frames it actually drew (a
 *           frame the GPU guard or the frame cap held is not a frame on the
 *           glass) is no shorter than YIELD_RATIO of the display's own
 *           interval. The display's interval is read from the one rAF the
 *           timer already keeps pending (rafKeepAlive in main.js), as the
 *           tenth percentile of its gaps: rAF never fires faster than the
 *           display and fires every refresh while one is pending, so that
 *           is the display's period whichever loop is faster, with no
 *           dependence on the refresh learner, which does not learn while
 *           the timer paces (latency.js) and on a session that boots into
 *           Low has only its sixty Hz guess.
 *   period  most of the window's ticks took timerDelay's fallback, the
 *           display's period because the GPU cannot beat it. That branch
 *           promises the display loop's cadence, and only the display loop
 *           can deliver it in phase with the refresh.
 *
 * YIELD_RATIO is 0.95, the drawn signal with a margin for timing noise: a
 * timer drawing within five percent of the display's rate beats against it
 * at under a twentieth of the refresh, a hitch every few frames, and that is
 * the symptom, not a cadence worth keeping for its latency.
 *
 * THE HAND BACK IS FOR THE PAGE'S LIFE and only under Auto (Timer with Low).
 * Sticky because the GPU's time is measured queue included, so the display
 * loop's gentler feed reads lower, and a rule that came back on that number
 * would swap loops every few seconds. A reload tries the timer again. A
 * pilot who picked Timer, always, or opened the page with ?loop=timer, keeps
 * the timer: an explicit choice outranks the measurement, as it outranks
 * the preset (pacingTimerOn in src/ui/ui.js).
 *
 * Pure and allocation free per call (P8): main.js feeds it and asks it, and
 * scripts/timeryield-check.js drives it with the report's own cadences.
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

/* Gaps kept for each signal, and how many new drawn gaps between verdicts:
 * at the report's 154 frames a second, under a second of flying. */
export const YIELD_WINDOW = 120;
/* The drawn signal's line: see the header. */
export const YIELD_RATIO = 0.95;
/* The period signal's line: the share of the window's ticks that fell back
 * to the display's period. */
export const YIELD_FALLBACK_SHARE = 0.5;
/* A gap longer than this is a stall, a hidden tab or a menu, not a cadence. */
const MAX_GAP_MS = 100;
/* And one shorter than this is two callbacks in one task, not a cadence. */
const MIN_GAP_MS = 1;

export function createTimerYield() {
  const draws = new Float32Array(YIELD_WINDOW);
  const rafs = new Float32Array(YIELD_WINDOW);
  const falls = new Uint8Array(YIELD_WINDOW);
  const scratch = new Float32Array(YIELD_WINDOW);
  let drawAt = -1;
  let rafAt = -1;
  let drawI = 0;
  let drawN = 0;
  let rafI = 0;
  let rafN = 0;
  let fallI = 0;
  let fallN = 0;
  let sinceVerdict = 0;
  /* Null until the timer hands back; then what it measured, for the report. */
  let result = null;

  /* Whatever was being measured stops being one stretch: a menu, a pause, a
   * replay or the loop handing over. The windows keep what they hold. */
  function pause() {
    drawAt = -1;
    rafAt = -1;
  }

  function push(buf, i, v) {
    buf[i] = v;
    return (i + 1) % YIELD_WINDOW;
  }

  /* A frame the timer drew, at `t` ms. */
  function noteDraw(t) {
    if (drawAt >= 0) {
      const g = t - drawAt;
      if (g >= MIN_GAP_MS && g <= MAX_GAP_MS) {
        drawI = push(draws, drawI, g);
        if (drawN < YIELD_WINDOW) {
          drawN += 1;
        }
        sinceVerdict += 1;
      }
    }
    drawAt = t;
  }

  /* The kept rAF's timestamp, at `t` ms. */
  function noteRaf(t) {
    if (rafAt >= 0) {
      const g = t - rafAt;
      if (g >= MIN_GAP_MS && g <= MAX_GAP_MS) {
        rafI = push(rafs, rafI, g);
        if (rafN < YIELD_WINDOW) {
          rafN += 1;
        }
      }
    }
    rafAt = t;
  }

  /* One tick's delay: whether timerDelay fell back to the display's period. */
  function noteTick(fellBack) {
    falls[fallI] = fellBack ? 1 : 0;
    fallI = (fallI + 1) % YIELD_WINDOW;
    if (fallN < YIELD_WINDOW) {
      fallN += 1;
    }
  }

  /* An insertion sort into the scratch copy, as latency.js does it. */
  function quantile(src, n, q) {
    for (let i = 0; i < n; i += 1) {
      const v = src[i];
      let j = i - 1;
      while (j >= 0 && scratch[j] > v) {
        scratch[j + 1] = scratch[j];
        j -= 1;
      }
      scratch[j + 1] = v;
    }
    return scratch[Math.min(n - 1, Math.floor(q * n))];
  }

  /*
   * Called once a frame while the timer paces live flight. Returns true on
   * the one call that hands the frames back, and false on every other.
   * A verdict waits for full windows and is taken again every YIELD_WINDOW
   * new drawn gaps, so a GPU that slows mid flight is still caught.
   */
  function check() {
    if (result) {
      return false;
    }
    if (drawN < YIELD_WINDOW || rafN < YIELD_WINDOW || fallN < YIELD_WINDOW || sinceVerdict < YIELD_WINDOW) {
      return false;
    }
    sinceVerdict = 0;
    const drawMs = quantile(draws, drawN, 0.5);
    const displayMs = quantile(rafs, rafN, 0.1);
    let fell = 0;
    for (let i = 0; i < fallN; i += 1) {
      fell += falls[i];
    }
    const share = fell / fallN;
    const drawn = drawMs >= YIELD_RATIO * displayMs;
    const period = share >= YIELD_FALLBACK_SHARE;
    if (!drawn && !period) {
      return false;
    }
    result = {
      why: drawn ? 'drawn' : 'period',
      drawMs: Math.round(drawMs * 10) / 10,
      displayMs: Math.round(displayMs * 10) / 10,
      fallback: Math.round(share * 100) / 100,
    };
    return true;
  }

  function yielded() {
    return result;
  }

  return { noteDraw, noteRaf, noteTick, pause, check, yielded };
}
