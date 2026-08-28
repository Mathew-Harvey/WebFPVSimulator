/*
 * attract-check.js: what the title camera flies through, and what it can see.
 *
 * THE ATTRACT CAMERA IS THE ONE CAMERA WITH NOTHING TO STOP IT. The quad has
 * colliders. The free camera has a pilot. This one is a spline through
 * numbers somebody typed, and it will fly through a wall without a word.
 * When it does, the frame is the inside of that wall, and the only place the
 * damage shows is a world card on the Freestyle screen, at 236 px wide,
 * where nobody looks twice.
 *
 * It was doing exactly that in three of the four freestyle worlds the first
 * time this was run: the cement works climbed the inside of its own chimney,
 * the municipal baths dived through the coping of the pool rather than over
 * it, and Bardwell's yard clipped a fence post and two trees. All three had
 * been looked at as thumbnails and argued about. This is the check that
 * means the next one is found by running a command.
 *
 * ONE FAULT AND TWO READINGS.
 *
 * `through` is how many of the sampled steps put the camera inside something
 * solid. It is a fault at one, with no threshold to argue about: a camera in
 * a wall is never the shot.
 *
 * The other three are printed and none of them fails the run, because they
 * are judgements about a shot rather than defects. `under N m` is the share
 * of the loop with less than CLOSE_M of clear air in front of the lens.
 * `down` is the share pitched more than STEEP_DEG below the horizon, which
 * is a photograph of the ground. `sky` is the share pointed above the
 * horizon at nothing at all inside VIEW_REACH, which is the opposite failure
 * and just as common: a camera climbing out of a corner leaves the world
 * behind the frame and the card holds a gradient for a second and a half.
 *
 * `under N m` earns its place by NOT gating. It does not separate a good
 * shot from a bad one: the cement works inside its own chimney read 21.9
 * percent and Bardwell's yard, the best card of the four, read 22.2. A
 * number that answers the same for the best and the worst is a number to
 * look at, not to gate on. It is kept because it is the one that says WHY
 * when the other two look fine.
 *
 * Cheap: one page, each world built once, no capture, no video. Not part of
 * `npm run verify`. Run it after touching a map's `attract` block:
 *
 *     npm run lint:attract
 *     node scripts/attract-check.js bando
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
import { MAPS } from '../src/maps/registry.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Samples per loop. At the shortest attract period here that is a step of
 * well under a metre, which is finer than anything the colliders resolve. */
const SAMPLES = 320;

/*
 * The half extent the path is swept with. Not the craft's: this is a camera,
 * and the question is whether the LENS is inside something, not whether a
 * five inch quad would have fitted. Small enough that a deliberate close
 * pass reads as a close pass, big enough that a camera skimming the skin of
 * a wall does not read as clear air.
 */
const PATH_HALF = 0.35;

/* How far ahead the view ray asks. Past this the answer stops mattering:
 * the fog in these worlds ends between 46 and 190 m. */
const VIEW_REACH = 40;

/* What counts as looking at a wall. Two arm's lengths. */
const CLOSE_M = 5;

/* What counts as looking at the ground rather than at the place. An
 * establishing shot wants a horizon in it, and past about this the horizon
 * has left the top of the frame. */
const STEEP_DEG = 25;

/* And what counts as looking at nothing. Above this, with the view ray
 * running the full VIEW_REACH without meeting anything, the frame is sky. */
const SKY_DEG = 10;

/*
 * The walk, in the page, because the answer depends on the built world: the
 * spline is the map's own, and the colliders are the ones a quad would hit.
 * Reimplementing either in Node would be checking a copy.
 */
const WALK = `(() => {
  const path = window.__attract(${SAMPLES});
  const n = path.samples.length;
  let through = 0;
  let close = 0;
  let steep = 0;
  let sky = 0;
  let nearest = Infinity;
  let nearestAt = null;
  const steepSin = Math.sin((${STEEP_DEG} * Math.PI) / 180);
  const skySin = Math.sin((${SKY_DEG} * Math.PI) / 180);
  const worst = [];
  for (let i = 0; i < n; i += 1) {
    const a = path.samples[i];
    const b = path.samples[(i + 1) % n];
    const solid = window.__hit(a.x, a.y, a.z, b.x, b.y, b.z, ${PATH_HALF});
    if (solid.kind) {
      through += 1;
      if (worst.length < 14) {
        worst.push({
          ms: Math.round(a.ms),
          kind: solid.kind,
          at: [Math.round(a.x * 10) / 10, Math.round(a.y * 10) / 10, Math.round(a.z * 10) / 10],
        });
      }
    }
    const r = ${VIEW_REACH};
    const ray = window.__hit(
      a.x, a.y, a.z,
      a.x + a.dx * r, a.y + a.dy * r, a.z + a.dz * r,
      0.05,
    );
    const free = ray.kind ? Math.max(0, ray.t) * r : r;
    if (free < ${CLOSE_M}) { close += 1; }
    if (a.dy < -steepSin) { steep += 1; }
    if (a.dy > skySin && !ray.kind) { sky += 1; }
    if (free < nearest) {
      nearest = free;
      nearestAt = [Math.round(a.x * 10) / 10, Math.round(a.y * 10) / 10, Math.round(a.z * 10) / 10];
    }
  }
  return JSON.stringify({
    map: path.map,
    kind: path.kind,
    periodMs: Math.round(path.periodMs),
    samples: n,
    through,
    worst,
    closeShare: close / n,
    steepShare: steep / n,
    skyShare: sky / n,
    nearest: Math.round(nearest * 10) / 10,
    nearestAt,
  });
})()`;

const wanted = process.argv.slice(2);
const targets = MAPS
  .filter((m) => m.mode === 'freestyle')
  .filter((m) => !wanted.length || wanted.includes(m.id));

if (!targets.length) {
  const known = MAPS.filter((m) => m.mode === 'freestyle').map((m) => m.id).join(', ');
  console.error(`No world to check. Known: ${known}`);
  process.exit(2);
}

const page = await openPage({
  root,
  width: 960,
  height: 540,
  /*
   * HIGH, and this is not a preference. The preset decides `foliageKeep`,
   * and foliage is planted WITH ITS COLLIDERS: the yard keeps 0.35 of its
   * trees at Low and 0.55 at High, so a run at Low is blind to a third of
   * the things the title camera could fly into on the machine of anybody who
   * picked the authored look. A check that cannot see what it is checking
   * for is not evidence. It costs a few minutes across four worlds, which is
   * the right trade for a lint nobody runs on every commit.
   */
  seed: [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = 'high';
    s.graphicsAuto = false;
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* Storage refused. The run still boots. */ }`],
});

const failures = [];
try {
  await page.until('!!window.__boot && window.__boot().frames > 2', 120000);

  for (const map of targets) {
    await page.evaluate(`window.__setMap(${JSON.stringify(map.id)})`);
    await page.until(
      `window.__map().id === ${JSON.stringify(map.id)} && window.__map().ready`,
      180000,
    );
    const r = JSON.parse(await page.evaluate(WALK));
    const pct = (v) => `${Math.round(v * 1000) / 10}%`;
    console.log(
      `${r.map}: ${r.kind} loop, ${Math.round(r.periodMs / 100) / 10} s, `
      + `through ${r.through}/${r.samples}, `
      + `under ${CLOSE_M} m ${pct(r.closeShare)}, `
      + `down ${pct(r.steepShare)}, sky ${pct(r.skyShare)}, `
      + `nearest ${r.nearest} m at `
      + `${r.nearestAt ? r.nearestAt.join(', ') : 'nowhere'}`,
    );
    for (const w of r.worst) {
      console.log(`  through ${w.kind} at ${w.ms} ms, ${w.at.join(', ')}`);
    }
    if (r.through > 0) {
      failures.push(`${r.map}: the title camera passes through something on `
        + `${r.through} of ${r.samples} steps`);
    }
  }
} finally {
  await page.close();
}

if (failures.length) {
  console.error('');
  for (const f of failures) {
    console.error(`FAIL ${f}`);
  }
  process.exit(1);
}
console.log('attract: no world flies the title camera through anything solid.');
