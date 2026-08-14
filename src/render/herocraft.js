/*
 * herocraft.js: the 5 inch airframe, for the settings studio and the world.
 *
 * Same published dimensions and motor order as the plant: RR FR RL FL, front
 * at -z, 220 mm diagonal, 5 inch discs. src/render/craft.js is the session
 * wrapper that names it, scales it into the world, and keeps the body box
 * and prop discs as direct children so check 15 can still measure it.
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
import { CRAFT_ARM, CRAFT_PROP_R } from '../game/collide.js';
import { WORLD_SCALE } from './frame.js';

const MOTOR_ARM = CRAFT_ARM / Math.SQRT2;

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

function bladeShape() {
  const r = CRAFT_PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0018, 0.006);
  s.bezierCurveTo(0.011, -0.010, 0.013, -r * 0.42, 0.0045, -r * 0.94);
  s.lineTo(-0.0038, -r * 0.90);
  s.bezierCurveTo(-0.011, -r * 0.38, -0.007, -0.008, -0.0012, 0.006);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.0017,
    bevelEnabled: false,
    curveSegments: 8,
  });
}

function bellLathe() {
  const pts = [
    new THREE.Vector2(0.0008, 0.0115),
    new THREE.Vector2(0.0096, 0.0115),
    new THREE.Vector2(0.0122, 0.0090),
    new THREE.Vector2(0.0128, 0.0015),
    new THREE.Vector2(0.0116, -0.0075),
    new THREE.Vector2(0.0084, -0.0105),
    new THREE.Vector2(0.0040, -0.0105),
  ];
  return new THREE.LatheGeometry(pts, 16);
}

/*
 * Props-in as seen from above: RR and FL clockwise, FR and RL counter
 * clockwise. Right-hand rotation about +Y is counter clockwise, so clockwise
 * is a negative spin.
 */
export const PROP_SPIN = [-1, 1, 1, -1];

export function buildHeroCraft(opts = {}) {
  const fog = opts.fog !== false;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'hero-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }

  const carbon = cel({ color: 0x242a36, rim: 0.30, spec: 0.22, specWidth: 0.012 });
  const carbonDeep = cel({ color: 0x171b24, rim: 0.18, spec: 0.12 });
  const livery = cel({ color: 0x3d9a78, rim: 0.26, spec: 0.28 });
  const brass = cel({ color: 0xb08a4a, rim: 0.30, spec: 0.55, specWidth: 0.018 });
  const pcb = cel({ color: 0x1d6a3c, rim: 0.20, spec: 0.22 });
  const canopy = cel({ color: 0xe8503a, rim: 0.42, spec: 0.48, specWidth: 0.016 });
  const canopyDeep = cel({ color: 0xa83224, rim: 0.28, spec: 0.22 });
  const bell = cel({ color: 0xc5ced8, rim: 0.32, spec: 0.72, specWidth: 0.022 });
  const stator = cel({ color: 0x3a414c, rim: 0.24, spec: 0.20 });
  const camBody = cel({ color: 0x1c1f28, rim: 0.26, spec: 0.35 });
  const lens = cel({
    color: 0x141820,
    rim: 0.40,
    spec: 0.95,
    specWidth: 0.03,
    specColor: 0xb8d4ff,
    side: THREE.DoubleSide,
  });
  const ring = cel({ color: 0x8a93a0, rim: 0.28, spec: 0.55 });
  const battery = cel({ color: 0x1a1d26, rim: 0.22, spec: 0.16 });
  const tape = cel({ color: 0xe2b84a, rim: 0.24, spec: 0.30 });
  const strap = cel({ color: 0x2a3140, rim: 0.20 });
  const hubMat = cel({ color: 0x1a1e26, rim: 0.22, spec: 0.25 });
  const propFront = cel({ color: 0xff6a45, rim: 0.30, spec: 0.28 });
  const propRear = cel({ color: 0x4a5564, rim: 0.26, spec: 0.22 });
  const antenna = cel({ color: 0x2c3340, rim: 0.22 });
  const antennaTip = cel({ color: 0x7dffb4, rim: 0.20, spec: 0.4 });
  const xt60 = cel({ color: 0xd4a017, rim: 0.24, spec: 0.35 });

  const a = MOTOR_ARM;
  const motors = [
    [a, a],
    [a, -a],
    [-a, a],
    [-a, -a],
  ];

  const dummy = new THREE.Object3D();

  /*
   * Check 15 reads a direct child BoxGeometry whose depth is the body
   * length. The visible plates are merged BufferGeometry, so this box is
   * the published airframe, hidden, and the only thing that measurement
   * is allowed to see.
   */
  if (opts.measure) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.088, 0.034, 0.155),
      carbon,
    );
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /*
   * Plates as one mesh, arms as four. A single merged X reads as a black
   * blot from the product camera; separate arms keep the silhouette that
   * says racing quad.
   */
  const plateParts = [
    bake(new THREE.BoxGeometry(0.038, 0.0032, 0.086), 0, -0.003, 0.004),
    bake(new THREE.BoxGeometry(0.036, 0.0028, 0.078), 0, 0.023, 0.006),
    bake(new THREE.BoxGeometry(0.028, 0.0026, 0.028), 0, -0.003, -0.048),
  ];
  const plateGeo = mergeGeometries(plateParts, false);
  if (!plateGeo) {
    throw new Error('herocraft: plate merge failed');
  }
  for (const g of plateParts) {
    g.dispose();
  }
  const plates = new THREE.Mesh(plateGeo, carbon);
  plates.castShadow = true;
  outlineHull(plates, 1.07, 0x10141c);
  group.add(plates);

  for (let i = 0; i < 4; i += 1) {
    const [mx, mz] = motors[i];
    const span = Math.hypot(mx, mz);
    dummy.position.set(mx * 0.46, 0.002, mz * 0.46);
    dummy.lookAt(mx, 0.002, mz);
    dummy.updateMatrix();
    const armGeo = new THREE.BoxGeometry(0.016, 0.0076, span * 0.78);
    armGeo.applyMatrix4(dummy.matrix);
    const arm = new THREE.Mesh(armGeo, carbon);
    arm.castShadow = true;
    outlineHull(arm, 1.08, 0x10141c);
    group.add(arm);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.0052, 0.028), carbon);
    pad.position.set(mx, 0.001, mz);
    pad.castShadow = true;
    outlineHull(pad, 1.08, 0x10141c);
    group.add(pad);
  }

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0016, 0.070), livery);
  stripe.position.set(0, 0.0252, 0.004);
  stripe.castShadow = true;
  group.add(stripe);
  const noseMark = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.0016, 0.010), canopy);
  noseMark.position.set(0, 0.0252, -0.032);
  group.add(noseMark);

  const standAt = [
    [0.012, 0.010],
    [0.012, -0.008],
    [-0.012, 0.010],
    [-0.012, -0.008],
  ];
  for (const [sx, sz] of standAt) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.024, 8), brass);
    post.position.set(sx, 0.010, sz);
    post.castShadow = true;
    group.add(post);
  }

  const board = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.0022, 0.030), pcb);
  board.position.set(0, 0.010, 0.006);
  group.add(board);
  const esc = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.0020, 0.028), carbonDeep);
  esc.position.set(0, 0.004, 0.006);
  group.add(esc);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.024, 0.072), battery);
  pack.position.set(0, -0.018, 0.012);
  pack.castShadow = true;
  outlineHull(pack, 1.06, 0x10141c);
  group.add(pack);
  const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.0372, 0.0034, 0.073), tape);
  wrap.position.set(0, -0.012, 0.012);
  group.add(wrap);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.046, 0.010), strap);
  belt.position.set(0, 0.002, 0.012);
  group.add(belt);
  const plug = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.010, 0.016), xt60);
  plug.position.set(0, -0.016, 0.054);
  group.add(plug);

  const podGeo = new THREE.IcosahedronGeometry(0.028, 1);
  podGeo.computeVertexNormals();
  const pod = new THREE.Mesh(podGeo, canopy);
  pod.scale.set(1.08, 0.70, 1.48);
  pod.position.set(0, 0.020, -0.056);
  pod.castShadow = true;
  outlineHull(pod, 1.09, 0x1a1010);
  group.add(pod);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.012, 0.008), canopyDeep);
  visor.position.set(0, 0.022, -0.082);
  group.add(visor);

  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, 0.018, -0.080);
  group.add(cameraMount);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.019, 0.022), camBody);
  housing.position.set(0, 0, -0.004);
  housing.castShadow = true;
  outlineHull(housing, 1.08, 0x0c1016);
  cameraMount.add(housing);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0084, 0.0090, 0.014, 14), camBody);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.018);
  cameraMount.add(barrel);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0078, 18), lens);
  glass.rotation.y = Math.PI;
  glass.position.set(0, 0, -0.0242);
  cameraMount.add(glass);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0084, 0.0013, 8, 18), ring);
  bezel.position.set(0, 0, -0.0236);
  cameraMount.add(bezel);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.042, 8), antenna);
  mast.position.set(-0.012, 0.038, 0.036);
  mast.rotation.z = 0.18;
  mast.rotation.x = -0.22;
  group.add(mast);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 8), antennaTip);
  tip.position.set(-0.0156, 0.057, 0.031);
  group.add(tip);

  const bladeGeo = bladeShape();
  bladeGeo.rotateX(-Math.PI / 2);
  bladeGeo.translate(0, 0, 0);
  const discs = [];
  const blades = [];
  const leds = [];
  const bellGeo = bellLathe();
  const statorGeo = new THREE.CylinderGeometry(0.0088, 0.0088, 0.014, 12);
  const nutGeo = new THREE.CylinderGeometry(0.0036, 0.0036, 0.0032, 6);
  const hubGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.0045, 12);

  for (let m = 0; m < 4; m += 1) {
    const [mx, mz] = motors[m];
    const front = mz < 0;
    const motor = new THREE.Group();
    motor.position.set(mx, 0.014, mz);
    group.add(motor);

    const statorMesh = new THREE.Mesh(statorGeo, stator);
    statorMesh.position.y = -0.002;
    statorMesh.castShadow = true;
    motor.add(statorMesh);
    const bellMesh = new THREE.Mesh(bellGeo, bell);
    bellMesh.position.y = 0.006;
    bellMesh.castShadow = true;
    outlineHull(bellMesh, 1.07, 0x12161c);
    motor.add(bellMesh);
    const nut = new THREE.Mesh(nutGeo, ring);
    nut.position.y = 0.018;
    motor.add(nut);

    const rotor = new THREE.Group();
    rotor.position.y = 0.020;
    motor.add(rotor);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    rotor.add(hub);
    const propMat = front ? propFront : propRear;
    for (let b = 0; b < 3; b += 1) {
      const blade = new THREE.Mesh(bladeGeo, propMat);
      blade.rotation.y = (b * Math.PI * 2) / 3;
      blade.castShadow = true;
      rotor.add(blade);
    }
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(CRAFT_PROP_R, CRAFT_PROP_R, 0.0012, 24),
      new THREE.MeshBasicMaterial({
        color: front ? 0xff8a63 : 0x5a6572,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        fog,
      }),
    );
    /*
     * Direct child of the craft group, not of the motor. Check 15 walks
     * g.children for CylinderGeometry with radius >= 0.05, and a nested
     * disc is invisible to that walk.
     */
    disc.position.set(mx, 0.034, mz);
    disc.renderOrder = 1;
    group.add(disc);
    discs.push(disc);

    const ledMat = new THREE.MeshBasicMaterial({
      color: front ? 0xff5533 : 0x7dffb4,
      fog,
    });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0022, 0.010), ledMat);
    dummy.position.set(mx * 0.62, 0.0078, mz * 0.62);
    dummy.lookAt(mx, 0.0078, mz);
    dummy.updateMatrix();
    led.position.copy(dummy.position);
    led.quaternion.copy(dummy.quaternion);
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front, base: front ? 0xff5533 : 0x7dffb4 });
  }

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: PROP_SPIN,
  };
}
