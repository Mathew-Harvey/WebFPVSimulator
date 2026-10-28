/*
 * fx.js: what moves over Sunnyfield and is never solid. Steam rolling off
 * the two cooling towers, smoke from the plant's stack, and the tyre pile's
 * fire and its black column. Every puff is one instance of one low ball,
 * every flame one of one cone: two meshes, two draw calls, whatever the
 * count, and no texture.
 *
 * Posed from the step count the map is handed (updateAnim), so a puff is
 * where the clock puts it and a dropped frame changes nothing. Nothing here
 * reaches the physics: it is drawn only, so it may use the language's sine.
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

import { worldAt } from './frame.js';
import { TOWERS, TOWER, TYRES } from './landmarks.js';
import { cel, flat } from '../city/vendored/core/toon.js';

/* The physics' rate: a step is a millisecond. */
const STEP_S = 0.001;

/*
 * The plumes, each { at, n, life, rise, drift, r0, r1, c0, c1, spread }:
 * where it starts in the world, how many puffs, how long one lives in
 * seconds, how high it climbs and how far the wind carries it east and
 * south in that time, its radius at birth and at death, and its colour.
 */
function plumes() {
  const out = TOWERS.map((t) => ({
    at: worldAt(t.px, t.py, TOWER.H - 1), n: 14, life: 14, rise: 26, drift: [9, 3], r0: 5, r1: 10.5, c0: 0xffffff, c1: 0xe6e4ee, spread: 3.5,
  }));
  out.push({ at: worldAt(310, 268, 52.5), n: 8, life: 10, rise: 18, drift: [8, 2], r0: 1.4, r1: 4.2, c0: 0xc9c6d2, c1: 0x9a97a6, spread: 0.6 });
  out.push({ at: worldAt(TYRES.px, TYRES.py, TYRES.h), n: 16, life: 11, rise: 34, drift: [6, 2], r0: 1.6, r1: 7.5, c0: 0x2c2a33, c1: 0x6a6674, spread: 1.4 });
  return out;
}

export function makeFx(THREE) {
  const list = plumes();
  const count = list.reduce((a, p) => a + p.n, 0);
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const puffs = new THREE.InstancedMesh(puffGeo, cel({ color: 0xffffff, bands: 3, tint: 0x8a83a8, cache: false }), count);
  puffs.name = 'sunny plumes';
  puffs.castShadow = false;
  puffs.receiveShadow = false;
  puffs.frustumCulled = false;
  /* Each puff's own place in its plume, and its own small lean and size,
   * from a seeded scramble so the plume reads as cloud and not a stack. */
  const each = [];
  let i = 0;
  for (const p of list) {
    for (let k = 0; k < p.n; k += 1) {
      const h = Math.imul(i + 1, 0x9e3779b1) >>> 0;
      each.push({ p, k, ox: ((h & 0xff) / 255 - 0.5) * 2, oz: (((h >>> 8) & 0xff) / 255 - 0.5) * 2, s: 0.8 + ((h >>> 16) & 0xff) / 255 * 0.45 });
      i += 1;
    }
  }
  /* The flames: cones round the pile's top, flickering in turn. */
  const FLAMES = 9;
  const flameGeo = new THREE.ConeGeometry(1, 1, 6, 1);
  flameGeo.translate(0, 0.5, 0);
  const flames = new THREE.InstancedMesh(flameGeo, flat({ color: 0xffffff, cache: false }), FLAMES);
  flames.name = 'sunny fire';
  flames.castShadow = false;
  flames.receiveShadow = false;
  flames.frustumCulled = false;
  const [fx, fy, fz] = worldAt(TYRES.px, TYRES.py, TYRES.h - 0.4);
  const col = new THREE.Color();
  for (let k = 0; k < FLAMES; k += 1) {
    flames.setColorAt(k, col.set(k % 3 === 0 ? 0xffd23c : k % 3 === 1 ? 0xff8a2a : 0xff5a2a));
  }
  flames.instanceColor.needsUpdate = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c0 = new THREE.Color();
  const c1 = new THREE.Color();

  function update(step) {
    const t = step * STEP_S;
    each.forEach((e, j) => {
      const p = e.p;
      const f = (((t / p.life + e.k / p.n) % 1) + 1) % 1;
      const ease = Math.sqrt(f);
      const r = (p.r0 + (p.r1 - p.r0) * ease) * e.s * Math.min(1, (1 - f) * 6, f * 12 + 0.2);
      v.set(
        p.at[0] + p.drift[0] * f + e.ox * p.spread * (0.5 + f),
        p.at[1] + p.rise * ease,
        p.at[2] + p.drift[1] * f + e.oz * p.spread * (0.5 + f),
      );
      sc.set(r, r * 0.86, r);
      m.compose(v, q, sc);
      puffs.setMatrixAt(j, m);
      puffs.setColorAt(j, c0.set(p.c0).lerp(c1.set(p.c1), f));
    });
    puffs.instanceMatrix.needsUpdate = true;
    puffs.instanceColor.needsUpdate = true;
    for (let k = 0; k < FLAMES; k += 1) {
      const a = (k / FLAMES) * Math.PI * 2;
      const rr = k === 0 ? 0 : 1.2 + (k % 2) * 0.6;
      const flick = 0.75 + 0.25 * Math.sin(t * (9 + k) + k * 1.7);
      const hgt = (k === 0 ? 4.2 : 2.4 + (k % 3) * 0.5) * flick;
      v.set(fx + Math.cos(a) * rr, fy, fz + Math.sin(a) * rr);
      sc.set(0.7 + (k % 2) * 0.25, hgt, 0.7 + (k % 2) * 0.25);
      m.compose(v, q, sc);
      flames.setMatrixAt(k, m);
    }
    flames.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { meshes: [puffs, flames], update };
}
