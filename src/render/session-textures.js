/*
 * session-textures.js: the textures a map must not free.
 *
 * The cel gradient ramp is a module level singleton in celmat.js, shared by
 * every cel material in the project INCLUDING the four on the session lived
 * airframe. A map's dispose walks its scene graph and frees every texture it
 * finds, which would free this one out from under the craft. It is its own
 * file because both maps need it and neither should import the other's.
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

import { celRampTexture } from './celmat.js';

export const SESSION_TEXTURES = new Set([celRampTexture()]);
