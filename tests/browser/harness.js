/*
 * harness.js: runs the canonical baseline replay inside the browser using
 * the same shared modules as the Node runner, then resolves the promise
 * set up by harness.html. Never logs to the console; check 13 counts
 * every console error and warning.
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

import { decodeRec } from '../lib/recfile.js';
import { loadSim } from '../lib/simmod.js';
import { SimError, replayTrace } from '../lib/replay.js';

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status}`);
  }
  return res.text();
}

async function run() {
  const th = JSON.parse(await fetchText('/tests/thresholds.json'));
  const configText = await fetchText('/tests/fixtures/config-baseline.diff');
  const rec = decodeRec(await fetchBytes('/tests/inputs/baseline.rec'));
  const wasmBytes = await fetchBytes('/dist/sim.wasm');
  const sim = await loadSim(wasmBytes);
  const hash = await replayTrace(sim, rec, {
    configText,
    renderHz: th.replay.canonical_render_hz.value,
    traceStrideMs: th.replay.trace_stride_ms.value,
  });
  return { ok: true, hash };
}

run()
  .then((result) => {
    window.__simHarnessResolve(result);
  })
  .catch((e) => {
    if (e instanceof SimError) {
      window.__simHarnessResolve({
        ok: false,
        code: e.code,
        errorName: e.errorName,
        where: e.where,
      });
    } else {
      window.__simHarnessResolve({
        ok: false,
        errorName: 'harness-error',
        message: String(e && e.message ? e.message : e),
      });
    }
  });
