/*
 * stageroom.js: the whoop room as the animation export draws it, for stage.js
 * and for nothing else.
 *
 * WHY THIS IS A SECOND DRAWING OF THE ROOM and not a call into
 * src/render/scene.js. The room there is one block inside a function that
 * builds a whole world: a height field, colliders, a baker, the cel kit, the
 * post chain and a loading screen. None of it can be asked for on its own, and
 * a GIF export is a still lit scene with no flight in it. So the shell is
 * drawn again here, from the same numbers (ROOM, the band, the rail, the
 * skirting, the purlin pitch, the lamp panels) and the same art
 * (src/art/wallart-hang.js lays the posters), in plain Three materials.
 * What it shares is what decides how the room LOOKS: the palette, the heights
 * and where every poster hangs. What it does not share is how the world is
 * flown in, and that is the part a picture does not need.
 *
 * IN TRUE METRES. The sim builds the hall MICRO_SCALE times life size so a five
 * inch has space to fly, and says in scene.js that scaling a world and
 * everything in it by one number changes no frame. A track document is in
 * RaceGOW's own metres, 10 by 12 by 4, so this draws the hall at that size and
 * the document's positions land where the author put them.
 *
 * A CUTAWAY, NOT A BOX. The animation looks down on the track from 40 degrees
 * and a few metres out, which is above the ceiling and past the near walls of a
 * room this size. Every wall and the ceiling is a single sided plane that
 * faces into the room, so the ones between the lens and the track are culled
 * and the ones behind it are seen from the inside, with the posters on them.
 * It is a dolls' house, and it is why the shell has no thickness. The ceiling
 * is then only drawn when the lens is under it (see `ceiling` in the return),
 * because from above it would be a lid of purlins across the picture.
 *
 * AUTHORED IN Y UP, centred on the room, and turned into the document's frame
 * by one group at the bottom of roomGroup: rotating a quarter turn about X
 * turns this frame's (x, y, z) into the document's (x, minus z, y), which is
 * the same conversion toScene makes in src/game/trackdoc.js, so the walls
 * stand where the field's edges are.
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

import { ROOM_HEIGHT } from './racegow.js';

/* The sim's room palette (ROOM in src/render/scene.js), kept as the same hex
 * values: pale sakura plaster over a deep green gate band, a dark mat on honey
 * boards, a cream ceiling. The mat is the darkest thing in the picture on
 * purpose, because white pipe on a pale floor does not read. */
export const ROOM_COLOURS = {
  wall: 0xeed5d6,
  wallLow: 0x27332c,
  rail: 0xe8a8b8,
  ceiling: 0xc9beb2,
  joist: 0xd9cabe,
  skirt: 0x1b231e,
  floor: 0x2f2b36,
  floorEdge: 0xc6a887,
  lamp: 0xfffaf2,
  lampFrame: 0xd8d0cb,
};

/* What lies outside the cutaway: the dark of the black stage, with a breath of the town's violet so the cream
 * walls sit on something and not on nothing. */
export const ROOM_SURROUND = 0x15131c;

/* The gate band's top, the rail and the skirting, as scene.js has them. */
const BAND = 1.2;
const RAIL_H = 0.06;
const SKIRT_H = 0.08;
const PURLIN_PITCH = 0.9;
const LAMP_X = 1 / 6;

/*
 * art, when there is any: { table, image, geometry } where table is WALLART from
 * src/art/wallart-atlas.js, image is its decoded atlas and geometry is
 * wallArtGeometry from src/art/wallart-hang.js. animate.js loads
 * both because this is synchronous, and a room whose art did not arrive is
 * drawn bare, as the sim draws it.
 *
 * Returns { group, ceiling, height } where group goes into the document root
 * at the floor, and ceiling is a group the caller shows only when the lens is
 * below `height`.
 */
export function roomGroup(THREE, doc, keep, art = null) {
  const W = Math.max(1, doc.field.width);
  const D = Math.max(1, doc.field.depth);
  const H = ROOM_HEIGHT;
  const halfW = W / 2;
  const halfD = D / 2;

  const std = (colour, extra = {}) => keep(new THREE.MeshStandardMaterial({
    color: colour, roughness: 0.92, metalness: 0, ...extra,
  }));
  const geo = (g) => keep(g);

  /* The shell in Y up, centred on the room. */
  const shell = new THREE.Group();

  const boards = new THREE.Mesh(geo(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2)), std(ROOM_COLOURS.floorEdge));
  boards.receiveShadow = true;
  shell.add(boards);
  const mat = new THREE.Mesh(
    geo(new THREE.PlaneGeometry(W - 0.4, D - 0.4).rotateX(-Math.PI / 2)),
    std(ROOM_COLOURS.floor, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  mat.position.y = 0.002;
  mat.receiveShadow = true;
  shell.add(mat);

  /*
   * ONE WALL: the deep band, the rail, the plaster above it and the skirting,
   * four quads facing into the room. `yaw` turns a plane that faces +z so it
   * faces the room's middle from wherever it stands.
   */
  const wallMat = std(ROOM_COLOURS.wall);
  const lowMat = std(ROOM_COLOURS.wallLow);
  const railMat = std(ROOM_COLOURS.rail);
  const skirtMat = std(ROOM_COLOURS.skirt);
  const wall = (x, z, len, yaw) => {
    const piece = (h, y, material, out = 0) => {
      const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(len, h)), material);
      m.rotation.y = yaw;
      m.position.set(x + Math.sin(yaw) * out, y, z + Math.cos(yaw) * out);
      shell.add(m);
    };
    piece(BAND, BAND / 2, lowMat);
    piece(H - BAND - RAIL_H, BAND + RAIL_H + (H - BAND - RAIL_H) / 2, wallMat);
    /* The rail and the skirting stand a hair proud of the plaster so they do not fight it for depth. */
    piece(RAIL_H, BAND + RAIL_H / 2, railMat, 0.004);
    piece(SKIRT_H, SKIRT_H / 2, skirtMat, 0.004);
  };
  /* North is -z in this frame, so its wall faces +z (yaw 0); the rest follow. */
  wall(0, -halfD, W, 0);
  wall(0, halfD, W, Math.PI);
  wall(-halfW, 0, D, Math.PI / 2);
  wall(halfW, 0, D, -Math.PI / 2);

  /*
   * The ceiling, its purlins and its light panels, in a group of their own
   * because they are only there when the lens is inside the room. The plane
   * faces down, so from above it is culled whatever the group's flag says.
   */
  const ceiling = new THREE.Group();
  const lid = new THREE.Mesh(
    geo(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2)),
    keep(new THREE.MeshBasicMaterial({ color: ROOM_COLOURS.ceiling })),
  );
  lid.position.y = H;
  ceiling.add(lid);
  const purlins = Math.max(3, Math.round(D / PURLIN_PITCH));
  const bay = D / purlins;
  const joistMat = std(ROOM_COLOURS.joist);
  const purlinD = 0.14;
  const joistGeo = geo(new THREE.BoxGeometry(W, purlinD, 0.055));
  for (let i = 0; i < purlins; i += 1) {
    const joist = new THREE.Mesh(joistGeo, joistMat);
    joist.position.set(0, H - purlinD / 2 - 0.001, -halfD + (i + 0.5) * bay);
    ceiling.add(joist);
  }
  const lampMat = keep(new THREE.MeshBasicMaterial({ color: ROOM_COLOURS.lamp }));
  const frameMat = keep(new THREE.MeshBasicMaterial({ color: ROOM_COLOURS.lampFrame }));
  const frameGeo = geo(new THREE.PlaneGeometry(1.28, 0.38).rotateX(Math.PI / 2));
  const panelGeo = geo(new THREE.PlaneGeometry(1.2, 0.3).rotateX(Math.PI / 2));
  for (let k = 1; k < purlins / 2; k += 2) {
    for (const fz of [-halfD + k * bay, halfD - k * bay]) {
      for (const fx of [-W * LAMP_X, W * LAMP_X]) {
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.set(fx, H - 0.003, fz);
        ceiling.add(frame);
        const panel = new THREE.Mesh(panelGeo, lampMat);
        panel.position.set(fx, H - 0.006, fz);
        ceiling.add(panel);
      }
    }
  }
  shell.add(ceiling);

  /* The posters and banners, laid where the sim hangs them. */
  if (art && art.table && art.image && art.geometry) {
    const hung = art.geometry(art.table, { halfW, halfD, y0: 0, K: 1 });
    const tex = keep(new THREE.Texture(art.image));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    const printed = new THREE.Mesh(geo(hung.art), keep(new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })));
    printed.renderOrder = 1;
    shell.add(printed);
    /* No rods: a banner's rod is a solid cylinder and is not culled with its wall, so from outside the room the
     * near wall's rod hangs in the air across the picture. The banners hang bare, which at this size is the same. */
  }

  /* Y up, centred, into the document's Z up frame with the room's corner at the origin. */
  const group = new THREE.Group();
  shell.rotation.x = Math.PI / 2;
  shell.position.set(halfW, halfD, 0);
  group.add(shell);
  return { group, ceiling, height: H };
}
