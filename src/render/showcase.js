/*
 * showcase.js: the settings-screen airframe.
 *
 * A small studio, its own renderer, lit for the cel look. The flying
 * world's draw budget cannot see it: a second context, allocated the first
 * time Settings opens, never attached to the map scene. The quad is the
 * hero model from herocraft.js, posed from the live stick channels so a
 * radio in the hand moves the machine on the screen.
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
import { celMaterial, outlineHull } from './celmat.js';
import { buildHeroCraft, PROP_SPIN } from './herocraft.js';

const RATE_ROLL = 2.8;
const RATE_PITCH = 2.8;
const RATE_YAW = 2.4;
const STICK_DEAD = 0.14;
const HOVER = 0.016;
const LIFT = 0.038;

function damp(cur, target, lambda, dt) {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

function clamp01(v) {
  if (v < 0) {
    return 0;
  }
  if (v > 1) {
    return 1;
  }
  return v;
}

function motorMix(thr, roll, pitch, yaw) {
  const t = 0.16 + thr * 0.84;
  return [
    clamp01(t - 0.22 * roll - 0.22 * pitch + 0.12 * yaw),
    clamp01(t - 0.22 * roll + 0.22 * pitch - 0.12 * yaw),
    clamp01(t + 0.22 * roll - 0.22 * pitch - 0.12 * yaw),
    clamp01(t + 0.22 * roll + 0.22 * pitch + 0.12 * yaw),
  ];
}

function hexRgb(hex, gain) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * gain));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * gain));
  const b = Math.min(255, Math.round((hex & 255) * gain));
  return (r << 16) | (g << 8) | b;
}

export function createShowcase(canvas) {
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'low-power',
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

  renderer.setClearColor(0x121c28, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.04, 4);

  const hemi = new THREE.HemisphereLight(0xb7d4ff, 0x3a2a22, 0.82);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe2b8, 2.45);
  sun.position.set(0.48, 0.92, -0.52);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.near = 0.12;
  sun.shadow.camera.far = 2.4;
  sun.shadow.camera.left = -0.55;
  sun.shadow.camera.right = 0.55;
  sun.shadow.camera.top = 0.55;
  sun.shadow.camera.bottom = -0.55;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  /*
   * One sun plus a hemisphere. Extra directional lights flatten the toon
   * ramp into a grey average, which is the opposite of the cel look.
   * The rim the materials already carry is the edge light.
   */

  const pedestalMat = celMaterial({
    color: 0x1a2433,
    rim: 0.16,
    spec: 0.12,
    fog: false,
    cloudShadow: 0,
  });
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.20, 0.22, 0.010, 28),
    pedestalMat,
  );
  pedestal.position.y = -0.058;
  pedestal.receiveShadow = true;
  outlineHull(pedestal, 1.04, 0x0c1018);
  scene.add(pedestal);

  const catcher = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 28),
    new THREE.MeshBasicMaterial({
      color: 0x0b121c,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: false,
    }),
  );
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = -0.064;
  scene.add(catcher);

  const washMat = new THREE.MeshBasicMaterial({
    color: 0x9ec8ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const wash = new THREE.Mesh(new THREE.CircleGeometry(0.12, 28), washMat);
  wash.rotation.x = -Math.PI / 2;
  wash.position.y = -0.052;
  scene.add(wash);

  const hero = buildHeroCraft({ fog: false });
  const pose = new THREE.Group();
  pose.add(hero.group);
  scene.add(pose);
  const omega = new THREE.Vector3();
  const dq = new THREE.Quaternion();

  const state = {
    roll: 0,
    pitch: 0,
    yaw: 0,
    height: HOVER,
    az: Math.PI - 0.62,
    el: 0.34,
    dist: 1.32,
    rpm: [0.16, 0.16, 0.16, 0.16],
    spin: [0, 0, 0, 0],
    dragAz: 0,
    dragging: false,
    lastX: 0,
    active: false,
  };

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.dragging = true;
    state.lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.dragging) {
      return;
    }
    state.dragAz += (e.clientX - state.lastX) * 0.007;
    state.lastX = e.clientX;
  });
  const endDrag = (e) => {
    state.dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  const size = { w: 0, h: 0 };
  function resize() {
    const w = canvas.clientWidth || 0;
    const h = canvas.clientHeight || 0;
    if (w < 8 || h < 8) {
      return false;
    }
    if (w === size.w && h === size.h) {
      return true;
    }
    size.w = w;
    size.h = h;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
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
      pose.quaternion.identity();
      pose.position.y = HOVER;
      state.height = HOVER;
    }
    state.active = on;
    if (on) {
      resize();
    }
  }

  function update(dtMs, channels, nowMs, cameraAngle) {
    if (!state.active) {
      return;
    }
    const dt = Math.min(0.05, Math.max(0, dtMs) * 0.001);
    const t = nowMs * 0.001;
    const roll = channels.roll || 0;
    const pitch = channels.pitch || 0;
    const yaw = channels.yaw || 0;
    const thr = clamp01(channels.throttle || 0);

    /*
     * Acro, not angle. Stick is a rate in the body frame. There is no
     * spring back to level: hands off, the attitude stays where it is.
     */
    const rr = Math.abs(roll) > STICK_DEAD ? roll : 0;
    const pp = Math.abs(pitch) > STICK_DEAD ? pitch : 0;
    const yy = Math.abs(yaw) > STICK_DEAD ? yaw : 0;
    omega.set(pp * RATE_PITCH, -yy * RATE_YAW, -rr * RATE_ROLL);
    const half = dt * 0.5;
    dq.set(omega.x * half, omega.y * half, omega.z * half, 1).normalize();
    pose.quaternion.multiply(dq);
    const bob = Math.sin(t * 2.15) * 0.0045 + Math.sin(t * 3.4) * 0.002;
    state.height = damp(state.height, HOVER + thr * LIFT + bob, 6, dt);
    pose.position.y = state.height;

    const tilt = ((cameraAngle ?? 30) * Math.PI) / 180;
    hero.cameraMount.rotation.x = tilt;

    const mix = motorMix(thr, roll, pitch, yaw);
    for (let m = 0; m < 4; m += 1) {
      state.rpm[m] = damp(state.rpm[m], mix[m], 9, dt);
      const rate = (9 + state.rpm[m] * 48) * PROP_SPIN[m];
      state.spin[m] += rate * dt;
      hero.blades[m].rotation.y = state.spin[m];
      hero.discs[m].material.opacity = 0.08 + state.rpm[m] * 0.40;
      const led = hero.leds[m];
      const gain = 0.28 + state.rpm[m] * 0.95;
      led.mat.color.setHex(hexRgb(led.base, gain));
    }

    const hot = 0.12 + thr * 0.62;
    hero.stator.emissive.setRGB(0.50 * hot, 0.14 * hot, 0.04 * hot);
    hero.stator.emissiveIntensity = 0.8;

    washMat.opacity = thr * 0.12;
    wash.scale.setScalar(0.85 + thr * 0.55);

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
    camera.lookAt(0, 0.01, 0.02);
  }

  function render() {
    if (!state.active || !resize()) {
      return;
    }
    renderer.render(scene, camera);
  }

  function dispose() {
    ro.disconnect();
    renderer.dispose();
  }

  return { update, render, setActive, dispose, failed: false };
}
