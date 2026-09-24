/*
 * place.js: a freestyle map document, placed in the world. Pure: no
 * Three.js, no DOM, no JS trigonometry.
 *
 * Everything a built map needs to know about where things are comes out of
 * here: each element's world position and heading, the solids the physics
 * will hold, the named gaps, and where the pilot starts. The map
 * (./index.js) draws what this places; the track builder's warnings and
 * scripts/props-check.js read the same answer in Node. One function, so the
 * three cannot disagree about where a building is.
 *
 * THE FRAMES. The document is right handed, Z up, origin at the plot's near
 * left corner (src/trackbuilder/schema.md). The world is Three.js metres, Y
 * up, origin at the plot's middle. The conversion is the one
 * src/game/trackdoc.js makes for race tracks, applied here once:
 *
 *   worldX =  docX - width / 2
 *   worldZ = -(docY - depth / 2)
 *   worldY =  docZ                  the ground is flat, at 0
 *
 * A document yaw is a heading about up, counter clockwise from +x seen from
 * above, and that is exactly Object3D.rotation.y in the world, because the
 * document's +y is the world's -z. An aperture's yaw is its plane normal,
 * and src/props/course.js builds gates with their normal on local +x, so it
 * takes the same number. A heading an asset cannot hold (a building at 40
 * degrees) is snapped by src/props/solids.js placedYaw, for the solids AND
 * the drawing.
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

import { ELEMENTS, KIND } from '../../trackbuilder/elements.js';
import { assetOf, partsOf } from '../../props/catalog.js';
import { placeSolids, placedYaw } from '../../props/solids.js';

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

/* Wrap to (-pi, pi] by adding or subtracting whole turns: arithmetic only. */
function wrap(a) {
  let x = a;
  while (x <= -Math.PI) {
    x += TAU;
  }
  while (x > Math.PI) {
    x -= TAU;
  }
  return x;
}

/*
 * Where a pilot with no start pads starts: eight metres in from the plot's
 * west edge, on its middle line, facing across it.
 */
function defaultSpawn(W) {
  return { x: -W / 2 + 8, z: 0, yaw: -HALF_PI };
}

/*
 * THE SPAWN, from the start pads, in the shell's convention.
 *
 * A pads element's yaw is the way the craft faces, and src/game/trackdoc.js
 * turns it into the shell's spawn heading with
 * headingForTravel(cos yaw, -sin yaw) = atan2(-cos yaw, sin yaw), which is
 * yaw - pi/2 for every yaw. Written as the subtraction, so the heading the
 * physics frame is seated at never passes through JS trigonometry.
 */
function spawnFrom(el, W, D) {
  return {
    x: el.position.x - W / 2,
    z: -(el.position.y - D / 2),
    yaw: wrap(el.yaw - HALF_PI),
  };
}

/*
 * Place a normalized document. Returns
 *
 *   { W, D, items, solids, zones, spawn, stats }
 *
 *   items   [{ el, kind, x, y, z, yaw, turns, parts }]  every drawable
 *           element: yaw is the placed (possibly snapped) world heading
 *   solids  what src/props/solids.js placeSolids makes of every item
 *   zones   [{ el, x, y, z, yaw, w, h, name, points }] the named gaps
 *   spawn   { x, z, yaw } in the shell's convention
 */
export function placeDocument(doc) {
  const W = doc.field.width;
  const D = doc.field.depth;
  const items = [];
  const solids = [];
  const zones = [];
  const stats = { inflated: 0 };
  let spawn = null;
  for (const el of doc.elements) {
    const def = ELEMENTS[el.type];
    if (!def) {
      continue;
    }
    const x = el.position.x - W / 2;
    const z = -(el.position.y - D / 2);
    const y = el.position.z || 0;
    if (def.kind === KIND.START && !spawn) {
      spawn = spawnFrom(el, W, D);
    }
    if (def.kind === KIND.ZONE) {
      zones.push({
        el,
        x,
        y,
        z,
        yaw: el.yaw || 0,
        w: el.dims.width,
        h: el.dims.height,
        name: el.name || 'GAP',
        points: el.points,
      });
      continue;
    }
    const asset = assetOf(el);
    if (!asset) {
      continue;
    }
    const turns = asset.turns ?? 'any';
    const yaw = placedYaw(turns, el.yaw || 0);
    const parts = partsOf(el);
    placeSolids(parts, x, y, z, yaw, turns, solids, stats);
    items.push({ el, kind: def.kind, x, y, z, yaw, turns, parts });
  }
  return { W, D, items, solids, zones, spawn: spawn ?? defaultSpawn(W), stats };
}
