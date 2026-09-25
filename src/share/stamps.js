/*
 * stamps.js: the STF marks this browser has found, one stamp per map.
 *
 * Every freestyle map carries the STF mark somewhere (FREESTYLE-MAPS-PLAN.md
 * section 9), and finding it puts a stamp on that map's card on the
 * Freestyle screen that stays in this browser. This is where the stamp is
 * kept. It is a record of something the pilot did, like a pilot's name,
 * so it lives in local storage and never leaves the machine: nothing here
 * talks to the network.
 *
 * THE RECORD is one versioned key, STAMPS_KEY, holding
 *
 *   { [key]: { atUtc } }
 *
 * where key is the map's `egg.key` (src/maps/README.md): 'city' for the
 * town, 'built:starter' for Hibari Yard, 'built:' and the document's id for
 * a map somebody built, and atUtc is when this browser first found it. A
 * second find keeps the first date, because the stamp is for having found
 * it, and the first time is the one worth keeping.
 *
 * STORAGE CAN SAY NO (a private window, a full quota, a policy), and a pilot
 * who found the mark in one of those still found it. So every read and
 * write is in a try, nothing here throws, and a stamp that could not be
 * written is kept in memory for the life of the page: the card shows it
 * until the page is closed, which is as long as that browser allows.
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

import { readAutosave } from '../trackbuilder/storage.js';
import { docModeOf } from '../trackbuilder/elements.js';

export const STAMPS_KEY = 'webfpv.stf.stamps.v1';

/* Stamps this page could not store, so they still show until it closes. */
const unstored = new Map();

/* A key is the map's egg key, a short string; anything else is not one. */
function isKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 200;
}

/* The stored record, with anything that is not a stamp left out, so a
 * hand edited or half written value reads as fewer stamps rather than as
 * an error. */
function readRecord() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STAMPS_KEY) || 'null');
  } catch (e) {
    return {};
  }
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return out;
  }
  for (const [key, v] of Object.entries(raw)) {
    if (isKey(key) && v && typeof v === 'object' && typeof v.atUtc === 'string') {
      out[key] = { atUtc: v.atUtc };
    }
  }
  return out;
}

/* This browser's stamp for a map's egg key, { atUtc }, or null. */
export function stampFor(key) {
  if (!isKey(key)) {
    return null;
  }
  const stored = readRecord()[key];
  if (stored) {
    return stored;
  }
  return unstored.get(key) ?? null;
}

/*
 * Stamp a map as found. Returns true when the stamp is in storage, false
 * when storage refused it and it is only held for this page. A map already
 * stamped keeps its first date and answers true.
 */
export function writeStamp(key, atUtc = new Date().toISOString()) {
  if (!isKey(key)) {
    return false;
  }
  const record = readRecord();
  if (record[key]) {
    return true;
  }
  const stamp = { atUtc: String(atUtc) };
  record[key] = stamp;
  try {
    localStorage.setItem(STAMPS_KEY, JSON.stringify(record));
    unstored.delete(key);
    return true;
  } catch (e) {
    if (!unstored.has(key)) {
      unstored.set(key, stamp);
    }
    return false;
  }
}

/*
 * The egg key of the world a card would fly, without building it, for the
 * stamp on the Freestyle screen: 'city' for the town, and for Your map the
 * key its map would give it, or null for anything that carries no mark.
 *
 * Your map flies what chooseDocument in src/maps/built/index.js picks: the
 * freestyle seat when it holds a freestyle map with something on it, the
 * starter otherwise, and stfKey in src/maps/built/egg.js keys the two
 * 'built:' and the document's id, and 'built:starter'. Neither file can be
 * imported here, because this is read at boot and both belong to a world
 * that stays off the wire until it is chosen (npm run lint:memory), so the
 * rule is restated from the seat alone, as clipKeyForMap in
 * ./orbitcache.js does for the orbit clip. Change the three together.
 */
export function stampKeyForMap(mapId) {
  if (mapId === 'city') {
    return 'city';
  }
  if (mapId !== 'built') {
    return null;
  }
  try {
    const saved = readAutosave('full', 'freestyle');
    const doc = saved && saved.doc;
    if (doc && docModeOf(doc) === 'freestyle' && doc.elements.length > 0) {
      return `built:${doc.id ? doc.id : ''}`;
    }
  } catch (e) {
    /* Unreadable: the map flies the starter, and so does its stamp. */
  }
  return 'built:starter';
}
