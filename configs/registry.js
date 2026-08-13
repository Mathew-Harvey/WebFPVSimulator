/*
 * registry.js: the tunes the shell offers, and the only place any of them
 * is named.
 *
 * A tune is a Betaflight CLI diff in this directory and nothing else. The
 * module parses it with the same code path a dropped file takes, so an
 * entry here has no privileges a pilot's own dump does not have. Adding a
 * tune is a file plus a row.
 *
 * `id` is the file's basename. It is also the localStorage key's value, so
 * changing one orphans a stored choice; src/ui/ui.js falls back to the
 * first row rather than throwing, because a stale setting must never stop
 * the page booting.
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

export const TUNES = [
  {
    id: 'freestyle',
    name: 'Freestyle 700',
    note: 'Stock Betaflight 4.5 tune on real freestyle rates, 700 deg/s. The house default.',
  },
  {
    id: 'betaflight-default',
    name: 'Betaflight default',
    note: 'Factory 4.5.1, untouched, on Betaflight’s own 670 deg/s rates. What a fresh flash flies.',
  },
  {
    id: 'karate-race',
    name: 'Karate race 6S',
    note: 'sugarK’s 6S 5 inch race tune with his rates. Sharper, lower D, faster stops.',
  },
];

export function tuneById(id) {
  return TUNES.find((t) => t.id === id) ?? TUNES[0];
}

export function tunePath(id) {
  return `/configs/${tuneById(id).id}.diff`;
}
