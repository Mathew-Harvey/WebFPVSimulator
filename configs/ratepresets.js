/*
 * ratepresets.js: the pilot's named rate profiles, and the only place they
 * are stored.
 *
 * WHY THIS EXISTS. Rates are the one setting a pilot changes per track
 * rather than per machine: a tight indoor course wants less stick and a
 * wide open field wants more, and the throttle cap moves with them for the
 * same reason. Before this there was one profile and changing it lost the
 * old one, so "put it back the way it was for the other track" meant
 * remembering eleven numbers. A preset is that profile with a name on it.
 *
 * THE THROTTLE CAP IS IN HERE, and that is a decision. rates.js calls the
 * cap "not part of the rates system" because Betaflight holds it outside the
 * rate profile, and seatAirframe reseeds it when the aircraft changes. Both
 * of those are still true. What is also true, and is what the owner said, is
 * that the cap is the PILOT's choice and it changes per track exactly the
 * way the rates do. So a preset carries it, and loading a preset sets it.
 *
 * THERE IS NO SERVER. Every preset lives in this browser's local storage and
 * nowhere else. No account, no sync, nothing uploaded, and the shell says so
 * in three places rather than assuming a pilot knows what that means: the
 * lede on the Rates screen, the note on the Preset row, and the save dialog
 * at the moment it matters. See RATES_STORAGE_WARNING below, which is the
 * one copy of that sentence.
 *
 * ONE KEY, VERSIONED AND NAMESPACED, the same shape the track library uses
 * in src/trackbuilder/storage.js:
 *
 *   webfpv.rates.library.v1   every saved profile, by id
 *
 * Reads and writes go through readJson and writeJson in src/share/session.js,
 * which already swallow a private window and a full quota and answer false
 * rather than throwing. A refused write is reported to the pilot rather than
 * dropped, because a save that silently did not happen is worse than one
 * that failed loudly.
 *
 * EVERY READ IS NORMALISED. A hand edited storage entry, or one written by
 * an older build, goes through normaliseRates like any other profile, so a
 * corrupt blob cannot put a rate on the craft that the menu cannot draw.
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

import { normaliseRates, ratesDiff, ratesSummary } from './rates.js';
import { readJson, writeJson } from '../src/share/session.js';

const LIBRARY_KEY = 'webfpv.rates.library.v1';

/*
 * THE ONE COPY OF THE WARNING. It is shown on the Rates screen's lede, on
 * the Preset row's note and in the save dialog, and a pilot who reads it
 * three times in three wordings would reasonably conclude they are three
 * different facts. They are one fact.
 *
 * It says what local storage IS rather than naming it. "Local storage" is a
 * term of art; "this browser, on this device" is the thing a pilot needs to
 * know, and the list of what clears it is the part that actually bites.
 */
export const RATES_STORAGE_WARNING = 'Presets are saved in this browser on this device only. '
  + 'Clearing site data, a private window, another browser or another device all start you from '
  + 'nothing, and there is no account and nothing is uploaded.';

/* The longest name worth storing. Wider than the row can draw, so the row
 * truncates rather than the field refusing a name somebody meant. */
export const PRESET_NAME_MAX = 32;

function readLibrary() {
  const lib = readJson(LIBRARY_KEY, {});
  return (lib && typeof lib === 'object' && !Array.isArray(lib)) ? lib : {};
}

/*
 * A stable id that is not the name, so renaming keeps the preset and two
 * presets may share a name without one silently eating the other. Random
 * rather than a hash of the profile, because two tracks can legitimately
 * want the same numbers under different names.
 */
function newPresetId() {
  const n = Math.floor(Math.random() * 0xffffffff);
  return `rp-${n.toString(16).padStart(8, '0')}`;
}

/* A stored blob in the shape the rest of this module trusts, or null. The
 * rates go through normaliseRates, so a hand edited entry cannot fly.
 *
 * `key` is the id the library stores the blob under, and it is the id of
 * record when the blob has lost its own: an entry hydrated with a fresh
 * random id could be listed but never loaded or deleted, because every
 * lookup goes back through the library by id. */
function hydrate(raw, key = '') {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    return null;
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : (key || newPresetId()),
    name: name.slice(0, PRESET_NAME_MAX),
    savedUtc: typeof raw.savedUtc === 'string' ? raw.savedUtc : '',
    rates: normaliseRates(raw.rates),
  };
}

/*
 * Every saved preset, newest save first, because the one a pilot just made
 * is the one they are most likely to want back. Summaries carry the whole
 * profile rather than a digest: a rate profile is eleven small numbers, and
 * the Preset row wants to compare the live rates against every entry to
 * decide whether it is showing a loaded preset or an edited one.
 */
export function listRatePresets() {
  return Object.entries(readLibrary())
    .map(([key, raw]) => hydrate(raw, key))
    .filter(Boolean)
    .map((p) => ({ ...p, summary: ratesSummary(p.rates) }))
    .sort((a, b) => String(b.savedUtc).localeCompare(String(a.savedUtc)));
}

export function ratePresetById(id) {
  if (!id) {
    return null;
  }
  const p = hydrate(readLibrary()[id], id);
  return p ? { ...p, summary: ratesSummary(p.rates) } : null;
}

/*
 * The preset whose profile is exactly what is flying, or null.
 *
 * Compared as the CLI text the profile emits, which is the same comparison
 * src/main.js makes to decide whether a rate change reached the module at
 * all. It covers all eleven fields plus the throttle cap and curve in one
 * string, so no field can be forgotten here, and two profiles that fly
 * identically match even if one was stored by an older build with a
 * different key order.
 */
export function presetMatching(rates) {
  const want = ratesDiff(rates);
  return listRatePresets().find((p) => ratesDiff(p.rates) === want) || null;
}

export function presetNamed(name) {
  const want = String(name || '').trim().toLowerCase();
  if (!want) {
    return null;
  }
  return listRatePresets().find((p) => p.name.toLowerCase() === want) || null;
}

/*
 * Save, or replace the one that already has this name.
 *
 * REPLACING BY NAME IS THE POINT, not a convenience. A pilot who saves
 * "Bando" twice means the second one, and a library with two Bandos in it is
 * a library they have to read carefully to use. The dialog that calls this
 * already knows the name is taken and says "Replace" on its button, so the
 * decision is made where the pilot can see it and this function only carries
 * it out.
 *
 * Answers { ok, id, preset } or { ok: false } when the browser refused the
 * write. The caller tells the pilot; nothing here writes to the screen.
 */
export function saveRatePreset(name, rates) {
  const clean = String(name || '').trim().slice(0, PRESET_NAME_MAX);
  if (!clean) {
    return { ok: false, reason: 'no-name' };
  }
  const lib = readLibrary();
  const existing = presetNamed(clean);
  const id = existing ? existing.id : newPresetId();
  const preset = {
    id,
    name: clean,
    savedUtc: new Date().toISOString(),
    rates: normaliseRates(rates),
  };
  lib[id] = preset;
  if (!writeJson(LIBRARY_KEY, lib)) {
    return { ok: false, reason: 'storage' };
  }
  return { ok: true, id, preset: { ...preset, summary: ratesSummary(preset.rates) } };
}

export function deleteRatePreset(id) {
  const lib = readLibrary();
  if (!lib[id]) {
    return { ok: false, reason: 'missing' };
  }
  delete lib[id];
  if (!writeJson(LIBRARY_KEY, lib)) {
    return { ok: false, reason: 'storage' };
  }
  return { ok: true };
}
