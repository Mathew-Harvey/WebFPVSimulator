/*
 * specials.js: a map with something of its own baked into the simulator,
 * painted on it whatever copy of it is flown.
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
 * A ONE OFF, AND MEANT AS ONE. A map is its document, and everything on it
 * lives there, where its author can move it or take it off. The Infinity
 * Loops map's 106 stickers lived there too, until a Publish from a copy made
 * before them took them off the board (2026-10-17, PROGRESS.md). The owner's
 * answer: "make it so they are part of that map as a special one off". So
 * for the map ids listed here, what is listed is painted on whatever document
 * is flown under that id: the board's, a builder's older copy, the pilot's own
 * seat. Nothing is written back. The document is not changed where it is
 * kept, the builder does not show what is baked in, and a Publish carries
 * only what the author put on the canvas.
 *
 * A STICKER THE DOCUMENT ALREADY WEARS IS LEFT ALONE: an id the document
 * gives to a ground logo. That is how the board's own copy flies exactly as it
 * did before this file, and how the author can still move one in the builder
 * and have it fly where they put it. It also covers the two of the map
 * author's marks that were whole logos before the tribute moved them onto a
 * sheet: a copy from before then wears them as they were, and they are not
 * painted a second time on top. One the document has lost comes back where it
 * was baked. The baked sheets are the board copy's own pictures, byte for
 * byte, and the built world groups stickers by their picture
 * (src/maps/built/ground.js), so a map that has lost half of them still
 * draws each sheet as one mesh.
 *
 * Costs nothing on any other map: one lookup by id. On this one, a module of
 * a hundred rows and two pictures fetched while the world builds, and only
 * when a sticker is missing; nothing per frame.
 */

import { newElementId, normalize, SCHEMA_VERSION } from '../trackbuilder/model.js';

/*
 * `load` is the map's baked in stickers. `everySighting` is the owner's
 * second ask of the same day, 12:41Z: "each sticker should always show the
 * achievment in this map every time you see it". A sticker anywhere else is
 * an achievement once in a browser, called out on its find and never again;
 * on a map named here the callout comes back each time the pilot sees it
 * again (findStickers in src/main.js). The find is still stamped once.
 */
/*
 * `ninety` is his third, 12:44Z: "we want a 90% acheivement, when you find 90%
 * of the stickers". Called out once in a browser, the first time the stickers
 * found there reach nine in ten of the map's, with the picture of the sticker
 * named by `picture` (the 90% patch, cut from the same sheet).
 */
const SPECIALS = {
  'trk-e6d139f6': {
    load: () => import('./specials/infinityloops.js'),
    everySighting: true,
    ninety: { word: '90%', picture: 'el-2041' },
  },
};

export function isSpecialMap(id) {
  return Object.prototype.hasOwnProperty.call(SPECIALS, String(id ?? ''));
}

export function callsEverySighting(id) {
  return isSpecialMap(id) && SPECIALS[String(id)].everySighting === true;
}

/* The share of a map's stickers whose finding is an achievement of its own. */
export const NINETY_SHARE = 0.9;

/* { word, picture } for a map with the 90% achievement, otherwise null. */
export function ninetyOf(id) {
  return isSpecialMap(id) && SPECIALS[String(id)].ninety ? { ...SPECIALS[String(id)].ninety } : null;
}

/* A sheet as the data URL a document carries, built here from the bytes
 * with its type named, so it does not depend on what type a server says a
 * .webp is, and so it is the same string the board's copy holds. */
async function sheetDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} answered ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return `data:image/webp;base64,${btoa(bin)}`;
}

/*
 * Paint what is baked in for `doc`, a normalized freestyle map, into `doc`
 * itself: the stickers it has lost and the sheets they are cut from. For the
 * world that is about to be built from it, never for a document anybody
 * keeps. Returns how many stickers were put back.
 *
 * The sheets go in past the five logo slots a document carries, because
 * they are not the author's to spend: a map whose author has filled every
 * slot still wears its stickers. `loadSheet` is for the self test, which has
 * no server to fetch from.
 */
export async function bakeSpecial(doc, { loadSheet = sheetDataUrl } = {}) {
  if (!doc || !Array.isArray(doc.elements) || !isSpecialMap(doc.id)) {
    return 0;
  }
  const special = await SPECIALS[doc.id].load();
  const worn = new Set(doc.elements.filter((e) => e.type === 'groundLogo').map((e) => e.id));
  const lost = special.STICKERS.filter((row) => !worn.has(row[0]));
  if (!lost.length) {
    return 0;
  }
  const images = await Promise.all(special.SHEETS.map((s) => loadSheet(s.url)));
  /* Read the way every document is, so a baked sticker is the same object a
   * document's own would be: its defaults filled in, its crop checked. */
  const { doc: baked } = normalize({
    schemaVersion: SCHEMA_VERSION,
    id: doc.id,
    name: doc.name,
    mode: 'freestyle',
    trackClass: doc.trackClass,
    field: { ...doc.field },
    elements: lost.map(([id, name, x, y, yaw, width, depth, sheet, cx, cy, cw, ch, found]) => ({
      id,
      type: 'groundLogo',
      name,
      position: { x, y, z: 0 },
      yaw,
      pitch: 0,
      yawOverridden: false,
      dims: { width, depth },
      logoId: special.SHEETS[sheet - 1].id,
      crop: { x: cx, y: cy, w: cw, h: ch },
      ...(found ? { achievement: special.ACHIEVEMENT } : {}),
    })),
    sequence: [],
  });
  if (!doc.branding || !Array.isArray(doc.branding.logos)) {
    doc.branding = { logos: [] };
  }
  special.SHEETS.forEach((s, i) => {
    if (!doc.branding.logos.some((l) => l.id === s.id)) {
      doc.branding.logos.push({ id: s.id, image: images[i], name: s.name });
    }
  });
  const taken = new Set(doc.elements.map((e) => e.id));
  for (const el of baked.elements) {
    /* An id the document has given to something else keeps that something,
     * and the sticker takes a new one. */
    if (taken.has(el.id)) {
      el.id = newElementId(doc);
    }
    taken.add(el.id);
    doc.elements.push(el);
  }
  return baked.elements.length;
}
