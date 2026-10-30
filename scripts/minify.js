/*
 * minify.js: the deploy's one build step. Rewrites the served JavaScript
 * with its whitespace and dead syntax removed, so a visitor downloads about
 * 60 percent fewer bytes of the simulator's own code. Names are kept as
 * they are: only whitespace and syntax are minified, so nothing that reads a
 * function's name or its source text (shader hook cache keys, stack traces,
 * a bug ticket's file and line) sees a different program, and the 7 percent
 * a mangler would add is not worth the way it would make a live report
 * unreadable.
 *
 * Usage:
 *   node scripts/minify.js --out DIR     copy the tree to DIR, minified there
 *   node scripts/minify.js --in-place    rewrite this checkout (Render only)
 *
 * --in-place refuses to run unless the checkout is a deploy's: either
 * RENDER is set in the environment or the flag is given twice. The repo's
 * own files stay readable; only the host's copy is ever rewritten.
 *
 * Not touched: anything outside src, configs and tests/lib/simmod.js (the
 * page reaches nowhere else), self tests, and everything that is not .js.
 * A file esbuild cannot parse fails the build, which is the point: a deploy
 * that would have served a broken module never goes out.
 *
 * esbuild is not a dependency of the repository. The deploy installs it
 * for this one step (render.yaml) and it is never shipped. MIT licensed.
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

import { readdir, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* What the page reaches. A path prefix, tested on the repo relative path. */
const SERVED = ['src/', 'configs/', 'tests/lib/simmod.js'];
const SKIP = /(selftest|\.test\.)/;

/* The licence stays with the code. A minified file keeps one line saying
 * what it is and where the readable source lives, which is what the GPL
 * asks of a form that is not the preferred one for modification. */
const NOTICE = '/* WebFPVSimulator, GPL-3.0-or-later. Minified for delivery; readable source: https://github.com/Mathew-Harvey/WebFPVSimulator */\n';

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const out = outIdx >= 0 ? resolve(argv[outIdx + 1]) : null;
const inPlaceFlags = argv.filter((a) => a === '--in-place').length;
if (!out && !(inPlaceFlags >= 2 || (inPlaceFlags === 1 && process.env.RENDER))) {
  console.error('minify: give --out DIR, or --in-place on a deploy (RENDER set).');
  process.exit(2);
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '.loop') continue;
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

if (out) {
  await cp(root, out, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|\.git|\.loop)([\\/]|$)/.test(src) && resolve(src) !== out,
  });
}
const base = out || root;

let before = 0;
let after = 0;
let count = 0;
for await (const file of walk(base)) {
  const rel = relative(base, file).split(sep).join('/');
  if (!rel.endsWith('.js') || SKIP.test(rel)) continue;
  if (!SERVED.some((s) => rel.startsWith(s))) continue;
  const src = await readFile(file, 'utf8');
  const res = await transform(src, {
    minifyWhitespace: true,
    minifySyntax: true,
    format: 'esm',
    target: 'es2022',
    sourcefile: rel,
    legalComments: 'none',
  });
  const code = NOTICE + res.code;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, code);
  before += Buffer.byteLength(src);
  after += Buffer.byteLength(code);
  count++;
}
console.log(`minify: ${count} files, ${before} -> ${after} bytes (${(100 * after / before).toFixed(0)}%)${out ? ` in ${out}` : ''}`);
