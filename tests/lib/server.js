/*
 * server.js: minimal static file server for the browser harness. Serves the
 * repository root on 127.0.0.1 with correct MIME types for .wasm and ES
 * modules. Node only.
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
import { join, normalize, extname } from 'node:path';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.rec', 'application/octet-stream'],
  ['.diff', 'text/plain; charset=utf-8'],
  ['.md', 'text/plain; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  /* video/webm and not audio/webm. Every .webm in this tree is an
     audio-only Opus track, but Render serves the deploy off its own
     extension table and that table says video/webm, so the harness has to
     say it too or check 14 measures a page the public never gets. */
  ['.webm', 'video/webm'],
]);

/*
 * Byte ranges and a stream, not a Buffer. A media element opens a track
 * with Range and reopens it as its buffer drains; a server that answers
 * 200 with the whole body instead makes Chromium take a whole track in
 * one go, which is not what the deploy does. Check 14 waits on a real
 * element's currentTime, so this is the difference between measuring the
 * bed and measuring this file.
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
  /* bytes=-500 is the LAST 500 bytes. */
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

async function sendFile(req, res, path, rel) {
  const info = await stat(path);
  if (!info.isFile()) {
    throw new Error('not a file');
  }
  const head = {
    'content-type': MIME.get(extname(path)) ?? 'application/octet-stream',
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
}

export async function startServer(rootDir) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      const path = join(rootDir, rel);
      if (!path.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      await sendFile(req, res, path, rel);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
