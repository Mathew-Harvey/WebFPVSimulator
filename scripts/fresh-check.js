/*
 * fresh-check.js: a returning browser runs the deploy it is served, not the
 * one it last cached.
 *
 * THE REPORT THIS ANSWERS. The owner, on 2026-09-25, an hour after maps
 * could be published: the builder's Publish still said "The public board
 * does not take freestyle maps yet". webfpv.org was serving the new
 * app.js; the owner's browser was running the old one, because the domain
 * sends every script with max-age=14400 and nothing in a script's address
 * changed when the script did. src/fresh.js is the fix. This is the proof.
 *
 * WHAT IT DOES. Serves this checkout the way webfpv.org serves a deploy,
 * measured through the domain the same day: every file Last-Modified at the
 * deploy's time, pages max-age=0, scripts max-age=14400. One module,
 * src/share/board.js, which the simulator, the builder and the orbit page
 * all import (the simulator through main.js, which boot.js imports
 * dynamically), is served with a line naming the deploy. Headless Chromium
 * opens a page; the server deploys, which moves the stamp on and changes
 * that line; and the page is opened again the way a pilot opens it, by
 * navigating to it. The line running must be the new deploy's.
 *
 * THE NEGATIVE CONTROL is the same second visit with the stamp left where
 * it was, which is what every browser got before src/fresh.js: the edited
 * module is served and the page must still run the cached one. If it does
 * not, the browser here is not caching scripts at all and the pass above it
 * could not have seen the thing it claims to, so the check fails.
 *
 * Usage: node scripts/fresh-check.js [--pages builder,sim,orbit]
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

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROBED = 'src/share/board.js';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.mp3', 'audio/mpeg'],
  ['.webm', 'video/webm'],
  ['.glb', 'model/gltf-binary'],
]);

/* What webfpv.org sends, measured on 2026-09-25 (DEPLOY.md): a page is
 * revalidated every time, a script is kept four hours. */
function cacheControl(rel) {
  return extname(rel) === '.js' ? 'public, max-age=14400' : 'public, max-age=0';
}

/* The deploy the server is serving: its time, and the name the probed
 * module says. Moved on by deploy(). */
const deployNow = { at: Date.parse('2026-09-25T10:00:00Z'), name: 'A' };
const probedFetches = [];

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    const path = join(ROOT, rel);
    if (!path.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    let body = await readFile(path);
    if (rel === PROBED) {
      body = Buffer.concat([body, Buffer.from(`\nwindow.__deployProbe = '${deployNow.name}';\n`)]);
      if (req.method === 'GET') {
        probedFetches.push(`${url.pathname}${url.search}`);
      }
    }
    res.writeHead(200, {
      'content-type': MIME.get(extname(rel)) ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': cacheControl(rel),
      'last-modified': new Date(deployNow.at).toUTCString(),
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;

function deploy(name, { moveStamp = true } = {}) {
  deployNow.name = name;
  if (moveStamp) {
    deployNow.at += 60_000;
  }
}

const stampOf = (ms) => Math.round(ms / 1000).toString(36);

const PAGES = {
  builder: { path: '/src/trackbuilder/index.html?mode=freestyle', ready: '!!window.trackBuilder', ms: 60_000 },
  sim: { path: '/index.html', ready: '!!(window.__shellReady && window.__map && window.__map().ready)', ms: 180_000 },
  /* The orbit page builds a world and records it; the probe lands long
   * before that, and nothing after it is this check's business. */
  orbit: { path: '/src/share/orbit.html?map=built', ready: 'window.__deployProbe !== undefined', ms: 90_000 },
};

const wanted = (() => {
  const i = process.argv.indexOf('--pages');
  return i >= 0 ? process.argv[i + 1].split(',') : Object.keys(PAGES);
})();

const rows = [];
let failed = 0;
function check(name, ok, detail) {
  rows.push(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail !== undefined ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  if (!ok) {
    failed += 1;
  }
  console.log(rows[rows.length - 1]);
}

const page = await openPage({ root: ROOT, width: 1280, height: 800, url: '/package.json' });

async function visit(name) {
  const spec = PAGES[name];
  await page.cdp.send('Page.navigate', { url: `${origin}${spec.path}` }, page.sessionId);
  const t0 = Date.now();
  while (Date.now() - t0 < spec.ms) {
    if (await page.evaluate(spec.ready).catch(() => false)) {
      break;
    }
    await page.sleep(250);
  }
  return page.evaluate('({ probe: window.__deployProbe, fresh: window.__fresh })').catch((e) => ({ error: e.message }));
}

try {
  for (const name of wanted) {
    if (!PAGES[name]) {
      throw new Error(`no page called ${name}`);
    }
    console.log(`\n${name}, ${PAGES[name].path}`);
    deploy(`${name}-1`);
    const first = await visit(name);
    check('the first visit runs the deploy it is served',
      first.probe === `${name}-1` && first.fresh && first.fresh.stamp === stampOf(deployNow.at), first);
    check('and gives every module the deploy’s address', first.fresh && first.fresh.versioned > 150, first.fresh);

    const before = probedFetches.length;
    deploy(`${name}-2`);
    const second = await visit(name);
    check('after a deploy, the next visit runs the new deploy, not the cached one',
      second.probe === `${name}-2` && second.fresh && second.fresh.stamp === stampOf(deployNow.at), second);
    const asked = probedFetches.slice(before);
    check('by asking for the module at the new deploy’s address',
      asked.length > 0 && asked.every((a) => a.endsWith(`?d=${stampOf(deployNow.at)}`)), asked);

    /* The control: the module changes, the stamp does not. This is every
     * deploy as a browser saw it before fresh.js. */
    deploy(`${name}-edited`, { moveStamp: false });
    const control = await visit(name);
    check('control: with the stamp left alone, the cached module is still the one running',
      control.probe === `${name}-2`, control);

    deploy(`${name}-3`);
    const third = await visit(name);
    check('and the next deploy is picked up again', third.probe === `${name}-3`, third);
  }
} finally {
  await page.close();
  server.closeAllConnections();
  server.close();
}

console.log(`\n${rows.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
