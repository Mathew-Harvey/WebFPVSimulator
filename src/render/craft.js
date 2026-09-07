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

import { CRAFT_ARM, CRAFT_PROP_R, CRAFT_HULL_R } from '../game/collide.js';
import { buildHeroCraft } from './herocraft.js';
import { buildWhoopCraft } from './whoopcraft.js';
import { airframeById } from '../../configs/airframes.js';

/*
 * The published dimensions of the airframe, in metres. A FUNCTION since the
 * whoop landed, because CRAFT_ARM and CRAFT_PROP_R are live bindings that
 * move with the seated aircraft (see src/game/collide.js) and a frozen
 * object literal would have captured the five inch's numbers at import time
 * and then quietly reported them for a machine a third of the size.
 *
 * Exported so a scale check can assert what the geometry actually measures
 * against what the project claims, rather than against a number typed a
 * second time.
 */
export function craftDims() {
  const dims = airframeById(currentCraftId).dims;
  return {
    bodyLength: dims.bodyLength,
    bodyWidth: dims.bodyWidth,
    bodyHeight: dims.bodyHeight,
    /* Per axis offset of a motor, so the motor sits CRAFT_ARM from the
     * centre on the diagonal. Derived, not typed: src/game/collide.js owns
     * the arm and the prop radius, and plant.c's arm_x is the same
     * CRAFT_ARM / sqrt(2). */
    motorArm: CRAFT_ARM / Math.SQRT2,
    propRadius: CRAFT_PROP_R,
    /* The outermost radius about a motor, which is the blade on a naked
     * airframe and the duct on a ducted one. The sweep is derived from it
     * rather than from the blade, so a scale check reads the hull the
     * collider actually sweeps. */
    hullRadius: CRAFT_HULL_R,
    motorDiagonal: CRAFT_ARM * 2,
    sweepRadius: CRAFT_ARM + CRAFT_HULL_R,
  };
}

/*
 * CRAFT_DIMS stays, as the five inch's numbers, because tests/lib/checks.js
 * imports it by that name and tests/ is not this side's to edit. It is
 * correct for the aircraft the checks fly, which is the default one.
 */
export const CRAFT_DIMS = {
  bodyLength: 0.155,
  bodyWidth: 0.088,
  bodyHeight: 0.034,
  motorArm: 0.110 / Math.SQRT2,
  propRadius: 0.0635,
  hullRadius: 0.0635,
  motorDiagonal: 0.220,
  sweepRadius: 0.1735,
};

/* Which aircraft buildCraft last built. The shell asks for a rebuild by
 * name; this is what craftDims reports against in between. */
let currentCraftId = '5inch';

export function buildCraft(airframeId = '5inch') {
  /*
   * The airframe is MODELLED at its true size and DRAWN at 1/WORLD_SCALE of
   * it, because the world it flies in is WORLD_SCALE times its own scale
   * (src/render/frame.js). That ratio is 1 now, so the drawn craft is a real
   * machine and the group scale is the identity; the seam stays because it
   * is the one place the world's ratio touches the model, and check 15
   * asserts the declared ratio reached it.
   *
   * TWO BUILDERS, NOT ONE WITH A FLAG. A five inch is four arms and four
   * open discs and what you see is the X; a whoop is a moulded tub with four
   * holes in it. They do not share a silhouette, so they do not share a
   * builder. See src/render/whoopcraft.js.
   */
  currentCraftId = airframeById(airframeId).id;
  const build = currentCraftId === 'whoop65' ? buildWhoopCraft : buildHeroCraft;
  return build({
    name: 'craft',
    fog: true,
    worldScale: true,
    measure: true,
  });
}
