/*
 * serve.js: tiny static server for the shell. Serves the repo root on
 * localhost so index.html, the ES modules and dist/sim.wasm load with the
 * right MIME types. Usage: npm run serve, then open the printed URL.
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
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 8000);

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.rec', 'application/octet-stream'],
  ['.diff', 'text/plain; charset=utf-8'],
  ['.webm', 'video/webm'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  /* Render sets this one itself, but without a row here a local visit gets
     the site icon as application/octet-stream and the tab stays blank, so
     the one file you are trying to look at is the one that behaves
     differently on a laptop from in production. */
  ['.ico', 'image/x-icon'],
  ['.mp3', 'audio/mpeg'],
  /* video/webm and not audio/webm, even though every .webm in this tree is
     an audio-only Opus track. Render serves a static site off its own
     extension table and that table says video/webm, so saying audio/webm
     here would make the one thing worth testing, whether a browser will
     take the crate as served, the one thing localhost cannot tell you. */
  ['.webm', 'video/webm'],
]);

/*
 * Byte ranges, because a media element asks for them and the answer
 * changes how much it downloads.
 *
 * Chromium's media stack opens a track with Range: bytes=0- and then
 * closes and reopens the connection as its buffer fills. Against a server
 * that ignores Range and answers 200 with the whole body it cannot do
 * that, so it takes the entire three megabyte file at once, at exactly
 * the moment the map is loading. That is not what production does, and a
 * local page that behaves worse than the deploy in the one dimension you
 * are trying to measure is worse than no local page at all.
 *
 * Streaming rather than readFile for the same reason from the other end:
 * a 3 MB response should not be a 3 MB Buffer in this process first.
 */
/* pipe() and not .pipe(), because pipe does not forward a read error and an
   unhandled 'error' on a Readable takes the process with it. A file that
   goes away mid response should drop one connection, not the server. */
function pipe(stream, res) {
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!m) {
    return null;
  }
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') {
    return null;
  }
  /* bytes=-500 is the LAST 500 bytes, not the first 500. Getting this
     backwards serves a header where a browser wanted a trailer. */
  let start = rawStart === '' ? size - Number(rawEnd) : Number(rawStart);
  let end = rawStart === '' || rawEnd === '' ? size - 1 : Number(rawEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  if (start > end) {
    return { unsatisfiable: true };
  }
  return { start, end };
}

/*
 * The deploy's cache policy, mirrored for one directory.
 *
 * render.yaml serves /assets/music/* immutable for a year and everything
 * else no-cache, and music.js leans on that: it warms the next track in a
 * rotation through a second element so the handoff comes out of the disk
 * cache rather than off the wire again. Under a blanket no-store that warm
 * is not an optimisation, it is the same track downloaded twice, and a
 * harness that cannot tell those two apart cannot check the feature.
 *
 * The cost is the one the deploy has: re-encode the crate and a browser
 * that already has it will not notice. Bump MUSIC_REV in
 * src/render/tracks.js, which is the same lever production needs.
 */
function cacheControl(rel) {
  return rel.startsWith('assets/music/') ? 'public, max-age=31536000, immutable' : 'no-store';
}

function sendFile(req, res, path, rel) {
  return stat(path).then((info) => {
    if (!info.isFile()) {
      throw new Error('not a file');
    }
    const type = MIME.get(extname(path)) ?? 'application/octet-stream';
    const head = {
      'content-type': type,
      'cache-control': cacheControl(rel),
      'accept-ranges': 'bytes',
    };
    const range = req.headers.range ? parseRange(req.headers.range, info.size) : null;
    if (range && range.unsatisfiable) {
      res.writeHead(416, { ...head, 'content-range': `bytes */${info.size}` });
      res.end();
      return;
    }
    if (range) {
      res.writeHead(206, {
        ...head,
        'content-range': `bytes ${range.start}-${range.end}/${info.size}`,
        'content-length': range.end - range.start + 1,
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      pipe(createReadStream(path, { start: range.start, end: range.end }), res);
      return;
    }
    res.writeHead(200, { ...head, 'content-length': info.size });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    pipe(createReadStream(path), res);
  });
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (rel === '') {
        rel = 'index.html';
      }
      const path = join(root, rel);
      if (!path.startsWith(root)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      await sendFile(req, res, path, rel);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`WebFPVSimulator: http://127.0.0.1:${port}/`);
    console.log('Build the module first if you have not: npm run build:wasm');
  });
