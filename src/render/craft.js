/*
 * craft.js: the quad's model, and nothing else.
 *
 * It lives on its own because it is SESSION LIVED and the maps are not. The
 * shell builds one craft at boot and re-parents it into whichever map's scene
 * is active, so swapping the race field for the freestyle city does not
 * rebuild the airframe, does not recompile its four cel materials, and cannot
 * leave the shell holding a craft that belongs to a disposed scene.
 *
 * Betaflight motor order is RR FR RL FL with the front at -z, and the numbers
 * here are a real 5 inch machine: a 0.155 m body front to back, motors at
 * 0.0778 m on each axis which is a 0.220 m motor to motor diagonal, and
 * 0.0635 m prop discs which is half of five inches. src/game/collide.js
 * derives CRAFT_R from the same measurements and tests/lib/checks.js asserts
 * the two agree, because this project has shipped a scale error before.
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
import { celMaterial, outlineHull } from './celmat.js';
import { CRAFT_ARM, CRAFT_PROP_R } from '../game/collide.js';
import { WORLD_SCALE } from './frame.js';

/*
 * The published dimensions of the airframe, in metres. Exported so a scale
 * check can assert what the geometry actually measures against what the
 * project claims, rather than against a number typed a second time.
 */
export const CRAFT_DIMS = {
  bodyLength: 0.155,
  bodyWidth: 0.088,
  bodyHeight: 0.034,
  /* Per axis offset of a motor, so the motor sits CRAFT_ARM from the centre
   * on the diagonal. Derived, not typed: src/game/collide.js owns the arm and
   * the prop radius, and plant.c's arm_x is the same 0.110 / sqrt(2). */
  motorArm: CRAFT_ARM / Math.SQRT2,
  propRadius: CRAFT_PROP_R,
  motorDiagonal: CRAFT_ARM * 2,
  sweepRadius: CRAFT_ARM + CRAFT_PROP_R,
};

export function buildCraft() {
  const group = new THREE.Group();
  group.name = 'craft';
  /*
   * The airframe is MODELLED at its true size below and DRAWN a quarter
   * smaller, because the world it flies in is WORLD_SCALE times its own scale
   * (src/render/frame.js). Every dimension in CRAFT_DIMS stays a real 5 inch
   * machine's, which is what plant.c flies and what check 15 bands, and the
   * single group scale is the one place the world's ratio touches the model.
   *
   * It has to be a group scale rather than smaller numbers in the geometry:
   * the numbers ARE the airframe, they are shared with the collision radius
   * and the plant, and a model quietly built at 0.8 of a 5 inch quad is the
   * undeclared scale error this project has already shipped once. The scale
   * sits on the transform where it is visible, measurable through the world
   * matrix, and reversible by one constant.
   */
  group.scale.setScalar(1 / WORLD_SCALE);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(CRAFT_DIMS.bodyWidth, CRAFT_DIMS.bodyHeight, CRAFT_DIMS.bodyLength),
    celMaterial({ color: 0x272d38, rim: 0.28, spec: 0.35, specWidth: 0.02 }),
  );
  body.castShadow = true;
  outlineHull(body, 1.13);
  group.add(body);

  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.05, 0.08, 4),
    celMaterial({ color: 0xe8503a, rim: 0.28, spec: 0.4 }),
  );
  canopy.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
  canopy.position.set(0, 0.03, -0.048);
  canopy.castShadow = true;
  outlineHull(canopy, 1.1);
  group.add(canopy);

  const a = CRAFT_DIMS.motorArm;
  const motorXZ = [
    [a, a],
    [a, -a],
    [-a, a],
    [-a, -a],
  ];
  const armMat = celMaterial({ color: 0x333b47, rim: 0.26 });
  const bellMat = celMaterial({ color: 0xa6aeb8, rim: 0.28, spec: 0.5 });
  const discs = [];
  const look = new THREE.Vector3();
  for (let m = 0; m < 4; m += 1) {
    const [mx, mz] = motorXZ[m];
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.015, 0.115), armMat);
    arm.position.set(mx / 2, 0, mz / 2);
    arm.lookAt(look.set(mx, 0, mz));
    arm.castShadow = true;
    outlineHull(arm, 1.1);
    group.add(arm);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.024, 8), bellMat);
    bell.position.set(mx, 0.018, mz);
    bell.castShadow = true;
    group.add(bell);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(CRAFT_DIMS.propRadius, CRAFT_DIMS.propRadius, 0.004, 22),
      new THREE.MeshBasicMaterial({
        color: mz < 0 ? 0xff8a63 : 0x39404a,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        fog: true,
      }),
    );
    disc.position.set(mx, 0.032, mz);
    group.add(disc);
    discs.push(disc);
  }

  return { group, discs };
}
