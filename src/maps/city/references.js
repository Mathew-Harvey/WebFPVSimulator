/*
 * references.js: measuring the town against things that have a real size.
 *
 * WHY THIS EXISTS. This project has shipped a scale error before, and every
 * number in its cost ledger stayed correct while it did: grass blades were
 * 0.26 to 0.68 m, which made a 1.524 m regulation gate vanish from frame, and
 * nothing in the harness noticed because nothing in the harness knew how tall
 * a blade of grass is. A budget cannot catch a scale error. Only a reference
 * object can.
 *
 * The trap here is the opposite of the grass one. The town is authored for a
 * walker with a 1.7 m eye, so everything in it is correctly sized for a
 * person and therefore genuinely enormous next to a 0.220 m quad. A doorway
 * that is four times the craft's width is not a bug, it is a doorway. So
 * these measurements hunt for what is ABSOLUTELY wrong, against sizes a tape
 * measure would give in a real Japanese suburb, and not for what merely looks
 * big from a quad's camera.
 *
 * EVERY NUMBER HERE IS MEASURED FROM THE BUILT WORLD, NOT READ OFF A
 * CONSTANT. A constant that agrees with itself proves nothing. The kerb comes
 * from the town's own height query, so it is the surface the craft will
 * actually land on; the handrail comes from the collider list, so it is the
 * thing the craft will actually hit; the doorway comes from the geometry, so
 * it is what is drawn. If any of the three drifted from the others the check
 * would catch it, which a shared constant could not.
 *
 * This must run BEFORE src/maps/city/bake.js, because the merge applies each
 * instance's matrix into its vertices and a merged door is anonymous floats.
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

/* The door material's colour, from the town's own buildings.js:
 * `M.door = cel({ color: 0x8a6f5c, ... })`. cel() caches by parameter
 * signature, so every front door in the town shares one material instance and
 * the colour identifies it. */
const DOOR_COLOR = 0x8a6f5c;

/* A railing's collider is 0.18 m across, from ground.js:
 * `ctx.collide(from, o.at - 0.09, to, o.at + 0.09, y + h)`. Long, thin, and
 * that width is unique to a railing in this town. */
const RAIL_COLLIDER_WIDTH = 0.18;
const RAIL_COLLIDER_MIN_LENGTH = 2.0;

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) * 0.5;
}

export function cityReferences(world) {
  const out = {};

  /*
   * KERB. Measured as the step the town's own height query returns between
   * the carriageway and the footway beside it, at four points down the
   * street, which is exactly the surface a quad lands on. Sampled from far
   * below so the query returns the made ground rather than a roof.
   *
   * A real Japanese residential kerb is 0.10 to 0.20 m.
   */
  const kerbs = [];
  for (const z of [-20, -8, 8, 20]) {
    /* The road is 3.15 m of half width and the footway 1.55 m beyond it, so
     * a metre inside each is comfortably clear of the kerb face itself. */
    const road = world.heightAt(-2.0, z, -1000);
    const walk = world.heightAt(-4.0, z, -1000);
    kerbs.push(walk - road);
  }
  out.kerbHeight = { measured: median(kerbs), samples: kerbs, unit: 'm', real: '0.10 to 0.20' };

  /*
   * DOORWAY. The world bounding box height of every mesh drawn with the front
   * door material, taken as a median because a town has porches, shutters and
   * shop entrances of different sizes and one outlier should not carry the
   * measurement.
   *
   * A real Japanese residential entrance door is 1.90 to 2.10 m.
   */
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const doorHeights = [];
  const doorWidths = [];
  world.root.updateMatrixWorld(true);
  world.root.traverse((o) => {
    if (!o.isMesh || !o.material || o.isInstancedMesh) {
      return;
    }
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m.color || m.color.getHex() !== DOOR_COLOR) {
      return;
    }
    box.setFromObject(o);
    if (box.isEmpty()) {
      return;
    }
    box.getSize(size);
    /* A door mesh is taller than it is thick and taller than it is wide. */
    if (size.y < 1.0 || size.y > 3.5) {
      return;
    }
    doorHeights.push(size.y);
    doorWidths.push(Math.max(size.x, size.z));
  });
  out.doorwayHeight = {
    measured: median(doorHeights),
    count: doorHeights.length,
    unit: 'm',
    real: '1.90 to 2.10',
  };
  out.doorwayWidth = {
    measured: median(doorWidths),
    count: doorWidths.length,
    unit: 'm',
    real: '0.75 to 1.70',
  };

  /*
   * HANDRAIL. Measured off the collider list, which is what a quad actually
   * hits, as the top of every long thin 0.18 m wide barrier above the ground
   * under it. Bridges, quaysides, terraces and the school approach all carry
   * one.
   *
   * A real handrail is 0.85 to 1.20 m above the walking surface.
   */
  const rails = [];
  for (const c of world.colliders) {
    if (c.top === undefined) {
      continue;
    }
    const dx = c.x1 - c.x0;
    const dz = c.z1 - c.z0;
    const thin = Math.min(dx, dz);
    const long = Math.max(dx, dz);
    if (Math.abs(thin - RAIL_COLLIDER_WIDTH) > 1e-6 || long < RAIL_COLLIDER_MIN_LENGTH) {
      continue;
    }
    const cx = (c.x0 + c.x1) * 0.5;
    const cz = (c.z0 + c.z1) * 0.5;
    const ground = world.heightAt(cx, cz, -1000);
    const h = c.top - ground;
    if (h > 0.4 && h < 2.0) {
      rails.push(h);
    }
  }
  out.handrailHeight = {
    measured: median(rails),
    count: rails.length,
    unit: 'm',
    real: '0.85 to 1.20',
  };

  /*
   * LEVEL CROSSING BOOM. Not one of the three the brief asks for, but it is
   * the one reference object a quad can fly UNDER, and its height is what
   * src/maps/city/animation.js gives the boom collider. If the two ever
   * disagree the barrier stops matching the thing on screen.
   *
   * A real Japanese crossing boom sits 1.00 to 1.40 m above the road.
   */
  let boom = null;
  if (world.crossing && world.crossing.arms && world.crossing.arms.length) {
    const p = new THREE.Vector3();
    world.crossing.arms[0].pivot.getWorldPosition(p);
    boom = p.y - world.heightAt(p.x, p.z, -1000);
  }
  out.crossingBoomHeight = { measured: boom, unit: 'm', real: '1.00 to 1.40' };

  return out;
}
