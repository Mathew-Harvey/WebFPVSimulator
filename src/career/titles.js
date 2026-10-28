/*
 * titles.js: the career's titles, as words and as the number a room sends.
 *
 * The pilot's title is the career's word for how far they have flown
 * (./progress.js titleOf decides it): it is on the licence card, and in a
 * room it is printed beside the pilot's handle. A room must not load the
 * career to learn it, so the career writes it to a key of its own whenever
 * it saves, and the room reads that key. In the room it travels as a number,
 * one more avatar part (src/net/avatar.js, the board's AVATAR_FIELDS), so
 * the board passes on a number from this closed list and never words.
 *
 * The order of TITLE_IDS is the wire format: append, never reorder.
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

export const TITLES = Object.freeze({
  student: 'Student pilot',
  rookie: 'Rookie',
  racer: 'Pro Racer',
  freestyler: 'Pro Freestyler',
  both: 'Pro Racer and Freestyler',
  pro: 'WebFPV Pro',
});

/* A room's title number is 1 + the index here; 0 is none (the pilot has
 * never opened the career). */
export const TITLE_IDS = Object.freeze(['student', 'rookie', 'racer', 'freestyler', 'both', 'pro']);

export const TITLE_KEY = 'webfpv.career.title';

export function titleNumber(id) {
  return 1 + TITLE_IDS.indexOf(id);
}

/* The words for a room's title number, or '' for none or a number this
 * build does not know. */
export function titleWords(n) {
  const id = Number.isInteger(n) && n > 0 ? TITLE_IDS[n - 1] : null;
  return id ? TITLES[id] : '';
}

/* The title the career last saved in this browser, as a room's number. */
export function savedTitleNumber(storage = globalThis.localStorage) {
  try {
    return storage ? Math.max(0, titleNumber(storage.getItem(TITLE_KEY))) : 0;
  } catch (e) {
    return 0;
  }
}

export function saveTitle(id, storage = globalThis.localStorage) {
  try {
    if (storage && TITLE_IDS.includes(id) && storage.getItem(TITLE_KEY) !== id) {
      storage.setItem(TITLE_KEY, id);
    }
  } catch (e) {
    /* Storage refused: the room shows no title this visit. */
  }
}
