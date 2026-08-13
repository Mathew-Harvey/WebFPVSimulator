/*
 * field.js: the race field, packaged as a map.
 *
 * The world itself is still src/render/scene.js and its post chain is still
 * src/render/post.js; nothing about either changed when the second map
 * arrived. This file is the join, and it is deliberately thin: it hands the
 * scene builder the session's renderer, camera and airframe, wraps the
 * composer so the two maps present the same `post` object, and adds a dispose
 * that frees the composer's render targets as well as the scene graph.
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

export async function buildMap(shell, onProgress) {
  const progress = onProgress ?? (() => {});
  const map = buildFieldScene(shell, progress);
  const post = buildComposer(shell.renderer, map.scene, shell.camera);
  const d = shell.resize();
  post.setSize(d.w, d.h);
  const sceneDispose = map.dispose;
  map.post = post;
  map.dispose = () => {
    for (const rt of [post.composer.renderTarget1, post.composer.renderTarget2, post.normalTarget]) {
      if (rt) {
        rt.dispose();
      }
    }
    /* The bloom pass owns its own ladder of targets and knows how to free
     * them; the grade and outline passes own only materials. */
    if (post.bloom && typeof post.bloom.dispose === 'function') {
      post.bloom.dispose();
    }
    sceneDispose();
  };
  return map;
}
