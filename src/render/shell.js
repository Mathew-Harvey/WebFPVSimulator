/*
 * shell.js: everything that outlives a map.
 *
 * There are two kinds of map: tracks, and the freestyle city.
 * They are built by different code with different render pipelines. What they share is
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
import { CAMERA_FOV_DEFAULT } from './lens.js';

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

export function buildShell(canvas, opts) {
  /* No depth and no stencil on the default framebuffer. The only thing ever
   * drawn into it is a fullscreen quad from whichever map's post chain is
   * active, which is neither depth tested nor stencilled, and a browser hands
   * out a D24S8 buffer by default: measured, 8.3 MB of the frame's 120 MB
   * render target budget for a buffer nothing reads. antialias stays off
   * because both post chains allocate their own targets, so the flag would
   * multisample that same one quad.
   *
   * opts.pixelRatio and opts.powerPreference are for the orbit thumbnail
   * page, which must not inherit a 2x retina buffer or a high-performance
   * GPU hint while it records a 480p clip. */
  const options = opts || {};
  /*
   * high-performance, not default: on a dual-GPU laptop "default" often
   * picks the battery iGPU and the discrete chip sits idle. Quality
   * presets then scale resolution and effects; they do not pick the
   * device. failIfMajorPerformanceCaveat stays false so a machine with
   * only a software rasteriser still boots. Orbit thumbnails pass
   * low-power explicitly because they are a second context.
   */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: options.powerPreference || 'high-performance',
    failIfMajorPerformanceCaveat: false,
    /*
     * Opt out of the compositor's frame queue when the caller asks.
     *
     * A canvas normally hands its finished frame to the browser compositor,
     * which may hold one or two more before anything reaches the glass.
     * That queue is invisible in the frame rate and is felt in the sticks:
     * it is why a machine can report 45 frames per second and still fly
     * like a late radio, because the number counts frames produced, not
     * frames seen. desynchronized lets the canvas present closer to
     * directly, at the cost of tearing.
     *
     * Off unless asked, because the orbit thumbnail page reads its frames
     * back to record a clip, and a buffer that bypasses the compositor is
     * exactly the one a reader may find empty.
     */
    desynchronized: Boolean(options.desynchronized),
  });
  const pixelRatio = options.pixelRatio != null
    ? options.pixelRatio
    : Math.min(window.devicePixelRatio, 2);
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
  /* The boot lens, replaced by the pilot's own on the first settings pass.
   * lens.js is where the number is argued. */
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEFAULT, 1, 0.2, 2600);
  /* Layer 1 is the no ink layer. Layer 2 used to be the grass field; blades
   * are not drawn. Both bits are still enabled so the race field's outline
   * prepass in post.js keeps one camera good for both maps. The city's
   * pipeline is screen space and puts everything on layer 0, so enabling
   * these costs it nothing. */
  camera.layers.enable(1);
  camera.layers.enable(2);

  let craft = buildCraft(opts.airframe);

  function resize() {
    /*
     * The stylesheet sizes the canvas (100 percent of the viewport). Measuring
     * clientWidth after an inline width/height has been written returns that
     * pinned size, not the window, which is how a resize left a band of page
     * background under the world while the overlay still filled the frame.
     * The city's vendored pipeline calls setSize with updateStyle true; even
     * after we undo that, innerWidth is the size we actually want.
     */
    canvas.style.width = '';
    canvas.style.height = '';
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return { w, h };
  }
  resize();

  /*
   * ROOTS THAT OUTLIVE A MAP.
   *
   * The craft is session lived and the maps are not: the shell builds it
   * once and re-parents it into whichever map's scene is active. A map's
   * dispose has to hand it back before disposeSceneGraph runs, or the walk
   * frees the geometry and the cel materials of the aircraft the pilot is
   * still flying. disposeSceneGraph's own header states that invariant.
   *
   * The field map used to keep it by capturing shell.quad at BUILD time,
   * which is wrong twice over. Boot always builds a five inch and
   * applySettings swaps to the whoop afterwards, AFTER loadMap has already
   * captured, so on a whoop the map held the dead five inch group: its
   * scene.remove was a no-op and the live craft was disposed with the
   * world. Measured with a deleteBuffer hook over three forced rebuilds,
   * that cost 320 buffer deletes on the first and 119 and 117 after, the
   * extra 203 being the whoop. Nothing visibly broke because three
   * re-uploads whatever it finds missing, which is most of why it survived.
   *
   * And the craft was never the only one. main.js parents the ghost rig
   * into the same scene whenever a ghost is on screen and nothing ever
   * detaches it, so its geometry, its two materials, its sprite material
   * and its name tag canvas were freed on every map swap. The tag texture
   * is not in SESSION_TEXTURES, so that one is a live object being freed,
   * not merely a re-upload.
   *
   * So the register lives here rather than in each map. Anything session
   * lived says so once with keepAcrossMaps, a map's dispose calls
   * evictSessionRoots, and no map has to know what the list is. The craft
   * is always in it and is read at call time, never captured, because
   * swapCraft replaces craft.group and the register has to follow.
   *
   * DO NOT "tidy" this by calling keepAcrossMaps(craft.group) once at boot.
   * The Set would pin the boot-time five inch for the life of the session
   * and every aircraft swap after it would go unprotected, which is the
   * exact defect this replaced, moved one level down.
   */
  const sessionRoots = new Set();

  function keepAcrossMaps(group) {
    if (group) {
      sessionRoots.add(group);
    }
    return group;
  }

  /*
   * Detach every session lived root from this scene, so that what is left
   * is the map's and dies with it. Walks up the parent chain rather than
   * testing parent === scene, because a root re-parented under a group
   * inside the map is just as reachable from the dispose walk and just as
   * dead afterwards. No map nests the craft today, so this is insurance
   * rather than a fix for a live case: both maps add it at depth one. A
   * probe that nested it by hand two deep confirmed the walk still saves
   * it where the old scene.remove(quad), which only unlinks direct
   * children, would have let it be disposed.
   *
   * The null guard is not decoration. Without it the walk runs p up to
   * null, `p === scene` is null === null, and every unparented root is
   * "removed": harmless, because three's removeFromParent is a no-op
   * without a parent, but the count returned would be a lie.
   *
   * Returns how many were detached. Nothing reads it today.
   */
  function evictSessionRoots(scene) {
    if (!scene) {
      return 0;
    }
    let removed = 0;
    for (const root of [craft.group, ...sessionRoots]) {
      if (!root) {
        continue;
      }
      let p = root.parent;
      while (p && p !== scene) {
        p = p.parent;
      }
      if (p === scene) {
        root.removeFromParent();
        removed += 1;
      }
    }
    return removed;
  }

  const api = {
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
    swapCraft,
    keepAcrossMaps,
    evictSessionRoots,
  };

  /*
   * Build a different aircraft and put it where the last one was.
   *
   * The craft is SESSION LIVED and the maps are not: the shell builds one at
   * boot and re-parents it into whichever map's scene is active, which is
   * what src/render/craft.js's header is about. So swapping the aircraft has
   * to keep that property. The new group goes into the old one's parent at
   * the old one's pose, the old one is detached and its geometry released,
   * and every reference the shell publishes is re-seated in one place so a
   * caller holding shell.discs cannot end up animating a disposed rotor.
   *
   * Called between runs only. src/main.js applies the airframe on the same
   * rule it applies pack charge and flight style: mid lap it would be
   * changing the aircraft under the pilot.
   */
  function swapCraft(airframeId) {
    const old = craft;
    const parent = old.group.parent;
    const next = buildCraft(airframeId);
    next.group.position.copy(old.group.position);
    next.group.quaternion.copy(old.group.quaternion);
    next.group.visible = old.group.visible;
    if (parent) {
      parent.add(next.group);
      parent.remove(old.group);
    }
    disposeTree(old.group);
    craft = next;
    api.quad = next.group;
    api.discs = next.discs;
    api.blades = next.blades;
    api.cameraMount = next.cameraMount;
    api.propSpin = next.propSpin;
    return next;
  }

  return api;
}

/*
 * Release a craft's geometry and materials. Not shared with anything: every
 * mesh in a craft is built for that craft, and the cel materials are made per
 * build. A boot that never swaps aircraft never calls this.
 */
function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) {
      o.geometry.dispose();
    }
    const m = o.material;
    if (Array.isArray(m)) {
      for (const one of m) {
        if (one && one.dispose) {
          one.dispose();
        }
      }
    } else if (m && m.dispose) {
      m.dispose();
    }
  });
}
