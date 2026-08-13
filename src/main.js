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
import { buildShell } from './render/shell.js';
import { measureBudget } from './render/budget.js';
import { simPosToThree, simQuatToThree } from './render/frame.js';
import { MotorAudio } from './render/audio.js';
import { InputManager } from './input/input.js';
import { Race } from './game/race.js';
import { CRAFT_R, isLanding, GRAZE_SPEED_MAX, LAND_DESCENT_MAX, LAND_HORIZONTAL_MAX, LAND_TILT_MAX_DEG } from './game/collide.js';
import { Ui } from './ui/ui.js';
import { MAPS, mapById } from './maps/registry.js';
import { planStages, moduleCounter, yieldToPaint } from './ui/loading.js';
import { loadSim, simErrorName, SIM_OK } from '/tests/lib/simmod.js';

/*
 * Metres between sim z = 0 and the ground plane, which is where the craft
 * spawns. It used to be 1.5 m, chosen when the gate's aperture centre was
 * 2.5 m up. A regulation 5 ft gate standing on grass has its aperture centre
 * at 0.762 m and its top edge at 1.524 m, so a craft spawned at 1.5 m sits
 * level with the top of the opening and has to descend to fly through the
 * start gate. 0.9 m puts it just below the aperture centre, which is where a
 * pilot actually sets a quad down before a run, and it is still 0.71 m of
 * clearance under the collision sphere.
 */
const SPAWN_ALT = 0.9;
/* The craft rests with its underside on the ground, not its centre. The
 * model's bounding box is 0.11 m tall, so its belly is 0.055 m below centre;
 * a couple of centimetres of skid keeps it from strobing in and out of
 * contact on a slope. */
const REST_HEIGHT = 0.075;
/* Raising the throttle this far off the ground is a deliberate takeoff. The
 * launch latch uses 0.05, which is right for arming a run from rest but
 * would lift the craft off the instant it landed with any throttle held. */
const TAKEOFF_THROTTLE = 0.25;
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

/* Streamed, so the loading screen can report bytes rather than a spinner. */
async function fetchBytes(url, onProgress) {
  const { fetchWithProgress } = await import('./ui/loading.js');
  return fetchWithProgress(url, onProgress);
}

/* Reused rather than allocated at every spawn. */
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/*
 * Bring one map in and make it the world.
 *
 * The module fetch and the world build are separate stages of the loading
 * screen because they fail and stall for entirely different reasons: the
 * first is the network, the second is the main thread. The module counter
 * reports the fetch honestly by watching the browser's own resource timing as
 * it walks the import graph, which needs no cooperation from the map.
 *
 * EXPECTED MODULE COUNTS are a bar weight, nothing more. Getting one wrong
 * makes that stage's bar move at the wrong rate; it cannot break the load,
 * and the stage still ends when the import resolves.
 */
const MAP_MODULE_COUNT = { field: 3, city: 61 };

async function loadMap(shell, id, loading) {
  const entry = mapById(id);
  loading.start('module');
  const counter = moduleCounter(
    `/src/maps/${id === 'field' ? 'field' : 'city/'}`,
    MAP_MODULE_COUNT[id] ?? 4,
    (f, got, total) => loading.progress('module', f, `${got} of ${total} modules`),
  );
  let mod;
  try {
    mod = await entry.load();
  } finally {
    counter.stop();
  }
  loading.done('module');
  loading.detail = '';
  loading.start('world');
  await yieldToPaint();
  const map = await mod.buildMap(shell, (f) => loading.progress('world', f));
  loading.done('world');
  return map;
}

export async function boot({ loading, bootStart, mapId }) {
  const BOOT_START = bootStart ?? performance.now();
  const canvas = document.getElementById('view');
  const shell = buildShell(canvas);
  const input = new InputManager();
  const ui = new Ui(uiRoot);
  /* boot.js read the stored map before any module loaded, so it could weight
   * the loading screen. ui.js is the owner of the setting; if the two ever
   * disagree the ui wins, because it is what the player sees. */
  if (mapId && ui.settings.map !== mapId) {
    ui.settings.map = mapId;
  }

  window.addEventListener('resize', () => {
    const d = shell.resize();
    view.post.setSize(d.w, d.h);
  });
  const audio = new MotorAudio();

  loading.start('sim');
  const sim = await loadSim(await fetchBytes('/dist/sim.wasm', (f, got, total) => {
    loading.progress('sim', f, `${(got / 1024).toFixed(0)} of ${(total / 1024).toFixed(0)} kB`);
  }));
  let configName = 'freestyle.diff';
  let configText = new TextDecoder().decode(await fetchBytes('/configs/freestyle.diff'));
  if (sim.init(configText) !== SIM_OK) {
    throw new Error('sim_init failed on the default config');
  }
  loading.done('sim');
  loading.detail = '';

  let view = await loadMap(shell, ui.settings.map, loading);
  loading.start('frame');

  /*
   * Where the run starts, in world space. The map owns this now. It used to be
   * three module scope consts computed from view.gates[0], which is exactly
   * why a gateless map could not boot: the shell dereferenced a gate before
   * the first frame and a freestyle map has none. They are `let` because a map
   * swap changes all three.
   */
  let startX = 0;
  let startZ = 0;
  let startY = 0;
  let startYaw = 0;
  /*
   * The height of the surface a craft standing at (x, z) rests on.
   *
   * Two calls, not one, and the reason is the city. `height(x, z, fromY)`
   * only offers a platform that is within a step of the height the query is
   * made from, which is what lets a quad fly UNDER the overbridge and land ON
   * its deck. Asking from far below gives the bare ground; asking again from
   * there picks up the footway, the kerb or the forecourt slab actually laid
   * on it. Asking from far above would seat a craft parked in the street on
   * the roof seven metres over it.
   */
  function groundAt(x, z) {
    const bare = view.height(x, z, -1000);
    return view.height(x, z, bare);
  }

  function adoptSpawn() {
    startX = view.spawn.x;
    startZ = view.spawn.z;
    startYaw = view.spawn.yaw;
    /* Terrain here is not at y = 0. Spawning without its height puts the
     * craft underground, looking up at the lit underside of the terrain. */
    startY = groundAt(startX, startZ);
    qSpawn.setFromAxisAngle(AXIS_Y, startYaw);
  }

  /* The race: gate order, lap clock, best lap. On a freestyle map it is a
   * real object with no gates in it and it scores nothing. */
  let race = new Race(view.gates);
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
  /*
   * The craft starts ON THE GROUND, landed, not hanging in mid air.
   *
   * This was a game breaking bug and it deserves the space. The craft used to
   * spawn at SPAWN_ALT with its motors at zero rpm and physics frozen until
   * the throttle passed 0.05. The instant a pilot touched the throttle the
   * integrator unfroze in free air with dead motors, and the quad fell the
   * 0.71 m to the ground and arrived at 3.4 m/s, which is past the 2.0 m/s
   * landing gate, so it crashed. Then resetCraft put it back at 0.9 m in mid
   * air and the same thing happened again, forever. A reviewer measured the
   * whole loop: "crash, 1.4 s lockout, back to 0.9 m in mid air, touch
   * throttle, crash". Anywhere between the launch threshold and hover the
   * quad fell out of the sky.
   *
   * Starting landed hands the craft to the on ground branch below, which
   * already holds it, already keeps the lap clock honest and already gates
   * liftoff on TAKEOFF_THROTTLE. A real quad sits on the ground before a run.
   */
  let launched = true;
  /* On the ground, upright, intact, physics frozen. A landing cannot be a
   * physics clamp: the module's ABI has no call that writes a position or a
   * velocity, so the only way to hold a craft on the ground is to stop
   * stepping it, which is exactly what the pre launch hold already does. */
  let landed = true;
  let statePrev = null;
  let stateCurr = null;
  /* Ground sweep state. groundPrev is where the craft was last frame, so the
   * terrain test can be a segment rather than a point. */
  const groundPrev = new THREE.Vector3();
  let groundHasPrev = false;
  let groundY = 0;
  /* Published through __craftState so a capture can ASSERT a landing rather
   * than describe one. */
  let lastDescent = 0;
  let lastTiltDeg = 0;
  let lastHitKind = 'none';
  let lastClosing = 0;
  let speedNow = 0;
  let airtimeMs = 0;
  let fps = 0;
  let camTilt = ui.settings.cameraAngle;
  let runVoltage = ui.settings.packVoltage;
  let notice = null; /* { text, untilMs } for one off shell messages */
  race.setRecordKey(recordKey());
  ui.setBest(race.bestMs, view.mode);

  /*
   * One way into the crash path, because there are now three things that can
   * cause one: arriving at the ground too fast, arriving at it too far from
   * upright, and touching anything solid. The lap dies, the run does not.
   */
  function crashInto(reason, nowWall) {
    crashed = true;
    landed = false;
    crashedAtWall = nowWall;
    race.voidLap(reason, nowWall);
    view.setNextGate(race.nextSceneIndex());
    if (typeof audio.event === 'function') {
      audio.event('crash');
    }
  }

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
    /* Back on the ground, landed, exactly as at boot. Setting launched false
     * here is what made every respawn repeat the takeoff trap. */
    launched = true;
    landed = true;
    groundY = groundAt(startX, startZ);
    /* Clear the judgement that produced the last crash. Leaving it behind is
     * how __craftState reports a 2.8 m/s arrival on a craft sitting calmly on
     * the start line, which reads as a landing gate that does not work. */
    lastDescent = 0;
    lastTiltDeg = 0;
    lastClosing = 0;
    lastHitKind = 'none';
    input.keys.clear();
    input.drain();
    input.kb.throttle = 0;
    input.kb.roll = 0;
    input.kb.pitch = 0;
    input.kb.yaw = 0;
    raceHasPrev = false;
    groundHasPrev = false;
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
    /* Back on the ground, landed, exactly as at boot. Setting launched false
     * here is what made every respawn repeat the takeoff trap. */
    launched = true;
    landed = true;
    groundY = groundAt(startX, startZ);
    /* Clear the judgement that produced the last crash. Leaving it behind is
     * how __craftState reports a 2.8 m/s arrival on a craft sitting calmly on
     * the start line, which reads as a landing gate that does not work. */
    lastDescent = 0;
    lastTiltDeg = 0;
    lastClosing = 0;
    lastHitKind = 'none';
    input.keys.clear();
    input.drain();
    input.kb.throttle = 0;
    input.kb.roll = 0;
    input.kb.pitch = 0;
    input.kb.yaw = 0;
    race.reset();
    view.setNextGate(race.nextSceneIndex());
    raceHasPrev = false;
    groundHasPrev = false;
    statePrev = readState();
    stateCurr = statePrev;
  }

  /*
   * Swap the world.
   *
   * `mapReady` is what keeps the frame loop out of a half built world: the
   * loop keeps running through the swap because stopping and restarting it
   * would lose the accumulator, so it has to be told to skip a frame instead.
   * Disposing BEFORE building is deliberate and it is the whole point of the
   * split: the city's render targets and the field's must never both exist,
   * or P5's 120 MB budget is measured against two worlds.
   */
  let mapReady = true;
  let finishLoadingOnFrame = true;
  async function swapMap(id) {
    if (!mapReady || id === view.id) {
      return;
    }
    mapReady = false;
    mode = 'title';
    ui.show('title');
    const entry = mapById(id);
    loading.run(planStages(['module', 'world', 'frame'], entry.buildMs));
    /* Paint the loading screen BEFORE disposing a world and building another,
     * because both of those block the main thread and a screen nobody
     * composited is not a screen. */
    await yieldToPaint();
    const previous = view.id;
    view.dispose();
    try {
      view = await loadMap(shell, id, loading);
    } catch (e) {
      /*
       * The old world is already gone by here, deliberately: disposing before
       * building is what keeps two maps' render targets from ever coexisting.
       * That means a failed load leaves nothing to fall back to, so it has to
       * be SAID rather than swallowed. Without this the shell sat on
       * mapReady false forever with a frozen frame and no message, which is
       * the worst of the three possible outcomes.
       */
      loading.fail(`${entry.name} could not be loaded. ${e.message ?? e}`);
      ui.settings.map = previous;
      console.error(e);
      return;
    }
    loading.start('frame');
    race = new Race(view.gates);
    race.setRecordKey(recordKey());
    ui.setBest(race.bestMs, view.mode);
    adoptSpawn();
    reset();
    finishLoadingOnFrame = true;
    mapReady = true;
    /* A change requested DURING the swap was refused by the guard at the top,
     * and ui.js has already saved it, so the setting and the loaded map would
     * otherwise stay diverged with the title screen naming a map that is not
     * there. Honour it now. */
    if (ui.settings.map !== view.id) {
      await swapMap(ui.settings.map);
    }
  }

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
    ui.setBest(race.bestMs, view.mode);
    if (s.map !== view.id) {
      swapMap(s.map);
    }
    audio.setLevel(s.volume / 10);
    audio.setEnabled(s.sound);
    applyMix(s);
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
  /*
   * Per stem levels. Guarded on typeof because the audio module and this file
   * are changed independently and a missing method must not take the whole
   * page down: a silent bed is a defect, a blank screen is a disaster.
   */
  function applyMix(s) {
    if (typeof audio.setMix === 'function') {
      mixArg.motors = s.motorLevel / 10;
      mixArg.wind = s.windLevel / 10;
      mixArg.music = s.musicLevel / 10;
      mixArg.focus = 1;
      audio.setMix(mixArg);
    }
    if (typeof audio.setMusicEnabled === 'function') {
      audio.setMusicEnabled(s.musicLevel > 0);
    }
    if (typeof audio.setFocusEnabled === 'function') {
      audio.setFocusEnabled(Boolean(s.focusTone));
    }
  }

  function wakeAudio() {
    if (ui.settings.sound && !audio.ctx) {
      audio.start();
      audio.setLevel(ui.settings.volume / 10);
    }
    audio.setEnabled(ui.settings.sound);
    applyMix(ui.settings);
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
      ui.setBest(race.bestMs, view.mode);
      notice = { text: `Flying ${configName}`, untilMs: performance.now() + 2400 };
      reset();
    } else {
      notice = { text: `That tune could not be read.\n${configFault(code)}`, untilMs: performance.now() + 3600 };
      sim.init(configText);
      reset();
    }
  });

  /* Reused, not rebuilt: applySettings runs off a menu keypress, but the
   * same object also keeps the shape of the call obvious in one place. */
  const mixArg = { motors: 1, wind: 1, music: 1, focus: 1 };
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

  /* The spawn's placement in the world. Not fixed for the session any more:
   * the two maps start in different places, so this is re-adopted on every
   * map swap and the crash check reads whatever the current map says. It has
   * to run before the first reset, because reset seats the craft on the
   * ground at the spawn. */
  adoptSpawn();
  reset();

  let prevWall = performance.now();
  /* Harness camera override, six numbers: position then look at target. */
  let camOverride = null;
  const camLookAt = new THREE.Vector3();

  /*
   * The city's clock. Everything in the town that a quad can hit is a closed
   * form of an integer fixed step count, so the town has to be handed one.
   *
   * During a run that count IS simTimeMs, the physics clock, which is what
   * makes a collision with a level crossing boom reproducible from a recorded
   * input stream at any frame rate. On the title screen the physics does not
   * step at all, and a frozen town behind an attract camera reads as broken,
   * so the title gets its own counter off the same 1 ms accumulator. Nothing
   * collides on the title screen, so nothing is at stake there.
   */
  let titleAcc = 0;
  let titleStepMs = 0;

  function frame(nowWall) {
    requestAnimationFrame(frame);
    if (!mapReady) {
      /* Mid swap. Swallow the elapsed time rather than handing it to the
       * accumulator on the far side, or the first frame of the new map steps
       * the physics by however long the world took to build. */
      prevWall = nowWall;
      return;
    }
    const blockStart = performance.now();
    const dt = Math.min(nowWall - prevWall, 100);
    prevWall = nowWall;
    fps = fps * 0.95 + (dt > 0 ? 1000 / dt : 0) * 0.05;

    input.poll(nowWall);
    const samples = input.drain();
    if (ui.isModal()) {
      ui.pollPad(padNav());
    }

    if (mode === 'flight' && !crashed && (!launched || landed)) {
      const thr = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
      if (!launched && thr > 0.05) {
        launched = true;
      } else if (landed && thr > TAKEOFF_THROTTLE) {
        /* Off again. The RC frame grid is pulled up to the clock first: the
         * lap clock kept running while the craft sat there, and without this
         * the resample loop would fire a burst of stick samples to catch up
         * and the controller would see a spike of stale input. */
        landed = false;
        rcNextMs = simTimeMs;
        lastTs = simTimeMs / 1000;
        if (typeof audio.event === 'function') {
          audio.event('takeoff');
        }
      }
    }
    if (mode === 'flight' && !crashed && launched && !landed) {
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
      /*
       * Ground contact, and whether it is a landing or a crash. This is the
       * owner's headline request: "i should be able to land on the ground
       * safetly but crashing will result in a crash".
       *
       * The test is the craft's SPHERE against the terrain, not its centre
       * point, and it is swept along the frame's travel rather than sampled
       * once at the end of it.
       *
       * THE SURFACE QUERY IS MADE FROM THE CRAFT'S LOWEST POINT, not from its
       * centre, and the difference is a real defect that a review caught.
       * `height(x, z, fromY)` offers a platform when its top is within a
       * walker's step, 0.55 m, of fromY. Querying from the CENTRE made the
       * overbridge deck at 7.20 m eligible from a centre height of 6.65 m,
       * which is a craft flying UNDER the bridge with its sphere top still
       * 5 cm clear of the deck's underside. `sy - CRAFT_R <= 7.20` is then
       * trivially true, so a quad taking the line under the bridge either
       * crashed into nothing or was declared landed and teleported onto the
       * deck above it. Querying from `sy - CRAFT_R` makes the deck eligible
       * only from a centre of 6.82 m, by which point the deck's own underside
       * slab collider has already fired at 6.78 m and correctly called it a
       * crash. Landing on top is unaffected: the ground test still fires at
       * deck + CRAFT_R, 2 cm before the slab, so the landing judgement wins. A point test with no radius let the craft
       * bury a prop before anything noticed, and at this container's frame
       * rate the craft moves metres per frame, so a single sample can step
       * clean over a ridge.
       */
      simPosToThree(stateCurr[1], stateCurr[2], stateCurr[3] + SPAWN_ALT + startY, pProbe);
      pProbe.applyQuaternion(qSpawn);
      pProbe.x += startX;
      pProbe.z += startZ;
      let touched = false;
      let touchX = pProbe.x;
      let touchZ = pProbe.z;
      /* The height the contact was judged AT, not where the frame ended.
       * Resolving the resting height from the end of the travel let a landing
       * on a deck fall through to the ground under it: at this container's
       * frame rate the craft descends about a metre a frame, so by the end of
       * the frame the deck is more than a step above the query and heightAt
       * drops it. */
      let touchY = pProbe.y;
      if (simTimeMs > 50) {
        if (groundHasPrev) {
          /* Sixteen samples over the travel. At 30 m/s and 60 frames per
           * second that is one sample every 3 cm, and even at this
           * container's two frames per second it is one per metre, which no
           * ridge in this terrain can hide inside. */
          const gsteps = 16;
          for (let gi = 1; gi <= gsteps; gi += 1) {
            const gt = gi / gsteps;
            const sx = groundPrev.x + (pProbe.x - groundPrev.x) * gt;
            const sy = groundPrev.y + (pProbe.y - groundPrev.y) * gt;
            const sz = groundPrev.z + (pProbe.z - groundPrev.z) * gt;
            if (sy - CRAFT_R <= view.height(sx, sz, sy - CRAFT_R)) {
              touched = true;
              touchX = sx;
              touchZ = sz;
              touchY = sy;
              break;
            }
          }
        } else if (pProbe.y - CRAFT_R <= view.height(pProbe.x, pProbe.z, pProbe.y - CRAFT_R)) {
          touched = true;
        }
      }
      groundPrev.copy(pProbe);
      groundHasPrev = true;
      if (touched) {
        /* Descent rate and horizontal speed come straight out of the state
         * block. frame.js maps sim z to world up, so state[6] IS the
         * vertical velocity and the other two are the horizontal pair; a
         * yaw about the vertical cannot change either magnitude, so the
         * spawn rotation does not enter into it. */
        const descent = -stateCurr[6];
        const horiz = Math.hypot(stateCurr[4], stateCurr[5]);
        /* Tilt from vertical, from the quaternion directly: rotating world
         * up by q gives a y component of 1 - 2(x^2 + z^2), and the angle to
         * vertical is its arc cosine. */
        const qx = shell.quad.quaternion.x;
        const qz = shell.quad.quaternion.z;
        let upY = 1 - 2 * (qx * qx + qz * qz);
        if (upY > 1) {
          upY = 1;
        }
        if (upY < -1) {
          upY = -1;
        }
        const tiltDeg = (Math.acos(upY) * 180) / Math.PI;
        lastDescent = descent;
        lastTiltDeg = tiltDeg;
        if (isLanding(descent, horiz, tiltDeg)) {
          landed = true;
          groundY = view.height(touchX, touchZ, touchY - CRAFT_R);
          /* The two states are made identical so the render interpolation
           * has nothing to interpolate: with the integrator frozen, an
           * accumulator left mid step would otherwise slide the craft
           * between two stale poses forever. */
          statePrev = stateCurr;
          acc = 0;
          if (typeof audio.event === 'function') {
            audio.event('land');
          }
        } else {
          crashInto('Crashed\nLap void', nowWall);
        }
      }
    } else if (mode === 'flight' && !crashed && launched && landed) {
      /*
       * Sitting on the ground. The integrator does NOT step, because the
       * ABI has no call that writes a position or a velocity, so the only
       * way to hold a craft on the ground is to stop advancing it.
       *
       * KNOWN LIMITATION, and it is visible: the frozen state keeps whatever
       * descent rate it had at touchdown, up to the 2.0 m/s landing gate, so
       * the first few milliseconds of a takeoff still carry that downward
       * velocity and the craft dips before thrust wins. Holding it properly
       * needs an ABI that can write a velocity, which is a deliberate change
       * with its own argument in PROGRESS.md.
       *
       * The lap clock DOES keep running. Landing in the middle of a lap
       * costs you the time it costs you, and a course where you can park for
       * free is not a race.
       */
      acc += dt;
      let steps = Math.floor(acc);
      acc -= steps;
      if (steps > 100) {
        steps = 100;
      }
      simTimeMs += steps;
      rcNextMs = simTimeMs;
      statePrev = stateCurr;
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
    if (landed) {
      /* The frozen state is a few centimetres inside the ground, because
       * that is what tripped the contact test. Sit the craft ON the terrain
       * instead, so a landing looks like a landing rather than a quad half
       * buried in a field. Render only: the physics state is untouched. */
      pCurr.y = groundY + REST_HEIGHT;
    }
    shell.quad.position.copy(pCurr);
    shell.quad.quaternion.copy(qPrev);

    /*
     * The solid world. Every gate frame member, panel and foot, every tree
     * trunk and canopy, every rock, cliff tier and flag pole is a capsule in
     * view.colliders, and the query is the exact closest distance between
     * the segment the craft travelled and the capsule's axis, so nothing can
     * tunnel through at any frame rate. Touching any of it is a crash: the
     * owner asked for the gates to be solid, and a gate you can fly through
     * the middle of the frame of is not solid.
     */
    /* The craft's speed at this state, needed by the collision test below and
     * by the overlay further down. Read once, from the state block. */
    speedNow = Math.sqrt(
      stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5] + stateCurr[6] * stateCurr[6],
    );
    if (mode === 'flight' && !crashed && !landed && launched && raceHasPrev) {
      const k = view.colliders.hit(
        racePrev.x, racePrev.y, racePrev.z,
        pCurr.x, pCurr.y, pCurr.z,
      );
      if (k >= 0) {
        lastHitKind = view.colliders.kindName(k);
        /*
         * A graze is not a crash. The closing speed is the craft's speed times
         * how square the contact was, and below GRAZE_SPEED_MAX a touch on a
         * gate frame, its furniture or a flag pole costs the lap and nothing
         * else. Trees, rocks and cliffs are solid at any speed: they are trunks
         * and boulders, not PVC tube.
         */
        const closing = speedNow * view.colliders.hitNormalDot;
        lastClosing = closing;
        const soft = lastHitKind === 'gate' || lastHitKind === 'obstacle' || lastHitKind === 'pole';
        if (soft && closing < GRAZE_SPEED_MAX) {
          race.voidLap(`Clipped the ${lastHitKind}\nLap void`, nowWall);
          view.setNextGate(race.nextSceneIndex());
          if (typeof audio.event === 'function') {
            audio.event('gate');
          }
        } else {
          crashInto(`Hit the ${lastHitKind}\nLap void`, nowWall);
        }
      }
    }

    /* Race logic runs on the rendered world position, timed on the sim
     * clock at that state: gate crossings are swept over the frame's
     * travel, so speed cannot tunnel a gate. */
    const simNow = simTimeMs > 0 ? simTimeMs - 1 + a : 0;
    if (mode === 'flight' && !crashed && launched) {
      if (raceHasPrev) {
        const res = race.update(racePrev, pCurr, simNow, nowWall);
        if (res.passed != null) {
          view.setNextGate(race.nextSceneIndex());
          if (typeof audio.event === 'function') {
            audio.event('gate');
          }
        }
        if (!race.freestyle && race.lap >= ui.settings.laps) {
          mode = 'results';
          ui.setBest(race.bestMs, view.mode);
          ui.showResults(race.log, race.bestMs);
        }
      }
      racePrev.copy(pCurr);
      raceHasPrev = true;
    }

    /* Airtime, for the freestyle display: the simulation clock since this
     * run began, which is what a pilot flying a pack wants beside the pack
     * bar. It reads on the sim clock for the same reason a lap does, so a
     * frame hitch cannot spend a pilot's battery for them. */
    airtimeMs = launched ? simTimeMs : 0;

    /* Prop discs spin at a visibly aliased fraction of true RPM, the way
     * they read on a real FPV feed. */
    for (let m = 0; m < 4; m += 1) {
      shell.discs[m].rotation.y += stateCurr[14 + m] * 1e-4;
    }

    if (mode !== 'title') {
      /* The camera sits inside the airframe, so the quad must be hidden or
       * you fly looking at the inside of its own outline hull. */
      shell.quad.visible = false;
      shell.camera.position.copy(pCurr);
      shell.camera.quaternion.copy(qPrev).multiply(qTilt);
    } else {
      /* Attract view: the craft parked, camera circling wide and high enough
       * that the world and the subject both read, and that near ground cover
       * does not fill the frame. The framing is the MAP's, because the two
       * maps are looking at different things: the field frames a regulation
       * 1.524 m gate whose aperture centre is 0.762 m up, and the city frames
       * a street. */
      shell.quad.visible = true;
      const ang = nowWall * 0.00011;
      const at = view.attract;
      camPos.set(
        at.x + Math.sin(ang) * at.radius,
        at.y + at.eye,
        at.z + Math.cos(ang) * at.radius,
      );
      orbitTarget.set(at.x, at.y + at.aim, at.z);
      shell.camera.position.copy(camPos);
      shell.camera.lookAt(orbitTarget);
    }

    /* Harness camera. The cost ledger has to be published for three views,
     * and two of them are not views the shell puts the camera in: the
     * ledger's mid course view is a point on the racing line, and flying
     * there at this container's frame rate is not a capture. Nothing in
     * the shell writes camOverride, and the check is a property read on a
     * scalar, so it allocates nothing. */
    if (camOverride) {
      shell.camera.position.set(camOverride[0], camOverride[1], camOverride[2]);
      shell.camera.up.set(0, 1, 0);
      shell.camera.lookAt(camLookAt.set(camOverride[3], camOverride[4], camOverride[5]));
    }

    if (mode === 'title') {
      titleAcc += dt;
      const ts = Math.floor(titleAcc);
      titleAcc -= ts;
      titleStepMs += ts > 100 ? 100 : ts;
    }
    view.updateAnim(mode === 'title' ? titleStepMs : simTimeMs);

    view.updateShadowFocus(camOverride ? shell.camera.position : pCurr);
    /* Propwash strength for the grass: mean rotor speed against hover. */
    const meanRpm = (stateCurr[14] + stateCurr[15] + stateCurr[16] + stateCurr[17]) * 0.25;
    view.updateWind(nowWall * 0.001, pCurr, Math.min(1.3, meanRpm / 9000));
    /* info is accumulated across the whole frame (prepass, shadow map,
     * composer passes) and read back through __renderStats. */
    shell.renderer.info.reset();
    const renderStart = performance.now();
    view.post.render();
    const renderMs = performance.now() - renderStart;
    renderStats.calls = shell.renderer.info.render.calls;
    renderStats.triangles = shell.renderer.info.render.triangles;

    /* Overlay. */
    const st = stateCurr;
    const speed = Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);
    /* P13: audio scheduling work on the main thread, worst case, and it has
     * to allocate nothing. Two scalars written in place, and the rpm array
     * is hoisted out of the loop for the same reason. */
    const audioStart = performance.now();
    audioRpm[0] = st[14];
    audioRpm[1] = st[15];
    audioRpm[2] = st[16];
    audioRpm[3] = st[17];
    audio.update(audioRpm, mode === 'flight' ? speed : 0);
    const audioMs = performance.now() - audioStart;
    if (frames > 2 && audioMs > worstAudioMs) {
      worstAudioMs = audioMs;
    }
    if (mode === 'flight') {
      /*
       * Altitude is measured against the surface UNDER THE CRAFT, through the
       * same query the collision test uses, not against the height of the
       * ground at the spawn. The old readout was `st[3] + SPAWN_ALT`, which
       * is the craft's height above wherever it started: identical on a flat
       * corridor, and wrong by seven metres the moment you cross the
       * overbridge. A pilot reading "3 m" over a roof they are about to land
       * on needs it to mean three metres over that roof.
       */
      const p = shell.quad.position;
      ui.setOsd({
        mode: view.mode,
        lapMs: race.freestyle ? airtimeMs : race.currentLapMs(simNow),
        gate: race.next + 1,
        gateCount: race.gates.length,
        volts: st[18],
        lastLapMs: race.lastLapMs,
        packFrac: (st[18] - PACK_EMPTY_V) / (PACK_FULL_V - PACK_EMPTY_V),
        altitude: p.y - view.height(p.x, p.z, p.y),
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
      ui.setBanner(race.freestyle
        ? 'Throttle up to take off\nNo gates, no clock. Go and find a line.'
        : 'Throttle up to take off\nThe green gate starts your lap');
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
     * view.post.render, split out because in a software rasterised container
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
    if (finishLoadingOnFrame) {
      /* The last stage is the first frame, and this IS the first frame: the
       * world is on screen behind the loading screen at the moment it goes.
       * Marking it done anywhere earlier would be a bar that reaches the end
       * before the thing it measures has happened. */
      finishLoadingOnFrame = false;
      loading.done('frame');
      loading.finish();
    }
  }
  let worstBlockMs = 0;
  let worstShellMs = 0;
  let worstAudioMs = 0;
  /* Hoisted: P8 forbids a new array per frame, and this one used to be a
   * literal in the audio.update call. */
  const audioRpm = [0, 0, 0, 0];
  let firstFrameMs = -1;
  let frames = 0;
  /* Render statistics for the harness and the frame budget gate. */
  const renderStats = { calls: 0, triangles: 0 };
  shell.renderer.info.autoReset = false;
  window.__renderStats = () => ({ ...renderStats });
  /* Handles the screenshot harness uses to reach a screen that would
   * otherwise need a flown lap. Nothing in the shell reads them. */
  window.__ui = ui;
  /* A function, not a snapshot. Every other handle here reads `view` or
   * `race` at call time; this one captured the object identity at boot, so
   * after a map swap it answered with the previous map's race. */
  window.__race = () => race;
  /* P12 and P13 are audio budgets, and neither can be read while the audio
   * context is null: update() returns immediately and reports a cost of
   * nothing. A capture run has to click the page to satisfy the browser's
   * gesture requirement and then check that the context is real. */
  window.__audio = audio;
  /* The cost ledger. Measured on demand from the harness, never per
   * frame. __setCam parks the camera for a named view; __setCam(null)
   * gives it back to the shell. */
  window.__setCam = (a, b, c, d, e, f) => {
    camOverride = a == null ? null : [a, b, c, d, e, f];
  };
  /* Put the race on a given gate. The ledger and the value measurements
   * park the camera at a point on the racing line, and a pilot at that
   * point has a real next gate, which is not gate 0 just because the run
   * has not started. Without this the glow ladder in a parked capture
   * belongs to a different position on the course than the camera does.
   * Harness only.
   *
   * Setting `race.next` alone leaves the rest of the race inconsistent:
   * `lapStartMs` is only ever set by passing gate 0, so the lap clock never
   * starts, and `race.update` treats a gate frame tap with `next !== 0` and
   * no lap start as a lap to void, which flashes "Gate touched, lap void"
   * across whatever is being captured. So this resets the race first and
   * hands back the previous value for a run to restore.
   */
  window.__setRaceNext = (raceIndex) => {
    const n = race.gates.length;
    const was = race.next;
    race.reset();
    race.next = (((raceIndex | 0) % n) + n) % n;
    view.setNextGate(race.nextSceneIndex());
    racePrev.copy(shell.quad.position);
    raceHasPrev = true;
    return { raceNext: race.next, sceneIndex: race.nextSceneIndex(), previous: was };
  };
  window.__trackPoint = (u) => {
    if (!view.curve) {
      return null;
    }
    const p = view.curve.getPointAt(u);
    const t = view.curve.getTangentAt(u);
    return { x: p.x, y: p.y, z: p.z, tx: t.x, tz: t.z, ground: view.height(p.x, p.z) };
  };
  /* What is solid, and how well the broadphase is doing. */
  window.__colliders = () => view.colliders.stats();
  /*
   * The craft's contact state, so a capture can ASSERT a landing instead of
   * describing one. descentRate and tiltDeg are the values the last ground
   * contact was judged on, and the thresholds are published beside them so a
   * reviewer does not have to go and find them.
   */
  window.__craftState = () => ({
    mode,
    launched,
    landed,
    crashed,
    descentRate: lastDescent,
    tiltDeg: lastTiltDeg,
    lastHitKind,
    lastClosingSpeed: lastClosing,
    grazeSpeedMax: GRAZE_SPEED_MAX,
    groundClearance: shell.quad.position.y - view.height(shell.quad.position.x, shell.quad.position.z, shell.quad.position.y),
    thresholds: {
      descentMax: LAND_DESCENT_MAX,
      horizontalMax: LAND_HORIZONTAL_MAX,
      tiltMaxDeg: LAND_TILT_MAX_DEG,
      craftRadius: CRAFT_R,
    },
    lap: race.lap,
    bestLapMs: race.bestLapMs ? race.bestLapMs() : null,
    bestThreeMs: race.bestThreeMs ? race.bestThreeMs() : null,
  });
  window.__boot = () => ({
    firstFrameMs,
    worstBlockMs,
    worstShellMs,
    worstAudioMs,
    frames,
  });
  /*
   * Which gate the race actually wants, and where it is on screen. G3 says
   * the next gate must be the brightest thing in the frame, and every G3
   * measurement taken so far measured the wrong object: a parked capture
   * camera looks at one gate while the race's next gate is somewhere else
   * entirely, so the bright ring in the frame was some later gate on the
   * glow ladder. A capture that claims anything about the target has to
   * record which gate that is and where it is, and this is that record.
   *
   * Screen coordinates are CSS pixels with the origin top left, matching
   * what scripts/pixels.js reads out of a PNG. Harness only, called on
   * demand, never per frame.
   */
  window.__nextGate = () => {
    /*
     * A FREESTYLE MAP HAS NO GATES, AND THAT IS AN ANSWER, NOT A FAILURE.
     *
     * scripts/shots.js records a harness fault and exits non zero when this
     * handle does not return a gate, which is correct on the race field: a
     * capture that claims anything about the target has to know which gate
     * the race actually wants, and silently capturing without one is how
     * every G3 measurement before it measured the wrong object. On a map with
     * no gates the same rule makes every capture fail even when the frame is
     * perfect.
     *
     * So the opt out is a property of the PAGE, not a flag on the command
     * line. The handle says which map it is and that the map is gateless, and
     * the sidecar accepts that and nothing else. A careless `--nogate` on the
     * race field would have weakened the gate for the map that needs it; this
     * cannot, because the race field can never report gateless true.
     */
    if (view.gates.length === 0) {
      const el0 = shell.renderer.domElement;
      return {
        viewport: { w: el0.width, h: el0.height },
        mapId: view.id,
        mapMode: view.mode,
        gateless: true,
        gates: [],
      };
    }
    /* Device pixels, not CSS pixels. The PNG a capture writes is the drawing
     * buffer, which is clientWidth times the pixel ratio, so a handle that
     * promises PNG coordinates and returns CSS ones is silently half scale
     * on any HiDPI display. `el.width` IS the drawing buffer. */
    const el = shell.renderer.domElement;
    const vw = el.width;
    const vh = el.height;
    const project = (v) => {
      const p = v.clone().project(shell.camera);
      /* Behind the camera, project divides by a negative w, so x and y
       * reflect through the principal point and land somewhere plausible
       * inside the frame. Publishing that as a position is how a consumer
       * that does not also read ndcZ gets a confident wrong answer, so the
       * flag travels with the numbers. */
      const inFront = p.z > -1 && p.z < 1;
      return {
        x: (p.x * 0.5 + 0.5) * vw,
        y: (1 - (p.y * 0.5 + 0.5)) * vh,
        ndcZ: p.z,
        inFront,
        mirrored: !inFront,
      };
    };
    const seq = [];
    for (let step = 0; step < 3; step += 1) {
      const raceIdx = (race.next + step) % race.gates.length;
      const sceneIndex = race.gates[raceIdx].idx;
      const gt = view.gates[sceneIndex];
      const ap = gt.aperture;
      const centre = new THREE.Vector3(gt.position.x, gt.position.y + ap.centreY, gt.position.z);
      const top = new THREE.Vector3(centre.x, centre.y + ap.clearH * 0.5, centre.z);
      const bottom = new THREE.Vector3(centre.x, centre.y - ap.clearH * 0.5, centre.z);
      const distance = shell.camera.position.distanceTo(centre);
      /* Camera space depth, which is what a projected size scales with. The
       * Euclidean distance is not: at 55 degrees off axis the two differ
       * enough to overstate a projected size by 74 percent, and any check of
       * aperturePx against the geometry has to divide by this one. */
      const depth = -centre.clone().applyMatrix4(shell.camera.matrixWorldInverse).z;
      const sc = project(centre);
      const st = project(top);
      const sb = project(bottom);
      /* aperturePx is the pixel distance between two projected points, and
       * that is only the aperture when both points are actually in front of
       * the camera. Without this gate the handle published 17988.1 px for
       * gates 0.45 m BEHIND a zenith pointing camera, and a gate 126 m
       * behind read 14.900 px against 14.910 for the same gate in front,
       * because the sign flip cancels under an absolute value. It is also
       * only ever the VERTICAL chord: a yawed gate is an ellipse on screen
       * and its width is not this number. */
      const apertureValid = st.inFront && sb.inFront;
      seq.push({
        step,
        sceneIndex,
        flyOrder: gt.flyOrder,
        /* A per frame sample of a quantity that pulses on the wall clock,
         * not a property of the gate. */
        glowGainSampled: gt.glowMat.uniforms.uGain.value,
        aperture: ap,
        world: { x: centre.x, y: centre.y, z: centre.z },
        distance,
        depth,
        screen: sc,
        aperturePx: apertureValid ? Math.abs(sb.y - st.y) : null,
        aperturePxAxis: 'vertical chord only, not the width of a yawed gate',
        /* A single point test with no clipping and no occlusion. It answers
         * "is the aperture centre inside the frame", which is NOT "can the
         * pilot see the target": a gate whose ring fills a third of the
         * frame from the side reports false here. Do not use it alone to
         * settle G3. */
        centreInFrame: sc.inFront && sc.x >= 0 && sc.x < vw && sc.y >= 0 && sc.y < vh,
      });
    }
    return {
      viewport: { w: vw, h: vh },
      mapId: view.id,
      mapMode: view.mode,
      gateless: false,
      raceNext: race.next,
      nextSceneIndex: race.nextSceneIndex(),
      lap: race.lap,
      gates: seq,
    };
  };
  /*
   * The quad on screen, for T6. Reports the projected pixel box of the
   * craft's own world bounding box and, separately, the pixel span a
   * 0.25 m segment subtends at the craft's distance, because a 250 mm quad
   * is quoted on its motor to motor diagonal and the model's box is not
   * the same measurement. Both are published so a reviewer can choose.
   */
  window.__quadScreen = () => {
    const el = shell.renderer.domElement;
    const vw = el.width;
    const vh = el.height;
    /* With the camera inside the airframe the 0.25 m span sits at zero
     * camera space depth, the projection divides by zero, and the result is
     * Infinity, which JSON.stringify launders into null so a reader cannot
     * tell it from "not applicable". Four of the bounding box's eight
     * corners are behind the near plane in the same state, so the projected
     * box brackets a reflection rather than a box. Both are refused here
     * instead of being published and explained. */
    const dist = shell.camera.position.distanceTo(shell.quad.position);
    if (dist < shell.camera.near) {
      return {
        viewport: { w: vw, h: vh },
        visible: shell.quad.visible,
        distance: dist,
        boxPx: null,
        span250mmPx: null,
        refused: `camera is ${dist.toFixed(3)} m from the craft, inside the ${shell.camera.near} m near plane, so nothing projects`,
      };
    }
    const box = new THREE.Box3().setFromObject(shell.quad);
    const size = new THREE.Vector3();
    box.getSize(size);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const corner = new THREE.Vector3();
    for (let i = 0; i < 8; i += 1) {
      corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z,
      ).project(shell.camera);
      const px = (corner.x * 0.5 + 0.5) * vw;
      const py = (1 - (corner.y * 0.5 + 0.5)) * vh;
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(shell.camera.quaternion);
    const a = shell.quad.position.clone().addScaledVector(right, -0.125).project(shell.camera);
    const b = shell.quad.position.clone().addScaledVector(right, 0.125).project(shell.camera);
    const span = Math.abs((b.x - a.x) * 0.5 * vw);
    return {
      viewport: { w: vw, h: vh },
      visible: shell.quad.visible,
      distance: dist,
      /* An axis aligned bounding box over the whole group INCLUDING the
       * spinning prop discs, so it breathes with prop angle: sampled between
       * 0.282 and 0.320 m across this build's captures. It is not the motor
       * to motor diagonal that a 250 mm class quad is named for, and it must
       * not be quoted as the size of the quad. */
      worldSizeSampled: { x: size.x, y: size.y, z: size.z },
      worldSizeNote: 'AABB of the whole group including spinning props, varies with prop angle, not the motor to motor diagonal',
      boxPx: Number.isFinite(maxX - minX) ? { w: maxX - minX, h: maxY - minY, x: minX, y: minY } : null,
      span250mmPx: Number.isFinite(span) ? span : null,
    };
  };
  /* Which world is loaded, what it cost, and what is solid in it. Harness
   * only; nothing in the shell reads these. */
  window.__map = () => ({
    id: view.id,
    name: view.name,
    mode: view.mode,
    gates: view.gates.length,
    spawn: { x: startX, y: startY, z: startZ, yaw: startYaw },
    ready: mapReady,
    references: view.references ?? null,
    loading: window.__loading ? window.__loading.timings : null,
    ...(view.stats ? view.stats() : {}),
  });
  window.__maps = () => MAPS.map((m) => ({ id: m.id, name: m.name, mode: m.mode }));
  /* The active map's scene graph, for measurement. tests/lib/checks.js walks
   * it to assert that reference objects measure what this project claims they
   * measure, which is the only way a scale error gets caught by a check
   * rather than by a reviewer's eye. Harness only. */
  window.__mapScene = () => view.scene;
  /* The three.js namespace, so a measurement in the page can build a Box3
   * without importing a second copy of the library. Harness only. */
  window.__three = THREE;
  /* The city's own world object, for measurements that need its platform and
   * collider lists. Null on a map that has no town. Harness only. */
  window.__cityWorld = () => view.world ?? null;
  /* Set the active map's distance cull radius, for the sweep that chooses it.
   * Null restores the map's own value. Harness only. */
  window.__cullRadius = (r) => (view.setCullRadius ? view.setCullRadius(r) : null);
  /* The active map's contact surface, exactly as the ground sweep queries it.
   * `fromY` is what makes a deck climbable from above and transparent from
   * below, so a capture can assert that rather than describe it. */
  window.__surface = (x, z, fromY) => view.height(x, z, fromY);
  /*
   * Set the sticks directly, bypassing the keyboard ramp.
   *
   * Holding W is how a player takes off and it is NOT how a capture can. W
   * ramps the throttle while held, and this container renders a city frame in
   * about half a second, so five seconds of held key is ten frames of ramp and
   * the craft never reaches the 0.25 takeoff threshold. A capture that cannot
   * take off cannot assert anything about flight, which is how the 07-inflight
   * capture in round 10's evidence turned out to be a picture of the start
   * line. Harness only; nothing in the shell reads it.
   */
  window.__stick = (roll, pitch, yaw, throttle) => {
    input.kb.roll = roll;
    input.kb.pitch = pitch;
    input.kb.yaw = yaw;
    input.kb.throttle = throttle;
    return { roll, pitch, yaw, throttle };
  };
  /* Is anything solid on the segment from p to q? Same call the frame loop
   * makes, so a capture can assert what a quad would hit. */
  window.__hit = (px, py, pz, qx, qy, qz) => {
    const k = view.colliders.hit(px, py, pz, qx, qy, qz);
    return { kind: k < 0 ? null : view.colliders.kindName(k), index: view.colliders.hitIndex };
  };
  /* Shadow pass on or off, so the ledger can attribute draw calls between the
   * colour pass and the shadow pass rather than guessing at the split.
   * Harness only. */
  window.__shadows = (on) => {
    shell.renderer.shadowMap.enabled = !!on;
    shell.renderer.shadowMap.needsUpdate = true;
    return shell.renderer.shadowMap.enabled;
  };
  window.__setMap = (id) => {
    ui.settings.map = id;
    return swapMap(id);
  };
  window.__budget = (name) => measureBudget(shell, view, { view: name });
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  const p = document.createElement('div');
  p.className = 'banner';
  p.style.opacity = '1';
  p.textContent = `The simulator could not start.\n${e.message}`;
  uiRoot.append(p);
});
