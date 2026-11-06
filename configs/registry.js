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
 * ONE SHIPPED TUNE, AND IT IS STOCK BUT FOR FOUR SETTINGS. Karate race 6S
 * and Precision used to sit below the default and they are gone, files and
 * rows both. A shipped tune is an opinion about how a quad should feel, and
 * this simulator's whole claim is that it feels like the real thing, so the
 * honest starting point is the one a freshly flashed board actually gives
 * you and every other feel is the pilot's own. The Flight controller screen
 * and the PIDs screen are where they make it: both write real Betaflight
 * keys, a Save becomes CUSTOM_TUNE below, and that dump sits on the Tune row
 * beside this one. So the set did not shrink from three answers to one, it
 * shrank from three answers to one plus yours.
 *
 * The owner made four exceptions on 2026-09-28, from the feel reports: a
 * quarter more feedforward, and I-term relax and the yaw limit set to take
 * the bounce back out of a stop. They are Betaflight's own keys at values a
 * pilot could type, each is argued in the header of
 * configs/betaflight-default.diff, and npm run feel:response flies that file
 * beside the factory tune on every run so the difference stays measured.
 * The id and the name are unchanged, so a stored choice and every screen
 * that names the tune still find it; the note says what it is. A personal
 * best does not follow it across, and should not: recordKey in src/main.js
 * hashes the composed config's text, so a lap flown on the four changes is
 * filed apart from the laps flown before them, which stay where they were.
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

import { AIRFRAMES } from './airframes.js';

/*
 * `plant` is the plant a tune was written and measured on, the simId of
 * configs/airframes.js and the argument sim_set_airframe takes. It is what
 * tunesFor offers by, and it is a fact about the tune, so it does not move
 * when an airframe does. `airframe` is who it was written for, and null
 * retires it: offered to nobody, whatever its plant.
 */
export const TUNES = [
  {
    id: 'betaflight-default',
    airframe: '5inch',
    plant: 0,
    name: 'Betaflight default',
    note: 'Betaflight\u2019s own tune with a light touch: a little quicker to answer the sticks, and less bounce back after a stop.',
  },
  {
    id: 'whoop-champion',
    airframe: 'whoop65',
    plant: 1,
    name: 'Whoop stock',
    note: 'The maker\u2019s factory 1S whoop tune. Low gains, a narrow D boost band, and the gains coming off a fifth of the way up the stick because 1S sags.',
  },
  {
    id: 'whoop-racing',
    airframe: null,
    plant: 1,
    name: 'Whoop racing',
    note: 'The 30000 kV variant’s factory tune. More damping and less integral than the stock tune, which is the shape of a tune for a motor with less authority.',
  },
  {
    id: 'whoop-freestyle',
    airframe: null,
    plant: 1,
    name: 'Whoop freestyle',
    note: 'The 25000 kV variant on the bigger GF1219S prop. The highest gains of the three, and the only one the maker ships on Betaflight rates rather than Actual.',
  },
];

/*
 * THE WHOOP'S STOCK TUNE GOES WITH PLANT 1, AND THE WHOOP IS ON PLANT 0.
 *
 * From 2026-10-09 to 2026-10-23 the whoop flew its own plant, an 0702
 * 28,000 kV 1S machine, and 'whoop-champion' was its default: it was measured
 * on that plant. Since 2026-10-23 the whoop flies the five inch's plant, the
 * one the houses were flown on, on the five inch's tune (configs/airframes.js
 * says why), so 'whoop-champion' is offered to nobody until an airframe
 * selects plant 1 again, and then it is offered with no edit here. Racing and
 * Freestyle were written for the maker's 30,000 and 25,000 kV variants and
 * were never measured on plant 1, so they stay at `airframe: null`.
 *
 * bug-bb1e9529, 2026-11-02, a five inch flown on 'whoop-champion'. tunesFor
 * used to find a tune's plant through its airframe, so when the whoop moved
 * to plant 0 its 1S tune moved with it and was offered to BOTH airframes: on
 * the five inch's Tune row and the Presets tab, and kept on every whoop that
 * held it, though the move's record says a stored whoop on 'whoop-champion'
 * is reseated on betaflight-default. 24 of the 220 feel and tune reports
 * filed between that move and this fix were flown on it, 7 of them on a five
 * inch. The tune's own `plant` is what stops that: scripts/tuneplant-check.js.
 *
 * What follows is the reason all three came off in the first place, kept
 * because it is still the rule.
 *
 *
 * They were the whoop's, and they were right for as long as the whoop was a
 * 23 g 1S machine on its own plant. It flies the five inch's plant now, and a
 * whoop preset on it is not a different feel, it is the wrong tune: P and D
 * sized against 6e-6 kg m^2 of inertia, filter cutoffs against a 23 g frame's
 * resonances, and gains that come off a fifth of the way up the stick because
 * a cell sags. That is an underdamped, sluggish machine, which is the exact
 * complaint the plant change exists to answer.
 *
 * They stay in the table and their .diff files stay on disk. They are real
 * published configurations, scripts/preset-lint.js still checks every .diff in
 * this directory against the compiled module, and if the whoop ever gets its
 * own plant back they are two characters from being offered again. What they
 * must not be is reachable for a plant they were never written for.
 *
 * That is NOT what happened to Karate race 6S and Precision. Those two were
 * right for the plant they were offered on and were removed anyway, as a
 * decision about what this simulator should ship rather than about what flies
 * on what, so their rows and their files both went. A retirement keeps the
 * file because the tune may be wanted again; a removal does not.
 */

/*
 * The tunes written for a plant, retired ones left out. tunesFor below is
 * this for the plant an airframe selects; it is exported so a check can ask
 * about a plant no airframe is on.
 */
export function tunesForPlant(simId) {
  return TUNES.filter((t) => t.airframe != null && t.plant === simId);
}

/*
 * The tunes an airframe may load. A 6S 5 inch race tune on a 1S whoop is not
 * a thing a pilot should be able to reach by accident, and the rule survives
 * the whoop changing plants: an airframe is offered the tunes written for the
 * plant it selects, read off the tune's own `plant` and never off the
 * airframe it was written for, which may since have moved (bug-bb1e9529,
 * above). A tune with a null airframe is offered to nobody, which is the
 * retirement above.
 */
export function tunesFor(airframeId) {
  const want = AIRFRAMES.find((a) => a.id === airframeId);
  return want ? tunesForPlant(want.simId) : [];
}

/*
 * Every tune that is offered to ANYBODY, which is the Tune row's rule read
 * without an airframe in hand. The Presets tab on the flight controller
 * screen is the second room that lists tunes and it has no airframe to
 * filter by, so it listed the whole table and handed a five inch pilot the
 * three retired whoop presets. Offered means offered on some airframe's Tune
 * row, so it is built from tunesFor and the two rooms cannot disagree: a tune
 * for a plant nobody flies is in neither.
 */
export const OFFERED_TUNES = TUNES.filter((t) => AIRFRAMES.some((a) => tunesFor(a.id).includes(t)));

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
  note: 'The dump you saved on the Firmware bench, every field of it.',
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
