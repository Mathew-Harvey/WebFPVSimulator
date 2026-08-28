/*
 * tracks.js: the record crates. Recorded tracks as data, no audio code.
 *
 * The bed used to be a generated drum and bass and lofi performer. That
 * crate is gone. These are the files in assets/music, played by
 * src/render/music.js through one MediaElementSource on the mix bus.
 *
 * There are TWO crates and they are not interchangeable. TRACKS is the
 * flight crate, what plays while the pilot is flying, and it is the crate
 * the Music track setting picks from. MENU_TRACKS is the menu bed, what
 * plays on every screen that is not a flight, quieter, chosen at random
 * each time the menus come back. A menu is a place where somebody is
 * reading rows and deciding something, and twelve tracks written to be
 * flown to are the wrong thing to read over.
 *
 * Both crates live in the same assets/music directory and share one id
 * namespace, checked below, because they share one URL space and one
 * cache rule in render.yaml.
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

/*
 * The menu bed. Two takes of the same piece, which is why they are named
 * the way Copper Gypsy Run and its take 2 are named: they came out of one
 * sitting and they are meant to sit behind a list of rows without asking
 * for anything.
 *
 * These are NOT quiet files. They measure -14.2 and -13.6 LUFS
 * integrated, which lands them mid crate against the flight records'
 * -12.9 to -17.1. The quiet is a mix decision and it is made once, in
 * MENU_BUS in src/render/music.js, for the same reason scripts/music.js
 * refuses to put a gain in the encode: a loudness that lives in the file
 * is a loudness nobody can find later.
 */
export const MENU_TRACKS = [
  rec('neon-gate', 'Neon Gate'),
  rec('neon-gate-take-2', 'Neon Gate Take 2'),
];

export function trackById(id) {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

/* Rotation's first record of a visit. Math.random is fine: this is the
 * crate, not the plant. */
export function pickTrack() {
  return TRACKS[Math.floor(Math.random() * TRACKS.length)];
}

/* Which menu record. Rolled every time the menus come back rather than
 * once a visit, because a menu visit is thirty seconds and a once a visit
 * pick would mean hearing the same thirty seconds of the same intro every
 * time. music.js resumes each menu track where it left off, so a re-roll
 * is a change of record, not a restart. */
export function pickMenuTrack() {
  return MENU_TRACKS[Math.floor(Math.random() * MENU_TRACKS.length)];
}

/* The Music track setting picks from the flight crate only. The menu bed
 * is not a choice, it is furniture. */
export function musicIds() {
  return ['rotation', ...TRACKS.map((t) => t.id)];
}

export function trackUrl(id, ext) {
  /* Resolved against this module rather than the site root, so a shell
   * mounted under /sim/ still finds the crate. */
  return new URL(`../../assets/music/${id}.${ext}?v=${MUSIC_REV}`, import.meta.url).href;
}

if (TRACKS.length === 0) {
  throw new Error('tracks: flight crate is empty');
}
if (MENU_TRACKS.length === 0) {
  throw new Error('tracks: menu crate is empty');
}
/* One namespace across both crates, because both write into
 * assets/music/<id>.<ext>. A menu id that collided with a flight id would
 * not fail here, it would fail as one file overwriting another at encode
 * time and a menu bed that is quietly the wrong song. */
const seen = new Set();
for (const t of [...TRACKS, ...MENU_TRACKS]) {
  if (seen.has(t.id)) {
    throw new Error(`tracks: duplicate id ${t.id}`);
  }
  if (!/^[a-z0-9-]+$/.test(t.id)) {
    /* The id is half a URL now. A capital or a space here would not fail
     * until a deploy served a 404 for one track in fourteen. */
    throw new Error(`tracks: id ${t.id} is not a slug`);
  }
  seen.add(t.id);
}
