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
import { makeAttractCamera } from './render/attract.js';
import { measureBudget } from './render/budget.js';
import { simPosToThree, simQuatToThree, simLenToWorld, WORLD_SCALE } from './render/frame.js';
import { MotorAudio } from './render/audio.js';
import { InputManager } from './input/input.js';
import { Race } from './game/race.js';
import { CRAFT_R, CRAFT_WORLD_R, craftVerticalHalf, isLanding, GRAZE_SPEED_MAX, LAND_DESCENT_MAX, LAND_HORIZONTAL_MAX, LAND_TILT_MAX_DEG } from './game/collide.js';
import { Ui } from './ui/ui.js';
import { celTimeCount } from './render/celmat.js';
import { MAPS, mapById } from './maps/registry.js';
import { TUNES, tuneById, tunePath } from '../configs/registry.js';
import { ratesDiff, ratesSummary } from '../configs/rates.js';
import { GATE_SCALE } from './game/track.js';
import { planStages, moduleCounter, yieldToPaint } from './ui/loading.js';
import { loadSim, simErrorName, SIM_OK } from '/tests/lib/simmod.js';

/*
 * Metres between sim z = 0 and the ground plane, which is where the craft
 * spawns, and it is the PARKED height, not a hover.
 *
 * It was 0.9 m, a leftover from when the craft spawned hanging in mid air,
 * and it is the number behind the takeoff bug the owner reported: the
 * landed render sat the craft on the grass while the physics state waited
 * 0.9 m up, so every takeoff unfroze 82 cm in the air with dead motors,
 * popped up visually, fell 0.7 m while the motors spooled from zero,
 * arrived at about 3.4 m/s and was judged a crash the pilot never flew. A
 * throttle punch out-spooled the fall, which is why "wiggle and punch"
 * worked and a gentle takeoff did not. The physics now spawns exactly
 * where the parked render has always shown the craft: resting on the
 * ground.
 */
const SPAWN_ALT = 0.045;
/* The craft rests with its underside on the ground, not its centre: body
 * underside is 0.017 m below centre and grass carries the frame a little
 * above the soil. Identical to SPAWN_ALT so the parked pose, the spawn
 * state and a landing all agree about where the ground holds the craft. */
const REST_HEIGHT = 0.045;
/* Raising the throttle this far off the ground is a deliberate takeoff. The
 * launch latch uses 0.05, which is right for arming a run from rest but
 * would lift the craft off the instant it landed with any throttle held. */
const TAKEOFF_THROTTLE = 0.25;
/*
 * Bias subtracted from the height query's fromY, metres.
 *
 * The city's multi level height query answers "what is my floor" with a
 * WALKER'S rule: a platform is eligible when its top is within a 0.55 m
 * step of fromY. A quad is not a walker: with the craft's true 0.040 m
 * vertical half extent, the overbridge deck at 7.20 m became an eligible
 * floor for a craft flying UNDER it at 6.69 m, below the deck's own
 * underside, and the round 15b bug came back. Shifting fromY down by this
 * bias turns the walker's 0.55 m step into a 0.15 m landable depth: deep
 * enough that a kerb or a low step still judges contact, shallow enough
 * that a deck can never be your floor from underneath it. The remaining
 * gap under the deck, centre heights 6.91 m and up, is inside the bridge's
 * own structure and the underside slab collider crashes it.
 */
const SURFACE_BIAS = 0.40;
/*
 * How far the CAMERA is lifted while the craft is sitting on the ground, in
 * world metres. Render only: nothing about the physics, the collision test
 * or the trajectory can see it.
 *
 * A parked quad's lens is 5.6 cm over the surface in this world, and the
 * session's near plane is 0.2 m (src/render/shell.js, chosen for depth
 * precision across a 2.6 km valley). Those two numbers cannot both be
 * honoured: with the camera tilted up 30 degrees and a 100 degree vertical
 * field, the ground in front of a parked craft is nearer than the near plane
 * for most of the lower frame, so it is clipped away and the frame comes
 * back as a flat band of background under a thin strip of grass. That is
 * what the owner saw as clipping through the ground at the start and after a
 * crash, and it is also true of any perch mid course.
 *
 * 0.30 m puts the surface back outside the near plane across the whole
 * frame, and it is not an invention: a race quad starts from a launch pad,
 * and a pad is about this high. It is eased in and out rather than snapped,
 * because a landing that teleported the view up 30 cm would read as a bounce
 * the pilot did not fly.
 */
const PARKED_LIFT = 0.30;
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
/* field: field.js, scene.js, post.js. city: 59 vendored files plus
 * index.js, animation.js, bake.js and references.js, 63 in all. Check 16
 * asserts the city count against what the browser actually fetched on a
 * cold load, because 61 sat here for a round and nothing could notice. */
const MAP_MODULE_COUNT = { field: 3, city: 63, custom: 9 };
/* Where a map's modules live, so the loading bar can count them. Data, not a
 * ternary: the ternary read "field or else city", so a third map counted its
 * modules under the city's prefix and the bar sat at zero. */
const MAP_MODULE_PREFIX = { field: '/src/maps/field', city: '/src/maps/city/', custom: '/src/maps/custom' };

async function loadMap(shell, id, loading) {
  const entry = mapById(id);
  loading.start('module');
  const counter = moduleCounter(
    MAP_MODULE_PREFIX[id] ?? `/src/maps/${id}`,
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
  /*
   * Sample the sticks on their own timer rather than once per rendered frame.
   * See src/input/input.js for what that was costing feedforward.
   */
  input.startPolling(2);
  const ui = new Ui(uiRoot);
  /*
   * boot.js read the stored map before any module loaded, so it could weight
   * the loading screen. ui.js is the owner of the setting; if the two ever
   * disagree the ui wins, because it is what the player sees.
   *
   * The menu is rebuilt after the change, not just the value. The Ui builds
   * its rows in its constructor, which has already run by this line, so a
   * map named in the URL used to land in the settings and leave the Map row
   * still reading the map it was not showing. That only became reachable
   * when the track builder started linking to ?map=custom; before it, the
   * two could never disagree at this point.
   */
  if (mapId && ui.settings.map !== mapId) {
    ui.settings.map = mapId;
    ui.renderMenu();
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
  /*
   * The flight controller comes entirely from a Betaflight diff, so which
   * diff is chosen IS the tune. The choice is a setting; the boot path and
   * the menu path load it the same way, and a stored id that no longer
   * exists falls back to the first tune rather than failing to boot.
   */
  let configId = tuneById(ui.settings.tune).id;
  /* What the Tune menu item last asked for, which is not the same question
   * as what is loaded: a dropped file changes the second and not the first. */
  let menuTune = ui.settings.tune;
  let configName = `${configId}.diff`;
  /*
   * A flown config is a TUNE plus the pilot's RATES, composed here and
   * nowhere else. No file in configs/ carries a rateprofile any more, and the
   * rate lines are appended last so that even a diff the pilot drops on the
   * page flies on the rates in the menu. See configs/rates.js for why the
   * two were separated: shipping rates inside the Karate preset meant
   * choosing that tune also halved the stick authority, so the tune could
   * never be judged on its own.
   */
  let tuneText = new TextDecoder().decode(await fetchBytes(tunePath(configId)));
  let ratesText = ratesDiff(ui.settings);
  let configText = tuneText + ratesText;
  if (sim.init(configText) !== SIM_OK) {
    throw new Error(`sim_init failed on ${configName}`);
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
  /*
   * Milliseconds the INTEGRATOR has actually stepped since reset: a mirror
   * of the module's own step_index, and the only valid timebase for input
   * timestamps. simTimeMs is the LAP clock and keeps running while the
   * craft sits landed with the integrator frozen, so the two diverge by
   * exactly the time spent parked. Stamping stick samples with the lap
   * clock put them that far into the sim's future, and sim_step consumes a
   * sample only when step_index reaches its timestamp, so every second on
   * the pad became a second of stick lag for the whole rest of the run.
   * The owner reported it as 1 to 2 seconds of input lag, unflyable, and
   * it was: the lag equalled the time between entering flight and pushing
   * the throttle up. Invisible before the takeoff fix, because at 60 fps
   * every takeoff crashed and the crash reset re-zeroed both clocks.
   */
  let simStepMs = 0;
  let acc = 0;
  let lastTs = 0;
  let rcNextMs = 0;
  /*
   * Stick samples waiting for an RC slot, and the value currently held.
   *
   * The old code took `samples[samples.length - 1]` and used it for every RC
   * frame in the render frame, which threw away every other sample and turned
   * the stick into a staircase at frame rate. Now the pad is polled on its
   * own timer (src/input/input.js) and each sample carries the wall clock time
   * it was taken at, so a slot gets the sample that was actually current when
   * that slot happened. Held between slots, which is what a receiver does.
   */
  const rcPending = [];
  let rcHeld = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
  /*
   * Re-seat the RC grid on the sim clock and throw away stick samples that
   * belong to a stretch of time the integrator never ran. Called wherever the
   * grid is pinned: reset, and the moment a parked craft takes off again.
   * Without the second half, a craft that sat landed for six seconds would
   * hand six seconds of queued samples to the first six milliseconds of
   * flight.
   */
  function pinRcGrid() {
    rcNextMs = simStepMs;
    lastTs = simStepMs / 1000;
    if (rcPending.length > 1) {
      rcPending.splice(0, rcPending.length - 1);
    }
  }
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
  /* On the ground, upright, intact, physics frozen. Position is not
   * writable through the ABI, so the craft is held by not stepping it;
   * sim_rest zeroes the velocity at each judged touchdown so the frozen
   * state is a true rest state rather than a falling one. */
  let landed = true;
  /*
   * Between committing to a takeoff and getting the collision sphere clear
   * of the surface. While this is set, ground contact does not re-land the
   * craft: the parked pose already sits inside contact (the sphere reaches
   * 17 cm below a centre parked 7.5 cm up), so during the motor spool the
   * contact test fires on EVERY frame, and judging each one flipped the
   * craft landed and flying at frame rate: measured at a simulated 60 fps,
   * 96 to 346 freeze cycles per gentle takeoff, each one a land sound, a
   * takeoff sound and a render pose flick. A takeoff ends the hold by
   * climbing clear; an abort (throttle back below the gate, or sinking
   * 5 cm into the surface because the pack cannot hover this throttle)
   * ends it by resting the craft where it is.
   */
  let takingOff = false;
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
  /* The craft's tilt-aware vertical half extent, written by the physics
   * branch each frame and read by the obstacle query later in the same
   * frame. Starts level. */
  let vHalfFrame = craftVerticalHalf(0);
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
    takingOff = false;
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
    simStepMs = 0;
    acc = 0;
    lastTs = 0;
    rcNextMs = 0;
    rcPending.length = 0;
    crashed = false;
    /* Back on the ground, landed, exactly as at boot. Setting launched false
     * here is what made every respawn repeat the takeoff trap. */
    launched = true;
    landed = true;
    takingOff = false;
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
    simStepMs = 0;
    acc = 0;
    lastTs = 0;
    rcNextMs = 0;
    rcPending.length = 0;
    crashed = false;
    /* Back on the ground, landed, exactly as at boot. Setting launched false
     * here is what made every respawn repeat the takeoff trap. */
    launched = true;
    landed = true;
    takingOff = false;
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
    attractCam = makeAttractCamera(view);
    view.setRacingLine(ui.settings.racingLine);
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
    /* Vertical field of view. The default 100 keeps every measured budget
     * comparable; the setting exists because how roomy a course feels is a
     * pilot preference on real quads too, set by lens choice. */
    if (shell.camera.fov !== s.cameraFov) {
      shell.camera.fov = s.cameraFov;
      shell.camera.updateProjectionMatrix();
    }
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
    /*
     * Only a MOVE of the Tune item swaps the tune. Comparing against what
     * is loaded instead would undo a dropped diff the next time the pilot
     * changed the volume, because a dropped file is not a registry tune.
     */
    if (s.tune !== menuTune) {
      menuTune = s.tune;
      swapTune(s.tune);
    }
    /*
     * Rates are part of the config text, so changing one re-inits the module
     * and resets the craft, exactly as changing the tune does. Compared as
     * text rather than field by field so there is one definition of "the
     * rates changed" and it is the one the firmware sees.
     */
    const nextRates = ratesDiff(s);
    if (nextRates !== ratesText) {
      ratesText = nextRates;
      configText = tuneText + ratesText;
      if (sim.init(configText) === SIM_OK) {
        sim.setCellVoltage(runVoltage);
        race.setRecordKey(recordKey());
        ui.setBest(race.bestMs, view.mode);
        reset();
      }
    }
    view.setRacingLine(s.racingLine);
    audio.setLevel(s.volume / 10);
    audio.setEnabled(s.sound);
    applyMix(s);
    ui.setReadout('');
  }

  /*
   * Load a different tune. Same path a dropped file takes: fetch the diff,
   * hand the text to sim_init, and reset. A failed fetch or a diff the
   * module rejects puts the old tune back rather than leaving the shell
   * flying something nobody chose, and says so.
   */
  async function swapTune(id) {
    const entry = tuneById(id);
    if (entry.id === configId) {
      return;
    }
    let text;
    try {
      text = new TextDecoder().decode(await fetchBytes(tunePath(entry.id)));
    } catch (e) {
      ui.settings.tune = configId;
      notice = { text: `${entry.name} could not be loaded.`, untilMs: performance.now() + 3200 };
      console.error(e);
      return;
    }
    const code = sim.init(text + ratesText);
    if (code !== SIM_OK) {
      ui.settings.tune = configId;
      sim.init(configText);
      reset();
      notice = { text: `${entry.name} could not be read.\n${configFault(code)}`, untilMs: performance.now() + 3600 };
      return;
    }
    configId = entry.id;
    tuneText = text;
    configText = tuneText + ratesText;
    configName = `${entry.id}.diff`;
    sim.setCellVoltage(runVoltage);
    race.setRecordKey(recordKey());
    ui.setBest(race.bestMs, view.mode);
    notice = { text: `Flying ${entry.name}`, untilMs: performance.now() + 2400 };
    reset();
  }

  ui.onSettings = applySettings;
  /* Menu clicks. The key handler has already woken the audio context by
   * the time the menu moves, so the first keypress is audible too. */
  ui.onUiSound = (kind) => {
    if (typeof audio.ui === 'function') {
      audio.ui(kind);
    }
  };
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
      mixArg.ambience = s.ambienceLevel / 10;
      audio.setMix(mixArg);
    }
    if (typeof audio.setMusicEnabled === 'function') {
      audio.setMusicEnabled(s.musicLevel > 0);
    }
    if (typeof audio.setMusicTrack === 'function') {
      audio.setMusicTrack(s.musicTrack);
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
    /* A dropped diff is a TUNE. The rates still come from the menu, appended
     * last, so a file that carries its own rateprofile is overridden rather
     * than quietly taking the sticks over. The notice says so. */
    const code = sim.init(text + ratesText);
    if (code === SIM_OK) {
      tuneText = text;
      configText = tuneText + ratesText;
      configName = file.name;
      /* A dropped diff is not one of the registry tunes any more. */
      configId = '';
      race.setRecordKey(recordKey());
      ui.setBest(race.bestMs, view.mode);
      notice = { text: `Flying ${configName}\nRates from the menu: ${ratesSummary(ui.settings)}`, untilMs: performance.now() + 3200 };
      reset();
    } else {
      notice = { text: `That tune could not be read.\n${configFault(code)}`, untilMs: performance.now() + 3600 };
      sim.init(configText);
      reset();
    }
  });

  /* Reused, not rebuilt: applySettings runs off a menu keypress, but the
   * same object also keeps the shape of the call obvious in one place. */
  const mixArg = { motors: 1, wind: 1, music: 1, focus: 1, ambience: 1 };
  const pPrev = new THREE.Vector3();
  const pCurr = new THREE.Vector3();
  const qPrev = new THREE.Quaternion();
  const qCurr = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const qSpawn = new THREE.Quaternion();
  const pProbe = new THREE.Vector3();
  const camFwd = new THREE.Vector3();
  /* Eased toward PARKED_LIFT while the craft is down and toward zero once it
   * is flying, so the view rises off the pad rather than jumping. */
  let parkedLift = PARKED_LIFT;
  /*
   * The title screen's camera. It belongs to the MAP, because the shot that
   * shows a map off is the map's business: the race field flies its own
   * racing line, the city flies its own streets, and the shell only has to
   * know which frame to ask for. Rebuilt on every swap, below.
   */
  let attractCam = makeAttractCamera(view);
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
    for (const smp of samples) {
      rcPending.push(smp);
    }
    /*
     * A sample taken while the integrator is not running has no RC slot to
     * land in: the title screen, a crash lockout, and every second the craft
     * sits landed. Keep the newest, so the first flying frame starts from
     * where the sticks actually are, and drop the rest. Without this the
     * queue grew for as long as the page was open, at the 100 ms heartbeat
     * alone, and the first frame of flight had to walk all of it.
     */
    if (!(mode === 'flight' && !crashed && launched && !landed) && rcPending.length > 1) {
      rcPending.splice(0, rcPending.length - 1);
    }
    /* Hard bound, whatever else happens. */
    if (rcPending.length > 1024) {
      rcPending.splice(0, rcPending.length - 256);
    }
    if (ui.isModal()) {
      ui.pollPad(padNav());
    }

    if (mode === 'flight' && !crashed && (!launched || landed)) {
      const thr = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
      if (!launched && thr > 0.05) {
        launched = true;
      } else if (landed && thr > TAKEOFF_THROTTLE) {
        /* Off again. The RC frame grid rides the SIM's own clock, which
         * froze with the integrator, so it is already seated; this re-pin
         * is belt and braces against any future path that moves rcNextMs
         * while the craft is down. Stamping the grid from the lap clock
         * here is the bug that made every second spent parked into a
         * second of stick lag. */
        landed = false;
        takingOff = true;
        pinRcGrid();
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
      const blockEndSim = simStepMs + steps;
      /*
       * Wall clock to sim clock, re-derived every frame rather than carried:
       * a sample taken (nowWall - wallT) ms ago belongs that many ms before
       * the end of the block this frame is about to step. The sim clock and
       * the wall clock advance together while flying, and this mapping
       * self corrects across the freezes where they do not.
       */
      const wallToSim = blockEndSim - nowWall;
      const framePeriod = 1000 / RC_HZ;
      while (rcNextMs < blockEndSim) {
        /* Take every sample whose moment has arrived; hold the last one. */
        while (rcPending.length > 0 && rcPending[0].wallT + wallToSim <= rcNextMs) {
          rcHeld = rcPending.shift();
        }
        let ts = rcNextMs / 1000;
        if (ts < lastTs) {
          ts = lastTs;
        }
        lastTs = ts;
        sim.input(ts, rcHeld.roll, rcHeld.pitch, rcHeld.yaw, rcHeld.throttle);
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
        simStepMs += steps;
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
      simPosToThree(stateCurr[1], stateCurr[2], stateCurr[3] + SPAWN_ALT, pProbe);
      pProbe.applyQuaternion(qSpawn);
      pProbe.x += startX;
      pProbe.z += startZ;
      /* startY is a WORLD height read off the terrain, so it is added after
       * the conversion. Folding it into the sim z, which is what this used to
       * do, would divide the ground itself by WORLD_SCALE and sink the whole
       * course. Only the craft's own displacement about the sim origin is
       * the aircraft's, and only that is scaled. */
      pProbe.y += startY;
      /*
       * The craft's vertical half extent at its current tilt. A quad is a
       * DISC: 0.347 m across the props, 0.080 m through the body, so the
       * old CRAFT_R sphere met the ground 13 cm before the airframe did
       * and stole 26.7 cm of every gate window. Level it is 0.040 m; banked
       * it grows toward CRAFT_R because a banked disc presents its
       * diameter to the vertical. Computed from last frame's rendered
       * quaternion, one frame of tilt lag on a 1 ms physics grid.
       */
      const cqx = shell.quad.quaternion.x;
      const cqz = shell.quad.quaternion.z;
      let upNow = 1 - 2 * (cqx * cqx + cqz * cqz);
      if (upNow > 1) {
        upNow = 1;
      }
      if (upNow < -1) {
        upNow = -1;
      }
      vHalfFrame = craftVerticalHalf(Math.sqrt(1 - upNow * upNow));
      const vHalf = vHalfFrame;
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
            if (sy - vHalf <= view.height(sx, sz, sy - vHalf - SURFACE_BIAS)) {
              touched = true;
              touchX = sx;
              touchZ = sz;
              touchY = sy;
              break;
            }
          }
        } else if (pProbe.y - vHalf <= view.height(pProbe.x, pProbe.z, pProbe.y - vHalf - SURFACE_BIAS)) {
          touched = true;
        }
      }
      groundPrev.copy(pProbe);
      groundHasPrev = true;
      if (takingOff) {
        if (
          !touched &&
          pProbe.y - vHalf > view.height(pProbe.x, pProbe.z, pProbe.y - vHalf - SURFACE_BIAS) + 0.05
        ) {
          /* Clear of the surface by a real margin, not just by the parked
           * pose's few millimetres: the takeoff is real and normal contact
           * judging owns the craft again. Without the margin the hold
           * released on the first frame and the spool dip handed the craft
           * straight back to the landing judgement, which is the chatter
           * this flag exists to prevent. */
          takingOff = false;
        } else if (touched) {
          const thrNow = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
          /* Depth of the craft's CENTRE below the surface. With the per
           * frame rest below, this is a backstop that only an upstream
           * regression can reach. */
          const sunk = view.height(touchX, touchZ, touchY - vHalf - SURFACE_BIAS) - touchY;
          if (thrNow <= TAKEOFF_THROTTLE || sunk > 0.10) {
            /* Aborted. Rest it where it is: arriving at the ground from
             * resting on it is not a crash at any spool speed. */
            takingOff = false;
            landed = true;
            sim.rest();
            stateCurr = readState();
            statePrev = stateCurr;
            acc = 0;
            groundY = view.height(touchX, touchZ, touchY - vHalf - SURFACE_BIAS);
            if (typeof audio.event === 'function') {
              audio.event('land');
            }
          } else if (stateCurr[6] <= 0) {
            /*
             * Still spooling off the pad and the frame ended descending:
             * THE GROUND HOLDS THE CRAFT WHILE THE MOTORS SPOOL, exactly
             * as a launch pad holds a real quad, by zeroing the sink each
             * frame while gravity still beats thrust. Without this the
             * craft free-falls through its own takeoff: measured at
             * 60 fps, a throttle crossing the gate at 0.26 spends about
             * 150 ms spooling from rest and the craft plunges 20 cm into
             * the ground in that time, because it spawns only 7.5 cm up.
             * The first frame that ends ascending is the spool won;
             * from there it climbs out of contact and takingOff clears.
             */
            sim.rest();
            stateCurr = readState();
            statePrev = stateCurr;
          }
        }
      } else if (touched) {
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
          /*
           * THE GROUND HOLDS THE CRAFT. sim_rest zeroes the velocity and
           * body rates at the judged touchdown, which is what a normal
           * force does and what this free-air model cannot do on its own.
           * Without it the frozen state kept its touchdown descent rate,
           * and a slow takeoff at 60 fps chattered between landed and
           * flying while the motors spooled from zero, RESUMING and
           * GROWING that stored descent on every cycle: measured, a
           * gentle throttle ramp accumulated 2.13 m/s of phantom descent
           * in fourteen freeze cycles and was judged a crash the pilot
           * never flew. A punch spooled fast enough to win the race,
           * which is why "wiggle and punch" worked and a normal takeoff
           * did not. Invisible in this container, whose 100 ms frames
           * hide the whole dip inside one frame's endpoints.
           */
          sim.rest();
          stateCurr = readState();
          groundY = view.height(touchX, touchZ, touchY - vHalf - SURFACE_BIAS);
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
       * Sitting on the ground. The integrator does NOT step: position is
       * still not writable through the ABI, so the craft is held by not
       * advancing it. The touchdown descent rate is no longer stored with
       * it: sim_rest zeroed the velocity at the landing judgement, so a
       * takeoff resumes from a true rest state and the only dip left is
       * the real one, the motors spooling up from wherever they idled.
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
      pinRcGrid();
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
    simPosToThree(statePrev[1], statePrev[2], statePrev[3] + SPAWN_ALT, pPrev);
    simPosToThree(stateCurr[1], stateCurr[2], stateCurr[3] + SPAWN_ALT, pCurr);
    pCurr.lerpVectors(pPrev, pCurr, a);
    simQuatToThree(statePrev[7], statePrev[8], statePrev[9], statePrev[10], qPrev);
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qCurr);
    qPrev.slerp(qCurr, a);
    pCurr.applyQuaternion(qSpawn);
    pCurr.x += startX;
    pCurr.z += startZ;
    /* The world ground under the spawn, added after the conversion for the
     * same reason as the probe above. */
    pCurr.y += startY;
    qPrev.premultiply(qSpawn);
    if (landed) {
      /* The frozen state's centre is at the surface plus the craft's tilt
       * aware vertical half extent, within millimetres of REST_HEIGHT, but
       * the terrain under it may differ from where contact tripped. Seat
       * the render on the resolved ground so a landing looks like a
       * landing. Render only: the physics state is untouched. */
      pCurr.y = groundY + simLenToWorld(REST_HEIGHT);
    } else if (crashed) {
      /*
       * A WRECK DOES NOT SINK. The integrator has no ground plane, so a
       * crashed craft keeps whatever velocity it hit with for the whole
       * lockout and drives itself under the surface, taking the camera with
       * it: the frame fills with the inside of the terrain until the reset
       * fires. Clamped on the render only, the same way a landing is, and
       * against the same query the contact test uses so the two agree.
       */
      const floor = view.height(pCurr.x, pCurr.z, pCurr.y - SURFACE_BIAS)
        + simLenToWorld(REST_HEIGHT);
      if (pCurr.y < floor) {
        pCurr.y = floor;
      }
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
      /* The craft the query sweeps is the ellipsoid: CRAFT_R across the
       * props, vHalfFrame through the body at its current tilt. */
      const k = view.colliders.hit(
        racePrev.x, racePrev.y, racePrev.z,
        pCurr.x, pCurr.y, pCurr.z,
        vHalfFrame,
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
          /* 'clip', not 'gate': the graze penalty must not sound like the
           * pass reward, or the ear learns the wrong lesson at speed. */
          if (typeof audio.event === 'function') {
            audio.event('clip');
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
      /*
       * AT THE FRONT OF THE FRAME, where a real FPV camera bolts on, not at
       * the centre of mass. With the camera at the centre, every forward
       * contact happened 17.35 cm in front of the lens: the pilot watched a
       * gate upright they had visibly not reached take the lap away, and
       * read it as "the drone is huge". 0.0775 m is the body's front edge
       * (bodyLength / 2 in src/render/craft.js), which leaves the prop arc
       * 9.6 cm ahead of the lens, the same order a real 5 inch puts it.
       * The offset is along the airframe's own forward axis, untilted: the
       * camera TILTS on its mount, it does not slide along its view ray.
       *
       * It is an AIRFRAME length, so it goes into the scene through
       * simLenToWorld like the model and the collision ellipsoid: 0.062 m of
       * world at WORLD_SCALE 1.25. A camera mount left at its unscaled value
       * would sit outside its own airframe.
       */
      camFwd.set(0, 0, -1).applyQuaternion(qPrev);
      shell.camera.position.copy(pCurr).addScaledVector(camFwd, simLenToWorld(0.0775));
      /*
       * The pad lift. On the ground, in the air, or wrecked, the camera is
       * raised by however much of PARKED_LIFT is currently eased in, which
       * is the whole of it while the craft is down and none of it once it is
       * flying. Applied along WORLD up rather than the airframe's, because
       * what it is compensating for is the ground being inside the near
       * plane, and the ground is where world up says it is.
       */
      const wantLift = (landed || crashed || !launched) ? PARKED_LIFT : 0;
      parkedLift += (wantLift - parkedLift) * Math.min(1, dt * 0.006);
      if (parkedLift > 0.001) {
        shell.camera.position.y += parkedLift;
      }
      shell.camera.quaternion.copy(qPrev).multiply(qTilt);
    } else {
      /*
       * Attract view: the craft parked, and the camera FLYING THE MAP rather
       * than circling one point of it. What the line is is the map's
       * business and src/render/attract.js is the whole of the shell's half
       * of it. The old orbit is still in there as the fallback for a map
       * with no line, which is what an empty custom course is.
       */
      shell.quad.visible = true;
      attractCam.update(nowWall, shell.camera);
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

    /* The racing line guide, driven off the same interpolated position the
     * craft is drawn at, so what it says about being on the line is what the
     * pilot can see. */
    view.updateRacingLine(pCurr);
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
      /* Performance, plus the stick rate, because the stick rate is a
       * performance number the pilot can feel and the frame rate is not the
       * same thing any more. padHz is how often the browser refreshes the
       * pad; if it tracks the frame rate this browser is rAF-locked on
       * gamepad input whatever we ask of it. */
      const stick = input.stats();
      ui.setReadout(
        `${fps.toFixed(0)} frames per second\n` +
        `${renderStats.calls} draw calls\n` +
        `${(renderStats.triangles / 1000).toFixed(0)}k triangles\n` +
        `stick ${stick.padHz} Hz pad, ${stick.sampleHz} Hz sampled, ${RC_HZ} Hz link`,
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
  /* How many cel materials the per frame clock walk touches. Check 16
   * asserts this returns to its boot value after a map round trip, which is
   * the measurement that catches a dead uniform kept alive forever. */
  window.__celCount = () => celTimeCount();
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
      /* The radius the QUERY sweeps, in world metres, because that is what
       * check 15 compares against the drawn craft's world bounding box. The
       * airframe's true radius and the ratio between them are published
       * beside it so neither can be mistaken for the other. */
      craftRadius: CRAFT_WORLD_R,
      craftRadiusTrue: CRAFT_R,
      worldScale: WORLD_SCALE,
    },
    lap: race.lap,
    bestLapMs: race.bestLapMs ? race.bestLapMs() : null,
    bestThreeMs: race.bestThreeMs ? race.bestThreeMs() : null,
  });
  /*
   * Which tune the module is actually running, read back from the module
   * rather than from the menu, plus the config coverage counters from
   * sim_bf_debug. A tune that is selected and not loaded, or loaded and
   * silently ignored, is the failure this exposes; scripts/preset-lint.js
   * asserts the same numbers headless. Harness only.
   */
  window.__tune = () => ({
    id: configId,
    name: configName,
    menu: ui.settings.tune,
    rates: ratesSummary(ui.settings),
    rollSrateSet: ui.settings.rateMax,
    offered: TUNES.map((t) => t.id),
    applied: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(13) : null,
    inert: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(14) : null,
    unknown: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(15) : null,
    pRoll: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(17) : null,
    dMaxRoll: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(21) : null,
    tpaRate: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(22) : null,
    rollSrate: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(42) : null,
  });
  window.__setTune = (id) => {
    ui.settings.tune = id;
    applySettings(ui.settings);
  };
  /*
   * What the stick path is ACTUALLY doing, measured rather than assumed.
   * padHz is how often the browser refreshes the Gamepad object, sampleHz how
   * often a changed value reaches the queue, rcHz the fixed grid handed to
   * Betaflight. If padHz sits at the frame rate the browser is rAF-locked on
   * gamepad input and only WebHID will move it. Harness only.
   */
  window.__stickPath = () => ({
    ...input.stats(),
    rcHz: RC_HZ,
    fps: Math.round(fps),
    pending: rcPending.length,
    held: { ...rcHeld },
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
    /* The loading bar's module weight for this map, so check 16 can assert
     * the typed number against what the browser actually fetched. */
    expectedModules: MAP_MODULE_COUNT[view.id] ?? null,
    ...(view.stats ? view.stats() : {}),
  });
  window.__maps = () => MAPS.map((m) => ({ id: m.id, name: m.name, mode: m.mode }));
  /* The declared departure from MultiGP's published obstacle dimensions, so
   * check 15 can assert the threshold file and the course agree about how big
   * a gate is rather than each believing its own copy. Harness only. */
  window.__gateScale = () => GATE_SCALE;
  /*
   * Drive the active map's animation clock to an arbitrary step, so a capture
   * can put a moving part where it needs it instead of waiting for it.
   *
   * The city's train circles the planet in about 43 s of simulated time and
   * this container renders two frames a second, so waiting for it to reach
   * the crossing is a minute and a half of wall clock that no check can
   * afford. It takes the same step count the frame loop passes, so a capture
   * driving it sees exactly the town a pilot would at that instant. Harness
   * only; nothing in the shell reads it.
   */
  window.__animTo = (step) => {
    view.updateAnim(step);
    return view.stats ? (view.stats().trainOffset ?? null) : null;
  };
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
