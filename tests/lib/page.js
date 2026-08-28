/*
 * page.js: one headless Chromium page, driven over the DevTools protocol.
 *
 * Lifted out of scripts/shots.js so that more than one tool can drive the
 * real shell. shots.js takes pictures; scripts/shell-check.js walks every
 * screen with the arrow keys and asserts what it finds. Both need the same
 * six awkward things, and none of them is worth writing twice: a Chromium
 * that starts headless with a software rasteriser, a DevTools socket, the
 * console and page errors collected as they arrive, the Three.js CDN served
 * from a local cache because the container's Chromium does not inherit the
 * proxy, a device metrics override so a measurement means the same thing on
 * every machine, and stored settings seeded before the first line of the app
 * runs.
 *
 * The CDN cache is shared with shots.js on purpose. A shell check that
 * refetched a megabyte of Three.js on every run would be a check nobody
 * runs.
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

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { startServer } from './server.js';
import { findChrome } from './browser.js';

const CACHE = process.env.SIM_CDN_CACHE || join(tmpdir(), 'webfpv-cdn');

/* Virtual key codes for the keys the shell listens to. Chromium wants one
 * for a key event to look real to the page. */
const VK = {
  Enter: 13, Escape: 27, Space: 32, Tab: 9, Backspace: 8,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Home: 36, End: 35, PageUp: 33, PageDown: 34,
  F1: 112, F2: 113, F3: 114, F8: 119,
};

export function keyInfo(code) {
  if (/^Key[A-Z]$/.test(code)) {
    const ch = code.slice(3);
    return {
      key: ch.toLowerCase(), code, windowsVirtualKeyCode: ch.charCodeAt(0), text: ch.toLowerCase(),
    };
  }
  if (/^Digit[0-9]$/.test(code)) {
    const d = code.slice(5);
    return { key: d, code, windowsVirtualKeyCode: d.charCodeAt(0), text: d };
  }
  const named = { Enter: '\r', Space: ' ', Tab: '\t' };
  return {
    key: code === 'Space' ? ' ' : code,
    code,
    windowsVirtualKeyCode: VK[code] ?? 0,
    text: named[code],
  };
}

export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    this.dead = null;
    const fail = (e) => {
      if (this.dead) {
        return;
      }
      this.dead = e;
      for (const { reject } of this.pending.values()) {
        reject(e);
      }
      this.pending.clear();
    };
    ws.addEventListener('close', () => fail(new Error('Chrome closed the DevTools connection')));
    ws.addEventListener('error', () => fail(new Error('DevTools connection errored')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(`CDP ${msg.method ?? ''} ${msg.error.message}`));
        } else {
          resolve(msg.result);
        }
      } else if (msg.method) {
        for (const l of this.listeners) {
          l(msg);
        }
      }
    });
  }

  send(method, params = {}, sessionId) {
    if (this.dead) {
      return Promise.reject(this.dead);
    }
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  onEvent(fn) {
    this.listeners.push(fn);
  }
}

async function cdnBytes(url) {
  await mkdir(CACHE, { recursive: true });
  const path = join(CACHE, createHash('sha256').update(url).digest('hex').slice(0, 32));
  if (existsSync(path)) {
    return readFile(path);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`cdn fetch ${url}: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);
  return buf;
}

export function describe(obj) {
  if (!obj) {
    return 'unknown';
  }
  if (obj.type === 'string') {
    return obj.value;
  }
  return obj.description ?? JSON.stringify(obj.value ?? obj);
}

/*
 * Open the shell in headless Chromium and hand back a driver.
 *
 * `seed` is a list of script sources evaluated on every new document,
 * before the app runs. That is how a stored setting gets in: the same door
 * the pilot uses, rather than a test only hook that can drift from it.
 */
export async function openPage({
  root,
  width = 1600,
  height = 900,
  url = '/index.html',
  touch = false,
  seed = [],
} = {}) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error('no Chromium found');
  }
  const server = await startServer(root);
  const userDataDir = await mkdtemp(join(tmpdir(), 'sim-page-'));
  const proc = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ]);

  let stderrBuf = '';
  const wsUrl = await new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`no DevTools endpoint: ${stderrBuf.slice(-1500)}`)),
      30000,
    );
    proc.on('error', (e) => { clearTimeout(t); reject(e); });
    proc.stderr.on('data', (d) => {
      stderrBuf += d.toString();
      const m = stderrBuf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(t);
        resolve(m[1]);
      }
    });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('DevTools websocket failed')), { once: true });
  });
  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  const errors = [];
  const warnings = [];
  cdp.onEvent(async (msg) => {
    if (msg.sessionId !== sessionId) {
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map(describe).join(' ');
      if (msg.params.type === 'error' || msg.params.type === 'assert') {
        errors.push(`console.${msg.params.type}: ${text}`);
      } else if (msg.params.type === 'warning') {
        warnings.push(`console.warning: ${text}`);
      }
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`uncaught: ${d.exception ? describe(d.exception) : d.text}`);
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') {
        errors.push(`${e.source}: ${e.text}`);
      } else if (e.level === 'warning') {
        warnings.push(`${e.source}: ${e.text}`);
      }
    } else if (msg.method === 'Fetch.requestPaused') {
      const { requestId, request } = msg.params;
      try {
        const buf = await cdnBytes(request.url);
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'content-type', value: 'text/javascript; charset=utf-8' },
            { name: 'access-control-allow-origin', value: '*' },
          ],
          body: buf.toString('base64'),
        }, sessionId);
      } catch (e) {
        errors.push(`cdn proxy failed for ${request.url}: ${e.message}`);
        await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }, sessionId).catch(() => {});
      }
    }
  });

  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Log.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: 'https://cdn.jsdelivr.net/*' }],
  }, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: false,
  }, sessionId);
  if (touch) {
    await cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: true, maxTouchPoints: 5,
    }, sessionId);
  }
  for (const source of seed) {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source }, sessionId);
  }
  await cdp.send('Page.navigate', { url: `${server.origin}${url}` }, sessionId);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Evaluate and hand back the value. A thrown expression is an error here
   * rather than a logged line, because every caller of this helper is
   * asserting on the answer. */
  async function evaluate(expression) {
    const r = await cdp.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    }, sessionId);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`evaluate threw: ${d.exception ? describe(d.exception) : d.text}`);
    }
    return r.result.value;
  }

  /* Poll until the expression is truthy. A wait in milliseconds is not
   * evidence of anything: on a software rasteriser a frame takes about
   * 120 ms, so a keypress followed by a fixed wait can read the state
   * BEFORE the key. */
  async function until(expression, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const ok = await evaluate(expression).catch(() => false);
      if (ok) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for: ${expression}`);
      }
      await sleep(100);
    }
  }

  async function tap(code) {
    const info = keyInfo(code);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info }, sessionId);
    await sleep(30);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info }, sessionId);
  }

  async function close() {
    try {
      ws.close();
    } catch (e) { /* The socket is already gone. Nothing to close. */ }
    proc.kill();
    await server.close();
  }

  return {
    cdp, sessionId, errors, warnings, origin: server.origin, proc,
    evaluate, until, tap, sleep, close,
  };
}
