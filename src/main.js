/*
 * main.js: the Stage 1 shell. Loads dist/sim.wasm, feeds it timestamped
 * stick samples, steps it on a fixed 1 kHz accumulator driven by
 * requestAnimationFrame, and renders an interpolated view. The frame
 * delta clocks the accumulator and never reaches the integrator; a
 * dropped frame changes nothing about the trajectory.
 *
 * Ground handling is deliberately shell side: the physics module has no
 * ground plane (the verification harness measures free air behaviour), so
 * the shell spawns the quad at altitude and declares a crash when it
 * reaches the ground, then resets. See PROGRESS.md.
 *
 * Keys: R reset, C camera, M stick calibration, V battery voltage.
 * Sticks: radio in joystick mode (Gamepad API) or WASD plus arrows.
 * Drop a Betaflight diff file onto the page to fly your own config.
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
import { buildScene } from './render/scene.js';
import { simPosToThree, simQuatToThree } from './render/frame.js';
import { InputManager } from './input/input.js';
import { loadSim, simErrorName, SIM_OK } from '/tests/lib/simmod.js';

const SPAWN_ALT = 1.5; /* metres between sim z = 0 and the ground plane */
const CELL_VOLTAGES = [4.2, 3.8, 3.5];

const hud = document.getElementById('hud');
const msg = document.getElementById('msg');

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function boot() {
  const canvas = document.getElementById('view');
  const view = buildScene(canvas);
  const input = new InputManager();

  const sim = await loadSim(await fetchBytes('/dist/sim.wasm'));
  let configName = 'config-baseline.diff';
  let configText = new TextDecoder().decode(
    await fetchBytes('/tests/fixtures/config-baseline.diff'),
  );
  if (sim.init(configText) !== SIM_OK) {
    throw new Error('sim_init failed on the default config');
  }

  let cellIdx = 0;
  let simTimeMs = 0;
  let acc = 0;
  let lastTs = 0;
  let crashed = false;
  let crashedAtWall = 0;
  let camMode = 'fpv';
  let statePrev = null;
  let stateCurr = null;
  let fps = 0;

  function readState() {
    const { code, state } = sim.readState();
    if (code !== SIM_OK) {
      throw new Error(`sim_state: ${simErrorName(code)}`);
    }
    return state;
  }

  function reset() {
    sim.reset();
    sim.setCellVoltage(CELL_VOLTAGES[cellIdx]);
    simTimeMs = 0;
    acc = 0;
    lastTs = 0;
    crashed = false;
    input.drain();
    input.kb.throttle = 0;
    statePrev = readState();
    stateCurr = statePrev;
  }
  reset();

  input.onKey = (code) => {
    if (code === 'KeyR') {
      reset();
    } else if (code === 'KeyC') {
      camMode = camMode === 'fpv' ? 'chase' : 'fpv';
    } else if (code === 'KeyM') {
      input.startCalibration();
    } else if (code === 'KeyV') {
      cellIdx = (cellIdx + 1) % CELL_VOLTAGES.length;
      sim.setCellVoltage(CELL_VOLTAGES[cellIdx]);
    }
  };

  /* Fly your own Betaflight diff: drop the file anywhere on the page. */
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    const code = sim.init(text);
    if (code === SIM_OK) {
      configText = text;
      configName = file.name;
      reset();
    } else {
      msg.textContent = `diff rejected: ${simErrorName(code)}`;
      sim.init(configText);
      reset();
    }
  });

  const pPrev = new THREE.Vector3();
  const pCurr = new THREE.Vector3();
  const qPrev = new THREE.Quaternion();
  const qCurr = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0), (20 * Math.PI) / 180,
  );
  const camPos = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  let prevWall = performance.now();

  function frame(nowWall) {
    requestAnimationFrame(frame);
    const dt = Math.min(nowWall - prevWall, 100);
    const frameStart = prevWall;
    prevWall = nowWall;
    fps = fps * 0.95 + (dt > 0 ? 1000 / dt : 0) * 0.05;

    input.poll(nowWall);
    const samples = input.drain();

    if (!crashed) {
      acc += dt;
      let steps = Math.floor(acc);
      acc -= steps;
      /* Cap a huge stall (tab hidden) to keep the loop responsive. */
      if (steps > 100) {
        steps = 100;
      }
      for (const s of samples) {
        let off = s.wallT - frameStart;
        if (!(off >= 0)) {
          off = 0;
        }
        if (off > steps) {
          off = steps;
        }
        let ts = (simTimeMs + off) / 1000;
        if (ts < lastTs) {
          ts = lastTs;
        }
        lastTs = ts;
        sim.input(ts, s.roll, s.pitch, s.yaw, s.throttle);
      }
      if (steps >= 1) {
        if (steps > 1) {
          sim.step(steps - 1);
          statePrev = readState();
        } else {
          statePrev = stateCurr;
        }
        sim.step(1);
        stateCurr = readState();
        simTimeMs += steps;
      }
      if (stateCurr[3] + SPAWN_ALT <= 0.03 && simTimeMs > 50) {
        crashed = true;
        crashedAtWall = nowWall;
      }
    } else if (nowWall - crashedAtWall > 2500) {
      reset();
    }

    /* Render: interpolate the two most recent physics states. */
    const a = Math.max(0, Math.min(1, acc));
    simPosToThree(statePrev[1], statePrev[2], statePrev[3] + SPAWN_ALT, pPrev);
    simPosToThree(stateCurr[1], stateCurr[2], stateCurr[3] + SPAWN_ALT, pCurr);
    pCurr.lerpVectors(pPrev, pCurr, a);
    simQuatToThree(statePrev[7], statePrev[8], statePrev[9], statePrev[10], qPrev);
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qCurr);
    qPrev.slerp(qCurr, a);
    view.quad.position.copy(pCurr);
    view.quad.quaternion.copy(qPrev);

    if (camMode === 'fpv') {
      view.camera.position.copy(pCurr);
      view.camera.quaternion.copy(qPrev).multiply(qTilt);
    } else {
      fwd.set(0, 0, -1).applyQuaternion(qPrev);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) {
        fwd.set(0, 0, -1);
      }
      fwd.normalize();
      camPos.copy(pCurr).addScaledVector(fwd, -3.5);
      camPos.y = Math.max(pCurr.y + 1.2, 0.3);
      view.camera.position.copy(camPos);
      view.camera.lookAt(pCurr);
    }

    view.renderer.render(view.scene, view.camera);

    const cal = input.calibrationPrompt();
    if (cal) {
      msg.textContent = cal;
    } else if (crashed) {
      msg.textContent = 'CRASHED\npress R (auto reset shortly)';
    } else {
      msg.textContent = '';
    }
    const st = stateCurr;
    const speed = Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);
    const ch = input.channels;
    hud.textContent =
      `input  ${input.source}\n` +
      `config ${configName}  cell ${CELL_VOLTAGES[cellIdx].toFixed(2)} V (V cycles)\n` +
      `roll ${ch.roll.toFixed(2)}  pitch ${ch.pitch.toFixed(2)}  yaw ${ch.yaw.toFixed(2)}  thr ${ch.throttle.toFixed(2)}\n` +
      `alt ${(st[3] + SPAWN_ALT).toFixed(1)} m  speed ${speed.toFixed(1)} m/s  vbat ${st[18].toFixed(1)} V  ${st[19].toFixed(0)} A\n` +
      `cam ${camMode} (C)  reset R  calibrate M  fps ${fps.toFixed(0)}`;

    window.__shellReady = true;
  }
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  msg.textContent = `failed to start:\n${e.message}`;
});
