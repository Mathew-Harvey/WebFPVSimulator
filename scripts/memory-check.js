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
 *   1. Your map. Check 16 covers city against field. Your map is the other
 *      freestyle world, it borrows a named handful of the town's modules
 *      and no more (see BORROWS), and its asset library, src/props, must
 *      stay off the wire until it is chosen, apart from the one data table
 *      the builder's element table reads (see BOOT_PROPS).
 *   2. Release, not just laziness. After switching away, three.js's own count
 *      of live geometries and textures has to come back down. A lazy load
 *      that never frees is a leak with extra steps.
 *
 * It is a cheap lint rather than part of verify, because verify builds the
 * WASM module and this has nothing to say about the flight model.
 *
 * Usage:
 *   node scripts/memory-check.js                 the town and Your map
 *   node scripts/memory-check.js --map=city      just one map
 *   node scripts/memory-check.js --map=built,city  these, in this order
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

/* The worlds fetched only when chosen, which is both freestyle worlds.
 * `custom` is the field and is the baseline: it is loaded at boot because
 * the title screen has a world behind it. Both are the default run, because
 * a check that only ever visits the town says nothing about Your map.
 *
 * Your map goes FIRST. It borrows modules from the town, and a module the
 * page has already imported is not fetched again, so visited after the town
 * its borrowing is invisible and the BORROWS check below passes by seeing
 * nothing. The town learns nothing from the order: it imports nothing of
 * Your map's. */
const HEAVY = ['built', 'city'];

/*
 * WHAT BOOT MAY TAKE FROM THE PROPS LIBRARY, AND WHY IT IS NOT NOTHING.
 *
 * src/props is Your map's asset library: the layouts, the meshes and the
 * solids the craft collides with, and none of it belongs on the wire before
 * Your map is chosen. The one exception is src/props/types.js, the asset
 * table as data (names, groups, styles, rough heights) with no imports of
 * its own. The builder's element table, src/trackbuilder/elements.js, lists
 * the assets from it, and the track document's model, src/trackbuilder/
 * model.js, reads a prop's styles and gap points from it to normalise a
 * map. The simulator imports both at boot for its tracks (through
 * src/game/trackdoc.js and src/trackbuilder/storage.js), so the data comes
 * along. The list is exact, so a second props module reaching boot fails
 * here by name rather than riding in under the first.
 */
const BOOT_PROPS = ['types.js'];

/*
 * Every URL the page has fetched, as a plain list. Resource timing is the
 * browser's own record, so this cannot be fooled by a loader that thinks it
 * did not fetch something.
 *
 * It is CUMULATIVE for the life of the page, which is the trap: after the
 * city has been loaded once, its URLs are in every later reading, so a naive
 * "did choosing the city pull in its graph" test reports yes for a page that
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

/*
 * WHAT ONE WORLD MAY TAKE FROM ANOTHER, BY DESIGN, AND NOTHING MORE.
 *
 * Your map is drawn in the town's style on purpose (FREESTYLE-MAPS-PLAN.md):
 * src/props/kit.js makes every material with the town's cel kit, and draws
 * the town's own cars and vending machines with the town's own builders,
 * rather than keeping a second copy of either that would drift. So choosing
 * it fetches these modules from under src/maps/city, and that is the whole
 * of what it may fetch there. The list is exact rather than a prefix, so a
 * props file that one day imports the town's index, or a vendored builder
 * that grows an import, fails here instead of quietly putting the town on a
 * yard's load.
 */
const BORROWS = {
  built: {
    city: [
      'vendored/core/palette.js',
      'vendored/core/post.js',
      'vendored/core/sky.js',
      'vendored/core/textures.js',
      'vendored/core/toon.js',
      'vendored/core/util.js',
      'vendored/core/outline.js',
      'vendored/world/vehicles.js',
      'vendored/world/vending.js',
      /* Not the kit's: vehicles.js imports its kei truck from here. */
      'vendored/world/props.js',
      /* And props.js takes its kerb and footway numbers from street.js,
       * which takes its trench from landform.js. */
      'vendored/world/street.js',
      'vendored/world/landform.js',
    ],
  },
};

/* The URLs under another world that this one is not allowed to have. */
function bleedOf(urls, id, other) {
  const allowed = (BORROWS[id] && BORROWS[id][other]) || [];
  return underMap(urls, other).filter((u) => {
    const path = u.split(/[?#]/)[0];
    return !allowed.some((a) => path.endsWith(`/src/maps/${other}/${a}`));
  });
}

function parseArgs(argv) {
  const opts = { maps: HEAVY };
  for (const a of argv) {
    const m = a.match(/^--map=(.*)$/);
    if (m) {
      opts.maps = m[1].split(',').map((id) => id.trim()).filter(Boolean);
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

    /* Half one. Nothing heavy may be on the wire before it is chosen, and
     * neither may a map this run was asked about, which is how a lighter
     * world like Your map gets the same laziness check as the town. The
     * field is the one map that is meant to be there at boot. */
    const lazy = [...new Set([...HEAVY, ...opts.maps])].filter((id) => id !== 'custom');
    for (const id of lazy) {
      const hits = underMap(bootUrls, id);
      if (hits.length) {
        failures.push(
          `${hits.length} ${id} module(s) fetched with the field selected, first ${hits[0]}`,
        );
      }
    }
    if (!failures.length) {
      console.log(`none of ${lazy.join(', ')} fetched at boot`);
    }
    const bootProps = bootUrls
      .map((u) => u.split(/[?#]/)[0])
      .filter((u) => u.includes('/src/props/'));
    const strayProps = bootProps.filter(
      (u) => !BOOT_PROPS.some((a) => u.endsWith(`/src/props/${a}`)),
    );
    if (strayProps.length) {
      failures.push(
        `${strayProps.length} src/props module(s) fetched at boot, first ${strayProps[0]}`,
      );
    } else {
      const seen = bootProps.map((u) => u.slice(u.lastIndexOf('/src/props/') + 1));
      console.log(`src/props at boot: ${seen.length ? seen.join(', ') : 'nothing'}`);
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
        const bleed = bleedOf(afterUrls, id, other);
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
