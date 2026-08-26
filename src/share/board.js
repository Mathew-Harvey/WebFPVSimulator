/*
 * board.js: the public leaderboard, as this page sees it.
 *
 * THE CONNECTION, WRITTEN DOWN ONCE.
 *
 *   Board page     {board}/
 *   Board API      {board}/api/tracks
 *   Fly a course   {sim}/?map=custom&share={id}&board={board}
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

import { writeShareImport } from './session.js';

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
  const res = await fetch(`${board}/api/tracks`);
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

export async function fetchTrackDocument(id, origin = boardOrigin()) {
  const res = await fetch(`${trimOrigin(origin)}/api/tracks/${encodeURIComponent(id)}/document`);
  return readJson(res);
}

export async function publishTrack({ author, document, editKey, origin }) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/tracks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      author,
      document,
      editKey: editKey || undefined,
    }),
  });
  return readJson(res);
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
  const res = await fetch(`${trimOrigin(origin)}/api/tracks/${encodeURIComponent(trackId)}`);
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
  const res = await fetch(
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
    throw new Error('This browser would not store that course, so it cannot be flown here.');
  }
  return share;
}
