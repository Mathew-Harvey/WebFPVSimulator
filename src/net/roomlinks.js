/*
 * roomlinks.js: the addresses that lead into a room, and back out of one.
 *
 * A room flies one world, and every way into it has to open that world and
 * then the room: a room link sent to a friend, a card on the Rooms shelf, a
 * code typed into Join. This file writes and reads those addresses, so the
 * one rule about what a link may do lives in one place:
 *
 * A LINK NEVER PUTS ANYBODY IN A ROOM. Opening one shows "Join this room?"
 * first (src/net/together.js), and nothing connects until Join is pressed.
 * The one exception is a pilot's own press a moment ago: a Rooms card or a
 * typed code on another world has to reload the page into that world, and
 * the press is carried across the reload as a token in this tab's session
 * storage, for a minute, naming the room. A token that is stale, or names
 * another room, is thrown away and the card asks as it would for a link.
 *
 * THE INVITE travels after the #, never in the query: an address's query
 * reaches the server and its logs and the referrer of whatever the page
 * fetches next, and the fragment reaches none of them. The page takes it
 * out of the address bar as soon as it has read it, so a pilot who copies
 * the address of a room they are in shares the room's code and not its
 * way past the password. (The stage 2 links put it in the query as ?i=,
 * and those still open.)
 *
 * Nothing here touches the DOM or the network, so scripts/net-selftest.js
 * proves it in Node.
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

import { MAPS } from '../maps/registry.js';

/* The board's room codes (src/rooms.js CODE_ALPHABET): six of these, never
 * O, 0, I or 1, so a code read out loud cannot be misheard. */
export const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const INVITE_RE = /^[A-Za-z0-9_-]{16}$/;
/* How long a press carries across the reload it causes. */
export const JOIN_TOKEN_MS = 60 * 1000;
const JOIN_TOKEN_KEY = 'webfpv.together.join';

/* The sim's link parameters a room address replaces, so an address that
 * was on one world and is now on another does not carry both. */
const WORLD_PARAMS = ['map', 'share', 'mapshare', 'craft', 'fly', 'room', 'i'];

/* A code as somebody typed it: spaces and dashes out, upper case. '' when
 * it is not a code. */
export function normaliseCode(raw) {
  const code = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '');
  return CODE_RE.test(code) ? code : '';
}

/* A world the sim ships, as opposed to one on the board. The starter yard
 * is `built`, and `built` is also the pilot's own map, which another pilot
 * cannot open: it is never a room's world (see roomWorldOf in ui.js). */
export function isBuiltInWorld(id) {
  return id !== 'built' && id !== 'custom' && MAPS.some((m) => m.id === id);
}

/*
 * The aircraft a room is flown on: a whoop room's whoop, a five inch room's
 * five inch, and for freestyle what the world is for (the houses are a
 * whoop's), else what the host was flying, which the pose unit says: the
 * host's page picks 1 cm for a whoop and 2 cm for a five inch.
 */
export function craftForRoom(room) {
  if (!room) {
    return '5inch';
  }
  if (room.way === 'whoop') {
    return 'whoop65';
  }
  if (room.way === '5inch') {
    return '5inch';
  }
  const m = MAPS.find((x) => x.id === room.map);
  if (m && m.craft) {
    return m.craft;
  }
  return room.scale >= 100 ? 'whoop65' : '5inch';
}

/* The sim's link parameters that open a room's world: a world it ships by
 * name, a freestyle map from the board by mapshare, a track by share. */
export function worldParamsOf(room) {
  if (isBuiltInWorld(room.map)) {
    return { map: room.map };
  }
  if (room.way === 'freestyle') {
    return { map: 'built', mapshare: room.map };
  }
  return { map: 'custom', share: room.map };
}

/*
 * A room's address: the page at `base` (origin and path), the world, the
 * aircraft, the room's code, and the invite after the # when one is given.
 * `mp` keeps ?mp=1 on the address until multiplayer is switched on for
 * everybody (stage 8), so the link a tester sends opens what they flew.
 */
export function roomUrl(base, room, { invite = '', mp = true } = {}) {
  const url = new URL(base);
  for (const k of WORLD_PARAMS) {
    url.searchParams.delete(k);
  }
  for (const [k, v] of Object.entries(worldParamsOf(room))) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set('craft', craftForRoom(room));
  if (mp) {
    url.searchParams.set('mp', '1');
  }
  url.searchParams.set('room', room.code);
  url.hash = invite && INVITE_RE.test(invite) ? `i=${invite}` : '';
  return url.href;
}

/* The room an address names, and its invite, from the query and the
 * fragment. { code: '' } when it names none. */
export function readRoomAddress(search, hash) {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch (e) {
    return { code: '', invite: '' };
  }
  const code = normaliseCode(params.get('room'));
  let invite = '';
  const h = String(hash || '').replace(/^#/, '');
  const m = /(?:^|&)i=([A-Za-z0-9_-]{16})(?:&|$)/.exec(h);
  if (m) {
    invite = m[1];
  } else if (INVITE_RE.test(params.get('i') || '')) {
    invite = params.get('i');
  }
  return { code, invite: code ? invite : '' };
}

/*
 * The address bar for a pilot in a room: the world they are on and the
 * room's code, nothing else of the room's. Returns the new href, or '' when
 * it would not change.
 */
export function addressInRoom(href, worldLink, code, mp = true) {
  const url = new URL(href);
  /* The aircraft stays: it is the one being flown, and a copied address
   * opens on it. */
  for (const k of WORLD_PARAMS) {
    if (k !== 'craft') {
      url.searchParams.delete(k);
    }
  }
  for (const [k, v] of Object.entries(worldLink || {})) {
    url.searchParams.set(k, v);
  }
  if (mp) {
    url.searchParams.set('mp', '1');
  }
  if (code) {
    url.searchParams.set('room', code);
  }
  if (/(^|&)i=/.test(url.hash.replace(/^#/, ''))) {
    url.hash = '';
  }
  return url.href === href ? '' : url.href;
}

/* The address with the room taken off, for a pilot who left. */
export function addressOutOfRoom(href) {
  const url = new URL(href);
  url.searchParams.delete('room');
  url.searchParams.delete('i');
  if (/(^|&)i=/.test(url.hash.replace(/^#/, ''))) {
    url.hash = '';
  }
  return url.href === href ? '' : url.href;
}

/* A pilot's press, carried across the reload it causes. */
export function writeJoinToken(storage, { code, invite = '' }, now) {
  try {
    storage.setItem(JOIN_TOKEN_KEY, JSON.stringify({ code, invite, at: now }));
    return true;
  } catch (e) {
    return false;
  }
}

/* The press, if there is one for this room and it is fresh; thrown away
 * either way, so it is used once. */
export function takeJoinToken(storage, code, now) {
  let t = null;
  try {
    t = JSON.parse(storage.getItem(JOIN_TOKEN_KEY) || 'null');
    storage.removeItem(JOIN_TOKEN_KEY);
  } catch (e) {
    return null;
  }
  if (!t || typeof t !== 'object' || t.code !== code || !Number.isFinite(t.at)) {
    return null;
  }
  const age = now - t.at;
  if (age < 0 || age > JOIN_TOKEN_MS) {
    return null;
  }
  return { code, invite: INVITE_RE.test(t.invite || '') ? t.invite : '' };
}
