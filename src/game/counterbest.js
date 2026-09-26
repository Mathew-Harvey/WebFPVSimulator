/*
 * counterbest.js: the counter's best scored run on each freestyle map, kept
 * in this browser.
 *
 * WHY LOCAL. The public board bounds every posted freestyle run against the
 * trick scorer's own arithmetic (src/share/board.js postFreestyleRun and the
 * board's inspectRun), and a map somebody built has no key the board knows
 * (FREESTYLE-MAPS-PLAN.md section 7, "The board"). So a scored run posts the
 * trick scorer's total, exactly as before the counter existed, and the
 * counter's own total, geometry and tricks together, is kept here: a best
 * per map, for the results page to say whether this run beat it. Nothing
 * here talks to the network.
 *
 * THE RECORD is one versioned key, COUNTER_BEST_KEY, holding
 *   { [key]: { points, atUtc } }
 * where key is the map's STF egg key (src/maps/README.md): 'city' for the
 * town, 'built:starter' for Hibari Yard, 'built:' and the document's id for
 * a map somebody built, the same key src/share/stamps.js files a stamp
 * under, so a map's stamp and its best are filed under one name. Only a
 * scored run is kept: two minutes on the clock is what makes two totals
 * comparable, and free flight is an odometer.
 *
 * STORAGE CAN SAY NO (a private window, a full quota, a policy), and a run
 * flown in one of those was still flown. So every read and write is in a
 * try, nothing here throws, and a best that could not be written is held
 * in memory for the life of the page, as the stamps are.
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

export const COUNTER_BEST_KEY = 'webfpv.counter.best.v1';

/* Bests this page could not store, so they still count until it closes. */
const unstored = new Map();

/* A key is a map's egg key, a short string; anything else is not one. */
function isKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 200;
}

/* The stored record, with anything that is not a best left out, so a hand
 * edited or half written value reads as fewer bests rather than an error. */
function readRecord() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(COUNTER_BEST_KEY) || 'null');
  } catch (e) {
    return {};
  }
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return out;
  }
  for (const [key, v] of Object.entries(raw)) {
    if (isKey(key) && v && typeof v === 'object' && Number.isFinite(v.points) && v.points >= 0) {
      out[key] = { points: Math.round(v.points), atUtc: typeof v.atUtc === 'string' ? v.atUtc : '' };
    }
  }
  return out;
}

/* This browser's best for a map, { points, atUtc }, or null. */
export function readCounterBest(key) {
  if (!isKey(key)) {
    return null;
  }
  const stored = readRecord()[key] ?? null;
  const held = unstored.get(key) ?? null;
  if (stored && held) {
    return held.points > stored.points ? held : stored;
  }
  return stored || held;
}

/*
 * Offer a finished scored run's counter total. Returns { best, improved,
 * stored }: the best after this run, whether this run set it, and whether
 * it is in storage (false when storage refused it and it is held for this
 * page only). A run that does not beat the best changes nothing.
 */
export function writeCounterBest(key, points, atUtc = new Date().toISOString()) {
  const p = Math.round(Number(points));
  if (!isKey(key) || !Number.isFinite(p) || p < 0) {
    return { best: 0, improved: false, stored: false };
  }
  const before = readCounterBest(key);
  if (before ? before.points >= p : p === 0) {
    return { best: before ? before.points : 0, improved: false, stored: !unstored.has(key) };
  }
  const record = readRecord();
  const entry = { points: p, atUtc: String(atUtc) };
  record[key] = entry;
  try {
    localStorage.setItem(COUNTER_BEST_KEY, JSON.stringify(record));
    unstored.delete(key);
    return { best: p, improved: true, stored: true };
  } catch (e) {
    unstored.set(key, entry);
    return { best: p, improved: true, stored: false };
  }
}
