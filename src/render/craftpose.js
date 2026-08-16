/*
 * craftpose.js: stick to attitude for the studio airframe.
 *
 * Visual only. The flying craft is posed by Betaflight; this is the
 * Settings product shot. Nothing here reaches the plant.
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
import { PROP_SPIN } from './herocraft.js';

const RATE_ROLL = 2.8;
const RATE_PITCH = 2.8;
const RATE_YAW = 2.4;
const STICK_DEAD = 0.14;
export const HOVER = 0.016;
const LIFT = 0.038;

/* Exponential approach, frame rate independent. Exported because
 * showcase.js had its own byte-identical copy. RENDER SIDE ONLY: this uses
 * Math.exp, which the physics path is not allowed to touch. */
export function damp(cur, target, lambda, dt) {
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

/*
 * One pose solver. Allocations live here, not in the frame.
 */
export function createCraftPose() {
  const omega = new THREE.Vector3();
  const dq = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const state = {
    tiltP: 0,
    tiltR: 0,
    yawH: 0,
    wasAngle: false,
    height: HOVER,
    rpm: [0.16, 0.16, 0.16, 0.16],
    spin: [0, 0, 0, 0],
  };

  function reset(pose) {
    if (pose) {
      pose.quaternion.identity();
      pose.position.y = HOVER;
    }
    state.tiltP = 0;
    state.tiltR = 0;
    state.yawH = 0;
    state.wasAngle = false;
    state.height = HOVER;
    state.rpm[0] = 0.16;
    state.rpm[1] = 0.16;
    state.rpm[2] = 0.16;
    state.rpm[3] = 0.16;
    state.spin[0] = 0;
    state.spin[1] = 0;
    state.spin[2] = 0;
    state.spin[3] = 0;
  }

  function update(dtMs, channels, nowMs, cameraAngle, angleMode, hero, pose) {
    const dt = Math.min(0.05, Math.max(0, dtMs) * 0.001);
    const t = nowMs * 0.001;
    const roll = channels.roll || 0;
    const pitch = channels.pitch || 0;
    const yaw = channels.yaw || 0;
    const thr = clamp01(channels.throttle || 0);

    const rr = Math.abs(roll) > STICK_DEAD ? roll : 0;
    const pp = Math.abs(pitch) > STICK_DEAD ? pitch : 0;
    const yy = Math.abs(yaw) > STICK_DEAD ? yaw : 0;

    if (angleMode) {
      /*
       * Visual only. Stick is a tilt, hands off levels, yaw stays a
       * rate, which is what ANGLE_MODE does on the axes it owns.
       */
      if (!state.wasAngle) {
        pose.quaternion.identity();
        state.tiltP = 0;
        state.tiltR = 0;
        state.yawH = 0;
      }
      state.wasAngle = true;
      const MAX = 0.70;
      const k = 1 - Math.exp(-10 * dt);
      state.tiltP += (pp * MAX - state.tiltP) * k;
      state.tiltR += (rr * MAX - state.tiltR) * k;
      state.yawH += yy * RATE_YAW * dt;
      euler.set(state.tiltP, -state.yawH, -state.tiltR, 'YXZ');
      pose.quaternion.setFromEuler(euler);
    } else {
      /*
       * Acro. Stick is a rate in the body frame. Hands off, the
       * attitude stays where it is.
       */
      state.wasAngle = false;
      omega.set(pp * RATE_PITCH, -yy * RATE_YAW, -rr * RATE_ROLL);
      const half = dt * 0.5;
      dq.set(omega.x * half, omega.y * half, omega.z * half, 1).normalize();
      pose.quaternion.multiply(dq);
    }
    const bob = Math.sin(t * 2.15) * 0.0045 + Math.sin(t * 3.4) * 0.002;
    state.height = damp(state.height, HOVER + thr * LIFT + bob, 6, dt);
    pose.position.y = state.height;

    hero.cameraMount.rotation.x = ((cameraAngle ?? 30) * Math.PI) / 180;

    const mixed = motorMix(thr, roll, pitch, yaw);
    for (let m = 0; m < 4; m += 1) {
      state.rpm[m] = damp(state.rpm[m], mixed[m], 9, dt);
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
    return thr;
  }

  return { update, reset, state };
}
