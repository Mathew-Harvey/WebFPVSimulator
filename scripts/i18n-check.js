/*
 * i18n-check.js: the Steam edition's languages hold their rules.
 *
 *   1. The browser edition is untouched: tr() is the identity and
 *      initLanguage() requests no catalogue.
 *   2. Every shipped catalogue loads, has only string keys and values, and
 *      none of its values is empty or equal to its key.
 *   3. A catalogue key that is not found anywhere in src/ or index.html is
 *      reported, because a renamed English string silently stops translating.
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
const i18n = await import(pathToFileURL(path.join(root, 'src/i18n/i18n.js')).href);
let bad = 0;
const fail = (m) => { bad += 1; console.error('FAIL ' + m); };

if (i18n.tr('Settings') !== 'Settings') fail('tr is not the identity before a language is set');
if (await i18n.initLanguage() !== 'en') fail('browser edition did not stay English');
if (i18n.chooseLanguage(null, ['ja-JP']) !== 'ja') fail('ja-JP should pick ja');
if (i18n.chooseLanguage(null, ['zh-CN']) !== 'zh-Hans') fail('zh-CN should pick zh-Hans');
if (i18n.chooseLanguage(null, ['zh-TW']) !== 'zh-Hans') fail('zh-TW falls to zh-Hans until Traditional ships');
if (i18n.chooseLanguage('ja', ['en-US']) !== 'ja') fail('a saved choice wins');
if (i18n.chooseLanguage(null, ['fr-FR']) !== 'en') fail('an unshipped language should fall back to English');

function walk(dir, out) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== 'lang') walk(p, out); }
    else if (/\.(js|html)$/.test(f.name)) out.push(p);
  }
  return out;
}
const sources = [...walk(path.join(root, 'src'), []), path.join(root, 'index.html')]
  .map((p) => fs.readFileSync(p, 'utf8')).join('\n');

for (const code of i18n.SHIPPED.filter((c) => c !== 'en')) {
  const cat = (await import(pathToFileURL(path.join(root, `src/i18n/lang/${code}.js`)).href)).default;
  for (const [k, v] of Object.entries(cat)) {
    if (typeof v !== 'string' || !v.trim()) fail(`${code}: "${k}" has no translation`);
    else if (v === k) fail(`${code}: "${k}" is not translated`);
    if (!sources.includes(`'${k}'`) && !sources.includes(`"${k}"`)) fail(`${code}: "${k}" is not in the source`);
  }
}
if (bad) { process.exit(1); }
console.log('i18n-check: ok');
