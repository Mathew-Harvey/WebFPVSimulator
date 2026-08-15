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
 *   Post a time    POST {board}/api/tracks/{id}/times   { name, lapMs }
 *
 * The track document is the only payload. schema.md is the contract. The
 * logo travels inside the document, so a published course wears its sponsor
 * print on every gate and every flag the moment it is flown.
 *
 * The board origin is, in order: a ?board= query, a stored override, then
 * the local default. Production sets the stored override or edits
 * DEFAULT_BOARD_ORIGIN. Nothing here guesses a deployed host.
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

export const DEFAULT_BOARD_ORIGIN = 'http://127.0.0.1:3100';
const ORIGIN_KEY = 'webfpv.board.origin';

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
  return DEFAULT_BOARD_ORIGIN;
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

export function boardPageUrl(origin = boardOrigin()) {
  return `${trimOrigin(origin)}/`;
}

export function flyUrl(trackId, origin = boardOrigin()) {
  const here = window.location.origin;
  const board = encodeURIComponent(trimOrigin(origin));
  return `${here}/?map=custom&share=${encodeURIComponent(trackId)}&board=${board}`;
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

export async function postTime({ trackId, name, lapMs, origin }) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/tracks/${encodeURIComponent(trackId)}/times`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, lapMs }),
  });
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
  writeShareImport(share);
  return share;
}
