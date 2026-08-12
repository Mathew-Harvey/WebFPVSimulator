/*
 * shots.js: drive the real shell in headless Chromium and capture frames.
 *
 * Every rendering bug this project has had was found by looking at a
 * frame, so looking at frames needs to be one command. This serves the
 * repo, opens index.html in Chromium over the DevTools protocol, presses
 * keys, waits, and writes PNGs. The container's Chromium does not inherit
 * the outbound proxy, so requests to the Three.js CDN are paused with the
 * Fetch domain and fulfilled from Node, which does have the proxy, with a
 * local cache so a run does not refetch a megabyte of Three.
 *
 * Usage:
 *   node scripts/shots.js --out=DIR [--w=1600] [--h=900] [--url=/index.html]
 *                         step step step
 * Steps:
 *   wait:MS          advance wall time
 *   shot:NAME        write DIR/NAME.png
 *   tap:CODE         key down then up, e.g. tap:Enter
 *   down:CODE        key down, held
 *   up:CODE          key up
 *   eval:EXPR        evaluate in the page and print the value
 *   until:EXPR       poll until EXPR is truthy, fail the run after 20 s
 *   expect:EXPR      fail the run unless EXPR is truthy right now
 *
 * until: and expect: exist because a wait in milliseconds is not evidence
 * of anything. On this container's software rasteriser a frame takes
 * about 120 ms, so a keypress followed by wait:400 can screenshot the
 * screen the player was on BEFORE the key, and the file gets a name that
 * lies. A capture of a named state must assert that state.
 *
 * Console errors and warnings are collected and printed at the end, so the
 * same run that produces the screenshots also answers the console gate.
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
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { startServer } from '../tests/lib/server.js';
import { findChrome } from '../tests/lib/browser.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CACHE = process.env.SIM_CDN_CACHE || join(tmpdir(), 'webfpv-cdn');

/* Virtual key codes for the keys the shell listens to. Chromium wants one
 * for a key event to look real to the page. */
const VK = {
  Enter: 13, Escape: 27, Space: 32, Tab: 9, Backspace: 8,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
};
function keyInfo(code) {
  if (/^Key[A-Z]$/.test(code)) {
    const ch = code.slice(3);
    return { key: ch.toLowerCase(), code, windowsVirtualKeyCode: ch.charCodeAt(0), text: ch.toLowerCase() };
  }
  if (/^Digit[0-9]$/.test(code)) {
    const d = code.slice(5);
    return { key: d, code, windowsVirtualKeyCode: d.charCodeAt(0), text: d };
  }
  const named = {
    Enter: '\r', Space: ' ', Tab: '\t',
  };
  return {
    key: code === 'Space' ? ' ' : code,
    code,
    windowsVirtualKeyCode: VK[code] ?? 0,
    text: named[code],
  };
}

class Cdp {
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

function describe(obj) {
  if (!obj) {
    return 'unknown';
  }
  if (obj.type === 'string') {
    return obj.value;
  }
  return obj.description ?? JSON.stringify(obj.value ?? obj);
}

async function main() {
  const args = process.argv.slice(2);
  const opts = { out: '.loop/shots', w: 1600, h: 900, url: '/index.html' };
  const steps = [];
  for (const a of args) {
    const m = a.match(/^--([a-z]+)=(.*)$/);
    if (m) {
      opts[m[1]] = /^\d+$/.test(m[2]) ? Number(m[2]) : m[2];
    } else {
      steps.push(a);
    }
  }
  const outDir = join(root, opts.out);
  await mkdir(outDir, { recursive: true });

  const chrome = findChrome();
  if (!chrome) {
    throw new Error('no Chromium found');
  }
  const server = await startServer(root);
  const userDataDir = await mkdtemp(join(tmpdir(), 'sim-shots-'));
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
    `--window-size=${opts.w},${opts.h}`,
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ]);
  let stderrBuf = '';
  const wsUrl = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no DevTools endpoint: ${stderrBuf.slice(-1500)}`)), 30000);
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
    width: Number(opts.w), height: Number(opts.h), deviceScaleFactor: 1, mobile: false,
  }, sessionId);
  await cdp.send('Page.navigate', { url: `${server.origin}${opts.url}` }, sessionId);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const step of steps) {
    const [op, ...rest] = step.split(':');
    const arg = rest.join(':');
    if (op === 'wait') {
      await sleep(Number(arg));
    } else if (op === 'shot') {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const path = join(outDir, `${arg}.png`);
      await writeFile(path, Buffer.from(data, 'base64'));
      console.log(`shot ${path}`);
      /* Every capture records which gate the race actually wants and where
       * that gate is on screen. Without it a G3 measurement is taken
       * against whichever ring happens to be bright in the frame, which is
       * not the same object as the target and is how G3 stayed unsettled
       * for a whole loop. Written beside the PNG so the two cannot drift
       * apart, and printed so a run's log carries it too. */
      const side = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          mode: window.__mode ?? null,
          screen: window.__screen ?? null,
          viewport: { w: innerWidth, h: innerHeight },
          nextGate: typeof window.__nextGate === 'function' ? window.__nextGate() : null,
          quad: typeof window.__quadScreen === 'function' ? window.__quadScreen() : null,
        })`,
        returnByValue: true,
      }, sessionId).catch(() => null);
      if (side && !side.exceptionDetails && typeof side.result.value === 'string') {
        await writeFile(join(outDir, `${arg}.json`), `${side.result.value}\n`);
        const s = JSON.parse(side.result.value);
        const g = s.nextGate && s.nextGate.gates ? s.nextGate.gates[0] : null;
        if (g) {
          console.log(
            `  target: race gate ${s.nextGate.raceNext} (scene ${g.sceneIndex}, plate ${g.flyOrder}) ` +
            `at ${g.distance.toFixed(1)} m, screen ${g.screen.x.toFixed(0)},${g.screen.y.toFixed(0)} ` +
            `${g.onScreen ? 'on screen' : 'OFF SCREEN'}, aperture ${g.aperturePx.toFixed(1)} px, glow ${g.glowGain.toFixed(2)}`,
          );
        } else {
          errors.push(`shot ${arg}: window.__nextGate returned nothing, so the capture cannot support a G3 claim`);
        }
      } else {
        errors.push(`shot ${arg}: the aim sidecar could not be evaluated`);
      }
    } else if (op === 'tap' || op === 'down' || op === 'up') {
      const info = keyInfo(arg);
      if (op !== 'up') {
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info }, sessionId);
      }
      if (op !== 'down') {
        if (op === 'tap') {
          await sleep(30);
        }
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info }, sessionId);
      }
    } else if (op === 'eval') {
      const r = await cdp.send('Runtime.evaluate', {
        expression: arg, returnByValue: true, awaitPromise: true,
      }, sessionId);
      if (r.exceptionDetails) {
        console.log(`eval ${arg} threw: ${JSON.stringify(r.exceptionDetails.exception ?? r.exceptionDetails.text)}`);
      } else {
        console.log(`eval ${arg} = ${JSON.stringify(r.result.value)}`);
      }
    } else if (op === 'click' || op === 'move') {
      const [x, y] = arg.split(',').map(Number);
      const common = { x, y, button: 'left', clickCount: 1 };
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...common }, sessionId);
      if (op === 'click') {
        await sleep(60);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...common }, sessionId);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common }, sessionId);
      }
    } else if (op === 'until' || op === 'expect') {
      const deadline = Date.now() + (op === 'until' ? 20000 : 0);
      let value;
      for (;;) {
        const r = await cdp.send('Runtime.evaluate', {
          expression: arg, returnByValue: true,
        }, sessionId).catch(() => null);
        value = r && !r.exceptionDetails ? r.result.value : undefined;
        if (value) {
          break;
        }
        if (Date.now() >= deadline) {
          errors.push(`${op} failed: ${arg} was ${JSON.stringify(value)}`);
          console.log(`  FAIL ${op} ${arg} = ${JSON.stringify(value)}`);
          break;
        }
        await sleep(120);
      }
      if (value) {
        console.log(`${op} ${arg} ok`);
      }
    } else {
      throw new Error(`unknown step ${step}`);
    }
  }

  console.log(`console errors=${errors.length} warnings=${warnings.length}`);
  for (const e of errors) {
    console.log(`  ERR ${e}`);
  }
  for (const w of warnings) {
    console.log(`  WARN ${w}`);
  }

  ws.close();
  proc.kill('SIGKILL');
  await server.close();
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`shots: ${e.message}`);
  process.exit(2);
});
