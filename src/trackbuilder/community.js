/*
 * community.js: the builder's half of CommunityGow, where a club or a group of
 * friends races one whoop track a week on the board (the board's
 * public/community.js is the other half, and its COMMUNITY-PLAN.md the
 * design).
 *
 * WHAT IT IS FOR. The organiser's one job each week is to put a track up. The
 * first way to do it was Export bundle here, a download, the community's page
 * and a file picker there, in that order, on a desktop, every week. Now the
 * community's page opens this builder with the community attached, and Send
 * to the community makes the same bundle and posts it as the next round. The
 * board puts the round's track on the board as it takes it, so it is flyable
 * in the simulator from the round's page the moment it lands.
 *
 * HOW THE COMMUNITY ARRIVES. The portal's Make it in the builder link carries
 * the community's address and the board in the query and the organiser key
 * in the fragment: ?community=perth-whoop-club&board=...#cgkey=... A fragment
 * is sent to no server, so the key never reaches a log, and takeCommunity
 * reads it once, keeps all three for this tab in sessionStorage (so a reload
 * keeps the community and a new tab does not inherit it) and takes them out
 * of the address. The other way in is the organiser link itself, pasted into
 * Export bundle, which is the same three facts in the board's own shape.
 *
 * The parts that read nothing but their arguments are pure and the self test
 * runs them in Node. Only takeCommunity and its two neighbours touch the
 * window, and each of those survives having none.
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

import { BOARD_READ_TIMEOUT_MS } from '../share/board.js';

/* The board's own rules for the two strings, copied rather than imported
 * because the board is another repository: the address is the board's
 * public/community-lib.js SLUG_RE and the key its src/community.js KEY_RE. A
 * string either side would refuse is refused here before anything is sent. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;
const KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;

/* The board's limit on a pack, src/community.js MAX_PACK_BYTES. A bundle with
 * the small animation is well under it; the larger one on a long track can
 * be over, and the sentence for that is better said here than as a 413. */
export const MAX_PACK_BYTES = 4 * 1024 * 1024;

export const COMMUNITY_SESSION_KEY = 'webfpv.community.v1';

function trimBoard(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(text) ? text : '';
}

function usable(c) {
  if (!c || typeof c !== 'object') {
    return null;
  }
  const slug = String(c.slug || '').toLowerCase();
  const key = String(c.key || '');
  const board = trimBoard(c.board);
  if (!SLUG_RE.test(slug) || slug.includes('--') || !KEY_RE.test(key) || !board) {
    return null;
  }
  const name = typeof c.name === 'string' ? c.name.slice(0, 60) : '';
  return { slug, key, board, name };
}

/*
 * The community a builder address names, from its query and fragment, or
 * null. `fallbackBoard` is the board this builder talks to anyway, for an
 * address that names a community and no board.
 */
export function readCommunityLink(search, hash, fallbackBoard = '') {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch (e) {
    return null;
  }
  const slug = params.get('community');
  if (!slug) {
    return null;
  }
  const m = /[#&]cgkey=([A-Za-z0-9_-]{16,64})(?:&|$)/.exec(String(hash || ''));
  return usable({ slug, key: m ? m[1] : '', board: params.get('board') || fallbackBoard });
}

/*
 * THE ORGANISER LINK, PASTED. The board hands it out as
 * https://webfpv.org/board/CommunityGow/perth-whoop-club#key=..., and the
 * board is everything before /CommunityGow, so a board on a mount and a board
 * on a host of its own are both read right. A round's address (one more
 * segment) is accepted too, because that is the page an organiser is most
 * likely to have open.
 */
export function parseOrganiserLink(text) {
  let url;
  try {
    url = new URL(String(text || '').trim());
  } catch (e) {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }
  const segs = url.pathname.split('/');
  const at = segs.findIndex((s) => s.toLowerCase() === 'communitygow');
  if (at < 0 || !segs[at + 1]) {
    return null;
  }
  const m = /[#&]key=([A-Za-z0-9_-]{16,64})(?:&|$)/.exec(url.hash);
  let slug = '';
  try {
    slug = decodeURIComponent(segs[at + 1]);
  } catch (e) {
    return null;
  }
  return usable({ slug, key: m ? m[1] : '', board: `${url.origin}${segs.slice(0, at).join('/')}` });
}

export function communityPageUrl(c, n = 0) {
  return `${c.board}/CommunityGow/${encodeURIComponent(c.slug)}${n ? `/${n}` : ''}`;
}

/* Base64, chunked, as src/share/cardgif.js does it and for the same reason:
 * String.fromCharCode over a whole zip overflows the call stack. */
export function packBase64(bytes) {
  let raw = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    raw += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(raw);
}

/*
 * What the board knows of the community: its name and how many rounds it
 * has, so the builder can say "round 4 for Perth Whoop Club" rather than an
 * address. A read anybody can make; the key is not sent.
 */
export async function fetchCommunity(c, { fetchImpl = fetch, signal } = {}) {
  /* A read, so it has the board's read deadline (src/share/board.js says
   * why). It holds nothing up: the strip says the address until it answers,
   * and sending, a write, waits for a board that is waking. */
  const deadline = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(BOARD_READ_TIMEOUT_MS) : undefined;
  let res;
  try {
    res = await fetchImpl(`${c.board}/api/communities/${encodeURIComponent(c.slug)}`, { signal: signal || deadline });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Error(`The board did not answer within ${Math.round(BOARD_READ_TIMEOUT_MS / 1000)} s. It may be waking up, and sending still works.`);
    }
    throw new Error('Could not reach the board to read the community. Sending may still work.');
  }
  if (!res.ok) {
    const err = new Error(res.status === 404
      ? 'That community is not on the board. Open the builder again from its page.'
      : `The board answered ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const rounds = Array.isArray(body && body.rounds) ? body.rounds : [];
  return {
    name: typeof body.name === 'string' ? body.name : c.slug,
    rounds: rounds.length,
    next: rounds.reduce((n, r) => Math.max(n, Number(r && r.n) || 0), 0) + 1,
  };
}

/*
 * THE ROUND, SENT. The zip is the one Export bundle makes, as base64 in a
 * JSON body beside the organiser key: the board's add a round route, the
 * same one its own Upload a pack calls. Returns the round's number, its board
 * track (null when the board could not put the track up, which still makes a
 * round) and the round's address.
 */
export async function sendRound(c, { bytes, title = '', fetchImpl = fetch, signal } = {}) {
  if (!bytes || !bytes.length) {
    throw new Error('There is no bundle to send.');
  }
  if (bytes.length > MAX_PACK_BYTES) {
    throw new Error(`The bundle is ${Math.round(bytes.length / 1048576 * 10) / 10} MB and a community takes up to 4. Send it with the small lap animation.`);
  }
  let res;
  try {
    res = await fetchImpl(`${c.board}/api/communities/${encodeURIComponent(c.slug)}/rounds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organiserKey: c.key, pack: packBase64(bytes), title: String(title || '').slice(0, 80) }),
      signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw e;
    }
    throw new Error('Could not reach the board. Check the connection and send again.');
  }
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  if (!res.ok) {
    const err = new Error(res.status === 403
      ? 'The board did not take the organiser key. Open the builder again from the community’s page, or paste the organiser link.'
      : (body && body.error) || `The board answered ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  const n = Number(body && body.n) || 0;
  return {
    n,
    track: body && body.track && typeof body.track.id === 'string' ? body.track : null,
    url: communityPageUrl(c, n),
    name: body && body.community && typeof body.community.name === 'string' ? body.community.name : (c.name || c.slug),
  };
}

/* ------------------------------------------------------------------ */
/* This tab                                                            */
/* ------------------------------------------------------------------ */

function session() {
  try {
    return window.sessionStorage;
  } catch (e) {
    return null;
  }
}

export function rememberCommunity(c) {
  const ok = usable(c);
  const store = session();
  if (ok && store) {
    try {
      store.setItem(COMMUNITY_SESSION_KEY, JSON.stringify(ok));
    } catch (e) {
      /* Storage refused: the community lasts as long as the page. */
    }
  }
  return ok;
}

export function forgetCommunity() {
  const store = session();
  try {
    if (store) {
      store.removeItem(COMMUNITY_SESSION_KEY);
    }
  } catch (e) {
    /* Nothing to forget. */
  }
}

/*
 * The community this tab is making a round for: the one its address names,
 * taken out of the address once read, or the one a reload of this tab
 * already holds. Null for every builder visit that has nothing to do with a
 * community, which is nearly all of them.
 */
export function takeCommunity(fallbackBoard = '') {
  let fromUrl = null;
  try {
    fromUrl = readCommunityLink(window.location.search, window.location.hash, fallbackBoard);
    const params = new URLSearchParams(window.location.search);
    if (params.has('community') || /[#&]cgkey=/.test(window.location.hash)) {
      params.delete('community');
      const rest = window.location.hash.replace(/^#/, '').split('&').filter((part) => part && !part.startsWith('cgkey='));
      const query = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${rest.length ? `#${rest.join('&')}` : ''}`);
    }
  } catch (e) {
    /* No window, as in Node. */
  }
  if (fromUrl) {
    return rememberCommunity(fromUrl);
  }
  const store = session();
  if (!store) {
    return null;
  }
  try {
    return usable(JSON.parse(store.getItem(COMMUNITY_SESSION_KEY) || 'null'));
  } catch (e) {
    return null;
  }
}
