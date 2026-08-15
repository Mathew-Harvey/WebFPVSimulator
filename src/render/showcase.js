/*
 * showcase.js: the studio airframe on Settings.
 *
 * One small WebGL context, allocated when Settings opens and disposed
 * when it closes, so flight never shares the GPU with a second renderer.
 * Cheap on purpose: no antialias, no shadow map, pixel ratio 1, low-power
 * hint, lite hero (no outline hulls). The flying world's draw budget
 * cannot see it. Stick response lives in craftpose.js.
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
import { buildHeroCraft } from './herocraft.js';
import { createCraftPose } from './craftpose.js';
import { disposeSceneGraph } from './shell.js';
import { SESSION_TEXTURES } from './session-textures.js';

export function createShowcase(canvas) {
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: false,
    });
  } catch (e) {
    return {
      update() {},
      render() {},
      setActive() {},
      dispose() {},
      failed: true,
    };
  }

  renderer.setClearColor(0x1a241c, 1);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  if (renderer.debug) {
    renderer.debug.checkShaderErrors = false;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.04, 4);
  const look = new THREE.Vector3(0, 0.01, 0.02);

  const hemi = new THREE.HemisphereLight(0xf0e6d0, 0x2a3828, 0.82);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe2b8, 2.45);
  sun.position.set(0.48, 0.92, -0.52);
  sun.castShadow = false;
  scene.add(sun);

  const catcher = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 16),
    new THREE.MeshBasicMaterial({
      color: 0x0e140f,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      fog: false,
    }),
  );
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = -0.064;
  scene.add(catcher);

  const washMat = new THREE.MeshBasicMaterial({
    color: 0x7dffb4,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const wash = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), washMat);
  wash.rotation.x = -Math.PI / 2;
  wash.position.y = -0.052;
  scene.add(wash);

  const hero = buildHeroCraft({ fog: false, lite: true });
  const pose = new THREE.Group();
  pose.add(hero.group);
  scene.add(pose);
  const craftPose = createCraftPose();

  const state = {
    az: Math.PI - 0.62,
    el: 0.34,
    dist: 1.32,
    dragAz: 0,
    dragging: false,
    lastX: 0,
    active: false,
  };

  canvas.style.touchAction = 'none';
  const onDown = (e) => {
    e.preventDefault();
    state.dragging = true;
    state.lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!state.dragging) {
      return;
    }
    state.dragAz += (e.clientX - state.lastX) * 0.007;
    state.lastX = e.clientX;
  };
  const endDrag = (e) => {
    state.dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  const size = { w: 0, h: 0 };
  function resize() {
    const w = canvas.clientWidth | 0;
    const h = canvas.clientHeight | 0;
    if (w < 8 || h < 8) {
      return false;
    }
    if (w === size.w && h === size.h) {
      return true;
    }
    size.w = w;
    size.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w > h * 1.15 ? 32 : 28;
    camera.updateProjectionMatrix();
    return true;
  }

  const ro = new ResizeObserver(() => {
    if (state.active) {
      resize();
    }
  });
  ro.observe(canvas);

  function setActive(on) {
    if (on && !state.active) {
      craftPose.reset(pose);
      for (let m = 0; m < 4; m += 1) {
        hero.blades[m].rotation.y = 0;
      }
    }
    state.active = on;
    if (on) {
      resize();
    }
  }

  function damp(cur, target, lambda, dt) {
    return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
  }

  function update(dtMs, channels, nowMs, cameraAngle, angleMode) {
    if (!state.active) {
      return;
    }
    const dt = Math.min(0.05, Math.max(0, dtMs) * 0.001);
    const thr = craftPose.update(
      dtMs,
      channels,
      nowMs,
      cameraAngle,
      angleMode,
      hero,
      pose,
    );

    washMat.opacity = thr * 0.12;
    const ws = 0.85 + thr * 0.55;
    wash.scale.set(ws, ws, ws);

    const homeAz = Math.PI - 0.62;
    state.az = damp(state.az, homeAz + state.dragAz, 3.2, dt);

    const ca = Math.cos(state.az);
    const sa = Math.sin(state.az);
    const ce = Math.cos(state.el);
    const se = Math.sin(state.el);
    camera.position.set(
      sa * ce * state.dist,
      se * state.dist + 0.04,
      ca * ce * state.dist,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
  }

  function render() {
    if (!state.active || document.hidden || !resize()) {
      return;
    }
    renderer.render(scene, camera);
  }

  function dispose() {
    state.active = false;
    ro.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', endDrag);
    canvas.removeEventListener('pointercancel', endDrag);
    disposeSceneGraph(scene, SESSION_TEXTURES);
    try {
      renderer.dispose();
    } catch (e) {
      /* Already gone. */
    }
  }

  return { update, render, setActive, dispose, failed: false };
}
