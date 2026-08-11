/*
 * scene.js: the Stage 1 world. A grey ground plane with a grid for motion
 * cues, a horizon (sky background plus fog), and a minimal quad body. No
 * textures, no gates, no polish; that is STAGE1.md's deliverable.
 *
 * All coordinate conversion happens in frame.js; this file only builds
 * Three.js objects and updates them from already converted values.
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

export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9db4c8);
  scene.fog = new THREE.Fog(0x9db4c8, 150, 700);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(80, 200, 60);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd0e0, 0.8));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshLambertMaterial({ color: 0x5a5f63 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(2000, 200, 0x3c4044, 0x484d52);
  grid.position.y = 0.02;
  scene.add(grid);

  /* The quad: centre plate, four arms, prop discs. Front right and front
   * left props tinted red so orientation reads instantly. */
  const quad = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.03, 0.16),
    new THREE.MeshLambertMaterial({ color: 0x22262a }),
  );
  quad.add(plate);

  /* Motor layout in the quad group's own frame: three.js x right,
   * -z forward. Matches the Betaflight order RR FR RL FL used by the
   * plant, front at -z, right at +x. */
  const armLen = 0.11;
  const motorXZ = [
    [0.0778, 0.0778],   /* RR: right, back */
    [0.0778, -0.0778],  /* FR: right, front */
    [-0.0778, 0.0778],  /* RL: left, back */
    [-0.0778, -0.0778], /* FL: left, front */
  ];
  const armMat = new THREE.MeshLambertMaterial({ color: 0x2e3338 });
  const propFront = new THREE.MeshLambertMaterial({
    color: 0xd8483c, transparent: true, opacity: 0.55,
  });
  const propRear = new THREE.MeshLambertMaterial({
    color: 0x30353b, transparent: true, opacity: 0.55,
  });
  for (let m = 0; m < 4; m += 1) {
    const [mx, mz] = motorXZ[m];
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, armLen), armMat);
    arm.position.set(mx / 2, 0.0, mz / 2);
    arm.lookAt(new THREE.Vector3(mx, 0, mz));
    quad.add(arm);
    const prop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.064, 0.064, 0.006, 24),
      mz < 0 ? propFront : propRear,
    );
    prop.position.set(mx, 0.025, mz);
    quad.add(prop);
  }
  scene.add(quad);

  const camera = new THREE.PerspectiveCamera(95, 1, 0.05, 2000);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, quad };
}
