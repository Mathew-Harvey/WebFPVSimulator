/*
 * index.js: Dan in a RaceGOW room (./dan.js, ./dandraw.js).
 *
 * src/maps/custom.js imports this only for a course that is one of the
 * RaceGOW tracks, and only when it is built, so no other world and no other
 * track loads a byte of him, his picture included (the owner pays for what
 * is served).
 *
 * WHERE HE STANDS. In a corner of the room, off the mat on the honey
 * boards, a body's width from each wall: the corner is the room's, and the
 * room is the same ten by twelve metres for every RaceGOW track, so he is
 * in the same place on all of them. He faces the middle of the room until
 * there is a quad to watch.
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

import { MICRO_SCALE } from '../../game/track.js';
import { ROOM_WIDTH, ROOM_DEPTH } from '../../trackbuilder/racegow.js';
import { makeDan } from './dandraw.js';

/* True metres in from each wall, then the world's. */
const IN_FROM_WALL = 1.1;
export function danStands() {
  return {
    x: (ROOM_WIDTH / 2 - IN_FROM_WALL) * MICRO_SCALE,
    z: (ROOM_DEPTH / 2 - IN_FROM_WALL) * MICRO_SCALE,
  };
}

/*
 * Dan into a built room map: his group in its scene, his clock on its
 * updateAnim, and `map.judge` for the shell to tell him what happens.
 */
export async function attachDan(shell, map) {
  const p = danStands();
  const dan = makeDan(
    shell.camera,
    () => (shell.quad ? shell.quad.position : null),
    { x: p.x, y: map.height(p.x, p.z), z: p.z },
    MICRO_SCALE,
  );
  map.scene.add(dan.group);
  /* His picture is waited for, so the programs linked before the first
   * frame include his: a shader built the first time he comes into view is
   * a hitch in the pilot's picture. */
  await dan.ready;
  const anim = map.updateAnim;
  map.updateAnim = (step) => {
    anim(step);
    dan.update(step);
  };
  map.judge = { hear: dan.hear };
  const stats = map.stats;
  map.stats = () => ({ ...(stats ? stats() : {}), dan: dan.stats() });
  return dan;
}
