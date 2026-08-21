/*
 * main.js: the shell. Loads dist/sim.wasm, feeds it timestamped stick
 * samples, steps it on a fixed 1 kHz accumulator driven by
 * requestAnimationFrame, renders an interpolated view, and drives the
 * product shell in src/ui/ui.js. The frame delta clocks the accumulator
 * and never reaches the integrator; a dropped frame changes nothing about
 * the trajectory.
 *
 * The page opens on a title: the loaded map fills the canvas, the session
 * airframe flies the map's attract line, and the menu sits on top as a
 * HUD. That shot is the same world the player is about to fly, not a
 * second scene. Settings still has its own cheap studio context, created
 * when that screen opens and torn down when flight starts.
 *
 * Ground handling is deliberately shell side: the physics module has no
 * ground plane (the verification harness measures free air behaviour), so
 * the shell spawns the quad at altitude and declares a crash when it
 * reaches the ground, then resets. See PROGRESS.md.
 *
 * Keys in flight: Escape pauses, R returns to the start line, L is launch
 * control when that setting is on, F3 toggles the performance readout, F8
 * reports a bug. Everything else is a menu choice.
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
import { applyPixelRatio, normalizeGraphics } from './render/quality.js';
import { readGpuInfo } from './render/gpuinfo.js';
import { makeAttractCamera } from './render/attract.js';
import { measureBudget } from './render/budget.js';
import { simPosToThree, simQuatToThree, simLenToWorld, threePosToSim, threeDirToSim, WORLD_SCALE } from './render/frame.js';
import { CAMERA_MOUNT_FORWARD, CAMERA_MOUNT_UP, cameraTiltRad, clampCameraAngle, makeLensShake } from './render/lens.js';
import { MotorAudio } from './render/audio.js';
import { InputManager, NAV_DEFLECT } from './input/input.js';
import { RcLink, LINK_DEFAULT, LINK_PRESETS } from './input/link.js';
import { FlightRecorder, downloadText, flightLogName } from './share/flightlog.js';
import { Race } from './game/race.js';
import { CRAFT_R, CRAFT_WORLD_R, craftVerticalHalf, isLanding, hitOutcome, GRAZE_SPEED_MAX, BOUNCE_SPEED_MAX, HIT_LIVES, BOUNCE_COOLDOWN_MS, BOUNCE_RESTITUTION, BOUNCE_TANGENT_KEEP, BOUNCE_RATE_KEEP, BOUNCE_SEPARATION, LAND_DESCENT_MAX, LAND_HORIZONTAL_MAX, LAND_TILT_MAX_DEG, LAND_TILT_HARD_DEG, LAND_TIP_SPEED_MAX } from './game/collide.js';
import { Ui, formatTime } from './ui/ui.js';
import { adoptShareFromLocation, boardPageUrl, fetchTrackDocument, postTime } from './share/board.js';
import { inspectCourse, publishCurrentCourse, pushOwnedListing, seatedCourseKey, suggestRemixName, syncOwnedIdentity } from './share/listing.js';
import { nameRules, readPilotName, writePilotName } from './share/pilot.js';
import {
  clearPendingTime,
  readPendingTime,
  writePendingTime,
  writePostedBest,
  writeShareImport,
} from './share/session.js';
import { createShowcase } from './render/showcase.js';
import { celTimeCount } from './render/celmat.js';
import { MAPS, mapById } from './maps/registry.js';
import { TUNES, tuneById, tunePath } from '../configs/registry.js';
import { ratesDiff, ratesSummary } from '../configs/rates.js';
import { composeConfig, moduleGet, RATES_KEEP } from './fc/dump.js';
import { GATE_SCALE } from './game/track.js';
import { planStages, moduleCounter, yieldToPaint } from './ui/loading.js';
import { loadSim, simErrorName, SIM_OK } from '../tests/lib/simmod.js';

/*
 * The module's bytes, resolved against this file rather than the site root.
 *
 * It was '/dist/sim.wasm', which is the same URL as long as the shell is the
 * whole site. It is not any more: webfpv.org serves the landing page at the
 * root and this shell under /sim/, so a leading slash asked the landing page
 * for the physics and got its 404 page back. Every other file the boot path
 * needs moved the same way and for the same reason. Nothing about the module
 * changed, only where the page looks for it, and at the root it still
 * resolves to exactly /dist/sim.wasm.
 */
const WASM_URL = new URL('../dist/sim.wasm', import.meta.url).href;

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
/*
 * Opening shot when a run starts: orbit the quad on the pad, settle
 * behind it, then dolly into the FPV camera. The three spans are wall
 * milliseconds of the same 1 ms accumulator the frame already uses, so
 * a hitch stretches the shot rather than skipping it.
 */
const INTRO_ORBIT = 2200;
const INTRO_APPROACH = 800;
const INTRO_ZOOM = 1000;
const INTRO_FLY = INTRO_ORBIT + INTRO_APPROACH;
const INTRO_TOTAL = INTRO_FLY + INTRO_ZOOM;
/* Hitch frames are capped at 100 ms in the loop. Adding that whole cap
 * to the intro clock burns the pad shot before a single exterior frame
 * is shown. A real frame is about 16 ms; 33 ms is 30 fps. */
const INTRO_STEP_MAX = 33;
/* Orbit starts on a three-quarter behind the right shoulder and walks
 * 300 degrees, which lands dead astern. Approach then closes from that
 * same point. Radii are world metres, outside the 0.2 m near plane. */
const INTRO_THETA0 = 0.55;
const INTRO_ORBIT_SPAN = (300 * Math.PI) / 180;
const INTRO_ORBIT_RADIUS = 0.72;
const INTRO_ORBIT_HEIGHT = 0.30;
const INTRO_APPROACH_RADIUS = 0.40;
const INTRO_APPROACH_HEIGHT = 0.14;
const INTRO_FOV = 40;
/* Finish shot. Pulls off the FPV lens onto a three-quarter of the
 * frozen craft, then sways. Radii in world metres. */
const FINISH_FOV = 46;
const FINISH_RADIUS = 2.35;
const FINISH_HEIGHT = 0.88;
const FINISH_PULL_MS = 1050;
const FINISH_SWAY = 0.00055;
function introEase(t) {
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }
  return t * t * (3 - 2 * t);
}
/*
 * How far behind the next gate a crashed craft is put back on the ground, in
 * metres along that gate's own approach. The same figure the race field
 * stands its quad back from the timing gate with, so a respawn is framed
 * exactly like a start: the gate ahead, square on, at a distance that gives
 * the motors somewhere to spool before the opening arrives.
 */
const RECOVER_BACK = 7;
/* The controller consumes each input sample as one RC frame, so the shell
 * must feed it at a radio's rate rather than the display's. 250 Hz is a
 * typical ELRS link and matches the harness recording rate. */
const RC_HZ = 250;
/*
 * The physics step rate. This MUST equal SIM_STEP_HZ in
 * src/native/sim_abi.h; the ABI does not report it, so the two are kept in
 * step by hand and a mismatch shows up as the shell stepping the module at
 * the wrong speed.
 *
 * The shell's clock is an integer STEP INDEX, not milliseconds. It was
 * milliseconds, which is the same thing only while a step is a
 * millisecond: `steps = Math.floor(acc)` reads an accumulator of
 * milliseconds as a count of steps, and every `simTimeMs += steps` says
 * the same. Raising the rate turns each of those into a silent factor of
 * eight. Counting steps and deriving milliseconds keeps one clock. At
 * 1000 Hz MS_PER_STEP is exactly 1 and every expression below reduces to
 * what it replaced.
 */
const SIM_HZ = 1000;
const MS_PER_STEP = 1000 / SIM_HZ;
/* Pack nominal, for the charge bar: 6S between empty and full. */
/* The 6 is PLANT.cells in src/native/plant.c, restated here because the ABI
 * does not report it. These are the HUD gauge's ends only: the physics reads
 * its own constant and never these. Change the plant's cell count and this
 * has to follow, or the bar lies while the flight is right. */
const PACK_EMPTY_V = 6 * 3.3;
const PACK_FULL_V = 6 * 4.2;
/* Full throttle rotor speed on a charged pack, measured off the compiled
 * module at 25,570 RPM. Only the lens shake reads it, to turn motor speed
 * into a 0 to 1 imbalance scale, so a few percent either way is invisible. */
const FULL_THROTTLE_RPM = 25600;

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
const AXIS_X = new THREE.Vector3(1, 0, 0);

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
const MAP_MODULE_COUNT = { field: 1, city: 64, custom: 1 };
/* Where a map's modules live, so the loading bar can count them. Data, not a
 * ternary: the ternary read "field or else city", so a third map counted its
 * modules under the city's prefix and the bar sat at zero.
 *
 * These stay leading-slash while the rest of the file went relative, and that
 * is not an oversight. They are never fetched. moduleCounter matches them as a
 * SUBSTRING of each performance entry's full URL, and a shell mounted at
 * https://webfpv.org/sim/ still produces names containing /src/maps/city/. */
const MAP_MODULE_PREFIX = { field: '/src/maps/field', city: '/src/maps/city/', custom: '/src/maps/custom' };

async function loadMap(shell, id, loading, options) {
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
  const map = await mod.buildMap(shell, (f) => loading.progress('world', f), options);
  map.graphics = normalizeGraphics(options && options.quality);
  loading.done('world');
  return map;
}

export async function boot({ loading, bootStart, mapId }) {
  const BOOT_START = bootStart ?? performance.now();
  const canvas = document.getElementById('view');
  /* The flying view wants the shortest path to the glass it can get, and
   * has nothing to read its own frames back for. See shell.js for what the
   * compositor queue costs a pilot. */
  const shell = buildShell(canvas, { desynchronized: true });
  const input = new InputManager();
  /*
   * Sample the sticks on their own timer rather than once per rendered frame.
   * See src/input/input.js for what that was costing feedforward.
   */
  input.startPolling(2);
  const ui = new Ui(uiRoot);
  const gpuInfo = readGpuInfo(shell.renderer);
  ui.setGpuInfo(gpuInfo);
  window.__gpu = gpuInfo;
  /*
   * A machine with no usable GPU hands WebGL to SwiftShader or llvmpipe and
   * keeps drawing, so nothing fails and nothing says why. It just runs at a
   * handful of frames per second, and because the picture is what tells a
   * pilot where the quad is, a slow picture reads as a slow radio. The
   * sticks are not late: they are sampled off their own 2 ms timer and
   * stamped, and the module consumes each one at the moment it was taken.
   * The frame carrying the answer back is what is late.
   *
   * Detection could not know this earlier. loadSettings runs before any
   * context exists and can only read the user agent, which names a Steam
   * Deck and nothing else. This is the first line that has the renderer, so
   * it is the first line that can tell a CPU rasteriser from a GPU.
   *
   * Only a DETECTED value is lowered. Someone who picked High on this
   * machine and meant it keeps it, however it runs.
   */
  if (gpuInfo.software && ui.settings.graphicsAuto && ui.settings.graphics !== 'low') {
    ui.settings.graphics = 'low';
    /* Still detected, not chosen, so this stays set. It costs nothing: the
     * value is already Low, so the test above short circuits on every later
     * boot, and leaving the flag honest is what lets a future round raise a
     * machine back up if it turns out to have had a GPU all along. */
    ui.persistSettings();
    ui.renderMenu();
  }
  let showcase = null;
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
  /*
   * A published course arrives as ?share=id. Fetch it before the world is
   * built so the custom map reads the document the board sent, not the
   * draft sitting in the builder's autosave.
   */
  try {
    const adopted = await adoptShareFromLocation();
    if (adopted) {
      ui.settings.map = 'custom';
      ui.renderMenu();
    }
  } catch (e) {
    ui.setBanner(`Could not open that published course.\n${e.message ?? e}`, true);
  }
  /*
   * The handle lives in this browser. If it has changed since this browser
   * last published, push it to the board so the author line and the times
   * posted under the old handle catch up. A layout change is not sent here:
   * that still asks first, because it clears times.
   */
  (async () => {
    try {
      const listing = inspectCourse();
      await pushOwnedListing(listing && listing.doc ? listing.doc : null);
    } catch (e) {
      /* The board can stay a step behind until they save the name again. */
    }
  })();

  let view = null;
  window.addEventListener('resize', () => {
    const d = shell.resize();
    /* mapReady as well as view: a swap disposes the old pipeline before it
     * builds the new one, and a resize landing in that window used to call
     * setSize on render targets that had already been freed. mapReady is
     * false for exactly that gap. */
    if (view && view.post && mapReady) {
      view.post.setSize(d.w, d.h);
    }
  });
  const audio = new MotorAudio();
  audio.music.onChange = (st) => {
    ui.setMusicNow(st);
  };
  ui.onMusicSkip = (dir) => {
    wakeAudio();
    if (typeof audio.skipMusic !== 'function') {
      return;
    }
    audio.skipMusic(dir);
    const st = audio.musicStatus();
    if (st && ui.settings.musicTrack !== 'rotation') {
      ui.settings.musicTrack = st.id;
      ui.persistSettings();
    }
    if (ui.screen === 'settings') {
      ui.renderMenu();
    }
  };

  loading.start('sim');
  const sim = await loadSim(await fetchBytes(WASM_URL, (f, got, total) => {
    loading.progress('sim', f, `${(got / 1024).toFixed(0)} of ${(total / 1024).toFixed(0)} kB`);
  }));
  if (typeof sim.e.sim_deflect !== 'function') {
    throw new Error('sim.wasm does not export sim_deflect');
  }
  if (typeof sim.e.sim_set_launch_stand !== 'function') {
    throw new Error('sim.wasm does not export sim_set_launch_stand');
  }
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
   * Async config loads (tune menu, dropped diff) are generation counted.
   * A stale fetch must not call sim_init after a newer choice has already
   * won, and Fly / Resume must not start a run whose RC timestamps will be
   * invalidated by a sim_init still in flight. See adoptSimClock.
   */
  let configGen = 0;
  let configLoadWait = Promise.resolve();
  /*
   * A flown config is a TUNE plus the pilot's RATES, joined only by
   * composeConfig in src/fc/dump.js. No file in configs/ carries a
   * rateprofile any more, and the rate lines are appended last so that even
   * a diff the pilot drops on the page flies on the rates in the menu. See
   * configs/rates.js for why the two were separated: shipping rates inside
   * the Karate preset meant choosing that tune also halved the stick
   * authority, so the tune could never be judged on its own.
   */
  let tuneText = new TextDecoder().decode(await fetchBytes(tunePath(configId)));
  let ratesText = ratesDiff(ui.settings.rates);
  let configText = composeConfig(tuneText, ui.settings.rates, RATES_KEEP);
  if (sim.init(configText) !== SIM_OK) {
    throw new Error(`sim_init failed on ${configName}`);
  }
  loading.done('sim');
  loading.detail = '';

  applyPixelRatio(shell, ui.settings.graphics);
  /*
   * The swap path has fallen back to the previous map on a failed load for
   * a while; boot had nothing, so one map that would not build (a bad
   * asset, a WebGL context the city cannot have, a course the custom map
   * chokes on) took the whole session down before the title screen. The
   * field is the floor: it is the default map and the smallest world here,
   * so if it cannot build there is nothing to fall back TO and the throw is
   * honest.
   */
  try {
    view = await loadMap(shell, ui.settings.map, loading, { quality: ui.settings.graphics });
  } catch (e) {
    if (ui.settings.map === 'field') {
      throw e;
    }
    console.error(e);
    const failed = mapById(ui.settings.map).name;
    ui.settings.map = 'field';
    ui.renderMenu();
    view = await loadMap(shell, 'field', loading, { quality: ui.settings.graphics });
    /* The banner, not `notice`: that is declared with the frame loop's own
     * state further down and does not exist yet. This is the same way the
     * share adoption above reports a boot failure. */
    ui.setBanner(`${failed} could not be loaded.\nThe race field was loaded instead.`, true);
  }
  ui.setShare(view.share || null);
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
  let startPitch = 0;
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

  /* The y component of the craft's own up vector, in world space, clamped
   * into the domain of acos. Rotating world up by q leaves 1 - 2(x^2 + z^2),
   * and the clamp is there because a normalised quaternion can still put
   * that a bit outside [-1, 1] in floating point. Reads qCollide, the
   * attitude the ground query and the hit query both use this frame.
   */
  function craftUpY() {
    const qx = qCollide.x;
    const qz = qCollide.z;
    const u = 1 - 2 * (qx * qx + qz * qz);
    if (u > 1) {
      return 1;
    }
    return u < -1 ? -1 : u;
  }

  function adoptSpawn() {
    startX = view.spawn.x;
    startZ = view.spawn.z;
    startYaw = view.spawn.yaw;
    startPitch = view.spawn.pitch || 0;
    /* Terrain here is not at y = 0. Spawning without its height puts the
     * craft underground, looking up at the lit underside of the terrain. */
    startY = groundAt(startX, startZ);
    qSpawn.setFromAxisAngle(AXIS_Y, startYaw);
    qSpawnInv.copy(qSpawn).invert();
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
  let simStepIdx = 0;
  let acc = 0;
  let lastTs = 0;
  let rcNextMs = 0;
  /*
   * The radio. Default is 'perfect', which is the behaviour this shell has
   * always had: turning a real link on has to be a choice, so that a lap
   * time never changes underneath a pilot who did not ask for it.
   */
  const rcLink = new RcLink(LINK_DEFAULT);
  /*
   * The flight recorder. Off unless the pilot turns it on, because it holds
   * every frame of the run in memory and nobody should pay for that without
   * asking. Written out as blackbox_decode CSV so a sim flight and a real
   * quad's log go through the same parser and the same report.
   */
  const flightLog = new FlightRecorder();
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
    rcNextMs = simStepIdx * MS_PER_STEP;
    lastTs = rcNextMs / 1000;
    /* The radio restarts with the grid it feeds, so a reset is a reset and
     * a replay of the same session draws the same jitter. */
    rcLink.reset(rcNextMs);
    if (rcPending.length > 1) {
      rcPending.splice(0, rcPending.length - 1);
    }
  }

  /*
   * JS RC time follows the module, never the other way around. sim_init and
   * sim_reset restart the input stream at t = 0. Stamping sim.input from a
   * leftover lastTs puts every sample in the queue's future: sim_step only
   * consumes a sample once step_index reaches its timestamp, so the lag
   * equals the leftover. That was round 16b (lap clock) and the tune-swap
   * lag (async sim_init). Read the module every time the stream can restart.
   */
  function adoptSimClock() {
    const st = readState();
    simStepIdx = Math.round(st[0] * SIM_HZ);
    pinRcGrid();
  }

  function bumpConfigGen() {
    configGen += 1;
    return configGen;
  }

  function isLiveConfigLoad(gen) {
    return gen === configGen;
  }

  function whenConfigReady(fn) {
    const gen = configGen;
    configLoadWait.then(() => {
      if (configGen !== gen) {
        whenConfigReady(fn);
        return;
      }
      fn();
    }, () => {
      if (configGen !== gen) {
        whenConfigReady(fn);
        return;
      }
      fn();
    });
  }
  let crashed = false;
  let crashedAtWall = 0;
  /* -1: FPV. 0..INTRO_TOTAL: orbit, approach, then zoom at the start of a run. */
  let introMs = -1;
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
   *
   * There used to be a `launched` flag here as well. It was initialised true
   * and never assigned anything but true, because setting it false on a
   * respawn was what made every recovery repeat the takeoff trap, so every
   * test of it was a constant and the takeoff hint it gated could not
   * appear. What the banner actually wants is "has this run left the ground
   * yet", which is a render question, not a flight one: nothing below reads
   * this, so it cannot gate the integrator or the RC grid the way the old
   * flag could.
   */
  let flownThisRun = false;
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
  let hitsLeft = HIT_LIVES;
  let bounceAtWall = 0;
  let bounceHitIndex = -1;
  let bounceHitKind = '';
  /* The craft's tilt-aware vertical half extent, written by the physics
   * branch each frame and read by the obstacle query later in the same
   * frame. Starts level. */
  let vHalfFrame = craftVerticalHalf(0);
  let airtimeMs = 0;
  let fps = 0;
  let camTilt = ui.settings.cameraAngle;
  let runVoltage = ui.settings.packVoltage;
  let notice = null; /* { text, untilMs } for one off shell messages */
  let padPickReturn = 'title';
  /* How many laps THIS run lasts. Settings.laps can change from pause, and
   * reading it live used to end a 5 lap run the moment someone dropped the
   * setting to 1. */
  let runLaps = ui.settings.laps;
  race.setRecordKey(recordKey());
  ui.setBest(race.bestMs, view.mode);

  function showCourseNotes() {
    if (view.notes && view.notes.length) {
      notice = { text: view.notes.join('\n'), untilMs: performance.now() + 5600 };
    }
  }
  showCourseNotes();

  /*
   * One way into the crash path, because there are now three things that can
   * cause one: arriving at the ground too fast, arriving at it too far from
   * upright, and touching anything solid. The run continues. Time is the
   * penalty.
   */
  function crashInto(reason, nowWall) {
    crashed = true;
    landed = false;
    takingOff = false;
    crashedAtWall = nowWall;
    /* The intro camera is a run-start cutscene. Leaving it running through
     * a wreck kept the orbit going over a locked-out craft, then recovery
     * landed inside the remaining shot. */
    introMs = -1;
    /*
     * A crash is flown out of, not restarted from. The race keeps its place
     * in the flying order and its lap clock; resetCraft puts the craft back
     * on the ground in front of the gate it was heading for. On a freestyle
     * map there is no order to keep, and Race.recover says so for both.
     */
    race.recover(reason, nowWall);
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
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
   * Where a crashed craft comes back, in world space: on the ground, behind
   * the gate the race still wants, facing it.
   *
   * The offset is along +(sin heading, cos heading) and the craft's own yaw
   * is the heading, which is the SAME arrangement the race field uses to
   * stand its quad back from the timing gate. It is not an accident that one
   * formula serves both: a gate's heading is the direction a craft at that
   * yaw is flown THROUGH it, so stepping the other way along it is always
   * the approach side, for any gate on any course.
   *
   * Returns null when there is no gate to come back to, which is a freestyle
   * map and an empty custom course. Those go back to the spawn, as before.
   */
  function recoverySpawn() {
    const i = race.nextSceneIndex();
    const gt = view.gates && view.gates[i];
    if (!gt) {
      return null;
    }
    return {
      x: gt.position.x + Math.sin(gt.heading) * RECOVER_BACK,
      z: gt.position.z + Math.cos(gt.heading) * RECOVER_BACK,
      yaw: gt.heading,
    };
  }

  /*
   * Put the craft back into the run without ending it. A crash costs the
   * lap it happens on, not the laps already flown: erasing three clean laps
   * because of one clipped tree is not how a race works.
   *
   * `at` is where to come back, and the default is the start line. A crash
   * passes the recovery point instead, which is what lets a pilot fly out of
   * one rather than restart from the timing gate.
   */
  function resetCraft(at) {
    if (at) {
      startX = at.x;
      startZ = at.z;
      startYaw = at.yaw;
      startPitch = 0;
      startY = groundAt(startX, startZ);
      qSpawn.setFromAxisAngle(AXIS_Y, startYaw);
      qSpawnInv.copy(qSpawn).invert();
    }
    sim.reset();
    sim.setCellVoltage(runVoltage);
    /*
     * THE LAP CLOCK IS NOT TOUCHED, and the two clocks being separate
     * variables is what makes that possible. simStepIdx mirrors the module's
     * own step_index, which sim_reset has just put back to zero, so it MUST
     * follow or every queued stick sample lands in the integrator's future.
     * simTimeMs is the LAP clock and belongs to the race, which is still
     * running: zeroing it here is what used to hand a crashed pilot their
     * lap time back. adoptSimClock reads that zero from the module rather
     * than assuming it, so a future reset that keeps a warmup offset cannot
     * silently desync the RC grid again.
     */
    acc = 0;
    rcPending.length = 0;
    adoptSimClock();
    crashed = false;
    /* Back on the ground, landed, exactly as at boot. */
    landed = true;
    takingOff = false;
    launchStaging = false;
    input.forcePadRest = false;
    lcPrevState = 0;
    lcGoUntil = 0;
    lcBoost = false;
    lcAcroUntil = 0;
    if (lcArmed && ui.settings.launchControl) {
      applyLaunchSwitch(true);
    }
    /* Parked again, so the takeoff hint is due again. Render only. */
    flownThisRun = false;
    /* startY is that same query, taken a few lines up by adoptSpawn or by
     * the `at` branch. Asking the terrain twice for one point is how the
     * two drift if one of them ever grows an offset. */
    groundY = startY;
    /* Clear the judgement that produced the last crash. Leaving it behind is
     * how __craftState reports a 2.8 m/s arrival on a craft sitting calmly on
     * the start line, which reads as a landing gate that does not work. */
    lastDescent = 0;
    lastTiltDeg = 0;
    lastClosing = 0;
    lastHitKind = 'none';
    input.keys.clear();
    input.drain();
    input.resetKeyboardSticks();
    raceHasPrev = false;
    hitsLeft = HIT_LIVES;
    bounceAtWall = 0;
    bounceHitIndex = -1;
    bounceHitKind = '';
    /* The race interpolates a gate crossing between its own previous sim
     * time and this one. A respawn teleports the craft, so the segment
     * either side of it is not a flight path: leaving prevSimMs behind put
     * a crossing time somewhere in the gap. Nulling it makes the first
     * update after a recovery use simMs exactly. */
    race.prevSimMs = null;
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
    /* Back to the MAP's own spawn. A crash recovery moves the spawn offset
     * to a point on the course, and a new run must not begin from wherever
     * the last one happened to end. */
    adoptSpawn();
    /*
     * The LAP clock, which resetCraft deliberately leaves alone: a crash
     * recovery keeps the run going, a fresh run does not. Setting it here,
     * before the craft reset, keeps the two clocks in the same order they
     * were written in. Nothing in resetCraft reads it: adoptSimClock and
     * pinRcGrid follow simStepIdx, which mirrors the module.
     */
    simTimeMs = 0;
    /*
     * Everything else a reset does to the CRAFT is resetCraft's job, and it
     * used to be a verbatim copy of it, comments and all, which is the kind
     * of duplication that survives until the two drift and a crash recovery
     * starts clearing something a restart does not. Passing null keeps the
     * spawn adoptSpawn just set.
     */
    resetCraft(null);
    race.reset();
    runLaps = ui.settings.laps;
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
  }

  /*
   * Swap the world.
   *
   * `mapReady` is what keeps the frame loop out of a half built world: the
   * loop keeps running through the swap because stopping and restarting it
   * would lose the accumulator, so it has to be told to skip a frame instead.
   * `swapInFlight` is the lock that used to be the same flag: conflating them
   * meant a failed load left mapReady false forever, so the next map pick
   * was refused and the shell froze on a disposed scene.
   * Disposing BEFORE building is deliberate and it is the whole point of the
   * split: the city's render targets and the field's must never both exist,
   * or P5's 120 MB budget is measured against two worlds.
   */
  let mapReady = true;
  let swapInFlight = false;
  let finishLoadingOnFrame = true;

  function adoptLoadedView(keepPlace, stayMode, stayScreen) {
    attractCam = makeAttractCamera(view);
    if (!keepPlace) {
      race = new Race(view.gates);
      race.setRecordKey(recordKey());
      ui.setBest(race.bestMs, view.mode);
      adoptSpawn();
      ui.setShare(view.share || null);
      reset();
      mode = 'title';
      ui.show('title');
      showCourseNotes();
    } else {
      /* Same map, new look. Physics and the lap stay where they were; the
       * new gate meshes just need the current next-gate highlight. */
      view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
      ui.setShare(view.share || null);
      ui.setBest(race.bestMs, view.mode);
      mode = stayMode === 'flight' ? 'paused' : stayMode;
      if (stayScreen) {
        ui.show(stayScreen);
      }
    }
    finishLoadingOnFrame = true;
    mapReady = true;
  }

  /* Custom is one map id and many courses. A second pick from the board
   * used to no-op because wantId and view.id were both "custom". */
  function wantedCourseKey(mapId) {
    return mapId === 'custom' ? seatedCourseKey() : '';
  }

  function loadedCourseKey(map) {
    if (!map || map.id !== 'custom') {
      return '';
    }
    return map.courseKey || '';
  }

  function worldMatchesSettings() {
    const wantId = mapById(ui.settings.map).id;
    const wantQ = normalizeGraphics(ui.settings.graphics);
    return view
      && wantId === view.id
      && wantQ === view.graphics
      && wantedCourseKey(wantId) === loadedCourseKey(view);
  }

  async function syncWorld() {
    /* Normalised, not raw. Every loader path runs the id through mapById,
     * which falls back to the first map for an id no map has, so a raw
     * setting of 'bogus' would leave view.id as 'field' and the tail guard
     * below would see a mismatch that can never clear: dispose, rebuild,
     * re-enter, forever. ?map= is taken verbatim in boot.js, so an unknown
     * id is reachable from a stale bookmark. */
    const wantId = mapById(ui.settings.map).id;
    const wantQ = normalizeGraphics(ui.settings.graphics);
    if (swapInFlight) {
      return;
    }
    if (mapReady && worldMatchesSettings()) {
      return;
    }
    const keepPlace = mapReady && wantId === view.id && wantedCourseKey(wantId) === loadedCourseKey(view);
    /*
     * Which menu the pilot goes back to after the swap, or null for the
     * title. This is a list of PAGE screens, and it has to name every one a
     * settings change can be made from: 'rates' is here because every arrow
     * key on that screen runs applySettings, which lands here whenever the
     * world no longer matches, and without it a rate nudge would bounce the
     * pilot to the title. The 'fc' it replaces named a screen that no
     * longer exists, and would have failed silently: show() on an unknown
     * name displays no node and leaves the previous screen's rows behind.
     */
    const STAY_SCREENS = ['settings', 'rates', 'paused', 'title'];
    const stayScreen = STAY_SCREENS.includes(ui.screen) ? ui.screen : null;
    const stayMode = keepPlace ? mode : 'title';
    swapInFlight = true;
    mapReady = false;
    if (!keepPlace) {
      mode = 'title';
      ui.show('title');
    }
    const entry = mapById(wantId);
    loading.run(planStages(['module', 'world', 'frame'], entry.buildMs));
    /* Paint the loading screen BEFORE disposing a world and building another,
     * because both of those block the main thread and a screen nobody
     * composited is not a screen. */
    await yieldToPaint();
    const previous = view.id;
    const previousGraphics = view.graphics;
    try {
      view.dispose();
    } catch (e) {
      /* Already gone, or the last swap never produced a world. */
    }
    applyPixelRatio(shell, wantQ);
    try {
      view = await loadMap(shell, wantId, loading, { quality: wantQ });
      loading.start('frame');
      adoptLoadedView(keepPlace, stayMode, stayScreen);
    } catch (e) {
      /*
       * The old world is already gone by here, deliberately: disposing before
       * building is what keeps two maps' render targets from ever coexisting.
       * Rebuild the map that was just disposed. A message with no world
       * behind it used to leave mapReady false forever.
       */
      console.error(e);
      ui.settings.map = previous;
      ui.settings.graphics = previousGraphics;
      try {
        applyPixelRatio(shell, previousGraphics);
        view = await loadMap(shell, previous, loading, { quality: previousGraphics });
        loading.start('frame');
        adoptLoadedView(keepPlace, stayMode, stayScreen);
        notice = {
          text: `${entry.name} could not be loaded.`,
          untilMs: performance.now() + 4200,
        };
      } catch (e2) {
        console.error(e2);
        loading.fail(`${entry.name} could not be loaded. ${e.message ?? e}`);
      }
    } finally {
      swapInFlight = false;
    }
    /* A change requested DURING the swap was refused by the guard at the top,
     * and ui.js has already saved it, so the setting and the loaded map would
     * otherwise stay diverged with the title screen naming a map that is not
     * there. Honour it now. */
    if (mapReady && !worldMatchesSettings()) {
      await syncWorld();
    }
  }
  async function swapMap(id) {
    ui.settings.map = id;
    return syncWorld();
  }

  /*
   * ANGLE MODE is a Betaflight flight-mode flag, not a plant change. The
   * module defaults to acro. Keyboard stick input cannot hold a rate, so
   * it always raises ANGLE_MODE; a radio uses the setting. Changing this
   * does not re-init the module and does not reset the craft.
   */
  let angleModeOn = false;
  /* L-switch for launch control. The Settings row only enables the
   * feature; this is the mode switch, captured at the sitting. */
  let lcArmed = false;
  let launchStaging = false;
  let lcBoost = false;
  let lcAcroUntil = 0;
  let lcPrevState = 0;
  let lcGoUntil = 0;

  function wantAngleMode() {
    if (lcAcroUntil === Infinity || (lcAcroUntil > 0 && performance.now() < lcAcroUntil)) {
      return false;
    }
    return input.isKeyboardPrimary() || ui.settings.flightMode === 'angle';
  }

  function pitchNoseDownDeg(st) {
    const w = st[7];
    const x = st[8];
    const y = st[9];
    const z = st[10];
    const ux = 2 * (x * z - w * y);
    const uy = 2 * (y * z + w * x);
    const uz = 1 - 2 * (x * x + y * y);
    const horiz = Math.sqrt(uy * uy + uz * uz);
    return Math.atan2(-ux, horiz) * (180 / Math.PI);
  }

  function lcState() {
    return typeof sim.launchControlState === 'function'
      ? sim.launchControlState()
      : 0;
  }

  function applyLaunchSwitch(on) {
    lcArmed = Boolean(on);
    if (typeof sim.setLaunchControl === 'function') {
      sim.setLaunchControl(lcArmed);
    }
  }

  function disableLaunchStand() {
    sim.e.sim_set_launch_stand(0, 0, 0, 0, 1, 0, 0, 0);
  }

  /* Seed the plant with the ramp pitch the parked overlay was drawing,
   * then let the module hold a rear-arm hinge every 1 ms step. Without
   * that seed, launching off a 28 degree block dropped the craft onto a
   * level physics pose and walking the stick walked it off the rails. */
  function enableLaunchStand() {
    const st = readState();
    const h = startPitch * 0.5;
    const code = sim.e.sim_set_launch_stand(
      1, st[1], st[2], st[3],
      Math.cos(h), 0, Math.sin(h), 0,
    );
    if (code === SIM_OK) {
      stateCurr = readState();
      statePrev = stateCurr;
    }
  }

  function beginLaunchStaging() {
    if (!(mode === 'flight' && !crashed && landed)) {
      return;
    }
    landed = false;
    takingOff = true;
    launchStaging = true;
    adoptSimClock();
    input.forcePadRest = true;
    enableLaunchStand();
  }

  function endLaunchStaging(park) {
    launchStaging = false;
    input.forcePadRest = false;
    lcBoost = false;
    disableLaunchStand();
    if (park && mode === 'flight' && !crashed) {
      sim.rest();
      landed = true;
      takingOff = false;
      stateCurr = readState();
      statePrev = stateCurr;
      acc = 0;
    }
  }

  function syncLaunchControl(nowMs) {
    if (!ui.settings.launchControl && lcArmed) {
      applyLaunchSwitch(false);
      if (launchStaging) {
        endLaunchStaging(true);
      }
      lcAcroUntil = 0;
    }
    const st = lcState();
    if (st === 1 || st === 2) {
      lcAcroUntil = Infinity;
      if (landed && !crashed && mode === 'flight') {
        beginLaunchStaging();
      }
    } else if (st === 3) {
      if (lcPrevState === 1 || lcPrevState === 2) {
        launchStaging = false;
        input.forcePadRest = false;
        disableLaunchStand();
        lcBoost = true;
        takingOff = true;
        flownThisRun = true;
        lcGoUntil = nowMs + 900;
        lcAcroUntil = nowMs + 480;
        if (typeof audio.event === 'function') {
          audio.event('takeoff');
        }
      }
    } else {
      if (launchStaging) {
        endLaunchStaging(true);
      }
      if (lcAcroUntil === Infinity) {
        lcAcroUntil = 0;
      }
    }
    lcPrevState = st;
    return st;
  }

  function syncAngleMode() {
    const want = wantAngleMode();
    if (want !== angleModeOn) {
      angleModeOn = want;
      sim.setAngleMode(want);
    }
    if (ui.setCraftCaption && !(showcase && showcase.failed)) {
      ui.setCraftCaption(want
        ? 'Angle. Sticks are tilt. Hands off levels.'
        : 'Acro. Sticks are rates. Hands off holds.');
    }
  }

  function applySettings(s) {
    camTilt = clampCameraAngle(s.cameraAngle);
    s.cameraAngle = camTilt;
    qTilt.setFromAxisAngle(AXIS_X, cameraTiltRad(camTilt));
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
    if (!worldMatchesSettings()) {
      syncWorld();
    }
    /*
     * Only a MOVE of the Tune item swaps the tune. Comparing against what
     * is loaded instead would undo a dropped diff the next time the pilot
     * changed the volume, because a dropped file is not a registry tune.
     */
    if (s.tune !== menuTune) {
      menuTune = s.tune;
      configLoadWait = swapTune(s.tune).catch((e) => {
        console.error(e);
      });
    }
    /*
     * Rates are part of the config text, so changing one re-inits the module
     * and resets the craft, exactly as changing the tune does. Compared as
     * the CLI text the profile emits rather than field by field, so a change
     * to any of the eleven fields, the rates type included, is one string
     * comparison and none of them can be forgotten here.
     */
    const nextRates = ratesDiff(s.rates);
    if (nextRates !== ratesText) {
      /*
       * Composed into a LOCAL first. A refused sim_init is not a no-op down
       * in the module: bridge_parse_config has already reset every
       * parameter group to its default and applied part of the new text, so
       * the craft is flying a half applied config with the PREVIOUS run's
       * filter and PID init products. The other four init sites recover by
       * re-initing the text that worked; this one did not, and it had
       * already overwritten configText with the rejected text, so every one
       * of those recoveries would have restored the bad config too.
       */
      const nextText = composeConfig(tuneText, s.rates, RATES_KEEP);
      if (sim.init(nextText) === SIM_OK) {
        ratesText = nextRates;
        configText = nextText;
        adoptSimClock();
        sim.setCellVoltage(runVoltage);
        race.setRecordKey(recordKey());
        ui.setBest(race.bestMs, view.mode);
        reset();
      } else if (sim.init(configText) === SIM_OK) {
        /* Back to the config that worked, and re-seat the clock and the
         * craft, because the failed attempt moved the module underneath
         * them. */
        adoptSimClock();
        sim.setCellVoltage(runVoltage);
        reset();
      }
    }
    /* The radio, and the recorder. Both are re-read here so a change in
     * Settings lands without a restart. setPreset on the same id is a
     * no-op, and setEnabled only clears the log when it goes from off to
     * on, so neither re-applies anything on an unrelated settings change. */
    if (rcLink.id !== s.link) {
      rcLink.setPreset(s.link);
      rcLink.reset(rcNextMs);
    }
    if (flightLog.on !== s.flightLog) {
      flightLog.setEnabled(s.flightLog);
    }
    audio.setLevel(s.volume / 10);
    audio.setEnabled(s.sound);
    applyMix(s);
    ui.setReadout('');
    syncAngleMode();
  }

  /*
   * Load a different tune. Same path a dropped file takes: fetch the diff,
   * hand the text to sim_init, and reset. A failed fetch or a diff the
   * module rejects puts the old tune back rather than leaving the shell
   * flying something nobody chose, and says so.
   */
  async function swapTune(id) {
    const entry = tuneById(id);
    /* Bump first so switching back to the already loaded tune cancels an
     * in-flight fetch of a different one. The old early return before the
     * bump is how "off Karate and back" loaded the other tune anyway. */
    const gen = bumpConfigGen();
    if (entry.id === configId) {
      return;
    }
    let text;
    try {
      text = new TextDecoder().decode(await fetchBytes(tunePath(entry.id)));
    } catch (e) {
      if (!isLiveConfigLoad(gen)) {
        return;
      }
      ui.settings.tune = configId;
      notice = { text: `${entry.name} could not be loaded.`, untilMs: performance.now() + 3200 };
      console.error(e);
      return;
    }
    if (!isLiveConfigLoad(gen)) {
      return;
    }
    const nextText = composeConfig(text, ui.settings.rates, RATES_KEEP);
    const code = sim.init(nextText);
    if (code !== SIM_OK) {
      ui.settings.tune = configId;
      sim.init(configText);
      adoptSimClock();
      reset();
      notice = { text: `${entry.name} could not be read.\n${configFault(code)}`, untilMs: performance.now() + 3600 };
      return;
    }
    configId = entry.id;
    tuneText = text;
    configText = nextText;
    configName = `${entry.id}.diff`;
    adoptSimClock();
    sim.setCellVoltage(runVoltage);
    race.setRecordKey(recordKey());
    ui.setBest(race.bestMs, view.mode);
    notice = { text: `Flying ${entry.name}`, untilMs: performance.now() + 2400 };
    reset();
  }

  async function submitBoardTime() {
    const listing = inspectCourse();
    const trackId = listing && listing.shareId;
    if (!trackId || !listing.canPostTime) {
      notice = { text: listing && listing.layoutDrift
        ? 'Update this course on the board before uploading a time.'
        : 'This course is not on the public board yet.', untilMs: performance.now() + 2800 };
      return;
    }
    /* race owns what a record lap is. This used to re-filter and re-min
     * the log beside it, which is the same answer until one of them
     * changes its mind about a voided lap. */
    const fromRun = race.bestLapMs();
    const pending = readPendingTime();
    const fastest = fromRun != null
      ? fromRun
      : (pending && pending.trackId === trackId ? pending.lapMs : null);
    if (fastest == null) {
      notice = { text: 'No clean lap to upload.', untilMs: performance.now() + 2800 };
      return;
    }
    let name = readPilotName();
    if (!name) {
      name = await ui.askName({
        title: 'Your name',
        detail: 'A time on the public board needs a name. It stays in this browser.',
      });
    }
    if (!name) {
      return;
    }
    try {
      const posted = await postTime({
        trackId,
        name,
        lapMs: Math.round(fastest),
        origin: listing.board,
      });
      writePostedBest(trackId, fastest);
      clearPendingTime(trackId);
      const rank = posted.rank != null ? ` Rank ${posted.rank}.` : '';
      /* formatTime, the same one the menu row that triggered this upload is
       * labelled with. A confirmation that spells the time differently from
       * the button reads as a different number. */
      notice = { text: `Uploaded ${name}, ${formatTime(fastest)}.${rank}`, untilMs: performance.now() + 3600 };
      ui.markTimePosted(posted);
    } catch (e) {
      notice = { text: `Could not upload that time.\n${e.message ?? e}`, untilMs: performance.now() + 3600 };
    }
  }

  async function submitCoursePublish() {
    const listing = inspectCourse();
    if (!listing || !listing.doc) {
      notice = { text: 'Nothing to publish.', untilMs: performance.now() + 2800 };
      return;
    }
    if (!listing.canPublishNew && !listing.canUpdateListing) {
      notice = { text: 'This course is already on the public board.', untilMs: performance.now() + 2800 };
      return;
    }
    const remix = listing.kind === 'remix';
    const updating = listing.canUpdateListing && listing.layoutDrift;
    const of = listing.sourceName ? ` of ${listing.sourceName}` : '';
    const by = listing.sourceAuthor ? ` by ${listing.sourceAuthor}` : '';
    const detail = updating
      ? 'The layout changed. Updating the board will clear posted times.'
      : remix
        ? `This is your copy${of}${by}. It goes on the board as a new course. The original stays.`
        : 'The public board keeps a copy of this course, including every mark on the gates, the flags and the grass.';
    const values = await ui.askForm({
      title: updating ? 'Update this course' : 'Publish this course',
      detail,
      confirmLabel: updating ? 'Update the board' : 'Publish',
      fields: [
        {
          key: 'course',
          label: 'Course name',
          value: remix ? suggestRemixName(listing.name) : listing.name,
          maxLength: 80,
          placeholder: 'Course name',
        },
        {
          key: 'author',
          label: 'Your name',
          value: readPilotName() || '',
          maxLength: 24,
          placeholder: 'Name',
          autocomplete: 'nickname',
          rules: nameRules(),
          save: writePilotName,
        },
      ],
    });
    if (!values) {
      return;
    }
    try {
      const result = await publishCurrentCourse({
        doc: listing.doc,
        author: values.author,
        origin: listing.board,
        courseName: values.course,
      });
      const cleared = result.posted.timesCleared
        ? ' Old times were cleared because the layout changed.'
        : '';
      const forked = result.forked ? ' Published as a new course.' : '';
      notice = { text: `Published "${result.posted.name}".${forked}${cleared}`, untilMs: performance.now() + 4000 };
      ui.setShare({
        id: result.posted.id,
        name: result.posted.name,
        author: values.author,
        board: listing.board,
      });
      ui.markCoursePublished(result.posted);
      /* Only when the lap on the results screen was flown on the course that
       * was just published. Publishing course B with course A's results still
       * up used to attach A's lap to B, because resultsFastest is a bare
       * number with no course attached to it. */
      if (ui.resultsFastest != null && ui.resultsDocId != null && ui.resultsDocId === listing.doc.id) {
        writePendingTime({ trackId: result.posted.id, lapMs: ui.resultsFastest });
      }
    } catch (e) {
      notice = { text: `Could not publish that course.\n${e.message ?? e}`, untilMs: performance.now() + 3600 };
    }
  }

  ui.onSettings = applySettings;
  /*
   * The first flight's prompts.
   *
   * THREE LINES, FIRED BY WHAT THE PILOT DOES, not by a clock. The banner
   * already carries the launch prompt and the lap splits, and the guide
   * arrows are already painted on the grass, so a first run needs nothing
   * new: it needs the three sentences that carry somebody from a hover to a
   * gate, and then it needs to get out of the way.
   *
   * It retires itself. Once a lap is on the board, or three gates are behind
   * them, the pilot is flying and the lap splits are the more useful message.
   * Retiring here rather than on a timer means a slow first lap is never cut
   * off mid prompt and a fast one is never nagged.
   */
  const guidedPrompt = (race) => {
    if (race.freestyle || race.lastLapMs != null || race.next >= 3) {
      ui.guided = false;
      return '';
    }
    if (race.next === 0) {
      return 'Tip forward with the up arrow, then throttle\nThe green gate starts your lap';
    }
    if (race.next === 1) {
      return 'Through. The next gate turns green\nRed is the same gate, wrong side';
    }
    return 'Gate by gate. R puts you back on the line\nEscape pauses';
  };
  /*
   * A published course chosen from the Courses grid. This is exactly what a
   * ?share= link does at boot, minus the navigation: fetch the document,
   * write the share seat, tell the shell which course it is now holding. The
   * screen then acts map:custom and the world builds around it.
   */
  ui.onBoardCourse = async (track) => {
    const payload = await fetchTrackDocument(track.id, track.board);
    const doc = payload.document || payload;
    const share = {
      id: payload.id || track.id,
      name: payload.name || track.name || doc.name,
      author: payload.author || track.author || '',
      board: track.board,
      document: doc,
    };
    if (!writeShareImport(share)) {
      throw new Error('This browser would not store that course.');
    }
    ui.setShare(share);
    return true;
  };
  /* Menu clicks. The key handler has already woken the audio context by
   * the time the menu moves, so the first keypress is audible too. */
  ui.onUiSound = (kind) => {
    if (typeof audio.ui === 'function') {
      audio.ui(kind);
    }
  };

  function leavePadPick() {
    const dest = padPickReturn || 'title';
    if (dest === 'paused') {
      mode = 'paused';
    }
    ui.show(dest === 'flight' ? 'paused' : dest);
    const sum = input.padSummary();
    ui.setPadInfo(sum);
    const result = input.padPickResult;
    input.padPickResult = null;
    if (result === 'accepted') {
      notice = { text: `Flying with ${sum.using}.`, untilMs: performance.now() + 2800 };
    } else if (result === 'skipped') {
      notice = { text: 'Keyboard sticks. Choose joystick in Settings to pick a radio.', untilMs: performance.now() + 3200 };
    }
  }

  function openPadPick(reason) {
    if (ui.nameDialog && !ui.nameDialog.hidden) {
      input.requestPadPick(reason);
      return;
    }
    if (ui.screen === 'padpick') {
      return;
    }
    if (!input.startPadPick(reason)) {
      if (reason === 'menu') {
        notice = { text: 'No radio or gamepad found.\nPlug one in, set it to joystick mode, then move it.', untilMs: performance.now() + 3200 };
      }
      return;
    }
    if (ui.screen === 'calibrate') {
      input.cancelCalibration();
    }
    if (mode === 'flight' || ui.screen === 'flight') {
      mode = 'paused';
      padPickReturn = 'paused';
    } else if (ui.screen === 'padpick') {
      padPickReturn = 'title';
    } else {
      padPickReturn = ui.screen || 'title';
    }
    ui.show('padpick');
  }

  ui.onAction = (action, s) => {
    if (s) {
      applySettings(s);
    }
    if (action === 'fly' || action === 'restart') {
      /* A tune fetch in flight would sim_init under a run whose lastTs had
       * already started climbing. Wait until the load is the current one. */
      whenConfigReady(() => {
        reset();
        mode = 'flight';
        ui.show('flight');
        introMs = 0;
      });
      return;
    }
    if (action === 'resume') {
      whenConfigReady(() => {
        mode = 'flight';
        ui.show('flight');
      });
      return;
    }
    if (action === 'pause') {
      mode = 'paused';
    } else if (action === 'title') {
      mode = 'title';
      reset();
    } else if (action === 'calibrate') {
      if (input.firstGamepad()) {
        input.startCalibration();
        ui.show('calibrate');
      } else {
        notice = { text: 'No radio or gamepad found.\nPlug one in, set it to joystick mode, and reload.', untilMs: performance.now() + 3200 };
      }
    } else if (action === 'calibrate-cancel') {
      input.cancelCalibration();
      ui.show('settings');
    } else if (action === 'calibrate-save') {
      if (input.acceptCalibration()) {
        ui.show('settings');
        notice = { text: 'Stick mapping saved.', untilMs: performance.now() + 2800 };
      }
    } else if (action === 'choosepad') {
      openPadPick('menu');
    } else if (action === 'padpick-yes') {
      if (input.acceptPadPick()) {
        leavePadPick();
      }
    } else if (action === 'padpick-no') {
      input.rejectPadPick();
    } else if (action === 'padpick-skip') {
      input.skipPadPick();
      leavePadPick();
    } else if (action === 'padpick-cancel') {
      input.cancelPadPick();
      leavePadPick();
    } else if (action === 'downloadflightlog') {
      if (flightLog.count < 2) {
        notice = {
          text: 'Nothing recorded yet.\nTurn the flight log on in Settings, then fly.',
          untilMs: performance.now() + 3600,
        };
      } else {
        const rows = flightLog.count;
        const secs = flightLog.seconds;
        downloadText(flightLogName(ui.settings.map), flightLog.csv());
        notice = {
          text: `Flight log saved.\n${rows} rows over ${secs.toFixed(1)} s.`,
          untilMs: performance.now() + 3600,
        };
      }
    } else if (action === 'setname') {
      (async () => {
        const name = await ui.askName({
          title: 'Your name',
          detail: 'Posted times and published courses carry this name. Changing it updates the board for courses you published from this browser.',
        });
        if (!name) {
          return;
        }
        try {
          const result = await syncOwnedIdentity();
          const updated = Array.isArray(result.results) && result.results.some((r) => r.ok);
          if (updated) {
            notice = { text: `Name on the board is now ${name}.`, untilMs: performance.now() + 3200 };
          }
        } catch (e) {
          notice = { text: `Name saved here. The board could not be updated.\n${e.message ?? e}`, untilMs: performance.now() + 3600 };
        }
      })();
    } else if (action === 'posttime') {
      submitBoardTime();
    } else if (action === 'publishcourse') {
      submitCoursePublish();
    }
  };

  /*
   * Menu intent from a radio. When the sticks have been calibrated the
   * mapped channels drive the cursor, which lets roll adjust a value. When
   * they have not, any axis at all moves the cursor, because the way to
   * calibrate is a menu item and a wrong axis guess would otherwise lock
   * the player out of it. Settings ignores this: the sticks pose the
   * airframe there, and the cursor is mouse and keyboard only.
   */
  function padNav() {
    const btn = input.padMenuButtons();
    if (input.map.stored) {
      const c = input.channels;
      return {
        up: c.pitch > NAV_DEFLECT,
        down: c.pitch < -NAV_DEFLECT,
        right: c.roll > NAV_DEFLECT,
        left: c.roll < -NAV_DEFLECT,
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
      mixArg.ambience = 0;
      audio.setMix(mixArg);
    }
    if (typeof audio.setMusicEnabled === 'function') {
      audio.setMusicEnabled(s.musicLevel > 0);
    }
    if (typeof audio.setMusicTrack === 'function') {
      audio.setMusicTrack(s.musicTrack);
    }
    if (typeof audio.musicStatus === 'function') {
      ui.setMusicNow(audio.musicStatus());
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

  input.onKey = (code, repeat) => {
    wakeAudio();
    if (ui.handleKey(code, repeat)) {
      return;
    }
    if (repeat) {
      return;
    }
    /* Flight only keys. */
    if (code === 'KeyR') {
      reset();
      return;
    }
    if (code === 'KeyL' && ui.screen === 'flight') {
      if (!ui.settings.launchControl) {
        notice = {
          text: 'Launch control is off.\nTurn it on in Settings, then press L on the start line.',
          untilMs: performance.now() + 3200,
        };
        return;
      }
      if (!landed && !launchStaging) {
        notice = {
          text: 'Launch control is for the start line.\nLand, then press L.',
          untilMs: performance.now() + 2800,
        };
        return;
      }
      applyLaunchSwitch(!lcArmed);
      if (lcArmed) {
        notice = {
          text: 'LAUNCH CONTROL\nThrottle idle. Pitch forward, centre the stick, punch.',
          untilMs: performance.now() + 2200,
        };
      } else {
        notice = { text: 'Launch control off', untilMs: performance.now() + 1600 };
      }
      return;
    }
  };
  window.addEventListener('pointerdown', wakeAudio);

  /*
   * Swallow a dropped file, and say why nothing happened.
   *
   * The page used to fly any Betaflight CLI diff dropped on it, and that is
   * gone: there are two tunes on the menu and the rates are the pilot's.
   * The listeners stay because REMOVING them is not neutral. Without a
   * preventDefault the browser navigates to the dropped file, which tears
   * down the simulator and loses the run, and a pilot who read the old
   * README is exactly the person who will try it.
   */
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!e.dataTransfer?.files?.length) {
      return;
    }
    notice = {
      text: 'This page does not fly a dropped file any more.\nPick a tune on the menu, and set your rates on Rates.',
      untilMs: performance.now() + 3600,
    };
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
  const qSpawnInv = new THREE.Quaternion();
  const qPad = new THREE.Quaternion();
  const qCollide = new THREE.Quaternion();
  const pProbe = new THREE.Vector3();
  const pBounce = new THREE.Vector3();
  const nSim = { x: 0, y: 0, z: 0 };
  const pSim = { x: 0, y: 0, z: 0 };
  const camFwd = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const qShake = new THREE.Quaternion();
  const shakeEuler = new THREE.Euler();
  const lensShake = makeLensShake();
  const introFrom = new THREE.Vector3();
  const introLook = new THREE.Vector3();
  const introRight = new THREE.Vector3();
  const introUp = new THREE.Vector3(0, 1, 0);
  const introQuat = new THREE.Quaternion();
    const fpvPos = new THREE.Vector3();
    const fpvQuat = new THREE.Quaternion();
    const finishFpvPos = new THREE.Vector3();
    const finishFpvQuat = new THREE.Quaternion();
    /* -1: not on the finish shot. 0+: milliseconds into the pull-out. */
    let finishCamMs = -1;
  /* Eased toward PARKED_LIFT while the craft is down and toward zero once it
   * is flying, so the view rises off the pad rather than jumping. */
  let parkedLift = PARKED_LIFT;

  /*
   * World contact, already spawn-offset, back into plant metres. Inverse of
   * the render pose path: subtract the start, undo the spawn yaw, then the
   * frame.js basis change, then SPAWN_ALT. Bounce has to write a plant
   * position or the next sweep starts inside the solid we just hit.
   */
  function worldPosToSim(wx, wy, wz, out) {
    pBounce.set(wx - startX, wy - startY, wz - startZ);
    pBounce.applyQuaternion(qSpawnInv);
    threePosToSim(pBounce.x, pBounce.y, pBounce.z, out);
    out.z -= SPAWN_ALT;
    return out;
  }

  function poseFromState(st, out) {
    simPosToThree(st[1], st[2], st[3] + SPAWN_ALT, out);
    out.applyQuaternion(qSpawn);
    out.x += startX;
    out.z += startZ;
    out.y += startY;
    return out;
  }

  /*
   * Reflect the plant off the last collider hit. Places the craft at the
   * first contact plus a small outward gap, so a tunneled frame is rewound
   * to the entry face. Returns false if the module refused the write.
   */
  function applyBounce() {
    const col = view.colliders;
    const nx = col.hitNx;
    const ny = col.hitNy;
    const nz = col.hitNz;
    const ht = col.hitT < 0 ? 0 : col.hitT > 1 ? 1 : col.hitT;
    const cx = racePrev.x + (pCurr.x - racePrev.x) * ht;
    const cy = racePrev.y + (pCurr.y - racePrev.y) * ht;
    const cz = racePrev.z + (pCurr.z - racePrev.z) * ht;
    const inward = -((pCurr.x - cx) * nx + (pCurr.y - cy) * ny + (pCurr.z - cz) * nz);
    const sep = (inward > 0 ? inward : 0) + BOUNCE_SEPARATION;
    worldPosToSim(cx + nx * sep, cy + ny * sep, cz + nz * sep, pSim);
    threeDirToSim(nx, ny, nz, nSim);
    const nlen = Math.sqrt(nSim.x * nSim.x + nSim.y * nSim.y + nSim.z * nSim.z);
    if (!(nlen > 1e-9)) {
      return false;
    }
    const inv = 1 / nlen;
    const code = sim.e.sim_deflect(
      nSim.x * inv, nSim.y * inv, nSim.z * inv,
      BOUNCE_RESTITUTION, BOUNCE_TANGENT_KEEP, BOUNCE_RATE_KEEP,
      pSim.x, pSim.y, pSim.z,
    );
    if (code !== SIM_OK) {
      return false;
    }
    stateCurr = readState();
    statePrev = stateCurr;
    poseFromState(stateCurr, pCurr);
    shell.quad.position.copy(pCurr);
    racePrev.copy(pCurr);
    groundPrev.copy(pCurr);
    speedNow = Math.sqrt(
      stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5] + stateCurr[6] * stateCurr[6],
    );
    return true;
  }
  /*
   * The title screen's camera. It belongs to the MAP, because the shot that
   * shows a map off is the map's business: the race field flies its own
   * racing line, the city flies its own streets, and the shell only has to
   * know which frame to ask for. Rebuilt on every swap, below.
   */
  let attractCam = makeAttractCamera(view);
  applySettings(ui.settings);

  const bootPick = input.takePadPickQueue();
  if (bootPick) {
    openPadPick(bootPick);
  }

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
   * The target mark's arithmetic. Two scratch vectors and a handful of
   * constants, hoisted because this runs every frame of every race and the
   * overlay is not allowed to be the thing that allocates.
   *
   * The margins are how far inside the frame the chevron parks, and they
   * are not one number because the OSD is not one shape. The lap clock
   * stack runs about 140 px down the top of the frame and the pack and
   * flight blocks stand 100 px off the bottom, so a chevron pinned 54 px in
   * from an edge is right on the sides and sits on an instrument top and
   * bottom.
   *
   * AIM_RELEASE and AIM_FADE are the range the lock lets go over. At 6 m a
   * 1.7526 m opening is a fifth of the frame's height at the default lens,
   * so a bracket around it is a box drawn on a barn door; at 13 m it is
   * under a tenth and the bracket is still telling the pilot something. The
   * mark never fades while it is on the frame edge, because a target you
   * cannot see is exactly when the range matters.
   */
  const AIM_MARGIN = 54;
  const AIM_MARGIN_TOP = 100;
  const AIM_MARGIN_BOTTOM = 108;
  const AIM_RELEASE = 6;
  const AIM_FADE = 13;
  /* The bracket stands this much outside the opening, so it frames the gate
   * instead of covering the ring the pilot aims at. */
  const AIM_BRACKET = 1.45;
  const aimNdc = new THREE.Vector3();
  const aimFwd = new THREE.Vector3();
  /* One argument object each, refilled in place. */
  const LOCK_OFF = { show: false };
  const lockArg = {
    show: true, x: 0, y: 0, size: 0, angle: 0, edge: false, wrong: false, distance: 0, fade: 1,
  };

  /*
   * Put the target mark where the next gate is.
   *
   * The map owns which gate that is and which side of it the pilot is on,
   * because that is the same decision that colours the gate itself; the
   * shell owns the projection, because the canvas size is the shell's.
   * Splitting it the other way is how the mark and the gate would end up
   * disagreeing about which way through.
   */
  function updateTargetLock() {
    const aim = view.targetAim ? view.targetAim() : null;
    if (!aim || !aim.active) {
      ui.setTargetLock(LOCK_OFF);
      return;
    }
    const el = shell.renderer.domElement;
    /* CSS pixels. The overlay is a DOM layer over the canvas, and the
     * drawing buffer is a different size on any display whose pixel ratio
     * is above one. */
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (vw < 2 || vh < 2) {
      ui.setTargetLock(LOCK_OFF);
      return;
    }
    aimNdc.copy(aim.centre).project(shell.camera);
    /*
     * BEHIND THE CAMERA THE PROJECTION LIES, and it lies plausibly: the
     * divide is by a negative w, so the point reflects through the centre
     * of the frame and lands somewhere a reader would believe. Negating
     * both axes recovers the true bearing.
     *
     * A target DEAD behind lands on the centre of the frame either way, and
     * a chevron at the centre pointing nowhere is worse than none, so a
     * bearing shorter than a pixel is read as straight up: turn round, and
     * either way round is as good as the other.
     */
    const behind = aimNdc.z <= -1 || aimNdc.z >= 1;
    const nx = behind ? -aimNdc.x : aimNdc.x;
    const ny = behind ? -aimNdc.y : aimNdc.y;
    let sx = (nx * 0.5 + 0.5) * vw;
    let sy = (1 - (ny * 0.5 + 0.5)) * vh;
    const midX = vw * 0.5;
    const midY = vh * 0.5;
    if (behind) {
      const ox = sx - midX;
      const oy = sy - midY;
      const len = Math.hypot(ox, oy);
      /* Pushed well outside the frame, so the clamp below always turns it
       * into a chevron rather than a bracket around empty sky. */
      sx = len > 1 ? midX + (ox / len) * vw : midX;
      sy = len > 1 ? midY + (oy / len) * vw : midY - vh;
    }
    const minX = AIM_MARGIN;
    const maxX = vw - AIM_MARGIN;
    const minY = AIM_MARGIN_TOP;
    const maxY = vh - AIM_MARGIN_BOTTOM;
    const edge = behind || sx < minX || sx > maxX || sy < minY || sy > maxY;
    /* The projected aperture, from the camera space depth rather than the
     * range: a gate 55 degrees off axis is the same size on screen as one
     * straight ahead at the same depth, and using the range instead
     * overstates it by most of half again out at the edge of the frame. */
    aimFwd.set(0, 0, -1).applyQuaternion(shell.camera.quaternion);
    const depth = (aim.centre.x - shell.camera.position.x) * aimFwd.x
      + (aim.centre.y - shell.camera.position.y) * aimFwd.y
      + (aim.centre.z - shell.camera.position.z) * aimFwd.z;
    const tanHalf = Math.tan((shell.camera.fov * Math.PI) / 360);
    const raw = depth > 0.2
      ? (vh * aim.clearH * AIM_BRACKET) / (2 * depth * tanHalf)
      : 0;
    lockArg.show = true;
    lockArg.edge = edge;
    lockArg.wrong = !aim.correct;
    lockArg.distance = aim.distance;
    lockArg.size = Math.max(34, Math.min(vh * 0.62, raw));
    lockArg.x = Math.min(maxX, Math.max(minX, sx));
    lockArg.y = Math.min(maxY, Math.max(minY, sy));
    /* Clockwise from up, which is how the chevron is drawn. */
    lockArg.angle = edge
      ? (Math.atan2(sx - midX, midY - sy) * 180) / Math.PI
      : 0;
    lockArg.fade = edge
      ? 1
      : Math.max(0, Math.min(1, (aim.distance - AIM_RELEASE) / (AIM_FADE - AIM_RELEASE)));
    if (lockArg.fade < 0.02) {
      ui.setTargetLock(LOCK_OFF);
      return;
    }
    ui.setTargetLock(lockArg);
  }

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
    const launchNow = syncLaunchControl(nowWall);
    input.forcePadRest = launchStaging;
    syncAngleMode();
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
    if (!(mode === 'flight' && !crashed && !landed) && rcPending.length > 1) {
      rcPending.splice(0, rcPending.length - 1);
    }
    /* Hard bound, whatever else happens. */
    if (rcPending.length > 1024) {
      rcPending.splice(0, rcPending.length - 256);
    }
    if (ui.isModal()) {
      ui.pollPad(padNav());
    }

    if (mode === 'flight' && !crashed && landed) {
      const thr = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
      if (landed && thr > TAKEOFF_THROTTLE) {
        /* Off again. The RC frame grid rides the SIM's own clock, which
         * froze with the integrator, so it is already seated; this re-pin
         * is belt and braces against any future path that moves rcNextMs
         * while the craft is down. Stamping the grid from the lap clock
         * here is the bug that made every second spent parked into a
         * second of stick lag. */
        landed = false;
        takingOff = true;
        flownThisRun = true;
        adoptSimClock();
        if (typeof audio.event === 'function') {
          audio.event('takeoff');
        }
      }
    }
    if (mode === 'flight' && !crashed && !landed) {
      /* The module is the source of truth. If sim_init ran and JS time was
       * left behind, raising ts to lastTs would stamp every sample seconds
       * into the future. Snap the shell to step_index instead. */
      const moduleIdx = Math.round(readState()[0] * SIM_HZ);
      if (simStepIdx !== moduleIdx) {
        acc = 0;
        simStepIdx = moduleIdx;
        pinRcGrid();
        landed = true;
        takingOff = false;
        sim.rest();
        stateCurr = readState();
        statePrev = stateCurr;
      } else {
      acc += dt;
      let steps = Math.floor(acc / MS_PER_STEP);
      acc -= steps * MS_PER_STEP;
      /* No clamp on steps: dt is already capped at 100 ms where it is
       * read, and acc carries less than 1 ms forward, so this cannot ask
       * for more than 100 steps. The cap belongs on the wall clock, in one
       * place, not on three copies of its consequence. */
      /* Resample the polled stick values onto a fixed RC frame grid. The
       * display runs at whatever rate it runs at; the radio does not, and
       * the controller's feedforward and smoothing read the frame
       * interval directly. */
      const blockEndSim = (simStepIdx + steps) * MS_PER_STEP;
      /*
       * Wall clock to sim clock, re-derived every frame rather than carried:
       * a sample taken (nowWall - wallT) ms ago belongs that many ms before
       * the end of the block this frame is about to step. The sim clock and
       * the wall clock advance together while flying, and this mapping
       * self corrects across the freezes where they do not.
       */
      const wallToSim = blockEndSim - nowWall;
      /* Take every sample whose moment has arrived; hold the last one. This
       * is the receiver holding its last frame, so a lost packet needs no
       * separate handling: it is simply a frame that is never emitted. */
      const pickAt = (atMs) => {
        while (rcPending.length > 0 && rcPending[0].wallT + wallToSim <= atMs) {
          rcHeld = rcPending.shift();
        }
        return rcHeld;
      };
      if (rcLink.isPerfect()) {
        /*
         * No radio. Kept as its own path and not routed through the link so
         * that the default, and every recording made under it, is exactly
         * the code that produced them: an exact grid, one frame per slot.
         */
        const framePeriod = 1000 / RC_HZ;
        while (rcNextMs < blockEndSim) {
          const held = pickAt(rcNextMs);
          /* Stamp the grid, never lastTs. lastTs was the round 16b /
           * tune-swap amplifier: a leftover second became every sample's
           * timestamp. */
          const ts = rcNextMs / 1000;
          lastTs = ts;
          const inCode = sim.input(ts, held.roll, held.pitch, held.yaw, held.throttle);
          if (inCode !== SIM_OK) {
            adoptSimClock();
            break;
          }
          rcNextMs += framePeriod;
        }
      } else {
        /*
         * A radio. The link owns the slot clock while it runs, so its rate
         * rather than RC_HZ decides the cadence, and it hands back packets
         * already sorted into arrival order with their transport delay and
         * jitter applied. sim_input requires non decreasing timestamps and
         * jitter can reorder two adjacent packets, so anything that still
         * lands behind the last stamp is dropped rather than rejected by
         * the module.
         */
        for (const pkt of rcLink.pump(blockEndSim, pickAt)) {
          const ts = pkt.tMs / 1000;
          if (ts < lastTs) {
            continue;
          }
          lastTs = ts;
          const inCode = sim.input(ts, pkt.rc.roll, pkt.rc.pitch, pkt.rc.yaw, pkt.rc.throttle);
          if (inCode !== SIM_OK) {
            adoptSimClock();
            break;
          }
        }
        rcNextMs = rcLink.nextMs;
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
        simTimeMs += steps * MS_PER_STEP;
        simStepIdx += steps;
        /* Launch stand constraint runs inside sim_step. */
        /* One row per rendered frame, and only while actually flying. The
         * state and the sticks are read at the same instant, so the row is
         * honest about what the craft was doing and what it was told. */
        flightLog.push(stateCurr, rcHeld, FULL_THROTTLE_RPM);
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
       * The craft's vertical half extent at its current tilt. A quad is an
       * X: 0.347 m on the diagonal, 0.282 m axis to axis, 0.080 m through
       * the body. Collision uses that X in plan; this number is only the
       * ground query. Computed from this state's quaternion, not last
       * frame's render, so a snap roll is judged on the attitude that
       * produced the travel.
       */
      simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qCollide);
      qCollide.premultiply(qSpawn);
      vHalfFrame = craftVerticalHalf(Math.sqrt(1 - craftUpY() * craftUpY()));
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
      if (launchStaging) {
        /* The stand hinge owns the craft. Contact at 30 to 40 degrees of
         * pitch is the hold, not a crash, and the usual takeoff abort
         * would dump the attitude every frame. */
      } else if (takingOff) {
        if (
          !touched &&
          pProbe.y - vHalf > view.height(pProbe.x, pProbe.z, pProbe.y - vHalf - SURFACE_BIAS) + 0.05
        ) {
          /* Clear of the surface by a real margin, not just by the parked
           * pose's few millimetres: the takeoff is real and normal contact
           * judging owns the craft again. Without the margin the hold
           * released on the first frame and the spool dip handed the craft
           * straight back to the landing judgement, which is the chatter
           * this flag exists to prevent. Launch control skips this whole
           * branch while the stand hinge is holding. */
          takingOff = false;
          lcBoost = false;
        } else if (touched) {
          const thrNow = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
          /* Depth of the craft's CENTRE below the surface. With the per
           * frame rest below, this is a backstop that only an upstream
           * regression can reach. */
          const sunk = view.height(touchX, touchZ, touchY - vHalf - SURFACE_BIAS) - touchY;
          /* Launch control triggers at 20 percent throttle, below
           * TAKEOFF_THROTTLE, so the usual abort would freeze the punch
           * on the pad. The pad still holds the sphere while motors spool. */
          if (!lcBoost && (thrNow <= TAKEOFF_THROTTLE || sunk > 0.10)) {
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
        const upY = craftUpY();
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
          crashInto('Crashed', nowWall);
        }
      }
      }
    } else if (mode === 'flight' && !crashed && landed) {
      /*
       * Sitting on the ground. The integrator does NOT step: a landing is
       * rest, not a bounce, so the craft is held by not advancing it. The
       * touchdown descent rate is no longer stored with it: sim_rest zeroed
       * the velocity at the landing judgement, so a takeoff resumes from a
       * true rest state and the only dip left is the real one, the motors
       * spooling up from wherever they idled.
       *
       * The lap clock DOES keep running. Landing in the middle of a lap
       * costs you the time it costs you, and a course where you can park for
       * free is not a race.
       */
      acc += dt;
      let steps = Math.floor(acc / MS_PER_STEP);
      acc -= steps * MS_PER_STEP;
      simTimeMs += steps * MS_PER_STEP;
      adoptSimClock();
      statePrev = stateCurr;
    } else if (mode === 'flight' && crashed) {
      /*
       * THE CLOCK DOES NOT STOP FOR A CRASH. That is the whole of what makes
       * the new penalty a penalty: the lap is not thrown away, so the only
       * thing a crash costs is the lockout and the standing start, and if
       * neither of those were on the clock a crash would cost nothing at
       * all. The integrator is NOT stepped, exactly as it is not while the
       * craft sits landed; only the lap clock advances.
       *
       * The two states are made identical for the same reason the landing
       * branch does it: with the integrator frozen, the render would
       * otherwise slide the wreck between the last two stale poses forever.
       */
      acc += dt;
      let steps = Math.floor(acc / MS_PER_STEP);
      acc -= steps * MS_PER_STEP;
      simTimeMs += steps * MS_PER_STEP;
      statePrev = stateCurr;
      if (nowWall - crashedAtWall > 1400) {
        /* Short lockout, then back on the COURSE: on the ground in front of
         * the gate the race still wants, with the clock still running. */
        resetCraft(recoverySpawn());
      }
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
       * landing. Render only: the physics state is untouched.
       *
       * On a launch stand the rails are pitched, so the parked pose is too:
       * REST_HEIGHT is along the ramp normal, which is why it is scaled by
       * cos(pitch), and a local nose-down rotation puts the arms on the
       * foam. Crash recovery on grass keeps startPitch at 0 and this
       * reduces to the old seating. */
      pCurr.y = groundY + simLenToWorld(REST_HEIGHT) * Math.cos(startPitch);
      if (startPitch) {
        qPad.setFromAxisAngle(AXIS_X, -startPitch);
        qPrev.multiply(qPad);
      }
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
     * tunnel through at any frame rate. A train, or a head-on hit faster
     * than BOUNCE_SPEED_MAX, is a crash. Anything else bounces: the plant
     * is reflected through sim_deflect and the airframe has HIT_LIVES
     * damaging hits before the next one is a wreck. A graze below
     * GRAZE_SPEED_MAX bounces without spending a life.
     */
    /* The craft's speed at this state, needed by the collision test below and
     * by the overlay further down. Read once, from the state block. */
    speedNow = Math.sqrt(
      stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5] + stateCurr[6] * stateCurr[6],
    );
    if (mode === 'flight' && !crashed && !landed && !launchStaging && raceHasPrev) {
      /* The craft the query sweeps is the four prop discs: crx/crz from
       * this attitude, vHalfFrame through the body at its current tilt. */
      const k = view.colliders.hit(
        racePrev.x, racePrev.y, racePrev.z,
        pCurr.x, pCurr.y, pCurr.z,
        vHalfFrame,
        qCollide.x, qCollide.y, qCollide.z, qCollide.w,
      );
      if (k >= 0) {
        lastHitKind = view.colliders.kindName(k);
        const closing = speedNow * view.colliders.hitNormalDot;
        lastClosing = closing;
        const outcome = hitOutcome(lastHitKind, closing);
        const sameContact = nowWall - bounceAtWall < BOUNCE_COOLDOWN_MS
          && bounceHitIndex === view.colliders.hitIndex
          && bounceHitKind === lastHitKind;
        const graze = closing < GRAZE_SPEED_MAX;
        let wreck = outcome === 'crash';
        if (!wreck && !sameContact && !graze && hitsLeft <= 1) {
          wreck = true;
        }
        if (wreck && !sameContact) {
          crashInto(`Hit the ${lastHitKind}`, nowWall);
        } else {
          if (!applyBounce()) {
            crashInto(`Hit the ${lastHitKind}`, nowWall);
          } else {
            if (!sameContact && !graze) {
              hitsLeft -= 1;
              race.recover(`Hit the ${lastHitKind}, ${hitsLeft} left`, nowWall);
            } else if (!sameContact) {
              race.recover(`Clipped the ${lastHitKind}`, nowWall);
            }
            view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
            if (!sameContact && typeof audio.event === 'function') {
              audio.event('clip');
            }
            bounceAtWall = nowWall;
            bounceHitIndex = view.colliders.hitIndex;
            bounceHitKind = lastHitKind;
          }
        }
      }
    }

    /* Race logic runs on the rendered world position, timed on the sim
     * clock at that state: gate crossings are swept over the frame's
     * travel, so speed cannot tunnel a gate. */
    const simNow = simTimeMs > 0 ? simTimeMs - 1 + a : 0;
    if (mode === 'flight' && !crashed) {
      if (raceHasPrev) {
        const res = race.update(racePrev, pCurr, simNow, nowWall);
        if (res.passed != null) {
          view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
          if (typeof audio.event === 'function') {
            audio.event('gate');
          }
        }
        if (!race.freestyle && race.lap >= runLaps) {
          mode = 'results';
          ui.setBest(race.bestMs, view.mode);
          ui.showResults(race.log, race.bestMs, race.recordAtStart);
        }
      }
      racePrev.copy(pCurr);
      raceHasPrev = true;
    }

    /* Airtime, for the freestyle display: the simulation clock since this
     * run began, which is what a pilot flying a pack wants beside the pack
     * bar. It reads on the sim clock for the same reason a lap does, so a
     * frame hitch cannot spend a pilot's battery for them. */
    airtimeMs = simTimeMs;

    /*
     * The world is the title picture, the flight picture, the pause
     * picture, the finish picture and the map-card recorder. Settings
     * and How to fly hide it. The studio on Settings is a second
     * context and must not exist while this one is composing a world
     * the player is flying. visibility:hidden, not display:none: some
     * GPUs drop a context that leaves the document.
     */
    const freezeWorld = Boolean(ui.reelFreezeWorld);
    const attractOn = !freezeWorld && mode === 'title' && ui.screen === 'title';
    const studioOn = ui.screen === 'settings';
    const worldLive = !freezeWorld && (
      Boolean(finishLoadingOnFrame)
      || mode === 'flight'
      || mode === 'paused'
      || mode === 'results'
      || ui.screen === 'courses'
      || attractOn
      || Boolean(camOverride)
    );
    const wantVis = worldLive ? 'visible' : 'hidden';
    if (shell.canvas.style.visibility !== wantVis) {
      shell.canvas.style.visibility = wantVis;
    }

    /* Prop discs spin at a visibly aliased fraction of true RPM, the way
     * they read on a real FPV feed. The blades follow. On the title the
     * plant is frozen, so a cruise spin stands in for flight; a crawl is
     * left for the pad shot so the model is not frozen there either. */
    const titleSpin = attractOn || (mode === 'title' && worldLive) || mode === 'results';
    for (let m = 0; m < 4; m += 1) {
      const vis = titleSpin
        ? 0.38 + input.channels.throttle * 0.42
        : stateCurr[14 + m] * 1e-4 + (shell.quad.visible ? 0.10 : 0);
      shell.discs[m].rotation.y += vis;
      if (shell.blades) {
        const dir = shell.propSpin ? shell.propSpin[m] : 1;
        shell.blades[m].rotation.y += vis * dir;
      }
    }
    if (shell.cameraMount) {
      shell.cameraMount.rotation.x = cameraTiltRad(camTilt);
    }

    /* The lens sits where herocraft.js bolts it, forward AND up, not at the
     * centre of gravity's height. src/render/lens.js carries both numbers and
     * the reason. camUp is the craft's own up, so the offset rolls with it. */
    camFwd.set(0, 0, -1).applyQuaternion(qPrev);
    camUp.set(0, 1, 0).applyQuaternion(qPrev);
    fpvPos.copy(pCurr)
      .addScaledVector(camFwd, simLenToWorld(CAMERA_MOUNT_FORWARD))
      .addScaledVector(camUp, simLenToWorld(CAMERA_MOUNT_UP));
    const wantLift = (landed || crashed || launchStaging) ? PARKED_LIFT : 0;
    parkedLift += (wantLift - parkedLift) * Math.min(1, dt * 0.006);
    if (parkedLift > 0.001) {
      fpvPos.y += parkedLift;
    }
    fpvQuat.copy(qPrev).multiply(qTilt);
    /*
     * Vibration, so the buzz the flight controller is fighting is something
     * the pilot can see. Driven by the motors' own speed out of the state
     * block, scaled the same way the gyro model scales it. Render only: it
     * moves the view, never the craft, so no trajectory depends on it.
     */
    {
      const rpmMean = (stateCurr[14] + stateCurr[15] + stateCurr[16] + stateCurr[17]) * 0.25;
      const shake = lensShake.update(dt, rpmMean / FULL_THROTTLE_RPM);
      qShake.setFromEuler(shakeEuler.set(shake.x, shake.y, shake.z, 'XYZ'));
      fpvQuat.multiply(qShake);
    }

    if (mode !== 'results' && finishCamMs >= 0) {
      finishCamMs = -1;
    }

    if (mode === 'title') {
      if (worldLive && !camOverride) {
        shell.quad.visible = true;
        attractCam.update(nowWall, shell.camera, {
          craft: shell.quad,
          overlay: ui.screen === 'title',
          roll: input.channels.roll,
          pitch: input.channels.pitch,
          yaw: input.channels.yaw,
        });
      }
    } else if (mode === 'results' && !camOverride) {
      /* Pull off the FPV lens onto a three-quarter of the frozen craft,
       * then sway. The airframe keeps the attitude it finished with. */
      if (finishCamMs < 0) {
        finishCamMs = 0;
        finishFpvPos.copy(fpvPos);
        finishFpvQuat.copy(fpvQuat);
      }
      finishCamMs += dt > INTRO_STEP_MAX ? INTRO_STEP_MAX : dt;
      const pull = introEase(Math.min(1, finishCamMs / FINISH_PULL_MS));
      const sway = 0.62 + Math.sin(finishCamMs * FINISH_SWAY) * 0.28;
      introRight.set(1, 0, 0).applyQuaternion(qPrev);
      introFrom.copy(pCurr)
        .addScaledVector(camFwd, -FINISH_RADIUS * Math.cos(sway))
        .addScaledVector(introRight, FINISH_RADIUS * Math.sin(sway))
        .addScaledVector(introUp, FINISH_HEIGHT);
      const floor = view.height(introFrom.x, introFrom.z, introFrom.y) + 0.42;
      if (introFrom.y < floor) {
        introFrom.y = floor;
      }
      introLook.copy(pCurr).addScaledVector(introUp, 0.06);
      shell.quad.visible = true;
      shell.camera.up.set(0, 1, 0);
      shell.camera.position.copy(introFrom);
      shell.camera.lookAt(introLook);
      introQuat.copy(shell.camera.quaternion);
      shell.camera.position.lerpVectors(finishFpvPos, introFrom, pull);
      shell.camera.quaternion.copy(finishFpvQuat).slerp(introQuat, pull);
      const dist = Math.max(0.8, shell.camera.position.distanceTo(pCurr));
      const narrow = shell.camera.aspect < 0.95;
      shell.camera.translateX((narrow ? 0 : -0.20) * dist * pull);
      shell.camera.translateY((narrow ? -0.14 : -0.04) * dist * pull);
      const fov = ui.settings.cameraFov + (FINISH_FOV - ui.settings.cameraFov) * pull;
      if (Math.abs(shell.camera.fov - fov) > 0.05) {
        shell.camera.fov = fov;
        shell.camera.updateProjectionMatrix();
      }
    } else if (introMs >= 0 && (mode === 'flight' || mode === 'paused') && !camOverride) {
      if (mode === 'flight') {
        /* Punch-out skips the orbit and the approach. TAKEOFF_THROTTLE,
         * not a hair trigger: a resting gamepad axis at 0.08 used to skip
         * the shot entirely. */
        if (input.channels.throttle > TAKEOFF_THROTTLE && introMs < INTRO_FLY) {
          introMs = INTRO_FLY;
        }
        introMs += dt > INTRO_STEP_MAX ? INTRO_STEP_MAX : dt;
      }
      const orbitU = introEase(introMs / INTRO_ORBIT);
      const approachU = introEase((introMs - INTRO_ORBIT) / INTRO_APPROACH);
      const zoomU = introEase((introMs - INTRO_FLY) / INTRO_ZOOM);
      const theta = INTRO_THETA0 - INTRO_ORBIT_SPAN * orbitU;
      const radius = INTRO_ORBIT_RADIUS
        + (INTRO_APPROACH_RADIUS - INTRO_ORBIT_RADIUS) * approachU;
      const height = INTRO_ORBIT_HEIGHT
        + (INTRO_APPROACH_HEIGHT - INTRO_ORBIT_HEIGHT) * approachU;

      introRight.set(1, 0, 0).applyQuaternion(qPrev);
      introFrom.copy(pCurr)
        .addScaledVector(introRight, Math.cos(theta) * radius)
        .addScaledVector(camFwd, -Math.sin(theta) * radius)
        .addScaledVector(introUp, height);
      /* Orbit looks at the airframe. Approach turns the look down the
       * course so the zoom is a dolly into the FPV camera, not a snap. */
      introLook.copy(pCurr)
        .addScaledVector(introUp, 0.04 + 0.04 * approachU)
        .addScaledVector(camFwd, 0.08 + 1.4 * approachU);
      shell.camera.up.set(0, 1, 0);
      shell.camera.position.copy(introFrom);
      shell.camera.lookAt(introLook);
      if (zoomU > 0) {
        introQuat.copy(shell.camera.quaternion);
        shell.camera.position.lerpVectors(introFrom, fpvPos, zoomU);
        shell.camera.quaternion.copy(introQuat).slerp(fpvQuat, zoomU);
      }

      const fovMid = 46;
      const fov = zoomU > 0
        ? fovMid + (ui.settings.cameraFov - fovMid) * zoomU
        : INTRO_FOV + (fovMid - INTRO_FOV) * approachU;
      if (Math.abs(shell.camera.fov - fov) > 0.05) {
        shell.camera.fov = fov;
        shell.camera.updateProjectionMatrix();
      }

      shell.quad.visible = zoomU < 0.88;
      if (introMs >= INTRO_TOTAL) {
        introMs = -1;
        shell.quad.visible = false;
        shell.camera.position.copy(fpvPos);
        shell.camera.quaternion.copy(fpvQuat);
        shell.camera.fov = ui.settings.cameraFov;
        shell.camera.updateProjectionMatrix();
      }
    } else {
      /* The camera sits inside the airframe, so the quad must be hidden or
       * you fly looking at the inside of its own outline hull. */
      shell.quad.visible = false;
      shell.camera.position.copy(fpvPos);
      shell.camera.quaternion.copy(fpvQuat);
      if (shell.camera.fov !== ui.settings.cameraFov) {
        shell.camera.fov = ui.settings.cameraFov;
        shell.camera.updateProjectionMatrix();
      }
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

    /* Attract clock and scenery only while this context is actually
     * composing a world. Settings skips it. Title and Maps still need
     * it so the flythrough and a first-visit thumbnail stay live. */

    if (worldLive && mode === 'title') {
      titleAcc += dt;
      const ts = Math.floor(titleAcc);
      titleAcc -= ts;
      titleStepMs += ts > 100 ? 100 : ts;
    }
    if (worldLive) {
      view.updateAnim(
        mode === 'title'
          ? titleStepMs
          : (mode === 'results' ? simTimeMs + Math.max(0, finishCamMs) : simTimeMs),
      );

      const focus = camOverride
        ? shell.camera.position
        : (mode === 'title' ? shell.quad.position : pCurr);
      view.updateShadowFocus(focus);
      /* Wash used to drive grass propwash. Blades are not drawn. The
       * argument stays on the call so every map has one updateWind shape. */
      const meanRpm = (stateCurr[14] + stateCurr[15] + stateCurr[16] + stateCurr[17]) * 0.25;
      const wash = (mode === 'title' || mode === 'results')
        ? 0.85
        : Math.min(1.3, meanRpm / 9000);
      view.updateWind(nowWall * 0.001, focus, wash);
    }
    /* info is accumulated across the whole frame (prepass, shadow map,
     * composer passes) and read back through __renderStats. */
    shell.renderer.info.reset();
    const renderStart = performance.now();
    if (worldLive) {
      view.post.render();
    }
    if (ui.screen === 'courses') {
      ui.paintMapThumbs(shell.canvas);
    }
    const renderMs = performance.now() - renderStart;
    renderStats.calls = shell.renderer.info.render.calls;
    renderStats.triangles = shell.renderer.info.render.triangles;

    /*
     * Settings studio. Own renderer, so the field's draw budget cannot
     * see it. Created when Settings opens, disposed when it closes, so
     * Fly never shares the GPU with a second WebGL context. The title
     * uses the world craft instead.
     */
    if (studioOn) {
      if (!showcase) {
        showcase = createShowcase(ui.craftCanvas);
        if (showcase.failed) {
          ui.setCraftCaption('The 3D preview could not start.');
        }
      }
      if (!showcase.failed) {
        showcase.setActive(true);
        if (!document.hidden) {
          showcase.update(dt, input.channels, nowWall, ui.settings.cameraAngle, angleModeOn);
          showcase.render();
        }
      }
    } else if (showcase) {
      try {
        showcase.dispose();
      } catch (e) {
        /* Already gone. */
      }
      showcase = null;
    }

    /* Overlay. */
    const st = stateCurr;
    /* speedNow, not a second square root of the same three numbers: it is
     * assigned unconditionally from this very state block earlier in the
     * frame, and its comment there already claims it is read once. */
    const speed = speedNow;
    /* P13: audio scheduling work on the main thread, worst case, and it has
     * to allocate nothing. Two scalars written in place, and the rpm array
     * is hoisted out of the loop for the same reason. */
    const audioStart = performance.now();
    /*
     * THE MIX IS FED FROM A STATE THE INTEGRATOR IS STILL ADVANCING, or it is
     * fed nothing at all.
     *
     * The physics steps under exactly one condition, `mode === 'flight' &&
     * !crashed && !landed`, and every other state freezes it: the title
     * screen, the pause menu, the results screen, the crash lockout, and
     * every second the craft sits parked. A frozen state still carries the
     * motor RPM of the last step it took, and update() reads that as the
     * honest truth about four turning motors, so the mix went on holding
     * whatever tone the quad was making at the instant the world stopped.
     * Crossing the last gate at speed left the results screen droning on a
     * full throttle chord for as long as the table was up, because nothing
     * steps the plant again on that screen; a wreck droned for the whole
     * 1.4 s lockout on whatever RPM it hit the tree at; and a mid lap
     * landing held the touchdown tone until the pilot took off again,
     * because sim_rest zeroes velocity and omega and leaves the motors
     * exactly where they were. None of those is a motor turning. Zero is,
     * and the RPM path already knows what to do with it: below
     * MOTOR_MUTE_RPM the stem is faded out rather than floored, which is
     * the same fade the start line has always used, where the plant is
     * freshly reset and the RPM really is zero.
     *
     * The airspeed argument gets the same test instead of its old bare
     * `mode === 'flight'`. That was true right through a crash lockout, so
     * the wind was held at the speed of the impact for the whole of it while
     * the wreck lay still on the ground.
     */
    const motorsTurning = mode === 'flight' && !crashed && !landed;
    audioRpm[0] = motorsTurning ? st[14] : 0;
    audioRpm[1] = motorsTurning ? st[15] : 0;
    audioRpm[2] = motorsTurning ? st[16] : 0;
    audioRpm[3] = motorsTurning ? st[17] : 0;
    audio.update(audioRpm, motorsTurning ? speed : 0);
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
      const nextGt = view.gates && view.gates[race.nextSceneIndex()];
      ui.setOsd({
        mode: view.mode,
        lapMs: race.freestyle ? airtimeMs : race.currentLapMs(simNow),
        gate: race.next + 1,
        gateCount: race.gates.length,
        gateCue: nextGt && nextGt.cue ? nextGt.cue : '',
        volts: st[18],
        lastLapMs: race.lastLapMs,
        packFrac: (st[18] - PACK_EMPTY_V) / (PACK_FULL_V - PACK_EMPTY_V),
        altitude: p.y - view.height(p.x, p.z, p.y),
        speedKph: speed * 3.6,
        throttle: input.channels.throttle,
        flightMode: angleModeOn ? 'angle' : 'acro',
        hitsLeft,
        hitLives: HIT_LIVES,
        /* Native state 3 latches until the L switch drops. The GO flash
         * is 900 ms; after that the overlay has to hide or it sits on
         * the goggles for the rest of the lap. */
        launchState: launchNow === 3 && nowWall >= lcGoUntil ? 0 : launchNow,
        launchPitch: pitchNoseDownDeg(st),
      });
      const ch = input.channels;
      ui.setStickOverlay({
        show: input.isKeyboardPrimary(),
        roll: ch.roll,
        pitch: ch.pitch,
        yaw: ch.yaw,
        throttle: ch.throttle,
      });
      updateTargetLock();
    } else if (mode !== 'paused') {
      ui.setStickOverlay({ show: false, roll: 0, pitch: 0, yaw: 0, throttle: 0 });
      ui.setTargetLock(LOCK_OFF);
    }

    const cal = input.calibrationView();
    const lapFlash = race.flashText(nowWall);
    /* Computed once: guidedPrompt retires the guided flag as a side effect,
     * so calling it in a condition and again in the body would consume it. */
    const guidedText = ui.guided ? guidedPrompt(race) : '';
    ui.setPadInfo(input.padSummary());
    const queuedPick = input.takePadPickQueue();
    if (queuedPick) {
      openPadPick(queuedPick);
    }
    if (ui.screen === 'padpick') {
      const pick = input.padPickView();
      if (pick) {
        ui.setPadPick(pick);
      } else {
        leavePadPick();
      }
      ui.setBanner('');
    } else if (ui.screen === 'calibrate') {
      if (cal) {
        ui.setCalibration(cal);
      } else {
        ui.show('settings');
        if (input.calResult === 'saved') {
          notice = { text: 'Stick mapping saved.', untilMs: nowWall + 2800 };
        }
        input.calResult = null;
      }
      ui.setBanner('');
    } else if (notice && nowWall < notice.untilMs && !(launchNow > 0)) {
      ui.setBanner(notice.text);
    } else if (ui.isModal()) {
      /* A banner is a flight message. Any screen that is up owns the
       * frame, and a launch prompt printed across a results table is how
       * you find that out. */
      ui.setBanner('');
    } else if (crashed) {
      ui.setBanner(ui.guided ? 'Crashed\nPress R to go back to the start line' : 'Crashed');
    } else if (launchNow === 3 && nowWall < lcGoUntil) {
      ui.setBanner('GO');
    } else if (launchNow === 1 || launchNow === 2) {
      const deg = Math.round(pitchNoseDownDeg(st));
      ui.setBanner(deg > 8
        ? (launchNow === 2
          ? `LAUNCH ${deg}\nPunch throttle`
          : `LAUNCH ${deg}\nCentre the stick, then punch`)
        : 'LAUNCH CONTROL\nPitch forward, then centre the stick');
    } else if (!flownThisRun) {
      ui.setBanner(ui.settings.launchControl
        ? (race.freestyle
          ? 'L for launch control, or throttle up\nNo gates, no clock. Go and find a line.'
          : 'L for launch control, or throttle up\nThe green gate starts your lap')
        : (race.freestyle
          ? 'Throttle up to take off\nNo gates, no clock. Go and find a line.'
          : 'Throttle up to take off\nThe green gate starts your lap'));
    } else if (guidedText) {
      ui.setBanner(guidedText);
    } else if (lapFlash) {
      ui.setBanner(lapFlash);
    } else {
      ui.setBanner('');
    }

    /* How to fly draws the same gimbals the flight overlay does, from the
     * same channels, so pressing W on the tutorial moves the stick it is
     * describing. It is the only screen outside flight that wants them. */
    if (ui.screen === 'howto') {
      const ch = input.channels;
      ui.setHowtoSticks({
        roll: ch.roll, pitch: ch.pitch, yaw: ch.yaw, throttle: ch.throttle,
      });
    }

    /* Rates draws the curve the sticks are about to fly, with the sticks on
     * it. Same channels the quad gets, for the same reason How to fly reads
     * them: a picture of a control you are holding is worth a paragraph. */
    if (ui.screen === 'rates') {
      const ch = input.channels;
      ui.paintRates({ roll: ch.roll, pitch: ch.pitch, yaw: ch.yaw });
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
  /*
   * The other way the mix can be left holding a tone, and it is the same
   * defect from the other end: the whole mix is driven from inside frame(),
   * and requestAnimationFrame is not called for a hidden document. The
   * AudioContext keeps its own clock while the tab is in the background, so
   * switching away mid flight used to leave the motors and the wind running
   * on the last values they were handed, for as long as the tab stayed
   * hidden, which is longer than any crash lockout. One update with the
   * motors stopped, scheduled the moment the page goes away, and the fade
   * a parked craft gets takes it down. Coming back, the next frame feeds
   * the live state again and the mix ramps up on the same 30 ms tau.
   */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      return;
    }
    audioRpm[0] = 0;
    audioRpm[1] = 0;
    audioRpm[2] = 0;
    audioRpm[3] = 0;
    audio.update(audioRpm, 0);
  });
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
  window.__intro = () => ({
    ms: introMs,
    holding: introMs >= 0 && introMs < INTRO_FLY,
    orbiting: introMs >= 0 && introMs < INTRO_ORBIT,
    approaching: introMs >= INTRO_ORBIT && introMs < INTRO_FLY,
    zooming: introMs >= INTRO_FLY && introMs < INTRO_TOTAL,
    quadVisible: shell.quad.visible,
  });
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
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
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
   * Every solid box within `r` of a point, as plain numbers. Harness only,
   * and it exists because the collider fit is the one thing in this project
   * that cannot be checked by a number alone: "the collisions hug the
   * graphics" is a claim about a picture, and the way to check it is to draw
   * the boxes over the picture and look. scripts/collider-overlay.js does
   * exactly that with what this returns.
   */
  window.__colliderBoxes = (x, z, r) => {
    const c = view.colliders;
    const out = [];
    if (!c.fbox) {
      return out;
    }
    for (let i = 0; i < c.fbox.length; i += 1) {
      if (!c.fbox[i]) {
        continue;
      }
      const cx = (c.fax[i] + c.fbx[i]) * 0.5;
      const cz = (c.faz[i] + c.fbz[i]) * 0.5;
      if (Math.hypot(cx - x, cz - z) > r) {
        continue;
      }
      out.push([c.fax[i], c.fay[i], c.faz[i], c.fbx[i], c.fby[i], c.fbz[i]]);
    }
    return out;
  };
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
  /* The radio, for a capture or a pilot comparing links. Returns the id in
   * force so a shot can name it. */
  window.__link = (id) => {
    if (id != null) {
      rcLink.setPreset(id);
      rcLink.reset(rcNextMs);
    }
    return { id: rcLink.id, hz: rcLink.hz, delayMs: rcLink.delayMs,
      jitterMs: rcLink.jitterMs, lossPpm: rcLink.lossPpm,
      sent: rcLink.sent, dropped: rcLink.dropped,
      presets: Object.keys(LINK_PRESETS) };
  };
  /* The recorder, for a capture and for checking a session recorded
   * anything before asking a pilot to download it. */
  window.__flightLog = () => ({
    on: flightLog.on, rows: flightLog.count, seconds: flightLog.seconds,
    csv: flightLog.count > 1 ? flightLog.csv().length : 0,
  });
  /* The recorded CSV itself, so a capture can check the file the download
   * button would write without driving a file dialog. */
  window.__flightLogCsv = () => flightLog.csv();
  window.__craftState = () => ({
    mode,
    flownThisRun,
    landed,
    crashed,
    descentRate: lastDescent,
    tiltDeg: lastTiltDeg,
    lastHitKind,
    lastClosingSpeed: lastClosing,
    grazeSpeedMax: GRAZE_SPEED_MAX,
    bounceSpeedMax: BOUNCE_SPEED_MAX,
    hitsLeft,
    hitLives: HIT_LIVES,
    groundClearance: shell.quad.position.y - view.height(shell.quad.position.x, shell.quad.position.z, shell.quad.position.y),
    thresholds: {
      descentMax: LAND_DESCENT_MAX,
      horizontalMax: LAND_HORIZONTAL_MAX,
      tiltMaxDeg: LAND_TILT_MAX_DEG,
      tiltHardDeg: LAND_TILT_HARD_DEG,
      tipSpeedMax: LAND_TIP_SPEED_MAX,
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
    rates: ratesSummary(ui.settings.rates),
    /* The menu's own roll srate, in the firmware's units, so it sits beside
     * rollSrate below and the two can be compared without converting. */
    rollSrateSet: ui.settings.rates.roll.srate,
    offered: TUNES.map((t) => t.id),
    applied: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(13) : null,
    inert: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(14) : null,
    unknown: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(15) : null,
    pRoll: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(17) : null,
    dMaxRoll: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(21) : null,
    tpaRate: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(22) : null,
    rollSrate: sim.e.sim_bf_debug ? sim.e.sim_bf_debug(42) : null,
    /*
     * The rate profile as the module holds it, not as the menu remembers
     * it. The Rates screen is now the only way a pilot changes any of
     * these, so this is where a row that writes nothing would show up: the
     * menu would read 900 and the module would still say 67.
     */
    profile: {
      rates_type: moduleGet(sim, 'rates_type'),
      roll_rc_rate: moduleGet(sim, 'roll_rc_rate'),
      roll_srate: moduleGet(sim, 'roll_srate'),
      pitch_srate: moduleGet(sim, 'pitch_srate'),
      yaw_srate: moduleGet(sim, 'yaw_srate'),
      roll_expo: moduleGet(sim, 'roll_expo'),
      throttle_limit_type: moduleGet(sim, 'throttle_limit_type'),
      throttle_limit_percent: moduleGet(sim, 'throttle_limit_percent'),
    },
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
    simStepIdx,
    lastTs,
    rcNextMs,
    moduleMs: Math.round(readState()[0] * 1000),
    configGen,
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
   * WHAT EVERY GATE IS WEARING, so the three tier rule is a check and not
   * an impression.
   *
   * "Only the next obstacle is lit" is a claim about fourteen objects, and
   * the only way to read that off a screenshot is to find fourteen gates in
   * the frame first. This reports the tier each one is actually dressed in,
   * off the materials the renderer drives, so a run can assert that exactly
   * one gate is lit, exactly one sits on the middle tier, and the rest are
   * dark. Harness only, called on demand, never per frame.
   */
  /*
   * The PAINT's answer to "is this point on the side the gate is flown
   * from", straight out of the renderer, so a check can hold it against
   * race.js's own scoring frame at a grid of points instead of trusting
   * that two files agree. A dive gate wearing red on the way in was
   * exactly this disagreement, found by a pilot and not by a check.
   * Harness only.
   */
  window.__aimProbe = (x, y, z) => (view.approachSide ? view.approachSide(x, y, z) : null);
  window.__gateTiers = () => {
    const a = view.targetAim ? view.targetAim() : null;
    return {
      next: race.freestyle ? -1 : race.nextSceneIndex(),
      follow: race.freestyle ? -1 : race.followSceneIndex(),
      aim: a ? { active: a.active, correct: a.correct, distance: a.distance } : null,
      gates: view.gates.map((gt, i) => ({
        sceneIndex: i,
        flyOrder: gt.flyOrder,
        virtual: Boolean(gt.virtual),
        /* The tier as the MATERIALS have it, not as the shell believes it
         * handed out. Reading back what the shell wrote asserts nothing. */
        tier: !gt.ringMat.visible
          ? 'dark'
          : (gt.glowMat.visible ? 'target' : 'follow'),
        ring: `#${gt.ringMat.color.getHexString()}`,
        haloOn: gt.haloMat.visible,
        glowOn: gt.glowMat.visible,
        cueOn: Boolean(gt.cueGroup && gt.cueGroup.visible),
        wrong: gt.fillMat ? gt.fillMat.uniforms.uWrong.value : null,
      })),
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
    graphics: view.graphics,
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
    /* Do not spring this toward hover. The capture wrote a throttle and
     * means it, the same way a radio stick holds a value. */
    input.kbAir = false;
    input.kbThrFromKeys = false;
    input.kbHoldMs = { roll: 0, pitch: 0, yaw: 0, w: 0, s: 0 };
    input.kbHoldDir = { roll: 0, pitch: 0, yaw: 0 };
    return { roll, pitch, yaw, throttle };
  };
  /* Is anything solid on the segment from p to q? Same call the frame loop
   * makes, so a capture can assert what a quad would hit. */
  window.__hit = (px, py, pz, qx, qy, qz, vh = vHalfFrame) => {
    /* The frame loop passes its tilt aware half extent and the craft's
     * world quaternion to every real query. A probe that left those out
     * was asking a different question from the one the game asks. */
    const k = view.colliders.hit(
      px, py, pz, qx, qy, qz, vh,
      qCollide.x, qCollide.y, qCollide.z, qCollide.w,
    );
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

