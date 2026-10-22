/*
 * sticks.js: the two gimbals, drawn, with the moves a lesson asks for.
 *
 * A briefing names the moves as channels ('throttle', 'yaw', 'pitch',
 * 'roll') and a direction. Which physical stick each channel is on depends
 * on the pilot's stick mode (src/input/stickmode.js), so the drawing is made
 * from the same table the game flies by: a Mode 1 pilot sees throttle on the
 * right. Each gimbal gets an arrow per move on it, and its stick end runs
 * the first move as a loop (the keyframes are in ./style.js).
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

import { stickChannels } from '../input/stickmode.js';

const INK = '#0b1116';
const AMBER = '#ffd45c';

/* Which way up the gimbal a direction word points, for a channel. */
function vectorOf(channel, dir) {
  const d = String(dir || '');
  if (channel === 'throttle' || channel === 'pitch') {
    if (d === 'up' || d === 'forward' || d === 'full') {
      return [0, -1];
    }
    if (d === 'down' || d === 'back') {
      return [0, 1];
    }
    return [0, 0];
  }
  if (d === 'left') {
    return [-1, 0];
  }
  if (d === 'right' || d === 'full') {
    return [1, 0];
  }
  return [0, 0];
}

function arrow(axis, sign, both) {
  /* Arrows sit just inside the gimbal's square, along the axis. */
  const parts = [];
  const head = (x, y, ang) => `<path d="M0 -9 L8 4 L-8 4 Z" transform="translate(${x} ${y}) rotate(${ang})" fill="${AMBER}" stroke="${INK}" stroke-width="2"/>`;
  if (axis === 'v') {
    if (both || sign < 0) {
      parts.push(`<line x1="60" y1="46" x2="60" y2="22" stroke="${AMBER}" stroke-width="5" stroke-linecap="round"/>`, head(60, 18, 0));
    }
    if (both || sign > 0) {
      parts.push(`<line x1="60" y1="74" x2="60" y2="98" stroke="${AMBER}" stroke-width="5" stroke-linecap="round"/>`, head(60, 102, 180));
    }
  } else {
    if (both || sign < 0) {
      parts.push(`<line x1="46" y1="60" x2="22" y2="60" stroke="${AMBER}" stroke-width="5" stroke-linecap="round"/>`, head(18, 60, 270));
    }
    if (both || sign > 0) {
      parts.push(`<line x1="74" y1="60" x2="98" y2="60" stroke="${AMBER}" stroke-width="5" stroke-linecap="round"/>`, head(102, 60, 90));
    }
  }
  return parts.join('');
}

/* The CSS animation that plays a move on the stick end. */
function animOf(channel, dir, axis) {
  const d = String(dir || '');
  if (d === 'hold') {
    return channel === 'throttle' ? 'cr-anim-hover' : 'cr-anim-still';
  }
  if (d === 'both') {
    return axis === 'v' ? 'cr-anim-vboth' : 'cr-anim-hboth';
  }
  if (d === 'tap') {
    return axis === 'v' ? 'cr-anim-vtap' : 'cr-anim-htap';
  }
  const [x, y] = vectorOf(channel, d);
  if (y < 0) {
    return d === 'full' ? 'cr-anim-upfull' : 'cr-anim-up';
  }
  if (y > 0) {
    return 'cr-anim-down';
  }
  if (x < 0) {
    return 'cr-anim-left';
  }
  if (x > 0) {
    return d === 'full' ? 'cr-anim-rightfull' : 'cr-anim-right';
  }
  return 'cr-anim-still';
}

function gimbal(side, channels, moves) {
  const ch = channels[side];
  const mine = moves.filter((m) => m.stick === ch.horiz || m.stick === ch.vert);
  const arrows = mine.map((m) => {
    const axis = m.stick === ch.vert ? 'v' : 'h';
    const [x, y] = vectorOf(m.stick, m.dir);
    const sign = axis === 'v' ? y : x;
    const both = m.dir === 'both' || m.dir === 'tap' || sign === 0;
    return m.dir === 'hold' ? '' : arrow(axis, sign, both);
  }).join('');
  const lead = mine[0];
  const anim = lead ? animOf(lead.stick, lead.dir, lead.stick === ch.vert ? 'v' : 'h') : 'cr-anim-still';
  /* A throttle stick has no spring and rests low; everything else centres. */
  const restY = ch.vert === 'throttle' ? (lead && lead.stick === 'throttle' ? 92 : 78) : 60;
  const label = (c) => (c === 'throttle' ? 'Throttle' : c.charAt(0).toUpperCase() + c.slice(1));
  return `
    <div class="cr-gimbal ${mine.length ? 'is-used' : ''}">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <rect x="6" y="6" width="108" height="108" rx="18" fill="#1a241c" stroke="${INK}" stroke-width="5"/>
        <rect x="6" y="6" width="108" height="108" rx="18" fill="none" stroke="#9db3c8" stroke-width="1.5" opacity="0.5"/>
        <line x1="60" y1="16" x2="60" y2="104" stroke="#9db3c8" stroke-width="1.2" opacity="0.35"/>
        <line x1="16" y1="60" x2="104" y2="60" stroke="#9db3c8" stroke-width="1.2" opacity="0.35"/>
        ${arrows}
        <g class="cr-stick ${anim}" style="--rest:${restY - 60}px">
          <circle cx="60" cy="60" r="13" fill="#f3ead4" stroke="${INK}" stroke-width="4"/>
          <circle cx="60" cy="60" r="5" fill="#e8a8b8"/>
        </g>
      </svg>
      <div class="cr-gimbal-cap"><b>${side === 'left' ? 'Left' : 'Right'}</b> ${label(ch.horiz)}, ${label(ch.vert)}</div>
    </div>`;
}

/* Both gimbals as an HTML string. */
export function sticksHtml(moves = [], mode = 2) {
  const channels = stickChannels(mode);
  return `<div class="cr-sticks">${gimbal('left', channels, moves)}${gimbal('right', channels, moves)}</div>`;
}
