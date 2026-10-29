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
import { applyLook } from './render/look.js';
import { applyPixelRatio, autoMinPixels, bootGuessGraphics, graphicsLabel, inkLinesOn, internalScale, normalizeGraphics, pixelRatioFor, qualityFor, qualityOf, setInkLines } from './render/quality.js';
import { readGpuInfo } from './render/gpuinfo.js';
import { makeAttractCamera } from './render/attract.js';
import { MangaLayer } from './render/manga.js';
import { measureBudget } from './render/budget.js';
import { createFlightPerf } from './render/flightperf.js';
import { createGpuGate } from './render/gpugate.js';
import { AUTO_FLOOR, autoPresetMove, createAutoScale } from './render/autoscale.js';
import { createLatencyMeter } from './render/latency.js';
import { moveRigid, predictDelta, PREDICT_MAX_MS } from './render/predict.js';
import { simPosToThree, simQuatToThree, simLenToWorld, threePosToSim, threeDirToSim, WORLD_SCALE, setWorldScale } from './render/frame.js';
import { CAMERA_LENS_FORWARD, CAMERA_LENS_UP, CAMERA_MOUNT_FORWARD, CAMERA_MOUNT_UP, cameraTiltRad, clampCameraAngle, makeLensShake, fpvLensClear } from './render/lens.js';
import { MotorAudio } from './render/audio.js';
import { LapVoice, lapCall } from './render/voice.js';
import { ClipVoice } from './render/clips.js';
import { InputManager, NAV_DEFLECT } from './input/input.js';
import { PAD_CALM } from './input/padgate.js';
import { mountTouchSticks, touchWanted } from './input/touchsticks.js';
import { RcLink, LINK_DEFAULT, LINK_PRESETS } from './input/link.js';
import { setTicketMeta, wasmFingerprint } from './share/bugs.js';
import { FlightRecorder, downloadText, flightLogName } from './share/flightlog.js';
import { PRACTICE_LAPS, Race, runComplete } from './game/race.js';
import { TrickDetector } from './game/trickdetect.js';
import { deriveObstacles, OB_BAR, OB_POLE } from './game/obstacles.js';
import {
  MARK_FINDS, PARTNER_FINDS, glimpsesMark, seesMark, shouldFindMark,
} from './game/egg.js';
import { partnerBySlug } from './partners/roster.js';
import { Counter, formatScore } from './game/score.js';
import { NamedGapCounter } from './game/gaps.js';
import { CloseCalls, CC_EVERY, CC_HARD_DV } from './game/closecall.js';
import { readCounterBest, writeCounterBest } from './game/counterbest.js';
import { GhostBook, GhostLap, GhostRecorder } from './game/ghost.js';
import { buildGhostCraft } from './render/ghostcraft.js';
import { buildPropView } from './render/propview.js';
import { warmPrograms } from './render/warm.js';
import { decodeGhost, encodeGhost, ghostFromBase64, ghostToBase64 } from './share/ghostdata.js';
import { uploadWorld, setWorldFrame, setMover, setBoxHeight, kindOf, setVehicleClock, readVehicles, makeVehiclePoses, moverVelocityInPlant } from './game/plantworld.js';
import { Chase, CHASE_EVERY, pays } from './game/chase.js';
import { sincos } from './props/trig.js';
import { setCraftAirframe, CRAFT_R, CRAFT_WORLD_R, CRAFT_V_UP, CRAFT_V_DOWN, craftVerticalHalf, craftVerticalOffset, canPerch, shouldScorePass, shouldEnterTurtle, uprightPlantQuat, turtleFlipEase, turtleFlipLift, turtleSlerpQuat, TURTLE_STICK_MIN, TURTLE_SPEED, TURTLE_RATE, TURTLE_FLIP_MS, TURTLE_INVERT_UPZ, TURTLE_EXIT_UPZ, turtleClearance, findRestSpot, PROP_PLANE_MAX_UP_DOT, GRAZE_SPEED_MAX, BOUNCE_SPEED_MAX, BOUNCE_COOLDOWN_MS, LAND_DESCENT_MAX, LAND_HORIZONTAL_MAX, LAND_TILT_MAX_DEG, LAND_TILT_HARD_DEG, LAND_TIP_SPEED_MAX, GROUND_MU, GROUND_E, CLIP_SPAWN_GRACE_MS, CrashJudge, putDullBounce, emptyWorldReport, foldWorldReport } from './game/collide.js';
import { Ui, formatTime, WEIGHT_STOCK, clampWeight, gravityScaleFor, loadSettings, pacingTimerOn } from './ui/ui.js';
import { TAKEOFF, guideKind, stepOf, textOf } from './ui/firstflight.js';
import {
  AIR_GRIP_STOCK,
  MOTOR_KV_STOCK,
  TuneLog,
  airScaleFor,
  effectiveTune,
  kvScaleFor,
  offBoardTune,
  tuneDefaultsFor,
  tuneKey,
} from './share/tune.js';
import { lostStickNotice, noRadioNotice } from './ui/stickhelp.js';
/* Career: the lessons run through src/career/controller.js, which this file
 * hands a small object of its own (careerShell, near the end of boot) and
 * calls from a handful of one line hooks, each marked "Steam edition:
 * career" (the Steam edition's copy of this file carries the same hooks).
 * The career reads state; it never writes to the physics. It is fetched
 * when a pilot opens it, not at boot (loadCareer). */
import {
  adoptMapFromLocation, adoptMostFlownTrack, adoptShareFromLocation, boardPageUrl, fetchGhost,
  fetchMapDocument, fetchTrackDocument, fetchTrackTimes, postFreestyleRun, postTime,
} from './share/board.js';
import { findBoardTwin, hasFlyableTrack, inspectCourse, publishCurrentCourse, pushOwnedListing, seatedCourseKey, suggestRemixName, syncOwnedIdentity } from './share/listing.js';
import {
  captureSource, createFlightStats, pingVisit, sendEvent,
} from './share/stats.js';
import { sendCardAnimation } from './share/cardgif.js';
import { nameRules, readPilotName, writePilotName } from './share/pilot.js';
import { stampFor, stampedAmong, writeStamp } from './share/stamps.js';
import { CLIP_FPS, CLIP_H, CLIP_W, clipKeyForMap } from './share/orbitcache.js';
import {
  clearPendingTime,
  readEditKey,
  readPendingTime,
  writePendingTime,
  writePostedBest,
  writeShareImport,
} from './share/session.js';
import { showSupportPrompt } from './share/supportprompt.js';
import { createShowcase } from './render/showcase.js';
import { celTimeCount } from './render/celmat.js';
import { MAPS, mapById } from './maps/registry.js';
import { MAP_PRELOAD } from './maps/preload.js';
import { TUNES, tuneById, tunePath } from '../configs/registry.js';
import { airframeById, simIdFor, worldScaleFor } from '../configs/airframes.js';
import { buildWhoopCraft } from './render/whoopcraft.js';
import { hoverStickPercent, normaliseRates, ratesAreDefault, ratesDiff, ratesSummary, TOUCH_RATE_DEFAULTS } from '../configs/rates.js';
import { clearPidsFor, PID_AXES, pidCliKey, pidsDiffFor, SLIDER_KEYS, SLIDERS } from '../configs/pids.js';
import { cliMap, composeConfig, moduleDump, moduleGet, RATES_KEEP, ratesFromDump, readFcDump, tuneBody, writeFcDump } from './fc/dump.js';
import { GATE_SCALE, MICRO_SCALE } from './game/track.js';
import { YardRace, inAskZone } from './game/yardrace.js';
import { setLifeScale } from './ui/scorehud.js';
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
/*
 * AND IT IS THE AIRCRAFT'S OWN NUMBER, not a constant.
 *
 * It was 0.045 for everything, which is the five inch's: plant.c's
 * `hull_hz_down` for that machine, the distance from its centre to the
 * surface it parks on. A 65 mm whoop parks 10 mm off the floor. With the
 * five inch's figure the shell put the ground plane 45 mm under the
 * whoop's centre, so the plant rested it 35 mm in the air after every
 * reset, drew it parked there, and called it grounded while it still had
 * 45 mm of clear floor beneath it. Measured through window.__ground on the
 * shipped build: a parked whoop sat 39.7 mm above the floor under it. That
 * is more than the machine's own height, and it is the "hits the ground
 * too soon, then lifts off the ground a little when it resets" the owner
 * flew.
 *
 * configs/airframes.js carries the figure per airframe as `vHalfDown`,
 * snapshotted from plant.c, and `npm run whoop:gates` rests the real
 * module on a plane to prove the two agree. Seated by syncCraftScale, between runs only, with
 * the collision dimensions and the drawn model: these two are a FRAME, and
 * moving one mid lap would move the floor under a craft that is flying.
 */
let SPAWN_ALT = 0.033;
/* The craft rests with its underside on the ground, not its centre.
 * Identical to SPAWN_ALT so the parked pose, the spawn state and a landing
 * all agree about where the ground holds the craft. */
let REST_HEIGHT = 0.033;
/* One seat for both, so they cannot drift apart. */
function seatRestHeight(dims) {
  const h = dims && Number.isFinite(dims.vHalfDown) ? dims.vHalfDown : 0.033;
  SPAWN_ALT = h;
  REST_HEIGHT = h;
}
/*
 * REST_HEIGHT IN WORLD METRES. Both numbers above are the aircraft's own,
 * sim metres, and SPAWN_ALT only ever meets the plant. REST_HEIGHT also sits
 * on a world surface: a parked centre is a world height over a world floor.
 * While the world scale was 1 the two were the same number and the shell
 * added it to world heights as it stood; since the quad picker (2026-10-28)
 * seats a five inch in a house built 3.5 times life size, every world sum
 * takes it through the seam here. The identity at a world scale of 1.
 */
function restW() {
  return simLenToWorld(REST_HEIGHT);
}
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
 * How far a radio or gamepad's roll, pitch or yaw has to move off centre,
 * in the air, to count as the pilot flying the quad with it: that is when
 * the first flight's Weight card retires for a pilot with no pointer in
 * hand. Past a stick's centre noise, well short of a real input. Display
 * only; nothing in the flight reads it.
 */
const PAD_FLYING_STICK = 0.12;
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
 *
 * A built map's boards are thinner than that 0.15 m (a scaffold board is
 * 5 cm), so every query made for the craft also passes the craft's own
 * height as a fourth argument, and the built map leaves out any box whose
 * bottom is over it (topUnder in src/maps/built/place.js). The town's
 * height takes three arguments and ignores it.
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
/* Sim metres, a height about the aircraft on its pad, so it goes through
 * the seam where it meets the world (the quad picker, 2026-10-28): a five
 * inch in a house built 3.5 times life size is lifted 1.05 world metres,
 * which is the same 30 cm it is lifted on the town. */
const PARKED_LIFT = 0.30;
/*
 * How fast the parked lift goes once the craft is moving across the ground
 * rather than up off it: metres of lift per metre of horizontal travel, so
 * the whole 0.30 m is gone 0.6 m from where the craft took off. Render only,
 * like PARKED_LIFT. Short enough that a low skim away from the pad is flown
 * through its own lens within a craft length or two, long enough that the
 * bleed is a slope the eye reads as part of the move and not a drop.
 */
const LIFT_TRAVEL_BLEED = 0.5;
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

/*
 * WHAT EACH PLANT IS, for the charge bar, the OSD and the lens shake: its
 * series cells (PLANT.cells in src/native/plant.c) and its full throttle rotor
 * speed on a charged pack, measured off the compiled module. Restated here
 * because the ABI does not report them, keyed by the airframe's simId because
 * that is what selects the plant. The physics reads its own constants and
 * never these; change a plant and its row has to follow, or the bar lies
 * while the flight is right.
 *
 * Plant 0, the five inch: 6S, 25,570 RPM. Plant 1, the whoop (the shell's
 * again since 2026-10-09): 1S, 74,800 RPM. Only the lens shake and the
 * flight log read the speed, to turn motor speed into a 0 to 1 scale, so a
 * few percent either way is invisible.
 */
const PLANT_FACTS = {
  0: { cells: 6, fullRpm: 25600 },
  1: { cells: 1, fullRpm: 74800 },
};
const plantFacts = (airframeId) => PLANT_FACTS[simIdFor(airframeId)] ?? PLANT_FACTS[0];

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
 * Industrial bando, Municipal baths and Bardwell's yard were removed on
 * 2026-08-30, and their three entries went with them. `npm run lint:memory`
 * prints the fetched count per map beside this number.
 *
 * built: index.js, place.js, starter.js, looks.js and egg.js, the five
 * files under its own directory, measured from the resource entries on a
 * cold load of Your map. It also fetches src/props, src/art/stf.js and
 * twelve of the town's vendored modules (scripts/memory-check.js lists
 * them), but the counter matches one prefix and none of those is this map's
 * alone. The entry is written out because it has moved with the directory:
 * it was three before looks.js came and four before egg.js, and with no
 * entry then the bar sat at 75 percent until the import resolved. */
const MAP_MODULE_COUNT = { field: 1, city: 72, custom: 1, built: 5, house: 3, heads: 4, bardwell: 4, warehouse: 3, goats: 8, sunny: 12, drift: 3 };
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
  built: '/src/maps/built/',
  house: '/src/maps/house/',
  heads: '/src/maps/heads/',
  bardwell: '/src/maps/bardwell/',
  warehouse: '/src/maps/warehouse/',
  goats: '/src/maps/goats/',
  sunny: '/src/maps/sunny/',
  drift: '/src/maps/drift/',
};

/*
 * Ask for every module a map brings at once, the moment it is chosen. The
 * browser otherwise finds them one import level at a time, a round trip per
 * level, and on a real link that waiting is most of the city's module
 * stage: 72 files. A hint only: the import in loadMap still
 * resolves them, a module already in the page is not fetched again, and
 * the list is scripts/gen-preload.js's, checked by npm run lint:preload.
 *
 * At the address the import will use. src/fresh.js gives every module the
 * deploy's stamp through the page's import map, and a modulepreload href
 * is an address, not an import, so no map is applied to it: new URL here
 * would preload a copy nothing imports, possibly one four hours old.
 * import.meta.resolve applies the map. A CDN path, or a browser without
 * import.meta.resolve, gets the plain address as before.
 */
const mapPreloaded = new Set();
function preloadedHref(path) {
  if (/^https?:/.test(path) || typeof import.meta.resolve !== 'function') {
    return new URL(path, import.meta.url).href;
  }
  return import.meta.resolve(`./${path}`);
}

function preloadMapModules(id) {
  const list = MAP_PRELOAD[id];
  if (!list || mapPreloaded.has(id) || typeof document === 'undefined') {
    return;
  }
  mapPreloaded.add(id);
  for (const path of list) {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = preloadedHref(path);
    document.head.appendChild(link);
  }
}

async function loadMap(shell, id, loading, options) {
  const entry = mapById(id);
  loading.start('module');
  preloadMapModules(entry.id);
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
  /* The model this world draws the craft as, before the world is built so
   * its warmPrograms links it. Since the quad picker (2026-10-28) that is
   * the seated airframe's own on every map: no map draws one aircraft over
   * another's plant any more, so `craftModel` is null everywhere and this
   * puts back the airframe's model after a profile from before. */
  if (typeof shell.setCraftModel === 'function') {
    shell.setCraftModel(entry.craftModel || null);
  }
  /* A whoop's model is a small file fetched on demand; have it on the craft
   * before the world's programs are linked, so they are not built later. */
  const modelIn = typeof shell.craftReady === 'function' ? shell.craftReady() : null;
  if (modelIn) {
    await modelIn;
  }
  const map = await mod.buildMap(shell, (f) => loading.progress('world', f), options);
  /* Near first on a world that asks for it (`nearFirst`, the house maps),
   * three's own order everywhere else: see nearFirstSort. */
  if (typeof shell.renderer.setOpaqueSort === 'function') {
    shell.renderer.setOpaqueSort(map.nearFirst ? nearFirstSort : null);
  }
  map.graphics = normalizeGraphics(options && options.quality);
  /* The Gem look, once a world is built: colours and vertex tones only, nothing per frame (look.js). */
  applyLook(map.scene, shell.quad);
  map.shadowsOff = Boolean(options && options.quality && options.quality.shadowsOff);
  /* The published map a built world was made from, or null for the
   * pilot's own. The world does not say, because to it a document is a
   * document, and the shell has to tell two of them apart: see
   * loadedCourseKey, and the fallback in syncWorld. */
  map.shared = (options && options.shared) || null;
  loading.done('world');
  return map;
}

/*
 * NEAR FIRST, NOT COLOUR FIRST, in the house maps.
 *
 * three draws the opaque list grouped by material and only then near to
 * far, which keeps program switches down and is right for the town, where
 * most of the picture is sky and street and little hides anything else.
 * Indoors it is the wrong way round: every pixel is covered by a wall, a
 * floor or a ceiling several times over, and a far room drawn first is
 * shaded in full before the near wall hides it. Counted on 2026-10-21 in
 * Nick Burns' house at the start and round it (headless, a proxy: the
 * fragments that pass the depth test, a pixel's average), three's order
 * shaded 2.1 to 5.5 times a pixel and this one 1.5 to 4.3, the town 2.2 to
 * 3.0 in its own order. The draws are the same draws: only the order moves.
 * The cost is more program switches, which is CPU, and PROGRESS.md has
 * what that measured. groupOrder and renderOrder still come first, so
 * anything that asked for its place keeps it.
 */
function nearFirstSort(a, b) {
  if (a.groupOrder !== b.groupOrder) {
    return a.groupOrder - b.groupOrder;
  }
  if (a.renderOrder !== b.renderOrder) {
    return a.renderOrder - b.renderOrder;
  }
  if (a.z !== b.z) {
    return a.z - b.z;
  }
  return a.id - b.id;
}

export async function boot({ loading, bootStart, mapId }) {
  const BOOT_START = bootStart ?? performance.now();
  /*
   * Replay mode: ?replay=tm-xxxxxxxx loads a ghost and plays it pilotless
   * for frame-by-frame capture. Used by the marketing team to record ghost
   * spotlight videos without depending on internal test hooks. clean=1 on
   * a replay takes away everything that is not the flight: the UI, the
   * cursor, the next gate's glow and every sponsor's mark.
   */
  let replayMode = false;
  let replayTimeId = '';
  let replayCamera = 'chase'; /* chase or fpv */
  let replayClean = false;
  let replayState = 'loading'; /* loading, ready, failed */
  let replayClock = null; /* { startMs, vt } when active */
  let replayStepMode = false; /* true when using __replayStep */
  let replayChaseCam = null; /* { pos, look, prevVt } for chase camera smoothing */
  let replayPresence = 0; /* tracked separately since ghostRig doesn't expose it */
  const replayScratchPos = new THREE.Vector3();
  const replayScratchQuat = new THREE.Quaternion();
  const replayScratchDir = new THREE.Vector3();
  const replayScratchTilt = new THREE.Quaternion();
  const replayScratchUp = new THREE.Vector3();
  try {
    const params = new URLSearchParams(window.location.search);
    const replayParam = params.get('replay') || '';
    if (/^tm-[0-9a-f]{8}$/.test(replayParam)) {
      replayMode = true;
      replayTimeId = replayParam;
      const camParam = (params.get('cam') || 'chase').toLowerCase();
      replayCamera = camParam === 'fpv' ? 'fpv' : 'chase';
      replayClean = params.get('clean') === '1';
    }
  } catch (e) {
    /* No URL to read. */
  }
  /*
   * FIRST, BEFORE ANYTHING READS THE QUERY.
   *
   * Two things in one call. It takes a sponsor's `utm_source` out of the
   * address and puts it away for thirty days, and it takes every `utm_`
   * parameter OUT of the address bar, which matters here more than
   * anywhere: a simulator URL is how a track travels, so a pilot who sends
   * a friend the link they are looking at must not attribute their friend
   * to a poster they never saw. Everything the shell reads, map, share,
   * board and craft, is left exactly where it was.
   *
   * Then one visit, counted once per browser per UTC day across all three
   * pages. It sends nothing at all if the pilot has switched counting off
   * or their browser sends Global Privacy Control, and nothing waits for
   * it either way.
   *
   * A replay (above, read first because it decides this) is a capture, not
   * a visit: its utm_ parameters come out all the same and nothing is
   * counted.
   */
  if (replayMode) {
    captureSource();
  } else {
    pingVisit('sim');
  }
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
  /*
   * Read before the Ui exists because a context's attributes are fixed when
   * it is made: Low latency view in Settings takes effect on the next load,
   * and its note says so. loadSettings is the same read the Ui makes a few
   * lines down, and it writes nothing.
   */
  const bootSettings = loadSettings();
  const shell = buildShell(canvas, {
    desynchronized: bootSettings.lowLatency !== false,
    opaque: true,
    powerPreference: gpuQuery === 'low' ? 'low-power' : 'high-performance',
  });
  /*
   * How long the GPU takes over a frame, and the guard that keeps a saturated
   * one from queueing frames: see gpugate.js. Polled on the sticks' own timer
   * (input.startPolling below) as well as at each frame, so a fence is seen
   * signalled close to when the GPU finished rather than a frame later. Four
   * null checks when idle.
   */
  const gpuGate = createGpuGate(shell.renderer.getContext());
  /* A lost context takes its fences with it and a restored one has none, so
   * both drop the ring untimed rather than leave a fence the guard would
   * wait on for ever. three.js handles the loss itself (it prevents the
   * default, so the browser restores); these only keep the gate honest. */
  shell.canvas.addEventListener('webglcontextlost', () => gpuGate.reset());
  shell.canvas.addEventListener('webglcontextrestored', () => gpuGate.reset());
  /*
   * Auto graphics' resolution factor and the controller that moves it: see
   * autoscale.js and renderScaleOf. Declared here, before the first thing
   * that sizes the picture, because renderScaleOf reads it from boot on.
   * 1 until the frames say otherwise, and on every boot: the preset Auto
   * settles on is remembered, the factor is re-earned each session.
   */
  let autoFactor = 1;
  const autoScale = createAutoScale();
  /* Whether Auto has already moved the preset this session, each way. */
  let autoDemoted = false;
  let autoPromoted = false;
  /* What applySettings last saw of Auto and the preset, so the moment the
   * pilot turns Auto on, or the preset changes hands, is seen as one: see
   * autoForget. Null until the first applySettings, which only records. */
  let autoSeenOn = null;
  let autoSeenPreset = null;
  const input = new InputManager();
  /*
   * Sample the sticks on their own timer rather than once per rendered frame.
   * See src/input/input.js for what that was costing feedforward. The GPU
   * guard's fences are polled on the same tick: one timer, not two.
   */
  input.startPolling(2, (now) => gpuGate.poll(now));
  /* Hide UI in replay clean mode. failReplay puts both back. */
  if (replayClean) {
    uiRoot.style.display = 'none';
    canvas.style.cursor = 'none';
  }
  const ui = new Ui(uiRoot);
  /* For the dogfight's Arm up page, which listens for a button or switch. */
  ui.input = input;
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
  /*
   * THE SITE'S COUNTERS.
   *
   * Built HERE, as soon as the input and the shell exist, rather than down
   * beside the frame loop that drives it: the crash handler two thousand
   * lines below calls noteCrash, and a `const` declared after its callers
   * is a temporal dead zone waiting for the day somebody calls one of them
   * a little earlier. Nothing here needs a world, so nothing here has to
   * wait for one.
   *
   * The board's statistics page counts sessions, laps and flight time. This
   * is the only thing in the simulator that reports any of it, and all it
   * ever sends is a few small numbers: see src/share/stats.js for what is
   * NOT in them, which is the part that matters.
   *
   * describe() is a callback rather than three fields, because the aircraft,
   * the map and the input can all change between the first frame and the
   * flush a minute later. It is read at send time so a flush says what the
   * pilot was actually flying, and it is passed in so stats.js never has to
   * import the shell.
   *
   * The input is folded to one of three words HERE, because this is where
   * both halves of the answer live: a radio and a game controller both
   * arrive through the Gamepad API and are the same answer to "did they use
   * sticks", and the board has no business knowing which radio.
   */
  const flightStats = createFlightStats({
    describe: () => ({
      craft: ui.settings.airframe === 'whoop65' ? 'whoop65' : '5inch',
      map: ui.settings.map,
      input: (() => {
        if (input.firstGamepad()) {
          return 'gamepad';
        }
        if (input.touchSource && input.touchSource.active()) {
          return 'touch';
        }
        return 'keyboard';
      })(),
    }),
  });
  
  /*
   * THE PROMPT ON SCREEN, and the screen it was shown on. It goes the
   * moment that screen is left: "never during a run", and a pilot on a
   * radio or a pad has no pointer to close it with, so a prompt left up
   * over the flight would stay there. Settings on it opens the Advanced
   * room, where the switch for these is. A prompt that fails says nothing
   * and stops nothing: it is shown from the frame loop and from the post
   * path, and a throw in either is a fault or a lap reported as not posted.
   */
  let supportPrompt = null;
  let supportPromptScreen = null;
  const offerSupport = (trigger) => {
    /* Never in the air, and never over anything else the pilot is being
     * asked: see Ui.supportPromptBlocked. */
    if (ui.settings.supportPrompts === false || ui.screen === 'flight' || ui.supportPromptBlocked()) {
      return;
    }
    try {
      const prompt = showSupportPrompt(trigger, { onSettings: () => { ui.act('advanced'); } });
      if (prompt) {
        if (supportPrompt) {
          supportPrompt.remove();
        }
        supportPrompt = prompt;
        supportPromptScreen = ui.screen;
      }
    } catch (promptError) {
      console.warn('support prompt', promptError);
    }
  };
  /* Once per exit from a flight to the title, called by Ui.act after
   * onAction has run (fullscreen left, the run reset). */
  ui.onFlightExit = () => offerSupport('exit');
  /* Escape or pad Back on the title closes the prompt and nothing else. */
  ui.closeSupportPrompt = () => {
    if (!supportPrompt) {
      return false;
    }
    supportPrompt.remove();
    supportPrompt = null;
    supportPromptScreen = null;
    return true;
  };
  /*
   * The last flush, sent when the page goes away. pagehide rather than
   * unload, because a browser that put this tab in its back/forward cache
   * never fires unload and the minute is lost; visibilitychange covers the
   * mobile case, where a tab being backgrounded is how a session usually
   * ends and pagehide may never come at all.
   *
   * Both may fire for the same departure. That is harmless: the second one
   * finds the counters already cleared and sends a flush of noughts, which
   * costs the board one row it already had.
   */
  window.addEventListener('pagehide', () => flightStats.leaving());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flightStats.leaving();
    }
  });

  const gpuInfo = readGpuInfo(shell.renderer);
  /* Whether the browser granted the short path to the glass, for the Low
   * latency view row's note: it is a request, and not every platform can
   * honour it. See buildShell. */
  gpuInfo.lowLatency = shell.granted.desynchronized;
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
  /* The decision itself is bootGuessGraphics in quality.js, where it can be
   * checked for every kind of GPU; the two branches below are its two
   * answers. An integrated GPU's guess stands down once Auto has measured
   * the machine: see graphicsAutoMeasured. */
  const bootGuess = bootGuessGraphics(gpuInfo, ui.settings);
  if (bootGuess === 'low') {
    ui.settings.graphics = 'low';
    /* Still detected, not chosen, so this stays set. It costs nothing: the
     * value is already Low, so the test above short circuits on every later
     * boot, and leaving the flag honest is what lets a future round raise a
     * machine back up if it turns out to have had a GPU all along. */
    ui.persistSettings();
    ui.renderMenu();
  } else if (bootGuess === 'medium') {
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
   * A freestyle world seated at boot is also remembered as the pilot's
   * world, which is what seatMap does for one chosen on the picker. Without
   * it the builder's Fly this map link (?map=built) seated Your map while
   * freestyleMap still named the town from an earlier visit, so a pilot who
   * went through Race on the gate and then chose Freestyle landed in the
   * town. Written here rather than through seatMap, which would put the
   * title up and fire onSettings in the middle of boot. Outside the guard
   * above, because a blob saved before this line existed can already hold
   * map 'built' beside freestyleMap 'city', and that pilot is the same case.
   */
  const bootWorld = mapById(ui.settings.map);
  if (bootWorld.mode === 'freestyle' && ui.settings.freestyleMap !== bootWorld.id) {
    ui.settings.freestyleMap = bootWorld.id;
    ui.persistSettings();
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
  /* The pictures a TinyLaps track this tab just published still has to draw. */
  let tinyLapsPictures = null;
  /*
   * A TRACK FROM TINYLAPS arrives in the fragment, from the Open in WebFPV button on their
   * editor (src/share/tinylaps.js). The whole track is in the address; it is published to
   * the board (or found there, when the same file was sent before) and seated as that board
   * track, so the ?share= fetch below is skipped. A board that does not answer leaves it
   * seated here only, and the banner says so.
   */
  let fromTinyLaps = null;
  try {
    /* Fetched only by a link that carries one, so no other load downloads the reader. */
    if (/(^|[#&])tinylaps=/.test(window.location.hash)) {
      const { adoptTinyLapsFromLocation } = await import('./share/tinylaps.js');
      const got = await adoptTinyLapsFromLocation();
      fromTinyLaps = got ? got.share : null;
      tinyLapsPictures = got ? got.pictures : null;
      if (got && got.offline) {
        ui.setBanner(`Flying the TinyLaps track here only: it could not be saved to the board.\n${got.offline}`, true);
      }
    }
  } catch (e) {
    ui.setBanner(`Could not open that TinyLaps track.\n${e.message ?? e}`, true);
  }
  try {
    const fromUrl = fromTinyLaps || await adoptShareFromLocation();
    if (fromUrl) {
      /*
       * THE AIRCRAFT THE LINKED TRACK IS FOR, before anything reads a seat.
       *
       * The seats are one per class. adoptShareFromLocation files the
       * document by ITS class, so a five inch profile following the board's
       * Fly link to a room wrote the room into the whoop seat and then, with
       * the five inch still seated, read the five inch's seat: the pilot
       * landed on their old field with the track they were sent to nowhere.
       * Seating the aircraft the document is built for makes the write and
       * the read the same seat. applySettings runs once below and swaps the
       * plant to match, the same path an aircraft change from the menu takes.
       */
      ui.seatCraftForDoc(fromUrl.document);
      ui.settings.map = 'custom';
      ui.renderMenu();
    } else if (mapById(ui.settings.map).mode !== 'freestyle' && !hasFlyableTrack()) {
      const featured = await adoptMostFlownTrack(airframeById(ui.settings.airframe).trackClass);
      if (featured) {
        ui.settings.map = 'custom';
        ui.renderMenu();
      }
    }
  } catch (e) {
    ui.setBanner(`Could not open that published track.\n${e.message ?? e}`, true);
  }
  /*
   * A PUBLISHED FREESTYLE MAP arrives as ?mapshare=id, from the board's Fly
   * this map, beside ?map=built. Fetched in the same stage as a track, for
   * the same reason: the board may be asleep and the pilot should be told
   * that is what they are waiting for.
   *
   * It is held HERE, for this page load, and handed to the built world as
   * its document every time that world is built (worldDocument, below),
   * including a rebuild for a graphics change. It is never written to the
   * map seat, so Your map, the pilot's own, is exactly where they left it:
   * the builder's Fly this map, or any page load without ?mapshare=, flies
   * that again. A board that cannot answer leaves the pilot on their own
   * map with the reason on the banner.
   */
  let sharedMap = null;
  try {
    sharedMap = await adoptMapFromLocation();
    if (sharedMap) {
      ui.settings.map = 'built';
      ui.setSharedMap(sharedMap);
      ui.renderMenu();
    }
  } catch (e) {
    ui.setBanner(`Could not open that published map.\n${e.message ?? e}`, true);
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
  /* The harness's world scale, when it forces one: see seatWorldScale. */
  let forcedWorldScale = null;
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
  /* True while the renderer is held at the clip's size for the Freestyle
   * room's film of the loaded world (see `film` in frameBody). A resize that
   * arrives meanwhile waits: the film's frames have to be the clip's shape,
   * and the window's size is put back the next time the world is drawn for
   * anything else. */
  let filmPinned = false;
  window.addEventListener('resize', () => {
    resizeDirty = true;
  });
  function applyResizeIfDirty() {
    if (!resizeDirty || filmPinned) {
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
    const wantPr = pixelRatioFor(ui.settings.graphics, canvasScaleOf(ui.settings));
    if (Math.abs(wantPr - shell.pixelRatio) > 0.001) {
      applyPixelRatio(shell, ui.settings.graphics, canvasScaleOf(ui.settings));
    }
    /* mapReady as well as view: a swap disposes the old pipeline before it
     * builds the new one, and a resize landing in that window used to call
     * setSize on render targets that had already been freed. mapReady is
     * false for exactly that gap. */
    if (view && view.post && mapReady) {
      view.post.setSize(d.w, d.h);
      /* New targets: a fence pending across the reallocation is timing it,
       * not the GPU. See reset in gpugate.js. */
      gpuGate.reset();
    }
    /* A new window is a new floor on High: see autoFloorFor. */
    autoScale.setFloor(autoFloorFor(ui.settings));
  }
  const audio = new MotorAudio();
  /* The lap time said out loud. Beside the audio because it answers to the
   * same Sound switch and Volume, but not in its graph: see voice.js. */
  const lapVoice = new LapVoice();
  /*
   * Recorded voice clips on a map's cues (src/render/clips.js): the sticker
   * finds of every map, and Nick Burns' house's crash, hit and landing.
   * Plain audio elements, off the main thread and out of the motor graph,
   * on the same Sound switch and Volume; a clip is fetched only when it is
   * the next to play. `view.clips` names the voice a map speaks in ('jb' on
   * Bardwell's house, 'nb' on Nick's; a map that names none is silent) and a map's own code
   * reaches playCue through view.onCue.
   */
  const clipVoice = new ClipVoice();
  function playCue(cue) {
    if (!ui.settings.sound || ui.screen !== 'flight' || !view) {
      return null;
    }
    return view.clips ? clipVoice.play(view.clips, cue, (ui.settings.volume / 10) * (ui.settings.calloutLevel / 10)) : null;
  }
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
  /*
   * THE PHYSICS VERSION, NAMED ON EVERY TICKET. The hash of the bytes this
   * page just instantiated, taken off the frame loop (the module is already
   * in hand, and nothing waits on it), plus the aircraft in the hangar. A
   * flight feel tune is only worth reading beside the physics it was flown
   * on, and the deploy stamp alone cannot say: it moves on every deploy,
   * physics or not. See setTicketMeta in src/share/bugs.js.
   */
  setTicketMeta({ airframeOf: () => ui.settings.airframe });
  simBytes.then((bytes) => wasmFingerprint(bytes)).then((hash) => setTicketMeta({ wasm: hash }));
  if (typeof sim.e.sim_deflect !== 'function') {
    throw new Error('sim.wasm does not export sim_deflect');
  }
  if (typeof sim.e.sim_contact !== 'function') {
    throw new Error('sim.wasm does not export sim_contact');
  }
  if (typeof sim.e.sim_contact_at !== 'function') {
    throw new Error('sim.wasm does not export sim_contact_at');
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
   * separated: shipping rates inside a tune meant choosing that tune also
   * halved the stick authority, so the tune could never be judged on its
   * own. The PID adjustment sits between the two, keyed by
   * the LOADED tune's id, so each tune keeps its own; see configs/pids.js.
   */
  /* The Flight controller screen's saved dump, the body of the pilot's
   * own "custom" tune. Its rates were stripped on the way in, so it goes
   * through composeConfig like any file in configs/. One per aircraft, and
   * always the seated one's: see readFcDump in src/fc/dump.js. */
  function seatedFcDump() {
    return readFcDump(ui.settings.airframe);
  }
  /*
   * WHOSE "Your edits" is loaded, while it is: null whenever the config
   * flying is not a dump. Each aircraft has its own dump and both answer to
   * the one tune id 'custom', so a change of aircraft with Your edits chosen
   * on both is a change of tune that the id alone cannot see. applySettings
   * and swapTune read this to see it.
   */
  let dumpFor = null;
  let tuneText;
  if (configId === 'custom') {
    tuneText = seatedFcDump();
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
      dumpFor = ui.settings.airframe;
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
    dumpFor = null;
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
  /* The document a world is built from when it is not the one it would
   * choose for itself: a published map from ?mapshare= or from a card in
   * the Freestyle room, for the built world and nothing else. See sharedMap
   * above, and ui.onBoardMap. `shared` rides along so the world remembers
   * which map it is (loadMap). */
  /* Steam edition: career. While a lesson's world is wanted, its document
   * is what that world is built from, ahead of a map from the board or the
   * seated track. careerWorld is { map, doc, key } or null. */
  let careerWorld = null;
  /* The key of the last lesson world that would not build, for the career
   * to tell its pilot rather than wait for ever. */
  let careerFailed = '';
  const worldDocument = (id) => {
    if (careerWorld && careerWorld.map === id) {
      return { document: careerWorld.doc };
    }
    return id === 'built' && sharedMap
      ? { document: sharedMap.document, shared: sharedMap }
      : {};
  };
  try {
    view = await loadMap(shell, ui.settings.map, loading, {
      quality: qualityOf(ui.settings),
      renderScale: renderScaleOf(ui.settings),
      hideSponsors: replayClean,
      ...worldDocument(ui.settings.map),
    });
  } catch (e) {
    if (ui.settings.map === 'custom') {
      throw e;
    }
    console.error(e);
    const failed = mapById(ui.settings.map).name;
    /* The same record the swap keeps: see loadFailure in ui.bugSnapshot. */
    ui.loadFailure = {
      map: mapById(ui.settings.map).id,
      message: String((e && e.message) || e).slice(0, 300),
      atUtc: new Date().toISOString(),
    };
    ui.settings.map = 'custom';
    ui.renderMenu();
    view = await loadMap(shell, 'custom', loading, {
      quality: qualityOf(ui.settings),
      renderScale: renderScaleOf(ui.settings),
      hideSponsors: replayClean,
    });
    /* The banner, not `notice`: that is declared with the frame loop's own
     * state further down and does not exist yet. This is the same way the
     * share adoption above reports a boot failure. */
    ui.setBanner(`${failed} could not be loaded.\nThe track was loaded instead.`, true);
  }
  /* A world whose pipeline scales its own targets (the town, a built map)
   * took the render scale there, so the canvas goes back to the preset's
   * own ratio, set above with the scale in it for the race field. Direct,
   * not applyRenderScale, whose state is declared further down. See
   * canvasScaleOf. */
  if (view.post && view.post.userScale != null) {
    const wantPr = pixelRatioFor(ui.settings.graphics, 1);
    if (Math.abs(wantPr - shell.pixelRatio) > 0.001) {
      applyPixelRatio(shell, ui.settings.graphics, 1);
      const d = shell.resize();
      view.post.setSize(d.w, d.h);
    }
  }
  /* Auto's floor for this world and window: see autoFloorFor. */
  autoScale.setFloor(autoFloorFor(ui.settings));
  ui.setShare(view.share || null);
  /*
   * THE CLIP KEY OF THE WORLD AS IT WAS BUILT, taken now rather than when a
   * card asks, because a card's key is read off the seat when the card is
   * drawn and the seat can change under a built world: an author editing
   * Your map in another tab. The Freestyle room films the loaded world
   * where it stands only when the two agree (ui.captureCurrentCard);
   * otherwise the orbit frame builds the map from the seat as it is now.
   * A map from the board has no key of its own here, because Your map's
   * card is keyed by the pilot's seat and filming the board's map in place
   * would file it under the pilot's.
   */
  let worldClipKey = null;
  const noteWorldClip = () => {
    worldClipKey = view && !view.shared ? clipKeyForMap(view.id) : null;
  };
  noteWorldClip();
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
  /* The cosine and sine of the yaw the plant's frame was last seated at,
   * which seatWorldFrame writes: see bodyUpDotWorld in src/game/collide.js. */
  const frameTurn = { s: 0, c: 1 };
  /* CRASH IS A RESET's rules, asked by the frame loop: see CrashJudge in
   * src/game/collide.js. Here beside frameTurn for frameTurn's reason:
   * seatWorldFrame hands it the turn, and no reset may meet it before it
   * exists. */
  const crashJudge = new CrashJudge();
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

  /*
   * The plant's world frame: where its origin sits in the map and which way
   * it faces. The solid world is in the plant (src/native/world.c), so every
   * move of the spawn has to reach it, or the craft collides with a town
   * that is somewhere else. See src/game/plantworld.js.
   */
  function seatWorldFrame() {
    setWorldFrame(sim, startX, startY, startZ, startYaw, SPAWN_ALT);
    /* And the same yaw as a turn, for the world report's normals, which come
     * back in the world frame: see bodyUpDotWorld in src/game/collide.js. */
    sincos(startYaw, frameTurn);
    crashJudge.seat(frameTurn.c, frameTurn.s);
  }

  /* Hand the current map's solids to the plant. Called whenever a map is
   * adopted, before the reset that seats the craft in it. */
  function uploadPlantWorld() {
    /* The world scale first: every solid below is converted through it. */
    seatWorldScale();
    passStats.shapes = uploadWorld(sim, view.colliders);
    worldSolids = view.solids || null;
    worldSolidDown = null;
    if (worldSolids) {
      for (let m = 0; m < worldSolids.cars.length; m += 1) {
        setMover(sim, m, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'train', false);
      }
    }
    /* uploadWorld's clear parked every mover slot, the sails' with them. */
    sails = view.sails || null;
    sailsUsed = 0;
    if (sails && (!sailBoxes || sailBoxes.length < sails.slots * sails.doubles)) {
      sailBoxes = new Float64Array(sails.slots * sails.doubles);
    }
    adoptTraffic();
  }

  /*
   * THE TRAFFIC (FREESTYLE-MAPS-PLAN.md section 8, Stage E): a built map's
   * cars, which the physics module drives (src/native/world.c section 5).
   *
   * UPLOADED WITH THE WORLD. uploadWorld's sim_world_clear takes every road
   * and car of the last map away with the rest of its solids and sets the
   * cars' clock to 0, so a map with no traffic has none, and this uploads a
   * map's own after it: its lanes, then its cars (view.uploadTraffic, which
   * is src/maps/built/traffic.js uploadTraffic, so nobody writes that loop
   * twice). A map with no traffic, every race track and the town, makes no
   * vehicle call on the plant at all: `trafficOn` guards every one below,
   * and their runs are the runs they were.
   *
   * THE CLOCK IS THE LAP CLOCK. Before every stretch of stepping, on the
   * launch stand too, the cars' clock is set to simTimeMs; the module then
   * advances it one a step itself, exactly as pushWorldSolids(simTimeMs + i)
   * seats the train. A pose is a pure function of that clock, so a reset, a
   * set down or a seek that puts simTimeMs back puts the cars back with it,
   * and the same input stream meets the same cars wherever it is flown.
   *
   * RENDER READS THE POSE THE PHYSICS USED. The step loop reads every car
   * after the step the craft's two drawn states are at (carPrev and
   * carCurr, one step apart, as statePrev and stateCurr are), and the map
   * draws them between the two at the craft's own alpha. A frame that did
   * not step (landed, a turtle wait, the title, results) sets the clock to
   * the screen's own step and reads the poses there: the module seats a car
   * at any clock.
   *
   * THE CHASE (src/game/chase.js) is fed inside the step loop every
   * CHASE_EVERY steps of the lap clock, from the poses read at that step,
   * with whether the craft touched any car since the last feed and whether
   * the shell called a crash. The same poses feed the drift smoke. Nothing
   * here allocates on a frame.
   */
  let trafficOn = false;
  let carPrev = makeVehiclePoses();
  let carCurr = makeVehiclePoses();
  const carFeed = makeVehiclePoses();
  /* This frame's step loop read carPrev and carCurr itself. */
  let carStepped = false;
  /* The clock the last non stepping read was for, and the last 8 step tick
   * the smoke was fed. */
  let carClockRead = -1;
  let carTickLast = -1;
  /* Since the last feed: the craft touched a car, the shell called a crash. */
  let carTouched = false;
  let chaseCrashed = false;
  const chase = new Chase();
  const chaseCraft = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const chasePos = new THREE.Vector3();
  const chaseVel = new THREE.Vector3();

  function adoptTraffic() {
    trafficOn = false;
    let cars = [];
    if (view.traffic) {
      const up = view.uploadTraffic(sim);
      for (const p of up.problems) {
        console.warn(`traffic: ${p.message}`);
      }
      trafficOn = up.vehicles > 0;
      cars = trafficOn ? view.chaseCars() : [];
    }
    chase.setCars(cars);
    chasePaidUpTo = 0;
    /* On Drift Matsuri the camera is the game (filmFeed below), and the
     * Tail meter would be a second meter for the same cars. */
    ui.setChaseCars(view.filmGame ? 0 : cars.length);
    carTouched = false;
    chaseCrashed = false;
    carClockRead = -1;
    carTickLast = -1;
    if (trafficOn) {
      /* Both drawn poses from the new map's cars, so no frame draws a car
       * between this map and the last. */
      readVehicles(sim, carPrev);
      readVehicles(sim, carCurr);
    }
  }

  /* What a mover contact was: a road car on a map with traffic, else the
   * train. The world report numbers mover m as -2 - m. */
  function moverKind(m) {
    if (sails && m >= sails.base) {
      return 'boom';
    }
    return trafficOn && carCurr[m] && carCurr[m].on ? 'car' : 'train';
  }

  /* Before a stretch of stepping: the cars' clock to the lap clock, and the
   * drawn pair moved on one, as statePrev takes stateCurr. */
  function trafficBeforeSteps() {
    setVehicleClock(sim, simTimeMs);
    const t = carPrev;
    carPrev = carCurr;
    carCurr = t;
  }

  /* After the plant's step to lap clock `clock`, the i'th of `steps` this
   * frame, with `st` the state it left: the contact flag, the pose the
   * craft's statePrev is at, and at every CHASE_EVERY steps the chase's and
   * the smoke's feed. `feed` is false on the launch stand, where the craft
   * is held and chases nothing. */
  function trafficStep(clock, st, i, steps, feed) {
    if (sim.e.sim_world_vehicle_contacts(0, 0) > 0) {
      carTouched = true;
    }
    if (i === steps - 2) {
      readVehicles(sim, carPrev);
    }
    if (clock % CHASE_EVERY !== 0) {
      return;
    }
    readVehicles(sim, carFeed);
    view.carTick(clock, carFeed);
    carTickLast = clock;
    if (!feed) {
      return;
    }
    /* The craft where the chase looks for it: its world position through
     * poseFromState, and its velocity through frame.js and the spawn's
     * turn, as the pose is. */
    poseFromState(st, chasePos);
    simPosToThree(st[4], st[5], st[6], chaseVel);
    chaseVel.applyQuaternion(qSpawn);
    chaseCraft.x = chasePos.x;
    chaseCraft.y = chasePos.y;
    chaseCraft.z = chasePos.z;
    chaseCraft.vx = chaseVel.x;
    chaseCraft.vy = chaseVel.y;
    chaseCraft.vz = chaseVel.z;
    chase.step(clock, chaseCraft, carFeed, carTouched, chaseCrashed);
    if (view.filmGame) {
      filmFeed(clock, st);
    }
    carTouched = false;
    chaseCrashed = false;
    chaseToCounter(clock);
  }

  /*
   * DRIFT MATSURI'S CAMERA (src/game/film.js, src/maps/drift/), fed at the
   * chase's stride from the same poses, in the air only: the craft's camera
   * as the pilot flies it, the craft's turn with the spawn's and the
   * camera's tilt on it, its forward, up and right in the world, and the
   * body rates. A touch of a car is a crash to the camera, as a crash the
   * shell called is. Scratch objects only: nothing is allocated.
   */
  const filmCam = {
    x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, rx: 1, ry: 0, rz: 0, p: 0, q: 0, r: 0,
  };
  const filmQuat = new THREE.Quaternion();
  const filmAxis = new THREE.Vector3();
  function filmFeed(clock, st) {
    const film = view.filmGame.film;
    simQuatToThree(st[7], st[8], st[9], st[10], filmQuat);
    filmQuat.premultiply(qSpawn).multiply(qTilt);
    filmAxis.set(0, 0, -1).applyQuaternion(filmQuat);
    filmCam.fx = filmAxis.x;
    filmCam.fy = filmAxis.y;
    filmCam.fz = filmAxis.z;
    filmAxis.set(0, 1, 0).applyQuaternion(filmQuat);
    filmCam.ux = filmAxis.x;
    filmCam.uy = filmAxis.y;
    filmCam.uz = filmAxis.z;
    filmAxis.set(1, 0, 0).applyQuaternion(filmQuat);
    filmCam.rx = filmAxis.x;
    filmCam.ry = filmAxis.y;
    filmCam.rz = filmAxis.z;
    filmCam.x = chaseCraft.x;
    filmCam.y = chaseCraft.y;
    filmCam.z = chaseCraft.z;
    filmCam.p = st[11];
    filmCam.q = st[12];
    filmCam.r = st[13];
    film.step(clock, filmCam, carFeed, carTouched || chaseCrashed);
  }

  /*
   * Once a frame on Drift Matsuri: the lens the judge measures through, the
   * viewfinder in flight and paused, and the frame's callouts. A take that
   * is cut is kept as this browser's best on the map if it is.
   */
  /*
   * HARNESS ONLY: a camera rig for Drift Matsuri's mockups
   * (window.__filmRig). The headless container cannot fly a five inch
   * after a drift car, so the rig puts the camera where a pilot would be,
   * off one car's pose, every frame, after the cars are posed, and feeds the
   * real judge what that camera sees, on the lap clock, with the craft
   * sitting on the tower. A rig's camera does not turn on its own, so its
   * rates are zero. Nothing calls it in play.
   */
  let filmRig = null;
  const filmRigLook = new THREE.Vector3();
  function filmRigFrame() {
    const r = filmRig;
    const game = view && view.filmGame;
    const a = carCurr[r.slot];
    if (!game || !a || !a.on || mode !== 'flight') {
      return;
    }
    const b = carCurr[r.with ?? r.slot] && carCurr[r.with ?? r.slot].on ? carCurr[r.with ?? r.slot] : a;
    const rx = -a.hz;
    const rz = a.hx;
    const px = a.x + a.hx * r.along + rx * r.side;
    const pz = a.z + a.hz * r.along + rz * r.side;
    filmRigLook.set((a.x + b.x) / 2 + a.hx * (r.lead || 0), (a.y + b.y) / 2 + 0.7, (a.z + b.z) / 2 + a.hz * (r.lead || 0));
    camOverride = [px, a.y + r.up, pz, filmRigLook.x, filmRigLook.y, filmRigLook.z];
    shell.camera.position.set(camOverride[0], camOverride[1], camOverride[2]);
    shell.camera.up.set(0, 1, 0);
    shell.camera.lookAt(filmRigLook);
    shell.camera.updateMatrixWorld();
    const q = shell.camera.quaternion;
    filmAxis.set(0, 0, -1).applyQuaternion(q);
    filmCam.fx = filmAxis.x;
    filmCam.fy = filmAxis.y;
    filmCam.fz = filmAxis.z;
    filmAxis.set(0, 1, 0).applyQuaternion(q);
    filmCam.ux = filmAxis.x;
    filmCam.uy = filmAxis.y;
    filmCam.uz = filmAxis.z;
    filmAxis.set(1, 0, 0).applyQuaternion(q);
    filmCam.rx = filmAxis.x;
    filmCam.ry = filmAxis.y;
    filmCam.rz = filmAxis.z;
    filmCam.x = camOverride[0];
    filmCam.y = camOverride[1];
    filmCam.z = camOverride[2];
    filmCam.p = 0;
    filmCam.q = 0;
    filmCam.r = 0;
    game.film.step(simTimeMs, filmCam, carCurr, false);
  }
  window.__filmRig = (r) => {
    filmRig = r ? { along: -5, side: 0, up: 1.6, lead: 0, ...r } : null;
    if (!r) {
      camOverride = null;
    }
    return view && view.filmGame ? view.filmGame.film.view() : null;
  };
  window.__filmCut = () => {
    if (view && view.filmGame && view.filmGame.film.running) {
      view.filmGame.film.finish(simTimeMs, 'cut');
    }
  };
  window.__film = () => (view && view.filmGame ? { view: { ...view.filmGame.film.view() }, summary: view.filmGame.film.summary } : null);

  const FILM_BEST_KEY = 'webfpv.drift.best.v1';
  let filmBest = -1;
  function filmFrame() {
    const game = view && view.filmGame;
    ui.filmHud.setVisible(Boolean(game) && !replayMode && (ui.screen === 'flight' || ui.screen === 'paused'));
    if (!game) {
      return;
    }
    if (filmBest < 0) {
      filmBest = 0;
      try {
        filmBest = Number(localStorage.getItem(FILM_BEST_KEY)) || 0;
      } catch {
        filmBest = 0;
      }
      ui.filmHud.setBest(filmBest);
    }
    const film = game.film;
    film.setLens(Math.tan((shell.camera.fov * Math.PI) / 360), shell.camera.aspect);
    const evs = film.drainEvents();
    if (evs) {
      for (const e of evs) {
        if ((e.type === 'cut' || e.type === 'crash') && e.summary && e.summary.score > filmBest) {
          e.newBest = true;
          filmBest = e.summary.score;
          try {
            localStorage.setItem(FILM_BEST_KEY, String(filmBest));
          } catch {
            /* A private window keeps it for the session only. */
          }
        }
      }
      ui.filmHud.events(evs);
      if (evs.some((e) => e.newBest)) {
        ui.filmHud.setBest(filmBest);
      }
    }
    ui.filmHud.update(film.view());
  }

  /*
   * The chase into the counter, at the feed that settled it: every paying
   * event the chase queued since the last look goes to chaseBonus in step
   * order, and a tail held at this feed holds the combo open. The queue
   * itself is left for the frame's drain (the Tail meter's callouts and the
   * harness log), which puts chasePaidUpTo back to 0 when it empties it.
   */
  let chasePaidUpTo = 0;
  function chaseToCounter(clock) {
    const evs = chase.events;
    for (let k = chasePaidUpTo; k < evs.length; k += 1) {
      if (pays(evs[k])) {
        chaseBonus(evs[k]);
      }
    }
    chasePaidUpTo = evs.length;
    if (chase.view().holding) {
      score.hold(clock);
    }
  }

  /* After a stretch of stepping: the pose the craft's stateCurr is at. */
  function trafficAfterSteps() {
    readVehicles(sim, carCurr);
    carStepped = true;
    carClockRead = simTimeMs;
  }

  /* The smoke's feed across a stretch of clock the step loop did not walk
   * (the stand steps in one call; the title and results do not step), at
   * most the last SMOKE_CATCH_UP ticks of it, then the clock where the
   * stretch ends. Harmless to the physics: a pose is a function of the
   * clock, and the clock is set again before anything steps. */
  const SMOKE_CATCH_UP = 16;
  function trafficTicks(to) {
    if (to < carTickLast) {
      carTickLast = -1;
    }
    const newest = Math.floor(to / CHASE_EVERY) * CHASE_EVERY;
    let t = Math.max(carTickLast < 0 ? 0 : carTickLast + CHASE_EVERY, newest - (SMOKE_CATCH_UP - 1) * CHASE_EVERY);
    t = Math.ceil(t / CHASE_EVERY) * CHASE_EVERY;
    for (; t <= to; t += CHASE_EVERY) {
      setVehicleClock(sim, t);
      readVehicles(sim, carFeed);
      view.carTick(t, carFeed);
      carTickLast = t;
    }
    setVehicleClock(sim, to);
  }

  /*
   * Once a drawn frame: the cars at `clock`, the lap clock or the screen's
   * own, drawn at alpha between clock - 1 and clock, as the craft is. A
   * frame that stepped already read both poses; one that did not reads them
   * here, once for each clock it is shown.
   */
  function trafficFrame(clock, alpha) {
    if (!trafficOn) {
      return;
    }
    if (!carStepped && clock !== carClockRead) {
      trafficTicks(clock);
      setVehicleClock(sim, clock > 0 ? clock - 1 : 0);
      readVehicles(sim, carPrev);
      setVehicleClock(sim, clock);
      readVehicles(sim, carCurr);
      carClockRead = clock;
    }
    carStepped = false;
    view.poseCars(carPrev, carCurr, alpha, clock - 1 + alpha);
  }

  /*
   * BALLOON CHASE (src/game/balloons.js, src/render/balloons.js), Mat's ask
   * of 2026-10-16: a plane flying clean legs over a freestyle map,
   * streaming balloons to pop. Since his ask of 2026-10-17 it is a piece the
   * author places in the map builder (`balloonChase`, src/props/types.js),
   * not a menu choice: a map without one (view.balloonChase null, which is
   * every race track, the town and every map made before it) runs nothing
   * below past one comparison a frame and has nothing in the scene.
   *
   * NOTHING IT DRAWS IS SOLID and nothing reaches the plant: the plane is
   * flown through and a balloon pops when the craft's centre, swept between
   * feeds, passes within reach of it. In flight the game is fed from the
   * step loop every BALLOON_EVERY steps of the lap clock, so a dropped frame
   * changes nothing it does. While the plant does not step (the title, sat
   * on the ground, a turtle wait) the frame feeds it instead, so the plane
   * never stops in the sky; those feeds never pop. Pause freezes it.
   *
   * A round starts at the first feed with the craft flying and runs
   * ROUND_MS of the game's clock. The result stands RESULT_MS, the best on
   * the map is kept in this browser, and the next round starts. Restart run
   * starts a new one.
   */
  /* The two modules, fetched the first time the game is switched on, so a
   * pilot who never picks it fetches and parses nothing more at boot. */
  let balloonMods = null;
  let balloonLoading = false;
  let balloonGame = null;
  let balloonView = null;
  let balloonFor = null;
  let balloonKey = '';
  let balloonRound = 0;
  let balloonBest = 0;
  let balloonSaved = false;
  let balloonNewBest = false;
  /* The lap clock at the last step loop feed, and the frame's own carry
   * for the feeds it makes while the plant is not stepping. */
  let balloonFeedAt = 0;
  let balloonHavePrev = false;
  let balloonIdleAcc = 0;
  /* This frame the plant was not stepped in flight: landed, a turtle wait
   * or a pose lock. Set by the frame, before the step loop. */
  let balloonIdle = false;
  const balloonCraft = { x: 0, y: 0, z: 0 };
  const balloonPrev = { x: 0, y: 0, z: 0 };
  const balloonPos = new THREE.Vector3();
  const balloonStats = {
    points: 0, leftMs: 0, best: 0, streak: 0, over: false, popped: 0, gold: 0,
    bestStreak: 0, newBest: false, nextMs: 0,
  };

  function balloonBestKey() {
    return `webfpv.balloons.best.${balloonKey}`;
  }

  function readBalloonBest() {
    try {
      const v = Number(localStorage.getItem(balloonBestKey()));
      return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    } catch (e) {
      return 0;
    }
  }

  function writeBalloonBest(v) {
    try {
      localStorage.setItem(balloonBestKey(), String(v));
    } catch (e) {
      /* Private window or blocked storage: the best lasts the session. */
    }
  }

  /* Where the plane may fly: round the map's Balloon chase piece, out to
   * its Radius, never under its Height. */
  function balloonWorld(bc) {
    const c = view.colliders;
    const cx = bc.x;
    const cz = bc.z;
    const radius = bc.radius;
    /* What stands where, read once into a grid here, when the game is
     * switched on, so the plane's look ahead in flight is an array read and
     * never a walk of the colliders. A cell holds the highest top under it
     * or its eight neighbours, so nothing between samples is missed. */
    const half = radius + 70;
    const CELL = Math.max(3, (half * 2) / 160);
    const n = Math.ceil((half * 2) / CELL);
    const raw = new Float32Array(n * n);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const x = cx - half + (i + 0.5) * CELL;
        const z = cz - half + (j + 0.5) * CELL;
        const g = view.height(x, z, 0);
        const top = c && c.built ? c.topAt(x, z, 1e4, 0) : -Infinity;
        raw[i * n + j] = Math.max(Number.isFinite(g) ? g : 0, top);
      }
    }
    const grid = new Float32Array(n * n);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        let m = -Infinity;
        for (let di = -1; di <= 1; di += 1) {
          for (let dj = -1; dj <= 1; dj += 1) {
            const ii = i + di;
            const jj = j + dj;
            if (ii >= 0 && ii < n && jj >= 0 && jj < n && raw[ii * n + jj] > m) {
              m = raw[ii * n + jj];
            }
          }
        }
        grid[i * n + j] = m;
      }
    }
    const x0g = cx - half;
    const z0g = cz - half;
    return {
      cx,
      cz,
      radius,
      altMin: bc.height,
      speedScale: bc.speed,
      ceilingAt(x, z) {
        const i = Math.floor((x - x0g) / CELL);
        const j = Math.floor((z - z0g) / CELL);
        if (i < 0 || j < 0 || i >= n || j >= n) {
          return 0;
        }
        return grid[i * n + j];
      },
    };
  }

  function balloonOff() {
    if (balloonView) {
      balloonView.dispose();
    }
    balloonView = null;
    balloonGame = null;
    balloonFor = null;
    ui.balloonHud.setVisible(false);
  }

  function balloonNewRound() {
    balloonRound += 1;
    balloonGame.reset(balloonRound);
    balloonSaved = false;
    balloonNewBest = false;
    balloonHavePrev = false;
  }

  /* Once a frame, before anything reads the game: on, off, or a new map. */
  function syncBalloons() {
    const want = Boolean(view) && view.mode === 'freestyle' && Boolean(view.balloonChase)
      && mapReady && !replayMode && !ui.dogfight;
    if (!want) {
      if (balloonGame) {
        balloonOff();
      }
      return;
    }
    if (balloonFor === view) {
      return;
    }
    if (!balloonMods) {
      if (!balloonLoading) {
        balloonLoading = true;
        Promise.all([import('./game/balloons.js'), import('./render/balloons.js')])
          .then(([game, render]) => {
            balloonMods = { ...game, BalloonView: render.BalloonView };
          })
          .catch((e) => {
            console.warn('balloons: the game did not load', e);
          })
          .finally(() => {
            balloonLoading = false;
          });
      }
      return;
    }
    const { BalloonChase, hashKey } = balloonMods;
    const bc = view.balloonChase;
    balloonKey = `${view.id}:${(view.egg && view.egg.key) || view.name || ''}`;
    balloonGame = new BalloonChase(balloonWorld(bc), hashKey(balloonKey) ^ (Date.now() >>> 0));
    if (!balloonView) {
      balloonView = new balloonMods.BalloonView();
    }
    balloonView.attach(view.scene, shell.renderer, shell.camera, view.post && view.post.rtScene);
    balloonFor = view;
    balloonBest = readBalloonBest();
    balloonRound = 0;
    balloonNewRound();
  }

  /* One step loop feed at lap clock `clock`, with the craft at state `st`. */
  function balloonStep(clock, st, flying) {
    poseFromState(st, balloonPos);
    balloonCraft.x = balloonPos.x;
    balloonCraft.y = balloonPos.y;
    balloonCraft.z = balloonPos.z;
    /* A set down or a reset moves the craft further than it can fly in a
     * feed: no sweep across the jump. */
    let prev = null;
    if (balloonHavePrev) {
      const dx = balloonCraft.x - balloonPrev.x;
      const dy = balloonCraft.y - balloonPrev.y;
      const dz = balloonCraft.z - balloonPrev.z;
      if (dx * dx + dy * dy + dz * dz < 4) {
        prev = balloonPrev;
      }
    }
    balloonGame.step(flying, balloonCraft, prev);
    balloonPrev.x = balloonCraft.x;
    balloonPrev.y = balloonCraft.y;
    balloonPrev.z = balloonCraft.z;
    balloonHavePrev = true;
    balloonFeedAt = clock;
  }

  /* Once a drawn frame: pops out to the screen and the speaker, the round's
   * end, and the plane and balloons drawn. `ahead` is how far past the last
   * feed this frame is drawn, in ms of the game's clock. */
  function balloonFrame(ahead, dtMs, nowMs) {
    if (!balloonGame) {
      return;
    }
    const { BALLOON_EVERY, RESULT_MS, GOLD_VALUE } = balloonMods;
    const g = balloonGame;
    for (let k = 0; k < g.popCount; k += 1) {
      const p = g.pops[k];
      balloonView.pop(p, nowMs);
      ui.balloonHud.flash(p.gold, p.gold ? GOLD_VALUE : 1);
      if (mode === 'flight' && typeof audio.event === 'function') {
        audio.event('gate');
      }
    }
    g.popCount = 0;
    if (g.over && !balloonSaved) {
      balloonSaved = true;
      if (g.score > balloonBest) {
        balloonNewBest = balloonBest > 0 || g.score > 0;
        balloonBest = g.score;
        writeBalloonBest(g.score);
      }
    }
    if (g.over && g.sinceOverMs() >= RESULT_MS) {
      balloonNewRound();
    }
    balloonView.frame(g, 1 + ahead / BALLOON_EVERY, dtMs, nowMs);
    ui.balloonHud.setVisible(ui.screen === 'flight' || ui.screen === 'paused');
    const st = balloonStats;
    st.points = g.score;
    st.leftMs = g.leftMs();
    st.best = balloonBest;
    st.streak = g.streak;
    st.over = g.over;
    st.popped = g.popped;
    st.gold = g.goldPopped;
    st.bestStreak = g.bestStreak;
    st.newBest = balloonNewBest;
    st.cleared = g.cleared;
    st.timeMs = g.endMs;
    st.nextMs = g.over ? Math.max(0, RESULT_MS - g.sinceOverMs()) : 0;
    ui.balloonHud.update(st);
  }

  /* While the plant does not step: feeds from the frame's own time, which
   * never pop. Returns how far past the last feed the frame is. */
  function balloonIdleTick(dtMs) {
    const { BALLOON_EVERY } = balloonMods;
    balloonIdleAcc += dtMs;
    let n = 0;
    while (balloonIdleAcc >= BALLOON_EVERY && n < 40) {
      balloonIdleAcc -= BALLOON_EVERY;
      balloonGame.step(false, balloonCraft, null);
      n += 1;
    }
    if (n === 40) {
      balloonIdleAcc = 0;
    }
    /* The craft did not fly through these: no sweep across them. */
    balloonHavePrev = false;
    return balloonIdleAcc;
  }


  /*
   * DOGFIGHT (src/game/dogfight.js, src/render/dogfight.js,
   * src/ui/dogfighthud.js), the owner's ask of 2026-10-29: guns, missiles
   * and bots on any map, picked from the gate's Dogfight panel. ui.dogfight
   * is the rules while one is on and null otherwise, so every map flown
   * any other way runs nothing below past one comparison a frame.
   *
   * NOTHING HERE REACHES THE PLANT. The bots, pellets and missiles are drawn
   * and never uploaded, and a hit takes health and nothing else. In flight
   * the game is fed from the step loop every DOGFIGHT_EVERY steps of the
   * lap clock, as the balloons are, so a dropped frame changes nothing it
   * does; while the plant is not stepping (sat on the ground, a turtle
   * wait) the frame feeds it so the bots fly on. Pause freezes it.
   *
   * A pop of the pilot is the shell's own put back at the spawn, the same
   * resetCraft a restart uses, with the lap clock left alone. The bots and
   * the walls they see are read from the map's colliders once, when the
   * fight starts, into what the game calls its world (fightWorld).
   */
  /* The modules of the game being flown, and every game's once fetched:
   * the dogfight's, and ribbon cutting's (src/game/ribbons.js), which is the
   * dogfight with ribbons for guns and runs through everything below. */
  let fightMods = null;
  const fightLib = { dogfight: null, ribbon: null };
  let fightKind = 'dogfight';
  /* Whether the game is a ribbon cutting room's (RibbonRoom), which the
   * room plays rather than the pilot's own rules. */
  let fightInRoom = false;
  const ROOM_RIBBON_RULES = Object.freeze({ game: 'ribbon', room: true });
  const fightHuds = { dogfight: null, ribbon: null };
  let fightLoading = false;
  let fightGame = null;
  let fightView = null;
  let fightHud = null;
  let fightFor = null;
  let fightRulesKey = '';
  let fightKey = '';
  let fightRound = 0;
  let fightBest = 0;
  let fightSaved = false;
  let fightNewBest = false;
  let fightFeedAt = 0;
  let fightIdleAcc = 0;
  let fightTeleported = true;
  let fightWhoop = false;
  const fightMe = {
    x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, gun: false, missile: false, flying: false,
  };
  const fightPos = new THREE.Vector3();
  const fightQuat = new THREE.Quaternion();
  const fightAim = new THREE.Vector3();
  const fightExtra = { best: 0, newBest: false, nextMs: 0, kicker: 'Dogfight' };

  function fightBestKey() {
    return fightKind === 'ribbon' ? `webfpv.ribbons.best.${fightKey}` : `webfpv.dogfight.best.${fightKey}`;
  }

  function readFightBest() {
    try {
      const v = Number(localStorage.getItem(fightBestKey()));
      return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    } catch (e) {
      return 0;
    }
  }

  function writeFightBest(v) {
    try {
      localStorage.setItem(fightBestKey(), String(v));
    } catch (e) {
      /* Private window: the best lasts the session. */
    }
  }

  /*
   * THE FIGHT'S WORLD, read once when it starts. Where the bots roam: round
   * the spawn, out to the map's colliders, never further than a fight can
   * see across. The ground as a grid, so the game's floor is an array read.
   *
   * AND THE SOLIDS AS A GRID OF CELLS, filled once from the colliders, so
   * `blocked`, the one question the game asks of them, is a walk of array
   * reads along the line. The first build asked the colliders' own through
   * test instead and cost 0.3 to 0.4 ms a feed in the town, forty times
   * the game's whole budget: each query walks every bucket within the
   * largest solid's reach. A cell is marked when a solid touches any of
   * it, so a wall thinner than a cell still stops a pellet; the price is a
   * wall half a cell thicker than it is, which nobody aiming a gun sees.
   * The cars and the train are not in it: they move, and a pellet through
   * a train is the train's business.
   */
  function fightWorld() {
    const c = view.colliders;
    const k = simLenToWorld(1);
    const cx = startX;
    const cz = startZ;
    const cy = startY;
    const solid = Boolean(c && c.built && c.fax);
    /* How far the map's solids go from the spawn, and how high. */
    let far = 0;
    let topY = cy;
    if (solid) {
      for (let i = 0; i < c.count; i += 1) {
        const x0 = Math.min(c.fax[i], c.fbx[i]);
        const x1 = Math.max(c.fax[i], c.fbx[i]);
        const z0 = Math.min(c.faz[i], c.fbz[i]);
        const z1 = Math.max(c.faz[i], c.fbz[i]);
        const dx = Math.max(Math.abs(x0 - cx), Math.abs(x1 - cx));
        const dz = Math.max(Math.abs(z0 - cz), Math.abs(z1 - cz));
        const d = Math.sqrt(dx * dx + dz * dz);
        /* A ground slab the size of the map says nothing about where the
         * fight is. */
        if (d < 400 * k) {
          far = Math.max(far, d);
          topY = Math.max(topY, c.fay[i], c.fby[i]);
        }
      }
    }
    const radius = Math.max(40 * k, Math.min(150 * k, far * 0.85));
    const top = Math.max(12 * k, Math.min(60 * k, topY - cy + 4 * k));
    /* The ground, sampled from just above the spawn's height so a deck or
     * a floor indoors is the floor and not the street under it. */
    const half = radius + 30 * k;
    const n = 160;
    const cell = (half * 2) / n;
    const ground = new Float32Array(n * n);
    const fromY = cy + 1 * k;
    let lowY = cy;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const g = view.height(cx - half + (i + 0.5) * cell, cz - half + (j + 0.5) * cell, fromY);
        ground[i * n + j] = Number.isFinite(g) ? g : cy;
        lowY = Math.min(lowY, ground[i * n + j]);
      }
    }
    const x0g = cx - half;
    const z0g = cz - half;
    const floorAt = (x, y, z) => {
      const i = Math.floor((x - x0g) / cell);
      const j = Math.floor((z - z0g) / cell);
      if (i < 0 || j < 0 || i >= n || j >= n) {
        return cy;
      }
      return ground[i * n + j];
    };
    /* The cells: as fine as three million of them allow, and never finer
     * than a third of a metre of the aircraft's. */
    const yLo = lowY - 2 * k;
    const yHi = cy + top + 12 * k;
    let v = Math.max(0.35 * k, (half * 2) / 256);
    while (Math.ceil((half * 2) / v) ** 2 * Math.ceil((yHi - yLo) / v) > 3e6) {
      v *= 1.15;
    }
    const nx = Math.ceil((half * 2) / v);
    const ny = Math.ceil((yHi - yLo) / v);
    const occ = new Uint8Array(nx * nx * ny);
    const at = (i, j, l) => (l * nx + j) * nx + i;
    if (solid) {
      const lo = (q, o, nmax) => Math.max(0, Math.min(nmax - 1, Math.floor((q - o) / v)));
      for (let s = 0; s < c.count; s += 1) {
        const box = c.fbox[s] === 1;
        const r = box ? 0 : c.fr[s];
        const ax = c.fax[s];
        const ay = c.fay[s];
        const az = c.faz[s];
        const bx = c.fbx[s];
        const by = c.fby[s];
        const bz = c.fbz[s];
        const minX = Math.min(ax, bx) - r;
        const maxX = Math.max(ax, bx) + r;
        const minY = Math.min(ay, by) - r;
        const maxY = Math.max(ay, by) + r;
        const minZ = Math.min(az, bz) - r;
        const maxZ = Math.max(az, bz) + r;
        if (maxX < x0g || minX > x0g + nx * v || maxZ < z0g || minZ > z0g + nx * v || maxY < yLo || minY > yLo + ny * v) {
          continue;
        }
        const i0 = lo(minX, x0g, nx);
        const i1 = lo(maxX, x0g, nx);
        const j0 = lo(minZ, z0g, nx);
        const j1 = lo(maxZ, z0g, nx);
        const l0 = lo(minY, yLo, ny);
        const l1 = lo(maxY, yLo, ny);
        /* A capsule marks the cells whose middle is within its radius and
         * half a cell's diagonal of its axis. */
        const ex = bx - ax;
        const ey = by - ay;
        const ez = bz - az;
        const ee = ex * ex + ey * ey + ez * ez;
        const reach = r + v * 0.87;
        for (let l = l0; l <= l1; l += 1) {
          for (let j = j0; j <= j1; j += 1) {
            for (let i = i0; i <= i1; i += 1) {
              if (!box) {
                const px = x0g + (i + 0.5) * v - ax;
                const py = yLo + (l + 0.5) * v - ay;
                const pz = z0g + (j + 0.5) * v - az;
                let u = ee > 0 ? (px * ex + py * ey + pz * ez) / ee : 0;
                u = u < 0 ? 0 : (u > 1 ? 1 : u);
                const qx = px - ex * u;
                const qy = py - ey * u;
                const qz = pz - ez * u;
                if (qx * qx + qy * qy + qz * qz > reach * reach) {
                  continue;
                }
              }
              occ[at(i, j, l)] = 1;
            }
          }
        }
      }
    }
    const inside = (x, y, z) => {
      const i = Math.floor((x - x0g) / v);
      const j = Math.floor((z - z0g) / v);
      const l = Math.floor((y - yLo) / v);
      if (i < 0 || j < 0 || l < 0 || i >= nx || j >= nx || l >= ny) {
        return false;
      }
      return occ[at(i, j, l)] === 1;
    };
    /* Along the line in half cells. A line that starts in a marked cell, a
     * bot brushing a wall, is let out of it before anything counts, so
     * nothing is ever stuck to the wall it touched. */
    const blocked = (ax, ay, az, bx, by, bz) => {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!(len > 0)) {
        return -1;
      }
      const steps = Math.max(1, Math.ceil(len / (v * 0.5)));
      let out = !inside(ax, ay, az);
      for (let s = 1; s <= steps; s += 1) {
        const t = s / steps;
        const x = ax + dx * t;
        const y = ay + dy * t;
        const z = az + dz * t;
        if (y < floorAt(x, y, z)) {
          return t;
        }
        const hit = inside(x, y, z);
        if (!out) {
          out = !hit;
        } else if (hit) {
          return t;
        }
      }
      return -1;
    };
    /* Where a bot comes back: open air round the spawn that can be seen
     * from it, in eight directions at three distances, nearest first. */
    const DIRS = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
    const spawns = [];
    const eyeY = cy + 2 * k;
    for (const share of [0.3, 0.5, 0.7, 0.15]) {
      for (let d = 0; d < DIRS.length && spawns.length < 14; d += 1) {
        const [ux, uz] = DIRS[d];
        const x = cx + ux * radius * share;
        const z = cz + uz * radius * share;
        const y = Math.min(cy + top - 2 * k, Math.max(floorAt(x, cy, z) + 4 * k, eyeY + 2 * k));
        if (inside(x, y, z) || blocked(cx, eyeY, cz, x, y, z) >= 0) {
          continue;
        }
        spawns.push({ x, y, z });
      }
    }
    if (spawns.length < 3) {
      spawns.push({ x: cx, y: eyeY + 3 * k, z: cz });
    }
    return {
      k,
      cruise: fightWhoop ? 9 : 24,
      cx,
      cy,
      cz,
      radius,
      top,
      spawns,
      floorAt,
      blocked,
    };
  }

  function fightOff() {
    if (fightView) {
      fightView.dispose();
    }
    fightView = null;
    fightGame = null;
    fightFor = null;
    input.weaponsLive = false;
    input.touchGun = false;
    if (fightHud) {
      fightHud.setVisible(false);
    }
  }

  function fightNewRound() {
    fightRound += 1;
    fightGame.reset(fightRound);
    fightSaved = false;
    fightNewBest = false;
    fightTeleported = true;
  }

  /* Once a frame, before anything reads the game: on, off, a new map or
   * new rules. */
  function syncDogfight() {
    /* A ribbon cutting room on this world plays ribbons whatever the pilot
     * was doing; any other room plays no game of this kind. */
    const roomRibbon = Boolean(together && ui.roomInfo && together.ribbonRoom());
    const rules = roomRibbon ? ROOM_RIBBON_RULES : ui.dogfight;
    const want = Boolean(view) && Boolean(rules) && mapReady && !replayMode && (roomRibbon || !ui.roomInfo);
    if (!want) {
      if (fightGame) {
        fightOff();
      }
      return;
    }
    const kind = rules.game === 'ribbon' ? 'ribbon' : 'dogfight';
    const rulesKey = JSON.stringify(rules);
    if (fightFor === view && fightGame && fightKind === kind && fightInRoom === roomRibbon) {
      if (roomRibbon) {
        return;
      }
      if (rulesKey !== fightRulesKey) {
        fightRulesKey = rulesKey;
        fightGame.setRules(rules);
        fightSaved = false;
        fightNewBest = false;
        fightTeleported = true;
      }
      return;
    }
    if (!fightLib[kind]) {
      if (!fightLoading) {
        fightLoading = true;
        const want = kind === 'ribbon'
          ? Promise.all([import('./game/ribbons.js'), import('./render/ribbons.js'), import('./ui/ribbonhud.js'), import('./game/dogfight.js'), import('./render/dogfight.js')])
            .then(([game, render, hud, base, baseRender]) => ({
              ...base, ...game, Game: game.RibbonCut, View: render.RibbonView, feedFraction: baseRender.feedFraction, Hud: hud.RibbonHud, kicker: 'Ribbon cutting',
            }))
          : Promise.all([import('./game/dogfight.js'), import('./render/dogfight.js'), import('./ui/dogfighthud.js')])
            .then(([game, render, hud]) => ({
              ...game, Game: game.Dogfight, View: render.DogfightView, feedFraction: render.feedFraction, Hud: hud.DogfightHud, kicker: 'Dogfight',
            }));
        want
          .then((mods) => {
            fightLib[kind] = mods;
          })
          .catch((e) => {
            console.warn('dogfight: the game did not load', e);
          })
          .finally(() => {
            fightLoading = false;
          });
      }
      return;
    }
    if (fightGame) {
      fightOff();
    }
    fightKind = kind;
    fightMods = fightLib[kind];
    const {
      Game, hashKey, View, Hud,
    } = fightMods;
    fightWhoop = runAirframe === 'whoop65';
    fightKey = `${view.id}:${(view.egg && view.egg.key) || view.name || ''}:${fightWhoop ? 'whoop' : 'five'}`;
    fightRulesKey = rulesKey;
    fightInRoom = roomRibbon;
    const builtAt = performance.now();
    const world = fightWorld();
    fightGame = roomRibbon
      ? new fightMods.RibbonRoom(world)
      : new Game(world, rules, hashKey(fightKey) ^ (Date.now() >>> 0));
    /* For the checks: what reading the map cost, once. */
    fightGame.buildMs = performance.now() - builtAt;
    fightView = new View({ whoop: fightWhoop, slots: roomRibbon ? fightMods.ROOM_SLOTS : 0 });
    fightView.attach(view.scene, shell.renderer, shell.camera, view.post && view.post.rtScene);
    for (const other of Object.keys(fightHuds)) {
      if (other !== kind && fightHuds[other]) {
        fightHuds[other].setVisible(false);
      }
    }
    if (!fightHuds[kind]) {
      fightHuds[kind] = new Hud(ui.root, {
        input,
        onAgain: () => {
          if (fightGame && fightGame.room) {
            together.ribbonStart();
          } else if (fightGame) {
            fightNewRound();
          }
        },
        onFlyOn: () => {
          if (fightGame && fightGame.room) {
            fightGame.reset();
          }
        },
        onChange: () => ui.act('fight-change'),
        onLeave: () => ui.act('fight-leave'),
      });
    }
    fightHud = fightHuds[kind];
    fightExtra.kicker = fightMods.kicker;
    fightFor = view;
    fightBest = readFightBest();
    fightRound = 0;
    if (roomRibbon) {
      const last = together.ribbonLast();
      fightRoomSync();
      if (last) {
        fightGame.heard(last.state, last.goLocal, last.endLocal);
      }
    }
    fightNewRound();
    /* Ribbons fire nothing: the gun and missile buttons stay what they
     * were. */
    input.weaponsLive = kind !== 'ribbon';
  }

  /* Once a frame in a ribbon cutting room: who this page is, the board's
   * round and the cuts it believed in, and this page's cuts out to it. */
  function fightRoomSync() {
    if (!fightGame || !fightGame.room || !together) {
      return;
    }
    const who = together.ribbonWho();
    if (who) {
      fightGame.setYou(who.you, who.host, who.avatar);
    }
    /* The host's bots: the seats, and their places out to the room when
     * this page is the one flying them (src/net/roombots.js). */
    const bots = together.roomBots();
    if (bots) {
      const g = fightGame;
      const mine = bots.mine();
      g.setBots(bots.seats(), mine);
      if (mine) {
        for (let s = 1; s < fightMods.MAX_PILOTS; s += 1) {
          if (g.botFlies(s)) {
            bots.pose(g.idOf[s], g.x[s], g.y[s], g.z[s], g.fx[s], g.fy[s], g.fz[s], g.ux[s], g.uy[s], g.uz[s]);
          }
        }
      }
    }
    const rb = together.takeRibbon();
    if (rb) {
      fightGame.heard(rb.state, rb.goLocal, rb.endLocal);
    }
    const cuts = together.takeRibbonCuts();
    if (cuts) {
      for (const c of cuts) {
        fightGame.applyCut(c);
      }
    }
    const out = fightGame.takeOutbox();
    if (out) {
      for (const m of out) {
        together.sendRibbon(m);
      }
    }
  }

  /* One step loop feed with the craft at state `st`. */
  function fightStep(clock, st, flying) {
    poseFromState(st, fightPos);
    simQuatToThree(st[7], st[8], st[9], st[10], fightQuat);
    fightQuat.premultiply(qSpawn);
    const m = fightMe;
    m.x = fightPos.x;
    m.y = fightPos.y;
    m.z = fightPos.z;
    fightAim.set(0, 1, 0).applyQuaternion(fightQuat);
    m.ux = fightAim.x;
    m.uy = fightAim.y;
    m.uz = fightAim.z;
    /* The gun points where the camera looks, its tilt included, which is
     * where the reticle is. */
    fightQuat.multiply(qTilt);
    fightAim.set(0, 0, -1).applyQuaternion(fightQuat);
    m.fx = fightAim.x;
    m.fy = fightAim.y;
    m.fz = fightAim.z;
    m.flying = flying;
    m.gun = flying && mode === 'flight' && input.gunHeld();
    /* Taken whatever: a press on the ground is not a missile on takeoff. */
    m.missile = input.takeMissile() && flying && mode === 'flight';
    fightGame.step(m, fightTeleported);
    fightTeleported = false;
    fightFeedAt = clock;
  }

  /* While the plant does not step: feeds from the frame's own time, with
   * the craft where it sits. Returns how far past the last feed the frame
   * is. */
  function fightIdleTick(dtMs) {
    const { DOGFIGHT_EVERY } = fightMods;
    fightIdleAcc += dtMs;
    let n = 0;
    while (fightIdleAcc >= DOGFIGHT_EVERY && n < 40) {
      fightIdleAcc -= DOGFIGHT_EVERY;
      fightStep(fightFeedAt, stateCurr, false);
      n += 1;
    }
    if (n === 40) {
      fightIdleAcc = 0;
    }
    return fightIdleAcc;
  }

  /* Once a drawn frame: the game's events out to the world, the HUD and
   * the speaker, a pop of the pilot put back at the spawn, and the round's
   * end. `ahead` is how far past the last feed this frame is drawn. */
  function fightFrame(ahead, dtMs, nowMs) {
    if (!fightGame) {
      return;
    }
    const { RESULT_MS, ME, feedFraction } = fightMods;
    const g = fightGame;
    let popMe = false;
    for (let n = 0; n < g.eventCount; n += 1) {
      const e = g.events[n];
      fightView.event(e, g, nowMs);
      const sound = fightHud.event(e, g, nowMs);
      if (sound && mode === 'flight' && typeof audio.event === 'function') {
        audio.event(sound);
      }
      if (e.type === 'pop' && e.to === ME) {
        popMe = true;
      }
    }
    g.eventCount = 0;
    if (popMe && mode === 'flight') {
      adoptSpawn();
      resetCraft();
      fightTeleported = true;
    }
    if (g.over && !fightSaved && !g.room) {
      fightSaved = true;
      const mine = g.pops[ME];
      if (mine > fightBest) {
        fightNewBest = fightBest > 0 || mine > 0;
        fightBest = mine;
        writeFightBest(mine);
      }
    }
    if (g.over && g.sinceOverMs() >= RESULT_MS) {
      fightNewRound();
    }
    const t = feedFraction(ahead);
    fightView.frame(g, t, shell.camera.position, dtMs, nowMs);
    /* Not over a menu: the pause and its dialogs are read, not flown. */
    const on = ui.screen === 'flight';
    let touch = false;
    try {
      touch = window.matchMedia('(pointer: coarse)').matches;
    } catch (e) {
      touch = false;
    }
    fightHud.setVisible(on, { touch: touch && ui.screen === 'flight' });
    fightExtra.best = fightBest;
    fightExtra.newBest = fightNewBest;
    fightExtra.nextMs = g.over ? Math.max(0, RESULT_MS - g.sinceOverMs()) : 0;
    fightHud.frame(g, t, shell.camera, nowMs, fightExtra);
  }

  /* A crash the shell called, told to the chase as it is told to the score:
   * the tail and everything waiting to pay are lost. */
  function chaseBail() {
    if (trafficOn) {
      chase.bail(simTimeMs, 'crash');
      chaseCrashed = true;
    }
  }

  /*
   * THE COUNTER'S FEED, after the plant's step to lap clock `clock` with
   * `st` the state it left and `dv2` that step's squared change of
   * velocity. Freestyle only (the step loop's `scoring`). Allocates nothing:
   * the pose and velocity go through the scratch below, and an event is
   * only made when a gap or a close call settles.
   *
   *   every step    the craft's CG to the named gaps, which sweep the path
   *                 from the last step to this one across every window
   *   every 8 ms    the close calls, with the ground under the craft (the
   *                 map's height, asked as every other craft query asks it)
   *                 and the hard contact and crash flags since the last
   *                 feed; the held skim holds the combo open and is the
   *                 counter's meter
   */
  const counterPos = new THREE.Vector3();
  const counterVel = new THREE.Vector3();
  const counterCraft = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  };
  const COUNTER_HARD_DV2 = CC_HARD_DV * CC_HARD_DV;
  function counterStep(clock, st, dv2) {
    if (dv2 >= COUNTER_HARD_DV2) {
      counterHard = true;
    }
    poseFromState(st, counterPos);
    namedGapRun.step(clock, counterPos.x, counterPos.y, counterPos.z);
    counterTakeGaps();
    if (clock % CC_EVERY !== 0) {
      return;
    }
    simPosToThree(st[4], st[5], st[6], counterVel);
    counterVel.applyQuaternion(qSpawn);
    counterCraft.x = counterPos.x;
    counterCraft.y = counterPos.y;
    counterCraft.z = counterPos.z;
    counterCraft.vx = counterVel.x;
    counterCraft.vy = counterVel.y;
    counterCraft.vz = counterVel.z;
    const groundY = view.height(counterPos.x, counterPos.z, counterPos.y - SURFACE_BIAS, counterPos.y);
    closeCalls.step(clock, counterCraft, groundY, counterHard, counterCrashed);
    counterHard = false;
    counterCrashed = false;
    counterTakeCloseCalls();
    if (closeCalls.skimHeld()) {
      score.hold(clock);
    }
    score.setSkim(closeCalls.live.skim, closeCalls.live.holdMs, closeCalls.live.clearance);
  }

  /* What the gaps settled, into the counter, emptying their queue. */
  function counterTakeGaps() {
    const evs = namedGapRun.events;
    if (evs.length === 0) {
      return;
    }
    for (let k = 0; k < evs.length; k += 1) {
      const e = evs[k];
      score.gap(e.name, e.tier, e.paidStep, e.index);
    }
    /* Steam edition: career. The gaps that paid, as the counter took them. */
    if (career) {
      career.gaps(evs);
    }
    evs.length = 0;
  }

  /* What the close calls settled, into the counter: the paying ones; the
   * lost ones only to the harness log. Empties their queue. */
  function counterTakeCloseCalls() {
    const evs = closeCalls.events;
    if (evs.length === 0) {
      return;
    }
    for (let k = 0; k < evs.length; k += 1) {
      const e = evs[k];
      if (e.kind !== 'lost' && e.value > 0) {
        score.closeCall(e);
      }
      noteCloseCall(e);
    }
    evs.length = 0;
  }

  /*
   * Once a frame, before the counter is ticked: anything that waited out its
   * window while no step came (the craft landed, a turtle wait) pays now,
   * on the lap clock, so a skim that ended in a perch is not held until the
   * next takeoff.
   */
  function counterFrame() {
    namedGapRun.settle(simTimeMs);
    counterTakeGaps();
    closeCalls.tick(simTimeMs);
    counterTakeCloseCalls();
    if (!closeCalls.live.skim) {
      score.setSkim(false, 0, 0);
    }
  }

  /*
   * A CRASH, TOLD TO THE COUNTER. `board` says whether this is one of the
   * crashes the trick scorer has always heard (the ground's hard hit, the
   * STOP, the harness's staged bail): then score.crash() bails the counter
   * and the board twin together, as it always bailed the one scorer. Every
   * other crash path (a solid crash that sets the craft down, a craft set
   * down stuck, X) bails the counter alone, so a crash is never paid for and
   * the board's number is still computed as it was: see bailCounter in
   * src/game/score.js. Once a frame at most, so a hard ground hit that also
   * sets the craft down is one crash and not two. The gaps and the close
   * calls lose whatever was waiting to pay.
   */
  let counterBailAt = -1;
  function counterCrash(board) {
    if (!view || view.mode !== 'freestyle') {
      return;
    }
    namedGapRun.bail(simTimeMs);
    closeCalls.bail(simTimeMs, 'crash');
    counterTakeCloseCalls();
    counterCrashed = true;
    if (board) {
      score.crash();
    } else if (counterBailAt !== simTimeMs) {
      score.bailCounter();
    }
    counterBailAt = simTimeMs;
    score.setSkim(false, 0, 0);
  }

  /*
   * THE MANGA LAYER'S PICTURE (Stage F, src/render/manga.js).
   *
   * Asked of the system once and then read as a live query, so a pilot who
   * turns reduced motion on in the middle of a session gets it at once. A
   * pilot who asked for less motion gets still speed lines and no impact
   * frame: a flash is the one part of this layer that is a photosensitivity
   * question and not only a style one.
   */
  const reduceMotionQuery = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  function reducedMotion() {
    return Boolean(reduceMotionQuery && reduceMotionQuery.matches);
  }
  /* The impact frame answers to three switches: the manga layer (a
   * freestyle map without Clean FPV), its own row in Settings, and the
   * system's reduced motion. */
  function impactFrameOn() {
    return Boolean(ui.manga && ui.settings.impactFrame) && !reducedMotion();
  }
  /*
   * The screentone is judged by flying it before it is kept (the plan,
   * section 3.2 item 2). Off by default: see the Stage F entry in
   * PROGRESS.md for the shimmer this found. `?tone=1` turns it on for a
   * pilot who wants to fly it, at the High tier only.
   */
  let mangaToneWanted = false;
  try {
    mangaToneWanted = new URLSearchParams(window.location.search).get('tone') === '1';
  } catch (e) {
    /* No location: the default. */
  }
  /* A crash, from the harness: start an impact frame holding the pose
   * the pilot last saw, if the switches allow and none began under two
   * seconds ago. */
  function mangaCrash() {
    if (!impactFrameOn()) {
      return false;
    }
    return manga.impact(shell.camera);
  }
  /* Once a frame the world is drawn, just before the post chain: the speed
   * lines from the craft's velocity turned into the camera's frame, the
   * impact frame's clock, and the screentone's switch. A race track's chain
   * has no manga edit and is left alone; a freestyle map's gets zeros when
   * ui.manga is false.
   *
   * THE INK LINES ARE SET HERE TOO, though they are not the manga layer's
   * strokes: Manga and scoring off takes the black outline off every world
   * on Medium and High, as Low has it (setInkLines in src/render/quality.js).
   * Here because this runs once a frame for whichever world is live, the
   * title's included, so a world swapped in is given the switch without a
   * call of its own. Not while the Freestyle room's cards are being filmed:
   * a clip is cached in this browser for good, and one recorded with the
   * switch off would keep no outline after it was turned back on. */
  function mangaFrame(dt) {
    setInkLines(view.post, filmNow || ui.settings.mangaAndScoring !== false);
    const on = Boolean(ui.manga) && view.mode === 'freestyle';
    const fpv = on && mode === 'flight' && introMs < 0 && !replayMode && Boolean(stateCurr);
    let speed = 0;
    if (fpv) {
      /* The plant's velocity is already in the world frame: the axis
       * permutation and the spawn's yaw are the whole conversion, as
       * __craftState has it. */
      simPosToThree(stateCurr[4], stateCurr[5], stateCurr[6], mangaVel);
      mangaVel.applyQuaternion(qSpawn);
      speed = mangaVel.length();
      mangaCamInv.copy(shell.camera.quaternion).invert();
      mangaVel.applyQuaternion(mangaCamInv);
    } else {
      mangaVel.set(0, 0, 0);
    }
    manga.frame(view.post, {
      lines: fpv,
      impact: on && impactFrameOn(),
      tone: on && mangaToneWanted && view.graphics === 'high',
      still: reducedMotion(),
      speed,
      vel: mangaVel,
      tanHalf: Math.tan((shell.camera.fov * Math.PI) / 360),
      dtMs: dt,
    });
  }

  /*
   * The moving solids, seated for one step of the lap clock: the train's
   * cars and the crossing's booms, from the map's own closed form, so the
   * world the plant flies through is a function of the step count and of
   * nothing about the frame. Allocates nothing.
   */
  let worldSolids = null;
  let worldSolidDown = null;
  const worldSolidState = { offset: 0, armT: 0, down: false, closing: false, visible: false };
  function pushWorldSolids(step) {
    if (!worldSolids) {
      return;
    }
    const st = worldSolids.at(step, worldSolidState);
    const col = view.colliders;
    for (let m = 0; m < worldSolids.cars.length; m += 1) {
      const c = worldSolids.cars[m];
      const i = c.index;
      setMover(
        sim, m, c.x + st.offset, c.y, c.z,
        col.movingHx[i], col.movingHy[i], col.movingHz[i],
        worldSolids.speed, 0, 0, 'train', st.visible,
      );
    }
    if (st.down !== worldSolidDown) {
      worldSolidDown = st.down;
      const y = st.down ? worldSolids.boomDown : worldSolids.boomParked;
      for (const i of worldSolids.booms) {
        setBoxHeight(sim, i, y[0], y[1]);
      }
    }
  }

  /*
   * THE WINDMILLS' SAILS (src/props/windmill.js sailsOf), seated for one
   * step of the lap clock as the train is, in the top SAIL_SLOTS mover
   * slots, where a built map's traffic never reaches (traffic.js caps its
   * cars below them). Only the strips of sail in a small window round the
   * craft are seated, so where the craft is goes in too: `st`, the state
   * the step starts from, taken to the world through the plant's own frame
   * (setWorldFrame) with the frame's turn as frameTurn has it, so no engine's
   * cosine reaches the physics. A map with no windmill has `sails` null and
   * none of this runs. Allocates nothing: the boxes' scratch is made when a
   * map with a windmill is adopted, so this file does not import the
   * windmill and a pilot who never meets one never loads it.
   */
  let sails = null;
  let sailsUsed = 0;
  let sailBoxes = null;
  const sailCraft = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  function pushSails(step, st) {
    if (!sails) {
      return;
    }
    const px = st[1];
    const py = st[2];
    simPosToThree(frameTurn.c * px - frameTurn.s * py, frameTurn.s * px + frameTurn.c * py, st[3] + SPAWN_ALT, sailCraft);
    const n = sails.seat(step, sailCraft.x + startX, sailCraft.y + startY, sailCraft.z + startZ, sailBoxes);
    for (let k = 0; k < n; k += 1) {
      const o = k * sails.doubles;
      setMover(
        sim, sails.base + k,
        sailBoxes[o], sailBoxes[o + 1], sailBoxes[o + 2],
        sailBoxes[o + 3], sailBoxes[o + 4], sailBoxes[o + 5],
        sailBoxes[o + 6], sailBoxes[o + 7], sailBoxes[o + 8],
        'boom', true,
      );
    }
    for (let k = n; k < sailsUsed; k += 1) {
      setMover(sim, sails.base + k, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'boom', false);
    }
    sailsUsed = n;
  }

  /*
   * THE LENS'S NEAR PLANE FOLLOWS THE LENS.
   *
   * It was a fixed 0.2 m (src/render/shell.js), and the lens sits 8 cm ahead
   * of the CG inside a hull that reaches 14 cm, so a quad touching a wall had
   * its lens about 6 cm from it and the wall was not drawn: the review of
   * 2026-09-24 photographed the inside of a shop through a facade 7 and 15 cm
   * from the camera, and that is most of what a pilot called clipping through
   * buildings. A fixed small near plane would cost every distant pixel its
   * depth precision. So it is 0.2 m in open air, as it always was, and shrinks
   * with the lens's clearance to the nearest solid or the ground, down to a
   * centimetre, which the plant's lens bumper (world.c) never lets it reach.
   * The fraction keeps the near plane's CORNERS inside that clearance: at a
   * wide FPV lens they are about twice as far out as its centre.
   */
  const CAMERA_NEAR_OPEN = 0.2;
  const CAMERA_NEAR_MIN = 0.01;
  const CAMERA_NEAR_FRACTION = 0.45;
  /*
   * A SMALLER AIRCRAFT, A NEARER PLANE. The numbers above were set for a
   * craft drawn at its own size, which every pairing was until the quad
   * picker (the owner, 2026-10-28). A whoop in the town is drawn 3.43 times
   * smaller and its lens bumper is 5.5 mm off a wall rather than 19, so a
   * centimetre's near plane put the glass through the wall at every touch,
   * and the props in view, forty times out, sat inside the open 0.2 m. So
   * both come down with the aircraft, through src/render/frame.js's scale.
   * Never up: a five inch in a house drawn 3.5 times bigger loses nothing
   * at the boot's numbers, and a plane pushed further out has only depth
   * precision to gain, which the town already does without at a
   * centimetre. At 1 this is 1 and the numbers are the same to the bit.
   */
  function nearScale() {
    const k = simLenToWorld(1);
    return k < 1 ? k : 1;
  }
  function fpvNear(p) {
    const k = nearScale();
    const open = CAMERA_NEAR_OPEN * k;
    const least = CAMERA_NEAR_MIN * k;
    const reach = open / CAMERA_NEAR_FRACTION;
    let gap = view.colliders ? view.colliders.gapAt(p.x, p.y, p.z, reach) : Infinity;
    /* A car is solid too, and not a collider: its drawn box, as last drawn. */
    if (trafficOn) {
      const car = view.carGap(p.x, p.y, p.z, reach);
      if (car < gap) {
        gap = car;
      }
    }
    /* And a windmill's sails, where they are drawn at the lap clock. */
    if (sails) {
      const sail = sails.gapAt(p.x, p.y, p.z, reach, simTimeMs);
      if (sail < gap) {
        gap = sail;
      }
    }
    const floor = p.y - view.height(p.x, p.z, p.y - SURFACE_BIAS, p.y);
    if (floor < gap) {
      gap = floor;
    }
    const near = gap * CAMERA_NEAR_FRACTION;
    return near < least ? least : (near > open ? open : near);
  }

  function setCameraNear(near) {
    if (shell.camera.near !== near) {
      shell.camera.near = near;
      shell.camera.updateProjectionMatrix();
    }
  }

  /* The height the plant is resting the craft on, world y: a box top when
   * the plant has taken one as ground, otherwise the shell's own surface. */
  function supportY(surf) {
    const i = sim.e.sim_world_support();
    if (i >= 0 && view.colliders && i < view.colliders.count) {
      return view.colliders.fby[i];
    }
    return surf;
  }

  /* Read and clear the module's contact report. See passStats. */
  function readWorldReport() {
    if (!worldReportPtr) {
      worldReportPtr = sim.e.malloc(11 * 8);
    }
    sim.e.sim_world_report(worldReportPtr);
    /* One view, rebuilt only when the module's memory grows and the buffer changes identity: this runs every step. */
    const buf = sim.e.memory.buffer;
    if (worldReportView === null || worldReportViewBuf !== buf) {
      worldReportView = new Float64Array(buf, worldReportPtr, 11);
      worldReportViewBuf = buf;
    }
    worldReport.set(worldReportView);
    return worldReport;
  }

  /* One step's report, read after the step so it holds that step alone,
   * and folded into the frame's. See worldReport. */
  function readStepReport() {
    const r = readWorldReport();
    foldWorldReport(frameReport, r);
    return r;
  }

  /* The race: gate order, lap clock, best lap. On a freestyle map it is a
   * real object with no gates in it and it scores nothing. */
  let race = new Race(view.gates, view.trackClass ?? 'full');
  /*
   * THE YARD TRACK, a RaceGOW track standing in a house map's yard
   * (src/maps/yardtrack/, src/game/yardrace.js), timed beside the run and
   * never instead of it: the map stays a freestyle map, the run's clock and
   * score go on, and this race only scores while the craft is near its
   * track. Null on a map without one. `yardAsked` is whether Bardwell's
   * swap card has had its answer for this landing.
   */
  let yard = view.yardTrack ? new YardRace(view.yardTrack) : null;
  let yardAsked = false;
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
   * 'free' is neither, and 'off' names no tricks. See
   * DEFAULTS.freestyleScoring in src/ui/ui.js for why off is the default.
   *
   * THE COUNTER (FREESTYLE-MAPS-PLAN.md section 7, Stage C) is what the
   * switch now decides a part of. Decision 2 (2026-09-24): the geometry,
   * named gaps, close calls, the chase and the STF mark, counts on every
   * freestyle map whatever the switch says, because it cannot misname
   * anything; trick names stay behind the switch until naming is settled.
   * So `score` is src/game/score.js's Counter, the counter and its trick
   * only board twin: scoringWanted() says whether tricks count in the
   * counter, and the board twin, whose total is what a scored run posts,
   * hears every trick as the one scorer always did.
   *
   * OFF STILL KEEPS THE TRICK ENGINE RUNNING. The recogniser runs and the
   * board twin keeps its total: what off removes is trick names from the
   * counter and the clock. Keeping the engine running is the cheaper change
   * by far, it keeps one code path in the air instead of two, and it means
   * the thing being developed goes on being exercised on real flights.
   * Only 'scored' puts a clock on the run, so 'off' and 'free' alike leave
   * score.timed false and the run never ends.
   */
  /* Steam edition: career. The career, once boot has made it (careerShell
   * near the end). Declared here so the hooks above it can ask it. A
   * lesson's run is never a timed freestyle run, because the clock ending a
   * lesson would be the game deciding for the lesson, and tricks always
   * count in it, because the freestyle chapter scores them. */
  let career = null;
  /* What a lesson holds while it flies: 'angle' or 'acro' (wantAngleMode),
   * and 'chase' or 'fpv' for the camera (the frame loop). Null is the
   * pilot's own. */
  let careerFlightMode = null;
  let careerCamera = null;
  /* The gate this frame passed and the lap it finished, read off the race
   * by the frame loop for careerFrame. */
  let careerGateNow = null;
  let careerLapNow = null;
  const scoredRun = () => ui.settings.freestyleScoring === 'scored' && !(career && career.owns());
  const scoringWanted = () => ui.settings.freestyleScoring !== 'off' || Boolean(career && career.owns());
  const score = new Counter({ timed: scoredRun(), tricks: scoringWanted() });
  /*
   * THE COUNTER'S GEOMETRY. The named gaps (src/game/gaps.js) are fed every
   * physics step with the craft's CG in the world; the close calls
   * (src/game/closecall.js) every CC_EVERY steps of the lap clock with its
   * position, velocity and the ground under it, and whether a step since the
   * last feed was a hard contact (counterHard, the STOP measure) or the
   * shell called a crash (counterCrashed). Both read the map's own
   * colliders and gaps, set with the obstacles when a map is built, and
   * only on a freestyle map: a race track sets neither and feeds neither.
   * What either settles goes into the counter at once, in step order, so
   * which combo a thing lands in is decided by the step stream and not by
   * where a frame ended. See counterStep.
   */
  const namedGapRun = new NamedGapCounter();
  const closeCalls = new CloseCalls(null);
  let counterHard = false;
  let counterCrashed = false;
  /*
   * The things in the world worth flying around, derived from the map's own
   * colliders once when the map is built. Null on a map with none, and the
   * detector is then exactly the open-air recogniser it was before.
   */
  let obstacles = null;
  const trickDetector = new TrickDetector((trick) => {
    /* Steam edition: career. Every trick the recogniser names, kept by the
     * score or not: the lesson judges it on its own terms. */
    if (career) {
      career.trick(trick);
    }
    /* Only a trick the run kept, so one landing after the clock stopped
     * does not mark a run mixed that was flown at one weight. */
    if (score.land(trick)) {
      noteTrickWeight();
    }
  });
  function noteTrickWeight() {
    if (trickWeight == null) {
      trickWeight = runWeight;
    } else if (trickWeight !== runWeight) {
      trickWeightMixed = true;
    }
    /* One trick landed on a quad that grips the air or pulls differently and
     * the run is not the machine the board compares, whatever the rest of it
     * was flown on. */
    if (offStock()) {
      trickTuned = true;
    }
  }
  /*
   * Rebuild the obstacle list for the map now loaded. Freestyle only: a
   * race map has a course, and nothing on a course is a powerloop object.
   * The ground query is the map's own, so a wall that reaches sixty metres
   * underground is measured from the street rather than from its buried
   * bottom edge.
   */
  function rebuildObstacles() {
    /* The counter's world first: a freestyle map's gaps and solids, or
     * nothing on a race track. */
    const free = Boolean(view && view.mode === 'freestyle');
    namedGapRun.setGaps(free && Array.isArray(view.gaps) ? view.gaps : []);
    closeCalls.setColliders(free ? view.colliders : null);
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
      ? {
        gapAt: (x, y, z, r) => view.colliders.gapAt(x, y, z, r),
        /* The nearest solid's own direction, and the point on its centre
         * line nearest the query. A rail, a coping, a parapet and a roof
         * edge all have one, which is what lets a figure flown over any of
         * them be the same measurement. See TrickDetector.closeTrack. */
        axisAt: (x, y, z, r) => (view.colliders.axisAt(x, y, z, r)
          ? {
            gap: view.colliders.axisGap,
            dx: view.colliders.axisDx,
            dy: view.colliders.axisDy,
            dz: view.colliders.axisDz,
            cx: view.colliders.axisCx,
            cy: view.colliders.axisCy,
            cz: view.colliders.axisCz,
          }
          : null),
      }
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
  /*
   * Session lived, like the craft. It is parented into whichever scene
   * holds the hero craft, below, and nothing used to take it out again, so
   * every map swap ran disposeSceneGraph over its geometry, its body and
   * disc materials, its sprite material and its name tag CanvasTexture,
   * which is not in SESSION_TEXTURES. Re-parenting it on the next frame
   * does not undo a free. Saying so here means each map's dispose hands it
   * back without having to know it exists.
   */
  shell.keepAcrossMaps(ghostRig.group);
  /*
   * The front props at the edge of the FPV picture and the craft's shadow
   * on the ground, each behind its own row in Settings. Session lived like
   * the ghost rig, parented into whichever scene holds the craft. Placed
   * after the predicted view has moved the camera, immediately before the
   * draw, so the props stay bolted to the picture the pilot is shown.
   */
  const propView = buildPropView();
  shell.keepAcrossMaps(propView.group);
  const propViewOpts = {
    camera: shell.camera,
    craft: null,
    discs: null,
    props: false,
    shadow: false,
    tilt: 0,
    /* The glass, not the mount's pivot: the props are centimetres away,
     * so the 24 mm between the two decides how much of them shows. World
     * metres, so set at each placing (placePropView): a number taken here
     * at boot kept the boot's world scale after the quad picker moved it. */
    fwd: 0,
    up: 0,
    height: (x, z, fromY) => view.height(x, z, fromY),
  };
  /*
   * Into the world's scene as soon as the world is built, with its two
   * programs linked then, under the loading screen, and not on the first
   * FPV frame. They are the craft's own blur disc program, which a five
   * inch's world has linked already; a whoop's disc has no vertex alpha,
   * so on a whoop map nothing else would have. The two meshes are shown
   * for the synchronous part of the warm only. See src/render/warm.js for
   * why the target is the pipeline's.
   */
  function attachPropView() {
    if (!view || !view.scene) {
      return;
    }
    view.scene.add(propView.group);
    const p = view.post;
    const target = p ? (p.rtScene || (p.composer && p.composer.renderTarget1) || null) : null;
    propView.props.visible = true;
    propView.shadow.visible = true;
    warmPrograms(shell.renderer, view.scene, shell.camera, target);
    propView.props.visible = false;
    propView.shadow.visible = false;
  }
  attachPropView();
  function placePropView() {
    const s = ui.settings;
    const o = propViewOpts;
    o.props = fpvLens && (s.inView === 'both' || s.inView === 'props');
    o.shadow = fpvLens && (s.inView === 'both' || s.inView === 'shadow');
    if (!o.props && !o.shadow) {
      propView.props.visible = false;
      propView.shadow.visible = false;
      return;
    }
    if (shell.quad.parent && propView.group.parent !== shell.quad.parent) {
      shell.quad.parent.add(propView.group);
    }
    o.craft = shell.quad;
    o.discs = shell.discs;
    o.tilt = cameraTiltRad(camTilt);
    o.fwd = simLenToWorld(CAMERA_LENS_FORWARD);
    o.up = simLenToWorld(CAMERA_LENS_UP);
    propView.update(o);
  }
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
      /* Hide label in replay clean mode */
      const label = (replayClean && replayMode) ? '' : ghostLabelFor(ghostLap);
      ghostRig.setLabel(label);
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
      { id: 'best', label: 'Your best lap' },
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
      if (!ghostBoardLap) {
        return 'That lap could not be fetched from the board.';
      }
      /* A lap flown off 100 was flown on a lighter or heavier quad, and the
       * board says so beside the name; so does this, where there is room. */
      const picked = (ghostBoardTimes || []).find((t) => `board:${t.id}` === ghostChoice);
      const light = picked && picked.weight !== WEIGHT_STOCK
        ? ` It was flown at Weight ${picked.weight}%.`
        : '';
      return `A recorded lap from the public board flies beside you as a translucent pacer.${light}`;
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

  /* A replay that cannot start hands the page back to a pilot: flying works,
   * and a clean replay's UI and cursor come back with it. Nothing else in
   * the shell writes either inline style, so clearing them is always safe. */
  function failReplay(text) {
    replayState = 'failed';
    replayMode = false;
    uiRoot.style.display = '';
    canvas.style.cursor = '';
    notice = { text, untilMs: performance.now() + 10000 };
  }

  function loadBoardGhost(timeId) {
    const listing = ghostListing();
    if (!listing) {
      if (replayMode) {
        failReplay('Replay failed: no track listing found.');
      }
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
        /* Start replay mode if active. The glow is ghostFrame's job. */
        if (replayMode && ghostLap) {
          replayClock = { startMs: simTimeMs, vt: 0 };
          replayState = 'ready';
          mode = 'flight';
          ui.show('flight');
          introMs = -1; /* Skip intro */
        } else if (replayMode) {
          /* resolveGhost gives a freestyle course no ghost at all. */
          failReplay('Replay failed: this track has no lap for a ghost to fly.');
        }
      } catch (e) {
        if (ghostCourseKey() !== key) {
          return;
        }
        ghostBoardLap = null;
        const msg = `Could not fetch that ghost.\n${e.message ?? e}`;
        if (replayMode) {
          failReplay(msg);
        } else {
          notice = { text: msg, untilMs: performance.now() + 3600 };
        }
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
    /* Replay mode: load the specified ghost and start replay. */
    if (replayMode && replayTimeId) {
      ghostChoice = `board:${replayTimeId}`;
      syncGhostRow();
      loadBoardGhost(replayTimeId);
      return;
    }
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
    /* Replay mode: driven by replay clock, not race */
    if (replayMode && ghostLap && replayClock) {
      let t;
      if (replayStepMode) {
        /* Step mode: use virtual time */
        t = replayClock.vt;
      } else {
        /* Real-time mode: advance clock using sim time */
        replayClock.vt = simNow - replayClock.startMs;
        t = replayClock.vt;
        /* Loop at end */
        if (t > ghostLap.durationMs) {
          replayClock.startMs = simNow;
          replayClock.vt = 0;
          t = 0;
        }
      }
      /* No fade - always full presence as per spec */
      const presence = ghostSampleInto(t) ? 0.15 : 1;
      replayPresence = presence;
      ghostRig.group.position.set(ghostSample.px, ghostSample.py, ghostSample.pz);
      ghostRig.group.quaternion.set(ghostSample.qx, ghostSample.qy, ghostSample.qz, ghostSample.qw);
      ghostRig.setPresence(presence);
      if (presence > 0 && shell.quad.parent && ghostRig.group.parent !== shell.quad.parent) {
        shell.quad.parent.add(ghostRig.group);
      }
      /* A clean capture carries no guidance. This runs before every draw, so
       * anything that lights a target again (reset() on R, a new look) is
       * put out before a frame can show it. */
      if (replayClean && view.targetAim && view.targetAim().active) {
        view.setNextGate(-1, -1);
      }
      return;
    }
    /* Normal chase mode */
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

  /*
   * FLYING TOGETHER, the multiplayer plan the owner approved on 25 October
   * 2026, on for everybody since the owner's word of 27 October ("ok lets make
   * it live for everyone now", "swithc it on"). ROOMS_LAUNCHED
   * is the one switch; on, the links a room writes stop carrying ?mp=1, which
   * `node scripts/together-shots.js --launched=1` checks.
   *
   * NOTHING HAPPENS UNTIL THE PILOT ASKS: Fly together on a map in the
   * picker, the Rooms tab beside the shelves, or a room's link, which only
   * ever shows "Join this room?" first (src/net/together.js). Until then
   * none of src/net/ or src/render/roomcraft.js is even fetched, so a solo
   * flight costs nothing at all: no bytes, no draw calls, no frame time.
   *
   * Everything here is downstream of the render: it reads the same
   * interpolated pose the hero craft is drawn at, never the plant, and
   * nothing it hears is ever written back to the physics. What a room may
   * ask of the flight is what a menu press may: pause, resume, fly, and in
   * a room's race the start line, through reset(), the R key's own path.
   */
  const ROOMS_LAUNCHED = true;
  const mpOn = ROOMS_LAUNCHED || (() => {
    try {
      return new URLSearchParams(window.location.search).get('mp') === '1';
    } catch (e) {
      return false;
    }
  })();
  let together = null;
  let togetherLoading = null;
  let mpCraft = null;
  let mpCraftWhoop = null;
  let mpCraftSize = 0;
  let mpCraftLoading = false;
  let mpResets = 0;
  let mpAway = null;
  let mpWorldWarned = '';
  /* The world, worked out once per loaded world rather than once a frame:
   * the frame loop does not allocate (budget P8). */
  let mpWorldOf = null;
  let mpWorldIs = null;
  /* This pilot's position for the frame, for the proximity hello. */
  let mpHx = 0;
  let mpHy = 0;
  let mpHz = 0;
  let mpHostId = 0;
  /*
   * WATCHING ANOTHER PILOT (src/render/watchcam.js, src/net/together.js).
   * This pilot's own flight is paused as the pause menu pauses it, with the
   * menu hidden, and the camera rides behind the pilot watchId. Their pose
   * is caught here as they are drawn, so the camera follows the same
   * interpolated pose their craft is drawn at, in the same frame.
   */
  let watchCam = null;
  let watchCamLoading = null;
  let watchId = 0;
  let watchSeen = false;
  const watchPose = {
    px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1, cut: false,
  };
  /*
   * THE OVERVIEW (src/render/overviewcam.js, src/net/fieldwatch.js,
   * src/render/trails.js; the owner's ask of 28 October 2026). The flight
   * is paused under it as it is under the follow camera, and the camera is
   * carried out to a free rig the pilot flies round the field. ovField
   * keeps every other pilot's trail from the moment this page is in a
   * room, the owner's pick, so the trails are there when the overview
   * opens; it is fed the pose each quad is drawn at, one distance check a
   * pilot a frame. The camera, the trails' mesh and their files are not
   * fetched until the overview first opens.
   */
  let ovOn = false;
  let ovCam = null;
  let ovTrails = null;
  let ovLoading = null;
  let ovField = null;
  let ovFieldKey = '';
  let ovFieldGates = null;
  let ovPick = 0;
  let ovKeep = false;
  let ovTrail = 2;
  let ovLastMs = 0;
  let ovThrottle0 = null;
  let ovPlaces = null;
  let mpLivery = null;
  let ovNow = 0;
  const ovRig = { pos: null, quat: null, fov: 55 };
  const ovCtl = { x: 0, z: 0, y: 0, turn: 0, tilt: 0, fast: false };
  const ovKeepAt = { x: 0, y: 0, z: 0 };
  let ovKeepSeen = false;
  const mpDraw = (id, pose, pilot) => {
    /* A ribbon cutting room's game draws every pilot's ribbon from here. */
    if (fightGame && fightGame.room) {
      fightGame.remote(id, pose, pilot);
    }
    const dx = pose.px - mpHx;
    const dy = pose.py - mpHy;
    const dz = pose.pz - mpHz;
    const d2 = dx * dx + dy * dy + dz * dz;
    /* The host's tag stays up however far: in a streamer room, the one the
     * viewers came to find. So does the tag of the pilot being watched. */
    mpCraft.add(id, pose, pilot, d2, ovOn || id === mpHostId || id === watchId,
      ovOn && ovPlaces ? (ovPlaces.get(id) || 0) : 0, ovOn && id === ovPick, ovOn && ovKeep && ovPick && id !== ovPick);
    if (ovField) {
      ovField.note(id, pose.px, pose.py, pose.pz, pose.cut, ovNow);
    }
    if (id === ovPick && !pose.cut) {
      ovKeepAt.x = pose.px;
      ovKeepAt.y = pose.py;
      ovKeepAt.z = pose.pz;
      ovKeepSeen = true;
    }
    if (id === watchId) {
      watchSeen = true;
      watchPose.px = pose.px;
      watchPose.py = pose.py;
      watchPose.pz = pose.pz;
      watchPose.qx = pose.qx;
      watchPose.qy = pose.qy;
      watchPose.qz = pose.qz;
      watchPose.qw = pose.qw;
      watchPose.cut = Boolean(pose.cut);
    }
    /* No hello while watching: the pilot's own quad is parked, and the
     * camera passing a pilot is not meeting them. */
    if (d2 < 9 && !watchId && !ovOn) {
      together.near(id, d2);
    }
  };

  /* The world being flown, as the room names it and as a link opens it. */
  function mpWorld() {
    if (!view) {
      return null;
    }
    if (view.id === 'custom') {
      const listing = ghostListing();
      return listing
        ? { map: listing.shareId, name: listing.name || 'A track', link: { map: 'custom', share: listing.shareId } }
        : { map: 'custom', name: 'A track of your own', link: { map: 'custom' } };
    }
    if (view.id === 'built') {
      return view.shared
        ? { map: view.shared.id, name: view.shared.name || 'A map', link: { map: 'built', mapshare: view.shared.id } }
        : { map: 'built', name: 'Your map', link: { map: 'built' } };
    }
    return { map: view.id, name: mapById(view.id).name, link: { map: view.id } };
  }

  function mpWorldNow() {
    if (mpWorldOf !== view) {
      mpWorldOf = view;
      mpWorldIs = mpWorld();
    }
    return mpWorldIs;
  }

  function mpSay(text, ms = 3600) {
    notice = { text, untilMs: performance.now() + ms };
  }

  /* What together.js may ask of the game, and nothing else. */
  const togetherShell = {
    mp: !ROOMS_LAUNCHED,
    world: () => mpWorldNow(),
    ready: () => mapReady && !swapInFlight && Boolean(view),
    flying: () => mode === 'flight' && ui.screen === 'flight',
    paused: () => ui.screen === 'paused',
    results: () => ui.screen === 'results',
    /* The flight's own line across the heading while it shows words, so a
     * room banner can sit under it rather than on it. */
    line: () => (ui.banner && ui.banner.__wfOpacity === '1' ? ui.banner : null),
    pause: () => {
      if (mode === 'flight' && ui.screen === 'flight') {
        ui.act('pause');
        ui.show('paused');
      }
    },
    resume: () => {
      if (ui.screen === 'paused') {
        ui.act('resume');
      }
    },
    /* Into the air from wherever the pilot is: the title and the picker
     * take Fly's own path, the pause menu resumes. */
    fly: () => {
      if (ui.screen === 'paused') {
        ui.act('resume');
      } else if (!(mode === 'flight' && ui.screen === 'flight')) {
        wakeAudio();
        flyToGrid();
      }
    },
    /* The start line for a room's race, with a fresh run: R's own reset,
     * in the air if the pilot was not. */
    grid: () => {
      if (mode === 'flight' && ui.screen === 'flight') {
        reset();
      } else if (ui.screen === 'paused') {
        ui.act('restart');
      } else {
        wakeAudio();
        flyToGrid();
      }
    },
    airborne: () => mode === 'flight' && !landed && !launchStaging,
    whoop: () => ui.settings.airframe === 'whoop65',
    /*
     * The room's quad changed under the pilot: the host swapped quads, and
     * a room is one aircraft for everybody in it (swapQuad in
     * src/net/together.js, the owner's ask of 2026-10-28). It is the swap
     * the Quad screen makes between runs, under the title's mode for the
     * one call as Bardwell's yard does above, and then a fresh run from the
     * map's spawn: the plant is another aircraft, at another world scale in
     * a house, so where the old one was is not a state the new one can
     * carry on from. A pilot in flight stays in flight, and one on a menu
     * stays on it. False when there was nothing to swap.
     */
    swapQuad: (id) => {
      if (replayMode || airframeById(id).id !== id || ui.settings.airframe === id) {
        return false;
      }
      ui.seatRoomQuad(id);
      const was = mode;
      mode = 'title';
      applySettings(ui.settings);
      mode = was;
      if (was === 'flight' || was === 'paused') {
        /*
         * AT ONCE AS WELL AS WHEN THE TUNE HAS LANDED. The world scale and
         * the solids moved in applySettings, and the craft is still where
         * the old aircraft was, in the old aircraft's metres: until the
         * reset below, every frame drew it at a point the new scale puts
         * somewhere else and stepped it against solids that had grown or
         * shrunk round it, which is a jump and can be a crash. When the
         * aircraft's tune has to be fetched, that is as long as the fetch
         * takes. So the run starts over here, at the spawn, and again when
         * the tune is in, which is the reset that counts; swapTune resets
         * after its own sim.init, so the first one is never flown on.
         */
        reset();
        introMs = -1;
        whenConfigReady(() => {
          reset();
          introMs = -1;
          if (ui.screen !== 'flight') {
            ui.renderMenu();
          }
        });
      } else if (ui.screen !== 'flight') {
        ui.renderMenu();
      }
      return true;
    },
    /* What the pilot flies with, so a room's lines name a control they
     * have: G means nothing on a radio or a phone. */
    hands: () => {
      if (input.source.startsWith('a radio')) return 'pad';
      return input.source === 'the touch sticks' ? 'touch' : 'keys';
    },
    roomInfo: (info) => ui.setRoomInfo(info),
    pickWorld: (way, opts) => ui.pickRoomWorld(way, opts),
    pickDone: () => ui.endMovePick(),
    /* The look editor closed: the front screen's pilot panel shows it. */
    pilotChanged: () => ui.paintGatePilot(),
    forget: (id) => {
      if (mpCraft) {
        mpCraft.forget(id);
      }
      if (ovField) {
        ovField.forget(id);
      }
    },
    sound: (kind) => ui.onUiSound(kind),
    /* Watching another pilot: the flight paused with its menu hidden and
     * the camera flown over to ride behind them. Asked again with another
     * pilot, it flies across to them. False when there is no flight to
     * pause. `same` is the same quad under another number, as a room
     * rebuilt after a deploy gives out: the camera stays where it is and
     * follows the new number, -1 for a pilot not back yet. */
    watch: (id, same = false) => watchStart(id, same),
    /* Back to the goggles: the camera flies home and the flight resumes
     * when it lands. `now` puts it back at once and leaves the flight
     * paused, for something that takes over, such as the room's grid. */
    unwatch: (now = false) => watchStop(now),
    /* Who is being watched, 0 for nobody, which it is again from the
     * moment the camera starts home. */
    watching: () => watchId,
    /* Whether the camera is still away from the goggles: watching, or on
     * its way home, when the hidden pause menu must not get a key. */
    watchBusy: () => Boolean(watchCam && watchCam.on),
    /* The overview: the flight paused as for watching, the camera flown
     * out to a free rig over the whole field. From watching, it flies
     * across from behind the quad. watch(id) from the overview flies down
     * behind that pilot, and unwatch() brings either home. */
    overview: () => overviewStart(),
    overviewing: () => ovOn,
    /* The field's record of every pilot, for the race board. */
    field: () => ovField,
    /* What the overview's panels ask of it. */
    overviewDo: (what, arg) => overviewDo(what, arg),
    overviewState: () => ({
      pick: ovPick, keep: ovKeep, trail: ovTrail, flying: Boolean(watchCam && watchCam.on && ovOn),
    }),
    /* The pilot's height over whatever is under them, for the pilot card,
     * in real metres as the OSD prints its own (hudLifeScale). */
    heightAt: (x, y, z) => (view ? (y - view.height(x, z, y, y)) / hudLifeScale() : 0),
    /* Places on the course, by id, for the name tags while watching. */
    overviewPlaces: (places) => {
      ovPlaces = places;
    },
  };

  /* together.js, fetched the first time it is wanted and never before. */
  function loadTogether() {
    if (together) {
      return Promise.resolve(together);
    }
    if (!togetherLoading) {
      togetherLoading = import('./net/together.js').then(({ createTogether }) => {
        together = createTogether(togetherShell);
        return together;
      }).catch((e) => {
        togetherLoading = null;
        mpSay(`Could not open rooms.\n${e.message ?? e}`, 6000);
        return null;
      });
    }
    return togetherLoading;
  }

  if (mpOn) {
    ui.roomsOn = true;
    ui.onFlyTogether = (entry) => {
      loadTogether().then((t) => t && t.openHost(entry));
    };
    ui.onRooms = (way) => {
      loadTogether().then((t) => t && t.openLobby(way));
    };
    /* The front screen's multiplayer page: host, find, code, pilot. */
    ui.onRoomsGate = (kind) => {
      loadTogether().then((t) => t && t.fromGate(kind));
    };
    ui.onRoom = (action) => {
      if (together) {
        together.act(action);
      }
    };
    /* A room's address: the room is asked about once the world is up. */
    if (new URLSearchParams(window.location.search).get('room')) {
      loadTogether().then((t) => t && t.startFromAddress());
    }
    /* The gate opens on its cover now rooms are on: draw it again if it
     * was drawn before this line ran. */
    if (ui.screen === 'title') {
      ui.renderMenu();
    }
  }

  /* The craft the others are drawn as, sized for the room's aircraft and
   * for as many pilots as it holds. */
  async function mpEnsureCraft(whoop, size) {
    if ((mpCraft && mpCraftWhoop === whoop && mpCraftSize === size) || mpCraftLoading) {
      return;
    }
    mpCraftLoading = true;
    try {
      const [{ buildRoomCraft, liveryColour }, { FieldWatch }] = await Promise.all([
        import('./render/roomcraft.js'), import('./net/fieldwatch.js'),
      ]);
      mpLivery = liveryColour;
      if (!ovField) {
        ovField = new FieldWatch();
      }
      if (mpCraft) {
        mpCraft.group.removeFromParent();
        mpCraft.dispose();
      }
      mpCraft = buildRoomCraft({ whoop, capacity: size });
      mpCraftWhoop = whoop;
      mpCraftSize = size;
      shell.keepAcrossMaps(mpCraft.group);
    } finally {
      mpCraftLoading = false;
    }
  }

  /*
   * Once a frame, after the hero craft is posed: send this pilot's pose and
   * draw everyone else's. Away is anything but flight in the room's world,
   * which dims this pilot's tag for the others and sends no poses.
   */
  function mpFrame(nowWall) {
    if (!together) {
      return;
    }
    together.frame(nowWall);
    const session = together.session;
    if (!session) {
      mpAway = null;
      if (mpCraft && mpCraft.group.visible) {
        mpCraft.begin();
        mpCraft.end();
      }
      return;
    }
    const room = session.room;
    const whoop = room.scale >= 100;
    /* Built for 30 pilots, or for a streamer room's 64 (ROOM_MAX and
     * STREAM_MAX in src/net/link.js, which is not loaded until a room is
     * wanted), so a host changing the size never rebuilds it. Which room
     * it is, not its size: a streamer room set to 20 and raised to 40
     * rebuilt every craft in it when this read the size. */
    const size = room.streamer ? 64 : 30;
    if (!mpCraft || mpCraftWhoop !== whoop || mpCraftSize !== size) {
      mpEnsureCraft(whoop, size);
      return;
    }
    const world = mpWorldNow();
    const same = Boolean(world && world.map === room.map);
    if (world && !same && mpWorldWarned !== world.map) {
      mpWorldWarned = world.map;
      mpSay(`Your room flies ${room.mapName}.\nThe others show only there.`, 6000);
    }
    const flying = same && mode === 'flight' && ui.screen === 'flight';
    if (session.inRoom && !flying !== mpAway) {
      /* Said once a change, and not said at all for a pilot who arrives
       * flying, which is what the board assumes. */
      if (mpAway !== null || !flying) {
        session.away(!flying);
      }
      mpAway = !flying;
    }
    if (ovField) {
      /* Its speeds in real metres, as the OSD's (FieldWatch.life). */
      ovField.setLife(hudLifeScale());
      /* The trails are this room's on this world: another of either
       * starts them again. */
      const fieldKey = `${room.code}|${room.map}|${same ? 1 : 0}`;
      if (fieldKey !== ovFieldKey) {
        ovFieldKey = fieldKey;
        ovField.clear();
      }
      const courseGates = same && race && !race.freestyle && race.gates.length ? race.gates : null;
      if (courseGates !== ovFieldGates) {
        ovFieldGates = courseGates;
        ovField.setCourse(courseGates);
      }
      const roomRace = together.raceNow ? together.raceNow() : null;
      if (roomRace) {
        ovField.race(roomRace.n, roomRace.go);
      }
    }
    ovNow = nowWall;
    const p = shell.quad.position;
    /* Nearness for the name tags is from the eye, which is the camera
     * while watching and the quad otherwise. */
    const eye = watchId || ovOn ? shell.camera.position : p;
    mpHx = eye.x;
    mpHy = eye.y;
    mpHz = eye.z;
    if (flying) {
      const q = shell.quad.quaternion;
      /* Motor RPM, signed in 3D mode (src/native/sim_abi.h). */
      const spinning = Boolean(stateCurr) && Math.abs(stateCurr[14]) + Math.abs(stateCurr[15])
        + Math.abs(stateCurr[16]) + Math.abs(stateCurr[17]) > 400;
      session.uplink(p.x, p.y, p.z, q.x, q.y, q.z, q.w, spinning, mpResets);
    }
    mpCraft.begin();
    watchSeen = false;
    if (same) {
      mpHostId = session.link.hostId;
      session.eachRemote(mpDraw);
    }
    mpCraft.end();
    if (mpCraft.group.visible && shell.quad.parent && mpCraft.group.parent !== shell.quad.parent) {
      shell.quad.parent.add(mpCraft.group);
    }
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
    /*
     * The AIRFRAME is in the key, and it has to be: a whoop lap and a five
     * inch lap on the same track are not the same record, they are not
     * within a factor of three of each other, and the config hash above
     * cannot tell them apart because the tune is a different FILE, not a
     * different plant. The five inch's suffix is EMPTY so every record ever
     * set stays exactly where it is, which is the same trick the flight
     * style uses one line up and for the same reason.
     */
    const craft = runAirframe === '5inch' ? '' : `.${runAirframe}`;
    /*
     * AND THE WEIGHT, on exactly the rule above it, keyed on the multiple of
     * g the plant is holding rather than on the slider, so the key names the
     * machine and not the menu. A lap at a different weight is a lap on a
     * quad that hovers, climbs and drops differently, and filing it beside
     * another would make the record meaningless.
     *
     * THE EMPTY SUFFIX IS THE 1.0 MACHINE AND STAYS THAT WAY. Every record
     * set before the slider existed was flown at exactly 1.0, and the shell's
     * normal is now 1.62, so the normal carries `.g162` and those old records
     * stay under the bare key, untouched and unreachable, because nothing on
     * the new band lands on 1.000 exactly: the floaty end is 0.972. That is
     * the append-only rule applied to a pilot's own bests. The `.grav` and
     * `.air` suffixes that came before were each live for under two hours on
     * a slider with a different meaning and are orphaned the same way.
     */
    const gravPart = runGravityScale === 1 ? '' : `.g${Math.round(runGravityScale * 100)}`;
    /*
     * AND THE TWO FLIGHT FEEL SCALES, on the same rule and for the same
     * reason: a lap on a quad that grips the air or pulls differently is a
     * lap on another machine, and a personal best filed beside the stock
     * one would mean nothing. Only when off 1.0, so every key that was ever
     * written stays exactly where it is: `.a85` is Air grip 85, `.k110` is
     * Motor power 110. Keyed on the multiple the module holds, like the
     * weight, so the key names the machine and not the menu.
     *
     * EXCEPT THAT THE BARE KEY FOLLOWS THE AIRCRAFT'S DEFAULT. On 2026-10-21
     * the defaults moved off 100 (TUNE_DEFAULTS in src/share/tune.js: the
     * five inch's Air grip to 110, the whoop's Motor power to 90). Keyed on
     * the multiple, every pilot's best would have moved to `.a110` overnight
     * and looked lost. The default is the quad as it ships, the public board
     * files its laps untagged beside the old ones, and a pilot's own best does
     * the same: the suffix is for a machine the PILOT moved off the default.
     */
    const dflt = tuneDefaultsFor(runAirframe);
    const airPart = runAirGrip === dflt.airGrip ? '' : `.a${Math.round(runAirScale * 100)}`;
    const kvPart = runMotorKv === dflt.motorKv ? '' : `.k${Math.round(runKvScale * 100)}`;
    /* And prop wash, on the same rule: only when off, so every key that was
     * ever written stays where it is. */
    const washPart = runWash ? '' : '.nowash';
    /* And 3D, on the same rule: only when on. */
    const part3d = run3d ? '.3d' : '';
    return `webfpv.best.${h.toString(16)}.${runVoltage.toFixed(2)}${style}${craft}${gravPart}${airPart}${kvPart}${washPart}${part3d}`;
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
   * THE STICK THROUGH A STALL, the owner's report of 2026-10-21: "random
   * occasional knocking or jumpy movements when under throttle", on Heads'
   * house and other maps, with prop wash off.
   *
   * The sticks are polled on a 2 ms timer, but the timer runs on the main
   * thread, and nothing polls while a frame is being built, a garbage
   * collection runs or a shader compiles. A stick that moved smoothly
   * through such a stretch was found by the next poll all at once, and the
   * resampler below held the old value up to that sample and then stepped,
   * so Betaflight was handed one RC frame carrying the whole stretch's
   * movement. Feedforward is the stick's rate of change and throttle boost
   * is the throttle's, so that one frame was a kick a real radio never
   * sends. Measured in the page on the field, a 60 ms stall in the middle
   * of a smooth 300 ms roll and throttle move: a single frame step of 0.25
   * roll and 0.12 throttle where the move's own steepest frame is 0.03 and
   * 0.016, and the roll acceleration's peak doubled. The houses cost more
   * to draw than the field, so their frames hold the timer longer and more
   * often, which is why they were where it was felt.
   *
   * So every sample says when the poll before it ran (`prevWall`, see
   * poll() in src/input/input.js), and a slot that falls in a stretch
   * longer than STALL_GAP_MS gets the straight line across it instead of
   * the held value. It adds no latency: the sample a slot is drawn from has
   * always already arrived, the value the stretch ends on lands on the same
   * slot as before, and the slots before it carry part of the move sooner.
   * A gap at the timer's own cadence (4 ms is what a browser clamps a 2 ms
   * interval to) is not a stall and is held exactly as before.
   */
  const STALL_GAP_MS = 6;
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

  /*
   * PUT THE CRAFT BACK WHERE IT WAS AFTER A CONFIG SWAP, instead of putting
   * the run back on the start line.
   *
   * WHY THIS EXISTS. Rates are part of the config text, so changing one has
   * to go through sim_init, and sim_init is a full reset: "dynamic state
   * zeroed as in sim_reset", per src/native/sim_abi.h. Every rate change
   * therefore used to end in reset(), which zeroes the LAP clock and drops
   * the quad on the start line. That is right for a tune, which changes the
   * machine, and wrong for rates, which change the pilot: the owner asked
   * for a rate change mid run to leave the run alone, and a pilot tuning
   * stick feel against a corner cannot do it if every nudge costs the lap.
   *
   * WHAT IT CAN AND CANNOT CARRY. Position and attitude go back through
   * sim_set_pose, which is the only writer the ABI exposes. VELOCITY,
   * ANGULAR RATE AND MOTOR RPM CANNOT FOLLOW: sim_init zeroes them, no
   * export writes them, and this container has no Emscripten to add one. So
   * the quad resumes stationary where it was rather than carrying its
   * momentum through. That is the honest limit of this change and it is
   * nearly invisible in the path the request describes, where the pilot is
   * on the pause menu and the craft is holding still anyway.
   *
   * WHAT HAS TO BE PUT BACK BY HAND is what sim_init wiped and the shell
   * still believes: the pack, and crashflip. The airframe and the flight
   * style are MODES and survive init by ABI contract; the ground plane is
   * written every frame by the contact loop; angle mode is re-applied by
   * syncAngleMode at the tail of applySettings, which runs after this.
   *
   * The RC grid is re-pinned and the queue dropped for the same reason
   * resetCraft does it: the module's step index went back to zero, and a
   * stick sample stamped on the old clock would land in the integrator's
   * future.
   */
  function reseatAfterConfigSwap(before) {
    sim.setCellVoltage(runVoltage);
    sim.e.sim_set_crashflip(crashflipOn ? 1 : 0);
    const code = sim.e.sim_set_pose(
      before[1], before[2], before[3],
      before[7], before[8], before[9], before[10],
    );
    if (code !== SIM_OK) {
      /* The pose refused, so there is nowhere honest to put the craft back.
       * Fall back to the old behaviour rather than flying from wherever
       * init happened to leave it. */
      reset();
      return;
    }
    acc = 0;
    rcPending.length = 0;
    adoptSimClock();
    stateCurr = readState();
    statePrev = stateCurr;
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
  /*
   * THERE IS NO AUTOMATIC CRASH. There used to be a watch that froze the
   * craft for 800 ms when the contact pass left it wedged, buried or
   * thrashing, then moved it up to four and a half metres. It existed to
   * hide the old pass's failures and it read to a pilot as the quad
   * vanishing. The owner ruled it out on 2026-09-24 when the solid world
   * moved into the plant: a crash is wherever the physics leaves the craft,
   * R restarts and X sets it down nearby.
   */
  let clipGraceUntil = 0;
  /* Wall clock of the last land or takeoff blip. See GROUND_CUE_GAP_MS. */
  let groundCueAtWall = -1e9;
  /* Wall clock the departure window closes at. See TAKEOFF_WINDOW_MS. */
  let takeoffUntil = 0;
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
  /* The frame's solid contact steps, rep[0] of frameReport: kept past the
   * frame's obs* reset for autoResetTick, which asks whether a bounced craft
   * is touching anything. */
  let lastSolidHits = 0;
  let lastClearance = 1;
  let lastUpz = 1;
  let lastFpvY = 0;
  let lastCamFloor = 0;
  /* The predicted view's per frame mark and scratch, and the horizon it
   * last used in flight, for the report: see predictView before the draw.
   * Allocated once, because the frame loop allocates nothing (P8). */
  let predictCam = false;
  let predictApplied = false;
  /* Whether this frame's camera is the pilot's own lens, live or held on
   * the impact frame: the props in view and the craft's shadow are drawn
   * only then (src/render/propview.js). */
  let fpvLens = false;
  let predictLastMs = 0;
  const predDp = new THREE.Vector3();
  const predDq = new THREE.Quaternion();
  const predR = new THREE.Quaternion();
  const predV = new THREE.Vector3();
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
   * THE SOLID WORLD IS THE PLANT'S. src/native/world.c resolves every wall,
   * roof, gate, tree and the train inside the 1 kHz step, with the same
   * solver and on the same clock as the ground, and src/game/plantworld.js
   * hands it the map. What the shell keeps is the READING: sim_world_report
   * says what was touched, how hard, and by what. The crash judge reads it
   * every step; summed over the frame it is what the sound, the shake and
   * the trick recogniser hear.
   *
   * obsTouched is any contact at all, for the recogniser: a Wall Tap needs
   * to know the hull reached the wall, however little the solver had left to
   * do. obsClosing is the approach speed along the face normal, the number
   * GRAZE_SPEED_MAX was written about. obsImpulse is the velocity change the
   * contact caused, which is what the pilot hears and feels.
   */
  let obsContact = false;
  let obsRoof = false;
  let obsImpulse = 0;
  let obsImpulseKind = '';
  let obsTouched = false;
  let obsClosing = 0;
  /* Harness: skip the draw so a probe can fly at frame rate rather than at
   * the town's draw rate. See window.__drawOff. */
  let harnessNoDraw = false;
  /*
   * Its own cooldown, so the recogniser's window is not shared with the
   * audio cue's and one cannot swallow the other.
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
   * The module's report, and a running total of it for window.__contacts, so
   * a probe can tell a wall it touched from a wall it stopped short of.
   * worldReportPtr is a buffer in the module's heap, taken once.
   *
   * READ EVERY STEP. The crash judge needs each step's own report (see
   * CrashJudge), so the step loop reads and clears it after every step and
   * folds it into frameReport, which is what the rest of the frame reads:
   * sim_world_report's own sum, done in the shell (foldWorldReport), the
   * report the module would have given the frame read once, to the bit.
   * scripts/crash-pacing.js holds it to that.
   */
  const worldReport = new Float64Array(11);
  let worldReportPtr = 0;
  let worldReportView = null;
  let worldReportViewBuf = null;
  const frameReport = emptyWorldReport(new Float64Array(11));
  const passStats = {
    steps: 0,
    frame: 0,
    props: 0,
    deepest: 0,
    index: -1,
    kind: '',
    support: -1,
    shapes: 0,
  };
  /* The last impulse announced, so a harder hit inside the cooldown is
   * still heard: a graze followed by the wall behind it is two events. */
  let lastImpulse = 0;
  /* Wall clock until which a recover-in-place is allowed to settle. */
  let recoverGraceUntil = 0;
  /* The last ground skip, so a craft sliding along the grass reports one
   * bounce rather than one a frame, is crashJudge's: see CrashJudge. */
  let bounceHitIndex = -1;
  let bounceHitKind = '';
  /* The craft's tilt-aware vertical half extent, written by the physics
   * branch each frame and read by the obstacle query later in the same
   * frame. Starts level. */
  let vHalfFrame = craftVerticalHalf(0);
  /*
   * Airtime, for the freestyle display with scoring off: the sim time this
   * run has spent in the air. It starts at takeoff and holds while the
   * quad sits landed, perched or set down, the way Betaflight's OSD keeps
   * its fly time apart from its on time; before 2026-09-26 it was the lap
   * clock itself and read 3.72 s on the pads at 0 km/h. Added from the
   * steps the flying branch takes, so it is sim time and never frame time.
   * Display only: the scorer's run clock and the lap clock are simTimeMs
   * and do not read it.
   */
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
  /*
   * THE WEIGHT THE RUN IS FLOWN AT, and it is the one setting here that does
   * NOT wait for the next run.
   *
   * Pack charge, flight style and the airframe all wait, because a pilot
   * changing them is in a menu and the run can start again around them. This
   * slider is on the flight screen, under the pilot's hands, for the express
   * purpose of being felt while the craft is in the air: a knob that took
   * effect next time would answer the question it was built for with a shrug.
   * So it applies at once, and the cost is paid where it belongs, on the lap:
   * a lap the change lands in the middle of is voided, because a lap flown
   * at two weights is not a lap flown at either.
   *
   * TWO NUMBERS, because the module and the menu no longer agree at rest.
   * runWeight is the slider value the run is flown at, 100 by default.
   * runGravityScale is the multiple of 9.80665 the module is actually
   * holding, which starts at 1.0 because that is the module's own default
   * and the machine every harness replay flies; the shell's normal is
   * configs/airframes.js gravityBase, 1.62 on the five inch and 2.025 on
   * the whoop. So at boot the two disagree by
   * construction, applySettings sees it and pushes the base through the ONE
   * path that talks to sim_set_gravity, and the record key is built from the
   * scale the plant is holding rather than from the slider, so it survives
   * the base moving again. Same trick runAirframe below uses for the same
   * reason: boot must not grow a second path of its own.
   *
   * AND IT GOES TO THE BOARD WITH THE LAP. The public board took Weight 100
   * only until the owner asked, on 2026-09-27, to post a time whatever the
   * slider is at, and it keeps the weight on the row and prints it beside
   * the pilot. The race stamps every clean lap with the weight it was flown
   * at (race.setWeight, below), so a run that changed weight between laps
   * still sends the right number: see boardRow in src/game/race.js. A
   * freestyle run has no laps to void, so it notes the weight each trick
   * landed at instead (trickWeight).
   */
  let runWeight = WEIGHT_STOCK;
  let runGravityScale = 1;
  /*
   * FLIGHT FEEL TUNING'S TWO SCALES, held on the Weight's rule and for its
   * reason: the sliders are on the flight screen so a pilot can feel them
   * arrive, so they apply at once (see the block after the Weight in
   * applySettings) and the cost is paid on the lap. Each is the slider value
   * the module is flying and the multiple it was handed, and both start at
   * the module's own defaults, 100 and 1.0, which is what the module holds
   * before the first applySettings. That pushes the aircraft's default
   * (TUNE_DEFAULTS), and nothing is pushed again while they equal what is
   * wanted.
   */
  let runAirGrip = AIR_GRIP_STOCK;
  let runAirScale = 1;
  let runMotorKv = MOTOR_KV_STOCK;
  let runKvScale = 1;
  /*
   * PROP WASH, as the module is flying it: true is the full model, which is
   * what the module starts with and what every record was set on. The owner,
   * 2026-10-16: "turn off prop wash toggle in menu". Off is a quad that no
   * longer shakes in its own wash, which is another machine in the same
   * sense a tuned Air grip is, so a lap flown with it off posts tagged
   * Tuned and is filed under a record of its own. See offStock.
   */
  let runWash = true;
  /*
   * 3D MODE, as the module is flying it. The owner, 2026-10-21: "we need 3d
   * mode built ... that should not impact normal mode ... put it on a toggle
   * on the root level of the settings". Betaflight's own FEATURE_3D, a
   * bidirectional ESC and 3D props: throttle centre is no thrust and the
   * bottom half of the stick drives the motors backwards. The controller
   * latches it at a reset, so it is applied by reset(), which every new run
   * and every Restart goes through. A change made mid run is that reset at
   * once, on the tune's rule: see 3D MODE, MID RUN in applySettings.
   * Another machine in the same sense
   * prop wash off is, so its laps post tagged Tuned and keep a best of
   * their own. false is what the module starts with.
   */
  let run3d = false;
  /* Whether the machine being flown is off stock in any way the board tags
   * as Tuned: the two flight feel scales, prop wash switched off, or 3D. */
  function offStock() {
    return offBoardTune(runAirGrip, runMotorKv, runAirframe) || !runWash || run3d;
  }
  /*
   * How far the stick is asking the craft to climb, for the shell's own
   * takeoff gates. In normal mode that is the throttle. In 3D the middle is
   * nothing and the top half is the climb, so the same gates read the top
   * half's travel and a stick at the bottom, full reverse, is never a
   * takeoff for a craft sitting on its belly.
   */
  function liftThrottle(thr) {
    return run3d ? (thr - 0.5) * 2 : thr;
  }
  /* Set 3D as the settings ask, before the reset that latches it. Guarded
   * because an older dist/sim.wasm predates the export; on such a build the
   * row goes back to Off, which is what that module flies. */
  function apply3d() {
    const want = ui.settings.mode3d === true;
    if (want !== run3d) {
      if (typeof sim.e.sim_set_3d === 'function') {
        sim.e.sim_set_3d(want ? 1 : 0);
        run3d = want;
      } else {
        ui.settings.mode3d = false;
      }
    }
    input.set3d(run3d);
    crashJudge.threeD(run3d);
  }
  /* How many times either export has been called, for the harness: a stock
   * flight must make none (window.__air). */
  let tuneCalls = 0;
  function pushTune(name, scale) {
    if (typeof sim.e[name] !== 'function') {
      return false;
    }
    tuneCalls += 1;
    return sim.e[name](scale) === SIM_OK;
  }
  /*
   * AND WHAT THE QUESTION AT THE END OF A FLIGHT IS ABOUT: the sim time spent
   * in the air on each combination of the three sliders that was off stock,
   * this flight (src/share/tune.js). Fed once a frame from the physics
   * branch, read by the Ui when a flight ends, cleared when a new one starts.
   * Stock airtime is never logged, so a pilot who is not tuning pays for one
   * comparison a frame.
   */
  const tuneLog = new TuneLog();
  let tuneLogKey = '';
  let tuneLogMeta = null;
  /* Whether a trick of the freestyle run was landed off the stock air or
   * motors, which keeps the run off the public board. See noteTrickWeight. */
  let trickTuned = false;
  /*
   * The weight the scored freestyle run's tricks were landed at: null
   * before the first, and `trickWeightMixed` once one lands at another.
   * The slider is on the flight screen and applies at once, and in
   * freestyle nothing is voided by it, so a run can be flown at two
   * weights; the board row it would make has room for one, so such a run
   * is not posted (submitFreestyleRun) and its results row says why. Set
   * where a trick is landed, cleared by reset().
   */
  let trickWeight = null;
  let trickWeightMixed = false;
  /*
   * The aircraft the RUN is on, which starts as the one buildShell drew and
   * NOT as the stored setting. That is deliberate: applySettings below is
   * called once at boot, sees the two disagree, and does the swap through
   * the one code path that swaps an aircraft, instead of boot having a
   * second path of its own that would drift from it. A five inch pilot's
   * boot is unchanged; a whoop pilot's boot builds one craft it throws away,
   * which is a few hundred triangles once.
   */
  let runAirframe = '5inch';
  /* Which aircraft the Settings studio last built, so it is rebuilt when
   * the aircraft changes rather than posing the old one. */
  let showcaseCraft = '5inch';
  let notice = null; /* { text, untilMs } for one off shell messages */
  /* The seated world's own note, waiting for a flight to be said over. See
   * showCourseNotes. */
  let heldNotes = null;
  let padPickReturn = 'title';
  /* How many laps THIS run lasts. Settings.laps can change from pause, and
   * reading it live used to end a 5 lap run the moment someone dropped the
   * setting to 1. PRACTICE_LAPS is a run with no end, and it is latched
   * here for the same reason: whether a lap may go to the board is decided
   * by the run it was flown in, not by what the menu says afterwards. */
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
    const hy = view.height(wx, wz, wy - SURFACE_BIAS, wy);
    if (lastGroundHits > 0 || (!turtleOnSupport && wy - hy < turtleClearance())) {
      return hy;
    }
    return wy - restW();
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
      if (turtleWait || turtleFlip.active || landed || launchStaging || poseLock) {
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
    if (u > 0.45) {
      playCue('crash');
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
    lastClearance = pProbe.y - view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS, pProbe.y);
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
      craftVerticalOffset(),
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
      turtleFlip.surfaceY + restW() + lift,
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
    lastClearance = restW();
    setTurtleParkMotors(true);
    adoptSimClock();
    acc = 0;
    noteTurtleState(stateCurr);
    if (mode === 'flight' && typeof audio.event === 'function') {
      audio.event('land');
    }
  }

  function beginTurtleWait(hold) {
    /* No turtle in 3D mode: a craft on its back flies off on reverse thrust,
     * which is the whole point of the mode, and the plant carries it. */
    if (!stateCurr || poseLock || turtleWait || turtleFlip.active || run3d) {
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
    parkedLift = simLenToWorld(PARKED_LIFT);
    turtleResumeGate = false;
    dumpTurtleIterm();
    rcPending.length = 0;
    poseFromState(stateCurr, pProbe);
    const hy = turtleSupportY(pProbe.x, pProbe.y, pProbe.z);
    worldPosToSim(pProbe.x, hy + restW(), pProbe.z, pSim);
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
    if (!st || turtleWait || turtleFlip.active || poseLock || run3d) {
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
      lastClearance = pProbe.y - view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS, pProbe.y);
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
   * lockout. `at` reseats the spawn somewhere else first: a crash recovery
   * parks the craft on the surface it found, at.surface, facing at.yaw.
   */
  function resetCraft(at) {
    /* A room's other pilots are told the craft was put somewhere it did not
     * fly to, so they cut to it rather than sweep it through the scenery. */
    mpResets += 1;
    /* Wherever it lands, the open air it last flew through is somewhere
     * else now. The next frame in the open records it again. */
    haveRecoverFrom = false;
    /* And the counter's gaps and close calls start a new path from there:
     * the jump is not a line through anything. */
    namedGapRun.cut();
    closeCalls.cut();
    if (at) {
      startX = at.x;
      startZ = at.z;
      startYaw = at.yaw;
      startPitch = 0;
      startY = at.surface != null ? at.surface : groundAt(startX, startZ);
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
    /* And the receiver's held frame with them, because sim_reset has just
     * zeroed the module's own. Left behind, it is the stick from before the
     * reset, and the first frame after it flies on that until a new sample
     * lands at the frame's end: a whoop held against a ceiling at full
     * throttle came out of its crash recovery at 3 m/s upward. */
    /* Centred in 3D mode, where the bottom of the stick is full reverse. */
    rcHeld = { roll: 0, pitch: 0, yaw: 0, throttle: run3d ? 0.5 : 0 };
    adoptSimClock();
    /* The plant's own idea of where it is in the world, which this reset may
     * just have moved. */
    seatWorldFrame();
    clipGraceUntil = performance.now() + CLIP_SPAWN_GRACE_MS;
    setCrashflip(false);
    manualFlip = false;
    sim.e.sim_set_crashflip(0);
    turtleRecover = false;
    turtleOnSupport = false;
    setTurtleParkMotors(false);
    poseLock = false;
    lastSolidHits = 0;
    obsContact = false;
    obsTouched = false;
    obsClosing = 0;
    obsRoof = false;
    obsImpulse = 0;
    obsImpulseKind = '';
    readWorldReport();
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
    crashJudge.forget();
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
   * SET DOWN NEARBY: the X key, the pilot's own unstick. Nothing calls it
   * automatically any more (see the note above `clipGraceUntil`); a pilot
   * who wants off whatever they are wedged in presses X.
   *
   * RECOVER IN PLACE, rather than back on the start line.
   *
   * This used to call reset(), which is what R does: adoptSpawn() back to
   * the map's own spawn and race.reset(), which empties `log`, `laps` and
   * the lap clock. So a mesh glitch, which is OUR bug and not a thing the
   * pilot did, cost them every completed lap of the run. The owner's
   * instruction is the other way round: "the system should register this
   * state and just reset the quad in place."
   *
   * And set it DOWN, the owner's second rule: "recovery after crash should
   * always be from a flat surface (the ground or roof top)". So: find the
   * flat surface nearest to where the accident happened, park the craft on
   * it upright on its own heading, landed, sticks at idle, exactly as R
   * leaves it on the start line, and leave the run alone. The pilot takes
   * off again. The lap being flown keeps running, which is the right price.
   * Nothing about the race is touched, so `next`, the splits and the clock
   * all carry on.
   *
   * It used to hand the craft back in the AIR, at the nearest clear air,
   * level and at rest. That needed the keys picked up at hover, and even
   * then a quad with its motors stopped by sim_reset sagged half a metre
   * before it held. A craft that is set down has none of that.
   *
   * Finding the surface is findRestSpot in src/game/collide.js, which is
   * where the rules and the reasons live, beside the watch that calls the
   * crash. What it needs from here is the map's contact surface and where
   * the craft last flew in the open: recoverFrom below.
   */
  /* The terrain, or a box top the craft is on or over: the city's heightAt
   * knows only its platforms, and a roof is somewhere to set a craft down.
   * See Colliders.topAt. Within 0.3 m above the centre, so a craft at the
   * foot of a building is never put on its roof. */
  const RECOVER_TOP_STEP = 0.3;
  function recoverGroundAt(x, z, y) {
    const h = view.height(x, z, y - SURFACE_BIAS);
    const top = view.colliders ? view.colliders.topAt(x, z, y, RECOVER_TOP_STEP) : -Infinity;
    return top > h ? top : h;
  }

  /*
   * WHERE THE CRAFT LAST FLEW IN THE OPEN, clear of every solid by its own
   * radius and above the ground, taken every frame it is. The recovery
   * refuses a spot it cannot reach from here in a straight line, which is
   * what keeps a craft
   * stuck in a wall on the side of it the pilot was flying, and a craft over
   * a room's ceiling out of the room under it. The crash position alone
   * cannot say which side of a slab is which: a centre already through a
   * face is inside it.
   */
  const recoverFrom = { x: 0, y: 0, z: 0 };
  let haveRecoverFrom = false;
  const restSpot = { x: 0, y: 0, z: 0, surface: 0 };

  /*
   * THE LAST SET DOWNS, FOR A BUG REPORT: when, and why. A "stuck" ticket arrives with nothing about the craft, and a
   * craft set down five times in a row inside a tunnel reads the same from outside as one parked waiting for a stick
   * to centre (bug-d7247563, bug-ad038907, neither of which could be made to happen here). Wall clock, the last
   * eight; `line` is a set down that found no flat surface and gave the start line instead.
   */
  const setDowns = [];

  /*
   * AUTO RESET, bug-918a8c99. When the setting is on, a craft that has gone
   * down (set down by the crash rule or by stuckTick, or turtled on its back)
   * is put back on the start line with reset(), exactly what R does, once
   * autoResetS has run out. The deadline is on the SIM clock, in ms, so a
   * dropped frame or a paused game moves nothing, and -1 is not armed.
   * autoResetKind says what to watch for the pilot saving it: 'set' is
   * cancelled by the craft leaving the ground again, 'turtle' by the craft
   * no longer being on its back or the flip starting, and 'bounce', a crash
   * that set nothing down, by the craft being in the air and upright when
   * the deadline comes, and taken once it is down: landed, on its back, or
   * touching the ground or a solid, a wall it is sliding down included. The
   * frame's cost is
   * one compare, and only while armed.
   */
  let autoResetAtMs = -1;
  let autoResetKind = '';
  /* The deadline has passed and the reset is taken at the next frame's top. */
  let autoResetDue = false;
  function armAutoReset(kind) {
    if (!ui.settings.autoReset) {
      return;
    }
    autoResetAtMs = simTimeMs + ui.settings.autoResetS * 1000;
    autoResetKind = kind;
  }

  /*
   * A CRASH IS A RESET, AND A RESET IS NOT A TAKEOFF. The keys and the thumb sticks are put at idle when a craft is
   * set down (resetKeyboardSticks: a recovery that left them high would relaunch the wreck by itself), and a radio's
   * gimbals cannot be put anywhere, because the hand is on them. So a craft set down with the right stick off centre
   * lifted off on the next frame with the roll and pitch it had crashed with, and in a tunnel 2.3 m wide that is a
   * crash, a set down and a relaunch into the wall again until the hand lets go: five in 1.8 s, measured
   * (scripts/crash-check.js, "hand still on the sticks"; bug-d7247563, "crashed inside and cannot fly out").
   *
   * It is parked as a craft just turtled over is, which is the same state and says the same words, "Centre the right
   * stick, then fly" (turtleRecover). Only that stick is waited for: the throttle is free, so full throttle with the
   * sticks centred takes it off at once, as a crash at a wall has always been got away from (crash-check's "wall hit,
   * then full throttle"). A set down the pilot asked for with X is not held: they asked for it with the sticks where
   * they want them.
   */
  function holdUntilCentred(why) {
    if (why === 'x') {
      return;
    }
    const ch = input.channels;
    turtleRecover = turtleStickHeld(ch.roll, ch.pitch);
  }

  function setDownNearby(why = 'x') {
    const noted = { atMs: performance.now(), why, line: false };
    setDowns.push(noted);
    if (setDowns.length > 8) {
      setDowns.shift();
    }
    /* A craft set down is the end of trouble: a crash, a craft left stuck,
     * or the pilot's own X. The counter loses its open combo and whatever
     * was waiting to pay, and a skim is never paid for the wall it ended
     * on. The trick scorer is told only where it always was. */
    counterCrash(false);
    /* The pilot's own X is not a crash. A crash and a stuck craft are. If no
     * spot is found below, reset() puts the craft on the line and disarms. */
    if (why !== 'x') {
      armAutoReset('set');
    }
    const from = haveRecoverFrom ? recoverFrom : null;
    /* On a map with traffic, never in a car's path: a landed craft is not
     * stepped, and the car would drive through it. The verge instead, the
     * owner's decision of 2026-09-26; see roadKeepOut in
     * src/maps/built/traffic.js. Null on every other map. */
    const keepOut = trafficOn ? (view.restKeepOut ?? null) : null;
    /* Around the crash first. If everything there is on the far side of
     * something, around the last open air, which by construction is on the
     * near side of it. */
    const found = findRestSpot(
      view.colliders, recoverGroundAt, restW(), pCurr.x, pCurr.y, pCurr.z, from, restSpot, keepOut,
    ) || Boolean(from && findRestSpot(
      view.colliders, recoverGroundAt, restW(), from.x, from.y, from.z, from, restSpot, keepOut,
    ));
    if (!found) {
      /* No flat surface within three and a half metres is clear and
       * reachable. That is not a glitch any more, it is a craft somewhere
       * it cannot be put back, so fall through to the old behaviour and
       * give them the line. */
      noted.line = true;
      reset();
      holdUntilCentred(why);
      return;
    }
    /* Heading is kept: being spun to face north because a wall grabbed an
     * arm is its own disorientation, and the pilot was flying somewhere. */
    const yaw = craftHeadingYaw();
    /* Parked on the surface found, landed, keys at idle and the receiver's
     * held frame with them: resetCraft does all of that, exactly as it
     * does for R. The surface is handed over rather than asked for again,
     * so the craft sits on the one the search judged flat and clear. */
    resetCraft({ x: restSpot.x, z: restSpot.z, surface: restSpot.surface, yaw });
    holdUntilCentred(why);
    stateCurr = readState();
    statePrev = stateCurr;
    poseFromState(stateCurr, pCurr);
    /* Mid run, not a new one: the banner that promises what a run starts
     * with must not come back, and the stats already count this session. */
    flownThisRun = true;
    raceHasPrev = false;
    /* Whatever the hull is touching as it is set down is left over from
     * being put there, so the impact cue stays quiet for a moment. */
    recoverGraceUntil = performance.now() + CLIP_SPAWN_GRACE_MS;
    if (typeof audio.event === 'function') {
      audio.event('land');
    }
  }

  /*
   * STUCK IS A RESET. The owner, flying the solid world for the first time
   * on 2026-09-24: "crashing head first into a building i get stuck on the
   * wall, it should reset on this or fall to the ground", and "crashing back
   * first into the ground i get stuck again".
   *
   * Measured in the shell, both are the same state. A 6, 10 or 15 m/s head
   * on hit slides down the face and comes to rest standing on its nose at
   * the foot of the wall, top plate leaning on the masonry like a ladder,
   * which a real quad can do too. A tail first arrival latches turtle the
   * moment it touches and freezes, pointing at the sky. Either way the craft
   * is not upright, so throttle is not a takeoff, and full throttle only
   * presses it harder into whatever it leans on. Since the Crashed catch
   * went, nothing but X ever got the pilot out, and nothing on screen says X.
   *
   * So a craft that has been AT REST and NOT UPRIGHT for STUCK_MS of sim time
   * is set down nearby, exactly as X does it. Still is the whole test: a
   * craft more than 60 degrees from level cannot hold still in the air, so
   * if it is still, something is holding it. A tumble, a skid, a pilot
   * working the sticks or the turtle flip all move it and restart the clock.
   * A turtle the pilot may want to fly out of gets STUCK_TURTLE_MS instead.
   * This is the shell's recovery, not physics: the plant is never touched
   * until the moment X would touch it.
   *
   * In 3D a craft flat on its back is not stuck, it is sitting on its other
   * base and flies off it on reverse thrust (onBase in src/game/collide.js
   * has the owner's words), so within 60 degrees of flat on its back it is
   * left where it is, as one on its belly is.
   */
  const STUCK_MS = 1500;
  const STUCK_TURTLE_MS = 5000;
  const STUCK_SPEED = 0.3;
  const STUCK_RATE = 1.5;
  let stuckSinceMs = -1;
  function stuckTick() {
    const st = stateCurr;
    const still = mode === 'flight'
      && ui.screen === 'flight'
      && !poseLock
      && !launchStaging
      && !landed
      && !turtleFlip.active
      && !turtleRecover
      && st
      && plantUpZ(st) < TURTLE_EXIT_UPZ
      && !(run3d && plantUpZ(st) <= -TURTLE_EXIT_UPZ)
      && plantSpeed(st) < STUCK_SPEED
      && plantRateMag(st) < STUCK_RATE;
    if (!still) {
      stuckSinceMs = -1;
      return;
    }
    if (stuckSinceMs < 0) {
      stuckSinceMs = simTimeMs;
      return;
    }
    const turtling = turtleWait || manualFlip || crashflipOn;
    if (simTimeMs - stuckSinceMs < (turtling ? STUCK_TURTLE_MS : STUCK_MS)) {
      return;
    }
    stuckSinceMs = -1;
    setManualFlip(false);
    setCrashflip(false);
    turtleRecover = false;
    setDownNearby('stuck');
    notice = { text: 'Stuck, so you were set down nearby.\nX does this any time.', untilMs: performance.now() + 2800 };
  }

  /* See autoResetAtMs. Called once a frame, after stuckTick or X may have
   * armed it and before turtle can take the craft. */
  function autoResetTick() {
    if (!ui.settings.autoReset || poseLock || launchStaging) {
      autoResetAtMs = -1;
      autoResetDue = false;
      return;
    }
    /* A pause (Esc, a menu, a radio unplugged) holds the deadline rather
     * than dropping it: the sim clock it is on does not move while paused,
     * and a dropped deadline never came back for a craft set down. */
    if (mode !== 'flight' || ui.screen !== 'flight') {
      return;
    }
    if (autoResetAtMs < 0) {
      /* A craft turtled by a soft crash was never set down, so nothing armed
       * it. Arm it as it lands on its back. */
      if (turtleWait && !turtleFlip.active) {
        armAutoReset('turtle');
      }
      return;
    }
    if (autoResetKind === 'set' ? !landed
      : (autoResetKind === 'turtle' && (!turtleWait || turtleFlip.active))) {
      autoResetAtMs = -1;
      return;
    }
    if (simTimeMs >= autoResetAtMs) {
      if (autoResetKind === 'bounce' && !landed && !turtleWait && !(lastGroundHits > 0)
        && !(lastSolidHits > 0)) {
        /* In the air, touching nothing. Upright is flown out of it, and left
         * alone; falling or tumbling is waited out a frame at a time until
         * it is down, where this resets it, or upright. */
        if (stateCurr && plantUpZ(stateCurr) >= TURTLE_EXIT_UPZ) {
          autoResetAtMs = -1;
        }
        return;
      }
      /* Taken at the top of the next frame, where R and the restart switch
       * are, not here: this runs after the frame has already placed the
       * craft and seeded the race and the ghost from it, so a reset here
       * left one frame drawn at the crash and the race sweeping from the
       * crash to the start line. */
      autoResetAtMs = -1;
      autoResetDue = true;
    }
  }

  /*
   * CRASH IS A RESET. The owner, 2026-09-24, after flying tumble flat: "when
   * i crash head first or tail first into somthing i should not pause,
   * defying gravety, i should immediately reset, fix the delay". stuckTick
   * waited 1.5 s of stillness (5 s in turtle), and a tail first crash spent
   * the best part of a second rolling flat before turtle was even offered,
   * so a crash was a pause with the craft hanging on a wall or lying on the
   * street, and only then a reset.
   *
   * So a CRASH is set down nearby on the step it is read, exactly as X and
   * stuckTick do it. A crash is a smack, GRAZE_SPEED_MAX of closing or more,
   * the line the recogniser and the impact cue already draw between a
   * deliberate touch and a hit, landed anywhere but on the belly:
   *   a solid (a wall, a gate, a tree, the train): the frame or the lens in
   *     contact, not a prop alone, at that closing speed, with the contact's
   *     normal not along the body's up, and not the underside of something:
   *     a contact whose normal points more than 30 degrees below level
   *     (CRASH_UNDERSIDE_NZ) is a ceiling or a deck overhead, and gravity
   *     takes the craft off it by itself, so there is no pause to cut short
   *     and a craft held there is held by the pilot's own throttle
   *     (scripts/input-check.js, the whoop pinned under the room's ceiling,
   *     which caught the first version of this rule resetting it);
   *   the ground, a roof included: the ground judgement's own hit speed,
   *     with the craft not belly down after the contact step it judged;
   *   or a STOP, one step that changed the craft's velocity by
   *     GRAZE_SPEED_MAX or more, with the craft not belly down after it, in
   *     a step where no solid reported any contact at all. Nothing but a
   *     contact does that in a millisecond: 4 m/s in 1 ms is about 400 g,
   *     where thrust and gravity together give a few tens of g. With no
   *     solid touched, props included, the contact was the ground (the box
   *     the plant has taken as ground, a roof, is not a solid in the world
   *     report). Props included because PROP_F_MAX is 60 N a blade, which
   *     on the 23 g whoop is over 2 m/s a step, so a prop strike alone can
   *     make a stop. This is the flat back first crash, which the hit speed
   *     cannot see: flat on its back, the plant's projection lifts the hull
   *     out of the grass and the props down grab stops it dead in one step
   *     (ground_settle in src/native/sim.c), and sim_ground_contacts counts
   *     impulse hits and not the projection, so the shell was told there
   *     was no contact at all. Measured: 10.3 m/s to 0.02 in one step with
   *     no contact reported, then turtle on the next frame.
   * Nose and tail first are the owner's words, and the rule is wider on
   * purpose, because a craft flying forward meets a wall pitched fifty
   * degrees nose down: geometrically its top front edge lands first, and a
   * nose only test would miss the very crash that was reported. What stays
   * physics: a belly first hit (a hard landing, a skid, a bounce you fly
   * out of), anything under 4 m/s (a wall tap, a nudge), a prop clip and a
   * knock on a ceiling. Those still tumble flat and turtle as before.
   *
   * EVERY PHYSICS STEP, AT ITS OWN ATTITUDE. The owner, 2026-09-26
   * (POLISH-PLAN.md item 16, answer 5): "ok approved", to judge crashes per
   * physics step. Each rule reads one step: its own world report, its own
   * ground contact, the attitude it left, and the ground's cooldown runs on
   * the sim clock. A crash ends the step loop on its step, and the craft is
   * set down from the state that step left. Until then the rules were read
   * once a frame, at the frame's end attitude and behind a wall clock
   * cooldown, and the same tap was a crash on one monitor and not on
   * another (PROGRESS.md, 2026-09-25 and 2026-09-26).
   *
   * CRASH_BELLY_UP and CRASH_UNDERSIDE_NZ live in src/game/collide.js, with
   * the solid rule itself, solidContactCrash, so that scripts/world-check.js
   * can ask it of flights through the module, and so do all three rules as
   * the step loop asks them, CrashJudge (crashJudge, beside frameTurn), so
   * that scripts/crash-pacing.js can fly one input stream through them at
   * several frame rates and hold them to one verdict and one reset step.
   */
  /*
   * A CRASH IS A DULL BOUNCE, and no longer a reset. The owner, 2026-10-16:
   * "fix crashing to not be annoying no reset, just dull bounce always".
   * Everything above is kept as the record of why a crash used to set the
   * craft down; what changed is that it does not any more. The judge still
   * reads every step and a crash still ends the open combo, the chase and
   * the trick counter exactly as before, because a crash is still a crash
   * for scoring. What it no longer does is end the step loop, freeze an
   * impact frame or put the craft anywhere.
   *
   * WHAT THE CRAFT DOES INSTEAD is dullBounce in src/game/collide.js, put
   * on the plant by putDullBounce at the crash step itself, inside the step
   * loop, so it is on the sim clock and every frame rate flies the same
   * bounce (scripts/bounce-check.js holds it to that): the spin the corner
   * strike gave it is taken off, and it leaves the face at a walking pace
   * with part of its speed along it. The attitude is not touched, so the
   * picture never jumps. A slow knock on a solid with the frame, off the
   * belly, gets the same bounce without being a crash (solidContactKnock,
   * asked through crashJudge.knock), so a craft that comes back to the face
   * is pushed off it again instead of winding onto its nose; a knock keeps a
   * spin that is turning the craft off the face, which is the pilot pulling
   * away.
   *
   * Two recoveries stay, because neither is a crash reset. stuckTick still
   * sets down a craft left still and not upright for STUCK_MS, which is a
   * craft wedged nose first on a wall or lying on its side, where no stick
   * does anything. And Auto reset, off by default (bug-918a8c99), still
   * puts a craft set down or turtled back on the line for a pilot who
   * turned it on.
   */
  let crashSeen = false;
  const dullOut = new Float64Array(3);
  /* Whether a crash read now gets the bounce: the step loop asks it once
   * before it steps. */
  function crashCanBounce() {
    return mode === 'flight' && ui.screen === 'flight' && !poseLock && !launchStaging && !landed
      && !turtleFlip.active;
  }
  /* The crash step's bounce, or a knock's: see above and putDullBounce.
   * Returns the state the step now leaves. */
  function applyDullBounce(kind, before, after, rep, knock) {
    putDullBounce(sim, kind, before, after, rep, nSim.x, nSim.y, nSim.z, frameTurn.c, frameTurn.s, dullOut, knock, sailVelocity(rep[3]));
    return readState();
  }
  /*
   * A windmill's sail is met at its own speed (dullBounce's surf): the
   * velocity pushSails seated on the mover the report names, -2 - m, in the
   * plant frame, turned by frameTurn as the normal is. Null for anything
   * that is not a sail seated this step.
   */
  const sailSurf = new Float64Array(3);
  function sailVelocity(idx) {
    if (!sails || !(idx <= -2)) {
      return null;
    }
    const k = -2 - idx - sails.base;
    if (k < 0 || k >= sailsUsed) {
      return null;
    }
    const o = k * sails.doubles;
    return moverVelocityInPlant(sailBoxes[o + 6], sailBoxes[o + 7], sailBoxes[o + 8], frameTurn.c, frameTurn.s, sailSurf);
  }
  function crashBounceTick() {
    if (!crashSeen) {
      return;
    }
    crashSeen = false;
    if (mode !== 'flight' || ui.screen !== 'flight' || poseLock || launchStaging || landed) {
      return;
    }
    /* A crash the shell called, a car's included: the chase loses what it
     * held and the counter its open combo, as setDownNearby used to do for
     * them. Nothing about the craft is touched. */
    chaseBail();
    counterCrash(false);
    /* Auto reset, for a pilot who turned it on, hears a crash as it always
     * did; without a set down the craft may still be in the air, so this
     * kind is judged at the deadline: see autoResetTick. */
    armAutoReset('bounce');
    /* Steam edition: career. */
    if (career) {
      career.crash();
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

  /*
   * WHETHER THIS RUN HAS FOUND THE STF MARK, so a find happens once a run
   * rather than on every frame the pilot keeps looking. Here for
   * frameFault's reason: reset() clears it, so a fresh run can find the
   * mark again, and the counter's bonus (eggBonus) is paid once a run the
   * way everything else a run scores is. A crash recovery is not a new run
   * and keeps it. See findEgg.
   */
  let eggFound = false;

  /*
   * How often the shell asks, in rendered frames. The first three of
   * seesMark's tests are a few multiplications and the sight line is only
   * walked once the pilot is close and looking, so the question is nearly
   * free; every third frame is still twenty times a second at sixty, and a
   * pilot passing at 10 m/s is inside the range for most of a second.
   */
  const EGG_EVERY = 3;
  const eggFwd = new THREE.Vector3();

  /*
   * THE STF MARK (FREESTYLE-MAPS-PLAN.md section 9): has the pilot found
   * it? Asked from the frame loop in flight, with the FPV camera's own
   * position and the way it points, the lens and not the craft's centre,
   * because finding it is seeing it (src/game/egg.js). The first yes in a
   * run is the find: the stamp on this map's card that stays in this
   * browser (src/share/stamps.js), the callout and the panel, and the
   * counter's hook.
   */
  function findEgg() {
    eggFwd.set(0, 0, -1).applyQuaternion(fpvQuat);
    if (!seesMark(fpvPos, eggFwd, view.egg, view.colliders)) {
      return;
    }
    eggFound = true;
    writeStamp(view.egg.key);
    eggBonus(view.egg);
    /*
     * The panel's picture is the mark itself (stfDataUrl). The map that
     * painted the mark has already loaded src/art/stf.js, so this import
     * is the module it already holds and fetches nothing. It is dynamic so
     * that a pilot who only ever races never loads the mark at boot.
     */
    import('./art/stf.js')
      .then((m) => ui.stfFound(m.stfDataUrl()))
      .catch(() => ui.stfFound(null));
  }

  /*
   * THE EGG BONUS. Section 9 pays a found mark into the combo, and paying
   * is the counter's business (section 7, Stage C): EGG_POINTS into the
   * open combo, once a run (src/game/score.js egg), on the lap clock. It is
   * geometry, so it counts on every freestyle map whatever the Scoring
   * switch says (decision 2). The find itself is asked once every few
   * frames with the camera, so this is the one input to the counter that
   * arrives on a frame rather than a step.
   */
  function eggBonus(egg) {
    void egg;
    score.egg(simTimeMs);
  }

  /*
   * THE PARTNERS' MARKS (`marks` in src/maps/README.md), found the way the
   * STF mark was, by the same seesMark with the same camera, and it is an
   * achievement again for them (PARTNER_FINDS in src/game/egg.js): the
   * stamp under the mark's own key, EGG_POINTS into the combo once a run
   * for each partner (score.partner), the callout and the panel with the
   * partner's sign in it, and a count on the partner's dashboard on the
   * board.
   *
   * AND SEEN, which is the other number a partner is shown: the mark was in
   * the picture at a size a pilot can read (glimpsesMark), once for each
   * partner each time a map is flown, however many runs that is, because a
   * sighting in every run of a session would be the same pilot counted
   * over and over. A find is always a sighting too, so a mark found before
   * the slower sighting test came round is counted seen as well.
   *
   * Both go to the board as a closed word with the partner and the kind of
   * map (MARK_MAP_WORDS), through sendEvent, which sends nothing at all
   * for a pilot who opted out or whose browser asks not to be tracked
   * (src/share/stats.js). Nothing about the pilot, the place or the time
   * goes with them.
   */
  const marksFound = new Set();
  let marksSeen = new Set();
  let marksSeenView = null;
  /* The sighting walks up to SEEN_RANGE_MAX of sight line, so it is asked
   * a third as often as the find. */
  const MARKS_SEEN_EVERY = EGG_EVERY * 3;
  /* chooseDocument's sources in src/maps/built/index.js, as the board's
   * MARK_MAPS words: the starter is Hibari Yard, an injected document is a
   * map from the board, and the builder's seat is the pilot's own. The town
   * keys its marks 'city#'. The three house maps set a source of their own,
   * which is their own word on the board since 2026-10-21; before that the
   * board had none, and the signs on them were never counted for anybody.
   * Thomas More's Shop has its own since 2026-10-27, and the board's
   * word went out before this one. So has the goat map since 2026-10-28,
   * the same way. */
  const MARK_MAP_WORDS = {
    starter: 'yard', injected: 'board', canvas: 'own', house: 'house', heads: 'heads', bardwell: 'bardwell', warehouse: 'warehouse', goats: 'goats', sunny: 'sunny',
  };
  function markMapWord(mark) {
    return String(mark.key).startsWith('city#') ? 'city' : (MARK_MAP_WORDS[view.source] || null);
  }
  function markSeen(mark) {
    marksSeen.add(mark.slug);
    const map = markMapWord(mark);
    if (map) {
      sendEvent({ kind: 'mark', partner: mark.slug, what: 'seen', map });
    }
  }
  function findMarks(glimpse) {
    if (marksSeenView !== view) {
      marksSeenView = view;
      marksSeen = new Set();
    }
    eggFwd.set(0, 0, -1).applyQuaternion(fpvQuat);
    for (const mark of view.marks) {
      if (!shouldFindMark(mark)) {
        continue;
      }
      if (glimpse && !marksSeen.has(mark.slug) && glimpsesMark(fpvPos, eggFwd, mark, view.colliders)) {
        markSeen(mark);
      }
      if (!marksFound.has(mark.slug) && seesMark(fpvPos, eggFwd, mark, view.colliders)) {
        marksFound.add(mark.slug);
        if (!marksSeen.has(mark.slug)) {
          markSeen(mark);
        }
        partnerFound(mark);
      }
    }
  }
  function partnerFound(mark) {
    const partner = partnerBySlug(mark.slug);
    if (!partner) {
      return;
    }
    writeStamp(mark.key);
    score.partner(partner.slug, partner.short, simTimeMs);
    const map = markMapWord(mark);
    if (map) {
      sendEvent({ kind: 'mark', partner: partner.slug, what: 'found', map });
    }
    /* The panel's picture is the partner's sign, which the map that painted
     * it has already loaded, as findEgg's is. */
    import('./art/partnermark.js')
      .then((m) => ui.partnerFound(partner, m.partnerDataUrl(partner)))
      .catch(() => ui.partnerFound(partner, null));
  }

  /*
   * THE STICKERS (`stickers` in src/maps/README.md): decals a map's author
   * cut from a sticker sheet and gave an achievement, found by the same
   * seesMark as a partner's mark with the same camera. A sticker is found
   * once in a browser, not once a run, because finding it is the
   * achievement: the stamp under its own key (src/share/stamps.js) is the
   * record, and a sticker this browser has stamped is not asked about
   * again, except on a map that calls them out every time (below). Nothing
   * goes to the board: the board's mark words are the
   * partners', and a sticker is nobody's numbers.
   *
   * THE COST, for the latency rule: a map's stickers are asked every third
   * frame, a frame after the partners' marks, and almost every one stops
   * at seesMark's range test, three subtractions and a compare. A hundred
   * of them is a few hundred multiplications a check; the sight line is
   * walked only for a sticker the pilot is close to and looking at. The
   * found set is read from storage once per map, and a find writes one
   * stamp and draws one sticker into a small canvas for the panel.
   */
  let stickersView = null;
  let stickersFound = new Set();
  /*
   * EVERY TIME IT IS SEEN, on a map that asks for it (view.stickersEverySighting,
   * the Infinity Loops map: src/maps/specials.js). The owner, 2026-10-17: "each
   * sticker should always show the achievment in this map every time you see
   * it". There a found sticker is still asked about, and called out again when
   * it comes back into sight after STICKER_GONE_MS out of it. The find is still
   * stamped once, so the count is still how many this browser has found.
   *
   * A callout stays up STICKER_HOLD_MS before another replaces it, so a lawn
   * of stickers passing under the camera reads one at a time instead of as a
   * flicker; one that left sight while it waited is called out the next time
   * it is seen. `stickersSeen` is when each one was last called out or seen
   * since. The cost is the not yet found cost above, kept for the whole
   * flight on that map, and its pictures are drawn once and kept.
   */
  const STICKER_GONE_MS = 1500;
  const STICKER_HOLD_MS = 1200;
  const stickersSeen = new Map();
  const stickerPictures = new Map();
  let stickerCalledAt = -Infinity;
  /* How many callouts have gone up, for the harness (window.__stickers). */
  let stickerCallouts = 0;
  /*
   * NINE IN TEN, on a map that has the achievement (view.stickersNinety, the
   * Infinity Loops map again). The owner, 2026-10-17: "we want a 90%
   * acheivement, when you find 90% of the stickers". Once in a browser, under
   * its own stamp, the first check that the stickers found here reach
   * `need`, which also catches a browser that had found that many before the
   * achievement existed. It waits out a sticker's callout like another
   * sticker would, and goes before the next one.
   */
  let ninetyDone = true;
  /*
   * THE LAST ONE, on any map with stickers: the whole set found, once in a
   * browser, under its own stamp. The owner's ask of 2026-10-21 ("a brand and
   * style correct celebration"), his pick A of the mockups: ui.goalComplete,
   * in place of that last sticker's own callout. Nothing is asked of the
   * frame beyond the count the check already keeps.
   */
  let completeDone = true;
  let completeKey = '';
  function findStickers() {
    if (stickersView !== view) {
      stickersView = view;
      clipVoice.reset();
      if (ui.settings.sound && view.clips) {
        clipVoice.warm(view.clips);
      }
      stickersFound = stampedAmong(view.stickers.map((s) => s.key));
      stickersSeen.clear();
      stickerPictures.clear();
      ninetyDone = !view.stickersNinety || stampedAmong([view.stickersNinety.key]).size > 0;
      completeKey = view.stickers.length ? `${view.stickers[0].key.split('#sticker:')[0]}#complete` : '';
      completeDone = !completeKey || stampedAmong([completeKey]).size > 0;
    }
    const again = view.stickersEverySighting === true;
    const now = performance.now();
    if (!ninetyDone && stickersFound.size >= view.stickersNinety.need) {
      if (now - stickerCalledAt >= STICKER_HOLD_MS) {
        callNinety(now);
      }
      return;
    }
    if (!again && stickersFound.size >= view.stickers.length) {
      return;
    }
    eggFwd.set(0, 0, -1).applyQuaternion(fpvQuat);
    let pick = null;
    for (const s of view.stickers) {
      if ((!again && stickersFound.has(s.key)) || !seesMark(fpvPos, eggFwd, s, view.colliders)) {
        continue;
      }
      if (again) {
        const last = stickersSeen.get(s.key);
        if (last !== undefined && now - last < STICKER_GONE_MS) {
          stickersSeen.set(s.key, now);
          continue;
        }
      }
      /* One a check: a second find in the same frame would replace this
       * one's callout before anybody read it. Every sticker is still looked
       * at when they come back, so the ones in sight stay seen. */
      if (!pick) {
        pick = s;
        if (!again) {
          break;
        }
      }
    }
    if (!pick || (again && now - stickerCalledAt < STICKER_HOLD_MS)) {
      return;
    }
    if (!stickersFound.has(pick.key)) {
      stickersFound.add(pick.key);
      writeStamp(pick.key);
      /* A new find is celebrated aloud; a sighting again is not. */
      playCue('sticker');
    }
    if (again) {
      stickersSeen.set(pick.key, now);
    }
    stickerCalledAt = now;
    stickerCallouts += 1;
    if (!completeDone && stickersFound.size >= view.stickers.length) {
      callComplete(pick);
      return;
    }
    ui.stickerFound({
      word: pick.achievement, name: pick.name, got: stickersFound.size, total: view.stickers.length,
      picture: keptPicture(pick, again), of: view.stickersWord || '',
    });
  }
  function callComplete(last) {
    completeDone = true;
    writeStamp(completeKey);
    const total = view.stickers.length;
    const hero = (view.stickersNinety && view.stickers.find((s) => s.id === view.stickersNinety.picture)) || last;
    const tiles = [];
    for (const s of view.stickers) {
      if (tiles.length < 2 && s !== hero && s.key !== last.key && s.name !== hero.name) {
        const t = stickerPicture(s);
        if (t) {
          tiles.push(t);
        }
      }
    }
    /* A map may name its own set: the goat map's are goats seen. */
    const own = view.stickersComplete || {};
    ui.goalComplete({
      word: `ALL ${total}!`,
      sub: own.sub || 'Every sticker found',
      band: own.band || 'Every sticker on the map',
      picture: keptPicture(hero, false),
      tiles,
    });
  }
  /*
   * 90%ER GOAT HERDING (src/maps/goats/), once a frame: the box at the
   * side in flight and paused, and every goat that came home called out
   * like a sticker find, with its owner's logo, holding the sightings back
   * while it is up. All of them home is the map's own finish, once a
   * build: the goats stay home through a crash and a reset, and only
   * choosing the map again lets them out, so there is one finish to each.
   */
  let goatsDoneFor = null;
  /* The pause menu's Let the goats out (src/ui/ui.js): the herd back on the
   * street, and the finish free to be called again. */
  ui.onGoatsOut = () => {
    if (view && view.goatGame) {
      view.goatGame.restart();
      goatsDoneFor = null;
    }
  };
  function goatFrame() {
    const game = view && view.goatGame;
    ui.goatsOn = Boolean(game);
    ui.goatHud.setVisible(Boolean(game) && !replayMode && (ui.screen === 'flight' || ui.screen === 'paused'));
    if (!game) {
      return;
    }
    const home = game.drain();
    const hud = game.hud();
    if (home.length) {
      const last = home[home.length - 1];
      stickerCalledAt = performance.now();
      stickerCallouts += 1;
      if (hud.home >= hud.total && goatsDoneFor !== view) {
        goatsDoneFor = view;
        const tiles = home.slice(0, -1).map((g) => stickerPicture(g.sticker)).filter(Boolean);
        ui.goalComplete({
          word: `ALL ${hud.total}!`,
          sub: `Every goat home in ${goatClock(last.atS)}`,
          band: "Every 90%er's goat in Heads' garage",
          picture: keptPicture(last.sticker, false),
          tiles,
        });
      } else {
        ui.stickerFound({
          word: 'HOME!',
          name: `${last.name}'s goat`,
          got: last.count,
          total: last.total,
          picture: keptPicture(last.sticker, true),
          of: 'home',
          said: `Home. ${last.name}'s goat is in the garage, ${last.count} of ${last.total} home.`,
        });
      }
    }
    ui.goatHud.update(hud);
  }
  function goatClock(sec) {
    const t = Math.floor(sec);
    const m = Math.floor(t / 60);
    const r = t - m * 60;
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  }
  function callNinety(now) {
    const n = view.stickersNinety;
    ninetyDone = true;
    writeStamp(n.key);
    stickerCalledAt = now;
    stickerCallouts += 1;
    const patch = view.stickers.find((s) => s.id === n.picture);
    playCue('sticker');
    ui.stickerFound({
      word: n.word, name: 'You found 90% of the stickers', got: stickersFound.size, total: view.stickers.length,
      picture: patch ? keptPicture(patch, true) : null,
      said: `${n.word}. You found ${stickersFound.size} of the ${view.stickers.length} stickers.`,
    });
  }
  /* A sticker's picture for its callout, drawn once and kept when it will be
   * called out again. */
  function keptPicture(s, keep) {
    let picture = stickerPictures.get(s.key) || null;
    if (!picture) {
      picture = stickerPicture(s);
      if (picture && keep) {
        stickerPictures.set(s.key, picture);
      }
    }
    return picture;
  }
  /* The sticker as cut from its sheet, fitted in a square canvas for the
   * found panel, or null while the sheet has not decoded. */
  const STICKER_PANEL_PX = 256;
  function stickerPicture(s) {
    const img = s.sheet && s.sheet.image;
    if (!img || !img.naturalWidth) {
      return null;
    }
    const sx = s.crop.x * img.naturalWidth;
    const sy = s.crop.y * img.naturalHeight;
    const sw = Math.max(1, s.crop.w * img.naturalWidth);
    const sh = Math.max(1, s.crop.h * img.naturalHeight);
    const k = Math.min(STICKER_PANEL_PX / sw, STICKER_PANEL_PX / sh);
    const cv = document.createElement('canvas');
    cv.width = STICKER_PANEL_PX;
    cv.height = STICKER_PANEL_PX;
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, sw, sh, (STICKER_PANEL_PX - sw * k) / 2, (STICKER_PANEL_PX - sh * k) / 2, sw * k, sh * k);
    return cv;
  }

  /*
   * THE CHASE BONUS. Every chase event that pays (a tail banked, a thread,
   * a hurdle: pays() in src/game/chase.js) is handed here once, from the
   * feed that settled it (chaseToCounter), and goes into the counter's
   * combo under chase.js's own name and value (src/game/score.js
   * chaseEvent). A tail held at a feed holds the combo open there too.
   */
  function chaseBonus(e) {
    score.chaseEvent(e);
    chaseBonusCount += 1;
  }
  /* For the harness (window.__chase): the chase's events as they were
   * drained, the newest CHASE_LOG_MAX, and how many reached chaseBonus. An
   * event is a handful of numbers, and there are a few a minute. */
  const CHASE_LOG_MAX = 64;
  const chaseLog = [];
  let chaseBonusCount = 0;
  function noteChaseEvent(e) {
    chaseLog.push({
      kind: e.kind, name: e.name, value: e.value, ms: e.ms, why: e.why ?? null, labels: e.labels ?? null,
      step: e.step, paid: pays(e),
    });
    if (chaseLog.length > CHASE_LOG_MAX) {
      chaseLog.shift();
    }
  }
  /* For the harness (window.__counter): the counter's events as the HUD was
   * handed them, and the close calls' own, lost ones included, the newest
   * COUNTER_LOG_MAX of each. A few a minute. */
  const COUNTER_LOG_MAX = 64;
  const counterLog = [];
  const closeCallLog = [];
  function noteCounterEvents(list) {
    if (!list) {
      return;
    }
    for (const e of list) {
      counterLog.push(e);
      if (counterLog.length > COUNTER_LOG_MAX) {
        counterLog.shift();
      }
    }
  }
  function noteCloseCall(e) {
    closeCallLog.push(e);
    if (closeCallLog.length > COUNTER_LOG_MAX) {
      closeCallLog.shift();
    }
  }

  /*
   * THE YARD TRACK'S RUN (see `yard` above). A fresh run starts it at the
   * start gate again, filed under the run's own record key, and armed
   * unless the map times the whoop only and a five inch is flying it.
   */
  function yardReset() {
    yardAsked = false;
    ui.yardHud.setAsking(false);
    if (!yard) {
      return;
    }
    yard.reset();
    yard.armed = !view.yardWhoopOnly || runAirframe === 'whoop65';
    yard.setRecordKey(recordKey());
    yard.setWeight(runWeight);
    yard.setTuned(offStock());
  }

  /* One frame's travel, scored as the race above scores its own: a beep
   * at a gate and the lap called out loud. */
  function yardStep(prev, curr, simNow, nowWall, allow) {
    if (!yard) {
      return;
    }
    const r = yard.step(prev, curr, simNow, nowWall, allow);
    if (r.passed != null && typeof audio.event === 'function') {
      audio.event('gate');
    }
    if (r.lap && ui.settings.sound) {
      const yr = yard.race;
      lapVoice.say(
        lapCall(yr.log.length, yr.lastLapMs, yr.lastLapRecord),
        (ui.settings.volume / 10) * (ui.settings.calloutLevel / 10),
      );
    }
  }

  /* A clean set down: on a whoop only track with a five inch, inside the
   * painted zone, the swap is offered, once a landing. */
  function yardLanded() {
    if (!yard || !view.yardWhoopOnly || runAirframe === 'whoop65' || yardAsked || replayMode) {
      return;
    }
    const p = shell.quad.position;
    if (inAskZone(yard.track, p.x, p.z)) {
      yardAsked = true;
      ui.yardHud.setAsking(true);
    }
  }

  /*
   * The answer. No leaves the five inch where it is, and the track does not
   * time it. Yes seats the whoop, swaps the plant as a change of aircraft
   * between runs does (applySettings, under the title's mode for the one
   * call), and puts the whoop on the track's start, nose to the start gate.
   */
  ui.yardHud.onAnswer = (yes) => {
    ui.yardHud.setAsking(false);
    if (!yes || !yard) {
      return;
    }
    const t = yard.track;
    ui.seatWhoopForYard();
    const was = mode;
    mode = 'title';
    applySettings(ui.settings);
    mode = was;
    whenConfigReady(() => {
      reset();
      resetCraft({ x: t.start.x, z: t.start.z, yaw: t.start.yaw });
      mode = 'flight';
      ui.show('flight');
      introMs = -1;
    });
  };

  /* Once a frame: the HUD up near the track in flight, off everywhere
   * else, and the swap card down the moment the quad is in the air. Not
   * before the run's first takeoff, where the launch banner is in its
   * place. */
  function yardFrame(nowWall) {
    const hud = ui.yardHud;
    const on = Boolean(yard) && yard.near && !replayMode && airtimeMs > 0
      && (mode === 'flight' || mode === 'paused') && (ui.screen === 'flight' || ui.screen === 'paused');
    if (hud.asking && (!landed || mode !== 'flight' || ui.screen !== 'flight')) {
      hud.setAsking(false);
    }
    hud.setVisible(on || hud.asking);
    if (!yard || !(on || hud.asking)) {
      return;
    }
    const yr = yard.race;
    hud.update({
      name: yard.track.name,
      near: yard.near,
      armed: yard.armed,
      started: yard.started,
      lapMs: yr.currentLapMs(simTimeMs),
      next: yr.next,
      gates: yr.gates.length,
      lastMs: yr.lastLapMs,
      bestMs: yr.bestMs,
      record: yr.lastLapRecord,
      flash: yr.flashText(nowWall),
    });
  }

  function reset() {
    /* A reset is the pilot taking the offer the fault banner made, so the
     * next fault is a new one and deserves to be reported in its turn. See
     * the frame boundary. */
    frameFault = null;
    autoResetAtMs = -1;
    autoResetDue = false;
    /* A new run, so the mark is there to be found again, and the partners'. */
    eggFound = false;
    marksFound.clear();
    /* The pack charge a run flies on is fixed when the run starts. It is
     * a setting, and settings are reachable from the pause menu, so
     * without this a player could change packs mid run and have the lap
     * compared against another pack's record. */
    runVoltage = ui.settings.packVoltage;
    syncKeyHover();
    /* 3D mode on the same rule, and it has to come before resetCraft: the
     * sim_reset in there is what the controller latches it at. The record
     * key and the Tuned stamp follow it below, after race.reset. */
    const was3d = run3d;
    apply3d();
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
    airtimeMs = 0;
    /* A fresh run is a fresh balloon round, and a fresh fight. */
    if (balloonGame) {
      balloonNewRound();
    }
    if (fightGame) {
      fightNewRound();
    }
    /* Anything that holds a stamp ON that clock has to go back with it, or a
     * fresh run compares a zeroed clock against last run's stamp and stays
     * inside a cooldown that has already expired. */
    trickTouchAtSimMs = -1e9;
    /*
     * A real time replay holds one: startMs, the sim time its lap last
     * started at. Left there after a loop, vt went below zero and the ghost
     * stood on its first frame for as long as the replay had run up to that
     * loop.
     * Back to 0 with the clock, so R, the radio's restart switch and the
     * pause menu's Restart run all start the ghost again from the top, as R
     * already did before the first loop. The owner's call, 2026-09-26. Step
     * mode is left alone: the capture drives vt there through __replayStep,
     * and startMs is not read.
     */
    if (replayMode && replayClock && !replayStepMode) {
      replayClock.startMs = 0;
      replayClock.vt = 0;
    }
    /*
     * Everything else a reset does to the CRAFT is resetCraft's job, and it
     * used to be a verbatim copy of it, comments and all, which is the kind
     * of duplication that survives until the two drift and a crash recovery
     * starts clearing something a restart does not. Passing null keeps the
     * spawn adoptSpawn just set.
     */
    resetCraft(null);
    race.reset();
    yardReset();
    if (run3d !== was3d) {
      race.setTuned(offStock());
      race.setRecordKey(recordKey());
      ui.setBest(race.bestMs, view.mode);
    }
    /* A new run starts quiet: last run's final lap is not called over it. */
    lapVoice.stop();
    /* A new run scores from nothing, and the detector's clock goes back to
     * zero with the sim clock above so the two agree about when a trick
     * happened. */
    /*
     * RE-READ EVERY RUN, not once at boot. A pilot switches between a
     * scored run and free flight from the Freestyle screen and then presses
     * fly, and a shape decided at construction would have kept whichever
     * one happened to be stored when the page loaded.
     */
    score.timed = scoredRun();
    /* And whether tricks count in the counter this run (decision 2): the
     * geometry counts whatever this says. */
    score.tricks = scoringWanted();
    score.reset();
    trickWeight = null;
    trickWeightMixed = false;
    trickTuned = false;
    /* A new flight is a new question: what was flown last time is not what
     * the end of this one is asked about. */
    tuneLog.clear();
    trickDetector.restart();
    ui.resetScore();
    /* The counter's gaps and close calls from nothing. */
    namedGapRun.reset();
    closeCalls.reset();
    counterHard = false;
    counterCrashed = false;
    counterBailAt = -1;
    /* The chase too, and the smoke of the last run's drift car. */
    chase.reset();
    /* And Drift Matsuri's take, which rolls again from the next take off. */
    if (view.filmGame) {
      view.filmGame.film.reset();
      ui.filmHud.reset();
    }
    chasePaidUpTo = 0;
    ui.resetChase();
    carTouched = false;
    chaseCrashed = false;
    if (view.clearSmoke) {
      view.clearSmoke();
    }
    /* A fresh run records from its own first crossing. The session book
     * keeps what earlier runs flew; only the in-flight recording dies. */
    ghostRecorder.abort();
    ghostGap = null;
    ghostChased = null;
    ghostRig.setPresence(0);
    /* A dogfight on a race track is practice: no end to the run, so the
     * fight is never cut off by a results screen. */
    runLaps = ui.dogfight ? PRACTICE_LAPS : ui.settings.laps;
    view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
    /* Steam edition: career. A new run of the lesson under way, if any. */
    if (career) {
      career.reset();
    }
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

  /*
   * THE RACE LINE: a whoop room's trail of crumbs through the next gates
   * (src/render/raceline.js). The Race line setting, off by default; only a
   * room has one, so on every other world this does nothing. Nothing is
   * built or solved while it is off. The notice says what the trail is doing,
   * so a pilot who turns it on and sees nothing yet knows why: it is being
   * worked out, or this track has no line.
   */
  let raceLineSaid = '';
  function raceLineNotice(st) {
    const said = st.wanted ? st.phase : '';
    if (said === raceLineSaid) {
      return;
    }
    raceLineSaid = said;
    if (said === 'solving') {
      notice = { text: 'Working out the race line.', untilMs: performance.now() + 2800 };
    } else if (said === 'refused') {
      notice = { text: st.reason, untilMs: performance.now() + 4800 };
    }
  }
  /* Next gate cue, set on the view when the setting or the world changes,
   * so a world built with the cue on does not light its gate on the title,
   * the launch card and the results when the pilot has it off. The flight
   * frame still sets it too (updateTargetLock), and both are one compare. */
  function applyGuidance(s) {
    if (view && view.setGuidance) {
      view.setGuidance(s.nextGateCue !== false);
    }
  }
  function applyRaceLine(s) {
    const trail = view && view.raceLine;
    if (!trail) {
      return;
    }
    if (!trail.heard) {
      trail.heard = true;
      /* Never solve inside a flying frame: see step in render/raceline.js. */
      trail.canSolve = () => !(mode === 'flight' && ui.screen === 'flight');
      raceLineSaid = '';
      trail.listen(raceLineNotice);
    }
    view.setRaceLine(Boolean(s.raceLine));
  }

  /*
   * A SHELF OF THE MAP PICKER SWAPS THE WORLD AND THE PILOT STAYS PUT.
   * Choosing Whoop tracks in the Tracks room seats the whoop and its room,
   * which is a new world, and a new world used to mean the title. The
   * picker's rooms are pages drawn over the world, so the swap carries on
   * behind them and the pilot keeps choosing. Choosing what to fly from
   * one still lands on the title, because seatMap goes there first.
   */
  function pickerRoomOpen() {
    return ui.screen === 'courses' || ui.screen === 'freestyle';
  }

  function adoptLoadedView(keepPlace, stayMode, stayScreen) {
    /* A new view is a new set of solids, whether or not the place is kept. */
    uploadPlantWorld();
    applyRaceLine(ui.settings);
    applyGuidance(ui.settings);
    /* And a new GPU cost: the old world's average says nothing about this
     * one's. See reset in gpugate.js. */
    gpuGate.reset(true);
    attractCam = makeAttractCamera(view);
    noteWorldClip();
    /* The new world was built at the window's size; the hold a film had on
     * the old one's renderer size is over. */
    if (filmPinned) {
      filmPinned = false;
      resizeDirty = true;
    }
    if (!keepPlace) {
      race = new Race(view.gates, view.trackClass ?? 'full');
      yard = view.yardTrack ? new YardRace(view.yardTrack) : null;
      race.setWeight(runWeight);
      race.setTuned(offStock());
      race.setRecordKey(recordKey());
      ui.setBest(race.bestMs, view.mode);
      adoptSpawn();
      ui.setShare(view.share || null);
      reset();
      ghostCourseChanged();
      mode = 'title';
      if (!pickerRoomOpen()) {
        ui.show('title');
      }
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
    attachPropView();
    mapReady = true;
    /* The swap set the canvas ratio before it knew whether the new world's
     * pipeline scales its own targets: settled now. See canvasScaleOf. */
    applyRenderScale(ui.settings);
  }

  /* Custom is one map id and many courses. A second pick from the board
   * used to no-op because wantId and view.id were both "custom". */
  /*
   * Which document a world holds, beside which world. A track is keyed by
   * its seat. The built world is keyed by the published map it flies, or ''
   * for the pilot's own: every map from the board is the built world, so
   * without this, choosing a second one over the first was a swap that
   * matched and did nothing, and so was choosing Your map after either.
   */
  function wantedCourseKey(mapId) {
    /* Steam edition: career. A lesson's world is keyed by its own document,
     * stamped on the view by syncWorld when it loads (careerKey). */
    if (careerWorld && careerWorld.map === mapId) {
      return careerWorld.key;
    }
    if (mapId === 'built') {
      return sharedMap ? `mapshare:${sharedMap.id}` : '';
    }
    return mapId === 'custom' ? seatedCourseKey() : '';
  }

  function loadedCourseKey(map) {
    /* Steam edition: career. */
    if (map && map.careerKey) {
      return map.careerKey;
    }
    if (map && map.id === 'built') {
      return map.shared ? `mapshare:${map.shared.id}` : '';
    }
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
      && Boolean(ui.settings.shadowsOff) === Boolean(view.shadowsOff)
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
    /* 'advanced' holds Render scale and the frame cap, both settings
     * changes that can land here (MENUS-PLAN.md 2.3). */
    const STAY_SCREENS = ['pilot', 'advanced', 'quad', 'launch', 'rates', 'paused', 'title', 'credits'];
    const stayScreen = STAY_SCREENS.includes(ui.screen) ? ui.screen : null;
    const stayMode = keepPlace ? mode : 'title';
    swapInFlight = true;
    mapReady = false;
    /* A new world, so Auto starts over before it is built: at full
     * resolution, with no evidence from the old one. See autoForget. */
    autoForget();
    if (!keepPlace) {
      mode = 'title';
      if (!pickerRoomOpen()) {
        ui.show('title');
      }
    }
    const entry = mapById(wantId);
    loading.run(planStages(['module', 'world', 'frame'], entry.buildMs));
    /* Paint the loading screen BEFORE disposing a world and building another,
     * because both of those block the main thread and a screen nobody
     * composited is not a screen. */
    await yieldToPaint();
    const previous = view.id;
    const previousGraphics = view.graphics;
    const previousShadowsOff = Boolean(view.shadowsOff);
    /*
     * The published map each side of the swap flies, when it is the built
     * world. The failure below names the one that would not build by its
     * own name, and rebuilds the world being left WITH ITS OWN DOCUMENT:
     * sharedMap already names the new map by now, so rebuilding `previous`
     * from it would build the failing map again, and the guard at the foot
     * of this function would go round that for ever.
     */
    const wantShared = wantId === 'built' ? sharedMap : null;
    const previousShared = view.shared || null;
    try {
      view.dispose();
    } catch (e) {
      /* Already gone, or the last swap never produced a world. */
    }
    applyPixelRatio(shell, wantQ, renderScaleOf(ui.settings));
    try {
      view = await loadMap(shell, wantId, loading, {
        quality: qualityOf(ui.settings),
        renderScale: renderScaleOf(ui.settings),
        hideSponsors: replayClean,
        /* The same map rebuilt (a change of graphics): a map with a game
         * of its own keeps it (the goat map's herd, src/maps/goats/). */
        keepGame: keepPlace,
        ...worldDocument(wantId),
      });
      /* Steam edition: career. Which lesson world this is, if one. */
      view.careerKey = careerWorld && careerWorld.map === wantId ? careerWorld.key : '';
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
      /* For the next bug report, which is the only way this reaches us:
       * see loadFailure in ui.bugSnapshot. bug-850375dc. */
      ui.loadFailure = {
        map: entry.id,
        message: String((e && e.message) || e).slice(0, 300),
        atUtc: new Date().toISOString(),
      };
      ui.settings.map = previous;
      ui.settings.graphics = previousGraphics;
      ui.settings.shadowsOff = previousShadowsOff;
      sharedMap = previousShared;
      ui.setSharedMap(sharedMap);
      try {
        applyPixelRatio(shell, previousGraphics, renderScaleOf(ui.settings));
        /* Steam edition: career. A lesson world that would not build gives
         * the career its answer through careerKey, and the world being left
         * is rebuilt from its own document, never from the lesson's. */
        const failedCareer = careerWorld;
        careerWorld = null;
        view = await loadMap(shell, previous, loading, {
          quality: qualityOf(ui.settings),
          renderScale: renderScaleOf(ui.settings),
          hideSponsors: replayClean,
          ...worldDocument(previous),
        });
        view.careerKey = '';
        if (failedCareer) {
          careerFailed = failedCareer.key;
        }
        loading.start('frame');
        adoptLoadedView(keepPlace, stayMode, stayScreen);
        /* A freestyle world failed under a pilot still in freestyle, and
         * Fly is what tries it again, with a fresh page (bug-850375dc: see
         * seatWorld in ui.js), so say so. Not for a map from the board: a
         * fresh page flies Your map, so the promise would not be kept, and
         * its card in the Freestyle room is the way to try it again. */
        notice = {
          text: wantShared
            ? `${wantShared.name} could not be loaded.`
            : (entry.mode === 'freestyle'
              ? `${entry.name} could not be loaded. Fly reloads the page and tries again.`
              : `${entry.name} could not be loaded.`),
          untilMs: performance.now() + 4200,
        };
      } catch (e2) {
        console.error(e2);
        loading.fail(`${wantShared ? wantShared.name : entry.name} could not be loaded. ${e.message ?? e}`);
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
   * racing on keys starts in ANGLE_MODE; a radio uses the setting, and M in
   * flight changes whichever of the two is flying. See flightModeSetting.
   * Changing this does not re-init the module and does not reset the craft.
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

  /*
   * WHICH STORED CHOICE DECIDES ANGLE OR ACRO RIGHT NOW: 'flightMode', the
   * Flight mode row in Quad, or 'keyRaceMode', the keyboard's own choice for
   * racing. Split out of wantAngleMode so the M key flips the same choice
   * this reads, and cannot flip one while the other is flying.
   *
   * Racing on keys used to FORCE Angle, with nothing a pilot could do about
   * it: bug-92007f3e, "Using m+k freestyle mode defaults to acro while the
   * race courses default to angle. If there is a key to swap between modes
   * on the keyboard I haven't found it." There was not. The guard's reason
   * stands, so it stays as the DEFAULT, Angle, and becomes a choice the
   * pilot can change with M and keep.
   */
  function flightModeSetting() {
    /* The thumb sticks are a proportional stick, so they are a RADIO here,
     * not a keyboard: they fly whichever mode the setting says. Keys keep
     * forcing angle because a key is a bang-bang input and acro on one is
     * a crash generator. */
    if (input.isTouchPrimary()) {
      return 'flightMode';
    }
    /*
     * THE HARNESS OVERRIDE IS A GIMBAL, NOT A KEY.
     *
     * window.__stick writes a proportional channel straight into the poll
     * ladder, so it can hold a rate the way a radio does and the reason
     * keys force angle does not apply to it. It was landing on the
     * keyboard branch anyway, and ANGLE MODE CANNOT LOOP: the craft is
     * held inside a 60 degree limit, so every probe that tried to
     * fly a Powerloop swept eighty three degrees of pitch in three seconds
     * of full back stick and flew away in a climb. That is why no check in
     * this repository had ever flown one of these tricks: every "verified"
     * loop was a path drawn by arithmetic and fed to the recogniser
     * directly, because the only thing that could actually FLY was locked
     * out of acro. A pilot on a radio is unaffected either way.
     */
    if (input.harnessChannels) {
      return 'flightMode';
    }
    /*
     * FREESTYLE IS THE TRICK MODE, AND NO TRICK IS POSSIBLE IN ANGLE.
     *
     * Angle holds the craft inside a 60 degree limit, so a pilot in
     * it cannot fly a Powerloop, a Split-S, a Matty Flip, an Orbit, a roll
     * or a flip: the entire catalogue is out of reach. Forcing it on the
     * keyboard therefore does not make freestyle safer for a key pilot, it
     * makes freestyle pointless for them, and a scoring system nobody on a
     * keyboard can score in is not a scoring system.
     *
     * IT IS NOT GATED ON freestyleScoring AND MUST NOT BE. The scorer was
     * how the case got made, but the case does not rest on it: a pilot who
     * wants to fly a flip in the town wants to fly a flip whether or not
     * anything is naming it, and scoring is off by default, so gating this
     * would lock every keyboard pilot out of every trick unless they first
     * switched on a feature the product tells them is unfinished. That is
     * the opposite trade. Racing keeps the guard.
     *
     * So in freestyle the SETTING decides, on a keyboard as much as on a
     * radio. Racing keeps the guard, where holding a line matters more than
     * inverting and a key is a bang bang input.
     *
     * The guard is now a default the pilot can change rather than a lock:
     * keyRaceMode starts at Angle, and only M in flight moves it.
     */
    if (view && view.mode === 'freestyle') {
      return 'flightMode';
    }
    return input.isKeyboardPrimary() ? 'keyRaceMode' : 'flightMode';
  }

  function wantAngleMode() {
    if (crashflipOn || turtleRecover) {
      return false;
    }
    if (lcAcroUntil === Infinity || (lcAcroUntil > 0 && performance.now() < lcAcroUntil)) {
      return false;
    }
    /* Steam edition: career. A lesson holds its own mode, Angle for the
     * first chapters and Acro after, whatever the pilot's setting says.
     * Turtle, crash flip and a launch above still win, as they do over the
     * setting. */
    if (careerFlightMode) {
      return careerFlightMode === 'angle';
    }
    return ui.settings[flightModeSetting()] === 'angle';
  }

  /*
   * M IN FLIGHT: ANGLE OR ACRO, FROM THE KEYBOARD. bug-92007f3e.
   *
   * It flips whichever choice is flying right now and saves it, so a pilot
   * racing on keys who picks Acro stays in Acro on the next race, and one
   * who picks Angle in freestyle has changed the Flight mode row, the same
   * row the FC screen's switch and Settings write. M, because it is far
   * from both hands' keys: a mode that flips when a finger slips off D in a
   * hard yaw is worse than no key at all.
   *
   * Turtle, crash flip and a launch hold Acro whatever the choice says,
   * and still do. The choice is saved and takes over when they let go. The
   * banner hides notices under both, so the OSD's mode readout, which is
   * always the live one, is what says so.
   */
  function flipFlightMode() {
    /* Steam edition: career. M does not undo what a lesson is teaching. */
    if (careerFlightMode) {
      notice = {
        text: careerFlightMode === 'angle'
          ? 'This lesson is flown in Angle.\nAcro comes in chapter three.'
          : 'This lesson is flown in Acro.',
        untilMs: performance.now() + 2400,
      };
      return;
    }
    const key = flightModeSetting();
    const next = ui.settings[key] === 'angle' ? 'acro' : 'angle';
    ui.settings[key] = next;
    ui.persistSettings();
    syncAngleMode();
    notice = {
      text: next === 'angle'
        ? 'ANGLE\nSticks are tilt. Let go and it levels.\nM switches back.'
        : 'ACRO\nSticks are rates. Let go and it holds its attitude.\nM switches back.',
      untilMs: performance.now() + 2600,
    };
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
    /* A replay's craft stays parked: see the takeoff in frameBody. */
    if (!(mode === 'flight' && landed) || replayMode) {
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

  /*
   * The pilot's render scale as a multiplier, 100 percent being native: the
   * Render scale slider, times Auto's own factor when Auto graphics is
   * on (see autoscale.js). Every path that sizes the picture reads this, so
   * the factor reaches the race field's pixel ratio and the town's and the
   * built map's internal scale alike, and each of those still clamps to its
   * own floor. A preset the pilot picked by hand gets exactly the slider.
   */
  function renderScaleOf(s) {
    const user = (Number(s.renderScale) || 100) / 100;
    return s.graphicsAuto ? user * autoFactor : user;
  }

  /*
   * The scale the CANVAS takes. The race field renders at the canvas's own
   * ratio, so it takes the render scale there. The town's and a built map's
   * pipelines render into targets of their own and take the render scale
   * as their userScale, so their canvas stays at the preset's ratio: taking
   * it in both places would lower the picture twice. Review finding F1.
   */
  function canvasScaleOf(s) {
    return view && view.post && view.post.userScale != null ? 1 : renderScaleOf(s);
  }

  /*
   * Set the ratio and walk the same guarded resize path a window resize
   * takes, so the composer and every prepass target follow in one place.
   * Shared by a Settings change and by Auto's resolution.
   */
  function applyRenderScale(s) {
    const userScale = renderScaleOf(s);
    const canvasScale = canvasScaleOf(s);
    const wantPr = pixelRatioFor(s.graphics, canvasScale);
    const userChanged = !!(view && view.post && view.post.userScale != null
      && view.post.userScale !== userScale);
    if (view && view.post && view.post.userScale != null) {
      view.post.userScale = userScale;
    }
    if (shell.pixelRatio !== wantPr || userChanged) {
      if (shell.pixelRatio !== wantPr) {
        applyPixelRatio(shell, s.graphics, canvasScale);
      }
      const d = shell.resize();
      if (view && view.post && mapReady) {
        view.post.setSize(d.w, d.h);
        /* New targets, so the fences in flight time the reallocation: see
         * reset in gpugate.js. */
        gpuGate.reset();
      }
    }
    autoScale.setFloor(autoFloorFor(s));
  }

  /*
   * How far down Auto may take the resolution on this preset and window. On
   * Medium and High never under the rubric's 1,200,000 internal pixels
   * (prompts/bando-perf-loop.md, F4), so Auto cannot pace a 1080p picture
   * into 720p; on Low, the Render scale slider's lowest step, the one
   * exception, by the owner's decision of 2026-09-28 (autoMinPixels in
   * src/render/quality.js, where the reasons are). Medium was paced to the
   * slider's lowest step too until that decision, which is review finding
   * F6. The town's and a built map's pipelines also stop at their own
   * minScale, and say where both floors are.
   */
  function autoFloorFor(s) {
    const slider = (Number(s.renderScale) || 100) / 100;
    const minPixels = autoMinPixels(s.graphics);
    /* A pipeline that scales its own targets knows where they stop
     * shrinking and how big they are. Auto's factor multiplies the slider,
     * so its floor is that over the slider (setFloor clamps it to the
     * slider's lowest step and to 1). */
    if (view && view.post && typeof view.post.autoFloor === 'function') {
      return view.post.autoFloor(minPixels) / slider;
    }
    if (!(minPixels > 0)) {
      return AUTO_FLOOR;
    }
    const w = shell.cssSize.w;
    const h = shell.cssSize.h;
    const pr = pixelRatioFor(s.graphics, slider);
    const px = w * h * pr * pr;
    return px > 0 ? Math.sqrt(minPixels / px) : 1;
  }

  /*
   * Auto moves the preset one step, through the same path a Settings change
   * takes (applySettings rebuilds the world when the preset no longer
   * matches it). graphicsAuto stays true: this is still Auto's choice, and it
   * is what the next visit starts from. The resolution factor starts again
   * at 1 on the new preset. A pilot who picks a preset by hand in Settings
   * ends all of this.
   */
  /*
   * AUTO STARTS OVER: full resolution and no evidence. Called when the pilot
   * turns Auto on, when the preset changes by any hand (applySettings), and
   * when a map swap starts (syncWorld). The evidence Auto held described a
   * world and a preset that are no longer the ones in front of the pilot,
   * and acted on later, on the title, it moved a preset the pilot had just
   * picked: review finding F4, probed on 2026-09-27 (Low's ask for a lower
   * preset survived Medium picked by hand and Auto picked again, and the
   * title put it back to Low). The caller applies the scale.
   *
   * NOT ON A WINDOW RESIZE, which the review also named. Fullscreen in flight
   * changes the window on every Fly and every return to the title, so a
   * resize reset would clear the ask for a lower preset on the way to the
   * one screen that acts on it. The asks withdraw themselves instead, when
   * the scale leaves the floor or full scale: see applied in autoscale.js.
   */
  function autoForget() {
    autoScale.resetEvidence();
    if (autoFactor !== 1) {
      autoFactor = 1;
      autoScale.applied(1);
      ui.setAutoScale(1);
    }
  }

  function autoMovePreset() {
    /* Which way, if any, and what Auto remembers about this machine: see
     * autoPresetMove in autoscale.js. */
    const move = autoPresetMove(normalizeGraphics(ui.settings.graphics),
      ui.settings.graphicsAutoRaised, ui.settings.graphicsAutoCeiling,
      autoScale.state, { demoted: autoDemoted, promoted: autoPromoted });
    autoScale.resetEvidence();
    if (!move) {
      return;
    }
    if (move.way === 'down') {
      autoDemoted = true;
    } else {
      autoPromoted = true;
    }
    const next = move.next;
    ui.settings.graphics = next;
    /* Measured now, so the boot guess from the GPU's name stands down, and
     * the ceiling and the preset Auto raised to are kept for the next
     * visit: see bootGuessGraphics and autoPresetMove. */
    ui.settings.graphicsAutoMeasured = true;
    ui.settings.graphicsAutoRaised = move.raised;
    ui.settings.graphicsAutoCeiling = move.ceiling;
    autoFactor = 1;
    autoScale.applied(1);
    ui.setAutoScale(1);
    ui.persistSettings();
    notice = {
      text: `Auto graphics: ${graphicsLabel(next)}, to keep the picture on time on this machine.`,
      untilMs: performance.now() + 4200,
    };
    applySettings(ui.settings);
  }

  /*
   * Everything the shell derived from the OLD plant, re-derived. Four things
   * and they have to move together, which is why this is one function rather
   * than four lines at the call site:
   *
   *   the collision dimensions, which src/game/collide.js publishes as live
   *     module bindings so every importer follows without knowing;
   *   the drawn model, which is a different builder entirely for a whoop;
   *   the ground plane the module holds, because a 23 mm thick machine does
   *     not park 45 mm off the deck; and
   *   the record key, because a whoop lap and a five inch lap on the same
   *     track are not the same record.
   *
   * Between runs only. Every collision query in flight reads the dimensions
   * and swapping them mid lap would move the hull under a craft that is
   * already resolving a contact.
   */
  /*
   * HOW BIG THIS MAP IS TO THIS AIRCRAFT, the quad picker's (the owner,
   * 2026-10-28). The map's own multiple of life size is `mapScale` in
   * src/maps/registry.js, or a track's class for a track; worldScaleFor in
   * configs/airframes.js turns it and the aircraft into the number
   * src/render/frame.js converts with, and every pairing that flew before
   * the picker comes out at exactly 1. Bardwell's yard track is a whoop room
   * inside a life size map (`whoopYard`), and a whoop there flies the room,
   * so it keeps 1 as it always has.
   *
   * forcedWorldScale is the harness's (window.__forceWorldScale), for
   * scripts/feel-measure.js to fly one aircraft on one map at two scales and
   * show the flight is the same in the aircraft's own metres.
   */
  function mapScaleOf(v) {
    const entry = v ? mapById(v.id) : null;
    if (entry && Number.isFinite(entry.mapScale)) {
      return entry.mapScale;
    }
    return v && v.trackClass === 'micro' ? MICRO_SCALE : 1;
  }
  function wantWorldScale() {
    if (forcedWorldScale !== null) {
      return forcedWorldScale;
    }
    const entry = view ? mapById(view.id) : null;
    if (entry && entry.whoopYard && airframeById(runAirframe).trackClass === 'micro') {
      return 1;
    }
    return worldScaleFor(runAirframe, mapScaleOf(view));
  }
  /* Seat the scale; true when it moved. Everything the shell derived from
   * the old one follows: the hull, the rest height and the drawn craft. The
   * caller owns the world's solids, which have to be uploaded again. */
  function seatWorldScale() {
    const want = wantWorldScale();
    if (want === WORLD_SCALE) {
      return false;
    }
    setWorldScale(want);
    setCraftAirframe(airframeById(runAirframe).dims);
    seatRestHeight(airframeById(runAirframe).dims);
    if (typeof shell.swapCraft === 'function') {
      shell.swapCraft(runAirframe);
    }
    /* The ghost is built once, at boot, at the boot's scale (worldScale in
     * src/render/herocraft.js); the craft swapped above is built again. */
    ghostRig.group.scale.setScalar(1 / WORLD_SCALE);
    return true;
  }

  /* How many world metres are a real metre where the craft is, for what the
   * HUD prints: the map's own multiple, and Bardwell's yard track, a whoop
   * room inside a life size map, when the whoop flies it. */
  function hudLifeScale() {
    if (view.yardWhoopOnly && runAirframe === 'whoop65') {
      return MICRO_SCALE;
    }
    return mapScaleOf(view);
  }

  function syncCraftScale() {
    /* A new aircraft may want a new world scale, and the solids the plant
     * holds were converted through the old one. */
    if (seatWorldScale() && view) {
      uploadPlantWorld();
      seatWorldFrame();
    }
    setCraftAirframe(airframeById(runAirframe).dims);
    /* Where this aircraft's centre sits when it is parked, which is where
     * the shell puts the ground plane, the spawn and the landed test. See
     * SPAWN_ALT at the top of this file. */
    seatRestHeight(airframeById(runAirframe).dims);
    if (typeof shell.swapCraft === 'function') {
      shell.swapCraft(runAirframe);
    }
    /*
     * The ground PLANE needs no raising here: raiseGroundFromState asserts
     * it from the craft's own pose every step it matters, and the shell
     * does not hold one. This paragraph exists because the first version of
     * this function called a raiseGround() that does not exist.
     *
     * Where that plane goes under the craft is another matter, and it is
     * the line above. worldPosToSim puts the surface at sim z minus
     * SPAWN_ALT, so SPAWN_ALT IS how far the plant's origin stands off the
     * floor, and it has to be this aircraft's parked height or the plant
     * rests the craft in the air. That was the bug: "a 23 mm thick machine
     * does not park 45 mm off the deck" was written here, correctly, while
     * both numbers stayed the five inch's.
     */
  }

  /*
   * WHERE THE KEYBOARD'S THROTTLE SPRINGS BACK TO: the measured hover for
   * the throttle cap, weight and pack this run is actually flying, which is
   * why it reads the run's values and not the stored settings. The keys
   * sprang to a constant 0.22 until bug-3a7be142, thirteen points under the
   * shipped hover, and the quad fell whenever W came up. Called from
   * applySettings, which every settings write reaches, the weight slider in
   * flight included, and from the run start, where the pack is latched.
   * Motor power moves hover as well, by about 1 / kV, so the spring reads the
   * percent the module is actually flying (runMotorKv, 100 until the tuning
   * mode has moved it).
   */
  function syncKeyHover() {
    input.setKeyHover(hoverStickPercent(
      normaliseRates(ui.settings.rates).throttleCap, runAirframe, runWeight, runVoltage, runMotorKv,
    ) / 100);
  }

  /*
   * Frame pacing's state, declared here because applySettings just below is
   * the first code the boot sequence runs that asks for it; the loop these
   * flags steer, and the whole story of why it exists, is frame() and
   * frameTimer() further down (THE LOOP SWAPS LIVE). The URL force is read
   * once: a session opened as ?loop=timer or ?loop=display flies that loop
   * whatever the row says, so an A against B stays one address away.
   */
  const loopParam = new URLSearchParams(window.location.search).get('loop');
  const loopForce = loopParam === 'timer' ? true : (loopParam === 'display' || loopParam === 'raf' ? false : null);
  let timerLoop = false;
  /* The pending timeout, 0 when none, and whether boot started the loop at
   * all, so a visibility flicker before boot cannot start it early. */
  let timerId = 0;
  let timerOn = false;
  /* Whether the last frame was the freestyle room's film, mirrored out of
   * frameBody (film there is a per frame const) for timerPacesNow below:
   * the loop hands over at tick boundaries, so the last tick's answer is
   * exactly the one the next tick's scheduling needs. */
  let filmNow = false;

  function applyLoopMode() {
    timerLoop = loopForce !== null ? loopForce : pacingTimerOn(ui.settings);
  }

  /* Whether the timer paces THIS tick: only live flying. The timer exists
   * to cut the time between the sticks and the glass, and a replay or the
   * freestyle room's film has no sticks, so there is nothing to cut and
   * the display loop is the right pacer for footage. It is also the safe
   * one: those modes' frames must ALL be drawn, so the draw bypasses the
   * gate for them, the timer's queue rule with it, and a timer feeding an
   * ungated draw flooded a slow GPU without bound (the battery found it,
   * twice). The compositor pacing all-drawn frames is precisely what
   * requestAnimationFrame is. The harness's frame sampling also rides
   * rAF, so a mode it drives tick by tick reads coherently only when the
   * loop is the rAF loop. Checked at every tick, so entering a replay or
   * the film hands the loop over and leaving hands it back. */
  function timerPacesNow() {
    return timerLoop && !replayMode && !replayStepMode && !filmNow;
  }

  function applySettings(s) {
    /* Which clock draws the frames, from the Frame pacing row and the
     * graphics preset together (pacingTimerOn in ui.js), unless the ?loop=
     * URL is forcing one for the session. Every route a preset changes by
     * comes through here, Auto's own moves included, so a machine Auto
     * lands on Low picks the timer up between runs with no hand on it. The
     * running loop reads the flag at its next tick: see THE LOOP SWAPS
     * LIVE at frameTimer. */
    applyLoopMode();
    /*
     * The pilot's stick mode, first, because everything below it that draws
     * a stick wants to know. input.setStickMode forwards to the thumb
     * sticks; ui.setStickMode redraws the captions and the how-to prose.
     * Both are no-ops when the mode has not moved.
     */
    input.setStickMode(s.stickMode);
    if (ui.setStickMode) {
      ui.setStickMode(s.stickMode);
    }
    /* What the throttle keys do when let go. The collective stays where it
     * is across a change, so this is safe mid flight. */
    input.setKeyThrottle(s.keyThrottle);
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
    /* Render scale changes are free, no world rebuild. See
     * applyRenderScale. Auto turned on, a preset changed by any hand, or
     * Auto turned off with its factor still applied: Auto starts over, and
     * the picture goes back to exactly the slider until the frames say
     * otherwise. See autoForget. */
    const presetNow = normalizeGraphics(s.graphics);
    const autoOn = Boolean(s.graphicsAuto);
    if (autoSeenPreset !== null
      && ((autoOn && !autoSeenOn) || presetNow !== autoSeenPreset || (!autoOn && autoFactor !== 1))) {
      autoForget();
    }
    autoSeenOn = autoOn;
    autoSeenPreset = presetNow;
    applyRenderScale(s);
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
      /*
       * THE AIRFRAME, on the same between-runs rule and for a stronger
       * version of the same reason. Pack charge and flight style change what
       * a run measures; the airframe changes the ENTIRE PLANT, the mass, the
       * inertia, the motors, the rotors, the pack and the collision hull, so
       * applying it mid lap would be swapping the aircraft under the pilot.
       *
       * Guarded because an older dist/sim.wasm predates the export, same as
       * the flight style above. On such a build the shell simply flies the
       * five inch, which is what that build has.
       */
      const wantCraft = airframeById(s.airframe).id;
      if (wantCraft !== runAirframe) {
        runAirframe = wantCraft;
        if (typeof sim.e.sim_set_airframe === 'function') {
          sim.e.sim_set_airframe(simIdFor(runAirframe));
        }
        /*
         * The plant changed under a module that is already initialised, so
         * everything the shell derived from the OLD plant has to follow: the
         * craft's own dimensions, its collision hull, its model and the
         * ground plane it sits on. syncCraftScale does all four and is
         * called here rather than left to worldMatchesSettings because the
         * craft is session lived and the world is not.
         */
        syncCraftScale();
        /*
         * AND THE TRACK, because the seats are one per class and the new one
         * may be empty. A pilot who chooses the whoop having never built a
         * room used to get the whoop hovering in an empty paddock: the world
         * is the seated track, and there wasn't one.
         *
         * So the same cold start adopt the boot does runs again for the class
         * being moved to, which fetches the most flown ROOM off the board and
         * seats it. It is deliberately fire and forget: the swap must not
         * wait on a network, the world below rebuilds from what is seated
         * now, and syncWorld runs again when the fetch lands. A board that is
         * down or has no track of this class leaves the pilot exactly where
         * this used to leave everyone, which is the honest fallback.
         */
        const wantCls = airframeById(runAirframe).trackClass;
        /* Any freestyle world, not only the town: a pilot seated on Your
         * map has no race track to be missing, and adopting one here would
         * move them off the map they chose. */
        if (mapById(s.map).mode !== 'freestyle' && !hasFlyableTrack()) {
          adoptMostFlownTrack(wantCls).then((got) => {
            if (!got) {
              return;
            }
            ui.settings.map = 'custom';
            ui.renderMenu();
            if (!worldMatchesSettings()) {
              syncWorld();
            }
          }).catch(() => {
            /* A board that is down is not an error a pilot changing aircraft
             * needs to hear about. */
          });
        }
      }
    }
    /*
     * THE AIR, OUTSIDE THE BETWEEN-RUNS BLOCK ON PURPOSE.
     *
     * See the note at runWeight: this is the one physics setting with a
     * control on the flight screen, and it is there so the pilot can feel it
     * arrive. Waiting for the next run would make the slider a promise
     * instead of a knob.
     *
     * What it costs is paid on the lap rather than hidden: a lap the change
     * lands inside was flown on two different aircraft and is voided, which
     * is the same bookkeeping a gate frame strike gets and shows up the same
     * way on the results screen. Between laps, on the start line, or in
     * freestyle, nothing is interrupted.
     *
     * Guarded because an older dist/sim.wasm predates the export, same as
     * the flight style and the airframe. On such a build the slider moves and
     * the plant does not, so the guard also holds the shell's own idea of the
     * run's air at stock: a record must not be filed under an air the module
     * never flew.
     */
    {
      /* Against the run's airframe, whose top is the one the module has to
       * take: the whoop's is 120, because 125 of its base is over 2.5. */
      const wantWeight = clampWeight(s.weight, runAirframe);
      /*
       * The scale follows the airframe as well as the slider, because the
       * base lives on the airframe entry; and the test is on the SCALE, not
       * the weight, so the boot time disagreement between the module's 1.0
       * and the shell's normal is seen, and so an airframe swap that moved
       * the base would be too. The airframe itself only changes between
       * runs, above, so this cannot swap the plant under a lap.
       */
      const wantScale = gravityScaleFor(wantWeight, runAirframe);
      if (wantScale !== runGravityScale) {
        if (typeof sim.e.sim_set_gravity === 'function'
          && sim.e.sim_set_gravity(wantScale) === SIM_OK) {
          /*
           * NOT gated on mode, and the first version was. The slider sits
           * below the pause panel, dimmed but uncovered, so it can be dragged
           * while paused; with `mode === 'flight'` in this test a pilot who
           * paused mid lap, dragged it and resumed finished a lap flown under
           * two gravities that was never voided and then filed under the new
           * key. A running lap is a running lap whichever screen is over it.
           * Title and results have no lap, because reset clears one, so the
           * boot time push of a stored value cannot void anything.
           */
          const midLap = race.currentLapMs(simTimeMs) != null;
          runWeight = wantWeight;
          runGravityScale = wantScale;
          if (midLap) {
            race.noteChange();
          }
        } else {
          ui.settings.weight = runWeight;
          ui.paintAir();
        }
      } else {
        runWeight = wantWeight;
      }
      /* And the slider follows, because an airframe swap can move its top
       * and pull a stored weight down to it. */
      ui.paintAir();
      /* The race stamps the next lap with it. After the void above, so the
       * lap the change landed in is thrown away under the old weight and
       * the next one is counted under the new. At boot this is the first
       * time the race hears it, before anything can be flown. */
      race.setWeight(runWeight);
    }
    /*
     * FLIGHT FEEL TUNING: AIR GRIP AND MOTOR POWER, on the Weight's rule and
     * straight after it, for the same reason (read the note at runWeight).
     * They apply at once, and a lap the change lands inside is voided,
     * because a lap flown on two different quads is not a lap flown on
     * either. Between laps, on the start line, or in freestyle, nothing is
     * interrupted.
     *
     * THE STOCK RULE, which is the whole safety of the feature: what is wanted
     * is effectiveTune(s), and with the mode off that is the aircraft's
     * default whatever is stored, so a pilot who never turns it on, or turns
     * it on and touches nothing, flies the quad that ships. Since 2026-10-21
     * that default is not 1.0 on every scale (TUNE_DEFAULTS in
     * src/share/tune.js: the five inch's Air grip is 110, the whoop's Motor
     * power 90), so it is one call when the aircraft is seated and none after.
     * The test is on the SCALE, so equal means no call at all.
     *
     * Guarded because an older dist/sim.wasm predates the export. On such a
     * build the slider moves and the plant does not, so the guard also puts
     * the stored value back to what the module is flying: a record must not
     * be filed under an air or a motor the module never flew.
     */
    {
      const want = effectiveTune(s);
      const wantAir = airScaleFor(want.airGrip);
      const wantKv = kvScaleFor(want.motorKv);
      let moved = false;
      if (wantAir !== runAirScale) {
        if (pushTune('sim_set_air', wantAir)) {
          runAirGrip = want.airGrip;
          runAirScale = wantAir;
          moved = true;
        } else {
          s.airGrip = runAirGrip;
        }
      }
      if (wantKv !== runKvScale) {
        if (pushTune('sim_set_motor_kv', wantKv)) {
          runMotorKv = want.motorKv;
          runKvScale = wantKv;
          moved = true;
        } else {
          s.motorKv = runMotorKv;
        }
      }
      /*
       * PROP WASH, on the sliders' rule rather than the flight style's: it
       * lands at once, mid run included, because a pilot who has just felt
       * the shake and switched it off wants to feel the difference now. The
       * lap it landed in is voided below like a slider's, so no lap is
       * counted half on one machine. Guarded because an older dist/sim.wasm
       * predates the export; on such a build the row goes back to On, which
       * is what that module flies.
       */
      const wantWash = s.propwash !== false;
      if (wantWash !== runWash) {
        if (typeof sim.e.sim_set_propwash === 'function') {
          sim.e.sim_set_propwash(wantWash ? 1 : 0);
          runWash = wantWash;
          moved = true;
        } else {
          s.propwash = runWash;
        }
      }
      if (moved) {
        if (race.currentLapMs(simTimeMs) != null) {
          race.noteChange();
        }
        /* Motor power moves where hover sits on the stick, and the keyboard's
         * throttle springs back to it: see syncKeyHover. */
        syncKeyHover();
      }
      /* Stamped on every lap counted from here on, after the void above, so
       * the lap the change landed in is thrown away and the next is counted
       * under the new machine. */
      race.setTuned(offStock());
      /* What the airtime is filed under from here on: the combination the
       * module is flying, and only while the mode is on and something is off
       * stock. Weight counts, because it is one of the three the question is
       * about, but only inside the mode: a pilot who never turned tuning on
       * is never asked. */
      if (s.feelTuning && (runWeight !== WEIGHT_STOCK || offBoardTune(runAirGrip, runMotorKv, runAirframe))) {
        tuneLogKey = tuneKey(runAirframe, runWeight, runAirGrip, runMotorKv);
        tuneLogMeta = {
          airframe: runAirframe,
          weight: runWeight,
          airGrip: runAirGrip,
          motorKv: runMotorKv,
          gravityScale: runGravityScale,
        };
      } else {
        tuneLogKey = '';
        tuneLogMeta = null;
      }
      ui.paintAir();
    }
    /*
     * 3D MODE, MID RUN, on the tune's rule rather than the flight style's.
     * The owner, 2026-10-21: "turning 3d mode off while in a session does not
     * turn 3d mode off". It waited for the next run or a Restart, so a pilot
     * who paused, switched it and resumed was still flying the machine they
     * had switched away from. The controller takes 3D at a reset and only
     * there, so a change during a run IS that reset: the quad goes back on
     * the start line, as a tune or a PID change puts it, and the row says
     * so. On the title nothing is flying and fly's own reset applies it.
     * Through whenConfigReady for the reason fly and restart are: a tune
     * swap in flight would sim_init under it.
     */
    if ((mode === 'flight' || mode === 'paused') && (s.mode3d === true) !== run3d) {
      whenConfigReady(() => {
        if ((mode === 'flight' || mode === 'paused') && (ui.settings.mode3d === true) !== run3d) {
          reset();
        }
      });
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
     *
     * Or a change of AIRCRAFT under Your edits: each aircraft has its own
     * dump under the one id, so the id stays 'custom' while the dump that
     * should fly changes. See dumpFor.
     */
    /* Or a tune from the board rewriting Your edits' dump under the same id
     * and aircraft: forget whose dump is loaded, so it is loaded again. */
    if (ui.tuneDumpChanged) {
      ui.tuneDumpChanged = false;
      if (s.tune === 'custom') {
        dumpFor = null;
      }
    }
    if (s.tune !== menuTune || (s.tune === 'custom' && dumpFor !== s.airframe)) {
      menuTune = s.tune;
      configLoadWait = swapTune(s.tune).catch((e) => {
        console.error(e);
      });
    }
    /*
     * Rates are part of the config text, so changing one re-inits the module.
     * Compared as the CLI text the profile emits rather than field by field,
     * so a change to any of the eleven fields, the rates type included, is
     * one string comparison and none of them can be forgotten here.
     *
     * IT DOES NOT RESET THE RUN, and that is the difference between this
     * branch and the tune and PID branches around it. A tune changes the
     * MACHINE and a lap flown half on each is not a lap. Rates change the
     * PILOT: how far their sticks go. The owner asked for the change to be
     * flyable mid run, and the request is right, because tuning stick feel
     * means tuning it against a corner and you cannot do that if every nudge
     * costs the lap. So the module is re-inited and the craft is put back
     * where it stood by reseatAfterConfigSwap, which also says what it
     * cannot carry across.
     *
     * The record key still changes, because recordKey hashes the whole
     * composed config and the rates are in it. A lap flown across a rate
     * change is therefore compared against its own key and not against the
     * old one's best, which is the protection reset() used to provide by
     * throwing the lap away. Keeping the lap and keying it honestly is the
     * better half of that trade.
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
      /* Read BEFORE the init that zeroes it. */
      const before = readState();
      if (sim.init(nextText) === SIM_OK) {
        ratesText = nextRates;
        configText = nextText;
        race.setRecordKey(recordKey());
        ui.setBest(race.bestMs, view.mode);
        reseatAfterConfigSwap(before);
      } else if (sim.init(configText) === SIM_OK) {
        /* Back to the config that worked, and put the craft back on it. The
         * failed attempt moved the module underneath the craft, and a
         * refused rate change should cost a pilot nothing at all, so this
         * re-seats rather than resetting too. */
        reseatAfterConfigSwap(before);
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
    applyRaceLine(s);
    applyGuidance(s);
    /* Last, after the weight, the aircraft, the pack and the rates above
     * have all settled on what the run is flying. */
    syncKeyHover();
    syncAngleMode();
  }

  /*
   * Load a different tune. Same path a dropped file takes: fetch the diff,
   * hand the text to sim_init, and reset. A failed fetch or a diff the
   * module rejects puts the old tune back rather than leaving the shell
   * flying something nobody chose, and says so.
   */
  async function swapTune(id, fallen = false) {
    const entry = tuneById(id);
    /* Bump first so switching back to the already loaded tune cancels an
     * in-flight fetch of a different one. The old early return before the
     * bump is how "off a tune and back" loaded the other tune anyway. */
    const gen = bumpConfigGen();
    if (entry.id === configId && (entry.id !== 'custom' || dumpFor === ui.settings.airframe)) {
      return;
    }
    /*
     * Where a failure below leaves the pilot: on the config that was flying,
     * named back into the menu. Except when that config is ANOTHER
     * AIRCRAFT'S DUMP, left behind by a change of aircraft: it is not this
     * machine's to fly, so a failure loads this aircraft's default tune
     * instead, and loads it rather than only naming it, or the menu would
     * say one tune while the module flew the other machine's. Once: if that
     * load fails as well (a fetch with no network) the menu is put back on
     * what is flying, and the next change of a setting tries again, rather
     * than this retrying a fetch that cannot land for as long as it fails.
     */
    const stranded = !fallen && configId === 'custom' && dumpFor !== ui.settings.airframe;
    const fallBack = () => {
      if (!stranded) {
        ui.settings.tune = configId;
        return undefined;
      }
      ui.settings.tune = airframeById(ui.settings.airframe).defaultTune;
      menuTune = ui.settings.tune;
      return swapTune(ui.settings.tune, true);
    };
    let text;
    if (entry.id === 'custom') {
      /* The pilot's saved dump, from storage rather than a fetch. The row
       * only offers it while the dump exists, but a second tab can clear
       * storage under a first, so absence still has to be survivable. */
      text = seatedFcDump();
      if (text == null) {
        notice = { text: 'No saved Flight controller edits to fly.', untilMs: performance.now() + 3200 };
        return fallBack();
      }
    } else {
      try {
        text = new TextDecoder().decode(await fetchBytes(tunePath(entry.id)));
      } catch (e) {
        if (!isLiveConfigLoad(gen)) {
          return;
        }
        notice = { text: `${entry.name} could not be loaded.`, untilMs: performance.now() + 3200 };
        console.error(e);
        return fallBack();
      }
    }
    if (!isLiveConfigLoad(gen)) {
      return;
    }
    /* The NEW tune's own PID adjustment, not the old one's: the adjustment
     * is keyed by tune id, and carrying the old block across would fly one
     * tune with another tune's sliders. */
    const nextPids = pidsDiffFor(ui.settings.pids, entry.id);
    const nextText = composeConfig(text, ui.settings.rates, RATES_KEEP, nextPids);
    const code = sim.init(nextText);
    if (code !== SIM_OK) {
      sim.init(configText);
      adoptSimClock();
      reset();
      publishPids();
      notice = { text: `${entry.name} could not be read.\n${configFault(code)}`, untilMs: performance.now() + 3600 };
      return fallBack();
    }
    configId = entry.id;
    dumpFor = entry.id === 'custom' ? ui.settings.airframe : null;
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

  /* The run's board row with the kinds of lap it was, for the Upload row and
   * the pending record. Practice never reaches the results screen. */
  function boardRowTagged(withPractice = false) {
    const row = race.boardRow();
    if (!row) {
      return null;
    }
    return {
      ...row,
      tags: [
        ...(runStyle === 'arcade' ? ['arcade'] : []),
        ...(withPractice && runLaps === PRACTICE_LAPS ? ['practice'] : []),
        ...(row.tuned ? ['tuned'] : []),
      ],
    };
  }

  async function submitBoardTime() {
    if (replayMode) return;
    /* EVERY LAP POSTS, TAGGED. An arcade lap, a practice lap and a lap on
     * tuned Air grip or Motor power used to be refused here, because a
     * leaderboard where they mix with plain laps is not a leaderboard. The
     * owner's ask of 2026-10-16 was "open up all laps, but give them tags":
     * the board keeps them all, ranks on the clock as ever, and prints the
     * kind beside the pilot (TIME_TAGS in the board's src/validate.js). */
    /*
     * THE WEIGHT IS NOT REFUSED, IT IS SENT. A lap flown off 100 is a lap on
     * a quad that hovers, climbs and drops differently, and it used to be
     * kept off the board for that, because the board had nowhere to say so.
     * It does now (normaliseWeight in the board's src/validate.js), and the
     * owner asked on 2026-09-27 to post a time whatever the slider is at, so
     * the lap goes up with its weight and the board prints it beside the
     * pilot. The weight is the LAP's, stamped when it was counted, not the
     * slider's as it stands now: see boardRow in src/game/race.js.
     */
    let listing = inspectCourse();
    /*
     * A TRACK NOT ON THE BOARD YET (A BUILDER TRACK, A COPY) OR ONE WHOSE
     * LAYOUT HAS MOVED ON FROM THE BOARD'S COPY IS PUBLISHED OR UPDATED HERE,
     * with the same dialog the Publish row opens, and the lap goes up right
     * after. Only with a lap in hand: a practice run or a run of tuned laps
     * has nothing to send, and publishing a track for nothing is not what
     * the pilot pressed. A pilot who dismisses the dialog changes nothing.
     */
    const lapInHand = race.boardRow() != null;
    if (listing && !listing.canPostTime && lapInHand
      && (listing.canPublishNew || (listing.canUpdateListing && listing.layoutDrift))) {
      if (!(await submitCoursePublish())) {
        return;
      }
      listing = inspectCourse();
    }
    const trackId = listing && listing.shareId;
    if (!trackId || !listing.canPostTime) {
      notice = { text: listing && listing.layoutDrift
        ? 'Update this track on the board before posting a time.'
        : 'This track is not on the public board yet.', untilMs: performance.now() + 2800 };
      return;
    }
    /* race owns what a record lap is. This used to re-filter and re-min
     * the log beside it, which is the same answer until one of them
     * changes its mind about a voided lap.
     *
     * A practice run offers its best lap like any other, tagged practice
     * below. A lap still pending from an earlier run on this track can go
     * up too, with the tags it was flown under. */
    const practice = runLaps === PRACTICE_LAPS;
    const fromRun = race.boardRow();
    const pending = readPendingTime();
    const held = pending && pending.trackId === trackId ? pending : null;
    const fastest = fromRun != null ? fromRun.lapMs : (held ? held.lapMs : null);
    /*
     * The RaceGOW metric travels with the lap, from whichever of the two the
     * lap itself came from, so an upload from a later visit carries what the
     * run it came from actually did. Null on the sixty metre field, which is
     * scored on one lap and always will be.
     */
    const threeFrom = view.trackClass === 'micro'
      ? (fromRun != null ? fromRun.threeMs : (held ? held.threeMs : null))
      : null;
    /*
     * And the weight, from the same one. A pending lap from a build before
     * the pending record carried one was flown when only 100 could be
     * posted, so it reads as 100, which is what that build would have sent.
     * Clamped against no airframe, the widest band: the pending lap may have
     * been flown on the other aircraft, and the whoop's top of 120 would pull
     * a five inch lap at 140 down to a number it was not flown at.
     */
    const weight = fromRun != null
      ? clampWeight(fromRun.weight ?? runWeight, null)
      : clampWeight(held && held.weight != null ? held.weight : WEIGHT_STOCK, null);
    /* What kind of lap it is: from this run when it has one, else what the
     * pending lap was flown under. */
    const tags = fromRun != null
      ? [
        ...(runStyle === 'arcade' ? ['arcade'] : []),
        ...(practice ? ['practice'] : []),
        ...(fromRun.tuned ? ['tuned'] : []),
      ]
      : (held && Array.isArray(held.tags) ? held.tags : []);
    if (fastest == null) {
      notice = { text: 'No clean lap to post.', untilMs: performance.now() + 2800 };
      return;
    }
    let name = readPilotName();
    if (!name) {
      /* The names already on this track's board, read while the pilot
       * types, so the dialog can say when a new name is another spelling
       * of one of them (MENUS-PLAN.md 3.4). A board that does not answer
       * costs the hint and nothing else. */
      const known = fetchTrackTimes(trackId, listing.board || undefined)
        .then((times) => times.map((t) => t.name))
        .catch(() => []);
      name = await ui.askName({
        title: 'Your name',
        detail: 'A time on the public board needs a name. It stays in this browser.',
        known,
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
    /*
     * THE LAP GOES UP UNDER WHATEVER ID THE BOARD HOLDS THIS TRACK AT NOW.
     *
     * A seat remembers the id it was written with, and a track taken off the
     * board and put back gets a new one: scripts/boardpresets.js --replace
     * does exactly that, and so does an admin removal. Every browser holding
     * the old seat is then pointing at an id the board has never heard of,
     * and the pilot gets "That track is not on the board." on a lap they
     * just flew, with the screen above still telling them the track IS on
     * the board. That is the dead end this reaches around, and it was
     * reported from the seat on a shipped RaceGOW room.
     *
     * Only on a 404, and only once. Every other failure is the board saying
     * something the pilot needs to read rather than something to work
     * around, and a retry loop on an upload is how a board ends up with the
     * same lap twice.
     */
    let trackIdNow = trackId;
    let boardNow = listing.board;
    let healed = '';
    const send = () => postTime({
      trackId: trackIdNow,
      name,
      lapMs: Math.round(fastest),
      threeMs: threeFrom,
      ghost,
      weight,
      tags,
      origin: boardNow,
    });
    try {
      let posted;
      try {
        posted = await send();
      } catch (e) {
        if (e && e.status === 404 && listing.doc) {
          const twin = await findBoardTwin({
            doc: listing.doc,
            name: listing.name,
            trackClass: view.trackClass,
            origin: listing.board,
          });
          if (!twin.found) {
            throw new Error(twin.sameName
              ? `The board's copy of ${twin.sameName.name} is a different layout, so this lap does not belong on it.`
              : 'That track is no longer on the board, and nothing on it matches this layout.');
          }
          /* Re-seat before the retry, so the next lap and every screen that
           * reads the seat are on the live listing too rather than healing
           * the same dead id again. */
          writeShareImport(twin.found);
          ui.setShare({
            id: twin.found.id,
            name: twin.found.name,
            author: twin.found.author,
            board: twin.found.board,
          });
          trackIdNow = twin.found.id;
          boardNow = twin.found.board;
          healed = ' The board had republished this track, so the seat was updated.';
          posted = await send();
        } else {
          throw e;
        }
      }
      writePostedBest(trackIdNow, fastest);
      /* Under the id it was stored against, which is the one the pilot flew
       * it on, and under the live one too when the seat moved: a pending lap
       * left behind a heal would be offered for upload again forever. */
      clearPendingTime(trackId);
      if (trackIdNow !== trackId) {
        clearPendingTime(trackIdNow);
      }
      const rank = posted.rank != null ? ` Rank ${posted.rank}.` : '';
      const withGhost = ghost ? ' Ghost attached, ready to be chased.' : '';
      const atWeight = weight !== WEIGHT_STOCK ? ` Marked Weight ${weight}%.` : '';
      /* A RaceGOW time on the board is the three lap total. A run that
       * never put three clean laps together is stored and not ranked, and
       * the notice says so rather than quoting a lap the sheet will not show. */
      const roomTime = view.trackClass === 'micro' && Number.isFinite(threeFrom) ? threeFrom : null;
      notice = {
        text: view.trackClass === 'micro' && roomTime == null
          ? `Posted ${name}'s lap, ${formatTime(fastest)}.${atWeight} A RaceGOW time on the board is three laps in a row, and this run does not have that yet.${healed}`
          : `Posted ${name}, ${formatTime(roomTime != null ? roomTime : fastest)}.${rank}${atWeight}${withGhost}${healed}`,
        untilMs: performance.now() + 3600,
      };
      ui.markTimePosted(posted);
    } catch (e) {
      notice = { text: `Could not post that time.\n${e.message ?? e}`, untilMs: performance.now() + 3600 };
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
    const summary = score.summary();
    /*
     * THE COUNTER'S LOCAL BEST. The board is posted the trick scorer's total
     * (summary.total); the counter's, summary.counter, is kept as this
     * browser's best on this map (src/game/counterbest.js), filed under the
     * map's STF key as its stamp is. A run that used the harness hooks is
     * not a flown run and sets nothing. The results page reads the three
     * fields added here.
     */
    const bestKey = view.egg && view.egg.key ? view.egg.key : view.id;
    const before = readCounterBest(bestKey);
    summary.counterBestBefore = before ? before.points : 0;
    if (summary.timed && !summary.assisted) {
      const kept = writeCounterBest(bestKey, summary.counter);
      summary.counterBest = kept.best;
      summary.counterImproved = kept.improved;
    } else {
      summary.counterBest = summary.counterBestBefore;
      summary.counterImproved = false;
    }
    /* The weight the run's tricks were landed at, for the results row: the
     * board labels a run with it, and a run landed at two has none. */
    summary.weight = clampWeight(trickWeight ?? runWeight, null);
    summary.weightMixed = trickWeightMixed;
    /* A trick landed off the stock air or motors keeps the whole run off the
     * public board, and the results row says so. See noteTrickWeight. */
    summary.tuned = trickTuned;
    /* Flown on the other quad from the one the map was built for (the quad
     * picker, the owner, 2026-10-28): practice, as it is on a race track,
     * and kept off the board, which shows no aircraft beside a run. */
    summary.otherQuad = WORLD_SCALE !== 1;
    summary.flownOn = runAirframe;
    ui.showFreestyleResults(summary);
  }

  async function submitFreestyleRun() {
    const summary = score.summary();
    /*
     * A BUILT MAP HAS NO PLACE ON THE BOARD YET. The board files a run under
     * its map's id, and Your map is a different place for every pilot who
     * has built one, so a run posted from it would sit on one table beside
     * runs flown somewhere else entirely. Refused here, first, so the pilot
     * is not walked through the other refusals to reach this one.
     *
     * The results row is greyed on a built map with the same reason
     * (BUILT_OFF_BOARD in src/ui/ui.js), because a refusal belongs on the
     * row before it is pressed and not in a notice after. This stays as the
     * backstop for a press that reaches it some other way, a harness hook
     * included.
     */
    if (view.id === 'built') {
      notice = {
        text: 'A map you built is different for every pilot, so its runs stay off the public board.',
        untilMs: performance.now() + 4200,
      };
      return;
    }
    /* Nor for Nick Burns' house, which the board keeps no table for:
     * HOUSE_OFF_BOARD in src/ui/ui.js says so on the row. */
    if (view.id === 'house') {
      notice = {
        text: "The board keeps no runs for Nick Burns' house, so its runs stay here.",
        untilMs: performance.now() + 4200,
      };
      return;
    }
    /* Nor for Heads' house, the same way: HEADS_OFF_BOARD in src/ui/ui.js. */
    if (view.id === 'heads') {
      notice = {
        text: "The board keeps no runs for Heads' house, so its runs stay here.",
        untilMs: performance.now() + 4200,
      };
      return;
    }
    /* Nor for Joshua Bardwell's house: BARDWELL_OFF_BOARD in src/ui/ui.js. */
    if (view.id === 'bardwell') {
      notice = {
        text: "The board keeps no runs for Joshua Bardwell's house, so its runs stay here.",
        untilMs: performance.now() + 4200,
      };
      return;
    }
    /* Nor for Drift Matsuri: DRIFT_OFF_BOARD in src/ui/ui.js. */
    if (view.id === 'drift') {
      notice = {
        text: 'The board keeps no runs for Drift Matsuri, so its runs stay here.',
        untilMs: performance.now() + 4200,
      };
      return;
    }
    /* Nor for Thomas More's Shop: WAREHOUSE_OFF_BOARD in src/ui/ui.js. */
    if (view.id === 'warehouse') {
      notice = {
        text: "The board keeps no runs for Thomas More's Shop, so its runs stay here.",
        untilMs: performance.now() + 4200,
      };
      return;
    }
    /* Nor for the goat map: GOATS_OFF_BOARD in src/ui/ui.js. */
    if (view.id === 'goats') {
      notice = {
        text: 'The board keeps no runs for 90%er goat herding, so its runs stay here.',
        untilMs: performance.now() + 4200,
      };
      return;
    }
    /* Nor for Sunnyfield: SUNNY_OFF_BOARD in src/ui/ui.js. */
    if (view.id === 'sunny') {
      notice = {
        text: 'The board keeps no runs for Sunnyfield, so its runs stay here.',
        untilMs: performance.now() + 4200,
      };
      return;
    }
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
    /*
     * AND THE WEIGHT, WHICH IS LABELLED NOW RATHER THAN REFUSED, on the
     * argument that let the arcade style onto this board: a reader can see
     * what a row was flown on. It used to be refused, because a row from 140
     * percent would have sat beside a stock row looking identical; the board
     * carries the weight on every row now and prints it beside the pilot.
     *
     * One case is still refused, and it is not about the number: a run whose
     * tricks landed at two weights has no one weight to be labelled with,
     * because in freestyle the slider voids nothing. The results row greys
     * itself for the same reason (weightMixed, endFreestyleRun), so this is
     * the backstop for a press that reaches it some other way.
     */
    if (trickWeightMixed) {
      notice = {
        text: 'The weight changed during this run, so it has no one weight to go on the board with.\nFly it again at one weight.',
        untilMs: performance.now() + 4200,
      };
      return;
    }
    /*
     * AND A RUN FLOWN ON THE TUNED AIR OR MOTORS IS NOT POSTED. Weight is
     * labelled on the board; Air grip and Motor power are not, so a run
     * landed on them would sit beside stock runs looking identical. The
     * results row greys itself for the same reason (summary.tuned,
     * showFreestyleResults), so this is the backstop for a press that
     * reaches it some other way.
     */
    if (summary.tuned || trickTuned) {
      notice = {
        text: 'Tricks landed on Air grip or Motor power off 100 stay off the public board.\nSet both back to 100 and fly it again.',
        untilMs: performance.now() + 4200,
      };
      return;
    }
    /*
     * AND A RUN ON THE OTHER QUAD. The board prints no aircraft beside a
     * run, so a whoop's run in the town would sit among the five inches'
     * looking like one of them, which is the tuned rule's reason again. The
     * results row greys itself for it (otherQuad, endFreestyleRun); this is
     * the backstop.
     */
    if (WORLD_SCALE !== 1) {
      notice = {
        text: 'This board is for the quad this map was built for.\nA run on the other one stays here.',
        untilMs: performance.now() + 4200,
      };
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
        weight: clampWeight(trickWeight ?? runWeight, null),
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
      return false;
    }
    if (!listing.canPublishNew && !listing.canUpdateListing) {
      notice = { text: 'This track is already on the public board.', untilMs: performance.now() + 2800 };
      return false;
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
      return false;
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
      /*
       * A ROOM'S CARD ON THE BOARD IS A LAP OF IT, AND ONLY A BROWSER CAN
       * DRAW ONE. The board has no WebGL and never will, so if this is not
       * done here it is not done. The builder's Publish does exactly the
       * same thing through the same file; this is the other way a room can
       * reach the board.
       *
       * A field track returns skipped and costs nothing, not even the
       * import: sendCardAnimation asks the class before it loads anything.
       * Nothing here throws, so a refused GL context leaves the pilot with
       * a published track and a plan on its card.
       */
      const card = await sendCardAnimation(result.doc, { origin: listing.board });
      if (!card.skipped) {
        notice = {
          text: card.error
            ? `Published "${result.posted.name}". Its card animation could not be sent.`
            : `Published "${result.posted.name}", and its card on the board is a lap of it.`,
          untilMs: performance.now() + 4000,
        };
      }
      /* Only when the lap on the results screen was flown on the course that
       * was just published. Publishing course B with course A's results still
       * up used to attach A's lap to B, because resultsFastest is a bare
       * number with no course attached to it. */
      if (ui.resultsBoard && ui.resultsDocId != null && ui.resultsDocId === listing.doc.id) {
        writePendingTime({
          trackId: result.posted.id,
          lapMs: ui.resultsBoard.lapMs,
          threeMs: view.trackClass === 'micro' ? ui.resultsBoard.threeMs : null,
          weight: ui.resultsBoard.weight,
          tags: ui.resultsBoard.tags,
        });
      }
      /*
       * THE SHARE CARD: the picture a link to this track shows when it is
       * posted, drawn here for the reason the room's animation is drawn
       * above. Every track gets one, a field included. Last, after the
       * pending time is written, because it takes a few seconds and a
       * pilot who closes the tab in them should lose the picture rather
       * than the lap.
       *
       * Imported here rather than at the top, so the boot graph does not
       * carry it (scripts/gen-preload.js) and a pilot who never publishes
       * never fetches it. Nothing in it throws.
       */
      const { sendShareCard } = await import('./share/card.js');
      const shared = await sendShareCard({
        kind: 'track',
        id: result.posted.id,
        board: listing.board,
        editKey: readEditKey(result.posted.id),
      });
      if (shared.error) {
        notice = {
          text: `Published "${result.posted.name}". Its share picture could not be sent, so a link to it shows the WebFPV card for now.`,
          untilMs: performance.now() + 4000,
        };
      }
    } catch (e) {
      notice = { text: `Could not publish that track.\n${e.message ?? e}`, untilMs: performance.now() + 3600 };
      return false;
    }
    return true;
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
   * becomes the seated aircraft's "custom" tune (writeFcDump in
   * src/fc/dump.js, one dump per aircraft), and the PIDs screen's
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
    if (!writeFcDump(ui.settings.airframe, body)) {
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
    dumpFor = ui.settings.airframe;
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
  ui.flightModeKey = flightModeSetting;
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
   * A HANDFUL OF LINES PER KIND OF PLACE, FIRED BY WHAT THE PILOT DOES, not
   * by a clock: a five inch race track, a whoop room and a freestyle world
   * each get theirs once, at the first launch into that kind, by any door
   * (see src/ui/firstflight.js for the words and for why it starts at launch
   * and not on a menu row). The banner already carries the launch prompt and
   * the lap splits, and the guide arrows are already painted on the grass, so
   * a first run needs nothing new: it needs the sentences that carry somebody
   * from a hover to a gate, or from a hover to a flip, and then it needs to
   * get out of the way.
   *
   * It retires itself. Once a lap is on the board, or three gates are behind
   * them, the pilot is flying and the lap splits are the more useful message;
   * a freestyle world has no gates, so it retires on airtime. Retiring here
   * rather than on a timer means a slow first lap is never cut off mid
   * prompt and a fast one is never nagged.
   */
  /*
   * THE FIRST FLIGHT TOLD EVERY PILOT TO PRESS A KEY THEY MIGHT NOT HAVE.
   *
   * These lines are the only instruction this simulator ever gives, and
   * they named the up arrow, R and Escape to a pilot who could be holding a
   * radio or a phone. A thumb pilot in landscape has no arrow key and no
   * Escape, so the one screen meant to teach the controls was describing
   * somebody else's.
   *
   * It is the same root as the feel reports that prompted this round: three
   * transducers reach this shell and the shell kept assuming one of them.
   * The device is read every frame the guide is up rather than once, because
   * a radio can be plugged in between the line that says "arrow" and the
   * line that says "stick". The words are rebuilt only when the step, the
   * device, the stick mode or the flight mode changes, which is the last
   * time the pilot could have seen a different string, so a guided frame
   * builds no string: it asks the input layer who is flying, as it always
   * did, and compares five fields.
   */
  const guideMemo = {
    kind: '', step: null, device: '', stickMode: 0, angle: false, text: '',
  };
  const guideLine = (kind, step) => {
    const device = input.isTouchPrimary() ? 'touch' : (input.firstGamepad() ? 'pad' : 'keys');
    const stickMode = ui.settings.stickMode;
    const m = guideMemo;
    if (m.kind !== kind || m.step !== step || m.device !== device
      || m.stickMode !== stickMode || m.angle !== angleModeOn) {
      m.kind = kind;
      m.step = step;
      m.device = device;
      m.stickMode = stickMode;
      m.angle = angleModeOn;
      m.text = textOf(kind, step, { device, stickMode, angle: angleModeOn });
    }
    return m.text;
  };
  /*
   * The kind the armed guide is for, or '' when none is armed or the run on
   * screen is not that kind's. A guide armed for a race track must not read
   * out over a whoop room because the aircraft was changed in the pause menu
   * and the run restarted, so it says nothing while the two disagree. It is
   * hidden and not retired: ui.armGuide decides afresh at every launch from
   * the same two facts this compares, and a frame during a world swap sees
   * the old world's race for a moment, which must not use the guide up.
   */
  const guidedKindNow = (race) => {
    const kind = ui.guided;
    return kind && guideKind(race.freestyle, ui.settings.airframe) === kind ? kind : '';
  };
  const guidedPrompt = (race) => {
    const kind = guidedKindNow(race);
    if (!kind) {
      return '';
    }
    const step = stepOf(kind, {
      next: race.next,
      lapRunning: race.lapStartMs != null,
      lapDone: race.lastLapMs != null,
      airMs: airtimeMs,
    });
    if (step < 0) {
      ui.guided = false;
      return '';
    }
    return guideLine(kind, step);
  };
  /* The line a parked quad gets while a guide is armed, or '' for the usual
   * prompt. Launch control is the pilot's own switch and keeps its prompt. */
  const guidedTakeoff = (race) => {
    const kind = ui.settings.launchControl ? '' : guidedKindNow(race);
    return kind ? guideLine(kind, TAKEOFF) : '';
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
  /*
   * A published map chosen from the Freestyle room's cards. The fetch a
   * ?mapshare= link makes at boot, minus the navigation, and nothing else:
   * it hands the map back and changes nothing, because the room seats it
   * only if the pilot is still there when it arrives. onSharedMap is the
   * seating: the built world then flies it (worldDocument), or flies the
   * pilot's own again when it is handed null. Neither writes a seat, for
   * the reason adoptMapFromLocation gives: Your map is never displaced.
   */
  ui.onBoardMap = async (listing) => {
    const payload = await fetchMapDocument(listing.id, listing.board);
    const document = payload.document || payload;
    return {
      id: payload.id || listing.id,
      name: payload.name || document.name || listing.name || 'Untitled map',
      author: payload.author || listing.author || '',
      board: listing.board,
      document,
    };
  };
  ui.onSharedMap = (shared) => {
    sharedMap = shared || null;
    ui.setSharedMap(sharedMap);
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

  /*
   * THE BANNER FOR A STICK THE PILOT IS FLYING WITHOUT. The owner's ask of
   * 28 September: when a stick has not been used for long enough, help comes
   * up. input.js decides it (noteDeadChannels, missingChannels); this says it
   * once per channel per page, in flight, as the banner the shell already
   * flies its notices in, and never as anything that stops the run: the
   * pilot may be on a lap, and the one sentence names the one thing to do.
   * The pause menu and the title then carry the row that opens Stick help.
   */
  const stickNoticed = new Set();
  /* Where the calibration wizard goes when it ends: Settings, which holds
   * it, or Stick help, whose two doors into it are round trips. Set by the
   * action that opened it. */
  let calReturn = 'pilot';
  function firstUnnoticed(list) {
    if (!list) {
      return null;
    }
    for (let i = 0; i < list.length; i += 1) {
      if (!stickNoticed.has(list[i])) {
        return list[i];
      }
    }
    return null;
  }
  function noteLostSticks(sum, nowWall) {
    if (mode !== 'flight' || ui.screen !== 'flight') {
      return;
    }
    const ch = firstUnnoticed(sum.missingChannels) || firstUnnoticed(sum.deadChannels);
    if (ch) {
      stickNoticed.add(ch);
      notice = { text: lostStickNotice(ch), untilMs: nowWall + 5200 };
    }
  }

  /*
   * THE BANNER FOR A RADIO THAT IS NOT THERE, when the pilot asked for one.
   * Where the browser will not show a radio to a page (Safari, an iPhone or
   * an iPad: see radioBlind in ui/stickhelp.js) it says so, because "plug
   * one in" sent bug-616cc604's pilot through several cables and a hub, and
   * it stays up for the seconds it takes to read a browser's name and act
   * on it, which the ordinary advice never needed.
   */
  function noRadioBanner(then) {
    return {
      text: noRadioNotice(ui.stickPlatform, ui.stickBrowser, then),
      untilMs: performance.now() + (ui.radioBlind ? 6000 : 3200),
    };
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
        notice = noRadioBanner('move');
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

  /*
   * FULLSCREEN IN FLIGHT. See fullscreenFly in ui.js for why: a desktop
   * composites a window, which on many a Linux laptop is one more frame
   * between the sticks and the glass, and most desktops hand a fullscreen
   * window straight to the display.
   *
   * Asked for from the press that starts or resumes a flight, because a
   * browser grants fullscreen only to a person's own gesture; a harness or a
   * fly=1 link has none and is simply refused, which costs nothing. Only a
   * fullscreen this page asked for is given back, on the way to the title.
   *
   * Escape is the pause key and the browser's own way out of fullscreen. The
   * browser takes the press and leaves fullscreen, and leaving fullscreen
   * mid flight pauses, so the key still does what the pilot pressed it for;
   * Resume is a press, and goes back to fullscreen.
   *
   * NOT THE KEYBOARD LOCK API, which would let the page keep Escape and stay
   * fullscreen. Tried on 2026-09-27: in headless Chromium,
   * navigator.keyboard.lock(['Escape']) in fullscreen never settled, and
   * every key after it was swallowed, W and M included, which is a quad that
   * cannot be flown on the keyboard. A convenience is not worth a platform
   * where that happens for real.
   */
  let fullscreenOurs = false;
  function enterFlightFullscreen() {
    if (ui.settings.fullscreenFly === false || replayMode || document.fullscreenElement) {
      return;
    }
    const root = document.documentElement;
    if (!root || typeof root.requestFullscreen !== 'function') {
      return;
    }
    let asked = null;
    try {
      asked = root.requestFullscreen({ navigationUI: 'hide' });
    } catch (e) {
      asked = null;
    }
    if (!asked || typeof asked.then !== 'function') {
      return;
    }
    asked.then(() => {
      fullscreenOurs = true;
    }).catch(() => {
      /* No gesture, or the browser said no. The window stays a window. */
    });
  }
  function leaveFlightFullscreen() {
    if (!fullscreenOurs) {
      return;
    }
    fullscreenOurs = false;
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch(() => {
        /* Already out. */
      });
    }
  }
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      return;
    }
    const ours = fullscreenOurs;
    fullscreenOurs = false;
    if (ours && mode === 'flight' && ui.screen === 'flight') {
      ui.act('pause');
      ui.show('paused');
    }
  });

  ui.onAction = (action, s) => {
    if (s) {
      applySettings(s);
    }
    /* Before anything waits: the press is the gesture fullscreen needs. */
    if (action === 'fly' || action === 'restart' || action === 'resume') {
      enterFlightFullscreen();
    } else if (action === 'title') {
      leaveFlightFullscreen();
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
    } else if (action === 'title' && career && career.active()) {
      /* Steam edition: career. Out of a lesson to the title is out of the
       * career, with the pilot's own world back. */
      career.leave();
    } else if (action === 'title') {
      mode = 'title';
      reset();
    } else if (action === 'calibrate' || action === 'stickhelp-calibrate') {
      if (input.firstGamepad()) {
        /* Stick help's door is a round trip: see its rows in ui.js. */
        calReturn = action === 'stickhelp-calibrate' ? 'stickhelp' : 'pilot';
        input.startCalibration();
        ui.show('calibrate');
      } else {
        notice = noRadioBanner('reload');
      }
    } else if (action === 'calibrate-check' || action === 'stickhelp-check') {
      /* The check step on its own, against the mapping already saved. Same
       * door as calibrate above, and the same answer when there is nothing
       * plugged in, because a mapping with no radio behind it is nothing to
       * look at. See startCalibrationCheck in input.js. */
      if (input.startCalibrationCheck()) {
        calReturn = action === 'stickhelp-check' ? 'stickhelp' : 'pilot';
        ui.show('calibrate');
      } else {
        notice = noRadioBanner('reload');
      }
    } else if (action === 'calibrate-cancel') {
      input.cancelCalibration();
      ui.show(calReturn);
    } else if (action === 'calibrate-reverse') {
      /* No notice, for the reason on calibrate-zero-throttle below: the
       * calibrate branch of the frame loop blanks the banner every frame.
       * The feedback is the gimbal they are watching turning round under
       * the stick they are holding, which is the point of doing it here. */
      input.reverseMovingChannel();
    } else if (action === 'calibrate-stick-mode') {
      /* Settings owns the mode and writeSettings pushes it through
       * applySettings, so the keyboard, the thumb sticks and every drawn
       * gimbal follow in one place. See cycleStickMode in ui.js. */
      ui.cycleStickMode();
    } else if (action === 'calibrate-zero-throttle') {
      /* No notice. The calibrate branch of the frame loop blanks the banner
       * every frame, so one set here was never seen; the feedback is the
       * gimbal dropping to zero and the hint changing under it, which is
       * what the pilot is looking at anyway. */
      input.zeroThrottleHere();
    } else if (action === 'calibrate-skip') {
      input.skipCalibrationSelect();
    } else if (action === 'calibrate-save') {
      if (input.acceptCalibration()) {
        ui.show(calReturn);
        /*
         * The notice is decided by what localStorage actually did, not by
         * the fact that the wizard finished. See saveMap in input.js: a
         * browser in private mode, or one out of quota, throws, and this
         * used to print "saved" over the top of it.
         */
        notice = input.calResult === 'saved-unstored'
          ? {
            text: 'Mapping live, gone on reload.',
            untilMs: performance.now() + 5200,
          }
          : { text: 'Stick mapping saved.', untilMs: performance.now() + 2800 };
        input.calResult = null;
      }
    } else if (action === 'restart-switch') {
      /* The row toggles: choose it to listen for a flip, choose it again to
       * stop. See beginRestartCapture in input.js. */
      if (!input.firstGamepad()) {
        notice = noRadioBanner('reload');
      } else if (input.restartCapture) {
        input.cancelRestartCapture();
      } else {
        input.beginRestartCapture();
      }
    } else if (action === 'autoreset-switch') {
      if (!input.firstGamepad()) {
        notice = noRadioBanner('reload');
      } else if (input.autoCapture) {
        input.cancelAutoResetCapture();
      } else {
        input.beginAutoResetCapture();
      }
    } else if (action === 'autoreset-switch-clear') {
      input.clearAutoResetSwitch();
      notice = { text: 'Auto reset switch forgotten.\nThe setting stays as it is.', untilMs: performance.now() + 2800 };
    } else if (action === 'restart-switch-clear') {
      input.clearRestartSwitch();
      notice = { text: 'Restart switch forgotten.\nR on the keyboard still restarts.', untilMs: performance.now() + 2800 };
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
   * the player out of it. Quad and the title pose the airframe with the
   * sticks, so there only pitch moves the cursor; Rates, Tune, the bench and
   * Stick help use the sticks for what they show. See pollPad in ui.js.
   */
  function padNav() {
    const btn = input.padMenuButtons();
    /*
     * mapUsable rather than map.stored. A pilot who never opened the wizard
     * because their radio was already in AETR order got up and down only,
     * which is half a menu, and a red row on the front page telling them so.
     * input.js can tell a real radio's parked throttle from a wrong guess,
     * so a guess that is behaving like a radio drives the cursor the same
     * way a wizard mapping does. See noteThrottleParked.
     */
    /*
     * `calm` is whether the sticks are at rest, which a menu that opened from
     * flight waits for before it listens: see src/input/padgate.js and
     * bug-2d93629e, a pause menu that resumed itself off a radio being
     * handled.
     */
    if (input.mapUsable()) {
      const c = input.channels;
      return {
        up: c.pitch > NAV_DEFLECT,
        down: c.pitch < -NAV_DEFLECT,
        right: c.roll > NAV_DEFLECT,
        left: c.roll < -NAV_DEFLECT,
        select: btn.select,
        back: btn.back,
        calm: Math.abs(c.roll) < PAD_CALM && Math.abs(c.pitch) < PAD_CALM,
      };
    }
    const raw = input.navRaw();
    return {
      up: raw.up, down: raw.down, right: false, left: false, select: btn.select, back: btn.back, calm: raw.dev < PAD_CALM,
    };
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
      mixArg.effects = s.effectsLevel / 10;
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
    } else if (ui.settings.sound) {
      /* There is a context, and the browser may have taken it: an output
       * device that changed, a sleep, a tab put away. Every gesture asks it
       * back, which is what the comment on flyIfLinked has always said this
       * function does. bug-453fb074: without this the sound stayed gone for
       * the rest of the visit. See MotorAudio.wake. */
      audio.wake();
    }
    audio.setEnabled(ui.settings.sound);
    applyMix(ui.settings);
  }

  input.onKey = (code, repeat) => {
    wakeAudio();
    /* Here and on pointerdown, never inside wakeAudio, which a link's
     * timer also calls: the voice is opened by a gesture or not at all. */
    lapVoice.prime();
    /* A room's sheets, while one is up, and its few keys in flight
     * (src/net/together.js): 1 to 7, Q, Tab, Enter and G. */
    if (together && together.handleKey(code, repeat)) {
      return;
    }
    /* Steam edition: career. Its screens take the keys while they are up. */
    if (career && career.handleKey(code, repeat)) {
      return;
    }
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
     * The pilot's own unstick: set down on the flat surface nearest to
     * where you are, upright, run untouched. stuckTick does the same for a
     * craft left still and not upright; this is the pilot's way to ask for
     * it sooner. It refuses on the ground so it cannot be used as a free
     * reposition between laps.
     */
    if (code === 'KeyX' && ui.screen === 'flight' && mode === 'flight') {
      if (landed || launchStaging || poseLock) {
        return;
      }
      setManualFlip(false);
      setCrashflip(false);
      turtleRecover = false;
      setDownNearby('x');
      return;
    }
    /* Angle or Acro, from the keyboard. See flipFlightMode. */
    if (code === 'KeyM' && ui.screen === 'flight' && mode === 'flight') {
      flipFlightMode();
      return;
    }
    if (code === 'KeyL' && ui.screen === 'flight') {
      if (!ui.settings.launchControl) {
        notice = {
          text: 'Launch control is off.\nTurn it on in Quad, then press L on the start line.',
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
  window.addEventListener('pointerdown', () => {
    wakeAudio();
    lapVoice.prime();
  });

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
  const groundNWorld = new THREE.Vector3(0, 1, 0);
  /* The same normal with the spawn yaw taken out, ready for the plant. */
  const nWorld = new THREE.Vector3(0, 1, 0);
  const camFwd = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const qShake = new THREE.Quaternion();
  const shakeEuler = new THREE.Euler();
  const lensShake = makeLensShake();
  /*
   * STAGE F, THE MANGA LAYER'S PICTURE: speed lines, the impact frame and
   * the screentone, drawn by the freestyle maps' own grade and fxaa pass
   * (src/render/manga.js). Render only: it is handed the craft's velocity
   * after the render boundary's conversion and a camera pose, and gives
   * back uniforms and, for one beat after a crash, the pose to hold.
   */
  const manga = new MangaLayer();
  const mangaVel = new THREE.Vector3();
  const mangaCamInv = new THREE.Quaternion();
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
  /* Eased toward PARKED_LIFT while the craft is down, so the view rises off
   * the grass rather than jumping. Once the craft is up it is let go by the
   * climb and the travel, never by the clock: see liftFloorY. */
  let parkedLift = simLenToWorld(PARKED_LIFT);
  /*
   * THE VIEW DOES NOT SINK BEFORE THE CRAFT LIFTS (bug-2d0907fa, "the quad
   * starts sinking into the ground first before it gets lift"; bug-eaae5428,
   * "pushed down when taking off").
   *
   * The lift used to ease to zero, with a time constant of about 170 ms, the
   * frame `landed` went false, and `landed` goes false at TAKEOFF_THROTTLE,
   * 25 percent. The craft hovers at about 40, so a pilot rolling the throttle
   * on gently spent the gap between the two with the craft sitting on the
   * grass and the lens dropping 30 cm toward it: measured on the field with
   * the 65 mm whoop and a four second ramp, the camera went from 0.363 m to
   * 0.061 m while the plant still reported four hull points on the ground,
   * and only then climbed. The plant was never pulling anything down; the
   * picture was.
   *
   * So when the craft is released, the camera's height at that moment is
   * kept as a floor, and the lift is whatever holds the lens up to it: it
   * goes as the craft climbs, so the view only ever rises on a takeoff, and
   * it goes with horizontal travel, LIFT_TRAVEL_BLEED metres of lift per
   * metre, so a craft that skims away low does not carry a lens 30 cm over
   * its own for long. It never grows again in the air. Null while down.
   */
  let liftFloorY = null;
  let liftAnchorX = 0;
  let liftAnchorZ = 0;

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
  function sampleGroundNormal(wx, wz, fromY, cgY, out) {
    const eps = 0.35;
    const h0 = view.height(wx, wz, fromY, cgY);
    const nx = limitSlope(
      h0 - view.height(wx + eps, wz, fromY, cgY),
      view.height(wx - eps, wz, fromY, cgY) - h0,
    );
    const nz = limitSlope(
      h0 - view.height(wx, wz + eps, fromY, cgY),
      view.height(wx, wz - eps, fromY, cgY) - h0,
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
    sampleGroundNormal(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS, pProbe.y, groundNWorld);
  }

  function raiseGroundFromState(st) {
    poseFromState(st, pProbe);
    const hy = view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS, pProbe.y);
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
   * The title screen's camera. It belongs to the MAP, because the shot that
   * shows a map off is the map's business: the race field flies its own
   * racing line, the city flies its own streets, and the shell only has to
   * know which frame to ask for. Rebuilt on every swap, below.
   */
  let attractCam = makeAttractCamera(view);
  /* The lap the board would be sent from the run in progress, for the pause
   * menu's Post row: practice has no results screen, so its best lap is read
   * from the race. */
  ui.liveBoardRow = () => boardRowTagged(true);
  /*
   * The world the Freestyle room can film where it stands: which map, the
   * clip key it was built under (noteWorldClip) and how long its title
   * camera takes to fly its line once, or null mid swap and for a map from
   * the board. Asked when the room's reels start; see ui.startReels.
   */
  ui.loadedWorld = () => (mapReady && !swapInFlight && view && worldClipKey
    ? { id: view.id, key: worldClipKey, periodMs: attractCam.periodMs || 0 }
    : null);
  applySettings(ui.settings);

  const bootPick = input.takePadPickQueue();
  if (bootPick) {
    openPadPick(bootPick);
  }

  /* The spawn's placement in the world. Not fixed for the session any more:
   * the two maps start in different places, so this is re-adopted on every
   * map swap and the crash check reads whatever the current map says. It has
   * to run before the first reset, because reset seats the craft on the
   * ground at the spawn. The boot map's solids go to the plant first, as
   * adoptLoadedView does for every later one. */
  uploadPlantWorld();
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
   * WHETHER THE STICK GIMBALS ARE UP, asked in one place. The frame loop
   * draws them on this answer and the target mark parks clear of them on
   * the same answer, so the two cannot disagree. They did once: the Stick
   * overlay setting first moved only the drawing from "a keyboard pilot" to
   * "any pilot not on the thumb sticks", the mark kept parking for the
   * keyboard alone, and a radio pilot's chevron went back to landing on the
   * roll and pitch gimbal, which is the bug AIM_MARGIN_BOTTOM above records.
   * The thumb plates are the sticks, so they never get a second pair.
   */
  function stickOverlayUp() {
    return ui.settings.stickOverlay !== false && !input.isTouchPrimary();
  }

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
    if (view.setGuidance) {
      view.setGuidance(ui.settings.nextGateCue !== false);
    }
    const aim = view.targetAim ? view.targetAim() : null;
    if (!aim || !aim.active) {
      ui.setTargetLock(LOCK_OFF);
      return;
    }
    /* CSS pixels. The overlay is a DOM layer over the canvas, and the
     * drawing buffer is a different size on any display whose pixel ratio
     * is above one. From the shell's record of its last resize, not
     * clientWidth: read here, after the OSD's writes, that forced a second
     * layout of the page every frame. See cssSize in shell.js. */
    const vw = shell.cssSize.w;
    const vh = shell.cssSize.h;
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
     * moves the corner blocks to the bottom centre; the stick overlay puts
     * the gimbals there. Either way the bottom band is taller than the
     * corner instruments alone. */
    const bottomBand = (stickOverlayUp() || input.isTouchPrimary())
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
    /* In the whoop's metres in a room built MICRO_SCALE times life size,
     * like the OSD's speed and altitude (see hudLifeScale). */
    lockArg.distance = aim.distance / hudLifeScale();
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
  /* And of the last frame the Freestyle room's film drew. */
  let filmLastDraw = -1e9;

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
    /* The timer takes over here the moment the mode says so: see THE LOOP
     * SWAPS LIVE below. */
    if (timerPacesNow()) {
      timerId = setTimeout(frameTimer, timerDelay());
    } else {
      requestAnimationFrame(frame);
    }
    runFrame(nowWall);
  }

  /*
   * THE LOOP WITHOUT VSYNC: plan P3.4, shipped behind ?loop=timer on the
   * owner's ask of 2026-09-28 ("do 3 now") and, the same day, flown on the
   * owner's 60 Hz Iris Xe laptop against the plain URL (bug-c7fb5247): key
   * to screen went 80 to 64 ms at the median and 144 to 80 at the 90th,
   * with no tearing. So the win here is the humble mechanism: this Chrome
   * still presents at vsync, but a loop drawing every 8 or 10 ms hands
   * each refresh a picture milliseconds old instead of up to a whole
   * refresh old. On that result the owner made it a setting ("make it a
   * settings and default it on for low"): Settings, Screen, Frame pacing,
   * whose default follows the graphics preset, the timer exactly on Low
   * (pacingTimerOn in ui.js, where the reasons live with the setting).
   * The ?loop= URL flag still forces either loop for a session, over the
   * setting, so an A against B stays one address away.
   *
   * The delay aims the next frame at the display's period less what the
   * GPU takes (the plan's formula), floored at the 4 ms a nested timeout
   * is clamped to anyway: on the laptop this exists for, roughly a 10 ms
   * cadence. The GPU guard stays on watch exactly as under rAF, so a GPU
   * that cannot keep the cadence holds draws rather than queueing them.
   *
   * What stands down while the timer paces, because its frames say
   * nothing about the display: the display period learner (latency.js
   * would learn the timer's own cadence and report a refresh rate that
   * does not exist) and Auto graphics (its evidence is dt against the
   * display's period). Both are gated at their call sites below on the
   * live flag, so they resume the moment the display paces again. On Low
   * that parks Auto's levers while the timer runs, which is accepted:
   * there is no preset below Low for it to move to, and the Render scale
   * slider stays the pilot's. The predicted view keeps the learner's held
   * period as its horizon, a small over lead under the timer, accepted.
   * And the physics contract holds as it does under rAF: the accumulator
   * takes this loop's capped dt, and no delta reaches the integrator.
   *
   * THE LOOP SWAPS LIVE. timerLoop is set by applyLoopMode, from the URL
   * force or the setting, on boot and on every settings change, the
   * preset moves Auto makes included. Each loop hands over to the other
   * from inside its own next tick, so there is never a moment with two
   * schedulers pending: frame() re-arms rAF only while the display paces,
   * and frameTimer() re-arms the timeout only while the timer does.
   *
   * rAF stops with a hidden page; a timer does not, and Chrome throttles
   * it toward one fire a second, which would step the physics 100 ms at a
   * time while nobody watched. So the visibility listener below stops the
   * timer outright when the page hides and restarts it when it shows, and
   * the first frame back reads the same capped dt an rAF return does. The
   * mode cannot change while hidden, because every change runs through
   * applySettings, which runs from a frame or from the visible page's own
   * events.
   */
  function timerDelay() {
    const period = latency.displayPeriodMs();
    const gpu = gpuGate.state.samples >= 10 ? gpuGate.state.gpuMs : 0;
    const d = period - gpu;
    if (d >= 4) {
      return d;
    }
    /* The formula assumes the GPU beats the display's period. A GPU that
     * takes the whole period or more cannot be raced: the guard is holding
     * the draws anyway (its queue rule), and a 4 ms tick would only spin
     * the physics and the OSD flat out for frames that cannot exist, which
     * on a software rasteriser starved the whole page. Tick at the period
     * instead, exactly the cadence a display loop would have had. */
    return gpu >= period ? period : 4;
  }

  /*
   * One no-op rAF kept pending while the timer paces. The timer replaces
   * the DRAW's clock, not the page's animation clock: under the display
   * loop, the loop's own standing rAF request is what keeps the browser's
   * frame scheduler serving every other requestAnimationFrame client, and
   * with no client at all the scheduler idles and a lone request costs an
   * idle wakeup. Measured on this container's headless build: a single
   * rAF await took 202 ms under the bare timer, which turned the replay
   * check's two-rAF-per-frame lap captures from minutes into twenty. Any
   * page code awaiting a frame callback would starve the same way. The
   * callback does nothing; frameTimer re-arms it while the timer paces,
   * so the display loop never inherits a stray one. Hoisted, P8.
   */
  let rafKeep = false;
  const rafKeepAlive = () => {
    rafKeep = false;
  };

  function frameTimer() {
    /* Scheduled first, exactly as frame() does, so a thrown body does not
     * stop the loop; the display's loop takes over here the moment the
     * mode says so. */
    if (timerPacesNow()) {
      timerId = setTimeout(frameTimer, timerDelay());
      if (!rafKeep) {
        rafKeep = true;
        requestAnimationFrame(rafKeepAlive);
      }
    } else {
      timerId = 0;
      requestAnimationFrame(frame);
    }
    runFrame(performance.now());
  }

  function runFrame(nowWall) {
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
    /* Whether this frame's camera is the FPV mount the predicted view may
     * move: set by that branch below, and only by it. And whether it did. */
    predictCam = false;
    predictApplied = false;
    fpvLens = false;
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
    /* The manga layer's clock, before a crash can start its impact frame,
     * so the frame the crash is read on is the impact frame's first. */
    manga.tick(dt);
    /* What this frame's steps will tell the crash judge and the world
     * report, from nothing: see CrashJudge and readStepReport. */
    crashJudge.beginFrame();
    emptyWorldReport(frameReport);

    /*
     * The site's counters, once a frame, reading state this loop already
     * has rather than announcing anything of its own. `started` is the
     * flag the banner uses for "has this run left the ground", which is
     * exactly what a session is; `flying` is that and airborne and not
     * mid crash; `laps` is the race's own list and the module takes the
     * delta. It cannot reach the integrator: nothing below reads it, and
     * everything it does with the numbers is arithmetic and a beacon.
     * A replay is a capture, not a flight, and counts nothing, as it sends
     * no visit.
     */
    /* A TinyLaps track this tab just published draws its pictures while the craft is
     * parked, and never in flight: see picturesFor in src/share/tinylaps.js. */
    if (tinyLapsPictures) {
      tinyLapsPictures.tick(landed || mode !== 'flight', nowWall);
      if (tinyLapsPictures.done) {
        tinyLapsPictures = null;
      }
    }
    if (!replayMode) {
      flightStats.tick(nowWall, {
        started: flownThisRun,
        /* Airborne, and not on the grass upside down: a minute spent in
         * crashflip waiting to be righted is not a minute of flying, and the
         * two turtle flags are already here to say so. */
        flying: flownThisRun && !landed && !turtleWait && !turtleRecover,
        laps: race.laps.length,
      });
    }
    if (supportPrompt && (ui.screen !== supportPromptScreen || !supportPrompt.isConnected
        || ui.supportPromptBlocked(true))) {
      supportPrompt.remove();
      supportPrompt = null;
      supportPromptScreen = null;
    }

    /* The seated world's note, released on the first frame of a flight and
     * not one frame earlier. See showCourseNotes. */
    if (heldNotes && ui.screen === 'flight') {
      notice = { text: heldNotes, untilMs: nowWall + 5600 };
      heldNotes = null;
    }

    /* Which polls are flight, for the report's record of what the flight
     * measured rather than what the pause screen does: see flightRec in
     * input.js. The 2 ms timer's polls between frames read the same flag. */
    input.flying = ui.screen === 'flight' && mode === 'flight';
    input.poll(nowWall);
    /*
     * The radio's restart switch, bug-a25bc2dd: see noteRestartSwitch in
     * input.js. Taken on every frame, so a flip made in a menu is spent
     * there, and acted on only where R acts, in flight. Here, before
     * anything else in the frame reads the craft, so the frame that follows
     * flies from the start line exactly as it does after R. A capture left
     * running when the pilot leaves Settings is dropped, or the next button
     * they pressed in flight would become the switch.
     */
    if (input.takeRestart() && ui.screen === 'flight' && mode === 'flight') {
      reset();
    }
    if (autoResetDue && ui.screen === 'flight' && mode === 'flight') {
      reset();
      notice = { text: 'Auto reset.', untilMs: performance.now() + 1600 };
    }
    if (input.restartCapture && ui.screen !== 'pilot') {
      input.cancelRestartCapture();
    }
    if (input.autoCapture && ui.screen !== 'pilot') {
      input.cancelAutoResetCapture();
    }
    /* The Auto reset switch, bug-918a8c99: see noteAutoResetSwitch in
     * input.js. Taken every frame so a flip in a menu is spent there; it
     * changes the setting wherever it is made. */
    {
      const flipped = input.takeAutoResetSwitch();
      if (flipped !== null) {
        const was = Boolean(ui.settings.autoReset);
        ui.settings.autoReset = flipped === 'toggle' ? !was : Boolean(flipped);
        if (ui.settings.autoReset !== was) {
          ui.writeSettings();
          autoResetAtMs = -1;
          autoResetDue = false;
          notice = {
            text: ui.settings.autoReset ? 'Auto reset on.' : 'Auto reset off.',
            untilMs: performance.now() + 1800,
          };
          if (ui.isModal()) {
            ui.renderMenu();
          }
        }
      }
    }
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
    if (!(mode === 'flight' && !landed && !turtleParkedNow) && rcPending.length > 1) {
      rcPending.splice(0, rcPending.length - 1);
    }
    /* Hard bound, whatever else happens. */
    if (rcPending.length > 1024) {
      rcPending.splice(0, rcPending.length - 256);
    }
    /* Steam edition: career. Its display follows the screen it is over, and
     * its screens own the pad while they are up. */
    if (career) {
      career.tick(nowWall);
    }
    if (together && together.wantsPad()) {
      together.pollPad(padNav(), nowWall);
    } else if (career && career.wantsPad()) {
      career.pollPad(padNav(), nowWall);
    } else if (ui.isModal()) {
      ui.pollPad(padNav());
    }

    /*
     * A replay has no pilot, so no stick takes its craft off. It never steps
     * the plant, and unparked, the step branch below rebuilds the lap clock,
     * the one the ghost is flown on, from the plant's step index, which a
     * replay leaves at 0; the frame after parks the craft again. A held
     * throttle sent the ghost back to the start of its lap and held it
     * there, and counted the capture as a flight. beginLaunchStaging keeps L
     * out of a replay the same way.
     */
    if (mode === 'flight' && landed && !replayMode) {
      const thr = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
      if (landed && liftThrottle(thr) > TAKEOFF_THROTTLE) {
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
    balloonIdle = mode === 'flight' && ui.screen === 'flight' && (turtleParkedNow || landed || poseLock);
    if (mode === 'flight' && ui.screen === 'flight' && turtleParkedNow && !poseLock) {
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
      scoring = view.mode === 'freestyle';
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
        /* THE STICK THROUGH A STALL: see STALL_GAP_MS. A slot inside a
         * stretch the poller could not see gets the straight line from the
         * held sample to the one found after it. Only then is anything
         * allocated, and the value the stretch ends on lands on the same
         * slot it always did. */
        const after = rcPending.length > 0 ? rcPending[0] : null;
        if (after !== null && after.prevWall !== undefined) {
          const span = after.wallT - after.prevWall;
          const from = after.prevWall + wallToSim;
          if (span > STALL_GAP_MS && atMs > from) {
            const u = (atMs - from) / span;
            return {
              roll: rcHeld.roll + (after.roll - rcHeld.roll) * u,
              pitch: rcHeld.pitch + (after.pitch - rcHeld.pitch) * u,
              yaw: rcHeld.yaw + (after.yaw - rcHeld.yaw) * u,
              throttle: rcHeld.throttle + (after.throttle - rcHeld.throttle) * u,
            };
          }
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
        const stood = launchStaging;
        /*
         * Replay mode: don't step the physics, just tick time for ghost replay.
         * The ghost is driven by the replay clock, not the sim. Still advance
         * simStepIdx and simTimeMs so the frame loop functions normally.
         */
        if (replayMode) {
          simStepIdx += steps;
          simTimeMs = simStepIdx * MS_PER_STEP;
          /* Keep stateCurr and statePrev as spawn state for rendering */
        } else if (launchStaging) {
          sim.e.sim_set_ground(0, 0, 0, 1, 0, 0, 0, 0, 0);
          /* On the stand the module holds the pose and resolves no world
           * contact, so the moving solids only need to be where they end.
           * The cars' clock is set all the same: the module advances it
           * on the stand too, and the cars go on driving past it. */
          pushWorldSolids(simTimeMs + steps - 1);
          pushSails(simTimeMs + steps - 1, stateCurr);
          if (trafficOn) {
            trafficBeforeSteps();
          }
          if (steps > 1) {
            sim.step(steps - 1);
            statePrev = readState();
            if (trafficOn) {
              readVehicles(sim, carPrev);
            }
          } else {
            statePrev = stateCurr;
          }
          sim.step(1);
          stateCurr = readState();
          /* On the stand the plane flies on and the round has not begun. */
          if (balloonGame) {
            for (let t = simTimeMs + 1; t <= simTimeMs + steps; t += 1) {
              if (t % balloonMods.BALLOON_EVERY === 0) {
                balloonStep(t, stateCurr, false);
              }
            }
          }
          if (fightGame) {
            for (let t = simTimeMs + 1; t <= simTimeMs + steps; t += 1) {
              if (t % fightMods.DOGFIGHT_EVERY === 0) {
                fightStep(t, stateCurr, false);
              }
            }
          }
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
          sawGroundHit = false;
          /* Taken once, before the steps: whether the perch below may take
           * a craft at rest, which makes a ground contact a landing and not
           * a hit (see CrashJudge); and whether a crash step gets the dull
           * bounce. */
          const mayPerch = !takingOff && !turtleWait;
          const bounces = crashCanBounce();
          if (trafficOn) {
            trafficBeforeSteps();
          }
          for (let i = 0; i < steps; i += 1) {
            if (i === 0 || (i & 7) === 0 || plantUpZ(stNow) < 0.5) {
              sampleGroundNormalFromState(stNow);
            }
            const stBefore = stNow;
            raiseGroundFromState(stNow);
            /* The train and the crossing's booms, where they are at this
             * step of the lap clock. */
            pushWorldSolids(simTimeMs + i);
            /* And the windmills' sails, round where the craft starts it. */
            pushSails(simTimeMs + i, stNow);
            sim.step(1);
            stNow = readState();
            /* This step's world report and nothing else, for the crash
             * judge; folded into the frame's for everything that reads it
             * once a frame. See readStepReport. */
            const stepRep = readStepReport();
            /* The cars, at the clock this step left them at: the chase, the
             * smoke, and the pose statePrev is drawn with. */
            if (trafficOn) {
              trafficStep(simTimeMs + i + 1, stNow, i, steps, true);
            }
            if (balloonGame && (simTimeMs + i + 1) % balloonMods.BALLOON_EVERY === 0) {
              balloonStep(simTimeMs + i + 1, stNow, true);
            }
            /* The dogfight, on the same lap clock. */
            if (fightGame && (simTimeMs + i + 1) % fightMods.DOGFIGHT_EVERY === 0) {
              fightStep(simTimeMs + i + 1, stNow, true);
            }
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
            if (i === steps - 2) {
              statePrev = stNow;
            }
            const dvx = stNow[4] - stBefore[4];
            const dvy = stNow[5] - stBefore[5];
            const dvz = stNow[6] - stBefore[6];
            const dv2 = dvx * dvx + dvy * dvy + dvz * dvz;
            const groundHits = sim.e.sim_ground_contacts();
            /* The counter's gaps every step and close calls every 8 ms,
             * with this step's change of velocity for the hard contact. */
            if (scoring) {
              counterStep(simTimeMs + i + 1, stNow, dv2);
            }
            if (groundHits > 0) {
              sawGroundHit = true;
            }
            /*
             * THE STEP, JUDGED AT ITS OWN ATTITUDE: see CrashJudge. A crash
             * no longer ends the loop: see A CRASH IS A DULL BOUNCE. The
             * crash step's outcome is replaced by the dull bounce here, on
             * the step it happened, and the frame flies on from it.
             */
            const crashed = crashJudge.step(stBefore, stNow, groundHits, stepRep, simTimeMs + i + 1, mayPerch);
            if (crashed && view.judge && mode === 'flight') {
              view.judge.hear('crash', simTimeMs + i + 1);
            }
            if (bounces && (crashed || crashJudge.knock(stepRep, stNow))) {
              stNow = applyDullBounce(crashed ? crashJudge.stepKind : 'solid', stBefore, stNow, stepRep, !crashed);
              if (i === steps - 2) {
                statePrev = stNow;
              }
            }
          }
          if (steps === 1) {
            statePrev = stateCurr;
          }
          stateCurr = stNow;
        }
        /* The steps the module actually took: all of them. */
        const flown = steps;
        simTimeMs += steps * MS_PER_STEP;
        /* Airtime: only steps flown off the stand. See airtimeMs. */
        if (!stood && !replayMode) {
          airtimeMs += flown * MS_PER_STEP;
          /* And, with flight feel tuning on and a slider off stock, the same
           * sim time filed under the combination it was flown on: what the
           * end of the flight is asked about. An empty key is stock, so the
           * common frame pays for one comparison. */
          if (tuneLogKey !== '') {
            tuneLog.add(tuneLogKey, tuneLogMeta, flown * MS_PER_STEP);
          }
        }
        simStepIdx += flown;
        /* A replay steps nothing, so its frames read the cars as a frame
         * that did not step does, in trafficFrame at the replay's clock. */
        if (trafficOn && !replayMode) {
          /* The stand stepped in one call, so its smoke ticks are fed after
           * it; the loop above fed its own. */
          if (stood) {
            trafficTicks(simTimeMs);
          }
          trafficAfterSteps();
        }
        /* Launch stand constraint runs inside sim_step. Ground contact
         * runs after plant_step at 1 kHz when the plane is raised. */
        flightLog.push(stateCurr, rcHeld, plantFacts(runAirframe).fullRpm);
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
      const surf = view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS, pProbe.y);
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
        if (hits === 0 && !sawGroundHit && clearance > vHalfFrame + simLenToWorld(0.05)) {
          takingOff = false;
          lcBoost = false;
        } else if (!lcBoost) {
          const thrNow = samples.length ? samples[samples.length - 1].throttle : input.channels.throttle;
          /* TAKEOFF_RELEASE, not TAKEOFF_THROTTLE. Coming back down to the
           * same number that sent the craft up is what let one thumb
           * position sit on both sides of the latch. */
          if (liftThrottle(thrNow) <= TAKEOFF_RELEASE && hits > 0 && canPerch(tiltDeg, speed, rate)) {
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
        /* Seated on whatever the plant is resting it on: the street, or the
         * top of the box the CG is over, which the plant takes as ground
         * (src/native/world.c). view.height does not know about an ordinary
         * roof, so on one it would park the drawn craft on the street. */
        groundY = supportY(surf);
        stateCurr = readState();
        statePrev = stateCurr;
        acc = 0;
        if (typeof audio.event === 'function'
          && nowWall - groundCueAtWall >= GROUND_CUE_GAP_MS) {
          groundCueAtWall = nowWall;
          audio.event('land');
        }
        /*
         * A CLEAN SET DOWN is the one moment the invitation to help tune
         * flight feel is weighed (Ui.noteLanding, src/ui/tuneinvite.js). It
         * is called here and nowhere else, so a crash is never a landing, and
         * it reads only what the Ui kept: no storage is read, one write is
         * made. Guarded because it is optional and this is the frame: on
         * 2026-10-05 a prompt read a name that was not declared, and every
         * frame after it faulted.
         */
        yardLanded();
        try {
          ui.noteLanding({
            course: ghostCourseKey(),
            freestyle: race.freestyle,
            airMs: airtimeMs,
          });
        } catch (err) {
          console.error('tune invitation', err);
        }
      }
      if (crashJudge.hit) {
        /*
         * The ground's hit, a smack of GRAZE_SPEED_MAX or more, judged by
         * crashJudge at the step it happened, BOUNCE_COOLDOWN_MS of sim clock
         * after the last contact it judged, so a slide is one bounce and not
         * one a step. Both numbers are that step's: its closing speed and its
         * speed going in, never the END OF FRAME total speed, which no
         * contact in the frame need ever have had (a frame that brushed the
         * grass at 0.1 m/s and finished at 6 m/s once scored a 6 m/s hit).
         * Until 2026-09-26 the frame's peaks were judged instead, behind a
         * cooldown on the wall clock, so whether a second touch was judged
         * at all depended on the frame rate, which is the one thing CLAUDE.md
         * says must never reach the game. It is acted on after the steps,
         * perched or not: a perch after the hit does not unhappen it.
         */
        const closing = crashJudge.hitClosing;
        const hitSpeed = crashJudge.hitSpeed;
        bounceCount += 1;
        /*
         * The ground, for scoring, on the line collide.js has already
         * drawn rather than a new one: under BOUNCE_SPEED_MAX the bounce
         * model applies and hitOutcome calls it a bounce, at or over it
         * hitOutcome calls it a crash. So a bounce is a BUMP and a crash
         * bails the combo. No third threshold, because a third threshold
         * is a number nobody can defend six months later.
         */
        const hard = crashJudge.hitHard;
        /*
         * THE SITE'S CRASH COUNT IS THIS LINE, IN EVERY MODE. The shell has
         * exactly one defended definition of a crash, the ceiling collide.js
         * draws at BOUNCE_SPEED_MAX, and the scorer below reads it only in
         * freestyle because a race map never touches the scorer. The
         * statistics are not the scorer: a pilot who puts a five inch into
         * the grass at ten metres a second on a race track has crashed,
         * and the board's counter used to hear only the clip-through
         * catch, which is a glitch recovery, so it read nought for a day
         * of flying. Turtle entry is NOT counted as well, because it is
         * what a hard hit usually leads to and would count the same crash
         * twice. See src/share/stats.js.
         */
        if (hard) {
          flightStats.noteCrash();
          /* Steam edition: career and achievements. */
          if (career) {
            career.crash();
          }
          if (view.judge && mode === 'flight') {
            view.judge.hear('crash', simTimeMs);
          }
        }
        if (view.mode === 'freestyle') {
          if (hard) {
            trickDetector.reset();
            counterCrash(true);
            chaseBail();
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
        /* A smack that did not land on the belly is a crash, and a crash
         * resets at once: crashJudge.crash below, with the others. */
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
    /* After this frame's landing judgement, so the key polls between frames
     * already know the craft is down. See noteLanded in src/input/input.js. */
    input.noteLanded(landed);

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
      pCurr.y = groundY + restW() * Math.cos(startPitch);
      if (startPitch) {
        qPad.setFromAxisAngle(AXIS_X, -startPitch);
        qPrev.multiply(qPad);
      }
    }
    shell.quad.position.copy(pCurr);
    shell.quad.quaternion.copy(qPrev);

    /*
     * WHAT THE SOLID WORLD DID THIS FRAME. src/native/world.c resolved it
     * inside the step loop above, every millisecond, with the same solver as
     * the ground; the step loop read it after every step, and frameReport
     * is those reads summed as the module sums them, with whatever was
     * stepped outside the loop (the launch stand) read and folded in here.
     * A roof the craft is standing on is the GROUND in the plant, so it
     * arrives through sim_ground_contacts with the street, not here: this is
     * everything else.
     */
    speedNow = Math.sqrt(
      stateCurr[4] * stateCurr[4] + stateCurr[5] * stateCurr[5] + stateCurr[6] * stateCurr[6],
    );
    const rep = foldWorldReport(frameReport, readWorldReport());
    lastSolidHits = rep[0];
    if (rep[0] > 0) {
      obsContact = true;
      obsTouched = true;
      obsClosing = rep[1];
      obsImpulse = rep[2];
      const idx = rep[3];
      /* A mover is the train, or on a map with traffic one of its cars,
       * which is reported as a car. */
      const kind = idx >= 0 ? kindOf(view.colliders, idx) : (idx <= -2 ? moverKind(-2 - idx) : 'none');
      obsImpulseKind = kind;
      lastHitKind = kind;
      lastClosing = rep[1];
      /* The report's normal is the physics frame's, Z up, so [6] is how much
       * of it points up: a craft resting on the top of something. */
      obsRoof = rep[6] > 0.5;
      upAxis.set(0, 1, 0).applyQuaternion(qPrev);
      lastUpDot = Math.abs(-rep[5] * upAxis.x + rep[6] * upAxis.y - rep[4] * upAxis.z);
      passStats.index = idx;
      passStats.kind = kind;
    }
    /*
     * CRASH IS A RESET, as crashJudge found it at a step of this frame: the
     * ground's smack off the belly, a solid (the frame or the lens, not a
     * prop alone, at a smack's closing speed, on anything but the belly, and
     * not an underside: the report's normal points out of the solid, so a
     * belly first hit has it along the body's own up and a ceiling has it
     * pointing down; it is the WORLD's normal and the attitude is the
     * plant's, so it is turned by the frame's yaw before the two meet, see
     * bodyUpDotWorld), or a STOP that touched no solid, which is the
     * ground's. The step loop ended on that step.
     */
    if (crashJudge.crash) {
      crashSeen = true;
    }
    /*
     * And a stop from BOUNCE_SPEED_MAX or more is the ground's hard hit,
     * which the ground judgement above counts, bails and scores as a crash
     * when sim_ground_contacts sees it, and never sees flat on the back. So
     * it is counted here, on the same line, and not again where the ground
     * judgement already counted it. Under the line a stop stays a reset and
     * nothing more, as a bump does there.
     */
    if (crashJudge.stopHard) {
      flightStats.noteCrash();
      /* Steam edition: career and achievements. */
      if (career) {
        career.crash();
      }
      if (view.judge && mode === 'flight') {
        view.judge.hear('crash', simTimeMs);
      }
      if (view.mode === 'freestyle') {
        trickDetector.reset();
        counterCrash(true);
        chaseBail();
      }
    }
    passStats.steps += rep[0];
    passStats.frame += rep[8];
    passStats.props += rep[7];
    passStats.deepest = rep[9] > passStats.deepest ? rep[9] : passStats.deepest;
    passStats.support = rep[10];
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
    obsRoof = false;
    obsImpulse = 0;
    obsImpulseKind = '';

    /* See recoverFrom: the last place the WHOLE CRAFT was in the open,
     * above the ground and at least its own radius from every solid, for X
     * and stuckTick to set it down on the pilot's side of whatever it is
     * wedged against. The centre alone is not enough, and the city showed
     * why on 2026-09-24: a head-on hit slid the craft into the 10 cm slot
     * between a shopfront and the 1.5 m block in front of it, where it stood
     * on its nose with its centre outside every solid. That slot became the
     * last open air, every spot on the pavement was across the block from
     * it, and the set down fell through to the start line. */
    if (mode === 'flight' && !poseLock && view.colliders) {
      const hy = view.height(pCurr.x, pCurr.z, pCurr.y - SURFACE_BIAS, pCurr.y);
      if (!(hy > pCurr.y)
        && view.colliders.gapAt(pCurr.x, pCurr.y, pCurr.z, CRAFT_WORLD_R) >= CRAFT_WORLD_R) {
        recoverFrom.x = pCurr.x;
        recoverFrom.y = pCurr.y;
        recoverFrom.z = pCurr.z;
        haveRecoverFrom = true;
      }
    }

    /* Before turtle can take it: see A CRASH IS A DULL BOUNCE. */
    crashBounceTick();
    autoResetTick();

    if (
      mode === 'flight'
      && !poseLock
      && !launchStaging
      && stateCurr
      && !turtleWait
      && !turtleFlip.active
    ) {
      tryEnterTurtle(stateCurr, turtleInContact());
    }
    if (isTurtleParked() && !turtleParkedNow) {
      setTurtleParkMotors(true);
    }
    /* After the turtle has had its look: see STUCK IS A RESET. */
    stuckTick();

    /* Race logic runs on the rendered world position, timed on the sim
     * clock at that state: gate crossings are swept over the frame's
     * travel, so speed cannot tunnel a gate. */
    const simNow = simTimeMs > 0 ? simTimeMs - 1 + a : 0;
    if (mode === 'flight' && !launchStaging) {
      /* Steam edition: career. What this frame's travel scored, if anything. */
      careerGateNow = null;
      careerLapNow = null;
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
          heightAt: (x, z, y) => view.height(x, z, y - SURFACE_BIAS, y),
        });
        if (!replayMode) {
          /* Dan's (src/maps/dan/), read before the race scores the travel. */
          const danMissed = view.judge && !race.freestyle && race.missedGate(race.next, racePrev, pCurr);
          const res = race.update(racePrev, pCurr, simNow, nowWall, allowPass);
          /* Steam edition: career. */
          careerGateNow = res.passed;
          careerLapNow = race.laps.length > lapsBefore ? race.lastLapMs : null;
          if (view.judge && !race.freestyle) {
            if (danMissed && res.passed == null) {
              view.judge.hear('miss', simNow);
            }
            /* The lap before the gate. The crossing that ends a lap is the
             * timing gate, and Dan hears the timing gate as the start of a
             * fresh lap, which forgets its hits: heard gate first, every lap
             * was clean and every lap was "Right into the pipe.". */
            if (race.laps.length > lapsBefore) {
              view.judge.hear('lap', simNow, { record: race.lastLapRecord, first: race.laps.length === 1 });
            }
            if (res.passed != null) {
              view.judge.hear('gate', simNow, { index: res.passed });
            }
          }
          if (res.passed != null) {
            view.setNextGate(race.nextSceneIndex(), race.followSceneIndex());
            if (typeof audio.event === 'function') {
              audio.event('gate');
            }
          }
          ghostOnRaceStep(simNow, nowWall, lapStartBefore, lapsBefore, res.passed != null);
          yardStep(racePrev, pCurr, simNow, nowWall, allowPass);
          /* A lap counted this frame is called out loud, in every run and
           * on the last lap of one too, which the results screen covers but
           * the ear still hears. Read off the entry the flash was written
           * from, so the voice and the screen say the same lap. */
          if (race.laps.length > lapsBefore && ui.settings.sound) {
            lapVoice.say(
              lapCall(race.log.length, race.lastLapMs, race.lastLapRecord),
              (ui.settings.volume / 10) * (ui.settings.calloutLevel / 10),
            );
          }
          /* A room's race reads the same lap, at the moment of its finish
           * crossing on the frame clock, and times it from GO
           * (src/net/roomrace.js). It never writes the sim's own clock. */
          if (together && race.laps.length > lapsBefore && race.lapStartMs != null) {
            together.lap(nowWall - (simNow - race.lapStartMs));
          }
        }
        /* Steam edition: career. A lesson judges its own laps. */
        /* And a room's race in progress keeps the run open until the room's
         * race is over, so the sim's results come up at its end. */
        if (!race.freestyle && !(career && career.owns()) && !(together && together.ownsRun())
          && runComplete(race.lap, runLaps)) {
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
          ui.showResults(race.log, race.bestMs, race.recordAtStart, ghostResultNote(), {
            /* Read from the race rather than recomputed on the screen: a run
             * of three has to be three CLEAN laps in a row, and only the
             * race's log still knows where the voids were. */
            threeMs: race.bestThreeMs ? race.bestThreeMs() : null,
            trackClass: view.trackClass ?? 'full',
            /* What the Upload row offers and what is kept for a later
             * visit: the lap, the three and the weight they were flown at,
             * all from one weight. See boardRow. */
            board: boardRowTagged(),
            /* Whether a lap of this run was left off it for being flown on
             * the tuned air or motors, so the Upload row can say why. */
            offBoard: race.hasTunedLaps(),
          });
        }
      }
      /* Steam edition: career. The lesson's frame, on the same rendered
       * position and sim clock the race scores on. */
      if (career && career.owns()) {
        careerFrame(simNow, raceHasPrev ? racePrev : pCurr);
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
    mpFrame(nowWall);

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
    /*
     * THE FREESTYLE ROOM'S FILM OF THE LOADED WORLD.
     *
     * The room keeps the world hidden, and its card for the world already
     * loaded used to copy this canvas into its recorder anyway, so it
     * recorded twelve seconds of the grey the card was filled with and kept
     * it. While ui.captureCurrentCard asks for it (ui.reelFilm), the world
     * is drawn again, still hidden behind the room, at the clip's size and
     * the clip's frame rate, on the title camera run from the start of its
     * line on the clip's clock, and every drawn frame is copied onto the
     * card (ui.paintMapThumbs). The world is already built, so the film
     * costs a 854 by 480 draw ten times a second and a small canvas, where
     * the orbit frame the other cards use builds a second copy of the world.
     *
     * Only the world the card names: the same key, taken when this world
     * was built (noteWorldClip), so an edit made since is not filmed under
     * the new key. And only while the pilot is in the room, which the
     * reels already arrange: the film starts when the room has been quiet
     * and any key or touch ends it (ui.noteInteraction).
     */
    const film = ui.reelFilm && !freezeWorld && mode === 'title' && ui.screen === 'freestyle'
      && worldClipKey && ui.reelFilm.key === worldClipKey
      ? ui.reelFilm
      : null;
    /* For timerPacesNow: the film's frames are all drawn past the gate, so
     * the timer must not pace them (the declaration above frame() says
     * why). */
    filmNow = Boolean(film);
    const worldLive = !freezeWorld && (
      Boolean(finishLoadingOnFrame)
      || mode === 'flight'
      || mode === 'paused'
      || mode === 'results'
      || ui.screen === 'courses'
      || attractOn
      || Boolean(film)
      || Boolean(camOverride)
    );
    /* The film draws behind the room, not in front of it: hidden, which
     * still draws, and copied out before the frame ends. */
    const wantVis = worldLive && !film ? 'visible' : 'hidden';
    if (shell.canvas.style.visibility !== wantVis) {
      shell.canvas.style.visibility = wantVis;
    }
    if (film && !filmPinned) {
      filmPinned = true;
      shell.renderer.setSize(CLIP_W, CLIP_H, false);
      shell.camera.aspect = CLIP_W / CLIP_H;
      shell.camera.updateProjectionMatrix();
      if (view.post && view.post.setSize) {
        view.post.setSize(CLIP_W, CLIP_H);
      }
    } else if (!film && filmPinned && worldLive) {
      /* Put the window's size back the first time the world is drawn for
       * something else, which is on the way out of the room, rather than
       * the moment the film stops, which is a key the pilot just pressed. */
      filmPinned = false;
      resizeDirty = true;
      applyResizeIfDirty();
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
      const camFloor = view.height(fpvPos.x, fpvPos.z, fpvPos.y - SURFACE_BIAS, fpvPos.y)
        + fpvLensClear(camFwd.y, camUp.y);
      if (fpvPos.y < camFloor) {
        fpvPos.y = camFloor;
      }
      lastCamFloor = camFloor;
      lastCamClear = fpvLensClear(camFwd.y, camUp.y);
      lastCamFwdY = camFwd.y;
      lastCamUpY = camUp.y;
    }
    const parked = (landed || launchStaging || turtleWait || turtleFlip.active) && !poseLock;
    if (parked) {
      liftFloorY = null;
      parkedLift += (simLenToWorld(PARKED_LIFT) - parkedLift) * Math.min(1, dt * 0.006);
    } else if (poseLock) {
      liftFloorY = null;
      parkedLift += (0 - parkedLift) * Math.min(1, dt * 0.006);
    } else {
      if (liftFloorY === null) {
        liftFloorY = fpvPos.y + parkedLift;
        liftAnchorX = pCurr.x;
        liftAnchorZ = pCurr.z;
      }
      const travel = Math.hypot(pCurr.x - liftAnchorX, pCurr.z - liftAnchorZ);
      const hold = liftFloorY - fpvPos.y - LIFT_TRAVEL_BLEED * travel;
      parkedLift = Math.min(parkedLift, hold > 0 ? hold : 0);
    }
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
      /* Magnitudes: in 3D mode a rotor turning backwards reports a negative
       * speed, and it shakes the frame all the same. */
      const rpmMean = (Math.abs(stateCurr[14]) + Math.abs(stateCurr[15])
        + Math.abs(stateCurr[16]) + Math.abs(stateCurr[17])) * 0.25;
      const shake = lensShake.update(dt, rpmMean / plantFacts(runAirframe).fullRpm);
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

    /* Watching ends with the pause it rides on: anything that takes the
     * screen (the room's grid, a menu, the title) puts the camera back. */
    if (((watchCam && watchCam.on) || ovOn) && (mode !== 'paused' || ui.screen !== 'paused')) {
      watchStop(true);
    }

    /* Every camera but the lens keeps the boot near plane; the lens's own
     * is set in its branch below. See fpvNear. */
    setCameraNear(CAMERA_NEAR_OPEN);
    if (mode === 'title') {
      if (film && !camOverride) {
        /* The shot the orbit frame records (src/share/orbit.js): the line
         * from its start, one whole cycle in the clip, no overlay and no
         * sticks. film.t0 is set when the recorder starts; until then the
         * camera holds the first pose, so the clip opens on it. */
        shell.quad.visible = true;
        const camMs = film.t0 < 0 ? 0 : Math.max(0, nowWall - film.t0) * film.scale;
        attractCam.update(camMs, shell.camera, { craft: shell.quad });
      } else if (worldLive && !camOverride) {
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
    } else if (watchCam && watchCam.on && !camOverride) {
      watchFrame(nowWall);
    } else if (introMs >= 0 && (mode === 'flight' || mode === 'paused') && !camOverride) {
      if (mode === 'flight') {
        /* Punch-out skips the orbit and the approach. TAKEOFF_THROTTLE,
         * not a hair trigger: a resting gamepad axis at 0.08 used to skip
         * the shot entirely. */
        if (liftThrottle(input.channels.throttle) > TAKEOFF_THROTTLE && introMs < INTRO_FLY) {
          introMs = INTRO_FLY;
        }
        introMs += dt > INTRO_STEP_MAX ? INTRO_STEP_MAX : dt;
      }
      const orbitU = introEase(introMs / INTRO_ORBIT);
      const approachU = introEase((introMs - INTRO_ORBIT) / INTRO_APPROACH);
      const zoomU = introEase((introMs - INTRO_FLY) / INTRO_ZOOM);
      const theta = INTRO_THETA0 - INTRO_ORBIT_SPAN * orbitU;
      /*
       * THE SHOT IS THE AIRCRAFT'S SIZE. Its metres were set round a craft
       * drawn at its own size, which every pairing was until the quad
       * picker (the owner, 2026-10-28): a five inch in a house is drawn
       * three and a half times bigger, and the approach at 0.40 m came in
       * through its own props; a whoop in the town is 3.43 times smaller,
       * and the shot orbited a speck. So every length of it goes through
       * src/render/frame.js's scale, and its near plane comes down with a
       * smaller one (nearScale). At 1 it is the shot it was, to the bit.
       */
      const shotK = simLenToWorld(1);
      setCameraNear(CAMERA_NEAR_OPEN * nearScale());
      const radius = (INTRO_ORBIT_RADIUS
        + (INTRO_APPROACH_RADIUS - INTRO_ORBIT_RADIUS) * approachU) * shotK;
      const height = (INTRO_ORBIT_HEIGHT
        + (INTRO_APPROACH_HEIGHT - INTRO_ORBIT_HEIGHT) * approachU) * shotK;

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
        + INTRO_FLOOR_CLEAR * shotK;
      if (introFrom.y < introFloor) {
        introFrom.y = introFloor;
      }
      /* Orbit looks at the airframe. Approach turns the look down the
       * course so the zoom is a dolly into the FPV camera, not a snap.
       * Level forward here too: aimed along the ramp it pointed at the sky
       * instead of at the course. */
      introLook.copy(pCurr)
        .addScaledVector(introUp, (0.04 + 0.04 * approachU) * shotK)
        .addScaledVector(introFwd, (0.08 + 1.4 * approachU) * shotK);
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
      /* Replay mode camera overrides */
      if (replayMode && ghostLap && replayPresence > 0) {
        shell.quad.visible = false;
        replayScratchPos.set(ghostSample.px, ghostSample.py, ghostSample.pz);
        replayScratchQuat.set(ghostSample.qx, ghostSample.qy, ghostSample.qz, ghostSample.qw);
        if (replayCamera === 'fpv') {
          /* FPV camera: ghost position and orientation with camera tilt */
          replayScratchTilt.setFromAxisAngle(AXIS_X, cameraTiltRad(camTilt));
          shell.camera.position.copy(replayScratchPos);
          shell.camera.quaternion.copy(replayScratchQuat).multiply(replayScratchTilt);
          if (shell.camera.fov !== ui.settings.cameraFov) {
            shell.camera.fov = ui.settings.cameraFov;
            shell.camera.updateProjectionMatrix();
          }
        } else {
          /* Chase camera: smoothed spring arm behind the ghost */
          replayScratchDir.set(0, 0, -1).applyQuaternion(replayScratchQuat);
          const micro = CRAFT_R < 0.15;
          const BACK = simLenToWorld(micro ? 0.55 : 1.6);
          const UP = BACK * 0.35;
          const AHEAD = BACK * 1.1;
          /*
           * THE SPRING RUNS ON THE REPLAY'S OWN CLOCK: how far vt moved
           * since the frame before, in step mode and in real time alike.
           * Real time used to take the plant's steps this frame, and a
           * replay parks the craft and steps nothing, so dt was 0 on every
           * frame and ?replay= with cam=chase never moved off the pose it
           * was seeded at. On vt the camera follows the ghost as fast as
           * the ghost flies, a paused replay (vt still) holds it where it
           * is, and a capture stepping 500 ms a frame gets the same camera
           * as before. A clock that went BACK (the lap looped, or R) is a
           * cut, not a swing across the field: the arm is seeded again on
           * the ghost where it now is.
           */
          const dt = replayChaseCam ? replayClock.vt - replayChaseCam.prevVt : 0;
          if (!replayChaseCam || dt < 0) {
            replayScratchUp.set(0, UP, 0);
            replayChaseCam = {
              pos: replayScratchPos.clone().addScaledVector(replayScratchDir, -BACK).add(replayScratchUp),
              look: replayScratchPos.clone().addScaledVector(replayScratchDir, AHEAD),
              prevVt: replayClock.vt,
            };
          }
          const k = 5; /* spring constant */
          const alpha = 1 - Math.exp(-k * dt / 1000);
          replayScratchUp.set(0, UP, 0);
          replayScratchPos.addScaledVector(replayScratchDir, -BACK).add(replayScratchUp);
          replayChaseCam.pos.lerp(replayScratchPos, alpha);
          replayScratchPos.set(ghostSample.px, ghostSample.py, ghostSample.pz).addScaledVector(replayScratchDir, AHEAD);
          replayChaseCam.look.lerp(replayScratchPos, alpha);
          replayChaseCam.prevVt = replayClock.vt;
          shell.camera.up.set(0, 1, 0);
          shell.camera.position.copy(replayChaseCam.pos);
          shell.camera.lookAt(replayChaseCam.look);
          if (shell.camera.fov !== 70) {
            shell.camera.fov = 70;
            shell.camera.updateProjectionMatrix();
          }
        }
        setCameraNear(CAMERA_NEAR_OPEN);
      } else if (careerCamera === 'chase' && (mode === 'flight' || mode === 'paused')) {
        /* Steam edition: career. See careerChase. */
        careerChase(nowWall);
      } else {
        /* The camera sits inside the airframe, so the quad must be hidden or
         * you fly looking at the inside of its own outline hull. For one
         * beat after a crash it holds the moment of the hit instead: the
         * impact frame (src/render/manga.js). */
        shell.quad.visible = false;
        const held = manga.holding();
        shell.camera.position.copy(held ? manga.holdPos : fpvPos);
        shell.camera.quaternion.copy(held ? manga.holdQuat : fpvQuat);
        /* The mount, not the held impact frame, is what the predicted view
         * moves: see predictView before the draw. */
        predictCam = !held;
        fpvLens = true;
        setCameraNear(fpvNear(held ? manga.holdPos : fpvPos));
        if (shell.camera.fov !== ui.settings.cameraFov) {
          shell.camera.fov = ui.settings.cameraFov;
          shell.camera.updateProjectionMatrix();
        }
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
      /* The harness camera obeys the lens's rule too, so a capture put
       * against a wall photographs the wall rather than what is behind it. */
      setCameraNear(fpvNear(shell.camera.position));
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
    yardFrame(nowWall);
    if (worldLive) {
      if (view.onCue !== playCue) {
        view.onCue = playCue;
      }
      view.updateAnim(
        mode === 'title'
          ? titleStepMs
          : (mode === 'results' ? simTimeMs + Math.max(0, finishCamMs) : simTimeMs),
      );
      /* The cars, at the same clock, drawn at the craft's alpha in flight;
       * the title's and the finish's own clocks are whole steps, and the
       * title carries its fraction in titleAcc. */
      goatFrame();
      filmFrame();
      syncBalloons();
      if (balloonGame) {
        if (mode === 'title' || (mode === 'flight' && balloonIdle)) {
          balloonFrame(balloonIdleTick(dt), dt, nowWall);
        } else if (mode === 'flight') {
          balloonFrame(simTimeMs - 1 + a - balloonFeedAt, dt, nowWall);
        } else {
          /* Paused, results: frozen where it is. */
          balloonFrame(0, 0, nowWall);
        }
      }
      syncDogfight();
      fightRoomSync();
      if (fightGame) {
        if (mode === 'title' || (mode === 'flight' && balloonIdle)) {
          fightFrame(fightIdleTick(dt), dt, nowWall);
        } else if (mode === 'flight') {
          fightFrame(simTimeMs - 1 + a - fightFeedAt, dt, nowWall);
        } else {
          fightFrame(0, 0, nowWall);
        }
      }
      if (trafficOn) {
        if (mode === 'title') {
          trafficFrame(titleStepMs, titleAcc);
        } else if (mode === 'results') {
          trafficFrame(simTimeMs + Math.floor(Math.max(0, finishCamMs)), 1);
        } else {
          trafficFrame(simTimeMs, a);
        }
        if (filmRig) {
          filmRigFrame();
        }
      }

      /* Watching another pilot, the shadows and the grass's wind go with
       * the camera riding behind them: at the parked quad they would end
       * in a hard edge a field away from the quad on screen. */
      const focus = camOverride || (watchCam && watchCam.on)
        ? shell.camera.position
        : (mode === 'title' ? shell.quad.position : pCurr);
      view.updateShadowFocus(focus);
      /* Wash used to drive grass propwash. Blades are not drawn. The
       * argument stays on the call so every map has one updateWind shape. */
      const meanRpm = (Math.abs(stateCurr[14]) + Math.abs(stateCurr[15])
        + Math.abs(stateCurr[16]) + Math.abs(stateCurr[17])) * 0.25;
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
    if (film) {
      /* The clip is CLIP_FPS frames a second, so the film draws no more
       * than that: drawing sixty a second to keep ten throws five draws of
       * the world in every six away behind a menu. The recorder takes a
       * frame when the card's canvas changes, which is when one of these
       * is copied. */
      if (nowWall - filmLastDraw < 1000 / CLIP_FPS - 1.0) {
        drawThis = false;
      } else {
        filmLastDraw = nowWall;
      }
    } else if (capHz > 0 && worldLive) {
      if (nowWall - capLastDraw < 1000 / capHz - 1.0) {
        drawThis = false;
      } else {
        capLastDraw = nowWall;
      }
    }
    /*
     * THE GPU GUARD: when the GPU is saturated and still has the last frame,
     * this draw waits a frame rather than queue behind it, so what the
     * pilot sees is never two frames older than the sticks. Same contract as
     * the cap above: input and physics have already run. Never for the film
     * or a replay step capture, whose frames must all be drawn, and only
     * while Low latency view is on. See gpugate.js for why it waits for the
     * GPU to be saturated on average before it believes one late fence, and
     * for the timer loop's own stricter rule, passed as the last argument:
     * a timer has no compositor pacing it, so without a bound on the
     * pending fences' age a GPU slower than the cadence is fed a queue
     * that grows without limit (the day Frame pacing shipped, that hung a
     * whole browser on the battery's software rasteriser).
     */
    if (worldLive && drawThis && !film && !replayStepMode
      && gpuGate.shouldSkip(renderStart, ui.settings.lowLatency !== false, latency.targetMs(), timerLoop)) {
      drawThis = false;
    }
    if (worldLive) {
      mangaFrame(dt);
    }
    /*
     * THE PREDICTED VIEW (src/render/predict.js): the FPV camera moved on to
     * where the quad will be when this frame is on the glass, one display
     * period from now, or more if this callback has already run past the
     * next vsync, never more than PREDICT_MAX_MS. The frame is drawn from
     * the state at its start and seen a period later, so without this the
     * picture is always one frame behind the sticks.
     *
     * Only the camera moves, rigidly about the drawn craft, and only here:
     * every piece of logic, the gates, the contact, the tricks, the lap,
     * reads the craft's own pose, which this never touches, and the camera
     * is set from the mount afresh every frame. The chevron is placed after
     * the draw from this same camera, so it stays on the gate it marks.
     *
     * Only in flight, on the FPV mount, never on the ground or about to
     * be: landed, parked on the stand, turtle, a pose lock, the crash
     * reset, a replay, the film or a harness camera all draw the pose as
     * it is. And never under the floor the mount was held above (camFloor):
     * a quad about to touch down is drawn at the floor, not below it.
     */
    if (worldLive && drawThis && predictCam && ui.settings.predictView !== false
      && mode === 'flight' && ui.screen === 'flight' && !replayMode && !film && !camOverride
      && !landed && !launchStaging && !turtleWait && !turtleFlip.active && !poseLock) {
      const period = latency.displayPeriodMs();
      const late = renderStart - nowWall;
      let horizon = period * (1 + (late > 0 ? Math.floor(late / period) : 0));
      if (horizon > PREDICT_MAX_MS) {
        horizon = PREDICT_MAX_MS;
      }
      predictDelta(stateCurr, horizon, qSpawn, predDp, predDq);
      moveRigid(shell.camera.position, shell.camera.quaternion, shell.quad.position, shell.quad.quaternion,
        predDp, predDq, predR, predV);
      if (shell.camera.position.y < lastCamFloor) {
        shell.camera.position.y = lastCamFloor;
      }
      shell.camera.updateMatrixWorld();
      predictLastMs = horizon;
      predictApplied = true;
    }
    if (worldLive && drawThis) {
      placePropView();
      view.post.render();
      gpuGate.submitted(performance.now());
    }
    /* In the same task as the draw: the canvas keeps no drawing buffer, so
     * this is the one moment it still holds the frame. */
    if (film && drawThis) {
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
      /* The seated aircraft's own model and its own framing. A 65 mm whoop
       * in a stage composed for a 5 inch is a speck; showcase.js scales the
       * whole stage by the sweep ratio. Rebuilt when the aircraft changes,
       * which is why the id is remembered rather than the object alone. */
      if (showcase && showcaseCraft !== runAirframe) {
        try {
          showcase.dispose();
        } catch (e) {
          /* Already gone. */
        }
        showcase = null;
      }
      if (!showcase) {
        const af = airframeById(runAirframe);
        showcaseCraft = runAirframe;
        showcase = createShowcase(ui.craftCanvas, {
          sweep: af.dims.arm + (af.dims.hullR ?? af.dims.propR),
          build: af.id === 'whoop65' ? buildWhoopCraft : undefined,
        });
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
    const motorsTurning = mode === 'flight' && !landed && !isTurtleParked();
    /* Magnitudes, for 3D mode's rotors turning backwards: a motor sings at
     * its speed whichever way round it goes. */
    audioRpm[0] = motorsTurning ? Math.abs(st[14]) : 0;
    audioRpm[1] = motorsTurning ? Math.abs(st[15]) : 0;
    audioRpm[2] = motorsTurning ? Math.abs(st[16]) : 0;
    audioRpm[3] = motorsTurning ? Math.abs(st[17]) : 0;
    audio.update(audioRpm, motorsTurning ? speed : 0);
    const audioMs = performance.now() - audioStart;
    if (frames > 2 && audioMs > worstAudioMs) {
      worstAudioMs = audioMs;
    }
    /* The thumb sticks are flying: a device with touch points, in flight,
     * with no gamepad connected. Read here, before the OSD, because the air
     * slider's card behaves differently on glass. The overlay itself is
     * shown and hidden on the same test further down, read again there
     * because a run that ends in this frame has left flight by then. */
    const touchFlying = Boolean(touch) && mode === 'flight' && ui.screen === 'flight' && !input.firstGamepad();
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
        /* In the aircraft's metres where that is the smaller query (a whoop
         * in the town), and never wider than it was: two aircraft metres for
         * the five inch in a house is a query three and a half times as wide,
         * measured at 2 to 4 us a frame more in Nick's house, and that is
         * held for the owner's word with the close calls' probes. */
        trickDetector.near(view.colliders.gapAt(q.x, q.y, q.z, Math.min(WALL_NEAR_M, simLenToWorld(WALL_NEAR_M))));
      }
      /* The STF mark, on a map that carries one, until this run finds it:
       * see findEgg. Not asked at all while finds are off (MARK_FINDS in
       * src/game/egg.js): the mark is paint and nothing more. */
      if (MARK_FINDS && view.egg && !eggFound && ui.screen === 'flight' && frames % EGG_EVERY === 0) {
        findEgg();
      }
      /* The partners' marks, every map that carries them: see findMarks. A
       * frame after the STF mark's, so the two never land on one frame. */
      if (PARTNER_FINDS && view.marks && view.marks.length && ui.screen === 'flight'
        && frames % EGG_EVERY === 1) {
        findMarks(frames % MARKS_SEEN_EVERY === 1);
      }
      /* The map's stickers, a frame after the partners' marks: see
       * findStickers. */
      if (view.stickers && view.stickers.length && ui.screen === 'flight' && frames % EGG_EVERY === 2) {
        findStickers();
      }
      if (view.mode === 'freestyle') {
        const wasOver = score.over();
        /* What waited out its window while nothing stepped, then the
         * clock: see counterFrame. */
        counterFrame();
        score.tick(simTimeMs);
        const scoreView = score.view();
        scoreState = scoreView.state;
        scoreRemainMs = scoreView.remainMs;
        ui.setScore(scoreView);
        const counterEvents = score.drainEvents();
        noteCounterEvents(counterEvents);
        ui.scoreEvents(counterEvents);
        /* Steam edition: career. What the counter paid, for a lesson that
         * judges close calls or a banked combo. */
        if (career) {
          career.counter(counterEvents);
        }
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
      /* The chase's meter and callouts. Its paying events went to the
       * counter from the feed that settled them (chaseToCounter); this is
       * the HUD's drain. The HUD is up only on a map with cars, in flight. */
      if (trafficOn) {
        const chaseEvents = chase.drainEvents();
        chasePaidUpTo = 0;
        if (chaseEvents) {
          for (const e of chaseEvents) {
            noteChaseEvent(e);
          }
        }
        ui.chaseMeter(chase.view());
        ui.chaseEvents(chaseEvents);
      }
      /* THE HOUSE MAPS READ AS A 1S WHOOP. Nick's and Heads' house are drawn
       * as the whoop and built at S times life size (`hudScale` in
       * ./maps/registry.js), flown on whichever plant is chosen, so the OSD
       * prints what a 1S whoop in a real house would: one cell's volts
       * (the pack over the plant's cells, not the airframe's 6S) and the
       * speed divided by S. Display only, like cells and osdSpeed: nothing
       * that flies or scores reads either. Since 2026-10-23 the houses seat
       * the whoop and the whoop flies the five inch's plant, so this is read
       * whatever is seated: it is the HUD the houses had when the owner
       * said their feel was good.
       *
       * AND A WHOOP ROOM THE SAME WAY, on the owner's word of 2026-10-23,
       * "ensure all ui's are accurate to the craft displayed at the starting
       * intro scene": a micro track is built MICRO_SCALE times life size
       * for the same reason the houses are, so its speed, altitude, gate
       * distance and the freestyle HUD's metres are divided by that. The
       * whoop's speed comes back on the OSD with it, as a whoop's speed. */
      /* And the whoop on Bardwell's yard track, which is built at a whoop
       * room's size for the whoop drawn there. */
      /* Since the quad picker (2026-10-28) this is the MAP'S multiple of
       * life size, whichever aircraft flies it, because a world metre over
       * it is a real metre in the house or the room whatever is in it: a
       * five inch in Nick's house reads its own speed, and a whoop in the
       * town reads a whoop's. The speed is the plant's, in sim metres, so it
       * goes to world metres through the seam first. At every pairing that
       * flew before the picker these are the numbers they were. */
      const life = hudLifeScale();
      setLifeScale(life);
      const p = shell.quad.position;
      const nextGt = view.gates && view.gates[race.nextSceneIndex()];
      ui.setOsd({
        mode: view.mode,
        /* No airtime yet reads a dimmed 0.00, like a lap before its gate. */
        lapMs: race.freestyle ? (airtimeMs > 0 ? airtimeMs : null) : race.currentLapMs(simNow),
        /* The freestyle clock is the RUN's, counting down, and it is the
         * only clock on the screen: see setOsd. Read straight off the
         * scorer, which is the thing that decides when the run ends, rather
         * than off a second copy that could disagree with it. With scoring
         * off there is no run, and the slot carries the airtime instead. */
        runState: scoreState,
        runTimed: score.timed,
        runScored: scoringWanted(),
        runRemainMs: scoreRemainMs,
        gate: race.next + 1,
        gateCount: race.gates.length,
        gateCue: nextGt && nextGt.cue ? nextGt.cue : '',
        /* The pack the airframe SAYS it has: the plant's volts scaled to the
         * airframe's cells. Both whoop and five inch now say what their plant
         * is, so the ratio is 1; it stays because `cells` and the plant are
         * two facts that could part again. Display only. */
        volts: st[18] * airframeById(runAirframe).cells / plantFacts(runAirframe).cells,
        lastLapMs: race.lastLapMs,
        packFrac: (st[18] - plantFacts(runAirframe).cells * 3.3) / (plantFacts(runAirframe).cells * (4.2 - 3.3)),
        /* The same biased fromY every contact query in this file uses, and
         * for the same reason: the city's height walker takes any platform
         * within a step of fromY as the floor, so an unbiased query from the
         * craft's own height finds the deck the quad is UNDER rather than
         * the road it is over, and the readout prints a negative altitude
         * under the overbridge. See SURFACE_BIAS. */
        altitude: (p.y - view.height(p.x, p.z, p.y - SURFACE_BIAS, p.y)) / life,
        /* Null on an airframe whose OSD has no speed, and the readout goes.
         * See osdSpeed in configs/airframes.js: it went because the whoop's
         * plant is the five inch's and the number was the plant's. Flown
         * away from its own map (WORLD_SCALE not 1, the quad picker) the
         * number is the world's, through the scale, so it is the real one
         * and it shows, as it does in the houses. */
        speedKph: life !== 1 || WORLD_SCALE !== 1 || airframeById(runAirframe).osdSpeed
          ? simLenToWorld(speed) * 3.6 / life : null,
        throttle: input.channels.throttle,
        flightMode: (turtleWait || turtleFlip.active) ? 'turtle' : (angleModeOn ? 'angle' : 'acro'),
        /* No damage model, so nothing to count down. How much this run has
         * bounced is still worth telling a pilot, and the OSD says nothing
         * at all until there is something to say. */
        bounces: bounceCount,
        /* Native state 3 latches until the L switch drops. The GO flash
         * is 900 ms; after that the overlay has to hide or it sits on
         * the goggles for the rest of the lap. */
        launchState: (crashflipOn || turtleRecover) ? 0 : (launchNow === 3 && nowWall >= lcGoUntil ? 0 : launchNow),
        launchPitch: pitchNoseDownDeg(st),
        /* The gap to the ghost at the last gate, while its readout lives.
         * Null the rest of the time, which is how the OSD knows to clear. */
        ghostGapMs: ghostGap && nowWall < ghostGap.untilWall ? ghostGap.deltaMs : null,
        ghostFinal: Boolean(ghostGap && ghostGap.final),
      });
      const ch = input.channels;
      const vis = turtleAxes(ch.roll, ch.pitch);
      ui.setStickOverlay({
        show: stickOverlayUp(),
        roll: vis[0],
        pitch: vis[1],
        yaw: ch.yaw,
        throttle: ch.throttle,
      });
      /* The air slider rides the same test as the gimbals it sits between,
       * but not the same SOURCE test: it belongs to every pilot, radio,
       * keyboard and thumbs alike. This is also where its first-run hint is
       * raised and retired, which is why it is here and not in show().
       * Aloft is off the pads, not perched or set down, and not on its
       * back: the slider fades while it is true and the card retires when
       * it goes false. A radio or gamepad moving the sticks in the air is
       * the pilot answering the card without a pointer. */
      const aloft = !landed && !launchStaging && !poseLock && !turtleWait && !turtleFlip.active;
      ui.setAirSlider(true, aloft, {
        airMs: airtimeMs,
        padFlying: aloft && !input.isKeyboardPrimary()
          && (Math.abs(ch.roll) > PAD_FLYING_STICK
            || Math.abs(ch.pitch) > PAD_FLYING_STICK
            || Math.abs(ch.yaw) > PAD_FLYING_STICK),
        touch: touchFlying,
      });
      /* The chips fade on the same test: see syncChipFade. */
      ui.syncChipFade(aloft, nowWall);
      updateTargetLock();
    } else if (mode !== 'paused') {
      ui.setStickOverlay({ show: false, roll: 0, pitch: 0, yaw: 0, throttle: 0 });
      ui.setAirSlider(false);
      ui.syncChipFade(false, nowWall);
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
      /* Nor while a stick key has taken the sticks from the thumbs: the
       * plates go away and the ghost gimbals come, exactly as on a desktop,
       * until a finger lands. See InputManager.takeKeys. */
      const touchOn = mode === 'flight' && ui.screen === 'flight' && !input.firstGamepad()
        && input.hand !== 'keys';
      /*
       * The one-time thumb-rates hand-off, at the first moment touch is
       * actually about to fly. A fresh touch profile was already seeded
       * by loadSettings; this catches the OTHER pilot, an existing
       * profile still on the stock defaults, whose no-expo 600 is a
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
      /* Steam edition: career. A lesson has its own coach. */
      && !(career && career.owns())
      && !crashflipOn
      && !turtleRecover
      && lastUpz >= 0
    ) ? guidedPrompt(race) : '';
    const padSum = input.padSummary();
    ui.setPadInfo(padSum);
    noteLostSticks(padSum, nowWall);
    /* Stick help's watch runs while its screen is up and only then, so every
     * visit starts from where the sticks are when it opens. See STICK HELP
     * in src/input/input.js. */
    if (ui.screen === 'stickhelp') {
      if (!input.stickCheck) {
        input.startStickCheck();
      }
      ui.setStickHelp(input.stickCheckView());
    } else if (input.stickCheck) {
      input.stopStickCheck();
    }
    const restartSet = input.takeRestartResult();
    if (restartSet && padSum.restart) {
      notice = restartSet === 'saved'
        ? { text: `Restart switch: ${padSum.restart}.\nFlip it in flight to go back to the start line.`, untilMs: nowWall + 3600 }
        : { text: `Restart switch: ${padSum.restart}, until you reload.\nThis browser would not keep it.`, untilMs: nowWall + 4800 };
    }
    const autoSet = input.takeAutoResetResult();
    if (autoSet && padSum.autoReset) {
      notice = autoSet === 'saved'
        ? { text: `Auto reset switch: ${padSum.autoReset}.\nA switch sets it on or off; a button toggles it.`, untilMs: nowWall + 3600 }
        : { text: `Auto reset switch: ${padSum.autoReset}, until you reload.\nThis browser would not keep it.`, untilMs: nowWall + 4800 };
    }
    const queuedPick = input.takePadPickQueue();
    if (queuedPick) {
      openPadPick(queuedPick);
    }
    /* A notice while a menu is up is the menu's, not the banner's: see
     * setMenuNotice. The banner below only ever says it in flight. */
    ui.setMenuNotice(notice && nowWall < notice.untilMs && ui.isModal() ? notice.text : '');
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
        ui.show(calReturn);
        if (input.calResult === 'saved') {
          notice = { text: 'Stick mapping saved.', untilMs: nowWall + 2800 };
        } else if (input.calResult === 'saved-unstored') {
          notice = {
            text: 'Mapping live, gone on reload.',
            untilMs: nowWall + 5200,
          };
        }
        input.calResult = null;
      }
      ui.setBanner('');
    } else if (
      (turtleWait || turtleRecover || turtleFlip.active)
      && ui.screen === 'flight'
    ) {
      ui.setBanner(turtleBannerText(), true);
    } else if (notice && nowWall < notice.untilMs && !(launchNow > 0) && !crashflipOn && !ui.isModal()) {
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
    } else if (career && career.owns() && !flownThisRun) {
      /* Steam edition: career. Before the first takeoff the lesson's coach
       * says what to do; the game's own promise about clocks and gates is
       * about a different kind of run. */
      ui.setBanner('');
    } else if (!flownThisRun) {
      /*
       * THE SECOND LINE IS A PROMISE ABOUT WHAT STARTS, and in freestyle it
       * was the SCORED run's promise whatever the pilot had set Scoring to.
       *
       * A pilot with scoring off was told, in amber across the middle of the
       * town, that they had two minutes and that the clock started on their
       * first trick. Nothing else agreed with it: the OSD slot beside it read
       * Air and counted an airtime up, no overlay ever appeared, and the run
       * never ended. It is the one sentence a freestyle pilot reads before
       * they fly, so as far as the seat was concerned the scorer was on and
       * the Scoring row was a lie. See DEFAULTS.freestyleScoring in
       * src/ui/ui.js for why off is what a pilot gets without asking.
       *
       * OFF PROMISED NOTHING, because nothing started: the line was dropped
       * and the banner was the takeoff prompt on its own. Since the counter
       * it has the lines, and says so, with no clock. Free flight has no
       * clock and no end either, so it says what it does have rather than
       * borrowing the scored run's sentence. Only a scored run gets the two
       * minutes, from the first thing scored, whatever kind it is.
       */
      /* A first flight names the control: see src/ui/firstflight.js. */
      const guidedStart = guidedTakeoff(race);
      /* A room's race holds its grid until GO, and a throttle before it is
       * a false start, so the line says wait rather than throttle up. */
      const onGrid = Boolean(together && together.onGrid());
      const start = onGrid ? 'Wait for GO' : (guidedStart || (ui.settings.launchControl
        ? 'L for launch control, or throttle up'
        : 'Throttle up to take off'));
      /* Practice is the one race that does not end, so it says so on the
       * line that promises what starts. See PRACTICE_LAPS. */
      let second = runLaps === PRACTICE_LAPS
        ? '\nPractice: no lap limit. The green gate starts your lap'
        : '\nThe green gate starts your lap';
      if (race.freestyle && view.filmGame) {
        /* Drift Matsuri: the take is the game, and it starts in the air. */
        second = '\nYou are the camera. Film the drift battles for a minute.';
      } else if (race.freestyle && view.goatGame) {
        /* The goat map: the herd is the game and it has a clock, so the
         * freestyle promise of none is not true of it (goathud.js). */
        second = "\nFly low to herd the goats into Heads' garage. The clock starts at the first goat you move.";
      } else if (race.freestyle) {
        /* The counter counts the lines in every position (decision 2), so
         * even Lines only has something to promise now. With Manga and
         * scoring off none of that count is drawn, so the line promises
         * none of it; a scored run's clock is in the OSD, which stays, so
         * its sentence stands. See DEFAULTS.mangaAndScoring in ui.js. */
        if (scoredRun()) {
          second = '\nTwo minutes. The clock starts on the first thing you score.';
        } else if (!ui.settings.mangaAndScoring) {
          second = '\nNo clock and no gates.';
        } else {
          second = scoringWanted()
            ? '\nNo clock and no gates. Lines and tricks count as you fly them.'
            : '\nNo clock and no gates. Gaps and close calls count as you fly them.';
        }
      }
      /* A room's race says what starts in its own panel and countdown, and
       * the map's promise of no clock is not true of it. */
      if (together && together.raceRoom()) {
        second = '';
      }
      /* A dogfight or ribbon cutting says what starts in its own line, under
       * its score bar, and this one sat on the bar. */
      ui.setBanner(fightGame ? '' : `${start}${second}`);
      if (guidedStart && !onGrid) {
        ui.noteGuideShown();
      }
    } else if (guidedText) {
      ui.noteGuideShown();
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

    /*
     * THE PERFORMANCE READOUT IS GONE, and this note is here because the
     * numbers are not.
     *
     * Frame rate, draw calls, triangles, the render scale and the stick
     * rate used to print in the top right corner behind a Settings switch
     * and an F3 key. They were developer output on a page whose first
     * screen is three pictures and a question, and the owner asked for
     * that corner back.
     *
     * Every one of those numbers is still measured and still reachable.
     * `fps` and `renderStats` are live in this scope, `input.stats()`
     * answers the stick rate, and scripts/quality-check.js and
     * scripts/device-check.js read the same figures out of a real browser,
     * which is where a performance number belongs: in a check that can
     * fail, not in a corner nobody reads while flying.
     */
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
    /* Flying frames only, and never a replay's: a report about lag is a
     * report about flying. See flightperf.js. */
    if (mode === 'flight' && ui.screen === 'flight' && !replayMode) {
      flightPerf.note(dt, blockMs);
    }
    /* Every frame, for the display's period, which Auto and the guard
     * measure against: see latency.js. A live world says the GPU could have
     * been pacing this frame whether or not it drew: a draw the guard or the
     * cap held back still waits on a busy GPU's compositing. The Settings
     * studio's craft counts too, and the guard does not time it. */
    if (!timerLoop) {
      /* Never under the experimental timer loop: these intervals are the
       * timer's own cadence, and the learner would report a refresh rate
       * the display does not have. It holds what it had instead. */
      latency.noteFrame(dt, blockMs, gpuGate.state, worldLive || studioOn);
    }
    /*
     * AUTO GRAPHICS, from the frames the pilot is looking at: flight, and the
     * title's attract flight over the same world, which is the free
     * benchmark every visit already runs. Not a menu, whose frames are the
     * menu's, nor a film or a replay, nor a frame with the world frozen,
     * which costs nothing and would read as headroom. The resolution moves
     * here, at once and through the Render scale path; the preset moves
     * only between runs, below. See autoscale.js.
     */
    if (ui.settings.graphicsAuto && !timerLoop && mapReady && !swapInFlight && !replayMode && !film && worldLive
      && ((mode === 'flight' && ui.screen === 'flight') || (mode === 'title' && ui.screen === 'title'))) {
      autoScale.observe(dt, renderMs, blockMs, gpuGate.state, drawThis, latency.targetMs());
      if (autoScale.state.dirty) {
        autoFactor = autoScale.state.want;
        applyRenderScale(ui.settings);
        autoScale.applied(autoFactor);
        ui.setAutoScale(autoFactor);
      }
    }
    /*
     * The preset, between runs only, and on the title only: never in the air
     * and never on pause, because a preset rebuilds the world behind a
     * loading screen, and not on the results either, because the rebuild
     * lands on the title (syncWorld's STAY_SCREENS has no results) and would
     * take the lap and its upload away from the pilot. Down when the
     * resolution is at its floor and the frames are still late; up once, and
     * only in a session that has not come down, when full resolution has had
     * the GPU under half a frame for most of a minute. The choice is
     * remembered as the pilot's Auto preset.
     */
    if (ui.settings.graphicsAuto && mapReady && !swapInFlight
      && (autoScale.state.demote || autoScale.state.promote)
      && mode === 'title' && ui.screen === 'title') {
      autoMovePreset();
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
      flyIfLinked();
      ui.adoptLinkedTune();
    }
  }
  /* The course a track card asked flyIfLinked for, beside the map in
   * ui.flyOnLoad, or null for a link, which names only the map. */
  let flyOnLoadCourse = null;
  /*
   * THE BUILDER'S FLY THIS MAP AND FLY THIS TRACK, carried the last step
   * into the air.
   *
   * Their links name the map, the aircraft and ?fly=1 (see linkedFly in
   * ui.js). The first two answer the gate; this answers the title, once,
   * after the first frame, when the world is on screen and the loading
   * screen has gone. Only when the map that loaded is the one the link
   * named and the gate is answered: a map that failed to load put the
   * track back and left the pilot on the title with the failure said, and
   * flying the track instead would be a second surprise on top of the
   * first. Through ui.act('fly'), the Fly row's own path, so the launch is
   * exactly the one a press gives. wakeAudio first: the browser may hold
   * the context until the first key or click, and start() resumes it then.
   */
  function flyIfLinked() {
    const wanted = ui.flyOnLoad;
    const course = flyOnLoadCourse;
    ui.flyOnLoad = null;
    flyOnLoadCourse = null;
    if (!wanted || view.id !== wanted || ui.settings.map !== wanted || ui.screen !== 'title' || ui.onGate()) {
      return;
    }
    /* A track card names the course as well as the map, because every race
     * track is `custom`: see onFlySeated below. */
    if (course != null && loadedCourseKey(view) !== course) {
      return;
    }
    setTimeout(() => {
      if (ui.screen !== 'title' || view.id !== wanted) {
        return;
      }
      wakeAudio();
      flyToGrid();
    }, 0);
  }
  /* Fly's own path, then past the launch card. A race seat stops on the
   * card, which only restates what is already seated, and every caller here
   * asked for the grid, so it presses Go the way the card's own button does. */
  function flyToGrid() {
    ui.act('fly');
    if (ui.screen === 'launch') {
      ui.act('launch-go');
    }
  }
  /*
   * FLY WHAT WAS JUST SEATED, from a track card in the Race room: a double
   * click on it, the command bar's Fly it, or the Fly it row. The owner,
   * 2026-09-27: "i should be able to double click on a track to start
   * racing it". See flyCard in ui.js, which has already seated the track.
   *
   * Whether that seat changed the world is only known here. A track that is
   * already the loaded world, which the card for the seated track is, flies
   * now. Any other has just started the swap that builds it, and flying
   * before that is on screen would fly the old world under the new name, so
   * it parks the map where the builder's link parks it, in ui.flyOnLoad,
   * and flyIfLinked takes it after the new world's first frame, off the
   * title that the swap lands on.
   *
   * WITH THE COURSE BESIDE THE MAP, because a race track and the track
   * before it are both `custom`. A load that fails puts the previous track
   * back, and flying that would be the second surprise flyIfLinked exists to
   * avoid. The key is the one the seat will build, and loadedCourseKey reads
   * the one the world actually did.
   */
  ui.onFlySeated = () => {
    const id = mapById(ui.settings.map).id;
    if (mapReady && !swapInFlight && worldMatchesSettings()) {
      wakeAudio();
      flyToGrid();
      return;
    }
    ui.flyOnLoad = id;
    flyOnLoadCourse = wantedCourseKey(id);
  };
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
  /*
   * THE SCREEN STAYS AWAKE WHILE THE PAGE IS UP (bug-011db6b9, "the screen
   * saver kicks in after some time while playing").
   *
   * A browser counts a key, a mouse move or a touch as someone being there,
   * and a radio or a gamepad is none of those: the Gamepad API does not reset
   * the idle timer. A pilot flying on sticks therefore watched the display
   * dim or blank mid lap. The Screen Wake Lock API is the browser's own way to
   * say the page is in use. It is a request, not a promise: a browser without
   * it, a refusal (battery saver, an insecure page) and a page that is not
   * visible are all quietly ignored, and the lock is dropped by the browser
   * whenever the page hides, so it is asked for again each time it comes back.
   *
   * Latency: none. Two calls when the page loads or returns to the screen,
   * nothing in the frame, the input path or the physics.
   */
  let wakeLock = null;
  const keepAwake = () => {
    if (wakeLock || document.hidden || !navigator.wakeLock) {
      return;
    }
    navigator.wakeLock.request('screen').then((lock) => {
      wakeLock = lock;
      lock.addEventListener('release', () => {
        if (wakeLock === lock) {
          wakeLock = null;
        }
      });
    }).catch(() => {});
  };
  keepAwake();
  /* A pilot's first tap or key is a gesture some browsers want before they
   * grant it, so ask again on that, once. */
  window.addEventListener('pointerdown', keepAwake, { once: true });
  window.addEventListener('keydown', keepAwake, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      keepAwake();
      /* A browser may have suspended the sound while the tab was away. See
       * MotorAudio.wake: a no-op when it is running or was never made. */
      if (ui.settings.sound) {
        audio.wake();
      }
      /* The experimental timer loop was stopped below when the page hid;
       * back on screen it resumes, and its first frame reads the same
       * capped dt an rAF return does, because prevWall was left alone. */
      if (timerPacesNow() && timerOn && timerId === 0) {
        frameTimer();
      }
      return;
    }
    /* The timer loop does not stop with a hidden page the way rAF does,
     * and throttled to a fire a second it would step the physics 100 ms at
     * a time with nobody watching. Stopped outright; restarted above. */
    if (timerId !== 0) {
      clearTimeout(timerId);
      timerId = 0;
    }
    /* The sticks' timer that polls the GPU's fences stops with the page,
     * so a fence pending now would come back timed as the whole absence.
     * Dropped untimed: see GATE_FREEZE_MS in gpugate.js. */
    gpuGate.reset();
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
  /* The flight's own frame record, for the bug report: see flightperf.js. */
  const flightPerf = createFlightPerf();
  /* Input to screen and the refresh rate, for Settings and the report: see
   * latency.js. */
  const latency = createLatencyMeter();
  shell.renderer.info.autoReset = false;
  window.__renderStats = () => ({ ...renderStats });
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
      /* What the pipeline actually uses, beside the formula above: they
       * are two things, and the formula passing while the pipeline ignored
       * the slider is how review finding F1 went unseen. Null on the race
       * field, whose scale is the canvas's (shell.pixelRatio). */
      pipeline: view && view.post && view.post.userScale != null ? {
        scale: view.post.scale,
        rw: view.post.size.x,
        rh: view.post.size.y,
        userScale: view.post.userScale,
        autoFloor: typeof view.post.autoFloor === 'function' ? view.post.autoFloor() : null,
      } : null,
      pixelRatio: shell.pixelRatio,
      /* The floor Auto actually holds, as set (autoFloorFor, clamped by
       * setFloor), and the preset's pixel floor behind it: for
       * scripts/scale-check.js, which checks review finding F6 with them. */
      auto: { floor: autoScale.state.floor, minPixels: autoMinPixels(ui.settings.graphics) },
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
  /* Flying together, for scripts/together-shots.js: what is on screen and
   * the room it is in, or null before anything asked for a room. */
  window.__together = () => (together ? together.debugState() : null);
  /* For scripts/together-shots.js: the watching camera as it is now, and
   * what one of its frames costs, timed riding behind the pilot watched on
   * the real map's colliders with a camera of its own. Harness only. */
  window.__watch = () => ({
    id: watchId,
    phase: watchCam ? watchCam.phase : '',
    cam: shell.camera.position.toArray(),
    look: new THREE.Vector3(0, 0, -1).applyQuaternion(shell.camera.quaternion).toArray(),
    fov: shell.camera.fov,
    quadVisible: shell.quad.visible,
    craft: pCurr.toArray(),
    target: watchSeen ? [watchPose.px, watchPose.py, watchPose.pz] : null,
    /* Where on screen the quad watched is, in CSS pixels. */
    onScreen: watchSeen ? (() => {
      const v = new THREE.Vector3(watchPose.px, watchPose.py, watchPose.pz).project(shell.camera);
      return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
    })() : null,
    classOn: document.documentElement.classList.contains('tg-watching'),
    /* The overview: open, the camera's pose, the pilot picked, the trail
     * length, the steps drawn and the pilots the field has kept. */
    overview: {
      on: ovOn,
      cam: ovCam ? ovCam.pos.toArray() : null,
      keep: ovKeep,
      pick: ovPick,
      trail: ovTrail,
      steps: ovTrails && ovTrails.mesh.visible ? ovTrails.mesh.geometry.instanceCount : 0,
      kept: ovField ? [...ovField.pilots.values()].map((p) => p.n) : [],
    },
  });
  window.__watchBench = async (n = 2000) => {
    const { WatchCam } = await import('./render/watchcam.js');
    const cam = new WatchCam();
    const eye = new THREE.PerspectiveCamera(85, 16 / 9, 0.2, 1000);
    const pose = { ...watchPose, cut: false };
    cam.go(eye, 0);
    cam.phase = 'riding';
    const t0 = performance.now();
    for (let i = 0; i < n; i += 1) {
      pose.px += 0.13;
      cam.frame(eye, pose, i * 16.7, watchWorld, watchHome);
    }
    return (performance.now() - t0) / n;
  };
  /* The other pilots' craft: how many it is built for and drew last frame. */
  window.__roomCraft = () => (mpCraft ? { size: mpCraftSize, drawn: mpCraft.group.getObjectByName('room-craft-bodies').count, tagged: mpCraft.tagged(), most: mpCraft.tagMost } : null);
  /* The yard track's race and where it stands, for the harness. */
  window.__yard = () => (yard ? {
    id: yard.track.id,
    near: yard.near,
    armed: yard.armed,
    started: yard.started,
    next: yard.race.next,
    laps: yard.race.laps.slice(),
    asking: ui.yardHud.asking,
    start: { ...yard.track.start },
    centre: { ...yard.track.centre },
    y: yard.track.y,
    scale: yard.track.scale,
    gates: yard.track.gates.map((g) => ({ ...g.position, heading: g.heading, virtual: g.virtual, centreY: g.aperture.centreY })),
  } : null);
  /* The whoop room's race line, for the harness: its state, or null on a
   * world that has none. */
  window.__raceLine = () => (view && view.raceLine ? view.raceLine : null);
  /* Whether the support prompt is up, and on which screen, for the checks. */
  window.__supportPrompt = () => ({ shown: Boolean(supportPrompt), screen: supportPrompt ? supportPromptScreen : null });
  /* P12 and P13 are audio budgets, and neither can be read while the audio
   * context is null: update() returns immediately and reports a cost of
   * nothing. A capture run has to click the page to satisfy the browser's
   * gesture requirement and then check that the context is real. */
  window.__audio = audio;
  /* The cost ledger. Measured on demand from the harness, never per
   * frame. __setCam parks the camera for a named view; __setCam(null)
   * gives it back to the shell. */
  /*
   * The seated aircraft, as four independent answers rather than one, so a
   * harness can catch the case where the shell and the module disagree about
   * what is flying. That is the failure this feature is most likely to have:
   * the setting says whoop, the model draws a whoop, and the plant is still
   * integrating a 710 gram quad.
   */
  window.__craft = () => ({
    setting: ui.settings.airframe,
    run: runAirframe,
    module: typeof sim.e.sim_airframe === 'function' ? sim.e.sim_airframe() : -1,
    sweepM: CRAFT_R,
    massKg: typeof sim.e.sim_bf_debug === 'function' ? sim.e.sim_bf_debug(51) : 0,
    drawn: shell.quad.name,
  });
  /*
   * WHERE THE CRAFT IS AGAINST THE FLOOR UNDER IT, which is the one thing
   * a screenshot argues about and a number settles. The pilot's report
   * that a whoop "hits the ground too soon, then lifts off the ground a
   * little when it resets" is a claim about these five numbers, and there
   * was no way to read them. Harness only.
   */
  window.__ground = () => ({
    y: pCurr.y,
    surf: view.height(pCurr.x, pCurr.z, pCurr.y - SURFACE_BIAS, pCurr.y),
    above: pCurr.y - view.height(pCurr.x, pCurr.z, pCurr.y - SURFACE_BIAS, pCurr.y),
    clearance: lastClearance,
    landed,
    rest: REST_HEIGHT,
    hits: lastGroundHits,
  });
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
  /* Balloon chase, for its checks: the game, or null while it is off. */
  window.__balloons = () => balloonGame;
  /* Dogfight, for its checks: the game, or null while there is none. */
  window.__dogfight = () => fightGame;
  window.__dogfightView = () => fightView;
  window.__dogfightHud = () => fightHud;
  window.__balloonCraft = () => ({ ...balloonCraft });
  /*
   * THE COUNTER, for the checks and the flown rigs: the live view (the
   * HUD's, skim meter included), the summary, the newest events the HUD was
   * handed and the close calls' own (lost ones included), what the last
   * close call feed measured, and how many named gaps this map has. Harness
   * only; a copy each call, so a caller cannot reach into the live state.
   */
  window.__counter = () => ({
    view: JSON.parse(JSON.stringify(score.view())),
    summary: score.summary(),
    events: counterLog.slice(),
    closeCalls: closeCallLog.slice(),
    live: { ...closeCalls.live },
    probe: { ...closeCalls.probe },
    gaps: namedGapRun.count(),
    crossings: namedGapRun.crossings,
    waiting: { gaps: namedGapRun.waiting(), closeCalls: closeCalls.waiting() },
    queries: closeCalls.queries,
    tricks: score.tricks,
  });
  window.__counterLogClear = () => {
    counterLog.length = 0;
    closeCallLog.length = 0;
  };
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
    counterCrash(true);
    chaseBail();
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
  window.__segmentCrossesAny = (ax, ay, az, bx, by, bz) => {
    if (!view.colliders) {
      return false;
    }
    return view.colliders.segmentCrossesAny(ax, ay, az, bx, by, bz);
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
  /*
   * THE MANGA LAYER, for the harness (Stage F, src/render/manga.js).
   *   state()        what the last frame drew: lines, impact, tone, focus,
   *                  speed, the impact count, and whether the map's
   *                  pipeline took the edit
   *   force(o)       hold the lines, the focus or the impact at a value,
   *                  { lines, focus: [x, y], impact }, for a measurement at
   *                  a fixed camera; null lets go
   *   clock(ms)      hold the layer's clock at a time, so a picture of the
   *                  impact frame is the same picture on every run; null
   *                  runs it free
   *   impact()       a crash's impact frame, staged: the same call the
   *                  crash makes, without the crash
   *   tone(on)       the screentone's switch, as ?tone=1 sets it
   */
  window.__manga = {
    state() {
      const m = view && view.post && view.post.manga;
      return {
        manga: Boolean(ui.manga),
        lines: manga.shown.lines,
        impact: manga.shown.impact,
        tone: manga.shown.tone,
        focus: [manga.shown.focus[0], manga.shown.focus[1]],
        speed: manga.shown.speed,
        holding: manga.holding(),
        impacts: manga.impacts,
        clockMs: manga.clockMs,
        edit: m ? { lines: Boolean(m.ok), tone: Boolean(m.tone) } : null,
        /* Whether the world's post chain draws its black ink lines now:
         * see setInkLines. */
        ink: inkLinesOn(view && view.post),
        impactOn: impactFrameOn(),
        reduced: reducedMotion(),
      };
    },
    force(o) {
      manga.force = o || null;
      return manga.force;
    },
    clock(ms) {
      manga.clockAt = ms == null ? null : Number(ms);
      if (manga.clockAt != null) {
        manga.clockMs = manga.clockAt;
      }
      return manga.clockMs;
    },
    impact() {
      return mangaCrash();
    },
    tone(on) {
      mangaToneWanted = on !== false;
      return mangaToneWanted;
    },
    /*
     * THE CENTRE THIRD, MEASURED. The post chain drawn twice at the same
     * instant of the same world, once with the strokes and once without,
     * and the canvas read back after each: every pixel that differs is a
     * stroke's. The impact frame re-inks the whole picture, so its strokes
     * are found as the difference between two seeds of it, whose re-inking
     * is the same. Returns, for each case, how many pixels changed and how
     * many of them are in the middle third of the width and of the height.
     */
    centre() {
      const post = view.post;
      const r = shell.renderer;
      const gl = r.getContext();
      const w = r.domElement.width;
      const h = r.domElement.height;
      const read = () => {
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
      };
      const draw = (force, seed) => {
        manga.force = force;
        if (seed != null) {
          manga.seed = seed;
        }
        mangaFrame(0);
        post.render();
        return read();
      };
      const savedForce = manga.force;
      const savedSeed = manga.seed;
      const out = [];
      const x0 = w / 3;
      const x1 = (2 * w) / 3;
      const y0 = h / 3;
      const y1 = (2 * h) / 3;
      const count = (a, b, name) => {
        let changed = 0;
        let centre = 0;
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const i = (y * w + x) * 4;
            if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) {
              changed += 1;
              if (x >= x0 && x < x1 && y >= y0 && y < y1) {
                centre += 1;
              }
            }
          }
        }
        out.push({ name, changed, centre });
      };
      try {
        for (const focus of [[0, 0], [0.3, 0.1667], [-0.3, -0.1667], [0.3, -0.1667], [-0.3, 0.1667]]) {
          const off = draw({ lines: 0, impact: 0, focus });
          const on = draw({ lines: 1, impact: 0, focus });
          count(off, on, `lines at ${focus.join(', ')}`);
          const a = draw({ lines: 0, impact: 1, focus }, 11);
          const b = draw({ lines: 0, impact: 1, focus }, 57);
          count(a, b, `impact strokes at ${focus.join(', ')}`);
        }
      } finally {
        manga.force = savedForce;
        manga.seed = savedSeed;
      }
      return { w, h, cases: out };
    },
    /*
     * What the layer costs, in this browser: the passes it lives in (the
     * grade, and the fxaa pass where there is one) drawn n times over the
     * same frame with the layer off, with the speed lines at full, with the
     * impact frame at full, and with the screentone, each run ended by a one
     * pixel read so the GPU's queue is inside the clock. The scene is drawn
     * once first and not timed: it is the same in every case and is most of
     * a frame, so timing it hides the layer in its noise. Under a software
     * rasteriser this is the shaders' arithmetic on the CPU, a proxy and not
     * a frame rate.
     */
    cost(n = 4, rounds = 9) {
      const post = view.post;
      const r = shell.renderer;
      if (!post || !post.grade || !post.grade.quad) {
        return null;
      }
      const gl = r.getContext();
      const px = new Uint8Array(4);
      const savedForce = manga.force;
      const toneWas = mangaToneWanted;
      const tail = () => {
        r.setRenderTarget(post.enabled.fxaa ? post.rtB : null);
        post.grade.quad.render(r);
        if (post.enabled.fxaa) {
          r.setRenderTarget(null);
          post.fxaa.quad.render(r);
        }
        r.setRenderTarget(null);
      };
      const run = (force, tone) => {
        mangaToneWanted = tone;
        manga.force = force;
        mangaFrame(0);
        post.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t0 = performance.now();
        for (let i = 0; i < n; i += 1) {
          tail();
        }
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return (performance.now() - t0) / n;
      };
      /* Interleaved, several rounds, and the median of each: a software
       * rasteriser's clock drifts by more than the layer costs, and a run
       * of one case after another would measure the drift. */
      const median = (xs) => {
        const q = xs.slice().sort((x, y) => x - y);
        return q[Math.floor(q.length / 2)];
      };
      const cases = {
        off: [{ lines: 0, impact: 0 }, false],
        lines: [{ lines: 1, impact: 0, focus: [0, 0] }, false],
        impact: [{ lines: 0, impact: 1, focus: [0, 0] }, false],
        tone: [{ lines: 0, impact: 0 }, true],
      };
      const times = { off: [], lines: [], impact: [], tone: [] };
      let toneOn = 0;
      try {
        for (let round = 0; round < rounds; round += 1) {
          for (const k of Object.keys(cases)) {
            times[k].push(run(cases[k][0], cases[k][1]));
            if (k === 'tone') {
              toneOn = manga.shown.tone;
            }
          }
        }
        return {
          n,
          rounds,
          fxaa: Boolean(post.enabled.fxaa),
          offMs: median(times.off),
          linesMs: median(times.lines),
          impactMs: median(times.impact),
          toneMs: toneOn ? median(times.tone) : null,
          spreadOffMs: [Math.min(...times.off), Math.max(...times.off)],
        };
      } finally {
        manga.force = savedForce;
        mangaToneWanted = toneWas;
      }
    },
  };
  /* Which control mode the plant is actually in. A rig that thinks it is
   * flying acro and is not measures nothing: angle cannot loop. */
  window.__flightMode = () => (angleModeOn ? 'angle' : 'acro');
  /* Whether the module is flying prop wash, as the shell last told it. */
  window.__propwash = () => runWash;
  /* What 3D mode the module is flying, and what the module says it is. */
  window.__mode3d = () => ({
    shell: run3d,
    module: typeof sim.e.sim_3d === 'function' ? sim.e.sim_3d() === 1 : null,
  });
  /*
   * The air, READ BACK OUT OF THE MODULE rather than out of the menu, which
   * is the same discipline the PIDs panel keeps: a slider that stopped
   * reaching the plant has to be visible as a slider that moves nothing.
   * `run` is what the shell believes the current lap is being flown in and
   * is what the record key is built from, so the two disagreeing is a bug
   * with a name rather than a mystery. Harness only.
   */
  window.__air = () => ({
    setting: ui.settings.weight,
    run: runWeight,
    scale: runGravityScale,
    module: typeof sim.e.sim_gravity === 'function' ? sim.e.sim_gravity() : null,
    key: recordKey(),
    /* Flight feel tuning, the same discipline: what the menu holds, what the
     * run believes, and what the module says back. `calls` is how many times
     * either export was invoked, which is zero for any flight that never
     * left stock. */
    tuning: Boolean(ui.settings.feelTuning),
    airGrip: runAirGrip,
    airScale: runAirScale,
    moduleAir: typeof sim.e.sim_air === 'function' ? sim.e.sim_air() : null,
    motorKv: runMotorKv,
    kvScale: runKvScale,
    moduleKv: typeof sim.e.sim_motor_kv === 'function' ? sim.e.sim_motor_kv() : null,
    calls: tuneCalls,
    tuned: race.tuned === true,
    flown: tuneLog.dominant(),
  });
  window.__contacts = () => ({
    ...passStats,
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
      scale: ghostRig.group.scale.x,
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
  /*
   * Replay mode: advance the replay clock by a fixed amount for
   * frame-by-frame capture. When called, switches to step mode and pauses
   * the real-time clock. Call with ms = 0 to initialize step mode, then
   * call with positive ms to advance frame by frame.
   */
  window.__replayStep = (ms) => {
    if (!replayMode || !ghostLap) {
      return { error: 'Replay mode not active or ghost not loaded' };
    }
    if (!Number.isFinite(ms) || ms < 0) {
      return { error: 'Step must be a finite non-negative number' };
    }
    if (!replayStepMode) {
      /* Initialize step mode */
      replayStepMode = true;
      replayClock = { startMs: simTimeMs, vt: 0 };
    }
    if (ms === 0) {
      /* Reset to start */
      replayClock.vt = 0;
      replayChaseCam = null;
    } else {
      replayClock.vt += ms;
    }
    /* Cap at ghost duration */
    if (replayClock.vt > ghostLap.durationMs) {
      replayClock.vt = ghostLap.durationMs;
    }
    return { vt: replayClock.vt, durationMs: ghostLap.durationMs };
  };
  window.__replayInfo = () => ({
    active: replayMode,
    state: replayState,
    timeId: replayTimeId,
    camera: replayCamera,
    clean: replayClean,
    stepMode: replayStepMode,
    clock: replayClock ? { startMs: replayClock.startMs, vt: replayClock.vt } : null,
    /* The lap clock, which a real time replay is timed on. Every reset()
     * puts it back to 0, so a check can see that R landed even in step
     * mode, where vt does not follow it. */
    simMs: simTimeMs,
    ghostLoaded: ghostLap != null,
    cameraPosition: shell.camera ? {
      x: shell.camera.position.x,
      y: shell.camera.position.y,
      z: shell.camera.position.z
    } : null,
  });
  window.__race = () => ({
    laps: race ? race.laps : [],
    /* Where the order stands and where each station is, for the checks that
     * fly the course (scripts/gate-settings-check.js): harness only. */
    next: race && !race.freestyle ? race.next : -1,
    lapStartMs: race ? race.lapStartMs : null,
    mixed: race ? race.mixed : false,
    gates: race && !race.freestyle
      ? race.gates.map((g) => ({ x: g.x, y: g.y, z: g.z, az: g.az })) : [],
  });
  /* The module itself, for scripts/feel-measure.js: a probe wraps its step
   * to read the state after every 1 ms step, which is the only clock the
   * flight feel can be measured on without a frame's jitter in it. Read
   * only by the harness; nothing here calls it. */
  window.__simModule = () => sim;
  /* Fly the seated aircraft at another world scale, or null for the one the
   * map and the aircraft ask for: scripts/feel-measure.js, which flies one
   * aircraft at two scales on one map to show the seam converts everything.
   * Between runs, as every scale change is: the craft is set down at the
   * spawn after it. Harness only. */
  window.__forceWorldScale = (ws) => {
    forcedWorldScale = ws == null ? null : Number(ws);
    if (seatWorldScale()) {
      uploadPlantWorld();
      seatWorldFrame();
    }
    reset();
    return WORLD_SCALE;
  };
  window.__craftState = () => ({
    mode,
    flownThisRun,
    /* The run's airtime in sim milliseconds, which the tune invitation counts
     * (check:tuneinvite): harness only. */
    airMs: airtimeMs,
    /* The plant's own pack volts, which the OSD scales to the airframe's
     * cells: a check can see the display change and the physics not. */
    packVolts: stateCurr ? stateCurr[18] : null,
    landed,
    /* No automatic crash exists since 2026-09-24 (see the note above
     * clipGraceUntil). Kept, always false, because probes read them. */
    crashed: false,
    clipCrash: false,
    clipCrashKind: '',
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
    groundClearance: shell.quad.position.y - view.height(shell.quad.position.x, shell.quad.position.z, shell.quad.position.y - SURFACE_BIAS, shell.quad.position.y),
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
      /* And the span up and down, the aircraft's own metres, so a check can
       * hold the drawn machine against the hull that sweeps it on every
       * axis rather than only across. scripts/craft-check.js does. */
      craftUpTrue: CRAFT_V_UP,
      craftDownTrue: CRAFT_V_DOWN,
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
    const hy = view.height(pProbe.x, pProbe.z, pProbe.y - SURFACE_BIAS, pProbe.y);
    const seatY = kind === 'invertedAir' ? hy + 4 : hy + restW();
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
    haveRecoverFrom = false;
    parkedLift = 0;
    liftFloorY = null;
    adoptSimClock();
    acc = 0;
    groundY = hy;
    stateCurr = readState();
    statePrev = stateCurr;
    raiseGroundFromState(stateCurr);
    lastGroundHits = sim.e.sim_ground_contacts();
    lastClearance = kind === 'invertedAir' ? 4 : restW();
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
    lastCamFloor = view.height(fpvPos.x, fpvPos.z, fpvPos.y - SURFACE_BIAS, fpvPos.y) + lastCamClear;
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
    clipGraceUntil = 0;
    mode = 'flight';
    ui.show('flight');
    /* A place is a teleport: the recovery's last open air is somewhere else
     * now. The plant forgets its own previous points in sim_set_pose, and the
     * counter's gaps and close calls forget theirs. */
    haveRecoverFrom = false;
    namedGapRun.cut();
    closeCalls.cut();
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
  /* Harness: __placeCraft, then hold the craft there nose down by
   * `pitchDeg` with the integrator frozen (poseLock, as __seatCraft's
   * cameraDown), so a capture of the FPV view at a height and an attitude
   * is the same picture however slow the rasteriser is. */
  window.__holdCraft = (x, y, z, pitchDeg = 0) => {
    if (!window.__placeCraft(x, y, z)) {
      return null;
    }
    const h = (pitchDeg * Math.PI) / 360;
    worldPosToSim(x, y, z, pSim);
    const code = sim.e.sim_set_pose(pSim.x, pSim.y, pSim.z, Math.cos(h), 0, Math.sin(h), 0);
    if (code !== SIM_OK) {
      return { ok: false, code };
    }
    sim.rest();
    poseLock = true;
    stateCurr = readState();
    statePrev = stateCurr;
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
  /*
   * The same numbers, on the path a pilot can actually send us.
   *
   * __stickPath below is a console readback and has been since round 19,
   * which means the one measurement that settles "is this browser rAF-locked
   * on gamepad input" has only ever been reachable by somebody who already
   * knew to open DevTools and type it. Nobody did. Five feel reports later
   * the question was still open, so the probe goes where the reports are
   * written: ui.bugSnapshot calls this at the moment the pilot hits send.
   *
   * fps rides along because it is the number padHz has to be read against.
   * padHz of 60 means nothing on its own; padHz of 60 on a 60 fps display
   * means the browser is handing us one stick value per frame and no amount
   * of polling will move it.
   */
  ui.setStickProbe(() => ({
    ...input.stats(),
    rcHz: RC_HZ,
    fps: Math.round(fps),
    /*
     * What the controller was actually flying and what the keys were set to
     * do. The report's own flightMode is the Flight mode ROW, which a race
     * on keys does not read: bug-92007f3e was filed on the keyboard from the
     * pause screen of a twelve gate race, which flies Angle, and its report
     * said "acro". Inside `stick` rather than beside it, because the board
     * caps a report at 32 top level keys.
     */
    flying: angleModeOn ? 'angle' : 'acro',
    keyRaceMode: ui.settings.keyRaceMode,
    keyThrottle: input.keyThrottle,
    keyHover: Math.round(input.kbHover * 1000) / 10,
    /* Which axes are being flown and what they read: see mapReport.
     * bug-c9423f3e could not be checked without it. */
    map: input.mapReport(),
    /* What the browser listed, which `map` above cannot say when it is null:
     * bug-616cc604 and three Safari tickets before it read the same with no
     * pad, and nothing in them said whether the browser had listed nothing
     * or something this page dropped. See browserPads in input.js. */
    pads: input.browserPads(),
    /* What the radio last did to a menu, which is what a pause that resumed
     * itself needs a report to say: see padLogReport in ui.js and
     * bug-2d93629e. */
    menu: ui.padLogReport(),
    /* padHz, sampleHz and fps above are read at the moment of sending,
     * from a menu with the sticks at rest. This is the flight: its stick
     * refresh ceiling and how far each channel went. See flightRec in
     * input.js. bug-08577148. */
    flight: input.flightReport(),
  }));
  /*
   * WHAT THE FRAMES COST WHILE FLYING, and what the browser gave the canvas,
   * for a report about lag: bug-e82b8bb8 said 60 fps from the pause screen
   * and nothing else. One top level key, `perf`, because the board caps a
   * report at 32 of them and a feel report already carries about twenty
   * five. `flight` is the flying frames only (see flightperf.js); the rest
   * is read at the moment of sending, and none of it changes mid flight.
   */
  ui.setPerfProbe(() => ({
    flight: flightPerf.report(),
    lowLatency: shell.granted.desynchronized,
    opaque: shell.granted.opaque,
    pixelRatio: Math.round(shell.pixelRatio * 100) / 100,
    /* The Shadows row, because Medium with it Off is a lighter machine than
     * the report's graphics field says. */
    shadowsOff: Boolean(ui.settings.shadowsOff),
    /* Auto graphics: its resolution factor now, and whether it moved the
     * preset this session. Null when the pilot fixed a preset by hand. */
    auto: ui.settings.graphicsAuto
      ? { scale: Math.round(autoFactor * 100) / 100, down: autoDemoted, up: autoPromoted }
      : null,
    /* The GPU's time over a frame, queue included, and draws the guard held
     * back for it: see gpugate.js. */
    gpuMs: gpuGate.state.samples ? Math.round(gpuGate.state.gpuMs * 10) / 10 : null,
    held: gpuGate.state.skipped,
    /* Key to screen as this browser reports it, and the refresh rate: see
     * latency.js. And whether the flight was fullscreen. */
    keyToScreen: latency.report(),
    hz: latency.refreshHz(),
    fullscreen: Boolean(document.fullscreenElement),
    /* Which loop paces the frames now and what the Frame pacing row says,
     * because the loop changes the meaning of fps, hz and keyToScreen. */
    loop: timerLoop ? 'timer' : 'raf',
    pacing: ui.settings.pacing,
    /* The predicted view's setting and the horizon it last looked ahead in
     * flight: see predictView before the draw. */
    predict: ui.settings.predictView !== false ? Math.round(predictLastMs * 10) / 10 : 0,
    cores: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 0,
    /* What the browser is doing with the sound: bug-453fb074, "SOUND JUST
     * STOPPED WORKING", arrived with nothing to say whether the context was
     * running, suspended or never made, or whether the pilot had it off. */
    audio: { ...audio.report(), sound: ui.settings.sound, volume: ui.settings.volume },
  }));
  /*
   * THE CRAFT AT THE MOMENT OF A REPORT, the one thing a "stuck" ticket could not say: whether it was parked or in the
   * air, on its back or waiting for a stick to centre (turtle: 'recover'), how long it had been still, where it was,
   * how many times it had been set down in the last two minutes and why, which stick keys the page believed were down
   * (a key whose release was lost holds a throttle at zero for good), and what the sticks were feeding the sim. One
   * key, `craft`, because the board caps a report at 32 of them, and a few hundred characters of the 8000.
   */
  ui.setCraftProbe(() => {
    const st = stateCurr;
    const now = performance.now();
    const r1 = (v) => Math.round(v * 10) / 10;
    const r2 = (v) => Math.round(v * 100) / 100;
    const recent = setDowns.filter((d) => now - d.atMs <= 120000);
    const last = setDowns.length ? setDowns[setDowns.length - 1] : null;
    const ch = input.channels || {};
    return {
      landed,
      turtle: turtleFlip.active ? 'flip' : (turtleWait ? 'wait' : (turtleRecover ? 'recover' : null)),
      upZ: st ? r2(plantUpZ(st)) : null,
      speed: st ? r1(plantSpeed(st)) : null,
      at: [r1(shell.quad.position.x), r1(shell.quad.position.y), r1(shell.quad.position.z)],
      stillS: stuckSinceMs >= 0 ? r1((simTimeMs - stuckSinceMs) / 1000) : 0,
      setDowns: {
        n: recent.length,
        lastAgoS: last ? Math.round((now - last.atMs) / 1000) : null,
        lastWhy: last ? `${last.why}${last.line ? '+line' : ''}` : null,
      },
      keys: [...input.keys].filter((k) => input.isStickKey(k)).sort(),
      sticks: [r2(ch.roll || 0), r2(ch.pitch || 0), r2(ch.yaw || 0), r2(ch.throttle || 0)],
    };
  });
  ui.setLatencyProbe(() => ({
    supported: latency.supported,
    key: latency.report(),
    hz: latency.refreshHz(),
    gpuMs: gpuGate.state.samples ? gpuGate.state.gpuMs : null,
    lowLatency: shell.granted.desynchronized && ui.settings.lowLatency !== false,
  }));
  /*
   * FLIGHT FEEL TUNING'S TWO HANDLES ON THE MODULE, given to the Ui rather
   * than reached for by it.
   *
   * The probe is the flight the question at its end is about: the
   * combination of Weight, Air grip and Motor power that was flown longest
   * this flight, with its airtime, or null when nothing was flown off stock
   * in the mode (src/share/tune.js, TuneLog). The caps are which sliders this
   * module can honestly move. An older dist/sim.wasm has neither export, and
   * a slider that moves nothing is a lie, so the Ui draws only the rows the
   * module can answer.
   */
  ui.setTuneProbe(() => {
    const d = tuneLog.dominant();
    return d ? { ...d, airtimeS: d.ms / 1000 } : null;
  });
  ui.setTuneCaps({
    air: typeof sim.e.sim_set_air === 'function',
    kv: typeof sim.e.sim_set_motor_kv === 'function',
  });
  window.__perfProbe = () => (ui.perfProbe ? ui.perfProbe() : null);
  /* The predicted view on the last frame: whether it moved the camera, how
   * far ahead it looked and how far it turned and moved the view. Harness
   * only. */
  /* The props in view and the craft's shadow, as the last frame left them:
   * src/render/propview.js. `ndc` is where each prop vertex landed on the
   * picture, as a box, so a check can say how much of the frame they take. */
  window.__propView = () => {
    const st = propView.state();
    const g = propView.props.geometry.getAttribute('position');
    let box = null;
    if (g && propView.props.visible) {
      const v = new THREE.Vector3();
      box = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      for (let i = 0; i < g.count; i += 1) {
        v.fromBufferAttribute(g, i).applyMatrix4(propView.props.matrix).project(shell.camera);
        if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) {
          box.x0 = Math.min(box.x0, v.x);
          box.x1 = Math.max(box.x1, v.x);
          box.y0 = Math.min(box.y0, v.y);
          box.y1 = Math.max(box.y1, v.y);
        }
      }
    }
    return { ...st, fpvLens, ndc: box, shadowAt: propView.shadow.visible
      ? [propView.shadow.matrix.elements[12], propView.shadow.matrix.elements[13], propView.shadow.matrix.elements[14]] : null };
  };
  window.__predict = () => ({
    on: ui.settings.predictView !== false,
    applied: predictApplied,
    horizonMs: predictLastMs,
    turnDeg: 2 * Math.acos(Math.min(1, Math.abs(predDq.w))) * 180 / Math.PI,
    moveM: predDp.length(),
    /* The body rate and speed it predicted from, so a probe can check the
     * turn is the rate times the horizon. */
    rateDegS: stateCurr ? Math.hypot(stateCurr[11], stateCurr[12], stateCurr[13]) * 180 / Math.PI : 0,
    speedMs: stateCurr ? Math.hypot(stateCurr[4], stateCurr[5], stateCurr[6]) : 0,
  });
  /* Auto graphics and the GPU guard as they stand. Harness only. */
  window.__auto = () => ({
    auto: ui.settings.graphicsAuto,
    graphics: ui.settings.graphics,
    factor: autoFactor,
    pixelRatio: shell.pixelRatio,
    ...autoScale.state,
    gate: { ...gpuGate.state },
    demoted: autoDemoted,
    promoted: autoPromoted,
  });
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
  /* Harness: the cars as last drawn from the physics (the pose at the lap
   * clock), and the chase: its meter, and the events it has sent since the
   * page loaded, the newest CHASE_LOG_MAX, with whether each paid. Nothing
   * in the shell reads either. */
  window.__vehicles = () => (trafficOn
    ? carCurr.filter((p) => p.on).map((p) => ({
      slot: carCurr.indexOf(p), x: p.x, y: p.y, z: p.z, hx: p.hx, hz: p.hz, tx: p.tx, tz: p.tz,
      vx: p.vx, vy: p.vy, vz: p.vz, speed: p.speed, distance: p.distance, slip: p.slip, curvature: p.curvature,
    }))
    : []);
  window.__chase = () => ({
    cars: chase.carCount(),
    meter: { ...chase.view() },
    log: chaseLog.slice(),
    bonus: chaseBonusCount,
  });
  window.__chaseLogClear = () => {
    chaseLog.length = 0;
    chaseBonusCount = 0;
    return true;
  };
  /* Harness: the STF mark on this map (null where it carries none),
   * whether this run has found it, and this browser's stamp for it. */
  /* The map's stickers: where each is, and which this browser has found.
   * Harness only. */
  window.__clips = () => ({
    played: clipVoice.played,
    playing: clipVoice.playing ? clipVoice.playing.name : null,
    fetched: [...clipVoice.els.keys()],
    voice: (view && view.clips) || null,
  });
  window.__stickers = () => ({
    stickers: (view.stickers ?? []).map((s) => ({
      id: s.id, name: s.name, achievement: s.achievement, key: s.key, p: s.p, n: s.n, w: s.w, h: s.h,
    })),
    found: [...stickersFound],
    sheetDecoded: (view.stickers ?? []).every((s) => Boolean(s.sheet && s.sheet.image)),
    everySighting: view.stickersEverySighting === true,
    callouts: stickerCallouts,
    ninety: view.stickersNinety ? { need: view.stickersNinety.need, done: ninetyDone } : null,
  });
  /* The partners' marks, the same way. Harness only. */
  window.__marks = () => ({
    marks: view.marks ?? [],
    found: [...marksFound],
    seen: marksSeenView === view ? [...marksSeen] : [],
    stamped: (view.marks ?? []).map((m) => ({ slug: m.slug, stamp: stampFor(m.key) })),
  });
  window.__egg = () => ({
    egg: view.egg ?? null,
    foundThisFlight: eggFound,
    stamped: view.egg ? stampFor(view.egg.key) : null,
  });
  /* Which world is loaded, what it cost, and what is solid in it. Harness
   * only; nothing in the shell reads these. */
  window.__map = () => ({
    id: view.id,
    /* The key the tune invitation counts this course under: harness only. */
    course: ghostCourseKey(),
    name: view.name,
    mode: view.mode,
    graphics: view.graphics,
    shadowsOff: Boolean(view.shadowsOff),
    gates: view.gates.length,
    sponsorsPainted: view.sponsorsPainted ?? 0,
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
  /* The goat map's herd (src/maps/goats/index.js), for scripts/shots.js
   * and its own check: every goat's plan point and mode, and the herd
   * itself, so a capture can put a goat where it needs one. Harness only. */
  window.__goats = () => (view && view.goatGame ? { goats: view.goatGame.goats(), herd: view.goatGame.herd } : null);
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
  /* Dan's ear, on a RaceGOW room (src/maps/dan/), or null. Harness only. */
  window.__judge = () => view.judge ?? null;
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
  window.__surface = (x, z, fromY, cgY) => view.height(x, z, fromY, cgY);
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
      craftVerticalOffset(),
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
  /*
   * Steam edition: career. THE CAREER'S HANDLE ON THE GAME: everything
   * src/career/controller.js may ask of this file, and nothing else. It
   * seats a lesson's world and aircraft, starts and stops a run, holds the
   * lesson's flight mode and camera, and gives the pilot's own world back
   * when they leave. The controller never touches `mode`, the plant or the
   * settings itself, so the rules this file keeps about them stay kept here.
   *
   * THE PILOT'S OWN, KEPT. A lesson seats the five inch and the lesson's
   * world through the same settings every other door uses, so the swap and
   * the airframe change take the same paths and the same guards. What was
   * seated before is kept in careerSaved and put back by careerLeaveWorld,
   * the first time a lesson is entered and not again, so a run of lessons
   * still returns the pilot to the world they came from.
   */
  let careerSaved = null;

  /* A lesson's world is keyed by what is in it, its id and name aside, so
   * two lessons on the same field share one build. */
  function careerKeyOf(doc) {
    const text = JSON.stringify({ ...doc, id: '', name: '' });
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) {
      h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    }
    return `career:${h.toString(36)}.${text.length.toString(36)}`;
  }

  /* Wait for the world a lesson asked for, or say it will not come. The
   * swap is started by applySettings and may queue behind one in flight, so
   * this nudges syncWorld once the way is clear, as the swap's own tail
   * does. */
  function careerWaitWorld(key, timeoutMs = 90000) {
    const t0 = performance.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (careerFailed === key) {
          reject(new Error('This lesson\'s world could not be built.'));
          return;
        }
        if (mapReady && !swapInFlight) {
          if (loadedCourseKey(view) === key) {
            resolve(view);
            return;
          }
          if (!worldMatchesSettings()) {
            syncWorld();
          }
        }
        if (performance.now() - t0 > timeoutMs) {
          reject(new Error('This lesson\'s world took too long to build.'));
          return;
        }
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  /* To the title, quietly: the career's screens are over it. */
  function careerToTitle() {
    ui.setCareerLesson(null);
    if (mode !== 'title') {
      mode = 'title';
      reset();
    }
    if (ui.screen !== 'title') {
      ui.show('title');
    }
  }

  async function careerEnterWorld(w) {
    if (!careerSaved) {
      careerSaved = { map: ui.settings.map, airframe: ui.settings.airframe };
    }
    /* A fixed map (the houses, the shop, the town) brings its own
     * document, so its lessons hand none and are keyed by the map. */
    const key = careerKeyOf(w.doc || { map: w.map });
    careerFailed = '';
    careerWorld = { map: w.map, doc: w.doc, key };
    careerToTitle();
    ui.settings.map = w.map;
    ui.settings.airframe = airframeById(w.airframe || '5inch').id;
    /* The airframe and the world, on the between runs rules every other
     * door takes. See applySettings. */
    applySettings(ui.settings);
    await careerWaitWorld(key);
    return view;
  }

  async function careerLeaveWorld() {
    careerWorld = null;
    careerFlightMode = null;
    careerCamera = null;
    careerToTitle();
    const saved = careerSaved;
    careerSaved = null;
    if (saved) {
      ui.settings.map = saved.map;
      ui.settings.airframe = saved.airframe;
    }
    applySettings(ui.settings);
    ui.renderMenu();
  }

  /* A fresh run of the lesson, straight in: no pad shot, because the
   * briefing was the introduction. `then` runs once the run is live. */
  function careerFly(then) {
    whenConfigReady(() => {
      reset();
      mode = 'flight';
      ui.show('flight');
      introMs = -1;
      careerChaseCam.atMs = -1;
      if (career) {
        ui.setCareerLesson(career.lesson());
      }
      if (then) {
        then();
      }
    });
  }

  /* Hold the world still under a career screen: the results, or a briefing
   * opened from the pause menu. The pause screen is underneath and hidden.
   * A lesson's results take the race's finish camera, which pulls off the
   * lens onto the quad where it finished. */
  function careerFreeze(kind) {
    if (mode === 'flight') {
      mode = kind === 'results' ? 'results' : 'paused';
    }
    if (ui.screen !== 'paused') {
      ui.show('paused');
    }
  }

  /*
   * THE CHASE CAMERA the first lessons fly with: behind and above the quad,
   * turning with its heading and never with its bank, so a first hover is
   * watched the way a model is flown from the field. Smoothed on the wall
   * clock, which is the render's own business: nothing here reaches the
   * physics, and the FPV mount is where every other lesson flies from.
   */
  const careerChaseCam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), atMs: -1 };
  const careerChaseFwd = new THREE.Vector3();
  const careerChaseWant = new THREE.Vector3();
  const careerChaseLook = new THREE.Vector3();
  const CAREER_CHASE_BACK = 2.5;
  const CAREER_CHASE_UP = 1.05;
  const CAREER_CHASE_AHEAD = 3.5;
  const CAREER_CHASE_TAU_MS = 220;
  function careerChase(nowWall) {
    shell.quad.visible = true;
    predictCam = false;
    careerChaseFwd.set(0, 0, -1).applyQuaternion(qPrev);
    careerChaseFwd.y = 0;
    if (careerChaseFwd.lengthSq() < 1e-6) {
      careerChaseFwd.set(0, 0, -1);
    }
    careerChaseFwd.normalize();
    careerChaseWant.copy(pCurr).addScaledVector(careerChaseFwd, -CAREER_CHASE_BACK);
    careerChaseWant.y += CAREER_CHASE_UP;
    const floor = view.height(careerChaseWant.x, careerChaseWant.z, careerChaseWant.y, careerChaseWant.y) + 0.35;
    if (careerChaseWant.y < floor) {
      careerChaseWant.y = floor;
    }
    careerChaseLook.copy(pCurr).addScaledVector(careerChaseFwd, CAREER_CHASE_AHEAD);
    careerChaseLook.y = pCurr.y + 0.2;
    const dt = careerChaseCam.atMs < 0 ? Infinity : Math.max(0, nowWall - careerChaseCam.atMs);
    careerChaseCam.atMs = nowWall;
    if (!Number.isFinite(dt) || dt > 400 || careerChaseCam.pos.distanceToSquared(careerChaseWant) > 400) {
      careerChaseCam.pos.copy(careerChaseWant);
      careerChaseCam.look.copy(careerChaseLook);
    } else {
      const k = 1 - Math.exp(-dt / CAREER_CHASE_TAU_MS);
      careerChaseCam.pos.lerp(careerChaseWant, k);
      careerChaseCam.look.lerp(careerChaseLook, k);
    }
    shell.camera.up.set(0, 1, 0);
    shell.camera.position.copy(careerChaseCam.pos);
    shell.camera.lookAt(careerChaseCam.look);
    if (shell.camera.fov !== 70) {
      shell.camera.fov = 70;
      shell.camera.updateProjectionMatrix();
    }
    setCameraNear(CAMERA_NEAR_OPEN);
  }

  /* What the watching camera asks of the map: the ground under a point,
   * and how far a point is from the nearest solid. Made once, not once a
   * frame; `view` is read when they are called, so a new map needs none. */
  const watchWorld = {
    floor: (x, z, y) => view.height(x, z, y, y),
    gap: (x, y, z) => (view.colliders ? view.colliders.gapAt(x, y, z, 0.4) : Infinity),
  };
  /* Where the camera lands on the way back: the goggles, as this frame
   * worked them out, and the pilot's own lens. */
  const watchHome = { pos: fpvPos, quat: fpvQuat, fov: 85 };

  function watchCamReady() {
    if (watchCam) {
      return Promise.resolve(watchCam);
    }
    if (!watchCamLoading) {
      watchCamLoading = import('./render/watchcam.js').then(({ WatchCam }) => {
        watchCam = new WatchCam();
        return watchCam;
      }).catch((e) => {
        watchCamLoading = null;
        throw e;
      });
    }
    return watchCamLoading;
  }

  function watchStart(id, same = false) {
    if (same) {
      if (!watchId) {
        return false;
      }
      watchId = id;
      watchSeen = false;
      return true;
    }
    if (!id || camOverride) {
      return false;
    }
    if (mode === 'flight' && ui.screen === 'flight') {
      ui.act('pause');
      ui.show('paused');
    }
    if (mode !== 'paused' || ui.screen !== 'paused') {
      return false;
    }
    /* From the overview down behind a pilot: the overview is put away and
     * the camera flies from where it is. */
    if (ovOn) {
      ovOn = false;
      ovPick = id;
      document.documentElement.classList.remove('tg-overview');
      if (ovTrails) {
        ovTrails.hide();
      }
    }
    /* The pad shot is over: the pilot has already seen their quad, and
     * coming home into the middle of it would cut the camera away again. */
    introMs = -1;
    watchId = id;
    watchSeen = false;
    document.documentElement.classList.add('tg-watching');
    /* The pause menu is hidden, not gone: nothing on it keeps the focus,
     * or Enter would press a row the pilot cannot see. */
    if (document.activeElement && document.activeElement !== document.body
        && !document.activeElement.closest('#tg')) {
      document.activeElement.blur();
    }
    watchCamReady().then((cam) => {
      if (watchId === id) {
        cam.free(null);
        cam.go(shell.camera, performance.now());
      }
    }).catch((e) => {
      watchStop(true);
      mpSay(`Could not watch.\n${e.message ?? e}`, 5000);
    });
    return true;
  }

  function watchStop(now) {
    const flying = Boolean(watchCam && watchCam.on);
    if (!watchId && !flying && !ovOn) {
      return;
    }
    watchId = 0;
    watchSeen = false;
    ovOn = false;
    ovKeep = false;
    document.documentElement.classList.remove('tg-overview');
    if (ovTrails) {
      ovTrails.hide();
    }
    if (now || !flying || mode !== 'paused') {
      if (watchCam) {
        watchCam.stop();
      }
      document.documentElement.classList.remove('tg-watching');
      /* Asked home before the camera had left the goggles (its file still
       * on its way): it is home already, so the flight carries on. */
      if (!now && !flying && mode === 'paused' && ui.screen === 'paused') {
        ui.act('resume');
      }
      return;
    }
    watchCam.leave(shell.camera, performance.now());
  }

  /* The overview's camera and trails, fetched the first time it opens. */
  function overviewReady() {
    if (ovCam) {
      return Promise.resolve(ovCam);
    }
    if (!ovLoading) {
      ovLoading = Promise.all([import('./render/overviewcam.js'), import('./render/trails.js')]).then(([oc, tr]) => {
        ovCam = new oc.OverviewCam();
        ovRig.pos = ovCam.pos;
        ovRig.quat = ovCam.quat;
        ovRig.fov = ovCam.fov;
        ovTrails = tr.buildTrails();
        ovTrails.lengths = tr.TRAIL_LENGTHS;
        shell.keepAcrossMaps(ovTrails.mesh);
        return ovCam;
      }).catch((e) => {
        ovLoading = null;
        throw e;
      });
    }
    return ovLoading;
  }

  /* What the overview frames: the course's gates, or else every pilot in
   * the room and this one's own quad, with room round them. */
  function overviewBounds() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let y = Infinity;
    const take = (x, py, z) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      if (py < y) y = py;
    };
    if (race && !race.freestyle && race.gates.length) {
      for (const g of race.gates) take(g.x, g.y, g.z);
    } else {
      take(pCurr.x, view ? view.height(pCurr.x, pCurr.z, pCurr.y, pCurr.y) : pCurr.y, pCurr.z);
      if (ovField) {
        for (const p of ovField.pilots.values()) take(p.lx, Math.min(p.ly, y), p.lz);
      }
      const pad = 15;
      minX -= pad;
      maxX += pad;
      minZ -= pad;
      maxZ += pad;
    }
    return { minX, maxX, minZ, maxZ, y: Number.isFinite(y) ? y : 0 };
  }

  function overviewAspect() {
    return shell.camera.aspect || 16 / 9;
  }

  /*
   * Into the overview: from flight, the flight pauses with its menu hidden
   * as it does to watch a pilot; from watching, the camera flies up off the
   * quad it was behind, and that pilot stays picked.
   */
  function overviewStart() {
    if (ovOn) {
      return true;
    }
    if (camOverride) {
      return false;
    }
    if (watchId) {
      ovPick = watchId > 0 ? watchId : ovPick;
      watchId = 0;
      watchSeen = false;
    } else {
      if (mode === 'flight' && ui.screen === 'flight') {
        ui.act('pause');
        ui.show('paused');
      }
      if (mode !== 'paused' || ui.screen !== 'paused') {
        return false;
      }
      introMs = -1;
      document.documentElement.classList.add('tg-watching');
      if (document.activeElement && document.activeElement !== document.body
          && !document.activeElement.closest('#tg')) {
        document.activeElement.blur();
      }
    }
    ovOn = true;
    ovKeep = false;
    ovThrottle0 = null;
    document.documentElement.classList.add('tg-overview');
    Promise.all([watchCamReady(), overviewReady()]).then(([cam, oc]) => {
      if (!ovOn) {
        return;
      }
      oc.setBounds(overviewBounds());
      oc.whole(overviewAspect());
      ovLastMs = performance.now();
      cam.free(ovRig);
      cam.go(shell.camera, ovLastMs);
      if (shell.quad.parent && ovTrails.mesh.parent !== shell.quad.parent) {
        shell.quad.parent.add(ovTrails.mesh);
      }
    }).catch((e) => {
      watchStop(true);
      mpSay(`Could not open the overview.\n${e.message ?? e}`, 5000);
    });
    return true;
  }

  /* The overview's buttons and keys, from src/net/together.js. */
  function overviewDo(what, arg) {
    if (!ovOn || !ovCam) {
      return false;
    }
    if (what === 'whole' || what === 'map') {
      ovCam.setBounds(overviewBounds());
      ovKeep = false;
      if (what === 'whole') ovCam.whole(overviewAspect());
      else ovCam.map(overviewAspect());
    } else if (what === 'pick') {
      ovPick = arg || 0;
      if (ovKeep) {
        ovKeepSeen = false;
        if (!ovPick) ovKeep = false;
      }
    } else if (what === 'keep') {
      ovKeep = Boolean(arg) && Boolean(ovPick);
      ovKeepSeen = false;
      if (!ovKeep) {
        ovCam.release();
      }
    } else if (what === 'trails') {
      ovTrail = (arg ?? ovTrail + 1) % ovTrails.lengths.length;
    } else if (what === 'zoom') {
      ovCam.zoom(arg.steps, arg.ray || null, watchWorld);
    } else if (what === 'grab') {
      if (ovKeep && !arg.look) {
        ovKeep = false;
        ovCam.release();
      }
      if (arg.look) ovCam.look(arg.dx, arg.dy);
      else ovCam.grab(arg.dx, arg.dy, arg.h, watchWorld);
    } else if (what === 'turn') {
      ovCam.look(arg.dx, arg.dy);
    }
    return true;
  }

  /* The pointer's ray from the camera, for a zoom toward it. */
  const ovRay = new THREE.Vector3();
  function overviewRay(ndcX, ndcY) {
    ovRay.set(ndcX, ndcY, 0.5).unproject(shell.camera).sub(shell.camera.position).normalize();
    return ovRay;
  }

  /*
   * The overview's mouse and fingers, on the whole window while it is open
   * and on nothing otherwise. A mouse: right drag looks round, left drag
   * grabs the ground, the wheel zooms toward the pointer, and a click
   * picks the pilot whose tag is nearest it (a second click on the one
   * picked rides behind them, which together.js decides). Fingers: one
   * drags the ground, two pinch to zoom, twist to turn, and slide up or
   * down together to tilt. Anything a press lands on that is the room's
   * own (a button, the board, the keys sheet, the chip) is left to it.
   */
  const ovPointers = new Map();
  let ovPinch = null;
  let ovDrag = null;
  const ovTap = new THREE.Vector3();
  function ovOwnTarget(e) {
    const t = e.target;
    return Boolean(t && t.closest && t.closest('button, a, input, select, textarea, [role="button"], #tg .ovboard, #tg .ovkeys, #tg .roomchip, #tg .modal, #tg .tg-banner.offers'));
  }
  function ovPickAt(cx, cy) {
    const session = together && together.session;
    if (!ovField || !session) {
      return 0;
    }
    let best = 0;
    let bestD2 = 60 * 60;
    for (const [id, p] of ovField.pilots) {
      if (id === session.you || !session.link.pilots.has(id)) {
        continue;
      }
      ovTap.set(p.lx, p.ly, p.lz).project(shell.camera);
      if (ovTap.z > 1) {
        continue;
      }
      /* The tag stands over the quad: the gap between the two counts. */
      const sx = ((ovTap.x + 1) / 2) * innerWidth;
      const sy = ((1 - ovTap.y) / 2) * innerHeight;
      const dx = cx - sx;
      const dy = cy - sy < -30 ? cy - sy + 30 : (cy - sy < 0 ? 0 : cy - sy);
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = id;
      }
    }
    return best;
  }
  function ovPinchOf() {
    const [a, b] = [...ovPointers.values()];
    return {
      d: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      ang: Math.atan2(b.y - a.y, b.x - a.x),
      my: (a.y + b.y) / 2,
    };
  }
  window.addEventListener('pointerdown', (e) => {
    if (!ovOn || !ovCam || ovOwnTarget(e)) {
      return;
    }
    ovPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ovPointers.size === 2) {
      ovPinch = ovPinchOf();
      ovDrag = null;
    } else if (ovPointers.size === 1) {
      ovDrag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, look: e.button === 2, at: performance.now(), moved: false };
    }
  });
  window.addEventListener('pointermove', (e) => {
    const pt = ovPointers.get(e.pointerId);
    if (!ovOn || !ovCam || !pt) {
      return;
    }
    pt.x = e.clientX;
    pt.y = e.clientY;
    if (ovPointers.size >= 2 && ovPinch) {
      const now = ovPinchOf();
      /* One wheel step is 16 percent of the way: a pinch to twice the
       * spread is the same as about four of them. */
      overviewDo('zoom', { steps: Math.log(now.d / ovPinch.d) / -Math.log(0.84), ray: null });
      let dAng = now.ang - ovPinch.ang;
      if (dAng > Math.PI) dAng -= 2 * Math.PI;
      if (dAng < -Math.PI) dAng += 2 * Math.PI;
      overviewDo('turn', { dx: -dAng / 0.0042, dy: (now.my - ovPinch.my) });
      ovPinch = now;
      return;
    }
    if (!ovDrag) {
      return;
    }
    const dx = e.clientX - ovDrag.x;
    const dy = e.clientY - ovDrag.y;
    ovDrag.x = e.clientX;
    ovDrag.y = e.clientY;
    if (!ovDrag.moved && Math.hypot(e.clientX - ovDrag.x0, e.clientY - ovDrag.y0) < 6) {
      return;
    }
    if (!ovDrag.moved) {
      ovDrag.moved = true;
      overviewDo('grab', { dx: e.clientX - ovDrag.x0 - dx, dy: e.clientY - ovDrag.y0 - dy, h: innerHeight, look: ovDrag.look });
    }
    overviewDo('grab', { dx, dy, h: innerHeight, look: ovDrag.look });
  });
  const ovPointerEnd = (e) => {
    if (!ovPointers.has(e.pointerId)) {
      return;
    }
    ovPointers.delete(e.pointerId);
    const drag = ovDrag;
    if (ovPointers.size < 2) {
      ovPinch = null;
    }
    if (ovPointers.size === 0) {
      ovDrag = null;
    }
    if (e.type === 'pointerup' && ovOn && drag && !drag.moved && !drag.look && performance.now() - drag.at < 600) {
      const id = ovPickAt(e.clientX, e.clientY);
      if (id && together) {
        together.overviewTap(id);
      }
    }
  };
  window.addEventListener('pointerup', ovPointerEnd);
  window.addEventListener('pointercancel', ovPointerEnd);
  window.addEventListener('wheel', (e) => {
    if (!ovOn || !ovCam || ovOwnTarget(e)) {
      return;
    }
    e.preventDefault();
    const lines = e.deltaMode === 1 ? 33 : (e.deltaMode === 2 ? innerHeight : 1);
    const steps = Math.max(-3, Math.min(3, -(e.deltaY * lines) / 100));
    overviewDo('zoom', { steps, ray: overviewRay((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2) });
  }, { passive: false });
  window.addEventListener('contextmenu', (e) => {
    if (ovOn) {
      e.preventDefault();
    }
  });

  /* A stick near its middle is no move at all. */
  function ovDead(v) {
    return Math.abs(v) < 0.08 ? 0 : v;
  }

  /* Once a frame in the overview, before the camera follows it: the keys
   * held, a radio or a pad's sticks, and the pilot kept in view. */
  function overviewFrame(nowWall) {
    const dt = ovLastMs ? nowWall - ovLastMs : 16;
    ovLastMs = nowWall;
    const k = input.keys;
    ovCtl.x = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    ovCtl.z = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    ovCtl.y = (k.has('Space') || k.has('KeyE') ? 1 : 0) - (k.has('KeyC') || k.has('ControlLeft') ? 1 : 0);
    ovCtl.fast = k.has('ShiftLeft') || k.has('ShiftRight');
    ovCtl.turn = 0;
    ovCtl.tilt = 0;
    /* A radio, or a pad, which the game reads as one: the right stick
     * slides, the left climbs and turns, as on a quad. The throttle is
     * read from where it was when the overview opened, so a radio's
     * throttle parked at the bottom does not sink the camera. */
    if (input.source.startsWith('a radio') && input.mapUsable()) {
      const c = input.channels;
      if (ovThrottle0 === null) {
        ovThrottle0 = c.throttle;
      }
      ovCtl.x += ovDead(c.roll);
      ovCtl.z += ovDead(c.pitch);
      ovCtl.turn += ovDead(c.yaw);
      ovCtl.y += ovDead((c.throttle - ovThrottle0) * 2);
    }
    if (ovKeep && (ovCtl.x || ovCtl.z)) {
      ovKeep = false;
      ovCam.release();
    }
    if (ovKeep && ovKeepSeen && !ovCam.keep) {
      ovCam.keepOn(ovKeepAt.x, ovKeepAt.y, ovKeepAt.z);
    }
    ovCam.frame(dt, ovCtl, ovKeep && ovKeepSeen ? ovKeepAt : null, watchWorld);
  }

  /* The trails, drawn after the camera has its pose for the frame. */
  function overviewTrails(nowWall) {
    const session = together && together.session;
    const len = ovTrails.lengths[ovTrail].ms;
    if (!session || !ovField || !mpLivery) {
      ovTrails.hide();
      return;
    }
    const pilots = session.link.pilots;
    ovTrails.update(ovField, nowWall, len,
      (id) => {
        const p = pilots.get(id);
        return p && id !== session.you ? mpLivery(p.avatar, id) : -1;
      },
      (id) => {
        if (!ovPick) return 1;
        if (id === ovPick) return 1.6;
        return ovKeep ? 0.3 : 1;
      },
      (id) => ovField.lapStart(id));
    if (shell.quad.parent && ovTrails.mesh.parent !== shell.quad.parent) {
      shell.quad.parent.add(ovTrails.mesh);
    }
  }

  function watchFrame(nowWall) {
    watchHome.fov = ui.settings.cameraFov;
    if (ovOn && ovCam) {
      overviewFrame(nowWall);
    }
    /* The chase rig stands as far back as the quad is drawn big: see size
     * in src/render/watchcam.js. */
    watchCam.size = simLenToWorld(1);
    const phase = watchCam.frame(shell.camera, watchId && watchSeen ? watchPose : null, nowWall, watchWorld, watchHome);
    if (ovOn && ovTrails) {
      overviewTrails(nowWall);
    }
    shell.camera.up.set(0, 1, 0);
    /* The pilot's own quad waits where it was left, and is in the picture
     * whenever the camera is not inside it. */
    const inside = simLenToWorld(0.3);
    shell.quad.visible = shell.camera.position.distanceToSquared(pCurr) > inside * inside;
    setCameraNear(fpvNear(shell.camera.position));
    if (phase === 'home') {
      document.documentElement.classList.remove('tg-watching');
      shell.quad.visible = false;
      if (ui.screen === 'paused') {
        ui.act('resume');
      }
    }
  }

  /*
   * THE FRAME RECORD a lesson is judged on (src/career/objectives.js), in
   * the world frame, filled in place: the frame loop allocates nothing for
   * it. Read on the rendered position and the sim clock the race uses.
   */
  const careerRec = {
    simMs: 0,
    prev: { x: 0, y: 0, z: 0 },
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    fwd: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
    speed: 0,
    height: 0,
    landed: true,
    gate: null,
    lap: null,
    score: 0,
    dtMs: 16,
  };
  const careerLap = { ms: 0 };
  const careerVec = new THREE.Vector3();
  let careerLastSim = -1;
  function careerFrame(simNow, prev) {
    const r = careerRec;
    r.dtMs = careerLastSim < 0 ? 16 : Math.max(0, simNow - careerLastSim);
    careerLastSim = simNow;
    r.simMs = simNow;
    r.prev.x = prev.x;
    r.prev.y = prev.y;
    r.prev.z = prev.z;
    r.pos.x = pCurr.x;
    r.pos.y = pCurr.y;
    r.pos.z = pCurr.z;
    simPosToThree(stateCurr[4], stateCurr[5], stateCurr[6], careerVec);
    careerVec.applyQuaternion(qSpawn);
    r.vel.x = landed ? 0 : careerVec.x;
    r.vel.y = landed ? 0 : careerVec.y;
    r.vel.z = landed ? 0 : careerVec.z;
    careerVec.set(0, 0, -1).applyQuaternion(qPrev);
    r.fwd.x = careerVec.x;
    r.fwd.y = careerVec.y;
    r.fwd.z = careerVec.z;
    careerVec.set(0, 1, 0).applyQuaternion(qPrev);
    r.up.x = careerVec.x;
    r.up.y = careerVec.y;
    r.up.z = careerVec.z;
    r.landed = landed;
    r.speed = landed ? 0 : speedNow;
    r.height = landed ? 0 : Math.max(0, pCurr.y - view.height(pCurr.x, pCurr.z, pCurr.y - SURFACE_BIAS, pCurr.y));
    r.gate = careerGateNow;
    if (careerLapNow != null) {
      careerLap.ms = careerLapNow;
      r.lap = careerLap;
    } else {
      r.lap = null;
    }
    r.score = score.total();
    career.frame(r);
  }

  /* The named gaps of the world flying, as the career draws and points at
   * them: the sill's middle, the width and height, and the turn about +Y
   * that lays a frame's width along the gap. Once a world. */
  let careerGapsOf = null;
  let careerGapList = [];
  function careerGapZones() {
    if (careerGapsOf !== view) {
      careerGapsOf = view;
      careerGapList = (view && Array.isArray(view.gaps) ? view.gaps : []).map((g) => ({
        name: g.name,
        x: g.x,
        y: g.y,
        z: g.z,
        w: g.hw * 2,
        h: g.h,
        yaw: Math.atan2(-g.az, g.ax),
      }));
    }
    return careerGapList;
  }

  function careerSound(name) {
    if (!ui.settings.sound || !audio.ctx || typeof audio.event !== 'function') {
      return;
    }
    if (name === 'record') {
      audio.event('gate');
      audio.event('gate', audio.ctx.currentTime + 0.14);
      return;
    }
    audio.event(name === 'select' ? 'select' : 'gate');
  }

  const careerShell = {
    enterWorld: careerEnterWorld,
    leaveWorld: careerLeaveWorld,
    fly: careerFly,
    freeze: careerFreeze,
    idle: careerToTitle,
    setFlightMode(m) {
      careerFlightMode = m === 'angle' || m === 'acro' ? m : null;
      syncAngleMode();
    },
    setCamera(c) {
      careerCamera = c === 'chase' ? 'chase' : null;
      careerChaseCam.atMs = -1;
    },
    get camera() {
      return shell.camera;
    },
    get canvas() {
      return shell.canvas;
    },
    scene: () => shell.quad.parent || null,
    gatesPerLap: () => (race && race.gates ? race.gates.length : 0),
    gapZones: careerGapZones,
    groundAt: (x, z) => (view && view.height ? view.height(x, z, 1, 1) : 0),
    stickMode: () => ui.settings.stickMode,
    /* No radio or pad chosen: the briefing names the keys. */
    flyingOnKeys: () => !input.firstGamepad(),
    uiScreen: () => ui.screen,
    /* The Steam edition reports presence and results to Steam; here there
     * is no platform to tell, and the controller is the same file, so these
     * are the two calls it makes that this edition answers with nothing.
     * `achievements` is left out on purpose: the hub shows no button for it. */
    presence: () => {},
    onResult: () => {},
    /* The career is kept in this browser alone (src/career/progress.js);
     * the Steam edition's is kept with the account, and says so. */
    cloudSave: false,
    sound: careerSound,
    /* Steam edition: career. The lessons flown in the real maps: is a map
     * in this build, and a map or track from the board by its id (the
     * Steam edition answers the board's reads from its shelf, see
     * src/share/board.js), each with a fallback lesson when the answer is
     * no. */
    hasMap: (id) => MAPS.some((m) => m.id === id),
    boardDocument: (kind, id) => (kind === 'track' ? fetchTrackDocument(id) : fetchMapDocument(id))
      .then((payload) => (payload && payload.document ? payload.document : payload)),
    /* Steam edition: career. The Paint Shop's pick, on the quad at once;
     * the renderer reads the same key at boot (src/render/livery.js). */
    setLivery: (l) => shell.setLivery(l),
  };
  /*
   * The career is fetched when a pilot first opens it, not at boot: it is
   * menu and lesson code, about 250 kB, and a page that never starts a
   * lesson should not pay for it. Every hook above asks `career` and finds
   * null until then, which is the same as not being in the career.
   */
  let careerLoading = null;
  function loadCareer() {
    if (!careerLoading) {
      careerLoading = import('./career/controller.js').then((m) => {
        career = m.createCareer(careerShell);
        return career;
      }).catch((e) => {
        careerLoading = null;
        throw e;
      });
    }
    return careerLoading;
  }
  ui.onCareer = (action) => {
    if (action === 'career') {
      loadCareer().then((c) => c.openHub());
    } else if (career && action === 'career-briefing') {
      career.briefing();
    } else if (career && action === 'career-hub') {
      career.backToHub();
    } else if (career && action === 'career-title') {
      career.leave();
    }
  };
  /* For the shots and smoke tests: open the career, a lesson's briefing, or
   * fly it, without a hand on the keys. Harness only. */
  window.__career = {
    hub: () => loadCareer().then((c) => c.openHub()),
    open: (id) => loadCareer().then((c) => c.openLessonById(id)),
    /* The skill tree (on a part, by id), the fork and Set my level. */
    tree: (part) => loadCareer().then((c) => c.openTree(part)),
    fork: () => loadCareer().then((c) => c.openFork()),
    level: () => loadCareer().then((c) => c.openLevel()),
    paint: () => loadCareer().then((c) => c.openPaint()),
    fly: () => career.fly(),
    state: () => (career ? career.state() : null),
    status: () => (career ? career.status() : null),
    leave: () => career.leave(),
    /* The keycaps in a pad player's hands or a keyboard player's. */
    hands: (h) => loadCareer().then((c) => c.hands(h)),
    /* The chase branch draws the airframe, which a parked harness camera
     * (__setCam) otherwise hides with the lens's own rule. The career card
     * (scripts/career-card.js) needs the quad in the picture. */
    chase: (on) => {
      careerCamera = on ? 'chase' : null;
      return careerCamera;
    },
    /* Stops the plant where it is, as the pause menu does, so a capture's
     * camera can be set from where the quad will still be when it draws. */
    pause: () => {
      careerFreeze('pause');
      return mode;
    },
    camera: () => ({
      cam: shell.camera.position.toArray().map((v) => +v.toFixed(2)),
      quad: shell.quad.position.toArray().map((v) => +v.toFixed(2)),
      visible: shell.quad.visible,
      parent: shell.quad.parent ? shell.quad.parent.type : null,
      chase: careerCamera,
      mode,
      fov: shell.camera.fov,
    }),
  };

  window.__budget = (name) => measureBudget(shell, view, { view: name });
  /* Which loop paces the frames now, for the probes that check the Frame
   * pacing setting and the URL force against the loop actually running. */
  window.__loopNow = () => (timerLoop ? 'timer' : 'raf');
  applyLoopMode();
  timerOn = true;
  if (timerPacesNow()) {
    frameTimer();
  } else {
    requestAnimationFrame(frame);
  }
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

