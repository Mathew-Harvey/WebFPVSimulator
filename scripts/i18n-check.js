/*
 * i18n-check.js: the Steam edition's languages hold their rules.
 *
 *   1. The browser edition is untouched: tr() is the identity and
 *      initLanguage() asks for no catalogue.
 *   2. scripts/i18n/source.json is the English, by id, and every id is the
 *      hash src/i18n/i18n.js would make of its string, so the two cannot
 *      drift apart.
 *   3. Every shipped catalogue has a translation for every id in the source
 *      and no id that is not in it. A translation keeps its string's holes
 *      ({0}, {throttle}) and its tags, each as many times as the English
 *      has it, and holds no en dash or em dash.
 *   4. Every pattern in src/i18n/patterns.js is a string of the source.
 *   5. The lookup's tries work, on a catalogue made here: the string, the
 *      string with its numbers out, a pattern with a word in its hole, a
 *      label read as a sentence, a label with its colon, a line joined
 *      with a separator, a line of two sentences, a string of several
 *      lines, and a pattern that must not reach across a full stop.
 *   6. A source string that is no longer anywhere in src/ or the pages is
 *      counted and, with --stale, listed. It is a note and not a failure:
 *      a string built from parts, or read off a running page, is never in
 *      the code in one piece.
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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const i18n = await load('src/i18n/i18n.js');
let bad = 0;
const fail = (m) => {
  bad += 1;
  if (bad <= 60) {
    console.error('FAIL ' + m);
  }
};
const eq = (got, want, what) => {
  if (got !== want) {
    fail(`${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  }
};

/* 1. The browser edition. Node has no window, which is the browser edition
 * as far as edition.js can tell, so this is the path a web visitor takes. */
eq(i18n.tr('Settings'), 'Settings', 'tr before a language is set');
eq(await i18n.initLanguage(), 'en', 'the browser edition stays English');
eq(i18n.translating(), false, 'the browser edition is not translating');
eq(i18n.chooseLanguage(null, ['ja-JP']), 'ja', 'ja-JP');
eq(i18n.chooseLanguage(null, ['zh-CN']), 'zh-Hans', 'zh-CN');
eq(i18n.chooseLanguage(null, ['zh-TW']), 'zh-Hans', 'zh-TW, until Traditional ships');
eq(i18n.chooseLanguage(null, ['pt-PT']), 'pt-BR', 'pt-PT reads the Brazilian');
eq(i18n.chooseLanguage(null, ['fr-CA', 'en-US']), 'fr', 'the first language the system lists that ships');
eq(i18n.chooseLanguage('ja', ['en-US']), 'ja', 'a saved choice wins');
eq(i18n.chooseLanguage(null, ['it-IT']), 'en', 'a language that does not ship');
eq(i18n.chooseLanguage(null, ['it-IT'], 'koreana'), 'ko', "Steam's own name for a language");

/* 2. The source. */
const source = JSON.parse(fs.readFileSync(path.join(root, 'scripts/i18n/source.json'), 'utf8'));
const ids = Object.keys(source);
for (const id of ids) {
  const en = source[id];
  if (typeof en !== 'string' || !en.trim()) {
    fail(`source ${id} is empty`);
  } else if (i18n.keyOf(i18n.fold(en)) !== id) {
    fail(`source ${id} is not the id of its string: ${en.slice(0, 60)}`);
  }
}

/* 3. The catalogues. */
const holes = (s) => (s.match(/\{[a-zA-Z0-9]+\}/g) || []).sort().join(',');
const tags = (s) => (s.match(/<\/?[a-z]+[^>]*>/g) || []).map((t) => t.replace(/\s.*>/, '>')).sort().join(',');
const shipped = i18n.SHIPPED.filter((c) => c !== 'en');
for (const lang of i18n.LANGUAGES) {
  if (!i18n.SHIPPED.includes(lang.code)) {
    fail(`${lang.code} is listed and does not ship`);
  }
}
const catalogues = {};
for (const code of shipped) {
  const cat = (await load(`src/i18n/lang/${code}.js`)).default;
  catalogues[code] = cat;
  for (const id of ids) {
    const t = cat[id];
    const en = source[id];
    if (typeof t !== 'string' || !t.trim()) {
      fail(`${code}: no translation of ${id}: ${en.slice(0, 60)}`);
    } else {
      if (holes(t) !== holes(en)) {
        fail(`${code}: ${id} does not keep its holes: ${en.slice(0, 60)}`);
      }
      if (tags(t) !== tags(en)) {
        fail(`${code}: ${id} does not keep its tags: ${en.slice(0, 60)}`);
      }
      if (/[–—]/.test(t)) {
        fail(`${code}: ${id} holds a dash: ${t.slice(0, 60)}`);
      }
      if (t !== t.trim() || /\n/.test(t)) {
        fail(`${code}: ${id} has stray white space`);
      }
    }
  }
  for (const id of Object.keys(cat)) {
    if (!(id in source)) {
      fail(`${code}: ${id} is not in the source`);
    }
  }
}

/* 4. The patterns. */
const patterns = (await load('src/i18n/patterns.js')).default;
for (const p of patterns) {
  if (source[i18n.keyOf(i18n.fold(p))] === undefined) {
    fail(`pattern is not in the source: ${p.slice(0, 60)}`);
  }
  if (!/\{\d+\}/.test(p)) {
    fail(`pattern has no hole: ${p.slice(0, 60)}`);
  }
}

/* 5. The lookup, on a catalogue of its own. */
const k = (s) => i18n.keyOf(i18n.fold(s));
i18n.useCatalogue({
  [k('Settings')]: 'S1',
  [k('Lap {0} of {1}')]: 'L {1}/{0}',
  [k('Change the {0}')]: 'C<{0}>',
  [k('track')]: 'T1',
  [k('Fly solo')]: 'F1',
  [k('Career, racing and the builder.')]: 'K1.',
  [k('Dogfight')]: 'D1',
}, ['Change the {0}'], 'de');
eq(i18n.translating(), true, 'a catalogue in force');
eq(i18n.tr('Settings'), 'S1', 'the string itself');
eq(i18n.tr('  Settings\n'), '  S1\n', 'the white space round it is kept');
eq(i18n.tr('Lap 2 of 3'), 'L 3/2', 'numbers out and back');
eq(i18n.tr('Change the track'), 'C<T1>', 'a pattern, and the word in its hole');
eq(i18n.tr('Change the weather'), 'C<weather>', 'a pattern with a word nobody translated');
eq(i18n.tr('Dogfight.'), 'D1.', 'a label read as a sentence');
eq(i18n.tr('Settings · Dogfight'), 'S1 · D1', 'a line joined with a separator');
eq(i18n.tr('Dogfight. Career, racing and the builder.'), 'D1. K1.', 'two sentences');
eq(i18n.tr('Nothing here'), 'Nothing here', 'a string with no translation stays English');
eq(i18n.tr('S1'), 'S1', 'its own output is not looked up again');
eq(i18n.trf('Lap {0} of {1}', 'a', 'b'), 'L b/a', 'trf fills the translated template');
eq(i18n.tr('12:03.4'), '12:03.4', 'a time is not text');
eq(i18n.tr('Settings:'), 'S1:', 'a label with the colon of its value');
eq(i18n.tr('Settings\nDogfight\nNothing here'), 'S1\nD1\nNothing here', 'a string of several lines, line by line');
/* A hole never takes the end of one sentence and the start of the next:
 * the line is two sentences, and the second is not a kind of track. */
eq(i18n.tr('Change the track. Fly solo'), 'C<T1>. F1', 'a pattern does not reach across a full stop');
i18n.useCatalogue(null);
eq(i18n.tr('Settings'), 'Settings', 'English put back');

/* The real catalogues through the real lookup: one string each, so a file
 * that loads and translates nothing is caught here and not by a pilot. */
for (const code of shipped) {
  i18n.useCatalogue(catalogues[code], patterns, code);
  const en = source[ids[0]];
  if (i18n.tr(en) !== catalogues[code][ids[0]]) {
    fail(`${code}: the lookup does not find ${ids[0]}`);
  }
}
i18n.useCatalogue(null);

/* 6. Strings that are no longer in the code in one piece. */
function walk(dir, out) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name !== 'lang') {
        walk(p, out);
      }
    } else if (/\.(js|html)$/.test(f.name)) {
      out.push(p);
    }
  }
  return out;
}
const code = i18n.fold([...walk(path.join(root, 'src'), []), path.join(root, 'index.html')]
  .map((p) => fs.readFileSync(p, 'utf8')).join('\n')
  .replace(/\\u2019/g, '’').replace(/\\'/g, "'").replace(/&amp;/g, '&'));
const stale = ids.filter((id) => !/\{[a-zA-Z0-9]+\}/.test(source[id]) && !code.includes(source[id]));

if (bad) {
  console.error(`i18n-check: ${bad} failure(s)`);
  process.exit(1);
}
if (process.argv.includes('--stale')) {
  for (const id of stale) {
    console.log(`not in the code in one piece: ${source[id]}`);
  }
}
console.log(`i18n-check: ok. ${ids.length} strings, ${shipped.length} languages, ${patterns.length} patterns. ${stale.length} strings are not in the code in one piece (--stale lists them).`);
