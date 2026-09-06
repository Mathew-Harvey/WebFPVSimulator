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
    airframe: '5inch',
    name: 'Betaflight default',
    note: 'Factory 4.5.1, untouched. What a freshly flashed quad flies.',
  },
  {
    id: 'karate-race',
    airframe: '5inch',
    name: 'Karate race 6S',
    note: 'sugarK’s 6S 5 inch race tune. Lower D, sharper feedforward, faster stops.',
  },
  {
    id: 'precision',
    airframe: '5inch',
    name: 'Precision',
    note: 'The stiff tune’s PIDs, near double stock, with the factory’s feedforward. Corrections moved at thumb speed land on your aim rather than a quarter past it.',
  },
  {
    id: 'whoop-champion',
    airframe: 'whoop65',
    name: 'Air65 II Champion',
    note: 'BetaFPV’s own factory tune for the 36000 kV racer. Low gains, a narrow D boost band, and the gains coming off a fifth of the way up the stick because 1S sags.',
  },
  {
    id: 'whoop-racing',
    airframe: 'whoop65',
    name: 'Air65 II Racing',
    note: 'The 30000 kV variant’s factory tune. More damping and less integral than the Champion, which is the shape of a tune for a motor with less authority.',
  },
  {
    id: 'whoop-freestyle',
    airframe: 'whoop65',
    name: 'Air65 II Freestyle',
    note: 'The 25000 kV variant on the bigger GF1219S prop. The highest gains of the three, and the only one BetaFPV ship on Betaflight rates rather than Actual.',
  },
];

/*
 * The tunes an airframe may load. A 6S 5 inch race tune on a 1S whoop is not
 * a thing a pilot should be able to reach by accident, and it is not merely
 * a bad idea: the whoop's PIDs are a third of the five inch's because its
 * angular acceleration is three times higher, so the wrong tune is not a
 * different feel, it is an oscillation.
 */
export function tunesFor(airframeId) {
  return TUNES.filter((t) => t.airframe === airframeId);
}

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
  /* The pilot's own dump belongs to whichever airframe is seated. It is
   * offered on both because it is THEIRS; a dump saved on a whoop and loaded
   * on a five inch is a choice a pilot made on purpose, unlike picking a
   * shipped tune off a list that should not have shown it. */
  airframe: null,
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
