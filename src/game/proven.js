/*
 * proven.js: which tricks the sweep has actually landed.
 *
 * Copyright (C) 2026 Mathew Harvey
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

/*
 * GENERATED FILE. Do not edit by hand.
 *
 * Written by `node scripts/trick-sweep.js --all --write`, which flies every
 * scoreable pattern from the pattern's own steps at three banks and three
 * turn errors and records what the recogniser called each flight. Rerun it
 * after any change to the catalogue or the recogniser, and commit the
 * result: the trick list reads it to tell a pilot which tricks are known to
 * score rather than presenting all of them as equally available.
 *
 * LANDED is the number of those flights the recogniser named correctly.
 * runs === landed means it named the trick on every sample.
 *
 * NOT_FLOWN is what the RIG cannot fly, which is not a statement about
 * whether a pilot can score it. The rig has no wall and cannot fly a
 * ballistic arc; a pilot has both. These are absences of evidence and the
 * list says so in those words.
 */

export const PROVEN = {
  'Rubik\'s Cube': { runs: 9, landed: 9 },
  'Cubik\'s Rube': { runs: 9, landed: 9 },
  'Vanny Roll': { runs: 9, landed: 9 },
  'Segmented Flips/Rolls': { runs: 9, landed: 9 },
  'Invert Rewind': { runs: 9, landed: 9 },
  'Juicy Flick': { runs: 9, landed: 9 },
  'Snapback': { runs: 9, landed: 9 },
  'Immelmann Turn': { runs: 9, landed: 9 },
  'Powerloop': { runs: 9, landed: 9 },
  'Maverick Loop': { runs: 9, landed: 9 },
  'Split-S': { runs: 9, landed: 3 },
  'Matty Flip': { runs: 9, landed: 9 },
  'Orbit x2': { runs: 9, landed: 9 },
  'Trippy Spin x2': { runs: 9, landed: 9 },
  '1 Trippy Spin': { runs: 9, landed: 9 },
  'Power Flip': { runs: 9, landed: 9 },
  'Power Roll': { runs: 9, landed: 7 },
  'Inverted 360 Powerloop': { runs: 9, landed: 6 },
  'Blindflip': { runs: 9, landed: 9 },
  'Mavvy Roll': { runs: 9, landed: 9 },
  'Donkey Loop': { runs: 9, landed: 9 },
  'Mavvelmann': { runs: 9, landed: 7 },
  'Anti Matty': { runs: 9, landed: 9 },
  'Power Matty': { runs: 9, landed: 9 },
  'Matty Roll': { runs: 9, landed: 9 },
  'Matty 360': { runs: 9, landed: 6 },
  'Matty Twister': { runs: 9, landed: 9 },
  'Half Matty': { runs: 9, landed: 9 },
  '540 Half Matty': { runs: 9, landed: 9 },
  'Split Yaw': { runs: 9, landed: 6 },
  'Split-Back': { runs: 9, landed: 0 },
  'Inverted Yaw Tracking': { runs: 9, landed: 9 },
  'Eject Roll': { runs: 9, landed: 9 },
  'Stellar Eject Roll': { runs: 9, landed: 9 },
  'True Barani': { runs: 9, landed: 0 },
  'Cinnamon Roll': { runs: 9, landed: 3 },
  'Side Loop': { runs: 9, landed: 9 },
  'Flip Stall Rewind': { runs: 9, landed: 9 },
  '360 Stall Rewind': { runs: 9, landed: 9 },
  'Wall Ride': { runs: 9, landed: 0 },
  'Reverse Wall Ride': { runs: 9, landed: 0 },
  'Double Flip': { runs: 9, landed: 9 },
  'Double Roll': { runs: 9, landed: 9 },
  'Flip': { runs: 9, landed: 9 },
  'Roll': { runs: 9, landed: 9 },
  'Yaw Spin': { runs: 9, landed: 9 },
  'Inverted Yaw Spin': { runs: 9, landed: 9 },
};

export const NOT_FLOWN = {
  'Beginner Matty': 'a lap carrying no rotation at all, which cannot be flown',
  'Power Split': 'two laps, which this planner does not sequence yet',
  'Barani': 'two laps, which this planner does not sequence yet',
  'Rollani': 'two laps, which this planner does not sequence yet',
  'Flipani': 'two laps, which this planner does not sequence yet',
  'Mavani': 'two laps, which this planner does not sequence yet',
  'Immelloop': 'two laps, which this planner does not sequence yet',
  'Immelmatt': 'two laps, which this planner does not sequence yet',
  'Jump Rope': 'a lap carrying no rotation at all, which cannot be flown',
  'Half Mavvy': 'two laps, which this planner does not sequence yet',
  'Wall Tap': 'needs a contact, which wants a wall and a collider',
  'Roll Tap': 'needs a contact, which wants a wall and a collider',
  'Loop Tap': 'needs a contact, which wants a wall and a collider',
  'Downtown Tap': 'needs a contact, which wants a wall and a collider',
  'Ceiling Tap': 'needs a contact, which wants a wall and a collider',
  'Maverick Tap Rewind': 'needs a contact, which wants a wall and a collider',
  'Power Switch Tap': 'needs a contact, which wants a wall and a collider',
};
