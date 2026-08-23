/*
 * registry.js: the tunes the shell offers, and the only place any of them
 * is named.
 *
 * A tune is a Betaflight CLI diff in this directory and nothing else. The
 * module parses it with the same code path a dropped file takes, so an
 * entry here has no privileges a pilot's own dump does not have. Adding a
 * tune is a file plus a row.
 *
 * NO TUNE HERE SETS RATES. Rates are the pilot's, chosen in Settings and
 * appended to whichever tune is loaded; see rates.js. A tune that carried a
 * rateprofile would be overridden by that append rather than winning
 * silently, but the right fix is not to carry one.
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
    id: 'betaflight-default',
    name: 'Betaflight default',
    note: 'Factory 4.5.1, untouched. What a freshly flashed quad flies.',
  },
  {
    id: 'karate-race',
    name: 'Karate race 6S',
    note: 'sugarK’s 6S 5 inch race tune. Lower D, sharper feedforward, faster stops.',
  },
  {
    id: 'crapshack',
    name: 'Crapshack',
    note: 'The stiff one, cut for this sim’s clean gyro: PIDs near double stock, locked in at mid stick, quicker yaw.',
  },
  {
    id: 'precision',
    name: 'Precision',
    note: 'Crapshack’s PIDs with the factory’s feedforward. Corrections moved at thumb speed land on your aim rather than a quarter past it.',
  },
];

/*
 * The one tune that is NOT a file here: the dump the pilot saved from the
 * Flight controller screen, held in localStorage under FC_DUMP_KEY in
 * src/fc/dump.js. It exists on the Tune row only while that save exists,
 * and it is named here so the row, the PIDs screen and the feel report
 * all call it the same thing. tunePath never serves it; src/main.js loads
 * it from storage instead of fetching.
 */
export const CUSTOM_TUNE = {
  id: 'custom',
  name: 'Your edits',
  note: 'The dump you saved on the Flight controller screen, every field of it.',
};

export function tuneById(id) {
  if (id === CUSTOM_TUNE.id) {
    return CUSTOM_TUNE;
  }
  return TUNES.find((t) => t.id === id) ?? TUNES[0];
}

export function tunePath(id) {
  /* Beside this file, not at /configs, so that the shell works wherever it
   * is mounted. webfpv.org serves it under /sim/ and Render serves it at the
   * root, and neither has to be told which. */
  return new URL(`./${tuneById(id).id}.diff`, import.meta.url).href;
}
