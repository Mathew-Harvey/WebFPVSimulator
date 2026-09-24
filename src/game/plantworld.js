/*
 * plantworld.js: hand the map's solids to the plant, and keep the plant's
 * idea of where it is in the world up to date.
 *
 * Since 2026-09-24 every wall, roof, gate, tree and the train is resolved
 * inside the physics module (src/native/world.c), at 1 kHz, by the same
 * solver as everything else the plant touches. The shell used to sweep the
 * craft through view.colliders every 4 ms and write the answer back; now it
 * uploads view.colliders once, when a map is adopted, and does nothing else
 * with them on the physics path. See PROGRESS.md for the review that led
 * here and for what the old pass got wrong.
 *
 * THE ONE CONVERSION. The colliders are Three.js world metres, Y up. The
 * plant is Z up. Every position crosses through src/render/frame.js's
 * threePosToSim, the same seam every other position uses, so the basis
 * change still lives in exactly one file. The spawn transform crosses as an
 * origin and a yaw, and the module turns the yaw into a rotation with its own
 * fixed libm: no JS Math.sin or Math.cos reaches the physics.
 *
 * The indices matter. world.c numbers shapes in the order they are added,
 * and this adds them in view.colliders' own order, so a contact the module
 * reports against shape i is view.colliders' collider i, and its kind is
 * kindOf(colliders, i). Movers (the train) have their own numbers.
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

import { threePosToSim, threeDirToSim } from '../render/frame.js';
import { contactMaterial } from './collide.js';

const A = { x: 0, y: 0, z: 0 };
const B = { x: 0, y: 0, z: 0 };
const V = { x: 0, y: 0, z: 0 };

/* The kind of collider i, as the name contactMaterial takes. kindName wants
 * the kind's number, not the collider's. */
export function kindOf(colliders, i) {
  return colliders.kindName(colliders.fkind[i]);
}

function need(sim, name) {
  if (typeof sim.e[name] !== 'function') {
    throw new Error(`sim.wasm does not export ${name}`);
  }
}

/*
 * Upload every collider. Returns the number of shapes. Throws if the module
 * refuses one or cannot file the town, because a world the plant does not
 * have is a world the craft flies through, and that must be loud.
 */
export function uploadWorld(sim, colliders) {
  for (const name of ['sim_world_clear', 'sim_world_box', 'sim_world_capsule', 'sim_world_build']) {
    need(sim, name);
  }
  sim.e.sim_world_clear();
  if (!colliders || !colliders.built) {
    sim.e.sim_world_build();
    return 0;
  }
  const n = colliders.count;
  for (let i = 0; i < n; i += 1) {
    const mat = contactMaterial(kindOf(colliders, i));
    threePosToSim(colliders.fax[i], colliders.fay[i], colliders.faz[i], A);
    threePosToSim(colliders.fbx[i], colliders.fby[i], colliders.fbz[i], B);
    let code;
    if (colliders.fbox[i]) {
      code = sim.e.sim_world_box(
        Math.min(A.x, B.x), Math.min(A.y, B.y), Math.min(A.z, B.z),
        Math.max(A.x, B.x), Math.max(A.y, B.y), Math.max(A.z, B.z),
        mat.e, mat.mu,
      );
    } else {
      /* A radius is a length, and threePosToSim scales lengths the way it
       * scales positions: convert (r, 0, 0) and take its size. */
      threePosToSim(colliders.fr[i], 0, 0, V);
      const r = Math.hypot(V.x, V.y, V.z);
      code = sim.e.sim_world_capsule(A.x, A.y, A.z, B.x, B.y, B.z, r, mat.e, mat.mu);
    }
    if (code !== i) {
      throw new Error(`sim_world: collider ${i} (${kindOf(colliders, i)}) was refused: ${code}`);
    }
  }
  const built = sim.e.sim_world_build();
  if (built !== n) {
    throw new Error(`sim_world_build: ${built} for ${n} colliders`);
  }
  return n;
}

/*
 * Where the plant's origin is: the start point, lifted by the spawn's own
 * offset, facing the start yaw. Must follow every move of the spawn (a map,
 * a restart, a recovery), or the world the plant sees is somewhere else.
 */
export function setWorldFrame(sim, startX, startY, startZ, yaw, spawnAlt) {
  need(sim, 'sim_world_frame');
  threePosToSim(startX, startY, startZ, A);
  const code = sim.e.sim_world_frame(A.x, A.y, A.z + spawnAlt, yaw);
  if (code !== 0) {
    throw new Error(`sim_world_frame: ${code}`);
  }
}

/*
 * Seat one moving box, from its centre and half extents in Three.js metres
 * and its velocity in Three.js metres a second. `visible` false parks it.
 * Allocates nothing: it runs every millisecond of the train's life.
 */
export function setMover(sim, m, cx, cy, cz, hx, hy, hz, vx, vy, vz, kind, visible) {
  const mat = contactMaterial(kind);
  if (!visible) {
    sim.e.sim_world_mover(m, 1, 0, 0, 0, 0, 0, 0, 0, 0, mat.e, mat.mu);
    return;
  }
  threePosToSim(cx - hx, cy - hy, cz - hz, A);
  threePosToSim(cx + hx, cy + hy, cz + hz, B);
  threeDirToSim(vx, vy, vz, V);
  sim.e.sim_world_mover(
    m,
    Math.min(A.x, B.x), Math.min(A.y, B.y), Math.min(A.z, B.z),
    Math.max(A.x, B.x), Math.max(A.y, B.y), Math.max(A.z, B.z),
    V.x, V.y, V.z, mat.e, mat.mu,
  );
}

/* A box's vertical extent, in Three.js metres: the plant's z is Three.js y. */
export function setBoxHeight(sim, i, y0, y1) {
  threePosToSim(0, y0, 0, A);
  threePosToSim(0, y1, 0, B);
  sim.e.sim_world_box_z(i, Math.min(A.z, B.z), Math.max(A.z, B.z));
}
