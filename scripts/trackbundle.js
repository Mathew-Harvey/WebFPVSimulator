/*
 * trackbundle.js: write a track's export bundle from the command line,
 * through the same code the builder's Export bundle button runs.
 *
 * WHY IT DRIVES A BROWSER. The views and the lap animation are Three.js, and
 * Three.js needs WebGL, so they are drawn in headless Chromium through
 * src/trackbuilder/bundle.html, exactly as scripts/trackgif.js reaches the
 * animation. The data, the map and the page are made by bundle.js, which has
 * no browser in it, and the zip by zip.js. One implementation, so a bundle
 * from here and one from the button cannot differ.
 *
 * WHAT IT IS FOR. Making the week's bundle for a track that was not built in
 * your browser, and looking at what the button will produce.
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

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { presetById, isPresetId } from '../src/trackbuilder/presets.js';
import { deserialize } from '../src/trackbuilder/model.js';
import { bundleFilename } from '../src/trackbuilder/bundle.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function usage() {
  console.log('usage: node scripts/trackbundle.js <track.json | preset-id> [options]');
  console.log('  --out <file.zip>   where to write, default <slug>.webfpv.zip in the current folder');
  console.log('  --gif <card|large|none>   the lap animation, default card (384 by 240)');
  console.log('  --no-stills        leave out the six views of the room');
  console.log('  --now <iso time>   the time written into the bundle, for a repeatable file');
}

async function main() {
  const opts = { out: null, gif: 'card', stills: true, now: new Date().toISOString(), input: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { usage(); return; }
    if (a === '--out') { opts.out = argv[i + 1]; i += 1; continue; }
    if (a === '--gif') { opts.gif = argv[i + 1]; i += 1; continue; }
    if (a === '--no-stills') { opts.stills = false; continue; }
    if (a === '--now') { opts.now = argv[i + 1]; i += 1; continue; }
    if (a.startsWith('--')) { console.error(`trackbundle: unknown option ${a}`); process.exitCode = 1; return; }
    opts.input = a;
  }
  if (!opts.input || !['card', 'large', 'none'].includes(opts.gif)) {
    usage();
    process.exitCode = 1;
    return;
  }
  const doc = isPresetId(opts.input)
    ? presetById(opts.input)
    : deserialize(await readFile(opts.input, 'utf8')).doc;
  const out = opts.out || join(process.cwd(), bundleFilename(doc));
  console.log(`trackbundle: "${doc.name}", animation ${opts.gif}, views ${opts.stills ? 'on' : 'off'}`);

  const started = Date.now();
  const page = await openPage({ root, width: 900, height: 600, url: '/src/trackbuilder/bundle.html' });
  let failed = false;
  try {
    await page.until('window.__bundleReady === true', 60000);
    const call = page.evaluate(`window.__makeBundle(${JSON.stringify(doc)}, ${JSON.stringify({
      gif: opts.gif, stills: opts.stills, now: opts.now,
    })})`);
    let ticking = true;
    const tick = (async () => {
      let last = '';
      while (ticking) {
        // eslint-disable-next-line no-await-in-loop
        const t = await page.evaluate('window.__bundleStatus || ""').catch(() => '');
        if (t && t !== last) { last = t; process.stdout.write(`\r  ${t}                `); }
        // eslint-disable-next-line no-await-in-loop
        await page.sleep(500);
      }
    })();
    const result = await call;
    ticking = false;
    await tick;
    process.stdout.write('\r');
    if (!result || !result.ok) {
      console.error(`trackbundle: ${result ? result.error : 'the page returned nothing'}`);
      failed = true;
    } else {
      await writeFile(out, Buffer.from(result.base64, 'base64'));
      console.log(`  wrote ${out}, ${result.bytes} bytes, in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      if (result.skipped.length) {
        console.log(`  left out: ${result.skipped.join(', ')}`);
      }
    }
  } finally {
    for (const e of page.errors) {
      console.error(`  page: ${e}`);
      failed = true;
    }
    await page.close();
  }
  if (failed) { process.exitCode = 1; }
}

main().catch((e) => {
  console.error(`trackbundle: ${e && e.stack ? e.stack : e}`);
  process.exitCode = 1;
});
