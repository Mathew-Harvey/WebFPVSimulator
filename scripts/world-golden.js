/*
 * world-golden.js: the plant's solid world, pinned to the bit.
 *
 * WHAT IT PINS. Every step of four sets of flights through dist/sim.wasm,
 * Betaflight and the plant, with the solid world of src/native/world.c in
 * them:
 *
 *   world-check  every scenario scripts/world-check.js defines, flown by
 *                world-check's own code at the yaws it uses: walls at 3 to
 *                20 m/s, the whoop, four spawn yaws, roofs, a pole, a
 *                ceiling, a capsule bar, a pinned craft, the train.
 *   town         scripts/crash-check.js's eleven paths at its shopfront, in
 *                the town's own solids as the shell handed them to the module
 *                (tests/fixtures/town-crash.json), on a stick script.
 *   built        the starter and a map of one of everything from
 *                src/maps/built/place.js: lift off at the spawn, a wall at
 *                5 m/s, a roof settle and a dive onto a roof, and a slide
 *                along a scaffold board's underside.
 *   movers       a heading zero mover meeting a hovering craft, and one a
 *                whoop rides beside, the case Stage D part 2 must keep bit
 *                identical.
 *
 * scripts/lib/worldrec.js records every step at the module's boundary: the
 * state block and the world contact report the shell reads. Each flight's
 * SHA-256 over those records is compared with tests/goldens/world.json.
 * Where one differs, the golden's per step digests name the first step that
 * differs, and the flight's world inputs say whether the world it was
 * handed changed or the module flew the same world differently.
 *
 * WHY IT EXISTS. check:plant and verify cannot see the world solve: world.c
 * returns before doing anything when no world is built, and no plant golden
 * scenario or verify replay builds one. check:world asserts ranges and
 * printed the same characters on a module whose world.c had changed. The
 * owner approved P1 and P2 (FREESTYLE-MAPS-PLAN.md, section 10) on condition
 * that coverage able to see the world solve lands first. This is it.
 *
 * RECORDING IS A REVIEWED ACT. --write rewrites the golden from whatever the
 * module does now. That is right exactly once, when the golden lands, and
 * afterwards only when the owner has approved a change that is meant to move
 * named runs: PROGRESS.md then says which runs moved and why, as it does for
 * tests/goldens/plant.json. Rewriting it to make a red check green is the
 * same cheat as widening a band in tests/thresholds.json. --export-town
 * rewrites the town fixture from the real page, and is the same kind of act.
 *
 * DETERMINISTIC by construction: no browser in the check, no clock, no
 * random, no JS trigonometry on anything that reaches the module. Every run
 * is flown twice and the two must agree to the bit before either is compared
 * with the golden.
 *
 * Usage:
 *   node scripts/world-golden.js                 compare with the golden
 *   node scripts/world-golden.js --write         record it (reviewed act)
 *   node scripts/world-golden.js --selftest      plant faults; each must show
 *   node scripts/world-golden.js --only=town     runs whose name holds this
 *   node scripts/world-golden.js --wasm=PATH     fly another module
 *   node scripts/world-golden.js --export-town   write the town fixture from
 *                                                the real page (reviewed act)
 *   node scripts/world-golden.js --town          check that fixture against
 *                                                the real page
 *   node scripts/world-golden.js --verbose       what each run measured
 * Exit code is the failure count.
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
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recordModule, packDigests, firstDifference, FAULTS, STEP_BITS } from './lib/worldrec.js';
import { goldenRuns, flyRun, townShapes } from './lib/worldruns.js';
import { threePosToSim } from '../src/render/frame.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const GOLDEN = join(root, 'tests/goldens/world.json');
const FIXTURE = join(root, 'tests/fixtures/town-crash.json');
const CONFIG_FOR = { 0: 'tests/fixtures/config-baseline.diff', 1: 'configs/whoop-freestyle.diff' };

/*
 * THE TOWN FIXTURE'S RADIUS. A solid can only be touched in a step if it is
 * within the craft's reach of the CG in plan (the five inch's hull corner
 * and a prop disc, under 0.25 m) or under the CG, where it can be the
 * ground. So a run that stays within D of its path can only touch solids
 * within D + 0.25 m of it, and every town run asserts D is at most the
 * radius less a metre. Measured when the fixture was written, the furthest
 * any run strayed from its path was 0.40 m (the glancing hit). 15 m leaves a
 * crash room to tumble fourteen metres sideways before the fixture could be
 * missing anything it might touch, for 650 or so of the town's 19,515
 * solids and well under the 1 MB the fixture was allowed.
 */
const RADIUS = 15;

const args = process.argv.slice(2);
function opt(name) {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
const only = opt('only') || '';
const verbose = args.includes('--verbose');

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/* Every instance of the module made from here on is recorded while a run
 * has begun. Installed before world-check is imported, though world-check
 * only instantiates when a scenario flies. */
const session = recordModule(WebAssembly, { hash: () => createHash('sha256') });
const worldCheck = await import('./world-check.js');

/* ------------------------------------------------------------------ *
 * scripts/crash-check.js's scenarios, read out of its source: importing it
 * would open a browser. The fixture carries the table it was exported
 * with, and a check compares the two, so a changed path is a named failure.
 * ------------------------------------------------------------------ */
function readCrashCheck() {
  const src = readFileSync(join(root, 'scripts/crash-check.js'), 'utf8');
  const east = src.match(/^const EAST = ([-0-9.e]+);$/m);
  const wall = src.match(/^const WALL = (\{[^}\n]*\});$/m);
  const at = src.indexOf('\nconst SCENARIOS = [');
  const end = at < 0 ? -1 : src.indexOf('\n];', at);
  if (!east || !wall || at < 0 || end < 0) {
    throw new Error('cannot read EAST, WALL and SCENARIOS out of scripts/crash-check.js');
  }
  const EAST = Number(east[1]);
  /* eslint-disable-next-line no-new-func */
  const scenarios = new Function('EAST', `return ${src.slice(at + '\nconst SCENARIOS = '.length, end + 2)};`)(EAST);
  /* eslint-disable-next-line no-new-func */
  return { scenarios, wall: new Function(`return (${wall[1]});`)(), east: EAST };
}

/* Shapes as bytes, for hashing: type, index, then the arguments the module
 * was handed, eleven doubles a shape. The page packs the town the same way. */
const SHAPE_DOUBLES = 11;
function shapeBytes(shapes) {
  const f = new Float64Array(shapes.length * SHAPE_DOUBLES);
  shapes.forEach((s, k) => {
    f[k * SHAPE_DOUBLES] = s.type;
    f[k * SHAPE_DOUBLES + 1] = s.index;
    s.args.forEach((v, j) => {
      f[k * SHAPE_DOUBLES + 2 + j] = v;
    });
  });
  return new Uint8Array(f.buffer);
}

async function loadFixture() {
  if (!existsSync(FIXTURE)) {
    return null;
  }
  const fx = JSON.parse(await readFile(FIXTURE, 'utf8'));
  return { fx, sha256: sha(shapeBytes(townShapes(fx))) };
}

async function loadEnv() {
  const configs = {};
  const configHashes = {};
  for (const [af, rel] of Object.entries(CONFIG_FOR)) {
    configs[af] = await readFile(join(root, rel), 'utf8');
    configHashes[rel] = sha(configs[af]).slice(0, 16);
  }
  const wasmPath = opt('wasm') ? resolve(opt('wasm')) : join(root, 'dist/sim.wasm');
  const wasm = await readFile(wasmPath);
  /* world-check read dist/sim.wasm itself; the recorder hands every
   * instantiation these bytes instead, so --wasm reaches its flights too. */
  session.moduleBytes = opt('wasm') ? wasm : null;
  return { wasm, wasmPath, configs, configHashes };
}

/* ------------------------------------------------------------------ *
 * Flying.
 * ------------------------------------------------------------------ */

/*
 * Fly every run whose name holds `filter`, once. `fx` is the parsed town
 * fixture. Returns name -> { flights, error, metrics, run, lines, ms }.
 * world-check's scenarios print their own check lines; they are kept.
 */
async function flyAll(env, fx, filter, fault = null) {
  session.fault = fault;
  const out = new Map();
  const wanted = (name) => !filter || name.toLowerCase().includes(filter.toLowerCase());
  for (const sc of worldCheck.SCENARIOS) {
    const name = `world-check: ${sc.name}`;
    if (!wanted(name)) {
      continue;
    }
    const lines = [];
    const log = console.log;
    const t0 = performance.now();
    session.begin(name);
    let error = null;
    console.log = (...a) => lines.push(a.join(' '));
    try {
      await sc.fn();
    } catch (e) {
      error = e;
    } finally {
      console.log = log;
    }
    out.set(name, { flights: session.end(), error, lines, ms: performance.now() - t0 });
  }
  if (fx) {
    for (const run of goldenRuns(fx)) {
      if (!wanted(run.name)) {
        continue;
      }
      const t0 = performance.now();
      session.begin(run.name);
      let metrics = null;
      let error = null;
      try {
        metrics = await flyRun(run, env);
      } catch (e) {
        error = e;
      }
      out.set(run.name, { flights: session.end(), error, run, metrics, ms: performance.now() - t0 });
    }
  }
  session.fault = null;
  return out;
}

function flightErrors(r) {
  if (r.error) {
    return r.error.message;
  }
  const bad = r.flights.find((f) => f.error);
  return bad ? `flight ${bad.index + 1}: ${bad.error}` : null;
}

function sameFlights(a, b) {
  return a.flights.length === b.flights.length && a.flights.every((f, i) => f.sha256 === b.flights[i].sha256);
}

function groupOf(name) {
  return name.slice(0, name.indexOf(':'));
}

/* ------------------------------------------------------------------ *
 * The golden file.
 * ------------------------------------------------------------------ */

function goldenFrom(env, fixture, passA) {
  const out = {
    note: 'Written by scripts/world-golden.js --write. Rewrite only with the owner\'s approval, and say in PROGRESS.md which runs moved and why.',
    wasmSha256: sha(env.wasm),
    configs: env.configHashes,
    town: fixture ? { fixture: 'tests/fixtures/town-crash.json', sha256: fixture.sha256, export: fixture.fx.export.sha256 } : null,
    stepBits: STEP_BITS,
    runs: {},
    traces: {},
  };
  for (const [name, r] of passA) {
    out.runs[name] = { flights: r.flights.map((f) => ({ sha256: f.sha256, inputs: f.inputs.slice(0, 16) })) };
    for (const f of r.flights) {
      out.traces[f.sha256] = { steps: f.steps, summary: f.summary, digests: packDigests(f.digests) };
    }
  }
  return out;
}

/* One line per run, per trace and per digest string, so a rewrite reads as
 * a diff of what moved. */
function goldenText(g) {
  const lines = ['{'];
  const head = { note: g.note, wasmSha256: g.wasmSha256, configs: g.configs, town: g.town, stepBits: g.stepBits };
  for (const [k, v] of Object.entries(head)) {
    lines.push(` ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  }
  lines.push(' "runs": {');
  const runs = Object.entries(g.runs);
  runs.forEach(([k, v], i) => lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${i < runs.length - 1 ? ',' : ''}`));
  lines.push(' },');
  lines.push(' "traces": {');
  const traces = Object.entries(g.traces);
  traces.forEach(([k, v], i) => {
    lines.push(`  ${JSON.stringify(k)}: {"steps": ${v.steps}, "summary": ${JSON.stringify(v.summary)},`);
    lines.push(`   "digests": ${JSON.stringify(v.digests)}}${i < traces.length - 1 ? ',' : ''}`);
  });
  lines.push(' }');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

function summaryDiff(a, b) {
  const out = [];
  for (const k of Object.keys(a)) {
    const x = JSON.stringify(a[k]);
    const y = JSON.stringify(b[k]);
    if (x !== y) {
      out.push(`${k} ${x} -> ${y}`);
    }
  }
  return out.join(', ') || 'no summary value moved';
}

/*
 * Compare one run's flights with the golden. Returns null when equal, or
 * the failure, naming the first flight and step that differ.
 */
function compareRun(name, r, golden) {
  const g = golden.runs[name];
  if (!g) {
    return { text: 'not in the golden: a new run, recorded only with the owner\'s approval', step: null };
  }
  if (g.flights.length !== r.flights.length) {
    return { text: `flies ${r.flights.length} flight${r.flights.length === 1 ? '' : 's'}, the golden has ${g.flights.length}`, step: null };
  }
  for (let i = 0; i < g.flights.length; i += 1) {
    const f = r.flights[i];
    const gf = g.flights[i];
    if (f.sha256 === gf.sha256) {
      continue;
    }
    const tr = golden.traces[gf.sha256];
    const k = firstDifference(f.digests, tr.digests);
    const world = f.inputs.slice(0, 16) === gf.inputs
      ? 'the world it was handed is the same, so the module flew it differently, or the run\'s own sticks changed'
      : 'the world it was handed changed (solids, frame or movers), so look there first';
    const where = k < 0
      ? `every step's ${STEP_BITS} bit digest agrees but the trace does not (a difference the digests could not place)`
      : `differs from step ${k + 1} (${k + 1} ms in) of ${f.steps}`;
    return {
      text: `flight ${i + 1} of ${g.flights.length} ${where}; ${world}\n        golden -> now: ${summaryDiff(tr.summary, f.summary)}`,
      step: k + 1,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Check and record.
 * ------------------------------------------------------------------ */

async function checkOrWrite({ write }) {
  const t0 = performance.now();
  const env = await loadEnv();
  const loaded = await loadFixture();
  let failures = 0;
  const fail = (line) => {
    failures += 1;
    console.log(line);
  };
  const golden = !write && existsSync(GOLDEN) ? JSON.parse(await readFile(GOLDEN, 'utf8')) : null;
  if (!write && !golden) {
    console.log('world-golden: no golden at tests/goldens/world.json. Record one with --write.');
    return 1;
  }
  const shown = env.wasmPath.startsWith(`${root}/`) ? env.wasmPath.slice(root.length + 1) : env.wasmPath;
  console.log(`world-golden: ${shown} ${sha(env.wasm).slice(0, 16)}${write ? ', WRITING' : ''}`);
  if (golden && golden.wasmSha256 !== sha(env.wasm)) {
    console.log(`  note  the module differs from the one the golden was written against (${golden.wasmSha256.slice(0, 16)}).`);
    console.log('        Equal traces from a different module is the claim under test.');
  }

  /* The town fixture: present, intact, and the one crash-check still flies. */
  let fixture = null;
  if (!loaded) {
    fail('  FAIL  tests/fixtures/town-crash.json is missing: export it with --export-town (a reviewed act)');
  } else if (loaded.sha256 !== loaded.fx.sha256) {
    fail(`  FAIL  tests/fixtures/town-crash.json was edited: its shapes hash to ${loaded.sha256.slice(0, 16)}, it records ${String(loaded.fx.sha256).slice(0, 16)}`);
  } else {
    fixture = loaded;
    const cc = readCrashCheck();
    for (const [what, a, b] of [['scenarios', cc.scenarios, fixture.fx.scenarios], ['WALL', cc.wall, fixture.fx.wall], ['EAST', cc.east, fixture.fx.east]]) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        fail(`  FAIL  scripts/crash-check.js's ${what} changed since the town fixture was exported: re-export with --export-town (a reviewed act) and re-record`);
      }
    }
    if (golden && golden.town && golden.town.sha256 !== fixture.sha256) {
      fail(`  FAIL  the town fixture is not the one the golden was recorded with (${fixture.sha256.slice(0, 16)}, golden ${golden.town.sha256.slice(0, 16)})`);
    }
  }
  if (golden) {
    for (const [rel, h] of Object.entries(env.configHashes)) {
      if (golden.configs[rel] !== h) {
        console.log(`  note  ${rel} differs from the one the golden was written with; every run on that airframe will move`);
      }
    }
  }

  const a = await flyAll(env, fixture ? fixture.fx : null, only);
  const b = await flyAll(env, fixture ? fixture.fx : null, only);
  console.log(`  ${a.size} runs, ${[...a.values()].reduce((n, r) => n + r.flights.length, 0)} flights, ${[...a.values()].reduce((n, r) => n + r.flights.reduce((m, f) => m + f.steps, 0), 0)} steps, each flown twice\n`);

  let first = null;
  for (const [name, r] of a) {
    const r2 = b.get(name);
    const err = flightErrors(r) || flightErrors(r2);
    if (err) {
      fail(`  FAIL  ${name}: ${err}`);
      first = first || { name, step: null };
      continue;
    }
    if (!sameFlights(r, r2)) {
      fail(`  FAIL  ${name}: two identical runs disagree, so nothing about it can be pinned`);
      first = first || { name, step: null };
      continue;
    }
    if (r.run && !r.run.exercises(r.metrics)) {
      fail(`  FAIL  ${name}: no longer exercises what it is named for\n        ${r.run.describe(r.metrics)}`);
      first = first || { name, step: null };
      continue;
    }
    if (verbose) {
      if (r.run) {
        console.log(`        ${r.run.describe(r.metrics)}`);
      } else {
        const guards = r.lines.filter((l) => /^ {2}FAIL /.test(l)).length;
        console.log(`        world-check's own checks: ${guards === 0 ? 'no guard failed' : `${guards} guards FAILED`}`);
      }
    }
    if (write) {
      console.log(`  wrote ${name}  ${r.flights.length} flight${r.flights.length === 1 ? '' : 's'}  ${r.flights.map((f) => f.sha256.slice(0, 12)).join(' ')}`);
      continue;
    }
    const d = compareRun(name, r, golden);
    if (d) {
      fail(`  FAIL  ${name}: ${d.text}`);
      first = first || { name, step: d.step };
    } else {
      console.log(`  pass  ${name}  ${r.flights.length} flight${r.flights.length === 1 ? '' : 's'}, ${r.flights.reduce((m, f) => m + f.steps, 0)} steps`);
    }
  }
  if (golden && !only) {
    for (const name of Object.keys(golden.runs)) {
      if (!a.has(name)) {
        fail(`  FAIL  ${name}: in the golden but no longer flown`);
      }
    }
  }

  const times = new Map();
  for (const [name, r] of a) {
    times.set(groupOf(name), (times.get(groupOf(name)) || 0) + r.ms + b.get(name).ms);
  }
  const total = (performance.now() - t0) / 1000;
  console.log(`\n  time ${total.toFixed(1)} s: ${[...times].map(([g, ms]) => `${g} ${(ms / 1000).toFixed(1)} s`).join(', ')}, both passes`);

  if (write) {
    if (failures > 0) {
      console.log('\nworld-golden: NOT written, because the runs above failed');
      return failures;
    }
    if (only) {
      console.log('\nworld-golden: NOT written: --write records every run, not a subset');
      return 1;
    }
    const g = goldenFrom(env, fixture, a);
    await mkdir(dirname(GOLDEN), { recursive: true });
    const text = goldenText(g);
    await writeFile(GOLDEN, text);
    console.log(`\nworld-golden: wrote tests/goldens/world.json, ${Object.keys(g.runs).length} runs, ${Object.keys(g.traces).length} distinct traces, ${(text.length / 1024).toFixed(0)} KB`);
    return 0;
  }
  console.log(`\nworld-golden: ${failures === 0 ? 'all passed' : `${failures} FAILED, the first ${first ? `${first.name}${first.step ? ` at step ${first.step}` : ''}` : 'above'}`}`);
  return failures;
}

/* ------------------------------------------------------------------ *
 * THE SELF TEST: does the golden see what it must, and only that?
 * ------------------------------------------------------------------ */

/*
 * Which flights each planted fault must turn red, and which it cannot, read
 * off the golden's own summaries. A flight in neither list may go either way
 * and is counted.
 *
 * RESTITUTION IS THE SUBTLE ONE. A prop disc always meets a solid with no
 * restitution and its own friction, and a box top taken as the ground is
 * solved as ground with the shell's restitution, so only the frame or the
 * lens against a solid can see it. And above the knee, 1.7 m/s of closing
 * speed, world.c scales e as e * WORLD_E_KNEE / vin, and for e = 0.15, the
 * town's walls and world-check's, e * 1.7 is the same double whether or not
 * e's last bit is set: measured, 0.255 both ways. So a hit taken on the
 * props with a few fast frame touches cannot see a one bit restitution, and
 * that is the module's arithmetic being honest, not the golden being blind.
 * A frame that stays on a solid goes through slow contacts, under the knee,
 * where e is used as it is. Measured on this golden: every flight with 527
 * or more frame contact steps went red, and the ones that stayed green had 3
 * to 9. The line is drawn at a tenth of a second of frame contact.
 */
const SUSTAINED_FRAME_STEPS = 100;
const EXPECT = {
  box: {
    must: (s) => s.boxSteps > 0 || s.supportContactSteps > 0,
    cannot: (s) => s.world.boxes === 0,
  },
  restitution: {
    must: (s) => s.frameSteps >= SUSTAINED_FRAME_STEPS && s.boxSteps + s.capsuleSteps > 0 && s.world.moverSets === 0,
    cannot: (s) => s.world.boxes + s.world.capsules === 0 || s.contactSteps === 0,
  },
  mover: {
    must: (s) => s.moverSteps > 0,
    cannot: (s) => s.world.moverSets === 0,
  },
  capsule: {
    must: (s) => s.capsuleSteps > 0,
    cannot: (s) => s.world.capsules === 0 || s.contactSteps === 0,
  },
};

async function selftest() {
  const env = await loadEnv();
  const loaded = await loadFixture();
  const golden = existsSync(GOLDEN) ? JSON.parse(await readFile(GOLDEN, 'utf8')) : null;
  if (!golden || !loaded) {
    console.log('world-golden selftest: needs tests/goldens/world.json and tests/fixtures/town-crash.json');
    return 1;
  }
  let bad = 0;
  const say = (ok, line) => {
    bad += ok ? 0 : 1;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${line}`);
  };

  /* The recorder is transparent: world-check's own trace hash for a flight
   * is the recorder's, and recording it changes nothing. */
  const sc = {
    ms: 400,
    world: [{ box: [0.3, -5, -1, 1.3, 5, 5], m: { e: 0.15, mu: 0.42 } }],
    sticks: () => [0, -0.6, 0, 0.3],
  };
  const plain = await worldCheck.fly(sc);
  session.begin('selftest');
  const watched = await worldCheck.fly(sc);
  const [f] = session.end();
  say(plain.hash === watched.hash && watched.hash === f.sha256,
    `the recorder is transparent: world-check's fly() hashes ${plain.hash.slice(0, 16)} unwatched, ${watched.hash.slice(0, 16)} watched, and the recorder ${f.sha256.slice(0, 16)}`);

  const clean = await flyAll(env, loaded.fx, '');
  let differ = 0;
  for (const [name, r] of clean) {
    if (compareRun(name, r, golden)) {
      differ += 1;
    }
  }
  say(differ === 0, `unfaulted, every run matches the golden (${differ} differ)`);

  for (const fault of Object.keys(FAULTS)) {
    const got = await flyAll(env, loaded.fx, '', fault);
    const must = [];
    const cannot = [];
    const either = [];
    const missed = [];
    const extra = [];
    let eitherRed = 0;
    for (const [name, r] of got) {
      const g = golden.runs[name];
      r.flights.forEach((fl, i) => {
        const gf = g.flights[i];
        const s = golden.traces[gf.sha256].summary;
        const red = fl.sha256 !== gf.sha256;
        const label = `${name} #${i + 1}`;
        if (EXPECT[fault].must(s)) {
          must.push(label);
          if (!red) {
            missed.push(label);
          }
        } else if (EXPECT[fault].cannot(s)) {
          cannot.push(label);
          if (red) {
            extra.push(label);
          }
        } else {
          either.push(label);
          eitherRed += red ? 1 : 0;
        }
      });
    }
    say(missed.length === 0 && extra.length === 0 && must.length > 0,
      `${FAULTS[fault]}: all ${must.length} flights that touch it went red, none of the ${cannot.length} that cannot see it did`
      + `, ${eitherRed} of ${either.length} that could went red`
      + `${missed.length ? `\n        MISSED: ${missed.join('; ')}` : ''}${extra.length ? `\n        ALSO RED: ${extra.join('; ')}` : ''}`);
  }
  console.log(`\nworld-golden selftest: ${bad === 0 ? 'all passed' : `${bad} FAILED`}`);
  return bad;
}

/* ------------------------------------------------------------------ *
 * THE TOWN, from the real page.
 * ------------------------------------------------------------------ */

/*
 * Evaluated in the page before the app runs: wraps the module's
 * instantiation so every shape the shell hands sim_world_box and
 * sim_world_capsule is kept, exactly as the module received it, batch by
 * batch (a batch is a sim_world_clear to its sim_world_build).
 */
const UPLOAD_SEED = `(() => {
  const real = WebAssembly.instantiate;
  const log = { batches: [] };
  window.__worldUpload = log;
  WebAssembly.instantiate = async function instantiate(source, imports) {
    const out = await real.call(WebAssembly, source, imports);
    const inst = out instanceof WebAssembly.Instance ? out : out.instance;
    const ex = inst.exports;
    if (typeof ex.sim_world_box !== 'function') {
      return out;
    }
    let cur = null;
    const w = {};
    for (const k of Object.keys(ex)) {
      w[k] = ex[k];
    }
    w.sim_world_clear = () => { cur = { rows: [], built: null }; log.batches.push(cur); return ex.sim_world_clear(); };
    w.sim_world_box = (...a) => { const i = ex.sim_world_box(...a); if (cur) { cur.rows.push([1, i, ...a]); } return i; };
    w.sim_world_capsule = (...a) => { const i = ex.sim_world_capsule(...a); if (cur) { cur.rows.push([2, i, ...a]); } return i; };
    w.sim_world_build = () => { const n = ex.sim_world_build(); if (cur) { cur.built = n; } return n; };
    const wrapped = { exports: w };
    return out instanceof WebAssembly.Instance ? wrapped : { module: out.module, instance: wrapped };
  };
})();`;

/* The last complete batch, eleven doubles a shape, as base64 so no double
 * passes through a decimal on the way out. */
const READ_UPLOAD = `
  const L = window.__worldUpload;
  const b = L && L.batches[L.batches.length - 1];
  if (!b || b.built !== b.rows.length) { return null; }
  const f = new Float64Array(b.rows.length * ${SHAPE_DOUBLES});
  b.rows.forEach((r, k) => { for (let j = 0; j < r.length; j += 1) { f[k * ${SHAPE_DOUBLES} + j] = r[j]; } });
  const u8 = new Uint8Array(f.buffer);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) { s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); }
  return { n: b.rows.length, batches: L.batches.length, b64: btoa(s) };`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Open the shell on the city, record its upload, sample the ground, and
 * close the browser and delete its profile, whatever happens. */
async function exportFromPage() {
  const { openPage } = await import('../tests/lib/page.js');
  const page = await openPage({ root, width: 400, height: 260, url: '/index.html', seed: [UPLOAD_SEED] });
  const profile = (page.proc.spawnargs.find((a) => a.startsWith('--user-data-dir=')) || '').slice('--user-data-dir='.length);
  const exited = new Promise((r) => page.proc.once('exit', r));
  const ev = (body) => page.evaluate(`(async()=>{${body}})()`);
  try {
    for (let i = 0; i < 240 && !(await ev('return !!window.__shellReady')); i += 1) {
      await sleep(500);
    }
    await ev("const ui = window.__ui; ui.settings.map = 'city'; ui.settings.graphics = 'low'; ui.onAction('fly', ui.settings); return 1;");
    let ready = false;
    for (let i = 0; i < 260 && !ready; i += 1) {
      const m = await ev('return window.__map ? window.__map() : null');
      ready = Boolean(m && m.ready && m.id === 'city');
      if (!ready) {
        await sleep(500);
      }
    }
    if (!ready) {
      throw new Error('the city never became ready');
    }
    /* crash-check waits six seconds for the town to finish baking. Then the
     * upload is read until two reads a second apart agree. */
    await sleep(6000);
    let got = await ev(READ_UPLOAD);
    for (let i = 0; i < 30; i += 1) {
      await sleep(1000);
      const again = await ev(READ_UPLOAD);
      if (got && again && again.batches === got.batches && again.b64 === got.b64) {
        break;
      }
      got = again;
    }
    if (!got) {
      throw new Error('the shell never completed an upload of the city');
    }
    const count = await ev('return window.__colliders().count');
    const cc = readCrashCheck();
    const W = cc.wall;
    const pts = [[W.face - 1, W.zMid], [W.face - 1, W.z0], [W.face - 1, W.z1], [W.face - 3, W.zMid], [0, 29.3], [-14, 29.3], [9, 20]];
    const samples = await ev(`return ${JSON.stringify(pts)}.map(([x, z]) => [x, z, window.__surface(x, z, 0.5)]);`);
    return { got, count, samples, cc, errors: page.errors.slice() };
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

function uploadShapes(got) {
  const buf = Buffer.from(got.b64, 'base64');
  const f = new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const shapes = [];
  for (let k = 0; k < got.n; k += 1) {
    const type = f[k * SHAPE_DOUBLES];
    const n = type === 1 ? 8 : 9;
    shapes.push({ type, index: f[k * SHAPE_DOUBLES + 1], args: Array.from(f.subarray(k * SHAPE_DOUBLES + 2, k * SHAPE_DOUBLES + 2 + n)) });
  }
  return { shapes, bytes: new Uint8Array(f.buffer) };
}

/* Plan geometry for choosing the neighbourhood, physics frame. */
function planRect(s) {
  const a = s.args;
  if (s.type === 1) {
    return [a[0], a[1], a[3], a[4]];
  }
  return [Math.min(a[0], a[3]) - a[6], Math.min(a[1], a[4]) - a[6], Math.max(a[0], a[3]) + a[6], Math.max(a[1], a[4]) + a[6]];
}
function pointRect(x, y, r) {
  const dx = Math.max(r[0] - x, 0, x - r[2]);
  const dy = Math.max(r[1] - y, 0, y - r[3]);
  return Math.sqrt(dx * dx + dy * dy);
}
function pointSeg(x, y, p, q) {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const L = dx * dx + dy * dy;
  const u = L > 0 ? Math.min(1, Math.max(0, ((x - p[0]) * dx + (y - p[1]) * dy) / L)) : 0;
  const ex = x - (p[0] + dx * u);
  const ey = y - (p[1] + dy * u);
  return Math.sqrt(ex * ex + ey * ey);
}
/* Liang and Barsky: does the segment enter the rectangle at all? */
function segHitsRect(p, q, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  for (const [pp, qq] of [[-dx, p[0] - r[0]], [dx, r[2] - p[0]], [-dy, p[1] - r[1]], [dy, r[3] - p[1]]]) {
    if (pp === 0) {
      if (qq < 0) {
        return false;
      }
    } else {
      const t = qq / pp;
      if (pp < 0) {
        if (t > t1) {
          return false;
        }
        t0 = Math.max(t0, t);
      } else {
        if (t < t0) {
          return false;
        }
        t1 = Math.min(t1, t);
      }
    }
  }
  return t0 <= t1;
}
function segRectDist(p, q, r) {
  if (segHitsRect(p, q, r)) {
    return 0;
  }
  return Math.min(pointRect(p[0], p[1], r), pointRect(q[0], q[1], r),
    pointSeg(r[0], r[1], p, q), pointSeg(r[2], r[1], p, q), pointSeg(r[0], r[3], p, q), pointSeg(r[2], r[3], p, q));
}

/* The shortest decimal that comes back to the same float32, or "-0". */
function f32dec(v) {
  if (Object.is(v, -0)) {
    return '-0';
  }
  if (Math.fround(v) !== v) {
    throw new Error(`${v} is not a float32: the shell's colliders were Float32Array when this format was written`);
  }
  for (let p = 1; p <= 9; p += 1) {
    const n = Number(v.toPrecision(p));
    if (Math.fround(n) === v) {
      return n;
    }
  }
  throw new Error(`no float32 decimal for ${v}`);
}

function buildFixture(page) {
  const { shapes, bytes } = uploadShapes(page.got);
  const cc = page.cc;
  const W = cc.wall;
  const shop = shapes.find((s) => s.type === 1 && Math.abs(-s.args[4] - W.face) < 0.02 && -s.args[3] <= W.zMid
    && -s.args[0] >= W.zMid && Math.abs(s.args[5] - W.roof) < 0.02);
  if (!shop) {
    throw new Error('the shopfront crash-check flies at is not in the upload');
  }
  const keep = new Set();
  for (const S of cc.scenarios) {
    const p3 = threePosToSim(S.from[0], S.from[1], S.from[2], { x: 0, y: 0, z: 0 });
    const q3 = threePosToSim(S.to[0], S.to[1], S.to[2], { x: 0, y: 0, z: 0 });
    shapes.forEach((s, i) => {
      if (segRectDist([p3.x, p3.y], [q3.x, q3.y], planRect(s)) <= RADIUS) {
        keep.add(i);
      }
    });
  }
  const materials = [];
  const matOf = (e, mu) => {
    let i = materials.findIndex((m) => Object.is(m[0], e) && Object.is(m[1], mu));
    if (i < 0) {
      materials.push([e, mu]);
      i = materials.length - 1;
    }
    return i;
  };
  const picked = shapes.filter((_, i) => keep.has(i));
  const rows = picked.map((s) => {
    const n = s.args.length;
    return [s.index, s.type, matOf(s.args[n - 2], s.args[n - 1]), ...s.args.slice(0, n - 2).map(f32dec)];
  });
  const ref = page.samples[0];
  const fx = {
    note: 'The town\'s solids near scripts/crash-check.js\'s shopfront, as the shell handed them to the module, written by scripts/world-golden.js --export-town. Re-export only with the owner\'s approval: the world golden flies these.',
    export: {
      map: 'city', graphics: 'low', shapes: shapes.length,
      boxes: shapes.filter((s) => s.type === 1).length, capsules: shapes.filter((s) => s.type === 2).length,
      sha256: sha(bytes),
    },
    radius: RADIUS,
    ground: { y: ref[2], at: [ref[0], ref[1]], samples: page.samples },
    wall: cc.wall,
    east: cc.east,
    shopfront: shop.index,
    scenarios: cc.scenarios,
    materials,
    sha256: null,
    shapes: rows,
  };
  /* The fixture rebuilds every shape to the bit, or it is not written. */
  const rebuilt = townShapes(fx);
  const want = shapeBytes(picked);
  const have = shapeBytes(rebuilt);
  if (Buffer.compare(Buffer.from(want), Buffer.from(have)) !== 0) {
    throw new Error('the fixture does not rebuild the shapes it was written from to the bit');
  }
  fx.sha256 = sha(have);
  return fx;
}

function fixtureText(fx) {
  const { shapes, ...head } = fx;
  const text = JSON.stringify(head, null, 1).replace(/\[\s*([-0-9.e+,\s"]*?)\s*\]/g, (m, body) => `[${body.replace(/\s+/g, '')}]`);
  return `${text.slice(0, text.lastIndexOf('}')).replace(/\s*$/, '')},\n "shapes": [\n${shapes.map((r) => `  ${JSON.stringify(r)}`).join(',\n')}\n ]\n}\n`;
}

async function exportTown() {
  const t0 = performance.now();
  console.log('world-golden: exporting the town from the real page');
  const page = await exportFromPage();
  const fx = buildFixture(page);
  const text = fixtureText(fx);
  await mkdir(dirname(FIXTURE), { recursive: true });
  await writeFile(FIXTURE, text);
  console.log(`  the city's upload: ${fx.export.shapes} shapes (${fx.export.boxes} boxes, ${fx.export.capsules} capsules), the collider set says ${page.count}, sha256 ${fx.export.sha256.slice(0, 16)}`);
  console.log(`  kept ${fx.shapes.length} within ${RADIUS} m of ${fx.scenarios.length} paths, ${(text.length / 1024).toFixed(0)} KB; shopfront collider ${fx.shopfront}`);
  console.log(`  ground ${fx.ground.y} m at (${fx.ground.at.join(', ')}); samples ${fx.ground.samples.map((s) => `(${s[0]}, ${s[1]}) ${s[2]}`).join(', ')}`);
  console.log(`  page errors: ${page.errors.length ? page.errors.join(' | ') : 'none'}`);
  console.log(`\nworld-golden: wrote tests/fixtures/town-crash.json in ${((performance.now() - t0) / 1000).toFixed(1)} s. Re-record the golden with --write.`);
  return page.count === fx.export.shapes ? 0 : 1;
}

async function townCheck() {
  const t0 = performance.now();
  const loaded = await loadFixture();
  if (!loaded) {
    console.log('world-golden --town: no tests/fixtures/town-crash.json to check');
    return 1;
  }
  console.log('world-golden --town: the town fixture against the real page');
  const page = await exportFromPage();
  const { shapes, bytes } = uploadShapes(page.got);
  let bad = 0;
  const say = (ok, line) => {
    bad += ok ? 0 : 1;
    console.log(`  ${ok ? 'pass' : 'FAIL'}  ${line}`);
  };
  const h = sha(bytes);
  say(h === loaded.fx.export.sha256, `the city's upload hashes to what the fixture was exported from: ${h.slice(0, 16)}, fixture ${loaded.fx.export.sha256.slice(0, 16)}, ${shapes.length} shapes`);
  say(loaded.sha256 === loaded.fx.sha256, `the fixture's shapes are the ones it records: ${loaded.sha256.slice(0, 16)}`);
  const cc = page.cc;
  say(JSON.stringify(cc.scenarios) === JSON.stringify(loaded.fx.scenarios) && JSON.stringify(cc.wall) === JSON.stringify(loaded.fx.wall),
    'scripts/crash-check.js flies the paths and the shopfront the fixture carries');
  const ground = page.samples[0][2];
  say(ground === loaded.fx.ground.y, `the ground in front of the shopfront is where the fixture has it: ${ground} m`);
  console.log(`\nworld-golden --town: ${bad === 0 ? 'the fixture is the town' : `${bad} FAILED: the town moved; re-export with --export-town and re-record, both reviewed`} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  return bad;
}

async function main() {
  if (args.includes('--export-town')) {
    return exportTown();
  }
  if (args.includes('--town')) {
    return townCheck();
  }
  if (args.includes('--selftest')) {
    return selftest();
  }
  return checkOrWrite({ write: args.includes('--write') });
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(e);
  process.exit(99);
});
