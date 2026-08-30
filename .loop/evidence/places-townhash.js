/*
 * places-townhash.js: the proof that the freestyle city itself is unchanged.
 *
 * The owner's ask for the two new places was "do not change the existing city
 * map". A screenshot cannot say that and a diff can only say which files
 * moved. This hashes the town's OWN authored collider rectangles, the first
 * 14060, at their own indices, and its first 588 platforms, straight off
 * `window.__cityWorld()` before the fit or the bake has touched anything.
 * Two builds that agree on both numbers have the same solid world.
 *
 * Paste into the eval step of scripts/shots.js after the city is ready:
 *
 *   node scripts/shots.js --out=.loop/scratch --graphics=high \
 *     'until:!!window.__boot && window.__boot().frames > 2' \
 *     'eval:window.__setMap("city")' \
 *     'until:window.__map().id === "city" && window.__map().ready' \
 *     "eval:$(cat .loop/evidence/places-townhash.js)"
 *
 * MEASURED 2026-08-30.
 *
 *   636db78, before any of this work
 *     14060 colliders  hash 1215864512   588 platforms  phash 3800319032
 *   with the works road, the works, the pool and the blossom
 *     14875 colliders  hash 1215864512   631 platforms  phash 3800319032
 *
 * 815 rectangles and 43 platforms appended, and not one of the town's own
 * moved. Appending rather than inserting is also what keeps
 * `findBoomBlocks`'s two indices valid; see src/maps/city/index.js.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */
(() => {
  const v = window.__mapScene();
  const view = window.__cityWorld();
  /* The town's own authored rectangles, before anything of ours is appended.
   * Hashed as written by the town, not as fitted, so this is a statement
   * about world/index.js's output and nothing else. */
  const N = 14060;
  let h = 2166136261 >>> 0;
  const mix = (x) => {
    const n = Math.round(x * 1000);
    h ^= n & 0xffff; h = Math.imul(h, 16777619) >>> 0;
    h ^= (n >> 16) & 0xffff; h = Math.imul(h, 16777619) >>> 0;
  };
  for (let i = 0; i < Math.min(N, view.colliders.length); i += 1) {
    const b = view.colliders[i];
    mix(b.x0); mix(b.x1); mix(b.z0); mix(b.z1);
    mix(b.top === undefined ? -9999 : b.top);
    mix(b.bottom === undefined ? -9999 : b.bottom);
  }
  let ph = 2166136261 >>> 0;
  const pmix = (x) => { const n = Math.round(x * 1000); ph ^= n & 0xffff; ph = Math.imul(ph, 16777619) >>> 0; ph ^= (n >> 16) & 0xffff; ph = Math.imul(ph, 16777619) >>> 0; };
  for (let i = 0; i < Math.min(588, view.platforms.length); i += 1) {
    const p = view.platforms[i];
    pmix(p.x0); pmix(p.x1); pmix(p.z0); pmix(p.z1); pmix(p.top);
  }
  return JSON.stringify({ townColliders: view.colliders.length, hash: h, platforms: view.platforms.length, phash: ph });
})()
