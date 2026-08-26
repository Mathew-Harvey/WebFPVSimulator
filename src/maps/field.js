/*
 * field.js: the track world's composer wrap.
 *
 * The world itself is still src/render/scene.js and its post chain is still
 * src/render/post.js. This file is the join: it hands the scene builder the
 * session's renderer, camera and airframe, wraps the composer so maps
 * present the same `post` object, and adds a dispose that frees the
 * composer's render targets as well as the scene graph. custom.js is the
 * map the player flies; this file is the shared wrap.
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

import { buildFieldScene } from '../render/scene.js';
import { buildComposer } from '../render/post.js';
import { qualityFor } from '../render/quality.js';

/*
 * Give a built scene its composer, and a dispose that frees both.
 *
 * Exported because custom.js needs the identical seven lines: the field and
 * the custom map are the same world with a different course in it, and the
 * dispose in particular is not a detail to keep two copies of.
 */
export function attachComposer(shell, map, q) {
  const post = buildComposer(shell.renderer, map.scene, shell.camera, q);
  const d = shell.resize();
  post.setSize(d.w, d.h);
  const sceneDispose = map.dispose;
  map.post = post;
  map.dispose = () => {
    /* The composer knows what it owns: targets, the bloom ladder, and the
     * pass materials whose compiled programs the renderer caches. Freeing
     * only the targets here is how a handful of shader programs used to
     * leak on every swap. */
    post.dispose();
    sceneDispose();
  };
  return map;
}

export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  return attachComposer(shell, buildFieldScene(shell, progress, null, q), q);
}
