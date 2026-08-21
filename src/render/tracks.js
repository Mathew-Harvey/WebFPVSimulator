/*
 * tracks.js: the record crate. Recorded tracks as data, no audio code.
 *
 * The bed used to be a generated drum and bass and lofi performer. That
 * crate is gone. These are the files in assets/music, played by
 * src/render/music.js through one MediaElementSource on the mix bus.
 *
 * There is no filename column any more. Every track is
 * assets/music/<id>.webm and assets/music/<id>.mp3, written by
 * scripts/music.js from the id below, which is why the id is the slug of
 * the title. That is one fact instead of two that could disagree, and it
 * takes the percent encoding out of the URL: the crate used to carry
 * names like 'Copper Gypsy Run take 2.mp3' and 'Pace Shift Skyline
 * (1).mp3', and a space and a bracket in a media URL is a thing that
 * works everywhere until it does not.
 *
 * Two formats because they are not the same price. Opus in a WebM is
 * about 1.9 MB a track, the mp3 fallback about 2.9 MB, the masters these
 * came from were 5.7 MB. src/render/music.js picks with canPlayType and
 * falls back on a load error. See scripts/music.js for the encode.
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

/*
 * THE ONE THING TO REMEMBER ABOUT THIS FILE.
 *
 * render.yaml serves /assets/music/* immutable for a year, because a
 * three minute track that has to be revalidated on every visit is a round
 * trip nobody is paid for. The filenames below never change, so the only
 * thing that can tell a browser the audio did is this number. RE-ENCODE
 * THE CRATE, BUMP THIS. A visitor who does not is holding last year's
 * mix and there is no way for them to find out.
 */
export const MUSIC_REV = 1;

function rec(id, name) {
  return { id, name };
}

export const TRACKS = [
  rec('tarmac-pulse', 'Tarmac Pulse'),
  rec('neon-horizon', 'Neon Horizon'),
  rec('pace-shift-skyline', 'Pace Shift Skyline'),
  rec('fractal-current', 'Fractal Current'),
  rec('subway-rattle', 'Subway Rattle'),
  rec('shroom-spiral', 'Shroom Spiral'),
  rec('barnstorm-break', 'Barnstorm Break'),
  rec('bluegrass-circuit', 'Bluegrass Circuit'),
  rec('celtic-riser', 'Celtic Riser'),
  rec('gypsy-breaks', 'Gypsy Breaks'),
  rec('copper-gypsy-run', 'Copper Gypsy Run'),
  rec('copper-gypsy-run-take-2', 'Copper Gypsy Run Take 2'),
];

export function trackById(id) {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

export function musicIds() {
  return ['rotation', ...TRACKS.map((t) => t.id)];
}

export function trackUrl(id, ext) {
  return `/assets/music/${id}.${ext}?v=${MUSIC_REV}`;
}

if (TRACKS.length === 0) {
  throw new Error('tracks: crate is empty');
}
const seen = new Set();
for (const t of TRACKS) {
  if (seen.has(t.id)) {
    throw new Error(`tracks: duplicate id ${t.id}`);
  }
  if (!/^[a-z0-9-]+$/.test(t.id)) {
    /* The id is half a URL now. A capital or a space here would not fail
     * until a deploy served a 404 for one track in twelve. */
    throw new Error(`tracks: id ${t.id} is not a slug`);
  }
  seen.add(t.id);
}
