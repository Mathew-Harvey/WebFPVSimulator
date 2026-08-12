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
import { buildComposer } from './render/post.js';
import { simPosToThree, simQuatToThree } from './render/frame.js';
import { MotorAudio } from './render/audio.js';
import { InputManager } from './input/input.js';
import { Race } from './game/race.js';
import { loadSim, simErrorName, SIM_OK } from '/tests/lib/simmod.js';

const SPAWN_ALT = 1.5; /* metres between sim z = 0 and the ground plane */
const CELL_VOLTAGES = [4.2, 3.8, 3.5];
/* Camera uptilt. 30 degrees is a freestyle angle: it puts the horizon low
 * in frame so the ground rushes past and forward flight sits level. */
const CAM_TILT_DEG = 30;
/* The controller consumes each input sample as one RC frame, so the shell
 * must feed it at a radio's rate rather than the display's. 250 Hz is a
 * typical ELRS link and matches the harness recording rate. */
const RC_HZ = 250;

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

  const post = buildComposer(view.renderer, view.scene, view.camera);
  window.addEventListener('resize', () => {
    const d = view.resize();
    post.setSize(d.w, d.h);
  });
  const audio = new MotorAudio();
  const sim = await loadSim(await fetchBytes('/dist/sim.wasm'));
  let configName = 'freestyle.diff';
  let configText = new TextDecoder().decode(await fetchBytes('/configs/freestyle.diff'));
  if (sim.init(configText) !== SIM_OK) {
    throw new Error('sim_init failed on the default config');
  }

  /* Spawn a few metres BEHIND the start line, facing down the circuit:
   * parked exactly on the timing plane, the first millimetre of drift
   * would arm the lap clock at zero airspeed. The craft faces opposite
   * the course tangent, so behind the line is along +tangent. */
  const start = view.gates[0];
  const startYaw = start.heading;
  const SPAWN_BACK = 7;
  const startX = start.position.x + Math.sin(startYaw) * SPAWN_BACK;
  const startZ = start.position.z + Math.cos(startYaw) * SPAWN_BACK;
  /* Terrain here is not at y = 0. Spawning without its height puts the
   * craft underground, looking up at the lit underside of the terrain. */
  const startY = view.height(startX, startZ);

  /* The race: gate order, lap clock, best lap, gate frame contact. */
  const race = new Race(view.gates);
  const racePrev = new THREE.Vector3();
  let raceHasPrev = false;

  /* Best laps are only comparable on the same config and pack voltage. */
  function recordKey() {
    let h = 5381;
    for (let i = 0; i < configText.length; i += 1) {
      h = ((h * 33) ^ configText.charCodeAt(i)) >>> 0;
    }
    return `webfpv.best.${h.toString(16)}.${CELL_VOLTAGES[cellIdx].toFixed(2)}`;
  }

  let cellIdx = 0;
  let simTimeMs = 0;
  let acc = 0;
  let lastTs = 0;
  let rcNextMs = 0;
  let crashed = false;
  let crashedAtWall = 0;
  /* Physics holds until the pilot first raises throttle: a run should
   * start when the pilot says so, not with a falling catch at spawn. */
  let launched = false;
  let camMode = 'fpv';
  let statePrev = null;
  let stateCurr = null;
  let fps = 0;
  race.setRecordKey(recordKey());

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
    rcNextMs = 0;
    crashed = false;
    launched = false;
    input.drain();
    input.kb.throttle = 0;
    race.reset();
    view.setNextGate(race.nextSceneIndex());
    raceHasPrev = false;
    statePrev = readState();
    stateCurr = statePrev;
  }
  reset();

  let audioOn = false;
  input.onKey = (code) => {
    /* Any key counts as the user gesture browsers require for audio. */
    if (audioOn && !audio.ctx) {
      audio.start();
    }
    if (code === 'KeyR') {
      reset();
    } else if (code === 'KeyC') {
      camMode = camMode === 'fpv' ? 'chase' : 'fpv';
    } else if (code === 'KeyM') {
      input.startCalibration();
    } else if (code === 'KeyV') {
      cellIdx = (cellIdx + 1) % CELL_VOLTAGES.length;
      sim.setCellVoltage(CELL_VOLTAGES[cellIdx]);
      race.setRecordKey(recordKey());
    } else if (code === 'KeyN') {
      audioOn = audio.toggle();
    }
  };
  window.addEventListener('pointerdown', () => {
    if (audioOn && !audio.ctx) {
      audio.start();
    }
  });

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
      race.setRecordKey(recordKey());
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
    new THREE.Vector3(1, 0, 0), (CAM_TILT_DEG * Math.PI) / 180,
  );
  const qSpawn = new THREE.Quaternion();
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

    if (!crashed && !launched) {
      const thr = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
      if (thr > 0.05) {
        launched = true;
      }
    }
    if (!crashed && launched) {
      acc += dt;
      let steps = Math.floor(acc);
      acc -= steps;
      /* Cap a huge stall (tab hidden) to keep the loop responsive. */
      if (steps > 100) {
        steps = 100;
      }
      /* Resample the polled stick values onto a fixed RC frame grid. The
       * display runs at whatever rate it runs at; the radio does not, and
       * the controller's feedforward and smoothing read the frame
       * interval directly. */
      const latest = samples.length ? samples[samples.length - 1] : input.channels;
      const framePeriod = 1000 / RC_HZ;
      while (rcNextMs < simTimeMs + steps) {
        let ts = rcNextMs / 1000;
        if (ts < lastTs) {
          ts = lastTs;
        }
        lastTs = ts;
        sim.input(ts, latest.roll, latest.pitch, latest.yaw, latest.throttle);
        rcNextMs += framePeriod;
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
      if (stateCurr[3] + SPAWN_ALT + startY <= view.height(pCurr.x, pCurr.z) + 0.03 && simTimeMs > 50) {
        crashed = true;
        crashedAtWall = nowWall;
      }
    } else if (crashed && nowWall - crashedAtWall > 1200) {
      /* Short lockout: a crash costs the lap already, staring at a
       * CRASHED card for seconds on top of that is just dead time. */
      reset();
    }

    /* Render: interpolate the two most recent physics states. The sim
     * flies about its own origin; the start gate placement is a render
     * side offset and rotation, so nothing about the trajectory changes. */
    const a = Math.max(0, Math.min(1, acc));
    simPosToThree(statePrev[1], statePrev[2], statePrev[3] + SPAWN_ALT + startY, pPrev);
    simPosToThree(stateCurr[1], stateCurr[2], stateCurr[3] + SPAWN_ALT + startY, pCurr);
    pCurr.lerpVectors(pPrev, pCurr, a);
    simQuatToThree(statePrev[7], statePrev[8], statePrev[9], statePrev[10], qPrev);
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qCurr);
    qPrev.slerp(qCurr, a);
    qSpawn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), startYaw);
    pCurr.applyQuaternion(qSpawn);
    pCurr.x += startX;
    pCurr.z += startZ;
    qPrev.premultiply(qSpawn);
    view.quad.position.copy(pCurr);
    view.quad.quaternion.copy(qPrev);

    /* Race logic runs on the rendered world position, timed on the sim
     * clock at that state: gate crossings are swept over the frame's
     * travel, so speed cannot tunnel a gate, and a gate frame tap voids
     * the lap rather than destroying the craft. */
    const simNow = simTimeMs > 0 ? simTimeMs - 1 + a : 0;
    if (!crashed && launched) {
      if (raceHasPrev) {
        const res = race.update(racePrev, pCurr, simNow, nowWall);
        if (res.passed != null || res.hitFrame) {
          view.setNextGate(race.nextSceneIndex());
        }
      }
      racePrev.copy(pCurr);
      raceHasPrev = true;
    }

    /* Prop discs spin at a visibly aliased fraction of true RPM, the way
     * they read on a real FPV feed. */
    for (let m = 0; m < 4; m += 1) {
      view.discs[m].rotation.y += stateCurr[14 + m] * 1e-4;
    }

    if (camMode === 'fpv') {
      /* The camera sits inside the airframe, so the quad must be hidden or
       * you fly looking at the inside of its own outline hull. */
      view.quad.visible = false;
      view.camera.position.copy(pCurr);
      view.camera.quaternion.copy(qPrev).multiply(qTilt);
    } else {
      view.quad.visible = true;
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

    view.updateShadowFocus(pCurr);
    /* Propwash strength for the grass: mean rotor speed against hover. */
    const meanRpm = (stateCurr[14] + stateCurr[15] + stateCurr[16] + stateCurr[17]) * 0.25;
    view.updateWind(nowWall * 0.001, pCurr, Math.min(1.3, meanRpm / 9000));
    /* info is accumulated across the whole frame (prepass, shadow map,
     * composer passes) and read back through __renderStats. */
    view.renderer.info.reset();
    post.render();
    renderStats.calls = view.renderer.info.render.calls;
    renderStats.triangles = view.renderer.info.render.triangles;

    const cal = input.calibrationPrompt();
    const lapFlash = race.flashText(nowWall);
    if (cal) {
      msg.textContent = cal;
    } else if (crashed) {
      msg.textContent = 'CRASHED';
    } else if (!launched) {
      msg.textContent = 'THROTTLE TO LAUNCH';
    } else if (lapFlash) {
      msg.textContent = lapFlash;
    } else {
      msg.textContent = '';
    }
    const st = stateCurr;
    const speed = Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);
    audio.update([st[14], st[15], st[16], st[17]], speed);
    const ch = input.channels;
    hud.textContent =
      `${race.hudLine(simNow)}\n` +
      `input  ${input.source}\n` +
      `config ${configName}  cell ${CELL_VOLTAGES[cellIdx].toFixed(2)} V (V cycles)\n` +
      `roll ${ch.roll.toFixed(2)}  pitch ${ch.pitch.toFixed(2)}  yaw ${ch.yaw.toFixed(2)}  thr ${ch.throttle.toFixed(2)}\n` +
      `alt ${(st[3] + SPAWN_ALT).toFixed(1)} m  speed ${speed.toFixed(1)} m/s  vbat ${st[18].toFixed(1)} V  ${st[19].toFixed(0)} A\n` +
      `rpm ${st[14].toFixed(0)} ${st[15].toFixed(0)} ${st[16].toFixed(0)} ${st[17].toFixed(0)}\n` +
      `cam ${camMode} (C)  reset R  calibrate M  sound ${audioOn ? 'on' : 'off'} (N)  fps ${fps.toFixed(0)}`;

    window.__shellReady = true;
  }
  /* Render statistics for the harness and the frame budget gate. */
  const renderStats = { calls: 0, triangles: 0 };
  view.renderer.info.autoReset = false;
  window.__renderStats = () => ({ ...renderStats });
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  msg.textContent = `failed to start:\n${e.message}`;
});
