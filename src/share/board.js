/*
 * board.js: the public leaderboard, as this page sees it.
 *
 * THE CONNECTION, WRITTEN DOWN ONCE.
 *
 *   Board page     {board}/
 *   Board API      {board}/api/tracks
 *   Fly a track    {sim}/?map=custom&share={id}&board={board}
 *   Orbit thumb    {sim}/src/share/orbit.html?map=custom&share={id}&board={board}
 *   Publish        POST {board}/api/tracks   { author, document, editKey? }
 *   Update listing POST {board}/api/tracks   same, with the edit key from
 *                  the browser that first published. A name-only update
 *                  keeps the times. A layout change clears them.
 *   Post a time    POST {board}/api/tracks/{id}/times   { name, lapMs, ghost? }
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

import { readShareImport, writeShareImport } from './session.js';

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
export function boardPageUrl(origin) {
  const base = usableBoardOrigin(origin)
    || usableBoardOrigin(boardOrigin())
    || defaultBoardOrigin();
  return `${base}/`;
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
export async function fetchTrackList(origin = boardOrigin()) {
  const board = trimOrigin(origin);
  const res = await boardGet(`${board}/api/tracks`);
  const body = await readJson(res);
  const tracks = body && Array.isArray(body.tracks) ? body.tracks : [];
  return tracks.map((t) => ({
    id: String(t.id || ''),
    name: String(t.name || 'Untitled track'),
    author: String(t.author || ''),
    gates: Number(t.gates) || 0,
    /* `best` is the board's own shape: the fastest lap and who flew it. */
    recordMs: t.best && Number.isFinite(Number(t.best.lapMs)) ? Number(t.best.lapMs) : null,
    recordBy: t.best ? String(t.best.name || '') : '',
    times: Number(t.times) || 0,
    publishedUtc: t.publishedUtc ? String(t.publishedUtc) : '',
    plan: t.plan || null,
    /* What the author says it is for. Kept raw rather than through
     * usableTags, because the Race room prints these and a tag from a newer
     * board should show under its own id rather than disappear. */
    tags: Array.isArray(t.tags) ? t.tags.map((x) => String(x)) : [],
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
export async function adoptMostFlownTrack() {
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
      gates: Number(t.gates) || 0,
      times: Number(t.times) || 0,
      publishedUtc: t.publishedUtc ? String(t.publishedUtc) : '',
      board: trimOrigin(origin),
    })).filter((t) => t.id);
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
  { id: 'micro', label: 'Micro', note: 'Small enough for a room or a garden.' },
  { id: 'big', label: 'Big field', note: 'Wants the whole field and a lot of speed.' },
  { id: 'showcase', label: 'Showcase', note: 'Built to be looked at.' },
];

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
 * untag somebody's track. */
export function usableTags(list) {
  const want = Array.isArray(list) ? list.map((t) => String(t)) : [];
  return TRACK_TAGS.filter((t) => want.includes(t.id))
    .map((t) => t.id)
    .slice(0, TRACK_TAGS_MAX);
}

export async function publishTrack({
  author, document, editKey, origin, tags,
}) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/tracks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
       * Omitted rather than sent empty when there are none, so a board
       * from before tags sees exactly the request it has always seen.
       */
      tags: tags && tags.length ? tags : undefined,
    }),
  });
  return readJson(res);
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
export async function postFreestyleRun({ name, map, style, summary, origin }) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      map,
      style,
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

export async function postTime({ trackId, name, lapMs, ghost, origin }) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/tracks/${encodeURIComponent(trackId)}/times`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    /* ghost only when there is one: an absent key is what an older board
     * expects, and an explicit null would be a third shape for no gain. */
    body: JSON.stringify(ghost ? { name, lapMs, ghost } : { name, lapMs }),
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
