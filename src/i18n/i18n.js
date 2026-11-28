/*
 * i18n.js: the Steam edition's languages.
 *
 * The owner, 2026-11-28: languages are a Steam selling point, "just steam".
 * So the browser edition never loads any of this: STEAM_EDITION is false
 * there, tr() is the identity, nothing watches the page and no catalogue
 * file is ever requested.
 *
 * HOW IT WORKS. The game's text is English, written where it is used, and it
 * stays that way: no string in the game was moved into a table. A catalogue
 * (lang/<code>.js) is a plain object from a short id to a translation, and
 * the id is a hash of the English string (keyOf), so the catalogue never
 * repeats the English and the page never ships a second copy of it.
 * source.json beside this file is the list of English strings the ids were
 * made from, for the lint and for whoever translates next; the game never
 * loads it.
 *
 * tr(s) answers the translation if there is one and s itself if not, so a
 * string nobody has translated yet shows in English and nothing breaks. With
 * English picked, tr() returns its argument at once.
 *
 * A STRING WITH SOMETHING IN IT. "Lap 2 of 3" and "Change the dogfight" are
 * not in any table as written. Four tries, in this order, and the answer is
 * remembered so the second asking is one Map read:
 *   1. the string itself;
 *   2. the string with its numbers taken out, "Lap {0} of {1}", and the
 *      numbers put back into the translation where it names them;
 *   3. the patterns (patterns.js): English templates with holes for words,
 *      "Change the {0}", matched whole; what fell in a hole is translated
 *      the same way and put where the translation names it;
 *   4. the string split at " · " and its like, each part on its own.
 *
 * WHERE THE TEXT IS CAUGHT. Three places.
 *   - A watcher on the page (watchPage): every text node, title,
 *     placeholder and aria-label that arrives or changes is passed through
 *     tr(). It runs before the frame is painted, so English is never seen.
 *   - The few makers of text that read it straight back or draw it on a
 *     canvas (el() in src/ui/ui.js, the lettering, the flight HUDs) call
 *     tr() themselves.
 *   - Nothing else. In-world signs are art and stay as drawn.
 *
 * LATENCY. THE WATCHER IS OFF IN FLIGHT. flightText(true) disconnects it
 * when the pilot takes off and flightText(false) puts it back and reads the
 * page again when a menu returns, so the flight loop, the input path and the
 * HUD's per frame numbers never pass through here. What a flight HUD says
 * in words (a trick's name, GOAL!) is translated where the HUD already
 * repaints that word, on the event and never per frame, and that is one Map
 * read. The catalogue is fetched once at boot, before the first screen is
 * built, and only the picked language's file is fetched.
 *
 * FONTS. No font is downloaded. Each language names a system stack, set on
 * the page as --ui-font when that language is picked, and the page's lang
 * attribute picks the right Han glyphs for Chinese against Japanese.
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

import { STEAM_EDITION, DESKTOP } from '../steam/edition.js';

export const LANG_KEY = 'webfpv.lang.v1';

const LATIN = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/* code, the name in its own script (so a pilot who cannot read the current
 * language can still find theirs), the BCP 47 tag for the page, Steam's own
 * name for the language (its API language code), and the system fonts that
 * draw the script, which go AFTER the Latin stack: a Latin letter or a
 * digit keeps the shell's own face and only the script's glyphs fall
 * through to these. null means the Latin stack already draws it. */
export const LANGUAGES = Object.freeze([
  { code: 'en', name: 'English', tag: 'en', steam: 'english', font: null },
  { code: 'zh-Hans', name: '简体中文', tag: 'zh-Hans', steam: 'schinese', font: '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", "WenQuanYi Zen Hei"' },
  { code: 'ja', name: '日本語', tag: 'ja', steam: 'japanese', font: '"Yu Gothic UI", "Yu Gothic", Meiryo, "Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", "IPAPGothic"' },
  { code: 'ko', name: '한국어', tag: 'ko', steam: 'koreana', font: '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR"' },
  { code: 'hi', name: 'हिन्दी', tag: 'hi', steam: 'hindi', font: '"Nirmala UI", "Kohinoor Devanagari", "Noto Sans Devanagari", "Mangal"' },
  { code: 'es', name: 'Español', tag: 'es', steam: 'spanish', font: null },
  { code: 'pt-BR', name: 'Português (Brasil)', tag: 'pt-BR', steam: 'brazilian', font: null },
  { code: 'de', name: 'Deutsch', tag: 'de', steam: 'german', font: null },
  { code: 'fr', name: 'Français', tag: 'fr', steam: 'french', font: null },
  { code: 'ru', name: 'Русский', tag: 'ru', steam: 'russian', font: null },
]);

/* The languages whose catalogue file exists. A language in LANGUAGES with no
 * file is not offered, so the picker never lists an empty one. */
export const SHIPPED = Object.freeze(['en', 'zh-Hans', 'ja', 'ko', 'hi', 'es', 'pt-BR', 'de', 'fr', 'ru']);

/* Steam's other names for a language this game has: Latin American Spanish
 * reads the Spanish, Portugal's Portuguese the Brazilian, and Traditional
 * Chinese the Simplified until it has a catalogue of its own. */
const STEAM_ALSO = { latam: 'es', portuguese: 'pt-BR', tchinese: 'zh-Hans' };

let current = 'en';
/* id -> translation, or null in English. */
let table = null;
/* [{ key, re, anchor }], the patterns with holes for words, longest first. */
let patterns = [];
/* string -> translation or MISS, so a second asking is one read. */
let memo = new Map();
/* Every string this module has written, so the watcher can tell its own
 * work from English that only looks untranslated. */
let outs = new Set();
const MISS = Symbol('miss');
const MEMO_MAX = 6000;

/* ?i18n=collect: every string that found no translation, for
 * scripts/i18n-collect.js. Never on unless the address asks. */
let misses = null;

/*
 * The id of an English string: FNV-1a over its UTF-16 units, in base 36.
 * White space is folded first (fold), so a string wrapped across lines in
 * the HTML and the same string on one line in the script are one id.
 * scripts/i18n-check.js fails on two strings that share an id.
 */
export function keyOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function fold(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/* A number as the game writes one: 12, 1.5, 0:42.317, 1,024, and a sign. */
const NUM = /\d+(?:[.,:]\d+)*/g;
const SEPS = [' · ', ' | ', ' / ', ' • '];
const HOLE = /\{(\d+)\}/g;
const SENTENCE = /(?<=[.!?])\s+(?=[A-Z0-9"\u201c(])/;
/* What joins two sentences: nothing where the full stop is its own width. */
let joiner = ' ';
/* The full stop a label gets when it is read out as a sentence. */
let stop = '.';
let colon = ':';

function fill(tpl, parts) {
  return tpl.replace(HOLE, (m, i) => (parts[i] === undefined ? m : parts[i]));
}

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* An English template as a matcher. A hole takes anything, as little as it
 * can; the template's own words must all be there. */
export function compilePattern(src) {
  const lits = src.split(/\{\d+\}/);
  const order = [];
  src.replace(HOLE, (m, i) => {
    order.push(Number(i));
    return m;
  });
  let anchor = '';
  for (const l of lits) {
    if (l.length > anchor.length) {
      anchor = l;
    }
  }
  const re = new RegExp(`^${lits.map(esc).join('([\\s\\S]*?)')}$`);
  return {
    key: keyOf(src), re, anchor, order, size: lits.join('').length, open: /\}$/.test(src),
  };
}

/* The collector is told which parts of a joined line found nothing. */
function noteGaps(gaps) {
  if (misses) {
    for (const g of gaps) {
      if (g.length > 1 && /[A-Za-z]/.test(g)) {
        misses.add(g);
      }
    }
  }
}

/* For scripts/i18n-collect.js and the lint: a Set to fill with every string
 * that finds no translation, or null to stop. */
export function collectMisses(set) {
  misses = set || null;
}

/* The string itself, with its numbers out, or through a pattern. */
function direct(core, depth) {
  let t = table.get(keyOf(core));
  if (t !== undefined) {
    return t;
  }
  const nums = [];
  const shaped = core.replace(NUM, (m) => {
    nums.push(m);
    return `{${nums.length - 1}}`;
  });
  if (nums.length) {
    t = table.get(keyOf(shaped));
    if (t !== undefined) {
      return fill(t, nums);
    }
  }
  if (depth > 3) {
    return null;
  }
  /* A pattern that ends in a hole does not take a sentence's own full stop
   * into it ("Change the track." would hand "track." to the hole, and a
   * language that puts the hole first would print the stop mid sentence).
   * The stop comes off below and the pattern meets the line without it. */
  const stopped = core.endsWith('.') && !core.endsWith('..');
  for (let i = 0; i < patterns.length; i += 1) {
    const p = patterns[i];
    if (!core.includes(p.anchor) || (stopped && p.open)) {
      continue;
    }
    const m = p.re.exec(core);
    if (!m) {
      continue;
    }
    /* A hole holds a word, a name or a clause, never the end of one
     * sentence and the start of the next: "{0} is a different size from
     * {1}." must not take the sentence that follows it into {1}. A line
     * of several sentences is taken apart by lookup, and each comes back
     * here on its own. */
    let spans = false;
    for (let k = 1; k < m.length && !spans; k += 1) {
      spans = SENTENCE.test(m[k]);
    }
    if (spans) {
      continue;
    }
    const parts = [];
    for (let k = 0; k < p.order.length; k += 1) {
      const got = m[k + 1];
      const said = got.trim() ? lookup(fold(got), depth + 1) : null;
      parts[p.order[k]] = said === null ? got : said;
    }
    return fill(table.get(p.key), parts);
  }
  /* A label read out as a sentence ("Dogfight." for a screen reader, from
   * the row "Dogfight"), and a line a maker put in quotes. */
  if (core.length > 2 && core.endsWith('.') && !core.endsWith('..')) {
    t = direct(core.slice(0, -1), depth + 1);
    if (t !== null) {
      return /[.。।!?]$/.test(t) ? t : t + stop;
    }
  }
  /* A label with the colon of the value that follows it ("Your whoop
   * tune:" from the row "Your whoop tune"). */
  if (core.length > 2 && core.endsWith(':')) {
    t = direct(core.slice(0, -1), depth + 1);
    if (t !== null) {
      return /[:：]$/.test(t) ? t : t + colon;
    }
  }
  return null;
}

function lookup(core, depth) {
  const whole = direct(core, depth);
  if (whole !== null || depth > 3) {
    return whole;
  }
  for (const sep of SEPS) {
    if (core.includes(sep)) {
      const parts = core.split(sep);
      const gaps = [];
      let any = false;
      const said = parts.map((part) => {
        const f = fold(part);
        const o = f ? lookup(f, depth + 1) : null;
        if (o !== null) {
          any = true;
          return o;
        }
        gaps.push(f);
        return part;
      });
      if (any) {
        noteGaps(gaps);
        return said.join(sep);
      }
    }
  }
  /*
   * Sentences, for a line made by joining them ("Fly solo. Career, racing
   * and the builder."). The longest run of sentences that has a translation
   * is taken first, because a note of two sentences is one string in the
   * catalogue, and what is left is tried the same way. The line is in the
   * pilot's language as far as its sentences are.
   */
  const sentences = core.split(SENTENCE);
  if (sentences.length > 1) {
    let any = false;
    const gaps = [];
    const said = [];
    for (let i = 0; i < sentences.length;) {
      let took = 0;
      let o = null;
      for (let j = sentences.length; j > i; j -= 1) {
        if (i === 0 && j === sentences.length) {
          continue;
        }
        o = direct(sentences.slice(i, j).join(' '), depth + 1);
        if (o !== null) {
          took = j - i;
          break;
        }
      }
      if (took) {
        any = true;
        said.push(o);
        i += took;
      } else {
        gaps.push(sentences[i]);
        said.push(sentences[i]);
        i += 1;
      }
    }
    if (any) {
      noteGaps(gaps);
      return said.join(joiner);
    }
  }
  return null;
}

/*
 * A sentence built from parts, for the few makers that build one: the
 * template in the pilot's language with the parts, already in it, put where
 * it names them. trf('{0}, then {1}', a, b). In English it is the template
 * filled, which is what the maker wrote before.
 */
export function trf(template, ...parts) {
  return fill(tr(template), parts);
}

/* The text in the picked language, or the English it was written in. */
export function tr(s) {
  if (table === null || typeof s !== 'string' || s === '') {
    return s;
  }
  const had = memo.get(s);
  if (had !== undefined) {
    return had === MISS ? s : had;
  }
  let out = MISS;
  /* English has a Latin letter in it; a number, a time or a name already
   * in another script has nothing here to find. */
  if (/[A-Za-z]/.test(s) && !outs.has(s)) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    const core = fold(m[2]);
    const said = core ? lookup(core, 0) : null;
    if (said !== null) {
      out = m[1] + said + m[3];
      outs.add(out);
    } else if (m[2].includes('\n')) {
      /* A banner of two or three lines, each a sentence of its own with
       * no full stop to part them: line by line, and the lines kept. The
       * whole is tried first, because a paragraph a maker wrapped in the
       * source is one string. */
      let any = false;
      const lines = m[2].split('\n').map((line) => {
        const o = tr(line);
        any = any || o !== line;
        return o;
      });
      if (any) {
        out = m[1] + lines.join('\n') + m[3];
        outs.add(out);
      }
    } else if (misses && core.length > 1) {
      misses.add(core);
    }
  }
  if (memo.size >= MEMO_MAX) {
    memo = new Map();
  }
  memo.set(s, out);
  return out === MISS ? s : out;
}

/* True when a language other than English is in force. */
export function translating() {
  return table !== null;
}

/* ------------------------------------------------------------------ *
 * The watcher
 * ------------------------------------------------------------------ */

const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
/* What is never read: code, what a pilot is typing, and anything a maker
 * marked as not text (data-i18n="off": a name, a code, a chat line). */
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CANVAS', 'SVG', 'CODE', 'PRE']);

let observer = null;
let watched = null;
let inFlight = false;

function skipped(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    if (SKIP.has(n.nodeName.toUpperCase()) || n.isContentEditable || (n.dataset && n.dataset.i18n === 'off')) {
      return true;
    }
  }
  return false;
}

function sayText(node) {
  const src = node.data;
  if (!src || outs.has(src)) {
    return;
  }
  const out = tr(src);
  if (out !== src) {
    node.data = out;
  }
}

function sayAttrs(el) {
  for (const a of ATTRS) {
    const src = el.getAttribute(a);
    if (src && !outs.has(src)) {
      const out = tr(src);
      if (out !== src) {
        el.setAttribute(a, out);
      }
    }
  }
}

function sayTree(root) {
  if (root.nodeType === 3) {
    if (root.parentNode && !skipped(root.parentNode)) {
      sayText(root);
    }
    return;
  }
  if (root.nodeType !== 1 || skipped(root)) {
    return;
  }
  sayAttrs(root);
  const walker = root.ownerDocument.createTreeWalker(root, 5, {
    acceptNode(n) {
      if (n.nodeType === 1) {
        return SKIP.has(n.nodeName.toUpperCase()) || n.isContentEditable || n.dataset.i18n === 'off' ? 2 : 1;
      }
      return 1;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) {
      sayText(n);
    } else {
      sayAttrs(n);
    }
  }
}

function onChange(records) {
  for (const r of records) {
    if (r.type === 'characterData') {
      if (r.target.parentNode && !skipped(r.target.parentNode)) {
        sayText(r.target);
      }
    } else if (r.type === 'attributes') {
      if (!skipped(r.target)) {
        sayAttrs(r.target);
      }
    } else {
      for (const n of r.addedNodes) {
        sayTree(n);
      }
    }
  }
}

/* On a menu everything is watched. In the air only what is ADDED is: see
 * flightText. */
const ALL = {
  subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS,
};
const ADDED = { subtree: true, childList: true };

function connect() {
  if (observer && watched) {
    observer.observe(watched, inFlight && !misses ? ADDED : ALL);
  }
}

/*
 * Read the page into the picked language and keep it there. In English, or
 * in the browser edition, this does nothing at all.
 */
export function watchPage(root) {
  if (table === null || typeof MutationObserver === 'undefined' || !root) {
    return;
  }
  watched = root;
  sayTree(root);
  if (!observer) {
    observer = new MutationObserver(onChange);
  }
  connect();
}

/*
 * The pilot took off (true) or a menu came back (false).
 *
 * IN THE AIR THE WATCHER STOPS LISTENING FOR TEXT THAT CHANGES. A lap clock,
 * a speed and a score are text nodes whose data is rewritten, as often as
 * every frame, and a watcher told about that would be woken every frame to
 * look at a number. So in flight it is told only when an element is ADDED:
 * a callout, a banner, a row of a results panel, which happen on an event.
 * Writing new data into a text node that is already there tells it nothing
 * (the engine the Steam edition ships rewrites the one text node in place
 * and reports that as a change of data, which is not asked for), so the
 * flight loop and the HUD's numbers never come through here. A HUD word
 * that changes inside a node that is already there (REC to CUT) is
 * translated where the HUD writes it, with tr(), on that event.
 *
 * Back on a menu the page is read once and everything is watched again.
 */
export function flightText(flying) {
  const now = Boolean(flying);
  if (now === inFlight) {
    return;
  }
  inFlight = now;
  if (!observer || !watched) {
    return;
  }
  /* What changed in the same task as the switch is still read. */
  onChange(observer.takeRecords());
  observer.disconnect();
  if (!now) {
    sayTree(watched);
  }
  connect();
}

/* ------------------------------------------------------------------ *
 * Choosing and loading
 * ------------------------------------------------------------------ */

function known(code) {
  return SHIPPED.includes(code) ? code : null;
}

/* The language to start in: a saved choice, else Steam's own setting, else
 * the system's, else English. */
export function chooseLanguage(saved, systemList, steamName) {
  const s = known(saved);
  if (s) {
    return s;
  }
  const steam = String(steamName || '').toLowerCase();
  if (steam) {
    const hit = LANGUAGES.find((l) => l.steam === steam);
    const code = hit ? hit.code : STEAM_ALSO[steam];
    if (code && known(code)) {
      return code;
    }
  }
  for (const raw of systemList || []) {
    const l = String(raw || '').toLowerCase();
    if (!l) {
      continue;
    }
    /* By the primary subtag: every Chinese goes to Simplified until
     * Traditional ships, every Portuguese to Brazilian. */
    const hit = LANGUAGES.find((x) => x.code.toLowerCase().split('-')[0] === l.split('-')[0]);
    if (hit && known(hit.code)) {
      return hit.code;
    }
    /* The first language the system names that this game does not have
     * ends the search only if it is English. */
    if (l.split('-')[0] === 'en') {
      return 'en';
    }
  }
  return 'en';
}

/* The system fonts for the picked language's script, to follow a Latin
 * stack in a canvas font, or '' when the Latin stack draws it. */
export function scriptFont() {
  const lang = LANGUAGES.find((l) => l.code === current);
  return table && lang && lang.font ? lang.font : '';
}

/* A canvas font stack: the given faces, then the script's. */
export function fontFor(stack) {
  const f = scriptFont();
  return f ? `${stack}, ${f}` : stack;
}

let ready = null;

/*
 * Call at boot, before the first screen is built; safe to call again, the
 * second call waits on the first. The browser edition returns at once and
 * requests nothing.
 */
export function initLanguage() {
  if (!ready) {
    ready = start();
  }
  return ready;
}

async function start() {
  if (!STEAM_EDITION || typeof window === 'undefined') {
    return 'en';
  }
  let saved = null;
  let asked = null;
  try {
    const q = new URLSearchParams(window.location.search);
    asked = q.get('lang');
    if (q.get('i18n') === 'collect') {
      misses = new Set();
      window.__i18nMisses = misses;
    }
  } catch (e) {
    /* No address to read. */
  }
  try {
    saved = window.localStorage.getItem(LANG_KEY);
  } catch (e) {
    /* No storage: Steam's setting or the system's decides. */
  }
  const nav = window.navigator || {};
  const steam = DESKTOP && DESKTOP.steam && typeof DESKTOP.steam.language === 'string' ? DESKTOP.steam.language : '';
  const code = asked === 'zz' ? 'zz' : chooseLanguage(known(asked) || saved, nav.languages || [nav.language], steam);
  await setLanguage(code, false);
  return current;
}

/*
 * Put a catalogue in force: { id: translation }, the English patterns, and
 * the language's code. setLanguage does this with the files it fetched;
 * scripts/i18n-check.js does it with objects of its own, to test the four
 * tries above without a browser. null puts English back.
 */
export function useCatalogue(catalogue, patternSources = [], code = 'en') {
  memo = new Map();
  outs = new Set();
  if (!catalogue) {
    table = null;
    patterns = [];
    current = 'en';
    joiner = ' ';
    stop = '.';
    colon = ':';
    return;
  }
  table = new Map(Object.entries(catalogue));
  for (const v of table.values()) {
    outs.add(v);
  }
  patterns = patternSources.map(compilePattern)
    .filter((p) => table.has(p.key) && /[A-Za-z]{3}/.test(p.anchor))
    .sort((a, b) => b.size - a.size);
  current = code;
  joiner = current === 'ja' || current === 'zh-Hans' ? '' : ' ';
  stop = current === 'ja' || current === 'zh-Hans' ? '\u3002' : current === 'hi' ? '\u0964' : '.';
  colon = current === 'ja' || current === 'zh-Hans' ? '\uff1a' : ':';
}

export async function setLanguage(code, remember = true) {
  const lang = LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
  useCatalogue(null);
  if (code === 'zz' && misses) {
    /* The collector's language: no translations, so everything misses. */
    useCatalogue({}, [], 'zz');
  } else if (lang.code !== 'en') {
    try {
      const [cat, pat] = await Promise.all([import(`./lang/${lang.code}.js`), import('./patterns.js')]);
      useCatalogue(cat.default, pat.default, lang.code);
    } catch (e) {
      /* A missing file keeps the page in English rather than blank. */
      useCatalogue(null);
    }
  }
  if (typeof document !== 'undefined' && table && lang.code !== 'en') {
    const root = document.documentElement;
    root.lang = lang.tag;
    if (lang.font) {
      root.style.setProperty('--ui-font', `${LATIN}, ${lang.font}`);
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
