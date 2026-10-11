/*
 * rating.js: the stars a pilot gives, and the key that makes it one pilot.
 *
 * A rating on the board is one per browser per item. The board has no
 * accounts, so a browser is told apart by a random key it makes for itself
 * the first time it rates anything: 32 hex characters, sent with a rating
 * and with a shared tune, stored on the board only as a hash, and used for
 * one thing, finding the vote to overwrite. It is not a login, not shown to
 * anybody, and not sent anywhere else. Clearing site data forgets it, and
 * the next vote counts as a new voter, which is the whole limit of the
 * scheme (see "Tunes and ratings" in the board's README).
 *
 * THE KEY NAMES MIRROR public/community.js IN THE BOARD'S REPOSITORY. The
 * board is a mount on the same origin as the simulator in production, so
 * both pages read one local storage: a pilot who rates here and on the
 * board is one voter, and the stars they have given show on both. Change
 * both together.
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

export const RATER_KEY = 'webfpv.rater.v1';
export const MINE_KEY = 'webfpv.mine.v1';
export const RATING_KINDS = ['track', 'map', 'setup'];

/* Held for the life of the page when storage is blocked, so a pilot in a
 * private window still gets one voter per page rather than a new one for
 * every star. */
let memoryKey = '';
const memoryMine = {};

function randomHex32() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function raterKey() {
  try {
    const held = localStorage.getItem(RATER_KEY);
    if (held && /^[a-f0-9]{32}$/.test(held)) {
      return held;
    }
    const made = randomHex32();
    localStorage.setItem(RATER_KEY, made);
    return made;
  } catch (e) {
    memoryKey = memoryKey || randomHex32();
    return memoryKey;
  }
}

function readMine() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MINE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return memoryMine;
  }
}

/* The stars this browser has given an item, 0 when none. */
export function myStars(kind, id) {
  const n = readMine()[`${kind}:${id}`];
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}

export function rememberStars(kind, id, stars) {
  const mine = readMine();
  if (stars) {
    mine[`${kind}:${id}`] = stars;
  } else {
    delete mine[`${kind}:${id}`];
  }
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(mine));
  } catch (e) {
    memoryMine[`${kind}:${id}`] = stars;
  }
}

/*
 * A board's rating as a list uses it: { count, avg, score }, with null for
 * the last two on an item nobody has rated. An older board sends none, and
 * that reads as unrated, never as an error.
 */
export function cleanRating(raw) {
  const count = raw && Number.isInteger(raw.count) && raw.count > 0 ? raw.count : 0;
  if (!count || !Number.isFinite(raw.avg)) {
    return { count: 0, avg: null, score: null };
  }
  return {
    count,
    avg: raw.avg,
    score: Number.isFinite(raw.score) ? raw.score : raw.avg,
  };
}

/* "4.6 of 5 from 12 ratings", or "Not rated yet". */
export function ratingWords(rating) {
  if (!rating || !rating.count) {
    return 'Not rated yet';
  }
  return `${rating.avg.toFixed(1)} of 5 from ${rating.count} rating${rating.count === 1 ? '' : 's'}`;
}

/* The shorter form a list card carries: "4.6 stars (12)". Empty when none,
 * because a card of dashes is a form, not a board. */
export function ratingShort(rating) {
  if (!rating || !rating.count) {
    return '';
  }
  return `${rating.avg.toFixed(1)} stars (${rating.count})`;
}

/* The order a list is put in for "Top rated": the board's damped score,
 * unrated last. Ties keep the caller's order, which Array.sort preserves. */
export function byRating(a, b) {
  const sa = a.rating && a.rating.score != null ? a.rating.score : -1;
  const sb = b.rating && b.rating.score != null ? b.rating.score : -1;
  if (sa !== sb) {
    return sb - sa;
  }
  return ((b.rating && b.rating.count) || 0) - ((a.rating && a.rating.count) || 0);
}
