/*
 * browser.js: run the browser harness page in headless Chrome and collect
 * the replay result plus every console error and warning. Speaks the
 * DevTools protocol directly over Node's built-in WebSocket, so the
 * project needs no npm dependencies. Node only.
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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/*
 * Windows paths included, because the owner's machine is a Windows machine
 * and every browser-side check (3, 13, 14, 15, 16) was reporting
 * harness-error there for want of a path this list already knew on two
 * other platforms. Edge counts: it is Chromium and the harness drives it
 * over CDP the same way, so a stock Windows install needs nothing extra.
 */
const winApps = process.env['ProgramFiles'] || 'C:\\Program Files';
const winApps86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
const winLocal = process.env.LOCALAPPDATA || '';
const CHROME_CANDIDATES = [
  process.env.SIM_CHROME_BIN,
  '/opt/pw-browsers/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  join(winApps, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(winApps86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  winLocal ? join(winLocal, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
  join(winApps86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  join(winApps, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
];

export function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    if (c && existsSync(c)) {
      return c;
    }
  }
  return null;
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    this.closedErr = null;
    const fail = (err) => {
      if (this.closedErr) {
        return;
      }
      this.closedErr = err;
      for (const { reject } of this.pending.values()) {
        reject(err);
      }
      this.pending.clear();
    };
    ws.addEventListener('close', () => fail(new Error('CDP connection closed, Chrome died mid-run')));
    ws.addEventListener('error', () => fail(new Error('CDP connection errored')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(`CDP ${msg.error.message}`));
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

  send(method, params = {}, sessionId = undefined) {
    if (this.closedErr) {
      return Promise.reject(this.closedErr);
    }
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  onEvent(fn) {
    this.listeners.push(fn);
  }
}

function describeRemoteObject(obj) {
  if (!obj) {
    return 'unknown';
  }
  if (obj.type === 'string') {
    return obj.value;
  }
  if (obj.description) {
    return obj.description;
  }
  return JSON.stringify(obj.value ?? obj);
}

/*
 * Launch headless Chrome, open pageUrl, wait for the page to resolve
 * window.__simHarnessResult, and return
 *   { result, errors: [string], warnings: [string] }
 * Throws if Chrome cannot be found or the page never resolves in time.
 */
export async function runBrowserHarness(pageUrl, { timeoutMs = 120000 } = {}) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      'headless Chrome not found. Set SIM_CHROME_BIN to a Chrome or Chromium binary.',
    );
  }
  const userDataDir = await mkdtemp(join(tmpdir(), 'sim-chrome-'));
  let proc;
  try {
    proc = spawn(chrome, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ]);
    let stderrBuf = '';
    const wsUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Chrome did not report a DevTools endpoint. stderr: ${stderrBuf.slice(-2000)}`)),
        30000,
      );
      // Without an error listener a failed spawn raises an uncaught
      // exception and kills the runner instead of failing the check.
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Chrome failed to start: ${err.message}`));
      });
      proc.stderr.on('data', (d) => {
        stderrBuf += d.toString();
        const m = stderrBuf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
      proc.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Chrome exited early with code ${code}. stderr: ${stderrBuf.slice(-2000)}`));
      });
    });

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('WebSocket connect to Chrome failed')), { once: true });
    });
    const cdp = new Cdp(ws);

    const errors = [];
    const warnings = [];
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

    cdp.onEvent((msg) => {
      if (msg.sessionId !== sessionId) {
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        const text = msg.params.args.map(describeRemoteObject).join(' ');
        if (type === 'error' || type === 'assert') {
          errors.push(`console.${type}: ${text}`);
        } else if (type === 'warning') {
          warnings.push(`console.warning: ${text}`);
        }
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const desc = d.exception ? describeRemoteObject(d.exception) : d.text;
        errors.push(`uncaught: ${desc}`);
      } else if (msg.method === 'Log.entryAdded') {
        const e = msg.params.entry;
        if (e.level === 'error') {
          errors.push(`${e.source}: ${e.text}`);
        } else if (e.level === 'warning') {
          warnings.push(`${e.source}: ${e.text}`);
        }
      }
    });

    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url: pageUrl }, sessionId);

    // The navigation commits asynchronously. Until the harness page's head
    // script has run, evaluating in the target sees the old about:blank
    // context where __simHarnessResult is undefined, so poll for the
    // promise to exist before awaiting it.
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let ready = false;
      try {
        const probe = await cdp.send(
          'Runtime.evaluate',
          {
            expression: 'typeof window.__simHarnessResult',
            returnByValue: true,
          },
          sessionId,
        );
        ready = probe.result?.value === 'object';
      } catch (e) {
        // A probe can land in the gap between the about:blank context
        // being destroyed and the harness page context existing; that
        // rejection means retry, not failure. A dead connection does not.
        if (cdp.closedErr) {
          throw e;
        }
      }
      if (ready) {
        break;
      }
      if (Date.now() > deadline) {
        throw new Error('browser harness page never defined __simHarnessResult');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    let raceTimer;
    const evalResult = await Promise.race([
      cdp.send(
        'Runtime.evaluate',
        {
          expression: 'window.__simHarnessResult',
          awaitPromise: true,
          returnByValue: true,
          timeout: timeoutMs,
        },
        sessionId,
      ),
      new Promise((_, reject) => {
        raceTimer = setTimeout(() => reject(new Error('browser harness timed out')), timeoutMs);
      }),
    ]).finally(() => clearTimeout(raceTimer));
    if (evalResult.exceptionDetails) {
      throw new Error(
        `browser harness evaluation failed: ${JSON.stringify(evalResult.exceptionDetails)}`,
      );
    }
    ws.close();
    return { result: evalResult.result.value, errors, warnings };
  } finally {
    if (proc) {
      proc.kill('SIGKILL');
    }
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}
