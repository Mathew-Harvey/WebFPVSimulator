/*
 * stickmode.js: which stick carries which channel.
 *
 * A stick mode is not a preference about difficulty or a remapping of
 * controls in the usual sense. It is a fact about the pilot's hands, learned
 * on a transmitter and impossible to unlearn quickly, and it is the reason
 * two testers could not fly this at all:
 *
 *   bug-94da186c  "I need Mode 1 to fly on my smartphone."
 *   bug-a8cd61db  "Is it possible to change to mode 1 stickmode?"
 *
 * A RADIO NEEDS NOTHING FROM THIS. The mode lives in the transmitter, which
 * decides what its own gimbals send before the browser sees anything, and
 * the calibration wizard learns whatever comes out. It is the inputs with no
 * hardware behind them, the THUMB STICKS and the KEYBOARD, that were built
 * Mode 2 and had no way to be anything else. The setting also drives the
 * on-screen gimbals, for everybody including a radio pilot, because a
 * drawing of two sticks that disagrees with the sticks in your hands is
 * worse than no drawing.
 *
 * The four modes are two independent swaps, which is why this is a table of
 * two booleans rather than four cases:
 *
 *   mode   left stick        right stick
 *   1      yaw, pitch        roll, throttle
 *   2      yaw, throttle     roll, pitch        the default, and what this
 *                                               shell has always been
 *   3      roll, pitch       yaw, throttle
 *   4      roll, throttle    yaw, pitch
 *
 * Modes 3 and 4 are here because they cost nothing once the table exists:
 * every consumer reads the channel names out of it rather than branching on
 * a mode number, so a mode is a row and not a code path.
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

export const STICK_MODES = [1, 2, 3, 4];

/* Mode 2 is what every record on the board was flown on and what every
 * screen in this shell drew before the setting existed. */
export const DEFAULT_STICK_MODE = 2;

export function normaliseStickMode(mode) {
  const m = Number(mode);
  return STICK_MODES.includes(m) ? m : DEFAULT_STICK_MODE;
}

/*
 * The two sticks, each as the channel on its horizontal and the channel on
 * its vertical. Every consumer reads these names and never asks which mode
 * it is, which is what keeps the four modes from being four code paths in
 * the touch handler, the keyboard, the overlay and the how-to screen.
 */
export function stickChannels(mode) {
  const m = normaliseStickMode(mode);
  const throttleRight = m === 1 || m === 3;
  const yawRight = m === 3 || m === 4;
  return {
    mode: m,
    left: {
      horiz: yawRight ? 'roll' : 'yaw',
      vert: throttleRight ? 'pitch' : 'throttle',
    },
    right: {
      horiz: yawRight ? 'yaw' : 'roll',
      vert: throttleRight ? 'throttle' : 'pitch',
    },
  };
}

/* Which of the two sticks a channel sits on, for prose that has to name a
 * physical stick: "hold the LEFT stick fully to the right". */
export function stickSideOf(mode, channel) {
  const c = stickChannels(mode);
  return (c.left.horiz === channel || c.left.vert === channel) ? 'left' : 'right';
}

/*
 * A plate's caption, horizontal first, which is the order the shipped
 * captions were typed in: "Yaw, throttle" and "Roll, pitch". `sep` is the
 * only thing the two callers disagree about, a comma on the menus and a
 * middle dot on the glass.
 */
export function stickCaption(mode, side, sep = ', ') {
  const s = stickChannels(mode)[side === 'right' ? 'right' : 'left'];
  const name = (ch) => (ch === 'throttle' ? 'throttle' : ch);
  const head = `${name(s.horiz)}${sep}${name(s.vert)}`;
  return head.charAt(0).toUpperCase() + head.slice(1);
}
