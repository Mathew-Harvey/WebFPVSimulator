/*
 * sea.js: the comic's open water, one plane on one picture, for a map
 * whose sea is a flat plane (Shiokaze Point's first, then the Arctic's).
 *
 * The picture is drawn the way a manga artist inks open sea: a flat tone,
 * long level streaks a shade up and a shade down for the rows of the
 * swell, and on those rows the shallow arcs of ink that say "wave", each
 * with a white glint under it. The crests sit on rows, never scattered,
 * because scattered marks read as something floating and rows read as
 * water. 512 pixels across and tiled every `tile` metres (48 for a pilot
 * low over it), so one view never shows the same patch twice. The plane
 * is cut into cells for the same reason the field's terrain is (the
 * rasteriser's note in ./ground.js). Unlit, so it is the same tone under
 * any light, as a flat tone on a page is, and the fog takes it to the
 * horizon. One draw call; 1 MB of texture memory, nothing per frame.
 *
 * The drift, for a map that moves it: `drift(step)` sets the picture's
 * offset from the map clock's whole step count. The clock hands
 * updateAnim the count, not the steps since the last frame, so the offset
 * is read from the count directly, wrapped at a tile in whole steps; a
 * replay drifts the same and it never loses bits. Summing it as a delta
 * made Shiokaze's sea run faster every frame (the owner, 2026-11-01).
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
import { cel } from '../city/vendored/core/toon.js';

/* Shiokaze's tones: the town's canal blue and its shades. */
export const SEA_TONES = {
  base: '#93b8ce', trough: '#85aac3', sky: '#a9c8d9', ink: '#557592', glint: '#eaf3f7', light: '#d6e7ef',
};

function seaTexture(C, size, tile) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = C.base;
  g.fillRect(0, 0, S, S);
  /* A seeded walk, so the picture is the same on every load. */
  let seed = 0x5e1a;
  const rand = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  /* Everything is drawn three times across and three times down, so a
   * mark that runs off one edge comes back on the other. */
  const wrap = (draw) => {
    for (const dx of [0, S, -S]) {
      for (const dy of [0, S, -S]) {
        draw(dx, dy);
      }
    }
  };
  /* A level sliver, pointed at both ends: the swell's rows. */
  const sliver = (x, y, w, h) => wrap((dx, dy) => {
    g.beginPath();
    g.moveTo(x + dx, y + dy);
    g.quadraticCurveTo(x + dx + w / 2, y + dy - h, x + dx + w, y + dy);
    g.quadraticCurveTo(x + dx + w / 2, y + dy + h * 0.6, x + dx, y + dy);
    g.fill();
  });
  /* The troughs: long darker streaks, a few per row. */
  g.fillStyle = C.trough;
  for (let i = 0; i < 34; i += 1) {
    sliver(rand() * S, rand() * S, 70 + rand() * 150, 2.5 + rand() * 3);
  }
  /* The sky on the faces: long pale streaks. */
  g.fillStyle = C.sky;
  for (let i = 0; i < 26; i += 1) {
    sliver(rand() * S, rand() * S, 50 + rand() * 120, 1.5 + rand() * 2);
  }
  /* The rows the crests sit on, 14 of them, unevenly spaced. */
  const rows = [];
  for (let i = 0; i < 14; i += 1) {
    rows.push((i + 0.2 + rand() * 0.6) * (S / 14));
  }
  /* One crest: a long shallow arc, thick in the middle and thin at the
   * ends, with a thin white glint under it. Two arcs joined at a cusp
   * were tried first and read as gulls from a few metres up. */
  g.lineCap = 'round';
  const crest = (x, y, w, lift) => wrap((dx, dy) => {
    const cx = x + dx;
    const cy = y + dy;
    g.strokeStyle = C.ink;
    for (const [lw, k] of [[0.9, 1], [1.8, 0.55]]) {
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(cx - w * k, cy + lift * (1 - k));
      g.quadraticCurveTo(cx, cy - lift * (1 + k) * 0.5 - lift * 0.5, cx + w * k, cy + lift * (1 - k));
      g.stroke();
    }
    g.strokeStyle = C.glint;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx - w * 0.6, cy + 2.4);
    g.quadraticCurveTo(cx, cy - lift + 2.6, cx + w * 0.5, cy + 2.4);
    g.stroke();
  });
  for (const ry of rows) {
    /* Each row has its crests in loose runs, with open water between. */
    let x = rand() * S;
    const runs = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < runs; k += 1) {
      const n = 1 + Math.floor(rand() * 3);
      for (let j = 0; j < n; j += 1) {
        const w = 12 + rand() * 14;
        crest(x, ry + (rand() - 0.5) * 8, w, 1.5 + rand() * 1.5);
        x += w * 2.2 + 6 + rand() * 18;
      }
      x += 50 + rand() * 120;
    }
  }
  /* Loose glints between the rows, the light on the flat water. */
  g.fillStyle = C.light;
  for (let i = 0; i < 40; i += 1) {
    sliver(rand() * S, rand() * S, 6 + rand() * 14, 1.2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(size / tile, size / tile);
  tex.anisotropy = 4;
  return tex;
}


/*
 * The sea's mesh and its drift: { mesh, drift }. `size` metres square cut
 * in `cells`, at height `y`, the picture tiled every `tile`; `driftMs` the
 * milliseconds it takes to slide one tile along each axis, or null for a
 * sea that holds still.
 */
export function seaMesh({ size, cells, tile = 48, y = 0, tones = SEA_TONES, driftMs = null, name = 'sea', litTint = null }) {
  const tex = seaTexture(tones, size, tile);
  const geo = new THREE.PlaneGeometry(size, size, cells, cells).rotateX(-Math.PI / 2);
  /* `litTint`, for a sea that takes the shadows of what stands in it (the
   * Arctic's cliffs and bergs): the picture on the town's cel material,
   * its shade band that tint. Otherwise unlit. */
  const mat = litTint === null
    ? new THREE.MeshBasicMaterial({ map: tex, fog: true })
    : cel({ color: 0xffffff, tint: litTint, map: tex, cache: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  mesh.name = name;
  mesh.userData.noOutline = true;
  mesh.receiveShadow = litTint !== null;
  const drift = (step) => {
    if (!driftMs) {
      return;
    }
    const n = Math.max(0, Math.floor(step || 0));
    tex.offset.set((n % driftMs[0]) / driftMs[0], (n % driftMs[1]) / driftMs[1]);
  };
  return { mesh, tex, drift };
}
