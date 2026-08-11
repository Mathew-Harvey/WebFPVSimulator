/*
 * verify.js: the npm run verify entry point. Runs every Stage 1 check from
 * STAGE1.md, prints one table row per check with the measured value, the
 * threshold and PASS or FAIL, then exits non-zero if anything failed. A
 * check can fail, it can never crash the runner or be skipped.
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

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeRec } from './lib/recfile.js';
import { loadSim } from './lib/simmod.js';
import { SimError, replayTrace } from './lib/replay.js';
import { buildChecks } from './lib/checks.js';
import { renderTable } from './lib/table.js';
import { startServer } from './lib/server.js';
import { runBrowserHarness } from './lib/browser.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function runBuild() {
  const build = spawnSync('npm', ['run', 'build:wasm'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 600000,
  });
  const vendor = spawnSync('git', ['diff', '--stat', '--', 'vendor/betaflight'], {
    cwd: root,
    encoding: 'utf8',
  });
  return {
    exitCode: build.status ?? 1,
    output: `${build.stdout ?? ''}${build.stderr ?? ''}`,
    vendorDiff: (vendor.stdout ?? '').trim(),
  };
}

function memo(fn) {
  let called = false;
  let value;
  let failure;
  return async () => {
    if (!called) {
      called = true;
      try {
        value = await fn();
      } catch (e) {
        failure = e;
      }
    }
    if (failure) {
      throw failure;
    }
    return value;
  };
}

async function main() {
  const th = JSON.parse(await readFile(join(root, 'tests/thresholds.json'), 'utf8'));
  const configA = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
  const configB = await readFile(join(root, 'tests/fixtures/config-rates-b.diff'), 'utf8');
  const rec = decodeRec(new Uint8Array(await readFile(join(root, 'tests/inputs/baseline.rec'))));

  console.log('npm run verify: Stage 1 checks from STAGE1.md');
  console.log(`baseline: ${rec.count} samples at ${rec.rateHz} Hz, ${(rec.count / rec.rateHz).toFixed(1)} s\n`);

  const build = runBuild();
  if (build.exitCode !== 0) {
    console.log('build:wasm output (build failed, checks will report it):');
    console.log(build.output.trim().split('\n').slice(-15).join('\n'));
    console.log('');
  }

  const wasmBytes = memo(async () => {
    const bytes = await readFile(join(root, 'dist/sim.wasm'));
    return new Uint8Array(bytes);
  });

  const ctx = {
    th,
    root,
    rec,
    configA,
    configB,
    build,
    canonicalOpts() {
      return {
        configText: configA,
        renderHz: th.replay.canonical_render_hz.value,
        traceStrideMs: th.replay.trace_stride_ms.value,
      };
    },
    freshSim: async () => loadSim(await wasmBytes()),
    nodeCanonicalHash: memo(async () =>
      replayTrace(await loadSim(await wasmBytes()), rec, {
        configText: configA,
        renderHz: th.replay.canonical_render_hz.value,
        traceStrideMs: th.replay.trace_stride_ms.value,
      }),
    ),
    browserRun: memo(async () => {
      const server = await startServer(root);
      try {
        return await runBrowserHarness(
          `${server.origin}/tests/browser/harness.html`,
        );
      } finally {
        await server.close();
      }
    }),
  };

  const rows = [];
  let passing = 0;
  for (const check of buildChecks()) {
    let r;
    try {
      r = await check.run(ctx);
    } catch (e) {
      if (e instanceof SimError) {
        r = {
          measured: `${e.where} -> ${e.errorName}`,
          pass: false,
          reason: e.errorName,
        };
      } else {
        r = {
          measured: 'n/a',
          pass: false,
          reason: `harness-error: ${e.message}`,
        };
      }
    }
    if (r.pass) {
      passing += 1;
    }
    rows.push([
      check.num,
      check.id,
      r.measured,
      check.thresholdText,
      r.pass ? 'PASS' : 'FAIL',
      r.reason ?? '',
    ]);
  }

  console.log(renderTable(['#', 'check', 'measured', 'threshold', 'result', 'reason'], rows));
  console.log(`\n${passing} of ${rows.length} checks passing`);
  process.exit(passing === rows.length ? 0 : 1);
}

main().catch((e) => {
  console.error(`verify: fatal: ${e.stack ?? e}`);
  process.exit(2);
});
