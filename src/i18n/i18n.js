/*
 * i18n.js: the Steam edition's languages.
 *
 * The owner, 2026-11-28: languages are a Steam selling point, "just steam".
 * So the browser edition never loads any of this: STEAM_EDITION is false
 * there, tr() is the identity, and no catalogue file is ever requested.
 *
 * HOW IT WORKS. The game's text is English, written where it is used. A
 * catalogue is a plain object from the exact English string to its
 * translation, one file per language in lang/. tr(s) answers the
 * translation if there is one and s itself if not, so a string nobody has
 * translated yet shows in English and nothing breaks. English is never a
 * catalogue: with English picked, tr() returns its argument at once.
 *
 * LATENCY. tr() is one Map lookup, called where a menu or a page builds its
 * text. It is not called in the flight loop, the input path or the render
 * loop, and the flight HUD's per frame text is not routed through it. The
 * catalogue is fetched once at boot, before the first screen is built, and
 * only the picked language's file is fetched.
 *
 * FONTS. No font is downloaded. Each language names a system stack, set on
 * the page as --ui-font when that language is picked, so a CJK or Devanagari
 * script draws with the font the machine already has.
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

import { STEAM_EDITION } from '../steam/edition.js';

export const LANG_KEY = 'webfpv.lang.v1';

/* code, the name in its own script (so a pilot who cannot read the current
 * language can still find theirs), the BCP 47 tag for the page, and the
 * system font stack that draws the script. */
export const LANGUAGES = Object.freeze([
  { code: 'en', name: 'English', tag: 'en', font: null },
  { code: 'zh-Hans', name: '简体中文', tag: 'zh-Hans', font: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif' },
  { code: 'ja', name: '日本語', tag: 'ja', font: '"Hiragino Sans", "Yu Gothic UI", "Meiryo", "Noto Sans CJK JP", "Noto Sans JP", sans-serif' },
  { code: 'ko', name: '한국어', tag: 'ko', font: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", "Noto Sans KR", sans-serif' },
  { code: 'hi', name: 'हिन्दी', tag: 'hi', font: '"Nirmala UI", "Kohinoor Devanagari", "Noto Sans Devanagari", sans-serif' },
  { code: 'es', name: 'Español', tag: 'es', font: null },
  { code: 'pt-BR', name: 'Português (Brasil)', tag: 'pt-BR', font: null },
  { code: 'de', name: 'Deutsch', tag: 'de', font: null },
  { code: 'fr', name: 'Français', tag: 'fr', font: null },
  { code: 'ru', name: 'Русский', tag: 'ru', font: null },
]);

/* The languages whose catalogue file exists. A language in LANGUAGES with no
 * file yet is not offered, so the picker never lists an empty one. */
export const SHIPPED = Object.freeze(['en', 'ja', 'zh-Hans']);

let current = 'en';
let table = null;

function known(code) {
  return SHIPPED.includes(code) ? code : null;
}

/* The language to start in: a saved choice, else the system's, else English. */
export function chooseLanguage(saved, systemList) {
  const s = known(saved);
  if (s) {
    return s;
  }
  for (const raw of systemList || []) {
    const l = String(raw || '').toLowerCase();
    /* By the primary subtag: every Chinese goes to Simplified until
     * Traditional ships, every Portuguese to Brazilian. */
    const hit = LANGUAGES.find((x) => x.code.toLowerCase().split('-')[0] === l.split('-')[0]);
    if (hit && known(hit.code)) {
      return hit.code;
    }
  }
  return 'en';
}

/* Call once at boot, before the first screen is built. The browser edition
 * returns at once and requests nothing. */
export async function initLanguage() {
  if (!STEAM_EDITION || typeof window === 'undefined') {
    return 'en';
  }
  let saved = null;
  try {
    saved = window.localStorage.getItem(LANG_KEY);
  } catch (e) {
    /* No storage: the system's language decides. */
  }
  const nav = window.navigator || {};
  const code = chooseLanguage(saved, nav.languages || [nav.language]);
  await setLanguage(code, false);
  return code;
}

export async function setLanguage(code, remember = true) {
  const lang = LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
  table = null;
  if (lang.code !== 'en') {
    try {
      const mod = await import(`./lang/${lang.code}.js`);
      table = new Map(Object.entries(mod.default));
    } catch (e) {
      /* A missing file keeps the page in English rather than blank. */
      table = null;
    }
  }
  current = table ? lang.code : 'en';
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.lang = lang.tag;
    if (table && lang.font) {
      root.style.setProperty('--ui-font', lang.font);
    } else {
      root.style.removeProperty('--ui-font');
    }
  }
  if (remember) {
    try {
      window.localStorage.setItem(LANG_KEY, lang.code);
    } catch (e) {
      /* Not remembered; the next boot follows the system. */
    }
  }
  return current;
}

export function currentLanguage() {
  return current;
}

/* The text in the picked language, or the English it was written in. */
export function tr(s) {
  if (table === null || typeof s !== 'string') {
    return s;
  }
  const hit = table.get(s);
  return hit === undefined ? s : hit;
}
