/*
 * tracks.js: the record crate. Recorded tracks as data, no audio code.
 *
 * The bed used to be a generated drum and bass and lofi performer. That
 * crate is gone. These are the mp3s in assets/music, played by
 * src/render/music.js through one MediaElementSource on the mix bus.
 *
 * Pace Shift Skyline (1).mp3 is a second copy of that title and is left
 * on disk but not listed, so the skip dock does not offer the same song
 * twice.
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

function rec(id, name, file) {
  return { id, name, file };
}

export const TRACKS = [
  rec('tarmac-pulse', 'Tarmac Pulse', 'Tarmac Pulse.mp3'),
  rec('neon-horizon', 'Neon Horizon', 'Neon Horizon.mp3'),
  rec('pace-shift-skyline', 'Pace Shift Skyline', 'Pace Shift Skyline.mp3'),
  rec('fractal-current', 'Fractal Current', 'Fractal Current.mp3'),
  rec('subway-rattle', 'Subway Rattle', 'Subway Rattle.mp3'),
  rec('shroom-spiral', 'Shroom Spiral', 'Shroom Spiral.mp3'),
  rec('barnstorm-break', 'Barnstorm Break', 'Barnstorm Break.mp3'),
  rec('bluegrass-circuit', 'Bluegrass Circuit', 'Bluegrass Circuit.mp3'),
  rec('celtic-riser', 'Celtic Riser', 'Celtic Riser.mp3'),
  rec('gypsy-breaks', 'Gypsy Breaks', 'Gypsy Breaks.mp3'),
  rec('copper-gypsy-run', 'Copper Gypsy Run', 'Copper Gypsy Run.mp3'),
  rec('copper-gypsy-run-take-2', 'Copper Gypsy Run Take 2', 'Copper Gypsy Run take 2.mp3'),
];

export function trackById(id) {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

export function musicIds() {
  return ['rotation', ...TRACKS.map((t) => t.id)];
}

export function trackUrl(file) {
  return `/assets/music/${encodeURIComponent(file)}`;
}

if (TRACKS.length === 0) {
  throw new Error('tracks: crate is empty');
}
const seen = new Set();
for (const t of TRACKS) {
  if (seen.has(t.id)) {
    throw new Error(`tracks: duplicate id ${t.id}`);
  }
  seen.add(t.id);
}
