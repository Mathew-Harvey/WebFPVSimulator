/*
 * words.js: lesson text that names the stick the pilot actually holds.
 *
 * A briefing written "push the left stick up" is only true in Mode 2. The
 * setting decides which physical stick carries which channel
 * (src/input/stickmode.js), so lesson text names a channel in braces and
 * this turns it into the stick under the pilot's own thumb:
 *
 *   {throttle} {yaw} {pitch} {roll}   "the left stick", "the right stick"
 *   {Throttle} ...                    the same, capitalised
 *   {tilt}                            the stick that carries pitch and roll
 *                                     when one does, else "pitch and roll"
 *
 * With { keys: true } the keys follow the stick: "the left stick (W and S)".
 *
 * This file is part of WebFPV.
 *
 * WebFPV is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * WebFPV is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY, without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPV. If not, see <https://www.gnu.org/licenses/>.
 */

import { stickSideOf } from '../input/stickmode.js';

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* The keys a stick side stands in for on the keyboard, by axis. The map is
 * KEY_STICKS in src/input/input.js: W S A D are the left stick, the arrows
 * the right, whatever the stick mode, so the channel decides the pair. */
function keysFor(side, vertical) {
  if (side === 'left') {
    return vertical ? 'W and S' : 'A and D';
  }
  return vertical ? 'the up and down arrows' : 'the left and right arrows';
}

/* Steam edition: a pilot flying on the keyboard reads "push the left stick
 * up" and has no left stick. With keys on, the stick is named and then the
 * keys that are it, once per channel: "the left stick (W and S)". The
 * briefing's keys note says the same map in one sentence; this puts it in
 * the line the coach says at the moment it is needed. */
export function sticksIn(text, mode = 2, { keys = false } = {}) {
  if (!text) {
    return text;
  }
  const tiltSide = stickSideOf(mode, 'pitch') === stickSideOf(mode, 'roll') ? stickSideOf(mode, 'pitch') : null;
  const tilt = tiltSide
    ? `the ${tiltSide} stick${keys ? ` (${tiltSide === 'left' ? 'W S A D' : 'the arrows'})` : ''}`
    : 'pitch and roll';
  return String(text).replace(/\{(throttle|yaw|pitch|roll|tilt|Throttle|Yaw|Pitch|Roll|Tilt)\}/g, (_, ch) => {
    const lower = ch.toLowerCase();
    let words;
    if (lower === 'tilt') {
      words = tilt;
    } else {
      const side = stickSideOf(mode, lower);
      words = `the ${side} stick`;
      if (keys) {
        words += ` (${keysFor(side, lower === 'throttle' || lower === 'pitch')})`;
      }
    }
    return ch === lower ? words : cap(words);
  });
}
