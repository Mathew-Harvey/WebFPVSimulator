/*
 * stylestrip-check.js: the deploy's stylesheet stripper takes comments and
 * nothing else (scripts/lib/stylestrip.js).
 *
 * Node only, seconds. The cases are the ways a comment stripper written in
 * a hurry eats something that was not a comment, and then the real pages:
 * every rule that was there is still there, in order, and no comment is.
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

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripCssComments, stripPageStyles } from './lib/stylestrip.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const check = (what, ok, got = '') => {
  fails += ok ? 0 : 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}${got ? `: ${got}` : ''}`);
};
const same = (what, got, want) => check(what, got === want, got === want ? '' : JSON.stringify(got));

same('a comment on its own lines goes, and the lines with it',
  stripCssComments('a { color: red; }\n  /* why\n     it is red */\n  b { top: 0; }'),
  'a { color: red; }\n  b { top: 0; }');
same('a value written over several lines keeps its indentation, which a custom property would keep',
  stripCssComments(':root {\n  --edge: 0 0 0 red, /* first */\n        1px 0 0 red;\n}'),
  ':root {\n  --edge: 0 0 0 red,  \n        1px 0 0 red;\n}');
same('a comment between two tokens leaves the space CSS reads there',
  stripCssComments('a { margin: 0/* x */auto; }'), 'a { margin: 0 auto; }');
same('a marker inside a double quoted string is the string\'s',
  stripCssComments('a::before { content: "/* not one */"; }'), 'a::before { content: "/* not one */"; }');
same('and inside a single quoted one, past an escaped quote',
  stripCssComments("a::before { content: 'it\\'s /* here */'; } /* gone */"), "a::before { content: 'it\\'s /* here */'; }  ");
same('an unquoted url keeps its slashes and stars',
  stripCssComments('a { background: url(data:image/svg+xml,%3Csvg/*x*/%3E); } /* gone */'),
  'a { background: url(data:image/svg+xml,%3Csvg/*x*/%3E); }  ');
same('a quoted url is kept whole too',
  stripCssComments('a { background: url( "x/*y*/.png" ); }'), 'a { background: url( "x/*y*/.png" ); }');
same('a slash that opens nothing is a slash',
  stripCssComments('a { font: 600 12px/1 sans-serif; aspect-ratio: 16 / 9; }'), 'a { font: 600 12px/1 sans-serif; aspect-ratio: 16 / 9; }');
same('an unclosed comment is left for the browser to judge',
  stripCssComments('a { top: 0; }\n/* never closed'), 'a { top: 0; }\n/* never closed');
same('a page keeps everything outside its stylesheet',
  stripPageStyles('<!-- licence /* kept */ -->\n<style>\n  /* x */\n  a { top: 0; }\n</style>\n<script>/* kept */</script>'),
  '<!-- licence /* kept */ -->\n<style>\n  a { top: 0; }\n</style>\n<script>/* kept */</script>');

/* The real pages. With the comments out of both, what is left of the
 * written sheet and of the stripped one must be the same characters once
 * white space is set aside, because the stripper may only ever have
 * removed comments and white space. */
const squash = (s) => s.replace(/\s+/g, '');
for (const rel of ['index.html', 'src/trackbuilder/index.html', 'src/share/orbit.html']) {
  const html = readFileSync(join(ROOT, rel), 'utf8');
  const stripped = stripPageStyles(html);
  const sheets = (s) => [...s.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const a = sheets(html);
  const b = sheets(stripped);
  check(`${rel}: the same number of stylesheets`, a.length === b.length && a.length > 0, `${a.length} and ${b.length}`);
  check(`${rel}: no comment is left in one`, b.every((css) => !/\/\*[\s\S]*?\*\//.test(css.replace(/"[^"\n]*"|'[^'\n]*'|url\([^)]*\)/g, ''))));
  /* The written sheet's comments taken out the blunt way is right only
   * where no string or url holds a marker, which is so on these pages
   * today; where it stops being so this line fails and says to look. */
  const blunt = a.map((css) => squash(css.replace(/\/\*[\s\S]*?\*\//g, ' ')));
  check(`${rel}: every rule is still there, in order`, blunt.join('|') === b.map(squash).join('|'));
  check(`${rel}: outside the stylesheet nothing moved`,
    html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style/>') === stripped.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style/>'));
  const saved = Buffer.byteLength(html) - Buffer.byteLength(stripped);
  check(`${rel}: it is smaller`, saved >= 0, `${Buffer.byteLength(html)} to ${Buffer.byteLength(stripped)} bytes`);
}

console.log(fails ? `\nFAIL, ${fails} problem(s)` : '\nPASS');
process.exit(fails ? 1 : 0);
