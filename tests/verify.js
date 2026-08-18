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
  /*
   * shell on Windows, because npm there is npm.cmd and spawnSync without a
   * shell cannot start it at all. The failure mode was the worst kind:
   * status null coerced to exit 1 with EMPTY stdout and stderr, so check 1
   * reported "build:wasm exited 1" with a blank where the reason belongs,
   * on every Windows machine, always. The owner stared at exactly that.
   * A spawn ERROR is also surfaced now instead of being dropped, so "could
   * not start npm" can never again read as a silent build failure.
   */
  /* One command STRING under a shell on Windows, not an args array: Node
   * deprecated shell-plus-array (DEP0190) because the args are concatenated
   * unescaped, and the owner's first successful Windows run printed exactly
   * that warning. The command is a constant, so a string is also the honest
   * form. Elsewhere the array form stays, with no shell in the way. */
  const build = process.platform === 'win32'
    ? spawnSync('npm run build:wasm', {
      cwd: root,
      encoding: 'utf8',
      timeout: 600000,
      shell: true,
    })
    : spawnSync('npm', ['run', 'build:wasm'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 600000,
    });
  const vendor = spawnSync('git', ['diff', '--stat', '--', 'vendor/betaflight'], {
    cwd: root,
    encoding: 'utf8',
  });
  const spawnFault = build.error ? `verify could not run npm: ${build.error.message}\n` : '';
  return {
    exitCode: build.status ?? 1,
    output: `${spawnFault}${build.stdout ?? ''}${build.stderr ?? ''}`,
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
    /*
     * The live audio bed, driven through the real shell rather than through
     * an OfflineAudioContext the harness builds itself. That distinction is
     * the whole point of this check: scripts/audio-probe.js calls
     * MotorAudio.attach on its own offline context, so every spectral claim
     * in this project stays true even if the shell stops building a graph at
     * all, which is exactly the defect that was reported as no music
     * playing. A synthetic click will not do either, because the shell wakes
     * audio from input.onKey and a window pointerdown listener, and browsers
     * only honour a real gesture, so this taps a real key over the DevTools
     * protocol. scripts/shots.js already drives the page that way and its
     * console gate is already trusted by check 13, so this drives it rather
     * than duplicating the plumbing.
     */
    audioBedRun: memo(async () => {
      /* 4 s, not 1.5. The scheduler advances in lookahead chunks, so a short
       * window lands mid chunk and the implied tempo is quantisation noise:
       * 1.5 s windows measured 23 and 20 steps, reporting 230 and 200 BPM on
       * a 174 BPM bed. Over 4 s it averages to 11.49 steps per second. */
      const windowMs = 4000;
      const out = join(root, 'dist/audio-bed');
      const steps = [
        `--out=${out}`,
        '--w=400',
        '--h=300',
        'until:!!window.__boot && window.__boot()',
        'tap:KeyZ',
        /* Settle before taking the baseline. The scheduler runs a lookahead,
         * so the first window after start counts the playing steps PLUS the
         * lookahead filling, and reports a rate that is not the tempo:
         * measured 23 steps in the first 1500 ms against 17 expected. After
         * a settle it is 46 steps in 4.003 s, 11.49 per second, which is
         * 172.4 BPM implied against 174 authored and 173.64 measured off the
         * rendered audio by scripts/audio-probe.js. */
        'wait:1500',
        "eval:(()=>{window.__abBase = window.__audio.music.step; window.__abT = window.__audio.ctx.currentTime; return 'ok'})()",
        `wait:${windowMs}`,
        'eval:JSON.stringify({' +
          "state: window.__audio.ctx ? window.__audio.ctx.state : 'none'," +
          'motorsAttached: Array.isArray(window.__audio.motors) && window.__audio.motors.length === 4,' +
          'musicAttached: !!window.__audio.music.gain,' +
          'musicGain: window.__audio.music.gain ? window.__audio.music.gain.gain.value : 0,' +
          /* The step counter is a position in a 256 step pattern, so it
           * wraps. Difference modulo the pattern length, not raw. */
          'steps: ((window.__audio.music.step - window.__abBase) % 256 + 256) % 256,' +
          'elapsed: window.__audio.ctx.currentTime - window.__abT,' +
          'nodes: window.__audio.nodeCount()' +
          '})',
      ];
      const run = spawnSync('node', [join(root, 'scripts/shots.js'), ...steps], {
        cwd: root,
        encoding: 'utf8',
        timeout: 300000,
      });
      const text = `${run.stdout ?? ''}${run.stderr ?? ''}`;
      const lines = text.split('\n').filter((l) => l.startsWith('eval ') && l.includes(' = "'));
      const last = lines[lines.length - 1];
      if (!last) {
        throw new Error(`shots.js produced no eval result: ${text.trim().split('\n').slice(-3).join(' | ')}`);
      }
      const quoted = last.slice(last.indexOf(' = ') + 3);
      const parsed = JSON.parse(JSON.parse(quoted));
      return { ...parsed, windowMs };
    }),
    /*
     * One page run that loads both maps and reports what each one measures.
     *
     * It doubles as the isolation evidence for the lazy load: it records every
     * URL the page requests while the RACE FIELD is selected, so the city's
     * modules being absent is a measurement rather than a claim. The city is
     * then chosen and the same list is read again, which is what proves the
     * modules arrive only when they are asked for.
     */
    scaleRun: memo(async () => {
      const out = join(root, 'dist/world-scale');
      const collect = "JSON.stringify({ tag: 'urls', urls: performance.getEntriesByType('resource').map((e) => e.name) })";
      const steps = [
        `--out=${out}`,
        /* 1280 by 720, matching the run that measured the c3c6e44 baseline
         * this check compares against. P5 is render target bytes and scales
         * with the panel, so comparing two resolutions would report a
         * regression that is only a window size. */
        '--w=1280',
        '--h=720',
        /* And the preset the baseline was measured at, for the same reason
         * as the size above. Headless Chrome rasterises on the CPU, so boot
         * would otherwise lower a detected preset to Low here and to
         * nothing at all on a machine with a GPU, and this check would
         * answer differently depending on who ran it. */
        '--graphics=high',
        'until:!!window.__boot && window.__boot().frames > 2',
        `eval:${collect}`,
        /* The race field's cost, at two parked cameras so the numbers are
         * reproducible. Measured with the field selected, which is the whole
         * point: the city must cost nothing at all until it is chosen. */
        'eval:JSON.stringify((() => {' +
          'window.__setCam(104.99, 1.6, 14.0, 104.99, 1.2, -30);' +
          'window.__camFrame = window.__boot().frames;' +
          'return { tag: "budget-pending" };' +
        '})())',
        /* __setCam only takes effect on the NEXT animation frame, and
         * measureBudget renders directly rather than through the frame loop,
         * so a fixed wait would measure whatever camera the last real frame
         * left. Waiting on the frame counter is the only honest way to know
         * the override has landed. */
        'until:window.__boot().frames > window.__camFrame + 3',
        'eval:JSON.stringify((() => {' +
          'const b = window.__budget("field spawn");' +
          'window.__setCam(null);' +
          'return { tag: "budget", p1: b.p1_calls, p2: b.p2_triangles, p5: b.p5_target_MB, p10: b.p10_attribute_MB, meshes: b.meshes, cel: window.__celCount() };' +
        '})())',
        'eval:JSON.stringify({' +
          'tag: "field",' +
          'map: window.__map().id,' +
          'references: window.__map().references,' +
          'gateScale: window.__gateScale(),' +
          /*
           * MEASURED IN WORLD SPACE, from bounding boxes, not from the
           * BufferGeometry constructor parameters. Reading `parameters.depth`
           * and `position.x` was the first version and it is blind to exactly
           * the error this check exists for: a `group.scale.setScalar(2)` on
           * the craft doubles the rendered quad and leaves every parameter
           * untouched, so the check would have reported 0.1550 m for a 310 mm
           * machine. A world Box3 sees the scale.
           */
          'craft: (() => {' +
            'const s = window.__mapScene();' +
            'let g = null;' +
            's.traverse((o) => { if (o.name === "craft") { g = o; } });' +
            'g.updateMatrixWorld(true);' +
            'const THREE = window.__three;' +
            'const body = g.children.find((c) => c.geometry && c.geometry.type === "BoxGeometry" && c.geometry.parameters.depth > 0.14);' +
            /* The body's OWN geometry through its own world matrix. Box3
             * setFromObject descends into children, and every body panel
             * carries an outlineHull, a back sided shell scaled 1.13, so the
             * first version measured 0.1754 m for a 0.155 m body: the hull,
             * not the airframe. Transforming the geometry's box keeps the
             * world scale and leaves the hull out. */
            'body.geometry.computeBoundingBox();' +
            'const bb = body.geometry.boundingBox.clone().applyMatrix4(body.matrixWorld);' +
            'const bs = new THREE.Vector3(); bb.getSize(bs);' +
            'const origin = new THREE.Vector3().setFromMatrixPosition(g.matrixWorld);' +
            'const at = new THREE.Vector3();' +
            /*
             * The swept disc: how far the outside of a spinning prop reaches
             * from the craft's centre.
             *
             * THE PROP RADIUS COMES FROM THE GEOMETRY AND ITS WORLD SCALE,
             * NOT FROM A WORLD BOUNDING BOX. A CylinderGeometry's box is a
             * SQUARE 2r by 2r in plan, and the discs spin, so an axis aligned
             * box around that square grows to 2r*sqrt(2) as it turns. Reading
             * half of it as the radius therefore reported anything from
             * 0.0635 to 0.0898 m depending on which frame the measurement
             * landed on, which is how this check produced 0.1438 m on one run
             * and 0.1957 m on the next for a craft that had not changed. It
             * failed both times, against a true 0.1735 m, and the failure
             * looked like a scale error in the model rather than a spinning
             * square in the harness.
             */
            'const wsc = new THREE.Vector3();' +
            'let maxR = 0;' +
            'for (const c of g.children) {' +
              'if (!c.geometry || c.geometry.type !== "CylinderGeometry") { continue; }' +
              'const rr = c.geometry.parameters.radiusTop;' +
              'if (rr < 0.05) { continue; }' +
              'c.getWorldScale(wsc);' +
              'at.setFromMatrixPosition(c.matrixWorld).sub(origin);' +
              'const d = Math.hypot(at.x, at.z) + rr * Math.max(Math.abs(wsc.x), Math.abs(wsc.z));' +
              'if (d > maxR) { maxR = d; }' +
            '}' +
            'const th = window.__craftState().thresholds;' +
            'return { bodyLength: Math.max(bs.x, bs.z), bodyWidth: Math.min(bs.x, bs.z), bodyHeight: bs.y, sweepMeasured: maxR, craftR: th.craftRadius, craftRTrue: th.craftRadiusTrue, worldScale: th.worldScale };' +
          '})()' +
        '})',
        'eval:JSON.stringify({ tag: "swap", started: (window.__setMap("city"), true) })',
        'until:window.__map().id === "city" && window.__map().ready',
        'eval:JSON.stringify({ tag: "city", references: window.__map().references, loading: window.__map().loading, expectedModules: window.__map().expectedModules, colliderFit: window.__map().colliderFit })',
        `eval:${collect}`,
        /*
         * BACK TO THE FIELD, AND MEASURE IT AGAIN. The budget taken at boot
         * cannot see a leak, because at that point the city has never existed:
         * anything the city fails to free on its way out is invisible until
         * the field is measured on the far side of a round trip. A review
         * pointed this out and it was right.
         */
        'eval:JSON.stringify({ tag: "back", started: (window.__setMap("field"), true) })',
        'until:window.__map().id === "field" && window.__map().ready',
        'eval:JSON.stringify((() => {' +
          'window.__setCam(104.99, 1.6, 14.0, 104.99, 1.2, -30);' +
          'window.__camFrame2 = window.__boot().frames;' +
          'return { tag: "budget2-pending" };' +
        '})())',
        'until:window.__boot().frames > window.__camFrame2 + 3',
        'eval:JSON.stringify((() => {' +
          'const b = window.__budget("field spawn after round trip");' +
          'window.__setCam(null);' +
          'return { tag: "budget2", p1: b.p1_calls, p2: b.p2_triangles, p5: b.p5_target_MB, p10: b.p10_attribute_MB, meshes: b.meshes, cel: window.__celCount() };' +
        '})())',
      ];
      const run = spawnSync('node', [join(root, 'scripts/shots.js'), ...steps], {
        cwd: root,
        encoding: 'utf8',
        timeout: 600000,
      });
      const text = `${run.stdout ?? ''}${run.stderr ?? ''}`;
      /*
       * The echoed expression is on the same line as its result, and these
       * expressions contain their own " = " (a `let g = null` inside the
       * scene walk), so slicing at the FIRST one cuts the line in the middle
       * of the JavaScript and hands JSON.parse a fragment. Anchored at the
       * end of the line instead.
       */
      const values = text
        .split('\n')
        .map((l) => (l.startsWith('eval ') ? l.match(/ = ("(?:[^"\\]|\\.)*")\s*$/) : null))
        .filter(Boolean)
        .map((m) => JSON.parse(JSON.parse(m[1])));
      /* Tagged rather than positional, because a step that fails silently
       * would otherwise shift every later result by one and the check would
       * report a confident wrong number. */
      const urls = values.filter((v) => v.tag === 'urls');
      const budget = values.find((v) => v.tag === 'budget');
      const budgetAfter = values.find((v) => v.tag === 'budget2');
      const fieldData = values.find((v) => v.tag === 'field');
      const cityData = values.find((v) => v.tag === 'city');
      if (urls.length < 2 || !fieldData || !cityData) {
        throw new Error(
          `world-scale run produced tags [${values.map((v) => v.tag).join(', ')}]: ` +
          `${text.trim().split('\n').slice(-3).join(' | ')}`,
        );
      }
      const [fieldUrls, cityUrls] = urls;
      const cr = cityData.references;
      const fr = fieldData.references;
      return {
        craft: fieldData.craft,
        field: {
          gateOpeningW: fr.gateOpeningW.measured,
          gateOpeningH: fr.gateOpeningH.measured,
          gateScale: fieldData.gateScale ?? null,
          grassMin: fr.grassBladeHeight.measured[0],
          grassMax: fr.grassBladeHeight.measured[1],
        },
        city: {
          kerb: cr.kerbHeight.measured,
          doorway: cr.doorwayHeight.measured,
          doorwayWidth: cr.doorwayWidth.measured,
          handrail: cr.handrailHeight.measured,
          boom: cr.crossingBoomHeight.measured,
          boomCollider: cr.crossingBoomCollider ? cr.crossingBoomCollider.measured : null,
          doorCount: cr.doorwayHeight.count,
          railCount: cr.handrailHeight.count,
          colliderFit: cityData.colliderFit ?? null,
        },
        loading: cityData.loading,
        cityExpectedModules: cityData.expectedModules ?? null,
        fieldBudget: budget,
        fieldBudgetAfterRoundTrip: budgetAfter,
        cityUrlsWhileFieldSelected: fieldUrls.urls.filter((u) => u.includes('/src/maps/city')),
        cityUrlsAfterChoosingCity: cityUrls.urls.filter((u) => u.includes('/src/maps/city')),
      };
    }),
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
