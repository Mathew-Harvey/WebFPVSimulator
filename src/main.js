/*
 * main.js: the shell. Loads dist/sim.wasm, feeds it timestamped stick
 * samples, steps it on a fixed 1 kHz accumulator driven by
 * requestAnimationFrame, renders an interpolated view, and drives the
 * product shell in src/ui/ui.js. The frame delta clocks the accumulator
 * and never reaches the integrator; a dropped frame changes nothing about
 * the trajectory.
 *
 * The page opens on a title, with the world alive behind it and the camera
 * circling the start gate. Physics steps only while a run is in progress,
 * so a paused game or a results screen costs the trajectory nothing.
 *
 * Ground handling is deliberately shell side: the physics module has no
 * ground plane (the verification harness measures free air behaviour), so
 * the shell spawns the quad at altitude and declares a crash when it
 * reaches the ground, then resets. See PROGRESS.md.
 *
 * Keys in flight: Escape pauses, R returns to the start line, F3 toggles
 * the performance readout. Everything else is a menu choice.
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
import { measureBudget } from './render/budget.js';
import { simPosToThree, simQuatToThree } from './render/frame.js';
import { MotorAudio } from './render/audio.js';
import { InputManager } from './input/input.js';
import { Race } from './game/race.js';
import { Ui } from './ui/ui.js';
import { loadSim, simErrorName, SIM_OK } from '/tests/lib/simmod.js';

const SPAWN_ALT = 1.5; /* metres between sim z = 0 and the ground plane */
/* The controller consumes each input sample as one RC frame, so the shell
 * must feed it at a radio's rate rather than the display's. 250 Hz is a
 * typical ELRS link and matches the harness recording rate. */
const RC_HZ = 250;
/* Pack nominal, for the charge bar: 6S between empty and full. */
const PACK_EMPTY_V = 6 * 3.3;
const PACK_FULL_V = 6 * 4.2;

const uiRoot = document.getElementById('ui');

/*
 * Why a dropped tune was refused, in words. The module answers with a
 * code, and a code on screen is developer output: the player wants to
 * know whether to blame the file or the game.
 */
function configFault(code) {
  if (code === -4) {
    return 'It does not look like a Betaflight diff.';
  }
  if (code === -2) {
    return 'The file was empty or too large.';
  }
  return 'The simulator refused it and kept your previous tune.';
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/* P6: navigation to the first interactive frame. Stamped here rather than
 * inside boot so it covers module evaluation as well as boot's own work,
 * and read back through window.__boot. */
const BOOT_START = performance.now();

async function boot() {
  const canvas = document.getElementById('view');
  const view = buildScene(canvas);
  const input = new InputManager();
  const ui = new Ui(uiRoot);

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
    return `webfpv.best.${h.toString(16)}.${runVoltage.toFixed(2)}`;
  }

  let mode = 'title'; /* title, flight, paused, results */
  let simTimeMs = 0;
  let acc = 0;
  let lastTs = 0;
  let rcNextMs = 0;
  let crashed = false;
  let crashedAtWall = 0;
  /* Physics holds until the pilot first raises throttle: a run should
   * start when the pilot says so, not with a falling catch at spawn. */
  let launched = false;
  let statePrev = null;
  let stateCurr = null;
  let fps = 0;
  let camTilt = ui.settings.cameraAngle;
  let runVoltage = ui.settings.packVoltage;
  let notice = null; /* { text, untilMs } for one off shell messages */
  race.setRecordKey(recordKey());
  ui.setBest(race.bestMs);

  function readState() {
    const { code, state } = sim.readState();
    if (code !== SIM_OK) {
      throw new Error(`sim_state: ${simErrorName(code)}`);
    }
    return state;
  }

  /*
   * Put the craft back on the start line without ending the run. A crash
   * costs the lap it happens on, not the laps already flown: erasing three
   * clean laps because of one clipped tree is not how a race works.
   */
  function resetCraft() {
    sim.reset();
    sim.setCellVoltage(runVoltage);
    simTimeMs = 0;
    acc = 0;
    lastTs = 0;
    rcNextMs = 0;
    crashed = false;
    launched = false;
    input.keys.clear();
    input.drain();
    input.kb.throttle = 0;
    input.kb.roll = 0;
    input.kb.pitch = 0;
    input.kb.yaw = 0;
    raceHasPrev = false;
    statePrev = readState();
    stateCurr = statePrev;
  }

  function reset() {
    /* The pack charge a run flies on is fixed when the run starts. It is
     * a setting, and settings are reachable from the pause menu, so
     * without this a player could change packs mid run and have the lap
     * compared against another pack's record. */
    runVoltage = ui.settings.packVoltage;
    sim.reset();
    sim.setCellVoltage(runVoltage);
    simTimeMs = 0;
    acc = 0;
    lastTs = 0;
    rcNextMs = 0;
    crashed = false;
    launched = false;
    input.keys.clear();
    input.drain();
    input.kb.throttle = 0;
    input.kb.roll = 0;
    input.kb.pitch = 0;
    input.kb.yaw = 0;
    race.reset();
    view.setNextGate(race.nextSceneIndex());
    raceHasPrev = false;
    statePrev = readState();
    stateCurr = statePrev;
  }
  reset();

  function applySettings(s) {
    camTilt = s.cameraAngle;
    qTilt.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (camTilt * Math.PI) / 180);
    if (mode === 'title') {
      /* Between runs the choice takes effect at once. During a run it
       * waits for the next one, so the record it is measured against is
       * the pack it was flown on. */
      runVoltage = s.packVoltage;
      sim.setCellVoltage(runVoltage);
    }
    race.setRecordKey(recordKey());
    ui.setBest(race.bestMs);
    audio.setLevel(s.volume / 10);
    audio.setEnabled(s.sound);
    ui.setReadout('');
  }

  ui.onSettings = applySettings;
  ui.onAction = (action, s) => {
    if (action === 'fly' || action === 'restart') {
      reset();
      mode = 'flight';
      ui.show('flight');
    } else if (action === 'resume') {
      mode = 'flight';
      ui.show('flight');
    } else if (action === 'pause') {
      mode = 'paused';
    } else if (action === 'title') {
      mode = 'title';
      reset();
    } else if (action === 'calibrate') {
      if (input.firstGamepad()) {
        input.startCalibration();
      } else {
        notice = { text: 'No radio or gamepad found.\nPlug one in, set it to joystick mode, and reload.', untilMs: performance.now() + 3200 };
      }
    }
    if (s) {
      applySettings(s);
    }
  };

  /*
   * Menu intent from a radio. When the sticks have been calibrated the
   * mapped channels drive the cursor, which lets roll adjust a value. When
   * they have not, any axis at all moves the cursor, because the way to
   * calibrate is a menu item and a wrong axis guess would otherwise lock
   * the player out of it.
   */
  function padNav() {
    const btn = input.padMenuButtons();
    if (input.map.stored) {
      const c = input.channels;
      return {
        up: c.pitch > 0.55,
        down: c.pitch < -0.55,
        right: c.roll > 0.55,
        left: c.roll < -0.55,
        select: btn.select,
        back: btn.back,
      };
    }
    const raw = input.navRaw();
    return { up: raw.up, down: raw.down, right: false, left: false, select: btn.select, back: btn.back };
  }

  /* Any real key or pointer press is the user gesture browsers require
   * before audio can start. */
  function wakeAudio() {
    if (ui.settings.sound && !audio.ctx) {
      audio.start();
      audio.setLevel(ui.settings.volume / 10);
    }
    audio.setEnabled(ui.settings.sound);
  }

  input.onKey = (code) => {
    wakeAudio();
    if (ui.handleKey(code)) {
      return;
    }
    /* Flight only keys. */
    if (code === 'KeyR') {
      reset();
    }
  };
  window.addEventListener('pointerdown', wakeAudio);

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
      ui.setBest(race.bestMs);
      notice = { text: `Flying ${configName}`, untilMs: performance.now() + 2400 };
      reset();
    } else {
      notice = { text: `That tune could not be read.\n${configFault(code)}`, untilMs: performance.now() + 3600 };
      sim.init(configText);
      reset();
    }
  });

  const pPrev = new THREE.Vector3();
  const pCurr = new THREE.Vector3();
  const qPrev = new THREE.Quaternion();
  const qCurr = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const qSpawn = new THREE.Quaternion();
  const pProbe = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const orbitTarget = new THREE.Vector3();
  applySettings(ui.settings);

  /* Fixed for the whole session: the start gate's placement in the world.
   * Set once here because the crash check needs it before the render
   * block runs. */
  qSpawn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), startYaw);

  let prevWall = performance.now();
  /* Harness camera override, six numbers: position then look at target. */
  let camOverride = null;
  const camLookAt = new THREE.Vector3();

  function frame(nowWall) {
    requestAnimationFrame(frame);
    const blockStart = performance.now();
    const dt = Math.min(nowWall - prevWall, 100);
    prevWall = nowWall;
    fps = fps * 0.95 + (dt > 0 ? 1000 / dt : 0) * 0.05;

    input.poll(nowWall);
    const samples = input.drain();
    if (ui.isModal()) {
      ui.pollPad(padNav());
    }

    if (mode === 'flight' && !crashed && !launched) {
      const thr = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
      if (thr > 0.05) {
        launched = true;
      }
    }
    if (mode === 'flight' && !crashed && launched) {
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
      /* Ground contact. The height is sampled at the position the craft
       * has just been integrated to, not at the previous frame's, because
       * at a low frame rate the two are metres apart and the check would
       * read the wrong hillside. */
      simPosToThree(stateCurr[1], stateCurr[2], stateCurr[3] + SPAWN_ALT + startY, pProbe);
      pProbe.applyQuaternion(qSpawn);
      pProbe.x += startX;
      pProbe.z += startZ;
      if (pProbe.y <= view.height(pProbe.x, pProbe.z) + 0.03 && simTimeMs > 50) {
        crashed = true;
        crashedAtWall = nowWall;
        race.voidLap('Crashed\nLap void', nowWall);
        view.setNextGate(race.nextSceneIndex());
      }
    } else if (mode === 'flight' && crashed && nowWall - crashedAtWall > 1400) {
      /* Short lockout, then back on the line. The lap is gone, the run is
       * not. */
      resetCraft();
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
    if (mode === 'flight' && !crashed && launched) {
      if (raceHasPrev) {
        const res = race.update(racePrev, pCurr, simNow, nowWall);
        if (res.passed != null || res.hitFrame) {
          view.setNextGate(race.nextSceneIndex());
        }
        if (race.lap >= ui.settings.laps) {
          mode = 'results';
          ui.setBest(race.bestMs);
          ui.showResults(race.log, race.bestMs);
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

    if (mode !== 'title') {
      /* The camera sits inside the airframe, so the quad must be hidden or
       * you fly looking at the inside of its own outline hull. */
      view.quad.visible = false;
      view.camera.position.copy(pCurr);
      view.camera.quaternion.copy(qPrev).multiply(qTilt);
    } else {
      /* Attract view: the craft parked on the line, camera circling wide
       * and high enough that the valley and the gate both read, and that
       * near grass does not fill the frame. */
      view.quad.visible = true;
      const ang = nowWall * 0.00011;
      const r = 19;
      camPos.set(
        start.position.x + Math.sin(ang) * r,
        start.position.y + 7,
        start.position.z + Math.cos(ang) * r,
      );
      orbitTarget.set(start.position.x, start.position.y + 2.5, start.position.z);
      view.camera.position.copy(camPos);
      view.camera.lookAt(orbitTarget);
    }

    /* Harness camera. The cost ledger has to be published for three views,
     * and two of them are not views the shell puts the camera in: the
     * ledger's mid course view is a point on the racing line, and flying
     * there at this container's frame rate is not a capture. Nothing in
     * the shell writes camOverride, and the check is a property read on a
     * scalar, so it allocates nothing. */
    if (camOverride) {
      view.camera.position.set(camOverride[0], camOverride[1], camOverride[2]);
      view.camera.up.set(0, 1, 0);
      view.camera.lookAt(camLookAt.set(camOverride[3], camOverride[4], camOverride[5]));
    }

    view.updateShadowFocus(camOverride ? view.camera.position : pCurr);
    /* Propwash strength for the grass: mean rotor speed against hover. */
    const meanRpm = (stateCurr[14] + stateCurr[15] + stateCurr[16] + stateCurr[17]) * 0.25;
    view.updateWind(nowWall * 0.001, pCurr, Math.min(1.3, meanRpm / 9000));
    /* info is accumulated across the whole frame (prepass, shadow map,
     * composer passes) and read back through __renderStats. */
    view.renderer.info.reset();
    const renderStart = performance.now();
    post.render();
    const renderMs = performance.now() - renderStart;
    renderStats.calls = view.renderer.info.render.calls;
    renderStats.triangles = view.renderer.info.render.triangles;

    /* Overlay. */
    const st = stateCurr;
    const speed = Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);
    audio.update([st[14], st[15], st[16], st[17]], mode === 'flight' ? speed : 0);
    if (mode === 'flight') {
      ui.setOsd({
        lapMs: race.currentLapMs(simNow),
        gate: race.next + 1,
        gateCount: race.gates.length,
        volts: st[18],
        lastLapMs: race.lastLapMs,
        packFrac: (st[18] - PACK_EMPTY_V) / (PACK_FULL_V - PACK_EMPTY_V),
        altitude: st[3] + SPAWN_ALT,
        speedKph: speed * 3.6,
        throttle: input.channels.throttle,
      });
    }

    const cal = input.calibrationPrompt();
    const lapFlash = race.flashText(nowWall);
    if (cal) {
      ui.setBanner(cal, true);
    } else if (notice && nowWall < notice.untilMs) {
      ui.setBanner(notice.text);
    } else if (ui.isModal()) {
      /* A banner is a flight message. Any screen that is up owns the
       * frame, and a launch prompt printed across a results table is how
       * you find that out. */
      ui.setBanner('');
    } else if (crashed) {
      ui.setBanner('Crashed');
    } else if (!launched) {
      ui.setBanner('Throttle up to launch\nThe mint ring starts your lap');
    } else if (lapFlash) {
      ui.setBanner(lapFlash);
    } else {
      ui.setBanner('');
    }

    if (ui.settings.readout) {
      /* Performance only. The setting promises frame rate and draw
       * counts, so anything else here is developer output that the
       * player did not ask for. */
      ui.setReadout(
        `${fps.toFixed(0)} frames per second\n` +
        `${renderStats.calls} draw calls\n` +
        `${(renderStats.triangles / 1000).toFixed(0)}k triangles`,
      );
    } else {
      ui.setReadout('');
    }

    window.__shellReady = true;
    window.__mode = mode;
    window.__screen = ui.screen;

    /* P7. The whole frame callback is one synchronous block on the main
     * thread, and blockMs is its length. renderMs is the part of it inside
     * post.render, split out because in a software rasterised container
     * that part is rasterisation on the CPU and says nothing about a real
     * GPU, while blockMs minus renderMs is the shell's own work and is
     * hardware independent. Two scalars, written not allocated: P8 forbids
     * a new object here. */
    const blockMs = performance.now() - blockStart;
    if (frames > 2) {
      if (blockMs > worstBlockMs) {
        worstBlockMs = blockMs;
      }
      if (blockMs - renderMs > worstShellMs) {
        worstShellMs = blockMs - renderMs;
      }
    }
    frames += 1;
    if (firstFrameMs < 0) {
      firstFrameMs = performance.now() - BOOT_START;
    }
  }
  let worstBlockMs = 0;
  let worstShellMs = 0;
  let firstFrameMs = -1;
  let frames = 0;
  /* Render statistics for the harness and the frame budget gate. */
  const renderStats = { calls: 0, triangles: 0 };
  view.renderer.info.autoReset = false;
  window.__renderStats = () => ({ ...renderStats });
  /* Handles the screenshot harness uses to reach a screen that would
   * otherwise need a flown lap. Nothing in the shell reads them. */
  window.__ui = ui;
  window.__race = race;
  /* The cost ledger. Measured on demand from the harness, never per
   * frame. __setCam parks the camera for a named view; __setCam(null)
   * gives it back to the shell. */
  window.__setCam = (a, b, c, d, e, f) => {
    camOverride = a == null ? null : [a, b, c, d, e, f];
  };
  window.__trackPoint = (u) => {
    const p = view.curve.getPointAt(u);
    const t = view.curve.getTangentAt(u);
    return { x: p.x, y: p.y, z: p.z, tx: t.x, tz: t.z, ground: view.height(p.x, p.z) };
  };
  window.__boot = () => ({
    firstFrameMs,
    worstBlockMs,
    worstShellMs,
    frames,
  });
  window.__budget = (name) => measureBudget(view, post, { view: name });
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  const p = document.createElement('div');
  p.className = 'banner';
  p.style.opacity = '1';
  p.textContent = `The simulator could not start.\n${e.message}`;
  uiRoot.append(p);
});
