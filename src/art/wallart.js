/*
 * wallart.js: the whoop room's posters and banners, hung.
 *
 * The owner asked on 26 September 2026 for the whoop room to be recoloured
 * in the sakura theme and dressed with the slap pack's stickers "as wall
 * art", made into posters and banners. scripts/wallart.js makes the art: one
 * picture, assets/wallart/atlas.webp, and a table of where each piece is in
 * it, src/art/wallart-atlas.js. This hangs it, and HANGING below is the
 * whole of the design decision about where.
 *
 * PAINT, NOT SOLID. Nothing here goes into the collider set, and nothing
 * stands proud of its wall by more than a banner rod's width, 24 mm on a
 * real wall. The walls of this room stand exactly on the edge of the
 * builder's micro field, so anything deeper would stand where an author may
 * already have put a gate, and every published track has to fly exactly as
 * it did before the room was dressed.
 *
 * ONE DRAW. Every piece is a quad cut out of the one atlas, and every quad
 * is in one geometry with one material, so the room's twelve pieces of art
 * cost a single draw call. It is on layer 1, the no ink layer, with no depth
 * write and a polygon offset, which is how the room's floor logos are drawn
 * (roomDecals in src/render/scene.js): a print flat on a wall has no
 * silhouette to ink. The rods are the only relief, and they do ink.
 *
 * LOADED LATE, NEVER FATAL. The picture is fetched by URL from this module's
 * own address, so the board's card renderer, which builds rooms from
 * src/share/orbit.html, finds it too. The art stays hidden until it has
 * decoded; `ready` settles when it has, or when it failed, or after a few
 * seconds, whichever is first, and a picture that arrives later still goes
 * up the moment it does.
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
import { celMaterial } from '../render/celmat.js';

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
 * south; three posters down the east wall; the cut vinyl wordmark between
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
  { piece: 'posterGoggles', wall: 'west', along: -4.0, up: 2.3 },
  { piece: 'wordmark', wall: 'west', along: 0, up: 2.6 },
  { piece: 'posterEma', wall: 'west', along: 4.0, up: 2.3 },
];

/* How long the room waits for the picture before it lets the race start
 * without it, in milliseconds. */
const WAIT_MS = 6000;
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
 * table   WALLART from src/art/wallart-atlas.js
 * room    { halfW, halfD, y0, K }: the room's half width and half depth in
 *         scene metres, its floor height, and MICRO_SCALE
 *
 * Returns { group, ready }, where ready is a promise that settles true when
 * the art is up and false when the room went on without it.
 */
export function hangWallArt(table, room) {
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

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);

  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  /* Lit as the plaster is, with the room's warm rim, so a print sits in the
   * room's light rather than glowing on it. */
  const mat = celMaterial({
    color: 0xffffff, rim: 0.08, rimColor: 0xffe8ec, spec: 0.02,
    transparent: true, map: tex, key: 'wallart',
  });
  mat.depthWrite = false;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  const art = new THREE.Mesh(geo, mat);
  art.name = 'wallArt';
  art.layers.set(1);
  art.visible = false;

  const group = new THREE.Group();
  group.name = 'wallArt';
  group.add(art);
  if (rods.length) {
    /* Bamboo, in the town's own bamboo green, drawn and inked like any
     * other object and in no collider set. */
    const rodMesh = new THREE.Mesh(
      mergeGeometries(rods, false),
      celMaterial({ color: 0x94b06b, rim: 0.18, rimColor: 0xffe8ec, spec: 0.12 }),
    );
    rodMesh.name = 'wallArtRods';
    group.add(rodMesh);
  }

  const img = new Image();
  img.decoding = 'async';
  const ready = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), WAIT_MS);
    img.onload = () => {
      tex.image = img;
      tex.needsUpdate = true;
      art.visible = true;
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      console.warn(`wallart: ${table.url} did not load; the room is bare`);
      clearTimeout(timer);
      resolve(false);
    };
  });
  img.src = new URL(`../../${table.url}?v=${table.rev}`, import.meta.url).href;
  return { group, ready };
}
