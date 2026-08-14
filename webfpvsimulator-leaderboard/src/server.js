/*
 * server.js: the public board.
 *
 * A static page and a small JSON API. The page lists every published
 * course. Expanding one shows its times. Fly opens the simulator in
 * another tab with ?share=id, which is the only link the two sites
 * need. Publish and post-time are the writes.
 *
 * This file is part of WebFPVLeaderboard.
 *
 * WebFPVLeaderboard is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVLeaderboard is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVLeaderboard. If not, see <https://www.gnu.org/licenses/>.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.js';
import { inspectDocument, normaliseLapMs, normaliseName } from './validate.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');
const port = Number(process.env.PORT || 3100);
const simOrigin = (process.env.SIM_ORIGIN || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const boardPublic = (process.env.BOARD_PUBLIC_ORIGIN || '').replace(/\/+$/, '');

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

const store = await openStore();

function cors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('vary', 'origin');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function requestOrigin(req) {
  if (boardPublic) {
    return boardPublic;
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${port}`;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`;
}

async function readBody(req, limit = 500_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw new Error('That request is too large.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleApi(req, res, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && path === '/api/health') {
    send(res, 200, { ok: true, store: store.kind });
    return;
  }

  if (req.method === 'GET' && path === '/api/config') {
    send(res, 200, {
      simOrigin,
      boardOrigin: requestOrigin(req),
    });
    return;
  }

  if (req.method === 'GET' && path === '/api/tracks') {
    send(res, 200, { tracks: await store.listTracks() });
    return;
  }

  const one = path.match(/^\/api\/tracks\/([^/]+)$/);
  if (req.method === 'GET' && one) {
    const track = await store.getTrack(decodeURIComponent(one[1]));
    if (!track) {
      send(res, 404, { error: 'That course is not on the board.' });
      return;
    }
    send(res, 200, track);
    return;
  }

  const doc = path.match(/^\/api\/tracks\/([^/]+)\/document$/);
  if (req.method === 'GET' && doc) {
    const payload = await store.getDocument(decodeURIComponent(doc[1]));
    if (!payload) {
      send(res, 404, { error: 'That course is not on the board.' });
      return;
    }
    send(res, 200, payload);
    return;
  }

  if (req.method === 'POST' && path === '/api/tracks') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      send(res, 400, { error: e.message || 'That request was not JSON.' });
      return;
    }
    const author = normaliseName(body.author);
    if (!author) {
      send(res, 400, { error: 'A published course needs a name, two to twenty four letters, numbers, spaces, dots, underscores or hyphens.' });
      return;
    }
    const inspected = inspectDocument(body.document);
    if (inspected.error) {
      send(res, 400, { error: inspected.error });
      return;
    }
    const result = await store.publish({
      inspected,
      author,
      editKey: typeof body.editKey === 'string' ? body.editKey : '',
    });
    if (result.error) {
      send(res, result.status || 400, { error: result.error });
      return;
    }
    send(res, result.updated ? 200 : 201, result);
    return;
  }

  const times = path.match(/^\/api\/tracks\/([^/]+)\/times$/);
  if (req.method === 'POST' && times) {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      send(res, 400, { error: e.message || 'That request was not JSON.' });
      return;
    }
    const name = normaliseName(body.name);
    const lapMs = normaliseLapMs(body.lapMs);
    if (!name) {
      send(res, 400, { error: 'A time on the board needs a name, two to twenty four letters, numbers, spaces, dots, underscores or hyphens.' });
      return;
    }
    if (lapMs == null) {
      send(res, 400, { error: 'That lap time is not usable.' });
      return;
    }
    const result = await store.addTime({
      trackId: decodeURIComponent(times[1]),
      name,
      lapMs,
    });
    if (result.error) {
      send(res, result.status || 400, { error: result.error });
      return;
    }
    send(res, 201, result);
    return;
  }

  send(res, 404, { error: 'Nothing at that address.' });
}

async function handleStatic(req, res, url) {
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (rel === '') {
    rel = 'index.html';
  }
  const path = join(publicDir, rel);
  if (!path.startsWith(publicDir)) {
    send(res, 403, 'forbidden', 'text/plain; charset=utf-8');
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, {
      'content-type': MIME.get(extname(path)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (e) {
    send(res, 404, 'not found', 'text/plain; charset=utf-8');
  }
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    await handleStatic(req, res, url);
  } catch (e) {
    send(res, 500, { error: e.message || 'The board failed.' });
  }
});

if (process.env.BOARD_LISTEN !== '0') {
  server.listen(port, '0.0.0.0', () => {
    console.log(`WebFPV leaderboard: http://127.0.0.1:${port}/`);
    console.log(`Store: ${store.kind}. Simulator: ${simOrigin}`);
  });
}

export { server, store };
