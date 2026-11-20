/*
 * splits.js: a lap against the ghost it chased, section by section, by time
 * alone.
 *
 * A SECTION is the stretch between two stations of the course: the start
 * (the timing gate) to gate 1, gate 1 to gate 2, and so on to the finish.
 * The race hands every lap its splits, one per gate in course order with
 * the last at the finish (src/game/race.js), and a ghost carries the splits
 * of the lap it recorded (src/game/ghost.js). So a section's time is the
 * difference of two splits, and the review's whole comparison is a few
 * subtractions: how long you took over a section, how long the ghost took,
 * and the difference, green where you gained and red where you lost.
 *
 * PURE. No DOM, no clock. scripts/review-splits-selftest.js drives it in
 * Node.
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

/* A difference under this is shown as level: it reads 0.00 at two places. */
export const LEVEL_MS = 5;

/* "The start to gate 1", "Gate 3 to gate 4", "Gate 7 to the finish", for
 * section k of n. */
export function sectionName(k, n) {
  const name = (s) => (s === 0 ? 'the start' : s >= n ? 'the finish' : `gate ${s}`);
  const words = `${name(k)} to ${name(k + 1)}`;
  return words[0].toUpperCase() + words.slice(1);
}

/* Seconds to the hundredth, rounded the way the lap clock rounds
 * (formatTime in src/ui/ui.js), so a time here and the same time in a
 * title never disagree in the last digit. */
export function seconds(ms) {
  return (Math.round(ms / 10) / 100).toFixed(2);
}

/* Each section's time, ms, from a lap's splits. */
export function sectionTimes(splits) {
  const out = [];
  let prev = 0;
  for (const s of splits) {
    out.push(s - prev);
    prev = s;
  }
  return out;
}

/* 'gained', 'lost' or 'level', for a difference in ms (yours less theirs). */
export function toneOf(deltaMs) {
  if (!Number.isFinite(deltaMs) || Math.abs(deltaMs) < LEVEL_MS) {
    return 'level';
  }
  return deltaMs < 0 ? 'gained' : 'lost';
}

/* "-0.23 s" gained, "+0.41 s" lost, "0.00 s" level. */
export function deltaText(deltaMs) {
  if (toneOf(deltaMs) === 'level') {
    return '0.00 s';
  }
  return `${deltaMs < 0 ? '-' : '+'}${seconds(Math.abs(deltaMs))} s`;
}

/* The words the review names its ghost by. The ghost was the session's
 * best when the lap began; a lap that beat it is the best now, so calling
 * the slower lap "Best" reads the wrong way round. It is the previous best
 * then. */
export function chasedLabel(label, wasBest, lapMs, refMs) {
  if (wasBest && lapMs < refMs) {
    return label.replace(/^Best\b/, 'Previous best');
  }
  return label;
}

/*
 * The comparison.
 *   lap  { splits, durationMs } of the lap flown
 *   ref  { splits, durationMs } of the ghost it chased, or null
 * Returns {
 *   sections: [{ name, lapMs, refMs, deltaMs, tone }], refMs and deltaMs
 *             null where there is nothing to compare with,
 *   total:    { lapMs, refMs, deltaMs, tone },
 *   matched:  whether the ghost's sections line up with the lap's,
 *   why:      a sentence when they do not, or there is no ghost
 * }
 */
export function compareSplits(lap, ref) {
  const mine = sectionTimes(lap.splits || []);
  const n = mine.length;
  let why = '';
  let theirs = null;
  if (!ref) {
    why = 'No ghost on this lap, so there is nothing to compare with yet.';
  } else if (!ref.splits || ref.splits.length !== n) {
    why = 'The ghost\'s gates do not line up with this lap\'s, so only the lap time is compared.';
  } else {
    theirs = sectionTimes(ref.splits);
  }
  const sections = mine.map((ms, k) => {
    const refMs = theirs ? theirs[k] : null;
    const deltaMs = refMs === null ? null : ms - refMs;
    return { name: sectionName(k, n), lapMs: ms, refMs, deltaMs, tone: deltaMs === null ? 'none' : toneOf(deltaMs) };
  });
  const totalRef = ref ? ref.durationMs : null;
  const totalDelta = totalRef === null ? null : lap.durationMs - totalRef;
  return {
    sections,
    total: { lapMs: lap.durationMs, refMs: totalRef, deltaMs: totalDelta, tone: totalDelta === null ? 'none' : toneOf(totalDelta) },
    matched: Boolean(theirs),
    why,
  };
}
