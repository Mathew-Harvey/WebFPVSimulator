/*
 * wallart-hang.js: where the whoop room's posters and banners hang, and the
 * quads and rods that hang them. Geometry only.
 *
 * HANGING is the whole of the design decision about where, and it used to
 * live in ./wallart.js with the rest. It is here, on its own, because the
 * front door draws the same room in its whoop act and has to hang the same
 * art in the same places, and ./wallart.js cannot go there: it lights the
 * art with ../render/celmat.js, and the front door has its own port of that
 * file, which patches the same three.js shader chunk at import. Two patches
 * of one chunk is one too many, so the front door copies this module and
 * the atlas table, and lights the art with its own port. Nothing in this
 * file makes a material, fetches a picture or knows about a layer, which is
 * what lets it be shared. See the front door's src/room.js.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * WHERE EACH PIECE HANGS, in the room RaceGOW would recognise: true metres,
 * before MICRO_SCALE, on a 10 m wide, 12 m deep, 4 m high hall.
 *
 *   wall    which wall, by the scene's frame: north is -z, east is +x
 *   along   metres from the middle of the wall, to the right of a person
 *           standing in the room facing it
 *   up      the height of the piece's centre above the floor
 *   rod     hung from a rod along its top edge, which a banner is
 *
 * The composition, wall by wall: a banner high in the middle of each short
 * wall, flanked by two posters on the north wall and two nobori on the
 * south; three posters down the east wall with weBLEEDfpv's sign (the USA micro partner) between the middle one and the last; the cut vinyl wordmark between
 * two posters on the west wall. Every poster's centre is at the same
 * height, 2.3 m, and every one is clear of the rail at 1.26 m by more than
 * a hand's width, so the gate band below the rail stays bare and dark.
 */
export const HANGING = [
  { piece: 'bannerVisor', wall: 'north', along: 0, up: 3.15, rod: true },
  { piece: 'posterChibi', wall: 'north', along: -3.4, up: 2.3 },
  { piece: 'posterBubble', wall: 'north', along: 3.4, up: 2.3 },
  { piece: 'bannerWave', wall: 'south', along: 0, up: 3.15, rod: true },
  { piece: 'nobori', wall: 'south', along: -3.4, up: 2.35, rod: true },
  { piece: 'nobori', wall: 'south', along: 3.4, up: 2.35, rod: true },
  { piece: 'posterCity', wall: 'east', along: -3.8, up: 2.3 },
  { piece: 'posterPilot', wall: 'east', along: 0, up: 2.3 },
  { piece: 'posterSea', wall: 'east', along: 3.8, up: 2.3 },
  { piece: 'partnerWebleed', wall: 'east', along: 1.9, up: 2.3 },
  { piece: 'posterGoggles', wall: 'west', along: -4.0, up: 2.3 },
  { piece: 'wordmark', wall: 'west', along: 0, up: 2.6 },
  { piece: 'posterEma', wall: 'west', along: 4.0, up: 2.3 },
];

/* A print's gap off the plaster and a rod's radius, in true metres. */
const GAP = 0.003;
const ROD_R = 0.012;

/* Each wall as a frame: where its middle is, which way is right for a
 * person facing it, and which way its face looks, into the room. */
function wallFrame(wall, halfW, halfD) {
  switch (wall) {
    case 'north': return { x: 0, z: -halfD, rx: 1, rz: 0, nx: 0, nz: 1 };
    case 'south': return { x: 0, z: halfD, rx: -1, rz: 0, nx: 0, nz: -1 };
    case 'east': return { x: halfW, z: 0, rx: 0, rz: 1, nx: -1, nz: 0 };
    case 'west': return { x: -halfW, z: 0, rx: 0, rz: -1, nx: 1, nz: 0 };
    default: throw new Error(`wallart: no wall called ${wall}`);
  }
}

/*
 * table   WALLART from ./wallart-atlas.js
 * room    { halfW, halfD, y0, K }: the room's half width and half depth in
 *         the caller's metres, its floor height, and the factor every true
 *         metre above is multiplied by (MICRO_SCALE in the simulator, one
 *         on a page that builds the room life size)
 *
 * Returns { art, rods }: art is one geometry holding a quad for every piece,
 * with positions, normals and uvs into the atlas; rods is the banners' rods
 * merged into one geometry, or null when nothing hangs from a rod.
 */
export function wallArtGeometry(table, room) {
  const { halfW, halfD, y0, K } = room;
  const S = table.size;
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const rods = [];
  for (const h of HANGING) {
    const p = table.pieces[h.piece];
    if (!p) {
      throw new Error(`wallart: the atlas has no piece called ${h.piece}`);
    }
    const f = wallFrame(h.wall, halfW, halfD);
    /* Width from the print, height from the pixels, so a quad can never be
     * a different shape from the picture on it. */
    const w = p.printW * K;
    const ht = (w * p.h) / p.w;
    const cx = f.x + f.rx * h.along * K + f.nx * GAP * K;
    const cz = f.z + f.rz * h.along * K + f.nz * GAP * K;
    const cy = y0 + h.up * K;
    const base = pos.length / 3;
    /* Top left, top right, bottom left, bottom right, as a viewer in the
     * room sees them, wound counter clockwise from the room side. */
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      pos.push(cx + f.rx * sx * w * 0.5, cy + sy * ht * 0.5, cz + f.rz * sx * w * 0.5);
      nor.push(f.nx, 0, f.nz);
    }
    const u0 = p.x / S;
    const u1 = (p.x + p.w) / S;
    const vTop = 1 - p.y / S;
    const vBot = 1 - (p.y + p.h) / S;
    uv.push(u0, vTop, u1, vTop, u0, vBot, u1, vBot);
    idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    if (h.rod) {
      const len = w + 0.08 * K;
      const rod = new THREE.CylinderGeometry(ROD_R * K, ROD_R * K, len, 10);
      /* A cylinder stands up the y axis; lay it along the wall. */
      if (f.rx !== 0) {
        rod.rotateZ(Math.PI * 0.5);
      } else {
        rod.rotateX(Math.PI * 0.5);
      }
      rod.translate(
        f.x + f.rx * h.along * K + f.nx * ROD_R * K,
        cy + ht * 0.5 + ROD_R * K * 0.6,
        f.z + f.rz * h.along * K + f.nz * ROD_R * K,
      );
      rods.push(rod);
    }
  }

  const art = new THREE.BufferGeometry();
  art.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  art.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  art.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  art.setIndex(idx);
  return { art, rods: rods.length ? mergeGeometries(rods, false) : null };
}
