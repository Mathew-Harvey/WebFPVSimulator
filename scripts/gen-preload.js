/*
 * gen-preload.js: the shell's module graph, handed to the browser up front as
 * <link rel="modulepreload">, so it fetches every module at once instead of
 * one import level at a time.
 *
 * WHY. The shell is plain ES modules with no bundler (CLAUDE.md), and a
 * browser only learns a module's imports after that module has arrived. So
 * the boot graph, 101 files, arrives in about twenty waves, and every wave
 * costs a full round trip. On the live site each request is about half a
 * second to its first byte, because nothing is content hashed and the edge
 * revalidates with the origin every five minutes (render.yaml, the
 * s-maxage=300 the domain answers with). Measured locally with an emulated
 * 300 ms round trip, boot went from 4.3 s to 12 s and the city's 72 modules
 * took 5 s on their own, almost all of it waiting. The owner's report on
 * 2026-09-24 was a 47 second load. A modulepreload list puts the whole graph
 * in the first wave: the files are the same, the bytes are the same, the
 * waiting is one round trip instead of twenty.
 *
 * WHAT IT WRITES.
 *   src/fresh.js        PRELOAD.boot, everything a boot loads: boot.js,
 *                       three.js, main.js and the Track map, which is the
 *                       world a boot builds unless the pilot chose the city.
 *                       fresh.js puts these in the page as modulepreload.
 *                       And MODULES, every module this site serves, which
 *                       fresh.js gives the deploy's address: see that file.
 *                       Both used to be a block of <link rel="modulepreload">
 *                       in index.html, until 2026-09-25, when a preload in
 *                       the markup would have started the module loader
 *                       before fresh.js could say which addresses to load.
 *   src/maps/preload.js MAP_PRELOAD, the extra modules each lazily loaded
 *                       map brings, which main.js's loadMap preloads the
 *                       moment the map is chosen. The city is 72 files.
 *
 * HOW IT READS THE GRAPH. Static imports only, which is what the browser
 * walks: an unindented `import ... from '...'`, `import '...'` or
 * `export ... from '...'`, outside comments. The shell's own style keeps
 * every one of those unindented at the top of its file. Bare specifiers go
 * through the import map in src/fresh.js. Dynamic import() is not followed; the
 * boot's few are listed as roots below. Three.js's add-ons import each other
 * on the CDN, where this cannot read them offline, so their edges for the
 * pinned version are written out in THREE_ADDON_DEPS, and --check refuses
 * if the import map moves to another version.
 *
 * Measured against a real boot in headless Chromium when this was written:
 * the same 101 files at boot and the same 72 for the city, no more and no
 * fewer. A module in the list that the page never imports would be fetched
 * for nothing; one missing from it is simply found the slow way. Neither
 * breaks the page, which is why a stale list is a lint and not a crash.
 *
 * Usage: node scripts/gen-preload.js [--check]
 *   --check  exit 1 if either file is not what this would write.
 *
 * MODULES is every .js file git tracks under src/ and configs/, not a walk,
 * because it has to cover what a boot imports dynamically as well, which a
 * walk does not follow. A module left out of it loads at its bare address,
 * the old behaviour for that one file; one that is never imported is an
 * entry in an import map and nothing else.
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

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRESH = join(ROOT, 'src/fresh.js');
const MAP_LIST = join(ROOT, 'src/maps/preload.js');

/* What a boot imports dynamically, in the order it does: boot.js imports
 * three, then main.js, and main.js loads the boot map, the Track. */
const BOOT_ROOTS = ['src/boot.js', 'three', 'src/main.js', 'src/maps/custom.js'];
/* Each lazily loaded map, by the id registry.js gives it. */
const MAP_ROOTS = { city: 'src/maps/city/index.js', built: 'src/maps/built/index.js' };

/* three@0.160.0's add-ons, and what each imports besides 'three'. Read off
 * the CDN files for exactly this version. */
const THREE_VERSION = '0.160.0';
const THREE_ADDON_DEPS = {
  'postprocessing/EffectComposer.js': ['shaders/CopyShader.js', 'postprocessing/ShaderPass.js', 'postprocessing/MaskPass.js'],
  'postprocessing/RenderPass.js': ['postprocessing/Pass.js'],
  'postprocessing/ShaderPass.js': ['postprocessing/Pass.js'],
  'postprocessing/MaskPass.js': ['postprocessing/Pass.js'],
  'postprocessing/UnrealBloomPass.js': ['postprocessing/Pass.js', 'shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js'],
  'postprocessing/Pass.js': [],
  'shaders/CopyShader.js': [],
  'shaders/LuminosityHighPassShader.js': [],
  'utils/BufferGeometryUtils.js': [],
};

const START = '  // GENERATED BELOW by scripts/gen-preload.js, do not edit by hand';
const END = '  // GENERATED ABOVE';

/* The import map every page shares, which src/fresh.js writes as JSON so
 * this can read it. */
function importMap(fresh) {
  const m = fresh.match(/const IMPORTS = (\{[\s\S]*?\});/);
  if (!m) {
    throw new Error('src/fresh.js has no IMPORTS');
  }
  return JSON.parse(m[1]);
}

/* Every module this site serves: what git tracks under src/ and configs/,
 * less fresh.js itself, which is a classic script the pages load by hand. */
function servedModules() {
  const out = execFileSync('git', ['ls-files', '-z', '--', 'src', 'configs'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0')
    .filter((f) => f.endsWith('.js') && f !== 'src/fresh.js')
    .sort();
}

/* The specifiers a module imports statically. */
function staticImports(src) {
  const out = [];
  let inBlock = false;
  let pending = null;
  for (const line of src.split('\n')) {
    if (inBlock) {
      if (line.includes('*/')) {
        inBlock = false;
      }
      continue;
    }
    if (pending !== null) {
      pending += ` ${line}`;
      const m = pending.match(/\bfrom\s+['"]([^'"]+)['"]/);
      if (m) {
        out.push(m[1]);
        pending = null;
      } else if (line.includes(';')) {
        pending = null;
      }
      continue;
    }
    if (line.startsWith('/*') && !line.includes('*/')) {
      inBlock = true;
      continue;
    }
    if (!/^(import|export)\b/.test(line)) {
      continue;
    }
    const bare = line.match(/^import\s+['"]([^'"]+)['"]/);
    if (bare) {
      out.push(bare[1]);
      continue;
    }
    const from = line.match(/\bfrom\s+['"]([^'"]+)['"]/);
    if (from) {
      out.push(from[1]);
    } else if (/^import\b/.test(line) || /^export\s*(\*|\{)/.test(line)) {
      /* A multi line import or re-export: its `from` is on a later line. */
      pending = line;
    }
  }
  return out;
}

/* A specifier, resolved to either a path under ROOT or a CDN URL. */
function resolve(spec, fromFile, imports) {
  if (spec.startsWith('./') || spec.startsWith('../')) {
    return posix.normalize(posix.join(posix.dirname(fromFile), spec));
  }
  if (Object.hasOwn(imports, spec)) {
    return imports[spec];
  }
  for (const [prefix, target] of Object.entries(imports)) {
    if (prefix.endsWith('/') && spec.startsWith(prefix)) {
      return target + spec.slice(prefix.length);
    }
  }
  throw new Error(`${fromFile}: cannot resolve '${spec}'`);
}

/* Depth first, children before parents is not needed: the browser takes a
 * preload list in any order. Kept in discovery order so a diff reads. */
function walk(roots, imports, seen = new Set()) {
  const order = [];
  const addonBase = imports['three/addons/'];
  const visit = (id) => {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    order.push(id);
    if (/^https?:/.test(id)) {
      if (addonBase && id.startsWith(addonBase)) {
        const deps = THREE_ADDON_DEPS[id.slice(addonBase.length)];
        if (!deps) {
          throw new Error(`no THREE_ADDON_DEPS entry for ${id}`);
        }
        for (const d of deps) {
          visit(addonBase + d);
        }
      }
      return;
    }
    const src = readFileSync(join(ROOT, id), 'utf8');
    for (const spec of staticImports(src)) {
      visit(resolve(spec, id, imports));
    }
  };
  for (const r of roots) {
    visit(r.startsWith('src/') ? r : resolve(r, 'index.html', imports));
  }
  return order;
}

function main() {
  const check = process.argv.includes('--check');
  const fresh = readFileSync(FRESH, 'utf8');
  const imports = importMap(fresh);
  if (!String(imports.three || '').includes(`three@${THREE_VERSION}/`)) {
    throw new Error(`the import map is not three@${THREE_VERSION}: re-read the add-ons' imports into THREE_ADDON_DEPS`);
  }
  const seen = new Set();
  const boot = walk(BOOT_ROOTS, imports, seen);
  const maps = {};
  for (const [id, root] of Object.entries(MAP_ROOTS)) {
    /* Only what the map adds: the boot graph is already in the page. */
    maps[id] = walk([root], imports, new Set(seen));
  }

  const modules = servedModules();
  const lines = (list, pad) => list.map((p) => `${pad}'${p}',`).join('\n');
  const block = [
    START,
    '  const MODULES = [',
    lines(modules, '    '),
    '  ];',
    '  const PRELOAD = {',
    '    boot: [',
    lines(boot, '      '),
    '    ],',
    '  };',
    END,
  ].join('\n');
  const at = fresh.indexOf(START);
  const end = fresh.indexOf(END, at);
  if (at < 0 || end < 0) {
    throw new Error('src/fresh.js has lost its GENERATED markers');
  }
  const nextFresh = fresh.slice(0, at) + block + fresh.slice(end + END.length);

  const rel = (id) => relative(join(ROOT, 'src'), join(ROOT, id)).split('\\').join('/');
  const body = Object.entries(maps).map(([id, list]) => `  ${id}: [\n${list.map((p) => `    '${rel(p)}',`).join('\n')}\n  ],`).join('\n');
  const nextList = `${readFileSync(MAP_LIST, 'utf8').split('// GENERATED BELOW')[0]}// GENERATED BELOW\nexport const MAP_PRELOAD = {\n${body}\n};\n`;

  const stale = [];
  if (nextFresh !== fresh) {
    stale.push('src/fresh.js');
  }
  if (nextList !== readFileSync(MAP_LIST, 'utf8')) {
    stale.push('src/maps/preload.js');
  }
  const summary = `boot ${boot.length} modules, ${Object.entries(maps).map(([id, l]) => `${id} ${l.length}`).join(', ')}; ${modules.length} served`;
  if (check) {
    if (stale.length) {
      console.log(`gen-preload: STALE ${stale.join(' and ')} (${summary}). Run node scripts/gen-preload.js`);
      process.exit(1);
    }
    console.log(`gen-preload: up to date, ${summary}`);
    return;
  }
  writeFileSync(FRESH, nextFresh);
  writeFileSync(MAP_LIST, nextList);
  console.log(`gen-preload: wrote ${stale.length ? stale.join(' and ') : 'nothing new'}, ${summary}`);
}

main();
