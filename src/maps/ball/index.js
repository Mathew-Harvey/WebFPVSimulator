/*
 * index.js: Quad Ball, a map and a mini game. The owner's ask of 29 October
 * 2026: "rocket league but with quads". The map is a floodlit arena
 * (./arena.js) built by the built map's pipeline, with nothing in it but
 * the walls, the two goals and the pad. The game on it is
 * src/game/quadball.js, and what it needs of the place is `map.ballGame`.
 *
 * LATENCY: nothing on any other map (this loads only when the map is
 * chosen). Here, a few dozen boxes drawn into the built map's own chunk.
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

import { buildMap as buildBuilt } from '../built/index.js';
import { warmPrograms } from '../../render/warm.js';
import {
  ARENA, ballLayout, drawArena, ballDocument,
} from './arena.js';

export async function buildMap(shell, onProgress, options) {
  const L = ballLayout();
  const extra = {
    el: { id: 'ball', type: 'ball' },
    parts: L.parts,
    padBase: 0,
    draw: (kit) => drawArena(kit),
  };
  const map = await buildBuilt(shell, onProgress, {
    ...(options || {}), document: ballDocument(), extra, sponsorMarks: false,
  });
  /* Its own world: the shell keys the world, the results and the board's
   * refusal by this id. */
  map.id = 'ball';
  map.source = 'ball';
  /* The game, for the shell (syncDogfight in src/main.js). */
  map.ballGame = { arena: ARENA };
  await warmPrograms(shell.renderer, map.scene, shell.camera, map.post.rtScene);
  return map;
}
