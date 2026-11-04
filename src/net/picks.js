/*
 * picks.js: a made up handle, picked by the pilot.
 *
 * The words a made up handle is picked from, the board's PICK_A and PICK_B
 * in its src/rooms.js, in the same order: the wire carries the two
 * positions and the number, never the words, and the board spells it
 * (npm run net:selftest holds the copies equal). A listed, school safe or
 * streamer room shows no typed name, because the youngest pilots are
 * eight; this lets a pilot pick the made up one they are shown by (the
 * owner's ask of 2026-11-04).
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
export const PICK_A = Object.freeze(['Mint', 'Amber', 'Sakura', 'Turbo', 'Cobalt', 'Neon', 'Comet', 'Pocket', 'Rocket', 'Lucky', 'Swift', 'Nova',
  'Solar', 'Pixel', 'Echo', 'Blaze', 'Frost', 'Storm', 'Violet', 'Jade', 'Ruby', 'Lime',
  'Ember', 'Orbit', 'Rapid', 'Brave', 'Sunny', 'Misty', 'Zippy', 'Cosmic', 'Lunar', 'Velvet']);
export const PICK_B = Object.freeze(['Falcon', 'Gecko', 'Kestrel', 'Otter', 'Hornet', 'Badger', 'Koi', 'Tanuki', 'Swallow', 'Moth', 'Fox', 'Heron',
  'Panda', 'Lynx', 'Raven', 'Wren', 'Puffin', 'Beetle', 'Dragon', 'Owl', 'Hare', 'Shark',
  'Tiger', 'Wolf', 'Dolphin', 'Gull', 'Robin', 'Squid', 'Crane', 'Bee', 'Lemur', 'Newt']);

/* [word, word, number] as the board takes it, or null. */
export function cleanPick(raw) {
  if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(Number.isInteger)) {
    return null;
  }
  const [a, b, n] = raw;
  return a >= 0 && a < PICK_A.length && b >= 0 && b < PICK_B.length && n >= 10 && n <= 99 ? [a, b, n] : null;
}

export function pickWords(pick) {
  return pick ? `${PICK_A[pick[0]]} ${PICK_B[pick[1]]} ${pick[2]}` : '';
}

/* The handle the board makes from this browser's key when nothing is
 * picked (generatedHandle in its src/rooms.js), as a pick, so the picker
 * opens on the name the pilot already has. */
export async function hashPick(key) {
  try {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
    return [d[0] % 12, d[1] % 12, 10 + (((d[2] << 8) | d[3]) % 90)];
  } catch (e) {
    return [0, 0, 10];
  }
}

