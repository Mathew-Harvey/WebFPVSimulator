/*
 * memory-check.js: does a map cost nothing until it is chosen, and give the
 * memory back when it is left.
 *
 * WHY, ON A LAPTOP. The freestyle city is 59 vendored source files, about
 * nineteen thousand meshes and a few hundred Canvas2D textures. A pilot who
 * only ever flies a track must not pay for any of it, and a pilot who tries
 * the city and goes back to the field must not keep paying for it either.
 * Both halves are easy to break by accident and neither is visible until a
 * tab runs out of memory on somebody else's machine.
 *
 * WHAT verify's CHECK 16 ALREADY DOES, so this does not repeat it: it proves
 * the city is not fetched while the field is selected, that a full graph
 * arrives once the city is chosen, that MAP_MODULE_COUNT matches what the
 * browser fetched, and that the field's draw cost is unchanged. That check is
 * good and it is the reference for this one.
 *
 * WHAT THIS ADDS:
 *
 *   1. The other three maps. Check 16 covers city against field. Industrial
 *      bando, Municipal baths and Bardwell's yard each copy the cel kit into
 *      their own directory precisely so choosing one does not drag in the
 *      city's, and nothing was measuring that.
 *   2. Release, not just laziness. After switching away, three.js's own count
 *      of live geometries and textures has to come back down. A lazy load
 *      that never frees is a leak with extra steps.
 *
 * It is a cheap lint rather than part of verify, because verify builds the
 * WASM module and this has nothing to say about the flight model.
 *
 * Usage:
 *   node scripts/memory-check.js
 *   node scripts/memory-check.js --map=bando     just one map
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The four dressed worlds. `custom` is the field and is the baseline: it is
 * loaded at boot because the title screen has a world behind it. */
const HEAVY = ['city', 'bando', 'baths', 'yard'];

/*
 * Every URL the page has fetched, as a plain list. Resource timing is the
 * browser's own record, so this cannot be fooled by a loader that thinks it
 * did not fetch something.
 *
 * It is CUMULATIVE for the life of the page, which is the trap: after the
 * city has been loaded once, its URLs are in every later reading, so a naive
 * "did choosing the bando pull in the city" test reports yes for a page that
 * did nothing wrong. Every question here is therefore asked about a SLICE,
 * from a mark taken just before the switch.
 */
const urlsSince = (from) => `JSON.stringify(
  performance.getEntriesByType('resource').slice(${from}).map((e) => e.name)
)`;
const URL_COUNT = 'performance.getEntriesByType("resource").length';

const MEMORY = 'JSON.stringify(window.__gpuMemory())';

function underMap(urls, id) {
  return urls.filter((u) => u.includes(`/src/maps/${id}/`));
}

function parseArgs(argv) {
  const opts = { maps: HEAVY };
  for (const a of argv) {
    const m = a.match(/^--map=(.*)$/);
    if (m) {
      opts.maps = [m[1]];
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const page = await openPage({
    root,
    width: 1280,
    height: 720,
    /* The field, and a pinned preset so a cost is comparable between runs. */
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.map = 'custom';
      s.graphics = 'low';
      s.graphicsAuto = false;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* Storage refused. The run still boots. */ }`],
  });

  const failures = [];
  const rows = [];
  const visited = new Set();
  try {
    await page.until('window.__shellReady === true', 120000);
    await page.until('typeof window.__gpuMemory === "function"', 10000);
    /* Let the title settle so the baseline is a steady state rather than a
     * frame in the middle of the first build. */
    await page.sleep(2000);

    const bootUrls = JSON.parse(await page.evaluate(urlsSince(0)));
    const base = JSON.parse(await page.evaluate(MEMORY));
    console.log(
      `baseline, field selected: ${base.geometries} geometries, ` +
      `${base.textures} textures, ${bootUrls.length} requests`,
    );

    /* Half one. Nothing heavy may be on the wire before it is chosen. */
    for (const id of HEAVY) {
      const hits = underMap(bootUrls, id);
      if (hits.length) {
        failures.push(
          `${hits.length} ${id} module(s) fetched with the field selected, first ${hits[0]}`,
        );
      }
    }
    if (!failures.length) {
      console.log(`none of ${HEAVY.join(', ')} fetched at boot`);
    }

    /* Half two, per map: choosing it fetches its graph and nobody else's,
     * and leaving it gives the memory back. */
    for (const id of opts.maps) {
      /* The mark. Everything asserted below is about what this switch
       * fetched, not about what the page has ever fetched. */
      const mark = await page.evaluate(URL_COUNT);
      await page.evaluate(`window.__setMap(${JSON.stringify(id)})`);
      await page.until('window.__shellReady === true', 180000);
      await page.sleep(2500);

      const afterUrls = JSON.parse(await page.evaluate(urlsSince(mark)));
      const mine = underMap(afterUrls, id);
      const loaded = JSON.parse(await page.evaluate(MEMORY));

      /* A world already visited is legitimately served from the module cache
       * and fetches nothing the second time, so "no modules" is only a fault
       * on the first visit to it. */
      if (!mine.length && !visited.has(id)) {
        failures.push(`${id}: choosing it fetched no ${id} module at all, so the first half proves nothing`);
      }
      visited.add(id);
      /* Choosing one world must not drag in another. This is what the
       * copied cel kits exist for. */
      for (const other of HEAVY) {
        if (other === id) {
          continue;
        }
        const bleed = underMap(afterUrls, other);
        if (bleed.length) {
          failures.push(`${id}: pulled in ${bleed.length} ${other} module(s), first ${bleed[0]}`);
        }
      }

      await page.evaluate('window.__setMap("custom")');
      await page.until('window.__shellReady === true', 180000);
      await page.sleep(2500);
      const back = JSON.parse(await page.evaluate(MEMORY));

      /*
       * Release. The count has to come back to about the baseline, not to
       * exactly it: the shell keeps a session lived airframe and a shared cel
       * ramp on purpose, and a few objects legitimately differ between the
       * first field build and the second. A generous allowance still catches
       * the failure that matters, which is a whole world staying resident.
       */
      const allowance = Math.max(40, Math.round(base.geometries * 0.15));
      const geomLeak = back.geometries - base.geometries;
      const texLeak = back.textures - base.textures;
      if (geomLeak > allowance) {
        failures.push(
          `${id}: ${geomLeak} geometries still live after leaving it ` +
          `(${base.geometries} at boot, ${loaded.geometries} loaded, ${back.geometries} back on the field)`,
        );
      }
      if (texLeak > allowance) {
        failures.push(
          `${id}: ${texLeak} textures still live after leaving it ` +
          `(${base.textures} at boot, ${loaded.textures} loaded, ${back.textures} back on the field)`,
        );
      }

      rows.push(
        `  ${id.padEnd(7)} ${String(mine.length).padStart(3)} modules` +
        `  geometries ${String(base.geometries).padStart(5)} -> ${String(loaded.geometries).padStart(5)} -> ${String(back.geometries).padStart(5)}` +
        `  textures ${String(base.textures).padStart(4)} -> ${String(loaded.textures).padStart(4)} -> ${String(back.textures).padStart(4)}`,
      );
      console.log(rows[rows.length - 1]);
    }

    const offline = page.errors.filter((m) => /net::ERR_|Failed to load resource/.test(m));
    const real = page.errors.filter((m) => !/net::ERR_|Failed to load resource/.test(m));
    if (offline.length) {
      console.log(`note: ${offline.length} network fetch(es) refused, the board is not running here`);
    }
    for (const m of real) {
      failures.push(`console: ${m}`);
    }
  } finally {
    await page.close();
  }

  console.log('');
  if (failures.length) {
    console.error(`FAIL, ${failures.length} problem(s):`);
    for (const f of failures) {
      console.error(`  ${f}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('PASS, every world is lazy and every world is freed');
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
