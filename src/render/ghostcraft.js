/*
 * ghostcraft.js: the ghost's airframe.
 *
 * The same machine the player flies, built by the same builder, wearing a
 * hologram: every panel and motor is replaced with one translucent mint
 * material, mint because that is the colour this product paints a record
 * in, and a ghost IS a record, flying. Reusing buildHeroCraft is the
 * point: the ghost must read as "that exact quad, again", not as a second
 * model that drifts out of step the next time the airframe changes.
 *
 * Session lived, like the hero craft in craft.js: built once, re-parented
 * into whichever scene is active by the shell, never disposed with a map.
 * The lite build is used (no inverted hulls, no shadow casters), the blade
 * rotors are removed in favour of the spun-up prop discs, since a ghost is
 * always in flight, and every original material is disposed after the swap
 * so nothing it compiled stays registered with the cel clock.
 *
 * Above the craft floats a small name tag, a sprite drawn once per label
 * change, so a pilot two gates back can see who they are chasing.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHeroCraft } from './herocraft.js';

const GHOST_MINT = 0x7dffb4;
/* Body opacity at full presence. The discs sit far lower, as they do on
 * the hero craft, so the silhouette stays an airframe and not a coin. */
const BODY_OPACITY = 0.40;
const DISC_OPACITY = 0.10;
const LABEL_OPACITY = 0.88;

export function buildGhostCraft() {
  const craft = buildHeroCraft({
    name: 'ghost-craft',
    lite: true,
    fog: true,
    worldScale: true,
  });
  const { group } = craft;

  const bodyMat = new THREE.MeshBasicMaterial({
    color: GHOST_MINT,
    transparent: true,
    opacity: BODY_OPACITY,
    depthWrite: false,
    fog: true,
  });
  const discMat = new THREE.MeshBasicMaterial({
    color: GHOST_MINT,
    transparent: true,
    opacity: DISC_OPACITY,
    depthWrite: false,
    fog: true,
  });

  /* A ghost is always flying, so it wears the spun-up discs and no blades.
   * The rotors go entirely rather than being hidden: their geometry would
   * otherwise sit on the GPU for the whole session drawing nothing. */
  const doomedGeo = new Set();
  for (const rotor of craft.blades) {
    rotor.traverse((n) => {
      if (n.geometry) {
        doomedGeo.add(n.geometry);
      }
    });
    rotor.removeFromParent();
  }

  const discSet = new Set(craft.discs);
  const doomedMat = new Set();
  group.traverse((n) => {
    if (!n.isMesh) {
      return;
    }
    doomedMat.add(n.material);
    n.material = discSet.has(n) ? discMat : bodyMat;
    n.castShadow = false;
    n.receiveShadow = false;
    /* After the opaque world, with depth write off, so the translucent
     * panels never punch holes in each other or in the scenery. */
    n.renderOrder = 2;
  });
  for (const m of doomedMat) {
    m.dispose();
  }
  for (const g of doomedGeo) {
    g.dispose();
  }

  /*
   * TWO DRAWS, NOT EIGHTEEN. Every panel of the lite craft was its own mesh,
   * so one ghost was 17 draws and its tag, and Board top 3 (three ghosts)
   * would have been 54. The ghost never moves a part against another (no
   * blades, no spinning discs), so each material's meshes are baked into
   * one geometry in the group's own frame: one draw for the body and one
   * for the discs. Blending is unchanged, because every panel of a material
   * is the same colour at the same opacity with depth write off, and that
   * sum does not depend on the order the panels are drawn in. Position only:
   * a MeshBasicMaterial reads nothing else, and dropping the rest is what
   * lets panels with different attribute sets merge.
   */
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts = new Map([[bodyMat, []], [discMat, []]]);
  const merged = [];
  group.traverse((n) => {
    if (n.isMesh && parts.has(n.material)) {
      merged.push(n);
    }
  });
  for (const n of merged) {
    let g = n.geometry.index ? n.geometry.toNonIndexed() : n.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position') {
        g.deleteAttribute(name);
      }
    }
    g.morphAttributes = {};
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, n.matrixWorld));
    parts.get(n.material).push(g);
  }
  const baked = new Map();
  for (const [mat, list] of parts) {
    if (list.length) {
      baked.set(mat, mergeGeometries(list));
    }
    for (const g of list) {
      g.dispose();
    }
  }
  if ([...baked.values()].every(Boolean)) {
    const oldGeo = new Set(merged.map((n) => n.geometry));
    for (const n of merged) {
      n.removeFromParent();
    }
    for (const g of oldGeo) {
      g.dispose();
    }
    for (const [mat, geo] of baked) {
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = mat === discMat ? 'ghost-discs' : 'ghost-body';
      mesh.renderOrder = 2;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      group.add(mesh);
    }
  } else {
    /* A panel that would not merge: keep the craft as it was built. */
    for (const geo of baked.values()) {
      if (geo) {
        geo.dispose();
      }
    }
  }

  /* The name tag. One canvas, redrawn only when the label changes. */
  const tagCanvas = document.createElement('canvas');
  tagCanvas.width = 512;
  tagCanvas.height = 96;
  const tagTexture = new THREE.CanvasTexture(tagCanvas);
  tagTexture.colorSpace = THREE.SRGBColorSpace;
  const tagMat = new THREE.SpriteMaterial({
    map: tagTexture,
    transparent: true,
    opacity: LABEL_OPACITY,
    depthWrite: false,
    fog: false,
  });
  const tag = new THREE.Sprite(tagMat);
  /* Above the airframe, small enough to be a caption rather than a banner.
   * A sprite is world sized, so it shrinks with distance and becomes a mint
   * spark on the horizon, which is exactly the locator a chase needs. */
  tag.position.set(0, 0.34, 0);
  tag.scale.set(1.5, 0.28, 1);
  tag.renderOrder = 3;
  group.add(tag);
  let tagText = '';

  function setLabel(text) {
    const next = String(text || '').slice(0, 32);
    if (next === tagText) {
      return;
    }
    tagText = next;
    const ctx = tagCanvas.getContext('2d');
    ctx.clearRect(0, 0, tagCanvas.width, tagCanvas.height);
    if (next) {
      ctx.font = '600 52px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      /* An ink shadow first, so the mint stays readable over a bright sky
       * and over the cream field markings alike. */
      ctx.fillStyle = 'rgba(12, 18, 14, 0.85)';
      ctx.fillText(next, tagCanvas.width / 2 + 3, tagCanvas.height / 2 + 3);
      ctx.fillStyle = '#7dffb4';
      ctx.fillText(next, tagCanvas.width / 2, tagCanvas.height / 2);
    }
    tag.visible = Boolean(next);
    tagTexture.needsUpdate = true;
  }
  setLabel('');

  /*
   * Presence, 0 to 1. Zero hides the group entirely so a parked ghost
   * costs no draw calls; anything above it scales every opacity together,
   * which is how the shell fades the ghost in at the line, out at its
   * finish, and across a recorded crash recovery.
   */
  function setPresence(a) {
    const k = Math.max(0, Math.min(1, a));
    group.visible = k > 0.004;
    bodyMat.opacity = BODY_OPACITY * k;
    discMat.opacity = DISC_OPACITY * k;
    tagMat.opacity = LABEL_OPACITY * k;
  }
  setPresence(0);

  return {
    group,
    setLabel,
    setPresence,
  };
}
