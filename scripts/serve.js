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
import { readFile } from 'node:fs/promises';
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
]);

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
      const body = await readFile(path);
      res.writeHead(200, {
        'content-type': MIME.get(extname(path)) ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`WebFPVSimulator: http://127.0.0.1:${port}/`);
    console.log('Build the module first if you have not: npm run build:wasm');
  });
