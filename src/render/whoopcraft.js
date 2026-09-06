/*
 * whoopcraft.js: the 65 mm ducted whoop's model, and nothing else.
 *
 * Its own file rather than a branch inside herocraft.js because the two
 * aircraft do not share a silhouette. A 5 inch is four arms and four open
 * discs: what you see is the X. A whoop is a SOLID, a moulded tub with four
 * holes in it, and the ducts are the outermost thing on it in every
 * direction, which is why it survives hitting a wall and why it flies badly
 * sideways. Trying to draw both from one parameterised builder would have
 * meant a builder with two of everything and a boolean, and the file would
 * have belonged to neither machine.
 *
 * The subject is a BetaFPV Air65 II Champion, which is the aircraft
 * src/native/plant.c flies as SIM_AIRFRAME_WHOOP65 and the one a RaceGOW
 * field mostly turns up on. Real dimensions throughout:
 *
 *   wheelbase       65 mm motor to motor across the diagonal
 *   duct bore       33 mm, a 31 mm Gemfan 1207 three blade with a 1 mm gap
 *   duct           a short shroud with a raised bumper hoop over the lip
 *   stack          a Matrix 1S 5IN1 II with a C03 in a cage at the front
 *   pack            a LAVA II 1S 280 mAh on a BT2.0 pigtail, under the belly
 *   all up          23.4 g
 *
 * IT IS SOLD BARE AND IT IS DRAWN BARE. An earlier pass put a sakura dome
 * over the electronics, which is the Meteor's shape and not this one, and on
 * a 65 mm aircraft it was a third of the machine in one flat colour: at any
 * distance the whoop read as a pink blob. An Air65 II has no canopy at all.
 * The board is the top of the aircraft, you look straight down at the green,
 * the chips and the motor leads, and the only tall thing on it is the camera.
 *
 * So the project's palette lands differently here from herocraft.js, on
 * purpose: the frame is the light cool grey the moulding really is, the stack
 * is the green every flight controller is, and sakura is one trim line on the
 * camera cage with mint on the lamps. A pilot who switched aircraft is
 * looking at the same furniture, on the machine that owns it.
 *
 * The contract with the shell is herocraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin. src/render/shell.js
 * and src/main.js do not learn that there are two aircraft.
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
import { celMaterial, outlineHull } from './celmat.js';
import { WORLD_SCALE } from './frame.js';
import { PROP_SPIN } from './herocraft.js';

/*
 * Every dimension in metres, from the aircraft. Named rather than inlined
 * because a whoop is small enough that a stray millimetre is five percent of
 * something, and because configs/airframes.js and src/game/collide.js quote
 * the same two numbers and the three must not drift.
 */
const ARM = 0.0325;          /* motor centre from airframe centre */
const MOTOR_ARM = ARM / Math.SQRT2; /* per axis, the motors sit on the diagonals */
const PROP_R = 0.0155;       /* 31 mm Gemfan 1207 three blade */
const DUCT_BORE = 0.0165;    /* 33 mm bore, so a 1 mm tip gap */
const DUCT_WALL = 0.0016;    /* the moulded PP wall, thin and it shows */
const DUCT_TOP = 0.0055;     /* duct lip above the CG */
const ROTOR_Y = 0.0035;      /* the disc sits just under the lip */
/* Where the cell's top face is, which is what the belly straps lie on. The
 * pack is the lowest thing on the aircraft and src/native/plant.c's
 * hull_hz_down, 10 mm, is measured to its underside. */
const PACK_TOP = -0.0036;

/*
 * The camera mount, in the Three.js craft frame, and it is NOT
 * lens.js's CAMERA_MOUNT_FORWARD / CAMERA_MOUNT_UP.
 *
 * Those two are the 5 inch's, 80 mm forward and 18 mm up, which on a machine
 * 72 mm long end to end would put the lens a body length in front of the
 * aircraft. The Air65 II carries the C03 at the front of its stack, so
 * this is 24 mm forward and 12 mm up, which is the same pair
 * src/native/plant.c gives the whoop as camera_x and camera_z. The two are
 * the same point and they agree on purpose: the collision code projects that
 * point against the ground so a nose down arrival does not park the lens
 * under the floor.
 */
export const WHOOP_MOUNT_FORWARD = 0.024;
export const WHOOP_MOUNT_UP = 0.012;

function bake(geo, x, y, z, rx, ry, rz) {
  const g = geo.clone();
  if (rx) {
    g.rotateX(rx);
  }
  if (ry) {
    g.rotateY(ry);
  }
  if (rz) {
    g.rotateZ(rz);
  }
  g.translate(x, y, z);
  return g;
}

/*
 * A GF1207 blade. Three of them, and they are a different shape from a 5
 * inch's: far lower pitch (0.7 inch against 4.3), much wider chord for the
 * radius, and a blunt tip, because at a chord Reynolds number near 10,700
 * a slender high aspect blade simply stops working. That is the same fact
 * that puts this rotor's figure of merit at 0.33 against a 5 inch triblade's
 * 0.52, and it is visible in the silhouette.
 */
function whoopBlade(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0011, 0.0022);
  s.bezierCurveTo(0.0052, -0.0026, 0.0058, -r * 0.46, 0.0022, -r * 0.93);
  s.lineTo(-0.0019, -r * 0.90);
  s.bezierCurveTo(-0.0052, -r * 0.42, -0.0034, -0.0022, -0.0007, 0.0022);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.0007,
    bevelEnabled: false,
    curveSegments: segments,
  });
}

/*
 * The duct, as a lathe. A whoop duct is not a cylinder: it has a rounded
 * inlet lip on top, a straight throat, and a slight diffuser flare at the
 * exit. All three are load bearing on the real aircraft, and the first one
 * is the one the physics cares about most: src/native/plant.c's k_duct_lip
 * models the suction peak that rounded lip carries in edgewise flow, which
 * is why a ducted machine pitches up when it flies forward.
 */
function ductLathe(segments) {
  const ri = DUCT_BORE;
  const ro = DUCT_BORE + DUCT_WALL;
  const pts = [
    /*
     * The wall is OPEN at the bottom, and that is the change that made the
     * model stop looking like four cans. A real Air65 duct is a short
     * shroud around the top two thirds of the disc with the exit standing
     * clear, so from any angle below the horizon you see straight through
     * the aircraft and out the other side. The earlier profile ran the wall
     * all the way to a closed skirt, which is a tub, and read as solid.
     *
     * The wall starts a little over a millimetre under the disc and rises
     * to the rounded inlet lip. That lip is the part the physics cares
     * about most: src/native/plant.c's k_duct_lip models the suction peak
     * it carries in edgewise flow, which is why a ducted machine pitches
     * up when it flies forward.
     */
    new THREE.Vector2(ro - 0.0004, ROTOR_Y - 0.0052),
    new THREE.Vector2(ro, ROTOR_Y - 0.0042),
    new THREE.Vector2(ro, DUCT_TOP - 0.0014),
    /* the rounded inlet lip */
    new THREE.Vector2(ro - 0.0003, DUCT_TOP - 0.0003),
    new THREE.Vector2(ro - 0.0011, DUCT_TOP),
    new THREE.Vector2(ri + 0.0005, DUCT_TOP - 0.0005),
    /* down the throat, to the open exit */
    new THREE.Vector2(ri, DUCT_TOP - 0.0016),
    new THREE.Vector2(ri, ROTOR_Y - 0.0040),
    new THREE.Vector2(ri + 0.0006, ROTOR_Y - 0.0052),
  ];
  return new THREE.LatheGeometry(pts, segments);
}

export function buildWhoopCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'whoop-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const hull = (mesh, t, c) => {
    if (inkOn) {
      outlineHull(mesh, t, c);
    }
    return mesh;
  };
  const seg = lite ? 14 : 28;

  /*
   * THE PALETTE, AND WHY THE FRAME IS NOT THE FIVE INCH'S CARBON.
   *
   * A five inch's frame is carbon plate and reads as near black correctly.
   * An Air65 II's is injection moulded polypropylene in a light cool grey,
   * and on this aircraft the ducts ARE the aircraft: they are most of what
   * you see from every angle. Drawn dark, the whole machine was a silhouette
   * with a pink dome floating in the middle of it, which is not the product.
   * So the tub is the grey it really is, the stack under it is the green
   * every flight controller is, and the project's sakura and mint stay where
   * they belong: a chrome accent and a live lamp.
   */
  const frame = cel({ color: 0xb6bec2, rim: 0.34, spec: 0.30, specWidth: 0.016 });
  const pcb = cel({ color: 0x243c2c, rim: 0.20, spec: 0.24 });
  const pcbTop = cel({ color: 0x1b2c22, rim: 0.18, spec: 0.20 });
  const chip = cel({ color: 0x14181a, rim: 0.22, spec: 0.30 });
  const solder = cel({ color: 0xc8cdd0, rim: 0.30, spec: 0.62, specWidth: 0.020 });
  const bell = cel({ color: 0xd6dade, rim: 0.32, spec: 0.74, specWidth: 0.022 });
  const stator = cel({ color: 0x30383c, rim: 0.24, spec: 0.22 });
  const camBody = cel({ color: 0x171b1e, rim: 0.28, spec: 0.36 });
  const camTrim = cel({ color: 0xe8a8b8, rim: 0.40, spec: 0.44, specWidth: 0.016 });
  const lens = cel({
    color: 0x0d1114,
    rim: 0.40,
    spec: 0.95,
    specWidth: 0.03,
    specColor: 0xf3ead4,
    side: THREE.DoubleSide,
  });
  const battery = cel({ color: 0x161c18, rim: 0.22, spec: 0.16 });
  const label = cel({ color: 0xe8dcc0, rim: 0.24, spec: 0.28 });
  const wireRed = cel({ color: 0xc0483c, rim: 0.26, spec: 0.24 });
  const hubMat = cel({ color: 0x161c18, rim: 0.22, spec: 0.25 });
  /*
   * THE BLADES ARE CLEAR, not coloured, because a Gemfan 1207 is moulded in
   * unpigmented polycarbonate and on the real aircraft you look straight
   * through the disc at the duct wall behind it. Front and rear still differ,
   * because a pilot has to be able to tell which way the thing is facing when
   * it is 15 m away and 65 mm across, so the difference is a tint in the
   * clear rather than two solid colours.
   */
  const propFront = cel({
    color: 0xf4e2e8, rim: 0.34, spec: 0.72, specWidth: 0.022, transparent: true, opacity: 0.88,
  });
  const propRear = cel({
    color: 0xe8f0f2, rim: 0.32, spec: 0.68, specWidth: 0.022, transparent: true, opacity: 0.84,
  });
  const antenna = cel({ color: 0x1a1f22, rim: 0.22 });
  const ink = 0x0c120e;

  const a = MOTOR_ARM;
  const motors = [
    [a, a],
    [a, -a],
    [-a, a],
    [-a, -a],
  ];

  const dummy = new THREE.Object3D();

  /*
   * The measurement box, hidden, on the same contract herocraft.js has with
   * check 15: a direct child BoxGeometry whose depth is the published body
   * length. A whoop is as wide as it is long because the ducts define both.
   */
  if (opts.measure) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.028, 0.072), frame);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /*
   * THE TUB. The four ducts and the webbing between them, merged into one
   * mesh, because on a real whoop they are one injection moulding and
   * drawing them as separate parts would read as a quad with hoops cable
   * tied to it, which is the 2018 aircraft this project is deliberately not
   * modelling.
   */
  {
    const parts = [];
    const duct = ductLathe(seg);
    for (const [mx, mz] of motors) {
      parts.push(bake(duct, mx, 0, mz));
    }
    /*
     * THE WEBS sit at the LIP, not at the ducts' mid height. An earlier pass
     * put them halfway down, which is INSIDE the ducts, so from every angle a
     * pilot ever sees the aircraft from it read as four separate cans
     * standing near each other. A whoop is one moulding and has to look like
     * one: the ducts are joined across their tops by flat braces and the
     * centre of the X is a plate the stack bolts through.
     */
    const webY = DUCT_TOP - 0.0020;
    const webH = 0.0021;
    const span = a * 2;
    const webGeo = new THREE.BoxGeometry(0.0042, webH, span - 0.0110);
    parts.push(bake(webGeo, a, webY, 0));
    parts.push(bake(webGeo, -a, webY, 0));
    parts.push(bake(webGeo, 0, webY, a, 0, Math.PI / 2, 0));
    parts.push(bake(webGeo, 0, webY, -a, 0, Math.PI / 2, 0));
    /* The diagonals, corner to corner through the middle. These are what
     * make the four holes read as holes in one part rather than as gaps
     * between four parts. */
    const diagLen = a * 2 * Math.SQRT2 - 0.0150;
    const diagGeo = new THREE.BoxGeometry(0.0038, webH, diagLen);
    parts.push(bake(diagGeo, 0, webY, 0, 0, Math.PI / 4, 0));
    parts.push(bake(diagGeo, 0, webY, 0, 0, -Math.PI / 4, 0));
    /* The centre plate the stack bolts to, and the skirt that closes the
     * underside so the tub is a tub. */
    parts.push(bake(new THREE.BoxGeometry(0.0198, 0.0022, 0.0198), 0, webY - 0.0002, 0));
    /*
     * THE STRAPS, and there is no skirt any more.
     *
     * A skirt closing the underside was right while the duct wall ran all
     * the way down: the aircraft was a tub and the skirt was its floor. Now
     * that the exit stands open the skirt had nothing to attach to and hung
     * eight millimetres below the aircraft in clear air, which is exactly
     * what it looked like. What a real Air65 has under there is two moulded
     * straps across the belly holding the cell, so that is what is here.
     */
    const strapGeo = new THREE.BoxGeometry(0.0040, 0.0016, 0.0210);
    for (const sx of [-0.0058, 0.0058]) {
      parts.push(bake(strapGeo, sx, PACK_TOP + 0.0004, 0.0030, 0, Math.PI / 2, 0));
    }
    const tub = new THREE.Mesh(mergeGeometries(parts, false), frame);
    tub.castShadow = shade;
    group.add(hull(tub, 0.0009, ink));
  }

  /*
   * THE RIM HOOPS, and they are the single feature that makes this read as an
   * Air65 II rather than as a tub with holes in it.
   *
   * The moulding carries a thin bumper ring standing PROUD of each duct lip
   * on short posts, so from above the aircraft is four thin circles with air
   * under them and from the side there is a visible slot between the ring and
   * the duct wall. It is what takes the hit when a whoop finds a doorframe,
   * and it is the strongest line in the silhouette: without it the ducts read
   * as solid cans, which is the shape the model had.
   *
   * A torus rather than a second lathe, because it is a round section rod on
   * the real part, and merged with the posts so it is one object.
   */
  {
    const parts = [];
    const ro = DUCT_BORE + DUCT_WALL;
    const hoopR = ro + 0.0013;
    const hoopY = DUCT_TOP + 0.0021;
    const ring = new THREE.TorusGeometry(hoopR, 0.00060, lite ? 5 : 8, seg);
    const post = new THREE.BoxGeometry(0.0016, 0.0028, 0.0022);
    for (const [mx, mz] of motors) {
      parts.push(bake(ring, mx, hoopY, mz, Math.PI / 2, 0, 0));
      /* Four posts a duct, on the diagonals, so none of them is on the line
       * of sight straight ahead or straight across. */
      for (let k = 0; k < 4; k += 1) {
        const ang = Math.PI / 4 + (k * Math.PI) / 2;
        parts.push(bake(
          post,
          mx + Math.cos(ang) * hoopR,
          hoopY - 0.0013,
          mz + Math.sin(ang) * hoopR,
          0,
          -ang,
          0,
        ));
      }
    }
    const hoops = new THREE.Mesh(mergeGeometries(parts, false), frame);
    hoops.castShadow = shade;
    group.add(hull(hoops, 0.0006, ink));
  }

  /*
   * THE STACK, AND THERE IS NO CANOPY ON IT.
   *
   * The model used to wear a sakura dome over the electronics, and that is
   * the Meteor's shape rather than this one. An Air65 II is sold BARE: the
   * AIO board is the top of the aircraft, you look straight down at the
   * green, the chips, the solder joints and the motor leads, and the only
   * tall thing on it is the camera. The dome was also a third of the machine
   * in one flat colour, so at any distance the aircraft read as a pink blob.
   *
   * So: a Matrix 1S 5IN1 II board on four standoffs, a smaller VTX board
   * above it, the components that actually stand proud on one, and the
   * battery lead coming forward over the front edge.
   */
  const STACK_Y = DUCT_TOP + 0.0012;
  {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.0182, 0.0014, 0.0182), pcb);
    board.position.set(0, STACK_Y, 0);
    board.castShadow = shade;
    group.add(hull(board, 0.0006, ink));

    /* The four M2 standoffs, and the screw heads on top of them. */
    const postGeo = new THREE.CylinderGeometry(0.00090, 0.00090, 0.0044, lite ? 5 : 8);
    const headGeo = new THREE.CylinderGeometry(0.00120, 0.00120, 0.00055, lite ? 5 : 8);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = sx * 0.0065;
        const pz = sz * 0.0065;
        const postMesh = new THREE.Mesh(postGeo, solder);
        postMesh.position.set(px, STACK_Y + 0.0029, pz);
        group.add(postMesh);
        const head = new THREE.Mesh(headGeo, solder);
        head.position.set(px, STACK_Y + 0.0054, pz);
        group.add(head);
      }
    }

    /* The VTX above it, smaller and set back, so the camera has the front. */
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.0150, 0.0012, 0.0122), pcbTop);
    top.position.set(0, STACK_Y + 0.0051, 0.0018);
    group.add(hull(top, 0.0005, ink));

    /*
     * The parts that stand proud on a 1S AIO, roughly where they are: the
     * MCU under the middle, the four ESC FETs down one edge, and the bulk
     * capacitor on its side at the back. They are what stop the board
     * reading as a flat green tile, which at 65 mm is most of the detail
     * the aircraft has.
     */
    const mcu = new THREE.Mesh(new THREE.BoxGeometry(0.0044, 0.0010, 0.0044), chip);
    mcu.position.set(-0.0028, STACK_Y + 0.0012, 0.0016);
    group.add(mcu);
    const fet = new THREE.BoxGeometry(0.0016, 0.0009, 0.0026);
    for (let i = 0; i < 4; i += 1) {
      const f = new THREE.Mesh(fet, chip);
      f.position.set(0.0030 + (i % 2) * 0.0028, STACK_Y + 0.0011, -0.0042 + Math.floor(i / 2) * 0.0060);
      group.add(f);
    }
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0018, 0.0018, 0.0044, lite ? 6 : 12),
      chip,
    );
    cap.rotation.z = Math.PI / 2;
    cap.position.set(0, STACK_Y + 0.0026, 0.0072);
    group.add(cap);

    /* The pack lead, over the front edge and down to the pigtail. Red,
     * because it is, and because it is the one warm thing on the aircraft
     * once the dome has gone. */
    const lead = new THREE.Mesh(new THREE.BoxGeometry(0.0018, 0.0011, 0.0090), wireRed);
    lead.rotation.x = -0.42;
    lead.position.set(0.0042, STACK_Y - 0.0016, 0.0064);
    group.add(lead);
  }

  /*
   * THE CAMERA, and on this aircraft it is a LANDMARK rather than a detail.
   *
   * A C03 in its cage is 14 mm across and stands 11 mm off the board, which
   * on a machine 12 mm deep at the ring makes it the tallest thing by a wide
   * margin and gives the whoop the nose down forward lean it reads with in
   * every photograph. It sits at the front of the stack, tilted back at the
   * airframe's own mount angle.
   *
   * The mount group is what the shell parents the FPV view to, and main.js
   * turns it by the pilot's camera angle, so the model and the picture cannot
   * disagree about where the pilot is looking from.
   */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, WHOOP_MOUNT_UP, -WHOOP_MOUNT_FORWARD);
  cameraMount.name = 'whoop-camera-mount';
  group.add(cameraMount);
  {
    /* The cage: two side cheeks and a back, which is what a C03 mount is,
     * so the camera is a shape with a hole in it rather than a brick. */
    const cheek = new THREE.BoxGeometry(0.0016, 0.0116, 0.0084);
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(cheek, camBody);
      c.position.set(sx * 0.0060, 0.0004, 0.0022);
      c.castShadow = shade;
      cameraMount.add(hull(c, 0.0006, ink));
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.0136, 0.0116, 0.0018), camBody);
    back.position.set(0, 0.0004, 0.0055);
    back.castShadow = shade;
    cameraMount.add(hull(back, 0.0006, ink));

    /* The camera itself, sitting in the cage. */
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.0104, 0.0100, 0.0052), camBody);
    body.position.set(0, 0.0004, 0.0022);
    cameraMount.add(body);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0040, 0.0044, 0.0040, lite ? 10 : 18),
      camBody,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.0006, -0.0016);
    cameraMount.add(barrel);
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.0034, lite ? 8 : 14, lite ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2),
      lens,
    );
    glass.rotation.x = -Math.PI / 2;
    glass.position.set(0, 0.0006, -0.0034);
    cameraMount.add(glass);
    /* One sakura band across the top of the cage. It is the whole of the
     * project's chrome colour on this aircraft, and it is here because this
     * is the part a pilot looks at. */
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.0128, 0.0009, 0.0012), camTrim);
    trim.position.set(0, 0.0058, -0.0010);
    cameraMount.add(trim);
  }

  /*
   * THE PACK, under the tub on a BT2.0 pigtail. A LAVA II 1S 280 mAh is
   * 6.8 g of the aircraft's 23.4, which is nearly a third, and it hangs
   * below the ducts where you can see it. That mass distribution is why
   * this airframe's pitch inertia is a quarter more than its roll inertia
   * where a 5 inch's is eight percent more; the model shows the reason.
   */
  {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.0158, 0.0060, 0.0330), battery);
    pack.position.set(0, PACK_TOP - 0.0030, 0.0030);
    pack.castShadow = shade;
    group.add(hull(pack, 0.0008, ink));
    /* The wrapper's printed band, on the SIDE of the cell rather than across
     * its back: across the back it was a cream slab as wide as the aircraft
     * and it read as a part rather than as a label. */
    for (const sx of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.0008, 0.0026, 0.0140), label);
      band.position.set(sx * 0.0080, PACK_TOP - 0.0030, 0.0060);
      group.add(band);
    }
  }

  /*
   * The antenna. A whip out of the back of the stack, which is what the
   * Champion carries; the Racing and Freestyle ship a copper pipe instead.
   * It leans back and to one side, because a bare stack has nowhere to
   * anchor it straight and every photograph of one shows it leaning.
   */
  {
    const whip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.00040, 0.00040, 0.0260, 6),
      antenna,
    );
    whip.rotation.set(-0.42, 0, 0.16);
    whip.position.set(-0.0018, STACK_Y + 0.0158, 0.0090);
    group.add(whip);
    /* The heatshrink at its root, which is where the whip actually starts. */
    const root = new THREE.Mesh(
      new THREE.CylinderGeometry(0.00090, 0.00090, 0.0040, 6),
      antenna,
    );
    root.rotation.set(-0.42, 0, 0.16);
    root.position.set(-0.0008, STACK_Y + 0.0038, 0.0056);
    group.add(root);
  }

  /*
   * The motors and their rotors. 0702s: a 7 mm stator and a 2 mm stack, so
   * the bell is almost invisible inside the duct, which is exactly right.
   */
  const blades = [];
  const discs = [];
  const leds = [];
  const bladeGeo = whoopBlade(lite ? 4 : 8);
  /*
   * FLAT. whoopBlade extrudes its outline in the shape's own XY plane, so
   * the raw geometry stands on edge: every blade was a fin hanging 14 mm
   * straight down out of the hub. It was invisible for as long as the ducts
   * were closed cans, and the moment the exit was opened up four sets of
   * three white cones appeared under the aircraft. herocraft.js does the
   * same rotate for the same reason, one line after building its own blade,
   * and this model was missing it.
   */
  bladeGeo.rotateX(-Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.0022, 0.0026, 0.0018, lite ? 8 : 14);
  for (let i = 0; i < motors.length; i += 1) {
    const [mx, mz] = motors[i];
    const front = mz < 0;

    /*
     * The stator, and the four leads leaving it. A 0702 is a 7 mm stator on
     * a 2 mm stack, and on the real aircraft it is mounted on a little cross
     * spanning the duct floor with the leads running up the wall to the
     * board. The cross is what stops the duct reading as an empty hole.
     */
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0036, 0.0038, 0.0040, lite ? 8 : 16),
      stator,
    );
    can.position.set(mx, ROTOR_Y - 0.0036, mz);
    group.add(can);
    /* THREE arms, not four, and thin. A 0702 mount is a three spoke spider
     * and the difference is visible: four fat spokes drew a bold X in every
     * duct and the X was the loudest thing on the aircraft. */
    const spoke = new THREE.BoxGeometry(DUCT_BORE * 0.99, 0.00060, 0.0010);
    for (let k = 0; k < 3; k += 1) {
      const ang = (k * Math.PI * 2) / 3;
      const arm = new THREE.Mesh(spoke, frame);
      arm.rotation.y = -ang;
      arm.position.set(
        mx + Math.cos(ang) * DUCT_BORE * 0.5,
        ROTOR_Y - 0.0030,
        mz + Math.sin(ang) * DUCT_BORE * 0.5,
      );
      group.add(arm);
    }
    /* The three phase leads, as one bundle, running inboard. */
    const leadDir = Math.atan2(-mz, -mx);
    const leadGeo = new THREE.BoxGeometry(0.0100, 0.00050, 0.0009);
    const lead = new THREE.Mesh(leadGeo, chip);
    lead.rotation.y = -leadDir;
    lead.position.set(
      mx + Math.cos(leadDir) * 0.0090,
      ROTOR_Y - 0.0026,
      mz + Math.sin(leadDir) * 0.0090,
    );
    group.add(lead);

    const motor = new THREE.Group();
    motor.position.set(mx, ROTOR_Y, mz);
    group.add(motor);

    const rotor = new THREE.Group();
    motor.add(rotor);
    /*
     * The bell, and it is TALLER than the model used to draw it. A 0702's
     * can stands about 5 mm proud of the duct floor with the prop hub and
     * the shaft nut on top of that, so looking down a bore you see a bright
     * silver cylinder with a stepped top, not a flat disc. It is the only
     * specular thing inside the duct and it is what makes the hole read as
     * having something in it.
     */
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0033, 0.0038, lite ? 8 : 16),
      bell,
    );
    cap.position.y = -0.0017;
    rotor.add(cap);
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    rotor.add(hubMesh);
    /* The shaft nut, the brightest 2 mm on the aircraft. */
    const nut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.00105, 0.00105, 0.0013, 6),
      bell,
    );
    nut.position.y = 0.0014;
    rotor.add(nut);
    const propMat = front ? propFront : propRear;
    for (let b = 0; b < 3; b += 1) {
      const blade = new THREE.Mesh(bladeGeo, propMat);
      blade.rotation.y = (b * Math.PI * 2) / 3;
      blade.castShadow = shade;
      rotor.add(blade);
    }
    blades.push(rotor);

    /*
     * The blur disc, a direct child of the group on herocraft.js's own
     * contract so a scale check that walks g.children can see it. It is
     * fainter than the 5 inch's because a whoop's disc is inside a duct and
     * you are looking down a bore at it.
     */
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0006, lite ? 12 : 22),
      new THREE.MeshBasicMaterial({
        /* The disc of a CLEAR prop, so it is a pale sheen rather than a
         * coloured plate. Front and rear still differ, because at 15 m the
         * disc is all there is left to tell a pilot which way it faces. */
        color: front ? 0xf0d8e0 : 0xdde6e8,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        fog,
      }),
    );
    disc.position.set(mx, ROTOR_Y + 0.0006, mz);
    disc.renderOrder = 1;
    group.add(disc);
    discs.push(disc);

    /*
     * One lamp a corner, on the duct skirt. A real Air65 II carries them on
     * the FC rather than on the frame, and they shine through the moulding.
     */
    const ledMat = new THREE.MeshBasicMaterial({
      color: front ? 0xe8a8b8 : 0x7dffb4,
      fog,
    });
    /*
     * Small, and UNDER the frame rather than outboard of the duct. They used
     * to sit at 1.24 times the motor arm, which is outside the hoop, so from
     * above four coloured tabs stuck out past the aircraft's own outline and
     * were the first thing the eye found. On the real machine they are
     * surface mount parts on the underside of the board that light the
     * moulding from within.
     */
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0008, 0.0030), ledMat);
    dummy.position.set(mx * 0.60, DUCT_TOP - 0.0038, mz * 0.60);
    dummy.lookAt(mx, DUCT_TOP - 0.0038, mz);
    dummy.updateMatrix();
    led.position.copy(dummy.position);
    led.quaternion.copy(dummy.quaternion);
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front, base: front ? 0xe8a8b8 : 0x7dffb4 });
  }

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    /* Props in, same as the 5 inch and same as PLANT_SPIN in plant.c. */
    propSpin: PROP_SPIN,
  };
}
