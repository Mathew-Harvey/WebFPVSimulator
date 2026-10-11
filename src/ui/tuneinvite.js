/*
 * tuneinvite.js: the invitation to help tune flight feel, the part of it with
 * no page in it.
 *
 * WHAT IT IS. A pilot who has flown more than one track, or more than ten
 * minutes of freestyle, is told on their next landing that they fly well and
 * asked whether they would like to help tune flight feel. Yes turns Flight
 * feel tuning on, which puts the sliders on the glass and starts the question
 * at the end of a flight (src/share/tune.js), and No is the last they hear of
 * it. The owner's brief, 2026-10-11 07:03Z: "if a pilot flys more than one
 * track or for more than 10 min in freestyle the next landing they do give
 * them a prompt that compliments their flying and asks if they would like to
 * contribute to helping tune flight feel, if they say yes, show them the
 * sliders".
 *
 * WHY AN INVITATION AND NOT A DEFAULT. He was asked whether the sliders
 * should show for every player and answered No, opt in only. The mode stays
 * off until a pilot turns it on, in the Quad room or here. What this adds is
 * a moment, chosen by how much a pilot has flown, at which the door is held
 * open once. A pilot who has not flown enough to have a feel for the quad is
 * the pilot least able to say what would make it better, and asking them
 * would be noise.
 *
 * WHAT COUNTS, and each of these is a reading of the brief that the owner can
 * change by editing a number here:
 *
 *   A TRACK is flown when the pilot has spent INVITE_TRACK_AIR_MS in the air
 *   on it, over any number of visits. A hop that lands in two seconds does
 *   not make a track flown, and a pilot who sampled five tracks on the board
 *   for a few seconds each has not yet flown any of them. Two flown tracks
 *   make a pilot due. A track is named by the same key the ghosts are filed
 *   under (ghostCourseKey in main.js), folded to eight hex digits so the
 *   table stays small and a long course key is never stored.
 *
 *   FREESTYLE is the airtime in worlds with no gates, over any number of
 *   sessions, and MORE THAN INVITE_FREESTYLE_MS makes a pilot due. Airtime
 *   and not the clock: it is the sim time the quad was off the pads, so a
 *   pilot who left the tab open on the title is not flattered.
 *
 *   A LANDING is a clean set down, the perch in main.js, and nothing else. A
 *   crash is not a landing and a compliment after one would be rude. The
 *   airtime is added when the quad lands, not frame by frame, so the page
 *   writes storage at most once per landing and never in the frame loop.
 *
 * ASKED AT MOST INVITE_MAX_ASKS TIMES. The card is put away when the pilot
 * takes off without answering, which counts as having been asked once it was
 * on the glass for INVITE_SEEN_MS, so a pilot who ignores it three times is
 * left alone and a card that only blinked, between a bounce and the landing
 * that follows it, costs nothing. A No is final. A pilot who has the mode on
 * already is never asked, and is recorded as having answered, so switching it
 * off again later does not bring the card back.
 *
 * ITS OWN STORAGE KEY, as the hint cards have, and not a field in the
 * settings blob: saving settings is what detectFirstRun reads to decide
 * somebody is a returning pilot, and a table of tracks flown is not a
 * setting. Read once when the page starts and kept in memory after that.
 *
 * NO DOM, NO WASM. The counting, the due test and the words live here so
 * scripts/tuneinvite-selftest.js can read all of them in Node. ui.js draws the
 * card and decides where it goes; main.js says when the quad has landed.
 *
 * LATENCY. Nothing here is on the input, physics or render path. The frame
 * loop reads three booleans, and the clock only while a card that has not yet
 * counted is on the glass. The one storage read is when the page starts; the
 * writes are at a landing, when the card has been seen, and at an answer.
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

import { tuneSliderNames } from '../share/tune.js';

export const INVITE_KEY = 'webfpv.tuneinvite.v1';

/* Two tracks, "more than one". */
export const INVITE_TRACKS = 2;
/* The airtime on a track that makes it flown. */
export const INVITE_TRACK_AIR_MS = 30 * 1000;
/* "More than 10 min in freestyle": strictly more. */
export const INVITE_FREESTYLE_MS = 10 * 60 * 1000;
/* Times the card goes up, answered or not. */
export const INVITE_MAX_ASKS = 3;
/* How long the card is on the glass before it counts as having been asked:
 * long enough to read its first line. A quad that bounces on touchdown lands,
 * lifts, and lands again inside a fifth of a second, and the card that blinked
 * between the two was not an ask. */
export const INVITE_SEEN_MS = 1200;

/* The table of tracks is bounded: a pilot who samples a hundred tracks for a
 * few seconds each must not grow a key that is read on every page load. */
const KEEP_TRACKS = 6;
/* Freestyle airtime stops adding at twice the line, which is enough to say
 * "well past it" and keeps the number small. */
const FREE_CAP_MS = INVITE_FREESTYLE_MS * 2;
/* What a track key looks like once folded: see courseKeyOf. */
const KEY_SHAPE = /^[0-9a-f]{8}$/;

export function emptyInvite() {
  return {
    v: 1, tracks: {}, free: 0, asked: 0, answer: '',
  };
}

/*
 * A course key folded to eight hex digits, with the multiply and xor the
 * record key uses. The same course always folds to the same key; two courses
 * can collide, once in four billion, and the cost of that is one track
 * counted as another.
 *
 * A track the pilot built is keyed by its id AND the time it was last saved
 * (`custom:local:<id>:<saved>`, courseSeatKey in src/share/session.js),
 * because for a lap record an edited track is a different course. For
 * "has flown a track" it is the same one, so the stamp is dropped here and a
 * pilot who tweaks one track and flies it again has flown one track.
 */
export function courseKeyOf(course) {
  const text = String(course == null ? '' : course).replace(/^(custom:local:[^:]*):.*$/, '$1');
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) {
    h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/* Tracks with enough airtime to count as flown. */
export function flownTracks(state) {
  let n = 0;
  for (const ms of Object.values(state.tracks)) {
    if (ms >= INVITE_TRACK_AIR_MS) {
      n += 1;
    }
  }
  return n;
}

/*
 * Add the airtime of a flight that has just landed. `freestyle` is a world
 * with no gates, which counts toward the freestyle line and toward no track.
 * Returns whether anything changed, so the caller writes storage only when
 * there is something to write. Anything that is not a positive finite number
 * of milliseconds is ignored.
 */
export function noteAir(state, { freestyle, course, airMs }) {
  if (!Number.isFinite(airMs) || !(airMs > 0)) {
    return false;
  }
  if (freestyle) {
    const next = Math.min(state.free + airMs, FREE_CAP_MS);
    if (next === state.free) {
      return false;
    }
    state.free = next;
    return true;
  }
  const key = courseKeyOf(course);
  const have = state.tracks[key];
  if (have === undefined) {
    const keys = Object.keys(state.tracks);
    if (keys.length >= KEEP_TRACKS) {
      /* Make room by dropping the track flown least. If even that one is a
       * flown track the pilot is already due and has no use for another. */
      let least = keys[0];
      for (const k of keys) {
        if (state.tracks[k] < state.tracks[least]) {
          least = k;
        }
      }
      if (state.tracks[least] >= INVITE_TRACK_AIR_MS) {
        return false;
      }
      delete state.tracks[least];
    }
  }
  const next = Math.min((have || 0) + airMs, INVITE_TRACK_AIR_MS);
  if (next === have) {
    return false;
  }
  state.tracks[key] = next;
  return true;
}

/*
 * Why the pilot is due, or '' when they are not. `freestyleNow` is whether
 * the flight that has just landed was in a world with no gates, so a pilot
 * who qualifies both ways is complimented on what they were just flying.
 */
export function dueReason(state, freestyleNow = false) {
  if (state.answer !== '' || state.asked >= INVITE_MAX_ASKS) {
    return '';
  }
  const byTracks = flownTracks(state) >= INVITE_TRACKS;
  const byFreestyle = state.free > INVITE_FREESTYLE_MS;
  if (byFreestyle && (freestyleNow || !byTracks)) {
    return 'freestyle';
  }
  return byTracks ? 'tracks' : '';
}

/* The card has gone up. Counted when it is raised and not when it is
 * answered, so a card that is ignored three times stops coming. */
export function noteAsked(state) {
  state.asked = Math.min(state.asked + 1, INVITE_MAX_ASKS);
}

/* 'yes', 'no', or 'self' for a pilot who turned the mode on without us. */
export function noteAnswer(state, answer) {
  state.answer = answer === 'yes' || answer === 'no' || answer === 'self' ? answer : state.answer;
}

/*
 * What the page stored, trusted for nothing. Anything that is not the shape
 * written below is dropped, a corrupt blob is an empty state, and a storage
 * that throws is an empty state: the worst a pilot gets is asked once more
 * on a browser that cannot remember.
 */
export function readInvite(storage) {
  try {
    const raw = storage ? storage.getItem(INVITE_KEY) : null;
    if (!raw) {
      return emptyInvite();
    }
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object' || j.v !== 1) {
      return emptyInvite();
    }
    const out = emptyInvite();
    if (j.tracks && typeof j.tracks === 'object') {
      for (const [k, ms] of Object.entries(j.tracks)) {
        if (Object.keys(out.tracks).length >= KEEP_TRACKS) {
          break;
        }
        if (KEY_SHAPE.test(k) && Number.isFinite(ms) && ms > 0) {
          out.tracks[k] = Math.min(ms, INVITE_TRACK_AIR_MS);
        }
      }
    }
    if (Number.isFinite(j.free) && j.free > 0) {
      out.free = Math.min(j.free, FREE_CAP_MS);
    }
    if (Number.isInteger(j.asked) && j.asked > 0) {
      out.asked = Math.min(j.asked, INVITE_MAX_ASKS);
    }
    noteAnswer(out, j.answer);
    return out;
  } catch (e) {
    return emptyInvite();
  }
}

export function writeInvite(storage, state) {
  try {
    storage.setItem(INVITE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

/*
 * The words on the card, or null when the module has no slider to offer
 * (main.js tells the page which it has, and an older module may have none):
 * a pilot is never invited to something that is not there. `caps` is
 * { air, kv } as tuneSliderNames reads it.
 *
 * The compliment is a fact the pilot can check, not a flourish: how many
 * tracks, or how long in freestyle. What the sliders do is the next card's
 * to say (tuneCardText), which goes up on its own the moment the answer is
 * yes, so this one only asks. They are a first draft and the owner's to
 * rewrite.
 */
export function inviteWords(reason, state, caps) {
  const names = tuneSliderNames(caps);
  if (!names.length || (reason !== 'tracks' && reason !== 'freestyle')) {
    return null;
  }
  const flown = reason === 'tracks'
    ? `You have flown ${Math.max(INVITE_TRACKS, flownTracks(state))} tracks now.`
    : 'That is over ten minutes of freestyle.';
  const sliders = names.length === 2
    ? 'Two more sliders let you try your own settings.'
    : 'One more slider lets you try your own settings.';
  return {
    title: 'Nice flying',
    body: `${flown} Would you like to help tune flight feel? ${sliders}`,
    yes: 'Yes, show me',
    no: 'No thanks',
  };
}
