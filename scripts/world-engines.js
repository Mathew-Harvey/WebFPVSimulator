/*
 * world-engines.js: the world golden's own flights, flown in Node and in
 * headless Chromium through the same dist/sim.wasm and the same JS, and
 * compared step by step.
 *
 * WHY. CLAUDE.md requires the same input stream to give a bit identical
 * state trace in Node and in the browser, on any machine. npm run verify
 * checks that for one free air replay (check 3). Nothing checked it for a
 * flight with the solid world in it, and on 2026-09-24 that comparison was
 * left open. This closes it for the world golden's runs.
 *
 * WHAT IT FLIES. Every run of scripts/lib/worldruns.js: the town's eleven
 * crash paths (boxes), the built maps (boxes, the ground raised under the
 * craft every step from the map's height, a crane chord, which is a
 * capsule), and the two movers. Not scripts/world-check.js's scenarios:
 * world-check imports Node's fs and crypto and cannot load in a page, and
 * the golden's own runs cover boxes, capsules, a mover and a built map
 * between them. Node flies them with scripts/lib/worldrec.js recording every
 * step; the page imports the same two modules, which import the same shell
 * modules and tests/lib/simmod.js, fetches the same dist/sim.wasm, and does
 * the same. Each step's 32 bit digest is compared; at the first step that
 * differs, both records are fetched and the first of their 31 words that
 * differs is named, with both values to the bit. Each flight's SHA-256 is
 * taken on both sides (Node's crypto, the page's crypto.subtle) and compared
 * with the other and with tests/goldens/world.json.
 *
 * BOTH ARE V8. Node and Chromium run the same engine, so this proves the
 * page path (fetch, the module loader, the page's WebAssembly and typed
 * arrays, the in page recorder) changes nothing; it does not prove another
 * engine agrees. A SpiderMonkey or JavaScriptCore run needs only a host
 * that can instantiate the module and run these ES modules: the engines'
 * own shells (jsvu installs both, `sm` and `jsc`) with a ten line adapter
 * that reads the three files with the shell's read function instead of
 * fetch and prints the digests, or Firefox and WebKit driven over WebDriver
 * BiDi or Playwright. The runner uses no DOM and no Node API, and nothing it
 * computes on the way into the module is transcendental, so either should
 * agree to the bit or name the step where it does not.
 *
 * NOTHING HERE IS RECORDED. The comparison is live, engine against engine;
 * the golden it is also held to is written by scripts/world-golden.js
 * --write, and that is a reviewed act, with the owner's approval and a
 * PROGRESS.md entry saying which runs moved and why.
 *
 * Usage: node scripts/world-engines.js [--only=name]
 *        node scripts/world-engines.js --selftest   prove it can tell them apart
 * Exit code is the number of runs that differ, plus page errors.
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

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recordModule, RECORD_BYTES, RECORD_FIELDS } from './lib/worldrec.js';
import { goldenRuns, flyRun } from './lib/worldruns.js';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/* In the page: fly the named runs with the recorder keeping every record,
 * and hand back each flight's step count, SHA-256 and per step digests.
 * `fault` plants one of worldrec.js's faults in the page alone, for the self
 * test. */
function pageFly(names, fault = null) {
  return `
    const { recordModule } = await import('/scripts/lib/worldrec.js');
    const { goldenRuns, flyRun } = await import('/scripts/lib/worldruns.js');
    if (!window.__worldSession) {
      window.__worldSession = recordModule(WebAssembly, { keep: true });
    }
    const session = window.__worldSession;
    const get = async (p) => {
      const r = await fetch(p, { cache: 'no-store' });
      if (!r.ok) { throw new Error(p + ': ' + r.status); }
      return r;
    };
    const wasm = new Uint8Array(await (await get('/dist/sim.wasm')).arrayBuffer());
    const configs = {
      0: await (await get('/tests/fixtures/config-baseline.diff')).text(),
      1: await (await get('/configs/whoop-freestyle.diff')).text(),
    };
    const fx = await (await get('/tests/fixtures/town-crash.json')).json();
    const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
    const b64 = (u8) => {
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) { s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); }
      return btoa(s);
    };
    const names = ${JSON.stringify(names)};
    session.fault = ${JSON.stringify(fault)};
    window.__kept = {};
    const runs = {};
    const t0 = performance.now();
    for (const run of goldenRuns(fx)) {
      if (!names.includes(run.name)) { continue; }
      session.begin(run.name);
      let error = null;
      try { await flyRun(run, { wasm, configs }); } catch (e) { error = String((e && e.stack) || e); }
      const flights = session.end();
      window.__kept[run.name] = flights;
      const out = [];
      for (const f of flights) {
        const all = new Uint8Array(f.records.length * ${RECORD_BYTES});
        f.records.forEach((r, i) => all.set(r, i * ${RECORD_BYTES}));
        out.push({
          steps: f.steps,
          sha256: hex(await crypto.subtle.digest('SHA-256', all)),
          digests: b64(new Uint8Array(f.digests.buffer, f.digests.byteOffset, f.digests.byteLength)),
          error: f.error,
        });
      }
      runs[run.name] = { error, flights: out };
    }
    session.fault = null;
    return {
      wasmSha256: hex(await crypto.subtle.digest('SHA-256', wasm)),
      ua: navigator.userAgent,
      ms: performance.now() - t0,
      runs,
    };`;
}

function pageRecord(name, i, k) {
  return `
    const r = window.__kept[${JSON.stringify(name)}][${i}].records[${k}];
    let s = '';
    for (let j = 0; j < r.length; j += 1) { s += String.fromCharCode(r[j]); }
    return btoa(s);`;
}

function u32(b64) {
  const b = Buffer.from(b64, 'base64');
  return new Uint32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

/* The first of a record's 31 words that differs, with both values. */
function firstWord(a, b) {
  const da = new DataView(a.buffer, a.byteOffset, a.byteLength);
  const db = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let j = 0; j < RECORD_BYTES / 8; j += 1) {
    const x = da.getBigUint64(j * 8, true);
    const y = db.getBigUint64(j * 8, true);
    if (x !== y) {
      return `${RECORD_FIELDS[j]}: Node ${da.getFloat64(j * 8, true)} (0x${x.toString(16)}), Chrome ${db.getFloat64(j * 8, true)} (0x${y.toString(16)})`;
    }
  }
  return 'no word differs (the digests disagree about equal records?)';
}

/* Fly the runs in Node, recording every step. */
async function flyNode(env) {
  const session = recordModule(WebAssembly, { hash: () => createHash('sha256'), keep: true });
  const runs = new Map();
  const t0 = performance.now();
  for (const run of goldenRuns(env.fx)) {
    if (only && !run.name.toLowerCase().includes(only.toLowerCase())) {
      continue;
    }
    session.begin(run.name);
    let error = null;
    try {
      await flyRun(run, { wasm: env.wasm, configs: env.configs });
    } catch (e) {
      error = e.message;
    }
    runs.set(run.name, { error, flights: session.end() });
  }
  return { runs, ms: performance.now() - t0 };
}

/*
 * Compare Node's runs with the page's, step by step. Returns one entry a
 * run: { name, diff } with diff null when every step of every flight is
 * equal to the bit, or the first flight, step and word that differ.
 */
async function compare(node, chrome, ev) {
  const out = [];
  for (const [name, n] of node.runs) {
    const c = chrome.runs[name];
    let diff = null;
    if (!c) {
      diff = 'the page did not fly it';
    } else if (n.error || c.error) {
      diff = `Node ${n.error || 'ok'}; page ${c.error || 'ok'}`;
    } else if (n.flights.length !== c.flights.length) {
      diff = `${n.flights.length} flights in Node, ${c.flights.length} in the page`;
    }
    for (let i = 0; !diff && i < n.flights.length; i += 1) {
      const nf = n.flights[i];
      const cf = c.flights[i];
      const cd = u32(cf.digests);
      let k = -1;
      for (let s = 0; s < Math.max(nf.steps, cf.steps); s += 1) {
        if (s >= nf.steps || s >= cf.steps || nf.digests[s] !== cd[s]) {
          k = s;
          break;
        }
      }
      if (k >= 0 && k < nf.steps && k < cf.steps) {
        const rec = new Uint8Array(Buffer.from(await ev(pageRecord(name, i, k)), 'base64'));
        diff = `flight ${i + 1} first differs at step ${k + 1} (${k + 1} ms in), ${firstWord(nf.records[k], rec)}`;
      } else if (k >= 0) {
        diff = `flight ${i + 1} is ${nf.steps} steps in Node and ${cf.steps} in the page`;
      } else if (nf.sha256 !== cf.sha256) {
        diff = `flight ${i + 1}: every step's digest agrees but the SHA-256s do not (${nf.sha256.slice(0, 16)}, ${cf.sha256.slice(0, 16)})`;
      }
    }
    out.push({ name, diff });
  }
  return out;
}

/* Open the blank page, hand `fn` an evaluator, and close the browser and
 * delete its profile whatever happens. */
async function withPage(fn) {
  const page = await openPage({ root, width: 320, height: 200, url: '/scripts/world-engines.html' });
  const profile = (page.proc.spawnargs.find((a) => a.startsWith('--user-data-dir=')) || '').slice('--user-data-dir='.length);
  const exited = new Promise((r) => page.proc.once('exit', r));
  try {
    const ev = (body) => page.evaluate(`(async()=>{${body}})()`);
    for (let i = 0; i < 100 && !(await ev('return document.readyState === "complete"')); i += 1) {
      await sleep(100);
    }
    return await fn(ev, page);
  } finally {
    await page.close();
    await Promise.race([exited, sleep(15000)]);
    if (profile.includes('sim-page-')) {
      /* Retried: a Chrome helper can still be writing into the profile
       * after the browser's own exit, and the delete then fails with
       * ENOTEMPTY (measured once in four selftest runs, 2026-09-25). A
       * directory left in /tmp is not worth failing a check over. */
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
}

async function loadEnv() {
  return {
    wasm: await readFile(join(root, 'dist/sim.wasm')),
    configs: {
      0: await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8'),
      1: await readFile(join(root, 'configs/whoop-freestyle.diff'), 'utf8'),
    },
    fx: JSON.parse(await readFile(join(root, 'tests/fixtures/town-crash.json'), 'utf8')),
  };
}

async function main() {
  const t0 = performance.now();
  const env = await loadEnv();
  const golden = existsSync(join(root, 'tests/goldens/world.json'))
    ? JSON.parse(await readFile(join(root, 'tests/goldens/world.json'), 'utf8')) : null;
  const node = await flyNode(env);
  let failures = 0;
  await withPage(async (ev, page) => {
    const chrome = await ev(pageFly([...node.runs.keys()]));
    console.log(`world-engines: Node ${process.version} (V8 ${process.versions.v8}) against ${chrome.ua.match(/(Headless)?Chrome\/[0-9.]+/)[0]}: both V8`);
    const same = chrome.wasmSha256 === sha(env.wasm);
    console.log(`  the same module on both sides: ${same ? 'yes' : 'NO'}, dist/sim.wasm ${sha(env.wasm).slice(0, 16)} in Node, ${chrome.wasmSha256.slice(0, 16)} in the page`);
    failures += same ? 0 : 1;
    console.log(`  ${node.runs.size} runs; Node flew them in ${(node.ms / 1000).toFixed(1)} s, Chromium in ${(chrome.ms / 1000).toFixed(1)} s\n`);
    for (const { name, diff } of await compare(node, chrome, ev)) {
      if (diff) {
        failures += 1;
        console.log(`  DIFFER  ${name}: ${diff}`);
        continue;
      }
      /* The golden is check:world-golden's business; it is shown so a
       * reader can see all three agree, and not counted. */
      const n = node.runs.get(name);
      const g = golden && golden.runs[name];
      const vsGolden = !g ? 'not in the golden'
        : (g.flights.every((f, i) => f.sha256 === n.flights[i].sha256) ? 'the golden too' : 'the golden differs');
      const steps = n.flights.reduce((m, f) => m + f.steps, 0);
      console.log(`  equal   ${name}  ${steps} steps, every step to the bit, SHA-256 ${n.flights.map((f) => f.sha256.slice(0, 12)).join(' ')} on both; ${vsGolden}`);
    }
    if (page.errors.length) {
      failures += page.errors.length;
      console.log(`\n  page errors: ${page.errors.join(' | ')}`);
    }
  });
  console.log(`\nworld-engines: ${failures === 0 ? `Node and Chromium agree to the bit on every step of every run (${((performance.now() - t0) / 1000).toFixed(1)} s)` : `${failures} DIFFER`}`);
  return failures;
}

/*
 * THE SELF TEST: a comparison that always said equal would prove nothing.
 * The page flies once as it is, and must agree with Node everywhere; then
 * once with every box moved by a nanometre in the page only, and must be
 * told apart, with a step and a word named, on exactly the runs whose
 * craft touched a box or stood on one in Node, and on none of the runs
 * whose world has no box.
 */
async function selftest() {
  const env = await loadEnv();
  const node = await flyNode(env);
  let bad = 0;
  const say = (ok, line) => {
    bad += ok ? 0 : 1;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${line}`);
  };
  await withPage(async (ev) => {
    const clean = await compare(node, await ev(pageFly([...node.runs.keys()])), ev);
    const differ = clean.filter((r) => r.diff);
    say(differ.length === 0, `unfaulted, Node and the page agree on all ${clean.length} runs${differ.length ? `; differ: ${differ.map((r) => r.name).join(', ')}` : ''}`);
    const faulted = await compare(node, await ev(pageFly([...node.runs.keys()], 'box')), ev);
    const must = [];
    const cannot = [];
    const missed = [];
    const extra = [];
    for (const r of faulted) {
      const flights = node.runs.get(r.name).flights;
      if (flights.some((f) => f.summary.boxSteps > 0 || f.summary.supportContactSteps > 0)) {
        must.push(r.name);
        if (!r.diff || !/at step \d+ .*: Node .* Chrome /.test(r.diff)) {
          missed.push(r.name);
        }
      } else if (flights.every((f) => f.summary.world.boxes === 0)) {
        cannot.push(r.name);
        if (r.diff) {
          extra.push(r.name);
        }
      }
    }
    say(missed.length === 0 && extra.length === 0 && must.length > 0,
      `every box moved 1e-9 m in the page only: all ${must.length} runs that touch a box differ, with a step and a word named, and none of the ${cannot.length} without a box does`
      + `${missed.length ? `\n        MISSED: ${missed.join('; ')}` : ''}${extra.length ? `\n        ALSO: ${extra.join('; ')}` : ''}`);
    const example = faulted.find((r) => r.diff);
    if (example) {
      console.log(`        for example ${example.name}: ${example.diff}`);
    }
  });
  console.log(`\nworld-engines selftest: ${bad === 0 ? 'all passed' : `${bad} FAILED`}`);
  return bad;
}

(args.includes('--selftest') ? selftest() : main()).then((code) => process.exit(code)).catch((e) => {
  console.error(e);
  process.exit(99);
});
