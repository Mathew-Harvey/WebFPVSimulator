/*
 * bugs.js: send a tester ticket to the public board.
 *
 * THE CONNECTION, WRITTEN DOWN ONCE.
 *
 *   Submit     POST {board}/api/bugs   { kind, title, what, expected?,
 *                                      steps?, reporter?, context? }
 *
 * The board origin is the same one board.js already resolved: a ?board=
 * query, a stored override, then the local default. A board that is down
 * must not take the rest of the game with it. The caller shows the error.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { boardOrigin } from './board.js';

export const BUG_KINDS = [
  { id: 'crash', label: 'Crash or freeze' },
  { id: 'blocking', label: 'Cannot play' },
  { id: 'wrong', label: 'Wrong behaviour' },
  { id: 'visual', label: 'Looks wrong' },
  { id: 'feel', label: 'Flight feel' },
  { id: 'other', label: 'Other' },
];

function trimOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export async function submitBug(payload, origin = boardOrigin()) {
  const board = trimOrigin(origin);
  const res = await fetch(`${board}/api/bugs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
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
    throw err;
  }
  return body;
}
