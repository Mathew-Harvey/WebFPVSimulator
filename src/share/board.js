/*
 * board.js: the public leaderboard, as this page sees it.
 *
 * THE CONNECTION, WRITTEN DOWN ONCE.
 *
 *   Board page     {board}/
 *   Board API      {board}/api/tracks
 *   Fly a track    {sim}/?map=custom&share={id}&board={board}
 *   Orbit thumb    {sim}/src/share/orbit.html?map=custom&share={id}&board={board}
 *   Publish        POST {board}/api/tracks   { author, document, editKey?, tags? }
 *   Update listing POST {board}/api/tracks   same, with the edit key from
 *                  the browser that first published. A name-only update
 *                  keeps the times. A layout change clears them. tags
 *                  left out keeps what the listing wears and tags: []
 *                  takes them off. The answer carries the tags it wears.
 *   Post a time    POST {board}/api/tracks/{id}/times   { name, lapMs, threeMs?, ghost? }
 *                  ghost is the base64 lap recording from
 *                  src/share/ghostdata.js, sent when the lap was recorded
 *                  in this session, so the board can hand it to a chaser.
 *   List times     GET {board}/api/tracks/{id}   times[] carry { id,
 *                  hasGhost } beside name and lapMs; id is the handle a
 *                  ghost is fetched by.
 *   Fetch a ghost  GET {board}/api/tracks/{id}/times/{timeId}/ghost
 *                  { id, name, lapMs, ghost }
 *   File a bug     POST {board}/api/bugs   { kind, title, what, ... }
 *
 * The track document is the only payload. schema.md is the contract. The
 * logo travels inside the document, so a published course wears its sponsor
 * print on every gate and every flag the moment it is flown.
 *
 * The board origin is, in order: a ?board= query, a stored override, then
 * the default for wherever this page is being served from. Nothing here
 * guesses a deployed host: there are exactly two named hosts below and the
 * page picks between them by its own hostname.
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

import { adminAuthHeaders, writeAdminSession } from './admin.js';
import { readShareImport, writeShareImport } from './session.js';
import { byRating, cleanRating, raterKey, rememberStars } from './rating.js';

/*
 * Two named hosts, because this page is served from two kinds of place and
 * only one of them has a board sitting next to it.
 *
 * Development serves the shell off a loopback address with the board on
 * 3100 beside it. Anything else is a deploy, and a deploy has to name its
 * board out loud: the shell is a static site, so there is no environment to
 * read at run time and no server to ask. The name lives here instead.
 *
 * PRODUCTION_BOARD_ORIGIN is the one line to change when the board lands on
 * a different URL than the one below. Both escape hatches still outrank it,
 * so a fork can point somewhere else without editing this file: a ?board=
 * query wins over everything, and the Publish dialog's stored override wins
 * over the default.
 *
 * "Origin" is now generous: the production value carries a path, because the
 * board is a mount on webfpv.org rather than a host of its own. Everything
 * below concatenates onto it and trims a trailing slash, so a prefix works
 * exactly where a bare origin used to, and the only thing that would not is
 * `new URL('/some/path', board)`, which is not done anywhere here.
 */
export const DEFAULT_BOARD_ORIGIN = 'http://127.0.0.1:3100';
export const PRODUCTION_BOARD_ORIGIN = 'https://webfpv.org/board';
export const DEFAULT_LANDING_ORIGIN = 'http://127.0.0.1:8080';
export const PRODUCTION_LANDING_ORIGIN = 'https://webfpv.org';
const ORIGIN_KEY = 'webfpv.board.origin';

/* An empty hostname is a file:// open, which is a developer, not a deploy. */
const LOOPBACK_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

export function defaultBoardOrigin() {
  try {
    return LOOPBACK_HOSTS.has(window.location.hostname)
      ? DEFAULT_BOARD_ORIGIN
      : PRODUCTION_BOARD_ORIGIN;
  } catch (e) {
    /* No window, as in Node, where the board is the local one or nothing. */
    return DEFAULT_BOARD_ORIGIN;
  }
}

function trimOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function boardOrigin() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('board');
    if (fromUrl) {
      const origin = trimOrigin(fromUrl);
      if (origin) {
        return origin;
      }
    }
  } catch (e) {
    /* No URL to read. */
  }
  try {
    const stored = trimOrigin(localStorage.getItem(ORIGIN_KEY) || '');
    if (stored) {
      return stored;
    }
  } catch (e) {
    /* Private mode. */
  }
  return defaultBoardOrigin();
}

export function landingOrigin() {
  try {
    const host = window.location.hostname;
    if (LOOPBACK_HOSTS.has(host)) {
      return DEFAULT_LANDING_ORIGIN;
    }
    if (host === 'webfpv.org' || host === 'www.webfpv.org') {
      return `${window.location.protocol}//webfpv.org`;
    }
    return PRODUCTION_LANDING_ORIGIN;
  } catch (e) {
    return DEFAULT_LANDING_ORIGIN;
  }
}

/*
 * The FPV wiki lives on the landing site, not in this shell. Old
 * `#wiki/<id>` bookmarks on the simulator rewrite here.
 */
export function wikiPageUrl(articleId) {
  const base = `${trimOrigin(landingOrigin())}/wiki/`;
  if (!articleId) {
    return base;
  }
  const raw = String(articleId).replace(/^#/, '');
  const id = raw.startsWith('wiki/') ? raw.slice(5) : raw;
  if (!id) {
    return base;
  }
  return `${base}#wiki/${id}`;
}

export function setBoardOrigin(origin) {
  const value = trimOrigin(origin);
  if (!value) {
    return null;
  }
  try {
    localStorage.setItem(ORIGIN_KEY, value);
  } catch (e) {
    /* Private mode: still used for this session via the return. */
  }
  return value;
}

function usableBoardOrigin(origin) {
  const trimmed = trimOrigin(origin);
  if (!trimmed) {
    return '';
  }
  try {
    const here = trimOrigin(window.location.origin);
    /* The board is a different site. Opening this page (the simulator)
     * as the board is how Choose new map reloaded the sim in a new tab. */
    if (here && trimmed === here) {
      return '';
    }
  } catch (e) {
    /* No window, as in Node. */
  }
  return trimmed;
}

/* An omitted, empty, or same-origin value must not become "/". That is
 * this page. `boardPageUrl(null)` also does not use a default argument,
 * because only undefined does, and Choose new map passes share.board,
 * which is null when nothing from the board is loaded. */
/*
 * `craft` carries the pilot's aircraft over to the board, which is a primary
 * choice there rather than a filter: a whoop pilot pressing this link should
 * land on the whoop board, not on a list of tracks that would change their
 * aircraft the moment they pressed Fly. The board takes either the class or
 * the airframe id, so whichever the caller holds is fine. Omitted entirely
 * when nothing is passed, so a link built without one leaves the board on
 * whatever the visitor chose last.
 *
 * `subject` names the one track or map the link is about, as { track } or
 * { map }, and the board opens that sheet: it turns ?track=id and ?map=id
 * into its own #track= and #map= before it routes (adoptSharedLink in the
 * board's public/app.js). Every row that says "This track on Tracks and
 * times" passes one. Before 2026-10-01 none could, so a row promising "the
 * public page for" a track opened the board's front page (MENUS-PLAN.md 5.1).
 */
export function boardPageUrl(origin, craft, subject = {}) {
  const base = usableBoardOrigin(origin)
    || usableBoardOrigin(boardOrigin())
    || defaultBoardOrigin();
  const params = new URLSearchParams();
  if (craft) {
    params.set('craft', craft);
  }
  if (subject && subject.track) {
    params.set('track', subject.track);
  } else if (subject && subject.map) {
    params.set('map', subject.map);
  }
  const query = params.toString();
  return query ? `${base}/?${query}` : `${base}/`;
}

/*
 * The board's partners page (/partners there), opened on one partner's card
 * when a slug is given. The same origin rule as boardPageUrl, because it is
 * the same board.
 */
export function partnersPageUrl(origin, slug) {
  const base = usableBoardOrigin(origin)
    || usableBoardOrigin(boardOrigin())
    || defaultBoardOrigin();
  return slug ? `${base}/partners#${encodeURIComponent(slug)}` : `${base}/partners`;
}

async function readJson(res) {
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = null;
  }
  if (!res.ok) {
    const message = (body && body.error) || text || `The board answered ${res.status}.`;
    const err = new Error(message);
    err.status = res.status;
    err.conflict = Boolean(body && body.conflict) || res.status === 409;
    /* The board's refusal for a track an admin has marked official: a 403
     * that is neither a collision (conflict) nor a wrong key, and which the
     * builder words for itself. See OFFICIAL_LOCKED in the board's
     * src/store.js. */
    err.official = Boolean(body && body.official);
    throw err;
  }
  return body;
}

/*
 * Every READ of the board carries a deadline, and this is the only place
 * that number lives.
 *
 * The board is a Render web service on the free tier, so it sleeps after
 * fifteen minutes of quiet and takes about a minute to wake. DEPLOY.md says
 * the simulator is unaffected because a static site does not sleep, and that
 * was only true while nothing on the boot path talked to the board. It does:
 * a cold visit asks for the most flown track, and every Fly link asks for a
 * document. Without a deadline a board that accepts the connection and then
 * thinks about it for a minute holds the whole boot, under a loading label
 * that blames something else.
 *
 * A read that times out is the same event as a board that is down, which
 * every caller here already treats as "no community courses today". The one
 * exception is a Fly link, where the pilot asked for a specific course by
 * name: main.js turns that rejection into a banner rather than a silent
 * empty menu.
 *
 * Writes are deliberately NOT given a deadline. Abandoning a publish or a
 * posted lap time after eight seconds does not undo it at the far end, so
 * the pilot would be told it failed while the board stored it.
 */
export const BOARD_READ_TIMEOUT_MS = 8000;

function readSignal(ms = BOARD_READ_TIMEOUT_MS) {
  /* AbortSignal.timeout is the whole implementation on any browser that can
   * run this simulator. The guard is for Node, where the harness imports
   * this module to check the URLs it builds. */
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

/* A GET of the board with the deadline above, and a message that names the
 * board rather than leaking DOMException's "signal is aborted without
 * reason". */
async function boardGet(url, ms = BOARD_READ_TIMEOUT_MS) {
  try {
    return await fetch(url, { signal: readSignal(ms) });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      const err = new Error(`The board did not answer within ${Math.round(ms / 1000)} s.`);
      err.timeout = true;
      throw err;
    }
    throw e;
  }
}

/*
 * Every published course, with the plan the board already drew for its own
 * cards. This is what lets the Courses screen show the board's courses in
 * the same grid as the worlds instead of sending the player to another tab:
 * "Choose new map" used to open the board, and the board's own Fly button
 * then opened a SECOND simulator, so picking a course left the player with
 * three tabs and two running physics loops.
 *
 * The list is a nicety, not a dependency. A board that is down, blocked by
 * CORS or simply not running must leave the rest of the screen working, so
 * every caller treats a rejection as "no community courses today".
 */
/* A time off the wire, or null for one that is missing: Number(null) is 0,
 * which would read as a record of nothing at all. */
function msOrNull(v) {
  return v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
}

export async function fetchTrackList(origin = boardOrigin()) {
  const board = trimOrigin(origin);
  const res = await boardGet(`${board}/api/tracks`);
  const body = await readJson(res);
  const tracks = body && Array.isArray(body.tracks) ? body.tracks : [];
  return tracks.map((t) => ({
    id: String(t.id || ''),
    name: String(t.name || 'Untitled track'),
    author: String(t.author || ''),
    /*
     * WHO BUILT IT, WHERE THAT IS NOT WHO PUBLISHED IT. The board derives
     * these from the track's own credit block. Eight of the tracks there
     * were designed by six other people and brought over by one, and a
     * listing that only carries the publisher credits the wrong person.
     */
    designer: String(t.designer || ''),
    series: String(t.series || ''),
    gates: Number(t.gates) || 0,
    /* `best.lapMs` is the time the board ranks. On a RaceGOW room that is
     * the three lap total, and best.threeMs is set to the same number.
     * An older board sends the fastest single lap and no threeMs. */
    recordMs: t.best && Number.isFinite(Number(t.best.lapMs)) ? Number(t.best.lapMs) : null,
    recordThree: t.trackClass === 'micro' && t.best && Number.isFinite(Number(t.best.threeMs)),
    recordBy: t.best ? String(t.best.name || '') : '',
    times: Number(t.times) || 0,
    publishedUtc: t.publishedUtc ? String(t.publishedUtc) : '',
    plan: t.plan || null,
    /* What the author says it is for. Kept raw rather than through
     * usableTags, because the Race room prints these and a tag from a newer
     * board should show under its own id rather than disappear. */
    tags: Array.isArray(t.tags) ? t.tags.map((x) => String(x)) : [],
    /* Which aircraft flies it: 'micro' is a RaceGOW room and everything else
     * is the sixty metre field, which is what every track published before
     * there were two classes is. The board derives it from the stored
     * document, so an older board that does not send it leaves every listing
     * reading as the field, correctly. */
    trackClass: t.trackClass === 'micro' ? 'micro' : 'full',
    /* An admin has marked it official: only admins can change it, and only
     * admins can open it in the builder. The builder's board picker reads it,
     * so it can say so on the row without another request. A board from
     * before the mark sends none. */
    official: Boolean(t.official),
    /* Stars from pilots, { count, avg, score }. A board from before ratings
     * sends none and every track reads as not rated yet. */
    rating: cleanRating(t.rating),
    /* What the shared map picker (src/picker/picker.js) reads straight off
     * a board listing: the record as the board sent it, and whether the
     * track has a picker thumbnail and a share card to show. */
    best: t.best ? {
      lapMs: msOrNull(t.best.lapMs),
      threeMs: msOrNull(t.best.threeMs),
      name: String(t.best.name || ''),
    } : null,
    hasCard: Boolean(t.hasCard),
    cardUtc: t.cardUtc ? String(t.cardUtc) : '',
    hasThumb: Boolean(t.hasThumb),
    thumbUtc: t.thumbUtc ? String(t.thumbUtc) : '',
    board,
  })).filter((t) => t.id);
}

const FEATURED_LIMIT = 5;
const FEATURED_FLOWN_FLOOR = 3;

function byMostFlown(a, b) {
  return (b.times || 0) - (a.times || 0)
    || (b.gates || 0) - (a.gates || 0)
    || String(b.publishedUtc || '').localeCompare(String(a.publishedUtc || ''))
    || String(a.id).localeCompare(String(b.id));
}

function shuffled(items) {
  const list = items.slice();
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/*
 * Five courses for the pick-a-map strip. Ranked by times posted when that
 * ranking means something. Two or fewer flown courses is not a top five,
 * so those lead and the rest of the five are drawn at random from the
 * ones nobody has posted on yet.
 */
export function pickFeaturedTracks(tracks, limit = FEATURED_LIMIT) {
  const list = (tracks || []).filter((t) => t && t.id);
  const flown = list.filter((t) => (t.times || 0) > 0).sort(byMostFlown);
  if (flown.length >= FEATURED_FLOWN_FLOOR) {
    return list.slice().sort(byMostFlown).slice(0, limit);
  }
  const flownIds = new Set(flown.map((t) => t.id));
  const rest = shuffled(list.filter((t) => !flownIds.has(t.id)));
  return [...flown, ...rest.slice(0, Math.max(0, limit - flown.length))];
}

export function pickMostFlownTrack(tracks) {
  const list = (tracks || []).filter((t) => t && t.id);
  if (!list.length) {
    return null;
  }
  return list.slice().sort(byMostFlown)[0];
}

/*
 * The track a cold sim should open on: the board's most flown listing,
 * written into the share seat so the custom map builds it. A share that
 * is already seated, including a Fly this track link, is left alone.
 * A board that is down or empty returns null and the world still boots.
 */
export async function adoptMostFlownTrack(cls) {
  /*
   * FOR THIS AIRCRAFT, and that is the whole change here.
   *
   * The seats are one per class, so a whoop pilot with nothing seated has to
   * be handed the most flown ROOM: handing them the most flown track on the
   * board hands them a sixty metre field, which is the aircraft's own share
   * seat filled with something it cannot fly. And a whoop pilot with an
   * empty seat is the common case, because the board's five inch half is
   * years older than its whoop half.
   *
   * readShareImport with no argument reads the ACTIVE class's seat, which is
   * the one being filled, so the "already seated, leave it alone" rule below
   * is per class too.
   */
  const want = cls === 'micro' ? 'micro' : 'full';
  if (readShareImport()) {
    return null;
  }
  try {
    const origin = boardOrigin();
    /* Shorter than the shared deadline on purpose: this one runs on a cold
     * boot with nothing seated, and a visitor who did not ask for any
     * particular course should not wait the full eight seconds to find out
     * the board is asleep. A Fly link, which DID name a course, gets the
     * full deadline through fetchTrackDocument. */
    const res = await boardGet(`${trimOrigin(origin)}/api/tracks`, 4000);
    const body = await readJson(res);
    const tracks = body && Array.isArray(body.tracks) ? body.tracks : [];
    const list = tracks.map((t) => ({
      id: String(t.id || ''),
      name: String(t.name || 'Untitled track'),
      author: String(t.author || ''),
      designer: String(t.designer || ''),
      series: String(t.series || ''),
      gates: Number(t.gates) || 0,
      times: Number(t.times) || 0,
      publishedUtc: t.publishedUtc ? String(t.publishedUtc) : '',
      trackClass: t.trackClass === 'micro' ? 'micro' : 'full',
      board: trimOrigin(origin),
    })).filter((t) => t.id && t.trackClass === want);
    const top = pickMostFlownTrack(list);
    if (!top) {
      return null;
    }
    const payload = await fetchTrackDocument(top.id, top.board);
    const document = payload.document || payload;
    const share = {
      id: payload.id || top.id,
      name: payload.name || top.name || document.name,
      author: payload.author || top.author || '',
      board: top.board,
      document,
    };
    if (!writeShareImport(share)) {
      return null;
    }
    return share;
  } catch (e) {
    return null;
  }
}

export async function fetchTrackDocument(id, origin = boardOrigin()) {
  const res = await boardGet(`${trimOrigin(origin)}/api/tracks/${encodeURIComponent(id)}/document`);
  return readJson(res);
}

/*
 * THE TAG VOCABULARY, MIRRORED.
 *
 * The board's src/validate.js holds the copy of record: it decides which
 * ids are legal and it refuses an unknown one rather than dropping it, so a
 * builder that offered a tag the board did not know would tell an author
 * their track was tagged when it was not. This copy exists so the builder
 * can OFFER the list without a round trip, in exactly the way
 * src/share/pilot.js mirrors the board's NAME_RE. Two repos, so change both.
 *
 * `label` is what a person reads; `id` is what travels and never changes.
 * The board page renders the labels the board itself serves, so a relabel
 * there does not need this file at all; adding or retiring an id does.
 */
export const TRACK_TAGS = [
  { id: 'race', label: 'Race track', note: 'Built to be raced against a clock.' },
  { id: 'skills', label: 'Skills practice', note: 'Built to practise one thing until it is easy.' },
  { id: 'experiment', label: 'Experiment', note: 'Built to find out whether something works.' },
  { id: 'freestyle', label: 'Freestyle', note: 'Gates as furniture rather than as a track to be raced.' },
  { id: 'beginner', label: 'Beginner', note: 'Wide gates, gentle lines, nothing that punishes a miss.' },
  { id: 'technical', label: 'Technical', note: 'Tight, quick and unforgiving.' },
  /* "Small field", not "Micro", and the id stays `micro` because published
   * tracks carry it. It means a FIVE INCH track with a small footprint and
   * has meant that since before there was a micro track class; beside a 65
   * mm whoop, a tag labelled "Micro" is two different things one word apart.
   * The board's src/validate.js carries the same rename. */
  { id: 'micro', label: 'Small field', note: 'A five inch track that fits a small field or a garden.', classes: ['full'] },
  { id: 'big', label: 'Big field', note: 'Wants the whole field and a lot of speed.', classes: ['full'] },
  { id: 'showcase', label: 'Showcase', note: 'Built to be looked at.' },
];

/*
 * THE TAGS A CLASS'S TRACK IS OFFERED. How big a field a track wants is a
 * five inch question, and a whoop track stands in a room, so Small field and
 * Big field are not offered on one: ten of the board's thirteen rooms wore
 * Small field, which says something about a field none of them has
 * (MENUS-PLAN.md 1.27). A tag with no `classes` is every class's. What a
 * track already wears is the dialog's business, which shows a worn tag so it
 * can be taken off.
 */
export function tagsForClass(cls) {
  const want = cls === 'micro' ? 'micro' : 'full';
  return TRACK_TAGS.filter((t) => !t.classes || t.classes.includes(want));
}

/* MIRRORS TAGS_MAX in the board's src/validate.js. Past five a tag stops
 * narrowing anything, because a track wearing every tag answers every
 * filter, which is the same as wearing none. */
export const TRACK_TAGS_MAX = 5;

export function tagLabel(id) {
  const found = TRACK_TAGS.find((t) => t.id === id);
  return found ? found.label : String(id);
}

/* Keep only ids this build knows, in the vocabulary's own order, capped.
 * A track that came back from a newer board wearing a tag this build has
 * never heard of keeps it on the board and simply does not draw it here,
 * which is the safe way round: dropping it on a republish would silently
 * untag somebody's track. tagsToSend in ./listing.js is what keeps that
 * promise, by sending such a tag back beside the ones that were ticked. */
export function usableTags(list) {
  const want = Array.isArray(list) ? list.map((t) => String(t)) : [];
  return TRACK_TAGS.filter((t) => want.includes(t.id))
    .map((t) => t.id)
    .slice(0, TRACK_TAGS_MAX);
}

/*
 * A WALL IS NOT A CUBE. Both are gates that share a `group`, and the board reads neither field, so it
 * keeps the gates and loses the grouping. For a cube that is a different course: its sides are gates
 * no pass goes through, built as solid pipe by the group, and the board's copy would not have them. For
 * a wall every gate is in the flying order, each is built and scored whether or not they are grouped,
 * and the board's copy is the same course. So a group is counted below only for the pieces of it that
 * no pass goes through, and a wall of gates that are all flown is published.
 *
 * THERE IS NO LIST OF PARTS THE BOARD DOES NOT KNOW. Until 2026-10-14 a living room's table, chair and banner, a
 * hoop, a hex gate and a cube were refused here, because the board's validator and card drawer counted them as
 * nothing. The board (WebFPVSimulator-LeaderBoard, src/validate.js and public/plan.js) now counts a hoop and a
 * hex gate as gates and draws all five, and a cube was never a loss: it is ordinary gates that share a `group`,
 * and the board stores the document as it was sent. The board deploys first, as DEPLOY.md says; a simulator
 * that sends one of these to a board that predates it gets a track with a short gate count and a plan without
 * the piece, and the track itself still flies whole.
 */

export async function publishTrack({
  author, document, editKey, origin, tags,
}) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/tracks`, {
    method: 'POST',
    /* The admin's token when this tab is signed in as one, which is what
     * lets a publish through to an official track with no edit key. Nobody
     * else sends it, and the board decides what it is worth. */
    headers: { 'content-type': 'application/json', ...adminAuthHeaders(board) },
    body: JSON.stringify({
      author,
      document,
      editKey: editKey || undefined,
      /*
       * TAGS RIDE IN THE ENVELOPE, BESIDE THE AUTHOR, NOT INSIDE THE
       * DOCUMENT. The author already travels this way and for the same
       * reason: neither is part of the layout. A tag inside the document
       * would need a schemaVersion bump, which needs the board deployed
       * before the simulator, and it would have to be kept out of the
       * layout hash by hand, where getting it wrong silently clears every
       * republished track's posted times.
       *
       * A LIST GOES AS IT IS, EMPTY INCLUDED, AND ANYTHING ELSE IS LEFT
       * OUT, because the board reads the two differently: left out is
       * "leave this track's tags alone", which the rename and handle syncs
       * in ./listing.js want, and [] is "take them all off", which is how
       * an author clears them. Which one the dialog sends is tagsToSend's
       * decision, in ./listing.js. Until 25 September an empty list was
       * left out too, so that a board from before tags saw the request it
       * always had; such a board ignores the key either way, and folding
       * none into "leave them" left an author no way to clear their tags.
       */
      tags: Array.isArray(tags) ? tags : undefined,
    }),
  });
  return readJson(res);
}

/*
 * THE CARD ANIMATION FOR A ROOM.
 *
 * The board's card grid draws a plan for a track on a field and plays this
 * for a track in a room, because a five metre room's plan is an almost
 * empty rectangle and the thing it cannot show, height, is the thing a room
 * track is built out of. The board renders nothing, so the animation is
 * made here, by animate.js, in the browser that publishes the track.
 *
 * The edit key is the same one a republish uses: the browser that put the
 * track up is the browser that may change its picture. The board refuses
 * this for a field track, and that refusal is the rule rather than a guard,
 * so nothing on this side needs to ask twice.
 *
 * It is deliberately NOT fatal. The track is already published when this
 * runs, and a board that refuses the animation, or a browser whose WebGL
 * context is gone, must leave the author with a published track and a plan
 * on its card rather than an error about a picture.
 */
export async function postTrackGif({ id, gif, editKey, origin }) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/tracks/${encodeURIComponent(id)}/gif`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminAuthHeaders(board) },
    body: JSON.stringify({ gif, editKey: editKey || undefined }),
  });
  return readJson(res);
}

/*
 * THE SHARE CARD, for a track or a map: the 1200 by 630 JPEG a link to it
 * shows when it is posted. Drawn by ./card.js in the browser that
 * published, sent as base64 with that browser's edit key, exactly as the
 * animation above is. `kind` is 'track' or 'map', which is only which of
 * the board's two routes it goes to; a map's key opens a map's card and
 * nothing else.
 */
export async function postShareCard({
  kind, id, card, editKey, origin, slot = 'card',
}) {
  const board = trimOrigin(origin || boardOrigin());
  const route = kind === 'map' ? 'maps' : 'tracks';
  /* slot 'thumb' is the picker's thumbnail, the card's twin at 960 by 540
   * with no wordmark, on the same door. */
  const tail = slot === 'thumb' ? 'thumb' : 'card';
  const res = await fetch(`${board}/api/${route}/${encodeURIComponent(id)}/${tail}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminAuthHeaders(board) },
    body: JSON.stringify({ card, editKey: editKey || undefined }),
  });
  return readJson(res);
}

/*
 * ADMIN, AS THE BOARD SEES IT.
 *
 * The board holds the whitelist and the passwords and decides everything
 * here; these four functions are a way to ask it. See ./admin.js for where
 * the token lives and why that is safe.
 *
 *   adminSignIn     { email, password } for a token, remembered for this tab
 *   adminVerify     is the remembered token still good, as an email or null
 *   fetchTrackOfficial   is this track official, as a boolean, or null when
 *                   the board could not be asked
 *   setTrackOfficial     mark or unmark it, which only an admin's token can do
 *
 * An official track is the board's own: only an admin may republish it, put
 * an animation on it or change its share card, and the board refuses anybody
 * else with a 403 whose body says `official: true`. Flying it, and posting a
 * time, stay open to everyone.
 */
export async function adminSignIn({ email, password, origin }) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await readJson(res);
  const session = {
    token: String((body && body.token) || ''),
    email: String((body && body.email) || email || ''),
    expiresUtc: String((body && body.expiresUtc) || ''),
    board,
  };
  if (!writeAdminSession(session)) {
    throw new Error('The board answered without a sign in. Try again.');
  }
  return session;
}

export async function adminVerify(origin) {
  const board = trimOrigin(origin || boardOrigin());
  const headers = adminAuthHeaders(board);
  if (!headers.authorization) {
    return null;
  }
  try {
    const res = await fetch(`${board}/api/admin/session`, { headers });
    const body = await readJson(res);
    return body && typeof body.email === 'string' ? body.email : '';
  } catch (e) {
    /* A 401 or 403 is the board saying no, and the caller drops the token
     * on null. A board that is merely down also lands here, which costs an
     * admin one more sign in, and is cheaper than keeping a dead token. */
    return null;
  }
}

export async function fetchTrackOfficial(trackId, origin = boardOrigin()) {
  try {
    const res = await boardGet(`${trimOrigin(origin)}/api/tracks/${encodeURIComponent(trackId)}`, 4000);
    const body = await readJson(res);
    return Boolean(body && body.official);
  } catch (e) {
    return null;
  }
}

export async function setTrackOfficial({ id, official, origin }) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/tracks/${encodeURIComponent(id)}/official`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...adminAuthHeaders(board) },
    body: JSON.stringify({ official: Boolean(official) }),
  });
  return readJson(res);
}

/*
 * A FREESTYLE MAP ON THE BOARD, which keeps maps apart from tracks.
 *
 * The board serves them at /api/maps and never at /api/tracks, so nothing
 * on this side that reads the track list (the Courses grid, the most flown
 * track a first visit is seated on, findBoardTwin) can mistake a map for a
 * track. The edit keys are kept apart for the same reason: see
 * readMapListing in ./session.js.
 *
 * A map goes up as its document, which is already a list of references
 * with their modifiers (a type, a position, a heading, a size, a style),
 * and a drawing of it: the ground outline of every piece, measured by the
 * builder, because the board keeps no list of what pieces look like. See
 * boardPlanOf in src/trackbuilder/view2d.js. The board stores each sponsor
 * picture once however many maps wear it and hands the document back whole.
 */
export async function publishMap({
  author, document, plan, editKey, origin,
}) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/maps`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      author,
      document,
      plan,
      editKey: editKey || undefined,
    }),
  });
  return readJson(res);
}

export async function fetchMapDocument(id, origin = boardOrigin()) {
  const res = await boardGet(`${trimOrigin(origin)}/api/maps/${encodeURIComponent(id)}/document`);
  return readJson(res);
}

/*
 * Every published freestyle map, as the board lists them: no documents,
 * the outline drawing the board's own tiles are drawn from, and whether it
 * holds a share card. What the Freestyle room lists under the town and Your
 * map, the way fetchTrackList is what the Race room lists.
 *
 * Same standing as fetchTrackList: a board that is down, asleep, or older
 * than published maps (its 404 arrives here as a rejection) means no maps
 * today and never a broken room, so every caller treats a rejection that
 * way.
 */
export async function fetchMapList(origin = boardOrigin()) {
  const board = trimOrigin(origin);
  const res = await boardGet(`${board}/api/maps`);
  const body = await readJson(res);
  const maps = body && Array.isArray(body.maps) ? body.maps : [];
  return maps.map((m) => ({
    id: String(m.id || ''),
    name: String(m.name || 'Untitled map'),
    author: String(m.author || ''),
    pieces: Number(m.pieces) || 0,
    gaps: Number(m.gaps) || 0,
    publishedUtc: m.publishedUtc ? String(m.publishedUtc) : '',
    plan: m.plan || null,
    /* The share card is a frame of the map in the renderer the game flies
     * (./card.js), so it is the picture the room shows. Its stamp goes on
     * the address, which the board then lets a browser keep for good. */
    hasCard: Boolean(m.hasCard),
    cardUtc: m.cardUtc ? String(m.cardUtc) : '',
    hasThumb: Boolean(m.hasThumb),
    thumbUtc: m.thumbUtc ? String(m.thumbUtc) : '',
    official: Boolean(m.official),
    rating: cleanRating(m.rating),
    board,
  })).filter((m) => m.id);
}

/*
 * HOW MANY MAPS THE FREESTYLE ROOM SHOWS, AND WHICH.
 *
 * Ten, because the owner asked for the top ten (2026-09-26). The board keeps
 * no times and no count of flights for a map, so "top" is the board page's
 * own answer to the same question: newest first, "because a map has no
 * times to rank by and the question a returning visitor asks of this tab is
 * what is new" (MAP_SORTS in the board's public/app.js). When the board
 * learns a count, this is the one function to change.
 */
export const MAPS_SHOWN = 10;

function byNewest(a, b) {
  return String(b.publishedUtc || '').localeCompare(String(a.publishedUtc || ''))
    || String(a.id).localeCompare(String(b.id));
}

export function pickNewestMaps(maps, limit = MAPS_SHOWN) {
  return (maps || []).filter((m) => m && m.id).sort(byNewest).slice(0, limit);
}

/* The maps the Freestyle room lists, in the order the pilot chose: the ten
 * newest, or the ten best loved by the board's damped score (byRating) with
 * the newest breaking a tie. Maps nobody has rated come last either way. */
export function pickMaps(maps, order = 'newest', limit = MAPS_SHOWN) {
  const list = (maps || []).filter((m) => m && m.id);
  if (order === 'rated') {
    return list.sort((a, b) => byRating(a, b) || byNewest(a, b)).slice(0, limit);
  }
  return list.sort(byNewest).slice(0, limit);
}

/* The address of a listed map's share card, or '' when it has none. */
export function mapCardUrl(map) {
  if (!map || !map.hasCard || !map.id) {
    return '';
  }
  const stamp = map.cardUtc ? `?v=${encodeURIComponent(map.cardUtc)}` : '';
  return `${trimOrigin(map.board || boardOrigin())}/api/maps/${encodeURIComponent(map.id)}/card${stamp}`;
}

/*
 * A ?mapshare= id in the URL, from the board's Fly this map, fetched and
 * handed back as { id, name, author, board, document }, or null when the
 * URL names no map.
 *
 * NOTHING IS WRITTEN. A track from the board goes into the share seat,
 * because the custom world reads its course from there; a map is handed
 * to the built world as a document for this page load and no longer, so
 * Your map, the pilot's own, is never displaced by somebody else's. See
 * worldDocument in src/main.js.
 */
export async function adoptMapFromLocation() {
  let id = '';
  try {
    const params = new URLSearchParams(window.location.search);
    /* A ?share= track wins, as it does in boot.js and orbit.js: the two
     * never arrive together from the board, and one rule in three places
     * is what keeps a hand made link from building one world and naming
     * another. */
    id = params.get('share') ? '' : (params.get('mapshare') || '');
  } catch (e) {
    return null;
  }
  if (!id) {
    return null;
  }
  const origin = boardOrigin();
  const payload = await fetchMapDocument(id, origin);
  const document = payload.document || payload;
  return {
    id: payload.id || id,
    name: payload.name || document.name || 'Untitled map',
    author: payload.author || '',
    board: origin,
    document,
  };
}

/*
 * Put a finished freestyle run on the board.
 *
 * The board keeps ONE row per pilot per map and only their best, so posting
 * a worse run is not an error: it answers 200 with `improved: false` and the
 * standing row, and the caller tells the pilot they did not beat themselves
 * rather than congratulating them on a score that is not up there. A better
 * run answers 201.
 *
 * Nothing here is verified by the board and nothing should pretend it is:
 * the board would have to be a second copy of the recogniser and the
 * catalogue to recompute a score, and it deliberately imports neither. It
 * bounds the claim instead. See inspectRun in the board's src/validate.js.
 */
export async function postFreestyleRun({
  name, map, style, weight, summary, origin,
}) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      map,
      style,
      /* The Weight slider the run was flown at, a label on the row like
       * the style. See postTime. */
      weight,
      score: summary.total,
      durationMs: summary.durationMs,
      tricks: summary.tricks,
      unique: summary.unique,
      bestCombo: summary.bestCombo,
      bestTrick: summary.bestTrick,
      crashes: summary.crashes,
      signature: summary.signature,
    }),
  });
  return readJson(res);
}

/* The freestyle board, best first. Same standing as fetchTrackList: a board
 * that is down means an empty list, never a broken menu. */
export async function fetchFreestyleRuns(map, origin = boardOrigin()) {
  const board = trimOrigin(origin);
  const res = await boardGet(`${board}/api/runs${map ? `?map=${encodeURIComponent(map)}` : ''}`);
  const body = await readJson(res);
  const runs = body && Array.isArray(body.runs) ? body.runs : [];
  return runs.map((r) => ({
    name: String(r.name || ''),
    score: Number(r.score) || 0,
    style: String(r.style || ''),
    tricks: Number(r.tricks) || 0,
    signature: String(r.signature || ''),
  })).filter((r) => r.name && r.score > 0);
}

/* ------------------------------------------------------------------ */
/* Shared tunes and star ratings                                       */
/* ------------------------------------------------------------------ */

/*
 * A tune is the settings the Quad room edits to change how the quad flies,
 * sent to the board by a pilot who chose to and loaded by a short code.
 * The board's src/tunes.js is the copy of record for what a tune holds
 * and which values it accepts; ./tunes.js builds the payload. Called a
 * "setup" on the wire because the board's "tune" already means flight feel
 * tickets, and "Tunes" to a pilot everywhere they can read it.
 *
 *   Share a tune   POST {board}/api/setups  { author, name, notes?,
 *                  airframe, setup, raterKey } -> { id, code, editKey }
 *   Load a tune    GET {board}/api/setups/{code}  with or without dashes
 *   Rate           POST {board}/api/ratings  { kind, id, stars, raterKey }
 *                  kind is track, map or setup; stars 0 takes it back
 *
 * The browser's rater key is sent so the board can refuse a pilot rating
 * their own tune and overwrite, not add, a second vote. See ./rating.js.
 */
const TUNE_CODE_RE = /^[a-hjkmnp-tv-z2-9]{12}$/;

/* The twelve characters a pasted code means, or '' when it is not one. */
export function tuneCodeFrom(raw) {
  const id = String(raw ?? '').toLowerCase().replace(/[\s-]+/g, '');
  return TUNE_CODE_RE.test(id) ? id : '';
}

/* A code the way it is shown and said aloud: k7mq-2xrt-9vwd. */
export function tuneCodeShown(code) {
  const id = tuneCodeFrom(code);
  return id ? `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8, 12)}` : '';
}

export async function fetchTune(code, origin = boardOrigin()) {
  const id = tuneCodeFrom(code);
  if (!id) {
    throw new Error('A share code is twelve letters and numbers, like k7mq-2xrt-9vwd.');
  }
  const res = await boardGet(`${trimOrigin(origin)}/api/setups/${id}`);
  const body = await readJson(res);
  return {
    id: String(body.id || id),
    code: tuneCodeShown(body.id || id),
    name: String(body.name || 'Untitled tune'),
    author: String(body.author || ''),
    airframe: String(body.airframe || ''),
    notes: String(body.notes || ''),
    publishedUtc: body.publishedUtc ? String(body.publishedUtc) : '',
    setup: body.setup && typeof body.setup === 'object' ? body.setup : null,
    rating: cleanRating(body.rating),
    board: trimOrigin(origin),
  };
}

export async function publishTune({
  author, name, notes, airframe, setup, origin,
}) {
  const board = trimOrigin(origin || boardOrigin());
  const body = {
    author, name, airframe, setup, raterKey: raterKey(),
  };
  if (notes) {
    body.notes = notes;
  }
  const res = await fetch(`${board}/api/setups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const made = await readJson(res);
  return { id: made.id, code: made.code, editKey: made.editKey, board };
}

/* Give an item 1 to 5 stars, or 0 to take this browser's vote back. The
 * board answers with the new rating; the stars this browser has given are
 * remembered beside the key so a card can show them. */
export async function postRating({
  kind, id, stars, origin,
}) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/ratings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind, id, stars, raterKey: raterKey(),
    }),
  });
  const body = await readJson(res);
  rememberStars(kind, id, stars);
  return { rating: cleanRating(body.rating), mine: stars };
}

/* Take a tune this browser shared back down, with the key the publish gave. */
export async function removeTune({ id, editKey, origin }) {
  const board = trimOrigin(origin || boardOrigin());
  const code = tuneCodeFrom(id);
  if (!code) {
    throw new Error('A share code is twelve letters and numbers.');
  }
  const res = await fetch(`${board}/api/setups/${code}/remove`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ editKey }),
  });
  return readJson(res);
}

/* The board's Tunes tab, for a pilot who wants to look through all of them. */
export function tunesPageUrl(origin) {
  const base = usableBoardOrigin(origin)
    || usableBoardOrigin(boardOrigin())
    || defaultBoardOrigin();
  return `${base}/#tunes`;
}

/* Mirrors TIME_TAGS in the board's src/validate.js. */
export const TIME_TAGS = ['arcade', 'practice', 'tuned'];

export async function postTime({
  trackId, name, lapMs, threeMs, ghost, weight, tags, origin,
}) {
  const board = trimOrigin(origin || boardOrigin());
  /*
   * ghost and threeMs only when there is one of each: an absent key is what
   * an older board expects, and an explicit null would be a third shape for
   * no gain. threeMs is the fastest three CONSECUTIVE clean laps, which is
   * what RaceGOW scores and what a room's sheet prints beside the lap; a
   * board that has not learned the key ignores it and stores the lap, which
   * is the whole reason it is a separate optional field rather than a
   * different route.
   */
  const body = { name, lapMs };
  if (Number.isFinite(threeMs) && threeMs > 0) {
    body.threeMs = Math.round(threeMs);
  }
  if (ghost) {
    body.ghost = ghost;
  }
  /*
   * The Weight slider the lap was flown at, always sent. The board keeps it
   * on the row and prints it beside the pilot when it is not 100, and ranks
   * every lap on the clock as before (normaliseWeight in the board's
   * src/validate.js). A board that has not learned the key would store a
   * lap flown off 100 as stock, which is why DEPLOY.md has the board go
   * first.
   */
  if (Number.isInteger(weight)) {
    body.weight = weight;
  }
  /*
   * WHAT KIND OF LAP IT IS: arcade, practice, tuned (TIME_TAGS in the board's
   * src/validate.js, the copy of record). Only when there is one, so a plain
   * lap is the body it always was. Every lap posts and the board prints the
   * tags beside the pilot, the owner's ask of 2026-10-16. A board that has
   * not learned the key ignores it and prints the lap plain, which is why
   * DEPLOY.md has the board go first.
   */
  const kinds = Array.isArray(tags) ? tags.filter((t) => TIME_TAGS.includes(t)) : [];
  if (kinds.length) {
    body.tags = kinds;
  }
  const res = await fetch(`${board}/api/tracks/${encodeURIComponent(trackId)}/times`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

/*
 * The posted times on one course, for the ghost picker: id, name, lapMs and
 * whether the board holds a recording, best first, the board's own order.
 * Same standing as fetchTrackList: a board that is down means an empty
 * picker, never a broken menu, so callers treat rejection as "no times".
 */
export async function fetchTrackTimes(trackId, origin = boardOrigin()) {
  const res = await boardGet(`${trimOrigin(origin)}/api/tracks/${encodeURIComponent(trackId)}`);
  const body = await readJson(res);
  const times = body && Array.isArray(body.times) ? body.times : [];
  return times.map((t) => ({
    id: t.id ? String(t.id) : '',
    name: String(t.name || ''),
    lapMs: Number.isFinite(Number(t.lapMs)) ? Number(t.lapMs) : null,
    /* The three lap total, which is the ranked time on a RaceGOW room.
     * Null on a field and on a room post from before the board scored it. */
    threeMs: Number.isFinite(Number(t.threeMs)) ? Number(t.threeMs) : null,
    /* The Weight slider it was flown at, 100 on a row from a board older
     * than the column, which only ever took 100. */
    weight: Number.isInteger(t.weight) ? t.weight : 100,
    hasGhost: Boolean(t.hasGhost),
  })).filter((t) => t.lapMs != null);
}

/* One recorded lap off the board, as { id, name, lapMs, ghost } with ghost
 * still base64; src/share/ghostdata.js decodes it. */
export async function fetchGhost(trackId, timeId, origin = boardOrigin()) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await boardGet(
    `${board}/api/tracks/${encodeURIComponent(trackId)}/times/${encodeURIComponent(timeId)}/ghost`,
  );
  return readJson(res);
}

/*
 * A share= id in the URL becomes the course this page will fly, or the
 * course the builder will copy. The fetch is the only network either page
 * does for a published track; after that the document sits in local storage
 * like any other import. The return value is that same payload, document
 * included: the builder loads the canvas from it, not from the storage key.
 */
export async function adoptShareFromLocation() {
  let id = '';
  try {
    id = new URLSearchParams(window.location.search).get('share') || '';
  } catch (e) {
    return null;
  }
  if (!id) {
    return null;
  }
  const origin = boardOrigin();
  const payload = await fetchTrackDocument(id, origin);
  const document = payload.document || payload;
  const share = {
    id: payload.id || id,
    name: payload.name || document.name,
    author: payload.author || '',
    board: origin,
    document,
  };
  /*
   * The seat is how the custom map finds the course, so a refused write is
   * not a detail to swallow: private mode and a full quota both return
   * false here, and the boot went on to build the custom map from whatever
   * the autosave held. The pilot followed a Fly link and flew someone
   * else's track under this one's name. main.js already catches this and
   * puts the message on the banner.
   */
  if (!writeShareImport(share)) {
    throw new Error('This browser would not store that track, so it cannot be flown here.');
  }
  return share;
}
