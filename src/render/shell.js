/*
 * shell.js: everything that outlives a map.
 *
 * There are two maps now, a race field and a freestyle city, and they are
 * built by different code with different render pipelines. What they share is
 * a renderer, a canvas, a camera and an airframe, and none of those may be
 * rebuilt when the player changes map: a WebGL context is expensive, the
 * camera's layer mask is a contract the post chains read, and re-creating the
 * craft would recompile its cel materials for nothing.
 *
 * So the split is: this file owns the session, a MapInstance owns the world.
 * A MapInstance owns its scene, its post chain, its colliders and its contact
 * data, and disposes all of it when it is swapped out, which is what keeps
 * only one map's render targets alive at a time. The contract a MapInstance
 * must satisfy is written down in src/maps/README.md.
 *
 * The renderer's own state is deliberately NOT set here. The two maps want
 * different shadow filtering and different clear colours, and a map that
 * silently inherits the other one's renderer state is the kind of defect that
 * only shows up on the second map you load. Each map applies what it needs in
 * applyRendererState.
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

import * as THREE from 'three';
import { buildCraft } from './craft.js';

/*
 * Free every GPU resource a map's scene graph owns.
 *
 * This is what makes "only the active map exists" true rather than asserted.
 * Without it a swap leaks the whole previous world: three.js holds geometry
 * and texture handles until dispose is called, garbage collection does not
 * reach them, and P5's render target budget is measured against a driver that
 * is still holding the field's 42.8 MB of attributes while the city builds
 * its own. Textures are collected into a Set first because a city material
 * atlas is shared by hundreds of meshes and disposing it hundreds of times is
 * merely wasteful the first time and a no-op after.
 *
 * The craft is re-parented out before this runs, so it is never reachable
 * from here. Anything else in the graph is the map's and dies with it.
 */
export function disposeSceneGraph(root, keepTextures) {
  const textures = new Set();
  const materials = new Set();
  const geometries = new Set();
  const shadows = new Set();
  root.traverse((obj) => {
    /*
     * A light owns a render target and nothing else here would have found it.
     * `light.shadow.map` is a 2048 by 2048 target the renderer allocates
     * lazily and frees only on an explicit dispose, and it is reachable from
     * neither `geometry` nor `material`. Missing it leaked one shadow map per
     * map swap, 33.5 MB each against a 120 MB budget, invisible to
     * `__budget` because the leaked targets belong to a scene nothing
     * traverses any more.
     */
    if (obj.isLight && obj.shadow && obj.shadow.map) {
      shadows.add(obj.shadow.map);
    }
    if (obj.geometry) {
      geometries.add(obj.geometry);
    }
    const m = obj.material;
    if (!m) {
      return;
    }
    const list = Array.isArray(m) ? m : [m];
    for (const mat of list) {
      materials.add(mat);
      for (const key of Object.keys(mat)) {
        const v = mat[key];
        if (v && v.isTexture) {
          textures.add(v);
        }
      }
      const uniforms = mat.uniforms;
      if (uniforms) {
        for (const key of Object.keys(uniforms)) {
          const v = uniforms[key] && uniforms[key].value;
          if (v && v.isTexture) {
            textures.add(v);
          }
        }
      }
    }
  });
  for (const g of geometries) {
    g.dispose();
  }
  for (const m of materials) {
    m.dispose();
  }
  let kept = 0;
  for (const t of textures) {
    /*
     * Some textures are the SESSION's, not the map's. Every cel material
     * shares one gradient ramp singleton from celmat.js, and the airframe's
     * four cel materials are session lived and still hold it, so disposing it
     * with the map would free a texture that live materials point at. The
     * caller names what to keep.
     */
    if (keepTextures && keepTextures.has(t)) {
      kept += 1;
      continue;
    }
    t.dispose();
  }
  for (const m of shadows) {
    m.dispose();
  }
  root.clear();
  return {
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size - kept,
    keptTextures: kept,
    shadowMaps: shadows.size,
  };
}

export function buildShell(canvas) {
  /* No depth and no stencil on the default framebuffer. The only thing ever
   * drawn into it is a fullscreen quad from whichever map's post chain is
   * active, which is neither depth tested nor stencilled, and a browser hands
   * out a D24S8 buffer by default: measured, 8.3 MB of the frame's 120 MB
   * render target budget for a buffer nothing reads. antialias stays off
   * because both post chains allocate their own targets, so the flag would
   * multisample that same one quad. */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    depth: false,
    stencil: false,
  });
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /* No filmic tone curve: it desaturates exactly the flat saturated colour
   * both of these styles are built on. Each map's last pass does the colour
   * space conversion itself. */
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;

  /*
   * Near plane at 0.2 m, not 0.04. The camera sits inside a 150 mm airframe,
   * so 4 cm buys nothing, and a 0.04 to 2600 range left the race field's
   * outline prepass with under one depth code of separation past about 500 m.
   *
   * The far plane is a map's business, not the session's: 2600 m is the race
   * field's valley and the city needs a fraction of it, so a map sets
   * camera.far and calls updateProjectionMatrix in its own build. The value
   * here is the field's, because the field is what boots.
   */
  const camera = new THREE.PerspectiveCamera(100, 1, 0.2, 2600);
  /* Layer 1 is the no ink layer and layer 2 is the grass, both read by the
   * race field's outline prepass in post.js. The city's pipeline is screen
   * space and puts everything on layer 0, so enabling these costs it nothing
   * and keeps one camera good for both. */
  camera.layers.enable(1);
  camera.layers.enable(2);

  const craft = buildCraft();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return { w, h };
  }
  resize();

  return {
    renderer,
    camera,
    canvas,
    pixelRatio,
    quad: craft.group,
    discs: craft.discs,
    blades: craft.blades,
    cameraMount: craft.cameraMount,
    propSpin: craft.propSpin,
    resize,
  };
}
