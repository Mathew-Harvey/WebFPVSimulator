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
 *   duct height     the tub is about 12 mm deep at the ring
 *   canopy          the Air II, camera on a 15 to 45 degree mount
 *   pack            a LAVA II 1S 280 mAh on a BT2.0 pigtail, under the tub
 *   all up          23.4 g
 *
 * The palette is the project's, exactly as herocraft.js takes it: forest
 * carbon, cream, sakura chrome for the canopy, mint for a live lamp. A pilot
 * who switched aircraft should be looking at the same product.
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
const DUCT_BOTTOM = -0.0075; /* duct floor below it */
const ROTOR_Y = 0.0035;      /* the disc sits just under the lip */

/*
 * The camera mount, in the Three.js craft frame, and it is NOT
 * lens.js's CAMERA_MOUNT_FORWARD / CAMERA_MOUNT_UP.
 *
 * Those two are the 5 inch's, 80 mm forward and 18 mm up, which on a machine
 * 72 mm long end to end would put the lens a body length in front of the
 * aircraft. The Air II canopy carries the C03 at the front of the shell, so
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
    /* outer skirt, bottom up */
    new THREE.Vector2(ro + 0.0010, DUCT_BOTTOM),
    new THREE.Vector2(ro, DUCT_BOTTOM + 0.0020),
    new THREE.Vector2(ro, DUCT_TOP - 0.0016),
    /* the rounded inlet lip */
    new THREE.Vector2(ro - 0.0004, DUCT_TOP - 0.0004),
    new THREE.Vector2(ro - 0.0012, DUCT_TOP),
    new THREE.Vector2(ri + 0.0006, DUCT_TOP - 0.0006),
    /* down the throat */
    new THREE.Vector2(ri, DUCT_TOP - 0.0018),
    new THREE.Vector2(ri, DUCT_BOTTOM + 0.0028),
    /* the exit flare */
    new THREE.Vector2(ri + 0.0012, DUCT_BOTTOM),
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

  /* herocraft.js's palette, unchanged, because it is the product's. */
  /*
   * The tub is LIGHTER than the five inch's carbon and that is not a
   * stylistic whim. A five inch's frame is carbon plate and reads as near
   * black correctly. A whoop's is injection moulded polypropylene, which is
   * a matt graphite with a lot of diffuse bounce in it, and the first pass
   * drew it at the carbon value: at this scale, with the ducts being most of
   * the aircraft, the whole machine came out as a silhouette with a pink
   * canopy floating in it. 0x2a352e is the same family, three stops up.
   */
  const frame = cel({ color: 0x2a352e, rim: 0.38, spec: 0.16, specWidth: 0.014 });
  const frameDeep = cel({ color: 0x1a221c, rim: 0.20, spec: 0.10 });
  const canopy = cel({ color: 0xe8a8b8, rim: 0.42, spec: 0.48, specWidth: 0.016 });
  const canopyDeep = cel({ color: 0xc47888, rim: 0.28, spec: 0.22 });
  const pcb = cel({ color: 0x2a4a38, rim: 0.20, spec: 0.22 });
  const bell = cel({ color: 0xd8d0c4, rim: 0.32, spec: 0.70, specWidth: 0.022 });
  const stator = cel({ color: 0x2a322c, rim: 0.24, spec: 0.20 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({
    color: 0x101610,
    rim: 0.40,
    spec: 0.95,
    specWidth: 0.03,
    specColor: 0xf3ead4,
    side: THREE.DoubleSide,
  });
  const battery = cel({ color: 0x161c18, rim: 0.22, spec: 0.16 });
  const label = cel({ color: 0xe8dcc0, rim: 0.24, spec: 0.28 });
  const hubMat = cel({ color: 0x161c18, rim: 0.22, spec: 0.25 });
  const propFront = cel({ color: 0xe890a8, rim: 0.28, spec: 0.24 });
  const propRear = cel({ color: 0x5a6558, rim: 0.24, spec: 0.20 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
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
   * drawing them as separate parts would read as a quad with hoops
   * cable tied to it, which is the 2018 aircraft this project is
   * deliberately not modelling.
   */
  {
    const parts = [];
    const duct = ductLathe(seg);
    for (const [mx, mz] of motors) {
      parts.push(bake(duct, mx, 0, mz));
    }
    /*
     * THE WEBS, and the first version of them was wrong in a way worth
     * recording: they sat at the duct's mid height, which is INSIDE the
     * ducts, so from every angle a pilot ever sees the aircraft from it read
     * as four separate cans standing near each other. A whoop is one
     * moulding and has to look like one.
     *
     * They are at the lip now, which is where a real Air65 frame carries
     * them: the ducts are joined across their tops by flat braces and the
     * centre of the X is a plate the stack bolts through. The bottom skirt
     * closes the shape from underneath.
     */
    const webY = DUCT_TOP - 0.0022;
    const webH = 0.0032;
    const span = a * 2;
    const webGeo = new THREE.BoxGeometry(0.0090, webH, span - 0.0110);
    parts.push(bake(webGeo, a, webY, 0));
    parts.push(bake(webGeo, -a, webY, 0));
    parts.push(bake(webGeo, 0, webY, a, 0, Math.PI / 2, 0));
    parts.push(bake(webGeo, 0, webY, -a, 0, Math.PI / 2, 0));
    /* The diagonals, corner to corner through the middle. These are what
     * make the four holes read as holes in one part rather than as gaps
     * between four parts. */
    const diagLen = a * 2 * Math.SQRT2 - 0.0150;
    const diagGeo = new THREE.BoxGeometry(0.0080, webH, diagLen);
    parts.push(bake(diagGeo, 0, webY, 0, 0, Math.PI / 4, 0));
    parts.push(bake(diagGeo, 0, webY, 0, 0, -Math.PI / 4, 0));
    /* The centre plate the stack bolts to, and the skirt that closes the
     * underside so the tub is a tub. */
    parts.push(bake(new THREE.BoxGeometry(0.0215, 0.0034, 0.0215), 0, webY - 0.0004, 0));
    const skirtGeo = new THREE.BoxGeometry(0.0060, 0.0026, span - 0.0130);
    parts.push(bake(skirtGeo, a, DUCT_BOTTOM + 0.0013, 0));
    parts.push(bake(skirtGeo, -a, DUCT_BOTTOM + 0.0013, 0));
    parts.push(bake(skirtGeo, 0, DUCT_BOTTOM + 0.0013, a, 0, Math.PI / 2, 0));
    parts.push(bake(skirtGeo, 0, DUCT_BOTTOM + 0.0013, -a, 0, Math.PI / 2, 0));
    const tub = new THREE.Mesh(mergeGeometries(parts, false), frame);
    tub.castShadow = shade;
    group.add(hull(tub, 0.0009, ink));
  }

  /*
   * The flight controller, a Matrix 1S 5IN1 II, seen through the gap between
   * the tub and the canopy. Green board, because every one of them is.
   */
  {
    const fc = new THREE.Mesh(new THREE.BoxGeometry(0.0180, 0.0016, 0.0180), pcb);
    fc.position.set(0, DUCT_TOP + 0.0006, 0);
    fc.castShadow = false;
    group.add(fc);
  }

  /*
   * THE AIR II CANOPY. A rounded shell over the stack with the camera at the
   * front, and it is the sakura, which is what makes the aircraft read as
   * this product rather than as a generic whoop.
   *
   * Drawn as a lathe cut in half and squashed, rather than as a sphere,
   * because the real canopy is a swept nose with a flat back where the
   * antenna leaves.
   */
  {
    /*
     * THE CANOPY WAS A PINK BLOB and this is the fix.
     *
     * The first pass drew it 23 mm across and 12.5 mm tall, sitting above
     * the duct lips, which on a 65 mm aircraft is a third of the whole
     * machine in one solid colour: it read as a balloon somebody had tied to
     * a quad. A real Air II is 18 mm across the shoulders and 9 mm tall, it
     * sits DOWN between the front two ducts rather than on top of them, and
     * most of what you see of it from above is the dark visor rather than
     * the shell.
     *
     * So: smaller, lower, further forward, and the visor is a real band
     * across the nose in the deeper tone rather than a ring hidden inside.
     */
    const pts = [];
    const n = lite ? 6 : 10;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      const y = t * 0.0086;
      const r = 0.0090 * Math.sqrt(Math.max(0, 1 - t * t * 0.88));
      pts.push(new THREE.Vector2(Math.max(0.0005, r), y));
    }
    const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), canopy);
    shell.position.set(0, DUCT_TOP + 0.0014, -0.0044);
    shell.scale.set(1.0, 1.0, 1.30);
    shell.castShadow = shade;
    group.add(hull(shell, 0.0007, ink));

    /* The visor: the dark band across the nose the camera looks out of. */
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.0132, 0.0058, 0.0042), canopyDeep);
    visor.position.set(0, DUCT_TOP + 0.0034, -0.0104);
    group.add(visor);
  }

  /*
   * THE CAMERA, on the front of the canopy at the airframe's own tilt. The
   * mount group is what the shell parents the FPV view to, and main.js turns
   * it by the pilot's camera angle, so the model and the picture cannot
   * disagree about where the pilot is looking from.
   */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, WHOOP_MOUNT_UP, -WHOOP_MOUNT_FORWARD);
  cameraMount.name = 'whoop-camera-mount';
  group.add(cameraMount);
  {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.0132, 0.0122, 0.0060), camBody);
    body.position.set(0, 0, 0.0026);
    body.castShadow = shade;
    cameraMount.add(hull(body, 0.0008, ink));
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0042, 0.0046, 0.0034, lite ? 10 : 18),
      camBody,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.0006, -0.0016);
    cameraMount.add(barrel);
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.0036, lite ? 8 : 14, lite ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2),
      lens,
    );
    glass.rotation.x = -Math.PI / 2;
    glass.position.set(0, 0.0006, -0.0032);
    cameraMount.add(glass);
  }

  /*
   * THE PACK, under the tub on a BT2.0 pigtail. A LAVA II 1S 280 mAh is
   * 6.8 g of the aircraft's 23.4, which is nearly a third, and it hangs
   * below the ducts where you can see it. That mass distribution is why
   * this airframe's pitch inertia is a quarter more than its roll inertia
   * where a 5 inch's is eight percent more; the model shows the reason.
   */
  {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.0170, 0.0064, 0.0360), battery);
    pack.position.set(0, DUCT_BOTTOM - 0.0022, 0.0030);
    pack.castShadow = shade;
    group.add(hull(pack, 0.0008, ink));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.0174, 0.0022, 0.0086), label);
    band.position.set(0, DUCT_BOTTOM - 0.0022, 0.0100);
    group.add(band);
  }

  /*
   * The antenna. A whip out of the back of the canopy, which is what the
   * Champion carries; the Racing and Freestyle ship a copper pipe instead.
   */
  {
    const whip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.00042, 0.00042, 0.0230, 6),
      antenna,
    );
    whip.rotation.x = -0.55;
    whip.position.set(0, DUCT_TOP + 0.0110, 0.0126);
    group.add(whip);
  }

  /*
   * The motors and their rotors. 0702s: a 7 mm stator and a 2 mm stack, so
   * the bell is almost invisible inside the duct, which is exactly right.
   */
  const blades = [];
  const discs = [];
  const leds = [];
  const bladeGeo = whoopBlade(lite ? 4 : 8);
  const hubGeo = new THREE.CylinderGeometry(0.0022, 0.0026, 0.0018, lite ? 8 : 14);
  for (let i = 0; i < motors.length; i += 1) {
    const [mx, mz] = motors[i];
    const front = mz < 0;

    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0038, 0.0040, 0.0042, lite ? 8 : 16),
      stator,
    );
    can.position.set(mx, ROTOR_Y - 0.0034, mz);
    group.add(can);

    const motor = new THREE.Group();
    motor.position.set(mx, ROTOR_Y, mz);
    group.add(motor);

    const rotor = new THREE.Group();
    motor.add(rotor);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0036, 0.0034, 0.0022, lite ? 8 : 16),
      bell,
    );
    cap.position.y = -0.0009;
    rotor.add(cap);
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    rotor.add(hubMesh);
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
        color: front ? 0xe8a8b8 : 0x5a6558,
        transparent: true,
        opacity: 0.10,
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
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.0030, 0.0012, 0.0046), ledMat);
    dummy.position.set(mx * 1.24, DUCT_BOTTOM + 0.0022, mz * 1.24);
    dummy.lookAt(mx, DUCT_BOTTOM + 0.0022, mz);
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
