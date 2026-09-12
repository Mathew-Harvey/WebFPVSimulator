/*
 * trackgif.js: write a looping animation of a built track, from the command
 * line, through the same code the builder's button runs.
 *
 * WHY IT DRIVES A BROWSER. The scene is Three.js and Three.js needs WebGL,
 * and this project has no node_modules at all: the bare three specifier
 * resolves only through a page's import map. So the render has to happen in
 * Chromium either way, and the only question is which code renders it. The
 * answer is the same code, reached through src/trackbuilder/animate.html, so
 * that a GIF written here and a GIF written by the button cannot differ.
 *
 * WHY NOT scripts/shots.js. That harness captures with Page.captureScreenshot
 * and writes an image per step, which for three hundred frames is three
 * hundred PNG encodes in the browser, three hundred decodes here, and a
 * second implementation of everything the encoder already does. This asks
 * the page for one finished file instead, in one evaluate.
 *
 * WHAT IT IS FOR. Looking at the thing. The frame loop has no clock in it,
 * so frame i is the same picture here and in the pilot's browser, and a
 * contact sheet made from this output is evidence about what the button
 * will produce.
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
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { buildPath } from '../src/trackbuilder/path.js';
import { lapFrames } from '../src/trackbuilder/stage.js';
import { trackClassOf } from '../src/trackbuilder/elements.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Discord's free tier stops at 10 MB and most group chats are meaner than
 * that, so 4 MB is the number this was designed to come in under. */
const WARN_BYTES = 4 * 1024 * 1024;

function usage() {
  console.log('usage: node scripts/trackgif.js <track.json> [options]');
  console.log('  --out <file.gif>   where to write, default <slug>.gif beside the input');
  console.log('  --size <px>        square edge, default 512');
  console.log('  --frames <n>       frames in the loop. The default is the LAP: the quad');
  console.log('                     flies at one steady pace whatever the track, so a long');
  console.log('                     course is a longer loop rather than a faster one. See');
  console.log('                     LAP_SPEED in src/trackbuilder/stage.js.');
  console.log('  --delay <cs>       centiseconds per frame, default 4, which is 25 fps');
  console.log('  --camera <ex,ey,ez,ax,ay,az,fov>');
  console.log('                     shoot from a fixed eye at a fixed aim, document metres,');
  console.log('                     vertical field of view in degrees, instead of framing');
  console.log('                     the track. For laying an export over a reference picture.');
  console.log('');
  console.log('  --frames 24 is the smoke setting. Chromium here runs on a software');
  console.log('  rasteriser, so a few hundred frames takes minutes, not seconds.');
}

/* Seven numbers: the eye, the aim, the vertical field of view. */
function parseCamera(text) {
  const n = String(text || '').split(',').map(Number);
  if (n.length !== 7 || n.some((v) => !Number.isFinite(v))) {
    throw new Error('--camera wants ex,ey,ez,ax,ay,az,fov');
  }
  return {
    eye: { x: n[0], y: n[1], z: n[2] },
    aim: { x: n[3], y: n[4], z: n[5] },
    fovDeg: n[6],
  };
}

function parseArgs(argv) {
  /* frames stays null unless the caller names one: null means the lap
   * decides, at the steady pace stage.js holds. */
  const opts = { size: 512, frames: null, delay: 4, out: null, input: null, camera: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      return null;
    }
    if (a === '--out') { opts.out = argv[i + 1]; i += 1; continue; }
    if (a === '--size') { opts.size = Number(argv[i + 1]); i += 1; continue; }
    if (a === '--frames') { opts.frames = Number(argv[i + 1]); i += 1; continue; }
    if (a === '--delay') { opts.delay = Number(argv[i + 1]); i += 1; continue; }
    if (a === '--camera') { opts.camera = parseCamera(argv[i + 1]); i += 1; continue; }
    if (a.startsWith('--')) {
      throw new Error(`unknown option ${a}`);
    }
    opts.input = a;
  }
  if (!opts.input) {
    return null;
  }
  if (!Number.isFinite(opts.size) || opts.size < 16 || opts.size > 2048) {
    throw new Error('--size must be between 16 and 2048');
  }
  if (opts.frames != null && (!Number.isFinite(opts.frames) || opts.frames < 2 || opts.frames > 2000)) {
    throw new Error('--frames must be between 2 and 2000');
  }
  if (!Number.isFinite(opts.delay) || opts.delay < 2 || opts.delay > 200) {
    /* Under 2 centiseconds browsers clamp the delay to their own floor, so
     * asking for it would be asking for a frame rate nobody plays back. */
    throw new Error('--delay must be between 2 and 200 centiseconds');
  }
  return opts;
}

/* The same slug rule as the builder's exportFilename, so a track exported
 * both ways lands on two files with matching names. */
function slugOf(name) {
  return String(name || 'track')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'track';
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`trackgif: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  if (!opts) {
    usage();
    process.exitCode = 1;
    return;
  }

  const doc = JSON.parse(await readFile(opts.input, 'utf8'));
  const out = opts.out || join(dirname(opts.input), `${slugOf(doc.name)}.gif`);

  /*
   * THE LOOP IS AS LONG AS THE LAP. The quad flies one steady pace whatever
   * the track, so the frame count is the lap's length divided by that pace:
   * see LAP_SPEED in src/trackbuilder/stage.js. Worked out HERE as well as
   * in the page so the terminal can say how long the animation will be
   * before it spends two minutes rendering it. --frames still wins.
   */
  const lap = buildPath(doc, { closeLoop: true });
  const frames = opts.frames == null
    ? lapFrames(lap.length, trackClassOf(doc), opts.delay)
    : opts.frames;
  const seconds = (frames * opts.delay) / 100;

  console.log(`trackgif: "${doc.name}" from ${basename(opts.input)}`);
  console.log(`  ${opts.size} by ${opts.size}, ${frames} frames at ${opts.delay} cs`);
  console.log(`  ${lap.length.toFixed(1)} m of lap, ${seconds.toFixed(1)} s at `
    + `${(lap.length / seconds).toFixed(2)} m/s${opts.frames == null ? '' : ', --frames given'}`);

  const started = Date.now();
  const page = await openPage({
    root,
    width: Math.max(640, opts.size + 64),
    height: Math.max(480, opts.size + 64),
    url: '/src/trackbuilder/animate.html',
  });

  let failed = false;
  try {
    await page.until('window.__animateReady === true', 60000);

    /*
     * One call, awaited in the page. The render is minutes of wall clock on
     * a software rasteriser, so the timeout is generous and the progress the
     * page reports is polled alongside it purely so the terminal shows signs
     * of life rather than a blank wait.
     */
    const call = page.evaluate(
      `window.__exportTrackGif(${JSON.stringify(doc)}, ${JSON.stringify({
        size: opts.size, frames, delayCs: opts.delay, camera: opts.camera,
      })})`,
    );

    let ticking = true;
    const tick = (async () => {
      let last = -1;
      while (ticking) {
        // eslint-disable-next-line no-await-in-loop
        const p = await page.evaluate('window.__gifProgress || null').catch(() => null);
        if (p && p.done !== last) {
          last = p.done;
          process.stdout.write(`\r  frame ${p.done} of ${p.total}   `);
        }
        // eslint-disable-next-line no-await-in-loop
        await page.sleep(500);
      }
    })();

    const result = await call;
    ticking = false;
    await tick;
    process.stdout.write('\r');

    if (!result || !result.ok) {
      console.error(`trackgif: ${result ? result.error : 'the page returned nothing'}`);
      failed = true;
    } else {
      const bytes = Buffer.from(result.base64, 'base64');
      await writeFile(out, bytes);
      const secs = (Date.now() - started) / 1000;
      const mb = bytes.length / 1e6;
      console.log(`  wrote ${out}`);
      console.log(`  ${bytes.length} bytes, ${mb.toFixed(2)} MB, in ${secs.toFixed(1)} s`);
      if (bytes.length > WARN_BYTES) {
        console.log('');
        console.log(`  OVER BUDGET. ${mb.toFixed(2)} MB is above the 4 MB this was built to`);
        console.log('  fit, which is where it stops posting anywhere without being');
        console.log('  re-encoded by somebody else. The lever is --frames: half of them');
        console.log('  at twice the delay is the same seconds at half the size.');
        console.log(`  Try: node scripts/trackgif.js ${opts.input} --frames ${Math.round(frames / 2)} --delay ${opts.delay * 2}`);
      }
    }
  } finally {
    /* Anything the page logged is a failure here, because this page has one
     * job and no reason to warn about anything. */
    for (const e of page.errors) {
      console.error(`  page: ${e}`);
      failed = true;
    }
    await page.close();
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`trackgif: ${e && e.stack ? e.stack : e}`);
  process.exitCode = 1;
});
