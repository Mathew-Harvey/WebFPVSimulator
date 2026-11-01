/*
 * look.js: the Gem look, a polished polygon style that costs the flight loop nothing.
 *
 * WHY IT EXISTS. The comic layer (src/render/comic.js) is off on every preset
 * because it cost frame time and the testers did not want it (bug-09e28ecf).
 * The owner's rule of 2026-10-09 is that latency comes first, so the polish
 * that stays has to be work done once, when a world is built, never per frame.
 * Everything here is that kind of work: a colour, a vertex colour, a sky and
 * fog value. It adds no draw, no pass, no texture read, no shader arithmetic
 * and no shader program. The one other piece of the look is the finer toon
 * ramp in celmat.js, which is a texture's content and not its use.
 *
 * WHAT IT DOES, once per built world (main.js loadMap):
 *   - a little tone and hue variation per vertex, a darkening toward the foot
 *     of a wall and under an overhang, a lift on upward faces, written into
 *     the vertex colours a mesh already carries. A mesh with no vertex
 *     colours is left alone, because turning them on costs a multiply a pixel.
 *   - the sky's and the fog's colour a little fuller, and the fog a fifth of
 *     the way toward the sky's horizon so the two meet without a seam.
 *   - the key light a touch warmer.
 * Fog distances are not touched: the town's are its draw distance.
 *
 * Gates, markers and every other material colour are not touched either:
 * they carry meaning and the pilot reads them.
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

export const GEM = {
  /* Tone and hue variation per vertex, as a fraction. */
  jitter: 0.09,
  hueJitter: 0.016,
  /* Darkening at a wall's foot (full under 0.2 m, gone by 3.2 m) and under an overhang. */
  wallFoot: 0.14,
  underside: 0.9,
  /* A lift on faces that look up. */
  topLift: 0.07,
  /* The sky's colour fullness, and its zenith's lightness. */
  skySat: 1.25,
  skyTop: 0.96,
  /* The fog's colour fullness, and how far it moves toward the sky's horizon. */
  fogSat: 1.1,
  fogToHorizon: 0.2,
  /* Multiplies the key light's colour. */
  keyLight: [1.0, 0.95, 0.85],
};

function hash(x, y, z) {
  let h = Math.imul(x | 0, 0x1f3d5b79) ^ Math.imul(y | 0, 0x2c1b3c6d) ^ Math.imul(z | 0, 0x297a2d39);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const hsl = { h: 0, s: 0, l: 0 };

function skyColour(c, top) {
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * GEM.skySat), Math.min(1, hsl.l * (top ? GEM.skyTop : 1)));
}

/*
 * The tone pass over one geometry. Cells are half a metre, so a vertex shared
 * by two meshes at a seam gets the same tone from both.
 */
function toneGeometry(geo) {
  const col = geo.attributes.color;
  /* A colour is held to 1, except on a geometry that asks for more: a
   * built map's plot laid with a tone of its own (../maps/built/ground.js),
   * where a mown band is lighter than the grass and not only the rest
   * darker. */
  const top = geo.userData.brightTone ? 1.6 : 1;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const a = col.array;
  for (let i = 0; i < pos.count; i += 1) {
    const x = Math.round(pos.getX(i) * 2);
    const y = pos.getY(i);
    const z = Math.round(pos.getZ(i) * 2);
    const h = hash(x, Math.round(y * 2), z);
    const h2 = hash(z + 7, x - 3, Math.round(y * 2) + 11);
    const ny = nor.getY(i);
    let k = 1 + (h - 0.5) * 2 * GEM.jitter;
    if (Math.abs(ny) < 0.5) {
      k -= GEM.wallFoot * (1 - Math.min(1, Math.max(0, (y - 0.2) / 3)));
    }
    if (ny < -0.5) {
      k -= GEM.wallFoot * GEM.underside;
    }
    if (ny > 0.7) {
      k += GEM.topLift;
    }
    const warm = (h2 - 0.5) * 2 * GEM.hueJitter;
    const j = i * 3;
    a[j] = Math.min(top, Math.max(0, a[j] * k * (1 + warm)));
    a[j + 1] = Math.min(top, Math.max(0, a[j + 1] * k));
    a[j + 2] = Math.min(top, Math.max(0, a[j + 2] * k * (1 - warm)));
  }
  col.needsUpdate = true;
}

/*
 * Apply the look to a built world's scene, once. A scene already done is left alone.
 *
 * `keep` is a session lived root inside the scene, the craft, which is left
 * exactly as it was. The craft outlives every world (src/render/shell.js) and
 * every map adds it to its scene, so it was toned again by every world built
 * after it: measured, the craft's vertex colours fell by about a tenth with
 * each world, to 58 percent of the first world's after five more, and its tone
 * came from cells and a wall's foot that a five inch quad does not have. A
 * geometry is also toned at most once, so nothing else that outlives its world
 * can drift.
 */
export function applyLook(scene, keep = null) {
  if (!scene || scene.userData.gemLook) {
    return;
  }
  scene.userData.gemLook = true;
  const key = new THREE.Color(...GEM.keyLight);
  const skies = [];
  const done = new Set();
  const kept = new Set();
  if (keep) {
    keep.traverse((o) => kept.add(o));
  }
  scene.traverse((o) => {
    if (kept.has(o)) {
      return;
    }
    if (o.isDirectionalLight && o.intensity > 1.5) {
      o.color.multiply(key);
    }
    if (!o.isMesh) {
      return;
    }
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m && m.isShaderMaterial && m.uniforms && (m.uniforms.uHorizon || m.uniforms.uTop)) {
      skies.push(m.uniforms);
    }
    const g = o.geometry;
    if (!m || !m.vertexColors || !g || done.has(g) || g.userData.gemToned || o.isInstancedMesh) {
      return;
    }
    const c = g.attributes.color;
    if (c && c.itemSize === 3 && g.attributes.normal && g.attributes.position) {
      done.add(g);
      g.userData.gemToned = true;
      toneGeometry(g);
    }
  });
  for (const u of skies) {
    if (u.uHigh) {
      skyColour(u.uHigh.value, true);
      skyColour(u.uHorizon.value, false);
    } else {
      skyColour(u.uTop.value, true);
      skyColour(u.uMid.value, false);
      skyColour(u.uHaze.value, false);
    }
  }
  const fog = scene.fog;
  if (fog) {
    fog.color.getHSL(hsl);
    fog.color.setHSL(hsl.h, Math.min(1, hsl.s * GEM.fogSat), hsl.l);
    if (skies.length) {
      const u = skies[0];
      fog.color.lerp((u.uHorizon || u.uHaze).value, GEM.fogToHorizon);
    }
    /* A sky that paints the fog's own colour under its horizon (a built
     * map's dome, uFog in src/maps/built/looks.js) takes the new colour as
     * well, or the fogged ground and the dome below it meet at a seam. */
    for (const u of skies) {
      if (u.uFog) {
        u.uFog.value.copy(fog.color);
      }
    }
  }
}
