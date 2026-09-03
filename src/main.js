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
 * Ground handling is shell side: the physics module has no ground plane
 * (the verification harness measures free air behaviour), so the shell
 * raises sim_set_ground and the plant applies a rigid-body contact every
 * 1 ms step. Grass is a dead thump with a short belly slide. Turtle is
 * a scripted recovery: inverted, seated and still shows TURTLE MODE, and
 * any pitch or roll poke flips the hull upright. Hits bounce. The one
 * exception is a clip-through or a leftover overlap bounce cannot leave:
 * the shell freezes, says Crashed, and puts the quad back on the line.
 * See PROGRESS.md.
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
import { applyPixelRatio, internalScale, normalizeGraphics, pixelRatioFor, qualityFor } from './render/quality.js';
import { createPace, PACE_COOL } from './render/pace.js';
import { readGpuInfo } from './render/gpuinfo.js';
import { makeAttractCamera } from './render/attract.js';
import { measureBudget } from './render/budget.js';
import { simPosToThree, simQuatToThree, simLenToWorld, threePosToSim, threeDirToSim, WORLD_SCALE } from './render/frame.js';
import { CAMERA_MOUNT_FORWARD, CAMERA_MOUNT_UP, cameraTiltRad, clampCameraAngle, makeLensShake, fpvLensClear } from './render/lens.js';
import { MotorAudio } from './render/audio.js';
import { InputManager, NAV_DEFLECT } from './input/input.js';
import { mountTouchSticks, touchWanted } from './input/touchsticks.js';
import { RcLink, LINK_DEFAULT, LINK_PRESETS } from './input/link.js';
import { FlightRecorder, downloadText, flightLogName } from './share/flightlog.js';
import { Race } from './game/race.js';
import { TrickDetector } from './game/trickdetect.js';
import { deriveObstacles, OB_BAR, OB_POLE } from './game/obstacles.js';
import { FreestyleScore, formatScore } from './game/score.js';
import { GhostBook, GhostLap, GhostRecorder } from './game/ghost.js';
import { buildGhostCraft } from './render/ghostcraft.js';
import { decodeGhost, encodeGhost, ghostFromBase64, ghostToBase64 } from './share/ghostdata.js';
import { CRAFT_R, CRAFT_WORLD_R, craftVerticalHalf, contactMaterial, canPerch, shouldScorePass, shouldEnterTurtle, uprightPlantQuat, turtleFlipEase, turtleFlipLift, turtleSlerpQuat, TURTLE_STICK_MIN, TURTLE_SPEED, TURTLE_RATE, TURTLE_FLIP_MS, TURTLE_INVERT_UPZ, TURTLE_CLEARANCE, PROP_PLANE_MAX_UP_DOT, GRAZE_SPEED_MAX, BOUNCE_SPEED_MAX, BOUNCE_COOLDOWN_MS, BOUNCE_SEPARATION, SURFACE_SPEED_MAX, LAND_DESCENT_MAX, LAND_HORIZONTAL_MAX, LAND_TILT_MAX_DEG, LAND_TILT_HARD_DEG, LAND_TIP_SPEED_MAX, GROUND_MU, GROUND_E, makeClipWatch, resetClipWatch, clipWatchTick, CLIP_CENTER_EPS, CLIP_DEEP, CLIP_CRASH_HOLD_MS, CLIP_SPAWN_GRACE_MS, contactPatch } from './game/collide.js';
import { Ui, formatTime } from './ui/ui.js';
import {
  adoptMostFlownTrack, adoptShareFromLocation, boardPageUrl, fetchGhost, fetchTrackDocument,
  fetchTrackTimes, postFreestyleRun, postTime,
} from './share/board.js';
import { hasFlyableTrack, inspectCourse, publishCurrentCourse, pushOwnedListing, seatedCourseKey, suggestRemixName, syncOwnedIdentity } from './share/listing.js';
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
import { normaliseRates, ratesAreDefault, ratesDiff, ratesSummary, TOUCH_RATE_DEFAULTS } from '../configs/rates.js';
import { clearPidsFor, PID_AXES, pidCliKey, pidsDiffFor, SLIDER_KEYS, SLIDERS } from '../configs/pids.js';
import { cliMap, composeConfig, FC_DUMP_KEY, moduleDump, moduleGet, RATES_KEEP, ratesFromDump, tuneBody } from './fc/dump.js';
import { GATE_SCALE } from './game/track.js';
import { planStages, moduleCounter, yieldToPaint } from './ui/loading.js';
import { loadSim, simErrorName, SIM_OK, SIM_ERR_BAD_ARG } from '../tests/lib/simmod.js';

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
 * And the throttle a pilot has to come back BELOW before the craft is
 * allowed to think about sitting down again. One threshold for both edges
 * is a latch with no hysteresis: a stick resting on 0.25, which is where a
 * thumb sits while it decides, took off and sat down on alternate frames
 * and played the two loudest blips in the mix at frame rate. That train
 * measures 19 dB over the bed and 12 dB over a full crash cue, and it is
 * what "a loud noise, like I am stuck to the mesh for a moment" sounds
 * like. The gap is deliberately wide: nothing between 0.18 and 0.25 is a
 * decision, it is a thumb.
 */
const TAKEOFF_RELEASE = 0.18;
/*
 * And a floor on how often the pair may SOUND, whatever the latch does.
 * A genuine touch and go inside a fifth of a second does not deserve two
 * blips, and this is the backstop that means no future path can machine
 * gun them again. It gates the cue only: landed, takingOff and the
 * physics are untouched by it.
 */
const GROUND_CUE_GAP_MS = 220;
/*
 * How long after a takeoff the contact cues stay muted, on the WALL clock.
 *
 * 8ebd6b8 muted them on the `takingOff` flag, and the flag is not a window:
 * it is set at the top of the frame and cleared in the same frame, thirty
 * lines before the branch that judges the frame's contact and calls
 * feelImpact. So the guard covered every frame of a departure except the
 * last one, which is the one with the impulse in it. A frame can be 100 ms
 * long, so a flag cannot bound a window a frame can step over: a clock
 * can.
 */
const TAKEOFF_WINDOW_MS = 250;
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
/*
 * Hitch frames are capped at 100 ms in the loop. Adding that whole cap to the
 * intro clock burns the pad shot before a single exterior frame is shown.
 *
 * IT WAS 33, WHICH IS 30 FPS, AND THAT CAPPED THE STEADY STATE TOO.
 *
 * A cap on the step is a cap on how fast the shot can play, so a machine
 * running at 25 fps gave 33 of every 40 ms to a 4.0 s shot and took 4.8 s
 * over it; at 20 fps, 6.1 s; measured on this container at about 9 fps the
 * intro ran at 0.3 times speed. That is every run start and every Restart
 * run, on exactly the ordinary laptop this project is for, and the pilot
 * reads it as the simulator being slow before they have touched a stick.
 *
 * 100 matches the physics accumulator's own cap, which is the right shape:
 * a hitch stretches the shot by its own length and no more, and a slow but
 * steady machine plays the shot at the speed it was authored at, in fewer
 * frames. The comment above is why the number is not simply Infinity.
 */
const INTRO_STEP_MAX = 100;
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
/* How far the intro camera stays above whatever is under it. Smaller than
 * the finish camera's 0.42 because the pad shot is an intimate one and a
 * big clearance would throw it into the air; enough to clear a launch
 * block's deck, which is the thing it was actually falling into. */
const INTRO_FLOOR_CLEAR = 0.12;
/* FPV lens floor lives in lens.js (fpvLensClear). Intro and finish
 * already keep their cameras out of the dirt. */
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
/*
 * How near a wall a Wall Ride is flown, in metres.
 *
 * The workbook says "just a few inches away from the wall", which is a
 * five inch quad's own width. Two metres is the radius the proximity query
 * is asked with, not the distance a trick demands: the query answers "is
 * anything within two metres", the pattern asks for a great deal closer,
 * and the gap between them is what stops the query missing a wall the craft
 * is about to be beside. See TrickDetector.near.
 */
const WALL_NEAR_M = 2.0;

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
/* field: field.js, scene.js, post.js. city: all 59 vendored files, plus
 * index.js, animation.js, bake.js, drawn.js and references.js, plus the
 * eight under places/ that build the works road, the disused works, the
 * municipal pool, the training field and the blossom that falls over the
 * first three: 72 in all. It was 63 while vendored/world/petals.js sat
 * in the tree unimported, and 64 once the falling blossom was built again.
 * scan.js is ours and harness only, so it never arrives on a player's
 * load. Check 16 asserts the city count against what the browser actually
 * fetched on a cold load, because 61 sat here for a round and nothing
 * could notice.
 *
 * There is one freestyle world now. Industrial bando, Municipal baths and
 * Bardwell's yard were removed on 2026-08-30, and their three entries went
 * with them. `npm run lint:memory` prints the fetched count per map beside
 * this number. */
const MAP_MODULE_COUNT = { field: 1, city: 72, custom: 1 };
/* Where a map's modules live, so the loading bar can count them. Data, not a
 * ternary: the ternary read "field or else city", so a third map counted its
 * modules under the city's prefix and the bar sat at zero.
 *
 * These stay leading-slash while the rest of the file went relative, and that
 * is not an oversight. They are never fetched. moduleCounter matches them as a
 * SUBSTRING of each performance entry's full URL, and a shell mounted at
 * https://webfpv.org/sim/ still produces names containing /src/maps/city/. */
const MAP_MODULE_PREFIX = {
  field: '/src/maps/field',
  city: '/src/maps/city/',
  custom: '/src/maps/custom',
};

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
   * compositor queue costs a pilot.
   *
   * ?gpu=low is a measurement hook: WebGL powerPreference low-power, so a
   * dual-GPU box can bind the iGPU. The flight default stays
   * high-performance. A dual-GPU laptop must not pick the battery chip
   * because a debug URL was opened once; this query is not stored. */
  const gpuQuery = new URLSearchParams(window.location.search).get('gpu');
  const shell = buildShell(canvas, {
    desynchronized: true,
    powerPreference: gpuQuery === 'low' ? 'low-power' : 'high-performance',
  });
  const input = new InputManager();
  /*
   * Sample the sticks on their own timer rather than once per rendered frame.
   * See src/input/input.js for what that was costing feedforward.
   */
  input.startPolling(2);
  const ui = new Ui(uiRoot);
  /*
   * The thumb sticks, on a device that has thumbs to offer. Mounted after
   * the Ui so the overlay sits ABOVE every screen in the stacking order,
   * which is exactly why the frame loop below only shows it in flight:
   * over a menu its catchment zones would swallow the taps. Pause goes
   * through the same two calls the Escape key makes from flight.
   */
  let touch = null;
  if (touchWanted()) {
    touch = mountTouchSticks({
      onPause: () => {
        if (ui.screen === 'flight') {
          ui.act('pause');
          ui.show('paused');
          /* Hide NOW, not on the next frame: the frame loop confirms this
           * a beat later, and that beat is long enough on a slow phone for
           * the pilot's second tap to land on a stick zone that is sitting
           * over the menu it just opened. */
          touch.setVisible(false);
        }
      },
    });
    uiRoot.append(touch.root);
    input.attachTouch(touch);
  }
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
  } else if (gpuInfo.integrated && ui.settings.graphicsAuto && ui.settings.graphics === 'high') {
    /*
     * THE SAME BRANCH, ONE STEP SMALLER, FOR THE MACHINE MEDIUM IS NAMED
     * FOR.
     *
     * detectDefaultGraphics runs before any context exists and can only read
     * the user agent, which names a Steam Deck, a phone and nothing else.
     * So every laptop booted into High, including the UHD 620 and Iris class
     * parts that quality.js explicitly describes as Medium's target. This is
     * the first line that has the renderer's name, which is the only way to
     * tell an integrated chip from a discrete one, and it is the line the
     * software test above already stands on.
     *
     * Medium and not Low: an iGPU draws perfectly well, it is short of fill
     * rate and memory bandwidth, and Medium is where the shadows come down
     * to 1024 and the bloom pass goes away. Apple Silicon is deliberately
     * not matched, per the note on INTEGRATED_RE.
     */
    ui.settings.graphics = 'medium';
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
   * THE FLIGHT CONTROLLER'S BYTES ARE ASKED FOR BEFORE THE BOARD IS, AND
   * THIS IS THE ONE PLACE THE TWO OVERLAP.
   *
   * dist/sim.wasm depends on nothing: not the URL, not the board, not the
   * settings. The board fetch below depends on the network reaching another
   * host that may be asleep. They used to run in series, so the wasm request
   * did not leave the browser until both board round trips had come back:
   * measured 1519 ms on a local board, and a cold Render service takes about
   * a minute to wake. Starting it here costs nothing and takes those round
   * trips off the critical path.
   *
   * The progress callback is deliberately gated. loading.progress(id) starts
   * that stage if it is not the current one, so an ungated callback would
   * flip the screen to "Flight controller" while it is really waiting on the
   * board, which is the same lie in a new place. Instead the last reading is
   * held and replayed when the sim stage genuinely begins.
   */
  let simProgress = null;
  let simStageLive = false;
  const simBytes = fetchBytes(WASM_URL, (f, got, total) => {
    simProgress = [f, `${(got / 1024).toFixed(0)} of ${(total / 1024).toFixed(0)} kB`];
    if (simStageLive) {
      loading.progress('sim', simProgress[0], simProgress[1]);
    }
  });
  /* A rejection here is handled at the await below, in the stage that owns
   * it. Without this the failure is unhandled for as long as the board takes,
   * and the console gets a promise rejection warning before the screen gets
   * its honest message. */
  simBytes.catch(() => {});
  /*
   * A published course arrives as ?share=id. Fetch it before the world is
   * built so the custom map reads the document the board sent, not the
   * draft sitting in the builder's autosave.
   *
   * This is a named stage because it is a network wait on a service that
   * sleeps, and a player who is told "Renderer" while the board wakes up
   * will go looking for the wrong problem.
   */
  loading.start('board');
  try {
    const fromUrl = await adoptShareFromLocation();
    if (fromUrl) {
      ui.settings.map = 'custom';
      ui.renderMenu();
    } else if (ui.settings.map !== 'city' && !hasFlyableTrack()) {
      const featured = await adoptMostFlownTrack();
      if (featured) {
        ui.settings.map = 'custom';
        ui.renderMenu();
      }
    }
  } catch (e) {
    ui.setBanner(`Could not open that published track.\n${e.message ?? e}`, true);
  }
  /* Done either way: a board that was down is a board that has finished
   * being asked. Without this the stage records no duration and the bar
   * keeps its weight without ever filling it. */
  loading.done('board');
  /*
   * A board chase link arrives as ?ghost=tm-xxxxxxxx beside the ?share=.
   * The id is only held here; the fetch happens once the course is loaded
   * and its listing known, in ghostCourseChanged, so a slow board cannot
   * stall boot.
   */
  let wantGhostId = '';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('ghost') || '';
    if (/^tm-[0-9a-f]{8}$/.test(fromUrl)) {
      wantGhostId = fromUrl;
    }
  } catch (e) {
    /* No URL to read. */
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
  /*
   * RESIZE IS APPLIED ONCE A FRAME, NOT ONCE AN EVENT.
   *
   * post.setSize reallocates both composer targets, the normal target and
   * every pass including the bloom ladder. Dragging a window edge fires tens
   * of resize events a second, so the old handler turned a drag into a storm
   * of GPU allocations, with the previous set of targets still alive until
   * the collector got to them. Setting a flag and doing the work at the top
   * of the frame collapses a drag into one resize per frame, which is the
   * most a screen can show anyway.
   */
  let resizeDirty = false;
  window.addEventListener('resize', () => {
    resizeDirty = true;
  });
  function applyResizeIfDirty() {
    if (!resizeDirty) {
      return;
    }
    resizeDirty = false;
    const d = shell.resize();
    /*
     * The pixel ratio is re-read here, which it never used to be.
     *
     * pixelRatioFor was evaluated at boot, on a preset change and on a
     * settings write, and nowhere else. Browser zoom fires resize and
     * changes devicePixelRatio, so Ctrl-plus left the canvas rendering at
     * the old ratio in fewer CSS pixels, which is a blurry upscale; dragging
     * a window from a 2x laptop panel to a 1x monitor kept rendering four
     * times the pixels the monitor could show. It also matters more now that
     * the ratio depends on the window's area through the field's pixel
     * budget, which by definition changes when the window does.
     */
    const wantPr = pixelRatioFor(ui.settings.graphics, renderScaleOf(ui.settings));
    if (Math.abs(wantPr - shell.pixelRatio) > 0.001) {
      applyPixelRatio(shell, ui.settings.graphics, renderScaleOf(ui.settings));
    }
    /* mapReady as well as view: a swap disposes the old pipeline before it
     * builds the new one, and a resize landing in that window used to call
     * setSize on render targets that had already been freed. mapReady is
     * false for exactly that gap. */
    if (view && view.post && mapReady) {
      view.post.setSize(d.w, d.h);
    }
  }
  const audio = new MotorAudio();
  audio.music.onChange = (st) => {
    ui.setMusicNow(st);
  };
  /* The dock names what is playing, and what is playing on the title
   * screen is the menu bed, whose record is a random pick on the player.
   * Push it before the first gesture so the dock is not showing a flight
   * track that nobody is going to hear yet. This is unconditional now:
   * the Music track setting names a FLIGHT record, so a pinned setting is
   * not the answer to what is playing in the menus either. */
  if (typeof audio.musicStatus === 'function') {
    ui.setMusicNow(audio.musicStatus());
  }
  ui.onMusicSkip = (dir) => {
    wakeAudio();
    if (typeof audio.skipMusic !== 'function') {
      return;
    }
    audio.skipMusic(dir);
    const st = audio.musicStatus();
    /*
     * A skip pins the setting only when what was skipped was a FLIGHT
     * record. The dock's buttons skip whatever is playing, which in the
     * menus is the two record bed, and writing one of those ids into
     * musicTrack would leave the setting holding a value its own list
     * does not contain, showing as the first flight track and silently
     * coerced back to rotation on the next read.
     */
    if (st && st.context === 'flight' && ui.settings.musicTrack !== 'rotation') {
      ui.settings.musicTrack = st.id;
      ui.persistSettings();
    }
    if (ui.screen === 'pilot') {
      ui.renderMenu();
    }
  };
  /* Which crate the bed plays, off the screen. ui.flying() is the one
   * predicate for that question; see its comment for why paused is a
   * flight. */
  ui.onScreenChange = () => {
    if (typeof audio.setMusicContext === 'function') {
      audio.setMusicContext(ui.flying() ? 'flight' : 'menu');
    }
  };

  loading.start('sim');
  simStageLive = true;
  if (simProgress) {
    /* Whatever arrived while the board was being asked. Usually all of it. */
    loading.progress('sim', simProgress[0], simProgress[1]);
  }
  const sim = await loadSim(await simBytes);
  if (typeof sim.e.sim_deflect !== 'function') {
    throw new Error('sim.wasm does not export sim_deflect');
  }
  if (typeof sim.e.sim_contact !== 'function') {
    throw new Error('sim.wasm does not export sim_contact');
  }
  if (typeof sim.e.sim_set_ground !== 'function') {
    throw new Error('sim.wasm does not export sim_set_ground');
  }
  if (typeof sim.e.sim_set_crashflip !== 'function') {
    throw new Error('sim.wasm does not export sim_set_crashflip');
  }
  if (typeof sim.e.sim_set_pose !== 'function') {
    throw new Error('sim.wasm does not export sim_set_pose');
  }
  if (typeof sim.e.sim_ground_contacts !== 'function') {
    throw new Error('sim.wasm does not export sim_ground_contacts');
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
   * A flown config is a TUNE plus the pilot's PID ADJUSTMENT plus the
   * pilot's RATES, joined only by composeConfig in src/fc/dump.js. No file
   * in configs/ carries a rateprofile any more, and the rate lines are
   * appended last so that even a diff the pilot drops on the page flies on
   * the rates in the menu. See configs/rates.js for why rates were
   * separated: shipping rates inside the Karate preset meant choosing that
   * tune also halved the stick authority, so the tune could never be
   * judged on its own. The PID adjustment sits between the two, keyed by
   * the LOADED tune's id, so each tune keeps its own; see configs/pids.js.
   */
  /* The Flight controller screen's saved dump, the body of the pilot's
   * own "custom" tune. Its rates were stripped on the way in, so it goes
   * through composeConfig like any file in configs/. */
  function readFcDump() {
    try {
      return localStorage.getItem(FC_DUMP_KEY);
    } catch (e) {
      return null;
    }
  }
  function writeFcDump(body) {
    try {
      localStorage.setItem(FC_DUMP_KEY, body);
      return true;
    } catch (e) {
      return false;
    }
  }
  let tuneText;
  if (configId === 'custom') {
    tuneText = readFcDump();
    if (tuneText == null) {
      /* A stored choice whose dump is gone. Fall back to the first tune
       * rather than failing to boot; the stale choice must not stop the
       * page. */
      configId = TUNES[0].id;
      ui.settings.tune = configId;
      menuTune = configId;
      configName = `${configId}.diff`;
      ui.persistSettings();
    } else {
      configName = 'your edits';
    }
  }
  if (tuneText == null) {
    tuneText = new TextDecoder().decode(await fetchBytes(tunePath(configId)));
  }
  let ratesText = ratesDiff(ui.settings.rates);
  let pidsText = pidsDiffFor(ui.settings.pids, configId);
  let configText = composeConfig(tuneText, ui.settings.rates, RATES_KEEP, pidsText);
  if (sim.init(configText) !== SIM_OK) {
    if (configId !== 'custom') {
      throw new Error(`sim_init failed on ${configName}`);
    }
    /* A saved dump the module refuses must not brick the page: boot the
     * default tune instead and keep the dump stored for the pilot to
     * re-edit. */
    configId = TUNES[0].id;
    ui.settings.tune = configId;
    menuTune = configId;
    configName = `${configId}.diff`;
    ui.persistSettings();
    tuneText = new TextDecoder().decode(await fetchBytes(tunePath(configId)));
    pidsText = pidsDiffFor(ui.settings.pids, configId);
    configText = composeConfig(tuneText, ui.settings.rates, RATES_KEEP, pidsText);
    if (sim.init(configText) !== SIM_OK) {
      throw new Error(`sim_init failed on ${configName}`);
    }
  }
  /*
   * What the controller is actually flying, read back out of the module
   * after every successful init and handed to the PIDs screen. The screen
   * never computes a PID from a slider itself: this readback is the only
   * source its numbers have, so a slider that stopped reaching Betaflight
   * would be visible as a slider that moves nothing.
   */
  function publishPids() {
    const num = (key) => {
      const v = Number(moduleGet(sim, key));
      return Number.isFinite(v) ? v : 0;
    };
    /*
     * The tune's OWN slider positions come from the tune text, not from
     * the module: once an override block has run, the module's stored
     * sliders ARE the override, and "the value this tune ships" would be
     * unrecoverable. The text is the tune, cliMap takes the last write
     * exactly as the CLI does, and a key the tune never sets is the
     * firmware default of 100.
     */
    const map = cliMap(tuneText);
    const baseline = {};
    for (const k of SLIDER_KEYS) {
      const v = Number(map.get(SLIDERS[k].cli));
      baseline[k] = Number.isFinite(v) ? v : 100;
    }
    const pids = {};
    for (const axis of PID_AXES) {
      pids[axis] = {
        p: num(pidCliKey('p', axis)),
        i: num(pidCliKey('i', axis)),
        d: num(pidCliKey('d', axis)),
        dmax: num(pidCliKey('dmax', axis)),
        f: num(pidCliKey('f', axis)),
      };
    }
    ui.setPidsLive({
      tune: configId,
      mode: moduleGet(sim, 'simplified_pids_mode'),
      baselineMode: map.get('simplified_pids_mode') || 'RPY',
      baseline,
      pids,
    });
  }
  publishPids();
  loading.done('sim');
  loading.detail = '';

  applyPixelRatio(shell, ui.settings.graphics, renderScaleOf(ui.settings));
  /*
   * The swap path has fallen back to the previous map on a failed load for
   * a while; boot had nothing, so one map that would not build (a bad
   * asset, a WebGL context the city cannot have, a course the custom map
   * chokes on) took the whole session down before the title screen. The
   * track world is the floor: it is the default map and the smallest world
   * here, so if it cannot build there is nothing to fall back TO and the
   * throw is honest.
   */
  try {
    view = await loadMap(shell, ui.settings.map, loading, {
      quality: ui.settings.graphics,
      renderScale: renderScaleOf(ui.settings),
    });
  } catch (e) {
    if (ui.settings.map === 'custom') {
      throw e;
    }
    console.error(e);
    const failed = mapById(ui.settings.map).name;
    ui.settings.map = 'custom';
    ui.renderMenu();
    view = await loadMap(shell, 'custom', loading, {
      quality: ui.settings.graphics,
      renderScale: renderScaleOf(ui.settings),
    });
    /* The banner, not `notice`: that is declared with the frame loop's own
     * state further down and does not exist yet. This is the same way the
     * share adoption above reports a boot failure. */
    ui.setBanner(`${failed} could not be loaded.\nThe track was loaded instead.`, true);
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
     * craft underground, looking up at the lit underside of the terrain.
     * spawn.y is a fromY hint so a deck spawn is not the grass under it. */
    startY = view.spawn.y != null
      ? view.height(startX, startZ, view.spawn.y)
      : groundAt(startX, startZ);
    qSpawn.setFromAxisAngle(AXIS_Y, startYaw);
    qSpawnInv.copy(qSpawn).invert();
  }

  /* The race: gate order, lap clock, best lap. On a freestyle map it is a
   * real object with no gates in it and it scores nothing. */
  let race = new Race(view.gates);
  /*
   * THE FREESTYLE SCORE, and it only ever runs on a freestyle map.
   *
   * The detector is fed one physics step at a time from inside the step
   * loop, not once a frame, because a 360 roll at 900 deg/s is 400 ms and a
   * frame at 30 fps would sample it eleven times: the rate integral has to
   * see every millisecond the plant saw or the turn count is a guess. That
   * is the only thing in the shell that runs at 1 kHz, and it is three
   * multiply-accumulates and a compare, which is why it can.
   *
   * The scorer is the opposite: it is ticked once a frame, off the SIM
   * clock rather than the wall clock, so a dropped frame cannot bank a
   * combo early and a paused game cannot bank one at all.
   */
  /* Set once a frame, read 1000 times: whether this map and this moment
   * are being scored at all. */
  let scoring = false;
  /* Scratch for the per-step world position and heading handed to the
   * detector. Written in place, never allocated in the step loop. */
  const scorePos = new THREE.Vector3();
  const scoreFwd = new THREE.Vector3();
  /* The craft's own up axis, in the obstacles' frame. With the nose it gives
   * the recogniser the whole body frame, which is what lets a lap tell the
   * loop's own turn from the bank it was flown at. See debankLap. */
  const scoreUp = new THREE.Vector3();
  const scoreQuat = new THREE.Quaternion();
  /*
   * The run's shape is the pilot's choice, made on the Freestyle screen and
   * re-read every time a run starts: 'scored' is two minutes and a board,
   * 'free' is neither. See DEFAULTS.freestyleRun in src/ui/ui.js.
   */
  const score = new FreestyleScore({ timed: ui.settings.freestyleRun !== 'free' });
  /*
   * The things in the world worth flying around, derived from the map's own
   * colliders once when the map is built. Null on a map with none, and the
   * detector is then exactly the open-air recogniser it was before.
   */
  let obstacles = null;
  const trickDetector = new TrickDetector((trick) => {
    score.land(trick);
  });
  /*
   * Rebuild the obstacle list for the map now loaded. Freestyle only: a
   * race map has a course, and nothing on a course is a powerloop object.
   * The ground query is the map's own, so a wall that reaches sixty metres
   * underground is measured from the street rather than from its buried
   * bottom edge.
   */
  function rebuildObstacles() {
    if (!view || view.mode !== 'freestyle' || !view.colliders) {
      obstacles = null;
      trickDetector.obstacles = null;
      return;
    }
    obstacles = deriveObstacles(view.colliders, (x, z, fromY) => view.height(x, z, fromY));
    trickDetector.obstacles = obstacles;
    /* And the world itself, as one distance query. The recogniser measures
     * the craft's own path and asks this only whether anything solid was
     * inside the circle it flew, which is a question a wall, a roof edge or
     * a tree can answer as well as a rail can. See TrickDetector.solids. */
    trickDetector.solids = view.colliders
      ? { gapAt: (x, y, z, r) => view.colliders.gapAt(x, y, z, r) }
      : null;
  }
  /* The map loaded at boot never passes through the swap path above, so it
   * gets its obstacles here. After the consts, not before: rebuildObstacles
   * writes to trickDetector and a call any earlier is a dead zone away. */
  rebuildObstacles();
  const racePrev = new THREE.Vector3();
  let raceHasPrev = false;

  /*
   * THE GHOST: a recorded lap flown back as a translucent pacer.
   *
   * Everything here is downstream of the physics, the same standing as the
   * race itself: the recorder samples the same interpolated world pose the
   * hero craft and the gate scoring already use, and the replay drives a
   * separate session-lived craft that collides with nothing. Timeline zero
   * for both sides is the timing gate crossing, so the chase is one
   * subtraction from the lap clock, and a ghost recorded at any frame rate
   * replays identically at any other.
   *
   * What can be chased: the session's best lap on this course, the previous
   * lap, or a lap somebody posted to the board with a recording attached.
   * Session ghosts live in memory only; the board is where a lap outlives
   * the tab. The pilot's choice is settings.ghost for the two session modes
   * and session state for a board pick, because a board ghost belongs to
   * one course and one visit.
   */
  const ghostRecorder = new GhostRecorder();
  const ghostBook = new GhostBook();
  const ghostRig = buildGhostCraft();
  const ghostSample = { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false };
  let ghostLap = null; /* the lap being chased, armed at each lap start */
  let ghostChased = null; /* the lap the last FINISHED lap was chased against */
  let ghostChoice = 'best'; /* off, best, previous, or board:tm-xxxxxxxx */
  let ghostBoardTimes = null; /* this course's posted times, for the picker */
  let ghostBoardLap = null; /* the downloaded board ghost, decoded once */
  let ghostBoardBusy = false;
  let ghostGap = null; /* { deltaMs, final, untilWall } for the OSD */
  /* The ?ghost= a board chase link arrived with, parsed at boot above,
   * armed once the course's times are fetched. */
  let ghostQueryId = wantGhostId;
  /* The previous frame's pose, so a lap start can seed the recorder with
   * the frame BEFORE the crossing and the t = 0 keyframe is interpolated
   * across the line rather than held from the frame after it. */
  const ghostPrev = { valid: false, simMs: 0, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };

  function normalizeGhostChoice(raw) {
    return raw === 'off' || raw === 'previous' ? raw : 'best';
  }
  ghostChoice = normalizeGhostChoice(ui.settings.ghost);

  /* Ghosts are course-shaped, not tune-shaped: any config's lap can pace
   * any other. The book is keyed accordingly. */
  function ghostCourseKey() {
    return view.id === 'custom' ? `custom:${loadedCourseKey(view)}` : view.id;
  }

  function ghostLabelFor(lap) {
    if (lap.source === 'board') {
      return `${lap.name || 'Rival'}  ${formatTime(lap.durationMs)}`;
    }
    return `${lap.label === 'Session best' ? 'Best' : 'Last'}  ${formatTime(lap.durationMs)}`;
  }

  /* What the current choice resolves to right now, or null. Session slots
   * fill in as laps are flown, so a choice can be ahead of its data: Best
   * with no lap yet simply flies no ghost until there is one. */
  function resolveGhost() {
    if (race.freestyle || ghostChoice === 'off') {
      return null;
    }
    if (ghostChoice.startsWith('board:')) {
      return ghostBoardLap && `board:${ghostBoardLap.timeId}` === ghostChoice ? ghostBoardLap : null;
    }
    const key = ghostCourseKey();
    return ghostChoice === 'previous' ? ghostBook.previous(key) : ghostBook.best(key);
  }

  function armGhost() {
    ghostLap = resolveGhost();
    if (ghostLap) {
      ghostRig.setLabel(ghostLabelFor(ghostLap));
    }
  }

  /*
   * The Ghost menu row, rebuilt whenever the data behind it moves. The row
   * itself lives in ui.js; this is the one place that knows what can be
   * chased, so it owns the labels, the availability notes and the cycle
   * order: off, session best, previous lap, then every board time that
   * carries a recording.
   */
  function ghostRowChoices() {
    const list = [
      { id: 'off', label: 'Off' },
      { id: 'best', label: 'Your best this session' },
      { id: 'previous', label: 'Your previous lap' },
    ];
    for (const t of ghostBoardTimes || []) {
      list.push({ id: `board:${t.id}`, label: `${t.name}  ${formatTime(t.lapMs)}` });
    }
    return list;
  }

  function ghostRowNote() {
    if (ghostChoice === 'off') {
      return 'Nobody to chase. Laps still record, so switching this on later has your session to race.';
    }
    if (ghostChoice.startsWith('board:')) {
      if (ghostBoardBusy) {
        return 'Fetching that lap from the board.';
      }
      return ghostBoardLap
        ? 'A recorded lap from the public board flies beside you as a translucent pacer.'
        : 'That lap could not be fetched from the board.';
    }
    const key = ghostCourseKey();
    const have = ghostChoice === 'previous' ? ghostBook.previous(key) : ghostBook.best(key);
    if (!have) {
      return 'No lap on record this session yet. Finish one and it flies beside you as a translucent pacer.';
    }
    return `A translucent pacer flying that lap, ${formatTime(have.durationMs)}. The OSD reads your gap at every gate.`;
  }

  function syncGhostRow() {
    if (race.freestyle) {
      ui.setGhostRow(null);
      return;
    }
    const choices = ghostRowChoices();
    const current = choices.find((c) => c.id === ghostChoice) || choices[1];
    ui.setGhostRow({
      value: current.label,
      note: ghostRowNote(),
      cycle: (dir) => pickGhostByStep(dir),
    });
  }

  function pickGhostByStep(dir) {
    const choices = ghostRowChoices();
    const at = Math.max(0, choices.findIndex((c) => c.id === ghostChoice));
    const next = choices[(at + (dir < 0 ? -1 : 1) + choices.length) % choices.length];
    pickGhost(next.id);
  }

  function pickGhost(id) {
    ghostChoice = id;
    if (id === 'off' || id === 'best' || id === 'previous') {
      ui.settings.ghost = id;
      ui.persistSettings();
      armGhost();
      syncGhostRow();
      return;
    }
    /* A board pick fetches the recording once and keeps it decoded. */
    const timeId = id.slice('board:'.length);
    if (ghostBoardLap && ghostBoardLap.timeId === timeId) {
      armGhost();
      syncGhostRow();
      return;
    }
    loadBoardGhost(timeId);
  }

  function adoptBoardGhost(payload, timeId) {
    const lap = new GhostLap(decodeGhost(ghostFromBase64(payload.ghost)), {
      label: 'Board lap',
      name: payload.name || '',
      source: 'board',
    });
    lap.timeId = timeId;
    ghostBoardLap = lap;
    return lap;
  }

  function loadBoardGhost(timeId) {
    const listing = ghostListing();
    if (!listing) {
      return;
    }
    const key = ghostCourseKey();
    ghostBoardBusy = true;
    syncGhostRow();
    (async () => {
      try {
        const payload = await fetchGhost(listing.shareId, timeId, listing.board);
        if (ghostCourseKey() !== key) {
          return; /* The course changed under the fetch. */
        }
        adoptBoardGhost(payload, timeId);
        armGhost();
      } catch (e) {
        if (ghostCourseKey() !== key) {
          return;
        }
        ghostBoardLap = null;
        notice = { text: `Could not fetch that ghost.\n${e.message ?? e}`, untilMs: performance.now() + 3600 };
      } finally {
        if (ghostCourseKey() === key) {
          ghostBoardBusy = false;
          syncGhostRow();
        }
      }
    })();
  }

  function ghostListing() {
    try {
      const listing = inspectCourse();
      return listing && listing.shareId ? listing : null;
    } catch (e) {
      return null;
    }
  }

  /*
   * A course just became current: forget the last course's board data,
   * re-arm the persisted choice, and go looking for what the board holds.
   * The times fetch is a nicety with the same standing as the course list:
   * a board that is down means a picker with the two session modes and
   * nothing else, never a broken menu.
   */
  function ghostCourseChanged() {
    ghostRecorder.abort();
    ghostLap = null;
    ghostChased = null;
    ghostGap = null;
    ghostBoardTimes = null;
    ghostBoardLap = null;
    ghostBoardBusy = false;
    ghostPrev.valid = false;
    ghostRig.setPresence(0);
    ghostChoice = normalizeGhostChoice(ui.settings.ghost);
    syncGhostRow();
    const listing = ghostListing();
    if (!listing || race.freestyle) {
      return;
    }
    const key = ghostCourseKey();
    (async () => {
      try {
        const times = await fetchTrackTimes(listing.shareId, listing.board);
        if (ghostCourseKey() !== key) {
          return;
        }
        /* The five fastest recorded laps are plenty of rivals for one
         * menu row; the full table lives on the board page. */
        ghostBoardTimes = times.filter((t) => t.hasGhost && t.id).slice(0, 5);
        syncGhostRow();
        if (ghostQueryId) {
          const wanted = ghostQueryId;
          ghostQueryId = '';
          if (times.some((t) => t.id === wanted && t.hasGhost)) {
            ghostChoice = `board:${wanted}`;
            loadBoardGhost(wanted);
          }
        }
      } catch (e) {
        /* No board today. The session modes still work. */
      }
    })();
  }

  /*
   * Per frame, after the race has scored the travel. Records the running
   * lap, closes the recording at the line, arms the next chase, and reads
   * the gap at each gate. lapStartBefore and lapsBefore are the race's
   * state from before this frame's update, which is how a lap boundary is
   * seen without the race having to announce one.
   */
  function ghostOnRaceStep(simNow, nowWall, lapStartBefore, lapsBefore, passedAny) {
    if (race.freestyle) {
      return;
    }
    const lapDone = race.laps.length > lapsBefore;
    /*
     * The gap, read at the gate just crossed, BEFORE any re-arm below:
     * your split against the split of the ghost you were actually chasing
     * this lap. Reading it after the re-arm compared a finishing lap with
     * itself, which is a proud zero every time it sets a best.
     */
    if (passedAny && ghostLap && lapStartBefore != null) {
      let mine = null;
      let theirs = null;
      if (lapDone) {
        mine = race.lastLapMs;
        theirs = ghostLap.durationMs;
      } else if (race.splits.length) {
        const k = race.splits.length - 1;
        mine = race.splits[k];
        theirs = ghostLap.splitMs(k);
      }
      if (mine != null && theirs != null) {
        ghostGap = { deltaMs: mine - theirs, final: lapDone, untilWall: nowWall + 2800 };
      }
    }
    if (lapDone) {
      /* Close the finished lap. Its own clock ran up to lastLapMs; this
       * frame's pose sits just past the line on that clock, and feeding it
       * before finishing is what lets the stored tail cross the line at
       * speed instead of freezing on it. */
      const tOld = (simNow - race.lapStartMs) + race.lastLapMs;
      ghostRecorder.push(tOld, pCurr.x, pCurr.y, pCurr.z, qPrev.x, qPrev.y, qPrev.z, qPrev.w);
      const lapRecord = ghostRecorder.finish(race.lastLapMs, race.lastSplits);
      ghostBook.keep(ghostCourseKey(), lapRecord);
      /* Who this lap was flown against, for the results line. The re-arm
       * below may replace ghostLap with the lap just recorded. */
      ghostChased = ghostLap;
      syncGhostRow();
    }
    if (race.lapStartMs != null && race.lapStartMs !== lapStartBefore) {
      /* A lap just began, at the crossing this frame contains. */
      ghostRecorder.begin();
      if (ghostPrev.valid) {
        ghostRecorder.push(
          ghostPrev.simMs - race.lapStartMs,
          ghostPrev.x, ghostPrev.y, ghostPrev.z,
          ghostPrev.qx, ghostPrev.qy, ghostPrev.qz, ghostPrev.qw,
        );
      }
      ghostRecorder.push(
        simNow - race.lapStartMs,
        pCurr.x, pCurr.y, pCurr.z,
        qPrev.x, qPrev.y, qPrev.z, qPrev.w,
      );
      armGhost();
    } else if (race.lapStartMs != null) {
      ghostRecorder.push(
        simNow - race.lapStartMs,
        pCurr.x, pCurr.y, pCurr.z,
        qPrev.x, qPrev.y, qPrev.z, qPrev.w,
      );
    }
  }

  /* The chase itself: pose the rig at the ghost's own lap time, fade it in
   * off the line, out past its finish, and down across a recorded crash
   * recovery. Runs every frame; zero presence parks the whole group. */
  function ghostFrame(simNow) {
    const running = ghostLap && !race.freestyle && race.lapStartMs != null
      && (mode === 'flight' || mode === 'paused');
    if (!running) {
      ghostRig.setPresence(0);
      return;
    }
    const t = simNow - race.lapStartMs;
    const tail = ghostLap.durationMs - t;
    let presence = 1;
    if (t < 400) {
      presence = t / 400;
    }
    if (tail < 0) {
      presence = Math.max(0, 1 + tail / 400);
    }
    if (ghostSampleInto(t)) {
      presence = Math.min(presence, 0.15);
    }
    ghostRig.group.position.set(ghostSample.px, ghostSample.py, ghostSample.pz);
    ghostRig.group.quaternion.set(ghostSample.qx, ghostSample.qy, ghostSample.qz, ghostSample.qw);
    ghostRig.setPresence(presence);
    /* The rig is session lived and the scene is not: whichever scene holds
     * the hero craft holds the ghost, checked here rather than at the swap
     * so no load path can strand it in a disposed world. */
    if (presence > 0 && shell.quad.parent && ghostRig.group.parent !== shell.quad.parent) {
      shell.quad.parent.add(ghostRig.group);
    }
  }

  function ghostSampleInto(t) {
    ghostLap.sample(t, ghostSample);
    return ghostSample.cut;
  }

  /* One sentence for the results screen when a ghost was being chased:
   * whether the run's best lap beat it, and by how much. ghostChased, not
   * ghostLap: by the time results show, the finish line has re-armed the
   * chase, and a run that just set a best would be compared with itself. */
  function ghostResultNote() {
    if (!ghostChased) {
      return null;
    }
    const best = race.bestLapMs();
    if (best == null) {
      return null;
    }
    const who = ghostChased.source === 'board'
      ? (ghostChased.name || 'the board lap')
      : ghostChased.label.toLowerCase();
    const d = best - ghostChased.durationMs;
    if (Math.abs(d) < 10) {
      return `Level with the ghost, ${who} at ${formatTime(ghostChased.durationMs)}.`;
    }
    if (d < 0) {
      return `You beat the ghost, ${who} at ${formatTime(ghostChased.durationMs)}, by ${(Math.abs(d) / 1000).toFixed(2)}.`;
    }
    return `The ghost, ${who} at ${formatTime(ghostChased.durationMs)}, stayed ${(d / 1000).toFixed(2)} ahead.`;
  }

  /* The recording of a finished lap whose time is being uploaded, as wire
   * base64, or null when this session holds no recording of that exact
   * lap. Previous is checked before best: the two can share a duration,
   * and then either encoding is the same lap. */
  function ghostForUpload(lapMs) {
    const key = ghostCourseKey();
    for (const lap of [ghostBook.previous(key), ghostBook.best(key)]) {
      if (lap && Math.round(lap.durationMs) === Math.round(lapMs)) {
        return ghostToBase64(encodeGhost(lap));
      }
    }
    return null;
  }

  /* Best laps are only comparable on the same config, pack voltage and
   * flight style: an arcade lap is flown on a different aircraft and
   * must not sit in an expert record. Expert keeps the bare key so every
   * record set before the style existed stays exactly where it was. */
  function recordKey() {
    let h = 5381;
    for (let i = 0; i < configText.length; i += 1) {
      h = ((h * 33) ^ configText.charCodeAt(i)) >>> 0;
    }
    const style = runStyle === 'arcade' ? '.arcade' : '';
    return `webfpv.best.${h.toString(16)}.${runVoltage.toFixed(2)}${style}`;
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
  let clipCrashUntil = 0;
  let clipCrashKind = '';
  let clipGraceUntil = 0;
  /* Wall clock of the last land or takeoff blip. See GROUND_CUE_GAP_MS. */
  let groundCueAtWall = -1e9;
  /* Wall clock the departure window closes at. See TAKEOFF_WINDOW_MS. */
  let takeoffUntil = 0;
  const clipWatch = makeClipWatch();
  /* Turtle is a shell pose flip, not the crashflip mixer. crashflipOn
   * is true while waiting inverted or while the flip is playing, so OSD
   * and the banner can keep saying Turtle. The mixer stays off. */
  let crashflipOn = false;
  let turtleWait = false;
  const turtleFlip = {
    active: false,
    simMs0: 0,
    qw0: 1, qx0: 0, qy0: 0, qz0: 0,
    qw1: 1, qx1: 0, qy1: 0, qz1: 0,
    wx: 0, wz: 0, surfaceY: 0,
  };
  const turtleQ = [0, 0, 0, 0];
  /* After the flip, ignore pitch/roll until the stick recentres.
   * Otherwise airmode inherits the poke and yanks the hull. */
  let turtleRecover = false;
  let turtleResumeGate = false;
  /* Obstacle roofs (train, deck) are not sim_ground_contacts. */
  let turtleOnSupport = false;
  /* sim_motor_override(all, 0) while parked, cleared on unpark. rest()
   * does not zero motor_omega, and hot rotors yank when the wait ends. */
  let turtleParkMotors = false;
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
  /* Capture hold: keep the plant pose and FPV lens as seated, without
   * the parked overlay or the intro orbit. Used by __seatCraft so a
   * camera-down crash can be photographed before the hull tumbles. */
  let poseLock = false;
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
  let lastGroundHits = 0;
  let lastClearance = 1;
  let lastUpz = 1;
  let lastFpvY = 0;
  let lastCamFloor = 0;
  let lastCamClear = 0;
  let lastCamFwdY = 0;
  let lastCamUpY = 0;
  let lastClosing = 0;
  /* How square the last contact was to the craft's disc plane, 0 edge on
   * and 1 belly on. Readback only: the impulse the solver applied is what
   * sizes the sound and the shake now, not a speed threshold. */
  let lastUpDot = 0;
  let speedNow = 0;
  /* How many contacts this run has bounced off, for the readback and for
   * nothing else. It used to be a count DOWN from three lives; there is no
   * damage model any more, so it counts up and costs nothing. */
  let bounceCount = 0;
  let bounceAtWall = 0;
  /* Real Betaflight crashflip, held by the pilot. Distinct from
   * crashflipOn, which belongs to the scripted turtle. */
  let manualFlip = false;
  /*
   * How often the solid world is resolved, in SIM milliseconds.
   *
   * Four is 250 Hz. It is a count of 1 ms plant steps and never a frame
   * delta, so the cadence, and therefore the trajectory, is the same
   * whether the host delivered those steps in one batch of sixteen or in
   * four batches of four. That is the whole point: CLAUDE.md says a
   * dropped frame must change nothing about the trajectory, and while
   * contact ran per frame it changed everything about it.
   *
   * Four rather than one because the query is not free and one buys
   * nothing: the sweep is exact, so it cannot tunnel at 250 Hz any more
   * than at 1000 Hz, and 4 ms of travel at racing speed is 12 cm, well
   * inside the swept test. Four rather than sixteen because the slide
   * continuation and the depenetration both get finer as the step
   * shrinks, and 250 Hz is where that stopped being visible.
   */
  const OBSTACLE_STEP = 4;
  let obsPhase = 0;
  /* Facts the contact pass accumulates for the frame that contains it:
   * the shell reads these once, after stepping, for the clip watch, the
   * sound and the shake. */
  let obsResolved = false;
  let obsContact = false;
  let obsLeftover = false;
  let obsInterior = 0;
  let obsRoof = false;
  let obsImpulse = 0;
  let obsImpulseKind = '';
  /*
   * THE HULL MET A SOLID, and how fast it was closing when it did.
   *
   * obsImpulse is what the SOLVER changed, and on a vertical face that is
   * not the same question. Measured on the training wall, flown into it
   * head on: a 4.0 m/s approach resolved to a dv of 0.09 m/s and a 9.7
   * m/s approach to nothing at all, because the sweep clamps the travel
   * at the face and there is little normal velocity left by the time
   * sim_contact_at runs. A tap keyed off that number is a tap that never
   * happens, which is why no wall trick in the catalogue could fire.
   *
   * obsTouched is set by the sweep itself, so it is true whenever the hull
   * actually reached a solid, and obsClosing is the approach speed along
   * the face normal, which is the number GRAZE_SPEED_MAX was written
   * about: a deliberate tap is slow, a smack is not.
   */
  let obsTouched = false;
  let obsClosing = 0;
  /* Harness: skip the draw so a probe can fly at frame rate rather than at
   * the town's draw rate. See window.__drawOff. */
  let harnessNoDraw = false;
  /*
   * Its own cooldown, so the recogniser's window is not shared with the
   * audio cue's and one cannot swallow the other.
   *
   * ON THE SIM CLOCK, not the wall clock. Everything downstream of this is a
   * game rule: it decides whether a contact reaches the recogniser at all,
   * and therefore whether a Wall Tap is a Wall Tap. A cooldown measured in
   * wall milliseconds spends a different number of contacts on a machine
   * running at 30 fps and one running at 144, which is exactly the frame
   * rate dependence CLAUDE.md keeps out of the game. The audio cue below
   * stays on the wall clock, because a cue is a cue.
   */
  let trickTouchAtSimMs = -1e9;
  /*
   * WHICH BRANCH OF THE CONTACT PASS A HIT TOOK. Three integers on a path
   * that only runs when something was actually touched. They exist because
   * a craft flown into the training wall at 11 m/s stopped dead and the
   * game saw nothing at all: no bounce, no impulse, no bump, no crash, and
   * therefore no Wall Tap. Telling "never swept the wall" from "swept it
   * and took the buried branch" needs the counters, not a guess.
   */
  /*
   * `inbound` and `outbound` count the sign of the contact normal against the
   * plant's own velocity, in the PLANT's frame, which is the only place the
   * conversion can be checked. A healthy run is nearly all inbound: a normal
   * points out of the solid, so it opposes a craft arriving at it. A run that
   * is mostly outbound is the spawn rotation missing from a direction, which
   * is what welded the craft to the town's walls. See worldDirToSim.
   *
   * `resting` is a contact the plant declined because there was no approach
   * speed left to solve, which is the ordinary state of a hull sliding along
   * a face. It is not a failure and it no longer ends the pass.
   */
  const passStats = {
    buried: 0,
    sepFail: 0,
    resolved: 0,
    dvZero: 0,
    resting: 0,
    inbound: 0,
    outbound: 0,
    kind: '',
    code: -1,
    e: 0,
    mu: 0,
  };
  let obsHasPrev = false;
  /* The last impulse announced, so a harder hit inside the cooldown is
   * still heard: a graze followed by the wall behind it is two events. */
  let lastImpulse = 0;
  /* Previous frame's sim clock, for anything measured in sim milliseconds
   * rather than wall ones. See the clip watch. */
  let simClockPrevMs = 0;
  /* Wall clock until which a recover-in-place is allowed to settle. */
  let recoverGraceUntil = 0;
  /* The last ground skip, so a craft sliding along the grass reports one
   * bounce rather than one a frame. */
  let groundBounceAtWall = 0;
  let bounceHitIndex = -1;
  let bounceHitKind = '';
  /* The craft's tilt-aware vertical half extent, written by the physics
   * branch each frame and read by the obstacle query later in the same
   * frame. Starts level. */
  let vHalfFrame = craftVerticalHalf(0);
  let airtimeMs = 0;
  /* The freestyle run's clock, as the OSD reads it. Written once a frame
   * from score.view() just above setOsd, so the readout is this frame's
   * rather than the previous one's. */
  let scoreState = 'ready';
  let scoreRemainMs = 0;
  let fps = 0;
  let camTilt = ui.settings.cameraAngle;
  let runVoltage = ui.settings.packVoltage;
  /* The flight style the CURRENT run is flown on. Applied only between
   * runs, same rule as the pack voltage, so a mid run settings visit
   * cannot change the physics under a lap in progress. */
  let runStyle = ui.settings.flightStyle === 'arcade' ? 'arcade' : 'expert';
  let notice = null; /* { text, untilMs } for one off shell messages */
  /* The seated world's own note, waiting for a flight to be said over. See
   * showCourseNotes. */
  let heldNotes = null;
  let padPickReturn = 'title';
  /* How many laps THIS run lasts. Settings.laps can change from pause, and
   * reading it live used to end a 5 lap run the moment someone dropped the
   * setting to 1. */
  let runLaps = ui.settings.laps;
  race.setRecordKey(recordKey());
  ui.setBest(race.bestMs, view.mode);

  /*
   * The world's own note, as a timed banner, and NOT OVER A MENU.
   *
   * This is the second go at that rule. The first said not over the GATE,
   * because on a browser with nothing built the note printed "Nothing has
   * been built yet, open the track builder" across the two cards before the
   * pilot had chosen to race at all. Holding it until the gate was answered
   * moved the problem one screen along rather than fixing it: it landed on
   * the title menu, and on the Freestyle picker, in amber, across four world
   * cards. Reported twice, with a screenshot of each.
   *
   * A BANNER IS A FLIGHT MESSAGE. The frame loop already says so and blanks
   * the banner on any screen that is up. Every other thing that reaches the
   * banner is raised BY a pilot doing something on the screen they are
   * looking at, and belongs there: a publish, an upload, a tune that would
   * not load. This one is raised when a WORLD LOADS, which is nobody asking
   * a question, and it was the only thing jumping that queue.
   *
   * So it is held until there is a flight to say it over, and its clock
   * starts then rather than when the world loaded. Held rather than dropped,
   * because the note is worth saying to the pilot about to fly that world
   * and worth nothing at all to the one reading a menu.
   */
  function showCourseNotes() {
    heldNotes = view.notes && view.notes.length ? view.notes.join('\n') : null;
  }
  showCourseNotes();

  function plantUpZ(st) {
    const x = st[8];
    const y = st[9];
    const u = 1 - 2 * (x * x + y * y);
    if (u > 1) {
      return 1;
    }
    return u < -1 ? -1 : u;
  }

  function plantRateMag(st) {
    return Math.sqrt(st[11] * st[11] + st[12] * st[12] + st[13] * st[13]);
  }

  function turtleKeysHeld() {
    return input.keys.has('ArrowUp')
      || input.keys.has('ArrowDown')
      || input.keys.has('ArrowLeft')
      || input.keys.has('ArrowRight');
  }

  function turtleStickHeld(roll, pitch) {
    if (turtleKeysHeld()) {
      return true;
    }
    if (input.isTouchPrimary() && (roll > 0.08 || roll < -0.08 || pitch > 0.08 || pitch < -0.08)) {
      return true;
    }
    return (roll * roll + pitch * pitch) >= TURTLE_STICK_MIN * TURTLE_STICK_MIN;
  }

  function dumpTurtleIterm() {
    sim.e.sim_set_crashflip(1);
    sim.e.sim_set_crashflip(0);
  }

  function turtleSupportY(wx, wy, wz) {
    /* Terrain when the hull is on it or within the clearance halo, so a
     * halo entry seats on the grass instead of freezing on a sliver of
     * air. An obstacle rest (car roof, kerb-height box, deck the height
     * query cannot see) keeps its own height: the street below is not
     * its support, and seating a low-obstacle turtle on the terrain
     * would bury the hull inside the collider it rests on. */
    const hy = view.height(wx, wz, wy - SURFACE_BIAS);
    if (lastGroundHits > 0 || (!turtleOnSupport && wy - hy < TURTLE_CLEARANCE)) {
      return hy;
    }
    return wy - REST_HEIGHT;
  }

  function setCrashflip(on) {
    if (on) {
      beginTurtleWait();
      return;
    }
    turtleWait = false;
    turtleFlip.active = false;
    turtleResumeGate = false;
    if (crashflipOn) {
      const ch = input.channels;
      turtleRecover = turtleStickHeld(ch.roll, ch.pitch);
    }
    crashflipOn = false;
    sim.e.sim_set_crashflip(0);
  }

  function setTurtleParkMotors(on) {
    const next = Boolean(on);
    if (next === turtleParkMotors) {
      return;
    }
    turtleParkMotors = next;
    sim.motorOverride(-1, next ? 0 : -1);
  }

  const turtleRcOut = [0, 0];
  function turtleAxes(roll, pitch) {
    /* Keyboard analogMag ramps. A held arrow while waiting is a poke,
     * same as a radio stick at the stop. Touch gets the same once the
     * pad has moved, so a timid thumb still turtles. */
    if (turtleWait || turtleFlip.active) {
      if (input.keys.has('ArrowRight')) {
        roll = 1;
      } else if (input.keys.has('ArrowLeft')) {
        roll = -1;
      } else if (input.isTouchPrimary() && roll > 0.08) {
        roll = 1;
      } else if (input.isTouchPrimary() && roll < -0.08) {
        roll = -1;
      }
      if (input.keys.has('ArrowDown')) {
        pitch = 1;
      } else if (input.keys.has('ArrowUp')) {
        pitch = -1;
      } else if (input.isTouchPrimary() && pitch > 0.08) {
        pitch = 1;
      } else if (input.isTouchPrimary() && pitch < -0.08) {
        pitch = -1;
      }
    }
    turtleRcOut[0] = roll;
    turtleRcOut[1] = pitch;
    return turtleRcOut;
  }

  function turtleHoldStick(roll, pitch) {
    if (!turtleRecover) {
      return false;
    }
    if (!turtleStickHeld(roll, pitch)) {
      turtleRecover = false;
      return false;
    }
    return true;
  }

  function applyTurtleRc(roll, pitch) {
    const ax = turtleAxes(roll, pitch);
    if (turtleHoldStick(ax[0], ax[1])) {
      turtleRcOut[0] = 0;
      turtleRcOut[1] = 0;
    }
    return turtleRcOut;
  }

  /*
   * REAL CRASHFLIP, HELD, at any attitude.
   *
   * Betaflight's flip-over-after-crash is compiled in and the ABI has
   * driven it since the plant learned about the ground, but the pilot has
   * never been able to reach it: setCrashflip(true) starts the SCRIPTED
   * turtle instead, and that only latches from a genuine inverted rest
   * (shouldEnterTurtle wants upz past -0.35, under 1 m/s and under
   * TURTLE_RATE). Wedged on its side, or winding itself up against a
   * wall, the craft satisfies none of those, so the one escape the pilot
   * had was closed exactly where it was needed. That is the second half
   * of the owner's "i can't turtle out nor can i right it".
   *
   * So this is the real thing, on a held key: the mixer path from
   * mixer.c, driven by the pitch and roll sticks, spinning the high
   * motors to walk the machine out of wherever it is. It is not a
   * scripted animation and it does not choose an attitude for you; it is
   * the same control a pilot has on a real quad, and like the real one it
   * does nothing useful in the air.
   *
   * The scripted turtle keeps the ground it already holds: while a wait
   * or a flip is running it owns crashflipOn, and this stays out.
   */
  function setManualFlip(on) {
    if (on === manualFlip) {
      return;
    }
    if (on) {
      if (turtleWait || turtleFlip.active || landed || launchStaging || poseLock || crashed) {
        return;
      }
      manualFlip = true;
      /* I-term is dumped on both edges for the reason the scripted path
       * dumps it: a PID wound up against a wall yanks the craft the
       * moment the mixer hands control back. */
      dumpTurtleIterm();
      sim.e.sim_set_crashflip(1);
      return;
    }
    manualFlip = false;
    sim.e.sim_set_crashflip(0);
    dumpTurtleIterm();
  }

  /* Polled rather than edge-triggered so the key behaves as a hold, and so
   * that letting go during a pause or a menu cannot leave the mixer
   * latched. */
  function pollManualFlip() {
    const want = mode === 'flight'
      && ui.screen === 'flight'
      && !turtleWait
      && !turtleFlip.active
      && !landed
      && !launchStaging
      && !poseLock
      && !crashed
      && input.keys.has('KeyT');
    setManualFlip(want);
  }

  function turtleStickMag() {
    const smp = rcPending.length ? rcPending[rcPending.length - 1] : null;
    const roll = smp ? smp.roll : input.channels.roll;
    const pitch = smp ? smp.pitch : input.channels.pitch;
    const ax = turtleAxes(roll, pitch);
    return Math.sqrt(ax[0] * ax[0] + ax[1] * ax[1]);
  }

  /*
   * WHAT A HIT IS NOW, instead of a line of text.
   *
   * The banners are gone on the owner's instruction: "remove all the words
   * on screen that tell me i've hit something, the sound should be enough
   * as well as the feeling of impact." That puts the whole message on the
   * sound and the camera, so both have to carry it, and neither did.
   *
   * The sound was a two-way switch, 'crash' over 18 m/s and 'clip' under
   * it, with everything below 4 m/s silent. As the only channel left that
   * is a poor instrument: a gate brush and a wall at speed picked one of
   * two samples. It is continuous now, from the same number the physics
   * used, so a hard hit sounds hard.
   *
   * The camera did nothing at all. There was no impact kick anywhere in
   * the shell: makeLensShake reads rotor speed and nothing else. A real
   * hit throws the whole airframe, and the FPV camera is bolted to it, so
   * the picture moves. That is `impactKick`, decayed per frame and added
   * to the lens shake where it already lands on the camera.
   *
   * And the blades: a spinning 5 inch that meets a wall does not carry
   * its rotor speed through the contact. sim_prop_strike takes it out, so
   * a wall tap costs a beat of thrust and the pilot feels the sag while
   * the motors spin back up. That is a physics consequence rather than an
   * effect, which is why it is here and not in the renderer.
   *
   * `scale` is metres per second: for an obstacle it is the impulse the
   * solver actually applied, for the ground it is the arrival speed.
   */
  const IMPACT_FULL = 12.0;     /* m/s of impulse that reads as a full hit */
  const IMPACT_KICK_RAD = 0.075;
  const IMPACT_DECAY_HZ = 9;
  const IMPACT_PROP_MAX = 0.28; /* most of the rotor speed a hit can take */
  const impactKick = { x: 0, y: 0, z: 0 };
  let impactSeed = 0;

  function feelImpact(scale, kind) {
    if (!(scale > 0)) {
      return;
    }
    const nowHit = performance.now();
    /*
     * Just respawned, or just recovered: whatever the hull is overlapping is
     * left over from being put there, whether it is the grass, a stand, a
     * pole or a wing it was seated inside. Nothing sounds.
     *
     * The spawn half is gated on `landed`, matching the one the clip watch
     * already uses, because leftover overlap is a property of SITTING in
     * something. Ungated it swallowed half a second of genuine impacts on
     * every restart, which on a short course is a real gate hit gone quiet.
     * The departure itself is covered below, by kind and on a clock.
     */
    if ((nowHit < clipGraceUntil && landed) || nowHit < recoverGraceUntil) {
      return;
    }
    /*
     * On a stand the ground plane is switched off and the module holds the
     * pose, so any impulse at all is the constraint and not a contact.
     */
    if (launchStaging) {
      return;
    }
    /*
     * LEAVING THE GROUND IS STILL GROUND CONTACT, and only ground contact.
     * The plant is touching the pad for tens of milliseconds after the
     * perch lifts and the departure closes faster than GRAZE_SPEED_MAX on
     * those frames: that is a takeoff, not a crash. The window is on the
     * wall clock as well as on the flag because the flag is cleared in the
     * same frame as the branch that calls this, thirty lines earlier.
     *
     * A GATE IS NOT EXEMPT. 8ebd6b8 muted every kind here, so a pilot who
     * punched off the line and put a wing through the first gate heard
     * nothing. The pad is a height field deck, not a collider: the bang
     * this mutes has always been kind 'ground', so that is all it mutes.
     */
    if (kind === 'ground' && (takingOff || nowHit < takeoffUntil)) {
      return;
    }
    let u = scale / IMPACT_FULL;
    if (u > 1) {
      u = 1;
    }
    if (typeof audio.event === 'function') {
      /* Still two cues, because there are two samples, but the level and
       * the choice now come off the impulse rather than off a speed the
       * contact may never have had. */
      audio.event(u > 0.45 ? 'crash' : 'clip', null, u);
    }
    /* A kick about all three camera axes. The sign walks so two hits in a
     * row do not throw the picture the same way; it is a render effect and
     * touches nothing the plant reads. */
    impactSeed = (impactSeed + 1) & 3;
    const s0 = (impactSeed & 1) ? 1 : -1;
    const s1 = (impactSeed & 2) ? 1 : -1;
    const a = IMPACT_KICK_RAD * u;
    impactKick.x += a * s0;
    impactKick.y += a * 0.7 * s1;
    impactKick.z += a * 0.8 * s0 * s1;
    /* Blades only: the ground already has its own contact model and a
     * belly landing does not spin the props down. */
    if (kind !== 'ground' && typeof sim.e.sim_prop_strike === 'function') {
      sim.e.sim_prop_strike(IMPACT_PROP_MAX * u);
      stateCurr = readState();
    }
    if (u > 0.25) {
      padRumble(u);
    }
  }

  /* Gamepad haptics, where the browser has them. Guarded to the point of
   * paranoia: vibrationActuator is not in every engine, the shapes differ,
   * and a rejected promise here would take the frame loop with it. */
  function padRumble(u) {
    try {
      const pad = input.firstGamepad();
      const act = pad && pad.vibrationActuator;
      if (!act || typeof act.playEffect !== 'function') {
        return;
      }
      const p = act.playEffect('dual-rumble', {
        startDelay: 0,
        duration: Math.round(60 + 140 * u),
        weakMagnitude: Math.min(1, 0.3 + 0.7 * u),
        strongMagnitude: Math.min(1, u),
      });
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch (err) {
      void err;
    }
  }

  function decayImpactKick(dtMs) {
    const k = Math.exp(-(dtMs > 0 ? dtMs : 0) / 1000 * 2 * Math.PI * IMPACT_DECAY_HZ);
    impactKick.x *= k;
    impactKick.y *= k;
    impactKick.z *= k;
  }

  function turtleInContact() {
    return lastGroundHits > 0 || turtleOnSupport;
  }

  function turtleCueSource() {
    if (input.isTouchPrimary()) {
      return 'touch';
    }
    if (input.isKeyboardPrimary()) {
      return 'keys';
    }
    if (input.firstGamepad()) {
      return 'radio';
    }
    return 'keys';
  }

  function turtleBannerText() {
    if (turtleFlip.active) {
      return 'TURTLE MODE';
    }
    if (turtleRecover && !turtleWait && !turtleFlip.active) {
      const src = turtleCueSource();
      if (src === 'touch') {
        return 'Let go of the right pad, then fly';
      }
      if (src === 'radio') {
        return 'Centre the right stick, then fly';
      }
      return 'Let go of the arrows, then fly';
    }
    const src = turtleCueSource();
    if (src === 'touch') {
      return 'TURTLE MODE\nRight pad\nPitch or roll to flip over';
    }
    if (src === 'radio') {
      return 'TURTLE MODE\nRight stick\nPitch or roll to flip over';
    }
    return 'TURTLE MODE\nArrow keys\nPitch or roll to flip over';
  }

  function pollTurtleSupport() {
    if (!stateCurr || launchStaging) {
      turtleOnSupport = false;
      return;
    }
    poseFromState(stateCurr, pProbe);
    lastClearance = pProbe.y - view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS);
    raiseGroundFromState(stateCurr);
    lastGroundHits = sim.e.sim_ground_contacts();
    turtleOnSupport = lastGroundHits > 0;
    if (turtleOnSupport || !view.colliders || plantUpZ(stateCurr) >= TURTLE_INVERT_UPZ) {
      return;
    }
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qCollide);
    qCollide.premultiply(qSpawn);
    const k = view.colliders.hit(
      pProbe.x, pProbe.y, pProbe.z,
      pProbe.x, pProbe.y, pProbe.z,
      vHalfFrame,
      qCollide.x, qCollide.y, qCollide.z, qCollide.w,
    );
    if (k >= 0 && view.colliders.hitNy > 0.5) {
      turtleOnSupport = true;
    }
  }

  function isTurtleParked() {
    return turtleWait || turtleFlip.active;
  }

  function noteTurtleState(st) {
    lastUpz = plantUpZ(st);
    const uClamp = lastUpz > 1 ? 1 : lastUpz < -1 ? -1 : lastUpz;
    lastTiltDeg = (Math.acos(uClamp) * 180) / Math.PI;
    speedNow = Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);
    return st;
  }

  function plantSpeed(st) {
    return Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);
  }

  function applyTurtleFlipPose(u) {
    const e = turtleFlipEase(u);
    turtleSlerpQuat(
      turtleFlip.qw0, turtleFlip.qx0, turtleFlip.qy0, turtleFlip.qz0,
      turtleFlip.qw1, turtleFlip.qx1, turtleFlip.qy1, turtleFlip.qz1,
      e, turtleQ,
    );
    const lift = turtleFlipLift(u);
    worldPosToSim(
      turtleFlip.wx,
      turtleFlip.surfaceY + REST_HEIGHT + lift,
      turtleFlip.wz,
      pSim,
    );
    const code = sim.e.sim_set_pose(
      pSim.x, pSim.y, pSim.z,
      turtleQ[0], turtleQ[1], turtleQ[2], turtleQ[3],
    );
    if (code !== SIM_OK) {
      throw new Error(`sim_set_pose: ${simErrorName(code)}`);
    }
    sim.rest();
    stateCurr = readState();
    statePrev = stateCurr;
    return noteTurtleState(stateCurr);
  }

  function beginTurtleFlip() {
    if (!stateCurr || turtleFlip.active) {
      return;
    }
    const st = stateCurr;
    const q1 = uprightPlantQuat(st[7], st[8], st[9], st[10]);
    poseFromState(st, pProbe);
    turtleWait = false;
    turtleFlip.active = true;
    turtleFlip.simMs0 = simTimeMs;
    turtleFlip.qw0 = st[7];
    turtleFlip.qx0 = st[8];
    turtleFlip.qy0 = st[9];
    turtleFlip.qz0 = st[10];
    turtleFlip.qw1 = q1[0];
    turtleFlip.qx1 = q1[1];
    turtleFlip.qy1 = q1[2];
    turtleFlip.qz1 = q1[3];
    turtleFlip.wx = pProbe.x;
    turtleFlip.wz = pProbe.z;
    turtleFlip.surfaceY = turtleSupportY(pProbe.x, pProbe.y, pProbe.z);
    crashflipOn = true;
    turtleRecover = false;
    takingOff = false;
    landed = false;
    dumpTurtleIterm();
    setTurtleParkMotors(true);
    applyTurtleFlipPose(0);
    if (mode === 'flight' && typeof audio.event === 'function') {
      audio.event('clip');
    }
  }

  function finishTurtleFlip() {
    applyTurtleFlipPose(1);
    turtleWait = false;
    turtleFlip.active = false;
    crashflipOn = false;
    dumpTurtleIterm();
    const ch = input.channels;
    turtleRecover = turtleStickHeld(ch.roll, ch.pitch) || turtleResumeGate;
    turtleResumeGate = false;
    landed = true;
    takingOff = false;
    startPitch = 0;
    groundY = turtleFlip.surfaceY;
    lastClearance = REST_HEIGHT;
    setTurtleParkMotors(true);
    adoptSimClock();
    acc = 0;
    noteTurtleState(stateCurr);
    if (mode === 'flight' && typeof audio.event === 'function') {
      audio.event('land');
    }
  }

  function beginTurtleWait(hold) {
    if (!stateCurr || poseLock || turtleWait || turtleFlip.active) {
      return;
    }
    if (launchStaging) {
      endLaunchStaging(false);
    }
    if (lcArmed) {
      applyLaunchSwitch(false);
    }
    turtleWait = true;
    crashflipOn = true;
    turtleRecover = false;
    takingOff = false;
    landed = false;
    flownThisRun = true;
    introMs = -1;
    parkedLift = PARKED_LIFT;
    turtleResumeGate = false;
    dumpTurtleIterm();
    rcPending.length = 0;
    poseFromState(stateCurr, pProbe);
    const hy = turtleSupportY(pProbe.x, pProbe.y, pProbe.z);
    worldPosToSim(pProbe.x, hy + REST_HEIGHT, pProbe.z, pSim);
    {
      const st = stateCurr;
      const code = sim.e.sim_set_pose(
        pSim.x, pSim.y, pSim.z, st[7], st[8], st[9], st[10],
      );
      if (code !== SIM_OK) {
        throw new Error(`sim_set_pose: ${simErrorName(code)}`);
      }
    }
    sim.rest();
    stateCurr = readState();
    statePrev = stateCurr;
    noteTurtleState(stateCurr);
    setTurtleParkMotors(true);
    /* A crash with the stick already over the poke gate flips immediately.
     * The capture hook passes hold so it can photograph the wait. */
    if (!hold && turtleStickMag() >= TURTLE_STICK_MIN) {
      beginTurtleFlip();
    }
  }

  function tryEnterTurtle(st, inContact) {
    if (!st || turtleWait || turtleFlip.active || poseLock) {
      return;
    }
    if (launchStaging) {
      if (plantUpZ(st) >= TURTLE_INVERT_UPZ) {
        return;
      }
      endLaunchStaging(false);
    }
    if (shouldEnterTurtle(
      plantUpZ(st),
      plantSpeed(st),
      plantRateMag(st),
      inContact,
      lastClearance,
      false,
    )) {
      beginTurtleWait();
    }
  }

  function stepTurtleFrozen(dt) {
    acc += dt;
    let steps = Math.floor(acc / MS_PER_STEP);
    acc -= steps * MS_PER_STEP;
    simTimeMs += steps * MS_PER_STEP;
    /* Upside down waiting to be turtled over is time passing, and the
     * recogniser has to agree with the sim clock about how much. See
     * TrickDetector.idle. */
    trickDetector.idle(steps * MS_PER_STEP);
    adoptSimClock();
    if (turtleResumeGate) {
      /* Touch overlay is hidden on pause, so poll falls through to
       * keyboard zeros for the first flight frame after Resume. That is
       * not a recentre. isTouchPrimary already requires the overlay, so
       * wait on the overlay itself. */
      const waitingForTouch = Boolean(touch)
        && typeof touch.active === 'function'
        && !input.firstGamepad()
        && !touch.active();
      if (!waitingForTouch && turtleStickMag() < TURTLE_STICK_MIN) {
        turtleResumeGate = false;
      }
    }
    if (!turtleResumeGate && turtleWait && turtleStickMag() >= TURTLE_STICK_MIN) {
      beginTurtleFlip();
    }
    if (turtleFlip.active) {
      const u = (simTimeMs - turtleFlip.simMs0) / TURTLE_FLIP_MS;
      if (u >= 1) {
        finishTurtleFlip();
      } else {
        applyTurtleFlipPose(u < 0 ? 0 : u);
      }
    } else if (turtleWait) {
      /* Frozen on whatever we sat on, grass or a car roof. Lost-contact
       * abort used terrain height and dropped object turtles after 80 ms.
       * A moving train is out of scope: they stay until they poke. */
      sim.rest();
      stateCurr = readState();
      statePrev = stateCurr;
      noteTurtleState(stateCurr);
      poseFromState(stateCurr, pProbe);
      lastClearance = pProbe.y - view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS);
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
   * Put the craft back at the start line. Hits no longer teleport the
   * craft: R is the pilot asking for a restart, not a recovery from a
   * lockout. `at` reseats the spawn when the map itself moved.
   */
  function resetCraft(at) {
    if (at) {
      startX = at.x;
      startZ = at.z;
      startYaw = at.yaw;
      startPitch = 0;
      startY = at.y != null
        ? view.height(startX, startZ, at.y)
        : groundAt(startX, startZ);
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
    clipCrashUntil = 0;
    clipCrashKind = '';
    clipGraceUntil = performance.now() + CLIP_SPAWN_GRACE_MS;
    resetClipWatch(clipWatch);
    setCrashflip(false);
    manualFlip = false;
    sim.e.sim_set_crashflip(0);
    turtleRecover = false;
    turtleOnSupport = false;
    setTurtleParkMotors(false);
    poseLock = false;
    obsHasPrev = false;
    obsContact = false;
    obsTouched = false;
    obsClosing = 0;
    obsLeftover = false;
    obsInterior = 0;
    obsRoof = false;
    obsImpulse = 0;
    obsImpulseKind = '';
    obsPhase = 0;
    lastImpulse = 0;
    impactKick.x = 0;
    impactKick.y = 0;
    impactKick.z = 0;
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
    lastUpDot = 0;
    lastHitKind = 'none';
    groundCueAtWall = -1e9;
    takeoffUntil = 0;
    input.keys.clear();
    input.drain();
    input.resetKeyboardSticks();
    raceHasPrev = false;
    bounceCount = 0;
    bounceAtWall = 0;
    groundBounceAtWall = 0;
    bounceHitIndex = -1;
    bounceHitKind = '';
    /* The race interpolates a gate crossing between its own previous sim
     * time and this one. A respawn teleports the craft, so the segment
     * either side of it is not a flight path: leaving prevSimMs behind put
     * a crossing time somewhere in the gap. Nulling it makes the first
     * update after a recovery use simMs exactly. */
    race.prevSimMs = null;
    /* The ghost recorder must not interpolate across the same teleport: a
     * recovery mid-lap is a cut in the recording, held on the near side so
     * the replay's cut detector sees one impossible segment, not a glide.
     * The seed pose is stale for the same reason. */
    if (at) {
      ghostRecorder.cutHere();
    }
    ghostPrev.valid = false;
    groundHasPrev = false;
    statePrev = readState();
    stateCurr = statePrev;
  }

  /*
   * Clip-through and thrash catch. Freeze on the glitch pose so the banner
   * can say Crashed, then re-seat the craft in place: see finishClipCrash.
   */
  function beginClipCrash(kind, nowWall) {
    if (crashed) {
      return;
    }
    crashed = true;
    /* A bail, in the Tony Hawk sense: the open combo is lost rather than
     * banked, and the workbook's streak multiplier goes back to one. The
     * detector's buffer goes too, or a half roll from before the crash
     * would pair with a half roll after it into a trick nobody flew.
     * Guarded on the mode like the two ground paths, so a race map never
     * touches the scorer at all rather than relying on there being nothing
     * for it to touch. */
    if (view.mode === 'freestyle') {
      trickDetector.reset();
      score.crash();
    }
    clipCrashKind = kind;
    clipCrashUntil = nowWall + CLIP_CRASH_HOLD_MS;
    setCrashflip(false);
    turtleRecover = false;
    turtleOnSupport = false;
    setTurtleParkMotors(false);
    sim.rest();
    stateCurr = readState();
    statePrev = stateCurr;
    acc = 0;
    race.recover('Crashed', nowWall);
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
    /* The same departure window feelImpact reads. This cue is the loudest
     * thing in the mix, it plays at full level with no scale, and it sat
     * outside the one guard the launch had. A glitch crash six frames off a
     * launch stand is a leftover overlap, not a crash. */
    if (typeof audio.event === 'function' && nowWall >= takeoffUntil) {
      audio.event('crash');
    }
  }

  /*
   * RECOVER IN PLACE, rather than back on the start line.
   *
   * This used to call reset(), which is what R does: adoptSpawn() back to
   * the map's own spawn and race.reset(), which empties `log`, `laps` and
   * the lap clock. So a mesh glitch, which is OUR bug and not a thing the
   * pilot did, cost them every completed lap of the run. The owner's
   * instruction is the other way round: "the system should register this
   * state and just reset the quad in place."
   *
   * So: pick the nearest clear air to where the accident happened, put the
   * craft there upright on its own heading, and leave the run alone. The
   * lap being flown keeps running, which is the right price. Nothing about
   * the race is touched, so `next`, the splits and the clock all carry on.
   *
   * Finding clear air is the whole of the work. Reseating inside the wall
   * the craft was stuck in would trip the same detector on the next frame
   * and put the pilot in a loop, which is worse than the glitch. Rise
   * first, because up is where a quad came from and where it wants to go,
   * and only then try the compass. A point is clear when the collider
   * sweep says so at a level attitude and it is above the terrain.
   */
  const RECOVER_RISE = [0.6, 1.2, 2.0, 3.0, 4.5];
  const RECOVER_OUT = [0, 1.0, 2.0, 3.5];
  const RECOVER_DIR = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

  function recoverSpotClear(x, y, z) {
    const surf = view.height(x, z, y - SURFACE_BIAS);
    if (!(y - surf > REST_HEIGHT)) {
      return false;
    }
    if (!view.colliders) {
      return true;
    }
    return view.colliders.hit(
      x, y, z, x, y, z,
      craftVerticalHalf(0),
      0, 0, 0, 1,
    ) < 0;
  }

  function findRecoverSpot(x, y, z, out) {
    for (let ri = 0; ri < RECOVER_OUT.length; ri += 1) {
      const out_r = RECOVER_OUT[ri];
      for (let li = 0; li < RECOVER_RISE.length; li += 1) {
        const lift = RECOVER_RISE[li];
        if (out_r === 0) {
          if (recoverSpotClear(x, y + lift, z)) {
            out.set(x, y + lift, z);
            return true;
          }
          continue;
        }
        for (let di = 0; di < RECOVER_DIR.length; di += 1) {
          const px = x + RECOVER_DIR[di][0] * out_r;
          const pz = z + RECOVER_DIR[di][1] * out_r;
          if (recoverSpotClear(px, y + lift, pz)) {
            out.set(px, y + lift, pz);
            return true;
          }
        }
      }
    }
    return false;
  }

  function finishClipCrash() {
    clipCrashUntil = 0;
    clipCrashKind = '';
    crashed = false;
    resetClipWatch(clipWatch);
    if (!findRecoverSpot(pCurr.x, pCurr.y, pCurr.z, pProbe)) {
      /* Nowhere within four and a half metres is clear. That is not a
       * glitch any more, it is a craft somewhere it cannot be put back,
       * so fall through to the old behaviour and give them the line. */
      reset();
      return;
    }
    /* Heading is kept: being spun to face north because a wall grabbed an
     * arm is its own disorientation, and the pilot was flying somewhere. */
    const yaw = craftHeadingYaw();
    const spotY = pProbe.y;
    resetCraft({ x: pProbe.x, z: pProbe.z, y: spotY, yaw });
    /*
     * resetCraft seats the spawn frame on the SURFACE under the point and
     * parks the craft on it, which is right on the start line and wrong
     * here: the clear air we found may be a storey above that surface, and
     * the surface itself may be inside whatever the craft was stuck in.
     * Lift the plant to the point that was actually checked. startY is the
     * surface, SPAWN_ALT is the parked offset the spawn already carries,
     * so the plant owes the difference.
     */
    const lift = (spotY - startY) - SPAWN_ALT;
    if (lift > 0) {
      const code = sim.e.sim_set_pose(0, 0, lift, 1, 0, 0, 0);
      if (code !== SIM_OK) {
        throw new Error(`sim_set_pose: ${simErrorName(code)}`);
      }
      sim.rest();
    }
    stateCurr = readState();
    statePrev = stateCurr;
    poseFromState(stateCurr, pCurr);
    /* Airborne, level, at rest, and the pilot has the sticks. */
    landed = false;
    takingOff = false;
    flownThisRun = true;
    groundY = startY;
    obsHasPrev = false;
    raceHasPrev = false;
    simClockPrevMs = simTimeMs;
    /* The watch has to be allowed to settle before it can fire again. The
     * spot was checked clear, but the terrain query and the collider sweep
     * are not the same test, and a recovery that instantly re-triggers is
     * a loop the pilot cannot leave, which is worse than the glitch. */
    recoverGraceUntil = performance.now() + CLIP_SPAWN_GRACE_MS;
    if (typeof audio.event === 'function') {
      audio.event('takeoff');
    }
  }

  /* The craft's heading, flattened onto the ground plane, as a spawn yaw.
   * Taken off the rendered attitude so it is the direction the pilot was
   * looking, not a plant axis. */
  function craftHeadingYaw() {
    if (!stateCurr) {
      return startYaw;
    }
    upAxis.set(0, 0, -1).applyQuaternion(qPrev);
    if (Math.abs(upAxis.x) < 1e-6 && Math.abs(upAxis.z) < 1e-6) {
      return startYaw;
    }
    return Math.atan2(-upAxis.x, -upAxis.z);
  }

  /* The first fault the frame loop threw, or null. See the frame boundary
   * for what it is for; it lives here so that reset(), which clears it, is
   * not reaching forward into a dead zone. */
  let frameFault = null;

  function reset() {
    /* A reset is the pilot taking the offer the fault banner made, so the
     * next fault is a new one and deserves to be reported in its turn. See
     * the frame boundary. */
    frameFault = null;
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
    /* Anything that holds a stamp ON that clock has to go back with it, or a
     * fresh run compares a zeroed clock against last run's stamp and stays
     * inside a cooldown that has already expired. */
    trickTouchAtSimMs = -1e9;
    /*
     * Everything else a reset does to the CRAFT is resetCraft's job, and it
     * used to be a verbatim copy of it, comments and all, which is the kind
     * of duplication that survives until the two drift and a crash recovery
     * starts clearing something a restart does not. Passing null keeps the
     * spawn adoptSpawn just set.
     */
    resetCraft(null);
    race.reset();
    /* A new run scores from nothing, and the detector's clock goes back to
     * zero with the sim clock above so the two agree about when a trick
     * happened. */
    /*
     * RE-READ EVERY RUN, not once at boot. A pilot switches between a
     * scored run and free flight from the Freestyle screen and then presses
     * fly, and a shape decided at construction would have kept whichever
     * one happened to be stored when the page loaded.
     */
    score.timed = ui.settings.freestyleRun !== 'free';
    score.reset();
    trickDetector.restart();
    ui.resetScore();
    /* A fresh run records from its own first crossing. The session book
     * keeps what earlier runs flew; only the in-flight recording dies. */
    ghostRecorder.abort();
    ghostGap = null;
    ghostChased = null;
    ghostRig.setPresence(0);
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
      ghostCourseChanged();
      mode = 'title';
      ui.show('title');
      ui.applyLocationHash();
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
    /* The world just changed, so what is worth flying around changed with
     * it. Once per map, never per run: it scans every collider. */
    rebuildObstacles();
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
     * setting of 'bogus' would leave view.id as 'custom' and the tail guard
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
    const STAY_SCREENS = ['pilot', 'quad', 'launch', 'rates', 'paused', 'title', 'credits'];
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
    applyPixelRatio(shell, wantQ, renderScaleOf(ui.settings));
    try {
      view = await loadMap(shell, wantId, loading, {
        quality: wantQ,
        renderScale: renderScaleOf(ui.settings),
      });
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
        applyPixelRatio(shell, previousGraphics, renderScaleOf(ui.settings));
        view = await loadMap(shell, previous, loading, {
          quality: previousGraphics,
          renderScale: renderScaleOf(ui.settings),
        });
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
    if (crashflipOn || turtleRecover) {
      return false;
    }
    if (lcAcroUntil === Infinity || (lcAcroUntil > 0 && performance.now() < lcAcroUntil)) {
      return false;
    }
    /* The thumb sticks are a proportional stick, so they are a RADIO here,
     * not a keyboard: they fly whichever mode the setting says. Keys keep
     * forcing angle because a key is a bang-bang input and acro on one is
     * a crash generator. */
    if (input.isTouchPrimary()) {
      return ui.settings.flightMode === 'angle';
    }
    /*
     * THE HARNESS OVERRIDE IS A GIMBAL, NOT A KEY.
     *
     * window.__stick writes a proportional channel straight into the poll
     * ladder, so it can hold a rate the way a radio does and the reason
     * keys force angle does not apply to it. It was landing on the
     * keyboard branch anyway, and ANGLE MODE CANNOT LOOP: the craft is
     * held to about thirty degrees of bank, so every probe that tried to
     * fly a Powerloop swept eighty three degrees of pitch in three seconds
     * of full back stick and flew away in a climb. That is why no check in
     * this repository had ever flown one of these tricks: every "verified"
     * loop was a path drawn by arithmetic and fed to the recogniser
     * directly, because the only thing that could actually FLY was locked
     * out of acro. A pilot on a radio is unaffected either way.
     */
    if (input.harnessChannels) {
      return ui.settings.flightMode === 'angle';
    }
    /*
     * FREESTYLE IS THE TRICK MODE, AND NO TRICK IS POSSIBLE IN ANGLE.
     *
     * Angle holds the craft to about thirty degrees of bank, so a pilot in
     * it cannot fly a Powerloop, a Split-S, a Matty Flip, an Orbit, a roll
     * or a flip: the entire catalogue is out of reach. Forcing it on the
     * keyboard therefore does not make freestyle safer for a key pilot, it
     * makes freestyle pointless for them, and a scoring system nobody on a
     * keyboard can score in is not a scoring system.
     *
     * So in freestyle the SETTING decides, on a keyboard as much as on a
     * radio. Racing keeps the guard, where holding a line matters more than
     * inverting and a key is a bang bang input.
     */
    if (view && view.mode === 'freestyle') {
      return ui.settings.flightMode === 'angle';
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
    if (!(mode === 'flight' && landed)) {
      return;
    }
    if (stateCurr && plantUpZ(stateCurr) < 0) {
      return;
    }
    landed = false;
    takingOff = true;
    takeoffUntil = performance.now() + TAKEOFF_WINDOW_MS;
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
    if (park && mode === 'flight') {
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
      if (landed && mode === 'flight' && !turtleWait && !turtleFlip.active && !turtleRecover) {
        beginLaunchStaging();
      }
    } else if (st === 3) {
      if (lcPrevState === 1 || lcPrevState === 2) {
        launchStaging = false;
        input.forcePadRest = false;
        disableLaunchStand();
        lcBoost = true;
        takingOff = true;
        takeoffUntil = nowMs + TAKEOFF_WINDOW_MS;
        flownThisRun = true;
        racePrev.copy(shell.quad.position);
        raceHasPrev = true;
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

  /* The pilot's render scale as a multiplier, 100 percent being native. */
  function renderScaleOf(s) {
    return (Number(s.renderScale) || 100) / 100;
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
    /* Render scale changes are free, no world rebuild: set the ratio and
     * walk the same guarded resize path a window resize takes, so the
     * composer and every prepass target follow in one place. */
    const userScale = renderScaleOf(s);
    const wantPr = pixelRatioFor(s.graphics, userScale);
    const userChanged = !!(view && view.post && view.post.userScale != null
      && view.post.userScale !== userScale);
    if (view && view.post && view.post.userScale != null) {
      view.post.userScale = userScale;
    }
    if (shell.pixelRatio !== wantPr || userChanged) {
      if (shell.pixelRatio !== wantPr) {
        applyPixelRatio(shell, s.graphics, userScale);
      }
      const d = shell.resize();
      if (view && view.post && mapReady) {
        view.post.setSize(d.w, d.h);
      }
    }
    if (mode === 'title') {
      /* Between runs the choice takes effect at once. During a run it
       * waits for the next one, so the record it is measured against is
       * the pack it was flown on. */
      runVoltage = s.packVoltage;
      sim.setCellVoltage(runVoltage);
      /* Flight style rides the same rule: the record and the physics a
       * run is flown on are decided when it starts, not mid lap. Guarded
       * because an older dist/sim.wasm predates the export. */
      runStyle = s.flightStyle === 'arcade' ? 'arcade' : 'expert';
      if (typeof sim.e.sim_set_flight_style === 'function') {
        sim.e.sim_set_flight_style(runStyle === 'arcade' ? 1 : 0);
      }
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
      const nextText = composeConfig(tuneText, s.rates, RATES_KEEP, pidsText);
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
      publishPids();
    }
    /*
     * The PID adjustment, same contract as rates: part of the config text,
     * so changing it re-inits the module and resets the craft. Compared as
     * the CLI text configs/pids.js emits for the LOADED tune, so a slider
     * moved on the tune that is flying re-inits, and an adjustment stored
     * for a different tune changes nothing until that tune is chosen.
     * While a tune swap is in flight configId is still the old tune, this
     * comparison stays a no-op, and swapTune adopts the new tune's block
     * itself.
     */
    const nextPids = pidsDiffFor(s.pids, configId);
    if (nextPids !== pidsText) {
      /* A local first, same reason as rates above: a refused sim_init has
       * already half-applied the new text, and recovery must restore the
       * text that worked, not the rejected one. */
      const nextText = composeConfig(tuneText, s.rates, RATES_KEEP, nextPids);
      if (sim.init(nextText) === SIM_OK) {
        pidsText = nextPids;
        configText = nextText;
        adoptSimClock();
        sim.setCellVoltage(runVoltage);
        race.setRecordKey(recordKey());
        ui.setBest(race.bestMs, view.mode);
        reset();
      } else if (sim.init(configText) === SIM_OK) {
        adoptSimClock();
        sim.setCellVoltage(runVoltage);
        reset();
      }
      publishPids();
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
    if (entry.id === 'custom') {
      /* The pilot's saved dump, from storage rather than a fetch. The row
       * only offers it while the dump exists, but a second tab can clear
       * storage under a first, so absence still has to be survivable. */
      text = readFcDump();
      if (text == null) {
        ui.settings.tune = configId;
        notice = { text: 'No saved Flight controller edits to fly.', untilMs: performance.now() + 3200 };
        return;
      }
    } else {
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
    }
    if (!isLiveConfigLoad(gen)) {
      return;
    }
    /* The NEW tune's own PID adjustment, not the old one's: the adjustment
     * is keyed by tune id, and carrying the old block across would fly
     * Karate with the default tune's sliders. */
    const nextPids = pidsDiffFor(ui.settings.pids, entry.id);
    const nextText = composeConfig(text, ui.settings.rates, RATES_KEEP, nextPids);
    const code = sim.init(nextText);
    if (code !== SIM_OK) {
      ui.settings.tune = configId;
      sim.init(configText);
      adoptSimClock();
      reset();
      publishPids();
      notice = { text: `${entry.name} could not be read.\n${configFault(code)}`, untilMs: performance.now() + 3600 };
      return;
    }
    configId = entry.id;
    tuneText = text;
    configText = nextText;
    pidsText = nextPids;
    configName = entry.id === 'custom' ? 'your edits' : `${entry.id}.diff`;
    adoptSimClock();
    sim.setCellVoltage(runVoltage);
    race.setRecordKey(recordKey());
    ui.setBest(race.bestMs, view.mode);
    publishPids();
    notice = { text: `Flying ${entry.name}`, untilMs: performance.now() + 2400 };
    reset();
  }

  async function submitBoardTime() {
    /* The board is flown on the full model only. An arcade lap is real
     * practice but a different aircraft, and a leaderboard where the two
     * mix is not a leaderboard. */
    if (runStyle === 'arcade') {
      notice = {
        text: 'Arcade laps stay off the public board.\nSwitch Flight style to Expert and fly it again.',
        untilMs: performance.now() + 3600,
      };
      return;
    }
    const listing = inspectCourse();
    const trackId = listing && listing.shareId;
    if (!trackId || !listing.canPostTime) {
      notice = { text: listing && listing.layoutDrift
        ? 'Update this track on the board before uploading a time.'
        : 'This track is not on the public board yet.', untilMs: performance.now() + 2800 };
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
    /* The lap's own recording rides along when this session holds one, so
     * the time lands on the board with a ghost anyone can chase. A pending
     * time from an earlier visit has no recording, and posts bare, exactly
     * as before ghosts existed. */
    const ghost = ghostForUpload(fastest);
    try {
      const posted = await postTime({
        trackId,
        name,
        lapMs: Math.round(fastest),
        ghost,
        origin: listing.board,
      });
      writePostedBest(trackId, fastest);
      clearPendingTime(trackId);
      const rank = posted.rank != null ? ` Rank ${posted.rank}.` : '';
      const withGhost = ghost ? ' Ghost attached, ready to be chased.' : '';
      /* formatTime, the same one the menu row that triggered this upload is
       * labelled with. A confirmation that spells the time differently from
       * the button reads as a different number. */
      notice = { text: `Uploaded ${name}, ${formatTime(fastest)}.${rank}${withGhost}`, untilMs: performance.now() + 3600 };
      ui.markTimePosted(posted);
    } catch (e) {
      notice = { text: `Could not upload that time.\n${e.message ?? e}`, untilMs: performance.now() + 3600 };
    }
  }

  /*
   * Put the finished freestyle run on the board.
   *
   * Deliberately UNLIKE submitBoardTime in one place: an arcade run is
   * posted, and labelled. A lap flown on the arcade model is a different
   * aircraft on the same track and mixing the two into one ranking makes
   * the ranking meaningless, which is why arcade laps stay off. A freestyle
   * run is not ranked against a track: the board carries the model on every
   * row and gives a reader a filter, so an arcade run can be on the board
   * and be honestly what it is. Refusing it instead would mean a pilot who
   * flies the friendlier machine has no board at all.
   */
  /*
   * Put the results screen up on a run that has ended. ONE function, called
   * by the clock running out and by the harness hook, so a screenshot of
   * this screen is a screenshot of the path a pilot takes rather than of a
   * second copy of it that could drift.
   *
   * The turtle teardown is the race path's, verbatim and for the same
   * reason: a run can end while the craft is upside down waiting to be
   * flipped, and leaving that state armed behind a menu is how the next
   * run starts with the motors parked.
   */
  function endFreestyleRun() {
    mode = 'results';
    if (turtleWait || turtleFlip.active) {
      if (turtleWait && !turtleFlip.active) {
        beginTurtleFlip();
      }
      finishTurtleFlip();
    }
    setCrashflip(false);
    turtleRecover = false;
    turtleOnSupport = false;
    setTurtleParkMotors(false);
    poseLock = false;
    ui.showFreestyleResults(score.summary());
  }

  async function submitFreestyleRun() {
    const summary = score.summary();
    /*
     * FREE FLIGHT IS NOT A SCORE. It has no clock, so there is nothing for
     * a board to compare it against: a pilot could sit in the town for an
     * hour and out-total any two minute run ever flown. Refused here rather
     * than hidden, so a pilot who meant to post learns why in one sentence.
     */
    if (summary.timed === false) {
      notice = {
        text: 'Free flight has no clock, so it has no place on the board. Switch Run to Scored on the Freestyle screen.',
        untilMs: performance.now() + 4200,
      };
      return;
    }
    if (!summary.tricks || !(summary.total > 0)) {
      notice = { text: 'A run with no tricks in it is not a score.', untilMs: performance.now() + 2800 };
      return;
    }
    /*
     * The harness can land a named trick straight into the scorer, which is
     * the only way to photograph this overlay. A run that used it is not a
     * flown run and must not reach a public table as if it were.
     */
    if (summary.assisted) {
      notice = { text: 'That run used the harness hooks, so it is not a flown score.', untilMs: performance.now() + 3200 };
      return;
    }
    let name = readPilotName();
    if (!name) {
      name = await ui.askName({
        title: 'Your name',
        detail: 'A run on the public board needs a name. It stays in this browser.',
      });
    }
    if (!name) {
      return;
    }
    try {
      const posted = await postFreestyleRun({
        name,
        map: view.id,
        style: runStyle === 'arcade' ? 'arcade' : 'expert',
        summary,
      });
      /* The board keeps one run per pilot and only their best, so a worse
       * run is a 200 with improved false rather than an error. Saying
       * "posted" for a score that is not up there would be a lie the pilot
       * would only find by opening the board. */
      notice = posted.improved === false
        ? {
          text: `Your ${formatScore(posted.score)} still stands. Only your best run is kept.`,
          untilMs: performance.now() + 3600,
        }
        : {
          text: `Posted ${name}, ${formatScore(summary.total)}.${posted.rank != null ? ` Rank ${posted.rank}.` : ''}`,
          untilMs: performance.now() + 3600,
        };
      ui.markRunPosted(posted);
    } catch (e) {
      notice = { text: `Could not post that run.\n${e.message ?? e}`, untilMs: performance.now() + 3600 };
    }
  }

  async function submitCoursePublish() {
    const listing = inspectCourse();
    if (!listing || !listing.doc) {
      notice = { text: 'Nothing to publish.', untilMs: performance.now() + 2800 };
      return;
    }
    if (!listing.canPublishNew && !listing.canUpdateListing) {
      notice = { text: 'This track is already on the public board.', untilMs: performance.now() + 2800 };
      return;
    }
    const remix = listing.kind === 'remix';
    const updating = listing.canUpdateListing && listing.layoutDrift;
    const of = listing.sourceName ? ` of ${listing.sourceName}` : '';
    const by = listing.sourceAuthor ? ` by ${listing.sourceAuthor}` : '';
    const detail = updating
      ? 'The layout changed. Updating the board will clear posted times.'
      : remix
        ? `This is your copy${of}${by}. It goes on the board as a new track. The original stays.`
        : 'The public board keeps a copy of this track, including every mark on the gates, the flags and the grass.';
    const values = await ui.askForm({
      title: updating ? 'Update this track' : 'Publish this track',
      detail,
      confirmLabel: updating ? 'Update the board' : 'Publish',
      fields: [
        {
          key: 'course',
          label: 'Track name',
          value: remix ? suggestRemixName(listing.name) : listing.name,
          maxLength: 80,
          placeholder: 'Track name',
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
      const forked = result.forked ? ' Published as a new track.' : '';
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
      notice = { text: `Could not publish that track.\n${e.message ?? e}`, untilMs: performance.now() + 3600 };
    }
  }

  function isRunActive() {
    return (mode === 'flight' || mode === 'paused') && !landed;
  }
  ui.onFcOpen = (page) => {
    ui.fc.open(moduleDump(sim), { runActive: isRunActive(), page });
  };
  /*
   * The Flight controller's Save. The draft is a full dump of the module;
   * what it becomes is three things, each through the store that already
   * owns it: its rate keys become the pilot's rate profile, its body
   * becomes the "custom" tune under FC_DUMP_KEY, and the PIDs screen's
   * adjustment for that tune is cleared because the dump IS the new
   * baseline. Then one composeConfig and one sim_init, the same join and
   * the same call every other config change makes. No preset shortcut:
   * Save always lands as Your edits, and the Tune row flies the pure
   * registry files.
   */
  ui.onFcSave = (draft, opts) => {
    bumpConfigGen();
    const nextRates = normaliseRates(ratesFromDump(draft));
    const body = tuneBody(draft);
    const nextText = composeConfig(body, nextRates, RATES_KEEP, '');
    const code = sim.init(nextText);
    if (code !== SIM_OK) {
      notice = { text: `That dump could not be saved.\n${configFault(code)}`, untilMs: performance.now() + 3600 };
      sim.init(configText);
      adoptSimClock();
      reset();
      publishPids();
      ui.renderMenu();
      return;
    }
    if (!writeFcDump(body)) {
      /* Storage refused (private mode). The save still FLIES, it just
       * does not survive a reload, and the pilot is told which. */
      notice = { text: 'Saved for this session only.\nThis browser would not store the dump.', untilMs: performance.now() + 3600 };
    } else {
      notice = { text: 'Saved. Flying your edits.', untilMs: performance.now() + 2400 };
    }
    ui.settings.rates = nextRates;
    clearPidsFor(ui.settings.pids, 'custom');
    ui.settings.tune = 'custom';
    menuTune = 'custom';
    ui.persistSettings();
    configId = 'custom';
    configName = 'your edits';
    tuneText = body;
    ratesText = ratesDiff(nextRates);
    pidsText = '';
    configText = nextText;
    adoptSimClock();
    sim.setCellVoltage(runVoltage);
    race.setRecordKey(recordKey());
    ui.setBest(race.bestMs, view.mode);
    reset();
    publishPids();
    const live = moduleDump(sim);
    ui.fc.snapshot = live;
    ui.fc.draft = live;
    ui.fc.runActive = false;
    if (opts && opts.restart) {
      mode = 'flight';
      ui.show('flight');
      introMs = 0;
      return;
    }
    if (opts && opts.exit) {
      ui.leaveFc();
      return;
    }
    ui.renderMenu();
  };
  ui.onFcAngle = (on) => {
    ui.settings.flightMode = on ? 'angle' : 'acro';
    syncAngleMode();
  };
  ui.onFcMotor = (motor, duty) => {
    sim.motorOverride(motor, duty);
  };
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
      throw new Error('This browser would not store that track.');
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

  /*
   * A ghost armed from the in-game standings screen.
   *
   * It parks the time id exactly where a ?ghost= chase link parks it, so
   * one code path arms both: the lap is downloaded when the seated track's
   * times are read, which the seat change is about to trigger anyway.
   */
  ui.onStandingsGhost = (track, time) => {
    if (!time || !time.id) {
      return;
    }
    ghostQueryId = time.id;
  };

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
        /*
         * THE PAD SHOT IS AN INTRODUCTION, AND A RESTART IS NOT A FIRST
         * MEETING.
         *
         * R already restarts without it: input.onKey calls reset() and
         * leaves introMs at -1. Restart run from the pause menu played the
         * whole orbit, approach and zoom, so the same intention cost four
         * seconds through the menu and nothing through the key, and the
         * menu is the only one of the two a phone has. A racer restarts
         * dozens of times an hour.
         *
         * `fly` keeps the shot: that one IS the first meeting, and it is
         * where the pilot sees the aircraft they are about to be inside of.
         */
        introMs = action === 'restart' ? -1 : 0;
      });
      return;
    }
    if (action === 'resume') {
      whenConfigReady(() => {
        if (turtleWait || turtleFlip.active) {
          turtleResumeGate = true;
        }
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
      ui.show('pilot');
    } else if (action === 'calibrate-save') {
      if (input.acceptCalibration()) {
        ui.show('pilot');
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
          detail: 'Posted times and published tracks carry this name. Changing it updates the board for tracks you published from this browser.',
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
    } else if (action === 'postrun') {
      submitFreestyleRun();
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
    /* Before reading the status, so the dock names the record the bed is
     * actually on. This is also the only thing that sets the context on a
     * page that has not changed screen since it loaded: the first gesture
     * reaches wakeAudio, not show(). */
    if (typeof audio.setMusicContext === 'function') {
      audio.setMusicContext(ui.flying() ? 'flight' : 'menu');
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
    /*
     * The pilot's own unstick. The thrash watch catches the states we
     * could name, and it needs 700 ms to be sure; this is the backstop for
     * whatever it did not name, at the cost of one keystroke. Same
     * recovery: clear air near where you are, upright, run untouched. It
     * refuses on the ground so it cannot be used as a free reposition
     * between laps.
     */
    if (code === 'KeyX' && ui.screen === 'flight' && mode === 'flight') {
      if (landed || launchStaging || poseLock || crashed) {
        return;
      }
      setManualFlip(false);
      setCrashflip(false);
      turtleRecover = false;
      finishClipCrash();
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
   * gone: the menu offers the registry tunes, the PIDs screen adjusts them,
   * and the rates are the pilot's.
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
  /* The craft's own up axis in world space, for the prop plane test. Hoisted
   * because it is written on every contact and budget P8 says the frame loop
   * does not allocate. */
  const upAxis = new THREE.Vector3();
  const nSim = { x: 0, y: 0, z: 0 };
  const pSim = { x: 0, y: 0, z: 0 };
  const vsSim = { x: 0, y: 0, z: 0 };
  /* The contact pass runs on the sim clock, several times a frame, so its
   * working set is hoisted for the same reason upAxis is. */
  const rPatch = { x: 0, y: 0, z: 0 };
  const rSim = { x: 0, y: 0, z: 0 };
  const obsPrev = new THREE.Vector3();
  const obsFrom = new THREE.Vector3();
  const obsTo = new THREE.Vector3();
  const obsPlace = new THREE.Vector3();
  const qObs = new THREE.Quaternion();
  const groundNWorld = new THREE.Vector3(0, 1, 0);
  /* The same normal with the spawn yaw taken out, ready for the plant. */
  const nWorld = new THREE.Vector3(0, 1, 0);
  const camFwd = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const qShake = new THREE.Quaternion();
  const shakeEuler = new THREE.Euler();
  const lensShake = makeLensShake();
  const introFrom = new THREE.Vector3();
  const introLook = new THREE.Vector3();
  const introRight = new THREE.Vector3();
  const introUp = new THREE.Vector3(0, 1, 0);
  /* The orbit's own forward: the craft's heading FLATTENED onto the ground
   * plane. See the note where it is filled. */
  const introFwd = new THREE.Vector3();
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

  /*
   * A WORLD DIRECTION INTO THE PLANT, and the one seam every direction goes
   * through. The reason it exists is the reason the wall tap stuck.
   *
   * The pose path is qSpawn applied to a basis change: poseFromState turns a
   * plant position into a world one with simPosToThree and then
   * `applyQuaternion(qSpawn)`, and worldPosToSim above undoes both in the
   * right order. A DIRECTION needs the same rotation and no offset, and it
   * was not getting it: the contact pass handed `threeDirToSim` a world space
   * normal, and threeDirToSim is the basis PERMUTATION and nothing else. A
   * permutation cannot undo a rotation.
   *
   * On a level floor that costs nothing, because a yaw about world up leaves
   * a vertical normal alone, which is exactly why this survived: the ground
   * model, the roof test and the race field all read straight. On a VERTICAL
   * face it is the whole answer. Measured through this chain, a craft flying
   * at 10 m/s square into a wall, with the plant's own velocity beside the
   * normal the plant was handed:
   *
   *   spawn yaw    0 deg   n . v  -10.0   approaching, the impulse is applied
   *   spawn yaw   90 deg   n . v   -0.0   PERPENDICULAR: a head on hit reads
   *                                       as a graze along the face
   *   spawn yaw  180 deg   n . v  +10.0   REVERSED: contact_impulse sees a
   *                                       craft leaving and declines it
   *
   * The freestyle city spawns at yaw pi (src/maps/city/index.js), so every
   * vertical face in the town was the third row. sim.c returns 0 without an
   * impulse when vn >= 0 and there is no penetration to push out of, so a
   * wall tap in the town got no restitution, no friction and no separation:
   * the sweep parked the hull 8 mm off the face, the pass broke out on a
   * zero impulse and threw away the tangential travel with it, and the craft
   * sat on the wall. That is the owner's report, and it is a frame error
   * rather than a friction one, which is why walking the materials never
   * fixed it.
   *
   * raiseGroundFromState already carried the fix for the ground plane, with
   * a comment describing this exact class of bug. It is here now instead, so
   * there is ONE path, and frame.js stays the only place the basis change
   * lives. scripts/frame-check.js asserts the round trip at four spawn yaws.
   */
  function worldDirToSim(wx, wy, wz, out) {
    nWorld.set(wx, wy, wz);
    nWorld.applyQuaternion(qSpawnInv);
    threeDirToSim(nWorld.x, nWorld.y, nWorld.z, out);
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
   * One axis of the slope, from the two one sided differences either side
   * of the craft, limited so a STEP cannot be read as a RAMP.
   *
   * The old sampler took one forward difference over 35 cm and called the
   * answer a slope. On terrain that is honest, because terrain over 35 cm
   * is a slope. On a LAUNCH STAND it is not: a start block is 0.248 m
   * across and 0.38 m along, so the stencil always steps off the block
   * onto the grass, and the "slope" it reported was the block's own height
   * divided by the stencil. Measured at the middle of a default stand that
   * is a 30 degree plane, rising to 43 degrees as the craft moves, leaning
   * toward +x and +z in WORLD space whichever way the grid points. The
   * plant then solved a rigid contact against it: the quad was flicked
   * 0.17 m sideways and 0.19 m upward inside six milliseconds, left the
   * pad at 1 m/s of drift it never asked for, and the impulses that took
   * were the bang at the start line. Muting the cue did not fix it because
   * the cue was telling the truth: something really was hitting the hull.
   *
   * A craft sitting on a small object sits on a LOCAL PEAK, and the two one
   * sided slopes there point opposite ways. That is the signature, and it
   * is the same signature at the edge of the clubhouse terrace, on a pit
   * table, on a map platform and on the city's overbridge deck. So the two
   * sides are combined with a minmod limiter: opposite signs mean a ridge
   * or a step, and the honest local surface is FLAT; matching signs mean a
   * real slope, and the gentler of the two is taken, which is the standard
   * conservative choice. A one in five hill still measures 11.31 degrees,
   * exactly its own angle.
   */
  function limitSlope(a, b) {
    if (a * b <= 0) {
      return 0;
    }
    return (a < 0 ? -a : a) < (b < 0 ? -b : b) ? a : b;
  }

  /*
   * Terrain slope at (x, z), Three.js world space, unit, pointing up.
   * Finite differences, no trig: the physics path may not call JS Math.sin
   * or Math.cos. Sampled a few times per frame, not every 1 ms, because a
   * 35 cm stencil barely moves in 8 ms. Five taps rather than three, so
   * the difference is centred and cannot lean toward +x and +z on ground
   * that is level.
   */
  function sampleGroundNormal(wx, wz, fromY, out) {
    const eps = 0.35;
    const h0 = view.height(wx, wz, fromY);
    const nx = limitSlope(
      h0 - view.height(wx + eps, wz, fromY),
      view.height(wx - eps, wz, fromY) - h0,
    );
    const nz = limitSlope(
      h0 - view.height(wx, wz + eps, fromY),
      view.height(wx, wz - eps, fromY) - h0,
    );
    const ny = eps;
    const n2 = nx * nx + ny * ny + nz * nz;
    if (!(n2 > 1e-12)) {
      out.set(0, 1, 0);
      return h0;
    }
    const inv = 1 / Math.sqrt(n2);
    out.set(nx * inv, ny * inv, nz * inv);
    return h0;
  }

  function sampleGroundNormalFromState(st) {
    poseFromState(st, pProbe);
    sampleGroundNormal(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS, groundNWorld);
  }

  function raiseGroundFromState(st) {
    poseFromState(st, pProbe);
    const hy = view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS);
    worldPosToSim(pProbe.x, hy, pProbe.z, pSim);
    /*
     * The plane's POINT goes through worldPosToSim, which undoes the spawn
     * yaw. Its NORMAL did not, and threeDirToSim is a basis permutation
     * that cannot undo a rotation, so the slope arrived at the plant turned
     * by however far the spawn faced. A 20 degree hillside under a quarter
     * turn spawn reached the plant as a 20 degree ROLL rather than a
     * 20 degree pitch: the craft leaned the wrong way on every slope on
     * every map whose spawn is not aligned with the world axes. It never
     * showed on level ground or on a deck, where the normal is straight up
     * and a yaw about up is the identity, which is why it lasted. A
     * direction takes no offset, so this is the rotation and nothing else.
     *
     * It goes through worldDirToSim now, with every other direction the
     * shell converts. There are four of them: this one, the contact normal,
     * the contact patch arm and a moving collider's surface velocity. This
     * was the first to be fixed and stayed the only one for four days.
     */
    worldDirToSim(groundNWorld.x, groundNWorld.y, groundNWorld.z, nSim);
    const n2 = nSim.x * nSim.x + nSim.y * nSim.y + nSim.z * nSim.z;
    if (!(n2 > 0.97) || !(n2 < 1.03)) {
      nSim.x = 0;
      nSim.y = 0;
      nSim.z = 1;
    } else {
      const inv = 1 / Math.sqrt(n2);
      nSim.x *= inv;
      nSim.y *= inv;
      nSim.z *= inv;
    }
    return sim.e.sim_set_ground(
      1, nSim.x, nSim.y, nSim.z, pSim.x, pSim.y, pSim.z, GROUND_MU, GROUND_E,
    );
  }

  /*
   * How far out of the face to place the craft.
   *
   * This used to add `inward`, the distance the frame's END position had
   * gone past the contact plane, on top of the gap. That is wrong twice
   * over. The contact point is by definition the pose at first touch, so
   * it is already clear of the face and the only thing owing is the gap;
   * and `inward` grows with the frame's own travel, so the same wall hit
   * pushed a 30 fps machine back five times further than a 144 fps one.
   * At 20 m/s that was a third of a metre of teleport away from the wall.
   * An already-inside hit is the one case with real depth to undo, and
   * hitPen is the collider's own nearest-face exit for it.
   */
  function contactSeparation() {
    if (view.colliders.hitT <= 1e-6) {
      /*
       * Whichever depth the collider actually reported. hitPen is the
       * craft's CENTRE through a face, which only a tunnelled hull has;
       * hitOverlap is the hull overlapping a face its centre is still
       * outside of, which is every ordinary contact with a wall. Only the
       * first of the two existed, and only for a capsule and for a centre
       * inside a box, so a hull that arrived at a wall already overlapping,
       * which is what a rotation into a surface produces, was moved the
       * flat 8 mm and met the same face again on the next pass. It leaves
       * in one step now.
       */
      const depth = view.colliders.hitPen > view.colliders.hitOverlap
        ? view.colliders.hitPen
        : view.colliders.hitOverlap;
      if (depth > 0) {
        return depth + BOUNCE_SEPARATION;
      }
    }
    return BOUNCE_SEPARATION;
  }

  /*
   * ONE CONTACT: place the craft on the free side of the face and apply
   * the impulse there.
   *
   * The impulse arm is the four-disc contact patch, not the plant's own
   * hull corner, which is the whole of the difference between a belly slap
   * that pushes off and one that spins the craft up. See contactPatch in
   * collide.js for the measurements that forced this.
   *
   * Returns the impulse's own scale, in metres per second of centre of
   * mass velocity change, so the caller can size the sound and the shake
   * from what actually happened rather than from a speed threshold. Zero
   * means the module refused the contact.
   */
  function resolveContactAt(nx, ny, nz, cx, cy, cz, e, mu, vsx, vsy, vsz) {
    const sep = contactSeparation();
    /*
     * WRITTEN FIRST, because the caller branches on it and it used to
     * survive the call that failed to set it. passStats.code is assigned in
     * one place, after the module returns, and the degenerate-normal path
     * below returns 0 without ever reaching it: the caller then read a code
     * left over from an EARLIER contact, on an earlier collider, possibly in
     * an earlier frame, and decided from it whether this pass had merely
     * found a resting contact or had been refused outright. Seeding it here
     * makes the field mean "what happened to THIS contact".
     */
    passStats.code = SIM_OK;
    worldDirToSim(nx, ny, nz, nSim);
    const nlen = Math.sqrt(nSim.x * nSim.x + nSim.y * nSim.y + nSim.z * nSim.z);
    if (!(nlen > 1e-9)) {
      passStats.code = SIM_ERR_BAD_ARG;
      return 0;
    }
    const inv = 1 / nlen;
    obsPlace.set(cx + nx * sep, cy + ny * sep, cz + nz * sep);
    worldPosToSim(obsPlace.x, obsPlace.y, obsPlace.z, pSim);
    contactPatch(nx, ny, nz, qObs.x, qObs.y, qObs.z, qObs.w, rPatch);
    worldDirToSim(rPatch.x, rPatch.y, rPatch.z, rSim);
    const before = stateCurr;
    const vx0 = before[4];
    const vy0 = before[5];
    const vz0 = before[6];
    /*
     * THE GUARD THAT WOULD HAVE CAUGHT THIS, and it stays.
     *
     * The plant only ever sees the plant frame, so a normal turned the wrong
     * way is not something it can refuse: it reads a craft flying INTO a wall
     * as one leaving, declines the contact, and the shell reads that as a
     * refusal rather than as a bug. The one invariant that survives the
     * conversion is the SIGN: a contact normal points out of the solid, so it
     * opposes an inbound craft in whichever frame you ask. Counted here, in
     * the frame the plant actually uses, it costs a dot product per contact
     * and it is the only place the answer can be checked against the plant's
     * own velocity. window.__contacts() reports it.
     */
    const vn = nSim.x * inv * before[4] + nSim.y * inv * before[5] + nSim.z * inv * before[6];
    if (vn > 0.05) {
      passStats.outbound += 1;
    } else if (vn < -0.05) {
      passStats.inbound += 1;
    }
    const code = sim.e.sim_contact_at(
      nSim.x * inv, nSim.y * inv, nSim.z * inv,
      e, mu,
      pSim.x, pSim.y, pSim.z,
      vsx, vsy, vsz,
      rSim.x, rSim.y, rSim.z,
    );
    passStats.code = code;
    if (code !== SIM_OK) {
      return 0;
    }
    stateCurr = readState();
    const dvx = stateCurr[4] - vx0;
    const dvy = stateCurr[5] - vy0;
    const dvz = stateCurr[6] - vz0;
    speedNow = Math.sqrt(
      stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5] + stateCurr[6] * stateCurr[6],
    );
    return Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
  }

  /* Move onto the free side without an impulse. Only for a hull that is
   * already buried: there is no approach velocity left to solve against,
   * and stacking a second impulse on a depenetration is how a corner
   * starts pumping energy into the craft. */
  function separateAt(nx, ny, nz, cx, cy, cz) {
    const sep = contactSeparation();
    obsPlace.set(cx + nx * sep, cy + ny * sep, cz + nz * sep);
    worldPosToSim(obsPlace.x, obsPlace.y, obsPlace.z, pSim);
    const st = stateCurr;
    const code = sim.e.sim_set_pose(
      pSim.x, pSim.y, pSim.z, st[7], st[8], st[9], st[10],
    );
    if (code !== SIM_OK) {
      return false;
    }
    stateCurr = readState();
    return true;
  }

  /*
   * THE SOLID WORLD, ON THE SIM CLOCK.
   *
   * Every gate member, tree, rock, cliff tier and city wall is a capsule
   * or a box in view.colliders, and the query is the exact closest
   * distance between the segment the craft travelled and the collider, so
   * nothing tunnels at any frame rate.
   *
   * THIS USED TO RUN ONCE PER RENDERED FRAME, ON THE INTERPOLATED RENDER
   * POSE, AND WRITE THE RESULT BACK INTO THE PLANT. Three things followed
   * from that and all three were felt:
   *
   *   1. the trajectory depended on the frame rate, which CLAUDE.md
   *      forbids in as many words: a dropped frame must change nothing.
   *      Two machines at 60 and 144 fps took different lines off the same
   *      wall, and the leaderboard is scored on that.
   *   2. the pose it solved against was a lerp between two physics states,
   *      so the contact was never resolved against a state the plant had
   *      actually been in.
   *   3. a contact rewound the craft to the touch point and threw away
   *      the rest of the frame's travel, INCLUDING the part along the
   *      surface. In sustained contact hitT is 0 every frame, so the craft
   *      was put back where it started, every frame, and could not slide.
   *      That is the "it sticks a bit" in the owner's report, and it is
   *      not a friction problem: there was no tangential motion left to
   *      apply friction to.
   *
   * So it runs here instead, every OBSTACLE_STEP milliseconds of SIM time,
   * against the plant's own pose, and the leftover travel is projected
   * onto the face and swept again rather than dropped. The cadence is a
   * count of 1 ms steps, so it is identical however the host batched them.
   *
   * Collide and slide, four passes: hit, place on the face, impulse there,
   * carry the remaining travel along the surface, sweep that too. Four is
   * enough for a corner (two faces) with slack; anything still overlapping
   * after that is what the clip watch reads.
   */
  function obstacleContactPass(st, dtSurface) {
    obsResolved = false;
    if (!view.colliders || mode !== 'flight' || crashed || poseLock || launchStaging) {
      obsHasPrev = false;
      return st;
    }
    poseFromState(st, obsTo);
    simQuatToThree(st[7], st[8], st[9], st[10], qObs);
    qObs.premultiply(qSpawn);
    if (!obsHasPrev) {
      obsPrev.copy(obsTo);
      obsHasPrev = true;
      return st;
    }
    obsFrom.copy(obsPrev);
    /* Seed the next pass from where this one actually arrived, whatever
     * the contacts below do to it. */
    obsPrev.copy(obsTo);

    upAxis.set(0, 1, 0).applyQuaternion(qObs);
    const vh = craftVerticalHalf(Math.sqrt(Math.max(0, 1 - upAxis.y * upAxis.y)));

    const origX = obsFrom.x;
    const origY = obsFrom.y;
    const origZ = obsFrom.z;
    const endX = obsTo.x;
    const endY = obsTo.y;
    const endZ = obsTo.z;
    let punchIndex = -1;
    let punchMoving = -1;
    let punchTravel = false;
    let clean = true;
    let attempts = 0;

    for (; attempts < 4; attempts += 1) {
      const k = view.colliders.hit(
        obsFrom.x, obsFrom.y, obsFrom.z,
        obsTo.x, obsTo.y, obsTo.z,
        vh, qObs.x, qObs.y, qObs.z, qObs.w,
      );
      if (k < 0) {
        clean = true;
        break;
      }
      clean = false;
      if (!punchTravel
        && view.colliders.crossedHit(origX, origY, origZ, endX, endY, endZ)) {
        punchIndex = view.colliders.hitIndex;
        punchMoving = view.colliders.hitMoving;
        punchTravel = true;
      }
      const col = view.colliders;
      const nx = col.hitNx;
      const ny = col.hitNy;
      const nz = col.hitNz;
      if (ny > 0.5) {
        obsRoof = true;
      }
      lastHitKind = col.kindName(k);
      lastClosing = speedNow * col.hitNormalDot;
      obsTouched = true;
      if (lastClosing > obsClosing) {
        obsClosing = lastClosing;
      } else if (-lastClosing > obsClosing) {
        obsClosing = -lastClosing;
      }
      lastUpDot = Math.abs(nx * upAxis.x + ny * upAxis.y + nz * upAxis.z);

      const ht = col.hitT < 0 ? 0 : col.hitT > 1 ? 1 : col.hitT;
      const cx = obsFrom.x + (obsTo.x - obsFrom.x) * ht;
      const cy = obsFrom.y + (obsTo.y - obsFrom.y) * ht;
      const cz = obsFrom.z + (obsTo.z - obsFrom.z) * ht;

      /* Buried: no approach left to solve, just get out. */
      if (col.hitT <= 1e-6 && col.hitPen > 0.05) {
        passStats.buried += 1;
        if (!separateAt(nx, ny, nz, cx, cy, cz)) {
          passStats.sepFail += 1;
          break;
        }
        poseFromState(stateCurr, obsFrom);
        obsTo.copy(obsFrom);
        continue;
      }

      const mat = contactMaterial(lastHitKind);
      let vsx = 0;
      let vsy = 0;
      let vsz = 0;
      const moving = col.hitMoving;
      if (moving >= 0 && dtSurface > 0) {
        /*
         * The moving centres are a pair one FRAME apart, because that is
         * how often the map animates them, so the difference has to be
         * divided by the frame's own sim duration and not by this pass's
         * 4 ms cadence. Dividing by the cadence overstated the city's
         * 23.5 m/s train by the ratio of the two, four times over at
         * 60 fps, which pushes it past SURFACE_SPEED_MAX and the guard
         * below then zeroes it: the train would have hit like a wall.
         */
        const msx = (col.movingCx[moving] - col.movingPx[moving]) / dtSurface;
        const msy = (col.movingCy[moving] - col.movingPy[moving]) / dtSurface;
        const msz = (col.movingCz[moving] - col.movingPz[moving]) / dtSurface;
        /*
         * A collider that JUMPED has no surface velocity, and the
         * difference of its two centres does not know that: it reports the
         * jump divided by a frame. The map owns not jumping (the city's
         * train seats rather than sweeps across its wrap, see
         * src/maps/city/animation.js) and this is the seam that owns not
         * handing the plant an impulse it cannot survive. Zero, not a
         * clamp: a teleport is not slow motion, it is no motion.
         */
        if (msx * msx + msy * msy + msz * msz
          <= SURFACE_SPEED_MAX * SURFACE_SPEED_MAX) {
          /* Through the same door as the normal and the arm. A surface
           * velocity is a direction with a magnitude and takes no offset,
           * and it was turned by the spawn yaw exactly as they were: on a
           * map facing half a turn round, the train's 23.5 m/s reached the
           * plant pointing the other way down the track. */
          worldDirToSim(msx, msy, msz, vsSim);
          vsx = vsSim.x;
          vsy = vsSim.y;
          vsz = vsSim.z;
        }
      }

      /* Leftover travel, with the part that goes into the face removed.
       * What is left is the slide, and it is swept on the next pass so a
       * slide into a second solid cannot tunnel. */
      let rx = (obsTo.x - obsFrom.x) * (1 - ht);
      let ry = (obsTo.y - obsFrom.y) * (1 - ht);
      let rz = (obsTo.z - obsFrom.z) * (1 - ht);
      const dn = rx * nx + ry * ny + rz * nz;
      if (dn < 0) {
        rx -= nx * dn;
        ry -= ny * dn;
        rz -= nz * dn;
      }

      const dv = resolveContactAt(nx, ny, nz, cx, cy, cz, mat.e, mat.mu, vsx, vsy, vsz);
      /*
       * A DECLINED IMPULSE IS NOT A FAILED PASS, and treating it as one is
       * the second half of why the craft sat on the wall.
       *
       * contact_impulse returns without doing anything whenever the patch is
       * already moving away from the face and there is no penetration to push
       * out of, which is the ordinary state of a hull sliding ALONG a
       * surface: the normal component is spent, the tangential one is not.
       * The pass used to `break` there, and the break skipped the one thing
       * that still had work to do, which is committing the slide below. So
       * every millisecond the craft spent against a face threw away that
       * millisecond's travel along it, which is the same "there was no
       * tangential motion left to apply friction to" the collide-and-slide
       * rebuild was written to fix, arriving by a different door.
       *
       * A refusal from the MODULE is different and still ends the pass:
       * SIM_ERR_BAD_ARG means the contact could not be expressed, and
       * sweeping on from an unresolved state is how a corner pumps energy.
       */
      if (dv <= 0) {
        passStats.kind = lastHitKind;
        passStats.e = mat.e;
        passStats.mu = mat.mu;
        if (passStats.code !== SIM_OK) {
          passStats.dvZero += 1;
          break;
        }
        passStats.resting += 1;
        obsContact = true;
        obsResolved = true;
        /* Carry the slide. Position only, so no momentum is invented, and on
         * round the loop so a slide into a second solid still cannot tunnel.
         *
         * A hull pressed against a face with nothing left to carry stops
         * here instead. sim_contact_at writes the pose whether or not it
         * applies an impulse, so going round again on a travel of nothing
         * would ask it to place the craft a further separation off the face
         * every attempt, which is a creep away from the wall rather than a
         * slide along it. */
        poseFromState(stateCurr, obsFrom);
        if (rx * rx + ry * ry + rz * rz <= 1e-12) {
          obsTo.copy(obsFrom);
          break;
        }
        obsTo.set(obsFrom.x + rx, obsFrom.y + ry, obsFrom.z + rz);
        continue;
      }
      passStats.resolved += 1;
      obsResolved = true;
      obsContact = true;
      if (dv > obsImpulse) {
        obsImpulse = dv;
        obsImpulseKind = lastHitKind;
      }
      poseFromState(stateCurr, obsFrom);
      obsTo.set(obsFrom.x + rx, obsFrom.y + ry, obsFrom.z + rz);
    }

    if (clean && attempts > 0
      && (obsTo.x !== obsFrom.x || obsTo.y !== obsFrom.y || obsTo.z !== obsFrom.z)) {
      /* The slide is free. Commit it: this is the frame's own travel being
       * carried along the surface, which is exactly what used to be lost.
       * Position only, so no momentum is invented. */
      worldPosToSim(obsTo.x, obsTo.y, obsTo.z, pSim);
      if (sim.e.sim_set_pose(
        pSim.x, pSim.y, pSim.z, stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10],
      ) === SIM_OK) {
        stateCurr = readState();
      }
    }

    poseFromState(stateCurr, obsPrev);

    if (!clean) {
      obsLeftover = true;
    } else if (attempts >= 4) {
      obsLeftover = view.colliders.hit(
        obsPrev.x, obsPrev.y, obsPrev.z,
        obsPrev.x, obsPrev.y, obsPrev.z,
        vh, qObs.x, qObs.y, qObs.z, qObs.w,
      ) >= 0;
    }
    if (obsLeftover) {
      const depth = view.colliders.interiorOfHit(obsPrev.x, obsPrev.y, obsPrev.z);
      if (depth > obsInterior) {
        obsInterior = depth;
      }
      if (!(depth > CLIP_CENTER_EPS) && view.colliders.hitNy > 0.5) {
        obsRoof = true;
      }
    }
    if (punchTravel) {
      const stillThrough = punchMoving >= 0
        ? view.colliders.crossedMoving(punchMoving, origX, origY, origZ, obsPrev.x, obsPrev.y, obsPrev.z)
        : view.colliders.crossedStatic(punchIndex, origX, origY, origZ, obsPrev.x, obsPrev.y, obsPrev.z);
      if (stillThrough) {
        obsLeftover = true;
        if (!(obsInterior >= CLIP_DEEP)) {
          obsInterior = CLIP_DEEP;
        }
      }
    }
    return stateCurr;
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
  /* The boot course goes through here rather than adoptLoadedView, so the
   * ghost picker learns about it here: what the board holds for it, and
   * the ?ghost= a chase link may have arrived with. */
  ghostCourseChanged();

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
  /*
   * 108 CLEARS THE CORNER BLOCKS AND NOTHING ELSE, WHICH IS WHY THE CHEVRON
   * KEPT LANDING ON THE STICKS.
   *
   * The bottom band belongs to whichever readout is in it, and that is not
   * always the two corner instruments this number was sized for. The
   * keyboard stick ghost sits centred at the bottom and stands about 124 px
   * tall: an 18 px offset, a plate that clamps between 64 and 88 px, a
   * caption margin and 10 px of type. On a touch layout the corner blocks
   * themselves move to the bottom centre. A gate below the frame is the
   * normal case straight after takeoff and in every climb, so the chevron
   * and its range were being drawn over the roll and pitch gimbal, and over
   * the speed readout on a phone, exactly when the pilot was reading both.
   *
   * So the margin is what is actually down there, measured the same way in
   * both cases rather than assumed.
   */
  const AIM_MARGIN_BOTTOM = 108;
  /* With the stick ghost or the touch layout up. Measured against the CSS in
   * index.html: 18 px from the bottom, an 88 px plate at its clamp ceiling,
   * a 6 px caption gap and 10 px of caption, plus the same 8 px of air the
   * 108 above leaves over an instrument. */
  const AIM_MARGIN_BOTTOM_STICKS = 130;
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
    if (crashflipOn || turtleRecover) {
      ui.setTargetLock(LOCK_OFF);
      return;
    }
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
    /* Whichever of the two the frame is currently showing. isTouchPrimary
     * moves the corner blocks to the bottom centre; the keyboard ghost puts
     * the gimbals there. Either way the bottom band is taller than the
     * corner instruments alone. */
    const bottomBand = (input.isKeyboardPrimary() || input.isTouchPrimary())
      ? AIM_MARGIN_BOTTOM_STICKS
      : AIM_MARGIN_BOTTOM;
    const maxY = vh - bottomBand;
    const edge = behind || sx < minX || sx > maxX || sy < minY || sy > maxY;
    /* A flag or cone already carries its own light. The in-frame bracket
     * was sized to the scoring square, which is the gate box the owner
     * asked not to draw. Off screen the chevron still points the way. */
    if (aim.virtual && !edge) {
      ui.setTargetLock(LOCK_OFF);
      return;
    }
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
  /* Wall time of the last frame the cap let through. */
  let capLastDraw = -1e9;

  /*
   * ONE FAULT USED TO FREEZE THE PICTURE AND SAY NOTHING.
   *
   * The next frame is scheduled first, on purpose, so a slow frame does not
   * stop the loop. That also meant a THROWN frame did not stop it: readState
   * throws on any non-OK state code, sim_set_pose throws from the turtle and
   * clip-crash paths, and a height query on a half disposed map throws. The
   * loop kept running, every frame threw at the same line, and what the
   * pilot saw was the last drawn frame, forever, with a stale OSD and no
   * word about why.
   *
   * So the body is separated from the scheduling and wrapped once. The first
   * fault is reported to the pilot in the language of the thing they can do
   * about it, and stored where the F8 bug report can find it. The loop keeps
   * running afterwards because the camera, the menus and the report form all
   * live in it; what stops is the pretence that the flight is still valid.
   *
   * The flag itself is declared beside reset(), which clears it, because a
   * `let` here would be in its temporal dead zone for every line of boot
   * above this one and reset() is reachable from several of them.
   */
  function frame(nowWall) {
    requestAnimationFrame(frame);
    try {
      frameBody(nowWall);
    } catch (e) {
      if (!frameFault) {
        frameFault = e;
        const message = (e && e.message) ? e.message : String(e);
        /* Recorded for the bug report, which is the one path that carries a
         * fault off this machine. */
        window.__frameFault = { message, stack: e && e.stack ? String(e.stack) : '', atMs: Math.round(performance.now()) };
        console.error('frame fault', e);
        try {
          ui.setBanner(`The simulator hit a fault and stopped flying.\nPress R to reset, or F8 to report it.\n${message}`, true);
        } catch (inner) {
          /* The shell itself is the thing that broke. Nothing left to say
           * it with. */
        }
      }
      /* Keep wall time moving, or the frame after a reset steps the physics
       * by however long the pilot spent reading the banner. */
      prevWall = nowWall;
    }
  }

  function frameBody(nowWall) {
    /* Once a frame, whatever the window did since the last one. */
    applyResizeIfDirty();
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
    let frameSteps = 0;

    /* The seated world's note, released on the first frame of a flight and
     * not one frame earlier. See showCourseNotes. */
    if (heldNotes && ui.screen === 'flight') {
      notice = { text: heldNotes, untilMs: nowWall + 5600 };
      heldNotes = null;
    }

    input.poll(nowWall);
    pollManualFlip();
    const launchNow = syncLaunchControl(nowWall);
    input.forcePadRest = launchStaging;
    syncAngleMode();
    const samples = input.drain();
    for (const smp of samples) {
      rcPending.push(smp);
    }
    /* Recover must see a centred stick even while perched: sim.input
     * does not run when landed, and the banner would stick forever. */
    if (turtleRecover && !turtleWait && !turtleFlip.active) {
      const ch = samples.length ? samples[samples.length - 1] : input.channels;
      turtleHoldStick(ch.roll, ch.pitch);
    }
    if (
      mode === 'flight'
      && !crashed
      && stateCurr
      && !turtleFlip.active
      && (turtleWait
        || (plantUpZ(stateCurr) < TURTLE_INVERT_UPZ
          && plantSpeed(stateCurr) < TURTLE_SPEED
          && plantRateMag(stateCurr) < TURTLE_RATE))
    ) {
      pollTurtleSupport();
    } else if (!turtleWait && !turtleFlip.active) {
      turtleOnSupport = false;
    }
    if (
      mode === 'flight'
      && !poseLock
      && !crashed
      && stateCurr
      && !turtleWait
      && !turtleFlip.active
    ) {
      tryEnterTurtle(stateCurr, turtleInContact());
    }
    /*
     * A sample taken while the integrator is not running has no RC slot to
     * land in: the title screen, a pause, every second the craft sits
     * perched, and a turtle wait. Keep the newest, so the first flying
     * flying frame starts from where the sticks actually are, and drop
     * the rest. Without this the queue grew for as long as the page was
     * open, at the 100 ms heartbeat alone, and the first frame of flight
     * had to walk all of it.
     */
    const turtleParkedNow = isTurtleParked();
    if (mode === 'flight' && !poseLock) {
      setTurtleParkMotors(turtleParkedNow || turtleRecover);
    }
    if (!(mode === 'flight' && !landed && !turtleParkedNow && !crashed) && rcPending.length > 1) {
      rcPending.splice(0, rcPending.length - 1);
    }
    /* Hard bound, whatever else happens. */
    if (rcPending.length > 1024) {
      rcPending.splice(0, rcPending.length - 256);
    }
    if (ui.isModal()) {
      ui.pollPad(padNav());
    }

    if (mode === 'flight' && landed && !crashed) {
      const thr = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
      if (landed && thr > TAKEOFF_THROTTLE) {
        if (turtleRecover) {
          /* Recover owns the stick. Throttle is not takeoff until they
           * centre, or the leftover punch flies them out of turtle. */
        } else if (stateCurr && plantUpZ(stateCurr) < 0) {
          /* Props down: throttle is not takeoff. Unfreeze into turtle
           * if they are seated, otherwise let them fall. */
          landed = false;
          takingOff = false;
          flownThisRun = true;
          adoptSimClock();
          tryEnterTurtle(
            stateCurr,
            turtleInContact() || sim.e.sim_ground_contacts() > 0,
          );
        } else {
          /* Off again. The RC frame grid rides the SIM's own clock, which
           * froze with the integrator, so it is already seated; this re-pin
           * is belt and braces against any future path that moves rcNextMs
           * while the craft is down. Stamping the grid from the lap clock
           * here is the bug that made every second spent parked into a
           * second of stick lag. */
          landed = false;
          takingOff = true;
          takeoffUntil = nowWall + TAKEOFF_WINDOW_MS;
          flownThisRun = true;
          adoptSimClock();
          if (typeof audio.event === 'function'
            && nowWall - groundCueAtWall >= GROUND_CUE_GAP_MS) {
            groundCueAtWall = nowWall;
            audio.event('takeoff');
          }
        }
      }
    }
    if (mode === 'flight' && crashed && nowWall >= clipCrashUntil) {
      finishClipCrash();
    }
    if (mode === 'flight' && crashed) {
      /* Hold the glitch pose so Crashed can be read, then reset(). */
      acc += dt;
      const holdSteps = Math.floor(acc / MS_PER_STEP);
      acc -= holdSteps * MS_PER_STEP;
    } else if (mode === 'flight' && ui.screen === 'flight' && turtleParkedNow && !poseLock) {
      /* Inverted wait or the scripted flip: do not step the plant.
       * The lap clock still runs. Pause freezes the flip where it is. */
      stepTurtleFrozen(dt);
    } else if (mode === 'flight' && !landed && !poseLock) {
      /* The module is the source of truth. If sim_init ran and JS time was
       * left behind, raising ts to lastTs would stamp every sample seconds
       * into the future. Snap the shell to step_index instead. */
      const moduleIdx = Math.round(readState()[0] * SIM_HZ);
      if (simStepIdx !== moduleIdx) {
        acc = 0;
        simStepIdx = moduleIdx;
        pinRcGrid();
        takingOff = false;
        turtleRecover = false;
        sim.rest();
        stateCurr = readState();
        statePrev = stateCurr;
        if (plantUpZ(stateCurr) < 0) {
          landed = false;
          setCrashflip(false);
        } else {
          landed = true;
          setCrashflip(false);
        }
      } else {
      scoring = view.mode === 'freestyle' && !crashed;
      let peakGroundClosing = 0;
      let peakGroundSpeed = 0;
      let sawGroundHit = false;
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
          const ax = applyTurtleRc(held.roll, held.pitch);
          const inCode = sim.input(ts, ax[0], ax[1], held.yaw, held.throttle);
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
          const ax = applyTurtleRc(pkt.rc.roll, pkt.rc.pitch);
          const inCode = sim.input(ts, ax[0], ax[1], pkt.rc.yaw, pkt.rc.throttle);
          if (inCode !== SIM_OK) {
            adoptSimClock();
            break;
          }
        }
        rcNextMs = rcLink.nextMs;
      }
      if (steps >= 1) {
        if (launchStaging) {
          sim.e.sim_set_ground(0, 0, 0, 1, 0, 0, 0, 0, 0);
          if (steps > 1) {
            sim.step(steps - 1);
            statePrev = readState();
          } else {
            statePrev = stateCurr;
          }
          sim.step(1);
          stateCurr = readState();
          if (plantUpZ(stateCurr) < 0) {
            endLaunchStaging(false);
            takingOff = false;
          }
        } else {
          let stNow = stateCurr;
          sampleGroundNormalFromState(stNow);
          /*
           * Inbound closing has to be sampled BEFORE sim_step. Ground
           * contact runs inside the 1 ms step, so by the time the frame
           * ends the hull has already bounced and vz is upward. Using
           * end-of-frame descent for the OSD meant a real hit never
           * announced: the bounce finished inside the same batch.
           */
          peakGroundClosing = 0;
          peakGroundSpeed = 0;
          sawGroundHit = false;
          for (let i = 0; i < steps; i += 1) {
            if (i === 0 || (i & 7) === 0 || plantUpZ(stNow) < 0.5) {
              sampleGroundNormalFromState(stNow);
            }
            const vzBefore = stNow[6];
            const spdBefore = Math.sqrt(
              stNow[4] * stNow[4] + stNow[5] * stNow[5] + stNow[6] * stNow[6],
            );
            raiseGroundFromState(stNow);
            sim.step(1);
            stNow = readState();
            if (scoring) {
              /* Body rates, the two quaternion components the attitude test
               * needs, and speed. Nothing is allocated and nothing is
               * converted: the detector works in the plant's own frame. */
              /*
               * The last three are the craft's position in the WORLD frame,
               * which is where the obstacles are. poseFromState is the
               * shell's own conversion through frame.js, so nothing new
               * crosses the frame boundary here.
               */
              poseFromState(stNow, scorePos);
              /*
               * And where the nose is pointing, in the same frame. An Orbit
               * is defined by keeping the object on the screen, and without
               * a heading the recogniser cannot tell one from an ordinary
               * banked turn that happens to go round twice. Both go through
               * frame.js, so nothing new crosses the frame boundary.
               */
              simQuatToThree(stNow[7], stNow[8], stNow[9], stNow[10], scoreQuat);
              scoreQuat.premultiply(qSpawn);
              scoreFwd.set(0, 0, -1).applyQuaternion(scoreQuat);
              scoreUp.set(0, 1, 0).applyQuaternion(scoreQuat);
              trickDetector.step(
                0.001, stNow[11], stNow[12], stNow[13], stNow[8], stNow[9],
                Math.sqrt(stNow[4] * stNow[4] + stNow[5] * stNow[5] + stNow[6] * stNow[6]),
                scorePos.x, scorePos.y, scorePos.z,
                scoreFwd.x, scoreFwd.y, scoreFwd.z,
                scoreUp.x, scoreUp.y, scoreUp.z,
              );
            }
            /* The solid world, on the sim clock. stateCurr is what the
             * pass reads and writes, so it is kept level with stNow
             * across the call. */
            obsPhase += 1;
            if (obsPhase >= OBSTACLE_STEP) {
              obsPhase = 0;
              stateCurr = stNow;
              stNow = obstacleContactPass(stNow, steps * 0.001);
              if (obsResolved) {
                /* The pose moved under the interpolator. Collapse it
                 * rather than lerping the craft back through the wall
                 * it was just taken out of. */
                statePrev = stNow;
              }
            }
            if (i === steps - 2) {
              statePrev = stNow;
            }
            if (sim.e.sim_ground_contacts() > 0) {
              sawGroundHit = true;
              const inbound = -vzBefore;
              if (inbound > peakGroundClosing) {
                peakGroundClosing = inbound;
              }
              if (spdBefore > peakGroundSpeed) {
                peakGroundSpeed = spdBefore;
              }
            }
          }
          if (steps === 1) {
            statePrev = stateCurr;
          }
          stateCurr = stNow;
        }
        simTimeMs += steps * MS_PER_STEP;
        simStepIdx += steps;
        frameSteps = steps;
        /* Launch stand constraint runs inside sim_step. Ground contact
         * runs after plant_step at 1 kHz when the plane is raised. */
        flightLog.push(stateCurr, rcHeld, FULL_THROTTLE_RPM);
      }
      /*
       * Ground is a plane in the plant, not a sphere test after the
       * frame. height() still picks the deck vs the street (fromY is the
       * craft centre minus SURFACE_BIAS, the same rule that stopped the
       * overbridge from becoming a floor for a quad flying under it).
       * Perch freezes the integrator only when the hull is upright, slow
       * and in contact. Everything else keeps stepping: a skip, a slide,
       * a tumble. Turtle waits until inverted, seated and still, then
       * a pitch or roll poke plays a guaranteed flip.
       */
      poseFromState(stateCurr, pProbe);
      groundPrev.copy(pProbe);
      groundHasPrev = true;
      simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qCollide);
      qCollide.premultiply(qSpawn);
      vHalfFrame = craftVerticalHalf(Math.sqrt(1 - craftUpY() * craftUpY()));
      const surf = view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS);
      const clearance = pProbe.y - surf;
      const hits = launchStaging ? 0 : sim.e.sim_ground_contacts();
      const upz = plantUpZ(stateCurr);
      const uClamp = upz > 1 ? 1 : upz < -1 ? -1 : upz;
      const tiltDeg = (Math.acos(uClamp) * 180) / Math.PI;
      const speed = Math.sqrt(
        stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5] + stateCurr[6] * stateCurr[6],
      );
      const rate = plantRateMag(stateCurr);
      lastDescent = -stateCurr[6];
      lastTiltDeg = tiltDeg;
      lastGroundHits = hits;
      lastClearance = clearance;
      lastUpz = upz;
      speedNow = speed;
      turtleOnSupport = hits > 0;
      if (takingOff) {
        /*
         * A LEAVING TEST, not a height. clearance - REST_HEIGHT > 0.05
         * assumed a level hull: REST_HEIGHT is the level craft's reach
         * below its own centre, and a craft leaving a stand is not level.
         * At 28 degrees the hull reaches 0.10 m down, so the old test
         * called the departure finished while the plant was still
         * reporting contacts, and everything downstream that trusts
         * `takingOff` was reading a craft that had not left. vHalfFrame is
         * this frame's own tilt aware extent, and hits and sawGroundHit
         * are what the plant actually saw across the frame's steps.
         */
        if (hits === 0 && !sawGroundHit && clearance > vHalfFrame + 0.05) {
          takingOff = false;
          lcBoost = false;
        } else if (!lcBoost) {
          const thrNow = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
          /* TAKEOFF_RELEASE, not TAKEOFF_THROTTLE. Coming back down to the
           * same number that sent the craft up is what let one thumb
           * position sit on both sides of the latch. */
          if (thrNow <= TAKEOFF_RELEASE && hits > 0 && canPerch(tiltDeg, speed, rate)) {
            takingOff = false;
          }
        }
      }
      if (
        !launchStaging
        && !takingOff
        && hits > 0
        && canPerch(tiltDeg, speed, rate)
        && !turtleWait
        && !turtleFlip.active
      ) {
        sim.rest();
        landed = true;
        takingOff = false;
        adoptSimClock();
        groundY = surf;
        stateCurr = readState();
        statePrev = stateCurr;
        acc = 0;
        if (typeof audio.event === 'function'
          && nowWall - groundCueAtWall >= GROUND_CUE_GAP_MS) {
          groundCueAtWall = nowWall;
          audio.event('land');
        }
      } else if (
        (hits > 0 || sawGroundHit)
        && nowWall - groundBounceAtWall > BOUNCE_COOLDOWN_MS
      ) {
        const closing = peakGroundClosing;
        /*
         * peakGroundSpeed alone. It floored on `speed`, the END OF FRAME
         * total speed, which no contact in the frame need ever have had: a
         * frame that brushed the grass at 0.1 m/s and finished at 6 m/s
         * scored a 6 m/s hit and played the crash cue for it. Worse, the
         * frame is wall time and dt is capped at 100 ms, so how hard the
         * hit sounded depended on the frame rate, which is the one thing
         * CLAUDE.md says must never reach the game. Both numbers here are
         * now sampled at a step that actually reported contact.
         */
        const hitSpeed = peakGroundSpeed;
        if (closing >= GRAZE_SPEED_MAX || hitSpeed >= GRAZE_SPEED_MAX) {
          bounceCount += 1;
          /*
           * The ground, for scoring, on the line collide.js has already
           * drawn rather than a new one: under BOUNCE_SPEED_MAX the bounce
           * model applies and hitOutcome calls it a bounce, at or over it
           * hitOutcome calls it a crash. So a bounce is a BUMP and a crash
           * bails the combo. No third threshold, because a third threshold
           * is a number nobody can defend six months later.
           */
          if (view.mode === 'freestyle') {
            const hard = closing >= BOUNCE_SPEED_MAX || hitSpeed >= BOUNCE_SPEED_MAX;
            if (hard) {
              trickDetector.reset();
              score.crash();
            } else {
              /* NOT TAPPABLE: this is the ground. See TrickDetector.bump. */
              trickDetector.bump(undefined, false);
            }
          }
          /* No banner. The owner's instruction: the sound is enough, and
           * so is the feel. Naming the thing you just hit on screen tells
           * a pilot what they already watched happen, and it does it over
           * the top of the next gate. */
          feelImpact(closing > hitSpeed ? closing : hitSpeed, 'ground');
        }
        groundBounceAtWall = nowWall;
      }
      }
    } else if (mode === 'flight' && landed) {
      /*
       * Sitting on the ground. The integrator does NOT step: a perch is
       * rest, so the craft is held by not advancing it. sim_rest zeroed
       * velocity at the judgement, so a takeoff resumes from a true rest
       * state. The lap clock DOES keep running.
       */
      acc += dt;
      let steps = Math.floor(acc / MS_PER_STEP);
      acc -= steps * MS_PER_STEP;
      simTimeMs += steps * MS_PER_STEP;
      /*
       * THE TWO CLOCKS HAVE TO STAY LEVEL.
       *
       * simTimeMs advances here and the recogniser is not stepped, because
       * a quad sitting on the grass must not score a Yaw Spin off the gyro
       * noise. But the SCORER is ticked on simTimeMs and measures its combo
       * window from a trick's endMs, which is on the recogniser's clock, so
       * letting the two drift apart meant that after three seconds on the
       * ground every combo banked on the very next tick at a multiplier of
       * one. Every run starts landed, so every run started with them apart.
       *
       * idle() advances the clock and the stall counter and reads no motion
       * at all, which is the truth about a craft that is not moving.
       */
      trickDetector.idle(steps * MS_PER_STEP);
      adoptSimClock();
      statePrev = stateCurr;
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
    if (landed && !poseLock) {
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
    }
    shell.quad.position.copy(pCurr);
    shell.quad.quaternion.copy(qPrev);

    /*
     * The solid world was resolved inside the step loop above, on the sim
     * clock, once every OBSTACLE_STEP milliseconds. See
     * obstacleContactPass. What is left here is reading what it found.
     *
     * A perch or a turtle freeze does not step the plant, so the pass
     * never runs in those states and a hull that sat down inside a wall
     * would go unmeasured. That one case is still queried at frame rate,
     * below, because there is no sim clock advancing to hang it on.
     */
    speedNow = Math.sqrt(
      stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5] + stateCurr[6] * stateCurr[6],
    );
    let leftoverOverlap = obsLeftover;
    let interiorDepth = obsInterior;
    let roofContact = obsRoof;
    const frameContact = obsContact;
    const frameTouched = obsTouched;
    const frameClosing = obsClosing;
    if (obsRoof) {
      turtleOnSupport = true;
    }
    /*
     * THE RECOGNISER IS TOLD ON CONTACT, not on impulse.
     *
     * Separate from the bounce cue below, which stays on obsImpulse
     * because that is what the pilot hears and feels and changing it would
     * change the feel. A Wall Tap, Wall Ride, Loop Tap and Downtown Tap
     * all need to know the hull touched something; whether the solver had
     * any normal velocity left to solve is not their business. Classified
     * on the closing speed, so GRAZE_SPEED_MAX still separates the
     * deliberate touch from the smack it was written to separate it from.
     */
    if (view.mode === 'freestyle' && frameTouched
      && simTimeMs - trickTouchAtSimMs >= BOUNCE_COOLDOWN_MS) {
      trickTouchAtSimMs = simTimeMs;
      trickDetector.bump(frameClosing);
    }
    if (obsImpulse > 0) {
      /* One cue per frame at the hardest impulse the pass applied, not one
       * per contact: a corner is two faces in the same millisecond and
       * firing twice reads as a stutter rather than as a harder hit. The
       * cooldown that used to gate this is gone with the banner it was
       * really protecting. */
      if (nowWall - bounceAtWall >= BOUNCE_COOLDOWN_MS || obsImpulse > lastImpulse * 1.6) {
        bounceCount += 1;
        feelImpact(obsImpulse, obsImpulseKind);
        /* The workbook's BUMP: "complete trick, but tapped a gate, wall or
         * the ground without disarming". Half the trick's points and half
         * the streak, and the combo survives, because in the air a clipped
         * branch is not a bail. */
        bounceAtWall = nowWall;
        view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
      }
      lastImpulse = obsImpulse;
    } else if (nowWall - bounceAtWall > BOUNCE_COOLDOWN_MS) {
      lastImpulse = 0;
    }
    obsContact = false;
    obsTouched = false;
    obsClosing = 0;
    obsLeftover = false;
    obsInterior = 0;
    obsRoof = false;
    obsImpulse = 0;
    obsImpulseKind = '';
    if (
      mode === 'flight'
      && !launchStaging
      && !crashed
      && (landed || turtleParkedNow)
    ) {
      /* Level pancake: the last flying vHalfFrame can be a banked fat
       * query. */
      const rest = view.colliders.hit(
        pCurr.x, pCurr.y, pCurr.z,
        pCurr.x, pCurr.y, pCurr.z,
        craftVerticalHalf(0),
        qPrev.x, qPrev.y, qPrev.z, qPrev.w,
      );
      if (rest >= 0) {
        leftoverOverlap = true;
        interiorDepth = view.colliders.interiorOfHit(pCurr.x, pCurr.y, pCurr.z);
        if (!(interiorDepth > CLIP_CENTER_EPS) && view.colliders.hitNy > 0.5) {
          roofContact = true;
        }
      }
    }

    /* Sim milliseconds elapsed since the last frame. Clamped the same way
     * the wall delta is, and never negative, so a reset that puts the lap
     * clock back to zero cannot hand a watch a negative age. */
    let simStepMs = simTimeMs - simClockPrevMs;
    if (!(simStepMs > 0)) {
      simStepMs = 0;
    } else if (simStepMs > 100) {
      simStepMs = 100;
    }
    simClockPrevMs = simTimeMs;

    if (mode === 'flight' && !poseLock) {
      const hy = view.height(pCurr.x, pCurr.z, pCurr.y - SURFACE_BIAS);
      const buriedDepth = hy > pCurr.y ? hy - pCurr.y : 0;
      /* Ticked on the SIM clock, not the wall clock. Every threshold in
       * the watch is a duration, and while it counted frame deltas a
       * stutter aged it as fast as real time did: a machine that dropped
       * to 8 fps could confirm a 180 ms clip in two frames of a craft that
       * had barely moved. frameSteps is the milliseconds the plant
       * actually advanced, which is what those thresholds meant all along.
       * On a perch or a turtle the plant is frozen but the lap clock still
       * runs, and simTimeMs advances with it, so this stays honest there
       * too. */
      const clipKind = clipWatchTick(clipWatch, {
        landed,
        turtle: turtleWait || turtleFlip.active,
        launchStaging,
        hold: crashed,
        poseLock,
        /*
         * `&& landed` used to be here, which switched the spawn grace off
         * at the exact moment it was needed: it exists to ignore leftover
         * overlap with a stand, a pole or a pad, and leftover overlap is
         * what a craft LEAVING one has. The departure window is in for the
         * same reason.
         */
        spawnGrace: nowWall < clipGraceUntil
          || nowWall < recoverGraceUntil
          || nowWall < takeoffUntil,
        takingOff,
        unresolved: leftoverOverlap,
        roofContact,
        interiorDepth,
        buriedDepth,
        contact: frameContact,
        rateMag: plantRateMag(stateCurr),
        throttle: input.channels.throttle,
        x: pCurr.x,
        y: pCurr.y,
        z: pCurr.z,
      }, simStepMs);
      if (clipKind) {
        beginClipCrash(clipKind, nowWall);
      }
    }

    if (
      mode === 'flight'
      && !poseLock
      && !launchStaging
      && !crashed
      && stateCurr
      && !turtleWait
      && !turtleFlip.active
    ) {
      tryEnterTurtle(stateCurr, turtleInContact());
    }
    if (isTurtleParked() && !turtleParkedNow) {
      setTurtleParkMotors(true);
    }

    /* Race logic runs on the rendered world position, timed on the sim
     * clock at that state: gate crossings are swept over the frame's
     * travel, so speed cannot tunnel a gate. */
    const simNow = simTimeMs > 0 ? simTimeMs - 1 + a : 0;
    if (mode === 'flight' && !launchStaging && !crashed) {
      if (raceHasPrev) {
        /* The race's state from before this frame's travel is scored, so
         * the ghost bookkeeping can see a lap boundary without the race
         * having to announce one. */
        const lapStartBefore = race.lapStartMs;
        const lapsBefore = race.laps.length;
        const allowPass = shouldScorePass(racePrev, pCurr, {
          upz: lastUpz,
          clearance: lastClearance,
          hits: lastGroundHits,
          heightAt: (x, z, y) => view.height(x, z, y - SURFACE_BIAS),
        });
        const res = race.update(racePrev, pCurr, simNow, nowWall, allowPass);
        if (res.passed != null) {
          view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
          if (typeof audio.event === 'function') {
            audio.event('gate');
          }
        }
        ghostOnRaceStep(simNow, nowWall, lapStartBefore, lapsBefore, res.passed != null);
        if (!race.freestyle && race.lap >= runLaps) {
          mode = 'results';
          if (turtleWait || turtleFlip.active) {
            if (turtleWait && !turtleFlip.active) {
              beginTurtleFlip();
            }
            finishTurtleFlip();
          }
          setCrashflip(false);
          turtleRecover = false;
          turtleOnSupport = false;
          setTurtleParkMotors(false);
          poseLock = false;
          ui.setBest(race.bestMs, view.mode);
          ui.showResults(race.log, race.bestMs, race.recordAtStart, ghostResultNote());
        }
      }
      racePrev.copy(pCurr);
      raceHasPrev = true;
      /* This frame becomes the seed for a lap that starts on the next one. */
      ghostPrev.valid = true;
      ghostPrev.simMs = simNow;
      ghostPrev.x = pCurr.x;
      ghostPrev.y = pCurr.y;
      ghostPrev.z = pCurr.z;
      ghostPrev.qx = qPrev.x;
      ghostPrev.qy = qPrev.y;
      ghostPrev.qz = qPrev.z;
      ghostPrev.qw = qPrev.w;
    }
    ghostFrame(simNow);

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
    /*
     * The attract shot runs behind the launch card too.
     *
     * worldLive listed title, courses, flight, paused and results, so the
     * one screen between the title and the flight was the one screen with
     * the canvas hidden: a pilot went from a world, to a flat dark panel,
     * to the same world again, and the card in the middle read as a load
     * rather than as a step. The title already proves a panel can sit over
     * a live field, and this card has less on it than the title does.
     */
    const attractOn = !freezeWorld && mode === 'title'
      && (ui.screen === 'title' || ui.screen === 'launch');
    const studioOn = ui.screen === 'quad';
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
    {
      /* Near plane is 0.2 m. Camera-down or inverted on the grass puts
       * the lens inside that band, so the terrain is clipped even when
       * the mount is a centimetre above the mesh. Lift only when the
       * picture looks into the dirt; a high inverted pass stays put. */
      const camFloor = view.height(fpvPos.x, fpvPos.z, fpvPos.y - SURFACE_BIAS)
        + fpvLensClear(camFwd.y, camUp.y);
      if (fpvPos.y < camFloor) {
        fpvPos.y = camFloor;
      }
      lastCamFloor = camFloor;
      lastCamClear = fpvLensClear(camFwd.y, camUp.y);
      lastCamFwdY = camFwd.y;
      lastCamUpY = camUp.y;
    }
    const wantLift = (landed || launchStaging || turtleWait || turtleFlip.active) && !poseLock
      ? PARKED_LIFT
      : 0;
    parkedLift += (wantLift - parkedLift) * Math.min(1, dt * 0.006);
    if (parkedLift > 0.001) {
      fpvPos.y += parkedLift;
    }
    lastFpvY = fpvPos.y;
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
      /* Plus whatever the last contact threw the airframe by. The camera
       * is bolted to the frame, so a hit moves the picture; with the hit
       * banners gone this and the sound are the whole of what the pilot is
       * told. Decayed on the wall clock and added here, at the one place
       * that already rotates the lens, so it is render only and no
       * trajectory can depend on it. */
      decayImpactKick(dt);
      qShake.setFromEuler(shakeEuler.set(
        shake.x + impactKick.x,
        shake.y + impactKick.y,
        shake.z + impactKick.z,
        'XYZ',
      ));
      fpvQuat.multiply(qShake);
    }

    if (mode !== 'results' && finishCamMs >= 0) {
      finishCamMs = -1;
    }

    /*
     * ONCE THE QUAD HAS ACTUALLY LEFT THE GROUND, THE PAD SHOT IS OVER.
     *
     * Throttle skipped the orbit and the approach, but it still played the
     * 1 s zoom, and the takeoff branch waits for nothing. So a pilot who
     * throttled up on the pad flew from a third person camera that was
     * still dollying in: measured airborne at 2.87 m with the airframe and
     * both prop discs across the bottom half of the frame. They are flying
     * a quad they cannot see out of, at the one moment they most need to.
     *
     * The test is `landed` rather than a phase of the shot, and that matters:
     * the throttle skip needs the stick to cross TAKEOFF_THROTTLE, and a
     * quad can leave the ground on a stick that never does. A capture found
     * exactly that, flying the whole orbit at 13.7 m. Airborne is airborne.
     *
     * It sits ABOVE the camera chain, not inside the intro's own branch,
     * because ending the shot has to release the camera in the same frame.
     * Inside the branch the next line adds dt and the shot came back to
     * life at 99 ms, which is how this ended up being written twice.
     *
     * A pilot who leaves the throttle down still gets the whole shot.
     */
    if (introMs >= 0 && mode === 'flight' && !landed) {
      introMs = -1;
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

      /*
       * THE ORBIT PLANE HAS TO BE LEVEL, AND IT USED TO INHERIT THE RAMP.
       *
       * This built its basis from camFwd, which is the CRAFT's forward, and
       * a craft parked on a launch block is pitched up the ramp by
       * startBlockDims().tilt, 28 degrees. So the whole orbit plane tilted
       * 28 degrees with it, and the camera dived below the craft for the
       * half of the sweep where sin(theta) is positive. The sweep ENDS at
       * theta = INTRO_THETA0 - 300 degrees, which is almost exactly where
       * sin(theta) = +1, so it ended at its lowest point every single time:
       * the camera finished the pan 0.138 m above the dirt with the block's
       * own deck at 0.247 m, which is inside the launch block, and the zoom
       * then dollied to the FPV lens from in there. That is the report,
       * "as camera pans into launch blocks, disappears into ground". On
       * flat ground camFwd is level, the term is zero and nothing showed.
       *
       * introFwd is the same heading flattened onto the ground plane, so
       * the shot keeps its shape and loses the ramp. introRight comes from
       * it by cross product rather than from qPrev, so the basis is
       * orthonormal and level by construction and a rolled craft cannot
       * tilt it either. On flat ground this is identical to what it was.
       */
      introFwd.copy(camFwd);
      introFwd.y = 0;
      if (introFwd.lengthSq() < 1e-6) {
        /* Nose straight up or down: no heading to flatten, so take the
         * spawn's. */
        introFwd.set(0, 0, -1).applyQuaternion(qSpawn);
        introFwd.y = 0;
      }
      introFwd.normalize();
      introRight.copy(introFwd).cross(introUp);
      introFrom.copy(pCurr)
        .addScaledVector(introRight, Math.cos(theta) * radius)
        .addScaledVector(introFwd, -Math.sin(theta) * radius)
        .addScaledVector(introUp, height);
      /* And the same floor the finish camera keeps, for the same reason:
       * the pad shot is deliberately low and the ground under it is not
       * flat, so a berm, a kerb or the block itself can still swallow the
       * lens. Queried the way every other ground test here is, so the
       * camera and the contact test cannot disagree about where the
       * surface is. */
      const introFloor = view.height(introFrom.x, introFrom.z, introFrom.y)
        + INTRO_FLOOR_CLEAR;
      if (introFrom.y < introFloor) {
        introFrom.y = introFloor;
      }
      /* Orbit looks at the airframe. Approach turns the look down the
       * course so the zoom is a dolly into the FPV camera, not a snap.
       * Level forward here too: aimed along the ramp it pointed at the sky
       * instead of at the course. */
      introLook.copy(pCurr)
        .addScaledVector(introUp, 0.04 + 0.04 * approachU)
        .addScaledVector(introFwd, 0.08 + 1.4 * approachU);
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

    /*
     * The title camera frames itself around the menu with a LENS SHIFT, and
     * a lens shift is state that lives on the camera rather than a value
     * recomputed every frame. The shell has one camera, so a shift left on
     * it would follow the pilot into flight and put the horizon off centre
     * for the whole run. The branches above restore the flight fov the same
     * way and for the same reason; this is the other half of it, in one
     * place because every branch that is not the attract camera wants the
     * offset gone. Cheap: a property read on the frames it is already off.
     */
    if (!(mode === 'title' && !camOverride)
        && shell.camera.view && shell.camera.view.enabled) {
      shell.camera.clearViewOffset();
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
    /*
     * The frame cap skips only this draw. Input was polled above, the
     * physics accumulator has already stepped, and the interpolation is
     * ready for whenever the next drawn frame comes, so a capped frame
     * costs the pilot nothing but the picture it deliberately skips. The
     * one millisecond of slack keeps a 60 cap from beating against a
     * 60 Hz display and drawing every other frame.
     */
    const capHz = Number(ui.settings.fpsCap) || 0;
    let drawThis = !harnessNoDraw;
    if (capHz > 0 && worldLive) {
      if (nowWall - capLastDraw < 1000 / capHz - 1.0) {
        drawThis = false;
      } else {
        capLastDraw = nowWall;
      }
    }
    if (worldLive && drawThis) {
      view.post.render();
    }
    if (ui.screen === 'courses') {
      ui.paintMapThumbs(shell.canvas);
    }
    const renderMs = performance.now() - renderStart;
    if (drawThis) {
      renderStats.calls = shell.renderer.info.render.calls;
      renderStats.triangles = shell.renderer.info.render.triangles;
    }

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
     * !landed`, and every other state freezes it: the title
     * screen, the pause menu, the results screen, and
     * every second the craft sits perched. A frozen state still carries the
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
    const motorsTurning = mode === 'flight' && !landed && !crashed && !isTurtleParked();
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
      /*
       * The score, on the SIM clock. Ticking it on the wall clock would
       * bank a combo through a stall in the render loop and would make the
       * combo window shorter on a slow machine, which is exactly the class
       * of frame-rate dependence CLAUDE.md keeps out of the game.
       */
      /*
       * HOW NEAR THE CRAFT IS TO SOMETHING SOLID, once a frame.
       *
       * A Wall Ride never touches the wall, so no contact fires and the
       * recogniser cannot tell it from banking round a corner. This is the
       * one thing that separates them, and it is affordable because it is a
       * SINGLE broadphase query per frame with an inflated radius, using
       * the same swept test the contact pass already makes sixty times a
       * second. A query per physics step would be sixty times the work for
       * an answer that does not change that fast.
       *
       * A miss means nothing solid within WALL_NEAR_M, which the detector
       * reads as open sky.
       */
      if (view.mode === 'freestyle' && view.colliders) {
        const q = shell.quad.position;
        trickDetector.near(view.colliders.gapAt(q.x, q.y, q.z, WALL_NEAR_M));
      }
      if (view.mode === 'freestyle') {
        const wasOver = score.over();
        score.tick(simTimeMs);
        const scoreView = score.view();
        scoreState = scoreView.state;
        scoreRemainMs = scoreView.remainMs;
        ui.setScore(scoreView);
        ui.scoreEvents(score.drainEvents());
        /*
         * THE HORN.
         *
         * A freestyle run is two minutes and it now ENDS, which is the whole
         * reason a freestyle score can be posted at all: before this the
         * total climbed from the moment the world loaded until something
         * reset it, so the top of any board would have been whoever left the
         * tab open longest.
         *
         * It goes to the same results screen a race ends on. The screen
         * already knew a freestyle run has no lap and no track to publish;
         * it now knows what a run IS, and carries a row to post it.
         *
         * Read off score.over() rather than off the drained event, because
         * the events are the HUD's and draining them here to look for one
         * would take it off the overlay that is meant to show it.
         */
        if (!wasOver && score.over()) {
          endFreestyleRun();
        }
      }
      const p = shell.quad.position;
      const nextGt = view.gates && view.gates[race.nextSceneIndex()];
      ui.setOsd({
        mode: view.mode,
        lapMs: race.freestyle ? airtimeMs : race.currentLapMs(simNow),
        /* The freestyle clock is the RUN's, counting down, and it is the
         * only clock on the screen: see setOsd. Read straight off the
         * scorer, which is the thing that decides when the run ends, rather
         * than off a second copy that could disagree with it. */
        runState: scoreState,
        runTimed: score.timed,
        runRemainMs: scoreRemainMs,
        gate: race.next + 1,
        gateCount: race.gates.length,
        gateCue: nextGt && nextGt.cue ? nextGt.cue : '',
        volts: st[18],
        lastLapMs: race.lastLapMs,
        packFrac: (st[18] - PACK_EMPTY_V) / (PACK_FULL_V - PACK_EMPTY_V),
        /* The same biased fromY every contact query in this file uses, and
         * for the same reason: the city's height walker takes any platform
         * within a step of fromY as the floor, so an unbiased query from the
         * craft's own height finds the deck the quad is UNDER rather than
         * the road it is over, and the readout prints a negative altitude
         * under the overbridge. See SURFACE_BIAS. */
        altitude: p.y - view.height(p.x, p.z, p.y - SURFACE_BIAS),
        speedKph: speed * 3.6,
        throttle: input.channels.throttle,
        flightMode: (turtleWait || turtleFlip.active) ? 'turtle' : (angleModeOn ? 'angle' : 'acro'),
        /* No damage model, so nothing to count down. How much this run has
         * bounced is still worth telling a pilot, and the OSD says nothing
         * at all until there is something to say. */
        bounces: bounceCount,
        /* Native state 3 latches until the L switch drops. The GO flash
         * is 900 ms; after that the overlay has to hide or it sits on
         * the goggles for the rest of the lap. */
        launchState: (crashflipOn || turtleRecover || crashed) ? 0 : (launchNow === 3 && nowWall >= lcGoUntil ? 0 : launchNow),
        launchPitch: pitchNoseDownDeg(st),
        /* The gap to the ghost at the last gate, while its readout lives.
         * Null the rest of the time, which is how the OSD knows to clear. */
        ghostGapMs: ghostGap && nowWall < ghostGap.untilWall ? ghostGap.deltaMs : null,
        ghostFinal: Boolean(ghostGap && ghostGap.final),
      });
      const ch = input.channels;
      const vis = turtleAxes(ch.roll, ch.pitch);
      ui.setStickOverlay({
        show: input.isKeyboardPrimary() && !input.isTouchPrimary(),
        roll: vis[0],
        pitch: vis[1],
        yaw: ch.yaw,
        throttle: ch.throttle,
      });
      updateTargetLock();
    } else if (mode !== 'paused') {
      ui.setStickOverlay({ show: false, roll: 0, pitch: 0, yaw: 0, throttle: 0 });
      ui.setTargetLock(LOCK_OFF);
    }
    /*
     * The thumb sticks live in FLIGHT and nowhere else. Over any menu
     * their catchment would sit on top of the rows (the overlay is the
     * last child of #ui on purpose, so it beats every screen in flight),
     * and beside a connected radio they would be a second pair of sticks,
     * the same rule the keyboard ghost follows. The OSD corners move in
     * under the timer while they are up; see .touch-fly-on in index.html.
     */
    /* The Setup tab's horizon rides the plant quaternion, live. */
    if (ui.screen === 'fc' && stateCurr) {
      ui.fc.attitude = {
        w: stateCurr[7],
        x: stateCurr[8],
        y: stateCurr[9],
        z: stateCurr[10],
      };
      ui.paintFcAttitude();
    }
    if (touch) {
      const touchOn = mode === 'flight' && ui.screen === 'flight' && !input.firstGamepad();
      /*
       * The one-time thumb-rates hand-off, at the first moment touch is
       * actually about to fly. A fresh touch profile was already seeded
       * by loadSettings; this catches the OTHER pilot, an existing
       * profile still on the stock defaults, whose 670-no-expo is a
       * gimbal calibration and reads as "way too fast" on glass, which
       * is the report this answers. A pilot who chose their own rates is
       * respected: the flag still flips so this never asks again, and
       * their numbers are not touched.
       */
      if (touchOn && !ui.settings.touchRatesOffered) {
        ui.settings.touchRatesOffered = true;
        if (ratesAreDefault(ui.settings.rates)) {
          ui.settings.rates = normaliseRates(TOUCH_RATE_DEFAULTS);
          notice = {
            text: 'Rates eased for thumb flying.\n450 deg/s with expo. Yours to change on the Rates screen.',
            untilMs: performance.now() + 4200,
          };
        }
        ui.persistSettings();
        applySettings(ui.settings);
      }
      touch.setVisible(touchOn);
      uiRoot.classList.toggle('touch-fly-on', touchOn);
      touch.paint();
    }
    uiRoot.classList.toggle('turtle-on', crashflipOn || turtleRecover);

    const cal = input.calibrationView();
    const lapFlash = race.flashText(nowWall);
    /* Computed once: guidedPrompt retires the guided flag as a side effect,
     * so calling it in a condition and again in the body would consume it. */
    const guidedText = (
      ui.guided
      && !crashflipOn
      && !turtleRecover
      && lastUpz >= 0
    ) ? guidedPrompt(race) : '';
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
        ui.show('pilot');
        if (input.calResult === 'saved') {
          notice = { text: 'Stick mapping saved.', untilMs: nowWall + 2800 };
        }
        input.calResult = null;
      }
      ui.setBanner('');
    } else if (crashed && ui.screen === 'flight') {
      ui.setBanner('Crashed', true);
    } else if (
      (turtleWait || turtleRecover || turtleFlip.active)
      && ui.screen === 'flight'
    ) {
      ui.setBanner(turtleBannerText(), true);
    } else if (notice && nowWall < notice.untilMs && !(launchNow > 0) && !crashflipOn) {
      ui.setBanner(notice.text);
    } else if (ui.isModal()) {
      /* A banner is a flight message. Any screen that is up owns the
       * frame, and a launch prompt printed across a results table is how
       * you find that out. */
      ui.setBanner('');
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
          ? 'L for launch control, or throttle up\nTwo minutes. The clock starts on your first trick.'
          : 'L for launch control, or throttle up\nThe green gate starts your lap')
        : (race.freestyle
          ? 'Throttle up to take off\nTwo minutes. The clock starts on your first trick.'
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
      const paceLine = (view && view.post && view.post.size)
        ? `\n${view.post.size.x}x${view.post.size.y} scale ${(view.post.scale || 0).toFixed(2)}`
        : '';
      ui.setReadout(
        `${fps.toFixed(0)} frames per second\n` +
        `${renderStats.calls} draw calls\n` +
        `${(renderStats.triangles / 1000).toFixed(0)}k triangles` +
        `${paceLine}\n` +
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
    if (view && view.post && typeof view.post.applyPace === 'function') {
      pace.observe(dt, renderMs, blockMs, view.post);
      if (pace.state.dirty) {
        if (view.post.applyPace(pace.state.want)) {
          pace.state.cool = PACE_COOL;
          pace.state.changes += 1;
        }
        pace.state.dirty = 0;
      }
    }
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
    /*
     * A HIDDEN TAB PAUSES, THE WAY EVERY OTHER GAME DOES.
     *
     * Muting the mix was the whole handler. Nothing exploded without this,
     * because rAF stops while hidden and the accumulator caps the return at
     * 100 ms, but the pilot who alt-tabbed mid lap came back to a live FPV
     * view and a quad that resumed at speed in the same frame the window
     * did, with the last 100 ms of stick history behind it. The lap clock
     * kept the time honestly, which made it worse: the run was still
     * running and they were not flying it.
     *
     * These are the two calls Escape makes, and nothing else, so a return
     * lands on the pause menu the pilot already knows how to leave.
     */
    if (mode === 'flight' && ui.screen === 'flight') {
      ui.act('pause');
      ui.show('paused');
    }
  });
  let firstFrameMs = -1;
  let frames = 0;
  /* Render statistics for the harness and the frame budget gate. */
  const renderStats = { calls: 0, triangles: 0 };
  const pace = createPace();
  shell.renderer.info.autoReset = false;
  window.__renderStats = () => ({ ...renderStats });
  window.__pace = () => ({
    emaMs: pace.state.emaMs,
    renderEma: pace.state.renderEma,
    shellEma: pace.state.shellEma,
    p95Ms: pace.p95(),
    dtN: pace.state.dtN,
    scale: pace.state.scaleNow,
    ceil: pace.state.ceil,
    floor: pace.state.floor,
    want: pace.state.changes ? pace.state.want : pace.state.ceil,
    cpuBound: pace.state.cpuBound,
    changes: pace.state.changes,
    warm: pace.state.warm,
    rw: pace.state.rw,
    rh: pace.state.rh,
    fps,
    gpu: gpuInfo ? {
      name: gpuInfo.name,
      display: gpuInfo.display,
      software: gpuInfo.software,
      raw: gpuInfo.raw,
    } : null,
  });
  window.__paceReset = () => {
    pace.resetSamples();
    return pace.state.dtN;
  };
  window.__scaleAt = (w, h) => {
    const id = view && view.id;
    const q = qualityFor(ui.settings.graphics);
    /* The city's block is the fallback now that it is the only freestyle
     * world: the previous default was the bando's and the bando is gone. Any
     * id with no block of its own is the race field, whose scale is the
     * session's rather than a map pipeline's, so the branch is a shape the
     * caller can rely on rather than a meaningful answer. */
    const mapQ = id && q[id] ? q[id] : q.city;
    const user = view && view.post && view.post.userScale != null
      ? view.post.userScale
      : renderScaleOf(ui.settings);
    const force = view && view.post ? view.post.forceScale : null;
    const scale = internalScale(w, h, mapQ, force, user);
    const ceil = internalScale(w, h, mapQ, null, user);
    const floor = internalScale(w, h, mapQ, 0, user);
    return {
      w,
      h,
      scale,
      ceil,
      floor,
      rw: Math.floor(w * scale),
      rh: Math.floor(h * scale),
      pixels: Math.floor(w * scale) * Math.floor(h * scale),
      budget: mapQ.pixelBudget,
      map: id,
      graphics: q.id,
    };
  };
  /*
   * What the GPU is holding, for scripts/memory-check.js. Three.js counts
   * live geometries and textures itself, and those two numbers are the ones
   * that say whether a map's dispose actually gave the memory back or only
   * stopped drawing it. A lazy load that never frees is a leak with extra
   * steps, and on a laptop it is the difference between switching maps twice
   * and switching maps until the tab dies.
   */
  window.__gpuMemory = () => ({
    geometries: shell.renderer.info.memory.geometries,
    textures: shell.renderer.info.memory.textures,
    programs: shell.renderer.info.programs ? shell.renderer.info.programs.length : 0,
  });
  /* Handles the screenshot harness uses to reach a screen that would
   * otherwise need a flown lap. Nothing in the shell reads them. */
  window.__ui = ui;
  /* The input layer, for the same reason: the radio dead ends cannot be
   * exercised from the shell alone, because the thing that is broken is
   * what a gamepad reports, and headless Chromium has no gamepad. The
   * checks drive it with a fake pad. */
  window.__input = input;
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
  /*
   * The freestyle score. A reader and a writer, for the same reason
   * __setRaceNext has both: a screenshot of the score overlay has to be
   * able to put a known score on it, and every other route to one involves
   * flying a Rubik's Cube in a headless browser on a software rasteriser.
   * The writer goes through score.land, so what it captures is the real
   * scoring path and not a mock of it.
   */
  window.__score = () => score.summary();
  /*
   * The recogniser itself, so a probe can watch what it does rather than
   * only what it says. Every "verified" trick in this repo's history was
   * checked against a CONSTRUCTED flight: an exact circle, a constant turn
   * rate, a nose pointed by arithmetic. Those flights pass things a flown
   * one does not, and the gap is where the owner's "not picking up at all"
   * lives. A probe holding this can patch closePath and read the laps a
   * REAL stick input produced. Harness only; nothing in the shell reads it.
   */
  window.__trickDetector = () => trickDetector;
  /* What the map offered up to fly around, for the audit in
   * scripts/obstacle-audit.js and for check 16's eyes. */
  window.__obstacleField = () => obstacles;
  window.__obstacles = () => (obstacles
    ? {
      count: obstacles.count,
      poles: obstacles.countOf(OB_POLE),
      bars: obstacles.countOf(OB_BAR),
    }
    : null);
  window.__scoreTrick = (name, execution) => {
    score.tick(simTimeMs);
    /*
     * MARKED, because this is not flying.
     *
     * The run summary carries the flag out to the results screen and the
     * post path refuses it there, so a screenshot rig cannot put a
     * fabricated score on a public table. It is on the TRICK rather than
     * on the scorer so that score.js needs no knowledge of a harness: it
     * simply records that something it was handed said it was staged.
     */
    const r = score.land({
      name, execution: execution || 'CLEAN', endMs: simTimeMs, assisted: true,
    });
    return r && { name: r.name, net: Math.round(r.net), combo: score.view().combo };
  };
  /* The horn, staged, for the same reason the bail is: a real one is two
   * minutes of flying that a headless browser on a software rasteriser
   * cannot be asked for. Same path as the real one, no mock. */
  window.__scoreFinish = () => {
    score.finish();
    endFreestyleRun();
    return score.summary();
  };
  /* The bail, staged. There is no other way to photograph the one screen
   * that matters most in this mode: a real bail needs a real crash, and a
   * crash in a headless browser on a software rasteriser is a twenty step
   * flight nobody can reproduce. Same path as the real one, no mock. */
  window.__scoreCrash = () => {
    trickDetector.reset();
    score.crash();
    return score.summary();
  };
  /*
   * The gap to the nearest solid at a point, in metres, by exactly the
   * query the freestyle recogniser is fed. Harness only, and it exists
   * because "a Wall Ride was flown near a wall" is a claim about a number
   * nothing else in the shell reports. See WALL_NEAR_M.
   */
  window.__nearSolid = (x, y, z, r = WALL_NEAR_M) => {
    if (!view.colliders) {
      return null;
    }
    return view.colliders.gapAt(x, y, z, r);
  };
  /* What is solid, and how well the broadphase is doing. */
  /*
   * THE CONTACT COUNTERS, so a probe can tell a wall it touched from a wall
   * it stopped short of. The owner's report is that a wall tap "ended in a
   * crash rather than a tap", and the two halves of that are answered by
   * different numbers: bounces says the contact pass saw the wall at all,
   * lastImpulse says how hard, and GRAZE_SPEED_MAX is the line between a
   * tap and a smack. Nothing in the shell reads it.
   */
  /*
   * DRAW NOTHING, FLY EVERYTHING. Harness only.
   *
   * The town costs about two hundred milliseconds a frame under
   * swiftshader, so a probe driving the sticks from requestAnimationFrame
   * moves them FIVE TIMES A SECOND. Nothing can be flown at five hertz: a
   * tracker measured eighteen metres off a straight line it had six seconds
   * to fly, and every trick built on that measurement was measuring the
   * probe. Skipping the draw leaves the frame loop, the accumulator, the
   * fixed timestep and the interpolation exactly as they were, which is the
   * same promise the fps cap already makes one branch below, and hands the
   * probe back a control rate a radio would recognise.
   */
  window.__drawOff = (on = true) => {
    harnessNoDraw = Boolean(on);
    return harnessNoDraw;
  };
  /* Which control mode the plant is actually in. A rig that thinks it is
   * flying acro and is not measures nothing: angle cannot loop. */
  window.__flightMode = () => (angleModeOn ? 'angle' : 'acro');
  window.__contacts = () => ({
    ...passStats,
    interior: obsInterior,
    leftover: obsLeftover,
    roof: obsRoof,
    bounces: bounceCount,
    lastImpulse,
    grazeMax: GRAZE_SPEED_MAX,
    bounceMax: BOUNCE_SPEED_MAX,
  });
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
  /*
   * A SHAPE CENSUS OF THE WHOLE COLLIDER SET, and the near misses.
   *
   * `__colliderBoxes` above answers "is the collider where the drawing is",
   * which is a question about a picture. This answers a different one that
   * is just as invisible from the outside: of everything solid in this
   * world, how much of it is a shape the freestyle recogniser can fly
   * AROUND, and for the things that nearly are, which test threw them out.
   *
   * It exists because the obstacle field was empty in the real town for a
   * long time and no check could see it: every self-test builds its own
   * constructed field of one bar and one pole, so the derivation was proved
   * against a world that is not this one. See PROGRESS.md, 2026-09-02.
   *
   * `near` is the near misses: a capsule or box that failed exactly one of
   * the pole or bar tests, with the test that rejected it and the number it
   * was judged on, so "the town has no bars" can be told apart from "the
   * town's bars are half a metre too thick".
   */
  window.__colliderShapes = (opts = {}) => {
    const c = view.colliders;
    const out = {
      total: 0, boxes: 0, capsules: 0, byKind: {}, poles: 0, bars: 0, near: [], barList: [],
    };
    if (!c || !c.fbox) {
      return out;
    }
    const KIND = ['gate', 'obstacle', 'tree', 'canopy', 'rock', 'cliff', 'pole', 'wall', 'boom', 'train'];
    const limit = opts.near ?? 12;
    for (let i = 0; i < c.fbox.length; i += 1) {
      out.total += 1;
      const kind = KIND[c.fkind[i]] ?? String(c.fkind[i]);
      out.byKind[kind] = (out.byKind[kind] ?? 0) + 1;
      const box = Boolean(c.fbox[i]);
      out[box ? 'boxes' : 'capsules'] += 1;
      const cx = (c.fax[i] + c.fbx[i]) * 0.5;
      const cz = (c.faz[i] + c.fbz[i]) * 0.5;
      let len;
      let thick;
      let upright;
      let lowY;
      if (box) {
        /*
         * MIRRORS deriveObstacles' box branch exactly, and the first draft
         * did not: it took the thickness as the smaller of the footprint
         * and the height, which called a 16 by 11 metre overbridge deck
         * 0.24 m thick and reported six bars in a town that has none. A
         * diagnostic that flatters the thing it is measuring is worse than
         * no diagnostic. A box is a bar only if it is thin in BOTH of the
         * two directions that are not its length.
         */
        const w = Math.abs(c.fbx[i] - c.fax[i]);
        const d = Math.abs(c.fbz[i] - c.faz[i]);
        const h = Math.abs(c.fby[i] - c.fay[i]);
        const foot = w > d ? w : d;
        const thin = w > d ? d : w;
        lowY = Math.min(c.fay[i], c.fby[i]);
        if (h >= foot) {
          len = h;
          thick = foot;
          upright = 1;
        } else {
          len = foot;
          /* Both cross sections, not the smaller of them. */
          thick = thin > h ? thin : h;
          upright = 0;
        }
      } else {
        const ex = c.fbx[i] - c.fax[i];
        const ey = c.fby[i] - c.fay[i];
        const ez = c.fbz[i] - c.faz[i];
        len = Math.sqrt(ex * ex + ey * ey + ez * ez);
        thick = c.fr[i] * 2;
        upright = len > 1e-6 ? Math.abs(ey / len) : 1;
        lowY = Math.min(c.fay[i], c.fby[i]) - c.fr[i];
      }
      /* Below the collider's own base, the same question deriveObstacles
       * asks and for the same reason: the unhinted height is the top of
       * whatever is stacked over the point, so under a deck it reports a
       * support as having negative daylight beneath it. */
      const clear = lowY - view.height(cx, cz, lowY);
      /* The same tests deriveObstacles applies, restated here so a near
       * miss can name the one that failed. They are deliberately a copy:
       * this is a diagnostic and it must be able to disagree. */
      const poleShaped = upright >= 0.9 && thick <= 0.9 && len >= 2.5;
      const barShaped = upright <= 0.1 && thick <= 0.8 && len >= 2 && clear >= 1.5;
      if (poleShaped) {
        out.poles += 1;
      } else if (barShaped) {
        out.bars += 1;
        if (out.barList.length < limit) {
          out.barList.push({
            kind,
            box,
            at: [+cx.toFixed(1), +lowY.toFixed(1), +cz.toFixed(1)],
            len: +len.toFixed(2),
            thick: +thick.toFixed(2),
            clear: +clear.toFixed(2),
            a: [+c.fax[i].toFixed(1), +c.fay[i].toFixed(1), +c.faz[i].toFixed(1)],
            b: [+c.fbx[i].toFixed(1), +c.fby[i].toFixed(1), +c.fbz[i].toFixed(1)],
            r: +c.fr[i].toFixed(2),
          });
        }
      } else if (out.near.length < limit && upright <= 0.3 && len >= 2) {
        /* Horizontal and long, so it wanted to be a bar. Say why it is not. */
        out.near.push({
          kind,
          box,
          at: [+cx.toFixed(1), +lowY.toFixed(1), +cz.toFixed(1)],
          len: +len.toFixed(2),
          thick: +thick.toFixed(2),
          clear: +clear.toFixed(2),
          failed: thick > 0.8 ? 'too thick' : (clear < 1.5 ? 'no daylight under it' : 'too short'),
        });
      }
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
  /* The ghost, so a capture can ASSERT a chase: what is armed, what the
   * recorder holds, where the rig is and how present it is. */
  window.__ghost = () => {
    const key = ghostCourseKey();
    const best = ghostBook.best(key);
    const previous = ghostBook.previous(key);
    return {
      choice: ghostChoice,
      armed: Boolean(ghostLap),
      armedLabel: ghostLap ? ghostLap.label : '',
      armedMs: ghostLap ? ghostLap.durationMs : null,
      recording: ghostRecorder.armed,
      recordedFrames: ghostRecorder.pos.length / 3,
      bestMs: best ? best.durationMs : null,
      previousMs: previous ? previous.durationMs : null,
      visible: ghostRig.group.visible,
      position: ghostRig.group.position.toArray(),
      gapMs: ghostGap ? ghostGap.deltaMs : null,
      boardTimes: (ghostBoardTimes || []).length,
    };
  };
  /* Arm a ghost from wire base64 directly, the way a board fetch would,
   * so a capture can fly a chase without a board running. */
  window.__ghostLoad = (b64, name) => {
    const lap = new GhostLap(decodeGhost(ghostFromBase64(b64)), {
      label: 'Board lap',
      name: name || 'Harness',
      source: 'board',
    });
    lap.timeId = 'tm-00000000';
    ghostBoardLap = lap;
    ghostChoice = 'board:tm-00000000';
    armGhost();
    syncGhostRow();
    return { armed: Boolean(ghostLap), durationMs: lap.durationMs, splits: lap.splits.length };
  };
  /* Pick a ghost mode by id, as the menu row would. */
  window.__ghostPick = (id) => {
    pickGhost(String(id));
    return ghostChoice;
  };
  /* Light the OSD gap readout as a crossing would, so a capture can look
   * at the element without having to fly two laps first. */
  window.__ghostGapShow = (deltaMs, final) => {
    ghostGap = { deltaMs: Number(deltaMs), final: Boolean(final), untilWall: performance.now() + 2800 };
    return ghostGap;
  };
  /* The session's recorded laps as wire base64, so a capture can prove the
   * record-encode-decode-chase loop end to end. */
  window.__ghostExport = (which) => {
    const key = ghostCourseKey();
    const lap = which === 'previous' ? ghostBook.previous(key) : ghostBook.best(key);
    return lap ? ghostToBase64(encodeGhost(lap)) : null;
  };
  window.__craftState = () => ({
    mode,
    flownThisRun,
    landed,
    crashed,
    clipCrash: crashed,
    clipCrashKind,
    turtle: crashflipOn,
    /* Real Betaflight crashflip held by the pilot, as distinct from the
     * scripted turtle above. Published so a capture can tell the two
     * apart: they drive the same mixer path and look alike from outside. */
    manualFlip,
    crashflipActive: sim.e.sim_crashflip_active() !== 0,
    turtleWait,
    turtleFlip: turtleFlip.active,
    turtleParked: isTurtleParked(),
    turtleRecover,
    turtleResumeGate,
    banner: ui.banner ? ui.banner.textContent : '',
    /* Where the craft IS, world space, so a capture can steer toward a
     * gate instead of describing where it hoped to be. */
    worldX: shell.quad.position.x,
    worldY: shell.quad.position.y,
    worldZ: shell.quad.position.z,
    /* And how far the nose is down, the launch overlay's own reading, so a
     * capture can tell a stick that reached the plant from one that only
     * reached the menu. */
    pitchDeg: stateCurr ? pitchNoseDownDeg(stateCurr) : 0,
    /*
     * ATTITUDE, VELOCITY AND BODY RATES, so a probe can fly the aircraft on
     * feedback rather than on a stopwatch. A trick is a shape the craft
     * makes, and a stick script that cannot see which way up it is has to
     * guess how long to hold the stick. Every guess is a different loop, so
     * a check built on one measures the guess. Same numbers the recogniser
     * is fed at src/main.js's trickDetector.step call, and the same
     * conversion: sim quaternion, spawn premultiplied, in three.js space.
     */
    up: stateCurr ? (() => {
      simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], scoreQuat);
      scoreQuat.premultiply(qSpawn);
      scoreFwd.set(0, 1, 0).applyQuaternion(scoreQuat);
      return { x: scoreFwd.x, y: scoreFwd.y, z: scoreFwd.z };
    })() : null,
    fwd: stateCurr ? (() => {
      simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], scoreQuat);
      scoreQuat.premultiply(qSpawn);
      scoreFwd.set(0, 0, -1).applyQuaternion(scoreQuat);
      return { x: scoreFwd.x, y: scoreFwd.y, z: scoreFwd.z };
    })() : null,
    speed: stateCurr
      ? Math.sqrt(stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5]
        + stateCurr[6] * stateCurr[6])
      : 0,
    /*
     * World velocity, so a guidance law can close a loop on where the craft
     * is GOING as well as where it is.
     *
     * The plant's velocity is already in the world frame, so the axis
     * permutation and the spawn rotation are the whole conversion, the same
     * pair poseFromState uses minus the offset. Turning it by the craft's
     * attitude as well was tried and is wrong: it doubled the tracking
     * error on a straight line and quadrupled it on a circle.
     */
    vel: stateCurr ? (() => {
      simPosToThree(stateCurr[4], stateCurr[5], stateCurr[6], scoreFwd);
      scoreFwd.applyQuaternion(qSpawn);
      return { x: scoreFwd.x, y: scoreFwd.y, z: scoreFwd.z };
    })() : null,
    rates: stateCurr
      ? { p: stateCurr[11], q: stateCurr[12], r: stateCurr[13] }
      : null,
    descentRate: lastDescent,
    tiltDeg: lastTiltDeg,
    lastHitKind,
    lastClosingSpeed: lastClosing,
    lastUpDot,
    grazeSpeedMax: GRAZE_SPEED_MAX,
    bounceSpeedMax: BOUNCE_SPEED_MAX,
    bounceCount,
    propPlaneMaxUpDot: PROP_PLANE_MAX_UP_DOT,
    /* Biased like the OSD's altitude and like every contact query. A
     * harness reading this against a flight is reading the same number the
     * pilot is. */
    groundClearance: shell.quad.position.y - view.height(shell.quad.position.x, shell.quad.position.z, shell.quad.position.y - SURFACE_BIAS),
    fpvY: lastFpvY,
    camFloor: lastCamFloor,
    camClear: lastCamClear,
    camFwdY: lastCamFwdY,
    camUpY: lastCamUpY,
    lastUpz,
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
  /* Capture hook: seat the plant on the grass under the current xz.
   * cameraDown and invertedHold freeze the integrator (poseLock) so a
   * capture can photograph the lens before the hull tumbles. inverted
   * is the turtle path: wait for pitch or roll, then a guaranteed flip. */
  window.__seatCraft = (kind) => {
    if (!stateCurr) {
      return null;
    }
    poseFromState(stateCurr, pProbe);
    const hy = view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS);
    const seatY = kind === 'invertedAir' ? hy + 4 : hy + REST_HEIGHT;
    worldPosToSim(pProbe.x, seatY, pProbe.z, pSim);
    let qw = 1;
    let qx = 0;
    let qy = 0;
    let qz = 0;
    if (kind === 'inverted' || kind === 'invertedHold' || kind === 'invertedAir') {
      qw = 0;
      qx = 1;
    } else if (kind === 'cameraDown') {
      const h = Math.PI / 4;
      qw = Math.cos(h);
      qy = Math.sin(h);
    }
    const code = sim.e.sim_set_pose(pSim.x, pSim.y, pSim.z, qw, qx, qy, qz);
    if (code !== SIM_OK) {
      return { ok: false, code };
    }
    sim.rest();
    setCrashflip(false);
    turtleRecover = false;
    introMs = -1;
    camOverride = null;
    poseLock = kind === 'cameraDown' || kind === 'invertedHold';
    landed = kind !== 'cameraDown' && kind !== 'inverted' && kind !== 'invertedHold'
      && kind !== 'invertedAir';
    takingOff = false;
    /* Same reason as __placeCraft: a seat is a teleport. */
    obsHasPrev = false;
    obsPhase = 0;
    parkedLift = 0;
    adoptSimClock();
    acc = 0;
    groundY = hy;
    stateCurr = readState();
    statePrev = stateCurr;
    raiseGroundFromState(stateCurr);
    lastGroundHits = sim.e.sim_ground_contacts();
    lastClearance = kind === 'invertedAir' ? 4 : REST_HEIGHT;
    turtleOnSupport = lastGroundHits > 0 && kind !== 'invertedAir';
    if (kind === 'inverted') {
      turtleOnSupport = true;
      beginTurtleWait(true);
    }
    lastUpz = plantUpZ(stateCurr);
    {
      const uClamp = lastUpz > 1 ? 1 : lastUpz < -1 ? -1 : lastUpz;
      lastTiltDeg = (Math.acos(uClamp) * 180) / Math.PI;
    }
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qPrev);
    qPrev.premultiply(qSpawn);
    poseFromState(stateCurr, pCurr);
    camFwd.set(0, 0, -1).applyQuaternion(qPrev);
    camUp.set(0, 1, 0).applyQuaternion(qPrev);
    fpvPos.copy(pCurr)
      .addScaledVector(camFwd, simLenToWorld(CAMERA_MOUNT_FORWARD))
      .addScaledVector(camUp, simLenToWorld(CAMERA_MOUNT_UP));
    lastCamFwdY = camFwd.y;
    lastCamUpY = camUp.y;
    lastCamClear = fpvLensClear(camFwd.y, camUp.y);
    lastCamFloor = view.height(fpvPos.x, fpvPos.z, fpvPos.y - SURFACE_BIAS) + lastCamClear;
    if (fpvPos.y < lastCamFloor) {
      fpvPos.y = lastCamFloor;
    }
    if (parkedLift > 0.001) {
      fpvPos.y += parkedLift;
    }
    lastFpvY = fpvPos.y;
    shell.quad.position.copy(pCurr);
    shell.quad.quaternion.copy(qPrev);
    shell.quad.visible = false;
    fpvQuat.copy(qPrev).multiply(qTilt);
    shell.camera.position.copy(fpvPos);
    shell.camera.quaternion.copy(fpvQuat);
    shell.camera.fov = ui.settings.cameraFov;
    shell.camera.updateProjectionMatrix();
    return window.__craftState();
  };
  /* Harness: drop the plant at a world point, airborne, so a capture can
   * prove a clip-through crash without flying there. fromX/Y/Z is last
   * frame's pose when the test is a punch-through chord. */
  window.__placeCraft = (x, y, z, fromX, fromY, fromZ) => {
    if (!stateCurr) {
      return null;
    }
    worldPosToSim(x, y, z, pSim);
    const code = sim.e.sim_set_pose(pSim.x, pSim.y, pSim.z, 1, 0, 0, 0);
    if (code !== SIM_OK) {
      return { ok: false, code };
    }
    sim.rest();
    setCrashflip(false);
    turtleRecover = false;
    turtleWait = false;
    setTurtleParkMotors(false);
    introMs = -1;
    camOverride = null;
    poseLock = false;
    landed = false;
    takingOff = false;
    launchStaging = false;
    flownThisRun = true;
    crashed = false;
    clipCrashKind = '';
    clipCrashUntil = 0;
    clipGraceUntil = 0;
    mode = 'flight';
    ui.show('flight');
    resetClipWatch(clipWatch);
    /* A place is a teleport. Re-seed the contact pass or its next sweep is
     * the segment from wherever the craft used to be to here, which is a
     * line through half the map and reads as a punch through every solid
     * on it. */
    obsHasPrev = false;
    obsPhase = 0;
    adoptSimClock();
    acc = 0;
    stateCurr = readState();
    statePrev = stateCurr;
    poseFromState(stateCurr, pCurr);
    simQuatToThree(stateCurr[7], stateCurr[8], stateCurr[9], stateCurr[10], qPrev);
    qPrev.premultiply(qSpawn);
    shell.quad.position.copy(pCurr);
    shell.quad.quaternion.copy(qPrev);
    if (fromX == null) {
      racePrev.copy(pCurr);
    } else {
      racePrev.set(fromX, fromY, fromZ);
    }
    raceHasPrev = true;
    groundHasPrev = true;
    groundPrev.copy(racePrev);
    return window.__craftState();
  };
  window.__releasePose = () => {
    poseLock = false;
    return true;
  };
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
   * The PID picture in one read: what the menu stores, what the composed
   * block says, and what the module is flying, each straight from its own
   * source so a disagreement between them is visible as a disagreement.
   * Harness only; scripts/shots.js asserts against this.
   */
  window.__pids = () => ({
    id: configId,
    menu: JSON.parse(JSON.stringify(ui.settings.pids ?? {})),
    block: pidsText,
    module: {
      mode: moduleGet(sim, 'simplified_pids_mode'),
      master: moduleGet(sim, 'simplified_master_multiplier'),
      p_roll: moduleGet(sim, 'p_roll'),
      i_roll: moduleGet(sim, 'i_roll'),
      d_roll: moduleGet(sim, 'd_roll'),
      d_min_roll: moduleGet(sim, 'd_min_roll'),
      f_roll: moduleGet(sim, 'f_roll'),
      p_pitch: moduleGet(sim, 'p_pitch'),
      p_yaw: moduleGet(sim, 'p_yaw'),
      f_yaw: moduleGet(sim, 'f_yaw'),
    },
  });
  /*
   * The thumb sticks as the overlay believes them, plus what the input
   * ladder and the module made of it: source, angle mode and altitude, so
   * one read answers "did the thumb reach the craft". null on a device
   * with no touch points. Harness only.
   */
  window.__touch = () => (touch ? {
    ...touch.debug(),
    primary: input.isTouchPrimary(),
    source: input.stats().source,
    angle: angleModeOn,
    alt: readState()[3],
  } : null);
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
        /* Which of a stacked structure's openings is actually lit, read off
         * the meshes rather than off what the shell asked for. A designed
         * stack names one hole and must light exactly that one. */
        litOpenings: gt.ringMeshes
          ? gt.ringMeshes.map((m, k) => (m.visible ? k : -1)).filter((k) => k >= 0)
          : null,
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
   * Where the camera is, and what is directly under it. The intro camera
   * once ended its pan INSIDE a launch block and the only way to see it was
   * to look at a screenshot and argue about it; this reports the clearance
   * as a number so a capture can assert it. Harness only.
   */
  window.__camGround = () => ({
    x: shell.camera.position.x,
    y: shell.camera.position.y,
    z: shell.camera.position.z,
    ground: view.height(shell.camera.position.x, shell.camera.position.z,
                        shell.camera.position.y),
    clearance: shell.camera.position.y
      - view.height(shell.camera.position.x, shell.camera.position.z,
                    shell.camera.position.y),
    /* The title camera's lens shift, as a fraction of the frame, or null
     * when the lens is centred. Reported here because it is the other half
     * of where the shot is pointed: a check that reads the position alone
     * cannot tell a centred frame from one offset by a fifth of its height,
     * and it is the thing that has to be gone the moment the pilot flies. */
    shift: shell.camera.view && shell.camera.view.enabled
      ? {
        x: shell.camera.view.offsetX / shell.camera.view.fullWidth,
        y: shell.camera.view.offsetY / shell.camera.view.fullHeight,
      }
      : null,
  });
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
    /*
     * A REAL override now, not a poke into the keyboard state. The old
     * form wrote this.kb and the very next poll recomputed roll, pitch and
     * yaw from the held KEYS, so only the throttle survived: a capture
     * could climb and never steer, which several rounds of screenshot
     * work rediscovered the hard way. The override sits at the top of
     * poll()'s ladder and holds like a radio's gimbals until the next
     * write. Call with no arguments to release it back to the keyboard.
     */
    if (roll == null) {
      input.harnessChannels = null;
      input.channels = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
      rcPending.length = 0;
      turtleResumeGate = false;
      turtleRecover = false;
      return null;
    }
    input.harnessChannels = { roll, pitch, yaw, throttle };
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
    return {
      kind: k < 0 ? null : view.colliders.kindName(k),
      index: view.colliders.hitIndex,
      t: view.colliders.hitT,
      pen: view.colliders.hitPen,
      nx: view.colliders.hitNx,
      ny: view.colliders.hitNy,
      nz: view.colliders.hitNz,
    };
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
  /*
   * The title camera's own loop, sampled off a clock rather than off the
   * frame rate, so a check can walk a whole attract cycle in one call and
   * ask where the shot goes and what it is pointed at.
   *
   * WHY THIS EXISTS. The attract camera is the only camera in the shell with
   * nothing to stop it: the quad has colliders and the free camera has a
   * pilot, but this one is a spline and it will fly through a wall without
   * complaint. It was doing so in three of the four freestyle worlds, and
   * the only evidence was a thumbnail that looked wrong.
   * scripts/attract-check.js walks these samples through window.__hit and
   * says so instead.
   *
   * A PRIVATE CAMERA AND A PRIVATE COPY OF THE SHOT. Driving the live
   * attract camera would move the title behind whoever is looking at it and
   * would leave its bank filter holding a timestamp from a probe. Harness
   * only.
   */
  window.__attract = (count = 240) => {
    const probe = makeAttractCamera(view);
    const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
    const dir = new THREE.Vector3();
    const period = probe.periodMs > 0 ? probe.periodMs : 1000;
    const n = Math.max(8, Math.min(2000, Math.round(count)));
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const ms = (period * i) / n;
      probe.update(ms, cam, {});
      cam.getWorldDirection(dir);
      out.push({
        ms,
        x: cam.position.x,
        y: cam.position.y,
        z: cam.position.z,
        dx: dir.x,
        dy: dir.y,
        dz: dir.z,
      });
    }
    return { map: view.id, kind: probe.kind, periodMs: period, samples: out };
  };
  window.__budget = (name) => measureBudget(shell, view, { view: name });
  requestAnimationFrame(frame);
}

/*
 * There is no boot() call here, and there has not been a working one for a
 * long time.
 *
 * This file used to end with `boot().catch(...)`, called with no argument.
 * boot() destructures its argument, so that threw a TypeError on every
 * single load, and the catch appended a banner reading "The simulator could
 * not start." to #ui. Nobody ever saw it, because boot.js calls
 * main.boot({...}) a moment later and Ui.build() clears #ui before the next
 * paint. A load that failed every time and was hidden by the timing of an
 * unrelated line is worse than one that fails visibly: any change to how the
 * Ui handles its root would have put a false failure banner on the front
 * page.
 *
 * boot.js owns the entry point. It passes the loading screen, the boot
 * timestamp and the map id, and it routes a rejection to loading.fail(),
 * which is the screen that can actually say what went wrong and what to do
 * about it.
 */

