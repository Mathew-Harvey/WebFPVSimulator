/*
 * coverage.js: how much of src the checks actually run, measured.
 *
 * WHY THIS EXISTS.
 *
 * "Is this covered?" kept being answered from memory, and a check that
 * never loads a file cannot fail when that file breaks. This runs the
 * repository's own checks with coverage switched on and prints, per file,
 * how many code lines any check reached. Node code is measured with
 * NODE_V8_COVERAGE. Browser code is measured by tests/lib/page.js, which
 * starts V8 precise coverage in the page when WEBFPV_COVERAGE names a
 * folder, so every check built on openPage reports what the page ran.
 *
 * A line counts as run when its first character sat inside a block V8 says
 * executed. Blank lines, comment lines and lines that are only closing
 * brackets are not counted at all. It is line coverage, not branch
 * coverage, and a line being run is not the same as a line being checked:
 * this is a map of where a regression could hide unseen, not a score.
 *
 * Usage:
 *   node scripts/coverage.js --out=DIR [--jobs=2] [--only=a,b] [--skip=a,b]
 *                            [--list] [--report-only] [--timeout=900]
 * Runs every npm script whose name starts check:, lint:, test: or ends
 * :selftest, plus replay:test and verify, except the ones in SKIP below, then writes
 * DIR/report.txt and DIR/runs.json. --report-only re-merges what DIR holds.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General
 * Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { spawn } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Not run by default. Each is either a generator that writes files, a
 * sweep that takes tens of minutes and adds no file the others miss, or a
 * selftest of a checker rather than of the game. */
const SKIP = new Set([
  'check:plant:selftest', 'check:world-golden:selftest', 'check:world-engines:selftest',
  'check:town-patrons:selftest', 'check:crash-pacing', 'check:career:rig',
]);

function argOf(name, dflt) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
}

function scriptsToRun() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const only = argOf('only', '');
  const skip = new Set(argOf('skip', '').split(',').filter(Boolean));
  let names = Object.keys(pkg.scripts).filter((n) => (
    /^(check|lint|test):/.test(n) || /:selftest$/.test(n) || n === 'replay:test' || n === 'verify'
  ) && !SKIP.has(n) && !skip.has(n));
  if (only) {
    names = only.split(',');
  }
  return names;
}

function runOne(name, out, timeoutS) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const env = {
      ...process.env,
      NODE_V8_COVERAGE: join(out, 'raw'),
      WEBFPV_COVERAGE: join(out, 'raw'),
    };
    const p = spawn('npm', ['run', '-s', name], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    p.stdout.on('data', (d) => { log += d; });
    p.stderr.on('data', (d) => { log += d; });
    const timer = setTimeout(() => { log += '\nTIMEOUT\n'; p.kill('SIGKILL'); }, timeoutS * 1000);
    p.on('close', (code) => {
      clearTimeout(timer);
      mkdirSync(join(out, 'logs'), { recursive: true });
      writeFileSync(join(out, 'logs', `${name.replace(/[^\w.-]/g, '_')}.log`), log);
      resolve({ name, code, seconds: Math.round((Date.now() - t0) / 1000), timedOut: log.endsWith('TIMEOUT\n') });
    });
  });
}

/* Map a coverage URL onto a file in this checkout: file URLs from Node,
 * http URLs from the page served out of the repository root. */
function pathOf(url) {
  if (url.startsWith('file://')) {
    return fileURLToPath(url);
  }
  const m = url.match(/^https?:\/\/[^/]+(\/[^?#]*)/);
  return m ? join(root, decodeURIComponent(m[1])) : null;
}

export function mergeCoverage(rawDir, keep = (rel) => rel.startsWith('src/')) {
  const ran = new Map();
  for (const f of existsSync(rawDir) ? readdirSync(rawDir) : []) {
    if (!f.endsWith('.json')) {
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(readFileSync(join(rawDir, f), 'utf8'));
    } catch {
      continue;
    }
    for (const s of doc.result ?? []) {
      const p = pathOf(s.url ?? '');
      if (!p || !p.startsWith(root)) {
        continue;
      }
      const rel = relative(root, p);
      if (!keep(rel) || !existsSync(p)) {
        continue;
      }
      const src = readFileSync(p, 'utf8');
      const count = new Int32Array(src.length).fill(-1);
      const ranges = s.functions.flatMap((fn) => fn.ranges);
      /* Outer ranges first, so an inner block's count overrides the
       * function that holds it, which is how V8 nests them. */
      ranges.sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset));
      for (const r of ranges) {
        count.fill(r.count, r.startOffset, Math.min(r.endOffset, src.length));
      }
      let acc = ran.get(rel);
      if (!acc || acc.length !== src.length) {
        acc = new Uint8Array(src.length);
        ran.set(rel, acc);
      }
      for (let i = 0; i < src.length; i++) {
        if (count[i] > 0) {
          acc[i] = 1;
        }
      }
    }
  }
  const rows = [];
  for (const [rel, acc] of ran) {
    const src = readFileSync(join(root, rel), 'utf8');
    let off = 0;
    let lines = 0;
    let hit = 0;
    let inBlock = false;
    for (const line of src.split('\n')) {
      const t = line.trim();
      const lead = line.length - line.trimStart().length;
      let code = t.length > 0;
      if (inBlock) {
        code = false;
        inBlock = !t.includes('*/');
      } else if (t.startsWith('//')) {
        code = false;
      } else if (t.startsWith('/*') || t.startsWith('*')) {
        code = false;
        inBlock = t.startsWith('/*') && !t.includes('*/');
      } else if (/^[}\])\s;,]*$/.test(t)) {
        code = false;
      }
      if (code) {
        lines += 1;
        hit += acc[off + lead] === 1 ? 1 : 0;
      }
      off += line.length + 1;
    }
    rows.push({ file: rel, hit, lines });
  }
  return rows;
}

/* Every .js under src, so a file no check ever loads shows as 0 rather
 * than vanishing from the table. */
function allSourceFiles(dir = join(root, 'src'), out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      allSourceFiles(p, out);
    } else if (e.name.endsWith('.js')) {
      out.push(relative(root, p));
    }
  }
  return out;
}

function codeLines(rel) {
  const src = readFileSync(join(root, rel), 'utf8');
  let n = 0;
  let inBlock = false;
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (inBlock) {
      inBlock = !t.includes('*/');
    } else if (t.startsWith('/*') || t.startsWith('*')) {
      inBlock = t.startsWith('/*') && !t.includes('*/');
    } else if (t && !t.startsWith('//') && !/^[}\])\s;,]*$/.test(t)) {
      n += 1;
    }
  }
  return n;
}

function report(out, runs) {
  const rows = mergeCoverage(join(out, 'raw'));
  const seen = new Set(rows.map((r) => r.file));
  for (const f of allSourceFiles()) {
    if (!seen.has(f)) {
      rows.push({ file: f, hit: 0, lines: codeLines(f) });
    }
  }
  const area = new Map();
  for (const r of rows) {
    const parts = r.file.split('/');
    const key = parts.length > 2 ? `${parts[1]}/${parts.length > 3 ? parts[2] : ''}`.replace(/\/$/, '') : parts[1];
    const a = area.get(key) ?? { hit: 0, lines: 0, files: 0, untouched: 0 };
    a.hit += r.hit;
    a.lines += r.lines;
    a.files += 1;
    a.untouched += r.hit === 0 ? 1 : 0;
    area.set(key, a);
  }
  const pct = (h, l) => (l ? (100 * h / l).toFixed(1) : '100.0').padStart(5);
  const tot = rows.reduce((a, r) => ({ hit: a.hit + r.hit, lines: a.lines + r.lines }), { hit: 0, lines: 0 });
  const lines = [];
  lines.push(`src line coverage: ${tot.hit} of ${tot.lines} code lines = ${pct(tot.hit, tot.lines).trim()}%`);
  lines.push(`files: ${rows.length}, never loaded by any check: ${rows.filter((r) => r.hit === 0).length}`);
  if (runs) {
    const bad = runs.filter((r) => r.code !== 0);
    lines.push(`checks run: ${runs.length}, exited non zero: ${bad.length}${bad.length ? ` (${bad.map((r) => r.name + (r.timedOut ? ' timeout' : '')).join(', ')})` : ''}`);
  }
  lines.push('', 'by area:');
  for (const [k, a] of [...area].sort((x, y) => (y[1].lines - y[1].hit) - (x[1].lines - x[1].hit))) {
    lines.push(`${pct(a.hit, a.lines)}%  ${String(a.hit).padStart(7)}/${String(a.lines).padEnd(7)} ${String(a.untouched).padStart(3)} of ${String(a.files).padEnd(3)} files untouched  ${k}`);
  }
  lines.push('', 'by file, most unrun lines first:');
  for (const r of rows.sort((x, y) => (y.lines - y.hit) - (x.lines - x.hit))) {
    lines.push(`${pct(r.hit, r.lines)}%  ${String(r.hit).padStart(6)}/${String(r.lines).padEnd(6)} ${r.file}`);
  }
  writeFileSync(join(out, 'report.txt'), `${lines.join('\n')}\n`);
  console.log(lines.slice(0, 40).join('\n'));
}

async function main() {
  const out = argOf('out', '');
  if (!out) {
    console.error('usage: node scripts/coverage.js --out=DIR [--jobs=2] [--only=a,b] [--skip=a,b] [--list] [--report-only]');
    process.exit(2);
  }
  mkdirSync(join(out, 'raw'), { recursive: true });
  const names = scriptsToRun();
  if (process.argv.includes('--list')) {
    console.log(names.join('\n'));
    return;
  }
  const runsPath = join(out, 'runs.json');
  if (process.argv.includes('--report-only')) {
    report(out, existsSync(runsPath) ? JSON.parse(readFileSync(runsPath, 'utf8')) : null);
    return;
  }
  const jobs = Number(argOf('jobs', '2'));
  const timeoutS = Number(argOf('timeout', '900'));
  const runs = existsSync(runsPath) ? JSON.parse(readFileSync(runsPath, 'utf8')) : [];
  const done = new Set(runs.map((r) => r.name));
  const queue = names.filter((n) => !done.has(n));
  async function worker() {
    while (queue.length) {
      const name = queue.shift();
      const r = await runOne(name, out, timeoutS);
      runs.push(r);
      writeFileSync(runsPath, JSON.stringify(runs, null, 1));
      console.log(`${r.code === 0 ? 'ok  ' : 'FAIL'} ${String(r.seconds).padStart(4)} s  ${name}${r.timedOut ? ' (timeout)' : ''}`);
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker));
  report(out, runs);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
